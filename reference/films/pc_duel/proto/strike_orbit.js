/* STRIKE · the orbital half (window.STRIKE_ORBIT): the orbital railgun film re-timed for the closing act of the Duel,
   carrying the damage of the intercept. In the Duel the film is the headless copy in intercept_orbit.js (IORB, its
   render IORB.renderFull, steered through IORB.FULL); standalone (strike.html) the film itself (ORB, caught by
   strike_host.js). Its render is a pure function of its own base time T; this maps act time t onto it, films it with
   this act's own lens up to the charge (the orbital film's lens after, its turns smoothed and its roll capped),
   hands it the damage and the platform's pose, and keeps its own readout, tags and clock.

   Beats (act t; base time T):
     0     Rings   the hand-over from the intercept (x1, the lens where the intercept's last shot left it): the damaged
                   platform turns onto the destroyer (its pose eased onto the station's, 0.5 .. 11 s), the rings spin
                   down; the lens along the hull past the exit hole (T 43 .. 46)
     11    Ring    the rings stopped, ring A's broken chord (T 47.4); one long shot from outside the rings (no hull or
                   truss behind them)
     14.5  Split   the two rings break into their nodes, which fly forward to the prow and close into five
                   construction rings (T 47.6 .. 57.5); the lens drifts forward with them
     23    Build   the guide ring and the five rings lay the barrel out to 1016 m (the train held in frame, the lens
                   flying beside it ~250 m out; T 57.5 .. 112.4), then the crown and its iris; the rings drop back to
                   their stations, the lens pulling back to the whole barrel (T 119)
     37.5  Line    the lens glides back down the barrel to the prow (calibration, the switches, the bays' reconfiguring
                   and the breech opening run past, T 119 .. 159.5), the hull goes to X-ray over the bay and
                   strike_fab.js plays its 10 s: the rod line, damaged, still making tungsten rods; one round lifted by
                   the handling arm and run through the port into the open chamber (T held at the open breech, 159.6)
     51.4  Chamber the round seated (T 159.8: the base film's own round takes over), the breech closes, locks, clamps,
                   the coils frost (x5)
     55.5  Charge  from here the orbital film runs 1:1 (T 170 ..): the charge rings breech to muzzle, the fire at 63.1,
                   the bore ride (x1/20), the muzzle, the exit held (x1/100), the climb, the coast, the entry
     81.3          the hand-over to the sea (strike_sea.js), the rod 32.8 km up (T 195.82)
   The clock on screen runs at steady rates (eased steps of >= 1.5 s, never per frame): x1 -> x3 (the turn), x30 (the
   rings), x200 (the build), x40 (the move), x5 (the line and the chamber), x1 (the charge); from the charge on it is
   the orbital film's own sim clock (the transit x1/20, the exit x1/100, the fall). Before the charge the clock is this
   act's own integral (it ends exactly on the film's at T 170), so the damage (tH = the intercept's last plus the sim
   time since) and every rate shown agree.
   Damage: the intercept's (intercept_dmg.js, IACT.damage) at tH through IORB.FULL in every shot (setDamage).
   Colour: this craft is hostile: the orbital film's lime (rings' current, charge, coils, arrows) is turned coral on
   the raster; lime stays the destroyer's. Every effect is a pure function of t. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const ss = E.ss;
const K = ORK, C = K.C, LIME = K.LIME, HOT = K.HOT, WH = K.WH, CORAL = K.CORAL || [255, 106, 61];
const D = STAGE.dbg(), P = D.P, TL = D.TL;
const S = K.S;
const FULL = window.IORB && IORB.FULL ? IORB.FULL : null;
const FAB = window.STRIKE_FAB || null;
const sm = u => { u = E.sat(u); return u * u * u * (u * (u * 6 - 15) + 10); };
const ORT = window.ORTL || null;

/* ---------------- the beats ---------------- */
const TB = { RING: 11, SPLIT: 14.5, BUILD: 23, CROWN: 35, MOVE: 37.5, FAB: 42, SEAT: 51.4, FAB1: 52, TC: 55.5 };
const T_C = 170.6, T_END = 195.82;                                    // the base time of the 1:1 stretch; of the hand-over
const A_LEN = TB.TC + (T_END - T_C);
const FAB_LEN = FAB ? FAB.len : 10;

/* ---------------- the clock: steady rates, eased steps (log space) ---------------- */
/* [t, rate]: a rate holds between two equal keys and eases (smoothstep in log) between two different ones */
const RK = [[0, 1], [1.5, 1], [3.5, 3], [11, 3], [13, 30], [23, 30], [25, 200], [36.2, 200], [38.6, 40], [40.6, 40], [42.6, 20], [50.4, 20], [52.4, 5], [54, 5], [TB.TC, 1]];
const rateRK = t => {
  if (t <= RK[0][0]) return RK[0][1];
  let i = 0; while (i < RK.length - 2 && RK[i + 1][0] <= t) i++;
  const a = RK[i], b = RK[i + 1]; if (t >= b[0]) return b[1];
  const u = ss(a[0], b[0], t); return Math.exp(Math.log(a[1]) + (Math.log(b[1]) - Math.log(a[1])) * u);
};
const NS = Math.ceil(TB.TC * 400), SACC = new Float64Array(NS + 1);
for (let k = 1; k <= NS; k++) { const a = (k - 1) / 400, b = k / 400; SACC[k] = SACC[k - 1] + (rateRK(a) + 4 * rateRK((a + b) / 2) + rateRK(b)) / 6 / 400; }
const Sof = t => { const x = E.clamp(t * 400, 0, NS), k = Math.min(NS - 1, Math.floor(x)); return SACC[k] + (SACC[k + 1] - SACC[k]) * (x - k); };
const CLK_C = D.simClock(T_C);

