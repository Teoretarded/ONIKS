/* ORBITAL · RAILGUN (Point Cloud). A 1.7 km orbital railgun (pc_orbital_railgun_platform.js), parked 380 km up and
   1.6 km short of its firing station, 230 km down-range of a coastal battery. One take, base 162 s (plus the
   fabrication insert), loops.
     Orbit      dormant and stowed: the barrel folded in a concertina under its first segment, the gyro ring a bundle
                round the spine, the radiator fins closed round the reactor, the lights low.
     Wake       a lime wave runs out from the reactor, the status lights come on.
     Reactor    the thermoelectric core comes up to temperature (x600); twelve accordion radiator fins open round it
                (x8); X-ray: a lime scan plane slices the reactor open: the core's heat, the hot shoe, a row of Seebeck
                couples with the current running round it in series, the cold shoe, the fins' sections.
     Unfold     the barrel unfolds segment by segment (each flip swings the rest of the stack over), the lock jaws
                slide over each joint and the bore sleeves bridge it; the three muzzle stages telescope out (x20).
     Gyro ring  the hoop opens from its bundle (the knees straighten, the cables pay out), latches; current runs
                round it.
     Thrust     the nozzle extensions slide out, a gimbal check, then the four vectored engines push the structure
                1.6 km to its station while they swing it onto the coast; retro pods brake it (x60).
     Calibrate  the laser line: emitter, the hub mirror (and four ring sensors), the housing mirror, the periscope,
                five collar sensors and the crown; the alignment settles to 0.0001 deg (x1).
     Spin-up    the ring spins up to 0.5 rpm (x60).
     Reroute    the rotary switches turn the engines' power to the gun; current floods the barrel's bus.
     Reconfigure the barrel opens in stages (flaps crack, half, full; the pulse cassettes slide out and turn up);
                the magnets energise breech to muzzle.
     Breech     the lock rings release, the block drops: the fabrication insert (window.ORFAB) builds the round.
     Chamber    the block closes, the lock rings slide and turn, the clamps grip, the chamber coils energise.
     Charge     the iris opens, the charge rings light breech to muzzle.
     Fire       the round's 0.4 s in the barrel at x1/20: each ring discharges into it as it passes.
     Fall / Strike  the rod's 84 s fall (16.5 s) and the strike (16.4 s), filmed by FX.cam(T, FC).
     Return     from the strike's last shot over the crater an easy rise, then the climb up the trail to the barrel
                (log-distance, eased at both ends); the flaps close, power goes back to the engines and sensors,
                the ring spins down and folds, the engines swing it back to its park, the barrel refolds, the fins
                close, the lights dim.
   Render is a pure function of film time. ?prof times the passes, ?cam=x,y,z,tx,ty,tz,fov sets a debug camera in the
   platform frame. */
(() => {
const { V, R, X, E, rng } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = ORK; K.setup();
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH, HEAT = ORL.HEAT;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = []; window.ORW_LOG = LOG;
const t0load = performance.now();
const lap = s => LOG.push(`${s} ${(performance.now() - t0load).toFixed(0)} ms`);
const ss = E.ss, kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a))), kb = (T, w) => kk(T, w[0], w[1]);
const flash = (T, t0, k) => { const a = T - t0; return a > 0 && a < 4 ? Math.exp(-a * (k || 6)) : 0; };
const win = (T, a, b, r) => ss(a, a + r, T) * (1 - ss(b - r, b, T));

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- the model (its dimensions set the shot's timing) ---------- */
const P = ORP(ORL);
lap('platform ' + JSON.stringify(P.stats()));
const Z_MZ = P.Z_MZ, Z_CH = P.Z_RND, NB = P.NB, NSEG = P.NSEG, PP_ = P.PP;

/* ---------- time ---------- */
const DUR = 162.0;                     // the base take (the inserts lengthen the film: DURF)
const T_WAKE = 3.0;
const HEATW = [6.2, 8.6], FINW = [8.2, 13.0], XRJ = [12.4, 13.4, 17.6, 18.6], CURW = [13.2, 18.4];
const O_ = .6;                         // (everything after the reactor's sequence shifts by this)
const J0 = 18.6 + O_, JSTEP = 2.6, JDUR = 3.6, JW = j => [J0 + (j - 1) * JSTEP, J0 + (j - 1) * JSTEP + JDUR];
const TELW = [32.0 + O_, 35.0 + O_];
const RINGW = [35.6 + O_, 40.6 + O_], RCUR = [40.8 + O_, 44.4 + O_];
const ENGX = [41.8 + O_, 43.0 + O_], GCHK = [42.9 + O_, 43.8 + O_];
const MOVE = [43.8 + O_, 53.4 + O_], BURN = [44.0 + O_, 48.0 + O_], RETRO = [49.4 + O_, 52.6 + O_], SLEW = [45.0 + O_, 53.2 + O_];
const CAL = [53.8 + O_, 63.0 + O_];
const SPINW = [63.2 + O_, 67.2 + O_];
const SWW = [68.0 + O_, 69.2 + O_], GUNP = [69.2 + O_, 71.6 + O_];
const FLW = [[71.6 + O_, 73.4 + O_], [74.0 + O_, 75.8 + O_], [76.3 + O_, 78.6 + O_]];
const MAGW = [73.0 + O_, 78.8 + O_];
const UNLK = [78.7 + O_, 79.2 + O_], BRO = [79.2 + O_, 80.1 + O_];
const AT_FAB = 80.4 + O_;              // the fabrication insert's splice (base time)
const BRC = [80.6 + O_, 81.6 + O_], LOCKW = [81.7 + O_, 82.7 + O_], CLAMPW = [82.8 + O_, 83.4 + O_], COILW = [83.2 + O_, 84.4 + O_];
const CH0 = 86.4 + O_, CH1 = 91.0 + O_, TF = 92.0 + O_, IRIS = [CH1 - 1.0, TF - .2];
const V_MZ = 5000, BLEN = Z_MZ - Z_CH, RATE_TR = 1 / 20, TR_D = 2 * BLEN / V_MZ / RATE_TR, TX = TF + TR_D;
const TI = TX + 16.5, T_RET = TI + 16.4, T_ARR = T_RET + 9;
const IRIS_B = [TX + 1.3, TX + 2.4], CLAMP_B = [TX + 3, TX + 3.8];
const SPIN_B = [T_RET + .6, T_ARR + 3], PARK_RING = [T_ARR + 3, T_ARR + 3.8];
const FLB = [T_ARR + .3, T_ARR + 3.7], SW_B = [T_ARR + .5, T_ARR + 1.7], MAG_B = [T_ARR + .3, T_ARR + 2.6];
const RING_B = [T_ARR + 3.8, T_ARR + 7.2], TEL_B = [T_ARR + 5.6, T_ARR + 8.0];
const MOVE_B = [T_ARR + 7.6, T_ARR + 16.0], SLEW_B = [T_ARR + 8.0, T_ARR + 15.6], BURN_B = [T_ARR + 7.8, T_ARR + 11], RETRO_B = [T_ARR + 12.4, T_ARR + 15.2];
const JB0 = T_ARR + 8.2, JBSTEP = 1.7, JBDUR = 2.6, JWB = j => [JB0 + (NSEG - 1 - j) * JBSTEP, JB0 + (NSEG - 1 - j) * JBSTEP + JBDUR];
const ENGX_B = [T_ARR + 15.6, T_ARR + 16.8], FIN_B = [T_ARR + 15.0, T_ARR + 18.4], HEAT_B = [T_ARR + 15.5, T_ARR + 19.0];
const LIGHTS_OFF = [T_ARR + 17.2, T_ARR + 19.2];
const CHAPTERS = [
  { t: 0, title: 'Orbit' }, { t: T_WAKE - .2, title: 'Wake' }, { t: HEATW[0] - .2, title: 'Reactor' }, { t: FINW[0] - .2, title: 'Radiators' },
  { t: J0 - .3, title: 'Unfold' }, { t: RINGW[0] - .3, title: 'Gyro ring' }, { t: ENGX[0] - .3, title: 'Thrust' }, { t: CAL[0] - .2, title: 'Calibrate' },
  { t: SPINW[0] - .2, title: 'Spin-up' }, { t: SWW[0] - .6, title: 'Reroute' }, { t: FLW[0][0] - .2, title: 'Reconfigure' }, { t: UNLK[0] - .2, title: 'Breech' },
  { t: AT_FAB + .05, title: 'Chamber' }, { t: COILW[1] + .2, title: 'Charge' }, { t: TF - .3, title: 'Fire' }, { t: TX + 2.2, title: 'Fall' },
  { t: TI - .4, title: 'Strike' }, { t: T_RET, title: 'Return' }, { t: MOVE_B[0] - .3, title: 'Stow' },
];
lap('timeline');

/* ---------- inserted sequences ----------
   Self-contained stretches spliced into the take, each with its own camera and drawing; the base timeline (base time
   T, 0..DUR) holds at the splice while one plays and resumes after it. A module:
     { len, build(ctx), chapters: [{t, title}], cues: [[u, fn]], cam(u, ctx) -> {eye, target, fov rad},
       draw(u, ctx) (after the base scene), hideBase (true: the base scene is not drawn; the module draws its own world),
       readout(u, ctx) -> {l1, l2, rate}, tags(u, ctx) }   (u: s into the insert)
   ctx: { K, L (window.ORL), P (the platform), W (the world), FX, M3, V, R, X, E, LIME, HOT, WH, CORAL, T (film time),
   u, Tb (base time held), Wt (platform -> world), PP (its pose or null), st, camOld (the base camera at the splice),
   tagAt(tg, id, lab, val, worldPos, a, age), SAT, CE, RE, HIT, L_SUN, PW0, PW1, camAt(T),
     BAY(Tb) -> the fabrication bay's frame (bay -> world): origin at the bay's centre, axes the platform's (+Z toward
       the chamber along the bore, +Y the platform's top, +X starboard); the empty interior is BAY_HALF = [28, 22, 36]
       (half extents, m; platform z -116..-44), the floor at y -22, the roof an open grid of beams (it can be filmed
       through), the front wall (z +36) has a 2.3 m port on the bore axis; a 28 m transfer cage runs from it to the open
       breech (block at platform z -15.8..-13.4, dropped 5.6 m while open); a tender is docked on the starboard wall,
     CHAMBER(Tb) -> the chamber's frame (chamber -> world): origin at the seated round's centre on the bore (platform
       z -6), axes the platform's; it sits at CHAMBER_IN_BAY = (0, 0, 74) in the bay's frame. The insert hands the
       finished round over here: nose +Z, centred at the origin. ROUND = { len 8.4 (sabot), r 0.96 (sabot), armature
       0.9 m long behind it, rodLen 6, rodR 0.25, boreR 1.0 }. While the insert plays the breech stands open and the
       base scene draws no round; from the splice on, the base scene draws its own round seated at CHAMBER. }
   The fabrication insert is spliced at base time AT_FAB (ORFAB.at is set to it). */
if (window.ORFAB) ORFAB.at = AT_FAB;
const INS_SPEC = () => STAGE.Q.has('base') ? [] : [{ at: AT_FAB, mod: window.ORFAB }];      // ?base: the base take alone
const INS = [];
let DURF = DUR;
const SEG = { k: -1, u: 0, T: 0 };
function mapIn(TR) {
  let off = 0;
  for (let i = 0; i < INS.length; i++) {
    const q = INS[i];
    if (TR < q.r0) break;
    if (TR < q.r0 + q.len) { SEG.k = i; SEG.u = TR - q.r0; SEG.T = q.at; return SEG; }
    off += q.len;
  }
  SEG.k = -1; SEG.u = 0; SEG.T = TR - off; return SEG;
}
const mapOut = t => { let o = t; for (const q of INS) if (q.at <= t) o += q.len; return o; };

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
const FX = ORFX(K, ORL, W);
lap('fx');

/* ---------- attitude and station: parked (bore along the orbit, 1.6 km short of the station) -> aimed -> parked ---------- */
const Q0 = K.Q.fromR(R.look(EX, EY));
let AIM = V.norm(V.sub(HIT, SAT));
for (let i = 0; i < 3; i++) { const mz = V.mad(SAT, AIM, Z_MZ); AIM = V.norm(V.sub(HIT, mz)); }
const Q1 = K.Q.fromR(R.look(AIM, EY));
const SAT0 = V.mad(SAT, EX, -1600);
const W0 = X.make(K.Q.toR(Q0), SAT0), W1 = X.make(K.Q.toR(Q1), SAT);
const PW0 = p => X.ap(W0, p), PW1 = p => X.ap(W1, p);
const MZ0 = PW1([0, 0, Z_MZ]), DIRP = V.norm(V.sub(HIT, MZ0)), L0 = V.dist(MZ0, HIT);
const [PXP, PYP] = GEO.perp(DIRP);
const L_SUN = V.norm(X.dir(W0, [-.42, .5, .76]));
function shudder(T) { const t = T - TX; return t > 0 && t < 7 ? .0012 * Math.exp(-t / 1.8) * Math.sin(TAU * 1.1 * t) : 0; }
const moveU = T => kb(T, MOVE) * (1 - kb(T, MOVE_B));
const slewU = T => kb(T, SLEW) * (1 - kb(T, SLEW_B));
function platAt(T) {
  const u = slewU(T), m = moveU(T);
  let Rm = u <= 0 ? W0.R : u >= 1 ? W1.R : K.Q.toR(K.Q.slerp(Q0, Q1, u));
  const sh = shudder(T); if (sh) Rm = R.mul(Rm, R.mul(R.x(sh), R.y(sh * .6)));
  return X.make(Rm, m <= 0 ? SAT0 : m >= 1 ? SAT : V.lerp(SAT0, SAT, m));
}
const PLAT = { W: W0 };
const platXf = T => (PLAT.W = platAt(T));

/* ---------- the fall: speed along the line (the muzzle's 5.0 km/s, gravity, the air near the end) ---------- */
const altAt = s => V.dist(V.mad(MZ0, DIRP, s), CE) - RE;
const H0 = altAt(0), G0 = 9.4;
const vAt = s => { const h = altAt(s); return Math.sqrt(V_MZ * V_MZ + 2 * G0 * (H0 - h)) * (1 - .14 * ss(45000, 0, h)); };
const FN = 4000, TAUS = new Float64Array(FN + 1);
for (let i = 1; i <= FN; i++) { const s0 = L0 * (i - 1) / FN, s1 = L0 * i / FN; TAUS[i] = TAUS[i - 1] + (s1 - s0) * .5 * (1 / vAt(s0) + 1 / vAt(s1)); }
const TAU_END = TAUS[FN];
const sOfTau = tau => { if (tau <= 0) return 0; if (tau >= TAU_END) return L0; let lo = 0, hi = FN; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAUS[m] < tau) lo = m; else hi = m; } const k = (tau - TAUS[lo]) / (TAUS[hi] - TAUS[lo]); return L0 * (lo + k) / FN; };
const FD = TI - TX;
/* the exit stays in the barrel's x1/20 for 1.7 s, ramps to x1, then a plateau (solved so the fall fits) */
const T_SLO = 1.7;
const fwSeg = P_ => [{ t: 0, rate: RATE_TR }, { t: T_SLO, rate: RATE_TR }, { t: 2.6, rate: 1 }, { t: 3.2, rate: 1 }, { t: 5.4, rate: P_ }, { t: 10.6, rate: P_ }, { t: 13.6, rate: 2.6 }, { t: FD, rate: 1.2 }];
const FWARP = (() => { let lo = 1, hi = 40; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (FILM.warp(fwSeg(m)).total < TAU_END) lo = m; else hi = m; } return FILM.warp(fwSeg((lo + hi) / 2)); })();
const FWS = TAU_END / FWARP.total;
const tauOf = T => T <= TX ? 0 : T >= TI ? TAU_END : FWARP(T - TX) * FWS;
const fallRate = T => T <= TX || T >= TI ? 1 : FWARP.rate(T - TX) * FWS;
const sOf = T => sOfTau(tauOf(T));
const rodAt = T => V.mad(MZ0, DIRP, sOf(T));
const altOf = p => V.dist(p, CE) - RE;
const TPASS = new Float64Array(801);
{ let t = TX; for (let i = 0; i <= 800; i++) { const s = L0 * i / 800; while (t < TI && sOf(t) < s) t += .002; TPASS[i] = t; } }
const tPassAt = s => { const x = E.clamp(s / L0, 0, 1) * 800, k = Math.min(799, Math.floor(x)); return TPASS[k] + (TPASS[k + 1] - TPASS[k]) * (x - k); };
const ageAt = (s, T) => { const tp = tPassAt(s); return T < TI ? Math.max(0, T - tp) * 2.5 : (TI - tp) * 2.5 + (T - TI) * 1.5; };
const FALL = { MZ: MZ0, DIR: DIRP, U: PXP, W: PYP, L0, sOf, altAt, ageAt };
LOG.push(`fall ${(L0 / 1000).toFixed(1)} km in ${TAU_END.toFixed(1)} s, impact ${(vAt(L0) / 1000).toFixed(2)} km/s, transit ${TR_D.toFixed(2)} s, TX ${TX.toFixed(2)}`);
const SWARP = FILM.warp([{ t: 0, rate: 1 }, { t: 1.6, rate: 1 }, { t: 4.5, rate: 4 }, { t: T_RET - TI + 14, rate: 4 }]);
const aOf = T => T < TI ? -1 : SWARP(T - TI);
const strikeRate = T => T < TI ? 1 : SWARP.rate(T - TI);
const rodZof = T => { if (T < TF) return Z_CH; const u = Math.min(1, (T - TF) / TR_D); return Z_CH + BLEN * u * u; };

