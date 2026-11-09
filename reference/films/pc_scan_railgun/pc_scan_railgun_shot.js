/* SCAN · RAILGUN shot: the round through the bore, the sabot coming off, the muzzle, the flight and the burst on the
   climb (a ballistic path from the film: 50°, the burst 4.8 s out, 7.9 km up and 6.7 km out at ~2 070 m/s).
   window.RGF_INIT(ctx) -> { drawBore(T, st), drawSabot(T), drawFire(T), drawProbe(T), drawBurst(T),
   cam(T, camBase) }; window.RGX: the burst insert (slow motion at the burst, its own orbiting lens).
   T is base (old) time throughout; the film calls these from render.
   - Bore (x0.01): the round's circuit lines light and charge as it crosses the rails (pulses run along them, arcs
     jump from them to the rails).
   - Muzzle (x0.004 for MZH s): the sabot falls away in an impact frame (a radial bloom out of the muzzle decaying
     over ~0.15 s, never a full-frame flash; rays, lightning off the round); the armature's halves blow off white-hot, the plasma arc burning across them and back to
     the rail tips until it breaks; the shock rings, up to 40 m across, fill with lightning from the round's circuitry.
   - Flight: lime threads stream back off the circuit lines; small arcs jolt and jump off the rod; the bow and tail
     shock cones at the Mach angle (the readout gives the Mach number at its height); a tick and a label at every
     kilometre of path along the trail.
   - Burst (RGX): the circuit lines blaze and crack the rod open, the pieces float apart, the lightning inside charges
     and runs wild, gathers under them, each piece pulls a thread down onto the stroke's path and it leaps down; back
     at x1 the cloud swells and the film's leader and return stroke run from B_TOP (base T_LEAD..TB).
   - cam: rides the bore, brakes into a side-on hold 8.5 m off the exit (the armature's arc), drifts back as the rings
     form, latches onto the probe while it still moves at 9 m/s and rides with it as the clock comes up (the horizon
     and the coast in frame, round to its side by the burst), stays off the pieces through the burst and pulls out
     under the cloud to the film's strike lens (camStrike at TS0). Looks under 35°/s.
   Uses window.RGR (the long-rod round: draw, drawRod, sabotSeg, LINES) when it is there, the film's old round if not.
   Pure in T (u in the insert): seeded rng at load, hashes per frame bucket; no allocation in the per-dot loops. */
(function () {
'use strict';
const { V, R, X, E, rng } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;

/* ---------- the burst insert's clock. u: film s into it; sg: sim s from the top of the arc (the rod at B_TOP at sg 0).
   It opens .23 s of sim before the top while the rate falls x1 -> x0.01, holds x0.01..x0.02 while the rod comes apart,
   and is back at x1 by its end; the base take picks up at TBU + XAT with the burst at sg = SGE ---------- */
const XLEN = 7.6, XU0 = .45;
const XW = FILM.warp([{ t: 0, rate: 1 }, { t: XU0, rate: .01 }, { t: 3.4, rate: .01 }, { t: 5.0, rate: .02 }, { t: 6.5, rate: .02 }, { t: XLEN, rate: 1 }]);
const XAT = -XW(XU0), sgOf = u => XAT + XW(u), SGE = sgOf(XLEN);
let SH = null;
const XON = { on: 0 };                                                    // the insert drew this frame (the base skips the burst)
window.RGX = { len: XLEN, at: XAT, span: SGE - XAT, chapters: [{ t: 0, title: 'Burst' }], cues: [],
  build: ctx => { if (SH) SH.xbuild(ctx); }, cam: (u, ctx) => SH.xcam(u, ctx), draw: (u, ctx) => SH.xdraw(u, ctx),
  readout: (u, ctx) => SH.xread(u, ctx), tags: (u, ctx) => SH.xtags(u, ctx) };

window.RGF_INIT = function (c) {
const { ACC, BOLT, B_TOP, TS0, V_BU, HDIR, lookTurn, C, CL, DIR0, HOT, K, LB_, LIME, MO, MZ0, MZH, MZR, NUP, PATH_A, P_, S1, SIDE, TB, TBU, TF, TRET0, TRET1, T_BORE, T_LEAD, T_REL, V0, V1, WH, XF, apI, bez, bezT, camBase, climbRate, climbS, dOfS, drawRound, probeAt, roundZ, sOfD, simAt, tr, uOfD, vOfS } = c;
const hh = K.hh, UP = [0, 1, 0];
const RG = window.RGR || {}, NEWR = !!RG.draw;
const RNOSE = NEWR ? RG.NOSE : P_.RND_H, RTAIL = NEWR ? RG.REAR : -P_.RND_H, R0 = NEWR ? RG.ROD_R : .1;
const ARMZ = NEWR ? (RG.SAB_Z0 === undefined ? -.62 : RG.SAB_Z0) - .08 : -P_.RND_H - .05;     // the armature's arc (round z)
const TA = TBU + XAT;                                                     // base time of the splice
const RCX = { K, P_, CL, X, R, V, E, M3, LIME, HOT, WH, apI, tr, T: 0 };
const A1 = [0, 0, 0], A2 = [0, 0, 0], A3 = [0, 0, 0], A4 = [0, 0, 0], A5 = [0, 0, 0], PC = [0, 0, 0], TX = [0, 0, 0], KN = [0, 0, 0];
const T1 = bezT(1, [0, 0, 0]), N1 = NUP(T1);                              // the flight path at the burst (still climbing)
const GAM_BU = Math.asin(T1[1]) / DEG;
const NB0 = NUP(DIR0), U0 = V.norm(V.cross(DIR0, UP)), W0 = V.cross(U0, DIR0);
const LIME2 = [150, 230, 40], WHD = [180, 186, 176];

/* ---------- helpers ---------- */
const JG = new Float64Array(33 * 3), JM = [0, 0, 0];                      // JM: the last arc's midpoint (for branches)
/* a lightning arc a -> b: midpoint displacement re-struck per frame bucket fr (pure), n segments (power of 2) */
function jag(ax, ay, az, bx, by, bz, seed, fr, I, rough, n, core, sz) {
  if (I < .01) return;
  // small on screen: fewer segments and no glow (a far arc would pile its glow up into a block)
  let gl = LIME;
  if (K.pj(ax, ay, az)) { const x0 = K.PJ[0], y0 = K.PJ[1]; if (K.pj(bx, by, bz)) { const Ls = Math.hypot(K.PJ[0] - x0, K.PJ[1] - y0); if (Ls < 40) { gl = null; n = Ls < 8 ? 2 : 4; } } }
  for (let k = 0; k <= n; k++) { const u = k / n, o = k * 3; JG[o] = ax + (bx - ax) * u; JG[o + 1] = ay + (by - ay) * u; JG[o + 2] = az + (bz - az) * u; }
  const L = Math.hypot(bx - ax, by - ay, bz - az) * rough;
  for (let step = n; step > 1; step >>= 1) {
    const h = step >> 1, s = L * step / n;
    for (let i = 0; i + step <= n; i += step) {
      const m = (i + h) * 3, a = i * 3, b = (i + step) * 3;
      for (let q = 0; q < 3; q++) JG[m + q] = (JG[a + q] + JG[b + q]) * .5 + (hh(seed * 3.1 + (i + h) * 1.7 + q * 9.3, fr) - .5) * s;
    }
  }
  const a = Math.min(1, I), mo = (n >> 1) * 3; JM[0] = JG[mo]; JM[1] = JG[mo + 1]; JM[2] = JG[mo + 2];
  for (let k = 0; k < n; k++) { const o = k * 3; K.lineW(JG[o], JG[o + 1], JG[o + 2], JG[o + 3], JG[o + 4], JG[o + 5], 1.2, sz || 1, core, a * (1 - .3 * k / n), gl, .07, .025); }
}
/* a glow sized in metres */
function glowR(x, y, z, rw, col, a) {
  if (a < .004 || !K.pj(x, y, z)) return;
  const px = Math.min(560, rw * C.fl / K.PJ[2]); if (px < 1.5) return;
  const sx = K.PJ[0], sy = K.PJ[1]; K.softR(sx, sy, px * .6 + 1, col[0], col[1], col[2], a * .55); K.softR(sx, sy, px * .22 + .8, col[0], col[1], col[2], a * .8);   // (raster px)
}
/* a ring of light filled with lightning thrown in from near its axis (centre c, unit axes U W, radius r) */
function lightRing(c3, U, W, r, A, seed, fr, nArc, I) {
  if (A < .01 || r < .05) return;
  const n = Math.max(120, Math.min(1500, Math.round(r * 30)));
  K.ringW(c3, U, W, r, n, 2, HOT, .85 * A, seed);
  K.ringW(c3, U, W, r * .955, Math.round(n * .7), 1, LIME, .6 * A, -seed);
  K.ringW(c3, U, W, r * 1.04, Math.round(n * .5), 1, WH, .25 * A, seed * 2);
  for (let j = 0; j < nArc; j++) {
    const h = hh(seed * 13 + j, fr), th = (j + .7 * h) / nArc * TAU, th2 = th + (hh(seed * 7 + j * 3, fr) - .5) * .6, ri = r * (.02 + .1 * hh(j * 5 + seed, fr));
    const c1 = Math.cos(th) * ri, s1 = Math.sin(th) * ri, c2 = Math.cos(th2) * r, s2 = Math.sin(th2) * r;
    jag(c3[0] + U[0] * c1 + W[0] * s1, c3[1] + U[1] * c1 + W[1] * s1, c3[2] + U[2] * c1 + W[2] * s1,
      c3[0] + U[0] * c2 + W[0] * s2, c3[1] + U[1] * c2 + W[1] * s2, c3[2] + U[2] * c2 + W[2] * s2, seed * 5 + j, fr, I * A * (.55 + .45 * h), .3, 16, h > .55 ? HOT : LIME, 1);
    if (h > .4) {
      const qx = JM[0], qy = JM[1], qz = JM[2], th3 = th2 + (h - .7) * 1.1, r3 = r * (.75 + .25 * h), c4 = Math.cos(th3) * r3, s4 = Math.sin(th3) * r3;
      jag(qx, qy, qz, c3[0] + U[0] * c4 + W[0] * s4, c3[1] + U[1] * c4 + W[1] * s4, c3[2] + U[2] * c4 + W[2] * s4, seed * 9 + j, fr, I * A * .6, .4, 8, LIME, 1);
    }
  }
}

/* ---------- the circuit lines (round frame), resampled into dots; the round module's own (RGR.LINES) once it has
   them, else traces laid on the old round ---------- */
const toPts = pl => {
  if (!pl) return [];
  if (pl.pts) pl = pl.pts; else if (pl.P) pl = pl.P;
  if (pl.length && Array.isArray(pl[0])) return pl;
  if (pl.length && typeof pl[0] === 'object' && 'x' in pl[0]) return pl.map(p => [p.x, p.y, p.z]);
  const o = []; for (let i = 0; i + 2 < pl.length; i += 3) o.push([pl[i], pl[i + 1], pl[i + 2]]); return o;
};
function fallbackLines() {
  const r = rng(4242), out = [], rad = R0 * 1.03, z0 = RTAIL + (NEWR ? .16 : .03), z1 = RNOSE - (NEWR ? .14 : .12);
  const pt = (a, z) => [Math.cos(a) * rad, Math.sin(a) * rad, z];
  for (let k = 0; k < 6; k++) {
    let a = (k + .25 * r()) / 6 * TAU, z = z0 + (z1 - z0) * .12 * r();
    const pl = [pt(a, z)];
    for (let g = 0; g < 40 && z < z1; g++) {
      z = Math.min(z1, z + (z1 - z0) * (.06 + .12 * r())); pl.push(pt(a, z));
      if (z >= z1) break;
      const da = (r() < .5 ? -1 : 1) * TAU / 24, dz = Math.abs(da) * rad;
      for (let j = 1; j <= 3; j++) pl.push(pt(a + da * j / 3, z + dz * j / 3));
      a += da; z += dz;
    }
    out.push(pl);
  }
  for (let k = 0; k < 4; k++) {
    const z = z0 + (z1 - z0) * (.15 + .7 * k / 3), a0 = r() * TAU, pl = [];
    for (let j = 0; j <= 16; j++) pl.push(pt(a0 + j / 16 * PI, z));
    out.push(pl);
  }
  return out;
}
let LN = null, FR = null;
function circuit() {
  const src = RG.LINES && RG.LINES.length ? RG.LINES : null, key = src ? src.length : 0;
  if (LN && LN.src === src && LN.key === key) return LN;
  const polys = src ? src.map(toPts) : fallbackLines(), step = NEWR ? .005 : .01;
  const P = [], U = [], LI = [];
  polys.forEach((pl, li) => {
    if (pl.length < 2) return;
    let tot = 0; for (let i = 1; i < pl.length; i++) tot += V.dist(pl[i - 1], pl[i]);
    let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i], L = V.dist(a, b), n = Math.max(1, Math.ceil(L / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) { const t = k / n; P.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); U.push((acc + L * t) / Math.max(1e-6, tot)); LI.push(li); }
      acc += L;
    }
  });
  LN = { src, key, P: new Float32Array(P), U: new Float32Array(U), LI: new Float32Array(LI), n: P.length / 3 };
  FR = null;
  return LN;
}
const lp = (Lw, i, out) => { const P = LN.P; return apI(Lw, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], out); };
/* the circuit lines lit (I) on a round at Lw: the round module's circuit FX (streaks running to the nose), else
   dots with pulses running along them (t: film time) */
