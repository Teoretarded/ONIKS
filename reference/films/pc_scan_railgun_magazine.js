/* SCAN · RAILGUN insert: the round made on board (window.RGM; the insert API is in pc_scan_railgun_film.js, "inserted
   sequences"; the round is window.RGR, pc_scan_railgun_round.js). Under the power room, a fabrication deck: the lens
   dives through the room's floor and the X-ray opens down into it. A six-axis arm on a floor track lifts a bare
   tungsten rod out of its rack and lays it between the centres of a line shuttle in the coater; the coater's head, a
   C-ring of 24 micro-arms, runs the rod's length and the arms stitch conductor into its eight engraved channels (slow
   motion, x0.25, then real time), each trace lighting lime as it is laid. The shuttle carries the rod into the lattice
   grower: a deposition ring sweeps the sabot's length and the three segments' micro-lattice forms layer by layer
   behind it, cells blinking into place. At the next station two rams close the armature's halves on the sabot's rear
   face and current fuses them; the inspection ring runs tail to nose, charging the circuit (streaks race along the
   traces) while its scan plane boxes each part. The arm takes the round off the shuttle, stands it up and sets it on
   the strike-up, which lifts it through a scuttle into the magazine cell the loader takes next (window.RGP.MAG_CELL,
   else the drum's cell 01); the lens rises with it and settles where the loader takes over.
   Frames: ship (+Z fwd, +X stbd, y up from the waterline); the round on the line: its Z forward, X down, Y to stbd
   (R_LINE); the arm's base on its track carriage (its links each +y along the link). Render is a pure function of u
   (s into the insert). */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const G = GEO;
const F = o => Object.assign({ fine: true }, o || {});

/* ---------- time and place ---------- */
const LEN = 29.6;
const AZ = Math.atan2(7200, 15600);              // the mount's train (the film's PSI): where the drum's cell 01 sits
const YD = -1.75, ZA = 41.6, ZF = 52.25;         // the fabrication deck and its bulkheads (its deckhead: the room's floor)
const XL = -2.1, YL = YD + 1.1;                  // the line: the rod's axis (along z)
const ZC = 43.4, ZG = 46.5, ZR = 49.6;           // the stations (the rod's centre): coater, grower, armature + ring
const XA = -1.0, YB = YD + .3;                   // the arm's track, its base's top
const R_LINE = R.z(-PI / 2);                     // the round on the line: X down, Y to stbd, Z fwd
const kk = (u, a, b) => E.ss(a, b, u);
const lock = (u, t0) => { const a = u - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);

/* the beats (u) */
const U = {
  rv0: .1, rv1: 1.05,                                         // the X-ray front opens down into the deck
  grip1: 2.28, cen0: 4.0, cen1: 4.18, load: 4.2,              // the rod gripped in the rack, the centres closed on it, released
  co0: 4.45,                                                  // the coater's clock starts
  sh1a: 10.7, sh1b: 12.2,                                     // the shuttle to the grower
  gr0: 12.35, gr1: 16.9,                                      // the lattice grown
  sh2a: 17.05, sh2b: 18.55,                                   // the shuttle to the armature station
  am0: 18.65, am1: 19.35, fuse: 19.4, amR0: 19.85, amR1: 20.35,
  ri0: 20.15, riS0: 20.55, riS1: 23.0, riE: 23.45,            // the ring: in, the sweep tail to nose, out
  unl: 24.05, cenR0: 24.0, cenR1: 24.2,                       // the arm takes the round; the centres draw back
  place: 26.45,                                               // set on the strike-up
  sct0: 26.5, sct1: 26.85, up0: 26.9, up1: 28.2, latch: 28.3, dn0: 28.35, dn1: 28.95, sctC0: 28.5, sctC1: 28.85,
  cl0: 28.45, cl1: 29.2,                                      // the X-ray front closes back up
};
/* the coater's clock: real time, x0.25 for the close look at the arms, real time again */
const CW = FILM.warp([{ t: 0, rate: 1 }, { t: .8, rate: 1 }, { t: 1.25, rate: .25 }, { t: 3.35, rate: .25 }, { t: 3.85, rate: 1 }, { t: 6.4, rate: 1 }]);
const tauAt = u => u < U.co0 ? 0 : CW(u - U.co0);
const coRate = u => u < U.co0 || u > U.co0 + 6.4 ? 1 : CW.rate(u - U.co0);
const VCO = .6, CO_T0 = .62, CO_T1 = CO_T0 + 1.8 / VCO;      // the head lays from z -.9 to .9 at VCO (coater s)
function headZ(t) {                                          // the coater head's z on the rod (round frame)
  if (t < CO_T0) return E.mix(-1.32, -.9, E.ss(0, .5, t));
  if (t < CO_T1) return -.9 + (t - CO_T0) * VCO;
  return E.mix(.9, 1.32, E.ss(CO_T1 + .12, CO_T1 + .45, t));
}
const depAt = t => E.ss(.38, .6, t) * (1 - E.ss(CO_T1, CO_T1 + .12, t));     // the micro-arms deployed
const laidAt = t => t < CO_T0 ? -9 : t < CO_T1 ? headZ(t) + .041 : 9;
const shuttleZ = u => u < U.sh1a ? ZC : u < U.sh2a ? E.mix(ZC, ZG, kk(u, U.sh1a, U.sh1b)) : E.mix(ZG, ZR, kk(u, U.sh2a, U.sh2b));
const quillAt = u => kk(u, U.cen0, U.cen1) * (1 - kk(u, U.cenR0, U.cenR1));
const growAt = u => 1.08 * kk(u, U.gr0 + .2, U.gr1 - .25);
const ringZ = u => u < U.riS0 ? E.mix(-1.34, -.95, kk(u, U.ri0, U.riS0)) : u < U.riS1 ? E.mix(-.95, .95, kk(u, U.riS0, U.riS1) * .15 + .85 * E.sat((u - U.riS0) / (U.riS1 - U.riS0))) : E.mix(.95, 1.34, kk(u, U.riS1, U.riE));
const armClose = u => kk(u, U.am0, U.am1);
/* the deposition ring rides just ahead of the forming layer (the growth key: .8 along + .13 out + .07 jitter) */
const depoZ = g => g <= 0 ? -.76 : g >= 1.05 ? .6 : E.mix(-.64, .5, E.clamp((g - .06) / .84, 0, 1));
const ramBack = u => kk(u, U.amR0, U.amR1);

/* ---------- the arm: a 50 kg-class six-axis robot (the old 16 kg arm x1.3) on a floor track ---------- */
const SA = 1.3;
const A1 = .15 * SA, H1 = .45 * SA, A2 = .68 * SA, D4 = .66 * SA, D6 = .09 * SA, LG = .19 * SA, LT = D6 + LG;
/* poses: TCP (ship), the wrist roll (deg: 90 the jaws vertical, a rod along the tangent; 180 a round held upright),
   the track's z; segments [u0, u1, J (joint space) | L (straight line) | H (hold), from, to], eased in and out */
const PZ = {};
const PLAN = [
  [0, 1.2, 'H', 'home'], [1.2, 1.95, 'J', 'home', 'rkA'], [1.95, 2.2, 'L', 'rkA', 'rkG'], [2.2, 2.38, 'H', 'rkG'],
  [2.38, 2.65, 'L', 'rkG', 'rkU'], [2.65, 3.55, 'J', 'rkU', 'lnA'], [3.55, 3.95, 'L', 'lnA', 'lnP'], [3.95, 4.3, 'H', 'lnP'],
  [4.3, 4.55, 'L', 'lnP', 'lnR'], [4.55, 5.4, 'J', 'lnR', 'pk1'], [5.4, 12.4, 'H', 'pk1'], [12.4, 16.6, 'J', 'pk1', 'pk2'],
  [16.6, 22.9, 'H', 'pk2'], [22.9, 23.55, 'J', 'pk2', 'unA'], [23.55, 23.85, 'L', 'unA', 'unG'], [23.85, 24.25, 'H', 'unG'],
  [24.25, 24.6, 'L', 'unG', 'unU'], [24.6, 24.9, 'L', 'unU', 'unR'], [24.9, 26.0, 'J', 'unR', 'stA'], [26.0, 26.3, 'L', 'stA', 'stP'],
  [26.3, 26.6, 'H', 'stP'], [26.6, 26.85, 'L', 'stP', 'stR'], [26.85, 27.7, 'J', 'stR', 'home2'], [27.7, 99, 'H', 'home2'],
];
const GRIP_OPEN = .2, GRIP_ROD = .0135, GRIP_RND = .142;
const gripAt = u => u < 2.2 ? GRIP_OPEN : u < 4.15 ? E.mix(GRIP_OPEN, GRIP_ROD, kk(u, 2.2, 2.32)) : u < 23.85 ? E.mix(GRIP_ROD, GRIP_OPEN, kk(u, 4.15, 4.27))
  : u < 26.4 ? E.mix(GRIP_OPEN, GRIP_RND, kk(u, 23.85, 23.97)) : E.mix(GRIP_RND, GRIP_OPEN, kk(u, 26.4, 26.52));
const ZGRIP = -.07;                                          // where it holds the finished round (its sabot's middle)

/* ---------- the camera: ship-frame keys plus a follow offset (the integral of the subject's motion over each
   follow window), Hermite blends from and back into the base camera ---------- */
