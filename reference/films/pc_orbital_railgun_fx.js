/* ORBITAL RAILGUN effects (window.ORFX(K, L, W, cfg)): the shot leaving the muzzle, the rod's fall and its trail,
   and the strike on the coast, all as dots and rings that are pure functions of their age (seeded at load), plus the
   camera of the fall and the strike (cam(T, FC)). Spectacle only: light, motion, flashes, dust, rings.
     shot    keyed on the sim time since the exit (the film runs it at x1/20): the last rings discharging into the
             round (a glow swelling in the bore, rings of light at the coils), a big white flash and a lime halo over
             the crown, gas venting sideways out of eight ports round it, a plume of plasma outrunning the round (it
             swallows it) with big shock rings racing ahead of it, a cone of sparks; the sabot (the round's own: r 0.96
             m, 8.4 m with its nose taper and 0.9 m base) splitting into four petals that hinge open from the base and
             are flung off tumbling, with a disc of chips spreading round the rod's path
     fall    the rod (a closed shell) entering the air: a plasma sheath flowing back off its nose under an elongated
             bow shock (a paraboloid running into a long narrow cone; never a ball), an ionised wake, shock rings
             rippling down the cone on its surface (faded end-on), a growing column of hot gas and smoke that glows
             orange behind the rod, thick in the low air, and stays in the sky after the strike (sun-shaded, drifting
             in the winds aloft, aged on the strike's own clock so the slow motion does not swell it)
     strike  a blinding flash; a dome of white-hot plasma swelling over the impact in the first instants and lifting
             into the fireball; an air shock dome with two reflected shells and a condensation dome behind it; shock
             layers racing out over the forest (a thin wall with a bright crest, white-hot then lime, and two weaker
             layers trailing it); a ground ring racing over the land; the forest and the hero stand (world) lit by the
             flash with long trunk shadows across the floor, then flattened and thrown; the battery's vehicles tossed
             and torn apart; an ejecta curtain and tumbling blocks; a dust skirt racing out; a fireball rising into a
             mushroom (a rolling toroidal cap with glowing inner turbulence, the stem, condensation rings and a
             skirt); the crater (world) with its rim, its glowing floor and its rays
     cam     see the camera section */
window.ORFX = function (K, L, W, cfg) {
'use strict';
const { V, R, X, E, rng, noise } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const C = K.C, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
const FIRE = [255, 196, 138], EMB = [255, 142, 84], DUST = [224, 226, 216], GREY = [150, 152, 146], SMK = [74, 76, 72];
const ss = E.ss;
const BW = 1920, BH = 1080;
const HIT = W.HIT;
const SUNL = V.norm([-.4, .7, -.35]);

/* ---------- small raster helpers ---------- */
const PJ = K.PJ;
/* a dot at a world point (inlined projection, max blend); the camera is read once per effect call (cam()) */
let U32 = null, ex = 0, ey = 0, ez = 0, f0 = 0, f1 = 0, f2 = 0, r0 = 0, r1 = 0, r2 = 0, u0 = 0, u1 = 0, u2 = 0, FL = 1, CX = 0, CY = 0, NR = .1, DD = null;
function cam() { const e = C.eye, f = C.f, r = C.r, u = C.u; ex = e[0]; ey = e[1]; ez = e[2]; f0 = f[0]; f1 = f[1]; f2 = f[2]; r0 = r[0]; r1 = r[1]; r2 = r[2]; u0 = u[0]; u1 = u[1]; u2 = u[2]; FL = C.fl; CX = C.cx + C.shake[0]; CY = C.cy + C.shake[1]; NR = C.near; DD = K.pb.d; if (!U32 || U32.buffer !== DD.buffer) U32 = new Uint32Array(DD.buffer); }
function dotW(x, y, z, s, c, a) {
  if (a < .015) return;
  const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < NR) return;
  const iz = FL / zc, sx = CX + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) return;
  const sy = CY - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) return;
  if (a > 1) a = 1;
  if (s <= 1) { const p = (sy | 0) * BW + (sx | 0), G_ = c[1] * a; if (DD[(p << 2) + 1] < G_) U32[p] = 0xff000000 | ((c[2] * a) << 16) | (G_ << 8) | (c[0] * a); }
  else K.pb.dot(sx, sy, s, c[0], c[1], c[2], a);
}
/* one pixel, explicit colour (already in 0..255), brightness a */
function dotP(x, y, z, cr, cg, cb, a) {
  if (a < .015) return;
  const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < NR) return;
  const iz = FL / zc, sx = CX + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) return;
  const sy = CY - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) return;
  if (a > 1) a = 1;
  const p = (sy | 0) * BW + (sx | 0), G_ = cg * a; if (DD[(p << 2) + 1] < G_) U32[p] = 0xff000000 | ((cb * a) << 16) | (G_ << 8) | (cr * a);
}
function dotCol(x, y, z, s, r, g, b, a) { if (a < .015) return; if (K.pj(x, y, z) && PJ[0] >= 0 && PJ[1] >= 0 && PJ[0] < BW && PJ[1] < BH) { if (K.occT(PJ[0], PJ[1], PJ[2])) return; K.dot(PJ[0], PJ[1], s, r, g, b, a > 1 ? 1 : a); } }
const mixc = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
const CC = [0, 0, 0];
/* sin / cos tables (any angle), hashes */
const SNT = new Float32Array(4096); for (let i = 0; i < 4096; i++) SNT[i] = Math.sin(i / 4096 * TAU);
const fs = a => SNT[((a * 651.8986469 + 1e6) | 0) & 4095], fc = a => SNT[((a * 651.8986469 + 1e6 + 1024) | 0) & 4095];
const HH1 = new Float32Array(9000), HH2 = new Float32Array(9000); { const r = rng(4747); for (let i = 0; i < 9000; i++) { HH1[i] = r(); HH2[i] = r(); } }
const hz1 = i => HH1[(i >>> 0) % 9000], hz2 = i => HH2[(i >>> 0) % 9000];
/* the strike's state for this frame (set by cam(T, FC), which the film calls first, and by trail()) */
const FRAME = { T: -1, a: -1 };
let FCs = null;

/* ================= the shot =================
   Keyed on the sim time since the exit (tau, s: the film runs the exit at x1/20, so 0.085 s of it fill 1.7 s), from the
   film's clock (FC.tauOf). The camera rides 15-30 m beside the round. */
const tauX = ax => FCs && FCs.tauOf ? (ax > 0 ? FCs.tauOf(FCs.TX + ax) : ax / 20) : ax / 20;
/* two unit vectors perpendicular to d */
function perp2(d) { const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0], u = V.norm(V.cross(a, d)); return [u, V.cross(d, u)]; }
const SPARK = (() => { const r = rng(5151), n = 900, A = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const th = r() * TAU, cone = Math.pow(r(), 1.8) * .55; A[i * 4] = Math.cos(th) * Math.sin(cone); A[i * 4 + 1] = Math.sin(th) * Math.sin(cone); A[i * 4 + 2] = Math.cos(cone); A[i * 4 + 3] = .3 + .7 * r(); } return A; })();
/* the plume's gas: u along the cone (front-heavy), q across it, an angle, a hash */
const NPL = 16000, PLM = (() => { const r = rng(5252), A = new Float32Array(NPL * 4); for (let i = 0; i < NPL; i++) { A[i * 4] = i % 3 ? Math.pow(r(), .4) : .9 + .1 * r(); A[i * 4 + 1] = Math.sqrt(r()); A[i * 4 + 2] = r() * TAU; A[i * 4 + 3] = r(); } return A; })();
/* the vents: 8 jets round the muzzle crown, dots along each */
const NVT = 3200, VTP = (() => { const r = rng(5353), A = new Float32Array(NVT * 4); for (let i = 0; i < NVT; i++) { A[i * 4] = ((i % 8) + .5) / 8 * TAU + (r() - .5) * .22; A[i * 4 + 1] = Math.pow(r(), .8); A[i * 4 + 2] = (r() - .5) * 2; A[i * 4 + 3] = r(); } return A; })();
/* m muzzle (world), d bore direction, U W perpendiculars, ax film s since the round left */
function shot(m, d, U, Wd, ax, vis) {
  cam();
  if (ax < -.05 || ax > 4.2) return;
  vis = vis === undefined ? 1 : vis;
  const tau = tauX(ax), A = vis * Math.max(0, 1 - ax / 4.2);
  // the flash as the last rings discharge into the round and it leaves: a white bloom over the crown, a lime halo
  if (ax < 1.6) {
    const f1 = Math.exp(-Math.max(0, ax) * 4.2) * Math.min(1, (ax + .05) * 20);
    K.glowW(m[0], m[1], m[2], Math.round(90 + 620 * f1), HOT, Math.min(1, 1.35 * f1) * A);
    K.glowW(m[0], m[1], m[2], 380, LIME, .45 * Math.exp(-Math.max(0, ax) * 1.8) * A);
  }
  if (tau <= 0) return;
  // vented gas: eight jets blowing out sideways round the crown, white then lime, spreading and thinning
  if (tau < .12) {
    const vv = 1900 * tau, va = A * Math.exp(-tau / .035);
    for (let i = 0; i < NVT; i++) {
      const o = i * 4, th = VTP[o], u = VTP[o + 1], j = VTP[o + 2], hq = VTP[o + 3], r_ = 1.4 + vv * u, w = (.25 + .22 * u) * r_ * j;
      const ca = Math.cos(th), sa = Math.sin(th), bk = -2.5 - .25 * r_ * hq;
      const x = m[0] + (U[0] * ca + Wd[0] * sa) * r_ + (U[0] * -sa + Wd[0] * ca) * w + d[0] * bk, y = m[1] + (U[1] * ca + Wd[1] * sa) * r_ + (U[1] * -sa + Wd[1] * ca) * w + d[1] * bk, z = m[2] + (U[2] * ca + Wd[2] * sa) * r_ + (U[2] * -sa + Wd[2] * ca) * w + d[2] * bk;
      dotW(x, y, z, u < .15 && hq < .4 ? 2 : 1, u < .3 && tau < .02 ? HOT : hq < .6 ? LIME : WH, va * (1 - .7 * u) * (.5 + .5 * hq));
    }
  }
  // the plume: plasma blowing out of the bore faster than the round (it overtakes and swallows it), a cone of glowing gas
  // thinning as it grows; big shock rings riding its front and racing ahead of the round
  const xf = 7600 * tau, pa = A * Math.exp(-tau / .07);
  if (pa > .02) {
    psys(NPL, .45 * xf + 4, m[0] + d[0] * xf * .5, m[1] + d[1] * xf * .5, m[2] + d[2] * xf * .5, 1.4, 16000); const st = PS_ST, sz = PS_S;
    { const c_ = V.mad(m, d, xf * .93), dd = Math.max(1, Math.hypot(c_[0] - ex, c_[1] - ey, c_[2] - ez)); K.glowW(c_[0], c_[1], c_[2], Math.min(360, Math.round((6 + .3 * xf) * FL / dd)), tau < .02 ? HOT : LIME, .32 * pa * Math.exp(-tau / .025)); }
    for (let i = 0; i < NPL; i += st) {
      const o = i * 4, u = PLM[o], q = PLM[o + 1], th = PLM[o + 2] + u * 2.1, hq = PLM[o + 3];
      const x_ = xf * u * (1 - .1 * q * q), rr = (1.2 + .26 * x_) * q * (1 + .12 * fs(th * 5 + u * 13 + tau * 40)), cs = fc(th) * rr, sn = fs(th) * rr;
      const front = u > .86 ? (u - .86) / .14 : 0, hot = Math.exp(-tau / .012) * (1 - .6 * u), edge = q > .85 ? 1 : 0;
      dotW(m[0] + d[0] * x_ + U[0] * cs + Wd[0] * sn, m[1] + d[1] * x_ + U[1] * cs + Wd[1] * sn, m[2] + d[2] * x_ + U[2] * cs + Wd[2] * sn, sz, hot > .4 || front > .7 ? HOT : hq < .5 ? LIME : WH, pa * (.55 + .6 * front + .4 * edge + .4 * hot) * (.6 + .4 * hq));
    }
    // the rings: three at the front, each a thick ragged band of dots
    const ra = A * Math.exp(-tau / .11);
    for (let j = 0; j < 3; j++) {
      const xr = xf * (1 - .11 * j) + 2, rr = (1.2 + .26 * xr) * (1.05 - .06 * j), al = ra * (j ? .6 : 1) * Math.min(1, tau * 150);
      const c_ = [m[0] + d[0] * xr, m[1] + d[1] * xr, m[2] + d[2] * xr], dist = Math.max(1, Math.hypot(c_[0] - ex, c_[1] - ey, c_[2] - ez)), n = Math.min(3200, Math.max(60, Math.round(TAU * rr * FL / dist / 1.1)));
      for (let b = 0; b < 3; b++) ringB(c_[0] - d[0] * rr * .04 * b, c_[1] - d[1] * rr * .04 * b, c_[2] - d[2] * rr * .04 * b, U, Wd, rr * (1 - .025 * b), Math.round(n * (1 - .2 * b)), b ? (j ? WH : LIME) : (j ? LIME : HOT), Math.min(1, al * 1.3 * (1 - .22 * b)), j * 2.3 + b * 1.7 + tau * 30, .03 + .02 * b, .08 + .06 * b);
    }
  }
  // a cone of sparks
  if (tau < .1) for (let i = 0; i < 900; i++) {
    const o = i * 4, life = SPARK[o + 3] * .1; if (tau > life) continue;
    const s = tau * (1500 + 5200 * SPARK[o + 3]);
    dotW(m[0] + (U[0] * SPARK[o] + Wd[0] * SPARK[o + 1] + d[0] * SPARK[o + 2]) * s, m[1] + (U[1] * SPARK[o] + Wd[1] * SPARK[o + 1] + d[1] * SPARK[o + 2]) * s, m[2] + (U[2] * SPARK[o] + Wd[2] * SPARK[o + 1] + d[2] * SPARK[o + 2]) * s, i % 5 ? 1 : 2, i % 3 ? HOT : LIME, (1 - tau / life) * A);
  }
}
/* the rod in the bore: a plasma armature behind it, the rails flashing (world points along the bore); over the last
   0.3 s (film) the last rings discharge into it: a white glow swelling round the round, rings of light at the coils */
