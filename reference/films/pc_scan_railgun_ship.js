/* SCAN · RAILGUN ship detail: the Burke (DDG-51 Flight IIA) rebuilt as crisp lattice clouds in the parts' style —
   faces on regular grids (sparser than their edges, as on the mount), block edges and surface lines (plating seams,
   doors, louvres, array tiles, deck markings) as dense dots that carry the normal of the face they lie on (lit, and
   culled with it, so the far side does not show through); wires, rails and antennas stay two-sided hairlines.
   Hull (skin on a z/y grid, knuckle, boot-topping, strakes, butts, stem, transom), deck, bow bulwark with Panama
   chock, hawse pipes with stockless anchors, windlasses, chain, stoppers, bitts, chocks, jackstaff and ensign staff,
   lifelines; deckhouses with doors, louvres and seams; the SPY house with bridge windows, wings and four SPY-1D(V)
   faces (tiled); SEWIP, SPG-62s, satcom domes; the raked mast (legs, bracing, ladder, gratings, yards, dipoles,
   SPS-67, SPS-73, TACAN); both uptakes (louvre banks, cap, grille, exhausts); Mk 41 fore and aft (modules, cell
   and uptake hatches); two Phalanx; RHIBs under slewing davits; SRBOC, Nulka, Mk 38, SVTT; flight deck markings,
   tie-downs, nets, hangar doors, HRS. Positions and the hull form are HD.destroyer's (hd_sea_air.js ddBuild): ship
   frame +Z fwd, +X stbd, y up, origin midships at the waterline. The hull and deck skip ship z 41..64 (the parts'
   fine patch round the mount covers it). Each hull side's plating and the deckhouses' side walls sit in their own
   clouds, left out while the lens is across the centreline (a getter on the part's ml reads K.C.eye).
   window.RGS.build(RGP) -> { skip: [all HD.destroyer parts], parts: [{ ml, cut }] }.
   Debug (URL): rgsoff (the plain HD ship), rgsonly=name,name (only those clouds), rgsprof (points per cloud in
   RGS.drawn, drawX time in msMine / msOther; the film's own point count is lost). */
(function () {
'use strict';
const { V, R, X } = M3;
const G = GEO, K = SK;
const PI = Math.PI, TAU = 2 * PI;
const F = o => Object.assign({ fine: true }, o || {});
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const DA = HD.destroyer.A, hD = DA.deckY;
let P_ = null;

/* ================= the hull form (hd_sea_air.js ddSec) ================= */
const ZB = 77.6, ZS = -77.6, ZST = 70.6, D01 = 10.3, CUT = [41, 64];
const hB = z => { const u = z / ZB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); if (u < -.55) return 10 * (1 - .14 * Math.pow((-.55 - u) / .45, 1.5)); return 10; };
const hW = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
const hK0 = z => z <= ZST ? 0 : hD(ZB) * Math.pow(Math.min(1, (z - ZST) / (ZB - ZST)), 1 / 1.35);
function sec(z) { const d = hD(z), b = hB(z), y0 = hK0(z), w = hW(z), yk = d - Math.min(1.6, (d - y0) * .3); return { w: [w, y0], k: [w + (b - w) * .9, yk], d: [b, d] }; }
function hxS(s, y) {
  if (y <= s.k[1]) return s.w[0] + (s.k[0] - s.w[0]) * Math.max(0, (y - s.w[1]) / Math.max(1e-6, s.k[1] - s.w[1]));
  return s.k[0] + (s.d[0] - s.k[0]) * (y - s.k[1]) / Math.max(1e-6, s.d[1] - s.k[1]);
}
const hx = (z, y) => hxS(sec(z), y);
function hullN(z, y, sg) {
  const e = .05, s = sec(z), fy = (hxS(s, y + e) - hxS(s, y - e)) / (2 * e), fz = (hx(z + e, y) - hx(z - e, y)) / (2 * e);
  return V.norm([sg, -fy, -fz]);
}
const onHull = (z, y, sg, off) => V.mad([sg * hx(z, y), y, z], hullN(z, y, sg), off || 0);

/* ================= positions (HD.destroyer) ================= */
const VF_Z = 38.9, VA_Z = -29.4, VP = .85, STACK_Z = [2.2, -17.0], PS = [0, 28.2, 21.6], HELO_Z = -65.5;
const CIWS_P = [[0, 11.0, 32.9], [0, 13.9, -47.5]], CIWS_YAW = [0, PI], CIWS_EL = .35, CIWS_TR = [0, 1.55, 0], CIWS_MZ = [0, 1.36, 2.12];
const SPY_HOUSE = [[-3.9, 31.0], [3.9, 31.0], [8.0, 26.9], [8.0, 12.2], [3.9, 8.1], [-3.9, 8.1], [-8.0, 12.2], [-8.0, 26.9]];
const SY0 = D01, SY1 = 19.4, SIN = 1.3, SPY_R = 1.95;
const MB = 20.6, MT = 38.0;
const LEGS = [[[-1.7, MB, 22.9], [-.55, MT, 17.6]], [[1.7, MB, 22.9], [.55, MT, 17.6]], [[1.7, MB, 17.4], [.55, MT, 15.4]], [[-1.7, MB, 17.4], [-.55, MT, 15.4]]];
const legAt = (k, y) => V.lerp(LEGS[k][0], LEGS[k][1], (y - MB) / (MT - MB));
function insetPoly(P, d) {
  const n = P.length; let A = 0;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? 1 : -1, L = [];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); L.push([a[0] - dz / l * sg * d, a[1] + dx / l * sg * d, dx, dz]); }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = L[(i + n - 1) % n], l2 = L[i], den = l1[2] * l2[3] - l1[3] * l2[2];
    if (Math.abs(den) < 1e-9) { out.push([l2[0], l2[1]]); continue; }
    const t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / den;
    out.push([l1[0] + l1[2] * t, l1[1] + l1[3] * t]);
  }
  return out;
}
function vlsCell(i) {
  const fwd = i < 32, k = fwd ? i : i - 32, r = Math.floor(k / 8), c = k % 8, rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z;
  const m = c >> 1, j = c & 1, xm = (-3 + 2 * m) * 1.05, z = zc + ((rows - 1) / 2 - r) * VP;
  return { x: xm + (j ? .72 : -.72), z, y: hD(zc) + .06, hs: j ? 1 : -1, xm };
}

/* ================= prims and the sampler =================
   Q: a one-sided lattice quad (a->b, a->d), normal n or from the corners turned toward o.to; o.e adds its edges.
   SL: a surface line: dense dots with the normal of the face it lies on (o.ns: per vertex), o.closed.
   FN: a custom sampler fn(out, spacing, coarse). LN: a two-sided hairline (GEO line). Everything else: GEO prims
   sampled by the parts' lattice sampler. o.fine: dropped at the coarse levels; o.ds: spacing scale. */
const Q = (a, b, c, d, o) => {
  o = o || {}; let n = o.n || V.norm(V.cross(V.sub(b, a), V.sub(d, a)));
  if (o.to && V.dot(n, o.to) < 0) n = V.mul(n, -1);
  return Object.assign({}, o, { t: 'Q', q: [a, b, c, d], n });
};
const SL = (p, n, o) => Object.assign({}, o || {}, { t: 'S', p, n });
const FN = (fn, o) => Object.assign({}, o || {}, { t: 'FN', fn });
const LN = (p, o) => G.line(p, o);
/* GEO hex and lathe sampled like the parts' sampler, but their edges and rings carry the outward normal of the
   corner they lie on (lit, and culled on the far side) instead of being two-sided */
const HF = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const HE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function lineN(o, a, b, n, st) {
  const m = Math.max(1, Math.round(V.dist(a, b) / st));
  for (let k = 0; k < m; k++) { const u = (k + .5) / m; o.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, n[0], n[1], n[2]); }
}
function litHex(o, pr, s0) {
  const s = s0 * (pr.ds || 1), es = s0 * .6 * Math.min(2, pr.ds || 1), P = pr.p, c = [0, 0, 0];
  for (const p of P) { c[0] += p[0] / 8; c[1] += p[1] / 8; c[2] += p[2] / 8; }
  if (!pr.edgeOnly) HF.forEach((f, k) => {
    if (k === 0 && pr.bottom !== true) return; if (pr.skip && pr.skip.includes(k)) return;
    const a = P[f[0]], b = P[f[1]], cc = P[f[2]], d = P[f[3]];
    let n = V.cross(V.sub(b, a), V.sub(d, a)); if (V.len(n) < 1e-9) n = V.cross(V.sub(cc, b), V.sub(a, b)); n = V.norm(n);
    const fc = [(a[0] + b[0] + cc[0] + d[0]) / 4, (a[1] + b[1] + cc[1] + d[1]) / 4, (a[2] + b[2] + cc[2] + d[2]) / 4];
    if (V.dot(n, V.sub(fc, c)) < 0) n = V.mul(n, -1);
    P_.quadL(o, a, b, cc, d, n, s);
  });
  if (!pr.noEdge) for (const [i, j] of HE) {
    let n = V.norm(V.sub(V.lerp(P[i], P[j], .5), c));
    if (pr.bottom !== true && i < 4 && j < 4) n = V.norm([n[0], .8 * Math.hypot(n[0], n[2]) + .2, n[2]]);
    lineN(o, P[i], P[j], n, es);
  }
}
function litLathe(o, pr, s0) {
  const s = s0 * (pr.ds || 1), es = s0 * .6 * Math.min(2, pr.ds || 1), [U, W] = P_.perp(pr.d), st = pr.st, ax = pr.d, A = pr.a;
  if (!pr.edgeOnly) for (let i = 0; i < st.length - 1; i++) {
    const [s0_, r0] = st[i], [s1, r1] = st[i + 1], dsg = s1 - s0_, dr = r1 - r0;
    const L = Math.hypot(dsg, dr), na = Math.max(1, Math.round(L / s)), rm = Math.max(r0, r1), nt = Math.max(8, Math.round(TAU * rm / s));
    const nl = L || 1, ka = -dr / nl, kr = dsg / nl;
    for (let a = 0; a < na; a++) { const u = (a + .5) / na, sr = s0_ + dsg * u, rr = r0 + dr * u;
      const nti = Math.max(6, Math.round(nt * Math.max(.15, rr / (rm || 1))));
      for (let t = 0; t < nti; t++) { const th = (t + .5) / nti * TAU + (a & 1) * .5 / nti * TAU, cs = Math.cos(th), sn = Math.sin(th);
        const rx = U[0] * cs + W[0] * sn, ry = U[1] * cs + W[1] * sn, rz = U[2] * cs + W[2] * sn;
        o.push(A[0] + ax[0] * sr + rx * rr, A[1] + ax[1] * sr + ry * rr, A[2] + ax[2] * sr + rz * rr, rx * kr + ax[0] * ka, ry * kr + ax[1] * ka, rz * kr + ax[2] * ka); }
    }
  }
  if (!pr.noEdge) st.forEach(([sv, rv], i) => {
    if (rv < .005) return;
    const tilt = i === st.length - 1 ? .7 : i === 0 ? (pr.caps ? -.7 : .3) : 0, n = Math.max(10, Math.round(TAU * rv / es));
    for (let k = 0; k < n; k++) { const t = (k + .5) / n * TAU, cs = Math.cos(t), sn = Math.sin(t), r = [U[0] * cs + W[0] * sn, U[1] * cs + W[1] * sn, U[2] * cs + W[2] * sn], nn = V.norm(V.mad(r, ax, tilt));
      o.push(A[0] + ax[0] * sv + r[0] * rv, A[1] + ax[1] * sv + r[1] * rv, A[2] + ax[2] * sv + r[2] * rv, nn[0], nn[1], nn[2]); }
  });
  if (pr.caps && !pr.edgeOnly) for (const i of [0, st.length - 1]) {
    const [sc, rc] = st[i]; if (rc < .01) continue;
    const nr = Math.max(1, Math.round(rc / s)), c = V.mad(A, ax, sc), nn = V.mul(ax, i ? 1 : -1);
    for (let k = 0; k < nr; k++) { const rr = (k + .5) / nr * rc, nt = Math.max(5, Math.round(TAU * rr / s));
      for (let t = 0; t < nt; t++) { const th = (t + .5) / nt * TAU, cs = Math.cos(th) * rr, sn = Math.sin(th) * rr; o.push(c[0] + U[0] * cs + W[0] * sn, c[1] + U[1] * cs + W[1] * sn, c[2] + U[2] * cs + W[2] * sn, nn[0], nn[1], nn[2]); } }
  }
}
function samp(prims, s0, coarse, dsStd) {
  const o = [], std = [];
  for (const pr of prims) {
    if (coarse && pr.fine) continue;
    const s = s0 * (pr.ds || 1), i0 = o.length;
    if (pr.nb && pr.t === 'line') { const L = pr.closed ? pr.p.concat([pr.p[0]]) : pr.p; for (let i = 0; i < L.length - 1; i++) lineN(o, L[i], L[i + 1], pr.nb, s0 * .6); continue; }
    if (pr.t === 'Q') {
      const q = pr.q;
      if (!pr.eo) P_.quadL(o, q[0], q[1], q[2], q[3], pr.n, s);
      if (pr.e) for (let i = 0; i < 4; i++) P_.lineL(o, q[i], q[(i + 1) % 4], s0 * .6);
    } else if (pr.t === 'S') {
      const P = pr.closed ? pr.p.concat([pr.p[0]]) : pr.p, st = s0 * .45 * (pr.ds || 1);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], n = pr.ns ? pr.ns[i % pr.ns.length] : pr.n, m = Math.max(1, Math.round(V.dist(a, b) / st));
        for (let k = 0; k < m; k++) { const u = (k + .5) / m; o.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, n[0], n[1], n[2]); }
      }
    } else if (pr.t === 'FN') pr.fn(o, s, coarse);
    else if (pr.t === 'hex' || pr.t === 'lathe') { const q = dsStd && pr.ds === undefined ? Object.assign({}, pr, { ds: dsStd }) : pr; if (pr.t === 'hex') litHex(o, q, s0); else litLathe(o, q, s0); }
    else std.push(pr);
    if (pr.nb && pr.t !== 'line') for (let i = i0; i < o.length; i += 6) {      // normals biased toward nb: culled with the face it sits on
      const x = o[i + 3] + pr.nb[0], y = o[i + 4] + pr.nb[1], z = o[i + 5] + pr.nb[2], l = Math.hypot(x, y, z) || 1;
      o[i + 3] = x / l; o[i + 4] = y / l; o[i + 5] = z / l;
    }
  }
  if (std.length) { const L = P_.sampleLat(std, s0, coarse); for (let i = 0; i < L.length; i++) o.push(L[i]); }
  return o;
}
let NPTS = 0;
function mk(prims, L, cs, dsStd) {
  const memo = {};                                     // level 0 repeats level 1 (the ship never needs finer)
  const ml = K.lodCloud(L.map((sp, li) => { const k = sp + '/' + (li >= 3); return { sp, pts: memo[k] || (memo[k] = new Float32Array(samp(prims, sp, li >= 3, dsStd || 1.3))) }; }), cs);
  if (L[0] === L[1]) ml.lv[0] = ml.lv[1];              // same points, same cell ranges: share the array
  NPTS += ml.lv[1].length / 6;
  return ml;
}
const LBIG = [.05, .1, .2, .4, .8, 1.6], LDET = [.025, .05, .1, .2, .4, .8];
const EMPTY = { lv: [], sp: [], ch: new Float32Array(0), nch: 0, sd: 0, nl: 0, n: 0 };
/* face lattices sparser than the edges (the mount's big faces are drawn at 1.6 - 1.8) */
const DS_HULL = 1.0, DS_DECK = 1.8, DS_WALL = 1.6, DS_ROOF = 1.8;