/* ---------------- the time map: act t -> base T ---------------- */
const T0 = 43.0, CLK_T0 = D.simClock(T0);
const cinv = (c, lo, hi) => { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (D.simClock(m) < c) lo = m; else hi = m; } return (lo + hi) / 2; };
/* the turn (beat 1) runs on the film's own clock: T where the film's sim clock has run S(t) since T0 */
const TA = t => cinv(CLK_T0 + Sof(t), T0, 60);
/* the build: the guide ring's z eased from where it is at T 57.55 to the crown (T 112.4), T found from it */
const crZ = T => ORT ? ORT.crZ(T) : 84 + (T - 57.5) * 18.6;
const crInv = z => { let lo = 57.4, hi = 112.4; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (crZ(m) < z) lo = m; else hi = m; } return (lo + hi) / 2; };
const KEYS = [];
{
  for (let t = 0; t < TB.RING - 1e-6; t += .5) KEYS.push([t, TA(t)]);
  KEYS.push([TB.RING, TA(TB.RING)]);
  KEYS.push([TB.SPLIT, 47.45], [18.5, 52.0], [TB.BUILD, 57.55]);
  const z0 = crZ(57.55), z1 = crZ(112.4), d = TB.CROWN - TB.BUILD, v0 = 26, v1 = 36;
  for (let t = TB.BUILD + .5; t < TB.CROWN - 1e-6; t += .5) {
    const u = (t - TB.BUILD) / d, u2 = u * u, u3 = u2 * u;
    const z = z0 * (2 * u3 - 3 * u2 + 1) + v0 * d * (u3 - 2 * u2 + u) + z1 * (-2 * u3 + 3 * u2) + v1 * d * (u3 - u2);
    KEYS.push([t, crInv(z)]);
  }
  KEYS.push([TB.CROWN, 112.4], [TB.MOVE, 119], [TB.FAB, 159.55], [47, 159.65], [51.0, 159.75], [TB.SEAT, 159.81], [53.2, 163.4], [TB.TC, T_C]);
}
/* monotone cubic (Fritsch-Carlson) through the keys; x1 on screen at the hand-over, 1:1 from the charge */
const MK = (() => {
  const n = KEYS.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((KEYS[i + 1][1] - KEYS[i][1]) / (KEYS[i + 1][0] - KEYS[i][0]));
  m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i])); m.push(d[n - 2]);
  m[0] = 1 / D.rateOf(T0 + 1e-3); m[n - 1] = 1;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; } }
  m[0] = 1 / D.rateOf(T0 + 1e-3); m[n - 1] = 1;
  return { d, m };
})();
function baseT(t) {
  const n = KEYS.length;
  if (t <= KEYS[0][0]) return KEYS[0][1] + MK.m[0] * (t - KEYS[0][0]);
  if (t >= KEYS[n - 1][0]) return KEYS[n - 1][1] + (t - KEYS[n - 1][0]);
  let lo = 0, hi = n - 2; while (lo < hi) { const md = (lo + hi + 1) >> 1; if (KEYS[md][0] <= t) lo = md; else hi = md - 1; }
  const i = lo, [t0, y0] = KEYS[i], [t1, y1] = KEYS[i + 1], h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
  return y0 * (2 * u3 - 3 * u2 + 1) + MK.m[i] * h * (u3 - 2 * u2 + u) + y1 * (-2 * u3 + 3 * u2) + MK.m[i + 1] * h * (u3 - u2);
}
const dTdt = t => (baseT(t + .01) - baseT(t - .01)) / .02;
/* the rate on screen and the clock (sim s; the orbital film's own from the charge on) */
const rateAt = t => t < TB.TC ? rateRK(t) : D.rateOf(baseT(t)) * dTdt(t);
const simClock = t => t < TB.TC ? CLK_C - (Sof(TB.TC) - Sof(t)) : D.simClock(baseT(t));
const CLK0 = simClock(0);
const simSince = t => simClock(t) - CLK0;                          // sim s since the hand-over

/* ---------------- the host (the Duel): the intercept's end ---------------- */
let H = null;                                                    // { dmg, tH0, psiOff, pose0 {R, T}, cam0 (platform frame) }
const tHAt = t => H ? H.tH0 + simSince(t) : 1e9;

