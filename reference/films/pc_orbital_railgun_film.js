/* ORBITAL · RAILGUN (Point Cloud). A 1.7 km orbital railgun (pc_orbital_railgun_platform.js) parked 380 km up and
   1.6 km short of its firing station, 230 km down-range of a coastal battery. Its barrel does not exist until it is
   needed: a construction ring leaves the ship and builds it in space, a kilometre of it, and takes it apart again
   after the shot. One take (base timeline below, plus the fabrication insert), loops.
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
const hh = K.hh;

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- the model (its dimensions set the shot's timing) ---------- */
const P = ORP(ORL);
lap('platform ' + JSON.stringify(P.stats()));
const Z_MZ = P.Z_MZ, Z_CH = P.Z_RND, NB = P.NB, NSEG = P.NSEG, PP_ = P.PP, LSEG = P.LSEG;

/* ---------- time ----------
   Base time T (s); the fabrication insert splices at AT_FAB. Where things are: platform frame (m; +Z the bore toward
   the muzzle, +Y the top, +X starboard, origin the chamber's front face); P.POI holds the fixed points, crZ(T) the
   construction ring's z, frontZ(T, L) a build layer's front (0 liner, 1 magnets, 2 frame, 3 cassettes, 4 flaps).
     0      Orbit      dormant at the park; no barrel; the construction ring (CR, r 92) docked round the prow (z -24);
                       the stabiliser rings A, B (z -305, -365, r 250) still; lights low.
     3      Wake       a lime wave out of the reactor (z -650); the lights come on (T_WAKE).
     5      Cutaway    XRJ: the reactor's stepped cutaway opens (window facing port and up: P.POI.cut, P.POI.cutDir):
                       DRUMW the control drums turn, HEATW the core heats (x600), CURW heat crosses the couples and
                       current runs round them in series out to the bus; FINW the twelve radiator fins open (x8),
                       glowing hot at the root, cold at the tip; the pumps cycle; XRJ[2..3] it closes.
     24     Rings      RSPW: the stabiliser pair spins up counter-rotating (x60 -> x8; 2 rpm), their momentum
                       wheels spin; from ARC0 arcs jump between the rings, current rides their rails.
     31.6   Thrust     ENGX nozzles out, GCHK gimbal check (stern: P.POI.nozzles); MOVE 1.6 km to the station on the
                       engines alone (x20); SLEW: the rings turn the ship onto the coast (scissor tilt, torque arrows).
     44     Detach     CRU the dock's arms swing back, CRS the CR's rim spins up (blur), CRL the six prow lasers find
                       its receivers (r 52), CRD it moves out to the chamber's face.
     52     Build      BUILD (x60): the CR flies the bore axis from z 4 to CR_PARK (Z_MZ + 260) building the barrel behind
                       it: green swarms stream from its emitters, lime lightning over the fresh layers; a collar locks
                       at each 150 m (LOCKC(k), k 1..5: the bore-line laser reaches its mast, jaws slam, the sleeve
                       screws in); the muzzle stages and the crown last (CROWN_DONE); it parks at CR_PARK, the shot's
                       line passing through it.
     127    Calibrate  CAL (x1): the laser line from the tower through the deck and prow mirrors, up the collar masts
                       to the crown and the CR; 0.0137 -> 0.0001 deg.
     136.8  Reroute .. Charge, Fire: as before (SWW, GUNP, CAPW the capacitor banks fill, FLW three opening waves,
                       UNLK, BRO, AT_FAB, BRC, LOCKW, CLAMPW, COILW, CH0..CH1, TF); the rings' spin dips through the
                       charge (their energy into the gun) and they take the recoil at TX (a damped wobble).
     T_RET  Return     (after the strike) T_ARR: flaps close, power back to the engines; UNB (x120) the CR runs back to
                       the prow taking the barrel apart behind it (the swarm flows back into it); CRK it docks, CRSB it
                       spins down; MOVE_B / SLEW_B back to the park (the rings turn it); SPIN_B the rings spin down;
                       FIN_B the fins close; LIGHTS_OFF the lights die in sequence, stern to prow.
   (Aliases of the old names are kept below so older code keeps loading.) */
const T_WAKE = 3.0;
const XRJ = [5.0, 6.6, 22.0, 23.4];
const DRUMW = [6.8, 8.8], HEATW = [8.8, 11.2], CURW = [11.0, 22.4], FINW = [13.6, 18.4];
const RSPW = [24.0, 31.0], ARC0 = 27.0;
const ENGX = [31.6, 32.8], GCHK = [32.7, 33.6];
const MOVE = [33.6, 43.2], BURN = [33.8, 37.8], RETRO = [39.2, 42.4], SLEW = [34.8, 43.0];
const CRU = [44.0, 45.2], CRS = [44.6, 48.6], CRL = [47.2, 50.2], CRD = [49.6, 52.0];
const BUILD = [52.0, 124.0];
const CAL = [127.0, 136.2];
const SWW = [136.8, 138.0], GUNP = [138.0, 140.4], CAPW = [138.2, 141.4];
const FLW = [[140.4, 142.2], [142.8, 144.6], [145.1, 147.4]];
const MAGW = [141.8, 147.6];
const UNLK = [147.5, 148.0], BRO = [148.0, 148.9];
const AT_FAB = 149.2;                  // the fabrication insert's splice (base time)
const BRC = [149.4, 150.4], LOCKW = [150.5, 151.5], CLAMPW = [151.6, 152.2], COILW = [152.0, 153.2];
const CH0 = 155.2, CH1 = 159.8, TF = 160.8, IRIS = [CH1 - 1.0, TF - .2];
const V_MZ = 5000, BLEN = Z_MZ - Z_CH, RATE_TR = 1 / 20, TR_D = 2 * BLEN / V_MZ / RATE_TR, TX = TF + TR_D;
const TI = TX + 16.5, T_RET = TI + 28, T_ARR = T_RET + 9;
const IRIS_B = [TX + 1.3, TX + 2.4], CLAMP_B = [TX + 3, TX + 3.8];
const FLB = [T_ARR + .3, T_ARR + 3.7], SW_B = [T_ARR + .5, T_ARR + 1.7], MAG_B = [T_ARR + .3, T_ARR + 2.6];
const UNB = [T_ARR + 4.0, T_ARR + 32.0], CRK = [T_ARR + 32.0, T_ARR + 34.4], CRSB = [T_ARR + 33.6, T_ARR + 36.6];
const MOVE_B = [T_ARR + 37.0, T_ARR + 45.6], SLEW_B = [T_ARR + 37.4, T_ARR + 45.2], BURN_B = [T_ARR + 37.2, T_ARR + 40.4], RETRO_B = [T_ARR + 41.8, T_ARR + 44.8];
const SPIN_B = [T_ARR + 46.0, T_ARR + 51.0], PARK_RING = [T_ARR + 51.0, T_ARR + 51.8];
const ENGX_B = [T_ARR + 46.2, T_ARR + 47.4], FIN_B = [T_ARR + 49.6, T_ARR + 53.0], HEAT_B = [T_ARR + 50.0, T_ARR + 53.6];
const LIGHTS_OFF = [T_ARR + 53.2, T_ARR + 56.0];
const DUR = T_ARR + 57.2;              // the base take (the inserts lengthen the film: DURF)
/* the construction ring's path along the bore (z of its plane) and the build layers' fronts */
const CR_DOCK = P.CR_DOCK, CR_START = 4, CR_PARK = Z_MZ + 260;
const LAG = [4, 15, 27, 41, 57], ULAG = [57, 43, 29, 16, 6];
/* the build: a slow start, a long even run, easing into the park */
const buildS = u => { const a = .05, b = .12, vm = 1 / (1 - a / 2 - b / 2); if (u <= 0) return 0; if (u >= 1) return 1; if (u < a) return vm * u * u / (2 * a); if (u < 1 - b) return vm * (u - a / 2); const w = 1 - u; return 1 - vm * w * w / (2 * b); };
function crZ(T) {
  if (T < CRD[0]) return CR_DOCK;
  if (T < BUILD[0]) return CR_DOCK + (CR_START - CR_DOCK) * kb(T, CRD);
  if (T < UNB[0]) return CR_START + (CR_PARK - CR_START) * buildS((T - BUILD[0]) / (BUILD[1] - BUILD[0]));
  if (T < CRK[0]) return CR_PARK + (CR_DOCK - CR_PARK) * buildS((T - UNB[0]) / (UNB[1] - UNB[0]));
  return CR_DOCK;
}
/* a layer's front: below it the layer stands (-1e9 none, 1e9 all) */
function frontZ(T, L) {
  if (T < BUILD[0] - .5 || T >= CRK[0]) return -1e9;
  const c = crZ(T);
  if (T < UNB[0]) { const f = c - LAG[L]; return f > Z_MZ + 1 ? 1e9 : f; }
  const g = E.sat((c - CR_DOCK) / 80), f = c + ULAG[L] * g;
  return f > Z_MZ + 1 ? 1e9 : f;
}
/* when a layer's front passes z (build: rising), by bisection on the build's run */
function tFront(L, z) { let lo = BUILD[0], hi = UNB[0]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (frontZ(m, L) >= z) hi = m; else lo = m; } return hi; }
function tFrontB(L, z) { let lo = UNB[0], hi = CRK[0]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (frontZ(m, L) <= z) hi = m; else lo = m; } return hi; }
const LOCKC_TS = [0, 1, 2, 3, 4, 5].map(k => k ? tFront(2, k * LSEG + P.COL_L + 2) : 0), ULOCK_TS = [0, 1, 2, 3, 4, 5].map(k => k ? tFrontB(4, k * LSEG + 6) : 0);
const LOCKC = k => LOCKC_TS[k];                       // collar k (1..5) locks: the laser reaches its mast
const CROWN_DONE = tFront(4, Z_MZ + .5);
const CHAPTERS = [
  { t: 0, title: 'Orbit' }, { t: T_WAKE - .2, title: 'Wake' }, { t: XRJ[0] - .2, title: 'Reactor' }, { t: FINW[0] - .2, title: 'Radiators' },
  { t: RSPW[0] - .3, title: 'Rings' }, { t: ENGX[0] - .3, title: 'Thrust' }, { t: CRU[0] - .3, title: 'Detach' }, { t: BUILD[0] - .3, title: 'Build' },
  { t: CAL[0] - .2, title: 'Calibrate' }, { t: SWW[0] - .6, title: 'Reroute' }, { t: FLW[0][0] - .2, title: 'Reconfigure' }, { t: UNLK[0] - .2, title: 'Breech' },
  { t: AT_FAB + .05, title: 'Chamber' }, { t: COILW[1] + .2, title: 'Charge' }, { t: TF - .3, title: 'Fire' }, { t: TX + 2.2, title: 'Fall' },
  { t: TI - .4, title: 'Strike' }, { t: T_RET, title: 'Return' }, { t: UNB[0] - .3, title: 'Unbuild' }, { t: MOVE_B[0] - .3, title: 'Stow' },
];
/* old names (the unfold and the folding ring are gone): the collars' locks stand in for the joints */
const J0 = BUILD[0], JDUR = 3, JSTEP = (BUILD[1] - BUILD[0]) / 6, JW = j => [LOCKC(Math.max(1, Math.min(5, j))) - 2, LOCKC(Math.max(1, Math.min(5, j))) + 1];
const TELW = [tFront(2, P.TEL_Z[0]), CROWN_DONE], RINGW = RSPW, RCUR = [RSPW[0] + 2, RSPW[1]], SPINW = RSPW;
const RING_B = SPIN_B, TEL_B = [UNB[0], UNB[0] + 3], JB0 = UNB[0], JBSTEP = 3, JBDUR = 3, JWB = j => [ULOCK_TS[Math.max(1, Math.min(5, j))] - 1.5, ULOCK_TS[Math.max(1, Math.min(5, j))]];
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
/* the slew's axis in the ship's frame (a slerp turns about a fixed body axis); the rings' gimbal axis across it */
const QD = K.Q.mul([Q0[0], -Q0[1], -Q0[2], -Q0[3]], Q1), SLEW_ANG = 2 * Math.acos(E.clamp(Math.abs(QD[0]), -1, 1));
const SLEW_AX = (() => { const s = Math.hypot(QD[1], QD[2], QD[3]) || 1, g = QD[0] < 0 ? -1 : 1; return [g * QD[1] / s, g * QD[2] / s, g * QD[3] / s]; })();
{ const g = V.cross(SLEW_AX, [0, 0, 1]); P.setGimbal(g[0], g[1]); }
LOG.push(`slew ${(SLEW_ANG / DEG).toFixed(1)} deg about [${SLEW_AX.map(v => v.toFixed(2))}]`);
/* recoil: a damped shudder after the shot; a small rock as the CR's mass runs out along the axis is taken by the rings */
function shudder(T) { const t = T - TX; return t > 0 && t < 7 ? .0012 * Math.exp(-t / 1.8) * Math.sin(TAU * 1.1 * t) : 0; }
const moveU = T => kb(T, MOVE) * (1 - kb(T, MOVE_B));
const slewU = T => kb(T, SLEW) * (1 - kb(T, SLEW_B));
const slewRate = T => (slewU(T + .02) - slewU(T - .02)) / .04;
const SLEW_RMAX = (() => { let m = 0; for (let t = SLEW[0]; t < SLEW[1]; t += .02) m = Math.max(m, Math.abs(slewRate(t))); return m || 1; })();
const slewAcc = T => (slewRate(T + .2) - slewRate(T - .2)) / .4;
const SLEW_AMAX = (() => { let m = 0; for (let t = SLEW[0]; t < SLEW[1]; t += .02) m = Math.max(m, Math.abs(slewAcc(t))); return m || 1; })();
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
/* the strike's clock (fx.js asks): x1/4 for the flash and the plasma, x1 across the land, x1/20 for 9 s while the blast
   front tears through the trees by the ground camera, then x4 for the cloud and the crater */
const SWARP = FILM.warp([{ t: 0, rate: .25 }, { t: 1.6, rate: .25 }, { t: 2.6, rate: 1 }, { t: 4.0, rate: 1 }, { t: 4.8, rate: .05 }, { t: 13.8, rate: .05 }, { t: 15.3, rate: 4 }, { t: T_RET - TI + 14, rate: 4 }]);
const aOf = T => T < TI ? -1 : SWARP(T - TI);
const strikeRate = T => T < TI ? 1 : SWARP.rate(T - TI);
const rodZof = T => { if (T < TF) return Z_CH; const u = Math.min(1, (T - TF) / TR_D); return Z_CH + BLEN * u * u; };

/* ---------- clocks: the rate on screen (steps eased over 0.6 s in log space) ---------- */
const RATES = [[0, 1], [HEATW[0], 600], [HEATW[1] - .3, 1], [FINW[0] - .3, 8], [FINW[1] + .2, 1], [RSPW[0], 60], [RSPW[1] - .8, 8], [MOVE[0], 20], [MOVE[1] - .2, 1],
  [CRS[0], 8], [CRL[0], 1], [CRD[0], 8], [BUILD[0] + .3, 60], [BUILD[1] - .4, 8], [CAL[0] - .3, 1], [FLW[0][0] - .2, 8], [UNLK[0] - .2, 2], [COILW[1], 1]];
const RATES_B = [[T_RET, 1], [T_ARR - 2, 8], [UNB[0] + .3, 120], [UNB[1] - .4, 8], [CRK[1], 2], [CRSB[0], 8], [MOVE_B[0], 20], [MOVE_B[1] - .2, 8], [SPIN_B[0], 60], [SPIN_B[1], 8], [LIGHTS_OFF[0] + .6, 1]];
const rateTab = (TB, T) => {
  let i = 0; while (i < TB.length - 1 && TB[i + 1][0] <= T) i++;
  if (i === 0) return TB[0][1];
  const [t, v] = TB[i], v0 = TB[i - 1][1], u = ss(t, t + .6, T);
  return Math.exp(Math.log(v0) + (Math.log(v) - Math.log(v0)) * u);
};
const rateA = T => rateTab(RATES, T);
const rateOf = T => T < TF ? rateA(T) : T < TX ? RATE_TR : T < TI ? fallRate(T) : T < T_RET ? strikeRate(T) : rateTab(RATES_B, T);
const SIMN = 8000, SIMW = (() => { const A = new Float64Array(SIMN + 1); for (let i = 1; i <= SIMN; i++) { const t = (i - .5) / SIMN * DUR; A[i] = A[i - 1] + rateOf(t) * DUR / SIMN; } return A; })();
const simAt = T => { const x = E.clamp(T / DUR, 0, 1) * SIMN, k = Math.min(SIMN - 1, Math.floor(x)); return SIMW[k] + (SIMW[k + 1] - SIMW[k]) * (x - k); };
const SIM_TF = simAt(TF);
const simClock = T => T < TF ? simAt(T) - SIM_TF : T < TX ? (T - TF) * RATE_TR : T < TI ? TR_D * RATE_TR + tauOf(T) : TR_D * RATE_TR + TAU_END + aOf(Math.min(T, T_RET)) + (T > T_RET ? simAt(T) - simAt(T_RET) : 0);

/* ---------- spins (integrated over the clock): the stabiliser rings (2 rpm, counter-rotating; a dip through the
   charge as their energy goes to the gun), parked on a node at the end; the construction ring's rim (30 rpm) ---------- */
const OMEGA_R = TAU * 2 / 60, OMEGA_CR = TAU * 30 / 60;
const ringFrac = T => ss(RSPW[0], RSPW[1], T) * (1 - ss(SPIN_B[0], SPIN_B[1], T)) * (1 - .13 * ss(CH0, TX, T));
const crFrac = T => ss(CRS[0], CRS[1], T) * (1 - ss(CRSB[0], CRSB[1], T));
const spinFrac = T => ringFrac(T);
const NSP = Math.ceil(DUR * 100), PSI = new Float64Array(NSP + 1), PSIC = new Float64Array(NSP + 1);
for (let i = 1; i <= NSP; i++) { const t = (i - .5) / 100, r = rateOf(t) / 100; PSI[i] = PSI[i - 1] + OMEGA_R * ringFrac(t) * r; PSIC[i] = PSIC[i - 1] + OMEGA_CR * crFrac(t) * r; }
const CRU_SIM = simAt(LIGHTS_OFF[0]) - simAt(T_WAKE), CRV = [0, 1, 2, 3, 4, 5].map(k => { const L_ = k >= 4 ? 300 : 380, n = Math.max(1, Math.round(CRU_SIM * 1.6 / L_ / 2)); return n * 2 * L_ / CRU_SIM; });
const STEP_R = TAU / P.NRN, PSI_END = PSI[NSP], PARK = Math.round(PSI_END / STEP_R) * STEP_R - PSI_END;
const intAt = (A, T) => { const x = E.clamp(T, 0, DUR) * 100, k = Math.min(NSP - 1, Math.floor(x)); return A[k] + (A[k + 1] - A[k]) * (x - k); };
const psiAt = T => intAt(PSI, T) + PARK * kb(T, PARK_RING);
const psiCR = T => intAt(PSIC, T);
/* the smear of a ring spinning fast on screen: the angle it sweeps in a frame, against its node pitch */
const blurOf = (omega, frac, T, n) => { const d = omega * frac * rateOf(T) / 60 * n / TAU; return E.sat((d - .35) / .8); };
/* the rings' scissor tilt: proportional to the slew's rate (a gimballed pair turning the ship), the recoil's wobble */
const TILT_MAX = 3.2 * DEG;
const tiltAt = T => TILT_MAX * slewRate(T) / SLEW_RMAX + (T > TX && T < TX + 9 ? .9 * DEG * Math.exp(-(T - TX) / 1.6) * Math.sin(TAU * .55 * (T - TX)) : 0);