/* transform prims (rigid) */
function tp(T, pr) {
  const q = Object.assign({}, pr), ap = p => X.ap(T, p), dr = d => X.dir(T, d);
  if (pr.t === 'hex' || pr.t === 'panel' || pr.t === 'line' || pr.t === 'S') q.p = pr.p.map(ap);
  if (pr.t === 'lathe') { q.a = ap(pr.a); q.d = dr(pr.d); }
  if (pr.t === 'blades') { q.c = ap(pr.c); q.d = dr(pr.d); }
  if (pr.t === 'Q') { q.q = pr.q.map(ap); q.n = dr(pr.n); }
  if (pr.t === 'S') { if (pr.n) q.n = dr(pr.n); if (pr.ns) q.ns = pr.ns.map(dr); }
  return q;
}
const tps = (T, L) => L.map(pr => tp(T, pr));
const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };

/* planar lattices on a global grid */
function inConv(P, x, y) {
  let sg = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < 1e-9) continue; const s = c > 0 ? 1 : -1;
    if (!sg) sg = s; else if (s !== sg) return false;
  }
  return true;
}
function flat(y, xr, zr, keep, o) {
  o = Object.assign({ ds: DS_ROOF }, o || {});
  return FN((out, s) => {
    for (let i = Math.ceil(xr[0] / s + .3); i * s <= xr[1] - .3 * s; i++) { const x = i * s;
      for (let j = Math.ceil(zr[0] / s + .3); j * s <= zr[1] - .3 * s; j++) { const z = j * s; if (keep && !keep(x, z)) continue; out.push(x, y, z, 0, 1, 0); } }
  }, o);
}
const inBox = (x, z, x0, x1, z0, z1) => x > x0 && x < x1 && z > z0 && z < z1;
/* a planar wall: bottom edge b0 -> b1, t0 above b0, t1 above b1; at(a, h, w): along, up the wall, out */
function wall(b0, b1, t0, t1, cen) {
  const A = V.norm(V.sub(b1, b0)); let N = V.norm(V.cross(A, V.sub(t0, b0)));
  if (V.dot(N, V.sub(V.lerp(b0, b1, .5), cen)) < 0) N = V.mul(N, -1);
  let U = V.norm(V.cross(N, A)); if (U[1] < 0) U = V.mul(U, -1);
  const c2 = p => { const d = V.sub(p, b0); return [V.dot(d, A), V.dot(d, U)]; };
  const poly = [[0, 0], c2(b1), c2(t1), c2(t0)];
  const W = { b0, b1, t0, t1, A, U, N, poly, L: V.dist(b0, b1), H: Math.max(poly[2][1], poly[3][1]) };
  W.at = (a, h, w) => { w = w || 0; return [b0[0] + A[0] * a + U[0] * h + N[0] * w, b0[1] + A[1] * a + U[1] * h + N[1] * w, b0[2] + A[2] * a + U[2] * h + N[2] * w]; };
  W.hy = (a, y) => (y - b0[1] - A[1] * a) / U[1];
  W.span = h => { const p1 = poly[1], p2 = poly[2], p3 = poly[3]; return [p3[0] * h / p3[1], p1[0] + (p2[0] - p1[0]) * (h - p1[1]) / (p2[1] - p1[1])]; };
  W.rect = (a0, a1, h0, h1, w) => [W.at(a0, h0, w), W.at(a1, h0, w), W.at(a1, h1, w), W.at(a0, h1, w)];
  return W;
}
function wallFn(W, holes, o) {
  o = Object.assign({ ds: DS_WALL, side: Math.abs(W.N[0]) > .95 ? Math.sign(W.N[0]) : 0 }, o || {});
  return FN((out, s) => {
    let a0 = 1e9, a1 = -1e9; for (const p of W.poly) { a0 = Math.min(a0, p[0]); a1 = Math.max(a1, p[0]); }
    const N = W.N;
    for (let j = 1; j * s < W.H; j++) { const h = j * s;
      for (let i = Math.ceil(a0 / s); i * s <= a1; i++) { const a = i * s;
        if (!inConv(W.poly, a, h)) continue;
        if (holes && holes.some(f => f(a, h))) continue;
        const p = W.at(a, h, 0); out.push(p[0], p[1], p[2], N[0], N[1], N[2]);
      }
    }
  }, o);
}
const rh = r => (a, h) => a > r[0] && a < r[1] && h > r[2] && h < r[3];
/* a window / panel opening: the hole, its outline proud of the wall, a recessed inner frame */
function opening(W, r, P, o) {
  o = o || {};
  P.push(SL(W.rect(r[0], r[1], r[2], r[3], .03), W.N, { closed: true }));
  if (!o.noFrame) P.push(SL(W.rect(r[0] + .05, r[1] - .05, r[2] + .05, r[3] - .05, -.04), W.N, F({ closed: true })));
  if (o.mull) for (let k = 1; k < o.mull; k++) { const a = r[0] + (r[1] - r[0]) * k / o.mull; P.push(SL([W.at(a, r[2], -.03), W.at(a, r[3], -.03)], W.N, F())); }
  return rh(r);
}
/* a watertight door: rounded leaf on a coaming, its frame, the dogs and hinges */
function door(W, ac, h0, P, o) {
  o = o || {};
  const w = o.w || .72, hh = o.h || 1.68, r = .13, dg = o.hand || 1;
  const ol = m => { const a0 = ac - w / 2 - m, a1 = ac + w / 2 + m, b0 = h0 - m, b1 = h0 + hh + m;
    return [W.at(a0 + r, b0, .025), W.at(a1 - r, b0, .025), W.at(a1, b0 + r, .025), W.at(a1, b1 - r, .025), W.at(a1 - r, b1, .025), W.at(a0 + r, b1, .025), W.at(a0, b1 - r, .025), W.at(a0, b0 + r, .025)]; };
  P.push(SL(ol(0), W.N, { closed: true }));
  P.push(SL(ol(.075), W.N, F({ closed: true })));
  for (const f of [.2, .5, .8]) { const h = h0 + hh * f, a = ac + dg * (w / 2 - .03); P.push(SL([W.at(a, h, .04), W.at(a - dg * .13, h, .04)], W.N, F())); }
  for (const f of [.18, .82]) { const h = h0 + hh * f, a = ac - dg * (w / 2 + .02); P.push(SL([W.at(a, h - .08, .04), W.at(a, h + .08, .04)], W.N, F())); }
}
/* a louvre bank: frame (hairline), slats (surface lines), the wall lattice left out under it */
function louvre(W, r, P, pitch, o) {
  P.push(SL(W.rect(r[0], r[1], r[2], r[3], .04), W.N, { closed: true, ds: 1.33 }));
  for (let h = r[2] + pitch; h < r[3] - pitch * .4; h += pitch) P.push(SL([W.at(r[0] + .04, h, .03), W.at(r[1] - .04, h, .03)], V.norm(V.add(W.N, V.mul(W.U, .6))), o));
  return rh(r);
}
/* block edges as lit lines: each carries the outward normal of its corner (bottom edges look up off the deck),
   so the far side's edges are culled with its faces instead of showing through the ship */