/* ---------- clocks: the rate on screen (steps eased over 0.6 s in log space) ---------- */
const RATES = [[0, 1], [HEATW[0], 600], [HEATW[1] - .3, 1], [FINW[0] - .3, 8], [J0 - .5, 20], [ENGX[0] - .4, 8], [MOVE[0], 60], [MOVE[1] - .2, 1],
  [SPINW[0], 60], [SPINW[1] - .3, 1], [FLW[0][0] - .2, 8], [UNLK[0] - .2, 2], [COILW[1], 1]];
const rateA = T => {
  let i = 0; while (i < RATES.length - 1 && RATES[i + 1][0] <= T) i++;
  if (i === 0) return RATES[0][1];
  const [t, v] = RATES[i], v0 = RATES[i - 1][1], u = ss(t, t + .6, T);
  return Math.exp(Math.log(v0) + (Math.log(v) - Math.log(v0)) * u);
};
const rateOf = T => T < TF ? rateA(T) : T < TX ? RATE_TR : T < TI ? fallRate(T) : T < T_RET ? strikeRate(T) : Math.exp(Math.log(30) * (1 - ss(LIGHTS_OFF[0], LIGHTS_OFF[1], T)));
const SIMN = 4000, SIMW = (() => { const A = new Float64Array(SIMN + 1); for (let i = 1; i <= SIMN; i++) { const t = (i - .5) / SIMN * DUR; A[i] = A[i - 1] + rateOf(t) * DUR / SIMN; } return A; })();
const simAt = T => { const x = E.clamp(T / DUR, 0, 1) * SIMN, k = Math.min(SIMN - 1, Math.floor(x)); return SIMW[k] + (SIMW[k + 1] - SIMW[k]) * (x - k); };
const SIM_TF = simAt(TF);
const simClock = T => T < TF ? simAt(T) - SIM_TF : T < TX ? (T - TF) * RATE_TR : T < TI ? TR_D * RATE_TR + tauOf(T) : TR_D * RATE_TR + TAU_END + aOf(Math.min(T, T_RET)) + (T > T_RET ? simAt(T) - simAt(T_RET) : 0);

/* ---------- the ring's spin: 0.5 rpm when spun up (integrated over the clock), parked on a node at the end ---------- */
const OMEGA = TAU / 120, NSP = Math.ceil(DUR * 100), PSI = new Float64Array(NSP + 1);
const spinFrac = T => ss(SPINW[0], SPINW[1], T) * (1 - ss(SPIN_B[0], SPIN_B[1], T));
for (let i = 1; i <= NSP; i++) { const t = (i - .5) / 100; PSI[i] = PSI[i - 1] + OMEGA * spinFrac(t) * rateOf(t) / 100; }
const PSI_END = PSI[NSP], STEP = TAU / P.NND, PARK = Math.round(PSI_END / STEP) * STEP - PSI_END;
const psiAt = T => { const x = E.clamp(T, 0, DUR) * 100, k = Math.min(NSP - 1, Math.floor(x)); return PSI[k] + (PSI[k + 1] - PSI[k]) * (x - k) + PARK * kb(T, PARK_RING); };

/* ---------- the platform's state ---------- */
const ST = { wake: 0, wave: -1, waveW: 60, waveA: 0, waveT: 0, joint: new Float64Array(NSEG), jaw: new Float64Array(NSEG), sleeve: new Float64Array(NSEG), tel: 0, fin: 0, ring: 0, spin: 0,
  engExt: 0, gimbal: new Float64Array(8), sw: 0, breech: 1, lock: 1, clamp: 0, iris: 0, roundZ: null, flex: null, flapAt: null };
let FLEXT = 0, FLT = 0;
const flexFn = (z, o) => { const t = FLEXT, k = Math.max(0, z / Z_MZ), A = 2.4 * Math.exp(-t / 2.6) * Math.sin(TAU * .42 * t) * k * k; o[0] = A * .3; o[1] = A; o[2] = 0; };
/* the flaps of bay gb (0 at the breech): three waves breech to muzzle (crack, half with the cassettes out, full with
   them turned up); closed in one wave muzzle to breech on the return */
ST.flapAt = (gb, out) => {
  const T = FLT;
  if (T < FLW[0][0] || T > FLB[1] + .1) { out[0] = out[1] = out[2] = 0; return; }
  const u = gb / (NB - 1), st = i => { const w = FLW[i], d = .8, t0 = w[0] + u * (w[1] - w[0] - d); return kk(T, t0, t0 + d); };
  const s1 = st(0), s2 = st(1), s3 = st(2), d = 1, t0 = FLB[0] + (1 - u) * (FLB[1] - FLB[0] - d), c = 1 - kk(T, t0, t0 + d);
  out[0] = (14 * s1 + 41 * s2 + 55 * s3) * DEG * c; out[1] = (2.6 * s2 + 3.6 * s3) * c; out[2] = PI / 2 * s3 * c;
};
/* engines: throttle (0..1) per engine and the retro pods */
const THR = new Float64Array(4);
let RETRO_A = 0;
function engines(T) {
  const g = ST.gimbal;
  let p = 0, y = 0;
  const c = (T - GCHK[0]) / (GCHK[1] - GCHK[0]);
  if (c > 0 && c < 1) { p = 7 * DEG * Math.sin(c * TAU) * Math.sin(c * PI); y = 7 * DEG * Math.cos(c * TAU) * Math.sin(c * PI); }
  let sl = 0;
  for (const w of [SLEW, SLEW_B]) { const u = (T - w[0]) / (w[1] - w[0]); if (u > 0 && u < 1) sl = Math.sin(u * TAU) * Math.sin(u * PI) * (w === SLEW ? 1 : -1); }
  for (let e = 0; e < 4; e++) { g[e * 2] = p + 10 * DEG * sl * (e < 2 ? 1 : -1); g[e * 2 + 1] = y + 4 * DEG * sl * (e % 2 ? 1 : -1); }
  const main = Math.max(win(T, BURN[0], BURN[1], .35), win(T, BURN_B[0], BURN_B[1], .35));
  for (let e = 0; e < 4; e++) THR[e] = Math.max(main, .5 * Math.abs(sl) * (1 - main), .25 * win(T, GCHK[1] - .1, GCHK[1] + .4, .1));
  RETRO_A = Math.max(win(T, RETRO[0], RETRO[1], .3), win(T, RETRO_B[0], RETRO_B[1], .3));
}
let INS_ON = false;
function stateAt(T) {
  ST.wake = ss(T_WAKE, T_WAKE + 3, T) * (1 - kb(T, LIGHTS_OFF));
  for (let j = 1; j < NSEG; j++) {
    const a = JW(j), b = JWB(j);
    ST.joint[j] = kb(T, a) * (1 - kb(T, b));
    ST.jaw[j] = kk(T, a[1] + .05, a[1] + .7) * (1 - kk(T, b[0] - .9, b[0] - .25));
    ST.sleeve[j] = kk(T, a[1] + .5, a[1] + 1.3) * (1 - kk(T, b[0] - 1.7, b[0] - .95));
  }
  ST.tel = kb(T, TELW) * (1 - kb(T, TEL_B));
  ST.fin = kb(T, FINW) * (1 - kb(T, FIN_B));
  ST.ring = kb(T, RINGW) * (1 - kb(T, RING_B));
  ST.spin = psiAt(T);
  ST.engExt = kb(T, ENGX) * (1 - kb(T, ENGX_B));
  engines(T);
  ST.sw = kb(T, SWW) * (1 - kb(T, SW_B));
  ST.breech = 1 - kb(T, BRO) + kb(T, BRC);
  ST.lock = 1 - kb(T, UNLK) + kb(T, LOCKW);
  ST.clamp = kb(T, CLAMPW) * (1 - kb(T, CLAMP_B));
  ST.iris = kb(T, IRIS) * (1 - kb(T, IRIS_B));
  ST.roundZ = INS_ON || T <= AT_FAB || T >= TX ? null : rodZof(T);
  FLEXT = T - TX; ST.flex = T > TX && T < TX + 12 ? flexFn : null;
  FLT = T;
  // the wake: a lime wave out from the reactor; the sleep: a fainter one back into it
  const wk = T - (T_WAKE + .2), sl = T - LIGHTS_OFF[0];
  if (wk > 0 && wk < 3.4) { ST.wave = 640 * wk; ST.waveW = 70; ST.waveA = .95 * (1 - ss(2.6, 3.4, wk)); ST.waveT = .16; }
  else if (sl > 0 && sl < 2.2) { ST.wave = 1700 * (1 - sl / 2); ST.waveW = 80; ST.waveA = .55 * (1 - ss(1.6, 2.2, sl)); ST.waveT = 0; }
  else ST.wave = -1;
  return ST;
}
const RCW = [0, 0, 0];
const waveFn = p => { const dx = p[0] - RCW[0], dy = p[1] - RCW[1], dz = p[2] - RCW[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz), w = (d - ST.wave) / ST.waveW; return (w < 0 ? Math.exp(w * .6) * ST.waveT + Math.exp(-w * w) * (1 - ST.waveT) : Math.exp(-w * w)) * ST.waveA; };