/* ---------- the platform's state ---------- */
const ST = { wake: 0, wave: -1, waveW: 60, waveA: 0, waveT: 0, front: new Float64Array(5), freshL: 26, freshA: 0, jaw: new Float64Array(NSEG), sleeve: new Float64Array(NSEG),
  joint: new Float64Array(NSEG).fill(1), tel: 1, fin: 0, rings: [{ psi: 0, tilt: 0, rotor: 0 }, { psi: 0, tilt: 0, rotor: 0 }], blur: [0, 0], cr: { z: CR_DOCK, psi: 0, blur: 0, arms: 0 },
  drum: 0, pump: 0, cut: null, crawl: new Float64Array(P.NCRAWL), ring: 1, spin: 0, engExt: 0, gimbal: new Float64Array(8), sw: 0, breech: 1, lock: 1, clamp: 0, iris: 0, roundZ: null, flex: null, flapAt: null };
let FLEXT = 0, FLT = 0;
const flexFn = (z, o) => { const t = FLEXT, k = Math.max(0, z / Z_MZ), A = 2.4 * Math.exp(-t / 2.6) * Math.sin(TAU * .42 * t) * k * k; o[0] = A * .3; o[1] = A; o[2] = 0; };
/* the flaps of bay gb (0 at the breech): three waves breech to muzzle (cracked, half with the cassettes out, full with
   them turned up), each stage in its own colour while it moves (the flaps lime as they crack, the cassettes lime as
   they slide, white-hot as they turn up); closed in one wave muzzle to breech on the return */
ST.flapAt = (gb, out) => {
  const T = FLT;
  if (T < FLW[0][0] || T > FLB[1] + .1) { out[0] = out[1] = out[2] = out[3] = out[4] = 0; return; }
  const u = gb / (NB - 1), d = .8, st = i => { const w = FLW[i], t0 = w[0] + u * (w[1] - w[0] - d); return kk(T, t0, t0 + d); };
  const mv = i => { const w = FLW[i], t0 = w[0] + u * (w[1] - w[0] - d), a = T - t0; return a < 0 ? 0 : a < d ? 1 : Math.exp(-(a - d) * 1.6); };
  const s1 = st(0), s2 = st(1), s3 = st(2), d2 = 1, t0 = FLB[0] + (1 - u) * (FLB[1] - FLB[0] - d2), c = 1 - kk(T, t0, t0 + d2);
  out[0] = (14 * s1 + 41 * s2 + 55 * s3) * DEG * c; out[1] = (2.6 * s2 + 3.6 * s3) * c; out[2] = PI / 2 * s3 * c;
  out[3] = .75 * mv(0) * c; out[4] = Math.max(.9 * mv(1), mv(2)) * c;
};
/* engines: throttle (0..1) per engine and the retro pods; the gimbals only trim (the rings turn the ship) */
const THR = new Float64Array(4);
let RETRO_A = 0;
function engines(T) {
  const g = ST.gimbal;
  let p = 0, y = 0;
  const c = (T - GCHK[0]) / (GCHK[1] - GCHK[0]);
  if (c > 0 && c < 1) { p = 7 * DEG * Math.sin(c * TAU) * Math.sin(c * PI); y = 7 * DEG * Math.cos(c * TAU) * Math.sin(c * PI); }
  const tr = 1.2 * DEG * Math.sin(T * 1.7) * (win(T, BURN[0], BURN[1], .5) + win(T, BURN_B[0], BURN_B[1], .5));
  for (let e = 0; e < 4; e++) { g[e * 2] = p + tr * (e < 2 ? 1 : -1); g[e * 2 + 1] = y + tr * .5 * (e % 2 ? 1 : -1); }
  const main = Math.max(win(T, BURN[0], BURN[1], .35), win(T, BURN_B[0], BURN_B[1], .35));
  for (let e = 0; e < 4; e++) THR[e] = Math.max(main, .25 * win(T, GCHK[1] - .1, GCHK[1] + .4, .1));
  RETRO_A = Math.max(win(T, RETRO[0], RETRO[1], .3), win(T, RETRO_B[0], RETRO_B[1], .3));
}
let INS_ON = false;
/* a slam: fast, a bounce, settled (0..1) */
const slam = (T, t0) => { const a = T - t0; if (a <= 0) return 0; if (a < .22) { const u = a / .22; return u * u; } const b = a - .22; return 1 - .08 * Math.exp(-b * 9) * Math.cos(b * 38); };
function stateAt(T) {
  ST.wake = ss(T_WAKE, T_WAKE + 3, T) * (1 - kb(T, LIGHTS_OFF));
  for (let L = 0; L < 5; L++) ST.front[L] = frontZ(T, L);
  ST.freshA = (T > BUILD[0] - .5 && T < BUILD[1] + 2) || (T > UNB[0] && T < CRK[0]) ? 1 : 0;
  for (let j = 1; j < NSEG; j++) {
    const lt = LOCKC(j), ut = ULOCK_TS[j];
    ST.jaw[j] = E.sat(slam(T, lt + .5)) * (1 - kk(T, ut - 2.2, ut - 1.6));
    ST.sleeve[j] = kk(T, lt + .9, lt + 2.4) * (1 - kk(T, ut - 3.2, ut - 2.3));
  }
  ST.fin = kb(T, FINW) * (1 - kb(T, FIN_B));
  ST.drum = kb(T, DRUMW) * (1 - kb(T, HEAT_B));
  cutState(T); ST.cut = CUT.open > .01 ? CUT : null;
  ST.pump = 6 * T * heatOf(T);
  // the crawlers run their rails at 1.6 m/s (the sim clock), back and forth over a stretch each
  // (from the wake to the lights out, a whole number of round trips each, so the loop closes)
  { const sc = simAt(E.clamp(T, T_WAKE, LIGHTS_OFF[0])) - simAt(T_WAKE); for (let k = 0; k < P.NCRAWL; k++) { const L_ = k >= 4 ? 300 : 380, z0 = P.Z_PROW - 30 - 40 * k, u = ((sc * CRV[k] / L_ + k * .37) % 2 + 2) % 2, f = u < 1 ? u : 2 - u; ST.crawl[k] = z0 - L_ * (f * f * (3 - 2 * f)); } }
  const pa = psiAt(T), tl = tiltAt(T), rv = 4.2 * ringFrac(T) * T;
  ST.rings[0].psi = pa; ST.rings[1].psi = -pa; ST.rings[0].tilt = tl; ST.rings[1].tilt = -tl; ST.rings[0].rotor = rv; ST.rings[1].rotor = -rv;
  ST.blur[0] = ST.blur[1] = blurOf(OMEGA_R, ringFrac(T), T, P.NRN);
  ST.spin = pa;
  ST.cr.z = crZ(T); ST.cr.psi = psiCR(T); ST.cr.blur = blurOf(OMEGA_CR, crFrac(T), T, P.NCN);
  ST.cr.arms = kb(T, CRU) * (1 - kb(T, [CRK[0] - .6, CRK[1] - .4]));
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
  else if (sl > 0 && sl < 2.4) { ST.wave = 1100 * (1 - sl / 2.2); ST.waveW = 80; ST.waveA = .55 * (1 - ss(1.8, 2.4, sl)); ST.waveT = 0; }
  else ST.wave = -1;
  return ST;
}
const RCW = [0, 0, 0];
const waveFn = p => { const dx = p[0] - RCW[0], dy = p[1] - RCW[1], dz = p[2] - RCW[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz), w = (d - ST.wave) / ST.waveW; return (w < 0 ? Math.exp(w * .6) * ST.waveT + Math.exp(-w * w) * (1 - ST.waveT) : Math.exp(-w * w)) * ST.waveA; };

/* ---------- effects on the platform's parts (the lattice's channels) ---------- */
const CUR = P.CUR;
let FXT = 0;
const heatOf = T => .22 + .78 * kb(T, HEATW) * (1 - kb(T, HEAT_B));
const curOf = T => ss(CURW[0], CURW[0] + 1.6, T) * (1 - ss(LIGHTS_OFF[0], LIGHTS_OFF[1], T));
const zWave = T => Z_CH + (Z_MZ - Z_CH) * E.sat((T - CH0) / (CH1 - CH0));
const chg = T => ss(CH0 - .3, CH0 + .4, T) * (1 - ss(TX, TX + 1.8, T));
const busRear = T => ss(CURW[0] + .6, CURW[0] + 2.2, T) * (1 - ss(LIGHTS_OFF[0], LIGHTS_OFF[1], T));
const gunFront = T => -134 + (Z_MZ + 140) * E.sat((T - GUNP[0]) / (GUNP[1] - GUNP[0]));
const gunOn = T => ss(GUNP[0], GUNP[0] + .2, T) * (1 - ss(SW_B[0], SW_B[1] + .6, T));
const magFront = T => Z_CH - 10 + (Z_MZ + 20) * E.sat((T - MAGW[0]) / (MAGW[1] - MAGW[0] - .4));
const magOn = T => ss(MAGW[0], MAGW[0] + .2, T) * (1 - ss(MAG_B[0], MAG_B[1], T));
const ringPow = T => ss(RSPW[0] + .4, RSPW[0] + 2, T) * (1 - ss(SPIN_B[0], SPIN_B[1], T));
const arcsOn = T => ss(ARC0, ARC0 + 1.5, T) * (1 - ss(SPIN_B[0], SPIN_B[1] - 1, T));
const capFill = T => E.sat((T - CAPW[0]) / (CAPW[1] - CAPW[0])) * (1 - ss(CH0, CH1, T)) + ss(TX + 2, TX + 6, T) * .15 * (1 - ss(SW_B[0], SW_B[1], T));
const crBuild = T => (T > BUILD[0] - .3 && T < BUILD[1] + 1) || (T > UNB[0] && T < CRK[0]);
const crLink = T => ss(CRL[0], CRL[0] + 1.5, T) * (1 - ss(CRK[0], CRK[0] + .8, T));
/* the calibration: each station locks at a time (emitter, deck mirror, prow mirror, bore bench), the collar sensors, the
   crown, the construction ring; the ring sensors from the deck mirror */
const LOCK_T = [CAL[0] + .6, CAL[0] + 1.1, CAL[0] + 2.4, CAL[0] + 2.9];
const SENS_T = k => CAL[0] + 4.0 + .62 * (k - 1);
const CROWN_T = CAL[0] + 7.2, CRR_T = CAL[0] + 7.7, RING_T = k => CAL[0] + 1.5 + .28 * k, ALIGN_T = CAL[0] + 8.3;
const camOn = (T, t0) => T > t0 ? (T < t0 + .25 ? 1.6 : .55) * (1 - ss(CAL[1] + 1, CAL[1] + 3, T)) : 0;
/* status lights: on in z order from the reactor at the wake, off in z order prow to stern at the end, a slow blink on a
   fifth of them; the colour turns lime while the coils are charged */
const lightLv = (T, z) => {
  const t0 = T_WAKE + .3 + (z + 680) / 640;
  if (T < t0) return .12 * (Math.floor(T * .8 + z) % 6 === 0 ? 1 : 0);
  const t1 = LIGHTS_OFF[0] + .2 + (1100 - z) / 1100 * 2.2;
  if (T > t1) return T < t1 + .12 ? .5 : .1 * (Math.floor(T * .8 + z) % 6 === 0 ? 1 : 0);
  const a = T - t0, on = a < .05 ? 1.6 : a < .1 ? .3 : 1, h = ((z * 7.31) % 1 + 1) % 1;
  const blink = h < .2 ? (Math.floor(T * 1.6 + h * 9) % 2 ? 1 : .25) : 1;
  return on * blink * (1 + .8 * chg(T));
};
const fxFn = (ch, q) => {
  const T = FXT;
  switch (ch) {
    case 1: { // charge rings (z)
      const z = CUR.z + q; let k = 0;
      if (T > CH0 - .2 && T < TF) { const d = zWave(T) - z; if (d > 0) k = .5 + .12 * hh(z, Math.floor(T * 20)); if (d > -8 && d < 16) k = Math.max(k, 1.7 * Math.exp(-Math.abs(d) / 7)); }
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
      if (crBuild(T) && z > -20) { const f0 = ST.front[0], d = f0 - z; if (d > 0 && d < 1e8) k = Math.max(k, .22 + .5 * Math.max(0, Math.sin((z - T * 90) * .08))); }
      if (T >= TF && T < TX + 2) { const zr = rodZof(Math.min(T, TX)), d = zr - z; k = Math.max(k, T < TX ? (d > -4 && d < 60 ? 1.8 * Math.exp(-Math.max(0, d) / 16) : .3) : .6 * Math.exp(-(T - TX) * 2)); }
      return k;
    }
    case 4: { // magnet tubes (z)
      const z = CUR.z + q, on = magOn(T); let k = 0;
      if (on > 0) { const d = magFront(T) - z; if (d > 0) k = (.24 + .05 * Math.sin(T * 9 + z * .07)) * on; if (d > -12 && d < 24) k = Math.max(k, 1.3 * Math.exp(-Math.abs(d) / 9) * on); }
      if (T >= TF && T < TX + 2) { const zr = rodZof(Math.min(T, TX)), d = zr - z; if (T < TX && d > -20 && d < 40) k = Math.max(k, 1.6 * Math.exp(-Math.abs(d) / 12)); }
      return k;
    }
    case 5: { // the reactor: core, hot shoe, (the old disc), fuel, drum, the drums' absorber faces
      const h = heatOf(T);
      if (q >= 10) { const i = q - 10, f = i < 5 ? 1 - i * .14 : .25 - (i - 5) * .08; return 10 + .15 + Math.max(0, f * (.25 + .75 * h)) + (i < 2 ? .9 * ss(.55, 1, h) : 0); }
      if (q === 3) return 10 + .35 + .65 * h + (h > .5 ? .5 * h * hh(CUR.k, Math.floor(T * 14)) * .4 : 0) + .5 * ss(.6, 1, h);
      if (q === 4) return 10 + .2 + .3 * h;
      if (q === 5) return 1.1 - .6 * ST.drum;
      if (q === 2) return 10 + .5 + .4 * h + .1 * Math.sin(T * 7);
      return q === 0 ? 10 + .3 + .4 * h : 10 + .25 + .75 * h + (h > .9 ? .12 * hh(q, Math.floor(T * 12)) : 0);
    }
    case 6: { // the radiator fins: hot at the root, cold at the tip; pulses of coolant run out along them
      const h = heatOf(T) * (.25 + .75 * ST.fin), j = CUR.j, pulse = .14 * Math.max(0, Math.sin(T * 2.6 - j * 1.1)) * ST.fin * h;
      return 10 + Math.max(0, h * .82 * Math.exp(-j * .42) + pulse) + .35 * flash(T, TX + .3, .5) * (1 - j / 8);
    }
    case 7: { let k = ss(CH1 - 1, TF, T) * .7 * (1 - ss(TX, TX + 1, T)); k = Math.max(k, 2 * flash(T, TX, 2.2)); if (T > IRIS[0] && T < IRIS[1] + .6) k = Math.max(k, .45 * (1 - E.sat((T - IRIS[1]) / .6))); if (T > CROWN_DONE - .6 && T < CROWN_DONE + 3) k = Math.max(k, 1.4 * flash(T, CROWN_DONE, 1.4)); return k; }
    case 8: { let k = .45 * ss(COILW[0], COILW[1], T); if (T > TF && T < TX) k = 1.6; return k; }
    case 9: {
      if (q === 0) return Math.max(.65 * ss(COILW[0], COILW[1], T) * (1 - ss(TX, TX + 2, T)), 1.5 * flash(T, COILW[0] + .4, 2.5), .9 * chg(T));
      if (q === 1) return 1.4 * flash(T, BRC[1], 3);
      if (q === 2) return Math.max(1.4 * flash(T, LOCKW[1], 3), .5 * win(T, UNLK[0], UNLK[1], .1));
      if (q === 3) return 1.5 * flash(T, CLAMPW[1], 3.5);
      return .35 * chg(T);
    }
    case 10: { // the stabiliser rings: structure, rails (current riding round), wheels, bearing shoes, pylons
      const pw = ringPow(T);
      if (q === 1) { const a = CUR.j / P.NRN * TAU, w = .5 + .5 * Math.sin(a * 3 - T * 2.4 * (CUR.k ? -1 : 1)); return pw * (.25 + .6 * w * w) + .6 * chg(T); }
      if (q === 2) return .25 * pw + .5 * chg(T);
      if (q === 3) return pw * (.55 + .3 * hh(CUR.j, Math.floor(T * 20))) + .8 * chg(T);
      if (q === 4) return .12 * pw;
      return .06 * pw + .25 * flash(T, TX + .2, 1.2);
    }
    case 11: { const c = curOf(T); return c * (.3 + .35 * (.5 + .5 * Math.sin(T * 5 - q * .8))); }
    case 12: { if (q === 3) return 10 + .95 * RETRO_A; if (q === 2) return 0; const t = CUR.k >= 0 ? THR[CUR.k] : 0; return t > .01 ? 10 + Math.min(1.6, .9 * t + (q === 0 ? .5 * t : 0)) : 0; }
    case 13: { if (q === 0 || q === 1) return .55 * Math.max(busRear(T) * (T < SWW[1] || T > SW_B[0] ? 1 : 0), gunOn(T)) * (q ? 1.4 : 1) + .9 * flash(T, SWW[1], 3) + .9 * flash(T, SW_B[1], 3); if (q === 10) return .8 * (1 - ST.sw) * busRear(T); return .8 * ST.sw; }
    case 14: {
      if (q === 0) return Math.max(camOn(T, LOCK_T[0]), .35 * crLink(T)); if (q === 3) return Math.max(camOn(T, LOCK_T[1]), camOn(T, RING_T(3)) * .7, .3 * crLink(T)); if (q === 4) return Math.max(camOn(T, LOCK_T[2]), .5 * crLink(T));
      if (q === 1) { const j = CUR.k; return j > 0 ? Math.max(camOn(T, SENS_T(j)), 1.5 * flash(T, LOCKC(j), 2.2), .4 * ss(LOCKC(j), LOCKC(j) + .3, T) * crLink(T)) : 0; }
      if (q >= 6) return .3 + .9 * crLink(T) + 1.2 * flash(T, CRL[0] + .25 * (q - 6) + .45, 3);
      return Math.max(camOn(T, CROWN_T), 1.2 * flash(T, CROWN_DONE + .3, 2));
    }
    case 16: { const on = magOn(T); return .3 * on + .9 * on * Math.exp(-Math.abs(T - MAGW[0] - .3 - q * .12) * 3); }
    case 15: { const j = CUR.k; if (j < 1) return 0; const lt = LOCKC(j) + .5; return 1.7 * flash(T, lt + .22, 4) + .5 * win(T, lt, lt + .7, .1); }
    case 17: return 0;
    case 18: { // the construction ring
      const sp = crFrac(T), bd = crBuild(T) ? 1 : 0;
      if (q === 0) return .1 * sp + .35 * bd * sp;
      if (q === 1) return .08 * sp + .2 * bd;
      if (q === 2) return .15 * crLink(T) + .55 * bd;
      if (q === 3) return .5 * crLink(T) + 1.2 * flash(T, CRL[0] + .5, 2.5);
      if (q === 4) return bd ? .9 + .9 * hh(CUR.j * 7 + 3, Math.floor(T * 24)) : .1 * sp;
      return 1.6 * flash(T, CRU[0] + .2, 3) + 1.6 * flash(T, CRK[1] - .5, 3);
    }
    case 19: { const f = capFill(T); return q / 96 < f ? .45 + .5 * (q / 96 > f - .06 ? 1 : 0) + .6 * chg(T) : .04; }
    case 20: { const z = TOWER_Z; return 1.1 * lightLv(T, z + q * .3); }
    case 21: { const h = heatOf(T) * ST.fin; return q < 0 ? .25 * h : .2 * h + .6 * h * Math.max(0, Math.sin(T * 6 + q * 1.3)); }
  }
  return 0;
};
const TOWER_Z = (P.TOWER.z0 + P.TOWER.z1) / 2;
const ZCUT = P.CP_Z0 + 5 * P.CP_DZ + 1.2;          // (old: the X-ray slab's cut)
const fx = (ch, q) => ch === 3 ? (q === -1 ? .9 * ST.wake : q === -5 ? ST.wake * (Math.floor(FXT * 2.2) % 2 ? 1.2 : .3) : lightLv(FXT, CUR.z + q)) : fxFn(ch, q);