const U_A = .95, U_B = 28.95;
let CAMK = null;
const DBG = (() => {
  let s = STAGE.Q.get('cam');
  try { if (!s && window.parent !== window) s = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  if (!s) return null; const a = s.split(',').map(Number); return { eye: a.slice(0, 3), target: a.slice(3, 6), fov: (a[6] || 40) * DEG };
})();
let CK = null, VOLD = null, FOL = null, T_AT = 23.9;
const FOL_N = 3000, FOL_DT = LEN / FOL_N;
function herm(p0, p1, m0, m1, w, dt) {
  const w2 = w * w, w3 = w2 * w, h00 = 2 * w3 - 3 * w2 + 1, h10 = w3 - 2 * w2 + w, h01 = -2 * w3 + 3 * w2, h11 = w3 - w2;
  return p0 * h00 + m0 * dt * h10 + p1 * h01 + m1 * dt * h11;
}
const hermV = (a, b, ma, mb, w, dt) => [0, 1, 2].map(k => herm(a[k], b[k], ma[k], mb[k], w, dt));
const toShip = (Ws, p) => { const M = Ws.R, x = p[0] - Ws.T[0], y = p[1] - Ws.T[1], z = p[2] - Ws.T[2]; return [M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z]; };
const dirShip = (Ws, v) => { const M = Ws.R; return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; };
/* follow windows [u0, u1, ramp, subject(u) -> ship point]: the camera rides along with the subject inside them */
let FOLW = null;
function folAt(u) {
  const x = E.clamp(u / FOL_DT, 0, FOL_N - 1e-6), k = Math.floor(x), w = x - k, o = [0, 0, 0];
  for (let c = 0; c < 3; c++) o[c] = FOL[k * 3 + c] + (FOL[k * 3 + 3 + c] - FOL[k * 3 + c]) * w;
  return o;
}
function camS(u) { const s = CK(u), f = folAt(u); return { eye: V.add(s.eye, f), target: V.add(s.target, f), fov: s.fov }; }
function camPrep(ctx) {
  FOL = new Float64Array((FOL_N + 1) * 3);
  let pv = null;
  for (let i = 0; i <= FOL_N; i++) {
    const u = i * FOL_DT;
    if (i) for (let c = 0; c < 3; c++) FOL[i * 3 + c] = FOL[i * 3 - 3 + c];
    for (const [u0, u1, rp, fn] of FOLW) {
      if (u < u0 - .02 || u > u1 + .02 || !i) continue;
      const w = E.ss(u0, u0 + rp, u) * (1 - E.ss(u1 - rp, u1, u)), a = fn(u - FOL_DT), b = fn(u);
      for (let c = 0; c < 3; c++) FOL[i * 3 + c] += w * (b[c] - a[c]);
    }
  }
  const o = ctx.camAt(T_AT), h = 1 / 120, a = ctx.camAt(T_AT - h), b = ctx.camAt(T_AT + h);
  VOLD = { eye: V.mul(V.sub(b.eye, a.eye), 1 / (2 * h)), target: V.mul(V.sub(b.target, a.target), 1 / (2 * h)), fov: (b.fov - a.fov) / (2 * h) };
  // the keys are where the lens is at their times: the follow offset at each key is taken out of the path
  const ends = [[0, o.eye, o.target, o.fov / DEG], ...CAMK, [LEN, o.eye, o.target, o.fov / DEG]];
  CK = FILM.path(ends.map(([t, eye, target, fov]) => { const f = folAt(t); return { t, eye: V.sub(eye, f), target: V.sub(target, f), fov }; }));
}
function cam(u, ctx) {
  if (DBG) return DBG;
  const Ws = ctx.Ws;
  if (u >= U_A && u <= U_B) { const s = camS(u); return { eye: X.ap(Ws, s.eye), target: X.ap(Ws, s.target), fov: s.fov }; }
  const o = ctx.camOld, st = u < U_A, k = st ? U_A : U_B, dt = st ? U_A : LEN - U_B, w = st ? u / U_A : (u - U_B) / (LEN - U_B);
  const s = camS(k), sa = camS(k - .01), sb = camS(k + .01);
  const ve = V.mul(V.sub(sb.eye, sa.eye), 50), vt = V.mul(V.sub(sb.target, sa.target), 50), vf = (sb.fov - sa.fov) * 50;
  const e0 = toShip(Ws, o.eye), t0 = toShip(Ws, o.target), we = dirShip(Ws, VOLD.eye), wt = dirShip(Ws, VOLD.target);
  const eye = st ? hermV(e0, s.eye, we, ve, w, dt) : hermV(s.eye, e0, ve, we, w, dt);
  const target = st ? hermV(t0, s.target, wt, vt, w, dt) : hermV(s.target, t0, vt, wt, w, dt);
  const fov = st ? herm(o.fov, s.fov, VOLD.fov, vf, w, dt) : herm(s.fov, o.fov, vf, VOLD.fov, w, dt);
  return { eye: X.ap(Ws, eye), target: X.ap(Ws, target), fov };
}

/* ---------- the point pass: the room's lattice look (1 px dots, edges at a fixed brightness, the room's occluders),
   the deck's reveal (a level front in ship y: points below hidden, a lime band above it), and the lattice's growth
   (a per-point key: points past the front hidden, a lime band of forming cells at it) ---------- */
let K, P_, LIME, HOT, WH, YH, WS = null, FOC = 0, XM_ = null, NPM = 0;
let RV_Y = -99, RV_ON = false;
const RVB = .24, GB = .1;
function sphereIn(x, mx, my, mz, rad) {
  const C = K.C, zc = x[6] * mx + x[7] * my + x[8] * mz + x[11];
  if (zc < C.near - rad) return false;
  const xc = x[0] * mx + x[1] * my + x[2] * mz + x[9], yc = x[3] * mx + x[4] * my + x[5] * mz + x[10];
  const Fl = C.fl, xr = (1920 - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
function runM(P, i0, i1, sp, o, S, test, KY, gt) {
  const x = XM_, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, occ = P_.occd;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, eb = o.edge, bkeep = o.bk, big = o.size, amb = o.amb || 0;
  const lm = o.lime, col = o.col || WH;
  const cr = col[0] + (LIME[0] - col[0]) * lm, cg = col[1] + (LIME[1] - col[1]) * lm, cb = col[2] + (LIME[2] - col[2]) * lm;
  const s0 = S ? S.R[3] : 0, s1 = S ? S.R[4] : 1, s2 = S ? S.R[5] : 0, s3 = S ? S.T[1] : 0, fy = RV_Y, ib = 1 / RVB, ig = 1 / GB;
  for (let i = i0, j = i0 * 6; i < i1; i++, j += 6) {
    if (keep < 1 && (i * .6180339887) % 1 > keep) continue;
    let k = 0;
    if (KY !== null) {
      const g = KY[i]; if (g > gt) continue;
      if (g > gt - GB) { const f = (gt - g) * ig; if ((i * .7548776662) % 1 > f * 1.4 + .08) continue; k = 1 - f; }
    }
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    if (test) { const d = s0 * px + s1 * py + s2 * pz + s3 - fy; if (d < 0) continue; if (d < RVB) { const k2 = 1 - d * ib; if (k2 > k) k = k2; } }
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5], two = nx === 0 && ny === 0 && nz === 0;
    let dn = 0;
    if (!two) { dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez); if (dn > 0 && (bkeep === 0 || ((i * .7548776662) % 1) > bkeep)) continue; }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const iz = F_ / zc;
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz; if (sx < 0 || sx >= 1920) continue;
    const sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz; if (sy < 0 || sy >= 1080) continue;
    if (occ(sx, sy, zc)) continue;
    let b;
    if (two) b = eb;
    else if (dn > 0) b = back;
    else {
      let fac = -dn / zc; if (fac > 1) fac = 1;
      const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
      b = .06 + amb + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
    }
    b *= zc < fade ? A - kf * zc : kfar;
    let r = cr, g = cg, bl = cb;
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const q = ((sy | 0) * 1920 + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
    if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    if (sp * iz * big > 6.5 && sx < 1919 && sy < 1079) {
      const R2 = R_ * .7, G2 = G_ * .7, B2 = B_ * .7;
      let q2 = q + 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
      q2 = q + 7680; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
    }
  }
}
/* draw a cloud: S model -> ship (null: in the ship frame); rv: subject to the reveal front; key/gt: the growth */
function drawM(ml, S, o, rv, key, gt) {
  const x = K.prep(S ? X.mul(WS, S) : WS); XM_ = x;
  const CH = ml.ch, SD = ml.sd, nl = ml.nl, Fl = K.C.fl, PX = o.px / K.DQ / Math.sqrt(Math.max(.05, o.keep));
  const ex = x[12], ey = x[13], ez = x[14];
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(x, mx, my, mz, rad)) continue;
    let test = false;
    if (rv && RV_ON) {
      const ys = S ? S.R[3] * mx + S.R[4] * my + S.R[5] * mz + S.T[1] : my;
      if (ys + rad < RV_Y) continue;
      test = ys - rad < RV_Y + RVB;
    }
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.02, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    const pxe = FOC > 0 && d > FOC ? PX * Math.pow(Math.min(2.4, d / FOC), 1.3) : PX;
    let li = nl - 1; while (li > 0 && ml.sp[li] * Fl / d > pxe * 1.3) li--;
    const i0 = ml.ch[q + 4 + li * 2], i1 = ml.ch[q + 5 + li * 2];
    if (i1 > i0) { runM(ml.lv[li], i0, i1, ml.sp[li], o, S, test, key ? key[li] : null, gt); NPM += i1 - i0; }
  }
}
const OA = { a: 1.3, fade: 30, keep: 1, size: .7, edge: .7, lime: 0, bk: 0, back: .1, px: 4.6, col: null };       // the arm
const OP = { a: 1.15, fade: 30, keep: 1, size: .7, edge: .66, lime: 0, bk: 0, back: .1, px: 4.8, col: null };     // machinery
const OM = { a: 1.9, fade: 30, keep: 1, size: .7, edge: 1.0, lime: 0, bk: 0, back: .12, px: 4.2, col: null, amb: .14 };   // the micro-arms
const OS = { a: .55, fade: 30, keep: 1, size: .7, edge: .42, lime: 0, bk: 0, back: .06, px: 5.4, col: null };     // the compartment
const OR = { a: 1.55, fade: 30, keep: 1, size: .8, edge: .8, lime: 0, bk: .12, back: .1, px: 3.9, col: null, amb: .06 };   // the round
const OL = { a: 1.5, fade: 30, keep: 1, size: .8, edge: .9, lime: 0, bk: .1, back: .12, px: 3.9, col: null, amb: .1 };     // the lattice

/* focus: in each beat the station at work drawn full, the rest sparse and dim */
const FPH = [0, 4.4, 10.8, 17.1, 20.15, 23.4];
const FKEEP = {
  rack: [1, .25, .2, .2, .2, .2], coat: [.5, 1, .3, .25, .25, .3], grow: [.3, .25, 1, .3, .3, .35], stat: [.3, .25, .3, 1, 1, .6],
  line: [.6, .7, .8, .8, .8, .5], lift: [.3, .2, .2, .2, .3, 1], arm: [1, .45, .3, .35, .6, 1], deck: [.8, .55, .55, .55, .6, .55],
};
const FW = {};
function focusAt(u) {
  for (const g in FKEEP) {
    let v = 0;
    for (let i = 0; i < FPH.length; i++) { const a = i ? E.ss(FPH[i] - .35, FPH[i] + .35, u) : 1, b = i < FPH.length - 1 ? E.ss(FPH[i + 1] - .35, FPH[i + 1] + .35, u) : 0; v += a * (1 - b) * FKEEP[g][i]; }
    FW[g] = v;
  }
}
const A0 = new Map();
function foc(o, w) { if (!A0.has(o)) A0.set(o, o.a); o.keep = w; o.a = A0.get(o) * (.3 + .7 * w); return o; }
function unfoc(o) { o.keep = 1; if (A0.has(o)) o.a = A0.get(o); return o; }

/* ---------- models ---------- */
const LV = [.01, .02, .04, .08, .16, .32], LF = [.005, .01, .02, .04, .08, .16], LB = [.024, .048, .096, .192, .384];
const LM = [.0007, .0014, .0028, .0056, .0112, .0224];     // the micro-arms and the fine fittings
let lod = null;
const scaleP = (P, k) => P.map(p => { const q = Object.assign({}, p); if (q.p) q.p = q.p.map(v => v.map(c => c * k)); if (q.a) q.a = q.a.map(c => c * k); if (q.st) q.st = q.st.map(([s, r]) => [s * k, r * k]); return q; });
function bolts(c, ax, r, n, P) {
  for (let k = 0; k < n; k++) {
    const a = (k + .5) / n * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const p = ax === 'x' ? [c[0], c[1] + ca, c[2] + sa] : [c[0] + ca, c[1], c[2] + sa], q = ax === 'x' ? [c[0] + Math.sign(c[0] || 1) * .008, p[1], p[2]] : [p[0], c[1] + .008, p[2]];
    P.push(G.cyl(p, q, .009, F({ caps: true })));
  }
  return P;
}
/* the arm's links at the old 16 kg arm's size (each in its joint frame, +y along the link), scaled by SA in build */
function armPrims() {
  const a1 = .15, h1 = .45, a2 = .68, d4 = .66, d6 = .09, P = {};
  P.base = [
    G.box([-.3, -.03 - .2, -.3], [.3, -.03, .3], { ds: 1.5 }),
    G.lathe([0, -.03, 0], [0, 1, 0], [[0, .23], [.15, .21]], { caps: true }),
    G.box([-.08, -.02, -.34], [.08, .1, -.21]),
    G.line([[-.3, -.15, -.301], [.3, -.15, -.301]], F()),
  ];
  bolts([0, .12, 0], 'y', .2, 12, P.base);
  P.turret = [
    G.lathe([0, .12, 0], [0, 1, 0], [[0, .205], [.1, .19]], { caps: true }),
    G.box([-.09, .2, -.15], [.09, .34, .06]),
    ...[-1, 1].map(s => G.box([s * .09, .2, -.13], [s * .165, .6, .28])),
    G.cyl([.165, h1, a1], [.29, h1, a1], .088, { caps: true }), G.cyl([.29, h1, a1], [.36, h1, a1], .062, { caps: true }),
    G.cyl([0, .22, -.18], [0, .46, -.18], .066, { caps: true }), G.cyl([-.06, .53, -.12], [.06, .53, -.12], .028, F()),
  ];
  bolts([.36, h1, a1], 'x', .045, 6, P.turret); bolts([-.165, h1, a1], 'x', .1, 10, P.turret);
  P.upper = [
    G.cyl([-.09, 0, 0], [.09, 0, 0], .125, { caps: true }),
    G.hex([[-.075, .07, -.09], [.075, .07, -.09], [.075, .07, .09], [-.075, .07, .09], [-.06, a2 - .07, -.07], [.06, a2 - .07, -.07], [.06, a2 - .07, .07], [-.06, a2 - .07, .07]], { ds: 1.1 }),
    G.cyl([-.075, a2, 0], [.075, a2, 0], .095, { caps: true }), G.cyl([.075, a2, 0], [.2, a2, 0], .062, { caps: true }),
    G.line([[-.0765, .14, 0], [-.0615, a2 - .12, 0]], F()), G.line([[.0765, .14, 0], [.0615, a2 - .12, 0]], F()),
    G.cyl([-.04, .27, -.092], [.04, .27, -.092], .024, F()),
  ];
  bolts([.09, 0, 0], 'x', .1, 10, P.upper); bolts([-.075, a2, 0], 'x', .075, 8, P.upper); bolts([.2, a2, 0], 'x', .045, 6, P.upper);
  P.fore = [
    G.box([-.08, -.22, -.085], [.08, .07, .095], { ds: 1.1 }),
    ...[[-.04, -.035], [.04, -.035], [0, .05]].map(([x, z]) => G.cyl([x, -.22, z], [x, -.32, z], .032, { caps: true })),
    G.line([[-.081, -.18, .0], [-.081, .05, .0]], F()),
  ];
  P.tube = [G.cyl([0, .07, 0], [0, d4 - .11, 0], .058, {}), G.lathe([0, .07, 0], [0, 1, 0], [[0, .068], [.035, .068]], F()),
    ...[-1, 1].map(s => G.box([s * .05, d4 - .13, -.045], [s * .076, d4 + .045, .045]))];
  P.wrist = [G.cyl([-.05, 0, 0], [.05, 0, 0], .048, { caps: true }), G.cyl([0, 0, 0], [0, d6 - .012, 0], .04, {})];
  P.hand = [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, .05], [.014, .05]], { caps: true }),
    G.box([-.11, .014, -.045], [.11, .082, .045]), G.box([-.16, .082, -.02], [.16, .098, .02]),
    G.box([-.04, .02, .045], [.04, .065, .072], F()), G.line([[-.1, .05, -.046], [.1, .05, -.046]], F()),
  ];
  // V-jaws: a notch that centres a 25 mm rod and a flat face for the sabot
  const finger = s => [G.box([0, .082, -.032], [s * .024, .228, .032]), G.box([0, .155, -.026], [-s * .008, .222, .026], F()),
    G.line([[-s * .009, .16, 0], [-s * .009, .218, 0]], F()), G.line([[-s * .0085, .17, -.012], [-s * .0085, .17, .012]], F()), G.line([[-s * .0085, .2, -.012], [-s * .0085, .2, .012]], F())];
  P.fingerR = finger(1); P.fingerL = finger(-1);
  // the track carriage under the base (the base's own frame): plate, rail shoes, the drive
  P.cart = [G.box([-.4, -.33, -.42], [.4, -.24, .42], { ds: 1.4 }), ...[-1, 1].flatMap(sx => [-1, 1].map(sz => G.box([sx * .29 - .05, -.42 + .04, sz * .3 - .07], [sx * .29 + .05, -.33, sz * .3 + .07]))),
    G.cyl([.4, -.3, .1], [.52, -.3, .1], .05, { caps: true }), G.box([-.4, -.33, -.42], [.4, -.31, .42], F({ edgeOnly: true }))];
  for (const k in P) P[k] = scaleP(P[k], SA);
  return P;
}
/* the deck: plating, frames, stringers, deckhead beams, the two bulkheads, light fittings; the arm's track; the
   line's rails */
