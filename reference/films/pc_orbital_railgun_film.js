/* ORBITAL · RAILGUN (Point Cloud). A railgun platform three times the size of the ISS (a 340 m spine, a 250 m
   barrel truss with 250 coil rings, eight 98 m solar wings, four capacitor modules), 380 km up and 230 km down-range
   of a coastal battery.
   It wakes (a lime wave runs out through the structure, the status lights come on), unfolds its radiators and its
   arm (x8), turns its wings to the sun, sends the power down the truss into the capacitor modules (x20k), indexes the
   magazine and rams a rod into the breech (X-ray), slews onto the coast with puffs of its thrusters (x20), opens the
   muzzle iris and energises the coils breech to muzzle in a lime wave, and fires: the rod's 0.1 s in the barrel at
   x1/20, rings of light racing out of the muzzle, the sabot petals peeling away, the recoil (19 m/s: 22.7 t at
   5.0 km/s against ~6000 t) and the barrel ringing. The camera rises over the muzzle as the iris closes behind the
   rod (the limb and a cloud deck under the platform), then dives after it: it falls 447 km (rates on screen), glows as it enters the air under a plasma sheath and draws a long trail; it strikes the coast at 4.9 km/s:
   a white flash, a shock shell, a ground ring racing out past the camera, a fireball rising into a stem and a rolling
   cap with a collar (x4). The camera climbs back up the trail to the platform as it stows and goes to sleep.
   One take, 100 s, loops. Render is a pure function of film time T. ?prof times the passes, ?cam= sets a debug camera
   in the platform frame. */
(() => {
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = ORK; K.setup();
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = []; window.ORW_LOG = LOG;
const t0load = performance.now();
const lap = s => LOG.push(`${s} ${(performance.now() - t0load).toFixed(0)} ms`);
const ss = E.ss, kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a))), kb = (T, w) => kk(T, w[0], w[1]);
const flash = (T, t0, k) => { const a = T - t0; return a > 0 && a < 4 ? Math.exp(-a * (k || 6)) : 0; };

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 100;
const T_WAKE = 3.2, WAKE_DT = .036;
const RADW = [[8.0, 14.4], [8.5, 14.9], [9.0, 15.4], [9.5, 15.9]], ARMW = [10.5, 19.5];
const ALW = [16.2, 21.6], BEW = [18.8, 23.2], T_PWAVE = 22.6, T_FLOW = 24.2, CAPW = [25.2, 32.4];
const BLK_O = [33.0, 33.7], IDX = [33.3, 34.7], RAMW = [34.9, 37.7], RAMB = [37.8, 39.1], BLK_C = [39.2, 39.9];
const SLEW = [41.0, 47.2];
const IRIS = [47.6, 48.7], CH0 = 49.0, CH1 = 54.4, TF = 55.6;
const V_MZ = 5000, Z_CH = -7.2, Z_MZ = 253.8, BLEN = Z_MZ - Z_CH, RATE_TR = 1 / 20, TR_D = 2 * BLEN / V_MZ / RATE_TR, TX = TF + TR_D;
const TI = 74.2, T_RET = 86.0;
const IRIS_B = [TX + 1.3, TX + 2.4], SLEW_B = [87.2, 93.2], WING_B = [93.4, 97.6], RAD_B = [[92.6, 98.2], [92.9, 98.5], [93.2, 98.8], [93.5, 99.1]], ARM_B = [91.8, 99.0], LIGHTS_OFF = [97.4, 99.4];
const CHAPTERS = [
  { t: 0, title: 'Orbit' }, { t: T_WAKE - .2, title: 'Wake' }, { t: RADW[0][0] - .2, title: 'Deploy' }, { t: ALW[0] - .2, title: 'Arrays' },
  { t: T_FLOW - .3, title: 'Power' }, { t: BLK_O[0] - .2, title: 'Load' }, { t: SLEW[0] - .3, title: 'Slew' }, { t: IRIS[0] - .2, title: 'Charge' },
  { t: TF - .3, title: 'Fire' }, { t: TX + 2.2, title: 'Fall' }, { t: TI - .4, title: 'Strike' }, { t: T_RET, title: 'Return' },
];
lap('timeline');

/* ---------- the world ---------- */
const RE = 6371000, CE = [0, -RE, 0], ALT = 380000, GD = 230000;
const HD_ = V.norm([-.32, 0, -.95]), TH = GD / RE;
const UP_S = V.norm([HD_[0] * Math.sin(TH), Math.cos(TH), HD_[2] * Math.sin(TH)]);
const SAT = V.add(CE, V.mul(UP_S, RE + ALT));
const HIT0 = [2, 0, 13];
const GCAM_G = V.add(HIT0, V.add(V.mul([-HD_[0], 0, -HD_[2]], 4300), V.mul([HD_[2], 0, -HD_[0]], 900)));
const W = ORW(K, { foci: [[0, 0], [HD_[0] * GD, HD_[2] * GD]], gcam: GCAM_G });
lap('world');
const HIT = W.HIT;
const GCAM = [GCAM_G[0], W.ground(GCAM_G[0], GCAM_G[2]) - W.drop(GCAM_G[0], GCAM_G[2]) + 30, GCAM_G[2]];
const EY = UP_S, EZ = V.norm(V.sub(V.sub(HIT, SAT), V.mul(UP_S, V.dot(V.sub(HIT, SAT), UP_S)))), EX = V.cross(EY, EZ);
const P = ORP(ORL);
lap('platform ' + JSON.stringify(P.stats()));
const FX = ORFX(K, ORL, W);
lap('fx');

/* ---------- attitude: parked (the bore along the orbit, the top to space) -> on the coast -> parked ---------- */
const Q0 = K.Q.fromR(R.look(EX, EY));
let AIM = V.norm(V.sub(HIT, SAT));
for (let i = 0; i < 3; i++) { const mz = V.mad(SAT, AIM, Z_MZ); AIM = V.norm(V.sub(HIT, mz)); }
const Q1 = K.Q.fromR(R.look(AIM, EY));
const W0 = X.make(K.Q.toR(Q0), SAT), W1 = X.make(K.Q.toR(Q1), SAT);
const PW0 = p => X.ap(W0, p), PW1 = p => X.ap(W1, p);
const MZ0 = PW1([0, 0, Z_MZ]), DIRP = V.norm(V.sub(HIT, MZ0)), L0 = V.dist(MZ0, HIT);
const [PXP, PYP] = GEO.perp(DIRP);
const L_SUN = V.norm(X.dir(W0, [-.42, .5, .76]));
/* recoil: 33 m/s back along the bore at the exit, braked by the aft thrusters in 3.5 s; eased back to station while
   the camera is far away */
const V_REC = 19, T_BRK = 3.5;            // 22.7 t at 5.0 km/s against ~6000 t
function recoilD(T) {
  if (T <= TF) return 0;
  if (T < TX) { const u = (T - TF) / TR_D; return u * u; }
  const t = Math.min(tauOf(T), T_BRK), d = 1 + V_REC * (t - t * t / (2 * T_BRK));
  return d * (1 - kk(T, 63, 72.5));
}
function shudder(T) { const t = T - TX; return t > 0 && t < 7 ? .005 * Math.exp(-t / 1.8) * Math.sin(TAU * 1.1 * t) : 0; }
const slewU = T => kb(T, SLEW) * (1 - kb(T, SLEW_B));
const PLAT = { W: W0 };
function platXf(T) {
  const u = slewU(T);
  let Rm = u <= 0 ? W0.R : u >= 1 ? W1.R : K.Q.toR(K.Q.slerp(Q0, Q1, u));
  const sh = shudder(T); if (sh) Rm = R.mul(Rm, R.mul(R.x(sh), R.y(sh * .6)));
  const zax = [Rm[2], Rm[5], Rm[8]], d = recoilD(T);
  PLAT.W = X.make(Rm, V.mad(SAT, zax, -d));
  return PLAT.W;
}

