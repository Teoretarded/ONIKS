/* SCAN · RAILGUN insert: the round put together in the lower magazine (window.RGM; the insert API is in
   pc_scan_railgun_film.js, "inserted sequences"). Rounds are not made at sea: the magazine under the power room stows
   them as parts, and a cell under the drum assembles one when it is called for. The lens dives on through the room's
   floor and the X-ray opens down into the magazine. A six-axis arm lifts a probe body out of its rack and holds it
   under the press while the ram seats the armature (pushed in along its chute) on the body's base; it sets the body in
   the sabot station, where three arms swing the petals in round it and a split clamp ring locks over them; it takes the
   round to the strike-up under the drum, which lifts it through the inspection ring (a lime scan plane runs its
   length, each part boxed as it passes) and on up through a scuttle into the drum's empty cell, the one the hoist
   takes next. The lens rises with it and settles where the loader takes over. Real time (x1).
   Frames: ship (+Z fwd, +X stbd, y up from the waterline); the arm's mount RM on the magazine deck (its links each
   +y along the link); a station frame per station (+z out from the arm, +x to the side, y up, origin on the nest; the
   sabot station's parts in the round's own frame, Z up). Render is a pure function of u (s into the insert). */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const G = GEO;
const F = o => Object.assign({ fine: true }, o || {});

