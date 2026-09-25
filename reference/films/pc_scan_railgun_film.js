/* SCAN · RAILGUN (Point Cloud): a draft of the game's SCAN with a source. An Arleigh Burke on station at night; on
   the bridge roof a compact scan mast unfolds in stages (hatches part, the carriage lifts, the cradle stands up, the
   rails run out in two stages, five coils swing into place), charges (lime arcs crawling round the coils), and fires
   a probe straight up with a flash and a shock ring. The probe climbs to 22 km (the climb shown at up to x4), bursts,
   and the lime lightning forks down 17 km onto a coastal battery, where the scan identifies it part by part.
   Then the mast folds back down. One take, 42 s, loops. Render is a pure function of film time T. */
(() => {
const { V, R, X, E, rng } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = SK; K.setup();
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = [];
const t0load = performance.now();

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 42;
const CHAPTERS = [
  { t: 0, title: 'Mast' }, { t: 3, title: 'Deploy' }, { t: 11.5, title: 'Charge' }, { t: 15.5, title: 'Fire' },
  { t: 21, title: 'Strike' }, { t: 22.6, title: 'Scan' }, { t: 31.2, title: 'Stow' },
];
const TF = 15.5, TBU = 21.0, LEAD = 1.02, TB = TBU + .08 + LEAD;       // fire, burst, the return stroke
const HB = 22000, S1 = 16;                                                // apex (m above the muzzle), climb (sim s)
const WARP = FILM.warp([{ t: 0, rate: 1 }, { t: .3, rate: 1 }, { t: 1.4, rate: 4 }, { t: 4.2, rate: 4 }, { t: TBU - TF, rate: 1.4 }]);
const WS = S1 / WARP.total;
const climbS = T => T <= TF ? 0 : T >= TBU ? S1 : WARP(T - TF) * WS;
const climbRate = T => T <= TF || T >= TBU ? 1 : WARP.rate(T - TF) * WS;
const yOf = s => HB * (1 - (1 - s / S1) * (1 - s / S1));
const vOf = s => 2 * HB / S1 * (1 - s / S1);

/* ---------- the world: the ship on station, the coast 17 km to the north-north-east ---------- */
const U0 = [0, 19.4, 26.6];                                             // the scan mast's base on the bridge roof
const S_POS = [7200, 0, 15600], PSI = Math.atan2(S_POS[0], S_POS[2]);
const SITE = K.makeSite({ xf: X.make(R.y(PSI), S_POS), seaR: 3100, landR: 14000 });
const S_HIT = SITE.hitW, S_LOOK = X.ap(SITE.XF, [5, 21, 15]);
const RANGE = Math.hypot(S_HIT[0], S_HIT[2]);
LOG.push(`site ${(performance.now() - t0load).toFixed(0)} ms`);
/* sea round the ship: rings out to 30 km (the site draws its own near the coast) */
const SEA = (() => {
  const A = [], r = rng(2402);
  for (let rad = 12; rad < 30000; rad += 2 + rad * .02) {
    const ds = 2 + rad * .02, n = Math.floor(TAU * rad / ds), ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * TAU, rr = rad + (r() - .5) * ds * .8, x = Math.sin(a) * rr, z = Math.cos(a) * rr + 10;
      const dx = x - S_POS[0], dz = z - S_POS[2];
      if (dx * dx + dz * dz < 3000 * 3000) continue;
      const lx = Math.cos(PSI) * dx - Math.sin(PSI) * dz, lz = Math.sin(PSI) * dx + Math.cos(PSI) * dz;
      if (lz > SITE.coastZ(lx) - 2) continue;
      if (Math.abs(x) < 10.5 && Math.abs(z) < 78) continue;
      const tex = Math.exp(1.2 * M3.fbm(x * .0021, z * .0009, 3.7, 3) - .2);
      A.push(x, z, Math.min(1, .13 + .1 * tex + .05 * r()), r() * TAU);
    }
  }
  return K.tiled(new Float32Array(A), 4, 400, true);
})();
const STARS = K.stars(2400, 9);

/* ---------- the destroyer ---------- */
const DDM = HD.destroyer();
const SHIP = K.lodModel(DDM, {}, [.12, .24, .48, .96, 1.92], 101, 1.4);
LOG.push(`ship ${(performance.now() - t0load).toFixed(0)} ms`);
/* gentle motion on station, loop-exact (whole periods in 42 s) */
function shipW(T) {
  const roll = .55 * DEG * Math.sin(TAU * T / 10.5), pitch = .22 * DEG * Math.sin(TAU * T / 7 + 1.1), heave = .12 * Math.sin(TAU * T / 6);
  return X.make(R.mul(R.x(pitch), R.z(roll)), [0, heave, 0]);
}

/* ---------- the scan mast: housing, hatches, lift sleeves, carriage, cradle, rails ×3 stages, coils ×5 ---------- */
const G = GEO;
const LVU = [.022, .044, .088, .176, .352];
const HW = 1.7, HL = 2.4, HH = 1.35, PVZ = -1.6;
const P_HOUSING = (() => {
  const P = [G.box([-HW, 0, -HL], [HW, HH, HL], { skip: [1] })];
  for (const s of [-1, 1]) {
    for (let z = -1.6; z <= 1.61; z += .8) P.push(G.line([[s * (HW + .02), .08, z], [s * (HW + .02), HH - .06, z]], { w: .6 }));
    P.push(G.cyl([s * HW, HH + .04, -HL], [s * HW, HH + .04, HL], .06, { n: 8, gen: 0 }));
    P.push(G.box([s * HW - .25, -.02, -HL - .2], [s * HW + .25, .12, -HL + .3]), G.box([s * HW - .25, -.02, HL - .3], [s * HW + .25, .12, HL + .2]));
  }
  P.push(G.box([-.6, .02, HL - .02], [.6, .5, HL + .12]));                          // service panel
  return P;
})();
const lidPrims = s => {
  const x0 = s > 0 ? 0 : -HW, x1 = s > 0 ? HW : 0;
  const P = [G.box([x0, HH, -HL], [x1, HH + .1, HL], { bottom: true })];
  for (let z = -1.5; z <= 1.51; z += 1) P.push(G.line([[x0 + .1, HH + .11, z], [x1 - .1, HH + .11, z]], { w: .7 }));
  P.push(G.line([[s * .02, HH + .11, -HL + .05], [s * .02, HH + .11, HL - .05]], { w: .9 }));
  return P;
};
const P_SLEEVE = [G.cyl([0, 0, PVZ], [0, .8, PVZ], .46, { n: 28, gen: 4 })];
const P_SLEEVE_B = [G.cyl([0, .05, PVZ], [0, .8, PVZ], .4, { n: 26, gen: 4, rings: [0, 1] })];
const P_SLEEVE_C = [G.cyl([0, .1, PVZ], [0, .82, PVZ], .34, { n: 24, gen: 4, rings: [0, 1] })];
const P_CARRIAGE = (() => {
  const P = [G.cyl([0, .15, PVZ], [0, .3, PVZ], 1.0, { n: 36, gen: 0, caps: true })];
  for (const s of [-1, 1]) {
    P.push(G.box([s > 0 ? .86 : -1.0, .3, PVZ - .5], [s > 0 ? 1.0 : -.86, 1.02, PVZ + .5]));
    P.push(G.cyl([s * .84, .85, PVZ], [s * 1.12, .85, PVZ], .2, { n: 16, gen: 0, caps: true }));
  }
  return P;
})();
const P_CRADLE = (() => {
  const P = [G.box([-.5, -.4, -.55], [.5, .4, .35])];
  P.push(G.cyl([-.84, 0, 0], [.84, 0, 0], .12, { n: 10, gen: 0 }));
  for (const s of [-1, 1]) {
    P.push(G.cyl([s * .33, -.36, -.45], [s * .33, -.36, 1.7], .14, { n: 14, gen: 3, caps: true }));   // capacitor drums
    P.push(G.box([s * .27 - .075, -.17, .3], [s * .27 + .075, .17, 3.4]));                          // rails, stage 1
  }
  for (let z = .7; z < 3.4; z += .7) { P.push(G.box([-.36, .17, z], [.36, .23, z + .1])); P.push(G.box([-.36, -.23, z], [.36, -.17, z + .1])); }
  P.push(G.box([-.42, -.26, 3.25], [.42, .26, 3.42], { skip: [4, 5] }));
  return P;
})();
const stagePrims = (z0, z1, hw, hh, n) => {
  const P = [];
  for (const s of [-1, 1]) P.push(G.box([s * .27 - hw, -hh, z0], [s * .27 + hw, hh, z1]));
  for (let k = 1; k <= n; k++) { const z = z0 + (z1 - z0) * k / (n + 1); P.push(G.box([-.33, hh, z], [.33, hh + .05, z + .08]), G.box([-.33, -hh - .05, z], [.33, -hh, z + .08])); }
  return P;
};
const P_ST2 = stagePrims(.6, 3.2, .058, .135, 2);
const P_ST3 = (() => {
  const P = stagePrims(.8, 3.2, .045, .11, 2);
  P.push(G.lathe([0, 0, 3.05], [0, 0, 1], [[0, .3], [.12, .34], [.3, .34], [.38, .28]], { n: 30, gen: 6, rings: [1, 2], caps: false }));
  P.push(G.lathe([0, 0, 3.05], [0, 0, 1], [[0, .2], [.38, .2]], { n: 20, gen: 0 }));
  return P;
})();
const CR_ = .72;
const P_COIL = (() => {
  const P = [G.lathe([0, 0, -.13], [0, 0, 1], [[0, CR_], [.26, CR_]], { n: 56, gen: 0, rings: [0, 1] })];
  P.push(G.lathe([0, 0, -.1], [0, 0, 1], [[0, CR_ - .12], [.2, CR_ - .12]], { n: 48, gen: 0 }));
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, c = Math.cos(a), s = Math.sin(a), r0 = CR_ - .01, r1 = CR_ + .08, w = .06; P.push(G.hex([[r0 * c - w * s, r0 * s + w * c, -.14], [r0 * c + w * s, r0 * s - w * c, -.14], [r0 * c + w * s, r0 * s - w * c, .14], [r0 * c - w * s, r0 * s + w * c, .14], [r1 * c - w * s, r1 * s + w * c, -.14], [r1 * c + w * s, r1 * s - w * c, -.14], [r1 * c + w * s, r1 * s - w * c, .14], [r1 * c - w * s, r1 * s + w * c, .14]])); }
  for (const a of [PI * .25, PI * .75, PI * 1.25, PI * 1.75]) P.push(G.line([[(CR_ - .12) * Math.cos(a), (CR_ - .12) * Math.sin(a), 0], [.24 * Math.cos(a), .24 * Math.sin(a), 0]], { w: .8 }));
  P.push(G.cyl([-.1, -CR_, -.1], [.1, -CR_, -.1], .05, { n: 8, gen: 0 }));                 // hinge
  return P;
})();
const CL = {
  housing: K.lodPrims(P_HOUSING, LVU, 11, .6), lidR: K.lodPrims(lidPrims(1), LVU, 12, .6), lidL: K.lodPrims(lidPrims(-1), LVU, 13, .6),
  slA: K.lodPrims(P_SLEEVE, LVU, 14, .6), slB: K.lodPrims(P_SLEEVE_B, LVU, 15, .6), slC: K.lodPrims(P_SLEEVE_C, LVU, 16, .6),
  carriage: K.lodPrims(P_CARRIAGE, LVU, 17, .6), cradle: K.lodPrims(P_CRADLE, LVU, 18, .6),
  st2: K.lodPrims(P_ST2, LVU, 19, .6), st3: K.lodPrims(P_ST3, LVU, 20, .6), coil: K.lodPrims(P_COIL, LVU, 21, .5),
};
LOG.push(`unit ${(performance.now() - t0load).toFixed(0)} ms`);
// coils: [stage 1..3, z on that stage]
const COILS = [[1, .9], [1, 2.2], [2, 1.1], [2, 2.4], [3, 1.7]];

