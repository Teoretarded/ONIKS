/* INTERCEPT · sea host: a copy of pc_scan_railgun_film.js (the read-only source) used as the host of the act in the
   standalone page (pc_duel/proto/intercept.html). The base timeline is the scan film's (the director and the radar
   lock, the lay, the charge, the shot); the edits that make it this act are marked INTERCEPT and are what pc_duel's
   film needs to take over: the mount laid on the predicted intercept point (ISCN.AZ / EL), the muzzle speed
   (ISCN.V0), the director and the radar following the orbital target (ISCN.tgtAE, ISCN.tgtW, set each frame by the
   act), no coastal scan, and the act spliced in as an insert (window.IACT) with three optional hooks the host
   honours: mod.baseT(u) the base time drawn under the insert (instead of holding at the splice), mod.baseVis(u) the
   base scene's weight (the act composites it), mod.probe === false (the host's own probe is not drawn).
   The standalone harness maps film time onto three stretches of the base timeline (track, lay, charge and shot),
   then plays the insert. Original header follows. */
/* SCAN · RAILGUN (Point Cloud): the game's SCAN with a source. An Arleigh Burke on station at night, an
   electromagnetic railgun mount in the Mk 45's seat on the foredeck (pc_scan_railgun_parts.js). The power run arrives
   in the power room under the mount (the X-ray open): the valves open and the coolant pumps start (their impellers
   turning, the coolant spiralling out through the volutes), one of the four pulsed alternators comes apart on its guide
   rods and closes, the rotors spin up (x30), the capacitor racks charge module by module; the riser opens and the
   coolant climbs the power column, through the trunnion's rotary union and down the rails' manifold; the cryocoolers
   take the superconducting coils from 300 K to 20 K (x240), frost growing on a cold head, along the helium header and
   down the coil row; the barrel's top half is cut away and current runs into the coils station by station (x60),
   their field swelling across the bore, a scan plane drawing the section; the hydraulic power unit comes up (the pump's
   pistons, the gauge, the accumulators); the director and the radar acquire and lock; the hydraulics lay the mount
   (the rams, the train drives round the ring gear); down to the magazine and the load (the drum, the hoist, the round's
   exploded view, the tray, the rammer, the clamps); the rails charge with the breech cut away (the current's path, the
   force on the armature, the rails pushed apart against the bands). It fires a probe toward the coast (a ballistic
   path at 50°), the probe bursts on the climb 7.9 km up and the lime lightning's leader steps 13 km down onto a coastal
   battery (the lens backing down the channel ahead of it and looking up from the plateau as it lands), which the scan
   identifies part by part. The lens flies home low beside the trail to the ship, as the mount stows. One take, loops.
   Render is a pure function of T. */
(() => {
const { V, R, X, E, rng } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = SK; K.setup({ menuDim: 0, roBack: true });                  // INTERCEPT: no menu band               // (the dots dimmed under the menu row; the readout backed)
const P_ = RGP, XS = P_.XS;
/* raster scale (K.S: raster px per stage px), max quality (renders), smooth fades instead of hard switches */
const RSC = K.S, HQ = K.HQ, SMOOTH = K.SMOOTH;
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = [];
const PROF = STAGE.Q.has('prof') ? {} : null;
let pt0 = 0;
const pf = k => { if (!PROF) return; const t = performance.now(); PROF[k] = (PROF[k] || 0) + t - pt0; pt0 = t; };
const t0load = performance.now();

/* ---------- menu ---------- */
/* INTERCEPT: no menu */

/* ---------- time ---------- */
/* before the shot (base time) the gun's story runs in order, 8-15 s a beat: the power run hands over in the power
   room (B_PR, where the engine insert ends); the valves open and the coolant pumps start; one pulsed alternator comes
   apart and closes, the rotors spin up (x30); the capacitor racks charge; the riser opens and the coolant climbs the
   power column into the gun's manifold; the cryocoolers take the coils from 300 K to 20 K, frost forming on a cold
   head, along the helium header and down the coil row (x240); the barrel is cut away and current runs into the
   superconducting coils station by station (x60), a scan plane drawing the section; the hydraulic power unit comes
   up; the director and the radar acquire and lock; the hydraulics lay the mount; down to the magazine (the
   fabrication insert at T_LD); the load; the rails charge (the heat sink insert at T_RAIL) */
/* (round 3: every mechanism held 4-12 calm s while it works, the moves between them 3+ s) */
const B_PR = 4.0;
const T_VLV = 5.2, T_PMP = 7.0;                                       // the valves open; the coolant pumps start
const T_AX = 18.4, AXL = 10.6;                                        // alternator 3 comes apart, its rotor drawn and turned over, closed
const T_SPIN = T_AX + 11.0, T_SPIN1 = T_SPIN + 4.4;                   // the rotors spin up (x30)
const T_BANK = T_SPIN1 + 2.0, T_BANK1 = T_BANK + 8.0;                 // the racks charge, module by module
const T_CUP = T_BANK1 + .2, T_CUP1 = T_CUP + .6 + 12.6;               // the riser opens; the coolant fills the manifold
const T_CRYO = T_CUP1 + 2.6, T_FH = T_CRYO + 11.2, T_FR = T_FH + 5.4, T_CR1 = T_FR + 5.6;   // cryo (x120): a cold head, the header, the row
const T_CUT = T_CR1 + .3, T_EN = T_CUT + 3.2, T_SL = T_EN + 11.6;    // the cutaway, the coils (x60), the slice
const T_XC = T_SL + 4.6, T_CUT1 = T_XC + 9.2;                         // one coil station drawn apart; the cutaway closed
const enT = k => T_EN + .85 * k;                                      // coil station k energises
const T_HPU = T_CUT1 + 3.4, T_HPU1 = T_HPU + 10.4;                     // the hydraulic power unit comes up
const T_DLK = T_HPU1 + 6.0, T_RLK = T_DLK + 9.4;                      // the director locks; the radar locks
const T_LAY = T_RLK + 8.0, T_TR = T_LAY + .4, T_TR1 = T_LAY + 8.4, T_EL = T_LAY + .6, T_EL1 = T_LAY + 8.6;   // the hydraulics lay the mount
const T_DWN = T_LAY + 12.6;                                           // down to the magazine
/* loader time -> base time: the loader holds XH s with the round at the top of the hoist (its exploded view) */
const T_LD = T_DWN + 5.8, XH = 5.0, LX = 2.9, LD = t => T_LD + t + (t > LX ? XH : 0), T_XP = T_LD + LX;
/* the loader's steps (loader time): the breech block drops, the tray swings into line, the rammer seats the round
   (seen side on) and draws back, the tray swings clear, the block slides shut, the clamps drive home one by one */
const LK = { brc0: 3.5, brc1: 4.1, tin0: 4.2, tin1: 5.3, ram0: 5.8, ram1: 8.2, bk0: 8.3, bk1: 9.4, tout0: 9.3, tout1: 9.9, sh0: 9.9, sh1: 10.7, clp: 14.4, clpD: .24, rail: 18.0 };
const T_RAIL = LD(LK.rail), TF = T_RAIL + 13.0;                       // the rails charge; the round leaves the muzzle
const PRE_X = TF - 39.6;                                              // (the stretch before the shot grew by this in round 2)
const POST_X = 34, DUR0 = 87.8 + PRE_X + POST_X;                   // the base take (old time); (after the shot: + POST_X in round 2)
/* the clock before the shot: x30 through the spin-up, x120 through the cool-down, x60 through the coils' ramp */
const CRYO_X = 120;
const PREW = FILM.warp([{ t: 0, rate: 1 }, { t: T_SPIN - .1, rate: 1 }, { t: T_SPIN + .3, rate: 30 }, { t: T_SPIN1 - .3, rate: 30 }, { t: T_SPIN1 + .1, rate: 1 },
  { t: T_CRYO - .2, rate: 1 }, { t: T_CRYO + .2, rate: CRYO_X }, { t: T_CR1 - .2, rate: CRYO_X }, { t: T_CR1 + .2, rate: 1 },
  { t: T_EN - .3, rate: 1 }, { t: T_EN + .1, rate: 60 }, { t: enT(11) + .5, rate: 60 }, { t: enT(11) + .9, rate: 1 }, { t: DUR0, rate: 1 }]);
/* ---------- inserted sequences ----------
   Self-contained stretches spliced into the take, each with its own camera, models and FX; the base timeline (old
   time T, 0..DUR0) holds while one plays, spinning machinery keeps turning (spin), the sea and the ship's motion run on
   the film's own clock. A module (window.RGE: engine rooms and the power and data runs forward, at old 4.0;
   window.RGM: the round assembled in the magazine, at the loader's start):
     { len, build(ctx), chapters: [{t, title}], cues: [[u, fn]], cam(u, ctx) -> {eye, target, fov rad},
       draw(u, ctx), xray(u, XS, ctx) -> bool (sets the hull X-ray window), room (true: draw the power room too),
       readout(u, ctx) -> {l1, l2, rate}, tags(u, ctx) }   (u: s into the insert) */
/* engine rooms (RGE) at 4.0; the round built in the magazine (RGM) at the loader; the heat sink deployed under the hull
   (RGKD) as the rails charge; slow motion at the burst (RGX); the heat dumped into the sea (RGKR) on the way home */
const INS = [];                                                       // INTERCEPT: the act is placed by the harness below
/* (the later splice points are known only once the flight is laid out: placed in PLACE_INS below) */
function PLACE_INS(tbu, tret) {
  for (const q of INS) { if (q.at === 'TBU') q.at = tbu + (q.mod.at || 0); else if (q.at === 'RET') q.at = tret + (q.mod.at || 0); }
  INS.sort((a, b) => a.at - b.at);
  let off = 0; for (const q of INS) { q.len = q.mod.len; q.r0 = q.at + off; off += q.len; }
}
{ let off = 0; for (const q of INS) if (typeof q.at === 'number') { q.len = q.mod.len; q.r0 = q.at + off; off += q.len; } }
const DUR = DUR0 + INS.reduce((a, q) => a + q.mod.len, 0);
const mapOut = t => { let o = t; for (const q of INS) if (q.at <= t) o += q.len; return o; };   // old time -> film time
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
let TRNOW = 0;
/* a warp's value at old time T, plus what it turned through during the inserts already played (at its rate there) */
const spin = (W, T) => { let v = W(T); for (const q of INS) if (q.at <= T) v += W.rate(q.at) * E.clamp(TRNOW - q.r0, 0, q.len); return v; };
/* periods that divide the take, so the swell and the ship's motion loop exactly */
const PER = p => p;                                                   // INTERCEPT: the act is a stretch of a longer take (no loop)
const TRET1 = DUR0 - 5;                                                // the lens is in off the bow (it leaves the site at TRET0)
const SH = DUR0 - 57.4;                                               // the stow runs this much later than in the 58 s cut
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const pulse = (T, a, b) => kk(T, a, b);

/* ---------- the world: the ship on station, the coast 17 km to the north-north-east ---------- */
const S_POS = [7200, 0, 15600], PSI = Math.atan2(S_POS[0], S_POS[2]);
/* the scan walks the battery one vehicle at a time, the chain lightning leaping on from the last (tel2, sam, rdr, tel1) */
const TOUR_T = [6, 15, 24, 33];                                       // the chain reaches tel2, sam, rdr, tel1 (s after the stroke)
const SITE = K.makeSite({ xf: X.make(R.y(PSI), S_POS), seaR: 3100, landR: 14000, tF: [TOUR_T[3], TOUR_T[0], TOUR_T[2], TOUR_T[1]], chain: [2, -1, 3, 1], nearDim: .55,
  tv: 4.2, tdur: .4, tAge: 4.8, revV: 4.4, revA: 8, crawl: 7, idEnd: 6.2, partT0: .8, partDt: .6, fineR: 72, fineSp: .7 });
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
/* the ship's fine detail (pc_scan_railgun_ship.js, optional): lattice parts that replace some of HD.destroyer's */
const SHIPX = window.RGS ? RGS.build(P_) : { skip: [], parts: [] };
const SHIP = K.lodModel(HD.destroyer(), {}, [.12, .24, .48, .96, 1.92], 101, 1.4, ['gun', ...SHIPX.skip]);
LOG.push(`ship ${(performance.now() - t0load).toFixed(0)} ms`);
const CL = P_.build();
LOG.push(`unit ${(performance.now() - t0load).toFixed(0)} ms (parts ${CL.ms.toFixed(0)}, ${(CL.n0 / 1e6).toFixed(2)} M fine pts)`);
/* gentle motion on station, loop-exact (whole periods in 60 s) */
function shipW(T) {
  const roll = .5 * DEG * Math.sin(TAU * T / PER(12)), pitch = .2 * DEG * Math.sin(TAU * T / PER(7.5) + 1.1), heave = .12 * Math.sin(TAU * T / PER(6));
  return X.make(R.mul(R.x(pitch), R.z(roll)), [0, heave, 0]);
}

/* ---------- the shot's clock: real time to the release, x0.01 through the bore, x0.004 out of the muzzle for MZH s
   (the lens holds there while the sabot comes away and the rings form), back to x1 over MZR s for the flight.
   simAt(T): sim s since the round left the muzzle (negative before) ---------- */
const V0 = ISCN.V0, V1 = 900;                                       // INTERCEPT: the muzzle speed                                            // muzzle 2 300 m/s, 900 m/s at the burst
const LB_ = P_.SLV1 + .06 + P_.EXT - P_.SEAT_Z;                       // bore travel, seated round -> muzzle (m)
const T_BORE = 2 * LB_ / V0, ACC = V0 / T_BORE;                       // its time in the bore (uniform acceleration)
const SLO = .01, SLO2 = .004, MZH = 3.4, MZR = 2.2, W0 = TF - 1.4;
const SIMW = FILM.warp([{ t: 0, rate: 1 }, { t: .2, rate: SLO }, { t: 1.3, rate: SLO }, { t: 1.65, rate: SLO2 }, { t: 1.4 + MZH, rate: SLO2 }, { t: 1.4 + MZH + MZR, rate: 1 }, { t: 40, rate: 1 }]);
const SIMW0 = SIMW(1.4);
const simAt = T => T < W0 ? T - W0 - SIMW0 : SIMW(Math.min(40, T - W0)) - SIMW0 + Math.max(0, T - W0 - 40);
const simRate = T => T < W0 || T - W0 > 40 ? 1 : SIMW.rate(T - W0);
const filmAt = sim => { let lo = W0 - 30, hi = W0 + 39; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (simAt(m) < sim) lo = m; else hi = m; } return (lo + hi) / 2; };
const T_REL = filmAt(-T_BORE);                                        // the breech releases the round
const roundZ = T => { const tau = Math.max(0, simAt(T) + T_BORE); return P_.SEAT_Z + .5 * ACC * tau * tau; };   // its centre in the bore (B z)

/* ---------- the mount's, the room's and the loader's state in film time ---------- */
const AZ = ISCN.AZ, EL = ISCN.EL,                                    // INTERCEPT: laid on the predicted intercept point
  PET = 115 * DEG, NST = P_.NST, NCELL = P_.NCELL;
P_.MAG_CELL.p = [Math.sin(AZ) * P_.HZ, P_.RND_Y0, P_.GZ + Math.cos(AZ) * P_.HZ];        // (the cell under the hoist at the firing train)
const SX = t => t + SH;                                               // the stow's times (late in the take)
const HPUW = FILM.warp([{ t: 0, rate: 0 }, { t: T_HPU + .3, rate: 0 }, { t: T_HPU + 1.1, rate: 1 }, { t: SX(56.6), rate: 1 }, { t: SX(57.2), rate: 0 }, { t: DUR0, rate: 0 }]);
const ROTW = FILM.warp([{ t: 0, rate: 0 }, { t: T_SPIN, rate: 0 }, { t: T_SPIN1, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: TF + 11, rate: 0 }, { t: DUR0, rate: 0 }]);
const ROTX = ROTW;                                                    // (the opened unit is closed again before the spin-up)
const PUMPW = FILM.warp([{ t: 0, rate: 0 }, { t: T_PMP, rate: 0 }, { t: T_PMP + 1.6, rate: 1 }, { t: TF + 3, rate: 1 }, { t: TF + 12, rate: 0 }, { t: DUR0, rate: 0 }]);
const FANW = FILM.warp([{ t: 0, rate: 0 }, { t: T_PMP + .3, rate: 0 }, { t: T_PMP + 2.0, rate: 1 }, { t: TF + 3, rate: 1 }, { t: TF + 12, rate: 0 }, { t: DUR0, rate: 0 }]);
const RPM = 9600, VIS_REV = 2.4, PUMP_RPM = 2950, P_HYD = 21;          // (the hydraulics' working pressure, MPa)
const NMOD = P_.MOD.length;
/* the racks charge one after another, starboard first (rack r: modules 20 r .. 20 r + 19, bottom shelf up) */
const modT = k => T_BANK + .4 + (T_BANK1 - T_BANK - .6) * k / NMOD;
const modLvl = (k, T) => E.ss(modT(k), modT(k) + .3, T) * (1 - E.ss(TF, TF + .12, T));
const brkT = r => modT(r * 20) - .3;
const nCharged = T => { let n = 0; for (let k = 0; k < NMOD; k++) if (modLvl(k, T) > .98) n++; return n; };
const clampT = k => LD(LK.clp) + k * LK.clpD;                       // (wedges driven home one by one, breech -> muzzle)
const T_DRUM = T_LD - 2.2;                                            // the drum indexes the empty cell under the hoist
/* the coolant: the riser to the mount opens at T_RIS; its front runs up the column, through the training structure
   to the starboard trunnion, along the cradle to the breech and down the rails' manifold at V_RIS m/s */
const T_RIS = T_CUP + .6, V_RIS = 2.4;
/* the cryo (x240): the cold heads' second stage from 300 K (tau 330 s); the cold helium front along the headers
   (B z, breech -> muzzle); each station's cold mass at 20 K in turn; the cutaway's stretch of barrel (B z) */
const cryoS = T => Math.max(0, PREW(T) - PREW(T_CRYO));               // sim s of cool-down
const chK = T => 20 + 280 * Math.exp(-cryoS(T) / 330);
const HZ0 = -2.0, HZ1 = P_.RZ1 - .2, T_HF0 = T_FH - .2, T_HF1 = T_FH + 4.8;
const hdrZ = T => HZ0 + (HZ1 - HZ0) * E.sat((T - T_HF0) / (T_HF1 - T_HF0));
const rowT = k => T_FR + .15 + .33 * k;                               // station k's cold mass reaches 20 K
const CUT_A = [P_.BANDS[1] + .12, P_.BANDS[10] - .02], CUT_B = [-2.42, P_.BANDS[3] - .02];   // (the coils' stretch: the top half; the breech: the top-starboard quarter)
const ST = { xp: 0, petal: 0, yaw: 0, el: 0, ext: 0, rec: 0, rot: 0, rate: 0, rotX: 0, rateX: 0, chg: 0, glow: 0,
  hpu: 0, hpuR: 0, acc: 0, hp: 0, stroke: 0, spool: 0, ghS: 0, gh: 0, cryo: 0, chK: 300, cool: 0, frost: 0, hdr: -9, kc: new Float64Array(NST), field: 0, coil: new Float64Array(NST),
  cut: 0, cut2: 0, eoY: 0, eoP: 0, fcY: 0, fcScan: 0, fcLk: 0, trv: 0, elv: 0, rise: -1,
  rod: 0, bell: 0, rtr: 0, pump: 0, pumpR: 0, fan: 0, fanR: 0, drum: 0, hoistY: 0, rnd: 0, tray: 0, brc: 0, ram: 0, ramH: 0, jaw: new Float64Array(P_.BANDS.length), valve: 0 };
const HOIST_B = P_.HY0;                                               // the round's centre in the drum (T y)
const yawAt = T => AZ * kk(T, T_TR, T_TR1) * (1 - kk(T, SX(51.4), SX(54.2)));
const elAt = T => EL * kk(T, T_EL, T_EL1) * (1 - kk(T, SX(51.2), SX(53.9)));
function stateAt(T) {
  const s = ST;
  // the power room: the valves open, the coolant pumps start; alternator 3 opens on its guide rods (rods out, the
  // exciter's end bell off, the rotor drawn) and closes; the rotors spin up
  s.valve = kk(T, T_VLV, T_VLV + 1.3) * 1.5 * TAU;
  s.pump = spin(PUMPW, T) * 3 * TAU; s.pumpR = PUMPW.rate(T);
  s.fan = spin(FANW, T) * 3 * TAU; s.fanR = FANW.rate(T);
  s.rod = kk(T, T_AX, T_AX + .8) * (1 - kk(T, T_AX + 9.6, T_AX + 10.4));
  s.bell = 1.25 * kk(T, T_AX + .6, T_AX + 2.0) * (1 - kk(T, T_AX + 8.4, T_AX + 9.8));
  s.rtr = 1.25 * kk(T, T_AX + 1.8, T_AX + 3.8) * (1 - kk(T, T_AX + 7.0, T_AX + 8.6));
  s.rot = spin(ROTW, T) * VIS_REV * TAU; s.rate = ROTW.rate(T);
  s.rotX = s.rot + 1.5 * PI / 2 * kk(T, T_AX + 3.9, T_AX + 6.9); s.rateX = s.rate;   // (drawn out, it is barred round a pole and a half)
  // the riser: s since it opened (the front's age; -1 shut)
  s.rise = T < T_RIS ? -1 : T - T_RIS;
  // the cryo: the compressors and cold heads run; the cold heads' temperature; the header's cold front; the coil row
  s.cryo = E.ss(T_CRYO - .3, T_CRYO + .2, T) * (1 - E.ss(SX(56.8), SX(57.4), T));
  s.chK = T < T_CRYO ? 300 : chK(T);
  const melt = 1 - kk(T, TF + 6, TF + 14);                           // (the frost goes as the gun stands down)
  s.frost = melt * E.sat((cryoS(T) - 100) / 640);                      // the frost on the cold heads grows over ~12 min
  s.hdr = T < T_HF0 ? -9 : hdrZ(T);
  for (let k = 0; k < NST; k++) s.kc[k] = melt * E.sat((T - rowT(k)) / .7);
  s.cool = melt * E.ss(T_FR, rowT(NST - 1) + .7, T);
  // current into the superconducting coils, station by station (x60); the cutaways: the coils' stretch, the breech
  let f = 0;
  for (let k = 0; k < NST; k++) { const v = kk(T, enT(k), enT(k) + .5) * (1 - kk(T, SX(48.4) + .06 * k, SX(49.0) + .06 * k)); s.coil[k] = v; f += v; }
  s.field = f / NST;
  s.cut = kk(T, T_CUT, T_CUT + 1.8) * (1 - kk(T, T_XC - 1.0, T_XC + .4));   // (closed again before the station is drawn apart)
  s.xc = kk(T, T_XC + .2, T_XC + 1.6) * (1 - kk(T, T_XC + 6.4, T_XC + 7.8));
  s.cut2 = kk(T, T_RAIL + .4, T_RAIL + 2.2) * (1 - kk(T, T_REL - 1.0, T_REL - .2));
  // the hydraulic power unit starts; its pump strokes full while it charges the accumulators to 21 MPa, then idles
  // (it unloads); the pressure dips as the lay draws oil and recovers
  s.hpu = spin(HPUW, T) * 6 * TAU; s.hpuR = HPUW.rate(T);
  const pdown = 1 - E.ss(SX(56.6), SX(57.4), T), draw = E.ss(T_TR, T_TR + 2.2, T) * (1 - E.ss(T_TR1 - 1, T_TR1 + 2.6, T));
  s.hp = E.ss(T_HPU + 1.1, T_HPU + 6.6, T) * (1 - .14 * draw) * pdown;
  s.acc = .88 * s.hp;
  // the muzzle cover, the sensors acquire, train and elevation
  s.yaw = yawAt(T); s.el = elAt(T);
  { const dy = Math.abs(yawAt(T + .03) - s.yaw), de = Math.abs(elAt(T + .03) - s.el);   // (smooth: they ease in and out with the motion)
    s.trv = SMOOTH ? E.sat((dy - 1e-4) / 9e-4) : dy > 1e-4 ? 1 : 0; s.elv = SMOOTH ? E.sat((de - 1e-4) / 9e-4) : de > 1e-4 ? 1 : 0; }
  s.spool = kk(T, T_LAY, T_LAY + .25) * (1 - kk(T, T_TR1 + .2, T_TR1 + .5));
  s.stroke = Math.max(E.ss(T_HPU + .9, T_HPU + 1.5, T) * (1 - E.ss(T_HPU + 6.4, T_HPU + 7.4, T)), .14 * s.hpuR, .75 * Math.max(s.elv, s.trv));
  s.petal = kk(T, T_TR + 4.4, T_TR + 5.1) * (1 - kk(T, SX(54.3), SX(55.2)));
  const acq = kk(T, T_DLK - 1.8, T_DLK - .2) * (1 - kk(T, SX(50.6), SX(51.6)));
  s.eoY = acq * (ISCN.tgtAE[0] - s.yaw); s.eoP = -18 * DEG * (1 - acq) + ISCN.tgtAE[1] * acq;   // INTERCEPT: on the target
  s.fcScan = kk(T, T_RLK - 2.6, T_RLK - 2.2) * (1 - kk(T, T_RLK - .3, T_RLK + .1));
  s.fcLk = E.ss(T_RLK - .1, T_RLK + .2, T) * (1 - E.ss(SX(50.6), SX(51), T));
  s.fcY = kk(T, T_RLK - 2.6, T_RLK - 1.8) * (1 - kk(T, SX(50.6), SX(51.6))) * (ISCN.tgtAE[0] - s.yaw) + s.fcScan * 24 * DEG * Math.sin((T - T_RLK + 2.6) * 3.4);
  // the cheeks ghost while the lens works inside them: the starboard one for the coolant's climb, the hydraulics
  // and the lay; the port one (and the starboard) for the loader
  // (each over a second or more: the occluders fade with them)
  s.ghS = Math.max(kk(T, T_RIS + 1.6, T_RIS + 2.8) * (1 - kk(T, T_CUP1 + .2, T_CUP1 + 1.4)), kk(T, T_CUT1 + .3, T_CUT1 + 1.6) * (1 - kk(T, T_LAY + 10.2, T_LAY + 11.8)),
    kk(T, T_RAIL + .2, T_RAIL + 1.4) * (1 - kk(T, TF + 1.0, TF + 2.4)));   // (round 3: held through the shot: the cheek's block came back with the lens beside it and hid the whole gun)
  const a = T - TF, ar = T > TF - 1.6 ? simAt(T) + T_BORE : -1;      // sim s since the round was released
  s.rec = ar > 0 && ar < 1.6 ? .55 * (ar < .015 ? ar / .015 : Math.exp(-(ar - .015) * 4.2)) : 0;
  s.chg = E.ss(T_RAIL + .6, T_REL - .3, T) * (1 - E.ss(T_REL - .02, T_REL + .25, T));
  s.glow = a > 0 ? Math.exp(-a * 1.2) : 0;
  // the loader: the drum brings the empty cell under the hoist (the magazine fills it), the hoist lifts the round to
  // the tray (the round's exploded view at the top), the grips close, the breech block drops, the tray swings into
  // line, the rammer seats it, all back, the block closes and the clamps lock
  s.drum = kk(T, T_DRUM, T_DRUM + .6) * (1 - kk(T, TF + 8, TF + 9));
  s.gh = kk(T, T_LD - 1.0, T_LD + .2) * (1 - kk(T, LD(13.8), LD(15.2)));
  s.tray = (90 * DEG - EL) * (kk(T, LD(.1), LD(.6)) * (1 - kk(T, LD(LK.tin0), LD(LK.tin1))) + kk(T, LD(LK.tout0), LD(LK.tout1)) * (1 - kk(T, TF + 8, TF + 9)));
  const up = kk(T, LD(.4), LD(2.8)), down = kk(T, LD(6.8), LD(8.8));
  s.hoistY = HOIST_B + (P_.HY1 - HOIST_B) * up * (1 - down);
  s.rnd = T < T_LD ? 3 : T < LD(.4) ? 0 : T < LD(2.8) ? 1 : T < T_REL ? 2 : 3;   // (none) in the drum, on the hoist, in the tray / bore, fired
  s.ram = kk(T, LD(LK.ram0), LD(LK.ram1)) * (1 - kk(T, TF + 8, TF + 9));
  s.ramH = s.ram * (1 - kk(T, LD(LK.bk0), LD(LK.bk1)));
  s.xp = kk(T, T_XP + .15, T_XP + .8) * (1 - kk(T, T_XP + XH - .7, T_XP + XH - .05));     // the round's exploded view
  s.brc = kk(T, LD(LK.brc0), LD(LK.brc1)) * (1 - kk(T, LD(LK.sh0), LD(LK.sh1)));
  const un = kk(T, LD(3.4), LD(3.7));
  for (let k = 0; k < s.jaw.length; k++) s.jaw[k] = un * (1 - kk(T, clampT(k), clampT(k) + .12));
  return s;
}
/* the X-ray window over the power room: open from the hand-over (the engine insert ends on the room), shut bow ->
   stern once the coolant has climbed out of it; open again bow -> stern on the way down to the magazine, shut after
   the shot */
const XSH = TF + 2.9, X_S0 = T_RIS + 4.6, X_S1 = X_S0 + 1.6, X_O0 = T_DWN + .6, X_O1 = X_O0 + 1.8;
const BOX0 = XS.box.slice();
function xrayAt(T) {
  for (let i = 0; i < 6; i++) XS.box[i] = BOX0[i];
  XS.ko = 1; XS.ks = 1;
  if (T >= B_PR && T < X_S1 + 1.2) {
    XS.zo = BOX0[4]; XS.ko = 0;
    XS.zs = T < X_S0 ? 99 : 57.6 - 17.2 * kk(T, X_S0, X_S1); XS.ks = 1 - E.ss(X_S1 + 1, X_S1 + 1.2, T);
    return true;
  }
  if (T < X_O0 || T > XSH + 1.2) { XS.zo = 99; XS.zs = 99; return false; }
  XS.zo = 57.6 - 17.2 * kk(T, X_O0, X_O1); XS.ko = 1 - E.ss(X_O1 + 1.5, X_O1 + 2.4, T);
  XS.zs = T < XSH ? 99 : 57.6 - 17.2 * kk(T, XSH, XSH + 1.2); XS.ks = 1 - E.ss(XSH + 1, XSH + 1.2, T);
  return true;
}
const isOpen = z => XS.zo < 90 && z > XS.zo && z < XS.zs && z > XS.box[4] && z < XS.box[5];
const allOpen = (z0, z1) => XS.zo < 90 && XS.zo < z0 && XS.zs > z1;

/* ---------- transforms ---------- */
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const pivX = (a, h) => { const Rm = R.x(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const M_S = tr(P_.M0[0], P_.M0[1], P_.M0[2]);                                 // M -> ship
const MOD_L = P_.MOD.map(m => X.make(m.s > 0 ? R.I() : R.y(PI), m.p));         // module -> ship
const ALT_L = P_.ALT.map((c, k) => X.make(P_.ALT_FLIP[k] ? R.y(PI) : R.I(), c));
const PUMP_L = P_.PUMPS.map(p => tr(p[0], p[1], p[2]));                        // pump -> ship
const PCOIL_R = Array.from({ length: P_.PST }, (_, k) => X.make(R.z(k / P_.PST * TAU), [0, 0, 0]));   // stator coil k
const STL = P_.STN.map(z => tr(0, 0, z));                                     // coil station -> B
const ROT_UP = R.x(-PI / 2);                                                  // a round standing up
const XR = {}, XF = {};
function mountXf(Ws, st) {
  XF.W = Ws;
  XR.M = M_S;
  XR.T = X.mul(XR.M, X.make(R.y(st.yaw), [0, 0, 0]));
  XR.C = X.mul(XR.T, X.make(R.x(-st.el), P_.TRN));
  XR.B = st.rec ? X.mul(XR.C, tr(0, 0, -st.rec)) : XR.C;
  XR.E = XR.B;
  XR.tray = X.mul(XR.C, X.make(R.x(-st.tray), [0, 0, P_.TRAY_Z]));
  XR.eoY = X.mul(XR.T, X.make(R.y(st.eoY), [P_.EO_P[0], P_.EO_P[1] + .34, P_.EO_P[2]]));
  XR.eoP = X.mul(XR.eoY, X.make(R.x(-st.eoP), [0, P_.EO_H - .34, 0]));
  XR.fcY = X.mul(XR.T, X.make(R.y(st.fcY), [P_.FC_P[0], P_.FC_P[1] + P_.FC_H, P_.FC_P[2]]));
  for (const k of ['M', 'T', 'C', 'B', 'tray', 'eoY', 'eoP', 'fcY']) XF[k] = X.mul(Ws, XR[k]);
  XF.E = XF.B; XF.P0 = X.mul(Ws, PUMP_L[0]);
  XF.petT = X.mul(XF.B, pivX(-PET * st.petal, P_.PETAL_HINGE(1)));
  XF.petB = X.mul(XF.B, pivX(PET * st.petal, P_.PETAL_HINGE(-1)));
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

/* ---------- the probe's flight: a ballistic path out of the muzzle, burst on the climb ----------
   Integrated in 1 ms steps from the muzzle (MZ0, along DIR0 at V0) under gravity and drag k·(ρ/ρ0)·v² (ρ falling with
   a scale height of 8.5 km; k·V0² = 69 m/s² at sea level). Laid at 50° it flies nearly straight: the burst at S1 =
   4.8 s is 7.9 km up and 6.7 km out at about 2 070 m/s (Mach 6.7), the path bent under 1° (it sags ~110 m below the
   line of fire). The path is kept as samples in sim time; bez(u) / bezT(u) (u = s / S1: the old curve's names kept)
   give its point and unit tangent, ARC / uOfD its length, dOfS, vOfS, sOfD the distance, speed and time along it */
const MZ0 = (() => { const st = Object.assign({}, stateAt(TF - .01), { rec: 0 }); mountXf(shipW(TF), st); return X.ap(XF.E, P_.MZ_E); })();
const DIR0 = (() => X.dir(XF.E, [0, 0, 1]))();
const HDIR = V.norm([DIR0[0], 0, DIR0[2]]);
const S1 = 4.8, K_DRAG = 1.3e-5, FL_DT = .001;
const FL = (() => {
  const n = Math.round(S1 / FL_DT), P = new Float64Array((n + 1) * 3), W = new Float64Array((n + 1) * 3), Dd = new Float64Array(n + 1), Sp = new Float64Array(n + 1);
  let x = MZ0[0], y = MZ0[1], z = MZ0[2], vx = DIR0[0] * V0, vy = DIR0[1] * V0, vz = DIR0[2] * V0, d = 0;
  const acc = (vx, vy, vz, y) => { const k = K_DRAG * Math.exp(-y / 8500) * Math.hypot(vx, vy, vz); return [-k * vx, -k * vy - 9.81, -k * vz]; };
  for (let i = 0; i <= n; i++) {
    const v = Math.hypot(vx, vy, vz), o = i * 3;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; W[o] = vx / v; W[o + 1] = vy / v; W[o + 2] = vz / v; Sp[i] = v; Dd[i] = d;
    // (midpoint step)
    const a1 = acc(vx, vy, vz, y), h = FL_DT * .5, mx = vx + a1[0] * h, my = vy + a1[1] * h, mz = vz + a1[2] * h, a2 = acc(mx, my, mz, y + vy * h);
    x += mx * FL_DT; y += my * FL_DT; z += mz * FL_DT; d += Math.hypot(mx, my, mz) * FL_DT;
    vx += a2[0] * FL_DT; vy += a2[1] * FL_DT; vz += a2[2] * FL_DT;
  }
  return { n, P, W, Dd, Sp };
})();
const FLN = FL.n;
const flI = s => E.clamp(s / FL_DT, 0, FLN);
const bez = (u, out) => {
  const s = u * S1, P = FL.P;
  if (s <= 0 || s >= S1) { const e = s <= 0 ? 0 : FLN * 3, ds = s <= 0 ? s : s - S1, v = s <= 0 ? V0 : FL.Sp[FLN]; for (let k = 0; k < 3; k++) out[k] = P[e + k] + FL.W[e + k] * v * ds; return out; }
  const f = s / FL_DT, i = Math.min(FLN - 1, Math.floor(f)), t = f - i, o = i * 3;
  for (let k = 0; k < 3; k++) out[k] = P[o + k] + (P[o + 3 + k] - P[o + k]) * t;
  return out;
};
const bezT = (u, out) => {
  const f = flI(u * S1), i = Math.min(FLN - 1, Math.floor(f)), t = f - i, o = i * 3, Wt = FL.W;
  for (let k = 0; k < 3; k++) out[k] = Wt[o + k] + (Wt[o + 3 + k] - Wt[o + k]) * t;
  const l = Math.hypot(out[0], out[1], out[2]); out[0] /= l; out[1] /= l; out[2] /= l; return out;
};
const B_TOP = bez(1, [0, 0, 0]);                                      // the burst (the name kept: no longer the top of an arc)
const B_C = bez(.5, [0, 0, 0]);
const lerpA = (A, s) => { const f = flI(s), i = Math.min(FLN - 1, Math.floor(f)); return A[i] + (A[i + 1] - A[i]) * (f - i); };
const dOfS = s => s <= 0 ? V0 * s : s >= S1 ? FL.Dd[FLN] + FL.Sp[FLN] * (s - S1) : lerpA(FL.Dd, s);
const vOfS = s => lerpA(FL.Sp, s);
const sOfD = d => {
  const Dd = FL.Dd; if (d <= 0) return d / V0; if (d >= Dd[FLN]) return S1 + (d - Dd[FLN]) / FL.Sp[FLN];
  let lo = 0, hi = FLN; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Dd[m] < d) lo = m; else hi = m; }
  return (lo + (d - Dd[lo]) / Math.max(1e-9, Dd[hi] - Dd[lo])) * FL_DT;
};
const ARC = (() => { const n = 400, L = new Float64Array(n + 1); for (let i = 0; i <= n; i++) L[i] = dOfS(i / n * S1); return { L, n, len: L[n] }; })();
const uOfD = d => { const L = ARC.L; let lo = 0, hi = ARC.n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < d) lo = m; else hi = m; } return (lo + (d - L[lo]) / Math.max(1e-6, L[hi] - L[lo])) / ARC.n; };
const V_BU = vOfS(S1);                                                // its speed at the burst
const TBU = filmAt(S1);                                               // the burst
/* the burst hangs; the stepped leader runs down to the battery (x0.015: ~13 km at ~2·10^5 m/s takes ~65 ms); the
   return stroke at TB */
