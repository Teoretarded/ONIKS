/* Belye Shkhery: a glaciated archipelago. A granite mainland in the south-east breaks up into dozens of
   islands, from a 20 km island to bare skerries; rounded rock domes, sounds and deep channels between,
   reefs just under the surface. The north-west is open sea. */
import { carve } from '../grid.js';
import { ss } from '../noise.js';
import { labelLand } from '../lines.js';
import { shorePoint, roughness, coastSpawn, fleetSpawn, bestSite, allLand } from './common.js';

export default {
  plan(ctx, P) {
    const { fbm, ridged, billow } = ctx.noise;
    const d = P.data;
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell;
      d[j * P.cols + i] = base(ctx, x, z);
    }
    // glacial grooves: the drainage carves sounds and valleys running NW-SE
    carve(d, P.cols, P.rows, 3.5, 0.45, 60, h => ss(0, 25, h), (i, j) => 2 * fbm(i / 6, j / 6, 2));
  },

  fine(ctx, x, z, raw, cell) {
    const { n2, fbm, billow } = ctx.noise;
    let h = raw;
    // bare rock: domes and knobs; near the waterline the knobs make skerries and reefs
    const near = 1 - ss(0, 30, Math.abs(h));
    h += 5 * fbm(x / 1100, z / 1100, 4) + near * 7 * (billow(x / 700 + 3, z / 700, 3) * 2 - 0.7);
    if (h > 0) h += ss(0, 80, h) * 9 * fbm(x / 300, z / 300, 2);
    return h;
  },

  layout(ctx, A) {
    const P = A.P;
    // islands: label the land and name the largest ones
    const { lab, sizes } = labelLand(P.data, P.cols, P.rows);
    const cent = sizes.map(() => [0, 0, 0, -1e9, 0, 0]);
    for (let k = 0; k < lab.length; k++) {
      const L = lab[k]; if (!L) continue;
      const [x, z] = A.xz(k), c = cent[L];
      c[0] += x; c[1] += z; c[2]++;
      if (P.data[k] > c[3]) { c[3] = P.data[k]; c[4] = x; c[5] = z; }
    }
    const isl = [];
    for (let L = 1; L < sizes.length; L++) { const c = cent[L]; isl.push({ L, n: c[2], x: c[0] / c[2], z: c[1] / c[2], top: c[3], tx: c[4], tz: c[5] }); }
    isl.sort((a, b) => b.n - a.n);
    const mainland = isl[0];
    const NAMES = ['Ostrov Bolshoy', 'Ostrov Kruglyi', 'Ostrov Gagarii', 'Ostrov Kresty', 'Ostrov Sosnovy', 'Ostrov Lopatka', 'Ostrov Sredny', 'Luda Kamennaya', 'Luda Plosky', 'Ostrov Olenii'];
    const places = [];
    let ni = 0;
    for (const s of isl.slice(1)) {
      if (ni >= NAMES.length || s.n < 12) break;
      if (places.some(p => Math.hypot(p.x - s.tx, p.z - s.tz) < 9000)) continue;
      places.push({ name: NAMES[ni++], kind: 'island', x: s.tx, z: s.tz, road: false, _isl: s });
    }
    const big = places[0]._isl;
    // coast spawn on the mainland, facing the open water to the north-west
    const coast = coastSpawn(A, [-10000, -62000, 62000, 20000], { maxCoast: 3000, wantRise: 150, score: (x, z) => lab[A.idx(x, z)] === mainland.L ? 2 - Math.hypot(x - 22000, z + 22000) / 15000 + Math.min(A.h(x, z), 60) / 30 : -Infinity });
    // port: the most sheltered gentle mainland shore
    const port = bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || lab[A.idx(x, z)] !== mainland.L || A.coastDist(x, z) > 300) return -Infinity;
      return A.shelter(x, z, 7000) * 3 - roughness(A, x, z, 500) * 10 - A.h(x, z) / 40;
    }, { stride: 2, jitter: 0.1, seed: 2 });
    // lighthouse on an outer skerry facing the open sea (north-west)
    const lh = bestSite(A, (x, z) => {
      if (!A.isLand(x, z)) return -Infinity;
      const L = lab[A.idx(x, z)]; if (L === mainland.L || sizes[L] > 60) return -Infinity;
      return A.seaFrac(x, z, 3000) * 2 + (z - x) / 40000;
    }, { stride: 2, seed: 3 });
    // radar hill: the highest summit on the big island
    const rh = [big.tx, big.tz, big.top];
    // airfield: the flattest stretch on the mainland or the big island
    const af = bestSite(A, (x, z) => {
      if (!allLand(A, x, z, 2200)) return -Infinity;
      return -roughness(A, x, z, 1400) * 60 - A.h(x, z) / 100;
    }, { stride: 2, seed: 5 });
    const dep = bestSite(A, (x, z) => {
      if (!allLand(A, x, z, 1000) || lab[A.idx(x, z)] !== mainland.L || A.coastDist(x, z) < 3000) return -Infinity;
      return -roughness(A, x, z, 500) * 15 - Math.hypot(x - port.x, z - port.z) / 15000;
    }, { stride: 2, seed: 7 });
    const fleet = fleetSpawn(A, -52000, 52000, 12000, [0, 0], { clear: 6000, depth: -40 });
    places.push(
      { name: 'Keret', kind: 'town', x: port.x, z: port.z },
      { name: 'Shkhernoye', kind: 'village', x: dep.x, z: dep.z },
      { name: 'Guba Tikhaya', kind: 'bay', x: port.x + 0, z: port.z + 0, road: false },
      { name: `Gora Belaya ${Math.round(rh[2])}`, kind: 'peak', x: rh[0], z: rh[1], road: false },
    );
    // the bay label goes on the water in front of the port
    { const b = places.find(p => p.name === 'Guba Tikhaya'); const t = A.seaward(port.x, port.z); b.x = port.x + Math.sin(t) * 2500; b.z = port.z + Math.cos(t) * 2500; }
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Keret', kind: 'port', x: port.x, z: port.z, r: 1000 },
      { id: 'OBJ 02', name: `Radar hill · ${Math.round(rh[2])}`, kind: 'radar_hill', x: rh[0], z: rh[1], r: 900 },
      { id: 'OBJ 03', name: 'Lighthouse · Luda Dalnyaya', kind: 'lighthouse', x: lh.x, z: lh.z, r: 500 },
      { id: 'OBJ 04', name: 'Airfield · Sosnovets', kind: 'airfield', x: af.x, z: af.z, r: 1400 },
      { id: 'OBJ 05', name: 'Depot · Shkhernoye', kind: 'depot', x: dep.x, z: dep.z, r: 800 },
    ];
    places.push({ name: 'Luda Dalnyaya', kind: 'island', x: lh.x, z: lh.z, road: false }, { name: 'Sosnovets', kind: 'village', x: af.x + 2600, z: af.z + 900 });
    for (const p of places) delete p._isl;
    return {
      places, objectives,
      spawns: { coast, fleet },
      replenish: { x: -60000, z: 22000, r: 5000 },
      pads: [
        { x: coast.x, z: coast.z, r: 450, r1: 1100 },
        { x: rh[0], z: rh[1], r: 220, r1: 550 },
        { x: dep.x, z: dep.z, r: 300, r1: 700 },
        { x: af.x, z: af.z, r: 1300, r1: 2200 },
        { x: port.x, z: port.z, r: 180, r1: 450, quay: true },
        { x: lh.x, z: lh.z, r: 80, r1: 200 },
      ],
      roadOpts: { ford: -3, bridge: 20 },
    };
  },
};