/* ---------- the fall: speed along the line (the muzzle's 5.0 km/s, gravity, the air near the end) ---------- */
const altAt = s => V.dist(V.mad(MZ0, DIRP, s), CE) - RE;
const H0 = altAt(0), G0 = 9.4;
const vAt = s => { const h = altAt(s); return Math.sqrt(V_MZ * V_MZ + 2 * G0 * (H0 - h)) * (1 - .14 * ss(45000, 0, h)); };
const FN = 4000, TAUS = new Float64Array(FN + 1);
for (let i = 1; i <= FN; i++) { const s0 = L0 * (i - 1) / FN, s1 = L0 * i / FN; TAUS[i] = TAUS[i - 1] + (s1 - s0) * .5 * (1 / vAt(s0) + 1 / vAt(s1)); }
const TAU_END = TAUS[FN];
const sOfTau = tau => { if (tau <= 0) return 0; if (tau >= TAU_END) return L0; let lo = 0, hi = FN; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAUS[m] < tau) lo = m; else hi = m; } const k = (tau - TAUS[lo]) / (TAUS[hi] - TAUS[lo]); return L0 * (lo + k) / FN; };
const FD = TI - TX;
/* the exit stays in the barrel's x1/20 for 1.7 s, ramps to x1, then a plateau (solved so the 84.6 s fall fits) */
const T_SLO = 1.7;
const fwSeg = P_ => [{ t: 0, rate: RATE_TR }, { t: T_SLO, rate: RATE_TR }, { t: 2.6, rate: 1 }, { t: 3.2, rate: 1 }, { t: 5.4, rate: P_ }, { t: 10.6, rate: P_ }, { t: 13.6, rate: 2.6 }, { t: FD, rate: 1.2 }];
const FWARP = (() => { let lo = 1, hi = 40; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (FILM.warp(fwSeg(m)).total < TAU_END) lo = m; else hi = m; } return FILM.warp(fwSeg((lo + hi) / 2)); })();
const FWS = TAU_END / FWARP.total;
const tauOf = T => T <= TX ? 0 : T >= TI ? TAU_END : FWARP(T - TX) * FWS;
const fallRate = T => T <= TX || T >= TI ? 1 : FWARP.rate(T - TX) * FWS;
const sOf = T => sOfTau(tauOf(T));
const rodAt = T => V.mad(MZ0, DIRP, sOf(T));
const altOf = p => V.dist(p, CE) - RE;
/* film time at which the rod passed s (for the trail's age) */
const TPASS = new Float64Array(801);
{ let t = TX; for (let i = 0; i <= 800; i++) { const s = L0 * i / 800; while (t < TI && sOf(t) < s) t += .002; TPASS[i] = t; } }
const tPassAt = s => { const x = E.clamp(s / L0, 0, 1) * 800, k = Math.min(799, Math.floor(x)); return TPASS[k] + (TPASS[k + 1] - TPASS[k]) * (x - k); };
/* the trail's age (film s, aged faster while the clock runs fast) */
const ageAt = (s, T) => { const tp = tPassAt(s); return T < TI ? Math.max(0, T - tp) * 2.5 : (TI - tp) * 2.5 + (T - TI) * 1.5; };
const FALL = { MZ: MZ0, DIR: DIRP, U: PXP, W: PYP, L0, sOf, altAt, ageAt };
LOG.push(`fall ${(L0 / 1000).toFixed(1)} km in ${TAU_END.toFixed(1)} s, impact ${(vAt(L0) / 1000).toFixed(2)} km/s, transit ${TR_D.toFixed(2)} s`);
/* the strike's clock: sim s since the impact (x1, then x4 while the column rises) */
const SWARP = FILM.warp([{ t: 0, rate: 1 }, { t: 1.6, rate: 1 }, { t: 4.5, rate: 4 }, { t: T_RET - TI + 14, rate: 4 }]);
const aOf = T => T < TI ? -1 : SWARP(T - TI);
const strikeRate = T => T < TI ? 1 : SWARP.rate(T - TI);

/* ---------- the platform's state ---------- */
const ST = { wave: -1, waveW: 14, waveA: 0, waveT: 0, wake: 0, alpha: [0, 0], beta: [0, 0, 0, 0, 0, 0, 0, 0], rad: [0, 0, 0, 0], radYaw: [0, 0, 0, 0], arm: [0, 0, 0, 0, 0, 0], drum: 0, ram: 0, rodOn: false, rodZ: null, block: 1, iris: 0, flex: null };
const ARM_STOW = [PI / 2, .06, PI - .12, -.1, 0, 0], ARM_UP = [-.55, 1.05, 2.05, -.95, .3, 0], ARM_LOAD = [-.95, .82, 1.78, -.7, .1, 0];
/* the sun in the platform frame -> the wings' alpha (about the truss) and the blankets' beta */
const trackAB = Wt => { const M = Wt.R, S = [M[0] * L_SUN[0] + M[3] * L_SUN[1] + M[6] * L_SUN[2], M[1] * L_SUN[0] + M[4] * L_SUN[1] + M[7] * L_SUN[2], M[2] * L_SUN[0] + M[5] * L_SUN[1] + M[8] * L_SUN[2]]; return { a: Math.atan2(S[2], S[1]), bx: S[0] }; };
const rodZof = T => { if (T < TF) return Z_CH; const u = Math.min(1, (T - TF) / TR_D); return Z_CH + BLEN * u * u; };
const RAM_EXT = 25.8;
const ramOf = T => T < RAMB[0] ? RAM_EXT * kb(T, RAMW) : RAM_EXT * (1 - kb(T, RAMB));
const T_CONTACT = RAMW[0] + (RAMW[1] - RAMW[0]) * .12;
let FLEXT = 0;
const flexFn = (z, o) => { const t = FLEXT, k = (z / Z_MZ) * (z / Z_MZ), A = 1.7 * Math.exp(-t / 2.4) * Math.sin(TAU * .72 * t) * k; o[0] = A * .35; o[1] = A; o[2] = 0; };
function stateAt(T) {
  ST.wake = ss(T_WAKE, T_WAKE + 4, T) * (1 - kb(T, LIGHTS_OFF));
  const tr = trackAB(PLAT.W), ua = kb(T, ALW) * (1 - kb(T, WING_B)), ub = kb(T, BEW) * (1 - kb(T, WING_B));
  ST.alpha[0] = ST.alpha[1] = tr.a * ua;
  for (let w = 0; w < 8; w++) { const dz = w & 1 ? -1 : 1; ST.beta[w] = Math.asin(E.clamp(-tr.bx * dz, -1, 1)) * ub; }
  for (let r = 0; r < 4; r++) ST.rad[r] = kb(T, RADW[r]) * (1 - kb(T, RAD_B[r]));
  const aU = kb(T, ARMW) * (1 - kb(T, ARM_B)), aL = kk(T, 31.2, 34.2) * (1 - kk(T, 40, 43.5));
  for (let j = 0; j < 6; j++) ST.arm[j] = ARM_STOW[j] + (ARM_UP[j] - ARM_STOW[j]) * aU + (ARM_LOAD[j] - ARM_UP[j]) * aL * aU;
  ST.drum = TAU / 8 * (1 - kb(T, IDX)) + (T > T_RET + 2 ? TAU / 8 * kk(T, T_RET + 2.4, T_RET + 3.4) : 0);
  ST.ram = ramOf(T);
  const back = T > T_RET + 2.6;
  ST.rodOn = !back && T > T_CONTACT;
  ST.rodZ = T < RAMB[0] ? -33 + Math.max(1, ST.ram) : T < TF ? Z_CH : T < TX ? rodZof(T) : null;
  ST.block = 1 - kb(T, BLK_O) * (1 - kb(T, BLK_C));
  ST.iris = kb(T, IRIS) * (1 - kb(T, IRIS_B));
  FLEXT = T - TX; ST.flex = T > TX && T < TX + 9 ? flexFn : null;
  // the wake: a lime wave through the whole structure from the core; the sleep: a fainter one back in
  const wk = T - (T_WAKE + .3), sl = T - 97.2;
  if (wk > 0 && wk < 3.2) { ST.wave = 260 * wk / 2.4; ST.waveW = 18; ST.waveA = .95 * (1 - ss(2.4, 3.2, wk)); ST.waveT = .18; }
  else if (sl > 0 && sl < 2.4) { ST.wave = 260 * (1 - sl / 2.2); ST.waveW = 22; ST.waveA = .6 * (1 - ss(1.8, 2.4, sl)); ST.waveT = 0; }
  else ST.wave = -1;
  return ST;
}