const HANG = 1.1, LEAD = 4.4, T_LEAD = TBU + HANG, TB = T_LEAD + LEAD;
const LEAD_SIM = V.dist(B_TOP, S_HIT) / 2e5, LEAD_RATE = LEAD_SIM / LEAD;
const TRET0 = TB + TOUR_T[3] + 4;                                     // the lens leaves the site
PLACE_INS(TBU, TRET1 - 3);
const climbS = T => T <= TF ? 0 : T >= TBU ? S1 : simAt(T);
const climbRate = T => T <= TF - 1.6 || T >= TBU ? 1 : simRate(T);
const probeAt = (s, out) => bez(uOfD(dOfS(s)), out);
const CHAPTERS = [
  { t: 0, title: 'Station' }, { t: B_PR, title: 'Power room' }, { t: T_CUP, title: 'Coolant' }, { t: T_CRYO, title: 'Cryo' }, { t: T_CUT, title: 'Coils' },
  { t: T_HPU - 1.0, title: 'Hydraulics' }, { t: T_DLK - 2.4, title: 'Sensors' }, { t: T_LAY, title: 'Lay' }, { t: T_DWN, title: 'Magazine' }, { t: T_LD, title: 'Load' }, { t: T_RAIL, title: 'Charge' },
  { t: T_REL - .3, title: 'Fire' }, { t: TF + MZH + .3, title: 'Flight' }, { t: TBU - .2, title: 'Strike' }, { t: TB + .4, title: 'Scan' }, { t: TRET0, title: 'Return' }, { t: 48.4 + SH - .6, title: 'Stow' },
];
/* the sabot: three petals round the round; at the muzzle they peel off, slow in the air and fall away */
const BOLT = new K.Bolt({ top: B_TOP, hit: S_HIT, seed: 1402, depth: 9, nb: 14, rough: .4, spark: 26 });
const SWIRL = (() => { const r = rng(919), A = new Float32Array(200 * 4); for (let i = 0; i < 200; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r(); A[i * 4 + 2] = (r() - .5); A[i * 4 + 3] = .6 + .8 * r(); } return A; })();
const P3 = [0, 0, 0];

/* ---------- camera ---------- */
/* blend two look points by direction (a near point and a far one lerped by position swing the view all at once) */
function lookMix(eye, a, b, w) {
  const da = V.norm(V.sub(a, eye)), db = V.norm(V.sub(b, eye)), d = V.norm(V.lerp(da, db, w));
  return V.mad(eye, d, E.mix(V.dist(eye, a), V.dist(eye, b), w));
}

/* the side of the line of fire the lens works from (the starboard quarter, where it watches the mount) */
const MW = [0, P_.GY + 2.4, P_.GZ], SIDE = (() => { const q = [HDIR[2], 0, -HDIR[0]], r = V.sub([32, 14.5, 74], MW); return V.dot(q, r) > 0 ? q : V.mul(q, -1); })();
/* in the plane of the arc, square to the flight path and up */
const NUP = t => { const n = V.cross(SIDE, t); return n[1] < 0 ? V.mul(n, -1) : n; };
/* the shot through the bore: beside the middle of the barrel, then beside the muzzle */
const EOFF = V.add(V.add(V.mul(SIDE, 8.2), [0, .5, 0]), V.mul(DIR0, -1.6));
const EM = V.add(MZ0, EOFF), TM = V.mad(MZ0, DIR0, 1.8);
const RW = [0, 0, 0];
function camBore(T) {
  const back = LB_ - (roundZ(T) - P_.SEAT_Z);
  for (let k = 0; k < 3; k++) RW[k] = MZ0[k] - DIR0[k] * back;
  return { eye: V.add(RW, EOFF), target: V.mad(RW, DIR0, 1.8), fov: 46 * DEG };
}

/* the opening (world): the lens closes on the ship from the sea until the engine insert takes over at B_PR (the
   stow at the end of the take runs the same keys before 0) */
const PATH_O = FILM.path([
  { t: -8, eye: [150, 55, 190], target: [0, 9, 26], fov: 32 },
  { t: -4, eye: [64, 22, 110], target: [0, 10, 44], fov: 32 },
  { t: 0, eye: [36, 14.5, 84], target: [0, 10, 48], fov: 32 },
  { t: 3.4, eye: [21, 11.2, 65], target: [1.5, 8.6, 49], fov: 34 },
  { t: 4.0, eye: [19.6, 11, 63], target: [1.9, 8.5, 49], fov: 33 },               // (the engine insert starts here)
]);
/* a path of keys [t, eye, target, fov (deg)]: Hermite through them with Catmull-Rom tangents (as FILM.path), but a
   key equal to its neighbour (a hold) and the ends are rests (zero tangent): eased in and out of every hold */
function pathR(keys) {
  const n = keys.length;
  const same = (a, b) => !!a && !!b && V.dist(a[1], b[1]) < 1e-4 && V.dist(a[2], b[2]) < 1e-4 && Math.abs(a[3] - b[3]) < 1e-4;
  // (round 3: the look as yaw, pitch and log distance from the eye, unwrapped: a turn runs evenly over its move instead
  // of the look point swinging past the lens)
  const val = k => { const d = V.sub(k[2], k[1]); return [k[1][0], k[1][1], k[1][2], Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2])), Math.log(V.len(d)), k[3]]; };
  const VK = keys.map(val);
  for (let i = 1; i < n; i++) { while (VK[i][3] - VK[i - 1][3] > PI) VK[i][3] -= TAU; while (VK[i][3] - VK[i - 1][3] < -PI) VK[i][3] += TAU; }
  const M = keys.map((k, i) => {
    if (i === 0 || i === n - 1 || same(k, keys[i - 1]) || same(k, keys[i + 1])) return [0, 0, 0, 0, 0, 0, 0];
    const a = VK[i - 1], v = VK[i], b = VK[i + 1], d0 = keys[i][0] - keys[i - 1][0], d1 = keys[i + 1][0] - keys[i][0];
    return v.map((x, c) => {                                          // (monotone: no overshoot, a key between two nearly equal ones holds)
      const s0 = (x - a[c]) / d0, s1 = (b[c] - x) / d1; if (s0 * s1 <= 0) return 0;
      const m = (b[c] - a[c]) / (d0 + d1); return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(s0), Math.abs(s1)));
    });
  });
  const O = new Float64Array(7);
  return t => {
    t = E.clamp(t, keys[0][0], keys[n - 1][0]);
    let i = 0; while (i < n - 2 && keys[i + 1][0] <= t) i++;
    const dt = keys[i + 1][0] - keys[i][0] || 1, u = E.clamp((t - keys[i][0]) / dt, 0, 1), u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, a = VK[i], b = VK[i + 1], ma = M[i], mb = M[i + 1];
    for (let c = 0; c < 7; c++) O[c] = a[c] * h00 + ma[c] * dt * h10 + b[c] * h01 + mb[c] * dt * h11;
    const L = Math.exp(O[5]), cp = Math.cos(O[4]);
    return { eye: [O[0], O[1], O[2]], target: [O[0] + cp * Math.sin(O[3]) * L, O[1] + Math.sin(O[4]) * L, O[2] + cp * Math.cos(O[3]) * L], fov: O[6] * DEG };
  };
}
/* the mount laid (train AZ, elevation EL) and stowed: T and B points -> ship */
const LAID_T = X.mul(M_S, X.make(R.y(AZ), [0, 0, 0])), LAID_B = X.mul(LAID_T, X.make(R.x(-EL), P_.TRN));
const tS = p => X.ap(LAID_T, p), bS = p => X.ap(LAID_B, p), b0S = p => [p[0], p[1] + P_.M0[1] + P_.TRN[1], p[2] + P_.M0[2] + P_.TRN[2]];
/* where the shot's lens starts beside the seated round (pc_scan_railgun_shot.js, its bore view): the charge ends near it */
const SEAT_S = bS([0, 0, P_.SEAT_Z]);
const BORE_E = V.add(V.add(V.add(SEAT_S, V.mul(SIDE, 5.6)), V.mul(NUP(DIR0), .8)), V.mul(DIR0, -1.2)), BORE_T = V.mad(SEAT_S, DIR0, .5);
const CSC = b0S([.5, P_.KY, P_.STN[4] - .14]);                        // the cold head the lens watches frost over (station 4, starboard)
/* before the shot (ship frame: the lens rides with the ship in the close work): each mechanism held while it works
   (a key repeated is a hold), eased moves between them that never cross a subject's axis close up. Keys before B_PR:
   the lead-in the engine insert's power run blends into */
const RAD_H = [P_.FC_P[0], P_.FC_P[1] + P_.FC_H + P_.M0[1], P_.FC_P[2] + P_.M0[2]], DIR_H = [P_.EO_P[0], P_.EO_P[1] + P_.EO_H + P_.M0[1], P_.EO_P[2] + P_.M0[2]];
const RBR = (deg, d, up) => { const b = AZ + deg * DEG; return [Math.sin(b) * d, up, Math.cos(b) * d]; };   // (a point at a bearing off the line of fire, round the radar)
const PUMP_E = [1.35, 2.75, 43.35], PUMP_T = [.6, 1.85, 41.95];
const ROT_E = [-.75, 3.75, 47.9], ROT_T = [2.2, 2.4, 46.2];
const SPIN_E = [-1.1, 5.5, 51.4], SPIN_T = [.3, 2.4, 44.0], RACK_E = [.3, 5.4, 54.6], RACK_T = [0, 2.8, 48.0];
const UNI_E = [3.4, 10.85, 52.4], UNI_T = [1.0, 9.55, 50.5];
const ROW_E = b0S([1.35, 1.25, 10.9]), ROW_T = b0S([.15, .05, 5.8]);
const CUT_E = b0S([1.7, 2.3, 10.1]), CUT_T = b0S([0, -.35, 4.6]);
const XC_E = b0S([2.6, 1.4, 6.6]), XC_T = b0S([.2, .1, 4.37]);
const HPU_E = [3.7, 2.2 + P_.M0[1], -2.6 + P_.M0[2]], HPU_T = [1.95, 1.2 + P_.M0[1], -3.45 + P_.M0[2]];
const LAY_E = [3.6, 9.4, 52.6], LAY_T = [1.3, 8.6, 50.0], WIDE_E = [11.5, 11.2, 39.6], WIDE_T = [1.4, 12.0, 51.4];
const SIDE_E = bS([3.5, .5, -3.1]), SIDE_T = bS([0, -.1, -3.0]), CLP_E = tS([5.6, 3.4, 1.2]), CLP_T = bS([0, 0, 3.0]);
const CHG_E = bS([2.4, 1.6, -.4]), CHG_T = bS([0, .05, -1.1]);
const PATH_P = pathR([
  [1.0, [-.4, 4.8, 48.0], [.2, 2.0, 42.6], 48],
  // the power room: aft over the valve header at the two coolant pumps; the valves open
  [B_PR, [.2, 4.35, 46.8], [.3, 1.9, 42.2], 46],
  [T_VLV + 1.0, [.35, 4.1, 46.4], [.35, 1.9, 42.2], 45],
  // a pump starts: in on its volute, the impeller turning, the coolant spiralling out of it (held 6 s)
  [T_PMP + 2.2, PUMP_E, PUMP_T, 37],
  [T_PMP + 8.2, V.add(PUMP_E, [-.05, .05, -.05]), PUMP_T, 36],
  // across to alternator 3, from the aisle (the side its parts slide out on): rods, end bell ...
  [T_AX + .4, [-.4, 4.4, 47.6], [2.3, 2.5, 45.8], 44],
  [T_AX + 2.0, [-.38, 4.3, 47.5], [2.3, 2.5, 45.85], 44],
  // ... in on the rotor drawn out, barred round so its four poles pass (held 3 s), and back
  [T_AX + 3.8, ROT_E, ROT_T, 42],
  [T_AX + 7.0, V.add(ROT_E, [-.05, .05, .05]), ROT_T, 42],
  [T_AX + 9.0, [-.8, 4.6, 48.4], [2.3, 2.5, 45.2], 46],
  [T_AX + 9.4, [-.82, 4.62, 48.45], [2.3, 2.5, 45.2], 46],
  // the spin-up (x30): up and forward over the aisle, all four alternators, the rpm dial
  [T_SPIN + 1.8, SPIN_E, SPIN_T, 52],
  [T_SPIN1 + 1.4, V.add(SPIN_E, [.05, .05, .1]), SPIN_T, 52],
  // the racks charge, module by module, down the aisle from its forward end; the riser opens at its foot
  [T_BANK + 2.6, RACK_E, RACK_T, 58],
  [T_RIS + 1.2, V.add(RACK_E, [0, .1, -.1]), V.add(RACK_T, [0, .1, 0]), 58],
  // the coolant climbs the power column, out through the deck to the starboard trunnion ...
  [T_RIS + 3.4, [3.2, 8.8, 54.0], [.6, 8.6, 49.6], 52],
  // ... through the rotary union and down the rails' manifold under the barrel (held 5.5 s)
  [T_RIS + 5.8, UNI_E, UNI_T, 54],
  [T_CUP1 - .4, V.add(UNI_E, [-.1, .05, .2]), UNI_T, 54],
  // the cryo (x120): a cold head frosting over, from 2.5 m (held 6 s) ...
  [T_CRYO + 1.0, V.add(CSC, [1.7, 1.0, 1.5]), V.add(CSC, [0, .2, 0]), 24],
  [T_CRYO + 7.0, V.add(CSC, [1.75, 1.05, 1.55]), V.add(CSC, [0, .2, 0]), 24],
  // ... a crane up and forward to the header and the row together: the cold front runs along the header toward the
  // lens (5 s), then the frost line down the row (5 s)
  [T_CRYO + 11.0, ROW_E, ROW_T, 46],
  [T_CR1 - .2, V.add(ROW_E, [.08, .08, -.2]), V.add(ROW_T, [0, -.05, -.2]), 46],
  // the barrel cut away, current into the coils breech -> muzzle (12 s), the scan plane draws the section
  [T_CUT + 2.8, CUT_E, CUT_T, 46],
  [T_SL + 3.2, V.add(CUT_E, [-.1, -.2, -.8]), V.add(CUT_T, [0, 0, -.2]), 46],
  // one station drawn apart and named (held 5 s)
  [T_XC + 1.6, XC_E, XC_T, 40],
  [T_XC + 6.4, V.add(XC_E, [.05, .05, .1]), XC_T, 40],
  // over the gunhouse to the hydraulics
  [T_CUT1 + 1.4, [5.8, 13.4, 50.8], [1.6, 9.4, 46.8], 46],
  // the hydraulic power unit, its cheek cut away, from 2 m (held 8 s): the motor, the pump's swash plate tilting, the dial
  [T_HPU + .6, HPU_E, HPU_T, 46],
  [T_HPU + 8.8, V.add(HPU_E, [.05, .05, -.1]), HPU_T, 46],
  [T_HPU + 9.9, V.mad(HPU_E, V.norm(V.sub(HPU_E, HPU_T)), 1.0), HPU_T, 46],                // (backing straight out first)
  [T_HPU1 + 1.8, [1.6, 12.4, 49.4], V.add(DIR_H, [1.2, -.3, -.4]), 40],
  // the director: its ball turns onto the bearing and locks (held 5 s, its view inset)
  [T_HPU1 + 3.8, V.add(DIR_H, [.6, .6, 2.4]), V.add(DIR_H, [0, -.02, 0]), 24],
  [T_DLK + 3.0, V.add(DIR_H, [.64, .62, 2.42]), V.add(DIR_H, [0, -.02, 0]), 24],
  // the radar: its array searches and locks, the beam's cone out to the target (held 5 s)
  [T_DLK + 5.0, [-.5, P_.M0[1] + 5.5, P_.M0[2] + 3.0], [.1, P_.M0[1] + 3.5, P_.M0[2] - 2.0], 44],   // (over the roof: the director and the radar together)
  // (in front three-quarter while its tiles step the beam; at the lock it comes round behind it, the cone running
  // out ahead toward the coast)
  [T_RLK - 2.2, V.add(RAD_H, RBR(-50, 2.6, .62)), V.add(RAD_H, RBR(0, .12, .3)), 28],
  [T_RLK + 3.2, V.add(RAD_H, RBR(-52, 2.64, .64)), V.add(RAD_H, RBR(0, .12, .3)), 28],
  // the lay: the elevation ram (oil running into it) and the train pinion walking round the ring gear, close (6 s) ...
  [T_LAY + .8, LAY_E, LAY_T, 48],
  [T_LAY + 6.8, V.add(LAY_E, [.05, .1, .05]), V.add(LAY_T, [0, .2, 0]), 48],
  // ... and wide from the starboard quarter: it trains and elevates
  [T_LAY + 10.8, WIDE_E, WIDE_T, 52],
  [T_DWN + .2, V.add(WIDE_E, [.4, .1, .6]), V.add(WIDE_T, [0, .4, 0]), 52],
  // down to the magazine
  [T_LD - 1.6, [1.1, 5.6, 44.8], [-.45, 3.1, 47.62], 44],
  [T_LD, [1.1, 5.5, 44.9], [-.45, 3.0, 47.62], 44],
  // the hoist; the round at the top, its exploded view
  [LD(1.6), [1.7, 6.3, 45.4], [-.45, 5.0, 47.62], 44],
  [T_XP + .3, [1.0, 7.6, 45.5], [-.45, 7.15, 47.62], 44],
  [T_XP + XH - .6, [1.02, 7.6, 45.55], [-.45, 7.15, 47.62], 44],
  [LD(3.9), [1.6, 7.75, 44.4], [-.45, 7.15, 47.62], 46],
  // the tray, the rammer seating the round and drawing back, the block sliding shut: side on (held 5 s)
  [LD(5.9), SIDE_E, SIDE_T, 50],
  [LD(10.8), V.add(SIDE_E, [0, .05, .1]), SIDE_T, 50],
  [LD(11.7), V.mad(V.add(SIDE_E, [0, .05, .1]), V.norm(V.sub(SIDE_E, SIDE_T)), 1.2), SIDE_T, 52],
  // the clamps drive home breech -> muzzle
  [LD(14.6), CLP_E, CLP_T, 56],
  [T_RAIL, CLP_E, CLP_T, 56],
  // the rails charge: the breech cut away, the round seated, the current's path and the forces
  [T_RAIL + 3.0, CHG_E, CHG_T, 42],
  [T_REL - 1.0, V.add(CHG_E, [-.15, -.15, -.15]), V.add(CHG_T, [0, 0, -.08]), 41],
  [T_REL + .5, BORE_E, BORE_T, 42],
]);
STAGE.r3 = { B_PR, T_VLV, T_PMP, T_AX, T_SPIN, T_SPIN1, T_BANK, T_BANK1, T_CUP, T_RIS: T_CUP + .6, T_CUP1, T_CRYO, T_FH, T_FR, T_CR1, T_CUT, T_EN, T_SL, T_XC, T_CUT1, T_HPU, T_HPU1, T_DLK, T_RLK, T_LAY, T_DWN, T_LD, T_XP, XH, LK, T_RAIL, TF, LD };   // (round 3: the beat times, for checks)
const shipShot = s => { const Ws = shipW(TRNOW); s.eye = X.ap(Ws, s.eye); s.target = X.ap(Ws, s.target); return s; };
const PATH_A = t => t < B_PR ? PATH_O(t) : shipShot(PATH_P(t));
const camLead = t => shipShot(PATH_P(t));                             // (the lead-in, for the engine insert's hand-over)
const PB = [0, 0, 0], EB = [0, 0, 0], TG = [0, 0, 0];
/* out of the muzzle (x0.01): the lens holds beside it and lifts its eye after the round */
function camF1(T) {
  const d = dOfS(climbS(T)), w = E.ss(TF, TF + .9, T);
  return { eye: V.mad(EM, DIR0, -.6 * w), target: V.mad(TM, DIR0, Math.min(34, d * .7) * w), fov: 46 * DEG };
}
/* the chase: the lens rides just ahead of the probe and to one side, looking back at it: the trail runs away
   behind it, down to the ship and the sea; it drops back and opens out as the probe climbs */
function camRig(T) {
  const s = climbS(T), u = uOfD(dOfS(s)); bez(u, PB); bezT(u, TG);
  const n = NUP(TG), g = E.ss(TF + 2.0, TF + 4.6, T);
  const dF = E.mix(9, 34, g), dS = E.mix(9, 64, g), dU = E.mix(2.5, 18, g), back = E.mix(7, 40, g);
  const eye = [0, 0, 0]; for (let k = 0; k < 3; k++) eye[k] = PB[k] + TG[k] * dF + SIDE[k] * dS + n[k] * dU;
  return { eye, target: V.mad(PB, TG, -back), fov: E.mix(52, 60, g) * DEG };
}
/* the wide: the lens backs off square to the line of fire, farther as the probe climbs, keeping the ship low in
   frame and the arc across it (the Scale shot); it closes on the probe as it tops out (the burst framed big), then
   opens on the whole stroke as the leader runs down to the coast */
const MIDS = V.lerp(B_TOP, S_HIT, .5);
function camB(T) {
  probeAt(climbS(T), PB);
  const h = PB[1] - MW[1], x = (PB[0] - MW[0]) * HDIR[0] + (PB[2] - MW[2]) * HDIR[2];
  const off = 70 + 1.05 * Math.hypot(h, x);
  for (let k = 0; k < 3; k++) EB[k] = MW[k] + SIDE[k] * off + HDIR[k] * .42 * x - HDIR[k] * 30;
  EB[1] = MW[1] + 22 + .36 * h;
  const eye = EB.slice();
  const t0 = V.lerp(MW, PB, .47); t0[1] += .1 * h;
  const z = E.ss(TBU - 2.4, TBU - .1, T), l = E.ss(T_LEAD - .2, T_LEAD + 1.4, T);
  const target = lookMix(eye, lookMix(eye, t0, B_TOP, z), MIDS, l);
  return { eye, target, fov: (58 - 48 * z + 42 * l) * DEG };
}
const E21 = camB(TBU).eye;
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
/* yaw / pitch blend of two look points (turns the short way round, never through a degenerate direction) */
function lookTurn(eye, a, b, w) {
  const da = V.sub(a, eye), db = V.sub(b, eye);
  const ya = Math.atan2(da[0], da[2]), pa = Math.atan2(da[1], Math.hypot(da[0], da[2]));
  let yb = Math.atan2(db[0], db[2]); const pb = Math.atan2(db[1], Math.hypot(db[0], db[2]));
  while (yb - ya > PI) yb -= TAU; while (yb - ya < -PI) yb += TAU;
  const y = ya + (yb - ya) * w, p = pa + (pb - pa) * w, L = E.mix(V.len(da), V.len(db), w);
  return [eye[0] + Math.cos(p) * Math.sin(y) * L, eye[1] + Math.sin(p) * L, eye[2] + Math.cos(p) * Math.cos(y) * L];
}

/* the scan: the lens backs down the stroke's channel onto the battery ahead of the leader and looks up it as it lands
   (camStrike), then walks round the battery with the chain lightning, one vehicle at a time (site frame: +Z inland,
   the strike at (2, 13)). Per vehicle it is down on the ground (0.9-1.1 m up, looking up at it) a second before the
   chain leaps onto it and drifts slowly round it for 5 s while the scan runs over it (the hold), then swings on to the
   next in 4 s. The look turns one way the whole time: out to sea under the stroke, round over the battery (the TELs
   from inland, the Pantsir from the west, the radar from the sea, tel1 from the east) and out to sea again on the
   crane, a full turn in about 40 s */
const SXF = SITE.XF, ST_ = p => X.ap(SXF, p);
const TOUR_ORD = [1, 3, 2, 0];                                        // tel2, sam, rdr, tel1 (VEH_DEF order)
/* a view of vehicle v from bearing brg (deg, site frame: 0 inland, 90 +X) at d m, the eye h m over the ground there,
   looking at th m over its base */