/* ---------- power: packets of light along the bus (platform frame paths) ---------- */
function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.dist(pts[i], pts[i - 1])); return { p: pts, cum, L: cum[cum.length - 1] }; }
const PK = [0, 0, 0];
function pathAt(pa, s, Tw, o) {
  const c = pa.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
  const k = E.clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), 0, 1), a = pa.p[i - 1], b = pa.p[i];
  const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k, M = Tw.R, t = Tw.T;
  o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o;
}
/* packets every gap m at speed m/s from t0 (pure in T), fading in over the first second; col the head's colour; maxS the
   path's reach (m) */
function stream(pa, Tw, T, t0, speed, gap, a, col, maxS) {
  if (T < t0 || a < .01) return;
  const head = (T - t0) * speed, s0 = head % gap, L_ = Math.min(pa.L, maxS === undefined ? 1e9 : maxS);
  for (let s = s0; s <= L_; s += gap) {
    if (s > head) break;
    for (let q = 0; q < 6; q++) { const sq = s - q * Math.min(3, gap * .06); if (sq < 0) break; pathAt(pa, sq, Tw, PK); K.dotW(PK[0], PK[1], PK[2], q ? 1 : 2, q ? LIME : (col || HOT), a * (1 - q / 6)); }
    pathAt(pa, s, Tw, PK); K.glowW(PK[0], PK[1], PK[2], 8, LIME, .28 * a);
  }
}
const REA_M = (P.REA_Z0 + P.REA_Z1) / 2;
const P_REAR = [1, -1].map(s => mkPath([[0, 0, REA_M], [s * 5, 0, P.REA_Z1 + 2], [s * 9, 0, P.Z_STERN + 4], [s * 9, 0, -190]]));
const P_ENG = P.ENG_P.map(([x, y]) => { const s = Math.sign(x); return mkPath([[s * 9, 0, -186], [s * 9, 0, -560], [x * .4, y * .4, P.Z_STERN + 2], [x, y, P.ENG_Z - 6]]); });
const P_GUN = [1, -1].map(s => mkPath([[s * 9, 0, -138], [s * 9, -P.BAY_H[1] - 1, -116], [s * 9, -P.BAY_H[1] - 1, -46], [s * 4, s * 2.3, -40], [0, s * 4.6, -16], [0, s * 4.6, Z_MZ - 4]]));
const P_RING = []; for (let ri = 0; ri < 2; ri++) for (let p = 0; p < 4; p++) { const a = P.PYL[p], s = Math.cos(a) > 0 ? 1 : -1, up = Math.sin(a) > 0, z = P.RING_Z[ri], r0 = P.HP([s * (up ? 27 : 30), up ? 27 : -27], z), hd = [Math.cos(a) * (P.SHOE_R - 8), Math.sin(a) * (P.SHOE_R - 8), z]; P_RING.push(mkPath([[s * 9, 0, -186], [s * 9, 0, z], [s * 9, up ? 16 : -16, z], r0, hd])); }
const P_CR = [1, -1].map(s => mkPath([[0, s * 4.6, -16], [0, s * 4.6, Z_MZ]]));
let PPS = [];
function drawPower(T, Tw) {
  const br = busRear(T);
  if (br > .01) for (let s = 0; s < 2; s++) stream(P_REAR[s], Tw, T, CURW[0] + .4 + s * .2, 60, 30, br * .9);
  const eng = (T > ENGX[0] - .5 && T < SWW[1] + .2) || (T > SW_B[0] && T < ENGX_B[1] + .4);
  if (eng && br > .01) { const a = br * (T < SWW[1] + .2 ? 1 - ss(SWW[0], SWW[1] + .2, T) * .95 : ss(SW_B[0], SW_B[1], T)); for (let e = 0; e < 4; e++) stream(P_ENG[e], Tw, T, T > SW_B[0] ? SW_B[0] : ENGX[0] - .5, 70, 34, a); }
  const rp = ringPow(T) * (1 - .6 * ss(SWW[0], SWW[1], T) * (1 - ss(SW_B[0], SW_B[1], T)));
  if (rp > .01) for (let i = 0; i < P_RING.length; i++) stream(P_RING[i], Tw, T, RSPW[0] + .2 + i * .05, 55, 40, rp * .7);
  const g = gunOn(T);
  if (g > .01 && T < TX + 1) for (let s = 0; s < 2; s++) stream(P_GUN[s], Tw, T, GUNP[0] - .4, 480, 46, g * (1 - ss(TF, TX, T)));
  if (crBuild(T) && ST.front[0] > 0) { const f0 = Math.min(Z_MZ, ST.front[0]); for (let s = 0; s < 2; s++) stream(P_CR[s], Tw, T, BUILD[0] - .6, 140, 36, .8, HOT, f0 + 16); }
  // the switches break and make: arcs off the blades while they turn
  for (const w of [SWW, SW_B]) { const u = (T - w[0]) / (w[1] - w[0] + .4); if (u < 0 || u > 1) continue; const I = Math.sin(PI * u); for (let k = 0; k < 4; k++) { const Sw = PPS[k]; if (!Sw) continue; for (let b = 0; b < 3; b++) { const t = b / 3 * TAU, cyc = Math.floor(T * 18 + b + k); if (hh(b + k * 3, cyc) < .35) continue; P.apTo(RA, Sw, [1.4, Math.cos(t) * 5.6, Math.sin(t) * 5.6]); P.apTo(RB, Sw, [1.2, Math.cos(t + .4) * 7.6, Math.sin(t + .4) * 7.6]); K.arcW(RA, RB, k * 7 + b + cyc, T, I * .9, .45, HOT, 2); K.glowW(RA[0], RA[1], RA[2], 10, LIME, .4 * I); } } }
}

/* ---------- the reactor's cutaway: clip regions for the shell (and the fins near it), the cold shoe, the core ----------
   a stepped window facing P.CUT_A: the shell open over +-56 deg, the cold shoe over +-46, the core over +-34 (each opens
   a little after the one outside it); on the cut faces: the fuel's heat, the hot shoe, the couples, the cold shoe */
const CUT = { open: 0, hs: 0, hc: 0, hk: 0, shell: new Float64Array(20), cold: new Float64Array(16), core: new Float64Array(16) };
function wedge(o, h, zlo, zhi, rmax) {
  const a0 = P.CUT_A - h, a1 = P.CUT_A + h;
  o[0] = -Math.sin(a0); o[1] = Math.cos(a0); o[2] = 0; o[3] = 0;
  o[4] = Math.sin(a1); o[5] = -Math.cos(a1); o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = 1; o[11] = zlo;
  o[12] = 0; o[13] = 0; o[14] = -1; o[15] = -zhi;
  if (o.length > 16) { o[16] = -Math.cos(P.CUT_A); o[17] = -Math.sin(P.CUT_A); o[18] = 0; o[19] = -rmax; }
}
function cutState(T) {
  const op = kk(T, XRJ[0], XRJ[1]) * (1 - kk(T, XRJ[2], XRJ[3])), op2 = kk(T, XRJ[0] + .35, XRJ[1] + .3) * (1 - kk(T, XRJ[2] - .3, XRJ[3] - .35)), op3 = kk(T, XRJ[0] + .7, XRJ[1] + .6) * (1 - kk(T, XRJ[2] - .6, XRJ[3] - .7));
  CUT.open = op; CUT.hs = P.CUT_W.shell * op; CUT.hc = P.CUT_W.cold * op2; CUT.hk = P.CUT_W.core * op3;
  const zlo = P.REA_Z0 - 18, zhi = P.REA_Z1 + 14;
  wedge(CUT.shell, CUT.hs, zlo, zhi, 1e4); wedge(CUT.cold, CUT.hc, zlo, zhi, 0); wedge(CUT.core, CUT.hk, zlo, zhi, 0);
  return op;
}
const CPP = [0, 0, 0], CQQ = [0, 0, 0];
/* a platform-frame point (radius r at angle a about the bore axis, at z) to world */
const wpPolar = (Tw, r, a, z, o) => { const M = Tw.R, t = Tw.T, x = Math.cos(a) * r, y = Math.sin(a) * r; o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o; };
function cutLine(Tw, r0, a0, z0, r1, a1, z1, col, a, step, gl) { wpPolar(Tw, r0, a0, z0, CPP); wpPolar(Tw, r1, a1, z1, CQQ); K.lineW(CPP[0], CPP[1], CPP[2], CQQ[0], CQQ[1], CQQ[2], step || 1.4, 1, col, a, gl ? LIME : null, gl || 0, 0); }
function drawCutaway(T, Tw) {
  if (CUT.open < .01) return;
  const h = heatOf(T), cur = curOf(T), Z0 = P.REA_Z0, Z1 = P.REA_Z1, A = P.CUT_A, op = CUT.open, fr = Math.floor(T * 12);
  // the cut's edges in lime (the scan's cut): along the bore at each face, across at the ends
  for (const [hw, r0, r1] of [[CUT.hs, P.CS_R, P.SHELL_R + .2], [CUT.hc, P.HS_R, P.CS_R], [CUT.hk, 0, P.CORE_R]]) {
    if (hw < .01) continue;
    for (const sg of [-1, 1]) {
      const a = A + sg * hw;
      cutLine(Tw, r1, a, Z0, r1, a, Z1, LIME, .9 * op, 1.2, .05);
      cutLine(Tw, r0 + .05, a, Z0, r1, a, Z0, LIME, .7 * op, 1.4); cutLine(Tw, r0 + .05, a, Z1, r1, a, Z1, LIME, .7 * op, 1.4);
    }
  }
  // the scan plane's sweep as it opens: lime arcs along the window, z running aft to fore
  const sw = (T - XRJ[0]) / (XRJ[1] - XRJ[0] + .6);
  if (sw > 0 && sw < 1) { const z = Z0 - 16 + (Z1 - Z0 + 30) * sw; for (let k = 0; k < 5; k++) { const r = P.SHELL_R + 1 - k * 7; if (r < 2) break; for (let i = 0; i <= 40; i++) { const a = A - CUT.hs - .1 + (2 * CUT.hs + .2) * i / 40; wpPolar(Tw, r, a, z, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 2, k ? LIME : HOT, .9 * (1 - k / 6)); } } }
  // (the cut faces themselves are lattice bodies: P.draw with LOOK.sec)
  // heat out of the fuel, across the hot shoe into the couples, and on out of the cold shoe to the coolant
  for (let i = 0; i < 1400; i++) {
    const a = A + (hh(i, 21) * 2 - 1) * CUT.hk * .96, f = (T * .42 + hh(i, 22)) % 1, r = 4 + f * (P.SHELL_R + 2 - 4), z = Z0 + 3 + hh(i, 23) * (Z1 - Z0 - 6);
    if (r > P.HS_R && Math.abs(a - A) > CUT.hc) continue;
    wpPolar(Tw, r, a, z, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 1, r < P.CS_R ? HEAT : WH, (r < P.HS_R ? .55 : .9) * (1 - f * .6) * h * op);
  }
  // the current round each row of couples in series (p-leg up, hot strap, n-leg down, cold strap), inside the window
  if (cur > .02 && CUT.hc > .02) {
    const NCP = P.NCP, rh = P.HS_R + .1, rc = P.CS_R - .1, i0 = Math.floor((A - CUT.hc) / TAU * NCP), i1 = Math.ceil((A + CUT.hc) / TAU * NCP), span = i1 - i0;
    for (let row = 0; row < P.CP_ROWS; row++) {
      const z = P.CP_Z0 + row * P.CP_DZ;
      for (let k = 0; k < 70; k++) {
        const s_ = i0 + ((T * .55 + k / 70 + row * .13) % 1) * span, i = Math.floor(s_), w = s_ - i, t0 = i / NCP * TAU, t1 = t0 + TAU / NCP * .42, t2 = (i + 1) / NCP * TAU;
        let a, r;
        if (w < .25) { a = t0; r = rc + (rh - rc) * (w / .25); } else if (w < .5) { a = t0 + (t1 - t0) * ((w - .25) / .25); r = rh; } else if (w < .75) { a = t1; r = rh + (rc - rh) * ((w - .5) / .25); } else { a = t1 + (t2 - t1) * ((w - .75) / .25); r = rc; }
        wpPolar(Tw, r, a, z, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 2, HOT, cur * op); if (k % 3 === 0) K.glowW(CPP[0], CPP[1], CPP[2], 6, LIME, .25 * cur * op);
      }
    }
  }
}