/* ---------- the unit's state in film time ---------- */
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const OPEN = 118 * DEG;
const ST = { lidR: 0, lidL: 0, lift: 0, el: 0, e2: 0, e3: 0, coil: [0, 0, 0, 0, 0], rec: 0 };
function stateAt(T) {
  ST.lidR = kk(T, 3.0, 4.2) * (1 - kk(T, 38.9, 40.1));
  ST.lidL = kk(T, 3.15, 4.35) * (1 - kk(T, 39.0, 40.2));
  ST.lift = 1.5 * kk(T, 4.3, 5.6) * (1 - kk(T, 37.8, 38.9));
  ST.el = PI / 2 * kk(T, 5.7, 7.8) * (1 - kk(T, 35.8, 37.8));
  ST.e2 = 2.6 * kk(T, 8.0, 9.2) * (1 - kk(T, 34.6, 35.7));
  ST.e3 = 2.3 * kk(T, 8.6, 9.8) * (1 - kk(T, 33.9, 35.0));
  for (let k = 0; k < 5; k++) ST.coil[k] = kk(T, 9.8 + .36 * k, 10.35 + .36 * k) * (1 - kk(T, 32.2 + .3 * (4 - k), 32.75 + .3 * (4 - k)));
  const a = T - TF;
  ST.rec = a > 0 && a < 1.2 ? .22 * (a < .02 ? a / .02 : Math.exp(-(a - .02) * 7) * Math.cos((a - .02) * 11)) : 0;
  return ST;
}
const pivZ = (a, h) => { const Rm = R.z(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const pivX = (a, h) => { const Rm = R.x(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const XF = {};
function unitXf(Ws, st) {
  const Wu = X.mul(Ws, tr(U0[0], U0[1], U0[2]));
  XF.unit = Wu;
  XF.lidR = X.mul(Wu, pivZ(-OPEN * st.lidR, [HW, HH + .04, 0]));
  XF.lidL = X.mul(Wu, pivZ(OPEN * st.lidL, [-HW, HH + .04, 0]));
  XF.slB = X.mul(Wu, tr(0, .5 * st.lift, 0));
  XF.slC = X.mul(Wu, tr(0, st.lift, 0));
  XF.carriage = XF.slC;
  XF.cradle = X.mul(X.mul(Wu, X.make(R.x(-st.el), [0, .85 + st.lift, PVZ])), tr(0, 0, -st.rec));
  XF.st2 = X.mul(XF.cradle, tr(0, 0, st.e2));
  XF.st3 = X.mul(XF.st2, tr(0, 0, st.e3));
  XF.coil = COILS.map(([sg, z], k) => X.mul(X.mul(sg === 1 ? XF.cradle : sg === 2 ? XF.st2 : XF.st3, tr(0, 0, z)), pivX(PI / 2 * (1 - st.coil[k]), [0, -CR_, 0])));
  return XF;
}

/* ---------- the probe, its trail, the burst, the bolt ---------- */
const MZ0 = (() => { const st = stateAt(TF - .01); unitXf(shipW(TF), Object.assign({}, st, { rec: 0 })); return X.ap(XF.st3, [0, 0, 3.4]); })();
const B_TOP = [MZ0[0] + 140, MZ0[1] + HB, MZ0[2] + 60];               // a little wind drift on the way up
const probeAt = (s, out) => { const y = yOf(s), k = y / HB; out[0] = MZ0[0] + 140 * k * k; out[1] = MZ0[1] + y; out[2] = MZ0[2] + 60 * k * k; return out; };
const TRN = 900, TRAIL = (() => {
  const A = new Float32Array(TRN * 4), r = rng(3131);
  for (let i = 0; i < TRN; i++) { const y = HB * Math.pow((i + .5) / TRN, 1.6); A[i * 4] = y; A[i * 4 + 1] = S1 * (1 - Math.sqrt(Math.max(0, 1 - y / HB))); A[i * 4 + 2] = r() * TAU; A[i * 4 + 3] = r(); }
  return A;
})();
const BOLT = new K.Bolt({ top: B_TOP, hit: S_HIT, seed: 1402, depth: 9, nb: 14, rough: .55, spark: 26 });
const BURST = (() => { const r = rng(515), A = new Float32Array(520 * 4); for (let i = 0; i < 520; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h; A[i * 4 + 1] = u; A[i * 4 + 2] = Math.sin(a) * h; A[i * 4 + 3] = .5 + .5 * r(); } return A; })();
const SHOCK = (() => { const r = rng(616), A = new Float32Array(700 * 3); for (let i = 0; i < 700; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(a) * h; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(a) * h; } return A; })();
const PLUME = (() => { const r = rng(717), A = new Float32Array(260 * 5); for (let i = 0; i < 260; i++) { const a = r() * TAU, s = r(); A[i * 5] = Math.cos(a) * (1 + 5 * s); A[i * 5 + 1] = 6 + 40 * r() * r(); A[i * 5 + 2] = Math.sin(a) * (1 + 5 * s); A[i * 5 + 3] = .3 + 1.4 * r(); A[i * 5 + 4] = r(); } return A; })();
const P3 = [0, 0, 0];

/* ---------- camera ---------- */
const U_W = [0, 19.4 + 1.2, 26.6];
const PATH_A = FILM.path([
  { t: 0, eye: [12.8, 24.6, 37.4], target: [0, 20.5, 25.9], fov: 30 },
  { t: 3.2, eye: [11.6, 24.0, 35.6], target: [0, 20.9, 26.0], fov: 31 },
  { t: 6.4, eye: [13.2, 22.3, 30.6], target: [0, 22.4, 26.0], fov: 38 },
  { t: 9.6, eye: [14.6, 23.2, 34.0], target: [0, 25.0, 26.0], fov: 44 },
  { t: 12.9, eye: [9.4, 21.1, 37.6], target: [0, 26.0, 26.0], fov: 44 },
  { t: TF, eye: [7.0, 20.9, 38.4], target: [0, 27.0, 25.8], fov: 46 },
]);
const A_END = PATH_A(TF);
const DIRH = [Math.cos(PSI), 0, -Math.sin(PSI)];      // square to the line ship -> coast: the bolt crosses the frame
function camB(T) {
  const h = T < TF ? 0 : yOf(climbS(T)), w = E.ss(TF + .25, TF + 1.9, T);
  const off = 70 + 1.12 * h;
  const ce = [DIRH[0] * off, 26 + .48 * h, 26 + DIRH[2] * off], ct = [0, 29 + .5 * h, 26];
  return { eye: V.lerp(A_END.eye, ce, w), target: V.lerp(A_END.target, ct, w), fov: (46 + 16 * w) * DEG };
}
const E21 = camB(TBU).eye;
const DIR0 = V.norm(V.sub(E21, S_HIT)), D0 = V.dist(E21, S_HIT);
const AZ0 = Math.atan2(DIR0[0], DIR0[2]), EL0 = Math.asin(DIR0[1]);
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
const azC = T => AZ0 - 22 * DEG * E.ss(22.6, 29.8, T);
const elC = T => E.mix(EL0, 36 * DEG, E.ss(21.6, 24.2, T));
const DCLOSE = 118;
function camC(T) {
  const g = .32 * E.ss(21.1, TB, T) + .68 * E.ss(TB, 23.9, T);
  const dist = K.logMix(D0, DCLOSE, g);
  const eye = V.add(S_HIT, V.mul(sph(azC(T), elC(T)), dist));
  const head = T < TB ? BOLT.at(E.sat((T - TBU - .08) / LEAD), P3) : S_LOOK;
  const target = T < TBU + .1 ? V.lerp(B_TOP, head, E.ss(TBU - .2, TBU + .1, T)) : V.lerp(head, S_LOOK, E.ss(TB - .5, TB + .6, T));
  return { eye, target, fov: (66 - 36 * E.ss(21.6, 23.9, T)) * DEG };
}
const PATH_E = FILM.path([
  { t: 33.3, eye: [-9.5, 24.5, 38.0], target: [0, 24.4, 26.2], fov: 44 },
  { t: 36.2, eye: [-13.4, 22.6, 31.2], target: [0, 22.4, 26.0], fov: 40 },
  { t: 39.2, eye: [-2.4, 22.3, 38.8], target: [0, 20.8, 26.3], fov: 34 },
  { t: DUR, eye: [12.8, 24.6, 37.4], target: [0, 20.5, 25.9], fov: 30 },
]);
const E0 = PATH_E(33.3), DIRE0 = V.norm(V.sub(E0.eye, U_W)), DE0 = V.dist(E0.eye, U_W), DIRHI = V.norm([-.3, .8, -.52]);
function camD(T) {
  const eS = V.add(S_HIT, V.mul(sph(azC(T), elC(T)), K.logMix(DCLOSE, 26000, E.ss(29.5, 31.5, T))));
  const dU = V.norm(V.lerp(DIRHI, DIRE0, E.ss(31.9, 33.3, T)));
  const eU = V.add(U_W, V.mul(dU, K.logMix(26000, DE0, E.ss(30.7, 33.3, T))));
  const eye = V.lerp(eS, eU, E.ss(30.3, 31.7, T));
  const target = V.lerp(S_LOOK, E0.target, E.ss(30.2, 31.9, T));
  return { eye, target, fov: (30 + 14 * E.ss(30.5, 33.3, T)) * DEG };
}
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  return spec ? spec.split(',').map(Number) : null;
})();
function camAt(T) {
  if (DBGCAM) return { eye: DBGCAM.slice(0, 3), target: DBGCAM.slice(3, 6), fov: (DBGCAM[6] || 40) * DEG };
  if (T < TF) { const s = PATH_A(T); return s; }
  if (T < TBU - .3) return camB(T);
  if (T < TBU + .4) return K.blendShot(camB(T), camC(T), E.ss(TBU - .3, TBU + .4, T));
  if (T < 29.5) return camC(T);
  if (T < 33.3) return camD(T);
  return PATH_E(T);
}

/* ---------- drawing ---------- */
const UO = { a: 1.45, fade: 160, lime: 0, tint: null, tk: 0, clip: null, px: 2.2, px0: 5 };
const CLIP = [0, 1, 0, 0];
function drawUnit(T, xf, st, chg) {
  const lock = (t0) => { const a = T - t0; return a > 0 && a < .5 ? Math.exp(-a * 7) : 0; };
  UO.clip = null; UO.lime = 0; UO.tk = 0;
  K.drawLod(CL.housing, xf.unit, UO);
  UO.lime = .7 * lock(4.25); K.drawLod(CL.lidR, xf.lidR, UO); K.drawLod(CL.lidL, xf.lidL, UO);
  const A0 = UO.a; UO.a = A0 * (.35 + .65 * Math.min(1, (st.lidR + st.lidL) * .7));
  // the lift sleeves: only what is above the housing floor
  UO.lime = .6 * lock(5.6);
  if (st.lift > .01) {
    CLIP[3] = -.5 * st.lift + .02; UO.clip = CLIP; K.drawLod(CL.slB, xf.slB, UO);
    CLIP[3] = -st.lift + .02; K.drawLod(CL.slC, xf.slC, UO);
    UO.clip = null; K.drawLod(CL.slA, xf.unit, UO);
  }
  K.drawLod(CL.carriage, xf.carriage, UO);
  UO.lime = Math.max(.6 * lock(7.8), .35 * chg); K.drawLod(CL.cradle, xf.cradle, UO);
  UO.lime = Math.max(.6 * lock(9.2), .35 * chg); K.drawLod(CL.st2, xf.st2, UO);
  UO.lime = Math.max(.6 * lock(9.8), .35 * chg); K.drawLod(CL.st3, xf.st3, UO);
  for (let k = 0; k < 5; k++) { UO.lime = Math.max(.8 * lock(10.35 + .36 * k), .55 * chg); K.drawLod(CL.coil, xf.coil[k], UO); }
  UO.lime = 0; UO.a = A0;
}
/* the charge: arcs crawling round each coil and jumping coil to coil, a lime charge dot running round the rims */
const CQ = [0, 0, 0], CR = [0, 0, 0];
function coilPt(k, a, r, out) { const p = X.ap(XF.coil[k], [Math.cos(a) * r, Math.sin(a) * r, 0]); out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; }
function drawCharge(T, q) {
  if (q < .01) return;
  const fr = Math.floor(T * 30), n = Math.floor(2 + 16 * q);
  for (let i = 0; i < n; i++) {
    const h1 = K.hh(i * 3.7, fr), h2 = K.hh(i * 5.3 + 1, fr), h3 = K.hh(i * 1.9 + 7, fr);
    const k = Math.floor(h1 * 5), a = h2 * TAU;
    if (h3 < .55) { coilPt(k, a, CR_ + .09, CQ); coilPt(k, a + .5 + 1.2 * h3, CR_ + .09, CR); K.arcW(CQ, CR, i + fr * .1, T, (.5 + .6 * q) * (.6 + .4 * h3), .45); }
    else if (k < 4) { coilPt(k, a, CR_, CQ); coilPt(k + 1, a + (h3 - .75) * 1.4, CR_, CR); K.arcW(CQ, CR, i * 7 + 3, T, .35 + .65 * q, .28); }
    else { coilPt(k, a, CR_ - .1, CQ); const p = X.ap(XF.st3, [.27 * (h3 > .8 ? 1 : -1), 0, 3.2]); K.arcW(CQ, p, i * 11, T, .4 + .5 * q, .35); }
  }
  // charge dots running round the rims, faster as it builds
  const sp = 2 + 26 * q * q;
  for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) {
    const a = T * sp * (k % 2 ? -1 : 1) + j * TAU / 3 + k;
    coilPt(k, a, CR_ + .1, CQ); K.dotW(CQ[0], CQ[1], CQ[2], 2, HOT, .9); K.glowW(CQ[0], CQ[1], CQ[2], 10, LIME, .12 + .25 * q);
  }
  // the breech glows
  const b = X.ap(XF.cradle, [0, 0, .5]);
  K.glowW(b[0], b[1], b[2], 30 + 60 * q, LIME, .05 + .12 * q);
}
function drawFire(T) {
  const a = T - TF; if (a < 0 || a > 3) return;
  const m = MZ0;
  // muzzle flash
  if (a < .6) { K.glowW(m[0], m[1] + 2, m[2], Math.round(40 + 260 * Math.exp(-a * 9)), HOT, .9 * Math.exp(-a * 6)); K.glowW(m[0], m[1] + 6, m[2], 90, LIME, .5 * Math.exp(-a * 5)); }
  // shock ring (horizontal) and shell
  if (a < 1.6) {
    const r = 2 + 320 * Math.pow(a, .62), A = Math.max(0, 1 - a / 1.6);
    K.ringW([m[0], m[1] - 1, m[2]], [1, 0, 0], [0, 0, 1], r, 720, 2, HOT, .85 * A, 0);
    K.ringW([m[0], m[1] - 1, m[2]], [1, 0, 0], [0, 0, 1], r * .93, 480, 1, LIME, .5 * A, .3);
    const rs = 1.5 + 200 * Math.pow(a, .6), As = .45 * Math.max(0, 1 - a / .9);
    if (As > .01) for (let i = 0; i < 700; i++) { const o = i * 3; K.dotW(m[0] + SHOCK[o] * rs, m[1] + SHOCK[o + 1] * rs * .7, m[2] + SHOCK[o + 2] * rs, 1, WH, As * (.5 + .5 * Math.abs(SHOCK[o + 1]))); }
    // the pressure ring on the water round the ship
    const rw = 30 + 520 * Math.pow(a, .7), Aw = .55 * Math.max(0, 1 - a / 1.6);
    K.ringW([0, .3, 26], [1, 0, 0], [0, 0, 1], rw, 900, 1, WH, Aw, .1);
  }
  // plume: hot gas and plasma dots rising and spreading
  for (let i = 0; i < 260; i++) {
    const o = i * 5, life = PLUME[o + 3]; if (a > life) continue;
    const w = 1 - a / life, s = 1 - Math.exp(-a * 4);
    const c = PLUME[o + 4] < .35 ? LIME : WH;
    K.dotW(m[0] + PLUME[o] * s * 1.6, m[1] + PLUME[o + 1] * s, m[2] + PLUME[o + 2] * s * 1.6, PLUME[o + 4] < .15 ? 2 : 1, c, w * .9);
  }
}
function drawProbe(T) {
  if (T < TF || T > 31.5) return;
  const s = climbS(T), vis = 1 - E.ss(27, 31, T);
  // the trail: every sample the probe has passed, fading and drifting with age
  for (let i = 0; i < TRN; i++) {
    const o = i * 4, sp = TRAIL[o + 1]; if (sp > s) break;
    const age = s - sp + (T > TBU ? T - TBU : 0), y = TRAIL[o], k = y / HB;
    const drift = 3 + 18 * Math.sqrt(age) * (.3 + k), ang = TRAIL[o + 2];
    const b = (.2 + .75 * Math.exp(-age / 2.2)) * vis;
    const x = MZ0[0] + 140 * k * k + Math.cos(ang) * drift * TRAIL[o + 3], z = MZ0[2] + 60 * k * k + Math.sin(ang) * drift * TRAIL[o + 3];
    const c = age < 1.2 ? HOT : WH;
    K.dotW(x, MZ0[1] + y, z, age < 3 ? 2 : 1, c, b);
    if (age < 4 && (i & 3) === 0) K.glowW(x, MZ0[1] + y, z, 9, LIME, .1 * b * (1 - age / 4));
    if (age < 2.5) K.dotW(x - Math.sin(ang) * drift * .6, MZ0[1] + y, z + Math.cos(ang) * drift * .6, 1, LIME, b * .6);
  }
  if (T < TBU) {
    const p = probeAt(s, P3), v = vOf(s), rate = climbRate(T), len = Math.min(3000, v * rate / 60 * 1.5);
    K.lineW(p[0], p[1] - len, p[2], p[0], p[1], p[2], 1.2, 2, HOT, .9, LIME, .08, .02);
    K.dotW(p[0], p[1], p[2], 3, [255, 255, 255], 1);
    K.glowW(p[0], p[1], p[2], 26, LIME, .45);
  }
}
function drawBurst(T) {
  const a = T - TBU; if (a < 0 || a > 2.4) return;
  const p = B_TOP, r = 520 * (1 - Math.exp(-a * 2.6)), A = Math.max(0, 1 - a / 2.4);
  if (a < .5) K.glowW(p[0], p[1], p[2], Math.round(60 + 240 * Math.exp(-a * 6)), HOT, .9 * Math.exp(-a * 4));
  K.glowW(p[0], p[1], p[2], 120, LIME, .25 * A);
  for (let i = 0; i < 520; i++) { const o = i * 4, rr = r * BURST[o + 3]; K.dotW(p[0] + BURST[o] * rr, p[1] + BURST[o + 1] * rr - 40 * a * a, p[2] + BURST[o + 2] * rr, i % 5 ? 1 : 2, i % 3 ? LIME : HOT, A * (.5 + .5 * BURST[o + 3])); }
}
function drawSea(T) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const S = SEA.F, TL = SEA.TL, ph = T * TAU / 6, sw = T * TAU / 10.5;
  for (let t = 0; t < SEA.nt; t++) {
    const q = t * 6; if (!K.wIn(TL[q + 2], 0, TL[q + 4], TL[q + 5] + 2)) continue;
    const zt = K.WZ[0], dsp = 400 / Math.sqrt(TL[q + 1] - TL[q]) * F / Math.max(1, zt);
    const step = dsp >= 2.3 ? 1 : Math.min(40, Math.round(2.3 * 2.3 / (dsp * dsp)));
    const rf = 1 - E.ss(16000, 29000, Math.hypot(TL[q + 2], TL[q + 4]));
    for (let k = TL[q] + ((t * 5) % step), k1 = TL[q + 1]; k < k1; k += step) {
      const j = k * 4, x = S[j], z = S[j + 1], y = .2 * Math.sin(S[j + 3] + ph) + .45 * Math.sin(sw + z * .011 + x * .004);
      const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 2) continue;
      const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= 1920) continue;
      const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= 1080) continue;
      const b = S[j + 2] * (zc < 3000 ? 1 - zc / 6000 : .5 + .6 * E.ss(3000, 12000, zc)) * rf * (step > 1 ? 1.3 : 1);
      K.dot(sx, sy, zc < 50 ? 2 : 1, 236, 238, 232, b);
    }
  }
}

