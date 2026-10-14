/* ORBITAL RAILGUN effects (window.ORFX(K, L, W, cfg)): the shot leaving the muzzle, the rod's fall and its trail,
   and the strike on the coast, all as dots and rings that are pure functions of their age (seeded at load).
   Spectacle only: light, motion, flashes, dust, rings.
     shot    rings of light racing out of the muzzle, a flash, a cone of sparks, four sabot petals peeling away
     fall    the rod (a closed shell) glowing as it enters the air, a plasma sheath, a long trail of dots that
             thickens and drifts and stays in the sky after the strike
     strike  a white flash and a blinding point, a hemispherical shock shell, a ground ring of dust racing out,
             ejecta arcs, a fireball rising into a stem and a rolling cap (a mushroom), a collar ring round the
             stem, the crater's hot rim; the coastal site's vehicles break apart as the shock passes them */
window.ORFX = function (K, L, W, cfg) {
'use strict';
const { V, R, X, E, rng, noise } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const C = K.C, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
const FIRE = [255, 196, 138], DUST = [214, 216, 206], GREY = [150, 152, 146];
const ss = E.ss;
const BW = 1920, BH = 1080;
const HIT = W.HIT;

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
function dotCol(x, y, z, s, r, g, b, a) { if (a < .015) return; if (K.pj(x, y, z) && PJ[0] >= 0 && PJ[1] >= 0 && PJ[0] < BW && PJ[1] < BH) { if (K.occT(PJ[0], PJ[1], PJ[2])) return; K.dot(PJ[0], PJ[1], s, r, g, b, a > 1 ? 1 : a); } }
const mixc = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
const CC = [0, 0, 0];

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
/* path: MZ (world) -> HIT, unit DIR, length L0; sOf(T) the rod's distance along it, ageAt(s, T) film s since the rod
   passed s (for the trail), altOf(p) */
const TRN = 2600;
const TJ = (() => { const r = rng(6262), A = new Float32Array(TRN * 6); for (let i = 0; i < TRN; i++) { A[i * 6] = r() - .5; A[i * 6 + 1] = r() - .5; A[i * 6 + 2] = r() - .5; A[i * 6 + 3] = r(); A[i * 6 + 4] = r(); A[i * 6 + 5] = r(); } return A; })();
const PLS = (() => { const r = rng(919), n = 5000, A = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const a = r() * TAU, q = Math.sqrt(r()); A[i * 4] = Math.cos(a) * q; A[i * 4 + 1] = Math.sin(a) * q; A[i * 4 + 2] = r(); A[i * 4 + 3] = r(); } return A; })();
/* the trail from the muzzle down to the rod: dots at fixed places along the path (a 1 m lattice), thinned per 2 km
   chunk by their spacing on screen so the trail is dense where the camera is close and cheap far away; a faint lime
   track in the vacuum, a hot plasma trail in the air that spreads, rises a little and greys with age */