function deckPrims() {
  const P = [], hw = (z, y) => P_.hullAt(z, y) - .12;
  for (let z = ZA + .1; z < ZF; z += .4) { const w = hw(z, YD); P.push(G.line([[-w, YD, z], [w, YD, z]])); }
  for (let x = -4.4; x <= 4.41; x += .4) { const L = []; for (let z = ZA + .1; z <= ZF - .09; z += .3) if (hw(z, YD) > Math.abs(x)) L.push([x, YD, z]); if (L.length > 1) P.push(G.line(L)); }
  for (let z = ZA + .6; z < ZF - .1; z += .6) for (const s of [-1, 1]) {
    const L = []; for (let y = YD; y <= YH + .001; y += .25) L.push([s * hw(z, y), y, z]);
    P.push(G.line(L));
    if (Math.abs(z - CELL[2]) > .4) { const w = hw(z, YH - .1); P.push(G.box([-w, YH - .24, z - .035], [w, YH - .04, z + .035], { edgeOnly: true })); }
  }
  for (const y of [-1.05, -.25, .55]) for (const s of [-1, 1]) { const L = []; for (let z = ZA; z <= ZF + .001; z += .3) L.push([s * hw(z, y), y, z]); P.push(G.line(L)); }
  for (const z of [ZA, ZF]) {
    const L = []; for (let y = YD; y <= YH + .001; y += .25) L.push([hw(z, y), y, z]);
    for (let y = YH; y >= YD - .001; y -= .25) L.push([-hw(z, y), y, z]);
    L.push(L[0]); P.push(G.line(L));
    for (let x = -4.2; x <= 4.21; x += .6) if (hw(z, YD) > Math.abs(x)) P.push(G.line([[x, YD, z], [x, YH, z]], F()));
  }
  for (const [x, z] of [[-1.2, 43.0], [1.2, 43.0], [-1.2, 46.8], [1.2, 46.8], [-1.2, 50.6], [1.2, 50.6]]) P.push(G.box([x - .07, YH - .32, z - .5], [x + .07, YH - .26, z + .5], F({ edgeOnly: true })));
  return P;
}
function trackPrims() {
  const P = [], z0 = ZC - .8, z1 = ZR + .8;
  for (const s of [-1, 1]) { P.push(G.box([XA + s * .29 - .03, YD, z0], [XA + s * .29 + .03, YD + .07, z1])); P.push(G.line([[XA + s * .29, YD + .071, z0], [XA + s * .29, YD + .071, z1]], F())); }
  for (let z = z0 + .1; z < z1; z += .45) P.push(G.box([XA - .38, YD, z - .04], [XA + .38, YD + .02, z + .04], F()));
  for (const z of [z0, z1]) P.push(G.box([XA - .36, YD, z - .06], [XA + .36, YD + .16, z + .06]));
  P.push(G.box([XA + .42, YD, z0], [XA + .56, YD + .1, z1], { edgeOnly: true }));          // the cable tray
  // the line's rails and its end stops
  const l0 = ZC - 1.5, l1 = ZR + 1.5;
  for (const s of [-1, 1]) P.push(G.box([XL + s * .2 - .025, YD, l0], [XL + s * .2 + .025, YD + .06, l1]));
  for (let z = l0 + .1; z < l1; z += .5) P.push(G.box([XL - .3, YD, z - .03], [XL + .3, YD + .015, z + .03], F()));
  for (const z of [l0, l1]) P.push(G.box([XL - .28, YD, z - .05], [XL + .28, YD + .2, z + .05]));
  return P;
}
/* the rod rack (ship frame, about the first rod's axis): base, two saddles with five V notches */
const RK = [.1, -.75];                                                         // the first rod's axis (x, y)
const RK_N = 5, RK_P = .075;
function rackPrims() {
  const P = [], x0 = RK[0], y0 = RK[1];
  P.push(G.box([x0 - .12, YD, ZC - .75], [x0 + RK_N * RK_P + .06, YD + .08, ZC + .75], { ds: 1.4 }));
  for (const dz of [-.62, .62]) {
    P.push(G.box([x0 - .08, YD + .08, ZC + dz - .04], [x0 + RK_N * RK_P + .02, y0 - .03, ZC + dz + .04], { ds: .9 }));
    for (let i = 0; i < RK_N; i++) { const x = x0 + i * RK_P; P.push(G.line([[x - .03, y0 + .015, ZC + dz - .04], [x, y0 - .015, ZC + dz - .04], [x + .03, y0 + .015, ZC + dz - .04]], F())); }
  }
  P.push(G.box([x0 - .1, YD + .08, ZC - .7], [x0 - .07, y0 + .1, ZC - .64]), G.box([x0 - .1, YD + .08, ZC + .64], [x0 - .07, y0 + .1, ZC + .7]));
  return P;
}
/* the shuttle (its frame: the rod's centre on the line, ship axes): bed, carriage, the two stocks' posts and
   housings; the quills are separate */
function shuttlePrims() {
  const P = [], yb = YD - YL;
  P.push(G.box([-.24, yb + .06, -1.25], [.24, yb + .2, 1.25], { ds: 1.3 }));
  for (const z of [-1.0, 1.0]) for (const s of [-1, 1]) P.push(G.box([s * .2 - .045, yb + .02, z - .1], [s * .2 + .045, yb + .07, z + .1]));
  for (const s of [-1, 1]) {
    const z = s * 1.11;
    P.push(G.box([-.024, yb + .2, z - .03], [.024, -.05, z + .03], { ds: .8 }));
    P.push(G.box([-.06, yb + .2, z - .08], [.06, yb + .3, z + .08]));
    P.push(G.cyl([0, 0, s * 1.06], [0, 0, s * 1.2], .036, { caps: true }));
    P.push(G.box([-.032, -.07, s * 1.075], [.032, -.03, s * 1.17]));
  }
  P.push(G.cyl([0, -.12, -1.25], [0, -.12, -1.42], .05, { caps: true }));          // the headstock's drive
  P.push(G.line([[.241, yb + .13, -1.2], [.241, yb + .13, 1.2]], F()));
  return P;
}
const quillH = () => [G.cyl([0, 0, -1.07], [0, 0, -1.012], .009, { caps: true }), G.lathe([0, 0, -1.012], [0, 0, 1], [[0, .006], [.012, .0004]], {})];
const quillT = () => [G.cyl([0, 0, 1.07], [0, 0, 1.03], .011, { caps: true }), G.lathe([0, 0, 1.0], [0, 0, 1], [[0, .007], [.03, .011]], {})];
/* a C-ring (round frame, axis z): sectors from angle a0 to a1 (the gap about angle 0, the bottom), r0..r1, z0..z1 */
function cring(P, r0, r1, z0, z1, a0, a1, n, o) {
  const at = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  for (let k = 0; k < n; k++) {
    const b0 = a0 + (a1 - a0) * k / n, b1 = a0 + (a1 - a0) * (k + 1) / n, C8 = [at(b0, r0, z0), at(b1, r0, z0), at(b1, r0, z1), at(b0, r0, z1), at(b0, r1, z0), at(b1, r1, z0), at(b1, r1, z1), at(b0, r1, z1)];
    // (edges as dense dotted hairlines, the faces a sparse fill)
    if (o && o.e) P.push(G.hex(C8, { edgeOnly: true }), G.hex(C8, { ds: o.e, noEdge: true })); else P.push(G.hex(C8, o));
  }
  return P;
}
/* the coater: its side beam on posts (ship frame), the head (round frame about the head's centre): the C-ring, the
   carriage and its bracket to the beam; the 24 micro-arms (separate links) */
const NMA = 24, MA_ROW = [.034, 0, -.034], MA_RB = .152, MA_RS = .142, ML1 = .072, ML2 = .064, MLN = .016;
const MA_TH = k => (k + .5) * TAU / 8;
function coaterPrims() {
  const P = [], xb = XL - .42;
  P.push(G.box([xb - .03, YL - .03, ZC - 1.45], [xb + .03, YL + .05, ZC + 1.45], { ds: .9 }));
  P.push(G.box([xb - .02, YL + .05, ZC - 1.42], [xb + .02, YL + .07, ZC + 1.42], F()));
  for (const dz of [-1.38, 0, 1.38]) P.push(G.box([xb - .035, YD, ZC + dz - .035], [xb + .035, YL - .03, ZC + dz + .035]), G.box([xb - .1, YD, ZC + dz - .1], [xb + .1, YD + .03, ZC + dz + .1]));
  for (let z = ZC - 1.3; z < ZC + 1.35; z += .26) P.push(G.line([[xb + .031, YL - .01, z], [xb + .031, YL + .03, z]], F()));
  return P;
}
function headPrims() {
  const P = [];
  cring(P, .155, .178, -.058, .058, 16 * DEG, 344 * DEG, 20, { e: 3.5 });
  for (const z of [-.058, .058]) P.push(P_.circ([0, 0, z], [0, 0, 1], .166, F()));
  // the bracket out to the carriage (angle 270°: port), the carriage on the beam
  P.push(...ebox([-.02, -.39, -.035], [.02, -.178, .035]));
  P.push(...ebox([-.06, -.47, -.08], [.09, -.38, .08]));
  // the arms' feed manifold and the status lights' strip
  P.push(G.lathe([0, 0, -.064], [0, 0, 1], [[0, .19], [.008, .19]], F()));
  return P;
}
/* a micro-arm's parts (each in its frame: +y along the link, the hinge on x) */
/* (edges as dense dotted hairlines, the faces a sparse fill) */
const ebox = (a, b) => [G.box(a, b, { edgeOnly: true }), G.box(a, b, { ds: 3, noEdge: true })];
const ecyl = (a, b, r) => [G.cyl(a, b, r, { ds: 3, noEdge: true, caps: true }), G.cyl(a, b, r, { edgeOnly: true })];
const maBase = () => [...ebox([-.011, -.012, -.011], [.011, .006, .011]), ...ecyl([-.0095, 0, 0], [.0095, 0, 0], .009)];
const maL1 = () => [...ebox([-.0045, .004, -.0065], [.0045, ML1 - .004, .0065]), ...ecyl([-.007, ML1, 0], [.007, ML1, 0], .0075), G.line([[.0046, .012, 0], [.0046, ML1 - .012, 0]], F())];
const maL2 = () => [...ebox([-.0035, .004, -.005], [.0035, ML2 - .003, .005]), ...ecyl([0, ML2 - .003, 0], [0, ML2 + .004, 0], .0042),
  G.cyl([0, ML2 + .004, 0], [0, ML2 + MLN, 0], .0011, { ds: 1.5 }), G.line([[.0036, .01, 0], [.0036, ML2 - .01, 0]], F())];
/* the grower (round frame about the sabot's middle at the station): C-ribs, stringers, end frames, legs; the
   deposition ring and its emitters (separate) */
const GR_ZC = -.07;
function growerPrims() {
  const P = [], zr = [-.8, -.56, -.32, -.08, .16, .4, .62];
  for (const z of zr) cring(P, .3, .322, z - .011, z + .011, 25 * DEG, 335 * DEG, 18, { e: 3 });
  for (const a of [60, 120, 180, 240, 300]) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); P.push(G.box([c * .311 - .008, s * .311 - .008, -.81], [c * .311 + .008, s * .311 + .008, .63], { ds: .8 })); }
  for (const z of [-.83, .65]) cring(P, .19, .322, z - .008, z + .008, 25 * DEG, 335 * DEG, 18, { e: 3 });
  const xd = YL - YD;                                                          // the deck at round x = +xd
  for (const z of [-.8, .62]) for (const s of [-1, 1]) { const a = s * 25 * DEG; P.push(G.box([Math.cos(a) * .31, s * .12 - .016, z - .016], [xd, s * .12 + .016, z + .016])); P.push(G.box([xd - .03, s * .12 - .07, z - .07], [xd, s * .12 + .07, z + .07])); }
  for (const s of [-1, 1]) P.push(G.box([xd - .09, s * .12 - .012, -.8], [xd - .06, s * .12 + .012, .62]));
  // fine: the chamber's seams and a panel of lights on the port side
  for (const z of zr) P.push(P_.circ([0, 0, z], [0, 0, 1], .2995, F()));
  P.push(G.box([-.06, -.335, -.3], [.06, -.322, .1], F()));
  return P;
}
function depoPrims() {
  const P = [];
  cring(P, .205, .228, -.022, .022, 22 * DEG, 338 * DEG, 18, { e: 3 });
  for (let k = 0; k < 16; k++) { const a = (30 + k * 20) * DEG, c = Math.cos(a), s = Math.sin(a); P.push(G.lathe([c * .205, s * .205, 0], [-c, -s, 0], [[0, .009], [.016, .004]], { caps: true })); }
  P.push(...ebox([-.02, -.3, -.02], [.02, -.228, .02]));                          // the arm to its rail on the 270° stringer
  return P;
}
/* the armature station (ship frame at the armature's z): two rams across the line (stands, barrels, rods, the
   gripper plates are separate) */
