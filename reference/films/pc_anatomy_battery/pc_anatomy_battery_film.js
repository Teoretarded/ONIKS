/* ANATOMY · BATTERY (Point Cloud C): the air-defence and radar side of the battery at night, a
   museum cutaway in dots, sister of the Anatomy film. A lightning-strike scan pours down onto the
   Pantsir-S1 and the Monolith-B truck and branches through them; the X-ray slice opens the radar
   truck while its mast telescopes up stage by stage and the lens climbs to the array and round its
   back; the Pantsir floats apart into its assemblies and back; the battery keeps watch while the
   radar's beam redraws the coast; a transloader's crane swaps the two missile packs. One take,
   160 s, loops. Everything is a pure function of film time T. */
(() => {
const { V, R, X, E, Cam, rng, noise } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const Wd = WORLD, BM = BATM;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const PROF = STAGE.Q.has('prof') ? {} : null;
const pf = (k, t0) => { if (PROF) PROF[k] = (PROF[k] || 0) + performance.now() - t0; };
const LOG = [];
const t0load = performance.now();

/* ---------- menu: centred row along the bottom ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 160;
const CHAPTERS = [
  { t: 0, title: 'Scan', sub: 'Pantsir-S1 · Monolith-B' },
  { t: 18, title: 'Radar', sub: 'Monolith-B · mast' },
  { t: 45, title: 'Exploded', sub: 'Pantsir-S1 · assemblies' },
  { t: 80, title: 'Watch', sub: 'Battery · coast' },
  { t: 115, title: 'Reload', sub: 'Missile packs ×2' },
  { t: 150, title: 'Loop', sub: 'Scan' },
];
/* the reload runs at ×4; everything else in real time */
const SIM = FILM.warp([{ t: 0, rate: 1 }, { t: 114.5, rate: 1 }, { t: 118, rate: 4 }, { t: 146, rate: 4 }, { t: 149.5, rate: 1 }, { t: 160, rate: 1 }]);
const S_TOT = SIM.total;
/* periodic motion in film time stays loop-exact: the period is nudged so a whole number fits */
const loopPh = (T, period) => TAU * T / (DUR / Math.max(1, Math.round(DUR / period)));
/* monotone cubic through (xs, ys): eases through its marks without overshooting them */
function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) if (d[i - 1] * d[i] > 0) { const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i]; m[i] = 3 * (h0 + h1) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]); }
  return t => {
    if (t <= xs[0]) return ys[0]; if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (xs[i + 1] < t) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return ys[i] * (2 * u3 - 3 * u2 + 1) + m[i] * h * (u3 - 2 * u2 + u) + ys[i + 1] * (3 * u2 - 2 * u3) + m[i + 1] * h * (u3 - u2);
  };
}
const inW = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));

/* ---------- placement: the air-defence group on the battery pad, heading 20° (toward the sea) ---------- */
const PSI = 20 * DEG;
const ADF = X.make(R.y(PSI), [0, 0, 0]);
const AD = p => X.ap(ADF, p);
const PANTW = ADF;
const RAD_P = [-12, 0, -8];
const RADW = X.make(R.y(PSI), AD(RAD_P));
const TEL1W = X.make(R.y(PSI), AD([30, 0, 64])), TEL2W = X.make(R.y(PSI + 3 * DEG), AD([6, 0, 76]));
const TZ_PARK = [4.8, 0, -.8];

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
const LV = { shell: [.035, .07, .14, .28, .56], part: [.025, .05, .1, .2, .4], fine: [.016, .032, .064, .13, .26], fan: [.008, .016, .035, .07] };
const lodPrims = (prims, levels, seed, cs) => lodCloud(levels.map((sp, k) => ({ sp, pts: GEO.sample({ parts: [{ name: 'g', prims }] }, sp, seed + k * 7, {}, k >= 2 ? { fine: false } : undefined)[0].pts })), cs);
const catF = arrs => { let n = 0; for (const a of arrs) n += a.length; const o = new Float32Array(n); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return o; };
function thin(P, maxN) { const n = P.length / 6, st = Math.max(1, Math.ceil(n / maxN)), o = []; for (let i = 0; i < n; i += st) o.push(P[i * 6], P[i * 6 + 1], P[i * 6 + 2]); return new Float32Array(o); }
const boundSet = (ml, maxN) => thin(ml.lv[Math.min(ml.nl - 1, 2)], maxN || 500);

/* ---------- Pantsir-S1: the assemblies ----------
   frame: the part's own frame ('veh' vehicle, 'tur' turret, 'pit' guns/packs pitch, 'sr' search radar,
   'pL'/'pR' pack-local); off: exploded offset (vehicle frame); w0: when it leaves (0..1) */
const PZM = BM.pantsir();
const PASM = [
  ['frame', 'shell', 'veh', PZM.S.frame, [0, 0, 0], 0, 'shell'],
  ['wheelsL', 'part', 'veh', PZM.S.wheelsL, [-1.35, 0, 0], .5, 'part'],
  ['wheelsR', 'part', 'veh', PZM.S.wheelsR, [1.35, 0, 0], .5, 'part'],
  ['cab', 'shell', 'veh', PZM.cab, [0, .95, 2.4], .38, 'shell'],
  ['engine', 'hidden', 'veh', PZM.engine, [0, .45, 1.25], .44, 'fine'],
  ['body', 'shell', 'veh', PZM.S.body, [0, 1.95, 0], .3, 'shell'],
  ['power', 'hidden', 'veh', PZM.power, [0, .8, 0], .4, 'part'],
  ['ring', 'part', 'tur', PZM.S.ring, [0, 2.95, 0], .22, 'part'],
  ['turret', 'part', 'tur', PZM.S.turret, [0, 3.75, 0], .16, 'shell'],
  ['gunL', 'part', 'pit', PZM.S.gunL, [-1.15, 4.65, .4], .1, 'fine'],
  ['gunR', 'part', 'pit', PZM.S.gunR, [1.15, 4.65, .4], .1, 'fine'],
  ['packL', 'part', 'pL', PZM.packL, [-2.25, 5.65, -.2], .06, 'part'],
  ['packR', 'part', 'pR', PZM.packR, [2.25, 5.65, -.2], .06, 'part'],
  ['track', 'part', 'tur', PZM.track, [0, 4.95, 1.9], .04, 'fine'],
  ['eo', 'part', 'tur', PZM.eo, [.6, 6.25, 1.3], .03, 'fine'],
  ['search', 'part', 'sr', PZM.search, [0, 7.25, -.4], 0, 'fine'],
].map(([name, cls, fr, prims, off, w0, lv], i) => ({ name, cls, fr, off, w0, cl: lodPrims(prims, LV[lv], 100 + i * 17, cls === 'shell' ? 1.3 : .8) }));
const PA = {}; for (const a of PASM) PA[a.name] = a;
const ENG_FAN = lodPrims(PZM.engFan, LV.fan, 71, .5), PWR_FAN = lodPrims(PZM.pwrFan, LV.fan, 73, .4);

/* ---------- Monolith-B truck ---------- */
const RDM = BM.radar();
const RASM = [
  ['frame', 'shell', RDM.S.frame, 'shell'], ['wheelsL', 'part', RDM.S.wheelsL, 'part'], ['wheelsR', 'part', RDM.S.wheelsR, 'part'],
  ['cab', 'shell', RDM.cab, 'shell'], ['bay', 'shell', RDM.S.bay, 'shell'], ['body', 'shell', RDM.body, 'shell'],
  ['engine', 'hidden', RDM.engine, 'part'], ['inside', 'hidden', RDM.inside, 'part'],
].map(([name, cls, prims, lv], i) => ({ name, cls, cl: lodPrims(prims, LV[lv], 300 + i * 19, cls === 'shell' ? 1.4 : .9) }));
const RA = {}; for (const a of RASM) RA[a.name] = a;
const STAGES = RDM.stages.map((p, i) => lodPrims(p, LV.part, 360 + i * 5, .7));
const HEAD = lodPrims(RDM.head, LV.part, 390, .6);
const ARRAY = lodPrims(RDM.array, LV.part, 395, .9);
const RAD_FAN = lodPrims(RDM.radFan, LV.fan, 81, .5), AC_FAN = lodPrims(RDM.acFan, LV.fan, 83, .5);

/* ---------- the parked TELs, baked whole at one pose ---------- */
function bakeModel(model, st, levels, seed) {
  return lodCloud(levels.map((sp, k) => {
    const out = [];
    for (const s of GEO.sample(model, sp, seed + k * 5, st, k >= 1 ? { fine: false } : undefined)) {
      if (s.part.show && !s.part.show(st)) continue;
      const Tf = GEO.partXf(X.make(), s.part, st), P = s.pts;
      for (let i = 0; i < P.length; i += 6) { const q = X.ap(Tf, [P[i], P[i + 1], P[i + 2]]), n = X.dir(Tf, [P[i + 3], P[i + 4], P[i + 5]]); out.push(q[0], q[1], q[2], n[0], n[1], n[2]); }
    }
    return { sp, pts: new Float32Array(out) };
  }), 2.0);
}
const TEL_ML = bakeModel(HD.tel(), { elev: 0, dep: 1 }, [.06, .12, .24, .48], 6);

/* ---------- transloader ---------- */
const TZM = BM.transloader(PZM.cab), TZL = BM.TZL;
const TZ = {
  frame: lodPrims(TZM.C, LV.part, 500, 1.2), wheels: lodPrims(TZM.W, LV.part, 505, 1.0), cab: lodPrims(TZM.cab, LV.shell, 510, 1.2),
  bed: lodPrims(TZM.B, LV.part, 515, 1.2), legs: lodPrims(TZM.J, LV.part, 520, 1), col: lodPrims(TZM.TU, LV.part, 525, .8),
  boom: lodPrims(TZM.BM, LV.part, 530, 1), jib: lodPrims(TZM.JB, LV.part, 535, 1), hook: lodPrims(TZM.HK, LV.part, 540, .8),
};
LOG.push(`models ${(performance.now() - t0load).toFixed(0)} ms`);

/* ---------- poses ---------- */
/* Pantsir: turret slews and the guns lift during the watch; the search radar turns throughout */
const YAWK = monotone([0, 80.4, 83.4, 84.4, 88, 106, 110.5, 160], [0, 0, 55, 55, -35, -35, 0, 0].map(v => v * DEG));
const PITK = monotone([0, 80.4, 83.4, 106, 110.5, 160], [0, 0, 9, 9, 0, 0].map(v => v * DEG));
/* spin tables: a rate profile integrated once, scaled so the loop holds a whole number of turns */
function spinTable(rate) {
  const N = DUR * 120, A = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) A[k] = A[k - 1] + rate((k - .5) / 120) / 120;
  const turns = Math.max(1, Math.round(A[N] / TAU)), sc = turns * TAU / A[N];
  for (let k = 0; k <= N; k++) A[k] *= sc;
  const at = T => { const x = E.clamp(T, 0, DUR) * 120, k = Math.min(N - 1, Math.floor(x)); return A[k] + (A[k + 1] - A[k]) * (x - k); };
  return { A, N, at, turns, sc };
}
// the search radar stands still while the crane works over the turret
const SANT = spinTable(T => TAU / 2.8 * (1 - E.ss(116.5, 119, T) * (1 - E.ss(146.5, 149, T))));
const pantState = T => ({ yaw: YAWK(T), pitch: PITK(T), sAnt: SANT.at(T), fire: 0 });
/* Monolith-B: joint j slides out after joint j-1 has locked; the top stage comes down first */
const J_UP = [21.6, 23.5, 25.4, 27.3], J_DN = [127.0, 125.3, 123.6, 121.9], J_D = 1.5;
function joints(T) {
  const e = [];
  for (let j = 0; j < 4; j++) e.push(BM.MAST_RISE * inW(T, J_UP[j], J_UP[j] + J_D) * (1 - inW(T, J_DN[j], J_DN[j] + J_D)));
  return e;
}
const ARR_UP = [29.0, 31.2], ARR_DN = [119.4, 121.6];
const arrK = T => inW(T, ARR_UP[0], ARR_UP[1]) * (1 - inW(T, ARR_DN[0], ARR_DN[1]));
/* array azimuth: a rate profile integrated once; scaled so it stops on a whole number of turns */
const ANT = (() => {
  const w1 = 9 * DEG, w2 = 36 * DEG;
  const rate = T => T < 31.4 ? 0 : T < 34 ? w1 * E.ss(31.4, 34, T) : T < 74 ? w1 : T < 84 ? E.mix(w1, w2, E.ss(74, 84, T)) : T < 113 ? w2 : T < 118.6 ? w2 * (1 - E.ss(113, 118.6, T)) : 0;
  const N = DUR * 120, A = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) { const t = (k - .5) / 120; A[k] = A[k - 1] + rate(t) / 120; }
  const turns = Math.round(A[N] / TAU), sc = turns * TAU / A[N];
  for (let k = 0; k <= N; k++) A[k] *= sc;
  const at = T => { const x = E.clamp(T, 0, DUR) * 120, k = Math.min(N - 1, Math.floor(x)); return A[k] + (A[k + 1] - A[k]) * (x - k); };
  // first film time the array reaches azimuth a (rad, monotone)
  const inv = a => { if (a <= 0) return 0; if (a >= A[N]) return 1e9; let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] < a) lo = m; else hi = m; } return (lo + (a - A[lo]) / (A[hi] - A[lo] || 1)) / 120; };
  return { at, inv, total: A[N], turns, rate: T => rate(T) * sc };
})();
function radState(T) {
  const e = joints(T), mp = BM.mastPose(e), k = arrK(T), a = ANT.at(T), aw = a - TAU * Math.round(a / TAU);
  return { e, base: mp.base, top: mp.top, k, ant: a, antW: aw };
}
const ARRW = rs => X.mul(RADW, BM.arrayXf(rs.top, rs.k, rs.antW));
const HEADW = rs => X.mul(RADW, BM.headXf(rs.top, rs.k, rs.antW));
/* beam bearing (world, from north clockwise) once raised */
const beamB = T => PSI + ANT.at(T);

