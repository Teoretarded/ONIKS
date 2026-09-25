/* Shards: the small torn pieces of the part that took the hit, each a little plate of dots (a jagged polygon, a few
   to a few dozen returns, as many as its size on screen asks for) tumbling on its own body; white-hot for a moment,
   then the grey of torn skin. Templates are built once (seeded); drawing is a transform per dot, nothing allocated. */
import { rng, TAU } from './math.js';

const NT = 32, NP = 40;
/* templates: NT plates of NP points each (x, y in the plate's plane, unit size), outline first, then the fill */
export const TPL = (() => {
  const r = rng(7707).r, a = new Float32Array(NT * NP * 2);
  for (let t = 0; t < NT; t++) {
    const nv = 3 + Math.floor(r() * 4), V = [];
    for (let k = 0; k < nv; k++) { const an = (k + .15 + .7 * r()) / nv * TAU, rr = .45 + .55 * r(); V.push([Math.cos(an) * rr, Math.sin(an) * rr * (.4 + .6 * r())]); }
    let i = 0;
    // outline: points along the edges
    const nO = 18;
    for (let k = 0; k < nO; k++) {
      const u = k / nO * nv, e = Math.floor(u), f = u - e, A = V[e % nv], B = V[(e + 1) % nv];
      a[(t * NP + i) * 2] = A[0] + (B[0] - A[0]) * f; a[(t * NP + i) * 2 + 1] = A[1] + (B[1] - A[1]) * f; i++;
    }
    // fill: points inside (fan from the centre)
    while (i < NP) {
      const e = Math.floor(r() * nv), A = V[e], B = V[(e + 1) % nv], s = Math.sqrt(r()), w = r();
      a[(t * NP + i) * 2] = (A[0] + (B[0] - A[0]) * w) * s; a[(t * NP + i) * 2 + 1] = (A[1] + (B[1] - A[1]) * w) * s; i++;
    }
  }
  return a;
})();
export const TPL_N = NT, TPL_P = NP;

/* draw one shard: centre P, rotation M (row-major), size s (m), template k, colour, alpha; fx = R.fx; pxm px per metre */
export function drawShard(fx, P, M, s, k, pxm, r, g, b, a) {
  const px = s * pxm;
  if (px < 1.4) { fx.dotXYZ(P[0], P[1], P[2], px < .5 ? 1 : 1.4, r, g, b, a * Math.min(1, .45 + px * .5), 'max'); return 1; }
  // the films' spacing: the outline a dot every ~3.5 px, the face a dot per ~16 px^2 (never a solid chip)
  const o = (k % NT) * NP * 2, T = TPL;
  const nO = Math.min(18, Math.max(3, Math.round(px * 1.6))), nF = Math.min(NP - 18, Math.round(px * px * .16));
  const sz = px > 30 ? 2 : 1.5;
  const ux = M[0] * s, uy = M[3] * s, uz = M[6] * s, vx = M[1] * s * .8, vy = M[4] * s * .8, vz = M[7] * s * .8;
  // the outline's points skipped evenly when few are wanted
  const step = 18 / nO;
  for (let c = 0; c < nO; c++) {
    const j = o + Math.floor(c * step) * 2, x = T[j], y = T[j + 1];
    fx.dotXYZ(P[0] + ux * x + vx * y, P[1] + uy * x + vy * y, P[2] + uz * x + vz * y, sz, r, g, b, a, 'max');
  }
  for (let i = 0; i < nF; i++) {
    const j = o + (18 + i) * 2, x = T[j], y = T[j + 1];
    fx.dotXYZ(P[0] + ux * x + vx * y, P[1] + uy * x + vy * y, P[2] + uz * x + vz * y, sz, r * .7, g * .7, b * .7, a * .7, 'max');
  }
  return nO + nF;
}