const VIEW = (v, brg, d, h, th, fov) => { const b = brg * DEG, x = v.x + Math.sin(b) * d, z = v.z + Math.cos(b) * d; return { eye: ST_([x, SITE.ground(x, z) + h, z]), target: ST_([v.x, SITE.ground(v.x, v.z) + th, v.z]), fov }; };
const TK = (() => {
  const [tel2, sam, rdr, tel1] = TOUR_ORD.map(k => SITE.V[k]);
  // the look's bearing falls the whole way round (each vehicle seen drifting the same way as the swings); the first
  // view of each low and looking up as the chain lands on it
  const views = [
    [VIEW(tel2, 20, 21, 1.0, 2.4, 44), VIEW(tel2, -20, 22, 3.4, 2.0, 44)],
    [VIEW(sam, -74, 18, 1.0, 2.6, 44), VIEW(sam, -106, 19, 4.0, 2.2, 44)],
    [VIEW(rdr, -148, 22, 1.1, 6.0, 52), VIEW(rdr, -184, 24, 4.4, 5.0, 50)],
    [VIEW(tel1, -226, 20, 1.0, 2.4, 44), VIEW(tel1, -258, 22, 4.6, 2.0, 44)],
  ];
  const keys = [];
  views.forEach(([A, B], i) => {
    if (i) { const P = keys[keys.length - 1], tm = (P.t + TB + TOUR_T[i] - 1) / 2; keys.push({ t: tm, eye: V.add(V.lerp(P.eye, A.eye, .5), [0, 3.4, 0]), target: null, fov: (P.fov + A.fov) / 2 }); }
    keys.push(Object.assign({ t: TB + TOUR_T[i] - 1 }, A), Object.assign({ t: TB + TOUR_T[i] + 4 }, B));
  });
  // the look as yaw, pitch and log distance per key (unwrapped; a swing's middle key takes the mean of its neighbours)
  const lk = k => { const d = V.sub(k.target, k.eye); return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2])), Math.log(V.len(d))]; };
  keys.forEach((k, i) => { if (k.target) k.lk = lk(k); });
  let py = null;
  keys.forEach(k => { if (!k.lk) return; if (py !== null) { while (k.lk[0] - py > PI) k.lk[0] -= TAU; while (k.lk[0] - py < -PI) k.lk[0] += TAU; } py = k.lk[0]; });
  keys.forEach((k, i) => { if (!k.lk) k.lk = keys[i - 1].lk.map((v, j) => (v + keys[i + 1].lk[j]) / 2); });
  return keys;
})();
const TKP = FILM.path(TK.map(k => ({ t: k.t, eye: k.eye, target: k.lk, fov: k.fov })));
function PATH_S(T) {
  const s = TKP(T), [y, p, l] = s.target, L = Math.exp(l);
  s.target = [s.eye[0] + Math.cos(p) * Math.sin(y) * L, s.eye[1] + Math.sin(p) * L, s.eye[2] + Math.cos(p) * Math.cos(y) * L];
  return s;
}
/* the strike. The stroke's channel smoothed (a running mean over a sixth of it, by the bolt's own index, so the
   leader's tip, drawn at index reach x (n - 1), runs along it), its ends kept */
const CHS = (() => {
  const m = BOLT.main, nm = m.length - 1, n = 100, A = [];
  const at = r => { const f = E.clamp(r, 0, 1) * nm, i = Math.min(nm - 1, Math.floor(f)), t = f - i; return V.lerp(m[i], m[i + 1], t); };
  for (let i = 0; i <= n; i++) { let a = [0, 0, 0]; for (let k = -8; k <= 8; k++) a = V.add(a, at(i / n + k / 96)); A.push(V.mul(a, 1 / 17)); }
  const c0 = V.sub(B_TOP, A[0]), c1 = V.sub(S_HIT, A[n]);
  return A.map((q, i) => V.add(q, V.add(V.mul(c0, 1 - i / n), V.mul(c1, i / n))));
})();
const chAt = (r, out) => { const f = E.clamp(r, 0, 1) * 100, i = Math.min(99, Math.floor(f)), t = f - i; for (let k = 0; k < 3; k++) out[k] = CHS[i][k] + (CHS[i + 1][k] - CHS[i][k]) * t; return out; };
const reachS = T => Math.pow(E.sat((T - T_LEAD) / LEAD), 1.1);          // the leader's reach (drawn stepped, every .06 s)
/* The lens starts 1.1 km off the cloud (P0, where the burst's pull-out hands over, TS0) and backs down
   along it ahead of the leader, its distance to the landing spot falling by equal factors, looking back up at the
   leader's tip; it lands on the plateau 110 m inland of the strike (P1, TS1) a second before the leader does, its
   look settling to 10° up toward the strike (the channel runs up from the battery to the cloud across the frame,
   the coast and the sea beyond), holds through the return stroke, then glides to the first vehicle (TK[0]) */
const TS0 = T_LEAD - .3, TS1 = TB - 1.5, TSH = TB + 1.2;
const P1S = (() => { const x = 335, z = 151; return ST_([x, SITE.ground(x, z) + 2.4, z]); })();   // (360 m off to the side: the channel's last steep kilometre in frame)
const Q_LOW = (() => {   // between the strike and the channel's lowest 2 km (both in frame, the strike low in it)
  const yp = q => { const d = V.sub(q, P1S); return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; };
  const [yh, ph] = yp(S_HIT), [ym0, pm] = yp(chAt(.85, [0, 0, 0])); let ym = ym0;
  while (ym - yh > PI) ym -= TAU; while (ym - yh < -PI) ym += TAU;
  const y = yh + (ym - yh) * .5, p = E.clamp(ph + 14 * DEG, (ph + pm) / 2 - 4 * DEG, ph + 26 * DEG);
  return V.add(P1S, V.mul([Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)], 400));
})();
const LDQ = V.norm(V.sub(Q_LOW, P1S));
/* (1.1 km off the cloud, below it on the landing view's line: the look at the cloud already the landing view's) */
const P0S = V.mad(B_TOP, LDQ, -1100);
const DRS = 30 / V.dist(P0S, P1S), STIP = [0, 0, 0];
/* along the line P0S -> P1S by a logistic in log distance: the distance from the cloud grows by equal factors as it
   leaves, the distance to the landing spot falls by equal factors as it arrives (never a leap at either end) */
const KS_ = 1.5 * Math.log(1 / DRS), SG0 = 1 / (1 + Math.exp(KS_ / 2)), SG1 = 1 / (1 + Math.exp(-KS_ / 2));
function strikeEye(T) {
  const u = E.sat((T - TS0) / (TS1 - TS0)), w = .7 * u + .3 * E.ss(0, 1, u), g = (1 / (1 + Math.exp(-KS_ * (w - .5))) - SG0) / (SG1 - SG0);
  return V.add(P0S, V.mul(V.sub(P1S, P0S), g));
}
/* the strike read from the ground: the leader's tip burning bright as it comes down (the kit's leader is a hairline
   from kilometres off), connecting streamers climbing off the battery to meet it in its last 300 m, then the return
   stroke: the lowest kilometre of the channel thickened, white-hot, flickering with the stroke (I), a bloom at its
   foot and a column of light up the channel (no full-frame flash) */
const SFX_A = [0, 0, 0], SFX_B = [0, 0, 0];
const STREAM = (() => { const r = rng(7731), A = []; for (let i = 0; i < 7; i++) A.push([(r() - .5) * 50, (r() - .5) * 50, 14 + 26 * r(), r()]); return A; })();
function strikeFX(T, tb) {
  const m = BOLT.main, nm = m.length - 1;
  if (tb < 0 && tb > -LEAD) {
    const c = tb + LEAD, reach = Math.pow(E.sat(Math.floor(c / .06) * .06 / LEAD), 1.1), i = Math.min(nm, Math.floor(reach * nm)), tp = m[i];
    const dc = V.dist(C.eye, tp), a = .55 + .45 * Math.sin(T * 47);
    K.glowW(tp[0], tp[1], tp[2], E.clamp(9000 / dc, 14, 70), LIME, .55 * a); K.glowW(tp[0], tp[1], tp[2], E.clamp(3000 / dc, 6, 26), HOT, .8);
    // the last few steps behind the tip re-drawn heavier (the stepped leader's fresh channel)
    for (let k = Math.max(1, i - 24); k < i; k++) { const p = m[k - 1], q = m[k], f = (k - i + 24) / 24; K.lineW(p[0], p[1], p[2], q[0], q[1], q[2], 1.2, 2, HOT, .85 * f, LIME, .1 * f, .04 * f); }
    // streamers up off the battery as the tip closes in
    const dh = tp[1] - S_HIT[1];
    if (dh < 320) {
      const g = 1 - dh / 320;
      for (let j = 0; j < STREAM.length; j++) {
        const st = STREAM[j], gl = SITE.groundW(S_HIT[0] + st[0], S_HIT[2] + st[1]);
        SFX_A[0] = S_HIT[0] + st[0]; SFX_A[1] = gl; SFX_A[2] = S_HIT[2] + st[1];
        SFX_B[0] = SFX_A[0] + (tp[0] - SFX_A[0]) * .06 * g; SFX_B[1] = gl + st[2] * g * (.6 + .4 * st[3]); SFX_B[2] = SFX_A[2] + (tp[2] - SFX_A[2]) * .06 * g;
        K.arcW(SFX_A, SFX_B, 300 + j, T, g * (.5 + .5 * st[3]), .45, j & 1 ? LIME : HOT);
      }
    }
    return;
  }
  if (tb < 0 || tb > 3) return;
  // the channel's afterglow: the ionised path fading over ~1.5 s once the flicker has gone
  const ag = .32 * Math.exp(-tb / .8) * E.ss(0, .15, tb);
  if (ag > .01) for (let k = 1; k <= nm; k += 2) { const p = m[k - 1], q = m[Math.min(nm, k + 1)]; K.lineW(p[0], p[1], p[2], q[0], q[1], q[2], 1.4, 1, LIME, ag, LIME, .05 * ag, 0); }
  if (tb > 1.3) return;
  const I = Math.min(1, K.Bolt.stroke(tb)); if (I < .02) return;
  const L0 = Math.floor(nm * .72);
  for (let k = L0 + 1; k <= nm; k++) { const p = m[k - 1], q = m[k], f = (k - L0) / (nm - L0); K.lineW(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, 3, HOT, I * (.6 + .4 * f), LIME, .14 * I, .06 * I); }
  for (let k = L0; k <= nm; k += 6) { const p = m[k]; K.glowW(p[0], p[1], p[2], 40, LIME, .22 * I); }
  if (K.pj(S_HIT[0], S_HIT[1] + 3, S_HIT[2])) {
    const sx = K.PJ[0], sy = K.PJ[1], S = K.S;
    K.softR(sx, sy, 420 * S, 200, 240, 120, .3 * I); K.softR(sx, sy, 140 * S, 236, 252, 214, .7 * I); K.softR(sx, sy, 40 * S, 255, 255, 245, I);
  }
}
function camStrike(T) {
  const K0 = TK[0];
  if (T < TSH) {
    // (the look turning slowly from the cloud to the landing view's fixed direction: the lens backs down the channel's
    //  side looking up it, the leader coming down after it in frame, the battery rising into the frame's foot)
    const eye = strikeEye(T), w = E.ss(TS0 - .2, TS0 + 1.8, T);
    for (let k = 0; k < 3; k++) STIP[k] = eye[k] + LDQ[k] * 400;
    const target = lookTurn(eye, B_TOP, STIP, w);
    return { eye, target, fov: E.mix(50, 62, E.ss(TS0, TS1, T)) * DEG };
  }
  // (its distance to the first view falling by equal factors: it settles onto it instead of sliding past the vehicle)
  const w = E.ss(TSH, K0.t, T), DR = 1.5 / Math.max(2, V.dist(P1S, K0.eye)), f = (Math.pow(DR, w) - DR) / (1 - DR);
  const eye = V.add(K0.eye, V.mul(V.sub(P1S, K0.eye), f));
  return { eye, target: lookTurn(eye, Q_LOW, K0.target, E.ss(TSH, K0.t - .9, T)), fov: E.mix(62, K0.fov, E.ss(TSH, K0.t, T)) * DEG };
}
/* the way home: the lens cranes up and back off tel1, turning out to sea over the battery and its berms (TRET0..TH0),
   then flies home low (under 600 m) beside the stroke's and the trail's ground track on the starboard side, out over
   the cliff and the surf, under the burst's haze, the trail rising over the frame from the ship (FOV 28°, the ship
   marked from the start and growing from a dot, looking a few degrees over it); over the last
   2 km its distance falls by equal factors and it comes in low off the starboard bow (ER at TRET1: the heat sink insert
   splices here), then rises past the hull and glides into the opening view (PATH_A at 0, matched in place and speed) */
const KL = TK[TK.length - 1], CR_E = ST_([-20, 29 + 70, 110]), CR_T = ST_([10, 29, -900]), CR_D = V.norm(V.sub(CR_T, CR_E)), TH0 = TRET0 + 8;
const ER = [30, 6.5, 96], TR_ = [0, 10, 48], VR = [-1.45, 0, -2.85];  // the end of the way home (ship frame ~ world)
const hm3 = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (3 * u2 - 2 * u3) + m1 * dt * (u3 - u2); };
/* the route: a centripetal Catmull-Rom curve through waypoints beside the stroke and the trail (on the starboard side
   of the line of fire), resampled by length */
const HOME = (() => {
  const off = (p, sd, up) => [p[0] + SIDE[0] * sd, p[1] + up, p[2] + SIDE[2] * sd], bz = u => bez(u, [0, 0, 0]), vr = V.norm(VR);
  // (fractions of the way from the battery to the ship along their line; heights above the sea)
  const wp = (f, sd, alt) => { const q = V.lerp(S_HIT, MW, f); return [q[0] + SIDE[0] * sd, alt, q[2] + SIDE[2] * sd]; };
  const W = [CR_E, wp(.035, 160, 250), wp(.2, 420, 470), wp(.42, 520, 540), wp(.62, 500, 500), wp(.8, 380, 330), wp(.93, 220, 130),
    V.mad(ER, vr, -300), V.mad(ER, vr, -80), ER];
  void off; void bz;
  const P = [V.mad(W[0], V.norm(V.sub(W[0], W[1])), 200), ...W, V.mad(ER, vr, 80)], N = 3000, pts = [], cum = [0];
  const tj = (a, b) => Math.pow(Math.max(1e-6, V.dist(a, b)), .5);
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3), n = Math.ceil(N / (P.length - 3));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = t1 + (t2 - t1) * k / n, q = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const a1 = (t1 - t) / t1 * p0[c] + t / t1 * p1[c], a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c], a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
        const b1 = (t2 - t) / t2 * a1 + t / t2 * a2, b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
        q[c] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
      }
      if (pts.length) cum.push(cum[cum.length - 1] + V.dist(pts[pts.length - 1], q));
      pts.push(q);
    }
  }
  const L = cum[cum.length - 1];
  const at = (s, out) => { s = E.clamp(s, 0, L); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; } const k = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]), a = pts[lo], b = pts[hi]; for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * k; return out; };
  /* the pace: eased up to a cruise VC, then the last RJ m by equal factors (the remaining distance plus R0 shrinking at
     KD per second: it arrives at KD·R0 m/s); VC solved so it lands on TRET1 */
  const KD = .8, R0 = V.len(VR) / KD, TF_ = TRET1 - TH0, TA_ = 2.5;
  const tot = vc => { const rj = vc / KD - R0; return (L - rj) / vc + TA_ / 2 + Math.log((rj + R0) / R0) / KD; };
  let lo = 50, hi = 20000; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (tot(m) > TF_) lo = m; else hi = m; }
  const VC = (lo + hi) / 2, RJ = VC / KD - R0, TJ = (L - RJ) / VC + TA_ / 2;
  const sAt = t => t <= 0 ? 0 : t < TA_ ? VC * (t * t * t / (TA_ * TA_) - t * t * t * t / (2 * TA_ * TA_ * TA_)) : t < TJ ? VC * (t - TA_ / 2) : L - ((RJ + R0) * Math.exp(-KD * (t - TJ)) - R0);
  return { L, at, sAt, VC, TJ };
})();
const HE = [0, 0, 0], HT = [0, 0, 0];
function homeEye(T) { return HOME.at(HOME.sAt(T - TH0), HE).slice(); }
/* the crane: up and back off tel1's last view, the look tipping down onto the battery */
const CRP_E = FILM.path([{ t: TRET0, eye: KL.eye, target: KL.target, fov: KL.fov }, { t: TRET0 + 4.6, eye: V.lerp(KL.eye, CR_E, .32), target: KL.target, fov: 46 },
  { t: TH0, eye: CR_E, target: KL.target, fov: 44 }]);
const CRP = T => { const s = CRP_E(T); s.target = lookTurn(s.eye, KL.target, CR_T, E.ss(TRET0, TH0, T)); return s; };   // (the look turned by yaw and pitch)
/* the sea under the way home: the ship-centred field thins out kilometres off, so world-fixed jittered lattices are
   laid round the lens out to 3 km while it flies low: swell glints that stream past and give the height */
function nearSea(T) {
  const a = E.ss(TH0 - 1.5, TH0 + 1.5, T) * (1 - E.ss(TRET1 - 1.5, TRET1, T)); if (a < .02) return;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], ph = T * TAU / PER(6);
  const SI = SITE.XF.R, ST = SITE.XF.T;
  // two lattices: 12 m out to 1.2 km, 30 m from there to 3 km (the near one denser, so the glints under the lens read)
  for (const [G, R0, R1, sd] of [[12, 0, 1200, 3.1], [30, 1200, 3000, 0]]) {
    const i0 = Math.floor((e[0] - R1) / G), i1 = Math.ceil((e[0] + R1) / G), j0 = Math.floor((e[2] - R1) / G), j1 = Math.ceil((e[2] + R1) / G);
    for (let i = i0; i <= i1; i++) {
      const xb = i * G;
      for (let j = j0; j <= j1; j++) {
        const zb = j * G, fx = xb - e[0], fz = zb - e[2]; if (fx * f[0] + fz * f[2] < -G) continue;   // (behind the lens)
        const h1 = K.hh(i + sd, j * 1.37), h2 = K.hh(j + sd, i * .71), x = xb + (h1 - .5) * G, z = zb + (h2 - .5) * G;
        const dx = x - e[0], dz = z - e[2], d2 = dx * dx + dz * dz; if (d2 > R1 * R1 || d2 < R0 * R0) continue;
        const y = .35 * Math.sin(h1 * TAU + ph), dy = y - e[1], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 4) continue;
        const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= K.BW) continue;
        const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= K.BH) continue;
        // (not on the land: the site's coast in its own frame)
        const lx = SI[0] * (x - ST[0]) + SI[6] * (z - ST[2]), lz = SI[2] * (x - ST[0]) + SI[8] * (z - ST[2]);
        if (lz > SITE.coastZ(lx) - 4) continue;
        const b = a * (.3 + .3 * h2 + .5 * Math.pow(Math.max(0, Math.sin(h2 * 40 + ph * 1.7)), 8)) * (1 - .7 * Math.sqrt(d2) / 3000);
        if (b > .02) K.dot(sx, sy, 1, 236, 238, 232, b);
      }
    }
  }
}
function camRet(T) {
  if (T < TH0) return CRP(T);
  const eye = homeEye(T), f = HOME.sAt(T - TH0) / HOME.L;
  // just over the ship (the trail climbing out of it, the sea's glints streaming below), settling onto it on the run in
  const dS = Math.hypot(TR_[0] - eye[0], TR_[2] - eye[2]); HT[0] = TR_[0]; HT[1] = TR_[1] + dS * .035; HT[2] = TR_[2];
  const aim = lookTurn(eye, HT, TR_, E.ss(.8, .97, f));
  return { eye, target: lookTurn(eye, V.mad(eye, CR_D, 60), aim, E.ss(TH0, TH0 + 5, T)), fov: (E.mix(44, 28, E.ss(TH0, TH0 + 5, T)) + 16 * E.ss(TH0 + HOME.TJ - 1, TRET1 - 1, T)) * DEG };
}
/* after the heat sink insert: up past the hull into the opening view (PATH_A at 0: place and speed) */
function camUp(T) {
  const dt = DUR0 - TRET1, u = E.clamp((T - TRET1) / dt, 0, 1), h = .01, a = PATH_A(0), b = PATH_A(h), r = camRet(TRET1), r0 = camRet(TRET1 - h);
  const eye = [0, 0, 0], target = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    eye[k] = hm3(r.eye[k], a.eye[k], (r.eye[k] - r0.eye[k]) / h, (b.eye[k] - a.eye[k]) / h, u, dt);
    target[k] = hm3(r.target[k], a.target[k], (r.target[k] - r0.target[k]) / h, (b.target[k] - a.target[k]) / h, u, dt);
  }
  return { eye, target, fov: hm3(r.fov, a.fov, (r.fov - r0.fov) / h, (b.fov - a.fov) / h, u, dt) };
}
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  return spec ? spec.split(',').map(Number) : null;
})();
let SHOT = null;                                                      // (pc_scan_railgun_shot.js, set below)
function camAt(T) {
  if (!DBGCAM && !STAGE.dbgCam && SHOT && SHOT.cam) { const c = SHOT.cam(T, camBase); if (c) return c; }
  return camBase(T);
}
function camBase(T) {
  const DC = STAGE.dbgCam || DBGCAM;                                  // (?cam= / STAGE.dbgCam: a fixed lens in the ship frame, for framing)
  if (DC) return shipShot({ eye: DC.slice(0, 3), target: DC.slice(3, 6), fov: (DC[6] || 40) * DEG });
  if (T < T_REL - .7) return PATH_A(T);
  if (T < T_REL + .1) return K.blendShot(PATH_A(T), camBore(T), E.ss(T_REL - .7, T_REL + .1, T));
  if (T < TF) return camBore(T);
  if (T < TF + .9) return camF1(T);
  if (T < TF + 2.3) return K.blendShot(camF1(T), camRig(T), E.ss(TF + .9, TF + 2.3, T));
  if (T < TF + 3.9) return camRig(T);
  if (T < TS0 - 1 && T < TF + 6.4) return K.blendShot(camRig(T), camB(T), E.ss(TF + 3.9, TF + 6.4, T));
  if (T < TS0 - 1) return camB(T);                                   // (pc_scan_railgun_shot.js's lens covers these)
  if (T < TK[0].t) return camStrike(T);                             // down the channel ahead of the leader; under the stroke
  if (T < TRET0) return PATH_S(T);
  if (T < TRET1) return camRet(T);
  if (T < DUR0) return camUp(T);
  return PATH_A(T - DUR0);
}

/* ---------- focus: in each beat the parts at work are drawn full, the rest sparse and dim ---------- */
const PH = [0, B_PR, T_AX - .5, T_SPIN - .2, T_BANK - .2, T_CUP, T_CUP1 - 1, T_DWN, T_LD - .1, T_RAIL - .3], NPH = PH.length, PW = new Float64Array(NPH);
const FKEEP = {                 // pre, pumps, explode, spin, racks, riser, mount, drum, loader, charge
  alt: [.7, .3, .35, 1, .25, .05, .05, .06, .06, .15], altX: [.7, .3, 1, 1, .25, .05, .05, .06, .06, .15], rack: [.7, .25, .3, .3, 1, .06, .06, .1, .08, .3], cab: [.7, .25, .3, .3, 1, .06, .06, .08, .06, .3],
  bus: [.7, .3, .35, .45, 1, .12, .1, .12, .1, 1], cool: [.7, 1, .5, .35, .3, 1, .4, .12, .1, .25], pump: [.75, 1, .4, .3, .25, .1, .1, .06, .05, .2], over: [.5, .3, .3, .25, .3, .05, .05, .05, .05, .2],
  floor: [.5, .45, .45, .3, .45, .25, .25, .25, .2, .3], base: [.7, .45, .45, .35, .5, 1, .7, .9, 1, 1], load: [.7, .35, .35, .3, .45, .35, .4, 1, 1, .6], ring: [.7, .4, .4, .3, .4, .6, .5, .3, .3, .5],
  above: [1, .8, 1, 1, .6, .8, 1, .35, .35, 1],
};
const FK = {};
function focusAt(T) {
  for (let i = 0; i < NPH; i++) { const a = i ? E.ss(PH[i] - .35, PH[i] + .35, T) : 1, b = i < NPH - 1 ? E.ss(PH[i + 1] - .35, PH[i + 1] + .35, T) : 0; PW[i] = a * (1 - b); }
  const solo = 1 - .72 * ST.xp;                                        // the round's exploded view: all else recedes
  for (const g in FKEEP) { let v = 0; for (let i = 0; i < NPH; i++) v += PW[i] * FKEEP[g][i]; FK[g] = v * solo; }
  return FK;
}

