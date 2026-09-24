/* OB · LONG EXPOSURE · BARRAGE (combat edition). The same chronophotograph: a long lens on a
   virtual rail, side-on and orthographic; every 0.35 s of sim time a hairline ghost of every
   moving thing inside the plane of fire is stamped onto the plate. Here a full battery (four
   K340P, eight rounds in two ripples) fires on two destroyers at the far edge, which fire back:
   SM-6 strobe arcs out of their decks, bursts where they meet rounds, both Phalanx streams, and
   three rounds through, burning and smoking on both ships.
   The whole picture is a pure function of film time T -> sim time S = SW(T): an exposure k exists
   iff k * 0.35 <= S, so the rewind is simply S running back to 0.
   Ghosts are recorded once (lazily) as 2D segment lists in plate coordinates with the fixed
   ortho view basis; rigid in-plane motion (rounds, interceptors, launchers, boosters) reuses one
   canonical record per state under a 2D affine. Flight paths are drawn splines (schematic, like
   o4), timed so their strobe spacing follows true speed over the compressed range axis. */
(() => {
'use strict';
const { V, R, X, E } = M3;
STAGE.fit(); STAGE.SFX.kind = 'orb';
const DEG = Math.PI / 180, TAU = Math.PI * 2, DUR = 170, STAMP = .35, NB = 18;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const Q = STAGE.Q;

/* ---------- menu ---------- */
const menuEl = document.getElementById('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('ob' + t, { a: 1 })}<span class="tx">${t}</span></span><span class="go">↵</span><i class="bar"></i></div>`).join('');
const veil = document.getElementById('veil');
STAGE.menu({
  el: menuEl, blurb: document.getElementById('blurb'), axis: 'h',
  onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; },
});

/* ---------- canvas ---------- */
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let K = 1;
function size() { K = Math.min(2, Math.max(1, (devicePixelRatio || 1) * STAGE.scale)); cv.width = 1920 * K; cv.height = 1080 * K; }
size(); addEventListener('resize', () => { STAGE.fit(); size(); });

/* ---------- models ---------- */
const WIRE = m => HD.wire ? HD.wire(m) : m;
const TELM = WIRE(HD.tel()), MIS = WIRE(HD.oniks()), BST = WIRE(HD.oniksBooster()), HELO = WIRE(HD.helo()), FTR = WIRE(HD.fighter());
const SMM = WIRE(HD.sm6()), MKM = WIRE(HD.mk72());
const partOf = (m, n) => m.parts.find(p => p.name === n);
const GDEF = { a: 1, back: .16, gen: .28, genBack: .06, sil: 1, ring: .8, hatch: .3 };
const MID = { fine: false, gen: .14, genBack: .02, back: .07, hatch: .18 };
function drawParts(W, model, world, st, names, opt) {
  const o = Object.assign({}, GDEF, opt || {});
  for (const part of model.parts) {
    if (names && names.indexOf(part.name) < 0) continue;
    if (part.show && !part.show(st)) continue;
    const T = GEO.partXf(world, part, st), po = part.alpha ? Object.assign({}, o, { a: o.a * part.alpha }) : o;
    for (const pr of GEO.primsOf(part, st)) if (!(pr.fine && o.fine === false)) GEO.drawPrim(W, pr, T, po);
  }
}
function Rax(ax, a) {
  const [x, y, z] = V.norm(ax), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/* ---------- plate geometry ----------
   Plate world: x east, compressed beyond the bluff (x = g(true range)); y up; z depth (true).
   The lens is orthographic, looking north and down by PITCH, so a point lands at
   plate (x, y cos p + z sin p). */
const PITCH = 1.2 * DEG, CP = Math.cos(PITCH), SP = Math.sin(PITCH);
const plY = (y, z) => y * CP + z * SP;
// a ring's plate ellipse axes (U, V in world) under the ortho lens
const ringAxes = rg => { rg.ax = rg.U[0]; rg.ay = rg.U[1] * CP + rg.U[2] * SP; rg.bx = rg.Vv[0]; rg.by = rg.Vv[1] * CP + rg.Vv[2] * SP; rg.Yc = plY(rg.y, rg.z); };
const SEA = -25, CLIFF = 44, X_END = 2400, X_BEG = -150;
const R0 = 48, CMP = 20, LAM = 110, RE = 6371e3;
const g = r => r <= R0 ? r : R0 + (r - R0) / CMP + (1 - 1 / CMP) * LAM * (1 - Math.exp(-(r - R0) / LAM));
function ginv(x) {
  if (x <= R0) return x;
  let r = R0 + Math.max(0, x - R0 - (1 - 1 / CMP) * LAM) * CMP + 1;
  for (let i = 0; i < 60; i++) { const f = g(r) - x; if (Math.abs(f) < 1e-8) break; r -= f / (1 / CMP + (1 - 1 / CMP) * Math.exp(-(r - R0) / LAM)); }
  return r;
}
const DT0 = -900, DTN = 5200, DROPT = new Float64Array(DTN);
for (let i = 0; i < DTN; i++) { const r = ginv(DT0 + i); DROPT[i] = r * r / (2 * RE); }
const drop = x => { const f = x - DT0; if (f <= 0) return DROPT[0]; if (f >= DTN - 1) return DROPT[DTN - 1]; const i = f | 0; return DROPT[i] + (DROPT[i + 1] - DROPT[i]) * (f - i); };
const seaY = x => SEA - drop(x);
const seaP = (x, z) => plY(seaY(x), z);
const DOF = 350;                       // the plate records only the plane of fire, +-350 m deep
const inSlab = z => Math.abs(z - 12) <= DOF;

/* ---------- battery: four K340P, two TLCs each ---------- */
const E_MAX = 1.53, ER_DUR = 6.5, JK_DUR = 1.5;
const TELS = [{ x: 0, z: 0, J: 7, E: 8.5 }, { x: -24, z: 24, J: 7.6, E: 9.6 }, { x: -48, z: 48, J: 8.2, E: 10.7 }, { x: -72, z: 72, J: 8.8, E: 11.8 }];
for (const t of TELS) { t.W = X.make(R.y(-Math.PI / 2), [t.x, 0, t.z]); t.piv = X.ap(t.W, TELM.PIV); t.pivP = [t.piv[0], plY(t.piv[1], t.piv[2])]; }
const elevAt = (i, S) => E_MAX * E.inOut(E.sat((S - TELS[i].E) / ER_DUR));
const depAt = (i, S) => E.ss(TELS[i].J, TELS[i].J + JK_DUR, S);

/* ---------- the eight rounds: drawn paths ----------
   Ripple 1 from TELs 1-2 on the high arcs, ripple 2 from TELs 3-4 while ripple 1 is still
   climbing, on lower, flatter arcs that nest under the first. */
const TEX = .6, TIG = 1.1, TSEP = 5.6, V_CR = 34;
const ROUNDS = [
  { tel: 0, side: 1, L: 18, h: 11 }, { tel: 0, side: -1, L: 19.6, h: 13.5 }, { tel: 1, side: 1, L: 21.2, h: 16 }, { tel: 1, side: -1, L: 22.8, h: 18.5 },
  { tel: 2, side: 1, L: 25.2, h: 12.3 }, { tel: 2, side: -1, L: 26.8, h: 14.8 }, { tel: 3, side: 1, L: 28.4, h: 17.3 }, { tel: 3, side: -1, L: 30, h: 19.8 }];
const NR = ROUNDS.length;
const TUBE_S = 9.65;                   // centre travel from inside the tube to clear of the mouth
function spline(pts, stepOf, nReal) {
  // Catmull-Rom through pts[0..nReal-1]; points past nReal only shape the end tangent
  const PX = [], PY = [], n = nReal || pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(6, Math.ceil(L / stepOf(p1)));
    for (let k = 0; k < m; k++) {
      const u = k / m, u2 = u * u, u3 = u2 * u;
      PX.push(.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3));
      PY.push(.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3));
    }
  }
  PX.push(pts[n - 1][0]); PY.push(pts[n - 1][1]);
  const N = PX.length, X_ = new Float64Array(PX), Y_ = new Float64Array(PY), SL = new Float64Array(N);
  for (let i = 1; i < N; i++) SL[i] = SL[i - 1] + Math.hypot(X_[i] - X_[i - 1], Y_[i] - Y_[i - 1]);
  return { X: X_, Y: Y_, SL, len: SL[N - 1] };
}
function buildPath(pts) {
  const PX = [], PY = [];
  const put = (x, y) => { PX.push(x); PY.push(y); };
  for (let k = 0; k < 24; k++) { const u = k / 24; put(E.mix(pts[0][0], pts[1][0], u), E.mix(pts[0][1], pts[1][1], u)); }
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(6, Math.ceil(L / (p1[0] > 330 ? 3 : .5)));
    for (let k = 0; k < n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u;
      put(.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
          .5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3));
    }
  }
  const lp = pts[pts.length - 1]; put(lp[0], lp[1]);
  const n = PX.length, X_ = new Float64Array(PX), Y_ = new Float64Array(PY), SL = new Float64Array(n);
  for (let i = 1; i < n; i++) SL[i] = SL[i - 1] + Math.hypot(X_[i] - X_[i - 1], Y_[i] - Y_[i - 1]);
  return { X: X_, Y: Y_, SL, len: SL[n - 1] };
}
function pathAt(P, s, out) {
  s = E.clamp(s, 0, P.len);
  let lo = 0, hi = P.SL.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.SL[m] < s) lo = m; else hi = m; }
  const u = (s - P.SL[lo]) / (P.SL[hi] - P.SL[lo] || 1);
  out.x = P.X[lo] + (P.X[hi] - P.X[lo]) * u; out.y = P.Y[lo] + (P.Y[hi] - P.Y[lo]) * u;
  // heading from a short chord so the body turns smoothly through the arc
  const j0 = Math.max(0, lo - 2), j1 = Math.min(P.SL.length - 1, hi + 2);
  out.a = Math.atan2(P.Y[j1] - P.Y[j0], P.X[j1] - P.X[j0]);
  return out;
}
// along-path speed on the plate (m/s): the push out of the tube, a short coast, the boost,
// then the steady cruise pace once the range axis compresses
function vAt(tau) {
  if (tau < TEX) return 2 * TUBE_S / (TEX * TEX) * tau;
  if (tau < TIG) return 2 * TUBE_S / TEX - 9.81 * (tau - TEX);
  const v0 = 2 * TUBE_S / TEX - 9.81 * (TIG - TEX);
  const v = v0 + 80 * (1 - Math.exp(-(tau - TIG) / .6));
  return E.mix(v, V_CR, E.ss(3.2, 7.2, tau));
}
const SCH_HZ = 240, SCH_N = 140 * SCH_HZ;
const SCH = new Float64Array(SCH_N + 1);
for (let i = 1; i <= SCH_N; i++) { const t0 = (i - 1) / SCH_HZ, t1 = i / SCH_HZ; SCH[i] = SCH[i - 1] + (vAt(t0) + vAt(t1)) * .5 / SCH_HZ; }
const sAt = tau => { if (tau <= 0) return 0; const f = tau * SCH_HZ, i = Math.min(SCH_N - 1, f | 0); return SCH[i] + (SCH[i + 1] - SCH[i]) * (f - i); };
function tauOfS(s) { let lo = 0, hi = SCH_N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SCH[m] < s) lo = m; else hi = m; } return (lo + (s - SCH[lo]) / (SCH[hi] - SCH[lo] || 1)) / SCH_HZ; }
const misState = tau => ({ wing: E.ss(5.8, 6.5, tau), fin: E.ss(5.7, 6.15, tau), booster: tau < TSEP, cover: tau < 5.65 });
const flameOf = tau => tau >= TIG && tau < TSEP ? 1 : tau >= 5.75 ? 2 : 0;

const tmp = { x: 0, y: 0, a: 0 };
ROUNDS.forEach((rd, i) => {
  const tl = TELS[rd.tel], tf = HD.telTube(TELM, { elev: E_MAX }, rd.side);
  rd.mouth = X.ap(tl.W, tf.mouth); rd.dir = X.dir(tl.W, tf.dir); rd.z = rd.mouth[2];
  const m = rd.mouth, d = rd.dir, j = i % 4, lift = j * 4;
  const pts = i < 4 ? [
    [m[0] - d[0] * 5.05, m[1] - d[1] * 5.05],
    [m[0] + d[0] * 4.6, m[1] + d[1] * 4.6],
    [m[0] + .8, m[1] + 17],
    [m[0] + 13, m[1] + 43 + lift * .5],
    [m[0] + 50, m[1] + 66 + lift],
    [120 + j * 6, 74 + lift],
    [192 + j * 8, 47 + lift * .6],
    [262 + j * 6, SEA + rd.h + 9],
    [335, seaY(335) + rd.h],
  ] : [
    [m[0] - d[0] * 5.05, m[1] - d[1] * 5.05],
    [m[0] + d[0] * 4.6, m[1] + d[1] * 4.6],
    [m[0] + .9, m[1] + 15],
    [m[0] + 14, m[1] + 34 + lift * .5],
    [m[0] + 52, m[1] + 47 + lift * .8],
    [112 + j * 6, 51 + lift * .8],
    [180 + j * 7, 30 + lift * .5],
    [250 + j * 6, SEA + rd.h + 7],
    [330, seaY(330) + rd.h],
  ];
  for (let x = 440; x <= X_END + 500; x += 100) pts.push([x, seaY(x) + rd.h]);
  rd.P = buildPath(pts);
  pathAt(rd.P, sAt(TSEP), tmp); rd.sep = { x: tmp.x, y: tmp.y, a: tmp.a };
});
function roundPose(i, S, out) {
  const rd = ROUNDS[i], tau = S - rd.L;
  if (tau < 0) return null;
  pathAt(rd.P, sAt(tau), out); out.tau = tau; out.Y = plY(out.y, rd.z);
  return out;
}

/* caps: blown off the mouth at ejection, tumble, land on the ground */
const CAPA = V.norm([.28, .42, 1]);
ROUNDS.forEach((rd, i) => {
  const tl = TELS[rd.tel], Rw = R.mul(tl.W.R, R.x(-E_MAX));
  const m0 = [rd.side * TELM.TUBE[0], TELM.TUBE[1], TELM.TUBE[2] + TELM.TUBE_LEN];
  rd.capBase = X.make(Rw, V.mul(R.ap(Rw, m0), -1));
  rd.capV = V.add(V.mul(rd.dir, 9.5), [4.4 + (i % 4) * .3, 1.2, -3.3]);
  const vy = rd.capV[1], y0 = rd.mouth[1] - .55;
  rd.capEnd = (vy + Math.sqrt(vy * vy + 2 * 9.81 * y0)) / 9.81;
  rd.capPrims = GEO.primsOf(partOf(TELM, rd.side > 0 ? 'capR' : 'capL'), {});
});
function capX(i, u) {
  const rd = ROUNDS[i]; u = Math.min(u, rd.capEnd);
  const p = [rd.mouth[0] + rd.capV[0] * u, rd.mouth[1] + rd.capV[1] * u - 4.905 * u * u, rd.mouth[2] + rd.capV[2] * u];
  return X.mul(X.make(Rax(CAPA, 7.5 * u), p), rd.capBase);
}
/* spent booster pushed out of the ramjet nozzle; intake cover thrown off the nose */
ROUNDS.forEach(rd => {
  const s = rd.sep, v = vAt(TSEP), ca = Math.cos(s.a), sa = Math.sin(s.a);
  rd.bst = { x0: s.x - ca * 3.3, y0: s.y - sa * 3.3, a0: s.a, v: .55 * v };
  rd.cov = { x0: s.x + ca * 4.2, y0: s.y + sa * 4.2, a0: s.a, v: .32 * v };
  let u = 0; while (u < 20) { const p = bstAt(rd, u); if (p.y < seaY(p.x) + .3) break; u += 1 / 60; } rd.bstEnd = u;
  u = 0; while (u < 20) { const p = covAt(rd, u); if (p.y < seaY(p.x) + .3) break; u += 1 / 60; } rd.covEnd = u;
});
function bstAt(rd, u) {
  const b = rd.bst, k = b.v * 1.1 * (1 - Math.exp(-u / 1.1));
  return { x: b.x0 + Math.cos(b.a0) * k, y: b.y0 + Math.sin(b.a0) * k - 4.905 * u * u, a: b.a0 - 1.6 * u - .35 * u * u };
}
function covAt(rd, u) {
  const c = rd.cov, k = c.v * .8 * (1 - Math.exp(-u / .8));
  return { x: c.x0 + Math.cos(c.a0) * k, y: c.y0 + Math.sin(c.a0) * k + 6 * u - 4.905 * u * u, a: c.a0 + 5.5 * u };
}
/* cold-gas puffs at the mouth (stamped: nested rings), smoke rings along the boost (live) */
ROUNDS.forEach((rd, i) => {
  const r = M3.rng(900 + i * 7);
  rd.puffs = [];
  for (let j = 0; j < 9; j++) {
    const d = V.norm(V.add(V.mul(rd.dir, 1.1), [(r() - .5) * 1.8, (r() - .5) * .5, (r() - .5) * 1.6]));
    rd.puffs.push({ d, sp: 3 + r() * 6, life: 2.2 + r() * 1.5, r0: .45 + r() * .4, gr: 2.1 + r() * 1.3 });
  }
  rd.rings = [];
  const s0 = sAt(TIG) + .5, s1 = sAt(TSEP);
  for (let s = s0, j = 0; s < s1; s += 3.3, j++) {
    pathAt(rd.P, s, tmp);
    const ca = Math.cos(tmp.a), sa = Math.sin(tmp.a);
    const ax = V.norm([ca + (hash(i, j) - .5) * .5, sa + (hash(j, i + 3) - .5) * .5, (hash(i + 5, j) - .5) * 2.2]);
    const [U, Vv] = GEO.perp(ax), rot = hash(j, 77) * TAU, sq = .65 + hash(j, 91) * .45;
    rd.rings.push({
      tau: tauOfS(s), x: tmp.x - ca * 4.9, y: tmp.y - sa * 4.9, z: rd.z + (hash(j, 5) - .5) * .6,
      U: V.add(V.mul(U, Math.cos(rot)), V.mul(Vv, Math.sin(rot))), Vv: V.mul(V.add(V.mul(Vv, Math.cos(rot)), V.mul(U, -Math.sin(rot))), sq),
      life: 12 + hash(j, 13) * 6, gr: 1 + hash(j, 17) * 1.1, r0: .3 + hash(j, 19) * .25,
    });
  }
});
ROUNDS.forEach(rd => rd.rings.forEach(ringAxes));
function puffAt(rd, p, a) {
  const k = (1 - Math.exp(-1.3 * a)) / 1.3 * p.sp;
  return [rd.mouth[0] + p.d[0] * k + .6 * a, rd.mouth[1] + p.d[1] * k + .45 * a, rd.mouth[2] + p.d[2] * k];
}