/* land potential: open sea in the north-west, a broad belt of islands across the middle, a granite
   mainland in the south-east corner and one big island; heights are rounded domes, depths grow away
   from the land */
function base(ctx, x, z) {
  const { fbm, billow } = ctx.noise;
  const wx = x + 6000 * fbm(x / 30000 + 2, z / 30000, 3), wz = z + 6000 * fbm(x / 30000 - 5, z / 30000 + 1, 3);
  const u = (wx - wz) * Math.SQRT1_2;                             // along the NW -> SE diagonal
  const trend = -0.44 + 0.31 * ss(-62000, -22000, u) + 0.95 * ss(38000, 80000, u);
  // islands: glacially grooved along NW-SE (stretched noise in a rotated frame)
  const gx = (x - z) * Math.SQRT1_2, gz = (x + z) * Math.SQRT1_2;
  const med = fbm(gx / 13000 + 8, gz / 6500 - 3, 5);
  const small = fbm(gx / 3800, gz / 2600 + 5, 4);
  // the big island
  const bx = gx - (-9000), bz = gz - 4000;
  const big = 0.42 * Math.exp(-((bx / 13000) ** 2 + (bz / 5000) ** 2));
  const cluster = 0.2 * fbm(x / 26000 + 3.7, z / 26000 - 8.2, 3);      // clusters of big islands, open sounds between
  const pot = trend + big + cluster + 0.75 * med + 0.26 * small;
  if (pot > 0) {
    const dome = 1 - billow(x / 6000 + 1, z / 6000, 4);
    return 2 + 330 * Math.pow(pot, 1.1) * (0.55 + 0.65 * dome);
  }
  // sea: reefs near the surface close to land, channels 40-120 m, open water deeper
  const open = 1 - ss(-60000, -25000, u);
  return pot * (170 + 260 * open) - 3 - 70 * open * ss(0.1, 0.6, -pot);
}
