/* ORBITAL kit: how the in-world layers speak the Orbital films' language when the render style is Orbital
   (R.style === 'orbital'; reference/menus/common/orbital.css, orb.js; game/src/game/orbital.js).
     - colours: white hairlines #F6F5F2, one yellow #F4D23C for the one key thing (your selection, or your salvo while
       one flies: game.orbital.yellow), coral only as the thin mark of hostility. Lime never.
     - labels: catalog labels, a 7 px square + the designation in DM Mono + a barcode (deterministic from the
       designation), the value dim after it; no chips, no backdrops.
     - brackets: hairline corners that fit (1.2 px), no dotted frame; leaders solid hairlines at .7.

   OrbOverlay(ov) is a drop-in for the engine's Overlay (engine/overlay.js: tag, tagSize, bracket, box, leader, mark,
   text, dline, fitBox, clampBox, ctx, ui, worldA, avoid): a system hands it to its Point Cloud drawing code in the
   Orbital style and the same calls come out as catalog labels and hairlines. orbOverlay(ov) keeps one per overlay.
   Colours given in the Point Cloud kit are mapped: lime -> white, coral -> white for lines and text, coral kept for
   marks and the label square; 'hi' (or o.hi) -> the yellow.

   3D (sensors, selection): ringW / lineW / arcW draw hairlines through R.wire (the orbital system flushes them) in
   place of the dotted rings and lines (sensors/core.js ringDots, lineDots); orbRgb maps a 0..255 colour. */

export const OW = '#F6F5F2', OHI = '#F4D23C', OCO = '#FF6A3D';
export const MONO = '"DM Mono", "Geist Mono", Consolas, monospace', SANS = 'Inter, Geist, "Segoe UI", sans-serif';
export const W1 = [246 / 255, 245 / 255, 242 / 255], HI1 = [244 / 255, 210 / 255, 60 / 255], CO1 = [1, 106 / 255, 61 / 255];
export const orbOn = R => !!(R && R.wire && R.style === 'orbital');
const TAU = Math.PI * 2;

/* ---------------- colours ---------------- */
/* 'lime' | 'coral' | 'yellow' | 'white' of a 0..255 rgb */
function hueOf(r, g, b) {
  if (r > 225 && g > 180 && g < 230 && b < 120) return 'yellow';
  if (g > 195 && b < 190 && r < 238 && g - b > 45) return 'lime';
  if (r > 220 && g < 190 && r - b > 80) return 'coral';
  return 'white';
}
const CCACHE = new Map();
function parse(col) {
  let p = CCACHE.get(col);
  if (p) return p;
  let r = 255, g = 255, b = 255, a = 1;
  if (typeof col === 'string') {
    if (col[0] === '#' && col.length >= 7) { r = parseInt(col.slice(1, 3), 16); g = parseInt(col.slice(3, 5), 16); b = parseInt(col.slice(5, 7), 16); }
    else { const m = col.match(/rgba?\(([^)]*)\)/); if (m) { const v = m[1].split(',').map(parseFloat); r = v[0]; g = v[1]; b = v[2]; if (v.length > 3) a = v[3]; } }
  }
  p = { hue: hueOf(r, g, b), a };
  if (CCACHE.size > 400) CCACHE.clear();
  CCACHE.set(col, p);
  return p;
}
const rgbaW = a => `rgba(246,245,242,${+a.toFixed(3)})`;
/* a Point Cloud CSS colour -> the Orbital one. role: 'line' | 'text' (coral -> white) or 'mark' (coral kept) */
export function orbCol(col, role) {
  if (!col) return OW;
  const p = parse(col);
  if (p.hue === 'yellow') return col;
  if (p.hue === 'coral' && role === 'mark') return p.a < 1 ? `rgba(255,106,61,${p.a})` : OCO;
  return p.a < 1 ? rgbaW(p.a) : OW;
}
/* a 0..255 rgb -> 0..1 for the hairlines: lime -> white, coral kept (hostility), anything else white */
export function orbRgb(rgb) {
  if (!rgb) return W1;
  const h = hueOf(rgb[0], rgb[1], rgb[2]);
  return h === 'coral' ? CO1 : h === 'yellow' ? HI1 : W1;
}

