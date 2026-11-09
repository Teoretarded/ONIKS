/* A small procedural coast that follows the Map contract (game/ARCHITECTURE.md), for when world/maps.js is not
   there or fails: 100 x 100 km, 100 m node grid, land to the north-east behind a bluff, a spit, islands. */

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) {
  const r = rng(seed), P = new Uint16Array(512), G = new Float32Array(256);
  const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  for (let i = 0; i < 256; i++) G[i] = r() * 2 - 1;
  const sm = t => t * t * (3 - 2 * t);
  const n2 = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = sm(xf), v = sm(zf);
    const a = G[P[P[xi & 255] + (zi & 255)]], b = G[P[P[(xi + 1) & 255] + (zi & 255)]], c = G[P[P[xi & 255] + ((zi + 1) & 255)]], d = G[P[P[(xi + 1) & 255] + ((zi + 1) & 255)]];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  return (x, z, oct) => { let s = 0, a = .5, f = 1; for (let i = 0; i < (oct || 4); i++) { s += a * n2(x * f + i * 17.3, z * f - i * 9.1); f *= 2.03; a *= .5; } return s; };
}

export function stubMap(o) {
  o = o || {};
  const W = o.W || 100000, H = o.H || 100000, cell = o.cell || 100;
  const cols = Math.round(W / cell) + 1, rows = Math.round(H / cell) + 1;
  const fbm = makeNoise(o.seed || 1337), fbm2 = makeNoise((o.seed || 1337) + 7);
  const heights = new Float32Array(cols * rows);
  const x0 = -W / 2, z0 = -H / 2;
  // the coast runs from the north-west to the south-east; land on the north-east side
  const ax = Math.SQRT1_2, az = -Math.SQRT1_2;               // across-coast axis (toward the sea: south-west)
  for (let j = 0; j < rows; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * cell;
      const along = x * az * -1 + z * ax, across = x * ax + z * az;     // across > 0: toward the sea
      const wob = 5200 * fbm(x / 26000, z / 26000, 4) + 1200 * fbm(x / 6000, z / 6000, 3);
      const d = across - 4000 + wob;                                   // < 0 land
      let h;
      if (d < 0) {
        const inland = -d;
        const bluff = 62 * (1 - Math.exp(-inland / 380));
        const hills = 420 * Math.max(0, fbm2(x / 18000, z / 18000, 5) + .15) * (1 - Math.exp(-inland / 9000));
        const ridge = 180 * Math.pow(Math.max(0, 1 - Math.abs(fbm(x / 9000 + 3, z / 9000 - 2, 3)) * 3.2), 2) * (1 - Math.exp(-inland / 3000));
        h = 1.5 + bluff + hills + ridge + 8 * fbm(x / 1500, z / 1500, 3);
      } else {
        const shelf = -Math.min(160, d * .012 + 18 * (1 - Math.exp(-d / 250)));
        h = shelf + 14 * fbm(x / 7000, z / 7000, 3);
        if (h > -2) h = -2 - (d < 300 ? 0 : 1);
      }
      // the spit (Krasnaya Kosa): a low sand arm curling south-west out of the coast
      const sx = x - 9000, sz = z + 6000, sa = Math.atan2(sx, sz);
      const sd = Math.abs(Math.hypot(sx, sz) - 7000), onArc = sa > -2.6 && sa < -.4;
      if (onArc && sd < 420) h = Math.max(h, 3.5 * (1 - sd / 420) + 1.2 * fbm(x / 800, z / 800, 2) + .5);
      // islands off the coast
      for (const [ix, iz, r, hh] of [[-18000, -21000, 1900, 70], [-26000, -9000, 900, 38], [4000, -30000, 1300, 55]]) {
        const q = Math.hypot(x - ix, z - iz) / r + .25 * fbm(x / 1200, z / 1200, 2);
        if (q < 1) h = Math.max(h, hh * Math.pow(1 - q, .7) - 4);
      }
      heights[j * cols + i] = h;
    }
  }
  const inv = 1 / cell, cm = cols - 1, rm = rows - 1;
  function h(x, z) {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    fx = fx < 0 ? 0 : fx > cm ? cm : fx; fz = fz < 0 ? 0 : fz > rm ? rm : fz;
    const i = Math.min(cm - 1, fx | 0), j = Math.min(rm - 1, fz | 0), u = fx - i, v = fz - j, k = j * cols + i;
    return (heights[k] + (heights[k + 1] - heights[k]) * u) * (1 - v) + (heights[k + cols] + (heights[k + cols + 1] - heights[k + cols]) * u) * v;
  }
  const slope = (x, z) => Math.min(1, Math.hypot(h(x + 50, z) - h(x - 50, z), h(x, z + 50) - h(x, z - 50)) / 100);
  // the battery: the first land point behind the bluff along the across-coast axis through the origin
  let bx = 0, bz = 0;
  for (let s = -30000; s < 30000; s += 50) { const x = -ax * s, z = -az * s; if (h(x, z) > 25) { bx = x; bz = z; break; } }
  bx -= ax * 400; bz -= az * 400;
  return {
    id: 'stub', name: 'Stub Coast', W, H, cell, cols, rows, heights, h, water: (x, z) => h(x, z) < 0, slope,
    places: [{ name: 'Krasnaya Kosa', x: 9000 - 7000 * .8, z: -6000 - 7000 * .6, kind: 'cape' }, { name: 'Battery', x: bx, z: bz, kind: 'town' }],
    objectives: [{ id: 'OBJ 01', name: 'Battery bluff', x: bx, z: bz, r: 600, kind: 'radar_hill' }],
    spawns: { coast: { x: bx, z: bz, r: 800, hdg: Math.atan2(ax, az) }, fleet: { x: bx + ax * 42000, z: bz + az * 42000, r: 3000, hdg: Math.atan2(-ax, -az) } },
    replenish: { x: bx + ax * 48000, z: bz + az * 48000, r: 2000 },
    roads: [],
    weather: { kind: 'calm', wind: [3.5, -2], sea: .3 },
    time: 'night',
  };
}