const LOPT = { glow: 0, T: 0, sp: 1.6, n: 2, a: 1, md: 0, Ls: null };
function drawLines(Lw, I, t, spd) {
  if (I < .01) return;
  if (NEWR && RG.lines) { LOPT.glow = Math.min(1, I); LOPT.T = t; LOPT.sp = 1.6 * spd / 2.2; LOPT.n = spd > 3 ? 3 : 2; LOPT.a = Math.min(1.2, .4 + I); RG.lines(Lw, LOPT); return; }
  const ln = circuit(); if (!ln.n) return;
  const P = ln.P, M = Lw.R, tt = Lw.T;
  for (let i = 0; i < ln.n; i++) {
    const o = i * 3, x = P[o], y = P[o + 1], z = P[o + 2];
    if (!K.pj(M[0] * x + M[1] * y + M[2] * z + tt[0], M[3] * x + M[4] * y + M[5] * z + tt[1], M[6] * x + M[7] * y + M[8] * z + tt[2])) continue;
    let ph = (ln.U[i] * 2.5 - t * spd + ln.LI[i] * .37) % 1; if (ph < 0) ph += 1;
    const pu = ph < .14 ? 1 - ph / .14 : 0, col = pu > .35 ? HOT : LIME;
    K.dot(K.PJ[0], K.PJ[1], pu > .6 ? 2 : 1, col[0], col[1], col[2], I * (.5 + .5 * pu));
  }
}

/* ---------- the rod in pieces (round frame): lattice dots on its surface, fins and the faces of the cuts; each
   assigned to a fragment (a slice between two wavy cuts, split into one to three staves). Boundary dots crack
   (light) as a front runs from the nose and out from the circuit lines; each fragment drifts out along its own
   direction and tumbles ---------- */
const FM = new Float64Array(96 * 12);
const SG = u => sgOf(u);
const CRK0 = SG(.6), CRK1 = SG(2.05);
function frags() {
  const ln = circuit(); if (FR && FR.ln === ln) return FR;
  const r = rng(7311), z0 = RTAIL, z1 = RNOSE;
  const nz = NEWR && RG.NOSE_Z !== undefined ? RG.NOSE_Z : z1 - .12;
  const prof = z => NEWR ? (z > nz ? (t => R0 * Math.max(.05, Math.pow(1 - t, .72) * (1 + .25 * t * (1 - t))))((z - nz) / (z1 - nz)) : R0)
    : (z < .12 ? .1 : z < .25 ? .1 - .02 * (z - .12) / .13 : .08 - .035 * (z - .25) / .08);
  const NS = NEWR ? 12 : 6, cut = [];
  for (let i = 1; i < NS; i++) cut.push(z0 + (z1 - z0) * (i + (r() - .5) * .5) / NS);
  const ph = cut.map(() => [r() * TAU, r() * TAU]), amp = NEWR ? .016 : .03;
  const cutZ = (i, th) => cut[i] + amp * (.6 * Math.sin(3 * th + ph[i][0]) + .4 * Math.sin(5 * th + ph[i][1]));
  const nsec = [], soff = [], base = []; let nf = 0;
  for (let s = 0; s < NS; s++) { const k = NEWR ? (r() < .3 ? 1 : r() < .55 ? 2 : 3) : 3; nsec.push(k); soff.push(r() * TAU); base.push(nf); nf += k; }
  const segOf = (z, th) => { let s = 0; while (s < NS - 1 && z > cutZ(s, th)) s++; return s; };
  const wob = (s, z) => .14 * Math.sin(z * 31 + s * 2.3);
  const secA = (s, th, z) => ((th + wob(s, z) - soff[s]) % TAU + TAU) % TAU * nsec[s] / TAU;
  const sp = TAU * R0 / (NEWR ? 28 : 40), D = [];
  const bd = (x, y, z) => {
    const th = Math.atan2(y, x), s = segOf(z, th); let d = 9;
    if (s > 0) d = Math.min(d, Math.abs(z - cutZ(s - 1, th)));
    if (s < NS - 1) d = Math.min(d, Math.abs(cutZ(s, th) - z));
    if (nsec[s] > 1) { const a = secA(s, th, z), f = a - Math.floor(a); d = Math.min(d, Math.min(f, 1 - f) * TAU / nsec[s] * Math.max(Math.hypot(x, y), R0 * .4)); }
    return d;
  };
  const add = (x, y, z, kind) => { const th = Math.atan2(y, x), s = segOf(z, th); D.push(x, y, z, base[s] + Math.min(nsec[s] - 1, Math.floor(secA(s, th, z))), bd(x, y, z) < sp * 1.05 ? -1 : 99, kind); };
  const na = NEWR ? 28 : 40;
  for (let z = z0 + sp * .5; z < z1 - sp * .2; z += sp) {
    const rr = prof(z), m = Math.max(3, Math.round(na * rr / R0));
    for (let j = 0; j < m; j++) { const th = j / m * TAU; add(Math.cos(th) * rr, Math.sin(th) * rr, z, j % 7 === 0 ? 1 : 0); }
  }
  for (const [zc, rc] of [[z0, R0], [z1, NEWR ? 0 : prof(z1)]]) {
    add(0, 0, zc, 1);
    for (let rr = sp; rr < rc; rr += sp) { const m = Math.max(3, Math.round(TAU * rr / sp)); for (let j = 0; j < m; j++) { const th = j / m * TAU; add(Math.cos(th) * rr, Math.sin(th) * rr, zc, 0); } }
  }
  // six swept fins at the tail (root z -.996 .. -.86, tip -.992 .. -.945, out to FIN_R)
  if (NEWR) for (let f = 0; f < 6; f++) {
    const th = (f + .5) / 6 * TAU, cx = Math.cos(th), sy = Math.sin(th), fs = .004, FR_ = RG.FIN_R || .035;
    for (let rr = R0 + fs * .5; rr <= FR_ + 1e-6; rr += fs) {
      const t = (rr - R0) / (FR_ - R0), za = -.996 + .004 * t, zb = -.86 - .085 * t;
      for (let z = za; z <= zb + 1e-6; z += fs) add(cx * rr, sy * rr, z, rr > FR_ - fs * .6 || z < za + fs * .6 || z > zb - fs * .6 ? 1 : 2);
    }
  }
  for (let i = 0; i < NS - 1; i++) for (const e of [-1, 1]) for (let rr = sp * .5; rr < prof(cut[i]) * .97; rr += sp * .8) {
    const m = Math.max(3, Math.round(TAU * rr / (sp * .8)));
    for (let j = 0; j < m; j++) { const th = j / m * TAU; add(Math.cos(th) * rr, Math.sin(th) * rr, cutZ(i, th) + e * .0015, 3); }
  }
  const n = D.length / 6, LP = ln.P, nl = ln.n, stL = Math.max(1, Math.floor(nl / 700)), dl = new Float32Array(n);
  let dmax = 1e-6;
  for (let i = 0; i < n; i++) {
    if (D[i * 6 + 4] !== -1) continue;
    const x = D[i * 6], y = D[i * 6 + 1], z = D[i * 6 + 2]; let b = 1e9;
    for (let j = 0; j < nl; j += stL) { const dx = LP[j * 3] - x, dy = LP[j * 3 + 1] - y, dz = LP[j * 3 + 2] - z, q = dx * dx + dy * dy + dz * dz; if (q < b) b = q; }
    dl[i] = nl ? Math.sqrt(b) : 0; if (dl[i] > dmax) dmax = dl[i];
  }
  for (let i = 0; i < n; i++) if (D[i * 6 + 4] === -1) {
    const fz = (z1 - D[i * 6 + 2]) / (z1 - z0);
    D[i * 6 + 4] = CRK0 + (CRK1 - CRK0) * Math.min(1, (.55 * fz + .45 * Math.pow(dl[i] / dmax, .8)) * (.88 + .12 * r()));
  }
  // fragment centres, drift directions, spin
  const c3 = new Float64Array(nf * 3), cnt = new Float64Array(nf);
  for (let i = 0; i < n; i++) { const f = D[i * 6 + 3]; c3[f * 3] += D[i * 6]; c3[f * 3 + 1] += D[i * 6 + 1]; c3[f * 3 + 2] += D[i * 6 + 2]; cnt[f]++; }
  const dir = new Float64Array(nf * 3), ax = new Float64Array(nf * 3), kf = new Float64Array(nf), wf = new Float64Array(nf);
  const zm = (z0 + z1) / 2, hl = (z1 - z0) / 2;
  for (let f = 0; f < nf; f++) {
    const k = Math.max(1, cnt[f]); c3[f * 3] /= k; c3[f * 3 + 1] /= k; c3[f * 3 + 2] /= k;
    let rx = c3[f * 3], ry = c3[f * 3 + 1]; const rl = Math.hypot(rx, ry);
    if (rl < R0 * .15) { const a = r() * TAU; rx = Math.cos(a); ry = Math.sin(a); } else { rx /= rl; ry /= rl; }
    let vx = rx + (r() - .5) * .6, vy = ry + (r() - .5) * .6, vz = (c3[f * 3 + 2] - zm) / hl * .9 + (r() - .5) * .4; const vl = Math.hypot(vx, vy, vz);
    dir[f * 3] = vx / vl; dir[f * 3 + 1] = vy / vl; dir[f * 3 + 2] = vz / vl;
    let qx = r() - .5, qy = r() - .5, qz = r() - .5; const ql = Math.hypot(qx, qy, qz) || 1;
    ax[f * 3] = qx / ql; ax[f * 3 + 1] = qy / ql; ax[f * 3 + 2] = qz / ql;
    kf[f] = .55 + .9 * r(); wf[f] = (r() < .5 ? -1 : 1) * (.8 + 1.8 * r());
  }
  // the dots either side of each cut (the arcs across the gaps), the circuit lines' fragments
  const cutA = [], cutB = [];
  for (let i = 0; i < NS - 1; i++) {
    const a_ = [], b_ = [];
    for (let j = 0; j < n; j++) { if (D[j * 6 + 4] > 90 || D[j * 6 + 5] === 3) continue; const th = Math.atan2(D[j * 6 + 1], D[j * 6]), dz = D[j * 6 + 2] - cutZ(i, th); if (Math.abs(dz) < sp * 1.1) (dz < 0 ? a_ : b_).push(j); }
    cutA.push(Int32Array.from(a_.length ? a_ : [0])); cutB.push(Int32Array.from(b_.length ? b_ : [0]));
  }
  const LF = new Int16Array(nl);
  for (let i = 0; i < nl; i++) { const x = LP[i * 3], y = LP[i * 3 + 1], z = LP[i * 3 + 2], th = Math.atan2(y, x), s = segOf(z, th); LF[i] = base[s] + Math.min(nsec[s] - 1, Math.floor(secA(s, th, z))); }
  FR = { ln, n, D: new Float32Array(D), nf: Math.min(nf, 96), c3, dir, ax, kf, wf, NS, cut, base, cutA, cutB, LF };
  return FR;
}
/* fragment transforms for this frame: Lw the round's frame, sp the drift (m, times each fragment's own factor),
   rot the tumble (rad, times each one's rate) */