function bore(b0, d, z0, z1, T) {
  cam();
  for (let i = 0; i < 260; i++) {
    const u = i / 260, z = z1 - (z1 - z0) * Math.pow(u, .7), j = K.hh(i, Math.floor(T * 60));
    const p = V.mad(b0, d, z);
    dotW(p[0] + (j - .5) * .5, p[1] + (K.hh(i + 7, Math.floor(T * 60)) - .5) * .5, p[2] + (K.hh(i + 3, Math.floor(T * 60)) - .5) * .5, u < .1 ? 2 : 1, u < .25 ? HOT : LIME, (1 - u) * .95);
  }
  if (FCs && T > FCs.TX - .32) {
    const k = ss(FCs.TX - .32, FCs.TX, T), p = V.mad(b0, d, z1 - 3), [U, Wd] = perp2(d);
    K.glowW(p[0], p[1], p[2], Math.round(60 + 340 * k), HOT, .9 * k);
    for (let c = 0; c < 4; c++) { const zc = z1 - 2 - c * 4.5, al = k * (1 - c / 4) * (.6 + .4 * K.hh(c, Math.floor(T * 90))); if (al > .03) K.ringW(V.mad(b0, d, zc), U, Wd, 2.6 + .4 * c, 260, 2, c ? LIME : HOT, al, c); }
  }
}

/* ---------- the sabot: four petals (quarter shells of the round's sabot, r 0.96 m, 8.4 m long with its tapered nose and
   its 0.9 m base, from CTX.ROUND) hinging open from the base, then thrown off and tumbling; with a disc of chips from
   the base and the seals spreading round the rod (rod-relative; tau from the film's clock) ---------- */
const SB_R = .96, SB_IN = .27, SB_L = 8.4, SB_B = .9, SB_TP = 1.6;
const PETAL = (() => {
  const r = rng(5454), P = [];
  const rad = s => s > SB_L / 2 - SB_TP ? SB_R - (SB_R - .57) * (s - (SB_L / 2 - SB_TP)) / SB_TP : SB_R;
  for (let i = 0; i < 1500; i++) {
    const k = r(), s = -SB_L / 2 - SB_B + (SB_L + SB_B) * r(), ph = (r() - .5) * PI / 2 * .96;
    // the outer skin (most), the inner face against the rod, the cut edges, the base's solid quarter
    if (k < .62) P.push(s, ph, rad(Math.max(s, -SB_L / 2)), 1);
    else if (k < .74) P.push(s, ph, SB_IN, 0);
    else if (k < .9) P.push(s, (r() < .5 ? -1 : 1) * PI / 4 * .96, SB_IN + (rad(Math.max(s, -SB_L / 2)) - SB_IN) * r(), 2);
    else { const sb = -SB_L / 2 - SB_B * r(); P.push(sb, ph, SB_IN + (SB_R - SB_IN) * Math.sqrt(r()), 3); }
  }
  return new Float32Array(P);
})();
const NCH = 700, CHP = (() => { const r = rng(5555), A = new Float32Array(NCH * 6); for (let i = 0; i < NCH; i++) { A[i * 6] = r() * TAU; A[i * 6 + 1] = 50 + 230 * Math.pow(r(), 1.4); A[i * 6 + 2] = 3 + 26 * r(); A[i * 6 + 3] = .004 + .02 * r(); A[i * 6 + 4] = 6 + 30 * r(); A[i * 6 + 5] = r(); } return A; })();
function petals(p, d, U, Wd, ax, vis) {
  cam();
  const tau = tauX(ax); if (tau < 0 || tau > 2.5) return;
  const A = (vis === undefined ? 1 : vis) * (1 - ss(1.2, 2.5, tau)), sL = SUNL;
  for (let k = 0; k < 4; k++) {
    const ang = k / 4 * TAU + PI / 4, rx = Math.cos(ang), ry = Math.sin(ang);
    const ra = [U[0] * rx + Wd[0] * ry, U[1] * rx + Wd[1] * ry, U[2] * rx + Wd[2] * ry], ta = [U[0] * -ry + Wd[0] * rx, U[1] * -ry + Wd[1] * rx, U[2] * -ry + Wd[2] * rx];
    // hinging open about the base's outer edge, then flung off and tumbling (sim seconds)
    const t1 = Math.max(0, tau - .005), al = .52 * ss(.003, .028, tau) + (5 + 3 * k) * Math.max(0, tau - .02) * (k % 2 ? 1 : -.8);
    const out = (85 + 28 * k) * t1, back = (9 + 4 * k) * t1, ca = Math.cos(al), sa = Math.sin(al);
    const hx = p[0] + d[0] * (-SB_L / 2 - SB_B - back) + ra[0] * (SB_R + out), hy = p[1] + d[1] * (-SB_L / 2 - SB_B - back) + ra[1] * (SB_R + out), hz = p[2] + d[2] * (-SB_L / 2 - SB_B - back) + ra[2] * (SB_R + out);
    const glow = Math.exp(-tau / .02);
    for (let i = 0; i < PETAL.length; i += 4) {
      const s = PETAL[i] + SB_L / 2 + SB_B, ph = PETAL[i + 1], rr = PETAL[i + 2], kind = PETAL[i + 3], cp = Math.cos(ph), sp = Math.sin(ph);
      // in the hinge frame: along d, out along ra (from the hinge, inward is negative), across along ta
      const vd = s, vr = rr * cp - SB_R, vt = rr * sp, vd2 = vd * ca - vr * sa, vr2 = vd * sa + vr * ca;
      const x = hx + d[0] * vd2 + ra[0] * vr2 + ta[0] * vt, y = hy + d[1] * vd2 + ra[1] * vr2 + ta[1] * vt, z = hz + d[2] * vd2 + ra[2] * vr2 + ta[2] * vt;
      // light: the skin's normal (out from the axis, tipped by the hinge), the sun; the inner face and the cut edges dim
      const nr = cp * ca, nd = -cp * sa, nt = sp, lam = (ra[0] * nr + d[0] * nd + ta[0] * nt) * sL[0] + (ra[1] * nr + d[1] * nd + ta[1] * nt) * sL[1] + (ra[2] * nr + d[2] * nd + ta[2] * nt) * sL[2];
      const b = kind === 1 ? .35 + .65 * (lam > 0 ? lam : 0) : kind === 0 ? .25 : .45;
      dotW(x, y, z, 1, glow > .3 && (kind === 3 || kind === 0) ? HOT : WH, A * b * (i % 12 === 0 ? 1.15 : 1));
    }
  }
  // the chips: a disc spreading round the rod's path, glinting as they tumble
  for (let i = 0; i < NCH; i++) {
    const o = i * 6, t = tau - CHP[o + 3]; if (t <= 0) continue;
    const th = CHP[o], v = CHP[o + 1], cs = Math.cos(th) * v * t, sn = Math.sin(th) * v * t, bk = -SB_L / 2 - CHP[o + 2] * t;
    const gl = .35 + .65 * Math.abs(fs(CHP[o + 4] * t + CHP[o + 5] * 6.3));
    dotW(p[0] + U[0] * cs + Wd[0] * sn + d[0] * bk, p[1] + U[1] * cs + Wd[1] * sn + d[1] * bk, p[2] + U[2] * cs + Wd[2] * sn + d[2] * bk, CHP[o + 5] < .15 ? 2 : 1, t < .01 ? HOT : WH, A * gl * (.5 + .5 * CHP[o + 5]));
  }
}

/* ================= the fall ================= */
/* the rod's plasma, in the rod's frame (p its centre, D its heading, U Wd perpendiculars), all in film time T:
   everything flows and flickers by T, nothing stands still */
const NFL = 6000, FLW = (() => { const r = rng(919), A = new Float32Array(NFL * 5); for (let i = 0; i < NFL; i++) { A[i * 5] = r() * TAU; A[i * 5 + 1] = r(); A[i * 5 + 2] = .65 + .7 * r(); A[i * 5 + 3] = r(); A[i * 5 + 4] = r(); } return A; })();
const NBS = 4200, BSH = (() => { const r = rng(929), A = new Float32Array(NBS * 3); for (let i = 0; i < NBS; i++) { A[i * 3] = Math.sqrt(r()); A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = r(); } return A; })();
/* a ring of dots round the axis D at c (radius rr), n dots, phase ph */
function ringD(cx_, cy_, cz_, U, Wd, rr, n, col, a, ph, sz) {
  if (a < .015) return;
  for (let k = 0; k < n; k++) { const t = ph + k / n * TAU, cs = fc(t) * rr, sn = fs(t) * rr; dotW(cx_ + U[0] * cs + Wd[0] * sn, cy_ + U[1] * cs + Wd[1] * sn, cz_ + U[2] * cs + Wd[2] * sn, sz, col, a); }
}
/* a broken band of dots round the axis (the shock rings): radius jittered, gaps where a noise is low */
function ringB(cx_, cy_, cz_, U, Wd, rr, n, col, a, ph, jit, gap) {
  if (a < .015) return;
  for (let k = 0; k < n; k++) {
    const t = ph + k / n * TAU, g = .5 + .5 * fs(t * 3 + ph * 1.7) * fc(t * 5 - ph); if (g < gap) continue;
    const q = rr * (1 + jit * (hz1(k * 13 + (ph * 100 | 0)) - .5)), cs = fc(t) * q, sn = fs(t) * q;
    dotW(cx_ + U[0] * cs + Wd[0] * sn, cy_ + U[1] * cs + Wd[1] * sn, cz_ + U[2] * cs + Wd[2] * sn, 1, col, a * (.55 + .45 * g));
  }
}
/* the rod's plasma: an elongated bow shock (a paraboloid over the nose running into a long narrow cone), the sheath
   flowing off the nose into a long ionised wake, shock rings rippling down the cone on its surface (faded when seen
   end-on, so they never frame the rod as circles). Brighter and longer as the air thickens; never a ball. */
function sheath(p, D, U, Wd, heat, T) {
  cam();
  const px = p[0], py = p[1], pz = p[2];
  const dist = Math.max(1, Math.hypot(px - ex, py - ey, pz - ez)), ppm = FL / dist;
  // in the vacuum a closed shell catching the sun (the film draws it); far away only a point so it still reads
  if (heat < .015) { if (ppm < .45) { dotW(px, py, pz, 2, HOT, 1); K.glowW(px, py, pz, 9, LIME, .35); } return; }
  const alt = Math.hypot(px - W.CE[0], py - W.CE[1], pz - W.CE[2]) - W.RE;
  const h = heat, lo = ss(32000, 6000, alt);
  // how end-on the view is (1: along the axis): rings and cones fade there
  const vd = Math.abs((px - ex) * D[0] + (py - ey) * D[1] + (pz - ez) * D[2]) / dist, side = 1 - ss(.62, .9, vd);
  // sizes (m): the bow shock's nose radius, the shoulder, the cone, the hot wake
  const Rn = 1 + 2.2 * h + 1.6 * lo, Rs = Rn * 2.2, so = .3 * Rn, Lb = Rs * Rs / (2 * Rn) - so, Lc = Rs * (16 + 18 * lo), tc = .085 + .035 * (1 - h), Lw = 140 + 420 * h + 520 * lo;
  const nx = px + D[0] * 3.1, ny = py + D[1] * 3.1, nz = pz + D[2] * 3.1;
  const fr = Math.floor(T * 30);
  // the stagnation light at the nose and an ionisation streak down the first part of the wake (glows strung along the axis)
  K.glowW(nx, ny, nz, Math.min(140, 5 + Rn * 1.8 * ppm), HOT, .3 * h + .25 * lo);
  for (let k = 1; k <= 5; k++) { const x = Lw * .035 * k * k; K.glowW(nx - D[0] * x, ny - D[1] * x, nz - D[2] * x, Math.min(110, 3 + (Rs * (1 + .25 * k)) * ppm * 1.2), k < 3 ? FIRE : EMB, (.16 + .12 * lo) * h * (1 - k / 6)); }
  // the bow shock: a paraboloid over the nose, then a cone opening narrowly down the wake, shimmering
  {
    const n = Math.min(NBS, Math.max(220, Math.round((Rs * Rs + Lc * Rs * .3) * ppm * ppm * 1.6)));
    const x1 = (Rs * 1.3) * (Rs * 1.3) / (2 * Rn) - so;
    for (let i = 0; i < n; i++) {
      const o = i * 3, uq = BSH[o], th = BSH[o + 1] + T * .9;
      let rr, xb;
      if (uq < .55) { rr = uq / .55 * Rs * 1.3; xb = rr * rr / (2 * Rn) - so; }
      else { const v = (uq - .55) / .45; xb = x1 + (Lc - x1) * v * v; rr = Rs * 1.3 + (xb - x1) * tc; }
      const cs = fc(th) * rr, sn = fs(th) * rr, fk = hz1(i * 7 + fr * 13), al = h * (uq < .55 ? 1.15 - .5 * uq / .55 : .75 * (1 - (uq - .55) / .45) * side);
      dotW(nx - D[0] * xb + U[0] * cs + Wd[0] * sn, ny - D[1] * xb + U[1] * cs + Wd[1] * sn, nz - D[2] * xb + U[2] * cs + Wd[2] * sn, 1, uq < .3 ? HOT : WH, al * (.45 + .55 * fk));
    }
  }
  // the sheath: plasma flowing off the nose, over the shoulder and back into the wake, swirling and flickering
  {
    // the layer under the shock, hugging the nose and shoulder (a fast loop), then the hot wake behind (a long one)
    const n1 = Math.min(NFL >> 1, Math.max(240, Math.round(Rs * Rs * ppm * ppm * 7))), n2 = Math.min(NFL >> 1, Math.max(300, Math.round(Lw * Rs * ppm * ppm * .25)));
    const Ls = Lb * 3.2 + so;
    for (let i = 0; i < n1; i++) {
      const o = i * 5, a0 = FLW[o], sp = FLW[o + 2], rq = FLW[o + 3];
      let uu = FLW[o + 1] + T * 3.1 * sp; uu -= Math.floor(uu);
      const xb = Ls * uu * uu - so;
      const shl = xb < Lb ? Math.sqrt(Math.max(0, 2 * Rn * (xb + so))) : Rs * (1 + .5 * (xb - Lb) / Ls);
      const th = a0 + 2.4 * uu + .5 * fs(T * 5.3 + a0 * 3 + uu * 9);
      const rr = shl * (.5 + .45 * rq) * (1 + .12 * fs(T * 11.7 + i * .37 + uu * 20));
      const cs = fc(th) * rr, sn = fs(th) * rr;
      const fk = .55 + .45 * hz2(i + fr * 31), al = h * (1.2 - .6 * uu) * fk;
      dotW(nx - D[0] * xb + U[0] * cs + Wd[0] * sn, ny - D[1] * xb + U[1] * cs + Wd[1] * sn, nz - D[2] * xb + U[2] * cs + Wd[2] * sn, uu < .25 && ppm > 3 ? 2 : 1, uu < .3 ? HOT : uu < .7 ? FIRE : EMB, al);
    }
    // the wake: a long, narrow, turbulent column of glowing gas, white-hot near the rod, cooling to fire and embers
    for (let i = 0; i < n2; i++) {
      const o = (i + (NFL >> 1)) * 5, a0 = FLW[o], sp = FLW[o + 2], rq = FLW[o + 3];
      let uu = FLW[o + 1] + T * 1.2 * sp; uu -= Math.floor(uu);
      const xb = Ls * .6 + Lw * Math.pow(uu, 1.35);
      const shl = Rs * (.8 + 1.1 * xb / Lw);
      const th = a0 + 1.7 * uu + .45 * fs(T * 4.3 + a0 * 3 + uu * 11);
      const rr = shl * (.15 + .85 * rq * rq) * (1 + .3 * fs(T * 7.7 + i * .37 + uu * 20));
      const cs = fc(th) * rr, sn = fs(th) * rr;
      const fk = .5 + .5 * hz2(i + fr * 31), al = (h + .3 * lo) * Math.pow(1 - uu, 1.1) * fk * (1.15 - .5 * rq);
      dotW(nx - D[0] * xb + U[0] * cs + Wd[0] * sn, ny - D[1] * xb + U[1] * cs + Wd[1] * sn, nz - D[2] * xb + U[2] * cs + Wd[2] * sn, 1, uu < .12 ? HOT : uu < .4 ? FIRE : uu < .7 ? EMB : WH, uu > .7 ? al * .5 : al);
    }
  }
  // shock rings: ripples running down the bow shock's cone, on its surface (born at the shoulder, opening with the cone,
  // gone at its end); broken, ragged bands that read as ellipses travelling down the sheath from the side, faded end-on
  if (side > .02) {
    const x1 = (Rs * 1.3) * (Rs * 1.3) / (2 * Rn) - so, RDT = .055, NRG = 12, life = RDT * NRG, k0 = Math.floor(T / RDT);
    for (let j = 0; j < NRG; j++) {
      const kq = k0 - j, tau = T - kq * RDT, uq = tau / life; if (uq > 1 || uq < 0) continue;
      const xr = Lb + (Lc - Lb) * Math.pow(uq, 1.15), rr = (xr < x1 ? Math.sqrt(Math.max(0, 2 * Rn * (xr + so))) : Rs * 1.3 + (xr - x1) * tc) * 1.02;
      const al = side * h * Math.pow(1 - uq, 1.2) * Math.min(1, uq * 8) * (kq % 3 === 0 ? 1.15 : .7);
      const n = Math.min(900, Math.max(24, Math.round(TAU * rr * ppm / 1.2)));
      const cxr = nx - D[0] * xr, cyr = ny - D[1] * xr, czr = nz - D[2] * xr;
      ringB(cxr, cyr, czr, U, Wd, rr, n, uq < .25 ? HOT : WH, al, kq * .9, .06 + .06 * uq, .2 + .25 * uq);
      if (uq < .45) ringB(cxr + D[0] * rr * .05, cyr + D[1] * rr * .05, czr + D[2] * rr * .05, U, Wd, rr * .96, Math.round(n * .6), FIRE, al * .5, kq * 1.3, .05, .3);
    }
  }
}