/* ---------- drawing: ship, mount, loader, room ---------- */
const SO = { a: .7, fade: 600, size: .5, md: 1, cut: null, px: 5.6, edge: .4, lmin: 1, px0: 18 };
const SOP = { a: .7, fade: 600, size: .55, md: 1, px: 10, edge: .55, keep: .65 };
const MO = { a: 1.3, fade: 260, lime: 0, md: 0, size: .8, keep: 1, px: 6.4, edge: .74, S: null, zfix: undefined, bk: .12, foc: 0, amb: .06 };
/* inside the X-ray: lit brighter and fading slower than the ship round them, so the machinery reads through the hull */
const RO = { a: 1.6, fade: 140, lime: 0, md: 3, S: null, size: .7, px: 5.8, edge: .86, zfix: undefined, bk: 0, foc: 0, amb: .26 };
/* frost on the cold parts: two-sided white dots */
const FO = { a: 1.9, fade: 200, lime: 0, md: 0, size: .6, keep: 1, px: 3.2, edge: 1, S: null, zfix: undefined, bk: 0, foc: 0 };
/* dot density: the LOD keeps dots at most px apart on screen; DQ divides those spacings (?dq=1: the old density) */
const PX0 = [SO, SOP, MO, RO, FO].map(o => o.px);
function density() { [SO, SOP, MO, RO, FO].forEach((o, i) => { o.px = PX0[i] / K.DQ; }); SO.lmin = K.DQ > 1.3 ? 0 : 1; }
const lock = (T, t0) => { const a = T - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
function drawShip(Ws) {
  for (const p of SHIP) { SO.cut = p.name === 'hull' ? P_.CUT : null; P_.drawX(p.ml, Ws, SO); }
  for (const p of SHIPX.parts) { SO.cut = p.cut ? P_.CUT : null; P_.drawX(p.ml, Ws, SO); }
  SO.cut = null; P_.drawX(CL.hullP, Ws, SOP);
}
/* (smooth: each occluder's strength ramps over ~0.2 s as its block ghosts or the X-ray window clears it, so what is
   behind fades in and out instead of popping) */
/* (round 3: smooth in the live view too: a dithered fade over the block's whole ghosting, never a one-frame pop) */
const ghOcc = g => 1 - E.ss(.02, .9, g);
const openOcc = (z0, z1) => XS.zo < 90 ? E.sat((z0 - XS.zo) / 4) * (XS.zs > 90 ? 1 : E.sat((XS.zs - z1) / 4)) : 0;
function occluders(T, st, Ws) {
  P_.occReset();
  const hx = (C8, Tw, s) => { if (s > .001) P_.occHex(C8.map(p => X.ap(Tw, p)), s); };
  hx(P_.TUR_OCC[0], XF.T, ghOcc(st.gh));
  hx(P_.TUR_OCC[1], XF.T, ghOcc(Math.max(st.gh, st.ghS)));
  hx(P_.BR_OCC, XF.B, 1 - E.sat(Math.max(st.cut, st.cut2) * 4));
  for (let r = 0; r < 4; r++) { const rk = P_.RACKS[r]; hx(P_.RACK_OCC[r], Ws, openOcc(rk.z0, rk.z1)); }
  hx(P_.CAB_OCC, Ws, openOcc(55.2, 56.3));
}
/* a hydraulic ram between a base (frame Tb) and a pin (frame Tp): its cylinder fixed at the base, the rod out to
   the pin (lattice clouds laid along the line between them each frame); lit while it moves */
const RB = [0, 0, 0], RP = [0, 0, 0];
function ramDraw(Tb, b, Tp, p, lit) {
  apI(Tb, b[0], b[1], b[2], RB); apI(Tp, p[0], p[1], p[2], RP);
  const Rm = R.look([RP[0] - RB[0], RP[1] - RB[1], RP[2] - RB[2]], X.dir(XF.T, [1, 0, 0]));
  MO.lime = .45 * lit; P_.drawX(CL.ramCyl, X.make(Rm, RB.slice()), MO);
  MO.lime = .75 * lit; P_.drawX(CL.ramRod, X.make(Rm, RP.slice()), MO); MO.lime = 0;
}
/* the cutaways: the barrel's top-starboard quarter (B: x > 0, y > 0) over a stretch (zr) cut away and lifted off as
   a piece, lime cut edges drawn where it parted (cutFX): the coils' stretch for the coils, the breech for the charge */
const QCI = [0, 0, 0, 0, 1], QCO = [0, 0, 0, 0, -1];
const cutOf = st => st.cut >= st.cut2 ? (CUTQ.q = st.cut, CUTQ.zr = CUT_A, CUTQ.x0 = -9, CUTQ) : (CUTQ.q = st.cut2, CUTQ.zr = CUT_B, CUTQ.x0 = 0, CUTQ);
const CUTQ = { q: 0, zr: CUT_A, x0: -9 };
function cutDraw(cl, Lb, o, cq, zoff) {          // Lb: the part's own frame in B (null: B); zoff: its z in B
  const Tw = Lb ? X.mul(XF.B, Lb) : XF.B, q = cq.q;
  if (q < .002) { P_.drawX(cl, Tw, o); return; }
  QCI[0] = QCO[0] = cq.x0; QCI[2] = cq.zr[0] - zoff; QCI[3] = cq.zr[1] - zoff; o.qc = QCI; P_.drawX(cl, Tw, o);
  const k0 = o.keep, a0 = o.a;
  QCO[2] = QCI[2]; QCO[3] = QCI[3]; o.qc = QCO; o.keep = k0 * (1 - .8 * q); o.a = a0 * (1 - .55 * q);
  const Lp = cq.x0 < -1 ? tr(0, 2.2 * q, 0) : tr(1.1 * q, 2.6 * q, 0); P_.drawX(cl, Lb ? X.mul(X.mul(XF.B, Lp), Lb) : X.mul(XF.B, Lp), o);
  o.qc = null; o.keep = k0; o.a = a0;
}
function drawMount(T, st) {
  const X_ = P_.drawX, gl = st.glow, ch = st.chg, gS = Math.max(st.ghS, st.gh), gP = st.gh, cq = cutOf(st);
  MO.lime = 0; MO.a = 1.3; MO.md = 0; MO.S = null; MO.zfix = undefined; MO.keep = 1; MO.qc = null;
  MO.keep = FK.above; MO.a = 1.3 * (.35 + .65 * FK.above); X_(CL.baseAbove, XF.M, MO); MO.keep = 1; MO.a = 1.3;
  if (st.ghS > (SMOOTH ? .002 : .02)) { MO.keep = .45 * st.ghS; MO.a = .8; X_(CL.ring, XF.M, MO); MO.keep = 1; MO.a = 1.3; }
  // the gunhouse: a cheek ghosts while the lens looks inside it
  const hpuC = kk(T, T_HPU - .6, T_HPU + .6) * (1 - kk(T, T_HPU + 9.2, T_HPU + 10.4));            // (the HPU's close-up: its cheek cut away)
  MO.keep = (1 - .86 * gS) * (1 - .9 * hpuC); MO.a = 1.3 * (1 - .4 * gS) * (1 - .5 * hpuC); X_(CL.cheekS, XF.T, MO);
  MO.keep = 1 - .86 * gP; MO.a = 1.3 * (1 - .4 * gP); X_(CL.cheekP, XF.T, MO);
  MO.keep = 1 - .5 * gS; MO.a = 1.3 * (1 - .3 * gS); X_(CL.gbody, XF.T, MO);
  // inside: the hydraulic power unit lit as it comes up, its pump's block and swash plate, the accumulators' pistons;
  // the helium compressors and the fire-control cabinet
  const hpuF = kk(T, T_CUT1 + .6, T_CUT1 + 1.8) * (1 - kk(T, T_HPU1 - .4, T_HPU1 + .4));
  MO.keep = 1 - .6 * st.gh; MO.a = 1.5 + .4 * st.ghS + .5 * hpuC; MO.lime = Math.max(.16 * hpuC, .45 * lock(T, T_HPU + .3), .3 * E.ss(T_HPU + .3, T_HPU + .6, T) * (1 - E.ss(T_HPU + 1.6, T_HPU + 2.2, T)), .35 * st.trv * gS, .35 * st.elv * gS); X_(CL.ginH, XF.T, MO);
  if (st.ghS > .02) drawHPU(T, st);
  MO.keep = 1 - .6 * Math.max(st.gh, st.ghS); MO.a = 1.4; MO.lime = .3 * lock(T, T_CRYO - .3); X_(CL.ginC, XF.T, MO); MO.lime = 0; MO.a = 1.3; MO.keep = 1;
  // the train drives' pinions walk round the fixed ring gear
  if (st.ghS > (SMOOTH ? .002 : .02)) for (let i = 0; i < 2; i++) { const p = P_.TD_P[i]; MO.lime = .6 * st.trv; MO.keep = SMOOTH ? E.sat(st.ghS / .3) : 1; X_(CL.tpin, X.mul(XF.T, X.make(R.y(-st.yaw * P_.RING_R / P_.PIN_R + i), [p[0], .13, p[2]])), MO); }
  // the sensors: the director's yoke and head, the radar's head
  MO.lime = 0; MO.keep = 1; X_(CL.eoBase, XF.T, MO); X_(CL.eoYoke, XF.eoY, MO);
  MO.lime = Math.max(.8 * lock(T, T_DLK), .5 * lock(T, T_EL1 + .1), .12 * E.ss(T_DLK - 1.8, T_DLK - 1.4, T), .32 * kk(T, T_DLK - 2.6, T_DLK - 1.8) * (1 - kk(T, T_DLK + 3, T_DLK + 4))); MO.a = 1.3 + .5 * kk(T, T_DLK - 2.6, T_DLK - 1.8) * (1 - kk(T, T_DLK + 3, T_DLK + 4)); X_(CL.eoHead, XF.eoP, MO); MO.a = 1.3;
  MO.lime = 0; X_(CL.fcBase, XF.T, MO); MO.lime = Math.max(.8 * lock(T, T_RLK), .3 * st.fcScan, .2 * st.fcLk * (1 - kk(T, T_LAY, T_LAY + 1))); MO.a = 1.3 + 1.0 * kk(T, T_RLK - 3, T_RLK - 2.2) * (1 - kk(T, T_LAY, T_LAY + 1)); X_(CL.fcHead, XF.fcY, MO); MO.a = 1.3;
  // the cradle and its rams
  MO.lime = Math.max(.22 * st.elv, .6 * lock(T, T_EL1)); X_(CL.cradle, XF.C, MO);
  for (const s of [-1, 1]) { const e = P_.RAM_E(s); ramDraw(XF.T, e[0], XF.C, e[1], st.elv); }
  // the barrel: structure, rails, sidewalls (cut away when the cutaway is open); the coils light as they energise
  const rec = 1 - .55 * hpuF - .3 * st.gh;                                          // (recedes behind the HPU's close-up)
  MO.keep = rec; MO.lime = Math.max(.1 * ch, .35 * gl, .45 * lock(T, T_EL1)); cutDraw(CL.barrel, null, MO, cq, 0); MO.keep = 1;
  const rv = Math.max(SMOOTH ? Math.max(E.sat(ch / .04), E.sat(gl / .04), E.ss(SL0 - .2, SL0, T) * (1 - E.ss(SL1, SL1 + .2, T))) : ch > .01 || gl > .01 || (T > SL0 && T < SL1) ? 1 : 0, E.sat(cq.q * 3));
  if (rv > .004) {                                                        // (inside the containment: seen lit, or cut open)
    MO.lime = Math.min(1, .9 * ch + gl + .25 * cq.q); MO.a = (1.3 + .5 * ch + .3 * cq.q) * rv; cutDraw(CL.rails, null, MO, cq, 0); MO.lime = .45 * ch + .15 * cq.q; cutDraw(CL.ins, null, MO, cq, 0); MO.a = 1.3;
  }
  const xc = st.xc, XK = P_.XST;
  for (let k = 0; k < NST; k++) {
    const v = st.coil[k]; MO.lime = Math.min(1, .5 * v + .5 * lock(T, enT(k) + .45) + .3 * ch * v); MO.a = 1.35 + .35 * v;
    if (k === XK && xc > .001) {                                                     // (the station drawn apart: its coil packs out to either side)
      MO.lime = Math.max(MO.lime, .55 * xc); MO.a = 1.5 + .3 * xc;
      P_.drawX(CL.coilS, X.mul(XF.B, tr(.62 * xc, .16 * xc, P_.STN[k])), MO); P_.drawX(CL.coilP, X.mul(XF.B, tr(-.62 * xc, .16 * xc, P_.STN[k])), MO);
    } else cutDraw(CL.coil, STL[k], MO, cq, P_.STN[k]);
  }
  MO.a = 1.3; MO.lime = .32 * st.cryo * (1 - .6 * st.field);
  if (xc > .001) {                                                                   // (... and its two cold heads lifted out)
    P_.drawX(CL.cryoX, XF.B, MO); MO.lime = Math.max(MO.lime, .4 * xc); MO.a = 1.5;
    P_.drawX(CL.cryoXS, X.mul(XF.B, tr(.3 * xc, .62 * xc, 0)), MO); P_.drawX(CL.cryoXP, X.mul(XF.B, tr(-.3 * xc, .62 * xc, 0)), MO); MO.a = 1.3;
  } else cutDraw(CL.cryo, null, MO, cq, 0);
  MO.lime = 0;
  { const c = P_.COLD[P_.COLD_HERO]; apI(XF.B, c[0], c[1] + .2, c[2], Q1); if (V.dist(C.eye, Q1) < 3.5 && cq.q < .02) { MO.lime = .32 * st.cryo * (1 - .6 * st.field); X_(CL.cryoHero, XF.B, MO); MO.lime = 0; } }   // (the watched cold head, finer)
  for (let k = 0; k < P_.BANDS.length; k++) {
    const z = P_.BANDS[k], o = .05 * st.jaw[k];
    MO.lime = Math.max(.9 * lock(T, clampT(k) + .12), .25 * ch, .4 * gl, .7 * forceA(T, st));
    cutDraw(CL.jawS, tr(o, 0, z), MO, cq, z); cutDraw(CL.jawP, tr(-o, 0, z), MO, cq, z);
  }
  MO.lime = Math.max(.8 * lock(T, LD(LK.brc1)), .8 * lock(T, LD(LK.sh1)), .5 * E.ss(LD(LK.sh0), LD(LK.sh0) + .2, T) * (1 - E.ss(LD(LK.sh1) + .4, LD(LK.sh1) + 1.2, T)), .15 * ch); X_(CL.breech, X.mul(XF.B, tr(0, -.86 * st.brc, 0)), MO);
  MO.lime = .7 * lock(T, T_TR + 5.1); X_(CL.petalT, XF.petT, MO); X_(CL.petalB, XF.petB, MO);
  MO.lime = 0; MO.a = 1.3;
}
/* the hydraulic power unit's moving parts: the pump's cylinder block turning with the motor, its swash plate tilted
   by the stroke (full while it charges, near flat when it idles), the accumulators' pistons riding on the oil */
function drawHPU(T, st) {
  const H = P_.HPU, A = E.sat(st.ghS / .3);
  MO.keep = A; MO.a = 1.9; MO.lime = .3 * st.stroke * st.hpuR + .3 * st.hpuR;
  P_.drawX(CL.hpuBlock, X.mul(XF.T, X.make(R.z(st.hpu), H.pump)), MO);
  MO.lime = Math.min(1, .45 * st.stroke * st.hpuR + .45 * E.sat(st.ghS / .3) * st.hpuR); MO.a = 1.9; P_.drawX(CL.hpuSwash, X.mul(XF.T, X.make(R.x(17 * DEG * st.stroke), [H.pump[0], H.pump[1], H.SW])), MO);
  for (const ac of H.acc) { MO.lime = .2 + .5 * st.acc; P_.drawX(CL.accPiston, X.mul(XF.T, tr(ac[0], ac[1] + H.AYB + (H.AYT - H.AYB) * st.acc, ac[2])), MO); }
  MO.keep = 1; MO.lime = 0; MO.a = 1.3;
}
/* the round with its sabot (three petals) and the armature: e pulls them apart (the exploded view); Ls the model ->
   ship transform for the X-ray tests (null: drawn plain in world) */
const PET_L = [0, 1, 2].map(k => X.make(R.z(k * TAU / 3), [0, 0, 0]));
const RA = { L: X.make(), Ls: X.make() };
function drawRound(Lw, Ls, e, o, glow) {
  if (window.RGR && RGR.draw) return RGR.draw(Lw, Ls, e, o, glow || 0, RCTX);
  const X_ = P_.drawX, Lt = e > 0 ? tr(0, 0, .3 * e) : null;
  o.S = Ls ? (Lt ? X.mul(Ls, Lt) : Ls) : null; X_(CL.round, Lt ? X.mul(Lw, Lt) : Lw, o);
  for (let k = 0; k < 3; k++) {
    const a = k * TAU / 3, Lp = e > 0 ? X.make(R.z(a), [Math.cos(a) * .34 * e, Math.sin(a) * .34 * e, .05 * e]) : PET_L[k];
    o.S = Ls ? X.mul(Ls, Lp) : null; X_(CL.sabot, X.mul(Lw, Lp), o);
  }
  const La = tr(0, 0, -.42 * e); o.S = Ls ? X.mul(Ls, La) : null; X_(CL.arm, X.mul(Lw, La), o);
  o.S = null;
}
const RCTX = { K, P_, CL, X, R, V, E, M3, LIME, HOT, WH, apI, tr, T: 0 };   // (the round module's context; T: film time)
/* the loader below and behind the breech (seen in the X-ray): the drum, the hoist, the tray, the rammer's head */
const XRd = X.make(R.I(), [0, 0, 0]);
function drawLoader(T, st, Ws) {
  const X_ = P_.drawX;
  RO.md = 3; RO.lime = 0; RO.a = 1.5; RO.zfix = undefined; RO.keep = FK.load;
  // the drum and its drive pinion (ship)
  const dA = AZ + PI + (st.drum - 1) * TAU / NCELL;
  const Ld = X.make(R.y(dA), [0, P_.DRUM_Y, P_.GZ]);
  RO.S = Ld; RO.lime = .5 * lock(T, T_DRUM + .5); X_(CL.drum, X.mul(Ws, Ld), RO);
  const Lp = X.make(R.y(-dA * 1.35 / .18), P_.PIN_P); RO.S = Lp; RO.lime = .5 * E.ss(T_DRUM, T_DRUM + .1, T) * (1 - E.ss(T_DRUM + .45, T_DRUM + .6, T)); X_(CL.pinion, X.mul(Ws, Lp), RO);
  // the rounds in the cells (cell 01 waits empty under the hoist until the magazine fills it, then leaves on the hoist)
  RO.lime = 0; RO.a = 1.3; RO.keep = .6 * FK.load;
  for (let k = st.rnd === 0 ? 0 : 1; k < NCELL; k++) {
    const a = dA + k * TAU / NCELL, L = X.make(ROT_UP, [Math.sin(a) * P_.DRUM_R, P_.RND_Y0, P_.GZ + Math.cos(a) * P_.DRUM_R]);
    if (k) { RO.S = L; X_(CL.rstow, X.mul(Ws, L), RO); } else drawRound(X.mul(Ws, L), L, 0, RO);   // (cell 01: the magazine's round)
  }
  // the hoist trunk and its carriage, the collector, the bus trunks (T, under the deck)
  RO.a = 1.5; RO.keep = FK.load; RO.S = XR.T; X_(CL.trunk, XF.T, RO);
  const Lc = X.mul(XR.T, tr(0, st.hoistY, P_.HZ)); RO.S = Lc; RO.lime = Math.max(.6 * lock(T, LD(.3)), .6 * lock(T, LD(1.5))); X_(CL.carriage, X.mul(Ws, Lc), RO);
  // the round on its way
  let Lr = null; XF.RND = null;
  if (st.rnd === 1) Lr = X.mul(XR.T, X.make(ROT_UP, [0, st.hoistY, P_.HZ]));
  else if (st.rnd === 2) Lr = st.ram > 0 ? X.mul(XR.B, tr(0, 0, P_.TRAY_Z + P_.RAM_L * st.ram)) : X.mul(XR.tray, XRd);
  if (Lr) {
    RO.a = 1.7 + .3 * st.xp; RO.lime = Math.max(.35, .9 * lock(T, LD(2.65))) * (st.rnd === 2 && T > LD(3.3) ? .4 : 1);
    RO.keep = Math.max(FK.load, st.xp, .85); XF.RND = X.mul(Ws, Lr);
    drawRound(XF.RND, Lr, st.xp, RO); RO.keep = FK.load;
  }
  // the tray (C, pivoting) and the rammer's head
  RO.S = XR.tray; RO.a = 1.6; RO.lime = Math.max(.2, .7 * lock(T, LD(1.6)) + .6 * lock(T, LD(2.15)) + .6 * lock(T, LD(3.35))); X_(CL.tray, XF.tray, RO);
  const Lh = X.mul(XR.C, tr(0, 0, P_.TRAY_Z - P_.RND_H - .02 + P_.RAM_L * st.ramH)); RO.S = Lh; RO.lime = SMOOTH ? .7 * E.sat(st.ramH / .02) : st.ramH > .005 ? .7 : 0; X_(CL.rhead, X.mul(Ws, Lh), RO);
  RO.S = null; RO.lime = 0; RO.keep = 1; RO.a = 1.5;
}
function drawRoom(T, st, Ws) {
  const X_ = P_.drawX;
  RO.md = 3; RO.S = null; RO.lime = 0; RO.a = 1.5; RO.zfix = undefined;
  const dimk = k => .35 + .65 * k;
  RO.keep = FK.floor; RO.a = .75; X_(CL.floor, Ws, RO); RO.a = 1.5;
  RO.keep = FK.rack; RO.a = 1.5 * dimk(FK.rack); X_(CL.racks, Ws, RO);
  RO.keep = FK.cab; RO.a = 1.5 * dimk(FK.cab); X_(CL.cab, Ws, RO);
  RO.keep = FK.over; RO.a = 1.1; X_(CL.over, Ws, RO);
  RO.keep = FK.cool; RO.a = 1.5 * dimk(FK.cool); RO.lime = .3 * E.ss(T_VLV + .4, T_VLV + 1.2, T) * (1 - E.ss(XSH - 1, XSH, T)); X_(CL.cool, Ws, RO);
  RO.keep = FK.bus; RO.a = 1.5 * dimk(FK.bus); RO.lime = .4 * E.ss(T_BANK - .6, T_BANK, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.bus, Ws, RO);
  RO.keep = FK.base; RO.a = 1.5 * dimk(FK.base); RO.S = M_S; RO.zfix = P_.GZ; RO.lime = .3 * E.ss(T_RAIL - .4, T_RAIL + .6, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.baseBelow, XF.M, RO);
  RO.keep = FK.ring; RO.a = 1.5 * dimk(FK.ring); X_(CL.roller, XF.M, RO); RO.zfix = undefined;
  // the coolant pumps: housing, inverter, volute; the stator's wound teeth; the rotor, coupling and impeller turning
  for (let i = 0; i < 2; i++) {
    const L = PUMP_L[i], Lw = X.mul(Ws, L);
    const pr = st.pumpR;                                                 // (running: the housing and the iron recede, the coils carry the light)
    RO.keep = FK.pump; RO.a = (1.5 - .55 * pr) * dimk(FK.pump); RO.S = L; RO.lime = .5 * lock(T, T_PMP + .15 * i); X_(CL.pump, Lw, RO);
    RO.a = (.95 - .35 * pr) * dimk(FK.pump); RO.lime = 0; X_(CL.pstat, Lw, RO);
    const sg = i ? -1 : 1, rot = st.pump * sg + i;
    for (let k = 0; k < P_.PST; k++) {                                  // the coils, switched round with the rotor
      const a = (k + .5) / P_.PST * TAU, ph = Math.cos(4 * (a - rot) * sg), on = st.pumpR * E.clamp((ph - .2) / .5, 0, 1);
      const Lk = X.mul(L, PCOIL_R[k]); RO.S = Lk; RO.lime = .65 * on; RO.a = (.9 + .7 * on) * dimk(FK.pump); X_(CL.pcoil, X.mul(Ws, Lk), RO);
    }
    const Lr = X.mul(L, X.make(R.z(rot), [0, 0, 0])); RO.S = Lr; RO.lime = .12 * pr; RO.a = (1.0 + .2 * pr) * dimk(FK.pump); X_(CL.prot, X.mul(Ws, Lr), RO);
  }
  // valve handwheels, fans
  RO.lime = 0; RO.keep = FK.cool; RO.a = 1.5 * dimk(FK.cool);
  P_.VALVES.forEach((v, i) => { const L = X.make(R.y(-kk(T, T_VLV + .15 * i, T_VLV + 1.1 + .15 * i) * 1.5 * TAU - i), v); RO.S = L; RO.lime = Math.max(.7 * lock(T, T_VLV + 1.1 + .15 * i), .35 * kk(T, T_VLV + .15 * i, T_VLV + .4 + .15 * i) * (1 - kk(T, T_VLV + 1.1, T_VLV + 1.6))); X_(CL.wheel, X.mul(Ws, L), RO); });
  RO.lime = 0;
  P_.FANS.forEach((f, i) => { const L = X.make(R.z(st.fan * (i ? -1 : 1) + i), f); RO.S = L; X_(CL.fanB, X.mul(Ws, L), RO); });
  // alternators: body, the outer end bell + exciter + fan, the rotor
  for (let k = 0; k < 4; k++) {
    const L = ALT_L[k], xk = k === P_.XALT;
    RO.keep = xk ? FK.altX : FK.alt; RO.a = 1.5 * dimk(RO.keep);
    const Lb = xk ? XR.xexc : L, Lr0 = xk ? XR.xrot : L;
    const rot = (xk ? st.rotX : st.rot) * (k % 2 ? -1 : 1) + k, rate = xk ? st.rateX : st.rate;
    RO.lime = .5 * lock(T, T_AX + 10.3) * (xk ? 1 : 0); RO.S = L; X_(CL.body, X.mul(Ws, L), RO);
    RO.lime = xk ? Math.max(.35 * Math.min(1, st.bell * 2), .6 * lock(T, T_AX + 9.8)) : 0;
    RO.S = Lb; X_(CL.bell, X.mul(Ws, Lb), RO); X_(CL.exc, X.mul(Ws, Lb), RO);
    const Lf = X.mul(Lb, X.make(R.z(rot), [0, 0, 0])); RO.S = Lf; RO.lime = .15 * rate; X_(CL.fan, X.mul(Ws, Lf), RO);
    const Lr = X.mul(Lr0, X.make(R.z(rot), [0, 0, 0])); RO.S = Lr; RO.lime = Math.max(.2 * Math.min(1, rate), xk ? .4 * Math.min(1, st.rtr * 2) : 0); X_(CL.rotor, X.mul(Ws, Lr), RO);
  }
  // capacitor modules
  RO.keep = FK.rack;
  for (let k = 0; k < NMOD; k++) {
    const l = modLvl(k, T), L = MOD_L[k];
    RO.S = L; RO.lime = (.7 * l + .3 * lock(T, modT(k))) * (.3 + .7 * FK.rack); RO.a = (1.25 + .5 * l) * dimk(FK.rack); X_(CL.module, X.mul(Ws, L), RO);
  }
  RO.a = 1.5; RO.keep = FK.cab;
  // breakers (throw closed as each rack starts charging)
  for (let r = 0; r < 4; r++) {
    const c = kk(T, brkT(r), brkT(r) + .12) * (1 - kk(T, TF + .6, TF + 1.2)), L = X.make(R.x(-35 * DEG + 70 * DEG * c), P_.BRK[r]);
    RO.S = L; RO.lime = .9 * lock(T, brkT(r) + .12); X_(CL.breaker, X.mul(Ws, L), RO);
  }
  RO.S = null; RO.lime = 0; RO.keep = 1; RO.a = 1.5;
}
/* rotor rims: lime streaks that lengthen with speed; exciters' rings */
function drawRotorFX(T, st, Ws) {
  for (let k = 0; k < 4; k++) {
    const xk = k === P_.XALT, rate = xk ? st.rateX : st.rate; if (rate < .02) continue;
    const c = P_.ALT[k]; if (!isOpen(c[2])) continue;
    const L = X.mul(Ws, ALT_L[k]), sg = k % 2 ? -1 : 1, rot0 = (xk ? st.rotX : st.rot) * sg + k;
    const len = Math.min(2.6, .25 + 2.4 * rate), n = 14;
    for (let m = 0; m < 4; m++) {
      const a0 = rot0 + m * TAU / 4;
      for (let j = 0; j < n; j++) {
        const a = a0 - sg * len * j / n, w = 1 - j / n;
        for (const z of [-.66, .66]) { apI(L, Math.cos(a) * .83, Math.sin(a) * .83, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, j ? LIME : HOT, (.35 + .6 * rate) * w * w); }
      }
    }
    for (let j = 0; j < 36; j++) { const a = j / 36 * TAU + rot0 * .5; apI(L, Math.cos(a) * .44, Math.sin(a) * .44, 1.32, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .25 + .5 * rate * (.5 + .5 * Math.cos(a * 3 - T * 20))); }
    if (rate > .5) { apI(L, 0, 0, .9, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 36, LIME, .05 * rate); }
  }
}
/* the opened alternator: bolts flash as they let go and seat, guide rods run out under the bell */
function drawExplodeFX(T, st, Ws) {
  if (!isOpen(P_.ALT[P_.XALT][2])) return;
  const LA = XF.XA, LB = XF.XEXC;
  const fl = Math.max(lock(T, T_AX - .2), lock(T, T_AX + 10.3));
  if (fl > .02) for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; apI(LB, Math.cos(a) * .9, Math.sin(a) * .9, .78, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, fl); P_.oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .5 * fl); }
  if (st.rod > .01) for (const s of [-1, 1]) {
    const tip = .8 + 1.95 * st.rod;
    apI(LA, s * .62, -.55, .5, Q1); apI(LA, s * .62, -.55, tip, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, WH, .8, LIME, .05, 0);
    apI(LA, s * .62, -.53, tip, Q2); P_.odot(Q2[0], Q2[1], Q2[2], 2, LIME, .9);
  }
}
/* ---------- the coolant's climb: from the riser at the column's foot up the power column, through the training
   structure to the starboard trunnion's rotary union, along the cradle to the breech and down the rails' manifold
   under the barrel (behind the front it runs on at its speed; the manifold's stubs light as it reaches them) ---------- */
const RISE = (() => {
  const segs = [
    { fr: 'W', pl: P_.COOL_COL[1] },
    { fr: 'T', pl: P_.COOL_T[1] },
    { fr: 'C', pl: P_.poly([[.72, -.14, 0], [.6, -.58, -.34], [.6, -.58, -2.0], [.6, -.52, -2.44]]) },
    { fr: 'B', pl: P_.poly(P_.quad3([.6, -.5, -2.6], [.3, -.75, -2.5], [.12, -.52, -2.25], 8)) },
    { fr: 'B', pl: P_.poly([[.12, -.52, -2.25], [.12, -.52, P_.RZ1 - .1]]) },
  ];
  let c = 0; const L = segs.map(s => (c += s.pl.L));
  return { segs, L };
})();
const riseD = T => { if (T < T_RIS) return -1; const t = T - T_RIS; return V_RIS * (t - .35 * (1 - Math.exp(-t / .35))); };
const manFill = T => E.sat((riseD(T) - RISE.L[3]) / (RISE.L[4] - RISE.L[3]));
const nCold = T => { let n = 0; for (let k = 0; k < NST; k++) if (T > rowT(k) + .7) n++; return n; };
const RS = { W: null, T: null, C: null, B: null };
function riserFX(T, st) {
  const d = riseD(T); if (d <= 0) return;
  const A = .9 * (1 - E.ss(TF + 3, TF + 12, T)), fresh = 1 - E.ss(T_CUP1 + 1.5, T_CUP1 + 5, T);
  if (A < .01) return;
  RS.W = XF.W; RS.T = XF.T; RS.C = XF.C; RS.B = XF.B;
  const SS = { W: ID, T: XR.T, C: XR.C, B: XR.B };
  let base = 0;
  for (let i = 0; i < RISE.segs.length; i++) {
    const sg = RISE.segs[i], Tw = RS[sg.fr], Ts = SS[sg.fr], L = sg.pl.L, d1 = Math.min(L, d - base);
    if (d1 <= 0) break;
    // behind the front the pipe runs full: dense dots, pulses travelling with the flow, lime near the front
    const ph = T * V_RIS / .45;
    for (let s = 0; s < d1; s += .025) {
      P_.polyAt(sg.pl, s, Q2); apI(Ts, Q2[0], Q2[1], Q2[2], Q3); if (Q3[1] < P_.GY - .05 && !isOpen(Q3[2])) continue;
      // (round 3: the coolant arrives as lime slugs, 0.3 m long every 0.9 m, running at its speed)
      const sl = (((base + s - T * V_RIS) / .9) % 1 + 1) % 1, slug = sl < .33 ? 1 : 0, w = slug * Math.sin(sl / .33 * PI), nf = E.sat(1 - (d - base - s) / 1.2) * fresh, b = A * (.22 + .78 * w);
      apI(Tw, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], slug ? 3 : i === 4 ? 2 : 1, nf > .3 || slug ? (w > .8 ? HOT : LIME) : WH, Math.max(b * (i === 4 ? 1.3 : 1), .9 * nf));
      if (slug && i > 0 && ((s / .025) | 0) % 2 === 0) P_.oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .55 * A * w);
    }
    if (d1 < L && fresh > .01) {                                       // the front: a hot head, a lime streak behind it
      for (let j = 0; j < 14; j++) {
        const s = d1 - j * .035; if (s < 0) break;
        P_.polyAt(sg.pl, s, Q2); apI(Ts, Q2[0], Q2[1], Q2[2], Q3); if (Q3[1] < P_.GY - .05 && !isOpen(Q3[2])) continue;
        apI(Tw, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], j < 3 ? 2 : 1, j < 2 ? HOT : LIME, fresh * (1 - j / 14));
        if (!j) P_.oglow(Q1[0], Q1[1], Q1[2], 20, LIME, .5 * fresh);
      }
    }
    base += L;
  }
  // the manifold's stubs up into the containment light as the coolant reaches each station
  const dm = d - RISE.L[3];
  if (dm > 0) for (let k = 0; k < NST; k++) {
    const z = P_.STN[k], s0 = z + 2.25; if (dm < s0) break;
    const f = Math.exp(-(dm - s0) / V_RIS * 2.2) * fresh, a = Math.max(.35 * A, f);
    for (let y = -.5; y < -.36; y += .02) { apI(XF.B, .12, y, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, f > .3 ? LIME : WH, a); }
    if (f > .05) { apI(XF.B, .12, -.38, z, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .5 * f); }
  }
  // (round 3) the rotary union: its ring flashes as each slug passes through it
  if (d > RISE.L[1] - .2 && fresh > .01) {
    const sl = (((RISE.L[1] - T * V_RIS) / .9) % 1 + 1) % 1, on = sl < .33 ? Math.sin(sl / .33 * PI) : 0, U = X.dir(XF.T, [0, 1, 0]), W = X.dir(XF.T, [0, 0, 1]);
    apI(XF.T, 1.42, P_.TRN[1], P_.TRN[2], Q4); const c = Q4.slice();
    K.ringW(c, U, W, .13, 56, 2, on > .5 ? HOT : LIME, A * fresh * (.35 + .65 * on), T * 2); K.ringW(c, U, W, .17, 64, 1, LIME, .5 * A * fresh, -T);
    if (on > .05) K.glowW(c[0], c[1], c[2], 26, LIME, .5 * on * fresh);
  }
}
/* ---------- current into the superconducting coils: down the flexible feed from the training structure, along the
   coils' bus on top of the barrel to each station's current leads as it energises (x60) ---------- */
const CB0 = [0, 0, 0], CB1 = [0, 0, 0], CB2 = [0, 0, 0], CB3 = [0, 0, 0];
function coilFeedFX(T, st) {
  const on = E.ss(T_EN - .7, T_EN - .3, T) * (1 - E.ss(enT(NST - 1) + 1.2, enT(NST - 1) + 2.4, T)); if (on < .01) return;
  const B = XF.B, n = 32, zh = Math.min(P_.STN[NST - 1] + .22, T < enT(0) - .1 ? -2.3 + (P_.STN[0] + .22 + 2.3) * E.sat((T - T_EN + .7) / .6) : P_.STN[0] + .22 + (T - enT(0) + .1) / .85 * P_.DZS);
  for (const s of [-1, 1]) {
    // the flexible feed (T -> B)
    apI(XF.T, s * 1.0, .62, -.9, CB0); apI(XF.T, s * .7, .9, -1.6, CB1); apI(B, s * .32, .9, -2.6, CB2); apI(B, s * .32, .59, -2.3, CB3);
    for (let i = 0; i <= n; i++) {
      const u = i / n, w0 = (1 - u) ** 3, w1 = 3 * u * (1 - u) ** 2, w2 = 3 * u * u * (1 - u), w3 = u ** 3;
      const x = w0 * CB0[0] + w1 * CB1[0] + w2 * CB2[0] + w3 * CB3[0], y = w0 * CB0[1] + w1 * CB1[1] + w2 * CB2[1] + w3 * CB3[1], z = w0 * CB0[2] + w1 * CB1[2] + w2 * CB2[2] + w3 * CB3[2];
      const p = Math.max(0, Math.cos((u * 4 - T * 3) * TAU * .5));
      P_.odot(x, y, z, 1, p > .85 ? HOT : WH, on * (.35 + .5 * p));
      if (p > .92) P_.oglow(x, y, z, 7, LIME, .3 * on);
    }
    // packets along the bus as far as the stations being energised (over the cutaway the bus rides up with the cut
    // piece)
    const cq = cutOf(st), lift = (z) => cq.q > .002 && cq.x0 < -1 && z > cq.zr[0] && z < cq.zr[1] ? 2.2 * cq.q : 0;
    for (let zz = -2.3 + ((T * 2.4) % .3); zz < zh; zz += .3) for (let j = 0; j < 5; j++) for (const d of j ? [-1, 1] : [0]) {   // (chevrons pointing down the bus)
      const z = zz - j * .028; apI(B, s * .32 + d * j * .02, .59 + lift(z), z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], j < 2 ? 2 : 1, j ? LIME : HOT, on * (1 - j * .16));
    }
    apI(B, s * .32, .59 + lift(zh), zh, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .45 * on);
    // down each energising station's leads into its coil, and round its winding (current ramping in: packets
    // circling the racetrack, the faster the further it has to go)
    for (let k = 0; k < NST; k++) {
      const v = st.coil[k]; if (v < .01 || v > .995) continue;
      const z = P_.STN[k] + .22, lz = lift(z);
      for (let j = 0; j < 9; j++) { const u = ((j / 9 + T * 2.2) % 1); apI(B, s * (.32 + .13 * Math.min(1, u * 2.5)), .59 + lz + .01 * Math.min(1, u * 2.5) - .2 * E.sat((u - .4) / .6), z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, on * .9); }
      apI(B, s * .45, P_.KY + lz, z, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 22, LIME, .55 * on * (1 - v));
      const zc = P_.STN[k], ry = .25, hz = .14, per = 2 * (2 * hz) + TAU * ry;
      for (let j = 0; j < 14; j++) {
        let d = ((j / 14 + T * (1.6 - v)) % 1) * per, y, zz;
        if (d < 2 * hz) { y = ry; zz = zc + hz - d; } else if ((d -= 2 * hz) < PI * ry) { const a = d / ry; y = ry * Math.cos(a); zz = zc - hz - ry * Math.sin(a); }
        else if ((d -= PI * ry) < 2 * hz) { y = -ry; zz = zc - hz + d; } else { const a = (d - 2 * hz) / ry; y = -ry * Math.cos(a); zz = zc + hz + ry * Math.sin(a); }
        const ly = y > 0 ? lift(zz) : 0;
        apI(B, s * P_.CXC, y + ly, zz, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, on * (.6 + .4 * (1 - v)));
      }
    }
  }
}
/* ---------- the cutaway's edges: where the quarter parted, the parts' sections drawn in lime (the rails' copper
   filled), along the two cut planes (x 0, y 0) and across the ends ---------- */