/* ---------- time and place ---------- */
const T_AT = 23.9;                               // the base time the film splices this in at (its T_LD)
const LEN = 11.6;
const AZ = Math.atan2(7200, 15600);              // the mount's train (the film's PSI): it sets where cell 01 sits
const YD = -1.75;                                // the magazine deck (ship y); its deckhead is the power room's floor
const ZA = 45.65, ZF = 52.25;                    // its bulkheads
const Y_RING = .15;                              // the inspection ring's plane
const ROT_UP = R.x(-PI / 2);                     // a round standing nose up
const RO_L = R.mul(R.y(-PI / 2), ROT_UP);        // ... in a station frame (its X along the station's +z)
const kk = (u, a, b) => E.ss(a, b, u);
const lock = (u, t0) => { const a = u - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const rbox = (Rm, a, b, o) => G.hex([[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]].map(p => R.ap(Rm, p)), o);

/* the arm: a 16 kg-class six-axis robot (shoulder offset and height, upper arm, forearm to the wrist centre, wrist to
   flange, flange to the grip point) */
const A1 = .15, H1 = .45, A2 = .68, D4 = .66, D6 = .09, LG = .19, LT = D6 + LG;
const GZ_ = .05;                                 // it grips a round .05 above its centre
/* its moves: TCP poses [bearing deg from the mount, radius m, ship y] (the gripper level, its jaws closing across);
   segments [u0, u1, J (joint space) | L (straight line) | H (hold), from, to], each eased in and out */
const PZ = {
  home: [128, .62, -.22], rkA: [85, .80, -.72], rkG: [85, 1.12, -.72], rkU: [85, 1.12, -.40], rkR: [85, .78, -.32],
  prA: [10, .78, -.32], prI: [10, 1.08, -.32], prP: [10, 1.08, -.44], prS: [10, 1.08, -.49], prU: [10, 1.08, -.30], prR: [10, .76, -.30],
  sbA: [-58, .76, -.30], sbI: [-58, 1.08, -.30], sbP: [-58, 1.08, -.49], sbO: [-58, .74, -.49], sbU: [-58, 1.08, -.28], sbR: [-58, .74, -.28],
  lfA: [-180, .74, -.28], lfI: [-180, 1.29, -.28], lfP: [-180, 1.29, -.49], lfO: [-180, .74, -.49], home2: [-122, .62, -.22],
};
const PLAN = [
  [0, .40, 'H', 'home'], [.40, 1.15, 'J', 'home', 'rkA'], [1.15, 1.40, 'L', 'rkA', 'rkG'], [1.40, 1.55, 'H', 'rkG'],
  [1.55, 1.80, 'L', 'rkG', 'rkU'], [1.80, 1.98, 'L', 'rkU', 'rkR'], [1.98, 2.50, 'J', 'rkR', 'prA'],
  [2.50, 2.72, 'L', 'prA', 'prI'], [2.72, 2.90, 'L', 'prI', 'prP'], [2.90, 3.15, 'H', 'prP'], [3.15, 3.32, 'L', 'prP', 'prS'],
  [3.32, 3.40, 'H', 'prS'], [3.40, 3.62, 'L', 'prS', 'prU'], [3.62, 3.80, 'L', 'prU', 'prR'], [3.80, 4.30, 'J', 'prR', 'sbA'],
  [4.30, 4.52, 'L', 'sbA', 'sbI'], [4.52, 4.70, 'L', 'sbI', 'sbP'], [4.70, 4.82, 'H', 'sbP'], [4.82, 5.00, 'L', 'sbP', 'sbO'],
  [5.00, 5.70, 'H', 'sbO'], [5.70, 5.90, 'L', 'sbO', 'sbP'], [5.90, 6.30, 'H', 'sbP'], [6.30, 6.50, 'L', 'sbP', 'sbU'],
  [6.50, 6.68, 'L', 'sbU', 'sbR'], [6.68, 7.25, 'J', 'sbR', 'lfA'], [7.25, 7.47, 'L', 'lfA', 'lfI'], [7.47, 7.65, 'L', 'lfI', 'lfP'],
  [7.65, 7.77, 'H', 'lfP'], [7.77, 7.95, 'L', 'lfP', 'lfO'], [7.95, 8.70, 'J', 'lfO', 'home2'], [8.70, 99, 'H', 'home2'],
];
/* the beats (u) */
const U = {
  push0: 1.85, push1: 2.30, drop0: 2.35,                                    // the armature feeder: push, pusher back
  ram0: 2.88, ram1: 3.15, seat: 3.32, ramR0: 3.36, ramR1: 3.70,             // the press
  pet0: 4.95, petD: .10, petL: .40, clamp0: 5.55, clamp1: 5.72, unc0: 6.02, unc1: 6.25, arm0: 6.02, arm1: 6.35,
  lf0: 7.95, lf1: 8.25, sc0: 8.25, sc1: 9.35, up0: 9.40, up1: 10.55, latch: 10.68, dn0: 10.70, dn1: 11.30,
  sct0: 9.05, sct1: 9.40, sctC0: 10.95, sctC1: 11.25,
  rv0: .10, rv1: .95, cl0: 10.70, cl1: 11.40,                               // the X-ray front opening down, closing back up
  hold1: [1.50, 4.74], hold2: [5.98, 7.69],                                 // the gripper holds the body, then the round
};
const gripAt = u => u < 1.40 ? .19 : u < 4.70 ? E.mix(.19, .113, kk(u, 1.40, 1.52)) : u < 5.90 ? E.mix(.113, .19, kk(u, 4.70, 4.80))
  : u < 7.65 ? E.mix(.19, .146, kk(u, 5.90, 6.00)) : E.mix(.146, .19, kk(u, 7.65, 7.75));
const ramAt = u => 1.15 - .31 * kk(u, U.ram0, U.ram1) - .05 * kk(u, U.ram1, U.seat) + .36 * kk(u, U.ramR0, U.ramR1);   // the press cup (station y)
const pushAt = u => kk(u, U.push0, U.push1);
const pusherAt = u => pushAt(u) * (1 - kk(u, U.drop0, U.drop0 + .3));
const petArm = (u, k) => 70 * DEG * ((1 - kk(u, U.pet0 + k * U.petD, U.pet0 + k * U.petD + U.petL)) + kk(u, U.arm0 + .05 * k, U.arm1 + .05 * k));
const petAng = (u, k) => u < U.pet0 + 1 ? petArm(u, k) : 0;
const clampAt = u => kk(u, U.clamp0, U.clamp1) * (1 - kk(u, U.unc0, U.unc1));
const sctAt = u => kk(u, U.sct0, U.sct1) * (1 - kk(u, U.sctC0, U.sctC1));
let YC3 = 1.39;
function cradleAt(u) {                           // the strike-up's cradle top (ship y)
  if (u < U.lf0) return -1.0;
  if (u < U.sc0) return E.mix(-1.0, Y_RING - .79, kk(u, U.lf0, U.lf1));
  if (u < U.up0) return E.mix(Y_RING - .79, Y_RING, kk(u, U.sc0, U.sc1));
  if (u < U.dn0) return E.mix(Y_RING, YC3, kk(u, U.up0, U.up1));
  return E.mix(YC3, .55, kk(u, U.dn0, U.dn1));
}
const frontAt = u => u < U.cl0 ? E.mix(1.35, YD - .3, kk(u, U.rv0, U.rv1)) : E.mix(YD - .3, 1.35, kk(u, U.cl0, U.cl1));

/* ---------- the camera: ship-frame keys (they ride with the ship), and Hermite blends from and back into the base
   camera at T_AT (position and velocity matched) ---------- */
const U_A = .45, U_B = 11.10;
const CAMK = [
  [.45, [3.0, 4.75, 47.0], [.4, 1.2, 48.5], 50],
  [.85, [2.15, 2.4, 47.3], [1.0, -.4, 48.9], 50],
  [1.30, [1.37, .7, 46.59], [.7, -.75, 49.1], 42],
  [1.95, [1.17, .45, 47.31], [1.0, -.55, 49.2], 40],
  [2.60, [2.58, .75, 48.26], [.45, -.5, 49.75], 42],
  [3.25, [2.38, .7, 49.48], [.25, -.3, 50.05], 38],
  [3.95, [1.5, .8, 52.0], [-.3, -.5, 49.85], 42],
  [4.65, [-.6, .65, 51.84], [-.8, -.55, 49.55], 40],
  [5.35, [-1.98, .55, 51.21], [-.83, -.6, 49.57], 38],
  [6.05, [-2.62, .5, 50.22], [-.83, -.6, 49.57], 38],
  [6.80, [-2.4, .85, 48.5], [-.4, -.5, 48.3], 42],
  [7.60, [-1.7, .75, 46.59], [.1, -.5, 47.85], 40],
  [8.40, [.41, .9, 45.9], [.08, -.15, 47.73], 40],
  [8.90, [1.87, .75, 47.08], [.08, .1, 47.72], 40],
  [9.30, [1.42, -.15, 48.86], [.08, .62, 47.72], 40],
  [9.85, [1.2, 1.75, 50.5], [.08, 1.3, 47.72], 44],
  [10.40, [1.3, 4.3, 50.75], [.08, 1.9, 47.72], 44],
  [10.80, [1.33, 6.5, 50.95], [.0, 2.2, 47.72], 43],
  [11.10, [2.05, 6.95, 50.6], [-.1, 2.35, 47.7], 42],
];
const DBG = (() => {
  let s = STAGE.Q.get('cam');
  try { if (!s && window.parent !== window) s = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  if (!s) return null; const a = s.split(',').map(Number); return { eye: a.slice(0, 3), target: a.slice(3, 6), fov: (a[6] || 40) * DEG };
})();
let CK = null, VOLD = null;
function herm(p0, p1, m0, m1, w, dt) {
  const w2 = w * w, w3 = w2 * w, h00 = 2 * w3 - 3 * w2 + 1, h10 = w3 - 2 * w2 + w, h01 = -2 * w3 + 3 * w2, h11 = w3 - w2;
  return p0 * h00 + m0 * dt * h10 + p1 * h01 + m1 * dt * h11;
}
const hermV = (a, b, ma, mb, w, dt) => [0, 1, 2].map(k => herm(a[k], b[k], ma[k], mb[k], w, dt));
const toShip = (Ws, p) => { const M = Ws.R, x = p[0] - Ws.T[0], y = p[1] - Ws.T[1], z = p[2] - Ws.T[2]; return [M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z]; };
const dirShip = (Ws, v) => { const M = Ws.R; return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; };
function camPrep(ctx) {
  const o = ctx.camAt(T_AT), h = 1 / 120, a = ctx.camAt(T_AT - h), b = ctx.camAt(T_AT + h);
  VOLD = { eye: V.mul(V.sub(b.eye, a.eye), 1 / (2 * h)), target: V.mul(V.sub(b.target, a.target), 1 / (2 * h)), fov: (b.fov - a.fov) / (2 * h) };
  // end keys at the base camera (only their tangents into U_A / out of U_B are used)
  const ends = [[0, o.eye, o.target, o.fov / DEG], ...CAMK, [LEN, o.eye, o.target, o.fov / DEG]];
  CK = FILM.path(ends.map(([t, eye, target, fov]) => ({ t, eye, target, fov })));
}
function cam(u, ctx) {
  if (DBG) return DBG;
  const Ws = ctx.Ws;
  if (u >= U_A && u <= U_B) { const s = CK(u); return { eye: X.ap(Ws, s.eye), target: X.ap(Ws, s.target), fov: s.fov }; }
  const o = ctx.camOld, st = u < U_A, k = st ? U_A : U_B, dt = st ? U_A : LEN - U_B, w = st ? u / U_A : (u - U_B) / (LEN - U_B);
  const s = CK(k), sa = CK(k - .01), sb = CK(k + .01);
  const ve = V.mul(V.sub(sb.eye, sa.eye), 50), vt = V.mul(V.sub(sb.target, sa.target), 50), vf = (sb.fov - sa.fov) * 50;
  const e0 = toShip(Ws, o.eye), t0 = toShip(Ws, o.target), we = dirShip(Ws, VOLD.eye), wt = dirShip(Ws, VOLD.target);
  const eye = st ? hermV(e0, s.eye, we, ve, w, dt) : hermV(s.eye, e0, ve, we, w, dt);
  const target = st ? hermV(t0, s.target, wt, vt, w, dt) : hermV(s.target, t0, vt, wt, w, dt);
  const fov = st ? herm(o.fov, s.fov, VOLD.fov, vf, w, dt) : herm(s.fov, o.fov, vf, VOLD.fov, w, dt);
  return { eye: X.ap(Ws, eye), target: X.ap(Ws, target), fov };
}

/* ---------- the point pass: the room's lattice look (1 px dots, edges at a fixed brightness, the room's occluders),
   plus the magazine's reveal: a level front in ship y, points below it hidden, a lime band just above it ---------- */
let K, P_, CL, LIME, HOT, WH, YH, WS = null, FOC = 0, XM_ = null, NPM = 0;
let RV_Y = -99, RV_ON = false;
const RVB = .24;
function sphereIn(x, mx, my, mz, rad) {
  const C = K.C, zc = x[6] * mx + x[7] * my + x[8] * mz + x[11];
  if (zc < C.near - rad) return false;
  const xc = x[0] * mx + x[1] * my + x[2] * mz + x[9], yc = x[3] * mx + x[4] * my + x[5] * mz + x[10];
  const Fl = C.fl, xr = (1920 - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
function runM(P, i0, i1, sp, o, S, test) {
  const x = XM_, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, occ = P_.occd;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, eb = o.edge, bkeep = o.bk, big = o.size;
  const lm = o.lime, col = o.col || WH;
  const cr = col[0] + (LIME[0] - col[0]) * lm, cg = col[1] + (LIME[1] - col[1]) * lm, cb = col[2] + (LIME[2] - col[2]) * lm;
  const s0 = S ? S.R[3] : 0, s1 = S ? S.R[4] : 1, s2 = S ? S.R[5] : 0, s3 = S ? S.T[1] : 0, fy = RV_Y, ib = 1 / RVB;
  for (let i = i0, j = i0 * 6; i < i1; i++, j += 6) {
    if (keep < 1 && (i * .6180339887) % 1 > keep) continue;
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    let k = 0;
    if (test) { const d = s0 * px + s1 * py + s2 * pz + s3 - fy; if (d < 0) continue; if (d < RVB) k = 1 - d * ib; }
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
      b = .06 + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
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
/* draw a cloud: S model -> ship (null: in the ship frame); rv: subject to the reveal front */
function drawM(ml, S, o, rv) {
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
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.05, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    const pxe = FOC > 0 && d > FOC ? PX * Math.pow(Math.min(2.4, d / FOC), 1.3) : PX;
    let li = nl - 1; while (li > 0 && ml.sp[li] * Fl / d > pxe * 1.3) li--;
    const i0 = ml.ch[q + 4 + li * 2], i1 = ml.ch[q + 5 + li * 2];
    if (i1 > i0) { runM(ml.lv[li], i0, i1, ml.sp[li], o, S, test); NPM += i1 - i0; }
  }
}
const OA = { a: 1.35, fade: 30, keep: 1, size: .7, edge: .7, lime: 0, bk: 0, back: .1, px: 4.6, col: null };     // the arm
const OP = { a: 1.15, fade: 30, keep: 1, size: .7, edge: .64, lime: 0, bk: 0, back: .1, px: 4.8, col: null };     // machinery
const OS = { a: .62, fade: 30, keep: 1, size: .7, edge: .46, lime: 0, bk: 0, back: .06, px: 5.2, col: null };     // the compartment
const OR = { a: 1.45, fade: 30, keep: 1, size: .8, edge: .7, lime: 0, bk: .12, back: .1, px: 4.6, col: null };    // the round's parts

/* focus: in each beat the station at work (and the arm) drawn full, the rest sparse and dim */
const FPH = [0, 2.05, 3.9, 6.6, 8.3];
const FKEEP = { rack: [1, .3, .22, .22, .2], press: [.3, 1, .3, .22, .2], sabot: [.25, .28, 1, .35, .2], lift: [.3, .25, .3, 1, 1], arm: [1, 1, 1, 1, .4], deck: [.8, .8, .8, .8, .8] };
const FW = {};
function focusAt(u) {
  for (const g in FKEEP) {
    let v = 0;
    for (let i = 0; i < FPH.length; i++) { const a = i ? E.ss(FPH[i] - .3, FPH[i] + .3, u) : 1, b = i < FPH.length - 1 ? E.ss(FPH[i + 1] - .3, FPH[i + 1] + .3, u) : 0; v += a * (1 - b) * FKEEP[g][i]; }
    FW[g] = v;
  }
}
const A0 = new Map();
function foc(o, w) { if (!A0.has(o)) A0.set(o, o.a); o.keep = w; o.a = A0.get(o) * (.35 + .65 * w); return o; }
function unfoc(o) { o.keep = 1; if (A0.has(o)) o.a = A0.get(o); return o; }

/* ---------- models ---------- */
const LV = [.01, .02, .04, .08, .16, .32], LF = [.007, .014, .028, .056, .112, .224], LB = [.024, .048, .096, .192, .384];
let lod = null;
/* the round's parts, as the film's (pc_scan_railgun_parts.js round_, sabotPetal, armature), sampled finer for the
   close shots: the body (a closed shell, driving band, sabot seams), one sabot petal (centred on +X), the armature */
function roundPrims(H) {
  const P = [G.lathe([0, 0, -H], [0, 0, 1], [[0, .1], [.45, .1], [.58, .08], [.66, .045]], { caps: true })];
  P.push(G.lathe([0, 0, -.12], [0, 0, 1], [[0, .104], [.05, .104]], {}));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .3; P.push(G.line([[Math.cos(a) * .101, Math.sin(a) * .101, -H + .02], [Math.cos(a) * .101, Math.sin(a) * .101, .2]], F())); }
  return P;
}
function petalPrims(H) {
  const P = [], n = 6, z0 = -H - .02, z1 = .2, z2 = .27, SA = 58 * DEG, at = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  for (let k = 0; k < n; k++) {
    const a0 = -SA + 2 * SA * k / n, a1 = -SA + 2 * SA * (k + 1) / n;
    P.push(G.hex([at(a0, .103, z0), at(a1, .103, z0), at(a1, .103, z1), at(a0, .103, z1), at(a0, .132, z0), at(a1, .132, z0), at(a1, .132, z1), at(a0, .132, z1)], { ds: .7 }));
    P.push(G.hex([at(a0, .106, z1), at(a1, .106, z1), at(a1, .12, z2), at(a0, .12, z2), at(a0, .132, z1), at(a1, .132, z1), at(a1, .158, z2), at(a0, .158, z2)], F({ ds: .7 })));
  }
  for (const z of [z0 + .08, -.1, .1]) { const L = []; for (let k = 0; k <= 12; k++) L.push(at(-SA + 2 * SA * k / 12, .134, z)); P.push(G.line(L, F())); }
  return P;
}
function armaturePrims(H) {
  const z0 = -H - .13, z1 = -H - .085, z2 = -H - .01, P = [];
  P.push(G.box([-.09, -.137, z0], [.09, .137, z1], { ds: .7 }));
  for (const s of [-1, 1]) {
    P.push(G.box([-.09, s > 0 ? .085 : -.137, z1], [.09, s > 0 ? .137 : -.085, z2], { ds: .7 }));
    for (const x of [-.06, 0, .06]) P.push(G.line([[x, s * .138, z0 + .01], [x, s * .138, z2 - .005]], F()));
  }
  P.push(G.line([[-.07, -.06, z0 - .002], [.07, -.06, z0 - .002], [.07, .06, z0 - .002], [-.07, .06, z0 - .002], [-.07, -.06, z0 - .002]], F()));
  return P;
}
/* the arm's links (each in its own joint frame, +y along the link) */
/* a ring of bolt heads (centre c, axis along x or y, radius r, n bolts) */
function bolts(c, ax, r, n, P) {
  for (let k = 0; k < n; k++) {
    const a = (k + .5) / n * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const p = ax === 'x' ? [c[0], c[1] + ca, c[2] + sa] : [c[0] + ca, c[1], c[2] + sa], q = ax === 'x' ? [c[0] + Math.sign(c[0] || 1) * .008, p[1], p[2]] : [p[0], c[1] + .008, p[2]];
    P.push(G.cyl(p, q, .009, F({ caps: true })));
  }
  return P;
}
function armPrims() {
  const P = {};
  P.base = [
    G.box([-.3, -.3, -.3], [.3, -.03, .3], { ds: 1.5 }),                                       // plinth
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => G.cyl([a * .25, -.03, b * .25], [a * .25, .0, b * .25], .022, F())),
    G.lathe([0, -.03, 0], [0, 1, 0], [[0, .23], [.15, .21]], { caps: true }),                 // base housing
    G.box([-.08, -.02, -.34], [.08, .1, -.21]),                                                // cable connector
    G.line([[-.3, -.2, -.301], [.3, -.2, -.301]], F()),
  ];
  bolts([0, .12, 0], 'y', .2, 12, P.base);
  P.turret = [
    G.lathe([0, .12, 0], [0, 1, 0], [[0, .205], [.1, .19]], { caps: true }),
    G.box([-.09, .2, -.15], [.09, .34, .06]),
    ...[-1, 1].map(s => G.box([s * .09, .2, -.13], [s * .165, .6, .28])),                   // shoulder cheeks
    G.cyl([.165, H1, A1], [.29, H1, A1], .088, { caps: true }),                                // J2 gearbox and motor
    G.cyl([.29, H1, A1], [.36, H1, A1], .062, { caps: true }),
    G.cyl([0, .22, -.18], [0, .46, -.18], .066, { caps: true }),                               // J1 motor
    G.cyl([-.06, .53, -.12], [.06, .53, -.12], .028, F()),                                     // counterbalance pin
  ];
  bolts([.36, H1, A1], 'x', .045, 6, P.turret); bolts([-.165, H1, A1], 'x', .1, 10, P.turret);
  P.upper = [
    G.cyl([-.09, 0, 0], [.09, 0, 0], .125, { caps: true }),                                    // J2 hub
    G.hex([[-.075, .07, -.09], [.075, .07, -.09], [.075, .07, .09], [-.075, .07, .09], [-.06, A2 - .07, -.07], [.06, A2 - .07, -.07], [.06, A2 - .07, .07], [-.06, A2 - .07, .07]], { ds: 1.1 }),
    G.cyl([-.075, A2, 0], [.075, A2, 0], .095, { caps: true }),                                // elbow hub
    G.cyl([.075, A2, 0], [.2, A2, 0], .062, { caps: true }),                                   // J3 motor
    G.line([[-.0765, .14, 0], [-.0615, A2 - .12, 0]], F()), G.line([[.0765, .14, 0], [.0615, A2 - .12, 0]], F()),
    G.cyl([-.04, .27, -.092], [.04, .27, -.092], .024, F()),                                   // counterbalance eye
  ];
  bolts([.09, 0, 0], 'x', .1, 10, P.upper); bolts([-.075, A2, 0], 'x', .075, 8, P.upper); bolts([.2, A2, 0], 'x', .045, 6, P.upper);
  P.fore = [
    G.box([-.08, -.22, -.085], [.08, .07, .095], { ds: 1.1 }),                                 // rear housing: J4-6 drives
    ...[[-.04, -.035], [.04, -.035], [0, .05]].map(([x, z]) => G.cyl([x, -.22, z], [x, -.32, z], .032, { caps: true })),
    G.line([[-.081, -.18, .0], [-.081, .05, .0]], F()),
  ];
  P.tube = [
    G.cyl([0, .07, 0], [0, D4 - .11, 0], .058, {}),                                            // forearm (rolls on J4)
    G.lathe([0, .07, 0], [0, 1, 0], [[0, .068], [.035, .068]], F()),
    ...[-1, 1].map(s => G.box([s * .05, D4 - .13, -.045], [s * .076, D4 + .045, .045])),     // wrist fork
  ];
  P.wrist = [G.cyl([-.05, 0, 0], [.05, 0, 0], .048, { caps: true }), G.cyl([0, 0, 0], [0, D6 - .012, 0], .04, {})];
  P.hand = [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, .05], [.014, .05]], { caps: true }),                    // flange
    G.box([-.11, .014, -.045], [.11, .082, .045]),                                             // gripper body
    G.box([-.135, .082, -.02], [.135, .098, .02]),                                             // jaw rail
    G.box([-.04, .02, .045], [.04, .065, .072], F()),                                          // valve block
    G.line([[-.1, .05, -.046], [.1, .05, -.046]], F()),
  ];
  const finger = s => [G.box([0, .082, -.032], [s * .024, .228, .032]), G.box([0, .155, -.026], [-s * .008, .222, .026], F()), G.line([[-s * .009, .16, 0], [-s * .009, .218, 0]], F())];
  P.fingerR = finger(1); P.fingerL = finger(-1);
  return P;
}
/* the body rack (station frame: origin on the pick socket's floor) */
const RK_SLOTS = [[0, 0], [-.3, 0], [.3, 0], [0, .3], [-.3, .3], [.3, .3]];
function rackPrims() {
  const P = [G.box([-.52, -.07, -.2], [.52, -.01, .5], { ds: 1.5 })];
  for (const x of [-.48, .48]) for (const z of [-.16, .46]) P.push(G.box([x - .025, -.65, z - .025], [x + .025, -.07, z + .025]));
  P.push(G.box([-.5, -.46, -.18], [.5, -.43, .48], { edgeOnly: true }));
  for (const [x, z] of RK_SLOTS) { P.push(G.lathe([x, -.01, z], [0, 1, 0], [[0, .124], [.2, .124]], {})); P.push(P_.circ([x, .2, z], [0, 1, 0], .132, F())); }
  P.push(G.panel([[-.46, -.015, -.205], [-.12, -.015, -.205], [-.12, -.06, -.205], [-.46, -.06, -.205]], F()));
  return P;
}
/* the press and the armature feeder (station frame: origin on the nest; the feeder on -x) */
const FP = .3;                                   // the feeder's pitch: armatures queue along the station's +x
function pressPrims() {
  const P = [];
  P.push(G.box([-.3, -.75, -.26], [.3, -.07, .44], { ds: 1.7 }));                             // bed
  P.push(G.box([-.13, -.07, -.13], [.13, 0, .13]));                                            // nest
  P.push(P_.circ([0, .002, 0], [0, 1, 0], .1, F()));
  P.push(G.box([-.17, -.07, .28], [.17, 1.36, .44], { ds: 1.5 }));                             // column
  P.push(G.box([-.15, 1.12, -.14], [.15, 1.36, .28], { ds: 1.5 }));                            // head
  P.push(G.cyl([0, 1.36, 0], [0, 1.68, 0], .085, { caps: true }));                             // ram cylinder
  P.push(G.lathe([0, 1.36, 0], [0, 1, 0], [[0, .115], [.04, .115]], { caps: true }));
  for (const s of [-1, 1]) P.push(G.cyl([s * .1, 1.12, 0], [s * .1, .98, 0], .024, {}));      // guide bushes
  P.push(G.line([[.08, 1.62, 0], [.2, 1.62, .1], [.2, 1.5, .3], [.2, 1.36, .37]], F()), G.line([[.08, 1.42, 0], [.16, 1.42, .1], [.16, 1.36, .3]], F()));
  P.push(G.cyl([.12, 1.36, .36], [.12, 1.58, .36], .032, F()));                                // stack light
  for (let k = 0; k < 5; k++) P.push(G.line([[-.171, .1 + k * .22, .3], [-.171, .1 + k * .22, .42]], F()));
  // the feeder: a chute (two armatures queued on it), its guide rails, the pusher's cylinder on its stand
  P.push(G.box([.13, -.035, -.11], [2 * FP + .17, -.005, .11]));
  for (const dz of [-.106, .106]) P.push(G.box([.15, 0, dz - .01], [2 * FP + .17, .06, dz + .01]));
  P.push(G.cyl([2 * FP + .2, .05, 0], [2 * FP + .58, .05, 0], .045, { caps: true }));
  P.push(G.box([2 * FP + .4, -.75, -.06], [2 * FP + .5, .005, .06]));
  P.push(G.box([2 * FP - .04, -.75, -.1], [2 * FP + .04, -.035, .1]));
  for (let k = 0; k < 6; k++) P.push(G.line([[.18 + k * .1, -.004, -.1], [.18 + k * .1, -.004, .1]], F()));
  return P;
}
const ramRod = () => [G.lathe([0, 0, 0], [0, 1, 0], [[0, .058], [.045, .058]], { caps: true }), G.cyl([0, .045, 0], [0, .6, 0], .03, {}),
  ...[-1, 1].map(s => G.cyl([s * .1, .06, 0], [s * .1, .6, 0], .013, {})), G.box([-.125, .06, -.025], [.125, .095, .025])];