/* ---------- the stabiliser rings: arcs between them, current riding them, torque and momentum while they turn the ship ---------- */
const RA = [0, 0, 0], RB = [0, 0, 0];
const ringPt = (Tc, r, a, z, o) => apXYZ(o, Tc, Math.cos(a) * r, Math.sin(a) * r, z);
const apXYZ = (o, x, px, py, pz) => { const M = x.R, t = x.T; o[0] = M[0] * px + M[1] * py + M[2] * pz + t[0]; o[1] = M[3] * px + M[4] * py + M[5] * pz + t[1]; o[2] = M[6] * px + M[7] * py + M[8] * pz + t[2]; return o; };
function arcDots(c, U, Wv, r, a0, a1, n, col, a, sz) { for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n, cs = Math.cos(t) * r, sn = Math.sin(t) * r; K.dotW(c[0] + U[0] * cs + Wv[0] * sn, c[1] + U[1] * cs + Wv[1] * sn, c[2] + U[2] * cs + Wv[2] * sn, sz || 1, col, a); } }
function arrowW(a, b, col, al, head) {
  K.lineW(a[0], a[1], a[2], b[0], b[1], b[2], 2.2, 2, col, al, LIME, .06, .02);
  const d = V.norm(V.sub(b, a)), [U] = GEO.perp(d), h = head || V.dist(a, b) * .12;
  for (const s of [1, -1]) { const q = V.add(V.mad(b, d, -h), V.mul(U, s * h * .5)); K.lineW(b[0], b[1], b[2], q[0], q[1], q[2], 1.6, 2, col, al); }
}
function drawRingFX(T, Tw, PP) {
  const ao = arcsOn(T), pw = ringPow(T), CA = PP.rings[0].C, CB = PP.rings[1].C, hz = P.RSEC[1] / 2, RR_ = P.RING_R;
  // arcs across the gap between the rings: a dozen at a time, each a few tenths of a second, brighter through the charge
  if (ao > .01) {
    const boost = 1 + 1.6 * chg(T), n = Math.round(18 + 14 * chg(T));
    for (let k = 0; k < n; k++) {
      const cyc = Math.floor(T * 2.6 + k * .37), ph = (T * 2.6 + k * .37) % 1, life = Math.sin(PI * ph);
      if (hh(k, cyc) < .25) continue;
      const a = hh(k * 3 + 1, cyc) * TAU, da = (hh(k * 5 + 2, cyc) - .5) * .05, rr = RR_ + (hh(k * 7, cyc) - .5) * 7;
      ringPt(CA, rr, a, -hz - .4, RA); ringPt(CB, rr, a + da, hz + .4, RB);
      K.arcW(RA, RB, k * 13 + cyc, T, ao * life * .9 * boost, .28, HOT, k % 3 ? 1 : 2);
      if (life > .6) { K.glowW(RA[0], RA[1], RA[2], 10, LIME, .3 * ao * life); K.glowW(RB[0], RB[1], RB[2], 10, LIME, .3 * ao * life); }
    }
  }
  // the gap's glow: charge drifting between the rings (a sparse sheet of lime dots that pulses with the arcs)
  if (ao > .01) for (let i = 0; i < 900; i++) { const a = hh(i, 3) * TAU + T * .05 * (i % 2 ? 1 : -1), rr = RR_ + (hh(i, 4) - .5) * 9, f = hh(i, 5); ringPt(f < .5 ? CA : CB, rr, a, (f < .5 ? -1 : 1) * (hz + .4 + 44 * (f < .5 ? f : 1 - f)), RA); K.dotW(RA[0], RA[1], RA[2], 1, LIME, ao * .35 * (.5 + .5 * Math.sin(T * 7 + i))); }
  // contact arcs at the bearing shoes
  if (pw > .02) for (let ri = 0; ri < 2; ri++) for (let p = 0; p < 4; p++) {
    const R_ = PP.rings[ri], cyc = Math.floor(T * 9 + p + ri * 4); if (hh(p + ri * 4, cyc) < .45) continue;
    const a = P.PYL[p] + (hh(p * 3 + ri, cyc) - .5) * .06;
    ringPt(R_.C, P.SHOE_R + 1.6, a, (hh(p, cyc + 1) - .5) * 10, RA); ringPt(R_.C, RR_ - P.RSEC[0] / 2 - .2, a + (hh(p * 7, cyc) - .5) * .03, (hh(p * 9, cyc) - .5) * 12, RB);
    K.arcW(RA, RB, p * 31 + ri * 7 + cyc, T, pw * .8, .4, HOT);
  }
  // current racing round the inner rails
  if (pw > .02) for (let ri = 0; ri < 2; ri++) { const C_ = PP.rings[ri].C, dir = ri ? -1 : 1; for (let k = 0; k < 36; k++) { const a = k / 36 * TAU + dir * T * .9; for (let q = 0; q < 5; q++) { ringPt(C_, RR_ - P.RSEC[0] / 2 - .6, a - dir * q * .004, (k % 2 ? 4 : -4), RA); K.dotW(RA[0], RA[1], RA[2], q ? 1 : 2, q ? LIME : HOT, pw * (1 - q / 5)); } } }
  // turning the ship: the rings' momentum (A along its axis, B against it), its net sweeping across as they tilt, the
  // torque on the ship as a curved arrow about the slew's axis
  const tl = PP.rings[0].tilt, sw = win(T, SLEW[0] - .6, SLEW[1] + .8, .6) + win(T, SLEW_B[0] - .6, SLEW_B[1] + .8, .6) + win(T, TX, TX + 6, .3) * .8;
  if (sw > .02) {
    const mid = X.ap(Tw, [0, 0, (P.RING_Z[0] + P.RING_Z[1]) / 2]), z0 = X.dir(Tw, [0, 0, 1]);
    // each ring's momentum shown at four points of its rim, along its (tilted) axis: A's one way, B's the other; the
    // tilt from the ship's axis drawn as a short dotted sweep at each tip (the scissor)
    for (let ri = 0; ri < 2; ri++) {
      const R_ = PP.rings[ri], ax = [R_.C.R[2], R_.C.R[5], R_.C.R[8]], s = ri ? -1 : 1;
      for (let k = 0; k < 4; k++) {
        const a = k * PI / 2 + PI / 4; ringPt(R_.C, RR_ + P.RSEC[0] / 2 + 14, a, 0, RA);
        const base = [RA[0], RA[1], RA[2]], tip = V.mad(base, ax, s * 70), tip0 = V.mad(base, z0, s * 70);
        arrowW(base, tip, LIME, .85 * sw, 12);
        if (V.dist(tip, tip0) > .8) for (let i = 0; i <= 16; i++) { const p = V.lerp(tip0, tip, i / 16); K.dotW(p[0], p[1], p[2], 2, HOT, .7 * sw); }
      }
    }
    // the net momentum the pair hands the ship (across the gimbal axis) and the torque turning it: a curved arrow round
    // the slew's axis, its sense the turn's
    const g = P.GAX, gd = X.dir(Tw, V.cross([g[0], g[1], 0], [0, 0, 1])), net = Math.sin(Math.abs(tl)) * 9000;
    if (net > 6) { const b0 = V.mad(mid, X.dir(Tw, [0, 1, 0]), 120); arrowW(b0, V.mad(b0, gd, Math.sign(tl) * Math.min(260, net)), HOT, .9 * sw, 18); }
    const sa = X.dir(Tw, SLEW_AX), [U, Wv] = GEO.perp(sa), acc = slewAcc(T), tq = E.clamp(Math.abs(acc) / SLEW_AMAX, 0, 1) * (win(T, SLEW[0], SLEW[1], .4) + win(T, SLEW_B[0], SLEW_B[1], .4)) + .7 * win(T, TX, TX + 2.5, .2);
    if (tq > .03) for (const r of [330, 345]) {
      const s0 = (acc >= 0 ? 1 : -1) * (T > SLEW_B[0] - 1 ? -1 : 1), a0 = -.9 * s0, a1 = .9 * s0;
      arcDots(mid, U, Wv, r, a0, a1, 240, LIME, .9 * tq, 2);
      const pE = V.add(mid, V.add(V.mul(U, Math.cos(a1) * r), V.mul(Wv, Math.sin(a1) * r))), tg = V.norm(V.add(V.mul(U, -Math.sin(a1) * s0), V.mul(Wv, Math.cos(a1) * s0)));
      if (r === 330) arrowW(V.mad(pE, tg, -50), pE, LIME, .95 * tq, 26);
    }
  }
}

/* ---------- the construction ring: its bearing gap, the swarm, the lightning, the deposition fronts, its lasers ---------- */
/* the swarm: 24 streams, one from each emitter head on the stator, spiralling in and back onto a point of a fresh layer
   that sweeps round the barrel; a looser cloud round them; a spark where each lands */