/* the trail from the muzzle down to the rod: dots at fixed places along the path (a 5 cm lattice), thinned per 256 m
   chunk by their spacing on screen; a faint lime track in the vacuum (the rod is ours), and in the air a column of
   plasma and smoke: white-hot at the rod, cooling, widening, drifting in the winds aloft and rising a little, shaded
   by the sun so it reads as a volume; it stays in the sky after the strike */
const TCH = 256, TDS = .05;
const th1 = i => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
const th2 = i => { const s = Math.sin(i * 78.233 + 1.7) * 24634.6345; return s - Math.floor(s); };
const th3 = i => { const s = Math.sin(i * 39.425 + 4.1) * 15731.3712; return s - Math.floor(s); };
/* the column's radius (m) for an age (film s, aged as the film's ageAt) and a height */
const colR = (age, alt) => Math.min(330, 5 + 36 * Math.sqrt(age)) * (.3 + .7 * ss(108000, 26000, alt)) * (1 + 1.1 * ss(24000, 2000, alt));
const NCHK = 2048, CK_ST = new Int32Array(NCHK), CK_RP = new Int32Array(NCHK), CK_ZM = new Float64Array(NCHK), CK_DM = new Float64Array(NCHK), CK_ON = new Uint8Array(NCHK);
const TBUDGET = 36000;
function trail(F, T, vis) {
  cam();
  if (FCs) { FRAME.T = T; FRAME.a = FCs.aOf(T); W.CRA.a = FRAME.a; }
  const sR = F.sOf(T);
  // the column's age: the film's clock while the rod falls, then the strike's own (sim) clock, so it does not swell
  // through the slow motion
  const TI_ = FCs ? FCs.TI : 1e9, ageAt = T < TI_ || !FCs ? F.ageAt : (s_, T_) => F.ageAt(s_, TI_) + .75 * Math.max(0, FRAME.a);
  if (sR > 0) {
    const Dv = F.DIR, M = F.MZ, U = F.U, Wd = F.W, Fl = FL, near = NR;
    const sU = U[0] * SUNL[0] + U[1] * SUNL[1] + U[2] * SUNL[2], sW = Wd[0] * SUNL[0] + Wd[1] * SUNL[1] + Wd[2] * SUNL[2];
    // pass 1: the chunks in view, their lattice step and dots across, and what the column asks for in all
    let want = 0, ci = 0;
    for (let c0 = 0; c0 < sR && ci < NCHK; c0 += TCH, ci++) {
      CK_ON[ci] = 0;
      const c1 = Math.min(sR, c0 + TCH), sm = (c0 + c1) / 2;
      const altm = F.altAt(sm), airm = ss(112000, 36000, altm), ageMax = ageAt(c0, T);
      const reach = airm > .02 ? colR(ageMax, altm) * 1.4 + 7 * ageMax + 10 : 10;
      if (!K.wIn(M[0] + Dv[0] * sm, M[1] + Dv[1] * sm, M[2] + Dv[2] * sm, (c1 - c0) / 2 + reach)) continue;
      const zmid = Math.max(near, K.WZ[0]), dmin = Math.max(near, K.WZ[0] - (c1 - c0) / 2 - reach);
      CK_ON[ci] = airm < .02 ? 1 : 2; CK_ZM[ci] = zmid; CK_DM[ci] = dmin;
      const need = (airm < .02 ? 2.2 : 1.7) * dmin / (Fl * TDS); let st = 1; while (st < need && st < 1 << 20) st <<= 1;
      CK_ST[ci] = st;
      if (airm >= .02) { const agm = ageAt(sm, T), wpx = 2 * colR(agm, altm) * Fl / zmid, reps = Math.max(1, Math.min(44, Math.round(wpx * .4))); CK_RP[ci] = reps; want += (c1 - c0) / (TDS * st) * (reps + 1); }
    }
    const kB = want > TBUDGET ? TBUDGET / want : 1;
    ci = 0;
    for (let c0 = 0; c0 < sR && ci < NCHK; c0 += TCH, ci++) {
      if (!CK_ON[ci]) continue;
      const c1 = Math.min(sR, c0 + TCH), sm = (c0 + c1) / 2, zmid = CK_ZM[ci], dmin = CK_DM[ci], st = CK_ST[ci];
      const mx = M[0] + Dv[0] * sm, my = M[1] + Dv[1] * sm, mz = M[2] + Dv[2] * sm;
      const ag0 = ageAt(c0, T), ag1 = ageAt(c1, T), al0 = F.altAt(c0), al1 = F.altAt(c1), icl = 1 / Math.max(1e-6, c1 - c0);
      const i0 = Math.ceil(c0 / TDS / st) * st, i1 = c1 / TDS;
      if (CK_ON[ci] === 1) {
        // the vacuum track: a thin lime line far away, dots close
        if (dmin > 1500) {
          const ag = (ag0 + ag1) / 2, b = vis * (.6 + .3 * Math.exp(-ag / 12)) * (.75 + .25 * ss(1500, 20000, dmin));
          K.lineW(M[0] + Dv[0] * c0, M[1] + Dv[1] * c0, M[2] + Dv[2] * c0, M[0] + Dv[0] * c1, M[1] + Dv[1] * c1, M[2] + Dv[2] * c1, 1, 1, ag < 1.5 ? HOT : LIME, b * .85, null, 0, 0);
        }
        for (let i = i0; i < i1; i += st) {
          const sp = (i + th1(i) * st * .9) * TDS; if (sp > sR) break;
          const age = ag0 + (ag1 - ag0) * (sp - c0) * icl;
          const px = M[0] + Dv[0] * sp, py = M[1] + Dv[1] * sp, pz = M[2] + Dv[2] * sp;
          const bt = vis * .9 * (.55 + .45 * Math.exp(-age / 20)) * (.6 + .4 * th2(i)), hw = .25 + .5 * Math.min(1, age / 8);
          dotW(px, py, pz, 1, age < 1.5 ? HOT : LIME, bt);
          dotW(px + (th2(i + 7) - .5) * hw * U[0] + (th3(i + 7) - .5) * hw * Wd[0], py + (th2(i + 7) - .5) * hw * U[1] + (th3(i + 7) - .5) * hw * Wd[1], pz + (th2(i + 7) - .5) * hw * U[2] + (th3(i + 7) - .5) * hw * Wd[2], 1, LIME, bt * .6);
        }
        continue;
      }
      // the air: a core line far away, then the column's dots, as many across as its width on screen asks (in budget)
      const agm = (ag0 + ag1) / 2, altm = F.altAt(sm), rcm = colR(agm, altm), wpx = 2 * rcm * Fl / zmid;
      if (dmin > 1500 && wpx < 6) {
        const hot = Math.exp(-agm / .8), b = vis * (.5 + .4 * hot) * (.7 + .3 * ss(1500, 20000, dmin));
        K.lineW(mx - Dv[0] * (c1 - c0) / 2, my - Dv[1] * (c1 - c0) / 2, mz - Dv[2] * (c1 - c0) / 2, mx + Dv[0] * (c1 - c0) / 2, my + Dv[1] * (c1 - c0) / 2, mz + Dv[2] * (c1 - c0) / 2, 1.1, 1, hot > .4 ? HOT : DUST, b, WH, .04, 0);
      }
      const reps0 = CK_RP[ci], reps = kB < 1 ? Math.max(1, Math.round(reps0 * Math.sqrt(kB))) : reps0, ks = kB < 1 ? Math.min(1, kB * (reps0 + 1) / (reps + 1)) : 1;
      for (let i = i0; i < i1; i += st) {
        if (ks < 1 && th3(i + 99) > ks) continue;
        const sp = (i + th1(i) * st * .9) * TDS; if (sp > sR) break;
        const uc = (sp - c0) * icl, alt = al0 + (al1 - al0) * uc, air = ss(112000, 36000, alt), age = ag0 + (ag1 - ag0) * uc;
        const hot = Math.exp(-age / (1.1 + .8 * th3(i)));
        const rc = colR(age, alt) * (1 + .15 * fs(sp / 173 + 1.3) + .1 * fs(sp / 71 + 4.1) + .07 * fs(sp / 29.3 + 2.2) + .05 * fs(sp / 431 + .7)) * air;
        // winds aloft: the column drifts and kinks with height; it rises a little as it cools
        const wa = age * air, wx = 4.5 * fs(alt / 6500 + 1.2) * wa, wz = 4.5 * fc(alt / 9000 + .4) * wa, wy = 1.1 * wa;
        const px = M[0] + Dv[0] * sp + wx, py = M[1] + Dv[1] * sp + wy, pz = M[2] + Dv[2] * sp + wz;
        const dens = vis * (.42 + .58 * Math.exp(-age / 40)) * (.5 + .5 * air);
        if (hot > .55) dotW(px, py, pz, 1, HOT, dens * .6 * hot);
        for (let k = 0; k < reps; k++) {
          const hk = th2(i * 41 + k), hq = th3(i * 41 + k * 7), th = hk * TAU, q = 1 - .72 * hq * hq;
          const cs = fc(th), sn = fs(th), rr = q * rc;
          const x = px + (U[0] * cs + Wd[0] * sn) * rr, y = py + (U[1] * cs + Wd[1] * sn) * rr, z = pz + (U[2] * cs + Wd[2] * sn) * rr;
          const lw = cs * sU + sn * sW, lit = .22 + .78 * (lw > 0 ? lw : 0) * (.55 + .45 * q) + .1 * th1(i + k);
          const b = dens * (.6 + .4 * q);
          if (hot > .42) dotW(x, y, z, 1, hot > .7 ? HOT : FIRE, b * (.75 + .35 * hot));
          else if (hot > .06) { mixc(EMB, DUST, 1 - (hot - .06) / .36, CC); dotW(x, y, z, 1, CC, b * (.6 + .4 * lit)); }
          else { const l = lit > 1 ? 1 : lit; dotP(x, y, z, SMK[0] + (DUST[0] - SMK[0]) * l, SMK[1] + (DUST[1] - SMK[1]) * l, SMK[2] + (DUST[2] - SMK[2]) * l, b); }
        }
      }
    }
  }
  // the forest round the site (standing, then flattened by the strike)
  W.drawForest(FRAME.a, T, 1);
  W.drawHero(FRAME.a, T, 1);
}