const pusher = () => [G.box([0, 0, -.075], [.022, .1, .075]), G.cyl([.022, .05, 0], [.42, .05, 0], .017, {})];
/* the sabot station, in the round's frame there (Z up, X out from the arm, origin at the round's centre .46 over
   the nest): pedestal, hinge brackets for the three petal arms, the clamp ring's posts and cylinders, a petal bin */
const ZDK = -.46 - .75;                          // the deck in this frame
const HINGE = [.2, 0, -.31];                     // a petal arm's hinge (petal frame, axis along Y)
function sabotPrims() {
  const P = [];
  P.push(G.box([-.28, -.28, ZDK], [.28, .28, -.6], { ds: 1.6 }));
  P.push(G.lathe([0, 0, -.6], [0, 0, 1], [[0, .22], [.14, .22]], { caps: true }));
  P.push(P_.circ([0, 0, -.458], [0, 0, 1], .1, F()));
  for (let k = 0; k < 3; k++) {
    const Rz = R.z(k * TAU / 3);
    for (const s of [-1, 1]) P.push(rbox(Rz, [.17, s * .036, -.46], [.235, s * .05, -.29]));
    P.push(rbox(Rz, [.22, -.03, -.6], [.27, .03, -.46], F()));
  }
  for (const s of [-1, 1]) {
    P.push(G.box([-.04, s * .44 - .03, ZDK], [.04, s * .44 + .03, -.1]));
    P.push(G.cyl([0, s * .44, -.135], [0, s * .29, -.135], .032, { caps: true }));
  }
  P.push(G.box([-.36, -1.0, ZDK + .6], [.36, -.56, ZDK + .64]), G.box([-.36, -1.0, ZDK + .64], [.36, -.56, ZDK + .82], { edgeOnly: true }));
  for (const x of [-.33, .3]) P.push(G.box([x, -.82, ZDK], [x + .03, -.74, ZDK + .6]));
  return P;
}
/* a petal arm (petal frame: the petal on +X): lever, pad on the petal's foot, knuckle on the hinge pin */
const petalArm = () => [
  G.box([.136, -.034, -.33], [.168, .034, -.18]), G.box([.133, -.03, -.3], [.137, .03, -.2], F()),
  G.box([.16, -.03, -.335], [.225, .03, -.285]), G.cyl([HINGE[0], -.046, HINGE[2]], [HINGE[0], .046, HINGE[2]], .016, {}),
];
/* a clamp ring half (+Y half; mirrored for -Y): eight segments of the ring and its rod */
function clampHalf(s) {
  const P = [], n = 8, at = (a, r, z) => [Math.cos(a) * r, s * Math.sin(a) * r, z];
  for (let k = 0; k < n; k++) {
    const a0 = k / n * PI, a1 = (k + 1) / n * PI;
    P.push(G.hex([at(a0, .135, -.165), at(a1, .135, -.165), at(a1, .135, -.105), at(a0, .135, -.105), at(a0, .17, -.165), at(a1, .17, -.165), at(a1, .17, -.105), at(a0, .17, -.105)], { ds: .8 }));
  }
  P.push(G.cyl([0, s * .17, -.135], [0, s * .32, -.135], .013, {}));
  return P;
}
/* the strike-up (ship frame about cell 01's axis): three guide columns (open toward the arm), ties, the ram's barrel
   and pump, the inspection ring with its sensor heads, the scuttle's frame under the floor */