function fragXf(Lw, sp, rot) {
  const F = FR, M = Lw.R, t = Lw.T;
  for (let f = 0; f < F.nf; f++) {
    const o = f * 12, f3 = f * 3, ax = F.ax[f3], ay = F.ax[f3 + 1], az = F.ax[f3 + 2], ang = F.wf[f] * rot, cs = Math.cos(ang), sn = Math.sin(ang), ic = 1 - cs;
    const r00 = cs + ax * ax * ic, r01 = ax * ay * ic - az * sn, r02 = ax * az * ic + ay * sn;
    const r10 = ay * ax * ic + az * sn, r11 = cs + ay * ay * ic, r12 = ay * az * ic - ax * sn;
    const r20 = az * ax * ic - ay * sn, r21 = az * ay * ic + ax * sn, r22 = cs + az * az * ic;
    const cx = F.c3[f3], cy = F.c3[f3 + 1], cz = F.c3[f3 + 2], k = F.kf[f] * sp;
    const lx = cx + F.dir[f3] * k - (r00 * cx + r01 * cy + r02 * cz), ly = cy + F.dir[f3 + 1] * k - (r10 * cx + r11 * cy + r12 * cz), lz = cz + F.dir[f3 + 2] * k - (r20 * cx + r21 * cy + r22 * cz);
    FM[o] = M[0] * r00 + M[1] * r10 + M[2] * r20; FM[o + 1] = M[0] * r01 + M[1] * r11 + M[2] * r21; FM[o + 2] = M[0] * r02 + M[1] * r12 + M[2] * r22;
    FM[o + 3] = M[3] * r00 + M[4] * r10 + M[5] * r20; FM[o + 4] = M[3] * r01 + M[4] * r11 + M[5] * r21; FM[o + 5] = M[3] * r02 + M[4] * r12 + M[5] * r22;
    FM[o + 6] = M[6] * r00 + M[7] * r10 + M[8] * r20; FM[o + 7] = M[6] * r01 + M[7] * r11 + M[8] * r21; FM[o + 8] = M[6] * r02 + M[7] * r12 + M[8] * r22;
    FM[o + 9] = M[0] * lx + M[1] * ly + M[2] * lz + t[0]; FM[o + 10] = M[3] * lx + M[4] * ly + M[5] * lz + t[1]; FM[o + 11] = M[6] * lx + M[7] * ly + M[8] * lz + t[2];
  }
}
const fp = (f, x, y, z, out) => { const o = f * 12; out[0] = FM[o] * x + FM[o + 1] * y + FM[o + 2] * z + FM[o + 9]; out[1] = FM[o + 3] * x + FM[o + 4] * y + FM[o + 5] * z + FM[o + 10]; out[2] = FM[o + 6] * x + FM[o + 7] * y + FM[o + 8] * z + FM[o + 11]; return out; };
const fd = (i, out) => { const D = FR.D, o = i * 6; return fp(D[o + 3], D[o], D[o + 1], D[o + 2], out); };

/* the rod drawn whole: the round module's rod, else the film's old probe body */
function rodDraw(Lw, glow, Tf, br) {
  if (br < .01) return;
  MO.lime = .35; MO.a = 1.6 * br; MO.S = null; MO.md = 0; MO.keep = 1;
  if (NEWR && RG.drawRod) { RCX.T = Tf; RG.drawRod(Lw, MO, glow, RCX); }
  else if (!NEWR) P_.drawX(CL.round, Lw, MO);
  else { frags(); fragXf(Lw, 0, 0); MO.lime = 0; MO.a = 1.25; fragDots(-1e9, br, 0, 0); return; }
  MO.lime = 0; MO.a = 1.25;
}
/* the fragments' dots: sg sim time (cracks lit once their front has passed), A brightness, lit the light inside */
function fragDots(sg, A, lit, fade) {
  const F = FR, D = F.D, n = F.n, hotW = SG(.85) - SG(.6), lc = Math.max(0, lit);
  for (let i = 0; i < n; i++) {
    const o = i * 6, kind = D[o + 5], tc = D[o + 4], cr = sg > tc;
    if (kind === 3 && !cr) continue;
    const f = D[o + 3], q = f * 12, x = D[o], y = D[o + 1], z = D[o + 2];
    if (!K.pj(FM[q] * x + FM[q + 1] * y + FM[q + 2] * z + FM[q + 9], FM[q + 3] * x + FM[q + 4] * y + FM[q + 5] * z + FM[q + 10], FM[q + 6] * x + FM[q + 7] * y + FM[q + 8] * z + FM[q + 11])) continue;
    let col = WH, a = A * (kind === 1 ? .8 : kind === 2 ? .55 : .36), s = 1;
    if (cr) {
      const e = sg - tc;
      if (e < hotW) { col = HOT; a = A; s = 2; } else { col = kind === 3 ? LIME : e < 3 * hotW ? LIME : LIME2; a = A * (.45 + .55 * lc) * (kind === 3 ? .9 : 1); s = kind === 3 ? 1 : 2; }
    }
    if (fade) a *= 1 - fade * (.5 + .5 * hh(i, 3.7));
    K.dot(K.PJ[0], K.PJ[1], s, col[0], col[1], col[2], a);
  }
}

/* ---------- the bore (x0.01): the round crossing the rails, its circuit lines charging ---------- */
const PLUME = (() => { const r = rng(717), A = new Float32Array(320 * 5); for (let i = 0; i < 320; i++) { const a = r() * TAU, s = r(); A[i * 5] = Math.cos(a) * s; A[i * 5 + 1] = Math.sin(a) * s; A[i * 5 + 2] = 2 + 34 * r() * r(); A[i * 5 + 3] = .3 + 1.3 * r(); A[i * 5 + 4] = r(); } return A; })();
const SHOCK = (() => { const r = rng(616), A = new Float32Array(600 * 3); for (let i = 0; i < 600; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(a) * h; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(a) * h; } return A; })();
function drawBore(T, st) {
  if (T < T_REL || T >= TF) return;
  const z = roundZ(T), U = X.dir(XF.B, [1, 0, 0]), W = X.dir(XF.B, [0, 1, 0]);
  const v = ACC * (simAt(T) + T_BORE), q = v / V0, za = z + ARMZ;
  const Lr = X.mul(XF.B, tr(0, 0, z));
  // the round is seen through the barrel: an X-ray window over it (the containment's occluder lifted for it)
  P_.occReset(); xwin(z, U, W, T);
  MO.lime = .55; MO.a = 1.6; MO.S = null; MO.keep = 1; MO.md = 0;
  drawRound(Lr, null, 0, MO, .35 + .65 * q);
  MO.lime = 0; MO.a = 1.25;
  // the circuit lines charge: pulses race along them faster as it gathers speed, arcs jump from them to the rails
  drawLines(Lr, .55 + .45 * q, T, 1.5 + 5 * q);
  const ln = circuit(), fr = Math.floor(T * 30);
  if (ln.n) for (let i = 0; i < 6 + Math.round(6 * q); i++) {
    const h = hh(i * 4.1 + 1, fr), k = Math.floor(hh(i * 2.7, fr) * ln.n) % ln.n, P = ln.P;
    lp(Lr, k, A1); apI(XF.B, (hh(i * 6.1, fr) - .5) * .16, P[k * 3 + 1] >= 0 ? .15 : -.15, z + P[k * 3 + 2] + (h - .5) * .3, A2);
    jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], i + 3, fr, .5 + .5 * q, .5, 8, h > .5 ? HOT : LIME, 1);
  }
  // and arcs skipping along the rod from trace to trace, more of them as it gathers speed
  if (ln.n) for (let i = 0; i < 3 + Math.round(5 * q); i++) {
    const k1 = Math.floor(hh(i * 3.9 + 7, fr) * ln.n) % ln.n, k2 = (k1 + 20 + Math.floor(hh(i * 8.3, fr) * 140)) % ln.n;
    lp(Lr, k1, A1); lp(Lr, k2, A2);
    jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], i + 31, fr, .55 + .45 * q, .45, 8, hh(i, fr + 3) > .5 ? HOT : LIME, 1);
  }
  // the rails behind it carry the current: white-hot from the breech to the armature
  const z0 = P_.RZ0;
  for (const y of [.18, -.18]) {
    apI(XF.B, 0, y, z0, A1); apI(XF.B, 0, y, za, A2);
    K.lineW(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], 1, 2, HOT, .95, LIME, .2, .08);
  }
  // the armature: an arc sheet across the rails at the sabot's base
  apI(XF.B, 0, 0, za, A1); K.glowW(A1[0], A1[1], A1[2], 60 + 60 * q, HOT, .9); K.glowW(A1[0], A1[1], A1[2], 160, LIME, .35);
  const fr60 = Math.floor(T * 60);
  for (let i = 0; i < 9; i++) { const h = hh(i * 3.1, fr60); apI(XF.B, (h - .5) * .14, .17, za + .02 - .05 * h, A2); apI(XF.B, (hh(i * 7.7, fr60) - .5) * .14, -.17, za + .02, A3); K.arcW(A2, A3, i + fr60 * .1, T, 1, .5); }
  // the field: rings round the barrel at the armature, trailing back
  for (let k = 0; k < 5; k++) { apI(XF.B, 0, 0, za - k * .35, A1); K.ringW(A1, U, W, .62 + .1 * k, 120, k ? 1 : 2, k ? LIME : HOT, (1 - k * .18) * (.6 + .4 * q), T * 9 + k); }
  // plasma blown out past the sabot, streaming back down the bore; lime threads behind the round
  for (let i = 0; i < 90; i++) {
    const h = hh(i * 1.7, fr60), a = hh(i * 2.9, fr60) * TAU, d = h * 1.6;
    apI(XF.B, Math.cos(a) * .12, Math.sin(a) * .17, za - d, A1); K.dotW(A1[0], A1[1], A1[2], 1, h < .3 ? HOT : LIME, .9 * (1 - h));
  }
  for (let j = 0; j < 8; j++) {
    const a = j / 8 * TAU + .3, rr = .04 + .05 * (j & 1);
    apI(XF.B, Math.cos(a) * rr, Math.sin(a) * rr, za - .05, A1); apI(XF.B, Math.cos(a) * rr * 1.8, Math.sin(a) * rr * 1.4, za - .9 - 1.6 * q, A2);
    K.lineW(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], 1.3, 1, LIME, .65 * (.4 + .6 * q), LIME, .06, 0);
  }
  // the bands flash as it passes (the clamps take the load)
  for (const zb of P_.BANDS) { const d = z - zb; if (d < 0 || d > 1.4) continue; apI(XF.B, 0, 0, zb + .05, A1); K.ringW(A1, U, W, .74, 60, 2, HOT, 1 - d / 1.4, 0); }
}

/* the X-ray window on the barrel's side facing the lens, riding with the round: dotted edges, corner brackets, a scan
   line running along it */
function xwin(z, U, W, T) {
  apI(XF.B, 0, 0, z, A1); const sx = (C.eye[0] - A1[0]) * U[0] + (C.eye[1] - A1[1]) * U[1] + (C.eye[2] - A1[2]) * U[2] > 0 ? .39 : -.39;
  const z0 = z + RTAIL - .3, z1 = z + RNOSE + .3, y0 = -.39, y1 = .39, bl = .16;
  const L = (ya, za, yb, zb, a, sz) => { apI(XF.B, sx, ya, za, A2); apI(XF.B, sx, yb, zb, A3); K.lineW(A2[0], A2[1], A2[2], A3[0], A3[1], A3[2], 2.2, sz, LIME, a); };
  L(y0, z0, y0, z1, .3, 1); L(y1, z0, y1, z1, .3, 1); L(y0, z0, y1, z0, .3, 1); L(y0, z1, y1, z1, .3, 1);
  for (const [yc, zc, dy, dz] of [[y0, z0, 1, 1], [y1, z0, -1, 1], [y0, z1, 1, -1], [y1, z1, -1, -1]]) { L(yc, zc, yc + dy * bl, zc, .95, 2); L(yc, zc, yc, zc + dz * bl, .95, 2); }
  const zs = z0 + (z1 - z0) * ((T * 1.7) % 1); L(y0, zs, y1, zs, .55, 1);
}

