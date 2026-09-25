/* Debris maths: quaternions [w, x, y, z] (body -> world), row-major 3x3 matrices (the engine's: v_world = M v_body),
   a seeded hash. Everything writes into the caller's arrays: nothing is allocated in the hot loops. */

export const TAU = Math.PI * 2;
export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

/* seeded hash 0..1 of (i, seed): the same numbers for the same break-up, whatever the frame rate */
export function hsh(i, s) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((s * 1000003) | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/* a small seeded generator: r() 0..1, n() about -1..1 (triangular) */
export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, n: () => r() + r() - 1, range: (lo, hi) => lo + (hi - lo) * r(), sign: () => r() < .5 ? -1 : 1 };
}

/* ---------- quaternions ---------- */
export function qNorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
}
/* q <- exp(0.5 h w) * q  (w world angular velocity): the exact turn of a constant w over h */
export function qTurn(q, wx, wy, wz, h) {
  const a = Math.hypot(wx, wy, wz) * h;
  if (a < 1e-9) return q;
  const s = Math.sin(a / 2) / (a / h), c = Math.cos(a / 2);
  const dx = wx * s, dy = wy * s, dz = wz * s;
  const w = q[0], x = q[1], y = q[2], z = q[3];
  q[0] = c * w - dx * x - dy * y - dz * z;
  q[1] = c * x + dx * w + dy * z - dz * y;
  q[2] = c * y - dx * z + dy * w + dz * x;
  q[3] = c * z + dx * y - dy * x + dz * w;
  return qNorm(q);
}
/* row-major matrix of q */
export function qMat(q, M) {
  const w = q[0], x = q[1], y = q[2], z = q[3];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  M[0] = 1 - 2 * (yy + zz); M[1] = 2 * (xy - wz); M[2] = 2 * (xz + wy);
  M[3] = 2 * (xy + wz); M[4] = 1 - 2 * (xx + zz); M[5] = 2 * (yz - wx);
  M[6] = 2 * (xz - wy); M[7] = 2 * (yz + wx); M[8] = 1 - 2 * (xx + yy);
  return M;
}
/* quaternion of a row-major rotation matrix */
export function matQ(M, q) {
  const tr = M[0] + M[4] + M[8];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q[0] = .25 * s; q[1] = (M[7] - M[5]) / s; q[2] = (M[2] - M[6]) / s; q[3] = (M[3] - M[1]) / s; }
  else if (M[0] > M[4] && M[0] > M[8]) { const s = Math.sqrt(1 + M[0] - M[4] - M[8]) * 2; q[0] = (M[7] - M[5]) / s; q[1] = .25 * s; q[2] = (M[1] + M[3]) / s; q[3] = (M[2] + M[6]) / s; }
  else if (M[4] > M[8]) { const s = Math.sqrt(1 + M[4] - M[0] - M[8]) * 2; q[0] = (M[2] - M[6]) / s; q[1] = (M[1] + M[3]) / s; q[2] = .25 * s; q[3] = (M[5] + M[7]) / s; }
  else { const s = Math.sqrt(1 + M[8] - M[0] - M[4]) * 2; q[0] = (M[3] - M[1]) / s; q[1] = (M[2] + M[6]) / s; q[2] = (M[5] + M[7]) / s; q[3] = .25 * s; }
  return qNorm(q);
}
/* normalised lerp between a and b (the short way) into o */
export function qLerp(a, b, t, o) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  o[0] = a[0] + (s * b[0] - a[0]) * t; o[1] = a[1] + (s * b[1] - a[1]) * t;
  o[2] = a[2] + (s * b[2] - a[2]) * t; o[3] = a[3] + (s * b[3] - a[3]) * t;
  return qNorm(o);
}
/* quaternion of a turn by angle a about unit axis (x, y, z) */
export function qAxis(x, y, z, a, o) { const s = Math.sin(a / 2); o[0] = Math.cos(a / 2); o[1] = x * s; o[2] = y * s; o[3] = z * s; return o; }
/* o = a * b */
export function qMul(a, b, o) {
  const w = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];
  const x = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
  const y = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1];
  const z = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0];
  o[0] = w; o[1] = x; o[2] = y; o[3] = z;
  return o;
}

/* ---------- matrices ---------- */
/* o = M v */
export function mv(M, x, y, z, o) { o[0] = M[0] * x + M[1] * y + M[2] * z; o[1] = M[3] * x + M[4] * y + M[5] * z; o[2] = M[6] * x + M[7] * y + M[8] * z; return o; }
/* o = M^T v */
export function mtv(M, x, y, z, o) { o[0] = M[0] * x + M[3] * y + M[6] * z; o[1] = M[1] * x + M[4] * y + M[7] * z; o[2] = M[2] * x + M[5] * y + M[8] * z; return o; }
/* o = A B */
export function mm(A, B, o) {
  for (let i = 0; i < 3; i++) {
    const a0 = A[i * 3], a1 = A[i * 3 + 1], a2 = A[i * 3 + 2];
    o[i * 3] = a0 * B[0] + a1 * B[3] + a2 * B[6]; o[i * 3 + 1] = a0 * B[1] + a1 * B[4] + a2 * B[7]; o[i * 3 + 2] = a0 * B[2] + a1 * B[5] + a2 * B[8];
  }
  return o;
}
/* the engine's attitude: Ry(hdg) Rx(-pitch) Rz(-roll), row-major (engine/models.js attitude) */
export function attitudeM(hdg, pitch, roll, o) {
  const ch = Math.cos(hdg), sh = Math.sin(hdg), cp = Math.cos(-pitch), sp = Math.sin(-pitch), cr = Math.cos(-roll), sr = Math.sin(-roll);
  // Ry Rx
  const a0 = ch, a1 = sh * sp, a2 = sh * cp, a3 = 0, a4 = cp, a5 = -sp, a6 = -sh, a7 = ch * sp, a8 = ch * cp;
  // (Ry Rx) Rz
  o[0] = a0 * cr + a1 * sr; o[1] = -a0 * sr + a1 * cr; o[2] = a2;
  o[3] = a3 * cr + a4 * sr; o[4] = -a3 * sr + a4 * cr; o[5] = a5;
  o[6] = a6 * cr + a7 * sr; o[7] = -a6 * sr + a7 * cr; o[8] = a8;
  return o;
}
/* a unit vector perpendicular to (x, y, z) */
export function perp(x, y, z, o) {
  if (Math.abs(y) < .9) { o[0] = z; o[1] = 0; o[2] = -x; } else { o[0] = 0; o[1] = -z; o[2] = y; }
  const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l;
  return o;
}