/* ---------------- frames: the platform's pose (the intercept's eased onto the station's) ---------------- */
const SLEW_T = [.5, 11];
const RQ = new Float64Array(9), RW = new Float64Array(9);
const WT = { R: new Float64Array(9), T: [0, 0, 0] };
function rotAx(ax, a, o) { const c = Math.cos(a), s = Math.sin(a), k = 1 - c, x = ax[0], y = ax[1], z = ax[2]; o[0] = c + x * x * k; o[1] = x * y * k - z * s; o[2] = x * z * k + y * s; o[3] = y * x * k + z * s; o[4] = c + y * y * k; o[5] = y * z * k - x * s; o[6] = z * x * k - y * s; o[7] = z * y * k + x * s; o[8] = c + z * z * k; return o; }
function mul3(A, B, o) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; }
let SLEW = null;                                                 // { ax, ang } of R0^T R1 at the station
function poseAt(t, T) {
  const W1 = D.platXf(T);
  const w = H ? sm((t - SLEW_T[0]) / (SLEW_T[1] - SLEW_T[0])) : 1;
  if (w >= 1) return W1;
  const R0 = H.pose0.R, T0_ = H.pose0.T;
  if (!SLEW) {
    const R1 = D.platXf(KEYS[0][1]).R, Mr = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += R0[k * 3 + i] * R1[k * 3 + j]; Mr[i * 3 + j] = s; }
    const ang = Math.acos(E.clamp((Mr[0] + Mr[4] + Mr[8] - 1) / 2, -1, 1));
    let ax = [Mr[7] - Mr[5], Mr[2] - Mr[6], Mr[3] - Mr[1]]; const l = Math.hypot(ax[0], ax[1], ax[2]); ax = l > 1e-9 ? [ax[0] / l, ax[1] / l, ax[2] / l] : [0, 0, 1];
    SLEW = { ax, ang };
  }
  rotAx(SLEW.ax, SLEW.ang * w, RQ); mul3(R0, RQ, RW);
  for (let i = 0; i < 9; i++) WT.R[i] = RW[i];
  for (let k = 0; k < 3; k++) WT.T[k] = T0_[k] + (W1.T[k] - T0_[k]) * w;
  return WT;
}
let Wt = D.platXf(KEYS[0][1]);
const apP = (p, o) => { const M = Wt.R, q = Wt.T; o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + q[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + q[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + q[2]; return o; };
const PW = p => apP(p, [0, 0, 0]);
/* world -> platform */
const toP = p => { const M = Wt.R, q = [p[0] - Wt.T[0], p[1] - Wt.T[1], p[2] - Wt.T[2]]; return [M[0] * q[0] + M[3] * q[1] + M[6] * q[2], M[1] * q[0] + M[4] * q[1] + M[7] * q[2], M[2] * q[0] + M[5] * q[1] + M[8] * q[2]]; };

/* ---------------- the damage (and the line): hooks into the orbital film's render ---------------- */
const SPLIT_A = TL.SPLIT[0], SPIN_D = TL.SPIN_D;
let tHnow = 1e9, TNOW = 43, RATE = 1, CUR_T = 0, CUR_t = 0;
const WF = { R: null, T: null };
/* the X-ray over the bay (the line's shot): the hull's plating and greebles thinned (IORB's options, restored after) */
const XO = window.IORB ? [IORB.DOHM, IORB.DOG, IORB.DO, IORB.LOOK && IORB.LOOK.ring, IORB.LOOK && IORB.LOOK.cr].filter(Boolean) : [];
const XO0 = XO.map(o => ({ a: o.a, keep: o.keep }));
const xrayAt = t => FAB ? ss(TB.FAB - 1.6, TB.FAB + .4, t) * (1 - ss(TB.FAB1 + .6, TB.TC - .3, t)) : 0;
function setDamage(t, T) {
  if (!FULL) return;
  for (const k in FULL) delete FULL[k];
  FULL.platXf = TT => poseAt(t, TT);
  // (the torque arrows: this act's turn onto the destroyer, not the film's own slew)
  FULL.slewFX = H ? ss(SLEW_T[0] + .6, SLEW_T[0] + 2.2, t) * (1 - ss(SLEW_T[1] - 2.4, SLEW_T[1] - .4, t)) : 0;
  const xr = xrayAt(t), fu = t - TB.FAB;
  if (H && H.dmg) {
    const dm = H.dmg, tH = tHnow;
    FULL.psiOff = H.psiOff;
    // the wobble dies as the rings spin down; the broken chord's halves go as ring A is taken apart
    const spin = 1 - ss(SPIN_D[0], SPIN_D[1], T);
    dm.wobK = spin; dm.ringAlpha = 1 - ss(SPLIT_A[0] + .4, SPLIT_A[0] + 2.4, T);
    const tl = dm.tilt(tH); FULL.tilt = [tl[0] * spin, tl[1] * spin];
    FULL.gimbal = dm.gimbal(tH);
    FULL.hull = dm.hullClip(tH);
    FULL.ring = PP => { dm.ringEdit(PP, tH); bridgeNodes(PP, dm); };
    FULL.pre = PP => { dm.portals(Wt, tH); if (xr > .5) { K.occReset(); ORL.G.occ = false; } };
  } else if (xr > .5) FULL.pre = () => { K.occReset(); ORL.G.occ = false; };
  // (the free pieces fly in the frame the ship had at the hand-over: inertial axes riding its position; the ship turns
  // under them onto the destroyer, the debris does not); then the rod line inside the bay, while it is on screen
  FULL.fx = (PP, Wt_) => {
    if (H && H.dmg && V.dist(C.eye, Wt_.T) < 60000) { WF.R = H.pose0.R; WF.T = Wt_.T; H.dmg.draw(PP, Wt_, tHnow, RATE, { eye: C.eye, target: C.target, fov: C.fov }, WF); }
    if (FAB && xr > .002) FAB.draw(fu, Wt_, { a: xr, T, tH: tHnow, dmg: H && H.dmg });
  };
}

/* the broken hull (intercept_dmg.js: the aft section, with the stabiliser rings, turned ~33 deg about a keel hinge; the
   renderer poses the platform twice, the fore section under Wt clipped at its cut, the aft under Wt * aft clipped at
   its own). The rings' nodes fly from the aft section's rings to the prow (fore): in the aft pass (the only one this
   hook sees, PP.W != Wt) each node in flight is carried from its aft pose onto the fore pose by the time it reaches
   the cut, so it flies across the break instead of jumping where it crosses it */
const BRQ = { M: { R: new Float64Array(9), T: [0, 0, 0] }, F: { R: new Float64Array(9), T: [0, 0, 0] } };
const ssInv = x => { x = E.sat(x); let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (m * m * (3 - 2 * m) < x) lo = m; else hi = m; } return (lo + hi) / 2; };
function bridgeNodes(PP, dm) {
  const WA = PP.W, IS = window.IORB && IORB.ST;
  if (!WA || !IS || !IS.sc || !PP.nodeX || !dm.brk || Math.abs(WA.T[0] - Wt.T[0]) + Math.abs(WA.T[1] - Wt.T[1]) + Math.abs(WA.T[2] - Wt.T[2]) + Math.abs(WA.R[0] - Wt.R[0]) + Math.abs(WA.R[4] - Wt.R[4]) < 1e-6) return;
  // M = Wt * WA^-1 (an aft-posed world pose -> the fore-posed one)
  const M = BRQ.M, A = Wt.R, B = WA.R;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M.R[i * 3 + j] = A[i * 3] * B[j * 3] + A[i * 3 + 1] * B[j * 3 + 1] + A[i * 3 + 2] * B[j * 3 + 2];
  for (let i = 0; i < 3; i++) M.T[i] = Wt.T[i] - (M.R[i * 3] * WA.T[0] + M.R[i * 3 + 1] * WA.T[1] + M.R[i * 3 + 2] * WA.T[2]);
  const ZC = dm.brk.zb - 5, NRN = P.NRN || 28, F = BRQ.F;
  const carry = (X_, k) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) { let v = 0; for (let q = 0; q < 3; q++) v += M.R[i * 3 + q] * X_.R[q * 3 + j]; F.R[i * 3 + j] = v; }
      F.T[i] = M.R[i * 3] * X_.T[0] + M.R[i * 3 + 1] * X_.T[1] + M.R[i * 3 + 2] * X_.T[2] + M.T[i];
    }
    for (let i = 0; i < 9; i++) X_.R[i] += (F.R[i] - X_.R[i]) * k;
    for (let i = 0; i < 3; i++) X_.T[i] += (F.T[i] - X_.T[i]) * k;
  };
  for (let g = 0; g < PP.nodeX.length; g++) {
    const u = IS.sc.u[g]; if (!(u > 0)) continue;
    const ri = g < NRN ? 0 : 1, z0 = P.RING_Z[ri], L_ = P.SC_MAP ? P.SC_MAP[g][0] : 0, zs = IS.sc.z[L_];
    const uc = Math.max(.02, isNaN(zs) ? .2 : .7 * ssInv((ZC - z0) / (zs - z0))), k = ss(0, uc, u);
    if (k <= 0) continue;
    carry(PP.nodeX[g], k); if (PP.rotorX && PP.rotorX[g]) carry(PP.rotorX[g], k);
  }
}