/* ---------- the two destroyers at the far edge ----------
   DDG-51s stand side-on, bows toward the battery, to scale like every vehicle, 4 km apart in
   range. The compressed range axis steepens the curve of the sea to ~8 deg out here, so each
   hull is trimmed to lie on it, as the rounds' paths do. Everything below lives in plate
   coordinates (x, Y) and is analytic in its spawn time. */
const Pp = (x, Y) => [x, Y / CP, 0];
const DDM = WIRE(HD.destroyer()), DDA = HD.destroyer.A;
const SHIP_ST = { ciwsYaw: [0, Math.PI], ciwsPitch: [.03, .35] };
const SHIPS = [{ x: 2060, z: 20, id: 'DDG 1' }, { x: 2290, z: 44, id: 'DDG 2' }];
SHIPS.forEach(sh => {
  sh.th = Math.atan2(seaY(sh.x + 5) - seaY(sh.x - 5), 10);
  sh.W = X.make(R.mul(R.z(sh.th), R.y(-Math.PI / 2)), [sh.x, seaY(sh.x), sh.z]);
  sh.P = p => { const q = X.ap(sh.W, p); return [q[0], plY(q[1], q[2])]; };
  sh.bow = sh.P(DDA.bow); sh.stern = sh.P(DDA.stern); sh.mz = sh.P(DDA.ciws(SHIP_ST, 0)); sh.mast = sh.P(DDA.mastTop);
  sh.km = (ginv(sh.x) / 1000).toFixed(1);
});
/* what becomes of each round: stopped by an interceptor out at plate x mx, stopped short by the
   close-in gun, or a hit (metres aft of the stem) */
const FATE = [
  { k: 'sm', s: 0, mx: 1725, cell: 13, ap: 100 },
  { k: 'sm', s: 1, mx: 1880, cell: 18, ap: 106 },
  { k: 'ciws', s: 0 },
  { k: 'hit', s: 0, aft: 16 },
  { k: 'sm', s: 1, mx: 1760, cell: 52, ap: 124 },
  { k: 'hit', s: 0, aft: 62 },
  { k: 'ciws', s: 1 },
  { k: 'hit', s: 1, aft: 34 },
];
ROUNDS.forEach((rd, i) => {
  const f = rd.f = FATE[i], sh = SHIPS[f.s];
  const xe = f.k === 'sm' ? f.mx : f.k === 'ciws' ? sh.bow[0] - 26 : sh.bow[0] + f.aft * Math.cos(sh.th);
  let lo = 8, hi = 138;
  for (let n = 0; n < 60; n++) { const m = (lo + hi) / 2; pathAt(rd.P, sAt(m), tmp); if (tmp.x < xe) lo = m; else hi = m; }
  rd.tauEnd = hi; rd.SEnd = rd.L + hi;
  pathAt(rd.P, sAt(hi), tmp); rd.end = { x: tmp.x, y: tmp.y, Y: plY(tmp.y, rd.z), a: tmp.a };
});

/* ---------- interceptors: SM-6 out of the Mk 41 cells, arcing over onto rounds ----------
   Drawn arc on the plate (cell -> up the ship's vertical -> over -> down onto the round), timed
   by true speed: along the compressed range axis a plate unit is CMP metres, so the strobe
   stamps sit wide on the climb and close along the long reach out. The Mk 72 burns 6 s,
   then drops away and the sustainer carries on. */
const SM_TB = 6, SM_LEN = 6.55;
const smV = u => 35 + 1150 * (1 - Math.exp(-u / 3.2));
const SMS = [];
ROUNDS.forEach((rd, i) => {
  if (rd.f.k !== 'sm') return;
  const f = rd.f, sh = SHIPS[f.s], c = X.ap(sh.W, DDA.vls(f.cell)), z = c[2];
  const x0 = c[0], Y0 = plY(c[1], z), xm = rd.end.x, Ym = rd.end.Y, dX = x0 - xm;
  const up = [-Math.sin(sh.th), Math.cos(sh.th)];
  const Yap = Math.max(Y0, Ym) + f.ap, dY = Yap - Ym;
  const pts = [
    [x0 - up[0] * 3.3, Y0 - up[1] * 3.3],
    [x0 + up[0] * 6, Y0 + up[1] * 6],
    [x0 + up[0] * 40, Y0 + up[1] * 40],
    [x0 - .03 * dX, Yap - .3 * dY],
    [x0 - .17 * dX, Yap - .02 * dY],
    [x0 - .38 * dX, Yap - .22 * dY],
    [xm + .3 * dX, Ym + .36 * dY],
    [xm + .1 * dX, Ym + .1 * dY],
    [xm, Ym],
    [xm - .1 * dX, Ym - .06 * dY],
  ];
  const P = spline(pts, () => .6, pts.length - 1), n = P.X.length, Uu = new Float64Array(n);
  let u = 0;
  for (let k = 1; k < n; k++) {
    const dx = P.X[k] - P.X[k - 1], dy = P.Y[k] - P.Y[k - 1], ds = Math.hypot(dx, dy) || 1e-9;
    // local and to scale over the ship, then the range axis takes over
    const c2 = E.mix(1, CMP, E.ss(25, 110, P.SL[k]));
    u += Math.hypot(c2 * dx, dy) / smV(u); Uu[k] = u;
  }
  const sm = { i, s: f.s, rd, P, U: Uu, tf: u, S0: rd.SEnd - u, z, x0, Y0, up, n: SMS.length };
  SMS.push(sm);
});
const SM1 = SMS.reduce((a, b) => a.S0 <= b.S0 ? a : b);
function smPose(sm, u, out) {
  u = E.clamp(u, 0, sm.tf);
  const U = sm.U, P = sm.P; let lo = 0, hi = U.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (U[m] < u) lo = m; else hi = m; }
  const f = (u - U[lo]) / (U[hi] - U[lo] || 1);
  out.x = P.X[lo] + (P.X[hi] - P.X[lo]) * f; out.Y = P.Y[lo] + (P.Y[hi] - P.Y[lo]) * f;
  const j0 = Math.max(0, lo - 3), j1 = Math.min(U.length - 1, hi + 3);
  out.a = Math.atan2(P.Y[j1] - P.Y[j0], P.X[j1] - P.X[j0]);
  out.u = u; out.k = lo;
  return out;
}
SMS.forEach(sm => {
  const r = M3.rng(4400 + sm.n * 13), q = {};
  // exhaust vented up the Mk 41 uptake at launch: a low cloud off the deck
  sm.puffs = [];
  for (let j = 0; j < 8; j++) {
    const a = (j / 8 - .5) * 2.6 + (r() - .5) * .3;
    sm.puffs.push({ dx: Math.sin(a) * (.6 + r()), dy: .5 + r() * .9, sp: 4 + r() * 7, life: 2.6 + r() * 2, r0: .8 + r() * .6, gr: 2.4 + r() * 1.6 });
  }
  // smoke rings: dense along the boost, thin behind the sustainer; they linger long after
  sm.rings = [];
  let acc = 0;
  for (let k = 1; k < sm.U.length; k++) {
    const u = sm.U[k], boost = u < SM_TB, sp = boost ? 3.4 : 8.5;
    acc += sm.P.SL[k] - sm.P.SL[k - 1];
    if (acc < sp || u < .12) continue;
    acc = 0;
    smPose(sm, u, q);
    const j = sm.rings.length, ca = Math.cos(q.a), sa = Math.sin(q.a);
    const ax = V.norm([ca + (hash(sm.n + 40, j) - .5) * .5, sa + (hash(j, sm.n + 43) - .5) * .5, (hash(sm.n + 45, j) - .5) * 2.2]);
    const [Uv, Vv] = GEO.perp(ax), rot = hash(j, 71) * TAU, sq = .6 + hash(j, 93) * .45;
    const back = boost ? 3.6 : 1.9;
    sm.rings.push({
      u, x: q.x - ca * back, y: (q.Y - sa * back - sm.z * SP) / CP, z: sm.z + (hash(j, 7) - .5) * .8,
      U: V.add(V.mul(Uv, Math.cos(rot)), V.mul(Vv, Math.sin(rot))), Vv: V.mul(V.add(V.mul(Vv, Math.cos(rot)), V.mul(Uv, -Math.sin(rot))), sq),
      life: boost ? 34 + hash(j, 11) * 12 : 12 + hash(j, 11) * 6, gr: boost ? 1.3 + hash(j, 17) * 1.1 : .7 + hash(j, 17) * .5,
      r0: boost ? .45 + hash(j, 19) * .3 : .25, al: boost ? 1 : .5,
    });
  }
  sm.rings.forEach(ringAxes);
  // the spent Mk 72 drops off the back, tumbling, into the sea
  if (sm.tf > SM_TB + .3) {
    smPose(sm, SM_TB, q);
    const ca = Math.cos(q.a), sa = Math.sin(q.a), smq = {};
    smPose(sm, SM_TB + .05, smq);
    const vx = (smq.x - q.x) / .05, vy = (smq.Y - q.Y) / .05;
    const mk = { x0: q.x - ca * 2.41, Y0: q.Y - sa * 2.41, vx: vx * .55, vy: vy * .55, a0: q.a, w: -2.2 - r() };
    let t = 0; while (t < 20) { const p = mkAt(mk, t); if (p.Y < seaP(p.x, sm.z) + .3) break; t += 1 / 120; }
    mk.end = t; const pe = mkAt(mk, t); mk.sx = pe.x; mk.sY = seaP(pe.x, sm.z);
    sm.mk = mk;
  }
});
function mkAt(mk, t) { const k = .8 * (1 - Math.exp(-t / .8)); return { x: mk.x0 + mk.vx * k, Y: mk.Y0 + mk.vy * k - 4.905 * t * t, a: mk.a0 + mk.w * t }; }
function smPuffAt(sm, p, a) {
  const k = (1 - Math.exp(-1.2 * a)) / 1.2 * p.sp;
  return [sm.x0 + p.dx * k - 1.1 * a, sm.Y0 + p.dy * k * .6 + .5 * a];
}

/* ---------- bursts: interceptor meetings (large, far out) and close-in gun kills (small) ---------- */
const KILLS = [];
ROUNDS.forEach((rd, i) => { if (rd.f.k !== 'hit') KILLS.push({ i, sm: rd.f.k === 'sm', s: rd.f.s, S: rd.SEnd, x: rd.end.x, Y: rd.end.Y }); });
KILLS.sort((a, b) => a.S - b.S);
function fragAt(K, f, u) { const k = f.vx * f.td * (1 - Math.exp(-u / f.td)); return { x: K.x + k, Y: K.Y + f.vy * u - 4.905 * u * u, a: f.a0 + f.w * u }; }
KILLS.forEach((K, n) => {
  const r = M3.rng(5150 + n * 37);
  K.n = n; K.R = K.sm ? 9.5 : 6.5; K.fb = K.sm ? 1.15 : .9; K.life = K.sm ? 5.2 : 4.2; K.frags = [];
  const N = K.sm ? 24 : 16, NBIG = K.sm ? 6 : 4;
  for (let j = 0; j < N; j++) {
    const big = j < NBIG;
    let vx = V_CR * (big ? .3 + .2 * r() : .1 + .6 * r());
    // the interceptor's own pieces carry on toward the battery
    if (K.sm && !big && j % 3 === 0) vx = -V_CR * (.3 + .9 * r());
    const f = { vx, td: .5 + .4 * r(), vy: big ? 2 + 5 * r() : -3 + (K.sm ? 23 : 19) * r(),
                len: big ? 2.8 + 1.8 * r() : 1.1 + 1.2 * r(), w: (r() < .5 ? -1 : 1) * (4 + 14 * r()), a0: r() * TAU, big };
    let u = 0; while (u < 7) { const p = fragAt(K, f, u); if (p.Y <= seaP(p.x, 0)) break; u += 1 / 120; }
    f.end = u; const p = fragAt(K, f, u); f.sx = p.x; f.sY = seaP(p.x, 0);
    K.frags.push(f);
  }
});
/* both forward Phalanx: 1100 m/s along the to-scale hull, then 1100/CMP plate units/s over the
   compressed range; each tracer led onto its round, aimed high for its drop, a little dispersion */
const TRC_V = 1100 / CMP, TRC_DASH = .045;
const CIWS = [];
KILLS.filter(K => !K.sm).forEach((K, n) => {
  const sh = SHIPS[K.s], C = { K, s: K.s, mz: sh.mz, D: sh.mz[0] - sh.bow[0], list: [] };
  const r = M3.rng(7717 + n * 3), q = {};
  for (let s = K.S - 1.25; s < K.S - .03; s += .09) {
    let ta = s + .4;
    for (let it = 0; it < 8; it++) { roundPose(K.i, ta, q); ta = s + trcT(C, Math.hypot(q.x - C.mz[0], q.Y - C.mz[1])); }
    roundPose(K.i, ta, q);
    const tf = ta - s, dx = q.x - C.mz[0], dy = q.Y + 4.905 * tf * tf - C.mz[1], nn = Math.hypot(dx, dy), j = (r() - .5) * .06;
    const tr = { s, ux: (dx * Math.cos(j) - dy * Math.sin(j)) / nn, uy: (dx * Math.sin(j) + dy * Math.cos(j)) / nn, end: 1.5 + .3 * r() };
    for (let a = .05; a < tr.end; a += 1 / 120) { const p = trcAt(C, tr, a); if (p[1] <= seaP(p[0], 0)) { tr.end = a; break; } }
    C.list.push(tr);
  }
  C.s0 = C.list[0].s; C.s1 = C.list[C.list.length - 1].s;
  CIWS.push(C);
});
function trcD(C, a) { return a * 1100 < C.D ? a * 1100 : C.D + (a - C.D / 1100) * TRC_V; }
function trcT(C, d) { return Math.min(d, C.D) / 1100 + Math.max(0, d - C.D) / TRC_V; }
function trcAt(C, tr, a) { const d = trcD(C, a); return [C.mz[0] + tr.ux * d, C.mz[1] + tr.uy * d - 4.905 * a * a]; }
/* the hits: fireball, debris thrown up off the ship, a smoke column each (the first one tallest) */
const FB_LIFE = 1.5;
const HITS = ROUNDS.filter(rd => rd.f.k === 'hit').sort((a, b) => a.SEnd - b.SEnd)
  .map((rd, j) => ({ S: rd.SEnd, x: rd.end.x, Y: rd.end.Y, j, s: rd.f.s, i: ROUNDS.indexOf(rd), RM: [15, 16.5, 15.5][j], HM: [100, 66, 78][j], ws: [1, .74, .82][j] }));
