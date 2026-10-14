/* ORBITAL RAILGUN effects (window.ORFX(K, L, W, cfg)): the shot leaving the muzzle, the rod's fall and its trail,
   and the strike on the coast, all as dots and rings that are pure functions of their age (seeded at load), plus the
   camera of the fall and the strike (cam(T, FC)). Spectacle only: light, motion, flashes, dust, rings.
     shot    rings of light racing out of the muzzle, a flash, a cone of sparks, four sabot petals peeling away
     fall    the rod (a closed shell) entering the air: a plasma sheath flowing back off its nose under a flickering
             bow shock, shock rings shed and swept downstream, Mach diamonds in a hot wake, a growing column of
             smoke and plasma that stays in the sky after the strike (sun-shaded, drifting in the winds aloft)
     strike  a blinding flash; an air shock dome with two reflected shells and a condensation dome behind it; a
             ground ring racing over the land; the forest (world) flattened and thrown; the battery's vehicles
             tossed and torn apart; an ejecta curtain and tumbling blocks; a dust skirt racing out; a fireball
             rising into a mushroom (a rolling toroidal cap with glowing inner turbulence, the stem, condensation
             rings and a skirt); the crater (world) with its rim, its glowing floor and its rays
     cam     the fall filmed wide (the whole trail), then beside the rod through the entry, behind it as it turns
             into an orb of plasma, braking into a wide shot of the coast; the strike from there, down at ground
             level in the forest, from above, and in an aerial orbit, handing back to the film's climb */
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

/* ================= the shot ================= */
const SPARK = (() => { const r = rng(5151), n = 900, A = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const th = r() * TAU, cone = Math.pow(r(), 1.8) * .55; A[i * 4] = Math.cos(th) * Math.sin(cone); A[i * 4 + 1] = Math.sin(th) * Math.sin(cone); A[i * 4 + 2] = Math.cos(cone); A[i * 4 + 3] = .3 + .7 * r(); } return A; })();
const SHELL = (() => { const r = rng(5252), n = 2400, A = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(th) * h; A[i * 4 + 1] = Math.sin(th) * h; A[i * 4 + 2] = u; A[i * 4 + 3] = .5 + .5 * r(); } return A; })();
/* m muzzle (world), d bore direction, U W perpendiculars, ax s since the rod left (film) */
function shot(m, d, U, Wd, ax, vis) {
  cam();
  if (ax < 0 || ax > 4) return;
  const A = Math.max(0, 1 - ax / 4) * (vis === undefined ? 1 : vis);
  if (ax < 1.2) { K.glowW(m[0], m[1], m[2], Math.round(60 + 520 * Math.exp(-ax * 6)), HOT, Math.min(1, 1.2 * Math.exp(-ax * 3.5)) * A); K.glowW(m[0], m[1], m[2], 220, LIME, .5 * Math.exp(-ax * 2.2) * A); }
  // rings of light racing out of the muzzle (one per coil stage), each expanding as it goes
  for (let k = 0; k < 11; k++) {
    const t = ax - k * .05; if (t < 0) continue;
    const dist = 4 + 120 * Math.pow(t, .7) * (1 + .22 * k), rad = 2.2 + 11 * Math.pow(t, .55) * (1 + .12 * k), al = A * Math.exp(-t * .9) * (k < 4 ? 1 : .75);
    if (al < .02) continue;
    const c = V.mad(m, d, dist), n = Math.round(320 + 90 * rad);
    K.ringW(c, U, Wd, rad, n, k < 5 ? 2 : 1, k % 3 === 1 ? LIME : HOT, al, k * .7);
    K.ringW(V.mad(c, d, -1.2 - .2 * rad), U, Wd, rad * .9, Math.round(n * .7), 1, LIME, al * .7, k * 1.3);
    if (k < 4) K.ringW(V.mad(c, d, 1), U, Wd, rad * 1.08, Math.round(n * .8), 1, LIME, al * .45, k * 2.1);
  }
  // the plasma jet along the bore line
  if (ax < 1.4) for (let i = 0; i < 500; i++) { const u = i / 500, s_ = u * (40 + 700 * Math.min(1, ax * 1.5)), j = (K.hh(i, 5) - .5) * (1 + 6 * u), j2 = (K.hh(i, 9) - .5) * (1 + 6 * u); dotW(m[0] + d[0] * s_ + U[0] * j + Wd[0] * j2, m[1] + d[1] * s_ + U[1] * j + Wd[1] * j2, m[2] + d[2] * s_ + U[2] * j + Wd[2] * j2, u < .2 ? 2 : 1, u < .3 ? HOT : LIME, A * (1 - u) * (1 - ax / 1.4)); }
  // a plasma puff (a shell of dots blowing out of the bore) and a cone of sparks
  if (ax < 2.2) {
    const R0 = 3 + 34 * Math.pow(ax, .6), fa = A * (1 - ax / 2.2);
    for (let i = 0; i < 2400; i += 1) {
      const o = i * 4, rr = R0 * SHELL[o + 3], fwd = Math.max(0, SHELL[o + 2]) * .9 + .1;
      const x = m[0] + (U[0] * SHELL[o] + Wd[0] * SHELL[o + 1]) * rr + d[0] * (rr * fwd * 1.6), y = m[1] + (U[1] * SHELL[o] + Wd[1] * SHELL[o + 1]) * rr + d[1] * (rr * fwd * 1.6), z = m[2] + (U[2] * SHELL[o] + Wd[2] * SHELL[o + 1]) * rr + d[2] * (rr * fwd * 1.6);
      dotW(x, y, z, i % 9 ? 1 : 2, i % 4 ? LIME : HOT, fa * (.35 + .65 * SHELL[o + 3]));
    }
    for (let i = 0; i < 900; i++) {
      const o = i * 4, life = SPARK[o + 3] * 1.8; if (ax > life) continue;
      const s = ax * (60 + 260 * SPARK[o + 3]);
      dotW(m[0] + (U[0] * SPARK[o] + Wd[0] * SPARK[o + 1] + d[0] * SPARK[o + 2]) * s, m[1] + (U[1] * SPARK[o] + Wd[1] * SPARK[o + 1] + d[1] * SPARK[o + 2]) * s, m[2] + (U[2] * SPARK[o] + Wd[2] * SPARK[o + 1] + d[2] * SPARK[o + 2]) * s, i % 5 ? 1 : 2, i % 3 ? HOT : LIME, (1 - ax / life) * A);
    }
  }
}
/* the rod in the bore: a plasma armature behind it, the rails flashing (world points along the bore) */
function bore(b0, d, z0, z1, T) {
  cam();
  for (let i = 0; i < 260; i++) {
    const u = i / 260, z = z1 - (z1 - z0) * Math.pow(u, .7), j = K.hh(i, Math.floor(T * 60));
    const p = V.mad(b0, d, z);
    dotW(p[0] + (j - .5) * .5, p[1] + (K.hh(i + 7, Math.floor(T * 60)) - .5) * .5, p[2] + (K.hh(i + 3, Math.floor(T * 60)) - .5) * .5, u < .1 ? 2 : 1, u < .25 ? HOT : LIME, (1 - u) * .95);
  }
}

