/* SCAN · RAILGUN insert: the round made on board (window.RGM; the insert API is in pc_scan_railgun_film.js, "inserted
   sequences"; the round is window.RGR, pc_scan_railgun_round.js). Under the power room, a fabrication deck: the lens
   holds on the loader while the X-ray opens down through the room's floor, then cranes down into the deck. A six-axis
   arm on a floor track lifts a bare tungsten rod out of its rack and lays it between the centres of a line shuttle.
   The coater's head, a C-ring of eight articulated micro-arms (one per trace), closes round the rod: each arm reaches
   in, its hand splits into three sub-arms and each of those into three finger-arms (1 -> 3 -> 9: 72 fingertips), and
   every fingertip writes conductor into the rod's eight engraved channels with a tiny laser, flicking along them
   thirteen times a second (shown at x0.22 and x0.07, then real time) while the head runs the rod's length; the hands
   close and fold away. The shuttle carries the rod into the lattice grower: a deposition ring sweeps the sabot's length
   and the three segments' lattice forms layer by layer behind it (a loupe shows a strut's own micro-lattice with a µm
   scale bar). At the press two rams close the armature's halves on the sabot's rear face and a capacitor bank's
   current fuses them. The charge ring runs tail to nose charging the circuit (its band X-rays the channels), the charge
   then runs the traces nose to tail again and again (the whole circuit X-rayed), and the ring comes back as a
   profilometer (the tolerance scan: laser fans, the runout plotted along the round against its band). The arm stands
   the finished round on the strike-up (held), which lifts it through a scuttle into the magazine cell the loader takes
   next (window.RGP.MAG_CELL, else the drum's cell 01); the lens rises with it and settles where the loader takes over.
   Frames: ship (+Z fwd, +X stbd, y up from the waterline); the round on the line: its Z forward, X down, Y to stbd
   (R_LINE); the arm's base on its track carriage (its links each +y along the link); a micro-arm's links in the
   head's frame (the line's round frame at the head), each +y along the link, x its joint's axis. Render is a pure
   function of u (s into the insert). */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const G = GEO;
const F = o => Object.assign({ fine: true }, o || {});

/* ---------- time and place ---------- */
const LEN = 102.8;
const AZ = Math.atan2(7200, 15600);              // the mount's train (the film's PSI): where the drum's cell 01 sits
const YD = -1.75, ZA = 41.6, ZF = 52.25;         // the fabrication deck and its bulkheads (its deckhead: the room's floor)
const XL = -2.1, YL = YD + 1.1;                  // the line: the rod's axis (along z)
const ZC = 43.4, ZG = 46.5, ZR = 49.6;           // the stations (the rod's centre): coater, grower, armature + ring
const XA = -1.1, YB = YD + .3;                   // the arm's track (clear of the strike-up's columns), its base's top
const R_LINE = R.z(-PI / 2);                     // the round on the line: X down, Y to stbd, Z fwd
const kk = (u, a, b) => E.ss(a, b, u);
const lock = (u, t0) => { const a = u - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
/* 0..1 over a..b at a constant speed between ramps of r s at each end (smooth starts and stops) */
function trap(u, a, b, r) {
  const L = b - a; r = Math.min(r, L / 2); const v = 1 / (L - r), t = E.clamp(u - a, 0, L);
  if (t < r) return v * t * t / (2 * r);
  if (t > L - r) { const q = L - t; return 1 - v * q * q / (2 * r); }
  return v * (t - r / 2);
}

/* the beats (u) */
const U = {
  rv0: .3, rv1: 2.8,                                          // the X-ray front opens down into the deck
  grip1: 11.9, cen0: 14.7, cen1: 14.95, load: 15.0,           // the rod gripped in the rack, the centres closed on it, released
  co0: 16.6,                                                  // the coater's clock starts
  sh1a: 45.8, sh1b: 48.3,                                     // the shuttle to the grower
  gr0: 48.6, gr1: 58.2,                                       // the lattice grown
  sh2a: 59.8, sh2b: 62.3,                                     // the shuttle to the press
  am0: 62.8, am1: 64.6, fuse: 65.2, amR0: 66.8, amR1: 67.6,   // the halves pressed, fused, the rams back
  ri0: 67.4, riS0: 68.2, riS1: 73.6,                          // the charge ring: in, its sweep tail to nose
  rp0: 73.8, rp1: 79.2,                                       // the charge run nose to tail again and again (X-rayed)
  tl0: 79.4, tl1: 84.6, riE: 85.4,                            // the tolerance scan nose to tail, the ring out past the tail
  unl: 86.5, cenR0: 86.55, cenR1: 86.8,                       // the arm takes the round; the centres draw back
  place: 90.4,                                                // set on the strike-up
  hero0: 91.0, hero1: 96.6,                                   // the finished round held
  sct0: 96.2, sct1: 96.6, up0: 96.7, up1: 99.2, latch: 99.3, dn0: 99.4, dn1: 100.1, sctC0: 99.6, sctC1: 100.0,
  cl0: 99.8, cl1: 100.8,                                      // the X-ray front closes back up
};
/* the coater's clock (its own seconds, tau): real time to the rod, x0.22 while the hands open and start writing, up to
   real time down the first quarter of the rod, x0.07 for the close look at the fingertips writing, real time on to the
   nose, x0.3 while the hands fold */
const CW = FILM.warp([{ t: 0, rate: 1 }, { t: 1.0, rate: 1 }, { t: 1.6, rate: .22 }, { t: 10.6, rate: .22 }, { t: 11.6, rate: 1 }, { t: 12.2, rate: 1 },
  { t: 13.6, rate: .07 }, { t: 19.4, rate: .07 }, { t: 21.8, rate: 1 }, { t: 23.4, rate: 1 }, { t: 23.8, rate: .3 }, { t: 26.2, rate: .3 }, { t: 26.6, rate: 1 }, { t: 40, rate: 1 }]);
const tauAt = u => u < U.co0 ? 0 : CW(u - U.co0);
const coRate = u => u < U.co0 || u > U.co0 + 28.6 ? 1 : CW.rate(u - U.co0);
const uOfTau = tau => { let a = 0, b = 40; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (CW(m) < tau) a = m; else b = m; } return U.co0 + (a + b) / 2; };
/* the coater's schedule (tau): the head to the rod's tail, the arms reach in (staggered per arm), the hands split
   (1 -> 3, then 3 -> 9), the writing run tail to nose at VCO, the hands fold (9 -> 3 -> 1, the arms back), the head off
   past the nose, the circuit tested */
const CO = { go0: .05, go1: 1.05, d0: 1.4, W0: 3.05, VCO: .28, Z0: -.68, Z1: .975 };
CO.W1 = CO.W0 + (CO.Z1 - CO.Z0) / CO.VCO; CO.off0 = CO.W1 + .85; CO.off1 = CO.W1 + 1.65; CO.ts0 = CO.W1 + 1.5; CO.ts1 = CO.W1 + 2.5;
function headZ(t) {                                          // the coater head's z on the rod (round frame)
  if (t < CO.W0) return E.mix(-1.32, CO.Z0, E.ss(CO.go0, CO.go1, t));
  if (t < CO.W1) return CO.Z0 + (t - CO.W0) * CO.VCO;
  return E.mix(CO.Z1, 1.32, E.ss(CO.off0, CO.off1, t));
}
const writeAt = t => E.ss(CO.W0 - .04, CO.W0 + .06, t) * (1 - E.ss(CO.W1 - .06, CO.W1, t));
const HAND = .0225;                                          // the open hand's half span along the rod
const laidAt = t => t < CO.W0 ? -9 : t < CO.W1 + .5 ? Math.min(headZ(t), CO.Z1) + HAND : 9;
const shuttleZ = u => u < U.sh1a ? ZC : u < U.sh2a ? E.mix(ZC, ZG, kk(u, U.sh1a, U.sh1b)) : E.mix(ZG, ZR, kk(u, U.sh2a, U.sh2b));
const quillAt = u => kk(u, U.cen0, U.cen1) * (1 - kk(u, U.cenR0, U.cenR1));
const growAt = u => 1.08 * kk(u, U.gr0 + .2, U.gr1 - .25);
function ringZ(u) {                                          // the charge ring's z on the round (round frame)
  if (u < U.riS0) return E.mix(-1.34, -.95, kk(u, U.ri0, U.riS0));
  if (u < U.riS1) return E.mix(-.95, .95, trap(u, U.riS0, U.riS1, .8));
  if (u < U.tl0) return .95;
  if (u < U.tl1) return E.mix(.95, -.95, trap(u, U.tl0, U.tl1, .8));
  return E.mix(-.95, -1.34, kk(u, U.tl1, U.riE));
}
const armClose = u => kk(u, U.am0, U.am1);
/* the tolerance scan's measurement: the round's runout along it (µm, a smooth profile well inside the ±TOL_B band) */
const TOL_B = 4;
const runout = z => 1.1 + .9 * Math.sin(z * 7.3 + .6) + .55 * Math.sin(z * 17.1 + 2.1) + .3 * Math.sin(z * 41 + 1.3);
let TOLMAX = 0;
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
  [0, 10.4, 'H', 'home'], [10.4, 11.4, 'J', 'home', 'rkA'], [11.4, 11.8, 'L', 'rkA', 'rkG'], [11.8, 12.2, 'H', 'rkG'],
  [12.2, 12.6, 'L', 'rkG', 'rkU'], [12.6, 14.0, 'J', 'rkU', 'lnA'], [14.0, 14.6, 'L', 'lnA', 'lnP'], [14.6, 15.25, 'H', 'lnP'],
  [15.25, 15.65, 'L', 'lnP', 'lnR'], [15.65, 18.4, 'J', 'lnR', 'pk1'], [18.4, 84.2, 'H', 'pk1'], [84.2, 85.6, 'J', 'pk1', 'unA'],
  [85.6, 86.1, 'L', 'unA', 'unG'], [86.1, 87.1, 'H', 'unG'], [87.1, 87.5, 'L', 'unG', 'unU'], [87.5, 87.9, 'L', 'unU', 'unR'],
  [87.9, 89.4, 'J', 'unR', 'stA'], [89.4, 90.0, 'L', 'stA', 'stP'], [90.0, 90.5, 'H', 'stP'], [90.5, 90.9, 'L', 'stP', 'stR'],
  [90.9, 92.4, 'J', 'stR', 'home2'], [92.4, 999, 'H', 'home2'],
];
const GRIP_OPEN = .2, GRIP_ROD = .0135, GRIP_RND = .142;
const gripAt = u => u < 11.8 ? GRIP_OPEN : u < 15.1 ? E.mix(GRIP_OPEN, GRIP_ROD, kk(u, 11.8, 11.92)) : u < 86.3 ? E.mix(GRIP_ROD, GRIP_OPEN, kk(u, 15.1, 15.22))
  : u < 90.2 ? E.mix(GRIP_OPEN, GRIP_RND, kk(u, 86.3, 86.45)) : E.mix(GRIP_RND, GRIP_OPEN, kk(u, 90.2, 90.35));
const G_ROD = 11.9, G_RND = 86.42;                           // the jaws take the rod, the round
const ZGRIP = -.07;                                          // where it holds the finished round (its sabot's middle)

/* ---------- the camera: shots (ship frame, functions of u: holds, or follows of a moving subject) joined by eased
   transitions (SEQ: [shot, u0, u1], the move into it from the shot before), a slow drift while it holds; the base
   camera (ctx.camOld, the view the loader starts from) held at the start with its own motion eased out, and returned
   to at the end with its motion eased back in ---------- */
const DBG = (() => {
  let s = STAGE.Q.get('cam');
  try { if (!s && window.parent !== window) s = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  if (!s) return null; const a = s.split(',').map(Number); return { eye: a.slice(0, 3), target: a.slice(3, 6), fov: (a[6] || 40) * DEG };
})();
let SEQ = null, SH = null, CTXR = null, VOLD = null, T_AT = 29;
const TV = .45;                                               // the base camera's motion eased out / back in over this (s)
const sm = w => w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w);
const toShip = (Ws, p) => { const M = Ws.R, x = p[0] - Ws.T[0], y = p[1] - Ws.T[1], z = p[2] - Ws.T[2]; return [M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z]; };
const dirShip = (Ws, v) => { const M = Ws.R; return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; };
function oldShot(u, entry) {
  const o = CTXR.camOld || CTXR.camAt(T_AT), Ws = CTXR.Ws || X.make(), ve = dirShip(Ws, VOLD.eye), vt = dirShip(Ws, VOLD.target);
  const k = entry ? TV * (1 - Math.exp(-u / TV)) : -TV * (1 - Math.exp((u - LEN) / TV));
  return { eye: V.mad(toShip(Ws, o.eye), ve, k), target: V.mad(toShip(Ws, o.target), vt, k), fov: (o.fov + VOLD.fov * k) / DEG, old: 1 };
}
const shotAt = (nm, u) => nm === 'old' ? oldShot(u, true) : nm === 'oldX' ? oldShot(u, false) : SH[nm](u);
function camS(u) {
  let i = 0; while (i < SEQ.length - 1 && SEQ[i + 1][1] <= u) i++;
  const q = SEQ[i]; let s = shotAt(q[0], u);
  if (i > 0 && u < q[2]) {
    // (the move: the target slides, the line of sight turns at an even rate (slerp), the distance eases between; a
    // pull-back widens first and turns after, a push-in turns first and narrows after; the field of view in ratio)
    const p = shotAt(SEQ[i - 1][0], u), r = (u - q[1]) / (q[2] - q[1]), zo = s.fov > p.fov * 1.8, zi = s.fov < p.fov / 1.8;
    // (a zoom runs over .85 of the move, never a crash: the moves that zoom are 3.6 s or longer)
    const w = sm(zo ? (r - .3) / .7 : zi ? r / .7 : r), wf = sm(zo ? r / .85 : zi ? (r - .15) / .85 : r);
    const da = V.sub(p.target, p.eye), db = V.sub(s.target, s.eye), la = V.len(da), lb = V.len(db), A = V.mul(da, 1 / la), B = V.mul(db, 1 / lb);
    const c = E.clamp(V.dot(A, B), -1, 1), an = Math.acos(c);
    let d;
    if (an < 1e-4) d = A;
    else { const sa = Math.sin(an), ka = Math.sin((1 - w) * an) / sa, kb = Math.sin(w * an) / sa; d = [A[0] * ka + B[0] * kb, A[1] * ka + B[1] * kb, A[2] * ka + B[2] * kb]; }
    const t = V.lerp(p.target, s.target, w), L = la * Math.pow(lb / la, w);
    s = { eye: V.mad(t, d, -L), target: t, fov: p.fov * Math.pow(s.fov / p.fov, wf), old: (p.old || 0) * (1 - w) + (s.old || 0) * w };
  }
  // a slow drift while it holds (none on the base camera): a fraction of the distance, less on the long lenses
  const dw = 1 - (s.old || 0);
  if (dw > .001) { const d = V.dist(s.eye, s.target), amp = .0035 * d * Math.min(1, s.fov / 30) * dw; s.eye = V.add(s.eye, FILM.drift(u, amp, 3.1)); }
  return s;
}
function cam(u, ctx) {
  if (DBG) return DBG;
  CTXR = ctx;
  const s = camS(u), Ws = ctx.Ws;
  return { eye: X.ap(Ws, s.eye), target: X.ap(Ws, s.target), fov: s.fov * DEG };
}
/* the camera's path in the ship frame every dt (for checking its speeds): [u, eye, target, fov deg] */
function camLog(dt) { const out = []; for (let u = 0; u <= LEN + 1e-9; u += dt || .1) { const s = camS(u); out.push([+u.toFixed(3), s.eye, s.target, s.fov]); } return out; }

