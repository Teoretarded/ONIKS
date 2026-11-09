/* INTERCEPT · orbital stack (window.IORB): a headless copy of pc_orbital_railgun_film.js (read-only source) that keeps
   its world (the dot globe, the limb, the stars, the coast), its platform (ORP: the same model, posed from the film's
   own state machine at a dormant moment, the stabiliser rings spinning), its effects (ORFX: the sheath, the trail)
   and the lattice renderer, and exposes them as IORB.render(TR, o) instead of running a film. It draws into ORK's dot
   buffer; the act (intercept_act.js) composites that over the sea's. Nothing here runs FILM.run or the menu.
   (Everything below the header is the orbital film's code; the edits are marked INTERCEPT.) */
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
/* the raster is K.BW x K.BH (STAGE.RES); S converts stage px (tag offsets, glow sizes, the shake) to raster px.
   SMOOTH (?hq=1 renders, ?smooth=1): the occluders that switch (the X-rays, the barrel's skins, the whole set by the
   camera's distance) fade over 0.15-0.3 s, and the platform fades out with distance instead of vanishing */
const S = K.S, SMOOTH = K.SMOOTH, BW = K.BW, BH = K.BH, R3 = Math.round(3 * S);
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
/* INTERCEPT: no menu (the host page owns it) */

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
     43.2   Split      SPIN_D the stabiliser rings spin down (x8); SPLIT[L] each breaks into arcs: its chords dissolve, its
                       nodes fly forward along the hull (comet trails of swarm) and curl into five construction rings
                       at the forming point Z_F (z -12, round the chamber housing), ring L closing at SC_FORM[L] (a ring
                       of light) as the train ahead makes room. ORTL.nodePos(T, g), ORTL.scZ(T, L), ORTL.scR[L].
     44     Detach     CRU the dock's arms swing back, CRS the CR's rim spins up, CRL the six prow lasers find its
                       receivers (r 52), CRD it moves out to the chamber's face (z 4): it leads the train as the guide.
     52     Build      BUILD (x60): the train flies the bore axis, the CR in front, then the five rings SC_GAP (20 m)
                       apart, each laying its own layer 8 m behind itself from its own swarm (LAG[L]): 0 the liner pipe,
                       1 the nine magnet tubes, 2 the hex frame and collars, 3 the cassettes, 4 the skin flaps; the five
                       fronts stand staggered like a cut cable (each section solid in its colour). A collar locks at
                       each 150 m (LOCKC(k): the bore line reaches its mast, JAWT(k) the six jaws driven by rams bite
                       the flange with a ring of light, SLVT(k) the bore sleeve screws in); HERO_LOCK (collars 1, 3):
                       the train slows to a tenth and the clock to x4 for a 30-60 m look. A crawler rides the new top
                       (ORTL.crawlerZ). The crown last (CROWN_DONE), IRIS_C its petals close one by one; the CR goes on
                       to CR_PARK (Z_MZ + 260, the shot's line through it); PARKM the five rings drop back to stations
                       round the barrel (PARKZ: ring 4 at z 100 .. ring 0 at 900), where their wheels feed the banks.
     127    Calibrate  CAL (x1): the laser line from the tower through the deck and prow mirrors, up the collar masts
                       to the crown and the CR; 0.0137 -> 0.0001 deg.
     136.8  Reroute    SWW (x1, 3 s) the four rotary switches turn, arcing off their blades (P.POI.switches); current
                       drains out of the engine feeds and GUNP floods up the gun bus to the muzzle; CAPW (to 157.6) the
                       momentum wheels (56, 3000 -> 2120 rpm) feed the capacitor banks (P.POI.caps): ORTL.energy(T).
     144    Bay        HB (bay 4, P.POI.heroBay, z 40..50): HBF its six flaps hinge open, HBC its cassettes slide out,
                       HBT they turn up, HBM its magnets frost (x1; a close-up at 15-25 m: P.POI.heroBayEye).
     150.6  Reconfig.  FLW three waves breech to muzzle (x8): flaps cracked (lime), cassettes out (coral front),
                       turned up (white-hot front); MAGW the magnets cool, breech to muzzle.
     158.1  Breech     UNLK, BRO the block drops (X-ray); AT_FAB the fabrication insert splices in.
     160    Chamber    BRC the block rises (2.5 s), LOCKW the lock rings turn their teeth home (2.4 s), CLAMPW the twelve
                       clamps bite, a puff of frost each (2.2 s), COILW the coils frost to 4.2 K (2.8 s); x2.
     172    Charge     CH0..CH1 the charge rings light breech to muzzle off the banks, IRIS the crown's iris opens, TF fire;
                       the rings take the recoil's torque at TX (a damped wobble).
     T_RET  Return     (after the strike) T_ARR: flaps close, power back to the engines; GATHER the five rings come in from
                       their stations to just past the muzzle (the CR back to just ahead of them); UNB (x120) the train
                       runs back to the prow taking the barrel apart, outer layer first (ring 4 leading), the swarm
                       flowing back into each ring, collars unlocking at ULOCK(k) with a flash; UNB_LOOK the stretch to
                       film looking back up the barrel as it shortens; each ring reaching Z_F breaks up (SC_DIS[L]) and
                       its nodes fly aft (REFORM[L]) to re-form the two stabiliser rings (a ring of light each); CRK the
                       CR docks; RSPW_B the rings spin up again; MOVE_B / SLEW_B back to the park (the rings turn it);
                       SPIN_B the rings spin down, their arcs sputtering out; FIN_B the fins fold; LIGHTS_OFF the lights
                       flare and die in sequence, prow to stern.
     (Spins: the stabiliser rings 2 rpm, the construction ring's rim 4 rpm (1.6 g at its rim), the momentum wheels
     3000 rpm (the energy store: 1.2 TJ, charged over ~24 h by the 14 MW reactor before the film).)
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
/* the reroute (x1, 7 s): the switches break the engine bus (arcs off the blades) and make the gun bus; current drains
   out of the engine feeds and floods up the barrel; the momentum wheels start feeding the capacitor banks (CAPW runs on
   through the reconfiguration at x8: ~0.6 TJ in ~110 s of sim time, ~5 GW from the wheels' alternators) */
const SWW = [136.8, 139.8], GUNP = [139.2, 143.4], CAPW = [139.6, 157.6];
/* the reconfiguration: first one bay close up (HB, x1): its six flaps hinge open (HBF), its cassettes slide out (HBC)
   and turn up (HBT), its magnets frost to 4.2 K (HBM); then three waves breech to muzzle (x8), each a different stage:
   flaps cracked (lime), cassettes out (coral), turned up (white-hot) */
const HB = 4, HBF = [144.2, 145.8], HBC = [145.9, 147.4], HBT = [147.5, 148.8], HBM = [148.3, 150.2];
const FLW = [[150.6, 152.6], [153.1, 155.1], [155.6, 158.0]];
const MAGW = [152.2, 158.2];
const UNLK = [158.1, 158.6], BRO = [158.6, 159.5];
const AT_FAB = 159.8;                  // the fabrication insert's splice (base time)
/* the chamber, each step 2-3 s: the block rises (BRC), the lock rings turn their teeth home (LOCKW), the twelve clamps bite
   with a puff of frost (CLAMPW), the coils frost over as they reach 4.2 K (COILW) */
const BRC = [160.0, 162.5], LOCKW = [162.6, 165.0], CLAMPW = [165.2, 167.4], COILW = [167.2, 170.0], CLAMP_DT = .13;
const CH0 = 172.0, CH1 = 176.6, TF = 177.6, IRIS = [CH1 - 1.0, TF - .2];
const V_MZ = 5000, BLEN = Z_MZ - Z_CH, RATE_TR = 1 / 20, TR_D = 2 * BLEN / V_MZ / RATE_TR, TX = TF + TR_D;
const TI = TX + 16.5, T_RET = TI + 28, T_ARR = T_RET + 9;
const IRIS_B = [TX + 1.3, TX + 2.4], CLAMP_B = [TX + 3, TX + 3.8];
const FLB = [T_ARR + .3, T_ARR + 3.7], SW_B = [T_ARR + .5, T_ARR + 1.7], MAG_B = [T_ARR + .3, T_ARR + 2.6];
/* the return: GATHER the five construction rings come in from their stations along the barrel to the muzzle (the CR
   back from its park to just ahead of them); UNB they run the train back to the prow taking the barrel apart, outer
   layer first, each ring dissolving into its nodes at the forming point (Z_F) and the nodes flying aft to re-form the
   two stabiliser rings (REFORM(L)); CRK the CR docks; RSPW_B the re-formed rings spin up and turn the ship back */
const GATHER = [T_ARR + .6, T_ARR + 5.2];
const UNB = [T_ARR + 5.6, T_ARR + 32.0], CRK = [T_ARR + 33.4, T_ARR + 35.8], CRSB = [T_ARR + 35.0, T_ARR + 38.0];
const RSPW_B = [T_ARR + 36.4, T_ARR + 39.0];
const MOVE_B = [T_ARR + 39.0, T_ARR + 47.6], SLEW_B = [T_ARR + 39.4, T_ARR + 47.2], BURN_B = [T_ARR + 39.2, T_ARR + 42.4], RETRO_B = [T_ARR + 43.8, T_ARR + 46.8];
const SPIN_B = [T_ARR + 48.0, T_ARR + 53.0], PARK_RING = [T_ARR + 53.0, T_ARR + 53.8];
const ENGX_B = [T_ARR + 48.2, T_ARR + 49.4], FIN_B = [T_ARR + 51.6, T_ARR + 55.0], HEAT_B = [T_ARR + 52.0, T_ARR + 55.6];
const LIGHTS_OFF = [T_ARR + 55.2, T_ARR + 58.0];
const DUR = T_ARR + 59.2;              // the base take (the inserts lengthen the film: DURF)
/* the split: after the slew the stabiliser rings spin down (SPIN_D); then each breaks into arcs of nodes (its chords
   dissolving into swarm) that fly forward along the hull and curl into five construction rings at the forming point
   ahead of the prow (Z_F, round the chamber housing), one after another as the train ahead makes room (SPLIT(L)) */
const SPIN_D = [43.2, 47.2];
/* the construction ring's path along the bore (z of its plane) and the build layers' fronts */
const CR_DOCK = P.CR_DOCK, CR_START = 4, CR_PARK = Z_MZ + 260;
/* the train: the CR leads (the guide: the bore line, the alignment lasers); behind it the five construction rings, one
   per layer (0 liner pipe, 1 magnet tubes, 2 hex frame + collars, 3 cassettes, 4 skin flaps), SC_GAP apart, each laying
   its layer 8 m behind itself; SC_N nodes each (the stabiliser rings' 56), on 34 m chords (radius SC_R) */
const NSC = 5, SC_N = P.SC_N, SC_R = P.SC_R, Z_F = P.Z_FORM, SC_GAP = 20, SC_LEAD = 16, SC_FLY = 4.4, PARKZ = [900, 700, 500, 300, 100];
const LAG = [0, 1, 2, 3, 4].map(L => SC_LEAD + SC_GAP * L + 8), ULAG = LAG;
/* the build: a slow start, a long even run, easing into the park */
const buildS = u => { const a = .05, b = .12, vm = 1 / (1 - a / 2 - b / 2); if (u <= 0) return 0; if (u >= 1) return 1; if (u < a) return vm * u * u / (2 * a); if (u < 1 - b) return vm * (u - a / 2); const w = 1 - u; return 1 - vm * w * w / (2 * b); };
/* two hero collar locks (HERO_LOCK): the ring slows to a tenth of its pace (and the clock to x4) while the frame's front
   crosses those collars, so the lock can be watched at 30-60 m: z(p) from the progress p through the inverse of
   F(z) = integral of 1 / pace */
const HERO_LOCK = [1, 3], BZ_N = Math.ceil(CR_PARK - CR_START) + 1, BZ_F = new Float64Array(BZ_N);
{ const pace = z => { let g = 1; for (const k of HERO_LOCK) { const zc = k * LSEG + P.COL_L + 2 + LAG[2] + 3; g -= .9 * Math.exp(-(((z - zc) / 11) ** 2)); } return Math.max(.08, g); };
  for (let i = 1; i < BZ_N; i++) BZ_F[i] = BZ_F[i - 1] + 1 / pace(CR_START + i - .5); }
function buildZ(p) {
  const f = p * BZ_F[BZ_N - 1]; let lo = 0, hi = BZ_N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BZ_F[m] < f) lo = m; else hi = m; }
  return Math.min(CR_PARK, CR_START + lo + (f - BZ_F[lo]) / Math.max(1e-9, BZ_F[hi] - BZ_F[lo]));
}
function crZ(T) {
  if (T < CRD[0]) return CR_DOCK;
  if (T < BUILD[0]) return CR_DOCK + (CR_START - CR_DOCK) * kb(T, CRD);
  if (T < GATHER[0]) return buildZ(buildS((T - BUILD[0]) / (BUILD[1] - BUILD[0])));
  if (T < UNB[0]) return CR_PARK + (UZ0 + 4 * SC_GAP + SC_LEAD - CR_PARK) * kb(T, GATHER);
  if (T < CRK[0]) return Math.max(CR_START, uzAt(T) + 4 * SC_GAP + SC_LEAD);
  if (T < CRK[1]) return CR_START + (CR_DOCK - CR_START) * kb(T, CRK);
  return CR_DOCK;
}
/* the unbuild train's lead (ring 4's z): from just past the muzzle to where the last ring reaches the forming point */
const UZ0 = Z_MZ + 8, UZ1 = Z_F - 4 * SC_GAP;
const uzAt = T => UZ0 + (UZ1 - UZ0) * buildS((T - UNB[0]) / (UNB[1] - UNB[0]));
/* a layer's front: below it the layer stands (-1e9 none, 1e9 all) */
function frontZ(T, L) {
  if (T < BUILD[0] - .5 || T >= CRK[0]) return -1e9;
  if (T < UNB[0]) { if (T > BUILD[1] + 1) return 1e9; const f = crZ(T) - LAG[L]; return f > Z_MZ + 1 ? 1e9 : f; }
  const f = uzAt(T) + SC_GAP * (4 - L) - 8;
  return f > Z_MZ + 1 ? 1e9 : f;
}
/* when a layer's front passes z (build: rising), by bisection on the build's run */
function tFront(L, z) { let lo = BUILD[0], hi = UNB[0]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (frontZ(m, L) >= z) hi = m; else lo = m; } return hi; }
function tFrontB(L, z) { let lo = UNB[0], hi = CRK[0]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (frontZ(m, L) <= z) hi = m; else lo = m; } return hi; }
const LOCKC_TS = [0, 1, 2, 3, 4, 5].map(k => k ? tFront(2, k * LSEG + P.COL_L + 2) : 0), ULOCK_TS = [0, 1, 2, 3, 4, 5].map(k => k ? tFrontB(4, k * LSEG + 6) : 0);
const LOCKC = k => LOCKC_TS[k];                       // collar k (1..5) locks: the laser reaches its mast
/* a lock's steps after LOCKC(k): the jaws slam (JAWT), the sleeve screws in (SLVT); the hero locks at about half speed */
const LOCKSC = k => HERO_LOCK.includes(k) ? 2.4 : 1;
const JAWT = k => LOCKC(k) + .5 * LOCKSC(k), SLVT = k => [LOCKC(k) + .9 * LOCKSC(k), LOCKC(k) + 2.4 * LOCKSC(k)];
const CROWN_DONE = tFront(4, Z_MZ + .5);
const IRIS_C = [CROWN_DONE + .3, CROWN_DONE + 2.6];          // the crown's six petals close one by one (lime as each seats)
const UNB_LOOK = [UNB[0] + 1.5, tFrontB(2, Z_MZ * .45)];   // the train from the crown back to mid-barrel
/* the construction rings: formed (build) when the train has made room at Z_F, dissolved (return) when they reach it */
const tCr = z => { let lo = BUILD[0], hi = BUILD[1]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (crZ(m) >= z) hi = m; else lo = m; } return hi; };
const tUz = z => { let lo = UNB[0], hi = UNB[1]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (uzAt(m) <= z) hi = m; else lo = m; } return hi; };
const SC_FORM = [0, 1, 2, 3, 4].map(L => L ? tCr(Z_F + SC_LEAD + SC_GAP * L) : BUILD[0]);          // ring L formed (moves off)
const SPLIT = SC_FORM.map(t => [t - SC_FLY, t]);                                                // its nodes in flight
const SC_DIS = [0, 1, 2, 3, 4].map(L => tUz(Z_F - SC_GAP * (4 - L)));                            // ring L dissolves at Z_F
const REFORM = SC_DIS.map(t => [t, t + SC_FLY]);                                                // its nodes flying aft
const PARKM = [CROWN_DONE + .6, CROWN_DONE + 6.6];          // the rings drop back to their stations along the barrel
const SC_HOLD = [0, 1, 2, 3, 4].map(L => crZ(CROWN_DONE) - SC_LEAD - SC_GAP * L);
/* ring L's z (platform), or null while it is not a ring */
function scZ(T, L) {
  if (T < SPLIT[L][0] || T >= REFORM[L][1]) return null;
  if (T < SC_FORM[L]) return Z_F;
  if (T < CROWN_DONE) return Math.max(Z_F, crZ(T) - SC_LEAD - SC_GAP * L);
  if (T < GATHER[0]) return SC_HOLD[L] + (PARKZ[L] - SC_HOLD[L]) * kb(T, PARKM);
  if (T < UNB[0]) return PARKZ[L] + (UZ0 + SC_GAP * (4 - L) - PARKZ[L]) * kb(T, GATHER);
  if (T < SC_DIS[L]) return Math.max(Z_F, uzAt(T) + SC_GAP * (4 - L));
  return Z_F;
}
/* a node's morph (0 in its stabiliser ring .. 1 in its construction ring): slot s of ring L, staggered round the arc */
const nodeU = (T, L, s) => { const d = .045 * s, f = SC_FLY - .55 - .045 * (SC_N[L] - 1); return T < CROWN_DONE ? kk(T, SPLIT[L][0] + d, SPLIT[L][0] + d + f) : 1 - kk(T, REFORM[L][0] + d, REFORM[L][0] + d + f); };
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
       through), the front wall (z +36) has a 2.3 m port on the bore axis; a 16 m transfer cage runs from it to the open
       breech (block at platform z -27.8..-25.4, dropped 5.6 m while open); a tender is docked on the starboard wall,
     CHAMBER(Tb) -> the chamber's frame (chamber -> world): origin at the seated round's centre on the bore (platform
       z -12.5), axes the platform's; it sits at CHAMBER_IN_BAY = (0, 0, 67.5) in the bay's frame (the chamber: platform z
       -25.4..0). The insert hands the
       finished round over here: nose +Z, centred at the origin. ROUND = { len 21 (the sabot, 3 sections), r 0.96,
       armature 1.6 m long behind it, rodLen 18, rodR 0.15 (24.6 t of tungsten), boreR 1.0, sections 3, massT, chamberLen }. While the insert plays the breech stands open and the
       base scene draws no round; from the splice on, the base scene draws its own round seated at CHAMBER. }
   The fabrication insert is spliced at base time AT_FAB (ORFAB.at is set to it). */
if (window.ORFAB) ORFAB.at = AT_FAB;
/* the fabrication insert at AT_FAB; the visit to the target before the shot (window.ORVISIT, pc_orbital_railgun_target.js) at
   TF + ORVISIT.at (a negative offset: before the round leaves) */
const INS_SPEC = () => STAGE.Q.has('base') ? [] : [{ at: AT_FAB, mod: window.ORFAB }, { at: TF + ((window.ORVISIT && ORVISIT.at) || -12), mod: window.ORVISIT }];      // ?base: the base take alone
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
/* the exit held at x1/100 for 1.5 s (the round leaving the muzzle, the camera centred on it), up to x1, a short coast
   plateau (its rate solved so the fall fits), then the entry and the approach near x1 (~7 s below 40 km) */
const T_SLO = 1.5;
const fwSeg = P_ => [{ t: 0, rate: .01 }, { t: T_SLO, rate: .01 }, { t: 2.3, rate: 1 }, { t: 3.0, rate: 1 }, { t: 4.2, rate: P_ }, { t: 7.0, rate: P_ }, { t: 9.2, rate: 1.4 }, { t: FD, rate: 1.0 }];
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
/* the strike's clock: x1/4 for the flash, then x1/10 from a ~0.3 to ~2.3 s (~20 s) while the front tears through the
   facility (300-1300 m out) and the trees, then x8 for the cloud and the crater (a ~50 s by T_RET) */
const SWARP = FILM.warp([{ t: 0, rate: .25 }, { t: 1.0, rate: .25 }, { t: 1.5, rate: .1 }, { t: 21.2, rate: .1 }, { t: 22.4, rate: 8 }, { t: T_RET - TI + 14, rate: 8 }]);
const aOf = T => T < TI ? -1 : SWARP(T - TI);
const strikeRate = T => T < TI ? 1 : SWARP.rate(T - TI);
const rodZof = T => { if (T < TF) return Z_CH; const u = Math.min(1, (T - TF) / TR_D); return Z_CH + BLEN * u * u; };

/* ---------- clocks: the rate on screen (steps eased over 0.6 s in log space) ---------- */
const RATES = [[0, 1], [HEATW[0], 600], [HEATW[1] - .3, 1], [FINW[0] - .3, 8], [FINW[1] + .2, 1], [RSPW[0], 60], [RSPW[1] - .8, 8], [MOVE[0], 20], [MOVE[1] - .2, 8],
  [CRS[0], 8], [CRL[0], 1], [CRD[0], 8], [BUILD[0] + .3, 60], ...[].concat(...HERO_LOCK.map(k => [[LOCKC(k) - 1.8, 4], [SLVT(k)[1] + .5, 60]])), [BUILD[1] - .4, 8], [CAL[0] - .3, 1], [FLW[0][0] - .2, 8], [UNLK[0] - .2, 2], [COILW[1], 1]];
const RATES_B = [[T_RET, 1], [T_ARR - 2, 8], [UNB[0] + .3, 120], [UNB[1] - .4, 8], [MOVE_B[0], 20], [MOVE_B[1] - .2, 8], [SPIN_B[0], 60], [SPIN_B[1], 8], [LIGHTS_OFF[0] + .6, 1]];
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

/* ---------- spins (integrated over the clock): the stabiliser rings (2 rpm, counter-rotating: 1.5 g at their rims),
   parked on a node at the end; the construction ring's rim (4 rpm: 1.6 g at r 92) ---------- */