/* ---------- sabot petals: four quarter shells peeling off the rod (rod-relative, a s since the exit) ---------- */
const PETAL = (() => { const P = []; for (let i = 0; i <= 28; i++) for (let j = 0; j <= 6; j++) P.push((i / 28 - .5) * 5.4, j / 6 * PI / 2 - PI / 4); return new Float32Array(P); })();
function petals(p, d, U, Wd, a, vis) {
  cam();
  if (a < 0 || a > 6) return;
  const A = (1 - a / 6) * (vis === undefined ? 1 : vis);
  for (let k = 0; k < 4; k++) {
    const ang = k / 4 * TAU + PI / 4, rx = Math.cos(ang), ry = Math.sin(ang);
    const out = .4 + 7 * a + 1.2 * a * a, back = 1.5 * a * a, spin = a * (.9 + .3 * k) * (k % 2 ? 1 : -1);
    const c = V.add(V.mad(p, d, -back), V.add(V.mul(U, rx * out), V.mul(Wd, ry * out)));
    // petal frame: radial (rx, ry), tumbling about the tangent
    const ra = V.add(V.mul(U, rx), V.mul(Wd, ry)), ta = V.add(V.mul(U, -ry), V.mul(Wd, rx));
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const ax = V.add(V.mul(d, cs), V.mul(ra, sn)), rr = V.add(V.mul(ra, cs), V.mul(d, -sn));
    for (let i = 0; i < PETAL.length; i += 2) {
      const s = PETAL[i], th = PETAL[i + 1], cr = Math.cos(th) * .34, sr = Math.sin(th) * .34;
      dotW(c[0] + ax[0] * s + rr[0] * (cr - .34) + ta[0] * sr, c[1] + ax[1] * s + rr[1] * (cr - .34) + ta[1] * sr, c[2] + ax[2] * s + rr[2] * (cr - .34) + ta[2] * sr, 1, a < .6 ? HOT : WH, A * (i % 10 === 0 ? 1 : .7));
    }
  }
}


/* ================= the fall ================= */
/* the rod's plasma, in the rod's frame (p its centre, D its heading, U Wd perpendiculars), all in film time T:
   everything flows and flickers by T, nothing stands still */
