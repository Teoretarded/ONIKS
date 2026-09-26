/* SCAN · RAILGUN (Point Cloud): the game's SCAN with a source. An Arleigh Burke on station at night, a railgun
   mount in the Mk 45's seat on the foredeck. The mount wakes (vent hatches on rams, muzzle petals, it trains and
   elevates, the muzzle sleeve runs out on its screw and locks, the rail covers fold up on rams); a slice opens the
   hull under it and shows the power room: the coolant pumps and fans start and the valves open, one of the four
   pulsed alternators comes apart on its guide rods (exciter end bell, then the rotor) and closes again, the rotors
   spin up, the breakers close and the capacitor racks charge module by module while the cabinets count; then the
   loader: the magazine drum indexes, the hoist lifts a round into the tray, the breech block drops, the tray swings
   into line and the rammer seats the round, the block closes and the rail clamps lock breech to muzzle. The rails
   charge; it fires a probe toward the coast (x2.8 shown), the probe bursts over the headland and the lime lightning
   forks down onto a coastal battery, which the scan identifies part by part. The lens climbs away over the coast,
   back along the trail to the ship, as the mount stows. One take, 60 s, loops. Render is a pure function of T. */
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
const DUR = 60;
const T_BANK = 19.8, T_BANK1 = 23.2;                                  // racks charge
const T_LD = 23.9, T_RAIL = T_LD + 3.3, TF = 32.0;                    // loader, rails charge, fire
const LD = t => T_LD + t;
const FLY = 4.2, TBU = TF + FLY, LEAD = 1.0, TB = TBU + .08 + LEAD;  // burst, the return stroke
const TRET0 = 44.3, TRET1 = 52.4;                                       // the lens leaves the site, reaches the ship
const SH = 2.6;                                                       // the stow runs this much later than in the 58 s cut
const CHAPTERS = [
  { t: 0, title: 'Station' }, { t: 4, title: 'Mount' }, { t: 12.6, title: 'Power' }, { t: T_LD, title: 'Load' }, { t: T_RAIL, title: 'Charge' },
  { t: TF, title: 'Fire' }, { t: TBU, title: 'Strike' }, { t: TB + .4, title: 'Scan' }, { t: 48.4 + SH - .6, title: 'Stow' },
];
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const pulse = (T, a, b) => kk(T, a, b);

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
LOG.push(`unit ${(performance.now() - t0load).toFixed(0)} ms (parts ${CL.ms.toFixed(0)}, ${(CL.n0 / 1e6).toFixed(2)} M fine pts)`);
/* gentle motion on station, loop-exact (whole periods in 60 s) */
function shipW(T) {
  const roll = .5 * DEG * Math.sin(TAU * T / 12), pitch = .2 * DEG * Math.sin(TAU * T / 7.5 + 1.1), heave = .12 * Math.sin(TAU * T / 6);
  return X.make(R.mul(R.x(pitch), R.z(roll)), [0, heave, 0]);
}

/* ---------- the mount's, the room's and the loader's state in film time ---------- */
const AZ = PSI, EL = P_.EL_LOAD, HAT = 105 * DEG, COV = 125 * DEG, PET = 115 * DEG;
const ROTW = FILM.warp([{ t: 0, rate: 0 }, { t: 15.6, rate: 0 }, { t: 19.4, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: 45, rate: 0 }, { t: DUR, rate: 0 }]);
const ROTX = FILM.warp([{ t: 0, rate: 0 }, { t: 18.5, rate: 0 }, { t: 20.6, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: 45, rate: 0 }, { t: DUR, rate: 0 }]);
const PUMPW = FILM.warp([{ t: 0, rate: 0 }, { t: 14.6, rate: 0 }, { t: 16.0, rate: 1 }, { t: TF + 3, rate: 1 }, { t: 46, rate: 0 }, { t: DUR, rate: 0 }]);
const FANW = FILM.warp([{ t: 0, rate: 0 }, { t: 14.9, rate: 0 }, { t: 16.6, rate: 1 }, { t: TF + 3, rate: 1 }, { t: 46, rate: 0 }, { t: DUR, rate: 0 }]);
const RPM = 9600, VIS_REV = 2.4;
const NMOD = P_.MOD.length;
const modT = k => T_BANK + .3 + (T_BANK1 - T_BANK - .3) * k / NMOD;
const modLvl = (k, T) => E.ss(modT(k), modT(k) + .3, T) * (1 - E.ss(TF, TF + .12, T));
const brkT = r => modT(r * 20) - .3;
const nCharged = T => { let n = 0; for (let k = 0; k < NMOD; k++) if (modLvl(k, T) > .98) n++; return n; };
const clampT = k => LD(2.6) + k * .055;
const ST = { hatch: 0, petal: 0, yaw: 0, el: 0, ext: 0, covS: 0, covP: 0, rec: 0, rot: 0, rate: 0, rotX: 0, rateX: 0, chg: 0, glow: 0,
  rod: 0, bell: 0, rtr: 0, pump: 0, pumpR: 0, fan: 0, fanR: 0, drum: 0, hoistY: 0, rnd: 0, tray: 0, brc: 0, ram: 0, gh: 0, jaw: new Float64Array(P_.BANDS.length), valve: 0 };
const HOIST_B = P_.RND_Y0 - P_.GY;                                    // the round's centre in the drum (T y)
function stateAt(T) {
  const s = ST;
  s.hatch = kk(T, 4.3, 5.5) * (1 - kk(T, 55.2 + SH + .3, 56.5 + SH + .3));
  s.petal = kk(T, 5.0, 5.9) * (1 - kk(T, 54.3 + SH + .3, 55.2 + SH + .3));
  s.yaw = AZ * kk(T, 5.8, 9.0) * (1 - kk(T, 51.4 + SH, 54.2 + SH));
  s.el = EL * kk(T, 6.6, 9.4) * (1 - kk(T, 51.2 + SH, 53.9 + SH));
  s.ext = P_.EXT * kk(T, 9.4, 10.9) * (1 - kk(T, 49.8 + SH, 51.2 + SH));
  s.covS = kk(T, 10.8, 11.9) * (1 - kk(T, 48.4 + SH, 49.4 + SH));
  s.covP = kk(T, 11.1, 12.2) * (1 - kk(T, 48.7 + SH, 49.7 + SH));
  // one alternator opens on its guide rods: rods out, exciter end bell off, the rotor drawn, and back
  s.rod = kk(T, 14.7, 15.2) * (1 - kk(T, 18.0, 18.4));
  s.bell = 1.2 * kk(T, 15.1, 15.9) * (1 - kk(T, 17.4, 18.1));
  s.rtr = .95 * kk(T, 15.7, 16.5) * (1 - kk(T, 16.9, 17.6));
  const a = T - TF;
  s.rec = a > 0 && a < 1.6 ? .55 * (a < .015 ? a / .015 : Math.exp(-(a - .015) * 4.2)) : 0;
  s.rot = ROTW(T) * VIS_REV * TAU; s.rate = ROTW.rate(T);
  s.rotX = ROTX(T) * VIS_REV * TAU; s.rateX = ROTX.rate(T);
  s.pump = PUMPW(T) * 4 * TAU; s.pumpR = PUMPW.rate(T);
  s.fan = FANW(T) * 3 * TAU; s.fanR = FANW.rate(T);
  s.valve = kk(T, 13.9, 15.2) * 1.5 * TAU;
  s.chg = E.ss(T_RAIL, TF - .3, T) * (T < TF ? 1 : 0);
  s.glow = a > 0 ? Math.exp(-a * 1.2) : 0;
  // the loader
  s.drum = kk(T, T_LD, T_LD + .5);                                      // one cell (30°)
  s.gh = kk(T, 20.4, 21.2) * (1 - kk(T, LD(3.1), LD(4.1)));           // the gunhouse ghosted
  s.tray = (90 * DEG - EL) * (kk(T, LD(.1), LD(.6)) * (1 - kk(T, LD(1.4), LD(1.85))));
  const up = kk(T, LD(.45), LD(1.35)), down = kk(T, LD(1.45), LD(2.3));
  s.hoistY = HOIST_B + (P_.HY1 - HOIST_B) * up * (1 - down);
  s.rnd = T < LD(.45) ? 0 : T < LD(1.35) ? 1 : T < TF ? 2 : 3;               // in the drum, on the hoist, in the tray / breech, fired
  s.ram = kk(T, LD(1.85), LD(2.2));
  s.brc = kk(T, LD(.8), LD(1.2)) * (1 - kk(T, LD(2.25), LD(2.6)));
  const un = kk(T, LD(.5), LD(.75));
  for (let k = 0; k < s.jaw.length; k++) s.jaw[k] = un * (1 - kk(T, clampT(k), clampT(k) + .12));
  return s;
}
/* the X-ray window over the power room */
const XSH = TF + 2.9;
function xrayAt(T) {
  if (T < 12.8 || T > XSH + 1.2) { XS.zo = 99; XS.zs = 99; return false; }
  XS.zo = 57.6 - 17.2 * kk(T, 12.8, 14.5); XS.ko = 1 - E.ss(14.3, 15.2, T);
  XS.zs = T < XSH ? 99 : 57.6 - 17.2 * kk(T, XSH, XSH + 1.2); XS.ks = 1 - E.ss(XSH + 1, XSH + 1.2, T);
  return true;
}
const isOpen = z => XS.zo < 90 && z > XS.zo && z < XS.zs && z > XS.box[4] && z < XS.box[5];
const allOpen = (z0, z1) => XS.zo < 90 && XS.zo < z0 && XS.zs > z1;