function cutFX(T, st) {
  const cq = cutOf(st), q = cq.q; if (q < .02) return;
  const B = XF.B, z0 = cq.zr[0], z1 = cq.zr[1], a = E.sat((q - .15) / .5), half = cq.x0 < -1;
  if (a < .01) return;
  const L = (x0, y0, x1, y1, za, zb, col, al, sz) => { apI(B, x0, y0, za, Q1); apI(B, x1, y1, zb, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2.5, sz || 1, col, al); };
  const RW = P_.RW, RY0 = P_.RY0, RY1 = P_.RY1, IX0 = P_.IX0, IX1 = P_.IX1, CX = P_.CX, CY = P_.CY;
  const xs = half ? [-1, 1] : [1];
  // along the cut plane y 0: the sidewalls' and the containment's walls (both sides for the half cut, starboard for
  // the quarter); the quarter's vertical cut x 0 through the top rail (its copper section filled)
  for (const s of xs) { for (const x of [IX0, IX1]) L(s * x, 0, s * x, 0, z0, z1, LIME, .75 * a); L(s * CX, 0, s * CX, 0, z0, z1, LIME, .6 * a); }
  if (!half) {
    for (const y of [RY0, RY1]) L(0, y, 0, y, z0, z1, HOT, .8 * a, 1);
    L(0, CY, 0, CY, z0, z1, LIME, .6 * a);
    for (let z = z0 + .01; z < z1; z += .045) for (let y = RY0 + .02; y < RY1; y += .03) { apI(B, 0, y, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, HOT, .35 * a); }
  }
  // the stations' cryostats where the cut crosses them; the coils' section (the racetrack's ends cut at y 0)
  for (let k = 0; k < NST; k++) {
    const zc = P_.STN[k], za = Math.max(z0, zc - P_.KZ), zb = Math.min(z1, zc + P_.KZ); if (zb <= za) continue;
    const v = st.coil[k], c = v > .5 ? HOT : LIME;
    for (const s of xs) {
      L(s * P_.KX0, 0, s * P_.KX0, 0, za, zb, LIME, .55 * a); L(s * P_.KX1, 0, s * P_.KX1, 0, za, zb, LIME, .55 * a);
      for (const e of [-1, 1]) { const ze = zc + e * .39; if (ze > z0 && ze < z1) rectB(B, s * (P_.CXC - .045), -.0375, s * (P_.CXC + .045), .0375, ze, c, .9 * a, 2); }
    }
  }
  // the ends: the outline of what was cut away, each part
  for (const z of [z0, z1]) {
    if (half) {
      rectB(B, -RW, RY0, RW, RY1, z, HOT, a, 2); for (const s of [-1, 1]) rectB(B, s * IX0, 0, s * IX1, RY0, z, LIME, .8 * a, 1);
      rectB(B, -CX, 0, CX, CY, z, LIME, .7 * a, 1);
      for (const zb of P_.BANDS) if (Math.abs(z - zb - .05) < .06) rectB(B, -.56, CY, .56, .46, z, HOT, a, 1);
    } else {
      rectB(B, 0, RY0, RW, RY1, z, HOT, a, 2); rectB(B, IX0, 0, IX1, RY0, z, LIME, .8 * a, 1); rectB(B, 0, 0, CX, CY, z, LIME, .7 * a, 1);
      for (const zb of P_.BANDS) if (Math.abs(z - zb - .05) < .06) rectB(B, 0, CY, .56, .46, z, HOT, a, 1);
    }
  }
}
/* ---------- the forces at the shot, drawn while the rails charge: the current's path (the feed, up the rails to the
   armature, across it, back), the armature driven up the bore, the rails pushed apart against the preload bands ---------- */
const forceA = (T, st) => st.cut2 < .3 ? 0 : E.ss(T_REL - 4.2, T_REL - 3.4, T) * (1 - E.ss(T_REL - .8, T_REL - .2, T));
function arrowB(B, p, d, len, col, a, w) {
  apI(B, p[0], p[1], p[2], Q1); apI(B, p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len, Q2);
  K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2, w || 2, col, a, LIME, .12, 0);
  const s = d[2] !== 0 ? [0, 1, 0] : [0, 0, 1], hl = Math.min(.12, len * .35);
  for (const sg of [-1, 1]) { apI(B, p[0] + d[0] * (len - hl) + s[0] * sg * hl * .5, p[1] + d[1] * (len - hl) + s[1] * sg * hl * .5, p[2] + d[2] * (len - hl) + s[2] * sg * hl * .5, Q3); K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 2, w || 2, col, a); }
}
function forceFX(T, st) {
  const f = forceA(T, st); if (f < .01) return;
  const B = XF.B, za = P_.SEAT_Z - .66, zf = P_.FEED_B[1][2], pu = .5 + .5 * Math.sin(T * 6);
  // the current's path: chevrons running from the feed up the top rail, down through the armature, back down the bottom rail
  const path = [[.0, .19, zf], [.0, .19, za], [.0, -.19, za], [.0, -.19, zf]], ph = (T * 1.6) % 1;
  for (let i = 0; i < 3; i++) {
    const a = path[i], b = path[i + 1], len = Math.hypot(b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.round(len / .05));
    for (let j = 0; j < n; j++) { const u = (j + ph) / n, x = a[0], y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u; apI(B, x, y, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 2, HOT, f * .9); }
  }
  // the armature driven up the bore (J x B)
  arrowB(B, [0, 0, za + .02], [0, 0, 1], .9 + .15 * pu, LIME, f, 3);
  // the rails pushed apart: at each band over the cut, up on the top rail, down on the bottom; the bands take it
  for (let k = 0; k < 4; k++) {
    const z = P_.BANDS[k] + .05;
    arrowB(B, [.06, P_.RY1, z], [0, 1, 0], .16 + .06 * pu, HOT, f * .9, 2); arrowB(B, [.06, -P_.RY1, z], [0, -1, 0], .16 + .06 * pu, HOT, f * .6, 2);
    apI(B, .45, .41, z, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .4 * f * pu);
  }
}
const PF = [0, 0, 0, 0], PF2 = [0, 0, 0, 0];
/* a coolant particle's place in the pump (local) at phase ph: [x, y, z, stage] */
function pumpPt(ph, rot, sg, ch, lane, h, o) {
  const vR = a => .255 + .085 * a / TAU;
  if (ph < .26) { const u = ph / .26, rr = .02 + .07 * lane, a = h * TAU + sg * u * .8; o[0] = Math.cos(a) * rr; o[1] = Math.sin(a) * rr; o[2] = 1.78 - .52 * u; o[3] = 0; }
  else if (ph < .52) { const u = (ph - .26) / .26, rr = .06 + .23 * u, a = rot + sg * (ch / 6 * TAU + 1.1 * Math.sqrt(u) + .52); o[0] = Math.cos(a) * rr; o[1] = Math.sin(a) * rr; o[2] = 1.19 + .04 * lane; o[3] = 1; }
  else {
    const u = (ph - .52) / .48, pe = rot + sg * (ch / 6 * TAU + 1.62), ae = (((sg * (pe - PI / 2)) % TAU) + TAU) % TAU;
    if (u < .78) { const w = u / .78, a = ae + (TAU - ae) * w, rr = vR(a) - .02 - .05 * lane, phi = PI / 2 + sg * a; o[0] = Math.cos(phi) * rr; o[1] = Math.sin(phi) * rr; o[2] = 1.15 + .18 * lane; o[3] = 2; }
    else { const w = (u - .78) / .22; o[0] = (lane - .5) * .1; o[1] = .32 + .26 * w; o[2] = 1.24 + (h - .5) * .1; o[3] = 3; }
  }
  return o;
}
/* the coolant through a pump (local frame L): in along the axis through the suction, out along the impeller's vanes
   (turning with it), round the volute and up the discharge: each particle a short streak, lime in the impeller */
function pumpFlowFX(T, L, rot, sg, r) {
  const sp = .35 + .65 * r;
  // the channels between the vanes, turning with the impeller (faint lime guides)
  for (let ch = 0; ch < 6; ch++) {
    let px = 0, py = 0, pz = 0;
    for (let k = 0; k <= 8; k++) {
      const u = k / 8, rr = .06 + .23 * u, a = rot + sg * (ch / 6 * TAU + 1.1 * Math.sqrt(u) + .52);
      apI(L, Math.cos(a) * rr, Math.sin(a) * rr, 1.2, Q1);
      if (k) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 2.5, 1, LIME, .22 * r);
      px = Q1[0]; py = Q1[1]; pz = Q1[2];
    }
  }
  // the particles: a streak each (four segments back along their path), the head bright
  for (let j = 0; j < 220; j++) {
    const h = K.hh(j, 2.7), ph = ((T * .42 * sp + h) % 1 + 1) % 1, ch = Math.floor(K.hh(j, 9.3) * 6), lane = K.hh(j, 4.1), hb = K.hh(j, 8.8);
    const a = .95 * r * (.6 + .4 * K.hh(j, 5.1)) * (ph > .9 ? 1 - (ph - .9) / .1 : 1);
    pumpPt(ph, rot, sg, ch, lane, hb, PF); apI(L, PF[0], PF[1], PF[2], Q1);
    const st = PF[3];
    for (let s = 1; s <= 4; s++) {
      const pt = ph - .012 * s; if (pt < 0) break;
      pumpPt(pt, rot, sg, ch, lane, hb, PF2); if (PF2[3] !== st && !(st === 2 && PF2[3] === 1)) break;
      apI(L, PF2[0], PF2[1], PF2[2], Q2);
      K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1.2, 1, st === 1 ? LIME : WH, a * (1 - s * .2));
      Q1[0] = Q2[0]; Q1[1] = Q2[1]; Q1[2] = Q2[2];
    }
    apI(L, PF[0], PF[1], PF[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, st === 1 ? HOT : WH, a);
    if (j % 4 === 0) P_.oglow(Q1[0], Q1[1], Q1[2], 9, LIME, .3 * a);
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
const COL = P_.poly([[0, P_.FL + .25, P_.GZ], [0, P_.GY - 2.0, P_.GZ]]);
/* dots running along a polyline (model frame) at sp m/s, gap m apart. Tw: model -> world; Ts: model -> ship for the
   X-ray (points under the deck show only where the window is open), null: above the deck, always shown */
function flow(pl, Tw, Ts, T, sp, gap, size, col, A, glow) {
  if (A < .01) return;
  const off = ((T * sp) % gap + gap) % gap;
  for (let s = off; s < pl.L; s += gap) {
    P_.polyAt(pl, s, Q2);
    if (Ts) { apI(Ts, Q2[0], Q2[1], Q2[2], Q3); if (Q3[1] < P_.GY - .05 && !isOpen(Q3[2])) continue; }
    apI(Tw, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], size, col, A);
    if (glow) P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, glow * A);
  }
}
const ID = X.make(R.I(), [0, 0, 0]);
/* the coolant: pumped to the mount up the column, back down and out to the heat sink in the keel, cold from it */
function coolFlow(T, st, Ws) {
  const A = .65 * st.pumpR * (1 - E.ss(XSH - 1, XSH, T)); if (A < .01) return;
  // the pumps' loop: cold from the keel to the suctions, out of the volutes to the header; to the mount once the
  // riser is open (up the column, back down it and out to the keel's heat exchangers)
  for (const pl of P_.COOL_COLD) flow(pl, Ws, ID, T, 1.4, .26, 1, WH, A, 0);
  for (const pl of P_.COOL_PD) flow(pl, Ws, ID, T, 1.6, .22, 1, WH, A, 0);
  const ro = E.sat((T - T_RIS) / .6);
  if (ro > .01) {
    flow(P_.COOL_SUP, Ws, ID, T, 1.4, .26, 1, WH, A * ro, 0);
    flow(P_.COOL_COL[0], Ws, ID, T, 1.4, .26, 1, HOT, A * ro * E.sat((riseD(T) - RISE.L[4]) / 2), .15);
    flow(P_.COOL_RET, Ws, ID, T, 1.4, .26, 2, HOT, A * ro * E.sat((riseD(T) - RISE.L[4]) / 2), .25);
  }
}
/* the cabinets: three status rows each (power, activity, the bank's charge as a bar), breaker arcs */
function cabinetFX(T, st, Ws) {
  if (!allOpen(55.2, 56.3)) return;
  const on = E.ss(B_PR - .5, B_PR, T) * (1 - E.ss(TF + 12, TF + 13, T)), bank = nCharged(T) / NMOD, busy = E.ss(T_BANK - .5, T_BANK, T) * (1 - E.ss(TF + .5, TF + 1.5, T));
  for (let c = 0; c < 5; c++) {
    const xc = P_.CAB_X[c], z = P_.CAB_Z - .012;
    for (let j = 0; j < 10; j++) {
      const x = xc - .3 + j * .0667;
      let a1 = on * (j < 3 || K.hh(c * 11 + j, 1) > .45 ? .75 : .12), c1 = j < 3 ? LIME : WH;
      apI(Ws, x, P_.FL + 2.24, z, Q1); if (a1 > .02) { P_.odot(Q1[0], Q1[1], Q1[2], 2, c1, a1); if (j < 3) P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .3 * a1); }
      const bl = K.hh(c * 7.1 + j * 3.3, Math.floor(T * (3 + 9 * busy) + j * .37)) > .55 - .25 * busy ? 1 : 0;
      apI(Ws, x, P_.FL + 2.14, z, Q1); if (on > .02) { P_.odot(Q1[0], Q1[1], Q1[2], 2, busy > .3 && bl ? LIME : WH, on * (.15 + .85 * bl)); if (bl && busy > .3) P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .35 * on); }
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
}
/* module LEDs and charge bars */
function moduleFX(T, Ws) {
  for (let k = 0; k < NMOD; k++) {
    const m = P_.MOD[k]; if (!isOpen(m.p[2])) continue;
    const l = modLvl(k, T), pre = E.ss(modT(k) - .6, modT(k), T) * (1 - E.ss(TF, TF + .2, T));
    if (l < .01 && pre < .01) continue;
    const L = X.mul(Ws, MOD_L[k]);
    for (let j = 0; j < 6; j++) { const on = l * 6 > j + .5 ? 1 : 0; apI(L, -.41, .01, -.16 + j * .04, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, on ? LIME : WH, on ? .9 : .15 * pre); }
    apI(L, -.41, -.12, .12, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .3 + .7 * l);
    const fl = lock(T, modT(k) + .1); if (fl > .05) { apI(L, -.47, .15, 0, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .5 * fl); }
  }
}
/* the pumps' motors: the stator's coils switched round in step with the rotor's magnets (three phases, four pole
   pairs), the inverter's lamp, the impeller's wake in the volute */
function pumpFX(T, st, Ws) {
  const r = st.pumpR; if (r < .02) return;
  for (let i = 0; i < 2; i++) {
    const L = X.mul(Ws, PUMP_L[i]); if (!isOpen(P_.PUMPS[i][2] + .4)) continue;
    const sg = i ? -1 : 1, rot = st.pump * sg + i;
    for (let k = 0; k < P_.PST; k++) {
      const a = (k + .5) / P_.PST * TAU, ph = Math.cos(4 * (a - rot) * sg), on = E.clamp((ph - .2) / .5, 0, 1); if (on < .05) continue;
      apI(L, Math.cos(a) * .19, Math.sin(a) * .19, .36, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 12, LIME, .3 * on * r);
    }
    apI(L, .142, .32, .27, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .9 * E.ss(T_PMP - .2, T_PMP, T)); P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .4 * E.ss(T_PMP - .2, T_PMP, T));
    pumpFlowFX(T, L, rot, sg, r);
  }
}
function drawRoomFX(T, st, Ws) {
  drawRotorFX(T, st, Ws);
  drawExplodeFX(T, st, Ws);
  r3RoomFX(T, st, Ws);
  coolFlow(T, st, Ws);
  pumpFX(T, st, Ws);
  cabinetFX(T, st, Ws);
  moduleFX(T, Ws);
  // alternators -> cabinets, cabinets -> racks, racks -> the column (under the floor), up the column
  for (let k = 0; k < 4; k++) busPulses(P_.BUS_A[k], T, T_BANK - .8 + .15 * k, TF + .2, 3.2, .7, .9, Ws);
  for (let r = 0; r < 4; r++) busPulses(P_.BUS_B[r], T, brkT(r) + .1, T_BANK1 + .6, 3.0, .6, .85, Ws);
  for (let r = 0; r < 4; r++) busPulses(P_.BUS_C[r], T, T_RAIL - .2 + .2 * r, TF + .1, 2.2, .5, 1, Ws);
  busPulses(COL, T, T_RAIL + .4, TF + .1, 2.4, .35, 1, Ws);
}
/* the loader's lights: the cell's latch, the hoist's chain, the tray's grips, the rammer's chain, the round
   seating, the breech seal; in the exploded view a scan plane sweeps the round's parts as they part and close */
function loaderFX(T, st, Ws) {
  if (!isOpen(P_.GZ)) return;
  if (st.xp > .01 && XF.RND) {
    const L = XF.RND, e = st.xp, U = X.dir(L, [1, 0, 0]), W = X.dir(L, [0, 1, 0]);
    const zs = -1.1 + 2.2 * ((T - T_XP - .3) / 1.2 % 1);
    apI(L, 0, 0, zs, Q1); K.ringW(Q1, U, W, .2 + .12 * e, 90, 1, LIME, .8 * e, T * 3);
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + .9; apI(L, Math.cos(a) * (.14 + .34 * e), Math.sin(a) * (.14 + .34 * e), zs, Q2); P_.odot(Q2[0], Q2[1], Q2[2], 2, HOT, e); }
    for (const z of [-1.0 - .42 * e, 1.0 + .3 * e]) { apI(L, 0, 0, z, Q1); K.ringW(Q1, U, W, .17, 60, 1, LIME, .5 * e, -T * 2); }
  }
  // the cell's latch lets go under the hoist; the drum's index
  const cl = Math.max(lock(T, LD(.3)), lock(T, T_DRUM + .6));
  if (cl > .02) { apI(Ws, P_.MAG_CELL.p[0], P_.FL + .15, P_.MAG_CELL.p[2], Q1); K.ringW(Q1, [1, 0, 0], [0, 0, 1], .2 + .1 * (1 - cl), 48, 1, LIME, cl, 0); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .5 * cl); }
  // the hoist's chain while it runs
  if ((T > LD(.4) && T < LD(2.8)) || (T > LD(6.8) && T < LD(8.8))) {
    const dir = T < LD(2.8) ? 1 : -1, ph = ((T * 3.6 * dir) % .16 + .16) % .16, y0 = P_.HY0 - 1.1, y1 = P_.HY1 + 1.15;
    for (let y = y0 + ph; y < y1; y += .16) for (const dz of [.07, .27]) { apI(XF.T, 0, y, P_.HZ + dz, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .6); }
  }
  // the tray's grips close on the round
  const gp = lock(T, LD(3.4));
  if (gp > .02) for (const z of [-.8, 0, .8]) for (const s of [-1, 1]) { apI(XF.tray, s * .12, .12, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, gp); P_.oglow(Q1[0], Q1[1], Q1[2], 10, LIME, .5 * gp); }
  // the rammer's chain from its housing to the head while it pushes and draws back
  if (st.ramH > .005) {
    const zh = P_.TRAY_Z - P_.RND_H - .22 + P_.RAM_L * st.ramH, z0 = -4.74;
    apI(XF.C, 0, -.03, z0, Q1); apI(XF.C, 0, -.03, zh, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, 1, HOT, .8, LIME, .1, .02);
    const ph = (st.ramH * P_.RAM_L) % .1;
    for (let z = z0 + ph; z < zh; z += .1) for (const s of [-1, 1]) { apI(XF.C, s * .05, -.03, z, Q3); P_.odot(Q3[0], Q3[1], Q3[2], 1, LIME, .8); }
  }
  // the round in hand: a tracked outline while the loader moves it
  if (st.rnd === 1 || (st.rnd === 2 && T < LD(LK.bk0) && st.xp < .05)) {
    const Lr = st.rnd === 1 ? X.mul(XF.T, X.make(ROT_UP, [0, st.hoistY, P_.HZ])) : st.ram > 0 ? X.mul(XF.B, tr(0, 0, P_.TRAY_Z + P_.RAM_L * st.ram)) : XF.tray;
    const U = X.dir(Lr, [1, 0, 0]), W = X.dir(Lr, [0, 1, 0]);
    for (const z of [-1.0, -.62, .48, 1.0]) { apI(Lr, 0, 0, z, Q1); K.ringW(Q1, U, W, z < -.7 || z > .9 ? .05 : .16, 40, 1, LIME, .8, T * 4); }
    apI(Lr, 0, 0, 1.0, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .45);
  }
  // the breech seal as the block reaches home
  const bs = Math.max(lock(T, LD(LK.sh1)), .5 * E.ss(LD(LK.sh1) - .1, LD(LK.sh1), T) * (1 - E.ss(LD(LK.sh1) + .3, LD(LK.sh1) + 1.6, T)));
  if (bs > .02) { apI(XF.B, 0, 0, -2.44, Q1); K.ringW(Q1, X.dir(XF.B, [1, 0, 0]), X.dir(XF.B, [0, 1, 0]), .2 + .3 * (1 - bs), 60, 1, LIME, bs, 0); }
}

/* ---------- the mount's FX: hydraulics, cryogenics, the field, sensors, currents ---------- */
/* the hydraulics: the pump's nine pistons riding the swash plate (lime on the pressure stroke), the oil in pulses
   from the pump through the filter to the manifold and into the accumulators while they charge, the accumulators'
   oil under their pistons, the gauges' needles, the spools as they shift; oil out to the rams and the train motors
   while they move */
function oilPulses(pl, Tw, T, sp, lam, A, sz) {
  const off = ((T * sp) % lam + lam) % lam;
  for (let s = 0; s < pl.L; s += .022) {
    const w = Math.max(0, Math.cos(((s - off) / lam) * TAU)), b = .18 + .82 * w * w * w; if (b * A < .02) continue;
    P_.polyAt(pl, s, Q2); apI(Tw, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], w > .9 ? 2 : 1, w > .8 ? HOT : LIME, A * b);
  }
}
function needle(Tw, g, r, f, a) {
  const ang = (-135 + 270 * E.sat(f)) * DEG, ca = Math.sin(ang), sa = Math.cos(ang);
  apI(Tw, g[0] + .012, g[1] - sa * r * .15, g[2] + ca * r * .15, Q1); apI(Tw, g[0] + .012, g[1] + sa * r * .85, g[2] - ca * r * .85, Q2);
  K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, HOT, a, LIME, .15, 0);
  apI(Tw, g[0] + .012, g[1], g[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, a);
}
function hydFX(T, st) {
  const H = P_.HPU, TT = XF.T;
  if (st.elv > .01) for (let i = 0; i < 2; i++) oilPulses(P_.HYD[i], TT, T, 2.4, .3, .9 * st.elv, 1);
  if (st.trv > .01) for (let i = 2; i < 4; i++) oilPulses(P_.HYD[i], TT, T, 2.4, .3, .9 * st.trv, 1);
  const g = st.ghS; if (g < .05) return;
  const A = E.sat(g / .3);
  if (st.hpuR > .01) {
    const tl = Math.tan(17 * DEG * st.stroke), L = X.mul(TT, tr(H.pump[0], H.pump[1], H.pump[2])), zs = H.SW - H.pump[2] + .014;
    for (let k = 0; k < H.PN; k++) {
      const a = st.hpu + k / H.PN * TAU, c = Math.cos(a), s = Math.sin(a), x = c * H.PR, y = s * H.PR, z0 = zs + y * tl, pr = st.stroke > .05 && c > 0;
      for (let j = 0; j < 8; j++) { apI(L, x, y, z0 + j * .016, Q1); P_.odot(Q1[0], Q1[1], Q1[2], j ? 1 : 2, pr ? LIME : WH, A * (j ? .75 : 1) * (.4 + .6 * st.hpuR)); }
    }
  }
  const chg = E.ss(T_HPU + 1.1, T_HPU + 1.5, T) * (1 - E.ss(T_HPU + 6.4, T_HPU + 7.0, T)), run = Math.max(chg, .5 * Math.max(st.elv, st.trv), .15 * st.hpuR);
  if (run > .01) {
    oilPulses(P_.HYD_P[0], TT, T, 2.2, .14, A * run, 1); oilPulses(P_.HYD_P[1], TT, T, 2.2, .14, A * run, 1);
    for (let i = 2; i < 5; i++) oilPulses(P_.HYD_P[i], TT, T, 1.6, .14, A * Math.max(chg, .5 * Math.max(st.elv, st.trv)), 1);
    flow(P_.HYD_P[5], TT, null, T, .9, .08, 1, WH, .5 * A * run, 0);
  }
  // the accumulators: the oil under each piston (lime), rising as it charges; the gas above
  for (const ac of H.acc) {
    const yp = ac[1] + H.AYB + (H.AYT - H.AYB) * st.acc - .04;
    for (let y = ac[1] + .14; y < yp; y += .045) for (let j = 0; j < 16; j++) { const b = j / 16 * TAU + y * 3; apI(TT, ac[0] + Math.cos(b) * .12, y, ac[2] + Math.sin(b) * .12, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .45 * A * (.4 + .6 * chg)); }
    for (let j = 0; j < 36; j++) { const b = j / 36 * TAU; apI(TT, ac[0] + Math.cos(b) * .14, yp, ac[2] + Math.sin(b) * .14, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .95 * A * Math.max(.3, st.acc)); }
  }
  // the gauges: the system pressure, the precharge (9 MPa)
  needle(TT, H.gauge, .085, P_HYD * st.hp / 25, A);
  needle(TT, H.gauge2, .05, 9 / 25, .8 * A);
  // the spools shifting for the lay (their solenoids lit), the unloading valve's click
  const sh = st.spool;
  H.spool.forEach((z, k) => { if (k > 1) return; const a = Math.max(sh, lock(T, T_LAY + .1 * k)); if (a < .02) return; apI(TT, 1.82 + .02 * sh, .96, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, A * a); P_.oglow(Q1[0], Q1[1], Q1[2], 10, LIME, .35 * A * a); });
  const ul = lock(T, T_HPU + 6.5); if (ul > .02) { apI(TT, 1.6, .9, -1.6, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .6 * ul * A); }
  if (st.hpuR > .02) { const m = H.mot; for (let k = 0; k < 6; k++) { const b = st.hpu + k / 6 * TAU; for (let j = 1; j < 6; j++) { apI(TT, m[0] + Math.cos(b) * .032 * j, m[1] + Math.sin(b) * .032 * j, m[2] - .01, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, j > 3 ? HOT : LIME, .7 * st.hpuR * A); } } }
}
/* the cryocoolers: a cold pulse runs down each regenerator, helium flows in the lines and the headers; the current
   leads light as their coil energises */
function cryoFX(T, st) {
  const A = st.cryo; if (A < .01) return;
  const B = XF.B;
  for (let i = 0; i < P_.COLD.length; i++) {
    const c = P_.COLD[i], u = ((T * 1.4 + i * .37) % 1), y = c[1] + .23 - .2 * u;
    for (let j = 0; j < 14; j++) { const b = j / 14 * TAU; apI(B, c[0] + Math.cos(b) * .052, y, c[2] + Math.sin(b) * .052, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, u > .7 ? WH : LIME, A * (.35 + .45 * (1 - u))); }
  }
  for (const s of [-1, 1]) { const pl = s > 0 ? HEAD_S : HEAD_P; flow(pl, B, null, T * (s > 0 ? 1 : -1), .8, .14, 1, WH, .55 * A, 0); }
  if (Math.max(st.ghS, st.gh) < .05) for (const pl of P_.HE_T) flow(pl, XF.T, null, T, .8, .14, 1, WH, .4 * A, 0);
  for (let k = 0; k < NST; k++) {
    const v = st.coil[k], e = lock(T, enT(k)) + (v > .02 && v < .98 ? .6 : 0); if (e < .02) continue;
    for (const s of [-1, 1]) for (let y = 0; y < .2; y += .02) { apI(B, s * .45, P_.KY + y, P_.STN[k] + .22, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, HOT, Math.min(1, e)); }
  }
}
const HEAD_S = P_.poly([[.17, .48, -2.0], [.17, .48, P_.RZ1 - .2]]), HEAD_P = P_.poly([[-.17, .48, -2.0], [-.17, .48, P_.RZ1 - .2]]);
const MAN = [-1, 1].map(s => P_.poly([[s * .12, -.52, -2.25], [s * .12, -.52, P_.RZ1 - .1]]));
/* the field: at each energised station the dipole's lines run straight across the bore between the coils and loop
   back round them (upper and lower families); they swell and brighten with the coil's current and again as the rails
   charge, dots running round them in the field's direction */