/* ---------- effects on the platform's parts (the lattice's channels) ---------- */
const CUR = P.CUR;
let FXT = 0;
const heatOf = T => .22 + .78 * kb(T, HEATW) * (1 - kb(T, HEAT_B));
const zWave = T => Z_CH + (Z_MZ - Z_CH) * E.sat((T - CH0) / (CH1 - CH0));
const chg = T => ss(CH0 - .3, CH0 + .4, T) * (1 - ss(TX, TX + 1.8, T));
const busRear = T => ss(CURW[0] + .6, CURW[0] + 2.2, T) * (1 - ss(LIGHTS_OFF[0], LIGHTS_OFF[1], T));
const gunFront = T => -134 + (Z_MZ + 140) * E.sat((T - GUNP[0]) / (GUNP[1] - GUNP[0]));
const gunOn = T => ss(GUNP[0], GUNP[0] + .2, T) * (1 - ss(SW_B[0], SW_B[1] + .6, T));
const magFront = T => Z_CH - 10 + (Z_MZ + 20) * E.sat((T - MAGW[0]) / (MAGW[1] - MAGW[0] - .4));
const magOn = T => ss(MAGW[0], MAGW[0] + .2, T) * (1 - ss(MAG_B[0], MAG_B[1], T));
const ringPow = T => ss(RCUR[0], RCUR[0] + 1.4, T) * (1 - ss(RING_B[0] - 1.2, RING_B[0], T));
/* the laser line: each station locks at a time */
const LOCK_T = [54.4 + O_, 54.9 + O_, 57.0 + O_, 57.5 + O_];          // emitter, hub mirror, housing mirror, periscope
const SENS_T = k => 58.2 + O_ + .62 * (k - 1);                       // joint sensors 1..5
const CROWN_T = 61.5 + O_, RING_T = k => 55.5 + O_ + .28 * k, ALIGN_T = 62.3 + O_;
const camOn = (T, t0) => T > t0 ? (T < t0 + .25 ? 1.6 : .55) * (1 - ss(CAL[1] + 1, CAL[1] + 3, T)) : 0;
const fxFn = (ch, q) => {
  const T = FXT;
  switch (ch) {
    case 1: { // charge rings (z)
      const z = CUR.z + q; let k = 0;
      if (T > CH0 - .2 && T < TF) { const d = zWave(T) - z; if (d > 0) k = .5 + .12 * K.hh(z, Math.floor(T * 20)); if (d > -8 && d < 16) k = Math.max(k, 1.7 * Math.exp(-Math.abs(d) / 7)); }
      if (T >= TF && T < TX + 3) {
        const zr = rodZof(Math.min(T, TX)), d = zr - z;
        if (T < TX) { if (d >= 0 && d < 80) k = Math.max(k, 2 * Math.exp(-d / 14)); else if (d >= 80) k = Math.max(k, .16); else k = Math.max(k, .58); }
        else k = Math.max(k, .9 * Math.exp(-(T - TX) * 1.4));
      }
      return k;
    }
    case 2: { // power bus, rails, conduits (z)
      const z = CUR.z + q; let k = 0;
      if (z < -134) k = .2 * busRear(T);
      else { const g = gunOn(T); if (g > 0) { const d = gunFront(T) - z; if (d > 0) k = .32 * g; if (d > -20 && d < 40) k = Math.max(k, 1.1 * Math.exp(-Math.abs(d) / 16) * g); } }
      if (T >= TF && T < TX + 2) { const zr = rodZof(Math.min(T, TX)), d = zr - z; k = Math.max(k, T < TX ? (d > -4 && d < 60 ? 1.8 * Math.exp(-Math.max(0, d) / 16) : .3) : .6 * Math.exp(-(T - TX) * 2)); }
      return k;
    }
    case 4: { // magnet tubes (z)
      const z = CUR.z + q, on = magOn(T); let k = 0;
      if (on > 0) { const d = magFront(T) - z; if (d > 0) k = (.5 + .08 * Math.sin(T * 9 + z * .07)) * on; if (d > -12 && d < 24) k = Math.max(k, 1.4 * Math.exp(-Math.abs(d) / 9) * on); }
      if (T >= TF && T < TX + 2) { const zr = rodZof(Math.min(T, TX)), d = zr - z; if (T < TX && d > -20 && d < 40) k = Math.max(k, 1.6 * Math.exp(-Math.abs(d) / 12)); }
      return k;
    }
    case 5: { const h = heatOf(T); if (q === 2) return 10 + .5 + .4 * h + .1 * Math.sin(T * 7); return q === 0 ? 10 + .3 + .4 * h : 10 + .25 + .75 * h + (h > .9 ? .12 * K.hh(q, Math.floor(T * 12)) : 0); }
    case 6: { const h = heatOf(T) * (.3 + .7 * ST.fin); return 10 + Math.max(0, h * (.55 - .07 * CUR.j)) + .35 * flash(T, TX + .3, .5) * (1 - CUR.j / 8); }
    case 7: { let k = ss(CH1 - 1, TF, T) * .7 * (1 - ss(TX, TX + 1, T)); k = Math.max(k, 2 * flash(T, TX, 2.2)); if (T > IRIS[0] && T < IRIS[1] + .6) k = Math.max(k, .45 * (1 - E.sat((T - IRIS[1]) / .6))); return k; }
    case 8: { let k = .45 * ss(COILW[0], COILW[1], T); if (T > TF && T < TX) k = 1.6; return k; }
    case 9: {
      if (q === 0) return Math.max(.65 * ss(COILW[0], COILW[1], T) * (1 - ss(TX, TX + 2, T)), 1.5 * flash(T, COILW[0] + .4, 2.5), .9 * chg(T));
      if (q === 1) return 1.4 * flash(T, BRC[1], 3);
      if (q === 2) return Math.max(1.4 * flash(T, LOCKW[1], 3), .5 * win(T, UNLK[0], UNLK[1], .1));
      if (q === 3) return 1.5 * flash(T, CLAMPW[1], 3.5);
      return .35 * chg(T);
    }
    case 10: { const pw = ringPow(T); if (q === 0) return Math.max(.3 * pw, 1.3 * flash(T, RINGW[1], 2.5)); return (q === 2 ? .55 : .35) * pw; }
    case 11: { const c = ss(CURW[0], CURW[0] + 1, T) * (1 - ss(LIGHTS_OFF[0], LIGHTS_OFF[1], T)); return c * (.3 + .35 * (.5 + .5 * Math.sin(T * 5 - q * .8))); }
    case 12: { if (q === 3) return 10 + .95 * RETRO_A; if (q === 2) return 0; const t = CUR.k >= 0 ? THR[CUR.k] : 0; return t > .01 ? 10 + Math.min(1.6, .9 * t + (q === 0 ? .5 * t : 0)) : 0; }
    case 13: { if (q === 0 || q === 1) return .55 * Math.max(busRear(T) * (T < SWW[1] || T > SW_B[0] ? 1 : 0), gunOn(T)) * (q ? 1.4 : 1) + .9 * flash(T, SWW[1], 3) + .9 * flash(T, SW_B[1], 3); if (q === 10) return .8 * (1 - ST.sw) * busRear(T); return .8 * ST.sw; }
    case 14: {
      if (q === 0) return camOn(T, LOCK_T[0]); if (q === 3) return Math.max(camOn(T, LOCK_T[1]), camOn(T, RING_T(3)) * .7); if (q === 4) return camOn(T, LOCK_T[2]); if (q === 5) return camOn(T, LOCK_T[3]);
      if (q === 1) return CUR.k > 0 ? camOn(T, SENS_T(CUR.k)) : 0; return camOn(T, CROWN_T);
    }
    case 16: { const on = magOn(T); return .3 * on + .9 * on * Math.exp(-Math.abs(T - MAGW[0] - .3 - q * .12) * 3); }
    case 15: { const j = CUR.k; if (j < 1) return 0; return 1.6 * flash(T, JW(j)[1] + .7, 4) + .5 * win(T, JW(j)[1] + .05, JW(j)[1] + .7, .1); }
  }
  return 0;
};
/* status lights: z order from the reactor forward; the colour turns lime while the coils are charged */
const lightLv = (T, z) => {
  const t0 = T_WAKE + .3 + (z + 660) / 640; if (T < t0) return .12 * (1 - ST.wake) * (Math.floor(T * .8 + z) % 6 === 0 ? 1 : 0);
  const a = T - t0, on = a < .05 ? 1.6 : a < .1 ? .3 : 1, h = ((z * 7.31) % 1 + 1) % 1;
  const blink = h < .2 ? (Math.floor(T * 1.6 + h * 9) % 2 ? 1 : .25) : 1;
  return on * blink * Math.max(ST.wake, .1) * (1 + .8 * chg(T));
};
const fx = (ch, q) => ch === 3 ? lightLv(FXT, CUR.z + q) : fxFn(ch, q);

/* ---------- power: packets of light along the bus (platform frame paths) ---------- */
function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.dist(pts[i], pts[i - 1])); return { p: pts, cum, L: cum[cum.length - 1] }; }
const PK = [0, 0, 0];
function pathAt(pa, s, Tw, o) {
  const c = pa.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
  const k = E.clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), 0, 1), a = pa.p[i - 1], b = pa.p[i];
  const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k, M = Tw.R, t = Tw.T;
  o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o;
}
/* packets every gap m at speed m/s from t0 (pure in T), fading in over the first second; col the head's colour */
function stream(pa, Tw, T, t0, speed, gap, a, col) {
  if (T < t0 || a < .01) return;
  const head = (T - t0) * speed, s0 = head % gap;
  for (let s = s0; s <= pa.L; s += gap) {
    if (s > head) break;
    for (let q = 0; q < 6; q++) { const sq = s - q * Math.min(3, gap * .06); if (sq < 0) break; pathAt(pa, sq, Tw, PK); K.dotW(PK[0], PK[1], PK[2], q ? 1 : 2, q ? LIME : (col || HOT), a * (1 - q / 6)); }
    pathAt(pa, s, Tw, PK); K.glowW(PK[0], PK[1], PK[2], 8, LIME, .28 * a);
  }
}
const P_REAR = [1, -1].map(s => mkPath([[0, 0, -622], [s * 5, 0, -578], [s * 9, 0, -556], [s * 9, 0, -190]]));
const P_ENG = [0, 1, 2, 3].map(e => { const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t), r0 = P.SR * .7; return mkPath([[Math.sign(c) * 9, 0, -186], [c * r0, s * r0, -200], [c * r0, s * r0, -516], [c * P.SR * .88, s * P.SR * .88, -520], [c * (P.ENG_R - 9), s * (P.ENG_R - 9), P.ENG_Z0 - 4], [c * P.ENG_R, s * P.ENG_R, P.ENG_TH + 6]]); });
const P_GUN = [1, -1].map(s => mkPath([[s * 9, 0, -138], [s * 9, -P.BAY_H[1] - 1, -116], [s * 9, -P.BAY_H[1] - 1, -46], [s * 4, s * 2.3, -40], [0, s * 4.6, -16], [0, s * 4.6, Z_MZ - 4]]));
const P_FEED = mkPath([[0, 0, -40], [0, 0, -14]]);
function drawPower(T, Tw) {
  const br = busRear(T);
  if (br > .01) for (let s = 0; s < 2; s++) stream(P_REAR[s], Tw, T, CURW[0] + .4 + s * .2, 60, 30, br * .9);
  const eng = (T > ENGX[0] - .5 && T < SWW[1] + .2) || (T > SW_B[0] && T < ENGX_B[1] + .4);
  if (eng && br > .01) { const a = br * (T < SWW[1] + .2 ? 1 - ss(SWW[0], SWW[1] + .2, T) * .95 : ss(SW_B[0], SW_B[1], T)); for (let e = 0; e < 4; e++) stream(P_ENG[e], Tw, T, T > SW_B[0] ? SW_B[0] : ENGX[0] - .5, 70, 34, a); }
  const g = gunOn(T);
  if (g > .01 && T < TX + 1) for (let s = 0; s < 2; s++) stream(P_GUN[s], Tw, T, GUNP[0] - .4, 480, 46, g * (1 - ss(TF, TX, T)));
}
/* the reactor's X-ray: a lime scan plane slices it open (the lattice's slab clip removes everything between the plane
   and ZCUT_U); on the cut: the core's heat, the hot shoe, the row of couples just behind the plane with the current
   running round it in series (p-leg, hot strap, n-leg, cold strap), the cold shoe, the fins' sections */