/* ================= the strike ================= */
const gP = W.gP, gPc = W.gPc;
/* radii and heights as functions of a (sim s since the strike); the film's readout shows shockR and capH */
const shockR = a => a <= 0 ? 0 : 340 * a + 420 * (1 - Math.exp(-a * 3.2));
const surgeR = a => a <= 0 ? 0 : 2600 * (1 - Math.exp(-a / 9)) + 420 * (1 - Math.exp(-a * 2.2));
/* the shock's arrival time at distance d (m), tabulated */
const SHT = new Float32Array(1501); { let a = 0; for (let i = 0; i <= 1500; i++) { const d = i * 4; while (shockR(a) < d) a += .0005; SHT[i] = a; } }
const arrive = d => { const x = Math.max(0, Math.min(1500, d / 4)), k = Math.min(1499, Math.floor(x)); return SHT[k] + (SHT[k + 1] - SHT[k]) * (x - k); };
W.setShock(arrive, a => shockR(a));
/* dust colour: hot early, then white dust lit from the sun (lit 0 shadow .. 1 sunlit); a lookup of heat x light */
function dustCol(heat, lit, o) { const l = lit > 1 ? 1 : lit < 0 ? 0 : lit; o[0] = SMK[0] + (DUST[0] - SMK[0]) * l; o[1] = SMK[1] + (DUST[1] - SMK[1]) * l; o[2] = SMK[2] + (DUST[2] - SMK[2]) * l; if (heat > 0) { mixc(o, heat > .55 ? FIRE : EMB, Math.min(1, heat * 1.3), o); if (heat > .7) mixc(o, HOT, Math.min(1, (heat - .7) * 3.3), o); } return o; }
const DC = [0, 0, 0];
const LH = 24, LL = 40, LUT = new Float32Array(LH * LL * 3);
for (let h = 0; h < LH; h++) for (let l = 0; l < LL; l++) { dustCol(h / (LH - 1), l / (LL - 1), DC); const o = (h * LL + l) * 3; LUT[o] = DC[0]; LUT[o + 1] = DC[1]; LUT[o + 2] = DC[2]; }
const lut = (heat, lit) => ((heat <= 0 ? 0 : heat >= 1 ? LH - 1 : (heat * (LH - 1) + .5) | 0) * LL + (lit <= 0 ? 0 : lit >= 1 ? LL - 1 : (lit * (LL - 1) + .5) | 0)) * 3;
/* a dot coloured from the lookup, 1 or 2 px (max blend) */
function dotL(x, y, z, li, a, s) {
  if (a < .015) return;
  const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < NR) return;
  const iz = FL / zc, sx = CX + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW - 1) return;
  const sy = CY - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH - 1) return;
  if (a > 1) a = 1;
  const cr = LUT[li] * a, cg = LUT[li + 1] * a, cb = LUT[li + 2] * a, pk = 0xff000000 | (cb << 16) | (cg << 8) | cr;
  let p = (sy | 0) * BW + (sx | 0);
  if (DD[(p << 2) + 1] < cg) U32[p] = pk;
  if (s > 1) { p++; if (DD[(p << 2) + 1] < cg) U32[p] = pk; p += BW; if (DD[(p << 2) + 1] < cg) U32[p] = pk; p--; if (DD[(p << 2) + 1] < cg) U32[p] = pk; }
}
/* a particle system's stride and dot size from its size on screen: about one dot per k px^2 of its disc, 2 px dots
   when even every particle leaves gaps */
let PS_ST = 1, PS_S = 1;
function psys(N, R_, x, y, z, k, cap) {
  const d = Math.max(1, Math.hypot(x - ex, y - ey, z - ez) - R_ * .5), rpx = R_ * FL / d, area = 3.1416 * rpx * rpx, nmax = Math.min(area / (k || 2.6), cap || 1e9);
  PS_ST = Math.max(1, Math.min(24, Math.ceil(N / Math.max(1, nmax)))); PS_S = area / (N / PS_ST) > 6 ? 2 : 1;
}
/* particle tables */
const NSH = 18000, SHK = (() => { const r = rng(7171), A = new Float32Array(NSH * 6); for (let i = 0; i < NSH; i++) { const u = Math.pow(r(), .8), th = r() * TAU, el = Math.asin(u); A[i * 6] = Math.cos(th) * Math.cos(el); A[i * 6 + 1] = el; A[i * 6 + 2] = r(); A[i * 6 + 3] = Math.sin(th) * Math.cos(el); A[i * 6 + 4] = Math.sin(el); A[i * 6 + 5] = th; } return A; })();
const NSU = 36000, SUR = (() => { const r = rng(7272), A = new Float32Array(NSU * 8); for (let i = 0; i < NSU; i++) { const th = r() * TAU; A[i * 8] = th; A[i * 8 + 1] = Math.pow(r(), .7); A[i * 8 + 2] = 1 - Math.pow(r(), 2.2) * .9; A[i * 8 + 3] = r(); A[i * 8 + 4] = r(); A[i * 8 + 5] = Math.cos(th); A[i * 8 + 6] = Math.sin(th); A[i * 8 + 7] = 1 + .3 * Math.sin(th * 7 + A[i * 8 + 3] * 6) + .15 * Math.sin(th * 23 + 1.3); } return A; })();
const NEJ = 8000, EJ = (() => { const r = rng(7373), A = new Float32Array(NEJ * 7); for (let i = 0; i < NEJ; i++) { const th = r() * TAU, t0 = Math.pow(r(), 1.6) * .7, el = (38 + 30 * r() - 12 * t0) * DEG, v = (50 + 250 * Math.pow(r(), 1.3)) * (1 - .5 * t0); A[i * 7] = Math.cos(th) * Math.cos(el) * v; A[i * 7 + 1] = Math.sin(el) * v; A[i * 7 + 2] = Math.sin(th) * Math.cos(el) * v; A[i * 7 + 3] = r(); A[i * 7 + 4] = t0; A[i * 7 + 5] = Math.cos(th) * (18 + 35 * r()); A[i * 7 + 6] = Math.sin(th) * (18 + 35 * r()); } return A; })();
const NCK = 420, CHK = (() => { const r = rng(7383), A = new Float32Array(NCK * 10); for (let i = 0; i < NCK; i++) { const th = r() * TAU, el = (25 + 50 * r()) * DEG, v = 40 + 150 * r(); A[i * 10] = Math.cos(th) * Math.cos(el) * v; A[i * 10 + 1] = Math.sin(el) * v; A[i * 10 + 2] = Math.sin(th) * Math.cos(el) * v; A[i * 10 + 3] = 2 + 5 * r() * r(); A[i * 10 + 4] = r() * TAU; A[i * 10 + 5] = 2 + 6 * r(); A[i * 10 + 6] = r(); A[i * 10 + 7] = r(); A[i * 10 + 8] = Math.cos(th) * 30 * r(); A[i * 10 + 9] = Math.sin(th) * 30 * r(); } return A; })();
const CKP = (() => { const r = rng(7393), A = new Float32Array(24 * 3); for (let i = 0; i < 24; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(th) * h; A[i * 3 + 1] = u * .7; A[i * 3 + 2] = Math.sin(th) * h; } return A; })();
let PT = null;
const setProf = o => { PT = o; };
/* rings lying on the ground pile into a bright bar when seen edge-on from near the ground: dim them by the camera's
   depression angle to the ring (r m out from the strike point) */
function graze(r) { const dx = HIT[0] - ex, dz = HIT[2] - ez, d = Math.max(1, Math.hypot(dx, dz) - r * .5), dep = (ey - HIT[1]) / d; return .16 + .84 * ss(.01, .2, Math.abs(dep)); }
/* the battery's vehicles: the four in the crater torn apart (each part flung on its own, glowing), the outer four
   tossed whole, tumbling, landing as wrecks */
const VT = W.VEHS.map((v, vi) => {
  const r = rng(8100 + vi), inner = v.d < 60, aH = arrive(v.d), ux = (v.x - HIT[0]) / v.d, uz = (v.z - HIT[2]) / v.d;
  const mk = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] });
  const parts = v.parts.map(p => {
    const mn = p.ml.mn, mx = p.ml.mx, pc = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const sp = inner ? 70 + 120 * r() : 0, th = Math.atan2(uz, ux) + (r() - .5) * 1.4, el = (20 + 50 * r()) * DEG;
    const ax = V.norm([r() - .5, r() - .5, r() - .5]);
    return { p, pc, wc: X.ap(v.W, pc), vel: [Math.cos(th) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(th) * Math.cos(el) * sp], ax, om: (inner ? 3 + 6 * r() : 0), Tw: mk() };
  });
  const v0 = inner ? 0 : 52 * Math.pow(190 / v.d, 1.4) * (.85 + .3 * r()), vy = v0 * (.42 + .2 * r()), ax = V.norm([uz + (r() - .5) * .4, (r() - .5) * .3, -ux + (r() - .5) * .4]);
  const tl = vy * 2 / 9.81, k = Math.max(1, Math.round((2.2 + 1.2 * r()) * tl / PI)), om = (k * PI + (r() < .5 ? 0 : PI * .5)) / Math.max(.3, tl);
  return { v, inner, aH, ux, uz, parts, v0, vy, ax, om, tl, Tw: mk() };
});
/* rotation about a unit axis by angle (row-major) into o */
function rotAx(ax, ang, o) { const c = Math.cos(ang), s = Math.sin(ang), k = 1 - c, x = ax[0], y = ax[1], z = ax[2]; o[0] = c + x * x * k; o[1] = x * y * k - z * s; o[2] = x * z * k + y * s; o[3] = y * x * k + z * s; o[4] = c + y * y * k; o[5] = y * z * k - x * s; o[6] = z * x * k - y * s; o[7] = z * y * k + x * s; o[8] = c + z * z * k; return o; }
function mul3(A, B, o) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; }
const RT1 = new Array(9).fill(0), VOPT = { a: 1.25, fade: 1600, px: 3.2, px0: 10, keep: 1, tint: HOT, tk: 0 };
function vehicles(a, vis) {
  for (const t of VT) {
    const tau = a - t.aH; if (tau <= 0) continue;
    const v = t.v, Rv = v.W.R, glow = Math.exp(-tau * 2.2);
    VOPT.a = 1.25 * vis; VOPT.tint = glow > .3 ? HOT : FIRE;
    if (t.inner) {
      // torn apart: each part on its own arc, tumbling, white-hot then burning out
      if (tau > 9) continue;
      VOPT.tk = Math.min(1, .5 + glow); VOPT.a = 1.25 * vis * (1 - ss(5, 9, tau)); VOPT.keep = 1 - .6 * ss(2, 8, tau);
      for (const q of t.parts) {
        const tt = Math.min(tau, 12), drag = 1 / (1 + tt * .25);
        rotAx(q.ax, q.om * tt, RT1); mul3(RT1, Rv, q.Tw.R);
        const wc = q.wc, px = wc[0] + q.vel[0] * tt * drag, pz = wc[2] + q.vel[2] * tt * drag;
        const yg = gPc(Math.hypot(px - HIT[0], pz - HIT[2]), Math.atan2(pz - HIT[2], px - HIT[0])), py = Math.max(yg + 1, wc[1] + q.vel[1] * tt * drag - 4.905 * tt * tt);
        const M = q.Tw.R, c = q.pc; q.Tw.T[0] = px - (M[0] * c[0] + M[1] * c[1] + M[2] * c[2]); q.Tw.T[1] = py - (M[3] * c[0] + M[4] * c[1] + M[5] * c[2]); q.Tw.T[2] = pz - (M[6] * c[0] + M[7] * c[1] + M[8] * c[2]);
        K.drawLod(q.p.ml, q.Tw, VOPT);
        if (tau < 4) dotW(px, py, pz, 2, HOT, glow * vis);
      }
      VOPT.keep = 1;
      continue;
    }
    // tossed whole: up and out, tumbling about a horizontal axis, landing and lying where it fell
    const tt = Math.min(tau, t.tl), L_ = t.v0 * tt / (1 + tt * .3) + (tau > t.tl ? 6 * (1 - Math.exp(-(tau - t.tl) * 2.5)) : 0);
    const cx_ = v.x + t.ux * L_, cz_ = v.z + t.uz * L_, yg = gPc(v.d + L_, Math.atan2(t.uz, t.ux));
    const cy_ = tau < t.tl ? Math.max(yg + 1.6, v.c[1] + t.vy * tt - 4.905 * tt * tt) : yg + 1.6;
    rotAx(t.ax, t.om * tt, RT1); mul3(RT1, Rv, t.Tw.R);
    const M = t.Tw.R; t.Tw.T[0] = cx_ - M[1] * 1.6; t.Tw.T[1] = cy_ - M[4] * 1.6; t.Tw.T[2] = cz_ - M[7] * 1.6;
    VOPT.tk = Math.min(1, glow * 1.4); VOPT.a = 1.2 * vis * (1 - .45 * ss(0, 3, tau));
    for (const q of t.parts) K.drawLod(q.p.ml, t.Tw, VOPT);
    if (tau < 2.5) for (let i = 0; i < 60; i++) { const s = tau * (8 + 20 * hz1(i + 3)); dotW(cx_ + (hz1(i) - .5) * s, cy_ + (hz2(i) - .3) * s, cz_ + (hz1(i + 9) - .5) * s, 1, tau < .6 ? HOT : DUST, (1 - tau / 2.5) * vis); }
  }
  VOPT.tk = 0;
}
/* the plasma dome: in the first instants a hemisphere of white-hot air swelling over the impact, its skin boiling,
   cooling to fire as it lifts into the fireball (the cap takes over) */
const NPD = 16000, PDM = (() => { const r = rng(7474), A = new Float32Array(NPD * 5); for (let i = 0; i < NPD; i++) { const th = r() * TAU, el = Math.asin(Math.pow(r(), .7)), q = Math.pow(r(), .3); A[i * 5] = Math.cos(th) * Math.cos(el); A[i * 5 + 1] = Math.sin(el); A[i * 5 + 2] = Math.sin(th) * Math.cos(el); A[i * 5 + 3] = q; A[i * 5 + 4] = r(); } return A; })();
function sPlasma(a, vis, hx, hy, hz) {
  if (a <= 0 || a > 1.7) return;
  const R0 = 24 + 330 * (1 - Math.exp(-a * 5.5)), al = vis * Math.min(1, a * 40) * (1 - ss(.5, 1.7, a)), lift = 70 * a * a, heat = 1.25 * Math.exp(-a * 1.5);
  psys(NPD, R0, hx, hy + R0 * .45, hz, 1.3, 14000); const st = PS_ST, sz = PS_S;
  for (let i = 0; i < NPD; i += st) {
    const o = i * 5, q = PDM[o + 3], hq = PDM[o + 4], ux = PDM[o], uy = PDM[o + 1], uz = PDM[o + 2];
    const bump = 1 + .1 * fs(ux * 9 + uz * 7 + a * 9) * fc(uy * 8 - a * 6) + .05 * fs(ux * 23 - uz * 19 + a * 17);
    const rr = R0 * q * bump, y = hy + uy * rr * .82 + lift * q;
    dotL(hx + ux * rr, y, hz + uz * rr, lut(heat * (1.1 - .45 * q) + .08 * hq, .55 + .45 * hq), al * (.45 + .55 * q) * (.75 + .3 * hq), sz);
  }
}
/* shock layers racing out over the forest: the front's foot as a thin wall of compressed, dusty air with a bright crest
   (white-hot, then lime like the land's ring), two weaker layers trailing it; they thin out and fade. Near the ground
   the dots go to the arc that faces the lens (a window of the ring), high up to the whole ring */
