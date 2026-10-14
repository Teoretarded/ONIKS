/* ORBITAL RAILGUN lattice: procedural point-cloud bodies (window.ORL), drawn straight into the kit's dot buffer.
   Nothing is pre-sampled: every frame each primitive lays its dots on a regular lattice in its own surface
   coordinates, at a spacing chosen per dot from its depth (power-of-two levels that fade in and out, so the grid
   never pops), which keeps a 340 m structure crisp from 2 m to 2000 m without storing millions of points.
   Primitives (model space, grouped in chunks with bounding spheres for culling and per-chunk flex offsets):
     line   hairline (edge, seam, cable), dots every PXL px, depth-faded
     tube   a member with a radius: a hairline when thin on screen, two silhouette hairlines and a lit lattice
            between them when thick
     panel  a parallelogram face on a cell lattice (normal-lit, two-sided or culled to a sparse dim back)
     lathe  a surface of revolution (modules, tanks, drums, dishes, cones, caps) on a ring x angle lattice
     knot   a node plate / knuckle / bolt: a dot far away, an outlined square close up
   Per primitive an effect channel `ch` and parameter `q` let the film light parts (lime waves, glows) through one
   callback per primitive. Render stays a pure function of the poses and the effect callback. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI;
const BW = 1920, BH = 1080;
const LIME = [198, 244, 50], HOT = [248, 255, 232], WH = [238, 238, 228];
const CTZ = new Uint8Array(65536); CTZ[0] = 16;
const IP2 = new Float32Array(17); for (let i = 0; i < 17; i++) IP2[i] = 1 / (1 << i);
for (let i = 1; i < 65536; i++) { let c = 0, v = i; while (!(v & 1)) { v >>= 1; c++; } CTZ[i] = c; }
const NT = 4096, COS = new Float32Array(NT), SIN = new Float32Array(NT);
for (let i = 0; i < NT; i++) { COS[i] = Math.cos(i / NT * TAU); SIN[i] = Math.sin(i / NT * TAU); }
const pow2 = x => { let p = 1; while (p < x && p < 65536) p <<= 1; return p; };

let K = null, C = null, D = null, U32 = null, OZ = null, OC = null, OW = 480;
/* per-frame globals */
const G = { PXF: 3.4, PXL: 1.5, SEAMPX: 7, zref: 400, g0: 1.25, g1: .0004, gmin: .55, occ: false, dots: 0, clip: null };
function frame(o) {
  K = window.ORK; C = K.C; D = K.pb.d; if (!U32 || U32.buffer !== D.buffer) U32 = new Uint32Array(D.buffer); OZ = K.OZ; OC = K.OC; OW = K.OW;
  Object.assign(G, o || {});
  G.g1 = .5 / (2.6 * G.zref);
  G.dots = 0; G.by = { l: 0, r: 0, t: 0, p: 0, y: 0, n: 0 };
}
const gain = z => { const g = G.g0 - G.g1 * z; return g < G.gmin ? G.gmin : g; };