/* ---------------- the catalog label ---------------- */
function h32(s) { let h = 2166136261 >>> 0; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h || 1; }
const BARS = new Map();
/* barcode ticks of a designation: [x, w, h (0..1)] ... and the width (px at 1) (reference/menus/common/orb.js) */
export function bars(code) {
  code = String(code || '');
  let b = BARS.get(code);
  if (b) return b;
  let s = h32(code);
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
  const out = []; let x = 0;
  for (let i = 0; i < 10; i++) { const w = r() < .28 ? 2 : 1, short = r() < .18; out.push(x, w, short ? .55 : 1); x += w + (r() < .35 ? 2 : 1.5); }
  b = { b: out, w: Math.ceil(x - 1) };
  if (BARS.size > 600) BARS.clear();
  BARS.set(code, b);
  return b;
}
/* draw a barcode at (x, y = its baseline), k: scale */
export function drawBars(ctx, x, y, code, k, col) {
  const B = bars(code), hh = 9 * k;
  ctx.fillStyle = col || OW;
  for (let i = 0; i < B.b.length; i += 3) { const h = Math.round(hh * B.b[i + 2]); ctx.fillRect(Math.round(x + B.b[i] * k), Math.round(y) - h, Math.max(1, Math.round(B.b[i + 1] * k)), h); }
  return B.w * k;
}
/* the square: 'w' filled white, 'o' outline, 'y' yellow, 'c' coral */
export function drawSq(ctx, x, y, s, sq) {
  x = Math.round(x); y = Math.round(y);
  if (sq === 'o') { ctx.strokeStyle = OW; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, s - 1, s - 1); }
  else { ctx.fillStyle = sq === 'y' ? OHI : sq === 'c' ? OCO : OW; ctx.fillRect(x, y, s, s); }
}