/* ---------- the muzzle: the impact frame, the sabot, the lightning rings ---------- */
const SAB_TAU = .05, SAB_VR = 140, SAB_TR = .25, IMP = .0016;
/* the round's frame in flight (sim time a after the muzzle; +Z along the path, its roll kept from the bore) */
function flightXf(s) { const u = uOfD(dOfS(s)); bez(u, A4); bezT(u, A5); return X.make(R.look(A5, UP), A4.slice()); }
function drawSabot(T) {
  const a = simAt(T); if (a < 0 || a > 1.6) return;
  const fwd = V0 * SAB_TAU * (1 - Math.exp(-a / SAB_TAU)), rad = SAB_VR * SAB_TR * (1 - Math.exp(-a / SAB_TR)) + .45 * (1 - Math.exp(-a / .0007));
  const Rb = XF.B.R, imp = a < IMP ? 1 - a / IMP : 0, seg = NEWR && RG.sabotSeg;
  const Lrod = a < .012 ? flightXf(climbS(T)) : null, fr = Math.floor(T * 30), zs0 = NEWR ? RG.SAB_Z0 : -P_.RND_H, zs1 = NEWR ? RG.SAB_Z1 : .27, rs = NEWR ? RG.SAB_R : .1;
  for (let k = 0; k < 3; k++) {
    const ang = k * TAU / 3, cs = Math.cos(ang), sn = Math.sin(ang);
    const rd = X.dir(XF.B, [cs, sn, 0]);
    const p = V.add(V.add(V.mad(MZ0, DIR0, fwd), V.mul(rd, rad)), [0, -4.9 * a * a, 0]);
    // tumble: pitched out about the petal's own hinge (square to the bore and its radial)
    const pit = Math.min(2.6, a * 70 + a * a * 20 + .3 * (1 - Math.exp(-a / .0009))), Lp = X.make(R.mul(Rb, R.mul(R.z(ang), R.y(pit))), p);
    MO.lime = Math.max(.3 * Math.exp(-a * 8), .65 * Math.exp(-a * 60), imp); MO.a = 1.8 + 1.2 * imp; MO.S = null; MO.keep = 1; MO.md = 0;
    if (seg) { const s = RG.sabotSeg(k), Ls = X.mul(Lp, X.make(R.z(-ang), [0, 0, 0])); if (typeof s === 'function') s(Ls, MO, RCX); else if (s && s.draw) s.draw(Ls, MO, RCX); else if (s) P_.drawX(s, Ls, MO); }
    else P_.drawX(CL.sabot, Lp, MO);
    MO.lime = 0; MO.a = 1.25;
    if (a < .05) K.glowW(p[0], p[1], p[2], 12, HOT, .7 * (1 - a / .05));
    // lime lightning off the round's circuit lines onto the petal as it lets go
    if (Lrod && circuit().n) for (let j = 0; j < 3; j++) {
      const h = hh(k * 7 + j, fr), i = Math.floor(hh(k * 3 + j * 5, fr) * LN.n) % LN.n;
      lp(Lrod, i, A1); apI(Lp, rs * (.6 + .4 * h), (hh(j, fr + k) - .5) * rs * .5, zs0 + (zs1 - zs0) * hh(j * 9 + k, fr), A2);
      jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], k * 11 + j, fr, (1 - a / .012) * (.6 + .4 * h) + imp, .45, 16, h > .4 ? HOT : LIME, 1);
    }
  }
  if (NEWR && RG.CL && RG.CL.armA && a < .03) drawArmature(a, T, Rb);
  // their tags while the lens holds at the muzzle
  if (T > TF && T < TF + MZH + .6) {
    const rd = X.dir(XF.B, [1, 0, 0]), pS = V.add(V.mad(MZ0, DIR0, fwd), V.mul(rd, rad)), w = (t0, t1) => E.sat((T - t0) / .25) * (1 - E.sat((T - t1 + .4) / .4));
    tagW(TG_SAB, 'SAB', 'Sabot ×3 · discarding', '', pS, w(TF + .35, TF + 2.9), T - TF - .35, T);
    if (NEWR) tagW(TG_ARM, 'ARM', 'Armature · plasma arc', '', AP[0], w(TF + .15, TF + 1.7), T - TF - .15, T);
  }
}
const TG_SAB = K.mkTag(), TG_ARM = K.mkTag();
function tagW(tg, id, lab, val, p, a, age, T) {
  if (a < .01 || !K.pj(p[0], p[1], p[2])) return;
  const x = K.PJ[0], y = K.PJ[1], S = K.S;
  K.leader(x, y, x + 46 * S, y - 46 * S, '#C6F432', .8 * a); K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
  K.setTag(tg, id, K.decode(lab, E.sat(age / .6), T, id.length), val, 'lime sm', x + 50 * S, y - 60 * S, a);
}
/* the armature: its two halves blown off the sabot's rear face, white-hot and tumbling apart; the plasma arc burns
   across the gap between them and back to the rail tips at the muzzle (the current's last path), stretching out
   until it breaks */
const AP = [[0, 0, 0], [0, 0, 0]], ATIP = [0, 0, 0];
function drawArmature(a, T, Rb) {
  const zc = (RG.ARM_Z0 + RG.ARM_Z1) / 2, fwd = V0 * .022 * (1 - Math.exp(-a / .022)), sep = 38 * .12 * (1 - Math.exp(-a / .12)), yB = X.dir(XF.B, [0, 1, 0]);
  const fr = Math.floor(T * 40), hot = Math.exp(-a / .004), arcI = Math.exp(-a / .0025) * Math.min(1, .3 + a / .0002), MZE = P_.MZ_E;
  for (let k = 0; k < 2; k++) {
    const sd = k ? -1 : 1, c = [0, sd * .1, zc], Rk = R.mul(Rb, R.x(sd * Math.min(2.4, a * 90))), rb = R.ap(Rb, c), rk = R.ap(Rk, c), p = AP[k];
    for (let q = 0; q < 3; q++) p[q] = MZ0[q] + rb[q] + DIR0[q] * fwd + yB[q] * sd * sep;
    p[1] -= 4.9 * a * a;
    MO.lime = .4 + .6 * hot; MO.a = 1.5 + hot; MO.S = null; MO.keep = 1; MO.md = 0;
    P_.drawX(k ? RG.CL.armB : RG.CL.armA, X.make(Rk, [p[0] - rk[0], p[1] - rk[1], p[2] - rk[2]]), MO);
    MO.lime = 0; MO.a = 1.25;
    glowR(p[0], p[1], p[2], .2 + .5 * hot, HOT, .75 * hot);
    // back to its rail's tip: two strands, white-hot cores, and a lime one wandering wider
    if (arcI > .02) {
      apI(XF.B, MZE[0], MZE[1] + sd * .15, MZE[2], ATIP);
      for (let j = 0; j < 3; j++) jag(ATIP[0], ATIP[1], ATIP[2], p[0] + yB[0] * sd * .04, p[1] + yB[1] * sd * .04, p[2] + yB[2] * sd * .04, 71 + k * 7 + j, fr, arcI * (j < 2 ? 1 : .6), j < 2 ? .3 : .5, 16, j < 2 ? HOT : LIME, j ? 1 : 2);
      glowR(ATIP[0], ATIP[1], ATIP[2], .5 * arcI + .1, HOT, .6 * arcI);
    }
  }
  // across the gap between the halves: the arc at the armature, a bright knot in the middle
  const g = Math.exp(-a / .005) * Math.min(1, .4 + a / .0003);
  if (g > .02) {
    for (let j = 0; j < 3; j++) jag(AP[0][0], AP[0][1], AP[0][2], AP[1][0], AP[1][1], AP[1][2], 81 + j, fr, g * (j ? .7 : 1), .35 + .15 * j, 16, j === 2 ? LIME : HOT, j ? 1 : 2);
    glowR((AP[0][0] + AP[1][0]) / 2, (AP[0][1] + AP[1][1]) / 2, (AP[0][2] + AP[1][2]) / 2, .35 + 1.2 * (1 - g), HOT, .8 * g);
  }
}
/* the shock rings: [distance down the line of fire, radius, growth (sim s)]: each forms as the round passes */
const RINGS = [[2.5, 14, .0022], [8, 20, .0026], [16, 26, .003], [28, 31, .0034], [46, 36, .0038], [72, 42, .0042]];
const RC = [0, 0, 0];
function muzzleRings(a, T) {
  const fr = Math.floor(T * 30), dR = dOfS(Math.max(0, a)), Lrod = a < .03 ? flightXf(Math.max(0, a)) : null;
  for (let k = 0; k < RINGS.length; k++) {
    const [d, Rk, tau] = RINGS[k], ak = a - d / V0; if (ak < 0) continue;
    const A = Math.min(1, ak / .00025) * (1 - E.ss(.012, .05, ak)); if (A < .01) continue;
    const r = Rk * (1 - Math.exp(-ak / tau)) + 25 * ak;
    RC[0] = MZ0[0] + DIR0[0] * d; RC[1] = MZ0[1] + DIR0[1] * d; RC[2] = MZ0[2] + DIR0[2] * d;
    lightRing(RC, U0, W0, r, A, k + 1, fr, 9, 1);
    // the round's own arcs out to the ring it has just made
    const near = dR - d;
    if (Lrod && near > 0 && near < 1.6 * Rk && LN.n) for (let j = 0; j < 5; j++) {
      const h = hh(k * 17 + j, fr), i = Math.floor(hh(k * 5 + j * 3, fr) * LN.n) % LN.n, th = hh(j * 3 + k, fr + 1) * TAU;
      lp(Lrod, i, A1);
      jag(A1[0], A1[1], A1[2], RC[0] + (U0[0] * Math.cos(th) + W0[0] * Math.sin(th)) * r, RC[1] + (U0[1] * Math.cos(th) + W0[1] * Math.sin(th)) * r, RC[2] + (U0[2] * Math.cos(th) + W0[2] * Math.sin(th)) * r,
        k * 23 + j, fr, A * (1 - near / (1.6 * Rk)) * (.6 + .4 * h), .35, 16, HOT, 1);
    }
  }
}
/* the impact frame as the sabot lets go: a radial bloom out of the muzzle, white at its heart, decaying over ~0.15 s
   (film time: never a full-frame flash), and rays bursting out from it across the frame */