const ZCUT = P.CP_Z0 + 5 * P.CP_DZ + 1.2, ZCUT_U = -440;
const cutZ = T => T < (XRJ[1] + XRJ[2]) / 2 ? ZCUT_U + (ZCUT - ZCUT_U) * kk(T, XRJ[0], XRJ[1]) : ZCUT + (ZCUT_U - ZCUT) * kk(T, XRJ[2], XRJ[3]);
const xrOn = T => T > XRJ[0] && T < XRJ[3];
const SEC_X = { R: null, T: [0, 0, 0] }, DOS = { L: [0, 1, 0], fx: (ch, q) => fx(ch, q), occ: true, a: 3.2 };
const CPP = [0, 0, 0], CC_ = [0, 0, 0];
function drawSection(T, Tw) {
  if (!xrOn(T)) return;
  const zc = cutZ(T), M = Tw.R, t = Tw.T, NCP = P.NCP, h = heatOf(T);
  const mv = 1 - ss(XRJ[1] - .1, XRJ[1] + .5, T) * (1 - ss(XRJ[2] - .3, XRJ[2] + .1, T));     // the plane moving
  const wp = (x_, y_, z, o) => { o[0] = M[0] * x_ + M[1] * y_ + M[2] * z + t[0]; o[1] = M[3] * x_ + M[4] * y_ + M[5] * z + t[1]; o[2] = M[6] * x_ + M[7] * y_ + M[8] * z + t[2]; return o; };
  const U = [M[0], M[3], M[6]], Wv = [M[1], M[4], M[7]];
  wp(0, 0, zc, CC_);
  // the scan plane: a lime grid of rings and spokes, bright while it moves
  for (let k = 1; k <= 14; k++) K.ringW(CC_, U, Wv, k * 9, Math.round(60 + k * 34), 1, LIME, (.12 + .5 * mv) * (1 - k / 16), k);
  for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, c = Math.cos(a), s_ = Math.sin(a); wp(c * 4, s_ * 4, zc, CPP); const ax = CPP[0], ay = CPP[1], az = CPP[2]; wp(c * 128, s_ * 128, zc, CPP); K.lineW(ax, ay, az, CPP[0], CPP[1], CPP[2], 3, 1, LIME, (.08 + .3 * mv), null, 0, 0); }
  // section rings: the core, the hot shoe, the cold shoe, the shell
  K.ringW(CC_, U, Wv, P.CORE_R, 900, 1, HEAT, .9, 0); K.ringW(CC_, U, Wv, P.HS_R, 900, 1, HOT, .85, .3);
  K.ringW(CC_, U, Wv, P.CS_R, 900, 1, LIME, .75, .1); K.ringW(CC_, U, Wv, P.SHELL_R, 900, 1, LIME, .9, .2);
  // the core's section: a lattice disc in the heat's colour, sparks of heat on it
  CUR.z = 0; CUR.inst = 0; SEC_X.R = M; P.apTo(SEC_X.T, Tw, [0, 0, zc - .25]); ORL.draw(P.capD, SEC_X, DOS);
  const fr = Math.floor(T * 12);
  for (let i = 0; i < 3000; i++) {
    const r = P.CORE_R * .985 * Math.sqrt(K.hh(i, 11)), a = K.hh(i, 12) * TAU, b = (.35 + .65 * K.hh(i, fr)) * (.5 + .5 * h) * (.7 + .3 * r / P.CORE_R);
    wp(Math.cos(a) * r, Math.sin(a) * r, zc - .3, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 1, HEAT, b);
  }
  for (let k = 1; k < 9; k++) K.ringW(CC_, U, Wv, P.CORE_R * k / 9, Math.round(120 + 60 * k), 1, HEAT, .35 + .25 * Math.sin(T * 3 - k), k * .7);
  // heat crossing the couples, the hot shoe to the cold shoe
  for (let i = 0; i < 900; i++) {
    const a = K.hh(i, 21) * TAU, f = (T * .5 + K.hh(i, 22)) % 1, r = P.HS_R + f * (P.SHELL_R - P.HS_R + 4);
    wp(Math.cos(a) * r, Math.sin(a) * r, zc - .5 - K.hh(i, 23) * 2, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 1, HEAT, .8 * (1 - f) * h);
  }
  // the current: packets round the row just behind the plane
  const cur = ss(CURW[0], CURW[0] + 1, T), row = Math.max(0, Math.min(P.CP_ROWS - 1, Math.floor((zc - P.CP_Z0) / P.CP_DZ))), z = P.CP_Z0 + row * P.CP_DZ;
  if (cur < .02 || zc - z > 6) return;
  const rh = P.HS_R + .1, rc = P.CS_R - .1;
  for (let k = 0; k < 120; k++) {
    const s_ = ((T * .9 + k / 120) % 1) * NCP, i = Math.floor(s_), w = s_ - i, t0 = i / NCP * TAU, t1 = t0 + TAU / NCP * .42, t2 = (i + 1) / NCP * TAU;
    let a, r;
    if (w < .25) { a = t0; r = rc + (rh - rc) * (w / .25); } else if (w < .5) { a = t0 + (t1 - t0) * ((w - .25) / .25); r = rh; } else if (w < .75) { a = t1; r = rh + (rc - rh) * ((w - .5) / .25); } else { a = t1 + (t2 - t1) * ((w - .75) / .25); r = rc; }
    wp(Math.cos(a) * r, Math.sin(a) * r, z, CPP);
    K.dotW(CPP[0], CPP[1], CPP[2], 2, HOT, cur); K.glowW(CPP[0], CPP[1], CPP[2], 7, LIME, .3 * cur);
  }
}
/* current round the ring (once latched) and out along the cables */
function drawRingPower(T, Tw, PP) {
  const pw = ringPow(T); if (pw < .02) return;
  const r = PP.ring.r, hk = PP.ring.hk, psi = PP.ring.psi, N = P.NND, M = Tw.R, t = Tw.T;
  for (let k = 0; k < 64; k++) {
    const f = ((T * .9 + k / 64) % 1) * N, i = Math.floor(f), w = f - i, a = psi + i * TAU / N, a1 = a + TAU / N;
    const ax = Math.cos(a) * r, ay = Math.sin(a) * r, bx = Math.cos(a1) * r, by = Math.sin(a1) * r, mx = (ax + bx) / 2, my = (ay + by) / 2;
    let x, y, z;
    if (w < .5) { const u = w * 2; x = ax + (mx - ax) * u; y = ay + (my - ay) * u; z = P.HUB_Z + 4.7 + hk * u; } else { const u = w * 2 - 1; x = mx + (bx - mx) * u; y = my + (by - my) * u; z = P.HUB_Z + 4.7 + hk * (1 - u); }
    const px = M[0] * x + M[1] * y + M[2] * z + t[0], py = M[3] * x + M[4] * y + M[5] * z + t[1], pz = M[6] * x + M[7] * y + M[8] * z + t[2];
    K.dotW(px, py, pz, 2, HOT, pw); K.glowW(px, py, pz, 10, LIME, .3 * pw);
  }
}

/* ---------- engines: plumes (dots), retro pods ---------- */
const NPL = 3200, PLM = (() => { const r = rng(7171), A = new Float32Array(NPL * 4); for (let i = 0; i < NPL; i++) { A[i * 4] = r(); A[i * 4 + 1] = r() * TAU; A[i * 4 + 2] = Math.sqrt(r()); A[i * 4 + 3] = r(); } return A; })();
const PE = [0, 0, 0], PD = [0, 0, 0], PG = [0, 0, 0];
/* a glow of world radius wr at p (screen size from its depth) */
function glowR(x, y, z, wr, col, a) { if (!K.pj(x, y, z)) return; const px = Math.min(140, wr * C.fl / Math.max(1, K.PJ[2])); if (px < 1.5) { K.dotW(x, y, z, 1, col, a); return; } K.glowW(x, y, z, Math.round(px), col, a); }
/* an engine's plume: a white-hot throat, a filled cone of dots streaming out, a glowing column, shock diamonds */
function plume(ex, d, U, Wd, I, T, len, r0, spread, seed) {
  if (I < .02) return;
  const fr = Math.floor(T * 30), L_ = len * (.7 + .3 * I);
  glowR(ex[0], ex[1], ex[2], r0 * 2.2, HOT, .7 * I);
  for (const [f, wr, a] of [[.04, 1.6, .5], [.12, 2.2, .35], [.25, 3, .22], [.45, 4.2, .12], [.7, 5.5, .06]]) { const s = L_ * f; glowR(ex[0] + d[0] * s, ex[1] + d[1] * s, ex[2] + d[2] * s, r0 * wr + s * spread, f < .2 ? HOT : LIME, a * I); }
  for (let i = 0; i < NPL; i++) {
    const o = i * 4, u = (PLM[o] + T * (.9 + .8 * PLM[o + 3])) % 1, s = L_ * Math.pow(u, 1.6), rr = (r0 * .85 + s * spread) * PLM[o + 2], th = PLM[o + 1] + (K.hh(i, fr + seed) - .5) * .25;
    const b = 1.4 * I * (1 - u) * (.55 + .45 * PLM[o + 3]) * (u < .05 ? 1.5 : 1);
    if (b < .03) continue;
    const cx = Math.cos(th) * rr, cy = Math.sin(th) * rr;
    K.dotW(ex[0] + d[0] * s + U[0] * cx + Wd[0] * cy, ex[1] + d[1] * s + U[1] * cx + Wd[1] * cy, ex[2] + d[2] * s + U[2] * cx + Wd[2] * cy, u < .3 ? 2 : 1, u < .14 ? HOT : i % 3 ? WH : LIME, Math.min(1, b));
  }
  // shock diamonds and the Mach disc
  for (let k = 1; k <= 6; k++) { const s = k * r0 * 1.9, rr = r0 * (.42 + .22 * Math.sin(k * 1.7 + T * 9)), c = V.mad(ex, d, s); K.ringW(c, U, Wd, rr, 72, k < 3 ? 2 : 1, HOT, I * .95 * (1 - k / 7), k + T); }
  PG[0] = ex[0] + d[0] * r0 * 1.5; PG[1] = ex[1] + d[1] * r0 * 1.5; PG[2] = ex[2] + d[2] * r0 * 1.5; glowR(PG[0], PG[1], PG[2], r0 * .9, HOT, .8 * I);
  K.lineW(ex[0], ex[1], ex[2], ex[0] + d[0] * L_ * .22, ex[1] + d[1] * L_ * .22, ex[2] + d[2] * L_ * .22, 1.2, 2, HOT, .8 * I, HOT, .05, .02);
}
function drawEngines(T, Tw, PP) {
  for (let e = 0; e < 4; e++) {
    const I = THR[e]; if (I < .02) continue;
    const B = PP.exts[e];
    P.apTo(PE, B, [0, 0, -(P.BELL_L - 1 + 12) - 1]); PD[0] = -B.R[2]; PD[1] = -B.R[5]; PD[2] = -B.R[8];
    const [U, Wd] = GEO.perp(PD);
    plume(PE, PD, U, Wd, I, T, 380, 11, .22, e * 31);
  }
  if (RETRO_A > .02) for (let e = 0; e < 4; e++) {
    const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t), d = V.norm([c * .55, s * .55, 1]), b = [c * (P.HSG_R + 4), s * (P.HSG_R + 4), -10];
    const ex = X.ap(Tw, V.mad(b, d, 5)), dw = X.dir(Tw, d), [U, Wd] = GEO.perp(dw);
    plume(ex, dw, U, Wd, RETRO_A, T, 200, 4.2, .14, 200 + e * 7);
  }
}