const ZAM = -.66;
function amStationPrims() {
  const P = [], z = ZR + ZAM;
  for (const s of [-1, 1]) {
    const x0 = XL + s * .6, x1 = XL + s * .92;
    P.push(G.cyl([x0, YL, z], [x1, YL, z], .045, { caps: true }), G.box([Math.min(x0, x1) + .05, YD, z - .07], [Math.max(x0, x1) - .05, YL - .04, z + .07], { ds: 1.2 }));
    P.push(G.box([Math.min(x0, x1), YD, z - .16], [Math.max(x0, x1), YD + .03, z + .16]));
    P.push(G.cyl([x1, YL, z], [x1 + s * .1, YL, z], .03, { caps: true }));
  }
  return P;
}
const amPlate = s => [G.box([0, -.07, -.05], [s * .03, .07, .05]), G.cyl([s * .03, 0, 0], [s * .5, 0, 0], .016, {})];
/* the inspection ring (round frame about its centre): C-ring, sensor heads, electrodes, the bracket and carriage;
   its side beam (ship frame) */
function ringPrims() {
  const P = [];
  cring(P, .25, .285, -.04, .04, 18 * DEG, 342 * DEG, 22, { e: 3.5 });
  for (let k = 0; k < 12; k++) { const a = (35 + k * 26) * DEG, c = Math.cos(a), s = Math.sin(a); P.push(G.box([c * .232 - .012, s * .232 - .012, -.018], [c * .25 + .012, s * .25 + .012, .018], F())); }
  for (const a of [60, 150, 210, 300]) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); P.push(G.cyl([c * .25, s * .25, 0], [c * .165, s * .165, 0], .005, { caps: true })); }
  P.push(...ebox([-.02, -.45, -.04], [.02, -.285, .04]), ...ebox([-.07, -.51, -.1], [.1, -.4, .1]));
  for (const z of [-.04, .04]) P.push(P_.circ([0, 0, z], [0, 0, 1], .268, F()));
  return P;
}
function ringBeamPrims() {
  const P = [], xb = XL - .48;
  P.push(G.box([xb - .03, YL - .03, ZR - 1.5], [xb + .03, YL + .05, ZR + 1.5], { ds: .9 }));
  for (const dz of [-1.45, 0, 1.45]) P.push(G.box([xb - .035, YD, ZR + dz - .035], [xb + .035, YL - .03, ZR + dz + .035]), G.box([xb - .1, YD, ZR + dz - .1], [xb + .1, YD + .03, ZR + dz + .1]));
  return P;
}
/* the strike-up (ship frame about the cell's axis): three guide columns, ties, the ram's barrel and pump, the
   scuttle's frame under the floor */
let COLS = null;
function liftPrims() {
  const P = [], cx = CELL[0], cz = CELL[2];
  for (const [x, z] of COLS) P.push(G.box([x - .022, YD, z - .022], [x + .022, YH - .05, z + .022], { ds: .8 }));
  for (const y of [YD + .03, -.75, .25, YH - .1]) P.push(G.line([[cx - .26, y, cz], [cx, y, cz - .27], [cx + .26, y, cz]]));
  P.push(G.box([cx - .32, YD, cz - .36], [cx + .32, YD + .05, cz + .1]));
  P.push(G.cyl([cx, YD + .05, cz], [cx, YD + .3, cz], .085, { caps: true }));
  P.push(G.box([cx - .34, YD, cz - 1.08], [cx + .34, YD + .6, cz - .62], { ds: 1.4 }));
  P.push(G.cyl([cx + .14, YD + .6, cz - .85], [cx + .14, YD + .86, cz - .85], .09, { caps: true }));
  P.push(G.line([[cx - .1, YD + .3, cz - .62], [cx - .1, YD + .2, cz - .3], [cx - .05, YD + .18, cz - .1]], F()), G.line([[cx + .02, YD + .45, cz - .62], [cx + .02, YD + .3, cz - .3], [cx + .03, YD + .26, cz - .1]], F()));
  P.push(G.box([cx - .3, YH - .07, cz - .3], [cx + .3, YH - .02, cz + .3], { edgeOnly: true }));
  P.push(G.box([cx - .34, YH - .2, cz - .34], [cx + .34, YH - .07, cz + .34], { edgeOnly: true }));
  return P;
}
/* the cradle (frame: its top centre; ship axes): a ring with a hole for the rod's tail and fins, three guide fingers
   up the sabot's flanks, the post, the yoke and its shoes */
function cradlePrims() {
  const P = [G.lathe([0, -.035, 0], [0, 1, 0], [[0, .15], [.035, .15]], { caps: false }), G.lathe([0, -.035, 0], [0, 1, 0], [[0, .052], [.035, .052]], {})];
  P.push(G.lathe([0, 0, 0], [0, 1, 0], [[0, .052], [.0001, .15]], {}));
  for (let k = 0; k < 3; k++) P.push(P_.boxY([Math.sin(k * TAU / 3 + PI / 3) * .155, .07, Math.cos(k * TAU / 3 + PI / 3) * .155], [.018, .1, .012], k * TAU / 3 + PI / 3));
  P.push(G.box([.15, -.06, -.03], [.24, -.01, .03]), G.cyl([.21, -.035, 0], [.21, -.42, 0], .03, {}));
  P.push(G.box([-.27, -.46, -.03], [.27, -.4, .03]), G.box([-.03, -.46, -.28], [.03, -.4, .0]));
  for (const [x, z] of [[-.26, 0], [.26, 0], [0, -.27]]) P.push(G.box([x - .045, -.49, z - .045], [x + .045, -.36, z + .045]));
  return P;
}
const leafPrims = s => [G.box([0, -.06, -.29], [s * .3, -.03, .29]), G.line([[s * .02, -.025, -.27], [s * .02, -.025, .27]], F())];

/* ---------- state ---------- */
let CELL = null, CELLAX = null, YCT = 0, R_UP = null, R_RACK = null, R_CELL = null;
const YCR0 = YD + .5;                                                          // the cradle's top, down (ship y)
const CLM = {}, QK = {}, GKEY = [];
const Q = new Float64Array(6), PT = [0, 0, 0];
function ik(p, roll, zt, q) {
  const dx = p[0] - XA, dz = p[2] - zt, r = Math.hypot(dx, dz);
  const th = Math.atan2(dx, dz), h = p[1] - YB - H1, w = r - LT - A1;
  const D2 = w * w + h * h, D = Math.sqrt(D2);
  const ca = E.clamp((A2 * A2 + D2 - D4 * D4) / (2 * A2 * D), -1, 1);
  const q2 = Math.atan2(w, h) - Math.acos(ca);
  const tf = Math.atan2(w - A2 * Math.sin(q2), h - A2 * Math.cos(q2));
  q[0] = th; q[1] = q2; q[2] = tf - q2; q[3] = 0; q[4] = PI / 2 - tf; q[5] = roll * DEG;
  return q;
}
let ZT = 0;
const QX = new Float64Array(6);
const ztAt = u => { const z0 = ZT; armAt(u, QX); const z = ZT; ZT = z0; return z; };
function armAt(u, q) {
  let s = PLAN[PLAN.length - 1];
  for (let i = 0; i < PLAN.length; i++) if (u < PLAN[i][1]) { s = PLAN[i]; break; }
  const w = kk(u, s[0], s[1]), a = PZ[s[3]], b = PZ[s[4] || s[3]];
  ZT = a.zt + (b.zt - a.zt) * w;
  if (s[2] === 'L') { for (let k = 0; k < 3; k++) PT[k] = a.p[k] + (b.p[k] - a.p[k]) * w; ik(PT, a.roll + (b.roll - a.roll) * w, ZT, q); }
  else { const qa = QK[s[3]], qb = QK[s[4] || s[3]]; for (let k = 0; k < 6; k++) q[k] = qa[k] + (qb[k] - qa[k]) * w; }
  return q;
}
/* the arm's link frames (model -> ship) for joint angles q, the base at track z */
const LK = {};
function fk(q, zt) {
  LK.base = X.make(R.I(), [XA, YB, zt]);
  LK.turret = X.mul(LK.base, X.make(R.y(q[0])));
  LK.upper = X.mul(LK.turret, X.make(R.x(q[1]), [0, H1, A1]));
  LK.fore = X.mul(LK.upper, X.make(R.x(q[2]), [0, A2, 0]));
  LK.tube = X.mul(LK.fore, X.make(R.y(q[3])));
  LK.wrist = X.mul(LK.tube, X.make(R.x(q[4]), [0, D4, 0]));
  LK.hand = X.mul(LK.wrist, X.make(R.y(q[5]), [0, D6, 0]));
  return LK;
}
const RG = R.z(PI);                                                            // round -> hand: X -x, Y -y (along the gripper), Z z
const heldRF = (L, zg) => X.mul(L.hand, X.make(RG, [0, LG, -zg]));
/* the coater's micro-arms: per arm the link frames (round frame of the line) and the tip */
const MA = [];
const MTIP = new Float64Array(NMA * 3), MCON = new Float64Array(NMA);
function microAt(t, zH, dep) {
  for (let a = 0; a < NMA; a++) {
    const m = MA[a], th = m.th, c = Math.cos(th), s = Math.sin(th), zb = MA_ROW[m.row];   // (the head's frame)
    // the cycle: lay (in contact, dragged along), lift, run back, down
    const cyc = ((t / .14 + m.ph) % 1 + 1) % 1;
    let da, lift;
    if (cyc < .32) { da = -.011 + .022 * E.ss(0, .32, cyc); lift = 0; }
    else if (cyc < .46) { da = .011; lift = .016 * E.ss(.32, .46, cyc); }
    else if (cyc < .8) { da = .011 - .022 * E.ss(.46, .8, cyc); lift = .016; }
    else { da = -.011; lift = .016 * (1 - E.ss(.8, 1, cyc)); }
    lift = E.mix(.034, lift, dep); da *= dep;
    MCON[a] = dep > .9 && cyc < .32 ? 1 - Math.abs(cyc - .16) / .16 * .5 : 0;
    // the planar arm in (w inward, along z): shoulder at r MA_RS, wrist W = tip - needle
    const wT = MA_RS - (RGR.ROD_R + .0004) - lift, aW = da, L2e = ML2 + MLN;
    const wx = wT, ax = aW, Dd = Math.min(ML1 + L2e - 1e-4, Math.hypot(wx, ax)), ph = Math.atan2(ax, wx);
    const be = Math.acos(E.clamp((ML1 * ML1 + Dd * Dd - L2e * L2e) / (2 * ML1 * Dd), -1, 1)), sg = m.row === 1 ? -1 : 1;
    const al = ph + sg * be, ew = Math.cos(al) * ML1, ea = Math.sin(al) * ML1;
    const d2w = wx - ew, d2a = ax - ea, l2 = Math.hypot(d2w, d2a), u2w = d2w / l2, u2a = d2a / l2;
    // 3D: inward e_w = (-c, -s, 0), along e_a = (0, 0, 1), hinge e_h = (-s, c, 0)
    const sx = c * MA_RS, sy = s * MA_RS;
    const d1 = [-c * Math.cos(al), -s * Math.cos(al), Math.sin(al)], d2 = [-c * u2w, -s * u2w, u2a], h = [-s, c, 0];
    const fr = (d, o) => { const z_ = V.cross(h, d); return X.make([h[0], d[0], z_[0], h[1], d[1], z_[1], h[2], d[2], z_[2]], o); };
    m.L1 = fr(d1, [sx, sy, zb]);
    m.L2 = fr(d2, [sx - c * ew, sy - s * ew, zb + ea]);
    m.B = fr([-c, -s, 0], [c * MA_RB, s * MA_RB, zb]);
    const tw = MA_RS - wT;
    MTIP[a * 3] = c * tw; MTIP[a * 3 + 1] = s * tw; MTIP[a * 3 + 2] = zb + aW;
  }
}
/* the state at u: every frame (ship) and value, filled each frame and read by draw, FX, tags */
const ST = {};
function stateAt(u) {
  const s = ST;
  s.q = armAt(u, Q); s.zt = ZT; fk(s.q, s.zt); s.grip = gripAt(u);
  s.zs = shuttleZ(u); s.SH = X.make(R_LINE, [XL, YL, s.zs]);
  s.quill = quillAt(u);
  s.tau = tauAt(u); s.zH = headZ(s.tau); s.dep = depAt(s.tau); s.laid = laidAt(s.tau);
  s.HEAD = X.mul(X.make(R_LINE, [XL, YL, ZC]), tr(0, 0, s.zH));
  s.coat = s.tau > .25 && s.tau < CO_T1 + .3;
  if (s.coat) microAt(s.tau, s.zH, s.dep);
  s.gt = growAt(u); s.zD = depoZ(s.gt);
  s.DEPO = X.mul(X.make(R_LINE, [XL, YL, ZG]), tr(0, 0, s.zD));
  s.amc = armClose(u); s.amb = ramBack(u);
  s.zI = ringZ(u); s.RING = X.mul(X.make(R_LINE, [XL, YL, ZR]), tr(0, 0, s.zI));
  s.cr = cradleAt(u);
  // the round: in the rack, held, on the shuttle, held, on the strike-up, in the cell
  s.held = (u >= U.grip1 && u < U.load) || (u >= U.unl && u < U.place);
  if (u < U.grip1) s.RF = X.make(R_RACK, [RK[0], RK[1], ZC]);
  else if (u < U.load) s.RF = heldRF(LK, 0);
  else if (u < U.unl) s.RF = s.SH;
  else if (u < U.place) s.RF = heldRF(LK, ZGRIP);
  else if (u < U.up1) s.RF = X.make(rUpAt(kk(u, U.up0 + .2, U.up1 - .1)), [CELL[0], s.cr + .7, CELL[2]]);
  else s.RF = X.make(R_CELL, CELL.slice());
  s.sct = kk(u, U.sct0, U.sct1) * (1 - kk(u, U.sctC0, U.sctC1));
  // the circuit's glow: lit as it is laid, then the charge from the ring
  const cs = kk(u, U.riS0, U.riS0 + .3);
  s.glowLay = s.tau > CO_T0 && s.tau < CO_T1 + .4 ? .45 * (1 - E.ss(CO_T1, CO_T1 + .4, s.tau)) : 0;
  // the circuit tested once it is laid: a pulse runs the traces tail to nose
  s.test = s.tau > CO_T1 + .25 ? E.ss(CO_T1 + .25, CO_T1 + .4, s.tau) * (1 - E.ss(CO_T1 + .9, CO_T1 + 1.6, s.tau)) : 0;
  s.charged = u < U.riS0 ? -9 : u < U.riS1 ? s.zI + .02 : 9;
  s.glow = u < U.riS1 ? .1 * cs : E.mix(1, .45, kk(u, U.riS1 + .3, U.riS1 + 2.2)) * (1 - kk(u, U.up1 - .3, LEN - .5));
  return s;
}
/* the round's attitude on the cradle: stood up as the arm left it, turned about its axis onto the cell's as it rises */
let R_TURN = null;
function rUpAt(w) {
  if (!R_TURN) { const zU = [R_UP[2], R_UP[5], R_UP[8]], x0 = [R_UP[0], R_UP[3], R_UP[6]], x1 = [R_CELL[0], R_CELL[3], R_CELL[6]];
    R_TURN = Math.abs(V.dot(zU, [R_CELL[2], R_CELL[5], R_CELL[8]])) > .999 ? Math.atan2(V.dot(V.cross(x0, x1), zU), V.dot(x0, x1)) : 0; }
  return w <= 0 || !R_TURN ? R_UP : w >= 1 ? R_CELL : R.mul(R_UP, R.z(R_TURN * w));
}
function cradleAt(u) {
  if (u < U.up0) return YCR0;
  if (u < U.dn0) return E.mix(YCR0, YCT, kk(u, U.up0, U.up1));
  return E.mix(YCT, YCR0 + .4, kk(u, U.dn0, U.dn1));
}
const frontAt = u => u < U.cl0 ? E.mix(1.35, YD - .3, kk(u, U.rv0, U.rv1)) : E.mix(YD - .3, 1.35, kk(u, U.cl0, U.cl1));