/* transloader: drives in from behind, parks alongside the Pantsir's right, pulls away forward
   on a right-hand arc (away from the lens coming round to the opening frame) */
const TZ_IN = [110, 118.2], TZ_OUT = [149.6, 158.2], TZ_R = 14;
function tzDrive(T) {
  if (T < TZ_IN[0] || T >= TZ_OUT[1]) return null;
  if (T < TZ_IN[1]) return -130 * Math.pow(1 - E.sat((T - TZ_IN[0]) / (TZ_IN[1] - TZ_IN[0])), 2.2);
  if (T < TZ_OUT[0]) return 0;
  return 52 * Math.pow(E.sat((T - TZ_OUT[0]) / (TZ_OUT[1] - TZ_OUT[0])), 2.2);
}
const tzDep = T => E.ss(118.4, 119.2, T) * (1 - E.ss(148.8, 149.5, T));
/* distance driven -> AD-frame pose: straight, a quarter turn of radius TZ_R to the right, straight */
function tzPose(s) {
  const x0 = TZ_PARK[0], z0 = TZ_PARK[2], s1 = 3, s2 = s1 + TZ_R * PI / 2;
  if (s <= s1) return [x0, z0 + s, 0];
  if (s <= s2) { const f = (s - s1) / TZ_R; return [x0 + TZ_R * (1 - Math.cos(f)), z0 + s1 + TZ_R * Math.sin(f), f]; }
  return [x0 + TZ_R + (s - s2), z0 + s1 + TZ_R, PI / 2];
}
function tzWorld(T) {
  const d = tzDrive(T); if (d === null) return null;
  const q = d <= 0 ? [TZ_PARK[0], TZ_PARK[2] + d, 0] : tzPose(d);
  return X.mul(ADF, X.make(R.y(q[2]), [q[0], 0, q[1]]));
}
/* crane keys (film T): hook position, boom-tip height; transloader-local */
const up = (p, h) => [p[0], p[1] + h, p[2]];
const tzLocal = p => [p[0] - TZ_PARK[0], p[1], p[2] - TZ_PARK[2]];
const PCEN = side => { const c = X.ap(BM.packXf({ yaw: 0, pitch: 0 }, side), [0, 0, 0]); return tzLocal(c); };
const HD_ = TZL.HOOK_DROP;
/* the transloader stands on the Pantsir's right: the right pack is the near one, the left pack is
   reached over the turret (lifted clear of the search radar first) */
const hN = up(PCEN(1), HD_), hF = up(PCEN(-1), HD_);
const SL = k => up(TZL.SLOTS[k], HD_);
const HOME = { p: [0, 3.0, TZL.PIVOT[2] - 4.55], tip: 3.4 };
const CK = [
  [-50, HOME.p, HOME.tip], [118.9, HOME.p, HOME.tip],
  [120.6, up(hN, 1.6), 7.2], [121.6, hN, 7.2], [122.0, hN, 7.2], [123.0, up(hN, 1.3), 7.2],
  [124.4, up(SL('sA'), 2.2), 6.9], [125.2, SL('sA'), 6.9], [125.5, SL('sA'), 6.9],
  [127.3, up(hF, 2.2), 8.2], [128.3, hF, 8.2], [128.6, hF, 8.2], [129.7, up(hF, 2.2), 8.2],
  [131.2, up(SL('sB'), 3.4), 8.0], [132.2, SL('sB'), 8.0], [132.5, SL('sB'), 8.0],
  [133.6, up(SL('fB'), 1.2), 8.0], [134.3, SL('fB'), 8.0], [134.6, SL('fB'), 8.0], [135.6, up(SL('fB'), 3.9), 8.2],
  [137.2, up(hF, 2.2), 8.2], [138.4, hF, 8.2], [138.8, hF, 8.2],
  [140.0, up(hF, 1.6), 8.2], [141.0, up(SL('fA'), 1.4), 8.0], [141.7, SL('fA'), 8.0], [142.0, SL('fA'), 8.0], [143.0, up(SL('fA'), 2.2), 7.4],
  [144.6, up(hN, 1.3), 7.2], [145.5, hN, 7.2], [145.8, hN, 7.2],
  [146.8, up(hN, 1.4), 7.2], [148.6, HOME.p, HOME.tip], [400, HOME.p, HOME.tip],
];
const PIV = TZL.PIVOT;
CK.forEach(k => { k.cy = [Math.atan2(k[1][0] - PIV[0], k[1][2] - PIV[2]), Math.hypot(k[1][0] - PIV[0], k[1][2] - PIV[2]), k[1][1], k[2]]; });
for (let i = 1; i < CK.length; i++) { let d = CK[i].cy[0] - CK[i - 1].cy[0]; while (d > PI) d -= TAU; while (d < -PI) d += TAU; CK[i].cy[0] = CK[i - 1].cy[0] + d; }
function craneAt(T) {
  let i = 0; while (i < CK.length - 2 && CK[i + 1][0] <= T) i++;
  const a = CK[i].cy, b = CK[i + 1].cy, u = E.inOut(E.sat((T - CK[i][0]) / (CK[i + 1][0] - CK[i][0])));
  const th = E.mix(a[0], b[0], u), rho = E.mix(a[1], b[1], u), hy = E.mix(a[2], b[2], u), tip = E.mix(a[3], b[3], u);
  const hook = [PIV[0] + Math.sin(th) * rho, hy, PIV[2] + Math.cos(th) * rho];
  return Object.assign(BM.craneSolve(hook, tip - hy), { hook });
}
/* the missile packs: on the turret, on the hook, or in a bed slot */
const LATCH_R = 122.0, LATCH_L = 128.6, SEAT_L = 138.4, SEAT_R = 145.5;
function packList(T) {
  const L = [], tz = tzDrive(T) !== null;
  // each side: the old pack until the hook takes it, the fresh one from its seating
  if (T < LATCH_R || T >= SEAT_R) L.push({ id: T >= SEAT_R ? 'A' : 'R0', side: 1, at: 'tur' });
  if (T < LATCH_L || T >= SEAT_L) L.push({ id: T >= SEAT_L ? 'B' : 'L0', side: -1, at: 'tur' });
  if (T >= LATCH_R && T < 125.2) L.push({ id: 'R0', side: 1, at: 'hook' });
  if (T >= LATCH_L && T < 132.2) L.push({ id: 'L0', side: -1, at: 'hook' });
  if (T >= 134.6 && T < SEAT_L) L.push({ id: 'B', side: -1, at: 'hook' });
  if (T >= 142.0 && T < SEAT_R) L.push({ id: 'A', side: 1, at: 'hook' });
  if (tz) {
    if (T >= 125.2) L.push({ id: 'R0', side: 1, at: 'bed', slot: 'sA' });
    if (T >= 132.2) L.push({ id: 'L0', side: -1, at: 'bed', slot: 'sB' });
    if (T < 134.6) L.push({ id: 'B', side: -1, at: 'bed', slot: 'fB' });
    if (T < 142.0) L.push({ id: 'A', side: 1, at: 'bed', slot: 'fA' });
  }
  return L;
}

/* ---------- X-ray: slices along the vehicle's own z, one opens the steel, one closes it ---------- */
const RX = { o: [18.4, 21.9], c: [41.4, 44.4], zf: 7.0, zr: -7.6 };
const PX = { o: [46.2, 49.6], c: [76.2, 79.4], zf: 6.0, zr: -5.8 };
const sliceZ = (X_, a, T) => T < a[0] ? 99 : T > a[1] ? -99 : X_.zf + (X_.zr - X_.zf) * inW(T, a[0], a[1]);
const RX_ON = T => T > RX.o[0] - .1 && T < RX.c[1] + .1, PX_ON = T => T > PX.o[0] - .1 && T < PX.c[1] + .1;
const ghostR = T => E.ss(18.4, 20.6, T) * (1 - E.ss(42.5, 45, T));          // the world steps back round the radar's cutaway
const ghostP = T => E.ss(46.2, 48.4, T) * (1 - E.ss(77.4, 79.8, T));
const reloadK = T => E.ss(111, 115, T) * (1 - E.ss(147.5, 151, T));        // the rest of the battery steps back round the reload
/* the exploded view: each assembly leaves at its w0 and comes home in the reverse order */
const EXO = 50.2, EXO_D = 6.0, EXB = 69.8, EXB_D = 5.6;
function explodeK(w0, T) {
  if (T < EXO || T > EXB + EXB_D * 1.4) return 0;
  const o = E.inOut(E.sat(((T - EXO) / EXO_D - w0 * .8) / .55)), b = E.inOut(E.sat(((T - EXB) / EXB_D - (.6 - w0) * .8) / .55));
  return o * (1 - b);
}

/* ---------- frames of the Pantsir's assemblies ---------- */
function frameXf(fr, st) {
  switch (fr) {
    case 'tur': return BM.turretXf(st);
    case 'pit': return BM.pitchXf(st);
    case 'sr': return BM.searchXf(st);
    case 'pL': return BM.packXf(st, -1);
    case 'pR': return BM.packXf(st, 1);
    default: return null;
  }
}
function asmXf(a, T, st) {
  const xp = explodeK(a.w0, T), f = frameXf(a.fr, st);
  let W = xp > 0 ? X.mul(PANTW, X.make(R.I(), V.mul(a.off, xp))) : PANTW;
  return f ? X.mul(W, f) : W;
}
const offXf = (off, xp) => xp > 0 ? X.mul(PANTW, X.make(R.I(), V.mul(off, xp))) : PANTW;

