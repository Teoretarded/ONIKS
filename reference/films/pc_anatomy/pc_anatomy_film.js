/* ANATOMY (Point Cloud C): the life of one round, from its container to over the
   horizon, and the reload that puts the next one in the tube; in between, the X-ray
   opens the carrier and floats its machinery apart. One take, 160 s, loops.
   Everything is a pure function of film time T (sim time S = SIM(T) under the shown
   time-warp): flight, ejecta and smoke are tables or analytic in their age. */
(() => {
const { V, R, X, E, Cam, rng, noise } = M3;
const DEG = Math.PI / 180, TAU = Math.PI * 2;
const Wd = WORLD, A = ANAT, MOD = A.MOD;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const PROF = STAGE.Q.has('prof') ? {} : null;
const pf = (k, t0) => { if (PROF) PROF[k] = (PROF[k] || 0) + performance.now() - t0; };

/* ---------- menu: centred row along the bottom ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 160;
const CHAPTERS = [
  { t: 0, title: 'Inside', sub: 'X-ray · TLC 2' },
  { t: 20, title: 'Anatomy', sub: 'MZKT-7930 · cutaway' },
  { t: 45.5, title: 'Erect', sub: 'K340P · erector' },
  { t: 62, title: 'Launch', sub: 'EO tracker · 0.38 km' },
  { t: 79.5, title: 'Coast', sub: 'Survey · Krasnaya Kosa' },
  { t: 106.5, title: 'Return', sub: 'Battery · time-lapse' },
  { t: 124, title: 'Reload', sub: 'K342P transloader' },
];
const SIM = FILM.warp([{ t: 0, rate: 1 }, { t: 106, rate: 1 }, { t: 112, rate: 40 }, { t: 117, rate: 40 }, { t: 123, rate: 6 }, { t: 144, rate: 6 }, { t: 150, rate: 1 }, { t: 160, rate: 1 }]);
const S_TOT = SIM.total;
// periodic motion stays loop-exact: the period is nudged so a whole number fits the film's sim time
const loopPh = (S, period) => TAU * S / (S_TOT / Math.max(1, Math.round(S_TOT / period)));
const L0 = 65;             // sim time the gas generator fires
const TB = 3.0;            // film time of the X-ray strike

/* ---------- placement: world origin at TEL 1 on the pad, heading 20° (cab toward the sea) ---------- */
const PSI = 20 * DEG;
const TEL1 = X.make(R.y(PSI), [0, 0, 0]);
const TL = p => X.ap(TEL1, p);
const TLd = p => X.dir(TEL1, p);
const TEL2W = X.make(R.y(PSI + 3 * DEG), TL([-25, 0, -11]));
const PANTW = X.make(R.y(-70 * DEG), [(THEATRE.pantsirs_km[0][0] - THEATRE.base_km[0]) * 1000, 0, (THEATRE.pantsirs_km[0][1] - THEATRE.base_km[1]) * 1000]);
const TZM_PARK = [-7.2, 0, -4.5];
const TRK_EYE = TL([380, 12.5, -20]);
const TRK_PRE = TL([0, 5.6, -5.6]);                  // what the tracker holds before there is a track
/* the dolly-zoom holds the launcher at the size the erect shot framed it (DZ0, 36°), clear of the menu */
const DZ0 = TL([33, 6.2, -1.6]), DZ_T0 = TRK_PRE;

/* ---------- models ---------- */
const TELM = MOD.tel();
const SPLIT = A.splitLauncher(TELM, 1);              // TLC 2 = right tube (ESE side)
const TUBE_BASE = SPLIT.base, TLCM = SPLIT.tlc, TLC_LEN = TLCM.LEN;
const partOf = n => TELM.parts.find(p => p.name === n);
const launcherPart = partOf('launcher'), jacksPart = partOf('jacks');
const launcherXf = elev => launcherPart.xf({ elev });
const mountXf = elev => X.mul(launcherXf(elev), X.make(R.I(), TUBE_BASE));      // TLC-local -> TEL-local
const RIN = 4.72;                                                                // round mid-body station in the TLC
const TZMM = A.tzm();
const ANA = A.anatomy(TELM);

/* point clouds: stride-6 (xyz, normal) reordered into spatial chunks with bounding spheres, so
   whole chunks off screen are skipped before any per-point work */
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
function sampleModel(model, sp, seed, st, opt) {
  const out = { sp };
  for (const s of GEO.sample(model, sp, seed, st, opt)) out[s.name] = cloudOf(s.pts, sp);
  return out;
}
/* multi-level cloud: every level bucketed on one grid of cells, so each cell picks its own
   level of detail from its distance to the eye (near metal fine, far metal coarse) */
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
  return { lv, sp: levels.map(L => L.sp), ch: CH, nch: c, sd: SD, nl };
}
function sampleLevels(prims, levels, seed, st, fineFrom) {
  const part = { name: 'g', prims };
  return lodCloud(levels.map((sp, k) => ({ sp, pts: GEO.sample({ parts: [part] }, sp, seed + k * 7, st || {}, k >= (fineFrom || 9) ? { fine: false } : undefined)[0].pts })));
}
/* the carrier as the assemblies the cutaway pulls apart (one partition, used in every chapter,
   so the X-ray never swaps one set of dots for another) */
const LV_TEL = [.03, .06, .12, .24, .48], LV_IN = [.018, .032, .06, .12, .24];
const FINE_IN = { engine: 1, gearbox: 1, transfer: 1, shafts: 1, axles: 1, fanR: 1, fanL: 1, hubR: 1, hubL: 1 };
const GROUPS = ANA.groups.map((g, i) => Object.assign({}, g, { cl: sampleLevels(g.prims, FINE_IN[g.name] ? LV_IN : LV_TEL, 300 + i * 31, {}, 4), jack: /^jacks/.test(g.name) }));
const GRP = {}; for (const g of GROUPS) GRP[g.name] = g;
const LAUNCH_CL = sampleLevels(SPLIT.rest.concat(partOf('capL').prims), LV_TEL, 40, {}, 4);
const FAN_CL = sampleLevels(ANA.fan, [.006, .012, .03, .07], 41);
const ramPart = partOf('ram');
const RAM_N = 48, TEL_RAM = [];
for (let k = 0; k <= RAM_N; k++) { const s = GEO.sample({ parts: [ramPart] }, .04, 90 + k, { elev: k / RAM_N * 1.535 }); TEL_RAM.push(cloudOf(s[0].pts, .04, 3)); }
const RAMX_N = 16, RAM_X = [];
for (let k = 0; k <= RAMX_N; k++) RAM_X.push(cloudOf(GEO.sample({ parts: [{ name: 'r', prims: ANA.ramExt(1 + .55 * k / RAMX_N) }] }, .03, 140 + k)[0].pts, .03, 1.5));
/* a whole model at a fixed pose baked into one multi-level cloud (the parked TEL 2) */
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
const TEL2_ML = bakeModel(TELM, { elev: 0, dep: 0 }, [.05, .1, .2, .4], 6);
const TLC_LOD = [sampleModel(TLCM, .04, 8), sampleModel(TLCM, .07, 9)];
const TLC_ML = { shell: sampleLevels(TLCM.parts[0].prims, [.04, .07, .14, .28], 60, {}, 2), cap: sampleLevels(TLCM.parts[1].prims, [.03, .06, .12], 64, {}, 2) };
const TZM_ML = {}; TZMM.parts.forEach((p, i) => { TZM_ML[p.name] = sampleLevels(p.prims, [.03, .055, .1, .2, .4], 10 + i * 13, {}, 2); });
const PANT = MOD.pantsir(), PANT_S = sampleModel(PANT, .1, 12, {}, { fine: false });

/* the round: its outer shell only (wings and fins folding) */
const ONIKS = MOD.oniks({});
const FOLD_N = 10;
function sampleRound(sp, seed) {
  const S = {};
  for (const part of ONIKS.parts) {
    if (part.name === 'wings' || part.name === 'fins') {
      S[part.name] = [];
      for (let k = 0; k <= FOLD_N; k++) { const f = k / FOLD_N; S[part.name].push(cloudOf(GEO.sample({ parts: [part] }, sp, seed + k, { wing: f, fin: f })[0].pts, sp, .6)); }
      continue;
    }
    S[part.name] = cloudOf(GEO.sample({ parts: [part] }, sp, seed, { wing: 0, fin: 0, booster: true, cover: true })[0].pts, sp, .6);
  }
  return S;
}
const RND = [sampleRound(.03, 22), sampleRound(.07, 23)];
const BOOSTM = MOD.booster(), BOOST_S = sampleModel(BOOSTM, .03, 26);

/* ---------- flight: integrated once into a table ---------- */
const G0 = 9.81, AH = Wd.AH, UPV = [0, 1, 0];
const TAU_EXIT = Math.sqrt(2 * 9.1 / 45), TAU_IGN = TAU_EXIT + .5, TAU_BO = TAU_IGN + 4.5, TAU_SEP = TAU_BO + .08, TAU_RJ = TAU_SEP + .22;
const MNT_UP = X.mul(TEL1, mountXf(1.535));
const FLY = (() => {
  const dt = 1 / 240, N = Math.round(80 / dt);
  const pos = new Float32Array((N + 1) * 3), ax = new Float32Array((N + 1) * 3), spd = new Float32Array(N + 1);
  const d0 = X.dir(MNT_UP, [0, 0, 1]), base = X.ap(MNT_UP, [0, 0, 0]), p0 = V.mad(base, d0, RIN);
  let p = p0.slice(), v = [0, 0, 0], a = d0.slice(), th = Math.asin(d0[1]);
  const seaY = Wd.SEA_Y, hT = 15, kD = 2.3e-5;
  for (let i = 0; i <= N; i++) {
    const t = i * dt;
    pos.set(p, i * 3); ax.set(a, i * 3); spd[i] = V.len(v);
    if (t + dt <= TAU_EXIT) { const s = .5 * 45 * (t + dt) * (t + dt); p = V.mad(p0, d0, s); v = V.mul(d0, 45 * (t + dt)); continue; }
    const vl = V.len(v);
    if (t < TAU_IGN) v = V.add(v, V.mul(V.add([0, -G0, 0], V.mul(v, -kD * vl)), dt));
    else if (t < TAU_BO) {
      // pitch program: hold, pitch over toward the launch azimuth, flatten through burnout
      const u = t - TAU_IGN;
      const deg = u < .35 ? 88 : u < 2.6 ? E.mix(88, 27, E.inOut((u - .35) / 2.25)) : E.mix(27, 16, E.sat((u - 2.6) / 1.9));
      th = deg * DEG;
      a = V.norm(V.lerp(d0, V.add(V.mul(AH, Math.cos(th)), V.mul(UPV, Math.sin(th))), E.ss(.15, .6, u)));
      v = V.add(v, V.mul(V.add(V.add(V.mul(a, 118), [0, -G0, 0]), V.mul(v, -kD * vl)), dt));
      const vn = V.len(v); v = V.mul(V.norm(V.lerp(V.norm(v), a, .08)), vn);
    } else {
      // ramjet: accelerate to about Mach 2, let down to a 15 m skim over the sea
      const h = p[1] - seaY, vs = Math.max(200, vl);
      const thD = Math.asin(E.clamp(E.clamp(-(h - hT) * .3, -62, 18) / vs, -.3, .3));
      if (t >= TAU_RJ) th += (thD - th) * (1 - Math.exp(-dt / 1.1));
      a = V.add(V.mul(AH, Math.cos(th)), V.mul(UPV, Math.sin(th)));
      const thr = t < TAU_RJ ? 0 : 44 * Math.max(0, 1 - vl / 700);
      const sp = Math.max(0, vl + (thr - kD * vl * vl * (t < TAU_RJ ? 1 : .35) - G0 * Math.sin(th)) * dt);
      v = V.mul(a, sp);
    }
    p = V.mad(p, v, dt);
  }
  const at = (tau, o) => { const x = E.clamp(tau / dt, 0, N - 1), i = Math.floor(x), f = x - i; for (let c = 0; c < 3; c++) o[c] = pos[i * 3 + c] + (pos[i * 3 + 3 + c] - pos[i * 3 + c]) * f; return o; };
  const axis = tau => { const i = Math.min(N, Math.max(0, Math.round(tau / dt))); return V.norm([ax[i * 3], ax[i * 3 + 1], ax[i * 3 + 2]]); };
  const speed = tau => spd[Math.min(N, Math.max(0, Math.round(tau / dt)))];
  return { at, axis, speed, d0, base, p0 };
})();
const misPos = tau => FLY.at(tau, [0, 0, 0]);
/* body frame: +Z the axis, +Y the top; erect, the top faces -AH, so the pitch-over needs no roll */
function misXf(tau) {
  const z = FLY.axis(tau), p = misPos(tau);
  let top = V.sub(UPV, V.mul(z, V.dot(UPV, z)));
  const w = E.ss(.96, .999, Math.abs(z[1]));
  top = V.len(top) < 1e-4 ? V.mul(AH, -1) : V.norm(V.lerp(V.norm(top), V.mul(AH, -1), w));
  top = V.norm(V.sub(top, V.mul(z, V.dot(top, z))));
  const x = V.cross(top, z);
  return X.make([x[0], top[0], z[0], x[1], top[1], z[1], x[2], top[2], z[2]], p);
}
/* bodies thrown off: booster casing out of the nozzle, the intake cover, the container's front cap */
function ballistic(p0, v0, k, spin, seed, groundFn, dur) {
  const dt = 1 / 120, N = Math.round(dur / dt), P = new Float32Array((N + 1) * 3);
  let p = p0.slice(), v = v0.slice(), landed = -1, splash = false, vImp = 0;
  for (let i = 0; i <= N; i++) {
    P.set(p, i * 3);
    if (landed >= 0) continue;
    const vl = V.len(v);
    v = V.add(v, V.mul(V.add([0, -G0, 0], V.mul(v, -k * vl)), dt)); p = V.mad(p, v, dt);
    const g = groundFn(p[0], p[2]); if (p[1] < g) { p[1] = g; landed = i; splash = g <= Wd.SEA_Y + .5; vImp = V.len(v); }
  }
  return { P, N, dt, landed: landed < 0 ? 1e9 : landed * dt, splash, vImp, spin,
    at(t) { const x = E.clamp(t / dt, 0, N - 1), i = Math.floor(x), f = x - i; return [P[i * 3] + (P[i * 3 + 3] - P[i * 3]) * f, P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * f, P[i * 3 + 2] + (P[i * 3 + 5] - P[i * 3 + 2]) * f]; } };
}
const groundAt = (x, z) => Math.max(Wd.Yat(x, z), Wd.SEA_Y) + .15;
const SEPX = misXf(TAU_SEP), SEPV = V.mul(FLY.axis(TAU_SEP), FLY.speed(TAU_SEP));
const BOOST_FLY = ballistic(X.ap(SEPX, [0, 0, A.BOOSTER_Z]), V.add(SEPV, V.mul(FLY.axis(TAU_SEP), -40)), 7e-4, 6.5, 31, groundAt, 40);
const COVER_FLY = ballistic(X.ap(SEPX, [0, 0, 4.2]), V.add(SEPV, V.add(V.mul(FLY.axis(TAU_SEP), -70), [0, 16, 0])), 9e-3, 13, 32, groundAt, 40);
const MOUTH_UP = X.ap(MNT_UP, [0, 0, TLC_LEN]);
const CAP_FLY = ballistic(MOUTH_UP, V.add(V.mul(FLY.d0, 17), TLd([4.2, 0, 0])), 4e-3, 9, 33, (x, z) => Wd.Yat(x, z) + .3, 14);
const T_SPLASH = BOOST_FLY.splash ? L0 + TAU_SEP + BOOST_FLY.landed : 1e9;
const P_SPLASH = BOOST_FLY.at(BOOST_FLY.landed);
/* the destroyer out on the flight line: the track ends in its side at T_HIT */
const T_HIT = 101.4, S_HIT = SIM(T_HIT), TAU_HIT = S_HIT - L0;
const P_HIT = misPos(TAU_HIT);
const DDG_W = X.make(R.y(Wd.AZ + 98 * DEG), [P_HIT[0] + AH[0] * 10, Wd.SEA_Y, P_HIT[2] + AH[2] * 10]);
/* a camera target that puts the destroyer at screen (x, y) for this eye and lens */
const onShip = (eye, fov, x, y) => { const k = V.dist(eye, DDG_W.T) * Math.tan(fov * DEG / 2) / 540; return V.add(DDG_W.T, V.add([0, (y - 540) * k, 0], V.mul(Wd.CH, -(x - 960) * k))); };
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
/* the long lens on the destroyer: [film T, fov deg, where the ship sits on screen] */
const LENS = (() => {
  const M = [[97, 22, 900, 150], [99.4, 7.5, 900, 600], [101.2, 4.6, 900, 640], [104, 4.2, 890, 680], [107.5, 5.8, 850, 760], [110.2, 10, 820, 820], [111.6, 18, 860, 840]];
  const ts = M.map(q => q[0]);
  return { f: monotone(ts, M.map(q => Math.log(q[1]))), x: monotone(ts, M.map(q => q[2])), y: monotone(ts, M.map(q => q[3])) };
})();
// targets stay ~2 km out so the path eases the look direction, not a point racing out to the horizon
const shipKey = (t, eye, fov, x, y) => ({ t, eye, target: V.add(eye, V.mul(V.norm(V.sub(onShip(eye, fov, x, y), eye)), 2000)), fov });

/* ---------- smoke: every puff analytic in its age ---------- */
const WIND = [1.4, 0, -2.65];
const PUFF = (() => {
  const L = [], r = rng(606);
  const add = (tau, p, v, o) => L.push([tau, p[0], p[1], p[2], v[0], v[1], v[2], o.life, o.heat, o.sz, o.gr, r() * 6.283, r(), o.k || 2.4]);
  const d0 = FLY.d0;
  // cold-launch gas out of the mouth
  for (let i = 0; i < 420; i++) { const t = r() * .75, a = r() * TAU, s = 2 + r() * 7; add(t, MOUTH_UP, V.add(V.mul(d0, 4 + r() * 22), [Math.cos(a) * s, r() * 2, Math.sin(a) * s]), { life: 3 + r() * 3.5, heat: .12, sz: .45, gr: 1.4 }); }
  // ignition above the launcher: the jet reaches the pad and spreads
  const pI = misPos(TAU_IGN), gI = [pI[0], .4, pI[2]];
  for (let i = 0; i < 1500; i++) { const t = TAU_IGN + .05 + r() * .9, a = r() * TAU, s = 6 + r() * 24; add(t, gI, [Math.cos(a) * s, .4 + r() * 2.8, Math.sin(a) * s], { life: 16 + r() * 12, heat: .45, sz: 1, gr: 2.4 }); }
  // booster trail
  let acc = 0;
  for (let t = TAU_IGN; t < TAU_BO; t += 1 / 400) {
    const p = misPos(t), ax = FLY.axis(t), sp = FLY.speed(t);
    acc += sp / 400 * (p[1] < 180 ? 3 : 1.9);
    while (acc > 1) { acc -= 1;
      const nz = V.mad(p, ax, -4.9 - r() * sp / 400), j = [(r() - .5) * 8, (r() - .5) * 8, (r() - .5) * 8];
      add(t, nz, V.add(V.mul(ax, -(35 + r() * 30)), j), { life: 150 + r() * 130, heat: 1, sz: .6, gr: 3 + r() * 2.4 });
    }
  }
  const n = L.length, F = new Float32Array(n * 14);
  L.forEach((q, i) => F.set(q, i * 14));
  return { F, n };
})();
/* decorrelated unit-disc offsets for drawing a puff as a cluster of dots */
const DISK = (() => { const r = rng(515), D = new Float32Array(256 * 2); for (let i = 0; i < 256; i++) { const a = r() * TAU, q = Math.sqrt(r()); D[i * 2] = Math.cos(a) * q; D[i * 2 + 1] = Math.sin(a) * q; } return D; })();

/* ---------- the X-ray: branching fronts from the strike through the container and into the round ---------- */
const HIT = [0, .56, 5.4];                        // TLC-local, on top of the container
const inTLC = X.make(R.I(), [0, 0, RIN]);
const XR = (() => {
  const H = .1, key = (ix, iy, iz) => ((ix + 400) * 1024 + (iy + 400)) * 1024 + (iz + 400);
  const map = new Map(), nodes = [];
  const add = (c, xf) => { const P = c.pts; for (let i = 0; i < c.n; i++) { const q = xf ? X.ap(xf, [P[i * 6], P[i * 6 + 1], P[i * 6 + 2]]) : [P[i * 6], P[i * 6 + 1], P[i * 6 + 2]]; const ix = Math.floor(q[0] / H), iy = Math.floor(q[1] / H), iz = Math.floor(q[2] / H), k = key(ix, iy, iz); if (!map.has(k)) { map.set(k, nodes.length); nodes.push({ ix, iy, iz, p: q }); } } };
  add(TLC_LOD[1].shell); add(TLC_LOD[1].cap);
  for (const nm of Object.keys(RND[0])) { const v = RND[0][nm]; add(Array.isArray(v) ? v[0] : v, inTLC); }
  const NN = nodes.length, nb = nodes.map(nd => { const l = []; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) { if (!dx && !dy && !dz) continue; const q = map.get(key(nd.ix + dx, nd.iy + dy, nd.iz + dz)); if (q !== undefined) l.push(q); } return l; });
  // heavy-tailed costs: most steps cheap, a few very expensive, so the front forks into tendrils
  const rr = rng(4711), cost = new Float32Array(NN); for (let i = 0; i < NN; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
  const t = new Float64Array(NN).fill(1e9), par = new Int32Array(NN).fill(-1), heap = [];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let best = 0, bd = 1e9; nodes.forEach((nd, i) => { const d = V.dist(nd.p, HIT); if (d < bd) { bd = d; best = i; } });
  t[best] = 0; push(0, best);
  while (heap.length) { const [d, i] = pop(); if (d > t[i]) continue; const a = nodes[i]; for (const j of nb[i]) { const d2 = d + V.dist(a.p, nodes[j].p) * cost[j] / 2.3; if (d2 < t[j]) { t[j] = d2; par[j] = i; push(d2, j); } } }
  let tMax = 0; for (let i = 0; i < NN; i++) if (t[i] < 1e8) tMax = Math.max(tMax, t[i]);
  // reveal time for any cloud (by voxel; a miss takes its nearest filled neighbour)
  const jr = rng(99);
  function rtFor(c, xf) {
    const P = c.pts, out = new Float32Array(c.n);
    for (let i = 0; i < c.n; i++) {
      const q = xf ? X.ap(xf, [P[i * 6], P[i * 6 + 1], P[i * 6 + 2]]) : [P[i * 6], P[i * 6 + 1], P[i * 6 + 2]];
      const ix = Math.floor(q[0] / H), iy = Math.floor(q[1] / H), iz = Math.floor(q[2] / H);
      let v = map.get(key(ix, iy, iz));
      for (let rad = 1; v === undefined && rad <= 3; rad++) for (let dx = -rad; dx <= rad && v === undefined; dx++) for (let dy = -rad; dy <= rad && v === undefined; dy++) for (let dz = -rad; dz <= rad && v === undefined; dz++) v = map.get(key(ix + dx, iy + dy, iz + dz));
      out[i] = (v === undefined || t[v] > 1e8 ? tMax : t[v]) + jr() * .05;
    }
    return out;
  }
  return { nodes, t, par, tMax, rtFor };
})();
for (const L of TLC_LOD) for (const nm of ['shell', 'cap']) L[nm].rt = XR.rtFor(L[nm]);
for (const S of RND) for (const nm of Object.keys(S)) { const v = S[nm]; for (const c of (Array.isArray(v) ? v : [v])) c.rt = XR.rtFor(c, inTLC); }
/* the strike (the Strike menu's bolt), seeded */
const BOLT = (() => {
  const rr = rng(1402), hit = X.ap(X.mul(TEL1, mountXf(0)), HIT);
  const disp = (a, b, depth, rough) => { let pts = [a, b]; for (let d = 0; d < depth; d++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = V.dist(p, q), m = V.lerp(p, q, .5); out.push([m[0] + (rr() - .5) * l * rough, m[1] + (rr() - .5) * l * rough * .4, m[2] + (rr() - .5) * l * rough], q); } pts = out; } return pts; };
  const main = disp(V.add(hit, TLd([10, 62, 16])), hit, 7, .7);
  const br = []; for (let k = 0; k < 7; k++) { const i = 8 + Math.floor(rr() * main.length * .7), s = main[i]; const dir = V.norm(V.add(V.sub(main[Math.min(main.length - 1, i + 3)], s), [(rr() - .5) * 9, -rr() * 2, (rr() - .5) * 9])); br.push({ at: i / main.length, pts: disp(s, V.mad(s, dir, 5 + rr() * 12), 5, .55) }); }
  const sp = []; for (let i = 0; i < 420; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = 3 + rr() * 11, h = Math.sqrt(1 - u * u); sp.push([Math.cos(a) * h * s, Math.abs(u) * s * .8 + 2, Math.sin(a) * h * s, .45 + rr() * .8]); }
  return { hit, main, br, sp, lead: .28 };
})();