const FLD_NJ = 4, FLD_N = 128, FLD = (() => {         // loop j, family f: points in the station's x-y plane (m at full field)
  // each line runs straight across the bore at y0 (the field between the coils, 5 T), out round the coil on the far side,
  // back over the top (or under) and in again: a boxy loop (superellipse) from y0 to h
  const A = new Float32Array(FLD_NJ * 2 * FLD_N * 3);
  for (let j = 0; j < FLD_NJ; j++) for (let f = 0; f < 2; f++) for (let i = 0; i < FLD_N; i++) {
    const t = i / FLD_N * TAU, y0 = .02 + .035 * j, h = .5 + .17 * j, w = .7 + .12 * j, c = Math.cos(t), sn = Math.sin(t);
    const x = w * Math.sign(c) * Math.pow(Math.abs(c), .55), y = (h + y0) / 2 - (h - y0) / 2 * Math.sign(sn) * Math.pow(Math.abs(sn), .55);
    const o = ((j * 2 + f) * FLD_N + i) * 3; A[o] = x; A[o + 1] = f ? -y : y; A[o + 2] = Math.abs(x) < .16 && Math.abs(y) < .16 ? 1 : 0;   // (in the bore)
  }
  return A;
})();
function fieldFX(T, st) {
  const ch = st.chg, B = XF.B, cq = cutOf(st), near = V.dist(C.eye, XF.B.T) < 30;
  for (let k = 0; k < NST; k++) {
    const v = st.coil[k]; if (v < .02) continue;
    const g = .6 + .4 * v + .12 * ch, z = P_.STN[k], br = Math.min(.9, (.5 + .4 * ch + .3 * cq.q) * v), sw = lock(T, enT(k) + .45);
    // the return loops round the coils: dotted lines, a pulse running round each in the field's direction
    for (let j = 0; j < FLD_NJ; j++) for (let f = 0; f < 2; f++) {
      const o0 = (j * 2 + f) * FLD_N, ph = (T * .5 + k * .13 + j * .3) % 1, a = br * (1 - .16 * j);
      let px = 0, py = 0, pz = 0;
      for (let i = 0; i <= FLD_N; i += 2) {
        const o = (o0 + (i % FLD_N)) * 3, u = i / FLD_N, d = Math.abs(u - ph), hot = d < .03 || d > .97;
        apI(B, FLD[o] * g, FLD[o + 1] * g, z, Q1);
        if (i && near) K.lineW(px, py, pz, Q1[0], Q1[1], Q1[2], 3, 1, LIME, .3 * a + .3 * sw);
        if (hot) P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, Math.min(1, a * 2));
        px = Q1[0]; py = Q1[1]; pz = Q1[2];
      }
    }
    // the field across the bore, coil to coil (the B the armature's current will cross): a sheet of straight lines
    // over the station's length, pulses running starboard -> port
    for (let zi = -2; zi <= 2; zi++) for (let yi = -2; yi <= 2; yi++) {
      const zz = z + zi * .11, yy = yi * .055, ph = ((T * 1.2 + zi * .17 + yi * .29 + k * .07) % 1 + 1) % 1, a = br * (zi === 0 || yi === 0 ? 1 : .6);
      apI(B, .58, yy, zz, Q1); apI(B, -.58, yy, zz, Q2);
      if (near) K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2, 1, LIME, Math.min(1, .55 * a + .4 * sw));
      apI(B, .14, yy, zz, Q1); apI(B, -.14, yy, zz, Q2);
      if (near) K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.5, 1, LIME, Math.min(1, .9 * a + .4 * sw));
      for (let h = 0; h < 2; h++) { const u = (ph + h * .5) % 1; apI(B, .58 - 1.16 * u, yy, zz, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, Math.min(1, 1.2 * a)); }
    }
  }
}
/* the sensors: the director's laser ranging and its lock, the radar's search fan then its track beam, the muzzle
   velocity radar's beam along the bore */
function sensorFX(T, st) {
  const L = XF.eoP;
  const on = E.ss(T_DLK - 1.8, T_DLK - 1.4, T) * (1 - E.ss(SX(51), SX(51.6), T));
  if (on > .01) for (const w of P_.EO_WIN) { apI(L, w[0], w[1], w[2] + .005, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .7 * on); }
  // the director's laser ranging (toward the target)
  for (const t0 of [T_DLK - .5, T_DLK + .6, T_EL1 + .1]) {
    const a = T - t0; if (a < 0 || a > .5) continue;
    const w = P_.EO_WIN[2]; apI(L, w[0], w[1], w[2], Q1); const dl = V.norm(V.sub(ISCN.tgtW, Q1));   // INTERCEPT
    for (let k = 0; k < 3; k++) Q2[k] = Q1[k] + dl[k] * (6 + 160 * a);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2, 1, HOT, .9 * (1 - a / .5), LIME, .2, .05);
  }
  const lk = lock(T, T_DLK);
  if (lk > .02) { apI(L, 0, 0, 0, Q1); if (K.pj(Q1[0], Q1[1], Q1[2])) { const x = K.PJ[0], y = K.PJ[1], r = (26 + 30 * (1 - lk)) * RSC; K.bracket([x - r, y - r, x + r, y + r], '#C6F432', lk, 8, 1.4); } }
  // the radar: a fan of three beams sweeping while it searches; locked, its beam toward the target as a cone of rings
  // running out (the lock flashes it)
  const F = XF.fcY, A = P_.FC_A, srch = st.fcScan, trk = st.fcLk;
  if (srch > .01 || trk > .01) {
    apI(F, A.T[0], A.T[1], A.T[2], Q1);
    const dz = X.dir(F, R.ap(A.R, [0, 0, 1])), dx = X.dir(F, R.ap(A.R, [1, 0, 0]));
    if (srch > .01) for (const k of [-1, 0, 1]) { const s = .07 * k; Q2[0] = Q1[0] + (dz[0] + dx[0] * s) * 30; Q2[1] = Q1[1] + (dz[1] + dx[1] * s) * 30; Q2[2] = Q1[2] + (dz[2] + dx[2] * s) * 30; K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 3, 1, LIME, .35 * srch * (k ? .6 : 1)); }
    if (trk > .01) {
      const db = V.norm(V.sub(ISCN.tgtW, Q1)), U = V.norm(V.cross(db, [0, 1, 0])), W = V.cross(U, db), fl = lock(T, T_RLK), ta = 2.2 * DEG;   // INTERCEPT
      for (let i = 0; i < 9; i++) {
        const d = ((T * 9 + i * 3.4) % 30) + .5, r = .22 + d * Math.tan(ta), a = trk * (1 - d / 31) * (.45 + .55 * fl);
        for (let k = 0; k < 3; k++) Q3[k] = Q1[k] + db[k] * d;
        K.ringW(Q3, U, W, r, 40, 1, LIME, .7 * a, T * 2 + i);
      }
      // (round 3: close to the face, where the lens sees it, the cone's rings leave the array slowly, bright)
      for (let i = 0; i < 6; i++) {
        const d = ((T * 1.6 + i * .7) % 4.2) + .25, r = .3 + d * Math.tan(ta) * 4, a = trk * (1 - d / 4.6) * (.6 + .4 * fl);
        for (let k = 0; k < 3; k++) Q3[k] = Q1[k] + db[k] * d;
        K.ringW(Q3, U, W, r, 72, 2, i % 2 ? LIME : HOT, .85 * a, T + i);
      }
      for (const [su, sw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 0; k < 3; k++) { Q2[k] = Q1[k] + (U[k] * su + W[k] * sw) * .22; Q3[k] = Q1[k] + db[k] * 30 + (U[k] * su + W[k] * sw) * (.22 + 30 * Math.tan(ta)); }
        K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 4, 1, LIME, .22 * trk * (.5 + .5 * fl));
      }
      for (let i = 0; i < 12; i++) { const d = ((T * 14 + i * 2.5) % 30) + .6; P_.odot(Q1[0] + db[0] * d, Q1[1] + db[1] * d, Q1[2] + db[2] * d, 2, HOT, .8 * trk * (1 - d / 32)); }
      if (fl > .02) P_.oglow(Q1[0], Q1[1], Q1[2], 40, LIME, .6 * fl);
    }
  }
  // the muzzle velocity radar's beam along the bore, faint once laid, bright through the shot
  const mv = Math.max(.25 * E.ss(T_EL1, T_EL1 + .3, T) * (1 - E.ss(TF + 2, TF + 3, T)), lock(T, T_EL1 + .1), st.chg * .6, st.glow);
  if (mv > .02) { const m = P_.MV_P; apI(XF.C, m[0], m[1] + .06, 2.87, Q1); apI(XF.C, m[0], m[1] + .06, 2.87 + 40, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 3, 1, LIME, .5 * mv, LIME, .04, 0); }
}
/* the coolant in the mount (the starboard trunnion -> the rails' manifold), helium out to the headers */
function mountFlow(T, st) {
  const A = .55 * st.pumpR; if (A < .01) return;
  for (const pl of P_.COOL_T) flow(pl, XF.T, XR.T, T, 1.2, .2, 1, WH, A * (Math.max(st.ghS, st.gh) > .3 ? 1 : .5), 0);
  flow(MAN[0], XF.B, null, T, 1.2, .22, 1, WH, A, 0); flow(MAN[1], XF.B, null, -T, 1.2, .22, 1, HOT, A, .15);
}
/* the flexible bus straps from the training structure to the injection blocks (they flex as it elevates): current
   pulses through them while the rails charge and at the shot */
const SB0 = [0, 0, 0], SB1 = [0, 0, 0], SB2 = [0, 0, 0], SB3 = [0, 0, 0];
function straps(T, st) {
  const I = Math.max(E.ss(T_RAIL - .2, T_RAIL + .4, T) * (1 - E.ss(TF, TF + .3, T)), st.glow);
  const vis = .3 + .5 * I + .4 * Math.max(st.ghS, st.gh), n = 40;
  for (let si = 0; si < 2; si++) {
    const s = si ? 1 : -1, a = P_.BUS_ANCH[si], f = P_.FEED_B[si];
    for (let c = -2; c <= 2; c++) {
      apI(XF.T, a[0], a[1], a[2] + c * .05, SB0); apI(XF.T, a[0], a[1] - .1, a[2] - .9 + c * .05, SB1);
      apI(XF.B, f[0] + s * .45, f[1] - .35, f[2] + c * .05, SB2); apI(XF.B, f[0], f[1], f[2] + c * .05, SB3);
      for (let i = 0; i <= n; i++) {
        const u = i / n, w0 = (1 - u) * (1 - u) * (1 - u), w1 = 3 * u * (1 - u) * (1 - u), w2 = 3 * u * u * (1 - u), w3 = u * u * u;
        const x = w0 * SB0[0] + w1 * SB1[0] + w2 * SB2[0] + w3 * SB3[0], y = w0 * SB0[1] + w1 * SB1[1] + w2 * SB2[1] + w3 * SB3[1], z = w0 * SB0[2] + w1 * SB1[2] + w2 * SB2[2] + w3 * SB3[2];
        const p = I > .01 ? Math.max(0, Math.cos((u * 5 - T * 4 * s) * TAU * .5)) : 0;
        P_.odot(x, y, z, 1, p > .85 ? HOT : WH, vis * .75);
        if (p > .9) P_.oglow(x, y, z, 7, LIME, .35 * I);
      }
    }
  }
}
/* frost: crystals on the cold heads, their flex lines and the helium headers, each appearing at its own point of the
   cool-down (seeded per point), a few glinting */
function frostFX(T, st) {
  const P = P_.FROST.pts; if (!P || T < T_CRYO || T > TF + 15) return;
  const B = XF.B, RG = P_.FROST.rng, fr = Math.floor(T * 10), f = st.frost, hz = st.hdr, mlt = 1 - kk(T, TF + 6, TF + 14), cq = cutOf(st);
  // (round 3: per cold head, culled off screen and thinned with distance on a stable per-point hash, the crystals
  // being far below a dot's size beyond a few metres)
  const M = .2 * K.BW;
  for (let g = 0; g < RG.length - 1; g++) {
    const i0 = RG[g], i1 = RG[g + 1], hdr = g === RG.length - 2;
    let kf = 1;
    if (!hdr) {
      const c = P_.COLD[g]; apI(B, c[0], c[1] + .15, c[2], Q1);
      if (!K.pj(Q1[0], Q1[1], Q1[2]) || K.PJ[0] < -M || K.PJ[1] < -M || K.PJ[0] > K.BW + M || K.PJ[1] > K.BH + M) continue;
      kf = Math.min(1, Math.pow(3.6 / Math.max(.1, K.PJ[2]), 2) + .04);
    } else { apI(B, 0, .5, 4, Q1); kf = Math.min(1, Math.pow(6 / Math.max(.1, V.dist(C.eye, Q1)), 2) + .06); }
    for (let i = i0; i < i1; i++) {
      if (kf < 1 && (i * .6180339887) % 1 > kf) continue;
      const o = i * 6, kind = P[o + 3], h = P[o + 5];
      let v;
      if (kind === 0) v = f - h;                                        // the cold heads, from the flange up
      else if (kind === 1) v = 1.2 * f - .2 - h;                        // their flex lines a little behind
      else if (kind === 2) v = mlt * ((hz - P[o + 2]) / 1.6 - h);       // the headers, behind the cold front
      else v = st.kc[P[o + 4]] - h;                                     // the cryostats as the station reaches 20 K
      if (v <= 0) continue;
      if (st.xc > .02 && P[o + 4] === P_.XST && kind < 2) continue;    // (the station drawn apart: its cold heads go without their frost)
      const x = P[o], y = P[o + 1], z = P[o + 2];
      if (cq.q > .05 && x > cq.x0 && y > 0 && z > cq.zr[0] && z < cq.zr[1]) continue;
      apI(B, x, y, z, Q1);
      const gl = K.hh(i, fr) > .992, h2 = K.hh(i, 5.3), lift = kf < 1 ? Math.min(1.6, 1 / Math.sqrt(kf)) : 1;
      P_.odot(Q1[0], Q1[1], Q1[2], gl || h2 > .5 ? 2 : 1, gl ? HOT : WH, Math.min(1, (gl ? 1 : (.65 + .35 * h2) * Math.min(1, v * 6)) * lift));
    }
  }
}
function mechFX(T, st) {
  frostFX(T, st); hydFX(T, st); cryoFX(T, st); fieldFX(T, st); sensorFX(T, st); riserFX(T, st); straps(T, st); coilFeedFX(T, st); cutFX(T, st); forceFX(T, st); r3MechFX(T, st);
  // the muzzle cover's leaves seat with a flash; the elevation and train brakes as it is laid
  const lb = lock(T, T_EL1);
  if (lb > .02) for (const s of [-1, 1]) { const p = P_.RAM_E(s)[1]; apI(XF.C, p[0], p[1], p[2], Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .6 * lb); P_.odot(Q1[0], Q1[1], Q1[2], 2, HOT, lb); }
}
/* the rails charging: the rails light, rings run breech -> muzzle round the coils, arcs across the bore and out to
   the rings, the particle ring ahead of the muzzle tightens */
function drawCharge(T, st) {
  const q = st.chg; if (q < .01) return;
  const U = X.dir(XF.B, [1, 0, 0]), W = X.dir(XF.B, [0, 1, 0]);
  const z0 = P_.RZ0, z1 = P_.SLV1, Lz = z1 - z0;
  for (const y of [.19, -.19]) {
    apI(XF.B, 0, y, z0, Q1); apI(XF.B, 0, y, z1, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, LIME, .25 + .6 * q, LIME, .05 + .06 * q, .015);
  }
  const sp = 3 + 16 * q;
  for (let s = ((T - T_RAIL) * sp) % .5; s < Lz; s += .5) for (const y of [.19, -.19]) {
    apI(XF.B, 0, y, z0 + s, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 2, HOT, .5 + .5 * q);
  }
  const nR = 6, rs = .22 + 1.1 * q;
  for (let k = 0; k < nR; k++) {
    const f = ((T - T_RAIL) * rs + k / nR) % 1, z = z0 + .4 + f * (Lz - .2);
    apI(XF.B, 0, 0, z, Q1);
    const a = Math.min(1, (.25 + .9 * q) * Math.sin(PI * f) * 1.3), r = 1.35 - .3 * q + .2 * f;
    K.ringW(Q1, U, W, r, 150, 2, LIME, a * .85, T * 3 + k);
    K.ringW(Q1, U, W, r * .93, 90, 1, HOT, a * .6, -T * 2 + k);
    if (a > .3) { const fr = Math.floor(T * 30), h = K.hh(k * 7.7, fr), an = h * TAU; apI(XF.B, 0, h < .5 ? .19 : -.19, z, Q2); Q3[0] = Q1[0] + (U[0] * Math.cos(an) + W[0] * Math.sin(an)) * r; Q3[1] = Q1[1] + (U[1] * Math.cos(an) + W[1] * Math.sin(an)) * r; Q3[2] = Q1[2] + (U[2] * Math.cos(an) + W[2] * Math.sin(an)) * r; K.arcW(Q2, Q3, k * 13 + fr * .1, T, a, .35); }
  }
  if (q > .5) {
    const per = .9 - .55 * q, ph = ((T - T_RAIL) / per) % 1;
    for (const z of P_.BANDS) {
      const f = (z - z0) / Lz, d = ph - f; if (d < 0 || d > .25) continue;
      const a = (1 - d / .25) * (q - .5) * 2;
      apI(XF.B, 0, 0, z + .05, Q1); K.ringW(Q1, U, W, .72, 48, 2, HOT, a, 0);
    }
  }
  const fr = Math.floor(T * 30), n = Math.floor(2 + 10 * q);
  for (let i = 0; i < n; i++) {
    const h1 = K.hh(i * 3.7, fr), h2 = K.hh(i * 5.3 + 1, fr), z = z0 + .3 + h1 * (Lz - .6), x = (h2 - .5) * .22;
    apI(XF.B, x, .14, z, Q2); apI(XF.B, -x, -.14, z + (h2 - .5) * .4, Q3);
    K.arcW(Q2, Q3, i + fr * .1, T, .6 + .5 * q, .7);
  }
  if (q > .2) for (let i = 0; i < 4; i++) {
    const h = K.hh(i * 9.1 + 4, fr), a = h * TAU, rr0 = .9 + 1.4 * K.hh(i * 2.3, fr);
    apI(XF.E, 0, .19 * (i % 2 ? 1 : -1), P_.SLV1, Q2); apI(XF.E, Math.cos(a) * rr0, Math.sin(a) * rr0, P_.SLV1 + .3 + .8 * h, Q3);
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
/* while the rails charge, a scan plane runs the barrel breech -> muzzle and draws its section where it cuts: the
   rails top and bottom, the sidewalls between them, the containment round them, the coils' winding packs in their
   cryostats, the cold heads, the helium headers above and the coolant manifold below, the clamp collars */
const SL0 = T_SL, SL1 = T_SL + 3.4;
function rectB(Tw, x0, y0, x1, y1, z, col, a, s) {
  apI(Tw, x0, y0, z, Q1); apI(Tw, x1, y0, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, s, col, a);
  apI(Tw, x1, y1, z, Q1); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, s, col, a);
  apI(Tw, x0, y1, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, s, col, a);
  apI(Tw, x0, y0, z, Q1); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, s, col, a);
}
function circB(Tw, x, y, z, r, n, col, a) { for (let k = 0; k < n; k++) { const b = k / n * TAU; apI(Tw, x + Math.cos(b) * r, y + Math.sin(b) * r, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, col, a); } }
function drawSlice(T, st) {
  if (T < SL0 || T > SL1) return;
  const u = E.ss(SL0, SL1, T), A = E.ss(SL0, SL0 + .25, T) * (1 - E.ss(SL1 - .25, SL1, T));
  const z0 = P_.RZ0 + .05, z1 = P_.SLV1 - .05, z = z0 + (z1 - z0) * u, B = XF.B;
  for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) { if ((i + j) & 1) continue; apI(B, i * .08, j * .08, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, LIME, .16 * A); }
  rectB(B, -1.15, -1.15, 1.15, 1.15, z, LIME, .55 * A, 1);
  for (const sg of [1, -1]) {
    rectB(B, -P_.RW, sg * P_.RY0, P_.RW, sg * P_.RY1, z, HOT, A, 2);                                   // rail
    rectB(B, sg * P_.IX0, -P_.RY0, sg * P_.IX1, P_.RY0, z, LIME, .75 * A, 1);                          // sidewall
  }
  if (z > -1.72 && z < P_.RZ1) {
    rectB(B, -P_.CX, -P_.CY, P_.CX, P_.CY, z, LIME, .9 * A, 1);                                        // containment
    for (const sg of [1, -1]) { rectB(B, -.12, sg * .46, .12, sg * .5, z, LIME, .6 * A, 1); circB(B, sg * .12, -.52, z, .04, 16, WH, .9 * A); circB(B, sg * .17, .48, z, .026, 12, WH, .9 * A); }
    const k = Math.max(0, Math.min(P_.NST - 1, Math.round((z - P_.STN[0]) / P_.DZS))), dz = z - P_.STN[k];
    if (Math.abs(dz) < P_.KZ) for (const sg of [1, -1]) {
      rectB(B, sg * P_.KX0, -P_.KY, sg * P_.KX1, P_.KY, z, LIME, .85 * A, 1);                          // cryostat
      const hz = .14, ry = .25, legs = Math.abs(dz) < hz ? [ry] : Math.abs(dz) < hz + ry ? [Math.sqrt(Math.max(0, ry * ry - (Math.abs(dz) - hz) ** 2))] : [];
      const v = st.coil[k];
      for (const y of legs) for (const yy of [y, -y]) rectB(B, sg * (P_.CXC - .05), yy - .025, sg * (P_.CXC + .05), yy + .025, z, v > .5 ? HOT : LIME, A, 2);   // winding pack
      if (Math.abs(dz + .14) < .09) circB(B, sg * .5, P_.KY + .15, z, .05, 14, WH, A);               // cold head
    }
  }
  if (z > P_.SLV0) { rectB(B, -.5, -.5, .5, .5, z, LIME, .9 * A, 1); }                                 // muzzle block
  for (const zb of P_.BANDS) if (Math.abs(z - zb - .05) < .07) rectB(B, -.56, -.46, .56, .46, z, HOT, A, 2);
  apI(B, 0, 0, z, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 50, LIME, .3 * A);
}
/* ---------- round 3: what each machine does, drawn on it ---------- */
/* a dial facing the lens (centre c world, radius r m): ticks over 270°, the reading filled in lime to f, a needle;
   mark: a hot tick at that fraction (the working point) */
function dialW(c, r, f, a, n, maj, mark) {
  if (a < .01) return;
  const U = C.r, W = C.u, P = (ang, rr, o) => { const s = Math.sin(ang), co = Math.cos(ang); o[0] = c[0] + (U[0] * s + W[0] * co) * rr; o[1] = c[1] + (U[1] * s + W[1] * co) * rr; o[2] = c[2] + (U[2] * s + W[2] * co) * rr; return o; };
  const A = t => (-135 + 270 * t) * DEG;
  for (let k = 0; k < n; k++) { const t = k / (n - 1), mj = k % maj === 0; P(A(t), r, Q1); P(A(t), r * (mj ? .8 : .88), Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, mj ? 2 : 1, t <= f + 1e-6 ? LIME : WH, a * (mj ? .95 : .6)); }
  for (let k = 0; k <= 96; k++) { const t = k / 96; P(A(t), r * 1.04, Q1); K.dotW(Q1[0], Q1[1], Q1[2], t <= f ? 2 : 1, t <= f ? LIME : WH, a * (t <= f ? .95 : .35)); }
  if (mark !== undefined) { P(A(mark), r * 1.1, Q1); P(A(mark), r * .74, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, HOT, a * .9); }
  P(A(E.sat(f)), r * .9, Q1); P(A(E.sat(f)) + PI, r * .16, Q2); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, 2, HOT, a, LIME, .12, 0);
  K.dotW(c[0], c[1], c[2], 3, LIME, a); K.glowW(Q1[0], Q1[1], Q1[2], 10, LIME, .5 * a);
}
/* the bank's charge as a bar across the racks' aisle (0 -> 160 MJ, a tick each 20 MJ), filling as the modules charge */
function rackBarFX(T, Ws) {
  const a = E.ss(T_BANK - .4, T_BANK + .5, T) * (1 - E.ss(T_RIS + 1.2, T_RIS + 2.4, T)); if (a < .01) return;
  const f = nCharged(T) / NMOD + (modLvl(Math.min(NMOD - 1, nCharged(T)), T) % 1) / NMOD, x0 = -1.7, x1 = 1.7, y0 = 4.5, y1 = 4.66, z = 50.6, xf = x0 + (x1 - x0) * f;
  const L = (xa, ya, xb, yb, col, al, sz) => { apI(Ws, xa, ya, z, Q1); apI(Ws, xb, yb, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, sz || 1, col, al); };
  L(x0, y0, x1, y0, WH, .55 * a); L(x0, y1, x1, y1, WH, .55 * a); L(x0, y0, x0, y1, WH, .55 * a); L(x1, y0, x1, y1, HOT, .8 * a, 2);
  for (let k = 1; k < 8; k++) { const x = x0 + (x1 - x0) * k / 8; L(x, y1, x, y1 + .05, WH, .6 * a); }
  if (f > .002) { for (let y = y0 + .02; y < y1 - .01; y += .025) L(x0 + .01, y, xf, y, LIME, .85 * a, 2); apI(Ws, xf, (y0 + y1) / 2, z, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 22, LIME, .6 * a * (1 - E.ss(.98, 1, f) * .5)); }
}
/* the spin-up's tachometer over the aisle (0 -> 10 000 rpm, the working 9 600 marked) */
function spinDialFX(T, st, Ws) {
  const a = E.ss(T_SPIN - .8, T_SPIN, T) * (1 - E.ss(T_SPIN1 + 1.4, T_SPIN1 + 2.4, T)); if (a < .01) return;
  apI(Ws, -.2, 4.3, 46.6, Q4); dialW(Q4.slice(), .36, RPM * st.rate / 10000, a, 21, 2, RPM / 10000);
}
/* alternator 3's rotor drawn out: its four salient poles outlined (north lime, south white), each field coil's
   turns round its pole body, a scan ring running along the rotor */
function poleFX(T, st, Ws) {
  const a = E.sat((st.rtr - .55) / .45); if (a < .01 || !isOpen(P_.ALT[P_.XALT][2])) return;
  const L = X.mul(XF.XROT, X.make(R.z(st.rotX + P_.XALT), [0, 0, 0])), hw = .19, r = .815;
  for (let k = 0; k < 4; k++) {
    const b = k * TAU / 4, col = k % 2 ? WH : LIME;
    for (const d of [-hw, hw]) { apI(L, Math.cos(b + d) * r, Math.sin(b + d) * r, -.62, Q1); apI(L, Math.cos(b + d) * r, Math.sin(b + d) * r, .62, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.4, 2, col, .9 * a); }
    for (const z of [-.62, .62]) for (let j = 0; j <= 10; j++) { const c = b - hw + 2 * hw * j / 10; apI(L, Math.cos(c) * r, Math.sin(c) * r, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 2, col, .9 * a); }
    // the field coil: turns round the pole body, current running round them
    for (let j = 0; j < 40; j++) {
      const u = j / 40, per = (u + T * .6) % 1, side = u < .5, w = (side ? u : u - .5) * 2, z = (w - .5) * 1.16, c = b + (side ? -1 : 1) * .15;
      apI(L, Math.cos(c) * .68, Math.sin(c) * .68, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], per < .08 ? 2 : 1, per < .08 ? HOT : col, a * (per < .08 ? 1 : .55));
    }
    apI(L, Math.cos(b) * .86, Math.sin(b) * .86, 0, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 14, LIME, .35 * a * (k % 2 ? .5 : 1));
  }
  // the pole faces' lattice (lime north, white south)
  for (let k = 0; k < 4; k++) { const b = k * TAU / 4, col = k % 2 ? WH : LIME; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 16; j++) { const c = b - hw + 2 * hw * i / 6; apI(L, Math.cos(c) * r, Math.sin(c) * r, -.62 + 1.24 * j / 16, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, col, .55 * a); } }
  // a scan plane running along the rotor, drawing its section: the core, four pole bodies, their shoes
  const zs = -.62 + 1.24 * (.5 - .5 * Math.cos(T * 1.3)), P = (ang, rr) => apI(L, Math.cos(ang) * rr, Math.sin(ang) * rr, zs, Q2);
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= 160; i++) {
    const t = i / 160 * TAU, k = Math.round(t / (TAU / 4)) % 4, d = t - k * TAU / 4, dd = Math.abs(((d + PI) % TAU + TAU) % TAU - PI);
    const rr = dd < hw ? r : dd < hw + .02 ? .76 : .62;                                               // (shoe, its shoulder, the core between poles)
    P(t, rr);
    if (i) K.lineW(px, py, pz, Q2[0], Q2[1], Q2[2], 1, 2, LIME, .95 * a);
    px = Q2[0]; py = Q2[1]; pz = Q2[2];
  }
  for (let k = 0; k < 4; k++) { const b = k * TAU / 4; for (const d of [-.11, .11]) { const x0 = Math.cos(b) * .62 - Math.sin(b) * d, y0 = Math.sin(b) * .62 + Math.cos(b) * d, x1 = Math.cos(b) * .78 - Math.sin(b) * d, y1 = Math.sin(b) * .78 + Math.cos(b) * d; apI(L, x0, y0, zs, Q1); apI(L, x1, y1, zs, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, HOT, .8 * a); } }
  apI(L, 0, 0, zs, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 40, LIME, .18 * a);
}
/* the helium cold front: a ring of frost travelling along each header, glints behind it */
function frontRingFX(T, st) {
  const a = E.ss(T_HF0, T_HF0 + .3, T) * (1 - E.ss(T_HF1 + .2, T_HF1 + .8, T)); if (a < .01) return;
  const B = XF.B, U = X.dir(B, [1, 0, 0]), W = X.dir(B, [0, 1, 0]), z = E.clamp(st.hdr, HZ0, HZ1), fr = Math.floor(T * 12);
  for (const s of [-1, 1]) {
    apI(B, s * .17, .48, z, Q1); K.ringW(Q1, U, W, .06, 48, 2, WH, a, T * 4); K.ringW(Q1, U, W, .1, 64, 2, LIME, .8 * a, -T * 3); K.ringW(Q1, U, W, .14, 72, 1, LIME, .4 * a, T);
    K.glowW(Q1[0], Q1[1], Q1[2], 34, WH, .5 * a);
    for (let j = 0; j < 16; j++) { const h = K.hh(j * 3.1 + s, fr), zz = z - .05 - .6 * K.hh(j, 2.2), b = h * TAU; apI(B, s * .17 + Math.cos(b) * .04, .48 + Math.sin(b) * .04, zz, Q2); K.dotW(Q2[0], Q2[1], Q2[2], h > .8 ? 2 : 1, h > .8 ? HOT : WH, a * (.5 + .5 * h)); }
  }
}
/* the station drawn apart: guides from where each part sat, a scan plane crossing the coil packs */
function xcFX(T, st) {
  const xc = st.xc; if (xc < .01) return;
  const B = XF.B, zc = P_.STN[P_.XST], CXC = P_.CXC, a = E.sat(xc * 1.5) * (1 - E.ss(T_XC + 6.0, T_XC + 6.6, T) * .6);
  for (const s of [-1, 1]) {
    apI(B, s * CXC, 0, zc, Q1); apI(B, s * (CXC + .62 * xc), .16 * xc, zc, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 6, 1, LIME, .7 * a);
    const c = P_.COLD[2 * P_.XST + (s > 0 ? 1 : 0)];
    apI(B, c[0], c[1] + .2, c[2], Q1); apI(B, c[0] + s * .3 * xc, c[1] + .2 + .62 * xc, c[2], Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 6, 1, LIME, .7 * a);
    // the empty seat: the pack's outline where it was
    rectB(B, s * (CXC - .045), -.33, s * (CXC + .045), .33, zc, LIME, .35 * a, 1);
    // the scan plane running through the pack (its winding's section in it)
    const zs = zc + .42 * Math.sin(T * 1.7), x = s * (CXC + .62 * xc), y = .16 * xc;
    rectB(B, x - .05, y - .33, x + .05, y + .33, zs, LIME, .9 * a, 2);
    const dz = Math.abs(zs - zc), legs = dz < .14 ? [.25] : dz < .39 ? [Math.sqrt(Math.max(0, .0625 - (dz - .14) ** 2))] : [];
    for (const yy of legs) for (const sg of [1, -1]) rectB(B, x - .04, y + sg * yy - .03, x + .04, y + sg * yy + .03, zs, HOT, a, 2);
  }
}
/* the hydraulics' pressure on a big dial beside the unit (0 -> 25 MPa, the working 21 marked), a leader to the gauge;
   the swash plate's angle drawn on it */