const NLY = 14000, LYP = (() => { const r = rng(7575), A = new Float32Array(NLY * 3); for (let i = 0; i < NLY; i++) { A[i * 3] = (i + r()) / NLY - .5; A[i * 3 + 1] = i % 5 < 3 ? .96 + .04 * r() : Math.pow(r(), .7) * .9; A[i * 3 + 2] = r(); } return A; })();
function sLayers(a, vis, hx, hy, hz) {
  if (a < .2 || a > 10) return;
  const eh = ey - hy, win = .7 + (PI - .7) * ss(150, 700, eh), th0 = Math.atan2(ez - hz, ex - hx), cr = a < 1.5 ? HOT : LIME;
  for (let k = 0; k < 3; k++) {
    const ak = a - k * .08; if (ak <= .15) continue;
    const R0 = shockR(ak) - 4 * k, Hs = (16 + .05 * R0) * (1 - .22 * k), al = vis * ss(.2, .55, a) * Math.exp(-ak / 4.2) * (k ? .55 / k : 1) * (.45 + .55 * graze(R0));
    if (al < .02 || R0 > 8000) continue;
    const n = Math.min(NLY, Math.round(NLY * (.35 + .65 * win / PI)));
    for (let i = 0; i < n; i++) {
      const o = i * 3, th = th0 + LYP[o] * 2 * win, v = LYP[o + 1], hq = LYP[o + 2], ct = fc(th), st = fs(th);
      const rr = R0 - hq * (3 + 3 * k), top = Hs * (1 + .18 * fs(th * 37 + k * 2.1 + a) + .1 * fs(th * 91 - a * 3)), y = gP(rr, th) + 3 + v * top;
      if (v > .95) dotW(hx + ct * rr, y, hz + st * rr, 1, k ? WH : cr, al * (.7 + .3 * hq));
      else dotW(hx + ct * rr, y, hz + st * rr, 1, DUST, al * (.12 + .36 * v) * (.6 + .4 * hq));
    }
  }
}
function sGlow(a, vis, hx, hy, hz) {
  // the blinding point and the light of the fireball
  if (a < 3.5) { K.glowW(hx, hy + 12, hz, Math.round(70 + 480 * Math.exp(-a * 2.4)), HOT, Math.min(1, 1.4 * Math.exp(-a * 1.3)) * vis); if (a < 2.5) K.glowW(hx, hy + 60, hz, 380, FIRE, .4 * Math.exp(-a * .9) * vis); }
}
function sShock(a, vis, hx, hy, hz) {
  // the air shock: a dome racing out, two reflected shells behind it
  if (a < 4.6) {
    for (let sh = 0; sh < 3; sh++) {
      const as = a - (sh === 0 ? 0 : sh === 1 ? .14 : .32); if (as <= 0) continue;
      const R0 = shockR(as) * (sh === 0 ? 1 : sh === 1 ? .92 : .84), al = vis * Math.min(1, a * 8) * Math.pow(1 - a / 4.6, 2) * (sh === 0 ? 1 : sh === 1 ? .45 : .26);
      if (al < .02) continue;
      psys(NSH, R0, hx, hy + R0 * .3, hz, 2.4, 9000); const st = PS_ST * (sh ? 3 : 1), elMin = sh ? .12 : 0;
      for (let i = sh; i < NSH; i += st) {
        const o = i * 6, el = SHK[o + 1]; if (el < elMin) continue;
        const rr = R0 * (.985 + .03 * SHK[o + 2]);
        dotW(hx + SHK[o] * rr, hy + SHK[o + 4] * rr * .92, hz + SHK[o + 3] * rr, 1, el < .2 ? HOT : WH, al * (.4 + .6 * (1 - el / 1.6)) * (.6 + .4 * SHK[o + 2]));
      }
    }
  }
  // the condensation dome: a fog shell in the shock's wake, patchy, forming and burning off
  if (a > .15 && a < 2.6) {
    const R0 = shockR(a) * .8, al = vis * ss(.15, .55, a) * (1 - ss(1.3, 2.6, a)) * .8;
    psys(NSH, R0, hx, hy + R0 * .4, hz, 2.4, 9000); const st = PS_ST;
    for (let i = 0; i < NSH; i += st) {
      const o = i * 6, el = SHK[o + 1]; if (el < .12 || el > 1.25) continue;
      const th = SHK[o + 5], m = .5 + .5 * fs(th * 5 + el * 7 + 1.1) * fc(el * 9 - th * 3), mk = m - .35; if (mk < 0) continue;
      const rr = R0 * (1 - .07 * SHK[o + 2]);
      const lit = .5 + .5 * Math.max(0, SHK[o] * SUNL[0] + SHK[o + 4] * SUNL[1] + SHK[o + 3] * SUNL[2]);
      dotP(hx + SHK[o] * rr, hy + SHK[o + 4] * rr * .9, hz + SHK[o + 3] * rr, 236 * lit, 238 * lit, 232 * lit, al * Math.min(1, mk * 2.5) * (.5 + .5 * SHK[o + 2]));
    }
  }
}
function sFoot(a, vis, hx, hy, hz) {
  // the shock's foot: a bright ring racing out over the ground, a low wall of dust behind it
  {
    const R0 = shockR(a), al = vis * Math.min(1, a * 6) * Math.exp(-a / 9) * (1 - ss(14, 20, a)) * graze(R0);
    if (al > .01 && R0 < 8700) {
      const n = Math.min(9000, Math.round(TAU * R0 / 2)), hw = 4 + 24 * Math.min(1, a / 3);
      for (let k = 0; k < n; k++) {
        const th = (k + .5) / n * TAU, h1 = HH1[k], h2 = HH2[k];
        const rr = R0 - h1 * hw * 2.2, x = hx + fc(th) * rr, z = hz + fs(th) * rr, g = gP(rr, th);
        dotW(x, g + 1.5 + h2 * h2 * hw * 1.5, z, h1 < .2 ? 2 : 1, h1 < .35 ? HOT : DUST, al * (1.15 - h1 * .8));
      }
    }
  }
}
function sSurge(a, vis, hx, hy, hz) {
  // the dust skirt (base surge): a billowing wall rolling out over the ground, lit from the sun, thinning behind
  {
    const Rs = surgeR(a), H = (18 + 200 * (1 - Math.exp(-a / 3.2))) * (1 + .35 * ss(10, 30, a)), al = vis * Math.min(1, a * 4) * (1 - ss(34, 56, a)) * (.4 + .6 * graze(Rs));
    psys(NSU, Rs * .9, hx, hy + H * .5, hz, 3, 16000); const st = PS_ST, sz = PS_S;
    const heat = a < 1.6 ? .7 * (1 - a / 1.6) : 0, cw = Math.min(1, .3 + a / 6);
    if (al > .01) for (let i = 0; i < NSU; i += st) {
      const o = i * 8, dep = SUR[o + 1], hq = SUR[o + 2], th = SUR[o];
      const rr = Rs * (1 - .5 * dep * cw), roll = 1 - .55 * dep;
      const top = H * roll * SUR[o + 7] * (.8 + .2 * fs(th * 31 + a * .4));
      const ct = SUR[o + 5], st_ = SUR[o + 6];
      const y = gP(rr, th) + 1 + top * hq;
      // the top and the outer face catch the light
      const nl = (ct * SUNL[0] + st_ * SUNL[2]) * (1 - hq * .5) + SUNL[1] * hq;
      const lit = .16 + .84 * (nl > 0 ? nl : 0) * (.65 + .35 * hq);
      const b = al * (.6 + .55 * SUR[o + 4]) * (1 - .4 * dep);
      if (dep < .1 && a < 5) dotW(hx + ct * rr, y, hz + st_ * rr, 1, a < 1.4 ? HOT : DUST, b * 1.3);
      else dotL(hx + ct * rr, y, hz + st_ * rr, lut(heat * (1 - dep), lit), b, sz);
    }
  }
}
function sEject(a, vis, hx, hy, hz) {
  // the ejecta curtain (ballistic, two-dot streaks) and tumbling blocks
  if (a < 22) {
    for (let i = 0; i < NEJ; i++) {
      const o = i * 7, t = a - EJ[o + 4]; if (t < 0) continue;
      const vx = EJ[o], vy = EJ[o + 1], vz = EJ[o + 2], drag = 1 / (1 + t * .3 * (.5 + EJ[o + 3]));
      const x0 = hx + EJ[o + 5], z0 = hz + EJ[o + 6];
      const x = x0 + vx * t * drag, z = z0 + vz * t * drag, y = hy + vy * t * drag - 4.905 * t * t;
      if (y < hy + 40) { const dx = x - hx, dz = z - hz, rr = Math.sqrt(dx * dx + dz * dz); if (rr > 200 ? y < gP(rr, Math.atan2(dz, dx)) : y < hy) continue; }
      const heat = Math.exp(-t * 1.1), b = vis * (.45 + .55 * EJ[o + 3]) * Math.min(1, 1.8 - t / 12);
      dotW(x, y, z, heat > .55 ? 2 : 1, heat > .35 ? HOT : heat > .12 ? FIRE : DUST, b);
      if (t > .1) { const t2 = t - .07, d2 = 1 / (1 + t2 * .3 * (.5 + EJ[o + 3])); dotW(x0 + vx * t2 * d2, hy + vy * t2 * d2 - 4.905 * t2 * t2, z0 + vz * t2 * d2, 1, heat > .3 ? FIRE : GREY, b * .55); }
    }
    for (let i = 0; i < NCK; i++) {
      const o = i * 10, t = a - CHK[o + 7] * .25; if (t < 0) continue;
      const drag = 1 / (1 + t * .12), x = hx + CHK[o + 8] + CHK[o] * t * drag, z = hz + CHK[o + 9] + CHK[o + 2] * t * drag;
      const gy = gPc(Math.hypot(x - hx, z - hz), Math.atan2(z - hz, x - hx)), yy = hy + CHK[o + 1] * t * drag - 4.905 * t * t;
      const landed = yy < gy + CHK[o + 3] * .5, y = landed ? gy + CHK[o + 3] * .4 : yy;
      const sz = CHK[o + 3], ang = CHK[o + 4] + (landed ? 0 : CHK[o + 5] * t), ca = Math.cos(ang), sa = Math.sin(ang);
      const heat = Math.exp(-t * .8), b = vis * (.55 + .45 * CHK[o + 6]) * (landed ? .7 : 1);
      for (let k = 0; k < 24; k++) { const q = k * 3, px = CKP[q] * ca - CKP[q + 1] * sa, py = CKP[q] * sa + CKP[q + 1] * ca; dotW(x + px * sz, y + py * sz, z + CKP[q + 2] * sz, 1, heat > .4 ? FIRE : k % 3 ? GREY : DUST, b); }
    }
  }
}
/* the crater drawn over the land so it reads from far away: the rim crest (two bright rings), the bowl shaded by its
   own slopes with the floor glowing, and the ejecta rays as streaks of bright dust over the scorched blanket */