/* ---------- the laser line: beams, search spirals, glints ---------- */
const BA = [0, 0, 0], BB = [0, 0, 0], EPB = [0, 0, 0];
function beam(a, b, t0, T, I, tgt) {
  const age = T - t0; if (age < 0 || I < .02) return;
  // acquisition: the far end circles the target, tightening, for 0.45 s, then holds
  const sr = age < .45 ? (1 - age / .45) * (1 - age / .45) * 2.6 : 0, an = age * 26;
  const [U, Wd] = GEO.perp(V.norm(V.sub(b, a)));
  BB[0] = b[0] + (U[0] * Math.cos(an) + Wd[0] * Math.sin(an)) * sr; BB[1] = b[1] + (U[1] * Math.cos(an) + Wd[1] * Math.sin(an)) * sr; BB[2] = b[2] + (U[2] * Math.cos(an) + Wd[2] * Math.sin(an)) * sr;
  const k = I * (age < .1 ? age / .1 : 1);
  K.lineW(a[0], a[1], a[2], BB[0], BB[1], BB[2], 1.1, 1, HOT, .85 * k, LIME, .07, .025);
  K.glowW(a[0], a[1], a[2], 10, LIME, .5 * k);
  if (age > .45) { const g = Math.exp(-(age - .45) * 4); K.glowW(b[0], b[1], b[2], Math.round(14 + 50 * g), LIME, (.45 + .6 * g) * k); if (tgt) K.ringW(b, U, Wd, 1.4 + 3 * g, 36, 1, LIME, .8 * k * g, 0); }
  else K.glowW(BB[0], BB[1], BB[2], 12, HOT, .6 * k);
}
function drawLasers(T, PP) {
  if (T < CAL[0] || T > CAL[1] + 2.4) return;
  const I = 1 - ss(CAL[1] + .4, CAL[1] + 2.4, T), L_ = PP.laser;
  beam(L_[0], L_[1], LOCK_T[0], T, I, true);
  for (let k = 0; k < 4; k++) beam(L_[1], L_[10 + k], RING_T(k), T, I, true);
  // the engines' probes onto the hub mirror
  for (let e = 0; e < 4; e++) { const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t); P.apTo(EPB, PP.W, [c * (P.ENG_R + 7.6), s * (P.ENG_R + 7.6), P.ENG_Z0 - 2]); beam(EPB, L_[1], LOCK_T[1] + .3 + e * .22, T, I * .8, false); }
  beam(L_[1], L_[2], LOCK_T[1] + .9, T, I, true);
  beam(L_[2], L_[3], LOCK_T[2] + .1, T, I, false);
  beam(L_[3], L_[4], LOCK_T[3] + .2, T, I, true);
  for (let k = 1; k < NSEG - 1; k++) beam(L_[3 + k], L_[4 + k], SENS_T(k) + .2, T, I, true);
  beam(L_[3 + NSEG - 1], L_[3 + NSEG], SENS_T(NSEG - 1) + .4, T, I, true);
  // the return beam from the crown, a little offset
  if (T > CROWN_T + .4) { const a = L_[3 + NSEG], b = L_[3]; K.lineW(a[0] + .6, a[1], a[2], b[0] + .6, b[1], b[2], 1.6, 1, LIME, .6 * I * ss(CROWN_T + .4, CROWN_T + .6, T), LIME, .04, 0); }
}
/* field lines: loops round the chamber coils (chamber shots), and round the magnet tubes near the camera */
const FLP = [0, 0, 0];
function drawFields(T, Tw) {
  const coil = ss(COILW[0], COILW[1], T) * (1 - ss(TX, TX + 2, T));
  if (coil > .02 && V.dist(C.eye, Tw.T) < 260) {
    const M = Tw.R, t = Tw.T;
    for (const zc of [-8.8, -3.4]) for (let f = 0; f < 16; f++) {
      const ph = f / 16 * TAU, c = Math.cos(ph), s = Math.sin(ph);
      for (const rho of [1.4, 2.3, 3.3]) {
        const n = Math.round(30 + 14 * rho);
        for (let i = 0; i < n; i++) {
          const th = i / n * TAU + T * 2.4 / rho, r = 3.4 + rho * Math.cos(th), z = zc + rho * 1.3 * Math.sin(th);
          if (r < 1.1) continue;
          const x = c * r, y = s * r;
          K.dotW(M[0] * x + M[1] * y + M[2] * z + t[0], M[3] * x + M[4] * y + M[5] * z + t[1], M[6] * x + M[7] * y + M[8] * z + t[2], 1, LIME, coil * (.25 + .3 * (.5 + .5 * Math.sin(th * 3 - T * 6))));
        }
      }
    }
  }
}
/* inside the tube: as the round passes each ring it discharges: a flash and a ring of light racing out of it */
function drawDischarge(T, Tw) {
  if (T < TF || T > TX + .2) return;
  const zr = rodZof(Math.min(T, TX)), d = X.dir(Tw, [0, 0, 1]), [U, Wd] = [X.dir(Tw, [1, 0, 0]), X.dir(Tw, [0, 1, 0])];
  const u = Math.min(1, (T - TF) / TR_D), v = 2 * BLEN * u / TR_D;     // film m/s
  for (let z = Math.floor(Math.max(0, zr - 90) / 5) * 5 + 2.5; z < zr; z += 5) {
    const age = (zr - z) / Math.max(1, v); if (age > .5) continue;
    const c = X.ap(Tw, [0, 0, z]), a = Math.exp(-age * 7);
    K.ringW(c, U, Wd, P.CRING_R + age * 34, 140, age < .1 ? 2 : 1, age < .12 ? HOT : LIME, a, z);
    K.ringW(c, U, Wd, P.CRING_R * .7 + age * 16, 90, 1, HOT, a * .8, z * 1.3);
    if (age < .15) glowR(c[0], c[1], c[2], 9, HOT, .8 * (1 - age / .15));
  }
}

/* ---------- camera ---------- */
const LK = (t, e, g, fov) => ({ t, eye: e, target: g, fov });
const P0 = (t, e, g, fov) => LK(t, PW0(e), PW0(g), fov);
const P1 = (t, e, g, fov) => LK(t, PW1(e), PW1(g), fov);
/* the opening (and the loop's end): the whole dormant structure from above, the Earth under it */
const OPEN = P0(0, [-640, 380, 260], [30, -110, -230], 40);
const PATH_A1 = FILM.path([
  OPEN,
  P0(3.2, [-600, 360, 230], [30, -110, -244], 40),
  P0(6.0, [-300, 180, -420], [0, 0, -610], 44),
  P0(8.4, [-260, 200, -760], [0, 0, -620], 46),
  P0(10.8, [-290, 230, -790], [0, 0, -620], 46),
  P0(12.4, [-240, 190, -560], [0, 0, -610], 46),
  P0(13.6, [-60, 80, -470], [0, 0, -605], 50),
  P0(15.6, [-48, 64, -515], [-6, 8, -605], 48),
  P0(17.4, [-40, 52, -556], [-14, 18, -606], 46),
  P0(18.8, [-300, 120, -420], [0, -40, -60], 48),
  P0(20.4, [-300, -150, 60], [0, -60, 160], 50),
  P0(22.8, [-300, -60, 220], [0, 0, 300], 50),
  P0(25.4, [-300, 40, 360], [0, 20, 450], 50),
  P0(27.4, [-70, 36, 410], [0, 6, 452], 46),
  P0(29.0, [-48, 30, 432], [0, 6, 452], 46),
  P0(31.0, [-380, 70, 640], [0, 0, 760], 50),
  P0(32.8, [-260, 50, 800], [0, 0, 900], 48),
  P0(35.4, [-170, 70, 890], [0, 0, 975], 44),
]);
const PATH_A2 = FILM.path([
  P0(37.6, [-1150, 560, 140], [0, -20, 120], 44),
  P0(39.4, [-980, 480, 0], [0, -20, 40], 44),
  P0(41.6, [-470, 230, -150], [0, 0, -300], 46),
  P0(43.2, [-220, 100, -520], [50, 50, -630], 48),
  P0(MOVE[0] - .2, [-110, 150, -560], [64, 64, -640], 50),
]);
/* the move: a camera fixed in space beside the station, the Earth under it */
const MID = V.lerp(SAT0, SAT, .5);
/* (from along the slew's axis, so the barrel swings in the frame's plane; above it and toward the coast) */
const SAX = V.norm(V.cross(EX, AIM)), EYE_MV = V.add(V.mad(MID, SAX, -2100), V.mul(EX, -250));
const camMove = T => { const Wt = platAt(T); return { eye: EYE_MV, target: X.ap(Wt, [0, -40, 150]), fov: 46 * DEG }; };
/* the calibration: along the beam line, the camera a little behind and beside its head */
const BEAMPTS = [P.LZ.emit, P.LZ.mHub, P.LZ.mHsg, P.LZ.mDn, [0, P.BEAM_Y, 0.9], [0, P.BEAM_Y, Z_MZ - 2]];
const BEAM_PATH = mkPath(BEAMPTS);
const CAL_S = FILM.warp([{ t: 0, rate: 0 }, { t: .4, rate: 150 }, { t: 2.8, rate: 110 }, { t: 3.6, rate: 360 }, { t: 7.6, rate: 260 }, { t: 8.6, rate: 30 }, { t: 9.4, rate: 0 }]);
const CP_ = [0, 0, 0], CQ_ = [0, 0, 0], ID_ = X.make();
function camCal(T) {
  const s = CAL_S(T - CAL[0]) * (BEAM_PATH.L - 40) / CAL_S.total - 30;
  pathAt(BEAM_PATH, Math.max(0, s), ID_, CP_); pathAt(BEAM_PATH, Math.max(0, s) + 120, ID_, CQ_);
  const k = ss(-30, 0, s);
  return { eye: PW1([CP_[0] - 44, CP_[1] + 20, CP_[2] - 40 * k - 24 * (1 - k)]), target: PW1([CQ_[0] * .7, CQ_[1] * .85, CQ_[2]]), fov: 50 * DEG };
}
const PATH_B = FILM.path([
  P1(SPINW[0] - .4, [-300, 220, -460], [0, 0, -300], 46),
  P1(SPINW[1], [-260, 160, -420], [0, 0, -300], 50),
  P1(SWW[0] - .2, [-120, 34, -150], [-30, 0, -162], 48),
  P1(SWW[1] + .4, [-112, 32, -158], [-30, 0, -162], 48),
  P1(FLW[0][0] + .2, [-70, 40, 120], [0, 0, 200], 46),
  P1(FLW[1][0] + .2, [-78, 44, 160], [0, 0, 240], 46),
  P1(FLW[2][0] + .2, [-86, 48, 200], [0, 0, 280], 46),
  P1(FLW[2][1] - .4, [-260, 150, -40], [0, 0, 400], 46),
  P1(BRO[0], [-90, 50, -80], [0, 0, -30], 48),
  P1(BRO[1], [-48, 26, -64], [0, 0, -24], 48),
  P1(AT_FAB, [-44, 24, -60], [0, 0, -22], 48),
  P1(BRC[0], [-24, 12, -26], [0, 0, -8], 48),
  P1(COILW[0] + .4, [-15, 8, -14], [0, 0, -6], 46),
  P1(COILW[1], [-30, 24, -22], [0, 0, -6], 46),
]);
/* the charge: out of the chamber and a ride along the barrel behind the wave, to the muzzle */
function camCharge(T) { const z = -20 + (Z_MZ - 190) * kk(T, COILW[1], CH1 + .2); return { eye: PW1([72, 34, z]), target: PW1([0, -2, z + 80]), fov: 50 * DEG }; }
/* the shot: in front of the muzzle and to its side, looking back down the barrel: the rings discharge toward the lens
   as the round comes, and it leaves past it */