/* ---------- the point pass: the room's lattice look (1 px dots, edges at a fixed brightness, the room's occluders),
   the deck's reveal (a level front in ship y: points below hidden, a lime band above it), and the lattice's growth
   (a per-point key: points past the front hidden, a lime band of forming cells at it) ---------- */
let K, P_, LIME, HOT, WH, YH, WS = null, FOC = 0, XM_ = null, NPM = 0;
let RV_Y = -99, RV_ON = false;
const RVB = .24, GB = .1;
let XZ = false, XZ0 = 0, XZ1 = 0, XZF = .03, XZK = .3, XZD = .35;     // the round's X-ray band (round z), its edge, the share kept, the dimming
function sphereIn(x, mx, my, mz, rad) {
  const C = K.C, zc = x[6] * mx + x[7] * my + x[8] * mz + x[11];
  if (zc < C.near - rad) return false;
  const xc = x[0] * mx + x[1] * my + x[2] * mz + x[9], yc = x[3] * mx + x[4] * my + x[5] * mz + x[10];
  const Fl = C.fl, xr = (K.BW - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
function runM(P, i0, i1, sp, o, S, test, KY, gt) {
  const x = XM_, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, occ = P_.occd, BW = K.BW, BH = K.BH;
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
    // the X-ray band (model z): its points thinned and dimmed so what is inside shows through
    let xw = 0;
    if (XZ && pz > XZ0 - XZF && pz < XZ1 + XZF) { xw = Math.min(1, (pz - XZ0 + XZF) / XZF, (XZ1 + XZF - pz) / XZF); if ((i * .3819660113) % 1 > 1 - xw * (1 - XZK)) continue; }
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5], two = nx === 0 && ny === 0 && nz === 0;
    let dn = 0;
    if (!two) { dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez); if (dn > 0 && (bkeep === 0 || ((i * .7548776662) % 1) > bkeep)) continue; }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const iz = F_ / zc;
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz; if (sy < 0 || sy >= BH) continue;
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
    if (xw > 0) b *= 1 - xw * (1 - XZD);
    let r = cr, g = cg, bl = cb;
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
    if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    if (sp * iz * big > 6.5 && sx < BW - 1 && sy < BH - 1) {
      const R2 = R_ * .7, G2 = G_ * .7, B2 = B_ * .7;
      let q2 = q + 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
      q2 = q + BW * 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
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
    // (the LOD crossfaded over K.LODB of each octave: K.lodPick, each level on its own share of the keep dither)
    const LP = K.lodPick(ml.sp, nl, Fl, d, pxe * 1.3, 0, K.LODB), la = LP.a, lb = LP.b, wa = LP.wa, wb = LP.wb, kp = o.keep;
    let i0 = ml.ch[q + 4 + la * 2], i1 = ml.ch[q + 5 + la * 2];
    if (i1 > i0) { o.keep = kp * wa; runM(ml.lv[la], i0, i1, ml.sp[la], o, S, test, key ? key[la] : null, gt); NPM += i1 - i0; }
    if (lb >= 0) { i0 = ml.ch[q + 4 + lb * 2]; i1 = ml.ch[q + 5 + lb * 2]; if (i1 > i0) { o.keep = kp * wb; runM(ml.lv[lb], i0, i1, ml.sp[lb], o, S, test, key ? key[lb] : null, gt); NPM += i1 - i0; } }
    o.keep = kp;
  }
}
const OA = { a: 1.3, fade: 30, keep: 1, size: .7, edge: .7, lime: 0, bk: 0, back: .1, px: 4.6, col: null };       // the arm
const OP = { a: 1.15, fade: 30, keep: 1, size: .7, edge: .66, lime: 0, bk: 0, back: .1, px: 4.8, col: null };     // machinery
const OM = { a: 1.9, fade: 30, keep: 1, size: .7, edge: 1.0, lime: 0, bk: 0, back: .12, px: 3.6, col: null, amb: .16 };   // the micro-arms
const OMS = { a: 2.05, fade: 30, keep: 1, size: .7, edge: 1.0, lime: 0, bk: 0, back: .12, px: 2.8, col: null, amb: .22 };  // the sub-arms
const OMF = { a: 2.15, fade: 30, keep: 1, size: .7, edge: 1.0, lime: 0, bk: 0, back: .14, px: 2.6, col: null, amb: .26 };    // the finger-arms
const OS = { a: .55, fade: 30, keep: 1, size: .7, edge: .42, lime: 0, bk: 0, back: .06, px: 5.4, col: null };     // the compartment
const OR = { a: 1.55, fade: 30, keep: 1, size: .8, edge: .8, lime: 0, bk: .12, back: .1, px: 3.9, col: null, amb: .06 };   // the round
const OL = { a: 1.5, fade: 30, keep: 1, size: .8, edge: .9, lime: 0, bk: .1, back: .12, px: 3.9, col: null, amb: .1 };     // the lattice

/* focus: in each beat the station at work drawn full, the rest sparse and dim */
const FPH = [0, 16.4, 46.0, 60.0, 67.4, 85.2];
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
const LM = [.0007, .0014, .0028, .0056, .0112, .0224];     // the fine fittings
const LMP = [.00045, .0009, .0018, .0036, .0072, .0144], LMS = [.0003, .0006, .0012, .0024, .0048, .0096], LMF = [.00018, .00036, .00072, .00144, .0029, .0058];   // the micro-arms, sub-arms, finger-arms
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
    G.box([-.24, -.03 - .2, -.24], [.24, -.03, .24], { ds: 1.5 }),
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
  // the servos' cooling fins (J1 upright, J2 across), the counterbalance's pin boss outside the left cheek
  for (let y = .25; y < .44; y += .03) P.turret.push(G.cyl([0, y, -.18], [0, y + .007, -.18], .074, F({ caps: true })));
  for (const x of [.3, .32, .34]) P.turret.push(G.cyl([x, h1, a1], [x + .007, h1, a1], .07, F({ caps: true })));
  P.turret.push(G.cyl([-.165, .25, -.05], [-.215, .25, -.05], .03, { caps: true }));
  P.upper = [
    G.cyl([-.09, 0, 0], [.09, 0, 0], .125, { caps: true }),
    G.hex([[-.075, .07, -.09], [.075, .07, -.09], [.075, .07, .09], [-.075, .07, .09], [-.06, a2 - .07, -.07], [.06, a2 - .07, -.07], [.06, a2 - .07, .07], [-.06, a2 - .07, .07]], { ds: 1.1 }),
    G.cyl([-.075, a2, 0], [.075, a2, 0], .095, { caps: true }), G.cyl([.075, a2, 0], [.2, a2, 0], .062, { caps: true }),
    G.line([[-.0765, .14, 0], [-.0615, a2 - .12, 0]], F()), G.line([[.0765, .14, 0], [.0615, a2 - .12, 0]], F()),
    G.cyl([-.04, .27, -.092], [.04, .27, -.092], .024, F()),
  ];
  bolts([.09, 0, 0], 'x', .1, 10, P.upper); bolts([-.075, a2, 0], 'x', .075, 8, P.upper); bolts([.2, a2, 0], 'x', .045, 6, P.upper);
  // the casting's pockets (both faces), J3's fins, the counterbalance's upper pin
  for (const sx of [-1, 1]) P.upper.push(G.line([[sx * .0752, .16, -.055], [sx * .0625, a2 - .14, -.045], [sx * .0625, a2 - .14, .045], [sx * .0752, .16, .055], [sx * .0752, .16, -.055]], F()));
  for (const x of [.1, .13, .16]) P.upper.push(G.cyl([x, a2, 0], [x + .007, a2, 0], .07, F({ caps: true })));
  P.upper.push(G.cyl([-.075, .18, -.11], [-.215, .18, -.11], .022, { caps: true }));
  P.fore = [
    G.box([-.08, -.22, -.085], [.08, .07, .095], { ds: 1.1 }),
    ...[[-.04, -.035], [.04, -.035], [0, .05]].map(([x, z]) => G.cyl([x, -.22, z], [x, -.32, z], .032, { caps: true })),
    G.line([[-.081, -.18, .0], [-.081, .05, .0]], F()),
    ...[[-.04, -.035], [.04, -.035], [0, .05]].flatMap(([x, z]) => [-.24, -.265, -.29].map(y => G.cyl([x, y, z], [x, y - .006, z], .037, F({ caps: true })))),
  ];
  P.tube = [G.cyl([0, .07, 0], [0, d4 - .11, 0], .058, {}), G.lathe([0, .07, 0], [0, 1, 0], [[0, .068], [.035, .068]], F()),
    ...[-1, 1].map(s => G.box([s * .05, d4 - .13, -.045], [s * .076, d4 + .045, .045]))];
  P.wrist = [G.cyl([-.05, 0, 0], [.05, 0, 0], .048, { caps: true }), G.cyl([0, 0, 0], [0, d6 - .012, 0], .04, {})];
  P.hand = [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, .05], [.014, .05]], { caps: true }),
    G.box([-.11, .014, -.045], [.11, .082, .045]), G.box([-.16, .082, -.02], [.16, .098, .02]),
    G.box([-.04, .02, .045], [.04, .065, .072], F()), G.line([[-.1, .05, -.046], [.1, .05, -.046]], F()),
    // the jaws' linear guides, the wrist camera's lens
    G.line([[-.15, .099, -.012], [.15, .099, -.012]], F()), G.line([[-.15, .099, .012], [.15, .099, .012]], F()),
    G.lathe([0, .043, .072], [0, 0, 1], [[0, .014], [.016, .012]], { caps: true }),
  ];
  // V-jaws: a notch that centres a 25 mm rod and a flat face for the sabot
  const finger = s => [G.box([0, .082, -.032], [s * .024, .228, .032]), G.box([0, .155, -.026], [-s * .008, .222, .026], F()),
    G.line([[-s * .009, .16, 0], [-s * .009, .218, 0]], F()), G.line([[-s * .0085, .17, -.012], [-s * .0085, .17, .012]], F()), G.line([[-s * .0085, .2, -.012], [-s * .0085, .2, .012]], F())];
  P.fingerR = finger(1); P.fingerL = finger(-1);
  // the track carriage under the base (the base's own frame): plate, rail shoes, the drive
  P.cart = [G.box([-.25, -.33, -.42], [.25, -.24, .42], { ds: 1.4 }), ...[-1, 1].flatMap(sx => [-1, 1].map(sz => G.box([sx * .223 - .035, -.42 + .04, sz * .3 - .07], [sx * .223 + .035, -.33, sz * .3 + .07]))),
    G.cyl([0, -.3, .42], [0, -.3, .53], .05, { caps: true }), G.box([-.25, -.33, -.42], [.25, -.31, .42], F({ edgeOnly: true }))];
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
  // the dressing: spares racks along the sides (uprights, four shelves, cases on them), ladder cable trays under the
  // deckhead each side and across, a control cabinet on the forward bulkhead
  for (const [s, z0, z1] of DRESS_RK) {
    const xi = s * (hw(z0, YD) - .7), xo = s * (hw(z0, YD) - .12), hR = 1.55, n = Math.max(2, Math.round((z1 - z0) / .55));
    for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; for (const x of [xi, xo]) P.push(G.box([x - .025, YD, z - .025], [x + .025, YD + hR, z + .025], F({ edgeOnly: true }))); }
    for (let k = 0; k < 4; k++) {
      const y = YD + .14 + k * .45;
      P.push(G.box([Math.min(xi, xo), y, z0], [Math.max(xi, xo), y + .03, z1], { edgeOnly: true }));
      for (let i = 0; i < n; i++) {                                      // the cases (one bay in five left empty)
        if ((i * 7 + k * 3 + (s > 0 ? 2 : 0)) % 5 === 4) continue;
        const za = z0 + (z1 - z0) * i / n + .05, zb = z0 + (z1 - z0) * (i + 1) / n - .05, hc = k === 3 ? .22 : .3;
        P.push(G.box([Math.min(xi, xo) + .05, y + .03, za], [Math.max(xi, xo) - .05, y + .03 + hc, zb], F({ edgeOnly: true })));
      }
    }
  }
  for (const s of [-1, 1]) {
    const yt = YH - .34, L0 = [], L1 = [], C0 = [];
    for (let z = ZA + .05; z <= ZF - .05 + .001; z += .3) { const w = hw(z, yt) - .25; L0.push([s * w, yt, z]); L1.push([s * (w - .32), yt, z]); C0.push([s * (w - .16), yt + .05, z]); }
    P.push(G.line(L0), G.line(L1), G.line(C0, F()));
    for (let i = 0; i < L0.length; i++) P.push(G.line([L0[i], L1[i]], F()));
  }
  for (const z of [44.6, 50.0]) {
    const yt = YH - .3, w = hw(z, yt) - .6;
    for (const dz of [-.16, .16]) P.push(G.line([[-w, yt, z + dz], [w, yt, z + dz]]));
    for (let x = -w; x <= w + .001; x += .3) P.push(G.line([[x, yt, z - .16], [x, yt, z + .16]], F()));
  }
  P.push(G.box(DRESS_CAB[0], DRESS_CAB[1], { edgeOnly: true }), G.box([DRESS_CAB[0][0] + .06, YD + .95, DRESS_CAB[0][2] - .005], [DRESS_CAB[1][0] - .06, YD + 1.4, DRESS_CAB[0][2]], F({ edgeOnly: true })));
  return P;
}
/* the deck's dressing: racks [side, z0, z1]; the control cabinet's box (its face aft) */
const DRESS_RK = [[-1, 42.0, 44.4], [-1, 45.0, 46.6], [-1, 48.6, 51.2], [1, 49.4, 51.6]];
const DRESS_CAB = [[.3, YD, ZF - .55], [1.3, YD + 1.8, ZF - .12]];
function trackPrims() {
  const P = [], z0 = ZC - .8, z1 = ZR + .8;
  for (const s of [-1, 1]) { P.push(G.box([XA + s * .29 - .03, YD, z0], [XA + s * .29 + .03, YD + .07, z1])); P.push(G.line([[XA + s * .29, YD + .071, z0], [XA + s * .29, YD + .071, z1]], F())); }
  for (let z = z0 + .1; z < z1; z += .45) P.push(G.box([XA - .38, YD, z - .04], [XA + .38, YD + .02, z + .04], F()));
  for (const z of [z0, z1]) P.push(G.box([XA - .36, YD, z - .06], [XA + .36, YD + .16, z + .06]));
  P.push(G.box([XA - .62, YD, z0], [XA - .5, YD + .1, z1], { edgeOnly: true }));           // the cable tray (port of the track)
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
/* (edges as dense dotted hairlines, the faces a sparse fill) */
const ebox = (a, b) => [G.box(a, b, { edgeOnly: true }), G.box(a, b, { ds: 3, noEdge: true })];
const ecyl = (a, b, r) => [G.cyl(a, b, r, { ds: 3, noEdge: true, caps: true }), G.cyl(a, b, r, { edgeOnly: true })];
/* the coater: its side beam on posts (ship frame: a box beam with two rails and a rack on top, posts with feet,
   gussets and bolts, the energy chain's tray); the head (round frame about the head's centre: the C-ring, a servo
   amplifier per arm on its outer face, the feed manifold, the bracket and the carriage round the beam with its drive);
   the eight micro-arms (separate links) */
function coaterPrims() {
  const P = [], xb = XL - .42, z0 = ZC - 1.45, z1 = ZC + 1.45;
  P.push(G.box([xb - .03, YL - .03, z0], [xb + .03, YL + .05, z1], { ds: .9 }));
  for (const s of [-1, 1]) P.push(G.box([xb + s * .018 - .006, YL + .05, z0 + .03], [xb + s * .018 + .006, YL + .062, z1 - .03], F()));
  for (let z = z0 + .05; z < z1 - .04; z += .012) P.push(G.line([[xb - .004, YL + .051, z], [xb + .004, YL + .051, z]], F()));
  for (const dz of [-1.38, 0, 1.38]) {
    P.push(G.box([xb - .035, YD, ZC + dz - .035], [xb + .035, YL - .03, ZC + dz + .035]), G.box([xb - .1, YD, ZC + dz - .1], [xb + .1, YD + .03, ZC + dz + .1]));
    for (const s of [-1, 1]) { const zz = ZC + dz + s * .035, ze = ZC + dz + s * .1; P.push(G.hex([[xb - .006, YD + .03, zz], [xb + .006, YD + .03, zz], [xb + .006, YD + .03, ze], [xb - .006, YD + .03, ze], [xb - .006, YD + .26, zz], [xb + .006, YD + .26, zz], [xb + .006, YD + .26, zz + s * .004], [xb - .006, YD + .26, zz + s * .004]], F())); }
    for (const [bx, bz] of [[-.075, -.075], [.075, -.075], [-.075, .075], [.075, .075]]) P.push(G.cyl([xb + bx, YD + .03, ZC + dz + bz], [xb + bx, YD + .045, ZC + dz + bz], .009, F({ caps: true })));
  }
  P.push(G.box([xb - .09, YL - .035, z0 + .1], [xb - .035, YL - .028, z1 - .1], F()));
  for (let z = ZC - 1.3; z < ZC + 1.35; z += .26) P.push(G.line([[xb + .031, YL - .01, z], [xb + .031, YL + .03, z]], F()));
  return P;
}
function headPrims() {
  const P = [];
  cring(P, .155, .178, -.058, .058, 16 * DEG, 344 * DEG, 20, { e: 3.5 });
  for (const z of [-.058, .058]) P.push(P_.circ([0, 0, z], [0, 0, 1], .166, F()));
  // per arm on the ring's outer face: a servo amplifier (its heat sink's fins across it), the fibre's gland
  for (let a = 0; a < 8; a++) {
    const th = MA_TH(a), c = Math.cos(th), s = Math.sin(th);
    P.push(P_.boxZ([c * .186, s * .186, -.012], [.008, .017, .034], th, {}));
    for (let k = 0; k < 7; k++) { const z = -.042 + k * .0098; P.push(G.line([[c * .1945 - s * .016, s * .1945 + c * .016, z], [c * .1945 + s * .016, s * .1945 - c * .016, z]], F())); }
    P.push(G.cyl([c * .186, s * .186, .022], [c * .186, s * .186, .036], .0042, F({ caps: true })));
  }
  // the bracket out to the carriage (angle 270°: port), the carriage round the beam, its drive (servo, fins)
  P.push(G.hex([[-.02, -.178, -.042], [.02, -.178, -.042], [.02, -.178, .042], [-.02, -.178, .042], [-.016, -.385, -.03], [.016, -.385, -.03], [.016, -.385, .03], [-.016, -.385, .03]], {}));
  for (const s of [-1, 1]) P.push(G.line([[s * .0205, -.19, 0], [s * .0165, -.37, 0]], F()));
  P.push(...ebox([-.06, -.47, -.08], [.09, -.38, .08]));
  P.push(G.cyl([-.03, -.47, .04], [-.03, -.53, .04], .022, { caps: true }));
  for (let k = 0; k < 4; k++) P.push(G.cyl([-.03, -.476 - k * .013, .04], [-.03, -.48 - k * .013, .04], .026, F({ caps: true })));
  // the arms' feed manifold
  P.push(G.lathe([0, 0, -.064], [0, 0, 1], [[0, .19], [.008, .19]], F()));
  return P;
}
/* ---------- the coater's micro-arms (each part in its link's frame: +y along the link, x the joint's axis) ----------
   an arm: the shoulder (a plate on the ring's inner face, a pedestal, the joint's housing, its harmonic drive and
   flange bolts, a servo can with fins, the encoder, the cable gland and lead), the upper link and the forearm (tapered,
   pocketed webs, a cable run in clips on the back, the next joint's housing with its servo can), the wrist's hub with
   three sockets; a sub-arm (the same, smaller, ending in a hub with three sockets); a finger-arm (two links, a joint,
   the emitter's nozzle and lens) */
const NMA = 8, MA_TH = a => (a + .5) * TAU / 8;
const RB = .143, L1M = .058, L2M = .050, WSK = .0055, WOFF = L2M + .011;      // the shoulder's radius, the links, the wrist's sockets
const S1M = .016, S2M = .014, FSK = .0023, SOFF = S2M + .0013;                // a sub-arm's links, its hub's sockets
const F1M = .0075, F2M = .0062;                                               // a finger-arm's links (F2M to the nozzle's tip)
const SPR_S = .0135, SPR_F = .0045, R_SUB = .027, STAND = .0042;              // the open hand: the sub-arms' and fingers' spread, the sub-arms' reach, the nozzles' standoff
const FLK_HZ = 13, FLK_A = .0021, FLK_L = .0022, FLK_ON = .62;                // the strokes (per coater s), half their length, the lift back, the share writing
const cxp = (x0, x1, r, y, z, o) => G.cyl([x0, y || 0, z || 0], [x1, y || 0, z || 0], r, Object.assign({ caps: true }, o));
function finsP(P, x0, x1, n, r, w, y) { for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + .5) / n; P.push(cxp(x - w, x + w, r, y, 0)); } }
const taper = (y0, y1, hx0, hz0, hx1, hz1, o) => G.hex([[-hx0, y0, -hz0], [hx0, y0, -hz0], [hx0, y0, hz0], [-hx0, y0, hz0], [-hx1, y1, -hz1], [hx1, y1, -hz1], [hx1, y1, hz1], [-hx1, y1, hz1]], o || {});
/* a link L long: o.hub [r, half width] at its root, o.body [half x, half z at the root, at the tip], o.pocket, o.joint
   [r, half width] the next joint's housing at y L with o.can [r, length, fins] (a servo can and its encoder cap on +x),
   o.cable [r, clips] a cable run on its back */
