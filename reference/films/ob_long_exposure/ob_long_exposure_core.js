/* OB · LONG EXPOSURE. A chronophotograph that is also a film: a long lens on a virtual rail,
   side-on and orthographic; every 0.35 s of sim time a hairline ghost of every moving thing
   inside the plane of fire is stamped onto the plate. The whole picture is a pure function of
   film time T -> sim time S = SW(T): an exposure k exists iff k * 0.35 <= S, so the rewind is
   simply S running back to 0.
   Ghosts are recorded once (lazily) as 2D segment lists in plate coordinates with the fixed
   ortho view basis; rigid in-plane motion (rounds, launchers, boosters) reuses one canonical
   record per state under a 2D affine. The flight path is a drawn spline (schematic, like
   o4), not a simulation. */
(() => {
'use strict';
const { V, R, X, E } = M3;
STAGE.fit(); STAGE.SFX.kind = 'orb';
const DEG = Math.PI / 180, TAU = Math.PI * 2, DUR = 160, STAMP = .35, NB = 18;
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
const DOF = 350;                       // the plate records only the plane of fire, +-350 m deep
const inSlab = z => Math.abs(z - 12) <= DOF;

/* ---------- battery ---------- */
const E_MAX = 1.53, ER_DUR = 6.5, JK_DUR = 1.5;
const TELS = [{ x: 0, z: 0, J: 7, E: 8.5 }, { x: -24, z: 24, J: 7.6, E: 9.6 }, { x: -48, z: 48, J: 8.2, E: 10.7 }];
for (const t of TELS) { t.W = X.make(R.y(-Math.PI / 2), [t.x, 0, t.z]); t.piv = X.ap(t.W, TELM.PIV); t.pivP = [t.piv[0], plY(t.piv[1], t.piv[2])]; }
const elevAt = (i, S) => E_MAX * E.inOut(E.sat((S - TELS[i].E) / ER_DUR));
const depAt = (i, S) => E.ss(TELS[i].J, TELS[i].J + JK_DUR, S);

/* ---------- the four rounds: drawn paths ---------- */
const TEX = .6, TIG = 1.1, TSEP = 5.6, V_CR = 34;
const ROUNDS = [{ tel: 0, side: 1, L: 18, h: 11 }, { tel: 0, side: -1, L: 20.5, h: 13.5 }, { tel: 1, side: 1, L: 23, h: 16 }, { tel: 1, side: -1, L: 25.5, h: 18.5 }];
const TUBE_S = 9.65;                   // centre travel from inside the tube to clear of the mouth
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
  const m = rd.mouth, d = rd.dir, lift = i * 4;
  const pts = [
    [m[0] - d[0] * 5.05, m[1] - d[1] * 5.05],
    [m[0] + d[0] * 4.6, m[1] + d[1] * 4.6],
    [m[0] + .8, m[1] + 17],
    [m[0] + 13, m[1] + 43 + lift * .5],
    [m[0] + 50, m[1] + 66 + lift],
    [120 + i * 6, 74 + lift],
    [192 + i * 8, 47 + lift * .6],
    [262 + i * 6, SEA + rd.h + 9],
    [335, seaY(335) + rd.h],
  ];
  for (let x = 440; x <= X_END + 500; x += 100) pts.push([x, seaY(x) + rd.h]);
  rd.P = buildPath(pts);
  // leaves the plate at X_END
  let t = 8; while (t < 138) { pathAt(rd.P, sAt(t), tmp); if (tmp.x > X_END) break; t += 1 / 60; }
  rd.tauExit = t;
  pathAt(rd.P, sAt(TSEP), tmp); rd.sep = { x: tmp.x, y: tmp.y, a: tmp.a };
});
// the shutter still closes when round 4 would have left the plate (it ends earlier, on the destroyer):
// the smoke gets its seconds and the film-time warp stays as it was
const S_END = Math.max(...ROUNDS.map(r => r.L + r.tauExit)) + .6;
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
  rd.capV = V.add(V.mul(rd.dir, 9.5), [4.4 + i * .3, 1.2, -3.3]);
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
function puffAt(rd, p, a) {
  const k = (1 - Math.exp(-1.3 * a)) / 1.3 * p.sp;
  return [rd.mouth[0] + p.d[0] * k + .6 * a, rd.mouth[1] + p.d[1] * k + .45 * a, rd.mouth[2] + p.d[2] * k];
}

/* ---------- the destroyer at the far edge: Phalanx stops round 1 short, rounds 2-4 reach the ship ----------
   DDG-51 stands side-on, bow toward the battery, to scale like every vehicle. The compressed range axis
   steepens the curve of the sea to ~8 deg out here, so the hull is trimmed to lie on it, as the rounds'
   paths do. Everything below is analytic in its spawn time and lives in plate coordinates (x, Y). */
const Pp = (x, Y) => [x, Y / CP, 0];
const DDM = WIRE(HD.destroyer()), DDA = HD.destroyer.A;
const SHIP_X = 2290, SHIP_Z = 44;
const SHIP_TH = Math.atan2(seaY(SHIP_X + 5) - seaY(SHIP_X - 5), 10);
const SHIP_W = X.make(R.mul(R.z(SHIP_TH), R.y(-Math.PI / 2)), [SHIP_X, seaY(SHIP_X), SHIP_Z]);
const SHIP_ST = { ciwsYaw: [0, Math.PI], ciwsPitch: [.03, .35] };
const shipP = p => { const q = X.ap(SHIP_W, p); return [q[0], plY(q[1], q[2])]; };
const BOW = shipP(DDA.bow), STERN = shipP(DDA.stern), MZ = shipP(DDA.ciws(SHIP_ST, 0));
const seaP = (x, z) => plY(seaY(x), z);
const KILL = 0, HIT_AFT = [0, 12, 40, 68];      // metres aft of the stem where rounds 2-4 strike
ROUNDS.forEach((rd, i) => {
  const xe = i === KILL ? BOW[0] - 26 : BOW[0] + HIT_AFT[i] * Math.cos(SHIP_TH);
  let lo = 8, hi = rd.tauExit;
  for (let n = 0; n < 60; n++) { const m = (lo + hi) / 2; pathAt(rd.P, sAt(m), tmp); if (tmp.x < xe) lo = m; else hi = m; }
  rd.tauEnd = hi; rd.SEnd = rd.L + hi;
  pathAt(rd.P, sAt(hi), tmp); rd.end = { x: tmp.x, Y: plY(tmp.y, rd.z), a: tmp.a };
});
const S_K = ROUNDS[KILL].SEnd, KE = ROUNDS[KILL].end;
const KM_SHIP = (ginv(SHIP_X) / 1000).toFixed(1), KM_KILL = (ginv(KE.x) / 1000).toFixed(1);
/* tracers: 1100 m/s along the to-scale hull, then 1100/CMP plate units/s over the compressed range;
   each one led onto round 1, aimed high for its drop, with a little dispersion */
