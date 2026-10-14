/* ORBITAL RAILGUN KIT: a private copy of the satellite film's scan kit for pc_orbital_railgun (window.ORK), so this
   film can change it freely. The procedural lattice bodies live in pc_orbital_railgun_lat.js.
   From the shared kit: drafts of the game's SCAN given a
   source. Point Cloud raster helpers (LOD clouds, the lit per-point pass, world tiles), the lightning of the game's
   scan (game/src/ui/sensors/bolt.js, chain.js: a stepped leader, the return stroke flickering twice, chain forks
   racing low over the ground and climbing onto each vehicle), charge arcs, sparks, rings, the tag / box overlay, and
   the SCAN SITE: a coastal battery on a headland (two K340P Bastion-P launchers, the Monolith-B radar, a Pantsir-S1)
   that the bolt strikes and the scan identifies part by part (tendrils, flare, X-ray, part boxes with placards
   decoding out of glyph noise, the track tag decoding from ? 0.31 to the class).
   Everything is a pure function of the times passed in (seeded rng at load, hashes per frame). */
(function () {
'use strict';
const { V, R, X, E, Cam, rng, noise, fbm } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const LIME = [198, 244, 50], CORAL = [255, 106, 61], WH = [238, 238, 228], HOT = [248, 255, 232];
const BW = 1920, BH = 1080;
const $ = id => document.getElementById(id);
const K = { LIME, CORAL, WH, HOT, BW, BH, PI, TAU, DEG };
let pb = null, D = null, C = null, octx = null;

function setup() {
  pb = new PointBuf($('c'), [11, 12, 10], { vignette: .55 }); D = pb.d;
  octx = $('o').getContext('2d');
  C = new Cam(BW, BH);
  Object.assign(K, { C, pb, octx });
}
K.setup = setup;

/* ---------- raster ---------- */
function dot(x, y, s, r, g, b, a) {
  if (s <= 1) {
    if (x < 0 || y < 0 || x >= BW || y >= BH) return;
    const q = ((y | 0) * BW + (x | 0)) << 2, R_ = r * a, G = g * a, B = b * a;
    if (D[q] < R_) D[q] = R_; if (D[q + 1] < G) D[q + 1] = G; if (D[q + 2] < B) D[q + 2] = B;
    return;
  }
  pb.dot(x, y, s, r, g, b, a);
}
function add(x, y, s, r, g, b, a) { pb.add(x, y, s, r, g, b, a); }
const PJ = new Float64Array(3);
/* project a world point into PJ (sx, sy, depth); false behind the near plane */
function pj(x, y, z) {
  const e = C.eye, f = C.f, dx = x - e[0], dy = y - e[1], dz = z - e[2];
  const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < C.near) return false;
  const r = C.r, u = C.u, F = C.fl / zc;
  PJ[0] = C.cx + C.shake[0] + (dx * r[0] + dy * r[1] + dz * r[2]) * F;
  PJ[1] = C.cy + C.shake[1] - (dx * u[0] + dy * u[1] + dz * u[2]) * F;
  PJ[2] = zc; return true;
}
const onS = m => PJ[0] > -m && PJ[1] > -m && PJ[0] < BW + m && PJ[1] < BH + m;
function dotW(x, y, z, s, c, a) { if (pj(x, y, z) && !(OCC_ON && occT(PJ[0], PJ[1], PJ[2]))) dot(PJ[0], PJ[1], s, c[0], c[1], c[2], a); }
function addW(x, y, z, s, c, a) { if (pj(x, y, z) && onS(s)) add(PJ[0], PJ[1], s, c[0], c[1], c[2], a); }
/* a straight dotted line between two world points (clipped at the near plane), optional glow every 3rd dot */
const CA = new Float64Array(3), CB = new Float64Array(3);
function toCam(x, y, z, o) {
  const e = C.eye, dx = x - e[0], dy = y - e[1], dz = z - e[2], r = C.r, u = C.u, f = C.f;
  o[0] = dx * r[0] + dy * r[1] + dz * r[2]; o[1] = dx * u[0] + dy * u[1] + dz * u[2]; o[2] = dx * f[0] + dy * f[1] + dz * f[2];
}
function lineW(ax, ay, az, bx, by, bz, step, s, c, a, gc, g1, g2) {
  if (a < .004) return;
  toCam(ax, ay, az, CA); toCam(bx, by, bz, CB);
  const n = C.near;
  if (CA[2] < n && CB[2] < n) return;
  if (CA[2] < n) { const t = (n - CA[2]) / (CB[2] - CA[2]); for (let k = 0; k < 3; k++) CA[k] += (CB[k] - CA[k]) * t; }
  else if (CB[2] < n) { const t = (n - CB[2]) / (CA[2] - CB[2]); for (let k = 0; k < 3; k++) CB[k] += (CA[k] - CB[k]) * t; }
  const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const x0 = cx + F * CA[0] / CA[2], y0 = cy - F * CA[1] / CA[2], x1 = cx + F * CB[0] / CB[2], y1 = cy - F * CB[1] / CB[2];
  if ((x0 < -60 && x1 < -60) || (y0 < -60 && y1 < -60) || (x0 > BW + 60 && x1 > BW + 60) || (y0 > BH + 60 && y1 > BH + 60)) return;
  const L = Math.hypot(x1 - x0, y1 - y0), m = Math.min(3000, Math.max(1, Math.ceil(L / step)));
  const occ = OCC_ON, iza = 1 / CA[2], izb = 1 / CB[2];
  for (let k = 0; k <= m; k++) {
    const t = k / m, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (x < -30 || y < -30 || x > BW + 30 || y > BH + 30) continue;
    if (occ && occT(x, y, 1 / (iza + (izb - iza) * t))) continue;
    dot(x, y, s, c[0], c[1], c[2], a);
    if (gc && (k % 3) === 0) { add(x, y, 9, gc[0], gc[1], gc[2], g1 * a); if (g2 && (k % 6) === 0) add(x, y, 21, gc[0], gc[1], gc[2], g2 * a); }
  }
}
/* a ring of dots: centre c, in-plane unit axes U, W, radius r */
function ringW(c, U, W, r, n, s, col, a, ph) {
  if (a < .004) return;
  ph = ph || 0;
  for (let k = 0; k < n; k++) {
    const t = ph + k / n * TAU, cs = Math.cos(t) * r, sn = Math.sin(t) * r;
    if (pj(c[0] + U[0] * cs + W[0] * sn, c[1] + U[1] * cs + W[1] * sn, c[2] + U[2] * cs + W[2] * sn) && !(OCC_ON && occT(PJ[0], PJ[1], PJ[2]))) dot(PJ[0], PJ[1], s, col[0], col[1], col[2], a);
  }
}
/* soft round additive glow (screen px radius), falling off as (1 - d^2)^2 */
function soft(x, y, rad, r, g, b, a) {
  if (a < .003 || rad < .5) return;
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(BW - 1, Math.ceil(x + rad)), y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(BH - 1, Math.ceil(y + rad));
  if (x0 > x1 || y0 > y1) return;
  // only out to where the glow still adds half a level, and only along each row's chord of that circle
  const ir2 = 1 / (rad * rad), Dd = D, mc = Math.max(r, g, b) * a, e2 = mc > .5 ? 1 - Math.sqrt(.5 / mc) : 0;
  if (e2 <= 0) return;
  for (let yy = y0; yy <= y1; yy++) {
    const dy = yy + .5 - y, dy2 = dy * dy * ir2; if (dy2 >= e2) continue;
    const hw = rad * Math.sqrt(e2 - dy2), xa = Math.max(x0, Math.floor(x - hw)), xb = Math.min(x1, Math.ceil(x + hw));
    let q = (yy * BW + xa) << 2;
    for (let xx = xa; xx <= xb; xx++, q += 4) {
      const dx = xx + .5 - x, d2 = dx * dx * ir2 + dy2; if (d2 >= e2) continue;
      let w = 1 - d2; w = w * w * a;
      Dd[q] += r * w; Dd[q + 1] += g * w; Dd[q + 2] += b * w;
    }
  }
}
/* glow at a world point: small ones as stacked squares, big ones soft and round */
function glowW(x, y, z, px, col, a) {
  if (!pj(x, y, z) || !onS(px)) return;
  if (OCC_ON && occT(PJ[0], PJ[1], PJ[2])) return;
  if (px <= 12) { const q = [px, px * .55, px * .28]; for (let k = 0; k < 3; k++) add(PJ[0], PJ[1], Math.max(1, Math.round(q[k])), col[0], col[1], col[2], a * (.25 + .3 * k)); return; }
  soft(PJ[0], PJ[1], px * .6, col[0], col[1], col[2], a * .55);
  soft(PJ[0], PJ[1], px * .22, col[0], col[1], col[2], a * .8);
}
Object.assign(K, { soft, dot, add, pj, PJ, onS, dotW, addW, lineW, ringW, glowW, toCam });

/* stars: unit directions at infinity */
function stars(n, seed) {
  const r = rng(seed || 9), S = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    const u = r(), az = r() * TAU, el = Math.asin(u * 2 - 1);
    S[i * 5] = Math.cos(el) * Math.sin(az); S[i * 5 + 1] = Math.sin(el); S[i * 5 + 2] = Math.cos(el) * Math.cos(az);
    S[i * 5 + 3] = .14 + .86 * Math.pow(r(), 2.6); S[i * 5 + 4] = r() * TAU;
  }
  return S;
}
function drawStars(S, a, T, minY) {
  const f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], n = S.length / 5;
  for (let k = 0; k < n; k++) {
    const j = k * 5, dx = S[j], dy = S[j + 1], dz = S[j + 2];
    if (minY !== undefined && dy < minY) continue;
    const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < .05) continue;
    const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
    if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
    if (OCC_ON && occT(sx, sy, 1e12)) continue;
    dot(sx, sy, 1, 225, 228, 222, S[j + 3] * a * (.8 + .2 * Math.sin(T * 1.3 + S[j + 4])));
  }
}
Object.assign(K, { stars, drawStars });

