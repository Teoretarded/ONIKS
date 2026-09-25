/* small math helpers shared by the sim modules */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angTo = (from, to) => wrapPi(to - from);
export const bearing = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
export const d2 = (a, b) => Math.sqrt((b[0] - a[0]) ** 2 + (b[2] - a[2]) ** 2);
export const d3 = (a, b) => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2);
export const dxz = (ax, az, bx, bz) => Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
/* world position of a model-space offset on a unit (yaw only) */
export function local(u, o) {
  const c = Math.cos(u.hdg), s = Math.sin(u.hdg);
  return [u.pos[0] + o[0] * c + o[2] * s, u.pos[1] + o[1], u.pos[2] - o[0] * s + o[2] * c];
}
/* closest approach (m) during the last tick between two movers with prev/pos */
export function closest(a, b) {
  const r0x = b.prev[0] - a.prev[0], r0y = b.prev[1] - a.prev[1], r0z = b.prev[2] - a.prev[2];
  const dx = (b.pos[0] - b.prev[0]) - (a.pos[0] - a.prev[0]), dy = (b.pos[1] - b.prev[1]) - (a.pos[1] - a.prev[1]), dz = (b.pos[2] - b.prev[2]) - (a.pos[2] - a.prev[2]);
  const dd = dx * dx + dy * dy + dz * dz;
  let s = dd > 1e-9 ? -(r0x * dx + r0y * dy + r0z * dz) / dd : 1;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  return Math.sqrt((r0x + dx * s) ** 2 + (r0y + dy * s) ** 2 + (r0z + dz * s) ** 2);
}
export const ground = (map, x, z) => { const h = map.h(x, z); return h > 0 ? h : 0; };