const NST = 24, NPS = 170, NCL = 1800;
const STM = (() => { const r = rng(4242), A = new Float32Array(NST * 6), LS = [2, 1, 2, 4, 0, 3, 2, 1, 4, 2, 3, 1]; for (let k = 0; k < NST; k++) { A[k * 6] = LS[k % 12]; A[k * 6 + 1] = r() * TAU; A[k * 6 + 2] = 2 + 7 * r(); A[k * 6 + 3] = (r() < .5 ? -1 : 1) * (.7 + .5 * r()); A[k * 6 + 4] = .9 + .5 * r(); A[k * 6 + 5] = r(); } return A; })();
const SPJ = (() => { const r = rng(4343), A = new Float32Array(NST * NPS * 3); for (let i = 0; i < A.length; i++) A[i] = r(); return A; })();
const CLD = (() => { const r = rng(4444), A = new Float32Array(NCL * 5); for (let i = 0; i < A.length; i++) A[i] = r(); return A; })();
const LAYR = L => L === 0 ? P.LINER_R : L === 1 ? P.MAG_RC : L === 2 ? P.HR : L === 3 ? P.HA - 2 : P.HA + .2;
/* the stream k's curve at u (platform frame, cylindrical) into SWP: from the emitter (r0, ae, z0) to the target */
const SWP = [0, 0, 0];
function streamPt(k, u, c, back, T, o) {
  const L = STM[k * 6], fz = ST.front[L], ae = k / NST * TAU + 7.5 * DEG, at = ae + STM[k * 6 + 3] + STM[k * 6 + 1] * .2 + T * .22 * STM[k * 6 + 4];
  const zt = back ? fz + STM[k * 6 + 2] : fz - STM[k * 6 + 2], r0 = P.CR_ST - 2.5, z0 = c - 4.2, rt = LAYR(L);
  const ue = 1 - Math.pow(1 - u, 1.7), r = r0 + (rt - r0) * ue, a = ae + (at - ae) * Math.pow(u, 1.15), z = z0 + (zt - z0) * u + (back ? -1 : 1) * 9 * Math.sin(PI * u);
  o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r; o[2] = z; return zt;
}
function drawSwarm(T, PP) {
  if (!crBuild(T)) return;
  const back = T > UNB[0], c = ST.cr.z, Wt = PP.W, M = Wt.R, t = Wt.T, I = ss(BUILD[0] - .3, BUILD[0] + .8, T) * (1 - ss(BUILD[1] - 2, BUILD[1] + .5, T)) + (back ? ss(UNB[0], UNB[0] + 1, T) * (1 - ss(CRK[0] - 1.5, CRK[0], T)) : 0);
  if (I < .01) return;
  const toW = (x, y, z) => { SWP[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; SWP[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; SWP[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; };
  const fr = Math.floor(T * 20), Q = [0, 0, 0];
  for (let k = 0; k < NST; k++) {
    const L = STM[k * 6], fz = ST.front[L]; if (fz < -1e8 || fz > 1e8) continue;
    const zt0 = back ? fz + STM[k * 6 + 2] : fz - STM[k * 6 + 2]; if (zt0 < 0 || zt0 > Z_MZ) continue;
    const sp = 1.15 * STM[k * 6 + 4], ph = STM[k * 6 + 5];
    // the stream's filament, faint, its bots riding it
    streamPt(k, 0, c, back, T, Q); toW(Q[0], Q[1], Q[2]); let px = SWP[0], py = SWP[1], pz = SWP[2];
    for (let s = 1; s <= 18; s++) { streamPt(k, s / 18, c, back, T, Q); toW(Q[0], Q[1], Q[2]); K.lineW(px, py, pz, SWP[0], SWP[1], SWP[2], 2.2, 1, LIME, .32 * I, null, 0, 0); px = SWP[0]; py = SWP[1]; pz = SWP[2]; }
    for (let i = 0; i < NPS; i++) {
      const j = (k * NPS + i) * 3;
      let u = (T * sp + i / NPS + ph) % 1; if (back) u = 1 - u;
      streamPt(k, u, c, back, T, Q);
      const w = .3 + (1 - u) * .7, x = Q[0] + (SPJ[j] - .5) * w, y = Q[1] + (SPJ[j + 1] - .5) * w, z = Q[2] + (SPJ[j + 2] - .5) * w * 1.4;
      toW(x, y, z);
      const b = I * (.45 + .55 * Math.pow(Math.sin(PI * u), .5)) * (.6 + .4 * hh(k * NPS + i, fr));
      K.dotW(SWP[0], SWP[1], SWP[2], u > .86 || i % 3 === 0 ? 2 : 1, u > .9 ? HOT : i % 6 ? LIME : WH, Math.min(1, b * 1.5));
    }
    // the landing: a spark and a short-lived glint where the stream deposits
    streamPt(k, 1, c, back, T, Q); toW(Q[0], Q[1], Q[2]);
    K.glowW(SWP[0], SWP[1], SWP[2], 9, LIME, .5 * I);
    for (let s = 0; s < 6; s++) { const a = hh(k * 6 + s, fr) * TAU, d = hh(k * 6 + s, fr + 1) * 2.5; K.dotW(SWP[0] + Math.cos(a) * d, SWP[1] + Math.sin(a) * d, SWP[2] + (hh(s, fr + k) - .5) * 2, 1, HOT, .8 * I); }
  }
  // the cloud: loose bots drifting round the streams between the ring and the fronts
  for (let i = 0; i < NCL; i++) {
    const o = i * 5, k = Math.floor(CLD[o] * NST), L = STM[k * 6], fz = ST.front[L]; if (fz < -1e8 || fz > 1e8) continue;
    let u = (T * .35 * (.6 + CLD[o + 1]) + CLD[o + 2]) % 1; if (back) u = 1 - u;
    streamPt(k, u, c, back, T, Q);
    const sp = 3 + 9 * CLD[o + 3], a = CLD[o + 4] * TAU + T * .8;
    toW(Q[0] + Math.cos(a) * sp, Q[1] + Math.sin(a) * sp, Q[2] + (CLD[o + 3] - .5) * sp);
    K.dotW(SWP[0], SWP[1], SWP[2], 1, i % 4 ? LIME : WH, I * .5 * Math.sin(PI * u));
  }
  // lightning: from emitters down into the fresh structure, and crawling over it between the frame's longerons
  // lightning laced along the streams (a few at a time, re-struck), and crawling over the fresh frame
  const fl = Math.floor(T * 15);
  for (let q = 0; q < 7; q++) {
    const k = Math.floor(hh(q, fl) * NST), L = STM[k * 6], fz = ST.front[L]; if (fz < 0 || fz > 1e8 || hh(q + 7, fl) < .25) continue;
    const u0 = hh(q, fl + 1) * .3, u1 = u0 + .35 + .35 * hh(q, fl + 2);
    streamPt(k, u0, c, back, T, Q); toW(Q[0], Q[1], Q[2]); RA[0] = SWP[0]; RA[1] = SWP[1]; RA[2] = SWP[2];
    streamPt(k, Math.min(1, u1), c, back, T, Q); toW(Q[0], Q[1], Q[2]); RB[0] = SWP[0]; RB[1] = SWP[1]; RB[2] = SWP[2];
    K.arcW(RA, RB, q * 17 + fl, T, I * (.65 + .35 * hh(q, fl + 3)), .2, HOT);
  }
  const f2 = ST.front[2];
  if (f2 > 0 && f2 < 1e8) for (let k = 0; k < 12; k++) {
    const cyc = Math.floor(T * 10 + k * .41); if (hh(k * 3, cyc) < .35) continue;
    const v = Math.floor(hh(k, cyc) * 6), za = back ? f2 + hh(k, cyc + 3) * 28 : f2 - hh(k, cyc + 3) * 28, zb = za + (back ? 1 : -1) * (2 + 8 * hh(k, cyc + 5));
    if (Math.min(za, zb) < 0) continue;
    wpPolar(Wt, P.HR, v * PI / 3, za, RA); wpPolar(Wt, P.HR, ((v + (hh(k, cyc + 7) < .5 ? 1 : 2)) % 6) * PI / 3, zb, RB);
    K.arcW(RA, RB, k * 29 + cyc, T, I * .85, .3, LIME);
  }
  // the deposition fronts: each layer's section drawn in light where it is forming
  const hexAt = (r, z, a0, col, al) => { for (let k = 0; k < 6; k++) { wpPolar(Wt, r, a0 + k * PI / 3, z, RA); wpPolar(Wt, r, a0 + (k + 1) * PI / 3, z, RB); K.lineW(RA[0], RA[1], RA[2], RB[0], RB[1], RB[2], 1.3, 1, col, al, LIME, .05, 0); } };
  for (let L = 0; L < 5; L++) {
    const fz = ST.front[L]; if (fz < 0 || fz > Z_MZ) continue;
    const al = I * (.75 + .25 * Math.sin(T * 30 + L)), cz = X.ap(Wt, [0, 0, fz]), U = X.dir(Wt, [1, 0, 0]), Wv = X.dir(Wt, [0, 1, 0]);
    if (L === 0) K.ringW(cz, U, Wv, P.LINER_R, 40, 2, HOT, al);
    else if (L === 1) { for (let m = 0; m < 9; m++) { const a = PI / 2 + m * TAU / 9; wpPolar(Wt, P.MAG_RC, a, fz, RA); K.ringW(RA, U, Wv, P.MAG_R, 14, 1, HOT, al); } K.ringW(cz, U, Wv, P.CRING_R, 36, 1, LIME, al * .7); }
    else if (L === 2) hexAt(P.HR, fz, 0, HOT, al);
    else if (L === 3) hexAt(P.HA - 1, fz, PI / 6, LIME, al * .8);
    else hexAt(P.HR + .3, fz, 0, LIME, al);
  }
}
function drawCRFX(T, PP) {
  const sp = crFrac(T), Fc = PP.cr.F;
  // the bearing gap between the static stator and the spinning rim: a ring of light that brightens with the spin
  if (sp > .02) { const U = [Fc.R[0], Fc.R[3], Fc.R[6]], Wv = [Fc.R[1], Fc.R[4], Fc.R[7]], d = V.dist(Fc.T, C.eye), n = Math.max(80, Math.min(1600, Math.round(P.CR_R * C.fl / Math.max(1, d) * TAU / 4))); for (const z of [-4, 4]) { const c = X.ap(Fc, [0, 0, z]); K.ringW(c, U, Wv, P.CR_R - 6.2, n, 1, LIME, .45 * sp); } }
  // the dock's latches: sparks as they let go and as they close again
  for (const t0 of [CRU[0] + .2, CRK[1] - .5]) { const a = T - t0; if (a > 0 && a < 1.2) for (let k = 0; k < 4; k++) { const L4 = PP.arms[k]; P.apTo(RA, L4, [0, 0, 15.4]); K.glowW(RA[0], RA[1], RA[2], Math.round(30 * Math.exp(-a * 3) + 6), LIME, .8 * Math.exp(-a * 2.5)); for (let i = 0; i < 20; i++) { const th = hh(i, k) * TAU, ph = hh(i, k + 9) * PI, sd = 6 + 10 * hh(i, k + 3); K.dotW(RA[0] + Math.cos(th) * Math.sin(ph) * sd * a, RA[1] + Math.cos(ph) * sd * a, RA[2] + Math.sin(th) * Math.sin(ph) * sd * a, 1, HOT, Math.exp(-a * 2.4)); } } }
  // the alignment lasers: six beams from the prow's posts to the receivers on its spokes, found in turn, jittering then
  // settling
  const lk = crLink(T);
  if (lk > .01) for (let k = 0; k < 6; k++) {
    const t0 = CRL[0] + .25 * k, a = PP.align.e[k], b = PP.align.r[k], age = T - t0; if (age < 0) continue;
    const jt = Math.exp(-Math.max(0, age - .45) * 1.4) * .9 + (crBuild(T) ? .12 : 0), j = [b[0] + (hh(k, Math.floor(T * 12)) - .5) * jt, b[1] + (hh(k + 6, Math.floor(T * 12)) - .5) * jt, b[2]];
    beam(a, j, t0, T, lk, true, true);
  }
}

/* ---------- engines: plumes (dots), retro pods, the gimbal actuators ---------- */
const NPL = 3200, PLM = (() => { const r = rng(7171), A = new Float32Array(NPL * 4); for (let i = 0; i < NPL; i++) { A[i * 4] = r(); A[i * 4 + 1] = r() * TAU; A[i * 4 + 2] = Math.sqrt(r()); A[i * 4 + 3] = r(); } return A; })();
const PE = [0, 0, 0], PD = [0, 0, 0], PG = [0, 0, 0];
/* a glow of world radius wr at p (screen size from its depth) */
function glowR(x, y, z, wr, col, a) { if (!K.pj(x, y, z)) return; const px = Math.min(140, wr * C.fl / Math.max(1, K.PJ[2])); if (px < 1.5) { K.dotW(x, y, z, 1, col, a); return; } K.glowW(x, y, z, Math.round(px), col, a); }
/* an engine's plume: a white-hot throat, a filled cone of dots streaming out, a glowing column, shock diamonds */
function plume(ex, d, U, Wd, I, T, len, r0, spread, seed) {
  if (I < .02) return;
  const fr = Math.floor(T * 30), L_ = len * (.7 + .3 * I);
  glowR(ex[0], ex[1], ex[2], r0 * 2.2, HOT, .7 * I);
  for (const [f, wr, a] of [[.03, 1.5, .5], [.09, 2, .3], [.18, 2.6, .14]]) { const s = L_ * f; glowR(ex[0] + d[0] * s, ex[1] + d[1] * s, ex[2] + d[2] * s, r0 * wr + s * spread * .5, HOT, a * I); }
  for (let i = 0; i < NPL; i++) {
    const o = i * 4, u = (PLM[o] + T * (.9 + .8 * PLM[o + 3])) % 1, s = L_ * Math.pow(u, 1.6), rr = (r0 * .85 + s * spread) * PLM[o + 2], th = PLM[o + 1] + (hh(i, fr + seed) - .5) * .25;
    const b = 1.4 * I * (1 - u) * (.55 + .45 * PLM[o + 3]) * (u < .05 ? 1.5 : 1);
    if (b < .03) continue;
    const cx = Math.cos(th) * rr, cy = Math.sin(th) * rr;
    K.dotW(ex[0] + d[0] * s + U[0] * cx + Wd[0] * cy, ex[1] + d[1] * s + U[1] * cx + Wd[1] * cy, ex[2] + d[2] * s + U[2] * cx + Wd[2] * cy, u < .3 ? 2 : 1, u < .14 ? HOT : i % 3 ? WH : LIME, Math.min(1, b));
  }
  for (let k = 1; k <= 6; k++) { const s = k * r0 * 1.9, rr = r0 * (.42 + .22 * Math.sin(k * 1.7 + T * 9)), c = V.mad(ex, d, s); K.ringW(c, U, Wd, rr, 72, k < 3 ? 2 : 1, HOT, I * .95 * (1 - k / 7), k + T); }
  PG[0] = ex[0] + d[0] * r0 * 1.5; PG[1] = ex[1] + d[1] * r0 * 1.5; PG[2] = ex[2] + d[2] * r0 * 1.5; glowR(PG[0], PG[1], PG[2], r0 * .9, HOT, .8 * I);
  K.lineW(ex[0], ex[1], ex[2], ex[0] + d[0] * L_ * .1, ex[1] + d[1] * L_ * .1, ex[2] + d[2] * L_ * .1, 1.2, 2, HOT, .5 * I, HOT, .04, 0);
}
const ACT_O = { L: [0, 1, 0], occ: true };
function drawEngines(T, Tw, PP) {
  ACT_O.L = L_SUN; ACT_O.fx = fx;
  for (let e = 0; e < 4; e++) {
    const A = PP.act[e];
    if (V.dist(A[0], C.eye) < 1500) for (const [a, b] of [[A[0], A[1]], [A[2], A[3]]]) { const m = V.lerp(a, b, .58); ORL.tubeW(a, m, .9, .8, 12, 2, ACT_O); ORL.tubeW(V.lerp(a, b, .5), b, .45, 1, 12, 2, ACT_O); }
    const I = THR[e]; if (I < .02) continue;
    const B = PP.exts[e];
    P.apTo(PE, B, [0, 0, -(P.BELL_L - 1.5 + P.EXT_L) - 1]); PD[0] = -B.R[2]; PD[1] = -B.R[5]; PD[2] = -B.R[8];
    const [U, Wd] = GEO.perp(PD);
    plume(PE, PD, U, Wd, I, T, 900, 19, .2, e * 31);
  }
  if (RETRO_A > .02) for (let e = 0; e < 4; e++) {
    const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t), d = V.norm([c * .55, s * .55, 1]), b = [c * (P.HSG_R + 4), s * (P.HSG_R + 4), -10];
    const ex = X.ap(Tw, V.mad(b, d, 5)), dw = X.dir(Tw, d), [U, Wd] = GEO.perp(dw);
    plume(ex, dw, U, Wd, RETRO_A, T, 200, 4.2, .14, 200 + e * 7);
  }
}

/* ---------- the laser line: beams, search spirals, glints ---------- */
const BB = [0, 0, 0];
function beam(a, b, t0, T, I, tgt, thin) {
  const age = T - t0; if (age < 0 || I < .02) return;
  // acquisition: the far end circles the target, tightening, for 0.45 s, then holds
  const sr = age < .45 ? (1 - age / .45) * (1 - age / .45) * 2.6 : 0, an = age * 26;
  const [U, Wd] = GEO.perp(V.norm(V.sub(b, a)));
  BB[0] = b[0] + (U[0] * Math.cos(an) + Wd[0] * Math.sin(an)) * sr; BB[1] = b[1] + (U[1] * Math.cos(an) + Wd[1] * Math.sin(an)) * sr; BB[2] = b[2] + (U[2] * Math.cos(an) + Wd[2] * Math.sin(an)) * sr;
  const k = I * (age < .1 ? age / .1 : 1);
  if (thin) K.lineW(a[0], a[1], a[2], BB[0], BB[1], BB[2], 1.6, 1, LIME, .5 * k, null, 0, 0);
  else K.lineW(a[0], a[1], a[2], BB[0], BB[1], BB[2], 1.1, 1, HOT, .85 * k, LIME, .07, .025);
  K.glowW(a[0], a[1], a[2], thin ? 5 : 10, LIME, .5 * k);
  if (age > .45) { const g = Math.exp(-(age - .45) * 4); K.glowW(b[0], b[1], b[2], Math.round((thin ? 6 : 14) + (thin ? 24 : 50) * g), LIME, (thin ? .3 : .45) * k + .6 * g * k); if (tgt) K.ringW(b, U, Wd, 1.4 + 3 * g, 36, 1, LIME, .8 * k * g, 0); }
  else K.glowW(BB[0], BB[1], BB[2], 12, HOT, .6 * k);
}
function drawLasers(T, PP) {
  const L_ = PP.laser, lk = crLink(T);
  // the bore line while the barrel is built: from the prow bench up the line to the CR, each collar's mast locking as it
  // is reached (and the reference beams from the tower), faint
  if (lk > .01 && T < CAL[0]) {
    const cr = L_[14]; beam(L_[2], cr, CRL[0] + 1.6, T, lk * .8, true, true);
    beam(L_[0], L_[1], CRL[0] + 1.0, T, lk * .45, false, true); beam(L_[1], L_[2], CRL[0] + 1.3, T, lk * .45, false, true);
    for (let k = 1; k < NSEG; k++) { const t0 = LOCKC(k); if (T > t0) { const g = Math.exp(-(T - t0) * 3), p = L_[3 + k]; K.glowW(p[0], p[1], p[2], Math.round(10 + 40 * g), LIME, .4 + .6 * g); } }
  }
  if (lk > .01 && T > CAL[1] + 2.4) { beam(L_[2], L_[14], CAL[1], T, lk * .6, false, true); }
  if (T < CAL[0] || T > CAL[1] + 2.4) return;
  const I = 1 - ss(CAL[1] + .4, CAL[1] + 2.4, T);
  beam(L_[0], L_[1], LOCK_T[0], T, I, true);
  for (let k = 0; k < 4; k++) beam(L_[1], L_[10 + k], RING_T(k), T, I, true);
  beam(L_[1], L_[2], LOCK_T[1] + .9, T, I, true);
  beam(L_[2], L_[4], LOCK_T[2] + .5, T, I, true);
  for (let k = 1; k < NSEG - 1; k++) beam(L_[3 + k], L_[4 + k], SENS_T(k) + .2, T, I, true);
  beam(L_[3 + NSEG - 1], L_[3 + NSEG], SENS_T(NSEG - 1) + .4, T, I, true);
  beam(L_[3 + NSEG], L_[14], CRR_T, T, I, true);
  // the return beam from the CR, a little offset
  if (T > CRR_T + .4) { const a = L_[14], b = L_[2]; K.lineW(a[0] + .6, a[1], a[2], b[0] + .6, b[1], b[2], 1.6, 1, LIME, .6 * I * ss(CRR_T + .4, CRR_T + .6, T), LIME, .04, 0); }
}
/* field lines: loops round the chamber coils (chamber shots); frost on the coils at 4.2 K; the clamps' bite */
const FLP = [0, 0, 0];
function drawFields(T, Tw) {
  const coil = ss(COILW[0], COILW[1], T) * (1 - ss(TX, TX + 2, T));
  if (V.dist(C.eye, Tw.T) > 260 && V.dist(C.eye, X.ap(Tw, [0, 0, -8])) > 260) return;
  const M = Tw.R, t = Tw.T, at = (x, y, z) => { FLP[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; FLP[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; FLP[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return FLP; };
  if (coil > .02) {
    for (const zc of [-8.8, -3.4]) for (let f = 0; f < 16; f++) {
      const ph = f / 16 * TAU, c = Math.cos(ph), s = Math.sin(ph);
      for (const rho of [1.4, 2.3, 3.3]) {
        const n = Math.round(30 + 14 * rho);
        for (let i = 0; i < n; i++) {
          const th = i / n * TAU + T * 2.4 / rho, r = 3.4 + rho * Math.cos(th), z = zc + rho * 1.3 * Math.sin(th);
          if (r < 1.1) continue;
          at(c * r, s * r, z); K.dotW(FLP[0], FLP[1], FLP[2], 1, LIME, coil * (.25 + .3 * (.5 + .5 * Math.sin(th * 3 - T * 6))));
        }
      }
    }
  }
  // frost: crystals grow over the coils as they reach 4.2 K
  const fr = ss(COILW[0] + .2, COILW[1] + 1.5, T) * (1 - ss(TX + 4, TX + 9, T));
  if (fr > .02) for (let i = 0; i < 2600; i++) { if (hh(i, 5) > fr) continue; const zc = hh(i, 6) < .5 ? -10.8 + 4 * hh(i, 7) : -5.4 + 4 * hh(i, 7), a = hh(i, 8) * TAU, r = 4.45 + .1 * hh(i, 9); at(Math.cos(a) * r, Math.sin(a) * r, zc); K.dotW(FLP[0], FLP[1], FLP[2], 1, WH, (.35 + .65 * hh(i, Math.floor(T * 6))) * (.5 + .5 * fr)); }
  // the clamps' bite: a puff off each jaw
  const pa = T - CLAMPW[1] + .1;
  if (pa > 0 && pa < 1.4) for (let k = 0; k < 12; k++) { const t0 = PI / 6 + (k % 6) * PI / 3, z0 = k < 6 ? -8.4 : -3.6; for (let i = 0; i < 26; i++) { const a = t0 + (hh(i, k) - .5) * .9, r = 2.4 + pa * (2 + 5 * hh(i, k + 3)), z = z0 + (hh(i, k + 5) - .5) * 2 * (1 + pa); at(Math.cos(a) * r, Math.sin(a) * r, z); K.dotW(FLP[0], FLP[1], FLP[2], 1, WH, .7 * Math.exp(-pa * 2.2)); } }
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
/* the reconfiguration: each wave's front runs up the barrel as a ring of light round the hex (lime, lime, white) */
function drawFlapFronts(T, Tw) {
  for (let i = 0; i < 3; i++) {
    const w = FLW[i], u = (T - w[0]) / (w[1] - w[0] - .8); if (u < 0 || u > 1.05) continue;
    const z = u * (NB - 1) * P.BAYL + 5, a = Math.sin(PI * E.sat(u)) * .9 + .3, col = i === 2 ? HOT : LIME;
    for (const r of [P.HR + 1.4 + i * .9, P.HR + 3.2 + i * .9]) for (let k = 0; k < 6; k++) { wpPolar(Tw, r, k * PI / 3, z, RA); wpPolar(Tw, r, (k + 1) * PI / 3, z, RB); K.lineW(RA[0], RA[1], RA[2], RB[0], RB[1], RB[2], 1.3, 2, col, a, LIME, .06, 0); }
    for (let k = 0; k < 6; k++) { wpPolar(Tw, P.HR + 4, k * PI / 3, z, RA); K.glowW(RA[0], RA[1], RA[2], 16, col, .35 * a); }
  }
}

/* ---------- camera ----------
   One calm, continuous take. Each shot is a slow keyed path (cubic Hermite through its keys, at rest at its first and
   last key and at keys marked stop) either riding in the platform's frame (fr: the pose at T) or fixed in the world.
   Shots hand over in long blends (CUTS: never under 2 s): the look turns about the axis between the two directions
   (never a vector lerp through the middle), the up vector is carried explicitly and turned the same way (no roll
   flips), and km-scale moves swing the eye about an anchor with its distance log-mixed. Shot internals:
   { eye, f (unit look), up (unit, world), fov (rad), d (subject distance: the LOD reads it) }. Up: local vertical at
   the eye by default, the platform's +Y where a key sets uy: 1 (close work on the structure, matching the insert). */
const ZV = [0, 0, 0], YW = [0, 1, 0];
const sm5 = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10);
const upV = p => V.norm(V.sub(p, CE));
function rotA(v, ax, a) {
  const c = Math.cos(a), s = Math.sin(a), d = V.dot(ax, v) * (1 - c), x = V.cross(ax, v);
  return [v[0] * c + x[0] * s + ax[0] * d, v[1] * c + x[1] * s + ax[1] * d, v[2] * c + x[2] * s + ax[2] * d];
}
/* turn unit a toward unit b by fraction w about their common normal (alt: the axis to use when they are opposed) */
function slerpDir(a, b, w, alt) {
  const c = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(c);
  if (th < 1e-5) return b.slice();
  let ax = V.cross(a, b);
  if (V.len(ax) < 1e-4) ax = alt || (Math.abs(a[1]) < .9 ? V.cross(a, YW) : V.cross(a, [1, 0, 0]));
  return rotA(a, V.norm(ax), th * w);
}
/* a keyed path: keys { t, e: eye, g: look point (in fr's frame), fov (deg), uy (0..1), stop }; fr(T) -> transform or null */
function KP(keys, fr) {
  // (keys out of order -- a timeline still being changed -- are dropped, not allowed to fold the path back on itself)
  keys = keys.filter((k, i) => i === 0 || k.t > keys[i - 1].t + 1e-3 || (LOG.push(`camera: key at ${k.t.toFixed(2)} out of order`), false));
  const n = keys.length;
  for (const k of keys) if (k.uy === undefined) k.uy = 0;
  const tan = (i, f) => {
    if (i === 0 || i === n - 1 || keys[i].stop) return f === 'e' || f === 'g' ? ZV : 0;
    const a = keys[i - 1], b = keys[i + 1], dt = b.t - a.t;
    return f === 'e' || f === 'g' ? V.mul(V.sub(b[f], a[f]), 1 / dt) : (b[f] - a[f]) / dt;
  };
  const M = keys.map((k, i) => ({ e: tan(i, 'e'), g: tan(i, 'g'), fov: tan(i, 'fov'), uy: tan(i, 'uy') }));
  const H = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + m1 * dt * (u3 - u2); };
  const f = T => {
    let i = 0; while (i < n - 2 && keys[i + 1].t <= T) i++;
    const a = keys[i], b = keys[n > 1 ? i + 1 : 0], dt = Math.max(1e-6, b.t - a.t), u = E.clamp((T - a.t) / dt, 0, 1);
    const v3 = k => [0, 1, 2].map(c => H(a[k][c], b[k][c], M[i][k][c], M[i + 1 < n ? i + 1 : i][k][c], u, dt));
    const e = v3('e'), g = v3('g'), Tw = fr ? fr(T) : null;
    const eye = Tw ? X.ap(Tw, e) : e, tg = Tw ? X.ap(Tw, g) : g, d = Math.max(1, V.dist(eye, tg));
    const uy = E.sat(H(a.uy, b.uy, M[i].uy, M[i + 1 < n ? i + 1 : i].uy, u, dt));
    const uv = upV(eye), up = uy > 0 && Tw ? V.norm(V.lerp(uv, X.dir(Tw, YW), uy)) : uv;
    return { eye, f: V.mul(V.sub(tg, eye), 1 / d), up, fov: H(a.fov, b.fov, M[i].fov, M[i + 1 < n ? i + 1 : i].fov, u, dt) * DEG, d };
  };
  f.t0 = keys[0].t; f.t1 = keys[n - 1].t;
  return f;
}
const K_ = (t, e, g, fov, o) => Object.assign({ t, e, g, fov }, o);
const FRP = T => platAt(T);                                      // rides with the structure
/* a shot from {eye, target, fov, roll} (the FX module's, the insert's convention: roll about the look from world +Y) */
function fromCam(c) {
  const d = Math.max(1, V.dist(c.eye, c.target)), f = V.mul(V.sub(c.target, c.eye), 1 / d);
  let r = V.cross(YW, f); if (V.len(r) < 1e-9) r = [1, 0, 0]; r = V.norm(r);
  let u = V.cross(f, r);
  const rl = c.roll || 0;
  if (rl) { const cc = Math.cos(rl), s = Math.sin(rl); u = V.add(V.mul(u, cc), V.mul(r, -s)); }
  return { eye: c.eye.slice(), f, up: u, fov: c.fov, d };
}
/* -> {eye, target, fov, roll}: the roll that puts the carried up on screen up */
function toCam(s) {
  let f = s.f;
  if (Math.abs(f[1]) > .999999) f = V.norm([f[0] + 1e-5, f[1], f[2] + 1e-5]);
  const r0 = V.norm(V.cross(YW, f)), u0 = V.cross(f, r0);
  let up = V.sub(s.up, V.mul(f, V.dot(f, s.up)));
  if (V.len(up) < 1e-6) up = u0; else up = V.norm(up);
  return { eye: s.eye, target: V.mad(s.eye, f, s.d), fov: s.fov, roll: Math.atan2(-V.dot(up, r0), V.dot(up, u0)) };
}
/* blend two shots: w 0..1 (already eased); P an anchor (the eye swings about it, distance log-mixed) or null. The
   orientation (look and up together) turns along the shortest rotation between the two (a quaternion slerp): the look
   swings about one axis and the roll can never flip */
const qOf = s => K.Q.fromR(R.look(s.f, s.up));
function mixShot(A, B, w, P) {
  if (w <= 0) return A; if (w >= 1) return B;
  let eye;
  if (P) {
    const da = V.sub(A.eye, P), db = V.sub(B.eye, P), la = Math.max(1e-3, V.len(da)), lb = Math.max(1e-3, V.len(db));
    eye = V.mad(P, slerpDir(V.mul(da, 1 / la), V.mul(db, 1 / lb), w), K.logMix(la, lb, w));
  } else eye = V.lerp(A.eye, B.eye, w);
  const M = K.Q.toR(K.Q.slerp(qOf(A), qOf(B), w));
  return { eye, f: [M[2], M[5], M[8]], up: [M[1], M[4], M[7]], fov: A.fov + (B.fov - A.fov) * w, d: K.logMix(A.d, B.d, w) };
}
/* a shot fixed in space looking at a moving point */
const lookAt = (eye, tg, fov, up) => { const d = Math.max(1, V.dist(eye, tg)); return { eye, f: V.mul(V.sub(tg, eye), 1 / d), up: up || upV(eye), fov: fov * DEG, d }; };

/* ---- the shots (platform frame: +Z the bore toward the muzzle, +Y its top, +X starboard; the sun is to port and
   above while parked, to starboard once aimed). Hero views look down 15-30 deg so the Earth's limb runs behind the
   structure; each mechanism is held for as long as it acts, with slow, motivated moves between them ---- */
const LK = (t, e, g, fov) => ({ t, eye: e, target: g, fov });
const P0 = (t, e, g, fov) => LK(t, PW0(e), PW0(g), fov);
const PO = P.POI;
/* the opening (and the loop's end): the whole dormant ship from above and ahead, the rings round it, the Earth under */
const OPEN = P0(0, [-760, 420, 120], [0, -40, -330], 40);
/* the reactor's cutaway window faces port and up: points off it (d out along the window's normal, dz along the bore,
   dy up) */
const CUTP = PO.cut, CUTD = PO.cutDir;
const offCut = (d, dz, dy) => [CUTP[0] + CUTD[0] * d, CUTP[1] + CUTD[1] * d + (dy || 0), CUTP[2] + dz];
const inCut = d => [CUTP[0] - CUTD[0] * d, CUTP[1] - CUTD[1] * d, CUTP[2]];
/* Orbit -> Wake -> the cutaway: a slow drift down to the reactor as the lime wave runs out of it; in close while the
   drums turn, the core heats and the current starts round the couples; back as the twelve fins open; held while
   they glow and the pumps cycle */
const SH_OPEN = KP([
  K_(0, [-760, 420, 120], [0, -40, -330], 40),
  K_(XRJ[0] + .6, offCut(260, 120, 110), inCut(10), 42),
  K_(DRUMW[1] + .4, offCut(150, 70, 50), inCut(14), 42),
  K_(CURW[0] + 1.0, offCut(92, 40, 22), inCut(16), 42),
  K_(FINW[1] + .4, offCut(240, -170, 120), [0, 0, CUTP[2] - 10], 44),
  K_(XRJ[2] - .2, offCut(205, -150, 100), [0, 0, CUTP[2]], 44),
], FRP);
/* the stabiliser rings spin up, counter-rotating: wide on the pair, then in to the rims as the arcs start jumping
   between them, the nodes streaming past the lens */
const RNG = PO.rings, RR = PO.ringR, RZ = RNG[2];
const rimPt = (th, r, z) => [Math.cos(th) * r, Math.sin(th) * r, z];
const SH_RINGS = KP([
  K_(XRJ[3] - .4, [-600, 330, -600], [0, -10, RZ], 44),
  K_(ARC0 - .6, [-470, 250, -170], [-30, 20, RZ], 46),
  K_(RSPW[1] - .4, rimPt(2.56, RR + 26, RZ + 4), rimPt(1.95, RR, RZ), 52),
  K_(RSPW[1] + .6, rimPt(2.58, RR + 30, RZ + 10), rimPt(1.98, RR, RZ), 52),
], FRP);
/* the engines: a slow swing past the upper port nozzle as its extension slides out and gimbals, beside the plumes
   as they light; then riding with the ship (it holds still in the frame, the Earth wheels behind) while the rings
   scissor it round onto the coast, ending forward on the prow */
const NZ = PO.nozzles[1];
const SH_ENG = KP([
  K_(ENGX[0] - .6, [NZ[0] - 200, NZ[1] + 140, NZ[2] + 110], [NZ[0], NZ[1], NZ[2] + 6], 46),
  K_(GCHK[1], [NZ[0] - 110, NZ[1] + 46, NZ[2] - 50], [NZ[0], NZ[1], NZ[2] - 4], 46, { uy: .4 }),
  K_(BURN[0] + 1.6, [NZ[0] - 140, NZ[1] + 40, NZ[2] - 130], [NZ[0] + 40, NZ[1] - 10, NZ[2] - 120], 48, { uy: .8 }),
  K_((SLEW[0] + SLEW[1]) / 2 + 1, [-600, 300, -520], [0, 0, RZ], 46, { uy: 1 }),
  K_(MOVE[1] + .4, [-480, 220, 20], [0, -10, -130], 46, { uy: 1 }),
], FRP);
/* the detach: the dock's arms swing back, the construction ring's rim spins up, the prow lasers find its receivers,
   it moves out to the chamber's face: a slow push in from ahead and to port */
const CRDK = PO.crDock;
const SH_DETACH = KP([
  K_(CRU[0] - .4, [-330, 120, 70], [0, 0, CRDK[2] - 30], 46, { uy: .6 }),
  K_(CRL[0], [-260, 84, 6], [0, 6, CRDK[2] - 6], 46, { uy: .6 }),
  K_(CRD[1] + .4, [-220, 72, -60], [0, 4, 30], 46, { uy: .6 }),
], FRP);
/* the build (x60): ahead of the ring and a little off the bore axis, looking back at it as it leaves the prow, the
   ship and its rings behind it; a long, slow orbit round it to behind and beside it, looking down the new barrel
   with it toward the Earth, the lightning playing over the fresh layers; then high behind the ship, the whole gun
   below the lens as the barrel grows away toward the Earth and the ring comes to its park */
const BL = BUILD[1] - BUILD[0];
const B1 = [BUILD[0] - 1.2, BUILD[0] + .17 * BL], B2 = [B1[1] + 10, BUILD[0] + .66 * BL], B3 = [B2[1] + 6, BUILD[1] + 3];
const ride = (T, e, g, fov, uy) => { const z = crZ(T), Wt = platAt(T), s = lookAt(X.ap(Wt, [e[0], e[1], z + e[2]]), X.ap(Wt, [g[0], g[1], z + g[2]]), fov); if (uy) s.up = V.norm(V.lerp(s.up, X.dir(Wt, YW), uy)); return s; };
const SH_AHEAD = T => { const u = kk(T, B1[0], B1[1]); return ride(T, [-70 + 16 * u, 74 - 10 * u, 190 - 30 * u], [0, -10, -260], 50, .6); };
const SH_ALONG = T => { const u = kk(T, B1[1], B2[1]); return ride(T, [-150 + 60 * u, 44 + 16 * u, -110 - 130 * u], [0, 0, 10 + 20 * u], 48, .6); };
const E_WIDE = [-500, 420, -760];
const SH_WIDE = T => { const Wt = platAt(T), z = crZ(T); return lookAt(X.ap(Wt, E_WIDE), X.ap(Wt, [0, -40, 300 + .25 * (z - 300)]), 44); };
/* the calibration: in from the wide view to the tower, then riding the beam head down from the emitter on the tower
   through the deck and prow mirrors; beside the prow the camera stops and watches it climb the collar masts up the
   barrel to the crown and the ring */
const BEAMPTS = [P.LZ.emit, P.LZ.mid, P.LZ.prow, [0, P.BEAM_Y, 0.9], [0, P.BEAM_Y, Z_MZ - 2]];
const BEAM_PATH = mkPath(BEAMPTS);
const S_PROW = BEAM_PATH.cum[2];
const CP_ = [0, 0, 0], CQ_ = [0, 0, 0], ID_ = X.make();
const CAL_RIDE = [CAL[0] - .2, CAL[0] + .41 * (CAL[1] - CAL[0])];
function SH_CAL(T) {
  const s = (S_PROW + 20) * kk(T, CAL_RIDE[0], CAL_RIDE[1]) - 26;
  pathAt(BEAM_PATH, Math.max(0, s), ID_, CP_);
  const look = Math.max(0, s) + 140 + 520 * kk(T, CAL_RIDE[1] - 1.2, CAL[1]);
  pathAt(BEAM_PATH, Math.min(BEAM_PATH.L, look), ID_, CQ_);
  const Wt = platAt(T), eye = X.ap(Wt, [CP_[0] - 46, CP_[1] + 22, CP_[2] - 40]), tg = X.ap(Wt, [CQ_[0] * .7, CQ_[1] * .85, CQ_[2]]);
  const s0 = lookAt(eye, tg, 50); s0.up = X.dir(Wt, YW); return s0;
}
/* the reroute: over the starboard well as the rotary switches turn and the capacitor banks fill, then looking up the
   barrel as the current floods away to the gun */
const SWC = PO.switchyard, CAPS = PO.caps;
const SH_SW = KP([
  K_(SWW[0] - 1.0, [SWC[0] + 84, SWC[1] + 118, SWC[2] - 92], [SWC[0] - 8, SWC[1] + 14, SWC[2] + 22], 48, { uy: 1 }),
  K_(SWW[1] + 1.4, [SWC[0] + 66, SWC[1] + 104, SWC[2] - 64], [SWC[0] - 10, SWC[1] + 18, SWC[2] + 34], 48, { uy: 1 }),
  K_(Math.max(GUNP[1], SWW[1] + 2.4) + .4, [SWC[0] + 34, SWC[1] + 82, SWC[2] - 10], [0, 6, SWC[2] + 300], 50, { uy: 1 }),
], FRP);
/* the barrel opens in stages: from beside the breech, looking up the barrel as each wave runs away into depth */
const SH_FLAPS = KP([
  K_(FLW[0][0] + .4, [52, 34, -44], [0, 2, 150], 50, { uy: 1 }),
  K_(FLW[1][0] + .6, [56, 28, -30], [0, 2, 170], 48, { uy: 1 }),
  K_(FLW[2][1], [50, 24, -36], [0, 1, 150], 46, { uy: 1 }),
], FRP);
/* the breech: the lock rings release and the block drops, in X-ray; at rest at the splice */
const SH_BREECH = KP([
  K_(UNLK[0] - .8, [40, 16, -44], [0, -2, -16], 46, { uy: 1 }),
  K_(AT_FAB, [30, 10, -34], [0, -3, -15], 46, { uy: 1, stop: true }),
], FRP);
/* the chamber: the block closes, the lock rings turn, the clamps bite, the coils energise (X-ray) */
const SH_CHAMBER = KP([
  K_(AT_FAB, [30, 10, -34], [0, -3, -15], 46, { uy: 1 }),
  K_(LOCKW[0], [24, 9, -30], [0, -1, -10], 46, { uy: 1 }),
  K_(COILW[1], [20, 8, -20], [0, 0, -6], 46, { uy: 1 }),
], FRP);
/* the charge: out of the chamber, up over the barrel as the rings light breech to muzzle, down to the fire spot on
   the far side just ahead of the housing (the side the fall's camera rides on) */
const FSX = -40;
const SH_CHARGE = KP([
  K_(COILW[1] + .3, [30, 14, -34], [0, 0, 40], 48, { uy: 1 }),
  K_(CH0 + 1.4, [8, 44, Z_CH - 4], [0, 0, 260], 50, { uy: 1 }),
  K_(TF - .6, [FSX, 18, Z_CH + 16], [0, 0, Z_CH + 70], 50, { uy: 1, stop: true }),
], FRP);
/* the fire, x1/20: the round comes out of the housing past the lens, then the camera rides behind and beside it as
   each ring discharges into it, sees the muzzle burst ahead as it leaves (x1/20), and rides on with the rod as it
   speeds up (the rod's frame: its axis and the aimed platform's X, Y), settling in behind it for the FX hand-in */
const SIDE = V.norm(V.cross(DIRP, EY)), UPD = V.norm(V.cross(SIDE, DIRP));
const T_GO = TX + .2, T_EX = TX + 2.6, T_ON = TX + 4.8;
const RIDE_O = [[TF, [FSX, 18, 16], [0, 0, 70]], [TF + 2.2, [FSX + 6, 14, -16], [0, -1, 12]], [TX, [FSX + 14, 11, -20], [0, -1, 10]],
  [TX + 1.7, [-13, 6, -14], [0, 0, 10]], [T_ON - 1.6, [-11, 6, -18], [0, 0, 24]]];
const rodLocal = T => Z_CH + BLEN * E.sat((T - TF) / TR_D) ** 2;
function SH_FIRE(T) {
  let i = 0; while (i < RIDE_O.length - 2 && RIDE_O[i + 1][0] <= T) i++;
  const [t0, e0, g0] = RIDE_O[i], [t1, e1, g1] = RIDE_O[i + 1], u = kk(T, t0, t1);
  const oe = V.lerp(e0, e1, u), og = V.lerp(g0, g1, u);
  let eye, tg, up;
  if (T <= TX) { const Wt = platAt(T), zr = rodLocal(T); eye = X.ap(Wt, [oe[0], oe[1], zr + oe[2]]); tg = X.ap(Wt, [og[0], og[1], zr + og[2]]); up = X.dir(Wt, YW); }
  else { const p = rodAt(T), ax = X.dir(W1, [1, 0, 0]), ay = X.dir(W1, YW), at = o => V.add(p, V.add(V.mul(ax, o[0]), V.add(V.mul(ay, o[1]), V.mul(DIRP, o[2])))); eye = at(oe); tg = at(og); up = ay; }
  return lookAt(eye, tg, 50, up);
}
/* fallbacks for the fall and the strike (the FX module films them: FX.cam) */
const UPH = V.norm(V.sub(HIT, CE));
function camGround(T) { const a = Math.max(0, aOf(T)); return lookAt(GCAM, V.add(HIT, V.mul(UPH, 80 + FX.capH(a) * .5)), 36); }
/* the climb back from the strike's last shot over the crater (REST: the FX camera at T_RET, read once after load):
   straight up the trail (log-distance: the crater and the coast shrink below the lens, the Earth always in frame),
   still looking down at the crater; it rises past the muzzle, 300 m off the bore, and the look settles onto the
   barrel below as it arrives over it, looking down it at the Earth */
const E_ARR_L = [120, 250, 560], C_ARR_L = [0, 0, 640], E_ARR = PW1(E_ARR_L), C_ARR = PW1(C_ARR_L);
let REST = null;
const rest = () => REST || toCam(camGround(T_RET - .001));
function SH_CLIMB(T) {
  const s0 = fromCam(rest()), x = kk(T, T_RET - .1, T_ARR), L1 = V.dist(s0.eye, E_ARR), DE = 260;
  const d = Math.pow(L1, 1 - x) * Math.pow(DE, x) - DE * x, eye = V.mad(E_ARR, V.norm(V.sub(s0.eye, E_ARR)), d);
  let s = mixShot(s0, lookAt(s0.eye, HIT, 44), ss(0, .22, x));
  s = mixShot(s, lookAt(E_ARR, C_ARR, 46), ss(.6, 1, x));
  return { eye, f: s.f, up: s.up, fov: s.fov, d: K.logMix(Math.min(V.dist(eye, HIT), 5000), s.d, ss(.82, 1, x)) };
}
/* the return: over the barrel as the flaps close, looking up it as the ring comes back taking it apart toward the lens
   (the swarm flowing back into it); alongside as it passes; on to the prow as it docks */
const tCRb = z => { let lo = UNB[0], hi = CRK[0]; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (crZ(m) > z) lo = m; else hi = m; } return (lo + hi) / 2; };
const U1 = [Math.max(UNB[0] + 4, tCRb(820)), tCRb(160)], U2 = [U1[1] + 4, CRK[1]];
const SH_RET = KP([
  K_(T_ARR, E_ARR_L, C_ARR_L, 46),
  K_(UNB[0] + 1.5, [150, 210, 520], [0, 0, 980], 46),
  K_(U1[0] + 2, [160, 160, 600], [0, 0, 900], 46),
], FRP);
const SH_UNB = T => ride(T, [150 - 10 * kk(T, U1[0], U1[1]), 62, -40], [0, 0, 60], 48, 0);
const SH_DOCK = KP([
  K_(U2[0] - .4, [240, 96, 220], [0, 0, 20], 46),
  K_(CRK[1], [210, 80, 150], [0, 4, CRDK[2] - 10], 46),
], FRP);
/* the stow: riding with the ship as the rings turn it back to its park and spin down, the fins closing, the lights
   dying stern to prow; up and over into the opening */
const SH_STOW = KP([
  K_(CRK[1], [210, 80, 150], [0, 4, CRDK[2] - 10], 46),
  K_(MOVE_B[0] + 3, [380, 300, -60], [0, 0, -260], 46),
  K_(SPIN_B[0], [80, 520, -180], [0, 0, -330], 44),
  K_(FIN_B[1], [-540, 400, -20], [0, -30, -340], 42),
  K_(DUR, [-760, 420, 120], [0, -40, -330], 40),
], FRP);

/* ---- the cut list: [start of the hand-over, its length (s), shot, anchor (T -> world point) or null] ---- */
const ANC = p => T => X.ap(platAt(T), p);
const CRA = T => X.ap(platAt(T), [0, 0, crZ(T)]);
const CUTS = [
  [0, 0, SH_OPEN, null],
  [XRJ[3] - 1.2, 4.2, SH_RINGS, ANC([0, 0, -500])],
  [ENGX[0] - 2.8, 4.6, SH_ENG, ANC([NZ[0], NZ[1], NZ[2]])],
  [MOVE[1] - .2, 3.4, SH_DETACH, ANC(CRDK)],
  [B1[0] - 1.4, 5.4, SH_AHEAD, CRA],
  [B1[1], 10, SH_ALONG, CRA],
  [B2[1], 9, SH_WIDE, ANC([0, 0, -200])],
  [CAL[0] - 7.5, 7.8, SH_CAL, ANC(P.LZ.emit)],
  [SWW[0] - 2.2, 3.0, SH_SW, ANC(SWC)],
  [FLW[0][0] - .6, 2.6, SH_FLAPS, ANC([0, 0, -40])],
  [UNLK[0] - 1.6, 2.2, SH_BREECH, null],
  [AT_FAB, 0, SH_CHAMBER, null],
  [COILW[1] + .1, 2.4, SH_CHARGE, null],
  [TF - .6, 0, SH_FIRE, null],
  [T_RET - .1, 0, SH_CLIMB, null],
  [T_ARR, 0, SH_RET, null],
  [U1[0], 4.0, SH_UNB, CRA],
  [U1[1], 4.0, SH_DOCK, ANC(CRDK)],
  [CRK[1], 0, SH_STOW, null],
].map(([t, b, shot, P_]) => ({ t, b, shot, P: P_ })).filter((c, i, A) => i === 0 || c.t > A[i - 1].t - 1e-6 || (LOG.push(`camera: cut at ${c.t.toFixed(2)} out of order`), false));
for (let i = 1; i < CUTS.length; i++) if (CUTS[i].t < CUTS[i - 1].t + CUTS[i - 1].b - 1e-6) LOG.push(`camera: cut ${i} at ${CUTS[i].t.toFixed(2)} overlaps the blend before it`);
function shotBase(T) {
  let i = 0; while (i < CUTS.length - 1 && CUTS[i + 1].t <= T) i++;
  const c = CUTS[i];
  if (i > 0 && c.b > 0 && T < c.t + c.b) { const w = sm5((T - c.t) / c.b); return mixShot(CUTS[i - 1].shot(T), c.shot(T), w, c.P ? c.P(T) : null); }
  return c.shot(T);
}
/* the fall and the strike are filmed by the FX module (FX.cam(T, FC) -> a shot, or null for the base camera); it
   starts at FXIN[0] and the hand-in to it (FXIN, 2.7 s) is blended here, about the rod. Dev: ?cam=x,y,z,tx,ty,tz,fov
   (platform frame) or window.ORCAM_OVR = { e, g, fov, uy, w } (a live override; platform frame unless w) */
const DBGCAM = (() => { const q = STAGE.Q.get('cam'); return q ? q.split(',').map(Number) : null; })();
let FC = null;
const FXIN = [T_ON - 1.6, T_ON + 1.1];
function camBase(T) { return toCam(shotBase(T)); }
function camAt(T) {
  if (DBGCAM) { const Wt = platAt(T); return { eye: X.ap(Wt, DBGCAM.slice(0, 3)), target: X.ap(Wt, DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 40) * DEG }; }
  if (window.ORCAM_OVR) { const o = window.ORCAM_OVR, Wt = o.w ? null : platAt(T); return toCam(lookAt(Wt ? X.ap(Wt, o.e) : o.e, Wt ? X.ap(Wt, o.g) : o.g, o.fov || 46, o.uy && Wt ? X.dir(Wt, YW) : null)); }
  if (FX.cam && FC) {
    const c = FX.cam(T, FC);                       // (called every frame: it also sets the strike's state)
    if (c && T > FXIN[0]) { if (T >= FXIN[1]) return c; return toCam(mixShot(shotBase(T), fromCam(c), sm5((T - FXIN[0]) / (FXIN[1] - FXIN[0])), rodAt(T))); }
  }
  return camBase(T);
}

/* ---------- tags ---------- */
/* each part tag decodes over 0.7 s, holds fully legible (>= 2.4 s) and fades over 0.4 s; acronyms are spelled out;
   the windows follow the shots that show the parts. fr(PP) the part's frame (null: the platform's), at its point */
const TAG_MIN = 3.6;
const nearA = (n, a0, step) => ((Math.round((a0 - (step || 0)) / (TAU / n)) % n) + n) % n;
const FIN_TAG = nearA(P.NFIN, P.CUT_A + .5), DRUM_TAG = P.DRUMS.length ? P.DRUMS.reduce((b, t, k) => Math.abs(Math.atan2(Math.sin(t - P.CUT_A), Math.cos(t - P.CUT_A))) < Math.abs(Math.atan2(Math.sin(P.DRUMS[b] - P.CUT_A), Math.cos(P.DRUMS[b] - P.CUT_A))) ? k : b, 0) : 0;
const ALN_TAG = P.ALN.reduce((b, t, k) => Math.cos(t - 2.4) > Math.cos(P.ALN[b] - 2.4) ? k : b, 0);
const CUTM = (r, dz) => [Math.cos(P.CUT_A) * r, Math.sin(P.CUT_A) * r, PO.cut[2] + (dz || 0)];
const RSF = ri => Q => Q.rings[ri].C, RSP = th => [Math.cos(th) * P.RING_R, Math.sin(th) * P.RING_R, 0];
const W_ = (t0, n) => [t0, t0 + (n || TAG_MIN)];
const PTAGS = [
  ['01', 'THERMOELECTRIC CORE', `Ø ${Math.round(2 * P.CORE_R)} M`, null, CUTM(P.CORE_R * .55, 18), ...W_(XRJ[1] - .3)],
  ['02', 'CONTROL DRUMS', 'TURNING', null, CUTM(P.DRUM_RC, -12), ...W_(DRUMW[0] + .6)],
  ['03', `SEEBECK COUPLES ×${P.NCP * P.CP_ROWS}`, 'IN SERIES', null, CUTM((P.HS_R + P.CS_R) / 2, -14), ...W_(CURW[0] + .4, 4.2)],
  ['04', 'HOT SHOE → COLD SHOE', 'ΔT 760 K', null, CUTM((P.HS_R + P.CS_R) / 2, 22), ...W_(CURW[0] + 2.6)],
  ['05', `RADIATOR FINS ×${P.NFIN}`, `${P.NFP} PANELS · ${Math.round(P.NFP * P.FPW)} M`, Q => Q.fins[FIN_TAG * P.NFP + P.NFP - 1], [P.FPW * .5, 0, 32], ...W_(FINW[0] + .8, Math.max(TAG_MIN, FINW[1] - FINW[0] + .6))],
  ['06', 'COOLANT PUMPS', 'CYCLING', null, PO.pumps, ...W_(XRJ[2] - 3.4, 3.2)],
  ['07', `STABILISER RINGS ×2 · Ø ${Math.round(2 * P.RING_R)} M`, 'COUNTER-ROTATING', RSF(0), RSP(2.6), ...W_(RSPW[0] + .6)],
  ['08', `MOMENTUM WHEELS ×${2 * P.NRN}`, '2 RPM', RSF(1), RSP(2.3), ...W_(ARC0 + .4)],
  ['09', 'MAIN ENGINE ×4', 'GIMBAL ±12°', Q => Q.bells[1], [0, 0, -14], ...W_(ENGX[0] - .2)],
  ['10', 'SCISSOR TILT', 'THE RINGS TURN THE SHIP', RSF(0), RSP(2.7), ...W_(SLEW[0] + 3.2, 4.4)],
  ['11', `CONSTRUCTION RING · Ø ${Math.round(2 * P.CR_R)} M`, '30 RPM', Q => Q.cr.F, [-P.CR_R * .72, P.CR_R * .72, 0], ...W_(CRU[0] - .2, 4.6)],
  ['12', 'ALIGNMENT LASERS ×6', 'LOCKING', null, null, ...W_(CRL[0], Math.max(TAG_MIN, CRL[1] - CRL[0] + .8))],
  ['13', 'NANOBOT SWARMS ×24', 'BUILDING THE BARREL', null, null, ...W_(BUILD[0] + 2.4, 4.4)],
  ['14', `COLLAR 1 · LOCK JAWS ×12`, 'LOCKED', Q => Q.colS[1], [3.4, 14.4, 0], ...W_(LOCKC(1) - .3)],
  ['15', `COLLAR 2 · BORE SLEEVE`, 'SCREWED IN', Q => Q.colS[2], [3.4, 14.4, 0], ...W_(LOCKC(2) - .3)],
  ['16', `MUZZLE STAGES ×${P.NTEL}`, '+100 M', Q => Q.tel[1], [0, 9, 18], ...W_(TELW[0] + .4)],
  ['17', 'CROWN · IRIS', '6 PETALS', Q => Q.crown, [0, 5.6, 4.6], ...W_(CROWN_DONE - .2)],
  ['18', 'LASER EMITTER · TOWER', 'ALIGNMENT LINE', null, P.LZ.emit, ...W_(CAL[0] - 2.4, 3.8)],
  ['19', 'MIRROR · PROW', '', null, P.LZ.prow, ...W_(LOCK_T[2] - .6)],
  ['20', `COLLAR SENSORS ×${NSEG - 1}`, 'LOCKING', null, null, SENS_T(1) - .6, SENS_T(1) - .6 + Math.max(TAG_MIN, SENS_T(NSEG - 1) - SENS_T(1) + 1.2)],
  ['21', 'ROTARY SWITCH ×4', 'ENGINES → GUN', Q => Q.switches[0], [0, 0, 0], ...W_(SWW[0] - .8)],
  ['22', 'CAPACITOR BANKS', 'FILLING', null, PO.caps, ...W_(SWW[0] - .2)],
  ['23', 'CREW ×2 · AIRLOCK', '1.8 M', null, PO.crew, ...W_(SWW[0] + .4)],
  ['24', 'SKIN FLAPS ×540', 'OPENING', Q => Q.bay[6], [6, 9, 5], ...W_(FLW[0][0] + .2)],
  ['25', 'PULSE CASSETTES ×540', 'CAPACITOR BANKS', Q => Q.bay[9], [4, 14, 5], ...W_(FLW[1][0] + .4)],
  ['26', 'MAGNET TUBES ×9', 'SUPERCONDUCTING · 4.2 K', Q => Q.bay[12], [4, 6.4, 5], ...W_(FLW[2][0] + .4)],
  ['27', 'BREECH BLOCK', 'DROPPING 5.6 M', Q => Q.block, [0, 2.4, -14.6], UNLK[0] - 1.4, AT_FAB],
  ['28', 'LOCK RINGS ×3', 'TURNING 30°', Q => Q.locks[2], [0, 3.4, 0], BRC[1] - .2, Math.max(CLAMPW[0], BRC[1] - .2 + TAG_MIN)],
  ['29', 'CLAMPS ×12', '', Q => Q.clamps[1], [1.4, 0, 0], ...W_(CLAMPW[0] - .2)],
  ['30', 'CHAMBER COILS', '4.2 K', null, [0, 4.4, -9], COILW[0], Math.min(CH0 - .2, COILW[0] + TAG_MIN)],
  ['31', 'CHARGE RINGS ×198', 'BREECH → MUZZLE', Q => Q.bay[14], [3.7, 2, 2.5], ...W_(CH0 + .2)],
  ['32', 'MUZZLE IRIS · 6 PETALS', 'OPENING', Q => Q.crown, [0, 5.6, 4.6], IRIS[0] - 1.6, TF - .1],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
for (const t of PTAGS) if (t.t1 - t.t0 < 3.1) LOG.push(`tag ${t.id} holds ${(t.t1 - t.t0).toFixed(1)} s`);
const TPX = [0, 0, 0];
function tagPoint(t, T, PP) {
  if (t.id === '20') {
    // the next collar sensor ahead of the laser's head, sliding from one to the next
    let k = 1; while (k < NSEG - 1 && T > SENS_T(k) + .5) k++;
    const u = kk(T, SENS_T(Math.max(1, k - 1)) + .5, SENS_T(k) + .2), a1 = X.ap(PP.colS[k], [0, P.BEAM_Y, 1.1]);
    let n = 0; for (let j = 1; j < NSEG; j++) if (T > SENS_T(j) + .5) n++;
    t.v2 = `${n}/${NSEG - 1} LOCKED`;
    return k > 1 ? V.lerp(X.ap(PP.colS[k - 1], [0, P.BEAM_Y, 1.1]), a1, u) : a1;
  }
  if (t.id === '12') { const e = PP.align.e[ALN_TAG]; return [e[0], e[1], e[2]]; }
  if (t.id === '13') { const z = frontZ(T, 2); return X.ap(PP.W, [0, P.HA + 2, Math.min(z, Z_MZ) - 4]); }
  return t.fr ? X.ap(t.fr(PP), t.at) : X.ap(PP.W, t.at);
}
function partTags(T, PP) {
  for (const t of PTAGS) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    t.v2 = null;
    const p = tagPoint(t, T, PP); if (!K.pj(p[0], p[1], p[2]) || !K.onS(-40)) continue;
    const x = K.PJ[0], y = K.PJ[1], dx = x > 1100 ? 54 : -54, lx = x + dx;
    K.leader(x, y, lx, y - 50, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    const w = K.tagW(t.tg);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .7), T, +t.id), t.v2 || t.val, 'lime sm', dx > 0 ? lx + 4 : lx - 4 - w, y - 62, a);
  }
}
const T_PLAT = K.mkTag(), T_ROD = K.mkTag(), T_SITE = K.mkTag();
/* the battery: one placard (the vehicles counted, no stacked chips) and one bracket round the near group */
const SITE_VAL = (() => {
  const n = k => W.VEHS.filter(v => v.kind === k).length, o = [];
  if (n('tel')) o.push(`LAUNCHERS ×${n('tel')}`); if (n('radar')) o.push(`RADARS ×${n('radar')}`); if (n('pantsir')) o.push(`AIR DEFENCE ×${n('pantsir')}`);
  return o.join(' · ');
})();
/* the ship's screen box from its extremities in this pose (prow or muzzle, reactor, rings, engines) */
const XP = [];
for (let i = 0; i < 40; i++) XP.push([0, 0, 0]);
function platBox(PP, pad) {
  let n = 0;
  const put = (Tw, p) => P.apTo(XP[n++], Tw, p);
  put(PP.W, [0, 0, P.REA_Z0 - 10]); put(PP.W, [0, 0, Math.max(P.Z_PROW, Math.min(Z_MZ, ST.front[2]))]);
  for (let ri = 0; ri < 2; ri++) for (let k = 0; k < 4; k++) { const a = k * PI / 2; put(PP.rings[ri].C, [Math.cos(a) * P.RING_R, Math.sin(a) * P.RING_R, 0]); }
  for (let e = 0; e < 4; e++) put(PP.exts[e], [0, 0, -P.BELL_L - 12]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { const p = XP[i]; if (!K.pj(p[0], p[1], p[2])) return null; x0 = Math.min(x0, K.PJ[0]); y0 = Math.min(y0, K.PJ[1]); x1 = Math.max(x1, K.PJ[0]); y1 = Math.max(y1, K.PJ[1]); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
const SB = [0, 0, 0, 0];
function markTags(T, Wt, PP) {
  const inMove = T > MOVE[0] + 1.6 && T < MOVE[1] - .4;
  if (PP && (T < 3.4 || inMove || T > DUR - 3.4)) {
    const a0 = T < 3.4 ? 1 - ss(3.0, 3.4, T) : T > DUR - 3.4 ? ss(DUR - 3.4, DUR - 2.6, T) : ss(MOVE[0] + 1.6, MOVE[0] + 2.2, T) * (1 - ss(MOVE[1] - 1.0, MOVE[1] - .4, T));
    const lab = inMove ? 'TO STATION' : 'RAILGUN PLATFORM', val = inMove ? `${(V.dist(Wt.T, SAT) / 1000).toFixed(2)} KM` : `${Math.round(ALT / 1000)} KM UP`;
    const b = platBox(PP, 8), px = b ? Math.max(b[2] - b[0], b[3] - b[1]) : 1e9;
    const wb = b && b[1] > 70 ? 1 - ss(1300, 1600, px) : 0;
    if (a0 * wb > .01) { K.bracket(b, '#C6F432', .8 * a0 * wb, 14, 1.2); K.setTag(T_PLAT, '', lab, val, 'lime sm', Math.max(b[0], b[2] - K.tagW(T_PLAT)), b[1] - 26, a0 * wb); }
  }
  if (T > T_ON - .6 && T < TI - .3) {
    const p = rodAt(T);
    if (K.pj(p[0], p[1], p[2]) && K.onS(-40)) { const a = ss(T_ON - .6, T_ON - .1, T) * (1 - ss(TI - .9, TI - .3, T)); K.leader(K.PJ[0], K.PJ[1], K.PJ[0] + 40, K.PJ[1] - 44, '#C6F432', .8 * a); K.setTag(T_ROD, 'ROD', `ALT ${(altOf(p) / 1000).toFixed(1)} KM`, `${(vAt(sOf(T)) / 1000).toFixed(2)} KM/S`, 'lime sm', K.PJ[0] + 44, K.PJ[1] - 58, a); }
  }
  if (T > TX + 11.5 && T < TI + .1) {
    const a = ss(TX + 11.7, TX + 12.3, T) * (1 - ss(TI - .15, TI + .05, T));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    W.VEHS.forEach(v => { if (v.d > 80) return; const b = K.boxOf([-3, 0, -6], [3, 4, 6], v.W, 2); if (!b) return; n++; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); });
    if (n && x1 - x0 < 900 && x1 - x0 > 6) { SB[0] = x0 - 10; SB[1] = y0 - 10; SB[2] = x1 + 10; SB[3] = y1 + 10; K.bracket(SB, '#FF6A3D', .8 * a, 12, 1.2); K.setTag(T_SITE, 'SITE', 'COASTAL BATTERY', SITE_VAL, 'coral sm', Math.max(24, SB[0]), SB[1] - 26, a); }
    else if (K.pj(HIT[0], HIT[1] + 30, HIT[2]) && K.onS(-40)) { const x = K.PJ[0], y = K.PJ[1]; K.leader(x, y, x - 60, y - 60, '#FF6A3D', .8 * a); K.setTag(T_SITE, 'SITE', 'COASTAL BATTERY', SITE_VAL, 'coral sm', x - 64 - K.tagW(T_SITE), y - 72, a); }
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
/* the reactor's numbers, consistent with each other: hot shoe 480 -> 1250 K, cold shoe 300 -> 490 K (ΔT 760 K);
   ~10 % of the heat through the couples comes out as current, the rest goes to the fins */
const QTH = 140, ETA = .1;
const builtM = T => { const f = frontZ(T, 4); return f > 1e8 ? Z_MZ : Math.max(0, Math.min(Z_MZ, f)); };
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
  const h = heatOf(T), hh_ = E.sat((h - .22) / .78), cur = ss(CURW[0], CURW[0] + 2, T);
  if (T < T_WAKE) { l1 = `Orbit · <b>${km(ALT)} km</b> · <b>7.68 km/s</b>`; l2 = 'Platform <b>dormant</b> · stowed'; }
  else if (T < XRJ[0]) { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = `Status lights · <b>${Math.min(P.LTS.length, Math.max(0, Math.floor((T - T_WAKE - .3) / 2 * P.LTS.length)))}/${P.LTS.length}</b>`; }
  else if (T < HEATW[0]) { l1 = 'Reactor · <b>cutaway</b>'; l2 = T < DRUMW[0] ? 'Control drums · <b>shut</b>' : `Control drums · <b>${pct(kb(T, DRUMW))}</b> turned`; }
  else if (T < FINW[0]) { l1 = `Hot shoe · <b>${Math.round(480 + 770 * hh_)} K</b> · cold shoe <b>${Math.round(300 + 190 * hh_)} K</b>`; l2 = T < CURW[0] ? 'Core <b>heating</b>' : `Couples · <b>${P.NCP * P.CP_ROWS}</b> in series · <b>${(QTH * ETA * cur).toFixed(0)} MW</b>`; }
  else if (T < XRJ[3]) { l1 = `Radiators · <b>${pct(ST.fin)}</b> open · ${P.NFIN} fins`; l2 = `Couples · <b>${(QTH * ETA * cur).toFixed(0)} MW</b> · fins <b>${(QTH * (1 - ETA) * ST.fin).toFixed(0)} MW</b>`; }
  else if (T < ENGX[0] - .3) { l1 = `Stabiliser rings · <b>${(2 * ringFrac(T)).toFixed(2)} rpm</b>`; l2 = T < ARC0 ? 'Counter-rotating · <b>spinning up</b>' : 'Arcs · <b>rings in phase</b>'; }
  else if (T < CRU[0] - .2) { const d = V.dist(PLAT.W.T, SAT), togo = Math.acos(E.clamp(V.dot(X.dir(PLAT.W, [0, 0, 1]), AIM), -1, 1)) / DEG; l1 = T < MOVE[0] ? `Engines · nozzles <b>${pct(ST.engExt)}</b> · gimbal check` : `Station · <b>${(d / 1000).toFixed(2)} km</b> to go`; l2 = `Slew · <b>${togo.toFixed(0)}°</b> to go · rings tilt <b>${(Math.abs(tiltAt(T)) / DEG).toFixed(1)}°</b>`; }
  else if (T < BUILD[0]) { l1 = `Construction ring · <b>${T < CRU[1] ? 'undocking' : T < CRD[0] ? `${(30 * crFrac(T)).toFixed(0)} rpm` : 'moving out'}</b>`; l2 = T < CRL[0] ? `Dock arms · <b>${pct(kb(T, CRU))}</b>` : `Alignment lasers · <b>${Math.min(6, Math.floor(6 * E.sat((T - CRL[0]) / (CRL[1] - CRL[0]))))}/6</b> locked`; }
  else if (T < CAL[0] - .2) { const b = builtM(T); let n = 0; for (let k = 1; k < NSEG; k++) if (T > LOCKC(k)) n++; l1 = `Barrel · <b>${Math.round(b)} m</b> of ${Math.round(Z_MZ)}`; l2 = T < CROWN_DONE ? `Collars · <b>${n}/${NSEG - 1}</b> locked` : `Crown <b>done</b> · ring at <b>${Math.round(crZ(T) - Z_MZ)} m</b> ahead`; }
  else if (T < SWW[0] - .6) { l1 = `Alignment · <b>${alignAt(T).toFixed(4)}°</b>`; l2 = T > ALIGN_T ? 'Bore <b>straight</b> · locked' : 'Laser line · <b>scanning</b>'; }
  else if (T < FLW[0][0] - .2) { l1 = `Switches · <b>${ST.sw < .5 ? 'engines' : 'gun'}</b> · gun bus <b>${pct((gunFront(T) + 134) / (Z_MZ + 134))}</b>`; l2 = `Capacitor banks · <b>${pct(E.sat((T - CAPW[0]) / (CAPW[1] - CAPW[0])))}</b>`; }
  else if (T < UNLK[0] - .2) { const s = T < FLW[1][0] ? 'opening' : T < FLW[2][0] ? 'half open' : 'fully open'; l1 = `Barrel · <b>${s}</b>`; l2 = `Magnets · <b>${pct((magFront(T) - Z_CH) / (Z_MZ - Z_CH))}</b> · 4.2 K`; }
  else if (T < AT_FAB + .01) { l1 = `Breech · <b>${T < BRO[0] ? 'unlocking' : 'opening'}</b>`; l2 = 'Chamber · <b>empty</b>'; }
  else if (T < COILW[1] + .2) { l1 = `Round · <b>chambered</b> · ${(PI * P.ROD_R ** 2 * P.ROD_L * 19.3).toFixed(1)} t`; l2 = T < LOCKW[0] ? 'Breech <b>closing</b>' : T < CLAMPW[0] ? 'Lock rings <b>turning</b>' : T < COILW[0] ? 'Clamps <b>12/12</b>' : `Chamber coils · <b>${pct(ss(COILW[0], COILW[1], T))}</b>`; }
  else if (T < TF) { const n = Math.round(198 * E.sat((T - CH0) / (CH1 - CH0))); l1 = T < CH0 ? 'Charge rings · <b>armed</b>' : `Charge rings · <b>${n}/198</b>`; l2 = T > IRIS[0] ? `Iris · <b>${pct(ST.iris)}</b> · fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>` : `Fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>`; }
  else if (T < TX) { const z = rodZof(T) - Z_CH, u = (T - TF) / TR_D; l1 = `Round · <b>${z.toFixed(0)} m</b> of ${BLEN.toFixed(0)}`; l2 = `<b>${(V_MZ * u / 1000).toFixed(2)} km/s</b> · +<b>${((T - TF) * RATE_TR * 1000).toFixed(0)} ms</b>`; }
  else if (T < T_ON - .6) { l1 = `Muzzle · <b>${(V_MZ / 1000).toFixed(2)} km/s</b>`; l2 = 'Recoil · <b>0.3 m/s</b> · rings take it'; }
  else if (T < TI) { const p = rodAt(T), hh2 = altOf(p); l1 = `Rod · altitude <b>${km(hh2)} km</b>`; l2 = `<b>${(vAt(sOf(T)) / 1000).toFixed(2)} km/s</b> · ${hh2 < 100000 ? 'entry' : 'coast'}`; }
  else if (T < T_RET) { const a = aOf(T); l1 = `Impact · <b>${(vAt(L0) / 1000).toFixed(2)} km/s</b>`; l2 = a < 4 ? `Shock · <b>${Math.round(FX.shockR(a))} m</b>` : `Column · <b>${(FX.capH(a) / 1000).toFixed(2)} km</b>`; }
  else if (T < UNB[0]) { l1 = `Platform · <b>${km(ALT)} km</b>`; l2 = T < T_ARR ? 'Switches · <b>to the engines</b>' : T < Math.max(FLB[1], SW_B[1]) ? 'Barrel <b>closing</b> · power <b>to the engines</b>' : 'Construction ring · <b>reversing</b>'; }
  else if (T < CRK[1]) { l1 = `Barrel · <b>${Math.round(builtM(T))} m</b> left`; l2 = T < CRK[0] ? 'Taking it apart · <b>the swarm flows back</b>' : 'Construction ring · <b>docking</b>'; }
  else if (T < LIGHTS_OFF[1] - .4) { l1 = `Park · <b>${(V.dist(PLAT.W.T, SAT0) / 1000).toFixed(2)} km</b>`; l2 = T < SPIN_B[0] ? 'Rings · <b>turning it back</b>' : T < LIGHTS_OFF[0] ? `Stabiliser rings · <b>${(2 * ringFrac(T)).toFixed(2)} rpm</b>` : 'Dormant · <b>waiting</b>'; }
  else { l1 = `Orbit · <b>${km(ALT)} km</b> · <b>7.68 km/s</b>`; l2 = 'Platform <b>dormant</b> · stowed'; }
  const sc = simClock(T), sg = sc < 0 ? '−' : '+', a = Math.abs(sc);
  const a10 = Math.round(a * 10), l3 = `T${sg}${String(Math.floor(a10 / 600)).padStart(2, '0')}:${((a10 % 600) / 10).toFixed(1).padStart(4, '0')} · ${fmtRate(rateOf(T))}`;
  const html = `${l1}<br>${l2}<br>${l3}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const PROF = STAGE.Q.has('prof') ? {} : null; let PT = 0;
function prof(n) { const t = performance.now(); if (n) PROF[n] = (PROF[n] || 0) + t - PT; PT = t; }
let NDOT = 0;
const DO = { L: L_SUN, fx, occ: true, keep: 1, a: 1, lc: [255, 255, 255] };
const mkO = () => Object.assign({}, DO);
const DOJ = mkO(), DOC = mkO(), DOH = mkO(), DOHL = mkO(), DOX = mkO(), DOHF = mkO(), DOHM = mkO(), DOG = mkO(), DOR = mkO(), DOCR = mkO(), DOFin = mkO(), DOCold = mkO(), DOCore = mkO(), DOF = mkO();
const DOS = mkO();
const LOOK = { o: DO, jk: DOJ, cp: null, hsg: DOH, hall: DOHL, x: DOX, hullF: DOHF, hull: DOHM, hullG: DOG, ring: DOR, cr: DOCR, fin: DOFin, cold: DOCold, core: DOCore, fuel: null, sec: null, bar: null, skinOcc: false, wave: null };
const xr = (T, w) => ss(w[0], w[1], T) * (1 - ss(w[2], w[3], T));
const SKIN = new Array(NSEG + 1).fill(false);
const PXF0 = +STAGE.Q.get('pxf') || 3.8, PXL0 = +STAGE.Q.get('pxl') || 1.6;          // the lattice's dot spacing (px)
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
  ORL.frame({ zref: Math.max(60, zr_), PXF: PXF0 + .8 * wide, PXL: PXL0 + .6 * wide });
  W.LG.zref = Math.max(500, V.dist(C.eye, C.target));
  if (PROF) prof('setup');
  const PP = dPlat < 60000 ? P.pose(Wt, st) : null;
  if (iq) CTX.PP = PP;
  const hideBase = !!(iq && iq.mod.hideBase);
  if (PROF) prof('pose');
  // X-rays: the reactor's cutaway, the housing (chamber), the bay's walls and the prow's plating (the insert)
  const cut = CUT.open, xh = Math.max(xr(T, [UNLK[0] - .4, UNLK[0] + .4, COILW[1] + .6, COILW[1] + 1.6]), iq ? 1 : 0), xb = Math.max(xr(T, [BRO[0], AT_FAB, BRC[0], BRC[1]]), iq ? 1 : 0);
  const shutT = T < FLW[0][0] || T > FLB[1] + .2;
  for (let s = 0; s < NSEG; s++) SKIN[s] = shutT && st.front[4] >= (s + 1) * LSEG + 30;
  SKIN[NSEG] = shutT && st.front[4] > 1e8;
  if (ORL.G.clip) ORL.G.clip.on = false;
  if (PP && dPlat < 9000 && !hideBase) { P.occlude(PP, st, { skin: SKIN, hsg: xh < .5, hullF: xb < .3, cutK: cut > .01 ? CUT.hk : undefined }); ORL.G.occ = true; } else ORL.G.occ = false;
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
    P.apTo(RCW, Wt, [0, 0, REA_M]);
    DO.lc = chg(T) > .3 ? LIME : [255, 255, 255];
    DOJ.keep = 1; DOJ.a = 1; DOJ.clipM = cut > .01 ? CUT.shell : null;
    DOFin.clipM = DOJ.clipM;
    DOCold.clipM = cut > .01 ? CUT.cold : null; DOCold.a = 1;
    DOCore.clipM = cut > .01 ? CUT.core : null;
    DOC.a = cut; DOC.lime = 0;
    DOF.a = E.sat(cut * 1.6);
    DOH.keep = 1 - .86 * xh; DOH.a = 1 - .66 * xh;
    DOHL.keep = 1 - .8 * xb; DOHL.a = 1 - .55 * xb;
    DOHF.keep = 1 - .92 * xb; DOHF.a = 1 - .9 * xb;
    DOX.a = 1 + .3 * xh; DOX.lime = .25 * xh;
    LOOK.cp = cut > .02 ? DOC : null; LOOK.fuel = cut > .02 ? DOF : null; LOOK.sec = cut > .02 ? DOS : null; DOS.a = E.sat(cut * 1.4); DOS.pxf = .55; DOFin.a = 1 - .55 * cut; DOFin.keep = 1 - .55 * cut;
    LOOK.wave = ST.wave > 0 ? waveFn : null; LOOK.skinOcc = ORL.G.occ;
    P.draw(PP, st, LOOK);
    if (PROF) prof('platform');
    PPS = PP.switches; drawPower(T, Wt); drawCutaway(T, Wt); drawRingFX(T, Wt, PP); drawSwarm(T, PP); drawCRFX(T, PP); drawEngines(T, Wt, PP); drawLasers(T, PP); drawFields(T, Wt); drawDischarge(T, Wt); drawFlapFronts(T, Wt);
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
const zap = () => SFX.noise(.12, 3200, .5, .03, .01);
const cues = [
  [T_WAKE, () => SFX.tone(220, 880, 1.2, 'sine', .012)], ...[0, 1, 2, 3, 4].map(k => [T_WAKE + .3 + k * .5, tick]),
  [XRJ[0], () => SFX.tone(2400, 900, .9, 'sine', .01)], [DRUMW[0], () => whir(DRUMW[1] - DRUMW[0])],
  [HEATW[0], () => SFX.tone(60, 120, 2.6, 'sawtooth', .01)], [CURW[0], () => SFX.tone(400, 1600, 1.4, 'sine', .012)],
  [FINW[0], () => whir(FINW[1] - FINW[0])], [FINW[1], clunk],
  [RSPW[0], () => SFX.tone(40, 190, RSPW[1] - RSPW[0], 'sawtooth', .012)], ...[0, 1, 2, 3, 4, 5].map(k => [ARC0 + k * .9, zap]),
  [ENGX[0], () => whir(1.2)], [BURN[0], () => SFX.noise(4, 180, 1, .03, 1)], [RETRO[0], () => SFX.noise(3, 400, .8, .02, 1)],
  [CRU[0] + .2, () => { clunk(); tick(); }], [CRS[0], () => SFX.tone(80, 640, CRS[1] - CRS[0], 'sawtooth', .01)], ...[0, 1, 2, 3, 4, 5].map(k => [CRL[0] + .25 * k + .45, () => SFX.tone(1800 + 90 * k, 1800 + 90 * k, .06, 'sine', .012)]),
  [BUILD[0], () => SFX.tone(70, 110, 6, 'sawtooth', .01)], [BUILD[0] + .4, () => SFX.noise(5, 2600, .4, .02, 2)],
  ...[1, 2, 3, 4, 5].map(k => [LOCKC(k) + .5, () => { clunk(); tick(); }]), [CROWN_DONE, () => SFX.tone(880, 1760, .5, 'sine', .014)],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => [[LOCK_T[0], LOCK_T[1], LOCK_T[2], LOCK_T[3], SENS_T(1), SENS_T(2), SENS_T(3), SENS_T(4), CROWN_T][k] + .45, () => SFX.tone(1800 + 120 * k, 1800 + 120 * k, .06, 'sine', .012)]),
  [ALIGN_T, () => SFX.tone(880, 1760, .4, 'sine', .014)],
  [SWW[1], () => { clunk(); SFX.tone(200, 900, .8, 'sine', .014); }], [CAPW[0], () => SFX.tone(150, 1300, CAPW[1] - CAPW[0], 'sine', .008)],
  ...FLW.map(w => [w[0], () => SFX.noise(1.6, 900, .6, .015, .4)]), [MAGW[0], () => SFX.tone(70, 300, MAGW[1] - MAGW[0], 'sine', .01)],
  [UNLK[1], clunk], [BRO[1], clunk], [BRC[1], clunk], [LOCKW[1], () => { clunk(); tick(); }], [CLAMPW[1], () => { tick(); tick(); }], [COILW[0], () => SFX.tone(90, 500, 1.4, 'sawtooth', .01)],
  [IRIS[0], () => whir(1.2)], [IRIS[1], clunk], [CH0, () => SFX.tone(110, 1800, CH1 - CH0 + .8, 'sawtooth', .014)],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [CH0 + k * (CH1 - CH0) / 10, () => SFX.tone(900 + 80 * k, 900 + 80 * k, .05, 'square', .01)]),
  [TF, () => { SFX.tone(1400, 300, TR_D, 'sawtooth', .02); }],
  [TX, () => { SFX.crack(); SFX.rumble(3.5, .3); SFX.tone(900, 50, 1.8, 'sine', .07); }],
  [TX + .4, () => SFX.noise(3.2, 400, .8, .02, 1.2)], [TX + 2.6, () => SFX.noise(9, 1400, .5, .02, 4)],
  [TX + 8.3, () => SFX.noise(7, 700, .7, .03, 3)],
  [TI, () => { SFX.crack(); SFX.rumble(7, .4); SFX.tone(70, 30, 4, 'sine', .08); }], [TI + 1.2, () => SFX.rumble(6, .25)],
  [T_RET, () => SFX.tone(300, 900, 3, 'sine', .01)], [FLB[1], clunk], [UNB[0], () => SFX.noise(5, 2200, .4, .02, 2)],
  ...[5, 4, 3, 2, 1].map(k => [ULOCK_TS[k] - 2.2, clunk]), [CRK[1] - .5, () => { clunk(); tick(); }], [BURN_B[0], () => SFX.noise(3, 180, 1, .02, 1)],
  [SPIN_B[0], () => SFX.tone(190, 40, SPIN_B[1] - SPIN_B[0], 'sawtooth', .01)], [FIN_B[1], clunk], [LIGHTS_OFF[0], () => SFX.tone(660, 220, 1.6, 'sine', .01)],
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
/* the timeline and the moving points for other code (the camera, debugging) */
const TL = { T_WAKE, XRJ, DRUMW, HEATW, CURW, FINW, RSPW, ARC0, ENGX, GCHK, MOVE, BURN, RETRO, SLEW, CRU, CRS, CRL, CRD, BUILD, CAL, SWW, GUNP, CAPW, FLW, MAGW, UNLK, BRO, AT_FAB, BRC, LOCKW, CLAMPW, COILW, CH0, CH1, TF, IRIS, TX, TI, T_RET, T_ARR,
  IRIS_B, CLAMP_B, FLB, SW_B, MAG_B, UNB, CRK, CRSB, MOVE_B, SLEW_B, BURN_B, RETRO_B, SPIN_B, ENGX_B, FIN_B, HEAT_B, LIGHTS_OFF, DUR, CR_DOCK, CR_START, CR_PARK, LOCKC: LOCKC_TS.slice(), ULOCK: ULOCK_TS.slice(), CROWN_DONE };
window.ORTL = { TL, crZ, frontZ, POI: P.POI, mapOut, mapIn: t => Object.assign({}, mapIn(t)) };
STAGE.dbg = () => ({ INS: INS.map(q => ({ at: q.at, r0: q.r0, len: q.len })), DURF, mapOut, mapIn: t => Object.assign({}, mapIn(t)), log: LOG, ndot: NDOT, prof: PROF, stats: P.stats(), by: ORL.G.by, TX, TI, T_RET, T_ARR, TAU_END, L0, cam: T => camAt(T), W, FX, P, HIT, GCAM, PW0, PW1, platXf, C, rodAt, altOf, sOf, tauOf, aOf, FALL, ST, simClock, rateOf, TL, crZ, frontZ, CUT });
})();