/* hash noise: pure in its integer inputs, no allocation */
const hh = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
K.hh = hh;

/* ---------- LOD clouds ---------- */
/* levels [{sp, pts (stride 6: xyz, normal; zero normal = two-sided)}] -> cells with bounding spheres, a range per level */
function lodCloud(levels, cs) {
  cs = cs || 1.1;
  const nl = levels.length, cells = new Map();
  levels.forEach((L, li) => {
    const P = L.pts, n = P.length / 6;
    for (let i = 0; i < n; i++) {
      const k = (Math.floor(P[i * 6] / cs) + 512) * 1048576 + (Math.floor(P[i * 6 + 1] / cs) + 512) * 1024 + (Math.floor(P[i * 6 + 2] / cs) + 512);
      let c = cells.get(k); if (!c) { c = levels.map(() => []); cells.set(k, c); } c[li].push(i);
    }
  });
  const lv = levels.map(L => new Float32Array(L.pts.length)), SD = 4 + 2 * nl, CH = new Float32Array(cells.size * SD), o = new Array(nl).fill(0);
  let c = 0;
  for (const cell of cells.values()) {
    let mx = 0, my = 0, mz = 0, m = 0;
    cell.forEach((idx, li) => { const P = levels[li].pts; for (const i of idx) { mx += P[i * 6]; my += P[i * 6 + 1]; mz += P[i * 6 + 2]; m++; } });
    mx /= m; my /= m; mz /= m;
    let rr = 0;
    cell.forEach((idx, li) => {
      const P = levels[li].pts, Dd = lv[li], i0 = o[li];
      for (const i of idx) { for (let q = 0; q < 6; q++) Dd[o[li] * 6 + q] = P[i * 6 + q]; rr = Math.max(rr, Math.hypot(P[i * 6] - mx, P[i * 6 + 1] - my, P[i * 6 + 2] - mz)); o[li]++; }
      CH[c * SD + 4 + li * 2] = i0; CH[c * SD + 5 + li * 2] = o[li];
    });
    CH[c * SD] = mx; CH[c * SD + 1] = my; CH[c * SD + 2] = mz; CH[c * SD + 3] = rr + .01;
    c++;
  }
  // bounds of the coarsest level that has points (for boxes)
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const Pb = levels[Math.min(2, nl - 1)].pts.length ? levels[Math.min(2, nl - 1)].pts : levels[0].pts;
  for (let i = 0; i < Pb.length; i += 6) for (let k = 0; k < 3; k++) { if (Pb[i + k] < mn[k]) mn[k] = Pb[i + k]; if (Pb[i + k] > mx[k]) mx[k] = Pb[i + k]; }
  return { lv, sp: levels.map(L => L.sp), ch: CH, nch: c, sd: SD, nl, mn, mx, n: levels[0].pts.length / 6 };
}
/* a list of GEO prims sampled at each spacing (fine detail only in the first two) */
function lodPrims(prims, levels, seed, cs) {
  const model = { parts: [{ name: 'p', prims }] };
  return lodCloud(levels.map((sp, li) => ({ sp, pts: GEO.sample(model, sp, seed + li * 7, {}, li >= 2 ? { fine: false } : undefined)[0].pts })), cs);
}
/* a GEO / HD model: one LOD cloud per part, sampled at state st in model space (the part's own xf applied) */
function lodModel(model, st, levels, seed, cs, skip) {
  const out = [];
  for (const part of model.parts) {
    if (skip && skip.includes(part.name)) continue;
    if (part.show && !part.show(st || {})) continue;
    const Tf = GEO.partXf(X.make(), part, st || {});
    const lvs = levels.map((sp, li) => {
      const S = GEO.sample({ parts: [part] }, sp, seed + li * 13 + part.name.length * 7, st || {}, li >= 2 ? { fine: false } : undefined)[0].pts;
      const o = new Float32Array(S.length);
      for (let i = 0; i < S.length; i += 6) {
        const q = X.ap(Tf, [S[i], S[i + 1], S[i + 2]]), n = X.dir(Tf, [S[i + 3], S[i + 4], S[i + 5]]);
        o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2]; o[i + 3] = n[0]; o[i + 4] = n[1]; o[i + 5] = n[2];
      }
      return { sp, pts: o };
    });
    if (!lvs[0].pts.length && !lvs[lvs.length - 1].pts.length) continue;
    out.push({ name: part.name, label: part.label, ml: lodCloud(lvs, cs) });
  }
  return out;
}
Object.assign(K, { lodCloud, lodPrims, lodModel });

/* ---------- the per-point pass ---------- */
let LIGHT = V.norm([-.45, .62, -.35]);
K.setLight = l => { LIGHT = V.norm(l); };
const XM = new Float64Array(24);
function prep(Tw) {
  const M = Tw.R, t = Tw.T, r = C.r, u = C.u, f = C.f, e = C.eye;
  for (let j = 0; j < 3; j++) {
    XM[j] = r[0] * M[j] + r[1] * M[3 + j] + r[2] * M[6 + j];
    XM[3 + j] = u[0] * M[j] + u[1] * M[3 + j] + u[2] * M[6 + j];
    XM[6 + j] = f[0] * M[j] + f[1] * M[3 + j] + f[2] * M[6 + j];
  }
  const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2];
  XM[9] = r[0] * dx + r[1] * dy + r[2] * dz; XM[10] = u[0] * dx + u[1] * dy + u[2] * dz; XM[11] = f[0] * dx + f[1] * dy + f[2] * dz;
  for (let j = 0; j < 3; j++) {
    XM[12 + j] = -(M[j] * dx + M[3 + j] * dy + M[6 + j] * dz);
    XM[15 + j] = M[j] * LIGHT[0] + M[3 + j] * LIGHT[1] + M[6 + j] * LIGHT[2];
  }
  return XM;
}
/* sphere (model space) in the view frustum */
function sphereIn(mx, my, mz, rad) {
  const x = XM, zc = x[6] * mx + x[7] * my + x[8] * mz + x[11];
  if (zc < C.near - rad) return false;
  const xc = x[0] * mx + x[1] * my + x[2] * mz + x[9], yc = x[3] * mx + x[4] * my + x[5] * mz + x[10];
  const Fl = C.fl, xr = (BW - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
const OPT = { a: 1, fade: 900, back: .1, lime: 0, col: WH, keep: 1, rev: null, size: 1, tint: null, tk: 0, px: 4.4, px0: 18, clip: null, occ: 0, lb: 0 };
const OO = Object.assign({}, OPT);
function opt(o) { for (const k in OPT) OO[k] = o && o[k] !== undefined ? o[k] : OPT[k]; return OO; }
function runPts(P, i0, i1, sp, o) {
  const x = XM, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, Dd = D;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, big = o.size;
  const lm = o.lime, col = o.col;
  let cr = col[0] + (LIME[0] - col[0]) * lm, cg = col[1] + (LIME[1] - col[1]) * lm, cb = col[2] + (LIME[2] - col[2]) * lm;
  if (o.tint) { const tk = o.tk; cr += (o.tint[0] - cr) * tk; cg += (o.tint[1] - cg) * tk; cb += (o.tint[2] - cb) * tk; }
  const cp = o.clip, c0 = cp ? cp[0] : 0, c1 = cp ? cp[1] : 0, c2 = cp ? cp[2] : 0, c3 = cp ? cp[3] : 0;
  const oc = o.occ && OCC_ON, OZ_ = OZ, OC_ = OC;
  const rv = o.rev, rx = rv ? rv.x : 0, ry = rv ? rv.y : 0, rz = rv ? rv.z : 0, rage = rv ? rv.age : 0, rinv = rv ? 1 / rv.v : 0, rpre = rv ? rv.pre : 1, rlime = rv ? rv.after || 0 : 0;
  for (let i = i0, j = i0 * 6; i < i1; i++, j += 6) {
    if (keep < 1 && (i * .6180339887) % 1 > keep) continue;
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    if (cp && c0 * px + c1 * py + c2 * pz < c3) continue;
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const iz = F / zc;
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz; if (sy < 0 || sy >= BH) continue;
    if (oc) { const t = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (OC_[t] && zc > OZ_[t] * 1.015 + .06) continue; }
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5];
    let b;
    if (nx === 0 && ny === 0 && nz === 0) b = .5;
    else {
      const dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez);
      if (dn > 0) { if (i % 3) continue; b = back; }
      else {
        let fac = -dn / zc; if (fac > 1) fac = 1;
        const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
        b = .06 + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
      }
    }
    b *= zc < fade ? A - kf * zc : kfar;
    let r = cr, g = cg, bl = cb;
    if (rv) {
      const dx = px - rx, dy = py - ry, dz = pz - rz;
      const age = rage - Math.sqrt(dx * dx + dy * dy + dz * dz) * rinv * (1 + .6 * ((i * .7548777) % 1));
      if (age < 0) b *= rpre;
      else {
        if (rlime > 0) { r += (LIME[0] - r) * rlime; g += (LIME[1] - g) * rlime; bl += (LIME[2] - bl) * rlime; }
        if (age < 1.3) {
          const fl = Math.exp(-age * 3.4);
          if (b < fl * 1.05 * A) b = fl * 1.05 * A;
          r += (LIME[0] - r) * fl; g += (LIME[1] - g) * fl; bl += (LIME[2] - bl) * fl;
        }
      }
    }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const pxs = sp * iz * big;
    if (pxs <= 6) {
      const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
      if (Dd[q] < R_) Dd[q] = R_; if (Dd[q + 1] < G_) Dd[q + 1] = G_; if (Dd[q + 2] < B_) Dd[q + 2] = B_;
    } else pb.dot(sx, sy, 2, r, g, bl, b);
  }
}
/* ---------- occlusion: 4 px tiles holding the nearest depth of convex occluders (after pe_aegis_scope's occHouse) */
const OW = 480, OH = 270, OZ = new Float32Array(OW * OH), OC = new Uint8Array(OW * OH);
let OCC_ON = false;
function occReset() { if (OCC_ON) { OZ.fill(1e9); OC.fill(0); } OCC_ON = false; }
const NE = new Float64Array(32), NF = new Float64Array(32), NR = new Float64Array(32), NU = new Float64Array(32);
/* planes [[nx, ny, nz, d]...] (inside: n.p <= d), corners (world) for the screen bounds */
function occPlanes(planes, corners) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  let behind = 0;
  for (const c of corners) { if (!pj(c[0], c[1], c[2])) behind++; else { x0 = Math.min(x0, PJ[0]); x1 = Math.max(x1, PJ[0]); y0 = Math.min(y0, PJ[1]); y1 = Math.max(y1, PJ[1]); } }
  if (behind === corners.length) return;
  if (behind) { x0 = 0; y0 = 0; x1 = BW - 1; y1 = BH - 1; }
  const tx0 = Math.max(0, Math.floor(x0 / 4)), tx1 = Math.min(OW - 1, Math.floor(x1 / 4)), ty0 = Math.max(0, Math.floor(y0 / 4)), ty1 = Math.min(OH - 1, Math.floor(y1 / 4));
  if (tx1 < tx0 || ty1 < ty0) return;
  if (!OCC_ON) { OZ.fill(1e9); OC.fill(0); OCC_ON = true; }
  const e = C.eye, f = C.f, r = C.r, u = C.u, np = planes.length, FL = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  for (let i = 0; i < np; i++) { const p = planes[i]; NE[i] = p[3] - (p[0] * e[0] + p[1] * e[1] + p[2] * e[2]); NF[i] = p[0] * f[0] + p[1] * f[1] + p[2] * f[2]; NR[i] = p[0] * r[0] + p[1] * r[1] + p[2] * r[2]; NU[i] = p[0] * u[0] + p[1] * u[1] + p[2] * u[2]; }
  const S = OCC_S || ((tx1 - tx0) * (ty1 - ty0) > 30000 ? 2 : 1), H = S * 2;
  for (let ty = ty0 - ty0 % S; ty <= ty1; ty += S) {
    const b = (ty * 4 + H - cy) / FL;
    for (let tx = tx0 - tx0 % S; tx <= tx1; tx += S) {
      const a = (tx * 4 + H - cx) / FL;
      let tin = 0, tout = 1e9;
      for (let i = 0; i < np; i++) {
        const den = NF[i] + a * NR[i] - b * NU[i], num = NE[i];
        if (den < -1e-9) { const t = num / den; if (t > tin) tin = t; }
        else if (den > 1e-9) { const t = num / den; if (t < tout) tout = t; }
        else if (num < 0) { tin = 1e9; break; }
        if (tin >= tout) break;
      }
      if (tin >= tout || tout <= C.near) continue;
      for (let v = 0; v < S; v++) for (let w = 0; w < S; w++) { const yy = ty + v, xx = tx + w; if (yy >= OH || xx >= OW) continue; const k = yy * OW + xx; if (tin < OZ[k]) OZ[k] = tin; OC[k] = 1; }
    }
  }
}
const OB_P = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], OB_C = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
/* a model-space box under a rigid transform as an occluder */
function occBox(Tw, mn, mx) {
  const M = Tw.R, t = Tw.T;
  for (let k = 0; k < 3; k++) {
    const n = [M[k], M[3 + k], M[6 + k]];                                 // world direction of model axis k
    const c0 = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
    const P0 = OB_P[k * 2], P1 = OB_P[k * 2 + 1];
    P0[0] = n[0]; P0[1] = n[1]; P0[2] = n[2]; P0[3] = c0 + mx[k];
    P1[0] = -n[0]; P1[1] = -n[1]; P1[2] = -n[2]; P1[3] = -(c0 + mn[k]);
  }
  for (let k = 0; k < 8; k++) { const x = k & 1 ? mx[0] : mn[0], y = k & 2 ? mx[1] : mn[1], z = k & 4 ? mx[2] : mn[2], o = OB_C[k]; o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; }
  occPlanes(OB_P, OB_C);
}
/* the tile step for the next occluders: 0 picks by size; 2 (8 px) when the caller knows its occluder is large on screen
   (its inset is then wider than the coarser steps) */