function edges(C, E, P, cen, o) {
  if (!cen) { cen = [0, 0, 0]; for (const p of C) { cen[0] += p[0] / C.length; cen[1] += p[1] / C.length; cen[2] += p[2] / C.length; } }
  let y0 = 1e9; for (const p of C) y0 = Math.min(y0, p[1]);
  for (const [i, j] of E) {
    const a = C[i], b = C[j], m = V.lerp(a, b, .5); let n = V.norm(V.sub(m, cen));
    if (a[1] < y0 + .02 && b[1] < y0 + .02) n = V.norm([n[0], .8 * Math.hypot(n[0], n[2]) + .2, n[2]]);
    P.push(SL([a, b], n, Object.assign({ ds: 1.33 }, o || {})));
  }
}
/* lifelines: stanchions every ~st along a polyline at the given heights */
function rail(path, hs, st, P, o) {
  const pts = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], n = Math.max(1, Math.round(V.dist(a, b) / st));
    for (let k = 0; k < n; k++) pts.push(V.lerp(a, b, k / n));
  }
  pts.push(path[path.length - 1]);
  const top = hs[hs.length - 1];
  for (const h of hs) P.push(LN(pts.map(p => [p[0], p[1] + h, p[2]]), o));
  for (const p of pts) P.push(LN([p, [p[0], p[1] + top, p[2]]], o));
}

/* ================= hull: skin, transom, deck ================= */
const DHOLES = [[1.5, 35.5, 8.25], [-23.5, 1.5, 6.25], [-53, -34, 8.6], [VF_Z - 1.72, VF_Z + 1.72, 4.25], [VA_Z - 3.42, VA_Z + 3.42, 4.25]];
function hullSkin(sg) {
  return [FN((o, s) => {
    const e = .05;
    for (let i = Math.ceil(ZS / s + .2); i * s < ZB - .05; i++) {
      const z = i * s; if (z > CUT[0] && z < CUT[1]) continue;
      const S0 = sec(z), Sm = sec(z - e), Sp = sec(z + e), y0 = Math.max(0, S0.w[1]), yd = S0.d[1];
      for (let j = Math.max(1, Math.ceil((y0 + .35 * s) / s)); j * s < yd - .3 * s; j++) {
        const y = j * s, x = hxS(S0, y), ya = Math.max(y0, y - e), yb = Math.min(yd, y + e);
        const fy = (hxS(S0, yb) - hxS(S0, ya)) / (yb - ya), fz = (hxS(Sp, y) - hxS(Sm, y)) / (2 * e), l = Math.hypot(1, fy, fz);
        o.push(sg * x, y, z, sg / l, -fy / l, -fz / l);
      }
    }
    const St = sec(ZS);                                                      // the transom
    for (let j = 1; j * s < St.d[1] - .3 * s; j++) { const y = j * s, xm = hxS(St, y) - .3 * s; for (let k = sg > 0 ? 0 : Math.ceil(-xm / s); k * s <= (sg > 0 ? xm : -s * .5); k++) o.push(k * s, y, ZS, 0, .1, -.995); }
  }, { ds: DS_HULL })];
}
function deckSkin() {
  return [FN((o, s) => {
    for (let i = Math.ceil(ZS / s + .3); i * s < ZB - .1; i++) {
      const z = i * s; if (z > CUT[0] && z < CUT[1]) continue;
      const b = hB(z) - .3 * s; if (b <= 0) continue;
      const y = hD(z) + .01, dy = (hD(z + .1) - hD(z - .1)) / .2, l = Math.hypot(1, dy);
      for (let k = Math.ceil(-b / s); k * s <= b; k++) {
        const x = k * s; let h = false;
        for (const H of DHOLES) if (z > H[0] && z < H[1] && Math.abs(x) < H[2]) { h = true; break; }
        if (!h) o.push(x, y, z, 0, 1 / l, -dy / l);
      }
    }
  }, { ds: DS_DECK })];
}
/* hull lines: deck edge, knuckle, boot-topping, strakes and butts, stem, transom; the bow bulwark */
const HZ = []; for (let z = ZS; z < ZB - 1e-6; z += z < 40 ? 1.2 : z < 64 ? .6 : .2) HZ.push(z); HZ.push(ZB);
/* lines on one side's plating: knuckle, boot-topping, strakes, sheer strake, butts */
function hullLines(sg) {
  const P = [], Z = HZ;
  {
    const kn = Z.map(z => { const s = sec(z); return [sg * s.k[0], s.k[1], z]; }), ia = Z.findIndex(z => z >= 4);
    P.push(SL(kn.slice(ia), null, { ns: Z.slice(ia).map(z => hullN(z, sec(z).k[1], sg)), ds: 1.33 }));
    P.push(SL(kn.slice(0, ia + 1), null, { ns: Z.slice(0, ia + 1).map(z => hullN(z, sec(z).k[1] - .05, sg)) }));
    const zb = Z.filter(z => sec(z).w[1] < .9);
    P.push(SL(zb.map(z => onHull(z, 1.0, sg, .01)), null, { ns: zb.map(z => hullN(z, 1.0, sg)) }));    // boot-topping
    P.push(SL(zb.map(z => onHull(z, .55, sg, .01)), null, { ns: zb.map(z => hullN(z, .55, sg)), ds: 1.6, fine: true }));
    for (const y of [2.5, 4.1]) {                                                                             // strakes
      const zs = Z.filter(z => { const s = sec(z); return s.w[1] < y - .3 && y < s.k[1] - .3; });
      if (zs.length > 1) P.push(SL(zs.map(z => onHull(z, y, sg, .01)), null, { ns: zs.map(z => hullN(z, y, sg)), fine: true }));
    }
    const zh = Z.filter(z => z < 74);
    P.push(SL(zh.map(z => onHull(z, hD(z) - .8, sg, .01)), null, { ns: zh.map(z => hullN(z, hD(z) - .8, sg)), fine: true }));   // sheer strake
    for (let z = -72; z < 72; z += 7.2) {                                                                     // butts
      if (z > CUT[0] - 1 && z < CUT[1] + 1) continue;
      const s = sec(z), ys = [Math.max(.3, s.w[1] + .2), (Math.max(.3, s.w[1]) + s.k[1]) / 2, s.k[1], s.d[1] - .1];
      P.push(SL(ys.map(y => onHull(z, y, sg, .01)), null, { ns: ys.map(y => hullN(z, y, sg)), fine: true }));
    }
  }
  return P;
}
/* the stem and the transom's outline (both sides) */
function hullEnds() {
  const P = [], Z = HZ;
  for (const sg of [-1, 1]) {                                                    // the deck edge, the waterway bar on deck
    P.push(SL(Z.map(z => [sg * hB(z), hD(z), z]), null, { ns: Z.map(z => V.norm(V.add(hullN(z, hD(z) - .1, sg), [0, 1, 0]))), ds: 1.33 }));
    P.push(SL(Z.filter(z => hB(z) > .4).map(z => [sg * (hB(z) - .16), hD(z) + .012, z]), [0, 1, 0], F()));
  }
  const stem = []; for (let k = 0; k <= 24; k++) { const z = ZST + (ZB - ZST) * k / 24; stem.push([0, hK0(z), z]); }
  P.push(SL(stem, V.norm([0, .25, 1]), { ds: 1.33 }));
  const St = sec(ZS);
  for (const sg of [-1, 1]) P.push(SL([[sg * hxS(St, .3), .3, ZS], [sg * St.k[0], St.k[1], ZS], [sg * St.d[0], St.d[1], ZS]], V.norm([sg, 0, -1]), { ds: 1.33 }));
  P.push(SL([[-St.d[0], St.d[1], ZS], [St.d[0], St.d[1], ZS]], V.norm([0, 1, -1]), { ds: 1.33 }));
  P.push(SL([[-hxS(St, 1), 1, ZS - .01], [hxS(St, 1), 1, ZS - .01]], [0, .1, -.995]));
  return P;
}
/* the bow bulwark: its outer face and the Panama chock go with the side's plating, the inner face, rail and
   stiffeners are seen across the deck */
function bulwark(sg, inner) {
  const P = [], hb = z => 1.05 * ss(66.2, 69.6, z), Z = [];
  for (let z = 66.2; z < ZB - .01; z += .35) Z.push(z); Z.push(ZB);
  const top = (z, w) => { const s = sec(z), y = s.d[1] + hb(z); return V.mad([sg * hxS(s, y), y, z], hullN(z, s.d[1] - .2, sg), w || 0); };
  const bot = (z, w) => V.mad([sg * hB(z), hD(z), z], hullN(z, hD(z) - .2, sg), w || 0);
  for (let i = 0; i < Z.length - 1; i++) {
    const z0 = Z[i], z1 = Z[i + 1], n = hullN((z0 + z1) / 2, hD((z0 + z1) / 2) - .2, sg);
    if (!inner) P.push(Q(bot(z0), bot(z1), top(z1), top(z0), { n }));
    else P.push(Q(bot(z0, -.06), bot(z1, -.06), top(z1, -.06), top(z0, -.06), { n: V.mul(n, -1), ds: 1.3 }));
  }
  if (inner) {
    P.push(LN(Z.map(z => top(z))), LN(Z.filter(z => z > 67).map(z => top(z, -.06))));
    for (let z = 67.6; z < ZB - .8; z += .7) P.push(SL([bot(z, -.07), top(z, -.07)], V.mul(hullN(z, hD(z), sg), -1), F()));   // stiffeners
    return P;
  }
  const zc = 73.4, s = sec(zc), yc = s.d[1] + .5, n = hullN(zc, s.d[1] - .2, sg), c = V.mad([sg * hxS(s, yc), yc, zc], n, .02), ov = [];
  for (let k = 0; k < 16; k++) { const t = k / 16 * TAU; ov.push(V.add(c, [0, Math.sin(t) * .17, Math.cos(t) * .3])); }
  P.push(SL(ov, n, { closed: true }));                                                    // Panama chock
  return P;
}