/* ---------------- the Overlay in the Orbital language ---------------- */
const SQ = { lime: 'w', coral: 'c', white: 'o', ghost: 'o', hi: 'y', yellow: 'y' };
export class OrbOverlay {
  constructor(ov) { this.ov = ov; this._w = new Map(); }
  get ctx() { return this.ov.ctx; }
  get cv() { return this.ov.cv; }
  get ui() { return this.ov.ui; }
  get worldA() { return this.ov.worldA; }
  get avoid() { return this.ov.avoid; }
  set avoid(v) { this.ov.avoid = v; }
  get margin() { return this.ov.margin; }
  get W() { return this.ov.W; }
  get H() { return this.ov.H; }
  get dpr() { return this.ov.dpr; }
  fitBox(x, y, w, h, avoid, margin) { return this.ov.fitBox(x, y, w, h, avoid, margin); }
  clampBox(b, m) { return this.ov.clampBox(b, m); }
  _meas(s, font) {
    const key = font + '|' + s;
    let w = this._w.get(key);
    if (w === undefined) { const c = this.ov.ctx; c.font = font; w = c.measureText(s).width; if (this._w.size > 4000) this._w.clear(); this._w.set(key, w); }
    return w;
  }
  _fonts(o) {
    const k = o && o.raw ? 1 : this.ov.ui, fs = ((o && o.size) || 11.5) * 1.09 * k;
    return { k, fs, f1: `400 ${fs.toFixed(2)}px ${MONO}`, f2: `400 ${(fs * .94).toFixed(2)}px ${MONO}` };
  }
  _parts(id, label, value) {
    const t1 = id && label ? id + ' · ' + label : (id || label || '');
    return [String(t1), value === undefined || value === null ? '' : String(value)];
  }
  /* [square][ID · LABEL][  value][barcode] on one line */
  tagSize(id, label, value, o) {
    const F = this._fonts(o), [t1, v] = this._parts(id, label, value), k = F.k * F.fs / (12.5 * F.k);
    const w = 7 * k + 7 * k + (t1 ? this._meas(t1, F.f1) : 0) + (v ? 9 * k + this._meas(v, F.f2) : 0) + 7 * k + bars(id || label).w * k;
    return [Math.ceil(w), Math.round(F.fs + 6 * F.k)];
  }
  tag(x, y, id, label, value, o) {
    o = o || {};
    const a = (o.a === undefined ? 1 : o.a) * this.ov.worldA;
    if (a <= .005) return null;
    const F = this._fonts(o), [t1, v] = this._parts(id, label, value), k = F.fs / 12.5;
    const sz = this.tagSize(id, label, value, o), W = sz[0], H = sz[1];
    if (o.align === 'right') x -= W; else if (o.align === 'center') x -= W / 2;
    if (o.fit) { const f = this.ov.fitBox(x, y, W, H, Array.isArray(o.fit) ? o.fit : undefined); x = f[0]; y = f[1]; }
    else if (o.fit === undefined && !o.raw && this.ov.avoid && this.ov.avoid.length) {
      const av = this.ov.avoid;
      for (let i = 0; i < av.length; i++) { const r = av[i]; if (x < r[2] && x + W > r[0] && y < r[3] && y + H > r[1]) { const f = this.ov.fitBox(x, y, W, H); x = f[0]; y = f[1]; break; } }
    }
    x = Math.round(x); y = Math.round(y);
    const c = this.ov.ctx, kind = o.hi ? 'hi' : (o.kind || 'white'), sq = SQ[kind] || 'o', my = y + H / 2;
    if (o.anchor) {
      const ax = o.anchor[0], ay = o.anchor[1], nx = Math.max(x, Math.min(x + W, ax)), ny = Math.max(y, Math.min(y + H, ay));
      if (Math.hypot(nx - ax, ny - ay) > (o.leadMin === undefined ? 10 : o.leadMin) * F.k) {
        this.leader(ax, ay, nx, ny, null, .8 * a / (this.ov.worldA || 1));
        c.globalAlpha = a; c.fillStyle = kind === 'hi' ? OHI : OW; c.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 2, 2);
      }
    }
    c.globalAlpha = a * (kind === 'ghost' ? .55 : 1);
    drawSq(c, x, my - 3.5 * k, 7 * k, sq);
    let cx = x + 14 * k;
    c.textBaseline = 'middle'; c.fillStyle = OW;
    if (t1) { c.font = F.f1; c.fillText(t1, cx, my + .5); cx += this._meas(t1, F.f1); }
    if (v) {
      cx += 9 * k; c.font = F.f2;
      const vc = o.valCol ? parse(o.valCol) : null;
      c.globalAlpha = a * (kind === 'hi' ? 1 : vc && vc.a < 1 ? Math.max(.5, vc.a) * .85 : .62);
      c.fillText(v, cx, my + .5); cx += this._meas(v, F.f2);
      c.globalAlpha = a * (kind === 'ghost' ? .55 : 1);
    }
    drawBars(c, cx + 7 * k, my + 4.5 * k, id || label, k, OW);
    c.textBaseline = 'alphabetic'; c.globalAlpha = 1;
    return [x, y, x + W, y + H];
  }
  /* hairline corners that fit the box (the films' bracket: 1.2 px, corners 6..16 px, no frame) */
  bracket(b, col, a, pad, len) {
    if (!b) return null;
    const k = this.ov.ui, c = this.ov.ctx;
    pad = (pad === undefined ? 6 : pad) * k; a = (a === undefined ? 1 : a) * this.ov.worldA;
    if (a <= .005) return null;
    const x0 = Math.round(b[0] - pad) + .5, y0 = Math.round(b[1] - pad) + .5, x1 = Math.round(b[2] + pad) + .5, y1 = Math.round(b[3] + pad) + .5;
    const L = Math.max(4 * k, Math.min((len || 14) * k, (x1 - x0) * .3, (y1 - y0) * .3, 16 * k));
    c.strokeStyle = orbCol(col, 'line'); c.globalAlpha = a; c.lineWidth = 1.2; c.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { c.moveTo(px + sx * L, py); c.lineTo(px, py); c.lineTo(px, py + sy * L); }
    c.stroke(); c.lineWidth = 1; c.globalAlpha = 1;
    return [x0, y0, x1, y1];
  }
  /* a hairline box */
  box(b, col, a) {
    if (!b) return;
    a = (a === undefined ? .8 : a) * this.ov.worldA; if (a <= .005) return;
    const c = this.ov.ctx; c.strokeStyle = orbCol(col, 'line'); c.globalAlpha = a * .8; c.lineWidth = 1;
    c.strokeRect(Math.round(b[0]) + .5, Math.round(b[1]) + .5, Math.round(b[2] - b[0]), Math.round(b[3] - b[1])); c.globalAlpha = 1;
  }
  /* a solid hairline leader (the films': .7) */
  leader(x0, y0, x1, y1, col, a) {
    a = (a === undefined ? .8 : a) * this.ov.worldA; if (a <= .005) return;
    const c = this.ov.ctx, p = col ? parse(col) : null;
    c.strokeStyle = p && p.hue === 'yellow' ? OHI : OW; c.globalAlpha = a * .8; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.globalAlpha = 1;
  }
  /* a square mark: coral stays coral (hostility), lime goes white */
  mark(x, y, s, col, a, fill) {
    a = (a === undefined ? 1 : a) * this.ov.worldA; if (a <= .005) return;
    const c = this.ov.ctx; s = Math.round((s || 7) * this.ov.ui * .85); c.globalAlpha = a;
    const cc = orbCol(col, 'mark');
    if (fill) { c.fillStyle = cc; c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); }
    else { c.strokeStyle = cc; c.lineWidth = 1; c.strokeRect(Math.round(x - s / 2) + .5, Math.round(y - s / 2) + .5, s - 1, s - 1); }
    c.globalAlpha = 1;
  }
  /* readouts in DM Mono (Inter with o.sans), as given (no forced upper case), white */
  text(x, y, s, o) {
    o = o || {};
    const c = this.ov.ctx, px = (o.size || 11.5) * 1.06 * (o.raw ? 1 : this.ov.ui), a = (o.a === undefined ? 1 : o.a) * this.ov.worldA;
    if (a <= .005) return;
    c.font = `${o.weight === 600 ? 500 : 400} ${px.toFixed(2)}px ${o.sans ? SANS : MONO}`;
    const p = o.col ? parse(o.col) : { hue: 'white', a: .62 };
    c.fillStyle = p.hue === 'yellow' ? OHI : OW; c.globalAlpha = a * Math.min(1, p.a < 1 ? p.a : 1);
    c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'alphabetic';
    c.fillText(o.upper === false || o.sans ? String(s) : String(s).toUpperCase(), Math.round(x), Math.round(y));
    c.textAlign = 'left'; c.globalAlpha = 1;
  }
  /* screen line: a hairline */
  dline(x0, y0, x1, y1, step, s, col, a) {
    a = (a === undefined ? 1 : a) * this.ov.worldA; if (a <= .005) return;
    const c = this.ov.ctx; c.strokeStyle = orbCol(col, 'line'); c.globalAlpha = a * .8; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.globalAlpha = 1;
  }
}
const ADAPT = new WeakMap();
export function orbOverlay(ov) {
  let a = ADAPT.get(ov);
  if (!a) { a = new OrbOverlay(ov); ADAPT.set(ov, a); }
  return a;
}
/* the overlay a system draws through this frame: the engine's, or its Orbital adapter */
export const styledOverlay = (R, ov) => orbOn(R) ? orbOverlay(ov) : ov;