/* ---------------- build ---------------- */
class Body {
  constructor(name) {
    this.name = name;
    this.L = []; this.T = []; this.P = []; this.Y = []; this.N = []; this.Rg = [];
    this.CH = []; this._c = null; this.off = null;
    this.chunk();
  }
  chunk(tag) {
    this._close();
    this._c = { l0: this.L.length / 10, t0: this.T.length / 10, p0: this.P.length / 20, y0: this.Y.length, n0: this.N.length / 7, r0: this.Rg.length / 14, tag: tag || '', pts: [] };
    return this;
  }
  _pt(p) { this._c.pts.push(p[0], p[1], p[2]); }
  _close() {
    const c = this._c; if (!c) return;
    c.l1 = this.L.length / 10; c.t1 = this.T.length / 10; c.p1 = this.P.length / 20; c.y1 = this.Y.length; c.n1 = this.N.length / 7; c.r1 = this.Rg.length / 14;
    if (c.l1 > c.l0 || c.t1 > c.t0 || c.p1 > c.p0 || c.y1 > c.y0 || c.n1 > c.n0 || c.r1 > c.r0) {
      const P = c.pts, n = P.length / 3; let mx = 0, my = 0, mz = 0;
      for (let i = 0; i < n; i++) { mx += P[i * 3]; my += P[i * 3 + 1]; mz += P[i * 3 + 2]; }
      mx /= n; my /= n; mz /= n; let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(P[i * 3] - mx, P[i * 3 + 1] - my, P[i * 3 + 2] - mz));
      c.c = [mx, my, mz]; c.r = r + .5; c.i = this.CH.length; delete c.pts;
      this.CH.push(c);
    }
    this._c = null;
  }
  done() { this._close(); this.chunk(); this._close(); this.off = new Float32Array(this.CH.length * 3); this.lit = new Float32Array(this.CH.length); this.lime = new Float32Array(this.CH.length); return this; }
  /* hairline a-b; br brightness; ch, q effect channel and parameter */
  line(a, b, br, ch, q, sp) { this.L.push(a[0], a[1], a[2], b[0], b[1], b[2], br === undefined ? .55 : br, ch || 0, q || 0, sp || 0); this._pt(a); this._pt(b); return this; }
  /* a circle (or arc a0..a1) drawn at a fixed screen step: centre c, unit axes U, W, radius r; sp LOD spacing (0: always) */
  ringP(c, U, W, r, br, ch, q, sp) {
    this.Rg.push(c[0], c[1], c[2], U[0], U[1], U[2], W[0], W[1], W[2], r, br === undefined ? .55 : br, ch || 0, q || 0, sp || 0);
    for (const s of [-1, 1]) { this._pt(V.add(c, V.mul(U, s * r))); this._pt(V.add(c, V.mul(W, s * r))); }
    return this;
  }
  poly(P, closed, br, ch, q) { for (let i = 0; i < P.length - 1; i++) this.line(P[i], P[i + 1], br, ch, q); if (closed && P.length > 2) this.line(P[P.length - 1], P[0], br, ch, q); return this; }
  ring(c, U, W, r, n, br, ch, q, a0, a1) {
    const P = []; a0 = a0 || 0; a1 = a1 === undefined ? TAU : a1; const full = a1 - a0 >= TAU - 1e-6;
    const m = full ? n : n + 1;
    for (let k = 0; k < m; k++) { const t = a0 + (a1 - a0) * k / n; P.push([c[0] + (U[0] * Math.cos(t) + W[0] * Math.sin(t)) * r, c[1] + (U[1] * Math.cos(t) + W[1] * Math.sin(t)) * r, c[2] + (U[2] * Math.cos(t) + W[2] * Math.sin(t)) * r]); }
    return this.poly(P, full, br, ch, q);
  }
  /* a member: tube of radius r a-b */
  tube(a, b, r, br, ch, q) { this.T.push(a[0], a[1], a[2], b[0], b[1], b[2], r, br === undefined ? .6 : br, ch || 0, q || 0); this._pt(a); this._pt(b); return this; }
  /* a face: corner o, full edge vectors u, v; cell (m, or [cu, cv]); opt { n, two, br, ch, q, edge (br or false), seams [su, sv] (cells), sbr } */
  panel(o, u, v, cell, opt) {
    opt = opt || {};
    const cu = Array.isArray(cell) ? cell[0] : cell, cv = Array.isArray(cell) ? cell[1] : cell;
    const Lu = V.len(u), Lv = V.len(v), nu = Math.max(1, Math.round(Lu / cu)), nv = Math.max(1, Math.round(Lv / cv));
    let n = opt.n || V.norm(V.cross(u, v));
    this.P.push(o[0], o[1], o[2], u[0] / nu, u[1] / nu, u[2] / nu, v[0] / nv, v[1] / nv, v[2] / nv, nu, nv, n[0], n[1], n[2], opt.br === undefined ? 1 : opt.br, opt.two ? 1 : 0, opt.ch || 0, opt.q || 0, Lu / nu, Lv / nv);
    const p1 = V.add(o, u), p2 = V.add(p1, v), p3 = V.add(o, v);
    this._pt(o); this._pt(p1); this._pt(p2); this._pt(p3);
    const eb = opt.edge === undefined ? .62 : opt.edge;
    if (eb !== false) { this.line(o, p1, eb, opt.ch, opt.q); this.line(p1, p2, eb, opt.ch, opt.q); this.line(p2, p3, eb, opt.ch, opt.q); this.line(p3, o, eb, opt.ch, opt.q); }
    if (opt.seams) {
      const [su, sv] = opt.seams, sb = opt.sbr === undefined ? .4 : opt.sbr;
      if (su) for (let i = su, k = 1; i < nu - .5; i += su, k++) { const a = V.mad(o, u, i / nu); this.line(a, V.add(a, v), sb, opt.ch, opt.q, su * Lu / nu * (1 << CTZ[k])); }
      if (sv) for (let j = sv, k = 1; j < nv - .5; j += sv, k++) { const a = V.mad(o, v, j / nv); this.line(a, V.add(a, u), sb, opt.ch, opt.q, sv * Lv / nv * (1 << CTZ[k])); }
    }
    return this;
  }
  /* an oriented box: centre c, unit axes ax, ay, az, half extents h; opt as panel plus skip ['x-'...] */
  obox(c, ax, ay, az, h, cell, opt) {
    opt = opt || {}; const sk = opt.skip || [];
    const P = (i, j, k) => [c[0] + ax[0] * h[0] * i + ay[0] * h[1] * j + az[0] * h[2] * k, c[1] + ax[1] * h[0] * i + ay[1] * h[1] * j + az[1] * h[2] * k, c[2] + ax[2] * h[0] * i + ay[2] * h[1] * j + az[2] * h[2] * k];
    const X2 = V.mul(ax, 2 * h[0]), Y2 = V.mul(ay, 2 * h[1]), Z2 = V.mul(az, 2 * h[2]);
    const fo = Object.assign({}, opt, { edge: false, seams: null });
    if (!sk.includes('x-')) this.panel(P(-1, -1, -1), Z2, Y2, cell, Object.assign({}, fo, { n: V.mul(ax, -1) }));
    if (!sk.includes('x+')) this.panel(P(1, -1, -1), Y2, Z2, cell, Object.assign({}, fo, { n: ax }));
    if (!sk.includes('y-')) this.panel(P(-1, -1, -1), X2, Z2, cell, Object.assign({}, fo, { n: V.mul(ay, -1) }));
    if (!sk.includes('y+')) this.panel(P(-1, 1, -1), Z2, X2, cell, Object.assign({}, fo, { n: ay }));
    if (!sk.includes('z-')) this.panel(P(-1, -1, -1), Y2, X2, cell, Object.assign({}, fo, { n: V.mul(az, -1) }));
    if (!sk.includes('z+')) this.panel(P(-1, -1, 1), X2, Y2, cell, Object.assign({}, fo, { n: az }));
    const eb = opt.edge === undefined ? .66 : opt.edge;
    if (eb !== false) {
      const C8 = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) this.line(C8[i], C8[j], eb, opt.ch, opt.q);
    }
    return this;
  }
  box(mn, mx, cell, opt) { return this.obox([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2], cell, opt); }
  /* surface of revolution about axis d through a; st [[s, r], ...]; opt { cell, br, two, seams (n longitudinal), rings (station hairlines), rbr, ch, q } */
  lathe(a, d, st, opt) {
    opt = opt || {};
    d = V.norm(d); const [U, W] = M3perp(d), cell = opt.cell || .3;
    const bands = [];
    let rmax = 0;
    for (let i = 0; i < st.length - 1; i++) {
      const [s0, r0] = st[i], [s1, r1] = st[i + 1], L = Math.hypot(s1 - s0, r1 - r0); if (L < 1e-6) continue;
      const na = Math.max(1, Math.round(L / cell)), rm = Math.max(r0, r1); rmax = Math.max(rmax, rm);
      const n0 = Math.min(NT, pow2(Math.max(8, TAU * rm / cell)));
      bands.push({ s0, r0, s1, r1, na, n0, kr: (s1 - s0) / L, ka: -(r1 - r0) / L });
    }
    this.Y.push({ a, d, U, W, bands, br: opt.br === undefined ? 1 : opt.br, two: !!opt.two, solid: !!opt.solid, ch: opt.ch || 0, q: opt.q || 0, cell, ang: opt.ang || null });
    for (const [s, r] of st) { const c = V.mad(a, d, s); this._pt(V.add(c, V.mul(U, r))); this._pt(V.add(c, V.mul(U, -r))); this._pt(V.add(c, V.mul(W, r))); this._pt(V.add(c, V.mul(W, -r))); }
    const rb = opt.rbr === undefined ? .4 : opt.rbr;
    if (opt.rings !== false) for (const [s, r] of st) if (r > .02) this.ringP(V.mad(a, d, s), U, W, r * 1.002, rb, opt.ch, opt.q, 0);
    if (opt.seams) for (let k = 0; k < opt.seams; k++) {
      const t = (k + .5) / opt.seams * TAU, dir = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t)));
      const spk = TAU * rmax / opt.seams * (1 << CTZ[k + 1]);
      for (let i = 0; i < st.length - 1; i++) { const [s0, r0] = st[i], [s1, r1] = st[i + 1]; if (Math.abs(s1 - s0) < 1e-6) continue; this.line(V.add(V.mad(a, d, s0), V.mul(dir, r0 * 1.003)), V.add(V.mad(a, d, s1), V.mul(dir, r1 * 1.003)), opt.sbr === undefined ? .4 : opt.sbr, opt.ch, opt.q, spk); }
    }
    return this;
  }
  cyl(a, b, r, opt) { const d = V.sub(b, a), L = V.len(d); const st = (opt && opt.caps) ? [[0, 0], [0, r], [L, r], [L, 0]] : [[0, r], [L, r]]; return this.lathe(a, d, st, opt); }
  /* a node plate / knuckle: centre, size (m), brightness */
  knot(p, s, br, ch, q) { this.N.push(p[0], p[1], p[2], s, br === undefined ? .8 : br, ch || 0, q || 0); this._pt(p); return this; }
}
function M3perp(d) { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const u = V.norm(V.cross(d, a)); return [u, V.cross(d, u)]; }