/* ================= forecastle: hawse pipes and anchors, windlasses, chain, bitts, chocks, staffs ================= */
function hawse(sg) {
  const P = [], zh = 66.5, yh = hD(zh) - 1.25, n = hullN(zh, yh, sg), c = [sg * hx(zh, yh), yh, zh];
  const ez = V.norm(V.sub([0, 0, 1], V.mul(n, n[2]))); let ed = V.norm(V.cross(n, ez)); if (ed[1] > 0) ed = V.mul(ed, -1);
  const at = (u, v, w) => V.add(c, V.add(V.mul(ez, u), V.add(V.mul(ed, v), V.mul(n, w))));
  const circle = (r, w, cv) => { const p = []; for (let k = 0; k < 20; k++) { const t = k / 20 * TAU; p.push(at(Math.cos(t) * r, (cv || 0) + Math.sin(t) * r, w)); } return p; };
  P.push(SL(circle(.42, .04), n, { closed: true, ds: 1.33 }), SL(circle(.52, .02), n, { closed: true }), SL(circle(.33, -.05), n, F({ closed: true })));
  // a stockless anchor housed in the pipe: shank up into it, crown and flukes against the hull in a recess
  P.push(P_.bar(at(0, -.05, .1), at(0, 1.5, .12), .2, .16, n));
  P.push(P_.bar(at(-.5, 1.62, .14), at(.5, 1.62, .14), .26, .22, n));
  for (const s of [-1, 1]) {
    const q = [[s * .14, 1.74], [s * .62, 1.74], [s * .7, .92], [s * .34, 1.28]];
    const H = q.map(([u, v]) => at(u, v, .06)).concat(q.map(([u, v]) => at(u, v, .22)));
    P.push(G.hex(H));
    P.push(SL([at(s * .7, .92, .24), at(s * .76, .78, .26)], n, F()));
  }
  P.push(G.cyl(at(0, -.02, .12), at(0, -.02, .32), .09, F()));
  P.push(SL([at(-.92, -.65, .015), at(.92, -.65, .015), at(.92, 2.0, .015), at(-.92, 2.0, .015)], n, F({ closed: true })));
  // the deck end: pipe collar and cover flange
  const dz = 67.3, dx = sg * 2.05, dy = hD(dz);
  P.push(G.lathe([dx, dy, dz], [0, 1, 0], [[0, .34], [.16, .34], [.16, .42], [.2, .42]], {}));
  const nb = V.mul(n, 2.2);
  return { P: P.map((pr, i) => i < P.length - 1 ? Object.assign({}, pr, { nb }) : pr), deck: [dx, dy + .2, dz] };
}
function chain(a, b, P) {
  const d = V.norm(V.sub(b, a)), L = V.dist(a, b), side = V.norm(V.cross(d, [0, 1, 0])), up = V.cross(side, d), n = Math.max(1, Math.round(L / .27));
  for (let k = 0; k < n; k++) {
    const c = V.lerp(a, b, (k + .5) / n), e = k & 1 ? side : up, ov = [];
    for (let i = 0; i < 10; i++) { const t = i / 10 * TAU; ov.push(V.add(c, V.add(V.mul(d, Math.cos(t) * .2), V.mul(e, Math.sin(t) * .1)))); }
    P.push(LN(ov, F({ closed: true })));
  }
}
function bitts(x, z, P) {
  const y = hD(z);
  P.push(G.box([x - .23, y, z - .62], [x + .23, y + .06, z + .62]));
  for (const dz of [-.34, .34]) P.push(G.lathe([x, y + .06, z + dz], [0, 1, 0], [[0, .13], [.42, .13], [.42, .19], [.48, .19], [.5, 0]], {}));
}
/* closed chock at the deck edge: a cast body with an oval eye through it, athwartships */
function chock(sg, z, P) {
  const y = hD(z), x = sg * (hB(z) - .22), lo = Math.min(x - .09, x + .09), hi = Math.max(x - .09, x + .09);
  P.push(G.box([lo, y, z - .36], [hi, y + .46, z + .36]));
  for (const dx of [-.095, .095]) { const ov = []; for (let k = 0; k < 14; k++) { const t = k / 14 * TAU; ov.push([x + dx, y + .25 + Math.sin(t) * .1, z + Math.cos(t) * .2]); } P.push(SL(ov, [Math.sign(dx), 0, 0], { closed: true })); }
}
function forecastle() {
  const P = [];
  for (const sg of [-1, 1]) {
    const H = hawse(sg); P.push(...H.P);
    // vertical-shaft windlass: base, wildcat with whelps, brake band, cap; the stopper and the chain to the pipe
    const c = [sg * 1.4, hD(68.5), 68.5];
    P.push(G.lathe(c, [0, 1, 0], [[0, .58], [.07, .58], [.07, .38], [.16, .36], [.2, .46], [.4, .46], [.44, .36], [.56, .36], [.6, .26], [.68, .1], [.7, 0]], {}));
    for (let k = 0; k < 8; k++) P.push(P_.boxY([c[0] + Math.sin(k / 8 * TAU) * .45, c[1] + .3, c[2] + Math.cos(k / 8 * TAU) * .45], [.035, .09, .07], k / 8 * TAU, F()));
    const w = [c[0] + (H.deck[0] - c[0]) * .42, c[1] + .38, c[2] + (H.deck[2] - c[2]) * .42];
    const st0 = V.lerp(H.deck, w, .3), st1 = V.lerp(H.deck, w, .8);
    P.push(P_.bar([st0[0], hD(st0[2]), st0[2]], [st1[0], hD(st1[2]), st1[2]], .34, .3, [0, 1, 0]));
    P.push(G.box([st0[0] - .05, hD(st0[2]) + .3, st0[2] - .05], [st0[0] + .05, hD(st0[2]) + .52, st0[2] + .05], F()));
    chain(H.deck, w, P);
    chain([c[0] - sg * .3, c[1] + .38, c[2] - .35], [c[0] - sg * .5, hD(68.0) + .05, 68.0], P);
    P.push(G.lathe([c[0] - sg * .55, hD(67.9), 67.9], [0, 1, 0], [[0, .24], [.1, .24]], F()));     // spurling pipe
    chock(sg, 62.4, P); chock(sg, 58.6, P);
  }
  // windlass room hatch box, jackstaff, ensign staff
  const yh = hD(71.5);
  P.push(G.box([-.9, yh, 70.8], [.9, yh + .6, 72.2]));
  P.push(SL([[-.75, yh + .61, 70.95], [.75, yh + .61, 70.95], [.75, yh + .61, 72.05], [-.75, yh + .61, 72.05]], [0, 1, 0], { closed: true }));
  for (const x of [-.5, .5]) P.push(G.cyl([x, yh + .6, 70.85], [x, yh + .6, 71.05], .04, F()));
  P.push(G.cyl([0, hD(76.6), 76.6], [0, hD(76.6) + 3.9, 76.55], .045, {}), G.lathe([0, hD(76.6) + 3.9, 76.55], [0, 1, 0], [[0, .07], [.1, .09], [.18, 0]], F()));
  P.push(G.box([-.12, hD(76.6), 76.48], [.12, hD(76.6) + .25, 76.72], F()));
  P.push(G.cyl([0, hD(ZS + .4), ZS + .4], [0, hD(ZS + .4) + 4.2, ZS + .5], .045, {}), G.lathe([0, hD(ZS + .4) + 4.2, ZS + .5], [0, 1, 0], [[0, .07], [.1, .09], [.18, 0]], F()));
  // bitts and chocks along the side decks
  for (const sg of [-1, 1]) {
    for (const z of [60.2, 37.0]) { bitts(sg * (hB(z) - .9), z, P); }
    for (const [z, dx] of [[18, .75], [-4, .8], [-25.0, .85], [-49.0, .7]]) bitts(sg * (hB(z) - dx), z, P);
    for (const z of [36.2, 19.2, -2.8, -26.2, -50.2]) chock(sg, z, P);
  }
  return P;
}
function lifelines() {
  const P = [];
  for (const sg of [-1, 1]) {
    const Z = []; for (let z = -53.0; z < 68.6; z += 4) Z.push(z); Z.push(68.6);
    rail(Z.map(z => [sg * (hB(z) - .1), hD(z), z]), [.33, .66, 1.0], 1.9, P);
  }
  // the exposed 01-level roofs, the hangar roof, the SPY house roof
  rail([[-7.95, D01, 31.2], [-7.95, D01, 34.8], [7.95, D01, 34.8], [7.95, D01, 31.2]], [.5, 1.0], 1.9, P, F());
  for (const sg of [-1, 1]) rail([[sg * 7.95, D01, 1.9], [sg * 7.95, D01, 11.6]], [.5, 1.0], 1.9, P, F());
  rail([[-5.9, D01, 1.4], [-5.9, D01, -23.1], [5.9, D01, -23.1], [5.9, D01, 1.4]], [.5, 1.0], 1.9, P, F());
  rail([[-8.15, 13.2, -34.4], [-8.15, 13.2, -52.7], [8.15, 13.2, -52.7], [8.15, 13.2, -34.4], [-8.15, 13.2, -34.4]], [.5, 1.0], 1.9, P, F());
  const top = insetPoly(SPY_HOUSE, SIN + .12).map(p => [p[0], SY1, p[1]]);
  rail(top.concat([top[0]]), [.5, 1.0], 1.9, P, F());
  return P;
}

/* ================= superstructure ================= */
const sbP = (xb, zb0, zb1, ya, yf, xt, zt0, zt1, y1) => [[-xb, ya, zb0], [xb, ya, zb0], [xb, yf, zb1], [-xb, yf, zb1], [-xt, y1, zt0], [xt, y1, zt0], [xt, y1, zt1], [-xt, y1, zt1]];
const H1 = sbP(8.25, 1.5, 35.5, hD(1.5) - .05, hD(35.5) - .05, 8.05, 1.8, 34.9, D01);
const H2 = sbP(6.25, -23.5, 1.5, hD(-23.5) - .05, hD(1.5) - .05, 6.0, -23.2, 1.5, D01);
const H3 = sbP(8.6, -53, -34, hD(-53) - .05, hD(-34) - .05, 8.25, -52.8, -34.3, 13.2);
const SPY_TOP = insetPoly(SPY_HOUSE, SIN);
const HBp = SPY_HOUSE.map(p => [p[0], SY0, p[1]]), HTp = SPY_TOP.map(p => [p[0], SY1, p[1]]);
const SPY_CEN = [0, 15, 19.5];
const SPYF = [[1, 2], [7, 0], [3, 4], [5, 6]].map(([a, b], k) => {
  const mb = V.lerp(HBp[a], HBp[b], .5), mt = V.lerp(HTp[a], HTp[b], .5);
  return { a, b, c: DA.spy[k], n: DA.spyN[k], h: V.norm(V.sub(HBp[b], HBp[a])), u: V.norm(V.sub(mt, mb)) };
});
const STK = zc => ({ b: [[-2.6, D01, zc - 4.2], [2.6, D01, zc - 4.2], [2.6, D01, zc + 4.2], [-2.6, D01, zc + 4.2]], t: [[-2.05, 21.6, zc - 4.5], [2.05, 21.6, zc - 4.5], [2.05, 21.6, zc + 2.2], [-2.05, 21.6, zc + 2.2]] });
const BX = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