/* ---------------- hairlines in the world (R.wire, flushed by the orbital system) ---------------- */
/* o (as the sensors' dotOpt): { rgb (0..255), a, step (px: >= 6 dashed), size (2: bolder), drape (terrain), lift (m) };
   hi: the yellow instead of the mapped colour */
const V3 = [0, 0, 0];
function visSphere(V, x, y, z, r) { return !V || V.vis(x, y, z, r); }
/* a horizontal ring (bearings a0..a1 clockwise from north), draped on the terrain when o.drape */
export function ringW(W, V, cx, cy, cz, r, o, a0, a1) {
  if (!W || r <= 0) return 0;
  if (V && !visSphere(V, cx, cy, cz, r)) return 0;
  const c = o.hi ? HI1 : orbRgb(o.rgb), al = (o.a === undefined ? .8 : o.a) * (o.size > 1 ? 1 : .8);
  if (al <= .004) return 0;
  if (a0 === undefined) { a0 = 0; a1 = TAU; }
  // segments from the ring's size on screen (at its centre's depth; near rings get the most)
  let n = 96;
  if (V) { const zc = Math.max(V.near, V.depth ? V.depth(cx, cy, cz) : 1), rp = r * V.fl / Math.max(zc, r * .25); n = Math.round(Math.min(360, Math.max(24, rp * TAU / 7))); }
  n = Math.max(6, Math.round(n * (a1 - a0) / TAU));
  const T = o.drape || null, lift = o.lift || 0, dash = (o.step || 5) >= 6;
  const da = (a1 - a0) / n;
  let px = cx + Math.sin(a0) * r, pz = cz + Math.cos(a0) * r, py = T ? Math.max(0, T.heightAt(px, pz)) + lift : cy + lift;
  let m = 0;
  for (let i = 1; i <= n; i++) {
    const ang = a0 + i * da, qx = cx + Math.sin(ang) * r, qz = cz + Math.cos(ang) * r, qy = T ? Math.max(0, T.heightAt(qx, qz)) + lift : cy + lift;
    if (!dash || (i & 3) < 2) { W.seg(px, py, pz, qx, qy, qz, c[0], c[1], c[2], al); m++; }
    px = qx; py = qy; pz = qz;
  }
  return m;
}
/* a straight hairline a -> b (draped: split so it follows the ground; dashed for step >= 6) */
export function lineW(W, V, ax, ay, az, bx, by, bz, o) {
  if (!W) return 0;
  const c = o.hi ? HI1 : orbRgb(o.rgb), al0 = o.a === undefined ? .8 : o.a;
  const L = Math.hypot(bx - ax, by - ay, bz - az); if (L < 1e-6) return 0;
  if (V && !visSphere(V, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, L / 2)) return 0;
  const T = o.drape || null, lift = o.lift || 0, dash = (o.step || 5) >= 6, fn = typeof al0 === 'function';
  let n = T ? Math.max(2, Math.min(96, Math.ceil(L / 250))) : 1;
  if (dash) {
    // dashes about 6 px on, 5 off at the middle of the line
    let pxL = 60;
    if (V) { const zc = Math.max(V.near, V.depth((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)); pxL = L * V.fl / zc; }
    n = Math.max(n, Math.min(200, Math.ceil(pxL / 11) * 2));
  }
  const k = o.size > 1 ? 1 : .8;
  let px = ax, py = T ? Math.max(0, T.heightAt(ax, az)) + lift : ay + lift, pz = az;
  for (let i = 1; i <= n; i++) {
    const t = i / n, qx = ax + (bx - ax) * t, qz = az + (bz - az) * t, qy = T ? Math.max(0, T.heightAt(qx, qz)) + lift : ay + (by - ay) * t + lift;
    if (!dash || (i & 1)) { const a = (fn ? al0(t - .5 / n) : al0) * k; if (a > .004) W.seg(px, py, pz, qx, qy, qz, c[0], c[1], c[2], a); }
    px = qx; py = qy; pz = qz;
  }
  return n;
}
/* a small hairline cross (a return, a point) of s px at its depth */
export function crossW(W, V, x, y, z, s, rgb, a) {
  if (!W || a <= .004) return;
  const zc = V.depth(x, y, z); if (zc < V.near) return;
  const m = s * zc / V.fl, R = V.r, U = V.u, c = rgb || W1;
  W.seg(x - R[0] * m, y - R[1] * m, z - R[2] * m, x + R[0] * m, y + R[1] * m, z + R[2] * m, c[0], c[1], c[2], a);
  W.seg(x - U[0] * m, y - U[1] * m, z - U[2] * m, x + U[0] * m, y + U[1] * m, z + U[2] * m, c[0], c[1], c[2], a);
}
/* a camera-facing hairline circle of r metres (n segments from its size on screen) */
export function discW(W, V, x, y, z, r, rgb, a, nMax) {
  if (!W || a <= .004 || r <= 0) return;
  const zc = V.depth(x, y, z); if (zc < V.near + r * .2) return;
  const rp = r * V.fl / zc; if (rp < .6) return;
  const n = Math.max(8, Math.min(nMax || 48, Math.round(rp * TAU / 6))), R = V.r, U = V.u, c = rgb || W1;
  let px = x + R[0] * r, py = y + R[1] * r, pz = z + R[2] * r;
  for (let i = 1; i <= n; i++) {
    const t = i / n * TAU, cs = Math.cos(t) * r, sn = Math.sin(t) * r;
    const qx = x + R[0] * cs + U[0] * sn, qy = y + R[1] * cs + U[1] * sn, qz = z + R[2] * cs + U[2] * sn;
    W.seg(px, py, pz, qx, qy, qz, c[0], c[1], c[2], a);
    px = qx; py = qy; pz = qz;
  }
}
export { V3 };

/* The engine's dotted world lines (R.fx.path, and line / arc / ring through it) are how every system marks the world
   in the Point Cloud style (the orders' paths and rings, the sonar's, the reach rings). In the Orbital style they are
   hairlines: installed once (by the sensors), R.fx.path draws through R.wire while R.style is 'orbital' (lime ->
   white, coral kept for hostility; o.step >= 6 dashed, o.size > 1 bolder, o.drape follows the ground), and exactly
   as before otherwise. */
export function installOrbitalPaths(R, fadeOf) {
  const fx = R && R.fx;
  if (!fx || fx._orbPaths || typeof fx.path !== 'function') return;
  const orig = fx.path;
  fx._orbPaths = true;
  const T = () => R.terrain;
  fx.path = function (pts, o) {
    if (!orbOn(R) || !pts || pts.length < 2) return orig.call(this, pts, o);
    o = o || {};
    const W = R.wire, cam = R.camera, c = orbRgb(o.rgb), a = (o.a === undefined ? .8 : o.a) * ((o.size || 1) > 1 ? 1 : .8) * (fadeOf ? fadeOf() : 1);
    if (a <= .004) return;
    const drape = !!o.drape, lift = o.lift || 0, dash = (o.step || 5) >= 6, Tr = T();
    const yAt = (x, y, z) => drape && Tr ? Math.max(0, Tr.heightAt(x, z)) + lift : (y || 0) + lift;
    let k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], L = Math.hypot(B[0] - A[0], B[2] - A[2], (B[1] || 0) - (A[1] || 0));
      if (L < 1e-6) continue;
      // pieces: follow the ground when draped; dashes about 6 px on and 5 off at the segment's middle
      let n = drape ? Math.max(1, Math.min(64, Math.ceil(L / 200))) : 1;
      if (dash) {
        const zc = Math.max(cam.near || .5, (A[0] + B[0]) / 2 * cam.f[0] + ((A[1] || 0) + (B[1] || 0)) / 2 * cam.f[1] + (A[2] + B[2]) / 2 * cam.f[2] - (cam.eye[0] * cam.f[0] + cam.eye[1] * cam.f[1] + cam.eye[2] * cam.f[2]));
        n = Math.max(n, Math.min(240, Math.ceil(L * cam.fl / zc / 11) * 2));
      }
      let px = A[0], py = yAt(A[0], A[1], A[2]), pz = A[2];
      for (let j = 1; j <= n; j++) {
        const t = j / n, x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t, y = yAt(x, (A[1] || 0) + ((B[1] || 0) - (A[1] || 0)) * t, z);
        if (!dash || ((k++) & 1) === 0) W.seg(px, py, pz, x, y, z, c[0], c[1], c[2], a);
        px = x; py = y; pz = z;
      }
    }
  };
}