/* ---------- choreography ---------- */
const XRAY_ON = T => T >= TB && T < 18.1;                                         // TLC 2 under the X-ray
const CT0 = 5.0, CT1 = 12.4;
const ctZ = T => 9.5 - 9.8 * E.inOut(E.sat((T - CT0) / (CT1 - CT0)));            // CT plane, TLC-local z
const closeZ = T => sweepZ(T) - TUBE_BASE[2];                                    // the carrier slice re-closes TLC 2, base -> mouth
const focusK = T => E.ss(TB + .2, TB + 1.6, T) * (1 - E.ss(13.6, 15.4, T));     // the rest of the TEL steps back while TLC 2 is scanned
/* the carrier under the X-ray: one slice sweeps rear -> front and opens the steel, a second closes it */
const SW0 = 14.9, SW1 = 19.3, SC0 = 44.4, SC1 = 47.2, ZR = -7.6, ZF = 7.2;
const sweepZ = T => ZR + (ZF - ZR) * E.sat((T - SW0) / (SW1 - SW0));
const shutZ = T => T < SC0 ? -99 : ZR + (ZF - ZR) * E.sat((T - SC0) / (SC1 - SC0));
const TRUCK_XR = T => T > SW0 && T < SC1;
const ghostK = T => E.ss(15.2, 17.8, T) * (1 - E.ss(44.6, 47.4, T));             // the world steps back around the cutaway
/* the exploded view: each assembly leaves at its w0 and comes home in the reverse order */
const EXO = 32.4, EXO_D = 4.4, EXB = 40.4, EXB_D = 3.8;
function explodeK(w0, T) {
  if (T < EXO || T > EXB + EXB_D * 1.5) return 0;
  const o = E.inOut(E.sat(((T - EXO) / EXO_D - w0 * .8) / .55)), b = E.inOut(E.sat(((T - EXB) / EXB_D - (.52 - w0) * .8) / .55));
  return o * (1 - b);
}
const OFF_LAUNCH = 3.4, OFF_RAM = 2.2, W_RAM = .3;
const launchLift = T => OFF_LAUNCH * explodeK(0, T);

function telState(T, S) {
  const dep = S < 100 ? E.ss(47.8, 50.4, S) : 1 - E.ss(104, 108, S);
  const elev = 1.535 * E.inOut(E.sat((S - 50.8) / 8.4)) * (1 - E.inOut(E.sat((S - 88) / 15)));
  return { elev, dep, capL: 0, capR: 0 };
}
/* the transloader: offset along its heading (+ = ahead) */
function tzmDrive(T) {
  if (T >= 19 && T < 60) return 118 * Math.pow(E.ss(19, 32, T), 1.35);
  if (T >= 60 && T < 110.5) return 1e9;
  // back in the time-lapse from 1.5 km down the track behind the battery, easing into its bay
  if (T >= 110.5 && T < 125.4) return -1500 * Math.pow(1 - E.sat((T - 110.5) / 14.9), 2.4);
  return 0;
}
const tzmDep = T => T >= 124 ? E.ss(125.4, 126.8, T) : 1 - E.ss(14.5, 16.5, T);
/* crane keys (film T): hook position, boom-tip height; TZM-local */
const tel2tzm = p => V.sub(p, TZM_PARK);
const HOOK_DROP = 3.0;                          // hook above a hanging TLC's axis
const tlcMidTEL = V.add(TUBE_BASE, [0, 0, TLC_LEN / 2]);
const H_TEL = V.add(tel2tzm(tlcMidTEL), [0, HOOK_DROP, 0]);
const slotMid = k => V.add(A.TZM.SLOTS[k], [0, 0, TLC_LEN / 2]);
const H_NEAR = V.add(slotMid(0), [0, HOOK_DROP, 0]), H_FAR = V.add(slotMid(1), [0, HOOK_DROP, 0]);
const PIV = A.TZM.PIVOT;
const HOME = { p: [0, 3.25, PIV[2] - 5.2], tip: 3.52 };
const up = (p, h) => [p[0], p[1] + h, p[2]];
const CK = [
  [-50, HOME.p, HOME.tip], [126.8, HOME.p, HOME.tip],
  [128.9, up(H_TEL, 2.5), 9.3], [130.2, H_TEL, 9.3], [131.6, up(H_TEL, 2.5), 9.3],
  [134.2, up(H_FAR, 2.7), 8.9], [135.6, H_FAR, 8.9], [136.8, up(H_FAR, 1.9), 8.4],
  [138.0, up(H_NEAR, 1.9), 8.4], [139.3, H_NEAR, 8.4], [140.8, up(H_NEAR, 2.6), 9.3],
  [144.6, up(H_TEL, 2.6), 9.35], [150.2, up(H_TEL, .45), 9.35], [152.8, H_TEL, 9.35],
  [156.5, up(H_TEL, 1.6), 9.35], [160, up(H_TEL, 2.6), 9.35], [160 + 9.8, HOME.p, HOME.tip], [400, HOME.p, HOME.tip],
];
const toCyl = (p, tip) => [Math.atan2(p[0] - PIV[0], p[2] - PIV[2]), Math.hypot(p[0] - PIV[0], p[2] - PIV[2]), p[1], tip];
CK.forEach(k => { k.cy = toCyl(k[1], k[2]); });
for (let i = 1; i < CK.length; i++) { let d = CK[i].cy[0] - CK[i - 1].cy[0]; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; CK[i].cy[0] = CK[i - 1].cy[0] + d; }
function craneAt(T) {
  const t = T < 60 ? T + DUR : T;               // the swing home after the seam belongs to the reload
  let i = 0; while (i < CK.length - 2 && CK[i + 1][0] <= t) i++;
  const a = CK[i].cy, b = CK[i + 1].cy, u = E.inOut(E.sat((t - CK[i][0]) / (CK[i + 1][0] - CK[i][0])));
  const th = E.mix(a[0], b[0], u), rho = E.mix(a[1], b[1], u), hy = E.mix(a[2], b[2], u), tip = E.mix(a[3], b[3], u);
  const hook = [PIV[0] + Math.sin(th) * rho, hy, PIV[2] + Math.cos(th) * rho];
  return Object.assign(A.craneSolve(hook, tip - hy), { hook, hookYaw: 0 });
}
/* which containers exist and where: 'tel' (TLC 2 on the launcher), 'hook', 'near' / 'far' (TZM cradles) */
function tlcList(T) {
  const L = [];
  if (T < 65) L.push({ at: 'tel', loaded: true, cap: true });
  else if (T < 130.3) L.push({ at: 'tel', loaded: false, cap: false });
  else if (T < 135.7) L.push({ at: 'hook', loaded: false, cap: false });
  else L.push({ at: 'far', loaded: false, cap: false });
  if (T < 60) L.push({ at: 'far', loaded: false, cap: false });
  if (T >= 110.5 && T < 139.5) L.push({ at: 'near', loaded: true, cap: true });
  else if (T >= 139.5 && T < 153.0) L.push({ at: 'hook', loaded: true, cap: true });
  else if (T >= 153.0) L.push({ at: 'tel', loaded: true, cap: true });
  return L;
}
function tzmWorld(T) {
  const dz = tzmDrive(T); if (dz > 1e8) return null;
  const W = X.mul(TEL1, X.make(R.I(), V.add(TZM_PARK, [0, 0, dz])));
  // out on the track it rides the ground (the pad is level; the country behind it climbs)
  if (dz < -30) W.T[1] = E.mix(0, Wd.Yat(W.T[0], W.T[2]), E.ss(-30, -90, dz));
  return W;
}
function tlcXf(item, T, S) {
  if (item.at === 'tel') { const lf = launchLift(T), M = mountXf(telState(T, S).elev); return X.mul(TEL1, lf ? X.mul(X.make(R.I(), [0, lf, 0]), M) : M); }
  const tz = tzmWorld(T); if (!tz) return null;
  if (item.at === 'hook') { const c = craneAt(T); return X.mul(tz, X.make(R.I(), [c.hook[0], c.hook[1] - HOOK_DROP, c.hook[2] - TLC_LEN / 2])); }
  return X.mul(tz, X.make(R.I(), A.TZM.SLOTS[item.at === 'near' ? 0 : 1]));
}