/* ---------------- draw ---------------- */
const XM = new Float64Array(24);
/* model -> camera for a rigid transform; light and eye in model space */
function prep(Tw, L) {
  const M = Tw.R, t = Tw.T, r = C.r, u = C.u, f = C.f, e = C.eye;
  for (let j = 0; j < 3; j++) {
    XM[j] = r[0] * M[j] + r[1] * M[3 + j] + r[2] * M[6 + j];
    XM[3 + j] = u[0] * M[j] + u[1] * M[3 + j] + u[2] * M[6 + j];
    XM[6 + j] = f[0] * M[j] + f[1] * M[3 + j] + f[2] * M[6 + j];
  }
  const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2];
  XM[9] = r[0] * dx + r[1] * dy + r[2] * dz; XM[10] = u[0] * dx + u[1] * dy + u[2] * dz; XM[11] = f[0] * dx + f[1] * dy + f[2] * dz;
  // light in camera space
  XM[15] = r[0] * L[0] + r[1] * L[1] + r[2] * L[2]; XM[16] = u[0] * L[0] + u[1] * L[1] + u[2] * L[2]; XM[17] = f[0] * L[0] + f[1] * L[1] + f[2] * L[2];
}
const FACE = 1.55;
const shade = (lam, fac) => { const w = 1 - fac; let b = .07 + .72 * (lam > 0 ? lam : 0) + .16 * fac + .34 * w * w * w; return FACE * b * (.55 + .45 * b); };

/* colour state for the current primitive */
let CR = 0, CG = 0, CB = 0, CA = 1;
const O = { a: 1, col: WH, lime: 0, fx: null, keep: 1, pxf: 1, back: .11, occ: false, lc: [255, 255, 255] };
/* fx(ch, q) -> 0..1 lime, 1..2 lime to white-hot, < 0 dimmed, 10..11 heat (warm), 11..12 heat to white-hot */
const HEAT = [255, 178, 112];
function setCol(ch, q) {
  const c = O.col; let l = O.lime, a = O.a, h = 0, w = 0;
  if (ch && O.fx) {
    const k = O.fx(ch, q);
    if (k >= 10) { w = Math.min(1, k - 10); if (k > 11) h = Math.min(1, k - 11); a *= 1 + .7 * w; }
    else if (k < 0) a *= Math.max(0, 1 + k);
    else if (k > 0) { if (k > l) l = Math.min(1, k); if (k > 1) h = Math.min(1, k - 1); a *= 1 + .6 * Math.min(1, k); }
  }
  CR = c[0] + (LIME[0] - c[0]) * l; CG = c[1] + (LIME[1] - c[1]) * l; CB = c[2] + (LIME[2] - c[2]) * l;
  if (w > 0) { CR += (HEAT[0] - CR) * w; CG += (HEAT[1] - CG) * w; CB += (HEAT[2] - CB) * w; }
  if (h > 0) { CR += (HOT[0] - CR) * h; CG += (HOT[1] - CG) * h; CB += (HOT[2] - CB) * h; }
  CA = a;
}

/* a slab clip (camera space): points with c0 < n.p < c1 are not drawn. G.clip = { on, n: [x, y, z], c0, c1 } set per
   frame by the film; a body opts in with o.clip (an X-ray that slices a part open) */
let PXLc = 1.5;
let CL = false, CNX = 0, CNY = 0, CNZ = 0, CC0 = 0, CC1 = 0;
function clipOn(o) {
  const c = G.clip; CL = !!(o && o.clip && c && c.on);
  if (CL) { CNX = c.n[0]; CNY = c.n[1]; CNZ = c.n[2]; CC0 = c.c0; CC1 = c.c1; }
}
const clipped = (x, y, z) => { const s = CNX * x + CNY * y + CNZ * z; return s > CC0 && s < CC1; };
/* a hairline with the slab cut out of it */
function lineC(ax, ay, az, bx, by, bz, bri, step) {
  if (!CL) { lineC0(ax, ay, az, bx, by, bz, bri, step); return; }
  const sa = CNX * ax + CNY * ay + CNZ * az, sb = CNX * bx + CNY * by + CNZ * bz;
  if (Math.abs(sb - sa) < 1e-9) { if (!(sa > CC0 && sa < CC1)) lineC0(ax, ay, az, bx, by, bz, bri, step); return; }
  const t0 = (CC0 - sa) / (sb - sa), t1 = (CC1 - sa) / (sb - sa), lo = Math.min(t0, t1), hi = Math.max(t0, t1);
  if (lo >= 1 || hi <= 0) { lineC0(ax, ay, az, bx, by, bz, bri, step); return; }
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  if (lo > 0) lineC0(ax, ay, az, ax + dx * lo, ay + dy * lo, az + dz * lo, bri, step);
  if (hi < 1) lineC0(ax + dx * hi, ay + dy * hi, az + dz * hi, bx, by, bz, bri, step);
}
/* screen-space hairline between camera-space points, depth-faded; bri brightness */
function lineC0(ax, ay, az, bx, by, bz, bri, step) {
  const n = C.near;
  if (az < n && bz < n) return;
  if (az < n) { const t = (n - az) / (bz - az); ax += (bx - ax) * t; ay += (by - ay) * t; az = n; }
  else if (bz < n) { const t = (n - bz) / (az - bz); bx += (ax - bx) * t; by += (ay - by) * t; bz = n; }
  const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const x0 = cx + F * ax / az, y0 = cy - F * ay / az, x1 = cx + F * bx / bz, y1 = cy - F * by / bz;
  if ((x0 < 0 && x1 < 0) || (y0 < 0 && y1 < 0) || (x0 >= BW && x1 >= BW) || (y0 >= BH && y1 >= BH)) return;
  const dx = x1 - x0, dy = y1 - y0, Ls = Math.sqrt(dx * dx + dy * dy);
  const m = Math.max(1, Math.ceil(Ls / step));
  // clip the parameter range to the screen
  let t0 = 0, t1 = 1;
  if (dx !== 0) { let ta = -x0 / dx, tb = (BW - 1 - x0) / dx; if (dx < 0) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; } else if (x0 < 0 || x0 > BW - 1) return;
  if (dy !== 0) { let ta = -y0 / dy, tb = (BH - 1 - y0) / dy; if (dy < 0) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; } else if (y0 < 0 || y0 > BH - 1) return;
  if (t0 > t1) return;
  const k0 = Math.ceil(t0 * m - 1e-9), k1 = Math.floor(t1 * m + 1e-9);
  const iza = 1 / az, izb = 1 / bz, g0 = G.g0, g1 = G.g1, gm = G.gmin, im = 1 / m;
  const r = CR * bri * CA, g = CG * bri * CA, b = CB * bri * CA;
  const occ = G.occ && O.occ;
  let ga = g0 - g1 * az, gb = g0 - g1 * bz; if (ga < gm) ga = gm; if (gb < gm) gb = gm;
  if (!occ && Math.abs(ga - gb) < .04) {
    const gg = (ga + gb) * .5, R_ = r * gg, G_ = g * gg, B_ = b * gg;
    for (let k = k0; k <= k1; k++) {
      const t = k * im, q = (((y0 + dy * t) | 0) * BW + ((x0 + dx * t) | 0)) << 2;
      if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
    }
  } else for (let k = k0; k <= k1; k++) {
    const t = k * im, x = x0 + dx * t, y = y0 + dy * t;
    const z = 1 / (iza + (izb - iza) * t);
    if (occ) { const ot = ((y | 0) >> 2) * OW + ((x | 0) >> 2); if (OC[ot] && z > OZ[ot] * 1.015 + .06) continue; }
    let gg = g0 - g1 * z; if (gg < gm) gg = gm;
    const q = ((y | 0) * BW + (x | 0)) << 2, R_ = r * gg, G_ = g * gg, B_ = b * gg;
    if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
  }
  G.dots += k1 - k0 + 1;
}
/* a dot (camera space) */
function dotC(x, y, z, s, r, g, b) {
  if (z < C.near || (CL && clipped(x, y, z))) return;
  const F = C.fl, sx = C.cx + C.shake[0] + F * x / z, sy = C.cy + C.shake[1] - F * y / z;
  if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) return;
  if (G.occ && O.occ && K.occT(sx, sy, z)) return;
  const gg = gain(z);
  if (s <= 1) { const q = ((sy | 0) * BW + (sx | 0)) << 2; if (D[q] < r * gg) D[q] = r * gg; if (D[q + 1] < g * gg) D[q + 1] = g * gg; if (D[q + 2] < b * gg) D[q + 2] = b * gg; }
  else K.pb.dot(sx, sy, s, r * gg, g * gg, b * gg, 1);
  G.dots++;
}

