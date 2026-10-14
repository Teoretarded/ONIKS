/* SCAN · RAILGUN shot: the round through the bore (x0.01), the sabot coming off, the muzzle, the trail, the burst
   over the headland (window.RGF_INIT(ctx) -> { drawBore(T, st), drawSabot(T), drawFire(T), drawProbe(T), drawBurst(T),
   cam? }). Optional: cam(T, camBase) -> a shot for base time T (or null for the film's own camera; it is asked for every
   frame of the base take). T is base (old) time throughout; the film calls these from render. Inserts (slow motion at
   the burst and so on) are spliced through window.RGX (see the insert contract in pc_scan_railgun_film.js).
   ctx: the film's flight constants and helpers (see the destructuring below). */
(function () {
'use strict';
window.RGF_INIT = function (c) {
const { ACC, ARC, BOLT, B_C, B_TOP, C, CL, DEG, DIR0, E, EM, EOFF, HANG, HDIR, HOT, K, LB_, LEAD, LIME, MO, MW, MZ0, NUP, P3, PATH_A, PI, P_, Q1, Q2, Q3, R, S1, SIDE, SITE, S_HIT, TAU, TB, TBU, TF, TG, TM, TOUR_T, TRET0, TRET1, T_BORE, T_LEAD, T_RAIL, T_REL, V, V0, V1, WH, X, XF, apI, bez, bezT, camBase, climbRate, climbS, dOfS, drawRound, filmAt, kk, lock, lookMix, lookTurn, probeAt, rng, roundZ, sOfD, shipW, simAt, simRate, stateAt, tr, uOfD, vOfS } = c;
const SAB_TAU = .05, SAB_VR = 140, SAB_TR = .25;
const TRN_N = 4200, TRAIL = (() => {                                       // u, sim time passed, angle, spread, distance
  const A = new Float32Array(TRN_N * 5), r = rng(3131), a2 = (V0 - V1) / (2 * S1);
  for (let i = 0; i < TRN_N; i++) {
    const d = ARC.len * Math.pow((i + .5) / TRN_N, 1.4);
    A[i * 5] = uOfD(d); A[i * 5 + 1] = (V0 - Math.sqrt(Math.max(0, V0 * V0 - 4 * a2 * d))) / (2 * a2);
    A[i * 5 + 2] = r() * TAU; A[i * 5 + 3] = r(); A[i * 5 + 4] = d;
  }
  return A;
})();
const NBU = 2600, BURST = (() => { const r = rng(515), A = new Float32Array(NBU * 4); for (let i = 0; i < NBU; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h; A[i * 4 + 1] = u; A[i * 4 + 2] = Math.sin(a) * h; A[i * 4 + 3] = .5 + .5 * r(); } return A; })();
const SHOCK = (() => { const r = rng(616), A = new Float32Array(600 * 3); for (let i = 0; i < 600; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(a) * h; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(a) * h; } return A; })();
const PLUME = (() => { const r = rng(717), A = new Float32Array(320 * 5); for (let i = 0; i < 320; i++) { const a = r() * TAU, s = r(); A[i * 5] = Math.cos(a) * s; A[i * 5 + 1] = Math.sin(a) * s; A[i * 5 + 2] = 2 + 34 * r() * r(); A[i * 5 + 3] = .3 + 1.3 * r(); A[i * 5 + 4] = r(); } return A; })();

const RT = X.make(R.I(), [0, 0, 0]);
const SAB_R = [0, 1, 2].map(k => R.z(k * TAU / 3));
function drawBore(T, st) {
  if (T < T_REL || T >= TF) return;
  const z = roundZ(T), U = X.dir(XF.B, [1, 0, 0]), W = X.dir(XF.B, [0, 1, 0]);
  const v = ACC * (simAt(T) + T_BORE), q = v / V0;
  // the round and its sabot in the bore
  const Lr = X.mul(XF.B, tr(0, 0, z));
  MO.lime = .55; MO.a = 1.6; MO.S = null; MO.keep = 1; MO.md = 0;
  drawRound(Lr, null, 0, MO);
  MO.lime = 0; MO.a = 1.25;
  // the rails behind it carry the current: white-hot from the breech to the armature, dark ahead
  const z0 = P_.RZ0;
  for (const y of [.18, -.18]) {
    apI(XF.B, 0, y, z0, Q1); apI(XF.B, 0, y, z - P_.RND_H, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, HOT, .95, LIME, .2, .08);
  }
  // the armature: an arc sheet across the rails at the round's base
  apI(XF.B, 0, 0, z - P_.RND_H - .05, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 60 + 60 * q, HOT, .9); K.glowW(Q1[0], Q1[1], Q1[2], 160, LIME, .35);
  const fr = Math.floor(T * 60);
  for (let i = 0; i < 9; i++) { const h = K.hh(i * 3.1, fr); apI(XF.B, (h - .5) * .14, .17, z - P_.RND_H - .03 - .05 * h, Q2); apI(XF.B, (K.hh(i * 7.7, fr) - .5) * .14, -.17, z - P_.RND_H - .03, Q3); K.arcW(Q2, Q3, i + fr * .1, T, 1, .5); }
  // the field: rings round the barrel at the armature, trailing back
  for (let k = 0; k < 5; k++) { apI(XF.B, 0, 0, z - P_.RND_H - k * .35, Q1); K.ringW(Q1, U, W, .62 + .1 * k, 120, k ? 1 : 2, k ? LIME : HOT, (1 - k * .18) * (.6 + .4 * q), T * 9 + k); }
  // plasma blown out past the round's sides, streaming back down the bore
  for (let i = 0; i < 90; i++) {
    const h = K.hh(i * 1.7, fr), a = K.hh(i * 2.9, fr) * TAU, d = h * 1.6;
    apI(XF.B, Math.cos(a) * .12, Math.sin(a) * .17, z - P_.RND_H - d, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, h < .3 ? HOT : LIME, .9 * (1 - h));
  }
  // the bands flash as it passes (the clamps take the load)
  for (const zb of P_.BANDS) { const d = z - zb; if (d < 0 || d > 1.4) continue; apI(XF.B, 0, 0, zb + .05, Q1); K.ringW(Q1, U, W, .74, 60, 2, HOT, 1 - d / 1.4, 0); }
}
/* after the muzzle: the sabot's three petals peel off, slow in the air and tumble away (sim time) */
function drawSabot(T) {
  const a = simAt(T); if (a < 0 || a > 1.6) return;
  const fwd = V0 * SAB_TAU * (1 - Math.exp(-a / SAB_TAU)), rad = SAB_VR * SAB_TR * (1 - Math.exp(-a / SAB_TR));
  const B = XF.B, Rb = B.R;
  for (let k = 0; k < 3; k++) {
    const ang = k * TAU / 3, c = Math.cos(ang), s = Math.sin(ang);
    const rd = X.dir(B, [c, s, 0]);
    const p = V.add(V.add(V.mad(MZ0, DIR0, fwd), V.mul(rd, rad)), [0, -4.9 * a * a, 0]);
    // tumble: pitched out about the petal's own hinge (square to the bore and its radial)
    const pit = Math.min(2.6, a * 70 + a * a * 20), Lp = X.make(R.mul(Rb, R.mul(R.z(ang), R.y(pit))), p);
    MO.lime = .3 * Math.exp(-a * 8); MO.a = 1.5; P_.drawX(CL.sabot, Lp, MO); MO.lime = 0; MO.a = 1.25;
    if (a < .05) { K.glowW(p[0], p[1], p[2], 12, HOT, .7 * (1 - a / .05)); }
  }
}
/* the muzzle (sim time a: the blast in slow motion, then the plume) */
function drawFire(T) {
  const a = simAt(T); if (a < 0 || a > 3.2) return;
  const m = MZ0, d = DIR0, U = V.norm(V.cross(d, [0, 1, 0])), W = V.cross(U, d);
  // the plasma ball out of the muzzle: a bright core, a shell of dots running out and dimming
  if (a < .06) {
    const r = 3.6 * (1 - Math.exp(-a * 220)) + 20 * a, A = Math.exp(-a * 45);
    K.glowW(m[0] + d[0] * r * .6, m[1] + d[1] * r * .6, m[2] + d[2] * r * .6, Math.round(50 + 260 * Math.exp(-a * 160)), HOT, .95 * Math.exp(-a * 70));
    for (let i = 0; i < 600; i++) {
      const o = i * 3, k = .55 + .45 * SHOCK[o + 1] * SHOCK[o + 1];
      const x = m[0] + d[0] * r * (.7 + .6 * SHOCK[o]) + (U[0] * SHOCK[o + 1] + W[0] * SHOCK[o + 2]) * r * .7 * k;
      const y = m[1] + d[1] * r * (.7 + .6 * SHOCK[o]) + (U[1] * SHOCK[o + 1] + W[1] * SHOCK[o + 2]) * r * .7 * k;
      const z = m[2] + d[2] * r * (.7 + .6 * SHOCK[o]) + (U[2] * SHOCK[o + 1] + W[2] * SHOCK[o + 2]) * r * .7 * k;
      K.dotW(x, y, z, i % 7 ? 1 : 2, i % 3 ? HOT : LIME, A * (.5 + .5 * Math.abs(SHOCK[o])));
    }
  }
  if (a < .5) {
    const L = 30 * Math.min(1, a / .004) + 900 * a, jA = Math.exp(-a * 7);
    K.lineW(m[0], m[1], m[2], m[0] + d[0] * L, m[1] + d[1] * L, m[2] + d[2] * L, 1.2, 2, HOT, jA, LIME, .12 * jA, .04 * jA);
    for (let k = 1; k <= 4; k++) { const c = V.mad(m, d, Math.min(1, a / .006) * 4 * k + 30 * a * k); K.ringW(c, U, W, (.8 + .5 * k) * (1 + 4 * a), 120, 1, k % 2 ? LIME : HOT, jA * (1 - k * .18), k); }
  }
  if (a < .6) { K.glowW(m[0] + d[0] * 6, m[1] + d[1] * 6, m[2] + d[2] * 6, 120, LIME, .5 * Math.exp(-a * 5) * Math.min(1, a / .01)); }
  if (a < 1.8) {
    const r = 1 + 60 * Math.pow(a, .6), A = Math.max(0, 1 - a / 1.8);
    const c = V.mad(m, d, 2 + 10 * a);
    K.ringW(c, U, W, r, 520, 2, HOT, .85 * A, 0); K.ringW(c, U, W, r * .9, 360, 1, LIME, .55 * A, .3);
    const rs = 1 + 90 * Math.pow(a, .6), As = .4 * Math.max(0, 1 - a / 1.1);
    if (As > .01) for (let i = 0; i < 600; i++) { const o = i * 3; K.dotW(m[0] + SHOCK[o] * rs, m[1] + SHOCK[o + 1] * rs, m[2] + SHOCK[o + 2] * rs, 1, WH, As * (.4 + .6 * Math.abs(SHOCK[o + 1]))); }
    const rw = 12 + 260 * Math.pow(a, .7), Aw = .55 * Math.max(0, 1 - a / 1.8);
    K.ringW([0, .3, 48], [1, 0, 0], [0, 0, 1], rw, 900, 1, WH, Aw, .1);
    const rd = 3.5 + 14 * Math.pow(a, .5), Ad = .6 * Math.max(0, 1 - a / 1.2);
    K.ringW([0, P_.GY + .3, P_.GZ], [1, 0, 0], [0, 0, 1], rd, 260, 1, WH, Ad, .5);
  }
  for (let i = 0; i < 320; i++) {
    const o = i * 5, life = PLUME[o + 3]; if (a > life) continue;
    const w = 1 - a / life, s = 1 - Math.exp(-a * 4), ax = PLUME[o + 2] * s, sp = (1.5 + 5 * s) * (1 + ax * .08);
    const x = m[0] + d[0] * ax + (U[0] * PLUME[o] + W[0] * PLUME[o + 1]) * sp, y = m[1] + d[1] * ax + (U[1] * PLUME[o] + W[1] * PLUME[o + 1]) * sp + a * a * .8, z = m[2] + d[2] * ax + (U[2] * PLUME[o] + W[2] * PLUME[o + 1]) * sp;
    K.dotW(x, y, z, PLUME[o + 4] < .15 ? 2 : 1, PLUME[o + 4] < .35 ? LIME : WH, w * .85);
  }
}
/* the trail stays up (fading) until the lens is home: the way back runs along it. Three layers: the smoke column
   (world-fixed puffs that spread with age), the glowing line from the muzzle to the probe, and close behind the probe
   a dense wake of heated air (world-fixed samples every 0.25 m, so the chase shows it streaming past) */
const NWAKE = 520;
function drawProbe(T) {
  if (T < TF || T > TRET1 + .5) return;
  const s = climbS(T), vis = 1 - .35 * E.ss(TB + 3, TRET0, T) - .65 * E.ss(TRET1 - 2.5, TRET1 + .5, T), after = T > TBU ? T - TBU : 0;
  for (let i = 0; i < TRN_N; i++) {
    const o = i * 5, sp = TRAIL[o + 1]; if (sp > s) break;
    const age = s - sp + after, u = TRAIL[o], k = TRAIL[o + 4] / ARC.len;
    bez(u, Q1);
    const drift = 1 + 9 * Math.sqrt(age) * (.15 + k), ang = TRAIL[o + 2];
    const b = Math.min(1, (.3 + .9 * Math.exp(-age / 2.5)) * vis);
    const x = Q1[0] + Math.cos(ang) * drift * TRAIL[o + 3], y = Q1[1] + Math.sin(ang) * drift * TRAIL[o + 3] * .5 + .6 * age * age * k, z = Q1[2] + Math.sin(ang) * drift * TRAIL[o + 3];
    K.dotW(x, y, z, age < 3 && (i & 3) === 0 ? 2 : 1, age < 1.2 ? HOT : WH, b);
    if (age < 5 && (i % 5) === 0) K.glowW(x, y, z, 10, LIME, .14 * b * (1 - age / 5));
  }
  const dP = dOfS(s), uP = uOfD(dP);
  if (vis > .01) {
    bez(0, Q3);
    const n = 180;
    for (let i = 1; i <= n; i++) {
      const dd = dP * i / n; bez(uOfD(dd), Q2);
      const ageL = Math.max(0, s - sOfD(dd)) + after;
      const a = vis * Math.max(.38, Math.exp(-ageL / 1.8)) * .85;
      K.lineW(Q3[0], Q3[1], Q3[2], Q2[0], Q2[1], Q2[2], 1.2, ageL < 1.5 ? 2 : 1, ageL < 1 ? HOT : WH, a, LIME, .16 * a, .05 * a);
      Q3[0] = Q2[0]; Q3[1] = Q2[1]; Q3[2] = Q2[2];
    }
  }
  if (T < TBU) {
    // the wake: world-fixed samples behind the probe, each spreading and cooling from the moment it was passed
    const j1 = Math.floor(dP / .25), j0 = Math.max(0, j1 - NWAKE);
    for (let j = j0; j <= j1; j++) {
      const dj = j * .25, age = Math.max(0, s - sOfD(dj)), h1 = K.hh(j, 3.3), h2 = K.hh(j, 7.1), h3 = K.hh(j, 9.7);
      bez(uOfD(dj), Q1);
      const rr = .15 + 2.6 * Math.sqrt(age) * h1, an = h2 * TAU, c = Math.cos(an) * rr;
      const x = Q1[0] + c * SIDE[0], y = Q1[1] + Math.sin(an) * rr, z = Q1[2] + c * SIDE[2];
      const b = Math.exp(-age * 2.2) * (.55 + .45 * h3);
      if (b < .03) continue;
      K.dotW(x, y, z, age < .05 && h3 > .6 ? 2 : 1, age < .12 ? HOT : h3 > .7 ? LIME : WH, b);
    }
    const p = probeAt(s, P3), q = bez(Math.max(0, uP - .004 * climbRate(T)), Q2);
    K.lineW(q[0], q[1], q[2], p[0], p[1], p[2], 1.2, 2, HOT, .9, LIME, .08, .02);
    // the probe itself, close up: the round (its sabot gone), nose glowing with the heat of the climb
    if (V.dist(C.eye, p) < 900) {
      const t = bezT(uP, TG), Lp = X.make(R.look(t, [0, 1, 0]), p);
      MO.lime = .35; MO.a = 1.6; MO.S = null; MO.md = 0; MO.keep = 1; P_.drawX(CL.round, Lp, MO); MO.lime = 0; MO.a = 1.25;
      const nose = V.mad(p, t, P_.RND_H + .3); K.glowW(nose[0], nose[1], nose[2], 14, HOT, .7);
    } else K.dotW(p[0], p[1], p[2], 3, [255, 255, 255], 1);
    K.glowW(p[0], p[1], p[2], 26, LIME, .45);
  }
}
/* the burst, and the smoke it leaves hanging over the headland */
function drawBurst(T) {
  const a = T - TBU; if (a < 0 || a > TRET1 - TBU) return;
  const p = B_TOP, r = 420 * (1 - Math.exp(-a * 2.6)) + 18 * a, A = a < 2.6 ? Math.max(0, 1 - a / 2.6) : 0, S = .22 * E.ss(.8, 2.4, a) * (1 - E.ss(TRET1 - TBU - 4, TRET1 - TBU, a));
  if (a < .5) K.glowW(p[0], p[1], p[2], Math.round(60 + 240 * Math.exp(-a * 6)), HOT, .9 * Math.exp(-a * 4));
  if (A > 0) K.glowW(p[0], p[1], p[2], 160, LIME, .25 * A);
  // the shell: lime sparks thrown out, a white ring, then hanging smoke
  for (let i = 0; i < NBU; i++) {
    const o = i * 4, rr = r * BURST[o + 3]; const b = A * (.5 + .5 * BURST[o + 3]) + S * BURST[o + 3]; if (b < .02) continue;
    K.dotW(p[0] + BURST[o] * rr + 30 * a, p[1] + BURST[o + 1] * rr * (a > 2.4 ? .6 : 1) - 40 * Math.min(a, 2.4) ** 2, p[2] + BURST[o + 2] * rr, i % 9 ? 1 : 2, a < 2.4 && i % 3 ? LIME : WH, b);
  }
  if (a < 1.6) { const U = [1, 0, 0], W = [0, 0, 1]; K.ringW(p, U, W, r * 1.15, 900, 1, HOT, .7 * (1 - a / 1.6), 0); }
  // the charge gathering under the burst before the leader goes: arcs crawling over the cloud's underside
  if (a > .3 && T < TB + .3) {
    const fr = Math.floor(T * 24), I = E.ss(TBU + .3, T_LEAD, T) * (T > TB ? 1 - (T - TB) / .3 : 1);
    for (let i = 0; i < 7; i++) {
      const h = K.hh(i * 5.1, fr), g = K.hh(i * 9.3, fr), q1 = [p[0] + (h - .5) * r * 1.4, p[1] - r * (.25 + .3 * g), p[2] + (g - .5) * r * 1.4];
      const q2 = [q1[0] + (K.hh(i, fr) - .5) * r * .7, q1[1] - r * .25 * K.hh(i * 2, fr), q1[2] + (K.hh(i * 3, fr) - .5) * r * .7];
      K.arcW(q1, q2, i + fr * .1, T, I, .5);
    }
  }
}
return { drawBore, drawSabot, drawFire, drawProbe, drawBurst };
};
})();
