/* Module geometry from a registered model (engine/models.js entry): which parts a module draws (the partAlpha mask),
   its box and centre of mass in model space (the parts' bounds through their rest transform under the model state,
   optionally cut along z), whether it is a plate, its mass. Built once per spawn (a few parts); nothing per frame. */

/* the entry's part names (cached per entry) */
export function partNames(e) {
  if (!e._dbrNames) e._dbrNames = e.parts.map(P => P.name);
  return e._dbrNames;
}
/* a partAlpha mask: 1 for the given names, 0 for every other part (cached per entry and set) */
export function maskOf(e, names) {
  const key = names.join(',');
  const C = e._dbrMasks || (e._dbrMasks = new Map());
  let m = C.get(key);
  if (!m) {
    m = {};
    const set = new Set(names);
    for (const n of partNames(e)) m[n] = set.has(n) ? 1 : 0;
    C.set(key, m);
  }
  return m;
}
/* a fresh mask object (for a core that loses parts as it goes) */
export function liveMask(e, names) {
  const m = {}, set = new Set(names);
  for (const n of partNames(e)) m[n] = set.has(n) ? 1 : 0;
  return m;
}
export function hasPart(e, name) { return partNames(e).includes(name); }
/* is the part drawn under this state */
export function shown(e, name, st) {
  const P = e.parts.find(p => p.name === name);
  if (!P) return false;
  try { return !P.part.show || !!P.part.show(st || {}); } catch (err) { return true; }
}

/* the box (model space) of the given parts under state st; the body part `cut` (if given) clipped to z in [z0, z1]
   (its own frame: the airframe of a round has no transform). -> { mn, mx, c, ext } or null */
export function boxOf(e, names, st, cut, z0, z1) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  let any = false;
  for (const P of e.parts) {
    if (!names.includes(P.name)) continue;
    let ok = true;
    try { ok = !P.part.show || P.part.show(st || {}); } catch (err) { ok = true; }
    if (!ok) continue;
    const b = P.bounds;
    if (!b || b[0][0] > b[1][0]) continue;
    let lo2 = b[0][2], hi2 = b[1][2];
    if (P.name === cut) { lo2 = Math.max(lo2, z0); hi2 = Math.min(hi2, z1); if (hi2 <= lo2) continue; }
    let X = null;
    try { X = P.part.xf ? P.part.xf(st || {}) : null; } catch (err) { X = null; }
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? b[1][0] : b[0][0], y = c & 2 ? b[1][1] : b[0][1], z = c & 4 ? hi2 : lo2;
      let wx = x, wy = y, wz = z;
      if (X) { const R = X.R, T = X.T; wx = R[0] * x + R[1] * y + R[2] * z + T[0]; wy = R[3] * x + R[4] * y + R[5] * z + T[1]; wz = R[6] * x + R[7] * y + R[8] * z + T[2]; }
      if (wx < mn[0]) mn[0] = wx; if (wy < mn[1]) mn[1] = wy; if (wz < mn[2]) mn[2] = wz;
      if (wx > mx[0]) mx[0] = wx; if (wy > mx[1]) mx[1] = wy; if (wz > mx[2]) mx[2] = wz;
    }
    any = true;
  }
  if (!any) return null;
  return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], ext: [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2] };
}
/* the middle of a part along z (model space), for sorting fixed parts into sections */
export function zMid(e, name, st) {
  const b = boxOf(e, [name], st);
  return b ? b.c[2] : 0;
}
/* a thin piece: its thinnest extent under a sixth of the largest */
export function isPlate(ext) {
  const a = Math.min(ext[0], ext[1], ext[2]), b = Math.max(ext[0], ext[1], ext[2]);
  return a < b / 6;
}
/* a plate's box keeps some thickness (a wing's bounds are flat): at least 2 % of its span, 1 cm */
export function thicken(ext) {
  const b = Math.max(ext[0], ext[1], ext[2]), t = Math.max(.01, b * .02);
  return [Math.max(ext[0], t), Math.max(ext[1], t), Math.max(ext[2], t)];
}
/* mass: a plate by its largest face (kg/m^2), a section by its cylinder (kg/m^3), anything else by its box */
export function massOf(ext, plate, rho, sigma, cyl) {
  const a = 2 * ext[0], b = 2 * ext[1], c = 2 * ext[2];
  if (plate) return Math.max(.2, sigma * Math.max(a * b, a * c, b * c));
  return Math.max(.3, rho * a * b * c * (cyl ? .785 : 1));
}