const CAM = new Float64Array(3);
function toCam(x, y, z) { CAM[0] = XM[0] * x + XM[1] * y + XM[2] * z + XM[9]; CAM[1] = XM[3] * x + XM[4] * y + XM[5] * z + XM[10]; CAM[2] = XM[6] * x + XM[7] * y + XM[8] * z + XM[11]; }
/* sphere in the frustum (camera space centre) */
function sphC(x, y, z, r) {
  if (z < C.near - r) return false;
  const Fl = C.fl, xr = (BW - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((x - xr * z) / k > r || (-x - xr * z) / k > r) return false;
  if ((y - yt * z) / ky > r || (-y - yt * z) / ky > r) return false;
  return true;
}

/* panel kernel (camera space): o corner, u v per-cell steps, nu nv cells, lu lv cell lengths, n normal */
let PB = 0, PBK = .11, PTWO = 0;
let Pox, Poy, Poz, Pux, Puy, Puz, Pvx, Pvy, Pvz, Plu, Plv;
function panelK(nu, nv, nx, ny, nz, br, two) {
  // shade at the centre
  const mx = Pox + (Pux * nu + Pvx * nv) * .5, my = Poy + (Puy * nu + Pvy * nv) * .5, mz = Poz + (Puz * nu + Pvz * nv) * .5;
  const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
  let fac = -(nx * mx + ny * my + nz * mz) / ml, lam = nx * XM[15] + ny * XM[16] + nz * XM[17];
  let back = false;
  if (fac < 0) { if (two) { fac = -fac; lam = -lam * .7; } else back = true; }
  PB = back ? O.back * br : shade(lam, fac) * br;
  PBK = back ? 2.2 : 1;
  if (PB * CA < .01) return;
  tileK(0, nu, 0, nv);
}
function tileK(i0, i1, j0, j1) {
  const n = C.near, F = C.fl;
  // corners
  const z00 = Poz + Puz * i0 + Pvz * j0, z10 = Poz + Puz * i1 + Pvz * j0, z01 = Poz + Puz * i0 + Pvz * j1, z11 = Poz + Puz * i1 + Pvz * j1;
  const zmin = Math.min(z00, z10, z01, z11), zmax = Math.max(z00, z10, z01, z11);
  if (zmax < n) return;
  if (CL) {
    // the whole tile inside the clip slab: skip it
    let all = true;
    for (let k = 0; k < 4 && all; k++) { const ii = k & 1 ? i1 : i0, jj = k & 2 ? j1 : j0, sv = CNX * (Pox + Pux * ii + Pvx * jj) + CNY * (Poy + Puy * ii + Pvy * jj) + CNZ * (Poz + Puz * ii + Pvz * jj); if (!(sv > CC0 && sv < CC1)) all = false; }
    if (all) return;
  }
  const di = i1 - i0, dj = j1 - j0;
  if (zmin < n) { if (di * dj > 4) { split(i0, i1, j0, j1); return; } }
  else {
    // screen bbox of the corners
    const cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let k = 0; k < 4; k++) {
      const ii = k & 1 ? i1 : i0, jj = k & 2 ? j1 : j0, zz = Poz + Puz * ii + Pvz * jj;
      const sx = cx + F * (Pox + Pux * ii + Pvx * jj) / zz, sy = cy - F * (Poy + Puy * ii + Pvy * jj) / zz;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    if (x1 < 0 || y1 < 0 || x0 >= BW || y0 >= BH) return;
    if (zmax > 1.7 * zmin && (di > 2 || dj > 2)) { split(i0, i1, j0, j1); return; }
    if ((x1 - x0) * (y1 - y0) > 400000 && (di > 4 || dj > 4)) { split(i0, i1, j0, j1); return; }
  }
  const zm = Math.max(n, zmin), pxf = G.PXF * O.pxf * PBK;
  const nU0 = pxf * zm / (Plu * F), nV0 = pxf * zm / (Plv * F);
  const su = Math.max(1, pow2(nU0 * .5)), sv = Math.max(1, pow2(nV0 * .5));
  const kU = pxf / (Plu * F), kV = pxf / (Plv * F);
  const cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const br = PB, r = CR * br * CA, g = CG * br * CA, b = CB * br * CA;
  const g0 = G.g0, g1 = G.g1, gm = G.gmin, occ = G.occ && O.occ, keep = O.keep;
  const ia = Math.ceil(i0 / su) * su, ja = Math.ceil(j0 / sv) * sv;
  let cnt = 0;
  for (let i = ia; i < i1; i += su) {
    const cu = CTZ[i & 65535], lu = 1 << cu, ilu = IP2[cu];
    const bx = Pox + Pux * (i + .5), by = Poy + Puy * (i + .5), bz = Poz + Puz * (i + .5);
    for (let j = ja; j < j1; j += sv) {
      const z = bz + Pvz * (j + .5); if (z < n) continue;
      const nu = kU * z, nv = kV * z;
      if (nu >= 2 * lu) continue;
      const cv = CTZ[j & 65535], lv = 1 << cv;
      if (nv >= 2 * lv) continue;
      let a = (nu <= lu ? 1 : 2 - nu * ilu) * (nv <= lv ? 1 : 2 - nv * IP2[cv]);
      if (a < .06) continue;
      const x = bx + Pvx * (j + .5), y = by + Pvy * (j + .5), iz = F / z;
      if (CL && clipped(x, y, z)) continue;
      const sx = cx + x * iz; if (sx < 0 || sx >= BW) continue;
      const sy = cy - y * iz; if (sy < 0 || sy >= BH) continue;
      if (occ) { const ot = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (OC[ot] && z > OZ[ot] * 1.015 + .06) continue; }
      let gg = g0 - g1 * z; if (gg < gm) gg = gm; a *= gg;
      const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r * a, G_ = g * a, B_ = b * a;
      if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
      cnt++;
    }
  }
  G.dots += cnt;
}
function split(i0, i1, j0, j1) {
  const di = i1 - i0, dj = j1 - j0;
  // split along the index range spanning more depth
  const zu = Math.abs(Puz * di), zv = Math.abs(Pvz * dj);
  if ((zu >= zv && di > 1) || dj <= 1) { const m = i0 + (di >> 1); tileK(i0, m, j0, j1); tileK(m, i1, j0, j1); }
  else { const m = j0 + (dj >> 1); tileK(i0, i1, j0, m); tileK(i0, i1, m, j1); }
}

/* lathe kernel: one surface of revolution (model-space record Y) */
function latheK(Y) {
  const a = Y.a, d = Y.d, U = Y.U, W = Y.W;
  toCam(a[0], a[1], a[2]); const ax = CAM[0], ay = CAM[1], az = CAM[2];
  const dx = XM[0] * d[0] + XM[1] * d[1] + XM[2] * d[2], dy = XM[3] * d[0] + XM[4] * d[1] + XM[5] * d[2], dz = XM[6] * d[0] + XM[7] * d[1] + XM[8] * d[2];
  const ux = XM[0] * U[0] + XM[1] * U[1] + XM[2] * U[2], uy = XM[3] * U[0] + XM[4] * U[1] + XM[5] * U[2], uz = XM[6] * U[0] + XM[7] * U[1] + XM[8] * U[2];
  const wx = XM[0] * W[0] + XM[1] * W[1] + XM[2] * W[2], wy = XM[3] * W[0] + XM[4] * W[1] + XM[5] * W[2], wz = XM[6] * W[0] + XM[7] * W[1] + XM[8] * W[2];
  const lx = XM[15], ly = XM[16], lz = XM[17];
  const UL = ux * lx + uy * ly + uz * lz, WL = wx * lx + wy * ly + wz * lz, DL = dx * lx + dy * ly + dz * lz;
  const F = C.fl, n = C.near, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const g0 = G.g0, g1 = G.g1, gm = G.gmin, occ = G.occ && O.occ, pxf0 = G.PXF * O.pxf;
  // a solid band (one with its own occluder) skips its far side while the occlusion is on: it is behind its front
  const br = Y.br, two = Y.two, back = O.back, keep = O.keep, ca = CA, solid = Y.solid && occ;
  const nd = CL ? CNX * dx + CNY * dy + CNZ * dz : 0;
  let cnt = 0;
  for (const B of Y.bands) {
    const na = B.na, n0 = B.n0, step = NT / n0, kr = B.kr, ka = B.ka;
    const cellA = Math.hypot(B.s1 - B.s0, B.r1 - B.r0) / na;
    for (let ia = 0; ia < na; ia++) {
      const u = (ia + .5) / na, s = B.s0 + (B.s1 - B.s0) * u, rr = B.r0 + (B.r1 - B.r0) * u;
      const ccx = ax + dx * s, ccy = ay + dy * s, ccz = az + dz * s;
      if (CL) { const sc = CNX * ccx + CNY * ccy + CNZ * ccz, e = rr * Math.sqrt(Math.max(0, 1 - nd * nd)); if (sc - e > CC0 && sc + e < CC1) continue; }
      if (ccz + rr < n) continue;
      if (ccz > n + rr) { const sx = cx + F * ccx / ccz, sy = cy - F * ccy / ccz, pr = F * rr / (ccz - rr); if (sx + pr < 0 || sx - pr >= BW || sy + pr < 0 || sy - pr >= BH) continue; }
      const zr = Math.max(n, ccz - rr * .5);
      const la = 1 << CTZ[ia & 65535], needA = pxf0 * zr / (cellA * F);
      if (needA >= 2 * la) continue;
      const aA = needA <= la ? 1 : 2 - needA / la;
      const cellT = TAU * Math.max(rr, .02) / n0, needT = pxf0 * zr / (cellT * F);
      const st = Math.max(1, Math.min(n0, pow2(needT * .5)));
      // per ring: the facing test and the light as functions of the angle only
      const cu = ux * ccx + uy * ccy + uz * ccz, cw = wx * ccx + wy * ccy + wz * ccz, cd = dx * ccx + dy * ccy + dz * ccz;
      const icl = 1 / Math.max(1e-3, Math.sqrt(ccx * ccx + ccy * ccy + ccz * ccz)), fk = ka * cd + kr * rr, lk = ka * DL;
      const ph = (ia & 1) ? .5 : 0;
      // the steps to walk: the whole ring, or for a solid band only the arc facing the camera (fac >= 0 where
      // kr * A * cos(t - phi) <= -fk), a step wider each side
      let q0 = 0, q1 = n0 - 1;
      if (solid) {
        const A = Math.hypot(cu, cw), kA = kr * A;
        if (Math.abs(kA) < 1e-9) { if (fk > 0) continue; }
        else {
          const c = -fk / kA;
          let tc = Math.atan2(cw, cu), hw = PI;
          if (kA > 0) { if (c < -1) continue; if (c < 1) { tc += PI; hw = PI - Math.acos(c); } }
          else { if (c > 1) continue; if (c > -1) hw = Math.acos(c); }
          if (hw < PI - 1e-3) { const kq = n0 / TAU, m = st + 1; q0 = Math.floor(((tc - hw) * kq - ph - m) / st) * st; q1 = Math.ceil((tc + hw) * kq - ph + m); if (q1 - q0 >= n0) { q0 = 0; q1 = n0 - 1; } }
        }
      }
      // c3 counts the steps (mod 3): a single-sided band draws every third dot of its far side
      for (let qq = q0, c3 = ia % 3; qq <= q1; qq += st, c3 = c3 === 2 ? 0 : c3 + 1) {
        const it = qq < 0 ? ((qq % n0) + n0) % n0 : qq >= n0 ? qq % n0 : qq;
        const ct = CTZ[it & 65535], lt = 1 << ct;
        if (needT >= 2 * lt && it) continue;
        const al = aA * (needT <= lt || !it ? 1 : 2 - needT * IP2[ct]);
        if (al < .06) continue;
        const ti = ((it + ph) * step) | 0, cs = COS[ti & (NT - 1)], sn = SIN[ti & (NT - 1)];
        let fac = -(kr * (cs * cu + sn * cw) + fk) * icl, lam = kr * (cs * UL + sn * WL) + lk, b = -1;
        if (fac < 0) {
          if (two) { fac = -fac; lam = -lam * .7; }
          else { if (solid || c3) continue; b = back * br; }
        }
        if (b < 0) { if (fac > 1) fac = 1; const w = 1 - fac; const q = .07 + .72 * (lam > 0 ? lam : 0) + .16 * fac + .34 * w * w * w; b = FACE * q * (.55 + .45 * q) * br; }
        const rx = ux * cs + wx * sn, ry = uy * cs + wy * sn, rz = uz * cs + wz * sn;
        const pz = ccz + rz * rr; if (pz < n) continue;
        if (CL && clipped(ccx + rx * rr, ccy + ry * rr, pz)) continue;
        const iz = F / pz, sx = cx + (ccx + rx * rr) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (ccy + ry * rr) * iz; if (sy < 0 || sy >= BH) continue;
        if (occ) { const ot = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (OC[ot] && pz > OZ[ot] * 1.015 + .06) continue; }
        let gg = g0 - g1 * pz; if (gg < gm) gg = gm;
        const k = b * al * gg * ca, q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = CR * k, G_ = CG * k, B_ = CB * k;
        if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
        cnt++;
      }
    }
  }
  G.dots += cnt;
}

/* tube kernel: camera-space ends, radius r */
function tubeK(ax, ay, az, bx, by, bz, r, bri) {
  const n = C.near;
  if (az < n && bz < n) return;
  const F = C.fl;
  const za = Math.max(n, az), zb = Math.max(n, bz), wa = r * F / za, wb = r * F / zb;
  if (wa < 1.1 && wb < 1.1) { lineC(ax, ay, az, bx, by, bz, bri, PXLc); return; }
  // clip at near
  if (az < n) { const t = (n - az) / (bz - az); ax += (bx - ax) * t; ay += (by - ay) * t; az = n; }
  else if (bz < n) { const t = (n - bz) / (az - bz); bx += (ax - bx) * t; by += (ay - by) * t; bz = n; }
  // camera-space perpendicular to the axis and the view: offset the silhouettes in 3D
  const ex = bx - ax, ey = by - ay, ez = bz - az, mx = (ax + bx) * .5, my = (ay + by) * .5, mz = (az + bz) * .5;
  let px = ey * mz - ez * my, py = ez * mx - ex * mz, pz = ex * my - ey * mx;
  const pl = Math.sqrt(px * px + py * py + pz * pz) || 1; px /= pl; py /= pl; pz /= pl;
  lineC(ax + px * r, ay + py * r, az + pz * r, bx + px * r, by + py * r, bz + pz * r, bri, PXLc);
  lineC(ax - px * r, ay - py * r, az - pz * r, bx - px * r, by - py * r, bz - pz * r, bri, PXLc);
  const wm = Math.max(wa, wb);
  if (wm > 3.2) {
    // a lit lattice between the silhouettes: rows across the visible half
    let qx = py * ez - pz * ey, qy = pz * ex - px * ez, qz = px * ey - py * ex;   // toward the camera-ish
    const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1; qx /= ql; qy /= ql; qz /= ql;
    if (qx * mx + qy * my + qz * mz > 0) { qx = -qx; qy = -qy; qz = -qz; }
    const rows = Math.min(30, Math.floor(2 * wm / (G.PXF * O.pxf * 1.5)));
    const lx = XM[15], ly = XM[16], lz = XM[17];
    for (let k = 1; k < rows; k++) {
      const th = -PI / 2 + PI * k / rows, c = Math.cos(th), s = Math.sin(th);
      const ox = (px * s + qx * c) * r, oy = (py * s + qy * c) * r, oz = (pz * s + qz * c) * r;
      const nx = ox / r, ny = oy / r, nz = oz / r, lam = nx * lx + ny * ly + nz * lz;
      const b = shade(lam, c) * bri * .95;
      lineC(ax + ox, ay + oy, az + oz, bx + ox, by + oy, bz + oz, b, G.PXF * O.pxf * 1.3);
    }
  }
}

/* ring kernel: model-space record at j in Rg (centre, U, W, r), drawn at the screen line step */
function ringK(Rg, j, bri, sp) {
  const x = Rg[j], y = Rg[j + 1], z = Rg[j + 2], r = Rg[j + 9];
  const cxm = XM[0] * x + XM[1] * y + XM[2] * z + XM[9], cym = XM[3] * x + XM[4] * y + XM[5] * z + XM[10], czm = XM[6] * x + XM[7] * y + XM[8] * z + XM[11];
  const n = C.near, F = C.fl; if (czm + r < n) return;
  const ux = (XM[0] * Rg[j + 3] + XM[1] * Rg[j + 4] + XM[2] * Rg[j + 5]) * r, uy = (XM[3] * Rg[j + 3] + XM[4] * Rg[j + 4] + XM[5] * Rg[j + 5]) * r, uz = (XM[6] * Rg[j + 3] + XM[7] * Rg[j + 4] + XM[8] * Rg[j + 5]) * r;
  const wx = (XM[0] * Rg[j + 6] + XM[1] * Rg[j + 7] + XM[2] * Rg[j + 8]) * r, wy = (XM[3] * Rg[j + 6] + XM[4] * Rg[j + 7] + XM[5] * Rg[j + 8]) * r, wz = (XM[6] * Rg[j + 6] + XM[7] * Rg[j + 7] + XM[8] * Rg[j + 8]) * r;
  const cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const zr = Math.max(n, czm - r), rp = r * F / zr;
  if (czm > n + r) { const sx = cx + F * cxm / czm, sy = cy - F * cym / czm; if (sx + rp < 0 || sx - rp >= BW || sy + rp < 0 || sy - rp >= BH) return; }
  let fa = 1;
  if (sp > 0) { const px = sp * F / Math.max(n, czm); if (px < G.SEAMPX * .5) return; if (px < G.SEAMPX) fa = px / G.SEAMPX * 2 - 1; }
  if (rp < .6) { dotC(cxm, cym, czm, 1, CR * bri * CA * .7 * fa, CG * bri * CA * .7 * fa, CB * bri * CA * .7 * fa); return; }
  const m = Math.min(NT, Math.max(8, pow2(TAU * rp / (PXLc * 1.15)))), st = NT / m;
  const r_ = CR * bri * CA * fa, g_ = CG * bri * CA * fa, b_ = CB * bri * CA * fa, g0 = G.g0, g1 = G.g1, gm = G.gmin, occ = G.occ && O.occ;
  let cnt = 0;
  for (let k = 0; k < NT; k += st) {
    const cs = COS[k], sn = SIN[k], pz = czm + uz * cs + wz * sn; if (pz < n) continue;
    if (CL && clipped(cxm + ux * cs + wx * sn, cym + uy * cs + wy * sn, pz)) continue;
    const sx = cx + F * (cxm + ux * cs + wx * sn) / pz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - F * (cym + uy * cs + wy * sn) / pz; if (sy < 0 || sy >= BH) continue;
    if (occ) { const ot = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (OC[ot] && pz > OZ[ot] * 1.015 + .06) continue; }
    let gg = g0 - g1 * pz; if (gg < gm) gg = gm;
    const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r_ * gg, G_ = g_ * gg, B_ = b_ * gg;
    if (D[q + 1] < G_) U32[q >> 2] = 0xff000000 | ((B_ > 255 ? 255 : B_) << 16) | ((G_ > 255 ? 255 : G_) << 8) | (R_ > 255 ? 255 : R_);
    cnt++;
  }
  G.dots += cnt;
}

/* knot kernel: a node plate / knuckle as a small lit cube on the model axes (a dot when far) */
function knotK(x, y, z, s, bri) {
  if (z < C.near) return;
  const F = C.fl, w = s * F / z;
  if (w < 2.6) { dotC(x, y, z, w > 1.5 ? 2 : 1, CR * bri * CA, CG * bri * CA, CB * bri * CA); return; }
  const h = s * .5, nc = Math.max(1, Math.min(48, Math.round(w / (G.PXF * O.pxf)))), cl = s / nc;
  for (let f = 0; f < 6; f++) {
    const a = f >> 1, sg = f & 1 ? -1 : 1, b1 = (a + 1) % 3, b2 = (a + 2) % 3;
    const nx = XM[a] * sg, ny = XM[3 + a] * sg, nz = XM[6 + a] * sg;
    const cx = x + nx * h, cy = y + ny * h, cz = z + nz * h;
    if (nx * cx + ny * cy + nz * cz >= 0) continue;
    const ux = XM[b1], uy = XM[3 + b1], uz = XM[6 + b1], vx = XM[b2], vy = XM[3 + b2], vz = XM[6 + b2];
    Pox = cx - (ux + vx) * h; Poy = cy - (uy + vy) * h; Poz = cz - (uz + vz) * h;
    Pux = ux * cl; Puy = uy * cl; Puz = uz * cl; Pvx = vx * cl; Pvy = vy * cl; Pvz = vz * cl; Plu = cl; Plv = cl;
    panelK(nc, nc, nx, ny, nz, bri * 1.5, 0);
    // the face's outline
    const e = bri * .9;
    const p0x = Pox, p0y = Poy, p0z = Poz, p1x = p0x + ux * s, p1y = p0y + uy * s, p1z = p0z + uz * s, p3x = p0x + vx * s, p3y = p0y + vy * s, p3z = p0z + vz * s;
    lineC(p0x, p0y, p0z, p1x, p1y, p1z, e, PXLc); lineC(p0x, p0y, p0z, p3x, p3y, p3z, e, PXLc);
    lineC(p1x, p1y, p1z, p1x + vx * s, p1y + vy * s, p1z + vz * s, e, PXLc); lineC(p3x, p3y, p3z, p3x + ux * s, p3y + uy * s, p3z + uz * s, e, PXLc);
  }
}
/* a status light: a hard dot, a small additive halo when lit (lv 0..1+) */
function lightK(x, y, z, lv) {
  if (z < C.near || lv < .02 || (CL && clipped(x, y, z))) return;
  const F = C.fl, sx = C.cx + C.shake[0] + F * x / z, sy = C.cy + C.shake[1] - F * y / z;
  if (sx < 4 || sy < 4 || sx >= BW - 4 || sy >= BH - 4) return;
  if (G.occ && O.occ && K.occT(sx, sy, z)) return;
  const k = Math.min(1, lv) * O.a, c = O.lc;
  K.pb.dot(sx, sy, 2, c[0] * k, c[1] * k, c[2] * k, 1);
  if (lv > .25) { const a = (lv - .25) * .5 * O.a; K.pb.add(sx, sy, 5, c[0], c[1], c[2], a * .22); K.pb.add(sx, sy, 3, c[0], c[1], c[2], a * .4); }
  G.dots++;
}

/* a chunk entirely behind the occluders: its screen disc sampled on a 4 x 4 grid, every sample in an occluded tile
   nearer than the chunk's nearest point */
function chunkHidden(x, y, z, r) {
  if (!K.occOn()) return false;
  const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], zn = z - r, sx = cx + F * x / z, sy = cy - F * y / z, pr = F * r / zn;
  if (pr > 400) return false;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const px = sx + (i / 3 * 2 - 1) * pr, py = sy + (j / 3 * 2 - 1) * pr;
    if (px < 0 || py < 0 || px >= BW || py >= BH) return false;
    const t = ((py | 0) >> 2) * OW + ((px | 0) >> 2);
    if (!OC[t] || OZ[t] * 1.015 + .06 >= zn) return false;
  }
  return true;
}