/* ---------- effects on the platform's parts (the lattice's channels) ---------- */
const NL = P.lights.length;
const zWave = T => 250 * E.sat((T - CH0) / (CH1 - CH0));
const chg = T => ss(CH0 - .3, CH0 + .4, T) * (1 - ss(TX, TX + 1.8, T));
let FXT = 0, XR = 0;
const fxFn = (ch, q) => {
  const T = FXT;
  switch (ch) {
    case 1: { // coil rings
      let k = 0;
      if (T > CH0 - .2 && T < TF) { const zf = zWave(T), d = zf - q; if (d > 0) k = .5 + .12 * K.hh(q, Math.floor(T * 20)); if (d > -1.5 && d < 3) k = Math.max(k, 1.7 * Math.exp(-Math.abs(d) / 1.6)); }
      if (T >= TF && T < TX + 3) { const zr = rodZof(Math.min(T, TX)), d = zr - q; if (T < TX) { if (d > 0 && d < 40) k = Math.max(k, 2 * Math.exp(-d / 8)); else if (d >= 40) k = Math.max(k, .35); else k = Math.max(k, .55); } else k = Math.max(k, .9 * Math.exp(-(T - TX) * 1.4)); }
      return k;
    }
    case 2: { // rails and bus bars
      let k = 0;
      if (T > CH0 && T < TF) { const d = zWave(T) - q; if (d > 0) k = .3; if (d > -3 && d < 6) k = Math.max(k, .9 * Math.exp(-Math.abs(d) / 3)); }
      if (T >= TF && T < TX + 2) { const zr = rodZof(Math.min(T, TX)), d = zr - q; k = T < TX ? (d > -2.5 && d < 30 ? 1.8 * Math.exp(-Math.max(0, d) / 9) : .3) : .6 * Math.exp(-(T - TX) * 2); }
      return k;
    }
    case 4: { // solar blankets: q = wing*16 + side*8 + segment
      const seg = q % 8, w = q >> 4; const t = T - (T_PWAVE + w * .06 + seg * .16);
      let k = 0; if (t > 0 && t < 2.5) k = .95 * Math.exp(-t * 2.2) + .15;
      if (T > T_PWAVE + 2 && T < TX) k = Math.max(k, .1);
      if (T > TF - .2 && T < TX + 1) k = Math.max(k, .45 * flash(T, TF, 2.5));
      return k;
    }
    case 5: { // capacitor segments: q = module*16 + segment (0 dome, 1..12 bands, 13 dome)
      const m = q >> 4, sg = q & 15, fill = E.sat((T - CAPW[0] - m * .35) / (CAPW[1] - CAPW[0] - 1.2)) * 14;
      let k = 0; if (fill > sg) k = .38 + .55 * Math.exp(-(fill - sg) * 1.6);
      if (T > TF) k *= Math.max(0, 1 - (T - TF) / TR_D * 1.2);
      if (T > TF && T < TX) k = Math.max(k, 1.4 * Math.exp(-Math.abs((T - TF) / TR_D * 14 - sg)));
      if (T > T_RET) k = 0;
      return k * (1 - .8 * XR);
    }
    case 6: return T > TX && T < TX + 14 ? .3 * Math.exp(-(T - TX) / 5) : 0;
    case 7: { let k = ss(CH1 - 1, TF, T) * .7 * (1 - ss(TX, TX + 1, T)); k = Math.max(k, 2 * flash(T, TX, 2.2)); if (T > IRIS[0] && T < IRIS[1] + .6) k = Math.max(k, .45 * (1 - E.sat((T - IRIS[1]) / .6))); return k; }
    case 8: { if (q === 0 && T > BLK_C[1] && T < TX) return .25 + .4 * chg(T) + 1.2 * flash(T, BLK_C[1], 3); return -.45; }
    case 9: return Math.max(1.4 * flash(T, BLK_C[1], 2.6), .35 * chg(T), q === 1 && T > BLK_O[0] && T < BLK_C[1] ? .2 : 0);
  }
  return 0;
};
/* status lights: level (the colour turns lime while the coils are charged) */
const lightLv = (T, q) => {
  if (q >= 200) q = (q % 100) * 4 + 40;
  const t0 = T_WAKE + (q % NL) * WAKE_DT; if (T < t0) return 0;
  const a = T - t0, on = a < .05 ? 1.6 : a < .1 ? .3 : 1;
  const blink = q % 5 === 2 ? (Math.floor(T * 1.6 + q * .37) % 2 ? 1 : .25) : 1;
  return on * blink * ST.wake * (1 + .8 * chg(T));
};
const fx = (ch, q) => ch === 3 ? lightLv(FXT, q) : fxFn(ch, q);

/* ---------- power: packets of lime light along the truss into the modules (platform frame paths) ---------- */
function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.dist(pts[i], pts[i - 1])); return { p: pts, cum, L: cum[cum.length - 1] }; }
const PK = [0, 0, 0];
function pathAt(pa, s, Tw, o) {
  const c = pa.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
  const k = E.clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), 0, 1), a = pa.p[i - 1], b = pa.p[i];
  const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k, M = Tw.R, t = Tw.T;
  o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o;
}
function stream(pa, Tw, T, t0, t1, speed, gap, a) {
  if (T < t0 || a < .01) return;
  const head = (T - t0) * speed;
  for (let k = 0; ; k++) {
    const s = head - k * gap; if (s < 0) break;
    if (s > pa.L + .01) continue;
    if (T - s / speed > t1) continue;
    for (let q = 0; q < 7; q++) { const sq = s - q * gap * .045; if (sq < 0) break; pathAt(pa, sq, Tw, PK); K.dotW(PK[0], PK[1], PK[2], q ? 1 : 2, q ? LIME : HOT, a * (1 - q / 7)); }
    pathAt(pa, s, Tw, PK); K.glowW(PK[0], PK[1], PK[2], 9, LIME, .3 * a);
  }
}
const P_TRUSS = [1, -1].map(s => mkPath([[s * 152, 0, P.XZ], [s * 9, 0, P.XZ], [s * 3, 0, P.XZ]]));
const P_MODS = P.MODS.map(([x, y]) => mkPath([[Math.sign(x) * 4, 0, P.XZ], [Math.sign(x) * 6.4, Math.sign(y) * 6.4, P.XZ], [x * .8, y * .8, P.XZ], [x * .8, y * .8, -14]]));
const P_FEED = mkPath([[0, -1.72, -14], [0, -1.72, 0], [0, -1.72, 250]]);
function drawPower(T, Tw) {
  if (T < T_FLOW - .2 || T > TX + 1) return;
  const a = 1 - ss(TF, TX, T);
  for (let s = 0; s < 2; s++) stream(P_TRUSS[s], Tw, T, T_FLOW + s * .2, CAPW[1], 26, 9, a);
  for (let m = 0; m < 4; m++) stream(P_MODS[m], Tw, T, CAPW[0] + m * .35, CAPW[1] + .3, 9, 4.5, a);
  if (T > CH0 - .2) stream(P_FEED, Tw, T, CH0 - .2, TF, 50, 6, 1);
}