/* ---------- transforms ---------- */
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const pivZ = (a, h) => { const Rm = R.z(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const pivX = (a, h) => { const Rm = R.x(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const M_S = tr(P_.M0[0], P_.M0[1], P_.M0[2]);                                 // M -> ship
const MOD_L = P_.MOD.map(m => X.make(m.s > 0 ? R.I() : R.y(PI), m.p));         // module -> ship
const ALT_L = P_.ALT.map((c, k) => X.make(P_.ALT_FLIP[k] ? R.y(PI) : R.I(), c));
const ROT_UP = R.x(-PI / 2);                                                  // a round standing up
const XR = {}, XF = {};
function mountXf(Ws, st) {
  XF.W = Ws;
  XR.M = M_S;
  XR.T = X.mul(XR.M, X.make(R.y(st.yaw), [0, 0, 0]));
  XR.B = X.mul(XR.T, X.make(R.x(-st.el), P_.TRN));
  if (st.rec) XR.B = X.mul(XR.B, tr(0, 0, -st.rec));
  XR.E = X.mul(XR.B, tr(0, 0, st.ext));
  XR.tray = X.mul(XR.B, X.make(R.x(-st.tray), [0, 0, P_.TRAY_Z]));
  for (const k of ['M', 'T', 'B', 'E', 'tray']) XF[k] = X.mul(Ws, XR[k]);
  XF.covS = X.mul(XF.B, pivZ(COV * st.covS, P_.COVER_HINGE(1)));
  XF.covP = X.mul(XF.B, pivZ(-COV * st.covP, P_.COVER_HINGE(-1)));
  XF.petT = X.mul(XF.E, pivX(-PET * st.petal, P_.PETAL_HINGE(1)));
  XF.petB = X.mul(XF.E, pivX(PET * st.petal, P_.PETAL_HINGE(-1)));
  XF.hatS = X.mul(XF.M, pivZ(-HAT * st.hatch, P_.HATCH_HINGE(1)));
  XF.hatP = X.mul(XF.M, pivZ(HAT * st.hatch, P_.HATCH_HINGE(-1)));
  // the opened alternator's moving parts (A frame)
  const LA = ALT_L[P_.XALT];
  XR.xexc = X.mul(LA, tr(0, 0, st.bell)); XR.xrot = X.mul(LA, tr(0, 0, st.rtr));
  XF.XEXC = X.mul(Ws, XR.xexc); XF.XROT = X.mul(Ws, XR.xrot); XF.XA = X.mul(Ws, LA);
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
/* blend two look points by direction (a near point and a far one lerped by position swing the view all at once) */
function lookMix(eye, a, b, w) {
  const da = V.norm(V.sub(a, eye)), db = V.norm(V.sub(b, eye)), d = V.norm(V.lerp(da, db, w));
  return V.mad(eye, d, E.mix(V.dist(eye, a), V.dist(eye, b), w));
}

/* before the shot: close, held shots where each mechanism works (the lens drifts, it does not cut) */
const PATH_A = FILM.path([
  { t: -8, eye: [150, 55, 190], target: [0, 9, 26], fov: 32 },
  { t: -4, eye: [64, 22, 110], target: [0, 10, 44], fov: 32 },
  { t: 0, eye: [36, 14.5, 84], target: [0, 10, 48], fov: 32 },
  { t: 3.4, eye: [21, 11.2, 65], target: [1.5, 8.6, 49], fov: 34 },
  { t: 5.6, eye: [15, 10.2, 57.5], target: [2.6, 8.4, 49], fov: 38 },
  { t: 8.2, eye: [15.5, 12, 60.5], target: [1, 10, 50.5], fov: 40 },
  { t: 10.4, eye: [16.5, 14, 63.5], target: [1.4, 12.4, 52.4], fov: 42 },
  { t: 12.3, eye: [17.5, 12.8, 58.5], target: [1, 9.6, 51], fov: 42 },
  { t: 14.1, eye: [20, 11.5, 55], target: [.5, 4.8, 47.5], fov: 40 },
  { t: 15.7, eye: [8.6, 6.0, 49.2], target: [2.2, 2.7, 46.3], fov: 40 },
  { t: 17.5, eye: [8.9, 6.4, 48.2], target: [2.1, 2.7, 46.0], fov: 40 },
  { t: 19.5, eye: [12.8, 10.2, 40.8], target: [0, 3, 45], fov: 40 },
  { t: 20.3, eye: [5.4, 7.0, 46.6], target: [.3, 3.4, 52.6], fov: 42 },
  { t: 20.9, eye: [2.3, 6.8, 48.6], target: [0, 3.2, 54.5], fov: 43 },
  { t: 21.6, eye: [.95, 4.7, 50.4], target: [0, 3.0, 55.4], fov: 44 },
  { t: 22.4, eye: [.7, 4.5, 51.0], target: [0, 2.9, 55.4], fov: 44 },
  { t: 23.7, eye: [2.5, 6.9, 49.6], target: [-.2, 2.6, 48.0], fov: 42 },
  { t: LD(.4), eye: [3.2, 5.0, 45.4], target: [-.3, 2.6, 48.1], fov: 42 },
  { t: LD(1.0), eye: [2.9, 5.6, 45.6], target: [-.35, 5.2, 47.8], fov: 42 },
  { t: LD(1.8), eye: [3.0, 6.9, 45.4], target: [-.3, 7.3, 47.8], fov: 42 },
  { t: LD(2.8), eye: [7.5, 10.8, 45.4], target: [.3, 9.0, 49.0], fov: 40 },
  { t: LD(4.3), eye: [14, 13.5, 51.5], target: [1.5, 11.5, 51.5], fov: 40 },
  { t: TF - 2.1, eye: [24, 14.5, 62], target: [2, 12.8, 52.5], fov: 38 },
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
  return { eye, target: lookMix(eye, A_END.target, tgt, E.ss(TF + .05, TF + 2.4, T)), fov: (40 + 18 * E.ss(TF + .4, TF + 3.6, T)) * DEG };
}
const CB_END = camB(TBU - .3);
const E21 = camB(TBU).eye;
const DIRS = V.norm(V.sub(E21, S_HIT)), D0 = V.dist(E21, S_HIT);
const AZ0 = Math.atan2(DIRS[0], DIRS[2]), EL0 = Math.asin(DIRS[1]);
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
/* after the strike the lens circles the battery half way round (the scan identifies it on the way), so that it ends
   on the landward side looking out over it to the sea, the burst and the trail: the way home is straight ahead */
const azC = T => AZ0 - PI * E.ss(TB + 1.0, TRET0 + 1.6, T);
const elC = T => E.mix(E.mix(EL0, 36 * DEG, E.ss(TBU + .6, TB + 2.8, T)), 20 * DEG, E.ss(TRET0 - 3, TRET0 + 1.2, T));
const DCLOSE = 118;
/* the strike is framed whole (the burst over the headland and the ground under it), the view swings from the
   probe to the middle of the stroke before the burst, so the leader runs down a still frame; then the lens
   closes on the battery */
const MIDS = V.lerp(B_TOP, S_HIT, .5);
const TRAILMID = [0, 0, 0]; bez(.62, TRAILMID);
const E0 = PATH_A(TRET1 - DUR);
/* yaw / pitch blend of two look points (turns the short way round, never through a degenerate direction) */
function lookTurn(eye, a, b, w) {
  const da = V.sub(a, eye), db = V.sub(b, eye);
  const ya = Math.atan2(da[0], da[2]), pa = Math.atan2(da[1], Math.hypot(da[0], da[2]));
  let yb = Math.atan2(db[0], db[2]); const pb = Math.atan2(db[1], Math.hypot(db[0], db[2]));
  while (yb - ya > PI) yb -= TAU; while (yb - ya < -PI) yb += TAU;
  const y = ya + (yb - ya) * w, p = pa + (pb - pa) * w, L = E.mix(V.len(da), V.len(db), w);
  return [eye[0] + Math.cos(p) * Math.sin(y) * L, eye[1] + Math.sin(p) * L, eye[2] + Math.cos(p) * Math.cos(y) * L];
}
/* ahead: the ship, the view raised toward the burst while it is still far ahead */
const GA = [0, 0, 0];
function ahead(eye, T) {
  const dx = E0.eye[0] - eye[0], dz = E0.eye[2] - eye[2], h = Math.hypot(dx, dz) || 1, L = E.clamp(.25 * h, 260, 1800);
  GA[0] = eye[0] + dx / h * L; GA[1] = 0; GA[2] = eye[2] + dz / h * L;          // the ground (coast, then sea) ahead
  return lookTurn(eye, GA, E0.target, E.ss(TRET0 + 4.0, TRET1 - .8, T));
}
const seaLook = (eye, T) => lookTurn(eye, S_LOOK, ahead(eye, T), E.ss(TRET0 - 2.2, TRET0 + .6, T));
function camC(T) {
  const g = .32 * E.ss(TBU + .1, TB, T) + .68 * E.ss(TB + .1, TB + 2.8, T);
  const eye = V.add(S_HIT, V.mul(sph(azC(T), elC(T)), K.logMix(D0, DCLOSE, g)));
  const t1 = lookMix(eye, CB_END.target, MIDS, E.ss(TBU - 1.4, TBU + .8, T));
  const target = lookMix(eye, t1, seaLook(eye, T), E.ss(TB - .2, TB + 1.7, T));
  const fov = (58 + 12 * E.ss(TBU - 1.2, TBU + .6, T) - 40 * E.ss(TB - .2, TB + 1.8, T)) * DEG;
  return { eye, target, fov };
}
/* the way home: from the landward side of the battery, over it and the coast, along the trail to the ship */
const P1 = camC(TRET0).eye;
const HM = [(P1[0] + E0.eye[0]) / 2, 700, (P1[2] + E0.eye[2]) / 2], BZ = [0, 0, 0];
function homeEye(T) {
  const u = E.ss(TRET0, TRET1, T), w = u < .5 ? .5 * Math.pow(2 * u, 1.7) : 1 - .5 * Math.pow(2 - 2 * u, 2.4), a = (1 - w) * (1 - w), b = 2 * w * (1 - w), c = w * w;
  for (let k = 0; k < 3; k++) BZ[k] = a * P1[k] + b * HM[k] + c * E0.eye[k];
  return BZ;
}
function camD(T) {
  const eye = homeEye(T).slice(), v2 = E.ss(TRET0 + 3.0, TRET1 - .6, T);
  return { eye, target: seaLook(eye, T), fov: (30 + 8 * Math.sin(PI * v2) + 2 * v2) * DEG };
}
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  return spec ? spec.split(',').map(Number) : null;
})();
function camAt(T) {
  if (DBGCAM) return { eye: DBGCAM.slice(0, 3), target: DBGCAM.slice(3, 6), fov: (DBGCAM[6] || 40) * DEG };
  if (T < TF) { const s = PATH_A(T), d = FILM.drift(T, .05 * E.ss(12, 14, T) * (1 - E.ss(27, 29, T)), 3); s.eye = V.add(s.eye, d); return s; }
  if (T < TBU - .3) return camB(T);
  if (T < TBU + .4) return K.blendShot(camB(T), camC(T), E.ss(TBU - .3, TBU + .4, T));
  if (T < TRET0) return camC(T);
  if (T < TRET0 + .6) return K.blendShot(camC(T), camD(T), E.ss(TRET0, TRET0 + .6, T));
  if (T < TRET1) return camD(T);
  return PATH_A(T - DUR);
}

/* ---------- focus: in each beat the parts at work are drawn full, the rest sparse and dim ---------- */
const PH = [0, 14.3, 18.5, 19.9, T_LD - .1, T_RAIL - .3], PW = new Float64Array(6);
const FKEEP = {                 // pre, explode, spin, racks, loader, charge
  alt: [.7, .4, 1, .4, .25, .3], altX: [.7, 1, 1, .4, .25, .3], rack: [.7, .35, .5, 1, .22, .45], cab: [.7, .35, .45, 1, .25, .4],
  bus: [.7, .4, .6, 1, .3, 1], cool: [.7, .8, .5, .35, .3, .3], over: [.5, .35, .35, .35, .3, .3], floor: [.5, .45, .45, .45, .35, .35],
  base: [.7, .45, .45, .5, 1, 1], load: [.7, .4, .4, .5, 1, .6], ex: [1, .4, .4, .4, .25, .5], ring: [.7, .4, .4, .4, .2, .5], above: [1, 1, 1, .6, .3, 1],
};
const FK = {};
function focusAt(T) {
  for (let i = 0; i < 6; i++) { const a = i ? E.ss(PH[i] - .35, PH[i] + .35, T) : 1, b = i < 5 ? E.ss(PH[i + 1] - .35, PH[i + 1] + .35, T) : 0; PW[i] = a * (1 - b); }
  for (const g in FKEEP) { let v = 0; for (let i = 0; i < 6; i++) v += PW[i] * FKEEP[g][i]; FK[g] = v; }
  return FK;
}

/* ---------- drawing: ship, mount, loader, room ---------- */
const SO = { a: .7, fade: 600, size: .5, md: 1, cut: null, px: 5.6, edge: .4, lmin: 1, px0: 18 };
const SOP = { a: .7, fade: 600, size: .55, md: 1, px: 8, edge: .55, keep: .65 };
const MO = { a: 1.25, fade: 260, lime: 0, md: 0, size: .8, keep: 1, px: 4.7, edge: .68, S: null, zfix: undefined, bk: .12, foc: 0 };
const RO = { a: 1.15, fade: 30, lime: 0, md: 3, S: null, size: .7, px: 4.8, edge: .62, zfix: undefined, bk: 0, foc: 0 };
const lock = (T, t0) => { const a = T - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
function drawShip(Ws) { for (const p of SHIP) { SO.cut = p.name === 'hull' ? P_.CUT : null; P_.drawX(p.ml, Ws, SO); } P_.drawX(CL.hullP, Ws, SOP); }
function occluders(T, st, Ws) {
  P_.occReset();
  const hx = (C8, Tw) => P_.occHex(C8.map(p => X.ap(Tw, p)));
  if (st.gh < .3) for (const c of P_.TUR_OCC) hx(c, XF.T);
  hx(P_.BR_OCC, XF.B); hx(P_.BR_OCC.map(p => [p[0], -p[1], p[2]]), XF.B);
  for (let r = 0; r < 4; r++) { const rk = P_.RACKS[r]; if (allOpen(rk.z0, rk.z1)) hx(P_.RACK_OCC[r], Ws); }
  if (allOpen(55.2, 56.3)) hx(P_.CAB_OCC, Ws);
}
function drawMount(T, st) {
  const X_ = P_.drawX, gl = st.glow;
  MO.lime = 0; MO.a = 1.25; MO.md = 0; MO.S = null; MO.zfix = undefined; MO.keep = 1;
  MO.keep = FK.above; MO.a = 1.25 * (.35 + .65 * FK.above); X_(CL.baseAbove, XF.M, MO); MO.keep = 1; MO.a = 1.25;
  MO.lime = .6 * lock(T, 5.5) + .4 * lock(T, 56.8 + SH); X_(CL.hatchS, XF.hatS, MO); X_(CL.hatchP, XF.hatP, MO);
  MO.lime = 0; X_(CL.coamS, XF.M, MO); X_(CL.coamP, XF.M, MO);
  MO.md = 3; MO.S = M_S; MO.keep = FK.ex; MO.a = 1.25 * (.5 + .5 * FK.ex); X_(CL.exS, XF.M, MO); X_(CL.exP, XF.M, MO); MO.md = 0; MO.S = null; MO.keep = 1; MO.a = 1.25;
  MO.lime = .55 * lock(T, 9.0) + .5 * lock(T, 9.4); MO.keep = 1 - .82 * st.gh; MO.a = 1.25 * (1 - .4 * st.gh);
  X_(CL.turret, XF.T, MO); MO.keep = 1; MO.a = 1.25;
  MO.lime = Math.max(.6 * lock(T, 9.4), .18 * st.chg, .5 * gl); X_(CL.rear, XF.B, MO);
  MO.lime = Math.max(.7 * lock(T, 10.9), .35 * st.chg, .6 * gl); X_(CL.sleeve, XF.E, MO);
  MO.lime = Math.max(.7 * lock(T, 11.9), .15 * st.chg); X_(CL.coverS, XF.covS, MO);
  MO.lime = Math.max(.7 * lock(T, 12.2), .15 * st.chg); X_(CL.coverP, XF.covP, MO);
  MO.lime = .7 * lock(T, 5.9); X_(CL.petalT, XF.petT, MO); X_(CL.petalB, XF.petB, MO);
  // breech block and the clamp jaws
  MO.lime = Math.max(.8 * lock(T, LD(1.2)), .8 * lock(T, LD(2.6)), .15 * st.chg); X_(CL.breech, X.mul(XF.B, tr(0, -1.35 * st.brc, 0)), MO);
  for (let k = 0; k < P_.BANDS.length; k++) {
    const z = P_.BANDS[k], o = .07 * st.jaw[k];
    MO.lime = Math.max(.9 * lock(T, clampT(k) + .12), .25 * st.chg, .4 * gl);
    X_(CL.jawS, X.mul(XF.B, tr(o, 0, z)), MO); X_(CL.jawP, X.mul(XF.B, tr(-o, 0, z)), MO);
  }
  MO.lime = Math.min(1, .9 * st.chg + gl); MO.a = 1.25 + .5 * st.chg;
  X_(CL.railsR, XF.B, MO); X_(CL.railsE, XF.E, MO);
  MO.lime = 0; MO.a = 1.25;
}
/* the loader below and behind the breech (seen in the X-ray) */
const XRd = X.make(R.I(), [0, 0, 0]);
function drawLoader(T, st, Ws) {
  const X_ = P_.drawX;
  RO.md = 3; RO.lime = 0; RO.a = 1.15; RO.zfix = undefined; RO.keep = FK.load;
  // the drum and its pinion
  const dA = AZ + PI + (st.drum - 1) * 30 * DEG;
  const Ld = X.make(R.y(dA), [0, P_.DRUM_Y, P_.GZ]);
  RO.S = Ld; RO.lime = .5 * lock(T, T_LD + .5); X_(CL.drum, X.mul(Ws, Ld), RO);
  const Lp = X.make(R.y(-dA * 1.28 / .18), P_.PIN_P); RO.S = Lp; RO.lime = .4 * E.ss(T_LD, T_LD + .1, T) * (1 - E.ss(T_LD + .45, T_LD + .6, T)); X_(CL.pinion, X.mul(Ws, Lp), RO);
  // rounds in the cells (cell 0 leaves on the hoist)
  RO.lime = 0;
  for (let k = st.rnd > 0 ? 1 : 0; k < 12; k++) {
    const a = dA + k * 30 * DEG, L = X.make(ROT_UP, [Math.sin(a) * P_.DRUM_R, P_.RND_Y0, P_.GZ + Math.cos(a) * P_.DRUM_R]);
    RO.S = L; X_(CL.round, X.mul(Ws, L), RO);
  }
  // hoist and carriage (T frame)
  RO.S = XR.T; X_(CL.hoist, XF.T, RO);
  const Lc = X.mul(XR.T, tr(0, st.hoistY, P_.HZ)); RO.S = Lc; RO.lime = .5 * lock(T, LD(1.35)); X_(CL.carriage, X.mul(Ws, Lc), RO);
  // the round in flight through the loader
  let Lr = null;
  if (st.rnd === 1) Lr = X.mul(XR.T, X.make(ROT_UP, [0, st.hoistY, P_.HZ]));
  else if (st.rnd === 2) Lr = st.ram > 0 ? X.mul(XR.B, tr(0, 0, P_.TRAY_Z + (P_.SEAT_Z - P_.TRAY_Z) * st.ram)) : X.mul(XR.tray, XRd);
  if (Lr) { RO.S = Lr; RO.a = 1.5; RO.lime = Math.max(.45, .9 * lock(T, LD(2.2))) * (st.rnd === 2 && T > LD(2.9) ? .4 : 1); X_(CL.round, X.mul(Ws, Lr), RO); RO.a = 1.15; }
  // the tray (B frame, pivoting)
  RO.S = XR.tray; RO.a = 1.4; RO.lime = Math.max(.2, .6 * lock(T, LD(.6)) + .6 * lock(T, LD(1.85))); X_(CL.tray, XF.tray, RO); RO.a = 1.15;
  RO.S = null; RO.lime = 0; RO.keep = 1;
}
function drawRoom(T, st, Ws) {
  const X_ = P_.drawX;
  RO.md = 3; RO.S = null; RO.lime = 0; RO.a = 1.15; RO.zfix = undefined;
  const dimk = k => .35 + .65 * k;
  RO.keep = FK.floor; RO.a = .6; X_(CL.floor, Ws, RO); RO.a = 1.15;
  RO.keep = FK.rack; RO.a = 1.15 * dimk(FK.rack); X_(CL.racks, Ws, RO);
  RO.keep = FK.cab; RO.a = 1.15 * dimk(FK.cab); X_(CL.cab, Ws, RO);
  RO.keep = FK.over; RO.a = .9; X_(CL.over, Ws, RO);
  RO.keep = FK.cool; RO.a = 1.15 * dimk(FK.cool); RO.lime = .3 * E.ss(14.6, 15.4, T) * (1 - E.ss(XSH - 1, XSH, T)); X_(CL.cool, Ws, RO);
  RO.keep = FK.bus; RO.a = 1.15 * dimk(FK.bus); RO.lime = .4 * E.ss(T_BANK - .6, T_BANK, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.bus, Ws, RO);
  RO.keep = FK.base; RO.a = 1.15 * dimk(FK.base); RO.S = M_S; RO.zfix = P_.GZ; RO.lime = .3 * E.ss(T_RAIL - .4, T_RAIL + .6, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.baseBelow, XF.M, RO); RO.keep = FK.ring; RO.a = 1.15 * dimk(FK.ring); X_(CL.roller, XF.M, RO); RO.zfix = undefined;
  // pumps' couplings, valve handwheels, fans
  RO.lime = 0; RO.keep = FK.cool; RO.a = 1.15 * dimk(FK.cool);
  for (const p of P_.PUMPS) { const L = X.make(R.z(st.pump * (p[0] > 0 ? 1 : -1)), p); RO.S = L; X_(CL.coupling, X.mul(Ws, L), RO); }
  P_.VALVES.forEach((v, i) => { const L = X.make(R.y(-st.valve * (T > 13.9 + .15 * i ? 1 : 0) - i), v); RO.S = L; RO.lime = .7 * lock(T, 15.2 + .1 * i); X_(CL.wheel, X.mul(Ws, L), RO); });
  RO.lime = 0;
  P_.FANS.forEach((f, i) => { const L = X.make(R.z(st.fan * (i ? -1 : 1) + i), f); RO.S = L; X_(CL.fanB, X.mul(Ws, L), RO); });
  // alternators: body, the outer end bell + exciter + fan, the rotor
  for (let k = 0; k < 4; k++) {
    const L = ALT_L[k], xk = k === P_.XALT;
    RO.keep = xk ? FK.altX : FK.alt; RO.a = 1.15 * dimk(RO.keep);
    const Lb = xk ? XR.xexc : L, Lr0 = xk ? XR.xrot : L;
    const rot = (xk ? st.rotX : st.rot) * (k % 2 ? -1 : 1) + k, rate = xk ? st.rateX : st.rate;
    RO.lime = .5 * lock(T, 18.4) * (xk ? 1 : 0); RO.S = L; X_(CL.body, X.mul(Ws, L), RO);
    RO.lime = xk ? Math.max(.35 * Math.min(1, st.bell * 2), .6 * lock(T, 18.1)) : 0;
    RO.S = Lb; X_(CL.bell, X.mul(Ws, Lb), RO); X_(CL.exc, X.mul(Ws, Lb), RO);
    const Lf = X.mul(Lb, X.make(R.z(rot), [0, 0, 0])); RO.S = Lf; RO.lime = .15 * rate; X_(CL.fan, X.mul(Ws, Lf), RO);
    const Lr = X.mul(Lr0, X.make(R.z(rot), [0, 0, 0])); RO.S = Lr; RO.lime = Math.max(.2 * Math.min(1, rate), xk ? .4 * Math.min(1, st.rtr * 2) : 0); X_(CL.rotor, X.mul(Ws, Lr), RO);
  }
  // capacitor modules
  RO.keep = FK.rack;
  for (let k = 0; k < NMOD; k++) {
    const l = modLvl(k, T), L = MOD_L[k];
    RO.S = L; RO.lime = .7 * l + .3 * lock(T, modT(k)); RO.a = (.95 + .45 * l) * dimk(FK.rack); X_(CL.module, X.mul(Ws, L), RO);
  }
  RO.a = 1.15; RO.keep = FK.cab;
  // breakers (throw closed as each rack starts charging)
  for (let r = 0; r < 4; r++) {
    const c = kk(T, brkT(r), brkT(r) + .12) * (1 - kk(T, TF + .6, TF + 1.2)), L = X.make(R.x(-35 * DEG + 70 * DEG * c), P_.BRK[r]);
    RO.S = L; RO.lime = .9 * lock(T, brkT(r) + .12); X_(CL.breaker, X.mul(Ws, L), RO);
  }
  RO.S = null; RO.lime = 0; RO.keep = 1; RO.a = 1.15;
}
/* rotor rims: lime streaks that lengthen with speed; exciters' rings */
function drawRotorFX(T, st, Ws) {
  for (let k = 0; k < 4; k++) {
    const xk = k === P_.XALT, rate = xk ? st.rateX : st.rate; if (rate < .02) continue;
    const c = P_.ALT[k]; if (!isOpen(c[2])) continue;
    const L = X.mul(Ws, ALT_L[k]), sg = k % 2 ? -1 : 1, rot0 = (xk ? st.rotX : st.rot) * sg + k;
    const len = Math.min(2.6, .25 + 2.4 * rate), n = 14;
    for (let m = 0; m < 3; m++) {
      const a0 = rot0 + m * TAU / 3;
      for (let j = 0; j < n; j++) {
        const a = a0 - sg * len * j / n, w = 1 - j / n;
        for (const z of [-.66, .66]) { apI(L, Math.cos(a) * .83, Math.sin(a) * .83, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, j ? LIME : HOT, (.35 + .6 * rate) * w * w); }
      }
    }
    // the exciter field: a ring of dots at the armature, brightening with speed
    for (let j = 0; j < 36; j++) { const a = j / 36 * TAU + rot0 * .5; apI(L, Math.cos(a) * .44, Math.sin(a) * .44, 1.32, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .25 + .5 * rate * (.5 + .5 * Math.cos(a * 3 - T * 20))); }
    if (rate > .5) { apI(L, 0, 0, .9, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 36, LIME, .05 * rate); }
  }
}
/* the opened alternator: bolts flash as they let go and seat, guide rods run out under the bell */
function drawExplodeFX(T, st, Ws) {
  if (!isOpen(P_.ALT[P_.XALT][2])) return;
  const LA = XF.XA, LB = XF.XEXC;
  const fl = Math.max(lock(T, 14.5), lock(T, 18.4));
  if (fl > .02) for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; apI(LB, Math.cos(a) * .9, Math.sin(a) * .9, .78, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, fl); P_.oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .5 * fl); }
  if (st.rod > .01) for (const s of [-1, 1]) {
    const tip = .8 + 1.95 * st.rod;
    apI(LA, s * .62, -.55, .5, Q1); apI(LA, s * .62, -.55, tip, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, WH, .8, LIME, .05, 0);
    apI(LA, s * .62, -.53, tip, Q2); P_.odot(Q2[0], Q2[1], Q2[2], 2, LIME, .9);
  }
}
/* charge pulses crawling along a bus (ship-frame polyline): a front runs from t0, then a stream; the joints flash
   as the front reaches them and glow while current flows */
function busPulses(pl, T, t0, t1, speed, gap, I, Ws) {
  const A = I * E.ss(t0, t0 + .3, T) * (1 - E.ss(t1 - .6, t1, T)); if (A < .01) return;
  const front = (T - t0) * speed * 1.6, off = ((T - t0) * speed) % gap;
  for (let s = off; s < pl.L && s < front; s += gap) {
    P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue;
    apI(Ws, Q2[0], Q2[1], Q2[2], Q1);
    const head = front < pl.L && s > front - gap * 1.5;
    P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, A * (head ? 1 : .8));
    P_.oglow(Q1[0], Q1[1], Q1[2], head ? 14 : 8, LIME, (head ? .5 : .3) * A);
  }
  for (let i = 1; i < pl.P.length - 1; i++) {
    const q = pl.P[i]; if (!isOpen(q[2]) || front < pl.c[i]) continue;
    const since = (front - pl.c[i]) / (speed * 1.6), f = Math.exp(-since * 5);
    apI(Ws, q[0], q[1], q[2], Q1);
    for (const dx of [-.1, .1]) for (const dz of [-.1, .1]) { apI(Ws, q[0] + dx, q[1] + .085, q[2] + dz, Q3); P_.odot(Q3[0], Q3[1], Q3[2], 1, LIME, A * (.35 + .65 * f)); }
    if (f > .05) P_.oglow(Q1[0], Q1[1], Q1[2], 22, LIME, .55 * f * A);
  }
}
const COL = P_.poly([[0, 6.36, P_.GZ], [0, P_.GY + .35, P_.GZ]]);
const COOL_UP = [-1, 1].flatMap(s => P_.RISERS(s).map(pl => P_.poly(pl.map(p => [p[0], p[1] + P_.GY, p[2] + P_.GZ]))));
function coolFlow(T, Ws) {
  const A = .5 * E.ss(15.2, 16.2, T) * (1 - E.ss(XSH - 1, XSH, T)); if (A < .01) return;
  for (const pl of P_.COOL.concat(COOL_UP)) {
    const off = (T * 1.3) % .3;
    for (let s = off; s < pl.L; s += .3) {
      P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue;
      apI(Ws, Q2[0], Q2[1] + .085, Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, WH, A);
    }
  }
}
/* the cabinets: three status rows each (power, activity, the bank's charge as a bar), breaker arcs */
function cabinetFX(T, st, Ws) {
  if (!allOpen(55.2, 56.3)) return;
  const on = E.ss(14.2, 14.5, T) * (1 - E.ss(46, 47, T)), bank = nCharged(T) / NMOD, busy = E.ss(T_BANK - .5, T_BANK, T) * (1 - E.ss(TF + .5, TF + 1.5, T));
  const fr = Math.floor(T * 12);
  for (let c = 0; c < 5; c++) {
    const xc = P_.CAB_X[c], z = P_.CAB_Z - .012;
    for (let j = 0; j < 10; j++) {
      const x = xc - .3 + j * .0667;
      // row 1: power and state, steady once the room is up
      let a1 = on * (j < 3 || K.hh(c * 11 + j, 1) > .45 ? .75 : .12), c1 = j < 3 ? LIME : WH;
      apI(Ws, x, P_.FL + 2.24, z, Q1); if (a1 > .02) { P_.odot(Q1[0], Q1[1], Q1[2], 2, c1, a1); if (j < 3) P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .3 * a1); }
      // row 2: activity, blinking faster while the bank charges
      const bl = K.hh(c * 7.1 + j * 3.3, Math.floor(T * (3 + 9 * busy) + j * .37)) > .55 - .25 * busy ? 1 : 0;
      apI(Ws, x, P_.FL + 2.14, z, Q1); if (on > .02) { P_.odot(Q1[0], Q1[1], Q1[2], 2, busy > .3 && bl ? LIME : WH, on * (.15 + .85 * bl)); if (bl && busy > .3) P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .35 * on); }
      // row 3: the bank's charge as a bar across all five cabinets
      const idx = (c * 10 + j) / 50, lit = idx < bank ? 1 : 0;
      apI(Ws, x, P_.FL + 2.07, z, Q1); if (on > .02) { P_.odot(Q1[0], Q1[1], Q1[2], 2, lit ? LIME : WH, on * (lit ? 1 : .12)); if (lit) P_.oglow(Q1[0], Q1[1], Q1[2], 7, LIME, .4 * on); }
    }
  }
  for (let r = 0; r < 4; r++) {
    const a = T - brkT(r) - .12; if (a < -.06 || a > .25) continue;
    const b = P_.BRK[r]; apI(Ws, b[0], b[1] + .16, b[2] - .02, Q2); apI(Ws, b[0] + .03, b[1] + .3, b[2] - .02, Q3);
    K.arcW(Q2, Q3, 77 + r, T, 1 - Math.abs(a - .05) * 3, .6);
    P_.oglow(Q2[0], Q2[1], Q2[2], 30, LIME, .5 * Math.exp(-Math.max(0, a) * 8));
  }
  void fr;
}
/* module LEDs and charge bars */
function moduleFX(T, Ws) {
  for (let k = 0; k < NMOD; k++) {
    const m = P_.MOD[k]; if (!isOpen(m.p[2])) continue;
    const l = modLvl(k, T), pre = E.ss(modT(k) - .6, modT(k), T) * (1 - E.ss(TF, TF + .2, T));
    if (l < .01 && pre < .01) continue;
    const L = X.mul(Ws, MOD_L[k]);
    for (let j = 0; j < 6; j++) { const on = l * 6 > j + .5 ? 1 : 0; apI(L, -.412, -.1, -.16 + j * .05, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, on ? LIME : WH, on ? .85 : .15 * pre); }
    apI(L, -.412, -.2, .17, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .3 + .7 * l);
    const fl = lock(T, modT(k) + .1); if (fl > .05) { apI(L, -.47, .15, 0, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .5 * fl); }
  }
}
function drawRoomFX(T, st, Ws) {
  drawRotorFX(T, st, Ws);
  drawExplodeFX(T, st, Ws);
  coolFlow(T, Ws);
  cabinetFX(T, st, Ws);
  moduleFX(T, Ws);
  // alternators -> cabinets, cabinets -> racks, racks -> collector, up the column
  for (let k = 0; k < 4; k++) busPulses(P_.BUS_A[k], T, T_BANK - .8 + .15 * k, TF + .2, 3.2, .7, .9, Ws);
  for (let r = 0; r < 4; r++) busPulses(P_.BUS_B[r], T, brkT(r) + .1, T_BANK1 + .6, 3.0, .6, .85, Ws);
  for (let r = 0; r < 4; r++) busPulses(P_.BUS_C[r], T, T_RAIL - .2 + .2 * r, TF + .1, 2.2, .5, 1, Ws);
  busPulses(COL, T, T_RAIL + .4, TF + .1, 2.4, .35, 1, Ws);
}
/* the loader's lights: the rammer's chain, the round seating, the breech seal */
function loaderFX(T, st, Ws) {
  if (!isOpen(P_.GZ)) return;
  // the rammer chain from its housing to the round's base while it pushes
  const rr = T > LD(1.8) && T < LD(2.55) ? (T < LD(2.2) ? st.ram : 1 - kk(T, LD(2.2), LD(2.5))) : 0;
  if (rr > .01) {
    const z0 = -3.36, z1 = P_.TRAY_Z - P_.RND_H + (P_.SEAT_Z - P_.TRAY_Z) * rr;
    apI(XF.B, 0, 0, z0, Q1); apI(XF.B, 0, 0, z1, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, 1, HOT, .85, LIME, .12, .03);
    for (const s of [-1, 1]) { apI(XF.B, s * .06, 0, z1, Q3); apI(XF.B, s * .06, 0, z1 - .08, Q4); K.lineW(Q3[0], Q3[1], Q3[2], Q4[0], Q4[1], Q4[2], 1, 1, LIME, .9); }
  }
  // the round in hand: a tracked outline while the loader moves it
  if (st.rnd === 1 || (st.rnd === 2 && T < LD(2.5))) {
    const Lr = st.rnd === 1 ? X.mul(XF.T, X.make(ROT_UP, [0, st.hoistY, P_.HZ])) : st.ram > 0 ? X.mul(XF.B, tr(0, 0, P_.TRAY_Z + (P_.SEAT_Z - P_.TRAY_Z) * st.ram)) : XF.tray;
    const U = X.dir(Lr, [1, 0, 0]), W = X.dir(Lr, [0, 1, 0]);
    for (const z of [-P_.RND_H, -.12, .25]) { apI(Lr, 0, 0, z, Q1); K.ringW(Q1, U, W, .125, 40, 1, LIME, .8, T * 4); }
    apI(Lr, 0, 0, P_.RND_H, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .45);
  }
  // the breech seal as the block reaches home
  const bs = lock(T, LD(2.6));
  if (bs > .02) { apI(XF.B, 0, 0, -1.9, Q1); K.ringW(Q1, X.dir(XF.B, [1, 0, 0]), X.dir(XF.B, [0, 1, 0]), .5 + .3 * (1 - bs), 60, 1, LIME, bs, 0); }
  // the hoist's chain: dots running up the guides while it lifts
  const hv = T > LD(.45) && T < LD(2.3) ? 1 : 0;
  if (hv) {
    const dir = T < LD(1.35) ? 1 : -1, ph = (T * 3.2 * dir) % .2;
    for (let y = P_.HY0 + ph + .2; y < P_.HY1 - .5; y += .2) { apI(XF.T, 0, y, P_.HZ + .12, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .55); }
  }
}
/* rams on the hatches and the covers: a cylinder (fixed at its bracket) and a rod out to the pin */
function ramLine(Tb, b, Tp, p, a) {
  apI(Tb, b[0], b[1], b[2], Q1); apI(Tp, p[0], p[1], p[2], Q2);
  const L = V.dist(Q1, Q2), k = Math.min(1, .3 / Math.max(.01, L));
  Q3[0] = Q1[0] + (Q2[0] - Q1[0]) * k; Q3[1] = Q1[1] + (Q2[1] - Q1[1]) * k; Q3[2] = Q1[2] + (Q2[2] - Q1[2]) * k;
  K.lineW(Q1[0], Q1[1], Q1[2], Q3[0], Q3[1], Q3[2], .8, 2, WH, .7 * a);
  K.lineW(Q3[0], Q3[1], Q3[2], Q2[0], Q2[1], Q2[2], .8, 1, WH, .9 * a);
}
function mechFX(T, st) {
  const mv = x => .35 + .65 * x;
  for (const s of [-1, 1]) for (const [b, p] of P_.RAM_H(s)) ramLine(XF.M, b, s > 0 ? XF.hatS : XF.hatP, p, mv(st.hatch));
  for (const s of [-1, 1]) for (const [b, p] of P_.RAM_C(s)) ramLine(XF.B, b, s > 0 ? XF.covS : XF.covP, p, mv(s > 0 ? st.covS : st.covP));
  // the sleeve's lock pins shooting home at full run-out (and drawing at the stow)
  const pl = Math.max(lock(T, 10.9), lock(T, 49.8 + SH));
  if (pl > .02) for (const s of [-1, 1]) { apI(XF.E, s * .67, 0, P_.SLV0 + .15, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 14, LIME, .6 * pl); K.dotW(Q1[0], Q1[1], Q1[2], 2, HOT, pl); }
  // the drive screw turning while the sleeve runs (a helix of dots)
  const sv = Math.abs(P_.EXT * (kk(T + .02, 9.4, 10.9) * (1 - kk(T + .02, 49.8 + SH, 51.2 + SH))) - st.ext) > 1e-4;
  if (sv) for (let z = -.6; z < 5.2; z += .12) { const a = z * 9 - T * 40; apI(XF.B, Math.cos(a) * .04, -.8 + Math.sin(a) * .04, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, LIME, .6); }
}
/* the flexible bus trunk from the rear section down to the turret floor (drawn every frame: the barrel elevates) */
function trunk(T, st) {
  const I = E.ss(T_RAIL - .2, T_RAIL + .4, T) * (1 - E.ss(TF, TF + .3, T));
  const vis = .22 + .5 * I;
  const n = 34;
  for (let c = -1; c <= 1; c++) {
    apI(XF.B, c * .16, -.64, -1.55, Q1); apI(XF.B, c * .16, -1.5, -1.45, Q2);
    apI(XF.T, c * .16, 1.3, .2, Q3); apI(XF.T, c * .16 + .9, .32, .6, Q4);
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
  for (const y of [.18, -.18]) {
    apI(XF.B, 0, y, z0, Q1); apI(XF.B, 0, y, z1, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, LIME, .25 + .6 * q, LIME, .05 + .06 * q, .015);
  }
  const sp = 3 + 16 * q;
  for (let s = ((T - T_RAIL) * sp) % .5; s < Lz; s += .5) for (const y of [.18, -.18]) {
    apI(XF.B, 0, y, z0 + s, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 2, HOT, .5 + .5 * q);
  }
  const nR = 5, rs = .22 + 1.1 * q;
  for (let k = 0; k < nR; k++) {
    const f = ((T - T_RAIL) * rs + k / nR) % 1, z = z0 + .4 + f * (Lz - .2);
    apI(XF.B, 0, 0, z, Q1);
    const a = Math.min(1, (.25 + .9 * q) * Math.sin(PI * f) * 1.3), r = 1.55 - .45 * q + .25 * f;
    K.ringW(Q1, U, W, r, 150, 2, LIME, a * .85, T * 3 + k);
    K.ringW(Q1, U, W, r * .93, 90, 1, HOT, a * .6, -T * 2 + k);
    if (a > .3) { const fr = Math.floor(T * 30), h = K.hh(k * 7.7, fr), an = h * TAU; apI(XF.B, 0, h < .5 ? .18 : -.18, z, Q2); Q3[0] = Q1[0] + (U[0] * Math.cos(an) + W[0] * Math.sin(an)) * r; Q3[1] = Q1[1] + (U[1] * Math.cos(an) + W[1] * Math.sin(an)) * r; Q3[2] = Q1[2] + (U[2] * Math.cos(an) + W[2] * Math.sin(an)) * r; K.arcW(Q2, Q3, k * 13 + fr * .1, T, a, .35); }
  }
  if (q > .5) {
    const per = .9 - .55 * q, ph = ((T - T_RAIL) / per) % 1;
    for (const z of P_.BANDS) {
      const f = (z - z0) / Lz, d = ph - f; if (d < 0 || d > .25) continue;
      const a = (1 - d / .25) * (q - .5) * 2;
      apI(XF.B, 0, 0, z + .05, Q1); K.ringW(Q1, U, W, .78, 40, 2, HOT, a, 0);
    }
  }
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
  const A = st.hatch * E.ss(15.5, 17.5, T) * (1 - E.ss(45, 48, T)) * .35; if (A < .01) return;
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
    const r = 1 + 60 * Math.pow(a, .6), A = Math.max(0, 1 - a / 1.8);
    const c = V.mad(m, d, 2 + 10 * a);
    K.ringW(c, U, W, r, 520, 2, HOT, .85 * A, 0); K.ringW(c, U, W, r * .9, 360, 1, LIME, .55 * A, .3);
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
}
/* the trail stays up (fading) until the lens is home: the way back runs along it */
function drawProbe(T) {
  if (T < TF || T > TRET1 + .5) return;
  const s = climbS(T), vis = 1 - .35 * E.ss(TB + 3, TRET0, T) - .65 * E.ss(TRET1 - 2.5, TRET1 + .5, T), after = T > TBU ? T - TBU : 0;
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
/* the burst, and the smoke it leaves hanging over the headland */
function drawBurst(T) {
  const a = T - TBU; if (a < 0 || a > TRET1 - TBU) return;
  const p = B_TOP, r = 420 * (1 - Math.exp(-a * 2.6)) + 18 * a, A = a < 2.4 ? Math.max(0, 1 - a / 2.4) : 0, S = .22 * E.ss(.8, 2.4, a) * (1 - E.ss(TRET1 - TBU - 4, TRET1 - TBU, a));
  if (a < .5) K.glowW(p[0], p[1], p[2], Math.round(60 + 240 * Math.exp(-a * 6)), HOT, .9 * Math.exp(-a * 4));
  if (A > 0) K.glowW(p[0], p[1], p[2], 120, LIME, .25 * A);
  for (let i = 0; i < 520; i++) { const o = i * 4, rr = r * BURST[o + 3]; const b = A * (.5 + .5 * BURST[o + 3]) + S * BURST[o + 3]; if (b < .02) continue; K.dotW(p[0] + BURST[o] * rr + 30 * a, p[1] + BURST[o + 1] * rr * (a > 2.4 ? .6 : 1) - 40 * Math.min(a, 2.4) ** 2, p[2] + BURST[o + 2] * rr, i % 5 ? 1 : 2, a < 2.4 && i % 3 ? LIME : WH, b); }
}
function drawSea(T) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const S = SEA.F, TL = SEA.TL, ph = T * TAU / 6, sw = T * TAU / 12;
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
      if (P_.occd(sx, sy, zc)) continue;
      const b = S[j + 2] * (zc < 3000 ? 1 - zc / 6000 : .5 + .6 * E.ss(3000, 12000, zc)) * rf * (step > 1 ? 1.3 : 1);
      K.dot(sx, sy, zc < 50 ? 2 : 1, 236, 238, 232, b);
    }
  }
}