let OCC_S = 0;
const occS = s => { OCC_S = s; };
/* is a screen point at depth z behind an occluder */
function occT(x, y, z) { if (!OCC_ON) return false; const t = ((y | 0) >> 2) * OW + ((x | 0) >> 2); return t >= 0 && t < OW * OH && OC[t] > 0 && z > OZ[t] * 1.015 + .06; }
Object.assign(K, { occReset, occPlanes, occBox, occT, occS, OZ, OC, OW, occOn: () => OCC_ON });

let NPTS = 0;
function drawLod(ml, Tw, o) {
  prep(Tw);
  const CH = ml.ch, SD = ml.sd, nl = ml.nl, F = C.fl, oo = opt(o), PX = oo.px, PX0 = oo.px0;
  const ex = XM[12], ey = XM[13], ez = XM[14];
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(mx, my, mz, rad)) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.05, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    let li = nl - 1; while (li > 1 && ml.sp[li] * F / d > PX) li--;
    if (li === 1 && ml.sp[1] * F / d > PX0) li = 0;
    if (oo.lb) li = Math.min(nl - 1, li + oo.lb);
    const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
    if (i1 > i0) { runPts(ml.lv[li], i0, i1, ml.sp[li], oo); NPTS += i1 - i0; }
  }
}
/* screen box of a cloud's model-space AABB under Tw (8 corners) -> [x0, y0, x1, y1] or null */
function boxOf(mn, mx, Tw, pad) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let k = 0; k < 8; k++) {
    const p = [k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]], w = X.ap(Tw, p);
    if (!pj(w[0], w[1], w[2])) continue; n++;
    if (PJ[0] < x0) x0 = PJ[0]; if (PJ[0] > x1) x1 = PJ[0]; if (PJ[1] < y0) y0 = PJ[1]; if (PJ[1] > y1) y1 = PJ[1];
  }
  if (!n) return null;
  pad = pad || 0;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
Object.assign(K, { prep, drawLod, boxOf, npts: () => { const n = NPTS; NPTS = 0; return n; } });

