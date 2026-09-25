/* SCAN · RAILGUN (Point Cloud): the game's SCAN with a source. An Arleigh Burke on station at night, a railgun
   mount in the Mk 45's seat on the foredeck. The mount wakes (vent hatches, muzzle covers, it trains and
   elevates, the muzzle sleeve runs out, the rail covers fold); a slice opens the hull under it and shows the
   power room: four pulsed alternators (end bells float off and back, rotors spin up), four capacitor racks
   charging module by module, switchgear, bus bars carrying the charge up the power column into the mount, the
   coolant loop out to the heat exchangers. The rails charge (rings, arcs, a particle ring at the muzzle); it
   fires a probe toward the coast (x2.8 shown), the probe bursts over the headland and the lime lightning
   forks down onto a coastal battery, which the scan identifies part by part. The lens flies home as the mount
   stows. One take, 58 s, loops. Render is a pure function of film time T. */
(() => {
const { V, R, X, E, rng } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = SK; K.setup();
const P_ = RGP, XS = P_.XS;
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = [];
const PROF = STAGE.Q.has('prof') ? {} : null;
let pt0 = 0;
const pf = k => { if (!PROF) return; const t = performance.now(); PROF[k] = (PROF[k] || 0) + t - pt0; pt0 = t; };
const t0load = performance.now();

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 58;
const TF = 30.5, FLY = 4.2, TBU = TF + FLY, LEAD = 1.0, TB = TBU + .08 + LEAD;   // fire, burst, the return stroke
const T_BANK = 19.8, T_BANK1 = 23.2, T_RAIL = 25.4;                               // racks charge, rails charge
const TRET0 = 42.6, TRET1 = 50;                                                   // the lens leaves the site, reaches the ship
const CHAPTERS = [
  { t: 0, title: 'Station' }, { t: 4, title: 'Mount' }, { t: 12.6, title: 'Power' }, { t: T_RAIL, title: 'Charge' },
  { t: TF, title: 'Fire' }, { t: TBU, title: 'Strike' }, { t: TB + .4, title: 'Scan' }, { t: 46, title: 'Stow' },
];
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));

/* ---------- the world: the ship on station, the coast 17 km to the north-north-east ---------- */
const S_POS = [7200, 0, 15600], PSI = Math.atan2(S_POS[0], S_POS[2]);
const SITE = K.makeSite({ xf: X.make(R.y(PSI), S_POS), seaR: 3100, landR: 14000 });
const S_HIT = SITE.hitW, S_LOOK = X.ap(SITE.XF, [5, 21, 15]);
const RANGE = Math.hypot(S_HIT[0], S_HIT[2]);
LOG.push(`site ${(performance.now() - t0load).toFixed(0)} ms`);
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

/* ---------- the destroyer (the Mk 45 left out: the railgun takes its seat) and the mount ---------- */
const SHIP = K.lodModel(HD.destroyer(), {}, [.12, .24, .48, .96, 1.92], 101, 1.4, ['gun']);
LOG.push(`ship ${(performance.now() - t0load).toFixed(0)} ms`);
const CL = P_.build();
LOG.push(`unit ${(performance.now() - t0load).toFixed(0)} ms (parts ${CL.ms.toFixed(0)})`);
/* gentle motion on station, loop-exact (whole periods in 58 s) */
function shipW(T) {
  const roll = .5 * DEG * Math.sin(TAU * T / 11.6), pitch = .2 * DEG * Math.sin(TAU * T / 7.25 + 1.1), heave = .12 * Math.sin(TAU * T / 5.8);
  return X.make(R.mul(R.x(pitch), R.z(roll)), [0, heave, 0]);
}

/* ---------- the mount's and the room's state in film time ---------- */
const AZ = PSI, EL = 50 * DEG, HAT = 105 * DEG, COV = 125 * DEG, PET = 115 * DEG;
const ROTW = FILM.warp([{ t: 0, rate: 0 }, { t: 15.6, rate: 0 }, { t: 19.4, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: 44, rate: 0 }, { t: DUR, rate: 0 }]);
const RPM = 9600, VIS_REV = 2.4;
const NMOD = P_.MOD.length;
const modT = k => T_BANK + (T_BANK1 - T_BANK) * k / NMOD;
const ST = { hatch: 0, petal: 0, yaw: 0, el: 0, ext: 0, covS: 0, covP: 0, bell: 0, rec: 0, rot: 0, rate: 0, chg: 0, glow: 0 };
function stateAt(T) {
  ST.hatch = kk(T, 4.3, 5.5) * (1 - kk(T, 55.2, 56.5));
  ST.petal = kk(T, 5.0, 5.9) * (1 - kk(T, 54.3, 55.2));
  ST.yaw = AZ * kk(T, 5.8, 9.0) * (1 - kk(T, 51.4, 54.2));
  ST.el = EL * kk(T, 6.6, 9.4) * (1 - kk(T, 51.2, 53.9));
  ST.ext = P_.EXT * kk(T, 9.4, 10.9) * (1 - kk(T, 49.8, 51.2));
  ST.covS = kk(T, 10.8, 11.9) * (1 - kk(T, 48.4, 49.4));
  ST.covP = kk(T, 11.1, 12.2) * (1 - kk(T, 48.7, 49.7));
  ST.bell = kk(T, 14.4, 15.5) * (1 - kk(T, 16.9, 17.9));
  const a = T - TF;
  ST.rec = a > 0 && a < 1.6 ? .55 * (a < .015 ? a / .015 : Math.exp(-(a - .015) * 4.2)) : 0;
  ST.rot = ROTW(T) * VIS_REV * TAU; ST.rate = ROTW.rate(T);
  ST.chg = E.ss(T_RAIL, TF - .3, T) * (T < TF ? 1 : 0);
  ST.glow = a > 0 ? Math.exp(-a * 1.2) : 0;                 // the rails after the shot
  return ST;
}
const nCharged = T => { let n = 0; for (let k = 0; k < NMOD; k++) if (modLvl(k, T) > .98) n++; return n; };
const modLvl = (k, T) => E.ss(modT(k), modT(k) + .3, T) * (1 - E.ss(TF, TF + .12, T));
/* the X-ray window over the power room */
function xrayAt(T) {
  if (T < 12.8 || T > 34.6) { XS.zo = 99; XS.zs = 99; return false; }
  XS.zo = 57.6 - 17.2 * kk(T, 12.8, 14.5); XS.ko = 1 - E.ss(14.3, 15.2, T);
  XS.zs = T < 33.4 ? 99 : 57.6 - 17.2 * kk(T, 33.4, 34.6); XS.ks = 1 - E.ss(34.4, 34.6, T);
  return true;
}
const isOpen = z => XS.zo < 90 && z > XS.zo && z < XS.zs && z > XS.box[4] && z < XS.box[5];

