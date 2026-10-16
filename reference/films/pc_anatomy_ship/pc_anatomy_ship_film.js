/* ANATOMY · SHIP (Point Cloud C): the destroyer as a museum cutaway in dots, sister of the
   Anatomy film. A lightning-strike scan pours down onto the ship alongside at night; a lime
   slice turns the steel thin and the lens flies in through a turbine intake, through an LM2500,
   down the shaft and out to the propellers; the ship floats apart into her assemblies and back;
   she sails, loops at sea in time-lapse and backs into the berth, and the pier crane lowers
   canisters into the aft launcher. One take, 160 s, loops. Everything is a pure function of
   film time T (sim time S = SIM(T) under the shown time-warp). */
(() => {
const { V, R, X, E, Cam, rng, noise } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const H = HARB, SM = SHIPM, DA = HD.destroyer.A;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const PROF = STAGE.Q.has('prof') ? {} : null;
const pf = (k, t0) => { if (PROF) PROF[k] = (PROF[k] || 0) + performance.now() - t0; };
const LOG = [];

/* ---------- menu: centred row along the bottom ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 160;
const CHAPTERS = [
  { t: 0, title: 'Pier', sub: 'DDG-51 · alongside' },
  { t: 18, title: 'X-ray', sub: 'Engine rooms · shafts' },
  { t: 40, title: 'Exploded', sub: 'Main assemblies' },
  { t: 70, title: 'Underway', sub: 'Harbour · out and back' },
  { t: 110, title: 'Replenish', sub: 'Mk 41 · aft launcher' },
  { t: 150, title: 'Loop', sub: 'Scan' },
];
/* monotone cubic through (xs, ys), end slopes from the end secants */
function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) if (d[i - 1] * d[i] > 0) { const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i]; m[i] = 3 * (h0 + h1) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]); }
  const f = t => {
    if (t <= xs[0]) return ys[0] + m[0] * (t - xs[0]); if (t >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (t - xs[n - 1]);
    let i = 0; while (xs[i + 1] < t) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return ys[i] * (2 * u3 - 3 * u2 + 1) + m[i] * h * (u3 - 2 * u2 + u) + ys[i + 1] * (3 * u2 - 2 * u3) + m[i + 1] * h * (u3 - u2);
  };
  return f;
}
/* sim time: real time alongside, a harbour ride at about x9, the loop at sea and the return in
   time-lapse, the reload at x10, real time again for the scan */
const T_GO = 72.5, S_GO = T_GO;
const T_ENTR = H.runTimeAtS(H.sAtZ(1150));
const CRANE_S = 290;
const MK = [[0, 0], [60, 60], [71, 71], [T_GO, T_GO]];
{ let s = T_GO; MK.push([99.5, s += T_ENTR], [107, s += H.RUN.dur - T_ENTR], [110, s += H.TWIST], [114.5, s += H.ASTERN], [117.5, s += 26], [146.5, s += CRANE_S], [151, s += 17], [160, s += 9]); }
const SIM = monotone(MK.map(m => m[0]), MK.map(m => m[1]));
const S_TOT = SIM(DUR);
const S_BERTH = MK.find(m => m[0] === 114.5)[1];
const RATE = T => (SIM(T + .015) - SIM(T - .015)) / .03;
// periodic motion stays loop-exact: the period is nudged so a whole number fits the film's sim time
const loopPh = (S, period) => TAU * S / (S_TOT / Math.max(1, Math.round(S_TOT / period)));
/* integrated display angle (as drawn: capped so blades never strobe), whole turns per loop */
function spinTable(omega, sym) {
  const N = DUR * 60, A = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) { const t = (k - .5) / 60; A[k] = A[k - 1] + omega(t) / 60; }
  const turns = Math.round(A[N] / sym) * sym || sym, sc = turns / A[N];
  return T => { const x = (((T % DUR) + DUR) % DUR) * 60, k = Math.min(N - 1, Math.floor(x)); return (A[k] + (A[k + 1] - A[k]) * (x - k)) * sc; };
}

/* ---------- the ship's pose ---------- */
const ROUTE = S => H.routePose(S - S_GO);
function shipPose(T, S) {
  const q = ROUTE(S), rate = Math.max(1, RATE(T)), damp = Math.min(1, 1.6 / rate);
  const sea = E.ss(900, 1500, q.z) * E.ss(0, 3, Math.abs(q.v) + (q.mode === 1 ? 1 : 0));
  const roll = (.12 + 1.3 * sea) * DEG * damp * Math.sin(loopPh(S, 9.4)), pitch = (.05 + .45 * sea) * DEG * damp * Math.sin(loopPh(S, 6.7) + 1.1);
  const W = X.make(R.mul(R.y(q.h), R.mul(R.x(pitch), R.z(roll))), [q.x, .08 * Math.sin(loopPh(S, 7.3)) * damp, q.z]);
  return { W, H: X.make(R.y(q.h), [q.x, 0, q.z]), q };
}

/* ---------- clouds: stride-6 (xyz, normal), bucketed into cells with bounding spheres,
   several levels of detail per cell (near metal fine, far metal coarse) ---------- */
function cloudOf(pts, sp, cs) {
  const n = pts.length / 6; cs = cs || 1.2;
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = (Math.floor(pts[i * 6] / cs) + 512) * 1048576 + (Math.floor(pts[i * 6 + 1] / cs) + 512) * 1024 + (Math.floor(pts[i * 6 + 2] / cs) + 512);
    let g = groups.get(k); if (!g) { g = []; groups.set(k, g); } g.push(i);
  }
  const P2 = new Float32Array(n * 6), CH = new Float32Array(groups.size * 6); let o = 0, c = 0;
  for (const g of groups.values()) {
    const i0 = o; let mx = 0, my = 0, mz = 0;
    for (const i of g) { for (let q = 0; q < 6; q++) P2[o * 6 + q] = pts[i * 6 + q]; mx += pts[i * 6]; my += pts[i * 6 + 1]; mz += pts[i * 6 + 2]; o++; }
    mx /= g.length; my /= g.length; mz /= g.length;
    let rr = 0; for (let k = i0; k < o; k++) rr = Math.max(rr, Math.hypot(P2[k * 6] - mx, P2[k * 6 + 1] - my, P2[k * 6 + 2] - mz));
    CH.set([i0, o, mx, my, mz, rr + .01], c * 6); c++;
  }
  return { pts: P2, n, sp, ch: CH, nch: c };
}
function lodCloud(levels, cs) {
  cs = cs || 1.1;
  const nl = levels.length, cells = new Map();
  levels.forEach((L, li) => {
    const P = L.pts, n = P.length / 6;
    for (let i = 0; i < n; i++) {
      const k = (Math.floor(P[i * 6] / cs) + 512) * 1048576 + (Math.floor(P[i * 6 + 1] / cs) + 512) * 1024 + (Math.floor(P[i * 6 + 2] / cs) + 512);
      let c = cells.get(k); if (!c) { c = levels.map(() => []); cells.set(k, c); } c[li].push(i);
    }
  });
  const lv = levels.map(L => new Float32Array(L.pts.length)), SD = 4 + 2 * nl, CH = new Float32Array(cells.size * SD), o = new Array(nl).fill(0);
  let c = 0;
  for (const cell of cells.values()) {
    let mx = 0, my = 0, mz = 0, m = 0;
    cell.forEach((idx, li) => { const P = levels[li].pts; for (const i of idx) { mx += P[i * 6]; my += P[i * 6 + 1]; mz += P[i * 6 + 2]; m++; } });
    mx /= m; my /= m; mz /= m;
    let rr = 0;
    cell.forEach((idx, li) => {
      const P = levels[li].pts, D = lv[li], i0 = o[li];
      for (const i of idx) { for (let q = 0; q < 6; q++) D[o[li] * 6 + q] = P[i * 6 + q]; rr = Math.max(rr, Math.hypot(P[i * 6] - mx, P[i * 6 + 1] - my, P[i * 6 + 2] - mz)); o[li]++; }
      CH[c * SD + 4 + li * 2] = i0; CH[c * SD + 5 + li * 2] = o[li];
    });
    CH[c * SD] = mx; CH[c * SD + 1] = my; CH[c * SD + 2] = mz; CH[c * SD + 3] = rr + .01;
    c++;
  }
  let np = 0; for (const L of lv) np += L.length / 6;
  return { lv, sp: levels.map(L => L.sp), ch: CH, nch: c, sd: SD, nl, np };
}
const catF = arrs => { let n = 0; for (const a of arrs) n += a.length; const o = new Float32Array(n); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return o; };
const xfPts = (P, T) => { const o = new Float32Array(P.length); for (let i = 0; i < P.length; i += 6) { const q = X.ap(T, [P[i], P[i + 1], P[i + 2]]), n = X.dir(T, [P[i + 3], P[i + 4], P[i + 5]]); o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2]; o[i + 3] = n[0]; o[i + 4] = n[1]; o[i + 5] = n[2]; } return o; };
/* prims at each level (fine detail only in the first two) */
const lodPrims = (prims, levels, seed, cs) => lodCloud(levels.map((sp, li) => ({ sp, pts: SM.sampleP(prims, sp, seed + li * 7, li >= 2 ? { fine: false } : undefined) })), cs);
const lodFn = (fn, levels, seed, cs) => lodCloud(levels.map((sp, li) => ({ sp, pts: fn(sp, seed + li * 7, li) })), cs);

const LV = {
  shell: [.13, .26, .52, 1.04, 2.08], part: [.045, .09, .18, .36, .72], mach: [.03, .06, .12, .24, .48], shaft: [.045, .09, .18, .36, .72], gt: [.03, .06, .12, .24, .48],
  rot: [.012, .024, .048, .096, .192], block: [.12, .24, .48, .96, 1.92], trunk: [.08, .16, .32, .64, 1.28], can: [.03, .06, .12, .24, .48], crane: [.09, .18, .36, .72, 1.44], prop: [.018, .036, .072, .144, .288],
};
const t0load = performance.now();

/* ---------- the destroyer, partitioned into the assemblies the exploded view pulls apart ---------- */
const DDM = HD.destroyer();
const DST = { sps: 0, gunYaw: 0, gunPitch: 0, ciwsSpin: 0, vlsOpen: [], hangar: 0 };
const SHELL_PARTS = new Set(['hull', 'super', 'arms', 'spy', 'stacks', 'decoys', 'deck', 'rails', 'hangar']);
function classify(pn, x, y, z) {
  switch (pn) {
    case 'hull': case 'rails': return z > 42 ? 'bow' : z < -53 ? 'stern' : 'hullMid';
    case 'arms': return z > 42 ? 'bow' : z < -53 ? 'stern' : y > 9.6 ? 'stacks' : 'hullMid';
    case 'super': return z < -33.8 ? 'hangar' : z < 1.5 ? 'stacks' : 'superF';
    case 'spy': return 'superF';
    case 'stacks': case 'decoys': return 'stacks';
    case 'deck': return 'stern';
    case 'hangar': return 'hdoor';
    case 'boats': return x > 0 ? 'boatsS' : 'boatsP';
    default: return pn;
  }
}
/* the four cells the crane loads: aft launcher, forward half of module 1, outboard column */
const LOADED = [32, 40, 48, 56].map((id, k) => { const p = DA.vls(id); return { id, k, x: p[0], y: p[1], z: p[2], hinge: [p[0] - .3, p[1] + .02, p[2]] }; });
/* module 1 of the aft launcher (port, forward): the eight cells the reload shows through the X-ray */
const MOD1 = [32, 33, 40, 41, 48, 49, 56, 57];
const inLoadedHatch = (x, y, z) => LOADED.some(c => Math.abs(x - c.x) < .32 && Math.abs(z - c.z) < .32 && y > c.y - .1);
const BUCK = {};
const bucket = (a, li) => (BUCK[a] || (BUCK[a] = [[], [], [], [], []]))[li];
for (let li = 0; li < 5; li++) {
  for (const part of DDM.parts) {
    if (part.name === 'sps') continue;
    const sp = LV[SHELL_PARTS.has(part.name) ? 'shell' : 'part'][li];
    const S0 = GEO.sample({ parts: [part] }, sp, 100 + li * 13 + part.name.length * 7, DST, li >= 2 ? { fine: false } : undefined)[0];
    const Tf = GEO.partXf(X.make(), part, DST), P = S0.pts;
    for (let i = 0; i < P.length; i += 6) {
      const q = X.ap(Tf, [P[i], P[i + 1], P[i + 2]]), n = X.dir(Tf, [P[i + 3], P[i + 4], P[i + 5]]);
      if (part.name === 'vlsA' && inLoadedHatch(q[0], q[1], q[2])) continue;
      bucket(classify(part.name, q[0], q[1], q[2]), li).push(q[0], q[1], q[2], n[0], n[1], n[2]);
    }
  }
  // the underwater body, a little coarser than the topsides
  const U = SM.underwater(LV.shell[li] * 1.25, 60 + li);
  for (let i = 0; i < U.length; i += 6) { const z = U[i + 2]; bucket(z > 42 ? 'bow' : z < -53 ? 'stern' : 'hullMid', li).push(U[i], U[i + 1], U[i + 2], U[i + 3], U[i + 4], U[i + 5]); }
}
/* intake louvres on the stack sides: slats the lens flies in through (stacks assembly, always seen) */
function louvres(sp) {
  const out = [];
  for (const zc of SM.STACK_Z) for (const s of [-1, 1]) {
    const y0 = 10.3, y1 = 21.6, xb = 2.6, xt = 2.05;
    for (let y = 15.95; y < 20.2; y += .14) {
      const x = s * (xb + (xt - xb) * (y - y0) / (y1 - y0) + .03);
      for (let z = zc - 3.2; z < zc + 1.68; z += sp) { out.push(x, y, z, s, .15, 0); out.push(x - s * .06, y - .05, z, s, -.3, 0); }
    }
    for (const y of [15.95, 20.2]) for (let z = zc - 3.2; z < zc + 1.68; z += sp * .6) { const x = s * (xb + (xt - xb) * (y - y0) / (y1 - y0) + .04); out.push(x, y, z, s, 0, 0); }
  }
  return new Float32Array(out);
}
const ASM_DEF = [
  // name, class, exploded offset (ship frame, m), when it leaves (0..1), level set, cell size
  ['hullMid', 'shell', [0, 0, 0], 0], ['bow', 'shell', [0, 0, 20], .44], ['stern', 'shell', [0, 0, -18], .44],
  ['superF', 'shell', [0, 22, 4], .06], ['stacks', 'shell', [0, 24, -2], .16], ['hangar', 'shell', [0, 17, -8], .36], ['hdoor', 'shell', [0, 17, -8], .36],
  ['mast', 'part', [0, 25, 6], 0], ['gun', 'part', [0, 11, 22], .24], ['vlsF', 'part', [0, 14, 6], .28], ['vlsA', 'part', [0, 15, 0], .32],
  ['ciwsF', 'part', [0, 27, 8], .12], ['ciwsA', 'part', [0, 25, -10], .38], ['boatsS', 'part', [12, 8, 0], .2], ['boatsP', 'part', [-12, 8, 0], .2],
];
const ASM = {};
for (const [name, cls, off, w0] of ASM_DEF) {
  const lvs = BUCK[name].map((a, li) => ({ sp: LV[cls === 'shell' ? 'shell' : 'part'][li], pts: new Float32Array(a) }));
  ASM[name] = { name, cls, off, w0, cl: lodCloud(lvs, cls === 'shell' ? 2.6 : 1.3) };
}
const addAsm = (name, cls, off, w0, cl) => (ASM[name] = { name, cls, off, w0, cl });
addAsm('louvres', 'part', [0, 24, -2], .16, lodFn(sp => louvres(sp), [.02, .04, .12, .36, .96], 7, 1.2));
/* machinery, shafts, blocks below deck */
const GTM = SM.lm2500();
const GT_STAT = lodPrims(GTM.stat, LV.gt, 200, .9), GT_ROT = lodPrims(GTM.rot.slice(0, 2), LV.rot, 210, .5), GT_ROT2 = lodPrims(GTM.rot.slice(2), LV.rot, 215, .5), GT_PT = lodPrims(GTM.pt, LV.rot, 220, .5);
addAsm('mach', 'hidden', [0, 12, 0], .5, lodPrims(SM.MRGS.flatMap(m => SM.mrg(m)), LV.mach, 230, 1.0));
addAsm('trunks', 'hidden', [0, 12, 0], .5, lodPrims(SM.trunks(), LV.trunk, 240, 1.6));
{ const P = SM.shafts(), inP = [], outP = [];
  for (const pr of P) { const c = pr.t === 'lathe' ? pr.a : pr.p ? pr.p[0] : [0, 0, 0]; (c[2] < SM.STERN_TUBE_Z - .4 ? outP : inP).push(pr); }
  addAsm('shaftIn', 'hidden', [0, -9, -4], .56, lodPrims(inP, LV.shaft, 250, 1.2));
  addAsm('shaftOut', 'part', [0, -9, -4], .56, lodPrims(outP, LV.shaft, 260, 1.2)); }