function bloom(T) {
  const tf = T - TF; if (tf < 0 || tf > .24) return;
  if (!K.pj(MZ0[0] + DIR0[0] * 1.5, MZ0[1] + DIR0[1] * 1.5, MZ0[2] + DIR0[2] * 1.5)) return;
  const sx = K.PJ[0], sy = K.PJ[1], k = Math.exp(-tf / .05) * Math.min(1, tf / .012 + .35), S = K.S;
  K.softR(sx, sy, 820 * S, 214, 238, 190, .32 * k);
  K.softR(sx, sy, 330 * S, 236, 250, 220, .6 * k);
  K.softR(sx, sy, 90 * S, 255, 255, 244, 1.1 * k);
}
function impact(a, T) {
  bloom(T);
  if (a < 0 || a > IMP) return;
  const f = Math.floor((T - TF) * 60), k = 1 - a / IMP;
  if (!K.pj(MZ0[0] + DIR0[0] * 1.5, MZ0[1] + DIR0[1] * 1.5, MZ0[2] + DIR0[2] * 1.5)) return;
  const sx = K.PJ[0], sy = K.PJ[1], str = (f % 2 ? 1 : .55) * (.4 + .6 * k);
  for (let i = 0; i < 80; i++) {
    const th = (i + .7 * hh(i, 3.3 + f)) / 80 * TAU, cs = Math.cos(th), sn = Math.sin(th);
    const r0 = (26 + 150 * hh(i, 5.5 + f)) * K.S, r1 = r0 + (220 + 1500 * Math.pow(hh(i, 7.7 + f), 2)) * K.S, hot = hh(i, 9.1) > .68, col = hot ? HOT : LIME, s = i % 5 ? 1 : 2;
    for (let rr = r0; rr < r1; rr += 2.2) {
      const x = sx + cs * rr, y = sy + sn * rr; if (x < 0 || y < 0 || x >= K.BW || y >= K.BH) break;
      const t = (rr - r0) / (r1 - r0);
      K.dot(x, y, s, col[0], col[1], col[2], str * (1 - t) * (1 - t));
    }
  }
}
function drawFire(T) {
  const a = simAt(T); if (a < 0 || a > 3.2) return;
  const m = MZ0, d = DIR0, U = U0, W = W0;
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
  // the lime streak down the line of fire
  if (a < .5) {
    const L = 30 * Math.min(1, a / .004) + 900 * a, jA = Math.exp(-a * 7);
    K.lineW(m[0], m[1], m[2], m[0] + d[0] * L, m[1] + d[1] * L, m[2] + d[2] * L, 1.2, 2, HOT, jA, LIME, .12 * jA, .04 * jA);
  }
  if (a < .6) { K.glowW(m[0] + d[0] * 6, m[1] + d[1] * 6, m[2] + d[2] * 6, 120, LIME, .5 * Math.exp(-a * 5) * Math.min(1, a / .01)); }
  muzzleRings(a, T);
  if (a < 1.8) {
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
  impact(a, T);
}

/* ---------- the flight: the trail (smoke column, the glowing line, the wake), threads off the circuit lines, arcs
   jolting off the rod ---------- */
const TRN_N = 4200, TRAIL = (() => {                                       // u, sim time passed, angle, spread, distance
  const A = new Float32Array(TRN_N * 5), r = rng(3131);
  for (let i = 0; i < TRN_N; i++) {
    const d = c.ARC.len * Math.pow((i + .5) / TRN_N, 1.4);
    A[i * 5] = uOfD(d); A[i * 5 + 1] = sOfD(d);
    A[i * 5 + 2] = r() * TAU; A[i * 5 + 3] = r(); A[i * 5 + 4] = d;
  }
  return A;
})();
const NWAKE = 520;
/* s: sim time the probe has reached (its arc distance dOfS(s)); after: sim s since it got there (ages the trail);
   vis: fade; wake: draw the heated air close behind it; pEnd: where the line ends (the rod's tail) */
function drawTrail(s, after, vis, wake, pEnd) {
  const ALEN = c.ARC.len;
  for (let i = 0; i < TRN_N; i++) {
    const o = i * 5, sp = TRAIL[o + 1]; if (sp > s) break;
    const age = s - sp + after, u = TRAIL[o], k = TRAIL[o + 4] / ALEN;
    bez(u, A1);
    const drift = 1 + 9 * Math.sqrt(age) * (.15 + k), ang = TRAIL[o + 2];
    const b = Math.min(1, (.3 + .9 * Math.exp(-age / 2.5)) * vis);
    const x = A1[0] + Math.cos(ang) * drift * TRAIL[o + 3], y = A1[1] + Math.sin(ang) * drift * TRAIL[o + 3] * .5 + .6 * age * age * k, z = A1[2] + Math.sin(ang) * drift * TRAIL[o + 3];
    K.dotW(x, y, z, age < 3 && (i & 3) === 0 ? 2 : 1, age < 1.2 ? HOT : WH, b);
    if (age < 5 && (i % 5) === 0 && K.pj(x, y, z) && K.onS(8)) K.soft(K.PJ[0], K.PJ[1], 6, LIME[0], LIME[1], LIME[2], .1 * b * (1 - age / 5));
  }
  const dP = Math.max(0, dOfS(s) + RTAIL);
  if (vis > .01) {
    bez(0, A3);
    const n = 180;
    for (let i = 1; i <= n; i++) {
      const dd = dP * i / n; if (i === n && pEnd) { A2[0] = pEnd[0]; A2[1] = pEnd[1]; A2[2] = pEnd[2]; } else bez(uOfD(dd), A2);
      const ageL = Math.max(0, s - sOfD(dd)) + after;
      const a = vis * Math.max(.38, Math.exp(-ageL / 1.8)) * .85;
      K.lineW(A3[0], A3[1], A3[2], A2[0], A2[1], A2[2], 1.2, ageL < 1.5 ? 2 : 1, ageL < 1 ? HOT : WH, a, LIME, .16 * a, .05 * a);
      A3[0] = A2[0]; A3[1] = A2[1]; A3[2] = A2[2];
    }
  }
  if (wake) {
    // world-fixed samples behind the probe, each spreading and cooling from the moment it was passed
    const j1 = Math.floor(dP / .25), j0 = Math.max(0, j1 - NWAKE);
    for (let j = j0; j <= j1; j++) {
      const dj = j * .25, age = Math.max(0, s - sOfD(dj)) + after, h1 = hh(j, 3.3), h2 = hh(j, 7.1), h3 = hh(j, 9.7);
      const b = Math.exp(-age * 2.2) * (.55 + .45 * h3); if (b < .03) continue;
      bez(uOfD(dj), A1);
      const rr = .15 + 2.6 * Math.sqrt(age) * h1, an = h2 * TAU, cc = Math.cos(an) * rr;
      K.dotW(A1[0] + cc * SIDE[0], A1[1] + Math.sin(an) * rr, A1[2] + cc * SIDE[2], age < .05 && h3 > .6 ? 2 : 1, age < .12 ? HOT : h3 > .7 ? LIME : WH, b);
    }
  }
}
/* lime threads streaming back off the circuit lines (spreading behind the rod); Lb their length (m) */
const NT = 9;
function threads(dP, I, Lb, e1, e2) {
  if (I < .02) return;
  const dT = dP + RTAIL;
  for (let j = 0; j < NT; j++) {
    const ph0 = j / NT * TAU + .5 * hh(j, 1.3), w = .7 + .3 * hh(j, 2.9);
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= 14; i++) {
      const db = Lb * w * Math.pow(i / 14, 1.5), d = dT - db; if (d < 0) break;
      bez(uOfD(d), A1);
      const rr = R0 * 1.6 + .2 * Math.sqrt(db) * (1 + .3 * Math.sin(db * .22 + j * 2.1 + dP * .03)), ph = ph0 + db * .04 + .3 * Math.sin(db * .23 + j + dP * .02), cs = Math.cos(ph) * rr, sn = Math.sin(ph) * rr;
      const x = A1[0] + e1[0] * cs + e2[0] * sn, y = A1[1] + e1[1] * cs + e2[1] * sn, z = A1[2] + e1[2] * cs + e2[2] * sn;
      if (i) { const t = db / (Lb * w); K.lineW(px, py, pz, x, y, z, 1.3, 1, t < .12 ? HOT : LIME, I * Math.exp(-2.6 * t) * (.75 + .25 * hh(j, Math.floor(dP))), LIME, .05, 0); }
      px = x; py = y; pz = z;
    }
  }
}
/* arcs jolting off the rod: a few per frame bucket from points on the circuit lines, thrown out and back */
function jolts(Lw, tf, I, scale, tg, n) {
  const ln = circuit(); if (!ln.n || I < .02) return;
  const fr = Math.floor(tf * 24);
  for (let j = 0; j < n; j++) {
    const h0 = hh(j * 3.3 + 1.1, fr); if (h0 > .8) continue;
    const i = Math.floor(hh(j * 5.1 + 2, fr) * ln.n) % ln.n;
    lp(Lw, i, A1);
    const a1 = hh(j * 7.3, fr) * TAU, a2 = hh(j * 9.7, fr) * 2 - 1, hs = Math.sqrt(1 - a2 * a2), hl = hh(j * 11.9, fr);
    const len = scale * (.08 + .6 * hl * hl) * (j === 0 && h0 < .2 ? 3 : 1);
    const bx = A1[0] + (Math.cos(a1) * hs - tg[0] * .7) * len, by = A1[1] + (a2 - tg[1] * .7) * len, bz = A1[2] + (Math.sin(a1) * hs - tg[2] * .7) * len;
    jag(A1[0], A1[1], A1[2], bx, by, bz, j + 1, fr, I * (.6 + .4 * (1 - h0)), .5, 16, h0 < .4 ? HOT : LIME, 1);
  }
}
/* the bow and tail shocks: cones off the nose tip and the fin tips at the Mach angle (asin 1/M; the speed of sound at
   its height, ISA troposphere), rings round them and a light sliding back down each */
const cSnd = h => Math.sqrt(1.4 * 287.05 * Math.max(216.65, 288.15 - .0065 * Math.max(0, h)));
function shocks(Lw, v, h, T, I) {
  if (I < .02) return;
  const M = v / cSnd(h); if (M < 1.05) return;
  const tn = Math.tan(Math.asin(1 / M)), fr = Math.floor(T * 30), U = X.dir(Lw, [1, 0, 0]), W = X.dir(Lw, [0, 1, 0]), FRR = NEWR ? (RG.FIN_R || .035) : .12;
  for (let c = 0; c < 2; c++) {
    const z0 = c ? RTAIL + .1 : RNOSE, r0 = c ? FRR : 0, L = c ? 2.4 : 3.6, n = c ? 10 : 16, a0 = c ? .45 : .75;
    for (let j = 0; j < n; j++) {
      const th = (j + .35 * hh(j + c * 31, 3.1)) / n * TAU, cs = Math.cos(th), sn = Math.sin(th), fl = .75 + .25 * hh(j * 3 + c, fr);
      for (let q = 0; q < 3; q++) {                                         // three pieces, dimming back from the tip
        const l0 = L * q / 3, l1 = L * (q + 1) / 3;
        apI(Lw, cs * (r0 + l0 * tn), sn * (r0 + l0 * tn), z0 - l0, A1); apI(Lw, cs * (r0 + l1 * tn), sn * (r0 + l1 * tn), z0 - l1, A2);
        K.lineW(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], 2.4, 1, q ? WH : c ? LIME : HOT, I * a0 * (1 - .32 * q) * fl);
      }
    }
    for (let q = 1; q <= 3; q++) { const l = L * q / 3.4; apI(Lw, 0, 0, z0 - l, A1); K.ringW(A1, U, W, r0 + l * tn, 56, 1, LIME, I * a0 * .45 * (1 - q * .2), q); }
    const ls = ((T * 1.7 + c * .5) % 1) * L; apI(Lw, 0, 0, z0 - ls, A1); K.ringW(A1, U, W, r0 + ls * tn, 72, 2, c ? LIME : HOT, I * a0 * .8 * (1 - ls / L), 0);
  }
}
const EVIS = T => 1 - .35 * E.ss(TB + 3, TRET0, T) - .65 * E.ss(TRET1 - 2.5, TRET1 + .5, T);
/* distance ticks along the trail, one a kilometre of path from the muzzle: a short lime bar across it (a fixed size on
   screen) and its label, while the trail is the subject (the flight, the burst, the way home); dP the path flown */