/* ---------- the strike's fronts: branching from the two strike points through both vehicles ---------- */
const TB = .4;                                            // film T of the return stroke
const tStrike = T => (T > 150 ? T - DUR : T) - TB;
const ST0 = pantState(0), RS0 = radState(0);
/* every cloud the fronts cross, with its world transform at the strike */
const FRONT = [];
for (const a of PASM) if (a.cls !== 'hidden') FRONT.push({ cl: a.cl, W: asmXf(a, 0, ST0), key: 'p' + a.name });
for (const a of RASM) if (a.cls !== 'hidden') FRONT.push({ cl: a.cl, W: RADW, key: 'r' + a.name });
STAGES.forEach((cl, i) => FRONT.push({ cl, W: X.mul(RADW, X.make(R.I(), [0, RS0.base[i], BM.RAD_MZ])), key: 'st' + i }));
FRONT.push({ cl: HEAD, W: HEADW(RS0), key: 'head' });
FRONT.push({ cl: ARRAY, W: ARRW(RS0), key: 'array' });
const HIT_R = X.ap(ARRW(RS0), [.6, .2, .07]), HIT_P = X.ap(X.mul(PANTW, BM.searchXf(ST0)), [0, 1.1, -.1]);
const XR = (() => {
  const Hv = .22, key = (ix, iy, iz) => ((ix + 400) * 1024 + (iy + 400)) * 1024 + (iz + 400);
  const map = new Map(), nodes = [];
  for (const f of FRONT) {
    const P = f.cl.lv[Math.min(2, f.cl.nl - 1)];
    for (let i = 0; i < P.length; i += 6) {
      const q = X.ap(f.W, [P[i], P[i + 1], P[i + 2]]), ix = Math.floor(q[0] / Hv), iy = Math.floor(q[1] / Hv), iz = Math.floor(q[2] / Hv), k = key(ix, iy, iz);
      if (!map.has(k)) { map.set(k, nodes.length); nodes.push({ ix, iy, iz, p: q }); }
    }
  }
  const NN = nodes.length, rr = rng(4711), cost = new Float32Array(NN); for (let i = 0; i < NN; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
  const t = new Float64Array(NN).fill(1e9), par = new Int32Array(NN).fill(-1), heap = [];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const near = p => { let best = 0, bd = 1e9; nodes.forEach((nd, i) => { const d = V.dist(nd.p, p); if (d < bd) { bd = d; best = i; } }); return best; };
  const s0 = near(HIT_R), s1 = near(HIT_P);
  t[s0] = 0; push(0, s0); t[s1] = .5; push(.5, s1);
  while (heap.length) {
    const [d, i] = pop(); if (d > t[i]) continue; const a = nodes[i];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      if (!dx && !dy && !dz) continue; const j = map.get(key(a.ix + dx, a.iy + dy, a.iz + dz)); if (j === undefined) continue;
      const d2 = d + V.dist(a.p, nodes[j].p) * cost[j]; if (d2 < t[j]) { t[j] = d2; par[j] = i; push(d2, j); }
    }
  }
  let tMax = 0; for (let i = 0; i < NN; i++) if (t[i] < 1e8) tMax = Math.max(tMax, t[i]);
  // film seconds after the stroke: quick through the heads, slower down to the wheels
  const SPAN = 6.8, ts = new Float32Array(NN); for (let i = 0; i < NN; i++) ts[i] = t[i] > 1e8 ? SPAN : SPAN * Math.pow(t[i] / tMax, .8);
  const jr = rng(99);
  function rtAt(p) {
    const ix = Math.floor(p[0] / Hv), iy = Math.floor(p[1] / Hv), iz = Math.floor(p[2] / Hv);
    let v = map.get(key(ix, iy, iz));
    for (let rad = 1; v === undefined && rad <= 3; rad++) for (let dx = -rad; dx <= rad && v === undefined; dx++) for (let dy = -rad; dy <= rad && v === undefined; dy++) for (let dz = -rad; dz <= rad && v === undefined; dz++) v = map.get(key(ix + dx, iy + dy, iz + dz));
    return v === undefined ? SPAN : ts[v];
  }
  function rtFor(P, W) { const out = new Float32Array(P.length / 6); for (let i = 0, j = 0; j < P.length; i++, j += 6) out[i] = rtAt(X.ap(W, [P[j], P[j + 1], P[j + 2]])) + jr() * .06; return out; }
  return { nodes, ts, par, SPAN, rtFor, rtAt };
})();
const RT = {};
for (const f of FRONT) RT[f.key] = f.cl.lv.map(P => XR.rtFor(P, f.W));
LOG.push(`xr nodes ${XR.nodes.length}, load ${(performance.now() - t0load).toFixed(0)} ms`);
/* the bolt: a stepped leader pours down out of the cloud base and forks onto both vehicles */
const BOLT = (() => {
  const rr = rng(1402);
  const disp = (a, b, depth, rough) => { let pts = [a, b]; for (let d = 0; d < depth; d++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = V.dist(p, q), m = V.lerp(p, q, .5); out.push([m[0] + (rr() - .5) * l * rough, m[1] + (rr() - .5) * l * rough * .35, m[2] + (rr() - .5) * l * rough], q); } pts = out; } return pts; };
  const top = V.add(V.lerp(HIT_R, HIT_P, .4), [-30, 230, -55]);
  const main = disp(top, HIT_R, 8, .6);
  const fi = Math.floor(main.length * .8), fork = disp(main[fi], HIT_P, 6, .55);
  const br = [];
  for (let k = 0; k < 14; k++) {
    const i = 6 + Math.floor(rr() * main.length * .8), s = main[i];
    const dir = V.norm(V.add(V.sub(main[Math.min(main.length - 1, i + 4)], s), [(rr() - .5) * 50, -rr() * 8, (rr() - .5) * 50]));
    br.push({ at: i / main.length, pts: disp(s, V.mad(s, dir, 14 + rr() * 40), 5, .5), w: .35 + .5 * rr() });
  }
  const sp = []; for (let i = 0; i < 320; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = 2.5 + rr() * 9, h = Math.sqrt(1 - u * u); sp.push([Math.cos(a) * h * s, Math.abs(u) * s * .7 + 2, Math.sin(a) * h * s, .4 + rr() * .8, i & 1]); }
  return { main, fork, fat: fi / main.length, br, sp, lead: 1.3 };
})();

/* ---------- the coast under the beam ----------
   each lattice point's bearing from the radar, and the first film time the beam crosses it after the watch begins */
const SW0 = 85.6, SW_FADE = 107.6;
const CO = Wd.CO, NCO = Wd.NCO, CO_B = new Float32Array(NCO), CO_RT = new Float32Array(NCO);
{ const rp = RADW.T, a0 = ANT.at(SW0);
  for (let k = 0; k < NCO; k++) {
    const x = CO[k * 6], z = CO[k * 6 + 2], th = Math.atan2(x - rp[0], z - rp[2]);
    CO_B[k] = th;
    let d = th - PSI - a0; d -= Math.floor(d / TAU) * TAU;
    CO_RT[k] = ANT.inv(a0 + d);
  } }
/* range rings on the ground about the radar, 1 / 2 / 3 km, drawn by the beam like the coast */
const RINGP = (() => {
  const o = [], rp = RADW.T, a0 = ANT.at(SW0);
  for (const rr of [1000, 2000, 3000]) for (let k = 0, n = Math.round(TAU * rr / 9); k < n; k++) {
    const th = k / n * TAU, x = rp[0] + Math.sin(th) * rr, z = rp[2] + Math.cos(th) * rr;
    let d = th - PSI - a0; d -= Math.floor(d / TAU) * TAU;
    o.push(x, Math.max(Wd.groundY(x, z), Wd.SEA_Y) + 1, z, ANT.inv(a0 + d), th);
  }
  return new Float32Array(o);
})();
/* the waterline point the coast tag hangs on: nearest the pad, a little west of north */
const COAST_K = (() => { let best = -1, bd = 1e9; for (let k = 0; k < NCO; k++) { if (CO[k * 6 + 4] !== 2) continue; const x = CO[k * 6], z = CO[k * 6 + 2], b = Math.atan2(x, z); if (b < -.35 || b > .05) continue; const d = Math.hypot(x, z); if (d < bd) { bd = d; best = k; } } return best; })();

/* ---------- camera ---------- */
const cam = new Cam(); cam.cy = 470;
/* the array's own frame: round its face, its back truss and under the rotary joint */
const HKEYS = [
  { t: 31.2, eye: [-7.0, 1.2, 6.8], target: [0, -.2, 0], fov: 46 },
  { t: 33.8, eye: [-7.6, 2.6, -1.4], target: [0, -.2, -.2], fov: 46 },
  { t: 36.2, eye: [-3.8, 1.4, -6.9], target: [0, -.3, -.3], fov: 46 },
  { t: 38.4, eye: [1.6, .5, -7.0], target: [0, -.3, -.3], fov: 46 },
  { t: 40.4, eye: [3.0, -2.9, -3.4], target: [0, -.7, -.2], fov: 50 },
  { t: 42.2, eye: [2.8, -1.8, 7.4], target: [0, -.9, 0], fov: 48 },
];
const HPATH = FILM.path(HKEYS);
const headFrame = T => { const H = HEADW(radState(T)); return X.make(H.R, X.ap(H, [0, .7, 0])); };
function headKey(t) { const q = headFrame(t), h = HPATH(t); return { t, eye: X.ap(q, h.eye), target: X.ap(q, h.target), fov: h.fov / DEG }; }
const KEYS = [
  // 1 · Scan: the pair from the front quarter; a slow push, then between them to the radar's flank
  { t: 0, eye: AD([6.2, 6.4, 22.5]), target: AD([-6, 1.9, -4.5]), fov: 39 },
  { t: 7, eye: AD([5.4, 6.1, 20.8]), target: AD([-6.1, 2.0, -4.6]), fov: 39 },
  { t: 12.4, eye: AD([-1, 6.3, 22.5]), target: AD([-7.5, 2.3, -5.2]), fov: 40 },
  // round the radar's nose to its left flank
  { t: 16.4, eye: AD([-15, 6.2, 13.5]), target: AD([-12, 2.4, -7.2]), fov: 46 },
  // 2 · Radar: the slice down the flank, the climb beside the mast
  { t: 19.8, eye: AD([-25.5, 5.8, 2.5]), target: AD([-12, 2.5, -8.2]), fov: 48 },
  { t: 22.6, eye: AD([-24.5, 6.4, -3.5]), target: AD([-12, 3.4, -9.4]), fov: 50 },
  { t: 25.8, eye: AD([-23.5, 8.4, -7]), target: AD([-12, 5.6, -11.8]), fov: 50 },
  { t: 28.8, eye: AD([-21.5, 11.2, -8.8]), target: AD([-12, 8.8, -13.0]), fov: 50 },
  // (31.2 .. 42.2 ride the array's own frame: these keys sit on that path, see camAt)
  headKey(31.2), headKey(36.6), headKey(42.2),
  // 3 · Exploded: swoop down to the Pantsir's front quarter
  { t: 45.8, eye: AD([13, 6.6, 12.5]), target: AD([0, 2.6, -.4]), fov: 44 },
  { t: 48.6, eye: AD([11.8, 5.4, 9.8]), target: AD([0, 2.2, -.4]), fov: 44 },
  { t: 51.8, eye: AD([19.5, 8, 12.5]), target: AD([0, 4.0, -.6]), fov: 45 },
  { t: 56, eye: AD([26, 10.5, 12.5]), target: AD([-.3, 5.8, -.6]), fov: 46 },
  { t: 60.5, eye: AD([28, 11, 4]), target: AD([-.3, 5.9, -.9]), fov: 46 },
  { t: 64.8, eye: AD([21.5, 8.2, 16]), target: AD([0, 4.5, 1.0]), fov: 46 },
  { t: 68.4, eye: AD([22.5, 11, .5]), target: AD([0, 5.6, -1.2]), fov: 46 },
  { t: 71.8, eye: AD([25.5, 10.5, 8.5]), target: AD([-.2, 5.6, -.6]), fov: 46 },
  { t: 76, eye: AD([18.5, 7.2, 12.5]), target: AD([0, 3.0, -.5]), fov: 44 },
  { t: 79.6, eye: AD([17, 6.8, 14.4]), target: AD([0, 2.8, -.8]), fov: 44 },
  // 4 · Watch: the pair from the front-left while the turret slews; up and back over the battery
  // while the beam draws the coast; down again behind the Pantsir as the transloader comes in
  { t: 84.2, eye: AD([9.5, 5.6, 14]), target: AD([-1, 3.3, -1.5]), fov: 44 },
  // over the top: the pair in plan, the array turning, then down the far side looking out to sea
  { t: 87, eye: AD([-2, 26, 2.5]), target: AD([-5.5, 1.5, -6.5]), fov: 46 },
  { t: 90, eye: AD([-24, 21, -31]), target: AD([-4, 1, 6]), fov: 48 },
  { t: 93.4, eye: AD([-40, 115, -165]), target: AD([0, -30, 220]), fov: 50 },
  { t: 97, eye: [-120, 400, -520], target: [30, -40, 360], fov: 50 },
  { t: 103, eye: [60, 430, -560], target: [0, -40, 380], fov: 50 },
  { t: 108.4, eye: AD([30, 120, -160]), target: AD([0, -10, 100]), fov: 48 },
  // down behind the pair as the transloader comes up the track
  { t: 111.6, eye: AD([30, 36, -62]), target: AD([3, 1, -8]), fov: 46 },
  { t: 114.6, eye: AD([23, 15, -32]), target: AD([5.5, 2.2, -4.5]), fov: 44 },
  // 5 · Reload: high on the rear quarter, the pair side by side; over the top to the front
  { t: 117.6, eye: AD([15, 15.5, -19]), target: AD([2.4, 2.6, -1.5]), fov: 44 },
  { t: 121.6, eye: AD([17.5, 14.5, -10]), target: AD([2.4, 3.0, -1.5]), fov: 44 },
  { t: 126.8, eye: AD([17, 15.5, 2]), target: AD([2.2, 3.2, -1.6]), fov: 44 },
  { t: 132, eye: AD([13.5, 16.5, 12]), target: AD([1.8, 3.2, -1.8]), fov: 44 },
  { t: 137.6, eye: AD([4.5, 15.5, 16.5]), target: AD([.6, 3.2, -1.8]), fov: 44 },
  { t: 142.6, eye: AD([12.5, 14.5, 14.5]), target: AD([1.8, 3.2, -1.8]), fov: 44 },
  { t: 147.2, eye: AD([14.5, 10, 17]), target: AD([2.2, 3.0, -1.8]), fov: 44 },
  // 6 · Loop: round to the opening frame as the scan pours down
  { t: 151.8, eye: AD([8, 7.6, 25]), target: AD([-4, 2.3, -3.5]), fov: 41 },
  { t: 155.5, eye: AD([6.2, 6.5, 23]), target: AD([-6, 1.9, -4.5]), fov: 39.2 },
];
KEYS.push(Object.assign({}, KEYS[0], { t: DUR }));
KEYS.sort((a, b) => a.t - b.t);
const PATH = FILM.path(KEYS, { loop: true });
function camAt(T) {
  let s = PATH(T);
  // the climb: the aim rides the top of the mast
  const wM = E.ss(20.8, 22.4, T) * (1 - E.ss(29.6, 31.2, T));
  if (wM > 0) { const rs = radState(T), hp = X.ap(RADW, [0, rs.top, BM.RAD_MZ]); s = { eye: s.eye, target: V.lerp(s.target, hp, wM * .45), fov: s.fov, roll: s.roll }; }
  // round the array in its own (turning) frame
  const wH = E.ss(31.2, 32.2, T) * (1 - E.ss(41.2, 42.2, T));
  if (wH > 0) {
    const q = headFrame(T), h = HPATH(T);
    s = { eye: V.lerp(s.eye, X.ap(q, h.eye), wH), target: V.lerp(s.target, X.ap(q, h.target), wH), fov: E.mix(s.fov, h.fov, wH), roll: s.roll * (1 - wH) };
  }
  return s;
}