/* ---------------- the lens ---------------- */
const lookP = (e, g, fov, roll) => ({ eye: PW(e), target: PW(g), fov: fov * DEG, roll: roll || 0 });
const slerpD = (a, b, w) => { const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), th = Math.acos(c); if (th < 1e-4 || th > PI - 1e-3) return V.norm(V.lerp(a, b, w)); const s = Math.sin(th), ka = Math.sin((1 - w) * th) / s, kb = Math.sin(w * th) / s; return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]; };
/* two shots blended by eye position, look direction (an even turn) and log distance (a near and a far look do not swing) */
function mixS(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const eye = V.lerp(a.eye, b.eye, w), da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = V.len(da), lb = V.len(db);
  const d = slerpD(V.mul(da, 1 / la), V.mul(db, 1 / lb), w), L = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * w);
  return { eye, target: V.mad(eye, d, L), fov: a.fov + (b.fov - a.fov) * w, roll: (a.roll || 0) + ((b.roll || 0) - (a.roll || 0)) * w };
}
/* a far and a near shot blended with the eye eased in log distance from the subject (a long glide that slows as it
   arrives instead of crossing most of the way in the blend's middle) */
function glideS(a, b, w, sub) {
  if (w <= 0) return a; if (w >= 1) return b;
  const ra = V.sub(a.eye, sub), rb = V.sub(b.eye, sub), la = V.len(ra), lb = V.len(rb);
  const L = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * w), dir = slerpD(V.mul(ra, 1 / la), V.mul(rb, 1 / lb), w);
  const s = mixS(a, b, w), eye = V.mad(sub, dir, L), d = V.norm(V.sub(s.target, s.eye));
  return { eye, target: V.mad(eye, d, V.dist(s.eye, s.target)), fov: s.fov, roll: s.roll };
}
/* the damage's anchors (platform frame): the exit hole, the entry, ring A's broken chord at rest */
let AN = null;
function anchors() {
  if (AN) return AN;
  const dm = H && H.dmg;
  if (dm) {
    const hx = dm.holes[1], hn = dm.holes[0];
    // (ring A rides the aft section: its broken chord carried to where the break has turned it)
    const q0 = H.chordRest || dm.ring.Q.slice(), Q = dm.toSec ? dm.toSec(q0, H.tH0 + 30) : q0;
    AN = { X: hx.C.slice(), XN: hx.n.slice(), N: hn.C.slice(), NN: hn.n.slice(), Q };
  } else AN = { X: [-40, 10, -200], XN: [-1, 0, 0], N: [36, -16, -170], NN: [1, -.5, 0], Q: [-170, 290, -300] };
  return AN;
}
const cyl = (ph, r, z) => [Math.cos(ph) * r, Math.sin(ph) * r, z];
/* the camera tuning (dev: window.STRIKE_TUNE overrides any field) */
const TU = Object.assign({
  // the rings: azimuth offset from the broken chord, radius, z, the target; then forward to the forming rings
  r0: { dph: .5, r: 1250, z: -560, tr: 120, tz: -260, fov: 44 }, r1: { dph: .26, r: 560, z: -190, tr: 0, tz: -40, fov: 44 },
  // the build: beside the train (azimuth, radius, ahead of the guide ring), the target behind it
  b: { ph: 2.63, r: 400, r1: 520, dz: -150, tz: -118, fov: 44 }, bw: { ph: 2.35, r: 1500, z: 420, tz: 470, fov: 46 },
  // the line (platform frame; strike_fab's shot when it gives one)
  f0: { e: [-62, 92, -150], g: [-12, -12, -84], fov: 40 }, f1: { e: [-58, 62, -86], g: [-2, -4, -46], fov: 40 },
  // the charge: under the belly, then into the orbital film's own lens for the fire
  c0: { e: [-250, 560, -140], g: [0, -10, 200], fov: 46 }, c1: { e: [-150, 300, -200], g: [0, 0, 400], fov: 46 },
}, window.STRIKE_TUNE || {});
/* shots in the platform frame ({ eye, target, fov rad, roll }); one move between two: the eye round the ship's axis in
   cylindrical coordinates (azimuth the short way, radius in log, z), the target lerped (so the eye never cuts
   through the hull and the subject stays framed) */
const shP = (e, g, fov) => ({ eye: e, target: g, fov: fov * DEG, roll: 0 });
/* the lens's frame: the platform's position, the station's orientation (the platform's own once it is on station): while
   the platform turns onto the destroyer the lens holds still in space and the ship turns under it */