const KMT = [], KT_A = [0, 0, 0], KT_T = [0, 0, 0];
function kmTicks(dP, vis) {
  if (vis < .02) return;
  const nk = Math.min(12, Math.floor(dP / 1000)), S = K.S;
  for (let k = 1; k <= nk; k++) {
    const u = uOfD(k * 1000); bez(u, KT_A); bezT(u, KT_T);
    const e = C.eye, tx = KT_A[0] - e[0], ty = KT_A[1] - e[1], tz = KT_A[2] - e[2], dc = Math.hypot(tx, ty, tz);
    if (dc < 30) continue;
    // across the trail, square to the line of sight
    let nx = KT_T[1] * tz - KT_T[2] * ty, ny = KT_T[2] * tx - KT_T[0] * tz, nz = KT_T[0] * ty - KT_T[1] * tx; const nl = Math.hypot(nx, ny, nz) || 1, h = dc * .011 / nl;
    nx *= h; ny *= h; nz *= h;
    const a = vis * (1 - E.ss(9000, 16000, dc)) * E.ss(30, 80, dc);
    if (a < .02) continue;
    K.lineW(KT_A[0] - nx, KT_A[1] - ny, KT_A[2] - nz, KT_A[0] + nx, KT_A[1] + ny, KT_A[2] + nz, 1.1, 2, LIME, .9 * a, LIME, .1 * a, 0);
    if (!K.pj(KT_A[0], KT_A[1], KT_A[2])) continue;
    const tg = KMT[k] || (KMT[k] = K.mkTag());
    K.setTag(tg, '', `${k} km`, '', 'sm', K.PJ[0] + 14 * S, K.PJ[1] - 9 * S, a * .9, [K.PJ[0], K.PJ[1]]);
  }
}
function drawProbe(T) {
  if (XON.on || T < TF || T > TRET1 + .5) return;
  if (T >= TA) { const vis = EVIS(T); drawTrail(S1, SGE + (T - TA), vis, false, null); kmTicks(ALEN, vis * (1 - E.ss(TS0 + 1, TS0 + 2, T) + E.ss(TRET0 + 4, TRET0 + 6, T))); return; }
  const s = climbS(T), dP = dOfS(s), uP = uOfD(dP), Lw = flightXf(s), p = Lw.T, t = A5.slice(), rate = climbRate(T);
  apI(Lw, 0, 0, RTAIL, A2); const pEnd = A2.slice();
  drawTrail(s, 0, 1, true, pEnd); kmTicks(dP, 1);
  const vf = vOfS(s) * rate, e2 = NUP(t), dc = V.dist(C.eye, p);
  threads(dP, .8, 2.5 + 32 * Math.min(2.2, vf / 1000), SIDE, e2);
  if (dc < 900) {
    rodDraw(Lw, .8, T, 1);
    if (dc < 250) { if (!(NEWR && RG.drawRod)) drawLines(Lw, .75, T, 2.2); jolts(Lw, T, 1, Math.min(1.6, .5 + vf / 1500), t, 5); }
    if (dc < 160) shocks(Lw, vOfS(s), p[1], T, 1 - E.ss(90, 160, dc));
    const nose = V.mad(p, t, RNOSE); glowR(nose[0], nose[1], nose[2], .03, HOT, .6);
  } else K.dotW(p[0], p[1], p[2], 3, [255, 255, 255], 1);
  K.glowW(p[0], p[1], p[2], 26, LIME, .45);
  void uP;
}

/* ---------- the burst: phases (sim time) laid out on the insert's clock ---------- */
const BL0 = SG(.4), BL1 = SG(1.0);                     // the circuit lines blaze
const XF0 = SG(.3), XF1 = SG(.75);                     // the rod's model hands over to the fragment dots
const CH0 = SG(1.2), CH1 = SG(3.6);                    // the charge in the cracks
const WL0 = SG(3.5), WL1 = SG(4.3), WL2 = SG(5.7), WL3 = SG(6.9);   // the lightning runs wild, and settles
const GT0 = SG(5.0), GT1 = SG(5.9);                    // it gathers under the pieces
const LP0 = SG(5.75), LP1 = SG(6.55), RSTUB = .06;     // the leap down the stroke's path (fraction of it)
const RG0 = SG(3.75);                                  // the burst rings
const BR0 = SG(6.5);                                   // back towards x1: the cloud swells
const TAU_D = .008, D_INF = V_BU * TAU_D, ALEN = c.ARC.len;   // the pieces lose their speed (m) and come to rest on B_TOP
/* the probe's distance along the arc at sg: its own flight, held back a little (D_INF) in the last .23 s, then easing
   to rest at the arc's end (B_TOP); the cloud's centre and axis follow the arc */
const dAt = sg => sg < 0 ? dOfS(S1 + sg) - D_INF * E.ss(XAT, 0, sg) : ALEN - D_INF * Math.exp(-sg / TAU_D);
function cloudAt(sg, out, ax) { const u = uOfD(dAt(sg)); bez(u, out); if (ax) bezT(u, ax); return out; }
const spread = sg => .05 * E.ss(SG(1.9), SG(3.4), sg) + .55 * E.ss(SG(3.1), SG(4.6), sg) + 2.4 * E.ss(SG(4.2), SG(6.4), sg) + 26 * E.ss(BR0, BR0 + 1.6, sg) + 18 * E.ss(BR0 + 1, BR0 + 6, sg);
const spin = sg => .25 * E.ss(SG(2.4), SG(4.5), sg) + 1.6 * E.ss(SG(4.2), SG(6.4), sg) + 5 * E.ss(BR0, BR0 + 2.5, sg);
const UPD = [0, -1, 0];
/* sg: sim time; tf: film time (flicker); Tb: base time after the insert (null inside it) */
function shatter(sg, tf, Tb) {
  const F = frags(), fr = Math.floor(tf * 30);
  cloudAt(sg, PC, TX);
  const Lw = X.make(R.look(TX, UP), PC.slice());
  const post = Tb !== null, fadeF = post ? E.ss(T_LEAD + .3, TB + 1.8, Tb) : 0;
  // the rod whole until the fragments take over
  const xf = E.ss(XF0, XF1, sg);
  if (xf < 1) { rodDraw(Lw, 1, tf, 1 - xf); drawLines(Lw, (1 - xf) * (.7 + .3 * E.ss(BL0, BL1, sg)), tf, 2.2); }
  if (sg < SG(1.2) && !post) jolts(Lw, tf, 1 - E.ss(SG(.5), SG(1.2), sg), .6, TX, 4);
  const sp = spread(sg), rot = spin(sg);
  fragXf(Lw, sp, rot);
  const calm = 1 - E.ss(BR0 + .3, BR0 + 2.2, sg);        // back at x1 the lightning leaves the pieces (the leader takes it)
  const chg = E.ss(CH0, CH1, sg) * (1 - .7 * E.ss(WL2, WL3, sg)) * calm, wild = E.ss(WL0, WL1, sg) * (1 - .75 * E.ss(WL2, WL3, sg)) * calm, gath = E.ss(GT0, GT1, sg);
  const lit = Math.max(chg, E.ss(CRK0, CRK1, sg) * .7) * (1 - .6 * E.ss(BR0, BR0 + 1, sg));
  if (xf > 0 && fadeF < 1) {
    fragDots(sg, xf * (1 - .55 * E.ss(BR0, BR0 + 1.2, sg)), lit, fadeF);
    // the circuit lines on the pieces: blazing, then flickering as the charge leaves them
    const ln = LN, P = ln.P, bl = E.ss(BL0, BL1, sg), Ib = xf * (.65 + .35 * bl) * (1 - .5 * E.ss(WL1, WL3, sg)) * (1 - fadeF);
    for (let i = 0; i < ln.n; i++) {
      fp(F.LF[i], P[i * 3], P[i * 3 + 1], P[i * 3 + 2], A1); if (!K.pj(A1[0], A1[1], A1[2])) continue;
      let ph = (ln.U[i] * 2.5 - tf * (2 + 4 * chg) + ln.LI[i] * .37) % 1; if (ph < 0) ph += 1;
      const pu = ph < .16 ? 1 - ph / .16 : 0, col = bl > .5 && (pu > .2 || hh(i, fr) > .7) ? HOT : LIME;
      K.dot(K.PJ[0], K.PJ[1], bl > .6 || pu > .6 ? 2 : 1, col[0], col[1], col[2], Ib * (.55 + .45 * Math.max(pu, bl * .8)));
    }
  }
  // the crack front: a lime scan ring running down the rod from the nose as it cracks
  const cp = (sg - CRK0) / ((CRK1 - CRK0) * .8);
  if (cp > 0 && cp < 1.1 && !post) {
    const zf = RNOSE - (RNOSE - RTAIL) * Math.min(1, cp), af = .25 + .75 * Math.sin(PI * Math.min(1, cp)) * (1 - E.ss(1, 1.1, cp));
    apI(Lw, 0, 0, zf, A1); const Ux = X.dir(Lw, [1, 0, 0]), Wy = X.dir(Lw, [0, 1, 0]);
    K.ringW(A1, Ux, Wy, R0 * 2.2, 56, 2, HOT, af, tf * 3); K.ringW(A1, Ux, Wy, R0 * 4.5, 80, 1, LIME, .7 * af, -tf * 2); K.ringW(A1, Ux, Wy, R0 * 7, 96, 1, LIME, .3 * af, tf);
    glowR(A1[0], A1[1], A1[2], R0 * 5, LIME, .45 * af);
  }
  // the light inside: a glow in each opening cut, arcs across it while the charge builds
  if (lit > .02 && fadeF < 1) for (let i = 0; i < F.NS - 1; i++) {
    fp(F.base[i], 0, 0, F.cut[i], A1); fp(F.base[i + 1], 0, 0, F.cut[i], A2);
    const gx = (A1[0] + A2[0]) * .5, gy = (A1[1] + A2[1]) * .5, gz = (A1[2] + A2[2]) * .5, gap = Math.hypot(A1[0] - A2[0], A1[1] - A2[1], A1[2] - A2[2]);
    glowR(gx, gy, gz, R0 * 2 + gap * .8 + .04 * chg, LIME, (.25 + .45 * chg) * lit * (1 - fadeF) * (.8 + .2 * hh(i, fr)));
    if (sg > CRK0 + (CRK1 - CRK0) * .3) {
      const na = Math.round((1 + 3 * chg) * (1 - .6 * wild)), cA = F.cutA[i], cB = F.cutB[i];
      for (let j = 0; j < na; j++) {
        const h = hh(i * 7 + j, fr); if (h > .85) continue;
        fd(cA[Math.floor(hh(i * 3 + j, fr) * cA.length) % cA.length], A1); fd(cB[Math.floor(hh(i * 5 + j * 2, fr) * cB.length) % cB.length], A2);
        jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], i * 9 + j, fr, (.5 + .5 * chg) * (1 - fadeF), .7, 8, h < .5 ? HOT : LIME, 1);
      }
    }
  }
  // the charge ball and the knot it gathers into under the pieces
  const cA_ = (.15 + .5 * chg + .6 * wild + .4 * gath) * (1 - E.ss(T_LEAD, TB + .4, post ? Tb : 0) * (post ? 1 : 0));
  glowR(PC[0], PC[1], PC[2], .4 + sp * .45 + 2 * wild, LIME, .3 * cA_);
  glowR(PC[0], PC[1], PC[2], .1 + sp * .15, HOT, .35 * cA_ * (.7 + .3 * hh(1, fr)));
  KN[0] = PC[0]; KN[1] = PC[1] - (1.2 + sp * .55) * gath - .3; KN[2] = PC[2];
  const kn = gath * (post ? 1 - E.ss(T_LEAD + .1, T_LEAD + .6, Tb) : 1);
  if (kn > .02) { glowR(KN[0], KN[1], KN[2], .6 + .4 * sp, HOT, .55 * kn); glowR(KN[0], KN[1], KN[2], 2 + sp, LIME, .4 * kn); }
  // the lightning runs wild: arcs thrown out from the pieces in every direction, bending down as it gathers
  const nW = Math.round(22 * wild);
  for (let j = 0; j < nW; j++) {
    const h = hh(j * 3.7 + 2, fr), f = Math.floor(hh(j * 1.9, fr) * F.nf) % F.nf;
    fp(f, F.c3[f * 3], F.c3[f * 3 + 1], F.c3[f * 3 + 2], A1);
    let dx = hh(j * 5.3, fr) - .5, dy = hh(j * 6.1, fr) - .5, dz = hh(j * 8.9, fr) - .5;
    const g = gath * .85; dx = dx * (1 - g); dy = dy * (1 - g) - g; dz = dz * (1 - g); const dl = Math.hypot(dx, dy, dz) || 1;
    const len = (1.2 + 7 * h * h) * (.35 + .65 * wild) + sp * 1.1;
    if (g > .3 && h > .5) { A2[0] = KN[0]; A2[1] = KN[1]; A2[2] = KN[2]; }
    else { A2[0] = A1[0] + dx / dl * len; A2[1] = A1[1] + dy / dl * len; A2[2] = A1[2] + dz / dl * len; }
    jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], j * 5 + 7, fr, wild * (.55 + .45 * h), .5, 16, h > .55 ? HOT : LIME, h > .8 ? 2 : 1);
    if (h > .35) { const qx = JM[0], qy = JM[1], qz = JM[2]; jag(qx, qy, qz, qx + (dz / dl - dx / dl * .3) * len * .45, qy + (dy / dl - .4) * len * .4, qz + (-dx / dl - dz / dl * .3) * len * .45, j * 11 + 3, fr, wild * .5, .5, 8, LIME, 1); }
  }
  // and between pieces across the cloud
  for (let j = 0; j < Math.round(9 * wild); j++) {
    const fa = Math.floor(hh(j * 2.3 + 5, fr) * F.nf) % F.nf, fb = Math.floor(hh(j * 4.7 + 1, fr) * F.nf) % F.nf; if (fa === fb) continue;
    fp(fa, F.c3[fa * 3], F.c3[fa * 3 + 1], F.c3[fa * 3 + 2], A1); fp(fb, F.c3[fb * 3], F.c3[fb * 3 + 1], F.c3[fb * 3 + 2], A2);
    jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], j * 3 + 41, fr, wild * .8, .45, 16, HOT, 1);
  }
  // the burst rings, thrown out round the pieces as it runs wild, full of its lightning
  const ra = sg - RG0;
  if (ra > 0 && fadeF < 1) for (let k = 0; k < 2; k++) {
    const tR = (SG(5.0) - RG0) * (.45 + .25 * k), r = (9 + 5 * k) * (1 - Math.exp(-ra / tR)) + 40 * E.ss(BR0, BR0 + 1.5, sg) * (1 + .4 * k);
    const A = Math.min(1, ra / (tR * .15)) * (1 - E.ss(SG(5.6), SG(7.2), sg) * (k ? 1 : .7)) * (1 - E.ss(BR0 + .5, BR0 + 1.8, sg));
    lightRing(PC, k ? T1 : SIDE, k ? SIDE : N1, r, A, 11 + k * 3, fr, 8, .9);
  }
  // the leap: a stepped leader down the stroke's own path (the film's main channel), held at its reach until the
  // film's leader overtakes it
  const lr = RSTUB * E.ss(LP0, LP1, sg), la = post ? 1 - E.ss(T_LEAD + .1, T_LEAD + .55, Tb) : 1;
  if (lr > .001 && la > .01) {
    const m = BOLT.main, nv = lr * (m.length - 1), st = Math.floor(nv);
    jag(KN[0], KN[1], KN[2], m[1][0], m[1][1], m[1][2], 61, fr, la * Math.min(1, lr * 60), .4, 16, HOT, 2);
    // each step of the channel drawn with its own fine fracture (fixed: a channel keeps its shape, it only flickers)
    for (let i = 1; i < Math.min(m.length - 1, Math.ceil(nv)); i++) {
      const A_ = m[i], B_ = m[i + 1], f = Math.min(1, nv - i), age = (nv - i) / Math.max(1, nv);
      jag(A_[0], A_[1], A_[2], A_[0] + (B_[0] - A_[0]) * f, A_[1] + (B_[1] - A_[1]) * f, A_[2] + (B_[2] - A_[2]) * f, i * 7 + 3, 5, la * (.55 + .45 * (1 - age)) * (.75 + .25 * hh(i, fr)), .3, 8, HOT, 2);
    }
    for (const b of BOLT.br) {
      const s0 = b.at * (m.length - 1); if (nv <= s0) continue;
      const kk_ = Math.min(b.pts.length - 1, (nv - s0) / ((m.length - 1) * .25) * (b.pts.length - 1) * 3);
      for (let i = 0; i < kk_ && i < b.pts.length - 1; i++) { const p0 = b.pts[i], p1 = b.pts[i + 1]; K.lineW(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 1.4, 1, LIME, la * .55 * b.w, LIME, .04, 0); }
    }
    if (st < m.length - 1) { const tp = m[Math.min(m.length - 1, Math.ceil(nv))]; K.dotW(tp[0], tp[1], tp[2], 3, [255, 255, 255], la); glowR(tp[0], tp[1], tp[2], 14, LIME, .5 * la); glowR(tp[0], tp[1], tp[2], 4, HOT, .6 * la); }
  }
  // each piece pulls a thread of lightning down toward the battery: stepping down off it as the charge gathers and
  // bending in onto the stroke's own path below the cloud (feeding the leader), held until the leader overtakes them
  const thI = E.ss(GT0 - .5 * (GT1 - GT0), GT1, sg) * (post ? 1 - E.ss(T_LEAD + .25, T_LEAD + 1.0, Tb) : 1);
  if (thI > .01) {
    const m = BOLT.main;
    for (let f = 0; f < F.nf; f++) {
      const h1 = hh(f, 1.7), h2 = hh(f, 2.3), rch = E.ss(GT0 + (LP0 - GT0) * .7 * h2, LP1 + (LP1 - LP0) * h1, sg);
      if (rch < .01) continue;
      fp(f, F.c3[f * 3], F.c3[f * 3 + 1], F.c3[f * 3 + 2], A1);
      const M_ = m[Math.min(m.length - 1, 2 + Math.floor(26 * h1))];
      const ex = A1[0] + (M_[0] - A1[0]) * rch, ey = A1[1] + (M_[1] - A1[1]) * rch, ez = A1[2] + (M_[2] - A1[2]) * rch;
      jag(A1[0], A1[1], A1[2], ex, ey, ez, 101 + f, fr, thI * (.4 + .4 * hh(f, fr)), .22, f & 1 ? 8 : 16, hh(f * 3, fr) > .6 ? HOT : LIME, 1);
      if (rch < .98 && (f & 3) === 0) glowR(ex, ey, ez, .15 + .6 * rch, LIME, .3 * thI);
    }
  }
  if (post) burstAfter(sg, Tb, sp, fr);
}
/* after the insert (base time): the charge crawling over the cloud's underside until the leader goes, and the
   ionised haze it leaves hanging over the headland */