/* ---------- raster ---------- */
const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
const pb = new PointBuf(cv, [11, 12, 10], { vignette: .62 });
const LIME = [198, 244, 50], WH = [238, 238, 228];
// a high moon over the vehicles' front-right quarter, where the lens mostly stands
const LK = V.norm(R.ap(R.y(PSI), [.5, .72, .46]));
let C = cam, BD = pb.d; const BW = 1920, BH = 1080;
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
/* overlay dot that replaces what is under it (max blend would let bright returns swallow lime) */
function dset(x, y, s, r, g, b, a) {
  const d = BD; const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
  if (x0 < 0 || y0 < 0 || x0 + s > BW || y0 + s > BH) return;
  for (let j = 0; j < s; j++) { let i = ((y0 + j) * BW + x0) << 2; for (let k = 0; k < s; k++, i += 4) { d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a; } }
}
const addDot = (x, y, s, r, g, b, a) => pb.add(x, y, s, r, g, b, a);

/* camera-space transform of a part: pc = A p + b; light and eye in the part's own frame; the frustum;
   the world-height row (the scan planes run in world y) */
const XF = new Float64Array(30);
function prep(Tw) {
  const M = Tw.R, t = Tw.T, e = C.eye, f = C.f, r = C.r, u = C.u, x = XF;
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
/* XS: this frame's scan state, set before each vehicle is drawn.
   zo, zs  the open and shut slices (vehicle z, travelling toward -z) · solid  shell opacity where open
   tb      seconds since the stroke (the fronts) · dk, dkY  the decay pouring down (world y of its front)
   sy, sk  the seat scan: a plane (world y) running down through a pack as it locks */
const XS = { zo: 99, zs: 99, solid: 0, tb: 1e9, dk: 0, dkY: 99, sy: -99, sk: 0 };
const OPT0 = { a: 1, lime: 0, fade: 2600, back: .09, md: 0, lodpx: 0, px0: 0, nb: false, cp: null, toV: null, ycut: undefined, dec: false, scan: false, tag: null };
const opt = o => Object.assign({}, OPT0, o);
const TV = new Float64Array(12);
/* the per-point pass every cloud shares: project, light (low moon + rim), X-ray slices, the strike's
   fronts, the decay, depth fade, dot. md: 0 plain · 1 shell (thinned where open) · 2 part (lit by the
   slices) · 3 hidden (seen only where open). ycut: vehicle-frame height below which the points are
   inside the steel (hidden unless open). */
function runPts(pts, i0, i1, spm, x, o, RTa) {
  const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, W = BW, Hh = BH, D = BD, invF = 1 / F;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const l0 = x[12], l1 = x[13], l2 = x[14], el0 = x[15], el1 = x[16], el2 = x[17], w0 = x[26], w1 = x[27], w2 = x[28], w3 = x[29];
  const a = o.a, lm = o.lime, fadeD = o.fade, back = o.back, md = o.md, kf = .55 * a / fadeD, kfar = .45 * a;
  const cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
  const zo = XS.zo, zs = XS.zs, sl = XS.solid, keepS = .34 + .56 * sl, bm = o.nb ? 1 : 3, cp = o.cp;
  const S = o.toV, ycut = o.ycut, hasY = ycut !== undefined, tb = XS.tb, rev = !!RTa;
  const dk = o.dec ? XS.dk : 0, dkY = XS.dkY, scan = o.scan && XS.sk > 0, sy = XS.sy, sk = XS.sk;
  for (let i = i0, j = i * 6; i < i1; i++, j += 6) {
    const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
    if (cp !== null && cp[0] * px + cp[1] * py + cp[2] * pz < cp[3]) continue;
    const hs = (i * .6180339887) % 1;
    let k = 0, thin = false;
    if (md || hasY) {
      let qy = py, qz = pz;
      if (S !== null) { qy = S[3] * px + S[4] * py + S[5] * pz + S[10]; qz = S[6] * px + S[7] * py + S[8] * pz + S[11]; }
      const open = md !== 0 && qz > zo && qz <= zs;
      if (hasY && qy < ycut && !open) continue;
      if (md) {
        if (md === 3 && !open) continue;
        let d = qz - zo;
        if (d > -.05 && d < 1.6) k = d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 3.2) * .8;
        d = qz - zs;
        if (d > -.05 && d < 1.2) { const k2 = d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 4) * .7; if (k2 > k) k = k2; }
        if (md === 1 && open && k < .3) { if (hs > keepS) continue; thin = true; }
      }
    }
    // the strike's fronts: dim and sparse until reached, a lime flash as they pass
    let fl = 0, dimw = 0;
    if (rev) { const age = tb - RTa[i]; if (age < 0) dimw = 1; else if (age < 1.2) fl = Math.exp(-age * 3.6); }
    // the decay toward the next strike, pouring down from the top with a lime rim
    if (dk > 0) {
      const wy = w0 * px + w1 * py + w2 * pz + w3, e = wy - dkY - .35 * hs;
      if (e > 0) { const q = e / .6; if (q >= 1) dimw = 1; else if (q > dimw) dimw = q; }
      const e2 = wy - dkY; if (e2 > -.1 && e2 < .45) { const kk = e2 < 0 ? 1 + e2 / .1 : Math.exp(-e2 * 7); if (kk > fl) fl = kk; }
    }
    if (dimw > .5 && (i & 1)) continue;
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
        b = .1 + .68 * (lam > 0 ? lam : 0) + .14 * fac + .32 * w * w * w; b *= .55 + .45 * b;
      }
    }
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz, sy2 = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz;
    if (sx < 0 || sy2 < 0 || sx >= W || sy2 >= Hh) continue;
    b *= zc < fadeD ? a - kf * zc : kfar;
    let r = cr, g = cg, bl = cb;
    if (thin) { const bt = bk ? .04 : .04 + .17 * b; b = bt + (b * .8 - bt) * sl; }
    if (dimw > 0) b *= 1 - .38 * dimw;
    if (fl > 0) { if (b < fl * 1.05 * a) b = fl * 1.05 * a; r += (LIME[0] - r) * fl; g += (LIME[1] - g) * fl; bl += (LIME[2] - bl) * fl; }
    if (scan) { const e = sy - (w0 * px + w1 * py + w2 * pz + w3); if (e > -.03 && e < .7) { const kk = (e < 0 ? 1 + e / .03 : Math.exp(-e * 4.5)) * sk; if (kk > k) k = kk; } }
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const pxs = spm * iz;
    if (pxs <= 3.6) {
      const q = ((sy2 | 0) * W + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
      if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    } else dot(sx, sy2, pxs > 7.5 ? 3 : 2, r, g, bl, b);
  }
}
const LODPX = 4.4, LODPX0 = 15;
/* toV: the cloud's frame -> its vehicle's frame (for the slices), when they differ */
function setToV(o, Tw, VW) {
  if (!VW) return;
  const inv = X.make([VW.R[0], VW.R[3], VW.R[6], VW.R[1], VW.R[4], VW.R[7], VW.R[2], VW.R[5], VW.R[8]], [0, 0, 0]);
  const M = X.mul(inv, X.make(Tw.R, V.sub(Tw.T, VW.T)));
  for (let c = 0; c < 9; c++) TV[c] = M.R[c]; TV[9] = M.T[0]; TV[10] = M.T[1]; TV[11] = M.T[2];
  o.toV = TV;
}
function drawLod(ml, Tw, o, rtArr, VW) {
  const x = prep(Tw), CH = ml.ch, SD = ml.sd, nl = ml.nl, F = C.fl, near = C.near, ex = x[15], ey = x[16], ez = x[17], oo = opt(o), PX = oo.lodpx || LODPX, PX0 = oo.px0 || LODPX0;
  if (VW && (oo.md || oo.ycut !== undefined)) setToV(oo, Tw, VW);
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(x, mx, my, mz, rad, near)) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.1, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    let li = nl - 1; while (li > 1 && ml.sp[li] * F / d > PX) li--;
    if (li === 1 && ml.sp[1] * F / d > PX0) li = 0;
    const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
    if (i1 > i0) { runPts(ml.lv[li], i0, i1, ml.sp[li], x, oo, rtArr ? rtArr[li] : null); if (PROF) { PROF['n' + li] = (PROF['n' + li] || 0) + i1 - i0; if (o && o.tag) PROF['g_' + o.tag] = (PROF['g_' + o.tag] || 0) + i1 - i0; } }
  }
}