let COLS = null;
function liftPrims() {
  const P = [], cx = P_ ? CELL[0] : 0, cz = CELL[2];
  for (const [x, z] of COLS) P.push(G.box([x - .022, YD, z - .022], [x + .022, YH - .05, z + .022], { ds: .8 }));
  for (const y of [YD + .03, -.55, .62, YH - .1]) P.push(G.line([[cx - .26, y, cz], [cx, y, cz - .27], [cx + .26, y, cz]]));
  P.push(G.box([cx - .32, YD, cz - .36], [cx + .32, YD + .05, cz + .1]));
  P.push(G.cyl([cx, YD + .05, cz], [cx, YD + .3, cz], .085, { caps: true }));
  P.push(G.box([cx - .34, YD, cz - 1.08], [cx + .34, YD + .6, cz - .62], { ds: 1.4 }));
  P.push(G.cyl([cx + .14, YD + .6, cz - .85], [cx + .14, YD + .86, cz - .85], .09, { caps: true }));
  P.push(G.line([[cx - .1, YD + .3, cz - .62], [cx - .1, YD + .2, cz - .3], [cx - .05, YD + .18, cz - .1]], F()), G.line([[cx + .02, YD + .45, cz - .62], [cx + .02, YD + .3, cz - .3], [cx + .03, YD + .26, cz - .1]], F()));
  P.push(G.lathe([cx, Y_RING - .06, cz], [0, 1, 0], [[0, .37], [.12, .37], [.12, .305], [0, .305], [0, .37]], { ds: .9 }));
  for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU; P.push(P_.boxY([cx + Math.sin(a) * .29, Y_RING, cz + Math.cos(a) * .29], [.025, .03, .018], a, F())); }
  for (const [x, z] of COLS) { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz); P.push(P_.bar([x + dx / l * .02, Y_RING, z + dz / l * .02], [cx + dx / l * .31, Y_RING, cz + dz / l * .31], .03, .05)); }
  P.push(G.box([cx - .3, YH - .07, cz - .3], [cx + .3, YH - .02, cz + .3], { edgeOnly: true }));
  P.push(G.box([cx - .34, YH - .2, cz - .34], [cx + .34, YH - .07, cz + .34], { edgeOnly: true }));
  return P;
}
/* the cradle (frame: its top centre; ship axes): disc, three guide fingers, the post, the yoke and its shoes */
function cradlePrims() {
  const P = [G.lathe([0, -.035, 0], [0, 1, 0], [[0, .128], [.035, .128]], { caps: true })];
  for (let k = 0; k < 3; k++) P.push(P_.boxY([Math.sin(k * TAU / 3 + PI / 3) * .132, .04, Math.cos(k * TAU / 3 + PI / 3) * .132], [.018, .075, .012], k * TAU / 3 + PI / 3));
  P.push(G.cyl([0, -.035, 0], [0, -.36, 0], .03, {}));
  P.push(G.box([-.27, -.4, -.03], [.27, -.34, .03]), G.box([-.03, -.4, -.28], [.03, -.34, .0]));
  for (const [x, z] of [[-.26, 0], [.26, 0], [0, -.27]]) P.push(G.box([x - .045, -.43, z - .045], [x + .045, -.3, z + .045]));
  return P;
}
const leafPrims = s => [G.box([0, -.06, -.29], [s * .3, -.03, .29]), G.line([[s * .02, -.025, -.27], [s * .02, -.025, .27]], F())];
/* the magazine itself: deck, frames, stringers, deckhead beams, bulkheads, light fittings */
function deckPrims() {
  const P = [], hw = (z, y) => P_.hullAt(z, y) - .12;
  for (let z = ZA + .1; z < ZF; z += .4) { const w = hw(z, YD); P.push(G.line([[-w, YD, z], [w, YD, z]])); }
  for (let x = -4; x <= 4.01; x += .4) { const L = []; for (let z = ZA + .1; z <= ZF - .09; z += .3) if (hw(z, YD) > Math.abs(x)) L.push([x, YD, z]); if (L.length > 1) P.push(G.line(L)); }
  for (let z = ZA + .6; z < ZF - .1; z += .6) for (const s of [-1, 1]) {
    const L = []; for (let y = YD; y <= YH + .001; y += .25) L.push([s * hw(z, y), y, z]);
    P.push(G.line(L));
    if (Math.abs(z - CELL[2]) > .4) { const w = hw(z, YH - .1); P.push(G.box([-w, YH - .24, z - .035], [w, YH - .04, z + .035], { edgeOnly: true })); }
  }
  for (const y of [-1.05, -.25, .55]) for (const s of [-1, 1]) { const L = []; for (let z = ZA; z <= ZF + .001; z += .3) L.push([s * hw(z, y), y, z]); P.push(G.line(L)); }
  for (const s of [-1, 1]) P.push(G.box([s * 1.65 - .05, YH - .34, ZA], [s * 1.65 + .05, YH - .04, ZF], { edgeOnly: true }));
  for (const z of [ZA, ZF]) {
    const L = []; for (let y = YD; y <= YH + .001; y += .25) L.push([hw(z, y), y, z]);
    for (let y = YH; y >= YD - .001; y -= .25) L.push([-hw(z, y), y, z]);
    L.push(L[0]); P.push(G.line(L));
    for (let x = -3.6; x <= 3.61; x += .6) if (hw(z, YD) > Math.abs(x)) P.push(G.line([[x, YD, z], [x, YH, z]], F()));
    const dx = z === ZA ? -2.1 : 2.1;
    P.push(G.line([[dx - .32, YD + .12, z], [dx - .32, YD + 1.7, z], [dx - .2, YD + 1.85, z], [dx + .2, YD + 1.85, z], [dx + .32, YD + 1.7, z], [dx + .32, YD + .12, z], [dx - .32, YD + .12, z]]));
  }
  for (const [x, z] of [[-1.1, 46.4], [1.1, 46.4], [-1.1, 50.9], [1.1, 50.9]]) P.push(G.box([x - .07, YH - .32, z - .5], [x + .07, YH - .26, z + .5], F({ edgeOnly: true })));
  for (const s of [-1, 1]) P.push(G.box([s * 2.9 - .15, .58, ZA + .2], [s * 2.9 + .15, .64, ZF - .2], F({ edgeOnly: true })));
  return P;
}