/* draw a body under a rigid transform. o: { a, col, lime, fx(ch, q) -> lime (0..1, >1 hot, <0 dim), keep, pxf, occ, L (light) } */
function draw(B, Tw, o) {
  o = o || {};
  O.a = o.a === undefined ? 1 : o.a; O.col = o.col || WH; O.lime = o.lime || 0; O.fx = o.fx || null; O.keep = o.keep === undefined ? 1 : o.keep;
  O.pxf = (o.pxf || 1) / Math.sqrt(Math.max(.12, O.keep)); O.back = o.back === undefined ? .11 : o.back; O.occ = !!o.occ; O.lc = o.lc || [255, 255, 255];
  if (O.a < .01) return;
  clipOn(o); PXLc = G.PXL * (o.pxl || 1);
  prep(Tw, o.L || [0, 1, 0]);
  const lime0 = O.lime;
  const L = B.L, T = B.T, P = B.P, N = B.N, Rg = B.Rg, F = C.fl, PXL = PXLc, near = C.near, off = B.off, SEAMPX = G.SEAMPX;
  const b9 = XM[9], b10 = XM[10], b11 = XM[11];
  for (const c of B.CH) {
    // flex offset
    const oi = c.i * 3, ox = off[oi], oy = off[oi + 1], oz = off[oi + 2];
    if (ox || oy || oz) { XM[9] = b9 + XM[0] * ox + XM[1] * oy + XM[2] * oz; XM[10] = b10 + XM[3] * ox + XM[4] * oy + XM[5] * oz; XM[11] = b11 + XM[6] * ox + XM[7] * oy + XM[8] * oz; }
    else { XM[9] = b9; XM[10] = b10; XM[11] = b11; }
    toCam(c.c[0], c.c[1], c.c[2]);
    if (!sphC(CAM[0], CAM[1], CAM[2], c.r)) continue;
    if (CL) { const sc = CNX * CAM[0] + CNY * CAM[1] + CNZ * CAM[2]; if (sc - c.r > CC0 && sc + c.r < CC1) continue; }
    if (O.occ && G.occ && CAM[2] - c.r > near * 4 && chunkHidden(CAM[0], CAM[1], CAM[2], c.r)) continue;
    const lit = B.lit[c.i], cl = B.lime[c.i];
    if (cl > .01) { O.lime = Math.max(lime0, Math.min(1, cl)); } else O.lime = lime0;
    // far away: the whole chunk under a pixel or two
    if (CAM[2] > near && c.r * F / CAM[2] < .7) { setCol(0, 0); dotC(CAM[0], CAM[1], CAM[2], 1, CR * .5 * CA, CG * .5 * CA, CB * .5 * CA); continue; }
    let lastCh = -1, lastQ = -1, d0 = G.dots; if (G.tm) G.tm.t = performance.now();
    for (let k = c.l0; k < c.l1; k++) {
      if (O.keep < .9 && ((k * .7548776662) % 1) > O.keep * 1.6 + .2) continue;
      const j = k * 10, ch = L[j + 7], q = L[j + 8], sp = L[j + 9];
      const x0 = L[j], y0 = L[j + 1], z0 = L[j + 2], x1 = L[j + 3], y1 = L[j + 4], z1 = L[j + 5];
      const az = XM[6] * x0 + XM[7] * y0 + XM[8] * z0 + XM[11], bz = XM[6] * x1 + XM[7] * y1 + XM[8] * z1 + XM[11];
      let fa = 1;
      if (sp > 0) { const zm = Math.max(near, (az + bz) * .5), px = sp * F / zm; if (px < SEAMPX * .5) continue; if (px < SEAMPX) fa = px / SEAMPX * 2 - 1; }
      if (ch !== lastCh || q !== lastQ) { setCol(ch, q); lastCh = ch; lastQ = q; }
      lineC(XM[0] * x0 + XM[1] * y0 + XM[2] * z0 + XM[9], XM[3] * x0 + XM[4] * y0 + XM[5] * z0 + XM[10], az,
            XM[0] * x1 + XM[1] * y1 + XM[2] * z1 + XM[9], XM[3] * x1 + XM[4] * y1 + XM[5] * z1 + XM[10], bz, L[j + 6] * (1 + lit) * fa, PXL);
    }
    G.by.l += G.dots - d0; d0 = G.dots; if (G.tm) { const n = performance.now(); G.tm.l += n - G.tm.t; G.tm.t = n; }
    for (let k = c.r0; k < c.r1; k++) {
      if (O.keep < .9 && ((k * .7548776662) % 1) > O.keep * 1.6 + .2) continue;
      const j = k * 14, ch = Rg[j + 11], q = Rg[j + 12];
      if (ch !== lastCh || q !== lastQ) { setCol(ch, q); lastCh = ch; lastQ = q; }
      ringK(Rg, j, Rg[j + 10] * (1 + lit), Rg[j + 13]);
    }
    G.by.r += G.dots - d0; d0 = G.dots; if (G.tm) { const n = performance.now(); G.tm.r += n - G.tm.t; G.tm.t = n; }
    for (let k = c.t0; k < c.t1; k++) {
      const j = k * 10, ch = T[j + 8], q = T[j + 9];
      if (ch !== lastCh || q !== lastQ) { setCol(ch, q); lastCh = ch; lastQ = q; }
      const x0 = T[j], y0 = T[j + 1], z0 = T[j + 2], x1 = T[j + 3], y1 = T[j + 4], z1 = T[j + 5];
      tubeK(XM[0] * x0 + XM[1] * y0 + XM[2] * z0 + XM[9], XM[3] * x0 + XM[4] * y0 + XM[5] * z0 + XM[10], XM[6] * x0 + XM[7] * y0 + XM[8] * z0 + XM[11],
            XM[0] * x1 + XM[1] * y1 + XM[2] * z1 + XM[9], XM[3] * x1 + XM[4] * y1 + XM[5] * z1 + XM[10], XM[6] * x1 + XM[7] * y1 + XM[8] * z1 + XM[11], T[j + 6], T[j + 7] * (1 + lit));
    }
    G.by.t += G.dots - d0; d0 = G.dots; if (G.tm) { const n = performance.now(); G.tm.tb += n - G.tm.t; G.tm.t = n; }
    for (let k = c.p0; k < c.p1; k++) {
      const j = k * 20, ch = P[j + 16], q = P[j + 17];
      if (ch !== lastCh || q !== lastQ) { setCol(ch, q); lastCh = ch; lastQ = q; }
      const x = P[j], y = P[j + 1], z = P[j + 2];
      Pox = XM[0] * x + XM[1] * y + XM[2] * z + XM[9]; Poy = XM[3] * x + XM[4] * y + XM[5] * z + XM[10]; Poz = XM[6] * x + XM[7] * y + XM[8] * z + XM[11];
      Pux = XM[0] * P[j + 3] + XM[1] * P[j + 4] + XM[2] * P[j + 5]; Puy = XM[3] * P[j + 3] + XM[4] * P[j + 4] + XM[5] * P[j + 5]; Puz = XM[6] * P[j + 3] + XM[7] * P[j + 4] + XM[8] * P[j + 5];
      Pvx = XM[0] * P[j + 6] + XM[1] * P[j + 7] + XM[2] * P[j + 8]; Pvy = XM[3] * P[j + 6] + XM[4] * P[j + 7] + XM[5] * P[j + 8]; Pvz = XM[6] * P[j + 6] + XM[7] * P[j + 7] + XM[8] * P[j + 8];
      Plu = P[j + 18]; Plv = P[j + 19];
      const nx = P[j + 11], ny = P[j + 12], nz = P[j + 13];
      panelK(P[j + 9], P[j + 10], XM[0] * nx + XM[1] * ny + XM[2] * nz, XM[3] * nx + XM[4] * ny + XM[5] * nz, XM[6] * nx + XM[7] * ny + XM[8] * nz, P[j + 14] * (1 + lit), P[j + 15]);
    }
    G.by.p += G.dots - d0; d0 = G.dots; if (G.tm) { const n = performance.now(); G.tm.p += n - G.tm.t; G.tm.t = n; }
    for (let k = c.y0; k < c.y1; k++) {
      const Y = B.Y[k];
      if (Y.ch !== lastCh || Y.q !== lastQ) { setCol(Y.ch, Y.q); lastCh = Y.ch; lastQ = Y.q; }
      const br = Y.br; Y.br = br * (1 + lit); latheK(Y); Y.br = br;
    }
    G.by.y += G.dots - d0; d0 = G.dots; if (G.tm) { const n = performance.now(); G.tm.y += n - G.tm.t; G.tm.t = n; }
    for (let k = c.n0; k < c.n1; k++) {
      const j = k * 7, ch = N[j + 5], q = N[j + 6];
      toCam(N[j], N[j + 1], N[j + 2]);
      if (ch === 3) { const lv = O.fx ? O.fx(3, q) : 0; lightK(CAM[0], CAM[1], CAM[2], lv); continue; }
      if (ch !== lastCh || q !== lastQ) { setCol(ch, q); lastCh = ch; lastQ = q; }
      knotK(CAM[0], CAM[1], CAM[2], N[j + 3], N[j + 4] * (1 + lit));
    }
    G.by.n += G.dots - d0; if (G.tm) { const n = performance.now(); G.tm.n += n - G.tm.t; G.tm.t = n; }
  }
  XM[9] = b9; XM[10] = b10; XM[11] = b11; O.lime = lime0;
}

