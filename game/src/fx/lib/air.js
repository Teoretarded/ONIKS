/* Aircraft: the F414s' afterburner (lime-white cones with shock diamonds) and the heat shimmer behind the
   nozzles at any power; drawn where the jet is this frame. */
import { hsh, GT, GM, LIME } from './core.js';
import { drawPlume, PLUME } from './plume.js';

const NZ = [[.62, -.12, -9.0], [-.62, -.12, -9.0]];   // HD.fighter.NOZZLES (model: +Z forward, +Y up)
/* jet at pos, attitude (hdg, pitch, roll), ab 0..1 (afterburner), power 0..1, seed */
export function drawJet(C, pos, hdg, pitch, roll, ab, power, seed) {
  const V = C.V;
  if (!V.vis(pos[0], pos[1], pos[2], 30)) return;
  const pxm = V.pxm(pos[0], pos[1], pos[2]); if (pxm <= 0) return;
  // attitude: forward f, right r, up u
  const ch = Math.cos(hdg), sh = Math.sin(hdg), cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
  const f = [sh * cp, sp, ch * cp];
  const r0 = [ch, 0, -sh], u0 = [-sh * sp, cp, -ch * sp];
  const r = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr];
  const u = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr + r0[2] * sr];
  const fr = Math.floor(C.tr * 60);
  for (let k = 0; k < 2; k++) {
    const n = NZ[k], x = pos[0] + r[0] * n[0] + u[0] * n[1] + f[0] * n[2], y = pos[1] + r[1] * n[0] + u[1] * n[1] + f[1] * n[2], z = pos[2] + r[2] * n[0] + u[2] * n[1] + f[2] * n[2];
    if (ab > .02) drawPlume(C, x, y, z, f[0], f[1], f[2], PLUME.ab, ab, seed * 3 + k, fr);
    // heat shimmer: faint dots wavering in the jet wake
    if (pxm > 1.2 && power > .05) {
      const ns = Math.round(26 * C.q);
      for (let i = 0; i < ns; i++) {
        const s = 1 + 16 * Math.pow(hsh(i + k * 97, seed), 1.4), j = (i * 3 + fr * 7 + k * 101) & GM, w = .15 + .05 * s;
        C.dot(x - f[0] * s + GT[j] * w, y - f[1] * s + GT[(j + 1) & GM] * w, z - f[2] * s + GT[(j + 2) & GM] * w, 1, 226, 232, 214, .16 * power * (1 - s / 17));
      }
    }
  }
}
