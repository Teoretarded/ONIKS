/* SENSORS core: colours, hashes, easing, and allocation-free dotted primitives drawn straight into R.fx
   (even on-screen spacing, the films' dset look). World metres, X east, Y up, Z north; bearings clockwise
   from north. Colours 0..255, alpha 0..1, dot sizes > 0 px at 1080p. */

export const LIME = [198, 244, 50], CORAL = [255, 106, 61], WH = [238, 238, 228], HOT = [248, 255, 232];
export const LIME_S = '#C6F432', CORAL_S = '#FF6A3D';
export const TAU = Math.PI * 2, DEG = Math.PI / 180;

export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const mix = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const outCubic = t => 1 - Math.pow(1 - sat(t), 3);
export const outExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
export const wrap2 = a => a - TAU * Math.floor(a / TAU);

/* integer hash -> [0, 1) (the films' hsh) */
export function hsh(a, b) {
  let h = Math.imul((a | 0) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85EBCA77);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return ((h >>> 0) + .5) / 4294967296;
}
/* gaussian from two hashes */
export const gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
/* seeded stream (mulberry32) for geometry built once */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------------- the view: fast depth / projection for spacing and culling (no curvature) ---------------- */
export class View {
  constructor() { this.e = [0, 0, 0]; this.f = [0, 0, 1]; this.r = [1, 0, 0]; this.u = [0, 1, 0]; this.fl = 1000; this.W = 1920; this.H = 1080; this.near = .3; this.k1080 = 1; }
  set(cam) {
    const e = cam.eye, f = cam.f, r = cam.r, u = cam.u;
    this.e[0] = e[0]; this.e[1] = e[1]; this.e[2] = e[2];
    this.f[0] = f[0]; this.f[1] = f[1]; this.f[2] = f[2];
    this.r[0] = r[0]; this.r[1] = r[1]; this.r[2] = r[2];
    this.u[0] = u[0]; this.u[1] = u[1]; this.u[2] = u[2];
    this.fl = cam.fl; this.W = cam.W; this.H = cam.H; this.near = cam.near || .3;
    this.k1080 = 1080 / Math.max(1, cam.H);
  }
  depth(x, y, z) { return (x - this.e[0]) * this.f[0] + (y - this.e[1]) * this.f[1] + (z - this.e[2]) * this.f[2]; }
  dist(x, y, z) { return Math.hypot(x - this.e[0], y - this.e[1], z - this.e[2]); }
  /* metres per CSS px at depth zc */
  mpp(zc) { return Math.max(zc, this.near) / this.fl; }
  /* is a sphere (with the curvature drop) roughly in view */
  vis(x, y, z, rad) {
    const dx = x - this.e[0], dz = z - this.e[2], dy = y - this.e[1] - (dx * dx + dz * dz) / 12742000;
    const zc = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
    if (zc < -rad) return false;
    const xc = dx * this.r[0] + dy * this.r[1] + dz * this.r[2], yc = dx * this.u[0] + dy * this.u[1] + dz * this.u[2];
    const zz = Math.max(zc, this.near), tx = this.W / 2 / this.fl, ty = this.H / 2 / this.fl;
    return Math.abs(xc) < zz * tx * 1.1 + rad * 1.2 && Math.abs(yc) < zz * ty * 1.1 + rad * 1.2;
  }
}