const TRC_V = 1100 / CMP, DSHIP = MZ[0] - BOW[0], TRC_DASH = .045;
const trcD = a => a * 1100 < DSHIP ? a * 1100 : DSHIP + (a - DSHIP / 1100) * TRC_V;
const trcT = d => Math.min(d, DSHIP) / 1100 + Math.max(0, d - DSHIP) / TRC_V;
const TRC = [];
{
  const r = M3.rng(7717), q = {};
  for (let s = S_K - 1.25; s < S_K - .03; s += .09) {
    let ta = s + .4;
    for (let it = 0; it < 8; it++) { roundPose(KILL, ta, q); ta = s + trcT(Math.hypot(q.x - MZ[0], q.Y - MZ[1])); }
    roundPose(KILL, ta, q);
    const tf = ta - s, dx = q.x - MZ[0], dy = q.Y + 4.905 * tf * tf - MZ[1], n = Math.hypot(dx, dy), j = (r() - .5) * .06;
    const tr = { s, ux: (dx * Math.cos(j) - dy * Math.sin(j)) / n, uy: (dx * Math.sin(j) + dy * Math.cos(j)) / n, end: 1.5 + .3 * r() };
    for (let a = .05; a < tr.end; a += 1 / 120) { const p = trcAt(tr, a); if (p[1] <= seaP(p[0], 0)) { tr.end = a; break; } }
    TRC.push(tr);
  }
}
function trcAt(tr, a) { const d = trcD(a); return [MZ[0] + tr.ux * d, MZ[1] + tr.uy * d - 4.905 * a * a]; }
const TRC_S0 = TRC[0].s, TRC_S1 = TRC[TRC.length - 1].s;
/* round 1's fragments: carried on by its momentum, tumbling, falling to the sea short of the ship */
function fragAt(f, u) { const k = f.vx * f.td * (1 - Math.exp(-u / f.td)); return { x: KE.x + k, Y: KE.Y + f.vy * u - 4.905 * u * u, a: f.a0 + f.w * u }; }
const FRAG = [];
{
  const r = M3.rng(5150);
  for (let j = 0; j < 16; j++) {
    const big = j < 4;
    const f = { vx: V_CR * (big ? .3 + .2 * r() : .1 + .6 * r()), td: .5 + .4 * r(), vy: big ? 2 + 5 * r() : -3 + 19 * r(),
                len: big ? 2.8 + 1.8 * r() : 1.1 + 1.2 * r(), w: (r() < .5 ? -1 : 1) * (4 + 14 * r()), a0: r() * TAU, big };
    let u = 0; while (u < 6) { const p = fragAt(f, u); if (p.Y <= seaP(p.x, 0)) break; u += 1 / 120; }
    f.end = u; const p = fragAt(f, u); f.sx = p.x; f.sY = seaP(p.x, 0);
    FRAG.push(f);
  }
}
/* the three hits: fireball, debris thrown up off the ship, a smoke column each (the first one tallest) */
const FB_LIFE = 1.5;
const HITS = ROUNDS.filter((rd, i) => i !== KILL).map((rd, j) => ({ S: rd.SEnd, x: rd.end.x, Y: rd.end.Y, j, RM: 10.5 + 1.5 * j, HM: [105, 72, 52][j], ws: [1, .74, .6][j] }));
function debAt(h, d, u) { return { x: h.x + d.vx * u, Y: h.Y + d.vy * u - 4.905 * u * u, a: d.a0 + d.w * u }; }
HITS.forEach(h => {
  const r = M3.rng(6100 + h.j); h.deb = [];
  for (let n = 0; n < 7; n++) {
    const d = { vx: (r() - .4) * 26, vy: 8 + 15 * r(), len: .6 + 1.4 * r(), w: (r() - .5) * 26, a0: r() * TAU };
    let u = .3; while (u < 6) { const p = debAt(h, d, u); if (p.Y <= seaP(p.x, SHIP_Z - 11)) break; u += 1 / 120; }
    d.end = u; h.deb.push(d);
  }
});

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
function trcInto(W, t, al) {
  W.style('#FFFFFF', 1.3);
  for (const tr of TRC) {
    const a = t - tr.s; if (a < 0 || a > tr.end) continue;
    const p = trcAt(tr, a), q = trcAt(tr, Math.max(0, a - TRC_DASH));
    W.seg(Pp(q[0], q[1]), Pp(p[0], p[1]), al * (1 - .45 * a / tr.end));
  }
  if (t >= TRC_S0 && t <= TRC_S1 + .05) {
    // the stream is across the to-scale hull in 0.04 s: drawn as one streak from the muzzle past the stem
    const tr = TRC[Math.min(TRC.length - 1, Math.floor((t - TRC_S0) / .09))], d = DSHIP + 3;
    W.seg(Pp(MZ[0], MZ[1]), Pp(MZ[0] + tr.ux * d, MZ[1] + tr.uy * d), al * .45);
    spikesInto(W, MZ[0], MZ[1], .3, 2.6, 7, t * 7, al * .8);
  }
  W.style('#F6F5F2', 1);
}
function killInto(W, a, al) {
  W.style('#FFFFFF', 1.3);
  if (a < .9) {
    const R = 6.5 * (1 - Math.exp(-a / .12)), f = al * .95 * Math.pow(1 - a / .9, .7), x = KE.x + 2.2 * a, Y = KE.Y + 1.2 * a;
    ballInto(W, x, Y, R, 1.3 + 3 * a, f, 28);
    if (a < .3) spikesInto(W, x, Y, R * .8, R * 2 + 3, 11, .4, f * .8);
  }
  W.style('#F6F5F2', 1);
  // the smudge it leaves, carried on a little by the round's momentum
  if (a > .3 && a < 3.3) {
    const g = a - .3, f = al * .24 * Math.pow(1 - g / 3, 1.3), x = KE.x + 7 * (1 - Math.exp(-g / .6)) + g, Y = KE.Y + .9 * g;
    ballInto(W, x, Y, 2.6 + 2.6 * Math.sqrt(g), 1.7 + g * .8, f, 22);
  }
  W.style('#FFFFFF', 1.3);
  for (const fr of FRAG) {
    if (a <= fr.end) { const p = fragAt(fr, a); tickInto(W, p.x, p.Y, p.a, fr.len, al * (fr.big ? 1 : .85)); }
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
  const g = a - .25; if (g <= 0) return;
  const H = h.HM * (1 - Math.exp(-g / 6.5)); if (H < 1.2) return;
  const n = Math.max(4, Math.min(26, Math.round(H / 3))), sd = h.j * 7.3;
  let lx = 0, ly = 0, rx = 0;
  for (let i = 0; i <= n; i++) {
    const z = H * i / n, Y = h.Y + z;
    const ax = h.x - .0024 * z * z - 3 * M3.noise(z * .03 - g * .1, sd + 9) * Math.min(1, z / 25);
    const w = h.ws * (7 + .26 * z), bl = Math.min(1, z / 10);
    // billows along the edges, drifting up the column
    const L = ax - w * (.5 + bl * (.13 * M3.noise(z * .11 - g * .35, sd + 1) + .07 * Math.sin(z * .32 - g * 1.1 + sd)));
    const Rr = ax + w * (.5 + bl * (.13 * M3.noise(z * .11 - g * .35, sd + 3) + .07 * Math.sin(z * .29 - g * 1.2 + sd + 2)));
    const fa = al * eK * (.35 + .3 * Math.min(1, z / 15));
    if (i) { W.seg(Pp(lx, ly), Pp(L, Y), fa); W.seg(Pp(rx, ly), Pp(Rr, Y), fa); }
    lx = L; rx = Rr; ly = Y;
  }
  const cx = (lx + rx) / 2, r = (rx - lx) / 2 * 1.08, ph = sd + g * .3;
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
const HTRK = flyer({ V: HV, S0: 28, S1: 68, mid: 47, x: 950, z: 12, alt: 30, psi: S => 252 - 72 * E.ss(40, 53, S) });
const FV = 230, FTRK = flyer({ V: FV, S0: 44, S1: 84, mid: 61.5, x: 1560, z: 12, alt: 205, psi: S => 252 - 30 * E.ss(58.5, 65.5, S) });
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

/* ---------- film time -> sim time ---------- */
function mkWarp(keys) {
  const T1 = keys[keys.length - 1][0], N = Math.ceil(T1 * 200), acc = new Float64Array(N + 1);
  const rate = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const a = keys[i], b = keys[i + 1]; return E.mix(a[1], b[1], E.ss(a[0], b[0], t)); };
  for (let k = 1; k <= N; k++) { const t0 = (k - 1) / N * T1, t1 = k / N * T1; acc[k] = acc[k - 1] + (rate(t0) + rate(t1)) * .5 * (t1 - t0); }
  const f = t => { const x = E.clamp(t / T1, 0, 1) * N, k = Math.min(N - 1, Math.floor(x)); return acc[k] + (acc[k + 1] - acc[k]) * (x - k); };
  f.rate = rate; return f;
}
const WK = (a1, a2) => [
  [0, 0], [2.5, 1], [15.5, 1], [18, .62], [38, .62], [43, 1],
  [58, 1 * a1], [74, 1.05 * a1], [86, 1.3 * a1], [97, 2.1 * a1], [104, 1.9 * a1], [108.5, 0],
  [130, 0], [133.5, -9 * a2], [139, -11 * a2], [142.5, -2.2], [146, -1.3], [150.5, -1.6], [154, -.9], [160, 0]];
let A1, A2, SW;
{
  const f0 = mkWarp(WK(0, 0))(108.5), f1 = mkWarp(WK(1, 0))(108.5); A1 = (S_END - f0) / (f1 - f0);
  const r0 = mkWarp(WK(A1, 0))(160), r1 = mkWarp(WK(A1, 1))(160); A2 = -r0 / (r1 - r0);
  SW = mkWarp(WK(A1, A2));
}
// film time of a sim moment on the forward pass
const T_FWD_END = 108.5;
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
const TH = { mis: [14, 220, 700], launcher: [45], ram: [60], jacks: [], cap: [30, 400], puff: [], bst: [40], cov: [30], helo: [60, 1100], rotor: [40, 1100], ftr: [60, 1100],
  trc: [], kill: [], fire: [], deb: [], smoke: [] };
const lodOf = (px, th) => { th = th || LODPX; let l = 0; while (l < th.length && px >= th[l]) l++; return l; };
// crossfade across each LOD threshold so a zoom never pops
function drawLod(getRec, f, ga, px, so, th) {
  th = th || LODPX;
  const dr = (l, w) => { if (w > .003) drawRec(getRec(l), f[0], f[1], f[2], f[3], f[4], f[5], ga * w, so); };
  for (let l = 0; l < th.length; l++) {
    const t0 = th[l] * .8, t1 = th[l] * 1.25;
    if (px >= t0 && px < t1) { const u = E.ss(t0, t1, px); dr(l, 1 - u); dr(l + 1, u); return; }
  }
  dr(lodOf(px, th), 1);
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
const TH_MIS = [14, 220, 700];
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

// the destroyer stands still: one image per level of detail, drawn live like the battery
const TH_SHIP = [70, 420], SHIP_REC = [];
const shipRec = lod => SHIP_REC[lod] || (SHIP_REC[lod] = record(W => {
  if (lod === 0) drawParts(W, DDM, SHIP_W, SHIP_ST, ['hull', 'super', 'mast', 'stacks', 'spy', 'hangar'], MID);
  else drawParts(W, DDM, SHIP_W, SHIP_ST, lod === 1 ? DDM.parts.map(p => p.name).filter(n => n !== 'rails') : null, lod === 1 ? MID : {});
}, lod === 0 ? .45 : 0));

/* ---------- ghosts: every exposure of every moving thing in the plane of fire ---------- */
const GH = [];
const K_MAX = Math.floor(S_END / STAMP);
function perGhost(fnByLod, minAl) { const recs = [null, null, null, null]; return lod => recs[lod] || (recs[lod] = record(W => fnByLod(W, lod), lod === 1 ? minAl : 0)); }
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
}
// the beat at the plate edge: tracer dashes, the burst and its fragments, fireball rings, debris, smoke
for (let k = Math.floor(TRC_S0 / STAMP); k <= K_MAX; k++) {
  const t = k * STAMP;
  if (TRC.some(tr => t >= tr.s && t <= tr.s + tr.end)) GH.push({ t, kind: 'trc', size: 1, af: .34, aff: null, rec: perGhost(W => trcInto(W, t, 1)) });
  const ak = t - S_K;
  if (ak >= 0 && ak < 4.2) GH.push({ t, kind: 'kill', size: 1, af: .3, aff: null, rec: perGhost(W => killInto(W, ak, 1)) });
  for (const h of HITS) {
    const a = t - h.S; if (a < 0) continue;
    if (a < FB_LIFE) GH.push({ t, kind: 'fire', size: 1, af: .36, aff: null, hl2: true, rec: perGhost(W => fireInto(W, h, a, 1)) });
    if (h.deb.some(d => a <= d.end)) GH.push({ t, kind: 'deb', size: 1, af: .3, aff: null, rec: perGhost(W => debInto(W, h, a, 1)) });
    if (a > .25) GH.push({ t, kind: 'smoke', size: 1, af: .1, aff: null, rec: perGhost(W => smokeInto(W, h, a, 1, .3)) });
  }
}
GH.sort((a, b) => a.t - b.t);
const ghCount = S => { let lo = 0, hi = GH.length; while (lo < hi) { const m = (lo + hi) >> 1; if (GH[m].t <= S + 1e-9) lo = m + 1; else hi = m; } return lo; };
const IMG_TOTAL = GH.length;

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
const BAT = { x: -22, Y: 2.5, k: 21 };
const CAP0 = V.add(X.ap(TELS[0].W, [TELM.TUBE[0], TELM.TUBE[1], TELM.TUBE[2] + TELM.TUBE_LEN]), [-.07, 0, 0]);
const INK = [
  // t, target xyz, yaw, pitch (deg), log10 D, log10 focal length (px)
  [0, CAP0[0], CAP0[1], CAP0[2], 97, 10, Math.log10(1.75), 3.08],
  [2.4, CAP0[0] + .8, CAP0[1] + .5, CAP0[2] - .4, 100, 16, .9, 3.3],
  [4.4, -1.5, 3.2, 3, 58, 10, 1.75, 3.75],
  [5.9, -16, 1, 15, 16, 3.5, 2.9, 4.25],
  [T_IN, BAT.x, BAT.Y / CP, 0, 0, PITCH / DEG, 5, 5 + Math.log10(BAT.k)],
];
const INF = [1, 2, 3, 4, 5, 6, 7].map(c => mono(INK.map(r => r[0]), INK.map(r => r[c])));
function introCam(t) {
  const v = INF.map(f => f(t)), D = Math.pow(10, v[5]), fl = Math.pow(10, v[6]);
  return { c: [v[0], v[1], v[2]], yaw: v[3] * DEG, pitch: v[4] * DEG, k: fl / D, w: 1 / D };
}
// rail shots in plate coords; blended by windows, then smoothed
const centroid = S => { let n = 0, x = 0; for (let i = 0; i < 4; i++) { const p = roundPose(i, S, {}); if (p && p.x < X_END + 40) { x += p.x; n++; } } return n ? x / n : null; };
const lead = S => { let m = -1e9; for (let i = 0; i < 4; i++) { const p = roundPose(i, S, {}); if (p) m = Math.max(m, p.x); } return m; };
function railRaw(T) {
  const S = SW(T), shots = [];
  const add = (w, x, Y, k) => { if (w > 1e-4) shots.push([w, x, Y, Math.log(k)]); };
  const win = (a, b, fi, fo) => E.ss(a - fi, a + fi, T) * (1 - E.ss(b - fo, b + fo, T));
  add(win(-10, 17.8, .1, 1.4) + win(149.5, 175, 1.6, .1), BAT.x + 3 * E.ss(T_IN, 17, T) * (T < 100 ? 1 : 0), BAT.Y, BAT.k);
  { const w = win(17.8, 21.6, 1.4, 1.2); if (w) add(w, 7.5, 6.5, 22); }
  { const w = win(21.6, 25, 1.2, 1.6); if (w) { const p = roundPose(0, S, {}); const px = p ? p.x : 8, pY = p ? p.Y : 6; add(w, E.mix(8, px, .55) + 10, E.mix(8, pY - 6, .6), E.mix(15, 6.5, E.ss(21, 25, T))); } }
  add(win(25, 40.5, 1.6, 2.2) + win(141.5, 149.5, 1.8, 1.6), 118 + 5 * E.sat((T - 25) / 16), 27, 4.5);
  {
    const cw = win(40.5, 88, 2.2, 3) + win(133, 141.5, 1.6, 1.8);
    if (cw) {
      const c = centroid(S);
      if (c !== null) {
        // leave the wide ripple framing first (the arcs exit left), then close in on the rounds
        const cx = c + 26, k = T > 120 ? E.mix(2.2, 3.4, E.ss(134, 141, T)) : E.mix(4.5, 6.8, E.ss(42.5, 47.5, T));
        add(cw, cx, seaY(cx) + 15, k);
        // the rail lingers on the helicopter, then climbs to the jets
        const hw = cw * E.ss(40, 42.5, S) * (1 - E.ss(52.5, 55.5, S)) * (T < 120 ? 1 : 0);
        if (hw) { const h = flyAt(HTRK, S); add(hw * 40, h.x + 3, plY(h.y, h.z) - 2, 22); }
        const fw = cw * E.ss(55.5, 58, S) * (1 - E.ss(66, 69, S)) * (T < 120 ? 1 : 0);
        if (fw) { const a = fighterPose(S, 0).p, b = fighterPose(S, 1).p; add(fw * 40, (a.x + b.x) / 2 + 4, (plY(a.y, a.z) + plY(b.y, b.z)) / 2 + 2.5, 13.5); }
      }
    }
  }
  {
    const w = win(88, 107, 3, 2.5);
    if (w) {
      const L = Math.min(lead(S), X_END), u = E.ss(88, 106, T);
      // run ahead to the destroyer and hold it while the rounds arrive, then pull back to the plate
      const cx = E.mix(E.mix(L - 120, L - 700, u), SHIP_X - 170, E.ss(89.5, 93.5, T) * (1 - E.ss(101.5, 105, T)));
      const lk = E.mix(E.mix(Math.log(5.5), Math.log(1.1), u), Math.log(2.5), E.ss(93, 96, T) * (1 - E.ss(101.5, 105.5, T)));
      add(w, cx, seaY(cx) + E.mix(18, 60, u), Math.exp(lk));
    }
  }
  add(win(107, 126.5, 2.5, 2.4), (X_BEG + X_END) / 2 - 10, -40, 1920 * .88 / (X_END - X_BEG + 120) * (1 + .045 * E.ss(109, 126, T)));
  add(win(126.5, 133.2, 2.4, 1.6), X_END - 260, seaY(X_END - 260) + 24, 2.4);
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
function drawSea(S, view, fa) {
  const x0 = Math.max(CLIFF + 8, view.x0 - 10), x1 = Math.min(X_END + 600, view.x1 + 10);
  if (x1 <= x0) return;
  const step = Math.max(1.5, 7 / LC.k);
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
  if (persp > .01) for (let x = -90; x <= 36; x += 6) for (let z = -40; z <= 90; z += 6) {
    const a = .2 * persp * fa; W.seg([x - .35, .01, z], [x + .35, .01, z], a); W.seg([x, .01, z - .35], [x, .01, z + .35], a);
  }
}
/* rulers: true km along the curve of the sea; vehicles to scale at the battery */
const KM_TICKS = [];
for (let m = 0; m <= 1000; m += 100) KM_TICKS.push({ r: m, big: m === 0 || m === 500 || m === 1000, lab: m === 500 ? '0.5' : m === 1000 ? '1' : m === 0 ? '0' : '' });
for (let km = 2; km <= 60; km++) { const r = km * 1000; if (g(r) > X_END) break; KM_TICKS.push({ r, big: km % 5 === 0, lab: km % 10 === 0 || km === 5 ? String(km) : '' }); }
KM_TICKS.forEach(t => { t.x = g(t.r); });
const rulerY = x => seaY(x) - 11;
function drawRulers(a) {
  if (a <= .01) return;
  const x0 = Math.max(0, PS.x0 - 5), x1 = Math.min(X_END, PS.x1 + 5);
  if (x1 > x0) { const st = Math.max(1, 6 / LC.k); let pa = [x0, rulerY(x0), -8]; for (let x = x0 + st; x <= x1 + st * .5; x += st) { const q = [Math.min(x, x1), rulerY(Math.min(x, x1)), -8]; W.seg(pa, q, .5 * a); pa = q; } }
  for (const t of KM_TICKS) {
    if (t.x < PS.x0 - 5 || t.x > PS.x1 + 5) continue;
    const sp = t.r <= 1000 ? (t.big ? 1 : .55) : (t.big ? 1 : .5), len = (t.big ? 3.6 : 1.8) / Math.max(.4, Math.min(1, LC.k / 6)) * (t.r <= 1000 && t.r > 0 && !t.big ? .6 : 1);
    W.seg([t.x, rulerY(t.x), -8], [t.x, rulerY(t.x) - len, -8], .55 * a * sp);
  }
  // vehicle scale bar at the battery: 0-20 m
  const xA = -66;
  W.seg([xA, 0, -8], [xA, 20, -8], .45 * a);
  for (let h = 0; h <= 20; h += 1) W.seg([xA, h, -8], [xA - (h % 5 ? .6 : 1.4), h, -8], .45 * a);
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
const L = {
  tel: mkCall(ORB.cat('K340P · TEL 1', { code: 'K340P', sq: 'y' }) + '<span class="s2"></span>'),
  rnd: mkCall(ORB.cat('3M55 · round 1', { code: '3M55' }) + '<span class="s2"></span>'),
  sep: mkCall(ORB.cat('Booster separation', { code: 'SEP' }) + '<span class="s2"></span>'),
  helo: mkCall(ORB.cat('MH-60R', { code: 'MH-60R' }) + '<span class="s2"></span>'),
  ftr: mkCall(ORB.cat('F/A-18E ×2', { code: 'F/A-18E' }) + '<span class="s2"></span>'),
  p1: mkCall(`<span class="cat"><i class="sq y"></i>${ORB.hl('TEL 1 · first ejection', 'ej1')}${ORB.bars('EJ1', { h: 9, n: 10 })}</span><span class="s2">exposures at T+0.20 s and T+0.55 s</span>`),
  p2: mkCall(ORB.cat('Erection ×3', { code: 'ER' }) + '<span class="s2">launchers + rams</span>'),
  p3: mkCall(ORB.cat('Ripple · 2.5 s', { code: 'RPL' }) + '<span class="s2">4 rounds</span>'),
  p4: mkCall(ORB.cat('Plate edge', { code: 'EDGE' }) + '<span class="s2"></span>'),
  curve: mkCall(ORB.cat('Curve of the sea', { code: 'CURV' }) + `<span class="s2">${Math.round(drop(X_END))} m below the level of the bluff at ${(ginv(X_END) / 1000).toFixed(0)} km</span>`),
  exit: mkCall(ORB.cat('Round 1 · stopped short', { code: 'KILL' }) + `<span class="s2">T+${(S_K - ROUNDS[0].L).toFixed(2)} s · ${KM_KILL} km</span>`),
  ship: mkCall(ORB.cat('DDG-51 · 1 hit', { code: 'DDG-51' }) + '<span class="s2"></span>'),
  hit: mkCall(`<span class="cat"><i class="sq y"></i>${ORB.hl('DDG-51 · three hits', 'hit')}${ORB.bars('HIT', { h: 9, n: 10 })}</span><span class="s2">round 1 stopped short · ${KM_SHIP} km</span>`),
};
Object.values(L).forEach(el => { el._txt = ''; el._s2 = el.querySelector('.s2'); });
const setS2 = (el, t) => { if (el._txt !== t) { el._txt = t; el._s2.innerHTML = t; } };
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
const NOTE = '<span class="n2">range axis compressed beyond the bluff, ticks in true km · vehicles to scale · path schematic</span>';
const CAPS = [
  [0, 'Fig. 4.1', 'End cap, TLC 1R · three launchers erecting'],
  [15, 'Fig. 4.2', 'Ripple · four rounds, 2.5 s apart'],
  [42, 'Fig. 4.3', 'Over the sea · every 0.35 s'],
  [85, 'Fig. 4.4', 'Over the curve of the sea'],
  [108, 'Fig. 4', ''],
  [130, 'Fig. 4', 'Rewind'],
  [153, 'Fig. 4.1', 'End cap, TLC 1R · three launchers erecting'],
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

  const plateA = E.ss(100, 110, T) * (1 - E.ss(131, 136, T));
  if (focusA > .005) { W.style('#F6F5F2', 1); drawSea(S, { x0: ortho ? PS.x0 : -300, x1: ortho ? PS.x1 : 400 }, focusA); drawGround(S, persp, focusA); }
  // the ruler never runs under the menu row
  const rcx = (PS.x0 + PS.x1) / 2, rsy = PS.oy - PS.k * rulerY(Math.max(0, rcx)), rulA = 1 - E.ss(770, 830, rsy);
  drawRulers(ortho ? E.ss(9, 13, T) * (1 - E.ss(149, 152, T)) * rulA : 0);
  drawBorder(plateA);
  const hzA = ortho ? E.ss(88, 95, T) * (1 - E.ss(131, 135, T)) : 0;
  if (hzA > .01) {
    const st = 16 / PS.k, x0 = Math.max(CLIFF + 12, PS.x0), x1 = Math.min(X_END, PS.x1);
    for (let x = x0 - ((x0 - CLIFF) % st); x < x1; x += st) W.seg([x, SEA, -8], [Math.min(x + st * .5, x1), SEA, -8], .42 * hzA);
    const xe = X_END + 34 / PS.k, ye = seaY(X_END), tk = 5 / PS.k;
    W.seg([xe, SEA, -8], [xe, ye, -8], .6 * hzA);
    W.seg([xe - tk, SEA, -8], [xe + tk, SEA, -8], .6 * hzA); W.seg([xe - tk, ye, -8], [xe + tk, ye, -8], .6 * hzA);
  }

  /* ghosts */
  const nG = ghCount(S), hlA = E.ss(111, 113.5, T) * (1 - E.ss(130, 132, T)), hlB = E.ss(115, 117.5, T) * (1 - E.ss(130, 132, T));
  let nDrawn = 0;
  if (ortho) for (let gi = 0; gi < nG; gi++) {
    const gh = GH[gi], age = S - gh.t, ga = .88 * (gh.af + (1 - gh.af) * Math.exp(-age / 1.1));
    if (gh.kind === 'puff') {
      const rd = ROUNDS[gh.i], pf = rd.puffs[gh.j], a = gh.tau, p = puffAt(rd, pf, a), r = pf.r0 + pf.gr * Math.sqrt(a);
      circle(p[0], plY(p[1], p[2]), r, ga * .55 * Math.pow(1 - a / pf.life, 1.2)); nDrawn++; continue;
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
    const capR = ROUNDS.some(r => r.tel === i && r.side > 0 && S >= r.L) ? 1 : 0, capL = ROUNDS.some(r => r.tel === i && r.side < 0 && S >= r.L) ? 1 : 0;
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
      const c = [rg.x + .9 * age, rg.y + .45 * age, rg.z];
      if (ortho) { const n = Math.max(6, Math.min(14, Math.round(r * PS.k * .6))); W.ring(c, rg.U, rg.Vv, r, n, a); }
      else W.ring(c, rg.U, rg.Vv, r, 14, a);
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

  /* the destroyer, and the beat at the plate edge, live */
  const blooms = [];
  if (ortho) {
    drawLod(shipRec, ID, .95, 155 * PS.k, -1, TH_SHIP);
    if (S >= TRC_S0 && S <= TRC_S1 + 2) trcInto(W, S, 1);
    const ak = S - S_K;
    if (ak >= 0 && ak < 4.2) { killInto(W, ak, 1); if (ak < .8) blooms.push([Pp(KE.x, KE.Y), .5 * Math.exp(-ak / .22)]); }
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
  // restrained bloom at ignitions
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
    const ra = E.ss(9, 13, T) * (1 - E.ss(149, 152, T)) * rulA;
    ctx.font = '400 11px "DM Mono", monospace'; ctx.fillStyle = '#F6F5F2'; ctx.textAlign = 'center';
    let lastX = -1e9;
    for (const t of KM_TICKS) {
      if (!t.lab) continue;
      const p = LC.project([t.x, rulerY(t.x) - 5.5 / Math.max(.4, Math.min(1, LC.k / 6)), -8]); if (!p || p[0] - lastX < 46) continue;
      lastX = p[0]; ctx.globalAlpha = .55 * ra; ctx.fillText(t.lab + (t.r === 1000 || t.r % 10000 === 0 && t.r >= 10000 ? ' km' : ''), p[0], p[1] + 10);
    }
    const pb = LC.project([-66, 20, -8]); if (pb) { ctx.globalAlpha = .45 * ra; ctx.textAlign = 'right'; ctx.fillText('20 m', pb[0] - 8, pb[1] + 4); }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  /* labels */
  leaders.length = 0; brackets.length = 0;
  {
    const el = elevAt(0, S), a = ortho ? E.ss(8, 9.5, T) * (1 - E.ss(T1st - 1.5, T1st - .4, T)) : 0;
    setS2(L.tel, S < TELS[0].J ? 'stowed' : S < TELS[0].E ? 'jacks down' : el < E_MAX - .01 ? `erecting · ${Math.round(el / DEG)}°` : `vertical · ${Math.round(E_MAX / DEG)}°`);
    place(L.tel, a ? LC.project(X.ap(TELS[0].W, [0, 3.4, 3])) : null, 60, 150, a);
  }
  {
    const tau = S - ROUNDS[0].L, a = ortho && tau > .25 && T < 60 ? E.sat((tau - .25) * 3) * (1 - E.ss(TSEP - .6, TSEP, tau)) : 0;
    if (a) { roundPose(0, S, P1); setS2(L.rnd, `T+${tau.toFixed(2)} s · ${tau < TEX ? 'gas ejection' : tau < TIG ? 'coast' : 'boost'}`); }
    place(L.rnd, a ? LC.project([P1.x, P1.y, ROUNDS[0].z]) : null, 70, 60, a);
  }
  {
    const rd = ROUNDS[0], ub = S - rd.L - TSEP, a = ortho && T < 60 ? E.sat(ub * 3) * (1 - E.ss(3, 4, ub)) : 0;
    const p = a ? bstAt(rd, Math.min(ub, rd.bstEnd)) : null;
    if (a) { const n = GH.slice(0, nG).filter(q => q.kind === 'bst' && q.i === 0).length; setS2(L.sep, n ? `spent casing · ${n} exposure${n === 1 ? '' : 's'}` : 'spent casing'); }
    place(L.sep, p ? LC.project([p.x, p.y, rd.z]) : null, -200, -120, a);
  }
  if (ortho) {
    const hin = S > HTRK.S0 + 1 && S < HTRK.S0 + HTRK.n / HTRK.HZ - 1 && T < 110 ? heloPose(S) : null;
    let a = hin ? E.ss(41.5, 43, S) * (1 - E.ss(52, 53.5, S)) : 0;
    if (a) {
      const n = GH.slice(0, nG).filter(q => q.kind === 'helo').length;
      setS2(L.helo, `${n} exposure${n === 1 ? '' : 's'} · rotor stamped`);
      const bx = modelBox(HELO, hin.X, hin.st, ['fuselage', 'rotor', 'tail']);
      if (bx) { brackets.push([bx, a]); place(L.helo, [bx[2], bx[1]], 60, -50, a); } else place(L.helo, null, 0, 0, 0);
    } else place(L.helo, null, 0, 0, 0);
    a = S > 57 && S < 68 && T < 110 ? E.ss(57.6, 59, S) * (1 - E.ss(65.5, 67, S)) : 0;
    if (a) {
      const f0 = fighterPose(S, 0), f1 = fighterPose(S, 1);
      const b0 = modelBox(FTR, f0.X, f0.st), b1 = modelBox(FTR, f1.X, f1.st);
      if (b0) brackets.push([b0, a]); if (b1) brackets.push([b1, a]);
      const ni = GH.slice(0, nG).filter(q => q.kind === 'ftr').length;
      setS2(L.ftr, `turning in · F414 fan faces, nozzles · ${ni} image${ni === 1 ? '' : 's'}`);
      place(L.ftr, b0 ? [b0[0], b0[3]] : null, -70, 70, a);
    } else place(L.ftr, null, 0, 0, 0);
  } else { place(L.helo, null, 0, 0, 0); place(L.ftr, null, 0, 0, 0); }
  {
    const a = ortho ? E.ss(112, 114, T) * (1 - E.ss(129, 131, T)) : 0;
    const g0 = GH.find(q => q.hl);
    const pA = a && g0 ? LC.project([g0.aff[4], g0.aff[5] / CP, 0]) : null;
    place(L.p1, pA, 70, -150, a);
    if (pA) { ctx.strokeStyle = '#F4D23C'; ctx.lineWidth = 1.4; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(pA[0], pA[1], 15, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    const a2 = ortho ? E.ss(113, 115, T) * (1 - E.ss(125, 127, T)) : 0;
    place(L.p2, a2 ? LC.project([-24, 10, 24]) : null, 40, 110, a2);
    place(L.p3, null, 0, 0, 0);
    setS2(L.p4, `${(ginv(X_END) / 1000).toFixed(0)} km`);
    place(L.p4, a2 ? LC.project([X_END, seaY(X_END) + 15, 0]) : null, -60, -130, a2);
    // the hit, in the highlighter: its fireball rings are drawn yellow above
    const a3 = ortho ? hlB : 0;
    const pH = a3 > .01 ? LC.project(Pp((HITS[0].x + HITS[2].x) / 2, (HITS[0].Y + HITS[2].Y) / 2 + 3)) : null;
    place(L.hit, pH, -110, 135, a3);
    if (pH) { const rr = Math.max(15, (HITS[2].x - HITS[0].x) / 2 * PS.k + 14 * PS.k); ctx.strokeStyle = '#F4D23C'; ctx.lineWidth = 1.4; ctx.globalAlpha = a3; ctx.beginPath(); ctx.arc(pH[0], pH[1], rr, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    // flight-time marks along round 1's string
    const tm = ortho ? E.ss(112, 116, T) * (1 - E.ss(129, 132, T)) : 0;
    if (tm > .01) {
      ctx.font = '400 10.5px "DM Mono", monospace'; ctx.fillStyle = '#F6F5F2'; ctx.strokeStyle = '#F6F5F2'; ctx.lineWidth = 1; ctx.textAlign = 'center';
      for (let tau = 10; tau < ROUNDS[0].tauEnd; tau += 10) {
        pathAt(ROUNDS[0].P, sAt(tau), P2); const q = LC.project([P2.x, P2.y, ROUNDS[0].z]); if (!q) continue;
        ctx.globalAlpha = .6 * tm; ctx.beginPath(); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0], q[1] - 16); ctx.stroke();
        ctx.globalAlpha = .5 * tm; ctx.fillText(`${tau} s`, q[0], q[1] - 22);
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  }
  {
    // waits for the pull-back after the beat: during the hold on the destroyer it would sit cut by the frame edge
    const a = ortho ? E.ss(98.5, 100.5, T) * (1 - E.ss(107, 110, T)) : 0;
    place(L.curve, a ? LC.project([X_END + 34 / PS.k, (SEA + seaY(X_END)) / 2, -8]) : null, -70, -150, a);
    const uk = S - S_K, ae = ortho && T < 110 && uk >= 0 && uk < 3.2 ? E.sat(uk * 4) * (1 - E.ss(2.4, 3.2, uk)) : 0;
    place(L.exit, ae ? LC.project(Pp(KE.x, KE.Y)) : null, -150, -140, ae);
    // the ship keeps count of the hits; hung off the stern, clear of the smoke leaning up-left
    let nh = 0; for (const h of HITS) if (S >= h.S) nh++;
    const as = nh && ortho && T < 110 ? E.sat((S - HITS[0].S) * 3) * (1 - E.ss(107, 110, T)) : 0;
    if (as) {
      const el = L.ship.querySelector('.cat span'), t1 = `DDG-51 · ${nh} hit${nh > 1 ? 's' : ''}`; if (el.textContent !== t1) el.textContent = t1;
      setS2(L.ship, `T+${(HITS[nh - 1].S - LAUNCH0).toFixed(2)} s · ${KM_SHIP} km`);
    }
    place(L.ship, as ? LC.project(Pp(STERN[0], STERN[1])) : null, -60, 85, as);
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
  const rs = Math.abs(rate) < .02 ? (T > 100 && T < 131 ? 'Shutter closed' : 'Hold') : `Rate <b>${rate < 0 ? '−' : ''}x${Math.abs(rate).toFixed(Math.abs(rate) < 3 ? 2 : 1)}</b>${rate < 0 ? ' · rewind' : ''}`;
  const lt = `Exposure <b>${String(nExp).padStart(3, '0')}</b> · every 0.35 s<br>Images <b>${String(nG).padStart(4, '0')}</b><br>${rs}`;
  if (lt !== clkLT) { clkLT = lt; clkL.innerHTML = lt; }
  let cap = CAPS[0]; for (const c of CAPS) if (T >= c[0]) cap = c;
  const ft = cap[2] === '' ? `<b>${cap[1]}</b>Chronophotograph · 4 rounds · ${K_MAX + 1} exposures at 0.35 s · ${IMG_TOTAL} images${NOTE}` : `<b>${cap[1]}</b>${cap[2]}${NOTE}`;
  if (ft !== figT) { figT = ft; figEl.innerHTML = ft; }

  STAGE.dbg = { T: +T.toFixed(2), S: +S.toFixed(2), rate: +rate.toFixed(2), k: +cam.k.toFixed(2), ghosts: nG, drawn: nDrawn, segs: segCount, S_END: +S_END.toFixed(2), A1: +A1.toFixed(3), A2: +A2.toFixed(3) };
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX, cues = [];
ROUNDS.forEach(rd => {
  cues.push([tOfS(rd.L), () => { SFX.noise(.8, 650, .8, .13, .005); SFX.tone(70, 45, .5, 'sine', .08); }]);
  cues.push([tOfS(rd.L + TIG), () => SFX.rumble(4.5, .17)]);
  cues.push([tOfS(rd.L + TSEP), () => { SFX.noise(.25, 3200, .5, .05, .002); SFX.tone(420, 180, .3, 'triangle', .03); }]);
});
TELS.forEach(tl => { cues.push([tOfS(tl.E), () => { SFX.tone(52, 64, 6, 'sawtooth', .012); SFX.noise(6, 180, .7, .02, .6); }]); });
for (let k = 0; k <= K_MAX; k++) { const t = tOfS(k * STAMP); if (t > 7 && t < 104) cues.push([t, () => SFX.tone(3400, 3100, .014, 'sine', .01)]); }
for (let s = 39; s < 56; s += .45) cues.push([tOfS(s), () => SFX.noise(.18, 110, 1.2, .045 * E.ss(39, 44, s) * (1 - E.ss(51, 56, s)), .01)]);
cues.push([tOfS(57), () => { SFX.noise(7, 900, .4, .07, 2.2); SFX.tone(1400, 700, 6, 'sine', .012); }]);
cues.push([tOfS(TRC_S0), () => { SFX.tone(76, 72, .9, 'sawtooth', .02); SFX.noise(.9, 2600, .7, .03, .01); }]);
cues.push([tOfS(S_K), () => { SFX.noise(.35, 2400, .6, .08, .002); SFX.tone(300, 90, .4, 'triangle', .035); }]);
HITS.forEach(h => cues.push([tOfS(h.S), () => { SFX.noise(.6, 700, .7, .13, .003); SFX.rumble(3.5, .15); }]));
cues.push([108.8, () => { SFX.tone(440, 440, 2.6, 'sine', .025); SFX.tone(660, 660, 3.2, 'sine', .018, .12); }]);
cues.push([130.2, () => { SFX.tone(1600, 160, 3.2, 'sine', .03); SFX.noise(3.5, 1400, .6, .06, 2.6); }]);
cues.push([158.4, () => SFX.tone(880, 880, .12, 'sine', .03)]);

window.OB = { SW, tOfS, S_END, GH, ROUNDS, camAt, HTRK, FTRK, heloPose, fighterPose, HITS, TRC, FRAG, S_K };
FILM.run({
  duration: DUR,
  chapters: [{ t: 0, title: 'Cap' }, { t: 15, title: 'Ripple' }, { t: 42, title: 'Cruise' }, { t: 85, title: 'Horizon' }, { t: 108, title: 'The plate' }, { t: 130, title: 'Rewind' }],
  cues, render,
});
})();