/* ---------- tags and readout ---------- */
const UT = [
  ['HATCH', 'Hatches ×2', 'open', [0, 1.6, 1.2], 4.3, 6.4, 'unit'],
  ['LIFT', 'Mast lift', '1.5 m', [1.0, .95, PVZ], 5.6, 7.6, 'carriage'],
  ['RAIL', 'Rails · 3 stages', '8.1 m', [.3, 0, 7.6], 9.8, 11.9, 'st3', 'st'],
  ['COIL', 'Coils ×5', 'locked', [.6, 0, 0], 12.0, 14.2, 'coil2', 'st'],
].map(([id, lab, val, at, t0, t1, fr]) => ({ id, lab, val, at, t0, t1, fr, tg: K.mkTag() }));
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
function readout(T) {
  const ci = CHAPTERS.reduce((a, c, i) => c.t <= T ? i : a, 0);
  const kt = `0${ci + 1} · ${CHAPTERS[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2, rate = 1;
  const st = ST;
  if (T < 3 || T > 40.3) { l1 = 'DDG-51 · <b>on station</b>'; l2 = 'Scan mast <b>stowed</b>'; }
  else if (T < 11.5) {
    l1 = 'Scan mast · <b>deploying</b>';
    l2 = T < 4.4 ? 'Hatches <b>opening</b>' : T < 5.7 ? `Lift <b>${st.lift.toFixed(2)} m</b>` : T < 8 ? `Elevation <b>${Math.round(st.el / DEG)}°</b>` : T < 9.9 ? `Rails <b>${(3.4 + st.e2 + st.e3).toFixed(1)} m</b>` : `Coils <b>${st.coil.filter(c => c > .98).length}/5</b>`;
  } else if (T < TF) { l1 = 'Coils · <b>charging</b>'; l2 = `Charge <b>${Math.round(100 * E.ss(11.6, 15.3, T))} %</b>`; }
  else if (T < TBU) { const s = climbS(T); rate = climbRate(T); l1 = `Probe · <b>alt ${km(yOf(s))} km</b>`; l2 = `<b>${Math.round(vOf(s))} m/s</b> · climbing`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(HB)} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - TBU - .08) / LEAD))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 31.2) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else { l1 = 'Scan mast · <b>stowing</b>'; l2 = T < 34 ? `Coils <b>folding</b>` : T < 35.8 ? `Rails <b>${(3.4 + st.e2 + st.e3).toFixed(1)} m</b>` : T < 37.8 ? `Elevation <b>${Math.round(st.el / DEG)}°</b>` : 'Hatches <b>closing</b>'; }
  const sim = T < TF ? T - TF : T < TBU ? climbS(T) : S1 + (T - TBU);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(T > 38 ? T - DUR - TF : sim)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}
function unitTags(T) {
  for (const t of UT) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const fr = t.fr === 'coil2' ? XF.coil[2] : XF[t.fr];
    const p = X.ap(fr, t.at); if (!K.pj(p[0], p[1], p[2])) continue;
    const x = K.PJ[0], y = K.PJ[1];
    K.leader(x, y, x + 46, y - 46, '#C6F432', .8 * a);
    for (let yy = 0; yy < 3; yy++) K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .6), T, t.id.length), t.val, 'lime sm', x + 50, y - 60, a);
  }
}

/* own ship marked when too small to read (the game's own-unit mark) */
const SHIP_MN = [-10, -6, -78], SHIP_MX = [10, 40, 72], T_SHIP = K.mkTag();
function shipMark(T, Ws) {
  const b = K.boxOf(SHIP_MN, SHIP_MX, Ws, 3); if (!b) return;
  const px = Math.max(b[2] - b[0], b[3] - b[1]); if (px > 160 || b[2] < 0 || b[0] > 1920 || b[3] < 0 || b[1] > 1080) return;
  const a = 1 - E.ss(90, 160, px);
  K.bracket(b, '#C6F432', .85 * a, 6, 1.2);
  K.setTag(T_SHIP, 'DDG', 'ARLEIGH BURKE', '', 'lime sm', b[2] + 8, b[1] - 4, a);
}
/* ---------- render ---------- */
const SHIP_O = { a: .62, fade: 500, size: .45 };
const L_SHIP = [.55, .62, .5], L_SITE = [-.55, .6, -.6];
let NP = 0;
function render(T) {
  K.beginTags();
  const st = stateAt(T), Ws = shipW(T);
  unitXf(Ws, st);
  FILM.apply(C, camAt(T));
  const af = T - TF, tb = T - TB;
  C.shake = af > 0 && af < 1 ? FILM.shake(T, 7 * (1 - af), 24) : tb > 0 && tb < .8 ? FILM.shake(T, 3 * (1 - tb / .8), 22) : [0, 0];
  C.near = .1; C.update();
  K.pb.clear();
  // the sky and the world
  K.drawStars(STARS, .9, T, -.02);
  SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null);
  drawSea(T);
  K.setLight(L_SHIP);
  for (const p of SHIP) K.drawLod(p.ml, Ws, SHIP_O);
  const chg = E.ss(11.6, 15.3, T) * (1 - E.ss(TF, TF + .25, T));
  drawUnit(T, XF, st, chg);
  K.setLight(L_SITE);
  SITE.drawVehicles(T > TB - 1 ? tb : null);
  drawCharge(T, chg);
  drawFire(T); drawProbe(T); drawBurst(T);
  if (T > TBU) SITE.drawBolt(BOLT, tb, LEAD);
  // overlay
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (af > 0 && af < .4) fl = .09 * Math.exp(-af * 10);
  if (tb > 0 && tb < .7) fl = Math.max(fl, .1 * Math.min(1, K.Bolt.stroke(tb)));
  if (T > TBU && T < TBU + .3) fl = Math.max(fl, .08 * Math.exp(-(T - TBU) * 12));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < 30.5) SITE.overlay(T, tb, 1 - E.ss(29.2, 30.2, T));
  unitTags(T);
  shipMark(T, Ws);
  readout(T);
  K.pb.blit();
  K.endTags();
  NP = K.npts();
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
const cues = [
  [3.0, () => SFX.noise(1.2, 700, .8, .03, .2)], [4.25, clunk], [4.3, () => SFX.tone(90, 140, 1.3, 'sawtooth', .012)], [5.6, clunk],
  [5.7, () => SFX.tone(110, 90, 2.1, 'sawtooth', .012)], [7.8, clunk], [8.0, () => SFX.noise(1.8, 1400, .6, .02, .3)], [9.2, clunk], [9.8, clunk],
  ...[0, 1, 2, 3, 4].map(k => [10.35 + .36 * k, () => SFX.tone(1650, 1650, .05, 'square', .012)]),
  [11.6, () => SFX.tone(160, 1200, 3.8, 'sawtooth', .014)], [12.5, () => SFX.noise(3, 4000, .5, .015, 2.4)],
  [TF, () => { SFX.crack(); SFX.rumble(3, .26); }],
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(4, .16); }],
  [TB + .5, () => SFX.tone(1650, 1650, .05, 'square', .012)], [TB + 1.2, () => SFX.tone(1650, 1650, .05, 'square', .012)],
  [32.2, () => SFX.tone(1400, 900, .3, 'square', .01)], [33.9, clunk], [35.8, () => SFX.tone(90, 110, 2, 'sawtooth', .012)], [37.8, clunk], [38.9, () => SFX.noise(1.2, 700, .8, .03, .2)], [40.2, clunk],
];
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ log: LOG, np: NP, mz: MZ0, range: RANGE, site: SITE.hitW, e21: E21 });
})();