/* ---------- transforms ---------- */
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const pivZ = (a, h) => { const Rm = R.z(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const pivX = (a, h) => { const Rm = R.x(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const M_S = tr(P_.M0[0], P_.M0[1], P_.M0[2]);                                 // M -> ship
const MOD_L = P_.MOD.map(m => X.make(m.s > 0 ? R.I() : R.y(PI), m.p));         // module -> ship
const ALT_L = P_.ALT.map(c => tr(c[0], c[1], c[2]));
const XF = { W: null, M: null, T: null, B: null, E: null };
function mountXf(Ws, st) {
  XF.W = Ws;
  XF.M = X.mul(Ws, M_S);
  XF.T = X.mul(XF.M, X.make(R.y(st.yaw), [0, 0, 0]));
  XF.B = X.mul(XF.T, X.make(R.x(-st.el), P_.TRN));
  if (st.rec) XF.B = X.mul(XF.B, tr(0, 0, -st.rec));
  XF.E = X.mul(XF.B, tr(0, 0, st.ext));
  XF.covS = X.mul(XF.B, pivZ(COV * st.covS, P_.COVER_HINGE(1)));
  XF.covP = X.mul(XF.B, pivZ(-COV * st.covP, P_.COVER_HINGE(-1)));
  XF.petT = X.mul(XF.E, pivX(-PET * st.petal, P_.PETAL_HINGE(1)));
  XF.petB = X.mul(XF.E, pivX(PET * st.petal, P_.PETAL_HINGE(-1)));
  XF.hatS = X.mul(XF.M, pivZ(-HAT * st.hatch, P_.HATCH_HINGE(1)));
  XF.hatP = X.mul(XF.M, pivZ(HAT * st.hatch, P_.HATCH_HINGE(-1)));
  return XF;
}
/* write a transformed point into out (no allocation) */
function apI(Tw, x, y, z, out) {
  const M = Tw.R, t = Tw.T;
  out[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; out[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; out[2] = M[6] * x + M[7] * y + M[8] * z + t[2];
  return out;
}
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0], Q4 = [0, 0, 0];

/* ---------- the probe's flight: a smooth arc out of the muzzle to a burst over the headland ---------- */
const MZ0 = (() => { const st = Object.assign({}, stateAt(TF - .01), { rec: 0 }); mountXf(shipW(TF), st); return X.ap(XF.E, P_.MZ_E); })();
const DIR0 = (() => X.dir(XF.E, [0, 0, 1]))();
const HB = 8000, DH = 9500;
const HDIR = V.norm([DIR0[0], 0, DIR0[2]]);
const B_TOP = V.add(V.mad(MZ0, HDIR, DH), [0, HB, 0]);
const B_C = V.mad(MZ0, DIR0, HB / Math.sin(EL));
const bez = (u, out) => { const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; for (let k = 0; k < 3; k++) out[k] = a * MZ0[k] + b * B_C[k] + c * B_TOP[k]; return out; };
const ARC = (() => { const n = 400, L = new Float64Array(n + 1), p = [0, 0, 0], q = [0, 0, 0]; bez(0, p); for (let i = 1; i <= n; i++) { bez(i / n, q); L[i] = L[i - 1] + V.dist(p, q); p[0] = q[0]; p[1] = q[1]; p[2] = q[2]; } return { L, n, len: L[n] }; })();
const uOfD = d => { const L = ARC.L; let lo = 0, hi = ARC.n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < d) lo = m; else hi = m; } return (lo + (d - L[lo]) / Math.max(1e-6, L[hi] - L[lo])) / ARC.n; };
const V0 = 2300, V1 = 900, S1 = 2 * ARC.len / (V0 + V1);                     // muzzle 2 300 m/s, 900 m/s at the burst
const dOfS = s => V0 * s - (V0 - V1) / (2 * S1) * s * s;
const vOfS = s => V0 - (V0 - V1) * s / S1;
const WARP = FILM.warp([{ t: 0, rate: 1 }, { t: .35, rate: 1 }, { t: 1.4, rate: 3 }, { t: 3.2, rate: 3 }, { t: FLY, rate: 1.6 }]);
const WS = S1 / WARP.total;
const climbS = T => T <= TF ? 0 : T >= TBU ? S1 : WARP(T - TF) * WS;
const climbRate = T => T <= TF || T >= TBU ? 1 : WARP.rate(T - TF) * WS;
const probeAt = (s, out) => bez(uOfD(dOfS(s)), out);
const TRN_N = 700, TRAIL = (() => {                                       // u, sim time passed, angle, spread, distance
  const A = new Float32Array(TRN_N * 5), r = rng(3131), a2 = (V0 - V1) / (2 * S1);
  for (let i = 0; i < TRN_N; i++) {
    const d = ARC.len * Math.pow((i + .5) / TRN_N, 1.4);
    A[i * 5] = uOfD(d); A[i * 5 + 1] = (V0 - Math.sqrt(Math.max(0, V0 * V0 - 4 * a2 * d))) / (2 * a2);
    A[i * 5 + 2] = r() * TAU; A[i * 5 + 3] = r(); A[i * 5 + 4] = d;
  }
  return A;
})();
const BOLT = new K.Bolt({ top: B_TOP, hit: S_HIT, seed: 1402, depth: 9, nb: 14, rough: .55, spark: 26 });
const BURST = (() => { const r = rng(515), A = new Float32Array(520 * 4); for (let i = 0; i < 520; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h; A[i * 4 + 1] = u; A[i * 4 + 2] = Math.sin(a) * h; A[i * 4 + 3] = .5 + .5 * r(); } return A; })();
const SHOCK = (() => { const r = rng(616), A = new Float32Array(600 * 3); for (let i = 0; i < 600; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(a) * h; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(a) * h; } return A; })();
const PLUME = (() => { const r = rng(717), A = new Float32Array(320 * 5); for (let i = 0; i < 320; i++) { const a = r() * TAU, s = r(); A[i * 5] = Math.cos(a) * s; A[i * 5 + 1] = Math.sin(a) * s; A[i * 5 + 2] = 2 + 34 * r() * r(); A[i * 5 + 3] = .3 + 1.3 * r(); A[i * 5 + 4] = r(); } return A; })();
const VAPOR = (() => { const r = rng(818), A = new Float32Array(90 * 5); for (let i = 0; i < 90; i++) { A[i * 5] = (r() - .5) * 1.1; A[i * 5 + 1] = (r() - .5) * 2.2; A[i * 5 + 2] = r(); A[i * 5 + 3] = .4 + .6 * r(); A[i * 5 + 4] = r() * TAU; } return A; })();
const SWIRL = (() => { const r = rng(919), A = new Float32Array(200 * 4); for (let i = 0; i < 200; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r(); A[i * 4 + 2] = (r() - .5); A[i * 4 + 3] = .6 + .8 * r(); } return A; })();
const P3 = [0, 0, 0];

/* ---------- camera ---------- */
const PATH_A = FILM.path([
  { t: -8, eye: [150, 55, 190], target: [0, 9, 26], fov: 32 },
  { t: -4, eye: [64, 22, 110], target: [0, 10, 44], fov: 32 },
  { t: 0, eye: [40, 15.5, 88], target: [0, 10.5, 47], fov: 34 },
  { t: 3.8, eye: [33, 13.5, 82], target: [0, 11, 49], fov: 36 },
  { t: 7.4, eye: [28, 12.5, 80], target: [0, 12, 50], fov: 38 },
  { t: 11, eye: [27, 15, 70], target: [1, 12.5, 51], fov: 38 },
  { t: 14, eye: [34, 12, 56], target: [0, 5, 49], fov: 36 },
  { t: 17.2, eye: [15, 13, 49.5], target: [0, 2.6, 44.2], fov: 40 },
  { t: 20.6, eye: [17, 13.5, 59], target: [0, 3.4, 50.5], fov: 40 },
  { t: 23.6, eye: [24, 12.5, 58.5], target: [0, 5.8, 49], fov: 38 },
  { t: 26.6, eye: [29, 15, 66], target: [2, 12.8, 52.5], fov: 38 },
  { t: 29.2, eye: [31, 14.5, 72], target: [2.8, 14.2, 54], fov: 38 },
  { t: TF, eye: [32, 14.5, 74], target: [3, 14.8, 54.6], fov: 40 },
]);
const A_END = PATH_A(TF);
/* after the shot: the lens backs off square to the line of fire, farther as the probe climbs, keeping the ship low
   in frame and the arc across it (the Scale shot) */
const MW = [0, P_.GY + 2.4, P_.GZ], SIDE = (() => { const q = [HDIR[2], 0, -HDIR[0]], r = V.sub(A_END.eye, MW); return V.dot(q, r) > 0 ? q : V.mul(q, -1); })();
const PB = [0, 0, 0], EB = [0, 0, 0];
function camB(T) {
  probeAt(climbS(T), PB);
  const h = PB[1] - MW[1], x = (PB[0] - MW[0]) * HDIR[0] + (PB[2] - MW[2]) * HDIR[2];
  const off = 70 + 1.05 * Math.hypot(h, x);
  for (let k = 0; k < 3; k++) EB[k] = MW[k] + SIDE[k] * off + HDIR[k] * .42 * x - HDIR[k] * 30;
  EB[1] = MW[1] + 22 + .36 * h;
  const w = E.ss(TF + .4, TF + 3.6, T), eye = V.lerp(A_END.eye, EB, w);
  const tgt = V.lerp(MW, PB, .5 * E.ss(TF + .6, TF + 3, T) + .08 * E.ss(TBU - 1.4, TBU - .2, T));
  tgt[1] += .12 * h * E.ss(TF + .6, TF + 3, T);
  return { eye, target: V.lerp(A_END.target, tgt, E.ss(TF + .1, TF + 1.8, T)), fov: (40 + 18 * E.ss(TF + .4, TF + 3.6, T)) * DEG };
}
const E21 = camB(TBU).eye;
const DIRS = V.norm(V.sub(E21, S_HIT)), D0 = V.dist(E21, S_HIT);
const AZ0 = Math.atan2(DIRS[0], DIRS[2]), EL0 = Math.asin(DIRS[1]);
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
const azC = T => AZ0 - 22 * DEG * E.ss(TB, TB + 7, T);
const elC = T => E.mix(EL0, 36 * DEG, E.ss(TBU + .6, TB + 2.3, T));
const DCLOSE = 118;
function camC(T) {
  const g = .32 * E.ss(TBU + .1, TB, T) + .68 * E.ss(TB, TB + 2.1, T);
  const eye = V.add(S_HIT, V.mul(sph(azC(T), elC(T)), K.logMix(D0, DCLOSE, g)));
  const head = T < TB ? BOLT.at(E.sat((T - TBU - .08) / LEAD), P3) : S_LOOK;
  const target = T < TBU + .1 ? V.lerp(B_TOP, head, E.ss(TBU - .2, TBU + .1, T)) : V.lerp(head, S_LOOK, E.ss(TB - .5, TB + .6, T));
  return { eye, target, fov: (66 - 36 * E.ss(TBU + .6, TB + 2.1, T)) * DEG };
}
/* the way home: swing round the battery and climb, arc high over the water between them, drop onto the ship */
const E0 = PATH_A(-8);
const TR1 = TRET0 + 3.0;
const orbitEye = T => { const u = E.ss(TRET0, TR1, T); return V.add(S_HIT, V.mul(sph(azC(T) - 40 * DEG * u, E.mix(36 * DEG, 52 * DEG, u)), K.logMix(DCLOSE, 1400, u))); };
const P1 = orbitEye(TR1), HM = [(P1[0] + E0.eye[0]) / 2, 1500, (P1[2] + E0.eye[2]) / 2], BZ = [0, 0, 0];
/* the arc P1 -> HM -> E0.eye, walked at a pace that slows near both ends (log of the distance to the end it nears) */
function homeEye(T) {
  const u = E.ss(TR1, TRET1, T), w = u < .5 ? .5 * Math.pow(2 * u, 1.6) : 1 - .5 * Math.pow(2 - 2 * u, 2.4), a = (1 - w) * (1 - w), b = 2 * w * (1 - w), c = w * w;
  for (let k = 0; k < 3; k++) BZ[k] = a * P1[k] + b * HM[k] + c * E0.eye[k];
  return BZ;
}
function camD(T) {
  if (T < TR1) return { eye: orbitEye(T), target: S_LOOK, fov: (30 + 4 * E.ss(TRET0, TR1, T)) * DEG };
  const eye = homeEye(T).slice(), v = E.ss(TR1, TR1 + 1.6, T);
  const d = V.norm(V.lerp(V.norm(V.sub(S_LOOK, eye)), V.norm(V.sub(E0.target, eye)), v));
  return { eye, target: V.mad(eye, d, V.dist(eye, E0.target)), fov: (34 - 2 * E.ss(TR1, TRET1, T)) * DEG };
}
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  return spec ? spec.split(',').map(Number) : null;
})();
function camAt(T) {
  if (DBGCAM) return { eye: DBGCAM.slice(0, 3), target: DBGCAM.slice(3, 6), fov: (DBGCAM[6] || 40) * DEG };
  if (T < TF) { const s = PATH_A(T), d = FILM.drift(T, .1 * E.ss(12, 14, T) * (1 - E.ss(24, 26, T)), 3); s.eye = V.add(s.eye, d); return s; }
  if (T < TBU - .3) return camB(T);
  if (T < TBU + .4) return K.blendShot(camB(T), camC(T), E.ss(TBU - .3, TBU + .4, T));
  if (T < TRET0) return camC(T);
  if (T < TRET1) return camD(T);
  return PATH_A(T - DUR);
}

/* ---------- drawing: ship, mount, room ---------- */
const SO = { a: .7, fade: 600, size: .5, md: 1, cut: null, px: 5.6 };
const SOP = { a: .7, fade: 600, size: .6, md: 1, px: 7 };
const MO = { a: 1.3, fade: 260, lime: 0, md: 0, size: 1, keep: 1, px: 6.2 };
const RO = { a: 1, fade: 220, lime: 0, md: 3, S: null, size: .8, px: 6.4 };
const lock = (T, t0) => { const a = T - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
function drawShip(Ws) { for (const p of SHIP) { SO.cut = p.name === 'hull' ? P_.CUT : null; P_.drawX(p.ml, Ws, SO); } P_.drawX(CL.hullP, Ws, SOP); }
function drawMount(T, st) {
  const X_ = P_.drawX, gl = st.glow;
  MO.lime = 0; MO.a = 1.3; MO.md = 0; MO.S = null; MO.zfix = undefined;
  X_(CL.baseAbove, XF.M, MO);
  MO.lime = .6 * lock(T, 5.5) + .4 * lock(T, 56.5); X_(CL.hatchS, XF.hatS, MO); X_(CL.hatchP, XF.hatP, MO);
  MO.lime = 0; MO.md = 3; MO.S = M_S; X_(CL.exS, XF.M, MO); X_(CL.exP, XF.M, MO); MO.md = 0; MO.S = null;
  MO.lime = .55 * lock(T, 9.0) + .5 * lock(T, 9.4); X_(CL.turret, XF.T, MO);
  MO.lime = Math.max(.6 * lock(T, 9.4), .18 * st.chg, .5 * gl); X_(CL.rear, XF.B, MO);
  MO.lime = Math.max(.7 * lock(T, 10.9), .35 * st.chg, .6 * gl); X_(CL.sleeve, XF.E, MO);
  MO.lime = Math.max(.7 * lock(T, 11.9), .15 * st.chg); X_(CL.coverS, XF.covS, MO);
  MO.lime = Math.max(.7 * lock(T, 12.2), .15 * st.chg); X_(CL.coverP, XF.covP, MO);
  MO.lime = .7 * lock(T, 5.9); X_(CL.petalT, XF.petT, MO); X_(CL.petalB, XF.petB, MO);
  MO.lime = Math.min(1, .9 * st.chg + gl); MO.a = 1.3 + .5 * st.chg;
  X_(CL.railsR, XF.B, MO); X_(CL.railsE, XF.E, MO);
  MO.lime = 0; MO.a = 1.3;
}
function drawRoom(T, st, Ws) {
  const X_ = P_.drawX;
  RO.md = 3; RO.S = null; RO.lime = 0; RO.a = .85;
  X_(CL.floor, Ws, RO); X_(CL.racks, Ws, RO); X_(CL.sw, Ws, RO); X_(CL.pump, Ws, RO); X_(CL.cool, Ws, RO);
  RO.lime = .45 * E.ss(T_BANK - .6, T_BANK, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.bus, Ws, RO);
  RO.S = M_S; RO.zfix = P_.GZ; RO.lime = .3 * E.ss(T_BANK1 - .4, T_BANK1 + .6, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.baseBelow, XF.M, RO); RO.zfix = undefined;
  // alternators: stator, end bells floating off and back, rotors
  const off = 1.05 * st.bell;
  for (let k = 0; k < 4; k++) {
    const L = ALT_L[k];
    RO.lime = .5 * lock(T, 17.9); RO.S = L; X_(CL.stator, X.mul(Ws, L), RO);
    const Lf = X.mul(L, tr(0, 0, off)), La = X.mul(L, tr(0, 0, -off));
    RO.lime = Math.max(.35 * st.bell, .5 * lock(T, 17.9));
    RO.S = Lf; X_(CL.bellF, X.mul(Ws, Lf), RO); RO.S = La; X_(CL.bellA, X.mul(Ws, La), RO);
    const Lr = X.mul(L, X.make(R.z(st.rot * (k % 2 ? -1 : 1) + k), [0, 0, 0]));
    RO.lime = .2 * Math.min(1, st.rate); RO.S = Lr; X_(CL.rotor, X.mul(Ws, Lr), RO);
  }
  // capacitor modules
  // a rack at rest (all its modules dark, or all charged) is one cloud; the rack that is charging goes module by module
  for (let r = 0; r < 4; r++) {
    const k0 = r * 20, busy = T > modT(k0) - .35 && T < modT(k0 + 19) + .4 && T < TF;
    if (!busy) { const l = modLvl(k0, T); RO.S = null; RO.lime = .85 * l; RO.a = .5 + .8 * l; X_(CL.rackMods[r], Ws, RO); continue; }
    for (let k = k0; k < k0 + 20; k++) {
      const l = modLvl(k, T), sl = Math.sin(PI * E.ss(modT(k) - .3, modT(k) + .35, T)), L = sl > .001 ? X.mul(MOD_L[k], tr(-.34 * sl, 0, 0)) : MOD_L[k];
      RO.S = L; RO.lime = .85 * l; RO.a = .5 + .8 * l; X_(CL.module, X.mul(Ws, L), RO);
    }
  }
  RO.S = null; RO.lime = 0; RO.a = .85;
}
/* rotor rims: lime streaks that lengthen with speed */
function drawRotorFX(T, st, Ws) {
  if (st.rate < .02) return;
  const len = Math.min(2.6, .25 + 2.4 * st.rate), n = 14;
  for (let k = 0; k < 4; k++) {
    const c = P_.ALT[k]; if (!isOpen(c[2])) continue;
    const L = X.mul(Ws, ALT_L[k]), sg = k % 2 ? -1 : 1;
    for (let m = 0; m < 3; m++) {
      const a0 = st.rot * sg + k + m * TAU / 3;
      for (let j = 0; j < n; j++) {
        const a = a0 - sg * len * j / n, w = 1 - j / n;
        for (const z of [-.83, .83]) { apI(L, Math.cos(a) * .86, Math.sin(a) * .86, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], j ? 1 : 2, j ? LIME : HOT, (.35 + .6 * st.rate) * w * w); }
      }
    }
    if (st.rate > .5) { apI(L, 0, 0, .9, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 40, LIME, .06 * st.rate); }
  }
}
/* charge pulses crawling along a bus (ship-frame polyline): a front runs from t0, then a stream */
function busPulses(pl, T, t0, t1, speed, gap, I, Ws, needOpen) {
  const A = I * E.ss(t0, t0 + .3, T) * (1 - E.ss(t1 - .6, t1, T)); if (A < .01) return;
  const front = (T - t0) * speed * 1.6, off = ((T - t0) * speed) % gap;
  for (let s = off; s < pl.L && s < front; s += gap) {
    P_.polyAt(pl, s, Q2); if (needOpen && !isOpen(Q2[2])) continue;
    apI(Ws, Q2[0], Q2[1], Q2[2], Q1);
    const head = front < pl.L && s > front - gap * 1.5;
    K.dotW(Q1[0], Q1[1], Q1[2], 2, HOT, A * (head ? 1 : .8));
    K.glowW(Q1[0], Q1[1], Q1[2], head ? 14 : 8, LIME, (head ? .5 : .3) * A);
  }
}
const COL = P_.poly([[0, 6.35, P_.GZ], [0, P_.GY + .35, P_.GZ]]);
const COOL_UP = [P_.poly([[.64, 1.5, P_.GZ], [.64, P_.GY - .55, P_.GZ], [3.6, P_.GY - .55, P_.GZ]]), P_.poly([[-3.6, P_.GY - .55, P_.GZ], [-.64, P_.GY - .55, P_.GZ], [-.64, 1.5, P_.GZ]])];
function coolFlow(T, Ws) {
  const A = .5 * E.ss(14.6, 15.6, T) * (1 - E.ss(33, 34, T)); if (A < .01) return;
  for (const pl of P_.COOL.concat(COOL_UP)) {
    const off = (T * 1.1) % .34;
    for (let s = off; s < pl.L; s += .34) {
      P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue;
      apI(Ws, Q2[0], Q2[1] + .1, Q2[2], Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, WH, A);
    }
  }
}
function drawRoomFX(T, st, Ws) {
  drawRotorFX(T, st, Ws);
  coolFlow(T, Ws);
  // alternators -> switchgear, switchgear -> racks, racks -> column, up the column
  for (let k = 0; k < 4; k++) busPulses(P_.BUS_A[k], T, T_BANK - .8 + .15 * k, TF + .2, 3.2, .7, .9, Ws, true);
  for (let r = 0; r < 4; r++) busPulses(P_.BUS_B[r], T, T_BANK - .3 + .5 * r, T_BANK1 + .6, 3.0, .6, .85, Ws, true);
  for (let r = 0; r < 4; r++) busPulses(P_.BUS_C[r], T, T_BANK1 - .5 + .2 * r, TF + .1, 2.2, .5, 1, Ws, true);
  busPulses(COL, T, T_BANK1 + .3, TF + .1, 2.4, .35, 1, Ws, true);
  // module terminals as they charge
  for (let k = 0; k < NMOD; k++) {
    const l = modLvl(k, T); if (l < .02) continue;
    const m = P_.MOD[k]; if (!isOpen(m.p[2])) continue;
    const sl = Math.sin(PI * E.ss(modT(k) - .3, modT(k) + .35, T));
    apI(Ws, m.p[0] - m.s * (.68 + .34 * sl), m.p[1] + .24, m.p[2], Q1);
    const fl = lock(T, modT(k) + .1);
    K.dotW(Q1[0], Q1[1], Q1[2], 2, LIME, .5 + .5 * l); if (fl > .05) K.glowW(Q1[0], Q1[1], Q1[2], 18, LIME, .5 * fl);
  }
}
/* the flexible bus trunk from the breech down to the turret floor (drawn every frame: the barrel elevates) */
function trunk(T, st) {
  const I = E.ss(T_BANK1 + .9, T_BANK1 + 1.5, T) * (1 - E.ss(TF, TF + .3, T));
  const vis = .22 + .5 * I;
  const n = 34;
  for (let c = -1; c <= 1; c++) {
    apI(XF.B, c * .16, -.9, -2.15, Q1); apI(XF.B, c * .16, -1.8, -2.0, Q2);
    apI(XF.T, c * .16, 1.3, -.2, Q3); apI(XF.T, c * .16, .32, 0, Q4);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = (1 - u) * (1 - u) * (1 - u), b = 3 * u * (1 - u) * (1 - u), d = 3 * u * u * (1 - u), e = u * u * u;
      const x = a * Q1[0] + b * Q2[0] + d * Q3[0] + e * Q4[0], y = a * Q1[1] + b * Q2[1] + d * Q3[1] + e * Q4[1], z = a * Q1[2] + b * Q2[2] + d * Q3[2] + e * Q4[2];
      const pulse = I > .01 ? Math.max(0, Math.cos((u * 6 + T * 5) * TAU * .5)) : 0;
      K.dotW(x, y, z, 1, pulse > .85 ? HOT : WH, vis * .7);
      if (pulse > .85) K.glowW(x, y, z, 8, LIME, .35 * I);
    }
  }
}
/* the rails charging: the rails light, rings run breech -> muzzle, arcs across the bore and out to the rings,
   the particle ring ahead of the muzzle tightens */