/* ---------- world point tiles ---------- */
/* F stride `stride`, xyz in the first three (yIdx < 0: xz only in 0, 1) -> tiles cs m with bounding spheres */
function tiled(F, stride, cs, yz) {
  const n = F.length / stride, m = new Map();
  const zi = yz ? 1 : 2;
  for (let k = 0; k < n; k++) { const key = (Math.floor(F[k * stride] / cs) + 4096) * 8192 + Math.floor(F[k * stride + zi] / cs) + 4096; let g = m.get(key); if (!g) { g = []; m.set(key, g); } g.push(k); }
  const O = new Float32Array(F.length), TL = new Float64Array(m.size * 6); let o = 0, t = 0;
  for (const g of m.values()) {
    const i0 = o; let sx = 0, sy = 0, sz = 0;
    for (const k of g) { for (let q = 0; q < stride; q++) O[o * stride + q] = F[k * stride + q]; sx += F[k * stride]; sy += yz ? 0 : F[k * stride + 1]; sz += F[k * stride + zi]; o++; }
    sx /= g.length; sy /= g.length; sz /= g.length;
    let rr = 0; for (let k = i0; k < o; k++) { const dx = O[k * stride] - sx, dy = yz ? 0 : O[k * stride + 1] - sy, dz = O[k * stride + zi] - sz; rr = Math.max(rr, Math.sqrt(dx * dx + dy * dy + dz * dz)); }
    TL[t * 6] = i0; TL[t * 6 + 1] = o; TL[t * 6 + 2] = sx; TL[t * 6 + 3] = sy; TL[t * 6 + 4] = sz; TL[t * 6 + 5] = rr + 2;
    t++;
  }
  return { F: O, TL, nt: t, stride };
}
/* world-space sphere in the frustum; its camera depth in WZ[0] */
const WZ = new Float64Array(1);
function wIn(x, y, z, rad) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, dx = x - e[0], dy = y - e[1], dz = z - e[2];
  const zc = dx * f[0] + dy * f[1] + dz * f[2]; WZ[0] = zc;
  if (zc < C.near - rad) return false;
  const xc = dx * r[0] + dy * r[1] + dz * r[2], yc = dx * u[0] + dy * u[1] + dz * u[2];
  const Fl = C.fl, xr = (BW - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
Object.assign(K, { tiled, wIn, WZ });

/* ---------- lightning (the game's bolt.js / chain.js, drawn into the dot buffer) ---------- */
function disp(a, b, depth, rough, rr, flat) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      out.push([(p[0] + q[0]) / 2 + (rr() - .5) * l * rough, (p[1] + q[1]) / 2 + (rr() - .5) * l * rough * (flat || .4), (p[2] + q[2]) / 2 + (rr() - .5) * l * rough], q);
    }
    pts = out;
  }
  return pts;
}
const PAL = { core: HOT, glow: LIME };
class Bolt {
  /* o: { top, hit, seed, depth, nb (branches), rough } */
  constructor(o) {
    const rr = rng(o.seed || 1), hit = o.hit.slice(), top = o.top.slice(), H = V.dist(top, hit);
    this.hit = hit; this.top = top; this.H = H;
    const main = disp(top, hit, o.depth || 8, o.rough || .6, rr, .6);
    const cum = new Float64Array(main.length); let L = 0;
    for (let i = 1; i < main.length; i++) { L += V.dist(main[i], main[i - 1]); cum[i] = L; }
    this.main = main; this.cum = cum; this.L = L;
    const br = [], nb = o.nb || 8;
    for (let k = 0; k < nb; k++) {
      const i = 4 + Math.floor(rr() * main.length * .8), s = main[i], q = main[Math.min(main.length - 1, i + 6)];
      let d = V.sub(q, s); const l0 = V.len(d) || 1; d = V.mul(d, 1 / l0);
      const side = V.norm([rr() - .5, (rr() - .5) * .3, rr() - .5]);
      const dir = V.norm(V.add(d, V.mul(side, .9 + .6 * rr())));
      const len = H * (.04 + .14 * rr()) * (1 - .5 * i / main.length);
      const end = V.mad(s, dir, len);
      end[1] = Math.max(hit[1] + H * .01, end[1]);
      const pts = disp(s, end, 5, .55, rr);
      br.push({ at: i / (main.length - 1), pts, w: .45 + .3 * rr() });
      if (rr() < .5) {
        const jx = Math.floor(pts.length * (.3 + .4 * rr())), q0 = pts[jx];
        const e2 = V.mad(q0, V.norm([rr() - .5, -.6 - rr() * .4, rr() - .5]), len * (.3 + .3 * rr()));
        e2[1] = Math.max(hit[1] + 2, e2[1]);
        br.push({ at: i / (main.length - 1) + .03, pts: disp(q0, e2, 4, .5, rr), w: .32 });
      }
    }
    this.br = br;
    this.rain = new Float32Array(360 * 5);
    for (let k = 0; k < 360; k++) { const o5 = k * 5; this.rain[o5] = -rr() * .9; this.rain[o5 + 1] = 2.6 + rr() * 2.2; this.rain[o5 + 2] = (rr() - .5) * H * .02; this.rain[o5 + 3] = (rr() - .5) * H * .008; this.rain[o5 + 4] = (rr() - .5) * H * .02; }
    const sc = o.spark || 34;
    this.SP = new Float32Array(200 * 4);
    for (let i = 0; i < 200; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = sc * (.18 + rr()), h = Math.sqrt(1 - u * u); this.SP[i * 4] = Math.cos(a) * h * s; this.SP[i * 4 + 1] = Math.abs(u) * s * .8 + sc * .1; this.SP[i * 4 + 2] = Math.sin(a) * h * s; this.SP[i * 4 + 3] = .4 + rr() * .9; }
    this._p = [0, 0, 0];
  }
  at(s, out) {
    const cum = this.cum, m = this.main, L = s * this.L;
    let lo = 1, hi = cum.length - 1;
    while (lo < hi) { const md = (lo + hi) >> 1; if (cum[md] < L) lo = md + 1; else hi = md; }
    const i = Math.max(1, lo), k = (L - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), a = m[i - 1], b = m[i];
    out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k;
    return out;
  }
  static stroke(tr) {
    if (tr < 0) return 0;
    return Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2));
  }
  /* reach 0..1 of the leader, I brightness, pour 0..~1.2 (the stream of dots coming down with the leader) */
  draw(reach, I, leading, pour, pal) {
    pal = pal || PAL;
    const core = pal.core, gl = pal.glow, m = this.main, nVis = reach * (m.length - 1);
    if (I > .004 || leading) {
      this._path(m, nVis, Math.min(1, I * 1.1), leading ? 2 : 3, core, gl, true);
      for (const b of this.br) {
        const s = b.at * (m.length - 1); if (nVis <= s) continue;
        const k = (nVis - s) / ((m.length - 1) * .25) * (b.pts.length - 1);
        this._path(b.pts, k, Math.min(1, I * .75 * b.w / .5), 2, core, gl, false);
      }
    }
    if (leading && nVis < m.length - 1) {
      const tip = m[Math.floor(nVis)];
      dotW(tip[0], tip[1], tip[2], 3, [255, 255, 255], 1);
      glowW(tip[0], tip[1], tip[2], 16, gl, .35);
    }
    if (pour >= 0 && pour < 1.2) {
      const Rr = this.rain, p = this._p;
      for (let k = 0; k < 360; k++) {
        const o5 = k * 5, s = Rr[o5] + pour * Rr[o5 + 1]; if (s < 0 || s > 1 || s > reach + .02) continue;
        this.at(s, p);
        const f = (1 - s) * .8;
        dotW(p[0] + Rr[o5 + 2] * f, p[1] + Rr[o5 + 3] * f, p[2] + Rr[o5 + 4] * f, 2, core, .85);
      }
    }
  }
  _path(pts, to, a, size, core, gl, main) {
    if (a < .004) return;
    const n1 = Math.min(pts.length - 1, to);
    for (let i = 0; i < n1; i++) {
      const A = pts[i], B = pts[i + 1], f = Math.min(1, n1 - i);
      lineW(A[0], A[1], A[2], A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, main ? 1.1 : 1.5, size, core, a, gl, .045, main ? .016 : 0);
    }
  }
  sparks(a, c, g) {
    if (a < 0 || a > 1.4) return;
    const S = this.SP, h = this.hit, gg = g || 11;
    for (let i = 0; i < 200; i++) {
      const o = i * 4, life = S[o + 3]; if (a > life) continue;
      const w = 1 - a / life;
      let y = h[1] + S[o + 1] * a - gg * a * a; if (y < h[1]) y = h[1] + (h[1] - y) * .25;
      dotW(h[0] + S[o] * a, y, h[2] + S[o + 2] * a, 2, c || [230, 255, 170], w);
    }
  }
}
/* chain fork: races low over the ground from `from` to the vehicle's strike point `to` and climbs onto it */
function profile(depth, L, rough, flat, rr) {
  const n = 1 << depth, lat = new Float32Array(n + 1), up = new Float32Array(n + 1);
  for (let step = n; step > 1; step >>= 1) {
    const h = step >> 1, seg = L * step / n;
    for (let i = 0; i + step <= n; i += step) {
      const m = i + h;
      lat[m] = (lat[i] + lat[i + step]) / 2 + (rr() - .5) * seg * rough;
      up[m] = (up[i] + up[i + step]) / 2 + (rr() - .5) * seg * rough * flat;
    }
  }
  return { n, lat, up };
}
class Fork {
  constructor(o) {
    const rr = rng(o.seed || 1), a = o.from, b = o.to;
    const dx = b[0] - a[0], dz = b[2] - a[2], Dd = Math.max(1, Math.hypot(dx, dz));
    this.D = Dd; this.from = a.slice(); this.end = b.slice();
    const P = profile(6, Dd, .42, .16, rr), n = this.n = P.n;
    this.t = new Float32Array(n + 1); this.lat = P.lat; this.up = P.up; this.gy = new Float32Array(n + 1);
    const arch = Dd * (.01 + .01 * rr());
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.t[i] = t;
      this.up[i] = (Math.abs(this.up[i]) * .6 + arch * Math.sin(PI * t) + .8) * Math.min(1, t * 12);
      if (i === n) { this.up[i] = 0; this.lat[i] = 0; }
      this.gy[i] = o.ground ? o.ground(a[0] + dx * t, a[2] + dz * t) : 0;
    }
    const nb = 3 + Math.floor(rr() * 3);
    this.br = [];
    for (let k = 0; k < nb; k++) {
      const at = .12 + rr() * .7, i = Math.floor(at * n), len = Dd * (.05 + .1 * rr());
      const side = rr() < .5 ? -1 : 1, bp = profile(4, len, .5, .3, rr);
      const pts = new Float32Array((bp.n + 1) * 3);
      for (let j = 0; j <= bp.n; j++) { const s = j / bp.n; pts[j * 3] = len * s * (.35 + .3 * rr()); pts[j * 3 + 1] = side * len * s * (.6 + .5 * rr()) + bp.lat[j]; pts[j * 3 + 2] = Math.abs(bp.up[j]) * .5 + .5; }
      this.br.push({ i, pts, m: bp.n, w: .35 + .3 * rr() });
    }
    this._a = [0, 0, 0]; this._b = [0, 0, 0];
  }
  pt(i, out) {
    const a = this.from, e = this.end, t = this.t[i], dx = e[0] - a[0], dz = e[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const px = -dz / L, pz = dx / L;
    out[0] = a[0] + dx * t + px * this.lat[i];
    out[2] = a[2] + dz * t + pz * this.lat[i];
    const g = this.gy[i], ge = this.gy[this.n], h = Math.max(0, e[1] - ge);
    const sl = E.clamp(Math.max(h * 2.5, 12) / this.D, .02, .3), c = t < 1 - sl ? 0 : (t - 1 + sl) / sl, k = c * c * (3 - 2 * c);
    out[1] = g + h * k + this.up[i] * (1 - k * .7);
    if (i === this.n) { out[0] = e[0]; out[1] = e[1]; out[2] = e[2]; }
    return out;
  }
  draw(reach, I, leading, age, pal) {
    pal = pal || PAL;
    if (I < .004 && !leading) return;
    const n = this.n, nVis = reach * n, A = this._a, B = this._b, core = pal.core, gl = pal.glow;
    const iEnd = Math.min(n, Math.ceil(nVis));
    this.pt(0, A);
    for (let i = 0; i < iEnd; i++) {
      this.pt(i + 1, B);
      const frac = Math.min(1, nVis - i);
      const behind = leading ? (nVis - i) / Math.max(1, n * .35) : 0;
      const al = leading ? Math.min(1, .95 * Math.exp(-behind * 1.2) + .28) * (.8 + .2 * Math.sin(age * 90 + i)) : Math.min(1, I);
      lineW(A[0], A[1], A[2], A[0] + (B[0] - A[0]) * frac, A[1] + (B[1] - A[1]) * frac, A[2] + (B[2] - A[2]) * frac, 1.25, 2, core, al, gl, .05, .018);
      A[0] = B[0]; A[1] = B[1]; A[2] = B[2];
    }
    for (const b of this.br) {
      if (nVis <= b.i) continue;
      const g = E.sat((nVis - b.i) / (n * .18)), al = (leading ? .55 : Math.min(1, I * .7)) * b.w / .5;
      if (al < .01) continue;
      this.pt(b.i, A);
      const dx = this.end[0] - this.from[0], dz = this.end[2] - this.from[2], L = Math.hypot(dx, dz) || 1, fx0 = dx / L, fz0 = dz / L;
      const mm = Math.ceil(b.m * g);
      let px = A[0], py = A[1], pz = A[2];
      for (let j = 1; j <= mm; j++) {
        const q = b.pts, o = j * 3;
        const x = A[0] + fx0 * q[o] - fz0 * q[o + 1], y = A[1] + q[o + 2], z = A[2] + fz0 * q[o] + fx0 * q[o + 1];
        lineW(px, py, pz, x, y, z, 1.6, 1, core, al * (1 - .5 * j / b.m));
        px = x; py = y; pz = z;
      }
    }
    if (leading && nVis < n) { this.pt(Math.floor(nVis), A); dotW(A[0], A[1], A[2], 3, [255, 255, 255], 1); glowW(A[0], A[1], A[2], 14, gl, .4); }
  }
}
const reachOf = (a, dur) => { if (a <= 0) return 0; const u = E.clamp(a / dur, 0, 1); return u + .06 * Math.sin(u * PI * 3) * (1 - u); };
/* a charge arc between two world points: jagged, re-struck at 30 Hz (pure in t), I brightness */
const ARC = new Float64Array(33 * 3);
function arcW(a, b, seed, t, I, jag, col, sz) {
  if (I < .01) return;
  const fr = Math.floor(t * 30), n = 16;
  for (let k = 0; k <= n; k++) { const u = k / n; ARC[k * 3] = a[0] + (b[0] - a[0]) * u; ARC[k * 3 + 1] = a[1] + (b[1] - a[1]) * u; ARC[k * 3 + 2] = a[2] + (b[2] - a[2]) * u; }
  const L = V.dist(a, b) * (jag || .35);
  for (let step = n; step > 1; step >>= 1) {
    const h = step >> 1, s = L * step / n;
    for (let i = 0; i + step <= n; i += step) {
      const m = i + h;
      for (let c = 0; c < 3; c++) ARC[m * 3 + c] = (ARC[i * 3 + c] + ARC[(i + step) * 3 + c]) / 2 + (hh(seed * 3.1 + m * 1.7 + c * 9.3, fr) - .5) * s;
    }
  }
  const cc = col || HOT;
  for (let k = 0; k < n; k++) lineW(ARC[k * 3], ARC[k * 3 + 1], ARC[k * 3 + 2], ARC[k * 3 + 3], ARC[k * 3 + 4], ARC[k * 3 + 5], 1.2, sz || 1, cc, Math.min(1, I), LIME, .07, 0);
}
Object.assign(K, { Bolt, Fork, reachOf, arcW, disp });