const EF = PW1([74, 36, Z_MZ + 64]), FAR = PW1([0, 0, Z_MZ - 460]), OUT = PW1([0, 0, Z_MZ + 6]);
function camFire(T) { const u = E.sat((T - TF) / TR_D); return { eye: EF, target: lookMix(EF, FAR, OUT, .75 * ss(.72, 1, u)), fov: (52 - 4 * ss(.72, 1, u)) * DEG }; }
const FIRE_END = camFire(TX);
const SIDE = V.norm(V.cross(DIRP, EY)), UPD = V.norm(V.cross(SIDE, DIRP));
function lookMix(eye, a, b, w) { const da = V.norm(V.sub(a, eye)), db = V.norm(V.sub(b, eye)); return V.mad(eye, V.norm(V.lerp(da, db, w)), 100); }
const T_GO = TX + .2, T_EX = TX + 2.6, T_ON = TX + 4.8;
const Z1 = X.dir(W1, [0, 0, 1]);
const PATH_X = FILM.path([
  { t: T_GO, eye: FIRE_END.eye, target: FIRE_END.target, fov: FIRE_END.fov / DEG },
  P1(TX + 1.1, [40, 34, Z_MZ - 70], [0, -10, Z_MZ + 50], 50),
  P1(TX + 1.9, [20, 40, Z_MZ - 4], [0, 9, Z_MZ + 6], 50),
  P1(T_EX, [10, 44, Z_MZ + 6], [0, 10, Z_MZ + 14], 50),
]);
const camExit = T => PATH_X(T);
const EX_END = camExit(T_EX);
const RIDE = [[T_ON, [-10, 3.4, 2.6]], [TX + 7.71, [-11, 3.8, 2.8]], [TX + 9.31, [3, 21, 1.5]], [TX + 13.31, [2, 19, 2]], [TX + 14.71, [-26, 5, 7]], [TX + 15.61, [-30, 4, 8]]];
function rideOff(T) {
  if (T <= RIDE[0][0]) return RIDE[0][1];
  let i = 0; while (i < RIDE.length - 2 && RIDE[i + 1][0] <= T) i++;
  const [t0, a] = RIDE[i], [t1, b] = RIDE[i + 1], u = kk(T, t0, t1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
const T_BRAKE = TX + 15.61;
const tcOf = T => T < T_BRAKE ? T : T_BRAKE + .5 * (1 - Math.exp(-(T - T_BRAKE) / .5));
function camRide(T) {
  const Tc = tcOf(T), p = rodAt(Tc), o = rideOff(Math.min(T, T_BRAKE)), br = ss(T_BRAKE - .1, T_BRAKE + 1.2, T);
  let eye = V.add(V.mad(p, DIRP, o[0]), V.add(V.mul(SIDE, o[1] + 500 * br), V.mul(UPD, o[2] + 420 * br)));
  const pr = rodAt(T);
  if (T < T_EX) return camExit(T);
  if (T < T_ON) {
    const u = (T - T_EX) / (T_ON - T_EX), h = ss(0, .72, u), w = ss(.05, 1, u);
    const base = V.lerp(MZ0, pr, h), offA = V.sub(EX_END.eye, MZ0);
    const offR = V.add(V.mul(DIRP, RIDE[0][1][0]), V.add(V.mul(SIDE, RIDE[0][1][1]), V.mul(UPD, RIDE[0][1][2])));
    eye = V.add(base, V.add(V.mul(offA, 1 - w), V.mul(offR, w)));
    const tg = lookMix(eye, V.add(eye, V.sub(EX_END.target, EX_END.eye)), lookMix(eye, V.mad(pr, DIRP, 3000), V.mad(pr, DIRP, 3), .3), ss(0, .45, u));
    return { eye, target: tg, fov: (50 + 2 * u - 18 * Math.sin(PI * u) ** 2) * DEG };
  }
  const atRod = V.mad(pr, DIRP, 1), ahead = lookMix(eye, V.mad(pr, DIRP, 3000), V.mad(pr, DIRP, 3), .3);
  const wS = ss(RIDE[1][0], RIDE[2][0], T), wD = ss(RIDE[3][0], RIDE[4][0], T);
  let tg = ahead;
  tg = lookMix(eye, tg, atRod, wS);
  tg = lookMix(eye, tg, V.lerp(V.mad(pr, DIRP, 2000), HIT, br), wD * (.62 + .38 * br));
  return { eye, target: tg, fov: E.mix(52, 46, wS * (1 - wD)) * DEG };
}
const UPH = V.norm(V.sub(HIT, CE));
const TOG = V.norm([-HD_[0], 0, -HD_[2]]), SIDEG = V.norm([HD_[2], 0, -HD_[0]]);
const E_K = camRide(TI + .3).eye;
function camStrike(T) {
  const u = kk(T, TI + 1.0, TI + 7.6), a = Math.max(0, aOf(T));
  const eye = T < TI + 1.0 ? camRide(T).eye : V.lerp(E_K, GCAM, u);
  return { eye, target: V.lerp(HIT, V.add(HIT, V.mul(UPH, 80 + FX.capH(a) * .5)), u), fov: E.mix(50, 36, u) * DEG };
}
function camGround(T) {
  const a = Math.max(0, aOf(T)), u = ss(TI + 7.6, T_RET + 1, T);
  const eye = V.add(GCAM, V.add(V.mul(UPH, 20 * u), V.mul(V.norm(V.sub(HIT, GCAM)), 300 * u)));
  return { eye, target: V.add(HIT, V.mul(UPH, 80 + FX.capH(a) * .5 + 30 * u)), fov: 36 * DEG };
}
/* the climb back: up the trail to the barrel (from wherever the fall's camera left off at T_RET) */
const ALONG = V.norm(V.sub(SAT, HIT)), SIDEA = V.norm(V.cross(ALONG, EY)), UPA = V.norm(V.cross(SIDEA, ALONG));
const LSAT = V.dist(HIT, SAT);
const E_ARR = PW1([-170, 80, 400]), C_ARR = PW1([0, 0, 620]);
/* from the strike's last shot over the crater (REST: the FX module's camera at T_RET, read once after load; it blends
   into this climb itself), an easy rise off the crater for a couple of seconds, then up the trail: log-distance from the
   crater for the first half, to the platform for the second, eased at both ends; looking down at the column, then
   ahead at the barrel */
let REST = null;
const rest = () => REST || camGround(T_RET - .001);
function camClimb(T) {
  const s0 = rest(), x = kk(T, T_RET - .1, T_ARR);
  const L = V.dist(E_ARR, HIT), S0 = Math.max(200, V.dist(s0.eye, HIT)), M = L / 2, D1 = 300;
  const s = x < .5 ? S0 * Math.pow(M / S0, 2 * x) : L - D1 * (Math.pow(M / D1, 2 * (1 - x)) - 1) * M / (M - D1);
  const dir = V.norm(V.lerp(V.norm(V.sub(s0.eye, HIT)), V.norm(V.sub(E_ARR, HIT)), ss(0, .55, x)));
  const eye = V.mad(HIT, dir, s), down = V.mad(HIT, ALONG, s * .2);
  return { eye, target: lookMix(eye, lookMix(eye, s0.target, down, kk(x, .04, .3)), C_ARR, kk(x, .6, .95)), fov: E.mix(E.mix(s0.fov / DEG, 44, ss(0, .4, x)), 46, ss(.6, 1, x)) * DEG };
}
const PATH_R = FILM.path([
  P1(T_ARR, [-170, 80, 400], [0, 0, 620], 46),
  P1(T_ARR + 3.6, [-130, 64, 110], [0, 0, 280], 48),
  P1(T_ARR + 7.4, [-560, 320, -40], [0, 0, -300], 46),
]);
const EYE_MB = V.add(V.mad(MID, SAX, -2300), V.add(V.mul(EX, -500), V.mul(EY, 300)));
const camMoveB = T => { const Wt = platAt(T); return { eye: EYE_MB, target: X.ap(Wt, [0, -40, -60 + 200 * slewU(T)]), fov: 44 * DEG }; };
const DBGCAM = (() => { const q = STAGE.Q.get('cam'); return q ? q.split(',').map(Number) : null; })();
/* the fall and the strike may be filmed by the FX module (FX.cam(T, FC) -> a shot, or null for the base camera) */
let FC = null;
function camAt(T) {
  if (FX.cam && FC) { const c = FX.cam(T, FC); if (c) return c; }
  return camBase(T);
}
function camBase(T) {
  if (DBGCAM) { const Wt = platAt(T); return { eye: X.ap(Wt, DBGCAM.slice(0, 3)), target: X.ap(Wt, DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 40) * DEG }; }
  if (T < 35.4) return PATH_A1(T);
  if (T < 37.6) return K.blendShot(PATH_A1(35.4), PATH_A2(37.6), kk(T, 35.4, 37.6));
  if (T < MOVE[0] - .2) return PATH_A2(T);
  if (T < MOVE[0] + 1.8) return K.blendShot(PATH_A2(Math.min(T, MOVE[0] - .2)), camMove(T), kk(T, MOVE[0] - .2, MOVE[0] + 1.8));
  if (T < MOVE[1] - 1) return camMove(T);
  if (T < CAL[0] + .4) return K.blendShot(camMove(T), camCal(T), kk(T, MOVE[1] - 1, CAL[0] + .4));
  if (T < CAL[1] - .2) return camCal(T);
  if (T < SPINW[0] - .4) return K.blendShot(camCal(T), PATH_B(SPINW[0] - .4), kk(T, CAL[1] - .2, SPINW[0] - .4));
  if (T < COILW[1]) return PATH_B(T);
  if (T < COILW[1] + 1.2) return K.blendShot(PATH_B(COILW[1]), camCharge(T), kk(T, COILW[1], COILW[1] + 1.2));
  if (T < CH1 - .2) return camCharge(T);
  if (T < TF) return K.blendShot(camCharge(T), camFire(TF), kk(T, CH1 - .2, TF));
  if (T < T_GO) return camFire(T);
  if (T < TI + 1.0) return camRide(T);
  if (T < TI + 7.6) return camStrike(T);
  if (T < T_RET - .1) return camGround(T);
  if (T < T_ARR) return camClimb(T);
  if (T < T_ARR + 7.4) return PATH_R(T);
  if (T < T_ARR + 9) return K.blendShot(PATH_R(T), camMoveB(T), kk(T, T_ARR + 7.4, T_ARR + 9));
  if (T < DUR - 3.4) return camMoveB(T);
  return K.blendShot(camMoveB(T), { eye: OPEN.eye, target: OPEN.target, fov: OPEN.fov * DEG }, kk(T, DUR - 3.4, DUR - .1));
}

/* ---------- tags ---------- */
const PTAGS = [
  ['01', 'THERMOELECTRIC CORE', 'Ø 56 M', Q => Q.W, [0, 29, -614], 6.4, 8.4],
  ['02', 'RADIATOR FIN ×12', '6 PANELS · 84 M', Q => Q.fins[3 * 6 + 5], [14, 0, 32], 10.6, 12.8],
  ['03', 'SEEBECK COUPLES ×1280', 'P/N · 8 ROWS', Q => Q.W, [-20.9, 20.9, -608], 14.0, 16.4],
  ['04', 'HOT SHOE → COLD SHOE', 'ΔT 760 K', Q => Q.W, [-20.2, 20.2, -630], 15.6, 17.6],
  ['05', 'BARREL SEGMENT ×6', '150 M', Q => Q.seg[1], [0, 11.5, 75], J0 + 2.8, J0 + 5.2],
  ['06', 'LOCK JAWS ×12', 'JOINT 3', Q => Q.colS[3], [3.4, 14.4, 0], JW(3)[1] + .05, JW(3)[1] + 1.4],
  ['07', 'MUZZLE STAGE ×3', '+100 M', Q => Q.tel[1], [0, 9, 18], TELW[0] + 1, TELW[1]],
  ['08', 'GYRO RING · Ø 340 M', '16 NODES', Q => Q.nodes[3], [0, 0, 6], RINGW[0] + 2.8, RINGW[1] + .4],
  ['23', 'CRYOGEN TANKS ×12', 'LHe · 4.2 K', Q => Q.W, [P.TANK_RC * .87, P.TANK_RC * .5 + P.TANK_R, -230], RINGW[1] + .4, ENGX[0]],
  ['09', 'ENGINE · VECTORED', '±12°', Q => Q.bells[1], [0, 0, -14], ENGX[0] + .6, GCHK[1] + .1],
  ['10', 'LASER EMITTER', '', Q => Q.W, P.LZ.emit, LOCK_T[0] - .3, LOCK_T[0] + 1.0],
  ['11', 'MIRROR · HUB', '4 RING SENSORS', Q => Q.W, P.LZ.mHub, LOCK_T[1], LOCK_T[1] + 1.6],
  ['12', 'JOINT SENSOR 3/5', 'LOCKED', Q => Q.colS[3], [0, P.BEAM_Y, 1.1], SENS_T(3) + .45, SENS_T(3) + 1.6],
  ['13', 'ROTARY SWITCH ×4', 'ENGINES → GUN', Q => Q.switches[2], [0, 0, 0], SWW[0] - .2, SWW[1] + .9],
  ['14', 'SKIN FLAPS ×540', '', Q => Q.bay[8], [0, 11.6, 5], FLW[0][0] + .6, FLW[0][1] + .5],
  ['15', 'PULSE CASSETTES ×540', '', Q => Q.bay[24], [0, 16, 5], FLW[1][0] + .8, FLW[1][1] + .6],
  ['16', 'MAGNET TUBES ×9', 'SUPERCONDUCTING', Q => Q.bay[33], [0, 6.4, 5], FLW[2][0] + .6, FLW[2][1]],
  ['17', 'BREECH BLOCK', 'OPEN', Q => Q.block, [0, 2.4, -14.6], BRO[0] + .3, AT_FAB],
  ['18', 'LOCK RINGS ×3', '', Q => Q.locks[2], [0, 3.4, 0], LOCKW[0] + .2, LOCKW[1] + .5],
  ['19', 'CLAMPS ×12', '', Q => Q.clamps[1], [1.4, 0, 0], CLAMPW[0], CLAMPW[1] + .6],
  ['20', 'CHAMBER COILS', '', Q => Q.W, [0, 4.4, -9], COILW[0] + .3, COILW[1] + .2],
  ['21', 'MUZZLE IRIS · 6 PETALS', '', Q => Q.crown, [0, 5.6, 4.6], IRIS[0] + .1, IRIS[1] + .1],
  ['22', 'CHARGE RINGS ×198', '', Q => Q.bay[10], [0, 3.7, 2.5], CH0 + .8, CH0 + 2.6],
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
/* the structure's screen box from its real extremities in this pose (muzzle, reactor, fins, ring nodes, engines) */
const XP = [];
for (let i = 0; i < 40; i++) XP.push([0, 0, 0]);
function platBox(PP, pad) {
  let n = 0;
  const put = (Tw, p) => P.apTo(XP[n++], Tw, p);
  put(PP.W, [0, 0, P.REA_Z0 - 26]); put(PP.crown, [0, 0, P.CROWN_L]);
  for (let s = 0; s < NSEG; s++) { put(PP.seg[s], [0, -P.HA, 0]); put(PP.seg[s], [0, P.HA, P.LSEG]); }
  for (let i = 0; i < P.NND; i += 4) put(PP.nodes[i], [4.5, 0, 0]);
  for (let f = 0; f < P.NFIN; f += 3) put(PP.fins[f * 6 + 5], [P.FPW, 0, 32]);
  for (let e = 0; e < 4; e++) put(PP.exts[e], [0, 0, -P.BELL_L - 12]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { const p = XP[i]; if (!K.pj(p[0], p[1], p[2])) return null; x0 = Math.min(x0, K.PJ[0]); y0 = Math.min(y0, K.PJ[1]); x1 = Math.max(x1, K.PJ[0]); y1 = Math.max(y1, K.PJ[1]); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
function markTags(T, Wt, PP) {
  const inMove = T > MOVE[0] + 1.6 && T < MOVE[1] - 1;
  if (PP && (T < 2.6 || inMove || T > DUR - 2.6)) {
    const a0 = T < 2.6 ? 1 - ss(2, 2.6, T) : T > DUR - 2.6 ? ss(DUR - 2.2, DUR - 1.2, T) : ss(MOVE[0] + 1.6, MOVE[0] + 2.2, T) * (1 - ss(MOVE[1] - 1.6, MOVE[1] - 1, T));
    const lab = inMove ? 'TO STATION' : 'RAILGUN PLATFORM', val = inMove ? `${(V.dist(Wt.T, SAT) / 1000).toFixed(2)} KM` : `${Math.round(ALT / 1000)} KM`;
    const b = platBox(PP, 8), px = b ? Math.max(b[2] - b[0], b[3] - b[1]) : 1e9;
    const wb = b && b[1] > 70 ? 1 - ss(1300, 1600, px) : 0;
    if (a0 * wb > .01) { K.bracket(b, '#C6F432', .8 * a0 * wb, 14, 1.2); K.setTag(T_PLAT, 'SAT', lab, val, 'lime sm', Math.max(b[0], b[2] - K.tagW(T_PLAT)), b[1] - 26, a0 * wb); }
  }
  if (T > T_ON - .6 && T < TI - .3) {
    const p = rodAt(T);
    if (K.pj(p[0], p[1], p[2]) && K.onS(-40)) { const a = ss(T_ON - .6, T_ON - .1, T) * (1 - ss(TI - .9, TI - .3, T)); K.leader(K.PJ[0], K.PJ[1], K.PJ[0] + 40, K.PJ[1] - 44, '#C6F432', .8 * a); K.setTag(T_ROD, 'ROD', `ALT ${(altOf(p) / 1000).toFixed(1)} KM`, `${(vAt(sOf(T)) / 1000).toFixed(2)} KM/S`, 'lime sm', K.PJ[0] + 44, K.PJ[1] - 58, a); }
  }
  if (T > TX + 12.5 && T < TI + .1) {
    const a = ss(TX + 12.7, TX + 13.3, T) * (1 - ss(TI - .15, TI + .05, T));
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
const fmtRate = r => r >= 1000 ? `<span class="l">×${Math.round(r / 1000)}k</span>` : r > 1.5 ? `<span class="l">×${Math.round(r)}</span>` : r < .67 ? `<span class="l">×1/${Math.round(1 / r)}</span>` : '×1';
const pct = u => `${Math.round(E.sat(u) * 100)} %`;
const ALIGN0 = .0137;
function alignAt(T) { let n = 0; for (let k = 1; k < NSEG; k++) if (T > SENS_T(k) + .5) n++; if (T > CROWN_T + .4) n++; return n >= NSEG ? .0001 : ALIGN0 * Math.pow(.42, n); }
function readout(T, TR) {
  const ci = FCH.reduce((a, c, i) => c.t <= TR ? i : a, 0);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${FCH[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2;
  const iq = SEG.k >= 0 ? INS[SEG.k] : null;
  if (iq) {
    const r = iq.mod.readout ? iq.mod.readout(SEG.u, CTX) : {};
    const html = `${r.l1 || ''}<br>${r.l2 || ''}<br>${fmtRate(r.rate || 1)}`;
    if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
    return;
  }
  const h = heatOf(T);
  if (T < T_WAKE) { l1 = `Orbit · <b>${km(ALT)} km</b> · <b>7.68 km/s</b>`; l2 = 'Platform <b>dormant</b> · stowed'; }
  else if (T < HEATW[0]) { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = `Status <b>${Math.min(P.LTS.length, Math.max(0, Math.floor((T - T_WAKE - .3) / 3 * P.LTS.length)))}/${P.LTS.length}</b> lights`; }
  else if (T < FINW[0]) { l1 = `Hot shoe · <b>${Math.round(480 + 770 * (h - .22) / .78)} K</b> · cold shoe <b>${Math.round(300 + 180 * (h - .22) / .78)} K</b>`; l2 = T < CURW[0] ? 'Core <b>heating</b>' : `Couples · <b>1280</b> in series · <b>${(46 * ss(CURW[0], CURW[0] + 2, T)).toFixed(0)} MW</b>`; }
  else if (T < J0) { l1 = `Radiators · <b>${pct(ST.fin)}</b> · 12 fins`; l2 = `Rejecting <b>${(120 * ST.fin).toFixed(0)} MW</b> heat`; }
  else if (T < TELW[0]) { let n = 0; for (let j = 1; j < NSEG; j++) if (ST.joint[j] > .99) n++; l1 = `Barrel · joint <b>${Math.min(NSEG - 1, n + 1)}/${NSEG - 1}</b>`; l2 = `Length <b>${150 * (1 + n)} m</b> of 1003`; }
  else if (T < RINGW[0]) { l1 = `Muzzle stages · <b>${pct(ST.tel)}</b>`; l2 = `Barrel · <b>${Math.round(900 + 103.5 * ST.tel)} m</b>`; }
  else if (T < ENGX[0] - .3) { const r = PP_.ring.r; l1 = `Gyro ring · <b>Ø ${Math.round(2 * r + 9)} m</b>`; l2 = T < RINGW[1] ? `Knees <b>${(PP_.ring.k / DEG).toFixed(0)}°</b>` : `Latched <b>16/16</b> · <b>${(4.2 * ringPow(T)).toFixed(1)} MW</b>`; }
  else if (T < CAL[0] - .2) { const d = V.dist(PLAT.W.T, SAT), togo = Math.acos(E.clamp(V.dot(X.dir(PLAT.W, [0, 0, 1]), AIM), -1, 1)) / DEG; l1 = T < MOVE[0] ? `Engines · nozzles <b>${pct(ST.engExt)}</b> · gimbal check` : `Station · <b>${(d / 1000).toFixed(2)} km</b> to go`; l2 = `Slew · <b>${togo.toFixed(0)}°</b> to go`; }
  else if (T < SPINW[0] - .2) { l1 = `Alignment · <b>${alignAt(T).toFixed(4)}°</b>`; l2 = T > ALIGN_T ? 'Bore <b>straight</b> · locked' : 'Laser line · <b>scanning</b>'; }
  else if (T < SWW[0] - .6) { l1 = `Gyro ring · <b>${(30 * spinFrac(T) / 60).toFixed(2)} rpm</b>`; l2 = 'Attitude <b>held</b>'; }
  else if (T < FLW[0][0] - .2) { l1 = `Switches · <b>${ST.sw < .5 ? 'engines' : 'gun'}</b>`; l2 = `Gun bus · <b>${pct((gunFront(T) + 134) / (Z_MZ + 134))}</b>`; }
  else if (T < UNLK[0] - .2) { const s = T < FLW[1][0] ? 'opening' : T < FLW[2][0] ? 'half' : 'full'; l1 = `Barrel · <b>${s}</b>`; l2 = `Magnets · <b>${pct((magFront(T) - Z_CH) / (Z_MZ - Z_CH))}</b> · 4.2 K`; }
  else if (T < AT_FAB + .01) { l1 = `Breech · <b>${T < BRO[0] ? 'unlocking' : 'opening'}</b>`; l2 = 'Chamber · <b>empty</b>'; }
  else if (T < COILW[1] + .2) { l1 = `Round · <b>chambered</b> · 22.7 t`; l2 = T < LOCKW[0] ? 'Breech <b>closing</b>' : T < CLAMPW[0] ? 'Lock rings <b>turning</b>' : T < COILW[0] ? 'Clamps <b>12/12</b>' : `Chamber coils · <b>${pct(ss(COILW[0], COILW[1], T))}</b>`; }
  else if (T < TF) { const n = Math.round(198 * E.sat((T - CH0) / (CH1 - CH0))); l1 = T < CH0 ? 'Charge rings · <b>armed</b>' : `Charge rings · <b>${n}/198</b>`; l2 = T > IRIS[0] ? `Iris · <b>${pct(ST.iris)}</b> · fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>` : `Fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>`; }
  else if (T < TX) { const z = rodZof(T) - Z_CH, u = (T - TF) / TR_D; l1 = `Round · <b>${z.toFixed(0)} m</b> of ${BLEN.toFixed(0)}`; l2 = `<b>${(V_MZ * u / 1000).toFixed(2)} km/s</b> · +<b>${((T - TF) * RATE_TR * 1000).toFixed(0)} ms</b>`; }
  else if (T < T_ON - .6) { l1 = `Muzzle · <b>${(V_MZ / 1000).toFixed(2)} km/s</b>`; l2 = 'Recoil · <b>0.3 m/s</b> · held'; }
  else if (T < TI) { const p = rodAt(T), hh = altOf(p); l1 = `Rod · alt <b>${km(hh)} km</b>`; l2 = `<b>${(vAt(sOf(T)) / 1000).toFixed(2)} km/s</b> · ${hh < 100000 ? 'entry' : 'coast'}`; }
  else if (T < T_RET) { const a = aOf(T); l1 = `Impact · <b>${(vAt(L0) / 1000).toFixed(2)} km/s</b>`; l2 = a < 4 ? `Shock · <b>${Math.round(FX.shockR(a))} m</b>` : `Column · <b>${(FX.capH(a) / 1000).toFixed(2)} km</b>`; }
  else if (T < MOVE_B[0]) { l1 = `Platform · <b>${km(ALT)} km</b>`; l2 = T < T_ARR ? 'Power · <b>to engines</b>' : T < RING_B[0] ? 'Barrel <b>closing</b>' : 'Gyro ring <b>folding</b>'; }
  else if (T < LIGHTS_OFF[1] - .4) { l1 = `Park · <b>${(V.dist(PLAT.W.T, SAT0) / 1000).toFixed(2)} km</b>`; l2 = T < LIGHTS_OFF[0] ? 'Stowing' : 'Dormant · <b>waiting</b>'; }
  else { l1 = `Orbit · <b>${km(ALT)} km</b> · <b>7.68 km/s</b>`; l2 = 'Platform <b>dormant</b> · stowed'; }
  const sc = simClock(T), sg = sc < 0 ? '−' : '+', a = Math.abs(sc);
  const l3 = `T${sg}${String(Math.floor(a / 60)).padStart(2, '0')}:${(a % 60).toFixed(1).padStart(4, '0')} · ${fmtRate(rateOf(T))}`;
  const html = `${l1}<br>${l2}<br>${l3}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const PROF = STAGE.Q.has('prof') ? {} : null; let PT = 0;
function prof(n) { const t = performance.now(); if (n) PROF[n] = (PROF[n] || 0) + t - PT; PT = t; }
let NDOT = 0;
const DO = { L: L_SUN, fx, occ: true, keep: 1, a: 1, lc: [255, 255, 255] };
const DOJ = Object.assign({}, DO), DOC = Object.assign({}, DO), DOH = Object.assign({}, DO), DOHL = Object.assign({}, DO), DOX = Object.assign({}, DO);
const LOOK = { o: DO, jk: DOJ, cp: null, hsg: DOH, hall: DOHL, x: DOX, bar: null, skin: null, wave: null };
const xr = (T, w) => ss(w[0], w[1], T) * (1 - ss(w[2], w[3], T));
function render(TR) {
  if (PROF) prof(null);
  K.beginTags();
  const sg = mapIn(TR), T = sg.T, iq = sg.k >= 0 ? INS[sg.k] : null;
  FXT = T; INS_ON = !!iq;
  const Wt = platXf(T), st = stateAt(T);
  if (iq) { CTX.T = TR; CTX.u = sg.u; CTX.Tb = T; CTX.Wt = Wt; CTX.st = st; CTX.PP = null; CTX.camOld = camAt(iq.at); }
  FILM.apply(C, iq ? iq.mod.cam(sg.u, CTX) : camAt(T));
  const ax = T - TX, a = aOf(T);
  C.shake = ax > 0 && ax < 1.4 ? FILM.shake(T, 6 * (1 - ax / 1.4), 26) : T > TF && T < TX ? FILM.shake(T, 1.2, 34) : a > 0 && a < 3 ? FILM.shake(T, 9 * (1 - a / 3), 22) : [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? .08 : .1; C.update();
  K.pb.clear(); K.occReset();
  const dPlat = V.dist(C.eye, Wt.T);
  const zr_ = V.dist(C.eye, C.target), wide = ss(450, 1400, zr_);
  ORL.frame({ zref: Math.max(60, zr_), PXF: 3.4 + .8 * wide, PXL: 1.5 + .6 * wide });
  W.LG.zref = Math.max(500, V.dist(C.eye, C.target));
  if (PROF) prof('setup');
  const PP = dPlat < 60000 ? P.pose(Wt, st) : null;
  if (iq) CTX.PP = PP;
  const hideBase = !!(iq && iq.mod.hideBase);
  if (PROF) prof('pose');
  // X-rays: the jacket (couples), the housing (chamber), the bay's walls (the insert)
  const xj = xr(T, XRJ), xh = Math.max(xr(T, [UNLK[0] - .4, UNLK[0] + .4, COILW[1] + .6, COILW[1] + 1.6]), iq ? 1 : 0), xb = Math.max(xr(T, [BRO[0], AT_FAB, BRC[0], BRC[1]]), iq ? 1 : 0);
  const skin = T < FLW[0][0] || T > FLB[1] + .2;
  // the reactor's slab clip (camera space) while the scan plane is in
  const clipOn = PP && xrOn(T);
  if (clipOn) {
    const nw = X.dir(Wt, [0, 0, 1]), base = V.dot(nw, Wt.T) - V.dot(nw, C.eye), CLP = ORL.G.clip || (ORL.G.clip = { on: false, n: [0, 0, 0], c0: 0, c1: 0 });
    CLP.on = true; CLP.n[0] = V.dot(nw, C.r); CLP.n[1] = V.dot(nw, C.u); CLP.n[2] = V.dot(nw, C.f); CLP.c0 = cutZ(T) + base; CLP.c1 = ZCUT_U + base;
  } else if (ORL.G.clip) ORL.G.clip.on = false;
  for (const o of [DO, DOJ, DOC, DOH, DOHL, DOX]) o.clip = clipOn;
  if (PP && dPlat < 9000) { P.occlude(PP, st, { skin, hsg: xh < .5, hall: xb < .5, coreTo: clipOn ? Math.min(P.REA_Z1, cutZ(T) - 1.7) : undefined }); ORL.G.occ = true; } else ORL.G.occ = false;
  if (PROF) prof('occlude');
  K.drawStars(W.STARS, .9 * (1 - ss(20000, 3000, alt)), TR);
  if (PROF) prof('stars');
  let n = 0;
  if (!hideBase) n += W.drawGlobe(1, 1);
  if (PROF) prof('globe');
  if (!hideBase) W.drawLimb(1);
  if (PROF) prof('limb');
  if (alt < 120000 && !hideBase) {
    const SH = W.SH;
    if (a > 0) { SH.x = HIT[0]; SH.z = HIT[2]; SH.r1 = 9000; SH.r0 = FX.shockR(a); SH.wd = 40 + 10 * a; SH.k = 1.2 * Math.exp(-a / 7) * (1 - ss(14, 20, a)); SH.col = a < 1.5 ? HOT : LIME; SH.glow = 1.8 * Math.exp(-a * 1.1); SH.gr = 1400; SH.hole = 40; SH.dark = .7; SH.dr = 260; }
    else SH.r1 = -1;
    n += W.drawSite(1 - ss(60000, 120000, alt), T * .8, 3.4 * (1 + 1.2 * (a >= 0 ? FX.flashA(a) : 0)) * (1 + .15 * ss(TI - .2, TI + .4, T) * (1 - ss(TI + 4.6, TI + 6.4, T))));
    if (alt < 60000) W.drawVehicles(v => a > 0 && FX.shockR(a) > v.d);
  }
  if (PROF) prof('ground');
  if (PP && !hideBase) {
    P.apTo(RCW, Wt, [0, 0, -600]);
    DO.lc = chg(T) > .3 ? LIME : [255, 255, 255];
    DOJ.keep = 1; DOJ.a = 1;
    DOC.a = .2 + .8 * xj; DOC.lime = 0;
    DOH.keep = 1 - .86 * xh; DOH.a = 1 - .66 * xh;
    DOHL.keep = 1 - .8 * xb; DOHL.a = 1 - .55 * xb;
    DOX.a = 1 + .3 * xh; DOX.lime = .25 * xh;
    LOOK.cp = xj > .02 ? DOC : null; LOOK.wave = ST.wave > 0 ? waveFn : null; LOOK.skinOcc = skin && ORL.G.occ;
    P.draw(PP, st, LOOK);
    if (PROF) prof('platform');
    drawPower(T, Wt); drawSection(T, Wt); drawRingPower(T, Wt, PP); drawEngines(T, Wt, PP); drawLasers(T, PP); drawFields(T, Wt); drawDischarge(T, Wt);
    if (T > TF && T < TX && FX.bore) FX.bore(Wt.T, X.dir(Wt, [0, 0, 1]), Math.max(Z_CH, rodZof(T) - 90), rodZof(T) - 4, T);
    if (ax > -.05 && ax < 4.2 && FX.shot) FX.shot(PP.muzzle, X.dir(Wt, [0, 0, 1]), X.dir(Wt, [1, 0, 0]), X.dir(Wt, [0, 1, 0]), ax, 1);
  }
  // the rod in flight
  if (T > TX && T < TI) {
    const p = rodAt(T), h = altOf(p), heat = ss(110000, 40000, h), dc = V.dist(C.eye, p);
    if (dc < 4000) ORL.draw(P.rods[0], X.make(R.look(DIRP, EY), p), { L: L_SUN, a: 1.6, fx: () => heat > .05 ? 1 + heat : 0 });
    FX.sheath(p, DIRP, PXP, PYP, heat, T);
    if (dc < 3000) FX.petals(p, DIRP, PXP, PYP, T - TX, 1);
  }
  if (T > TX) FX.trail(FALL, T, T < T_RET ? 1 : 1 - .6 * ss(T_RET, T_ARR + 8, T) - .4 * ss(T_ARR + 8, DUR - .4, T));     // gone by the loop
  if (a >= 0) {
    FX.strike(a, 1);
    for (const v of W.VEHS) { const ts = a - (v.d - 20) / 900; if (ts > 0 && ts < 8 && FX.shockR(a) > v.d) FX.debris(v.c, ts, 1); }
  }
  if (iq && iq.mod.draw) iq.mod.draw(sg.u, CTX);
  if (PROF) prof('fx');
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (ax > 0 && ax < .6) fl = .18 * Math.exp(-ax * 7);
  if (a >= 0) fl = Math.max(fl, FX.flashA(a));
  if (fl > .004) { octx.fillStyle = `rgba(240,246,226,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (iq) { if (iq.mod.tags) iq.mod.tags(sg.u, CTX); }
  else { if (PP && dPlat < 2500) partTags(T, PP); markTags(T, Wt, PP); }
  if (PROF) prof('overlay');
  readout(T, TR);
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
  [HEATW[0], () => SFX.tone(60, 120, 2.6, 'sawtooth', .01)], [CURW[0], () => SFX.tone(400, 1600, 1.4, 'sine', .012)],
  [FINW[0], () => whir(FINW[1] - FINW[0])], [FINW[1], clunk],
  ...[1, 2, 3, 4, 5].map(j => [JW(j)[0], () => SFX.tone(50, 80, JDUR, 'sawtooth', .012)]), ...[1, 2, 3, 4, 5].map(j => [JW(j)[1] + .7, () => { clunk(); tick(); }]),
  [TELW[0], () => whir(3)], [TELW[1], clunk],
  [RINGW[0], () => SFX.tone(60, 110, RINGW[1] - RINGW[0], 'sawtooth', .01)], [RINGW[1], () => { clunk(); tick(); }], [RCUR[0], () => SFX.tone(300, 1200, 1.2, 'sine', .01)],
  [ENGX[0], () => whir(1.2)], [BURN[0], () => SFX.noise(4, 180, 1, .03, 1)], [RETRO[0], () => SFX.noise(3, 400, .8, .02, 1)],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => [[LOCK_T[0], LOCK_T[1], LOCK_T[2], LOCK_T[3], SENS_T(1), SENS_T(2), SENS_T(3), SENS_T(4), CROWN_T][k] + .45, () => SFX.tone(1800 + 120 * k, 1800 + 120 * k, .06, 'sine', .012)]),
  [ALIGN_T, () => SFX.tone(880, 1760, .4, 'sine', .014)],
  [SPINW[0], () => SFX.tone(40, 160, SPINW[1] - SPINW[0], 'sawtooth', .01)],
  [SWW[1], () => { clunk(); SFX.tone(200, 900, .8, 'sine', .014); }],
  ...FLW.map(w => [w[0], () => SFX.noise(1.6, 900, .6, .015, .4)]), [MAGW[0], () => SFX.tone(70, 300, MAGW[1] - MAGW[0], 'sine', .01)],
  [UNLK[1], clunk], [BRO[1], clunk], [BRC[1], clunk], [LOCKW[1], () => { clunk(); tick(); }], [CLAMPW[1], () => { tick(); tick(); }], [COILW[0], () => SFX.tone(90, 500, 1.4, 'sawtooth', .01)],
  [IRIS[0], () => whir(1.2)], [IRIS[1], clunk], [CH0, () => SFX.tone(110, 1800, CH1 - CH0 + .8, 'sawtooth', .014)],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [CH0 + k * (CH1 - CH0) / 10, () => SFX.tone(900 + 80 * k, 900 + 80 * k, .05, 'square', .01)]),
  [TF, () => { SFX.tone(1400, 300, TR_D, 'sawtooth', .02); }],
  [TX, () => { SFX.crack(); SFX.rumble(3.5, .3); SFX.tone(900, 50, 1.8, 'sine', .07); }],
  [TX + .4, () => SFX.noise(3.2, 400, .8, .02, 1.2)], [TX + 2.6, () => SFX.noise(9, 1400, .5, .02, 4)],
  [TX + 8.3, () => SFX.noise(7, 700, .7, .03, 3)],
  [TI, () => { SFX.crack(); SFX.rumble(7, .4); SFX.tone(70, 30, 4, 'sine', .08); }], [TI + 1.2, () => SFX.rumble(6, .25)],
  [T_RET, () => SFX.tone(300, 900, 3, 'sine', .01)], [FLB[1], clunk], [RING_B[1], clunk], [BURN_B[0], () => SFX.noise(3, 180, 1, .02, 1)],
  ...[1, 2, 3, 4, 5].map(j => [JWB(j)[1], clunk]), [FIN_B[1], clunk], [LIGHTS_OFF[0], () => SFX.tone(660, 220, 1.6, 'sine', .01)],
];
/* the inserts: built, placed, the chapters and cues mapped onto the film clock */
function tagAt(tg, id, lab, val, p, a, age) {
  if (a < .01 || !K.pj(p[0], p[1], p[2]) || !K.onS(-40)) return;
  const x = K.PJ[0], y = K.PJ[1], dx = x > 1100 ? 54 : -54, lx = x + dx;
  K.leader(x, y, lx, y - 50, '#C6F432', .8 * a); K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
  const w = K.tagW(tg);
  K.setTag(tg, id, K.decode(lab, E.sat(age / .7), FXT, id.length), val, 'lime sm', dx > 0 ? lx + 4 : lx - 4 - w, y - 62, a);
}
const BAYf = Tb => X.mul(platAt(Tb), P.BAYX), CHAMBERf = Tb => X.mul(platAt(Tb), P.CHAMBERX);
const CTX = { K, L: ORL, P, W, FX, M3, V, R, X, E, LIME, HOT, WH, CORAL: K.CORAL, T: 0, u: 0, Tb: 0, Wt: null, PP: null, st: null, camOld: null, tagAt, SAT, CE, RE, HIT, L_SUN, PW0, PW1, camAt: t => camAt(t),
  BAY: BAYf, CHAMBER: CHAMBERf, BAY_HALF: P.BAY_H.slice(), CHAMBER_IN_BAY: [0, 0, P.Z_RND - P.BAY_C[2]],
  ROUND: { len: P.RND_L, r: P.RND_R, armature: .9, rodLen: P.ROD_L, rodR: P.ROD_R, boreR: P.BORE_R }, AT_FAB };
for (const q of INS_SPEC()) if (q.mod && q.mod.len > 0) INS.push({ at: q.at, mod: q.mod, len: q.mod.len });
INS.sort((a, b) => a.at - b.at);
{ let off = 0; for (const q of INS) { q.r0 = q.at + off; off += q.len; } DURF = DUR + off; }
for (const q of INS) if (q.mod.build) { const t0 = performance.now(); q.mod.build(CTX); lap(`insert ${q.at} (${(performance.now() - t0).toFixed(0)} ms build)`); }
const FCH = CHAPTERS.map(c => ({ t: mapOut(c.t), title: c.title })).concat(...INS.map(q => (q.mod.chapters || []).map(c => ({ t: q.r0 + c.t, title: c.title })))).sort((a, b) => a.t - b.t);
const FCUES = cues.map(([t, fn]) => [mapOut(t), fn]).concat(...INS.map(q => (q.mod.cues || []).map(([u, fn]) => [q.r0 + u, fn])));
/* the fall and strike module's context (FX.cam) */
FC = { TX, TI, T_RET, T_ON, TF, DUR, rodAt, sOf, altOf, vAt, aOf, tauOf, DIRP, SIDE, UPD, HIT, CE, RE, MZ0, SAT, GCAM, EY, PW0, PW1, platXf, FALL, camBase: t => camBase(t) };
/* the strike's last shot, where the climb takes off (FX.cam sets the crater's age as a side effect: restored) */
if (FX.cam) { const a0 = W.CRA ? W.CRA.a : 0, c = FX.cam(T_RET - .15, FC); if (W.CRA) W.CRA.a = a0; if (c) REST = { eye: c.eye.slice(), target: c.target.slice(), fov: c.fov }; }
lap('load');
FILM.run({ duration: DURF, chapters: FCH, render, cues: FCUES });
STAGE.dbg = () => ({ INS: INS.map(q => ({ at: q.at, r0: q.r0, len: q.len })), DURF, mapOut, mapIn: t => Object.assign({}, mapIn(t)), log: LOG, ndot: NDOT, prof: PROF, stats: P.stats(), by: ORL.G.by, TX, TI, T_RET, T_ARR, TAU_END, L0, cam: T => camAt(T), W, FX, P, HIT, GCAM, PW0, PW1, platXf, C, rodAt, altOf, sOf, tauOf, aOf, FALL, ST, simClock, rateOf });
})();