const NBU = 1600, HAZE = (() => { const r = rng(515), A = new Float32Array(NBU * 4); for (let i = 0; i < NBU; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h; A[i * 4 + 1] = u; A[i * 4 + 2] = Math.sin(a) * h; A[i * 4 + 3] = .4 + .6 * r(); } return A; })();
function burstAfter(sg, T, sp, fr) {
  const p = PC, r = 6 + sp * 1.2;
  if (T < TB + .3) {
    const I = E.ss(TA, T_LEAD, T) * (T > TB ? 1 - (T - TB) / .3 : 1), f24 = Math.floor(T * 24);
    for (let i = 0; i < 7; i++) {
      const h = hh(i * 5.1, f24), g = hh(i * 9.3, f24);
      A1[0] = p[0] + (h - .5) * r * 1.4; A1[1] = p[1] - r * (.25 + .3 * g); A1[2] = p[2] + (g - .5) * r * 1.4;
      A2[0] = A1[0] + (hh(i, f24) - .5) * r * .7; A2[1] = A1[1] - r * .25 * hh(i * 2, f24); A2[2] = A1[2] + (hh(i * 3, f24) - .5) * r * .7;
      jag(A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], i + 91, f24, I * .8, .5, 16, HOT, 1);
    }
  }
  const S = .22 * E.ss(TA + .4, T_LEAD + 1.5, T) * (1 - E.ss(TRET1 - 4, TRET1, T)), a = T - TA, rr = 40 + 280 * (1 - Math.exp(-a / 3));
  if (S > .01) for (let i = 0; i < NBU; i++) {
    const o = i * 4, b = S * HAZE[o + 3], q = rr * HAZE[o + 3];
    K.dotW(p[0] + HAZE[o] * q + 6 * a, p[1] + HAZE[o + 1] * q * .55 - 4 * a, p[2] + HAZE[o + 2] * q, i % 9 ? 1 : 2, i % 4 ? WHD : LIME, b);
  }
  void fr;
}
function drawBurst(T) {
  const ins = XON.on; XON.on = 0;
  if (ins || T < TA || T > TRET1 + .5) return;
  shatter(SGE + (T - TA), XLEN + (T - TA), T);
}

/* ---------- the lens ---------- */
/* In the bore it rides beside the round as drawn (the barrel's frame). From TB0 it lets the round run on ahead and
   brakes into a side-on hold 8.5 m off the line of fire, 4 m out of the muzzle (x0.004: the armature's halves blowing
   off with the plasma arc burning between them and back to the rail tips, the sabot coming away), drifts back to
   ~22 m as the shock rings form, then latches onto the probe while the clock is still at x0.004 (the probe moving at
   9 m/s) and rides with it as the clock comes up to x1 (its look turning under 30°/s): from beside it, round behind
   and above it looking ~5° down and ~35° left of the line of fire (the coast and the sea below it in frame), and round to its side by the burst (the shock cones in profile). Through the burst it stays off the pieces'
   side, closes on the cracks and backs off as the lightning runs wild, then pulls out under the cloud to where the
   film's strike lens takes over (camStrike at TS0) */
const OFF_R = V.add(V.add(V.mul(SIDE, 5.6), V.mul(NB0, .8)), V.mul(DIR0, -1.2));
const TB0 = TF - .55, TL0 = TF + 1.0, TT1 = TF + 1.6;                      // the brake: from the ride into the side-on hold
const ARC_E = V.add(V.add(V.mad(MZ0, DIR0, 4), V.mul(SIDE, 8.5)), V.mul(NB0, .7)), ARC_T = V.mad(MZ0, DIR0, 4.4), ARC_F = 44;
const TH1 = TF + 1.5, TH2 = TF + 2.8;                                      // the drift back as the rings form
const LK_E2 = V.add(V.add(V.mad(MZ0, DIR0, 4), V.mul(SIDE, 21)), V.mul(NB0, 5)), LK_T2 = V.mad(MZ0, DIR0, 10), LK_F2 = 50;
const TC0 = TF + 2.5, TC1 = TF + 3.4;                                      // the latch onto the probe (still at x0.004)
const hm = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (3 * u2 - 2 * u3) + m1 * dt * (u3 - u2); };
function camHold(T) {
  const h = .004, a = boreCam(TB0), b = boreCam(TB0 + h), dt = TL0 - TB0, dtt = TT1 - TB0, u = E.clamp((T - TB0) / dt, 0, 1), ut = E.clamp((T - TB0) / dtt, 0, 1), eye = [0, 0, 0], target = [0, 0, 0];
  const ue = E.ss(TH1, TH2, T);
  for (let k = 0; k < 3; k++) {
    eye[k] = hm(a.eye[k], ARC_E[k], (b.eye[k] - a.eye[k]) / h, 0, u, dt) + (LK_E2[k] - ARC_E[k]) * ue;
    target[k] = hm(a.target[k], ARC_T[k], (b.target[k] - a.target[k]) / h, 0, ut, dtt) + (LK_T2[k] - ARC_T[k]) * ue;
  }
  return { eye, target, fov: (E.mix(42, ARC_F, E.ss(0, 1, ut)) + (LK_F2 - ARC_F) * ue) * DEG };
}
/* the ride: tc runs through the insert (TA + u) and on after it. Up to TA: keys [time, look yaw (deg, from the line
   of fire toward the lens's far side), look pitch (deg), distance (m), look point (m along the path), fov]; from TA:
   keys [time, az (deg, from along the path toward SIDE), el (deg, toward up), distance (m), target (along, side, up
   m), fov] (the burst insert's) */