function houses() {
  const P = [], D = [];          // P: faces + edges (big), D: details
  const cen1 = [0, 8, 18.5], cen2 = [0, 8, -11], cen3 = [0, 9, -43.5];
  // forward 01 deckhouse
  const W1 = { s: wall(H1[1], H1[2], H1[5], H1[6], cen1), p: wall(H1[3], H1[0], H1[7], H1[4], cen1), f: wall(H1[3], H1[2], H1[7], H1[6], cen1) };
  const holes1 = { s: [], p: [], f: [] };
  for (const sg of [-1, 1]) {
    const W = sg > 0 ? W1.s : W1.p, k = sg > 0 ? 's' : 'p', az = z => sg > 0 ? z - 1.5 : 35.5 - z;      // along the wall from its b0
    for (const z of [6.5, 14.5, 22.4, 29.6]) door(W, az(z), W.hy(az(z), hD(z) + .3), D, { hand: sg });
    for (const [z0, z1] of [[9.6, 12.4], [25.0, 27.6]]) holes1[k].push(louvre(W, [az(sg > 0 ? z0 : z1), az(sg > 0 ? z1 : z0), 1.7, 2.9], D, .14, F()));
    D.push(SL([W.at(0, W.hy(0, 8.9), .01), W.at(W.L, W.hy(W.L, 8.9), .01)], W.N, F()));        // a plating seam
  }
  for (const x of [-5.6, 5.6]) door(W1.f, x + 8.25, .3, D, { hand: x > 0 ? 1 : -1 });
  P.push(wallFn(W1.s, holes1.s), wallFn(W1.p, holes1.p), wallFn(W1.f));
  for (const sg of [-1, 1]) { const W = wall([sg * 6.25, H1[0][1], 1.5], [sg * 8.25, H1[0][1], 1.5], [sg * 6.0, D01, 1.8], [sg * 8.05, D01, 1.8], cen1); P.push(wallFn(W)); P.push(SL([[sg * 6.25, H1[0][1], 1.5], [sg * 8.25, H1[0][1], 1.5]], V.norm([0, .8, -.6]), { ds: 1.33 }), SL([[sg * 6.0, D01, 1.8], [sg * 8.05, D01, 1.8]], V.norm([0, .7, -.7]), { ds: 1.33 })); }
  edges(H1, [[1, 2], [2, 3], [3, 0], [1, 5], [2, 6], [3, 7], [0, 4], [5, 6], [6, 7], [7, 4]], P);
  P.push(flat(D01, [-8.05, 8.05], [1.8, 34.9], (x, z) => !inConv(SPY_HOUSE, x, z) && !inBox(x, z, -2.65, 2.65, -2.1, 6.45) && !inBox(x, z, -1.75, 1.75, 31.35, 34.55)));
  // mid deckhouse
  const W2 = { s: wall(H2[1], H2[2], H2[5], H2[6], cen2), p: wall(H2[3], H2[0], H2[7], H2[4], cen2), a: wall(H2[0], H2[1], H2[4], H2[5], cen2) };
  const holes2 = { s: [], p: [] };
  for (const sg of [-1, 1]) {
    const W = sg > 0 ? W2.s : W2.p, k = sg > 0 ? 's' : 'p', az = z => sg > 0 ? z + 23.5 : 1.5 - z;
    for (const z of [-3.0, -9.5, -19.0]) door(W, az(z), W.hy(az(z), hD(z) + .3), D, { hand: sg });
    for (const [z0, z1] of [[-16.4, -12.2], [-7.6, -5.2]]) holes2[k].push(louvre(W, [az(sg > 0 ? z0 : z1), az(sg > 0 ? z1 : z0), 1.5, 3.0], D, .14, F()));
  }
  door(W2.a, 6.25 - 3.2, .3, D); door(W2.a, 6.25 + 3.2, .3, D, { hand: -1 });
  P.push(wallFn(W2.s, holes2.s), wallFn(W2.p, holes2.p), wallFn(W2.a));
  edges(H2, [[0, 1], [1, 2], [3, 0], [0, 4], [1, 5], [2, 6], [3, 7], [4, 5], [5, 6], [7, 4]], P);
  P.push(flat(D01, [-6.0, 6.0], [-23.2, 1.8], (x, z) => !inBox(x, z, -2.65, 2.65, -2.1, 6.45) && !inBox(x, z, -2.65, 2.65, -21.3, -12.75)));
  // hangar block
  const W3 = { s: wall(H3[1], H3[2], H3[5], H3[6], cen3), p: wall(H3[3], H3[0], H3[7], H3[4], cen3), a: wall(H3[0], H3[1], H3[4], H3[5], cen3), f: wall(H3[3], H3[2], H3[7], H3[6], cen3) };
  for (const sg of [-1, 1]) {
    const W = sg > 0 ? W3.s : W3.p, az = z => sg > 0 ? z + 53 : -34 - z;
    for (const z of [-36.6, -44.5]) door(W, az(z), W.hy(az(z), hD(z) + .3), D, { hand: sg });
    D.push(SL([W.at(0, 3.6, .01), W.at(W.L, 3.6, .01)], W.N, F()));
  }
  for (const x of [-4.8, 4.8]) door(W3.f, x + 8.6, .3, D, { hand: x > 0 ? 1 : -1 });
  P.push(wallFn(W3.s), wallFn(W3.p), wallFn(W3.a), wallFn(W3.f));
  edges(H3, BX, P);
  P.push(flat(13.2, [-8.25, 8.25], [-52.8, -34.3], (x, z) => !inBox(x, z, -3.45, 3.45, -40.25, -34.55) && !inBox(x, z, -1.75, 1.75, -49.35, -45.65)));
  // the SPY house: eight sloped walls; arrays (separate cloud) and bridge windows cut out of the lattice
  const c225 = Math.cos(PI / 8), apx = SPY_R * c225 * 1.03;
  const SW = []; for (let i = 0; i < 8; i++) SW.push(wall(HBp[i], HBp[(i + 1) % 8], HTp[i], HTp[(i + 1) % 8], SPY_CEN));
  const holes = SW.map(() => []);
  SPYF.forEach(f => {
    const W = SW[f.a], c0 = V.mad(f.c, f.n, -.1), d = V.sub(c0, W.b0), ac = V.dot(d, W.A), hc = V.dot(d, W.U);
    holes[f.a].push((a, h) => { const x = Math.abs(a - ac), y = Math.abs(h - hc); return x < apx && y < apx && x + y < apx * Math.SQRT2; });
  });
  const WY = [17.78, 18.96];
  const winRow = (i, u0, u1, n) => {
    const W = SW[i], h0 = W.hy(0, WY[0]), h1 = W.hy(0, WY[1]), [aL, aR] = W.span(h1), A0 = aL + (aR - aL) * u0, A1 = aL + (aR - aL) * u1, g = .06;
    for (let k = 0; k < n; k++) holes[i].push(opening(W, [A0 + (A1 - A0) * k / n + g, A0 + (A1 - A0) * (k + 1) / n - g, h0, h1], D));
  };
  winRow(0, .02, .98, 6); winRow(1, .08, .92, 3); winRow(7, .08, .92, 3);
  // side walls by the wings: two windows and the door out to the wing
  for (const [i, sg] of [[2, 1], [6, -1]]) {
    const W = SW[i], az = z => sg > 0 ? 26.9 - z : z - 12.2, h0 = W.hy(0, WY[0]), h1 = W.hy(0, WY[1]);
    { const a0 = Math.min(az(26.2), az(25.4)), a1 = Math.max(az(26.2), az(25.4)); holes[i].push(opening(W, [a0, a1, h0, h1], D)); }
    door(W, az(24.7), W.hy(az(24.7), 17.38), D, { h: 1.62, hand: sg });
  }
  door(SW[4], SW[4].L / 2, .3, D);
  SW.forEach((W, i) => P.push(wallFn(W, holes[i])));
  edges([...HBp, ...HTp], [0, 1, 2, 3, 4, 5, 6, 7].flatMap(i => [[i, (i + 1) % 8], [i + 8, (i + 1) % 8 + 8], [i, i + 8]]), P, SPY_CEN);
  for (const i of [0, 2, 4, 6]) for (const y of [13.0, 15.9]) { const W = SW[i], h = W.hy(0, y), [aL, aR] = W.span(h); D.push(SL([W.at(aL + .02, h, .01), W.at(aR - .02, h, .01)], W.N, F())); }
  P.push(flat(SY1, [-8, 8], [8, 31], (x, z) => inConv(SPY_TOP, x, z) && !inBox(x, z, -2.35, 2.35, 16.75, 23.65)));
  // the mast house on the roof, the forward CIWS platform, the aft SPG-62 house and CIWS platform, 01-level lockers
  P.push(G.box([-2.3, 19.4, 16.8], [2.3, 20.6, 23.6]));
  P.push(G.box([-1.7, D01, 31.4], [1.7, 11.0, 34.5]));
  P.push(G.box([-3.4, 13.2, -40.2], [3.4, 15.3, -34.6]));
  P.push(G.box([-1.7, 13.2, -49.3], [1.7, 13.9, -45.7]));
  for (const sg of [-1, 1]) {
    P.push(G.box([sg > 0 ? 7.4 : -8.4, D01, 3.2], [sg > 0 ? 8.4 : -7.4, 12.2, 5.6]));
    const xo = sg * 8.42; for (const z of [3.8, 5.0]) D.push(SL([[xo, D01 + .2, z - .45], [xo, D01 + .2, z + .45], [xo, 11.95, z + .45], [xo, 11.95, z - .45]], [sg, 0, 0], F({ closed: true })));
  }
  return { P, D };
}
/* bridge wings, SEWIP, SPG-62s, satcom, EO sight, whips */
function spg62(base, dir, P) {
  P.push(G.lathe(base, [0, 1, 0], [[0, .46], [.12, .46], [.12, .42], [1.1, .42]], {}));
  const c = V.add(base, [0, 1.75, 0]), d = V.norm(dir);
  P.push(G.lathe(V.mad(c, d, -.25), d, [[0, .1], [.12, .6], [.3, .98], [.48, 1.2]], {}));
  P.push(G.lathe(V.mad(c, d, -.62), d, [[0, .3], [.37, .3]], F({ caps: true })));
  P.push(G.cyl(V.mad(c, d, -.25), V.mad(c, d, .9), .05, F()), G.box(V.sub(V.mad(c, d, .9), [.08, .08, .08]), V.add(V.mad(c, d, .9), [.08, .08, .08]), F()));
  P.push(G.box(V.add(base, [-.55, 1.1, -.4]), V.add(base, [.55, 1.45, .4])));
  const sd = V.norm(V.cross(d, [0, 1, 0]));
  for (const s of [-1, 1]) P.push(P_.bar(V.add(V.mad(base, sd, s * .5), [0, 1.42, 0]), V.mad(V.mad(c, sd, s * .55), d, -.4), .1, .1, d, F()));
}
function superDetail() {
  const P = [];
  for (const sg of [-1, 1]) {
    // bridge wing: deck, bulwark, braces, pelorus and a signal light
    const xi = sg * 6.9, xo = sg * 9.8, lo = Math.min(xi, xo), hi = Math.max(xi, xo);
    P.push(G.box([lo, 17.2, 24.0], [hi, 17.36, 26.6], { bottom: true }));
    P.push(G.box([sg > 0 ? 9.74 : -9.8, 17.36, 24.0], [sg > 0 ? 9.8 : -9.74, 18.45, 26.6]));
    for (const z of [24.0, 26.54]) P.push(G.box([sg > 0 ? 7.0 : -9.8, 17.36, z], [sg > 0 ? 9.8 : -7.0, 18.45, z + .06]));
    for (const z of [24.3, 26.3]) P.push(LN([[sg * 7.25, 15.4, z], [sg * 9.55, 17.2, z]]));
    P.push(G.cyl([sg * 9.25, 17.36, 25.8], [sg * 9.25, 18.3, 25.8], .06, F()), G.lathe([sg * 9.25, 18.3, 25.8], [0, 1, 0], [[0, .16], [.12, .16], [.14, 0]], F()));
    P.push(G.cyl([sg * 9.4, 18.45, 24.6], [sg * 9.4, 18.75, 24.6], .05, F()), G.lathe([sg * 9.4, 18.95, 24.45], [0, 0, 1], [[0, .17], [.42, .19], [.44, .12]], F({ caps: true })));
    // SEWIP Block II arrays on the house sides
    const ex = sg * 8.45, et = sg * 8.2, ei = sg * 7.35;
    P.push(G.hex([[ei, 11.6, 16.4], [ex, 11.6, 16.4], [ex, 11.6, 21.2], [ei, 11.6, 21.2], [ei, 13.9, 16.4], [et, 13.9, 16.4], [et, 13.9, 21.2], [ei, 13.9, 21.2]], { bottom: true }));
    const on = V.norm([sg * 2.3, .25, 0]);
    for (const z of [17.6, 18.8, 20.0]) P.push(SL([[ex + sg * .003, 11.7, z], [et + sg * .003, 13.8, z]], on, F()));
    P.push(SL([[sg * 8.34, 12.75, 16.5], [sg * 8.34, 12.75, 21.1]], on, F()));
    // whips on the 01 level
    for (const [x, z, h] of [[5.95, -4.5, 7], [5.95, -15.5, 6], [7.9, 3.0, 5.5]]) { P.push(LN([[sg * x, D01, z], [sg * (x + .6), D01 + h, z]])); P.push(G.cyl([sg * x, D01, z], [sg * x, D01 + .5, z], .08, F())); }
    for (const s2 of [1]) P.push(LN([[sg * 2.0, 20.6, 17.2], [sg * 2.3, 27.5, 16.4]], { w: s2 }));
    // satcom radomes on the hangar
    P.push(G.cyl([sg * 6.4, 13.2, -37.6], [sg * 6.4, 13.9, -37.6], .28, {}));
    P.push(G.lathe([sg * 6.4, 13.9, -37.6], [0, 1, 0], [[0, .95], [.35, .9], [.65, .7], [.88, .38], [.98, 0]], {}));
    spg62([sg * 1.8, 15.3, -37.4], [sg * .707, 0, -.707], P);
  }
  spg62([0, 19.4, 27.2], [0, 0, 1], P);
  P.push(G.cyl([0, 19.4, 25.2], [0, 20.2, 25.2], .14, F()), G.lathe([0, 20.2, 25.2], [0, 1, 0], [[0, .3], [.25, .32], [.5, .2], [.56, 0]], F()));
  return P;
}