function linkP(L, o) {
  const P = [], [hr, hw] = o.hub, [b0x, b0z, b1x, b1z] = o.body, y0 = hr * .85, y1 = L - (o.joint ? o.joint[0] * .85 : 0);
  P.push(cxp(-hw, hw, hr));
  P.push(taper(y0, y1, b0x, b0z, b1x, b1z, { ds: 1.3 }));
  if (o.pocket) for (const sx of [-1, 1]) {
    const at = f => [sx * (b0x + (b1x - b0x) * f) * 1.01, y0 + (y1 - y0) * f, (b0z + (b1z - b0z) * f) * .52];
    const A = at(.2), B = at(.8);
    P.push(G.line([[A[0], A[1], -A[2]], [B[0], B[1], -B[2]], [B[0], B[1], B[2]], [A[0], A[1], A[2]], [A[0], A[1], -A[2]]], F()));
  }
  if (o.joint) {
    const [jr, jw] = o.joint; P.push(cxp(-jw, jw, jr, L));
    if (o.can) { const [cr, cl, nf] = o.can; P.push(cxp(jw, jw + cl, cr, L)); if (nf) finsP(P, jw + cl * .12, jw + cl * .92, nf, cr * 1.17, cl * .035, L); P.push(cxp(jw + cl, jw + cl + cr * .7, cr * .72, L)); }
  }
  if (o.cable) {
    const [cr, nc] = o.cable, zc = -(Math.max(b0z, b1z) + cr * 1.6), ya = y0 + (y1 - y0) * .1, yb = y0 + (y1 - y0) * .9;
    P.push(G.cyl([b0x * .3, ya, zc], [b1x * .3, yb, zc], cr, {}));
    for (let i = 0; i < nc; i++) { const y = ya + (yb - ya) * (i + .5) / nc, x = b0x * .3; P.push(G.box([x - cr * 2.2, y - cr * 1.4, zc - cr * 1.8], [x + cr * 2.2, y + cr * 1.4, zc + cr * 1.6], F({ bottom: true }))); }
  }
  return P;
}
/* the shoulder (its frame: origin on the joint's axis, y inward, x along the axis (the ring's tangent), z along the rod) */
function maBasePrims() {
  const P = [];
  P.push(G.box([-.013, -.0125, -.018], [.013, -.0085, .018], {}));
  for (const [x, z] of [[-.009, -.013], [.009, -.013], [-.009, .013], [.009, .013]]) P.push(G.cyl([x, -.0085, z], [x, -.007, z], .0013, { caps: true }));
  P.push(G.box([-.0075, -.0085, -.0072], [.0075, -.004, .0072], {}));
  P.push(cxp(-.009, .009, .0082), cxp(-.0132, -.009, .0092), cxp(.009, .0215, .006), cxp(.0215, .0255, .0046));
  finsP(P, .0105, .0205, 4, .0071, .00035);
  for (let k = 0; k < 8; k++) { const an = k / 8 * TAU, y = Math.cos(an) * .0069, z = Math.sin(an) * .0069; P.push(G.cyl([-.0132, y, z], [-.0141, y, z], .00065, { caps: true })); }
  P.push(G.cyl([.0235, 0, .0046], [.0235, 0, .009], .0011, { caps: true }), G.line([[.0235, 0, .009], [.02, -.004, .0115], [.009, -.0085, .012]], F()));
  return P;
}
const maL1Prims = () => linkP(L1M, { hub: [.0089, .0085], body: [.0043, .0056, .0035, .0046], pocket: 1, joint: [.0068, .0072], can: [.005, .0095, 3], cable: [.0008, 3] });
function maL2Prims() {
  const P = linkP(L2M, { hub: [.0062, .006], body: [.0034, .0044, .0027, .0035], pocket: 1, joint: [.0052, .0058], can: [.0039, .007, 2], cable: [.0007, 2] });
  P.push(G.box([-.0042, L2M + .003, -.0088], [.0042, L2M + .009, .0088], { bottom: true }));
  for (let j = -1; j <= 1; j++) P.push(G.cyl([0, L2M + .009, j * WSK], [0, WOFF, j * WSK], .0021, { caps: true }));
  return P;
}
const saL1Prims = () => linkP(S1M, { hub: [.0024, .0026], body: [.00135, .0016, .0011, .0013], pocket: 1, joint: [.0019, .0021], can: [.0014, .0026, 1], cable: [.00028, 1] });
function saL2Prims() {
  const P = linkP(S2M, { hub: [.0019, .0019], body: [.0011, .0013, .0009, .0011], pocket: 1 });
  P.push(G.box([-.0014, S2M - .003, -.0034], [.0014, S2M + .0005, .0034], { bottom: true }));
  for (let k = -1; k <= 1; k++) P.push(G.cyl([0, S2M + .0005, k * FSK], [0, SOFF, k * FSK], .0008, { caps: true }));
  return P;
}
const fL1Prims = () => linkP(F1M, { hub: [.00095, .001], body: [.00058, .0007, .0005, .0006], joint: [.00078, .0008] });
function fL2Prims() {
  const P = linkP(F2M - .0018, { hub: [.00078, .0008], body: [.0005, .0006, .00038, .00046] });
  P.push(G.lathe([0, F2M - .0019, 0], [0, 1, 0], [[0, .00062], [.0007, .0006], [.0019, .00026]], { caps: true }));
  P.push(G.cyl([0, F2M - .0019, 0], [0, F2M - .0016, 0], .00072, { caps: true }));
  return P;
}
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
  P.push(G.box([-.06, -.345, -.3], [.06, -.334, .1], F()));
  // the lead screw on the port side (270°) that drives the deposition ring: its thread, two bearing blocks, the servo
  const ys = -.311;
  P.push(G.cyl([0, ys, -.79], [0, ys, .61], .0075, {}));
  { const L = []; for (let z = -.78; z <= .6; z += .0012) { const a = z / .01 * TAU; L.push([Math.cos(a) * .0085, ys + Math.sin(a) * .0085, z]); } P.push(G.line(L, F())); }
  for (const z of [-.795, .615]) P.push(G.box([-.022, ys - .02, z - .014], [.022, ys + .02, z + .014], {}));
  P.push(G.cyl([0, ys, -.81], [0, ys, -.9], .021, { caps: true }));
  for (let k = 0; k < 4; k++) P.push(G.cyl([0, ys, -.83 - k * .017], [0, ys, -.834 - k * .017], .025, F({ caps: true })));
  // the feed manifold on top (180°) the hoses run from
  P.push(G.box([-.37, -.05, -.12], [-.33, .05, .12], {}));
  for (let k = 0; k < 3; k++) P.push(G.cyl([-.37, -.03 + k * .03, .12], [-.37, -.03 + k * .03, .15], .007, { caps: true }));
  return P;
}
/* the deposition ring (its frame on the round's axis): the C-ring, sixteen emitters (a body, the nozzle, its lens),
   the arm out to the lead screw and its nut */
function depoPrims() {
  const P = [];
  cring(P, .205, .228, -.022, .022, 22 * DEG, 338 * DEG, 18, { e: 3 });
  for (let k = 0; k < 16; k++) {
    const a = (30 + k * 20) * DEG, c = Math.cos(a), s = Math.sin(a);
    P.push(G.cyl([c * .228, s * .228, 0], [c * .205, s * .205, 0], .0075, { caps: true }));
    P.push(G.lathe([c * .205, s * .205, 0], [-c, -s, 0], [[0, .009], [.016, .004]], { caps: true }));
    P.push(P_.circ([c * .189, s * .189, 0], [-c, -s, 0], .0042, F()));
    P.push(G.line([[c * .228, s * .228, .008], [c * .236, s * .236, .02], [c * .236, s * .236, .03]], F()));
  }
  P.push(...ebox([-.02, -.29, -.02], [.02, -.228, .02]));
  P.push(...ebox([-.026, -.336, -.032], [.026, -.288, .032]));                       // the nut round the screw
  return P;
}
/* the press (ship frame, about the armature's z): per side a hydraulic cylinder on a stand (tie-rod barrel, its two
   heads, ports, the gland, a guide block with two bores), a shared manifold with its gauge, the capacitor bank and its
   bus bars; the platens (separate) carry the piston rods, the guide rods, the nests and the electrodes */