/* a camera-facing scalloped billow (the Orbital films' smoke and cloud: lobes bulging out, cusps between, a fold
   inside), rx across and ry tall in the world (a flattened puff shows its breadth when seen from above); V: the sensors'
   View (e, f, r, u, fl, near, depth, vis) */
const fr = x => x - Math.floor(x);
function hs(a, b) { let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return ((h >>> 0) + .5) / 4294967296; }
export function billowW(W, V, x, y, z, rx, ry, al, seed, age, folds) {
  if (!W || al <= .004 || rx <= 0) return;
  const zc = V.depth(x, y, z); if (zc < V.near) return;
  const r = Math.max(rx, ry), near = Math.min(1, Math.max(0, (zc - r * .8) / (r * 1.8)));
  if (near <= 0) return;
  const Rp = r * V.fl / zc; if (Rp < 1.2) return;
  al *= near * (1 - Math.min(1, Math.max(0, (Rp - 900) / 900)));
  if (al <= .004 || !V.vis(x, y, z, r)) return;
  const sP = Math.abs(V.f[1]), cP = Math.sqrt(Math.max(0, 1 - sP * sP)), ryE = Math.sqrt((ry * cP) ** 2 + (rx * sP) ** 2);
  const R = V.r, U = V.u, c = W1;
  const nl = 5 + Math.floor(fr(seed * 7.31) * 4), per = Rp < 6 ? 1 : Math.min(7, Math.max(2, Math.round(Rp / (nl * 2.4)))), n = Math.max(Rp < 6 ? 7 : 12, nl * per);
  const dep = .2 * Math.min(1, Math.max(0, (Rp - 5) / 11)), f0 = 1 - dep;
  const sg = fr(seed * 3.7) < .5 ? 1 : -1, ph = seed * TAU + sg * age * .09, hsd = (seed * 131.7) | 0;
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= n; i++) {
    const th = ph + i / n * TAU, li = i / n * nl, j = Math.floor(li) % nl;
    const f = f0 + dep * Math.abs(Math.sin(Math.PI * li)) * (.65 + .7 * hs(j, hsd)), a = Math.cos(th) * rx * f, b = Math.sin(th) * ryE * f;
    const qx = x + R[0] * a + U[0] * b, qy = y + R[1] * a + U[1] * b, qz = z + R[2] * a + U[2] * b;
    if (i) W.seg(px, py, pz, qx, qy, qz, c[0], c[1], c[2], al);
    px = qx; py = qy; pz = qz;
  }
  if (!folds || Rp < 8) return;
  const a0 = ph * 1.3 + seed * 4.1, ox = Math.cos(a0) * rx * .4, oy = Math.sin(a0) * ryE * .4, rr = .36, m = Math.min(9, Math.max(3, Math.round(Rp / 9)));
  for (let i = 0; i <= m; i++) {
    const th = a0 - 1.15 + 2.3 * i / m, a = ox + Math.cos(th) * rx * rr, b = oy + Math.sin(th) * ryE * rr;
    const qx = x + R[0] * a + U[0] * b, qy = y + R[1] * a + U[1] * b, qz = z + R[2] * a + U[2] * b;
    if (i) W.seg(px, py, pz, qx, qy, qz, c[0], c[1], c[2], al * .55);
    px = qx; py = qy; pz = qz;
  }
}
