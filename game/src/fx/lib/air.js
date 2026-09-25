/* Aircraft: the F414s' afterburner (lime-white cones with shock diamonds) and the heat shimmer behind the
   nozzles at any power; the E-2D's two eight-bladed props as shimmering discs and the faint heat of its T56
   exhausts. Drawn where the aircraft is this frame. */
import { hsh, GT, GM, LIME, TAU } from './core.js';
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

/* E-2D (data/models.js E2D): prop discs at +-3.72 m, .45 m up, 4.34 m ahead of the origin, 2.055 m radius (NP2000,
   eight blades); T56 exhaust stubs outboard of the nacelles at 2.1 m aft, pointing out and back */
const E2P = [[-3.72, .45, 4.34], [3.72, .45, 4.34]], E2R = 2.055;
const E2X = [[-4.46, .5, -2.1, -.26, -.05, -.96], [4.46, .5, -2.1, .26, -.05, -.96]];
/* props at pos, attitude (hdg, pitch, roll), power 0..1, seed */
export function drawProps(C, pos, hdg, pitch, roll, power, seed) {
  const V = C.V;
  if (power < .02 || !V.vis(pos[0], pos[1], pos[2], 16)) return;
  const pxm = V.pxm(pos[0], pos[1], pos[2]); if (pxm * E2R < 1.2) return;
  const ch = Math.cos(hdg), sh = Math.sin(hdg), cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
  const fx = sh * cp, fy = sp, fz = ch * cp, r0x = ch, r0z = -sh, u0x = -sh * sp, u0y = cp, u0z = -ch * sp;
  const rx = r0x * cr - u0x * sr, ry = -u0y * sr, rz = r0z * cr - u0z * sr, ux = u0x * cr + r0x * sr, uy = u0y * cr, uz = u0z * cr + r0z * sr;
  const fr = Math.floor(C.tr * 60), q = C.q, dot = C.dot, Rp = E2R * pxm;
  for (let k = 0; k < 2; k++) {
    const n = E2P[k], cx = pos[0] + rx * n[0] + ux * n[1] + fx * n[2], cy = pos[1] + ry * n[0] + uy * n[1] + fy * n[2], cz = pos[2] + rz * n[0] + uz * n[1] + fz * n[2];
    // the disc: a faint shimmer of dots over it (a new scatter every frame), the tips' path a brighter ring
    const nd = Math.round(Math.min(260, 10 + Rp * Rp * .1) * q), sd = seed * 7 + k * 131;
    for (let i = 0; i < nd; i++) {
      const u = hsh(i + sd, fr), th = hsh(i + 71, fr + sd) * TAU, rr = E2R * (.2 + .8 * Math.sqrt(u)), c = Math.cos(th) * rr, d = Math.sin(th) * rr;
      dot(cx + rx * c + ux * d, cy + ry * c + uy * d, cz + rz * c + uz * d, 1, 226, 232, 218, (.1 + .14 * u * u) * power);
    }
    if (Rp > 4) {
      const nt = Math.round(Math.min(120, TAU * Rp / 2.2) * q), ph = C.tr * 2.3 + k;
      for (let i = 0; i < nt; i++) {
        const th = i / nt * TAU + ph, c = Math.cos(th) * E2R, d = Math.sin(th) * E2R, tw = hsh(i + sd, fr >> 1);
        dot(cx + rx * c + ux * d, cy + ry * c + uy * d, cz + rz * c + uz * d, 1, 232, 236, 224, (.16 + .22 * tw) * power);
      }
    }
    // the exhaust: warm air wavering out behind the stub
    if (pxm > 1.2) {
      const e = E2X[k], ex = pos[0] + rx * e[0] + ux * e[1] + fx * e[2], ey = pos[1] + ry * e[0] + uy * e[1] + fy * e[2], ez = pos[2] + rz * e[0] + uz * e[1] + fz * e[2];
      const dx = rx * e[3] + ux * e[4] + fx * e[5], dy = ry * e[3] + uy * e[4] + fy * e[5], dz = rz * e[3] + uz * e[4] + fz * e[5];
      const ns = Math.round(Math.min(30, 8 + pxm * 1.5) * q);
      for (let i = 0; i < ns; i++) {
        const s = .3 + 7 * Math.pow(hsh(i + sd, seed + 3), 1.4), j = (i * 3 + fr * 7 + k * 101) & GM, w = .1 + .045 * s;
        dot(ex + dx * s + GT[j] * w, ey + dy * s + GT[(j + 1) & GM] * w, ez + dz * s + GT[(j + 2) & GM] * w, 1, 228, 232, 214, .15 * power * (1 - s / 7.5));
      }
    }
  }
}