const TCH = 256, TDS = .05;
const th1 = i => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
const th2 = i => { const s = Math.sin(i * 78.233 + 1.7) * 24634.6345; return s - Math.floor(s); };
const th3 = i => { const s = Math.sin(i * 39.425 + 4.1) * 15731.3712; return s - Math.floor(s); };
function trail(F, T, vis) {
  cam();
  const sR = F.sOf(T); if (sR <= 0) return;
  const D = F.DIR, M = F.MZ, U = F.U, Wd = F.W, Fl = C.fl, near = C.near;
  for (let c0 = 0; c0 < sR; c0 += TCH) {
    const c1 = Math.min(sR, c0 + TCH), sm = (c0 + c1) / 2;
    const altm = F.altAt(sm), airm = ss(110000, 35000, altm), ageMax = F.ageAt(c0, T);
    const spreadMax = (4 + 30 * Math.sqrt(ageMax)) * airm * 3 + 10;
    if (!K.wIn(M[0] + D[0] * sm, M[1] + D[1] * sm, M[2] + D[2] * sm, (c1 - c0) / 2 + spreadMax)) continue;
    const dmin = Math.max(near, K.WZ[0] - (c1 - c0) / 2 - spreadMax);
    // far away the trail reads as a line: a continuous core with a faint glow over the scattered dots
    if (dmin > 1500) {
      const ag = F.ageAt((c0 + c1) / 2, T), hot = Math.exp(-ag / .8);
      const col = airm < .02 ? (ag < 1.5 ? HOT : LIME) : hot > .4 ? HOT : WH;
      const b = vis * (airm < .02 ? .62 + .3 * Math.exp(-ag / 12) : .55 + .4 * hot) * (.7 + .3 * ss(1500, 20000, dmin));
      K.lineW(M[0] + D[0] * c0, M[1] + D[1] * c0, M[2] + D[2] * c0, M[0] + D[0] * c1, M[1] + D[1] * c1, M[2] + D[2] * c1, 1.1, dmin > 60000 ? 2 : 1, col, b, airm < .02 ? LIME : WH, .05, 0);
    }
    const pxt = airm > .05 ? 1.6 : 2.2, need = pxt * dmin / (Fl * TDS);
    let st = 1; while (st < need && st < 1 << 20) st <<= 1;
    const i0 = Math.ceil(c0 / TDS / st) * st, i1 = c1 / TDS;
    // height and age are near linear over a 256 m chunk: from its ends
    const al0 = F.altAt(c0), al1 = F.altAt(c1), ag0 = F.ageAt(c0, T), ag1 = F.ageAt(c1, T), icl = 1 / Math.max(1e-6, c1 - c0);
    for (let i = i0; i < i1; i += st) {
      const sp = (i + th1(i) * st * .9) * TDS; if (sp > sR) break;
      const uc = (sp - c0) * icl, alt = al0 + (al1 - al0) * uc, air = ss(110000, 35000, alt), age = ag0 + (ag1 - ag0) * uc;
      const px = M[0] + D[0] * sp, py = M[1] + D[1] * sp, pz = M[2] + D[2] * sp;
      if (air < .02) {
        const bt = vis * .9 * (.55 + .45 * Math.exp(-age / 20)) * (.6 + .4 * th2(i)), hw = .25 + .5 * Math.min(1, age / 8);
        dotW(px, py, pz, 1, age < 1.5 ? HOT : LIME, bt);
        dotW(px + (th2(i + 7) - .5) * hw * U[0] + (th3(i + 7) - .5) * hw * Wd[0], py + (th2(i + 7) - .5) * hw * U[1] + (th3(i + 7) - .5) * hw * Wd[1], pz + (th2(i + 7) - .5) * hw * U[2] + (th3(i + 7) - .5) * hw * Wd[2], 1, LIME, bt * .6);
        continue;
      }
      const hot = Math.exp(-age / (.4 + .4 * th3(i)));
      const reps = air > .3 ? 3 : 1;
      for (let k = 0; k < reps; k++) {
        const h1 = th2(i * 3 + k) - .5, h2 = th3(i * 3 + k) - .5, rr = Math.sqrt(h1 * h1 + h2 * h2) * 2;
        const spread = Math.min(220, (1.2 + 26 * Math.sqrt(age)) * air * (1 + 1.4 * ss(30000, 4000, alt))) * (k ? 1 : .25);
        const x = px + (h1 * U[0] + h2 * Wd[0]) * spread, y = py + (h1 * U[1] + h2 * Wd[1]) * spread + age * 1.5 * air, z = pz + (h1 * U[2] + h2 * Wd[2]) * spread;
        const b = (air * (.55 + .9 * hot) + (1 - air) * .6) * (.55 + .45 * Math.exp(-age / 30)) * (.55 + .45 * th1(i + k)) * (1 - .3 * rr) * (k ? .8 : 1.15);
        const col = hot > .45 ? HOT : hot > .1 ? LIME : WH;
        dotW(x, y, z, hot > .6 && air > .5 ? 2 : 1, col, b * vis);
      }
    }
  }
}
/* the rod in flight (shell drawn by the film), its glow, the plasma sheath; heat 0..1 */
function sheath(p, D, U, Wd, heat, T) {
  cam();
  K.glowW(p[0], p[1], p[2], Math.round(14 + 120 * heat), heat > .2 ? HOT : LIME, .4 + .55 * heat);
  if (heat < .02) return;
  const nose = V.mad(p, D, 3.2);
  K.glowW(nose[0], nose[1], nose[2], Math.round(20 + 200 * heat), HOT, .5 * heat);
  for (let i = 0; i < 5000; i++) {
    const o = i * 4, back = PLS[o + 2] * PLS[o + 2] * 320 * heat, rad = .5 + 2.2 * Math.sqrt(back) * heat;
    const ph = T * 3 + PLS[o + 3] * 9, w = 1 + .12 * Math.sin(ph);
    const x = nose[0] - D[0] * back + (U[0] * PLS[o] + Wd[0] * PLS[o + 1]) * rad * w, y = nose[1] - D[1] * back + (U[1] * PLS[o] + Wd[1] * PLS[o + 1]) * rad * w, z = nose[2] - D[2] * back + (U[2] * PLS[o] + Wd[2] * PLS[o + 1]) * rad * w;
    const f = PLS[o + 2];
    dotW(x, y, z, f < .1 ? 2 : 1, f < .25 ? HOT : PLS[o + 3] < .45 ? LIME : WH, heat * (1 - f) * (1.1 - .5 * Math.hypot(PLS[o], PLS[o + 1])));
  }
  // the bow shock: rings round the nose, swept back
  for (let k = 0; k < 7; k++) { const bk = k * k * .9, c = V.mad(nose, D, .6 - bk); K.ringW(c, U, Wd, .5 + 2.2 * Math.sqrt(bk + .15) * heat, 220, k < 2 ? 2 : 1, k ? LIME : HOT, .95 * heat * (1 - k / 8), T * 5 + k); }
}
/* ================= the strike ================= */
/* polar ground table round the strike: heights to 2.4 km */
const PG_DR = 8, PG_NR = 1100, PG_NA = 720, PG = new Float32Array(PG_NR * PG_NA);
for (let i = 0; i < PG_NR; i++) for (let j = 0; j < PG_NA; j++) { const r = i * PG_DR, t = j / PG_NA * TAU, x = HIT[0] + Math.cos(t) * r, z = HIT[2] + Math.sin(t) * r; const g = W.ground(x, z); PG[i * PG_NA + j] = (g < 0 ? 0 : g) - W.drop(x, z); }
function gP(r, t) { const i = Math.min(PG_NR - 1, Math.max(0, Math.round(r / PG_DR))); let j = Math.round(t / TAU * PG_NA) % PG_NA; if (j < 0) j += PG_NA; return PG[i * PG_NA + j]; }
/* radii as functions of a (sim s since the strike) */
const shockR = a => a <= 0 ? 0 : 340 * a + 420 * (1 - Math.exp(-a * 3.2));
const surgeR = a => a <= 0 ? 0 : 1500 * (1 - Math.exp(-a / 7)) + 380 * (1 - Math.exp(-a * 2.4));
const capH = a => 70 + 1100 * (1 - Math.exp(-a / 15)) + 60 * (1 - Math.exp(-a * 2));
const capR = a => 40 + 360 * (1 - Math.exp(-a / 11));
/* particle tables */
const NSH = 16000, SHK = (() => { const r = rng(7171), A = new Float32Array(NSH * 6); for (let i = 0; i < NSH; i++) { const u = Math.pow(r(), .8), th = r() * TAU, el = Math.asin(u); A[i * 6] = Math.cos(th) * Math.cos(el); A[i * 6 + 1] = el; A[i * 6 + 2] = r(); A[i * 6 + 3] = Math.sin(th) * Math.cos(el); A[i * 6 + 4] = Math.sin(el); } return A; })();
const NSU = 22000, SUR = (() => { const r = rng(7272), A = new Float32Array(NSU * 8); for (let i = 0; i < NSU; i++) { const th = r() * TAU; A[i * 8] = th; A[i * 8 + 1] = Math.pow(r(), .6); A[i * 8 + 2] = Math.pow(r(), 1.6); A[i * 8 + 3] = r(); A[i * 8 + 4] = r(); A[i * 8 + 5] = Math.cos(th); A[i * 8 + 6] = Math.sin(th); A[i * 8 + 7] = 1 + .25 * Math.sin(th * 7 + A[i * 8 + 3] * 6); } return A; })();
const NEJ = 4200, EJ = (() => { const r = rng(7373), A = new Float32Array(NEJ * 5); for (let i = 0; i < NEJ; i++) { const th = r() * TAU, el = (25 + 60 * r()) * DEG, v = 40 + 260 * Math.pow(r(), 1.5); A[i * 5] = Math.cos(th) * Math.cos(el) * v; A[i * 5 + 1] = Math.sin(el) * v; A[i * 5 + 2] = Math.sin(th) * Math.cos(el) * v; A[i * 5 + 3] = r(); A[i * 5 + 4] = r() * .4; } return A; })();
const NFB = 16000, FB = (() => { const r = rng(7474), A = new Float32Array(NFB * 4); for (let i = 0; i < NFB; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u), q = Math.pow(r(), .35); A[i * 4] = Math.cos(th) * h * q; A[i * 4 + 1] = u * q; A[i * 4 + 2] = Math.sin(th) * h * q; A[i * 4 + 3] = r(); } return A; })();
// the cap: puffs on a torus, particles round each puff
const NPF = 220, PPF = 260, NCAP = NPF * PPF;
const PUFF = (() => { const r = rng(7575), A = new Float32Array(NPF * 4); for (let i = 0; i < NPF; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r() * TAU; A[i * 4 + 2] = .7 + .5 * r(); A[i * 4 + 3] = .75 + .35 * r(); } return A; })();
const CAPP = (() => { const r = rng(7676), A = new Float32Array(NCAP * 4); for (let i = 0; i < NCAP; i++) { const u = r() * 2 - 1, th = r() * TAU, h = Math.sqrt(1 - u * u), q = Math.pow(r(), .45); A[i * 4] = Math.cos(th) * h * q; A[i * 4 + 1] = u * q; A[i * 4 + 2] = Math.sin(th) * h * q; A[i * 4 + 3] = r(); } return A; })();
const NST = 42000, STM = (() => { const r = rng(7777), A = new Float32Array(NST * 4); for (let i = 0; i < NST; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r(); A[i * 4 + 2] = Math.sqrt(r()); A[i * 4 + 3] = r(); } return A; })();
const NSK = 12000, SKT = (() => { const r = rng(7878), A = new Float32Array(NSK * 3); for (let i = 0; i < NSK; i++) { A[i * 3] = r() * TAU; A[i * 3 + 1] = r(); A[i * 3 + 2] = r(); } return A; })();
const SUNL = V.norm([-.4, .7, -.35]);
/* dust colour: hot early, then white dust lit from above */
function dustCol(heat, lit, o) { mixc(DUST, GREY, 1 - lit, o); if (heat > 0) { mixc(o, FIRE, Math.min(1, heat * 1.2), o); if (heat > .6) mixc(o, HOT, (heat - .6) * 2.5, o); } return o; }
const DC = [0, 0, 0];
const SNT = new Float32Array(4096); for (let i = 0; i < 4096; i++) SNT[i] = Math.sin(i / 4096 * TAU);
const fs = a => SNT[((a * 651.8986469 + 1e6) | 0) & 4095], fc = a => SNT[((a * 651.8986469 + 1e6 + 1024) | 0) & 4095];
const HH1 = new Float32Array(9000), HH2 = new Float32Array(9000); { const r = rng(4747); for (let i = 0; i < 9000; i++) { HH1[i] = r(); HH2[i] = r(); } }
let PT = null;
const setProf = o => { PT = o; };
/* a particle system's stride from its size on screen: about one dot per 2.2 px^2 of its disc */
/* rings lying on the ground pile into a bright bar when seen edge-on from near the ground: dim them by the camera's
   depression angle to the ring (r m out from the strike point) */