function drawCharge(T, st) {
  const q = st.chg; if (q < .01) return;
  const U = X.dir(XF.B, [1, 0, 0]), W = X.dir(XF.B, [0, 1, 0]);
  const z0 = P_.RZ0, z1 = P_.SLV1 + st.ext, Lz = z1 - z0;
  // the rails, lit end to end, with charge running along them
  for (const y of [.18, -.18]) {
    apI(XF.B, 0, y, z0, Q1); apI(XF.B, 0, y, z1, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, LIME, .25 + .6 * q, LIME, .05 + .06 * q, .015);
  }
  const sp = 3 + 16 * q;
  for (let s = ((T - T_RAIL) * sp) % .5; s < Lz; s += .5) for (const y of [.18, -.18]) {
    apI(XF.B, 0, y, z0 + s, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 2, HOT, .5 + .5 * q);
  }
  // rings
  const nR = 5, rs = .22 + 1.1 * q;
  for (let k = 0; k < nR; k++) {
    const f = ((T - T_RAIL) * rs + k / nR) % 1, z = z0 + .4 + f * (Lz - .2);
    apI(XF.B, 0, 0, z, Q1);
    const a = Math.min(1, (.25 + .9 * q) * Math.sin(PI * f) * 1.3), r = 1.55 - .45 * q + .25 * f;
    K.ringW(Q1, U, W, r, 150, 2, LIME, a * .85, T * 3 + k);
    K.ringW(Q1, U, W, r * .93, 90, 1, HOT, a * .6, -T * 2 + k);
    if (a > .3) { const fr = Math.floor(T * 30), h = K.hh(k * 7.7, fr), an = h * TAU; apI(XF.B, 0, h < .5 ? .18 : -.18, z, Q2); Q3[0] = Q1[0] + (U[0] * Math.cos(an) + W[0] * Math.sin(an)) * r; Q3[1] = Q1[1] + (U[1] * Math.cos(an) + W[1] * Math.sin(an)) * r; Q3[2] = Q1[2] + (U[2] * Math.cos(an) + W[2] * Math.sin(an)) * r; K.arcW(Q2, Q3, k * 13 + fr * .1, T, a, .35); }
  }
  // the cage bands flash breech -> muzzle, faster as it nears full
  if (q > .5) {
    const per = .9 - .55 * q, ph = ((T - T_RAIL) / per) % 1;
    for (let z = -1.55, i = 0; z <= z1; z += .675, i++) {
      const f = (z - z0) / Lz, d = ph - f; if (d < 0 || d > .25) continue;
      const a = (1 - d / .25) * (q - .5) * 2;
      apI(XF.B, 0, 0, z + .05, Q1); K.ringW(Q1, U, W, .78, 40, 2, HOT, a, 0);
    }
  }
  // arcs across the bore in the gaps between the cage bands, and at the muzzle
  const fr = Math.floor(T * 30), n = Math.floor(2 + 10 * q);
  for (let i = 0; i < n; i++) {
    const h1 = K.hh(i * 3.7, fr), h2 = K.hh(i * 5.3 + 1, fr), z = z0 + .3 + h1 * (Lz - .6), x = (h2 - .5) * .5;
    apI(XF.B, x, .16, z, Q2); apI(XF.B, -x, -.16, z + (h2 - .5) * .5, Q3);
    K.arcW(Q2, Q3, i + fr * .1, T, .6 + .5 * q, .7);
  }
  if (q > .2) for (let i = 0; i < 4; i++) {
    const h = K.hh(i * 9.1 + 4, fr), a = h * TAU, rr0 = .9 + 1.4 * K.hh(i * 2.3, fr);
    apI(XF.E, 0, .18 * (i % 2 ? 1 : -1), P_.SLV1, Q2); apI(XF.E, Math.cos(a) * rr0, Math.sin(a) * rr0, P_.SLV1 + .3 + .8 * h, Q3);
    K.arcW(Q2, Q3, 40 + i + fr * .1, T, q, .45);
  }
  // particle ring swirling ahead of the muzzle, tightening as the charge builds
  const rr = 3.4 - 2.1 * q;
  for (let i = 0; i < 200; i++) {
    const o = i * 4, a = SWIRL[o] + T * (1 + 3.5 * q) * SWIRL[o + 3], r = rr * (.85 + .3 * SWIRL[o + 1]);
    apI(XF.E, Math.cos(a) * r, Math.sin(a) * r, P_.SLV1 + 1.2 + SWIRL[o + 2] * 1.4 * (1 - q * .7), Q1);
    K.dotW(Q1[0], Q1[1], Q1[2], i % 5 ? 1 : 2, i % 3 ? LIME : HOT, Math.min(1, q * 1.3) * (.4 + .5 * SWIRL[o + 1]));
  }
  apI(XF.E, 0, 0, P_.SLV1 + .2, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 40 + 110 * q * q, LIME, .1 + .25 * q * q);
}
/* vapour off the heat exchangers once the hatches are open and the loop is running */
function drawVapor(T, st) {
  const A = st.hatch * E.ss(15, 17, T) * (1 - E.ss(44, 47, T)) * .35; if (A < .01) return;
  for (const s of [-1, 1]) for (let i = 0; i < 90; i++) {
    const o = i * 5, life = 2.2 * VAPOR[o + 3], age = ((T / life) + VAPOR[o + 2]) % 1;
    const y = .1 + age * 2.6, sw = .25 * age * Math.sin(VAPOR[o + 4] + T * .7);
    apI(XF.M, s * (4.2 + VAPOR[o] + sw), y, VAPOR[o + 1], Q1);
    K.dotW(Q1[0], Q1[1], Q1[2], 1, WH, A * (1 - age) * Math.min(1, age * 6));
  }
}
function drawFire(T) {
  const a = T - TF; if (a < 0 || a > 3.2) return;
  const m = MZ0, d = DIR0, U = V.norm(V.cross(d, [0, 1, 0])), W = V.cross(U, d);
  if (a < .5) {
    const L = 30 + 900 * a, jA = Math.exp(-a * 7);
    K.lineW(m[0], m[1], m[2], m[0] + d[0] * L, m[1] + d[1] * L, m[2] + d[2] * L, 1.2, 2, HOT, jA, LIME, .12 * jA, .04 * jA);
    for (let k = 1; k <= 4; k++) { const c = V.mad(m, d, 4 * k + 30 * a * k); K.ringW(c, U, W, (.8 + .5 * k) * (1 + 4 * a), 90, 1, k % 2 ? LIME : HOT, jA * (1 - k * .18), k); }
  }
  if (a < .6) { K.glowW(m[0], m[1], m[2], Math.round(40 + 300 * Math.exp(-a * 9)), HOT, .95 * Math.exp(-a * 6)); K.glowW(m[0] + d[0] * 6, m[1] + d[1] * 6, m[2] + d[2] * 6, 120, LIME, .5 * Math.exp(-a * 5)); }
  if (a < 1.8) {
    // the shock ring round the bore line, and the spherical shock
    const r = 1 + 60 * Math.pow(a, .6), A = Math.max(0, 1 - a / 1.8);
    const c = V.mad(m, d, 2 + 10 * a);
    K.ringW(c, U, W, r, 520, 2, HOT, .85 * A, 0); K.ringW(c, U, W, r * .9, 360, 1, LIME, .55 * A, .3);
    const rs = 1 + 90 * Math.pow(a, .6), As = .4 * Math.max(0, 1 - a / 1.1);
    if (As > .01) for (let i = 0; i < 600; i++) { const o = i * 3; K.dotW(m[0] + SHOCK[o] * rs, m[1] + SHOCK[o + 1] * rs, m[2] + SHOCK[o + 2] * rs, 1, WH, As * (.4 + .6 * Math.abs(SHOCK[o + 1]))); }
    // the pressure ring on the water and the blast over the foredeck
    const rw = 12 + 260 * Math.pow(a, .7), Aw = .55 * Math.max(0, 1 - a / 1.8);
    K.ringW([0, .3, 48], [1, 0, 0], [0, 0, 1], rw, 900, 1, WH, Aw, .1);
    const rd = 3.5 + 14 * Math.pow(a, .5), Ad = .6 * Math.max(0, 1 - a / 1.2);
    K.ringW([0, P_.GY + .3, P_.GZ], [1, 0, 0], [0, 0, 1], rd, 260, 1, WH, Ad, .5);
  }
  // plasma and gas out of the muzzle, spreading along the line of fire
  for (let i = 0; i < 320; i++) {
    const o = i * 5, life = PLUME[o + 3]; if (a > life) continue;
    const w = 1 - a / life, s = 1 - Math.exp(-a * 4), ax = PLUME[o + 2] * s, sp = (1.5 + 5 * s) * (1 + ax * .08);
    const x = m[0] + d[0] * ax + (U[0] * PLUME[o] + W[0] * PLUME[o + 1]) * sp, y = m[1] + d[1] * ax + (U[1] * PLUME[o] + W[1] * PLUME[o + 1]) * sp + a * a * .8, z = m[2] + d[2] * ax + (U[2] * PLUME[o] + W[2] * PLUME[o + 1]) * sp;
    K.dotW(x, y, z, PLUME[o + 4] < .15 ? 2 : 1, PLUME[o + 4] < .35 ? LIME : WH, w * .85);
  }
}
function drawProbe(T) {
  if (T < TF || T > TRET0 + 1) return;
  const s = climbS(T), vis = 1 - E.ss(TB + 4, TRET0 + 1, T), after = T > TBU ? T - TBU : 0;
  for (let i = 0; i < TRN_N; i++) {
    const o = i * 5, sp = TRAIL[o + 1]; if (sp > s) break;
    const age = s - sp + after, u = TRAIL[o], k = TRAIL[o + 4] / ARC.len;
    bez(u, Q1);
    const drift = 1 + 9 * Math.sqrt(age) * (.15 + k), ang = TRAIL[o + 2];
    const b = Math.min(1, (.3 + .9 * Math.exp(-age / 2.5)) * vis);
    const x = Q1[0] + Math.cos(ang) * drift * TRAIL[o + 3], y = Q1[1] + Math.sin(ang) * drift * TRAIL[o + 3] * .5, z = Q1[2] + Math.sin(ang) * drift * TRAIL[o + 3];
    K.dotW(x, y, z, age < 3 ? 2 : 1, age < 1.2 ? HOT : WH, b);
    if (age < 5 && (i & 1) === 0) K.glowW(x, y, z, 10, LIME, .14 * b * (1 - age / 5));
  }
  // the hot core of the trail: a thin continuous line over the young part of the arc
  const uP = uOfD(dOfS(s));
  if (vis > .01) {
    bez(0, Q3);
    for (let i = 1; i <= 90; i++) {
      const u = uP * i / 90; bez(u, Q2);
      const ageL = after + (1 - i / 90) * Math.min(s, 3);
      const a = vis * Math.max(.3, Math.exp(-ageL / 1.6)) * .7;
      K.lineW(Q3[0], Q3[1], Q3[2], Q2[0], Q2[1], Q2[2], 1.4, 1, ageL < 1 ? HOT : WH, a, LIME, .1 * a, .03 * a);
      Q3[0] = Q2[0]; Q3[1] = Q2[1]; Q3[2] = Q2[2];
    }
  }
  if (T < TBU) {
    const p = probeAt(s, P3), u = uP, q = bez(Math.max(0, u - .004 * climbRate(T)), Q2);
    K.lineW(q[0], q[1], q[2], p[0], p[1], p[2], 1.2, 2, HOT, .9, LIME, .08, .02);
    K.dotW(p[0], p[1], p[2], 3, [255, 255, 255], 1);
    K.glowW(p[0], p[1], p[2], 26, LIME, .45);
  }
}
function drawBurst(T) {
  const a = T - TBU; if (a < 0 || a > 2.4) return;
  const p = B_TOP, r = 420 * (1 - Math.exp(-a * 2.6)), A = Math.max(0, 1 - a / 2.4);
  if (a < .5) K.glowW(p[0], p[1], p[2], Math.round(60 + 240 * Math.exp(-a * 6)), HOT, .9 * Math.exp(-a * 4));
  K.glowW(p[0], p[1], p[2], 120, LIME, .25 * A);
  for (let i = 0; i < 520; i++) { const o = i * 4, rr = r * BURST[o + 3]; K.dotW(p[0] + BURST[o] * rr, p[1] + BURST[o + 1] * rr - 40 * a * a, p[2] + BURST[o + 2] * rr, i % 5 ? 1 : 2, i % 3 ? LIME : HOT, A * (.5 + .5 * BURST[o + 3])); }
}
function drawSea(T) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const S = SEA.F, TL = SEA.TL, ph = T * TAU / 5.8, sw = T * TAU / 11.6;
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
  ['MNT', 'Railgun mount', st => '', 'T', [0, 2.9, -1.6], 5.6, 8.8],
  ['VNT', 'Heat exchangers ×2', st => '', 'M', [4.2, .3, 1.1], 6.0, 8.8],
  ['RAIL', 'Rails', st => `${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m`, 'E', [.6, .66, 4.4], 9.8, 12.4],
  ['CVR', 'Rail covers ×2', st => '', 'covS', [.6, .7, 1.4], 11.6, 13.0],
  ['ALT', 'Pulsed alternators ×4', st => `${Math.round(RPM * st.rate / 10) * 10} rpm`, 'W', [3.2, 4.0, 45.6], 14.9, 19.4],
  ['BELL', 'End bells · rotor', st => '', 'W', [-2.1, 1.3, 47.3], 15.0, 17.4],
  ['COOL', 'Coolant loop', st => '', 'W', [.34, 1.6, 51.5], 17.0, 19.3],
  ['CAP', 'Capacitor racks ×4', st => `${(1.2 * nCharged(ST_T)).toFixed(1)} MJ`, 'W', [2.95, 5.95, 49.0], 19.7, 23.4],
  ['SW', 'Switchgear', st => '', 'W', [-1.35, 4.7, 54.5], 20.3, 23.0],
  ['BUS', 'Bus bars · power column', st => '', 'W', [0, 6.8, 48.6], 22.9, 25.6],
  ['MZL', 'Muzzle', st => `${Math.round(100 * st.chg)} %`, 'E', [.7, .8, P_.SLV1], 26.6, 30.3],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