const NCB = 5000, CBW = (() => { const r = rng(7979), A = new Float32Array(NCB * 3); for (let i = 0; i < NCB; i++) { A[i * 3] = Math.sqrt(r()); A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = r(); } return A; })();
const NRY = 9000, RYP = (() => { const r = rng(8989), A = new Float32Array(NRY * 3); for (let i = 0; i < NRY; i++) { A[i * 3] = r(); A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = r(); } return A; })();
function sCrater(a, vis, hx, hy, hz) {
  const g = W.craterG(a); if (g <= 0) return;
  { const dh = Math.hypot(hx - ex, hz - ez), dep = (ey - hy) / Math.max(1, dh); vis *= ss(.02, .12, dep) * (1 - .85 * pedA(a)); if (vis < .02) return; }
  const CR = W.CRA, R0 = CR.R, SUN = W.SUN, RAY = W.RAY, RN = W.RAYN, RL = CR.RL;
  const dc = Math.max(1, Math.hypot(hx - ex, hy - ey, hz - ez)), ppm = FL / dc;
  const hot = Math.min(1, 1.25 * Math.exp(-a / 70)) * g, al = vis * (.35 + .65 * ss(0, .6, a));
  // the bowl: dots on the deformed surface, lit from its slope, the floor hot
  const nb = Math.min(NCB, Math.max(300, Math.round(R0 * R0 * ppm * ppm * 1.2)));
  for (let i = 0; i < nb; i++) {
    const o = i * 3, u = CBW[o] * 1.05, th = CBW[o + 1], d = u * R0, ct = fc(th), st_ = fs(th);
    const y = hy + W.craterDy(d) * g, sl = W.craterSl(d) * g, nl = 1 / Math.sqrt(1 + sl * sl);
    const lam = (-sl * ct * SUN[0] + SUN[1] - sl * st_ * SUN[2]) * nl, lit = .1 + .8 * (lam > 0 ? lam : 0);
    const h = u < .92 ? hot * (1 - u * u / .85) : 0;
    dotL(hx + ct * d, y + .3, hz + st_ * d, lut(h * (.8 + .2 * CBW[o + 2]), lit), al * (.55 + .45 * CBW[o + 2]) * (.6 + .5 * Math.max(h, lit)), 1);
  }
  // the rim crest: bright rings, hot while the floor glows
  const nr = Math.min(2400, Math.max(120, Math.round(TAU * R0 * ppm / 1.3)));
  for (let ring = 0; ring < 2; ring++) {
    const rr = R0 * (ring ? 1.07 : 1), yr = hy + W.craterDy(rr) * g + .6;
    for (let k = 0; k < nr; k++) {
      const th = (k + .5 * ring) / nr * TAU, j = 1 + .03 * fs(th * 9) + .02 * fs(th * 23 + 1), ct = fc(th), st_ = fs(th);
      const lit = .45 + .55 * Math.max(0, ct * SUN[0] + st_ * SUN[2] + .3);
      dotL(hx + ct * rr * j, yr, hz + st_ * rr * j, lut(hot * .7 * (ring ? .4 : 1), lit), al * (ring ? .55 : .9), 1);
    }
  }
  // the rays: streaks of bright ejecta from the rim out over the blanket, along the land's own rays
  const nry = Math.min(NRY, Math.max(900, Math.round(R0 * R0 * 8 * ppm * ppm * .6)));
  for (let i = 0; i < nry; i++) {
    const o = i * 3; let th = RYP[o + 1]; const k = (th * (RN / TAU)) | 0, ry = RAY[k & (RN - 1)]; if (ry < .25) continue;
    const L = RL[k & (RN - 1)], u = 1 + (L - 1) * Math.pow(RYP[o], 1.6), d = u * R0 * (.5 + .5 * g);
    th += (RYP[o + 2] - .5) * .012;
    const ct = fc(th), st_ = fs(th), y = W.gPc(d, th) + .4;
    const b = Math.min(1, 1.35 * al * ry * (1 - (u - 1) / (L - 1 + .01)) * (.5 + .5 * RYP[o + 2]));
    dotL(hx + ct * d, y, hz + st_ * d, lut(hot * .5 * Math.exp(-(u - 1) * 2), .75 + .25 * RYP[o + 2]), b, 1);
  }
}
/* ================= the mushroom =================
   Notes from reference photos and film (saved in "photos i the user have saved for research/explosions", see its
   SOURCES.md): Upshot-Knothole Grable (colour still and film), Castle Bravo and Romeo, Ivy Mike, Teapot from the air,
   the Tumbler-Snapper formation strip, Minor Scale, Sailor Hat, Crossroads Baker, Raikoke from the ISS, pyrocumulus.
   - The fireball rises fast and within seconds flattens into a ring vortex: hot gas climbs the middle, rolls out over
     the top and back in under the rim. In the Grable film the roll is a glowing ring of fire inside a darker crust.
   - The cap's skin is cauliflower at three or more scales (lobes of lumps of knobs). Early it is a ball, then as tall
     as it is wide, later wider and flatter as it slows; the biggest overshoot into a tower or spread into an anvil.
   - Light: a hard sun. The sunlit top and side are bright with crisp edges, each lump lit on its own sunward side, deep
     shadow between lumps and on the far side; the underside is dark. The core glows orange through the underside and
     the gaps for the first tens of seconds, then the cloud cools to brown and grey dust.
   - The stem is a narrow twisting column of dust drawn up from the ground (about a quarter of the cap's width), lumpy
     along its length, flaring into a neck under the cap and into the dust at its foot; knots and collars form on it.
   - Condensation: a smooth white dome with a flared skirt in the first second (Sailor Hat Charlie); later thin bright
     collars and skirts round the stem and under the cap where the column punches through moist layers (Bravo,
     Romeo, Raikoke). Smooth, not lumpy, and wider than the stem; they flash in and burn off.
   - At the foot a wide low pedestal of billowing dust (Grable), seen from above as a dark disc (Teapot), with the base
     surge rolling out over the ground (Baker). Conventional blasts (Minor Scale, range bombs) are all lumps and no stem.
   Built as precomputed billow clouds in canonical frames (the cap in the torus' own frame, the stem on a unit
   cylinder, the pedestal on a flat ring): billows on billows on billows, points on their skins, normals blended over
   the scales. Each frame the cap's cross-section rolls about the tube's core, the lumps boil, the stem scrolls up and
   twists; each dot is lit by its own lump and by the big shape's self-shadow, the hot core glowing from inside early.
   Any prefix of each set is an even subset: the dot count follows the size on screen. */
/* sizes (m) and heights over a (sim s): the cap's outer radius, its ring (major) and tube radii, its centre height */
const capR = a => a <= 0 ? 0 : 70 + 430 * (1 - Math.exp(-a * 2.2)) + 1350 * (1 - Math.exp(-a / 16));
const capMaj = a => capR(a) * .56 * ss(.8, 7, a);
const capTub = a => capR(a) * (.9 - .42 * ss(.8, 7, a));
const capSq = a => 1 - .3 * ss(2, 14, a);
const capH = a => a <= 0 ? 0 : Math.min(250 + 4300 * (1 - Math.exp(-a / 20)), capR(a) * .72 + 48 * a * a);
const capRoll = a => a * .3 / (1 + a * .03);
const fbR = a => capR(a);
const fbY = a => capH(a);
/* the stem's top, its radius at height fraction u (0 foot .. 1 under the cap) */
const stemTop = a => capH(a) - capTub(a) * capSq(a) * .55;
const stemR = (u, a) => { const R_ = capR(a), w1 = 1 - u, w2 = w1 * w1, u2 = u * u; return R_ * (.15 + .3 * w2 * w2 * w2 + .24 * u2 * u2 * u2); };
/* the dust pedestal's strength (it settles before the crater view) and its ring */
const pedA = a => ss(1.2, 3.5, a) * (1 - ss(24, 33, a));
const CS = 9;
/* billows on billows: big lumps on a skin, medium lumps on their outer side, small knobs on those; points on the knobs.
   Writes into P: [key, u, v, w, nu, nv, nw, depth, phase] (u v w in the frame's units; key = the big lump's angle) */
function billowCloud(seed, NB, centre, sizes, counts, P, keyDepth) {
  const r = rng(seed), D1 = [0, 0, 0], D2 = [0, 0, 0], D3 = [0, 0, 0], C = [0, 0, 0, 0, 0, 0];
  const hemi = (ox, oy, oz, lo, o) => { for (let k = 0; k < 24; k++) { const z = r() * 2 - 1, t = r() * TAU, h = Math.sqrt(1 - z * z), x = Math.cos(t) * h, y = z, w = Math.sin(t) * h; if (x * ox + y * oy + w * oz >= lo) { o[0] = x; o[1] = y; o[2] = w; return o; } } o[0] = ox; o[1] = oy; o[2] = oz; return o; };
  for (let b = 0; b < NB; b++) {
    centre(r, b, C);                                    // C: key, cu, cv, (ou, ov) outward in the u-v plane
    const key = C[0], cu = C[1], cv = C[2], ou = C[3], ov = C[4], b1 = sizes[0] * (.75 + .5 * r()), p1 = r();
    const dep = keyDepth ? () => C[5] : (u, v) => Math.max(0, 1 - Math.hypot(u, v));
    for (let k = 0; k < counts[0]; k++) { hemi(ou, ov, 0, -.25, D1); const q = .9 + .1 * r(), u = cu + D1[0] * b1 * q, v = cv + D1[1] * b1 * q; P.push(key, u, v, D1[2] * b1 * q, D1[0], D1[1], D1[2], dep(u, v), p1); }
    for (let m = 0; m < counts[1]; m++) {
      hemi(ou, ov, 0, .0, D1);
      const mu = cu + D1[0] * b1 * .86, mv = cv + D1[1] * b1 * .86, mw = D1[2] * b1 * .86, b2 = b1 * sizes[1] * (.8 + .4 * r()), p2 = r();
      for (let k = 0; k < counts[2]; k++) { hemi(D1[0], D1[1], D1[2], -.15, D2); const u = mu + D2[0] * b2, v = mv + D2[1] * b2, nx = .55 * D2[0] + .45 * D1[0], ny = .55 * D2[1] + .45 * D1[1], nz = .55 * D2[2] + .45 * D1[2], nl = 1 / Math.hypot(nx, ny, nz); P.push(key, u, v, mw + D2[2] * b2, nx * nl, ny * nl, nz * nl, dep(u, v), p2); }
      for (let s = 0; s < counts[3]; s++) {
        hemi(D1[0], D1[1], D1[2], .1, D2);
        const su = mu + D2[0] * b2 * .88, sv = mv + D2[1] * b2 * .88, sw = mw + D2[2] * b2 * .88, b3 = b2 * sizes[2] * (.8 + .4 * r()), p3 = r();
        for (let k = 0; k < counts[4]; k++) {
          hemi(D2[0], D2[1], D2[2], -.3, D3); const q = .88 + .12 * r(), u = su + D3[0] * b3 * q, v = sv + D3[1] * b3 * q;
          const nx = .45 * D3[0] + .33 * D2[0] + .22 * D1[0], ny = .45 * D3[1] + .33 * D2[1] + .22 * D1[1], nz = .45 * D3[2] + .33 * D2[2] + .22 * D1[2], nl = 1 / Math.hypot(nx, ny, nz);
          P.push(key, u, v, sw + D3[2] * b3 * q, nx * nl, ny * nl, nz * nl, dep(u, v), p3);
        }
      }
    }
  }
  // shuffle (so any prefix is an even subset), into a typed array
  const n = P.length / CS, A = new Float32Array(P.length), idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  for (let i = 0; i < n; i++) for (let q = 0; q < CS; q++) A[i * CS + q] = P[idx[i] * CS + q];
  return A;
}
/* the cap: big lumps on the torus' skin (a few inside: the turbulence round the core); u v in units of the tube radius */
const CAPC = billowCloud(9191, 170, (r, b, C) => { const inner = b >= 150, th = r() * TAU, ph = r() * TAU, rb = inner ? .15 + .5 * r() : .8 + .14 * r(); C[0] = th; C[1] = Math.cos(ph) * rb; C[2] = Math.sin(ph) * rb; C[3] = Math.cos(ph); C[4] = Math.sin(ph); }, [.3, .4, .42], [16, 8, 9, 5, 30], []);
const NCAPC = CAPC.length / CS;
/* packed for the per-frame pass: cos, sin of the lump's angle, u v w, normal, depth, a boil phase (0..63), 1 / |u v| */
const CK = 11;
function pack(A) { const n = A.length / CS, O = new Float32Array(n * CK); for (let i = 0; i < n; i++) { const o = i * CS, q = i * CK, u = A[o + 1], v = A[o + 2]; O[q] = Math.cos(A[o]); O[q + 1] = Math.sin(A[o]); O[q + 2] = u; O[q + 3] = v; O[q + 4] = A[o + 3]; O[q + 5] = A[o + 4]; O[q + 6] = A[o + 5]; O[q + 7] = A[o + 6]; O[q + 8] = A[o + 7]; O[q + 9] = (A[o + 8] * 64) | 0; O[q + 10] = 1 / Math.sqrt(u * u + v * v + 1e-4); } return O; }
const CAPK = pack(CAPC);
const BO = new Float32Array(64);
/* the stem: lumps on a unit cylinder (key = angle round it; u out from its skin, v up, w along the skin; units of the
   local radius; the lump's height fraction in the phase slot's place is the 'depth' slot) */
