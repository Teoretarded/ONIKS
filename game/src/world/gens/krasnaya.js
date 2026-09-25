/* Krasnaya Kosa: the real seed-1337 coast (reference/menus/common/theatre.js, 1 km DEM), a 140 x 150 km
   window around the battery bluff with the offshore island to the north. The DEM's large shapes are kept
   exactly (Catmull-Rom through its nodes); the detail is added: the clay bluff the 1 km cells smear into a
   ramp (the films' shaping), balkas carved by the drainage, the sand spit that names the place and the
   shallow bay behind it, field texture. Theatre km -> map metres: x = (xk - CX) * 1000, z = (zk - CZ) * 1000. */
import { cubic, carve } from '../grid.js';
import { ss, sat } from '../noise.js';
import { loadTheatre } from '../theatre.js';

const CX = -5, CZ = 37;                    // theatre km at the map centre
// mud volcanoes: [xk, zk, height m, radius m]
const MUDV = [[-20, -8, 42, 1300], [14, -12, 30, 1000], [33, -19, 55, 1500], [-45, -25, 36, 1200], [5, -31, 48, 1400], [-58, -12, 26, 900], [47, -30, 34, 1100]];
const km = (xk, zk) => [(xk - CX) * 1000, (zk - CZ) * 1000];

// the spit: a quadratic curve off the coast west of the battery, bending east (theatre km)
const SA = [-9.0, 1.0], SB = [-2.6, 6.0], SC = [7.6, 6.6];
const SPIT = [];
for (let t = 0; t <= 1.0001; t += 1 / 32) {
  const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
  const p = km(a * SA[0] + b * SB[0] + c * SC[0], a * SA[1] + b * SB[1] + c * SC[1]);
  SPIT.push([p[0], p[1], t]);
}
const SPIT_BOX = [Math.min(...SPIT.map(p => p[0])) - 3500, Math.min(...SPIT.map(p => p[1])) - 3500, Math.max(...SPIT.map(p => p[0])) + 3500, Math.max(...SPIT.map(p => p[1])) + 3500];