function debAt(h, d, u) { return { x: h.x + d.vx * u, Y: h.Y + d.vy * u - 4.905 * u * u, a: d.a0 + d.w * u }; }
HITS.forEach(h => {
  const r = M3.rng(6100 + h.j); h.deb = [];
  const zs = SHIPS[h.s].z - 11;
  for (let n = 0; n < 8; n++) {
    const d = { vx: (r() - .4) * 26, vy: 8 + 15 * r(), len: .6 + 1.4 * r(), w: (r() - .5) * 26, a0: r() * TAU };
    let u = .3; while (u < 6) { const p = debAt(h, d, u); if (p.Y <= seaP(p.x, zs)) break; u += 1 / 120; }
    d.end = u; h.deb.push(d);
  }
});
// the shutter closes once the last column has had its seconds
const S_END = HITS[HITS.length - 1].S + 5.2;
const S_FIRST_SM = Math.min(...SMS.map(sm => sm.S0));

/* drawing, shared by the stamped ghosts (into a recorder) and the live frame (into the Wire) */
function ballInto(W, x, Y, r, ph, al, n) {
  let px = 0, py = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n * TAU, rr = r * (1 + .13 * Math.sin(5 * t + ph) + .07 * Math.sin(9 * t - 1.7 * ph) + .04 * Math.sin(14 * t + 2.3 * ph));
    const qx = x + rr * Math.cos(t), qy = Y + rr * Math.sin(t);
    if (i) W.seg(Pp(px, py), Pp(qx, qy), al);
    px = qx; py = qy;
  }
}
function spikesInto(W, x, Y, r0, r1, n, ph, al) {
  for (let i = 0; i < n; i++) { const t = i / n * TAU + ph, c = Math.cos(t), s = Math.sin(t), e = r1 * (.7 + .5 * hash(i, 31 + (ph * 10 | 0))); W.seg(Pp(x + c * r0, Y + s * r0), Pp(x + c * e, Y + s * e), al); }
}
function tickInto(W, x, Y, a, len, al) { const c = Math.cos(a) * len * .5, s = Math.sin(a) * len * .5; W.seg(Pp(x - c, Y - s), Pp(x + c, Y + s), al); }
function splashInto(W, x, Y0, a, H, al) {
  const u = a / 1.1; if (u >= 1) return;
  const h = H * Math.sin(Math.PI * Math.min(1, u * 1.3)), w = H * (.25 + .35 * u), f = al * (1 - u);
  W.seg(Pp(x - w, Y0), Pp(x - w * .35, Y0 + h * .8), f); W.seg(Pp(x, Y0), Pp(x, Y0 + h), f); W.seg(Pp(x + w, Y0), Pp(x + w * .35, Y0 + h * .8), f);
}
// tracers in flight at sim time t: one dash each, and the muzzle flash while the gun is firing
function trcInto(W, C, t, al) {
  W.style('#FFFFFF', 1.3);
  for (const tr of C.list) {
    const a = t - tr.s; if (a < 0 || a > tr.end) continue;
    const p = trcAt(C, tr, a), q = trcAt(C, tr, Math.max(0, a - TRC_DASH));
    W.seg(Pp(q[0], q[1]), Pp(p[0], p[1]), al * (1 - .45 * a / tr.end));
  }
  if (t >= C.s0 && t <= C.s1 + .05) {
    // the stream is across the to-scale hull in 0.04 s: drawn as one streak from the muzzle past the stem
    const tr = C.list[Math.min(C.list.length - 1, Math.floor((t - C.s0) / .09))], d = C.D + 3;
    W.seg(Pp(C.mz[0], C.mz[1]), Pp(C.mz[0] + tr.ux * d, C.mz[1] + tr.uy * d), al * .45);
    spikesInto(W, C.mz[0], C.mz[1], .3, 2.6, 7, t * 7, al * .8);
  }
  W.style('#F6F5F2', 1);
}
function killInto(W, Kl, a, al) {
  W.style('#FFFFFF', 1.3);
  if (a < Kl.fb) {
    const R = Kl.R * (1 - Math.exp(-a / .12)), f = al * .95 * Math.pow(1 - a / Kl.fb, .7), x = Kl.x + 2.2 * a, Y = Kl.Y + 1.2 * a;
    ballInto(W, x, Y, R, 1.3 + 3 * a + Kl.n, f, 28);
    if (a < .3) spikesInto(W, x, Y, R * .8, R * 2 + 3, 11, .4 + Kl.n, f * .8);
    // the interceptor's blast: a thin shock shell running out ahead of the fireball
    if (Kl.sm && a < .55) ballInto(W, Kl.x, Kl.Y, Kl.R * 2.6 * (1 - Math.exp(-a / .16)), 2.1 + Kl.n, al * .5 * (1 - a / .55), 36);
  }
  W.style('#F6F5F2', 1);
  // the smudge it leaves, carried on a little by the round's momentum
  const sl = Kl.sm ? 4.4 : 3.3;
  if (a > .3 && a < sl) {
    const gg = a - .3, f = al * (Kl.sm ? .3 : .24) * Math.pow(1 - gg / (sl - .3), 1.3), x = Kl.x + 7 * (1 - Math.exp(-gg / .6)) + gg, Y = Kl.Y + .9 * gg;
    ballInto(W, x, Y, (Kl.sm ? 3.4 : 2.6) + 2.6 * Math.sqrt(gg), 1.7 + gg * .8 + Kl.n, f, 22);
  }
  W.style('#FFFFFF', 1.3);
  for (const fr of Kl.frags) {
    if (a <= fr.end) { const p = fragAt(Kl, fr, a); tickInto(W, p.x, p.Y, p.a, fr.len, al * (fr.big ? 1 : .85)); }
    else if (fr.big) splashInto(W, fr.sx, fr.sY, a - fr.end, fr.len * 1.5, al * .8);
  }
  W.style('#F6F5F2', 1);
}
function fireInto(W, h, a, al) {
  if (a < 0 || a >= FB_LIFE) return;
  const R = h.RM * (1 - Math.exp(-a / .2)), f = al * .95 * Math.pow(1 - a / FB_LIFE, .6), x = h.x - 1.2 * a, Y = h.Y + 3.2 * a;
  W.style('#FFFFFF', 1.3);
  ballInto(W, x, Y, R, h.j * 2.1 + a * 2.4, f, 36);
  if (a < .7) ballInto(W, x, Y - .1 * R, R * .55, h.j + a * 3, f * .8, 24);
  if (a < .3) spikesInto(W, x, Y, R * .9, R * 1.6 + 2, 13, h.j + .2, f * .7);
  W.style('#F6F5F2', 1);
}
// the fire left on board: short flickering tongues, live only (keyed to sim time, so a held plate holds them)
function flamesInto(W, h, S, a) {
  if (a < .8) return;
  const fk = Math.floor(S * 22), al = .75 * E.ss(.8, 1.4, a);
  W.style('#FFFFFF', 1.3);
  for (let n = 0; n < 5; n++) {
    const x0 = h.x + (n - 2) * 2.2 * h.ws, y0 = h.Y - 1.5, hf = (2.5 + 4 * hash(fk, n + 7 * h.j)) * h.ws;
    let px = x0, py = y0;
    for (let s = 1; s <= 3; s++) { const qx = x0 + (hash(fk + s, n * 3 + h.j) - .5) * 1.6 - .5 * s, qy = y0 + hf * s / 3; W.seg(Pp(px, py), Pp(qx, qy), al * (1 - s * .22)); px = qx; py = qy; }
  }
  W.style('#F6F5F2', 1);
}
function debInto(W, h, a, al) {
  for (const d of h.deb) if (a >= 0 && a <= d.end) { const p = debAt(h, d, a); tickInto(W, p.x, p.Y, p.a, d.len, al * .8); }
}
/* the column at age a: two wavering edges widening with height under a billowing crown; it rises
   straight off the fire and bends away on the wind higher up. The stamped copies keep the crown
   and only a trace of the edges, so the exposures stack into growth rings inside the live outline. */
function smokeInto(W, h, a, al, eK) {
  const gg = a - .25; if (gg <= 0) return;
  const H = h.HM * (1 - Math.exp(-gg / 6.5)); if (H < 1.2) return;
  const n = Math.max(4, Math.min(26, Math.round(H / 3))), sd = h.j * 7.3;
  let lx = 0, ly = 0, rx = 0;
  for (let i = 0; i <= n; i++) {
    const z = H * i / n, Y = h.Y + z;
    const ax = h.x - .0024 * z * z - 3 * M3.noise(z * .03 - gg * .1, sd + 9) * Math.min(1, z / 25);
    const w = h.ws * (7 + .26 * z), bl = Math.min(1, z / 10);
    // billows along the edges, drifting up the column
    const L = ax - w * (.5 + bl * (.13 * M3.noise(z * .11 - gg * .35, sd + 1) + .07 * Math.sin(z * .32 - gg * 1.1 + sd)));
    const Rr = ax + w * (.5 + bl * (.13 * M3.noise(z * .11 - gg * .35, sd + 3) + .07 * Math.sin(z * .29 - gg * 1.2 + sd + 2)));
    const fa = al * eK * (.35 + .3 * Math.min(1, z / 15));
    if (i) { W.seg(Pp(lx, ly), Pp(L, Y), fa); W.seg(Pp(rx, ly), Pp(Rr, Y), fa); }
    lx = L; rx = Rr; ly = Y;
  }
  const cx = (lx + rx) / 2, r = (rx - lx) / 2 * 1.08, ph = sd + gg * .3;
  let px = lx, py = ly;
  for (let i = 1; i <= 16; i++) {
    const t = Math.PI - i / 16 * Math.PI, rr = r * (1 + .15 * Math.sin(4 * t + ph) + .08 * Math.sin(7 * t - ph));
    const qx = cx + rr * Math.cos(t), qy = ly + rr * .75 * Math.sin(t);
    W.seg(Pp(px, py), Pp(qx, qy), al * .6); px = qx; py = qy;
  }
}

/* ---------- MH-60R and the F/A-18E pair: they cross the plane of fire ---------- */
function flyer(o) {
  // o: { V, S0, S1, mid, x, z, psi(S) deg, alt, turn } integrates true heading into plate motion
  const HZ = 60, n = Math.round((o.S1 - o.S0) * HZ), T = { S0: o.S0, HZ, x: new Float64Array(n + 1), z: new Float64Array(n + 1), psi: new Float64Array(n + 1) };
  const im = Math.round((o.mid - o.S0) * HZ);
  T.x[im] = o.x; T.z[im] = o.z;
  for (let i = 0; i <= n; i++) T.psi[i] = o.psi(o.S0 + i / HZ) * DEG;
  for (let i = im + 1; i <= n; i++) { const p = T.psi[i - 1]; T.x[i] = T.x[i - 1] + o.V * Math.sin(p) / CMP / HZ; T.z[i] = T.z[i - 1] + o.V * Math.cos(p) / HZ; }
  for (let i = im - 1; i >= 0; i--) { const p = T.psi[i + 1]; T.x[i] = T.x[i + 1] - o.V * Math.sin(p) / CMP / HZ; T.z[i] = T.z[i + 1] - o.V * Math.cos(p) / HZ; }
  T.n = n; T.o = o;
  return T;
}
function flyAt(T, S) {
  const f = E.clamp((S - T.S0) * T.HZ, 0, T.n - 1e-6), i = f | 0, u = f - i;
  const x = T.x[i] + (T.x[i + 1] - T.x[i]) * u, z = T.z[i] + (T.z[i + 1] - T.z[i]) * u, psi = T.psi[i] + (T.psi[i + 1] - T.psi[i]) * u;
  const dpsi = (T.psi[Math.min(T.n, i + 1)] - T.psi[Math.max(0, i - 1)]) * T.HZ / 2;
  // flies level; the tiny climb cancels the lens's 1.2 deg look-down so the pass reads level
  const y = seaY(x) + T.o.alt - (z - 12) * Math.tan(PITCH);
  return { x, y, z, psi, bank: Math.atan(T.o.V * -dpsi / 9.81) };
}
const HV = 48;
const HS = [34.5, 43.5], FS = [43.5, 50.5];      // sim windows the rail gives each of them
const HTRK = flyer({ V: HV, S0: 20, S1: 60, mid: 39, x: 760, z: 12, alt: 30, psi: S => 252 - 72 * E.ss(32.5, 45.5, S) });
const FV = 230, FTRK = flyer({ V: FV, S0: 28, S1: 68, mid: 47.5, x: 1150, z: 12, alt: 205, psi: S => 252 - 30 * E.ss(44.5, 51.5, S) });
const WING = { back: 380, up: 24 };
function heloPose(S) {
  const p = flyAt(HTRK, S);
  const Rm = R.mul(R.y(p.psi), R.mul(R.x(4 * DEG), R.z(p.bank)));
  return { p, X: X.make(Rm, [p.x, p.y - 2.2, p.z]), st: { rotor: 27.75 * S, trotor: 124.4 * S, droop: 0 } };
}
function fighterPose(S, j) {
  const p = flyAt(FTRK, S);
  if (j) { p.x -= Math.sin(p.psi) * WING.back / CMP; p.z -= Math.cos(p.psi) * WING.back; p.y += WING.up; }
  const Rm = R.mul(R.y(p.psi), R.mul(R.x(-1.5 * DEG), R.z(p.bank)));
  return { p, X: X.make(Rm, [p.x, p.y, p.z]), st: { fan: 940 * S + j * 1.3, nozzle: .45, ab: 0 } };
}

/* ---------- film time -> sim time ----------
   Rate keys; the cruise (a1) and the barrage (a3) scales are solved so the first interceptor
   leaves its deck as the rail settles on the ships and the shutter closes at T_FWD_END; a2 makes
   the rewind land exactly on S = 0. */
function mkWarp(keys) {
  const T1 = keys[keys.length - 1][0], N = Math.ceil(T1 * 200), acc = new Float64Array(N + 1);
  const rate = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const a = keys[i], b = keys[i + 1]; return E.mix(a[1], b[1], E.ss(a[0], b[0], t)); };
  for (let k = 1; k <= N; k++) { const t0 = (k - 1) / N * T1, t1 = k / N * T1; acc[k] = acc[k - 1] + (rate(t0) + rate(t1)) * .5 * (t1 - t0); }
  const f = t => { const x = E.clamp(t / T1, 0, 1) * N, k = Math.min(N - 1, Math.floor(x)); return acc[k] + (acc[k + 1] - acc[k]) * (x - k); };
  f.rate = rate; return f;
}
const T_FWD_END = 121, T_REW = 140, T_SM0 = 81.5;
const WK = (a1, a3, a2) => [
  [0, 0], [2.5, 1], [15.5, 1], [18, .62], [41, .62], [46.5, .66 * a1], [74, .66 * a1], [79.5, a3], [99, a3], [102, .95 * a3], [105, a3],
  [107, 1.9 * a3], [109, 1.1 * a3], [111, .9 * a3], [118.5, .85 * a3], [T_FWD_END, 0],
  [T_REW, 0], [143.5, -9 * a2], [149, -11 * a2], [152.5, -2.2], [156, -1.3], [160.5, -1.6], [164, -.9], [170, 0]];
let A1, A2, A3, SW;
{
  const ev = (a1, a3) => { const f = mkWarp(WK(a1, a3, 0)); return [f(T_SM0), f(T_FWD_END)]; };
  const e00 = ev(0, 0), e10 = ev(1, 0), e01 = ev(0, 1);
  const a = e10[0] - e00[0], b = e01[0] - e00[0], c = e10[1] - e00[1], d = e01[1] - e00[1];
  const p = S_FIRST_SM - e00[0], q = S_END - e00[1], det = a * d - b * c;
  A1 = (p * d - b * q) / det; A3 = (a * q - p * c) / det;
  const r0 = mkWarp(WK(A1, A3, 0))(DUR), r1 = mkWarp(WK(A1, A3, 1))(DUR); A2 = -r0 / (r1 - r0);
  SW = mkWarp(WK(A1, A3, A2));
}
// film time of a sim moment on the forward pass
function tOfS(S) { let lo = 0, hi = T_FWD_END; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (SW(m) < S) lo = m; else hi = m; } return (lo + hi) / 2; }

/* ---------- lens: orthographic on the rail, perspective for the macro ----------
   toCam depth is the perspective divisor 1 + w*(d.f) (w = 1/D), so w = 0 is exact ortho and
   the Wire renderer's near clip still works in the macro. */