/* ---------- build ---------- */
const TG = {};
function build(ctx) {
  K = ctx.K; P_ = ctx.P_; LIME = ctx.LIME; HOT = ctx.HOT; WH = ctx.WH; T_AT = ctx.T_LD || T_AT;
  lod = (p, cs, lv) => P_.lod(p, cs || .5, lv);
  YH = P_.FL;
  if (!RGR.CL.rod) RGR.build({ K, P_, LIME, HOT, WH });
  // the cell the loader takes next: the mount's (RGP.MAG_CELL = {p, ax}: the round's centre and its nose's
  // direction, ship frame), else the drum's cell 01 before it indexes (the round's tail on the drum's base)
  const MC = P_.MAG_CELL;
  if (MC && MC.p) { CELL = MC.p.slice(); CELLAX = V.norm(MC.ax || [0, 1, 0]); }
  else { const a0 = AZ + PI - PI / 6; CELL = [Math.sin(a0) * P_.DRUM_R, P_.DRUM_Y + .07 + 1.0, P_.GZ + Math.cos(a0) * P_.DRUM_R]; CELLAX = [0, 1, 0]; }
  YCT = CELL[1] - .7 * CELLAX[1];
  COLS = [[CELL[0] - .26, CELL[2]], [CELL[0] + .26, CELL[2]], [CELL[0], CELL[2] - .27]];
  // the arm's poses (the cell's place needs CELL)
  const CXp = CELL[0], CZp = CELL[2], yPl = YCR0 + .7 + ZGRIP;
  const pose = (p, roll, zt) => ({ p, roll, zt });
  Object.assign(PZ, {
    home: pose([XA + .75, .15, ZC], 0, ZC), rkA: pose([RK[0] - .3, RK[1], ZC], 90, ZC), rkG: pose([RK[0], RK[1], ZC], 90, ZC), rkU: pose([RK[0], RK[1] + .36, ZC], 90, ZC),
    lnA: pose([XL, YL + .48, ZC], 90, ZC), lnP: pose([XL, YL, ZC], 90, ZC), lnR: pose([XL + .36, YL, ZC], 90, ZC),
    pk1: pose([XA - .75, .15, ZC], 90, ZC), pk2: pose([XA - .75, .15, ZR + ZGRIP], 90, ZR + ZGRIP),
    unA: pose([XL + .36, YL, ZR + ZGRIP], 90, ZR + ZGRIP), unG: pose([XL, YL, ZR + ZGRIP], 90, ZR + ZGRIP), unU: pose([XL, YL + .42, ZR + ZGRIP], 90, ZR + ZGRIP),
    unR: pose([XL + .5, YL + .5, ZR + ZGRIP], 90, ZR + ZGRIP),
    stA: pose([CXp, yPl + .14, CZp], 180, CZp), stP: pose([CXp, yPl, CZp], 180, CZp), stR: pose([CXp - .32, yPl, CZp], 180, CZp), home2: pose([XA + .75, .15, CZp], 180, CZp),
  });
  for (const k in PZ) QK[k] = ik(PZ[k].p, PZ[k].roll, PZ[k].zt, new Float64Array(6));
  // the round's attitude in the rack and stood on the strike-up: the held frame at those poses
  fk(QK.rkG, PZ.rkG.zt); R_RACK = heldRF(LK, 0).R;
  fk(QK.stP, PZ.stP.zt); R_UP = heldRF(LK, ZGRIP).R;
  { fk(QK.lnP, PZ.lnP.zt); const Lh = heldRF(LK, 0); let e = 0; for (let i = 0; i < 9; i++) e = Math.max(e, Math.abs(Lh.R[i] - R_LINE[i])); RGM.err = { line: +e.toFixed(4), at: Lh.T.map(v => +v.toFixed(3)) }; }
  // in the cell: the drum's own attitude for its rounds (the film's ROT_UP: X to stbd, Y aft) when the cell is
  // upright (the cradle turns the round onto it as it rises), else the cell's own (MAG_CELL.R), else turned onto its axis
  if (MC && MC.R) R_CELL = MC.R.slice();
  else if (Math.abs(CELLAX[1]) > .999) R_CELL = R.x(-PI / 2);
  else { const z0 = [R_UP[2], R_UP[5], R_UP[8]], ax = V.norm(V.cross(z0, CELLAX)), an = Math.acos(E.clamp(V.dot(z0, CELLAX), -1, 1)), c = Math.cos(an), s = Math.sin(an), t = 1 - c, [x, y, z] = ax;
    R_CELL = R.mul([t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c], R_UP); }
  // the micro-arms
  for (let a = 0; a < NMA; a++) MA.push({ th: MA_TH(a % 8), row: Math.floor(a / 8), ph: (a * .618034 + Math.floor(a / 8) * .33) % 1, L1: null, L2: null, B: null });
  // clouds
  const A = armPrims();
  for (const k in A) CLM[k] = lod(A[k], .45, k === 'hand' || k.startsWith('finger') ? LF : LV);
  CLM.deck = lod(deckPrims(), 1.2, LB); CLM.track = lod(trackPrims(), 1.0, LB);
  CLM.rack = lod(rackPrims(), .5, LF); CLM.shuttle = lod(shuttlePrims(), .4, LF);
  CLM.quillH = lod(quillH(), .1, LM); CLM.quillT = lod(quillT(), .1, LM);
  CLM.coater = lod(coaterPrims(), .6, LF); CLM.head = lod(headPrims(), .12, LM.map(v => v * 2.4));
  CLM.maB = lod(maBase(), .05, LM); CLM.maL1 = lod(maL1(), .05, LM); CLM.maL2 = lod(maL2(), .05, LM);
  CLM.grower = lod(growerPrims(), .3, LF.map(v => v * 1.4)); CLM.depo = lod(depoPrims(), .12, LM.map(v => v * 2.6));
  CLM.amSt = lod(amStationPrims(), .4, LF); CLM.amPA = lod(amPlate(1), .1, LM.map(v => v * 2.6)); CLM.amPB = lod(amPlate(-1), .1, LM.map(v => v * 2.6));
  CLM.ring = lod(ringPrims(), .15, LM.map(v => v * 3)); CLM.ringBeam = lod(ringBeamPrims(), .6, LF);
  CLM.lift = lod(liftPrims(), .6, LF.map(v => v * 1.6)); CLM.cradle = lod(cradlePrims(), .3, LF); CLM.leafA = lod(leafPrims(1), .4); CLM.leafB = lod(leafPrims(-1), .4);
  // the lattice's growth keys: along the sabot from its rear, a little later outward, jittered per lattice cell
  for (let k = 0; k < 3; k++) {
    const ml = RGR.CL.seg[k];
    GKEY[k] = ml.lv.map(P => {
      const n = P.length / 6, KY = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = P[i * 6], y = P[i * 6 + 1], z = P[i * 6 + 2], r = Math.hypot(x, y);
        const zn = (z - RGR.SAB_Z0) / RGR.SAB_LEN, rn = E.clamp((r - RGR.R_IN) / (RGR.SAB_R - RGR.R_IN), 0, 1);
        const ci = Math.floor(r / .03), ck = Math.floor((z - RGR.SAB_Z0) / .0244), cj = Math.floor((Math.atan2(y, x) + PI) * Math.max(.03, r) / .024);
        KY[i] = .8 * zn + .13 * rn + .07 * K.hh(ci * 3.7 + cj * 1.31 + k * 11, ck * .77);
      }
      return KY;
    });
  }
  for (const k of ['ROD', 'ROB', 'COA', 'TRC', 'MAR', 'GRW', 'SAB', 'LAT', 'AMS', 'ARM', 'INS', 'FIN', 'AR2', 'SB2', 'TR2', 'RD2', 'NOS', 'STK', 'CEL']) TG[k] = K.mkTag();
  BX = {
    FIN: [[-.036, -.036, -1.0], [.036, .036, -.86]], ARM: [[-.09, -.14, RGR.ARM_Z0], [.09, .14, RGR.ARM_Z1]], SAB: [[-.14, -.14, RGR.SAB_Z0], [.14, .14, RGR.SAB_Z1]],
    ROD: [[-.013, -.013, -1.0], [.013, .013, 1.0]], NOS: [[-.013, -.013, RGR.NOSE_Z], [.013, .013, 1.0]],
  };
  CAMK = CAM_KEYS();
  FOLW = FOLLOW();
  camPrep(ctx);
  RGM.cues = CUES(ctx.STAGE.SFX);
}
/* the camera's keys [u, eye, target, fov] (ship frame, before the follow offset) */
function CAM_KEYS() {
  const H = t => ZC + headZ(tauAt(t)), D = t => ZG + depoZ(growAt(t)), Rz = t => ZR + ringZ(t), CX = CELL[0], CZ = CELL[2];
  return [
    [.95, [2.3, 2.9, 47.3], [-.05, -.3, 45.0], 48],
    [1.55, [1.95, 1.05, 43.3], [-.3, -.6, 43.6], 47],
    [2.0, [1.7, .5, 42.1], [-.35, -.65, 43.5], 45],
    [2.45, [1.55, .35, 42.15], [-.25, -.72, 43.45], 42],
    [3.0, [.95, .75, 41.7], [-1.0, -.55, 43.4], 46],
    [3.7, [-.35, .3, 41.85], [-1.85, -.55, 43.2], 44],
    [4.35, [-1.4, -.25, 42.1], [-2.1, -.65, 42.85], 40],
    [5.0, [XL + .62, YL + .3, H(5.0) - .55], [XL, YL, H(5.0) - .02], 40],
    [5.8, [XL + .48, YL + .14, H(5.8) - .22], [XL, YL - .005, H(5.8) - .05], 36],
    [7.5, [XL + .4, YL + .19, H(7.5) - .12], [XL, YL + .005, H(7.5) - .05], 34],
    [8.4, [XL + .62, YL + .32, H(8.4) - .45], [XL, YL, H(8.4) - .02], 40],
    [9.5, [-.8, .15, ZC - .9], [-2.1, -.65, ZC + .1], 44],
    [10.6, [-.75, .05, ZC + .4], [-2.1, -.68, ZC + .9], 44],
    [12.2, [-1.25, -.2, ZG - 1.2], [-2.1, -.62, ZG - .55], 40],
    [13.2, [XL + .5, YL + .22, D(13.2) + .38], [XL, YL - .01, D(13.2) - .08], 36],
    [15.0, [XL + .58, YL + .3, D(15.0) + .3], [XL, YL, D(15.0) - .16], 38],
    [16.4, [-.95, .2, ZG - 1.0], [-2.1, -.66, ZG], 42],
    [17.6, [-.9, .1, ZG + .6], [-2.1, -.66, ZG + 1.4], 44],
    [18.6, [-1.3, -.2, ZR - 1.6], [-2.1, -.66, ZR - .7], 40],
    [19.5, [-1.6, -.38, ZR - 1.25], [-2.1, -.66, ZR - .66], 36],
    [20.4, [-1.2, -.1, ZR - 1.8], [-2.1, -.62, ZR - .95], 42],
    [21.5, [XL + .55, YL + .25, Rz(21.5) - .62], [XL, YL, Rz(21.5) + .05], 38],
    [22.8, [XL + .42, YL + .2, Rz(22.8) - .5], [XL, YL, Rz(22.8) + .02], 36],
    [23.6, [-.45, .45, ZR + 1.3], [-1.9, -.5, ZR], 46],
    [24.8, [.2, .7, ZR + 1.2], [-1.4, -.35, ZR - .6], 48],
    [26.0, [1.5, .5, CZ + 1.9], [-.2, -.5, CZ], 48],
    [26.9, [1.6, .2, CZ + 1.8], [CX, -.3, CZ], 46],
    [28.2, [1.85, 2.6, CZ + 1.7], [CX, 1.6, CZ], 44],
    [28.95, [2.45, 5.0, CZ + 1.0], [CX - .1, 2.3, CZ], 42],
  ];
}
/* the follow windows: the coater's head, the shuttle's runs, the deposition ring, the inspection ring */
function FOLLOW() {
  return [
    [4.45, 9.0, .5, u => [0, 0, ZC + headZ(tauAt(u))]],
    [10.6, 12.3, .3, u => [0, 0, shuttleZ(u)]],
    [12.6, 15.2, .45, u => [0, 0, ZG + depoZ(growAt(u))]],
    [16.95, 18.65, .3, u => [0, 0, shuttleZ(u)]],
    [20.5, 23.1, .35, u => [0, 0, ZR + ringZ(u)]],
  ];
}