const ZPOST = TA + XLEN;
const tcOf = T => T < TA ? T : ZPOST + (T - TA);
const RT_ = [0, 0, 0];
const lookOf = (psi, th) => { const p = psi * DEG, t = th * DEG, c = Math.cos(t); return [HDIR[0] * c * Math.cos(p) - SIDE[0] * c * Math.sin(p), Math.sin(t), HDIR[2] * c * Math.cos(p) - SIDE[2] * c * Math.sin(p)]; };
const psiOf = L => [Math.atan2(-V.dot(L, SIDE), L[0] * HDIR[0] + L[2] * HDIR[2]) / DEG, Math.asin(E.clamp(L[1], -1, 1)) / DEG];
const RK = [
  [TA, 102, 12, 3.4, [0, 0, 0], 44],                                      // at the burst: round at its side
  [TA + 1.5, 108, 14, 2.6, [.15, 0, 0], 40],                              // the circuit lines blaze, the cracks run
  [TA + 3.1, 122, 17, 3.0, [0, 0, 0], 42],                                // the pieces part, the charge builds
  [TA + 4.4, 96, 11, 6.5, [0, 0, -.4], 48],                               // the lightning runs wild (coming round ahead of it)
];
function centreAt(tc, out, ax) {
  if (tc < TA) { const s = climbS(tc), u = uOfD(dOfS(s)); bez(u, out); bezT(u, ax); return out; }
  return cloudAt(tc < ZPOST ? sgOf(tc - TA) : SGE + (tc - ZPOST), out, ax);
}
const RKA = (() => {
  // the hold's last look and the TA key's look, as yaw / pitch from the line of fire
  const LH = V.norm(V.sub(LK_T2, LK_E2)), [ph, th] = psiOf(LH);
  const pc = [0, 0, 0]; centreAt(TC1, pc, [0, 0, 0]); const dh = V.dist(LK_E2, pc);
  const k = RK[0], az = k[1] * DEG, el = k[2] * DEG, nu = N1;
  const off = [0, 1, 2].map(i => T1[i] * Math.cos(el) * Math.cos(az) + SIDE[i] * Math.cos(el) * Math.sin(az) + nu[i] * Math.sin(el));
  const [pa, ta] = psiOf(V.mul(off, -1));
  return [
    [TC1, ph, th, dh, Math.max(0, V.dot(V.sub(LK_T2, pc), DIR0)), LK_F2],  // (latched: the hold's own look)
    [TC1 + 1.6, 34, -2, 10, .6, 48],                                      // the clock coming up: the coast swings into frame
    [TA - 2.6, 40, -7, 6.5, .3, 46],                                      // closing, looking down a little: the coast stays in frame
    [TA - 1.0, 60, -5, 4.4, .1, 45],                                      // round to its side: the shock cones in profile
    [TA, pa, ta, k[3], 0, k[5]],
  ];
})();
const CPA = FILM.path(RKA.map(([t, p, th, d, ta, fov]) => ({ t, eye: [p, th, Math.log(d)], target: [ta, 0, 0], fov })));
/* from the gathering on: the lens pulls out from the cloud along a direction turning to the strike lens's first view
   (camStrike at TS0: under the cloud, beside the channel), its look turning from just under the cloud to the cloud */
const WIDE = camBase(TS0), XO0 = TA + 5.1, XO1 = tcOf(TS0);
const WD = V.norm(V.sub(WIDE.eye, B_TOP)), WL = V.dist(WIDE.eye, B_TOP);
const OD0 = (() => { const az = 80 * DEG, el = 8 * DEG; return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]; })(), OL0 = 22;
function camOut(tc) {
  const w = E.clamp((tc - XO0) / (XO1 - XO0), 0, 1), g = E.ss(0, 1, w), f = Math.pow(g, 1.6), P = centreAt(tc, [0, 0, 0], RT_);
  const d0 = [T1[0] * OD0[0] + SIDE[0] * OD0[1] + N1[0] * OD0[2], T1[1] * OD0[0] + SIDE[1] * OD0[1] + N1[1] * OD0[2], T1[2] * OD0[0] + SIDE[2] * OD0[1] + N1[2] * OD0[2]];
  const dir = V.norm(V.lerp(d0, WD, g)), L = Math.exp(Math.log(OL0) + (Math.log(WL) - Math.log(OL0)) * f);
  const eye = V.mad(P, dir, L), t0 = V.mad(P, N1, -.12 * L - .5);
  return { eye, target: lookTurn(eye, t0, WIDE.target, E.ss(.4, 1, w)), fov: E.mix(52, WIDE.fov / DEG, g) * DEG };
}
{ // the orbit's last key: where the pull-out starts
  const s = camOut(XO0), P = centreAt(XO0, [0, 0, 0], [0, 0, 0]), v = V.sub(s.eye, P), d = V.len(v), tv = V.sub(s.target, P);
  RK.push([XO0, Math.atan2(V.dot(v, SIDE), V.dot(v, T1)) / DEG, Math.asin(V.dot(v, N1) / d) / DEG, d, [V.dot(tv, T1), V.dot(tv, SIDE), V.dot(tv, N1)], s.fov / DEG]);
}
const CP = FILM.path(RK.map(([t, az, el, d, tg, fov]) => ({ t, eye: [az, el, Math.log(d)], target: tg, fov })));
function camRide(tc) {
  if (tc >= XO0) return camOut(tc);
  if (tc < TA) {
    const k = CPA(tc), P = centreAt(tc, [0, 0, 0], RT_), L = lookOf(k.eye[0], k.eye[1]), d = Math.exp(k.eye[2]);
    return { eye: V.mad(P, L, -d), target: V.mad(P, RT_, k.target[0]), fov: k.fov };
  }
  const k = CP(tc), P = centreAt(tc, [0, 0, 0], RT_), tg = RT_, nu = NUP(tg);
  const az = k.eye[0] * DEG, el = k.eye[1] * DEG, d = Math.exp(k.eye[2]), ce = Math.cos(el);
  const ea = ce * Math.cos(az) * d, es = ce * Math.sin(az) * d, en = Math.sin(el) * d, ta = k.target;
  const eye = [P[0] + tg[0] * ea + SIDE[0] * es + nu[0] * en, P[1] + tg[1] * ea + SIDE[1] * es + nu[1] * en, P[2] + tg[2] * ea + SIDE[2] * es + nu[2] * en];
  const target = [P[0] + tg[0] * ta[0] + SIDE[0] * ta[1] + nu[0] * ta[2], P[1] + tg[1] * ta[0] + SIDE[1] * ta[1] + nu[1] * ta[2], P[2] + tg[2] * ta[0] + SIDE[2] * ta[1] + nu[2] * ta[2]];
  return { eye, target, fov: k.fov };
}
function boreCam(T) {
  apI(XF.B, 0, 0, roundZ(T), A1);
  return { eye: V.add(A1, OFF_R), target: V.mad(A1, DIR0, .5), fov: 42 * DEG };
}
/* off the hold onto the probe: the eye and the look blend from the hold to the ride (both slow: the probe at 9 m/s) */
function camLatch(T) {
  const w = E.ss(TC0, TC1, T), h = camHold(T), r = camRide(T), eye = V.lerp(h.eye, r.eye, w);
  return { eye, target: lookTurn(eye, h.target, r.target, w), fov: h.fov + (r.fov - h.fov) * w };
}
function cam(T, base) {
  if (T < T_REL - .7 || T >= TS0) return null;
  // (the mount's path lands beside the breech at T_REL: it hands over to the ride as the round starts to move)
  if (T < T_REL - .1) return PATH_A(T);
  if (T < T_REL + .45) { const a = PATH_A(T), b = boreCam(T), w = E.ss(T_REL - .1, T_REL + .45, T), eye = V.lerp(a.eye, b.eye, w); return { eye, target: lookTurn(eye, a.target, b.target, w), fov: a.fov + (b.fov - a.fov) * w }; }
  if (T < TB0) return boreCam(T);
  if (T < TC0) return camHold(T);
  if (T < TC1) return camLatch(T);
  const s = camRide(tcOf(T));
  if (T > TS0 - .5) return K.blendShot(s, base(T), E.ss(TS0 - .5, TS0, T));
  return s;
}

/* ---------- the insert ---------- */
const TGS = {};
let NFR = 0;
function xbuild(ctx) {
  frags(); NFR = FR.nf;
  for (const k of ['PRB', 'FRG', 'LDR']) TGS[k] = K.mkTag();
  const SFX = ctx.STAGE.SFX;
  window.RGX.cues = [
    [.05, () => SFX.tone(900, 110, .55, 'sine', .016)],
    [.45, () => SFX.tone(2400, 3400, .5, 'square', .004)],
    [.9, () => SFX.noise(1.1, 6500, .6, .01, .4)],
    [1.6, () => SFX.tone(1650, 1650, .04, 'square', .008)], [2.0, () => SFX.tone(1650, 1650, .04, 'square', .008)],
    [2.1, () => { SFX.tone(900, 300, .06, 'square', .012); SFX.noise(.08, 3000, .8, .02, .002); }],
    [3.3, () => SFX.tone(70, 900, 1.8, 'sawtooth', .012)],
    [3.9, () => { SFX.noise(1.6, 3200, .5, .022, .5); SFX.tone(1200, 3000, .5, 'square', .005); }],
    [5.1, () => SFX.tone(420, 120, 1.2, 'sawtooth', .01)],
    [5.8, () => { SFX.crack(); SFX.tone(1800, 300, .9, 'sawtooth', .01); }],
    [6.7, () => SFX.noise(.9, 1400, .7, .016, .5)],
  ];
}
function xcam(u) { return camRide(TA + u); }
function xdraw(u) {
  XON.on = 1;
  const sg = sgOf(u);
  // the trail up to the probe, then the probe coming apart
  const dA = dAt(sg);
  cloudAt(sg, A4, A5); apI(X.make(R.look(A5, UP), A4), 0, 0, RTAIL, A2);
  drawTrail(sOfD(dA), Math.max(0, sg), 1, true, A2.slice()); kmTicks(dA, 1);
  if (sg < SG(1.0)) threads(dA, .85 * (1 - E.ss(SG(.4), SG(1.0), sg)), 2.5 + 55 * vOfS(S1) * XW.rate(u) / 1000, SIDE, NUP(A5));
  if (sg < SG(.9)) { cloudAt(sg, A4, A5); shocks(X.make(R.look(A5, UP), A4.slice()), vOfS(S1 + Math.min(0, sg)), A4[1], u, 1 - E.ss(SG(.35), SG(.9), sg)); }
  shatter(sg, u, null);
}
function xread(u) {
  const sg = sgOf(u), ms = (sg * 1000).toFixed(1), rate = XW.rate(u);
  const l1 = `Probe · <b>burst</b> · alt <b>${(B_TOP[1] / 1000).toFixed(1)} km</b> · climbing <b>${Math.round(GAM_BU)}°</b>`;
  let l2;
  if (sg < BL0) { const v = vOfS(S1 + Math.min(0, sg)); l2 = `<b>${Math.round(v)} m/s</b> · Mach <b>${(v / cSnd(B_TOP[1])).toFixed(1)}</b> · <b>${(dOfS(S1) / 1000).toFixed(1)} km</b> flown`; }
  else if (sg < SG(1.9)) l2 = `Circuits <b>lit</b> · rod <b>cracking</b> · +${ms} ms`;
  else if (sg < WL0) l2 = `Fragments <b>×${NFR}</b> · charge <b>${Math.round(100 * E.ss(CH0, CH1, sg))} %</b> · +${ms} ms`;
  else if (sg < LP0) l2 = `Charge <b>discharging</b> · +${ms} ms`;
  else l2 = `Leader <b>stepping down</b> · +${ms} ms`;
  return { l1, l2, rate };
}
function xtags(u, ctx) {
  const sg = sgOf(u), win = (t0, t1) => E.sat((u - t0) / .25) * (1 - E.sat((u - t1 + .4) / .4));
  cloudAt(sg, A4, A5); const Lw = X.make(R.look(A5, UP), A4.slice());
  let a = win(.55, 2.0); if (a > .01) ctx.tagAt(TGS.PRB, 'PRB', NEWR ? 'Probe · tungsten rod' : 'Probe · inert', NEWR ? `${RG.ROD_LEN.toFixed(1)} m` : '', X.ap(Lw, [0, R0, RNOSE * .45]), a, u - .55);
  a = win(2.5, 4.4); if (a > .01) { const f = Math.floor(FR.nf * .7); fp(f, FR.c3[f * 3], FR.c3[f * 3 + 1], FR.c3[f * 3 + 2], A1); ctx.tagAt(TGS.FRG, 'FRG', 'Fragments', `×${NFR}`, A1.slice(), a, u - 2.5); }
  a = win(6.0, XLEN + .3); if (a > .01) { const m = BOLT.main, i = Math.min(m.length - 1, Math.ceil(RSTUB * E.ss(LP0, LP1, sg) * (m.length - 1))); ctx.tagAt(TGS.LDR, 'LDR', 'Leader', `${Math.round(RSTUB * E.ss(LP0, LP1, sg) * BOLT.L)} m`, m[i], a, u - 6.0); }
}
SH = { xbuild, xcam, xdraw, xread, xtags };
return { drawBore, drawSabot, drawFire, drawProbe, drawBurst, cam };
};
})();