/* ---------- thrusters: puffs of dots out of the RCS quads ---------- */
const PUFF = (() => { const r = rng(3131), A = new Float32Array(160 * 4); for (let i = 0; i < 160; i++) { A[i * 4] = r(); A[i * 4 + 1] = r() - .5; A[i * 4 + 2] = r() - .5; A[i * 4 + 3] = r(); } return A; })();
const QUADS = {
  mz: [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => ({ c: [x * 3.25, y * 3.25, 250.5], n: V.norm([x, y, 0]) })),
  aft: [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => ({ c: [x * 3, y * 3, P.CZ0 - 4], n: [x, y, 0] })),
};
function puff(Tw, c, d, age, sc, dur) {
  if (age < 0 || age > dur + .9) return;
  const on = age < dur, pc = X.ap(Tw, c), dw = X.dir(Tw, d), [U, Wd] = GEO.perp(dw);
  if (on) { K.glowW(pc[0], pc[1], pc[2], Math.round(8 + 10 * sc), HOT, .55); K.dotW(pc[0], pc[1], pc[2], 2, HOT, 1); }
  for (let i = 0; i < 160; i++) {
    const o = i * 4, te = PUFF[o] * dur; if (te > age) continue;
    const a = age - te, s = a * 22 * sc, spread = (.2 + a * 5) * sc;
    const b = (1 - a / .9) * (.45 + .55 * PUFF[o + 3]); if (b < .02) continue;
    K.dotW(pc[0] + dw[0] * s + (U[0] * PUFF[o + 1] + Wd[0] * PUFF[o + 2]) * spread, pc[1] + dw[1] * s + (U[1] * PUFF[o + 1] + Wd[1] * PUFF[o + 2]) * spread, pc[2] + dw[2] * s + (U[2] * PUFF[o + 1] + Wd[2] * PUFF[o + 2]) * spread, 1, a < .15 ? HOT : WH, b);
  }
}
const PUFFS = [
  [SLEW[0], 'mz', [0, 1], [0, 1, 0], .5], [SLEW[0], 'aft', [2], [0, -1, 0], .5], [SLEW[1] - .7, 'mz', [2, 3], [0, -1, 0], .5], [SLEW[1] - .7, 'aft', [3], [0, 1, 0], .5],
  [SLEW_B[0], 'mz', [2, 3], [0, -1, 0], .5], [SLEW_B[1] - .7, 'mz', [0, 1], [0, 1, 0], .5],
];
function drawPuffs(T, Tw) {
  for (const [t0, set, idx, dirN, dur] of PUFFS) { const age = T - t0; if (age < 0 || age > dur + 1) continue; for (const i of idx) { const q = QUADS[set][i]; puff(Tw, V.mad(q.c, q.n, 1.1), V.norm(V.add(q.n, V.mul(dirN, .4))), age, 1, dur); } }
  // the recoil brake: the aft quads fire back along the bore, hard
  const ab = T - TX; if (ab > 0 && ab < T_BRK + 1) for (const q of QUADS.aft) puff(Tw, V.mad(q.c, [0, 0, -1], .6), [0, 0, -1], ab % 1.2, 2.6, .9);
}

