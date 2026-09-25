/* Proliv Uzky: two coasts face each other across a strait that opens to a sea at each end. The west
   shore is high and cliffed (hills to ~450 m), the east shore low with beaches and a coastal plain.
   A rocky island splits the narrows into two channels. */
import { blur, carve } from '../grid.js';
import { ss, sat } from '../noise.js';
import { shorePoint, roughness, coastSpawn, fleetSpawn, bestSite, allLand } from './common.js';

// smooth minimum (keeps the land potential close to a signed distance)
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const ISL = { z: -17000, a: 5600, b: 2300, rot: 1.3 };
// small islands in the open seas at both ends: [x, z, r]
const ISLETS = [[-36000, 57000, 2200], [-27000, 61000, 1200], [31000, 63000, 1800], [-22000, -61000, 1900], [38000, -63000, 1500], [45000, -58000, 900]];

function axis(ctx, z) { return 2500 * ctx.noise.fbm(z / 32000 + 4.1, 2.2, 3) - 1500 * Math.sin(z / 30000); }
function halfW(z) { return 5200 + 9000 * ss(0, 40000, Math.abs(z - 2000)) ** 1.3; }

/* signed land potential (m, ~ distance to the shore; > 0 on land) for the west and east masses */
function pots(ctx, x, z) {
  const { fbm } = ctx.noise;
  const wx = x + 5500 * fbm(x / 20000 + 1, z / 20000, 3) + 1500 * fbm(x / 5000 + 3, z / 5000, 2), wz = z + 5500 * fbm(x / 20000 - 7, z / 20000 + 3, 3) + 1500 * fbm(x / 5000 - 4, z / 5000 + 1, 2);
  // bays and headlands, gentler along the narrows
  const rag = (3500 * fbm(x / 11000 + 9, z / 11000 - 4, 3) + 1200 * fbm(x / 3500, z / 3500 + 2, 3)) * (0.4 + 0.6 * ss(6000, 28000, Math.abs(wz - 2000)));
  const xs = axis(ctx, z), hw = halfW(wz);
  // west: the strait shore; a north coast with a deep bay, falling away NW; a south coast running SW
  const w1 = (xs - hw) - wx;
  const w2 = (49000 + 0.30 * (wx + 6000) + 9000 * fbm(wx / 26000 + 2.2, 7.7, 3) - 11000 * Math.exp(-(((wx + 34000) / 9000) ** 2))) - wz;
  const w3 = wz - (-51000 - 0.16 * (wx + 6000) + 8000 * fbm(wx / 24000 - 1.3, 3.1, 3));
  let west = smin(smin(w1, w2, 6000), w3, 6000) + rag;
  // east: lower; the north coast turning NE, a long south shore with a wide bay
  const e1 = wx - (xs + hw);
  const e2 = (56000 - 0.22 * (wx - 6000) + 8000 * fbm(wx / 22000 + 5.5, 1.9, 3)) - wz;
  const bay = 12000 * Math.exp(-(((wx - 30000) / 10000) ** 2));
  const e3 = wz - (-57000 + 0.28 * (wx - 6000) + bay + 6000 * fbm(wx / 20000 + 8.1, 4.4, 3));
  let east = smin(smin(e1, e2, 7000), e3, 7000) + rag * 1.2;
  // the island, and channels at least 2.6 km wide on both sides of it
  const dx = x - axis(ctx, ISL.z), dz = z - ISL.z, c = Math.cos(ISL.rot), s = Math.sin(ISL.rot);
  const u = (dx * c - dz * s) / ISL.a, v = (dx * s + dz * c) / ISL.b;
  let isl = (1 - Math.sqrt(u * u + v * v)) * ISL.b + 500 * fbm(x / 2500, z / 2500, 2);
  for (const [ix, iz, ir] of ISLETS) { const ex = (x - ix) * 0.75, ez = (z - iz) * 1.25; const di = ir - Math.hypot(ex + ez * 0.4, ez) + 0.55 * ir * fbm(x / 1400 + ix / 1e4, z / 1400, 3); if (di > isl) isl = di; }
  // the strait itself never closes: at least 3.5 km of water each side of its axis
  if (Math.abs(z) < 50000) { west = Math.min(west, (xs - 3500) - x); east = Math.min(east, x - (xs + 3500)); }
  west = Math.min(west, -isl - 2600); east = Math.min(east, -isl - 2600);
  return [west, east, isl];
}