/* ---------- camera ---------- */
const cam = new Cam(); cam.cy = 470;
const cam2 = new Cam(480, 270);
const W3 = (a, c, y) => { const w = Wd.toW(a, c); return [w[0], y, w[2]]; };
const MNT0 = X.mul(TEL1, mountXf(0));
const ax0 = z => X.ap(MNT0, [0, 0, z]);          // a point on TLC 2's axis, stowed
const axUp = (z, h) => V.add(ax0(z), [0, h, 0]);
const SEA = Wd.SEA_Y;
// where the tracker's zoom-out comes to rest: back and up, the whole plume arc from the pad and the ground under it
const ZO_EYE = W3(-500, 1100, 200), ZO_T = W3(600, 0, 250);
const KEYS = [
  // 1 · the X-ray, from the front quarter
  { t: 0, eye: TL([11.5, 7.6, 9.6]), target: TL([.2, 2.2, -1.9]), fov: 40 },
  { t: 7, eye: TL([13.2, 6.4, 4.2]), target: TL([.4, 2.4, -2.2]), fov: 38 },
  { t: 12.5, eye: TL([11, 5.8, 7.2]), target: TL([.6, 2.6, -.9]), fov: 40 },
  // the slice sweeps the carrier, rear to front: pull back to its side
  { t: 16.4, eye: TL([12.8, 3.9, 3.6]), target: TL([.4, 3.0, -.6]), fov: 44 },
  // 2 · the right radiator fan face on, through it, over the power pack, down the flank, along the belly
  { t: 18.8, eye: TL([7.6, 2.7, 5.2]), target: TL([1.35, 2.2, 3.52]), fov: 38 },
  { t: 20.2, eye: TL([3.0, 2.3, 3.62]), target: TL([.2, 2.18, 3.5]), fov: 46 },
  { t: 21.0, eye: TL([1.35, 2.32, 3.53]), target: TL([-1, 2.1, 3.45]), fov: 64 },
  { t: 22.2, eye: TL([1.0, 3.3, 3.0]), target: TL([-.2, 1.9, 3.5]), fov: 64 },
  { t: 23.6, eye: TL([.9, 3.75, 1.9]), target: TL([0, 1.85, 3.45]), fov: 58 },
  { t: 25.0, eye: TL([2.7, 1.55, .9]), target: TL([0, .8, 1.3]), fov: 58 },
  // under the belly the lens looks forward and backs out along the driveline, axle by axle, out past the tail
  { t: 26.3, eye: TL([.4, .42, -.5]), target: TL([0, .6, 2.9]), fov: 78 },
  { t: 27.6, eye: TL([0, .4, -2.1]), target: TL([0, .56, 1.5]), fov: 80, roll: -3 },
  { t: 28.9, eye: TL([0, .4, -4.1]), target: TL([0, .56, -.4]), fov: 80, roll: -5 },
  { t: 30.1, eye: TL([0, .44, -6.3]), target: TL([0, .62, -2.6]), fov: 78, roll: -3 },
  { t: 31.3, eye: TL([.3, 1.0, -9.6]), target: TL([0, 1.35, -4.2]), fov: 66 },
  { t: 32.8, eye: TL([4.2, 3.0, -13.8]), target: TL([.4, 2.3, -4.6]), fov: 54 },
  { t: 35.2, eye: TL([9.5, 5.2, -15]), target: TL([0, 3.0, -1.5]), fov: 48 },
  { t: 38.0, eye: TL([15.5, 5.0, -6.5]), target: TL([0, 3.2, -.3]), fov: 46 },
  { t: 41.0, eye: TL([16.0, 4.6, 3.2]), target: TL([0, 3.1, .3]), fov: 46 },
  { t: 44.2, eye: TL([17.2, 5.0, 5.2]), target: TL([.2, 2.5, -1.2]), fov: 44 },
  // 3 · erect
  { t: 47.5, eye: TL([17, 5.2, 4.5]), target: TL([.2, 2.6, -2.2]), fov: 44 },
  { t: 52, eye: TL([24, 5.6, 3]), target: TL([0, 4, -3.4]), fov: 40 },
  { t: 57.5, eye: DZ0, target: DZ_T0, fov: 36 },
  { t: 61, eye: TL([70, 7.4, -4]), target: DZ_T0, fov: 18 },
  // 5 · the tracker lets go: the plume's arc over the ground being surveyed; climb to the whole coast from above
  { t: 77.5, eye: ZO_EYE, target: ZO_T, fov: 50 },
  { t: 79.5, eye: ZO_EYE, target: ZO_T, fov: 50 },
  { t: 84.5, eye: W3(300, 560, 360), target: W3(1400, -60, -40), fov: 50 },
  { t: 90, eye: W3(950, 560, 950), target: W3(1850, -150, -115), fov: 50 },
  // the lens lifts off the surveyed coast to the end of the line on the horizon, and pushes in for the hit
  // (95 sits on the line from 84.5 to where the climb used to go, so the approach to 90 is untouched)
  { t: 95, eye: W3(1167.4, 432.2, 1811.7), target: W3(1673.9, -114.8, -108.5), fov: 48.17 },
  { t: 96.6, eye: W3(1290, 400, 1560), target: W3(1780, -130, -115), fov: 46 },
  shipKey(98.4, W3(1440, 370, 1130), 12, 900, 560),
  shipKey(99.6, W3(1500, 358, 1060), 8, 900, 610),
  shipKey(103.8, W3(1650, 330, 1000), 7.5, 900, 650),
  // 6 · time-lapse: the column towers and leans; the lens drops onto the coast below, turns back on the
  // surveyed land and glides down onto the battery
  shipKey(107.5, W3(1760, 300, 1060), 10, 900, 720),
  shipKey(110.4, W3(1790, 240, 1150), 16, 930, 760),
  { t: 111.9, eye: W3(1350, 150, 950), target: W3(1044, -461, -929), fov: 38 },
  // (113.2 sits on the line from the old 110.5 key to 119.5, so the glide from 114.8 onto the battery is untouched)
  { t: 113.2, eye: V.lerp(W3(1550, 420, 700), TL([-10, 55, 95]), .3), target: V.lerp(W3(250, 0, -10), TL([-3.5, 2, -3]), .3), fov: 44.2 },
  { t: 114.8, eye: W3(640, 170, 270), target: W3(0, 0, 0), fov: 44 },
  { t: 119.5, eye: TL([-10, 55, 95]), target: TL([-3.5, 2, -3]), fov: 40 },
  // 7 · reload: over the top to the rear quarter, then round to the opening frame
  { t: 123.5, eye: TL([11, 24, 20]), target: TL([-3.6, 2.2, -2.5]), fov: 42 },
  { t: 128, eye: TL([11, 19, -19]), target: TL([-3.6, 3.0, -2]), fov: 44 },
  { t: 134, eye: TL([-2, 20, -29]), target: TL([-3.6, 3.8, -1.5]), fov: 42 },
  { t: 141, eye: TL([-17, 17, -22]), target: TL([-3.4, 3.8, -1.5]), fov: 42 },
  { t: 147, eye: TL([-2, 14, -25]), target: TL([-1.8, 3.4, -1.5]), fov: 42 },
  { t: 152, eye: TL([10.5, 8.6, -6]), target: TL([0, 2.8, -1.6]), fov: 42 },
  { t: 156, eye: TL([12, 7.9, 6]), target: TL([.2, 2.3, -1.8]), fov: 40 },
];
KEYS.push(Object.assign({}, KEYS[0], { t: DUR }));
KEYS.sort((a, b) => a.t - b.t);
const PATH = FILM.path(KEYS, { loop: true });

/* tracker: a lagged, led estimate of the tracked point; the zoom holds the round's size */
function trackedPoint(S) { const tau = S - L0; return tau < .6 ? V.lerp(TRK_PRE, misPos(Math.max(0, tau)), E.ss(0, .6, tau)) : misPos(tau); }
function aimAt(S) {
  const K = 36, dl = .03, rate = 5.5; let w = 0; const o = [0, 0, 0];
  for (let k = 0; k < K; k++) { const wk = Math.exp(-k * dl * rate), p = trackedPoint(S - k * dl); o[0] += p[0] * wk; o[1] += p[1] * wk; o[2] += p[2] * wk; w += wk; }
  return V.add(V.mul(o, 1 / w), V.mul(V.sub(trackedPoint(S), trackedPoint(S - .12)), 1.3));
}
const PRE_FOV = 2 * Math.atan(Math.tan(18 * DEG) * V.dist(DZ0, TRK_PRE) / V.dist(TRK_EYE, TRK_PRE)) / DEG;
const trackFov = S => E.mix(PRE_FOV, E.clamp(2 * Math.atan(60 / V.dist(TRK_EYE, trackedPoint(S))) / DEG, 2.2, 7), E.ss(.2, 1.6, S - L0));
function camAt(T, S) {
  let s = PATH(T);
  // dolly-zoom into the tracker, the track, and the zoom back out
  if (T > 57 && T < 82) {
    const wT = T < 70 ? E.ss(57.5, 58.8, T) : 1 - E.ss(79.5, 81.5, T);
    const u = E.inOut(E.sat((T - 57.5) / 7));
    const zo = E.inOut(E.sat((T - 71.5) / 8)), eye = T < 70 ? V.lerp(DZ0, TRK_EYE, u) : V.lerp(TRK_EYE, ZO_EYE, zo), aim = aimAt(S);
    let tgt = T < 70 ? V.lerp(DZ_T0, aim, E.ss(60, 64.5, T)) : V.lerp(aim, ZO_T, zo);
    // hold the launcher's size while the lens pulls back
    const fD = 2 * Math.atan(Math.tan(18 * DEG) * V.dist(DZ0, TRK_PRE) / V.dist(eye, TRK_PRE)) / DEG;
    let f = T < 64.5 ? E.mix(fD, trackFov(S), E.ss(63, 64.5, T)) : trackFov(S);
    if (T > 71.5) f = Math.exp(E.mix(Math.log(f), Math.log(50), zo));
    s = { eye: V.lerp(s.eye, eye, wT), target: V.lerp(s.target, tgt, wT), fov: E.mix(s.fov, f * DEG, wT), roll: s.roll * (1 - wT) };
  }
  // the long lens on the destroyer: its own zoom and framing, aimed from wherever the path has the eye
  const wL = E.ss(97, 98.6, T) * (1 - E.ss(110, 111.6, T));
  if (wL > 0) {
    const fov = Math.exp(LENS.f(T)), tgt = onShip(s.eye, fov, LENS.x(T), LENS.y(T));
    const d = V.norm(V.lerp(V.norm(V.sub(s.target, s.eye)), V.norm(V.sub(tgt, s.eye)), wL));
    s = { eye: s.eye, target: V.add(s.eye, V.mul(d, 2000)), fov: Math.exp(E.mix(Math.log(s.fov), Math.log(fov * DEG), wL)), roll: s.roll };
  }
  return s;
}

/* ---------- raster: max-blend dots into the current buffer ---------- */
const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
const pb = new PointBuf(cv, [11, 12, 10], { vignette: .62 });
const ic = document.createElement('canvas'); ic.width = 480; ic.height = 270; ic.className = 'px'; ic.style.cssText = 'position:absolute;left:0;top:0;width:480px;height:270px';
$('inset').appendChild(ic);
const pb2 = new PointBuf(ic, [11, 12, 10], { vignette: .35 });
const LIME = [198, 244, 50], WH = [238, 238, 228];
const LK = V.norm([-.5, .62, -.6]);              // low moon from the south-west
let C = cam, P = pb, BD = pb.d, BW = 1920, BH = 1080;
function use(camera, buf) { C = camera; P = buf; BD = buf.d; BW = buf.W; BH = buf.H; }
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
const addDot = (x, y, s, r, g, b, a) => P.add(x, y, s, r, g, b, a);
/* dot size from on-screen sample spacing: fine grain at range, never blobs */
const dsz = pxs => pxs > 7.5 ? 3 : pxs > 3.6 ? 2 : 1;

/* camera-space transform of a part: pc = A p + b; light and eye in the part's own frame */
const XF = new Float64Array(26);
function prep(T) {
  const M = T.R, t = T.T, e = C.eye, f = C.f, r = C.r, u = C.u, x = XF;
  const tx = t[0] - e[0], ty = t[1] - e[1], tz = t[2] - e[2];
  for (let c = 0; c < 3; c++) { x[c] = r[0] * M[c] + r[1] * M[3 + c] + r[2] * M[6 + c]; x[3 + c] = u[0] * M[c] + u[1] * M[3 + c] + u[2] * M[6 + c]; x[6 + c] = f[0] * M[c] + f[1] * M[3 + c] + f[2] * M[6 + c]; }
  x[9] = r[0] * tx + r[1] * ty + r[2] * tz; x[10] = u[0] * tx + u[1] * ty + u[2] * tz; x[11] = f[0] * tx + f[1] * ty + f[2] * tz;
  for (let c = 0; c < 3; c++) { x[12 + c] = M[c] * LK[0] + M[3 + c] * LK[1] + M[6 + c] * LK[2]; x[15 + c] = -(M[c] * tx + M[3 + c] * ty + M[6 + c] * tz); }
  // frustum side planes in camera space: right, left, top, bottom (slope, normaliser)
  const F = C.fl, xr = (BW - C.cx - C.shake[0]) / F, xl = (C.cx + C.shake[0]) / F, yt = (C.cy + C.shake[1]) / F, yb = (BH - C.cy - C.shake[1]) / F;
  x[18] = xr; x[19] = 1 / Math.sqrt(1 + xr * xr); x[20] = xl; x[21] = 1 / Math.sqrt(1 + xl * xl); x[22] = yt; x[23] = 1 / Math.sqrt(1 + yt * yt); x[24] = yb; x[25] = 1 / Math.sqrt(1 + yb * yb);
  return x;
}
/* is a sphere (part-local centre, radius) in view */
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
/* the per-point pass every cloud shares: project, light (low moon + rim), depth fade, dot.
   o.md: 0 plain · 1 shell under the carrier X-ray (see-through once the slice has opened it)
   · 2 part (always seen, lit by the slice) · 3 hidden (seen only between the open and shut slices).
   o.zoff / o.zfix put the points on the carrier's own z axis for the slices. */
const XS = { zo: -99, zs: -99, stn: -99, solid: 0 };  // this frame: open slice, shut slice, fly-through station (TEL z), shell opacity
const OPT0 = { a: 1, lime: 0, fade: 900, back: .09, md: 0, zoff: 0, zfix: undefined, lodpx: 0, px0: 0, nb: false, cp: null, tag: null };
const opt = o => Object.assign({}, OPT0, o);
function runPts(pts, i0, i1, spm, x, o) {
  const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, W = BW, H = BH, D = BD, invF = 1 / F;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const l0 = x[12], l1 = x[13], l2 = x[14], el0 = x[15], el1 = x[16], el2 = x[17];
  const a = o.a, lm = o.lime, fadeD = o.fade, back = o.back, md = o.md, ka = a, kf = .55 * a / fadeD, kfar = .45 * a;
  const cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
  const zo = XS.zo, zs = XS.zs, stn = XS.stn, sl = XS.solid, keepS = .34 + .56 * sl, zoff = o.zoff, zfix = o.zfix, bm = o.nb ? 1 : 3, cp = o.cp;
  for (let i = i0, j = i * 6; i < i1; i++, j += 6) {
    const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
    if (cp !== null && cp[0] * px + cp[1] * py + cp[2] * pz < cp[3]) continue;
    // the carrier X-ray decides first (cheap, on the point's own z): hidden, thinned, or lit by a slice
    let k = 0, thin = false;
    if (md) {
      const z = zfix === undefined ? pz + zoff : zfix, open = z < zo && z >= zs;
      if (md === 3 && !open) continue;
      let d = zo - z;
      if (d > -.05 && d < 1.6) k = d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 3.2) * .8;
      d = zs - z;
      if (d > -.05 && d < 1.2) { const k2 = d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 4) * .7; if (k2 > k) k = k2; }
      d = z - stn; if (d < 0) d = -d;
      if (d < .2) { const k3 = (1 - d / .2) * .85; if (k3 > k) k = k3; }
      if (md === 1 && open && k < .3) { if ((i * .6180339887) % 1 > keepS) continue; thin = true; }
    }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    // facing next, in part space: 2 of 3 back-facing points never cost a divide
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
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz, sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    b *= zc < fadeD ? ka - kf * zc : kfar;
    let r = cr, g = cg, bl = cb;
    if (thin) { const bt = bk ? .04 : .04 + .17 * b; b = bt + (b * .8 - bt) * sl; }
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const pxs = spm * iz;
    if (pxs <= 3.6) {
      const q = ((sy | 0) * W + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
      if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    } else dot(sx, sy, pxs > 7.5 ? 3 : 2, r, g, bl, b);
  }
}
/* lit surface cloud (one level) through transform T */
function drawCloud(cl, T, o) {
  if (!cl || !cl.n) return;
  const x = prep(T), CH = cl.ch, near = C.near, oo = opt(o);
  for (let c = 0; c < cl.nch; c++) {
    const q = c * 6;
    if (!sphereIn(x, CH[q + 2], CH[q + 3], CH[q + 4], CH[q + 5], near)) continue;
    runPts(cl.pts, CH[q] | 0, CH[q + 1] | 0, cl.sp, x, oo);
  }
}
/* multi-level cloud: each cell draws the coarsest level whose spacing lands within LODPX on screen;
   the finest level only for metal right at the lens (the fly-through) */