const STC = billowCloud(9292, 240, (r, b, C) => { C[0] = r() * TAU; C[1] = .82 + .1 * r(); C[2] = 0; C[3] = 1; C[4] = 0; C[5] = (b + r()) / 240; }, [.36, .45, .45], [12, 6, 10, 3, 16], [], true);
const NSTC = STC.length / CS;
/* the pedestal: lumps on a flat ring of dust round the foot (as the cap, units of its tube radius) */
const PDC = billowCloud(9393, 110, (r, b, C) => { const th = r() * TAU, ph = r() * PI, rb = .78 + .2 * r(); C[0] = th; C[1] = Math.cos(ph) * rb; C[2] = Math.sin(ph) * rb; C[3] = Math.cos(ph); C[4] = Math.sin(ph); }, [.34, .42, .45], [12, 6, 10, 3, 16], []);
const NPDC = PDC.length / CS, PDK = pack(PDC);
if (window.ORW_LOG) window.ORW_LOG.push('mushroom clouds ' + NCAPC + ' / ' + NSTC + ' / ' + NPDC);
/* dot budgets per frame (the counts follow the size on screen up to these) */
const B_CAP = 80000, B_STEM = 24000, B_PED = 18000;
const S0 = SUNL[0], S1 = SUNL[1], S2 = SUNL[2];
/* the count of a set to draw for a disc of radius R_ (m) at (x, y, z): about one dot per k px^2, capped */
function setN(N, R_, x, y, z, k, cap) {
  const d = Math.max(1, Math.hypot(x - ex, y - ey, z - ez) - R_ * .4), rpx = R_ * FL / d, area = 3.1416 * rpx * rpx;
  const n = Math.min(N, cap, Math.round(area / k)); PS_S = area / Math.max(1, n) > 6 ? 2 : 1; return n;
}
/* the cap (the fireball at first): rolling, boiling, lit lump by lump, the core glowing through */
function sCap(a, vis, hx, hy, hz) {
  if (a <= 0) return;
  const R_ = capR(a), maj = capMaj(a), tub = capTub(a), sq = capSq(a), Hc = capH(a), roll = -capRoll(a), cr = Math.cos(roll), sr = Math.sin(roll);
  const al = vis * Math.min(1, a * 6) * (1 - ss(90, 110, a));
  const n = setN(NCAPC, R_ * 1.05, hx, hy + Hc, hz, 1.5, B_CAP), sz = PS_S;
  // heat: white-hot at first, the core glowing through the underside for tens of seconds
  const hAll = Math.exp(-a * 1.1), hCore = Math.exp(-a / 11), boil = .05 + .05 * (1 - ss(5, 30, a)), bt = a * 1.3;
  const C = CAPK, hyc = hy + Hc, ts = tub * sq, LLm = LL - 1, LHm = LH - 1, u0_ = u0, u1_ = u1, u2_ = u2;
  for (let k = 0; k < 64; k++) BO[k] = 1 + boil * SNT[(((k / 64 + bt / TAU) * 4096) | 0) & 4095];
  const big = sz > 1;
  for (let i = 0; i < n; i++) {
    const o = i * CK, ct = C[o], st_ = C[o + 1], u0 = C[o + 2], v0 = C[o + 3], bo = BO[C[o + 9]];
    const u = (u0 * cr - v0 * sr) * bo, v = (u0 * sr + v0 * cr) * bo, w = C[o + 4] * bo * tub, rad = maj + u * tub;
    const dx = hx + ct * rad - st_ * w - ex, dy = hyc + v * ts - ey, dz = hz + st_ * rad + ct * w - ez;
    const zc = dx * f0 + dy * f1 + dz * f2; if (zc < NR) continue;
    const iz = FL / zc, sx = CX + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW - 1) continue;
    const sy = CY - (dx * u0_ + dy * u1_ + dz * u2_) * iz; if (sy < 0 || sy >= BH - 1) continue;
    const nu0 = C[o + 5], nv0 = C[o + 6], nw = C[o + 7], dep = C[o + 8], nu = nu0 * cr - nv0 * sr, nv = nu0 * sr + nv0 * cr;
    // the lump's own light, times how much of the big shape stands between it and the sun
    const lam = (ct * nu - st_ * nw) * S0 + nv * S1 + (st_ * nu + ct * nw) * S2;
    const ir = C[o + 10], tsun = ((ct * S0 + st_ * S2) * (u0 * cr - v0 * sr) + (u0 * sr + v0 * cr) * S1) * ir;
    const vis_ = (tsun < -.35 ? 0 : tsun > .3 ? 1 : (tsun + .35) * 1.538) * (1 - .6 * dep);
    const lit = .05 + .08 * (nv + 1) + 1.05 * (lam > 0 ? lam : 0) * vis_;
    let heat = hAll * (1.1 - .3 * dep);
    const hc = hCore * (dep * 1.2 + (v < 0 ? -v * .55 : 0)) * (1 - vis_ * .5); if (hc > heat) heat = hc;
    const li = ((heat <= 0 ? 0 : heat >= 1 ? LHm : (heat * LHm + .5) | 0) * LL + (lit <= 0 ? 0 : lit >= 1 ? LLm : (lit * LLm + .5) | 0)) * 3;
    let ab = al * (.72 + .3 * (1 - dep)); if (ab > 1) ab = 1;
    const cg = LUT[li + 1] * ab, pk = 0xff000000 | ((LUT[li + 2] * ab) << 16) | (cg << 8) | (LUT[li] * ab);
    let p = (sy | 0) * BW + (sx | 0);
    if (DD[(p << 2) + 1] < cg) U32[p] = pk;
    if (big) { p++; if (DD[(p << 2) + 1] < cg) U32[p] = pk; p += BW; if (DD[(p << 2) + 1] < cg) U32[p] = pk; p--; if (DD[(p << 2) + 1] < cg) U32[p] = pk; }
  }
}
/* the stem: lumps on a twisting column scrolling up into the cap; narrow waist, a neck under the cap, the foot in the dust */
function sStem(a, vis, hx, hy, hz) {
  if (a < .9) return;
  const top = stemTop(a), R_ = capR(a), al = vis * ss(.9, 3, a) * (1 - ss(85, 105, a));
  const uc = .22 * ss(28, 40, a), lf = .75 - .6 * ss(24, 33, a);           // late on the column thins and lifts off the ground
  const n = setN(NSTC, Math.sqrt(Math.max(1, top) * R_ * .45), hx, hy + top * .5, hz, 1.8, B_STEM), sz = PS_S;
  const hot0 = Math.exp(-a / 5) * .9, C = STC, rise = a * .028;
  for (let i = 0; i < n; i++) {
    const o = i * CS; let h = C[o + 7] + rise; h -= Math.floor(h);
    const fade = ss(uc, uc + .06, h) * (1 - ss(.93, 1, h)) * (lf + (1 - lf) * ss(uc + .02, uc + .25, h)); if (fade < .02) continue;
    const Rs = stemR(h, a), th = C[o] + a * .22 * (1 - h) + .4 * h, ct = fc(th), st_ = fs(th);
    const rr = Rs * C[o + 1], w = C[o + 3] * Rs, y = hy + h * top + C[o + 2] * Rs;
    const x = hx + ct * rr - st_ * w, z = hz + st_ * rr + ct * w;
    const nu = C[o + 4], nv = C[o + 5], nw = C[o + 6];
    const lam = (ct * nu - st_ * nw) * S0 + nv * S1 + (st_ * nu + ct * nw) * S2, cyl = ct * S0 + st_ * S2;
    const vis_ = (cyl < -.3 ? 0 : cyl > .35 ? 1 : (cyl + .3) / .65) * (1 - .62 * ss(.62, .95, h));
    const lit = .05 + .06 * (nv + 1) + .95 * (lam > 0 ? lam : 0) * vis_;
    dotL(x, y, z, lut(hot0 * (1 - h * .6), lit), al * fade * (.75 + .25 * C[o + 8]), sz);
  }
}
/* the pedestal: a ring of billowing dust round the foot, rolling out and settling */
function sPedestal(a, vis, hx, hy, hz) {
  const ap = vis * pedA(a); if (ap < .02) return;
  const R_ = capR(a), Rp = R_ * .45 + 120 + 30 * a, tub = R_ * .26 + 50, sq = .55, roll = -a * .08, cr = Math.cos(roll), sr = Math.sin(roll);
  const n = setN(NPDC, Rp + tub, hx, hy + tub * .4, hz, 2, B_PED), sz = PS_S, C = PDK, hot0 = Math.exp(-a / 4) * .7, ts = tub * sq;
  for (let i = 0; i < n; i++) {
    const o = i * CK, ct = C[o], st_ = C[o + 1], u0 = C[o + 2], v0 = C[o + 3];
    const u = u0 * cr - v0 * sr, v = u0 * sr + v0 * cr, yy = v * ts + ts * .55; if (yy < -2) continue;
    const w = C[o + 4] * tub, rad = Rp + u * tub;
    const nu0 = C[o + 5], nv0 = C[o + 6], nw = C[o + 7], dep = C[o + 8], nu = nu0 * cr - nv0 * sr, nv = nu0 * sr + nv0 * cr;
    const lam = (ct * nu - st_ * nw) * S0 + nv * S1 + (st_ * nu + ct * nw) * S2;
    const tsun = ((ct * S0 + st_ * S2) * u + v * S1) * C[o + 10], vis_ = tsun < -.35 ? 0 : tsun > .3 ? 1 : (tsun + .35) * 1.538;
    const lit = .05 + .07 * (nv + 1) + (lam > 0 ? lam : 0) * vis_ * (1 - .5 * dep);
    dotL(hx + ct * rad - st_ * w, hy + yy, hz + st_ * rad + ct * w, lut(hot0 * (1 - u * .3), lit), ap * (.85 - .3 * dep), sz);
  }
}
/* condensation: smooth bright collars round the stem and a skirt flaring under the cap, flashing in and burning off */
const NSK = 8000, SKT = (() => { const r = rng(7878), A = new Float32Array(NSK * 3); for (let i = 0; i < NSK; i++) { A[i * 3] = r() * TAU; A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = Math.pow(r(), .5); } return A; })();
function sCond(a, vis, hx, hy, hz) {
  if (a < 3.5 || a > 60) return;
  const top = stemTop(a), R_ = capR(a), Hc = capH(a), tub = capTub(a), maj = capMaj(a), sq = capSq(a);
  const n = setN(NSK, R_, hx, hy + Hc * .6, hz, 3, NSK);
  for (let ring = 0; ring < 2; ring++) {
    const a0 = ring ? 7 : 4.5, alr = vis * ss(a0, a0 + 2.5, a) * (1 - ss(a0 + 14, a0 + 30, a)) * .8; if (alr < .02) continue;
    // a thin flat disc of condensation round the column, soft at its rim, a little dished
    const ur = ring ? .7 : .46, yr = hy + top * ur, ri = stemR(ur, a) * .95, ro = stemR(ur, a) * (ring ? 2.4 : 3.1) * (1 + .3 * ss(a0, a0 + 20, a));
    for (let i = ring; i < n; i += 2) {
      const o = i * 3, th = SKT[o] + a * .01 * (ring ? -1 : 1), q = SKT[o + 2], ct = fc(th), st_ = fs(th);
      const edge = ro * (1 + .07 * fs(th * 7 + ring * 2) + .04 * fs(th * 17 + 1)), rr = ri + (edge - ri) * q;
      const yy = yr + (rr - ri) * .06 + (SKT[o + 1] - 3.14) * .004 * ro, fall = 1 - q * q * q;
      const lit = .55 + .45 * Math.max(0, S1 + .3 * (ct * S0 + st_ * S2));
      dotP(hx + ct * rr, yy, hz + st_ * rr, 244 * lit, 246 * lit, 240 * lit, alr * fall * (.5 + .3 * fs(th * 3 + q * 9)));
    }
  }
  // the skirt: a thin bell hanging from under the cap's rim
  const als = vis * ss(6, 10, a) * (1 - ss(26, 44, a)) * .55;
  if (als > .02) for (let i = 0; i < n; i++) {
    const o = i * 3, v = SKT[o + 2], th = SKT[o] - a * .008;
    const y = hy + Hc - tub * sq * .45 - v * Hc * .22, rr = (maj + tub * .55) * (.82 + .35 * Math.pow(v, .7)) * (1 + .03 * fs(th * 9 + v * 4));
    const lit = .5 + .5 * Math.max(0, fc(th) * S0 + fs(th) * S2);
    dotP(hx + fc(th) * rr, y, hz + fs(th) * rr, 240 * lit, 242 * lit, 236 * lit, als * 4 * v * (1 - v) * (.5 + .5 * fs(th * 5 + 1.7)));
  }
}
/* the cloud's shadow on the land (for the world's ground pass): the cap's disc and the stem's strip, cast away from the sun */
function cloudShadow(a) {
  const S = W.CSH; if (!S) return;
  if (a < 2 || a > 110) { S.k = 0; return; }
  const Hc = capH(a), R_ = capR(a), kx = -S0 / S1, kz = -S2 / S1;
  S.x = HIT[0] + kx * Hc; S.z = HIT[2] + kz * Hc; S.r = (capMaj(a) + capTub(a) * .8); S.sx = HIT[0]; S.sz = HIT[2]; S.sw = stemR(.5, a) * 1.1;
  S.k = .62 * ss(2, 8, a) * (1 - ss(90, 110, a));
}
function strike(a, vis) {
  cam();
  if (a < 0) return;
  vis = vis === undefined ? 1 : vis;
  const hx = HIT[0], hy = HIT[1], hz = HIT[2];
  sGlow(a, vis, hx, hy, hz); if (PT) PT.lap(0);
  sPlasma(a, vis, hx, hy, hz); sShock(a, vis, hx, hy, hz); sLayers(a, vis, hx, hy, hz); if (PT) PT.lap(1);
  sFoot(a, vis, hx, hy, hz); sCrater(a, vis, hx, hy, hz); if (PT) PT.lap(2);
  sSurge(a, vis, hx, hy, hz); if (PT) PT.lap(3);
  sEject(a, vis, hx, hy, hz); if (PT) PT.lap(4);
  sPedestal(a, vis, hx, hy, hz); if (PT) PT.lap(5);
  sStem(a, vis, hx, hy, hz); if (PT) PT.lap(6);
  sCap(a, vis, hx, hy, hz); if (PT) PT.lap(7);
  sCond(a, vis, hx, hy, hz); if (PT) PT.lap(8);
  vehicles(a, vis); if (PT) PT.lap(9);
}
/* the white-out: overlay alpha */
const flashA = a => a < 0 ? 0 : a < .02 ? .95 : .95 * Math.exp(-(a - .02) * 9);
/* the vehicles are handled in strike() (tossed and torn apart); kept for the film's call */
function debris(p, t, vis) { }

/* ================= the camera of the fall and the strike =================
   cam(T, FC) -> a shot for base time T, or null for the film's own camera. FC: the fall's constants and helpers
   (TX, TI, T_RET, TF, rodAt, altOf, aOf, DIRP, SIDE, UPD, HIT, CE, MZ0, SAT, camBase...), checked on every call (the
   timeline may change: the shots are rebuilt). Called first in each frame, so it also sets the strike's state for the
   world (the crater, the forest, the cloud's shadow).

   Every shot carries an explicit up vector (turned into the film camera's roll), so there are no roll flips; blends
   turn the look about an axis (never a lerp of near-opposite directions), ease with a smoothstep (peak 1.5x the mean
   rate) and last 3 s or more; the look turns at most about 40 deg/s.
     exit     beside the round as it leaves the muzzle (x1/20), handed over from the film's camera, then riding with
              the rod as it speeds up, falling in behind it and looking down the path at the Earth
     coast    a slow orbit round the rod to its front quarter as the Earth comes up (the vacuum, x9)
     entry    beside and ahead of the rod while the sheath forms and the trail thickens
     incoming the lens drops away from the rod to the forest floor 1.5 km from the target (3 s), the rod kept in view,
              then eases onto a still frame from the floor in front of the lens up through the crowns, the target on
              the horizon; the streak enters it from the top and crosses it (the flash throws the trunks' shadows
              across the floor toward the lens)
     strike   held through the flash and the plasma dome; a turn and a crane (3.5 s) to a frame 5 m up in the stand,
              26 m nearer the strike, 62 deg off it (the world's BEAT), as the shock layers come over the forest; the
              slow-motion beat (x1/20) as the front's lime layer and its wall of dust sweep through the trees toward the
              lens and tear them apart, a slow push in; a crane up out of the flattened stand, an aerial arc round the
              cloud, then the crater from 1.3 km out and 0.8 km up, looking down 32 deg toward the platform's side;
              that is the last frame (REST): the film's climb takes off from it at T_RET - 0.1 with no blend
   Measured every 0.1 s from the hand-in to T_RET + 4 s: the look turns at most 38 deg/s (the ride at T_ON + 4, and
   the film's climb after T_RET) */
const kk = (T, a, b) => E.ss(a, b, T);
const Y_ = [0, 1, 0];
/* a unit vector made perpendicular to f */
function orth(f, up) { const d = up[0] * f[0] + up[1] * f[1] + up[2] * f[2], x = up[0] - f[0] * d, y = up[1] - f[1] * d, z = up[2] - f[2] * d, l = Math.hypot(x, y, z); return l < 1e-9 ? null : [x / l, y / l, z / l]; }
/* slerp of unit vectors */
function slerpV(a, b, w) { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; d = d > 1 ? 1 : d < -1 ? -1 : d; const th = Math.acos(d); if (th < 1e-6) return a.slice(); const s = Math.sin(th), ka = Math.sin((1 - w) * th) / s, kb = Math.sin(w * th) / s; return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]; }
/* blend two shots: the eye straight (or about an anchor P: direction slerped, distance log-mixed), the look slerped,
   the up mixed and made perpendicular again */