let RS = null;
const FW = (p, o) => { const M = RS || Wt.R, q = Wt.T; o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + q[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + q[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + q[2]; return o; };
const toW = s => ({ eye: FW(s.eye, [0, 0, 0]), target: FW(s.target, [0, 0, 0]), fov: s.fov, roll: s.roll || 0 });
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const azOf = p => Math.atan2(p[1], p[0]);
function cylMix(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const aa = azOf(a.eye), ra = Math.hypot(a.eye[0], a.eye[1]), rb = Math.hypot(b.eye[0], b.eye[1]);
  const az = aa + wrapA(azOf(b.eye) - aa) * w, r = Math.exp(Math.log(Math.max(1, ra)) + (Math.log(Math.max(1, rb)) - Math.log(Math.max(1, ra))) * w);
  return { eye: [Math.cos(az) * r, Math.sin(az) * r, a.eye[2] + (b.eye[2] - a.eye[2]) * w], target: V.lerp(a.target, b.target, w), fov: a.fov + (b.fov - a.fov) * w, roll: 0 };
}
/* (the ease of the long moves: a sine, its peak rate 1.57 x the mean) */
const es = u => { u = E.sat(u); return .5 - .5 * Math.cos(PI * u); };
let AZ2 = null;                                                   // the ring shot's azimuth (chosen once)
/* 1 (0 .. 11): the whole ship turning onto the destroyer under a still lens (the station's frame), 1.4 km out closing to
   1.1 km: from the side the intercept's last lens was on, swung at most 50 deg toward the side the exit hole ends up
   facing (so the hand-over is mostly a pull-back); the hole swings round, the rings spin down */
let D1 = null;
function myShot1(t) {
  const A = anchors(), u1 = sm(t / 11), c = [0, 0, -300];
  if (!D1) {
    const dx = V.norm(V.add(V.mul(V.norm([A.XN[0], A.XN[1], 0]), 1400), [0, 0, -420]));
    let d0 = H && H.cam0F ? V.sub(H.cam0F.eye, c) : dx; d0 = V.len(d0) > 1 ? V.norm(d0) : dx;
    const ang = Math.acos(E.clamp(V.dot(d0, dx), -1, 1));
    D1 = slerpD(d0, dx, ang > 1e-3 ? Math.min(1, 50 * DEG / ang) : 1);
  }
  return shP(V.mad(c, D1, 1400 - 300 * u1), V.add(c, [0, 0, 40 * u1]), 46);
}
function myShot(t) {
  const A = anchors(), T = baseT(t);
  // 1 (0 .. 11): the exit hole (the round's way out), the stabiliser rings beside it spinning down, from 640 m off the
  // hull closing to 380 m while the platform turns onto the destroyer (the Earth turning behind)
  const s1 = myShot1(t), c = [0, 0, -300];
  if (t < 9) return handIn(t, s1);
  // 2 (11 .. 23): from outside the rings toward the broken chord (the azimuth swung at most 100 deg from shot 1's): the
  // chord, the rings stopped; then forward with the nodes to the five rings closing round the chamber (one slow drift)
  if (AZ2 === null) { const a1 = azOf(myShot1(11).eye), d = wrapA(azOf(A.Q) + .45 - a1); AZ2 = a1 + Math.max(-100 * DEG, Math.min(100 * DEG, d)); }
  const r0 = TU.r0, r1 = TU.r1, u2 = sm((t - 13) / (TB.BUILD + 1 - 13)), phq = azOf(A.Q);
  const ph = AZ2 + (r1.dph - r0.dph) * u2, rr = Math.exp(Math.log(r0.r) + (Math.log(r1.r) - Math.log(r0.r)) * u2), zz = r0.z + (r1.z - r0.z) * u2;
  const tg = cyl(phq + .1 * (1 - u2), r0.tr + (r1.tr - r0.tr) * u2, r0.tz + (r1.tz - r0.tz) * u2);
  const s2 = shP(cyl(ph, rr, zz), tg, r0.fov + (r1.fov - r0.fov) * u2);
  if (t < TB.BUILD - 2) return cylMix(handIn(t, s1), s2, es((t - 9) / 7.5));
  // 3 (23 .. 37.5): beside the train (the same azimuth): the guide ring and the five rings laying the barrel, the lens
  // 400-520 m out and 150 m behind the front; at the crown it pulls back to the whole barrel
  const b = TU.b, zc = crZ(Math.min(T, 112.4)), zt = Math.min(zc, 1003.5 + 40), ub = sm((t - TB.BUILD) / (TB.CROWN - TB.BUILD)), ph3 = AZ2 + r1.dph - r0.dph;
  const s3 = shP(cyl(ph3, b.r + (b.r1 - b.r) * ub, zt + b.dz), [0, 0, zt + b.tz], b.fov);
  const bw = TU.bw, s3w = shP(cyl(ph3 - .2, bw.r, bw.z), [0, 0, bw.tz], bw.fov);
  let s = cylMix(s2, s3, es((t - (TB.BUILD - 2)) / 5));
  if (t > TB.CROWN - 1.5) s = glideS(s, s3w, sm((t - (TB.CROWN - 1.5)) / 4.0), [0, 0, 600]);
  if (t < TB.MOVE - 1) return s;
  // 4 (37.5 .. 52): back down to the prow, the hull going to X-ray over the bay: the rod line (strike_fab's lens)
  const f = FAB && FAB.cam ? FAB.cam(t - TB.FAB) : null;
  const sf = f ? shP(f.e, f.g, f.fov) : (() => { const u = sm((t - TB.FAB) / 10); return shP(V.lerp(TU.f0.e, TU.f1.e, u), V.lerp(TU.f0.g, TU.f1.g, u), TU.f0.fov); })();
  s = glideS(s, sf, es((t - (TB.MOVE - 1)) / (TB.FAB + 1.6 - (TB.MOVE - 1))), [0, 0, -60]);
  if (t < TB.FAB1) return s;
  // 5 (52 .. 63): up and out of the bay, looking down the ship and along the barrel at the planet: the breech closing,
  // the charge rings lighting breech to muzzle (the orbital film's own lens takes over for the fire: camHook)
  const u5 = sm((t - TB.FAB1) / 11), c0 = TU.c0, c1 = TU.c1;
  const s5 = shP(V.lerp(c0.e, c1.e, u5), V.lerp(c0.g, c1.g, u5), c0.fov + (c1.fov - c0.fov) * u5);
  return glideS(s, s5, sm((t - TB.FAB1) / 5), [0, -10, 40]);
}
/* the hand-over: from where the intercept's last shot left the lens (platform frame), round the ship's axis into the
   first shot; as long as its turn needs at about 11 deg/s (5 .. 9 s) */
let HAND_D = null;
function handIn(t, s) {
  if (!H || !H.cam0) return s;
  const s0 = shP(H.cam0F.eye, H.cam0F.target, H.cam0.fov / DEG);
  if (HAND_D === null) { const s6 = myShot1(6), a = V.norm(V.sub(s0.target, s0.eye)), b = V.norm(V.sub(s6.target, s6.eye)); HAND_D = E.clamp(Math.acos(E.clamp(V.dot(a, b), -1, 1)) / DEG / 11, 5, 9); }
  return t < HAND_D ? cylMix(s0, s, es(t / HAND_D)) : s;
}

/* the orbital film's own lens from the fire: its look direction averaged over +-2.4 s (Gaussian, sigma 1 s: its whips
   become even turns under ~20 deg/s), its roll averaged and capped at 15 deg; blended in from this act's charge shot */
const T_FL = [61.2, 65.4];                                        // (act t: the blend into the film's lens)
const CH = { k: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6], w: null, dt: .4 };
CH.w = CH.k.map(k => Math.exp(-.5 * (k * CH.dt / 1.0) ** 2));
function filmLens(t) {
  let fx = 0, fy = 0, fz = 0, rl = 0, ws = 0, mid = null;
  for (let i = 0; i < CH.k.length; i++) {
    const tq = t + CH.k[i] * CH.dt, Tq = baseT(tq), c = D.cam(Tq), w = CH.w[i];
    const d = V.norm(V.sub(c.target, c.eye)); fx += d[0] * w; fy += d[1] * w; fz += d[2] * w; rl += (c.roll || 0) * w; ws += w;
    if (CH.k[i] === 0) mid = c;
  }
  D.cam(baseT(t));                                                // (the strike module's state back at this frame's time)
  const d = V.norm([fx, fy, fz]), L = V.dist(mid.eye, mid.target), r = rl / ws, CAP = 15 * DEG;
  return { eye: mid.eye.slice(), target: V.mad(mid.eye, d, L), fov: mid.fov, roll: CAP * Math.tanh(r / (CAP * 1.6)) };
}
let LENS = null;
function camHook(s) {
  if (window.STRIKE_DBGCAM) { const o = window.STRIKE_DBGCAM; return lookP(o.e, o.g, o.fov || 40); }
  if (window.STRIKE_FILMLENS) return s;                            // (dev: the orbital film's own lens)
  const t = CUR_t, w = sm((t - T_FL[0]) / (T_FL[1] - T_FL[0]));
  let out;
  if (w <= 0) out = toW(myShot(t));
  else if (w >= 1) out = filmLens(t);
  else out = mixS(toW(myShot(t)), filmLens(t), w);
  LENS = out; return out;
}

/* ---------------- tags (coral: this craft's) ---------------- */
const TAGS = {};
const tg = k => TAGS[k] || (TAGS[k] = K.mkTag());
function tagP(key, id, lab, val, pw, a, side) {
  if (a < .01 || !K.pj(pw[0], pw[1], pw[2]) || !K.onS(-40 * S)) return;
  const x = K.PJ[0], y = K.PJ[1], sd = side || (x > 1100 * S ? -1 : 1), dx = sd * 54 * S, lx = x + dx, T_ = tg(key);
  K.leader(x, y, lx, y - 50 * S, '#FF6A3D', .85 * a); K.dot(x, y, Math.round(3 * S), 255, 106, 61, a);
  const w = K.tagW(T_);
  K.setTag(T_, id, lab, val, 'coral sm', dx > 0 ? lx + 4 * S : lx - 4 * S - w * S, y - 62 * S, a);
}
const win = (t, a, b, r) => ss(a, a + (r || .5), t) * (1 - ss(b - (r || .5), b, t));
function tags(t, T) {
  const A = anchors();
  { const t0 = Math.min(5, (HAND_D || 6) - 2); tagP('ext', 'HIT', 'Furrow · the intercept', H && H.dmg && H.dmg.theta ? `hull broken ${Math.round(H.dmg.theta(tHnow) / DEG)}°` : 'hull broken', PW(V.add(A.X, V.mul(A.XN, 3))), win(t, t0, Math.max(t0 + 4.5, 10.2))); }
  if (t > 11 && t < 16) tagP('rng', 'RNG A', `Chord ${H && H.dmg ? H.dmg.ring.chord + 1 : ''} · broken`, 'ring stopped', PW(A.Q), win(t, 11.6, 15.2));
  if (t > 16 && t < 23 && ORT) { const z = ORT.scZ(T, 0); if (z !== null) tagP('scr', 'RINGS', `Construction rings ×5`, 'from the stabiliser rings', PW([-.62 * ORT.scR[0], .62 * ORT.scR[0], z]), win(t, 17.6, 22.4)); }
  if (t > 24 && t < 33 && ORT) { const z = ORT.scZ(T, 2); if (z !== null) tagP('trn', 'TRAIN', 'Guide ring + 5 rings', 'each lays one layer', PW([-.7 * ORT.scR[2], .7 * ORT.scR[2], z]), win(t, 25.0, 30.4)); }
  if (t > 33 && t < 38) tagP('crn', 'CROWN', 'Crown · iris', '6 petals · closed', PW([0, 7, P.Z_MZ]), win(t, 34.0, 37.4));
  if (FAB && FAB.tags && t > TB.FAB - .5 && t < TB.FAB1 + .5) FAB.tags(t - TB.FAB, Wt, tagP);
  if (t > T_FL[0] - 1 && t < TB.TC + 8.5) { tagP('chg', 'RINGS', 'Charge rings ×198', 'breech → muzzle', PW([4, 2, 360]), win(t, TB.TC + 1.4, TB.TC + 6.4)); }
  // the rod in the fall: full strength, held to the hand-over
  if (T > D.TX + .3 && T < D.TI) {
    const p = D.rodAt(T), a = ss(D.TX + 1.6, D.TX + 2.2, T);
    if (a > .01 && K.pj(p[0], p[1], p[2]) && K.onS(-60 * S)) {
      const x = K.PJ[0], y = K.PJ[1], T_ = tg('rod');
      K.leader(x, y, x + 44 * S, y - 46 * S, '#FF6A3D', .9 * a);
      K.setTag(T_, 'ROD', `Tungsten · ${P.ROD_L} m · ${(PI * P.ROD_R ** 2 * P.ROD_L * 19.3).toFixed(1)} t`, `alt ${(D.altOf(p) / 1000).toFixed(1)} km`, 'coral sm', Math.min(K.BW - 360 * S, x + 48 * S), Math.max(250 * S, y - 62 * S), a);
    }
  }
}

/* ---------------- the readout: one line pair per beat (each held >= 2.5 s) ---------------- */
const BLEN = P.Z_MZ - P.Z_RND;                                    // breech to muzzle: 1016 m (the round's run)
const pct = u => `${Math.round(E.sat(u) * 100)} %`;
function myRO(t, T) {
  const spin = 2 * (1 - ss(SPIN_D[0], SPIN_D[1], T));
  if (t < TB.RING) return [`Orbital railgun · <b>${t < SLEW_T[1] - .5 ? 'turning onto the destroyer' : 'on station'}</b>`, `Hull <b>broken in two</b> · rings <b>${spin.toFixed(1)} rpm</b> · spinning down`];
  if (t < TB.SPLIT) return ['Stabiliser ring A · <b>chord broken</b>', 'Rings <b>stopped</b> · taken apart to build the barrel'];
  if (t < TB.BUILD) { const nf = TL.SC_FORM.filter(x => T >= x).length; return ['Stabiliser rings · <b>split</b> · nodes across the break', `Construction rings · <b>${nf}/5</b> formed at the prow`]; }
  if (t < TB.CROWN) { const f = ORT ? ORT.frontZ(T, 4) : 0, b = f > 1e8 ? P.Z_MZ : E.clamp(f, 0, P.Z_MZ); let nc = 0; for (let k = 1; k < 6; k++) if (T > TL.LOCKC[k]) nc++; return [`Barrel · <b>${Math.round(b - P.Z_RND)} m</b> of ${Math.round(BLEN)}`, `Collars · <b>${nc}/5</b> locked · five layers at once`]; }
  if (t < TB.MOVE) return [`Barrel · <b>${Math.round(BLEN)} m</b> of ${Math.round(BLEN)}`, 'Crown <b>done</b> · iris <b>closed</b> · rings to stations'];
  if (t < TB.FAB) return ['Bore · <b>aligned</b> · 0.0001°', 'Gun bus <b>live</b> · banks <b>0.60 TJ</b>'];
  if (t < TB.SEAT + .3) return FAB && FAB.readout ? FAB.readout(t - TB.FAB) : ['Round · <b>to the chamber</b>', ''];
  return [`Round · <b>chambered</b> · ${(PI * P.ROD_R ** 2 * P.ROD_L * 19.3).toFixed(1)} t`, T < TL.LOCKW[0] ? 'Breech <b>closing</b> · lock rings · clamps' : `Clamps <b>12/12</b> · coils <b>${pct(ss(TL.COILW[0], TL.COILW[1], T))}</b> to 4.2 K`];
}

/* ---------------- colour: the orbital film's lime turned coral on the raster ---------------- */
let U32 = null;
function coralize(k) {
  const d = K.pb.d, bg = K.pb.bg, n = d.length;
  if (!U32 || U32.buffer !== d.buffer) U32 = new Uint32Array(d.buffer);
  const u32 = U32, N = u32.length, CR = CORAL[0] / 244 * 1.18, CG = CORAL[1] / 244 * 1.18, CB = CORAL[2] / 244 * 1.18;
  for (let i = 0; i < N; i++) {
    const v = u32[i], g = (v >>> 8) & 255; if (g < 34) continue;
    const r = v & 255, b = (v >>> 16) & 255; if (g <= r + 4) continue;
    const q = i << 2, b0 = bg ? bg[q] : 11, b1 = bg ? bg[q + 1] : 12, b2 = bg ? bg[q + 2] : 10;
    const gg = g - b1, l = E.sat(((gg - (b - b2)) / gg - .12) / .55) * E.sat((g - r - 4) / 22) * k; if (l < .02) continue;
    const nr = b0 + gg * CR, ng = b1 + gg * CG, nb = b2 + gg * CB;
    d[q] = r + (Math.min(255, nr) - r) * l; d[q + 1] = g + (ng - g) * l; d[q + 2] = b + (nb - b) * l;
  }
}

/* ---------------- the frame ---------------- */
let HOOK = null;
const blit0 = K.pb.blit.bind(K.pb);
K.pb.blit = function () { if (HOOK) { const h = HOOK; HOOK = null; h(); } blit0(); };
const ro = document.getElementById('ro');
const RO = { l1: '', l2: '' };
/* render the orbital half at act time t; extra(T) runs before the blit (more drawing) */
function frame(t, extra) {
  const T = baseT(t); CUR_T = T; CUR_t = t; TNOW = T; RATE = rateAt(t);
  tHnow = tHAt(t);
  Wt = poseAt(t, T); RS = t < SLEW_T[1] ? D.platXf(T).R : null;
  setDamage(t, T);
  const xr = xrayAt(t);
  if (xr > .002) XO.forEach((o, i) => { o.a = XO0[i].a * (1 - .8 * xr); o.keep = XO0[i].keep * (1 - .8 * xr); });
  window.STRIKE_CAM = camHook;
  HOOK = () => {
    // the readout: this act's lines up to the charge, the orbital film's after (the caller sets the clock)
    const parts = ro.innerHTML.split('<br>');
    if (t < TB.TC) { const l = myRO(t, T); RO.l1 = l[0]; RO.l2 = l[1]; }
    else { RO.l1 = parts[0] || ''; RO.l2 = parts[1] || ''; }
    // the orbital film's own tags and leaders off; the flash kept; this act's tags (coral)
    K.beginTags(); K.octx.clearRect(0, 0, K.BW, K.BH);
    const ax = T - D.TX; if (ax > 0 && ax < .6) { const fl = .18 * Math.exp(-ax * 7); K.octx.fillStyle = `rgba(240,246,226,${fl.toFixed(3)})`; K.octx.fillRect(0, 0, K.BW, K.BH); }
    tags(t, T);
    coralize(ss(0, 2.5, t));
    if (extra) extra(T);
  };
  ORB.render(D.mapOut(T));
  window.STRIKE_CAM = null;
  if (xr > .002) XO.forEach((o, i) => { o.a = XO0[i].a; o.keep = XO0[i].keep; });
  if (FULL) for (const k in FULL) delete FULL[k];
  return T;
}
/* the host's hand-over: H = { dmg, tH0, psiOff, pose0 {R, T}, cam0 {eye, target, fov} (world, at the end of the
   intercept: put into the platform frame here), exitD } */
function setHost(h) {
  H = h; SLEW = null; AN = null; AZ2 = null; HAND_D = null; D1 = null;
  if (h && h.cam0) {
    const R0 = h.pose0.R, T0_ = h.pose0.T, inv = p => { const q = [p[0] - T0_[0], p[1] - T0_[1], p[2] - T0_[2]]; return [R0[0] * q[0] + R0[3] * q[1] + R0[6] * q[2], R0[1] * q[0] + R0[4] * q[1] + R0[7] * q[2], R0[2] * q[0] + R0[5] * q[1] + R0[8] * q[2]]; };
    h.cam0 = { eye: inv(h.cam0.eye), target: inv(h.cam0.target), fov: h.cam0.fov };
    // (and in the lens's frame: the station's orientation about the platform's position)
    const RSt = D.platXf(KEYS[0][1]).R, toF = p => { const q = [R0[0] * p[0] + R0[1] * p[1] + R0[2] * p[2], R0[3] * p[0] + R0[4] * p[1] + R0[5] * p[2], R0[6] * p[0] + R0[7] * p[1] + R0[8] * p[2]]; return [RSt[0] * q[0] + RSt[3] * q[1] + RSt[6] * q[2], RSt[1] * q[0] + RSt[4] * q[1] + RSt[7] * q[2], RSt[2] * q[0] + RSt[5] * q[1] + RSt[8] * q[2]]; };
    h.cam0F = { eye: toF(h.cam0.eye), target: toF(h.cam0.target) };
  }
  // ring A's broken chord at rest (the rings stopped, T 48): posed once with the damage's spin offset
  if (h && h.dmg && FULL) {
    const t48 = (() => { let lo = 0, hi = A_LEN; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (baseT(m) < 48) lo = m; else hi = m; } return lo; })();
    tHnow = tHAt(t48); Wt = poseAt(t48, 48); setDamage(t48, 48);
    const st = IORB.stateAt(48);
    st.rings[0].psi += h.psiOff; st.rings[1].psi -= h.psiOff;
    const PP = P.pose(Wt, st), ch = PP.rings[0].chords[h.dmg.ring.chord];
    if (ch) h.chordRest = toP(ch.T);
    for (const k in FULL) delete FULL[k];
  }
}