const LODPX = 4.4, LODPX0 = 15;
function drawLod(ml, T, o) {
  const x = prep(T), CH = ml.ch, SD = ml.sd, nl = ml.nl, F = C.fl, near = C.near, ex = x[15], ey = x[16], ez = x[17], oo = opt(o), PX = oo.lodpx || LODPX, PX0 = oo.px0 || LODPX0;
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(x, mx, my, mz, rad, near)) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.2, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    let li = nl - 1; while (li > 1 && ml.sp[li] * F / d > PX) li--;
    if (li === 1 && ml.sp[1] * F / d > PX0) li = 0;
    const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
    if (i1 > i0) { runPts(ml.lv[li], i0, i1, ml.sp[li], x, oo); if (PROF) { PROF['n' + li] = (PROF['n' + li] || 0) + i1 - i0; if (o && o.tag) PROF['g_' + o.tag] = (PROF['g_' + o.tag] || 0) + i1 - i0; } }
  }
}

/* ---------- world ---------- */
function drawWorld(T, S) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  const gk = 1 - .72 * ghostK(T);
  let t0 = performance.now();
  { const tw = loopPh(S, 7), ST = Wd.ST;
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
  // the battery's ring scan
  // the floor stays under the cutaway; from far off the 100 m disc would print a blob, so it thins to a whisper
  { const RG = Wd.RG, RY = Wd.RGy, n = Wd.NRG, gr = 1 - .4 * ghostK(T), kN = E.ss(900, 220, V.len(C.eye));
    for (let k = 0; k < n; k++) {
      const j = k * 4, dx = RG[j] - e0, dy = RY[k] - e1, dz = RG[j + 1] - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < .4) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      // far off it matches the survey around it instead of a hot centre
      const rr = RG[j + 2], b = (.1 + .24 * (1 - kN) + .38 * kN * Math.exp(-rr / 22) + .07 * RG[j + 3]) * gr * (rr > 88 ? 1 - (rr - 88) / 12 : 1);
      dot(sx, sy, zc < 7 ? 2 : 1, 238, 238, 228, b);
    } }
  pf('ground', t0); t0 = performance.now();
  drawSurvey(T, S, gk); pf('survey', t0); t0 = performance.now();
  drawSea(T, S, gk); pf('sea', t0);
  drawTrack(T, S);
}
/* the survey line: a cross-track scan riding ahead of the camera over the coast (the Coastline menu) */
const SURV = (() => {
  // the survey line sweeps the swath along the flight line at a steady pace, pad to open sea
  const t0 = 74.5, t1 = 101, A0 = -950, A1 = 3260;
  // quick over the ground the plume stands on, slower out to sea: front = A0 + (A1 - A0) u^0.6
  const front = T => T < t0 ? -1e9 : A0 + (A1 - A0) * Math.pow(E.sat((T - t0) / (t1 - t0)), .6);
  const SV = Wd.SV, NSV = Wd.NSV, RT = new Float32Array(NSV);
  for (let k = 0; k < NSV; k++) RT[k] = t0 + (t1 - t0) * Math.pow(E.sat((SV[k * 7 + 4] - A0) / (A1 - A0)), 1 / .6);
  const RT0 = a => t0 + (t1 - t0) * Math.pow(E.sat((a - A0) / (A1 - A0)), 1 / .6);
  return { front, RT, RT0, t0, t1 };
})();
const SV_FADE = 115.5;
function drawSurvey(T, S, gk) {
  if (T < 74.4 || T > SV_FADE + 8.5) return;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  const SV = Wd.SV, NSV = Wd.NSV, RT = SURV.RT, sw = loopPh(S, 9), szSV = 9 * F;
  for (let k = 0; k < NSV; k++) {
    const rt = RT[k]; if (T < rt) continue;
    const j = k * 7, x = SV[j], z = SV[j + 2], kind = SV[j + 6];
    let fd = 1;
    if (T > SV_FADE) { const q = (T - SV_FADE - SV[j + 5] * 5.5) / 2.5; if (q >= 1) continue; if (q > 0) fd = 1 - q; }
    const y = kind === 1 ? SV[j + 1] + .6 * Math.sin(x * .03 + z * .02 + sw) : SV[j + 1];
    const dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 3) continue;
    const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
    if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
    const age = T - rt;
    if (kind === 2) { const kf = age < 1.6 ? Math.exp(-age * 2) : 0; dot(sx, sy, zc < 2600 ? 2 : 1, 245 - 47 * kf, 245 - kf, 236 - 186 * kf, .95 * gk * fd); continue; }
    // the grid is 7.5-11 m: seen from high up the dots grow with their spacing so the ground stays a surface
    let b = 1.3 * SV[j + 3] * (zc < 2500 ? 1.05 - zc / 6000 : Math.max(.3, .63 - (zc - 2500) / 20000)) * fd;
    const ds = szSV / zc, s2 = ds > 8 ? 3 : ds > 3 ? 2 : 1;
    if (ds > 14) b *= 14 / ds;                          // right under the lens the grid is too open to be ground
    if (age < 1.4) { const kf = Math.exp(-age * 2.6); if (b < kf) b = kf; dot(sx, sy, age < .05 ? Math.max(2, s2) : s2, 238 - 40 * kf, 238 + 6 * kf, 228 - 178 * kf, Math.min(1, b * gk)); }
    else dot(sx, sy, s2, 238, 238, 228, Math.min(1, b * gk));
  }
  if (T > 74.5 && T < 101.5) {
    const af = SURV.front(T), sA = E.ss(74.5, 75.8, T) * (1 - E.ss(100.2, 101.2, T));
    for (let c = -1500; c <= 1500; c += 7) {
      const w = Wd.toW(af, c), y = Math.max(Wd.Yat(w[0], w[2]), SEA) + 1.5, g = C.project([w[0], y, w[2]]); if (!g) continue;
      if (g[0] < 0 || g[1] < 0 || g[0] >= BW || g[1] >= BH) continue;
      dset(g[0], g[1], 2, 226, 255, 150, sA);
      addDot(g[0], g[1], 7, LIME[0], LIME[1], LIME[2], .04 * sA);
      if (((c + 1500) / 7 | 0) % 16 === 0) for (let hh = 10; hh < 300; hh += 10) { const q = C.project([w[0], y + hh, w[2]]); if (q) dot(q[0], q[1], 1, LIME[0], LIME[1], LIME[2], sA * .55 * Math.pow(1 - hh / 300, 2)); }
    }
  }
}
/* the round's track out to sea, plotted from the flight table like a line on the picture */
const TR3 = [0, 0, 0];
function drawTrack(T, S) {
  const a = E.ss(80.5, 83.5, T) * (1 - E.ss(105.5, 108.5, T)), tau = Math.min(S - L0, TAU_HIT); if (a < .02 || tau < TAU_IGN) return;
  const n = Math.min(1400, Math.floor((tau - TAU_IGN) / .03));
  for (let k = 0; k <= n; k++) {
    const t = TAU_IGN + k * .03, q = C.project(FLY.at(t, TR3)); if (!q || q[0] < 0 || q[1] < 0 || q[0] >= BW || q[1] >= BH) continue;
    dot(q[0], q[1], k % 12 ? 1 : 2, LIME[0], LIME[1], LIME[2], a * (.4 + .6 * Math.exp(-(tau - t) / 4)));
  }
}
/* sea returns: wind rows and swell, lit by the Monolith-B's beam passing from the east (the Clutter menu) */
function drawSea(T, S, gk) {
  const vis = gk * (.45 + .85 * E.ss(80, 90, T) * (1 - E.ss(118, 124, T)));
  if (vis < .14) return;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const f0 = f[0], f1 = f[1], f2 = f[2], r0 = r[0], r1 = r[1], r2 = r[2], u0 = u[0], u1 = u[1], u2 = u[2], e0 = e[0], e1 = e[1], e2 = e[2];
  // the Monolith-B beam sweeps the clutter; in the time-lapse its 4 s turn would only strobe, so it rests
  const SE = Wd.SE, n = Wd.NSE, ph = loopPh(S, 4), sw = loopPh(S, 8.5), bk = 1 - E.ss(2.5, 7, SIM.rate(T));
  for (let k = 0; k < n; k++) {
    const j = k * 5, dx = SE[j] - e0, dz = SE[j + 1] - e2;
    const dy = SEA + 1.1 * Math.sin(SE[j + 3] + sw) - (dx * dx + dz * dz) / 12742000 - e1;   // swell and the Earth's curvature
    const zc = dx * f0 + dy * f1 + dz * f2; if (zc < 5) continue;
    const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
    if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
    let d = ph - SE[j + 4]; d -= Math.floor(d / TAU) * TAU;
    const glow = Math.exp(-d * .8) * bk, k7 = d < .5 ? Math.exp(-d * 8) * bk : 0;
    const b = SE[j + 2] * (.9 + 1.1 * glow) * vis * (zc < 30000 ? 1 - zc / 50000 : .4);
    dot(sx, sy, zc < 450 ? 2 : 1, 238 + (LIME[0] - 238) * k7, 238 + (LIME[1] - 238) * k7, 228 + (LIME[2] - 228) * k7, b > 1 ? 1 : b);
  }
}

/* ---------- the strike on the horizon: a destroyer out on the flight line, where the track ends ----------
   Everything runs in sim time: the flash and spray are over before the time-lapse, which then towers the
   smoke column and leans it downwind; it is gone before the reload, so the loop seam stays exact. */
const DDG_CL = (() => {
  const out = [], M = MOD.ddg();
  for (const s of GEO.sample(M, 2, 71, {}, { fine: false })) {
    if (s.part.show && !s.part.show({})) continue;
    const Tf = GEO.partXf(X.make(), s.part, {}), P = s.pts;
    for (let i = 0; i < P.length; i += 6) { const q = X.ap(Tf, [P[i], P[i + 1], P[i + 2]]), n = X.dir(Tf, [P[i + 3], P[i + 4], P[i + 5]]); out.push(q[0], q[1], q[2], n[0], n[1], n[2]); }
  }
  return cloudOf(new Float32Array(out), 2, 40);
})();
const DDG_BS = thin(DDG_CL.pts, 400);
const P_BLOOM = V.add(P_HIT, [0, 8, 0]);
/* the sea round the contact, sampled finer than the clutter so a long lens still finds a surface:
   x, z, brightness, swell phase, bearing from the search radar */
const SEP = (() => {
  // a wedge down the line of sight, widening with range like the lens footprint, feathered at its edges
  // (a quarter of the points again in a tight core round the ship, for the tightest lens)
  const r = rng(3131), N = 34000, F = new Float32Array(N * 5), c0 = DDG_W.T, WA = -28 * DEG, CHv = Wd.CH;
  for (let i = 0; i < N; i++) {
    const core = i >= 16000, v = r(), da = core ? -3400 + 5200 * v : -5200 + 7400 * v, half = core ? 1500 : 420 + .15 * (17600 + da), s = r() * 2 - 1, dc = s * half;
    const edge = Math.sqrt(1 - Math.abs(s)) * E.ss(0, .18, v) * E.ss(1, .8, v);
    const x = c0[0] + CHv[0] * dc + AH[0] * da, z = c0[2] + CHv[2] * dc + AH[2] * da;
    const U = x * Math.sin(WA) + z * Math.cos(WA), Vv = x * Math.cos(WA) - z * Math.sin(WA);
    const tex = Math.exp(1.4 * M3.fbm(U * .00042, Vv * .0007, 3.7, 3) - .25);
    F.set([x, z, Math.min(1.4, .22 * tex + .06 * r()) * edge, 2 * Math.PI * U / 2200, Math.atan2(x - Wd.RADX, z - Wd.RADZ)], i * 5);
  }
  return F;
})();
/* spray: hot fragments (kind 1) and water thrown off the waterline (kind 0): vx vy vz life kind drag */
const SPRAY = (() => {
  const r = rng(4242), L = [];
  for (let i = 0; i < 360; i++) { const a = r() * TAU, el = (10 + r() * 74) * DEG, s = 70 + r() * 200; L.push(Math.cos(el) * Math.sin(a) * s, Math.sin(el) * s, Math.cos(el) * Math.cos(a) * s, 1.6 + r() * 3.4, 1, .4 + r() * .45); }
  for (let i = 0; i < 620; i++) { const a = r() * TAU, el = (55 + r() * 33) * DEG, s = 35 + r() * 95; L.push(Math.cos(el) * Math.sin(a) * s, Math.sin(el) * s, Math.cos(el) * Math.cos(a) * s, 2.8 + r() * 3.8, 0, .6 + r() * .5); }
  return new Float32Array(L);
})();
/* smoke column puffs: emission (sim s after the hit, dense at first), station along the hull, ceiling,
   rise time, spin, disc offset, base radius, noise seed */