/* ---------- camera ---------- */
const LK = (t, e, g, fov) => ({ t, eye: e, target: g, fov });
const P0 = (t, e, g, fov) => LK(t, PW0(e), PW0(g), fov);
const P1 = (t, e, g, fov) => LK(t, PW1(e), PW1(g), fov);
// the opening (and the loop's end): the whole platform from above, the Earth under it, the limb high in the frame
const OPEN = P0(0, [-212, 196, 270], [-8, -24, 32], 42);
const PATH_A = FILM.path([
  OPEN,
  P0(3.6, [-196, 182, 250], [-10, -24, 28], 42),
  P0(7.2, [-150, 70, 150], [-36, -26, 0], 46),
  P0(10.6, [-112, -24, 76], [-50, -40, -24], 50),
  P0(13.8, [-122, -44, 44], [-52, -40, -24], 50),
  P0(16.4, [-92, 30, 92], [-130, -4, -24], 54),
  P0(19.6, [-84, 34, 70], [-134, 0, -30], 54),
  P0(22.6, [-100, 30, 22], [-136, 0, -40], 52),
  P0(24.8, [-66, 26, 4], [-14, 2, -26], 52),
  P0(27.8, [-42, 24, -2], [-4, 4, -27], 50),
  P0(30.6, [-28, 25, 0], [2, 4, -28], 52),
  P0(31.9, [-34, -12, 6], [-4, -3, -26], 50),
  P0(33.4, [27, -7, -34], [0, -2.2, -30], 40),
  P0(35.2, [26, -6.5, -31], [0, -2, -27], 40),
  P0(37.6, [25, -6, -24], [0, -1.4, -19], 40),
  P0(39.4, [24, -6, -19], [0, -1, -14], 38),
  P0(40.4, [30, -9, -18], [0, -1, -10], 42),
]);
// the slew, watched from a point fixed above and behind the platform, the Earth under it
const EYE_SL = V.add(SAT, V.add(V.mul(EY, 270), V.add(V.mul(EZ, -185), V.mul(EX, -80))));
const camSlew = T => ({ eye: EYE_SL, target: V.lerp(X.ap(PLAT.W, [0, -10, 70]), SAT, .3), fov: 48 * DEG });
// the charge, in the aimed frame: the iris, then a ride along the barrel with the wave
const PATH_C = FILM.path([
  P1(IRIS[0] - .6, [24, 14, 280], [0, 0, 252], 42),
  P1(IRIS[1] + .2, [15, 9, 270], [0, 0, 252], 40),
  P1(CH0 + .1, [13, 8, 266], [0, 0, 251], 40),
]);
function camCharge(T) { const zf = zWave(T), z = Math.min(zf - 14, 196); return { eye: PW1([7.5 + .03 * z, 4.6 + .02 * z, z]), target: PW1([0, -.5, z + 46]), fov: 58 * DEG }; }
// the shot: side on to the last 80 m of the barrel, the space in front of the muzzle
const FIRE_EYE = PW1([54, 19, 214]), FIRE_TG = PW1([0, -2, 274]);
const camFire = T => ({ eye: FIRE_EYE, target: FIRE_TG, fov: 48 * DEG });
// the ride: over the barrel's shoulder and up over the muzzle as the rod leaves (the platform big, the limb and the
// cloud deck under it), a dive along the line to catch the rod, behind it looking down at the Earth, out to its side
// through the entry (the limb below, the plasma trail streaming back), behind it again as the coast rushes up, then
// brakes at ~3 km
const SIDE = V.norm(V.cross(DIRP, EY)), UPD = V.norm(V.cross(SIDE, DIRP));
/* blend two look points by direction (so a near and a far point mix evenly) */
function lookMix(eye, a, b, w) { const da = V.norm(V.sub(a, eye)), db = V.norm(V.sub(b, eye)); return V.mad(eye, V.norm(V.lerp(da, db, w)), 100); }
// the exit (x1/20): over the barrel's shoulder as the rod leaves (the petals and rings spreading, the Earth under it),
// then up over the muzzle as the iris closes behind it; the camera rides the recoil at 70 %; then it dives after the
// rod along its line and catches it
const T_GO = TX + .2, T_EX = TX + 2.6, T_ON = TX + 4.8;
const Z1 = X.dir(W1, [0, 0, 1]);
const PATH_X = FILM.path([
  P1(T_GO, [54, 19, 214], [0, -2, 274], 48),
  P1(TX + 1.1, [30, 24, 227], [0, -10, 292], 50),
  P1(TX + 1.9, [16, 30, 254], [0, 9, 256], 50),
  P1(T_EX, [8, 34, 258], [0, 10, 262], 50),
]);
function camExit(T) { const c = PATH_X(T), o = -.7 * ss(T_GO, TX + 1.2, T) * recoilD(T); return { eye: V.mad(c.eye, Z1, o), target: V.mad(c.target, Z1, o), fov: c.fov }; }
const EX_END = camExit(T_EX);
// rod-relative offsets (along, side, up)
const RIDE = [
  [T_ON, [-10, 3.4, 2.6]], [65.4, [-11, 3.8, 2.8]], [67.0, [3, 21, 1.5]], [71.0, [2, 19, 2]], [72.4, [-26, 5, 7]], [73.3, [-30, 4, 8]],
];
function rideOff(T) {
  if (T <= RIDE[0][0]) return RIDE[0][1];
  let i = 0; while (i < RIDE.length - 2 && RIDE[i + 1][0] <= T) i++;
  const [t0, a] = RIDE[i], [t1, b] = RIDE[i + 1], u = kk(T, t0, t1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
const T_BRAKE = 73.3;
const tcOf = T => T < T_BRAKE ? T : T_BRAKE + .5 * (1 - Math.exp(-(T - T_BRAKE) / .5));
function camRide(T) {
  const Tc = tcOf(T), p = rodAt(Tc), o = rideOff(Math.min(T, T_BRAKE)), br = ss(T_BRAKE - .1, T_BRAKE + 1.2, T);
  let eye = V.add(V.mad(p, DIRP, o[0]), V.add(V.mul(SIDE, o[1] + 500 * br), V.mul(UPD, o[2] + 420 * br)));
  const pr = rodAt(T);
  if (T < T_EX) return camExit(T);
  if (T < T_ON) {
    // the dive: from over the muzzle to the chase point, a fraction h of the way out to the rod; offsets blend
    const u = (T - T_EX) / (T_ON - T_EX), h = ss(0, .72, u), w = ss(.05, 1, u);
    const base = V.lerp(MZ0, pr, h), offA = V.sub(EX_END.eye, MZ0);
    const offR = V.add(V.mul(DIRP, RIDE[0][1][0]), V.add(V.mul(SIDE, RIDE[0][1][1]), V.mul(UPD, RIDE[0][1][2])));
    eye = V.add(base, V.add(V.mul(offA, 1 - w), V.mul(offR, w)));
    const tg = lookMix(eye, V.add(eye, V.sub(EX_END.target, EX_END.eye)), lookMix(eye, V.mad(pr, DIRP, 3000), V.mad(pr, DIRP, 3), .3), ss(0, .45, u));
    return { eye, target: tg, fov: (50 + 2 * u - 18 * Math.sin(PI * u) ** 2) * DEG };
  }
  // looks: ahead down the path, the rod from the side, down to the strike
  const atRod = V.mad(pr, DIRP, 1), ahead = lookMix(eye, V.mad(pr, DIRP, 3000), V.mad(pr, DIRP, 3), .3);
  const wS = ss(65.4, 67.0, T), wD = ss(71.0, 72.4, T);
  let tg = ahead;
  tg = lookMix(eye, tg, atRod, wS);
  tg = lookMix(eye, tg, V.lerp(V.mad(pr, DIRP, 2000), HIT, br), wD * (.62 + .38 * br));
  return { eye, target: tg, fov: E.mix(52, 46, wS * (1 - wD)) * DEG };
}
// over the coast: the strike from where the camera stopped, then down to the ground camera
const UPH = V.norm(V.sub(HIT, CE));
const TOG = V.norm([-HD_[0], 0, -HD_[2]]), SIDEG = V.norm([HD_[2], 0, -HD_[0]]);
const E_K = camRide(TI + .3).eye;
function camStrike(T) {
  const u = kk(T, TI + 1.0, TI + 7.6), a = Math.max(0, aOf(T));
  const eye = T < TI + 1.0 ? camRide(T).eye : V.lerp(E_K, GCAM, u);
  const tg = V.lerp(HIT, V.add(HIT, V.mul(UPH, 80 + FX.capH(a) * .5)), u);
  return { eye, target: tg, fov: E.mix(50, 36, u) * DEG };
}
function camGround(T) {
  const a = Math.max(0, aOf(T)), u = ss(TI + 7.6, T_RET + 1, T);
  const eye = V.add(GCAM, V.add(V.mul(UPH, 20 * u), V.mul(V.norm(V.sub(HIT, GCAM)), 300 * u)));
  return { eye, target: V.add(HIT, V.mul(UPH, 80 + FX.capH(a) * .5 + 30 * u)), fov: 36 * DEG };
}
// the climb back: up past the cap, up the trail looking down at the column, then in to the platform and round
// it into the opening
const T_UP = 89.4, T_APP = 93.4, T_ARRIVE = 97.4, ALONG = V.norm(V.sub(SAT, HIT)), SIDEA = V.norm(V.cross(ALONG, EY)), UPA = V.norm(V.cross(SIDEA, ALONG));
const LSAT = V.dist(HIT, SAT);
const E_CAP = V.add(HIT, V.add(V.mul(UPH, 1700), V.add(V.mul(TOG, 1500), V.mul(SIDEG, 900))));
const E_END = PW0([-300, 236, 400]), C_END = PW0([-8, -24, 32]);
function camTrail(T) {
  const u = kk(T, T_UP, T_APP + .6), h = K.logMix(2600, LSAT - 120000, u);
  const lat = 900 + h * .3;
  const p = V.add(V.mad(HIT, ALONG, h), V.add(V.mul(SIDEA, lat), V.mul(UPA, -lat * .3)));
  const down = V.mad(HIT, ALONG, h * (.18 + .3 * u));
  return { eye: p, target: down, fov: 42 * DEG };
}
const TR0 = camTrail(T_APP), DIR0 = V.norm(V.sub(TR0.eye, SAT)), DA0 = V.dist(TR0.eye, SAT), DIR1 = V.norm(V.sub(E_END, SAT)), DA1 = V.dist(E_END, SAT);
function camApproach(T) {
  const x = E.sat((T - T_APP) / (T_ARRIVE - T_APP)), u = 1 - Math.pow(1 - x, 2.6), w = ss(T_APP, T_APP + 2.4, T);
  const dir = V.norm(V.lerp(DIR0, DIR1, w)), D = K.logMix(DA0, DA1, u);
  const eye = V.mad(SAT, dir, D);
  return { eye, target: lookMix(eye, TR0.target, C_END, kk(T, T_APP + .2, T_APP + 2.0)), fov: E.mix(42, 40, u) * DEG };
}
function camReturn(T) {
  if (T < T_UP) {
    const u = kk(T, T_RET, T_UP), a = Math.max(0, aOf(T)), g = camGround(T);
    const cap = V.add(HIT, V.mul(UPH, FX.capH(a) * .8));
    return { eye: V.lerp(g.eye, E_CAP, u), target: V.lerp(g.target, cap, u), fov: E.mix(36, 40, u) * DEG };
  }
  if (T < T_UP + 1) { const w = ss(T_UP, T_UP + 1, T), a = Math.max(0, aOf(T)); const c = camTrail(T); return { eye: c.eye, target: V.lerp(V.add(HIT, V.mul(UPH, FX.capH(a) * .8)), c.target, w), fov: c.fov }; }
  if (T < T_APP) return camTrail(T);
  return camApproach(T);
}
const OPEN_END = T => ({ eye: OPEN.eye, target: OPEN.target, fov: OPEN.fov * DEG });
const DBGCAM = (() => { const q = STAGE.Q.get('cam'); return q ? q.split(',').map(Number) : null; })();
function camAt(T) {
  if (DBGCAM) { const f = T > SLEW[1] && T < SLEW_B[0] ? PW1 : PW0; return { eye: f(DBGCAM.slice(0, 3)), target: f(DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 40) * DEG }; }
  if (T < 40.4) return PATH_A(T);
  if (T < 41.8) return K.blendShot(PATH_A(T), camSlew(T), kk(T, 40.4, 41.8));
  if (T < 47.0) return camSlew(T);
  if (T < 47.8) return K.blendShot(camSlew(T), PATH_C(T), kk(T, 47.0, 47.8));
  if (T < CH0 + .1) return PATH_C(T);
  if (T < CH0 + .9) return K.blendShot(PATH_C(T), camCharge(T), ss(CH0 + .1, CH0 + .9, T));
  if (T < CH1 + .1) return camCharge(T);
  if (T < TF - .1) return K.blendShot(camCharge(T), camFire(T), kk(T, CH1 + .1, TF - .1));
  if (T < T_GO) return camFire(T);
  if (T < TI + 1.0) return camRide(T);
  if (T < TI + 7.6) return camStrike(T);
  if (T < T_RET) return camGround(T);
  if (T < T_ARRIVE - .4) return camReturn(T);
  return K.blendShot(camReturn(Math.min(T, T_ARRIVE)), OPEN_END(T), kk(T, T_ARRIVE - .4, DUR - .3));
}

/* ---------- clocks: the rate on screen ---------- */
const RATES = [[0, 1], [7.4, 1], [8.0, 8], [24.4, 8], [24.8, 20000], [32.6, 20000], [33.0, 2], [40.6, 2], [41.0, 20], [47.2, 20], [47.6, 1]];
const rateA = T => { let r = 1; for (const [t, v] of RATES) if (T >= t) r = v; return r; };
const rateOf = T => T < TF ? rateA(T) : T < TX ? RATE_TR : T < TI ? fallRate(T) : T < T_RET ? strikeRate(T) : 30;
const SIMW = (() => { const N = 2000, A = new Float64Array(N + 1); for (let i = 1; i <= N; i++) { const t = (i - .5) / N * DUR; A[i] = A[i - 1] + rateOf(t) * DUR / N; } return A; })();
const simAt = T => { const x = E.clamp(T / DUR, 0, 1) * 2000, k = Math.min(1999, Math.floor(x)); return SIMW[k] + (SIMW[k + 1] - SIMW[k]) * (x - k); };
const SIM_TF = simAt(TF);
const simClock = T => T < TF ? simAt(T) - SIM_TF : T < TX ? (T - TF) * RATE_TR : T < TI ? TR_D * RATE_TR + tauOf(T) : TR_D * RATE_TR + TAU_END + aOf(T) + (T > T_RET ? (T - T_RET) * 30 : 0);
const SEAT = T => T * .8;

/* ---------- tags ---------- */
const PTAGS = [
  ['01', 'RADIATOR · 8 PANELS', '60 M', Q => Q.rads[1][3], [0, -3.75, 6.5], 10.2, 14.0],
  ['02', 'ROBOTIC ARM', '52 M', Q => Q.armEl, [0, 1, 0], 14.4, 16.0],
  ['03', 'ALPHA JOINT', '', Q => Q.out[1], [0, 6.2, 0], 16.6, 18.6],
  ['04', 'SOLAR WING · 2 BLANKETS', '98 M', Q => Q.wings[5], [7.4, 0, 60], 18.8, 21.4],
  ['05', 'BETA GIMBAL', '', Q => Q.wings[4], [0, 2.2, 7], 21.6, 23.0],
  ['06', 'POWER TRUSS', '336 M', Q => Q.W, [-30, 4.5, -19.5], 24.8, 26.6],
  ['07', 'CAPACITOR MODULE ×4', '', Q => Q.W, [-10.6, 14.2, -26], 27.4, 30.2],
  ['08', 'DOCKING NODE', '', Q => Q.W, [0, 19.7, -30], 30.4, 32.0],
  ['09', 'MAGAZINE · 6 RODS', '6 M', Q => Q.drum, [0, 2.5, -32], 33.4, 35.2],
  ['10', 'RAMMER · 3 STAGES', '', Q => Q.ram[2], [0, .5, 9], 35.4, 37.6],
  ['11', 'BREECH BLOCK', 'LOCKED', Q => Q.block, [1.7, 1.7, -15.2], 39.4, 40.9],
  ['12', 'MUZZLE IRIS · 6 PETALS', '', Q => Q.W, [0, 3.4, 253], 47.8, 48.9],
  ['13', 'COILS ×250', '', Q => Q.W, [0, 1.4, 60], 49.6, 51.6],
  ['14', 'RAILS ×2', '250 M', Q => Q.W, [0, .72, 120], 51.8, 53.6],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
function partTags(T, PP) {
  for (const t of PTAGS) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const p = X.ap(t.fr(PP), t.at); if (!K.pj(p[0], p[1], p[2]) || !K.onS(-40)) continue;
    const x = K.PJ[0], y = K.PJ[1], dx = x > 1100 ? 54 : -54, lx = x + dx;
    K.leader(x, y, lx, y - 50, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    const w = K.tagW(t.tg);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .7), T, +t.id), t.val, 'lime sm', dx > 0 ? lx + 4 : lx - 4 - w, y - 62, a);
  }
}
const T_PLAT = K.mkTag(), T_ROD = K.mkTag(), T_SITE = K.mkTag();
const VTAGS = W.VEHS.map(() => K.mkTag());
/* the platform's screen box from its real extremities in this pose (wing tips, radiators, muzzle, masts) */
const XP = [];
function platBox(PP, pad) {
  XP.length = 0;
  const W_ = PP.W; XP.push(X.ap(W_, [0, 0, Z_MZ + 1]), X.ap(W_, [0, 0, P.CZ0 - 9]), X.ap(W_, [168, 0, P.XZ]), X.ap(W_, [-168, 0, P.XZ]));
  for (const t of P.MAST_TIPS) XP.push(X.ap(W_, t));
  for (const Wg of PP.wings) for (const sx of [-7.7, 7.7]) XP.push(X.ap(Wg, [sx, 0, P.WR1 + 1.4]));
  for (const rp of PP.rads) for (const sz of [-6.5, 6.5]) XP.push(X.ap(rp[7], [0, -P.RPH, sz]));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of XP) { if (!K.pj(p[0], p[1], p[2])) return null; x0 = Math.min(x0, K.PJ[0]); y0 = Math.min(y0, K.PJ[1]); x1 = Math.max(x1, K.PJ[0]); y1 = Math.max(y1, K.PJ[1]); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
function markTags(T, Wt, PP) {
  if (PP && (T < 7.4 || (T > 41.2 && T < 47.0) || T > 97.4)) {
    const a0 = T < 7.4 ? 1 - ss(6.6, 7.4, T) : T > 97.4 ? ss(97.6, 98.6, T) : ss(41.4, 42, T) * (1 - ss(46.4, 47, T));
    const lab = T < 7.4 || T > 97 ? 'RAILGUN PLATFORM' : 'SLEWING', val = `${Math.round(ALT / 1000)} KM`;
    const b = platBox(PP, 8), px = b ? Math.max(b[2] - b[0], b[3] - b[1]) : 1e9;
    // small enough on screen: a bracket round it; too big: a short label on a leader from the core
    const wb = b && b[1] > 70 ? 1 - ss(1050, 1350, px) : 0;
    if (a0 * wb > .01) { K.bracket(b, '#C6F432', .8 * a0 * wb, 14, 1.2); K.setTag(T_PLAT, 'SAT', lab, val, 'lime sm', b[0], b[1] - 26, a0 * wb); }
    else if (a0 > .01) {
      const c = X.ap(Wt, [0, P.CH + 1, P.XZ]);
      if (K.pj(c[0], c[1], c[2]) && K.onS(-40)) {
        const x = K.PJ[0], y = K.PJ[1], dx = x > 1300 ? -70 : 70, w = K.tagW(T_PLAT);
        K.leader(x, y, x + dx, y - 74, '#C6F432', .85 * a0); K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a0);
        K.setTag(T_PLAT, 'SAT', lab, val, 'lime sm', dx > 0 ? x + dx + 4 : x + dx - 4 - w, y - 88, a0);
      }
    }
  }
  if (T > T_ON - .6 && T < TI - .3) {
    const p = rodAt(T);
    if (K.pj(p[0], p[1], p[2]) && K.onS(-40)) { const a = ss(T_ON - .6, T_ON - .1, T) * (1 - ss(TI - .9, TI - .3, T)); K.leader(K.PJ[0], K.PJ[1], K.PJ[0] + 40, K.PJ[1] - 44, '#C6F432', .8 * a); K.setTag(T_ROD, 'ROD', `ALT ${(altOf(p) / 1000).toFixed(1)} KM`, `${(vAt(sOf(T)) / 1000).toFixed(2)} KM/S`, 'lime sm', K.PJ[0] + 44, K.PJ[1] - 58, a); }
  }
  // the battery below, in coral, before the strike
  if (T > 70.2 && T < TI + .1) {
    const a = ss(70.4, 71, T) * (1 - ss(TI - .15, TI + .05, T));
    W.VEHS.forEach((v, i) => {
      if (i > 3) return;
      const b = K.boxOf([-3, 0, -6], [3, 4, 6], v.W, 2); if (!b) return;
      K.setTag(VTAGS[i], v.chip, '', '', 'coral sm', b[2] + 4, b[1] - 18, a * .95);
    });
    if (K.pj(HIT[0], HIT[1] + 30, HIT[2]) && K.onS(-40)) { const x = K.PJ[0], y = K.PJ[1]; K.leader(x, y, x - 60, y - 60, '#FF6A3D', .8 * a); K.setTag(T_SITE, 'SITE', 'COASTAL BATTERY', '', 'coral sm', x - 64 - K.tagW(T_SITE), y - 72, a); }
  }
}