const ZAM = -.66;
function amStationPrims() {
  const P = [], z = ZR + ZAM, bx = (a, b, y0, y1, z0, z1, o) => G.box([Math.min(a, b), y0, z0], [Math.max(a, b), y1, z1], o || {});
  for (const s of [-1, 1]) {
    const X_ = d => XL + s * d;
    P.push(bx(X_(.55), X_(1.08), YD, YD + .03, z - .2, z + .2));
    P.push(bx(X_(.66), X_(.98), YD + .03, YL - .07, z - .07, z + .07, { ds: 1.2 }));
    for (const sz of [-1, 1]) P.push(G.hex([[X_(.66), YD + .03, z + sz * .07], [X_(.98), YD + .03, z + sz * .07], [X_(.98), YD + .03, z + sz * .17], [X_(.66), YD + .03, z + sz * .17], [X_(.66), YD + .3, z + sz * .07], [X_(.98), YD + .3, z + sz * .07], [X_(.98), YD + .3, z + sz * .075], [X_(.66), YD + .3, z + sz * .075]], F()));
    for (const d of [.7, .9]) P.push(bx(X_(d - .02), X_(d + .02), YL - .075, YL - .05, z - .06, z + .06));
    P.push(bx(X_(.94), X_(1.0), YL - .085, YL + .085, z - .085, z + .085), bx(X_(.6), X_(.64), YL - .08, YL + .08, z - .08, z + .08));
    P.push(G.cyl([X_(.64), YL, z], [X_(.94), YL, z], .062, {}));
    for (const [dy, dz] of [[-.07, -.07], [-.07, .07], [.07, -.07], [.07, .07]]) {
      P.push(G.cyl([X_(.59), YL + dy, z + dz], [X_(1.02), YL + dy, z + dz], .007, {}));
      for (const d of [.59, 1.005]) P.push(G.cyl([X_(d), YL + dy, z + dz], [X_(d + .015), YL + dy, z + dz], .012, F({ caps: true })));
    }
    for (const d of [.68, .9]) P.push(G.cyl([X_(d), YL + .06, z], [X_(d), YL + .1, z], .01, { caps: true }), G.cyl([X_(d), YL + .1, z], [X_(d), YL + .115, z], .014, F({ caps: true })));
    P.push(G.cyl([X_(.6), YL, z], [X_(.57), YL, z], .034, { caps: true }));
    P.push(bx(X_(.5), X_(.6), YL - .15, YL - .1, z - .13, z + .13));
    for (const sz of [-1, 1]) P.push(P_.circ([X_(.5), YL - .125, z + sz * .09], [1, 0, 0], .014, F()));
  }
  // the manifold, its gauge (dial and ticks facing up and to stbd), the capacitor bank (cans in rows) and its bus bars
  const mx = XL + .78, mz = z + .38;
  P.push(G.box([mx - .1, YD, mz - .08], [mx + .1, YD + .22, mz + .08], {}), G.box([XL - .88, YD, z - .46], [XL - .68, YD + .22, z - .3], {}));
  P.push(G.cyl([mx, YD + .22, mz], [mx, YD + .255, mz], .012, { caps: true }), G.cyl([mx - .006, YD + .3, mz], [mx + .006, YD + .3, mz], .045, { caps: true }));
  for (let k = 0; k <= 10; k++) { const a = (-135 + 27 * k) * DEG, c = Math.cos(a), sn = Math.sin(a); P.push(G.line([[mx + .0065, YD + .3 + c * .04, mz + sn * .04], [mx + .0065, YD + .3 + c * .034, mz + sn * .034]], F())); }
  const cx0 = XL - .95, cz0 = z + .28;
  P.push(G.box([cx0, YD, cz0], [cx0 + .36, YD + .34, cz0 + .26], {}));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.push(G.cyl([cx0 + .05 + i * .087, YD + .34, cz0 + .05 + j * .08], [cx0 + .05 + i * .087, YD + .45, cz0 + .05 + j * .08], .03, { caps: true }));
  for (const s of [-1, 1]) P.push(G.box([Math.min(cx0 + .18, XL + s * .5), YD - .03, z + .2], [Math.max(cx0 + .18, XL + s * .5), YD - .015, z + .25], {}), G.box([XL + s * .5 - .015, YD - .03, z + .13], [XL + s * .5 + .015, YL - .15, z + .2], {}));
  return P;
}
/* a platen (its frame at its inner face, x outward on side s): the plate, the nest's two jaws and the electrode on its
   inner face, the piston rod and its coupler, two guide rods, the shunt's lug */
const amPlate = s => [
  G.box([Math.min(0, s * .03), -.12, -.1], [Math.max(0, s * .03), .12, .1], { bottom: true }),
  G.box([Math.min(0, -s * .012), -.11, -.065], [Math.max(0, -s * .012), -.075, .065], {}), G.box([Math.min(0, -s * .012), .075, -.065], [Math.max(0, -s * .012), .11, .065], {}),
  G.box([Math.min(0, -s * .006), -.05, -.04], [Math.max(0, -s * .006), .05, .04], F()),
  G.cyl([s * .03, 0, 0], [s * .07, 0, 0], .035, { caps: true }), G.cyl([s * .07, 0, 0], [s * .5, 0, 0], .025, {}),
  ...[-1, 1].map(sz => G.cyl([s * .03, -.125, sz * .09], [s * .5, -.125, sz * .09], .011, {})),
  G.box([Math.min(0, s * .03), .12, -.03], [Math.max(0, s * .03), .15, .03], {}),
];
/* the charge ring (its frame on the round's axis): the C-ring wound with the charging coil, four laser profilometer
   heads, two electrodes on springs, the hanger up from its top and across to the carriage on its beam (port, above the
   press); the beam on three posts (ship frame) */
const RB_Y = -1.22, RB_X = -.45;                                          // the beam (round frame of the line)
function ringPrims() {
  const P = [];
  cring(P, .25, .285, -.04, .04, 18 * DEG, 342 * DEG, 22, { e: 3.5 });
  for (let k = 0; k < 64; k++) {
    const a = (24 + k * 312 / 63) * DEG, c = Math.cos(a), s = Math.sin(a), L = [];
    for (let q = 0; q <= 16; q++) { const f = q / 16 * TAU, r = .2675 + .0215 * Math.cos(f); L.push([c * r, s * r, .046 * Math.sin(f)]); }
    P.push(G.line(L, F()));
  }
  for (const a of [40, 140, 220, 320]) {
    P.push(P_.boxZ([Math.cos(a * DEG) * .228, Math.sin(a * DEG) * .228, 0], [.022, .016, .022], a * DEG, {}));
    P.push(G.lathe([Math.cos(a * DEG) * .206, Math.sin(a * DEG) * .206, 0], [-Math.cos(a * DEG), -Math.sin(a * DEG), 0], [[0, .009], [.006, .007]], { caps: true }));
  }
  for (const a of [100, 260]) {
    const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
    P.push(G.cyl([c * .25, s * .25, 0], [c * .2, s * .2, 0], .008, { caps: true }), G.cyl([c * .2, s * .2, 0], [c * .165, s * .165, 0], .004, { caps: true }));
    const L = []; for (let q = 0; q <= 60; q++) { const t = q / 60, r = .2 - .035 * t, f = t * 8 * TAU; L.push([c * r - s * Math.cos(f) * .007, s * r + c * Math.cos(f) * .007, Math.sin(f) * .007]); } P.push(G.line(L, F()));
  }
  // the hanger: up from the ring's top (180°), across to port, the carriage round the beam
  P.push(...ebox([RB_X - .03, -.022, -.035], [-.285, .022, .035]));
  P.push(...ebox([RB_X - .03, RB_Y + .05, -.03], [RB_X + .03, .022, .03]));
  P.push(...ebox([RB_X - .08, RB_Y - .05, -.11], [RB_X + .08, RB_Y + .05, .11]));
  for (const z of [-.04, .04]) P.push(P_.circ([0, 0, z], [0, 0, 1], .268, F()));
  return P;
}
function ringBeamPrims() {
  const P = [], xb = XL + RB_Y, yb = YL - RB_X;
  P.push(G.box([xb - .03, yb - .03, ZR - 1.55], [xb + .03, yb + .03, ZR + 1.55], { ds: .9 }));
  for (const s of [-1, 1]) P.push(G.box([xb + s * .018 - .005, yb + .03, ZR - 1.52], [xb + s * .018 + .005, yb + .04, ZR + 1.52], F()));
  for (const dz of [-1.5, 0, 1.5]) P.push(G.box([xb - .035, YD, ZR + dz - .035], [xb + .035, yb - .03, ZR + dz + .035]), G.box([xb - .1, YD, ZR + dz - .1], [xb + .1, YD + .03, ZR + dz + .1]));
  return P;
}
/* the strike-up (ship frame about the cell's axis): three guide columns, ties, the ram's barrel and pump, the
   scuttle's frame under the floor */