const COL_N = 1000, COL = (() => {
  const r = rng(5150), F = new Float32Array(COL_N * 8);
  for (let i = 0; i < COL_N; i++) {
    const e = 250 * Math.pow(i / COL_N, 2.4);
    F.set([e, (r() - .5) * (40 + 60 * Math.min(1, e / 30)) - 6, 900 + 1300 * r() * (.5 + .5 * Math.min(1, e / 25)), 36 + 36 * r(), r() * TAU, r(), 14 + r() * 20, r() * 50], i * 8);
  }
  return F;
})();
const COL_LIFE = 330, COL_GONE = [115.5, 121.5];          // film T: the column thins out before the reload
const FIRE = (() => { const r = rng(6161), F = []; for (let i = 0; i < 240; i++) F.push((r() - .5) * 52 - 6, 4 + Math.pow(r(), 1.8) * 32, (r() - .3) * 13, r() * 40); return new Float32Array(F); })();
const PJ = [0, 0, 0];
function drawStrike(T, S) {
  if (T < 79 || T > COL_GONE[1] + .5) return;
  const sa = S - S_HIT, gone = 1 - E.ss(COL_GONE[0], COL_GONE[1], T);
  const I = sa < 0 ? 0 : sa < .05 ? sa / .05 : Math.exp(-(sa - .05) * 1.6);      // the flash
  const e = C.eye, f = C.f, r = C.r, u = C.u, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const proj = (x, y, z) => { const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 1) return null; PJ[0] = cx + Fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; PJ[1] = cy - Fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; PJ[2] = zc; return PJ; };
  /* the sea round it: only a long lens needs it */
  const kz = E.ss(24, 13, C.fov / DEG) * E.ss(94, 96.5, T) * gone;
  if (kz > .02) {
    const ph = loopPh(S, 4), sw = loopPh(S, 8.5), bk = 1 - E.ss(2.5, 7, SIM.rate(T)), hx = P_HIT[0], hz = P_HIT[2];
    // the flash, then the fire, light the water round the ship
    const glow = sa < 0 ? 0 : Math.max(1.5 * I, .5 * (1 - E.ss(40, 360, sa)) * E.ss(0, .6, sa) * (.8 + .2 * noise(T * 4.2, 1.7, 3.3)));
    for (let j = 0; j < SEP.length; j += 5) {
      const x = SEP[j], z = SEP[j + 1], p = proj(x, SEA + 1.1 * Math.sin(SEP[j + 3] + sw), z); if (!p) continue;
      if (p[0] < 0 || p[1] < 0 || p[0] >= BW || p[1] >= BH) continue;
      let d = ph - SEP[j + 4]; d -= Math.floor(d / TAU) * TAU;
      let b = SEP[j + 2] * (.9 + 1.1 * Math.exp(-d * .8) * bk) * .85 * kz, lt = 0;
      if (glow > .01) { const dx = x - hx, dz = z - hz, dd = dx * dx + dz * dz; if (dd < 4e6) lt = glow * Math.exp(-Math.sqrt(dd) / (I > .05 ? 650 : 260)) * kz; }
      if (lt > b) dot(p[0], p[1], 1, 240, 255, 196, Math.min(1, lt));
      else dot(p[0], p[1], 1, 238, 238, 228, b > 1 ? 1 : b);
    }
  }
  /* the ship: lit up by its own flash, then dark over its fires */
  const shipA = E.ss(79.5, 82, T) * (sa < 0 ? 1 : .45 + .55 * Math.exp(-sa / 1.5) + 1.6 * I) * gone;
  if (shipA > .02) drawCloud(DDG_CL, DDG_W, { a: shipA, lime: .7 * I, fade: 1e6, nb: true });
  if (sa < 0) return;
  const fk = (1 - E.ss(40, 360, sa)) * gone * E.ss(0, .5, sa);             // how hard she burns
  /* smoke column */
  const W0 = WIND[0], W2 = WIND[2], R_ = DDG_W.R, T0 = DDG_W.T;
  for (let j = 0; j < COL.length; j += 8) {
    const a = sa - COL[j]; if (a <= 0) break; if (a > COL_LIFE) continue;
    const hm = COL[j + 2], tr = COL[j + 3], ea = Math.exp(-a / tr);
    // the fireball's own lift carries the first smoke up fast, then the plume climbs on its heat
    const h = hm * (1 - ea) + 170 * (1 - Math.exp(-a / 2.6)) * Math.exp(-COL[j] / 6);
    // the wind grows with height: the column leans over as it climbs
    const dr = .4 * a + hm / 420 * (a - tr * (1 - ea)), tb = 7 * Math.sqrt(a), sd = COL[j + 7];
    const bx = R_[2] * COL[j + 1] + T0[0], bz = R_[8] * COL[j + 1] + T0[2];
    const p = proj(bx + W0 * dr + tb * noise(sd, a * .02, 1.3), SEA + 10 + h + tb * .4 * noise(sd + 3, a * .03, 8.2), bz + W2 * dr + tb * noise(sd + 7, a * .02, 4.1)); if (!p) continue;
    // the plume widens as it climbs and spreads flat under its ceiling
    const rad = (COL[j + 6] + 6.5 * Math.sqrt(a) + .12 * h + 140 * (1 - ea) * (1 - ea)) * Fl / p[2];
    if (p[0] < -rad || p[1] < -rad || p[0] > BW + rad || p[1] > BH + rad) continue;
    // hot at birth, and lit from below by the fires while it is still low
    const nd = Math.min(88, 3 + Math.floor(rad * rad * .045)), heat = Math.max(Math.exp(-a / 2.4), .55 * fk * Math.exp(-h / 140));
    // each puff its own density, so the plume billows instead of glowing evenly
    const al = Math.min(1, a * 1.5) * Math.pow(1 - a / COL_LIFE, .7) * gone * (.55 + .45 * heat) * Math.min(1, 3.4 / Math.sqrt(nd / 3)) * (.55 + .9 * COL[j + 5]);
    if (al < .01) continue;
    const cr = 196 + (LIME[0] + 50 - 196) * heat, cg = 198 + (LIME[1] + 11 - 198) * heat, cb = 192 + (LIME[2] + 160 - 192) * heat;
    const o0 = (COL[j + 5] * 256) | 0, ca = Math.cos(COL[j + 4]), sn = Math.sin(COL[j + 4]);
    for (let q = 0; q < nd; q++) {
      const m = ((o0 + q * 37) & 255) * 2, ox = DISK[m] * rad, oy = DISK[m + 1] * rad;
      dot(p[0] + ox * ca - oy * sn, p[1] + (ox * sn + oy * ca) * .85, 1, cr, cg, cb, al * (1 - .35 * (DISK[m] * DISK[m] + DISK[m + 1] * DISK[m + 1])));
    }
  }
  /* fire along the struck side, flickering in film time so the time-lapse never strobes it */
  if (fk > .02) for (let j = 0; j < FIRE.length; j += 4) {
    const fl = .5 + .5 * noise(T * 5.5 + FIRE[j + 3], j * .09, 2.2); if (fl < .38) continue;
    const w = X.ap(DDG_W, [FIRE[j + 2], FIRE[j + 1], FIRE[j]]), p = proj(w[0], w[1], w[2]); if (!p) continue;
    dot(p[0], p[1], p[2] < 30000 && Fl / p[2] > .5 ? 2 : 1, 242, 255, 190, fk * fl);
    if (!(j & 7)) addDot(p[0], p[1], 5, LIME[0], LIME[1], LIME[2], .07 * fk * fl);
  }
  /* spray and fragments */
  if (sa < 7) for (let j = 0; j < SPRAY.length; j += 6) {
    const life = SPRAY[j + 3]; if (sa > life) continue;
    const k = SPRAY[j + 5], hot = SPRAY[j + 4] > 0, x0 = hot ? P_BLOOM : P_HIT, tails = hot ? 9 : 1;
    for (let t = 0; t < tails; t++) {
      const a = sa - t * .035; if (a <= 0) break;
      const m = (1 - Math.exp(-k * a)) / k;
      const y = (hot ? x0[1] : SEA + 1) + (SPRAY[j + 1] + G0 / k) * m - G0 * a / k; if (y < SEA) break;
      const p = proj(x0[0] + SPRAY[j] * m, y, x0[2] + SPRAY[j + 2] * m); if (!p) break;
      const fade = Math.pow(1 - sa / life, 1.3) * (1 - t / tails);
      if (hot) { const ht = Math.exp(-sa / .8); dot(p[0], p[1], ht > .4 && !t ? 2 : 1, 238 + 12 * ht, 238 + 17 * ht, 228 - 60 * ht, fade); }
      else dot(p[0], p[1], 1, 236, 238, 230, .85 * fade);
    }
  }
  /* the bloom: a hot core, a halo of dots, a streak along the horizon, a breath of light over the frame */
  if (sa < 3.5) {
    const p = C.project(P_BLOOM);
    if (p) {
      const pxm = Fl / p[2], px = p[0], py = p[1];
      // the fireball swells, lifts off the hull and cools from white through lime to smoke
      const rf = Math.max(8, pxm * (34 + 96 * (1 - Math.exp(-sa * 3.5)))), lift = pxm * 38 * sa, heat = Math.exp(-sa / .8);
      const nf = Math.min(1600, 80 + Math.floor(rf * rf * .55)), If = Math.min(1, sa / .04) * (1 - E.ss(1.2, 3.4, sa));
      if (If > .01) for (let k = 0; k < nf; k++) {
        const m = ((k * 61) & 255) * 2, s = .25 + .75 * ((k * .618034) % 1), ox = DISK[m] * s, oy = DISK[m + 1] * s, d2 = ox * ox + oy * oy, hh = heat * (1 - .6 * d2);
        dot(px + ox * rf, py + oy * rf * .8 - rf * .3 - lift, 2, 200 + 52 * hh, 202 + 53 * hh, 196 + 40 * hh - 120 * hh * d2, If * (1 - .45 * d2) * (.45 + .55 * hh));
      }
      const rh = Math.max(90, pxm * 300) * (.55 + .45 * (1 - Math.exp(-sa * 5)));
      for (let k = 0; k < 1400; k++) { const m = ((k * 97) & 255) * 2, s = .15 + .85 * ((k * .7548777) % 1), ox = DISK[m] * s, oy = DISK[m + 1] * s, d = Math.sqrt(ox * ox + oy * oy); addDot(px + ox * rh, py + oy * rh * .72, 3, LIME[0], LIME[1], LIME[2], .3 * I * (1 - d) * (1 - d)); }
      const fw = Math.max(520, pxm * 4200), fI = I * Math.exp(-sa * 1.8);
      if (fI > .02) for (let x = -fw; x <= fw; x += 1.5) { const w = 1 - Math.abs(x) / fw, a = .9 * fI * w * w * w; addDot(px + x, py, 1, 250, 255, 220, a); if (w > .5) { addDot(px + x, py - 1, 1, 250, 255, 220, a * .4); addDot(px + x, py + 1, 1, 250, 255, 220, a * .4); } }
      FLASH.v = Math.max(FLASH.v, 9 * I * Math.exp(-sa * 5));
    }
  }
}

/* ---------- actors ---------- */
const distTo = p => V.dist(C.eye, p);
/* TEL 1: the carrier's assemblies (pulled apart in the cutaway), the launcher, the ram, the fans */
const FAN_RATE = 3.1;               // rev/s as drawn: slow enough that 7 blades never strobe backwards
const stationZ = () => { const d = V.sub(C.eye, TEL1.T); return d[0] * TEL1.R[2] + d[1] * TEL1.R[5] + d[2] * TEL1.R[8]; };
function fanXf(side, off, ang) {
  const c = [side * ANA.FAN_C[0], ANA.FAN_C[1], ANA.FAN_C[2]];
  return X.mul(TEL1, X.make(R.mul(side > 0 ? R.I() : R.y(Math.PI), R.x(ang)), off ? V.add(c, off) : c));
}
function groupXf(g, T, st) {
  const xp = explodeK(g.w0, T), W = xp > 0 ? X.mul(TEL1, X.make(R.I(), V.mul(g.off, xp))) : TEL1;
  return g.jack ? X.mul(W, jacksPart.xf(st)) : W;
}
function drawTEL1(T, S) {
  const st = telState(T, S), xr = TRUCK_XR(T), a = 1 - .5 * focusK(T);
  // the fly-through's own ring runs 1.3 m ahead of the lens along the belly
  const fz = C.f[0] * TEL1.R[2] + C.f[1] * TEL1.R[5] + C.f[2] * TEL1.R[8];
  XS.zo = xr ? sweepZ(T) : -99; XS.zs = xr ? shutZ(T) : -99; XS.stn = T > 26.0 && T < 30.8 ? stationZ() + 1.3 * fz : -99; XS.solid = E.ss(33.4, 36.2, T);
  for (const g of GROUPS) {
    if (g.cls === 'hidden' && !xr) continue;
    drawLod(g.cl, groupXf(g, T, st), { a, md: !xr ? 0 : g.cls === 'shell' ? 1 : g.cls === 'part' ? 2 : 3, px0: xr && g.cls === 'shell' ? 26 : 0, tag: PROF && g.name });
  }
  // the launcher (TLC 1 and the erector frame) stays a closed box; the cutaway lifts it clear
  const lf = launchLift(T), LX = launcherXf(st.elev);
  const inK = E.ss(19.6, 20.6, T) * (1 - E.ss(31.4, 33.2, T));        // the lens is inside the carrier: the closed containers step back
  drawLod(LAUNCH_CL, X.mul(TEL1, lf ? X.mul(X.make(R.I(), [0, lf, 0]), LX) : LX), { a: a * (1 - .5 * inK), md: xr ? 2 : 0 });
  // erector ram at its elevation pose, or drawn out along its own line in the cutaway
  const xk = explodeK(W_RAM, T);
  if (xk > 0) drawCloud(RAM_X[Math.round(xk * RAMX_N)], X.mul(TEL1, X.make(R.I(), [0, OFF_RAM * xk, 0])), { a, md: 2 });
  else drawCloud(TEL_RAM[Math.round(E.clamp(st.elev / 1.535, 0, 1) * RAM_N)], TEL1, { a, md: xr ? 2 : 0 });
  // radiator fans at idle, inside the bay: seen only through the X-ray
  if (xr) {
    const ang = loopPh(S, 1 / FAN_RATE), fx = explodeK(GRP.fanR.w0, T);
    for (const side of [1, -1]) drawLod(FAN_CL, fanXf(side, fx ? V.mul(GRP[side > 0 ? 'fanR' : 'fanL'].off, fx) : null, ang), { a: 2.2 * a, md: 3, zfix: ANA.FAN_C[2] });
  }
}
function drawTEL2(T) { const a = .6 * (1 - ghostK(T)); if (a > .02) drawLod(TEL2_ML, TEL2W, { a, lodpx: 8, nb: true }); }
function drawTZM(T, gk) {
  const Wz = tzmWorld(T); if (!Wz) return;
  const vis = T > 100 ? 1 : 1 - E.ss(84, 104, V.len(Wz.T)); if (vis < .01) return;
  const c = craneAt(T), tst = { slew: c.slew, luff: c.luff, ext: c.ext, hook: c.hook, hookYaw: 0, dep: tzmDep(T) };
  // context while the carrier is the subject: it leaves the frame entirely during the cutaway
  // context outside the reload proper (the TEL is the subject from 150 s): coarser, front faces only
  const bg = T < 118 || T > 150.5, a = (1 - ghostK(T)) * vis * (1 - .4 * focusK(T)) * (T < 118 ? .7 : 1), o = { a, lodpx: T < 118 ? 8 : bg ? 5.8 : 5.2, nb: bg };
  if (a < .02) return;
  for (const part of TZMM.parts) drawLod(TZM_ML[part.name], GEO.partXf(Wz, part, tst), o);
  // hoist rope and slings
  dotLine(X.ap(Wz, A.boomTip(tst)), X.ap(Wz, c.hook), .05, .6 * a);
  const hooked = tlcList(T).some(q => q.at === 'hook');
  for (const sz of [-3.1, 3.1]) {
    const se = X.ap(Wz, V.add(c.hook, [0, -1.0, sz]));
    const lug = hooked ? X.ap(Wz, V.add(c.hook, [0, -HOOK_DROP + .62, sz * .98])) : V.add(se, [0, -1.2, 0]);
    dotLine(se, lug, .05, .5 * a);
  }
}
function dotLine(a, b, step, al) {
  const n = Math.max(2, Math.ceil(V.dist(a, b) / step));
  for (let k = 0; k <= n; k++) { const p = C.project(V.lerp(a, b, k / n)); if (p) dot(p[0], p[1], 1, 238, 238, 228, al); }
}
function drawActors(T, S) {
  const g = ghostK(T), gk = 1 - .78 * g;
  let t0 = performance.now();
  drawTEL1(T, S); pf('tel1', t0); t0 = performance.now();
  drawTEL2(T); pf('tel2', t0); t0 = performance.now();
  drawTZM(T, gk); pf('tzm', t0); t0 = performance.now();
  const pa = { a: .9 * gk, fade: 3000 };
  for (const part of PANT.parts) { const c = PANT_S[part.name]; if (c) drawCloud(c, GEO.partXf(PANTW, part, { yaw: .4 * Math.sin(loopPh(S, 40)), pitch: .12, sAnt: loopPh(S, 2) }), pa); }
  pf('pant', t0); t0 = performance.now();
  for (const item of tlcList(T)) drawTLC(item, T, S, g);
  pf('tlc', t0); t0 = performance.now();
  drawRound(T, S); pf('round', t0); t0 = performance.now();
  drawEjecta(T, S); drawSmoke(T, S); drawSplash(T); pf('smoke', t0);
}

/* TLC with the X-ray: fronts from the strike, the CT plane, glass behind it, re-closing */
function drawTLC(item, T, S, g) {
  const Wt = tlcXf(item, T, S); if (!Wt) return;
  if (item.at === 'tel' && XRAY_ON(T) && item.loaded) {
    drawXray(TLC_LOD[0].shell, Wt, T, { wall: true, zoff: 0 });
    drawXray(TLC_LOD[0].cap, Wt, T, { wall: true, zoff: 0 });
    return;
  }
  // on the carrier TLC 2 is part of the subject: the slice crosses it like the rest of the steel
  const o = item.at === 'tel' ? { a: 1 - .5 * E.ss(19.6, 20.6, T) * (1 - E.ss(31.4, 33.2, T)), md: TRUCK_XR(T) ? 2 : 0, zoff: TUBE_BASE[2] } : { a: 1 - .78 * g, nb: T < 118 };
  drawLod(TLC_ML.shell, Wt, o);
  if (item.cap) drawLod(TLC_ML.cap, Wt, o);
}
/* TLC 2 under the X-ray: points appear as the fronts from the strike reach them, the CT slice runs
   mouth -> base, and the carrier's slice closes the wall again (base -> mouth) as it passes.
   o.wall: the container (solid, see-through where revealed) or the round inside it (seen only while
   revealed and the wall is open). o.zoff: TLC-local z of the cloud's origin. */