class Lens {
  constructor() { this.W = 1920; this.H = 1080; this.cx = 960; this.cy = 500; this.shake = [0, 0]; }
  set(c, yaw, pitch, k, w) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = [sy * cp, -sp, cy * cp], r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
    this.f = f; this.r = r; this.u = u; this.c = c; this.k = k; this.w = w;
    this.eye = V.mad(c, f, -(w > 0 ? 1 / w : 1e7));
    this.near = w > 0 ? w * .05 : -1e9;
    return this;
  }
  toCam(p) {
    const dx = p[0] - this.c[0], dy = p[1] - this.c[1], dz = p[2] - this.c[2], r = this.r, u = this.u, f = this.f;
    return [dx * r[0] + dy * r[1] + dz * r[2], dx * u[0] + dy * u[1] + dz * u[2], 1 + this.w * (dx * f[0] + dy * f[1] + dz * f[2])];
  }
  fromCam(C) { return [this.cx + this.shake[0] + this.k * C[0] / C[2], this.cy + this.shake[1] - this.k * C[1] / C[2]]; }
  project(p) { const C = this.toCam(p); if (C[2] < this.near) return null; const s = this.fromCam(C); return [s[0], s[1], C[2]]; }
}
const LC = new Lens();
const W = new Wire(LC, { fog: [1e9, 2e9] });

/* recorder: GEO draws into it exactly as into a Wire; it keeps plate-space segments */
const COL = ['#F6F5F2', '#FFFFFF', '#F4D23C'], WID = [1, 1.3, 1.4];
class Rec {
  constructor() { this.cam = { eye: V.mad([0, 0, 0], [0, -SP, CP], -1e7), r: [1, 0, 0], u: [0, CP, SP], f: [0, -SP, CP] }; this.d = []; this.si = 0; }
  style(c) { this.si = c === '#F4D23C' ? 2 : c === '#FFFFFF' ? 1 : 0; return this; }
  fogK() { return 1; }
  seg(a, b, al) { if (al <= .004) return; this.d.push(a[0], a[1] * CP + a[2] * SP, b[0], b[1] * CP + b[2] * SP, Math.sqrt(Math.min(1, al)), this.si); }
  seg2() {}
  take() {
    // drop zero-length and duplicate edges (zero-volume hex hairlines emit each edge several times)
    const src = this.d, keep = [], seen = new Map();
    for (let i = 0; i < src.length; i += 6) {
      let x0 = src[i], y0 = src[i + 1], x1 = src[i + 2], y1 = src[i + 3];
      if (Math.abs(x1 - x0) + Math.abs(y1 - y0) < 2e-3) continue;
      if (x1 < x0 || (x1 === x0 && y1 < y0)) { const tx = x0, ty = y0; x0 = x1; y0 = y1; x1 = tx; y1 = ty; }
      const key = `${Math.round(x0 * 400)},${Math.round(y0 * 400)},${Math.round(x1 * 400)},${Math.round(y1 * 400)},${src[i + 5]}`;
      const j = seen.get(key);
      if (j === undefined) { seen.set(key, keep.length); keep.push(x0, y0, x1, y1, src[i + 4], src[i + 5]); }
      else if (src[i + 4] > keep[j + 4]) keep[j + 4] = src[i + 4];
    }
    const d = new Float32Array(keep); this.d.length = 0; this.si = 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < d.length; i += 6) { x0 = Math.min(x0, d[i], d[i + 2]); x1 = Math.max(x1, d[i], d[i + 2]); y0 = Math.min(y0, d[i + 1], d[i + 3]); y1 = Math.max(y1, d[i + 1], d[i + 3]); }
    return { d, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rr: Math.hypot(x1 - x0, y1 - y0) / 2 + .01, n: d.length / 6 };
  }
}
Rec.prototype.poly = Wire.prototype.poly; Rec.prototype.ring = Wire.prototype.ring; Rec.prototype.disc = Wire.prototype.disc;
const REC = new Rec();
// minAl drops faint back-facing lines when a stamped image only needs its outline
const record = (fn, minAl) => { fn(REC); if (minAl) { const d = REC.d, k = []; for (let i = 0; i < d.length; i += 6) if (d[i + 4] >= minAl) k.push(d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5]); REC.d = k; } return REC.take(); };

/* screen output: typed alpha buckets per style, a handful of strokes per frame */
class Out {
  constructor() { this.b = []; for (let i = 0; i < 3 * NB; i++) this.b.push({ a: new Float32Array(8192), n: 0 }); }
  reset() { for (const q of this.b) q.n = 0; }
  push(si, bk, x0, y0, x1, y1) {
    const q = this.b[si * NB + bk];
    if (q.n + 4 > q.a.length) { const na = new Float32Array(q.a.length * 2); na.set(q.a); q.a = na; }
    const a = q.a; let n = q.n; a[n++] = x0; a[n++] = y0; a[n++] = x1; a[n++] = y1; q.n = n;
  }
  flush(ctx) {
    ctx.lineCap = 'round';
    for (let s = 0; s < 3; s++) {
      ctx.strokeStyle = COL[s]; ctx.lineWidth = WID[s];
      for (let k = 0; k < NB; k++) {
        const q = this.b[s * NB + k]; if (!q.n) continue;
        const al = (k + .5) / NB; ctx.globalAlpha = al * al;
        ctx.beginPath(); const a = q.a;
        for (let i = 0; i < q.n; i += 4) { ctx.moveTo(a[i], a[i + 1]); ctx.lineTo(a[i + 2], a[i + 3]); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
const OUT = new Out();
/* plate -> screen of the current frame */
const PS = { ox: 0, oy: 0, k: 1, x0: 0, x1: 0, y0: 0, y1: 0 };
let segCount = 0;
// draw a record under the plate affine [a b c d e f] (X = a x + c y + e, Y = b x + d y + f)
function drawRec(rec, a, b, c, d, e, f, ga, so) {
  const k = PS.k, scx = PS.ox + k * (a * rec.cx + c * rec.cy + e), scy = PS.oy - k * (b * rec.cx + d * rec.cy + f), rr = rec.rr * k + 4;
  if (scx + rr < -30 || scx - rr > 1950 || scy + rr < -30 || scy - rr > 1110) return;
  const m00 = k * a, m01 = k * c, m02 = PS.ox + k * e, m10 = -k * b, m11 = -k * d, m12 = PS.oy - k * f;
  const D = rec.d, sg = Math.sqrt(ga) * NB;
  for (let i = 0; i < D.length; i += 6) {
    let bk = (D[i + 4] * sg) | 0; if (bk < 1) continue; if (bk > NB - 1) bk = NB - 1;
    const x0 = D[i], y0 = D[i + 1], x1 = D[i + 2], y1 = D[i + 3];
    OUT.push(so >= 0 ? so : D[i + 5], bk, m00 * x0 + m01 * y0 + m02, m10 * x0 + m11 * y0 + m12, m00 * x1 + m01 * y1 + m02, m10 * x1 + m11 * y1 + m12);
    segCount++;
  }
}
const rot = (th, px, py) => { const c = Math.cos(th), s = Math.sin(th); return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]; };
const pose = (th, x, y) => { const c = Math.cos(th), s = Math.sin(th); return [c, s, -s, c, x, y]; };
function circle(x, Y, r, ga, si) {
  const k = PS.k, sx = PS.ox + k * x, sy = PS.oy - k * Y, rp = r * k;
  if (sx + rp < -20 || sx - rp > 1940 || sy + rp < -20 || sy - rp > 1100 || ga <= .004) return;
  let bk = (Math.sqrt(ga) * NB) | 0; if (bk < 1) return; if (bk > NB - 1) bk = NB - 1;
  const n = Math.max(8, Math.min(30, Math.round(rp * .7)));
  let px = sx + rp, py = sy;
  for (let i = 1; i <= n; i++) { const t = i / n * TAU, qx = sx + rp * Math.cos(t), qy = sy + rp * Math.sin(t); OUT.push(si || 0, bk, px, py, qx, qy); px = qx; py = qy; }
}
const LODPX = [24, 150];
const TH = { mis: [30, 220, 700], sm: [24, 200, 650], launcher: [45], ram: [60], jacks: [], cap: [30, 400], puff: [], spuff: [], bst: [40], cov: [30], mk: [40],
  helo: [60, 1100], rotor: [40, 1100], ftr: [60, 1100], trc: [], kill: [], fire: [], deb: [], smoke: [] };
const lodOf = (px, th) => { th = th || LODPX; let l = 0; while (l < th.length && px >= th[l]) l++; return l; };
// crossfade across each LOD threshold so a zoom never pops
function drawLod(getRec, f, ga, px, so, th) {
  th = th || LODPX;
  for (let l = 0; l < th.length; l++) {
    const t0 = th[l] * .8, t1 = th[l] * 1.25;
    if (px >= t0 && px < t1) {
      const u = E.ss(t0, t1, px);
      if (1 - u > .003) drawRec(getRec(l), f[0], f[1], f[2], f[3], f[4], f[5], ga * (1 - u), so);
      if (u > .003) drawRec(getRec(l + 1), f[0], f[1], f[2], f[3], f[4], f[5], ga * u, so);
      return;
    }
  }
  drawRec(getRec(lodOf(px, th)), f[0], f[1], f[2], f[3], f[4], f[5], ga, so);
}
/* plate-space strokes straight into the output buckets: the rail lens is orthographic, so a
   smoke ring is a 2D ellipse and a swell line a polyline; no Wire projection, no allocation */
const CS = [];
for (let n = 0; n <= 30; n++) { const c = new Float64Array(n + 1), sn = new Float64Array(n + 1); for (let i = 0; i <= n; i++) { c[i] = Math.cos(i / n * TAU); sn[i] = Math.sin(i / n * TAU); } CS.push([c, sn]); }
const bucketOf = al => { let bk = (Math.sqrt(al) * NB) | 0; return bk > NB - 1 ? NB - 1 : bk; };
function ellipseP(x, Y, ax, ay, bx, by, r, n, al) {
  const bk = bucketOf(al); if (bk < 1) return;
  const k = PS.k, sx = PS.ox + k * x, sy = PS.oy - k * Y, rx = k * r;
  if (sx + rx * 1.5 < -20 || sx - rx * 1.5 > 1940 || sy + rx * 1.5 < -20 || sy - rx * 1.5 > 1100) return;
  const [c, sn] = CS[n];
  let px = sx + rx * ax, py = sy - rx * ay;
  for (let i = 1; i <= n; i++) {
    const qx = sx + rx * (ax * c[i] + bx * sn[i]), qy = sy - rx * (ay * c[i] + by * sn[i]);
    OUT.push(0, bk, px, py, qx, qy); px = qx; py = qy;
  }
  segCount += n;
}
const ID = [1, 0, 0, 1, 0, 0];

/* ---------- canonical records ---------- */
const CAN = new Map();
const canon = (key, fn) => { let r = CAN.get(key); if (!r) { r = record(fn); CAN.set(key, r); } return r; };
const MIS_C = X.make(R.look([1, 0, 0], [0, 1, 0]), [0, 0, 0]);
function flameInto(W, kind, lod) {
  W.style('#FFFFFF');
  if (kind === 1) {                    // booster: long bright cone
    const z0 = -4.85, L = 7.5, r = .2;
    if (lod === 0) W.seg([z0, 0, 0], [z0 - L, 0, 0], .9);
    else {
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; W.seg([z0, Math.cos(a) * r, Math.sin(a) * r], [z0 - L * (.8 + .2 * hash(i, 3)), Math.cos(a) * .05, Math.sin(a) * .05], .7); }
      W.seg([z0, 0, 0], [z0 - L * 1.2, 0, 0], .9);
      for (const s of [.9, 2.1, 3.3]) W.ring([z0 - s, 0, 0], [0, 1, 0], [0, 0, 1], r * (1 - s / 5), 14, .6);
    }
  } else if (kind === 2) {             // ramjet: thin plume with a train of shock diamonds
    const z0 = -4.5, L = 5.4, r = .26;
    if (lod === 0) W.seg([z0, 0, 0], [z0 - L * .7, 0, 0], .45);
    else {
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; W.seg([z0, Math.cos(a) * r, Math.sin(a) * r], [z0 - L, 0, 0], .22); }
      const cell = .95;
      for (let c = 0; c < 4; c++) {
        const s0 = c * cell, rr = r * (1 - c * .17), al = .55 * (1 - c * .2);
        for (const sg of [-1, 1]) {
          W.seg([z0 - s0, sg * rr, 0], [z0 - s0 - cell * .5, 0, 0], al);
          W.seg([z0 - s0 - cell * .5, 0, 0], [z0 - s0 - cell, sg * rr * .85, 0], al);
        }
      }
      W.seg([z0, 0, 0], [z0 - L * 1.3, 0, 0], .35);
    }
  } else if (kind === 3) {             // Mk 72: four nozzles in one broad, bright plume
    const z0 = -3.4, L = 9.5, r = .3;
    if (lod === 0) W.seg([z0, 0, 0], [z0 - L, 0, 0], .9);
    else {
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; W.seg([z0, Math.cos(a) * r, Math.sin(a) * r], [z0 - L * (.75 + .25 * hash(i, 5)), Math.cos(a) * .12, Math.sin(a) * .12], .7); }
      W.seg([z0, 0, 0], [z0 - L * 1.25, 0, 0], .9);
      for (const s of [1.1, 2.6, 4.2]) W.ring([z0 - s, 0, 0], [0, 1, 0], [0, 0, 1], r * (1.1 - s / 7), 14, .55);
    }
  } else if (kind === 4) {             // Mk 104 sustainer: a thin pencil
    const z0 = -1.72, L = 4.6, r = .1;
    if (lod === 0) W.seg([z0, 0, 0], [z0 - L * .7, 0, 0], .45);
    else { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; W.seg([z0, Math.cos(a) * r, Math.sin(a) * r], [z0 - L, 0, 0], .3); } W.seg([z0, 0, 0], [z0 - L * 1.3, 0, 0], .45); }
  }
  W.style('#F6F5F2');
}
// levels: 0 line, 1 hand sketch, 2 HD mid, 3 HD full
function misSketch(W, s2) {
  const r = .35, P = (x, y) => [x, y, 0];
  W.poly([P(-4.5, .3), P(-4.36, r), P(3.95, r), P(4.02, .33)], .9, false);
  W.poly([P(-4.5, -.3), P(-4.36, -r), P(3.95, -r), P(4.02, -.33)], .9, false);
  W.seg(P(-4.5, .3), P(-4.5, -.3), .8); W.seg(P(4.02, .33), P(4.02, -.33), .6);
  W.poly([P(4.02, .21), P(4.4, 0), P(4.02, -.21)], .8, false);
  for (const z of [-2.3, -.15, 1.85]) W.seg(P(z, r), P(z, -r), .35);
  const fs = .35 + .47 * Math.sin(Math.PI / 4) * (.25 + .75 * s2.fin);
  for (const sg of [1, -1]) W.poly([P(-3.52, sg * r), P(-4.05, sg * fs), P(-4.42, sg * fs), P(-4.42, sg * r)], .75, false);
  const wf = Math.sin((1 - s2.wing) * 1.75) * .53;
  if (wf > .02) W.poly([P(.95, r), P(-.15, r + wf), P(-.62, r + wf), P(-.62, r)], .75, false);
  else W.seg(P(.95, 0), P(-.62, 0), .5);
  if (s2.booster) W.poly([P(-4.5, .16), P(-4.85, .22), P(-4.85, -.22), P(-4.5, -.16)], .7, false);
}
function misRec(st, fl, lod) {
  const q = lod < 2 ? 4 : 10, wk = Math.round(st.wing * q), fk = Math.round(st.fin * q);
  return canon(`m${lod}|${wk}|${fk}|${st.booster ? 1 : 0}|${st.cover ? 1 : 0}|${fl}`, W => {
    const s2 = { wing: wk / q, fin: fk / q, booster: st.booster, cover: st.cover };
    if (lod === 0) { W.seg([-4.5, 0, 0], [4.4, 0, 0], 1); if (s2.fin > .5) W.seg([-4.2, -.8, 0], [-4.2, .8, 0], .5); }
    else if (lod === 1) misSketch(W, s2);
    else drawParts(W, MIS, MIS_C, s2, null, lod === 2 ? MID : {});
    flameInto(W, fl, lod === 0 ? 0 : 1);
  });
}
const TH_MIS = TH.mis, TH_SM = TH.sm;
// SM-6: 4.7 m missile on a 1.7 m Mk 72 (origin mid-stack, as HD.sm6)
function smSketch(W, boost) {
  const r = .1715, rb = .2665, P = (x, y) => [x, y, 0];
  W.poly([P(-1.55, r), P(2.1, r), P(2.75, r * .7), P(3.275, 0), P(2.75, -r * .7), P(2.1, -r), P(-1.55, -r)], .9, false);
  W.seg(P(2.1, r), P(2.1, -r), .35); W.seg(P(-1.55, r), P(-1.55, -r), .6);
  for (const sg of [1, -1]) { W.poly([P(-1.02, sg * r), P(-1.33, sg * .54), P(-1.5, sg * .54), P(-1.5, sg * r)], .75, false); W.seg(P(-.98, sg * (r + .02)), P(1.42, sg * (r + .06)), .35); }
  if (boost) {
    W.poly([P(-1.55, rb), P(-3.275, rb), P(-3.275, -rb), P(-1.55, -rb)], .85, true);
    for (const sg of [1, -1]) W.poly([P(-2.7, sg * rb), P(-3.1, sg * .62), P(-3.275, sg * .62), P(-3.275, sg * rb)], .7, false);
  }
}
function smRec(boost, fl, lod) {
  return canon(`s${lod}|${boost ? 1 : 0}|${fl}`, W => {
    if (lod === 0) W.seg([boost ? -3.275 : -1.55, 0, 0], [3.275, 0, 0], 1);
    else if (lod === 1) smSketch(W, boost);
    else drawParts(W, SMM, MIS_C, { booster: boost }, null, lod === 2 ? MID : {});
    flameInto(W, fl, lod === 0 ? 0 : 1);
  });
}
const mkRec = lod => canon(`K${lod}`, W => { if (lod === 0) W.seg([-.86, 0, 0], [.86, 0, 0], 1); else drawParts(W, MKM, MIS_C, {}, null, MID); });
const LBB = GEO.bounds(partOf(TELM, 'launcher'));
function launcherSketch(i) {
  return canon(`LS${i}`, W => {
    const t = TELS[i], [mn, mx] = LBB, M = p => X.ap(t.W, p), ty = TELM.TUBE[1], z0 = TELM.TUBE[2], z1 = z0 + TELM.TUBE_LEN, r = .55;
    W.poly([M([0, mn[1], mn[2]]), M([0, mn[1], mx[2]]), M([0, mx[1], mx[2]]), M([0, mx[1], mn[2]])], .55, true);
    for (const sg of [-1, 1]) W.seg(M([0, ty + sg * r, z0]), M([0, ty + sg * r, z1]), .9);
    W.seg(M([0, ty - r, z0]), M([0, ty + r, z0]), .8); W.seg(M([0, ty - r, z1]), M([0, ty + r, z1]), .9);
    W.seg(M([0, ty - r * .9, z1 + .13]), M([0, ty + r * .9, z1 + .13]), .7);
    for (let z = z0 + 1.3; z < z1 - .5; z += 1.55) W.seg(M([0, ty - r, z]), M([0, ty + r, z]), .3);
  });
}
function launcherRec(i, capL, capR, lod) {
  return canon(`L${i}|${capL}|${capR}|${lod}`, W => {
    const t = TELS[i];
    if (lod === 0) { const a = X.ap(t.W, [0, 1.9, -6.7]), b = X.ap(t.W, [0, 3.1, 2.7]); W.poly([[a[0], a[1], t.z], [b[0], a[1], t.z], [b[0], b[1], t.z], [a[0], b[1], t.z]], .9, true); }
    else drawParts(W, TELM, t.W, { elev: 0, capL, capR }, ['launcher', 'capL', 'capR'], lod === 1 ? MID : {});
  });
}
function staticRec(i, lod) {
  return canon(`T${i}|${lod}`, W => {
    const t = TELS[i];
    if (lod === 0) { const pts = [[-6.3, 0], [6.8, 0], [6.8, 1.6], [4.1, 1.6], [4.1, 3.4], [-6.3, 3.4]]; W.poly(pts.map(([z, y]) => [t.x - z, y, t.z]), .9, true); }
    else drawParts(W, TELM, t.W, { elev: 0, dep: 1 }, ['chassis', 'wheels', 'cab', 'fans'], lod === 1 ? MID : {});
  });
}
const BST_C = X.make(R.look([1, 0, 0], [0, 1, 0]), [0, 0, 0]);
const bstRec = lod => canon(`B${lod}`, W => { if (lod === 0) W.seg([-1.5, 0, 0], [1.3, 0, 0], 1); else drawParts(W, BST, BST_C, {}, null, MID); });
const covRec = lod => canon(`C${lod}`, W => {
  if (lod === 0) { W.seg([-.4, 0, 0], [.4, 0, 0], 1); return; }
  const T = X.mul(MIS_C, X.make(R.I(), [0, 0, -4.2]));
  for (const pr of GEO.primsOf(partOf(MIS, 'cover'), {})) if (!(pr.fine && lod === 1)) GEO.drawPrim(W, pr, T, Object.assign({}, GDEF, lod === 1 ? MID : {}));
});