function mixS(A, B, w, P) {
  if (w <= 0) return A; if (w >= 1) return B;
  let eye;
  if (P) { const da = V.sub(A.eye, P), db = V.sub(B.eye, P), la = Math.max(1e-3, V.len(da)), lb = Math.max(1e-3, V.len(db)); eye = V.mad(P, slerpV(V.mul(da, 1 / la), V.mul(db, 1 / lb), w), K.logMix(la, lb, w)); }
  else eye = V.lerp(A.eye, B.eye, w);
  const f = slerpV(A.f, B.f, w);
  return { eye, f, up: orth(f, V.lerp(A.up, B.up, w)) || A.up, fov: A.fov + (B.fov - A.fov) * w };
}
/* to the film's form: the roll that turns the camera's own frame (built from world +Y) onto the shot's up */
function outS(s) {
  const f = s.f, r = V.norm(V.cross(Y_, f)), u = V.cross(f, r);
  return { eye: s.eye, target: V.mad(s.eye, f, 1000), fov: s.fov, roll: Math.atan2(-V.dot(s.up, r), V.dot(s.up, u)) };
}
/* a scalar key track (cubic Hermite, Catmull-Rom tangents, flat at the ends) */
function track(keys) {
  const n = keys.length, M = keys.map((k, i) => i === 0 || i === n - 1 ? 0 : (keys[i + 1][1] - keys[i - 1][1]) / (keys[i + 1][0] - keys[i - 1][0]));
  return t => {
    if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (keys[i + 1][0] < t) i++;
    const a = keys[i], b = keys[i + 1], dt = b[0] - a[0], u = (t - a[0]) / dt, u2 = u * u, u3 = u2 * u;
    return a[1] * (2 * u3 - 3 * u2 + 1) + M[i] * dt * (u3 - 2 * u2 + u) + b[1] * (-2 * u3 + 3 * u2) + M[i + 1] * dt * (u3 - u2);
  };
}
/* a key path for the strike (cubic Hermite through eye and target keys; stop keys have zero velocity) */
function mkPath(keys) {
  const n = keys.length;
  const tan = (i, fld) => { if (i === 0 || i === n - 1 || keys[i].stop) return fld === 'fov' ? 0 : [0, 0, 0]; const a = keys[i - 1], b = keys[i + 1], dt = b.t - a.t; return fld === 'fov' ? (b.fov - a.fov) / dt : V.mul(V.sub(b[fld], a[fld]), 1 / dt); };
  const Mt = keys.map((k, i) => ({ eye: tan(i, 'eye'), target: tan(i, 'target'), fov: tan(i, 'fov') }));
  const Hm = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + m1 * dt * (u3 - u2); };
  return T => {
    let i = 0; while (i < n - 2 && keys[i + 1].t <= T) i++;
    const a = keys[i], b = keys[i + 1], dt = b.t - a.t, u = E.clamp((T - a.t) / dt, 0, 1);
    const v3 = fld => [0, 1, 2].map(c => Hm(a[fld][c], b[fld][c], Mt[i][fld][c], Mt[i + 1][fld][c], u, dt));
    return { eye: v3('eye'), target: v3('target'), fov: Hm(a.fov, b.fov, Mt[i].fov, Mt[i + 1].fov, u, dt) };
  };
}
let CI = null, CI_K = '';
/* the round's centre: in the bore before the exit (its u^2 run down the barrel), then the rod's fall */
function roundAt(F, T) { if (T >= F.TX) return F.rodAt(T); const u = Math.max(0, (T - F.TF) / (F.TX - F.TF)); return V.mad(F.MZ0, F.DIRP, -125 * (F.TX - F.TF) * (1 - u * u)); }
function camInit(F) {
  const X0 = F.TX, TI = F.TI;
  const UPH = V.norm(V.sub(HIT, F.CE));
  const N_ = V.norm(V.sub(F.DIRP, V.mul(UPH, V.dot(F.DIRP, UPH))));
  let S_ = V.norm(V.cross(UPH, N_)); if (V.dot(S_, SUNL) < 0) S_ = V.mul(S_, -1);
  const at = (al, r, h) => V.add(HIT, V.add(V.mul(V.add(V.mul(N_, Math.cos(al)), V.mul(S_, Math.sin(al))), r), V.mul(UPH, h)));
  const up = h => V.mad(HIT, UPH, h);
  // the rod's frame: heading, the side the camera rides on (the sun's), up off the path
  const PX = V.sub(F.PW1([1, 0, 0]), F.PW1([0, 0, 0])), D = F.DIRP, SD = V.dot(F.SIDE, PX) <= 0 ? F.SIDE : V.mul(F.SIDE, -1), UD = V.norm(V.cross(V.cross(D, UPH), D));
  const UDs = V.dot(UD, UPH) < 0 ? V.mul(UD, -1) : UD;
  // the sim time a -> film time (bisection on the film's clock)
  const tOfA = av => { let lo = TI, hi = F.T_RET + 30; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (F.aOf(m) < av) lo = m; else hi = m; } return (lo + hi) / 2; };
  CI = { UPH, N_, S_, at, up, D, SD, UD: UDs, tOfA };
  // the ride's parameters over film time from the exit: azimuth from behind the rod toward its side (deg), elevation
  // (deg), distance (m), the look's lean from the rod toward the path ahead (0..1), the fov
  CI.R = t => t - X0;
  CI.AZ = track([[3.2, 29], [4.9, 30], [7.4, 66], [9.6, 116], [11.0, 134], [12.0, 140]]);
  CI.EL = track([[3.2, 14], [4.9, 22], [7.4, 13], [9.6, 0], [11.0, -6], [12.0, -8]]);
  CI.DS = track([[3.2, 22], [4.9, 80], [7.4, 120], [9.6, 160], [11.0, 200], [12.0, 230]]);
  CI.LA = track([[3.2, .45], [4.9, .72], [7.4, .55], [9.6, .16], [11.0, 0], [12.0, 0]]);
  CI.FV = track([[3.2, 50], [4.9, 52], [7.4, 50], [9.6, 48], [12.0, 48]]);
  // the ground camera: on the forest floor 1.5 km out (the world's G2, the hero stand round it), at eye height
  const Gc = V.mad(W.G2, UPH, 1.7);
  CI.Gc = Gc; CI.aG = arrive(Math.hypot(W.G2[0] - HIT[0], W.G2[2] - HIT[2])); CI.tG = tOfA(CI.aG);
  CI.alG = Math.atan2(V.dot(V.sub(W.G2, HIT), S_), V.dot(V.sub(W.G2, HIT), N_));
  // the incoming frame: still, from the target on the horizon (15 deg above the frame's foot, the forest floor below
  // it) up through the crowns; the rod's streak enters from the top about a second out
  // (the floor in front of the lens in its lower part, for the flash's shadows; the streak enters from the top)
  const hor = v => V.norm(V.sub(v, V.mul(UPH, V.dot(v, UPH)))), fR = V.norm(V.sub(F.rodAt(TI - 1.1), Gc)), fH = V.norm(V.sub(up(8), Gc));
  const hz_ = slerpV(hor(fR), hor(fH), .62), elI = Math.asin(V.dot(fH, UPH)) + 15 * DEG;
  CI.FIN = V.norm(V.add(V.mul(hz_, Math.cos(elI)), V.mul(UPH, Math.sin(elI)))); CI.FVIN = 64 * DEG;
  // the beat: 5 m up in the stand, 62 deg off the strike on the side away from the sun, 4 deg up, a slow push in
  const az = W.BEAT.az, hz = [Math.cos(az), 0, Math.sin(az)], hp = V.norm(V.sub(hz, V.mul(UPH, V.dot(hz, UPH))));
  CI.FB = V.norm(V.add(V.mul(hp, Math.cos(4 * DEG)), V.mul(UPH, Math.sin(4 * DEG))));
  CI.HB = hp; CI.Bc = W.BEAT.cam;
  CI.tTurn0 = tOfA(.75); CI.tTurn1 = Math.max(CI.tTurn0 + 3.4, tOfA(2.86) + .7);
  // the rise: from the beat's last frame (keyed on film time from the end of the slow motion to T_RET)
  CI.T_RISE = Math.max(CI.tTurn1 + 2, tOfA(3.3) - .1);
  CI.Tend = F.T_RET - .1;          // the film's climb takes off from the last frame (REST) at T_RET - 0.1: no blend needed
  const T0 = CI.T_RISE, DS = F.T_RET - .15 - T0, kt = fr => T0 + DS * fr, aT = fr => Math.max(0, F.aOf(kt(fr)));
  const k = (fr, eye, target, fov, stop) => ({ t: kt(fr), eye, target, fov: fov * DEG, stop });
  const B1 = shotBeat(F, T0), al = CI.alG;
  CI.SP = mkPath([
    k(0, B1.eye, V.mad(B1.eye, B1.f, 1500), B1.fov / DEG, true),
    k(.24, V.add(at(al - .02, 1560, 70), V.mul(hp, 40)), up(120 + capH(aT(.24)) * .3), 54),
    k(.48, at(al - .26, 2700, 640), up(capH(aT(.48)) * .48), 50),
    k(.74, at(.5, 3900, 1100), up(capH(aT(.74)) * .32), 46),
    k(1, at(.3, 1300, 820), up(0), 46, true),
  ]);
}
/* the ride with the rod (the exit, the speed-up, the coast, the entry) */
function shotRide(F, T) {
  const t = CI.R(T), p = roundAt(F, T), D = CI.D, S = CI.SD, U = CI.UD;
  const az = CI.AZ(t) * DEG, el = CI.EL(t) * DEG, d = CI.DS(t), la = CI.LA(t);
  const ce = Math.cos(el), o = V.add(V.mul(D, -ce * Math.cos(az) * d), V.add(V.mul(S, ce * Math.sin(az) * d), V.mul(U, Math.sin(el) * d)));
  const eye = V.add(p, o), tg = V.mad(p, D, 4 - 30 * ss(9, 12.6, t)), toRod = V.norm(V.sub(tg, eye));
  const ahead = V.norm(V.add(V.mul(D, Math.cos(.38)), V.mul(U, Math.sin(.38))));
  const f = slerpV(toRod, ahead, la);
  return { eye, f, up: orth(f, U) || U, fov: CI.FV(t) * DEG, tg };
}
/* the ground camera while the rod comes in: a still frame up through the crowns */
function shotIncoming(F, T) { return { eye: CI.Gc, f: CI.FIN, up: orth(CI.FIN, CI.UPH), fov: CI.FVIN }; }
/* the beat among the trees: a slow push in and a drift down (film time from the turn) */
function shotBeat(F, T) {
  const u = ss(0, 1, E.sat((T - CI.tTurn1) / Math.max(1, CI.T_RISE - CI.tTurn1)));
  const eye = V.add(V.mad(CI.Bc, CI.HB, 3.2 * u - .8), V.mul(CI.UPH, -.7 * u)), f = V.norm(V.add(CI.FB, V.mul(CI.UPH, -.02 * u)));
  return { eye, f, up: orth(f, CI.UPH), fov: (58 - 3 * u) * DEG };
}
function shotStrike(F, T, a) {
  if (T < CI.tTurn0) return shotIncoming(F, T);
  if (T < CI.tTurn1) { const m = mixS(shotIncoming(F, T), shotBeat(F, CI.tTurn1), kk(T, CI.tTurn0, CI.tTurn1)); m.up = orth(m.f, CI.UPH); return m; }
  if (T < CI.T_RISE) return shotBeat(F, T);
  const s = CI.SP(T), f = V.norm(V.sub(s.target, s.eye));
  return { eye: s.eye, f, up: orth(f, CI.UPH) || CI.UPH, fov: s.fov };
}
function shotAll(F, T) {
  const X0 = F.TX, a = F.aOf(T);
  if (T < X0 + 11.8) return shotRide(F, T);
  if (T < F.TI - .9) {
    // dropping away from the rod to the forest floor (3 s): the eye about the rod; the look kept on the rod (from the
    // ride's aim, seen from the moving eye), easing from 1.4 s into the drop onto the still frame by 0.9 s before the
    // strike (the streak then enters it from the top)
    const A = T < X0 + 14.8 ? shotRide(F, T) : null, B = shotIncoming(F, T), w = kk(T, X0 + 11.8, X0 + 14.8), m = A ? mixS(A, B, w, F.rodAt(T)) : B;
    const tg = A ? V.lerp(A.tg, F.rodAt(T), ss(0, .4, w)) : F.rodAt(T), f = slerpV(V.norm(V.sub(tg, m.eye)), B.f, ss(X0 + 13.2, F.TI - .9, T));
    return { eye: m.eye, f, up: orth(f, V.lerp(CI.UD, CI.UPH, w)) || CI.UPH, fov: m.fov };
  }
  if (T < F.TI) return shotIncoming(F, T);
  return shotStrike(F, T, Math.max(0, a));
}
function camHook(T, F) {
  FCs = F;
  FRAME.T = T; FRAME.a = F.aOf(T); W.CRA.a = FRAME.a; cloudShadow(FRAME.a);
  { const ld = FRAME.a > 0 ? ss(.2, 1.5, FRAME.a) * (1 - ss(F.T_RET + .5, F.T_RET + 2, T)) : 0; W.GOPT.pxm = 1 + .22 * ld; W.GOPT.fbud = 1 - .45 * ld; }
  W.GOPT.hz = 1; W.GOPT.hk = 0;
  const key = F.TX + ',' + F.TI + ',' + F.T_RET;
  if (!CI || key !== CI_K) { CI_K = key; camInit(F); }
  // the film's camera rides beside the round through the exit and hands in to this one over T_ON - 1.6 .. T_ON + 1.1
  if (T < F.T_ON - 1.6 || T > CI.Tend) return null;
  const o = outS(shotAll(F, T));
  // dust in the air round the ground camera: the stand reads in front of a fading forest (no bright horizon line)
  { const e = o.eye, dG = Math.hypot(e[0] - W.G2[0], e[1] - W.G2[1], e[2] - W.G2[2]), g = 1 - ss(80, 500, dG); W.GOPT.hz = 1 + 10 * g; W.GOPT.hk = .92 * (1 - ss(16, 110, dG)); }
  // the shock reaching the lens: a jolt, then a sway in the wind (film seconds, so slow motion sways slowly)
  const tg = T - CI.tG;
  if (CI.tG && tg > 0 && tg < 6 && T < CI.T_RISE + 1) { const sh = FILM.shake(T, 1, 7), amp = 9 * Math.exp(-tg * .8) * (1 - Math.exp(-tg * 6)); o.target = V.add(o.target, V.add(V.mul(CI.S_, sh[0] * amp), V.mul(CI.UPH, sh[1] * amp * .6))); }
  return o;
}

return { setProf, shot, bore, petals, trail, sheath, strike, flashA, debris, shockR, surgeR, capH, capR, gP, FIRE, DUST, cam: camHook, arrive };
};