function drawXray(cl, Wt, T, o) {
  if (!cl || !cl.n) return;
  const x = prep(Wt), pts = cl.pts, RT = cl.rt, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const l0 = x[12], l1 = x[13], l2 = x[14], el0 = x[15], el1 = x[16], el2 = x[17];
  const zoff = o.zoff || 0, zs = ctZ(T) - zoff, ctOn = T > CT0 - .2 && T < CT1 + .2, zcl = closeZ(T) - zoff, sp = cl.sp * F;
  const wall = !!o.wall, tb = T - TB, a0 = o.a === undefined ? 1 : o.a, CH = cl.ch;
  for (let c = 0; c < cl.nch; c++) {
    const q = c * 6;
    if (!sphereIn(x, CH[q + 2], CH[q + 3], CH[q + 4], CH[q + 5], near)) continue;
    for (let i = CH[q] | 0, i1 = CH[q + 1] | 0, j = i * 6; i < i1; i++, j += 6) {
      const rt = RT[i], revealed = tb >= rt, px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      if (!wall && (!revealed || pz < zcl)) continue;
      const zc = a20 * px + a21 * py + a22 * pz + b2;
      if (zc < near) continue;
      const xc = a00 * px + a01 * py + a02 * pz + b0, yc = a10 * px + a11 * py + a12 * pz + b1, iz = F / zc;
      const sx = cx + xc * iz, sy = cy - yc * iz;
      if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let lit = .45, fac = 1;
      if (nx || ny || nz) {
        fac = -(nx * (px - el0) + ny * (py - el1) + nz * (pz - el2)) / Math.sqrt(xc * xc + yc * yc + zc * zc);
        const lam = nx * l0 + ny * l1 + nz * l2, af = fac < 0 ? -fac : fac, w = 1 - af;
        lit = .08 + .66 * (lam > 0 ? lam : 0) + .16 * af + .34 * w * w * w; lit *= .55 + .45 * lit;
      }
      let b, cr = WH[0], cg = WH[1], cb = WH[2];
      if (wall) {
        if (!revealed || pz < zcl) { if (fac < 0 && (i % 3)) continue; b = fac < 0 ? .09 : lit; }
        else { if (i & 1) continue; b = fac < 0 ? .07 : .06 + .2 * lit; }
      } else b = lit * (fac < 0 ? .5 : 1);
      b *= a0;
      if (revealed) { const age = tb - rt; if (age < .5) { const k = Math.exp(-age * 7); if (b < k * 1.1 * a0) b = k * 1.1 * a0; cr += (LIME[0] - cr) * k; cg += (LIME[1] - cg) * k; cb += (LIME[2] - cb) * k; } }
      let s2 = 0, d = zcl - pz;
      if (d > -.05 && d < 1.2) s2 = d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 3.2) * .8;
      if (ctOn) { d = zs - pz; if (d > -.05 && d < .9) { const k = d < 0 ? 1 + d / .05 : Math.pow(1 - d / .9, 4); if (k > s2) s2 = k; } }
      if (s2 > 0) { if (b < .95 * s2) b = .95 * s2; cr += (LIME[0] - cr) * s2; cg += (LIME[1] - cg) * s2; cb += (LIME[2] - cb) * s2; }
      if (b < .02) continue;
      dot(sx, sy, dsz(sp / zc), cr, cg, cb, b > 1 ? 1 : b);
    }
  }
}
/* the round: its shell seen through TLC 2 under the X-ray, then the flight */
function drawRound(T, S) {
  const tau = S - L0;
  if (XRAY_ON(T)) {
    const Mt = X.mul(TEL1, mountXf(0)), mnt = X.mul(Mt, inTLC), L = RND[0], o = { zoff: RIN };
    for (const c of [L.body, L.intake, L.nozzle, L.booster, L.cover, L.wings[0], L.fins[0]]) drawXray(c, mnt, T, o);
    drawCT(T, Mt);
    return;
  }
  if (tau < 0 || tau > TAU_HIT) return;
  const Wm = misXf(tau), d = distTo(Wm.T), L = RND[d * .03 / C.fl * 1e3 < 30 ? 0 : 1];
  if (C.fl * 8.9 / d < 3) return;
  const fo = E.ss(TAU_EXIT - .05, TAU_EXIT + .3, tau), wo = E.ss(TAU_SEP + .15, TAU_SEP + .75, tau);
  const list = [L.body, L.intake, L.nozzle, L.wings[Math.round(wo * FOLD_N)], L.fins[Math.round(fo * FOLD_N)]];
  if (tau < TAU_SEP) list.push(L.booster, L.cover);
  if (tau < TAU_EXIT + .05) { for (const c of list) drawClipped(c, Wm); return; }
  for (const c of list) drawCloud(c, Wm, { a: 1 });
}
/* while the round leaves the tube only the part past the mouth is seen */
function drawClipped(cl, Wm) {
  // the mouth plane in the round's own frame: keep n·p >= n·(mouth - origin)
  const n = R.ap([Wm.R[0], Wm.R[3], Wm.R[6], Wm.R[1], Wm.R[4], Wm.R[7], Wm.R[2], Wm.R[5], Wm.R[8]], FLY.d0);
  drawCloud(cl, Wm, { cp: [n[0], n[1], n[2], V.dot(FLY.d0, V.sub(MOUTH_UP, Wm.T))] });
}
/* the CT slice: the container wall and the round's skin drawn analytically at the plane */
function drawCT(T, Mt) {
  if (!(T > CT0 - .1 && T < CT1 + .1)) return;
  const zT = ctZ(T), zm = zT - RIN, a = E.ss(CT0 - .1, CT0 + .3, T) * (1 - E.ss(CT1 - .3, CT1 + .1, T));
  const rings = [.5];
  if (zm > -4.5 && zm < 4.1) rings.push(.35);
  for (const rad of rings) {
    const n = Math.round(rad * 480);
    for (let k = 0; k < n; k++) {
      const th = k / n * TAU, p = C.project(X.ap(Mt, [Math.cos(th) * rad, Math.sin(th) * rad, zT])); if (!p) continue;
      dset(p[0], p[1], 2, 226, 255, 150, a);
    }
  }
}
/* thrown-off bodies */
function drawEjecta(T, S) {
  const tau = S - L0;
  if (tau > 0 && T < 114) {
    const p = CAP_FLY.at(tau), spin = Math.min(tau, CAP_FLY.landed) * CAP_FLY.spin, Rm = R.mul(R.x(spin), R.y(spin * .6));
    drawCloud(TLC_LOD[0].cap, X.make(Rm, V.sub(p, R.ap(Rm, [0, 0, TLC_LEN + .07]))), { a: 1 - E.ss(108, 114, T) });
  }
  if (tau > TAU_SEP && tau < 70) {
    const t = tau - TAU_SEP, p = BOOST_FLY.at(t), spin = Math.min(t, BOOST_FLY.landed) * BOOST_FLY.spin;
    if (!(BOOST_FLY.splash && t > BOOST_FLY.landed + .2) && C.fl * 2.8 / distTo(p) > 2) { const Rm = R.mul(SEPX.R, R.x(spin)); for (const nm of Object.keys(BOOST_S)) if (nm !== 'sp') drawCloud(BOOST_S[nm], X.make(Rm, p), { a: 1 }); }
    const c = COVER_FLY.at(t), sc = Math.min(t, COVER_FLY.landed) * COVER_FLY.spin;
    if (t < 10 && C.fl * .8 / distTo(c) > 2) { const Rm = R.mul(SEPX.R, R.mul(R.x(sc), R.y(sc * .7))); drawCloud(RND[0].cover, X.make(Rm, V.sub(c, R.ap(Rm, [0, 0, 4.2]))), { a: 1 }); }
  }
}
/* the spent booster hitting the sea: a column of spray and a ring, analytic in their age */
const SPL = (() => { const r = rng(808), D = []; for (let i = 0; i < 900; i++) { const a = r() * TAU, s = r(); D.push(Math.cos(a) * (2 + 9 * s), 14 + 34 * Math.pow(r(), 1.5) * (1 - s * .6), Math.sin(a) * (2 + 9 * s), .4 + r() * .6); } return D; })();
function drawSplash(T) {
  const age = T - T_SPLASH; if (age < 0 || age > 9) return;
  const p0 = P_SPLASH;
  for (let i = 0; i < SPL.length; i += 4) {
    const t = age * SPL[i + 3]; const y = SPL[i + 1] * t - 4.9 * t * t; if (y < 0 && t > .2) continue;
    const q = C.project([p0[0] + SPL[i] * t, SEA + Math.max(0, y), p0[2] + SPL[i + 2] * t]); if (!q) continue;
    dot(q[0], q[1], 1, 238, 238, 228, .8 * (1 - age / 9));
  }
  const rad = 6 + age * 9;
  for (let k = 0; k < 90; k++) { const th = k / 90 * TAU, q = C.project([p0[0] + Math.cos(th) * rad, SEA + .3, p0[2] + Math.sin(th) * rad]); if (q) dot(q[0], q[1], 1, LIME[0], LIME[1], LIME[2], .8 * (1 - age / 9)); }
}
/* smoke: analytic puffs drawn as dot clusters; hot gas glows lime */
function drawSmoke(T, S) {
  const tau = S - L0; if (tau < 0) return;
  const F = PUFF.F, n = PUFF.n, e = C.eye, f = C.f, r = C.r, u = C.u, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  for (let i = 0; i < n; i++) {
    const j = i * 14, a = tau - F[j]; if (a < 0) continue;
    const life = F[j + 7]; if (a > life) continue;
    const k = F[j + 13], m1 = (1 - Math.exp(-k * a)) / k, h0 = F[j + 8], heat = h0 * Math.exp(-a / 1.6);
    const wsh = 1 + Math.max(0, F[j + 2]) / 300, cA = 2.2 * Math.sqrt(a);
    const x = F[j + 1] + F[j + 4] * m1 + WIND[0] * wsh * (a - m1) + cA * noise(F[j + 1] * .02, F[j + 3] * .02 + a * .06, 1.3);
    let y = F[j + 2] + F[j + 5] * m1 + .5 * a + 3.3 * h0 * (1 - Math.exp(-a / 1.6)) + cA * .5 * noise(F[j + 1] * .02 + 3, a * .06, 8.2);
    const z = F[j + 3] + F[j + 6] * m1 + WIND[2] * wsh * (a - m1) + cA * noise(F[j + 3] * .02 + 7, F[j + 1] * .02 + a * .06, 4.1);
    if (y < .2 && F[j + 2] < 50) y = .2;
    const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < .5) continue;
    const sx = cx + Fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc, sy = cy - Fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
    const rad = (F[j + 9] + F[j + 10] * Math.sqrt(a)) * Fl / zc;
    if (sx < -rad || sy < -rad || sx > BW + rad || sy > BH + rad) continue;
    const nd = Math.min(48, 3 + Math.floor(rad * rad * .03));
    const al = Math.min(1, a * 6) * Math.pow(1 - a / life, .6) * (.55 + .45 * heat) * Math.min(1, 2.4 / Math.sqrt(nd / 3));
    const cr = 200 + (LIME[0] + 40 - 200) * heat, cg = 200 + (LIME[1] + 11 - 200) * heat, cb = 196 + (LIME[2] + 150 - 196) * heat;
    const o0 = (F[j + 12] * 256) | 0, ca = Math.cos(F[j + 11]), sa = Math.sin(F[j + 11]), s2 = heat > .5 ? 2 : 1;
    for (let q = 0; q < nd; q++) {
      const m = ((o0 + q * 37) & 255) * 2, ox = DISK[m] * rad, oy = DISK[m + 1] * rad;
      dot(sx + ox * ca - oy * sa, sy + (ox * sa + oy * ca) * .85, s2, cr, cg, cb, al * (1 - .3 * (DISK[m] * DISK[m] + DISK[m + 1] * DISK[m + 1])));
    }
  }
  // booster flame, ramjet jet with its shock diamonds
  if (tau > TAU_IGN && tau < TAU_HIT) {
    const Wm = misXf(tau), ax = FLY.axis(tau), boost = tau < TAU_BO, rj = tau > TAU_RJ;
    if (boost || rj) {
      const nzl = X.ap(Wm, [0, 0, boost ? -4.85 : -4.5]), p = C.project(nzl);
      if (p) {
        const pxm = C.fl / p[2], L = boost ? 7.5 : 5.5, rad0 = boost ? .21 : .26, cells = boost ? 4 : 7, ign = boost ? E.ss(TAU_IGN, TAU_IGN + .12, tau) : E.ss(TAU_RJ, TAU_RJ + .4, tau);
        for (let s = 0; s < L; s += Math.max(.02, 1.1 / pxm)) {
          const cell = s / L * cells, fr = cell - Math.floor(cell), pinch = .45 + .55 * Math.abs(Math.cos(fr * Math.PI));
          const q = C.project(V.mad(nzl, ax, -s)); if (!q) continue;
          const knot = Math.exp(-Math.pow((fr - .5) * 6, 2)), al = (.35 + .65 * knot) * (1 - s / L) * ign, rp = rad0 * pinch * (1 - s / L * .6) * pxm;
          if (rp < 1.2) { addDot(q[0], q[1], 2, 255, 255, 230, al * .5); continue; }
          for (let m = 0; m < 6; m++) { const th = m / 6 * TAU + s * 3; dot(q[0] + Math.cos(th) * rp, q[1] + Math.sin(th) * rp, 1, 240, 255, 200, al); }
          addDot(q[0], q[1], Math.max(2, Math.round(rp * .6)), 240, 255, 190, .25 * al * knot);
        }
        addDot(p[0], p[1], Math.max(3, Math.min(16, Math.round(pxm * .5))), 255, 255, 230, .6 * ign);
        addDot(p[0], p[1], Math.max(6, Math.min(40, Math.round(pxm * 1.5))), LIME[0], LIME[1], LIME[2], .1 * ign);
      }
    }
  }
}
/* the Strike menu's bolt: leader, return stroke, flash (a white sheet over the dots, set here and laid by overlays), sparks */
const FLASH = { v: 0 };
function drawBolt(T) {
  const c = T - TB + BOLT.lead; if (c < -.05 || c > 1.5) return;
  const tr = c - BOLT.lead, leading = tr < 0, m = BOLT.main, reach = leading ? E.sat(c / BOLT.lead) : 1;
  const I = leading ? .55 : Math.max(0, Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2)));
  const path = (pts, to, inten, core) => {
    for (let i = 0; i < Math.min(pts.length - 1, to); i++) {
      const a = pts[i], bq = pts[i + 1], n = Math.max(1, Math.ceil(V.dist(a, bq) / .08));
      for (let k = 0; k < n; k++) { const p = C.project(V.lerp(a, bq, k / n)); if (!p) continue; dot(p[0], p[1], core || 2, 248, 255, 232, Math.min(1, inten)); if (k % 3 === 0) { addDot(p[0], p[1], 9, LIME[0], LIME[1], LIME[2], .035 * inten); addDot(p[0], p[1], 21, LIME[0] * .6, LIME[1] * .6, LIME[2] * .6, .012 * inten); } }
    }
  };
  if (I > .01) {
    const vis = reach * m.length;
    path(m, vis, I * 1.1, leading ? 2 : 3);
    for (const b of BOLT.br) { const s = b.at * m.length; if (vis > s) path(b.pts, (vis - s) / (m.length * .25) * b.pts.length, I * .6); }
    if (!leading) FLASH.v = 18 * Math.min(1, I);
  }
  if (!leading) for (const q of BOLT.sp) {
    if (tr > q[3]) continue;
    const p = C.project([BOLT.hit[0] + q[0] * tr, BOLT.hit[1] + q[1] * tr - 11 * tr * tr, BOLT.hit[2] + q[2] * tr]); if (!p) continue;
    const a = 1 - tr / q[3]; dot(p[0], p[1], 2, 230, 255, 170, a); addDot(p[0], p[1], 4, LIME[0], LIME[1], LIME[2], a * .08);
  }
}
/* live lightning on the container: parent->child links whose child was just reached */
function drawWires(T) {
  const tb = T - TB; if (tb < 0 || tb > XR.tMax + .3) return;
  const M = X.mul(TEL1, mountXf(0));
  octx.globalCompositeOperation = 'lighter'; octx.lineWidth = 1.2; octx.strokeStyle = 'rgba(210,255,120,.85)'; octx.beginPath();
  for (let i = 0; i < XR.nodes.length; i++) {
    const tn = XR.t[i]; if (tb < tn || tb > tn + .16 || XR.par[i] < 0) continue;
    const p = C.project(X.ap(M, XR.nodes[i].p)), q = C.project(X.ap(M, XR.nodes[XR.par[i]].p)); if (!p || !q) continue;
    octx.moveTo(q[0], q[1]); octx.lineTo(p[0], p[1]);
  }
  octx.stroke(); octx.globalCompositeOperation = 'source-over';
}