/* the camera log's subjects (the orbital world) */
function poi() {
  const out = [{ name: 'orbital ship', p: Wt.T.slice(), r: 900 }];
  if (TNOW > D.TX && TNOW < D.TI) out.push({ name: 'rod', p: D.rodAt(TNOW).slice(), r: 9 });
  if (ORT && TNOW > 52 && TNOW < 119) { const z = ORT.crZ(TNOW); out.push({ name: 'build train', p: PW([0, 0, Math.min(z, 1040) - 50]), r: 90 }); }
  if (FAB && CUR_t > TB.FAB - 1 && CUR_t < TB.FAB1 + 1 && FAB.poi) out.push(...FAB.poi(CUR_t - TB.FAB, PW));
  if (H && H.dmg && tHnow > 0) {
    const c = [0, 0, 0]; let n = 0;
    for (let i = 0; i < H.dmg.frags.length; i++) { const f = H.dmg.fragPose(i, tHnow); if (!f) continue; c[0] += f.T[0]; c[1] += f.T[1]; c[2] += f.T[2]; n++; }
    if (n) out.push({ name: 'fragments', p: PW([c[0] / n, c[1] / n, c[2] / n]), r: 60 });
  }
  return out;
}
/* the hand-over to the sea: strike_sea.js reads the orbital lens there from its own STAGE.dbg().cam(T) (the film's raw
   lens); for base times round the hand-over that now returns this act's lens (the one on screen: smoothed, roll capped),
   so the cross-fade stays seamless. (This file's D was taken before the wrap.) */
{
  const dbg0 = STAGE.dbg;
  STAGE.dbg = () => { const o = dbg0(), c0 = o.cam; o.cam = Tq => Tq > T_END - 2 && Tq < T_END + 2 ? STRIKE_ORBIT.lensAt(TB.TC + (Tq - T_C)) : c0(Tq); return o; };
}
const cueT = Tq => { let lo = 0, hi = A_LEN; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (baseT(m) < Tq) lo = m; else hi = m; } return (lo + hi) / 2; };
/* chapters and named cues (act t) for strike_film.js */
const CHAPTERS = [{ t: 0, title: 'Rings' }, { t: TB.RING, title: 'Ring' }, { t: TB.SPLIT, title: 'Split' }, { t: TB.BUILD, title: 'Build' },
  { t: TB.MOVE + 1.5, title: 'Line' }, { t: TB.SEAT, title: 'Chamber' }, { t: TB.TC, title: 'Charge' }, { t: cueT(D.TL.TF) - .3, title: 'Fire' }, { t: cueT(D.TX) + 2.2, title: 'Fall' }];