/* ================= SPY-1D(V) array faces ================= */
function spyArrays() {
  const P = [], c225 = Math.cos(PI / 8), ap = SPY_R * c225, s8 = SPY_R * Math.sin(PI / 8);
  const inO = (x, y, a) => { const X_ = Math.abs(x), Y_ = Math.abs(y); return X_ <= a && Y_ <= a && X_ + Y_ <= a * Math.SQRT2; };
  const hw = y => { const yy = Math.abs(y); return yy <= s8 ? ap : ap + s8 - yy; };
  for (const f of SPYF) {
    const H = (x, y, w) => [f.c[0] + f.h[0] * x + f.u[0] * y + f.n[0] * (w || 0), f.c[1] + f.h[1] * x + f.u[1] * y + f.n[1] * (w || 0), f.c[2] + f.h[2] * x + f.u[2] * y + f.n[2] * (w || 0)];
    const oct = (r, w) => { const p = []; for (let i = 0; i < 8; i++) { const t = (i + .5) / 8 * TAU; p.push(H(Math.cos(t) * r, Math.sin(t) * r, w)); } return p; };
    P.push(FN((out, s) => { const n = f.n; for (let i = Math.ceil(-ap / s); i * s <= ap; i++) for (let j = Math.ceil(-ap / s); j * s <= ap; j++) { const x = i * s, y = j * s; if (!inO(x, y, ap - .25 * s)) continue; const p = H(x, y); out.push(p[0], p[1], p[2], n[0], n[1], n[2]); } }));
    const o0 = oct(SPY_R, 0), o1 = oct(SPY_R, -.1);
    P.push(SL(o0, f.n, { closed: true, ds: 1.33 }));
    P.push(SL(oct(SPY_R * .955, .006), f.n, { closed: true }));
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; P.push(Q(o0[i], o0[j], o1[j], o1[i], { to: V.sub(V.lerp(o0[i], o0[j], .5), f.c) })); }
    P.push(SL(oct(SPY_R * 1.075, -.095), f.n, { closed: true }));
    // tiling: 8 x 8 panels, fine 16 x 16 subarrays
    for (let k = -3; k <= 3; k++) { const y = k * ap / 4, w = hw(y) - .06; P.push(SL([H(-w, y, .006), H(w, y, .006)], f.n), SL([H(y, -w, .006), H(y, w, .006)], f.n)); }
    for (let k = -4; k <= 3; k++) { const y = (k + .5) * ap / 4, w = hw(y) - .06; P.push(SL([H(-w, y, .004), H(w, y, .004)], f.n, F({ ds: 1.5 })), SL([H(y, -w, .004), H(y, w, .004)], f.n, F({ ds: 1.5 }))); }
    // the four mounting lugs at the corners of the frame
    for (let i = 0; i < 4; i++) { const t = (i + .5) / 4 * TAU; P.push(G.box(V.sub(H(Math.cos(t) * SPY_R * 1.07, Math.sin(t) * SPY_R * 1.07, -.06), [.06, .06, .06]), V.add(H(Math.cos(t) * SPY_R * 1.07, Math.sin(t) * SPY_R * 1.07, -.06), [.06, .06, .06]), F())); }
  }
  return P;
}

/* ================= mast, SPS-67, SPS-73, TACAN ================= */
function railBox(x0, x1, z0, z1, y, sides, P) {
  const C = { f: [[x0, y, z1], [x1, y, z1]], a: [[x1, y, z0], [x0, y, z0]], s: [[x1, y, z1], [x1, y, z0]], p: [[x0, y, z0], [x0, y, z1]] };
  for (const k of sides) rail(C[k], [.5, 1.0], .75, P, F());
}
function mast() {
  const P = [];
  for (const [a, b] of LEGS) P.push(G.cyl(a, b, .2, {}));
  const lv = [MB, 24.4, 28.2, 32.0, 35.2, MT];
  for (const y of lv.slice(1)) { P.push(LN([0, 1, 2, 3].map(k => legAt(k, y)), { closed: true })); P.push(LN([0, 1, 2, 3].map(k => V.add(legAt(k, y), [0, -.14, 0])), F({ closed: true }))); }
  for (let l = 0; l < lv.length - 1; l++) for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    P.push(LN([legAt(k, lv[l]), legAt(k2, lv[l + 1])]), LN([legAt(k2, lv[l]), legAt(k, lv[l + 1])]));
  }
  // ladder up the aft face
  const lad = (u, y) => V.lerp(legAt(3, y), legAt(2, y), u);
  for (const u of [.42, .58]) P.push(LN([lad(u, MB), lad(u, MT)], F()));
  for (let y = MB + .3; y < MT; y += .3) P.push(LN([lad(.42, y), lad(.58, y)], F()));
  // SPS-67 platform (grating, rails)
  P.push(G.box([-1.45, 28.0, 19.3], [1.45, 28.2, 22.8], { ds: .6, bottom: true }));
  railBox(-1.45, 1.45, 19.3, 22.8, 28.2, ['f', 's', 'p'], P);
  // yardarms with UHF dipoles, braces, lights
  const zy = V.lerp(legAt(0, 32), legAt(3, 32), .5)[2];
  P.push(G.cyl([-6.6, 32.0, zy], [6.6, 32.0, zy], .1, {}));
  for (const s of [-1, 1]) {
    P.push(LN([[s * 6.6, 32.0, zy], legAt(s > 0 ? 1 : 0, 28.2)]), LN([[s * 4.2, 32.0, zy], legAt(s > 0 ? 2 : 3, 28.2)]));
    for (const x of [2.4, 3.9, 5.3]) { P.push(LN([[s * x, 32.0, zy], [s * x, 30.5, zy]]), LN([[s * x - .2, 30.6, zy], [s * x + .2, 30.6, zy]], F())); P.push(G.cyl([s * x, 31.9, zy], [s * x, 31.7, zy], .05, F())); }
    P.push(G.box([s * 6.62, 31.86, zy - .1], [s * 6.86, 32.14, zy + .1], F()));
    P.push(LN([[s * 6.4, 32.0, zy], [s * 6.4, 33.6, zy]], F()), G.lathe([s * 6.4, 33.6, zy], [0, 1, 0], [[0, .03], [.1, .12], [.12, 0]], F()));
  }
  const zy2 = V.lerp(legAt(0, 35.2), legAt(3, 35.2), .5)[2];
  P.push(G.cyl([-3.4, 35.2, zy2], [3.4, 35.2, zy2], .07, {}));
  for (const x of [-3.2, -1.9, 1.9, 3.2]) P.push(LN([[x, 35.2, zy2], [x, 34.2, zy2]]), LN([[x - .14, 34.3, zy2], [x + .14, 34.3, zy2]], F()));
  // SPS-73 nav radar on its bracket, slotted array
  const zf = legAt(0, 35.2)[2];
  P.push(G.box([-.3, 35.2, zf], [.3, 35.35, zf + .9], { bottom: true }), G.cyl([0, 35.35, zf + .6], [0, 35.75, zf + .6], .12, F()));
  P.push(G.box([-1.0, 35.75, zf + .52], [1.0, 35.98, zf + .68]));
  for (let x = -.9; x < .91; x += .15) P.push(SL([[x, 35.79, zf + .685], [x + .07, 35.94, zf + .685]], [0, 0, 1], F()));
  // top platform, TACAN, pole, whip, lights
  P.push(G.box([-1.0, MT, 14.9], [1.0, MT + .2, 18.1], { ds: .6, bottom: true }));
  railBox(-1.0, 1.0, 14.9, 18.1, MT + .2, ['f', 'a', 's', 'p'], P);
  P.push(G.lathe([0, MT + .2, 16.5], [0, 1, 0], [[0, .5], [.3, .5], [.35, .42], [1.3, .42], [1.4, .3], [1.55, .02]], {}));
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; P.push(LN([[Math.cos(a) * .43, MT + .7, 16.5 + Math.sin(a) * .43], [Math.cos(a) * .43, MT + 1.45, 16.5 + Math.sin(a) * .43]], F())); }
  P.push(G.cyl([0, MT + 1.55, 16.5], [0, MT + 6.8, 16.5], .07, {}), LN([[0, MT + 6.8, 16.5], [0, MT + 9.4, 16.5]]));
  P.push(LN([[-.7, MT + 4.2, 16.5], [.7, MT + 4.2, 16.5]], F()), LN([[0, MT + 4.2, 15.8], [0, MT + 4.2, 17.2]], F()));
  P.push(G.lathe([0, MT + 5.36, 16.5], [0, 1, 0], [[0, .05], [.08, .16], [.2, .16], [.28, .05]], F()));
  for (const s of [-1, 1]) P.push(G.box([s * .9 - .08, MT + .2, 18.0], [s * .9 + .08, MT + .5, 18.16], F()));
  return P;
}
function sps67() {
  const P = [], c = PS;
  P.push(G.cyl(c, V.add(c, [0, .7, 0]), .22, {}), G.lathe(V.add(c, [0, .7, 0]), [0, 1, 0], [[0, .34], [.25, .34]], { caps: true }));
  const y0 = c[1] + .98, y1 = c[1] + 1.8, zr = c[2] - .15, zz = x => zr - x * x / (4 * 1.7);
  const xs = []; for (let k = 0; k <= 10; k++) xs.push(-1.35 + 2.7 * k / 10);
  for (let k = 0; k < xs.length - 1; k++) {
    const a = xs[k], b = xs[k + 1], q = [[a, y0, zz(a)], [b, y0, zz(b)], [b, y1, zz(b)], [a, y1, zz(a)]];
    P.push(Q(q[0], q[1], q[2], q[3], { to: [0, 0, 1], ds: .8 }), Q(q[0], q[1], q[2], q[3], { to: [0, 0, -1], ds: 1.6 }));
    P.push(SL([q[0], q[3]], [0, 0, 1], F()));
  }
  for (const y of [y0, y1]) P.push(LN(xs.map(x => [x, y, zz(x)])));
  for (const x of [-1.35, 1.35]) P.push(LN([[x, y0, zz(x)], [x, y1, zz(x)]]));
  P.push(SL(xs.map(x => [x, (y0 + y1) / 2, zz(x) + .01]), [0, 0, 1], F()));
  const fz = zr + 1.25, fy = (y0 + y1) / 2;
  P.push(G.box([-.18, fy - .12, fz - .1], [.18, fy + .12, fz + .12]));
  P.push(LN([[-.9, y0 + .05, zz(-.9)], [0, fy, fz]]), LN([[.9, y0 + .05, zz(.9)], [0, fy, fz]]), LN([[0, y1, zr], [0, fy + .1, fz]]));
  P.push(G.box([-.3, c[1] + .95, zr - .35], [.3, y0, zr - .05], F()));
  return P;
}