/* ---------- state ---------- */
let CELL = null, RM = null, TM = null;
const SF = {}, CLM = {}, QK = {}, RC = {};
const Q = new Float64Array(6), Qa = new Float64Array(6), Qb = new Float64Array(6), PT = [0, 0, 0];
function ik(p, q) {
  const th = p[0] * DEG, h = p[2] - RM[1] - H1, w = p[1] - LT - A1;
  const D2 = w * w + h * h, D = Math.sqrt(D2);
  const ca = E.clamp((A2 * A2 + D2 - D4 * D4) / (2 * A2 * D), -1, 1);
  const q2 = Math.atan2(w, h) - Math.acos(ca);
  const tf = Math.atan2(w - A2 * Math.sin(q2), h - A2 * Math.cos(q2));
  q[0] = th; q[1] = q2; q[2] = tf - q2; q[3] = 0; q[4] = PI / 2 - tf; q[5] = 0;
  return q;
}
function armAt(u, q) {
  let s = PLAN[PLAN.length - 1];
  for (let i = 0; i < PLAN.length; i++) if (u < PLAN[i][1]) { s = PLAN[i]; break; }
  const w = kk(u, s[0], s[1]), a = s[3], b = s[4] || s[3];
  if (s[2] === 'L') { const pa = PZ[a], pb = PZ[b]; for (let k = 0; k < 3; k++) PT[k] = pa[k] + (pb[k] - pa[k]) * w; ik(PT, q); }
  else { const qa = QK[a], qb = QK[b]; for (let k = 0; k < 6; k++) q[k] = qa[k] + (qb[k] - qa[k]) * w; }
  return q;
}
/* the arm's link frames (model -> ship) for joint angles q */
const LK = {};
function fk(q) {
  LK.base = TM;
  LK.turret = X.mul(TM, X.make(R.y(q[0])));
  LK.upper = X.mul(LK.turret, X.make(R.x(q[1]), [0, H1, A1]));
  LK.fore = X.mul(LK.upper, X.make(R.x(q[2]), [0, A2, 0]));
  LK.tube = X.mul(LK.fore, X.make(R.y(q[3])));
  LK.wrist = X.mul(LK.tube, X.make(R.x(q[4]), [0, D4, 0]));
  LK.hand = X.mul(LK.wrist, X.make(R.y(q[5]), [0, D6, 0]));
  return LK;
}
const sfAt = (deg, r, y) => X.make(R.y(deg * DEG), [RM[0] + Math.sin(deg * DEG) * r, y, RM[2] + Math.cos(deg * DEG) * r]);
const rfAt = (S, x, y, z) => X.mul(S, X.make(RO_L, [x, y, z]));
const heldRF = (q, L) => { const p = X.ap(L.hand, [0, LG, 0]); return X.make(R.mul(R.y(q[0] - PI / 2), ROT_UP), [p[0], p[1] - GZ_, p[2]]); };
const PET = [0, 1, 2].map(k => R.z(k * TAU / 3));
const R_LIE = R.y(PI / 2);                          // a spare petal lying in its bin, convex side down, along X
const pivY = (a, h) => { const Rm = R.y(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
/* the state at u: everything's frame (ship), filled each frame and read by draw, FX, tags */
const ST = {};
function stateAt(u) {
  const s = ST;
  s.q = armAt(u, Q); fk(s.q); s.grip = gripAt(u);
  s.cr = cradleAt(u);
  s.LF = X.make(R.y(-PI), [CELL[0], s.cr, CELL[2]]);                       // the cradle's station frame
  s.armX = X.mul(SF.pr, X.make(RO_L, [FP * (1 - pushAt(u)), .46, 0]));       // the armature (until it is seated)
  s.arm2 = X.mul(SF.pr, X.make(RO_L, [FP * (2 - pushAt(u)), .46, 0]));       // the next one in the chute
  // the round's frame: in the rack, held, in the press (held), at the sabot station, held, on the cradle
  const h1 = U.hold1, h2 = U.hold2;
  s.held = (u >= h1[0] && u < h1[1]) || (u >= h2[0] && u < h2[1]);
  if (u < h1[0]) s.RF = rfAt(SF.rk, 0, .33, 0);
  else if (u < h1[1]) s.RF = heldRF(s.q, LK);
  else if (u < h2[0]) s.RF = rfAt(SF.sb, 0, .46, 0);
  else if (u < h2[1]) s.RF = heldRF(s.q, LK);
  else s.RF = rfAt(s.LF, 0, .46, 0);
  s.armOn = u >= U.seat;                                                    // the armature rides on the body
  s.petOn = u >= U.pet0 + 1;                                                // the petals ride on the body
  s.petX = PET.map((Rk, k) => { const a = petArm(u, k); return X.mul(rfAt(SF.sb, 0, .46, 0), X.mul(X.make(Rk), pivY(a, HINGE))); });
  s.petP = PET.map((Rk, k) => s.petOn ? X.mul(s.RF, X.make(Rk)) : X.mul(rfAt(SF.sb, 0, .46, 0), X.mul(X.make(Rk), pivY(petAng(u, k), HINGE))));
  const c = clampAt(u), SBR = rfAt(SF.sb, 0, .46, 0);
  s.clampA = X.mul(SBR, tr(0, .2 * (1 - c), 0)); s.clampB = X.mul(SBR, tr(0, -.2 * (1 - c), 0)); s.clamp = c;
  s.ram = X.mul(SF.pr, tr(0, ramAt(u), 0));
  s.push = X.mul(SF.pr, tr(2 * FP + .14 - FP * pusherAt(u), 0, 0));
  s.sct = sctAt(u);
  return s;
}

/* ---------- build ---------- */
const TG = {};
function build(ctx) {
  K = ctx.K; P_ = ctx.P_; CL = ctx.CL; LIME = ctx.LIME; HOT = ctx.HOT; WH = ctx.WH;
  lod = (p, cs, lv) => P_.lod(p, cs || .5, lv);
  YH = P_.FL;
  const a0 = AZ + PI - PI / 6;                                             // cell 01 before the drum indexes (the film's dA at drum 0)
  CELL = [Math.sin(a0) * P_.DRUM_R, 0, P_.GZ + Math.cos(a0) * P_.DRUM_R];
  YC3 = P_.RND_Y0 - .46;
  RM = [CELL[0], YD + .3, 49.0]; TM = X.make(R.I(), RM.slice());
  const rl = Math.hypot(CELL[0] - RM[0], CELL[2] - RM[2]); PZ.lfI[1] = PZ.lfP[1] = rl;
  COLS = [[CELL[0] - .26, CELL[2]], [CELL[0] + .26, CELL[2]], [CELL[0], CELL[2] - .27]];
  SF.rk = sfAt(85, 1.12, -1.1); SF.pr = sfAt(10, 1.08, -1.0); SF.sb = sfAt(-58, 1.08, -1.0);
  for (const k in PZ) QK[k] = ik(PZ[k], new Float64Array(6));
  QK.home[3] = .55; QK.home[5] = -PI / 2; QK.home2[3] = -.5; QK.home2[5] = PI / 2;   // the wrist parked, rolled
  const A = armPrims();
  for (const k in A) CLM[k] = lod(A[k], .35, k === 'hand' || k.startsWith('finger') ? LF : LV);
  CLM.rack = lod(rackPrims(), .5); CLM.press = lod(pressPrims(), .5); CLM.ramRod = lod(ramRod(), .4); CLM.pusher = lod(pusher(), .4, LF);
  CLM.sabot = lod(sabotPrims(), .5); CLM.petArm = lod(petalArm(), .3, LF); CLM.clampA = lod(clampHalf(1), .3, LF); CLM.clampB = lod(clampHalf(-1), .3, LF);
  CLM.lift = lod(liftPrims(), .6); CLM.cradle = lod(cradlePrims(), .4); CLM.leafA = lod(leafPrims(1), .4); CLM.leafB = lod(leafPrims(-1), .4);
  CLM.deck = lod(deckPrims(), 1.2, LB);
  RC.round = lod(roundPrims(P_.RND_H), .3, LF); RC.sabot = lod(petalPrims(P_.RND_H), .3, LF); RC.spare = lod(petalPrims(P_.RND_H), .3, LV); RC.arm = lod(armaturePrims(P_.RND_H), .3, LF);
  for (const k of ['ROB', 'BDY', 'ARM', 'PRS', 'SAB', 'CLR', 'STK', 'PRB', 'SAB2', 'ARM2', 'INS', 'CEL']) TG[k] = K.mkTag();
  camPrep(ctx);
  const SFX = ctx.STAGE.SFX;
  const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
  const tick = () => SFX.tone(1650, 1650, .04, 'square', .008);
  const clack = () => { SFX.tone(900, 300, .06, 'square', .012); SFX.noise(.08, 3000, .8, .02, .002); };
  const whirr = (f0, f1, d) => () => { SFX.tone(f0, f1, d, 'sawtooth', .009); SFX.noise(d, 900, .7, .01, .2); };
  const servo = (d, f) => () => { SFX.tone(f, f * 1.25, d, 'triangle', .008); SFX.tone(f * 2.01, f * 2.4, d, 'sine', .004); };
  RGM.cues = [
    [.1, () => SFX.tone(900, 2600, .9, 'sine', .012)], [.4, servo(.75, 340)], [1.15, servo(.25, 420)], [1.45, clack], [1.55, servo(.43, 400)],
    [U.push0, whirr(400, 620, .45)], [U.push1, clack], [1.98, servo(.52, 360)], [2.5, servo(.4, 420)], [U.ram0, whirr(160, 90, .44)],
    [U.seat, clunk], [U.ramR0, whirr(90, 150, .34)], [3.4, servo(.4, 400)], [3.8, servo(.5, 360)], [4.3, servo(.4, 420)], [4.72, clack],
    [U.pet0, whirr(300, 420, .6)], ...[0, 1, 2].map(k => [U.pet0 + k * U.petD + U.petL, tick]), [U.clamp0, whirr(500, 700, .17)],
    [U.clamp1, clunk], [U.clamp1 + .02, tick], [5.95, clack], [U.unc0, whirr(420, 300, .3)], [6.3, servo(.38, 400)], [6.68, servo(.57, 360)],
    [7.25, servo(.4, 420)], [7.67, clack], [U.lf0, whirr(80, 160, .3)], [U.sc0, () => SFX.tone(1200, 2400, 1.1, 'sine', .008)],
    [U.sc1, tick], [U.sc1 + .09, tick], [U.sct0, whirr(300, 200, .35)], [U.up0, whirr(90, 220, 1.15)], [U.up1, clunk], [U.latch, tick], [U.dn0, whirr(200, 90, .6)],
  ];
}

/* ---------- draw ---------- */
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0], Q4 = [0, 0, 0], QV = new Float64Array(6), QW = new Float64Array(6);
const WP = (S, p) => X.ap(X.mul(WS, S), p);
function drawRoundParts(s, u, o, body) {
  if (body) drawM(RC.round, s.RF, o, true);
  if (s.armOn) drawM(RC.arm, s.RF, o, true);
  if (s.petOn) for (let k = 0; k < 3; k++) drawM(RC.sabot, s.petP[k], o, true);
}
let PRF = null, pt = 0;
const pk = k => { if (!PRF) return; const t = performance.now(); PRF[k] = (PRF[k] || 0) + t - pt; pt = t; };
function draw(u, ctx) {
  PRF = RGM.prof || null; if (PRF) pt = performance.now();
  WS = ctx.Ws; FOC = ctx.RO.foc || 0;
  const s = stateAt(u), ap = ctx.apI;
  RV_Y = frontAt(u); RV_ON = RV_Y > YD - .29;
  // cell 01 stays empty in the base's drum until the round is seated in it (the film recomputes st each frame)
  if (u < U.up1 && ctx.st) ctx.st.rnd = 3;
  focusAt(u);
  // the magazine
  pk('state'); OS.lime = 0; foc(OS, FW.deck); drawM(CLM.deck, null, OS, true); unfoc(OS); pk('deck');
  // the strike-up, the scuttle
  foc(OP, FW.lift); OP.lime = 0; drawM(CLM.lift, null, OP, true);
  OP.lime = .5 * lock(u, U.latch); drawM(CLM.cradle, tr(CELL[0], s.cr, CELL[2]), OP, true); OP.lime = 0;
  drawM(CLM.leafA, tr(CELL[0] + .3 * s.sct, YH, CELL[2]), OP, true); drawM(CLM.leafB, tr(CELL[0] - .3 * s.sct, YH, CELL[2]), OP, true);
  pk('lift');
  // the body rack
  foc(OP, FW.rack); foc(OR, FW.rack); drawM(CLM.rack, SF.rk, OP, true);
  OR.lime = 0;
  for (let k = 0; k < 6; k++) if (k || u < U.hold1[0]) drawM(RC.round, rfAt(SF.rk, RK_SLOTS[k][0], .33, RK_SLOTS[k][1]), OR, true);
  pk('rack');
  // the press and its feeder
  foc(OP, FW.press); foc(OR, FW.press); drawM(CLM.press, SF.pr, OP, true);
  OP.lime = .7 * lock(u, U.seat); drawM(CLM.ramRod, s.ram, OP, true); OP.lime = 0;
  drawM(CLM.pusher, s.push, OP, true);
  drawM(RC.arm, s.arm2, OR, true);
  if (!s.armOn) { unfoc(OR); OR.lime = .35 * kk(u, U.push0, U.push0 + .1) * (1 - kk(u, U.seat - .05, U.seat + .3)); drawM(RC.arm, s.armX, OR, true); OR.lime = 0; }
  pk('press');
  // the sabot station
  foc(OP, FW.sabot); foc(OR, FW.sabot); drawM(CLM.sabot, rfAt(SF.sb, 0, .46, 0), OP, true);
  for (let k = 0; k < 3; k++) {
    const mv = u > U.pet0 + k * U.petD - .02 && u < U.pet0 + k * U.petD + U.petL + .02 || u > U.arm0 && u < U.arm1 + .12;
    OP.lime = mv ? .3 : 0; drawM(CLM.petArm, s.petX[k], OP, true);
  }
  OP.lime = .8 * lock(u, U.clamp1) + .2 * s.clamp; drawM(CLM.clampA, s.clampA, OP, true); drawM(CLM.clampB, s.clampB, OP, true); OP.lime = 0;
  foc(OR, .3 * FW.sabot);
  for (let k = 0; k < 6; k++) drawM(RC.spare, X.mul(rfAt(SF.sb, 0, .46, 0), X.make(R_LIE, [.04, k < 3 ? -.68 : -.88, ZDK + .64 + .134 + (k % 3) * .028])), OR, true);
  foc(OR, FW.sabot);
  if (!s.petOn) for (let k = 0; k < 3; k++) { OR.lime = .7 * lock(u, U.pet0 + k * U.petD + U.petL); drawM(RC.sabot, s.petP[k], OR, true); }
  OR.lime = 0; unfoc(OR);
  pk('sabot');
  // the arm
  const q = s.q;
  armAt(u + .03, QV); armAt(u - .03, QW);
  foc(OA, FW.arm); OA.lime = 0;
  drawM(CLM.base, LK.base, OA, true); drawM(CLM.turret, LK.turret, OA, true); drawM(CLM.upper, LK.upper, OA, true);
  drawM(CLM.fore, LK.fore, OA, true); drawM(CLM.tube, LK.tube, OA, true); drawM(CLM.wrist, LK.wrist, OA, true); drawM(CLM.hand, LK.hand, OA, true);
  drawM(CLM.fingerR, X.mul(LK.hand, tr(s.grip, 0, 0)), OA, true); drawM(CLM.fingerL, X.mul(LK.hand, tr(-s.grip, 0, 0)), OA, true);
  unfoc(OA); unfoc(OP);
  pk('arm');
  // the round (in the rack it is drawn with the rack's bodies)
  if (u >= U.hold1[0]) {
    const seated = u >= U.up1;
    OR.lime = .35 * lock(u, U.seat) + .3 * lock(u, U.hold2[1]) + .6 * lock(u, U.latch);
    const fadeEnd = 1 - kk(u, LEN - .45, LEN);
    if (seated) { OR.a = 1.45 * fadeEnd; OR.keep = Math.max(.05, fadeEnd); }
    drawRoundParts(s, u, OR, !seated);
    OR.a = 1.45; OR.keep = 1; OR.lime = 0;
  }
  pk('round');
  drawFX(u, s, ctx, q); pk('fx');
}

/* ---------- FX: joint drives, the gripper, the press, the petals and the clamp, the scan, the strike-up, the
   reveal front ---------- */
const MOTORS = [   // [link, centre, axis (local), radius, joint index, gear ratio]
  ['turret', [0, .46, -.18], [0, 1, 0], .05, 0, 40], ['turret', [.36, H1, A1], [1, 0, 0], .05, 1, 40], ['upper', [.2, A2, 0], [1, 0, 0], .05, 2, 40],
  ['fore', [-.04, -.32, -.035], [0, -1, 0], .025, 3, 30], ['fore', [.04, -.32, -.035], [0, -1, 0], .025, 4, 30], ['fore', [0, -.32, .05], [0, -1, 0], .025, 5, 30],
];
const perpOf = d => { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const U_ = V.norm(V.cross(d, a)); return [U_, V.cross(d, U_)]; };
function ramLines(a, b, rc, rr, lc, lit, A) {   // a hydraulic ram between world points a (barrel end) and b (rod end)
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
function revealed(y) { return y > RV_Y; }
function drawFX(u, s, ctx, q) {
  const ap = ctx.apI, odot = P_.odot, oglow = P_.oglow;
  const W = L => X.mul(WS, L);
  // the reveal front: the hull's section where it runs, in lime
  if (RV_ON && RV_Y < YH + .02) {
    // the compartment's section at the front: both sides and the two bulkheads, a closed lime contour
    const A = Math.min(1, (YH + .02 - RV_Y) * 4) * Math.min(1, (RV_Y - YD + .3) * 3);
    let px = 0, py = 0, pz = 0, first = true;
    const seg = (x, z) => { ap(WS, x, RV_Y, z, Q1); if (!first) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 1.4, 1, LIME, .75 * A, LIME, .1 * A, 0); px = Q1[0]; py = Q1[1]; pz = Q1[2]; first = false; };
    for (let z = ZA; z <= ZF + .01; z += .33) seg(P_.hullAt(z, RV_Y) - .12, z);
    for (let z = ZF; z >= ZA - .01; z -= .33) seg(-(P_.hullAt(z, RV_Y) - .12), z);
    seg(P_.hullAt(ZA, RV_Y) - .12, ZA);
  }
  if (!revealed(-1.4)) return;
  // the arm's drives: a lime ring while the joint turns, the motor's marker dots turning with it
  for (const [lk, c, ax, r, j, gr] of MOTORS) {
    const v = Math.abs(QV[j] - QW[j]) / .06, Tl = W(LK[lk]);
    const cw = X.ap(Tl, c), d = X.dir(Tl, ax), [U_, W_] = perpOf(d);
    if (v > .05) K.ringW(cw, U_, W_, r * 1.25, 28, 1, LIME, Math.min(1, v * .9), q[j] * 3);
    const ph = q[j] * gr;
    for (let k = 0; k < 3; k++) { const a = ph + k * TAU / 3, p = V.add(cw, V.add(V.mul(U_, Math.cos(a) * r * .7), V.mul(W_, Math.sin(a) * r * .7))); odot(p[0], p[1], p[2], 1, v > .05 ? LIME : WH, v > .05 ? .9 : .45); }
  }
  // the dress pack: the arm's cable from the base up the turret, along the upper arm, to the forearm and the gripper
  {
    const pts = [WP(LK.base, [0, .06, -.34]), WP(LK.turret, [-.18, .45, -.2]), WP(LK.upper, [-.11, .3, -.08]), WP(LK.upper, [-.1, A2 - .05, -.06]), WP(LK.fore, [-.09, -.12, -.02]), WP(LK.fore, [-.07, .05, .07]), WP(LK.hand, [-.05, .05, .07])];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 10; k++) {
        const t = k / 10, t2 = t * t, t3 = t2 * t;
        for (let c = 0; c < 3; c++) Q1[c] = .5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
        odot(Q1[0], Q1[1], Q1[2], 1, WH, .5);
      }
    }
    // the counterbalance from the turret to the upper arm
    ramLines(WP(LK.turret, [0, .53, -.12]), WP(LK.upper, [0, .27, -.092]), .035, .014, .2, 0, 1);
  }
  // the gripper: its LED lime while it holds, the jaws' contact flashing as they close
  { const Th = W(LK.hand); ap(Th, 0, .06, .075, Q1); odot(Q1[0], Q1[1], Q1[2], 2, s.held ? LIME : WH, s.held ? 1 : .4); if (s.held) oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .4);
    const g = Math.max(lock(u, U.hold1[0]), lock(u, U.hold2[0]));
    if (g > .02) for (const sg of [-1, 1]) { ap(Th, sg * s.grip, LG, 0, Q1); oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .6 * g); odot(Q1[0], Q1[1], Q1[2], 2, HOT, g); } }
  // the arm's status light on its base
  { ap(W(LK.base), .16, .12, -.16, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .8); oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .25); }
  // the rack's slot lights (lime: full)
  { const Tr = W(SF.rk); for (let k = 0; k < 6; k++) { const full = k || u < U.hold1[0]; ap(Tr, RK_SLOTS[k][0], -.04, RK_SLOTS[k][1] - .135, Q1); odot(Q1[0], Q1[1], Q1[2], 2, full ? LIME : WH, full ? .8 : .25); } }
  // the press: its stack light, the cup meeting the nose, the seat
  {
    const Tp = W(SF.pr), on = u > U.ram0 && u < U.ramR1;
    for (let k = 0; k < 3; k++) { ap(Tp, .12, 1.4 + k * .06, .36, Q1); const lit = k === 0 ? (on ? (Math.floor(u * 6) % 2 ? 1 : .3) : 0) : k === 2 ? .8 : .1; odot(Q1[0], Q1[1], Q1[2], 2, k === 2 ? LIME : k === 0 ? HOT : WH, lit); }
    const ct = lock(u, U.ram1), st_ = lock(u, U.seat), Tw = W(s.ram);
    if (ct > .02) { ap(Tw, 0, 0, 0, Q1); oglow(Q1[0], Q1[1], Q1[2], 18, HOT, .5 * ct); }
    if (st_ > .02 && s.armOn) { const Tr = W(s.RF), U_ = X.dir(Tr, [1, 0, 0]), W_ = X.dir(Tr, [0, 1, 0]); ap(Tr, 0, 0, -.34, Q1); K.ringW(Q1, U_, W_, .12 + .15 * (1 - st_), 60, 1, LIME, st_, 0); oglow(Q1[0], Q1[1], Q1[2], 30, LIME, .5 * st_); }
    // the pusher's rod lit while it runs, the feeder's chevrons
    const pv = Math.abs(pusherAt(u + .02) - pusherAt(u - .02)) > .002;
    if (pv) { const Tq = W(s.push); ap(Tq, -.42, .05, 0, Q1); ap(Tq, -.02, .05, 0, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, LIME, .8, LIME, .08, 0); }
  }
  // the sabot station: the petal arms' rams, the seat flashes, the clamp ring's lock
  {
    const Tb = W(rfAt(SF.sb, 0, .46, 0));
    for (let k = 0; k < 3; k++) {
      const Ta = W(s.petX[k]), Rk = PET[k];
      const b = X.ap(Tb, R.ap(Rk, [.25, 0, -.62])), p = X.ap(Ta, [.17, 0, -.22]);
      const mv = (u > U.pet0 + k * U.petD && u < U.pet0 + k * U.petD + U.petL) || (u > U.arm0 + .05 * k && u < U.arm1 + .05 * k) ? 1 : 0;
      ramLines(b, p, .022, .01, .16, mv, 1);
      const f = lock(u, U.pet0 + k * U.petD + U.petL);
      if (f > .02) { const Tp = W(s.petP[k]); for (let j = 0; j < 7; j++) { ap(Tp, .134, 0, -.33 + j * .095, Q1); odot(Q1[0], Q1[1], Q1[2], 2, j % 2 ? LIME : HOT, f); } ap(Tp, .14, 0, 0, Q1); oglow(Q1[0], Q1[1], Q1[2], 22, LIME, .45 * f); }
    }
    const cl = lock(u, U.clamp1);
    if (cl > .02) {
      const U_ = X.dir(Tb, [1, 0, 0]), W_ = X.dir(Tb, [0, 1, 0]); ap(Tb, 0, 0, -.135, Q1);
      K.ringW(Q1, U_, W_, .17 + .12 * (1 - cl), 90, 2, LIME, cl, 0); K.ringW(Q1, U_, W_, .152, 70, 1, HOT, cl, 0);
      for (const sg of [-1, 1]) { ap(Tb, 0, sg * .3, -.135, Q2); oglow(Q2[0], Q2[1], Q2[2], 12, LIME, .7 * cl); ap(Tb, .17, sg * .02, -.135, Q3); odot(Q3[0], Q3[1], Q3[2], 2, HOT, cl); }
    }
    // the station's arm lights: one per petal arm, lime once its petal is in
    for (let k = 0; k < 3; k++) { const p = X.ap(Tb, R.ap(PET[k], [.27, 0, -.6])); const lit = u > U.pet0 + k * U.petD + U.petL && u < U.unc0 + .1; odot(p[0], p[1], p[2], 2, lit ? LIME : WH, lit ? .9 : .3); }
  }
  // the strike-up: the ram's stages, the cradle's light, the drag chain, the scuttle, the scan, the latch
  {
    const cx = CELL[0], cz = CELL[2], top = s.cr - .4, b0 = YD + .3, ext = top - b0;
    const st2 = b0 + ext * .5, mvL = Math.abs(cradleAt(u + .02) - cradleAt(u - .02)) > .001 ? 1 : 0;
    if (top > b0 + .01 && revealed(b0)) {
      ap(WS, cx, b0 - .05, cz, Q1); ap(WS, cx, st2, cz, Q2); ramLines(Q1, Q2, .066, .05, ext * .5 + .05, 0, 1);
      ap(WS, cx, st2 - .05, cz, Q1); ap(WS, cx, top, cz, Q2); ramLines(Q1, Q2, .052, .04, ext * .5 + .05, mvL, 1);
    }
    ap(WS, cx + .26 - .05, s.cr - .37, cz + .05, Q1); odot(Q1[0], Q1[1], Q1[2], 2, mvL ? LIME : WH, mvL ? 1 : .4);
    // the drag chain: from a fixed bracket half way up the back column, a loop down and up to the carriage
    { const yb = -.3, yc = s.cr - .36, lo = Math.min(yb, yc) - .35, n = 26;
      for (let k = 0; k <= n; k++) { const t = k / n, y = t < .5 ? E.mix(yb, lo, Math.sin(t * PI)) : E.mix(yc, lo, Math.sin(t * PI)), z = cz - .27 - .07 - .09 * Math.sin(t * PI); if (y < RV_Y) continue; ap(WS, cx + .06, y, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .65); } }
    // the scuttle's edges while open
    if (s.sct > .02) for (const sg of [-1, 1]) { ap(WS, cx + sg * .3 * s.sct, YH - .045, cz - .29, Q1); ap(WS, cx + sg * .3 * s.sct, YH - .045, cz + .29, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, LIME, .8 * s.sct, LIME, .06, 0); }
    // the inspection: the scan plane in the ring, the round's section where it cuts, sparks to the sensor heads
    const zr = Y_RING - (s.cr + .46);                                         // the plane in the round's frame
    const scanA = E.sat((u - U.sc0) / .12) * (1 - E.sat((u - U.sc1) / .15));
    if (scanA > .01 && revealed(Y_RING)) {
      ap(WS, cx, Y_RING, cz, Q1); const U_ = X.dir(WS, [1, 0, 0]), W_ = X.dir(WS, [0, 0, 1]);
      for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) { if ((i + j) & 1 || i * i + j * j > 49) continue; ap(WS, cx + i * .04, Y_RING, cz + j * .04, Q2); K.dotW(Q2[0], Q2[1], Q2[2], 1, LIME, .22 * scanA); }
      K.ringW(Q1, U_, W_, .3, 120, 2, LIME, .8 * scanA, u * 2); K.ringW(Q1, U_, W_, .29, 90, 1, HOT, .5 * scanA, -u * 3);
      if (zr > -.47 && zr < .34) {
        const rb = zr > .25 ? .1 - (zr - .12) / .54 * .055 : zr > .12 ? .1 - (zr - .12) / .13 * .02 : .1;   // the body's radius at the cut
        const hasS = zr > -.35 && zr < .27, rs = zr > .2 ? .132 + (zr - .2) / .07 * .026 : .132, isA = zr < -.34;
        K.ringW(Q1, U_, W_, isA ? .14 : rb, 70, 2, HOT, scanA, 0);
        if (hasS) K.ringW(Q1, U_, W_, rs, 80, 1, LIME, .9 * scanA, 0);
        K.glowW(Q1[0], Q1[1], Q1[2], 40, LIME, .25 * scanA);
        const fr = Math.floor(u * 30);
        for (let i = 0; i < 4; i++) { const a = (Math.floor(K.hh(i * 3.3, fr) * 8) + .5) / 8 * TAU, a2 = a + (K.hh(i * 7.1, fr) - .5) * .8, rr = hasS ? rs : rb;
          ap(WS, cx + Math.sin(a) * .28, Y_RING, cz + Math.cos(a) * .28, Q2); ap(WS, cx + Math.sin(a2) * rr, Y_RING + (K.hh(i, fr) - .5) * .05, cz + Math.cos(a2) * rr, Q3); K.arcW(Q2, Q3, i + fr * .1, u, .8 * scanA, .4, LIME); }
      }
      for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU; ap(WS, cx + Math.sin(a) * .275, Y_RING, cz + Math.cos(a) * .275, Q2); odot(Q2[0], Q2[1], Q2[2], 2, LIME, scanA * (.6 + .4 * Math.sin(u * 20 + k))); }
    }
    // the pass: the ring flashes once the scan is through
    const ps = lock(u, U.sc1);
    if (ps > .02) { ap(WS, cx, Y_RING, cz, Q1); K.ringW(Q1, X.dir(WS, [1, 0, 0]), X.dir(WS, [0, 0, 1]), .34 + .1 * (1 - ps), 120, 2, LIME, ps, 0); }
    // the latch dogs at the cell's foot swing in under the armature
    const lt = kk(u, U.up1, U.latch), lf = lock(u, U.latch);
    if (u > U.up1 - .05) for (const sg of [-1, 1]) {
      const a = (1 - lt) * PI / 2; ap(WS, cx + sg * .15, YC3 - .005, cz, Q1); ap(WS, cx + sg * (.15 - .07 * Math.cos(a)), YC3 - .005 - .07 * Math.sin(a), cz, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, lf > .05 ? LIME : WH, .9 * (1 - kk(u, LEN - .4, LEN)));
      if (lf > .02) { oglow(Q2[0], Q2[1], Q2[2], 16, LIME, .6 * lf); }
    }
    if (lf > .02) { ap(WS, cx, YC3 + .2, cz, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 50, LIME, .3 * lf); }
  }
}