const OMEGA_R = TAU * 2 / 60, OMEGA_CR = TAU * 4 / 60;
const ringFrac = T => ss(RSPW[0], RSPW[1], T) * (1 - ss(SPIN_D[0], SPIN_D[1], T)) + ss(RSPW_B[0], RSPW_B[1], T) * (1 - ss(SPIN_B[0], SPIN_B[1], T));
/* the stabiliser rings whole (1) or broken up into the construction rings (0) */
const bigOn = T => T < SPLIT[0][0] - .2 ? 1 : T > REFORM[0][1] + .2 ? 1 : 0;
/* ---------- energy: the momentum wheels are the store ----------
   56 wheels (28 in each ring's nodes, A's one way, B's the other: no net momentum) at 3000 rpm hold 1.2 TJ, put in over
   ~24 h by the reactor's 14 MW. Through CAPW their alternators move 0.6 TJ into the capacitor banks at a steady ~5 GW
   (sim time), the wheels slowing to 2120 rpm (E ~ w^2); through CH0..CH1 the banks charge the 198 rings along the
   barrel; the shot gives the 24.6 t rod (18 m x 0.3 m) 307 GJ (5.0 km/s; ~51 % of the 0.6 TJ), the rest is heat in the
   rails and the coils. Afterwards the reactor tops the wheels up at 14 MW. ORTL.energy(T) -> the numbers for the readout. */
const E_FULL = 1.2e12, E_SHOT = .6e12, P_REA = 14e6, RPM_W = 3000, M_ROD = PI * P.ROD_R ** 2 * P.ROD_L * 19300, KE_ROD = .5 * M_ROD * V_MZ * V_MZ;
const capU = T => { const a = simAt(CAPW[0]), b = simAt(CAPW[1]); return E.sat((simAt(Math.min(T, TF)) - a) / (b - a)); };
const ENR = { reactorMW: 14, thermalMW: 140, storeTJ: 1.2, wheelRpm: 3000, bankTJ: 0, ringsTJ: 0, roundGJ: 0, heatGJ: 0, shotGJ: KE_ROD / 1e9, feedGW: 0, phase: 'stored' };
function energy(T) {
  const o = ENR, cu = capU(T), ch = T < TF ? E.sat((T - CH0) / (CH1 - CH0)) : 1, fired = T >= TX;
  let st = E_FULL - E_SHOT * cu;
  if (fired) st += P_REA * Math.max(0, simClock(T) - simClock(TX));
  o.storeTJ = Math.min(E_FULL, st) / 1e12; o.wheelRpm = RPM_W * Math.sqrt(Math.min(E_FULL, st) / E_FULL);
  o.bankTJ = fired ? 0 : E_SHOT * cu * (1 - ch) / 1e12; o.ringsTJ = fired ? 0 : E_SHOT * cu * ch / 1e12;
  o.roundGJ = T < TF ? 0 : T < TX ? KE_ROD * ((T - TF) / TR_D) ** 2 / 1e9 : KE_ROD / 1e9;
  o.heatGJ = T < TF ? 0 : (E_SHOT - KE_ROD) * E.sat((T - TF) / TR_D) / 1e9;
  o.feedGW = cu > 0 && cu < 1 ? E_SHOT / (simAt(CAPW[1]) - simAt(CAPW[0])) / 1e9 : 0;
  o.reactorMW = 14 * E.sat((heatOf(T) - .22) / .78) * ss(CURW[0], CURW[0] + 1.6, T); o.thermalMW = 140 * E.sat((heatOf(T) - .22) / .78);
  o.finMW = o.thermalMW * .9 * ST.fin;
  o.phase = T < CAPW[0] ? 'stored' : cu < 1 ? 'feeding the banks' : T < CH1 ? 'charging the rings' : !fired ? 'charged' : 'recharging';
  return o;
}
/* the wheels' look: a strobe (the rotor seems to creep, slower as they slow) and the blur of the true spin */
const wheelVis = T => { const r = energy(T).wheelRpm / RPM_W; return r; };
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
  drum: 0, pump: 0, cut: null, crawl: new Float64Array(P.NCRAWL), ring: 1, spin: 0, engExt: 0, gimbal: new Float64Array(8), sw: 0, breech: 1, lock: 1, clamp: 0, iris: 0, sc: { z: new Float64Array(5).fill(NaN), u: new Float64Array(56), fresh: new Float64Array(5) }, irisP: new Float64Array(6), clampK: new Float64Array(12), crawlB: null, roundZ: null, flex: null, flapAt: null, wheel: 1, wheelFeed: 0 };
let FLEXT = 0, FLT = 0;
const flexFn = (z, o) => { const t = FLEXT, k = Math.max(0, z / Z_MZ), A = 2.4 * Math.exp(-t / 2.6) * Math.sin(TAU * .42 * t) * k * k; o[0] = A * .3; o[1] = A; o[2] = 0; };
/* the flaps of bay gb (0 at the breech): three waves breech to muzzle (cracked, half with the cassettes out, full with
   them turned up), each stage in its own colour while it moves (the flaps lime as they crack, the cassettes lime as
   they slide, white-hot as they turn up); closed in one wave muzzle to breech on the return */
ST.heroBay = HB; ST.focusK = 0;
ST.flapAt = (gb, out, f) => {
  const T = FLT;
  if (T < HBF[0] || T > FLB[1] + .1 || (T < FLW[0][0] && gb !== HB)) { out[0] = out[1] = out[2] = out[3] = out[4] = out[5] = 0; return; }
  const d2 = 1, u = gb / (NB - 1), t0b = FLB[0] + (1 - u) * (FLB[1] - FLB[0] - d2), c = 1 - kk(T, t0b, t0b + d2);
  if (gb === HB) {
    // the hero bay, face by face (f 0..5, round from the top): flaps hinge, cassettes slide out, turn up, all in turn
    const g = (f || 0) * .16, st = (w, k) => kk(T, w[0] + g * k, w[1] - (5 - (f || 0)) * .16 * k), mv = w => win(T, w[0] + g, w[1] + .4, .3);
    const s1 = st(HBF, 1), s2 = st(HBC, 1), s3 = st(HBT, 1);
    out[0] = (55 * s1) * DEG * c; out[1] = 3.6 * s2 * c; out[2] = PI / 2 * s3 * c;
    out[3] = (.95 * mv(HBF) + .25 * (T > HBF[1] && T < FLW[0][0] ? 1 : 0)) * c; out[4] = Math.max(.9 * mv(HBC), mv(HBT)) * c; out[5] = kb(T, HBM) * c;
    return;
  }
  const d = .8, st = i => { const w = FLW[i], t0 = w[0] + u * (w[1] - w[0] - d); return kk(T, t0, t0 + d); };
  const mv = i => { const w = FLW[i], t0 = w[0] + u * (w[1] - w[0] - d), a = T - t0; return a < 0 ? 0 : a < d ? 1 : Math.exp(-(a - d) * 1.6); };
  const s1 = st(0), s2 = st(1), s3 = st(2);
  out[0] = (14 * s1 + 41 * s2 + 55 * s3) * DEG * c; out[1] = (2.6 * s2 + 3.6 * s3) * c; out[2] = PI / 2 * s3 * c;
  out[3] = .4 * mv(0) * c; out[4] = Math.max(.8 * mv(1), mv(2)) * c; out[5] = 0;
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
const slam = (T, t0, sc) => { const a = (T - t0) / (sc || 1); if (a <= 0) return 0; if (a < .22) { const u = a / .22; return u * u; } const b = a - .22; return 1 - .08 * Math.exp(-b * 9) * Math.cos(b * 38); };
function stateAt(T) {
  ST.wake = ss(T_WAKE, T_WAKE + 3, T) * (1 - kb(T, LIGHTS_OFF));
  for (let L = 0; L < 5; L++) ST.front[L] = frontZ(T, L);
  ST.freshA = (T > BUILD[0] - .5 && T < BUILD[1] + 2) || (T > UNB[0] && T < CRK[0]) ? 1 : 0;
  for (let j = 1; j < NSEG; j++) {
    const lt = LOCKC(j), ut = ULOCK_TS[j];
    ST.jaw[j] = E.sat(slam(T, JAWT(j), LOCKSC(j))) * (1 - kk(T, ut - 2.2, ut - 1.6));
    ST.sleeve[j] = kb(T, SLVT(j)) * (1 - kk(T, ut - 3.2, ut - 2.3));
  }
  ST.fin = kb(T, FINW) * (1 - kb(T, FIN_B));
  ST.drum = kb(T, DRUMW) * (1 - kb(T, HEAT_B));
  cutState(T); ST.cut = CUT.open > .01 ? CUT : null;
  ST.pump = 6 * T * heatOf(T);
  // the crawlers run their rails at 1.6 m/s (the sim clock), back and forth over a stretch each
  // (from the wake to the lights out, a whole number of round trips each, so the loop closes)
  { const sc = simAt(E.clamp(T, T_WAKE, LIGHTS_OFF[0])) - simAt(T_WAKE); for (let k = 0; k < P.NCRAWL; k++) { const L_ = k >= 4 ? 300 : 380, z0 = P.Z_PROW - 30 - 40 * k, u = ((sc * CRV[k] / L_ + k * .37) % 2 + 2) % 2, f = u < 1 ? u : 2 - u; ST.crawl[k] = z0 - L_ * (f * f * (3 - 2 * f)); } }
  const pa = psiAt(T), tl = tiltAt(T), wv = wheelVis(T), rv = TAU * (.08 + .22 * wv * wv) * T;
  ST.wheel = wv; ST.wheelFeed = capU(T) > 0 && capU(T) < 1 ? 1 : 0;
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
  for (let k = 0; k < 12; k++) { const t0 = CLAMPW[0] + CLAMP_DT * k; ST.clampK[k] = E.sat(slam(T, t0, 2)) * (1 - kb(T, CLAMP_B)); }
  ST.iris = kb(T, IRIS) * (1 - kb(T, IRIS_B));
  ST.focusK = ss(HBF[0] - .8, HBF[0], T) * (1 - ss(FLW[0][0] - .6, FLW[0][0] + .2, T));
  // the construction rings: each ring's plane, each node's morph, the chords' fresh glow as a ring forms or breaks up
  for (let L = 0, g = 0; L < NSC; L++) {
    const z = scZ(T, L); ST.sc.z[L] = z === null ? NaN : z;
    ST.sc.fresh[L] = Math.max(win(T, SC_FORM[L] - .6, SC_FORM[L] + 1.4, .3), win(T, SC_DIS[L] - 1, SC_DIS[L] + .4, .3)) * .9;
    for (let s = 0; s < SC_N[L]; s++, g++) ST.sc.u[g] = z === null ? 0 : nodeU(T, L, s);
  }
  // the petals: folded open as the crown is built, closing one by one (IRIS_C), open again for the shot (IRIS), shut after
  for (let k = 0; k < 6; k++) { const t0 = IRIS_C[0] + k * (IRIS_C[1] - IRIS_C[0] - .7) / 5; ST.irisP[k] = E.sat(1 - kk(T, t0, t0 + .7) + ST.iris); }
  // a crawler on the new barrel's top for scale (8 m): it follows the skin's front 46 m back to the crown
  { const f4 = ST.front[4]; ST.crawlB = T > BUILD[0] + 4 && T < CAL[1] && f4 > 60 ? Math.min(f4 > 1e8 ? Z_MZ : f4, Z_MZ) - 46 : null; }
  ST.roundZ = INS_ON || T <= AT_FAB || T >= TX ? null : rodZof(T);
  FLEXT = T - TX; ST.flex = T > TX && T < TX + 12 ? flexFn : null;
  FLT = T;
  // the wake: a lime wave out from the reactor; the sleep: a fainter one back into it
  const wk = T - (T_WAKE + .2), sl = T - LIGHTS_OFF[0];
  if (wk > 0 && wk < 3.4) { ST.wave = 640 * wk; ST.waveW = 70; ST.waveA = .95 * (1 - ss(2.6, 3.4, wk)); ST.waveT = .16; }
  else if (sl > 0 && sl < 2.6) { ST.wave = 1100 * (1 - sl / 2.4); ST.waveW = 70; ST.waveA = .85 * (1 - ss(2.0, 2.6, sl)); ST.waveT = 0; }
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
const ringPow = T => ss(RSPW[0] + .4, RSPW[0] + 2, T) * (1 - ss(SPIN_D[0], SPIN_D[1] - .6, T)) + ss(RSPW_B[0], RSPW_B[1], T) * (1 - ss(SPIN_B[0], SPIN_B[1], T));
const arcsOn = T => ss(ARC0, ARC0 + 1.5, T) * (1 - ss(SPIN_D[0], SPIN_D[0] + 2, T)) + ss(RSPW_B[0] + .8, RSPW_B[1] + .4, T) * (1 - ss(SPIN_B[0], SPIN_B[1] - .5, T));
const capFill = T => capU(T) * (1 - ss(CH0, CH1, T)) + ss(TX + 2, TX + 6, T) * .15 * (1 - ss(SW_B[0], SW_B[1], T));
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
  if (T > t1) return T < t1 + .2 ? 1.9 : T < t1 + .6 ? .5 * (1 - (T - t1 - .2) / .4) : .1 * (Math.floor(T * .8 + z) % 6 === 0 ? 1 : 0);     // (a last flare, then out)
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
    case 6: { // the radiator fins: coral at the root fading to grey at the tip (the heat they reject); pulses of coolant
      // run out along them; the glow follows the rejected MW (the gauge)
      const h = E.sat((heatOf(T) - .22) / .78) * (.2 + .8 * ST.fin), j = CUR.j, pulse = .22 * Math.max(0, Math.sin(T * 2.6 - j * 1.1)) * ST.fin * h;
      return 20 + Math.min(1.6, h * Math.exp(-j * .36) + pulse + .5 * flash(T, TX + .3, .5) * (1 - j / 8));
    }
    case 7: { let k = ss(CH1 - 1, TF, T) * .7 * (1 - ss(TX, TX + 1, T)); k = Math.max(k, 2 * flash(T, TX, 2.2)); if (T > IRIS[0] && T < IRIS[1] + .6) k = Math.max(k, .45 * (1 - E.sat((T - IRIS[1]) / .6))); if (T > CROWN_DONE - .6 && T < CROWN_DONE + 3) k = Math.max(k, 1.4 * flash(T, CROWN_DONE, 1.4)); if (q === 1 && CUR.k >= 0 && T > IRIS_C[0] - .5 && T < IRIS_C[1] + 3) { const t0 = IRIS_C[0] + CUR.k * (IRIS_C[1] - IRIS_C[0] - .7) / 5; k = Math.max(k, .8 * win(T, t0, t0 + .7, .1), 1.7 * flash(T, t0 + .7, 3)); } return k; }
    case 8: { let k = .45 * ss(COILW[0], COILW[1], T); if (T > TF && T < TX) k = 1.6; return k; }
    case 9: {
      if (q === 0) return Math.max(.65 * ss(COILW[0], COILW[1], T) * (1 - ss(TX, TX + 2, T)), 1.5 * flash(T, COILW[0] + .4, 2.5), .9 * chg(T));
      if (q === 1) return Math.max(1.4 * flash(T, BRC[1], 3), .55 * win(T, BRC[0], BRC[1], .2));
      if (q === 2) return Math.max(1.4 * flash(T, LOCKW[1], 3), .5 * win(T, UNLK[0], UNLK[1], .1), .75 * win(T, LOCKW[0], LOCKW[1], .2));
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
    case 15: { // the collars' locks: jaws (q 0) lime while they drive, a white flash as they bite, and as they let go on the
      // return; the sleeve (q 1) lime while it screws in, a flash as it seats
      const j = CUR.k; if (j < 1) return 0; const sc = LOCKSC(j), jt = JAWT(j), ut = ULOCK_TS[j], sv = SLVT(j);
      if (q === 1) return Math.max(.95 * win(T, sv[0], sv[1], .2), 1.6 * flash(T, sv[1], 3)) + .9 * win(T, ut - 3.2, ut - 2.3, .15);
      return Math.max(1.9 * flash(T, jt + .22 * sc, 3 / sc), .85 * win(T, jt - .3 * sc, jt + .3 * sc, .1), .9 * win(T, ut - 2.2, ut - 1.6, .1), 1.5 * flash(T, ut - 1.6, 3));
    }
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
    case 19: { // the banks' modules fill in order: each charge bar ramps up over its turn, white-hot while it fills, lime once full; emptied into the rings through the charge
      const f = capFill(T) * 96 - q, u = E.sat(f); return f <= 0 ? .04 : u < 1 ? .3 + .7 * u + .6 * u : .75 + .5 * chg(T); }
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
function stream(pa, Tw, T, t0, speed, gap, a, col, maxS, tEnd) {
  if (T < t0 || a < .01) return;
  const head = (T - t0) * speed, s0 = head % gap, L_ = Math.min(pa.L, maxS === undefined ? 1e9 : maxS), tail = tEnd !== undefined && T > tEnd ? (T - tEnd) * speed : -1;
  if (tail > L_) return;
  for (let s = s0; s <= L_; s += gap) {
    if (s > head) break;
    if (s < tail) continue;          // (the feed cut at tEnd: the last packets run on out of the path)
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
/* the wheels' feed to the banks: from each construction ring parked round the barrel (its top node) down a contact
   arm onto the gun bus, back down the barrel and the ship's spine to the switchyard's racks */
const P_FEED = PARKZ.map((z, L) => { const s = L % 2 ? -1 : 1; return mkPath([[0, P.SC_R[L] - 7, z], [0, P.HA + 1.5, z], [0, 4.6 * s, z - 4], [0, 4.6 * s, -16], [s * 4, s * 2.3, -40], [s * 9, -P.BAY_H[1] - 1, -46], [s * 9, -P.BAY_H[1] - 1, -116], [s * 9, 0, -138], [s * 15, P.SWY + 3, -150], [s * 15, P.SWY + 6, -160]]); });
/* the reactor's own feed: its 14 MW up the spine bus into the racks, all the time it runs */
const P_REAC = [1, -1].map(s => mkPath([[0, 0, (P.REA_Z0 + P.REA_Z1) / 2], [s * 5, 0, P.REA_Z1 + 2], [s * 9, 0, P.Z_STERN + 4], [s * 9, 0, -200], [s * 15, P.SWY + 3, -196], [s * 15, P.SWY + 6, -190]]));
let PPS = [];
function drawPower(T, Tw) {
  const br = busRear(T);
  if (br > .01) for (let s = 0; s < 2; s++) stream(P_REAR[s], Tw, T, CURW[0] + .4 + s * .2, 60, 30, br * .9);
  const eng = (T > ENGX[0] - .5 && T < SWW[1] + .2) || (T > SW_B[0] && T < ENGX_B[1] + .4);
  // the engine feeds: cut as the switches break (SWW mid): the last packets drain out to the nozzles
  if (eng && br > .01) { const back = T > SW_B[0], a = br * (back ? ss(SW_B[0], SW_B[1], T) : 1); for (let e = 0; e < 4; e++) stream(P_ENG[e], Tw, T, back ? SW_B[0] : ENGX[0] - .5, 70, 34, a, undefined, back ? undefined : (SWW[0] + SWW[1]) / 2); }
  const rp = ringPow(T) * (1 - .6 * ss(SWW[0], SWW[1], T) * (1 - ss(SW_B[0], SW_B[1], T)));
  if (rp > .01) for (let i = 0; i < P_RING.length; i++) stream(P_RING[i], Tw, T, RSPW[0] + .2 + i * .05, 55, 40, rp * .7);
  const g = gunOn(T);
  if (g > .01 && T < TX + 1) for (let s = 0; s < 2; s++) stream(P_GUN[s], Tw, T, GUNP[0] - .4, 300, 30, g * (1 - ss(TF, TX, T)));
  // the wheels feeding the banks (CAPW): packets from each construction ring parked round the barrel, down the gun bus to the racks
  { const cu = capU(T), fa = cu > 0 && cu < 1 ? ss(CAPW[0], CAPW[0] + .6, T) : 0; if (fa > .01) for (let i = 0; i < P_FEED.length; i++) { stream(P_FEED[i], Tw, T, CAPW[0] + i * .07, 160, 26, .9 * fa, LIME); const z = PARKZ[i], c = ST.sc.z[i]; if (!isNaN(c)) { wpPolar(Tw, P.SC_R[i] - 7, PI / 2, c, RA); wpPolar(Tw, P.HA + 1.5, PI / 2, c, RB); K.arcW(RA, RB, i * 17 + Math.floor(T * 12), T, .8 * fa, .35, HOT, 2); K.glowW(RB[0], RB[1], RB[2], 12, LIME, .5 * fa); } } }
  // the reactor's feed into the racks (the trickle under the wheels' flood)
  if (br > .01 && T < LIGHTS_OFF[0]) for (let s = 0; s < 2; s++) stream(P_REAC[s], Tw, T, CURW[0] + .8 + s * .3, 45, 22, br * .75, HOT);
  if (crBuild(T) && ST.front[0] > 0) { const f0 = Math.min(Z_MZ, ST.front[0]); for (let s = 0; s < 2; s++) stream(P_CR[s], Tw, T, BUILD[0] - .6, 140, 36, .8, HOT, f0 + 16); }
  // the switches break and make: arcs off the blades while they turn
  // (strongest as each blade leaves its engine contact and as it reaches the gun contact: two bursts per turn)
  for (const w of [SWW, SW_B]) { const u = (T - w[0]) / (w[1] - w[0] + .4); if (u < 0 || u > 1) continue; const I = Math.max(Math.exp(-(((u - .2) / .12) ** 2)), Math.exp(-(((u - .82) / .1) ** 2)), .35 * Math.sin(PI * u)); for (let k = 0; k < 4; k++) { const Sw = PPS[k]; if (!Sw) continue; for (let b = 0; b < 6; b++) { const t = (b >> 1) / 3 * TAU + (b & 1 ? .25 : -.25), cyc = Math.floor(T * 22 + b + k); if (hh(b + k * 6, cyc) < .3) continue; P.apTo(RA, Sw, [1.4, Math.cos(t) * 5.6, Math.sin(t) * 5.6]); P.apTo(RB, Sw, [.6, Math.cos(t + (b & 1 ? .5 : -.5)) * 7.6, Math.sin(t + (b & 1 ? .5 : -.5)) * 7.6]); K.arcW(RA, RB, k * 7 + b + cyc, T, I, .5, HOT, 2); K.glowW(RA[0], RA[1], RA[2], 14, LIME, .5 * I); for (let i = 0; i < 6; i++) { const a_ = T - Math.floor(T * 22) / 22, th = hh(i, cyc + b) * TAU; K.dotW(RB[0] + Math.cos(th) * a_ * 40, RB[1] + Math.sin(th) * a_ * 40 - a_ * a_ * 30, RB[2] + (hh(i + 3, cyc) - .5) * a_ * 40, 1, HOT, I * (1 - a_ * 22)); } } } }
}

/* ---------- the reactor's cutaway: a true quarter (CUT_A +- 45 deg, the shell to the axis) ----------
   The shell (and the fins over the window) are clipped by CUT.shell; everything inside is drawn here from cached
   samples: each cut face is a half-plane through the bore axis at CUT_A +- h, sampled once at load on an (r, z) grid out
   to the shell and through the domes, each sample tagged with its layer; per frame the two faces are turned to their
   angle and drawn in the layers' colours: the fuel white-hot with the heat (its element columns brighter), the
   reflector grey, the vessel white, the hot shoe coral, the couples' legs lime pillars (p and n, in rows), the cold shoe
   white, the coolant channels pulsing, the shell grey. The samples are shuffled, so the first n are an even subset: n
   falls with distance (LOD). The three control drums inside the window stand in it, turning their coral absorber faces
   away; heat flows out across each face, and the current runs the couples' zigzag in series, out to the bus. */
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
  const op = kk(T, XRJ[0], XRJ[1]) * (1 - kk(T, XRJ[2], XRJ[3]));
  CUT.open = op; CUT.hs = CUT.hc = CUT.hk = P.CUT_W.shell * op;
  const zlo = P.REA_Z0 - 18, zhi = P.REA_Z1 + 14;
  wedge(CUT.shell, CUT.hs, zlo, zhi, 1e4); wedge(CUT.cold, CUT.hc, zlo, zhi, 0); wedge(CUT.core, CUT.hk, zlo, zhi, 0);
  return op;
}
const CPP = [0, 0, 0], CQQ = [0, 0, 0];
/* a platform-frame point (radius r at angle a about the bore axis, at z) to world */
const wpPolar = (Tw, r, a, z, o) => { const M = Tw.R, t = Tw.T, x = Math.cos(a) * r, y = Math.sin(a) * r; o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o; };
function cutLine(Tw, r0, a0, z0, r1, a1, z1, col, a, step, gl) { wpPolar(Tw, r0, a0, z0, CPP); wpPolar(Tw, r1, a1, z1, CQQ); K.lineW(CPP[0], CPP[1], CPP[2], CQQ[0], CQQ[1], CQQ[2], step || 1.4, 1, col, a, gl ? LIME : null, gl || 0, 0); }
/* the layers: 0 fuel, 1 a fuel element column, 2 reflector / shield, 3 vessel, 4 hot shoe, 5 p-leg, 6 n-leg, 7 the gap
   between legs, 8 cold shoe, 9 coolant, 10 shell */
const XR_NL = 11;
const CP_LEG = .5, CP_PN = 1.7;        // a leg's half width along z, the p -> n spacing
const XRS = (() => {
  const Z0 = P.REA_Z0, Z1 = P.REA_Z1, SR_ = P.SHELL_R, dr = .24, dz = .28, R_ = [], Z_ = [], L_ = [];
  const lin = (pts, s) => { for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) { const [a, ra] = pts[i - 1], [b, rb] = pts[i]; return ra + (rb - ra) * (s - a) / Math.max(1e-6, b - a); } return pts[pts.length - 1][1]; };
  const AFT = [[0, 8], [4, 18], [10, 27], [16, SR_]], FWD = [[0, SR_], [8, 22], [12, 15]];
  const rmax = z => z < Z0 ? lin(AFT, z - (Z0 - 16)) : z > Z1 ? lin(FWD, z - Z1) : SR_;
  const legAt = z => { for (let row = 0; row < P.CP_ROWS; row++) { const zr = P.CP_Z0 + row * P.CP_DZ; if (Math.abs(z - zr) < CP_LEG) return 5; if (Math.abs(z - zr - CP_PN) < CP_LEG) return 6; } return 7; };
  for (let z = Z0 - 16 + dz / 2; z < Z1 + 12; z += dz) {
    const rm = rmax(z), inside = z > Z0 && z < Z1;
    for (let r = .12; r < rm; r += dr) {
      let l;
      if (!inside) l = rm - r < 1.6 ? 10 : 2;
      else if (r < P.FUEL_R) l = z > Z0 + 3 && z < Z1 - 3 ? (Math.abs(((r / 2.6) % 1) - .5) > .44 ? 1 : 0) : 2;
      else if (r < P.CORE_R - 1) l = 2; else if (r < P.CORE_R) l = 3; else if (r < P.HS_R) l = 4;
      else if (r < P.CS_R) { l = z > P.CP_Z0 - 1 && z < P.CP_Z0 + (P.CP_ROWS - 1) * P.CP_DZ + CP_PN + 1 ? legAt(z) : 7; if (l === 7 && ((r * 7.3 + z * 3.1) % 1) > .3) continue; }
      else if (r < P.CSO_R) l = 8; else if (r < P.CSO_R + .8) l = 9; else l = 10;
      R_.push(r); Z_.push(z); L_.push(l);
    }
  }
  const n = R_.length, ix = new Uint32Array(n), rnd = rng(9090);
  for (let i = 0; i < n; i++) ix[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = ix[i]; ix[i] = ix[j]; ix[j] = t; }
  const R = new Float32Array(n), Z = new Float32Array(n), L = new Uint8Array(n), H = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = ix[i]; R[i] = R_[k]; Z[i] = Z_[k]; L[i] = L_[k]; H[i] = rnd(); }
  // the drums (in the drum's own frame: x, y across, z along), the absorber face on +x
  const DN = [], dth = .3 / P.DRUM_R;
  for (let z = Z0 + 4; z < Z1 - 4; z += .45) for (let t = 0; t < TAU; t += dth) DN.push(Math.cos(t) * P.DRUM_R, Math.sin(t) * P.DRUM_R, z, Math.cos(t) > .25 ? 1 : 0);
  for (const z of [Z0 + 4, Z1 - 4]) for (let r = .3; r < P.DRUM_R; r += .3) for (let t = 0; t < TAU; t += .3 / r) DN.push(Math.cos(t) * r, Math.sin(t) * r, z, 2);
  // the couples' series path on a face, (r, z): up a p-leg, across the cold strap, down the n-leg, across the hot strap
  const rh = P.CORE_R + 1.1, rc = P.CS_R + .2, path = [[P.CORE_R + .4, Z0 + 2], [rh, P.CP_Z0 - 2]];
  for (let row = 0; row < P.CP_ROWS; row++) { const zr = P.CP_Z0 + row * P.CP_DZ; path.push([rh, zr], [rc, zr], [rc, zr + CP_PN], [rh, zr + CP_PN]); }
  path.push([rh, Z1 - 2], [P.SHELL_R + 3, Z1 + 1]);
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  LOG.push(`reactor X-ray: ${n} face samples, ${DN.length / 4} drum samples`);
  return { n, R, Z, L, H, D: new Float32Array(DN), path, cum, plen: cum[cum.length - 1] };
})();
const XR_C = [], XR_A = new Float32Array(XR_NL), XR_Z = new Uint8Array([1, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1]);
for (let i = 0; i < XR_NL; i++) XR_C.push([0, 0, 0]);
const setC = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };
const mixC = (o, a, b, u) => { o[0] = a[0] + (b[0] - a[0]) * u; o[1] = a[1] + (b[1] - a[1]) * u; o[2] = a[2] + (b[2] - a[2]) * u; };
const GRY = [150, 152, 146], CORAL = K.CORAL, PZ_ = [0, 0], XR_FU = [0, 0, 0];
let XR_FZ = 1;
const pathRZ = (s, o) => { const c = XRS.cum, p = XRS.path; let i = 1; while (i < c.length - 1 && c[i] < s) i++; const k = E.clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), 0, 1); o[0] = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k; o[1] = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k; return o; };
function drawCutaway(T, Tw) {
  if (CUT.open < .01) return;
  const h = heatOf(T), hh_ = E.sat((h - .22) / .78), cur = curOf(T), Z0 = P.REA_Z0, Z1 = P.REA_Z1, A = P.CUT_A, op = CUT.open, H_ = CUT.hk;
  const M = Tw.R, t = Tw.T, e = C.eye;
  // LOD: the share of the samples drawn, from the reactor's size on screen
  const cx = M[2] * REA_M + t[0], cy = M[5] * REA_M + t[1], cz = M[8] * REA_M + t[2], dc = Math.max(1, Math.hypot(cx - e[0], cy - e[1], cz - e[2]));
  const px = P.SHELL_R * C.fl / dc, share = E.clamp((px / 480) ** 2, .06, 1), n = Math.round(XRS.n * share);
  // the layers' colours and strengths now
  setC(XR_C[0], hh_ > .5 ? HOT : HEAT); XR_A[0] = (.22 + .8 * hh_) * op;
  setC(XR_C[1], HOT); XR_A[1] = (.35 + .75 * hh_) * op;
  setC(XR_C[2], GRY); XR_A[2] = .26 * op;
  setC(XR_C[3], WH); XR_A[3] = .9 * op;
  mixC(XR_C[4], GRY, CORAL, .4 + .6 * hh_); XR_A[4] = (.6 + .6 * hh_) * op;
  setC(XR_C[5], LIME); XR_A[5] = (.45 + .75 * cur) * op;
  mixC(XR_C[6], LIME, WH, .3); XR_A[6] = (.4 + .6 * cur) * op;
  setC(XR_C[7], GRY); XR_A[7] = .12 * op;
  setC(XR_C[8], WH); XR_A[8] = .85 * op;
  mixC(XR_C[9], WH, LIME, .3); XR_A[9] = .5 * op;
  setC(XR_C[10], GRY); XR_A[10] = .55 * op;
  const R = XRS.R, Z = XRS.Z, L = XRS.L, Hs = XRS.H, fl = T * 1.7; XR_FZ = hh_ > .3 && share > .4 ? 2 : 1;
  for (const sg of [-1, 1]) {
    const a = A + sg * H_, ca = Math.cos(a), sa = Math.sin(a);
    const ux = M[0] * ca + M[1] * sa, uy = M[3] * ca + M[4] * sa, uz = M[6] * ca + M[7] * sa, zx = M[2], zy = M[5], zz = M[8];
    for (let i = 0; i < n; i++) {
      const l = L[i]; let al = XR_A[l]; if (al < .01) continue;
      const r = R[i], z = Z[i];
      if (l < 2) {          // the fuel: white-hot at the axis, cooling to orange at its edge, flickering
        const f = (Hs[i] + fl) % 1, u = r / P.FUEL_R * (1.15 - .5 * hh_); al *= .8 + .5 * (f < .5 ? f : 1 - f);
        mixC(XR_FU, HOT, HEAT, u > 1 ? 1 : u); K.dotW(t[0] + ux * r + zx * z, t[1] + uy * r + zy * z, t[2] + uz * r + zz * z, l ? 2 : XR_FZ, XR_FU, al > 1 ? 1 : al); continue;
      }
      else if (l === 9) al *= .5 + .5 * Math.max(0, Math.sin(z * .35 - T * 4));
      K.dotW(t[0] + ux * r + zx * z, t[1] + uy * r + zy * z, t[2] + uz * r + zz * z, XR_Z[l], XR_C[l], al > 1 ? 1 : al);
    }
    // the layers' boundaries along the face (hairlines), the face's outline in lime
    for (const [rb, col, al] of [[P.FUEL_R, HOT, .5 * hh_ + .2], [P.CORE_R, WH, .6], [P.HS_R, CORAL, .7], [P.CS_R, WH, .6], [P.CSO_R, WH, .4]]) cutLine(Tw, rb, a, Z0, rb, a, Z1, col, al * op, 1.6);
    cutLine(Tw, P.SHELL_R + .1, a, Z0, P.SHELL_R + .1, a, Z1, LIME, .9 * op, 1.2, .05);
    cutLine(Tw, .1, a, Z0 - 16, .1, a, Z1 + 12, LIME, .5 * op, 1.6);
    // heat out across the face: from the fuel through the hot shoe into the legs, white out of the cold shoe
    if (h > .25) for (let i = 0; i < 260; i++) {
      const f = (T * .36 + hh(i, 22 + (sg > 0 ? 1 : 0))) % 1, r = 2 + f * (P.SHELL_R - 2), z = Z0 + 3 + hh(i, 23) * (Z1 - Z0 - 6);
      const col = r < P.FUEL_R ? HOT : r < P.HS_R ? CORAL : r < P.CS_R ? LIME : WH;
      K.dotW(t[0] + ux * r + zx * z, t[1] + uy * r + zy * z, t[2] + uz * r + zz * z, 2, col, .9 * (1 - f * .5) * hh_ * op);
    }
    // the current through the couples in series: packets running the zigzag (white heads, lime tails), out to the bus
    if (cur > .02) {
      const L_ = XRS.plen, gap = 4.5, sp = 26, head = (T - CURW[0]) * sp;
      for (let s = ((head % gap) + gap) % gap; s < L_; s += gap) {
        if (s > head) break;
        for (let q = 0; q < 7; q++) { const sq = s - q * .9; if (sq < 0) break; pathRZ(sq, PZ_); const r = PZ_[0], z = PZ_[1]; K.dotW(t[0] + ux * r + zx * z, t[1] + uy * r + zy * z, t[2] + uz * r + zz * z, q ? 2 : 3, q ? LIME : HOT, cur * op * (1 - q / 8)); }
        if ((s / gap | 0) % 3 === 0) { pathRZ(s, PZ_); const r = PZ_[0], z = PZ_[1]; K.glowW(t[0] + ux * r + zx * z, t[1] + uy * r + zy * z, t[2] + uz * r + zz * z, 7, LIME, .3 * cur * op); }
      }
    }
  }
  // the ends of the window: the layers as arcs at the fore and aft ends of the cut (the quarter's section seen end-on)
  for (const z of [Z0, Z1]) for (const [rb, col, al] of [[P.FUEL_R, HOT, .3 + .5 * hh_], [P.CORE_R, WH, .55], [P.HS_R, CORAL, .7], [P.CS_R, WH, .55], [P.SHELL_R + .1, LIME, .8]]) {
    const n_ = Math.round(24 + rb * 1.6); for (let i = 0; i <= n_; i++) { wpPolar(Tw, rb, A - H_ + 2 * H_ * i / n_, z, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 2, col, al * op); }
  }
  // the drums standing in the window: each turns its coral absorber face away from the core as the drums turn (st.drum)
  { const D = XRS.D, nd = D.length / 4, dk = Math.max(1, Math.round(1 / share)), ab = E.sat(1 - ST.drum * 1.2);
    for (const t0 of P.DRUMS) {
      const ph = t0 + PI + ST.drum * PI, cp = Math.cos(ph), sp = Math.sin(ph), ox = Math.cos(t0) * P.DRUM_RC, oy = Math.sin(t0) * P.DRUM_RC;
      for (let i = 0; i < nd; i += dk) {
        const j = i * 4, x = D[j] * cp - D[j + 1] * sp + ox, y = D[j] * sp + D[j + 1] * cp + oy, z = D[j + 2], k = D[j + 3];
        const px_ = M[0] * x + M[1] * y + M[2] * z + t[0], py_ = M[3] * x + M[4] * y + M[5] * z + t[1], pz_ = M[6] * x + M[7] * y + M[8] * z + t[2];
        if (k === 1) K.dotW(px_, py_, pz_, 2, CORAL, (.6 + .4 * ab) * op); else K.dotW(px_, py_, pz_, 1, k === 2 ? WH : GRY, (k === 2 ? .7 : .45) * op);
      }
    }
  }
  // the scan plane's sweep as it opens: lime arcs along the window, z running aft to fore
  const sw = (T - XRJ[0]) / (XRJ[1] - XRJ[0] + .6);
  if (sw > 0 && sw < 1) { const z = Z0 - 16 + (Z1 - Z0 + 30) * sw; for (const r of [P.SHELL_R + 1, P.CSO_R, P.HS_R, P.FUEL_R, 7]) { for (let i = 0; i <= 50; i++) { const a = A - P.CUT_W.shell - .1 + (2 * P.CUT_W.shell + .2) * i / 50; wpPolar(Tw, r, a, z, CPP); K.dotW(CPP[0], CPP[1], CPP[2], 2, r > 30 ? HOT : LIME, .9); } } }
  drawGauge(T, Tw, op);
}
/* the gauge: a dial standing off the reactor's fore end in the window's direction (P.POI.gauge), facing out of it: the
   heat the fins reject (0..140 MW) as a coral arc tied to the fins' glow, the couples' 14 MW inside it in lime, ticks
   every 10 MW, a needle */