/* the world-space centre of a chunk (by tag) under Tw */
function chunkW(B, tag, Tw) { const c = B.CH.find(c => c.tag === tag); return c ? X.ap(Tw, c.c) : null; }

/* a world-space hairline in the colour of effect channel (ch, q) under the options o (cables, beams on moving parts) */
const IDW = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] };
function lineW(a, b, br, ch, q, o) {
  draw.opt(o); clipOn(o); PXLc = G.PXL * ((o && o.pxl) || 1); prep(IDW, (o && o.L) || [0, 1, 0]); setCol(ch || 0, q || 0);
  toCam(a[0], a[1], a[2]); const ax = CAM[0], ay = CAM[1], az = CAM[2];
  toCam(b[0], b[1], b[2]);
  lineC(ax, ay, az, CAM[0], CAM[1], CAM[2], br, PXLc);
}
draw.opt = o => { o = o || {}; O.a = o.a === undefined ? 1 : o.a; O.col = o.col || WH; O.lime = o.lime || 0; O.fx = o.fx || null; O.keep = o.keep === undefined ? 1 : o.keep; O.pxf = (o.pxf || 1) / Math.sqrt(Math.max(.12, O.keep)); O.back = o.back === undefined ? .11 : o.back; O.occ = !!o.occ; O.lc = o.lc || [255, 255, 255]; };

window.ORL = { Body, draw, frame, G, chunkW, gain, LIME, HOT, WH, HEAT, lineC, lineW, shade, perp: M3perp };
})();