let ST_T = 0;
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
function readout(T, st) {
  const ci = CHAPTERS.reduce((a, c, i) => c.t <= T ? i : a, 0);
  const kt = `0${ci + 1} · ${CHAPTERS[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2, rate = 1;
  if (T < 4.2 || T > 56.6) { l1 = 'DDG-51 · <b>on station</b>'; l2 = 'Railgun <b>stowed</b>'; }
  else if (T < 12.6) {
    l1 = 'Railgun · <b>deploying</b>';
    l2 = T < 5.8 ? 'Hatches <b>opening</b>' : T < 9.4 ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : T < 10.9 ? `Rails <b>${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m</b>` : 'Covers <b>open</b>';
  } else if (T < T_BANK - .2) { l1 = 'Power · <b>pulsed alternators</b>'; l2 = `Rotors <b>${Math.round(RPM * st.rate / 10) * 10} rpm</b>`; }
  else if (T < T_RAIL) { const n = nCharged(T); l1 = 'Capacitor racks · <b>charging</b>'; l2 = `Bank <b>${(1.2 * n).toFixed(1)} MJ</b> · ${n}/${NMOD}`; }
  else if (T < TF) { l1 = 'Rails · <b>charging</b>'; l2 = `Charge <b>${Math.round(100 * st.chg)} %</b> · 32 MJ`; }
  else if (T < TBU) { const s = climbS(T); rate = climbRate(T); probeAt(s, Q4); l1 = `Probe · <b>alt ${km(Q4[1])} km</b>`; l2 = `<b>${Math.round(vOfS(s))} m/s</b> · range <b>${km(Math.hypot(Q4[0], Q4[2]))} km</b>`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - TBU - .08) / LEAD))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 46) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else { l1 = 'Railgun · <b>stowing</b>'; l2 = T < 49.8 ? 'Covers <b>closing</b>' : T < 51.3 ? `Rails <b>${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m</b>` : T < 54.3 ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : 'Hatches <b>closing</b>'; }
  const sim = T < TF ? T - TF : T < TBU ? climbS(T) : S1 + (T - TBU);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(T > 46 ? T - DUR - TF : sim)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}
function unitTags(T, st) {
  ST_T = T;
  for (const t of UT) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const fr = t.fr === 'W' ? XF.W : XF[t.fr];
    const p = X.ap(fr, t.at); if (!K.pj(p[0], p[1], p[2])) continue;
    const x = K.PJ[0], y = K.PJ[1];
    K.leader(x, y, x + 46, y - 46, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .6), T, t.id.length), t.val(st), 'lime sm', x + 50, y - 60, a);
  }
}
/* own ship marked when too small to read */
const SHIP_MN = [-10, -6, -78], SHIP_MX = [10, 40, 72], T_SHIP = K.mkTag();
function shipMark(T, Ws) {
  const b = K.boxOf(SHIP_MN, SHIP_MX, Ws, 3); if (!b) return;
  const px = Math.max(b[2] - b[0], b[3] - b[1]); if (px > 160 || b[2] < 0 || b[0] > 1920 || b[3] < 0 || b[1] > 1080) return;
  const a = 1 - E.ss(90, 160, px);
  K.bracket(b, '#C6F432', .85 * a, 6, 1.2);
  K.setTag(T_SHIP, 'DDG', 'ARLEIGH BURKE', '', 'lime sm', b[2] + 8, b[1] - 4, a);
}

/* ---------- render ---------- */
const L_SHIP = [.55, .62, .5], L_SITE = [-.55, .6, -.6];
let NP = 0;
function render(T) {
  K.beginTags();
  const st = stateAt(T), Ws = shipW(T);
  mountXf(Ws, st);
  const xr = xrayAt(T);
  FILM.apply(C, camAt(T));
  const af = T - TF, tb = T - TB;
  C.shake = af > 0 && af < 1 ? FILM.shake(T, 9 * (1 - af), 24) : tb > 0 && tb < .8 ? FILM.shake(T, 3 * (1 - tb / .8), 22) : [0, 0];
  C.near = .1; C.update();
  if (PROF) pt0 = performance.now();
  K.pb.clear(); pf('clear');
  K.drawStars(STARS, .9, T, -.02);
  const siteOn = T > TF + 1 && T < TRET1 + 1;
  if (siteOn) SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null);
  pf('ground');
  drawSea(T); pf('sea');
  K.setLight(L_SHIP);
  drawShip(Ws); pf('ship');
  drawMount(T, st); pf('mount');
  if (xr) { drawRoom(T, st, Ws); pf('room'); drawRoomFX(T, st, Ws); pf('roomfx'); }
  trunk(T, st);
  drawVapor(T, st);
  if (siteOn) { K.setLight(L_SITE); SITE.drawVehicles(T > TB - 1 ? tb : null); }
  drawCharge(T, st);
  drawFire(T); drawProbe(T); drawBurst(T);
  if (T > TBU && siteOn) SITE.drawBolt(BOLT, tb, LEAD);
  pf('fx');
  // overlay
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (af > 0 && af < .4) fl = .1 * Math.exp(-af * 10);
  if (tb > 0 && tb < .7) fl = Math.max(fl, .1 * Math.min(1, K.Bolt.stroke(tb)));
  if (T > TBU && T < TBU + .3) fl = Math.max(fl, .08 * Math.exp(-(T - TBU) * 12));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < TR1) SITE.overlay(T, tb, 1 - E.ss(TR1 - 1.4, TR1 - .4, T));
  unitTags(T, st);
  shipMark(T, Ws);
  readout(T, st);
  pf('overlay');
  K.pb.blit();
  K.endTags(); pf('blit');
  NP = K.npts() + P_.np();
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
const tick = () => SFX.tone(1650, 1650, .04, 'square', .008);
const whirr = (f0, f1, d) => () => { SFX.tone(f0, f1, d, 'sawtooth', .011); SFX.noise(d, 900, .7, .012, .3); };
const cues = [
  [4.3, () => SFX.noise(1.2, 700, .8, .03, .2)], [5.5, clunk], [5.0, () => SFX.tone(300, 180, .3, 'square', .01)], [5.9, clunk],
  [5.8, whirr(90, 150, 3.2)], [6.6, whirr(110, 85, 2.8)], [9.4, clunk], [9.4, () => SFX.noise(1.6, 1400, .6, .02, .3)], [10.9, clunk],
  [10.8, () => SFX.tone(260, 170, .5, 'square', .008)], [11.9, clunk], [11.1, () => SFX.tone(250, 160, .5, 'square', .008)], [12.2, clunk],
  [12.8, () => SFX.tone(900, 2600, .9, 'sine', .012)], [14.4, clunk], [17.9, clunk],
  [15.6, () => { SFX.tone(55, 420, 4.2, 'sawtooth', .016); SFX.tone(110, 840, 4.2, 'triangle', .012); }],
  [19.6, () => { SFX.tone(420, 436, 5.6, 'sawtooth', .007); SFX.tone(840, 872, 5.6, 'triangle', .006); }],
  [25.0, () => { SFX.tone(436, 450, 5.8, 'sawtooth', .007); SFX.tone(872, 900, 5.8, 'triangle', .006); }],
  ...Array.from({ length: 10 }, (_, k) => [modT(k * 8) + .1, tick]),
  [T_BANK1 - .3, () => SFX.noise(3.4, 320, 2, .02, .6)],
  [T_RAIL, () => SFX.tone(200, 2600, 5.0, 'sawtooth', .012)], [T_RAIL + 1, () => SFX.noise(4, 5000, .5, .016, 3)],
  [TF, () => { SFX.crack(); SFX.rumble(3, .3); SFX.tone(900, 60, 1.2, 'sawtooth', .02); }],
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(4, .16); }],
  [TB + .5, tick], [TB + 1.2, tick],
  [48.4, () => SFX.tone(260, 170, .5, 'square', .008)], [49.4, clunk], [49.8, () => SFX.noise(1.4, 1400, .6, .02, .3)], [51.2, clunk],
  [51.3, whirr(150, 90, 3.0)], [54.3, () => SFX.tone(300, 180, .3, 'square', .01)], [55.2, () => SFX.noise(1.2, 700, .8, .03, .2)], [56.5, clunk],
];
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ camAt, prof: PROF, log: LOG, np: NP, mz: MZ0, dir: DIR0, btop: B_TOP, s1: S1, arc: ARC.len, range: RANGE, e21: E21 });
})();