/* ---------- draw ---------- */
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0], QV = new Float64Array(6), QW = new Float64Array(6);
const WP = (S, p) => X.ap(X.mul(WS, S), p);
const LOPT = { glow: 0, T: 0, laid: 9, a: 1, Ls: null, cut: -99, sp: 1.6, n: 2, white: .3, fresh: .04, kinds: 7, back: 0, tail: .12, sync: 0 };
let PRF = null, pt = 0;
const pk = k => { if (!PRF) return; const t = performance.now(); PRF[k] = (PRF[k] || 0) + t - pt; pt = t; };
function drawRound(s, u, o, ctx) {
  const RC = RGR.CL, RF = s.RF;
  pk('pre-round'); drawM(RC.rod, RF, o, true); pk('r.rod');
  // the sabot: growing in the grower, whole after it
  if (s.gt > 0) {
    const g = s.gt < 1.05 ? s.gt : -1;
    const lo = OL; lo.lime = 0; lo.a = OL_A * (o.a / OR_A); lo.keep = o.keep;
    for (let k = 0; k < 3; k++) drawM(RC.seg[k], RF, lo, true, g > 0 ? GKEY[k] : null, g);
  }
  pk('r.sabot');
  // the armature: its halves on the rams, then on the round
  {
    const off = .36 * (1 - s.amc), Lb = u < U.unl ? X.make(R_LINE, [XL, YL, ZR]) : RF;
    const l0 = o.lime; o.lime = Math.max(l0, .8 * lock(u, U.fuse) + .25 * kk(u, U.fuse, U.fuse + .2) * (1 - kk(u, U.fuse + .5, U.fuse + 1.5)));
    drawM(RC.armA, X.mul(Lb, tr(0, off, 0)), o, true); drawM(RC.armB, X.mul(Lb, tr(0, -off, 0)), o, true); o.lime = l0;
  }
  pk('r.arm');
  // the circuit: laid in the coater, lit by the charge
  const L = LOPT; L.T = ctx.T; L.Ls = RF; L.cut = RV_ON ? RV_Y : -99; L.a = Math.min(1.2, o.a / 1.3) * Math.max(.25, o.keep); L.kinds = 7;
  if (s.laid > -8) {
    const RFw = X.mul(WS, RF);
    L.laid = s.laid; L.glow = Math.max(s.glowLay, s.glow * .2); L.sp = .7; L.n = 3; L.white = .36; L.fresh = .06; L.back = s.laid < 8 ? .45 : 0; L.tail = .07;
    L.T = s.laid < 8 ? s.tau : ctx.T;
    RGR.lines(RFw, L);
    L.back = 0; L.tail = .12; L.T = ctx.T;
    if (s.test > .01 && s.laid > 8) { L.laid = 9; L.glow = s.test; L.sp = 3.2; L.n = 1; L.white = .1; L.tail = .3; L.sync = 1; L.T = s.tau - CO_T1 - .25; RGR.lines(RFw, L); L.tail = .12; L.sync = 0; L.T = ctx.T; }
    if (s.charged > -8) { L.laid = s.charged; L.glow = u < U.riS1 ? 1 : s.glow; L.sp = 2.4; L.n = 6; L.white = .3; L.fresh = .07; L.tail = .2; RGR.lines(RFw, L); L.tail = .12; }
  }
}
const OL_A = 1.5, OR_A = 1.55;
function draw(u, ctx) {
  PRF = RGM.prof || null; if (PRF) pt = performance.now();
  WS = ctx.Ws; FOC = ctx.RO.foc || 0;
  const s = stateAt(u);
  RV_Y = frontAt(u); RV_ON = RV_Y > YD - .29;
  if (u < U.up1 && ctx.st) ctx.st.rnd = 3;                                   // the drum's cell stays empty until the round is in it
  focusAt(u);
  pk('state');
  // the deck, the track, the line's rails
  OS.lime = 0; foc(OS, FW.deck); drawM(CLM.deck, null, OS, true); drawM(CLM.track, null, OS, true); unfoc(OS); pk('deck');
  // the strike-up and the scuttle
  foc(OP, FW.lift); OP.lime = 0; drawM(CLM.lift, null, OP, true);
  OP.lime = .5 * lock(u, U.latch); drawM(CLM.cradle, tr(CELL[0], s.cr, CELL[2]), OP, true); OP.lime = 0;
  drawM(CLM.leafA, tr(CELL[0] + .3 * s.sct, YH, CELL[2]), OP, true); drawM(CLM.leafB, tr(CELL[0] - .3 * s.sct, YH, CELL[2]), OP, true);
  pk('lift');
  // the rack and its rods (the first one leaves)
  foc(OP, FW.rack); drawM(CLM.rack, null, OP, true);
  foc(OR, FW.rack);
  for (let i = 1; i < RK_N; i++) drawM(RGR.CL.rod, X.make(R_RACK, [RK[0] + i * RK_P, RK[1], ZC]), OR, true);
  unfoc(OR); pk('rack');
  // the line: the shuttle and its quills
  foc(OP, FW.line); drawM(CLM.shuttle, X.make(R.I(), [XL, YL, s.zs]), OP, true);
  OP.lime = .8 * lock(u, U.cen1); drawM(CLM.quillH, X.mul(s.SH, tr(0, 0, -.045 * (1 - s.quill))), OP, true); drawM(CLM.quillT, X.mul(s.SH, tr(0, 0, .045 * (1 - s.quill))), OP, true); OP.lime = 0;
  pk('line');
  // the coater: beam, head, micro-arms
  foc(OP, FW.coat); drawM(CLM.coater, null, OP, true); drawM(CLM.head, s.HEAD, OP, true);
  if (s.coat) {
    // the arms on the far side of the rod drawn sparse and dim (the near ones read against them)
    const Hw = X.mul(WS, s.HEAD), e = K.C.eye, ax = X.dir(Hw, [0, 0, 1]);
    let hx = Hw.T[0] - e[0], hy = Hw.T[1] - e[1], hz = Hw.T[2] - e[2]; const ha = hx * ax[0] + hy * ax[1] + hz * ax[2]; hx -= ha * ax[0]; hy -= ha * ax[1]; hz -= ha * ax[2];
    const hl = Math.max(1e-6, Math.hypot(hx, hy, hz));
    for (let a = 0; a < NMA; a++) {
      // the arms in front of the rod and behind it drawn sparser and dimmer: the ones above and below it read clear
      const m = MA[a], d = X.dir(Hw, [Math.cos(m.th), Math.sin(m.th), 0]), far = (d[0] * hx + d[1] * hy + d[2] * hz) / hl;
      foc(OM, FW.coat * (far < -.55 ? .5 : far > .55 ? .6 : 1));
      OM.lime = .55 * MCON[a];
      drawM(CLM.maB, X.mul(s.HEAD, m.B), OM, true); drawM(CLM.maL1, X.mul(s.HEAD, m.L1), OM, true); drawM(CLM.maL2, X.mul(s.HEAD, m.L2), OM, true);
    }
    OM.lime = 0; unfoc(OM);
  }
  pk('coater');
  // the grower and its deposition ring
  foc(OP, FW.grow); drawM(CLM.grower, X.make(R_LINE, [XL, YL, ZG + GR_ZC]), OP, true);
  drawM(CLM.depo, s.DEPO, OP, true);
  pk('grower');
  // the armature station, the inspection ring
  foc(OP, FW.stat); drawM(CLM.amSt, null, OP, true);
  { const off = .36 * (1 - s.amc) + .3 * s.amb, Lr = X.make(R.I(), [XL, YL, ZR + ZAM]);
    drawM(CLM.amPA, X.mul(Lr, tr(.14 + off, 0, 0)), OP, true); drawM(CLM.amPB, X.mul(Lr, tr(-.14 - off, 0, 0)), OP, true); }
  drawM(CLM.ringBeam, null, OP, true);
  drawM(CLM.ring, s.RING, OP, true);
  unfoc(OP);
  pk('station');
  // the arm
  const q = s.q;
  armAt(u + .03, QV); armAt(u - .03, QW); fk(q, s.zt);
  foc(OA, FW.arm); OA.lime = 0;
  drawM(CLM.cart, LK.base, OA, true); drawM(CLM.base, LK.base, OA, true); drawM(CLM.turret, LK.turret, OA, true); drawM(CLM.upper, LK.upper, OA, true);
  drawM(CLM.fore, LK.fore, OA, true); drawM(CLM.tube, LK.tube, OA, true); drawM(CLM.wrist, LK.wrist, OA, true); drawM(CLM.hand, LK.hand, OA, true);
  drawM(CLM.fingerR, X.mul(LK.hand, tr(s.grip, 0, 0)), OA, true); drawM(CLM.fingerL, X.mul(LK.hand, tr(-s.grip, 0, 0)), OA, true);
  unfoc(OA);
  pk('arm');
  // the round
  OR.lime = .35 * lock(u, U.cen1) + .6 * lock(u, U.latch);
  const fadeEnd = 1 - kk(u, LEN - .45, LEN);
  if (u >= U.up1) { OR.a = OR_A * fadeEnd; OR.keep = Math.max(.05, fadeEnd); }
  drawRound(s, u, OR, ctx);
  OR.a = OR_A; OR.keep = 1; OR.lime = 0;
  pk('round');
  drawFX(u, s, ctx, q); pk('fx');
}

