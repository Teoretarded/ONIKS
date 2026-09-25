/* The bench's world: a coast (land to the west, a bluff for the battery), the sea as world-fixed jittered dot
   lattices in rings round the view (spacing doubling outward, like the engine's clipmap), and the HD models
   (destroyer, K340P TELs, Seahawk, Super Hornet, the rounds) and the game's own (Bal, Kilo, Virginia, E-2D,
   Kh-35U, Kalibr: data/models.js) sampled once as dots and lit by the low moon. */
import { EXTRA_MODELS } from '../../data/models.js';
const LK = (() => { const v = [-.5, .62, -.6], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

/* the coast: land west of a wavy shoreline, rising to a 30-45 m bluff */
export function landH(x, z) {
  const shore = -1400 + 380 * Math.sin(z / 2300) + 160 * Math.sin(z / 710 + 1.3);
  const d = shore - x;
  if (d <= 0) return Math.max(-40, d * .02);
  return Math.min(42, d * .09) * (.85 + .15 * Math.sin(x / 190) * Math.cos(z / 240)) + 3 * M3.noise(x / 300, z / 300, .5);
}
export const ground = (x, z) => Math.max(0, landH(x, z));

function hsh(a, b) {
  let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return ((h >>> 0) + .5) / 4294967296;
}
const swell = (x, z, t) => .55 * Math.sin(.042 * (x * .8 + z * .6) - 1.05 * t) + .3 * Math.sin(.083 * (-x * .3 + z * .95) - 1.6 * t + 1.3);

/* a model sampled once: points in model space with normals */
function sampleModel(model, sp, st, seed) {
  const out = [];
  for (const s of GEO.sample(model, sp, seed || 7, st || {}, { fine: sp < .2 })) {
    const part = s.part;
    if (part.show && !part.show(st || {})) continue;
    const T = GEO.partXf(M3.X.make(), part, st || {}), P = s.pts;
    for (let i = 0; i < P.length; i += 6) {
      const q = M3.X.ap(T, [P[i], P[i + 1], P[i + 2]]), n = M3.X.dir(T, [P[i + 3], P[i + 4], P[i + 5]]);
      out.push(q[0], q[1], q[2], n[0], n[1], n[2]);
    }
  }
  return new Float32Array(out);
}

export class Scene {
  constructor() {
    this.models = {};
    const lv = (key, mk, sps, st) => { const m = mk(); this.models[key] = sps.map(sp => ({ sp, pts: sampleModel(m, sp, st, 11) })); };
    lv('destroyer', HD.destroyer, [.35, 1.1, 3]);
    lv('tel', HD.tel, [.09, .3, 1], { elev: 1.53, dep: 1 });
    lv('helo', HD.helo, [.07, .25, .8], { rotor: 0 });
    lv('fighter', HD.fighter, [.07, .25, .8], {});
    lv('oniks', () => HD.oniks(), [.035, .12, .4], { wing: 0, fin: 0, booster: true, cover: true });
    lv('oniksR', () => HD.oniks(), [.035, .12, .4], { wing: 1, fin: 1, booster: false, cover: false });
    lv('sm6', () => HD.sm6(), [.03, .1, .35], { booster: true });
    lv('sm6R', () => HD.sm6(), [.03, .1, .35], { booster: false });
    lv('oniksBooster', () => HD.oniksBooster(), [.03, .1, .35], {});
    lv('mk72', () => HD.mk72(), [.03, .1, .35], {});
    const X = EXTRA_MODELS;
    lv('bal', X.bal, [.05, .14, .4], { elev: .52, dep: 1, n: 8 });
    lv('ssk', X.ssk, [.3, .8, 2.2], { mast: 1, prop: 0 });
    lv('ssn', X.ssn, [.35, .9, 2.4], { mast: 1, prop: 0, vptA: 0, vptB: 0 });
    lv('aew', X.aew, [.06, .16, .45], { dome: 0, prop: 0, fold: 0 });
    lv('kh35', X.kh35, [.03, .08, .25], { wing: 0, fin: 1, booster: true });
    lv('kh35R', X.kh35, [.03, .08, .25], { wing: 1, fin: 1, booster: false });
    lv('kalibr', X.kalibr, [.035, .1, .3], { wing: 0, fin: 1, booster: true });
    lv('kalibrR', X.kalibr, [.035, .1, .3], { wing: 1, fin: 1, booster: false });
    this.LT = [0, 0, 0, 0];
  }
  /* sea and land dots: rings of world-fixed lattices round the point under the camera target */
  drawGround(R, t, focus, dist) {
    const c = R.cam, e = c.eye, LT = this.LT;
    // rings of lattices round the ground under the lens, finest where the lens is
    const h = Math.max(2, e[1] - Math.max(0, landH(e[0], e[2]))), N = 100, fadeD = 2500 + dist * 3.2, NL = 10;
    const s0 = Math.max(.35, h / 70);
    const ox = e[0] + c.f[0] * h * .8, oz = e[2] + c.f[2] * h * .8;
    for (let lvl = 0; lvl < NL; lvl++) {
      const s = s0 * (1 << lvl), half = N / 2 * s, inner = lvl ? half / 2 : -1;
      const cx = Math.round(ox / s), cz = Math.round(oz / s);
      for (let j = -N / 2; j < N / 2; j++) for (let i = -N / 2; i < N / 2; i++) {
        if (lvl && Math.abs(i * s) < inner && Math.abs(j * s) < inner) continue;
        const gi = cx + i, gj = cz + j, h1 = hsh(gi * 7 + lvl * 101, gj), h2 = hsh(gi, gj * 13 + lvl * 7);
        // the outer half of a level thins to the density of the next one: no seams
        if (lvl < NL - 1) { const m = Math.max(Math.abs(i), Math.abs(j)) / (N / 2), keep = 1 - .75 * Math.min(1, Math.max(0, (m - .5) / .5)); if (hsh(gi * 3 + lvl, gj * 5 + 99) > keep) continue; }
        const x = (gi + (h1 - .5) * .8) * s, z = (gj + (h2 - .5) * .8) * s;
        const hL = landH(x, z), land = hL > 0;
        const y = land ? hL : swell(x, z, t) * .6;
        const d = Math.hypot(x - e[0], y - e[1], z - e[2]), fd = Math.exp(-d / fadeD);
        if (fd < .03) continue;
        let b;
        if (land) {
          // lit by the moon from the slope (finite differences)
          const gx = landH(x + 2, z) - landH(x - 2, z), gz = landH(x, z + 2) - landH(x, z - 2), nl = Math.hypot(gx, 4, gz);
          b = (.2 + .55 * Math.max(0, (-gx * LK[0] + 4 * LK[1] - gz * LK[2]) / nl)) * (.8 + .4 * h1);
        } else b = (.2 + .34 * hsh(gi * 3 + 1, gj * 5 + lvl)) * (.75 + .5 * Math.max(0, swell(x, z, t) + .3));
        R.scenePt(x, y, z, b * fd, 238, 238, 228, 1, LT);
      }
    }
  }
  has(key) { return !!this.models[key]; }
  /* a model instance: key, world position, heading, pitch, roll (rad); a 0..1; or a 3x3 row-major rotation M */
  /* a boat: above the surface as it is; under it faint, as seen through the water */
  drawBoat(R, key, T, hdg, a) { this.drawModel(R, key, T, hdg, 0, 0, a, null, 0); }
  drawModel(R, key, T, hdg, pitch, roll, a, M, sea) {
    const lv = this.models[key]; if (!lv) return;
    const c = R.cam, e = c.eye, LT = this.LT, dist = Math.max(1, Math.hypot(T[0] - e[0], T[1] - e[1], T[2] - e[2]));
    const pxm = c.fl / dist;
    let L = lv[lv.length - 1];
    for (let k = lv.length - 1; k >= 0; k--) { L = lv[k]; if (lv[k].sp * pxm < 2.2) break; }
    const ch = Math.cos(hdg), sh = Math.sin(hdg), cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
    // R = Ry(hdg) Rx(-pitch) Rz(roll): model +Z forward
    let f = [sh * cp, sp, ch * cp], r0 = [ch, 0, -sh], u0 = [-sh * sp, cp, -ch * sp];
    let rx = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr], ux = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr + r0[2] * sr];
    if (M) { rx = [M[0], M[3], M[6]]; ux = [M[1], M[4], M[7]]; f = [M[2], M[5], M[8]]; }
    const P = L.pts, big = L.sp * pxm > 3.2 ? 2 : 1;
    for (let i = 0; i < P.length; i += 6) {
      const px = P[i], py = P[i + 1], pz = P[i + 2];
      const x = T[0] + rx[0] * px + ux[0] * py + f[0] * pz, y = T[1] + rx[1] * px + ux[1] * py + f[1] * pz, z = T[2] + rx[2] * px + ux[2] * py + f[2] * pz;
      const nx = P[i + 3], ny = P[i + 4], nz = P[i + 5];
      let b = .5;
      if (nx || ny || nz) {
        const wx = rx[0] * nx + ux[0] * ny + f[0] * nz, wy = rx[1] * nx + ux[1] * ny + f[1] * nz, wz = rx[2] * nx + ux[2] * ny + f[2] * nz;
        const dx = x - e[0], dy = y - e[1], dz = z - e[2], fac = -(wx * dx + wy * dy + wz * dz) / Math.hypot(dx, dy, dz);
        if (fac < -.15) continue;
        b = .22 + .72 * Math.max(0, wx * LK[0] + wy * LK[1] + wz * LK[2]);
      }
      R.scenePt(x, y, z, sea !== undefined && y < sea ? b * a * .14 : b * a, 238, 238, 228, big, LT);
    }
  }
}