const CUEV = [['rings_split', cueT(TL.SPLIT[0][0])], ['barrel_build', TB.BUILD + .4], ['fab_line', TB.FAB - .4],
  ...(FAB && FAB.cues ? FAB.cues.map(([n, u]) => [n, TB.FAB + u]) : [['rod_load', TB.FAB + 6.2]]),
  ['round_seated', TB.SEAT], ['orbital_charge', cueT(TL.CH0)], ['orbital_fire', cueT(D.TX)]];
window.STRIKE_ORBIT = { poi, len: A_LEN, baseT, rateAt, frame, RO, KEYS, TB, simClock, simSince, tHAt, setHost, D, toP, PW, poseAt, anchors, cueT, CHAPTERS, CUEV,
  lens: () => LENS, tune: TU,
  /* dev: the lens at act t without drawing (world frame; restores nothing it does not own) */
  lensAt: t => { const T = baseT(t), t0 = CUR_t, W0 = Wt, R0_ = RS; CUR_t = t; Wt = poseAt(t, T); RS = t < SLEW_T[1] ? D.platXf(T).R : null; const c = D.cam(T), s = camHook({ eye: c.eye, target: c.target, fov: c.fov, roll: c.roll || 0 }); const o = { eye: s.eye.slice(), target: s.target.slice(), fov: s.fov, roll: s.roll || 0 }; CUR_t = t0; Wt = W0; RS = R0_; return o; } };
})();