/* ---------- FX ---------- */
const MOTORS = [   // [link, centre, axis (local), radius, joint index, gear ratio] (at the arm's scale)
  ['turret', [0, .46 * SA, -.18 * SA], [0, 1, 0], .05 * SA, 0, 40], ['turret', [.36 * SA, H1, A1], [1, 0, 0], .05 * SA, 1, 40], ['upper', [.2 * SA, A2, 0], [1, 0, 0], .05 * SA, 2, 40],
  ['fore', [-.04 * SA, -.32 * SA, -.035 * SA], [0, -1, 0], .025 * SA, 3, 30], ['fore', [.04 * SA, -.32 * SA, -.035 * SA], [0, -1, 0], .025 * SA, 4, 30], ['fore', [0, -.32 * SA, .05 * SA], [0, -1, 0], .025 * SA, 5, 30],
];
const perpOf = d => { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const U_ = V.norm(V.cross(d, a)); return [U_, V.cross(d, U_)]; };
function ramLines(a, b, rc, rr, lc, lit, A) {
  const d = V.sub(b, a), L = V.len(d); if (L < .01) return;
  const f = V.mul(d, 1 / L), [U_, W_] = perpOf(f), c = Math.min(lc, L - .02), col = lit > .05 ? LIME : WH;
  for (let k = 0; k < 4; k++) {
    const an = k * PI / 2 + .4, cs = Math.cos(an) * rc, sn = Math.sin(an) * rc, ox = U_[0] * cs + W_[0] * sn, oy = U_[1] * cs + W_[1] * sn, oz = U_[2] * cs + W_[2] * sn;
    K.lineW(a[0] + ox, a[1] + oy, a[2] + oz, a[0] + f[0] * c + ox, a[1] + f[1] * c + oy, a[2] + f[2] * c + oz, 1, 1, WH, .7 * A);
  }
  for (const w of [0, .5, 1]) K.ringW(V.mad(a, f, c * w), U_, W_, rc * 1.15, 20, 1, WH, .75 * A, 0);
  const c0 = V.mad(a, f, c); K.lineW(c0[0], c0[1], c0[2], b[0], b[1], b[2], .8, 2, col, (.7 + .3 * lit) * A);
  K.ringW(b, U_, W_, rr * 1.8, 14, 1, col, .85 * A, 0);
}
const revealed = y => y > RV_Y;
function drawFX(u, s, ctx, q) {
  const ap = ctx.apI, odot = P_.odot, oglow = P_.oglow, W = L => X.mul(WS, L);
  // the reveal front: the compartment's section where it runs, in lime
  if (RV_ON && RV_Y < YH + .02) {
    const A = Math.min(1, (YH + .02 - RV_Y) * 4) * Math.min(1, (RV_Y - YD + .3) * 3);
    let px = 0, py = 0, pz = 0, first = true;
    const seg = (x, z) => { ap(WS, x, RV_Y, z, Q1); if (!first) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 1.4, 1, LIME, .75 * A, LIME, .1 * A, 0); px = Q1[0]; py = Q1[1]; pz = Q1[2]; first = false; };
    for (let z = ZA; z <= ZF + .01; z += .33) seg(P_.hullAt(z, RV_Y) - .12, z);
    for (let z = ZF; z >= ZA - .01; z -= .33) seg(-(P_.hullAt(z, RV_Y) - .12), z);
    seg(P_.hullAt(ZA, RV_Y) - .12, ZA);
  }
  if (!revealed(-1.4)) return;
  const fr = Math.floor(ctx.T * 30);
  // the arm's drives: a lime ring while a joint turns, the motor's marker dots turning with it
  for (const [lk, c, ax, r, j, gr] of MOTORS) {
    const v = Math.abs(QV[j] - QW[j]) / .06, Tl = W(LK[lk]);
    const cw = X.ap(Tl, c), d = X.dir(Tl, ax), [U_, W_] = perpOf(d);
    if (v > .05) K.ringW(cw, U_, W_, r * 1.25, 28, 1, LIME, Math.min(1, v * .9) * FW.arm, q[j] * 3);
    const ph = q[j] * gr;
    for (let k = 0; k < 3; k++) { const a = ph + k * TAU / 3, p = V.add(cw, V.add(V.mul(U_, Math.cos(a) * r * .7), V.mul(W_, Math.sin(a) * r * .7))); odot(p[0], p[1], p[2], 1, v > .05 ? LIME : WH, (v > .05 ? .9 : .45) * FW.arm); }
  }
  // the track: its carriage's drive and the cable chain riding along
  { const zt = s.zt, mv = Math.abs(ztAt(u + .05) - zt) > .002;
    for (let k = 0; k <= 24; k++) { const t = k / 24, z = E.mix(ZC - .8, zt, t); ap(WS, XA + .49, YD + .11, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .4 * FW.arm); }
    ap(WS, XA + .4 * SA, YB - .3 * SA, zt + .1 * SA, Q1); odot(Q1[0], Q1[1], Q1[2], 2, mv ? LIME : WH, mv ? 1 : .4); }
  // the gripper: its LED lime while it holds, the jaws' contact flashing as they close
  { const Th = W(LK.hand); ap(Th, 0, .06 * SA, .075 * SA, Q1); odot(Q1[0], Q1[1], Q1[2], 2, s.held ? LIME : WH, s.held ? 1 : .4); if (s.held) oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .4);
    const g = Math.max(lock(u, 2.3), lock(u, 23.97));
    if (g > .02) for (const sg of [-1, 1]) { ap(Th, sg * s.grip, LG, 0, Q1); oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .6 * g); odot(Q1[0], Q1[1], Q1[2], 2, HOT, g); } }
  // the centres: a lime flash as they take the rod, a ring at each end while it is held between them
  { const f = lock(u, U.cen1), Tw = W(s.SH);
    if (s.quill > .02) for (const z of [-1.0, 1.0]) { ap(Tw, 0, 0, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .5 + .5 * f); if (f > .02) oglow(Q1[0], Q1[1], Q1[2], 26, LIME, .6 * f); } }
  // the coater: each micro-arm's tip in contact lime, a spark and a short arc into the channel; the head's lights
  if (s.coat && s.dep > .02) {
    const Th = W(s.HEAD), hz = s.zH;
    for (let a = 0; a < NMA; a++) {
      const tx = MTIP[a * 3], ty = MTIP[a * 3 + 1], tz = MTIP[a * 3 + 2];
      ap(Th, tx, ty, tz, Q1);
      const c = MCON[a];
      if (c > .05) {
        odot(Q1[0], Q1[1], Q1[2], 2, LIME, c); oglow(Q1[0], Q1[1], Q1[2], 7, LIME, .35 * c);
        if (K.hh(a * 1.7, fr) < .35) { const m = MA[a]; ap(Th, Math.cos(m.th) * RGR.ROD_R, Math.sin(m.th) * RGR.ROD_R, tz + (K.hh(a, fr) - .5) * .02, Q2); K.arcW(Q1, Q2, a + fr * .1, ctx.T, .9 * c, .6, LIME); }
      } else odot(Q1[0], Q1[1], Q1[2], 1, WH, .7 * s.dep);
    }
    for (let k = 0; k < 8; k++) { const an = (40 + k * 40) * DEG; ap(Th, Math.cos(an) * .19, Math.sin(an) * .19, -.064, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .5 + .5 * Math.sin(ctx.T * 14 + k)); }
  }
  // the grower: the emitters' beams onto the forming lattice, the ring's own lights
  if (s.gt > 0 && s.gt < 1.05) {
    const Td = W(s.DEPO), zf = s.zD, rf = Math.max(.03, RGR.Rz(zf) - .01);
    for (let k = 0; k < 16; k++) {
      const an = (30 + k * 20) * DEG, c = Math.cos(an), sn = Math.sin(an);
      ap(Td, c * .19, sn * .19, 0, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .9);
      const h = K.hh(k * 2.3, fr), rr = RGR.R_IN + (rf - RGR.R_IN) * (.35 + .65 * h), a2 = an + (K.hh(k * 5.1, fr) - .5) * .3, dz = -.012 - .02 * K.hh(k * 7.7, fr);
      ap(Td, Math.cos(a2) * rr, Math.sin(a2) * rr, dz, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, LIME, .55 + .3 * h, LIME, .05, 0);
      odot(Q2[0], Q2[1], Q2[2], 2, [255, 255, 255], .9);
    }
    ap(Td, 0, 0, -.015, Q1); K.ringW(Q1, X.dir(Td, [1, 0, 0]), X.dir(Td, [0, 1, 0]), rf, 90, 1, LIME, .5, ctx.T * 3);
    // cells crystallising at the front: lattice nodes flashing as they form
    const Tr = W(s.RF), gt = s.gt;
    for (let i = 0; i < 70; i++) {
      const h1 = K.hh(i * 1.31, fr), h2 = K.hh(i * 2.77, fr), rr = RGR.R_IN + (RGR.SAB_R - RGR.R_IN) * h1, zn = (gt - .13 * h1 - .07 * h2) / .8, z = RGR.SAB_Z0 + RGR.SAB_LEN * zn;
      if (z < RGR.SAB_Z0 || z > RGR.SAB_Z1 || rr > RGR.Rz(z)) continue;
      const k3 = Math.floor(K.hh(i * 4.1, fr) * 3), an = k3 * TAU / 3 + (K.hh(i * 5.3, fr) - .5) * 1.9;
      ap(Tr, Math.cos(an) * rr, Math.sin(an) * rr, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, h2 > .6 ? [255, 255, 255] : LIME, .9);
      if (h2 > .8) oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .35);
    }
  }
  // the armature: the rams, the fuse (current across the halves' seam), the pads' lights
  {
    const z = ZR + ZAM, off = .36 * (1 - s.amc) + .3 * s.amb;
    for (const sg of [-1, 1]) { ap(WS, XL + sg * .6, YL, z, Q1); ap(WS, XL + sg * (.17 + off), YL, z, Q2); ramLines(Q1, Q2, .03, .016, .02, u > U.am0 && u < U.am1 ? 1 : 0, FW.stat); }
    const fu = lock(u, U.fuse);
    if (fu > .02) {
      const Tr = W(s.RF);
      for (let i = 0; i < 6; i++) { ap(Tr, -.085 + .034 * i, 0, RGR.ARM_Z0, Q1); ap(Tr, -.085 + .034 * i + (K.hh(i, fr) - .5) * .03, (K.hh(i * 3, fr) - .5) * .03, RGR.ARM_Z0 - .01, Q2); K.arcW(Q1, Q2, i + fr * .1, ctx.T, fu, .8, LIME); }
      ap(Tr, 0, 0, RGR.ARM_Z0 + .04, Q1); oglow(Q1[0], Q1[1], Q1[2], 60, LIME, .55 * fu); K.ringW(Q1, X.dir(Tr, [1, 0, 0]), X.dir(Tr, [0, 1, 0]), .16 + .14 * (1 - fu), 120, 2, LIME, fu, 0);
    }
  }
  // the inspection ring: its scan plane, the section where it cuts the round, arcs from the electrodes, the pass
  {
    const Ti = W(s.RING), zr = s.zI, on = E.sat((u - U.riS0) / .15) * (1 - E.sat((u - U.riS1) / .2));
    if (on > .01) {
      const U_ = X.dir(Ti, [1, 0, 0]), W_ = X.dir(Ti, [0, 1, 0]); ap(Ti, 0, 0, 0, Q1);
      // the scan plane: a lattice of lime dots across the ring, a sweep line turning in it
      for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) { if (i * i + j * j > 144) continue; ap(Ti, i * .02, j * .02, 0, Q2); K.dotW(Q2[0], Q2[1], Q2[2], 1, LIME, (.18 + .2 * ((i + j) & 1 ? 0 : 1)) * on); }
      { const a = ctx.T * 5; ap(Ti, Math.cos(a) * .24, Math.sin(a) * .24, 0, Q2); ap(Ti, -Math.cos(a) * .24, -Math.sin(a) * .24, 0, Q3); K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 1.2, 1, LIME, .7 * on, LIME, .06 * on, 0); }
      K.ringW(Q1, U_, W_, .25, 140, 2, LIME, .8 * on, ctx.T * 2); K.ringW(Q1, U_, W_, .24, 100, 1, HOT, .4 * on, -ctx.T * 3);
      const rs = zr > RGR.SAB_Z0 && zr < RGR.SAB_Z1 ? RGR.Rz(zr) : zr > RGR.ARM_Z0 && zr < RGR.ARM_Z1 ? .14 : zr < -.86 ? RGR.FIN_R : 0;
      K.ringW(Q1, U_, W_, RGR.ROD_R + .001, 40, 2, HOT, on, 0);
      if (rs > 0) K.ringW(Q1, U_, W_, rs, 90, 1, LIME, .9 * on, 0);
      K.glowW(Q1[0], Q1[1], Q1[2], 50, LIME, .22 * on);
      for (const an of [60, 150, 210, 300]) {
        const c = Math.cos(an * DEG), sn = Math.sin(an * DEG); ap(Ti, c * .165, sn * .165, 0, Q2);
        const rr = Math.max(rs, RGR.ROD_R), a2 = an * DEG + (K.hh(an, fr) - .5) * .5; ap(Ti, Math.cos(a2) * rr, Math.sin(a2) * rr, (K.hh(an * 3, fr) - .5) * .03, Q3);
        K.arcW(Q2, Q3, an + fr * .1, ctx.T, .9 * on, .5, LIME); oglow(Q2[0], Q2[1], Q2[2], 10, LIME, .5 * on);
      }
      for (let k = 0; k < 12; k++) { const a = (35 + k * 26) * DEG; ap(Ti, Math.cos(a) * .232, Math.sin(a) * .232, 0, Q2); odot(Q2[0], Q2[1], Q2[2], 2, LIME, on * (.6 + .4 * Math.sin(ctx.T * 20 + k))); }
    }
    const ps = lock(u, U.riS1);
    if (ps > .02) { ap(Ti, 0, 0, 0, Q1); K.ringW(Q1, X.dir(Ti, [1, 0, 0]), X.dir(Ti, [0, 1, 0]), .3 + .1 * (1 - ps), 140, 2, LIME, ps, 0); }
  }
  // the strike-up: the ram's stages, the cradle's light, the drag chain, the scuttle, the latch
  {
    const cx = CELL[0], cz = CELL[2], top = s.cr - .46, b0 = YD + .3, ext = top - b0;
    const st2 = b0 + ext * .5, mvL = Math.abs(cradleAt(u + .02) - cradleAt(u - .02)) > .001 ? 1 : 0, A = Math.max(.3, FW.lift);
    if (top > b0 + .01 && revealed(b0)) {
      ap(WS, cx, b0 - .05, cz, Q1); ap(WS, cx, st2, cz, Q2); ramLines(Q1, Q2, .066, .05, ext * .5 + .05, 0, A);
      ap(WS, cx, st2 - .05, cz, Q1); ap(WS, cx, top, cz, Q2); ramLines(Q1, Q2, .052, .04, ext * .5 + .05, mvL, A);
    }
    ap(WS, cx + .26 - .05, s.cr - .37, cz + .05, Q1); odot(Q1[0], Q1[1], Q1[2], 2, mvL ? LIME : WH, mvL ? 1 : .4);
    { const yb = -.3, yc = s.cr - .42, lo = Math.min(yb, yc) - .35, n = 26;
      for (let k = 0; k <= n; k++) { const t = k / n, y = t < .5 ? E.mix(yb, lo, Math.sin(t * PI)) : E.mix(yc, lo, Math.sin(t * PI)), z = cz - .27 - .07 - .09 * Math.sin(t * PI); if (y < RV_Y) continue; ap(WS, cx + .06, y, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .6 * A); } }
    if (s.sct > .02) for (const sg of [-1, 1]) { ap(WS, cx + sg * .3 * s.sct, YH - .045, cz - .29, Q1); ap(WS, cx + sg * .3 * s.sct, YH - .045, cz + .29, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, LIME, .8 * s.sct, LIME, .06, 0); }
    const lt = kk(u, U.up1, U.latch), lf = lock(u, U.latch), yl = YCT - .005;
    if (u > U.up1 - .05) for (const sg of [-1, 1]) {
      const a = (1 - lt) * PI / 2; ap(WS, cx + sg * .17, yl, cz, Q1); ap(WS, cx + sg * (.17 - .07 * Math.cos(a)), yl - .07 * Math.sin(a), cz, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, lf > .05 ? LIME : WH, .9 * (1 - kk(u, LEN - .4, LEN)));
      if (lf > .02) oglow(Q2[0], Q2[1], Q2[2], 16, LIME, .6 * lf);
    }
    if (lf > .02) { ap(WS, cx, YCT + .2, cz, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 50, LIME, .3 * lf); }
  }
}