/* ---------- tags, boxes, readout ---------- */
const ui = $('ui'), tagPool = [];
function mkTag() { const d = document.createElement('div'); d.className = 'tag off'; d.innerHTML = '<b></b><i></i><span class="v"></span>'; ui.insertBefore(d, $('menu')); const o = { el: d, b: d.children[0], i: d.children[1], v: d.children[2], key: '', on: false, x: 0, y: 0 }; tagPool.push(o); return o; }
function setTag(tg, id, lab, val, cls, x, y, a) {
  const key = id + '|' + lab + '|' + val + '|' + (cls || '');
  if (tg.key !== key) { tg.key = key; tg.w = -1; tg.b.textContent = id; tg.i.textContent = lab; tg.v.textContent = val || ''; tg.v.style.display = val ? '' : 'none'; tg.el.className = 'tag ' + (cls || ''); }
  tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tg.el.style.opacity = a === undefined ? '' : a.toFixed(2);
  tg.on = true; tg.x = x; tg.y = y;
}
function placeTag(tg, x, y) { tg.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; tg.x = x; tg.y = y; }
const T_ = {};
['main', 'sec', 'slice', 'fly', 'tel', 'tzm', 'trk', 'cap', 'ram', 'bst', 'tlcA', 'tlcB', 'pant', 'bat', 'spl', 'ddg'].forEach(k => T_[k] = mkTag());
const tagW = tg => { if (tg.w < 0 || tg.w === undefined) tg.w = tg.el.offsetWidth; return tg.w; };
const barsEl = $('bars');
const CLS = ['Empty', 'Inert', '3M55'];
barsEl.innerHTML = CLS.map((n, c) => `<span class="l" id="bl${c}">${n}</span><span class="b" id="bb${c}"><i id="bi${c}"></i></span><span class="v" id="bv${c}">0.00</span>`).join('');
const BI = [0, 1, 2].map(c => $('bi' + c)), BVv = [0, 1, 2].map(c => $('bv' + c)), BL = [0, 1, 2].map(c => [$('bl' + c), $('bb' + c), $('bv' + c)]);
const ro = $('ro'), kick = $('kick'), insetEl = $('inset'), insl = $('insl'), insr = $('insr');
let roTxt = '', kickTxt = '', barsKey = '';
/* screen bounds of a cloud's points (true bounds: brackets fit what is drawn) */
function sbounds(cl, T2, step) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = false; const pts = cl.pts;
  for (let j = 0; j < pts.length; j += 6 * (step || 1)) { const p = C.project(X.ap(T2, [pts[j], pts[j + 1], pts[j + 2]])); if (!p) continue; ok = true; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return ok ? [x0, y0, x1, y1] : null;
}
/* bound sets: a thinned xyz copy of what an assembly draws; projected without allocation, merged into b */
function thin(P, maxN) { const n = P.length / 6, st = Math.max(1, Math.ceil(n / maxN)), o = []; for (let i = 0; i < n; i += st) o.push(P[i * 6], P[i * 6 + 1], P[i * 6 + 2]); return new Float32Array(o); }
const boundSet = (ml, maxN) => thin(ml.lv[Math.min(ml.nl - 1, 1)], maxN || 500);
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
const BS_TEL = GROUPS.filter(g => g.cls !== 'hidden').map(g => ({ g, bs: boundSet(g.cl, 400) }));
const BS_LAUNCH = boundSet(LAUNCH_CL, 900), BS_TLC2 = thin(TLC_LOD[1].shell.pts, 400);
/* TEL 1 as drawn (assemblies, launcher, TLC 2) */
function telBounds(T, st) {
  let b = null;
  for (const q of BS_TEL) b = pbounds(q.bs, groupXf(q.g, T, st), b);
  b = pbounds(BS_LAUNCH, X.mul(TEL1, launcherXf(st.elev)), b);
  return pbounds(BS_TLC2, X.mul(TEL1, mountXf(st.elev)), b);
}
function merge(a, b) { if (!a) return b; if (!b) return a; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
function bracket(b, col, a, pad, len) {
  const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad, c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
  octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
  octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.globalAlpha = a * .45; octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]); octx.globalAlpha = 1;
  return [x0, y0, x1, y1];
}
function leader(x0, y0, x1, y1, col, a) { octx.strokeStyle = col; octx.globalAlpha = a; octx.lineWidth = 1; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
const fmtT = s => { const sg = s < 0 ? '−' : '+'; s = Math.abs(s); const m = Math.floor(s / 60); return `T${sg}${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const LIMEc = '#C6F432', WHc = '#ffffff', CORALc = '#FF6A3D';
const MENU_Y = 790;             // keep brackets and tags out of the menu band

/* evidence -> belief over what is in the container (Empty, Inert, 3M55) */
function belief(T) {
  const fr = E.sat((T - TB) / (XR.tMax + .2)), ct = E.sat((T - CT0) / (CT1 - CT0));
  const pE = E.mix(.34, .05, fr) * (1 - ct) + .005 * ct;
  const pL = E.mix(.33, .45, fr) * (1 - E.ss(.55, .85, ct)) + .02 * E.ss(.55, .85, ct);
  return [pE, pL, 1 - pE - pL];
}
/* what the fly-through lens is passing (TEL z of the eye) */
function stationName(T, z) {
  if (T < 21.3) return 'Radiator fan · right';
  if (T < 22.7) return 'YaMZ-846 · V12 · right bank';
  if (T < 24.3) return 'Power pack · V12 · fans · radiators';
  if (T < 26.0) return 'Transmission · hydromechanical';
  if (z > 2.9) return 'Transmission · hydromechanical';
  if (z > 1.97) return 'Axle 2 · steered · through-drive';
  if (z > .96) return 'Cardan shaft · to axle 2';
  if (z > .14) return 'Transfer case · PTO pump';
  if (z > -2.47) return 'Cardan shaft · to axle 3';
  if (z > -3.03) return 'Axle 3 · through-drive';
  if (z > -4.67) return 'Cardan shaft · to axle 4';
  if (z > -5.23) return 'Axle 4';
  if (z > -6.75) return 'Rear outriggers';
  return 'Rear cross member · tow pintle';
}
/* exploded-view callouts, numbered down the stack; side: the placard column they read from
   (the carrier faces screen right, so the power pack is called out right and the rest left) */
const RAM_XB = RAM_X.map(c => thin(c.pts, 300));
const TLC2_TEL = (() => { const M = mountXf(0), P = thin(TLC_LOD[1].shell.pts, 400); for (let j = 0; j < P.length; j += 3) { const q = X.ap(M, [P[j], P[j + 1], P[j + 2]]); P[j] = q[0]; P[j + 1] = q[1]; P[j + 2] = q[2]; } return P; })();
const CALLOUTS = [
  ['01', 'launch', 'L'], ['02', 'cab', 'R'], ['03', 'engine', 'R'], ['04', 'fanR', 'R'], ['05', 'ram', 'L'], ['06', 'gearbox', 'R'],
  ['07', 'transfer', 'L'], ['08', 'jacksR', 'L'], ['09', 'axles', 'L'], ['10', 'hubR', 'R'], ['11', 'tyresR', 'L'],
].map(([id, name, side]) => {
  const c = { id, side, tg: mkTag() };
  if (name === 'launch') {
    const bs = new Float32Array([...BS_LAUNCH, ...TLC2_TEL]);
    return Object.assign(c, { w0: 0, anchor: [-.66, 3.06, -4.6], tag: { lab: 'TLC ×2 · 3M55', val: 'sealed' }, xf: T => X.mul(TEL1, X.make(R.I(), [0, launchLift(T), 0])), bs });
  }
  if (name === 'ram') {
    const k = T => Math.round(explodeK(W_RAM, T) * RAMX_N);
    return Object.assign(c, { w0: W_RAM, anchor: [0, 1.56, .2], tag: { lab: 'Erector ram · 3-stage' }, xf: T => X.mul(TEL1, X.make(R.I(), [0, OFF_RAM * explodeK(W_RAM, T), 0])),
      val: T => `${(4.95 * (1 + .55 * k(T) / RAMX_N)).toFixed(2)} m`, bsAt: T => RAM_XB[k(T)] });
  }
  const g = GRP[name], o = Object.assign(c, { w0: g.w0, anchor: g.tag.anchor, tag: g.tag, xf: (T, st) => groupXf(g, T, st), bs: boundSet(g.cl, 500) });
  if (name === 'transfer') { o.tag = { lab: 'Transfer case · cardan shafts ×5' }; o.also = [{ g: GRP.shafts, bs: boundSet(GRP.shafts.cl, 300) }]; }
  return o;
});
function overlays(T, S) {
  const tau = S - L0;
  // calm the menu band and the readout corner
  const lg = octx.createLinearGradient(0, 1080, 0, 700); lg.addColorStop(0, 'rgba(11,12,10,.9)'); lg.addColorStop(.55, 'rgba(11,12,10,.55)'); lg.addColorStop(1, 'rgba(11,12,10,0)');
  octx.fillStyle = lg; octx.fillRect(0, 700, 1920, 380);
  const tg2 = octx.createRadialGradient(0, 0, 0, 0, 0, 620); tg2.addColorStop(0, 'rgba(11,12,10,.6)'); tg2.addColorStop(1, 'rgba(11,12,10,0)');
  octx.fillStyle = tg2; octx.fillRect(0, 0, 640, 400);
  drawWires(T);
  const Mt = X.mul(TEL1, mountXf(telState(T, S).elev));
  let showBars = false;

  /* 1 · Inside: the container's tag condenses; the round tags as the CT plane crosses it */
  if (T >= TB + .6 && T < 16.6) {
    const a = E.ss(TB + .6, TB + 1.2, T) * (1 - E.ss(14.9, 16.2, T));
    const bl = belief(T), best = bl.indexOf(Math.max(...bl)), pb_ = bl[best];
    const anc = C.project(X.ap(Mt, [0, .6, 8.6]));
    if (anc && a > .02) {
      const tx = Math.min(1580, anc[0] + 40), ty = Math.max(150, anc[1] - 110);
      leader(anc[0], anc[1], tx, ty + 22, WHc, .75 * a);
      const lab = pb_ < .45 ? 'OBJ in TLC 2' : pb_ < .9 ? 'OBJ in TLC 2 · 3M55?' : 'OBJ in TLC 2 · 3M55';
      setTag(T_.main, 'TLC 2', lab, pb_.toFixed(2), pb_ >= .9 ? 'lime' : '', tx, ty, a);
      barsEl.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty + 28)}px)`; barsEl.style.opacity = a.toFixed(2); showBars = true;
      const key = bl.map(v => v.toFixed(2)).join();
      if (key !== barsKey) { barsKey = key; for (let c = 0; c < 3; c++) { BI[c].style.width = (bl[c] * 100).toFixed(1) + '%'; BVv[c].textContent = bl[c].toFixed(2); for (const el of BL[c]) el.classList.toggle('top', c === best && bl[c] > .5); } }
    }
    const zs = ctZ(T) - RIN;
    if (T > CT0 && zs < 4.25) {
      const aa = a * E.sat((4.25 - zs) / .6), p = C.project(X.ap(Mt, [0, -.36, RIN - .2]));
      if (p && p[1] + 70 < MENU_Y - 30) { leader(p[0], p[1], p[0] - 14, p[1] + 70, LIMEc, .6 * aa); setTag(T_.sec, '01', '3M55 · in container', '', 'lime sm', p[0] - 20, p[1] + 70, aa); }
    }
  }
  /* 2 · the carrier's slice: a tag rides it along the roof line */
  if (T > SW0 + .2 && T < SW1 + .2) {
    const z = sweepZ(T), a = E.ss(SW0 + .2, SW0 + .8, T) * (1 - E.ss(SW1 - .6, SW1 + .1, T));
    const top = z > 4.1 ? 3.25 : z > 2.9 ? 3.0 : 3.1, p = C.project(TL([0, top, z])), q = C.project(TL([0, top + 1.6, z]));
    if (p && q && a > .02) { leader(p[0], p[1], q[0], q[1], LIMEc, .8 * a); setTag(T_.slice, 'X-RAY', 'MZKT-7930 · carrier', `z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)} m`, 'lime sm', q[0] - 6, q[1] - 22, a); }
  }
  /* 2 · the fly-through: what the lens is passing */
  if (T > 19.9 && T < 31.2) {
    // under the belly the tag names the station the lime ring is on, just ahead of the lens
    const z = XS.stn > -90 ? XS.stn : stationZ(), a = E.ss(19.9, 20.5, T) * (1 - E.ss(30.4, 31.1, T));
    setTag(T_.fly, `z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)} m`, stationName(T, z), '', 'lime sm', 820, 690, a);
    placeTag(T_.fly, 960 - tagW(T_.fly) / 2, 690);
  }
  /* 2 · the exploded view: placard columns beside the carrier, a dotted leader to each assembly,
     a box that fits it while it settles */
  if (T > EXO + .8 && T < EXB + EXB_D * 1.4) {
    const st = telState(T, S), rows = [];
    let bx0 = 1e9, bx1 = -1e9;
    for (const c of CALLOUTS) {
      const W = c.xf(T, st);
      let b = pbounds(c.bsAt ? c.bsAt(T) : c.bs, W);
      if (c.also) for (const q of c.also) b = pbounds(q.bs, groupXf(q.g, T, st), b);
      if (b) { if (b[0] < bx0) bx0 = b[0]; if (b[2] > bx1) bx1 = b[2]; }
      const xp = explodeK(c.w0, T); if (xp < .8) continue;
      const a = E.ss(.8, .97, xp) * (T > EXB ? E.ss(.55, .9, xp) : 1), p = C.project(X.ap(W, c.anchor));
      if (p && a > .02) rows.push({ c, a, p, b, y: p[1] });
    }
    const colX = { L: Math.max(360, bx0 - 30), R: Math.min(1540, bx1 + 30) };
    for (const side of ['L', 'R']) {
      const rs = rows.filter(r => r.c.side === side).sort((u, v) => u.p[1] - v.p[1]);
      let y = side === 'L' ? 214 : 130;
      for (const r of rs) { r.y = Math.max(r.p[1], y); y = r.y + 28; }
      const over = y - 28 - (MENU_Y - 40); if (over > 0) for (const r of rs) r.y -= over;
      for (const r of rs) {
        const c = r.c, x = colX[side], val = c.val ? c.val(T, st) : c.tag.val || '';
        leader(r.p[0], r.p[1], x, r.y, LIMEc, .65 * r.a);
        dot(r.p[0], r.p[1], 3, LIME[0], LIME[1], LIME[2], r.a);
        setTag(c.tg, c.id, c.tag.lab, val, 'lime sm', x + 6, r.y - 11, r.a);
        if (side === 'L') placeTag(c.tg, x - 6 - tagW(c.tg), r.y - 11);
        const te = EXO + EXO_D * (c.w0 * .8 + .55), bk = E.ss(te - .5, te - .1, T) * (1 - E.ss(te + .6, te + 1.8, T));
        if (bk > .02 && T < EXB && r.b) bracket(r.b, LIMEc, .85 * bk * r.a, 5, 9);
      }
    }
  }
  /* 3 · Erect: ram and launcher */
  if (T > 47.5 && T < 62) {
    const st = telState(T, S), a = E.ss(47.8, 48.8, T) * (1 - E.ss(60.5, 61.8, T));
    const b = sbounds(TEL_RAM[Math.round(E.clamp(st.elev / 1.535, 0, 1) * RAM_N)], TEL1, 7);
    if (b && a > .02) {
      const L = V.dist(TL([0, 1.36, 2.45]), TL(X.ap(launcherXf(st.elev), [0, 1.5, -2.5])));
      const br = bracket(b, LIMEc, a * .9, 6, 10);
      setTag(T_.ram, 'RAM', 'Erector · 3-stage', `${L.toFixed(2)} m`, 'lime sm', br[0], br[1] - 26, a);
    }
    const bT = telBounds(T, st);
    if (bT && bT[3] < MENU_Y + 40) { const br = bracket(bT, WHc, .55 * a, 8, 14); setTag(T_.tel, 'TEL 1', 'K340P · Bastion-P', `${(st.elev / DEG).toFixed(1)}°`, '', br[0], br[1] - 28, a); }
    if (T > 59.6 && T < 62.4) {
      const fl = (Math.floor(T * 14) % 3 !== 0 ? 1 : .25) * E.ss(59.6, 59.9, T) * (1 - E.ss(62, 62.4, T));
      for (let k = 0; k < 64; k++) { const th = k / 64 * TAU, p = C.project(X.ap(Mt, [Math.cos(th) * .55, Math.sin(th) * .55, TLC_LEN + .03])); if (p) dot(p[0], p[1], 2, LIME[0], LIME[1], LIME[2], fl); }
    }
  }
  /* 4 · Launch: the EO tracker (the Track menu) */
  const inA = E.ss(63.8, 64.8, T) * (1 - E.ss(77, 78.6, T));
  if (T > 62 && T < 80.2) {
    const st = telState(T, S), bT = telBounds(T, st);
    const aT = E.ss(62, 63, T) * (1 - E.ss(L0 + .8, L0 + 1.6, S));
    if (bT && aT > .02 && bT[3] < MENU_Y + 60) { const br = bracket(bT, WHc, .7 * aT, 4, 10); setTag(T_.tel, 'OBJ 01', 'TEL 1 · K340P', '', '', br[0], br[1] - 26, aT); }
    if (tau > 0) {
      const p = CAP_FLY.at(tau), spin = Math.min(tau, CAP_FLY.landed) * CAP_FLY.spin, Rm = R.mul(R.x(spin), R.y(spin * .6));
      const cb = sbounds(TLC_LOD[1].cap, X.make(Rm, V.sub(p, R.ap(Rm, [0, 0, TLC_LEN + .07]))), 3);
      const aC = 1 - E.ss(4.5, 6, tau);
      if (cb && aC > .02 && cb[2] - cb[0] < 300 && cb[3] < MENU_Y) { const br = bracket(cb, WHc, .8 * aC, 5, 7); setTag(T_.cap, 'OBJ 04', 'Debris · TLC cap', '', 'sm', br[2] + 6, br[1] - 4, aC); }
      if (tau > .3 && T < 80.2) {
        const Wm = misXf(tau), L = RND[1];
        let b = sbounds(L.body, Wm, 4);
        b = merge(b, sbounds(L.fins[Math.round(E.ss(TAU_EXIT - .05, TAU_EXIT + .3, tau) * FOLD_N)], Wm, 2));
        b = merge(b, sbounds(L.wings[Math.round(E.ss(TAU_SEP + .15, TAU_SEP + .75, tau) * FOLD_N)], Wm, 2));
        if (tau < TAU_EXIT + .05) { const m = C.project(MOUTH_UP); if (m && b) b[3] = Math.min(b[3], m[1]); }
        const sp = tau < TAU_EXIT ? 45 * tau : FLY.speed(tau), p2 = misPos(tau), ta = Math.max(inA, E.ss(71.5, 72.5, T)), val = `${Math.round(p2[1])} m · ${Math.round(sp)} m/s · ${(V.dist(TRK_EYE, p2) / 1000).toFixed(2)} km`;
        if (b && b[3] < MENU_Y - 10 && b[2] < 1900) {
          if (b[2] - b[0] > 16 || b[3] - b[1] > 16) {
            const br = bracket(b, LIMEc, ta, 6, 12);
            setTag(T_.trk, 'TRK 01', '3M55 · P-800', val, 'lime', br[0], br[1] - 30, ta);
          } else {
            // too small to box: the ring marker the coast carries on
            const q = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
            octx.strokeStyle = LIMEc; octx.globalAlpha = ta; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(q[0], q[1], 7, 0, TAU); octx.stroke(); octx.globalAlpha = 1;
            const lf = q[0] > 1480 ? -1 : 1;                 // near the right edge the tag reads from the left
            leader(q[0], q[1], q[0] + 30 * lf, q[1] - 40, LIMEc, .7 * ta);
            setTag(T_.trk, 'TRK 01', '3M55 · P-800', val, 'lime', q[0] + 34, q[1] - 64, ta);
            if (lf < 0) placeTag(T_.trk, q[0] - 34 - tagW(T_.trk), q[1] - 64);
          }
          leader(C.cx, C.cy, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, LIMEc, .5 * inA);
        }
      }
      if (tau > TAU_SEP && tau < TAU_SEP + 5) {
        const t = tau - TAU_SEP, bp = BOOST_FLY.at(t), Rm2 = R.mul(SEPX.R, R.x(Math.min(t, BOOST_FLY.landed) * BOOST_FLY.spin));
        const bb = sbounds(BOOST_S.casing, X.make(Rm2, bp), 3), aB = E.ss(0, .3, t) * (1 - E.ss(3.5, 5, t));
        if (bb && aB > .02) { const br = bracket(bb, WHc, .7 * aB, 4, 6); setTag(T_.bst, 'OBJ 05', 'Booster · spent', '', 'sm', br[2] + 6, br[3] + 4, aB); }
      }
    }
    const ra = E.ss(62.5, 64, T) * (1 - E.ss(77, 78.6, T));
    if (ra > .02) { octx.strokeStyle = '#fff'; octx.globalAlpha = .55 * ra; octx.lineWidth = 1; octx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(C.cx + dx * 9, C.cy + dy * 9); octx.lineTo(C.cx + dx * 26, C.cy + dy * 26); } octx.stroke(); octx.globalAlpha = 1; }
  }
  insetEl.style.opacity = inA.toFixed(2);
  if (inA > .01) {
    const tgt = tau > 0 ? misPos(Math.max(0, tau)) : TRK_PRE;
    cam2.eye = TRK_EYE.slice(); cam2.target = tgt; cam2.fov = C.fov / 8; cam2.update();
    use(cam2, pb2); pb2.clear();
    drawSmoke(T, S); drawRound(T, S); drawEjecta(T, S);
    for (const item of tlcList(T)) if (item.at === 'tel') drawTLC(item, T, S, 0);
    drawTEL1(T, S, 1);
    pb2.blit(); use(cam, pb);
    insl.textContent = `NFOV ${(C.fov / DEG / 8).toFixed(2)}° · ${tau > .3 ? 'TRK 01' : 'no track'}`;
    insr.textContent = tau > 0 ? (tau < TAU_EXIT ? 'ejection' : tau < TAU_IGN ? 'coast' : tau < TAU_BO ? 'boost' : tau < TAU_RJ ? 'booster out' : 'ramjet') : 'TLC 2';
  }
  /* 5 · Coast: the round ahead, the surveyed positions */
  if (T > 80.2 && T < 106.5 && tau > 0) {
    const p = misPos(tau), q = tau < TAU_HIT ? C.project(p) : null, a = 1 - E.ss(105, 106.5, T);
    if (q && a > .02 && q[0] > 0 && q[0] < 1720 && q[1] > 60 && q[1] < MENU_Y) {
      octx.strokeStyle = LIMEc; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(q[0], q[1], 7, 0, TAU); octx.stroke(); octx.globalAlpha = 1;
      // near the top edge, or under the destroyer on the long lens, the tag hangs below the marker
      const dn = q[1] < 150 || (T > 97 && T < T_HIT) ? -1 : 1;
      leader(q[0], q[1], q[0] + 30, q[1] - 40 * dn, LIMEc, .7 * a);
      setTag(T_.trk, 'TRK 01', '3M55', `${Math.round(FLY.speed(tau))} m/s · ${(V.len([p[0], 0, p[2]]) / 1000).toFixed(1)} km · ${Math.round(p[1] - SEA)} m`, 'lime', q[0] + 34, dn > 0 ? q[1] - 64 : q[1] + 32, a);
    }
    const sa = T - T_SPLASH;
    if (sa > 0 && sa < 5) { const g = C.project([P_SPLASH[0], SEA, P_SPLASH[2]]); if (g && g[1] < MENU_Y) setTag(T_.spl, 'OBJ 05', 'Booster · splash', `${(V.len([P_SPLASH[0], 0, P_SPLASH[2]]) / 1000).toFixed(1)} km`, 'sm', g[0] + 14, g[1] - 44, E.ss(0, .3, sa) * (1 - E.ss(4, 5, sa))); }
  }
  /* 5-6 · the destroyer: a hostile contact at the end of the line, then the hit */
  if (T > 95 && T < 111.5) {
    const b = pbounds(DDG_BS, DDG_W), km = `${(V.len([DDG_W.T[0], 0, DDG_W.T[2]]) / 1000).toFixed(1)} km`;
    if (b && b[1] > 70 && b[3] < MENU_Y - 20 && b[0] > 60 && b[2] < 1860) {
      if (T < T_HIT) {
        const a = E.ss(96.5, 97.5, T) * E.ss(10, 16, b[2] - b[0]);
        if (a > .02) {
          const br = bracket(b, CORALc, .9 * a, 5, 7);
          leader(br[0], br[1], br[0] - 34, br[1] - 40, CORALc, .7 * a);
          setTag(T_.ddg, 'OBJ 07', 'DDG · hostile', km, 'coral sm', 0, br[1] - 58, a);
          placeTag(T_.ddg, br[0] - 38 - tagW(T_.ddg), br[1] - 58);
        }
      } else {
        const a = E.ss(T_HIT + .08, T_HIT + .35, T) * (1 - E.ss(109.5, 111, T)), g = C.project(P_BLOOM);
        if (g && a > .02) {
          const x = g[0] - 46, y = Math.min(g[1], b[1]) - 64;
          leader(g[0], g[1] - 8, x, y + 22, LIMEc, .7 * a);
          setTag(T_.ddg, 'Hit', 'DDG', km, 'lime', 0, y, a);
          placeTag(T_.ddg, x - tagW(T_.ddg), y);
        }
      }
    }
  }
  /* 5-6 · the surveyed positions: tagged as the scan reaches them, carried home through the time-lapse */
  if (T > 80.2 && T < 122.5) {
    const a = 1 - E.ss(121, 122.5, T), Wz = tzmWorld(T), marks = [[T_.pant, 'OBJ 03', 'Pantsir-S1', `+${Math.round(Wd.H_PAD)} m`, PANTW.T, 60], [T_.bat, 'OBJ 01', 'Battery · Krasnaya Kosa', `+${Math.round(Wd.H_PAD)} m`, [0, 0, 0], 90]];
    if (Wz && T > 108 && T < 122.5) marks.push([T_.tzm, 'OBJ 06', 'TZM · K342P', `${Math.round(V.len(Wz.T))} m`, V.add(Wz.T, [0, 3.4, 0]), 44]);
    for (const [tg, id, name, val, pos, stem] of marks) {
      const aa = a * E.ss(0, .6, T - Math.max(80.2, SURV.RT0(V.dot(pos, AH))));
      const g = C.project(pos); if (!g || aa < .02 || g[1] < 60 || g[1] > MENU_Y || g[0] < 20 || g[0] > 1700) continue;
      for (let yy = 6; yy <= stem; yy += 3) dot(g[0], g[1] - yy, 1, LIME[0], LIME[1], LIME[2], aa);
      setTag(tg, id, name, val, 'lime sm', g[0] - 1, g[1] - stem - 21, aa);
    }
  }
  /* 7 · Reload: the containers */
  if (T > 124 && T < 158) {
    const a = E.ss(124.5, 126, T) * (1 - E.ss(155, 157.5, T));
    for (const item of tlcList(T)) {
      if (item.at === 'far' && T > 137.5) continue;
      const Wt = tlcXf(item, T, S); if (!Wt) continue;
      const b = sbounds(TLC_LOD[1].shell, Wt, 5); if (!b || b[3] > MENU_Y) continue;
      const tg = item.loaded ? T_.tlcB : T_.tlcA, br = bracket(b, item.loaded ? LIMEc : WHc, .8 * a, 5, 9);
      setTag(tg, item.loaded ? 'TLC' : 'TLC 2', item.loaded ? '3M55 · sealed' : 'empty · cap gone', '', item.loaded ? 'lime sm' : 'sm', br[0], br[1] - 24, a);
    }
    const Wz = tzmWorld(T);
    if (Wz) {
      const q = C.project(X.ap(Wz, [0, 3.4, 5.2]));
      if (q && q[1] < MENU_Y) {
        let x = q[0] - 40, y = q[1] - 34; const w = 150;
        // never on top of a container's tag: step below the anchor instead
        for (const tg of [T_.tlcA, T_.tlcB]) if (tg.on && x < tg.x + tagW(tg) + 8 && x + w > tg.x - 8 && Math.abs(y - tg.y) < 26) y = q[1] + 14;
        setTag(T_.tzm, 'OBJ 06', 'TZM · K342P', '', 'sm', x, y, a);
      }
    }
  }

  // readout
  const rate = SIM.rate(T);
  const ch = CHAPTERS.reduce((a, c) => c.t <= T ? c : a, CHAPTERS[0]), ci = CHAPTERS.indexOf(ch);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${ch.title} · ${ch.sub}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  const clock = T >= 153 ? fmtT(T - DUR - L0) : fmtT(tau);
  const rateTxt = rate > 1.05 ? `<span class="l">×${rate < 9.5 ? rate.toFixed(1) : Math.round(rate)}</span>` : '×1';
  let l1, l2;
  if (T < 20 || T >= 153) { l1 = T > SW0 && T < 20 ? 'TEL 1 · <b>MZKT-7930</b>' : 'TEL 1 · K340P · <b>TLC 2</b>'; l2 = T > SW0 && T < 20 ? `X-ray <b>${Math.round(100 * E.sat((T - SW0) / (SW1 - SW0)))} %</b> · slice <b>z ${sweepZ(T) >= 0 ? '+' : '−'}${Math.abs(sweepZ(T)).toFixed(2)} m</b>` : T >= TB && T < 20 ? `X-ray <b>${Math.round(100 * E.sat((T - TB) / (CT1 - TB)))} %</b> · CT <b>${Math.max(0, ctZ(T)).toFixed(2)} m</b>` : 'X-ray <b>standby</b>'; }
  else if (T < 45.5) { l1 = 'MZKT-7930 · <b>8×8 carrier</b>'; l2 = T < 31.4 ? `Station · <b>z ${stationZ() >= 0 ? '+' : '−'}${Math.abs(stationZ()).toFixed(2)} m</b>` : `Cutaway · <b>${Math.round(explodeK(0, T) * 100)} %</b>`; }
  else if (T < 62) { const st = telState(T, S); l1 = 'TEL 1 · <b>erector</b>'; l2 = `Elev <b>${(st.elev / DEG).toFixed(1)}°</b> · jacks <b>${Math.round(st.dep * 100)} %</b>`; }
  else if (T < 106.5 && tau >= TAU_HIT) { l1 = 'TRK 01 · <b>3M55</b> · hit'; l2 = `<b>DDG</b> · <b>${(V.len([P_HIT[0], 0, P_HIT[2]]) / 1000).toFixed(2)} km</b>`; }
  else if (T < 106.5 && tau > 0) { const sp = tau < TAU_EXIT ? 45 * tau : FLY.speed(tau), p = misPos(tau); l1 = `TRK 01 · <b>3M55</b> · ${tau < TAU_IGN ? 'ejected' : tau < TAU_BO ? 'boost' : tau < TAU_RJ ? 'separation' : 'ramjet'}`; l2 = `<b>${Math.round(sp)} m/s</b> · M <b>${(sp / 340).toFixed(2)}</b> · <b>${(V.len([p[0], 0, p[2]]) / 1000).toFixed(2)} km</b>`; }
  else if (T < 106.5) { l1 = 'TEL 1 · <b>ready</b>'; l2 = 'TLC 2 · <b>3M55</b>'; }
  else if (T < 124) { l1 = 'Battery · <b>time-lapse</b>'; l2 = `TEL 1 <b>stowed</b> · TLC 2 <b>empty</b>`; }
  else { l1 = 'K342P · <b>reload TLC 2</b>'; l2 = T < 130.3 ? 'Hook <b>→ empty TLC</b>' : T < 135.7 ? 'Lift <b>empty TLC</b>' : T < 139.5 ? 'Hook <b>→ fresh TLC</b>' : T < 153 ? 'Lift <b>fresh TLC</b>' : 'TLC 2 <b>seated</b>'; }
  const html = `${l1}<br>${l2}<br>${clock} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
  if (!showBars) barsEl.style.opacity = 0;
}

/* ---------- render ---------- */
function render(T) {
  const S = SIM(T), tau = S - L0;
  for (const t of tagPool) t.on = false;
  FILM.apply(cam, camAt(T, S));
  cam.near = T > 19.4 && T < 32 ? .03 : .3;
  const sh = S - S_HIT;
  cam.shake = tau > TAU_IGN && tau < TAU_IGN + 1.6 ? FILM.shake(T, 3.2 * (1 - (tau - TAU_IGN) / 1.6), 22) : sh > 0 && sh < 1.4 ? FILM.shake(T, 4 * Math.pow(1 - sh / 1.4, 2), 15) : [0, 0];
  cam.update();
  use(cam, pb); pb.clear();
  let t0 = performance.now();
  drawWorld(T, S); pf('world', t0); t0 = performance.now();
  drawActors(T, S); pf('actors', t0);
  FLASH.v = 0; drawBolt(T);
  t0 = performance.now(); drawStrike(T, S); pf('strike', t0);
  pb.blit();
  octx.clearRect(0, 0, 1920, 1080);
  if (FLASH.v > .5) { octx.fillStyle = `rgba(236,244,226,${(FLASH.v / 255).toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  t0 = performance.now(); overlays(T, S); pf('overlays', t0);
  for (const t of tagPool) if (!t.on) t.el.classList.add('off');
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const cues = [
  [TB - .25, () => SFX.tone(90, 60, .5, 'sine', .05)],
  [TB, () => SFX.crack()],
  [CT0, () => SFX.tone(1650, 1650, .05, 'square', .012)],
  [CT1, () => { SFX.tone(1250, 1250, .05, 'square', .014); SFX.tone(1875, 1875, .06, 'square', .01, .08); }],
  [SW0, () => { SFX.tone(980, 980, .05, 'square', .012); SFX.noise(SW1 - SW0, 3200, .4, .012, 1.2); }],
  [20.2, () => SFX.noise(1.6, 420, 1.4, .05, .5)],
  [25.4, () => SFX.noise(5.5, 160, 1.1, .04, 1.4)],
  [EXO, () => SFX.tone(220, 330, 1.6, 'sine', .035)],
  [EXB, () => SFX.tone(330, 220, 1.6, 'sine', .035)],
  [SC0, () => SFX.noise(1.2, 1200, .7, .035, .3)],
  [47.8, () => SFX.noise(2.6, 240, 1, .06, .2)],
  [50.8, () => SFX.noise(8.4, 180, 1.2, .07, .8)],
  [59.2, () => SFX.tone(70, 55, .4, 'sine', .08)],
  [60, () => SFX.tone(1500, 1500, .03, 'square', .012)], [60.6, () => SFX.tone(1500, 1500, .03, 'square', .012)], [61.2, () => SFX.tone(1500, 1500, .03, 'square', .012)],
  [L0, () => { SFX.noise(.7, 700, .8, .14, .005); SFX.tone(120, 60, .3, 'sine', .08); }],
  [L0 + TAU_IGN, () => SFX.rumble(5, .22)],
  [L0 + TAU_SEP, () => SFX.crack()],
  [L0 + TAU_RJ, () => SFX.noise(3, 2600, .5, .05, .05)],
  [80, () => SFX.tone(160, 90, 1.4, 'sine', .06)],
  [T_HIT, () => { SFX.tone(58, 34, 1.6, 'sine', .08); SFX.noise(2.6, 240, .9, .06, .01); }],
  [106.5, () => SFX.noise(3.5, 900, .6, .05, .8)],
  [125.4, () => SFX.tone(70, 55, .35, 'sine', .07)],
  [126.8, () => SFX.noise(2, 300, 1, .04, .3)],
  [130.2, () => SFX.tone(160, 120, .12, 'square', .02)],
  [135.6, () => SFX.tone(140, 100, .14, 'square', .02)],
  [139.3, () => SFX.tone(160, 120, .12, 'square', .02)],
  [152.8, () => { SFX.tone(110, 70, .25, 'sine', .08); SFX.noise(.3, 500, 1, .05, .005); }],
];
if (T_SPLASH < DUR) cues.push([T_SPLASH, () => SFX.noise(1.2, 500, .8, .05, .01)]);
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ stot: S_TOT, hd: MOD.hd(), tMax: XR.tMax, splash: [T_SPLASH, P_SPLASH], bo: misPos(TAU_BO) });
STAGE.prof = () => { const o = PROF || {}; const c = {}; for (const k in o) { c[k] = +o[k].toFixed(2); o[k] = 0; } return c; };
})();