/* ---------- world ---------- */
function drawWorld(T) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  const gk = 1 - .55 * Math.max(ghostR(T), ghostP(T));
  { const tw = loopPh(T, 7), ST = Wd.ST;
    for (let k = 0; k < Wd.NST; k++) {
      const j = k * 5, dx = ST[j], dy = ST[j + 1], dz = ST[j + 2], zc = dx * f0 + dy * f1 + dz * f2; if (zc < .05) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      dot(sx, sy, 1, 225, 228, 222, ST[j + 3] * (.75 + .25 * Math.sin(tw + ST[j + 4])) * gk);
    } }
  { const PR = Wd.PR;
    for (let k = 0; k < Wd.NPR; k++) {
      const j = k * 4, dx = PR[j] - e0, dy = PR[j + 1] - e1, dz = PR[j + 2] - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 5) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      dot(sx, sy, 1, 238, 238, 228, PR[j + 3] * .5 * gk * (zc < 60000 ? 1 - zc / 90000 : .33));
    } }
  // the battery's ring scan; from high up the 100 m disc would print a blob, so it thins to a whisper
  { const RG = Wd.RG, n = Wd.NRG, kN = E.ss(900, 220, V.len(C.eye));
    for (let k = 0; k < n; k++) {
      const j = k * 4, dx = RG[j] - e0, dy = -e1, dz = RG[j + 1] - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < .4) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      const rr = RG[j + 2], b = (.1 + .24 * (1 - kN) + .38 * kN * Math.exp(-rr / 22) + .07 * RG[j + 3]) * gk * (rr > 88 ? 1 - (rr - 88) / 12 : 1);
      dot(sx, sy, zc < 7 ? 2 : 1, 238, 238, 228, b);
    } }
  drawCoast(T);
}
/* the coast the beam draws: lit on the first pass, then an afterglow behind the beam each turn */
function drawCoast(T) {
  if (T < SW0 || T > SW_FADE + 4.6) return;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  const beam = beamB(T), sw = loopPh(T, 8.5), szF = 9 * F, R1 = Wd.R1;
  for (let k = 0; k < NCO; k++) {
    const rt = CO_RT[k]; if (T < rt) continue;
    const j = k * 6, x = CO[j], z = CO[j + 2], kind = CO[j + 4];
    let fd = 1;
    if (T > SW_FADE) { const q = (T - SW_FADE - CO[j + 5] * 3) / 1.5; if (q >= 1) continue; if (q > 0) fd = 1 - q; }
    const y = kind === 1 ? CO[j + 1] + .6 * Math.sin(x * .03 + z * .02 + sw) : CO[j + 1];
    const dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 3) continue;
    const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
    if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
    const age = T - rt;
    let d = beam - CO_B[k]; d -= Math.floor(d / TAU) * TAU;
    const glow = Math.exp(-d * .9), rr = Math.hypot(x, z), edge = rr > R1 - 500 ? (R1 - rr) / 500 : 1;
    if (kind === 2) { const kf = age < 1.6 ? Math.exp(-age * 2) : 0; dot(sx, sy, zc < 2600 ? 2 : 1, 245 - 47 * kf, 245 - kf, 236 - 186 * kf, (.75 + .25 * glow) * fd * edge); continue; }
    let b = CO[j + 3] * (kind === 1 ? .8 + 1.2 * glow : 1.05 + .5 * glow) * (zc < 2500 ? 1.05 - zc / 6000 : Math.max(.3, .63 - (zc - 2500) / 20000)) * fd * edge;
    const ds = szF / zc, s2 = ds > 8 ? 3 : ds > 3 ? 2 : 1;
    if (ds > 14) b *= 14 / ds;
    if (age < 1.4) { const kf = Math.exp(-age * 2.6); if (b < kf) b = kf; dot(sx, sy, s2, 238 - 40 * kf, 238 + 6 * kf, 228 - 178 * kf, Math.min(1, b)); }
    else dot(sx, sy, s2, 238, 238, 228, Math.min(1, b));
  }
  // range rings, dotted, brightest just behind the beam
  { const fr = 1 - E.ss(SW_FADE, SW_FADE + 4, T);
    for (let j = 0; j < RINGP.length; j += 5) {
      if (T < RINGP[j + 3] || (j / 5) % 3 === 2) continue;
      const q = C.project([RINGP[j], RINGP[j + 1], RINGP[j + 2]]); if (!q || q[0] < 0 || q[1] < 0 || q[0] >= BW || q[1] >= BH) continue;
      let d = beam - RINGP[j + 4]; d -= Math.floor(d / TAU) * TAU;
      dset(q[0], q[1], 1, LIME[0], LIME[1], LIME[2], (.3 + .65 * Math.exp(-d * 1.4)) * fr);
    } }
  // the beam itself: a lime line out along the array's bearing
  const sA = E.ss(SW0 - 1.2, SW0, T) * (1 - E.ss(SW_FADE - 1, SW_FADE + 1.5, T));
  if (sA > .02) {
    const rp = RADW.T, s = Math.sin(beam), c = Math.cos(beam);
    for (let rr = 24; rr < R1; rr += rr < 300 ? 3 : 7) {
      const x = rp[0] + s * rr, z = rp[2] + c * rr, y = Math.max(Wd.groundY(x, z), Wd.SEA_Y) + 1.2, g = C.project([x, y, z]); if (!g) continue;
      if (g[0] < 0 || g[1] < 0 || g[0] >= BW || g[1] >= BH) continue;
      const fo = rr > R1 - 400 ? (R1 - rr) / 400 : 1;
      dset(g[0], g[1], 2, 226, 255, 150, sA * fo);
      addDot(g[0], g[1], 7, LIME[0], LIME[1], LIME[2], .035 * sA * fo);
    }
  }
}

/* ---------- vehicles ---------- */
const FAN_RATE = 3.1;               // rev/s as drawn: slow enough that 7 blades never strobe backwards
const fanAng = (T, rate) => loopPh(T, 1 / rate);
const upToX = side => R.z(-side * PI / 2);           // fan axis +Y -> ±X
function setXray(Xs, T, VW) {
  const on = Xs === RX ? RX_ON(T) : PX_ON(T);
  XS.zo = on ? sliceZ(Xs, Xs.o, T) : 99; XS.zs = on ? sliceZ(Xs, Xs.c, T) : 99;
  XS.solid = Xs === PX ? E.ss(EXO + .5, EXO + 3, T) * (1 - E.ss(EXB + 2, EXB + 5, T)) * .85 : 0;
  return on;
}
const modeOf = (cls, xr) => !xr ? 0 : cls === 'shell' ? 1 : cls === 'part' ? 2 : 3;
function frontsOn(T) { return T < 18.5 ? tStrike(T) : null; }
function drawRadar(T, a0) {
  const xr = setXray(RX, T), rs = radState(T), tb = frontsOn(T), dec = T > 150;
  XS.tb = tb === null ? 1e9 : tb;
  const a = a0 * (1 - .72 * ghostP(T)) * (1 - .55 * reloadK(T));
  // in the background (the Pantsir's cutaway, the reload) the truck draws coarser
  const bgL = Math.max(ghostP(T), reloadK(T)) > .5 ? 7 : 0;
  for (const g of RASM) {
    if (g.cls === 'hidden' && !xr) continue;
    drawLod(g.cl, RADW, { a, md: modeOf(g.cls, xr), px0: xr && g.cls === 'shell' ? 26 : 0, lodpx: bgL, dec, tag: PROF && 'r' + g.name }, tb !== null && g.cls !== 'hidden' ? RT['r' + g.name] : null, RADW);
  }
  // the mast: each stage at its own height; inside the shelter only through the X-ray
  STAGES.forEach((cl, i) => drawLod(cl, X.mul(RADW, X.make(R.I(), [0, rs.base[i], BM.RAD_MZ])), { a, md: xr ? 2 : 0, ycut: BM.ROOF, lodpx: bgL, dec }, tb !== null ? RT['st' + i] : null, RADW));
  drawLod(HEAD, HEADW(rs), { a, md: xr ? 2 : 0, lodpx: bgL, dec }, tb !== null ? RT.head : null, RADW);
  drawLod(ARRAY, ARRW(rs), { a, md: xr ? 2 : 0, lodpx: bgL, dec }, tb !== null ? RT.array : null, RADW);
  // roof A/C fans (always), radiator fans (through the X-ray)
  const fa = fanAng(T, 2.3);
  for (const sx of [-1, 1]) drawLod(AC_FAN, X.mul(RADW, X.make(R.y(fa * sx), [sx * .715, 3.84, 1.92])), { a: 1.6 * a, dec });
  if (xr) { const ang = fanAng(T, FAN_RATE); for (const sx of [-1, 1]) drawLod(RAD_FAN, X.mul(RADW, X.make(R.mul(upToX(sx), R.y(ang * sx)), [sx * BM.MZ_FAN_C[0], BM.MZ_FAN_C[1], BM.MZ_FAN_C[2]])), { a: 2.2 * a, md: 3 }, null, RADW); }
}
function drawPantsir(T, a0) {
  const xr = setXray(PX, T), st = pantState(T), tb = frontsOn(T), dec = T > 150;
  XS.tb = tb === null ? 1e9 : tb;
  const a = a0 * (1 - .45 * ghostR(T)), rk = reloadK(T);
  const packs = packList(T);
  for (const g of PASM) {
    if (g.cls === 'hidden' && !xr) continue;
    if (g.name === 'packL' || g.name === 'packR') continue;
    // in the reload the carrier steps back so the packs read against it
    const ag = g.fr === 'veh' ? a * (1 - .42 * rk) : a;
    drawLod(g.cl, asmXf(g, T, st), { a: ag, md: modeOf(g.cls, xr), px0: xr && g.cls === 'shell' ? 26 : 0, lodpx: ghostR(T) > .5 ? 7 : 0, dec, nb: rk > .5 && g.fr === 'veh', scan: XS.sk > 0 && g.fr !== 'veh', tag: PROF && g.name }, tb !== null && g.cls !== 'hidden' ? RT['p' + g.name] : null, PANTW);
  }
  // packs on the turret
  for (const p of packs) if (p.at === 'tur') {
    const g = p.side < 0 ? PA.packL : PA.packR;
    drawLod(g.cl, asmXf(g, T, st), { a, md: modeOf('part', xr), dec, scan: XS.sk > 0, lime: freshTint(p, T) }, tb !== null ? RT['p' + g.name] : null, PANTW);
  }
  if (xr) {
    const ang = fanAng(T, FAN_RATE);
    const ex = explodeK(PA.engine.w0, T), px = explodeK(PA.power.w0, T);
    drawLod(ENG_FAN, X.mul(offXf(PA.engine.off, ex), X.make(R.mul(R.x(PI / 2), R.y(ang)), BM.PZ_FAN)), { a: 2 * a, md: 3 }, null, PANTW);
    for (const f of BM.PWR_FANS) drawLod(PWR_FAN, X.mul(offXf(PA.power.off, px), X.make(R.mul(upToX(f.sx), R.y(ang * 1.3 * f.sx)), f.c)), { a: 2 * a, md: 3 }, null, PANTW);
  }
}
function drawTEL(T) {
  const a = .62 * (1 - .8 * Math.max(ghostR(T), ghostP(T), reloadK(T)));
  if (a < .02) return;
  for (const W of [TEL1W, TEL2W]) drawLod(TEL_ML, W, { a, lodpx: 7, nb: true, dec: T > 150 });
}
function tzState(T) {
  const c = craneAt(T);
  return Object.assign(c, { dep: tzDep(T) });
}
function drawTransloader(T) {
  const W = tzWorld(T); if (!W) return;
  // it comes up the track out of the dark rather than popping in
  const fin = E.ss(TZ_IN[0], TZ_IN[0] + 2.4, T);
  const st = tzState(T), o = { a: fin, dec: T > 150 }, ob = { a: fin * (1 - .42 * reloadK(T)), nb: reloadK(T) > .5, lodpx: 5.6, dec: T > 150 };
  for (const k of ['frame', 'wheels', 'cab', 'bed']) drawLod(TZ[k], W, ob);
  drawLod(TZ.legs, X.mul(W, X.make(R.I(), [0, 1.1 * (1 - st.dep), 0])), ob);
  drawLod(TZ.col, X.mul(W, BM.slewXf(st.slew)), o);
  const BWx = X.mul(W, BM.boomXf(st));
  drawLod(TZ.boom, BWx, o);
  drawLod(TZ.jib, X.mul(BWx, X.make(R.I(), [0, 0, st.ext])), o);
  drawLod(TZ.hook, X.mul(W, X.make(R.I(), st.hook)), o);
  // hoist rope and slings
  dotLine(X.ap(W, BM.boomTip(st)), X.ap(W, st.hook), .05, .6 * fin);
  const hooked = packList(T).some(p => p.at === 'hook');
  for (const sz of [-1.3, 1.3]) {
    const se = X.ap(W, V.add(st.hook, [0, -.72, sz]));
    const lug = hooked ? X.ap(W, V.add(st.hook, [0, -HD_ + .28, sz * .95])) : V.add(se, [0, -.5, 0]);
    dotLine(se, lug, .04, .5);
  }
}
function packWorld(p, T, st) {
  if (p.at === 'tur') return asmXf(p.side < 0 ? PA.packL : PA.packR, T, st);
  const W = tzWorld(T); if (!W) return null;
  if (p.at === 'hook') { const c = craneAt(T); return X.mul(W, X.make(R.I(), [c.hook[0], c.hook[1] - HD_, c.hook[2]])); }
  return X.mul(W, X.make(R.I(), TZL.SLOTS[p.slot]));
}
/* a fresh pack carries a faint lime (identified: sealed, full) until a few seconds after it seats */
function freshTint(p, T) {
  if (p.id !== 'A' && p.id !== 'B') return 0;
  const seat = p.side > 0 ? SEAT_R : SEAT_L;
  return .32 * E.ss(116.5, 118, T) * (1 - E.ss(seat + 3, seat + 5, T));
}
function drawLoosePacks(T) {
  const st = pantState(T);
  for (const p of packList(T)) {
    if (p.at === 'tur') continue;
    const W = packWorld(p, T, st); if (!W) continue;
    drawLod(p.side < 0 ? PA.packL.cl : PA.packR.cl, W, { a: E.ss(TZ_IN[0], TZ_IN[0] + 2.4, T), scan: XS.sk > 0 && p.at === 'hook', lime: freshTint(p, T) });
  }
}
function dotLine(a, b, step, al) {
  const n = Math.max(2, Math.ceil(V.dist(a, b) / step));
  for (let k = 0; k <= n; k++) { const p = C.project(V.lerp(a, b, k / n)); if (p) dot(p[0], p[1], 1, 238, 238, 228, al); }
}
/* the slice's gantry: a lime frame round the vehicle's section where the X-ray plane is */
function drawGantry(VW, z, a, hw, h) {
  if (a < .02) return;
  const pts = [[-hw, 0], [hw, 0], [hw, h], [-hw, h], [-hw, 0]];
  for (let s = 0; s < 4; s++) {
    const p0 = X.ap(VW, [pts[s][0], pts[s][1], z]), p1 = X.ap(VW, [pts[s + 1][0], pts[s + 1][1], z]);
    const n = Math.ceil(V.dist(p0, p1) / .06);
    for (let k = 0; k <= n; k++) { const q = C.project(V.lerp(p0, p1, k / n)); if (q && (k & 1)) dset(q[0], q[1], 2, 226, 255, 150, a * .8); }
  }
}

