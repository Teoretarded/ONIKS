/* Rocket plumes and heads, drawn where the round is this frame (nothing kept): a white-hot core at the
   nozzle, the jet pinched into shock diamonds, a lime halo round the head, and a light on what is near.
   After pc_anatomy_film (booster flame, ramjet jet with its shock diamonds) and pd_engagement_dots (drawPlume),
   pe_aegis_fx (drawHead: the SM-6's white point in a lime halo, long flame on the boost, short on the sustainer). */
import { LIME, TAU, hsh, perp, GT, GM } from './core.js';

/* L jet length (m), r0 radius at the nozzle, cells diamonds over the jet, off nozzle behind the round centre,
   burn 0..1 (halo and light strength), light radius (m) */
export const PLUME = {
  oniksBoost: { L: 7.5, r0: .24, cells: 4, off: 4.85, burn: 1, lr: 70, li: .3 },
  ramjet:     { L: 5.5, r0: .26, cells: 7, off: 4.5, burn: .7, lr: 35, li: .15, dia: 1 },
  mk72:       { L: 22, r0: .3, cells: 5, off: 3.4, burn: 1, lr: 80, li: .35 },
  sustain:    { L: 9, r0: .17, cells: 4, off: 3.3, burn: .55, lr: 30, li: .12 },
  glide:      { L: 2.5, r0: .1, cells: 2, off: 3.3, burn: .15, lr: 0, li: 0 },
  tlamBoost:  { L: 12, r0: .26, cells: 4, off: 3.2, burn: .9, lr: 60, li: .25 },
  small:      { L: 5, r0: .14, cells: 3, off: 1.7, burn: .7, lr: 30, li: .15 },
  tiny:       { L: 2.2, r0: .08, cells: 2, off: .85, burn: .5, lr: 15, li: .1 },
  turbojet:   { L: 1.5, r0: .15, cells: 0, off: 2.4, burn: .08, lr: 0, li: 0, cold: 1 },
  ab:         { L: 6.5, r0: .36, cells: 5, off: 0, burn: .8, lr: 40, li: .2, dia: 1 },
  // Kh-35U booster (data/models.js kh35: nozzle at z -2.2) and its turbofan (tail at -1.62)
  khBoost:    { L: 5, r0: .15, cells: 4, off: 2.25, burn: .9, lr: 45, li: .25 },
  fanKh:      { L: 1.6, r0: .1, cells: 0, off: 1.66, burn: .06, lr: 0, li: 0, cold: 1 },
  // 3M-54 Kalibr booster (nozzle at z -4.11), its turbofan (tail at -2.45), the terminal stage's rocket (its nozzle
  // at z +1.55: drawn only when the sim flies the supersonic dash, p.dash)
  kalBoost:   { L: 10, r0: .24, cells: 5, off: 4.15, burn: 1, lr: 70, li: .3 },
  fanKal:     { L: 2.2, r0: .13, cells: 0, off: 2.5, burn: .06, lr: 0, li: 0, cold: 1 },
  dash:       { L: 8, r0: .19, cells: 5, off: -1.55, burn: .9, lr: 50, li: .25, dia: 1 },
};

const PB = new Float64Array(6);
/* head at (x, y, z), unit axis (ax, ay, az) pointing forward, plume spec P, ignition envelope ign 0..1,
   seed (per round), fr (real-time frame counter for the flicker) */