const NFL = 6000, FLW = (() => { const r = rng(919), A = new Float32Array(NFL * 5); for (let i = 0; i < NFL; i++) { A[i * 5] = r() * TAU; A[i * 5 + 1] = r(); A[i * 5 + 2] = .65 + .7 * r(); A[i * 5 + 3] = r(); A[i * 5 + 4] = r(); } return A; })();
const NBS = 4200, BSH = (() => { const r = rng(929), A = new Float32Array(NBS * 3); for (let i = 0; i < NBS; i++) { A[i * 3] = Math.sqrt(r()); A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = r(); } return A; })();
const NOB = 7000, ORBP = (() => { const r = rng(939), A = new Float32Array(NOB * 5); for (let i = 0; i < NOB; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 5] = Math.cos(th) * h; A[i * 5 + 1] = Math.sin(th) * h; A[i * 5 + 2] = u; A[i * 5 + 3] = .55 + .45 * Math.pow(r(), .35); A[i * 5 + 4] = r(); } return A; })();
const NMD = 420, MDP = (() => { const r = rng(949), A = new Float32Array(NMD * 2); for (let i = 0; i < NMD; i++) { A[i * 2] = (r() * 2 - 1) * Math.sqrt(r()); A[i * 2 + 1] = r() * TAU; } return A; })();
/* a ring of dots round the axis D at c (radius rr), n dots, phase ph */
function ringD(cx_, cy_, cz_, U, Wd, rr, n, col, a, ph, sz) {
  if (a < .015) return;
  for (let k = 0; k < n; k++) { const t = ph + k / n * TAU, cs = fc(t) * rr, sn = fs(t) * rr; dotW(cx_ + U[0] * cs + Wd[0] * sn, cy_ + U[1] * cs + Wd[1] * sn, cz_ + U[2] * cs + Wd[2] * sn, sz, col, a); }
}
function sheath(p, D, U, Wd, heat, T) {
  cam();
  const px = p[0], py = p[1], pz = p[2];
  const dist = Math.max(1, Math.hypot(px - ex, py - ey, pz - ez)), ppm = FL / dist;
  // in the vacuum a closed shell catching the sun (the film draws it); far away only a point so it still reads
  if (heat < .015) { if (ppm < .45) { dotW(px, py, pz, 2, HOT, 1); K.glowW(px, py, pz, 9, LIME, .35); } return; }
  const alt = Math.hypot(px - W.CE[0], py - W.CE[1], pz - W.CE[2]) - W.RE;
  const h = heat, orb = ss(30000, 8000, alt);
  // sizes (m): the bow shock's nose radius, the shock layer at the shoulder, the hot wake behind
  const Rn = 1 + 3.6 * h + 4 * orb, Rs = Rn * 2.4, so = .3 * Rn, Lb = Rs * Rs / (2 * Rn) - so, Lw = 90 + 380 * h + 300 * orb;
  const nx = px + D[0] * 3.1, ny = py + D[1] * 3.1, nz = pz + D[2] * 3.1;
  const fr = Math.floor(T * 30);
  // the stagnation point's light, at the nose (never on the body)
  K.glowW(nx, ny, nz, Math.min(240, 6 + (Rn * 2.4 + 10 * orb) * ppm), HOT, .32 * h + .45 * orb);
  // the bow shock: a paraboloid shell over the nose, shimmering
  {
    const n = Math.min(NBS, Math.max(160, Math.round(Rs * Rs * ppm * ppm * 2.6)));
    for (let i = 0; i < n; i++) {
      const o = i * 3, uq = BSH[o], th = BSH[o + 1] + T * .9, rr = uq * Rs * 1.3, xb = rr * rr / (2 * Rn) - so;
      const cs = fc(th) * rr, sn = fs(th) * rr, fk = hz1(i * 7 + fr * 13);
      dotW(nx - D[0] * xb + U[0] * cs + Wd[0] * sn, ny - D[1] * xb + U[1] * cs + Wd[1] * sn, nz - D[2] * xb + U[2] * cs + Wd[2] * sn, 1, uq < .5 ? HOT : WH, h * (1.1 - .65 * uq) * (.45 + .55 * fk));
    }
  }
  // the sheath: plasma flowing off the nose, over the shoulder and back into the wake, swirling and flickering
  {
    // the layer under the shock, hugging the nose and shoulder (a fast loop), then the hot wake behind (a long one)
    const n1 = Math.min(NFL >> 1, Math.max(200, Math.round(Rs * Rs * ppm * ppm * 7))), n2 = Math.min(NFL >> 1, Math.max(200, Math.round(Lw * Rs * ppm * ppm * .2)));
    const Ls = Lb * 3.2 + so;
    for (let i = 0; i < n1; i++) {
      const o = i * 5, a0 = FLW[o], sp = FLW[o + 2], rq = FLW[o + 3];
      let uu = FLW[o + 1] + T * 3.1 * sp; uu -= Math.floor(uu);
      const xb = Ls * uu * uu - so;
      const shl = xb < Lb ? Math.sqrt(Math.max(0, 2 * Rn * (xb + so))) : Rs * (1 + .5 * (xb - Lb) / Ls);
      const th = a0 + 2.4 * uu + .5 * fs(T * 5.3 + a0 * 3 + uu * 9);
      const rr = shl * (.5 + .45 * rq) * (1 + .12 * fs(T * 11.7 + i * .37 + uu * 20));
      const cs = fc(th) * rr, sn = fs(th) * rr;
      const fk = .55 + .45 * hz2(i + fr * 31), al = h * (1.15 - .6 * uu) * fk;
      dotW(nx - D[0] * xb + U[0] * cs + Wd[0] * sn, ny - D[1] * xb + U[1] * cs + Wd[1] * sn, nz - D[2] * xb + U[2] * cs + Wd[2] * sn, uu < .25 && ppm > 3 ? 2 : 1, uu < .3 ? HOT : uu < .7 ? FIRE : EMB, al);
    }
    for (let i = 0; i < n2; i++) {
      const o = (i + (NFL >> 1)) * 5, a0 = FLW[o], sp = FLW[o + 2], rq = FLW[o + 3];
      let uu = FLW[o + 1] + T * 1.2 * sp; uu -= Math.floor(uu);
      const xb = Ls * .6 + Lw * Math.pow(uu, 1.5);
      const shl = Rs * (1 + 1.7 * xb / Lw);
      const th = a0 + 1.7 * uu + .45 * fs(T * 4.3 + a0 * 3 + uu * 11);
      const rr = shl * (.2 + .8 * rq) * (1 + .22 * fs(T * 7.7 + i * .37 + uu * 20));
      const cs = fc(th) * rr, sn = fs(th) * rr;
      const fk = .5 + .5 * hz2(i + fr * 31), al = h * Math.pow(1 - uu, 1.3) * fk * (1.1 - .5 * rq);
      dotW(nx - D[0] * xb + U[0] * cs + Wd[0] * sn, ny - D[1] * xb + U[1] * cs + Wd[1] * sn, nz - D[2] * xb + U[2] * cs + Wd[2] * sn, 1, uu < .15 ? FIRE : uu < .45 ? EMB : WH, uu > .45 ? al * .5 : al);
    }
  }
  // shock rings shed at the shoulder and swept downstream, opening out as they go
  {
    const RDT = .05, NRG = 18, life = RDT * NRG, k0 = Math.floor(T / RDT);
    for (let j = 0; j < NRG; j++) {
      const kq = k0 - j, tau = T - kq * RDT, uq = tau / life; if (uq > 1 || uq < 0) continue;
      const xr = Lb + Lw * 1.3 * Math.pow(uq, .8), rr = Rs * 1.05 + xr * (.12 + .05 * h + .05 * orb);
      const al = h * Math.pow(1 - uq, 1.4) * (kq % 3 === 0 ? 1 : .55), wob = .06 * rr * fs(kq * 1.7);
      const n = Math.min(1100, Math.max(24, Math.round(TAU * rr * ppm / 1.6)));
      const cxr = nx - D[0] * (xr + wob), cyr = ny - D[1] * (xr + wob), czr = nz - D[2] * (xr + wob);
      ringD(cxr, cyr, czr, U, Wd, rr, n, uq < .2 ? HOT : WH, al, kq * .9, 1);
      if (uq < .5) ringD(cxr - D[0] * rr * .05, cyr - D[1] * rr * .05, czr - D[2] * rr * .05, U, Wd, rr * .95, Math.round(n * .6), FIRE, al * .5, kq * 1.3, 1);
    }
  }
  // Mach diamonds: a chain of bright knots in the wake, breathing
  {
    const ND = 7, lam = Rs * 2.3;
    for (let k = 0; k < ND; k++) {
      const xd = Lb * 3.2 + Rs * .8 + k * lam * (1 + .06 * fs(T * 9 + k)), half = lam * .42, rd = Rs * (.62 - .05 * k);
      const it = Math.min(1, 1.3 * h * Math.pow(1 - k / ND, 1.2) * (.7 + .3 * fs(T * 23 + k * 1.7)) * (1 - .35 * orb));
      if (it < .03) continue;
      const n = Math.min(NMD, Math.max(16, Math.round(rd * half * ppm * ppm * 2.4)));
      const cxd = nx - D[0] * xd, cyd = ny - D[1] * xd, czd = nz - D[2] * xd;
      for (let i = 0; i < n; i++) {
        const t = MDP[i * 2], th = MDP[i * 2 + 1] + T * 2.1, at = t < 0 ? -t : t, rr = rd * (1 - at), cs = fc(th) * rr, sn = fs(th) * rr;
        dotW(cxd - D[0] * t * half + U[0] * cs + Wd[0] * sn, cyd - D[1] * t * half + U[1] * cs + Wd[1] * sn, czd - D[2] * t * half + U[2] * cs + Wd[2] * sn, at < .2 && ppm > 3 ? 2 : 1, at < .35 ? HOT : FIRE, it * (.55 + .45 * (1 - at)));
      }
      if (k < 3) K.glowW(cxd, cyd, czd, Math.min(70, 3 + rd * ppm * 1.8), FIRE, .16 * it);
    }
  }
  // low down the sheath swells into an orb of plasma round the nose
  if (orb > .02) {
    const Ro = Rn * 1.4 + 7 * orb, c0 = nx - D[0] * Ro * .3, c1 = ny - D[1] * Ro * .3, c2 = nz - D[2] * Ro * .3;
    const n = Math.min(NOB, Math.max(200, Math.round(Ro * Ro * ppm * ppm * 2.4)));
    for (let i = 0; i < n; i++) {
      const o = i * 5, q = ORBP[o + 3] * Ro * (1 + .09 * fs(T * 13 + i * .7)), back = ORBP[o + 2] < 0 ? 1 + .8 * -ORBP[o + 2] : 1;
      const x = c0 + (U[0] * ORBP[o] + Wd[0] * ORBP[o + 1]) * q + D[0] * ORBP[o + 2] * q * back, y = c1 + (U[1] * ORBP[o] + Wd[1] * ORBP[o + 1]) * q + D[1] * ORBP[o + 2] * q * back, z = c2 + (U[2] * ORBP[o] + Wd[2] * ORBP[o + 1]) * q + D[2] * ORBP[o + 2] * q * back;
      dotW(x, y, z, 1, ORBP[o + 3] < .8 ? HOT : FIRE, orb * (.5 + .5 * hz1(i + fr * 17)));
    }
    K.glowW(c0, c1, c2, Math.min(420, Ro * ppm * 3), FIRE, .22 * orb);
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
const colR = (age, alt) => Math.min(310, 2.5 + 40 * Math.sqrt(age)) * (.3 + .7 * ss(108000, 26000, alt)) * (1 + .45 * ss(22000, 2500, alt));
const NCHK = 2048, CK_ST = new Int32Array(NCHK), CK_RP = new Int32Array(NCHK), CK_ZM = new Float64Array(NCHK), CK_DM = new Float64Array(NCHK), CK_ON = new Uint8Array(NCHK);
const TBUDGET = 36000;
function trail(F, T, vis) {
  cam();
  if (FCs) { FRAME.T = T; FRAME.a = FCs.aOf(T); W.CRA.a = FRAME.a; }
  const sR = F.sOf(T);
  if (sR > 0) {
    const Dv = F.DIR, M = F.MZ, U = F.U, Wd = F.W, Fl = FL, near = NR;
    const sU = U[0] * SUNL[0] + U[1] * SUNL[1] + U[2] * SUNL[2], sW = Wd[0] * SUNL[0] + Wd[1] * SUNL[1] + Wd[2] * SUNL[2];
    // pass 1: the chunks in view, their lattice step and dots across, and what the column asks for in all
    let want = 0, ci = 0;
    for (let c0 = 0; c0 < sR && ci < NCHK; c0 += TCH, ci++) {
      CK_ON[ci] = 0;
      const c1 = Math.min(sR, c0 + TCH), sm = (c0 + c1) / 2;
      const altm = F.altAt(sm), airm = ss(112000, 36000, altm), ageMax = F.ageAt(c0, T);
      const reach = airm > .02 ? colR(ageMax, altm) * 1.4 + 7 * ageMax + 10 : 10;
      if (!K.wIn(M[0] + Dv[0] * sm, M[1] + Dv[1] * sm, M[2] + Dv[2] * sm, (c1 - c0) / 2 + reach)) continue;
      const zmid = Math.max(near, K.WZ[0]), dmin = Math.max(near, K.WZ[0] - (c1 - c0) / 2 - reach);
      CK_ON[ci] = airm < .02 ? 1 : 2; CK_ZM[ci] = zmid; CK_DM[ci] = dmin;
      const need = (airm < .02 ? 2.2 : 1.7) * dmin / (Fl * TDS); let st = 1; while (st < need && st < 1 << 20) st <<= 1;
      CK_ST[ci] = st;
      if (airm >= .02) { const agm = F.ageAt(sm, T), wpx = 2 * colR(agm, altm) * Fl / zmid, reps = Math.max(1, Math.min(44, Math.round(wpx * .4))); CK_RP[ci] = reps; want += (c1 - c0) / (TDS * st) * (reps + 1); }
    }
    const kB = want > TBUDGET ? TBUDGET / want : 1;
    ci = 0;
    for (let c0 = 0; c0 < sR && ci < NCHK; c0 += TCH, ci++) {
      if (!CK_ON[ci]) continue;
      const c1 = Math.min(sR, c0 + TCH), sm = (c0 + c1) / 2, zmid = CK_ZM[ci], dmin = CK_DM[ci], st = CK_ST[ci];
      const mx = M[0] + Dv[0] * sm, my = M[1] + Dv[1] * sm, mz = M[2] + Dv[2] * sm;
      const ag0 = F.ageAt(c0, T), ag1 = F.ageAt(c1, T), al0 = F.altAt(c0), al1 = F.altAt(c1), icl = 1 / Math.max(1e-6, c1 - c0);
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
        const hot = Math.exp(-age / (.45 + .3 * th3(i)));
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
}

/* ================= the strike ================= */
const gP = W.gP, gPc = W.gPc;
/* radii and heights as functions of a (sim s since the strike); the film's readout shows shockR and capH */
const shockR = a => a <= 0 ? 0 : 340 * a + 420 * (1 - Math.exp(-a * 3.2));
const surgeR = a => a <= 0 ? 0 : 1650 * (1 - Math.exp(-a / 7.5)) + 420 * (1 - Math.exp(-a * 2.2));
const capH = a => 110 + 1500 * (1 - Math.exp(-a / 16)) + 90 * (1 - Math.exp(-a * 1.4));
const capR = a => 60 + 560 * (1 - Math.exp(-a / 13));
const fbR = a => a <= 0 ? 0 : 40 + 245 * (1 - Math.exp(-a * 2.3));
const fbY = a => Math.min(capH(a), fbR(a) * .5 + 26 * a * a);
/* the stem's radius at height fraction u (0 foot .. 1 under the cap) */
/* the dust pedestal's strength (it settles before the crater view) */
const pedA = a => ss(1.5, 4, a) * (1 - ss(22, 31, a));
const stemR = (u, Rt) => { const w1 = 1 - u, w2 = w1 * w1, u2 = u * u; return Rt * (.16 + .42 * w2 * w2 * w2 + .3 * u2 * u2); };
/* the shock's arrival time at distance d (m), tabulated */
const SHT = new Float32Array(1501); { let a = 0; for (let i = 0; i <= 1500; i++) { const d = i * 4; while (shockR(a) < d) a += .0005; SHT[i] = a; } }
const arrive = d => { const x = Math.max(0, Math.min(1500, d / 4)), k = Math.min(1499, Math.floor(x)); return SHT[k] + (SHT[k + 1] - SHT[k]) * (x - k); };
W.setShock(arrive);
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
const NFB = 24000, FB = (() => { const r = rng(7474), A = new Float32Array(NFB * 5); for (let i = 0; i < NFB; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 5] = Math.cos(th) * h; A[i * 5 + 1] = u; A[i * 5 + 2] = Math.sin(th) * h; A[i * 5 + 3] = Math.pow(r(), .3); A[i * 5 + 4] = r(); } return A; })();
// the cap: billows on a torus (most on its skin, some inside: the turbulence), particles round each billow
const NPF = 720, PPF = 120, NCAP = NPF * PPF;
const PUFF = (() => { const r = rng(7575), A = new Float32Array(NPF * 5); for (let i = 0; i < NPF; i++) { A[i * 5] = r() * TAU; A[i * 5 + 1] = r() * TAU; A[i * 5 + 2] = i < NPF * .8 ? .86 + .14 * r() : .15 + .5 * r(); A[i * 5 + 3] = .6 + .5 * r(); A[i * 5 + 4] = r(); } return A; })();
const CAPP = (() => { const r = rng(7676), A = new Float32Array(NCAP * 4); for (let i = 0; i < NCAP; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u), q = Math.pow(r(), .2); A[i * 4] = Math.cos(th) * h * q; A[i * 4 + 1] = u * q; A[i * 4 + 2] = Math.sin(th) * h * q; A[i * 4 + 3] = q; } return A; })();
const NST = 42000, STM = (() => { const r = rng(7777), A = new Float32Array(NST * 4); for (let i = 0; i < NST; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r(); A[i * 4 + 2] = Math.pow(r(), .3); A[i * 4 + 3] = r(); } return A; })();
const NSK = 10000, SKT = (() => { const r = rng(7878), A = new Float32Array(NSK * 3); for (let i = 0; i < NSK; i++) { A[i * 3] = r() * TAU; A[i * 3 + 1] = r() * TAU; A[i * 3 + 2] = Math.pow(r(), .5); } return A; })();
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
function sFire(a, vis, hx, hy, hz) {
  // the fireball: a ball of turbulent fire growing and rising, flattening into the cap as it climbs, cooling to smoke
  if (a < 13) {
    const rf = fbR(a), cy = hy + fbY(a), sq = 1 - .42 * ss(2.5, 8, a), al = vis * (1 - ss(6, 13, a));
    psys(NFB, rf, hx, cy, hz, 2.2, 16000); const st = PS_ST, sz = PS_S;
    for (let i = 0; i < NFB; i += st) {
      const o = i * 5, nx = FB[o], ny = FB[o + 1], nz = FB[o + 2], q = FB[o + 3];
      const bill = .84 + .16 * fs(nx * 5.1 + ny * 3.7 + a * .9) * fc(nz * 4.3 - ny * 2.2 + a * .7);
      const rr = rf * q * bill, dent = ny < 0 ? 1 - .5 * ss(3, 9, a) * -ny : 1;
      const heat = Math.max(0, 1.15 - a * .12 - q * .3 * Math.min(1, a * .5));
      const lw = nx * SUNL[0] + ny * SUNL[1] + nz * SUNL[2], lit = .2 + .8 * (lw > 0 ? lw : 0) * q;
      dotL(hx + nx * rr, cy + ny * rr * sq * dent, hz + nz * rr, lut(heat, lit), al * (.55 + .7 * Math.min(1, heat + .2) + .2 * FB[o + 4]), sz);
    }
  }
}
function sStem(a, vis, hx, hy, hz) {
  const Hc = capH(a), Rt = capR(a), rmin = Rt * .5;
  // the stem: dust and smoke drawn up into the cap, flared at the foot, narrow at the waist, twisting, streaked
  if (a > 1.1) {
    const top = a < 8 ? E.mix(fbY(a) - fbR(a) * .45, Hc - rmin * .6, ss(3, 8, a)) : Hc - rmin * .6;
    const al = vis * ss(1.1, 4, a) * (1 - ss(80, 100, a)) * .85;
    psys(NST, Math.sqrt(Math.max(1, top) * Rt * .5), hx, hy + top / 2, hz, 2.6, 24000); const st = PS_ST, sz = PS_S;
    const hot0 = a < 7 ? Math.max(0, .8 - a * .11) : 0, uc = .5 * ss(24, 34, a), lf = .6 - .48 * ss(22, 31, a);   // late on the column lifts off the ground
    for (let i = 0; i < NST; i += st) {
      const o = i * 4; let u = STM[o + 1] + a * .03 * (1 + STM[o + 3]); u -= Math.floor(u);
      const y = hy + u * top, w1 = 1 - u, q = STM[o + 2];
      const rs = stemR(u, Rt) * q * (1 + .06 * fs(u * 9 + STM[o + 3] * 6));
      const th = STM[o] + a * .25 * w1, ct = fc(th), st_ = fs(th);
      const fade = ss(uc, uc + .05, u) * (1 - ss(.94, 1, u)) * (lf + (1 - lf) * ss(uc + .02, uc + .3, u));
      const tex = .76 + .24 * fs(th * 5 + u * 17 - a * .35) * fc(th * 3.3 - u * 9 + a * .2);
      const lw = ct * SUNL[0] + st_ * SUNL[2], lit = (.08 + .85 * (lw > 0 ? lw : 0) * (.3 + .7 * q)) * tex + .06 * u;
      dotL(hx + ct * rs, y, hz + st_ * rs, lut(hot0 * w1 * (1.2 - q * .5), lit), al * fade * (.65 + .45 * STM[o + 3]), sz);
    }
    // the dust pedestal: a low mound of dust round the foot, the column rising out of it, settling before the crater shows
    const ap = vis * pedA(a);
    if (ap > .02) {
      const Rp = stemR(0, Rt) * 1.25 + 40, Hp = 50 + 90 * ss(2, 12, a);
      psys(NST, Rp, hx, hy + Hp * .4, hz, 3, 9000); const sp = PS_ST * 2, s2 = PS_S;
      for (let i = 1; i < NST; i += sp) {
        const o = i * 4, q = STM[o + 2], th = STM[o] - a * .05, ct = fc(th), st_ = fs(th), r = Rp * q * (1 + .22 * fs(th * 5 + 1.3) + .14 * fs(th * 11 + a * .1) + .08 * fs(q * 13 + th * 3));
        const hq = Math.pow(Math.max(0, 1 - q * q), .6), y = hy + Hp * hq * (.35 + .65 * STM[o + 1]) * (1 + .25 * fs(th * 7 + a * .2) * fc(q * 9 - a * .3));
        const lw = (ct * SUNL[0] + st_ * SUNL[2]) * q + SUNL[1] * hq, lit = .12 + .8 * (lw > 0 ? lw : 0);
        dotL(hx + ct * r, y, hz + st_ * r, lut(hot0 * .6, lit), ap * (.5 + .4 * STM[o + 3]) * (1 - .75 * q * q * q * q), s2);
      }
    }
  }
}
function sCap(a, vis, hx, hy, hz) {
  const Hc = capH(a), Rt = capR(a), Rmaj = Rt * .62, rmin = Rt * .5;
  // the cap: a rolling toroidal cloud, a skin of small billows (cauliflower), turbulence inside glowing through
  // underneath while it is young; each billow lit on its own sunward side, darkened where the torus faces away
  if (a > 2.2) {
    const al = vis * ss(2.2, 6, a) * (1 - ss(82, 100, a)), roll = a * .32 / (1 + a * .05);
    psys(NCAP, (Rmaj + rmin) * .95, hx, hy + Hc, hz, 2.4, 56000); const st = PS_ST, sz = PS_S;
    const hin0 = a < 22 ? Math.max(0, 1 - a * .046) : 0, fq = Math.floor(a * 6) * 7;
    for (let p = 0; p < NPF; p++) {
      const q = p * 5, th = PUFF[q] + a * .006, ph = PUFF[q + 1] + roll, rb = PUFF[q + 2], inner = rb < .7, pr = PUFF[q + 3] * rmin * (inner ? .42 : .3);
      const cph = fc(ph), sph = fs(ph), ct = fc(th), sth = fs(th);
      const rad = Rmaj + rmin * rb * cph, cx_ = hx + ct * rad, cz_ = hz + sth * rad, cy_ = hy + Hc + rmin * rb * sph * .75;
      const lb = cph * (ct * SUNL[0] + sth * SUNL[2]) + sph * SUNL[1], vis_ = lb > -.2 ? (lb + .2) / 1.2 : 0;
      const hin = hin0 * (inner ? 1.25 : sph < -.4 ? (-sph - .4) * .5 : 0), sky = .1 + .08 * sph;
      const ab = al * (inner ? .8 : 1);
      for (let k = p % st; k < PPF; k += st) {
        const o = (p * PPF + k) * 4, lx = CAPP[o], ly = CAPP[o + 1], lz = CAPP[o + 2], lq = CAPP[o + 3];
        const cl = (lx * SUNL[0] + ly * SUNL[1] + lz * SUNL[2]) / (lq + .02);
        const lit = sky + .08 + .08 * ly / (lq + .02) + 1.15 * (cl > 0 ? cl : 0) * vis_ * lq;
        const heat = hin > 0 ? hin * (1.15 - lq * .7) * (.75 + .25 * hz1(p * 31 + k + fq)) : 0;
        dotL(cx_ + lx * pr, cy_ + ly * pr * .85, cz_ + lz * pr, lut(heat, lit), ab * (.7 + .35 * lq), sz);
      }
    }
  }
}
function sCond(a, vis, hx, hy, hz) {
  const Hc = capH(a), Rt = capR(a), Rmaj = Rt * .62, rmin = Rt * .5;
  // condensation: two collar clouds round the stem (puffy rings, lit on top), and a thin skirt flaring under the cap
  if (a > 4.5 && a < 56) {
    const alr = vis * ss(4.5, 10, a) * (1 - ss(32, 56, a)) * .85, top = Hc - rmin * .6;
    psys(NSK, Rt * 1.2, hx, hy + Hc * .6, hz, 3, 7000); const st = PS_ST;
    for (let ring = 0; ring < 2; ring++) {
      const ur = ring ? .68 : .46, yr = hy + top * ur, rc = stemR(ur, Rt) * (ring ? 1.9 : 2.3) * (1 + .25 * ss(5, 35, a)) + Rt * .08, tb = rc * (ring ? .3 : .42);
      for (let i = ring; i < NSK; i += st * 2) {
        const o = i * 3, th = SKT[o] + a * .012 * (ring ? -1 : 1), v = SKT[o + 1], qq = SKT[o + 2];
        const ct = fc(th), st_ = fs(th), cv = fc(v), sv = fs(v), rr = rc + tb * cv * qq * (.9 + .2 * fs(th * 6 + ring));
        const lw = (ct * SUNL[0] + st_ * SUNL[2]) * cv * .8 + SUNL[1] * sv, lit = .3 + .7 * (lw > 0 ? lw : 0);
        dotP(hx + ct * rr, yr + tb * sv * qq * .5, hz + st_ * rr, 240 * lit, 242 * lit, 236 * lit, alr * (ring ? .5 : .62) * (.4 + .5 * qq) * (.7 + .3 * fs(th * 5 + 2.1 * ring)));
      }
    }
    const als = vis * ss(6, 11, a) * (1 - ss(28, 46, a)) * .4;
    if (als > .02) for (let i = 0; i < NSK; i += st) {
      const o = i * 3, v = SKT[o + 2], th = SKT[o] - a * .01;
      const y = hy + Hc - rmin * .55 - v * Hc * .2, rr = Rmaj * (.62 + .5 * v) * (1 + .04 * fs(th * 9 + v * 4));
      const lit = .5 + .5 * Math.max(0, fc(th) * SUNL[0] + fs(th) * SUNL[2]);
      dotP(hx + fc(th) * rr, y, hz + fs(th) * rr, 236 * lit, 238 * lit, 232 * lit, als * 4 * v * (1 - v) * (.5 + .5 * fs(th * 5 + 1.7)));
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
function strike(a, vis) {
  cam();
  if (a < 0) return;
  vis = vis === undefined ? 1 : vis;
  const hx = HIT[0], hy = HIT[1], hz = HIT[2];
  sGlow(a, vis, hx, hy, hz); if (PT) PT.lap(0);
  sShock(a, vis, hx, hy, hz); if (PT) PT.lap(1);
  sFoot(a, vis, hx, hy, hz); sCrater(a, vis, hx, hy, hz); if (PT) PT.lap(2);
  sSurge(a, vis, hx, hy, hz); if (PT) PT.lap(3);
  sEject(a, vis, hx, hy, hz); if (PT) PT.lap(4);
  sFire(a, vis, hx, hy, hz); if (PT) PT.lap(5);
  sStem(a, vis, hx, hy, hz); if (PT) PT.lap(6);
  sCap(a, vis, hx, hy, hz); if (PT) PT.lap(7);
  sCond(a, vis, hx, hy, hz); if (PT) PT.lap(8);
  vehicles(a, vis); if (PT) PT.lap(9);
}
/* the white-out: overlay alpha */
const flashA = a => a < 0 ? 0 : a < .06 ? .97 : .97 * Math.exp(-(a - .06) * 2.7);
/* the vehicles are handled in strike() (tossed and torn apart); kept for the film's call */
function debris(p, t, vis) { }

/* ================= the camera of the fall and the strike =================
   cam(T, FC) -> a shot for base time T, or null for the film's own camera. FC: the fall's constants and helpers
   (TX, TI, T_ON, T_RET, rodAt, altOf, aOf, DIRP, SIDE, UPD, HIT, CE, camBase...). Called first in each frame, so it
   also sets the strike's state for the world (the crater, the forest). */
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
/* look point from eye toward a mix of two look points by direction (a near and a far point mix evenly) */
function lookMix(eye, a, b, w) { const da = V.norm(V.sub(a, eye)), db = V.norm(V.sub(b, eye)); return V.mad(eye, V.norm(V.lerp(da, db, w)), 1000); }
/* blend two shots about an anchor: the eye's direction from the anchor mixed, its distance log-mixed, the look
   direction mixed (a shot 300 km out and one 300 m out blend without the eye cutting across) */
function blendAbout(A, B, w, P) {
  if (w <= 0) return A; if (w >= 1) return B;
  const da = V.sub(A.eye, P), db = V.sub(B.eye, P), la = Math.max(1e-3, V.len(da)), lb = Math.max(1e-3, V.len(db));
  const dir = V.norm(V.lerp(V.mul(da, 1 / la), V.mul(db, 1 / lb), w)), eye = V.mad(P, dir, K.logMix(la, lb, w));
  const fa = V.norm(V.sub(A.target, A.eye)), fb = V.norm(V.sub(B.target, B.eye));
  return { eye, target: V.mad(eye, V.norm(V.lerp(fa, fb, w)), 1000), fov: A.fov + (B.fov - A.fov) * w, roll: (A.roll || 0) + ((B.roll || 0) - (A.roll || 0)) * w };
}
/* roll a shot so a world direction runs across the frame at angle `want` (rad, down to the right when negative) */
function withRoll(s, dir, want) {
  const f = V.norm(V.sub(s.target, s.eye)), r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
  const dr = V.dot(dir, r), du = V.dot(dir, u), tw = dr >= 0 ? want : PI - want;
  let rl = Math.atan2(du, dr) - tw; while (rl > PI) rl -= TAU; while (rl < -PI) rl += TAU;
  s.roll = rl; return s;
}
/* a key path (cubic Hermite, Catmull-Rom tangents; keys with stop:true have zero velocity) */
function mkPath(keys) {
  const n = keys.length;
  const tan = (i, f) => { if (i === 0 || i === n - 1 || keys[i].stop) return f === 'fov' ? 0 : [0, 0, 0]; const a = keys[i - 1], b = keys[i + 1], dt = b.t - a.t; return f === 'fov' ? (b.fov - a.fov) / dt : V.mul(V.sub(b[f], a[f]), 1 / dt); };
  const M = keys.map((k, i) => ({ eye: tan(i, 'eye'), target: tan(i, 'target'), fov: tan(i, 'fov') }));
  const H = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + m1 * dt * (u3 - u2); };
  return T => {
    let i = 0; while (i < n - 2 && keys[i + 1].t <= T) i++;
    const a = keys[i], b = keys[i + 1], dt = b.t - a.t, u = E.clamp((T - a.t) / dt, 0, 1);
    const v3 = f => [0, 1, 2].map(c => H(a[f][c], b[f][c], M[i][f][c], M[i + 1][f][c], u, dt));
    return { eye: v3('eye'), target: v3('target'), fov: H(a.fov, b.fov, M[i].fov, M[i + 1].fov, u, dt) * DEG };
  };
}
let CI = null;
function camInit(F) {
  const altAt = t => F.altOf(F.rodAt(t));
  const tAlt = hh => { let lo = F.TX, hi = F.TI; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (altAt(m) > hh) lo = m; else hi = m; } return (lo + hi) / 2; };
  const UPH = V.norm(V.sub(HIT, F.CE));
  const N_ = V.norm(V.sub(F.DIRP, V.mul(UPH, V.dot(F.DIRP, UPH))));
  let S_ = V.norm(V.cross(UPH, N_)); if (V.dot(S_, SUNL) < 0) S_ = V.mul(S_, -1);
  // a point round the strike: azimuth al from the rod's heading toward the sun side, r out, h up
  const at = (al, r, h) => V.add(HIT, V.add(V.mul(V.add(V.mul(N_, Math.cos(al)), V.mul(S_, Math.sin(al))), r), V.mul(UPH, h)));
  const up = h => V.mad(HIT, UPH, h);
  const TI = F.TI, aT = ts => Math.max(0, F.aOf(TI + ts));
  CI = { UPH, N_, S_, t165: tAlt(165000), t105: tAlt(105000), t30: tAlt(30000), t19: tAlt(19000), t45: tAlt(4500) };
  // the wide shot of the fall: fixed, the path from the muzzle to the top of the air in frame, the Earth under it
  const sEnt = F.sOf(tAlt(110000)), Cw = V.mad(F.MZ0, F.DIRP, sEnt * .5);
  CI.EW = V.add(Cw, V.add(V.mul(F.SIDE, sEnt * .8), V.add(V.mul(F.UPD, sEnt * .2), V.mul(F.DIRP, -sEnt * .08))));
  CI.TW = Cw; CI.RW = withRoll({ eye: CI.EW, target: Cw }, F.DIRP, -.5).roll;
  // the strike: wide over the coast (the trail coming in from the top corner), a dive to the ground in the forest,
  // up over the crater, out into an aerial orbit, then the film's own camera at the end of the window
  // the strike, TI .. T_RET: the first seconds are tied to the shock (it reaches the ground camera ~3 s in), the rest
  // spreads over whatever the film gives the strike; at T_RET the path rests over the crater and hands over to the
  // film's climb back up the trail (blended about the platform, so the climb takes off from here)
  const G = V.mad(W.G2, UPH, 9), DS = F.T_RET - TI, sk = f => 4.2 + (DS - 4.2) * f;
  CI.G = G; CI.Tend = F.T_RET + 1.2;
  const EE = at(1.5, 3000, 1450);
  CI.EE = EE; CI.TE = up(230);
  const k = (ts, eye, target, fov, stop) => ({ t: TI + ts, eye, target, fov, stop });
  CI.SP = mkPath([
    k(-.15, EE, up(230), 46, true),
    k(1.0, at(1.47, 2820, 1330), up(240), 46),
    k(1.8, at(1.08, 2650, 260), up(220), 54),
    k(2.35, G, up(fbY(aT(2.35)) + 160), 62, true),
    k(4.2, V.mad(G, UPH, 3), up(fbY(aT(4.2)) + 40), 60, true),
    k(sk(.2), at(.72, 2750, 420), up(capH(aT(sk(.2))) * .52), 50),
    k(sk(.42), at(.46, 3100, 760), up(capH(aT(sk(.42))) * .55), 46),
    k(sk(.62), at(.3, 2600, 1600), up(capH(aT(sk(.62))) * .38), 46),
    k(sk(.82), at(.36, 1250, 2000), at(.36 + PI, 60, 30), 48),
    k(DS + 1.2, at(.42, 1150, 2150), at(.42 + PI, 40, 60), 48, true),
  ]);
  CI.aG = arrive(V.dist([W.G2[0], 0, W.G2[2]], [HIT[0], 0, HIT[2]]));
}
const rodOff = (F, T, along, side, up_) => { const p = F.rodAt(T); return V.add(p, V.add(V.mul(F.DIRP, along), V.add(V.mul(F.SIDE, side), V.mul(F.UPD, up_)))); };
function shotWide(F, T) { return { eye: CI.EW, target: V.lerp(CI.TW, F.rodAt(T), .08), fov: 50 * DEG, roll: CI.RW }; }
function shotEntry(F, T) {
  const p = F.rodAt(T), alt = F.altOf(p), heat = ss(110000, 40000, alt), u = ss(CI.t105, CI.t30, T), b = -.32 + .62 * u;
  const Rr = 150 + 130 * heat, cb = Math.cos(b), sb = Math.sin(b);
  const sd = V.add(V.mul(F.SIDE, cb), V.mul(F.UPD, sb)), uq = V.add(V.mul(F.UPD, cb), V.mul(F.SIDE, -sb));
  const eye = V.add(p, V.add(V.mul(sd, Rr * .93), V.add(V.mul(uq, Rr * .26), V.mul(F.DIRP, -Rr * .3))));
  return withRoll({ eye, target: V.mad(p, F.DIRP, -Rr * .22), fov: 42 * DEG }, F.DIRP, -.36);
}
function shotOrb(F, T) { const p = F.rodAt(T); return { eye: V.add(p, V.add(V.mul(F.DIRP, -210), V.add(V.mul(F.UPD, 80), V.mul(F.SIDE, 45)))), target: V.mad(p, F.DIRP, 140), fov: 50 * DEG, roll: 0 }; }
function shotBrake(F, T) {
  const tb = CI.t45, Tc = tb + .42 * (1 - Math.exp(-(T - tb) / .42)), w = kk(T, tb, F.TI - .15);
  const ride = rodOff(F, Tc, -210, 45, 80), eye = V.lerp(ride, CI.EE, w);
  const pr = F.rodAt(Math.min(T, F.TI));
  return { eye, target: lookMix(eye, V.mad(pr, F.DIRP, 140 * (1 - ss(tb, tb + .5, T))), CI.TE, kk(T, tb + .15, F.TI - .1)), fov: 50 * DEG + (46 - 50) * DEG * w, roll: 0 };
}
function shotFall(F, T) {
  if (T < CI.t165) return shotWide(F, T);
  if (T < CI.t105) return blendAbout(shotWide(F, T), shotEntry(F, T), kk(T, CI.t165, CI.t105), F.rodAt(T));
  if (T < CI.t30) return shotEntry(F, T);
  if (T < CI.t19) return blendAbout(shotEntry(F, T), shotOrb(F, T), kk(T, CI.t30, CI.t19), F.rodAt(T));
  if (T < CI.t45) return shotOrb(F, T);
  return shotBrake(F, T);
}
function camHook(T, F) {
  FCs = F;
  FRAME.T = T; FRAME.a = F.aOf(T); W.CRA.a = FRAME.a;
  if (!CI) camInit(F);
  const T0 = F.T_ON - .5, T1 = F.T_ON + 1.1;
  if (T < T0 || T > CI.Tend) return null;
  if (T < T1) {
    // pull back from the rod to the whole trail, keeping the rod in the frame until the pan lets it go
    const w = kk(T, T0, T1), pr = F.rodAt(T), b = blendAbout(F.camBase(T), shotWide(F, T), w, pr);
    b.target = lookMix(b.eye, pr, b.target, ss(.45, 1, w)); return b;
  }
  if (T < F.TI - .15) return shotFall(F, T);
  let s = CI.SP(T);
  // the shock reaching the ground camera: a jolt
  const tg = FRAME.a - CI.aG;
  if (tg > 0 && tg < 3 && T < F.TI + 5.2) { const sh = FILM.shake(T, 1, 19), amp = 14 * Math.exp(-tg * 1.6); s.target = V.add(s.target, V.add(V.mul(CI.S_, sh[0] * amp), V.mul(CI.UPH, sh[1] * amp))); }
  // the hand-over to the film's climb
  if (T > F.T_RET - .1) s = blendAbout(s, F.camBase(T), kk(T, F.T_RET - .1, CI.Tend), F.SAT);
  return s;
}

return { setProf, shot, bore, petals, trail, sheath, strike, flashA, debris, shockR, surgeR, capH, capR, gP, FIRE, DUST, cam: camHook, arrive };
};