let COLS = null;
function liftPrims() {
  const P = [], cx = CELL[0], cz = CELL[2];
  for (const [x, z] of COLS) P.push(G.box([x - .022, YD, z - .022], [x + .022, YH - .05, z + .022], { ds: .8 }));
  for (const y of [YD + .03, -.75, .25, YH - .1]) P.push(G.line([[cx - .26, y, cz], [cx, y, cz - .27], [cx + .26, y, cz]]));
  P.push(G.box([cx - .2, YD, cz - .36], [cx + .32, YD + .05, cz + .1]));
  P.push(G.cyl([cx, YD + .05, cz], [cx, YD + .3, cz], .085, { caps: true }));
  P.push(G.box([cx - .2, YD, cz - 1.08], [cx + .34, YD + .6, cz - .62], { ds: 1.4 }));
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
/* ---------- the micro-arms' motion (the head's frame: the line's round frame at the head; per arm e_r its radial,
   e_t the ring's tangent, e_z along the rod) ----------
   the arm reaches in (2-link IK, the elbow aft); the hand opens 1 -> 3 (each sub-arm's tip from the closed hand to its
   place a hand's width along the trace) and 3 -> 9 (each finger's nozzle to its place over the channel), staggered per
   arm; while it writes each fingertip strokes along the channel (FLK_ON of each cycle with its laser on, then lifted
   back), the 72 out of step; it all folds back the other way */
const MA = [];
const NZ = [0, 0, -1], PZ1 = [0, 0, 1], IE = [0, 0, 0], IT = [0, 0, 0];
/* 2-link IK from p towards q (links a, b), the elbow bent towards h: the elbow into E_, the tip reached into T_ */
function ik2(p, q, a, b, h, E_, T_) {
  let dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2]; const D = Math.hypot(dx, dy, dz) || 1e-9;
  dx /= D; dy /= D; dz /= D;
  const Dm = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, D)), x = (a * a - b * b + Dm * Dm) / (2 * Dm), y = Math.sqrt(Math.max(0, a * a - x * x));
  const hd = h[0] * dx + h[1] * dy + h[2] * dz; let hx = h[0] - hd * dx, hy = h[1] - hd * dy, hz = h[2] - hd * dz; const hl = Math.hypot(hx, hy, hz) || 1;
  hx /= hl; hy /= hl; hz /= hl;
  E_[0] = p[0] + dx * x + hx * y; E_[1] = p[1] + dy * x + hy * y; E_[2] = p[2] + dz * x + hz * y;
  T_[0] = p[0] + dx * Dm; T_[1] = p[1] + dy * Dm; T_[2] = p[2] + dz * Dm;
}
/* a link's frame (into out): origin A, y towards B, x the joint's axis n (made normal to y), z = x × y */
function linkX(A, B, n, out) {
  let yx = B[0] - A[0], yy = B[1] - A[1], yz = B[2] - A[2]; const l = Math.hypot(yx, yy, yz) || 1; yx /= l; yy /= l; yz /= l;
  const d = n[0] * yx + n[1] * yy + n[2] * yz; let xx = n[0] - d * yx, xy = n[1] - d * yy, xz = n[2] - d * yz; const m = Math.hypot(xx, xy, xz) || 1; xx /= m; xy /= m; xz /= m;
  const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx, Rm = out.R;
  Rm[0] = xx; Rm[1] = yx; Rm[2] = zx; Rm[3] = xy; Rm[4] = yy; Rm[5] = zy; Rm[6] = xz; Rm[7] = yz; Rm[8] = zz;
  out.T[0] = A[0]; out.T[1] = A[1]; out.T[2] = A[2];
  return out;
}
function mkArm(a) {
  const m = { a, th: MA_TH(a), B: X.make(R.I(), [0, 0, 0]), L1: X.make(R.I(), [0, 0, 0]), L2: X.make(R.I(), [0, 0, 0]), S: [], F: [],
    tip: new Float64Array(27), spot: new Float64Array(27), fire: new Float64Array(9), ph: new Float64Array(9), cyc: new Float64Array(9), zr: new Float64Array(9), dep: 0, o1: 0, o2: 0 };
  for (let j = 0; j < 3; j++) m.S.push([X.make(R.I(), [0, 0, 0]), X.make(R.I(), [0, 0, 0])]);
  for (let i = 0; i < 9; i++) { m.F.push([X.make(R.I(), [0, 0, 0]), X.make(R.I(), [0, 0, 0])]); m.ph[i] = K.hh(a * 9.7 + i * 1.3, 7.3); }
  return m;
}
const colY = (L, o) => { o[0] = L.R[1]; o[1] = L.R[4]; o[2] = L.R[7]; return o; };
const FWD = [0, 0, 0], SWD = [0, 0, 0], TGT = [0, 0, 0], HB = [0, 0, 0];
function microAt(t, zH) {
  const wr = writeAt(t);
  for (let a = 0; a < NMA; a++) {
    const m = MA[a], c = Math.cos(m.th), s = Math.sin(m.th), d = .02 * a, df = .012 * a, et = [-s, c, 0];
    m.dep = E.ss(CO.d0 + d, CO.d0 + .4 + d, t) * (1 - E.ss(CO.W1 + .52 + df, CO.W1 + .8 + df, t));
    m.o1 = E.ss(CO.d0 + .4 + d, CO.d0 + .95 + d, t) * (1 - E.ss(CO.W1 + .26 + df, CO.W1 + .54 + df, t));
    m.o2 = E.ss(CO.d0 + .95 + d, CO.d0 + 1.5 + d, t) * (1 - E.ss(CO.W1 + df, CO.W1 + .28 + df, t));
    // the shoulder; the wrist stowed against the ring's back edge, or reaching in over the rod
    const S0 = [c * RB, s * RB, 0], rw = E.mix(.1, .05, m.dep), zw = E.mix(-.045, 0, m.dep);
    linkX(S0, [S0[0] - c, S0[1] - s, 0], et, m.B);
    ik2(S0, [c * rw, s * rw, zw], L1M, L2M, NZ, IE, IT);
    linkX(S0, IE, et, m.L1); linkX(IE, IT, et, m.L2);
    colY(m.L2, FWD);
    const zsW = m.L2.R[8] >= 0 ? 1 : -1;
    for (let j = 0; j < 3; j++) {
      const sj = j - 1, Rj = X.ap(m.L2, [0, WOFF, sj * WSK]);
      // its tip: the hand closed, straight on from the wrist; open, over the trace, a hand's width along the rod
      const o1 = m.o1, zo = zsW * sj * SPR_S;
      TGT[0] = E.mix(Rj[0] + FWD[0] * .026, c * R_SUB, o1); TGT[1] = E.mix(Rj[1] + FWD[1] * .026, s * R_SUB, o1); TGT[2] = E.mix(Rj[2] + FWD[2] * .026, zw + zo, o1);
      HB[0] = 0; HB[1] = 0; HB[2] = sj > 0 ? zsW : -zsW;
      ik2(Rj, TGT, S1M, S2M, HB, IE, IT);
      const SA_ = m.S[j]; linkX(Rj, IE, et, SA_[0]); linkX(IE, IT, et, SA_[1]);
      colY(SA_[1], SWD);
      const zsS = SA_[1].R[8] >= 0 ? 1 : -1;
      for (let k = 0; k < 3; k++) {
        const sk = k - 1, i = j * 3 + k, Fk = X.ap(SA_[1], [0, SOFF, sk * FSK]);
        // the stroke: along the channel with the laser on, then lifted and carried back
        const ph = ((t * FLK_HZ + m.ph[i]) % 1 + 1) % 1;
        let zs_, lift, on;
        if (ph < FLK_ON) { zs_ = -FLK_A + 2 * FLK_A * ph / FLK_ON; lift = 0; on = 1; }
        else { const w = (ph - FLK_ON) / (1 - FLK_ON); zs_ = FLK_A - 2 * FLK_A * E.ss(0, 1, w); lift = FLK_L * Math.sin(PI * w); on = 0; }
        zs_ *= wr; lift = E.mix(FLK_L * 1.4, lift, wr);
        const zf = zw + zo + zsS * sk * SPR_F + zs_, zr = zH + zf, th = RGR.thAt(a, zr), rs = RGR.surfR(zr), rr = rs + STAND + lift, o2 = m.o2;
        TGT[0] = E.mix(Fk[0] + SWD[0] * .0118, Math.cos(th) * rr, o2); TGT[1] = E.mix(Fk[1] + SWD[1] * .0118, Math.sin(th) * rr, o2); TGT[2] = E.mix(Fk[2] + SWD[2] * .0118, zf, o2);
        HB[2] = zsS;                                                         // (the fingers all curl the same way)
        ik2(Fk, TGT, F1M, F2M, HB, IE, IT);
        const FA = m.F[i]; linkX(Fk, IE, et, FA[0]); linkX(IE, IT, et, FA[1]);
        m.tip[i * 3] = IT[0]; m.tip[i * 3 + 1] = IT[1]; m.tip[i * 3 + 2] = IT[2];
        const rl = rs + .00025; m.spot[i * 3] = Math.cos(th) * rl; m.spot[i * 3 + 1] = Math.sin(th) * rl; m.spot[i * 3 + 2] = zf;
        m.fire[i] = o2 > .97 && wr > .5 ? on : 0; m.cyc[i] = ph; m.zr[i] = zr;
      }
    }
  }
}
/* the state at u: every frame (ship) and value, filled each frame and read by draw, FX, tags */
const ST = {};
function stateAt(u) {
  const s = ST;
  s.q = armAt(u, Q); s.zt = ZT; fk(s.q, s.zt); s.grip = gripAt(u);
  s.zs = shuttleZ(u); s.SH = X.make(R_LINE, [XL, YL, s.zs]);
  s.quill = quillAt(u);
  s.tau = tauAt(u); s.zH = headZ(s.tau); s.laid = laidAt(s.tau); s.wr = writeAt(s.tau);
  s.HEAD = X.mul(X.make(R_LINE, [XL, YL, ZC]), tr(0, 0, s.zH));
  s.coat = s.tau > CO.d0 - .05 && s.tau < CO.off0;                           // (the arms out of their stowage)
  microAt(s.tau, s.zH);
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
  s.glowLay = s.tau > CO.W0 && s.tau < CO.W1 + .4 ? .45 * (1 - E.ss(CO.W1, CO.W1 + .4, s.tau)) : 0;
  // the circuit tested once it is laid: a pulse runs the traces tail to nose
  s.test = s.tau > CO.ts0 ? E.ss(CO.ts0, CO.ts0 + .15, s.tau) * (1 - E.ss(CO.ts1 - .5, CO.ts1, s.tau)) : 0;
  s.charged = u < U.riS0 ? -9 : u < U.riS1 ? s.zI + .02 : 9;
  s.glow = u < U.riS1 ? .1 * cs : E.mix(1, .45, kk(u, U.riS1 + .3, U.riS1 + 2.2)) * (1 - kk(u, U.up1 - .3, LEN - .5));
  // the charge ring's passes: its X-ray band on the sweep, the charge repeated (the whole circuit X-rayed), the
  // tolerance scan; the hero's scan plane rising through the round on the cradle
  s.sweep = E.sat((u - U.riS0) / .3) * (1 - E.sat((u - U.riS1) / .3));
  s.rep = kk(u, U.rp0 - .2, U.rp0 + .5) * (1 - kk(u, U.rp1 - .4, U.rp1));
  s.tol = kk(u, U.tl0 - .2, U.tl0 + .2) * (1 - kk(u, U.tl1, U.tl1 + .4));
  s.hz = trap(u, U.hero0 + .6, U.hero1 - .4, .8);
  // the largest runout measured so far (the scan runs nose to tail)
  TOLMAX = 0; if (u > U.tl0) { const z1 = u > U.tl1 ? -.95 : s.zI; for (let z = .95; z >= z1; z -= .02) TOLMAX = Math.max(TOLMAX, Math.abs(runout(z))); }
  s.hero = kk(u, U.hero0 + .2, U.hero0 + .8) * (1 - kk(u, U.hero1 - .4, U.hero1 + .2));
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
    pk1: pose([XA + .75, .25, 47.9], 90, 47.9),
    unA: pose([XL + .36, YL, ZR + ZGRIP], 90, ZR + ZGRIP), unG: pose([XL, YL, ZR + ZGRIP], 90, ZR + ZGRIP), unU: pose([XL, YL + .42, ZR + ZGRIP], 90, ZR + ZGRIP),
    unR: pose([XL + .5, YL + .5, ZR + ZGRIP], 90, ZR + ZGRIP),
    stA: pose([CXp, yPl + .14, CZp], 180, CZp), stP: pose([CXp, yPl, CZp], 180, CZp), stR: pose([CXp - .32, yPl, CZp], 180, CZp), home2: pose([XA + .75, .25, CZp - 2.2], 180, CZp - 2.2),
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
  MA.length = 0; for (let a = 0; a < NMA; a++) MA.push(mkArm(a));
  // clouds
  const A = armPrims();
  for (const k in A) CLM[k] = lod(A[k], .45, k === 'hand' || k.startsWith('finger') ? LF : LV);
  CLM.deck = lod(deckPrims(), 1.2, LB); CLM.track = lod(trackPrims(), 1.0, LB);
  CLM.rack = lod(rackPrims(), .5, LF.map(v => v * 1.6)); CLM.shuttle = lod(shuttlePrims(), .4, LF);
  CLM.quillH = lod(quillH(), .1, LM); CLM.quillT = lod(quillT(), .1, LM);
  CLM.coater = lod(coaterPrims(), .25, LF); CLM.head = lod(headPrims(), .05, LM.map(v => v * 2.2));
  CLM.maB = lod(maBasePrims(), .02, LMP); CLM.maL1 = lod(maL1Prims(), .02, LMP); CLM.maL2 = lod(maL2Prims(), .02, LMP);
  CLM.saL1 = lod(saL1Prims(), .01, LMS); CLM.saL2 = lod(saL2Prims(), .01, LMS);
  CLM.fL1 = lod(fL1Prims(), .006, LMF); CLM.fL2 = lod(fL2Prims(), .006, LMF);
  CLM.grower = lod(growerPrims(), .3, LF.map(v => v * 1.4)); CLM.depo = lod(depoPrims(), .12, LM.map(v => v * 2.6));
  CLM.amSt = lod(amStationPrims(), .3, LF.map(v => v * 1.6)); CLM.amPA = lod(amPlate(1), .1, LF); CLM.amPB = lod(amPlate(-1), .1, LF);
  CLM.ring = lod(ringPrims(), .15, LM.map(v => v * 3)); CLM.ringBeam = lod(ringBeamPrims(), .6, LB);
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
  for (const k of ['ROD', 'ROB', 'COA', 'TRC', 'MAR', 'LAS', 'TST', 'GRW', 'SAB', 'LAT', 'PRS', 'AMS', 'ARM', 'INS', 'XRY', 'TOL', 'FIN', 'AR2', 'SB2', 'TR2', 'RD2', 'NOS', 'STK', 'HER', 'CEL', 'LP1', 'LP2', 'LP3']) TG[k] = K.mkTag();
  BX = {
    FIN: [[-.036, -.036, -1.0], [.036, .036, -.86]], ARM: [[-.09, -.14, RGR.ARM_Z0], [.09, .14, RGR.ARM_Z1]], SAB: [[-.14, -.14, RGR.SAB_Z0], [.14, .14, RGR.SAB_Z1]],
    ROD: [[-.013, -.013, -1.0], [.013, .013, 1.0]], NOS: [[-.013, -.013, RGR.NOSE_Z], [.013, .013, 1.0]],
  };
  // the camera: the base camera's motion where the loader starts (eased out at the start, back in at the end)
  CTXR = ctx;
  { const h = 1 / 120, a = ctx.camAt(T_AT - h), b = ctx.camAt(T_AT + h);
    VOLD = { eye: V.mul(V.sub(b.eye, a.eye), 1 / (2 * h)), target: V.mul(V.sub(b.target, a.target), 1 / (2 * h)), fov: (b.fov - a.fov) / (2 * h) }; }
  SH = SHOTS(); SEQ = SEQUENCE();
  RGM.cues = CUES(ctx.STAGE.SFX);
}
/* the shots (ship frame; fov in degrees): each a function of u */
function SHOTS() {
  const sh = (eye, target, fov) => ({ eye, target, fov }), L = (dx, dy, z) => [XL + dx, YL + dy, z];
  const hz = u => ZC + headZ(tauAt(u)), dz = u => ZG + depoZ(growAt(u)), iz = u => ZR + ringZ(u);
  const CX = CELL[0], CZ = CELL[2], CY = YCR0 + .7;
  // a micro-arm in profile: the lens on the rod's normal 112.5° round from the bottom (above, to stbd), on the arm at
  // 202.5° (above, to port: trace 4) with the hand's middle (r) on the lens' axis
  const C1 = Math.sin(112.5 * DEG), S1 = -Math.cos(112.5 * DEG), AX = Math.sin(202.5 * DEG), AY = -Math.cos(202.5 * DEG);
  const prof = (r, d, zo, fov, zt) => u => { const z = hz(u) + zt; return sh(L(C1 * d, S1 * d, z + zo), L(AX * r, AY * r, z), fov); };
  // the base camera's bearing where the loader starts (the shots next to it turn towards it, so the lens never has
  // to swing far to meet it, wherever it looks)
  const o = CTXR.camAt(T_AT), dO = V.norm(V.sub(o.target, o.eye)), azO = Math.atan2(dO[0], dO[2]) / DEG;
  const dAz = (a, b) => ((b - a + 540) % 360) - 180, toward = (a, b, m) => a + E.clamp(dAz(a, b), -m, m);
  const look = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG)];
  // the establishing view of the deck: on the base camera's bearing turned up to 60° towards the rack's (-59°)
  const azW = toward(azO, -59, 60), dW = look(azW, -17), CW_ = [-.95, -.95, 45.9];
  const eW = V.mad(CW_, dW, -5.0); eW[0] = E.clamp(eW[0], -3.9, 3.9); eW[1] = Math.min(eW[1], 1.1); eW[2] = E.clamp(eW[2], ZA + .3, ZF - .3);
  // the hero: a slow orbit round the round stood on the cradle, from the hand-off's bearing (-78°) up to 45° towards
  // the base camera's
  const azH0 = -78, azH1 = toward(azH0, azO, 45);
  const orbit = u => { const a = (180 + azH0 + (azH1 - azH0) * E.sat((u - U.hero0) / (95.0 - U.hero0))) * DEG; return sh([CX + Math.sin(a) * 2.45, CY + .42, CZ + Math.cos(a) * 2.45], [CX, CY + .02, CZ], 50); };
  // (the lens stays on the stbd side looking forward and to port through the deck)
  return {
    wide: u => sh(eW, CW_, 54),
    rack: u => sh([1.9, .5, 41.95], [-.55, -.6, 43.35], 40),
    carry: u => sh([1.2, .5, 42.0], [-1.4, -.66, 43.5], 38),
    co_head: u => { const z = hz(u); return sh(L(C1 * 2.3, S1 * 2.3, z - .9), L(0, 0, z + .05), 30); },
    // (framed with the rod above the middle of the picture, the ring's lower arms clear of the menu row)
    co_arm: prof(.05, 1.62, -.15, 9.6, .05),
    co_hand: prof(-.008, 1.62, -.1, 7.5, .005),
    co_fing: prof(-.01, 1.62, -.1, 3.6, 0),
    co_track: u => { const z = Math.min(hz(u), ZC + .9); return sh(L(1.5, .75, z - .85), L(0, 0, z + .08), 26); },
    co_done: u => sh(L(C1 * 1.8, S1 * 1.8, ZC + CO.Z1 - .6), L(0, .03, ZC + CO.Z1), 16),
    co_test: u => sh(L(1.6, 1.0, ZC - .8), L(0, -.02, ZC + .25), 40),
    shut: u => { const z = shuttleZ(u); return sh(L(1.8, .85, z - .9), L(0, -.02, z + .5), 38); },
    gr_wide: u => sh(L(1.55, .6, ZG - 1.0), L(0, 0, ZG + .1), 34),
    gr_front: u => { const z = dz(u); return sh(L(1.4, .5, z - .55), L(0, -.01, z + .05), 20); },
    gr_done: u => sh(L(1.6, .75, ZG - 1.1), L(0, 0, ZG + .1), 38),
    press: u => sh(L(1.25, 1.05, ZR + ZAM - 1.2), L(0, -.04, ZR + ZAM + .05), 30),
    ring: u => { const z = iz(u); return sh(L(1.4, .62, z - .75), L(0, 0, z + .05), 16); },
    whole: u => sh(L(1.75, 1.7, ZR - .45), L(0, -.02, ZR + .1), 42),
    tol: u => { const z = iz(u); return sh(L(1.5, .85, z - .9), L(0, .06, z + .15), 22); },
    unl: u => sh([1.4, .8, 48.0], [-1.2, -.45, 48.6], 46),
    hero: orbit,
    // rising with the round on the base camera's own line of sight (the move back to it is then a dolly)
    up: u => { const y = (u < U.dn0 ? cradleAt(u) : YCT) + .8; return sh(V.mad([CX, y, CZ], dO, -3.8), [CX, y, CZ], 46); },
  };
}
/* the cut: [shot, u0, u1] (the move into it runs u0 -> u1; it holds until the next one starts) */
function SEQUENCE() {
  return [
    ['old', 0, 0], ['wide', 2.0, 8.4], ['rack', 8.8, 12.0], ['carry', 12.2, 14.4],
    ['co_head', 15.4, 17.4], ['co_arm', 17.4, 21.0], ['co_hand', 21.2, 23.8], ['co_fing', 28.2, 31.8], ['co_track', 34.2, 38.8], ['co_done', 39.2, 41.4], ['co_test', 41.6, 45.2],
    ['gr_wide', 45.3, 49.7], ['gr_front', 50.0, 52.2], ['gr_done', 55.4, 59.0],
    ['press', 59.2, 63.4], ['ring', 66.2, 69.8], ['whole', 72.2, 75.8], ['tol', 78.0, 81.4],
    ['unl', 82.8, 86.4], ['hero', 89.8, 92.2], ['up', 95.0, 97.8], ['oldX', 98.6, 102.2],
  ];
}

/* ---------- draw ---------- */
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0], QV = new Float64Array(6), QW = new Float64Array(6);
const WP = (S, p) => X.ap(X.mul(WS, S), p);
const LOPT = { glow: 0, T: 0, laid: 9, a: 1, Ls: null, cut: -99, sp: 1.6, n: 2, white: .3, fresh: .04, kinds: 7, back: 0, tail: .12, sync: 0 };
let PRF = null, pt = 0;
const pk = k => { if (!PRF) return; const t = performance.now(); PRF[k] = (PRF[k] || 0) + t - pt; pt = t; };
/* the round's X-ray band (round z): round the charge ring's plane while it sweeps, the whole round while the charge
   repeats, round the hero's scan plane; 0 when off */