export function drawPlume(C, x, y, z, ax, ay, az, P, ign, seed, fr) {
  if (ign <= .01) return;
  const V = C.V, dot = C.dot, off = P.off;
  const nx = x - ax * off, ny = y - ay * off, nz = z - az * off;
  const zc = V.depth(nx, ny, nz); if (zc < V.near) return;
  const pxm = V.fl / zc, L = P.L;
  if (!V.vis(nx, ny, nz, L + 4)) return;
  if (P.cold) {
    // a turbojet / turbofan: no flame, only a faint warm shimmer wavering in a thin cone behind the tail (real time,
    // so it never strobes), and close up the warm lip of the nozzle
    if (pxm > 2) {
      const n = Math.max(6, Math.round(Math.min(48, 6 + L * pxm * .25) * C.q));
      for (let i = 0; i < n; i++) {
        const s = L * 2.2 * Math.pow(hsh(i + seed, fr), 1.3), j = (i * 7 + fr * 3 + seed) & GM, w = P.r0 * (.6 + 1.4 * s / L);
        dot(nx - ax * s + GT[j] * w, ny - ay * s + GT[(j + 1) & GM] * w, nz - az * s + GT[(j + 2) & GM] * w, 1, 228, 234, 214, .3 * ign * (1 - s / (L * 2.3)));
      }
      if (pxm * P.r0 > 3) {
        const B = perp(ax, ay, az, PB), m = Math.min(24, Math.round(TAU * P.r0 * pxm / 2));
        for (let k = 0; k < m; k++) { const th = k / m * TAU, c = Math.cos(th) * P.r0 * .8, d = Math.sin(th) * P.r0 * .8; dot(nx + B[0] * c + B[3] * d, ny + B[1] * c + B[4] * d, nz + B[2] * c + B[5] * d, 1, 236, 240, 222, .3 * ign); }
      }
    }
    return;
  }
  const burn = P.burn * ign;
  if (L * pxm < 2.5) {
    // a speck: the hot point and a breath of lime
    dot(nx, ny, nz, 2, 255, 255, 236, Math.min(1, .75 + .25 * burn));
    C.glow(nx, ny, nz, 3, LIME[0], LIME[1], LIME[2], .12 * burn);
    if (P.li && pxm > .05) C.light(nx, ny, nz, 240, 255, 200, P.li * ign * .5, P.lr);
    return;
  }
  const B = perp(ax, ay, az, PB), cells = P.cells || 1, q = C.q;
  const N = Math.max(12, Math.round(Math.min(900, 60 + pxm * L * 9) * q));
  for (let i = 0; i < N; i++) {
    const u = hsh(i + seed * 977, fr), v = hsh(i + 131, fr + seed * 3), w = hsh(i + 71, seed + 5);
    const s = L * Math.pow(u, 1.8), c = s / L * cells, frc = c - Math.floor(c);
    const pinch = .5 + .5 * Math.abs(Math.cos(frc * Math.PI));
    const rad = P.r0 * pinch * (1 + .9 * s / L) * Math.sqrt(v) * (s < .3 ? 1.5 : 1), th = TAU * w + fr * .7;
    const cx = Math.cos(th) * rad, cy = Math.sin(th) * rad;
    const knot = s < L * .7 ? Math.pow(.5 + .5 * Math.cos(TAU * c + Math.PI), 6) * (1 - s / (L * .7)) : 0;
    const hot = Math.exp(-s / (L * .22)), b = ign * Math.min(1, .28 + 1.1 * hot + 1.1 * knot) * (1 - s / (L * 1.04));
    // never under the sea (a round lit just over it: its jet goes into the water)
    const py = ny - ay * s + B[1] * cx + B[4] * cy;
    if (b < .02 || py < 0) continue;
    dot(nx - ax * s + B[0] * cx + B[3] * cy, py, nz - az * s + B[2] * cx + B[5] * cy,
      zc < 60 ? 2 : 1, 240 + 15 * hot, 255, 200 + 45 * hot, b);
  }
  // close up, the jet as the anatomy draws it: rings of dots pinched into cells, a hot core in each knot
  if (L * pxm > 25) {
    const stp = Math.max(.02, 1.1 / pxm) / Math.max(.35, q);
    for (let s = 0; s < L; s += stp) {
      const cell = s / L * cells, fr2 = cell - Math.floor(cell), pinch = .45 + .55 * Math.abs(Math.cos(fr2 * Math.PI));
      const knot = Math.exp(-Math.pow((fr2 - .5) * 6, 2)), al = (.35 + .65 * knot) * (1 - s / L) * ign, rp = P.r0 * pinch * (1 - s / L * .6);
      const px = nx - ax * s, py = ny - ay * s, pz = nz - az * s;
      if (py < 0) break;
      if (rp * pxm < 1.2) { C.glow(px, py, pz, 2, 255, 255, 230, al * .5); continue; }
      for (let m = 0; m < 6; m++) {
        const th = m / 6 * TAU + s * 3, c = Math.cos(th) * rp, d = Math.sin(th) * rp;
        dot(px + B[0] * c + B[3] * d, py + B[1] * c + B[4] * d, pz + B[2] * c + B[5] * d, 1, 240, 255, 200, al);
      }
      C.glow(px, py, pz, Math.max(2, Math.round(rp * pxm * .6)), 240, 255, 190, .25 * al * knot);
    }
  }
  // shock diamonds as small bright cores (the ramjet's are the famous ones)
  if (P.dia && pxm * .3 > 1) for (let k = 0; k < cells; k++) {
    const s = (k + .5) / cells * L * .7, b = ign * .55 * (1 - k / cells);
    dot(nx - ax * s, ny - ay * s, nz - az * s, pxm * .25 > 2 ? 3 : 2, 250, 255, 225, b);
  }
  // the nozzle's white core and the halo (square, additive, as the films draw them)
  const cs = Math.max(2, Math.min(16, Math.round(pxm * .5)));
  dot(nx, ny, nz, Math.min(4, cs), 255, 255, 236, ign);
  C.glow(nx, ny, nz, cs, 255, 255, 230, .45 * ign);
  C.glow(nx, ny, nz, Math.max(6, Math.min(40, Math.round(pxm * 1.5))), LIME[0], LIME[1], LIME[2], .09 * burn);
  if (P.li) C.light(nx, ny, nz, 240, 255, 200, P.li * ign, P.lr);
}

/* the head of a small fast round far off (interceptors, the films' white point in a lime halo) */
export function drawHead(C, x, y, z, burn, k) {
  const V = C.V, zc = V.depth(x, y, z); if (zc < V.near) return;
  if (!V.vis(x, y, z, 4)) return;
  C.halo(x, y, z, Math.min(56, 4 + 6000 * (.35 + burn) / zc), LIME[0], LIME[1], LIME[2], .26 * k * (.45 + burn));
  C.halo(x, y, z, Math.min(16, 2 + 1300 / zc), 255, 250, 232, .6 * k);
  C.dot(x, y, z, zc < 3500 ? 3 : 2, 255, 253, 242, k);
}