addAsm('vlsBF', 'hidden', [0, 14, 6], .28, lodPrims(SM.vlsBlock(true), LV.block, 270, 1.4));
addAsm('vlsBA', 'hidden', [0, 15, 0], .32, lodPrims(SM.vlsBlock(false), LV.block, 280, 1.4));
addAsm('rooms', 'hidden', [0, 0, 0], 0, lodFn(sp => SM.rooms(sp), [.5, 1, 2, 4, 8], 290, 3));
const PROP_S = lodFn((sp, sd) => SM.propeller(sp, sd, false), LV.prop, 300, .8), PROP_P = lodFn((sp, sd) => SM.propeller(sp, sd, true), LV.prop, 300, .8);
const RUD = lodFn((sp, sd) => SM.rudder(sp, sd), LV.mach.map(v => v * 1.6), 310, 1);
const SPS = lodCloud(LV.part.map((sp, li) => ({ sp, pts: GEO.sample({ parts: [DDM.parts.find(p => p.name === 'sps')] }, sp, 320 + li, DST, li >= 2 ? { fine: false } : undefined)[0].pts })), .8);
const HELO = (() => { const m = SM.heloFolded(); return lodCloud(LV.part.map((sp, li) => ({ sp, pts: catF(GEO.sample(m, sp, 330 + li, {}, li >= 2 ? { fine: false } : undefined).map(s => s.pts)) })), .9); })();
const HATCH = lodFn(sp => { const o = []; for (let x = sp * .5; x < .6; x += sp) for (let z = -.3 + sp * .5; z < .3; z += sp) o.push(x, .04, z, 0, 1, 0); for (let x = 0; x < .6; x += sp * .5) for (const z of [-.3, .3]) o.push(x, .06, z, 0, 1, 0); return new Float32Array(o); }, [.02, .04, .08, .16, .32], 340, .5);
const CANM = lodPrims(SM.canister(), LV.can, 350, .8);
const RINGS = { f: cloudOf(SM.sectionRing(42, .12), .12, 3), a: cloudOf(SM.sectionRing(-53, .12), .12, 3) };
/* the pier crane */
const CRN = { portal: lodPrims(SM.cranePortal(), LV.crane, 400, 2), house: lodPrims(SM.craneHouse(), LV.crane, 410, 2), boom: lodPrims(SM.craneBoom(), LV.crane, 420, 2), hook: lodPrims(SM.craneHook(), LV.can, 430, .8) };
const CRANE_O = [-19.25, H.DECK_Y, -29.4];
/* sister ships: the whole ship baked coarse */
const SISTER = (() => {
  const lv = [.5, 1, 2, 4].map((sp, li) => {
    const arrs = [];
    for (const a of Object.values(ASM)) { if (a.cls === 'hidden') continue; const k = Math.min(a.cl.nl - 1, [2, 3, 4, 4][li]); arrs.push(a.cl.lv[k]); }
    return { sp, pts: catF(arrs) };
  });
  return lodCloud(lv, 6);
})();
let NPTS = 0; for (const a of Object.values(ASM)) NPTS += a.cl.np;
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms, ship pts ${NPTS}`);

/* ---------- the strike's fronts: branching through the steel from the mast top ---------- */
const TB = .4;                                          // film T of the return stroke
const MAST_TOP = V.add(DA.mastTop, [0, .3, 0]);
const XR = (() => {
  const Hv = 1.0, key = (ix, iy, iz) => ((ix + 400) * 1024 + (iy + 400)) * 1024 + (iz + 400);
  const map = new Map(), nodes = [];
  const add = P => { for (let i = 0; i < P.length; i += 6) { const ix = Math.floor(P[i] / Hv), iy = Math.floor(P[i + 1] / Hv), iz = Math.floor(P[i + 2] / Hv), k = key(ix, iy, iz); if (!map.has(k)) { map.set(k, nodes.length); nodes.push({ ix, iy, iz, p: [P[i], P[i + 1], P[i + 2]] }); } } };
  for (const a of Object.values(ASM)) if (a.cls !== 'hidden') add(a.cl.lv[Math.min(2, a.cl.nl - 1)]);
  add(SPS.lv[2]);
  const NN = nodes.length, rr = rng(4711), cost = new Float32Array(NN); for (let i = 0; i < NN; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
  const t = new Float64Array(NN).fill(1e9), par = new Int32Array(NN).fill(-1), heap = [];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let best = 0, bd = 1e9; nodes.forEach((nd, i) => { const d = V.dist(nd.p, MAST_TOP); if (d < bd) { bd = d; best = i; } });
  t[best] = 0; push(0, best);
  while (heap.length) {
    const [d, i] = pop(); if (d > t[i]) continue; const a = nodes[i];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      if (!dx && !dy && !dz) continue; const j = map.get(key(a.ix + dx, a.iy + dy, a.iz + dz)); if (j === undefined) continue;
      const d2 = d + V.dist(a.p, nodes[j].p) * cost[j]; if (d2 < t[j]) { t[j] = d2; par[j] = i; push(d2, j); }
    }
  }
  let tMax = 0; for (let i = 0; i < NN; i++) if (t[i] < 1e8) tMax = Math.max(tMax, t[i]);
  // film seconds after the stroke; quick down the mast, slower out along the hull
  const SPAN = 7.6, ts = new Float32Array(NN); for (let i = 0; i < NN; i++) ts[i] = t[i] > 1e8 ? SPAN : SPAN * Math.pow(t[i] / tMax, 1.3);
  const jr = rng(99);
  function rtAt(x, y, z) {
    const ix = Math.floor(x / Hv), iy = Math.floor(y / Hv), iz = Math.floor(z / Hv);
    let v = map.get(key(ix, iy, iz));
    for (let rad = 1; v === undefined && rad <= 3; rad++) for (let dx = -rad; dx <= rad && v === undefined; dx++) for (let dy = -rad; dy <= rad && v === undefined; dy++) for (let dz = -rad; dz <= rad && v === undefined; dz++) v = map.get(key(ix + dx, iy + dy, iz + dz));
    return v === undefined ? SPAN : ts[v];
  }
  function rtFor(P) { const out = new Float32Array(P.length / 6); for (let i = 0, j = 0; j < P.length; i++, j += 6) out[i] = rtAt(P[j], P[j + 1], P[j + 2]) + jr() * .06; return out; }
  return { nodes, ts, par, SPAN, rtFor, rtAt };
})();
for (const a of Object.values(ASM)) if (a.cls !== 'hidden') a.cl.rt = a.cl.lv.map(P => XR.rtFor(P));
SPS.rt = SPS.lv.map(P => XR.rtFor(P));
const RT_PROP = XR.rtAt(4, -1.5, -62), RT_RUD = XR.rtAt(4, -1.2, -70), RT_HATCH = XR.rtAt(-3.5, 6.2, -27.5);
LOG.push(`xr nodes ${XR.nodes.length}, load ${(performance.now() - t0load).toFixed(0)} ms`);
/* the bolt: a stepped leader pours down out of the cloud base onto the whip, then the return stroke */
const BOLT = (() => {
  const rr = rng(1402), hit = MAST_TOP;
  const disp = (a, b, depth, rough) => { let pts = [a, b]; for (let d = 0; d < depth; d++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = V.dist(p, q), m = V.lerp(p, q, .5); out.push([m[0] + (rr() - .5) * l * rough, m[1] + (rr() - .5) * l * rough * .35, m[2] + (rr() - .5) * l * rough], q); } pts = out; } return pts; };
  const main = disp(V.add(hit, [-20, 82, 32]), hit, 8, .6);
  const br = [];
  for (let k = 0; k < 16; k++) {
    const i = 6 + Math.floor(rr() * main.length * .82), s = main[i];
    const dir = V.norm(V.add(V.sub(main[Math.min(main.length - 1, i + 4)], s), [(rr() - .5) * 60, -rr() * 10, (rr() - .5) * 60]));
    br.push({ at: i / main.length, pts: disp(s, V.mad(s, dir, 10 + rr() * 26), 5, .5), w: .35 + .5 * rr() });
  }
  const sp = []; for (let i = 0; i < 360; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = 4 + rr() * 16, h = Math.sqrt(1 - u * u); sp.push([Math.cos(a) * h * s, Math.abs(u) * s * .7 + 3, Math.sin(a) * h * s, .45 + rr() * .9]); }
  return { hit, main, br, sp, lead: 1.1 };
})();
/* film time relative to the stroke, across the seam: the leader starts in the loop chapter */
const tStrike = T => (T > 150 ? T - DUR : T) - TB;

/* ---------- choreography ---------- */
/* X-ray: one slice sweeps bow -> stern and opens the steel, a second closes it */
const XO0 = 18.6, XO1 = 22.6, XC0 = 64.4, XC1 = 68.4, ZF_ = 82, ZA_ = -84;
const openZ = T => T < XO0 ? 99 : T > XO1 ? -99 : ZF_ + (ZA_ - ZF_) * E.inOut(E.sat((T - XO0) / (XO1 - XO0)));
const shutZ = T => T < XC0 ? 99 : T > XC1 ? -99 : ZF_ + (ZA_ - ZF_) * E.inOut(E.sat((T - XC0) / (XC1 - XC0)));
const XRAY = T => T > XO0 - .1 && T < XC1 + .1;
const ghostK = T => E.ss(18.4, 21.5, T) * (1 - E.ss(65.5, 69.5, T));
/* exploded view: each assembly leaves at its w0 and comes home in the reverse order */
const EXO = 42.6, EXO_D = 5.2, EXB = 56.6, EXB_D = 4.8;
function explodeK(w0, T) {
  if (T < EXO || T > EXB + EXB_D * 1.6) return 0;
  const o = E.inOut(E.sat(((T - EXO) / EXO_D - w0 * .8) / .55)), b = E.inOut(E.sat(((T - EXB) / EXB_D - (.6 - w0) * .8) / .55));
  return o * (1 - b);
}
const EXTRA = { props: [[0, -9, -4], .56], rudders: [[0, -5, -16], .5], helo: [[0, 3.6, -21], .4] };
/* ch5: the crane reload, keyed in film time */
const CYC = 7.2, CT0 = 117.8;
const cycT0 = k => CT0 + k * CYC;
const SEAT = k => cycT0(k) + 6.6;
const hatchOpen = (k, T) => E.inOut(E.sat((T - 116.2 - k * .25) / 1.1)) * (1 - E.inOut(E.sat((T - 146.7 - k * .3) / 1.1)));
const PIER_CAN = k => ({ top: [-33.4 + k * .95, H.DECK_Y + .3 + SM.CAN.W / 2, -24.4] });
const HOOK_OFF = 1.6;
const toCL = p => V.sub(p, CRANE_O);
const PARK = [0, 14, -29];
const CK = (() => {
  const K = [[-50, PARK], [116.6, PARK]];
  for (let k = 0; k < 4; k++) {
    const t0 = cycT0(k), top = PIER_CAN(k).top, c = LOADED[k];
    const A0 = toCL([top[0], top[1], top[2] + HOOK_OFF]);
    K.push([t0 + 1.25, V.add(A0, [0, 3.2, 0])], [t0 + 1.6, A0], [t0 + 3.0, toCL([top[0], top[1] + SM.CAN.L + HOOK_OFF, top[2]])]);
    K.push([t0 + 3.8, toCL([top[0], 18.4, top[2]])], [t0 + 5.2, toCL([c.x, c.y + 1.0 + SM.CAN.L + HOOK_OFF, c.z])], [t0 + 6.6, toCL([c.x, c.y - SM.CAN.SEAT + HOOK_OFF, c.z])], [t0 + 7.0, toCL([c.x, c.y - SM.CAN.SEAT + HOOK_OFF, c.z])]);
  }
  const c = LOADED[3];
  K.push([148.2, toCL([c.x, 14, c.z])], [151.2, PARK], [400, PARK]);
  K.forEach(k => { k.cy = [Math.atan2(k[1][0], k[1][2]), Math.hypot(k[1][0], k[1][2]), k[1][1]]; });
  for (let i = 1; i < K.length; i++) { let d = K[i].cy[0] - K[i - 1].cy[0]; while (d > PI) d -= TAU; while (d < -PI) d += TAU; K[i].cy[0] = K[i - 1].cy[0] + d; }
  return K;
})();
/* upend: the hook lifts the canister's top end, its foot slides along the dunnage until it hangs */
function upend(k, u) {
  const top0 = PIER_CAN(k).top, L = SM.CAN.L, h = L * u, run = Math.sqrt(Math.max(0, L * L - h * h));
  const top = [top0[0], top0[1] + h, top0[2]], axis = [0, h / L, run / L];
  return { top, axis, hook: V.mad(top, axis, HOOK_OFF) };
}
function craneAt(T) {
  for (let k = 0; k < 4; k++) { const t0 = cycT0(k); if (T >= t0 + 1.6 && T < t0 + 3.0) { const u = E.inOut(E.sat((T - t0 - 1.6) / 1.4)), q = upend(k, u); return Object.assign(SM.craneSolve(toCL(q.hook)), { hook: toCL(q.hook) }); } }
  let i = 0; while (i < CK.length - 2 && CK[i + 1][0] <= T) i++;
  const a = CK[i].cy, b = CK[i + 1].cy, u = E.inOut(E.sat((T - CK[i][0]) / (CK[i + 1][0] - CK[i][0])));
  const th = E.mix(a[0], b[0], u), rho = E.mix(a[1], b[1], u), hy = E.mix(a[2], b[2], u);
  const hook = [Math.sin(th) * rho, hy, Math.cos(th) * rho];
  return Object.assign(SM.craneSolve(hook), { hook });
}
/* where canister k is: 'pier' (on the dunnage), 'up' (upending), 'hook', 'cell' */
function canState(k, T) {
  const t0 = cycT0(k);
  if (T >= SEAT(k) || T < 104) return 'cell';
  if (T < t0 + 1.6) return 'pier';
  if (T < t0 + 3.0) return 'up';
  return 'hook';
}
function canXf(k, T, SW) {
  const st = canState(k, T), c = LOADED[k];
  if (st === 'cell') return X.mul(SW, X.make(R.I(), [c.x, c.y - SM.CAN.SEAT, c.z]));
  let top, axis;
  if (st === 'pier') { top = PIER_CAN(k).top; axis = [0, 0, 1]; }
  else if (st === 'up') { const t0 = cycT0(k), q = upend(k, E.inOut(E.sat((T - t0 - 1.6) / 1.4))); top = q.top; axis = q.axis; }
  else { const cr = craneAt(T); top = V.add(V.add(cr.hook, CRANE_O), [0, -HOOK_OFF, 0]); axis = [0, 1, 0]; }
  const xa = [1, 0, 0], za = V.cross(xa, axis);
  return X.make([xa[0], axis[0], za[0], xa[1], axis[1], za[1], xa[2], axis[2], za[2]], top);
}

/* ---------- camera ---------- */
const cam = new Cam(); cam.cy = 470;
const SHIPV = s => ({ f: 's', v: s });
/* keys: world ('w') or in the ship's heading frame ('s', rides along with her); cubic Hermite
   through the keys as they stand at the current moment */
const K = (t, eye, target, fov, o) => Object.assign({ t, eye, target, fov, roll: 0, f: 'w' }, o || {});
const KS = (t, eye, target, fov, o) => K(t, eye, target, fov, Object.assign({ f: 's' }, o || {}));
const OPEN_EYE = [132, 25, 92], OPEN_TGT = [0, 27, -6];
const KEYS = [
  // 1 · Pier: the scan pours down; a slow push along the starboard bow
  K(0, OPEN_EYE, OPEN_TGT, 47),
  K(8, [128, 26, 82], [2, 21, -2], 44),
  K(15.5, [118, 28, 66], [3, 17, 6], 44),
  // 2 · X-ray: the slice runs bow to stern with the whole ship in frame; then in to the forward stack's intake louvres
  K(20.5, [124, 30, 62], [0, 12, 6], 46),
  K(22.7, [40, 21, 14], [2.2, 17.4, 1.6], 42),
  K(24.1, [9.5, 18.8, 1.2], [2.2, 18.0, 1.8], 46),
  K(24.9, [3.0, 18.3, 2.4], [1.2, 17.4, 3.0], 58),
  K(25.6, [1.9, 17.9, 3.1], [2.6, 12, 6.4], 70),
  K(26.8, [4.3, 13.5, 6.0], [3.0, 2, 7.8], 70),
  K(27.8, [4.4, 4.5, 9.2], [3.0, -2, 7.4], 70),
  K(28.6, [3.4, .2, 9.4], [3.0, -2.4, 5], 64),
  K(29.4, [3.0, -2.35, 7.9], [3.0, -2.4, 4.5], 60),
  K(30.2, [3.0, -2.4, 7.4], [3.0, -2.4, 4.5], 62),
  K(31.2, [7.2, 1.2, 9.6], [2.0, -2.8, 1.5], 60),
  K(32.3, [8.6, 5.2, 3.4], [.8, -3.0, -6.5], 58),
  K(33.3, [4.6, .4, -2.6], [1.1, -3.6, -6.0], 60),
  K(34.3, [2.3, -2.4, -8.6], [2.5, -3.8, -18], 66),
  K(35.4, [2.4, -2.8, -19], [3.2, -4.1, -38], 70),
  K(36.6, [2.9, -3.3, -33], [3.8, -4.4, -58], 68),
  K(37.5, [3.5, -3.6, -44.5], [4.0, -4.6, -62], 62),
  K(38.4, [7.4, -3.0, -55.8], [4.0, -4.6, -62.8], 56),
  K(39.4, [12.5, -5.8, -70], [1.5, -4, -61], 54),
  K(41.2, [48, 4, -118], [0, 2, -40], 50),
  // 3 · Exploded: a slow arc along the starboard side, well clear of the pieces
  K(43.6, [142, 50, -112], [0, 18, -8], 44),
  K(50, [168, 48, -34], [0, 20, 0], 42),
  K(57, [166, 46, 34], [0, 20, 2], 42),
  K(63, [146, 40, 96], [0, 15, 0], 42),
  K(67.5, [118, 30, 86], [0, 13, 0], 42),
  // 4 · Underway: she leaves the pier; ride her starboard side, the radar close, over the bow, astern out of the harbour
  K(71.5, [100, 22, 14], [0, 12, 0], 42),
  K(74.5, [74, 15, -58], [0, 11, -2], 42),
  KS(79, [48, 13, -52], [0, 11, 6], 44),
  KS(84.5, [34, 36, 52], [0, 30, 19], 28),
  KS(90, [-14, 34, 102], [0, 8, -8], 46),
  KS(92.6, [-52, 42, 18], [0, 12, -16], 48),
  KS(95, [22, 48, -150], [0, -6, 40], 48),
  KS(98.5, [30, 120, -330], [0, 0, 200], 50),
  // time-lapse: the whole harbour from high over the south-east; the loop at sea; back down to the berth
  K(102.5, [1450, 1180, -1500], [-120, 0, 780], 44),
  K(108.5, [1250, 1000, -1250], [-80, 0, 520], 44),
  K(112, [320, 240, -380], [0, 0, 40], 42),
  K(115, [60, 70, -130], [-10, 5, -30], 43),
  // 5 · Replenish: high on the starboard beam, the laydown across the deck; up and over to the pier side,
  // above the crane's rail, looking down into the aft launcher as the module fills
  K(117.8, [44, 42, 2], [-13, 7, -27], 44),
  K(123.5, [12, 60, -12], [-10, 6, -27], 44),
  K(128.5, [-20, 38, 2], [-9, 6, -28], 45),
  K(134, [-30, 26, 4], [-8, 6, -28], 46),
  K(140, [-33, 22, -1], [-7, 5, -28], 45),
  K(145.5, [-29, 27, 6], [-8, 6, -27], 46),
  // 6 · Loop: up and round the stern to the opening frame
  K(149.5, [-42, 52, -24], [-4, 9, -20], 46),
  K(153, [58, 52, -50], [-2, 14, -12], 44),
  K(156, [128, 30, 40], [0, 22, -4], 45),
];
KEYS.push(Object.assign({}, KEYS[0], { t: DUR }));
function camAt(T, SH) {
  const n = KEYS.length, L = DUR;
  const ev = (k, f) => { const v = k[f]; return k.f === 's' ? X.ap(SH, v) : v; };
  const at = i => { const m = n - 1, j = ((i % m) + m) % m, cyc = Math.floor(i / m); return { k: KEYS[j], t: KEYS[j].t + cyc * L }; };
  let i = 0; while (i < n - 2 && KEYS[i + 1].t <= T) i++;
  const a = at(i), b = at(i + 1), dt = b.t - a.t, u = E.clamp((T - a.t) / dt, 0, 1);
  const tan = (j, f) => { const p = at(j - 1), q = at(j + 1), va = f === 'fov' || f === 'roll' ? p.k[f] : ev(p.k, f), vb = f === 'fov' || f === 'roll' ? q.k[f] : ev(q.k, f), d = q.t - p.t; return Array.isArray(va) ? [0, 1, 2].map(c => (vb[c] - va[c]) / d) : (vb - va) / d; };
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const out = {};
  for (const f of ['eye', 'target', 'fov', 'roll']) {
    const va = f === 'fov' || f === 'roll' ? a.k[f] : ev(a.k, f), vb = f === 'fov' || f === 'roll' ? b.k[f] : ev(b.k, f), ma = tan(i, f), mb = tan(i + 1, f);
    out[f] = Array.isArray(va) ? [0, 1, 2].map(c => va[c] * h00 + ma[c] * dt * h10 + vb[c] * h01 + mb[c] * dt * h11) : va * h00 + ma * dt * h10 + vb * h01 + mb * dt * h11;
  }
  out.fov *= DEG; out.roll *= DEG;
  return out;
}

/* ---------- raster ---------- */
const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
const pb = new PointBuf(cv, [11, 12, 10], { vignette: .62 });
const LIME = [198, 244, 50], WH = [238, 238, 228];
const LK = H.L;
let C = cam, BD = pb.d, BW = 1920, BH = 1080;
function dot(x, y, s, r, g, b, a) {
  const R_ = r * a, G_ = g * a, B_ = b * a, d = BD;
  if (s === 1) {
    const xi = x | 0, yi = y | 0; if (xi < 0 || yi < 0 || xi >= BW || yi >= BH) return;
    const i = (yi * BW + xi) << 2; if (d[i] < R_) d[i] = R_; if (d[i + 1] < G_) d[i + 1] = G_; if (d[i + 2] < B_) d[i + 2] = B_; return;
  }
  const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
  if (x0 < 0 || y0 < 0 || x0 + s > BW || y0 + s > BH) return;
  let i = (y0 * BW + x0) << 2; const step = (BW - s) << 2;
  for (let j = 0; j < s; j++, i += step) for (let k = 0; k < s; k++, i += 4) { if (d[i] < R_) d[i] = R_; if (d[i + 1] < G_) d[i + 1] = G_; if (d[i + 2] < B_) d[i + 2] = B_; }
}
function dset(x, y, s, r, g, b, a) {
  const d = BD; const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
  if (x0 < 0 || y0 < 0 || x0 + s > BW || y0 + s > BH) return;
  for (let j = 0; j < s; j++) { let i = ((y0 + j) * BW + x0) << 2; for (let k = 0; k < s; k++, i += 4) { d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a; } }
}
const addDot = (x, y, s, r, g, b, a) => pb.add(x, y, s, r, g, b, a);
/* occlusion: the ship writes the depth of her own dots into a coarse 8 px grid (closed over its
   gaps); the harbour behind her is dimmed where she stands in front of it */
const OW = 240, OH = 135, OCC = new Float32Array(OW * OH), OCC1 = new Float32Array(OW * OH), OCCF = new Float32Array(OW * OH);
const OCM = new Uint8Array(OW * OH), OCM2 = new Uint8Array(OW * OH);
function occClose() {
  // min over 3x3 (separable), then keep only cells whose 3x3 neighbourhood is all covered
  for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) { let m = OCC[r + x]; if (x > 0 && OCC[r + x - 1] < m) m = OCC[r + x - 1]; if (x < OW - 1 && OCC[r + x + 1] < m) m = OCC[r + x + 1]; OCCF[r + x] = m; } }
  for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) { let m = OCCF[r + x]; if (y > 0 && OCCF[r - OW + x] < m) m = OCCF[r - OW + x]; if (y < OH - 1 && OCCF[r + OW + x] < m) m = OCCF[r + OW + x]; OCC1[r + x] = m; OCM[r + x] = m < 1e8 ? 1 : 0; } }
  for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) OCM2[r + x] = OCM[r + x] & (x > 0 ? OCM[r + x - 1] : 1) & (x < OW - 1 ? OCM[r + x + 1] : 1); }
  for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) OCCF[r + x] = OCM2[r + x] & (y > 0 ? OCM2[r - OW + x] : 1) & (y < OH - 1 ? OCM2[r + OW + x] : 1) ? OCC1[r + x] : 1e9; }
}
const occAt = (sx, sy) => OCCF[((sy | 0) >> 3) * OW + ((sx | 0) >> 3)];
const OCC_DIM = .2;

/* camera-space transform of a cloud: pc = A p + b; light, eye and world height in its own frame */
const XF = new Float64Array(30);
function prep(T) {
  const M = T.R, t = T.T, e = C.eye, f = C.f, r = C.r, u = C.u, x = XF;
  const tx = t[0] - e[0], ty = t[1] - e[1], tz = t[2] - e[2];
  for (let c = 0; c < 3; c++) { x[c] = r[0] * M[c] + r[1] * M[3 + c] + r[2] * M[6 + c]; x[3 + c] = u[0] * M[c] + u[1] * M[3 + c] + u[2] * M[6 + c]; x[6 + c] = f[0] * M[c] + f[1] * M[3 + c] + f[2] * M[6 + c]; }
  x[9] = r[0] * tx + r[1] * ty + r[2] * tz; x[10] = u[0] * tx + u[1] * ty + u[2] * tz; x[11] = f[0] * tx + f[1] * ty + f[2] * tz;
  for (let c = 0; c < 3; c++) { x[12 + c] = M[c] * LK[0] + M[3 + c] * LK[1] + M[6 + c] * LK[2]; x[15 + c] = -(M[c] * tx + M[3 + c] * ty + M[6 + c] * tz); }
  const F = C.fl, xr = (BW - C.cx - C.shake[0]) / F, xl = (C.cx + C.shake[0]) / F, yt = (C.cy + C.shake[1]) / F, yb = (BH - C.cy - C.shake[1]) / F;
  x[18] = xr; x[19] = 1 / Math.sqrt(1 + xr * xr); x[20] = xl; x[21] = 1 / Math.sqrt(1 + xl * xl); x[22] = yt; x[23] = 1 / Math.sqrt(1 + yt * yt); x[24] = yb; x[25] = 1 / Math.sqrt(1 + yb * yb);
  x[26] = M[3]; x[27] = M[4]; x[28] = M[5]; x[29] = t[1];
  return x;
}
function sphereIn(x, cx_, cy_, cz_, rad, near) {
  const zc = x[6] * cx_ + x[7] * cy_ + x[8] * cz_ + x[11];
  if (zc < near - rad) return false;
  const xc = x[0] * cx_ + x[1] * cy_ + x[2] * cz_ + x[9], yc = x[3] * cx_ + x[4] * cy_ + x[5] * cz_ + x[10];
  if ((xc - x[18] * zc) * x[19] > rad) return false;
  if ((-xc - x[20] * zc) * x[21] > rad) return false;
  if ((yc - x[22] * zc) * x[23] > rad) return false;
  if ((-yc - x[24] * zc) * x[25] > rad) return false;
  return true;
}
/* per-frame X-ray / scan state:
   zo, zs  the open and shut slices (ship z; the slices run bow -> stern, dir -1)
   stn     the fly-through's station ring (ship z) · solid  shell opacity inside the open region
   uw      brightness under the waterline · box  the local X-ray window of the reload (ship frame)
   tb, dk  seconds since the stroke (the fronts), decay of the scan toward the next one */
const XS = { zo: 99, zs: 99, dir: -1, stn: -99, solid: 0, uw: .55, box: new Float64Array([-11, -1.0, -2.4, 8.4, -29.6, -25.7]), boxK: 0, scanY: -99, tb: 1e9, dk: 0 };
const OPT0 = { a: 1, lime: 0, fade: 2600, back: .09, md: 0, zfix: undefined, lodpx: 0, px0: 0, nb: false, cp: null, rev: false, rtc: undefined, toShip: null, tag: null, ow: false, oc: false };
const opt = o => Object.assign({}, OPT0, o);
const TS = new Float64Array(12);
/* the per-point pass every cloud shares: project, light (low moon + rim), X-ray state, depth fade,
   underwater, the strike's fronts, dot. md: 0 plain · 1 shell (thinned where open) · 2 part
   (lit by the slices) · 3 hidden (seen only where open). */
function runPts(pts, i0, i1, spm, x, o, RT) {
  const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, W = BW, Hh = BH, D = BD, invF = 1 / F;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const l0 = x[12], l1 = x[13], l2 = x[14], el0 = x[15], el1 = x[16], el2 = x[17], w0 = x[26], w1 = x[27], w2 = x[28], w3 = x[29];
  const a = o.a, lm = o.lime, fadeD = o.fade, back = o.back, md = o.md, kf = .55 * a / fadeD, kfar = .45 * a;
  const cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
  const zo = XS.zo, zs = XS.zs, dir = XS.dir, stn = XS.stn, sl = XS.solid, keepS = .34 + .56 * sl, zfix = o.zfix, bm = o.nb ? 1 : 3, cp = o.cp, uw = XS.uw;
  const S = o.toShip, bx = md && XS.boxK > 0 ? XS.box : null, bK = XS.boxK, sy = XS.scanY;
  const rev = !!RT || o.rtc !== undefined, tb = XS.tb, dk = XS.dk, rtc = o.rtc, ow = o.ow, oc = o.oc;
  const fo = md && zo < -90 && zs > 90 && stn < -90 && bx === null;
  for (let i = i0, j = i * 6; i < i1; i++, j += 6) {
    const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
    if (cp !== null && cp[0] * px + cp[1] * py + cp[2] * pz < cp[3]) continue;
    let k = 0, thin = false, inBox = false, hs = 0;
    if (fo) { if (md === 1) { if ((i * .6180339887) % 1 > keepS) continue; thin = true; } }
    else if (md) {
      hs = (i * .6180339887) % 1;
      let qx = px, qy = py, qz = pz;
      if (S) { qx = S[0] * px + S[1] * py + S[2] * pz + S[9]; qy = S[3] * px + S[4] * py + S[5] * pz + S[10]; qz = S[6] * px + S[7] * py + S[8] * pz + S[11]; }
      const z = zfix === undefined ? qz : zfix;
      let open = (z - zo) * dir < 0 && (z - zs) * dir >= 0;
      if (bx !== null && qx > bx[0] && qx < bx[1] && qy > bx[2] && qy < bx[3] && qz > bx[4] && qz < bx[5]) { inBox = true; if (bK > hs) open = true; }
      if (md === 3 && !open) continue;
      let d = (zo - z) * dir;
      if (d > -.05 && d < 6) k = d < 0 ? 1 + d / .05 : d < .15 ? 1 : Math.exp(-(d - .15) * .9) * .75;
      d = (zs - z) * dir;
      if (d > -.05 && d < 1.2) { const k2 = d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 4) * .7; if (k2 > k) k = k2; }
      d = z - stn; if (d < 0) d = -d;
      if (d < .22) { const k3 = (1 - d / .22) * .85; if (k3 > k) k = k3; }
      if (inBox) { d = sy - qy; if (d > -.04 && d < .9) { const k4 = (d < 0 ? 1 + d / .04 : Math.exp(-d * 4.5)) * bK; if (k4 > k) k = k4; } }
      if (md === 1 && open && k < .3) { if (hs > keepS) continue; thin = true; }
    }
    // the strike's fronts: dim and sparse until reached, a lime flash as they pass, then decay
    let fl = 0, dimw = 0;
    if (rev) {
      const age = tb - (rtc !== undefined ? rtc : RT[i]);
      if (age < 0) dimw = 1; else { if (age < 1.2) fl = Math.exp(-age * 3.6); if (dk > 0) { const q = (dk - .55 * ((i * .7548777) % 1)) / .45; dimw = q <= 0 ? 0 : q >= 1 ? 1 : q; } }
      if (dimw > .5 && i % 3) continue;
    }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
    let b, bk = false, iz;
    if (nx === 0 && ny === 0 && nz === 0) { b = .45; iz = F / zc; }
    else {
      const dn = nx * (px - el0) + ny * (py - el1) + nz * (pz - el2);
      if (dn > 0) { if (bm === 1 || i % 3) continue; b = back; bk = true; iz = F / zc; }
      else {
        iz = F / zc;
        let fac = -dn * iz * invF; if (fac > 1) fac = 1;
        const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
        b = .06 + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
      }
    }
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz, sy2 = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz;
    if (sx < 0 || sy2 < 0 || sx >= W || sy2 >= Hh) continue;
    b *= zc < fadeD ? a - kf * zc : kfar;
    const wy = w0 * px + w1 * py + w2 * pz + w3;
    if (wy < 0) b *= wy > -.4 ? 1 + (uw - 1) * (-wy / .4) : uw;
    let r = cr, g = cg, bl = cb;
    if (thin) { const bt = bk ? .04 : .04 + .17 * b; b = bt + (b * .8 - bt) * sl; }
    if (dimw > 0) b *= 1 - .45 * dimw;
    if (fl > 0) { if (b < fl * 1.05 * a) b = fl * 1.05 * a; r += (LIME[0] - r) * fl; g += (LIME[1] - g) * fl; bl += (LIME[2] - bl) * fl; }
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    if (ow && !thin) { const ci = ((sy2 | 0) >> 3) * OW + ((sx | 0) >> 3); if (zc < OCC[ci]) OCC[ci] = zc; }
    else if (oc && zc > OCCF[((sy2 | 0) >> 3) * OW + ((sx | 0) >> 3)] + 3) b *= OCC_DIM;
    const pxs = spm * iz;
    if (pxs <= 3.6) {
      const q = ((sy2 | 0) * W + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
      if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    } else dot(sx, sy2, pxs > 7.5 ? 3 : 2, r, g, bl, b);
  }
}
const LODPX = 4.4, LODPX0 = 18;
function drawLod(ml, Tw, o, rtArr) {
  const x = prep(Tw), CH = ml.ch, SD = ml.sd, nl = ml.nl, F = C.fl, near = C.near, ex = x[15], ey = x[16], ez = x[17], oo = opt(o), PX = oo.lodpx || LODPX, PX0 = oo.px0 || LODPX0;
  if (oo.toShip) { const Tm = oo.toShip; for (let c = 0; c < 9; c++) TS[c] = Tm.R[c]; TS[9] = Tm.T[0]; TS[10] = Tm.T[1]; TS[11] = Tm.T[2]; oo.toShip = TS; }
  const RTs = rtArr === undefined ? (oo.rev ? ml.rt : null) : rtArr;
  // hidden steel with only the reload's window open: cells that cannot reach the window are skipped whole
  const bxOnly = oo.md === 3 && XS.zo > 98 && XS.boxK > 0, B = XS.box, S_ = oo.toShip;
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (bxOnly) {
      let qx = mx, qy = my, qz = mz;
      if (S_) { qx = S_[0] * mx + S_[1] * my + S_[2] * mz + S_[9]; qy = S_[3] * mx + S_[4] * my + S_[5] * mz + S_[10]; qz = S_[6] * mx + S_[7] * my + S_[8] * mz + S_[11]; }
      if (qx < B[0] - rad || qx > B[1] + rad || qy < B[2] - rad || qy > B[3] + rad || qz < B[4] - rad || qz > B[5] + rad) continue;
    }
    if (!sphereIn(x, mx, my, mz, rad, near)) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.1, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    let li = nl - 1; while (li > 1 && ml.sp[li] * F / d > PX) li--;
    if (li === 1 && ml.sp[1] * F / d > PX0) li = 0;
    const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
    if (i1 > i0) { runPts(ml.lv[li], i0, i1, ml.sp[li], x, oo, RTs ? RTs[li] : null); if (PROF) { PROF['n' + li] = (PROF['n' + li] || 0) + i1 - i0; if (o && o.tag) PROF['g_' + o.tag] = (PROF['g_' + o.tag] || 0) + i1 - i0; } }
  }
}
const drawLodW = (ml, Tw, o, rt) => drawLod(ml, Tw, Object.assign({ ow: true }, o), rt);
function drawCloud(cl, Tw, o) {
  if (!cl || !cl.n) return;
  const x = prep(Tw), CH = cl.ch, near = C.near, oo = opt(o);
  for (let c = 0; c < cl.nch; c++) { const q = c * 6; if (!sphereIn(x, CH[q + 2], CH[q + 3], CH[q + 4], CH[q + 5], near)) continue; runPts(cl.pts, CH[q] | 0, CH[q + 1] | 0, cl.sp, x, oo, null); }
}

/* ---------- world ---------- */
/* world point sets reordered into square tiles (cs m) with bounding spheres, culled per frame */
function tiled(F, stride, yi, cs, yr) {
  const n = F.length / stride, m = new Map();
  for (let k = 0; k < n; k++) { const key = (Math.floor(F[k * stride] / cs) + 4096) * 8192 + Math.floor(F[k * stride + (yi < 0 ? 1 : 2)] / cs) + 4096; let g = m.get(key); if (!g) { g = []; m.set(key, g); } g.push(k); }
  const O = new Float32Array(F.length), TL = new Float32Array(m.size * 6); let o = 0, t = 0;
  for (const g of m.values()) {
    const i0 = o; let sx = 0, sy = 0, sz = 0;
    for (const k of g) { for (let q = 0; q < stride; q++) O[o * stride + q] = F[k * stride + q]; sx += F[k * stride]; sy += yi < 0 ? 0 : F[k * stride + 1]; sz += F[k * stride + (yi < 0 ? 1 : 2)]; o++; }
    sx /= g.length; sy /= g.length; sz /= g.length;
    let rr = 0; for (let k = i0; k < o; k++) { const dx = O[k * stride] - sx, dy = yi < 0 ? 0 : O[k * stride + 1] - sy, dz = O[k * stride + (yi < 0 ? 1 : 2)] - sz; rr = Math.max(rr, Math.sqrt(dx * dx + dy * dy + dz * dz)); }
    TL.set([i0, o, sx, sy, sz, rr + (yr || 0)], t * 6); t++;
  }
  return { F: O, TL, nt: t, stride };
}
const W_LD = tiled(H.LD, 4, 1, 360), W_ST = tiled(H.ST, 4, 1, 120), W_SE = tiled(H.SE, 4, -1, 300, 1.5);
{ const F = W_SE.F; for (let j = 0; j < F.length; j += 4) F[j + 3] = (F[j + 3] + F[j] * .02) % TAU; }
const SINT = new Float32Array(1025); for (let i = 0; i <= 1024; i++) SINT[i] = Math.sin(i / 1024 * TAU);
const fsin = a => { let u = a * (1024 / TAU); u -= Math.floor(u / 1024) * 1024; return SINT[u | 0]; };
const XW = new Float64Array(26);
/* frustum test for a world-space sphere; also returns its camera depth in XW[0] */
function wIn(cx_, cy_, cz_, rad) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, dx = cx_ - e[0], dy = cy_ - e[1], dz = cz_ - e[2];
  const zc = dx * f[0] + dy * f[1] + dz * f[2]; XW[0] = zc;
  if (zc < C.near - rad) return false;
  const xc = dx * r[0] + dy * r[1] + dz * r[2], yc = dx * u[0] + dy * u[1] + dz * u[2];
  const Fl = C.fl, xr = (BW - C.cx - C.shake[0]) / Fl, xl = (C.cx + C.shake[0]) / Fl, yt = (C.cy + C.shake[1]) / Fl, yb = (BH - C.cy - C.shake[1]) / Fl;
  if ((xc - xr * zc) / Math.sqrt(1 + xr * xr) > rad) return false;
  if ((-xc - xl * zc) / Math.sqrt(1 + xl * xl) > rad) return false;
  if ((yc - yt * zc) / Math.sqrt(1 + yt * yt) > rad) return false;
  if ((-yc - yb * zc) / Math.sqrt(1 + yb * yb) > rad) return false;
  return true;
}
function drawWorld(T, S, SP) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  const gk = 1 - .72 * ghostK(T);
  let t0 = performance.now();
  { const tw = loopPh(S, 7), SK = H.SK;
    for (let k = 0; k < H.NSK; k++) {
      const j = k * 5, dx = SK[j], dy = SK[j + 1], dz = SK[j + 2], zc = dx * f0 + dy * f1 + dz * f2; if (zc < .05) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      if (occAt(sx, sy) < 1e8) continue;
      dot(sx, sy, 1, 225, 228, 222, SK[j + 3] * (.75 + .25 * Math.sin(tw + SK[j + 4])) * gk);
    } }
  // land: the coast and the hills behind the port, lit by the moon
  { const LD = W_LD.F, TL = W_LD.TL;
    for (let t = 0; t < W_LD.nt; t++) {
    const q = t * 6; if (!wIn(TL[q + 2], TL[q + 3], TL[q + 4], TL[q + 5])) continue;
    // far country thins out: its dots are dim and dense on screen
    const step = XW[0] > 4200 ? 3 : XW[0] > 2200 ? 2 : 1;
    for (let k = TL[q] + ((t * 7) % step), k1 = TL[q + 1]; k < k1; k += step) {
      const j = k * 4, dx = LD[j] - e0, dy = LD[j + 1] - e1, dz = LD[j + 2] - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 8) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      const ds = 26 * F / zc;
      let b = LD[j + 3] * gk * (zc < 2500 ? 1 - zc / 5200 : Math.max(.22, .52 - (zc - 2500) / 16000));
      if (ds > 12) b *= 12 / ds;
      if (step > 1) b *= 1 + .25 * (step - 1);
      if (zc > occAt(sx, sy) + 3) b *= OCC_DIM;
      dot(sx, sy, ds > 9 ? 2 : 1, 238, 238, 228, b > 1 ? 1 : b);
    } } }
  // harbour structures: piers, quay, sheds, breakwaters
  { const ST = W_ST.F, TL = W_ST.TL;
    for (let t = 0; t < W_ST.nt; t++) {
    const q = t * 6; if (!wIn(TL[q + 2], TL[q + 3], TL[q + 4], TL[q + 5])) continue;
    for (let k = TL[q], k1 = TL[q + 1]; k < k1; k++) {
      const j = k * 4, dx = ST[j] - e0, dy = ST[j + 1] - e1, dz = ST[j + 2] - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 1) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      dot(sx, sy, zc < 25 ? 2 : 1, 238, 238, 228, ST[j + 3] * gk * (zc < 1800 ? 1 - zc / 3000 : .4) * (zc > occAt(sx, sy) + 3 ? OCC_DIM : 1));
    } } }
  pf('land', t0); t0 = performance.now();
  drawSea(T, S, SP, gk); pf('sea', t0); t0 = performance.now();
  // pier lamps
  for (const L of H.LAMPS) {
    const p = C.project(L); if (!p || p[0] < 0 || p[1] < 0 || p[0] >= BW || p[1] >= BH) continue;
    const s = F / p[2], oc = p[2] > occAt(p[0], p[1]) + 3 ? OCC_DIM : 1; dot(p[0], p[1], s > 30 ? 3 : 2, 250, 250, 240, gk * .9 * oc);
    if (oc < 1 || p[2] > 1400) continue;
    const rad = Math.max(4, Math.min(30, s * 1.6)), n = Math.min(90, 10 + Math.round(rad * 2.2));
    for (let k = 0; k < n; k++) { const m = ((k * 61 + 17) & 255) * 2, ox = DISK[m] * rad, oy = DISK[m + 1] * rad, d2 = DISK[m] * DISK[m] + DISK[m + 1] * DISK[m + 1]; dot(p[0] + ox, p[1] + oy, 1, 236, 238, 222, .32 * gk * (1 - d2) * (1 - d2)); }
  }
  drawWake(T, S, gk); pf('wake', t0);
}
/* sea: sparse returns with the harbour chop, swell outside, the moon's glitter; the ships' hulls
   push the water out of their footprint */
const MOONR = V.norm([LK[0], LK[1], LK[2]]);
const SIS_W = H.SISTERS.map(([x, z, h]) => X.make(R.y(h), [x, 0, z]));
function drawSea(T, S, SP, gk) {
  const vis = gk * (1 - .55 * ghostK(T));
  if (vis < .05) return;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  const SE = W_SE.F, TL = W_SE.TL, ph = loopPh(S, 5.3), sw = loopPh(S, 9.1), M0 = MOONR[0], M1 = MOONR[1], M2 = MOONR[2];
  const sh = SP.W, sxc = sh.T[0], szc = sh.T[2], sR = sh.R;
  for (let t = 0; t < W_SE.nt; t++) {
  const q = t * 6; if (!wIn(TL[q + 2], 0, TL[q + 4], TL[q + 5])) continue;
  for (let k = TL[q], k1 = TL[q + 1]; k < k1; k++) {
    const j = k * 4, x = SE[j], z = SE[j + 1];
    // inside our hull's waterline?
    let ddx = x - sxc, ddz = z - szc;
    if (ddx * ddx + ddz * ddz < 6400) { const lx = sR[0] * ddx + sR[6] * ddz, lz = sR[2] * ddx + sR[8] * ddz; if (lz > -78 && lz < 72 && Math.abs(lx) < SM.hW(lz) + .4) continue; }
    const out = z > 1150 ? 1 : 0, amp = .12 + .7 * out;
    const y = amp * fsin(SE[j + 3] + ph) + (out ? .5 * fsin(sw + z * .011 + x * .004) : 0);
    const dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 2) continue;
    const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
    if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
    // glitter: the moon's reflection off a tilted facet (only near the flat-sea mirror direction)
    const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz), vx = dx * il, vy = dy * il, vz = dz * il;
    let gl = 0;
    if (vx * M0 - vy * M1 + vz * M2 > .72) {
      const tx = .18 * fsin(SE[j + 3] * 3.1 + ph + 1.5708), tz = .18 * fsin(SE[j + 3] * 2.3 - ph);
      const nl = 1 / Math.sqrt(1 + tx * tx + tz * tz), nx = tx * nl, ny = nl, nz = tz * nl, dn = vx * nx + vy * ny + vz * nz;
      const sp = (vx - 2 * dn * nx) * M0 + (vy - 2 * dn * ny) * M1 + (vz - 2 * dn * nz) * M2;
      if (sp > .9) gl = Math.pow((sp - .9) / .1, 3) * .7;
    }
    const b = (SE[j + 2] * (zc < 3000 ? 1 - zc / 6000 : .5) + gl) * vis * (zc > occAt(sx, sy) + 3 ? OCC_DIM : 1);
    dot(sx, sy, zc < 60 ? 2 : 1, 236, 238, 232, b > 1 ? 1 : b);
  } }
}
/* wake: emissions along the route every 1.4 m (stern, bow, heading, speed), each analytic in its age */
const WAKE = (() => {
  const L = [], RUN = H.RUN;
  let sPrev = -1;
  for (let k = 0; k < RUN.T.length; k++) {
    const s = RUN.S[k]; if (s - sPrev < 1.4) continue; sPrev = s;
    const p = H.pathAt(s), h = p[2], d = [Math.sin(h), Math.cos(h)];
    L.push(RUN.T[k], s, p[0] - d[0] * 72, p[1] - d[1] * 72, p[0] + d[0] * 70, p[1] + d[1] * 70, d[0], d[1], RUN.Vv[k]);
  }
  return { F: new Float32Array(L), n: L.length / 9 };
})();
const KEL = Math.tan(19.47 * DEG);
function drawWake(T, S, gk) {
  const tau = S - S_GO; if (tau <= 0) return;
  const cur = H.routePose(tau), sNow = cur.s !== undefined ? cur.s : H.PATH.len;
  const W = WAKE.F, e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const pr = (x, y, z) => { const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 2) return null; PJ[0] = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; PJ[1] = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; PJ[2] = zc; return PJ; };
  const vis = gk;
  for (let k = 0; k < WAKE.n; k++) {
    const j = k * 9, t = W[j]; if (t > tau) break;
    const age = tau - t; if (age > 1100) continue;
    const vf = E.ss(1.2, 4.5, W[j + 8]); if (vf < .02) continue;
    const nx = W[j + 7], nz = -W[j + 6];                 // starboard normal of the heading at emission
    // turbulent centre wake: foam, spreading and fading
    const wv = 4.5 + 1.3 * Math.sqrt(age), fo = .75 * Math.exp(-age / 90) * vf * vis;
    if (fo > .02) for (let q = 0; q < 14; q++) {
      const off = ((q * .618 + k * .371) % 1 - .5) * 2 * wv, jz = ((k * 1.7 + q * .9) % 1 - .5) * 1.4;
      const p = pr(W[j + 2] + nx * off + W[j + 6] * jz, 0.15, W[j + 3] + nz * off + W[j + 7] * jz); if (!p) continue;
      if (p[0] < 0 || p[1] < 0 || p[0] >= BW || p[1] >= BH) continue;
      dot(p[0], p[1], p[2] < 90 ? 2 : 1, 240, 242, 236, fo * (1 - .5 * Math.abs(off) / wv));
    }
    // Kelvin arms from the bow: 19.47 deg either side of the track, the crest moving out as she runs on
    const dist = sNow - W[j + 1]; if (dist < 1) continue;
    const lat = dist * KEL, ka = .5 * Math.exp(-age / 200) * vf * vis * E.ss(0, 20, dist) * Math.exp(-dist / 420);
    if (ka < .02 || lat > 320) continue;
    for (const sd of [-1, 1]) for (let q = 0; q < 3; q++) {
      const l2 = lat * (1 - q * .05) + 10, p = pr(W[j + 4] + nx * sd * l2 - W[j + 6] * q * 3, .25, W[j + 5] + nz * sd * l2 - W[j + 7] * q * 3); if (!p) continue;
      if (p[0] < 0 || p[1] < 0 || p[0] >= BW || p[1] >= BH) continue;
      dot(p[0], p[1], 1, 236, 240, 232, ka * (1 - q * .3));
    }
  }
}
const PJ = [0, 0, 0];
const DISK = (() => { const r = rng(515), D = new Float32Array(512); for (let i = 0; i < 256; i++) { const a = r() * TAU, q = Math.sqrt(r()); D[i * 2] = Math.cos(a) * q; D[i * 2 + 1] = Math.sin(a) * q; } return D; })();

/* ---------- actors ---------- */
const SPS_P = [0, 28.2, 21.6];
const spsAng = spinTable(t => { const r = RATE(t), on = E.ss(69, 71, t) * (1 - E.ss(114, 116, t)); return on * Math.min(1.67 * r, 2.4); }, TAU);
const propAng = spinTable(t => { const r = RATE(t), s = SIM(t), q = ROUTE(s), v = Math.abs(q.v || 0); return Math.min((.8 + v * 1.45) * r, 5.2) * (q.v < 0 ? -1 : 1); }, TAU / 5);
const gtAng = spinTable(t => 3.1 * E.ss(14, 19, t) * (1 - E.ss(40, 44, t)) + .4, TAU / 30);
const ptAng = spinTable(t => 1.2 * E.ss(14, 19, t) * (1 - E.ss(40, 44, t)) + .15, TAU / 52);
const asmOff = (name, T) => { const a = ASM[name]; const xp = explodeK(a.w0, T); return xp > 0 ? V.mul(a.off, xp) : null; };
const offXf = (SW, off) => off ? X.mul(SW, X.make(R.I(), off)) : SW;
function modeOf(cls, xr) { return !xr ? 0 : cls === 'shell' ? 1 : cls === 'part' ? 2 : 3; }
/* the ship: assemblies (pulled apart in the exploded view), rotating parts, the helicopter,
   the reload's hatches and canisters */
function drawShip(T, S, SP) {
  const SW = SP.W, xr = XRAY(T), rev = T < 18.5 || T > 150, bxOn = XS.boxK > 0;
  const aShip = 1;
  for (const a of Object.values(ASM)) {
    if (a.cls === 'hidden' && !xr && !bxOn) continue;
    if (a.name === 'rooms' && !xr) continue;
    const inside = T > 24.4 && T < 38.6, exK = E.ss(EXO - 1, EXO + 1, T) * (1 - E.ss(EXB + 4, EXB + 6, T));
    if (inside && (a.name === 'vlsBA' || a.name === 'vlsBF')) continue;
    const md = bxOn && !xr ? (a.cls === 'hidden' ? 3 : a.cls === 'shell' ? 1 : 2) : modeOf(a.cls, xr);
    const off = asmOff(a.name, T);
    const inK = a.cls === 'shell' ? 1 - .7 * E.ss(24.6, 25.4, T) * (1 - E.ss(37.8, 39.2, T)) : 1;
    let al = (1 + .25 * exK * (a.cls === 'shell' ? 0 : 1)) * inK * aShip * (a.name === 'rooms' ? .5 * (1 - E.ss(EXO, EXO + 2, T) * (1 - E.ss(EXB + 3, EXB + 6, T))) : 1);
    if (a.name === 'vlsBA' || a.name === 'vlsBF') al *= .6;
    if (a.name === 'trunks') al *= .5 + .5 * E.ss(24.4, 25.4, T) * (1 - E.ss(28.2, 29.2, T));
    if (a.name === 'louvres') al *= (.4 + .35 * E.ss(21.5, 23, T)) * (1 - E.ss(24.2, 24.7, T) * (1 - E.ss(37.8, 39.2, T)));
    if (al < .02) continue;
    drawLodW(a.cl, offXf(SW, off), { a: al, md, rev: rev && a.cls !== 'hidden', nb: a.cls === 'shell' && (inside || !xr), lodpx: exK > .5 ? 3.8 : a.cls === 'shell' ? (inside ? 8 : 5.5) : a.cls === 'hidden' ? (bxOn ? 6 : inside ? 5.2 : 4.2) : 0, px0: xr && a.cls === 'shell' ? 26 : 0, tag: PROF && a.name });
  }
  // the four turbines and their rotors
  if (xr || bxOn) {
    const off = asmOff('mach', T), Wm = offXf(SW, off), ga = gtAng(T), pa = ptAng(T);
    for (const g of SM.GTS) {
      const G = SM.gtXf(g), Wg = X.mul(Wm, G);
      drawLodW(GT_STAT, Wg, { md: 3, toShip: G, px0: 24, lodpx: 5.2, tag: PROF && 'gt' });
      const Rr = X.make(R.z(ga), [0, 0, 0]), Rp = X.make(R.z(-pa), [0, 0, 0]);
      drawLodW(GT_ROT, X.mul(Wg, Rr), { md: 3, toShip: X.mul(G, Rr), a: 1.9, tag: PROF && 'gtr' });
      drawLodW(GT_ROT2, X.mul(Wg, Rr), { md: 3, toShip: X.mul(G, Rr), a: .5, tag: PROF && 'gtr' });
      drawLodW(GT_PT, X.mul(Wg, Rp), { md: 3, toShip: X.mul(G, Rp), a: 1.1, tag: PROF && 'gtp' });
    }
  }
  // search radar, turning
  { const off = asmOff('mast', T), M = X.mul(offXf(SW, off), SM.piv(R.y(spsAng(T)), SPS_P)); drawLodW(SPS, M, { md: modeOf('part', xr), zfix: 21.6, rev, tag: PROF && 'sps' }); }
  // propellers and rudders
  { const po = explodeK(EXTRA.props[1], T), ro = explodeK(EXTRA.rudders[1], T), pa = propAng(T);
    for (const sd of [1, -1]) {
      const P0 = X.make(R.I(), [sd * SM.PROP.x, SM.PROP.y, SM.PROP.z]), Wp = X.mul(offXf(SW, po ? V.mul(EXTRA.props[0], po) : null), X.mul(P0, X.make(R.z(sd * -pa), [0, 0, 0])));
      drawLodW(sd > 0 ? PROP_S : PROP_P, Wp, { md: modeOf('part', xr), zfix: SM.PROP.z, rev, rtc: RT_PROP, tag: PROF && 'prop' });
      const R0 = X.make(R.I(), [sd * SM.RUDDER.x, SM.RUDDER.top, SM.RUDDER.z]);
      drawLodW(RUD, X.mul(offXf(SW, ro ? V.mul(EXTRA.rudders[0], ro) : null), R0), { md: modeOf('part', xr), zfix: SM.RUDDER.z, rev, rtc: RT_RUD });
    } }
  // the helicopter in the port hangar (rolled out aft in the exploded view)
  if (xr || bxOn) { const ho = explodeK(EXTRA.helo[1], T), Hm = X.make(R.I(), SM.HELO_AT); drawLodW(HELO, X.mul(offXf(SW, ho ? V.mul(EXTRA.helo[0], ho) : null), Hm), { md: ho > .3 ? 2 : 3, toShip: Hm, tag: PROF && 'helo' }); }
  // the loaded cells' hatches, hinged outboard
  { const off = asmOff('vlsA', T), Wv = offXf(SW, off);
    for (const c of LOADED) {
      const f = hatchOpen(c.k, T), Th = X.make(R.z(f * 105 * DEG), c.hinge);
      drawLodW(HATCH, X.mul(Wv, Th), { md: modeOf('part', xr), toShip: Th, rev, rtc: RT_HATCH, lime: .7 * f, a: 1 + f });
    } }
  // canisters in the aft launcher: seen only through the reload's window
  if (bxOn) {
    for (const id of MOD1) {
      const k = LOADED.findIndex(c => c.id === id), p = DA.vls(id);
      if (k >= 0) { if (canState(k, T) !== 'cell' || T < 110) continue; }
      const Tc = X.make(R.I(), [p[0], p[1] - SM.CAN.SEAT, p[2]]);
      drawLodW(CANM, X.mul(SW, Tc), { md: 3, toShip: Tc, a: 1.5, lodpx: 6, tag: PROF && 'can' });
    }
  }
  // the hull's cut faces, while the ends stand off
  { const kb = explodeK(ASM.bow.w0, T), ks = explodeK(ASM.stern.w0, T);
    if (kb > .05) { drawCloud(RINGS.f, SW, { a: .55 * kb, md: 0 }); drawCloud(RINGS.f, offXf(SW, V.mul(ASM.bow.off, kb)), { a: .55 * kb }); }
    if (ks > .05) { drawCloud(RINGS.a, SW, { a: .55 * ks }); drawCloud(RINGS.a, offXf(SW, V.mul(ASM.stern.off, ks)), { a: .55 * ks }); } }
}
function drawSisters(T) {
  const a = .5 * (1 - .75 * ghostK(T));
  for (const W of SIS_W) drawLod(SISTER, W, { a, lodpx: 7, nb: true, oc: true });
}
function drawCrane(T, SW) {
  const cr = craneAt(T), O = X.make(R.I(), CRANE_O), g = 1 - .7 * ghostK(T);
  const o = { a: .85 * g, lodpx: 7, oc: true };
  drawLod(CRN.portal, O, o);
  drawLod(CRN.house, X.mul(O, SM.craneHouseXf(cr.slew)), o);
  drawLod(CRN.boom, X.mul(O, SM.craneBoomXf(cr.slew, cr.luff)), o);
  const hookW = V.add(cr.hook, CRANE_O);
  drawLod(CRN.hook, X.make(R.y(cr.slew), hookW), { a: .9 * g, oc: true });
  // hoist rope, luffing ropes
  const tipW = V.add(cr.tip, CRANE_O), apex = X.ap(X.mul(O, SM.craneHouseXf(cr.slew)), [0, 15.2, -2.2]);
  dotLine(tipW, V.add(hookW, [0, .05, 0]), .08, .55 * g);
  dotLine(apex, X.ap(X.mul(O, SM.craneBoomXf(cr.slew, cr.luff)), [0, .6, SM.CR.BOOM - .4]), .12, .35 * g);
  // canisters: on the dunnage, upending, on the hook (slings), in the cell
  for (let k = 0; k < 4; k++) {
    const st = canState(k, T); if (st === 'cell') continue;
    const fade = E.ss(104, 110, T);
    if (fade < .02) continue;
    const Tc = canXf(k, T, SW);
    drawLod(CANM, Tc, { a: 1.9 * fade * g, oc: true, lodpx: 3, tag: PROF && 'canp' });
    if (st === 'up' || st === 'hook') for (const sx of [-.2, .2]) dotLine(V.add(hookW, [0, -1.5, 0]), X.ap(Tc, [sx, .1, 0]), .06, .5 * g);
  }
}
/* the local X-ray window of the reload: dotted lime edges, the scan plane as it passes */
function drawWindow(T, SW) {
  const k = XS.boxK; if (k < .02) return;
  const b = XS.box, P = (x, y, z) => X.ap(SW, [x, y, z]);
  const c = [[b[0], b[2], b[4]], [b[1], b[2], b[4]], [b[1], b[3], b[4]], [b[0], b[3], b[4]], [b[0], b[2], b[5]], [b[1], b[2], b[5]], [b[1], b[3], b[5]], [b[0], b[3], b[5]]];
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) limeLine(P(...c[i]), P(...c[j]), .2, .75 * k);
  const y = XS.scanY;
  if (y > b[2] && y < b[3]) for (const [p0, p1] of [[[b[0], b[4]], [b[1], b[4]]], [[b[1], b[4]], [b[1], b[5]]], [[b[1], b[5]], [b[0], b[5]]], [[b[0], b[5]], [b[0], b[4]]]]) limeLine(P(p0[0], y, p0[1]), P(p1[0], y, p1[1]), .12, .9 * k, 2);
}
function limeLine(a, b, step, al, sz) {
  const n = Math.max(2, Math.ceil(V.dist(a, b) / step));
  for (let k = 0; k <= n; k++) { const p = C.project(V.lerp(a, b, k / n)); if (p && p[0] >= 0 && p[1] >= 0 && p[0] < BW && p[1] < BH) dset(p[0], p[1], sz || 1, 212, 250, 120, al); }
}
function dotLine(a, b, step, al) {
  const n = Math.max(2, Math.ceil(V.dist(a, b) / step));
  for (let k = 0; k <= n; k++) { const p = C.project(V.lerp(a, b, k / n)); if (p) dot(p[0], p[1], 1, 238, 238, 228, al); }
}
/* mooring lines: bow, spring and stern lines to the pier's bollards while she is alongside */
const MOOR = [[[-7.2, 9.9, 66], [-12.3, 3.6, 94]], [[-8.6, 9.4, 44], [-12.3, 3.6, 18]], [[-9.4, 7.7, 8], [-12.3, 3.6, 33]], [[-9.4, 7.3, -18], [-12.3, 3.6, -42]], [[-9.1, 6.5, -52], [-12.3, 3.6, -27]], [[-7.6, 6.3, -74], [-12.3, 3.6, -102]]];
function drawMoor(T, SW) {
  const a = (T < 80 ? 1 - E.ss(69.5, 72, T) : E.ss(114, 116.5, T)) * (1 - .6 * ghostK(T));
  if (a < .02) return;
  for (const [s, b] of MOOR) {
    const A0 = X.ap(SW, s), n = 40;
    for (let k = 0; k <= n; k++) { const u = k / n, p = V.lerp(A0, b, u); p[1] -= 1.1 * 4 * u * (1 - u); const q = C.project(p); if (q) dot(q[0], q[1], 1, 238, 238, 228, .55 * a); }
  }
}

/* the slice as a drawn section: the hull's outline at z, the plane's edges above and below */
function drawSlice(z, SW, a) {
  if (a < .02 || z < -77.6 || z > 77.6) return;
  const put = (x, y) => { const p = C.project(X.ap(SW, [x, y, z])); if (p && p[0] >= 0 && p[1] >= 0 && p[0] < BW && p[1] < BH) dset(p[0], p[1], 2, 226, 255, 150, a); };
  const NS = 40, d = DA.deckY(z), bw = SM.hW(z);
  for (let i = 0; i <= NS; i++) { const q = SM.secPt(z, i / NS * PI / 2); if (q[1] < -.02) { put(q[0], q[1]); put(-q[0], q[1]); } }
  for (let y = 0; y < d; y += .35) { const x = bw + (bw * 1.11 - bw) * y / d; put(x, y); put(-x, y); }
  for (let x = -bw * 1.1; x < bw * 1.1; x += .35) put(x, d);
  const put2 = (x, y) => { const p = C.project(X.ap(SW, [x, y, z])); if (p && p[0] >= 0 && p[1] >= 0 && p[0] < BW && p[1] < BH) dot(p[0], p[1], 1, LIME[0], LIME[1], LIME[2], .45 * a); };
  for (let y = -9; y < 50; y += .9) { put2(-15, y); put2(15, y); }
  for (let x = -15; x < 15; x += .9) { put2(x, -9); put2(x, 50); }
}

/* ---------- the bolt, the flash, the live links over the steel ---------- */
const FLASH = { v: 0 };
function drawBolt(T) {
  const c = tStrike(T) + BOLT.lead; if (c < -.05 || c > BOLT.lead + 1.6) return;
  const tr = c - BOLT.lead, leading = tr < 0, m = BOLT.main;
  // the stepped leader: jumps of ~50 m every 70 ms, feeling its way down
  const reach = leading ? Math.pow(E.sat(Math.floor(c / .07) * .07 / BOLT.lead), 1.15) : 1;
  const I = leading ? .5 : Math.max(0, Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2)));
  const path = (pts, to, inten, core) => {
    for (let i = 0; i < Math.min(pts.length - 1, to); i++) {
      const a = pts[i], bq = pts[i + 1], n = Math.max(1, Math.ceil(V.dist(a, bq) / .4));
      for (let k = 0; k < n; k++) { const p = C.project(V.lerp(a, bq, k / n)); if (!p || p[0] < -40 || p[0] > BW + 40 || p[1] < -40 || p[1] > BH + 40) continue; dot(p[0], p[1], core || 2, 248, 255, 232, Math.min(1, inten)); if (k % 3 === 0) { addDot(p[0], p[1], 9, LIME[0], LIME[1], LIME[2], .035 * inten); addDot(p[0], p[1], 23, LIME[0] * .6, LIME[1] * .6, LIME[2] * .6, .011 * inten); } }
    }
  };
  if (I > .01) {
    const vis = reach * m.length;
    path(m, vis, I * 1.1, leading ? 2 : 3);
    for (const b of BOLT.br) { const s = b.at * m.length; if (vis > s) path(b.pts, (vis - s) / (m.length * .2) * b.pts.length, I * b.w * (leading ? 1 : .8)); }
    if (!leading) FLASH.v = 20 * Math.min(1, I);
  }
  if (!leading) for (const q of BOLT.sp) {
    if (tr > q[3]) continue;
    const p = C.project([BOLT.hit[0] + q[0] * tr, BOLT.hit[1] + q[1] * tr - 11 * tr * tr, BOLT.hit[2] + q[2] * tr]); if (!p) continue;
    const a = 1 - tr / q[3]; dot(p[0], p[1], 2, 230, 255, 170, a); addDot(p[0], p[1], 4, LIME[0], LIME[1], LIME[2], a * .08);
  }
}
function drawWires(T, SW) {
  const tb = tStrike(T); if (tb < 0 || tb > XR.SPAN + .3) return;
  octx.globalCompositeOperation = 'lighter'; octx.lineWidth = 1.2; octx.strokeStyle = 'rgba(210,255,120,.8)'; octx.beginPath();
  const N = XR.nodes, TS_ = XR.ts, PAR = XR.par;
  for (let i = 0; i < N.length; i++) {
    const tn = TS_[i]; if (tb < tn || tb > tn + .16 || PAR[i] < 0) continue;
    const p = C.project(X.ap(SW, N[i].p)), q = C.project(X.ap(SW, N[PAR[i]].p)); if (!p || !q) continue;
    octx.moveTo(q[0], q[1]); octx.lineTo(p[0], p[1]);
  }
  octx.stroke(); octx.globalCompositeOperation = 'source-over';
}

/* ---------- tags, boxes, readout ---------- */
const ui = $('ui'), tagPool = [];
function mkTag() { const d = document.createElement('div'); d.className = 'tag off'; d.innerHTML = '<b></b><i></i><span class="v"></span>'; ui.insertBefore(d, $('menu')); const o = { el: d, b: d.children[0], i: d.children[1], v: d.children[2], key: '', on: false, x: 0, y: 0 }; tagPool.push(o); return o; }
const GLY = '·:+×/\\|-=';
/* cond < 1: the label is still condensing, its tail scrambled */
function condense(s, cond, T, seed) {
  if (cond >= 1) return s;
  const n = s.length, keep = Math.floor(n * Math.max(0, cond)), fr = Math.floor(T * 24);
  let o = s.slice(0, keep);
  for (let i = keep; i < n; i++) o += s[i] === ' ' ? ' ' : (((i * 7 + fr * 13 + seed * 5) % 11) < 3 + 8 * cond ? GLY[(i * 3 + fr + seed) % GLY.length] : ' ');
  return o;
}
function setTag(tg, id, lab, val, cls, x, y, a, cond, T) {
  if (cond !== undefined && cond < 1) { lab = condense(lab, cond, T, id.length); val = cond > .75 ? val : ''; }
  const key = id + '|' + lab + '|' + val + '|' + (cls || '');
  if (tg.key !== key) { tg.key = key; tg.w = -1; tg.b.textContent = id; tg.i.textContent = lab; tg.v.textContent = val || ''; tg.v.style.display = val ? '' : 'none'; tg.el.className = 'tag ' + (cls || ''); }
  const w = tagW(tg); if (x > 1896 - w) x = 1896 - w; if (x < 24) x = 24; if (y < 24) y = 24;
  tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tg.el.style.opacity = a === undefined ? '' : a.toFixed(2);
  tg.on = true; tg.x = x; tg.y = y;
}
function placeTag(tg, x, y) { const w = tagW(tg); if (x > 1896 - w) x = 1896 - w; if (x < 24) x = 24; tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; tg.x = x; tg.y = y; }
const tagW = tg => { if (tg.w < 0 || tg.w === undefined) tg.w = tg.el.offsetWidth; return tg.w; };
const GT_TOP = SM.GT.AXIS_Y + .8;
const T_ = {};
['ship', 'slice', 'fly', 'gt', 'uw', 'rad', 'wake', 'tl', 'crane', 'mod', 'c0', 'c1', 'c2', 'c3', 'pier'].forEach(k => T_[k] = mkTag());
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
function bracket(b, col, a, pad, len) {
  const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad, c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
  octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
  octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.globalAlpha = a * .45; octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]); octx.globalAlpha = 1;
  return [x0, y0, x1, y1];
}
function leader(x0, y0, x1, y1, col, a) { octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
function stem(x, y, len, a) { for (let yy = 6; yy <= len; yy += 3) dot(x, y - yy, 1, LIME[0], LIME[1], LIME[2], a); }
const LIMEc = '#C6F432', WHc = '#ffffff';
const MENU_Y = 790;
/* bound sets: thinned xyz copies of what an assembly draws, projected without allocation */
function thin(P, maxN) { const n = P.length / 6, st = Math.max(1, Math.ceil(n / maxN)), o = []; for (let i = 0; i < n; i += st) o.push(P[i * 6], P[i * 6 + 1], P[i * 6 + 2]); return new Float32Array(o); }
const boundSet = (ml, maxN) => thin(ml.lv[Math.min(ml.nl - 1, 2)], maxN || 500);
function pbounds(P, Tf, b) {
  const x = prep(Tf), F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let j = 0; j < P.length; j += 3) {
    const px = P[j], py = P[j + 1], pz = P[j + 2], zc = x[6] * px + x[7] * py + x[8] * pz + x[11]; if (zc < near) continue;
    const sx = cx + F * (x[0] * px + x[1] * py + x[2] * pz + x[9]) / zc, sy = cy - F * (x[3] * px + x[4] * py + x[5] * pz + x[10]) / zc;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  if (x0 > x1) return b || null;
  return b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1];
}
const BS = {}; for (const a of Object.values(ASM)) BS[a.name] = boundSet(a.cl, a.cls === 'shell' ? 900 : 400);
const BS_GT = boundSet(GT_STAT, 300), BS_HELO = boundSet(HELO, 400), BS_PROP = boundSet(PROP_S, 300), BS_RUD = boundSet(RUD, 150), BS_CAN = boundSet(CANM, 120), BS_SPS = boundSet(SPS, 150);
const BS_SHIP = thin(SISTER.lv[1], 1600);
/* ch1: what the fronts reach, condensing into tags */
const CH1 = [
  ['SPY', 'AN/SPY-1D(V) · 4 faces', '', DA.spy[0], 64],
  ['SPS', 'AN/SPS-67 · surface search', '', DA.sps, 40],
  ['GUN', 'Mk 45 Mod 4 · 5-inch/62', '', DA.gun({}), 58],
  ['VLS', 'Mk 41 · forward', '32 cells', [2.2, 7.9, 38.9], 96],
  ['CIWS', 'Phalanx 1B', '20 mm', DA.ciws({}, 0), 118],
  ['VLS', 'Mk 41 · aft', '64 cells', [2.2, 6.2, -29.4], 70],
  ['HGR', 'Hangar ×2 · MH-60R', '', [4, 11, -44], 100],
].map(([id, lab, val, anchor, stemL]) => ({ id, lab, val, anchor, stemL, rt: XR.rtAt(anchor[0], anchor[1], anchor[2]), tg: mkTag() }));
/* ch2: the engine rooms from above */
const ER_TAGS = [
  ...SM.GTS.map((g, i) => ({ id: 'GT ' + g.id, lab: 'LM2500', at: [g.x, GT_TOP, g.z - 3], st: [34, 58, 34, 58][i] })),
  ...SM.MRGS.map(m => ({ id: 'MRG ' + m.id, lab: 'reduction gear', at: [m.x, -1.2, m.zf - SM.MRG_L / 2], st: 26 })),
].map(q => Object.assign(q, { tg: mkTag() }));
/* ch3: numbered placards */
const PL = [
  ['01', 'bow', 'Bow · AN/SQS-53C sonar dome', '', [0, -6.8, 63], 'R'],
  ['02', 'gun', 'Mk 45 Mod 4 · 5-inch/62', '127 mm', DA.gun({}), 'R'],
  ['03', 'vlsF', 'Mk 41 VLS · forward', '32 cells', [3.2, 7.6, 38.9], 'R'],
  ['04', 'superF', 'Deckhouse · AN/SPY-1D(V) ×4', '', DA.spy[0], 'R'],
  ['05', 'mast', 'Mast · AN/SPS-67 · URN-25 TACAN', '', [0, 38.2, 16.5], 'R'],
  ['06', 'ciwsF', 'Phalanx CIWS 1B · forward', '20 mm', DA.ciws({}, 0), 'R'],
  ['07', 'stacks', 'Uptakes ×2 · midships deckhouse', '', [2.2, 21.8, -.7], 'L'],
  ['08', 'boatsS', '7 m RHIB ×2 · davits', '', [8, 9.2, -10.2], 'L'],
  ['09', 'mach', 'LM2500 ×4 · reduction gears ×2', '100 000 shp', [3.0, -1.2, 2.5], 'L'],
  ['10', 'vlsA', 'Mk 41 VLS · aft', '64 cells', [3.2, 6.2, -29.4], 'L'],
  ['11', 'ciwsA', 'Phalanx CIWS 1B · aft', '', DA.ciws({}, 1), 'L'],
  ['12', 'hangar', 'Hangar ×2 · flight deck', '', [6.5, 12.6, -40], 'L'],
  ['13', 'helo', 'MH-60R Seahawk · blades folded', '', [-3.7, 8.2, -35.5], 'L'],
  ['14', 'props', 'Shafts ×2 · 5-blade CRP propellers', 'Ø 5.2 m', [4.0, -2.0, -62.5], 'L'],
].map(([id, name, lab, val, anchor, side]) => ({ id, name, lab, val, anchor, side, tg: mkTag() }));
function plXf(p, T, SW) {
  if (p.name === 'helo') { const ho = explodeK(EXTRA.helo[1], T); return offXf(SW, ho ? V.mul(EXTRA.helo[0], ho) : null); }
  if (p.name === 'props') { const po = explodeK(EXTRA.props[1], T); return offXf(SW, po ? V.mul(EXTRA.props[0], po) : null); }
  return offXf(SW, asmOff(p.name, T));
}
const plW0 = p => p.name === 'helo' ? EXTRA.helo[1] : p.name === 'props' ? EXTRA.props[1] : ASM[p.name].w0;
function plBounds(p, T, SW) {
  const W = plXf(p, T, SW);
  if (p.name === 'mach') { let b = pbounds(BS.mach, W); for (const g of SM.GTS) b = pbounds(BS_GT, X.mul(W, SM.gtXf(g)), b); return b; }
  if (p.name === 'helo') return pbounds(BS_HELO, X.mul(W, X.make(R.I(), SM.HELO_AT)));
  if (p.name === 'props') { let b = null; for (const sd of [1, -1]) b = pbounds(BS_PROP, X.mul(W, X.make(R.I(), [sd * SM.PROP.x, SM.PROP.y, SM.PROP.z])), b); b = pbounds(BS.shaftOut, offXf(SW, asmOff('shaftOut', T)), b); return b; }
  if (p.name === 'mast') { const b = pbounds(BS.mast, W); return pbounds(BS_SPS, X.mul(W, SM.piv(R.y(0), SPS_P)), b); }
  if (p.name === 'boatsS') return pbounds(BS.boatsP, offXf(SW, asmOff('boatsP', T)), pbounds(BS.boatsS, W));
  if (p.name === 'hangar') return pbounds(BS.hdoor, W, pbounds(BS.hangar, W));
  return pbounds(BS[p.name], W);
}
const fmtClock = s => { const sg = s < 0 ? '−' : '+'; s = Math.abs(s); const m = Math.floor(s / 60); return `T${sg}${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const S_TB = SIM(TB);
const kn = v => (Math.abs(v) / .5144).toFixed(1);
const hdg = h => String(Math.round((((h / DEG) % 360) + 360) % 360)).padStart(3, '0');
function stationName(T, z) {
  if (T < 25.4) return ['Intake louvres · stack 1', ''];
  if (T < 27.9) return ['Intake trunk · GT 1B', ''];
  if (T < 29.0) return ['Inlet plenum · bellmouth', ''];
  if (T < 31.0) return ['LM2500 · compressor face', 'stage 1 · 30 blades'];
  if (T < 33.0) return ['Engine rooms · 4 gas turbines', '2 per shaft'];
  if (T < 33.9) return ['Main reduction gear 1 · bull gear', ''];
  if (T < 34.8) return ['Thrust bearing · stbd shaft', ''];
  if (z > -24) return ['Stbd shaft · past MER 2', ''];
  if (z > -40.5) return ['Stbd shaft · under the aft launcher', ''];
  if (z > -53) return ['Stern tube · intermediate strut', ''];
  return ['V-strut · CRP propeller', 'Ø 5.2 m'];
}
function overlays(T, S, SP) {
  const SW = SP.W;
  // calm the menu band and the readout corner
  const lg = octx.createLinearGradient(0, 1080, 0, 700); lg.addColorStop(0, 'rgba(11,12,10,.9)'); lg.addColorStop(.55, 'rgba(11,12,10,.55)'); lg.addColorStop(1, 'rgba(11,12,10,0)');
  octx.fillStyle = lg; octx.fillRect(0, 700, 1920, 380);
  const tg2 = octx.createRadialGradient(0, 0, 0, 0, 0, 620); tg2.addColorStop(0, 'rgba(11,12,10,.6)'); tg2.addColorStop(1, 'rgba(11,12,10,0)');
  octx.fillStyle = tg2; octx.fillRect(0, 0, 640, 400);
  drawWires(T, SW);
  const tb = tStrike(T);

  /* 1 · Pier: the fronts condense into tags; the ship's box once most of her is reached */
  if (tb > 1 && T < 18.2) {
    const fadeOut = 1 - E.ss(16.4, 17.8, T);
    for (const q of CH1) {
      const age = tb - q.rt - .25; if (age < 0) continue;
      const p = C.project(X.ap(SW, q.anchor)); if (!p || p[1] - q.stemL < 70 || p[1] > MENU_Y) continue;
      const a = E.ss(0, .35, age) * fadeOut; if (a < .02) continue;
      stem(p[0], p[1], q.stemL, a);
      dot(p[0], p[1], 3, LIME[0], LIME[1], LIME[2], a);
      setTag(q.tg, q.id, q.lab, q.val, 'lime sm', p[0] - 1, p[1] - q.stemL - 21, a, E.sat(age / .9), T);
    }
    const a = E.ss(TB + 6.4, TB + 7.4, T) * fadeOut, b = pbounds(BS_SHIP, SW);
    if (b && a > .02) { const br = bracket([Math.max(24, b[0]), b[1], Math.min(1896, b[2]), Math.min(b[3], MENU_Y - 24)], WHc, .55 * a, 10, 16); setTag(T_.ship, 'DDG-51', 'Arleigh Burke · Flight IIA', '155 m', '', br[0], br[1] - 30, a, E.sat((T - TB - 6.4) / 1.2), T); }
  }
  /* 2 · the slice: a tag rides it along the deck line */
  if (T > XO0 + .1 && T < XO1 + .2) {
    const z = openZ(T), a = E.ss(XO0 + .1, XO0 + .6, T) * (1 - E.ss(XO1 - .5, XO1 + .1, T));
    const top = Math.max(DA.deckY(E.clamp(z, -77, 77)) + .2, z > 1.5 && z < 35 ? 19.8 : z > -23.5 && z < 1.5 ? 10.6 : z < -34 && z > -53 ? 13.4 : 0);
    const p = C.project(X.ap(SW, [0, top, z])), q = C.project(X.ap(SW, [0, top + 9, z]));
    if (p && q && a > .02 && q[1] > 80) { leader(p[0], p[1], q[0], q[1], LIMEc, .8 * a); setTag(T_.slice, 'X-RAY', 'DDG-51 · hull', `z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)} m`, 'lime sm', q[0] - 6, q[1] - 22, a); }
  }
  /* 2 · the fly-through: what the lens is passing */
  if (T > 24.6 && T < 39.6) {
    const z = C.eye[2] - SW.T[2], a = E.ss(24.6, 25.2, T) * (1 - E.ss(38.9, 39.6, T)), [nm, val] = stationName(T, z);
    setTag(T_.fly, `z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)} m`, nm, val, 'lime sm', 820, 700, a);
    placeTag(T_.fly, 960 - tagW(T_.fly) / 2, 700);
  }
  /* 2 · the turbine face: a box round the bellmouth while the lens holds on it */
  if (T > 28.9 && T < 30.7) {
    const g = SM.GTS[1], a = E.ss(28.9, 29.3, T) * (1 - E.ss(30.2, 30.7, T)), W = X.mul(SW, SM.gtXf(g));
    const c = C.project(X.ap(W, [0, 0, .33])), e = C.project(X.ap(W, [0, .62, .33]));
    if (c && e && a > .02) { const rr = Math.abs(e[1] - c[1]); if (rr > 30 && rr < 520) { const br = bracket([c[0] - rr, Math.max(100, c[1] - rr), c[0] + rr, Math.min(672, c[1] + rr)], LIMEc, .85 * a, 6, 14); setTag(T_.gt, 'GT 1B', 'GE LM2500 · first stage', '30 blades', 'lime sm', br[0], Math.max(90, br[1] - 26), a); } }
  }
  /* 2 · over both engine rooms: each turbine and gear */
  if (T > 31.4 && T < 33.4) {
    const a = E.ss(31.4, 31.9, T) * (1 - E.ss(32.9, 33.4, T));
    const placed = [];
    for (const q of ER_TAGS) {
      const p = C.project(X.ap(SW, q.at)); if (!p || p[1] < 100 || p[1] > MENU_Y - 20 || p[0] < 40 || p[0] > 1860 || a < .02) continue;
      const ty = p[1] - q.st - 21; if (placed.some(([x, y]) => Math.abs(x - p[0]) < 190 && Math.abs(y - ty) < 24)) continue; placed.push([p[0], ty]);
      stem(p[0], p[1], q.st, a); dot(p[0], p[1], 3, LIME[0], LIME[1], LIME[2], a);
      setTag(q.tg, q.id, q.lab, '', 'lime sm', p[0] - 1, p[1] - q.st - 21, a, E.sat((T - 31.4) / .7), T);
    }
  }
  /* 2 · out at the stern: the propellers */
  if (T > 37.6 && T < 41) {
    const a = E.ss(37.6, 38.3, T) * (1 - E.ss(40.2, 41, T));
    let b = null; for (const sd of [1, -1]) b = pbounds(BS_PROP, X.mul(SW, X.make(R.I(), [sd * SM.PROP.x, SM.PROP.y, SM.PROP.z])), b);
    if (b && a > .02 && b[3] < MENU_Y + 80 && b[2] - b[0] < 1500) { const br = bracket([b[0], b[1], b[2], Math.min(b[3], MENU_Y - 30)], LIMEc, .8 * a, 6, 12); setTag(T_.uw, 'PROP ×2', 'CRP · 5 blades · Ø 5.2 m', 'turning gear', 'lime sm', br[0], Math.max(90, br[1] - 26), a); }
  }
  /* 3 · the exploded view: placard columns beside the ship, a dotted leader to each assembly, a box
     that fits it while it settles */
  if (T > EXO + 1.2 && T < EXB + EXB_D * 1.3) {
    const rows = []; let bx0 = 1e9, bx1 = -1e9;
    for (const p of PL) {
      const xp = explodeK(plW0(p), T), b = plBounds(p, T, SW);
      if (b) { if (b[0] < bx0) bx0 = b[0]; if (b[2] > bx1) bx1 = b[2]; }
      if (xp < .8) continue;
      const a = E.ss(.8, .97, xp) * (T > EXB ? E.ss(.55, .9, xp) : 1), q = C.project(X.ap(plXf(p, T, SW), p.anchor));
      if (q && a > .02) rows.push({ p, a, q, b, y: q[1] });
    }
    const colX = { L: Math.max(330, bx0 - 26), R: Math.min(1590, bx1 + 26) };
    for (const side of ['L', 'R']) {
      const rs = rows.filter(r => r.p.side === side).sort((u, v) => u.q[1] - v.q[1]);
      let y = 170;
      for (const r of rs) { r.y = Math.max(r.q[1], y); y = r.y + 27; }
      const over = y - 27 - (MENU_Y - 40); if (over > 0) for (const r of rs) r.y -= over;
      for (const r of rs) {
        const p = r.p, x = colX[side];
        leader(r.q[0], r.q[1], x, r.y, LIMEc, .6 * r.a);
        dot(r.q[0], r.q[1], 3, LIME[0], LIME[1], LIME[2], r.a);
        setTag(p.tg, p.id, p.lab, p.val, 'lime sm', x + 6, r.y - 11, r.a);
        if (side === 'L') placeTag(p.tg, x - 6 - tagW(p.tg), r.y - 11);
        const te = EXO + EXO_D * (plW0(p) * .8 + .55), bk = E.ss(te - .5, te - .1, T) * (1 - E.ss(te + .7, te + 2.0, T));
        if (bk > .02 && T < EXB && r.b) bracket(r.b, LIMEc, .85 * bk * r.a, 4, 8);
      }
    }
  }
  /* 4 · Underway: the ship, her radar, the wake */
  if (T > 72 && T < 101.5) {
    const q = SP.q, a = E.ss(73, 74.5, T) * (1 - E.ss(99.2, 100.4, T)), b = pbounds(BS_SHIP, SW);
    if (b && a > .02 && b[3] < MENU_Y + 60 && b[2] - b[0] < 1700) { const bb = [b[0], b[1], b[2], Math.min(b[3], MENU_Y - 20)], br = bracket(bb, WHc, .5 * a, 8, 14); setTag(T_.ship, 'DDG-51', q.v > .2 ? 'underway · outbound' : 'lines singled up', `${kn(q.v)} kn · ${hdg(q.h)}°`, '', br[0], Math.max(88, br[1] - 30), a); }
    const ra = E.ss(83.2, 84.2, T) * (1 - E.ss(88.6, 89.8, T)), sp = C.project(X.ap(SW, DA.sps));
    if (sp && ra > .02 && sp[1] - 67 > 215 && sp[1] < MENU_Y && sp[0] > 60 && sp[0] < 1600) { stem(sp[0], sp[1], 46, ra); setTag(T_.rad, 'SPS-67', 'surface search · turning', '', 'lime sm', sp[0] - 1, sp[1] - 67, ra); }
    const wa = E.ss(91, 92.5, T) * (1 - E.ss(99, 100.5, T));
    if (wa > .02 && q.s > 300) {
      const pth = H.pathAt(Math.max(0, q.s - 260)), wp = C.project([pth[0] + Math.cos(pth[2]) * 70, .3, pth[1] - Math.sin(pth[2]) * 70]);
      if (wp && wp[1] - 61 > 215 && wp[1] < MENU_Y && wp[0] > 80 && wp[0] < 1600) { stem(wp[0], wp[1], 40, wa); setTag(T_.wake, 'WAKE', 'Kelvin arms · 19.5°', '', 'lime sm', wp[0] - 1, wp[1] - 61, wa); }
    }
  }
  /* time-lapse: her track plotted on the harbour */
  const ta = E.ss(100.6, 102.2, T) * (1 - E.ss(111.2, 112.6, T));
  if (ta > .02) {
    const q = SP.q, sNow = q.mode === 1 ? q.s : H.PATH.len, n = Math.floor(sNow / 6);
    for (let k = 0; k <= n; k++) { const p = H.pathAt(k * 6), g = C.project([p[0], .5, p[1]]); if (g && g[0] > 0 && g[1] > 0 && g[0] < BW && g[1] < MENU_Y) dot(g[0], g[1], k % 20 ? 1 : 2, LIME[0], LIME[1], LIME[2], ta * .8); }
    const g = C.project(X.ap(SW, [0, 8, 0]));
    if (g && g[1] < MENU_Y) { octx.strokeStyle = LIMEc; octx.globalAlpha = ta; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(g[0], g[1], 7, 0, TAU); octx.stroke(); octx.globalAlpha = 1;
      const home = Math.cos(q.h) < -.3, lab = q.mode === 1 ? (q.z > 1150 ? (home ? 'at sea · turning for home' : 'at sea') : home ? 'inbound' : 'outbound') : q.mode === 2 ? 'twisting round' : q.mode === 3 ? 'astern · to the berth' : 'alongside';
      leader(g[0], g[1], g[0] + 30, g[1] - 40, LIMEc, .7 * ta); setTag(T_.tl, 'DDG-51', lab, `${kn(q.v)} kn`, 'lime', g[0] + 34, g[1] - 64, ta); }
  }
  /* 5 · Replenish: the crane, the canister on the hook, each cell as it seats */
  if (T > 116 && T < 149.5) {
    const a = E.ss(116.5, 118, T) * (1 - E.ss(147.5, 149.3, T));
    const cr = craneAt(T), cp = C.project(V.add(X.ap(X.make(R.I(), CRANE_O), [0, 13.2, 0]), [0, 5, 0]));
    if (cp && a > .02 && cp[1] > 90 && cp[1] < MENU_Y && cp[0] > 60 && cp[0] < 1860) { stem(cp[0], cp[1], 36, a * .8); setTag(T_.crane, 'CRANE', 'Portal jib · pier 1', '', 'sm', cp[0] - 1, cp[1] - 57, a * .9); }
    let loaded = 0;
    for (let k = 0; k < 4; k++) {
      const st = canState(k, T);
      if (T >= SEAT(k)) loaded++;
      const tg = T_['c' + k];
      if ((st === 'up' || st === 'hook') && T > 110) {
        const Tc = canXf(k, T, SW), b = pbounds(BS_CAN, Tc), mid = C.project(X.ap(Tc, [0, -SM.CAN.L * .5, 0]));
        const seen = mid && mid[0] >= 0 && mid[1] >= 0 && mid[0] < BW && mid[1] < BH && mid[2] < occAt(mid[0], mid[1]) + 3;
        if (b && seen && b[3] < MENU_Y && b[1] > 80) { const br = bracket(b, WHc, .8 * a, 5, 8); setTag(tg, `CAN ${k + 1}/4`, 'Mk 41 canister · closed', '6.7 m', 'sm', br[2] + 8, br[1] - 2, a); }
      } else if (T >= SEAT(k) && T < SEAT(k) + 5.8) {
        const c = LOADED[k], g = C.project(X.ap(SW, [c.x, c.y + .1, c.z])), ag = a * E.ss(0, .3, T - SEAT(k)) * (1 - E.ss(4.6, 5.8, T - SEAT(k)));
        if (g && g[1] < MENU_Y && g[1] > 120 && ag > .02) { stem(g[0], g[1], 30 + k * 16, ag); setTag(tg, `CELL ${k + 1}`, 'seated', '', 'lime sm', g[0] - 1, g[1] - 51 - k * 16, ag, E.sat((T - SEAT(k)) / .5), T); }
      }
    }
    const mp = C.project(X.ap(SW, [-3.2, -1.2, -27.7]));
    const ma = a * E.ss(119, 120, T);
    if (mp && ma > .02 && mp[1] < MENU_Y && mp[0] > 60 && mp[0] < 1860 && mp[1] > 90) { leader(mp[0], mp[1], mp[0] - 40, mp[1] + 36, LIMEc, .6 * ma); setTag(T_.mod, 'MOD 1', 'Mk 41 · aft · 8 cells', `${4 + loaded}/8`, 'lime sm', 0, mp[1] + 26, ma); placeTag(T_.mod, mp[0] - 44 - tagW(T_.mod), mp[1] + 26); }
  }

  // readout
  const rate = RATE(T);
  const ch = CHAPTERS.reduce((a, c) => c.t <= T ? c : a, CHAPTERS[0]), ci = CHAPTERS.indexOf(ch);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${ch.title} · ${ch.sub}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  // the scan clock: counting up from the stroke, down to the next one in the loop chapter
  const clock = T >= 150 || T < TB ? fmtClock(SIM(T) - (T >= 150 ? S_TOT : 0) - S_TB) : fmtClock(S - S_TB);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate < 9.5 ? rate.toFixed(1) : Math.round(rate)}</span>` : '×1';
  const q = SP.q;
  let l1, l2;
  if (T < 18.5) { l1 = 'DDG-51 · <b>alongside · pier 1</b>'; l2 = tb < 0 ? 'Scan <b>standby</b>' : `Scan <b>${Math.round(100 * E.sat(tb / XR.SPAN))} %</b> · strike <b>mast</b>`; }
  else if (T < 40) { const z = T < XO1 ? openZ(T) : C.eye[2] - SP.W.T[2]; l1 = 'X-ray · <b>DDG-51 hull</b>'; l2 = T < XO1 ? `Slice <b>z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)} m</b>` : `Station <b>z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)} m</b>`; }
  else if (T < 70) { l1 = 'Cutaway · <b>14 assemblies</b>'; l2 = T < XC0 ? `Exploded <b>${Math.round(explodeK(0, T) * 100)} %</b>` : `X-ray <b>closing</b>`; }
  else if (T < 110) { l1 = `DDG-51 · <b>${q.mode === 0 ? 'alongside' : q.mode === 1 ? 'underway' : q.mode === 2 ? 'twisting' : 'astern'}</b>`; l2 = `<b>${kn(q.v)} kn</b> · hdg <b>${hdg(q.h)}°</b> · ${(Math.hypot(q.x, q.z) / 1000).toFixed(2)} km`; }
  else if (T < 150) { const n = [0, 1, 2, 3].filter(k => T >= SEAT(k)).length; l1 = 'Mk 41 aft · <b>reload</b>'; l2 = T < 116 ? `DDG-51 · <b>${q.mode === 3 ? 'astern to the berth' : 'alongside'}</b>` : `Canisters <b>${n}/4</b> · ${n < 4 ? `hook <b>${canState(n, T) === 'pier' ? '→ laydown' : canState(n, T) === 'up' ? 'upending' : 'lowering'}</b>` : 'hatches <b>closing</b>'}`; }
  else { l1 = 'DDG-51 · <b>alongside · pier 1</b>'; l2 = T < 158 ? 'Scan <b>decaying</b>' : 'Scan <b>leader</b>'; }
  const html = `${l1}<br>${l2}<br>${clock} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
