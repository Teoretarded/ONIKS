/* A small self-contained test coast following the Map contract (game/ARCHITECTURE.md). Used by the sim tests and
   by simview when game/src/world/maps.js is not available. Land to the east, sea to the west; a bluff, an inland
   ridge, a bay with a port, a cape with a lighthouse, three islands, a coastal road. Deterministic. */

function hash(i, j) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v - .5;
}
function fbm(x, z) { let s = 0, a = 1, f = 1; for (let o = 0; o < 4; o++) { s += a * vnoise(x * f, z * f); f *= 2.07; a *= .5; } return s; }

export function stubMap(opts) {
  opts = opts || {};
  const W = opts.W || 120000, H = opts.H || 110000, cell = opts.cell || 200;
  const cols = Math.round(W / cell) + 1, rows = Math.round(H / cell) + 1;
  const coastX = z => 12000 + 9000 * fbm(z / 45000 + 3.1, 1.7) + 8000 * Math.exp(-(((z - 22000) / 7000) ** 2)) - 9000 * Math.exp(-(((z + 25000) / 4500) ** 2));
  const islands = [[-10000, 32000, 2600], [-24000, -8000, 1900], [-2000, -42000, 3200]];
  const heights = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const z = -H / 2 + j * cell, cxz = coastX(z);
    for (let i = 0; i < cols; i++) {
      const x = -W / 2 + i * cell, d = x - cxz;
      let h;
      if (d > 0) {
        h = 55 * (1 - Math.exp(-d / 500)) + d * .006 + 170 * Math.exp(-(((d - 7000) / 2600) ** 2)) + 240 * Math.max(0, fbm(x / 16000, z / 16000) + .15) + 12 * fbm(x / 1500, z / 1500);
        if (d < 150) h = Math.min(h, d * .2);
      } else {
        h = -(6 + (-d) * .028 + 30 * fbm(x / 9000, z / 9000));
        if (h < -700) h = -700;
      }
      for (const [ix, iz, ir] of islands) {
        const q = Math.hypot(x - ix, z - iz) / ir;
        if (q < 1.6) h = Math.max(h, 110 * (1 - q * q) + 20 * fbm(x / 800, z / 800) - (q > 1 ? 40 * (q - 1) : 0));
      }
      heights[j * cols + i] = h;
    }
  }
  const x0 = -W / 2, z0 = -H / 2, inv = 1 / cell, cm = cols - 1, rm = rows - 1;
  function h(x, z) {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    if (fx < 0) fx = 0; else if (fx > cm) fx = cm;
    if (fz < 0) fz = 0; else if (fz > rm) fz = rm;
    let i = fx | 0, j = fz | 0; if (i >= cm) i = cm - 1; if (j >= rm) j = rm - 1;
    const u = fx - i, v = fz - j, o = j * cols + i;
    const a = heights[o], b = heights[o + 1], c = heights[o + cols], d = heights[o + cols + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  const water = (x, z) => h(x, z) < 0;
  function slope(x, z) {
    const e = cell * .5, gx = (h(x + e, z) - h(x - e, z)) / (2 * e), gz = (h(x, z + e) - h(x, z - e)) / (2 * e);
    return Math.min(1, Math.hypot(gx, gz));
  }
  const road = [];
  for (let z = -H / 2 + 3000; z <= H / 2 - 3000; z += 2500) road.push([coastX(z) + 3500, z]);
  const spawnC = { x: coastX(0) + 15000, z: 0, r: 3000, hdg: -Math.PI / 2 };
  const roads = [
    road,
    [[spawnC.x, spawnC.z], [spawnC.x - 6000, 1500], [coastX(1500) + 3500, 1500]],
    [[spawnC.x, spawnC.z], [spawnC.x + 8000, 6000], [spawnC.x + 14000, 7000]],
    [[coastX(20000) + 3500, 20000], [coastX(22000) + 900, 22000]],
    [[spawnC.x, spawnC.z], [spawnC.x + 5000, -14000], [spawnC.x + 9000, -30000]],
  ];
  const objectives = [
    { id: 'port', name: 'Port Kamensk', x: coastX(22000) + 1200, z: 22000, r: 2500, kind: 'port' },
    { id: 'depot', name: 'Depot 7', x: spawnC.x + 13000, z: 7000, r: 2000, kind: 'depot' },
    { id: 'hill', name: 'Hill 212', x: coastX(-6000) + 7000, z: -6000, r: 2000, kind: 'radar_hill' },
    { id: 'light', name: 'Mys Svet', x: coastX(-25000) + 600, z: -25000, r: 1500, kind: 'lighthouse' },
    { id: 'air', name: 'Airfield', x: spawnC.x + 9000, z: -30000, r: 3000, kind: 'airfield' },
  ];
  const places = [
    { name: 'Kamensk', x: coastX(22000) + 2500, z: 23500, kind: 'town' },
    { name: 'Mys Svet', x: coastX(-25000), z: -25000, kind: 'cape' },
    { name: 'Guba Tikhaya', x: coastX(22000) - 3000, z: 22000, kind: 'bay' },
    { name: 'O. Dalniy', x: -10000, z: 32000, kind: 'island' },
    { name: 'O. Kruglyy', x: -24000, z: -8000, kind: 'island' },
    { name: 'O. Yuzhnyy', x: -2000, z: -42000, kind: 'island' },
    { name: 'Hill 212', x: coastX(-6000) + 7000, z: -6000, kind: 'peak' },
  ];
  return {
    id: 'stub', name: 'Test Coast', W, H, cell, cols, rows, heights, h, water, slope,
    places, objectives, roads,
    spawns: { coast: spawnC, fleet: { x: -44000, z: 2000, r: 6000, hdg: Math.PI / 2 } },
    replenish: { x: -55000, z: -46000, r: 5000 },
    weather: opts.weather || { kind: 'rain', wind: [4, 1.5], sea: .35 },
    time: 'night',
  };
}