// the destroyers stand still: one image per ship per level of detail, drawn live like the battery
const TH_SHIP = [70, 760], SHIP_REC = [[], []];
const shipRec = (si, lod) => SHIP_REC[si][lod] || (SHIP_REC[si][lod] = record(W => {
  const sh = SHIPS[si];
  if (lod === 0) drawParts(W, DDM, sh.W, SHIP_ST, ['hull', 'super', 'mast', 'stacks', 'spy', 'hangar'], MID);
  else drawParts(W, DDM, sh.W, SHIP_ST, lod === 1 ? DDM.parts.map(p => p.name).filter(n => n !== 'rails') : null, lod === 1 ? MID : {});
}, lod === 0 ? .45 : 0));

/* ---------- ghosts: every exposure of every moving thing in the plane of fire ---------- */
const GH = [];
const K_MAX = Math.floor(S_END / STAMP);
function perGhost(fnByLod, minAl) { const recs = [null, null, null, null]; return lod => recs[lod] || (recs[lod] = record(W => fnByLod(W, lod), lod === 1 ? minAl : 0)); }
{
  const q = {};
  for (let k = 0; k <= K_MAX; k++) {
    const t = k * STAMP;
    TELS.forEach((tl, i) => {
      if (t > tl.E && t < tl.E + ER_DUR) {
        const el = elevAt(i, t);
        GH.push({ t, kind: 'launcher', i, size: 9.4, af: .2, aff: rot(-el, tl.pivP[0], tl.pivP[1]), rec: lod => lod === 0 ? launcherRec(i, 0, 0, 0) : launcherSketch(i) });
        GH.push({ t, kind: 'ram', i, size: 5, af: .24, aff: null, rec: perGhost((W, lod) => {
          if (lod === 0) {
            const ends = []; for (const pr of GEO.primsOf(partOf(TELM, 'ram'), { elev: el })) if (pr.t === 'lathe') { ends.push(pr.a, V.mad(pr.a, pr.d, pr.st[pr.st.length - 1][0])); }
            let best = [ends[0], ends[1]], bd = 0; for (const a of ends) for (const b of ends) { const dd = V.dist(a, b); if (dd > bd) { bd = dd; best = [a, b]; } }
            W.seg(X.ap(tl.W, best[0]), X.ap(tl.W, best[1]), 1); return;
          }
          drawParts(W, TELM, tl.W, { elev: el }, ['ram'], MID);
        }) });
      }
      if (t > tl.J && t < tl.J + JK_DUR) {
        const dp = depAt(i, t);
        GH.push({ t, kind: 'jacks', i, size: 3, af: .22, aff: null, rec: perGhost(W => drawParts(W, TELM, tl.W, { dep: dp }, ['jacks'], MID)) });
      }
    });
    ROUNDS.forEach((rd, i) => {
      const tau = t - rd.L;
      if (tau < 0) return;
      if (tau < rd.tauEnd) {
        pathAt(rd.P, sAt(tau), tmp);
        const st = misState(tau), fl = flameOf(tau), Y = plY(tmp.y, rd.z);
        GH.push({ t, kind: 'mis', i, tau, size: 8.9, af: .3, aff: pose(tmp.a, tmp.x, Y), x: tmp.x, Y, rec: lod => misRec(st, fl, lod), hl: i === 0 && tau < TEX + .01 });
      }
      if (tau <= rd.capEnd + STAMP * .5) {
        const Xc = capX(i, tau);
        GH.push({ t, kind: 'cap', i, size: 1.1, af: .34, aff: null, rec: perGhost((W, lod) => {
          if (lod === 0) { const m = [rd.side * TELM.TUBE[0], TELM.TUBE[1], TELM.TUBE[2] + TELM.TUBE_LEN]; W.seg(X.ap(Xc, [m[0] - .55, m[1], m[2]]), X.ap(Xc, [m[0] + .55, m[1], m[2]]), 1); W.seg(X.ap(Xc, [m[0], m[1] - .55, m[2]]), X.ap(Xc, [m[0], m[1] + .55, m[2]]), 1); return; }
          for (const pr of rd.capPrims) if (!(pr.fine && lod === 1)) GEO.drawPrim(W, pr, Xc, Object.assign({}, GDEF, lod === 1 ? MID : {}));
        }) });
      }
      for (let j = 0; j < rd.puffs.length; j++) {
        const pf = rd.puffs[j];
        if (tau <= pf.life) GH.push({ t, kind: 'puff', i, j, tau, size: 2, af: .5 });
      }
      const ub = tau - TSEP;
      if (ub >= 0 && ub <= rd.bstEnd) { const p = bstAt(rd, ub); GH.push({ t, kind: 'bst', i, size: 2.9, af: .32, aff: pose(p.a, p.x, plY(p.y, rd.z)), rec: bstRec }); }
      const uc = tau - 5.65;
      if (uc >= 0 && uc <= rd.covEnd) { const p = covAt(rd, uc); GH.push({ t, kind: 'cov', i, size: .9, af: .32, aff: pose(p.a, p.x, plY(p.y, rd.z)), rec: covRec }); }
    });
    if (t >= HTRK.S0 && t <= HTRK.S0 + HTRK.n / HTRK.HZ) {
      const hp = heloPose(t);
      // body and rotor are stamped as separate images: a faint fuselage smear under a brighter disc of blades
      if (inSlab(hp.p.z)) {
        GH.push({ t, kind: 'helo', size: 19.8, af: .06, aff: null, rec: perGhost((W, lod) => {
          if (lod === 0) { W.seg(X.ap(hp.X, [0, 1.6, 5.4]), X.ap(hp.X, [0, 2.5, -9.8]), 1); return; }
          drawParts(W, HELO, hp.X, hp.st, lod === 2 ? ['fuselage', 'tail', 'gear', 'sensors', 'pylons'] : ['fuselage', 'tail'], lod === 1 ? MID : {});
        }, .55) });
        GH.push({ t, kind: 'rotor', size: 19.8, af: .3, aff: null, rec: perGhost((W, lod) => {
          if (lod === 0) { W.ring(X.ap(hp.X, HD.helo.HUB), X.dir(hp.X, [1, 0, 0]), X.dir(hp.X, [0, 0, 1]), 8.18, 20, .6); return; }
          drawParts(W, HELO, hp.X, hp.st, ['rotor', 'tailrotor'], lod === 1 ? MID : {});
        }) });
      }
    }
    for (let j = 0; j < 2; j++) if (t >= FTRK.S0 && t <= FTRK.S0 + FTRK.n / FTRK.HZ) {
      const fp = fighterPose(t, j);
      if (inSlab(fp.p.z)) GH.push({ t, kind: 'ftr', j, size: 18.3, af: .2, aff: null, rec: perGhost((W, lod) => {
        if (lod === 0) { W.seg(X.ap(fp.X, [0, 0, 8.6]), X.ap(fp.X, [0, 0, -8.8]), 1); W.seg(X.ap(fp.X, [-6.8, 0, -1.8]), X.ap(fp.X, [6.8, 0, -1.8]), .7); return; }
        // fan faces and nozzle petals keep full detail in every stamped image
        drawParts(W, FTR, fp.X, fp.st, ['intakes', 'nozzles'], {});
        drawParts(W, FTR, fp.X, fp.st, ['fuselage', 'lex', 'wings', 'tails', 'stabs', 'canopy'], lod === 1 ? MID : {});
      }) });
    }
    // the ships fire back: interceptors, their spent boosters, the launch cloud off the deck
    for (const sm of SMS) {
      const u = t - sm.S0; if (u < 0) continue;
      if (u < sm.tf) {
        smPose(sm, u, q);
        const boost = u < SM_TB, fl = boost ? 3 : u >= SM_TB + .15 ? 4 : 0;
        GH.push({ t, kind: 'sm', smi: sm.n, size: SM_LEN, af: .42, aff: pose(q.a, q.x, q.Y), rec: lod => smRec(boost, fl, lod) });
      }
      if (sm.mk) { const ub = u - SM_TB; if (ub >= 0 && ub <= sm.mk.end) { const p = mkAt(sm.mk, ub); GH.push({ t, kind: 'mk', size: 1.73, af: .32, aff: pose(p.a, p.x, p.Y), rec: mkRec }); } }
      for (let j = 0; j < sm.puffs.length; j++) if (u <= sm.puffs[j].life) GH.push({ t, kind: 'spuff', sm, j, u, size: 2, af: .5 });
    }
    // tracer dashes, the bursts and their fragments, fireball rings, debris, smoke
    for (const C of CIWS) {
      if (C.list.some(tr => t >= tr.s && t <= tr.s + tr.end)) GH.push({ t, kind: 'trc', size: 1, af: .34, aff: null, rec: perGhost(W => trcInto(W, C, t, 1)) });
    }
    for (const Kl of KILLS) {
      const ak = t - Kl.S;
      if (ak >= 0 && ak < Kl.life) GH.push({ t, kind: 'kill', size: 1, af: .3, aff: null, rec: perGhost(W => killInto(W, Kl, ak, 1)) });
    }
    for (const h of HITS) {
      const a = t - h.S; if (a < 0) continue;
      if (a < FB_LIFE) GH.push({ t, kind: 'fire', size: 1, af: .36, aff: null, hl2: true, rec: perGhost(W => fireInto(W, h, a, 1)) });
      if (h.deb.some(d => a <= d.end)) GH.push({ t, kind: 'deb', size: 1, af: .3, aff: null, rec: perGhost(W => debInto(W, h, a, 1)) });
      if (a > .25) GH.push({ t, kind: 'smoke', size: 1, af: .1, aff: null, rec: perGhost(W => smokeInto(W, h, a, 1, .3)) });
    }
  }
}
GH.sort((a, b) => a.t - b.t);
const ghCount = S => { let lo = 0, hi = GH.length; while (lo < hi) { const m = (lo + hi) >> 1; if (GH[m].t <= S + 1e-9) lo = m + 1; else hi = m; } return lo; };
const IMG_TOTAL = GH.length;
// running counts for the labels (no per-frame scans)
const cntOf = pred => { const c = new Int32Array(GH.length + 1); for (let i = 0; i < GH.length; i++) c[i + 1] = c[i] + (pred(GH[i]) ? 1 : 0); return c; };
const CNT = { bst0: cntOf(q => q.kind === 'bst' && q.i === 0), helo: cntOf(q => q.kind === 'helo'), ftr: cntOf(q => q.kind === 'ftr'), sm: cntOf(q => q.kind === 'sm' && q.smi === SM1.n) };