/* ---------------- dotted primitives into R.fx ---------------- */
/* o: { rgb, a, step (px), size (px), mode, drape (terrain or null), lift (m), max (dots) } — never allocates */
export function ringDots(fx, V, cx, cy, cz, r, o, a0, a1) {
  if (r <= 0) return 0;
  const rgb = o.rgb || WH, al = o.a === undefined ? .8 : o.a, size = o.size || 1, mode = o.mode || 'max', step = o.step || 5;
  const T = o.drape || null, lift = o.lift || 0, max = o.max || 4000;
  if (a0 === undefined) { a0 = 0; a1 = TAU; }
  // whole ring off screen
  if (!V.vis(cx, cy, cz, r)) return 0;
  let n = 0, a = a0;
  const e = V.e, f = V.f;
  while (a < a1 && n < max) {
    const s = Math.sin(a), c = Math.cos(a), x = cx + s * r, z = cz + c * r;
    const y = T ? Math.max(0, T.heightAt(x, z)) + lift : cy + lift;
    const dx = x - e[0], dy = y - e[1], dz = z - e[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    let da;
    if (zc < V.near) da = Math.max(.004, (V.near - zc) / r * .5 + step * V.near / V.fl / r);
    else {
      da = step * zc / V.fl / r;
      // off screen: stride faster
      const xc = dx * V.r[0] + dy * V.r[1] + dz * V.r[2], yc = dx * V.u[0] + dy * V.u[1] + dz * V.u[2];
      const ox = Math.abs(xc) / zc * V.fl - V.W * .6, oy = Math.abs(yc) / zc * V.fl - V.H * .6;
      const off = Math.max(ox, oy);
      if (off > 0) da = Math.max(da, off * .5 * zc / V.fl / r);
      else { fx.dotXYZ(x, y, z, size, rgb[0], rgb[1], rgb[2], al, mode); n++; }
    }
    a += clamp(da, 1e-5, .08);
  }
  return n;
}
/* dotted straight segment a -> b (world), even on-screen spacing */
export function lineDots(fx, V, ax, ay, az, bx, by, bz, o) {
  const rgb = o.rgb || WH, al = o.a === undefined ? .8 : o.a, size = o.size || 1, mode = o.mode || 'max', step = o.step || 5;
  const T = o.drape || null, lift = o.lift || 0, max = o.max || 3000;
  const L = Math.hypot(bx - ax, by - ay, bz - az); if (L < 1e-6) return 0;
  const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
  if (!V.vis(cx, cy, cz, L / 2)) return 0;
  let s = 0, n = 0, it = 0;
  const e = V.e, f = V.f, tx = V.W * .6 / V.fl, ty = V.H * .6 / V.fl;
  while (s <= L && n < max && it++ < 20000) {
    const t = s / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const y = T ? Math.max(0, T.heightAt(x, z)) + lift : ay + (by - ay) * t + lift;
    const dx = x - e[0], dy = y - e[1], dz = z - e[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc <= V.near) { s += Math.max(.5, (V.near - zc) * .5 + step * V.near * 4 / V.fl); continue; }
    const xc = dx * V.r[0] + dy * V.r[1] + dz * V.r[2], yc = dx * V.u[0] + dy * V.u[1] + dz * V.u[2];
    const off = Math.max(Math.abs(xc) - zc * tx, Math.abs(yc) - zc * ty);
    if (off > 0) { s += Math.max(step * zc / V.fl, off * .5); continue; }
    fx.dotXYZ(x, y, z, size, rgb[0], rgb[1], rgb[2], typeof al === 'function' ? al(t) : al, mode); n++;
    s += Math.max(.05, step * zc / V.fl);
  }
  return n;
}

/* ---------------- 2D helpers ---------------- */
/* approximate tag width (Geist Mono ~ .6 em + letter spacing), matching overlay.tag's padding */
export function tagW(id, label, value, px) {
  px = px || 11.5;
  const cw = px * .62, pX = px * .61, pL = px * .7;
  return (id ? id.length * cw + pX * 2 : 0) + (label ? label.length * cw + pL * 2 : 0) + (value ? String(value).length * cw + pL * 2 : 0);
}
/* stack tags so they do not overlap: items { x, y, w, h, pri } sorted by pri desc then y; moves y up */
export function stackTags(items, n) {
  items.length = n;
  items.sort((a, b) => (b.pri - a.pri) || (a.y - b.y));
  for (let i = 0; i < n; i++) {
    const t = items[i];
    for (let guard = 0; guard < 8; guard++) {
      let hit = null;
      for (let j = 0; j < i; j++) { const p = items[j]; if (t.x < p.x + p.w + 6 && p.x < t.x + t.w + 6 && Math.abs(t.y - p.y) < t.h + 4) { hit = p; break; } }
      if (!hit) break;
      t.y = hit.y - t.h - 5;
    }
  }
}
export const pad2 = n => String(n).padStart(2, '0');