/* debug: ?cam=ex,ey,ez,tx,ty,tz,fov here or on the shoot page (t@cam;t@cam... per still) */
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  if (!spec) return null;
  const tq = parseFloat(STAGE.Q.get('t'));
  for (const part of spec.split(';')) { const [a, b] = part.includes('@') ? part.split('@') : [null, part]; if (a === null || Math.abs(parseFloat(a) - tq) < 1e-6) return b.split(',').map(Number); }
  return null;
})();
function render(T) {
  const S = SIM(T), SP = shipPose(T, S);
  for (const t of tagPool) t.on = false;
  FILM.apply(cam, DBGCAM ? { eye: DBGCAM.slice(0, 3), target: DBGCAM.slice(3, 6), fov: (DBGCAM[6] || 42) * DEG, roll: 0 } : camAt(T, SP.H));
  cam.near = T > 24.2 && T < 39.8 ? .03 : .3;
  const tb = tStrike(T);
  cam.shake = tb > 0 && tb < 1.2 ? FILM.shake(T, 3.4 * (1 - tb / 1.2), 22) : [0, 0];
  cam.update();
  C = cam; BD = pb.d;
  // X-ray / scan state for this frame
  const xr = XRAY(T);
  XS.zo = xr ? openZ(T) : 99; XS.zs = xr ? shutZ(T) : 99;
  XS.stn = T > 33.2 && T < 37.2 ? C.eye[2] - SP.W.T[2] - 1.6 : -99;
  XS.solid = E.ss(EXO, EXO + 3, T) * (1 - E.ss(EXB + 2, EXB + 5, T));
  XS.uw = E.mix(.5, 1, E.ss(18.4, 20.5, T) * (1 - E.ss(66, 69, T)));
  XS.boxK = E.ss(118.1, 119.4, T) * (1 - E.ss(147.8, 149.2, T));
  { let sy = -99; for (let k = -1; k < 4; k++) { const t0 = k < 0 ? 118.1 : SEAT(k), u = (T - t0) / 1.1; if (u > 0 && u < 1) sy = 8.2 - 10.6 * u; } XS.scanY = sy; }
  // after the reload the scan decays (dk) toward the pre-stroke state the loop opens in
  XS.tb = T < 18.5 ? tb : 1e9;
  XS.dk = T > 150 ? E.ss(150.8, 157.4, T) : 0;
  pb.clear(); OCC.fill(1e9);
  let t0 = performance.now();
  drawShip(T, S, SP); drawWindow(T, SP.W); pf('ship', t0); t0 = performance.now();
  occClose(); pf('occ', t0); t0 = performance.now();
  drawWorld(T, S, SP); pf('world', t0); t0 = performance.now();
  drawSisters(T); pf('sisters', t0); t0 = performance.now();
  drawMoor(T, SP.W);
  drawCrane(T, SP.W); pf('crane', t0);
  if (T > XO0 - .1 && T < XO1 + .1) drawSlice(openZ(T), SP.W, E.ss(XO0 - .1, XO0 + .2, T) * (1 - E.ss(XO1 - .2, XO1 + .1, T)));
  if (T > XC0 - .1 && T < XC1 + .1) drawSlice(shutZ(T), SP.W, E.ss(XC0 - .1, XC0 + .2, T) * (1 - E.ss(XC1 - .2, XC1 + .1, T)));
  FLASH.v = 0; drawBolt(T);
  octx.clearRect(0, 0, 1920, 1080);
  if (FLASH.v > .5) { octx.fillStyle = `rgba(236,244,226,${(FLASH.v / 255).toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  t0 = performance.now(); overlays(T, S, SP); pf('overlays', t0);
  pb.blit();
  for (const t of tagPool) if (!t.on) t.el.classList.add('off');
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const cues = [
  [158.3, () => SFX.noise(1.9, 2400, .4, .025, 1.5)],
  [TB, () => SFX.crack()],
  [TB + .15, () => SFX.rumble(4, .16)],
  [XO0, () => { SFX.tone(980, 980, .05, 'square', .012); SFX.noise(XO1 - XO0, 3200, .4, .012, 1.2); }],
  [25.0, () => SFX.noise(1.4, 420, 1.4, .05, .4)],
  [28.6, () => SFX.tone(180, 420, 2.2, 'sawtooth', .012)],
  [30.4, () => SFX.noise(2.4, 900, .7, .05, .3)],
  [33.2, () => SFX.noise(4, 160, 1.1, .04, 1.2)],
  [37.3, () => SFX.noise(3, 260, .8, .035, .6)],
  [EXO, () => SFX.tone(220, 330, 1.6, 'sine', .035)],
  [EXB, () => SFX.tone(330, 220, 1.6, 'sine', .035)],
  [XC0, () => SFX.noise(1.2, 1200, .7, .035, .3)],
  [71.0, () => { SFX.tone(98, 96, 2.6, 'sawtooth', .03); SFX.tone(196, 194, 2.6, 'sine', .015); }],
  [74, () => SFX.noise(6, 180, 1, .05, 2)],
  [100.5, () => SFX.noise(3.5, 900, .6, .05, .8)],
  [116.2, () => SFX.tone(140, 110, .2, 'square', .02)],
  ...[0, 1, 2, 3].flatMap(k => [[cycT0(k) + 1.6, () => SFX.tone(160, 120, .12, 'square', .02)], [SEAT(k), () => { SFX.tone(110, 70, .25, 'sine', .08); SFX.noise(.3, 500, 1, .05, .005); SFX.tone(1650, 1650, .05, 'square', .012, .1); }]]),
  [146.7, () => SFX.noise(1.2, 700, .8, .04, .2)],
];
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ stot: S_TOT, marks: MK, run: H.RUN.dur, tEntr: T_ENTR, log: LOG, npts: NPTS, xr: XR.nodes.length,
  asm: Object.values(ASM).map(a => a.name + ' ' + a.cl.lv.map(l => l.length / 6).join('/')), gt: [GT_STAT, GT_ROT, GT_PT, PROP_S, HELO, CANM, SISTER].map(m => m.lv.map(l => l.length / 6).join('/')),
  world: [H.NLD, H.NSE, H.NST, H.NSK] });
STAGE.dbgCan = (k, T) => { const SP = shipPose(T, SIM(T)), Tc = canXf(k, T, SP.W), out = []; for (const y of [0, -1, -3, -5, -6.5]) { const p = C.project(X.ap(Tc, [0, y, 0])); out.push(p ? [p[0] | 0, p[1] | 0, +p[2].toFixed(1), +occAt(p[0], p[1]).toFixed(1)] : null); } return { st: canState(k, T), top: Tc.T, out }; };
STAGE.prof = () => { const o = PROF || {}; const c = {}; for (const k in o) { c[k] = +o[k].toFixed(2); o[k] = 0; } return c; };
})();