const GAUGE_R = 9;
function drawGauge(T, Tw, op) {
  const en = energy(T), A = P.CUT_A, c = P.POI.gauge, U = [-Math.sin(A), Math.cos(A), 0], Wd = [0, 0, 1];
  const at = (r, th, o) => P.apTo(o, Tw, [c[0] + (U[0] * Math.cos(th) + Wd[0] * Math.sin(th)) * r, c[1] + (U[1] * Math.cos(th) + Wd[1] * Math.sin(th)) * r, c[2] + (U[2] * Math.cos(th) + Wd[2] * Math.sin(th)) * r]);
  const th = v => PI - PI * v;          // 0 at the left, 1 at the right, over the top
  const fm = en.finMW / 140, em = en.reactorMW / 14;
  for (let i = 0; i <= 120; i++) { at(GAUGE_R, th(i / 120), CPP); K.dotW(CPP[0], CPP[1], CPP[2], 1, WH, .45 * op); }
  for (let k = 0; k <= 14; k++) { const v = k / 14; at(GAUGE_R + .2, th(v), CPP); at(GAUGE_R + (k % 5 ? 1 : 2), th(v), CQQ); K.lineW(CPP[0], CPP[1], CPP[2], CQQ[0], CQQ[1], CQQ[2], 1.4, k % 5 ? 1 : 2, WH, .8 * op); }
  for (let i = 0; i <= 160 * fm; i++) { const v = i / 160; for (const dr of [-1.2, -.8, -.4]) { at(GAUGE_R + dr, th(v), CPP); K.dotW(CPP[0], CPP[1], CPP[2], 2, v > .85 ? HOT : CORAL, (.5 + .5 * v) * op); } }
  for (let i = 0; i <= 120 * em; i++) { at(GAUGE_R - 2.4, th(i / 120), CPP); K.dotW(CPP[0], CPP[1], CPP[2], 2, LIME, .9 * op); }
  at(.6, th(fm), CPP); at(GAUGE_R - .3, th(fm), CQQ); K.lineW(CPP[0], CPP[1], CPP[2], CQQ[0], CQQ[1], CQQ[2], 1.2, 2, HOT, op);
  at(0, 0, CPP); K.glowW(CPP[0], CPP[1], CPP[2], 8, CORAL, .5 * op * fm);
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
      // (as they die the arcs thin out but each still strikes bright: they sputter out rather than fade)
      if (hh(k, cyc) < 1 - .75 * ao) continue;
      const a = hh(k * 3 + 1, cyc) * TAU, da = (hh(k * 5 + 2, cyc) - .5) * .05, rr = RR_ + (hh(k * 7, cyc) - .5) * 7;
      ringPt(CA, rr, a, -hz - .4, RA); ringPt(CB, rr, a + da, hz + .4, RB);
      K.arcW(RA, RB, k * 13 + cyc, T, Math.max(ao, .7) * life * .9 * boost, .28, HOT, k % 3 ? 1 : 2);
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
  const tl = PP.rings[0].tilt, sw = (FULL.slewFX !== undefined ? FULL.slewFX : win(T, SLEW[0] - .6, SLEW[1] + .8, .6)) + win(T, SLEW_B[0] - .6, SLEW_B[1] + .8, .6) + win(T, TX, TX + 6, .3) * .8;
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
    // the scissor angle: a protractor at the end of the gimbal axis, beyond ring A's rim: a dotted scale +-4 deg either
    // side of the ship's axis (a tick per degree), the ring's tilted axis a white-hot needle sweeping across it, the
    // angle between them filled lime (ring B mirrors it)
    { const g = P.GAX, gw = X.dir(Tw, [g[0], g[1], 0]), nv = X.dir(Tw, V.cross([g[0], g[1], 0], [0, 0, 1])), cA = X.ap(Tw, [0, 0, P.RING_Z[0]]), piv = V.mad(cA, gw, P.RING_R + 60), Rr = 170, sc_ = 4 * DEG;
      const at = (ang, r) => V.add(piv, V.add(V.mul(z0, Math.cos(ang) * r), V.mul(nv, Math.sin(ang) * r)));
      const A_ = a => a / sc_ * .5;          // (shown 7x: 4 deg spans 0.5 rad)
      for (let i = -80; i <= 80; i++) { const p_ = at(A_(i / 20 * DEG), Rr); K.dotW(p_[0], p_[1], p_[2], 2, WH, .7 * sw); }
      for (let k = -4; k <= 4; k++) { const a0 = at(A_(k * DEG), Rr), a1 = at(A_(k * DEG), Rr + (k ? 9 : 18)); K.lineW(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], 1.4, k ? 1 : 2, WH, .8 * sw); }
      const an = A_(tl); for (let i = 0; i <= 60; i++) for (const dr of [-5, -8, -11]) { const p_ = at(an * i / 60, Rr + dr); K.dotW(p_[0], p_[1], p_[2], 2, LIME, .9 * sw); }
      const nd = at(an, Rr + 22); K.lineW(piv[0], piv[1], piv[2], nd[0], nd[1], nd[2], 1.2, 2, HOT, .95 * sw); K.glowW(piv[0], piv[1], piv[2], 8, LIME, .5 * sw); }
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
const STM = (() => { const r = rng(4242), A = new Float32Array(NST * 6), LS = [2, 1, 2, 4, 0, 3, 2, 1, 4, 2, 3, 1]; for (let k = 0; k < NST; k++) { A[k * 6] = k % 5; A[k * 6 + 1] = r() * TAU; A[k * 6 + 2] = 2 + 7 * r(); A[k * 6 + 3] = (r() < .5 ? -1 : 1) * (.7 + .5 * r()); A[k * 6 + 4] = .9 + .5 * r(); A[k * 6 + 5] = r(); } return A; })();
const SPJ = (() => { const r = rng(4343), A = new Float32Array(NST * NPS * 3); for (let i = 0; i < A.length; i++) A[i] = r(); return A; })();
const CLD = (() => { const r = rng(4444), A = new Float32Array(NCL * 5); for (let i = 0; i < A.length; i++) A[i] = r(); return A; })();
const LAYR = L => L === 0 ? P.LINER_R : L === 1 ? P.MAG_RC : L === 2 ? P.HR : L === 3 ? P.HA - 2 : P.HA + .2;
/* the stream k's curve at u (platform frame, cylindrical) into SWP: from the emitter (r0, ae, z0) to the target */
const SWP = [0, 0, 0];
function streamPt(k, u, c, back, T, o) {
  const L = STM[k * 6], fz = ST.front[L], ae = k / NST * TAU + 7.5 * DEG, at = ae + STM[k * 6 + 3] + STM[k * 6 + 1] * .2 + T * .22 * STM[k * 6 + 4];
  const zt = back ? fz + STM[k * 6 + 2] : fz - STM[k * 6 + 2], r0 = SC_R[L] - 7, z0 = ST.sc.z[L], rt = LAYR(L);
  const ue = 1 - Math.pow(1 - u, 1.7), r = r0 + (rt - r0) * ue, a = ae + (at - ae) * Math.pow(u, 1.15), z = z0 + (zt - z0) * u + (back ? -1 : 1) * 9 * Math.sin(PI * u);
  o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r; o[2] = z; return zt;
}
/* the layers' sections (x, y in the barrel's frame), sampled once and shuffled (the first n are an even subset) */
const SEC_COL = [HOT, LIME, WH, K.CORAL, [178, 180, 172]], SEC_A = [1, .95, .9, .95, .7];
const SECP = (() => {
  const r = rng(5151), out = [], inHex = (x, y, R) => { const a = Math.abs(x), b = Math.abs(y); return b <= R * Math.sqrt(3) / 2 && a * Math.sqrt(3) / 2 + b / 2 <= R * Math.sqrt(3) / 2; };
  const gen = (test, R, sp) => { const A = []; for (let x = -R; x <= R; x += sp) for (let y = -R; y <= R; y += sp) { const jx = x + (r() - .5) * sp * .6, jy = y + (r() - .5) * sp * .6; if (test(jx, jy)) A.push(jx, jy); } const n = A.length / 2; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); for (const o of [0, 1]) { const t = A[i * 2 + o]; A[i * 2 + o] = A[j * 2 + o]; A[j * 2 + o] = t; } } return new Float32Array(A); };
  out.push(gen((x, y) => { const d = Math.hypot(x, y); return d > P.BORE_R && d < P.LINER_R; }, P.LINER_R, .11));
  out.push(gen((x, y) => { for (let m = 0; m < P.NMAG; m++) { const a = PI / 2 + m * TAU / P.NMAG; if (Math.hypot(x - Math.cos(a) * P.MAG_RC, y - Math.sin(a) * P.MAG_RC) < P.MAG_R) return true; } return false; }, P.MAG_RC + P.MAG_R, .13));
  out.push(gen((x, y) => inHex(x, y, P.HR + .35) && !inHex(x, y, P.HR - .55), P.HR + .4, .14));
  out.push(gen((x, y) => { for (let f = 0; f < 6; f++) { const a = f * PI / 3, c = Math.cos(a), s = Math.sin(a), u = x * c + y * s, v = -x * s + y * c; if (Math.abs(u) < 4.6 && Math.abs(v - (P.HA - 2)) < 1.1) return true; } return false; }, P.HR, .17));
  out.push(gen((x, y) => inHex(x, y, P.HR + .55) && !inHex(x, y, P.HR + .25), P.HR + .6, .12));
  return out;
})();
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
  const hexAt = (r, z, a0, col, al) => { for (let k = 0; k < 6; k++) { wpPolar(Wt, r, a0 + k * PI / 3, z, RA); wpPolar(Wt, r, a0 + (k + 1) * PI / 3, z, RB); K.lineW(RA[0], RA[1], RA[2], RB[0], RB[1], RB[2], 1.3, 1, col, al, LIME, .05, 0); } };
  // the deposition fronts: each layer's section drawn solid in its own colour at its own front, so the five stand
  // staggered like a cut cable (the liner leading, white-hot; the nine magnets lime; the frame white; the cassettes
  // coral; the skin grey), each edged in light; thinned with distance
  { const e = C.eye, dc = Math.max(1, V.dist(e, X.ap(Wt, [0, 0, ST.front[2]]))), keep = E.clamp((260 / dc) ** 2, .05, 1), M = Wt.R, t = Wt.T;
    for (let L = 0; L < 5; L++) {
      const fz = ST.front[L]; if (fz < 0 || fz > Z_MZ) continue;
      const S_ = SECP[L], n = Math.round(S_.length / 2 * keep), col = SEC_COL[L], al = I * (.75 + .2 * Math.sin(T * 30 + L)) * SEC_A[L];
      for (let i = 0; i < n; i++) { const x = S_[i * 2], y = S_[i * 2 + 1]; K.dotW(M[0] * x + M[1] * y + M[2] * fz + t[0], M[3] * x + M[4] * y + M[5] * fz + t[1], M[6] * x + M[7] * y + M[8] * fz + t[2], keep > .5 ? 2 : 1, col, al); }
      const cz = X.ap(Wt, [0, 0, fz]), U = X.dir(Wt, [1, 0, 0]), Wv = X.dir(Wt, [0, 1, 0]);
      if (L === 0) K.ringW(cz, U, Wv, P.LINER_R + .05, 60, 2, LIME, al);
      else if (L === 1) K.ringW(cz, U, Wv, P.CRING_R, 48, 1, LIME, al * .8);
      else hexAt(L === 3 ? P.HA - .9 : P.HR + (L === 4 ? .3 : 0), fz, L === 3 ? PI / 6 : 0, L === 3 ? CORAL : L === 2 ? HOT : LIME, al);
    }
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
function glowR(x, y, z, wr, col, a) { if (!K.pj(x, y, z)) return; const px = Math.min(140, wr * C.fl / Math.max(1, K.PJ[2]) / S); if (px < 1.5) { K.dotW(x, y, z, 1, col, a); return; } K.glowW(x, y, z, Math.round(px), col, a); }
/* an engine's plume: a white-hot throat, a filled cone of dots streaming out, a glowing column, shock diamonds */
function plume(ex, d, U, Wd, I, T, len, r0, spread, seed) {
  if (I < .02) return;
  const fr = Math.floor(T * 30), L_ = len * (.7 + .3 * I);
  glowR(ex[0], ex[1], ex[2], r0 * 1.1, HOT, .45 * I);
  for (let i = 0; i < NPL; i++) {
    const o = i * 4, u = (PLM[o] + T * (.9 + .8 * PLM[o + 3])) % 1, s = L_ * Math.pow(u, 1.6), rr = (r0 * .85 + s * spread) * PLM[o + 2], th = PLM[o + 1] + (hh(i, fr + seed) - .5) * .25;
    const b = 1.4 * I * (1 - u) * (.55 + .45 * PLM[o + 3]) * (u < .05 ? 1.5 : 1);
    if (b < .03) continue;
    const cx = Math.cos(th) * rr, cy = Math.sin(th) * rr;
    K.dotW(ex[0] + d[0] * s + U[0] * cx + Wd[0] * cy, ex[1] + d[1] * s + U[1] * cx + Wd[1] * cy, ex[2] + d[2] * s + U[2] * cx + Wd[2] * cy, u < .3 ? 2 : 1, u < .14 ? HOT : i % 3 ? WH : LIME, Math.min(1, b));
  }
  // shock diamonds: the jet's edge pinching in and out down a train of cells, the oblique shocks crossing to the axis in
  // each (an X of bright lines in section), a Mach disk at each crossing, fading down the plume
  const cell = r0 * 2.3, NC = 6, NG = 16;
  for (let c = 0; c < NC; c++) {
    const fa = I * (1 - c / (NC + .5)) * (.85 + .15 * Math.sin(T * 23 + c));
    for (let g = 0; g < NG; g++) {
      const th = g / NG * TAU + c * .2, cu = Math.cos(th), sn = Math.sin(th);
      for (let i = 0; i <= 14; i++) {
        const v = i / 14, s = (c + v) * cell, re = r0 * (.62 + .38 * Math.abs(Math.cos(PI * v))) * (1 + s * spread / r0 * .4), rs = re * Math.abs(1 - 2 * v);
        const bx = ex[0] + d[0] * s, by = ex[1] + d[1] * s, bz = ex[2] + d[2] * s;
        K.dotW(bx + (U[0] * cu + Wd[0] * sn) * rs, by + (U[1] * cu + Wd[1] * sn) * rs, bz + (U[2] * cu + Wd[2] * sn) * rs, 2, i % 7 === 0 ? HOT : WH, .95 * fa);
        if (i % 2 === 0) K.dotW(bx + (U[0] * cu + Wd[0] * sn) * re, by + (U[1] * cu + Wd[1] * sn) * re, bz + (U[2] * cu + Wd[2] * sn) * re, 1, LIME, .35 * fa);
      }
    }
    const cm = V.mad(ex, d, (c + .5) * cell); K.ringW(cm, U, Wd, r0 * .28 * (1 + c * .1), 48, 2, HOT, fa, c + T); glowR(cm[0], cm[1], cm[2], r0 * .3, HOT, .55 * fa);
  }
  K.lineW(ex[0], ex[1], ex[2], ex[0] + d[0] * L_ * .1, ex[1] + d[1] * L_ * .1, ex[2] + d[2] * L_ * .1, 1.2, 2, HOT, .5 * I, HOT, .04, 0);
}
const ACT_O = { L: [0, 1, 0], occ: true };
function drawEngines(T, Tw, PP) {
  ACT_O.L = L_SUN; ACT_O.fx = fx;
  for (let e = 0; e < 4; e++) {
    const A = PP.act[e];
    // the gimbal actuators: a barrel and a chrome rod; while they stroke (the gimbal check, the trims) the rod's exposed
    // length changes, a lime band rides the gland and the rod glints
    const ga = Math.max(win(T, GCHK[0] - .1, GCHK[1] + .2, .15), .5 * (win(T, BURN[0], BURN[1], .5) + win(T, BURN_B[0], BURN_B[1], .5)));
    if (V.dist(A[0], C.eye) < 1500) for (const [a, b] of [[A[0], A[1]], [A[2], A[3]]]) {
      const L0_ = 9.6, m = V.mad(a, V.norm(V.sub(b, a)), L0_ * .58); ORL.tubeW(a, m, .9, .8, 12, 2, ACT_O); ORL.tubeW(V.lerp(a, m, .96), b, .45, 1 + .8 * ga, 12, 2, ACT_O);
      if (ga > .02) { const dd = V.norm(V.sub(b, a)), [U_, W_] = GEO.perp(dd); K.ringW(m, U_, W_, 1.0, 40, 2, LIME, .9 * ga, e); const st_ = V.dist(m, b); for (let i = 0; i <= 10; i++) { const p_ = V.mad(m, dd, st_ * i / 10); K.dotW(p_[0], p_[1], p_[2], 1, HOT, .5 * ga); } }
    }
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
/* ---------- the hero capacitor module, cut open (P.POI.capHero): its case's outer half and lid taken away, the stack
   inside: 12 electrode plates (each standing for a stack of film, alternately to the + and - terminals) between dielectric layers; as the
   bank charges, charge packets run down from the terminals onto the plates (lime on the +, white on the -), the plates
   light, and the field between them fills with dots (denser as the voltage rises); a gauge on the case. Cached samples,
   thinned with distance ---------- */
const CAPX = (() => {
  const h = P.CAP_HERO, x0 = h[0] - 2.1, y0 = h[1], z0 = h[2] - 1.6, NPL = 12, A = [], rnd = rng(6161);
  // plates (k even +, odd -) at z stations: drawn where the cut lays them open (their top edges across the lid's cut, their
  // outer edges down the side's), with a sparse jittered sheet behind; dielectric (grey) between them on the same faces;
  // the field (lime) between them, shown as charge rises
  const XT = x0 + 3.3, YT = y0 + 5.0, dz = 2.7 / (NPL - 1), J = () => 0;
  for (let k = 0; k < NPL; k++) {
    const z = z0 + .25 + k * dz, typ = k % 2 ? 2 : 1;
    for (const w of [-.03, .03]) { for (let x = x0 + .15; x < XT; x += .04) A.push(x, YT, z + w, typ); for (let y = y0 + .25; y < YT; y += .04) A.push(XT, y, z + w, typ); }
    for (let i = 0; i < 260; i++) A.push(x0 + .15 + rnd() * 3.15, y0 + .25 + rnd() * 4.75, z + J(), typ + 4);
    if (k < NPL - 1) for (let i = 0; i < 160; i++) { const zz = z + dz * (.25 + .5 * rnd()); if (i % 2) A.push(x0 + .15 + rnd() * 3.15, YT, zz, 3); else A.push(XT, y0 + .25 + rnd() * 4.75, zz, 3); }
    if (k < NPL - 1) for (let i = 0; i < 70; i++) { const zz = z + dz * (.2 + .6 * rnd()); if (i % 2) A.push(x0 + .15 + rnd() * 3.15, YT, zz, 0); else A.push(XT, y0 + .25 + rnd() * 4.75, zz, 0); }
  }
  // the case that is left (the inner half: the -x wall, the floor), drawn dim
  for (let i = 0; i < 1400; i++) { A.push(x0, y0 + rnd() * 5.2, z0 + rnd() * 3.2, 4); A.push(x0 + rnd() * 4.2, y0, z0 + rnd() * 3.2, 4); }
  const n = A.length / 4, out = new Float32Array(A.length), ix = []; for (let i = 0; i < n; i++) ix.push(i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = ix[i]; ix[i] = ix[j]; ix[j] = t; }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = A[ix[i] * 4 + k];
  return { P: out, n, x0, y0, z0 };
})();
function drawCapModule(T, Tw) {
  const e = C.eye, c = X.ap(Tw, P.POI.capHero), d = V.dist(e, c); if (d > 700) return;
  const f = capFill(T), M = Tw.R, t = Tw.T, keep = E.clamp((60 / d) ** 2, .05, 1), n = Math.round(CAPX.n * keep), A = CAPX.P, sz = keep > .6 ? 2 : 1;
  const plus = .25 + .9 * f, minus = .2 + .7 * f, fld = f;
  for (let i = 0; i < n; i++) {
    const j = i * 4, x = A[j], y = A[j + 1], z = A[j + 2], k = A[j + 3];
    let col, a;
    if (k === 1 || k === 5) { col = LIME; a = plus * (y > CAPX.y0 + 5 - 5 * Math.min(1, f * 1.4) ? 1 : .35) * (k === 5 ? .3 : 1); }
    else if (k === 2 || k === 6) { col = WH; a = minus * (y > CAPX.y0 + 5 - 5 * Math.min(1, f * 1.4) ? 1 : .35) * (k === 6 ? .3 : 1); }
    else if (k === 3) { if (((i * .618) % 1) > fld) continue; col = LIME; a = .7; }
    else if (k === 0) { col = GRY; a = .55; }
    else { col = WH; a = .28; }
    // (raw dots: the module sits in the deck's open well, inside the hull's occluder)
    if (K.pj(M[0] * x + M[1] * y + M[2] * z + t[0], M[3] * x + M[4] * y + M[5] * z + t[1], M[6] * x + M[7] * y + M[8] * z + t[2])) K.dot(K.PJ[0], K.PJ[1], k === 3 || k > 3 ? 1 : sz, col[0], col[1], col[2], a);
  }
  // charge packets running down the plates from the terminals while it fills
  if (f > 0 && f < 1 && capU(T) < 1) for (let k = 0; k < 12; k++) {
    const z = CAPX.z0 + .25 + k * (2.7 / 11), ph = (T * 1.6 + k * .37) % 1, y = CAPX.y0 + 5 - 4.8 * ph;
    for (let q = 0; q < 5; q++) { const x = CAPX.x0 + .4 + q * .7; P.apTo(RA, Tw, [x, y + q * .1, z]); if (K.pj(RA[0], RA[1], RA[2])) K.dot(K.PJ[0], K.PJ[1], 2, ...(k % 2 ? WH : LIME), .9 * (1 - ph * .5)); }
  }
  // the case's cut edges in lime, the terminals, a gauge bar beside it
  const x0 = CAPX.x0, y0 = CAPX.y0, z0 = CAPX.z0;
  for (const [a_, b_] of [[[x0, y0 + 5.2, z0], [x0 + 4.2, y0 + 5.2, z0]], [[x0 + 4.2, y0, z0], [x0 + 4.2, y0 + 5.2, z0]], [[x0, y0 + 5.2, z0], [x0, y0 + 5.2, z0 + 3.2]], [[x0, y0 + 5.2, z0 + 3.2], [x0 + 4.2, y0 + 5.2, z0 + 3.2]], [[x0 + 4.2, y0, z0 + 3.2], [x0 + 4.2, y0 + 5.2, z0 + 3.2]]]) { P.apTo(RA, Tw, a_); P.apTo(RB, Tw, b_); K.lineW(RA[0], RA[1], RA[2], RB[0], RB[1], RB[2], 1.3, 1, LIME, .85, null, 0, 0); }
  for (let i = 0; i <= 60; i++) { const u = i / 60; P.apTo(RA, Tw, [x0 - .5, y0 + .3 + 4.6 * u, z0 + 1.6]); K.dotW(RA[0], RA[1], RA[2], 2, u < f ? (u > .9 ? HOT : LIME) : WH, u < f ? .95 : .2); }
}
/* ---------- the split and the re-forming: each node in flight trails a comet of swarm (its chords' material), a spark
   as it lets go, a ring of light as each construction ring closes (and as each breaks up on the return) ---------- */
const SPX = P.xf(), SPX2 = [0, 0, 0];
function drawSplitFX(T, PP, Wt) {
  const sc = ST.sc, e = C.eye;
  for (let g = 0; g < 56; g++) {
    const u = sc.u[g]; if (u <= .002 || u >= .998) continue;
    const back = T > CROWN_DONE, [L] = P.SC_MAP[g];
    P.scNode(PP, Wt, ST, g, u, SPX); const d = V.dist(e, SPX.T); if (d > 6000) continue;
    for (let k = 1; k <= 14; k++) {
      const uk = back ? u + k * .012 : u - k * .012; if (uk <= 0 || uk >= 1) break;
      P.scNode(PP, Wt, ST, g, uk, SPX); const T_ = SPX.T;
      for (let q = 0; q < 4; q++) { const j = (hh(g * 31 + k, q) - .5) * (4 + k * 1.2); K.dotW(T_[0] + j, T_[1] + (hh(g + k, q + 5) - .5) * (4 + k * 1.2), T_[2] + (hh(g * 3 + k, q + 9) - .5) * (4 + k * 1.2), k < 3 ? 2 : 1, k < 2 ? HOT : q % 2 ? LIME : WH, .9 * (1 - k / 15)); }
    }
    P.scNode(PP, Wt, ST, g, u, SPX); K.glowW(SPX.T[0], SPX.T[1], SPX.T[2], 12, LIME, .35);
  }
  // let go (build) / let go of the construction ring (return): a burst at each node as it starts
  for (let L = 0; L < NSC; L++) {
    for (const [t0, R_] of [[SPLIT[L][0], 1], [SC_DIS[L], 0]]) {
      const a = T - t0; if (a < 0 || a > 1.2) continue;
      for (let s = 0; s < SC_N[L]; s++) { const g = P.SC_G0[L] + s, tt = a - .045 * s; if (tt < 0 || tt > .8) continue; const N = PP.nodeX[g]; K.glowW(N.T[0], N.T[1], N.T[2], Math.round(20 + 50 * Math.exp(-tt * 5)), R_ ? LIME : HOT, .6 * Math.exp(-tt * 4)); }
    }
    // a construction ring closing (build) or re-forming the stabiliser ring (return): a ring of light
    const zL = sc.z[L];
    if (!isNaN(zL)) for (const t0 of [SC_FORM[L]]) { const a = T - t0; if (a < -.1 || a > 1.4) continue; const g_ = Math.exp(-Math.max(0, a) * 2.4), c = X.ap(Wt, [0, 0, zL]); for (const r of [SC_R[L], SC_R[L] + 4 + 14 * Math.max(0, a)]) K.ringW(c, X.dir(Wt, [1, 0, 0]), X.dir(Wt, [0, 1, 0]), r, 260, 2, LIME, .9 * g_, L); }
  }
  for (let ri = 0; ri < 2; ri++) { const a = T - (REFORM[ri ? 2 : 0][1]); if (a < -.1 || a > 1.6) continue; const g_ = Math.exp(-Math.max(0, a) * 2), c = X.ap(Wt, [0, 0, P.RING_Z[ri]]); K.ringW(c, X.dir(Wt, [1, 0, 0]), X.dir(Wt, [0, 1, 0]), P.RING_R, 900, 2, LIME, .8 * g_, ri); }
}
/* ---------- the collars' locks: the rams driving the jaws, the bite (a ring of light round the joint, sparks off each
   hook), the sleeve's thread lighting as it screws in; the same backwards as they let go on the return ---------- */
const RAM_O = { L: [0, 1, 0], occ: true, fx: null };
function drawLocks(T, PP, Wt) {
  RAM_O.L = L_SUN; RAM_O.fx = fx;
  const e = C.eye, U = X.dir(Wt, [1, 0, 0]), Wv = X.dir(Wt, [0, 1, 0]);
  for (let j = 1; j < NSEG; j++) {
    if (ST.front[2] < j * LSEG + P.COL_L) break;
    const jc = X.ap(Wt, [0, 0, j * LSEG]), d = V.dist(e, jc); if (d > 900) continue;
    const sc = LOCKSC(j), bite = JAWT(j) + .22 * sc, ut = ULOCK_TS[j];
    // the rams: a chrome rod from each housing's end block to its jaw
    if (d < 320) { CUR.k = j; CUR.z = j * LSEG; for (let f = 0; f < 6; f++) { P.apTo(RA, PP.jawH[j][f], [0, P.JAW_Y + 1.05, 8.4]); P.apTo(RB, PP.jaws[j][f], [0, P.JAW_Y + 1.05, 5.0]); if (V.dist(RA, RB) > .2) ORL.tubeW(RA, RB, .32, 1, 15, 0, RAM_O); } }
    // the bite: a ring of light races round the joint, sparks off each hook
    for (const [t0, col] of [[bite, LIME], [ut - 1.6, HOT]]) {
      const a = T - t0; if (a < 0 || a > 1.6) continue;
      const g = Math.exp(-a * 2.6);
      for (const r of [P.COL_R + 1.5, P.COL_R + 3.5 + 10 * a]) K.ringW(jc, U, Wv, r, 220, 2, col, .9 * g, j);
      K.glowW(jc[0], jc[1], jc[2], Math.round(40 + 120 * g), col, .25 * g);
      for (let f = 0; f < 6; f++) {
        P.apTo(RA, PP.jaws[j][f], [0, P.JAW_Y - 1, -.6]);
        for (let i = 0; i < 18; i++) { const th = hh(i, f + j * 7) * TAU, ph = hh(i, f + 3) * PI, v = 4 + 8 * hh(i + 9, f); K.dotW(RA[0] + Math.cos(th) * Math.sin(ph) * v * a, RA[1] + Math.cos(ph) * v * a, RA[2] + Math.sin(th) * Math.sin(ph) * v * a, 2, i % 3 ? col : HOT, Math.exp(-a * 3)); }
      }
    }
  }
}
/* field lines: loops round the chamber coils (chamber shots); frost on the coils at 4.2 K; the clamps' bite */
const FLP = [0, 0, 0];
function drawFields(T, Tw) {
  const coil = ss(COILW[0], COILW[1], T) * (1 - ss(TX, TX + 2, T));
  if (V.dist(C.eye, Tw.T) > 260 && V.dist(C.eye, X.ap(Tw, [0, 0, P.Z_RND])) > 260) return;
  const M = Tw.R, t = Tw.T, at = (x, y, z) => { FLP[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; FLP[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; FLP[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return FLP; };
  if (coil > .02) {
    for (const zc of P.COIL_Z.map(c => (c[0] + c[1]) / 2)) for (let f = 0; f < 16; f++) {
      const ph = f / 16 * TAU, c = Math.cos(ph), s = Math.sin(ph);
      for (const rho of [1.4, 2.3, 3.3]) {
        const n = Math.round(30 + 14 * rho);
        for (let i = 0; i < n; i++) {
          const th = i / n * TAU + T * 2.4 / rho, r = 3.4 + rho * Math.cos(th), z = zc + rho * 2.4 * Math.sin(th);
          if (r < 1.1) continue;
          at(c * r, s * r, z); K.dotW(FLP[0], FLP[1], FLP[2], 1, LIME, coil * (.25 + .3 * (.5 + .5 * Math.sin(th * 3 - T * 6))));
        }
      }
    }
  }
  // frost: crystals grow over the coils as they reach 4.2 K
  const fr = ss(COILW[0] + .2, COILW[1] + 1.5, T) * (1 - ss(TX + 4, TX + 9, T));
  if (fr > .02) for (let i = 0; i < 5200; i++) { if (hh(i, 5) > fr) continue; const cz = P.COIL_Z[hh(i, 6) < .5 ? 0 : 1], zc = cz[0] + (cz[1] - cz[0]) * hh(i, 7), a = hh(i, 8) * TAU, r = 4.45 + .1 * hh(i, 9); at(Math.cos(a) * r, Math.sin(a) * r, zc); K.dotW(FLP[0], FLP[1], FLP[2], 1, WH, (.35 + .65 * hh(i, Math.floor(T * 6))) * (.5 + .5 * fr)); }
  // the clamps' bite: a puff off each jaw
  // (each clamp in turn as it bites: a puff of frost off its jaw, a lime tick)
  for (let k = 0; k < 12; k++) { const pa = T - (CLAMPW[0] + CLAMP_DT * k + .44); if (pa < 0 || pa > 1.6) continue; const t0 = PI / 6 + (k % 6) * PI / 3, z0 = P.CLAMP_Z[k < 6 ? 0 : 1]; for (let i = 0; i < 40; i++) { const a = t0 + (hh(i, k) - .5) * .9, r = 2.4 + pa * (2 + 5 * hh(i, k + 3)), z = z0 + (hh(i, k + 5) - .5) * 2 * (1 + pa); at(Math.cos(a) * r, Math.sin(a) * r, z); K.dotW(FLP[0], FLP[1], FLP[2], pa < .3 ? 2 : 1, WH, .8 * Math.exp(-pa * 2)); } at(Math.cos(t0) * 2.2, Math.sin(t0) * 2.2, z0); K.glowW(FLP[0], FLP[1], FLP[2], 14, LIME, .7 * Math.exp(-pa * 5)); }
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
/* the reconfiguration: each wave's front runs up the barrel as a band of light round the hex, one colour per stage
   (lime: the flaps crack; coral: the cassettes slide out; white-hot: they turn up), with a trailing wash on the bays
   it has just passed */
const FW_COL = [LIME, K.CORAL, HOT];
function drawFlapFronts(T, Tw) {
  for (let i = 0; i < 3; i++) {
    const w = FLW[i], u = (T - w[0]) / (w[1] - w[0] - .8); if (u < 0 || u > 1.05) continue;
    const z = u * (NB - 1) * P.BAYL + 5, a = Math.sin(PI * E.sat(u)) * .9 + .3, col = FW_COL[i];
    for (const r of [P.HR + 1.4 + i * .9, P.HR + 3.2 + i * .9]) for (let k = 0; k < 6; k++) { wpPolar(Tw, r, k * PI / 3, z, RA); wpPolar(Tw, r, (k + 1) * PI / 3, z, RB); K.lineW(RA[0], RA[1], RA[2], RB[0], RB[1], RB[2], 1.3, 2, col, a, col, .06, 0); }
    for (let k = 0; k < 6; k++) { wpPolar(Tw, P.HR + 4, k * PI / 3, z, RA); K.glowW(RA[0], RA[1], RA[2], 16, col, .35 * a); }
    for (let j = 1; j <= 8; j++) { const zz = z - j * 4.5; if (zz < 0) break; for (let k = 0; k < 6; k++) { wpPolar(Tw, P.HR + 2.2, k * PI / 3 + PI / 6, zz, RA); K.dotW(RA[0], RA[1], RA[2], 2, col, a * (1 - j / 9) * .8); } }
  }
}
/* the hero bay (HB): its magnets frosting as they reach 4.2 K (crystals growing over the nine tubes, a cold breath off
   them), the flaps' hinge pins sparking as they swing, a ring of light round the bay as each stage finishes */
function drawHeroBay(T, PP) {
  if (T < HBF[0] - .5 || T > FLW[0][0] + 1.5) return;
  const Tb = PP.bay[HB], d = V.dist(C.eye, X.ap(Tb, [0, 0, 5])); if (d > 260) return;
  const fr = kb(T, HBM), U = X.dir(Tb, [1, 0, 0]), Wv = X.dir(Tb, [0, 1, 0]);
  if (fr > .01) for (let m = 0; m < P.NMAG; m++) {
    const am = PI / 2 + m * TAU / P.NMAG, cx = Math.cos(am) * P.MAG_RC, cy = Math.sin(am) * P.MAG_RC, um = (fr * 1.4 - m * .05);
    for (let i = 0; i < 520; i++) {
      if (hh(i, m + 40) > um) continue;
      const t = hh(i, m + 41) * TAU, z = hh(i, m + 42) * P.BAYL, r = P.MAG_R * (1.02 + .08 * hh(i, m + 43));
      P.apTo(RA, Tb, [cx + Math.cos(t) * r, cy + Math.sin(t) * r, z]); K.dotW(RA[0], RA[1], RA[2], 1, WH, (.5 + .5 * hh(i, Math.floor(T * 8) + m)) * Math.min(1, fr * 2));
    }
    // the cold breath: a few drifting crystals off each tube while it cools
    const br = win(T, HBM[0] + m * .1, HBM[1] + .6, .4);
    if (br > .01) for (let i = 0; i < 40; i++) { const a = (T - HBM[0]) * .6 + hh(i, m), t = hh(i, m + 7) * TAU, s = 1.4 + 2.5 * ((a + hh(i, m + 9)) % 1); P.apTo(RA, Tb, [cx + Math.cos(t) * s, cy + Math.sin(t) * s, hh(i, m + 11) * P.BAYL]); K.dotW(RA[0], RA[1], RA[2], 1, WH, .5 * br * (1 - ((a + hh(i, m + 9)) % 1))); }
    if (um > .98 && um < 1.15) { P.apTo(RA, Tb, [cx, cy, 5]); K.ringW(RA, U, Wv, P.MAG_R * 1.5, 40, 2, LIME, .9 * (1.15 - um) / .17); }
  }
  for (const w of [HBF, HBC, HBT, HBM]) { const a = T - w[1]; if (a > 0 && a < 1.2) { const g = Math.exp(-a * 3); for (const z of [0, P.BAYL]) K.ringW(X.ap(Tb, [0, 0, z]), U, Wv, P.HR + 1 + 4 * a, 160, 2, w === HBM ? WH : LIME, .8 * g, z); } }
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
/* the detach, at three-quarters from ahead and to port (the ring an ellipse, not an edge): the dock's arms swing back,
   the construction ring's rim spins up, the six prow lasers reach across to its receivers (the beams seen landing) */
const CRDK = PO.crDock;
const SH_DETACH = KP([
  K_(CRU[0] - .4, [-250, 130, 190], [0, 0, CRDK[2] - 10], 46, { uy: .6 }),
  K_(CRL[0] - .3, [-176, 104, 150], [-20, 14, CRDK[2] - 14], 40, { uy: .7 }),
  K_(CRL[1], [-164, 98, 140], [-16, 12, CRDK[2] - 8], 40, { uy: .7 }),
], FRP);
/* the build (x60) by the train: the guide ring (CR) in front, the five construction rings behind it (ring L at
   crZ - SC_LEAD - SC_GAP L, each laying its own layer 8 m behind itself). One move per event:
     FLY    side-on to the hull, high: the stabiliser rings break into arcs and their nodes fly forward along the hull
            to the forming point, curling into the five rings one after another; in toward the prow as the last forms;
     AHEAD  ahead of the guide ring and to port, looking back at the train leaving the prow;
     HERO1  riding with the train into the 20 m gap between rings 2 and 3 (inside their circle, r ~ 48: clear of the
            nodes at r 60) as the train slows for collar 1: the lock at ~45 m, the frame and cassette rings either side;
            back out radially (never through a ring's plane);
     DOLLY  outside the rings (r ~ 95), slowly down the train from ring 4 to ring 0 (~9 m/s past it): each ring at
            work, tagged as the lens passes it (collar 2 locks on the way);
     HERO3  above the barrel outside the rings' radius as the train slows for collar 3 (the rings sliding by below);
     WIDE   ~8 s from far to port: the whole gun, the five rings building at once;
     MUZ    ahead of the guide ring outside its rim, round outside the rims to behind the train past the muzzle
            stages, settling above the crown (outside the rings' radius: they pass under, then drop back past it) as
            the iris closes;
     PULL   back and up as the five rings drop back to their stations along the finished barrel */
const BL = BUILD[1] - BUILD[0];
const B1 = [BUILD[0] - 1.2, BUILD[0] + .17 * BL];
const ride = (T, e, g, fov, uy) => { const z = crZ(T), Wt = platAt(T), s = lookAt(X.ap(Wt, [e[0], e[1], z + e[2]]), X.ap(Wt, [g[0], g[1], z + g[2]]), fov); if (uy) s.up = V.norm(V.lerp(s.up, X.dir(Wt, YW), uy)); return s; };
const COLZ = k => k * LSEG, CZ = t => crZ(t);
const RZ_ = L => -SC_LEAD - SC_GAP * L;                    // ring L's z relative to the guide ring (build)
const FLY0 = SPLIT[0][0], FLY1 = SC_FORM[4];
const SH_FLY = KP([
  K_(FLY0 + 1.0, [-430, 270, -170], [0, -10, -170], 46, { uy: .5 }),
  K_(FLY0 + 5.2, [-380, 230, -120], [0, -6, -110], 46, { uy: .5 }),
  K_(FLY1 + .4, [-250, 150, -10], [0, 0, 0], 46, { uy: .5 }),
  K_(FLY1 + 2.6, [-220, 128, 50], [0, 0, 80], 46, { uy: .5 }),
], FRP);
const SH_AHEAD = T => { const u = kk(T, B1[0], B1[1]); return ride(T, [-70 + 16 * u, 74 - 10 * u, 190 - 30 * u], [0, -10, -260], 50, .6); };
/* HERO1: the eye's z rides with the train (between rings 2 and 3), its distance off the axis keyed; the look on the
   collar (fixed in the platform) */
const H1 = LOCKC(1), H1Z = (RZ_(2) + RZ_(3)) / 2;
const H1R = KP([
  K_(H1 - 5.2, [-110, 56, 0], [0, 0, 0], 46),
  K_(H1 - 1.2, [-44, 26, 0], [0, 0, 0], 46),
  K_(H1 + 2.6, [-40, 24, 0], [0, 0, 0], 44),
  K_(H1 + 5.2, [-100, 46, 0], [0, 0, 0], 46),
], null);
function SH_HERO1(T) {
  const k = H1R(T), Wt = platAt(T), z = crZ(T) + H1Z, eye = X.ap(Wt, [k.eye[0], k.eye[1], z]);
  const tg = X.ap(Wt, [0, 6, COLZ(1) + 2]);
  const s = lookAt(eye, tg, k.fov / DEG); s.up = V.norm(V.lerp(s.up, X.dir(Wt, YW), .8)); return s;
}
/* DOLLY: from beside ring 4 to beside ring 0 (DL), outside their radius; the look a little ahead, in at the bore */
const DL = [H1 + 4.6, LOCKC(3) - 3.2];
const dollyZ = T => RZ_(4) - 6 + (RZ_(0) - RZ_(4) + 10) * kk(T, DL[0], DL[1]);
const SH_DOLLY = T => { const z = dollyZ(T); return ride(T, [-150, 64, z], [0, 2, z + 16], 40, .6); };
const DOLLY_T = L => { let lo = DL[0], hi = DL[1]; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (dollyZ(m) < RZ_(L)) lo = m; else hi = m; } return lo; };
const H3 = LOCKC(3);
const SH_HERO3 = KP([
  K_(H3 - 2.2, [-56, 76, COLZ(3) - 34], [0, 8, COLZ(3) + 4], 46, { uy: .8 }),
  K_(H3 + 3.6, [-50, 72, COLZ(3) - 26], [0, 8, COLZ(3) + 8], 44, { uy: .8 }),
], FRP);
const WD0 = H3 + 3.2, WD1 = LOCKC(5) - 4.2 + 4.5;
const SH_WIDE = T => { const Wt = platAt(T), v = kk(T, WD0, WD1), z = crZ(T); return lookAt(X.ap(Wt, [-480 + 30 * v, 260 - 20 * v, z - 130 + 30 * v]), X.ap(Wt, [0, -30, z - 110]), 44); };
const M0 = LOCKC(5) - 2.6, CRP = CROWN_DONE + .6;
const SH_MUZ = KP([
  K_(M0, [-160, 76, CZ(M0) + 70], [0, 0, CZ(M0) - 50], 44),
  K_(M0 + 5, [-166, 74, CZ(M0 + 5) + 20], [0, 0, CZ(M0 + 5) - 60], 42),
  K_(M0 + 9.4, [-150, 84, CZ(M0 + 9.4) - 90], [0, 2, CZ(M0 + 9.4) - 90], 40),
  K_(CROWN_DONE - 1.6, [-96, 92, Z_MZ - 50], [0, 3, Z_MZ - 4], 34),
  K_(CROWN_DONE + .6, [-90, 90, Z_MZ - 34], [0, 3, Z_MZ], 30),
  K_(CROWN_DONE + 3.0, [-88, 88, Z_MZ - 30], [0, 3, Z_MZ + 4], 30, { stop: true }),
], FRP);
const SH_PULL = KP([
  K_(CROWN_DONE + 2.4, [-88, 88, Z_MZ - 31], [0, 3, Z_MZ + 3], 30),
  K_(PARKM[1] + 1.0, [-200, 170, 860], [0, -10, 640], 44),
  K_(CAL[0] - 4.0, [-260, 220, 700], [0, -10, 520], 44),
], FRP);
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
/* the reroute, following the current: from aft of the starboard well, the engine feeds draining away under the lens,
   down onto the four rotary switches as they turn and arc, then moving forward up the gun bus behind the current's
   front as it floods up the barrel (the look leads it, so the turn stays slow) */
const SWC = PO.switchyard, CAPS = PO.caps;
const SW_E0 = [SWC[0] + 56, SWC[1] + 92, SWC[2] - 170], SW_E1 = [SWC[0] + 44, SWC[1] + 66, SWC[2] - 96], SW_E2 = [30, 44, -10];
const SW_G0 = [0, SWC[1] - 6, SWC[2] + 10], SW_G1 = [0, SWC[1], SWC[2] - 4];
/* ... and between the two, the cut-open bank module (P.POI.capHero) as the wheels' current starts filling it */
const CAPH = PO.capHero || CAPS, SW_EB = [CAPH[0] + 40, CAPH[1] + 30, CAPH[2] - 34];
function SH_SW(T) {
  const Wt = platAt(T), a = kk(T, SWW[0] - .6, SWW[0] + 1.6), b = kk(T, SWW[1] - .6, SWW[1] + 1.0), c = kk(T, SWW[1] + .9, SWW[1] + 4.4), ce = kk(T, SWW[1] + 2.2, GUNP[1] + 1.4);
  const e = V.lerp(V.lerp(V.lerp(SW_E0, SW_E1, a), SW_EB, b), SW_E2, ce);
  const z0 = e[2] + 120, tz = z0 + (Z_MZ * .32 - z0) * kk(T, SWW[1] + 1.0, GUNP[1] + .4), G2 = [0, 8, tz];
  // (the look turns between the targets' directions: a lerp of the points would swing past the lens)
  const E_ = X.ap(Wt, e), up = X.dir(Wt, YW), L_ = p => { const s = lookAt(E_, X.ap(Wt, p), 48); s.up = up; return s; };
  return mixShot(mixShot(mixShot(L_(SW_G0), L_(SW_G1), a), L_(CAPH), b), L_(G2), c);
}
/* the reconfiguration: one bay (HB) close up at ~20 m as its flaps hinge open, its cassettes slide out and turn up and
   its magnets frost; then back and up as the three waves run breech to muzzle */
const HBP = PO.heroBay || [6, 9, HB * P.BAYL + 5], HBE = PO.heroBayEye || [HBP[0] + 14, HBP[1] + 12, HBP[2] - 12];
const SH_BAY = KP([
  K_(HBF[0] - .2, HBE, HBP, 44, { uy: 1 }),
  K_(HBT[0], V.add(HBE, [2, 1, -2]), V.add(HBP, [0, -1, 0]), 44, { uy: 1 }),
  K_(HBM[1], V.add(HBE, [5, 4, -5]), HBP, 44, { uy: 1 }),
], FRP);
const SH_FLAPS = KP([
  K_(FLW[0][0] + .4, [HBP[0] + 36, HBP[1] + 28, HBP[2] - 46], [0, 4, 180], 48, { uy: 1 }),
  K_(FLW[1][0] + .6, [52, 34, -30], [0, 2, 230], 48, { uy: 1 }),
  K_(FLW[2][1], [46, 28, -40], [0, 2, 70], 46, { uy: 1 }),
], FRP);
/* the breech: the lock rings release and the block drops, in X-ray; at rest at the splice */
const SH_BREECH = KP([
  K_(UNLK[0] - .8, [40, 16, -44], [0, -2, -16], 46, { uy: 1 }),
  K_(AT_FAB, [30, 10, -34], [0, -3, -15], 46, { uy: 1, stop: true }),
], FRP);
/* the chamber (X-ray), a slow drift from step to step, always outside the housing (r > 26): the block rises, the lock
   rings turn home, the clamps bite, the coils frost */
const SH_CHAMBER = KP([
  K_(AT_FAB, [30, 10, -34], [0, -3, -15], 46, { uy: 1 }),
  K_(BRC[1], [28, 6, -32], [0, -2, -14], 46, { uy: 1 }),
  K_(LOCKW[1], [26, 12, -24], [0, 1, -13], 46, { uy: 1 }),
  K_(CLAMPW[1], [25, 11, -12], [0, 0, -6], 46, { uy: 1 }),
  K_(COILW[1], [27, 14, -4], [0, 0, -6], 46, { uy: 1 }),
], FRP);
/* the charge: out of the chamber radially (never through the housing's walls), up over the barrel as the rings light
   breech to muzzle, down to the fire spot on the far side just ahead of the housing, the muzzle (the iris) in view */
const FSX = -40;
const SH_CHARGE = KP([
  K_(COILW[1], [27, 14, -4], [0, 0, -6], 46, { uy: 1 }),
  K_(COILW[1] + 1.2, [28, 18, -2], [0, 0, 10], 46, { uy: 1 }),
  K_(CH0 + .6, [27, 28, 1], [0, 0, 60], 47, { uy: 1 }),
  K_(CH0 + 1.6, [24, 36, 4], [0, 0, 170], 48, { uy: 1 }),
  K_(CH0 + 3.0, [8, 44, -6], [0, 0, 320], 50, { uy: 1 }),
  K_(TF - .6, [FSX, 18, Z_CH + 16], [0, 0, Z_CH + 190], 50, { uy: 1, stop: true }),
], FRP);
/* the fire: the camera rides with the round (in its frame: the platform's until it leaves, then the rod's), turning
   from the muzzle onto it and staying on it, the round centred, seen in X-ray through the barrel's open bays as each
   ring discharges into it; out of the muzzle beside it (the clock slowest there) and on behind it for the FX hand-in */
const SIDE = V.norm(V.cross(DIRP, EY)), UPD = V.norm(V.cross(SIDE, DIRP));
const T_ON = TX + 4.8;
const RIDE = KP([
  K_(TF, [FSX, 18, 16], [0, 0, 190], 50),
  K_(TF + 1.2, [-38, 17, 12], [0, 0, 100], 50),
  K_(TF + 2.4, [-34, 14, 6], [0, 0, 40], 49),
  K_(TF + 3.6, [-31, 12, 2], [0, 0, 14], 48),
  K_(TF + 4.8, [-28, 11, -1], [0, 0, 2], 47),
  K_(TX, [-19, 8, -5], [0, 0, 2], 44),
  K_(TX + 1.6, [-14, 6, -6], [0, 0, 4], 42),
  K_(T_ON - 1.6, [-10, 5, -15], [0, 0, 18], 48),
], null);
const rodLocal = T => Z_CH + BLEN * E.sat((T - TF) / TR_D) ** 2;
function SH_FIRE(T) {
  const k = RIDE(T), oe = k.eye, og = V.mad(k.eye, k.f, k.d);
  let eye, tg, up;
  if (T <= TX) { const Wt = platAt(T), zr = rodLocal(T); eye = X.ap(Wt, [oe[0], oe[1], zr + oe[2]]); tg = X.ap(Wt, [og[0], og[1], zr + og[2]]); up = X.dir(Wt, YW); }
  else { const p = rodAt(T), ax = X.dir(W1, [1, 0, 0]), ay = X.dir(W1, YW), at = o => V.add(p, V.add(V.mul(ax, o[0]), V.add(V.mul(ay, o[1]), V.mul(DIRP, o[2])))); eye = at(oe); tg = at(og); up = ay; }
  const s = lookAt(eye, tg, 50, up); s.fov = k.fov; return s;
}
/* fallbacks for the fall and the strike (the FX module films them: FX.cam) */
const UPH = V.norm(V.sub(HIT, CE));
function camGround(T) { const a = Math.max(0, aOf(T)); return lookAt(GCAM, V.add(HIT, V.mul(UPH, 80 + FX.capH(a) * .5)), 36); }
/* the climb back (REST: the FX camera at T_RET, the crater from ~700 m, read once after load), flown backwards: the
   eye climbs the trail (in the aimed platform's frame the fall line is +Z: the crater at z ~ Z_MZ + 447 km) still
   looking down it at the crater, so the crater, the column and the trail (a line from beside the lens down to them)
   stay the subject while they shrink; paced in log distance from the crater at first and from the platform at the
   end, and kept beside the trail (its offset grows with the distance from both ends: the trail at ~8 deg, never
   end-on; >= 170 m off the bore past the ring and the muzzle). Over the last ~1.5 km the parked ring, then the
   barrel and the ship slide into the frame from behind the lens and it settles behind the prow, looking up the
   barrel at the ring and the Earth beyond: the unbuild is filmed from there */
const E_ARR_L = [150, 110, -150], C_ARR_L = [0, 0, 700], E_ARR = PW1(E_ARR_L), C_ARR = PW1(C_ARR_L);
const W1o = PW1([0, 0, 0]), W1x = V.sub(PW1([1, 0, 0]), W1o), W1y = V.sub(PW1([0, 1, 0]), W1o), W1z = V.sub(PW1([0, 0, 1]), W1o);
const toW1 = p => { const q = V.sub(p, W1o); return [V.dot(q, W1x), V.dot(q, W1y), V.dot(q, W1z)]; };
let REST = null, CLB = null;
const rest = () => REST || toCam(camGround(T_RET - .001));
function climbSetup() {
  const s0 = fromCam(rest()), e0 = toW1(s0.eye), L = e0[2] - E_ARR_L[2], a = 250, b = 1100;
  const g = p => Math.log(1 + p / a) - Math.log(1 + (L - p) / b);
  const m0 = Math.hypot(e0[0], e0[1]), m1 = Math.hypot(E_ARR_L[0], E_ARR_L[1]);
  let f0 = Math.atan2(e0[1], e0[0]), f1 = Math.atan2(E_ARR_L[1], E_ARR_L[0]); f1 = f0 + Math.atan2(Math.sin(f1 - f0), Math.cos(f1 - f0));
  CLB = { r: !!REST, s0, e0, L, g, g0: g(0), g1: g(L), m0, m1, f0, f1 };
}
const CLIMB_W = u => u * u * (3 - 2 * u);                              // eased at both ends
function climbEye(T) {
  if (!CLB || (REST && !CLB.r)) climbSetup();
  const B = CLB, u = E.sat((T - T_RET) / (T_ARR - T_RET)), gt = B.g0 + (B.g1 - B.g0) * CLIMB_W(u - .55 * Math.sin(TAU * u) / TAU);     // (quick through the empty middle)
  let lo = 0, hi = B.L; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (B.g(m) < gt) lo = m; else hi = m; }
  const p = (lo + hi) / 2, v = p / B.L, z = B.e0[2] - p;
  const mb = Math.exp(Math.log(B.m0) + (Math.log(B.m1) - Math.log(B.m0)) * v), m = Math.hypot(mb, .15 * p * (B.L - p) / B.L);
  const f = B.f0 + (B.f1 - B.f0) * ss(0, 1, v);
  return { e: PW1([Math.cos(f) * m, Math.sin(f) * m, z]), u };
}
function SH_CLIMB(T) {
  const { e: eye, u } = climbEye(T), B = CLB;
  // (down the trail with the strike shot's up carried over, so the turn off the crater shot hardly rolls)
  // (aimed 20 km beyond the crater along the trail: the look stays nearly fixed while the eye leaves the crater fast;
  // the crater sits a few degrees off centre)
  const tgD = V.mad(HIT, DIRP, 20000), fd = V.norm(V.sub(tgD, eye)), u0 = V.sub(B.s0.up, V.mul(fd, V.dot(B.s0.up, fd)));
  let s = mixShot(B.s0, lookAt(eye, tgD, 44, V.len(u0) > .05 ? V.norm(u0) : null), ss(0, .55, u));
  s = mixShot(s, lookAt(E_ARR, C_ARR, 46), ss(.6, 1, u));
  return { eye, f: s.f, up: s.up, fov: s.fov, d: K.logMix(Math.min(V.dist(eye, HIT), 5000), V.dist(E_ARR, C_ARR), ss(.6, 1, u)) };
}
/* the unbuild, looking up the barrel from the prow end: a short hold (flaps closing, power back to the engines, the
   ring parked far beyond the muzzle), then up the barrel toward the ring as it starts back, and riding ahead of it
   (UNB_LOOK), backing off slower than it comes: the barrel shortens toward the lens, its parts streaming into the
   ring, the collars unlocking in turn as it reaches them; then out to starboard (wide of its rim) as it runs on to the
   prow and docks */
const ULK = typeof UNB_LOOK !== 'undefined' ? UNB_LOOK : [UNB[0] + 1.5, UNB[0] + 15];
const SH_RET = KP([
  K_(T_ARR, E_ARR_L, C_ARR_L, 46),
  K_(T_ARR + 2.4, [146, 106, -126], [0, 0, 720], 46),
  K_(ULK[0] - .6, [84, 54, CR_PARK - 640], [0, 0, CR_PARK - 40], 46, { stop: true }),
], FRP);
const UNB_D = T => 640 + (150 - 640) * kk(T, ULK[0] - 1, ULK[1]);
const D0 = ULK[1] + .6;
const SH_UNB = T => { const w = kk(T, ULK[1] - 3, D0); return ride(T, [84 + 76 * w, 54 + 26 * w, -UNB_D(T)], [0, 0, -30], 46, 0); };
const SH_DOCK = KP([
  K_(D0, [160, 80, CZ(D0) - 150], [0, 0, CZ(D0) - 30], 46),
  K_(CRK[0] - 1.2, [230, 150, 120], [0, 0, -120], 46),
  K_(CRK[1], [250, 170, 90], [0, 0, -180], 46),
], FRP);
/* the stow: riding with the ship as the rings turn it back to its park and spin down, the fins closing, the lights
   dying stern to prow; up and over into the opening */
const SH_STOW = KP([
  K_(CRK[1], [250, 170, 90], [0, 0, -180], 46),
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
  [FLY0, 3.4, SH_FLY, ANC([0, 0, -120])],
  [H1 - 5.8, 4.6, SH_HERO1, CRA],
  [H1 + 5.0, 2.6, SH_DOLLY, CRA],
  [H3 - 3.6, 3.0, SH_HERO3, ANC([0, 0, COLZ(3)])],
  [WD0, 6.0, SH_WIDE, CRA],
  [LOCKC(5) - 4.2, 4.5, SH_MUZ, CRA],
  [CROWN_DONE + 2.2, 3.6, SH_PULL, ANC([0, 0, Z_MZ])],
  [CAL[0] - 7.5, 8.2, SH_CAL, ANC(P.LZ.emit)],
  [SWW[0] - 2.4, 3.6, SH_SW, ANC(SWC)],
  [HBF[0] - .8, 2.2, SH_BAY, ANC(HBP)],
  [HBM[1] - .6, 3.0, SH_FLAPS, ANC(HBP)],
  [UNLK[0] - 1.6, 2.2, SH_BREECH, null],
  [AT_FAB, 0, SH_CHAMBER, null],
  [COILW[1], 0, SH_CHARGE, null],
  [TF - .6, 0, SH_FIRE, null],
  [T_RET - .1, 0, SH_CLIMB, null],
  [T_ARR, 0, SH_RET, null],
  [ULK[0] - 1.8, 3.0, SH_UNB, CRA],
  [D0 - .4, 2.4, SH_DOCK, CRA],
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
   the windows follow the shots that show the parts. fr(PP) the part's frame (null: the platform's), at its point.
   Placement: the side (label left or right of its anchor, toward the screen's middle) is chosen once, from where the
   anchor is 0.35 s after the tag appears (the base camera then), and kept; the label rides on the mean of the anchor's
   positions over the last 1 s (its screen speed low-passed: the leader takes up the difference); it is kept on
   screen rather than hidden. Ids are numbered in order of appearance. */
const TAG_MIN = 3.6;
const nearA = (n, a0, step) => ((Math.round((a0 - (step || 0)) / (TAU / n)) % n) + n) % n;
const FIN_TAG = nearA(P.NFIN, P.CUT_A + .5), DRUM_TAG = P.DRUMS.length ? P.DRUMS.reduce((b, t, k) => Math.abs(Math.atan2(Math.sin(t - P.CUT_A), Math.cos(t - P.CUT_A))) < Math.abs(Math.atan2(Math.sin(P.DRUMS[b] - P.CUT_A), Math.cos(P.DRUMS[b] - P.CUT_A))) ? k : b, 0) : 0;
const ALN_TAG = P.ALN.reduce((b, t, k) => Math.cos(t - 2.4) > Math.cos(P.ALN[b] - 2.4) ? k : b, 0);
const CUTM = (r, dz) => [Math.cos(P.CUT_A) * r, Math.sin(P.CUT_A) * r, PO.cut[2] + (dz || 0)];
const RSF = ri => Q => Q.rings[ri].C, RSP = th => [Math.cos(th) * P.RING_R, Math.sin(th) * P.RING_R, 0];
const W_ = (t0, n) => [t0, t0 + Math.max(TAG_MIN, n || TAG_MIN)];
const RPM_ = (w, f) => Math.round(w * 60 / TAU * (f === undefined ? 1 : f));
const WHEEL_RPM = typeof RPM_W !== 'undefined' ? RPM_W : 3000;
const HBQ = Q => Q.bay[HB];
const PTAGS = [
  ['core', 'THERMOELECTRIC CORE', `Ø ${Math.round(2 * P.CORE_R)} M`, null, CUTM(P.CORE_R * .55, 18), ...W_(XRJ[1] - .3)],
  ['drums', 'CONTROL DRUMS', 'TURNING', null, CUTM(P.DRUM_RC, -12), ...W_(DRUMW[0] + .6)],
  ['couples', `SEEBECK COUPLES ×${P.NCP * P.CP_ROWS}`, 'IN SERIES', null, CUTM((P.HS_R + P.CS_R) / 2, -14), ...W_(CURW[0] + .4, 4.2)],
  ['shoes', 'HOT SHOE → COLD SHOE', 'ΔT 760 K', null, CUTM((P.HS_R + P.CS_R) / 2, 22), ...W_(CURW[0] + 2.6)],
  ['fins', `RADIATOR FINS ×${P.NFIN}`, `${P.NFP} PANELS · ${Math.round(P.NFP * P.FPW)} M`, Q => Q.fins[FIN_TAG * P.NFP + P.NFP - 1], [P.FPW * .5, 0, 32], ...W_(FINW[0] + .8, FINW[1] - FINW[0] + .6)],
  ['pumps', 'COOLANT PUMPS', 'CYCLING', null, PO.pumps, ...W_(XRJ[2] - 3.4)],
  ['rings', `STABILISER RINGS ×2 · Ø ${Math.round(2 * P.RING_R)} M`, `COUNTER-ROTATING · ${RPM_(OMEGA_R)} RPM`, RSF(0), RSP(2.6), ...W_(RSPW[0] + .6)],
  ['wheels', `MOMENTUM WHEELS ×${2 * P.NRN} · ENERGY STORE`, `${WHEEL_RPM} RPM · 1.2 TJ`, RSF(1), RSP(2.3), ...W_(ARC0 + .4)],
  ['engine', 'MAIN ENGINE ×4', 'GIMBAL ±12°', Q => Q.bells[1], [0, 0, -14], ...W_(ENGX[0] - .2)],
  ['tilt', 'SCISSOR TILT', 'THE RINGS TURN THE SHIP', RSF(0), RSP(2.7), ...W_(SLEW[0] + 3.2, 4.4)],
  ['cr', `GUIDE RING · Ø ${Math.round(2 * P.CR_R)} M`, `${RPM_(OMEGA_CR)} RPM`, Q => Q.cr.F, [-P.CR_R * .72, P.CR_R * .72, 0], ...W_(CRU[0] - .2, 4.6)],
  ['lasers', 'ALIGNMENT LASERS ×6', 'LOCKING', null, null, ...W_(CRL[0], CRL[1] - CRL[0] + .8)],
  ['swarm', 'NANOBOT SWARMS ×24', 'BUILDING THE BARREL', null, null, ...W_(BUILD[0] + 2.4, 4.4)],
  ['form', `CONSTRUCTION RINGS ×${NSC}`, `FROM THE STABILISER RINGS' NODES`, null, [0, SC_R[0], Z_F], ...W_(SC_FORM[0] - .4, 4.0)],
  ['col1', `COLLAR 1 · LOCK JAWS ×6`, 'LOCKED', Q => Q.colS[1], [3.4, 14.4, 0], ...W_(LOCKC(1) - .3)],
  ...[4, 3, 2, 1, 0].map(L => [`sc${L}`, `RING ${L + 1} · ${['LINER PIPE', 'MAGNET TUBES ×9', 'HEX FRAME · COLLARS', 'PULSE CASSETTES', 'SKIN FLAPS'][L]}`, `${SC_N[L]} NODES · Ø ${Math.round(2 * SC_R[L])} M`, null, null, ...W_(DOLLY_T(L) - 1.4)]),
  ['col3', `COLLAR 3 · LOCK JAWS ×6`, 'LOCKED', Q => Q.colS[3], [3.4, 14.4, 0], ...W_(LOCKC(3) - .3)],
  ['col2', `COLLAR 2 · BORE SLEEVE`, 'SCREWED IN', Q => Q.colS[2], [3.4, 14.4, 0], ...W_(LOCKC(2) - .3)],
  ['tel', `MUZZLE STAGES ×${P.NTEL}`, '+100 M', null, null, ...W_(TELW[0] + .4)],
  ['crown', 'CROWN · IRIS', '6 PETALS', Q => Q.crown, [0, 5.6, 4.6], ...W_(CROWN_DONE - .2)],
  ['emit', 'LASER EMITTER · TOWER', 'ALIGNMENT LINE', null, P.LZ.emit, ...W_(CAL[0] - 2.4, 3.8)],
  ['mirror', 'MIRROR · PROW', '', null, P.LZ.prow, ...W_(LOCK_T[2] - .6)],
  ['sens', `COLLAR SENSORS ×${NSEG - 1}`, 'LOCKING', null, null, ...W_(SENS_T(1) - .6, SENS_T(NSEG - 1) - SENS_T(1) + 1.2)],
  ['switch', 'ROTARY SWITCH ×4', 'ENGINES → GUN', Q => Q.switches[0], [0, 0, 0], ...W_(SWW[0] + .2)],
  ['caps', 'CAPACITOR BANK · CUT OPEN', 'FED BY THE WHEELS', null, PO.capHero || PO.caps, ...W_(SWW[1] - .3)],
  ['crew', 'CREW ×2 · AIRLOCK', '1.8 M', null, PO.crew, ...W_(SWW[1] + .1)],
  ['hbflap', `BAY ${HB} · SKIN FLAPS ×6`, 'HINGING OPEN', HBQ, [7, 10, 3], ...W_(HBF[0] + .1)],
  ['hbcas', 'PULSE CASSETTES ×6', 'SLIDING OUT · TURNING UP', HBQ, [5, 6.5, 6], ...W_(HBC[0] + .2, HBT[1] - HBC[0] + .2)],
  ['hbmag', 'MAGNET TUBES ×9', 'SUPERCONDUCTING · 4.2 K', HBQ, [3.4, 4.6, 8], ...W_(HBM[0] - .4, HBM[1] - HBM[0] + 1.6)],
  ['flaps', 'SKIN FLAPS ×540', 'CRACKED', Q => Q.bay[9], [6, 9, 5], ...W_(FLW[0][0] + .2)],
  ['cas', 'PULSE CASSETTES ×540', 'OUT · TURNED UP', Q => Q.bay[12], [4, 12, 5], ...W_(FLW[1][0] + .4)],
  ['block', 'BREECH BLOCK', 'DROPPING 5.6 M', Q => Q.block, [0, 2.4, -14.6], UNLK[0] - 2.0, AT_FAB],
  ['locks', 'LOCK RINGS ×3', 'TURNING 30°', Q => Q.locks[2], [0, 3.4, 0], ...W_(BRC[1] - .2)],
  ['clamps', 'CLAMPS ×12', 'BITING', Q => Q.clamps[1], [1.4, 0, 0], ...W_(CLAMPW[0] - .2)],
  ['coils', 'CHAMBER COILS', '4.2 K', null, [0, 4.4, -9], ...W_(COILW[0])],
  ['crings', 'CHARGE RINGS ×198', 'BREECH → MUZZLE', Q => Q.bay[14], [3.7, 2, 2.5], ...W_(CH0 + .2)],
  ['iris', 'MUZZLE IRIS · 6 PETALS', 'OPENING', Q => Q.crown, [0, 5.6, 4.6], Math.min(IRIS[0] - 1.6, TF - TAG_MIN), TF - .1],
].map(([k, lab, val, fr, at, t0, t1]) => ({ k, lab, val, fr, at, t0, t1, tg: K.mkTag(), side: 0, pl: [0, 0, 0] }))
  .sort((a, b) => a.t0 - b.t0);
PTAGS.forEach((t, i) => { t.id = String(i + 1).padStart(2, '0'); t.seed = i + 1; });
for (const t of PTAGS) if (t.t1 - t.t0 < 3.1) LOG.push(`tag ${t.k} holds ${(t.t1 - t.t0).toFixed(1)} s`);
window.ORTAGS = PTAGS;           // (dev: the part tags' windows and state)
function tagPoint(t, T, PP) {
  if (t.k === 'sens') {
    // the next collar sensor ahead of the laser's head, sliding from one to the next
    let k = 1; while (k < NSEG - 1 && T > SENS_T(k) + .5) k++;
    const u = kk(T, SENS_T(Math.max(1, k - 1)) + .5, SENS_T(k) + .2), a1 = X.ap(PP.colS[k], [0, P.BEAM_Y, 1.1]);
    let n = 0; for (let j = 1; j < NSEG; j++) if (T > SENS_T(j) + .5) n++;
    t.v2 = `${n}/${NSEG - 1} LOCKED`;
    return k > 1 ? V.lerp(X.ap(PP.colS[k - 1], [0, P.BEAM_Y, 1.1]), a1, u) : a1;
  }
  if (t.k === 'lasers') { const e = PP.align.e[ALN_TAG]; return [e[0], e[1], e[2]]; }
  if (t.k === 'swarm') { const z = frontZ(T, 2); return X.ap(PP.W, [0, P.HA + 2, Math.min(z, Z_MZ) - 4]); }
  if (t.k[0] === 's' && t.k[1] === 'c') { const L = +t.k[2], z = scZ(T, L); return X.ap(PP.W, [-.62 * SC_R[L], .62 * SC_R[L], z === null ? Z_F : z]); }       // (the near upper quadrant: the dolly runs to port)
  if (t.k === 'tel') { const z = frontZ(T, 2); return X.ap(PP.W, [0, 9, Math.min(z, P.Z_TELEND) - 8]); }
  return t.fr ? X.ap(t.fr(PP), t.at) : X.ap(PP.W, t.at);
}
/* the base camera at another time, for placing labels (no shake; FILM.apply's convention) */
const TCAM = new M3.Cam(BW, BH);
const TPJ = [0, 0];
function projAt(Tq, p) {
  FILM.apply(TCAM, camBase(Tq)); TCAM.near = .1;
  const q = TCAM.project(p); if (!q) return false;
  TPJ[0] = q[0]; TPJ[1] = q[1]; return true;
}
/* world point -> the platform's frame at T (and back at another time) */
const toPlat = (Wt, p, o) => { const R_ = Wt.R, t = Wt.T, x = p[0] - t[0], y = p[1] - t[1], z = p[2] - t[2]; o[0] = R_[0] * x + R_[3] * y + R_[6] * z; o[1] = R_[1] * x + R_[4] * y + R_[7] * z; o[2] = R_[2] * x + R_[5] * y + R_[8] * z; return o; };
const LBL = [0, 0], LBQ = [0, 0, 0];
/* the label's anchor: the mean over the last 1 s (not before the tag's start) of the point's screen positions */
function labelAt(t, T, x, y) {
  let sx = x, sy = y, n = 1;
  for (let i = 1; i <= 8; i++) {
    const tq = T - .125 * i; if (tq < t.t0) break;
    P.apTo(LBQ, platAt(tq), t.pl);
    if (!projAt(tq, LBQ)) continue;
    sx += TPJ[0]; sy += TPJ[1]; n++;
  }
  LBL[0] = sx / n; LBL[1] = sy / n; return LBL;
}
/* place a tag: anchor dot at (x, y), the label on side sd (+1 right, -1 left) of the label point (lx, ly) */
function placeTag(tg, id, lab, val, cls, x, y, lx, ly, sd, a, col) {
  const o = Math.max(0, -x, x - BW, -y, y - BH); a *= E.sat(1 - o / (500 * S));          // (an anchor just off screen: the label stays, fading with the distance)
  if (a < .01) return;
  K.setTag(tg, id, lab, val, cls || 'lime sm', lx, ly, 0);                                  // (the text first: its width for this text)
  const w = K.tagW(tg) * S;
  let bx = sd > 0 ? lx + 54 * S + 4 * S : lx - 54 * S - 4 * S - w, by = ly - 62 * S;
  bx = Math.max(30 * S, Math.min(BW - 30 * S - w, bx)); by = Math.max((bx < 440 * S ? 250 : 30) * S, Math.min(BH - 40 * S, by));
  const ex = sd > 0 ? bx - 4 * S : bx + w + 4 * S, ey = by + 12 * S;
  K.leader(x, y, ex, ey, col || '#C6F432', .8 * a);
  if (x > 2 && y > 2 && x < BW - 2 && y < BH - 2) K.dot(x, y, R3, LIME[0], LIME[1], LIME[2], a);
  K.setTag(tg, id, lab, val, cls || 'lime sm', bx, by, a);
}
function partTags(T, PP) {
  for (const t of PTAGS) {
    t.why = '';
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    t.v2 = null;
    const p = tagPoint(t, T, PP); if (!K.pj(p[0], p[1], p[2])) { t.why = 'behind'; continue; }
    if (!K.onS(-40 * S)) t.why = 'off';
    const x = K.PJ[0], y = K.PJ[1];
    toPlat(PP.W, p, t.pl);
    if (!t.side) {
      // the side, once: where the anchor is 0.35 s in (the label goes toward the screen's middle)
      const ts = t.t0 + .35; P.apTo(LBQ, platAt(ts), t.pl);
      t.side = projAt(ts, LBQ) ? (TPJ[0] < BW / 2 ? 1 : -1) : (x < BW / 2 ? 1 : -1);
    }
    const L = labelAt(t, T, x, y);
    placeTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .7), T, t.seed), t.v2 || t.val, 'lime sm', x, y, L[0], L[1], t.side, a);
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
const SB = [0, 0, 0, 0], MB = [0, 0, 0, 0];
/* a point's fade near the screen's edges (instead of popping when it crosses one) */
const edgeA = (x, y, m) => E.sat(Math.min(x, BW - x, y, BH - y) / m);
function markTags(T, Wt, PP) {
  const inMove = T > MOVE[0] + 1.6 && T < MOVE[1] - .4;
  if (PP && (T < 3.4 || inMove || T > DUR - 3.4)) {
    const a0 = T < 3.4 ? 1 - ss(3.0, 3.4, T) : T > DUR - 3.4 ? ss(DUR - 3.4, DUR - 2.6, T) : ss(MOVE[0] + 1.6, MOVE[0] + 2.2, T) * (1 - ss(MOVE[1] - 1.0, MOVE[1] - .4, T));
    const lab = inMove ? 'TO STATION' : 'RAILGUN PLATFORM', val = inMove ? `${(V.dist(Wt.T, SAT) / 1000).toFixed(2)} KM` : `${Math.round(ALT / 1000)} KM UP`;
    const b = platBox(PP, 8 * S), px = b ? Math.max(b[2] - b[0], b[3] - b[1]) / S : 1e9;
    const wb = b && b[1] > 70 * S ? 1 - ss(1300, 1600, px) : 0;
    if (a0 * wb > .01) { K.bracket(b, '#C6F432', .8 * a0 * wb, 14, 1.2); K.setTag(T_PLAT, '', lab, val, 'lime sm', Math.max(b[0], b[2] - K.tagW(T_PLAT) * S), b[1] - 26 * S, a0 * wb); }
  }
  // the climb (flown backwards, looking down the trail): the impact site marked below, shrinking away
  if (T > T_RET + 1.2 && T < T_ARR - 1.6) {
    const d = V.dist(C.eye, HIT);
    if (K.pj(HIT[0], HIT[1], HIT[2])) {
      const x = K.PJ[0], y = K.PJ[1], r = 18 * S, a = ss(T_RET + 1.2, T_RET + 2.0, T) * (1 - ss(T_ARR - 2.6, T_ARR - 1.6, T)) * edgeA(x, y, 90 * S);
      if (a > .01) { MB[0] = x - r; MB[1] = y - r; MB[2] = x + r; MB[3] = y + r; K.bracket(MB, '#FF6A3D', .9 * a, 8, 1.3); K.setTag(T_SITE, 'SITE', 'IMPACT', `${(d / 1000).toFixed(d > 9500 ? 0 : 1)} KM BELOW`, 'coral sm', x + 26 * S, y - r - 26 * S, a); }
    }
  }
  if (T > T_RET + .6 && T < T_ARR - .4) {
    const p = PW1([0, 0, Z_MZ * .3]), d = V.dist(C.eye, p);
    if (K.pj(p[0], p[1], p[2])) {
      const x = K.PJ[0], y = K.PJ[1], r = 16 * S, a = ss(T_RET + .6, T_RET + 1.4, T) * (1 - ss(T_ARR - 1.6, T_ARR - .6, T)) * (1 - ss(2500, 1200, d)) * edgeA(x, y, 90 * S);
      if (a > .01) {
        MB[0] = x - r; MB[1] = y - r; MB[2] = x + r; MB[3] = y + r; K.bracket(MB, '#C6F432', .9 * a, 8, 1.3); K.dot(x, y, R3, LIME[0], LIME[1], LIME[2], a);
        K.setTag(T_PLAT, '', 'RAILGUN PLATFORM', `${d > 9500 ? (d / 1000).toFixed(0) : (d / 1000).toFixed(1)} KM`, 'lime sm', x + 24 * S, y - r - 26 * S, a);
      }
    }
  }
  if (T > T_ON - .6 && T < TI - .3) {
    // the rod: the label at a fixed offset, faded near the screen's edges and behind the lens (no blinking)
    const p = rodAt(T);
    if (K.pj(p[0], p[1], p[2])) {
      const x = K.PJ[0], y = K.PJ[1], a = ss(T_ON - .6, T_ON - .1, T) * (1 - ss(TI - .9, TI - .3, T)) * edgeA(x, y, 120 * S);
      if (a > .01) { K.leader(x, y, x + 40 * S, y - 44 * S, '#C6F432', .8 * a); K.setTag(T_ROD, 'ROD', `ALT ${(altOf(p) / 1000).toFixed(1)} KM`, `${(vAt(sOf(T)) / 1000).toFixed(2)} KM/S`, 'lime sm', Math.min(BW - 300 * S, x + 44 * S), Math.max(250 * S, y - 58 * S), a); }
    }
  }
  if (T > TX + 11.5 && T < TI + .1) {
    const a = ss(TX + 11.7, TX + 12.3, T) * (1 - ss(TI - .15, TI + .05, T));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    W.VEHS.forEach(v => { if (v.d > 80) return; const b = K.boxOf([-3, 0, -6], [3, 4, 6], v.W, 2 * S); if (!b) return; n++; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); });
    if (n && x1 - x0 < 900 * S && x1 - x0 > 6 * S) { SB[0] = x0 - 10 * S; SB[1] = y0 - 10 * S; SB[2] = x1 + 10 * S; SB[3] = y1 + 10 * S; K.bracket(SB, '#FF6A3D', .8 * a, 12, 1.2); K.setTag(T_SITE, 'SITE', 'MILITARY FACILITY', 'VEHICLE PLANT', 'coral sm', Math.max(24 * S, SB[0]), SB[1] - 26 * S, a); }
    else if (K.pj(HIT[0], HIT[1] + 30, HIT[2]) && K.onS(-40 * S)) { const x = K.PJ[0], y = K.PJ[1]; K.leader(x, y, x - 60 * S, y - 60 * S, '#FF6A3D', .8 * a); K.setTag(T_SITE, 'SITE', 'MILITARY FACILITY', 'VEHICLE PLANT', 'coral sm', x - 64 * S - K.tagW(T_SITE) * S, y - 72 * S, a); }
  }
}

/* ---------- readout ---------- */
const ro = $('ro'), kick = $('kick');
/* a dark scrim under the readout: it stays legible over bright structure */
ro.style.cssText += ';background:rgba(11,12,10,.86);padding:9px 14px;margin:-9px 0 0 -14px';
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
const fmtRate = r => r >= 1000 ? `<span class="l">×${Math.round(r / 1000)}k</span>` : r > 1.5 ? `<span class="l">×${Math.round(r)}</span>` : r < .67 ? `<span class="l">×1/${Math.round(1 / r)}</span>` : '×1';
const pct = u => `${Math.round(E.sat(u) * 100)} %`;
const ALIGN0 = .0137;
function alignAt(T) { let n = 0; for (let k = 1; k < NSEG; k++) if (T > SENS_T(k) + .5) n++; if (T > CROWN_T + .4) n++; return n >= NSEG ? .0001 : ALIGN0 * Math.pow(.42, n); }
/* the reactor's numbers, consistent with each other: hot shoe 480 -> 1250 K, cold shoe 300 -> 490 K (ΔT 760 K);
   ~10 % of the heat through the couples comes out as current, the rest goes to the fins */
const QTH = 140, ETA = .1;
/* the energy story (the platform's model, ORTL.energy): the wheels' store -> the banks -> the charge rings -> the round */
const EN = T => typeof energy === 'function' ? energy(T) : null;
const tjs = x => x >= .095 ? `${x.toFixed(2)} TJ` : `${Math.round(x * 1000)} GJ`;
const bankL = T => { const en = EN(T); return en ? `Wheels · <b>${Math.round(en.wheelRpm)} rpm</b> → banks <b>${tjs(en.bankTJ)}</b>` : `Capacitor banks · <b>${pct(E.sat((T - CAPW[0]) / (CAPW[1] - CAPW[0])))}</b>`; };
const rpmOf = (w, f) => (w * 60 / TAU * f);
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
  if (T < T_WAKE) { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = 'Platform <b>dormant</b> · stowed'; }
  else if (T < XRJ[0]) { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = `Status lights · <b>${Math.min(P.LTS.length, Math.max(0, Math.floor((T - T_WAKE - .3) / 2 * P.LTS.length)))}/${P.LTS.length}</b>`; }
  else if (T < HEATW[0]) { l1 = 'Reactor · <b>cutaway</b>'; l2 = T < DRUMW[0] ? 'Control drums · <b>shut</b>' : `Control drums · <b>${pct(kb(T, DRUMW))}</b> turned`; }
  else if (T < FINW[0]) { l1 = `Hot shoe · <b>${Math.round(480 + 770 * hh_)} K</b> · cold shoe <b>${Math.round(300 + 190 * hh_)} K</b>`; l2 = T < CURW[0] ? 'Core <b>heating</b>' : `Couples · <b>${P.NCP * P.CP_ROWS}</b> in series · <b>${(QTH * ETA * cur).toFixed(0)} MW</b>`; }
  else if (T < XRJ[3]) { l1 = `Radiators · <b>${pct(ST.fin)}</b> open · ${P.NFIN} fins`; l2 = `Couples · <b>${(QTH * ETA * cur).toFixed(0)} MW</b> · fins <b>${(QTH * (1 - ETA) * ST.fin).toFixed(0)} MW</b>`; }
  else if (T < ENGX[0] - .3) { l1 = `Stabiliser rings · <b>${rpmOf(OMEGA_R, ringFrac(T)).toFixed(2)} rpm</b> · counter-rotating`; l2 = T < ARC0 ? `Momentum wheels · <b>${Math.round(EN(T) ? EN(T).wheelRpm : 3000)} rpm</b> · <b>1.2 TJ</b> stored` : 'Arcs · <b>rings in phase</b>'; }
  else if (T < CRU[0] - .2) { const d = V.dist(PLAT.W.T, SAT), togo = Math.acos(E.clamp(V.dot(X.dir(PLAT.W, [0, 0, 1]), AIM), -1, 1)) / DEG; l1 = T < MOVE[0] ? `Engines · nozzles <b>${pct(ST.engExt)}</b> · gimbal check` : `Station · <b>${(d / 1000).toFixed(2)} km</b> to go`; l2 = `Slew · <b>${togo.toFixed(0)}°</b> to go · rings tilt <b>${(Math.abs(tiltAt(T)) / DEG).toFixed(1)}°</b>`; }
  else if (T < BUILD[0]) { l1 = `Guide ring · <b>${T < CRU[1] ? 'undocking' : T < CRD[0] ? `${rpmOf(OMEGA_CR, crFrac(T)).toFixed(1)} rpm` : 'moving out'}</b>`; const nf = SC_FORM.filter(t => T >= t).length; l2 = T > CRL[1] + .3 ? `Stabiliser rings · <b>split</b> · <b>${nf}/${NSC}</b> construction rings formed` : T < CRL[0] ? `Dock arms · <b>${pct(kb(T, CRU))}</b>` : `Alignment lasers · <b>${Math.min(6, Math.floor(6 * E.sat((T - CRL[0]) / (CRL[1] - CRL[0]))))}/6</b> locked`; }
  else if (T < CAL[0] - .2) { const b = builtM(T); let n = 0; for (let k = 1; k < NSEG; k++) if (T > LOCKC(k)) n++; l1 = `Barrel · <b>${Math.round(b)} m</b> of ${Math.round(Z_MZ)}`; l2 = T < SC_FORM[NSC - 1] + .5 ? `Construction rings · <b>${SC_FORM.filter(t => T >= t).length}/${NSC}</b> formed` : T > PARKM[0] ? `Rings · <b>to their stations</b> · 5 along the barrel` : T < CROWN_DONE ? `Collars · <b>${n}/${NSEG - 1}</b> locked` : `Crown <b>done</b> · ring at <b>${Math.round(crZ(T) - Z_MZ)} m</b> ahead`; }
  else if (T < SWW[0] - .6) { l1 = `Alignment · <b>${alignAt(T).toFixed(4)}°</b>`; l2 = T > ALIGN_T ? 'Bore <b>straight</b> · locked' : 'Laser line · <b>scanning</b>'; }
  else if (T < HBF[0] - .2) { l1 = `Switches · <b>${ST.sw < .5 ? 'engines' : 'gun'}</b> · gun bus <b>${pct((gunFront(T) + 134) / (Z_MZ + 134))}</b>`; l2 = bankL(T); }
  else if (T < FLW[0][0] - .2) { l1 = `Bay ${HB} · <b>${T < HBC[0] ? 'flaps hinging open' : T < HBT[0] ? 'cassettes sliding out' : T < HBM[0] ? 'cassettes turning up' : 'magnets to 4.2 K'}</b>`; l2 = bankL(T); }
  else if (T < UNLK[0] - .2) { const s = T < FLW[1][0] ? 'flaps cracked' : T < FLW[2][0] ? 'cassettes out' : 'turned up'; l1 = `Barrel · <b>${s}</b> · magnets <b>${pct((magFront(T) - Z_CH) / (Z_MZ - Z_CH))}</b>`; l2 = bankL(T); }
  else if (T < AT_FAB + .01) { l1 = `Breech · <b>${T < BRO[0] ? 'unlocking' : 'opening'}</b>`; l2 = 'Chamber · <b>empty</b>'; }
  else if (T < COILW[1] + .2) { l1 = `Round · <b>chambered</b> · ${(PI * P.ROD_R ** 2 * P.ROD_L * 19.3).toFixed(1)} t`; l2 = T < LOCKW[0] ? 'Breech <b>closing</b>' : T < CLAMPW[0] ? 'Lock rings <b>turning</b>' : T < COILW[0] ? 'Clamps <b>12/12</b>' : `Chamber coils · <b>${pct(ss(COILW[0], COILW[1], T))}</b>`; }
  else if (T < TF) { const n = Math.round(198 * E.sat((T - CH0) / (CH1 - CH0))); const en = EN(T); l1 = T < CH0 ? `Charge rings · <b>armed</b>${en ? ` · banks <b>${tjs(en.bankTJ)}</b>` : ''}` : `Charge rings · <b>${n}/198</b>${en ? ` · <b>${tjs(en.ringsTJ)}</b>` : ''}`; l2 = T > IRIS[0] ? `Iris · <b>${pct(ST.iris)}</b> · fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>` : `Fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>`; }
  else if (T < TX) { const z = rodZof(T) - Z_CH, u = (T - TF) / TR_D; const en = EN(T); l1 = `Round · <b>${z.toFixed(0)} m</b> of ${BLEN.toFixed(0)}${en ? ` · <b>${Math.round(en.roundGJ)} GJ</b>` : ''}`; l2 = `<b>${(V_MZ * u / 1000).toFixed(2)} km/s</b> · +<b>${((T - TF) * RATE_TR * 1000).toFixed(0)} ms</b>`; }
  else if (T < T_ON - .6) { l1 = `Muzzle · <b>${(V_MZ / 1000).toFixed(2)} km/s</b> · <b>${Math.round(.5 * PI * P.ROD_R ** 2 * P.ROD_L * 19300 * V_MZ * V_MZ / 1e9)} GJ</b>`; l2 = 'Recoil · <b>0.3 m/s</b> · the engines null it'; }
  else if (T < TI) { const p = rodAt(T), hh2 = altOf(p); l1 = `Rod · altitude <b>${km(hh2)} km</b>`; l2 = `<b>${(vAt(sOf(T)) / 1000).toFixed(2)} km/s</b> · ${hh2 < 100000 ? 'entry' : 'coast'}`; }
  else if (T < T_RET) { const a = aOf(T); l1 = `Impact · <b>${(vAt(L0) / 1000).toFixed(2)} km/s</b>`; l2 = a < 4 ? `Shock · <b>${Math.round(FX.shockR(a))} m</b>` : `Column · <b>${(FX.capH(a) / 1000).toFixed(2)} km</b>`; }
  else if (T < UNB[0]) { l1 = `Platform · <b>${km(ALT)} km</b>`; l2 = T < T_ARR ? (EN(T) ? `Wheels · <b>${Math.round(EN(T).wheelRpm)} rpm</b> · recharging at <b>14 MW</b>` : 'Switches · <b>to the engines</b>') : T < Math.max(FLB[1], SW_B[1]) ? 'Barrel <b>closing</b> · power <b>to the engines</b>' : (T < GATHER[1] ? 'Construction rings · <b>gathering at the muzzle</b>' : 'Train · <b>reversing</b>'); }
  else if (T < CRK[1]) { l1 = `Barrel · <b>${Math.round(builtM(T))} m</b> left`; l2 = T < SC_DIS[4] ? 'Taking it apart · <b>outer layer first</b>' : T < CRK[0] ? 'Rings · <b>back to the stabiliser rings</b>' : 'Guide ring · <b>docking</b>'; }
  else if (T < LIGHTS_OFF[1] - .4) { l1 = `Park · <b>${(V.dist(PLAT.W.T, SAT0) / 1000).toFixed(2)} km</b>`; l2 = T < SPIN_B[0] ? 'Rings · <b>turning it back</b>' : T < LIGHTS_OFF[0] ? `Stabiliser rings · <b>${rpmOf(OMEGA_R, ringFrac(T)).toFixed(2)} rpm</b>` : 'Dormant · <b>waiting</b>'; }
  else { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = 'Platform <b>dormant</b> · stowed'; }
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
/* DUEL: the platform broken in two (o.hull.brk / FULL.hull.brk, from the damage (intercept_dmg.js hullClip): { on, R, T
   (the aft section's rigid motion, platform frame), cutF, cutA (model planes [nx, ny, nz, d], n.p > d left out: the fore
   section's and the aft's) }): posed and drawn twice, the fore section under Wt clipped at its cut, the aft under
   Wt * (R, T) clipped at its own (no barrel on it); the occluders built per section (copies of the platform's own,
   ending short of the cuts so the gap stays open) */
const BRKX = { WA: { R: new Float64Array(9), T: [0, 0, 0] }, F: [0, 0, 0, 0], A: [0, 0, 0, 0], front: new Float64Array(5) };
const CLIPO = [DO, DOJ, DOC, DOH, DOHL, DOX, DOHF, DOHM, DOG, DOR, DOCR, DOFin, DOCold, DOCore, DOF];
const setClipP = cp => { for (const q of CLIPO) q.clipP = cp; };
function brkWA(Wt, B) {
  const o = BRKX.WA, A = Wt.R, Rb = B.R, t = B.T;
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) o.R[i * 3 + j] = A[i * 3] * Rb[j] + A[i * 3 + 1] * Rb[3 + j] + A[i * 3 + 2] * Rb[6 + j]; o.T[i] = A[i * 3] * t[0] + A[i * 3 + 1] * t[1] + A[i * 3 + 2] * t[2] + Wt.T[i]; }
  return o;
}
/* a model plane (n.p > d left out) under W as the lattice's camera-space plane */
function camPl(W, m, out) {
  const M = W.R, nx = M[0] * m[0] + M[1] * m[1] + M[2] * m[2], ny = M[3] * m[0] + M[4] * m[1] + M[5] * m[2], nz = M[6] * m[0] + M[7] * m[1] + M[8] * m[2];
  const dw = m[3] + nx * W.T[0] + ny * W.T[1] + nz * W.T[2], r = C.r, u = C.u, f = C.f, e = C.eye;
  out[0] = r[0] * nx + r[1] * ny + r[2] * nz; out[1] = u[0] * nx + u[1] * ny + u[2] * nz; out[2] = f[0] * nx + f[1] * ny + f[2] * nz; out[3] = dw - (nx * e[0] + ny * e[1] + nz * e[2]);
  return out;
}
/* draws both sections (PP: posed under Wt); returns the pose left in P.PP (the aft's, or the fore's again with keepFore) */
function drawSplit(PP, st, Wt, B, ringFn, keepFore) {
  setClipP(camPl(Wt, B.cutF, BRKX.F)); P.draw(PP, st, LOOK);
  const WA = brkWA(Wt, B);
  for (let L_ = 0; L_ < 5; L_++) { BRKX.front[L_] = st.front[L_]; st.front[L_] = -1e9; }
  const PPa = P.pose(WA, st); if (ringFn) ringFn(PPa);
  setClipP(camPl(WA, B.cutA, BRKX.A)); P.draw(PPa, st, LOOK);
  for (let L_ = 0; L_ < 5; L_++) st.front[L_] = BRKX.front[L_];
  setClipP(null);
  return keepFore ? P.pose(Wt, st) : PPa;
}
const OPB = {}, OPRB = {};
for (const n of [4, 8]) { OPB[n] = { P: [], C: [] }; for (let k = 0; k < n + 2; k++) OPB[n].P.push([0, 0, 0, 0]); for (let k = 0; k < n * 2; k++) OPB[n].C.push([0, 0, 0]); }
for (const n of [6, 16]) { OPRB[n] = { P: [], C: [] }; for (let k = 0; k < n + 2; k++) OPRB[n].P.push([0, 0, 0, 0]); for (let k = 0; k < n * 2; k++) OPRB[n].C.push([0, 0, 0]); }
const OBL = [0, 0, 0], OBW = [0, 0, 0];
const apB = (W, x, y, z, o) => { const M = W.R, t = W.T; o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o; };
function occPolyB(W, poly, k, z0, z1) {
  const n = poly.length, M = W.R, sh = k * .975, PL_ = OPB[n].P, CC = OPB[n].C;
  let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx = cx / n * sh; cy = cy / n * sh;
  apB(W, cx, cy, (z0 + z1) / 2, OBL);
  let rr = 0; for (const p of poly) rr = Math.max(rr, Math.hypot(p[0] * sh - cx, p[1] * sh - cy));
  if (!K.wIn(OBL[0], OBL[1], OBL[2], Math.hypot(rr, (z0 - z1) / 2))) return;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey), lx = ey / l, ly = -ex / l;
    const nx = M[0] * lx + M[1] * ly, ny = M[3] * lx + M[4] * ly, nz = M[6] * lx + M[7] * ly, Q = PL_[i];
    apB(W, a[0] * sh, a[1] * sh, z0, OBW);
    Q[0] = nx; Q[1] = ny; Q[2] = nz; Q[3] = nx * OBW[0] + ny * OBW[1] + nz * OBW[2];
    apB(W, a[0] * sh, a[1] * sh, z0 - .3, CC[i * 2]); apB(W, a[0] * sh, a[1] * sh, z1 + .3, CC[i * 2 + 1]);
  }
  const dz0 = M[2], dz1 = M[5], dz2 = M[8], d0 = dz0 * OBL[0] + dz1 * OBL[1] + dz2 * OBL[2], hz = (z0 - z1) / 2 - .3;
  let Q = PL_[n]; Q[0] = -dz0; Q[1] = -dz1; Q[2] = -dz2; Q[3] = -d0 + hz;
  Q = PL_[n + 1]; Q[0] = dz0; Q[1] = dz1; Q[2] = dz2; Q[3] = d0 + hz;
  K.occS(2); K.occPlanes(PL_, CC); K.occS(0);
}
function occPrismB(Tw, n, r, a0, z0, z1) {
  const ri = r * Math.cos(PI / n) * .965, M = Tw.R, PL_ = OPRB[n].P, CC = OPRB[n].C;
  apB(Tw, 0, 0, (z0 + z1) / 2, OBL);
  if (!K.wIn(OBL[0], OBL[1], OBL[2], Math.hypot(r, (z1 - z0) / 2))) return;
  for (let k = 0; k < n; k++) {
    const a = a0 + k * TAU / n, lx = Math.cos(a), ly = Math.sin(a), nx = M[0] * lx + M[1] * ly, ny = M[3] * lx + M[4] * ly, nz = M[6] * lx + M[7] * ly;
    const Q = PL_[k]; Q[0] = nx; Q[1] = ny; Q[2] = nz; Q[3] = nx * OBL[0] + ny * OBL[1] + nz * OBL[2] + ri;
  }
  const dz0 = M[2], dz1 = M[5], dz2 = M[8], d0 = dz0 * OBL[0] + dz1 * OBL[1] + dz2 * OBL[2], hz = (z1 - z0) / 2 - .15;
  let Q = PL_[n]; Q[0] = -dz0; Q[1] = -dz1; Q[2] = -dz2; Q[3] = -d0 + hz;
  Q = PL_[n + 1]; Q[0] = dz0; Q[1] = dz1; Q[2] = dz2; Q[3] = d0 + hz;
  for (let k = 0; k < n; k++) { const a = a0 + k * TAU / n + PI / n; for (let e = 0; e < 2; e++) apB(Tw, Math.cos(a) * r, Math.sin(a) * r, e ? z1 : z0, CC[k * 2 + e]); }
  const dc = Math.hypot(OBL[0] - C.eye[0], OBL[1] - C.eye[1], OBL[2] - C.eye[2]);
  K.occS(r * C.fl / (dc + (z1 - z0) / 2) > 140 ? 2 : 0); K.occPlanes(PL_, CC); K.occS(0);
}
function occBoxB(Tw, mn, mx) { apB(Tw, (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2, OBL); if (K.wIn(OBL[0], OBL[1], OBL[2], Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2)) K.occBox(Tw, mn, mx); }
const OCC_HULL = [[42, -6], [42, 6], [27, 27], [-27, 27], [-42, 6], [-42, -6], [-30, -27], [30, -27]], OCC_D2 = [[20, 27], [16, 37], [-16, 37], [-20, 27]], OCC_D3 = [[12, 37], [9, 47], [-9, 47], [-12, 37]];
const OCC_ENG = [[102, 27.3], [-102, 27.3], [-102, -27.3], [102, -27.3]];
const opaB = v => v === false ? 0 : v === true || v === undefined ? 1 : +v;
function occludeSplit(PP, st, Wt, B, oo) {
  const WA = brkWA(Wt, B), zf = -245, za = -271, ZP = P.Z_PROW, ZS = P.Z_STERN, D2_ = P.D2, D3_ = P.D3, TW_ = P.TOWER;
  { const a = opaB(oo.hsg); if (a > 0) { K.occA(a); occPrismB(Wt, 6, P.HSG_R || 21, PI / 6, -40, 0); K.occA(1); } }
  const zs = [ZP, -120, -200, zf];
  for (let i = 0; i < zs.length - 1; i++) { const a = i === 0 ? opaB(oo.hullF) : 1; if (a <= 0) continue; K.occA(a); occPolyB(Wt, OCC_HULL, P.kz(zs[i]), zs[i], zs[i + 1]); K.occA(1); }
  occPolyB(Wt, OCC_D2, P.kz(D2_.z1), D2_.z1, zf);
  if (oo.skin) for (let s_ = 0; s_ < NSEG; s_++) if (oo.skin[s_]) { K.occA(opaB(oo.skin[s_])); occPrismB(PP.seg[s_], 6, P.HR, PI / 6, P.COL_L, LSEG - P.COL_L); K.occA(1); }
  if (oo.skin && oo.skin[NSEG]) { K.occA(opaB(oo.skin[NSEG])); for (let k = 0; k < P.NTEL; k++) occPrismB(PP.tel[k], 6, P.TEL_R[k], PI / 6, 0, P.TEL_L); K.occA(1); }
  if (oo.core !== false) occPrismB(WA, 16, 31.8, 0, -690, -610);
  const zsA = [za, -300, -400, -500, ZS];
  for (let i = 0; i < zsA.length - 1; i++) occPolyB(WA, OCC_HULL, P.kz(zsA[i]), zsA[i], zsA[i + 1]);
  occPolyB(WA, OCC_D2, P.kz(za), za, -400); occPolyB(WA, OCC_D2, P.kz(-400), -400, ZS);
  occPolyB(WA, OCC_D3, P.kz(D3_.z1), D3_.z1, ZS);
  occBoxB(WA, [-TW_.x, TW_.yb, TW_.z0], [TW_.x, TW_.yb + TW_.h, TW_.z1]);
  for (const [x, y] of OCC_ENG) occBoxB(WA, [x - 12, y - 12, ZS - 7.6], [x + 12, y + 12, ZS]);
}
/* INTERCEPT: the render, headless. o: { cam {eye, target, fov}, shake [dx, dy] (raster px), Tst (the orbital film's
   base time the platform's state is read at: a dormant moment), Wt (platform -> world, or null: no platform),
   psi (the stabiliser rings' spin angle, rad; ring B counter-rotates), tilt [a, b] (rad), gimbal [x, y] (the tilt
   axis in the platform's xy plane), world (0..1: the globe, the limb, the coast), stars (0..1), site (true: the coast
   patches while the lens is low), hull { clipM } (planes cut out of the hull's bodies: the holes), ring (fn(PP): edit
   the ring poses after posing), fx(PP) (the act's own drawing after the platform, into the same buffer), pre(PP) }.
   Returns the platform's pose (or null). Leaves the tags and the blit to the caller. */
const IDO = {};
function renderOrb(TR, o) {
  const T = o.Tst === undefined ? 30.5 : o.Tst;
  FXT = T; INS_ON = false;
  const Wt = o.Wt || null, st = stateAt(T);
  if (o.psi !== undefined) { ST.rings[0].psi = o.psi; ST.rings[1].psi = -o.psi; ST.spin = o.psi; }
  if (o.tilt) { ST.rings[0].tilt = o.tilt[0]; ST.rings[1].tilt = o.tilt[1]; }
  if (o.gimbal) P.setGimbal(o.gimbal[0], o.gimbal[1]); else P.setGimbal(GAX0[0], GAX0[1]);   // DUEL: the film's axis unless set
  if (o.rotor !== undefined) { ST.rings[0].rotor = o.rotor; ST.rings[1].rotor = -o.rotor; }
  if (o.blur !== undefined) ST.blur[0] = ST.blur[1] = o.blur;
  FILM.apply(C, o.cam);
  C.shake = o.shake || [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? .08 : .1; C.update();
  K.pb.clear(); K.occReset();
  const dPlat = Wt ? V.dist(C.eye, Wt.T) : 1e12;
  const zr_ = o.zref || V.dist(C.eye, C.target), wide = ss(450, 1400, zr_);
  ORL.frame({ zref: Math.max(60, zr_), PXF: PXF0 + .8 * wide, PXL: PXL0 + .6 * wide });
  W.LG.zref = Math.max(500, V.dist(C.eye, C.target));
  const FAR = o.far || 60000;                                          // DUEL: o.far, the range the platform is still drawn at
  let PP = Wt && dPlat < FAR ? P.pose(Wt, st) : null;
  const hB = o.hull && o.hull.brk && o.hull.brk.on ? o.hull.brk : null;          // DUEL: broken in two
  if (PP && o.ring && !hB) o.ring(PP);
  let occW = 1;
  if (SMOOTH) { for (let s = 0; s <= NSEG; s++) SKIN[s] = 0; occW = 1 - ss(8000, 9000, dPlat); }
  else for (let s = 0; s <= NSEG; s++) SKIN[s] = false;
  if (ORL.G.clip) ORL.G.clip.on = false;
  if (PP && (SMOOTH ? occW > .002 : dPlat < 9000) && o.occ !== false) {
    K.occM(occW);
    if (hB) occludeSplit(PP, st, Wt, hB, { skin: SKIN, hsg: true, hullF: true }); else P.occlude(PP, st, { skin: SKIN, hsg: true, hullF: true });
    K.occM(1); ORL.G.occ = true;
  } else ORL.G.occ = false;
  if (o.pre) o.pre(PP);
  const sa = o.stars === undefined ? 1 : o.stars;
  if (sa > .002) K.drawStars(W.STARS, sa * .9 * (1 - ss(20000, 3000, alt)), TR);
  let n = 0;
  const wv = o.world === undefined ? 1 : o.world;
  if (wv > .002) {
    n += W.drawGlobe(wv, 1); W.drawLimb(wv);
    if (o.site && alt < 120000) { W.SH.r1 = -1; n += W.drawSite(wv * (1 - ss(60000, 120000, alt)), TR * .8, 3.4); }
  }
  if (PP) {
    P.apTo(RCW, Wt, [0, 0, REA_M]);
    DO.lc = [255, 255, 255];
    DOJ.keep = 1; DOJ.a = 1; DOJ.clipM = null; DOJ.pxf = 1; DOFin.clipM = null; DOCold.clipM = null; DOCold.a = 1; DOCore.clipM = null;
    DOC.a = 0; DOC.lime = 0; DOF.a = 0;
    DOH.keep = 1; DOH.a = 1; DOHL.keep = 1; DOHL.a = 1; DOHF.keep = 1; DOHF.a = 1; DOX.a = 1; DOX.lime = 0;
    const hc = o.hull ? o.hull.clipM : null; DOHM.clipM = hc; DOG.clipM = hc; DOHF.clipM = hc; DOHL.clipM = hc; DO.clipM = hc; DOH.clipM = hc;
    LOOK.xr = false; LOOK.cp = null; LOOK.fuel = null; LOOK.sec = null; DOFin.a = 1; DOFin.keep = 1;
    LOOK.wave = null; LOOK.skinOcc = ORL.G.occ && occW >= .998;
    if (SMOOTH) ORL.G.am = 1 - ss(FAR * .77, FAR, dPlat);
    if (hB) PP = drawSplit(PP, st, Wt, hB, o.ring, false); else P.draw(PP, st, LOOK);
    ORL.G.am = 1;
    DOHM.clipM = DOG.clipM = DOHF.clipM = DOHL.clipM = DO.clipM = DOH.clipM = null;
    if (o.ringFX !== false) { PPS = PP.switches; drawPower(T, Wt); drawRingFX(T, Wt, PP); }
  }
  if (o.fx) o.fx(PP);
  NDOT = ORL.G.dots + n;
  return PP;
}

/* DUEL: the orbital film's own render (its base timeline, its lens, its effects, its readout), kept for the closing
   act (proto/strike_orbit.js steers it). IORB.FULL carries the hooks the act sets before each call: platXf(T) (the
   platform's pose instead of the film's), psiOff (rad, added to ring A's spin angle, taken from ring B's), tilt [a, b]
   (rad, added), gimbal [x, y] (or the film's own axis), hull { clipM } (holes cut out of the hull's bodies), ring(PP)
   (edit the ring poses), pre(PP) (after the occluders), fx(PP, Wt, T) (after the platform's effects), stars (0..1). */
const FULL = {};
const GAX0 = P.GAX.slice();
function renderFull(TR) {
  const FO = FULL;
  roTxt = ''; kickTxt = '';                                            // (another page wrote the readout since: write it again)
  if (PROF) prof(null);
  K.beginTags();
  const sg = mapIn(TR), T = sg.T, iq = sg.k >= 0 ? INS[sg.k] : null;
  FXT = T; INS_ON = !!iq;
  const Wt = FO.platXf ? FO.platXf(T) : platXf(T), st = stateAt(T);
  if (FO.psiOff) { ST.rings[0].psi += FO.psiOff; ST.rings[1].psi -= FO.psiOff; ST.spin += FO.psiOff; }
  if (FO.tilt) { ST.rings[0].tilt += FO.tilt[0]; ST.rings[1].tilt += FO.tilt[1]; }
  if (FO.gimbal) P.setGimbal(FO.gimbal[0], FO.gimbal[1]); else P.setGimbal(GAX0[0], GAX0[1]);
  if (iq) { CTX.T = TR; CTX.u = sg.u; CTX.Tb = T; CTX.Wt = Wt; CTX.st = st; CTX.PP = null; CTX.camOld = camAt(iq.at); }
  FILM.apply(C, iq ? iq.mod.cam(sg.u, CTX) : camAt(T));
  const ax = T - TX, a = aOf(T);
  C.shake = ax > 0 && ax < 1.4 ? FILM.shake(T, 6 * (1 - ax / 1.4) * S, 26) : T > TF && T < TX ? FILM.shake(T, 1.2 * S, 34) : a > 0 && a < 3 ? FILM.shake(T, 9 * (1 - a / 3) * S, 22) : [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? .08 : .1; C.update();
  K.pb.clear(); K.occReset();
  const dPlat = V.dist(C.eye, Wt.T);
  const zr_ = V.dist(C.eye, C.target), wide = ss(450, 1400, zr_);
  ORL.frame({ zref: Math.max(60, zr_), PXF: PXF0 + .8 * wide, PXL: PXL0 + .6 * wide });
  W.LG.zref = Math.max(500, V.dist(C.eye, C.target));
  if (PROF) prof('setup');
  let PP = dPlat < 60000 ? P.pose(Wt, st) : null;
  const hB = FO.hull && FO.hull.brk && FO.hull.brk.on ? FO.hull.brk : null;       // DUEL: broken in two
  if (PP && FO.ring && !hB) FO.ring(PP);
  if (iq) CTX.PP = PP;
  const hideBase = !!(iq && iq.mod.hideBase);
  if (PROF) prof('pose');
  // X-rays: the reactor's cutaway, the housing (chamber), the bay's walls and the prow's plating (the insert)
  const cut = CUT.open, xh = Math.max(xr(T, [UNLK[0] - .4, UNLK[0] + .4, COILW[1] + .6, COILW[1] + 1.6]), iq ? 1 : 0), xb = Math.max(xr(T, [BRO[0], AT_FAB, BRC[0], BRC[1]]), iq ? 1 : 0);
  let occW = 1;
  if (SMOOTH) {
    // the skins' occluders fade (0.25 s) as the flaps start to open and once they have closed, and over the last 6 m
    // of each segment's build (its first 6 m taken apart); the X-rays' occluders over their ramps; the whole set
    // fades out between 8 and 9 km from the platform
    const shA = 1 - ss(FLW[0][0], FLW[0][0] + .25, T) + ss(FLB[1] + .05, FLB[1] + .3, T), f4 = st.front[4];
    for (let s = 0; s < NSEG; s++) SKIN[s] = shA * E.sat((f4 - ((s + 1) * LSEG + 24)) / 6);
    SKIN[0] *= 1 - ss(HBF[0], HBF[0] + .25, T);            // (the hero bay opens first, in segment 0)
    SKIN[NSEG] = shA * (f4 > 1e8 ? 1 : E.sat((f4 - Z_MZ + 6) / 7));
    occW = 1 - ss(8000, 9000, dPlat);
  } else {
    const shutT = T < FLW[0][0] || T > FLB[1] + .2;
    for (let s = 0; s < NSEG; s++) SKIN[s] = shutT && st.front[4] >= (s + 1) * LSEG + 30;
    if (T > HBF[0] && T < FLB[1] + .2) SKIN[0] = false;
    SKIN[NSEG] = shutT && st.front[4] > 1e8;
  }
  if (ORL.G.clip) ORL.G.clip.on = false;
  if (PP && (SMOOTH ? occW > .002 : dPlat < 9000) && !hideBase) {
    K.occM(occW);
    const oo_ = { skin: SKIN, hsg: SMOOTH ? 1 - ss(.3, .7, xh) : xh < .5, hullF: SMOOTH ? 1 - ss(.15, .45, xb) : xb < .3, cutK: cut > .01 ? CUT.hk : undefined };
    if (hB) occludeSplit(PP, st, Wt, hB, oo_); else P.occlude(PP, st, oo_);
    K.occM(1); ORL.G.occ = true;
  } else ORL.G.occ = false;
  if (FO.pre) FO.pre(PP);
  if (PROF) prof('occlude');
  K.drawStars(W.STARS, (FO.stars === undefined ? 1 : FO.stars) * .9 * (1 - ss(20000, 3000, alt)), TR);
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
    DOJ.keep = 1; DOJ.a = 1; DOJ.clipM = cut > .01 ? CUT.shell : null; DOJ.pxf = cut > .01 ? 1.5 : 1;
    DOFin.clipM = DOJ.clipM;
    DOCold.clipM = cut > .01 ? CUT.cold : null; DOCold.a = 1;
    DOCore.clipM = cut > .01 ? CUT.core : null;
    DOC.a = cut; DOC.lime = 0;
    DOF.a = E.sat(cut * 1.6);
    DOH.keep = 1 - .86 * xh; DOH.a = 1 - .66 * xh;
    DOHL.keep = 1 - .8 * xb; DOHL.a = 1 - .55 * xb;
    DOHF.keep = 1 - .92 * xb; DOHF.a = 1 - .9 * xb;
    DOX.a = 1 + .3 * xh; DOX.lime = .25 * xh;
    LOOK.xr = cut > .01; LOOK.cp = null; LOOK.fuel = null; LOOK.sec = null; DOFin.a = 1; DOFin.keep = 1;
    LOOK.wave = ST.wave > 0 ? waveFn : null; LOOK.skinOcc = ORL.G.occ && occW >= .998;
    if (SMOOTH) ORL.G.am = 1 - ss(46000, 60000, dPlat);          // (fading out with distance before it is dropped)
    const hc = FO.hull && cut <= .01 ? FO.hull.clipM : null; if (hc) { DOHM.clipM = hc; DOG.clipM = hc; DOHF.clipM = hc; DOHL.clipM = hc; DO.clipM = hc; DOH.clipM = hc; }
    if (hB) PP = drawSplit(PP, st, Wt, hB, FO.ring, true); else P.draw(PP, st, LOOK);
    if (hc) DOHM.clipM = DOG.clipM = DOHF.clipM = DOHL.clipM = DO.clipM = DOH.clipM = null;
    ORL.G.am = 1;
    if (PROF) prof('platform');
    PPS = PP.switches; drawPower(T, Wt); drawCutaway(T, Wt); drawRingFX(T, Wt, PP); drawSwarm(T, PP); drawCRFX(T, PP); drawEngines(T, Wt, PP); drawLasers(T, PP); drawLocks(T, PP, Wt); drawSplitFX(T, PP, Wt); drawCapModule(T, Wt); drawFields(T, Wt); drawDischarge(T, Wt); drawFlapFronts(T, Wt); drawHeroBay(T, PP);
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
  if (FO.fx) FO.fx(PP, Wt, T);
  if (PROF) prof('fx');
  octx.clearRect(0, 0, BW, BH);
  let fl = 0;
  if (ax > 0 && ax < .6) fl = .18 * Math.exp(-ax * 7);
  if (a >= 0) fl = Math.max(fl, FX.flashA(a));
  if (fl > .004) { octx.fillStyle = `rgba(240,246,226,${fl.toFixed(3)})`; octx.fillRect(0, 0, BW, BH); }
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
  ...[1, 2, 3, 4, 5].map(k => [JAWT(k) + .22 * LOCKSC(k), () => { clunk(); tick(); }]), ...HERO_LOCK.map(k => [SLVT(k)[0], () => whir(SLVT(k)[1] - SLVT(k)[0])]), [CROWN_DONE, () => SFX.tone(880, 1760, .5, 'sine', .014)],
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
  if (a < .01 || !K.pj(p[0], p[1], p[2]) || !K.onS(-40 * S)) return;
  const x = K.PJ[0], y = K.PJ[1], dx = x > 1100 * S ? 54 * S : -54 * S, lx = x + dx;
  K.leader(x, y, lx, y - 50 * S, '#C6F432', .8 * a); K.dot(x, y, R3, LIME[0], LIME[1], LIME[2], a);
  const w = K.tagW(tg);
  K.setTag(tg, id, K.decode(lab, E.sat(age / .7), FXT, id.length), val, 'lime sm', dx > 0 ? lx + 4 * S : lx - 4 * S - w * S, y - 62 * S, a);
}
const BAYf = Tb => X.mul(platAt(Tb), P.BAYX), CHAMBERf = Tb => X.mul(platAt(Tb), P.CHAMBERX);
const CTX = { K, L: ORL, P, W, FX, M3, V, R, X, E, LIME, HOT, WH, CORAL: K.CORAL, T: 0, u: 0, Tb: 0, Wt: null, PP: null, st: null, camOld: null, tagAt, SAT, CE, RE, HIT, L_SUN, PW0, PW1, camAt: t => camAt(t),
  BAY: BAYf, CHAMBER: CHAMBERf, BAY_HALF: P.BAY_H.slice(), CHAMBER_IN_BAY: [0, 0, P.Z_RND - P.BAY_C[2]],
  ROUND: { len: P.RND_L, r: P.RND_R, armature: P.ARM_L, rodLen: P.ROD_L, rodR: P.ROD_R, boreR: P.BORE_R, sections: P.RND_SEC, massT: +(PI * P.ROD_R ** 2 * P.ROD_L * 19.3).toFixed(1), chamberLen: -P.BLK_Z[1] }, AT_FAB };
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
/* INTERCEPT: exported instead of run */
window.IORB = { render: renderOrb, renderFull, FULL, K, P, W, FX, L: ORL, LOOK, DO, DOHM, DOG, DOHF, RE, CE, L_SUN, stateAt, ST, OMEGA_R, TL_T: { RSPW, ARC0 }, frameRef: () => ({ dots: NDOT }) };
/* the timeline and the moving points for other code (the camera, debugging) */
const TL = { T_WAKE, XRJ, DRUMW, HEATW, CURW, FINW, RSPW, ARC0, ENGX, GCHK, MOVE, BURN, RETRO, SLEW, CRU, CRS, CRL, CRD, BUILD, CAL, SWW, GUNP, CAPW, FLW, MAGW, UNLK, BRO, AT_FAB, BRC, LOCKW, CLAMPW, COILW, CH0, CH1, TF, IRIS, TX, TI, T_RET, T_ARR,
  IRIS_B, CLAMP_B, FLB, SW_B, MAG_B, UNB, CRK, CRSB, MOVE_B, SLEW_B, BURN_B, RETRO_B, SPIN_B, ENGX_B, FIN_B, HEAT_B, LIGHTS_OFF, DUR, CR_DOCK, CR_START, CR_PARK, LOCKC: LOCKC_TS.slice(), ULOCK: ULOCK_TS.slice(), CROWN_DONE,
  HB, HBF, HBC, HBT, HBM, HERO_LOCK, JAWT: [0, 1, 2, 3, 4, 5].map(k => k ? JAWT(k) : 0), SLVT: [0, 1, 2, 3, 4, 5].map(k => k ? SLVT(k) : null), IRIS_C, UNB_LOOK,
  SPIN_D, SPLIT, SC_FORM, PARKM, PARKZ, GATHER, SC_DIS, REFORM, RSPW_B, Z_F, SC_GAP, SC_LEAD, LAG };
/* for the camera and the readout: ORTL.energy(T) (the store, the banks, the shot), ORTL.scZ(T, L) (a construction ring's
   plane, platform z, or null), ORTL.scR[L] its radius, ORTL.nodePos(T, g) (a node's centre, platform frame: g 0..55),
   ORTL.crawlerZ(T) (the barrel crawler's z or null), ORTL.wheelRpm(T). (nodePos poses the model: call it from the camera,
   not from the tags.) */
const ND_ = P.xf(), ID_W = P.xf();
const nodePos = (T, g) => { const T0 = FXT; stateAt(T); const PP = P.pose(ID_W, ST); P.scNode(PP, ID_W, ST, g, ST.sc.u[g], ND_); const out = ND_.T.slice(); stateAt(T0); return out; };      // (restores the frame's state)
window.ORTL = { TL, crZ, frontZ, scZ, scR: P.SC_R.slice(), nodePos, energy: T => Object.assign({}, energy(T)), wheelRpm: T => energy(T).wheelRpm, crawlerZ: T => { const f4 = frontZ(T, 4); return T > BUILD[0] + 4 && T < CAL[1] && f4 > 60 ? Math.min(f4 > 1e8 ? Z_MZ : f4, Z_MZ) - 46 : null; }, POI: P.POI, mapOut, mapIn: t => Object.assign({}, mapIn(t)) };
STAGE.dbg = () => ({ INS: INS.map(q => ({ at: q.at, r0: q.r0, len: q.len })), DURF, mapOut, mapIn: t => Object.assign({}, mapIn(t)), log: LOG, ndot: NDOT, prof: PROF, stats: P.stats(), by: ORL.G.by, TX, TI, T_RET, T_ARR, TAU_END, L0, cam: T => camAt(T), W, FX, P, HIT, GCAM, PW0, PW1, platXf, C, rodAt, altOf, sOf, tauOf, aOf, FALL, ST, simClock, rateOf, TL, crZ, frontZ, CUT });
})();