/* ---------- camera: macro dolly-out, then the rail ---------- */
// monotone cubic through keys (no overshoot), per field
function mono(ts, vs) {
  const n = ts.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (ts[i + 1] - ts[i - 1]) / ((2 * ts[i + 1] - ts[i] - ts[i - 1]) / d[i - 1] + (ts[i + 1] + ts[i] - 2 * ts[i - 1]) / d[i]);
  return t => {
    if (t <= ts[0]) return vs[0]; if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0; while (i < n - 2 && ts[i + 1] <= t) i++;
    const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}
const CY = 500, T_IN = 7.2, T_OUT = DUR - T_IN;
const BAT = { x: -34, Y: 3.2, k: 17 };
const CAP0 = V.add(X.ap(TELS[0].W, [TELM.TUBE[0], TELM.TUBE[1], TELM.TUBE[2] + TELM.TUBE_LEN]), [-.07, 0, 0]);
const INK = [
  // t, target xyz, yaw, pitch (deg), log10 D, log10 focal length (px)
  [0, CAP0[0], CAP0[1], CAP0[2], 97, 10, Math.log10(1.75), 3.08],
  [2.4, CAP0[0] + .8, CAP0[1] + .5, CAP0[2] - .4, 100, 16, .9, 3.3],
  [4.4, -1.5, 3.2, 3, 58, 10, 1.75, 3.75],
  [5.9, -22, 1, 22, 16, 3.5, 2.9, 4.2],
  [T_IN, BAT.x, BAT.Y / CP, 0, 0, PITCH / DEG, 5, 5 + Math.log10(BAT.k)],
];
const INF = [1, 2, 3, 4, 5, 6, 7].map(c => mono(INK.map(r => r[0]), INK.map(r => r[c])));
function introCam(t) {
  const v = INF.map(f => f(t)), D = Math.pow(10, v[5]), fl = Math.pow(10, v[6]);
  return { c: [v[0], v[1], v[2]], yaw: v[3] * DEG, pitch: v[4] * DEG, k: fl / D, w: 1 / D };
}
// rail shots in plate coords; blended by windows, then smoothed
const centroid = S => { let n = 0, x = 0; for (let i = 0; i < NR; i++) { const p = roundPose(i, S, {}); if (p && p.tau < ROUNDS[i].tauEnd) { x += p.x; n++; } } return n ? x / n : null; };
const lead = S => { let m = -1e9; for (let i = 0; i < NR; i++) { const p = roundPose(i, S, {}); if (p && p.tau < ROUNDS[i].tauEnd) m = Math.max(m, p.x); } return m > -1e9 ? m : X_END; };
// the barrage frame: both ships and the whole reach of the interceptors, easing toward the ships
const HOLD = { x: 2000, Y: -58, k: 2.3 }, HOLD2 = { x: 2064, Y: -66, k: 2.6 };
const T_PLATE = 1920 * .88 / (X_END - X_BEG + 120);
function railRaw(T) {
  const S = SW(T), shots = [], fwd = T < T_FWD_END ? 1 : 0;
  const add = (w, x, Y, k) => { if (w > 1e-4) shots.push([w, x, Y, Math.log(k)]); };
  const win = (a, b, fi, fo) => E.ss(a - fi, a + fi, T) * (1 - E.ss(b - fo, b + fo, T));
  add(win(-10, 17.8, .1, 1.4) + win(159.5, 185, 1.6, .1), BAT.x + 3 * E.ss(T_IN, 17, T) * fwd, BAT.Y, BAT.k);
  { const w = win(17.8, 21.6, 1.4, 1.2); if (w) add(w, 7.5, 6.5, 22); }
  { const w = win(21.6, 25, 1.2, 1.6); if (w) { const p = roundPose(0, S, {}); const px = p ? p.x : 8, pY = p ? p.Y : 6; add(w, E.mix(8, px, .55) + 10, E.mix(8, pY - 6, .6), E.mix(15, 6.5, E.ss(21, 25, T))); } }
  {
    // both ripples, wide; the rail leans toward launchers 3-4 while the second ripple leaves
    const w = win(25, 44.5, 1.6, 2.2) + win(151.5, 159.5, 1.8, 1.6);
    if (w) { const pu = fwd * E.ss(30, 33.5, T) * (1 - E.ss(39.5, 43.5, T)); add(w, E.mix(118 + 5 * E.sat((T - 25) / 16), 84, pu), E.mix(27, 36, pu), E.mix(4.5, 4.8, pu)); }
  }
  {
    const cw = win(44.5, 77.5, 2.2, 3) + win(143, 151.5, 1.6, 1.8);
    if (cw) {
      const c = centroid(S);
      if (c !== null) {
        const cx = c + 26, k = fwd ? E.mix(4.5, 5.4, E.ss(46.5, 51.5, T)) : E.mix(2.2, 3.4, E.ss(144, 151, T));
        add(cw, cx, seaY(cx) + 15, k);
        // the rail lingers on the helicopter, then climbs to the jets
        const hw = cw * E.ss(HS[0], HS[0] + 2.5, S) * (1 - E.ss(HS[1] - 3, HS[1], S)) * fwd;
        if (hw) { const h = flyAt(HTRK, S); add(hw * 40, h.x + 3, plY(h.y, h.z) - 2, 22); }
        const fw = cw * E.ss(FS[0], FS[0] + 2.5, S) * (1 - E.ss(FS[1] - 2.5, FS[1], S)) * fwd;
        if (fw) { const a = fighterPose(S, 0).p, b = fighterPose(S, 1).p; add(fw * 40, (a.x + b.x) / 2 + 4, (plY(a.y, a.z) + plY(b.y, b.z)) / 2 + 2.5, 13.5); }
      }
    }
  }
  {
    // run ahead of the lead rounds to the two ships, hold the whole engagement, close in for the hits
    const w = win(77.5, 121, 3, 2.5);
    if (w) {
      // the run pulls wide on the way, so the incoming strings and the waiting ships share the frame
      const L = Math.min(lead(S), X_END), runX = E.ss(75.5, 80.5, T), runK = E.ss(75.5, 81.5, T), dip = .8 * Math.sin(Math.PI * runK);
      const d = E.ss(83, 104, T), hx = E.mix(HOLD.x, HOLD2.x, d), hY = E.mix(HOLD.Y, HOLD2.Y, d), hk = Math.exp(E.mix(Math.log(HOLD.k), Math.log(HOLD2.k), d));
      add(w, E.mix(L - 120, hx, runX), E.mix(seaY(L - 120) + 18, hY, runX) + 30 * dip, Math.exp(E.mix(Math.log(5.4), Math.log(hk), runK) - dip));
    }
  }
  add(win(121, 136.5, 2.5, 2.4), (X_BEG + X_END) / 2 - 10, -40, T_PLATE * (1 + .045 * E.ss(123, 136, T)));
  add(win(136.5, 143.2, 2.4, 1.6), HOLD2.x, HOLD2.Y, HOLD2.k);
  if (!shots.length) return { x: BAT.x, Y: BAT.Y, lk: Math.log(BAT.k) };
  let ws = 0, x = 0, Y = 0, lk = 0;
  for (const s of shots) { ws += s[0]; x += s[0] * s[1]; Y += s[0] * s[2]; lk += s[0] * s[3]; }
  return { x: x / ws, Y: Y / ws, lk: lk / ws };
}
const RHZ = 60, RN = Math.round((T_OUT - T_IN) * RHZ);
const RX = new Float64Array(RN + 1), RY = new Float64Array(RN + 1), RK = new Float64Array(RN + 1);
{
  const rx = new Float64Array(RN + 1), ry = new Float64Array(RN + 1), rk = new Float64Array(RN + 1);
  for (let i = 0; i <= RN; i++) { const r = railRaw(T_IN + i / RHZ); rx[i] = r.x; ry[i] = r.Y; rk[i] = r.lk; }
  const sig = .55 * RHZ, H = Math.ceil(sig * 3), ker = [];
  for (let j = -H; j <= H; j++) ker.push(Math.exp(-j * j / (2 * sig * sig)));
  for (let i = 0; i <= RN; i++) {
    let s = 0, a = 0, b = 0, c = 0;
    for (let j = -H; j <= H; j++) { const q = E.clamp(i + j, 0, RN), w = ker[j + H]; s += w; a += w * rx[q]; b += w * ry[q]; c += w * rk[q]; }
    RX[i] = a / s; RY[i] = b / s; RK[i] = c / s;
  }
}
function camAt(T) {
  if (T < T_IN) return Object.assign(introCam(T), { ortho: false });
  if (T > T_OUT) return Object.assign(introCam(DUR - T), { ortho: false });
  const f = (T - T_IN) * RHZ, i = Math.min(RN - 1, f | 0), u = f - i;
  const x = RX[i] + (RX[i + 1] - RX[i]) * u, Y = RY[i] + (RY[i + 1] - RY[i]) * u, k = Math.exp(RK[i] + (RK[i + 1] - RK[i]) * u);
  return { c: [x, Y / CP, 0], yaw: 0, pitch: PITCH, k, w: 0, ortho: true, x, Y };
}

/* ---------- scene helpers ---------- */
function swell(x, z, S) { return .55 * Math.sin(x * .05 + S * .9 + z * .013) + .3 * Math.sin(x * .11 - S * 1.3 + z * .031 + 1.7); }
function drawSea(S, view, fa, ortho) {
  const x0 = Math.max(CLIFF + 8, view.x0 - 10), x1 = Math.min(X_END + 600, view.x1 + 10);
  if (x1 <= x0) return;
  const step = Math.max(1.5, 7 / LC.k);
  if (ortho) {
    const k = PS.k;
    for (let j = 0; j < 15; j++) {
      const z = -10 + j * j * 4.8, bk = bucketOf((j === 0 ? .5 : .24 * (1 - j / 16)) * fa); if (bk < 1) continue;
      const zs = z * SP;
      let px = PS.ox + k * x0, py = PS.oy - k * ((seaY(x0) + swell(x0, z, S)) * CP + zs);
      for (let x = x0 + step; x <= x1 + step * .5; x += step) {
        const qx = PS.ox + k * x, qy = PS.oy - k * ((seaY(x) + swell(x, z, S)) * CP + zs);
        if (!((py < -40 && qy < -40) || (py > 1120 && qy > 1120))) OUT.push(0, bk, px, py, qx, qy);
        px = qx; py = qy;
      }
    }
    return;
  }
  for (let j = 0; j < 15; j++) {
    const z = -10 + j * j * 4.8, al = (j === 0 ? .5 : .24 * (1 - j / 16)) * fa;
    let px = x0, pa = [px, seaY(px) + swell(px, z, S), z];
    for (let x = x0 + step; x <= x1 + step * .5; x += step) { const q = [x, seaY(x) + swell(x, z, S), z]; W.seg(pa, q, al); pa = q; }
  }
}
function drawGround(S, persp, fa) {
  for (const [z, a] of [[-8, .7], [30, .28], [90, .22], [200, .16], [420, .1]]) {
    W.poly([[-900, 0, z], [CLIFF - 4, 0, z], [CLIFF, -3, z], [CLIFF + 4, -14, z], [CLIFF + 9, SEA, z]], a * fa, false);
  }
  for (let x = -600; x < CLIFF - 8; x += 20) W.seg([x, 0, -8], [x, -3, -8], .25 * fa);
  if (persp > .01) for (let x = -96; x <= 36; x += 6) for (let z = -40; z <= 96; z += 6) {
    const a = .2 * persp * fa; W.seg([x - .35, .01, z], [x + .35, .01, z], a); W.seg([x, .01, z - .35], [x, .01, z + .35], a);
  }
}
/* rulers: true km along the curve of the sea; vehicles to scale at the battery */
const KM_TICKS = [];
for (let m = 0; m <= 1000; m += 100) KM_TICKS.push({ r: m, big: m === 0 || m === 500 || m === 1000, lab: m === 500 ? '0.5' : m === 1000 ? '1' : m === 0 ? '0' : '' });
for (let km = 2; km <= 60; km++) { const r = km * 1000; if (g(r) > X_END) break; KM_TICKS.push({ r, big: km % 5 === 0, lab: km % 10 === 0 || km === 5 ? String(km) : '' }); }
KM_TICKS.forEach(t => { t.x = g(t.r); });
const rulerY = x => seaY(x) - 11;
const XA = -84;                        // the 0-20 m vehicle scale bar, left of the battery
function drawRulers(a) {
  if (a <= .01) return;
  const x0 = Math.max(0, PS.x0 - 5), x1 = Math.min(X_END, PS.x1 + 5);
  if (x1 > x0) { const st = Math.max(1, 6 / LC.k); let pa = [x0, rulerY(x0), -8]; for (let x = x0 + st; x <= x1 + st * .5; x += st) { const q = [Math.min(x, x1), rulerY(Math.min(x, x1)), -8]; W.seg(pa, q, .5 * a); pa = q; } }
  for (const t of KM_TICKS) {
    if (t.x < PS.x0 - 5 || t.x > PS.x1 + 5) continue;
    const sp = t.r <= 1000 ? (t.big ? 1 : .55) : (t.big ? 1 : .5), len = (t.big ? 3.6 : 1.8) / Math.max(.4, Math.min(1, LC.k / 6)) * (t.r <= 1000 && t.r > 0 && !t.big ? .6 : 1);
    W.seg([t.x, rulerY(t.x), -8], [t.x, rulerY(t.x) - len, -8], .55 * a * sp);
  }
  W.seg([XA, 0, -8], [XA, 20, -8], .45 * a);
  for (let h = 0; h <= 20; h += 1) W.seg([XA, h, -8], [XA - (h % 5 ? .6 : 1.4), h, -8], .45 * a);
}
function drawBorder(a) {
  if (a <= .01) return;
  const y0 = seaY(X_END) - 48, y1 = 150;
  W.poly([[X_BEG, y0, -8], [X_END, y0, -8], [X_END, y1, -8], [X_BEG, y1, -8]], .38 * a, true);
  const c = 9 / Math.max(.3, LC.k) * .6;
  for (const [x, y] of [[X_BEG, y0], [X_END, y0], [X_END, y1], [X_BEG, y1]]) { W.seg([x - c, y, -8], [x + c, y, -8], .7 * a); W.seg([x, y - c, -8], [x, y + c, -8], .7 * a); }
}

/* ---------- labels ---------- */
const ui = document.getElementById('ui');
const mkCall = html => { const d = document.createElement('div'); d.className = 'call'; d.innerHTML = html; ui.appendChild(d); return d; };
const R1 = ROUNDS[0], K1 = KILLS[0], C1 = CIWS[0];
const L = {
  tel: mkCall(ORB.cat('K340P · TEL 1', { code: 'K340P', sq: 'y' }) + '<span class="s2"></span>'),
  rnd: mkCall(ORB.cat('3M55 · round 1', { code: '3M55' }) + '<span class="s2"></span>'),
  sep: mkCall(ORB.cat('Booster separation', { code: 'SEP' }) + '<span class="s2"></span>'),
  helo: mkCall(ORB.cat('MH-60R', { code: 'MH-60R' }) + '<span class="s2"></span>'),
  ftr: mkCall(ORB.cat('F/A-18E ×2', { code: 'F/A-18E' }) + '<span class="s2"></span>'),
  p1: mkCall(`<span class="cat"><i class="sq y"></i>${ORB.hl('TEL 1 · first ejection', 'ej1')}${ORB.bars('EJ1', { h: 9, n: 10 })}</span><span class="s2">exposures at T+0.20 s and T+0.55 s</span>`),
  p2: mkCall(ORB.cat('Erection ×4', { code: 'ER' }) + '<span class="s2">launchers + rams</span>'),
  p4: mkCall(ORB.cat('Plate edge', { code: 'EDGE' }) + '<span class="s2"></span>'),
  sm: mkCall(ORB.cat(`SM-6 · ${SHIPS[SM1.s].id}`, { code: 'SM-6' }) + '<span class="s2"></span>'),
  stop: mkCall(ORB.cat('Round 1 · stopped', { code: 'STOP' }) + `<span class="s2">T+${(K1.S - R1.L).toFixed(2)} s · ${(ginv(K1.x) / 1000).toFixed(1)} km</span>`),
  ciws: mkCall(ORB.cat(`Phalanx · ${SHIPS[C1.s].id}`, { code: 'CIWS' }) + '<span class="s2"></span>'),
  sh0: mkCall(ORB.cat(`${SHIPS[0].id} · DDG-51`, { code: 'DDG-51' }) + '<span class="s2"></span>'),
  sh1: mkCall(ORB.cat(`${SHIPS[1].id} · DDG-51`, { code: 'DDG-51a' }) + '<span class="s2"></span>'),
  hit: mkCall(`<span class="cat"><i class="sq y"></i>${ORB.hl('Three hits · two ships', 'hit')}${ORB.bars('HIT', { h: 9, n: 10 })}</span><span class="s2">${KILLS.length} of ${NR} stopped short · ${SHIPS[0].km}–${SHIPS[1].km} km</span>`),
};
Object.values(L).forEach(el => { el._txt = ''; el._s2 = el.querySelector('.s2'); el._c = el.querySelector('.cat > span'); });
const setS2 = (el, t) => { if (el._txt !== t) { el._txt = t; el._s2.innerHTML = t; } };
const setCat = (el, t) => { if (el._c && el._c.textContent !== t) el._c.textContent = t; };
const leaders = [], brackets = [];
function place(el, anchor, dx, dy, a) {
  if (!anchor || a <= .01) { if (el._o !== 0) { el.style.opacity = 0; el._o = 0; } return; }
  const [ax, ay] = anchor, ex = ax + dx, ey = ay + dy, right = dx >= 0, hx = ex + (right ? 18 : -18);
  leaders.push([ax, ay, ex, ey, hx, a]);
  const w = el.offsetWidth; el.style.opacity = a.toFixed(3); el._o = a;
  el.style.transform = `translate(${(right ? hx + 8 : hx - 8 - w).toFixed(1)}px, ${(ey - 6).toFixed(1)}px)`;
}
// corner brackets around a model's projected part bounds
const BOUNDS = new Map();
function modelBox(model, Xw, st, names) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const part of model.parts) {
    if (names && names.indexOf(part.name) < 0) continue;
    let bb = BOUNDS.get(part); if (!bb) { bb = GEO.bounds(part); BOUNDS.set(part, bb); }
    const T = GEO.partXf(Xw, part, st), [mn, mx] = bb;
    for (let c = 0; c < 8; c++) { const p = LC.project(X.ap(T, [c & 1 ? mx[0] : mn[0], c & 2 ? mx[1] : mn[1], c & 4 ? mx[2] : mn[2]])); if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  }
  return x1 > x0 ? [x0, y0, x1, y1] : null;
}