/* ---------- overlay: tags, boxes, leaders ---------- */
const tagPool = [];
function mkTag() {
  const d = document.createElement('div'); d.className = 'tag off'; d.innerHTML = '<b></b><i></i><span class="v"></span>';
  $('ui').insertBefore(d, $('menu'));
  const o = { el: d, b: d.children[0], i: d.children[1], v: d.children[2], key: '', on: false, w: -1 }; tagPool.push(o); return o;
}
const tagW = tg => { if (tg.w < 0) tg.w = tg.el.offsetWidth; return tg.w; };
function setTag(tg, id, lab, val, cls, x, y, a) {
  const key = id + '|' + lab + '|' + val + '|' + (cls || '');
  if (tg.key !== key) { tg.key = key; tg.w = -1; tg.b.textContent = id; tg.b.style.display = id ? '' : 'none'; tg.i.textContent = lab; tg.v.textContent = val || ''; tg.v.style.display = val ? '' : 'none'; tg.el.className = 'tag ' + (cls || ''); }
  const w = tagW(tg);
  // a tag pushed far off its anchor by the screen edge, or landing on the readout (top left), is hidden, not clamped
  if (x > 1896 - w + 60 || x < -36 || y < -36 || y > 1100 || (x < 430 && y < 236)) a = 0;
  if (x > 1896 - w) x = 1896 - w; if (x < 24) x = 24; if (y < 24) y = 24; if (y > 1040) y = 1040;
  tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tg.el.classList.remove('off');            // (a tag set again with the same text: endTags' .off must not linger under the inline opacity)
  tg.el.style.opacity = a === undefined ? '' : Math.max(0, Math.min(1, a)).toFixed(2);
  tg.on = true;
}
function beginTags() { for (const t of tagPool) t.on = false; }
/* (the inline opacity setTag left would override .off: cleared, so a tag nobody set this frame really goes) */
function endTags() { for (const t of tagPool) if (!t.on && !t.el.classList.contains('off')) { t.el.classList.add('off'); t.el.style.opacity = ''; } }
const GLY = '·:+×/\\|-=', HOTC = 'ABCDEFGHKMNPRSTVXYZ0123456789/·-';
function decode(s, k, t, seed) {
  if (k >= 1) return s;
  const n = s.length, keep = Math.floor(n * Math.max(0, k)), fr = Math.floor(t * 24);
  let o = s.slice(0, keep);
  for (let i = keep; i < n; i++) {
    const c = s[i];
    if (c === ' ' || c === '·') { o += c; continue; }
    const h = ((i * 7 + fr * 13 + seed * 5) % 11 + 11) % 11;
    if (i < keep + 3) o += HOTC[((i * 5 + fr * 3 + seed) % HOTC.length + HOTC.length) % HOTC.length];
    else o += h < 3 + 7 * k ? GLY[((i * 3 + fr + seed) % GLY.length + GLY.length) % GLY.length] : ' ';
  }
  return o;
}
function flicker(a, t0, t1) {
  if (a < t0 || a > t1 + .3) return 0;
  const u = a - t0, v = t1 - a;
  if (u < .06) return 1; if (u < .11) return .15; if (u < .17) return 1; if (u < .2) return .35;
  if (v > 0) return 1;
  const w = -v;
  if (w < .06) return .2; if (w < .12) return .9; if (w < .16) return .1; if (w < .22) return .6;
  return 0;
}
function bracket(b, col, a, len, lw) {
  const [x0, y0, x1, y1] = b, c = Math.min(len || 14, (x1 - x0) * .35, (y1 - y0) * .35);
  octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = lw || 1.5; octx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
  octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.globalAlpha = a * .45; octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]); octx.globalAlpha = 1;
}
function leader(x0, y0, x1, y1, col, a) { octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
Object.assign(K, { mkTag, setTag, beginTags, endTags, decode, flicker, bracket, leader, tagW });

/* ---------- the scan site: a coastal battery on a headland ----------
   Site frame: metres, origin on the plateau, +Z inland (north), sea to the south. o: { xf (site -> world),
   seaR (radius of the site's own sea, m), landR (m), curve (Earth radius: drop far points under the horizon) } */
function coastZ(x) { return -430 + 170 * noise(x / 900, 1.3) + 55 * noise(x / 260, 4.1) - 200 * E.ss(600, 2400, Math.abs(x)) + 260 * noise(x / 4200, 7.7); }
const VEH_DEF = [
  // key, model, site x, z, yaw, state, id chip, class, track label
  ['tel1', 'tel', -22, 8, PI + .32, {}, 'TEL', 'K340P · BASTION-P', 1],
  ['tel2', 'tel', 19, -3, PI - .22, {}, 'TEL', 'K340P · BASTION-P', 1],
  ['rdr', 'radar', -5, 33, PI + .1, { mast: 1, ant: PI * .5 }, 'RDR', 'MONOLITH-B', 1],
  ['sam', 'pantsir', 32, 27, PI - .5, {}, 'SAM', 'PANTSIR-S1', 1],
];
const PART_PICK = {
  tel: [['launcher', 'TLC ×2 · 3M55 ONIKS'], ['chassis', 'MZKT-7930 · 8×8'], ['cab', 'CAB · CREW 3']],
  radar: [['array', 'MONOLITH-B · ACTIVE ARRAY'], ['mast', 'MAST · 5 SECTIONS'], ['body', 'EQUIPMENT SHELTER']],
  pantsir: [['turret', 'COMBAT MODULE · 72V6'], ['guns', '2A38M ×2 · 30 MM'], ['missiles', '57E6 ×12']],
};
function makeSite(o) {
  const XF = o.xf || X.make();
  const seaR = o.seaR || 3000, landR = o.landR || 12000, Re = o.curve || 0, HOLE = o.seaHole || null;
  // vehicles first (the berms need their spots)
  const V_ = (o.veh || VEH_DEF).map(([key, kind, x, z, yaw, st, chip, lab]) => ({ key, kind, x, z, yaw, st, chip, lab }));
  const berm = (x, z) => {
    let h = 0;
    for (const v of V_) {
      if (v.kind === 'radar') continue;
      const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
      if (d > 24) continue;
      // horseshoe open toward the vehicle's front
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), c = (dx * fx + dz * fz) / (d || 1);
      const open = E.ss(.35, .75, c);
      const ring = Math.exp(-Math.pow((d - 14) / 3, 2));
      h += 2.4 * ring * (1 - open);
    }
    return h;
  };
  const roadD = (x, z) => Math.abs(z - (60 + 40 * Math.sin(x / 210) + .12 * x));
  function ground(x, z) {
    const d = z - coastZ(x);
    if (d <= 0) return -1;
    const xk = x / 1000, zk = z / 1000;
    const cliff = 24 * E.ss(0, 55, d);
    const hill = 150 * (1 - Math.exp(-Math.max(0, d - 300) / 2600)) * (.45 + .55 * fbm(xk * .5 + 3.3, zk * .5 - 1.2, 2.1, 4));
    const rough = 5 * fbm(xk * 3.1, zk * 3.1, 7.7, 3) + 1.1 * fbm(xk * 25, zk * 25, 5.5, 2);
    let h = cliff + hill * E.ss(80, 600, d) + rough * E.ss(0, 40, d);
    // the plateau the battery stands on
    const pr = Math.hypot(x - 5, z - 20), flat = 1 - E.ss(110, 190, pr);
    h = E.mix(h, 29, flat) + berm(x, z);
    // the road cut
    const rd = roadD(x, z); if (rd < 5 && d > 60) h -= .25 * (1 - rd / 5);
    return Math.max(.4, h);
  }
  const SUN = V.norm([-.5, .55, -.4]);
  // land: x, y, z, brightness (site frame)
  const LA = [], r = rng(4401);
  const addAt = (x, z, sp) => {
    const h = ground(x, z); if (h < .5) return;
    const e = sp * .5, gx = (ground(x + e, z) - ground(x - e, z)) / (2 * e), gz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
    const n = V.norm([-gx, 1, -gz]), sh = Math.max(0, V.dot(n, SUN)), band = (h / 5) % 1 < .1 && h > 3 ? .16 : 0;
    const rd = roadD(x, z) < 3.2 && z - coastZ(x) > 60 ? .16 : 0;
    let y = h; if (Re) y -= (x * x + z * z) / (2 * Re);
    LA.push(x, y, z, Math.min(1, .1 + .6 * Math.pow(sh, 1.3) + band + rd + .05 * r()));
  };
  // spacing grows smoothly with the distance from the battery: fine on the plateau, coarse far inland
  const spAt = (x, z) => Math.min(110, 2.4 * Math.pow(Math.max(1, Math.hypot(x, z - 10) / 140), .95));
  for (let L = 0, sL = 2.4; L < 7; L++, sL *= 2) {
    const rmin = L ? 140 * Math.pow(sL / 2.4 / 2, 1 / .95) * .98 : 0, rmax = Math.min(landR, 140 * Math.pow(sL * 2 / 2.4, 1 / .95) * 1.02 + sL);
    const ext = Math.ceil(rmax / sL) * sL;
    for (let x = -ext; x < ext; x += sL) for (let z = -ext; z < ext; z += sL) {
      const xx = x + (r() - .5) * sL * .7, zz = z + (r() - .5) * sL * .7, rr = Math.hypot(xx, zz - 10);
      if (rr < rmin || rr > rmax || rr > landR) { r(); continue; }
      const sp = spAt(xx, zz);
      if (sp < sL * .999 || sp >= sL * 2) { r(); continue; }
      if (r() > (sL / sp) * (sL / sp)) continue;
      if (zz < coastZ(xx) - 5) continue;
      addAt(xx, zz, sp);
    }
  }
  const LAND = tiled(new Float32Array(LA), 4, 160);
  // sea: x, z, brightness, phase (site frame), rings round the plateau
  const SA = [], rs = rng(5502);
  for (let rad = 20; rad < seaR; rad += 2 + rad * .02) {
    const ds = 2 + rad * .02, n = Math.floor(TAU * rad / ds), ph = rs() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * TAU, rr_ = rad + (rs() - .5) * ds * .8, x = Math.sin(a) * rr_, z = Math.cos(a) * rr_ + 20;
      if (z > coastZ(x) - 2) continue;
      if (HOLE && Math.hypot(x - HOLE.x, z - HOLE.z) < HOLE.r) { rs(); rs(); rs(); rs(); continue; }
      const tex = Math.exp(1.1 * fbm(x * .003, z * .0012, 3.7, 3) - .2), surf = Math.exp(-Math.max(0, coastZ(x) - z) / 30);
      SA.push(x, z, Math.min(1, .12 + .1 * tex + .35 * surf * (.5 + .5 * rs()) + .04 * rs()), rs() * TAU);
    }
  }
  const SEA = tiled(new Float32Array(SA), 4, 180, true);

  // vehicles: per-part LOD clouds in model space
  const LVV = [.05, .1, .2, .4, .8];
  const models = {};
  const modelOf = (kind, st) => {
    const k = kind + JSON.stringify(st);
    if (models[k]) return models[k];
    const M = kind === 'tel' ? HD.tel() : kind === 'radar' ? HD.radar() : HD.pantsir();
    const parts = lodModel(M, st, LVV, 77 + kind.length, .9);
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of parts) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p.ml.mn[c]); mx[c] = Math.max(mx[c], p.ml.mx[c]); }
    // strike point: the highest point near the middle
    let best = null, by = -1e9;
    const cxm = (mn[0] + mx[0]) / 2, czm = (mn[2] + mx[2]) / 2;
    for (const p of parts) { const P = p.ml.lv[3]; for (let i = 0; i < P.length; i += 6) { if (Math.abs(P[i] - cxm) > (mx[0] - mn[0]) * .3 + .3 || Math.abs(P[i + 2] - czm) > (mx[2] - mn[2]) * .25 + .3) continue; if (P[i + 1] > by) { by = P[i + 1]; best = [P[i], P[i + 1], P[i + 2]]; } } }
    const sp = best || [cxm, mx[1], czm];
    // tendril graph over the model
    const nodes = [];
    for (const p of parts) { const P = p.ml.lv[3]; for (let i = 0; i < P.length; i += 6 * 3) nodes.push([P[i], P[i + 1], P[i + 2]]); }
    const rr = rng(909 + kind.length * 31);
    for (let i = nodes.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); const t = nodes[i]; nodes[i] = nodes[j]; nodes[j] = t; }
    nodes.length = Math.min(nodes.length, 340);
    const ts = nodes.map(q => V.dist(q, sp) / 11 * (1 + .45 * rr()));
    const ord = nodes.map((_, i) => i).sort((a, b) => ts[a] - ts[b]);
    const par = new Int32Array(nodes.length).fill(-1);
    for (let k = 1; k < ord.length; k++) {
      const i = ord[k]; let bd = 1e9, bj = -1;
      for (let q = 0; q < k; q++) { const j = ord[q], d = V.dist(nodes[i], nodes[j]); if (d < bd) { bd = d; bj = j; } }
      if (bd < 3.5) par[i] = bj;
    }
    const NF = new Float32Array(nodes.length * 3); nodes.forEach((q, i) => NF.set(q, i * 3));
    return (models[k] = { parts, mn, mx, sp, NF, ts: Float32Array.from(ts), par, L: mx[2] - mn[2], M });
  };
  for (const v of V_) {
    v.m = modelOf(v.kind, v.st);
    const gy = ground(v.x, v.z);
    v.local = X.make(R.y(v.yaw), [v.x, gy, v.z]);
    v.W = X.mul(XF, v.local);
    v.spW = X.ap(v.W, v.m.sp);
    v.cenW = X.ap(v.W, [(v.m.mn[0] + v.m.mx[0]) / 2, (v.m.mn[1] + v.m.mx[1]) / 2, (v.m.mn[2] + v.m.mx[2]) / 2]);
    v.pick = PART_PICK[v.kind].map(([name, lab]) => { const p = v.m.parts.find(q => q.name === name); return p ? { name, lab, p, tg: null } : null; }).filter(Boolean);
    v.pick.forEach((q, k) => { q.id = String(k + 1).padStart(2, '0'); q.tg = mkTag(); });
    v.tag = mkTag();
    v.seed = v.key.length * 7 + v.x | 0;
  }
  // the TELs' X-ray: the two rounds inside the launch containers (HD.oniks, nose forward)
  const ONX = lodModel(HD.oniks({}), { booster: true }, [.04, .08, .16, .32, .64], 311, .7);
  const TUBE = HD.tel().TUBE, TLEN = 9.25;
  const onXf = side => X.make(R.I(), [side * TUBE[0], TUBE[1], TUBE[2] + TLEN / 2 + .2]);

  // the strike: main hit on the ground between the vehicles, forks to each
  const hitL = [2, ground(2, 13), 13];
  const hitW = X.ap(XF, hitL);
  const groundW = (xw, zw) => { const Ri = XF.R; const dx = xw - XF.T[0], dz = zw - XF.T[2]; const lx = Ri[0] * dx + Ri[6] * dz, lz = Ri[2] * dx + Ri[8] * dz; return ground(lx, lz) + XF.T[1]; };
  const SCAN_R = o.scanR || 110, SK_ = SCAN_R / 110;
  V_.forEach((v, k) => {
    const d = Math.hypot(v.x - hitL[0], v.z - hitL[2]);
    v.tF = .12 + .42 * d / SCAN_R + (V_.length > 4 ? .03 : .08) * k;
    v.fork = new Fork({ from: hitW, to: v.spW, seed: 61 + k * 17, ground: groundW });
  });
  const tAll = Math.max(...V_.map(v => v.tF)) + .04;
  const TF = o.scanTF || 2.3, ID_END = o.idEnd || 5.2;

  const site = { XF, ground, groundW, coastZ, V: V_, hitW, hitL, SCAN_R, tAll, LAND, SEA, ONX, onXf, Re };

  /* ---- drawing ---- */
  // the scan state this frame: tb = s since the main stroke connected (null: none)
  function drawGround(T, tb, vis, seaT) {
    vis = vis === undefined ? 1 : vis;
    const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
    const M = XF.R, t = XF.T;
    // site -> camera
    const q0 = r[0] * M[0] + r[1] * M[3] + r[2] * M[6], q1 = r[0] * M[1] + r[1] * M[4] + r[2] * M[7], q2 = r[0] * M[2] + r[1] * M[5] + r[2] * M[8];
    const w0 = u[0] * M[0] + u[1] * M[3] + u[2] * M[6], w1 = u[0] * M[1] + u[1] * M[4] + u[2] * M[7], w2 = u[0] * M[2] + u[1] * M[5] + u[2] * M[8];
    const z0 = f[0] * M[0] + f[1] * M[3] + f[2] * M[6], z1 = f[0] * M[1] + f[1] * M[4] + f[2] * M[7], z2 = f[0] * M[2] + f[1] * M[5] + f[2] * M[8];
    const dx0 = t[0] - e[0], dy0 = t[1] - e[1], dz0 = t[2] - e[2];
    const qb = r[0] * dx0 + r[1] * dy0 + r[2] * dz0, wb = u[0] * dx0 + u[1] * dy0 + u[2] * dz0, zb = f[0] * dx0 + f[1] * dy0 + f[2] * dz0;
    // the scan front across the ground (site frame)
    let fr = -1, fA = 0, lit = 0;
    if (tb !== null && tb > 0) {
      fr = SCAN_R * (1 - Math.pow(1 - E.clamp(tb / TF, 0, 1), 2)); fA = tb < TF ? 1 : 1 - E.sat((tb - TF) / 1.3);
      const ta = tb - tAll; if (ta > 0 && ta < .14) lit = ta < .05 ? 1 : 1 - (ta - .05) / .09;
      const I = Bolt.stroke(tb); lit = Math.max(lit, Math.min(1, I) * .8);
    }
    const hx = hitL[0], hz = hitL[2], fw = 9 * Math.sqrt(SK_), fdec = 30 * SK_;
    const L = LAND.F, TL = LAND.TL, ex = e[0], ey = e[1], ez = e[2];
    for (let tt = 0; tt < LAND.nt; tt++) {
      const q = tt * 6, cxs = TL[q + 2], cys = TL[q + 3], czs = TL[q + 4];
      const wx = M[0] * cxs + M[1] * cys + M[2] * czs + t[0], wy = M[3] * cxs + M[4] * cys + M[5] * czs + t[1], wz = M[6] * cxs + M[7] * cys + M[8] * czs + t[2];
      if (!wIn(wx, wy, wz, TL[q + 5])) continue;
      const zt = WZ[0], np = TL[q + 1] - TL[q];
      const spT = 160 / Math.sqrt(np), dsp = spT * F / Math.max(1, zt);
      const step = dsp >= 2.7 ? 1 : Math.min(40, Math.round(2.7 * 2.7 / (dsp * dsp)));
      const fadeD = zt < 3000 ? 1 : zt < 40000 ? .8 : .6;
      for (let k = TL[q] + ((tt * 7) % step), k1 = TL[q + 1]; k < k1; k += step) {
        const j = k * 4, px = L[j], py = L[j + 1], pz = L[j + 2];
        const zc = z0 * px + z1 * py + z2 * pz + zb; if (zc < 2) continue;
        const iz = F / zc, sx = cx + (q0 * px + q1 * py + q2 * pz + qb) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (w0 * px + w1 * py + w2 * pz + wb) * iz; if (sy < 0 || sy >= BH) continue;
        let b = L[j + 3] * vis * fadeD * (zc < 1500 ? 1 - zc / 5000 : .7);
        const ds = spT * iz;
        let cr = WH[0], cg = WH[1], cb = WH[2];
        if (fr > 0) {
          const dx = px - hx, dz = pz - hz, d = Math.sqrt(dx * dx + dz * dz);
          let k2 = 0;
          if (d < fr && d > fr - fw * 4) k2 = Math.exp(-(fr - d) / fw) * fA;
          if (d < SCAN_R * 1.05) { const kl = lit * Math.exp(-d / fdec) + lit * .35; if (kl > k2) k2 = Math.min(1, kl); if (d < fr) b *= 1 + .5 * fA; }
          if (k2 > .02) { if (b < k2 * .9) b = k2 * .9; cr += (LIME[0] - cr) * k2; cg += (LIME[1] - cg) * k2; cb += (LIME[2] - cb) * k2; }
        }
        if (b < .02) continue;
        dot(sx, sy, ds > 9 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
    // sea
    const S = SEA.F, TS = SEA.TL, Ts = seaT === undefined ? T : seaT, ph = Ts * TAU / 5, sw = Ts * TAU / 8;
    for (let tt = 0; tt < SEA.nt; tt++) {
      const q = tt * 6, cxs = TS[q + 2], czs = TS[q + 4];
      const wx = M[0] * cxs + M[2] * czs + t[0], wz = M[6] * cxs + M[8] * czs + t[2];
      if (!wIn(wx, t[1], wz, TS[q + 5] + 2)) continue;
      const zt = WZ[0], dsp = 180 / Math.sqrt(TS[q + 1] - TS[q]) * F / Math.max(1, zt);
      const step = dsp >= 2.3 ? 1 : Math.min(40, Math.round(2.3 * 2.3 / (dsp * dsp)));
      for (let k = TS[q] + ((tt * 5) % step), k1 = TS[q + 1]; k < k1; k += step) {
        const j = k * 4, px = S[j], pz = S[j + 1];
        let py = .25 * Math.sin(S[j + 3] + ph) + .35 * Math.sin(sw + pz * .02 + px * .006);
        if (Re) py -= (px * px + pz * pz) / (2 * Re);
        const zc = z0 * px + z1 * py + z2 * pz + zb; if (zc < 2) continue;
        const iz = F / zc, sx = cx + (q0 * px + q1 * py + q2 * pz + qb) * iz; if (sx < 0 || sx >= BW) continue;
        const sy = cy - (w0 * px + w1 * py + w2 * pz + wb) * iz; if (sy < 0 || sy >= BH) continue;
        let b = S[j + 2] * vis * (zc < 3000 ? 1 - zc / 6000 : .5) * (step > 1 ? 1.2 : 1);
        let cr = WH[0], cg = WH[1], cb = WH[2];
        if (lit > 0) { const dx = px - hx, dz = pz - hz, d = Math.sqrt(dx * dx + dz * dz); if (d < SCAN_R * 3) { const k2 = lit * .5 * Math.exp(-d / (120 * SK_)); cr += (LIME[0] - cr) * k2; cg += (LIME[1] - cg) * k2; cb += (LIME[2] - cb) * k2; b += k2 * .5; } }
        if (b < .02) continue;
        dot(sx, sy, zc < 40 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
  }
  /* the vehicles: dim unknowns before the scan; tendrils, flare, X-ray, then settled */
  const VO = { a: 1.2, fade: 1400, rev: null, keep: 1, lime: 0, tint: null, tk: 0, px: 3 };
  const REV = { x: 0, y: 0, z: 0, age: 0, v: 11, pre: .55, after: 0 };
  function drawVehicles(tb) {
    for (const v of V_) {
      const age = tb === null ? -9 : tb - v.tF;
      const xr = v.kind === 'tel' ? K.flicker(age, 1.1, 3.9) : 0;
      for (const p of v.m.parts) {
        VO.rev = null; VO.keep = 1; VO.a = 1.2; VO.tint = null; VO.tk = 0;
        if (age > -1 && age < 6) { REV.x = v.m.sp[0]; REV.y = v.m.sp[1]; REV.z = v.m.sp[2]; REV.age = age; REV.pre = .8; REV.after = .1 * Math.exp(-Math.max(0, age - 1) * .6); VO.rev = REV; }
        if (xr > 0 && (p.name === 'launcher' || p.name === 'capL' || p.name === 'capR')) VO.keep = 1 - .72 * xr;
        drawLod(p.ml, v.W, VO);
      }
      if (xr > 0) {
        VO.rev = null; VO.keep = 1; VO.a = xr; VO.lime = .85;
        for (const s of [-1, 1]) { const Wm = X.mul(v.W, onXf(s)); for (const p of ONX) drawLod(p.ml, Wm, VO); }
        VO.lime = 0;
      }
    }
  }
  /* the lightning: the main stroke's leader (lead s before tb 0), the return stroke, sparks, chain forks */
  function drawBolt(bolt, tb, lead) {
    if (tb === null) return;
    if (tb < 0) {
      if (tb > -lead) { const c = tb + lead, reach = Math.pow(E.sat(Math.floor(c / .06) * .06 / lead), 1.1); bolt.draw(reach, .5, true, c * 1.2); }
      return;
    }
    const I = Bolt.stroke(tb);
    if (tb < 1.4) { bolt.draw(1, I, false, tb < .14 ? 1 + tb : 9); bolt.sparks(tb); }
    for (const v of V_) {
      const a = tb - (v.tF - .24);
      if (a < 0 || a > 1.6) continue;
      if (a < .24) v.fork.draw(reachOf(a, .24), .5, true, a);
      else { const tr = a - .24; v.fork.draw(1, Bolt.stroke(tr * 1.15), false, a); if (tr < .9) sparksAt(v, tr); }
    }
    // ring pulse at the strike, and the front ring over the ground
    if (tb < .5) ringG(hitL, SCAN_R * .14 * E.outCubic(tb / .5), HOT, .9 * (1 - tb / .5), 2);
    const fr = SCAN_R * (1 - Math.pow(1 - E.clamp(tb / TF, 0, 1), 2)), fA = tb < TF ? 1 : 1 - E.sat((tb - TF) / 1.3);
    if (fA > .01) { ringG(hitL, fr, LIME, .9 * fA, 2); ringG(hitL, SCAN_R, LIME, .35 * fA, 1); }
  }
  const SPK = (() => { const rr = rng(7123), A = new Float32Array(70 * 4); for (let i = 0; i < 70; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = 3 + rr() * 9, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h * s; A[i * 4 + 1] = Math.abs(u) * s * .8 + 1; A[i * 4 + 2] = Math.sin(a) * h * s; A[i * 4 + 3] = .35 + rr() * .6; } return A; })();
  function sparksAt(v, a) {
    const h = v.spW;
    for (let i = 0; i < 70; i++) { const o = i * 4, life = SPK[o + 3]; if (a > life) continue; dotW(h[0] + SPK[o] * a, h[1] + SPK[o + 1] * a - 9 * a * a, h[2] + SPK[o + 2] * a, 2, [230, 255, 170], 1 - a / life); }
  }
  // a ring of dots over the ground (site frame centre), following the terrain
  const RG = [0, 0, 0];
  // polar table of the ground round the strike (the rings and the dust sample it every frame)
  const PG_DR = 3, PG_NR = 150, PG_NA = 480, PG = new Float32Array(PG_NR * PG_NA);
  for (let i = 0; i < PG_NR; i++) for (let j = 0; j < PG_NA; j++) { const r = i * PG_DR, t = j / PG_NA * TAU; PG[i * PG_NA + j] = Math.max(0, ground(hitL[0] + Math.cos(t) * r, hitL[2] + Math.sin(t) * r)); }
  /* ground height at radius r, angle t round the strike point (site frame) */
  function groundP(r, t) {
    const i = Math.min(PG_NR - 1, Math.round(r / PG_DR)); let j = Math.round(t / TAU * PG_NA) % PG_NA; if (j < 0) j += PG_NA;
    return PG[i * PG_NA + j];
  }
  const XP = XF.R, XT = XF.T;
  function ringG(cL, rad, col, a, s) {
    if (a < .01 || rad < .5) return;
    const n = Math.min(900, Math.max(40, Math.round(rad * 2.2))), polar = cL === hitL;
    for (let k = 0; k < n; k++) {
      const t = k / n * TAU, x = cL[0] + Math.cos(t) * rad, z = cL[2] + Math.sin(t) * rad, y = (polar ? groundP(rad, t) : Math.max(0, ground(x, z))) + .4;
      if (pj(XP[0] * x + XP[1] * y + XP[2] * z + XT[0], XP[3] * x + XP[4] * y + XP[5] * z + XT[1], XP[6] * x + XP[7] * y + XP[8] * z + XT[2])) dot(PJ[0], PJ[1], s, col[0], col[1], col[2], a);
    }
  }
  /* the identification overlay: tendrils (lime wires), part boxes with placards, the white vehicle box, the track tag */
  function overlay(T, tb, A) {
    A = A === undefined ? 1 : A;
    for (const v of V_) {
      const age = tb === null ? -9 : tb - v.tF;
      // tendrils racing over the vehicle's points from where the fork hit
      if (age > 0 && age < 2.2) {
        const m = v.m, N = m.NF, TS_ = m.ts, PAR = m.par;
        octx.globalCompositeOperation = 'lighter'; octx.lineWidth = 1.2; octx.strokeStyle = 'rgba(210,255,120,.85)'; octx.beginPath();
        for (let i = 0; i < TS_.length; i++) {
          const tn = TS_[i]; if (age < tn || age > tn + .2 || PAR[i] < 0) continue;
          const p = X.ap(v.W, [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]), j = PAR[i], q = X.ap(v.W, [N[j * 3], N[j * 3 + 1], N[j * 3 + 2]]);
          if (!pj(p[0], p[1], p[2])) continue; const x0 = PJ[0], y0 = PJ[1];
          if (!pj(q[0], q[1], q[2])) continue;
          octx.moveTo(PJ[0], PJ[1]); octx.lineTo(x0, y0);
        }
        octx.stroke(); octx.globalCompositeOperation = 'source-over';
      }
      const box = boxOf(v.m.mn, v.m.mx, v.W, 4);
      const onScr = box && box[2] > 0 && box[0] < BW && box[3] > 0 && box[1] < BH;
      const px = onScr ? Math.max(box[2] - box[0], box[3] - box[1]) : 0;
      // the track tag: unknown before, decoding during, settled coral after
      if (box && px > 18) {
        const k = E.sat((age - .5) / 1.6), conf = age < 0 ? .31 : .31 + .66 * E.ss(.4, 2.4, age);
        const dec = age < .3 ? '?' : K.decode(v.lab, k, T, v.seed);
        const idd = age < .5 ? '?' : v.chip;
        const settled = age > 2.4;
        const cls = settled ? 'coral sm' : age > 0 ? 'lime sm' : 'sm';
        const lab = age < 0 ? 'UNKNOWN' : dec;
        const ta = A * (age < -.2 ? .55 : 1) * (age > ID_END + 2 ? Math.max(.5, 1 - (age - ID_END - 2) / 1.5) : 1);
        setTag(v.tag, idd, lab, conf.toFixed(2), cls, box[0], box[1] - 24, ta);
        if (age > 0 && age < ID_END) { const wa = A * E.sat(age / .2) * (1 - E.sat((age - ID_END + .6) / .6)); bracket(box, '#ffffff', wa * .9, 12); }
        else if (px > 10) { octx.strokeStyle = settled ? '#FF6A3D' : 'rgba(255,255,255,.6)'; octx.globalAlpha = A * .7; octx.lineWidth = 1; const c = Math.min(8, px * .3); const [x0, y0, x1, y1] = box; octx.beginPath(); for (const [bx, by, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(bx + sx * c, by); octx.lineTo(bx, by); octx.lineTo(bx, by + sy * c); } octx.stroke(); octx.globalAlpha = 1; }
      }
      // part boxes, popping as the tendrils reach them, placards decoding
      if (age > 0 && age < ID_END && px > 90) {
        v.pick.forEach((q, kk) => {
          const t0 = .5 + kk * .32, a = age - t0; if (a < 0) return;
          const out = 1 - E.sat((age - ID_END + .5) / .5);
          const b = boxOf(q.p.ml.mn, q.p.ml.mx, v.W, 2); if (!b) return;
          const pop = E.sat(a / .12);
          const cxm = (b[0] + b[2]) / 2, cym = (b[1] + b[3]) / 2;
          const bb = [cxm + (b[0] - cxm) * (1.25 - .25 * pop), cym + (b[1] - cym) * (1.25 - .25 * pop), cxm + (b[2] - cxm) * (1.25 - .25 * pop), cym + (b[3] - cym) * (1.25 - .25 * pop)];
          bracket(bb, '#C6F432', A * out * (a < .1 ? (Math.floor(a * 60) % 2 ? .4 : 1) : 1), 9, 1.3);
          const lab = K.decode(q.lab, E.sat((a - .08) / .7), T, kk * 5 + v.seed);
          const tx = kk % 2 ? bb[2] + 8 : bb[0] - 8 - K.tagW(q.tg);
          setTag(q.tg, q.id, lab, '', 'lime sm', tx, kk % 2 ? bb[1] : bb[3] - 18, A * out);
          leader(kk % 2 ? bb[2] : bb[0], kk % 2 ? bb[1] + 9 : bb[3] - 9, kk % 2 ? bb[2] + 8 : bb[0] - 8, kk % 2 ? bb[1] + 9 : bb[3] - 9, '#C6F432', .8 * A * out);
        });
      }
    }
  }
  Object.assign(site, { drawGround, drawVehicles, drawBolt, overlay, ringG, groundP, TF, ID_END });
  return site;
}
K.makeSite = makeSite;

/* ---------- small math ---------- */
/* quaternions [w, x, y, z] for attitude slews */
const Q = {
  axis: (ax, a) => { const s = Math.sin(a / 2), n = V.norm(ax); return [Math.cos(a / 2), n[0] * s, n[1] * s, n[2] * s]; },
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]],
  slerp: (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; let bb = b;
    if (d < 0) { d = -d; bb = b.map(v => -v); }
    if (d > .9995) { const o = a.map((v, i) => v + (bb[i] - v) * t), l = Math.hypot(...o); return o.map(v => v / l); }
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((v, i) => v * wa + bb[i] * wb);
  },
  toR: q => { const [w, x, y, z] = q; return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]; },
  fromR: m => {
    const tr = m[0] + m[4] + m[8];
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [.25 * s, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s]; }
    if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; return [(m[7] - m[5]) / s, .25 * s, (m[1] + m[3]) / s, (m[2] + m[6]) / s]; }
    if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; return [(m[2] - m[6]) / s, (m[1] + m[3]) / s, .25 * s, (m[5] + m[7]) / s]; }
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; return [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, .25 * s];
  },
};
K.Q = Q;
/* camera blend: a = {eye, target, fov}, b likewise, w 0..1 (eased by the caller) */
K.blendShot = (a, b, w) => ({ eye: V.lerp(a.eye, b.eye, w), target: V.lerp(a.target, b.target, w), fov: a.fov + (b.fov - a.fov) * w, roll: (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * w });
/* log-distance interpolation */
K.logMix = (d0, d1, u) => Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * u);
/* readout helper */
K.fmtClock = s => { const sg = s < 0 ? '−' : '+'; s = Math.abs(s); return `T${sg}${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

window.ORK = K;
})();