const HPU_DIAL = [1.7, 1.86, -2.95];
function hpuDialFX(T, st) {
  const a = E.sat(st.ghS / .3) * kk(T, T_HPU + .2, T_HPU + 1.0) * (1 - kk(T, T_HPU + 9.0, T_HPU + 10.2)); if (a < .01) return;
  apI(XF.T, HPU_DIAL[0], HPU_DIAL[1], HPU_DIAL[2], Q4); const c = Q4.slice();
  dialW(c, .17, P_HYD * st.hp / 25, a, 26, 5, P_HYD / 25);
  const g = P_.HPU.gauge; apI(XF.T, g[0] + .01, g[1], g[2], Q1); K.lineW(c[0], c[1], c[2], Q1[0], Q1[1], Q1[2], 5, 1, LIME, .5 * a);
  // the swash plate: its face's tilt (lime), the axis square to the shaft (white): the angle between them is the stroke
  const H = P_.HPU, Ls = X.mul(XF.T, X.make(R.x(17 * DEG * st.stroke), [H.pump[0], H.pump[1], H.SW]));
  apI(Ls, 0, .13, .016, Q1); apI(Ls, 0, -.13, .016, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, LIME, a, LIME, .15, 0);
  apI(XF.T, H.pump[0], H.pump[1] + .13, H.SW + .016, Q1); apI(XF.T, H.pump[0], H.pump[1] - .13, H.SW + .016, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 3, 1, WH, .6 * a);
}
/* the radar's array face: its transmit / receive tiles (a beam stepping across them in search, all of them pulsing
   in track); in track, the beam's axis out toward the target with range ticks */
function radarTilesFX(T, st) {
  const srch = st.fcScan, trk = st.fcLk * (1 - E.ss(T_LAY + 2, T_LAY + 4, T)), A = Math.max(srch, trk, .35 * E.ss(T_RLK - 3.2, T_RLK - 2.6, T) * (1 - E.ss(T_LAY, T_LAY + 1, T)));
  if (A < .01) return;
  const F = X.mul(XF.fcY, P_.FC_A), ph = T * 9, pul = (T * 5) % 1 < .25 ? 1 : 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 9; j++) {
    const cx = -.33 + .0275 + i * .055, cy = -.24 + .0267 + j * .0533;
    const w = Math.pow(.5 + .5 * Math.cos(cx * 16 - ph + .4 * Math.sin(cy * 9 + T)), 6), on = Math.max(srch * w, trk * (.6 + .4 * pul));
    const col = trk > .5 && pul ? HOT : on > .4 ? LIME : WH, al = A * (.25 + .75 * on);
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { apI(F, cx + u * .015, cy + v * .015, .008, Q1); K.dotW(Q1[0], Q1[1], Q1[2], on > .4 ? 2 : 1, col, al); }
    if (on > .6 && (i + j) % 3 === 0) { apI(F, cx, cy, .01, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 8, LIME, .3 * A * on); }
  }
  if (trk > .02) {
    const Ff = XF.fcY, Ar = P_.FC_A; apI(Ff, Ar.T[0], Ar.T[1], Ar.T[2], Q1); const db = V.norm(V.sub(ISCN.tgtW, Q1));   // INTERCEPT
    for (let k = 0; k < 3; k++) Q2[k] = Q1[k] + db[k] * 1500;
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 3, 1, LIME, .45 * trk, LIME, .06, 0);
    const U = V.norm(V.cross(db, [0, 1, 0]));
    for (let m = 1; m <= 12; m++) { const d = m * m * 6; for (let k = 0; k < 3; k++) { Q3[k] = Q1[k] + db[k] * d - U[k] * d * .012; Q4[k] = Q1[k] + db[k] * d + U[k] * d * .012; } K.lineW(Q3[0], Q3[1], Q3[2], Q4[0], Q4[1], Q4[2], 2, 1, LIME, .5 * trk * (1 - m / 14)); }
  }
}
/* the lay: oil slugs running down the hose into the elevation rams as they extend; the train pinions' teeth meshing
   with the ring gear, lit where they walk round it */
function layFX(T, st) {
  const e = st.elv;
  if (e > .01) for (let i = 0; i < 2; i++) {
    const pl = P_.HYD[i], Lp = pl.L;
    for (let k = 0; k < 5; k++) {
      const s0 = ((T * 1.3 + k / 5 * Lp) % Lp);
      for (let j = 0; j < 7; j++) { const s = s0 - j * .018; if (s < 0) break; P_.polyAt(pl, s, Q2); apI(XF.T, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, j < 2 ? HOT : LIME, e * (1 - j * .1)); }
      P_.polyAt(pl, s0, Q2); apI(XF.T, Q2[0], Q2[1], Q2[2], Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 12, LIME, .4 * e);
    }
    const end = pl.P[pl.P.length - 1]; apI(XF.T, end[0], end[1], end[2], Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 24, LIME, .5 * e * (.6 + .4 * Math.sin(T * 9)));
  }
  const g = E.sat(st.ghS / .3) * E.ss(T_LAY - .4, T_LAY + .4, T) * (1 - E.ss(T_LAY + 9, T_LAY + 10, T)); if (g < .01) return;
  const dT = TAU / 112;
  for (let i = 0; i < 2; i++) {
    const p = P_.TD_P[i], psi = Math.atan2(p[0], p[2]) + st.yaw, m0 = Math.round(psi / dT);
    for (let m = -9; m <= 9; m++) {
      const b = (m0 + m) * dT, w = Math.exp(-Math.pow((b - psi) / (4 * dT), 2)), al = g * (.25 + .75 * w) * (.5 + .5 * st.trv);
      apI(XF.M, Math.sin(b) * (P_.RING_R - .03), .13, Math.cos(b) * (P_.RING_R - .03), Q1); apI(XF.M, Math.sin(b) * (P_.RING_R + .05), .13, Math.cos(b) * (P_.RING_R + .05), Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, w > .5 ? 2 : 1, w > .6 ? HOT : LIME, al);
    }
    apI(XF.M, Math.sin(psi) * P_.RING_R, .13, Math.cos(psi) * P_.RING_R, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .5 * g * (.4 + .6 * st.trv));
  }
}
/* the clamps: each wedge driven home with an arrow as it moves; the rammer's chain sprocket turning */
function loadFX(T, st) {
  for (let k = 0; k < P_.BANDS.length; k++) {
    const t = T - clampT(k); if (t < -.05 || t > .35) continue;
    const a = t < .12 ? 1 : Math.exp(-(t - .12) * 9), z = P_.BANDS[k] + .05;
    for (const s of [-1, 1]) arrowB(XF.B, [s * (.5 + .4 * (1 - E.sat(t / .12))), 0, z], [-s, 0, 0], .32, HOT, a, 3);
    apI(XF.B, 0, 0, z, Q1); K.ringW(Q1, X.dir(XF.B, [1, 0, 0]), X.dir(XF.B, [0, 1, 0]), .72, 96, 2, t < .14 ? HOT : LIME, .9 * a, 0); K.glowW(Q1[0], Q1[1], Q1[2], 40, LIME, .4 * a);
  }
  if (T > LD(LK.ram0) - .2 && T < LD(LK.bk1) + .3) {
    const ang = st.ramH * P_.RAM_L / .09, Ls = XF.C, U = X.dir(Ls, [0, 1, 0]), W = X.dir(Ls, [0, 0, 1]);
    apI(Ls, 0, -.03, -4.74, Q4); const c = Q4.slice(); K.ringW(c, U, W, .09, 36, 1, LIME, .9, ang);
    for (let k = 0; k < 6; k++) { const b = ang + k / 6 * TAU; for (let k2 = 0; k2 < 3; k2++) Q1[k2] = c[k2] + (U[k2] * Math.cos(b) + W[k2] * Math.sin(b)) * .09; K.lineW(c[0], c[1], c[2], Q1[0], Q1[1], Q1[2], 1.5, 1, k ? LIME : HOT, .8); }
  }
}
/* at the shot: behind the armature the current pushes the rails apart; each band takes the load as it passes (the
   rails' faces bowed out, arrows, the band flashing) */
function railsApartFX(T, st) {
  if (T < T_REL - .05 || T > TF + .6) return;
  const za = roundZ(T) - .66, B = XF.B, U = X.dir(B, [1, 0, 0]), W = X.dir(B, [0, 1, 0]);
  for (let k = 0; k < P_.BANDS.length; k++) {
    const zb = P_.BANDS[k] + .05, d = za - zb; if (d < 0) continue;
    const f = Math.exp(-d / 2.2) * (1 - E.ss(TF + .2, TF + .6, T));
    for (const sg of [1, -1]) {
      arrowB(B, [.05, sg * P_.RY1, zb], [0, sg, 0], .1 + .22 * f, HOT, .4 + .6 * f, 2);
      apI(B, -.13, sg * (P_.RY1 + .03 * f), zb - .4, Q1); apI(B, -.13, sg * (P_.RY1 + .06 * f), zb, Q2); apI(B, -.13, sg * (P_.RY1 + .03 * f), zb + .4, Q3);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.5, 1, HOT, .8 * f); K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 1.5, 1, HOT, .8 * f);
    }
    apI(B, 0, 0, zb, Q1); K.ringW(Q1, U, W, .72, 72, 2, f > .6 ? HOT : LIME, .9 * f, 0); K.glowW(Q1[0], Q1[1], Q1[2], 30, LIME, .35 * f);
  }
}
function r3RoomFX(T, st, Ws) { rackBarFX(T, Ws); spinDialFX(T, st, Ws); poleFX(T, st, Ws); }
function r3MechFX(T, st) { frontRingFX(T, st); xcFX(T, st); hpuDialFX(T, st); radarTilesFX(T, st); layFX(T, st); loadFX(T, st); railsApartFX(T, st); }
/* the director's view, inset (top right) while it acquires and locks: the headland at 17.2 km in its IR camera
   (white hot: the land warm, the sea dark, the battery's engines bright), its reticle, the track box */
const INSET = { cv: null, W: 960, H: 540, fov: 3.2 * DEG };
function insetBuild() {
  const cv = document.createElement('canvas'); cv.width = INSET.W; cv.height = INSET.H;
  const g = cv.getContext('2d'), img = g.createImageData(INSET.W, INSET.H), d = img.data;
  const eye = [P_.EO_P[0], P_.EO_P[1] + P_.EO_H + P_.M0[1], P_.EO_P[2] + P_.M0[2]], f = V.norm(V.sub(S_HIT, eye)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f);
  const FL = INSET.W / 2 / Math.tan(INSET.fov / 2), put = (p, b, s) => {
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 10) return;
    const x = INSET.W / 2 + FL * (dx * r[0] + dy * r[1] + dz * r[2]) / zc, y = INSET.H / 2 - FL * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) { const X_ = (x | 0) + i, Y_ = (y | 0) + j; if (X_ < 0 || Y_ < 0 || X_ >= INSET.W || Y_ >= INSET.H) continue; const q = (Y_ * INSET.W + X_) * 4, v = Math.min(255, b * 255); if (d[q] < v) { d[q] = d[q + 1] = d[q + 2] = v; } d[q + 3] = 255; }
  };
  const SX_ = SITE.XF, r2 = rng(5151);
  for (let x = -700; x <= 700; x += 2.2) for (let z = -700; z <= 1400; z += 3) {
    const h = SITE.ground(x, z); const p = X.ap(SX_, [x + (r2() - .5) * 2, h < 0 ? 0 : h, z + (r2() - .5) * 3]);
    if (h < 0) { if (r2() < .08) put(p, .06 + .05 * r2(), 1); continue; }
    put(p, .26 + .18 * M3.fbm(x * .02, z * .02, 2.2, 3) + .08 * r2(), 1);
  }
  for (const v of SITE.V) for (let k = 0; k < 220; k++) { const a = r2() * TAU, rr = 4 * Math.sqrt(r2()); const x = v.x + Math.cos(a) * rr * 1.6, z = v.z + Math.sin(a) * rr; put(X.ap(SX_, [x, SITE.ground(x, z) + 1.2 + 2.2 * r2(), z]), .75 + .25 * r2(), 2); }
  g.putImageData(img, 0, 0); INSET.cv = cv; INSET.FL = FL; INSET.eye = eye;
}
function dirInset(T, st) {
  const a = E.ss(T_DLK - 2.4, T_DLK - 1.8, T) * (1 - E.ss(T_DLK + 3.0, T_DLK + 3.8, T)); if (a < .01) return;
  if (!INSET.cv) insetBuild();
  const S = RSC, w = 470 * S, h = 264 * S, x0 = K.BW - w - 70 * S, y0 = 150 * S;
  // acquiring: the wide field drifting onto the battery; locked: the narrow field, held
  const acq = E.ss(T_DLK - 1.8, T_DLK - .2, T), zoom = 1 + 1.6 * acq, sw = INSET.W / zoom, sh = INSET.H / zoom;
  const ox = (1 - acq) * 120 * Math.sin(T * .9), oy = (1 - acq) * 40 * Math.cos(T * .7), sx = INSET.W / 2 - sw / 2 + ox, sy = INSET.H / 2 - sh / 2 + oy;
  octx.save(); octx.globalAlpha = a;
  octx.fillStyle = 'rgba(11,12,10,.9)'; octx.fillRect(x0 - 6 * S, y0 - 22 * S, w + 12 * S, h + 46 * S);
  octx.drawImage(INSET.cv, sx, sy, sw, sh, x0, y0, w, h);
  octx.strokeStyle = 'rgba(198,244,50,.75)'; octx.lineWidth = S; octx.strokeRect(x0, y0, w, h);
  const cx = x0 + w / 2, cy = y0 + h / 2, L = 26 * S;
  octx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(cx + dx * 8 * S, cy + dy * 8 * S); octx.lineTo(cx + dx * (8 * S + L), cy + dy * (8 * S + L)); } octx.stroke();
  // the track box on the battery (where the reticle's centre is)
  const lk = E.ss(T_DLK - .25, T_DLK, T), bx = (INSET.W / 2 - sx) / sw * w + x0 - ox * 0, by = (INSET.H / 2 - sy) / sh * h + y0, bs = (40 + 30 * (1 - lk)) * S * (1 + .3 * lock(T, T_DLK));
  octx.strokeStyle = lk > .5 ? '#C6F432' : 'rgba(255,255,255,.7)'; octx.lineWidth = (lk > .5 ? 2 : 1) * S;
  for (const [sx_, sy_] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { octx.beginPath(); octx.moveTo(bx + sx_ * bs, by + sy_ * (bs - 10 * S)); octx.lineTo(bx + sx_ * bs, by + sy_ * bs); octx.lineTo(bx + sx_ * (bs - 10 * S), by + sy_ * bs); octx.stroke(); }
  octx.font = `500 ${11 * S}px "Geist Mono", ui-monospace, monospace`; octx.fillStyle = 'rgba(198,244,50,.95)'; octx.textBaseline = 'alphabetic';
  octx.fillText(`EO/IR · IR WHITE HOT · ${(INSET.fov / zoom / DEG).toFixed(1)}°`, x0, y0 - 8 * S);
  octx.fillStyle = lk > .5 ? 'rgba(198,244,50,.95)' : 'rgba(255,255,255,.8)';
  octx.fillText(lk > .5 ? `TRACK · ${km(RANGE)} KM · ${String(Math.round(AZ / DEG)).padStart(3, '0')}°` : 'ACQUIRING', x0, y0 + h + 16 * S);
  octx.restore();
}
/* the round through the bore (x0.01): it runs breech -> muzzle on the rails, the current behind it lighting the
   rails white-hot back to the breech, the armature's arc at its base, the field's rings round the barrel at it */
/* ---------- the shot: the round through the bore, the sabot, the muzzle, the trail, the burst (pc_scan_railgun_shot.js) ---------- */
SHOT = window.RGF_INIT({ ACC, ARC, BOLT, B_C, B_TOP, TS0, V_BU, LEAD_RATE, chAt, reachS, C, CL, DEG, DIR0, E, EM, EOFF, HANG, HDIR, HOT, K, LB_, LEAD, LIME, MO, MW, MZ0, MZH, MZR, NUP, P3, PATH_A, PI, P_, Q1, Q2, Q3, R, S1, SIDE, SITE, S_HIT, TAU, TB, TBU, TF, TG, TM, TOUR_T, TRET0, TRET1, T_BORE, T_LEAD, T_RAIL, T_REL, V, V0, V1, WH, X, XF, apI, bez, bezT, camBase, climbRate, climbS, dOfS, drawRound, filmAt, kk, lock, lookMix, lookTurn, probeAt, rng, roundZ, sOfD, shipW, simAt, simRate, stateAt, tr, uOfD, vOfS });
const { drawBore, drawSabot, drawFire, drawProbe, drawBurst } = SHOT;
function drawSea(T) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const S = SEA.F, TL = SEA.TL, ph = T * TAU / PER(6), sw = T * TAU / PER(12);
  for (let t = 0; t < SEA.nt; t++) {
    const q = t * 6; if (!K.wIn(TL[q + 2], 0, TL[q + 4], TL[q + 5] + 2)) continue;
    const zt = K.WZ[0], dsp = 400 / Math.sqrt(TL[q + 1] - TL[q]) * F / Math.max(1, zt);
    const s0 = 2.3 / Math.sqrt(K.DQ), sr = dsp >= s0 ? 1 : Math.min(40, s0 * s0 / (dsp * dsp));
    // (smooth: a continuous, stable per-point thinning to 1/sr instead of every step-th point)
    const step = SMOOTH ? 1 : sr === 1 ? 1 : Math.round(sr), kf = SMOOTH ? 1 / sr : 1, lift = SMOOTH ? 1 + .3 * E.sat(sr - 1) : step > 1 ? 1.3 : 1;
    const rf = 1 - E.ss(16000, 29000, Math.hypot(TL[q + 2], TL[q + 4]));
    for (let k = TL[q] + (SMOOTH ? 0 : (t * 5) % step), k1 = TL[q + 1]; k < k1; k += step) {
      if (kf < 1 && (k * .6180339887) % 1 > kf) continue;
      const j = k * 4, x = S[j], z = S[j + 1], y = .2 * Math.sin(S[j + 3] + ph) + .45 * Math.sin(sw + z * .011 + x * .004);
      const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 2) continue;
      const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= K.BW) continue;
      const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= K.BH) continue;
      const ov = P_.occv(sx, sy, zc); if (ov <= 0) continue;
      const b = 1.7 * S[j + 2] * (zc < 3000 ? 1 - zc / 7000 : .57 + .5 * E.ss(3000, 12000, zc)) * rf * lift * ov;
      K.dot(sx, sy, zc < 50 ? 2 : 1, 236, 238, 232, b);
    }
  }
}