function xrayBand(s) {
  let w = 0;
  if (s.sweep > .01) { w = s.sweep; XZ0 = s.zI - .05; XZ1 = s.zI + .05; XZF = .04; }
  else if (s.rep > .01) { w = s.rep; XZ0 = -1.02; XZ1 = 1.02; XZF = .05; }
  else if (s.hero > .01) { w = s.hero; const z = E.mix(-1.06, 1.06, s.hz); XZ0 = z - .05; XZ1 = z + .05; XZF = .05; }
  // (the whole round see-through more gently than the band)
  const kw = s.rep > .01 && s.sweep <= .01 ? .4 : .72, kd = s.rep > .01 && s.sweep <= .01 ? .5 : .68;
  XZ = w > .01; XZK = 1 - w * kw; XZD = 1 - w * kd;
  return w;
}
function drawRound(s, u, o, ctx) {
  const RC = RGR.CL, RF = s.RF, xw = xrayBand(s);
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
  XZ = false;
  pk('r.arm');
  // the circuit: laid in the coater, lit by the charge
  const L = LOPT; L.T = ctx.T; L.Ls = RF; L.cut = RV_ON ? RV_Y : -99; L.a = Math.min(1.2, o.a / 1.3) * Math.max(.25, o.keep); L.kinds = 7;
  if (s.laid > -8) {
    const RFw = X.mul(WS, RF);
    L.laid = s.laid; L.glow = Math.max(s.glowLay, s.glow * .2); L.sp = .7; L.n = 3; L.white = .36; L.fresh = .06; L.back = s.laid < 8 ? .45 : 0; L.tail = .07;
    L.T = s.laid < 8 ? s.tau : ctx.T;
    RGR.lines(RFw, L);
    L.back = 0; L.tail = .12; L.T = ctx.T;
    if (s.test > .01 && s.laid > 8) { L.laid = 9; L.glow = s.test; L.sp = 3.2; L.n = 1; L.white = .1; L.tail = .3; L.sync = 1; L.T = s.tau - CO.ts0; RGR.lines(RFw, L); L.tail = .12; L.sync = 0; L.T = ctx.T; }
    if (s.charged > -8) { L.laid = s.charged; L.glow = u < U.riS1 ? 1 : s.glow; L.sp = 2.4; L.n = 6; L.white = .3; L.fresh = .07; L.tail = .2; RGR.lines(RFw, L); L.tail = .12; }
    // the charge run again and again, nose to tail, all eight traces in step
    if (s.rep > .01) { L.laid = 9; L.glow = s.rep; L.sp = 1.25; L.n = 1; L.white = .1; L.tail = .38; L.sync = 1; L.rev = 1; L.T = u - U.rp0; RGR.lines(RFw, L); L.tail = .12; L.sync = 0; L.rev = 0; L.T = ctx.T; }
    // the channels X-rayed inside the band
    if (xw > .01) RGR.xray(RFw, { z0: XZ0, z1: XZ1, fz: XZF, a: xw * Math.min(1.2, o.a / 1.3), glow: s.rep > .01 ? 1 : .6, T: s.rep > .01 ? u - U.rp0 : ctx.T, sp: 1.25, rev: s.rep > .01 ? 1 : 0, Ls: RF, cut: L.cut });
  }
}
const OL_A = 1.5, OR_A = 1.55;
/* the micro-arms: those across the lens' line of sight drawn full, those at 45° to it sparser, the ones pointing at the
   lens (in front of the rod) or away from it (behind) sparsest; the hands' small parts only where they can show
   (sub-arms inside 12 m, fingers inside 7 m) */
function drawMicro(s) {
  const H = s.HEAD, Hw = X.mul(WS, H), e = K.C.eye, ax = X.dir(Hw, [0, 0, 1]);
  let hx = Hw.T[0] - e[0], hy = Hw.T[1] - e[1], hz = Hw.T[2] - e[2]; const dH = Math.hypot(hx, hy, hz);
  const ha = hx * ax[0] + hy * ax[1] + hz * ax[2]; hx -= ha * ax[0]; hy -= ha * ax[1]; hz -= ha * ax[2];
  const hl = Math.max(1e-6, Math.hypot(hx, hy, hz)), subs = dH < 12, fings = dH < 7;
  for (let a = 0; a < NMA; a++) {
    const m = MA[a], d = X.dir(Hw, [Math.cos(m.th), Math.sin(m.th), 0]), far = (d[0] * hx + d[1] * hy + d[2] * hz) / hl;
    const af = Math.abs(far); m.kf = af < .45 ? 1 : af < .8 ? .42 : far > 0 ? .22 : .28;
    const kf = FW.coat * m.kf;
    // (the dimmed arms drawn whole but faint, not thinned: thinning the small parts reads as noise)
    const fa = o => { if (!A0.has(o)) A0.set(o, o.a); o.keep = Math.max(.7, kf); o.a = A0.get(o) * (.18 + .82 * kf); return o; };
    fa(OM); pk('c.misc');
    drawM(CLM.maB, X.mul(H, m.B), OM, true); drawM(CLM.maL1, X.mul(H, m.L1), OM, true); drawM(CLM.maL2, X.mul(H, m.L2), OM, true); pk('c.prim');
    if (subs) { fa(OMS); for (let j = 0; j < 3; j++) { drawM(CLM.saL1, X.mul(H, m.S[j][0]), OMS, true); drawM(CLM.saL2, X.mul(H, m.S[j][1]), OMS, true); } } pk('c.sub');
    if (fings) { fa(OMF); for (let i = 0; i < 9; i++) { OMF.lime = .4 * m.fire[i]; drawM(CLM.fL1, X.mul(H, m.F[i][0]), OMF, true); drawM(CLM.fL2, X.mul(H, m.F[i][1]), OMF, true); } OMF.lime = 0; } pk('c.fing');
  }
  unfoc(OM); unfoc(OMS); unfoc(OMF);
}
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
  // the coater: beam, head, the eight micro-arms with their sub-arms and finger-arms
  foc(OP, FW.coat); drawM(CLM.coater, null, OP, true); pk('c.beam'); drawM(CLM.head, s.HEAD, OP, true); pk('c.head');
  drawMicro(s);
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
/* the loupe (screen space): a strut of the sabot's lattice magnified, an octet micro-lattice of 50 µm cells (nodes on
   a face-centred grid, struts to the twelve nearest) growing layer by layer with the front and rocking slowly; a dark
   lens with a dotted rim and ticks, a leader to the forming front, the scale bar (one cell, 50 µm) and the true
   magnification against the main view */
const LP_N = 4, LP_UM = 25;                                                   // cells per side, µm per half cell
let LPS = null;
function loupeStruts() {
  const S = [], N = 2 * LP_N, has = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i <= N && j <= N && k <= N && ((i + j + k) & 1) === 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
    if (!has(i, j, k)) continue;
    for (const [a, b, c] of [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]]) if (has(i + a, j + b, k + c)) S.push([i, j, k, i + a, j + b, k + c]);
  }
  return S;
}
const PA = [0, 0, 0], PB = [0, 0, 0];
function loupe(u, s, ctx) {
  const A = kk(u, U.gr0 + 2.4, U.gr0 + 3.2) * (1 - kk(u, U.gr1 - 1.0, U.gr1 - .3));
  if (A < .01) return;
  if (!LPS) LPS = loupeStruts();
  const S_ = K.S || 1, R0 = 150 * S_, cx = K.BW * .8, cy = K.BH * .63, D = K.pb.d, BW = K.BW, BH = K.BH, L_ = LIME;
  // the lens: the view behind it darkened
  const f = 1 - .86 * A;
  for (let y = Math.max(0, Math.floor(cy - R0)); y < Math.min(BH, cy + R0); y++) {
    const dy = y + .5 - cy, hw = Math.sqrt(Math.max(0, R0 * R0 - dy * dy));
    for (let x = Math.max(0, Math.floor(cx - hw)); x < Math.min(BW, cx + hw); x++) { const q = (y * BW + x) << 2; D[q] *= f; D[q + 1] *= f; D[q + 2] *= f; }
  }
  for (let k = 0; k < 720; k++) { const a = k / 2 * DEG; K.dot(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0, 1, L_[0], L_[1], L_[2], (k % 6 ? .5 : .9) * A); }
  for (let k = 0; k < 24; k++) { const a = k * 15 * DEG; for (let r = R0 + 2 * S_; r < R0 + (k % 6 ? 6 : 11) * S_; r += .8) K.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, L_[0], L_[1], L_[2], .8 * A); }
  // the lattice
  const N = 2 * LP_N, su = 22 * S_, yaw = .55 + .22 * Math.sin(u * .35), pit = -.42, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const lp = E.sat((s.gt - .1) / .85) * (N + 1.3);
  const P = (i, j, k, o) => { const x = i - N / 2, y = k - N / 2, z = j - N / 2, x1 = cyw * x + syw * z, z1 = -syw * x + cyw * z; o[0] = cx + x1 * su; o[1] = cy - (cp * y - sp * z1) * su; o[2] = sp * y + cp * z1; };
  for (const st of LPS) {
    const lo = st[2] <= st[5], km = Math.max(st[2], st[5]), g = E.sat(lp - km + 1);
    if (g <= 0) continue;
    if (lo) { P(st[0], st[1], st[2], PA); P(st[3], st[4], st[5], PB); } else { P(st[3], st[4], st[5], PA); P(st[0], st[1], st[2], PB); }
    const fresh = g < 1 || km > lp - .6, n = Math.max(2, Math.ceil(Math.hypot(PB[0] - PA[0], PB[1] - PA[1]) * g / (1.4 * S_)));
    for (let q = 0; q <= n; q++) {
      const t = q / n * g, x = PA[0] + (PB[0] - PA[0]) * t, y = PA[1] + (PB[1] - PA[1]) * t, z = PA[2] + (PB[2] - PA[2]) * t;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > (R0 - 3 * S_) * (R0 - 3 * S_)) continue;
      const b = (.35 + .65 * E.sat(.5 - z / (N * 1.1))) * A;
      if (fresh) K.dot(x, y, 1, L_[0], L_[1], L_[2], Math.min(1, b * 1.3)); else K.dot(x, y, 1, WH[0], WH[1], WH[2], b);
    }
    if (fresh && g < 1) { const x = PA[0] + (PB[0] - PA[0]) * g, y = PA[1] + (PB[1] - PA[1]) * g; if ((x - cx) ** 2 + (y - cy) ** 2 < R0 * R0) K.dot(x, y, 2, HOT[0], HOT[1], HOT[2], A); }
  }
  // the scale bar: one cell
  const bx0 = cx - su, bx1 = cx + su, by = cy + R0 - 24 * S_;
  for (let x = bx0; x <= bx1; x += .7) K.dot(x, by, 2, L_[0], L_[1], L_[2], A);
  for (const x of [bx0, bx1]) for (let y = by - 6 * S_; y <= by + 6 * S_; y += .7) K.dot(x, y, 1, L_[0], L_[1], L_[2], A);
  K.setTag(TG.LP1, '', `${2 * LP_UM} µm`, '', 'lime sm', bx1 + 10 * S_, by - 12 * S_, A);
  // the leader to the forming front (the top of the sabot there), the magnification against the main view
  const Tr = X.mul(WS, s.RF), zf = Math.min(RGR.SAB_Z1 - .02, s.zD - .02), Pf = X.ap(Tr, [-(RGR.Rz(zf) - .004), 0, zf]);
  if (K.pj(Pf[0], Pf[1], Pf[2])) {
    const fx = K.PJ[0], fy = K.PJ[1], a = Math.atan2(fy - cy, fx - cx), mag = (su / (LP_UM * 1e-6)) / (K.C.fl / K.PJ[2]);
    K.leader(fx, fy, cx + Math.cos(a) * R0, cy + Math.sin(a) * R0, '#C6F432', .8 * A); K.dot(fx, fy, 3, L_[0], L_[1], L_[2], A);
    const mg = mag > 100 ? Math.round(mag / 10) * 10 : Math.round(mag);
    K.setTag(TG.LP2, 'LAT', 'Strut · micro-lattice', `×${mg}`, 'lime sm', cx - R0 * .7, cy - R0 - 40 * S_, A);
  }
}
/* the tolerance scan: from each profilometer head a laser fan across the round to its profile (the lit arc where it
   lands), the runout measured so far plotted above the round from the nose down to the ring (a hairline against its
   dashed ±TOL_B µm band, 6 mm per µm), the pen at the ring with its drop line to the round */