/* ---------- the bolt, the flash, the live links over the steel ---------- */
const FLASH = { v: 0 };
function drawBolt(T) {
  const c = tStrike(T) + BOLT.lead; if (c < -.05 || c > BOLT.lead + 1.6) return;
  const tr = c - BOLT.lead, leading = tr < 0, m = BOLT.main;
  // the stepped leader: jumps every 70 ms, feeling its way down
  const reach = leading ? Math.pow(E.sat(Math.floor(c / .07) * .07 / BOLT.lead), 1.15) : 1;
  const I = leading ? .5 : Math.max(0, Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2)));
  const path = (pts, to, inten, core) => {
    for (let i = 0; i < Math.min(pts.length - 1, to); i++) {
      const a = pts[i], bq = pts[i + 1], n = Math.max(1, Math.ceil(V.dist(a, bq) / .3));
      for (let k = 0; k < n; k++) { const p = C.project(V.lerp(a, bq, k / n)); if (!p || p[0] < -40 || p[0] > BW + 40 || p[1] < -40 || p[1] > BH + 40) continue; dot(p[0], p[1], core || 2, 248, 255, 232, Math.min(1, inten)); if (k % 3 === 0) { addDot(p[0], p[1], 9, LIME[0], LIME[1], LIME[2], .035 * inten); addDot(p[0], p[1], 23, LIME[0] * .6, LIME[1] * .6, LIME[2] * .6, .011 * inten); } }
    }
  };
  if (I > .01) {
    const vis = reach * m.length;
    path(m, vis, I * 1.1, leading ? 2 : 3);
    const fs = BOLT.fat * m.length; if (vis > fs) path(BOLT.fork, (vis - fs) / (m.length - fs) * BOLT.fork.length, I * (leading ? 1 : .95), leading ? 2 : 3);
    for (const b of BOLT.br) { const s = b.at * m.length; if (vis > s) path(b.pts, (vis - s) / (m.length * .2) * b.pts.length, I * b.w * (leading ? 1 : .8)); }
    if (!leading) FLASH.v = 20 * Math.min(1, I);
  }
  if (!leading) for (const q of BOLT.sp) {
    if (tr > q[3]) continue;
    const h = q[4] ? HIT_P : HIT_R, p = C.project([h[0] + q[0] * tr, h[1] + q[1] * tr - 11 * tr * tr, h[2] + q[2] * tr]); if (!p) continue;
    const a = 1 - tr / q[3]; dot(p[0], p[1], 2, 230, 255, 170, a); addDot(p[0], p[1], 4, LIME[0], LIME[1], LIME[2], a * .08);
  }
}
function drawWires(T) {
  const tb = tStrike(T); if (tb < 0 || tb > XR.SPAN + .3 || T > 150) return;
  octx.globalCompositeOperation = 'lighter'; octx.lineWidth = 1.2; octx.strokeStyle = 'rgba(210,255,120,.8)'; octx.beginPath();
  const N = XR.nodes, TS_ = XR.ts, PAR = XR.par;
  for (let i = 0; i < N.length; i++) {
    const tn = TS_[i]; if (tb < tn || tb > tn + .16 || PAR[i] < 0) continue;
    const p = C.project(N[i].p), q = C.project(N[PAR[i]].p); if (!p || !q) continue;
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
  for (let i = keep; i < n; i++) o += s[i] === ' ' ? ' ' : (((i * 7 + fr * 13 + seed * 5) % 11) < 3 + 8 * cond ? GLY[(i * 3 + fr + seed) % GLY.length] : ' ');
  return o;
}
function setTag(tg, id, lab, val, cls, x, y, a, cond, T) {
  if (cond !== undefined && cond < 1) { lab = condense(lab, cond, T, id.length); val = cond > .75 ? val : ''; }
  const key = id + '|' + lab + '|' + val + '|' + (cls || '');
  if (tg.key !== key) { tg.key = key; tg.w = -1; tg.b.textContent = id; tg.i.textContent = lab; tg.v.textContent = val || ''; tg.v.style.display = val ? '' : 'none'; tg.el.className = 'tag ' + (cls || ''); }
  tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tg.el.style.opacity = a === undefined ? '' : a.toFixed(2);
  tg.on = true; tg.x = x; tg.y = y;
}
function placeTag(tg, x, y) { tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; tg.x = x; tg.y = y; }
const tagW = tg => { if (tg.w < 0 || tg.w === undefined) tg.w = tg.el.offsetWidth; return tg.w; };
const T_ = {};
['pant', 'rad', 'slice', 'mast', 'arr', 'truss', 'rj', 'eng', 'ops', 'tel1', 'tel2', 'radW', 'adW', 'coast', 'tz', 'pk0', 'pk1', 'pk2', 'pk3', 'seat', 'tzw'].forEach(k => T_[k] = mkTag());
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
/* overlay marks (drawn on the vector layer: the dot buffer is already on screen) */
function odot(x, y, s, a) { octx.globalAlpha = a; octx.fillStyle = LIMEc; octx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); octx.globalAlpha = 1; }
function stem(x, y, len, a) { octx.globalAlpha = a; octx.fillStyle = LIMEc; for (let yy = 6; yy <= len; yy += 3) octx.fillRect(Math.round(x), Math.round(y - yy), 1, 1); octx.globalAlpha = 1; }
const LIMEc = '#C6F432', WHc = '#ffffff';
const MENU_Y = 790;
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
const BSP = {}; for (const a of PASM) BSP[a.name] = boundSet(a.cl, a.cls === 'shell' ? 800 : 400);
const BSR = {}; for (const a of RASM) BSR[a.name] = boundSet(a.cl, 800);
const BS_ST = STAGES.map(cl => boundSet(cl, 120)), BS_HEAD = boundSet(HEAD, 100), BS_ARR = boundSet(ARRAY, 400);
const BS_TEL = boundSet(TEL_ML, 900), BS_TZ = ['frame', 'cab', 'bed'].map(k => boundSet(TZ[k], 500));
function pantBounds(T, st, withPacks) {
  let b = null;
  for (const a of PASM) { if (a.cls === 'hidden') continue; if (!withPacks && (a.name === 'packL' || a.name === 'packR')) continue; b = pbounds(BSP[a.name], asmXf(a, T, st), b); }
  return b;
}
function radBounds(T, rs) {
  let b = null;
  for (const a of RASM) if (a.cls !== 'hidden') b = pbounds(BSR[a.name], RADW, b);
  STAGES.forEach((_, i) => { if (rs.base[i] + BM.MAST_L > BM.ROOF) b = pbounds(BS_ST[i], X.mul(RADW, X.make(R.I(), [0, rs.base[i], BM.RAD_MZ])), b); });
  b = pbounds(BS_HEAD, HEADW(rs), b);
  return pbounds(BS_ARR, ARRW(rs), b);
}
/* ch1: what the fronts reach, condensing into tags (anchors in world, at the strike pose) */
const SW_ = p => X.ap(PANTW, p), SR_ = p => X.ap(RADW, p);
const CH1 = [
  ['SR', '1RS1-E · search radar', '', HIT_P, 58, 'L'],
  ['TR', '1RS2-E · tracking radar', '', X.ap(X.mul(PANTW, BM.turretXf(ST0)), [0, .8, .92]), 44, 'R'],
  ['GUN', '2A38M ×2 · 30 mm', '', X.ap(X.mul(PANTW, BM.pitchXf(ST0)), [-1.1, .44, 2.6]), 96, 'L'],
  ['PACK', '57E6 · 6 TLC ×2', '', X.ap(X.mul(PANTW, BM.packXf(ST0, -1)), [0, .22, .6]), 132, 'L'],
  ['ARR', 'Monolith-B · array stowed', '', X.ap(ARRW(RS0), [0, .9, .07]), 52, 'R'],
  ['SHL', 'Equipment shelter', '', SR_([1.42, 3.2, .8]), 30, 'R'],
].map(([id, lab, val, anchor, stemL, side]) => ({ id, lab, val, anchor, stemL, side, rt: XR.rtAt(anchor), tg: mkTag() }));
const CH1_ORD = CH1.slice().sort((a, b) => a.rt - b.rt);
/* ch3: numbered placards, the stack read top down; side: the column they read from */
const PL = [
  ['01', 'search', 'Search radar · 1RS1-E', '', [0, 1.05, 0], 'L'],
  ['02', 'track', 'Tracking radar · 1RS2-E', '', [0, .8, .92], 'R'],
  ['03', 'eo', 'EO director · TV / IR', '', [.46, 1.5, .6], 'R'],
  ['04', 'gunR', 'Twin 30 mm guns · 2A38M ×2', '', [1.1, .44, 2.3], 'R'],
  ['05', 'packR', 'Missile packs ×2 · 6 TLC each', '', [.2, .22, .4], 'R'],
  ['06', 'turret', 'Combat module · turret', '', [.5, 1.2, -.6], 'L'],
  ['07', 'ring', 'Turret ring · slewing bearing', '', [-.9, .1, 0], 'L'],
  ['08', 'body', 'Equipment module', '', [-1.1, 2.4, -3.8], 'L'],
  ['09', 'power', 'Power unit · cooling fans ×4', '', [-1.1, 2.12, -2.1], 'L'],
  ['10', 'engine', 'Engine · V8 diesel · radiator fan', '', [.5, 1.2, 4.4], 'R'],
  ['11', 'cab', 'Cab · KamAZ-6560 · crew 3', '', [1.0, 3.0, 4.4], 'R'],
  ['12', 'frame', 'Frame · KamAZ-6560 · 8×8', '', [.8, 1.2, -4.6], 'L'],
  ['13', 'wheelsR', 'Wheels ×8 · 425/85 R21', '', [1.2, 1.2, -3.3], 'L'],
].map(([id, name, lab, val, anchor, side]) => ({ id, name, lab, val, anchor, side, tg: mkTag() }));
const PL_ALSO = { gunR: ['gunL'], packR: ['packL'], wheelsR: ['wheelsL'], engine: [], power: [] };
const fmtClock = s => { const sg = s < 0 ? '−' : '+'; s = Math.abs(s); const m = Math.floor(s / 60); return `T${sg}${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const S_TB = SIM(TB);
const PACK_BS = boundSet(PA.packR.cl, 200);

function overlays(T) {
  const S = SIM(T), st = pantState(T), rs = radState(T);
  // calm the menu band and the readout corner
  const lg = octx.createLinearGradient(0, 1080, 0, 700); lg.addColorStop(0, 'rgba(11,12,10,.9)'); lg.addColorStop(.55, 'rgba(11,12,10,.55)'); lg.addColorStop(1, 'rgba(11,12,10,0)');
  octx.fillStyle = lg; octx.fillRect(0, 700, 1920, 380);
  // (darker while the drawn coast runs behind the readout)
  const ca = .6 + .3 * E.ss(87, 89, T) * (1 - E.ss(109, 111, T));
  const tg2 = octx.createRadialGradient(0, 0, 0, 0, 0, 620); tg2.addColorStop(0, `rgba(11,12,10,${ca.toFixed(2)})`); tg2.addColorStop(1, 'rgba(11,12,10,0)');
  octx.fillStyle = tg2; octx.fillRect(0, 0, 640, 400);
  drawWires(T);
  const tb = tStrike(T);

  /* 1 · Scan: the fronts condense into tags; each vehicle's box once most of it is reached */
  if (tb > .6 && T < 18.4) {
    const fadeOut = 1 - E.ss(15.6, 17.4, T), placed = [];
    // in the order the fronts reach them; a tag that would land on an earlier one climbs its stem
    for (const q of CH1_ORD) {
      const age = tb - q.rt - .25; if (age < 0) continue;
      const p = C.project(q.anchor); if (!p || p[1] > MENU_Y) continue;
      // the lens swings off the Pantsir toward the radar: its tags leave before it reaches the edge
      const a = E.ss(0, .35, age) * fadeOut * E.ss(180, 420, p[0]); if (a < .02) continue;
      setTag(q.tg, q.id, q.lab, q.val, 'lime sm', 0, 0, a, E.sat(age / .9), T);
      const w = Math.max(tagW(q.tg), 30 + 7.4 * (q.id.length + q.lab.length + q.val.length));
      let len = q.stemL, x = q.side === 'L' ? p[0] + 1 - w : p[0] - 1;
      for (let it = 0; it < 12; it++) {
        const y = p[1] - len - 21;
        if (!placed.some(b => x < b[2] + 10 && x + w > b[0] - 10 && y < b[3] + 5 && y + 20 > b[1] - 5)) break;
        len += 24;
      }
      const y = p[1] - len - 21; if (y < 60) continue;
      placed.push([x, y, x + w, y + 20]);
      stem(p[0], p[1], len, a);
      odot(p[0], p[1], 3, a);
      placeTag(q.tg, x, y);
    }
    const aB = E.ss(5.4, 6.6, tb) * fadeOut;
    if (aB > .02) {
      const bP = pantBounds(T, st, true), bR = radBounds(T, rs);
      if (bP && bP[3] < MENU_Y + 30 && bP[0] > 40) { const br = bracket(bP, WHc, .55 * aB, 8, 12); setTag(T_.pant, 'AD 01', 'Pantsir-S1 · KamAZ-6560 8×8', '', '', br[0], br[3] + 8, aB); }
      if (bR && bR[3] < MENU_Y + 30) { const br = bracket(bR, WHc, .55 * aB, 8, 12); setTag(T_.rad, 'RAD 01', 'Monolith-B · MZKT-7930 8×8', '', '', br[0], br[3] + 8, aB); }
    }
  }
  /* 2 · Radar: the slice rides the shelter roof; the mast's stages lock one by one; the array */
  if (T > RX.o[0] + .1 && T < RX.o[1] + .2) {
    const z = sliceZ(RX, RX.o, T), a = E.ss(RX.o[0] + .1, RX.o[0] + .6, T) * (1 - E.ss(RX.o[1] - .5, RX.o[1] + .1, T));
    const p = C.project(SR_([0, 3.5, z])), q = C.project(SR_([0, 5.0, z]));
    if (p && q && a > .02) { leader(p[0], p[1], q[0], q[1], LIMEc, .8 * a); setTag(T_.slice, 'X-RAY', 'Monolith-B · shelter', `z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)} m`, 'lime sm', q[0] - 6, q[1] - 22, a); }
  }
  if (T > 20.4 && T < 25) {
    const a = E.ss(20.4, 21.2, T) * (1 - E.ss(24, 24.9, T));
    for (const [tg, id, lab, anc, sd] of [[T_.eng, 'ENG', 'YaMZ-846 · V12 diesel', SR_([-.6, 2.4, 3.3]), 1], [T_.ops, 'OPS', 'Operator consoles ×2', SR_([1.1, 2.9, .2]), 1]]) {
      const p = C.project(anc); if (!p || a < .02 || p[1] > MENU_Y || p[0] < 40 || p[0] > 1880) continue;
      odot(p[0], p[1], 3, a); leader(p[0], p[1], p[0] + 26 * sd, p[1] - 34, LIMEc, .6 * a);
      setTag(tg, id, lab, '', 'lime sm', p[0] + 30 * sd, p[1] - 50, a);
    }
  }
  if (T > 21.2 && T < 33.4) {
    const a = E.ss(21.2, 21.8, T) * (1 - E.ss(32.4, 33.4, T));
    // each stage tagged at its gland as it locks
    for (let j = 0; j < 4; j++) {
      const tl = J_UP[j] + J_D; if (T < tl - .2) continue;
      const aa = a * E.ss(tl - .2, tl + .2, T), g = C.project(SR_([-.25, rs.base[j + 1], BM.RAD_MZ]));
      if (!g || aa < .02 || g[1] > MENU_Y || g[1] < 60) continue;
      const tg = [T_.pk0, T_.pk1, T_.pk2, T_.pk3][j];
      leader(g[0], g[1], g[0] - 40, g[1], LIMEc, .7 * aa); odot(g[0], g[1], 3, aa);
      setTag(tg, `S${j + 2}`, `Stage ${j + 2} · locked`, `+${BM.MAST_RISE.toFixed(2)} m`, 'lime sm', 0, g[1] - 11, aa);
      placeTag(tg, g[0] - 44 - tagW(tg), g[1] - 11);
    }
    const h = C.project(SR_([0, rs.top + .5, BM.RAD_MZ]));
    if (h && T < 30.6 && h[1] > 70) { const aa = a * (1 - E.ss(29.6, 30.6, T)); leader(h[0], h[1], h[0] + 34, h[1] - 38, WHc, .6 * aa); setTag(T_.mast, 'MAST', 'Telescopic · 5 stages', `${(rs.top).toFixed(2)} m`, 'sm', h[0] + 38, h[1] - 60, aa); }
  }
  if (T > 30.2 && T < 42) {
    const a = E.ss(30.2, 31, T) * (1 - E.ss(40.8, 41.8, T)), AW = ARRW(rs), HW = HEADW(rs);
    const ab = pbounds(BS_ARR, AW);
    if (ab && ab[3] < MENU_Y && T < 33.8) { const aa = a * (1 - E.ss(33, 33.8, T)); const br = bracket(ab, LIMEc, .85 * aa, 6, 12); setTag(T_.arr, 'ARR', 'Monolith-B · active array', ANT.rate(T) > .01 ? `${(ANT.rate(T) / TAU * 60).toFixed(1)} rpm` : `tilt ${Math.round((1 - rs.k) * 76 + 14)}°`, 'lime sm', br[0], br[1] - 24, aa); }
    const at = C.project(X.ap(AW, [1.6, .5, -.3])), aj = C.project(X.ap(HW, [0, .5, 0]));
    if (at && T > 34.6 && T < 39.8 && at[1] < MENU_Y) { const aa = a * E.ss(34.6, 35.2, T) * (1 - E.ss(39, 39.8, T)); odot(at[0], at[1], 3, aa); leader(at[0], at[1], at[0] + 30, at[1] - 40, LIMEc, .7 * aa); setTag(T_.truss, 'TRUSS', 'Back truss · 4.6 m', '', 'lime sm', at[0] + 34, at[1] - 62, aa); }
    if (aj && T > 37.8 && aj[1] < MENU_Y) { const aa = a * E.ss(37.8, 38.4, T); odot(aj[0], aj[1], 3, aa); leader(aj[0], aj[1], aj[0] + 30, aj[1] + 36, LIMEc, .7 * aa); setTag(T_.rj, 'RJ', 'Rotary joint · azimuth drive', `${(ANT.rate(T) / TAU * 60).toFixed(1)} rpm`, 'lime sm', aj[0] + 34, aj[1] + 30, aa); }
  }
  /* 3 · Exploded: placard columns beside the Pantsir, a dotted leader to each assembly, a box that fits it while it settles */
  if (T > EXO + .8 && T < EXB + EXB_D * 1.3) {
    const rows = [];
    let bx0 = 1e9, bx1 = -1e9;
    for (const c of PL) {
      const g = PA[c.name], W = asmXf(g, T, st);
      let b = pbounds(BSP[c.name], W);
      for (const nm of (PL_ALSO[c.name] || [])) b = pbounds(BSP[nm], asmXf(PA[nm], T, st), b);
      if (c.name === 'engine' || c.name === 'power') b = null;
      if (b) { if (b[0] < bx0) bx0 = b[0]; if (b[2] > bx1) bx1 = b[2]; }
      if (c.name === 'engine') b = pbounds(BSP.engine, W);
      if (c.name === 'power') b = pbounds(BSP.power, W);
      const xp = explodeK(g.w0, T); if (xp < .8 && c.name !== 'frame') continue;
      const a = c.name === 'frame' ? E.ss(EXO + 3, EXO + 4, T) * (1 - E.ss(EXB + 2.5, EXB + 3.5, T)) : E.ss(.8, .97, xp) * (T > EXB ? E.ss(.55, .9, xp) : 1), p = C.project(X.ap(W, c.anchor));
      if (p && a > .02) rows.push({ c, a, p, b, y: p[1], xp });
    }
    const colX = { L: Math.max(380, bx0 - 36), R: Math.min(1520, bx1 + 36) };
    for (const side of ['L', 'R']) {
      const rsr = rows.filter(r => r.c.side === side).sort((u, v) => u.p[1] - v.p[1]);
      let y = 150;
      for (const r of rsr) { r.y = Math.max(r.p[1], y); y = r.y + 28; }
      const over = y - 28 - (MENU_Y - 40); if (over > 0) for (const r of rsr) r.y -= over;
      for (const r of rsr) {
        const c = r.c, x = colX[side];
        leader(r.p[0], r.p[1], x, r.y, LIMEc, .65 * r.a);
        odot(r.p[0], r.p[1], 3, r.a);
        setTag(c.tg, c.id, c.lab, c.val, 'lime sm', x + 6, r.y - 11, r.a);
        if (side === 'L') placeTag(c.tg, x - 6 - tagW(c.tg), r.y - 11);
        const w0 = PA[c.name].w0, te = EXO + EXO_D * (w0 * .8 + .55), bk = E.ss(te - .5, te - .1, T) * (1 - E.ss(te + .8, te + 2.2, T));
        if (bk > .02 && T < EXB && r.b) bracket(r.b, LIMEc, .85 * bk * r.a, 5, 9);
      }
    }
  }
  /* 4 · Watch: the battery, tagged from above; the coast the beam has drawn */
  if (T > 84 && T < 112.6) {
    const a = E.ss(86, 88, T) * (1 - E.ss(110.4, 112.4, T));
    const marks = [[T_.tel1, 'TEL 1', 'K340P · Bastion-P', TEL1W, [0, 3.2, 0], 52], [T_.tel2, 'TEL 2', 'K340P · Bastion-P', TEL2W, [0, 3.2, 0], 80],
      [T_.radW, 'RAD 01', 'Monolith-B', RADW, [0, rs.top + 1.6, BM.RAD_MZ], 70], [T_.adW, 'AD 01', 'Pantsir-S1', PANTW, [0, 4.6, -1.5], 40]];
    for (const [tg, id, lab, W, anc, stemL] of marks) {
      const g = C.project(X.ap(W, anc)); if (!g || a < .02 || g[1] - stemL < 70 || g[1] > MENU_Y || g[0] < 30 || g[0] > 1880) continue;
      if (V.dist(C.eye, W.T) < 32) continue;
      stem(g[0], g[1], stemL, a);
      setTag(tg, id, lab, '', 'lime sm', g[0] - 1, g[1] - stemL - 21, a);
    }
    // the coast, once the beam has drawn it
    const cp = COAST_K < 0 ? [0, Wd.SEA_Y, 1700] : [CO[COAST_K * 6], Wd.SEA_Y + 1, CO[COAST_K * 6 + 2]], cr = COAST_K < 0 ? 1e9 : CO_RT[COAST_K];
    const g = C.project(cp), ac = a * E.ss(cr + .3, cr + 1, T);
    if (g && ac > .02 && g[1] - 57 > 64 && g[1] < MENU_Y && !(g[0] < 520 && g[1] - 57 < 230) && g[0] < 1600) { stem(g[0], g[1], 36, ac); setTag(T_.coast, 'COAST', 'Waterline · redrawn', `${(Math.hypot(cp[0], cp[2]) / 1000).toFixed(1)} km`, 'lime sm', g[0] - 1, g[1] - 57, ac); }
  }
  /* 5 · Reload: the packs, the transloader, the seatings */
  if (T > 116 && T < 151) {
    const a = E.ss(116.5, 118, T) * (1 - E.ss(149, 150.8, T));
    const tags = [T_.pk0, T_.pk1, T_.pk2, T_.pk3];
    let n = 0;
    let bedB = null, bedN = 0; const rects = [];
    for (const p of packList(T)) {
      const fresh = p.id === 'A' || p.id === 'B', seat = p.side > 0 ? SEAT_R : SEAT_L;
      const W = packWorld(p, T, st); if (!W) continue;
      // the fresh packs waiting in the bed read as one group
      if (p.at === 'bed' && fresh) { bedB = pbounds(PACK_BS, W, bedB); bedN++; continue; }
      let aa = a;
      // on the turret: the spent packs until the hook takes them, the fresh ones once seated
      if (p.at === 'tur') aa *= fresh ? E.ss(seat - .1, seat + .3, T) * (1 - E.ss(seat + 3.5, seat + 4.5, T)) : E.ss(117.6, 118.6, T);
      // the spent ones in the bed only as they are set down
      if (p.at === 'bed') { const t0 = p.side > 0 ? 125.2 : 132.2; aa *= 1 - E.ss(t0 + .8, t0 + 1.8, T); }
      if (aa < .02 || n > 3) continue;
      const b = pbounds(PACK_BS, W); if (!b || b[3] > MENU_Y || b[1] < 60) continue;
      const br = bracket(b, fresh ? LIMEc : WHc, .8 * aa, 4, 7);
      const lab = fresh ? (p.at === 'tur' ? 'seated · locked' : '6 × 57E6 · sealed') : 'spent · 6 TLC';
      const tg = tags[n++];
      setTag(tg, p.side < 0 ? 'PACK L' : 'PACK R', lab, '', fresh ? 'lime sm' : 'sm', br[0], br[1] - 24, aa);
      // two packs side by side on the turret: the second tag hangs under its box instead
      const w = tagW(tg);
      if (rects.some(q => br[0] < q[2] + 8 && br[0] + w > q[0] - 8 && br[1] - 24 < q[3] + 4 && br[1] - 4 > q[1] - 4)) placeTag(tg, br[0], br[3] + 6);
      rects.push([tg.x, tg.y, tg.x + w, tg.y + 20]);
    }
    if (bedB && n <= 3 && bedB[3] < MENU_Y && bedB[1] > 60) {
      const aa = a * E.ss(118.2, 119.2, T), br = bracket(bedB, LIMEc, .8 * aa, 4, 7);
      setTag(tags[n++], 'FRESH', `Packs ×${bedN} · 57E6 · sealed`, '', 'lime sm', br[0], br[3] + 6, aa);
    }
    // the transloader is named as it arrives and while it takes the first pack, then leaves the packs the frame
    const W = tzWorld(T), aT = a * (1 - E.ss(125.5, 126.5, T));
    if (W && aT > .02) {
      const q = C.project(X.ap(W, [0, 3.6, 4.4]));
      if (q && q[1] < MENU_Y && q[1] > 70) {
        let x = q[0] - 40, y = q[1] - 34; const w = 250;
        if (rects.some(r => x < r[2] + 8 && x + w > r[0] - 8 && y < r[3] + 4 && y + 20 > r[1] - 4)) y = q[1] + 16;
        setTag(T_.tz, 'TZM', 'Transloader · KamAZ-6560 · crane', '', 'sm', x, y, aT);
      }
    }
  }

  // readout
  const ch = CHAPTERS.reduce((a, c) => c.t <= T ? c : a, CHAPTERS[0]), ci = CHAPTERS.indexOf(ch);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${ch.title} · ${ch.sub}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  const rate = SIM.rate(T);
  const rateTxt = rate > 1.05 ? `<span class="l">×${rate.toFixed(1)}</span>` : '×1';
  const clock = fmtClock(T >= 150 ? S - S_TOT - S_TB : S - S_TB);
  let l1, l2;
  if (T < 18) { l1 = 'Pantsir-S1 · <b>Monolith-B</b>'; l2 = tb < 0 ? 'Scan <b>standby</b>' : `Scan <b>${Math.round(100 * E.sat(tb / XR.SPAN))} %</b> · strike <b>2 points</b>`; }
  else if (T < 45) { l1 = 'Monolith-B · <b>MZKT-7930</b>'; l2 = T < 29 ? `Mast <b>${rs.top.toFixed(2)} m</b> · stage <b>${1 + rs.e.filter(v => v > BM.MAST_RISE - .01).length} / 5</b>` : `Array <b>${Math.round((1 - rs.k) * 76 + 14)}°</b> tilt · <b>${(ANT.rate(T) / TAU * 60).toFixed(1)} rpm</b>`; }
  else if (T < 80) { l1 = 'Pantsir-S1 · <b>KamAZ-6560</b>'; l2 = T < EXO ? `X-ray <b>${Math.round(100 * E.sat((T - PX.o[0]) / (PX.o[1] - PX.o[0])))} %</b>` : T > PX.c[0] ? `X-ray <b>closing</b> · <b>${Math.round(100 * E.sat((T - PX.c[0]) / (PX.c[1] - PX.c[0])))} %</b>` : `Exploded <b>${Math.round(100 * explodeK(0, T))} %</b> · <b>13 assemblies</b>`; }
  else if (T < 115) { l1 = 'Battery · <b>on watch</b>'; l2 = `Monolith-B <b>${(ANT.rate(T) / TAU * 60).toFixed(1)} rpm</b> · turret <b>${Math.round(st.yaw / DEG)}°</b>`; }
  else if (T < 150) { l1 = 'Transloader · <b>packs ×2</b>'; l2 = T < LATCH_R ? 'Hook <b>→ pack R</b>' : T < 125.4 ? 'Lift <b>pack R · spent</b>' : T < LATCH_L ? 'Hook <b>→ pack L</b>' : T < 132.4 ? 'Lift <b>pack L · spent</b>' : T < SEAT_L ? 'Fresh pack <b>→ left</b>' : T < SEAT_R ? 'Fresh pack <b>→ right</b>' : 'Packs <b>seated ×2</b>'; if (T > 119.4 && T < 129) l2 += ' · mast <b>down</b>'; }
  else { l1 = 'Pantsir-S1 · <b>Monolith-B</b>'; l2 = 'Scan <b>reset</b>'; }
  const html = `${l1}<br>${l2}<br>${clock} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  if (!spec) return null;
  const tq = parseFloat(STAGE.Q.get('t'));
  for (const part of spec.split(';')) { const [a, b] = part.includes('@') ? part.split('@') : [null, part]; if (a === null || Math.abs(parseFloat(a) - tq) < 1e-6) return b.split(',').map(Number); }
  return null;
})();
function render(T) {
  for (const t of tagPool) t.on = false;
  FILM.apply(cam, DBGCAM ? { eye: AD(DBGCAM.slice(0, 3)), target: AD(DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 42) * DEG, roll: 0 } : camAt(T));
  cam.near = T > 30 && T < 43 ? .05 : .2;
  const tb = tStrike(T);
  cam.shake = tb > 0 && tb < 1.2 && T < 150 ? FILM.shake(T, 3.4 * (1 - tb / 1.2), 22) : [0, 0];
  cam.update();
  C = cam; BD = pb.d;
  // the decay pours down through both vehicles toward the next strike; the seat scans
  XS.dk = T > 150 ? E.ss(151.2, 157.6, T) : 0; XS.dkY = 7.5 - 8.5 * E.ss(151.2, 157.6, T);
  XS.sk = 0; XS.sy = -99;
  for (const ts of [SEAT_R, SEAT_L, LATCH_L, LATCH_R]) { const u = (T - ts + .15) / 1.3; if (u > 0 && u < 1) { XS.sk = Math.sin(PI * Math.min(1, u * 1.6)) * (ts > 130 ? 1 : .7); XS.sy = 4.1 - 1.3 * u; } }
  pb.clear();
  let t0 = performance.now();
  drawWorld(T); pf('world', t0); t0 = performance.now();
  drawRadar(T, 1); pf('radar', t0); t0 = performance.now();
  drawPantsir(T, 1); pf('pant', t0); t0 = performance.now();
  drawTEL(T); drawTransloader(T); drawLoosePacks(T); pf('other', t0);
  const rt = RX_ON(T), pt = PX_ON(T);
  if (rt) for (const a of [RX.o, RX.c]) if (T > a[0] - .1 && T < a[1] + .1) drawGantry(RADW, sliceZ(RX, a, T), E.ss(a[0] - .1, a[0] + .25, T) * (1 - E.ss(a[1] - .25, a[1] + .1, T)), 1.75, 4.1);
  if (pt) for (const a of [PX.o, PX.c]) if (T > a[0] - .1 && T < a[1] + .1) drawGantry(PANTW, sliceZ(PX, a, T), E.ss(a[0] - .1, a[0] + .25, T) * (1 - E.ss(a[1] - .25, a[1] + .1, T)), 1.6, 4.2);
  FLASH.v = 0; drawBolt(T);
  pb.blit();
  octx.clearRect(0, 0, 1920, 1080);
  if (FLASH.v > .5) { octx.fillStyle = `rgba(236,244,226,${(FLASH.v / 255).toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  t0 = performance.now(); overlays(T); pf('overlays', t0);
  for (const t of tagPool) if (!t.on) t.el.classList.add('off');
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const cues = [
  [158.3, () => SFX.noise(1.9, 2400, .4, .025, 1.5)],
  [TB, () => SFX.crack()],
  [TB + .15, () => SFX.rumble(4, .16)],
  [RX.o[0], () => { SFX.tone(980, 980, .05, 'square', .012); SFX.noise(RX.o[1] - RX.o[0], 3200, .4, .012, 1.2); }],
  ...J_UP.flatMap(t => [[t, () => SFX.tone(180, 260, J_D, 'sawtooth', .01)], [t + J_D, () => { SFX.tone(110, 70, .2, 'sine', .07); SFX.tone(1650, 1650, .04, 'square', .01, .06); }]]),
  [ARR_UP[0], () => SFX.tone(220, 300, 2.2, 'sine', .03)],
  [31.4, () => SFX.noise(3, 700, .6, .03, 1)],
  [RX.c[0], () => SFX.noise(1.2, 1200, .7, .035, .3)],
  [PX.o[0], () => { SFX.tone(980, 980, .05, 'square', .012); SFX.noise(PX.o[1] - PX.o[0], 3200, .4, .012, 1.2); }],
  [EXO, () => SFX.tone(220, 330, 1.6, 'sine', .035)],
  [EXB, () => SFX.tone(330, 220, 1.6, 'sine', .035)],
  [PX.c[0], () => SFX.noise(1.2, 1200, .7, .035, .3)],
  [80.8, () => SFX.noise(3, 260, .9, .04, .5)],
  ...[0, 1, 2].map(k => [SW0 + k * 10, () => SFX.tone(1500, 1500, .03, 'square', .012)]),
  [TZ_IN[0] + 1, () => SFX.noise(7, 160, 1, .05, 2)],
  [118.4, () => SFX.tone(70, 55, .35, 'sine', .07)],
  [ARR_DN[0], () => SFX.tone(300, 220, 2.2, 'sine', .025)],
  ...J_DN.map(t => [t, () => SFX.tone(240, 160, J_D, 'sawtooth', .008)]),
  ...[LATCH_L, LATCH_R].map(t => [t, () => SFX.tone(160, 120, .12, 'square', .02)]),
  ...[125.2, 132.2].map(t => [t, () => SFX.tone(110, 80, .2, 'sine', .06)]),
  ...[SEAT_R, SEAT_L].map(t => [t, () => { SFX.tone(110, 70, .25, 'sine', .08); SFX.noise(.3, 500, 1, .05, .005); SFX.tone(1650, 1650, .05, 'square', .012, .1); }]),
  [149.8, () => SFX.noise(6, 160, 1, .05, 1)],
  [151.2, () => SFX.noise(6.4, 2400, .5, .015, 3)],
];
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ stot: S_TOT, log: LOG, xr: XR.nodes.length, turns: ANT.turns, antTot: ANT.total,
  pasm: PASM.map(a => a.name + ' ' + a.cl.lv.map(l => l.length / 6).join('/')), rasm: RASM.map(a => a.name + ' ' + a.cl.lv.map(l => l.length / 6).join('/')), nco: NCO });
STAGE.prof = () => { const o = PROF || {}; const c = {}; for (const k in o) { c[k] = +o[k].toFixed(2); o[k] = 0; } return c; };
})();