/* ---------- readout ---------- */
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
const fmtRate = r => r >= 1000 ? `<span class="l">×${Math.round(r / 1000)}k</span>` : r > 1.5 ? `<span class="l">×${Math.round(r)}</span>` : r < .5 ? `<span class="l">×1/${Math.round(1 / r)}</span>` : '×1';
function readout(T) {
  const ci = CHAPTERS.reduce((a, c, i) => c.t <= T ? i : a, 0);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${CHAPTERS[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2;
  if (T < T_WAKE) { l1 = `Orbit · <b>${km(ALT)} km</b> · <b>7.68 km/s</b>`; l2 = 'Platform <b>parked</b>'; }
  else if (T < RADW[0][0]) { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = `Status <b>${Math.min(NL, Math.max(0, Math.floor((T - T_WAKE) / WAKE_DT)))}/${NL}</b>`; }
  else if (T < ALW[0]) { l1 = `Radiators · <b>${Math.round(ST.rad.reduce((a, b) => a + b, 0) / 4 * 100)} %</b>`; l2 = `Arm <b>${T < ARMW[0] ? 'stowed' : T < ARMW[1] ? 'unfolding' : 'free'}</b> · 52 m`; }
  else if (T < T_FLOW - .3) { l1 = 'Wings · <b>8 × 98 m</b>'; l2 = T < BEW[1] ? `Alpha <b>${(Math.abs(ST.alpha[0]) / DEG).toFixed(0)}°</b> · beta <b>${(Math.abs(ST.beta[0]) / DEG).toFixed(0)}°</b>` : 'Sun lock <b>8/8</b> · <b>3.0 MW</b>'; }
  else if (T < BLK_O[0] - .2) { const e = E.sat((T - CAPW[0]) / (CAPW[1] - CAPW[0])); l1 = `Capacitors · <b>${Math.round(e * 100)} %</b>`; l2 = 'Arrays · <b>3.0 MW</b> in'; }
  else if (T < SLEW[0] - .3) { l1 = T < RAMW[0] ? 'Magazine · <b>6 rods</b> · index' : T < BLK_C[0] ? `Rammer · <b>${Math.round(ST.ram / RAM_EXT * 100)} %</b>` : `Breech · <b>${T > BLK_C[1] ? 'locked' : 'closing'}</b>`; l2 = `Rod · <b>6.0 m</b> · <b>22.7 t</b> · ${ST.rodOn ? 'chambered' : 'in magazine'}`; }
  else if (T < IRIS[0] - .2) { const togo = Math.acos(E.clamp(V.dot(X.dir(PLAT.W, [0, 0, 1]), AIM), -1, 1)) / DEG; l1 = `Slew · <b>${togo.toFixed(0)}°</b> to go`; l2 = `Target · <b>${km(V.dist(SAT, HIT))} km</b> slant`; }
  else if (T < TF) { const n = Math.round(zWave(T)); l1 = T < CH0 ? `Iris · <b>${Math.round(ST.iris * 100)} %</b>` : `Coils · <b>${n}/250</b>`; l2 = `Capacitors <b>100 %</b> · fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>`; }
  else if (T < TX) { const z = rodZof(T) - Z_CH, u = (T - TF) / TR_D; l1 = `Rod · <b>${z.toFixed(0)} m</b> of ${BLEN.toFixed(0)}`; l2 = `<b>${(V_MZ * u / 1000).toFixed(2)} km/s</b> · +<b>${((T - TF) * RATE_TR * 1000).toFixed(0)} ms</b>`; }
  else if (T < T_ON - .6) { l1 = `Muzzle · <b>${(V_MZ / 1000).toFixed(2)} km/s</b>`; l2 = `Recoil · <b>${V_REC} m/s</b> · braking`; }
  else if (T < TI) { const p = rodAt(T), h = altOf(p); l1 = `Rod · alt <b>${km(h)} km</b>`; l2 = `<b>${(vAt(sOf(T)) / 1000).toFixed(2)} km/s</b> · ${h < 100000 ? 'entry' : 'coast'}`; }
  else if (T < T_RET) { const a = aOf(T); l1 = `Impact · <b>${(vAt(L0) / 1000).toFixed(2)} km/s</b>`; l2 = a < 4 ? `Shock · <b>${Math.round(FX.shockR(a))} m</b>` : `Column · <b>${(FX.capH(a) / 1000).toFixed(2)} km</b>`; }
  else { l1 = `Platform · <b>${km(ALT)} km</b>`; l2 = T < 94 ? 'Slew · <b>park</b>' : 'Stowing'; }
  const sc = simClock(T), sg = sc < 0 ? '−' : '+', a = Math.abs(sc);
  const l3 = `T${sg}${String(Math.floor(a / 60)).padStart(2, '0')}:${(a % 60).toFixed(1).padStart(4, '0')} · ${fmtRate(rateOf(T))}`;
  const html = `${l1}<br>${l2}<br>${l3}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const PROF = STAGE.Q.has('prof') ? {} : null; let PT = 0;
function prof(n) { const t = performance.now(); if (n) PROF[n] = (PROF[n] || 0) + t - PT; PT = t; }
let NDOT = 0;
const DO = { L: L_SUN, fx, occ: true, keep: 1, a: 1 }, DOX = { L: L_SUN, fx, occ: true, keep: 1, a: 1, lime: 0 };
function render(T) {
  if (PROF) prof(null);
  K.beginTags();
  FXT = T;
  const Wt = platXf(T), st = stateAt(T);
  FILM.apply(C, camAt(T));
  const ax = T - TX, a = aOf(T);
  C.shake = ax > 0 && ax < 1.4 ? FILM.shake(T, 7 * (1 - ax / 1.4), 26) : T > TF && T < TX ? FILM.shake(T, 1.6, 34) : a > 0 && a < 3 ? FILM.shake(T, 9 * (1 - a / 3), 22) : [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? .08 : .1; C.update();
  K.pb.clear(); K.occReset();
  const dPlat = V.dist(C.eye, Wt.T);
  // the busiest close shots (modules, loader) a little coarser to hold the frame time
  const dens = 1 + .18 * ss(24.0, 25.4, T) * (1 - ss(40.4, 41.4, T)) + .08 * ss(25.4, 26.8, T) * (1 - ss(32.0, 33.4, T));
  ORL.frame({ zref: Math.max(60, V.dist(C.eye, C.target)), PXF: 3.4 * dens, PXL: 1.5 * (1 + (dens - 1) * .6) });
  W.LG.zref = Math.max(500, V.dist(C.eye, C.target));
  if (PROF) prof('setup');
  const PP = dPlat < 40000 ? P.pose(Wt, st) : null;
  if (PROF) prof('pose');
  const xr = kk(T, 32.4, 33.4) * (1 - kk(T, 40.0, 41.0)); XR = xr;
  if (PP && dPlat < 6000 && xr < .5) { P.occlude(PP); ORL.G.occ = true; } else ORL.G.occ = false;
  if (PROF) prof('occlude');
  K.drawStars(W.STARS, .9 * (1 - ss(20000, 3000, alt)), T);
  if (PROF) prof('stars');
  let n = 0;
  n += W.drawGlobe(1, dens);
  if (PROF) prof('globe');
  W.drawLimb(1);
  if (PROF) prof('limb');
  // the coast
  if (alt < 120000) {
    const SH = W.SH;
    if (a > 0) { SH.x = HIT[0]; SH.z = HIT[2]; SH.r1 = 9000; SH.r0 = FX.shockR(a); SH.wd = 40 + 10 * a; SH.k = 1.2 * Math.exp(-a / 7) * (1 - ss(14, 20, a)); SH.col = a < 1.5 ? HOT : LIME; SH.glow = 1.8 * Math.exp(-a * 1.1); SH.gr = 1400; SH.hole = 40; SH.dark = .7; SH.dr = 260; }
    else SH.r1 = -1;
    // (the dim ground of the overhead strike shots a touch coarser, to hold the frame time with the dust on top)
    n += W.drawSite(1 - ss(60000, 120000, alt), SEAT(T), 3.4 * (1 + 1.2 * (a >= 0 ? FX.flashA(a) : 0)) * (1 + .15 * ss(TI - .2, TI + .4, T) * (1 - ss(TI + 4.6, TI + 6.4, T))));
    if (alt < 60000) W.drawVehicles(v => a > 0 && FX.shockR(a) > v.d);
  }
  if (PROF) prof('ground');
  if (PP) {
    DO.lc = chg(T) > .3 ? LIME : [255, 255, 255];
    DO.keep = 1 - .85 * xr; DO.a = 1 - .62 * xr; DOX.lime = .5 * xr; DOX.a = 1 + .35 * xr; DOX.lc = DO.lc;
    P.draw(PP, st, DO, DOX);
    if (PROF) prof('platform');
    drawPower(T, Wt); drawPuffs(T, Wt);
    if (T > TF && T < TX) FX.bore(Wt.T, X.dir(Wt, [0, 0, 1]), Math.max(Z_CH, rodZof(T) - 60), rodZof(T) - 3, T);
    if (ax > -.05 && ax < 4.2) { const m = X.ap(Wt, [0, 0, Z_MZ]); FX.shot(m, X.dir(Wt, [0, 0, 1]), X.dir(Wt, [1, 0, 0]), X.dir(Wt, [0, 1, 0]), ax, 1); }
  }
  // the rod in flight
  if (T > TX && T < TI) {
    const p = rodAt(T), h = altOf(p), heat = ss(110000, 40000, h), dc = V.dist(C.eye, p);
    if (dc < 4000) ORL.draw(P.rods[0], X.make(R.look(DIRP, EY), p), { L: L_SUN, a: 1.6, fx: () => heat > .05 ? 1 + heat : 0 });
    FX.sheath(p, DIRP, PXP, PYP, heat, T);
    if (dc < 3000) FX.petals(p, DIRP, PXP, PYP, T - TX, 1);
  }
  if (T > TX) FX.trail(FALL, T, T < T_RET ? 1 : 1 - .6 * ss(T_RET, DUR - 2, T));
  if (a >= 0) {
    FX.strike(a, 1);
    for (const v of W.VEHS) { const ts = a - (v.d - 20) / 900; if (ts > 0 && ts < 8 && FX.shockR(a) > v.d) FX.debris(v.c, ts, 1); }
  }
  if (PROF) prof('fx');
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (ax > 0 && ax < .6) fl = .18 * Math.exp(-ax * 7);
  if (a >= 0) fl = Math.max(fl, FX.flashA(a));
  if (fl > .004) { octx.fillStyle = `rgba(240,246,226,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (PP && dPlat < 400) partTags(T, PP);
  markTags(T, Wt, PP);
  if (PROF) prof('overlay');
  readout(T);
  K.pb.blit();
  if (PROF) prof('blit');
  K.endTags();
  NDOT = ORL.G.dots + n;
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const clunk = () => { SFX.tone(110, 60, .25, 'square', .03); SFX.noise(.22, 500, 1, .04, .005); };
const tick = () => SFX.tone(1650, 1650, .05, 'square', .012);
const whir = d => SFX.tone(80, 140, d, 'sawtooth', .008);
const cues = [
  [T_WAKE, () => SFX.tone(220, 880, 1.2, 'sine', .012)], ...[0, 1, 2, 3, 4].map(k => [T_WAKE + .3 + k * .5, tick]),
  ...RADW.map(w => [w[0], () => whir(w[1] - w[0])]), ...RADW.map(w => [w[1], clunk]),
  [ARMW[0], () => whir(ARMW[1] - ARMW[0])], [ALW[0], () => SFX.tone(60, 90, ALW[1] - ALW[0], 'sawtooth', .01)], [ALW[1], clunk], [BEW[1], clunk],
  [T_PWAVE, () => SFX.tone(400, 1600, 1.4, 'sine', .014)], [CAPW[0], () => SFX.tone(90, 700, CAPW[1] - CAPW[0], 'sawtooth', .009)],
  [BLK_O[1], clunk], [IDX[0], () => whir(1.4)], [IDX[1], clunk], [RAMW[0], () => SFX.tone(140, 240, 2.8, 'sawtooth', .01)], [RAMW[1], clunk], [BLK_C[1], () => { clunk(); tick(); }],
  [SLEW[0], () => SFX.noise(.5, 2000, .6, .02, .1)], [SLEW[0] + .3, () => SFX.noise(5, 260, 1, .014, 1)], [SLEW[1] - .7, () => SFX.noise(.5, 2000, .6, .02, .1)],
  [IRIS[0], () => whir(1.1)], [IRIS[1], clunk], [CH0, () => SFX.tone(110, 1800, CH1 - CH0 + .8, 'sawtooth', .014)],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [CH0 + k * (CH1 - CH0) / 10, () => SFX.tone(900 + 80 * k, 900 + 80 * k, .05, 'square', .01)]),
  [TF, () => { SFX.tone(1400, 300, TR_D, 'sawtooth', .02); }],
  [TX, () => { SFX.crack(); SFX.rumble(3.5, .3); SFX.tone(900, 50, 1.8, 'sine', .07); }],
  [TX + .4, () => SFX.noise(3.2, 400, .8, .02, 1.2)], [TX + 2.6, () => SFX.noise(9, 1400, .5, .02, 4)],
  [66, () => SFX.noise(7, 700, .7, .03, 3)],
  [TI, () => { SFX.crack(); SFX.rumble(7, .4); SFX.tone(70, 30, 4, 'sine', .08); }], [TI + 1.2, () => SFX.rumble(6, .25)],
  [T_RET, () => SFX.tone(300, 900, 3, 'sine', .01)], [94, clunk], [98.2, clunk],
];
lap('load');
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ log: LOG, ndot: NDOT, prof: PROF, stats: P.stats(), by: ORL.G.by, TX, TI, TAU_END, L0, cam: T => camAt(T), W, FX, P, HIT, GCAM, PW0, PW1, platXf, C, rodAt, altOf, sOf, tauOf, aOf, FALL });
})();