/* ================= uptakes ================= */
function stacks() {
  const P = [];
  for (const zc of STACK_Z) {
    const { b, t } = STK(zc), cen = [0, 16, zc - 1];
    const Ws = wall(b[1], b[2], t[1], t[2], cen), Wp = wall(b[3], b[0], t[3], t[0], cen), Wf = wall(b[2], b[3], t[2], t[3], cen), Wa = wall(b[0], b[1], t[0], t[1], cen);
    const hs = [], hp = [], hf = [];
    for (const [W, H] of [[Ws, hs], [Wp, hp]]) {
      const [aL0, aR0] = W.span(W.H * .5), [aL1, aR1] = W.span(W.H * .88);
      const a0 = Math.max(aL0, aL1) + .3, a1 = Math.min(aR0, aR1) - .3, m = (a0 + a1) / 2;
      H.push(louvre(W, [a0, m - .1, W.H * .5, W.H * .86], P, .16));
      H.push(louvre(W, [m + .1, a1, W.H * .5, W.H * .86], P, .16));
      const [aL2] = W.span(W.H * .4);
      H.push(louvre(W, [aL2 + .4, aL2 + .4 + (a1 - a0) * .5, W.H * .12, W.H * .38], P, .16));
      door(W, W.span(.3)[1] - 1.2, .3, P, {});
      P.push(SL([W.at(W.span(W.H * .45)[0] + .02, W.H * .45, .01), W.at(W.span(W.H * .45)[1] - .02, W.H * .45, .01)], W.N, F()));
    }
    { const [aL, aR] = Wf.span(Wf.H * .85); hf.push(louvre(Wf, [aL + .5, aR - .5, Wf.H * .55, Wf.H * .85], P, .16)); }
    P.push(wallFn(Ws, hs), wallFn(Wp, hp), wallFn(Wf, hf), wallFn(Wa));
    edges([...b, ...t], BX, P);
    // the cap: a band round the top, the grille and the exhaust outlets on its deck
    const y1 = 21.6, yc = y1 + .6, cb = [[-2.15, y1, zc - 4.6], [2.15, y1, zc - 4.6], [2.15, y1, zc + 2.3], [-2.15, y1, zc + 2.3]], ct = cb.map(p => [p[0], yc, p[2]]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; P.push(Q(cb[i], cb[j], ct[j], ct[i], { to: V.sub(V.lerp(cb[i], cb[j], .5), [0, y1, zc - 1.15]) })); }
    edges([...cb, ...ct], BX, P);
    const EX = [[-.95, zc - 2.9, .62], [.95, zc - 2.9, .62], [-1.05, zc + .95, .34], [1.05, zc + .95, .34]];
    P.push(flat(yc, [-2.15, 2.15], [zc - 4.6, zc + 2.3], (x, z) => !EX.some(([ex, ez, r]) => Math.hypot(x - ex, z - ez) < r + .05) && !inBox(x, z, -1.9, 1.9, zc - .6, zc + 2.1)));
    P.push(SL([[-1.9, yc + .01, zc - .6], [1.9, yc + .01, zc - .6], [1.9, yc + .01, zc + 2.1], [-1.9, yc + .01, zc + 2.1]], [0, 1, 0], { closed: true, ds: 1.33 }));
    for (let z = zc - .45; z < zc + 2.05; z += .15) P.push(SL([[-1.85, yc + .01, z], [1.85, yc + .01, z]], [0, 1, 0], { ds: 1.3 }));
    for (const [ex, ez, r] of EX) {
      const big = r > .5, H_ = big ? 1.55 : 1.0;
      P.push(G.lathe([ex, y1 + .3, ez], [0, 1, 0], big ? [[0, r], [.3, r], [.32, r + .05], [.4, r + .05], [.42, r], [1.25, r], [1.55, r + .06]] : [[0, r], [.85, r], [1.0, r + .04]], {}));
      const ring = (rr, y) => { const p = []; for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; p.push([ex + Math.cos(a) * rr, y, ez + Math.sin(a) * rr]); } return p; };
      P.push(LN(ring(r - .05, y1 + .3 + H_ - .01), F({ closed: true })));
      if (big) for (const rr of [.25, .42]) P.push(LN(ring(rr, y1 + .3 + H_ - .25), F({ closed: true })));
    }
  }
  return P;
}

/* ================= Mk 41 VLS ================= */
function vls(fwd) {
  const P = [], rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z, y = hD(zc) + .06, hz = fwd ? 1.72 : 3.42, h = .3;
  const cells = []; for (let i = fwd ? 0 : 32; i < (fwd ? 32 : 96); i++) cells.push(vlsCell(i));
  const mods = []; for (let m = 0; m < 4; m++) for (let r = 0; r < rows / 4; r++) mods.push([(-3 + 2 * m) * 1.05, zc + (rows === 4 ? 0 : (r ? -1.7 : 1.7))]);
  P.push(flat(y, [-4.25, 4.25], [zc - hz, zc + hz], (x, z) => !cells.some(c => Math.abs(x - c.x) < h + .03 && Math.abs(z - c.z) < h + .03) && !mods.some(([xm, zm]) => Math.abs(x - xm) < .22 && Math.abs(z - zm) < 1.58)));
  const yd = hD(zc) + .01;
  const per = [[-4.25, zc - hz], [4.25, zc - hz], [4.25, zc + hz], [-4.25, zc + hz]];
  P.push(SL(per.map(([x, z]) => [x, y, z]), [0, 1, 0], { closed: true, ds: 1.33 }), SL(per.map(([x, z]) => [x * 1.012, yd, z + Math.sign(z - zc) * .03]), [0, 1, 0], F({ closed: true })));
  for (const [xm, zm] of mods) {
    P.push(SL([[xm - 1.02, y + .005, zm - 1.68], [xm + 1.02, y + .005, zm - 1.68], [xm + 1.02, y + .005, zm + 1.68], [xm - 1.02, y + .005, zm + 1.68]], [0, 1, 0], { closed: true, ds: 1.33 }));
    const uq = [[xm - .19, y + .02, zm - 1.55], [xm + .19, y + .02, zm - 1.55], [xm + .19, y + .02, zm + 1.55], [xm - .19, y + .02, zm + 1.55]];
    P.push(Q(uq[0], uq[1], uq[2], uq[3], { n: [0, 1, 0], e: true, ds: 1.5 }));
    for (let k = 1; k < 6; k++) { const z = zm - 1.55 + 3.1 * k / 6; P.push(SL([[xm - .17, y + .025, z], [xm + .17, y + .025, z]], [0, 1, 0], F())); }
  }
  for (const c of cells) {
    const yy = c.y + .02, q = [[c.x - h, yy, c.z - h], [c.x + h, yy, c.z - h], [c.x + h, yy, c.z + h], [c.x - h, yy, c.z + h]];
    P.push(Q(q[0], q[1], q[2], q[3], { n: [0, 1, 0], e: true, ds: 1.5 }));
    P.push(SL(q.map(p => [c.x + (p[0] - c.x) * .72, yy + .01, c.z + (p[2] - c.z) * .72]), [0, 1, 0], { closed: true }));
    const xh = c.x + c.hs * (h - .04);
    P.push(SL([[xh, yy + .015, c.z - h + .06], [xh, yy + .015, c.z + h - .06]], [0, 1, 0], F()));
    P.push(G.box([c.x - c.hs * .22 - .03, yy, c.z - .03], [c.x - c.hs * .22 + .03, yy + .04, c.z + .03], F()));
  }
  return P;
}

/* ================= Phalanx CIWS Block 1B ================= */
function ciws(i) {
  const base = [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, .82], [.12, .82], [.18, .74], [.52, .72]], {}),
    G.box([-.8, .52, -.38], [-.6, 1.8, .38]), G.box([.6, .52, -.38], [.8, 1.8, .38]),
    G.lathe([0, .52, 0], [0, 1, 0], [[0, .56], [.3, .5]], {}),
    G.box([.82, .55, -.6], [1.12, 1.25, .1], F()),
    G.cyl([-.82, 1.55, 0], [.82, 1.55, 0], .1, F()),
  ];
  const el = [
    G.lathe([0, 1.9, -.28], [0, 1, 0], [[0, .6], [.55, .62], [1.05, .56], [1.42, .38], [1.62, .14], [1.68, 0]], {}),
    G.box([-.56, 1.5, -.92], [.56, 1.92, .42]),
    G.lathe([0, 1.18, -1.05], [0, 0, 1], [[0, .38], [1.35, .38]], { caps: true }),
    G.lathe([0, CIWS_MZ[1], .1], [0, 0, 1], [[0, .22], [.55, .2], [.62, .14]], {}),
    G.box([-1.02, 2.02, -.25], [-.66, 2.46, .3], F()),
    G.box([-.3, 3.08, -.55], [.3, 3.25, -.1], F()),
    G.lathe([0, 2.6, .28], [0, 0, 1], [[0, .26], [.12, .22], [.18, 0]], F()),
    P_.bar([0, 1.18, .3], [0, CIWS_MZ[1] - .15, .62], .2, .12, [1, 0, 0], F()),
  ];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU, x = Math.cos(a) * .115, y = Math.sin(a) * .115 + CIWS_MZ[1]; el.push(G.cyl([x, y, .62], [x, y, CIWS_MZ[2]], .027, F())); }
  for (const z of [1.25, 2.02]) el.push(G.lathe([0, CIWS_MZ[1], z], [0, 0, 1], [[0, .165], [.08, .165]], {}));
  const ring = (c, r) => { const p = []; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; p.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]); } return p; };
  el.push(LN(ring([-.84, 2.24, .31], .12), F({ closed: true })));
  const T = X.make(R.y(CIWS_YAW[i]), CIWS_P[i]), TE = X.mul(T, piv(R.x(-CIWS_EL), CIWS_TR));
  return [...tps(T, base), ...tps(TE, el)];
}