/* ---------- tags and readout ---------- */
const BX_PRB = [[-.1, -.1, -.33], [.1, .1, .33]], BX_SAB = [[-.16, -.16, -.35], [.16, .16, .27]], BX_ARM = [[-.09, -.137, -.46], [.09, .137, -.34]];
function tags(u, ctx) {
  const s = ST, ta = ctx.tagAt, W = L => X.mul(WS, L);
  const win = (t0, t1) => E.sat((u - t0) / .2) * (1 - E.sat((u - t1 + .4) / .4));
  const tag = (k, id, lab, val, Lf, p, t0, t1) => { const a = win(t0, t1); if (a > .01 && revealed(X.ap(Lf, p)[1])) ta(TG[k], id, lab, val, X.ap(W(Lf), p), a, u - t0); };
  tag('BDY', 'BDY', 'Probe bodies', `×${u < U.hold1[0] ? 6 : 5}`, SF.rk, [.3, .5, .3], .95, 2.3);
  tag('ROB', 'ROB', 'Handling arm · 6-axis', '', LK.upper, [.1, A2 * .55, 0], 1.6, 2.9);
  tag('ARM', 'ARM', 'Armature', '', SF.pr, [FP * (1 - pushAt(u)), .1, -.1], 1.95, 3.1);
  tag('PRS', 'PRS', 'Press', `${Math.round((1.15 - ramAt(u)) * 1000)} mm`, s.ram, [.06, .2, 0], 2.85, 3.75);
  tag('SAB', 'SAB', 'Sabot · 3 petals', '', rfAt(SF.sb, 0, .46, 0), [.45, .1, .05], 4.9, 5.75);
  tag('CLR', 'CLR', 'Clamp ring', u > U.clamp1 ? 'locked' : '', rfAt(SF.sb, 0, .46, 0), [0, -.3, -.135], 5.55, 6.25);
  tag('STK', 'STK', 'Strike-up', '', tr(CELL[0], s.cr, CELL[2]), [.26, -.36, 0], 7.85, 8.6);
  // the inspection: each part boxed as the plane reaches it
  const zr = Y_RING - (s.cr + .46), on = u > U.sc0 && u < U.sc1 + .8;
  if (on) {
    const Tr = W(s.RF);
    const part = (k, id, lab, bx, ztop, pt) => {
      if (zr > ztop + .02) return;
      const a = E.sat((ztop - zr) / .06) * (1 - E.sat((u - U.sc1 - .5) / .3));
      if (a < .01) return;
      const b = K.boxOf(bx[0], bx[1], Tr, 4); if (b) K.bracket(b, '#C6F432', .9 * a, 8, 1.2);
      ta(TG[k], id, lab, '', X.ap(Tr, pt), a, (ztop - zr) / .3);
    };
    part('PRB', 'PRB', 'Probe · inert', BX_PRB, .33, [.1, 0, .25]);
    part('SAB2', 'SAB', 'Sabot ×3', BX_SAB, .27, [.16, 0, -.05]);
    part('ARM2', 'ARM', 'Armature', BX_ARM, -.34, [.09, .14, -.4]);
  }
  tag('INS', 'INS', 'Inspection', 'pass', tr(CELL[0], Y_RING, CELL[2]), [-.37, 0, 0], U.sc1 - .05, U.sc1 + 1.0);
  tag('CEL', 'CEL', 'Drum · cell 01', '', tr(CELL[0], YC3, CELL[2]), [.12, .3, 0], U.up1 - .2, LEN - .3);
}
function readout(u) {
  let l1, l2;
  if (u < 1.3) { l1 = 'Magazine · <b>lower deck</b>'; l2 = 'Round <b>called</b> · cell 01'; }
  else if (u < 2.75) { l1 = 'Round · <b>assembly</b>'; l2 = u < 1.55 ? 'Probe body <b>picked</b>' : u < U.push1 ? 'Armature <b>fed</b>' : 'Probe body <b>to the press</b>'; }
  else if (u < 3.8) { l1 = 'Press · <b>armature</b>'; l2 = u < U.seat ? `Ram <b>${Math.round((1.15 - ramAt(u)) * 1000)} mm</b>` : 'Armature <b>seated</b>'; }
  else if (u < 6.5) { l1 = 'Sabot · <b>3 petals</b>'; l2 = u < U.pet0 ? 'Body <b>set</b>' : u < U.clamp0 ? 'Petals <b>closing</b>' : u < U.clamp1 ? 'Clamp ring <b>closing</b>' : 'Sabot ×3 <b>seated</b>'; }
  else if (u < U.sc0) { l1 = 'Round · <b>assembled</b>'; l2 = 'To the <b>strike-up</b>'; }
  else if (u < U.sc1) { const zr = Y_RING - (cradleAt(u) + .46); l1 = 'Inspection · <b>scan</b>'; l2 = `${zr < .3 ? '<b>Probe</b>' : 'Probe'} · ${zr < .25 ? '<b>sabot</b>' : 'sabot'} · ${zr < -.36 ? '<b>armature</b>' : 'armature'}`; }
  else if (u < U.up1) { l1 = 'Inspection · <b>pass</b>'; l2 = 'Strike-up <b>to the drum</b>'; }
  else { l1 = 'Magazine · <b>round stowed</b>'; l2 = 'Drum <b>cell 01</b>'; }
  return { l1, l2, rate: 1 };
}
/* while the lens is down in the magazine the room and the ship are background, seen through the floor: their dots
   are spaced wider (the film sets these each frame from K.DQ before this runs; back to its own by the end) */
function xray(u, XS, ctx) {
  const f = 1 + .6 * (kk(u, .5, 1.2) - kk(u, 10.9, 11.55)) + .35 * (kk(u, 8.6, 9.0) - kk(u, 10.6, 11.2));
  if (f > 1.001) for (const o of [ctx.SO, ctx.RO, ctx.MO]) if (o) o.px *= f;
  return true;
}

window.RGM = { len: LEN, room: true, build, chapters: [{ t: 0, title: 'Magazine' }], cues: [], cam, draw, xray, readout, tags, dbg: () => ({ ST, CELL, RM, SF, U, np: () => { const n = NPM; NPM = 0; return n; } }) };
})();