function graze(r) { const dx = HIT[0] - ex, dz = HIT[2] - ez, d = Math.max(1, Math.hypot(dx, dz) - r * .5), dep = (ey - HIT[1]) / d; return .16 + .84 * ss(.01, .2, Math.abs(dep)); }
function pstep(N, R, x, y, z) {
  const d = Math.max(1, Math.hypot(x - ex, y - ey, z - ez) - R * .5), rpx = R * FL / d, nmax = 3.1416 * rpx * rpx / 2.8;
  return Math.max(1, Math.min(16, Math.floor(N / Math.max(1, nmax))));
}
function strike(a, vis, pxf) {
  cam();
  if (a < 0) return;
  vis = vis === undefined ? 1 : vis;
  const hx = HIT[0], hy = HIT[1], hz = HIT[2];
  // the blinding point
  if (a < 3) { K.glowW(hx, hy + 8, hz, Math.round(80 + 700 * Math.exp(-a * 2.6)), HOT, Math.min(1, 1.3 * Math.exp(-a * 1.4)) * vis); K.glowW(hx, hy + 20, hz, 420, FIRE, .45 * Math.exp(-a * .9) * vis); }
  if (PT) PT.lap(0);
  // the shock shell (a hemisphere of dots), its foot on the ground
  if (a < 4.2) {
    const R0 = shockR(a), al = vis * Math.min(1, a * 8) * (1 - a / 4.2) * (1 - a / 4.2), st = pstep(NSH, R0, hx, hy, hz);
    for (let i = 0; i < NSH; i += st) {
      const o = i * 6, el = SHK[o + 1], rr = R0 * (.985 + .03 * SHK[o + 2]);
      const x = hx + SHK[o] * rr, z = hz + SHK[o + 3] * rr, y = hy + SHK[o + 4] * rr * .92;
      dotW(x, y, z, 1, el < .2 ? HOT : LIME, al * (.35 + .65 * (1 - el / 1.6)) * (.6 + .4 * SHK[o + 2]));
    }
  }
  if (PT) PT.lap(1);
  // the shock's foot: a bright ring racing out over the ground (past the ground camera), a low wall of dust behind it
  {
    const R0 = shockR(a), al = vis * Math.min(1, a * 6) * Math.exp(-a / 9) * (1 - ss(14, 20, a)) * graze(R0);
    if (al > .01 && R0 < PG_NR * PG_DR - 20) {
      const n = Math.min(9000, Math.round(TAU * R0 / 2.2)), hw = 4 + 22 * Math.min(1, a / 3);
      for (let k = 0; k < n; k++) {
        const th = (k + .5) / n * TAU, h1 = HH1[k], h2 = HH2[k];
        const rr = R0 - h1 * hw * 2.2, x = hx + fc(th) * rr, z = hz + fs(th) * rr, g = gP(rr, th);
        dotW(x, g + 1.5 + h2 * h2 * hw * 1.4, z, h1 < .2 ? 2 : 1, h1 < .35 ? (a < 1.2 ? HOT : LIME) : DUST, al * (1.15 - h1 * .8));
      }
    }
  }
  if (PT) PT.lap(2);
  // the ground ring of dust racing out (base surge), following the ground
  {
    const Rs = surgeR(a), H = (10 + 140 * (1 - Math.exp(-a / 3))) * (1 + .4 * ss(10, 30, a)), al = vis * Math.min(1, a * 4) * (1 - ss(28, 44, a)) * (.35 + .65 * graze(Rs));
    const st = pstep(NSU, Rs * .8, hx, hy, hz), heat = a < 1.5 ? .6 * (1 - a / 1.5) : 0, ec = a < 2 ? HOT : LIME, cw = Math.min(1, .3 + a / 6);
    if (al > .01) for (let i = 0; i < NSU; i += st) {
      const o = i * 8, dep = SUR[o + 1], rr = Rs * (1 - .45 * dep * cw), hh = H * SUR[o + 2] * (1 - .5 * dep) * SUR[o + 7];
      const x = hx + SUR[o + 5] * rr, z = hz + SUR[o + 6] * rr, y = gP(rr, SUR[o]) + 1 + hh;
      const b = al * (.45 + .65 * SUR[o + 4]) * (1 - .4 * dep);
      if (dep < .12 && a < 6) dotW(x, y, z, 1, ec, b * 1.4);
      else { const lit = .4 + .6 * SUR[o + 2]; if (heat > 0) dotW(x, y, z, 1, dustCol(heat, lit, DC), b); else { DC[0] = GREY[0] + (DUST[0] - GREY[0]) * lit; DC[1] = GREY[1] + (DUST[1] - GREY[1]) * lit; DC[2] = GREY[2] + (DUST[2] - GREY[2]) * lit; dotW(x, y, z, 1, DC, b); } }
    }
  }
  if (PT) PT.lap(3);
  // ejecta arcs (ballistic, two trailing dots)
  if (a < 16) for (let i = 0; i < NEJ; i++) {
    const o = i * 5, t = a - EJ[o + 4]; if (t < 0) continue;
    const vx = EJ[o], vy = EJ[o + 1], vz = EJ[o + 2], drag = 1 / (1 + t * .35 * (.5 + EJ[o + 3]));
    const x = hx + vx * t * drag, z = hz + vz * t * drag, y = hy + vy * t * drag - 4.9 * t * t;
    const rr = Math.hypot(x - hx, z - hz), gy = gP(rr, Math.atan2(z - hz, x - hx));
    if (y < gy) continue;
    const heat = Math.exp(-t * 1.2), b = vis * (.5 + .5 * EJ[o + 3]) * Math.min(1, 1.6 - t / 10);
    dotW(x, y, z, heat > .5 ? 2 : 1, heat > .3 ? HOT : DUST, b);
    if (t > .1) { const t2 = t - .08; dotW(hx + vx * t2 * drag, hy + vy * t2 * drag - 4.9 * t2 * t2, hz + vz * t2 * drag, 1, heat > .3 ? LIME : GREY, b * .55); }
  }
  if (PT) PT.lap(4);
  // the fireball: a ball of dots growing and rising, cooling
  if (a < 9) {
    const rf = 30 + 190 * (1 - Math.exp(-a * 2.2)), cy = hy + 20 + Math.min(capH(a) * .7, 60 * a * a + 20 * a), al = vis * (a < 5 ? 1 : 1 - (a - 5) / 4), st = pstep(NFB, rf, hx, cy, hz);
    for (let i = 0; i < NFB; i += st) {
      const o = i * 4, q = Math.hypot(FB[o], FB[o + 1], FB[o + 2]);
      const heat = Math.max(0, 1 - a * .22 - q * .5 * Math.min(1, a));
      const x = hx + FB[o] * rf, y = cy + FB[o + 1] * rf * .85, z = hz + FB[o + 2] * rf;
      dotW(x, y, z, heat > .7 ? 2 : 1, dustCol(heat, .5 + .5 * FB[o + 1], DC), al * (.55 + .8 * heat + .25 * FB[o + 3]));
    }
  }
  if (PT) PT.lap(5);
  // the stem: dust rising inside a column that widens at the foot
  if (a > .5) {
    const Hc = capH(a), Rt = capR(a), top = Hc - Rt * .35, al = vis * ss(.5, 3, a) * (1 - ss(70, 90, a)), st = pstep(NST, Math.sqrt(top * Rt * .5), hx, hy + top / 2, hz);
    const hot0 = a < 4 ? Math.max(0, .7 - a * .18) : 0;
    for (let i = 0; i < NST; i += st) {
      const o = i * 4, u = (STM[o + 1] + a * .028 * (1 + STM[o + 3])) % 1, y = hy + u * top, w1 = 1 - u;
      const rs = Rt * (.2 + .32 * w1 * w1 * w1 + .05 * fs(u * 9 + STM[o + 3] * 6)) * STM[o + 2];
      const th = STM[o] + a * .25 * w1, ct = fc(th), st_ = fs(th);
      const fade = ss(0, .08, u) * (1 - ss(.9, 1, u));
      const lw = ct * SUNL[0] + st_ * SUNL[2], lit = .35 + .65 * (lw > 0 ? lw : 0) * STM[o + 2];
      const b = al * fade * (.5 + .6 * STM[o + 3]);
      if (hot0 > 0) dotW(hx + ct * rs, y, hz + st_ * rs, 1, dustCol(hot0 * w1, lit, DC), b);
      else { DC[0] = GREY[0] + (DUST[0] - GREY[0]) * lit; DC[1] = GREY[1] + (DUST[1] - GREY[1]) * lit; DC[2] = GREY[2] + (DUST[2] - GREY[2]) * lit; dotW(hx + ct * rs, y, hz + st_ * rs, 1, DC, b); }
    }
  }
  if (PT) PT.lap(6);
  // the cap: a rolling torus of puffs (the mushroom)
  if (a > 1.2) {
    const Hc = capH(a), Rt = capR(a), rt = Rt * .62, al = vis * ss(1.2, 4, a) * (1 - ss(75, 95, a)), roll = a * .22 / (1 + a * .04), st = pstep(NCAP, (Rt + rt) * .8, hx, hy + Hc, hz);
    for (let p = 0; p < NPF; p++) {
      const q = p * 4, th = PUFF[q], ph = PUFF[q + 1] + roll, pr = PUFF[q + 3] * rt * .48;
      const rad = Rt * PUFF[q + 2] * .9 + rt * Math.cos(ph) * .95, yy = Hc + rt * Math.sin(ph) * .62 + rt * .25;
      const cx = hx + Math.cos(th) * rad, cz = hz + Math.sin(th) * rad, cy = hy + yy;
      const up = Math.sin(ph), lit0 = .3 + .7 * Math.max(0, .55 + .45 * up + .35 * (Math.cos(th) * SUNL[0] + Math.sin(th) * SUNL[2]));
      const heat = a < 6 ? Math.max(0, .75 - a * .13) * (.5 - .5 * up) : 0;
      for (let k = p % st; k < PPF; k += st) {
        const o = (p * PPF + k) * 4, x = cx + CAPP[o] * pr, y = cy + CAPP[o + 1] * pr * .8, z = cz + CAPP[o + 2] * pr;
        const lit = Math.min(1, lit0 * (.75 + .35 * CAPP[o + 1]));
        if (heat > 0) dustCol(heat, lit, DC); else { DC[0] = GREY[0] + (DUST[0] - GREY[0]) * lit; DC[1] = GREY[1] + (DUST[1] - GREY[1]) * lit; DC[2] = GREY[2] + (DUST[2] - GREY[2]) * lit; }
        dotW(x, y, z, 1, DC, al * (.5 + .6 * CAPP[o + 3]) * (.65 + .5 * lit));
      }
    }
  }
  if (PT) PT.lap(7);
  // the collar: a thin ring round the stem
  if (a > 3 && a < 40) {
    const Hc = capH(a), Rt = capR(a), y0 = hy + Hc * .5, al = vis * ss(3, 7, a) * (1 - ss(24, 40, a)), st = pstep(NSK, Rt * .5, hx, y0, hz);
    for (let i = 0; i < NSK; i += st) {
      const o = i * 3, th = SKT[o] + a * .02, rr = Rt * (.75 + .55 * SKT[o + 1]) * (1 + .03 * a), y = y0 + (SKT[o + 2] - .5) * Rt * .08 + (rr - Rt) * .12;
      dotW(hx + Math.cos(th) * rr, y, hz + Math.sin(th) * rr, 1, DUST, al * (.4 + .5 * SKT[o + 2]));
    }
  }
  if (PT) PT.lap(8);
  // the crater's hot rim
  if (a < 30) {
    const rim = 46, al = vis * Math.exp(-a / 9);
    for (let k = 0; k < 520; k++) { const th = k / 520 * TAU, rr = rim * (1 + .06 * Math.sin(th * 11)); dotW(hx + Math.cos(th) * rr, gP(rr, th) + 1.5, hz + Math.sin(th) * rr, 2, a < 4 ? HOT : FIRE, al * (.6 + .4 * K.hh(k, 3))); }
  }
}
/* the white-out: overlay alpha */
const flashA = a => a < 0 ? 0 : a < .05 ? .95 : .95 * Math.exp(-(a - .05) * 3.2);

/* ---------- the site's vehicles breaking apart as the shock reaches them ---------- */
const DEB = (() => { const r = rng(7979), n = 260, A = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const th = r() * TAU, el = (10 + 70 * r()) * DEG, v = 20 + 90 * r(); A[i * 4] = Math.cos(th) * Math.cos(el) * v; A[i * 4 + 1] = Math.sin(el) * v; A[i * 4 + 2] = Math.sin(th) * Math.cos(el) * v; A[i * 4 + 3] = r(); } return A; })();
function debris(p, t, vis) {
  cam();
  if (t < 0 || t > 8) return;
  for (let i = 0; i < 260; i++) {
    const o = i * 4, y = p[1] + DEB[o + 1] * t - 4.9 * t * t; if (y < p[1] - 2) continue;
    dotW(p[0] + DEB[o] * t, y, p[2] + DEB[o + 2] * t, t < .4 ? 2 : 1, t < .6 ? HOT : DUST, vis * (1 - t / 8) * (.5 + .5 * DEB[o + 3]));
  }
}

return { setProf, shot, bore, petals, trail, sheath, strike, flashA, debris, shockR, surgeR, capH, capR, gP, FIRE, DUST };
};