/* ---------- readout + captions ---------- */
const clkT = document.getElementById('clkT'), clkL = document.getElementById('clkL'), figEl = document.getElementById('fig');
let clkTT = '', clkLT = '', figT = '';
const NOTE = '<span class="n2">range axis compressed beyond the bluff, ticks in true km · vehicles to scale · paths schematic</span>';
const CAPS = [
  [0, 'Fig. 4.1', 'End cap, TLC 1R · four launchers erecting'],
  [15, 'Fig. 4.2', 'Two ripples · eight rounds'],
  [45, 'Fig. 4.3', 'Over the sea · every 0.35 s'],
  [77, 'Fig. 4.4', 'The far edge · two ships fire back'],
  [T_FWD_END, 'Fig. 4', ''],
  [T_REW, 'Fig. 4', 'Rewind'],
  [163, 'Fig. 4.1', 'End cap, TLC 1R · four launchers erecting'],
];
const LAUNCH0 = ROUNDS[0].L, T1st = tOfS(LAUNCH0);
const fmtClock = s => { const a = Math.abs(s); return `T${s < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${(a % 60).toFixed(2).padStart(5, '0')}`; };

/* ---------- render ---------- */
let OV = null, OVK = 0;
function overlay() {
  if (OV && OVK === K) return OV;
  OV = document.createElement('canvas'); OV.width = 1920 * K; OV.height = 1080 * K; OVK = K;
  const o = OV.getContext('2d'); o.setTransform(K, 0, 0, K, 0, 0);
  let gt = o.createLinearGradient(0, 0, 0, 250); gt.addColorStop(0, 'rgba(0,0,0,.86)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gt; o.fillRect(0, 0, 1920, 250);
  gt = o.createRadialGradient(330, 110, 40, 330, 110, 700); gt.addColorStop(0, 'rgba(0,0,0,.88)'); gt.addColorStop(.45, 'rgba(0,0,0,.6)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gt; o.fillRect(0, 0, 1100, 560);
  gt = o.createLinearGradient(0, 1080, 0, 770); gt.addColorStop(0, 'rgba(0,0,0,.94)'); gt.addColorStop(.5, 'rgba(0,0,0,.62)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gt; o.fillRect(0, 770, 1920, 310);
  return OV;
}
const P1 = {}, P2 = {};
function render(T) {
  const S = SW(T), rate = SW.rate(T), cam = camAt(T);
  segCount = 0;
  LC.shake = [0, 0];
  // ignition shake, deterministic, only in the close shots
  let shk = 0;
  for (const rd of ROUNDS) { const u = S - rd.L - TIG; if (u > 0 && u < 1.2) shk = Math.max(shk, (1 - u / 1.2) * 2.2 * E.sat(cam.k / 12)); }
  if (shk > .05) LC.shake = FILM.shake(T, shk, 22);
  LC.set(cam.c, cam.yaw, cam.pitch, cam.k, cam.w);
  const ortho = cam.ortho;
  if (!ortho) {
    const D = 1 / cam.w, open = E.ss(18, 90, D);
    LC.near = Math.max(.05, (D * .5 - .1) * (1 - open)) / D;
    W.fog = [(D * 1.3 + .4) * (1 + 1e4 * open) / D, (D * 3.2 + 4) * (1 + 1e4 * open) / D];
  } else W.fog = [1e9, 2e9];
  PS.k = cam.k; PS.ox = LC.cx + LC.shake[0] - cam.k * cam.c[0]; PS.oy = LC.cy + LC.shake[1] + cam.k * plY(cam.c[1], cam.c[2]);
  PS.x0 = (0 - PS.ox) / cam.k; PS.x1 = (1920 - PS.ox) / cam.k; PS.y1 = (PS.oy - 0) / cam.k; PS.y0 = (PS.oy - 1080) / cam.k;
  const persp = ortho ? 0 : E.sat(cam.w * 3), focusA = ortho ? 1 : E.ss(2.6, 16, 1 / cam.w);

  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
  W.reset(); OUT.reset(); W.style('#F6F5F2', 1);

  const plateA = E.ss(T_FWD_END - 7, T_FWD_END + 2, T) * (1 - E.ss(T_REW - 5.5, T_REW - 2, T));
  if (focusA > .005) { W.style('#F6F5F2', 1); drawSea(S, { x0: ortho ? PS.x0 : -300, x1: ortho ? PS.x1 : 400 }, focusA, ortho); drawGround(S, persp, focusA); }
  // the ruler never runs under the menu row
  const rcx = (PS.x0 + PS.x1) / 2, rsy = PS.oy - PS.k * rulerY(Math.max(0, rcx)), rulA = 1 - E.ss(770, 830, rsy);
  drawRulers(ortho ? E.ss(9, 13, T) * (1 - E.ss(159, 162, T)) * rulA : 0);
  drawBorder(plateA);
  const hzA = ortho ? E.ss(76, 83, T) * (1 - E.ss(T_REW + 1, T_REW + 5, T)) : 0;
  if (hzA > .01) {
    const st = 16 / PS.k, x0 = Math.max(CLIFF + 12, PS.x0), x1 = Math.min(X_END, PS.x1);
    for (let x = x0 - ((x0 - CLIFF) % st); x < x1; x += st) W.seg([x, SEA, -8], [Math.min(x + st * .5, x1), SEA, -8], .42 * hzA);
    const xe = X_END + 34 / PS.k, ye = seaY(X_END), tk = 5 / PS.k;
    W.seg([xe, SEA, -8], [xe, ye, -8], .6 * hzA);
    W.seg([xe - tk, SEA, -8], [xe + tk, SEA, -8], .6 * hzA); W.seg([xe - tk, ye, -8], [xe + tk, ye, -8], .6 * hzA);
  }

  /* ghosts */
  const nG = ghCount(S), hlEnd = 1 - E.ss(T_REW, T_REW + 2, T);
  const hlA = E.ss(T_FWD_END + 2.5, T_FWD_END + 5, T) * hlEnd, hlB = E.ss(T_FWD_END + 6.5, T_FWD_END + 9, T) * hlEnd;
  let nDrawn = 0;
  if (ortho) for (let gi = 0; gi < nG; gi++) {
    const gh = GH[gi], age = S - gh.t, ga = .88 * (gh.af + (1 - gh.af) * Math.exp(-age / 1.1));
    if (gh.kind === 'puff') {
      const rd = ROUNDS[gh.i], pf = rd.puffs[gh.j], a = gh.tau, p = puffAt(rd, pf, a), r = pf.r0 + pf.gr * Math.sqrt(a);
      circle(p[0], plY(p[1], p[2]), r, ga * .55 * Math.pow(1 - a / pf.life, 1.2)); nDrawn++; continue;
    }
    if (gh.kind === 'spuff') {
      const pf = gh.sm.puffs[gh.j], a = gh.u, p = smPuffAt(gh.sm, pf, a), r = pf.r0 + pf.gr * Math.sqrt(a);
      circle(p[0], p[1], r, ga * .5 * Math.pow(1 - a / pf.life, 1.2)); nDrawn++; continue;
    }
    const px = gh.size * PS.k, f = gh.aff || ID, th = TH[gh.kind];
    const hA = gh.hl ? hlA : gh.hl2 ? hlB : 0;
    if (hA > 0) { drawLod(gh.rec, f, Math.min(1, ga * 2.2) * hA, px, 2, th); if (hA < 1) drawLod(gh.rec, f, ga * (1 - hA), px, -1, th); }
    else drawLod(gh.rec, f, ga, px, -1, th);
    nDrawn++;
  }

  /* the battery, live */
  TELS.forEach((tl, i) => {
    const el = elevAt(i, S), dep = depAt(i, S);
    let capR = 0, capL = 0;
    for (const r of ROUNDS) if (r.tel === i && S >= r.L) { if (r.side > 0) capR = 1; else capL = 1; }
    if (ortho) {
      const px = 13.5 * PS.k, lod = lodOf(px);
      drawLod(l => staticRec(i, l), ID, .9, px);
      drawLod(l => launcherRec(i, capL, capR, l), rot(-el, tl.pivP[0], tl.pivP[1]), .95, px);
      if (lod > 0) drawParts(W, TELM, tl.W, { elev: el, dep }, ['ram', 'jacks'], lod === 1 ? Object.assign({ a: .9 }, MID) : { a: .9 });
    } else {
      const st = { elev: el, dep, capL, capR, fan: T * 14 };
      if (i === 0) drawParts(W, TELM, tl.W, st, ['launcher', 'capL', 'capR'], { a: .95 });
      if (focusA > .005) drawParts(W, TELM, tl.W, st, i === 0 ? ['chassis', 'wheels', 'cab', 'ram', 'jacks', 'fans'] : null, { a: .95 * focusA });
    }
  });

  /* rounds, caps, boosters, covers, smoke */
  ROUNDS.forEach((rd, i) => {
    const tau = S - rd.L;
    if (tau < 0) return;
    // smoke rings along the boost path
    for (const rg of rd.rings) {
      const age = tau - rg.tau; if (age < 0 || age > rg.life) continue;
      const r = rg.r0 + rg.gr * Math.sqrt(age), a = .3 * Math.pow(1 - age / rg.life, 1.3) * E.ss(0, .1, age);
      if (ortho) { const n = Math.max(6, Math.min(14, Math.round(r * PS.k * .6))); ellipseP(rg.x + .9 * age, rg.Yc + .45 * CP * age, rg.ax, rg.ay, rg.bx, rg.by, r, n, a); }
      else W.ring([rg.x + .9 * age, rg.y + .45 * age, rg.z], rg.U, rg.Vv, r, 14, a);
    }
    if (tau <= rd.puffs[0].life + 2) for (const pf of rd.puffs) if (tau <= pf.life) { const p = puffAt(rd, pf, tau); W.disc(p, pf.r0 + pf.gr * Math.sqrt(tau), 18, .5 * Math.pow(1 - tau / pf.life, 1.2)); }
    { const Xc = capX(i, tau); for (const pr of rd.capPrims) if (!(pr.fine && ortho && PS.k < 20)) GEO.drawPrim(W, pr, Xc, GDEF); }
    const ub = tau - TSEP;
    if (ub >= 0 && ub <= rd.bstEnd) { const p = bstAt(rd, ub); drawLod(bstRec, pose(p.a, p.x, plY(p.y, rd.z)), 1, 2.9 * PS.k); }
    const uc = tau - 5.65;
    if (uc >= 0 && uc <= rd.covEnd) { const p = covAt(rd, uc); drawLod(covRec, pose(p.a, p.x, plY(p.y, rd.z)), 1, .9 * PS.k); }
    if (tau < rd.tauEnd) {
      roundPose(i, S, P1);
      const st = misState(tau), fl = flameOf(tau);
      if (ortho) drawLod(l => misRec(st, fl, l), pose(P1.a, P1.x, P1.Y), 1, 8.9 * PS.k, TH_MIS);
    }
  });

  /* the destroyers, the interceptors and the beat at the plate edge, live */
  const blooms = [];
  if (ortho) {
    SHIPS.forEach((sh, si) => drawLod(l => shipRec(si, l), ID, .95, 155 * PS.k, -1, TH_SHIP));
    for (const sm of SMS) {
      const u = S - sm.S0; if (u < 0) continue;
      // smoke rings: they linger long after the interceptor has gone
      for (const rg of sm.rings) {
        const age = u - rg.u; if (age < 0) break; if (age > rg.life) continue;
        const r = rg.r0 + rg.gr * Math.sqrt(age), cx = rg.x - 1.3 * age;
        if (cx + r < PS.x0 || cx - r > PS.x1) continue;
        const a = .3 * rg.al * Math.pow(1 - age / rg.life, 1.5) * E.ss(0, .12, age); if (a < .012) continue;
        const n = Math.max(6, Math.min(14, Math.round(r * PS.k * .6)));
        ellipseP(cx, rg.Yc + .4 * CP * age, rg.ax, rg.ay, rg.bx, rg.by, r, n, a);
      }
      if (u <= 5) for (const pf of sm.puffs) if (u <= pf.life) { const p = smPuffAt(sm, pf, u); circle(p[0], p[1], pf.r0 + pf.gr * Math.sqrt(u), .5 * Math.pow(1 - u / pf.life, 1.2)); }
      if (u < sm.tf) {
        smPose(sm, u, P1);
        const boost = u < SM_TB, fl = boost ? 3 : u >= SM_TB + .15 ? 4 : 0;
        drawLod(l => smRec(boost, fl, l), pose(P1.a, P1.x, P1.Y), 1, SM_LEN * PS.k, -1, TH_SM);
        if (boost) {
          // live exhaust flicker and a restrained bloom off the deck
          const ca = Math.cos(P1.a), sa = Math.sin(P1.a), nz = [P1.x - ca * 3.4, P1.Y - sa * 3.4], Lf = 7 + 3 * hash(Math.floor(T * 30), sm.n + 11) + 6 * Math.exp(-u / .4);
          W.style('#FFFFFF', 1.3);
          for (let k = 0; k < 6; k++) { const off = (k / 5 - .5) * .5, fk = .75 + .25 * hash(k + sm.n * 7, Math.floor(T * 40)); W.seg(Pp(nz[0] - sa * off, nz[1] + ca * off), Pp(nz[0] - ca * Lf * fk, nz[1] - sa * Lf * fk), .8); }
          W.style('#F6F5F2', 1);
          blooms.push([Pp(nz[0], nz[1]), .16 + .5 * Math.exp(-u / .35)]);
        }
      }
      if (sm.mk) { const ub = u - SM_TB; if (ub >= 0 && ub <= sm.mk.end) { const p = mkAt(sm.mk, ub); drawLod(mkRec, pose(p.a, p.x, p.Y), 1, 1.73 * PS.k, -1, TH.mk); } else if (ub > sm.mk.end) { W.style('#FFFFFF', 1.3); splashInto(W, sm.mk.sx, sm.mk.sY, ub - sm.mk.end, 3.2, .8); W.style('#F6F5F2', 1); } }
    }
    for (const C of CIWS) if (S >= C.s0 && S <= C.s1 + 2) trcInto(W, C, S, 1);
    for (const Kl of KILLS) {
      const ak = S - Kl.S;
      if (ak >= 0 && ak < Kl.life) { killInto(W, Kl, ak, 1); if (ak < .8) blooms.push([Pp(Kl.x, Kl.Y), (Kl.sm ? .62 : .5) * Math.exp(-ak / (Kl.sm ? .28 : .22))]); }
    }
    for (const h of HITS) {
      const a = S - h.S; if (a < 0) continue;
      fireInto(W, h, a, 1); debInto(W, h, a, 1); smokeInto(W, h, a, .75, 1); flamesInto(W, h, S, a);
      if (a < 1.2) blooms.push([Pp(h.x, h.Y), .6 * Math.exp(-a / .3)]);
    }
  }

  /* helicopter and jets, live */
  if (ortho) {
    if (S > HTRK.S0 && S < HTRK.S0 + HTRK.n / HTRK.HZ) { const hp = heloPose(S); if (hp.p.x > PS.x0 - 20 && hp.p.x < PS.x1 + 20) drawParts(W, HELO, hp.X, hp.st, null, PS.k < 6 ? MID : {}); }
    for (let j = 0; j < 2; j++) if (S > FTRK.S0 && S < FTRK.S0 + FTRK.n / FTRK.HZ) { const fp = fighterPose(S, j); if (fp.p.x > PS.x0 - 20 && fp.p.x < PS.x1 + 20) drawParts(W, FTR, fp.X, fp.st, null, PS.k < 6 ? MID : {}); }
  }

  /* exhaust: live flames drawn with a flicker, ignition bloom */
  ROUNDS.forEach((rd, i) => {
    const tau = S - rd.L; if (tau < TIG || tau >= rd.tauEnd || !ortho) return;
    roundPose(i, S, P2);
    const ca = Math.cos(P2.a), sa = Math.sin(P2.a);
    if (tau < TSEP) {
      const nz = [P2.x - ca * 4.85, P2.y - sa * 4.85, rd.z], L = 6 + 2.4 * hash(Math.floor(T * 30), i) + 5 * Math.exp(-(tau - TIG) / .5);
      W.style('#FFFFFF', 1.3);
      for (let k = 0; k < 7; k++) { const off = (k / 6 - .5) * .42; W.seg([nz[0] - sa * off, nz[1] + ca * off, nz[2]], [nz[0] - ca * L * (.75 + .25 * hash(k, Math.floor(T * 40))), nz[1] - sa * L * (.75 + .25 * hash(k + 9, Math.floor(T * 40))), nz[2]], .8); }
      W.style('#F6F5F2', 1);
      blooms.push([nz, .18 + .55 * Math.exp(-(tau - TIG) / .35)]);
    }
  });

  if (ortho) OUT.flush(ctx);
  W.flush(ctx);
  // restrained bloom at ignitions and bursts
  ctx.globalCompositeOperation = 'lighter';
  for (const [p, a] of blooms) {
    const s = LC.project(p); if (!s) continue;
    const rad = Math.min(260, 18 + 5 * LC.k) * (1 + a);
    const gr = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], rad);
    gr.addColorStop(0, `rgba(255,255,255,${(a * .5).toFixed(3)})`); gr.addColorStop(.3, `rgba(255,250,235,${(a * .14).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = gr; ctx.fillRect(s[0] - rad, s[1] - rad, rad * 2, rad * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // calm the title + menu zones (static overlay, baked once)
  ctx.drawImage(overlay(), 0, 0, 1920, 1080);

  // ruler numerals
  if (ortho) {
    const ra = E.ss(9, 13, T) * (1 - E.ss(159, 162, T)) * rulA;
    ctx.font = '400 11px "DM Mono", monospace'; ctx.fillStyle = '#F6F5F2'; ctx.textAlign = 'center';
    let lastX = -1e9;
    for (const t of KM_TICKS) {
      if (!t.lab) continue;
      const p = LC.project([t.x, rulerY(t.x) - 5.5 / Math.max(.4, Math.min(1, LC.k / 6)), -8]); if (!p || p[0] - lastX < 46) continue;
      lastX = p[0]; ctx.globalAlpha = .55 * ra; ctx.fillText(t.lab + (t.r === 1000 || t.r % 10000 === 0 && t.r >= 10000 ? ' km' : ''), p[0], p[1] + 10);
    }
    const pb = LC.project([XA, 20, -8]); if (pb) { ctx.globalAlpha = .45 * ra; ctx.textAlign = 'right'; ctx.fillText('20 m', pb[0] - 8, pb[1] + 4); }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  /* labels */
  leaders.length = 0; brackets.length = 0;
  const fwd = T < T_FWD_END;
  {
    const el = elevAt(0, S), a = ortho ? E.ss(8, 9.5, T) * (1 - E.ss(T1st - 1.5, T1st - .4, T)) : 0;
    setS2(L.tel, S < TELS[0].J ? 'stowed' : S < TELS[0].E ? 'jacks down' : el < E_MAX - .01 ? `erecting · ${Math.round(el / DEG)}°` : `vertical · ${Math.round(E_MAX / DEG)}°`);
    place(L.tel, a ? LC.project(X.ap(TELS[0].W, [0, 3.4, 3])) : null, 60, 150, a);
  }
  {
    const tau = S - R1.L, a = ortho && tau > .25 && fwd ? E.sat((tau - .25) * 3) * (1 - E.ss(TSEP - .6, TSEP, tau)) : 0;
    if (a) { roundPose(0, S, P1); setS2(L.rnd, `T+${tau.toFixed(2)} s · ${tau < TEX ? 'gas ejection' : tau < TIG ? 'coast' : 'boost'}`); }
    place(L.rnd, a ? LC.project([P1.x, P1.y, R1.z]) : null, 70, 60, a);
  }
  {
    const ub = S - R1.L - TSEP, a = ortho && fwd ? E.sat(ub * 3) * (1 - E.ss(3, 4, ub)) : 0;
    const p = a ? bstAt(R1, Math.min(ub, R1.bstEnd)) : null;
    if (a) { const n = CNT.bst0[nG]; setS2(L.sep, n ? `spent casing · ${n} exposure${n === 1 ? '' : 's'}` : 'spent casing'); }
    place(L.sep, p ? LC.project([p.x, p.y, R1.z]) : null, -200, -120, a);
  }
  if (ortho && fwd) {
    const hin = S > HTRK.S0 + 1 && S < HTRK.S0 + HTRK.n / HTRK.HZ - 1 ? heloPose(S) : null;
    let a = hin ? E.ss(HS[0] + 1.5, HS[0] + 3, S) * (1 - E.ss(HS[1] - 3.5, HS[1] - 2, S)) : 0;
    if (a) {
      const n = CNT.helo[nG];
      setS2(L.helo, `${n} exposure${n === 1 ? '' : 's'} · rotor stamped`);
      const bx = modelBox(HELO, hin.X, hin.st, ['fuselage', 'rotor', 'tail']);
      if (bx) { brackets.push([bx, a]); place(L.helo, [bx[2], bx[1]], 60, -50, a); } else place(L.helo, null, 0, 0, 0);
    } else place(L.helo, null, 0, 0, 0);
    a = S > FS[0] + 1 && S < FS[1] ? E.ss(FS[0] + 1.6, FS[0] + 3, S) * (1 - E.ss(FS[1] - 3, FS[1] - 1.5, S)) : 0;
    if (a) {
      const f0 = fighterPose(S, 0), f1 = fighterPose(S, 1);
      const b0 = modelBox(FTR, f0.X, f0.st), b1 = modelBox(FTR, f1.X, f1.st);
      if (b0) brackets.push([b0, a]); if (b1) brackets.push([b1, a]);
      const ni = CNT.ftr[nG];
      setS2(L.ftr, `turning in · F414 fan faces, nozzles · ${ni} image${ni === 1 ? '' : 's'}`);
      place(L.ftr, b0 ? [b0[0], b0[3]] : null, -70, 70, a);
    } else place(L.ftr, null, 0, 0, 0);
  } else { place(L.helo, null, 0, 0, 0); place(L.ftr, null, 0, 0, 0); }
  {
    // the far edge: the first interceptor off its deck, the first burst, the first gun, the ships
    const u = S - SM1.S0, as = ortho && fwd && u > .25 ? E.sat((u - .25) * 2.5) * (1 - E.ss(4.2, 5.4, u)) : 0;
    if (as) { smPose(SM1, u, P2); const n = CNT.sm[nG]; setS2(L.sm, `off the deck · ${n} exposure${n === 1 ? '' : 's'}`); }
    place(L.sm, as ? LC.project(Pp(P2.x, P2.Y)) : null, 90, -40, as);
    const uk = S - K1.S, ak = ortho && fwd && uk >= 0 ? E.sat(uk * 4) * (1 - E.ss(3.6, 4.6, uk)) : 0;
    place(L.stop, ak ? LC.project(Pp(K1.x, K1.Y)) : null, 60, 130, ak);
    const uc = S - C1.s0, ac = ortho && fwd && uc >= 0 ? E.sat(uc * 4) * (1 - E.ss(2.6, 3.4, uc)) : 0;
    if (ac) setS2(L.ciws, 'M61 · 4,500 rounds a minute');
    place(L.ciws, ac ? LC.project(Pp(C1.mz[0], C1.mz[1])) : null, 70, -150, ac);
    SHIPS.forEach((sh, si) => {
      const el = si ? L.sh1 : L.sh0;
      let nh = 0, last = null; for (const h of HITS) if (h.s === si && S >= h.S) { nh++; last = h; }
      const a = ortho && fwd ? E.ss(80, 82.5, T) * (1 - E.ss(117, 119.5, T)) : 0;
      if (a) {
        setCat(el, nh ? `${sh.id} · ${nh} hit${nh > 1 ? 's' : ''}` : `${sh.id} · DDG-51`);
        setS2(el, nh ? `T+${(last.S - LAUNCH0).toFixed(2)} s · ${sh.km} km` : `${sh.km} km`);
      }
      place(el, a ? LC.project(Pp(sh.stern[0], sh.stern[1])) : null, -40, si ? 42 : 66, a);
    });
  }
  {
    const a = ortho ? E.ss(T_FWD_END + 3.5, T_FWD_END + 5.5, T) * (1 - E.ss(T_REW - 1, T_REW + 1, T)) : 0;
    const g0 = GH.find(q => q.hl);
    const pA = a && g0 ? LC.project([g0.aff[4], g0.aff[5] / CP, 0]) : null;
    place(L.p1, pA, 70, -150, a);
    if (pA) { ctx.strokeStyle = '#F4D23C'; ctx.lineWidth = 1.4; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(pA[0], pA[1], 15, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    const a2 = ortho ? E.ss(T_FWD_END + 4.5, T_FWD_END + 6.5, T) * (1 - E.ss(T_REW - 5, T_REW - 3, T)) : 0;
    place(L.p2, a2 ? LC.project([-36, 10, 36]) : null, 40, 110, a2);
    setS2(L.p4, `${(ginv(X_END) / 1000).toFixed(0)} km · the sea curves ${Math.round(drop(X_END))} m below level`);
    place(L.p4, a2 ? LC.project([X_END, seaY(X_END) + 15, 0]) : null, -60, -185, a2);
    // the hits, in the highlighter: their fireball rings are drawn yellow above
    const a3 = ortho ? hlB : 0;
    if (a3 > .01) {
      ctx.strokeStyle = '#F4D23C'; ctx.lineWidth = 1.4; ctx.globalAlpha = a3;
      let anchor = null;
      SHIPS.forEach((sh, si) => {
        const hs = HITS.filter(h => h.s === si); if (!hs.length) return;
        const x0 = Math.min(...hs.map(h => h.x)), x1 = Math.max(...hs.map(h => h.x)), Y = hs.reduce((s, h) => s + h.Y, 0) / hs.length + 3;
        const p = LC.project(Pp((x0 + x1) / 2, Y)); if (!p) return;
        const rr = Math.max(15, (x1 - x0) / 2 * PS.k + 14 * PS.k);
        ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, TAU); ctx.stroke();
        if (!anchor || p[0] < anchor[0]) anchor = [p[0], p[1] + rr * .72];
      });
      ctx.globalAlpha = 1;
      place(L.hit, anchor, -110, 118, a3);
    } else place(L.hit, null, 0, 0, 0);
    // flight-time marks along round 1's string
    const tm = ortho ? E.ss(T_FWD_END + 3.5, T_FWD_END + 7.5, T) * (1 - E.ss(T_REW - 1, T_REW + 2, T)) : 0;
    if (tm > .01) {
      ctx.font = '400 10.5px "DM Mono", monospace'; ctx.fillStyle = '#F6F5F2'; ctx.strokeStyle = '#F6F5F2'; ctx.lineWidth = 1; ctx.textAlign = 'center';
      for (let tau = 10; tau < R1.tauEnd; tau += 10) {
        pathAt(R1.P, sAt(tau), P2); const q = LC.project([P2.x, P2.y, R1.z]); if (!q) continue;
        ctx.globalAlpha = .6 * tm; ctx.beginPath(); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0], q[1] - 16); ctx.stroke();
        ctx.globalAlpha = .5 * tm; ctx.fillText(`${tau} s`, q[0], q[1] - 22);
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  }
  ctx.strokeStyle = '#F6F5F2'; ctx.fillStyle = '#F6F5F2'; ctx.lineWidth = 1;
  for (const [ax, ay, ex, ey, hx, a] of leaders) { ctx.globalAlpha = .7 * a; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.lineTo(hx, ey); ctx.stroke(); ctx.globalAlpha = a; ctx.fillRect(ax - 2, ay - 2, 4, 4); }
  for (const [[x0, y0, x1, y1], a] of brackets) {
    const p = 6, c = Math.min(14, (x1 - x0) * .25 + 4); ctx.globalAlpha = .8 * a; ctx.beginPath();
    for (const [px, py, sx, sy] of [[x0 - p, y0 - p, 1, 1], [x1 + p, y0 - p, -1, 1], [x1 + p, y1 + p, -1, -1], [x0 - p, y1 + p, 1, -1]]) { ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* readout */
  const nExp = Math.floor(S / STAMP + 1e-9) + 1;
  const tt = fmtClock(S - LAUNCH0);
  if (tt !== clkTT) { clkTT = tt; clkT.textContent = tt; }
  const rs = Math.abs(rate) < .02 ? (T > T_FWD_END - 8 && T < T_REW + 1 ? 'Shutter closed' : 'Hold') : `Rate <b>${rate < 0 ? '−' : ''}x${Math.abs(rate).toFixed(Math.abs(rate) < 3 ? 2 : 1)}</b>${rate < 0 ? ' · rewind' : ''}`;
  const lt = `Exposure <b>${String(nExp).padStart(3, '0')}</b> · every 0.35 s<br>Images <b>${String(nG).padStart(4, '0')}</b><br>${rs}`;
  if (lt !== clkLT) { clkLT = lt; clkL.innerHTML = lt; }
  let cap = CAPS[0]; for (const c of CAPS) if (T >= c[0]) cap = c;
  const ft = cap[2] === '' ? `<b>${cap[1]}</b>Chronophotograph · ${NR} rounds · ${K_MAX + 1} exposures at 0.35 s · ${IMG_TOTAL} images${NOTE}` : `<b>${cap[1]}</b>${cap[2]}${NOTE}`;
  if (ft !== figT) { figT = ft; figEl.innerHTML = ft; }

  STAGE.dbg = { T: +T.toFixed(2), S: +S.toFixed(2), rate: +rate.toFixed(2), k: +cam.k.toFixed(2), ghosts: nG, drawn: nDrawn, segs: segCount, S_END: +S_END.toFixed(2), A1: +A1.toFixed(3), A2: +A2.toFixed(3), A3: +A3.toFixed(3) };
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX, cues = [];
ROUNDS.forEach(rd => {
  cues.push([tOfS(rd.L), () => { SFX.noise(.8, 650, .8, .13, .005); SFX.tone(70, 45, .5, 'sine', .08); }]);
  cues.push([tOfS(rd.L + TIG), () => SFX.rumble(4.5, .17)]);
  cues.push([tOfS(rd.L + TSEP), () => { SFX.noise(.25, 3200, .5, .05, .002); SFX.tone(420, 180, .3, 'triangle', .03); }]);
});
TELS.forEach(tl => { cues.push([tOfS(tl.E), () => { SFX.tone(52, 64, 6, 'sawtooth', .012); SFX.noise(6, 180, .7, .02, .6); }]); });
for (let k = 0; k <= K_MAX; k++) { const t = tOfS(k * STAMP); if (t > 7 && t < T_FWD_END - 4) cues.push([t, () => SFX.tone(3400, 3100, .014, 'sine', .01)]); }
for (let s = HS[0] - 1; s < HS[1] + 1; s += .45) cues.push([tOfS(s), () => SFX.noise(.18, 110, 1.2, .045 * E.ss(HS[0] - 1, HS[0] + 4, s) * (1 - E.ss(HS[1] - 4, HS[1] + 1, s)), .01)]);
cues.push([tOfS(FS[0] + 1), () => { SFX.noise(7, 900, .4, .07, 2.2); SFX.tone(1400, 700, 6, 'sine', .012); }]);
SMS.forEach(sm => {
  cues.push([tOfS(sm.S0), () => { SFX.noise(2.4, 520, .6, .1, .01); SFX.rumble(4, .13); SFX.tone(120, 60, 1.2, 'sawtooth', .015); }]);
  if (sm.mk) cues.push([tOfS(sm.S0 + SM_TB), () => SFX.noise(.2, 2800, .5, .035, .002)]);
});
CIWS.forEach(C => cues.push([tOfS(C.s0), () => { SFX.tone(76, 72, 1.2, 'sawtooth', .022); SFX.noise(1.2, 2600, .7, .035, .01); }]));
KILLS.forEach(Kl => cues.push([tOfS(Kl.S), () => { SFX.noise(Kl.sm ? .5 : .35, 2400, .6, Kl.sm ? .1 : .08, .002); SFX.tone(300, 90, .4, 'triangle', .035); if (Kl.sm) SFX.rumble(2, .08); }]));
HITS.forEach(h => cues.push([tOfS(h.S), () => { SFX.noise(.6, 700, .7, .13, .003); SFX.rumble(3.5, .15); }]));
cues.push([T_FWD_END + .3, () => { SFX.tone(440, 440, 2.6, 'sine', .025); SFX.tone(660, 660, 3.2, 'sine', .018, .12); }]);
cues.push([T_REW + .2, () => { SFX.tone(1600, 160, 3.2, 'sine', .03); SFX.noise(3.5, 1400, .6, .06, 2.6); }]);
cues.push([DUR - 1.6, () => SFX.tone(880, 880, .12, 'sine', .03)]);

window.OB = { SW, tOfS, S_END, GH, ROUNDS, SMS, KILLS, CIWS, HITS, SHIPS, camAt, HTRK, FTRK, heloPose, fighterPose, A1, A2, A3 };
FILM.run({
  duration: DUR,
  chapters: [{ t: 0, title: 'Cap' }, { t: 15, title: 'Ripples' }, { t: 45, title: 'Cruise' }, { t: 77, title: 'Barrage' }, { t: T_FWD_END, title: 'The plate' }, { t: T_REW, title: 'Rewind' }],
  cues, render,
});
// warm the heavy lazy records in idle time (the ships, the interceptor images, the barrage's
// stamped bursts and columns) so the first frames at the far edge don't stall; output is identical
{
  const jobs = [() => shipRec(0, 0), () => shipRec(0, 1), () => shipRec(1, 0), () => shipRec(1, 1), () => mkRec(0), () => mkRec(1)];
  for (const b of [true, false]) for (const fl of [0, 3, 4]) for (const l of [0, 1]) jobs.push(() => smRec(b, fl, l));
  for (const gh of GH) if (gh.t > S_FIRST_SM - 1 && gh.rec && !gh.aff) jobs.push(() => gh.rec(0));
  const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 30));
  const step = dl => { while (jobs.length && dl.timeRemaining() > 2) jobs.shift()(); if (jobs.length) idle(step); };
  idle(step);
}
})();