/* ---------- tags and readout ---------- */
const ZST = k => P_.STN[k];
const nLocked = T => { let n = 0; for (let k = 0; k < P_.BANDS.length; k++) if (T > clampT(k) + .12) n++; return n; };
const UT = [
  // the power room: the valves, a coolant pump, alternator 3 opened, the spin-up, the racks (round 3: 2.4+ s each,
  // staggered so two or three are up at once)
  ['VLV', 'Valve header · 4 gate valves', st => st.valve > 9 ? 'open' : '', 'W', [.3, 2.72, 43.6], T_VLV + .1, T_PMP + 1.4],
  ['PMP', 'Coolant pump · brushless DC motor', st => `${Math.round(PUMP_RPM * st.pumpR / 10) * 10} rpm`, 'P0', [0, .45, .4], T_PMP + 1.6, T_PMP + 4.4],
  ['STA', 'Stator · 12 wound teeth', st => '', 'P0', [-.2, -.08, .36], T_PMP + 2.6, T_PMP + 5.2],
  ['PMR', 'Permanent-magnet rotor · 8 poles', st => '', 'P0', [.1, -.1, .5], T_PMP + 3.6, T_PMP + 6.2],
  ['IMP', 'Impeller · 6 vanes', st => `${Math.round(1500 * st.pumpR)} L/min`, 'P0', [.2, -.1, 1.22], T_PMP + 4.6, T_PMP + 7.8],
  ['VOL', 'Volute · to the valve header', st => '', 'P0', [0, .3, 1.24], T_PMP + 5.6, T_PMP + 8.4],
  ['ROD', 'Guide rods ×2', st => '', 'XA', [.62, -.55, 1.7], T_AX + .5, T_AX + 2.8],
  ['EXC', 'Exciter · end bell', st => '', 'XEXC', [0, .5, 1.3], T_AX + 1.4, T_AX + 3.8],
  ['ROT', 'Rotor · 4 salient poles', st => 'N · S · N · S', 'XROT', [0, .8, .3], T_AX + 3.4, T_AX + 7.0],
  ['FCL', 'Field coils · round each pole', st => '', 'XROT', [0, -.7, -.2], T_AX + 4.4, T_AX + 7.0],
  ['STR', 'Stator · 24 coil sides', st => '', 'XA', [0, .99, -.3], T_AX + 5.2, T_AX + 7.6],
  ['ALT', 'Pulsed alternators ×4', st => `${Math.round(RPM * st.rate / 10) * 10} rpm`, 'W', [3.2, 3.9, 45.0], T_SPIN + .6, T_SPIN1 + 1.4],
  ['TAC', 'Rotor speed', st => `${Math.round(RPM * st.rate / 10) * 10} / ${RPM} rpm`, 'W', [.16, 4.66, 46.6], T_SPIN + 1.6, T_SPIN1 + 1.4],
  ['CAP', 'Capacitor racks ×4 · 80 modules', st => `${2 * nCharged(ST_T)} MJ`, 'W', [1.96, 5.2, 49.2], T_BANK + 1.6, T_BANK + 4.4],
  ['MOD', 'Film capacitor module · 2 MJ', st => '', 'W', [P_.MOD[7].p[0] - .41, P_.MOD[7].p[1] + .2, P_.MOD[7].p[2]], T_BANK + 2.6, T_BANK + 5.2],
  ['MJB', 'Pulse-power bank', st => `${2 * nCharged(ST_T)} / 160 MJ`, 'W', [1.72, 4.7, 50.6], T_BANK + 3.4, T_RIS + 1.6],
  ['PCU', 'Power conditioning ×5', st => '', 'W', [-1.84, 3.85, 55.35], T_BANK + 5.4, T_BANK1 + .4],
  // the coolant climbs into the gun
  ['RSR', 'Riser · coolant to the mount', st => '', 'W', [.2, 3.4, 48.6], T_RIS + .2, T_RIS + 2.4],
  ['RUN', 'Rotary union · starboard trunnion', st => '', 'T', [1.38, P_.TRN[1], P_.TRN[2]], T_RIS + 5.2, T_RIS + 8.6],
  ['MAN', "Rails' coolant manifold", st => `${Math.round(100 * manFill(ST_T))} %`, 'B', [.12, -.52, 4.0], T_RIS + 6.6, T_CUP1 + .2],
  // the cryo: a cold head, the header, the coil row
  ['CRC', 'Cryocoolers ×24 · pulse tube', st => '', 'B', [.5, .78, ZST(4) - .14], T_CRYO + 1.0, T_CRYO + 3.8],
  ['STG', 'Cold head · 2nd stage', st => `${Math.round(st.chK)} K`, 'B', [.5, .5, ZST(4) - .14], T_CRYO + 2.8, T_CRYO + 5.2],
  ['FRS', 'Frost · moisture from the air', st => '', 'B', [.47, .58, ZST(4) - .1], T_CRYO + 5.0, T_CRYO + 7.6],
  ['HEL', 'Helium header · cold front', st => `${Math.max(0, st.hdr - HZ0).toFixed(1)} m`, 'B', st => [.17, .53, E.clamp(st.hdr, HZ0, HZ1)], T_FH + .2, T_FR - .2],
  ['ROW', 'Coil row · 12 stations', st => `${nCold(ST_T)}/12 at 20 K`, 'B', [.62, .42, ZST(3)], T_FR + .6, T_CR1 + .3],
  ['CRY', 'Cryostats · vacuum', st => '', 'B', [.62, -.3, ZST(8)], T_FR + 2.4, T_CR1 + .3],
  // the cutaway, current into the coils
  ['RLS', 'Rails ×2 · copper', st => '', 'B', [.05, .24, ZST(5)], T_CUT + 2.4, T_CUT + 4.8],
  ['INS', 'Insulating sidewalls', st => '', 'B', [.2, -.04, ZST(6)], T_CUT + 3.2, T_CUT + 5.6],
  ['BOR', 'Bore · 280 mm square', st => '', 'B', [0, 0, ZST(7)], T_CUT + 4.0, T_CUT + 6.4],
  ['CNT', 'Containment · composite', st => '', 'B', [.36, .22, ZST(8)], T_CUT + 4.8, T_CUT + 7.2],
  ['LDS', 'Current leads', st => '', 'B', [.45, P_.KY + .2, ZST(4) + .22], T_EN + 2.4, T_EN + 5.0],
  ['COIL', 'Superconducting coils ×24 · REBCO', st => `${(5 * st.field).toFixed(1)} T`, 'B', [.62, .25, ZST(6)], T_EN + 4.0, T_SL - .2],
  ['FLD', 'Field across the bore', st => `${(5 * st.field).toFixed(2)} T`, 'B', [0, .02, ZST(7)], T_EN + 5.6, T_SL + .4],
  ['SEC', 'Section', st => '', 'B', st => [0, .62, E.mix(P_.RZ0, P_.SLV1, E.ss(SL0, SL1, ST_T))], SL0 + .3, SL1 - .2],
  // one coil station drawn apart
  ['XCP', 'Coil pack · REBCO racetrack', st => '×2 · 20 K', 'B', st => [P_.CXC + .62 * st.xc + .04, .36, ZST(P_.XST)], T_XC + 1.6, T_XC + 6.4],
  ['XCH', 'Cold head · lifted out', st => '', 'B', st => [-.5 - .3 * st.xc, P_.KY + .45 + .62 * st.xc, ZST(P_.XST) - .14], T_XC + 2.4, T_XC + 6.4],
  ['XCR', 'Cryostat · vacuum vessel', st => '', 'B', [.62, -.38, ZST(P_.XST) + .2], T_XC + 3.2, T_XC + 6.4],
  ['XCB', 'Bore · rails · sidewalls', st => '', 'B', [0, -.2, ZST(P_.XST) - .3], T_XC + 4.0, T_XC + 6.4],
  // the hydraulics
  ['HPU', 'Hydraulic power unit', st => `${(P_HYD * st.hp).toFixed(1)} MPa`, 'T', [1.9, 1.62, -3.9], T_HPU + .7, T_HPU + 3.2],
  ['PIS', 'Axial piston pump · 9 pistons', st => '', 'T', [P_.HPU.pump[0], P_.HPU.pump[1] + .14, P_.HPU.pump[2] + .2], T_HPU + 1.6, T_HPU + 4.4],
  ['SWP', 'Swash plate · sets the stroke', st => `${(17 * st.stroke).toFixed(0)}°`, 'T', [P_.HPU.pump[0], P_.HPU.pump[1] - .12, P_.HPU.SW], T_HPU + 2.6, T_HPU + 8.6],
  ['GAU', 'System pressure', st => `${(P_HYD * st.hp).toFixed(1)} / 21 MPa`, 'T', [HPU_DIAL[0], HPU_DIAL[1] + .24, HPU_DIAL[2]], T_HPU + 3.4, T_HPU + 9.4],
  ['ACC', 'Piston accumulators ×3', st => `${Math.round(100 * st.acc)} %`, 'T', [2.32, 1.55, -2.35], T_HPU + 4.6, T_HPU + 8.8],
  ['VLV2', 'Valve stack · 4 spools', st => st.spool > .5 ? 'shifted' : '', 'T', [1.6, 1.0, -2.2], T_HPU + 6.0, T_HPU + 8.8],
  // the sensors
  ['EOIR', 'EO/IR director · ball turret', st => 'TV · IR · laser', 'eoP', [0, .2, .14], T_DLK - 2.6, T_DLK + 2.8],
  ['FCR', 'Fire-control radar · X band', st => st.fcScan > .5 ? 'search' : st.fcLk > .5 ? 'track' : '', 'fcY', [0, .62, .1], T_RLK - 2.2, T_RLK + 2.6],
  ['TRM', 'Array · 108 T/R tiles', st => st.fcLk > .5 ? 'all on the target' : 'beam stepping', 'fcY', [-.3, .58, .12], T_RLK - 1.4, T_RLK + 2.6],
  // the lay
  ['OIL', 'Oil to the rams · 21 MPa', st => '', 'T', [1.3, .36, 1.0], T_LAY + 1.0, T_LAY + 3.6],
  ['ELR', 'Elevation rams ×2', st => `${Math.round(st.el / DEG)}°`, 'C', [.9, -.4, 1.2], T_LAY + 1.6, T_LAY + 5.4],
  ['TRD', 'Train drives ×2 · hydraulic motor', st => `${Math.round(st.yaw / DEG)}°`, 'T', [2.0, .7, 1.15], T_LAY + 2.4, T_LAY + 6.0],
  ['RNG', 'Ring gear · 112 teeth', st => '', 'M', [1.7, .2, 1.76], T_LAY + 3.4, T_LAY + 6.6],
  ['MZC', 'Muzzle cover', st => '', 'B', [.5, .5, P_.SLV1], T_LAY + 9.2, T_LAY + 11.0],
  ['MVR', 'Muzzle velocity radar · Doppler', st => '', 'C', [0, 1.14, 2.86], T_LAY + 9.6, T_DWN],
  // the loader
  ['MAG', 'Magazine drum · 12 cells', st => '', 'W', [1.3, 3.0, 48.3], T_DRUM - .1, T_LD],
  ['HST', 'Hoist', st => `${(st.hoistY - HOIST_B).toFixed(1)} m`, 'T', [.24, -2.4, P_.HZ], LD(.4), LD(2.8)],
  ['PRB', 'Probe · long rod', st => '2.0 m', 'RND', [.05, 0, .8], T_XP + .6, T_XP + XH - .5],
  ['SAB', 'Sabot ×3', st => '', 'RND', [.3, 0, 0], T_XP + 1.3, T_XP + XH - .5],
  ['ARM', 'Armature', st => '', 'RND', [.1, -.14, -.72], T_XP + 2.0, T_XP + XH - .5],
  ['TRY', 'Loading tray', st => '', 'tray', [.19, .1, .6], LD(5.6), LD(8.0)],
  ['RMR', 'Chain rammer · 2.4 m', st => `${(P_.RAM_L * st.ram).toFixed(1)} m`, 'C', [.17, .16, -4.9], LD(6.0), LD(9.6)],
  ['CHN', 'Drive sprocket', st => '', 'C', [0, -.13, -4.74], LD(7.0), LD(9.6)],
  ['BRC', 'Breech block · sliding', st => st.brc > .5 ? 'open' : 'shut', 'B', [.46, .5, -2.7], LD(9.4), LD(LK.sh1) + 1.6],
  ['CLP', 'Preload clamps ×13 · wedges', st => `${nLocked(ST_T)}/13`, 'B', [.56, .46, P_.BANDS[3] + .05], LD(LK.clp), T_RAIL + .2],
  // the charge: the breech cut away
  ['ARM2', 'Armature · seated', st => '', 'B', [.1, .14, P_.SEAT_Z - .66], T_RAIL + 3.2, T_RAIL + 5.8],
  ['BUS', 'Rail feed · bus straps', st => '4.2 MA at the shot', 'B', [.3, .3, -.6], T_RAIL + 4.4, T_RAIL + 7.0],
  ['BND', 'Preload bands · hold the rails', st => '', 'B', [.56, .46, P_.BANDS[1] + .05], T_REL - 3.4, T_REL - .6],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
let ST_T = 0;
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
const C_SND = h => Math.sqrt(1.4 * 287.05 * Math.max(216.65, 288.15 - .0065 * Math.max(0, h)));   // the speed of sound at h (ISA)
function readout(T, st) {
  const ci = FCH.reduce((a, c, i) => c.t <= TRNOW ? i : a, 0);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${FCH[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2, rate = 1;
  const iq = SEG.k >= 0 ? INS[SEG.k] : null;
  if (iq) { const r = iq.mod.readout ? iq.mod.readout(SEG.u, CTX) : {}; l1 = r.l1 || ''; l2 = r.l2 || ''; rate = r.rate || 1; }
  else if (T < B_PR || T > SX(56.8)) { l1 = 'DDG-51 · <b>on station</b>'; l2 = 'Railgun <b>stowed</b> · coils <b>warm</b>'; }
  else if (T < T_PMP) { l1 = 'Power room · <b>coolant loop</b>'; l2 = T < T_VLV ? 'Pulse power <b>cold</b> · 4 alternators' : `Valves <b>${st.valve > 9 ? 'open' : 'opening'}</b> ×4`; }
  else if (T < T_AX - .3) { l1 = 'Coolant pumps · <b>brushless DC</b>'; l2 = `<b>${Math.round(PUMP_RPM * st.pumpR / 10) * 10} rpm</b> · <b>${Math.round(1500 * st.pumpR)} L/min</b> each`; }
  else if (T < T_SPIN) { l1 = 'Pulsed alternator 3 · <b>opened</b>'; l2 = T < T_AX + .8 ? 'Guide rods <b>out</b>' : T < T_AX + 2.0 ? 'End bell <b>drawn</b>' : T < T_AX + 3.8 ? 'Rotor <b>drawing out</b>' : T < T_AX + 7.0 ? 'Rotor <b>barred round</b> · 4 poles' : T < T_AX + 8.6 ? 'Rotor <b>in</b>' : T < T_AX + 9.8 ? 'End bell <b>closing</b>' : 'Alternator 3 <b>closed</b>'; }
  else if (T < T_BANK - .2) { rate = PREW.rate(T); l1 = 'Pulsed alternators ×4 · <b>spin-up</b>'; l2 = `Rotors <b>${Math.round(RPM * st.rate / 10) * 10} rpm</b>`; }
  else if (T < T_CUP) { const n = nCharged(T); l1 = 'Capacitor racks · <b>charging</b>'; l2 = `Bank <b>${2 * n} / 160 MJ</b> · ${n}/${NMOD} modules`; }
  else if (T < T_CRYO) {
    l1 = 'Coolant · <b>to the gun</b>';
    const d = riseD(T);
    l2 = d < 0 ? 'Riser valve <b>opening</b>' : d < RISE.L[0] ? `Power column · <b>${d.toFixed(1)} m</b>` : d < RISE.L[1] ? 'Up to the trunnion' : d < RISE.L[3] ? 'Through the <b>rotary union</b>' : `Rails' manifold <b>${Math.round(100 * manFill(T))} %</b>`;
  }
  else if (T < T_CR1) {
    rate = PREW.rate(T); l1 = 'Cryocoolers ×24 · <b>coils to 20 K</b>';
    l2 = T < T_CRYO + 7.4 ? `Cold head <b>${Math.round(st.chK)} K</b> · 2nd stage` : T < T_FH ? `Cold heads <b>${Math.round(st.chK)} K</b> · ×24` : T < T_FR ? `Helium header · cold front <b>${Math.max(0, st.hdr - HZ0).toFixed(1)} m</b>` : `Coils <b>${nCold(T)}/${NST}</b> at 20 K`;
  }
  else if (T < T_HPU - 1.0) {
    rate = PREW.rate(T); let n = 0; for (let k = 0; k < NST; k++) if (st.coil[k] > .98) n++;
    l1 = T < T_SL ? 'Superconducting coils · <b>energising</b>' : T < T_XC ? 'Barrel · <b>section</b>' : T < T_XC + 7.8 ? `Coil station ${P_.XST + 1} · <b>drawn apart</b>` : 'Barrel · <b>closed</b>';
    l2 = T < T_EN ? 'Cut away · <b>rails · sidewalls · coils</b>' : T < T_SL ? `Field <b>${(5 * st.field).toFixed(2)} T</b> · coils <b>${n}/${NST}</b>` : T < T_XC ? `Field <b>5.0 T</b> · coils <b>20 K</b>` : T < T_XC + 7.8 ? 'Coil packs ×2 · cold heads ×2 · cryostat' : `Field <b>5.0 T</b> · coils <b>20 K</b>`;
  }
  else if (T < T_DLK - 2.4) { l1 = `Hydraulic power unit · <b>${st.hp > .995 ? 'charged' : st.hpuR > .02 ? 'charging' : 'starting'}</b>`; l2 = `Pressure <b>${(P_HYD * st.hp).toFixed(1)} MPa</b> · swash <b>${(17 * st.stroke).toFixed(0)}°</b>`; }
  else if (T < T_LAY) {
    l1 = T < T_DLK ? 'Director · <b>acquiring</b>' : T < T_RLK - 2.6 ? 'Director <b>locked</b>' : T < T_RLK ? 'Director <b>locked</b> · radar <b>search</b>' : 'Target <b>locked</b> · radar <b>track</b>';
    l2 = `Range <b>${km(RANGE)} km</b> · bearing <b>${String(Math.round(AZ / DEG)).padStart(3, '0')}°</b> rel`;
  }
  else if (T < T_DWN) { l1 = T > T_EL1 ? 'Mount · <b>laid</b>' : 'Hydraulics · <b>laying</b>'; l2 = `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b> · <b>${(P_HYD * st.hp).toFixed(1)} MPa</b>`; }
  else if (T < T_RAIL) {
    l1 = T < T_LD ? 'Magazine · <b>12 cells</b>' : 'Loader · <b>2 m round</b>';
    l2 = T < T_DRUM ? 'X-ray · <b>down to the drum</b>' : T < T_LD ? 'Drum <b>indexing</b> · cell 01' : T < LD(.4) ? 'Cell 01 <b>latched</b>' : T < LD(2.8) ? `Hoist <b>${(st.hoistY - HOIST_B).toFixed(1)} m</b>` : T < T_XP + XH ? 'Round <b>check</b> · rod · sabot · armature'
      : T < LD(LK.tin0) ? 'Grips <b>closed</b> · breech <b>open</b>' : T < LD(LK.ram0) ? 'Tray <b>in line</b>' : T < LD(LK.ram1) ? `Ramming <b>${(P_.RAM_L * st.ram).toFixed(1)} m</b>` : T < LD(LK.bk1) ? 'Round <b>seated</b> · rammer <b>back</b>' : T < LD(LK.sh1) + .3 ? 'Breech <b>sliding shut</b>' : T < LD(LK.clp) ? 'Breech <b>sealed</b>' : `Clamps <b>${nLocked(T)}/13</b> locked`;
  }
  else if (T < T_REL) { l1 = 'Rails · <b>charging</b>'; l2 = `Bank <b>160 MJ</b> · field <b>${(5 * st.field).toFixed(1)} T</b> · current <b>${Math.round(100 * st.chg)} %</b>`; rate = simRate(T); }
  else if (T < TF) { const tau = simAt(T) + T_BORE; rate = simRate(T); l1 = `Round · <b>in the bore</b>`; l2 = `<b>${Math.round(ACC * tau)} m/s</b> · <b>${(roundZ(T) - P_.SEAT_Z).toFixed(1)}</b> / ${LB_.toFixed(1)} m`; }
  else if (T < TBU) { const s = climbS(T), v = vOfS(s); rate = climbRate(T); probeAt(s, Q4); l1 = `Probe · <b>alt ${km(Q4[1])} km</b> · range <b>${km(Math.hypot(Q4[0], Q4[2]))} km</b>`; l2 = `<b>${Math.round(v)} m/s</b> · Mach <b>${(v / C_SND(Q4[1])).toFixed(1)}</b>`; }
  else if (T < T_LEAD) { l1 = `Probe · <b>burst</b> · alt <b>${km(B_TOP[1])} km</b>`; l2 = `Charge <b>${Math.round(100 * E.ss(TBU, T_LEAD, T))} %</b> · battery <b>${km(V.dist(B_TOP, S_HIT))} km</b> off`; }
  else if (T < TB) { rate = LEAD_RATE; l1 = `Leader · <b>stepping down</b> · <b>${km((1 - reachS(T)) * V.dist(B_TOP, S_HIT))} km</b> to go`; l2 = `About <b>200 km/s</b> · <b>${Math.round(100 * reachS(T))} %</b> of the way`; }
  else if (T < TRET0) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 48.4 + SH - .6) { l1 = `Scan · <b>${SITE.V.length}/${SITE.V.length} identified</b> · range <b>${km(RANGE)} km</b>`; l2 = `Ship <b>${km(V.dist(C.eye, MW))} km</b> · trail <b>fading</b>`; }
  else { l1 = 'Railgun · <b>stowing</b>'; l2 = T < SX(49.3) ? 'Coils <b>de-energising</b>' : T < SX(51.2) ? 'Director · radar <b>stowed</b>' : T < SX(54.3) ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : 'Cover <b>closing</b>'; }
  // (after the shot: the sim clock, plus what the inserts after it covered once they have played; T+ to the seam)
  const sim = T < TF - 1.6 ? TRNOW - TF_R - (PREW(TF) - PREW(T) - (TF - T)) : simAt(T) + INS.reduce((a, q) => a + (q.at > TF ? (q.mod.span !== undefined ? q.mod.span : q.len) * E.clamp((TRNOW - q.r0) / q.len, 0, 1) : 0), 0);   // (round 3: an insert's time runs on the clock while it plays, never a freeze then a jump)
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate < 9.5 ? rate.toFixed(1) : Math.round(rate)}</span>` : rate < .92 ? `<span class="l">×${rate < .0095 ? rate.toFixed(3) : rate < .1 ? rate.toFixed(2) : rate.toFixed(1)}</span>` : '×1';
  const simL = T > T_LEAD && T < DUR0 ? sim - (Math.min(T, TB) - T_LEAD) * (1 - LEAD_RATE) : sim;   // (the leader runs at x0.015)
  const html = `${l1}<br>${l2}<br>${K.fmtClock(simL)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = K.muHTML(html); }   // (µ kept lower case in the uppercased readout)
}
function unitTags(T, st) {
  ST_T = T;
  for (const t of UT) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const fr = t.fr === 'W' ? XF.W : XF[t.fr]; if (!fr) continue;
    const p = X.ap(fr, typeof t.at === 'function' ? t.at(st) : t.at); if (!K.pj(p[0], p[1], p[2])) continue;
    const x = K.PJ[0], y = K.PJ[1];
    K.leader(x, y, x + 46 * RSC, y - 46 * RSC, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .6), T, t.id.length), t.val(st), 'lime sm', x + 50 * RSC, y - 60 * RSC, a);
  }
}
/* own ship marked when too small to read */
const SHIP_MN = [-10, -6, -78], SHIP_MX = [10, 40, 72], T_SHIP = K.mkTag();
function shipMark(T, Ws) {
  const b = K.boxOf(SHIP_MN, SHIP_MX, Ws, 3 * RSC); if (!b) return;
  const px = Math.max(b[2] - b[0], b[3] - b[1]) / RSC; if (px > 160 || b[2] < 0 || b[0] > K.BW || b[3] < 0 || b[1] > K.BH) return;
  const a = 1 - E.ss(90, 160, px);
  K.bracket(b, '#C6F432', .85 * a, 6, 1.2);
  K.setTag(T_SHIP, 'DDG', 'ARLEIGH BURKE', '', 'lime sm', b[2] + 8 * RSC, b[1] - 4 * RSC, a);
}

/* ---------- render ---------- */
const L_SHIP = [.55, .62, .5], L_SITE = [-.55, .6, -.6];
/* INTERCEPT: the host render. The harness maps film time onto the base timeline (SEGS: the director and the radar
   on the target, the lay, the charge and the shot), then the act (window.IACT) plays as an insert from T_ACT; while it
   plays the base is drawn at mod.baseT(u) under the act's lens and weighted by mod.baseVis(u) (the act composites). */
const ACT = window.IACT;
const SEGS = [[T_DLK - 6.0, 18.0], [T_LAY - .5, 10.0], [T_RAIL + 3.0, null]];
const T_ACT_B = TF + (ACT ? ACT.at : 3.2);                                 // the splice (base time)
{ let t = 0; for (const g of SEGS) { if (g[1] === null) g[1] = T_ACT_B - g[0]; g.push(t); t += g[1]; } }
const T_ACT = SEGS[2][2] + SEGS[2][1];                                    // the splice (film time)
const DUR_ACT = T_ACT + (ACT ? ACT.len : 0);
const SGI = { k: -1, u: 0, T: 0 };
function mapAct(TR) {
  if (ACT && TR >= T_ACT) { SGI.k = 0; SGI.u = TR - T_ACT; SGI.T = T_ACT_B; return SGI; }
  let g = SEGS[0]; for (const q of SEGS) if (TR >= q[2]) g = q;
  SGI.k = -1; SGI.u = 0; SGI.T = g[0] + (TR - g[2]); return SGI;
}
/* film time of a base time inside the stretches (for the act's clocks) */
const filmOfBase = T => { for (const g of SEGS) if (T >= g[0] - 1e-6 && T <= g[0] + g[1] + 1e-6) return g[2] + T - g[0]; return null; };
let NP = 0;
function render(TR, info) {
  const tr0 = performance.now(); density();
  K.beginTags(); if (ACT && ACT.begin) ACT.begin();
  TRNOW = TR;
  const sg = mapAct(TR), iq = sg.k >= 0;
  const T = iq && ACT.baseT ? ACT.baseT(sg.u, CTX) : sg.T;
  CTX.T = TR; CTX.u = sg.u; CTX.Tb = T; CTX.ins = iq;
  if (ACT && ACT.frame) ACT.frame(TR, T, iq ? sg.u : -1, CTX);           // (sets ISCN.tgtAE / tgtW before the state)
  const st = stateAt(T), Ws = shipW(TR);
  mountXf(Ws, st); focusAt(T);
  CTX.Ws = Ws; CTX.st = st;
  const xr = xrayAt(T);
  const shot = iq ? ACT.cam(sg.u, CTX) : (ACT && ACT.seaCam ? ACT.seaCam(TR, T, CTX) : null) || camAt(T);
  FILM.apply(C, shot);
  const af = T > TF - 1.6 ? simAt(T) : -1;
  C.shake = af > 0 && af < 1 ? FILM.shake(TF + af * 3, 7 * (1 - af) * E.ss(-.001, .004, af), 24) : [0, 0];
  if (iq && ACT.shake) C.shake = ACT.shake(sg.u, CTX, C.shake);
  if (RSC !== 1) C.shake = [C.shake[0] * RSC, C.shake[1] * RSC];
  C.near = .1; C.update();
  RO.foc = MO.foc = 1.15 * V.dist(C.eye, C.target);
  const bv = iq && ACT.baseVis ? ACT.baseVis(sg.u, CTX) : 1;
  CTX.baseVis = bv;
  K.pb.clear();
  if (bv > .002) {
    const dMW = V.dist(C.eye, MW), NR = HQ ? 3000 : 400, near = dMW < NR, nearA = SMOOTH ? 1 - E.ss(NR * .8, NR, dMW) : 1;
    if (near) occluders(T, st, Ws); else P_.occReset();
    K.drawStars(ACT && ACT.STARS ? ACT.STARS : STARS, .9, TR, -.02);
    drawSea(TR);
    K.setLight(V.add(V.add(V.mul(C.r, .45), V.mul(C.u, .7)), V.mul(C.f, -.55)));
    drawShip(Ws);
    if (near) { XS.gain = nearA; drawMount(T, st); XS.gain = 1; }
    if (xr && near) { XS.gain = nearA; drawRoom(T, st, Ws); drawLoader(T, st, Ws); drawRoomFX(T, st, Ws); loaderFX(T, st, Ws); XS.gain = 1; }
    if (near) { XS.gain = nearA; mechFX(T, st); XS.gain = 1; }
    drawCharge(T, st);
    if (near) { XS.gain = nearA; drawSlice(T, st); drawBore(T, st); drawSabot(T); XS.gain = 1; }
    drawFire(T);
    if (!iq || (typeof ACT.probe === 'function' ? ACT.probe(sg.u) : ACT.probe !== false)) drawProbe(T);
  } else P_.occReset();
  octx.clearRect(0, 0, K.BW, K.BH);
  if (bv > .3) { if (!iq) unitTags(T, st); shipMark(T, Ws); }
  if (ACT) { if (iq) ACT.draw(sg.u, CTX); else if (ACT.seaDraw) ACT.seaDraw(TR, T, CTX); }
  if (ACT) { if (iq) { if (ACT.tags) ACT.tags(sg.u, CTX); } else if (ACT.seaTags) ACT.seaTags(TR, T, CTX); }
  actReadout(TR, T, st, iq ? sg.u : -1);
  K.pb.blit();
  K.endTags(); if (ACT && ACT.end) ACT.end();
  K.govern(performance.now() - tr0, info);
  NP = K.npts() + P_.np();
}
function actReadout(TR, T, st, u) {
  const ci = FCH.reduce((a, c, i) => c.t <= TR ? i : a, 0);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${FCH[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  const r = !ACT ? null : u >= 0 ? ACT.readout(u, CTX) : ACT.seaReadout ? ACT.seaReadout(TR, T, CTX) : null;
  if (!r) return;
  const rate = r.rate === undefined ? 1 : r.rate;
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate < 9.5 ? rate.toFixed(1) : Math.round(rate)}</span>` : rate < .92 ? `<span class="l">×${rate < .0095 ? rate.toFixed(3) : rate < .1 ? rate.toFixed(2) : rate.toFixed(1)}</span>` : '×1';
  const html = `${r.l1}<br>${r.l2}<br>${K.fmtClock(r.clock || 0)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = K.muHTML(html); }
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
const tick = () => SFX.tone(1650, 1650, .04, 'square', .008);
const clack = () => { SFX.tone(900, 300, .06, 'square', .012); SFX.noise(.08, 3000, .8, .02, .002); };
const whirr = (f0, f1, d) => () => { SFX.tone(f0, f1, d, 'sawtooth', .011); SFX.noise(d, 900, .7, .012, .3); };
const S2 = t => t + SH;
const cues = [
  // the power room: the valves, the pumps start, alternator 3 opens and closes, the spin-up, the racks charge
  [T_VLV, whirr(300, 260, 1.3)], [T_VLV + 1.3, clack],
  [T_PMP, () => { SFX.tone(120, 980, 1.6, 'sine', .009); SFX.tone(240, 1960, 1.6, 'triangle', .004); }], [T_PMP + .2, () => SFX.noise(2.4, 1200, .5, .01, .8)],
  [T_AX - .1, clack], [T_AX, whirr(160, 220, .8)], [T_AX + .6, whirr(120, 140, 1.4)], [T_AX + 1.8, whirr(100, 120, 2.0)], [T_AX + 3.9, whirr(60, 70, 3.0)], [T_AX + 7.0, whirr(120, 100, 1.6)], [T_AX + 8.4, whirr(140, 120, 1.4)], [T_AX + 9.8, clunk], [T_AX + 10.3, clack],
  [T_SPIN, () => { SFX.tone(55, 420, 3.4, 'sawtooth', .016); SFX.tone(110, 840, 3.4, 'triangle', .012); }],
  [T_SPIN1, () => { SFX.tone(420, 436, 5.0, 'sawtooth', .007); SFX.tone(840, 872, 5.0, 'triangle', .006); }],
  ...[0, 1, 2, 3].map(r => [brkT(r) + .1, clack]),
  ...Array.from({ length: 10 }, (_, k) => [modT(k * 8) + .1, tick]),
  // the riser opens, the coolant climbs into the gun
  [T_RIS - .2, whirr(260, 200, 1.0)], [T_RIS, () => SFX.noise(7.5, 700, .6, .012, 1.2)], [T_RIS + 4.4, clack],
  // the cryo (x240): the compressors' hum, the cold heads' pulse, a tick as each station reaches 20 K
  [T_CRYO - .3, () => { SFX.tone(52, 52, T_CR1 - T_CRYO, 'sawtooth', .008); SFX.tone(104, 98, T_CR1 - T_CRYO, 'triangle', .005); }], [T_CRYO + .2, () => SFX.noise(4.0, 4200, .5, .008, 1.5)],
  [T_HF0 + 2.6, () => SFX.noise(4.2, 2600, .4, .007, 1.2)],
  ...Array.from({ length: 12 }, (_, k) => [rowT(k) + .6, () => SFX.tone(1200 + 40 * k, 1200 + 40 * k, .04, 'square', .005)]),
  // the cutaway; current into the coils (x60), a tick as each station reaches field; the slice
  [T_CUT, whirr(500, 300, 1.6)], [T_CUT1 - 1.4, whirr(300, 500, 1.4)],
  [T_EN - .2, () => SFX.tone(110, 330, 10.4, 'sine', .01)],
  ...Array.from({ length: 12 }, (_, k) => [enT(k) + .45, () => SFX.tone(560 + 70 * k, 560 + 70 * k, .05, 'square', .007)]),
  [T_SL, () => SFX.tone(900, 2600, 3.2, 'sine', .008)], [T_XC, whirr(400, 600, 1.2)], [T_XC + 6.4, whirr(600, 400, 1.2)],
  // the hydraulic power unit: the motor, the pump's pistons, the accumulators charging, the pump unloading
  [T_HPU + .3, () => { SFX.tone(40, 120, 1.2, 'sawtooth', .014); SFX.noise(1.6, 600, .7, .02, .4); }], [T_HPU + 1.1, () => SFX.tone(180, 420, 5.4, 'triangle', .007)],
  [T_HPU + 6.5, clack], [T_HPU + 6.6, () => SFX.tone(420, 260, .5, 'sine', .006)],
  // the sensors: the director's laser, its lock; the radar's search, its lock
  [T_DLK - 1.8, whirr(260, 330, 1.6)], [T_DLK, () => { SFX.tone(1400, 1400, .07, 'square', .008); SFX.tone(1870, 1870, .07, 'square', .008); }],
  [T_RLK - 2.6, () => SFX.noise(2.4, 3000, .4, .008, .6)], [T_RLK, () => { SFX.tone(1200, 1200, .06, 'square', .008); SFX.tone(1600, 1600, .09, 'square', .008); }],
  // the lay: the spools shift, train and elevation, the cover, laid
  [T_LAY, clack], [T_TR, whirr(90, 150, 7.6)], [T_EL, whirr(110, 85, 7.6)], [T_EL, () => SFX.noise(7.2, 900, .6, .014, 1.5)],
  [T_TR + 4.4, () => SFX.tone(300, 180, .3, 'square', .01)], [T_TR + 5.1, clunk], [T_EL1, clunk], [T_EL1 + .1, tick],
  // down to the magazine, the loader
  [X_O0, () => SFX.tone(900, 2600, .9, 'sine', .012)],
  [T_DRUM, whirr(200, 160, .6)], [T_DRUM + .6, clunk], [LD(.3), clack], [LD(.4), whirr(180, 420, 2.4)], [LD(2.8), clunk],
  [LD(3.4), clack], [LD(3.4), () => SFX.tone(260, 160, .35, 'square', .008)], [LD(LK.brc0), whirr(150, 120, .6)], [LD(LK.brc1), clunk], [LD(LK.tin0), whirr(150, 230, 1.1)], [LD(LK.tin1), clunk],
  [LD(LK.ram0), whirr(300, 800, LK.ram1 - LK.ram0)], [LD(LK.ram1), clunk], [LD(LK.bk0), whirr(700, 260, LK.bk1 - LK.bk0)], [LD(6.8), whirr(380, 160, 2.0)], [LD(LK.tout0), whirr(230, 150, .6)], [LD(LK.sh0), whirr(260, 180, .8)], [LD(LK.sh1), clunk],
  ...Array.from({ length: 13 }, (_, k) => [clampT(k) + .12, tick]),
  [T_RAIL + .4, () => SFX.tone(200, 2600, 8.0, 'sawtooth', .012)], [T_RAIL + 1.4, () => SFX.noise(6.6, 5000, .5, .016, 4)], [T_RAIL + .6, whirr(500, 300, 1.4)],
  [T_REL, () => { SFX.tone(48, 30, 2.6, 'sawtooth', .022); SFX.noise(2.4, 260, .7, .02, 1.6); }],
  [TF, () => { SFX.crack(); SFX.rumble(3, .3); SFX.tone(900, 60, 1.2, 'sawtooth', .02); }],
  [TF + MZH + .4, () => SFX.noise(5, 1800, .5, .012, 2)], [T_LEAD, () => { SFX.tone(2400, 600, 1.8, 'sawtooth', .006); SFX.noise(2, 6000, .4, .01, 1.5); }],
  ...TOUR_T.map(t => [TB + t, () => { SFX.crack(); SFX.tone(1200, 3000, .5, 'square', .006); }]),
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(4, .16); }],
  [TB + .5, tick], [TB + 1.2, tick],
  // the stow: the field down, the sensors stowed, train and elevation home, the cover, the pump stops
  [S2(48.4), () => SFX.tone(420, 110, 1.4, 'sine', .009)], [S2(50.6), whirr(330, 260, 1.0)], [S2(51.3), whirr(150, 90, 3.0)], [S2(54.2), clunk],
  [S2(54.3), () => SFX.tone(300, 180, .3, 'square', .01)], [S2(55.2), clunk], [S2(56.7), () => SFX.tone(120, 40, 1.0, 'sawtooth', .012)],
];
/* the context the inserts draw with */
function tagAt(tg, id, lab, val, p, a, age) {
  if (a < .01 || !K.pj(p[0], p[1], p[2])) return;
  const x = K.PJ[0], y = K.PJ[1];
  K.leader(x, y, x + 46 * RSC, y - 46 * RSC, '#C6F432', .8 * a);
  K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
  K.setTag(tg, id, K.decode(lab, E.sat(age / .6), TRNOW, id.length), val, 'lime sm', x + 50 * RSC, y - 60 * RSC, a);
}
const CTX = { K, P_, CL, XS, XF, XR, M3, HD, GEO, FILM, STAGE, V, R, X, E, rng, PI, TAU, DEG, LIME, HOT, WH, CORAL: K.CORAL, SO, MO, RO,
  apI, kk, lock, tr, tagAt, odot: P_.odot, oglow: P_.oglow, drawX: P_.drawX, MW, GY: P_.GY, GZ: P_.GZ, SIDE, T: 0, u: 0, Ws: null, st: null, camOld: null, xray: false,
  PATH_A, camAt: t => t < B_PR && t > 0 ? camLead(t) : camAt(t), Tb: 0, simAt, filmAt, T_REL, TF, TBU, T_LEAD, TB, TRET0, TRET1, T_RAIL, T_LD, MZ0, DIR0, B_TOP, S_HIT, SITE, bez, bezT, uOfD, dOfS, drawRound, SHOT };
if (window.RGK && RGK.build) RGK.build(CTX);
if (window.RGR && RGR.build) RGR.build(RCTX);
for (const q of INS) if (q.mod.build) { const t0 = performance.now(); q.mod.build(CTX); LOG.push(`insert ${q.at} ${(performance.now() - t0).toFixed(0)} ms`); }
const TF_R = TF;
const FCH = CHAPTERS.map(c => ({ t: mapOut(c.t), title: c.title }))
  .concat(...INS.map(q => (q.mod.chapters || []).map(c => ({ t: q.r0 + c.t, title: c.title })))).sort((a, b) => a.t - b.t);
const FCUES = cues.map(([t, fn]) => [mapOut(t), fn]).concat(...INS.map(q => (q.mod.cues || []).map(([u, fn]) => [q.r0 + u, fn])));
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
/* INTERCEPT: the act's context, built, run */
Object.assign(CTX, { AZ, EL, V0, MZ0, DIR0, shipW, simAt, simRate, filmOfBase, T_DLK, T_RLK, T_LAY, T_TR, T_TR1, T_EL, T_EL1, T_RAIL, T_REL, TF, MZH, MZR, T_ACT, T_ACT_B, SEGS, drawProbe, drawFire, drawSabot, stateAt, mountXf, PATH_A, camBase, HD, FILM, STAGE, RSC, octx, LIME, HOT, WH, XF, XR, SEA, STARS, ro, kick, MW, SIDE, P_ });
if (ACT && ACT.build) ACT.build(CTX);
/* INTERCEPT: the round's circuit lines are built lazily in the bore; built here so a seek straight past the bore works */
try { const st0 = stateAt(T_REL + .01); mountXf(shipW(0), st0); drawBore(T_REL + .01, st0); K.pb.clear(); P_.occReset(); } catch (e) { console.warn(e); }
const ACH = (ACT && ACT.seaChapters ? ACT.seaChapters(CTX) : []).concat(ACT ? (ACT.chapters || []).map(c => ({ t: T_ACT + c.t, title: c.title })) : []);
FCH.length = 0; for (const c of ACH) FCH.push(c); if (!FCH.length) FCH.push({ t: 0, title: 'Intercept' });
const ACUES = ACT ? (ACT.seaCues ? ACT.seaCues(CTX) : []).concat((ACT.cues || []).map(([u, fn]) => [T_ACT + u, fn])) : [];
FILM.run({ duration: T_ACT + (ACT ? ACT.len : 0), chapters: FCH, render, cues: ACUES });
STAGE.dbg = () => ({ camAt, prof: PROF, log: LOG, np: NP, mz: MZ0, dir: DIR0, btop: B_TOP, s1: S1, arc: ARC.len, range: RANGE, e21: E21, stateAt, XF, XR, site: SITE, side: SIDE, hit: S_HIT, PATH_A, times: { T_REL, TF, TBU, T_LEAD, TB, TRET0, TRET1, SH, DUR0, DUR, T_BORE }, mapOut, mapIn: t => Object.assign({}, mapIn(t)), INS: INS.map(q => ({ at: q.at, r0: q.r0, len: q.len })) });
})();