/* ================= boats, davits, decoy launchers, Mk 38, SVTT ================= */
function rhib() {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(G.lathe([s * 1.05, .5, -3.3], [0, 0, 1], [[0, .2], [.06, .26], [4.9, .26]], {}));
    P.push(G.cyl([s * 1.05, .5, 1.6], [s * .1, .72, 3.45], .26, {}));
    P.push(LN([[s * 1.05, .78, -3.2], [s * 1.05, .78, 1.6], [s * .12, .99, 3.4]], F()));
  }
  P.push(G.hex([[-.25, 0, -3.3], [.25, 0, -3.3], [.05, .25, 3.2], [-.05, .25, 3.2], [-.95, .48, -3.3], [.95, .48, -3.3], [.2, .6, 3.2], [-.2, .6, 3.2]], { bottom: true }));
  P.push(G.box([-.35, .5, -.3], [.35, 1.35, .45]));
  P.push(LN([[-.35, 1.35, .45], [-.3, 1.75, .6], [.3, 1.75, .6], [.35, 1.35, .45]]));
  for (const z of [-1.0, -1.7]) P.push(G.box([-.3, .5, z - .25], [.3, .95, z + .25], F()));
  P.push(G.box([-.5, .5, -2.9], [.5, .95, -2.2]), G.box([-.3, .95, -2.85], [.3, 1.35, -2.4], F()));
  P.push(LN([[-.8, .8, -3.1], [-.8, 1.9, -2.6], [.8, 1.9, -2.6], [.8, .8, -3.1]]));
  P.push(G.box([-.1, 1.9, -2.66], [.1, 2.0, -2.54], F()));
  return P;
}
function srboc() {
  const P = [G.box([-.35, 0, -.5], [.35, .38, .5])];
  for (const [row, el] of [[0, 45], [1, 60]]) for (const z of [-.3, 0, .3]) {
    const a = el * PI / 180, d = [Math.cos(a), Math.sin(a), 0], b = [-.12 + row * .2, .4 + row * .12, z];
    P.push(G.lathe(b, d, [[0, .065], [1.0, .065]], {}));
  }
  return P;
}
function kit() {
  const P = [];
  for (const sg of [-1, 1]) {
    // boats in their cradles under slewing davits
    const zc = -10.2, yb = hD(zc) + .45;
    P.push(...tps(X.make(R.I(), [sg * 8.0, yb, zc]), rhib()));
    for (const dz of [-2.2, 1.8]) P.push(G.box([sg > 0 ? 7.4 : -8.6, hD(zc), zc + dz - .25], [sg > 0 ? 8.6 : -7.4, yb + .1, zc + dz + .25]));
    P.push(G.lathe([sg * 5.95, D01, zc], [0, 1, 0], [[0, .32], [.12, .32], [.12, .18], [2.7, .16]], {}));
    P.push(G.lathe([sg * 5.95, D01 + .55, zc - .45], [0, 0, 1], [[0, .2], [.9, .2]], F({ caps: true })));
    P.push(P_.bar([sg * 5.95, 13.0, zc], [sg * 8.0, 13.55, zc], .2, .26, [0, 1, 0]));
    P.push(G.lathe([sg * 8.0, 13.42, zc - .06], [0, 0, 1], [[0, .18], [.12, .18]], F({ caps: true })));
    for (const dz of [-.08, .08]) P.push(LN([[sg * 8.0, 13.3, zc + dz], [sg * 8.0, yb + 1.95, zc + dz]]));
    P.push(LN([[sg * 8.0, yb + 1.95, zc], [sg * 8.0, yb + 1.0, zc - 2.6]], F()), LN([[sg * 8.0, yb + 1.95, zc], [sg * 8.0, yb + 1.0, zc + 2.4]], F()));
    // Mk 137 SRBOC beside the uptakes, Mk 53 Nulka
    for (const z of STACK_Z) P.push(...tps(X.make(sg > 0 ? R.I() : R.y(PI), [sg * 4.9, D01, z]), srboc()));
    const nk = [G.box([-.45, 0, -.45], [.45, .3, .45])];
    for (const x of [-.2, .2]) for (const z of [-.2, .2]) { nk.push(G.box([x - .16, .3, z - .16], [x + .16, 1.85, z + .16])); nk.push(SL([[x - .12, 1.86, z - .12], [x + .12, 1.86, z - .12], [x + .12, 1.86, z + .12], [x - .12, 1.86, z + .12]], [0, 1, 0], F({ closed: true }))); }
    P.push(...tps(X.make(R.I(), [sg * 4.2, D01, -7.4]), nk));
    // Mk 38 Mod 2 25 mm
    const m = [sg * 4.6, D01, -22.4];
    P.push(G.lathe(m, [0, 1, 0], [[0, .5], [.1, .5], [.1, .4], [.7, .4]], {}));
    P.push(G.box(V.add(m, [-.32, .7, -.55]), V.add(m, [.32, 1.22, .5])));
    P.push(G.lathe(V.add(m, [0, .98, .5]), V.norm([sg * .25, .05, 1]), [[0, .09], [.3, .07], [.32, .05], [1.95, .045]], {}));
    P.push(G.box(V.add(m, [sg * .34, .78, -.35]), V.add(m, [sg * .62, 1.1, .2]), F()), G.box(V.add(m, [-sg * .36, 1.0, -.1]), V.add(m, [-sg * .56, 1.24, .25]), F()));
    // Mk 32 SVTT
    const t = [sg * 7.3, hD(VA_Z) + .05, VA_Z + 1.0], d = V.norm([sg * .8, 0, .6]), side = V.norm([d[2], 0, -d[0]]);
    P.push(G.lathe(t, [0, 1, 0], [[0, .3], [.08, .3], [.08, .22], [.75, .22]], {}));
    for (const [dx, dy] of [[-.22, .98], [.22, .98], [0, 1.36]]) {
      const c0 = V.add(V.mad(t, side, dx), [0, dy, 0]);
      P.push(G.lathe(V.mad(c0, d, -1.1), d, [[0, .19], [2.9, .19], [3.0, .17]], { caps: true }));
      for (const u of [.2, 1.4, 2.6]) { const c = V.mad(c0, d, -1.1 + u), r = []; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; r.push(V.add(c, V.add(V.mul(side, Math.cos(a) * .205), [0, Math.sin(a) * .205, 0]))); } P.push(LN(r, F({ closed: true }))); }
    }
  }
  return P;
}

/* ================= flight deck: markings, tie-downs, nets; hangar doors, HRS ================= */
function flightDeck() {
  const P = [], yz = z => hD(z) + .02, up = [0, 1, 0];
  const circ = []; for (let k = 0; k < 64; k++) { const a = k / 64 * TAU; circ.push([Math.cos(a) * 3.1, yz(HELO_Z + Math.sin(a) * 3.1), HELO_Z + Math.sin(a) * 3.1]); }
  P.push(SL(circ, up, { closed: true }));
  for (let z = -77.0; z < -53.6; z += 2.0) P.push(SL([[0, yz(z), z], [0, yz(z + 1.2), z + 1.2]], up));
  P.push(SL([[-7, yz(HELO_Z), HELO_Z], [7, yz(HELO_Z), HELO_Z]], up));
  for (const x of [-.35, .35]) P.push(SL([[x, yz(-60), -60], [x, yz(-53.4), -53.4]], up));
  for (const sg of [-1, 1]) {
    const ed = []; for (let z = -77.2; z <= -53.4; z += 1) ed.push([sg * (hB(z) - .6), yz(z), z]);
    P.push(SL(ed, up));
    const net = []; for (let z = -77.0; z <= -53.6; z += 2.34) net.push(z);
    P.push(LN(net.map(z => [sg * (hB(z) + 1.4), hD(z) - .35, z])));
    for (const z of net) P.push(LN([[sg * (hB(z) - .02), hD(z), z], [sg * (hB(z) + 1.4), hD(z) - .35, z]]));
    for (const f of [.33, .66]) P.push(LN(net.map(z => [sg * (hB(z) + 1.4 * f), hD(z) - .35 * f, z]), F()));
    for (let i = 0; i < net.length - 1; i++) { const z0 = net[i], z1 = net[i + 1]; P.push(LN([[sg * hB(z0), hD(z0), z0], [sg * (hB(z1) + 1.4), hD(z1) - .35, z1]], F()), LN([[sg * (hB(z0) + 1.4), hD(z0) - .35, z0], [sg * hB(z1), hD(z1), z1]], F())); }
  }
  for (let z = -76.0; z < -54; z += 2.4) for (let x = -7.2; x <= 7.21; x += 2.4) {
    if (Math.abs(x) > hB(z) - 1.0) continue;
    const r = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; r.push([x + Math.cos(a) * .11, yz(z) + .005, z + Math.sin(a) * .11]); }
    P.push(SL(r, up, F({ closed: true })));
  }
  // hangar doors (rolling shutters) on the hangar's aft wall, the centre post, the horizon reference bar, floodlights
  const W = wall(H3[0], H3[1], H3[4], H3[5], [0, 9, -43.5]), y0 = hD(-53) + .02, y1 = y0 + 5.5;
  for (const sg of [-1, 1]) {
    const a0 = 8.6 + sg * .7, a1 = 8.6 + sg * 6.85, lo = Math.min(a0, a1), hi = Math.max(a0, a1), h0 = W.hy(lo, y0), h1 = W.hy(lo, y1);
    P.push(SL(W.rect(lo, hi, h0, h1, .05), W.N, { closed: true, ds: 1.33 }), SL(W.rect(lo - .12, hi + .12, h0, h1 + .12, .03), W.N, F({ closed: true })));
    for (let h = h0 + .32; h < h1 - .1; h += .32) P.push(SL([W.at(lo + .03, h, .05), W.at(hi - .03, h, .05)], W.N));
    P.push(G.box(W.at(lo - .1, h1 + .15, 0), W.at(hi + .1, h1 + .65, .35), F()));
  }
  P.push(LN([W.at(.2, W.hy(.2, y1 + .9), .1), W.at(16.99, W.hy(17, y1 + .9), .1)]));
  for (const a of [2.5, 6.5, 10.7, 14.7]) P.push(G.box(W.at(a - .2, W.hy(a, y1 + 1.35), 0), W.at(a + .2, W.hy(a, y1 + 1.6), .3), F()));
  return P;
}

/* ================= build ================= */
window.RGS = {
  info: null,
  build(PP) {
    if (/[?&]rgsoff/.test(location.search)) return { skip: [], parts: [] };     // debug: the plain HD ship
    P_ = PP; NPTS = 0;
    const t0 = performance.now();
    const H = houses();
    const parts = [
      { name: 'hullS+', ml: mk(hullSkin(1), LBIG, 2.0), side: 1 },
      { name: 'hullS-', ml: mk(hullSkin(-1), LBIG, 2.0), side: -1 },
      { name: 'deck', ml: mk([...deckSkin(), ...hullEnds(), ...bulwark(1, true), ...bulwark(-1, true)], LBIG, 2.2) },
      { name: 'hullL+', ml: mk([...hullLines(1), ...bulwark(1)], LBIG, 2.0), side: 1 },
      { name: 'hullL-', ml: mk([...hullLines(-1), ...bulwark(-1)], LBIG, 2.0), side: -1 },
      { name: 'houses', ml: mk(H.P.filter(p => !p.side), LBIG, 1.8, 1.5) },
      { name: 'walls+', ml: mk(H.P.filter(p => p.side > 0), LBIG, 1.8, 1.5), side: 1, wall: true },
      { name: 'walls-', ml: mk(H.P.filter(p => p.side < 0), LBIG, 1.8, 1.5), side: -1, wall: true },
      { name: 'houseDetail', ml: mk([...H.D, ...superDetail()], LDET, 1.4) },
      { name: 'spy', ml: mk(spyArrays(), LDET, 1.2) },
      { name: 'mast', ml: mk([...mast(), ...sps67()], LDET, 1.4) },
      { name: 'stacks', ml: mk(stacks(), LBIG, 1.6) },
      { name: 'vls', ml: mk([...vls(true), ...vls(false)], LDET, 1.4) },
      { name: 'ciws', ml: mk([...ciws(0), ...ciws(1)], LDET, 1.0) },
      { name: 'fx', ml: mk(forecastle(), LDET, 1.2) },
      { name: 'rails', ml: mk(lifelines(), LBIG, 2.4) },
      { name: 'kit', ml: mk(kit(), LDET, 1.2) },
      { name: 'flight', ml: mk(flightDeck(), LBIG, 2.0) },
    ].map(p => Object.assign(p, { cut: false }));
    /* a hull side's plating faces away from any eye on the other side of the centreline (the flare hides it from
       above too): that side's clouds are left out while the lens is there, except off the bow and the stern */
    for (const p of parts) if (p.side) {
      const cl = p.ml, sg = p.side; delete p.ml;
      const vis = p.wall ? e => e[0] * sg > 0 || e[1] > 45 : e => e[0] * sg > -1.5 - .8 * Math.max(0, e[2] - 70) - .3 * Math.max(0, -72 - e[2]);
      Object.defineProperty(p, 'ml', { enumerable: true, get() { const e = K.C.eye; return !e || vis(e) ? cl : EMPTY; } });
      p.cloud = cl;
    }
    { const m = /[?&]rgsonly=([^&]+)/.exec(location.search); if (m) { const keep = decodeURIComponent(m[1]).split(','); for (let i = parts.length - 1; i >= 0; i--) if (!keep.includes(parts[i].name)) parts.splice(i, 1); } }   // debug
    window.RGS.info = { ms: performance.now() - t0, n1: NPTS, parts: parts.map(p => [p.name, (p.cloud || p.ml).lv.map(l => l.length / 6)]) };
    if (/[?&]rgsprof/.test(location.search)) {             // debug: points drawn per cloud (the film's own count is lost)
      const D0 = PP.drawX, acc = window.RGS.drawn = {};
      parts.forEach(p => { (p.cloud || p.ml).__n = p.name; });
      PP.drawX = (ml, Tw, o) => {
        PP.np(); const t = performance.now(); D0(ml, Tw, o); const k = ml.__n || 'other', mine = k !== 'other';
        acc[k] = (acc[k] || 0) + PP.np(); acc[mine ? 'msMine' : 'msOther'] = (acc[mine ? 'msMine' : 'msOther'] || 0) + performance.now() - t;
        if (k === 'hullSkin') acc.frames = (acc.frames || 0) + 1;
      };
    }
    return {
      skip: ['hull', 'super', 'mast', 'arms', 'spy', 'stacks', 'sps', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA', 'decoys', 'boats', 'hangar', 'deck', 'rails'],
      parts,
    };
  },
};
})();