/* ---------- tags and readout ---------- */
let BX = null;
function tags(u, ctx) {
  const s = ST, ta = ctx.tagAt, W = L => X.mul(WS, L);
  const win = (t0, t1) => E.sat((u - t0) / .2) * (1 - E.sat((u - t1 + .4) / .4));
  const tag = (k, id, lab, val, Lf, p, t0, t1) => { const a = win(t0, t1); if (a > .01 && revealed(X.ap(Lf, p)[1])) ta(TG[k], id, lab, val, X.ap(W(Lf), p), a, u - t0); };
  tag('ROD', 'ROD', 'Rod · tungsten · 2.0 m · Ø25 mm', '', s.RF, [0, 0, .5], 1.5, 3.1);
  tag('ROB', 'ROB', 'Handling arm · 6-axis · track', '', LK.upper, [.1, A2 * .55, 0], 2.1, 3.7);
  tag('COA', 'COA', 'Coater · 24 micro-arms', '', s.HEAD, [0, -.18, .04], 4.7, 6.1);
  tag('MAR', 'MAR', 'Micro-arm', '×0.25', s.HEAD, [Math.cos(MA_TH(3)) * .1, Math.sin(MA_TH(3)) * .1, .034], 6.0, 7.8);
  tag('TRC', 'TRC', 'Circuit · 8 traces', `${Math.round(100 * E.clamp((s.laid + .9) / 1.8, 0, 1))} %`, s.RF, [0, .012, Math.min(.8, s.laid - .1)], 7.6, 10.4);
  tag('GRW', 'GRW', 'Lattice grower', '', X.make(R_LINE, [XL, YL, ZG]), [-.3, .2, -.3], 12.3, 13.6);
  tag('LAT', 'LAT', 'Nano-lattice · forming', `${Math.round(100 * E.clamp(s.gt, 0, 1))} %`, s.RF, [-.12, .05, Math.min(.4, s.zD)], 13.4, 15.6);
  tag('SAB', 'SAB', 'Sabot · 3 segments', '', s.RF, [-.1, .1, -.1], 15.6, 17.2);
  tag('AMS', 'ARM', 'Armature · 2 halves', u > U.fuse ? 'fused' : '', s.RF, [-.08, .14, RGR.ARM_Z0], 18.75, 20.2);
  // the inspection: each part boxed as the plane reaches it
  const zr = s.zI, on = u > U.riS0 && u < U.riS1 + .8;
  if (on) {
    const Tr = W(s.RF);
    const part = (k, id, lab, val, bx, zfrom, pt) => {
      if (zr < zfrom - .01) return;
      const a = E.sat((zr - zfrom) / .06) * (1 - E.sat((u - U.riS1 - .5) / .3));
      if (a < .01) return;
      const b = K.boxOf(bx[0], bx[1], Tr, 4); if (b) K.bracket(b, '#C6F432', .9 * a, 8, 1.2);
      ta(TG[k], id, lab, val, X.ap(Tr, pt), a, (zr - zfrom) / .3);
    };
    part('FIN', 'FIN', 'Fins ×6', '', BX.FIN, -1.0, [0, .035, -.93]);
    part('AR2', 'ARM', 'Armature · Al', '', BX.ARM, RGR.ARM_Z0, [.0, .14, -.66]);
    part('SB2', 'SAB', 'Sabot · nano-lattice ×3', '', BX.SAB, RGR.SAB_Z0, [-.14, 0, -.2]);
    part('TR2', 'TRC', 'Circuit · charged', `${Math.round(100 * E.clamp((zr + .95) / 1.9, 0, 1))} %`, BX.ROD, -.2, [0, .013, .65]);
    part('NOS', 'NOS', 'Nose · sensor', '', BX.NOS, .86, [0, .012, .95]);
  }
  tag('INS', 'INS', 'Inspection · charge ring', u > U.riS1 ? 'pass' : '', s.RING, [-.25, .2, 0], U.ri0, U.riE + .6);
  tag('STK', 'STK', 'Strike-up', '', tr(CELL[0], s.cr, CELL[2]), [.26, -.36, 0], 26.3, 27.4);
  tag('CEL', 'CEL', P_.MAG_CELL ? 'Magazine · cell' : 'Drum · cell 01', '', tr(CELL[0], YCT, CELL[2]), [.15, .3, 0], U.up1 - .2, LEN - .3);
}
function readout(u) {
  let l1, l2, rate = 1;
  const s = ST;
  if (u < 1.4) { l1 = 'Magazine · <b>fabrication deck</b>'; l2 = 'Round <b>called</b> · cell 01'; }
  else if (u < U.load) { l1 = 'Round · <b>fabrication</b>'; l2 = u < U.grip1 ? 'Rod <b>picked</b> · tungsten' : u < 3.95 ? 'Rod <b>to the coater</b>' : 'Centres <b>closed</b>'; }
  else if (u < U.sh1a) {
    rate = coRate(u); l1 = 'Coater · <b>circuit layer</b>';
    l2 = s.tau < CO_T0 ? 'Micro-arms <b>deploying</b>' : s.tau < CO_T1 ? `Traces <b>${Math.round(100 * E.clamp((s.laid + .9) / 1.8, 0, 1))} %</b> · 8 channels` : 'Circuit <b>laid</b>';
  }
  else if (u < U.gr0) { l1 = 'Line · <b>shuttle</b>'; l2 = 'To the <b>lattice grower</b>'; }
  else if (u < U.sh2a) { l1 = 'Grower · <b>nano-lattice</b>'; l2 = s.gt < 1.04 ? `Layer <b>${Math.round(72 * E.clamp(s.gt, 0, 1))}</b>/72 · 3 segments` : 'Sabot <b>grown</b> · 3 segments'; }
  else if (u < U.am0) { l1 = 'Line · <b>shuttle</b>'; l2 = 'To the <b>armature</b>'; }
  else if (u < U.ri0) { l1 = 'Armature · <b>2 halves</b>'; l2 = u < U.am1 ? 'Halves <b>closing</b>' : u < U.amR0 ? 'Armature <b>fused</b>' : 'Rams <b>back</b>'; }
  else if (u < U.riE) { l1 = 'Inspection · <b>charge</b>'; l2 = `Circuit <b>${Math.round(100 * E.clamp((s.zI + .95) / 1.9, 0, 1))} %</b> · scan`; }
  else if (u < U.place) { l1 = 'Round · <b>complete</b>'; l2 = 'To the <b>strike-up</b>'; }
  else if (u < U.up1) { l1 = 'Strike-up · <b>to the magazine</b>'; l2 = 'Round <b>rising</b>'; }
  else { l1 = 'Magazine · <b>round stowed</b>'; l2 = P_.MAG_CELL ? 'Cell <b>next</b>' : 'Drum <b>cell 01</b>'; }
  return { l1, l2, rate };
}
/* while the lens is down in the deck the room and the ship are background seen through the floor: their dots spaced
   wider (the film sets these each frame from K.DQ before this runs) */
function xray(u, XS, ctx) {
  const f = 1 + .9 * (kk(u, .5, 1.2) - kk(u, 28.4, 29.3)) + .6 * (kk(u, 4.4, 4.9) - kk(u, 23.4, 23.9));
  if (f > 1.001) for (const o of [ctx.SO, ctx.RO, ctx.MO]) if (o) o.px *= f;
  return true;
}
/* ---------- sound ---------- */
function CUES(SFX) {
  const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
  const tick = () => SFX.tone(1650, 1650, .04, 'square', .008);
  const clack = () => { SFX.tone(900, 300, .06, 'square', .012); SFX.noise(.08, 3000, .8, .02, .002); };
  const whirr = (f0, f1, d) => () => { SFX.tone(f0, f1, d, 'sawtooth', .009); SFX.noise(d, 900, .7, .01, .2); };
  const servo = (d, f) => () => { SFX.tone(f, f * 1.25, d, 'triangle', .008); SFX.tone(f * 2.01, f * 2.4, d, 'sine', .004); };
  const buzz = (d, f) => () => { SFX.tone(f, f * 1.02, d, 'square', .004); SFX.noise(d, 6000, .5, .006, .1); };
  return [
    [.1, () => SFX.tone(900, 2600, .9, 'sine', .012)], [1.2, servo(.75, 340)], [1.95, servo(.25, 420)], [2.25, clack], [2.4, servo(.25, 400)],
    [2.65, servo(.9, 360)], [3.55, servo(.4, 420)], [U.cen0, whirr(500, 700, .18)], [U.cen1, clunk], [4.2, clack], [4.3, servo(.25, 400)],
    [U.co0, whirr(200, 340, .5)], [U.co0 + .5, buzz(.8, 2200)], [U.co0 + 1.3, buzz(2.2, 520)], [U.co0 + 3.5, buzz(2.6, 2400)],
    [U.sh1a, whirr(140, 260, 1.4)], [U.sh1b, clunk], [U.gr0 + .1, () => { SFX.tone(110, 165, 4.4, 'sawtooth', .006); SFX.noise(4.4, 7000, .4, .006, 1); }],
    [U.sh2a, whirr(140, 260, 1.4)], [U.sh2b, clunk], [U.am0, whirr(300, 420, .7)], [U.am1, clunk], [U.fuse, () => { SFX.crack && SFX.crack(); SFX.tone(1800, 600, .3, 'square', .01); }],
    [U.ri0, whirr(220, 300, .4)], [U.riS0, () => SFX.tone(200, 2400, 2.5, 'sawtooth', .01)], [U.riS1, tick], [U.riS1 + .09, tick],
    [22.9, servo(.6, 360)], [23.97, clack], [U.cenR0, whirr(600, 400, .2)], [24.25, servo(.6, 400)], [24.9, servo(1.1, 360)], [26.3, clunk], [26.5, clack],
    [U.sct0, whirr(300, 200, .35)], [U.up0, whirr(90, 220, 1.3)], [U.up1, clunk], [U.latch, tick], [U.dn0, whirr(200, 90, .6)],
  ];
}

window.RGM = { len: LEN, room: true, build, chapters: [{ t: 0, title: 'Fabrication' }, { t: U.co0, title: 'Circuit' }, { t: U.sh1a, title: 'Lattice' }, { t: U.sh2a, title: 'Armature' }, { t: U.ri0, title: 'Charge' }], cues: [], cam, draw, xray, readout, tags,
  dbg: () => ({ ST, CELL, U, PZ, QK, err: RGM.err, np: () => { const n = NPM; NPM = 0; return n; } }) };
})();