/* distance (m) to the spit's centre line and the curve parameter there */
function spitDist(x, z) {
  if (x < SPIT_BOX[0] || x > SPIT_BOX[2] || z < SPIT_BOX[1] || z > SPIT_BOX[3]) return null;
  let bd = Infinity, bt = 0;
  for (let i = 0; i < SPIT.length - 1; i++) {
    const [ax, az, at] = SPIT[i], [bx, bz, btt] = SPIT[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = ax + dx * u - x, pz = az + dz * u - z, d = px * px + pz * pz;
    if (d < bd) { bd = d; bt = at + (btt - at) * u; }
  }
  return [Math.sqrt(bd), bt];
}

export default {
  async plan(ctx, P) {
    const T = await loadTheatre();
    const { n2, fbm } = ctx.noise;
    const { rows: R, cols: C, ext } = T;
    const sx = (C - 1) / (ext[1] - ext[0]), sz = (R - 1) / (ext[3] - ext[2]);
    const d = P.data;
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const x = P.x0 + i * P.cell, z = P.z0 + j * P.cell;
      const xk = x / 1000 + CX, zk = z / 1000 + CZ;
      // a gentle warp gives the straight DEM coast its coves and points (about a kilometre)
      const wx = 0.7 * fbm(xk / 6 + 3.1, zk / 6 - 1.7, 3), wz = 0.95 * fbm(xk / 5 - 7.3, zk / 5 + 4.4, 3) + 0.35 * fbm(xk / 1.6, zk / 1.6 + 2, 2);
      let h = cubic(T.hs, C, R, (xk + wx - ext[0]) * sx, (zk + wz - ext[2]) * sz);
      // rolling plateau (the films add the same two terms)
      const land = ss(-25, 8, h);
      h += land * (12 * fbm(xk * 0.45 + 11.3, zk * 0.45 - 3.7, 3) + 4 * n2(xk * 2.1 + 5, zk * 2.1));
      // the shoal the spit grew on, and the shallow bay behind it
      const sd = spitDist(x, z);
      if (sd && h < 0) {
        const [dd, t] = sd, w = 1 - ss(500, 3200, dd);
        const inBay = z < km(0, SA[1] + (SC[1] - SA[1]) * sat((xk - SA[0]) / (SC[0] - SA[0])))[1] && xk > SA[0] - 0.5 && xk < SC[0] + 2.5;
        const shoal = -3 - 7 * t - 0.004 * dd;
        let tgt = inBay ? Math.max(-11, -2.5 - 5 * sat((xk - SA[0]) / 14) - 3 * sat(dd / 2500)) : shoal;
        const wb = inBay ? Math.max(w, 1 - ss(0, 1500, h + 20)) * ss(SA[0] - 0.5, SA[0] + 1.2, xk) * (1 - ss(SC[0] + 0.5, SC[0] + 2.5, xk)) : w;
        if (tgt > h) h += (tgt - h) * wb;
      }
      // mud volcanoes (the Taman coast is dotted with them): low cones with a crater pool
      if (h > 5) for (const [vx, vz, vh, vr] of MUDV) {
        const dv = Math.hypot(xk - vx, zk - vz) * 1000;
        if (dv < vr * 2.5) h += vh * Math.exp(-((dv / vr) ** 1.7)) - vh * 0.22 * Math.exp(-((dv / (vr * 0.18)) ** 2));
      }
      d[j * P.cols + i] = h;
    }
    // balkas: carve along the drainage (flow accumulation); mouths notch the bluff
    for (let pass = 0; pass < 2; pass++) carve(d, P.cols, P.rows, pass ? 1.1 : 2.1, 0.42, pass ? 16 : 30, null, (i, j) => 2.5 * fbm(i / 6 + pass, j / 6, 2));
  },

  /* the clay bluff: the first metres of DEM height climb fast (as the films shape it) */
  shape(ctx, x, z, raw) {
    let h = raw;
    if (h > 0) {
      const { n2 } = ctx.noise;
      const cl = ss(-0.3, 0.25, n2(x / 7000 + 4.2, z / 7000 - 2.1));              // cliff stretches vs beaches
      const bh = 24 + 32 * (0.5 + 0.5 * n2(x / 2600 - 9.1, z / 2600 + 1.3));        // bluff height, m
      const bl = bh * (1 - Math.exp(-h / 4.5)) + h * Math.max(0.35, 1 - bh / 150);
      h = h + (bl - h) * cl;
    }
    const sd = spitDist(x, z);
    if (sd) h = spitOver(ctx, x, z, h, sd);
    return h;
  },

  fine(ctx, x, z, raw, cell) {
    const { n2, fbm, ridged } = ctx.noise;
    let h = raw;
    if (h > -40) {
      const land = ss(-2, 6, h);
      // field texture and low mounds; gullies down the bluff face
      h += land * (3.2 * fbm(x / 900, z / 900, 4) + 1.1 * n2(x / 170, z / 170));
      const nearCoast = ss(60, 8, h) * ss(-1, 3, h);
      if (nearCoast > 0) {
        const g = Math.max(0, 1 - Math.abs(n2(x / 420 + 1.7, z / 1600 - 3.3)) * 5.5);
        h -= nearCoast * 9 * g * g;
      }
      if (h < 0) h += 0.8 * fbm(x / 700, z / 700, 2);
    } else {
      h += 2.2 * fbm(x / 2200, z / 2200, 3);
    }
    return this.shape(ctx, x, z, h);
  },

  layout(ctx, A) {
    const P = (xk, zk) => { const [x, z] = km(xk, zk); return { x, z }; };
    const coastPt = (xk, zk, R) => {  // nearest land node to the water within R, near (xk, zk)
      const c = P(xk, zk); let best = null, bd = Infinity;
      for (let dz = -R; dz <= R; dz += 250) for (let dx = -R; dx <= R; dx += 250) {
        const x = c.x + dx, z = c.z + dz; if (!A.isLand(x, z)) continue;
        const sd = spitDist(x, z); if (sd && sd[0] < 900) continue;        // the mainland shore, not the spit
        const cd = A.coastDist(x, z); if (cd > 500) continue;
        const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { x, z }; }
      }
      return best || c;
    };
    const peak = A.peakNear(km(40, -6)[0], km(40, -6)[1], 7000);
    // the highest ground on the map's land
    let top = [0, 0, -1e9];
    for (let k = 0; k < A.P.data.length; k++) if (A.P.data[k] > top[2]) { const [x, z] = A.xz(k); if (Math.abs(x) < 66000 && z > -72000) top = [x, z, A.P.data[k]]; }
    const isl = A.peakNear(km(-38, 96)[0], km(-38, 96)[1], 6000);
    // the island's southern cape: the land point with the most sea around it, on its south side
    let lh = { x: isl[0], z: isl[1] - 3000 }, ls = -1;
    for (let dz = -9000; dz <= 2000; dz += 250) for (let dx = -9000; dx <= 9000; dx += 250) {
      const x = isl[0] + dx, z = isl[1] + dz; if (!A.isLand(x, z)) continue;
      const s = A.seaFrac(x, z, 1200) - dz / 40000; if (s > ls) { ls = s; lh = { x, z }; }
    }
    const tip = km(SC[0], SC[1]);
    const port = coastPt(0.5, 1.8, 2000);
    const places = [
      { name: 'Krasnaya Kosa', kind: 'spit', x: tip[0] - 900, z: tip[1] - 150, road: false },
      { name: 'Bukhta Tikhaya', kind: 'bay', ...P(1.5, 4.3), road: false },
      { name: 'Priboinoye', kind: 'town', ...P(-6.5, 0.8) },
      { name: 'Chernomorka', kind: 'town', ...P(27, -5) },
      { name: 'Vinogradny', kind: 'town', ...P(-41, -11) },
      { name: 'Kurgannaya', kind: 'town', ...P(9, -22) },
      { name: 'Solyony', kind: 'village', ...P(-62, -1) },
      { name: 'Glinishche', kind: 'village', ...P(53, -19) },
      { name: 'Mys Zhelty', kind: 'cape', ...coastPt(-31, 3, 2500), road: false },
      { name: 'Mys Glinyany', kind: 'cape', ...coastPt(46, 3, 2500), road: false },
      { name: 'Ostrov Chaika', kind: 'island', x: isl[0], z: isl[1], road: false },
      { name: 'Sopka Gorelaya', kind: 'peak', ...P(33, -19), road: false },
      { name: 'Sopka Gnilaya', kind: 'peak', ...P(-20, -8), road: false },
      { name: `Kurgan ${Math.round(top[2])}`, kind: 'peak', x: top[0], z: top[1], road: false },
    ];
    const af = P(-37, -21);
    const objectives = [
      { id: 'OBJ 01', name: 'Port · Priboinoye', kind: 'port', x: port.x, z: port.z, r: 1200 },
      { id: 'OBJ 02', name: `Radar hill · ${Math.round(peak[2])}`, kind: 'radar_hill', x: peak[0], z: peak[1], r: 1000 },
      { id: 'OBJ 03', name: 'Depot · Kurgannaya', kind: 'depot', ...P(12, -20.5), r: 900 },
      { id: 'OBJ 04', name: 'Airfield · Vinogradny', kind: 'airfield', x: af.x, z: af.z, r: 1600 },
      { id: 'OBJ 05', name: 'Lighthouse · Ostrov Chaika', kind: 'lighthouse', x: lh.x, z: lh.z, r: 700 },
    ];
    const base = P(0, -0.6);
    const fleet = P(12, 99);
    return {
      places, objectives,
      spawns: { coast: { x: base.x, z: base.z, r: 2500, hdg: 0 }, fleet: { x: fleet.x, z: fleet.z, r: 6000, hdg: Math.PI } },
      replenish: { ...P(52, 105), r: 5000 },
      pads: [
        { x: base.x, z: base.z, r: 560, r1: 1200 },
        { x: peak[0], z: peak[1], r: 300, r1: 700 },
        { x: objectives[2].x, z: objectives[2].z, r: 350, r1: 800 },
        { x: af.x, z: af.z, r: 1500, r1: 2600 },
        { x: port.x, z: port.z, r: 180, r1: 450, quay: true },
        { x: lh.x, z: lh.z, r: 120, r1: 300 },
      ],
      roadOpts: { extra: [['Priboinoye', 'Chernomorka'], ['Solyony', 'Vinogradny']] },
    };
  },
};

function spitOver(ctx, x, z, h, sd) {
  const [d, t] = sd;
  const { n2 } = ctx.noise;
  // width tapers from the root to the tip; the ocean side is ragged
  const half = (330 - 190 * t) * (1 + 0.25 * n2(x / 800, z / 800)) + (t < 0.06 ? (0.06 - t) * 6000 : 0);
  if (d > half + 400) return h;
  const top = 1.6 + 2.2 * (0.5 + 0.5 * n2(x / 260 + 3, z / 260)) * (1 - t * 0.6);   // low dunes
  const bank = 1 - ss(half * 0.55, half, d);
  const sand = top * bank - 3.5 * ss(half, half + 400, d) * (1 - bank);
  return Math.max(h, bank > 0 ? sand + (bank < 1 ? -0.8 * (1 - bank) : 0) : h);
}