/* ---------- tags and readout ---------- */
const UT = [
  ['MNT', 'Railgun mount', st => '', 'T', [0, 2.9, -1.6], 5.6, 8.8],
  ['VNT', 'Heat exchangers ×2', st => '', 'M', [4.2, .3, 1.1], 5.4, 8.6],
  ['RAIL', 'Rails', st => `${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m`, 'E', [.6, .74, 4.4], 9.8, 12.3],
  ['CVR', 'Rail covers ×2', st => '', 'covS', [.6, .7, 1.4], 11.5, 13.2],
  ['PMP', 'Coolant pumps ×2', st => '', 'W', [.62, 2.05, 41.3], 14.2, 16.0],
  ['EXC', 'Exciter · end bell', st => '', 'XEXC', [0, .5, 1.3], 15.5, 17.2],
  ['ROT', 'Rotor', st => '', 'XROT', [0, .8, .3], 16.3, 17.4],
  ['ALT', 'Pulsed alternators ×4', st => `${Math.round(RPM * st.rate / 10) * 10} rpm`, 'W', [3.2, 3.9, 45.0], 18.7, 21.0],
  ['CAP', 'Capacitor racks ×4', st => `${(1.2 * nCharged(ST_T)).toFixed(1)} MJ`, 'W', [-1.9, 6.05, 52.2], 20.2, 23.2],
  ['PCU', 'Power conditioning ×5', st => '', 'W', [-1.84, 3.85, 55.35], 21.0, 23.2],
  ['MAG', 'Magazine drum', st => '', 'W', [1.1, 2.3, 48.1], LD(0), LD(1.1)],
  ['HST', 'Hoist', st => '', 'T', [.2, -3.2, P_.HZ], LD(.5), LD(1.6)],
  ['BRC', 'Breech block', st => '', 'B', [.56, .64, -2.2], LD(.9), LD(2.6)],
  ['CLP', 'Rail clamps ×11', st => '', 'B', [.46, .55, 3.2], LD(2.7), LD(4.2)],
  ['MZL', 'Muzzle', st => `${Math.round(100 * st.chg)} %`, 'E', [.7, .82, P_.SLV1], T_RAIL + 1.4, TF - .1],
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
  if (T < 4.2 || T > 56.8 + SH) { l1 = 'DDG-51 · <b>on station</b>'; l2 = 'Railgun <b>stowed</b>'; }
  else if (T < 12.6) {
    l1 = 'Railgun · <b>deploying</b>';
    l2 = T < 5.8 ? 'Hatches <b>opening</b>' : T < 9.4 ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : T < 10.9 ? `Rails <b>${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m</b>` : 'Covers <b>open</b>';
  } else if (T < 15.0) { l1 = 'Power · <b>coolant loop</b>'; l2 = T < 14.6 ? 'Valves <b>opening</b>' : 'Pumps <b>starting</b>'; }
  else if (T < 18.5) { l1 = 'Pulsed alternator 3 · <b>opened</b>'; l2 = T < 15.9 ? 'End bell <b>drawn</b>' : T < 17.4 ? 'Rotor <b>drawn</b>' : 'End bell <b>closing</b>'; }
  else if (T < T_BANK - .2) { l1 = 'Power · <b>pulsed alternators</b>'; l2 = `Rotors <b>${Math.round(RPM * st.rate / 10) * 10} rpm</b>`; }
  else if (T < T_LD) { const n = nCharged(T); l1 = 'Capacitor racks · <b>charging</b>'; l2 = `Bank <b>${(1.2 * n).toFixed(1)} MJ</b> · ${n}/${NMOD}`; }
  else if (T < T_RAIL) {
    l1 = 'Loader · <b>ramming</b>';
    l2 = T < LD(.45) ? 'Drum <b>indexing</b>' : T < LD(1.35) ? 'Hoist <b>up</b>' : T < LD(1.85) ? 'Breech <b>open</b> · tray <b>in line</b>' : T < LD(2.6) ? 'Round <b>seated</b>' : 'Rail clamps <b>locking</b>';
  }
  else if (T < TF) { l1 = 'Rails · <b>charging</b>'; l2 = `Charge <b>${Math.round(100 * st.chg)} %</b> · 32 MJ`; }
  else if (T < TBU) { const s = climbS(T); rate = climbRate(T); probeAt(s, Q4); l1 = `Probe · <b>alt ${km(Q4[1])} km</b>`; l2 = `<b>${Math.round(vOfS(s))} m/s</b> · range <b>${km(Math.hypot(Q4[0], Q4[2]))} km</b>`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - TBU - .08) / LEAD))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 48.4 + SH - .6) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else { l1 = 'Railgun · <b>stowing</b>'; l2 = T < 49.8 + SH ? 'Covers <b>closing</b>' : T < 51.3 + SH ? `Rails <b>${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m</b>` : T < 54.6 + SH ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : 'Hatches <b>closing</b>'; }
  const sim = T < TF ? T - TF : T < TBU ? climbS(T) : S1 + (T - TBU);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(T > 48.4 + SH - .6 ? T - DUR - TF : sim)} · ${rateTxt}`;
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
  mountXf(Ws, st); focusAt(T);
  const xr = xrayAt(T);
  FILM.apply(C, camAt(T));
  const af = T - TF, tb = T - TB;
  C.shake = af > 0 && af < 1 ? FILM.shake(T, 9 * (1 - af), 24) : tb > 0 && tb < .8 ? FILM.shake(T, 3 * (1 - tb / .8), 22) : [0, 0];
  C.near = .1; C.update();
  RO.foc = MO.foc = 1.15 * V.dist(C.eye, C.target);
  if (PROF) pt0 = performance.now();
  K.pb.clear();
  const near = V.dist(C.eye, MW) < 400;
  if (near) occluders(T, st, Ws); else P_.occReset();
  pf('clear');
  K.drawStars(STARS, .9, T, -.02);
  const siteOn = T > TF + 1 && T < TRET1 + 1;
  if (siteOn) SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null);
  pf('ground');
  drawSea(T); pf('sea');
  K.setLight(V.add(V.add(V.mul(C.r, .45), V.mul(C.u, .7)), V.mul(C.f, -.55)));
  drawShip(Ws); pf('ship');
  if (near) { drawMount(T, st); pf('mount'); }
  if (xr && near) { drawRoom(T, st, Ws); drawLoader(T, st, Ws); pf('room'); drawRoomFX(T, st, Ws); loaderFX(T, st, Ws); pf('roomfx'); }
  if (near) { trunk(T, st); mechFX(T, st); drawVapor(T, st); }
  if (siteOn) { K.setLight(L_SITE); SITE.drawVehicles(T > TB - 1 ? tb : null); }
  drawCharge(T, st);
  drawFire(T); drawProbe(T); drawBurst(T);
  if (T > TBU && siteOn) SITE.drawBolt(BOLT, tb, LEAD);
  pf('fx');
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (af > 0 && af < .4) fl = .1 * Math.exp(-af * 10);
  if (tb > 0 && tb < .7) fl = Math.max(fl, .1 * Math.min(1, K.Bolt.stroke(tb)));
  if (T > TBU && T < TBU + .3) fl = Math.max(fl, .08 * Math.exp(-(T - TBU) * 12));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < TRET0 + 2.2) SITE.overlay(T, tb, 1 - E.ss(TRET0 + .8, TRET0 + 2, T));
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
const clack = () => { SFX.tone(900, 300, .06, 'square', .012); SFX.noise(.08, 3000, .8, .02, .002); };
const whirr = (f0, f1, d) => () => { SFX.tone(f0, f1, d, 'sawtooth', .011); SFX.noise(d, 900, .7, .012, .3); };
const S2 = t => t + SH;
const cues = [
  [4.3, () => SFX.noise(1.2, 700, .8, .03, .2)], [5.5, clunk], [5.0, () => SFX.tone(300, 180, .3, 'square', .01)], [5.9, clunk],
  [5.8, whirr(90, 150, 3.2)], [6.6, whirr(110, 85, 2.8)], [9.4, clunk], [9.4, () => SFX.noise(1.6, 1400, .6, .02, .3)], [10.9, clunk],
  [10.8, () => SFX.tone(260, 170, .5, 'square', .008)], [11.9, clunk], [11.1, () => SFX.tone(250, 160, .5, 'square', .008)], [12.2, clunk],
  [12.8, () => SFX.tone(900, 2600, .9, 'sine', .012)], [13.9, whirr(300, 260, 1.2)], [14.6, () => SFX.tone(60, 180, 1.6, 'sawtooth', .01)],
  [14.5, clack], [14.7, whirr(160, 220, .5)], [15.1, whirr(120, 140, .8)], [15.7, whirr(100, 120, .8)], [16.9, whirr(120, 100, .7)], [17.4, whirr(140, 120, .7)], [18.1, clunk], [18.4, clack],
  [15.6, () => { SFX.tone(55, 420, 4.2, 'sawtooth', .016); SFX.tone(110, 840, 4.2, 'triangle', .012); }],
  [19.6, () => { SFX.tone(420, 436, 5.6, 'sawtooth', .007); SFX.tone(840, 872, 5.6, 'triangle', .006); }],
  ...[0, 1, 2, 3].map(r => [brkT(r) + .1, clack]),
  ...Array.from({ length: 10 }, (_, k) => [modT(k * 8) + .1, tick]),
  [T_LD, whirr(200, 160, .5)], [LD(.5), clunk], [LD(.45), whirr(180, 420, .9)], [LD(.75), clack], [LD(1.2), clunk], [LD(1.8), clunk], [LD(1.85), whirr(300, 800, .35)], [LD(2.6), clunk],
  ...Array.from({ length: 11 }, (_, k) => [clampT(k) + .12, tick]),
  [T_RAIL, () => SFX.tone(200, 2600, 5.0, 'sawtooth', .012)], [T_RAIL + 1, () => SFX.noise(4, 5000, .5, .016, 3)],
  [TF, () => { SFX.crack(); SFX.rumble(3, .3); SFX.tone(900, 60, 1.2, 'sawtooth', .02); }],
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(4, .16); }],
  [TB + .5, tick], [TB + 1.2, tick],
  [S2(48.4), () => SFX.tone(260, 170, .5, 'square', .008)], [S2(49.4), clunk], [S2(49.8), () => SFX.noise(1.4, 1400, .6, .02, .3)], [S2(51.2), clunk],
  [S2(51.3), whirr(150, 90, 3.0)], [S2(54.6), () => SFX.tone(300, 180, .3, 'square', .01)], [S2(55.5), () => SFX.noise(1.2, 700, .8, .03, .2)], [S2(56.8), clunk],
];
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ camAt, prof: PROF, log: LOG, np: NP, mz: MZ0, dir: DIR0, btop: B_TOP, s1: S1, arc: ARC.len, range: RANGE, e21: E21, stateAt, XF, XR });
})();