export default {
  plan(ctx, P) {
    const { fbm, ridged } = ctx.noise;
    const d = P.data, n = P.cols * P.rows;
    const cl = new Float32Array(n);           // cliffiness 0..1 (west high, east low)
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell, k = j * P.cols + i;
      const [w, e, isl] = pots(ctx, x, z);
      const f = Math.max(w, e, isl);
      let h;
      if (f > 0) {
        if (w >= e && w >= isl) {
          const hills = 170 + 300 * ridged(x / 18000 + 2, z / 18000, 5) + 60 * fbm(x / 5000, z / 5000, 3);
          h = 4 + hills * ss(0, 9000, f) ** 0.7;
          cl[k] = 1;
        } else if (e >= isl) {
          const hills = 60 + 200 * Math.max(0, fbm(x / 22000 + 5, z / 22000, 4) + 0.25) + 25 * fbm(x / 4000, z / 4000, 3);
          h = 2 + hills * ss(0, 14000, f) ** 0.9 + f * 0.0008;
          cl[k] = 0.25 * ss(-0.1, 0.4, fbm(x / 9000, z / 9000 + 8, 2));
        } else {
          h = 8 + 110 * ss(0, ISL.b, f) ** 0.6;
          cl[k] = 0.9;
        }
      } else {
        const dist = -f;                                       // m from the nearest shore (approx.)
        const inStrait = 1 - ss(38000, 56000, Math.abs(z));     // the strait vs the open seas
        const floor = -95 - 40 * fbm(x / 20000, z / 20000, 3) ;
        const open = -140 - 380 * ss(45000, 70000, Math.abs(z)) - 60 * ss(40000, 60000, Math.abs(x));
        const deep = floor * inStrait + open * (1 - inStrait);
        h = Math.max(deep, -(6 + dist * 0.028)) - 2;
      }
      d[k] = h;
    }
    carve(d, P.cols, P.rows, 5.5, 0.45, 120, h => ss(0, 60, h), (i, j) => 3 * fbm(i / 7, j / 7, 2));
    blur(cl, P.cols, P.rows, 2, 2);
    ctx.aux = { cl };
  },

  shape(ctx, x, z, raw) {
    if (raw <= 0) return raw;
    const cl = ctx.sampleP(ctx.aux.cl, x, z);
    if (cl < 0.02) return raw;
    const bh = 30 + 45 * (0.5 + 0.5 * ctx.noise.n2(x / 3000, z / 3000 + 7));
    const bl = bh * (1 - Math.exp(-raw / 6)) + raw * Math.max(0.4, 1 - bh / 300);
    return raw + (bl - raw) * cl;
  },

  fine(ctx, x, z, raw, cell) {
    const { n2, fbm, ridged } = ctx.noise;
    let h = raw;
    if (h > -30) {
      const land = ss(-3, 10, h);
      h += land * (4 + h * 0.06) * fbm(x / 800, z / 800, 4) + land * 12 * ss(80, 300, h) * (ridged(x / 3000, z / 3000, 3) - 0.4);
      if (h < 0) h += 0.8 * fbm(x / 600, z / 600, 2);
    } else h += 3 * fbm(x / 3000, z / 3000, 2);
    return this.shape(ctx, x, z, h);
  },

  layout(ctx, A) {
    const places = [];
    const ax0 = axis(ctx, 0);
    // capes at the ends of both shores, the narrows, the island
    const capeAt = (x, z, R, name) => {
      const c = bestSite(A, (px, pz) => A.isLand(px, pz) && A.coastDist(px, pz) < 300 ? A.seaFrac(px, pz, 2500) * 3 - Math.hypot(px - x, pz - z) / R : -Infinity, { box: [x - R, z - R, x + R, z + R], stride: 1, edge: 800 });
      if (c) places.push({ name, kind: 'cape', x: c.x, z: c.z, road: false });
      return c;
    };
    const cNW = capeAt(-9000, 40000, 9000, 'Mys Voronii');
    const cSW = capeAt(-9000, -40000, 9000, 'Mys Maly');
    const cNE = capeAt(10000, 45000, 9000, 'Mys Severny');
    const cSE = capeAt(12000, -48000, 9000, 'Mys Kamenny');
    places.push({ name: 'Proliv Uzky', kind: 'strait', x: ax0 - 3500, z: -9000, road: false });
    const isl = A.peakNear(axis(ctx, ISL.z), ISL.z, 4000);
    places.push({ name: 'Ostrov Sredny', kind: 'island', x: isl[0], z: isl[1], road: false });
    // ports: sheltered gentle shores on each side of the strait
    const portOn = (side, zlo, zhi, seed) => bestSite(A, (x, z) => {
      if (!A.isLand(x, z) || A.coastDist(x, z) > 300 || (side < 0 ? x > ax0 - 2000 : x < ax0 + 2000)) return -Infinity;
      return -roughness(A, x, z, 500) * 10 - A.h(x, z) / 40 + A.shelter(x, z, 9000) * 2;
    }, { box: [side < 0 ? -58000 : ax0, zlo, side < 0 ? ax0 : 58000, zhi], stride: 2, jitter: 0.2, seed });
    const pW = portOn(-1, 12000, 45000, 1), pE = portOn(1, -45000, -8000, 2);
    // radar hill: the high west hills near the narrows
    const rh = A.peakNear(-16000, 0, 16000);
    // depot inland west; airfield on the east plain
    const dep = bestSite(A, (x, z) => {
      if (!allLand(A, x, z, 1500) || A.coastDist(x, z) < 5000 || x > -15000) return -Infinity;
      return -roughness(A, x, z, 600) * 20 - Math.hypot(x - pW.x, z - pW.z) / 20000;
    }, { stride: 2, seed: 4 });
    const af = bestSite(A, (x, z) => {
      if (!allLand(A, x, z, 2500) || x < 15000) return -Infinity;
      return -roughness(A, x, z, 1500) * 60 - A.h(x, z) / 200;
    }, { stride: 2, seed: 6 });
    const lh = bestSite(A, (x, z) => A.isLand(x, z) && A.coastDist(x, z) < 300 && Math.hypot(x - isl[0], z - isl[1]) < 5000 ? A.seaFrac(x, z, 1200) - (z - isl[1]) / 8000 : -Infinity,
      { box: [isl[0] - 5000, isl[1] - 5000, isl[0] + 5000, isl[1] + 5000], stride: 1, edge: 0 });
    const coast = coastSpawn(A, [-40000, -26000, -7000, 26000], { maxCoast: 3500, wantRise: 300 });
    const fleet = fleetSpawn(A, 0, -60000, 8000, [0, 0], { clear: 6000, depth: -60 });
    places.push(
      { name: 'Zapadny', kind: 'town', x: pW.x, z: pW.z },
      { name: 'Vostochny', kind: 'town', x: pE.x, z: pE.z },
      { name: 'Kurgany', kind: 'village', x: dep.x, z: dep.z },
      { name: 'Stepnoye', kind: 'village', x: af.x + 3000, z: af.z - 2000 },
      { name: `Gora Dozornaya ${Math.round(rh[2])}`, kind: 'peak', x: rh[0], z: rh[1], road: false },
    );
    // a few more villages on each shore for the road network
    const vil = (box, name, seed) => { const v = bestSite(A, (x, z) => allLand(A, x, z, 800) ? -roughness(A, x, z, 500) * 10 - A.coastDist(x, z) / 8000 : -Infinity, { box, stride: 3, jitter: 1, seed }); if (v) places.push({ name, kind: 'village', x: v.x, z: v.z }); };
    vil([-55000, 20000, -20000, 38000], 'Beregovoye', 11);
    vil([-55000, -40000, -25000, -20000], 'Lesnoye', 12);
    vil([20000, 25000, 55000, 42000], 'Solnechny', 13);
    vil([30000, -35000, 55000, -15000], 'Priozyorny', 14);
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Zapadny', kind: 'port', x: pW.x, z: pW.z, r: 1100 },
      { id: 'OBJ 02', name: 'Port · Vostochny', kind: 'port', x: pE.x, z: pE.z, r: 1100 },
      { id: 'OBJ 03', name: 'Lighthouse · Ostrov Sredny', kind: 'lighthouse', x: lh.x, z: lh.z, r: 600 },
      { id: 'OBJ 04', name: `Radar hill · ${Math.round(rh[2])}`, kind: 'radar_hill', x: rh[0], z: rh[1], r: 900 },
      { id: 'OBJ 05', name: 'Depot · Kurgany', kind: 'depot', x: dep.x, z: dep.z, r: 800 },
      { id: 'OBJ 06', name: 'Airfield · Stepnoye', kind: 'airfield', x: af.x, z: af.z, r: 1500 },
    ];
    return {
      places, objectives,
      spawns: { coast, fleet },
      replenish: { x: 50000, z: -63000, r: 5000 },
      pads: [
        { x: coast.x, z: coast.z, r: 450, r1: 1100 },
        { x: rh[0], z: rh[1], r: 220, r1: 550 },
        { x: dep.x, z: dep.z, r: 300, r1: 700 },
        { x: af.x, z: af.z, r: 1400, r1: 2400 },
        { x: pW.x, z: pW.z, r: 180, r1: 450, quay: true },
        { x: pE.x, z: pE.z, r: 180, r1: 450, quay: true },
        { x: lh.x, z: lh.z, r: 100, r1: 250 },
      ],
    };
  },
};