function tolFX(u, s, ctx, Ti, rs, rsAt) {
  const ap = ctx.apI, A = s.tol, Tr = X.mul(WS, s.RF), zr = s.zI;
  for (const an of [40, 140, 220, 320]) {
    const a = an * DEG; ap(Ti, Math.cos(a) * .2, Math.sin(a) * .2, 0, Q1);
    let px = 0, py = 0, pz = 0;
    for (let k = -6; k <= 6; k++) {
      const b = a + k * 4.5 * DEG; ap(Ti, Math.cos(b) * rs, Math.sin(b) * rs, 0, Q2);
      if (!(k & 1)) K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2.2, 1, LIME, .2 * A);
      if (k > -6) K.lineW(px, py, pz, Q2[0], Q2[1], Q2[2], .8, 1, HOT, .95 * A, LIME, .1 * A, 0);
      px = Q2[0]; py = Q2[1]; pz = Q2[2];
    }
    P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .5 * A);
  }
  const X0 = -.215, kz = .006, z0 = Math.max(-.95, zr);
  for (const [off, dash, al] of [[0, 0, .3], [TOL_B, 1, .6], [-TOL_B, 1, .6]]) {
    for (let i = 0; i < 48; i++) {
      if (dash && (i & 1)) continue;
      const za = -.95 + i * .04; ap(Tr, X0 - off * kz, 0, za, Q1); ap(Tr, X0 - off * kz, 0, za + .036, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, off ? LIME : WH, al * A);
    }
  }
  let px = 0, py = 0, pz = 0, mz = 0, mv = -1;
  for (let z = .95, i = 0; z >= z0 - 1e-6; z -= .008, i++) {
    const r = runout(z); ap(Tr, X0 - r * kz, 0, z, Q1);
    if (i) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], .9, 1, HOT, .9 * A, LIME, .06 * A, 0);
    px = Q1[0]; py = Q1[1]; pz = Q1[2];
    if (Math.abs(r) > mv) { mv = Math.abs(r); mz = z; }
  }
  if (u < U.tl1 + .3) { ap(Tr, -rsAt(z0), 0, z0, Q2); K.lineW(px, py, pz, Q2[0], Q2[1], Q2[2], 2, 1, LIME, .6 * A); P_.oglow(px, py, pz, 9, LIME, .7 * A); P_.odot(px, py, pz, 3, HOT, A); }
  if (mv > 0) { ap(Tr, X0 - runout(mz) * kz, 0, mz, Q3); K.ringW(Q3, X.dir(Tr, [1, 0, 0]), X.dir(Tr, [0, 0, 1]), .012, 24, 1, LIME, .8 * A, 0); }
}
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
  // the deck's light fittings lit (a tube along each, a soft pool under it), the cabinet's status lights
  if (revealed(YH - .34)) {
    const A = .35 + .65 * FW.deck;
    for (const [x, z] of [[-1.2, 43.0], [1.2, 43.0], [-1.2, 46.8], [1.2, 46.8], [-1.2, 50.6], [1.2, 50.6]]) {
      ap(WS, x, YH - .335, z - .45, Q1); ap(WS, x, YH - .335, z + .45, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.6, 1, WH, .8 * A, WH, .12 * A, .05);
      ap(WS, x, YH - .4, z, Q3); oglow(Q3[0], Q3[1], Q3[2], 30, WH, .07 * A);
    }
  }
  if (revealed(YD + 1.5)) {
    const c = DRESS_CAB, A = .4 + .6 * FW.deck, fr2 = Math.floor(ctx.T * 2);
    for (let i = 0; i < 6; i++) { ap(WS, c[0][0] + .15 + i * .14, YD + 1.55, c[0][2] - .01, Q1); const on = K.hh(i * 3.3, fr2 >> (i & 1)) > .3; odot(Q1[0], Q1[1], Q1[2], 2, on ? LIME : WH, (on ? .9 : .35) * A); }
    for (let k = 0; k < 4; k++) { const y = YD + 1.0 + k * .1, w = .25 + .5 * K.hh(k * 1.7, Math.floor(ctx.T * 1.5)); ap(WS, c[0][0] + .1, y, c[0][2] - .01, Q1); ap(WS, c[0][0] + .1 + w * (c[1][0] - c[0][0] - .2), y, c[0][2] - .01, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, LIME, .55 * A); }
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
  // the counterbalance: a gas spring from the turret's pin to the upper arm's, its rod sliding out as the shoulder
  // tips forward (lime while it works)
  { const a = X.ap(W(LK.turret), [-.19 * SA, .25 * SA, -.05 * SA]), b = X.ap(W(LK.upper), [-.19 * SA, .18 * SA, -.11 * SA]);
    ramLines(a, b, .03 * SA, .015 * SA, .25 * SA, Math.min(1, Math.abs(QV[1] - QW[1]) / .06), FW.arm); }
  // the dress pack: the arm's hose bundle from the base's connector over the turret and along the links in clamps,
  // swinging with them
  { const pts = [X.ap(W(LK.base), [0, .03 * SA, -.31 * SA]), X.ap(W(LK.turret), [0, .66 * SA, -.08 * SA]), X.ap(W(LK.upper), [0, .26 * SA, -.12 * SA]),
      X.ap(W(LK.upper), [0, .56 * SA, -.11 * SA]), X.ap(W(LK.fore), [0, .06 * SA, -.12 * SA]), X.ap(W(LK.tube), [0, .36 * SA, -.08 * SA]), X.ap(W(LK.tube), [0, .58 * SA, -.07 * SA])];
    const A = .55 * FW.arm, n = pts.length;
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, t2 = t * t, t3 = t2 * t, c = [0, 1, 2].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) - (i === 0 ? 0 : .012 * Math.sin(t * PI) * (j === 1 ? 1 : 0)));
        if (i || k) for (const o of [0, .018]) K.lineW(px, py + o, pz, c[0], c[1] + o, c[2], 1.3, o ? 1 : 2, WH, A * (o ? .6 : 1));
        px = c[0]; py = c[1]; pz = c[2];
      }
      if (i > 1) { const d = V.norm(V.sub(p2, p1)), [U_, W_] = perpOf(d); K.ringW(p1, U_, W_, .03 * SA, 14, 1, WH, A, 0); }
    }
  }
  // the track: its carriage's drive and the cable chain riding along in its tray
  { const zt = s.zt, mv = Math.abs(ztAt(u + .05) - zt) > .002;
    for (let k = 0; k <= 24; k++) { const t = k / 24, z = E.mix(ZC - .8, zt, t); ap(WS, XA - .56, YD + .11, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .4 * FW.arm); }
    ap(WS, XA, YB - .3 * SA, zt + .5 * SA, Q1); odot(Q1[0], Q1[1], Q1[2], 2, mv ? LIME : WH, mv ? 1 : .4); }
  // the gripper: its LED lime while it holds, the jaws' contact flashing as they close
  { const Th = W(LK.hand); ap(Th, 0, .06 * SA, .075 * SA, Q1); odot(Q1[0], Q1[1], Q1[2], 2, s.held ? LIME : WH, s.held ? 1 : .4); if (s.held) oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .4);
    const g = Math.max(lock(u, G_ROD), lock(u, G_RND));
    if (g > .02) for (const sg of [-1, 1]) { ap(Th, sg * s.grip, LG, 0, Q1); oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .6 * g); odot(Q1[0], Q1[1], Q1[2], 2, HOT, g); } }
  // the centres: a lime flash as they take the rod, a ring at each end while it is held between them
  { const f = lock(u, U.cen1), Tw = W(s.SH);
    if (s.quill > .02) for (const z of [-1.0, 1.0]) { ap(Tw, 0, 0, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .5 + .5 * f); if (f > .02) oglow(Q1[0], Q1[1], Q1[2], 26, LIME, .6 * f); } }
  // the coater: per fingertip its laser (a lime beam from the nozzle to the channel, the spot, glints on the fresh
  // trace behind it, sparks thrown off the spot, all on the coater's clock), the nozzles' lenses; the amplifiers' lights
  if (s.coat) {
    const Th = W(s.HEAD), tau = s.tau, ff = Math.floor(tau * 300);
    for (let a = 0; a < NMA; a++) {
      const m = MA[a], c = Math.cos(m.th), sn = Math.sin(m.th), mk = Math.max(.3, m.kf || 1);
      if (m.o2 < .3) continue;
      for (let i = 0; i < 9; i++) {
        const i3 = i * 3, f = m.fire[i], h0 = a * 9 + i;
        ap(Th, m.tip[i3], m.tip[i3 + 1], m.tip[i3 + 2], Q1);
        odot(Q1[0], Q1[1], Q1[2], 1, f > 0 ? HOT : WH, (f > 0 ? 1 : .6 * m.o2) * mk);
        // between strokes the beam stays on at low power (every one of the 72 visible), its spot a faint lime point
        if (f <= 0) {
          if (m.o2 > .9 && s.wr > .5) { ap(Th, m.spot[i3], m.spot[i3 + 1], m.spot[i3 + 2], Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .6, 1, LIME, .4 * mk); odot(Q2[0], Q2[1], Q2[2], 1, LIME, .55 * mk); }
          continue;
        }
        const fk = (.72 + .28 * K.hh(h0 * 1.37, ff)) * mk, sx = m.spot[i3], sy = m.spot[i3 + 1], sz = m.spot[i3 + 2];
        ap(Th, sx, sy, sz, Q2);
        K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, LIME, .95 * fk, LIME, .14 * fk, .035 * fk);
        oglow(Q1[0], Q1[1], Q1[2], 4, LIME, .45 * fk); oglow(Q2[0], Q2[1], Q2[2], 7, LIME, .6 * fk); odot(Q2[0], Q2[1], Q2[2], 2, HOT, fk);
        // glints on the fresh conductor just behind the spot
        for (let q = 0; q < 2; q++) { const hz = K.hh(h0 + q * 31, ff >> 2); if (hz < .5) { ap(Th, sx * 1.002, sy * 1.002, sz - .0006 - hz * .005, Q3); odot(Q3[0], Q3[1], Q3[2], 1, HOT, (.9 - hz) * mk); } }
        // sparks: three per stroke, each born at its moment of the stroke, flying off the spot
        const nS = Math.floor(tau * FLK_HZ + m.ph[i]);
        for (let q = 0; q < 3; q++) {
          const tb = (nS - m.ph[i] + (.12 + .28 * q) * FLK_ON) / FLK_HZ, age = tau - tb, h1 = K.hh(h0 * 3.1 + q, nS), life = .02 + .025 * h1;
          if (age < 0 || age > life) continue;
          const h2 = K.hh(h0 * 5.3 + q, nS), h3 = K.hh(h0 * 7.9 + q, nS), vr = .12 + .3 * h1, vt = (h2 - .5) * .36, vz = (h3 - .5) * .3 - .06;
          const p = t => [sx + (c * vr - sn * vt) * t, sy + (sn * vr + c * vt) * t, sz + vz * t];
          const P1 = p(age), P0 = p(Math.max(0, age - .005)), k = 1 - age / life;
          ap(Th, P0[0], P0[1], P0[2], Q2); ap(Th, P1[0], P1[1], P1[2], Q3);
          K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 1, 1, k > .6 ? HOT : LIME, .9 * k * mk);
        }
      }
    }
    // the ink filling each channel behind its hand: a molten band at the front cooling to lime along the trace
    if (s.wr > .02 && s.laid > -8 && s.laid < 8) {
      const RFw = W(s.RF), z1 = s.laid, A = s.wr;
      for (let a = 0; a < RGR.NTR; a++) {
        for (let k = 0; k <= 14; k++) {
          const z = z1 - .09 * k / 14, th = RGR.thAt(a, z), r = Math.min(RGR.RL, RGR.surfR(z) - .0002);
          ap(RFw, Math.cos(th) * r, Math.sin(th) * r, z, Q2);
          if (k) K.lineW(Q3[0], Q3[1], Q3[2], Q2[0], Q2[1], Q2[2], 1.3, 1, k < 4 ? HOT : LIME, A * (1 - k / 15) * .95, LIME, .12 * A * (1 - k / 15), .01);
          Q3[0] = Q2[0]; Q3[1] = Q2[1]; Q3[2] = Q2[2];
        }
      }
    }
    for (let a = 0; a < NMA; a++) { const th = MA_TH(a); ap(Th, Math.cos(th) * .1955, Math.sin(th) * .1955, .018, Q1); odot(Q1[0], Q1[1], Q1[2], 2, MA[a].dep > .5 ? LIME : WH, MA[a].dep > .5 ? .6 + .4 * Math.sin(ctx.T * 9 + a) : .4); }
  }
  // the grower: the lead screw turning (its thread's marks run as the ring moves), the feed hoses swinging after the
  // ring, the emitters' beams in converging pairs onto the forming lattice, the ring's own lights
  if (FW.grow > .2) {
    const Tg = W(X.make(R_LINE, [XL, YL, ZG + GR_ZC])), zr = s.zD - GR_ZC, ph = zr / .01 * TAU, mvG = s.gt > 0 && s.gt < 1.05 ? 1 : 0;
    for (let z = -.76; z < .6; z += .05) { const a = ph + z * 2; ap(Tg, Math.cos(a) * .009, -.311 + Math.sin(a) * .009, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, mvG ? LIME : WH, mvG ? .8 : .35); }
    // three hoses from the manifold on top to the ring's back, sagging between
    const Td = W(s.DEPO);
    for (let k = 0; k < 3; k++) {
      const a = [-.37, -.03 + k * .03, .14], b = [-.21, -.06 + k * .03, zr - .02];
      let px = 0, py = 0, pz = 0;
      for (let q = 0; q <= 20; q++) {
        const t = q / 20, x = E.mix(a[0], b[0], t) + .09 * Math.sin(t * PI), y = E.mix(a[1], b[1], t), z = E.mix(a[2], b[2], t);
        ap(Tg, x, y, z, Q1);
        if (q) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 1.3, 1, WH, .5 * FW.grow);
        px = Q1[0]; py = Q1[1]; pz = Q1[2];
        if (mvG && ((q + Math.floor(ctx.T * 12)) % 5) === 0) odot(Q1[0], Q1[1], Q1[2], 2, LIME, .7);
      }
    }
  }
  if (s.gt > 0 && s.gt < 1.05) {
    const Td = W(s.DEPO), zf = s.zD, rf = Math.max(.03, RGR.Rz(zf) - .01);
    for (let k = 0; k < 16; k++) {
      const an = (30 + k * 20) * DEG, c = Math.cos(an), sn = Math.sin(an);
      ap(Td, c * .189, sn * .189, 0, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .9); oglow(Q1[0], Q1[1], Q1[2], 5, LIME, .35);
      // each beam meets its neighbour's at a point of the forming layer (the pair's focus writes it)
      const kp = k >> 1, h = K.hh(kp * 2.3, fr), rr = RGR.R_IN + (rf - RGR.R_IN) * (.35 + .65 * h), a2 = (30 + kp * 40 + 10) * DEG + (K.hh(kp * 5.1, fr) - .5) * .25, dz = -.012 - .02 * K.hh(kp * 7.7, fr);
      ap(Td, Math.cos(a2) * rr, Math.sin(a2) * rr, dz, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, LIME, .5 + .3 * h, LIME, .05, 0);
      if (k & 1) { odot(Q2[0], Q2[1], Q2[2], 2, HOT, .95); oglow(Q2[0], Q2[1], Q2[2], 7, LIME, .45); }
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
  loupe(u, s, ctx);
  // the press: oil pulses along the hoses while the rams close and draw back, the gauge's needle with the pressure,
  // the capacitor bank charging (its cans lime), then the fuse: current down the bus bars and the shunts into the
  // electrodes, arcs across the halves' seam
  if (FW.stat > .2) {
    const z = ZR + ZAM, off = .36 * (1 - s.amc) + .3 * s.amb, mx = XL + .78, mz = z + .38, A = FW.stat;
    const pr = kk(u, U.am0 + .3, U.am1 + .2) * (1 - kk(u, U.amR0 - .1, U.amR0 + .5)), flowIn = u > U.am0 && u < U.am1 + .3, flowOut = u > U.amR0 && u < U.amR1 + .2;
    for (const sg of [-1, 1]) for (const [d, oz] of [[.68, -.05], [.9, .05]]) {
      const a = [XL + sg * d, YL + .115, z], b = [XL + sg * .78 + (d > .8 ? .06 : -.06), YD + .22, (sg > 0 ? mz : z - .38) + oz], mid = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + .06, (a[2] + b[2]) / 2];
      let px = 0, py = 0, pz = 0;
      for (let q = 0; q <= 18; q++) {
        const t = q / 18, w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t;
        ap(WS, a[0] * w0 + mid[0] * w1 + b[0] * w2, a[1] * w0 + mid[1] * w1 + b[1] * w2, a[2] * w0 + mid[2] * w1 + b[2] * w2, Q1);
        if (q) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 1.3, 2, WH, .45 * A);
        px = Q1[0]; py = Q1[1]; pz = Q1[2];
        const fl = flowIn ? ((d > .8) === (sg > 0) ? 1 : -1) : flowOut ? ((d > .8) === (sg > 0) ? -1 : 1) : 0;
        if (fl && ((q + Math.floor(fl * ctx.T * 16) % 4 + 4) % 4) === 0) odot(Q1[0], Q1[1], Q1[2], 2, LIME, .85 * A);
      }
    }
    // the gauge
    { const a = (-135 + 270 * (.72 * pr + .03 * pr * Math.sin(ctx.T * 40) * lock(u, U.fuse) * 4)) * DEG;
      ap(WS, mx + .007, YD + .3, mz, Q1); ap(WS, mx + .007, YD + .3 + Math.cos(a) * .036, mz + Math.sin(a) * .036, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, pr > .5 ? LIME : WH, .95 * A); odot(Q1[0], Q1[1], Q1[2], 2, WH, A);
      if (pr > .5) oglow(Q2[0], Q2[1], Q2[2], 6, LIME, .4 * A); }
    // the bank: its cans charging up to the fuse, emptying at it
    { const ch = kk(u, U.am1, U.fuse - .05) * (1 - kk(u, U.fuse, U.fuse + .12)), cx0 = XL - .95, cz0 = z + .28;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ap(WS, cx0 + .05 + i * .087, YD + .452, cz0 + .05 + j * .08, Q1); odot(Q1[0], Q1[1], Q1[2], 2, ch > .1 ? LIME : WH, (.3 + .7 * ch) * A); if (ch > .5) oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .25 * ch * A); } }
    // the shunts from the bus risers to the platens' lugs (laminations sagging, flexing as the platens move)
    const fu = lock(u, U.fuse);
    for (const sg of [-1, 1]) {
      const a = [XL + sg * .5, YL - .15, z + .165], b = [XL + sg * (.14 + off + .015), YL + .15, z], mid = [(a[0] + b[0]) / 2 + sg * .03, (a[1] + b[1]) / 2 + .12, z + .12];
      for (let l = 0; l < 4; l++) {
        let px = 0, py = 0, pz = 0;
        for (let q = 0; q <= 14; q++) {
          const t = q / 14, w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t;
          ap(WS, a[0] * w0 + mid[0] * w1 + b[0] * w2, a[1] * w0 + mid[1] * w1 + b[1] * w2 + l * .006, a[2] * w0 + mid[2] * w1 + b[2] * w2, Q1);
          if (q) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 1.4, 1, fu > .05 ? LIME : WH, (fu > .05 ? .5 + .5 * fu : .35) * A);
          px = Q1[0]; py = Q1[1]; pz = Q1[2];
        }
      }
      if (fu > .02) { ap(WS, XL + sg * .14, YL, z, Q1); oglow(Q1[0], Q1[1], Q1[2], 22, LIME, .6 * fu); }
    }
    if (fu > .02) {
      const Tr = W(s.RF);
      for (let i = 0; i < 6; i++) { ap(Tr, -.085 + .034 * i, 0, RGR.ARM_Z0, Q1); ap(Tr, -.085 + .034 * i + (K.hh(i, fr) - .5) * .03, (K.hh(i * 3, fr) - .5) * .03, RGR.ARM_Z0 - .01, Q2); K.arcW(Q1, Q2, i + fr * .1, ctx.T, fu, .8, LIME); }
      ap(Tr, 0, 0, RGR.ARM_Z0 + .04, Q1); oglow(Q1[0], Q1[1], Q1[2], 60, LIME, .55 * fu); K.ringW(Q1, X.dir(Tr, [1, 0, 0]), X.dir(Tr, [0, 1, 0]), .16 + .14 * (1 - fu), 120, 2, LIME, fu, 0);
    }
  }
  // the charge ring: on the sweep its plane (a lattice of lime dots, a sweep line turning in it), the section where it
  // cuts the round, arcs from the electrodes; then the profilometers' laser fans on the tolerance scan
  {
    const Ti = W(s.RING), zr = s.zI, on = s.sweep;
    const rsAt = z => z > RGR.SAB_Z0 && z < RGR.SAB_Z1 ? RGR.Rz(z) : z > RGR.ARM_Z0 && z < RGR.ARM_Z1 ? .14 : z < -.86 ? RGR.FIN_R : z > RGR.NOSE_Z ? RGR.surfR(z) : RGR.ROD_R;
    const rs = rsAt(zr), U_ = X.dir(Ti, [1, 0, 0]), W_ = X.dir(Ti, [0, 1, 0]);
    if (on > .01) {
      ap(Ti, 0, 0, 0, Q1);
      for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) { if (i * i + j * j > 144) continue; ap(Ti, i * .02, j * .02, 0, Q2); K.dotW(Q2[0], Q2[1], Q2[2], 1, LIME, (.18 + .2 * ((i + j) & 1 ? 0 : 1)) * on); }
      { const a = ctx.T * 5; ap(Ti, Math.cos(a) * .24, Math.sin(a) * .24, 0, Q2); ap(Ti, -Math.cos(a) * .24, -Math.sin(a) * .24, 0, Q3); K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 1.2, 1, LIME, .7 * on, LIME, .06 * on, 0); }
      K.ringW(Q1, U_, W_, .25, 140, 2, LIME, .8 * on, ctx.T * 2); K.ringW(Q1, U_, W_, .24, 100, 1, HOT, .4 * on, -ctx.T * 3);
      K.ringW(Q1, U_, W_, RGR.ROD_R + .001, 40, 2, HOT, on, 0);
      if (rs > RGR.ROD_R + .002) K.ringW(Q1, U_, W_, rs, 90, 1, LIME, .9 * on, 0);
      K.glowW(Q1[0], Q1[1], Q1[2], 50, LIME, .22 * on);
      for (const an of [100, 260]) {
        const c = Math.cos(an * DEG), sn = Math.sin(an * DEG); ap(Ti, c * .165, sn * .165, 0, Q2);
        const a2 = an * DEG + (K.hh(an, fr) - .5) * .5; ap(Ti, Math.cos(a2) * rs, Math.sin(a2) * rs, (K.hh(an * 3, fr) - .5) * .03, Q3);
        K.arcW(Q2, Q3, an + fr * .1, ctx.T, .9 * on, .5, LIME); oglow(Q2[0], Q2[1], Q2[2], 10, LIME, .5 * on);
      }
    }
    const ps = lock(u, U.riS1);
    if (ps > .02) { ap(Ti, 0, 0, 0, Q1); K.ringW(Q1, U_, W_, .3 + .1 * (1 - ps), 140, 2, LIME, ps, 0); }
    // the heads' lenses: lime while they measure
    for (const an of [40, 140, 220, 320]) { ap(Ti, Math.cos(an * DEG) * .2, Math.sin(an * DEG) * .2, 0, Q2); odot(Q2[0], Q2[1], Q2[2], 2, s.tol > .1 ? LIME : WH, s.tol > .1 ? .9 : .4 * FW.stat); }
    if (s.tol > .01) tolFX(u, s, ctx, Ti, rs, rsAt);
  }
  // the hero: a scan plane rising through the finished round, X-raying it as it goes
  if (s.hero > .01) {
    const Tr = W(s.RF), z = E.mix(-1.06, 1.06, s.hz), A = s.hero, U_ = X.dir(Tr, [1, 0, 0]), W_ = X.dir(Tr, [0, 1, 0]);
    ap(Tr, 0, 0, z, Q1);
    for (const r of [.2, .21]) K.ringW(Q1, U_, W_, r, 160, r > .205 ? 1 : 2, LIME, (r > .205 ? .45 : .85) * A, ctx.T * .6);
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) { if (i * i + j * j > 100) continue; ap(Tr, i * .02, j * .02, z, Q2); K.dotW(Q2[0], Q2[1], Q2[2], 1, LIME, (.14 + .16 * ((i + j) & 1 ? 0 : 1)) * A); }
    const rr = z > RGR.SAB_Z0 && z < RGR.SAB_Z1 ? RGR.Rz(z) : z > RGR.NOSE_Z ? RGR.surfR(z) : RGR.ROD_R;
    K.ringW(Q1, U_, W_, rr + .001, 90, 2, HOT, A, 0); K.glowW(Q1[0], Q1[1], Q1[2], 40, LIME, .18 * A);
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
  const m4 = MA[4], H = s.HEAD;
  tag('ROB', 'ROB', 'Handling arm · 6-axis · track', '', LK.upper, [.1, A2 * .55, 0], 9.8, 11.6);
  tag('ROD', 'ROD', 'Rod · tungsten · 2.0 m · Ø25 mm', '', s.RF, [0, 0, .5], 11.9, 14.4);
  tag('COA', 'COA', 'Coater · 8 micro-arms', '', H, [0, -.18, .04], 17.0, 19.4);
  tag('MAR', 'MAR', 'Micro-arm · splits 1 → 3 → 9', `×${coRate(u).toFixed(2)}`, X.mul(H, m4.L2), [0, L2M * .5, 0], 21.0, 26.0);
  tag('LAS', 'LAS', 'Finger-arms · 72 lasers', `×${coRate(u).toFixed(2)}`, X.mul(H, m4.F[4][1]), [0, F2M, 0], 30.6, 35.8);
  tag('TRC', 'TRC', 'Circuit · 8 traces', `${Math.round(100 * E.clamp((s.laid - CO.Z0 - HAND) / (CO.Z1 - CO.Z0), 0, 1))} %`, s.RF, [0, .012, E.clamp(s.laid - .2, -.8, .8)], 37.6, 40.8);
  tag('TST', 'TRC', 'Circuit · tested', '8 / 8', s.RF, [0, .012, .3], uOfTau(CO.ts0), uOfTau(CO.ts1) + .4);
  tag('GRW', 'GRW', 'Lattice grower', '', X.make(R_LINE, [XL, YL, ZG]), [-.3, .2, -.3], 48.8, 50.6);
  tag('LAT', 'LAT', 'Lattice · forming', `${Math.round(100 * E.clamp(s.gt, 0, 1))} %`, s.RF, [-.12, .05, Math.min(.4, s.zD)], 51.8, 56.6);
  tag('SAB', 'SAB', 'Sabot · 3 segments · 24 mm cells', '', s.RF, [-.1, .1, -.1], 57.0, 59.4);
  tag('PRS', 'PRS', 'Press · 2 rams', '', tr(XL + .75, YL + .1, ZR + ZAM), [0, 0, 0], 62.2, 64.0);
  tag('AMS', 'ARM', 'Armature · 2 halves', u > U.fuse ? 'fused' : '', s.RF, [-.08, .14, RGR.ARM_Z0], 63.6, 67.0);
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
  tag('INS', 'INS', 'Charge ring', u > U.riS1 ? 'charged' : 'charging', s.RING, [-.25, .2, 0], U.ri0 + .4, U.riS1 + .6);
  tag('XRY', 'XRY', 'Circuit · X-ray · 8 channels', '', s.RF, [0, -.03, .62], U.rp0 + .4, U.rp1);
  tag('TOL', 'TOL', 'Tolerance · runout', `${TOLMAX.toFixed(1)} µm`, s.RING, [-.25, .2, 0], U.tl0 + .3, U.riE);
  tag('STK', 'STK', 'Strike-up', '', tr(CELL[0], s.cr, CELL[2]), [.26, -.36, 0], 89.6, 91.2);
  tag('HER', 'RND', 'Round · 2.0 m · 8 traces · 3 segments', '', s.RF, [0, .14, .2], 91.8, 96.0);
  tag('CEL', 'CEL', P_.MAG_CELL ? 'Magazine · cell' : 'Drum · cell 01', '', tr(CELL[0], YCT, CELL[2]), [.15, .3, 0], U.up1 - .2, LEN - .3);
}
function readout(u) {
  let l1, l2, rate = 1;
  const s = ST;
  const t = s.tau;
  if (u < 2.6) { l1 = 'Magazine · <b>fabrication deck</b>'; l2 = 'Round <b>called</b> · cell next'; }
  else if (u < U.co0) { l1 = 'Round · <b>fabrication</b>'; l2 = u < U.grip1 ? 'Rod <b>picked</b> · tungsten' : u < U.cen0 ? 'Rod <b>to the line</b>' : 'Centres <b>closed</b>'; }
  else if (u < U.sh1a) {
    rate = coRate(u); l1 = 'Coater · <b>circuit layer</b>';
    l2 = t < CO.d0 ? 'Head <b>to the rod</b>' : t < CO.d0 + .5 ? 'Micro-arms <b>reaching in</b>' : t < CO.d0 + 1.0 ? 'Hands <b>split</b> · 1 → 3' : t < CO.W0 ? 'Hands <b>split</b> · 3 → 9 · 72 tips'
      : t < CO.W1 ? `Traces <b>${Math.round(100 * E.clamp((s.laid - CO.Z0 - HAND) / (CO.Z1 - CO.Z0), 0, 1))} %</b> · 72 lasers` : t < CO.W1 + .85 ? 'Hands <b>folding</b> · 9 → 3 → 1' : 'Circuit <b>tested</b> · 8 traces';
  }
  else if (u < U.gr0) { l1 = 'Line · <b>shuttle</b>'; l2 = 'To the <b>lattice grower</b>'; }
  else if (u < U.sh2a) { l1 = 'Grower · <b>micro-lattice</b>'; l2 = s.gt < 1.04 ? `Layer <b>${Math.round(45 * E.clamp(s.gt, 0, 1))}</b>/45 · 3 segments` : 'Sabot <b>grown</b> · 3 segments'; }
  else if (u < U.am0) { l1 = 'Line · <b>shuttle</b>'; l2 = 'To the <b>press</b>'; }
  else if (u < U.ri0) { l1 = 'Press · <b>armature</b>'; l2 = u < U.am1 ? 'Halves <b>closing</b>' : u < U.fuse ? 'Halves <b>pressed</b>' : u < U.amR0 ? 'Armature <b>fused</b> · 2 halves' : 'Rams <b>back</b>'; }
  else if (u < U.rp0) { l1 = 'Charge ring · <b>charging</b>'; l2 = `Circuit <b>${Math.round(100 * E.clamp((s.zI + .95) / 1.9, 0, 1))} %</b> · tail to nose`; }
  else if (u < U.tl0) { l1 = 'Circuit · <b>X-ray</b>'; l2 = 'Charge <b>repeated</b> · nose to tail'; }
  else if (u < U.riE) { l1 = 'Tolerance · <b>scan</b>'; l2 = `Runout <b>${TOLMAX.toFixed(1)} µm</b> · band ±${TOL_B} µm`; }
  else if (u < U.place) { l1 = 'Round · <b>complete</b>'; l2 = 'To the <b>strike-up</b>'; }
  else if (u < U.up0) { l1 = 'Round · <b>complete</b>'; l2 = 'Inspection <b>passed</b>'; }
  else if (u < U.up1) { l1 = 'Strike-up · <b>to the magazine</b>'; l2 = 'Round <b>rising</b>'; }
  else { l1 = 'Magazine · <b>round stowed</b>'; l2 = P_.MAG_CELL ? 'Cell <b>next</b>' : 'Drum <b>cell 01</b>'; }
  return { l1, l2, rate };
}
/* while the lens is down in the deck the room and the ship are background seen through the floor: their dots spaced
   wider (the film sets these each frame from K.DQ before this runs) */
function xray(u, XS, ctx) {
  const f = 1 + .9 * (kk(u, 1.8, 3.4) - kk(u, 97.6, 99.8)) + .6 * (kk(u, 7.5, 8.5) - kk(u, 95.6, 96.8));
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
  const per = (2 * RGR.LEN + .7) / 1.25;                         // (the repeated charge's period: lines() at sp 1.25)
  return [
    [.3, () => SFX.tone(900, 2600, .9, 'sine', .012)], [10.4, servo(1.0, 340)], [11.4, servo(.4, 420)], [11.85, clack], [12.2, servo(.4, 400)],
    [12.6, servo(1.4, 360)], [14.0, servo(.6, 420)], [U.cen0, whirr(500, 700, .25)], [U.cen1, clunk], [15.12, clack], [15.25, servo(.4, 400)], [15.65, servo(2.7, 300)],
    [U.co0, whirr(200, 340, 1.0)], [uOfTau(CO.d0), servo(1.8, 260)], [uOfTau(CO.d0 + .4), buzz(2.4, 700)], [uOfTau(CO.d0 + .95), buzz(2.4, 1100)],
    [uOfTau(CO.W0), buzz(1.5, 380)], [uOfTau(3.5), buzz(1.8, 2400)], [uOfTau(4.6), buzz(6.4, 260)], [uOfTau(6.6), buzz(3.4, 2400)], [uOfTau(CO.W1), servo(2.6, 420)], [uOfTau(CO.off0), whirr(340, 200, .8)],
    [uOfTau(CO.ts0), () => SFX.tone(400, 2600, .9, 'sine', .01)],
    [U.sh1a, whirr(140, 260, 2.4)], [U.sh1b, clunk], [U.gr0 + .1, () => { SFX.tone(110, 165, 9.4, 'sawtooth', .006); SFX.noise(9.4, 7000, .4, .006, 1); }],
    [U.sh2a, whirr(140, 260, 2.4)], [U.sh2b, clunk], [U.am0, whirr(300, 420, 1.8)], [U.am1, clunk], [U.fuse, () => { SFX.crack && SFX.crack(); SFX.tone(1800, 600, .3, 'square', .01); }],
    [U.amR0, whirr(420, 300, .8)], [U.ri0, whirr(220, 300, .8)], [U.riS0, () => SFX.tone(200, 2400, 5.4, 'sawtooth', .01)], [U.riS1, tick], [U.riS1 + .09, tick],
    [U.rp0, () => SFX.tone(2400, 700, .6, 'sine', .01)], [U.rp0 + per, () => SFX.tone(2400, 700, .6, 'sine', .01)], [U.rp0 + 2 * per, () => SFX.tone(2400, 700, .6, 'sine', .01)],
    [U.tl0, () => SFX.tone(620, 640, 5.2, 'sine', .004)], [U.tl1, tick], [U.tl1 + .09, tick],
    [84.2, servo(1.4, 360)], [86.3, clack], [U.cenR0, whirr(600, 400, .25)], [87.1, servo(.8, 400)], [87.9, servo(1.5, 360)], [90.0, clunk], [90.2, clack], [90.5, servo(1.9, 380)],
    [U.hero0 + .6, () => SFX.tone(300, 2400, 4.6, 'sine', .005)],
    [U.sct0, whirr(300, 200, .4)], [U.up0, whirr(90, 220, 2.5)], [U.up1, clunk], [U.latch, tick], [U.dn0, whirr(200, 90, .7)],
  ];
}

window.RGM = { len: LEN, room: true, build, cues: [], cam, draw, xray, readout, tags,
  chapters: [{ t: 0, title: 'Fabrication' }, { t: U.co0, title: 'Circuit' }, { t: U.sh1a, title: 'Lattice' }, { t: U.sh2a, title: 'Armature' }, { t: U.ri0, title: 'Charge ring' }, { t: U.tl0, title: 'Tolerance' }, { t: 84.2, title: 'Round' }],
  dbg: () => ({ ST, CELL, U, CO, PZ, QK, MA, CLM, SEQ, SH, err: RGM.err, uOfTau, camLog, np: () => { const n = NPM; NPM = 0; return n; } }) };
})();
