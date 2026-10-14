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
   force on the armature, the rails pushed apart against the bands). It fires a probe toward the coast, the probe
   bursts over the headland and the lime lightning forks down onto a coastal battery, which the scan identifies part by
   part. The lens climbs away over the coast, back along the trail to the ship, as the mount stows. One take, loops.
   Render is a pure function of T. */
(() => {
const { V, R, X, E, rng } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = SK; K.setup();
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
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
/* before the shot (base time) the gun's story runs in order, 8-15 s a beat: the power run hands over in the power
   room (B_PR, where the engine insert ends); the valves open and the coolant pumps start; one pulsed alternator comes
   apart and closes, the rotors spin up (x30); the capacitor racks charge; the riser opens and the coolant climbs the
   power column into the gun's manifold; the cryocoolers take the coils from 300 K to 20 K, frost forming on a cold
   head, along the helium header and down the coil row (x240); the barrel is cut away and current runs into the
   superconducting coils station by station (x60), a scan plane drawing the section; the hydraulic power unit comes
   up; the director and the radar acquire and lock; the hydraulics lay the mount; down to the magazine (the
   fabrication insert at T_LD); the load; the rails charge (the heat sink insert at T_RAIL) */
const B_PR = 4.0;
const T_VLV = 5.2, T_PMP = 7.0;                                       // the valves open; the coolant pumps start
const T_AX = 13.6;                                                    // alternator 3 comes apart and closes (6.6 s)
const T_SPIN = 20.4, T_SPIN1 = 23.6;                                  // the rotors spin up (x30)
const T_BANK = 24.4, T_BANK1 = 30.0;                                  // the racks charge, module by module
const T_CUP = 30.6, T_CUP1 = 39.8;                                    // the riser opens; the coolant fills the manifold
const T_CRYO = 40.2, T_FH = 45.2, T_FR = 49.4, T_CR1 = 53.6;          // cryo (x240): a cold head, the header, the row
const T_CUT = 53.8, T_EN = 56.4, T_SL = 62.6, T_CUT1 = 65.8;          // the cutaway, the coils (x60), the slice, closed
const enT = k => T_EN + .5 * k;                                       // coil station k energises
const T_HPU = 70.8, T_HPU1 = 77.4;                                    // the hydraulic power unit comes up
const T_DLK = 81.8, T_RLK = 86.4;                                     // the director locks; the radar locks
const T_LAY = 89.4, T_TR = 89.8, T_TR1 = 97.8, T_EL = 90.0, T_EL1 = 98.0;   // the hydraulics lay the mount
const T_DWN = 100.4;                                                   // down to the magazine
/* loader time -> base time: the loader holds XH s with the round at the top of the hoist (its exploded view) */
const T_LD = 106.2, XH = 4.6, LX = 2.9, LD = t => T_LD + t + (t > LX ? XH : 0), T_XP = T_LD + LX;
const T_RAIL = LD(10.8), TF = T_RAIL + 9.0;                           // the rails charge; the round leaves the muzzle
const PRE_X = TF - 39.6;                                              // (the stretch before the shot grew by this in round 2)
const POST_X = 34, DUR0 = 87.8 + PRE_X + POST_X;                   // the base take (old time); (after the shot: + POST_X in round 2)
/* the clock before the shot: x30 through the spin-up, x240 through the cool-down, x60 through the coils' ramp */
const PREW = FILM.warp([{ t: 0, rate: 1 }, { t: T_SPIN - .1, rate: 1 }, { t: T_SPIN + .3, rate: 30 }, { t: T_SPIN1 - .3, rate: 30 }, { t: T_SPIN1 + .1, rate: 1 },
  { t: T_CRYO - .2, rate: 1 }, { t: T_CRYO + .2, rate: 240 }, { t: T_CR1 - .2, rate: 240 }, { t: T_CR1 + .2, rate: 1 },
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
const INS = [{ at: 4.0, mod: window.RGE }, { at: T_LD, mod: window.RGM }, { at: T_RAIL, mod: window.RGKD },
  { at: 'TBU', mod: window.RGX }, { at: 'RET', mod: window.RGKR }].filter(q => q.mod && q.mod.len > 0);
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
const PER = p => DUR / Math.max(1, Math.round(DUR / p));
const TRET1 = DUR0 - 5;                                                // the lens is in off the bow (it leaves the site at TRET0)
const SH = DUR0 - 57.4;                                               // the stow runs this much later than in the 58 s cut
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const pulse = (T, a, b) => kk(T, a, b);

/* ---------- the world: the ship on station, the coast 17 km to the north-north-east ---------- */
const S_POS = [7200, 0, 15600], PSI = Math.atan2(S_POS[0], S_POS[2]);
/* the scan walks the battery one vehicle at a time, the chain lightning leaping on from the last (tel2, sam, rdr, tel1) */
const TOUR_T = [6, 14, 22, 30];                                       // the chain reaches tel2, sam, rdr, tel1 (s after the stroke)
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
const V0 = 2300, V1 = 900;                                            // muzzle 2 300 m/s, 900 m/s at the burst
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
const AZ = PSI, EL = P_.EL_LOAD, PET = 115 * DEG, NST = P_.NST, NCELL = P_.NCELL;
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
const clampT = k => LD(9.4) + k * .07;
const T_DRUM = T_LD - 2.2;                                            // the drum indexes the empty cell under the hoist
/* the coolant: the riser to the mount opens at T_RIS; its front runs up the column, through the training structure
   to the starboard trunnion, along the cradle to the breech and down the rails' manifold at V_RIS m/s */
const T_RIS = T_CUP + .6, V_RIS = 3.2;
/* the cryo (x240): the cold heads' second stage from 300 K (tau 330 s); the cold helium front along the headers
   (B z, breech -> muzzle); each station's cold mass at 20 K in turn; the cutaway's stretch of barrel (B z) */
const cryoS = T => Math.max(0, PREW(T) - PREW(T_CRYO));               // sim s of cool-down
const chK = T => 20 + 280 * Math.exp(-cryoS(T) / 330);
const HZ0 = -2.0, HZ1 = P_.RZ1 - .2, T_HF0 = T_FH - 2.6, T_HF1 = T_FR - .4;
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
  s.rod = kk(T, T_AX, T_AX + .6) * (1 - kk(T, T_AX + 6.0, T_AX + 6.6));
  s.bell = 1.2 * kk(T, T_AX + .5, T_AX + 1.7) * (1 - kk(T, T_AX + 5.0, T_AX + 6.1));
  s.rtr = .95 * kk(T, T_AX + 1.5, T_AX + 2.9) * (1 - kk(T, T_AX + 4.0, T_AX + 5.2));
  s.rot = spin(ROTW, T) * VIS_REV * TAU; s.rate = ROTW.rate(T);
  s.rotX = s.rot; s.rateX = s.rate;
  // the riser: s since it opened (the front's age; -1 shut)
  s.rise = T < T_RIS ? -1 : T - T_RIS;
  // the cryo: the compressors and cold heads run; the cold heads' temperature; the header's cold front; the coil row
  s.cryo = E.ss(T_CRYO - .3, T_CRYO + .2, T) * (1 - E.ss(SX(56.8), SX(57.4), T));
  s.chK = T < T_CRYO ? 300 : chK(T);
  const melt = 1 - kk(T, TF + 6, TF + 14);                           // (the frost goes as the gun stands down)
  s.frost = melt * E.sat((cryoS(T) - 240) / 900);                      // the frost on the cold heads grows over ~15 min
  s.hdr = T < T_HF0 ? -9 : hdrZ(T);
  for (let k = 0; k < NST; k++) s.kc[k] = melt * E.sat((T - rowT(k)) / .7);
  s.cool = melt * E.ss(T_FR, rowT(NST - 1) + .7, T);
  // current into the superconducting coils, station by station (x60); the cutaways: the coils' stretch, the breech
  let f = 0;
  for (let k = 0; k < NST; k++) { const v = kk(T, enT(k), enT(k) + .5) * (1 - kk(T, SX(48.4) + .06 * k, SX(49.0) + .06 * k)); s.coil[k] = v; f += v; }
  s.field = f / NST;
  s.cut = kk(T, T_CUT, T_CUT + 1.8) * (1 - kk(T, T_CUT1 - 1.5, T_CUT1));
  s.cut2 = kk(T, T_RAIL + .4, T_RAIL + 2.2) * (1 - kk(T, T_REL - 1.0, T_REL - .2));
  // the hydraulic power unit starts; its pump strokes full while it charges the accumulators to 21 MPa, then idles
  // (it unloads); the pressure dips as the lay draws oil and recovers
  s.hpu = spin(HPUW, T) * 6 * TAU; s.hpuR = HPUW.rate(T);
  const pdown = 1 - E.ss(SX(56.6), SX(57.4), T), draw = E.ss(T_TR, T_TR + 2.2, T) * (1 - E.ss(T_TR1 - 1, T_TR1 + 2.6, T));
  s.hp = E.ss(T_HPU + 1.1, T_HPU + 5.6, T) * (1 - .14 * draw) * pdown;
  s.acc = .88 * s.hp;
  // the muzzle cover, the sensors acquire, train and elevation
  s.yaw = yawAt(T); s.el = elAt(T);
  { const dy = Math.abs(yawAt(T + .03) - s.yaw), de = Math.abs(elAt(T + .03) - s.el);   // (smooth: they ease in and out with the motion)
    s.trv = SMOOTH ? E.sat((dy - 1e-4) / 9e-4) : dy > 1e-4 ? 1 : 0; s.elv = SMOOTH ? E.sat((de - 1e-4) / 9e-4) : de > 1e-4 ? 1 : 0; }
  s.spool = kk(T, T_LAY, T_LAY + .25) * (1 - kk(T, T_TR1 + .2, T_TR1 + .5));
  s.stroke = Math.max(E.ss(T_HPU + .9, T_HPU + 1.3, T) * (1 - E.ss(T_HPU + 5.4, T_HPU + 5.9, T)), .14 * s.hpuR, .75 * Math.max(s.elv, s.trv));
  s.petal = kk(T, T_TR + 4.4, T_TR + 5.1) * (1 - kk(T, SX(54.3), SX(55.2)));
  const acq = kk(T, T_DLK - 1.8, T_DLK - .2) * (1 - kk(T, SX(50.6), SX(51.6)));
  s.eoY = acq * (AZ - s.yaw); s.eoP = -18 * DEG * (1 - acq) + .4 * DEG * acq;
  s.fcScan = kk(T, T_RLK - 2.6, T_RLK - 2.2) * (1 - kk(T, T_RLK - .3, T_RLK + .1));
  s.fcLk = E.ss(T_RLK - .1, T_RLK + .2, T) * (1 - E.ss(SX(50.6), SX(51), T));
  s.fcY = kk(T, T_RLK - 2.6, T_RLK - 1.8) * (1 - kk(T, SX(50.6), SX(51.6))) * (AZ - s.yaw) + s.fcScan * 24 * DEG * Math.sin((T - T_RLK + 2.6) * 3.4);
  // the cheeks ghost while the lens works inside them: the starboard one for the coolant's climb, the hydraulics
  // and the lay; the port one (and the starboard) for the loader
  s.ghS = Math.max(kk(T, T_RIS + 3.2, T_RIS + 3.9) * (1 - kk(T, T_CUP1 - 1.2, T_CUP1 - .4)), kk(T, T_CUT1 + .6, T_CUT1 + 1.8) * (1 - kk(T, T_LAY + 3.8, T_LAY + 4.6)),
    kk(T, T_RAIL + .2, T_RAIL + 1.2) * (1 - kk(T, T_REL - 1.0, T_REL - .2)));
  const a = T - TF, ar = T > TF - 1.6 ? simAt(T) + T_BORE : -1;      // sim s since the round was released
  s.rec = ar > 0 && ar < 1.6 ? .55 * (ar < .015 ? ar / .015 : Math.exp(-(ar - .015) * 4.2)) : 0;
  s.chg = E.ss(T_RAIL + .6, T_REL - .3, T) * (1 - E.ss(T_REL - .02, T_REL + .25, T));
  s.glow = a > 0 ? Math.exp(-a * 1.2) : 0;
  // the loader: the drum brings the empty cell under the hoist (the magazine fills it), the hoist lifts the round to
  // the tray (the round's exploded view at the top), the grips close, the breech block drops, the tray swings into
  // line, the rammer seats it, all back, the block closes and the clamps lock
  s.drum = kk(T, T_DRUM, T_DRUM + .6) * (1 - kk(T, TF + 8, TF + 9));
  s.gh = kk(T, T_LD - .5, T_LD) * (1 - kk(T, LD(10.0), LD(10.7)));
  s.tray = (90 * DEG - EL) * (kk(T, LD(.1), LD(.6)) * (1 - kk(T, LD(4.2), LD(5.3))) + kk(T, LD(8.7), LD(9.3)) * (1 - kk(T, TF + 8, TF + 9)));
  const up = kk(T, LD(.4), LD(2.8)), down = kk(T, LD(6.8), LD(8.8));
  s.hoistY = HOIST_B + (P_.HY1 - HOIST_B) * up * (1 - down);
  s.rnd = T < T_LD ? 3 : T < LD(.4) ? 0 : T < LD(2.8) ? 1 : T < T_REL ? 2 : 3;   // (none) in the drum, on the hoist, in the tray / bore, fired
  s.ram = kk(T, LD(6.6), LD(7.8)) * (1 - kk(T, TF + 8, TF + 9));
  s.ramH = s.ram * (1 - kk(T, LD(7.9), LD(8.7)));
  s.xp = kk(T, T_XP + .15, T_XP + .8) * (1 - kk(T, T_XP + XH - .7, T_XP + XH - .05));     // the round's exploded view
  s.brc = kk(T, LD(3.5), LD(4.1)) * (1 - kk(T, LD(8.8), LD(9.3)));
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
const S1 = 2 * ARC.len / (V0 + V1);
const dOfS = s => V0 * s - (V0 - V1) / (2 * S1) * s * s;
const vOfS = s => V0 - (V0 - V1) * s / S1;
const sOfD = d => { const a2 = (V0 - V1) / (2 * S1); return (V0 - Math.sqrt(Math.max(0, V0 * V0 - 4 * a2 * d))) / (2 * a2); };
const TBU = filmAt(S1);                                               // the burst
const HANG = 1.1, LEAD = 2.2, T_LEAD = TBU + HANG, TB = T_LEAD + LEAD; // the burst hangs; the leader runs down; the return stroke
const TRET0 = TB + TOUR_T[3] + 4;                                     // the lens leaves the site
PLACE_INS(TBU, TRET1 - 3);
const climbS = T => T <= TF ? 0 : T >= TBU ? S1 : simAt(T);
const climbRate = T => T <= TF - 1.6 || T >= TBU ? 1 : simRate(T);
const probeAt = (s, out) => bez(uOfD(dOfS(s)), out);
const bezT = (u, out) => { for (let k = 0; k < 3; k++) out[k] = 2 * (1 - u) * (B_C[k] - MZ0[k]) + 2 * u * (B_TOP[k] - B_C[k]); const l = Math.hypot(out[0], out[1], out[2]); out[0] /= l; out[1] /= l; out[2] /= l; return out; };
const CHAPTERS = [
  { t: 0, title: 'Station' }, { t: B_PR, title: 'Power room' }, { t: T_CUP, title: 'Coolant' }, { t: T_CRYO, title: 'Cryo' }, { t: T_CUT, title: 'Coils' },
  { t: T_HPU - 1.0, title: 'Hydraulics' }, { t: T_DLK - 2.4, title: 'Sensors' }, { t: T_LAY, title: 'Lay' }, { t: T_DWN, title: 'Magazine' }, { t: T_LD, title: 'Load' }, { t: T_RAIL, title: 'Charge' },
  { t: T_REL - .3, title: 'Fire' }, { t: TF + MZH + .3, title: 'Flight' }, { t: TBU - .2, title: 'Strike' }, { t: TB + .4, title: 'Scan' }, { t: TRET0, title: 'Return' }, { t: 48.4 + SH - .6, title: 'Stow' },
];
/* the sabot: three petals round the round; at the muzzle they peel off, slow in the air and fall away */
const BOLT = new K.Bolt({ top: B_TOP, hit: S_HIT, seed: 1402, depth: 9, nb: 14, rough: .55, spark: 26 });
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
  const val = k => [k[1][0], k[1][1], k[1][2], k[2][0], k[2][1], k[2][2], k[3]];
  const VK = keys.map(val);
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
    return { eye: [O[0], O[1], O[2]], target: [O[3], O[4], O[5]], fov: O[6] * DEG };
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
const PATH_P = pathR([
  [1.0, [-.4, 4.8, 48.0], [.2, 2.0, 42.6], 48],
  // the power room: aft over the valve header at the two coolant pumps; the valves open
  [B_PR, [.2, 4.35, 46.8], [.3, 1.9, 42.2], 46],
  [T_VLV + 1.0, [.35, 4.1, 46.4], [.35, 1.9, 42.2], 45],
  // a pump starts: in on its volute, the impeller turning, the coolant spiralling out of it
  [T_PMP + 1.2, [1.35, 2.75, 43.35], [.6, 1.85, 41.95], 38],
  [T_PMP + 3.0, [1.3, 2.8, 43.32], [.6, 1.85, 41.95], 37],
  // across to alternator 3, from the aisle (the side its parts slide out on): rods, end bell, rotor, and back
  [T_AX, [-.4, 4.6, 47.3], [2.3, 2.5, 45.6], 44],
  [T_AX + 6.4, [-.5, 4.5, 47.0], [2.3, 2.5, 45.4], 44],
  // the spin-up (x30): up and forward over the aisle, all four alternators
  [T_SPIN1 - .4, [-1.1, 5.5, 51.4], [.3, 2.4, 44.0], 52],
  // the racks charge, module by module, down the aisle from its forward end
  [T_BANK + 1.4, [.3, 5.4, 54.6], [0, 2.8, 48.0], 58],
  [T_BANK1 - .2, [.3, 5.3, 54.4], [0, 2.9, 48.2], 58],
  // the riser opens: the coolant climbs the power column ...
  [T_RIS + .4, [.35, 3.5, 51.6], [.1, 2.8, 48.6], 46],
  [T_RIS + 1.8, [.45, 5.0, 51.7], [.15, 4.6, 48.6], 46],
  // ... out through the deck forward of the barbette, the training structure to the starboard trunnion (the cheek ghosted) ...
  [T_RIS + 3.0, [1.6, 7.6, 53.6], [.8, 7.6, 49.0], 46],
  [T_RIS + 4.3, [2.9, 9.7, 52.6], [1.2, 9.3, 49.6], 46],
  // ... along the cradle to the breech and down the rails' manifold under the barrel, breech -> muzzle
  [T_CUP1 - .6, [2.2, 8.75, 56.6], [.1, 9.3, 51.0], 44],
  // the cryo (x240): a cold head frosting over
  [T_CRYO + 1.6, V.add(CSC, [.75, .58, .79]), V.add(CSC, [0, .18, .01]), 32],
  [T_FH, V.add(CSC, [.72, .56, .82]), V.add(CSC, [0, .19, .02]), 31],
  // the helium header: the cold front passes the cold head and runs on to the muzzle, the lens backing away ahead of it
  [T_FR - .3, b0S([1.5, 1.35, 10.0]), b0S([.17, .5, 8.6]), 38],
  // the coil row: the frost line runs down it
  [T_FR + 1.6, b0S([1.6, 1.72, 10.8]), b0S([.2, .32, 5.0]), 44],
  [T_CR1, b0S([1.7, 1.8, 11.2]), b0S([.2, .3, 3.6]), 44],
  // the barrel cut away (stations 4..9), current into the coils breech -> muzzle: the lens walks aft along it
  [T_CUT + 1.9, b0S([1.0, 2.7, 11.6]), b0S([0, -.05, 4.0]), 44],
  [T_EN + .2, b0S([.95, 2.65, 11.4]), b0S([0, -.05, 3.6]), 42],
  [T_EN + 5.8, b0S([.9, 2.4, 10.4]), b0S([0, -.05, 6.2]), 44],
  // the scan plane draws the section breech -> muzzle
  [T_CUT1 - .4, b0S([1.6, 2.9, 10.8]), b0S([0, 0, 4.6]), 48],
  // over the gunhouse to the hydraulics
  [T_CUT1 + 2.6, [5.8, 13.4, 50.8], [1.6, 9.4, 46.8], 46],
  // the hydraulic power unit (the starboard cheek ghosted): the motor, the pump's pistons, the gauge, the accumulators
  [T_HPU + .4, [4.6, 10.6, 43.2], [1.9, 8.9, 45.6], 40],
  [T_HPU + 3.2, [4.4, 10.4, 43.6], [2.0, 8.9, 45.8], 38],
  [T_HPU1 - 1.2, [4.0, 10.15, 44.6], [2.1, 8.9, 46.0], 38],
  [T_DLK - 3.4, [2.6, 12.2, 47.2], [.3, 10.2, 46.8], 42],
  // the sensors: the director acquires and locks ...
  [T_DLK - 1.2, [-.2, 12.25, 49.1], [-1.78, 11.35, 47.7], 40],
  [T_DLK + 1.0, [-.15, 12.22, 49.0], [-1.78, 11.36, 47.7], 40],
  // ... the radar searches and locks
  [T_RLK - 1.0, [3.9, 12.3, 47.0], [1.9, 11.75, 45.6], 42],
  [T_RLK + 1.2, [3.95, 12.3, 47.1], [1.9, 11.75, 45.6], 42],
  [T_LAY + .2, [4.5, 11.0, 47.4], [1.6, 9.8, 48.2], 44],
  // the lay: the elevation rams and the train drive, close ...
  [T_LAY + 1.6, [4.6, 9.5, 46.4], [1.2, 9.0, 50.4], 46],
  [T_LAY + 4.0, [4.6, 9.6, 46.6], [1.2, 9.2, 50.6], 46],
  // ... and wide from the starboard quarter: it trains and elevates
  [T_LAY + 7.6, [11.5, 11.2, 39.6], [1.4, 12.0, 51.4], 52],
  [T_DWN + .2, [11.9, 11.3, 40.2], [1.4, 12.4, 51.4], 52],
  // down to the magazine
  [T_LD - 1.6, [1.1, 5.6, 44.8], [-.45, 3.1, 47.62], 44],
  [T_LD, [1.1, 5.5, 44.9], [-.45, 3.0, 47.62], 44],
  // the hoist; the round at the top, its exploded view
  [LD(1.6), [1.7, 6.3, 45.4], [-.45, 5.0, 47.62], 44],
  [T_XP + .3, [1.0, 7.6, 45.5], [-.45, 7.15, 47.62], 44],
  [T_XP + XH - .2, [1.02, 7.6, 45.55], [-.45, 7.15, 47.62], 44],
  // the tray, the breech block, the rammer: from the side
  [LD(4.4), tS([3.0, .5, -.2]), bS([0, -.1, -2.9]), 44],
  [LD(6.6), tS([3.0, .5, -.1]), bS([0, -.1, -2.8]), 44],
  [LD(8.0), tS([3.1, .6, .1]), bS([0, 0, -2.2]), 44],
  // the block closes, the clamps lock breech -> muzzle
  [LD(10.2), tS([5.0, 3.0, 1.0]), bS([0, 0, 2.6]), 50],
  [T_RAIL, tS([5.0, 3.0, 1.1]), bS([0, 0, 2.6]), 50],
  // the rails charge: the breech cut away, the round seated, the current's path and the forces
  [T_RAIL + 2.2, bS([2.4, 1.6, -.4]), bS([0, .05, -1.1]), 42],
  [T_REL - 1.7, bS([2.2, 1.4, -.6]), bS([0, .05, -1.2]), 40],
  [T_REL + .5, BORE_E, BORE_T, 42],
]);
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

/* the scan: the lens holds the wide on the stroke, drops out of the sky onto the battery (TD0..TD1) and walks round it
   with the chain lightning, one vehicle at a time (site frame: +Z inland, the strike at (2, 13)). Per vehicle it is
   down on the ground (in the berm's mouth, looking up) a second before the chain leaps onto it and drifts slowly round
   it for 5 s while the scan runs over it (the hold), then swings on to the next in 3 s, lifted over the berms; the
   view turns about 180° over the tour, so it ends looking out to sea */
const SXF = SITE.XF, ST_ = p => X.ap(SXF, p);
const TOUR_ORD = [1, 3, 2, 0];                                        // tel2, sam, rdr, tel1 (VEH_DEF order)
/* a view of vehicle v from bearing brg (deg, site frame: 0 inland, 90 +X) at d m, the eye h m over the ground there,
   looking at th m over its base */
const VIEW = (v, brg, d, h, th, fov) => { const b = brg * DEG, x = v.x + Math.sin(b) * d, z = v.z + Math.cos(b) * d; return { eye: ST_([x, SITE.ground(x, z) + h, z]), target: ST_([v.x, SITE.ground(v.x, v.z) + th, v.z]), fov }; };
const TK = (() => {
  const [tel2, sam, rdr, tel1] = TOUR_ORD.map(k => SITE.V[k]);
  // the look's bearing falls the whole way round (each vehicle seen drifting the same way as the swings)
  const views = [
    [VIEW(tel2, 150, 14.5, 1.7, 2.7, 40), VIEW(tel2, 125, 15.5, 3.4, 2.6, 42), null],
    [VIEW(sam, 121, 15, 1.7, 2.7, 40), VIEW(sam, 90, 16, 4.4, 2.6, 42), ST_([34, 29 + 7, 40])],
    [VIEW(rdr, 80, 20, 1.7, 6.6, 46), VIEW(rdr, 47, 20, 4.4, 6.0, 48), ST_([6, 29 + 7, 22])],
    [VIEW(tel1, 40, 16.5, 4.4, 2.6, 42), VIEW(tel1, 12, 17.5, 5.6, 2.2, 42), null],
  ];
  const keys = [];
  views.forEach(([A, B], i) => {
    if (i) { const P = keys[keys.length - 1], mid = views[i - 1][2], tm = (P.t + TB + TOUR_T[i] - 1) / 2; keys.push({ t: tm, eye: mid ? V.add(mid, [0, 0, 0]) : V.add(V.lerp(P.eye, A.eye, .5), [0, 3.2, 0]), target: null, fov: (P.fov + A.fov) / 2 }); }
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
const DV0 = camB(TB - .2), TD0 = TB + .6, TD1 = TK[0].t;
/* the drop: from the wide onto the battery, the distance falling three orders of magnitude, the view turning down
   from the stroke to the first vehicle */
function camDive(T) {
  const g = E.ss(TD0, TD1, T), K0 = TK[0], tgt = K0.target;
  const d0 = V.sub(DV0.eye, tgt), d1 = V.sub(K0.eye, tgt), L0 = V.len(d0), L1 = V.len(d1);
  const az0 = Math.atan2(d0[0], d0[2]), el0 = Math.asin(d0[1] / L0);
  let az1 = Math.atan2(d1[0], d1[2]); const el1 = Math.asin(d1[1] / L1);
  while (az1 - az0 > PI) az1 -= TAU; while (az1 - az0 < -PI) az1 += TAU;
  const ga = E.ss(.25, 1, g);                                          // (it comes round onto the first one once close)
  const eye = V.add(tgt, V.mul(sph(az0 + (az1 - az0) * ga, E.mix(el0, el1, E.ss(.1, 1, g))), K.logMix(L0, L1, g)));
  const target = lookTurn(eye, lookTurn(eye, DV0.target, S_HIT, E.ss(TD0 - .2, TD0 + 1.6, T)), tgt, E.ss(TD0 + .8, TD1 - .3, T));
  return { eye, target, fov: E.mix(DV0.fov, K0.fov * DEG, E.ss(TD0 + 1, TD1, T)) };
}
/* the way home: the lens cranes up and back off tel1, the battery and its berms in the lower frame (TRET0..TH0), then
   follows the trail home: up beside the stroke's path to the top of the arc and down beside the trail to the ship,
   looking ahead to the ship the whole way (the trail leading down to it, the ship growing from a dot); over the last
   2 km its distance falls by equal factors and it comes in low off the starboard bow (ER at TRET1: the heat sink insert
   splices here), then rises past the hull and glides into the opening view (PATH_A at 0, matched in place and speed) */
const KL = TK[TK.length - 1], CR_E = ST_([-20, 29 + 70, 110]), CR_T = ST_([10, 29, -40]), CR_D = V.norm(V.sub(CR_T, CR_E)), TH0 = TRET0 + 5.5;
const ER = [30, 6.5, 96], TR_ = [0, 10, 48], VR = [-1.45, 0, -2.85];  // the end of the way home (ship frame ~ world)
const hm3 = (p0, p1, m0, m1, u, dt) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + m0 * dt * (u3 - 2 * u2 + u) + p1 * (3 * u2 - 2 * u3) + m1 * dt * (u3 - u2); };
/* the route: a centripetal Catmull-Rom curve through waypoints beside the stroke and the trail (on the starboard side
   of the line of fire), resampled by length */
const HOME = (() => {
  const off = (p, sd, up) => [p[0] + SIDE[0] * sd, p[1] + up, p[2] + SIDE[2] * sd], bz = u => bez(u, [0, 0, 0]), vr = V.norm(VR);
  const W = [CR_E, off(V.lerp(S_HIT, B_TOP, .35), 600, 250), off(V.lerp(S_HIT, B_TOP, .75), 950, 450), off(bz(.9), 1200, 600), off(bz(.62), 1100, 380),
    off(bz(.34), 700, 180), off(bz(.13), 300, 60), V.mad(ER, vr, -300), V.mad(ER, vr, -80), ER];
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
const CRP = FILM.path([{ t: TRET0, eye: KL.eye, target: KL.target, fov: KL.fov }, { t: TRET0 + 3.2, eye: V.lerp(KL.eye, CR_E, .5), target: V.lerp(KL.target, CR_T, .6), fov: 46 },
  { t: TH0, eye: CR_E, target: CR_T, fov: 44 }]);
function camRet(T) {
  if (T < TH0) return CRP(T);
  const eye = homeEye(T), f = HOME.sAt(T - TH0) / HOME.L;
  // from the battery up to the trail ahead (a point sliding down it toward the ship), then onto the ship itself
  bez(E.clamp(1.02 - 1.15 * f, 0, 1), HT);
  const p = HT[1] - eye[1], h = Math.hypot(HT[0] - eye[0], HT[2] - eye[2]); if (p > .45 * h) HT[1] = eye[1] + .45 * h;   // (never more than ~24° up)
  const aim = lookTurn(eye, HT, TR_, E.ss(.5, .86, f));
  return { eye, target: lookTurn(eye, V.mad(eye, CR_D, 60), aim, E.ss(TH0, TH0 + 5, T)), fov: (E.mix(44, 30, E.ss(TH0 + 1, TH0 + 6, T)) + 16 * E.ss(TH0 + HOME.TJ - 1, TRET1 - 1, T)) * DEG };   // (closer on the ship and the trail while far)
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
  if (T < TF + 6.4) return K.blendShot(camRig(T), camB(T), E.ss(TF + 3.9, TF + 6.4, T));
  if (T < TD0) return camB(Math.min(T, TB - .2));                  // (the wide holds through the stroke)
  if (T < TD1) return camDive(T);
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
const ghOcc = g => SMOOTH ? 1 - E.ss(.03, .7, g) : g < .3 ? 1 : 0;
const openOcc = (z0, z1) => SMOOTH ? (XS.zo < 90 ? E.sat((z0 - XS.zo) / 4) * (XS.zs > 90 ? 1 : E.sat((XS.zs - z1) / 4)) : 0) : allOpen(z0, z1) ? 1 : 0;
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
  MO.keep = 1 - .86 * gS; MO.a = 1.3 * (1 - .4 * gS); X_(CL.cheekS, XF.T, MO);
  MO.keep = 1 - .86 * gP; MO.a = 1.3 * (1 - .4 * gP); X_(CL.cheekP, XF.T, MO);
  MO.keep = 1 - .5 * gS; MO.a = 1.3 * (1 - .3 * gS); X_(CL.gbody, XF.T, MO);
  // inside: the hydraulic power unit lit as it comes up, its pump's block and swash plate, the accumulators' pistons;
  // the helium compressors and the fire-control cabinet
  const hpuF = kk(T, T_CUT1 + .6, T_CUT1 + 1.8) * (1 - kk(T, T_HPU1 - .4, T_HPU1 + .4));
  MO.keep = 1 - .6 * st.gh; MO.a = 1.5 + .4 * st.ghS; MO.lime = Math.max(.45 * lock(T, T_HPU + .3), .3 * E.ss(T_HPU + .3, T_HPU + .6, T) * (1 - E.ss(T_HPU + 1.6, T_HPU + 2.2, T)), .35 * st.trv * gS, .35 * st.elv * gS); X_(CL.ginH, XF.T, MO);
  if (st.ghS > .02) drawHPU(T, st);
  MO.keep = 1 - .6 * Math.max(st.gh, st.ghS); MO.a = 1.4; MO.lime = .3 * lock(T, T_CRYO - .3); X_(CL.ginC, XF.T, MO); MO.lime = 0; MO.a = 1.3; MO.keep = 1;
  // the train drives' pinions walk round the fixed ring gear
  if (st.ghS > (SMOOTH ? .002 : .02)) for (let i = 0; i < 2; i++) { const p = P_.TD_P[i]; MO.lime = .6 * st.trv; MO.keep = SMOOTH ? E.sat(st.ghS / .3) : 1; X_(CL.tpin, X.mul(XF.T, X.make(R.y(-st.yaw * P_.RING_R / P_.PIN_R + i), [p[0], .13, p[2]])), MO); }
  // the sensors: the director's yoke and head, the radar's head
  MO.lime = 0; MO.keep = 1; X_(CL.eoBase, XF.T, MO); X_(CL.eoYoke, XF.eoY, MO);
  MO.lime = Math.max(.8 * lock(T, T_DLK), .5 * lock(T, T_EL1 + .1), .12 * E.ss(T_DLK - 1.8, T_DLK - 1.4, T)); X_(CL.eoHead, XF.eoP, MO);
  MO.lime = 0; X_(CL.fcBase, XF.T, MO); MO.lime = Math.max(.8 * lock(T, T_RLK), .2 * st.fcScan, .12 * st.fcLk); X_(CL.fcHead, XF.fcY, MO);
  // the cradle and its rams
  MO.lime = Math.max(.22 * st.elv, .6 * lock(T, T_EL1)); X_(CL.cradle, XF.C, MO);
  for (const s of [-1, 1]) { const e = P_.RAM_E(s); ramDraw(XF.T, e[0], XF.C, e[1], st.elv); }
  // the barrel: structure, rails, sidewalls (cut away when the cutaway is open); the coils light as they energise
  const rec = 1 - .55 * hpuF - .3 * st.gh;                                          // (recedes behind the HPU's close-up)
  MO.keep = rec; MO.lime = Math.max(.1 * ch, .35 * gl, .45 * lock(T, T_EL1)); cutDraw(CL.barrel, null, MO, cq, 0); MO.keep = 1;
  const rv = Math.max(SMOOTH ? Math.max(E.sat(ch / .04), E.sat(gl / .04), E.ss(TS0 - .2, TS0, T) * (1 - E.ss(TS1, TS1 + .2, T))) : ch > .01 || gl > .01 || (T > TS0 && T < TS1) ? 1 : 0, E.sat(cq.q * 3));
  if (rv > .004) {                                                        // (inside the containment: seen lit, or cut open)
    MO.lime = Math.min(1, .9 * ch + gl + .25 * cq.q); MO.a = (1.3 + .5 * ch + .3 * cq.q) * rv; cutDraw(CL.rails, null, MO, cq, 0); MO.lime = .45 * ch + .15 * cq.q; cutDraw(CL.ins, null, MO, cq, 0); MO.a = 1.3;
  }
  for (let k = 0; k < NST; k++) {
    const v = st.coil[k]; MO.lime = Math.min(1, .5 * v + .5 * lock(T, enT(k) + .45) + .3 * ch * v); MO.a = 1.35 + .35 * v;
    cutDraw(CL.coil, STL[k], MO, cq, P_.STN[k]);
  }
  MO.a = 1.3; MO.lime = .32 * st.cryo * (1 - .6 * st.field); cutDraw(CL.cryo, null, MO, cq, 0); MO.lime = 0;
  { const c = P_.COLD[P_.COLD_HERO]; apI(XF.B, c[0], c[1] + .2, c[2], Q1); if (V.dist(C.eye, Q1) < 3.5 && cq.q < .02) { MO.lime = .32 * st.cryo * (1 - .6 * st.field); X_(CL.cryoHero, XF.B, MO); MO.lime = 0; } }   // (the watched cold head, finer)
  for (let k = 0; k < P_.BANDS.length; k++) {
    const z = P_.BANDS[k], o = .05 * st.jaw[k];
    MO.lime = Math.max(.9 * lock(T, clampT(k) + .12), .25 * ch, .4 * gl, .7 * forceA(T, st));
    cutDraw(CL.jawS, tr(o, 0, z), MO, cq, z); cutDraw(CL.jawP, tr(-o, 0, z), MO, cq, z);
  }
  MO.lime = Math.max(.8 * lock(T, LD(4.1)), .8 * lock(T, LD(9.3)), .15 * ch); X_(CL.breech, X.mul(XF.B, tr(0, -.86 * st.brc, 0)), MO);
  MO.lime = .7 * lock(T, T_TR + 5.1); X_(CL.petalT, XF.petT, MO); X_(CL.petalB, XF.petB, MO);
  MO.lime = 0; MO.a = 1.3;
}
/* the hydraulic power unit's moving parts: the pump's cylinder block turning with the motor, its swash plate tilted
   by the stroke (full while it charges, near flat when it idles), the accumulators' pistons riding on the oil */
function drawHPU(T, st) {
  const H = P_.HPU, A = E.sat(st.ghS / .3);
  MO.keep = A; MO.a = 1.6; MO.lime = .3 * st.stroke * st.hpuR;
  P_.drawX(CL.hpuBlock, X.mul(XF.T, X.make(R.z(st.hpu), H.pump)), MO);
  MO.lime = .45 * st.stroke * st.hpuR; P_.drawX(CL.hpuSwash, X.mul(XF.T, X.make(R.x(17 * DEG * st.stroke), [H.pump[0], H.pump[1], H.SW])), MO);
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
    RO.lime = .5 * lock(T, T_AX + 6.5) * (xk ? 1 : 0); RO.S = L; X_(CL.body, X.mul(Ws, L), RO);
    RO.lime = xk ? Math.max(.35 * Math.min(1, st.bell * 2), .6 * lock(T, T_AX + 6.1)) : 0;
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
  const fl = Math.max(lock(T, T_AX - .2), lock(T, T_AX + 6.5));
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
      const w = Math.max(0, Math.cos(((base + s) / .45 - ph) * TAU)), nf = E.sat(1 - (d - base - s) / 1.2) * fresh, b = A * (.3 + .55 * w * w);
      apI(Tw, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], w > .85 || i === 4 ? 2 : 1, nf > .3 || (i === 4 && w > .5) ? LIME : WH, Math.max(b * (i === 4 ? 1.4 : 1), .9 * nf));
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
}
/* ---------- current into the superconducting coils: down the flexible feed from the training structure, along the
   coils' bus on top of the barrel to each station's current leads as it energises (x60) ---------- */
const CB0 = [0, 0, 0], CB1 = [0, 0, 0], CB2 = [0, 0, 0], CB3 = [0, 0, 0];
function coilFeedFX(T, st) {
  const on = E.ss(T_EN - .7, T_EN - .3, T) * (1 - E.ss(enT(NST - 1) + 1.2, enT(NST - 1) + 2.4, T)); if (on < .01) return;
  const B = XF.B, n = 32, zh = Math.min(P_.STN[NST - 1] + .22, T < enT(0) - .1 ? -2.3 + (P_.STN[0] + .22 + 2.3) * E.sat((T - T_EN + .7) / .6) : P_.STN[0] + .22 + (T - enT(0) + .1) / .5 * P_.DZS);
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
    for (let zz = -2.3 + ((T * 2.4) % .3); zz < zh; zz += .3) for (let j = 0; j < 4; j++) {
      const z = zz - j * .03; apI(B, s * .32, .59 + lift(z), z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], j ? 1 : 2, j ? LIME : HOT, on * (1 - j * .22));
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
  if (st.rnd === 1 || (st.rnd === 2 && T < LD(7.9) && st.xp < .05)) {
    const Lr = st.rnd === 1 ? X.mul(XF.T, X.make(ROT_UP, [0, st.hoistY, P_.HZ])) : st.ram > 0 ? X.mul(XF.B, tr(0, 0, P_.TRAY_Z + P_.RAM_L * st.ram)) : XF.tray;
    const U = X.dir(Lr, [1, 0, 0]), W = X.dir(Lr, [0, 1, 0]);
    for (const z of [-1.0, -.62, .48, 1.0]) { apI(Lr, 0, 0, z, Q1); K.ringW(Q1, U, W, z < -.7 || z > .9 ? .05 : .16, 40, 1, LIME, .8, T * 4); }
    apI(Lr, 0, 0, 1.0, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .45);
  }
  // the breech seal as the block reaches home
  const bs = lock(T, LD(9.3));
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
  const chg = E.ss(T_HPU + 1.1, T_HPU + 1.5, T) * (1 - E.ss(T_HPU + 5.4, T_HPU + 5.9, T)), run = Math.max(chg, .5 * Math.max(st.elv, st.trv), .15 * st.hpuR);
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
  const ul = lock(T, T_HPU + 5.5); if (ul > .02) { apI(TT, 1.6, .9, -1.6, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .6 * ul * A); }
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
    const w = P_.EO_WIN[2]; apI(L, w[0], w[1], w[2], Q1); const dl = V.norm(V.sub(S_HIT, Q1));
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
      const db = V.norm(V.sub(S_HIT, Q1)), U = V.norm(V.cross(db, [0, 1, 0])), W = V.cross(U, db), fl = lock(T, T_RLK), ta = 2.2 * DEG;
      for (let i = 0; i < 9; i++) {
        const d = ((T * 9 + i * 3.4) % 30) + .5, r = .22 + d * Math.tan(ta), a = trk * (1 - d / 31) * (.45 + .55 * fl);
        for (let k = 0; k < 3; k++) Q3[k] = Q1[k] + db[k] * d;
        K.ringW(Q3, U, W, r, 40, 1, LIME, .7 * a, T * 2 + i);
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
  const B = XF.B, n = P_.FROST.n, fr = Math.floor(T * 10), f = st.frost, hz = st.hdr, mlt = 1 - kk(T, TF + 6, TF + 14), cq = cutOf(st);
  apI(B, 0, .5, 4, Q1); const d = V.dist(C.eye, Q1), step = SMOOTH ? 1 : d < 12 ? 1 : d < 30 ? 2 : 4, kf = SMOOTH ? 1 / Math.min(4, Math.max(1, d / 12)) : 1;
  for (let i = 0; i < n; i += step) {
    if (kf < 1 && (i * .6180339887) % 1 > kf) continue;
    const o = i * 6, kind = P[o + 3], h = P[o + 5];
    let v;
    if (kind === 0) v = f - h;                                        // the cold heads, from the flange up
    else if (kind === 1) v = 1.2 * f - .2 - h;                        // their flex lines a little behind
    else if (kind === 2) v = mlt * ((hz - P[o + 2]) / 1.6 - h);       // the headers, behind the cold front
    else v = st.kc[P[o + 4]] - h;                                     // the cryostats as the station reaches 20 K
    if (v <= 0) continue;
    const x = P[o], y = P[o + 1], z = P[o + 2];
    if (cq.q > .05 && x > cq.x0 && y > 0 && z > cq.zr[0] && z < cq.zr[1]) continue;
    apI(B, x, y, z, Q1);
    const gl = K.hh(i, fr) > .992, h2 = K.hh(i, 5.3);
    P_.odot(Q1[0], Q1[1], Q1[2], gl || h2 > .5 ? 2 : 1, gl ? HOT : WH, gl ? 1 : (.65 + .35 * h2) * Math.min(1, v * 6));
  }
}
function mechFX(T, st) {
  frostFX(T, st); hydFX(T, st); cryoFX(T, st); fieldFX(T, st); sensorFX(T, st); riserFX(T, st); straps(T, st); coilFeedFX(T, st); cutFX(T, st); forceFX(T, st);
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
const TS0 = T_SL, TS1 = T_SL + 2.6;
function rectB(Tw, x0, y0, x1, y1, z, col, a, s) {
  apI(Tw, x0, y0, z, Q1); apI(Tw, x1, y0, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, s, col, a);
  apI(Tw, x1, y1, z, Q1); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, s, col, a);
  apI(Tw, x0, y1, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, s, col, a);
  apI(Tw, x0, y0, z, Q1); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, s, col, a);
}
function circB(Tw, x, y, z, r, n, col, a) { for (let k = 0; k < n; k++) { const b = k / n * TAU; apI(Tw, x + Math.cos(b) * r, y + Math.sin(b) * r, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, col, a); } }
function drawSlice(T, st) {
  if (T < TS0 || T > TS1) return;
  const u = E.ss(TS0, TS1, T), A = E.ss(TS0, TS0 + .25, T) * (1 - E.ss(TS1 - .25, TS1, T));
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
/* the round through the bore (x0.01): it runs breech -> muzzle on the rails, the current behind it lighting the
   rails white-hot back to the breech, the armature's arc at its base, the field's rings round the barrel at it */
/* ---------- the shot: the round through the bore, the sabot, the muzzle, the trail, the burst (pc_scan_railgun_shot.js) ---------- */
SHOT = window.RGF_INIT({ ACC, ARC, BOLT, B_C, B_TOP, C, CL, DEG, DIR0, E, EM, EOFF, HANG, HDIR, HOT, K, LB_, LEAD, LIME, MO, MW, MZ0, MZH, MZR, NUP, P3, PATH_A, PI, P_, Q1, Q2, Q3, R, S1, SIDE, SITE, S_HIT, TAU, TB, TBU, TF, TG, TM, TOUR_T, TRET0, TRET1, T_BORE, T_LEAD, T_RAIL, T_REL, V, V0, V1, WH, X, XF, apI, bez, bezT, camBase, climbRate, climbS, dOfS, drawRound, filmAt, kk, lock, lookMix, lookTurn, probeAt, rng, roundZ, sOfD, shipW, simAt, simRate, stateAt, tr, uOfD, vOfS });
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
  // the power room: the valves, a coolant pump, alternator 3 opened, the spin-up, the racks
  ['VLV', 'Valve header · 4 gate valves', st => st.valve > 9 ? 'open' : '', 'W', [.3, 2.72, 43.6], T_VLV + .1, T_PMP - .2],
  ['PMP', 'Coolant pump · brushless DC motor', st => `${Math.round(PUMP_RPM * st.pumpR / 10) * 10} rpm`, 'P0', [0, .45, .4], T_PMP + .3, T_PMP + 2.6],
  ['STA', 'Stator · 12 wound teeth', st => '', 'P0', [-.2, -.08, .36], T_PMP + 1.0, T_PMP + 3.0],
  ['PMR', 'Permanent-magnet rotor · 8 poles', st => '', 'P0', [.1, -.1, .5], T_PMP + 1.6, T_PMP + 3.6],
  ['IMP', 'Impeller · 6 vanes', st => `${Math.round(1500 * st.pumpR)} L/min`, 'P0', [.2, -.1, 1.22], T_PMP + 2.4, T_PMP + 4.8],
  ['VOL', 'Volute · to the valve header', st => '', 'P0', [0, .3, 1.24], T_PMP + 3.2, T_PMP + 5.2],
  ['ROD', 'Guide rods ×2', st => '', 'XA', [.62, -.55, 1.7], T_AX + .4, T_AX + 2.2],
  ['EXC', 'Exciter · end bell', st => '', 'XEXC', [0, .5, 1.3], T_AX + 1.1, T_AX + 3.6],
  ['ROT', 'Rotor · 4 salient poles', st => '', 'XROT', [0, .8, .3], T_AX + 2.6, T_AX + 4.6],
  ['STR', 'Stator · 24 coil sides', st => '', 'XA', [0, .99, -.3], T_AX + 3.2, T_AX + 5.2],
  ['ALT', 'Pulsed alternators ×4', st => `${Math.round(RPM * st.rate / 10) * 10} rpm`, 'W', [3.2, 3.9, 45.0], T_SPIN + .4, T_SPIN1 + .6],
  ['CAP', 'Capacitor racks ×4 · 80 modules', st => `${2 * nCharged(ST_T)} MJ`, 'W', [1.96, 5.2, 49.2], T_BANK + .5, T_BANK + 3.6],
  ['MOD', 'Film capacitor module · 2 MJ', st => '', 'W', [P_.MOD[7].p[0] - .41, P_.MOD[7].p[1] + .2, P_.MOD[7].p[2]], T_BANK + 1.2, T_BANK + 3.8],
  ['PCU', 'Power conditioning ×5', st => `${2 * nCharged(ST_T)} / 160 MJ`, 'W', [-1.84, 3.85, 55.35], T_BANK + 3.8, T_BANK1 + .2],
  // the coolant climbs into the gun
  ['RSR', 'Riser · coolant to the mount', st => '', 'W', [.2, 3.4, 48.6], T_RIS + .3, T_RIS + 2.6],
  ['SLR', 'Slip rings · power to the turning mount', st => '', 'M', [.68, -2.0, 0], T_RIS + 1.6, T_RIS + 3.6],
  ['RUN', 'Rotary union · starboard trunnion', st => '', 'T', [1.38, P_.TRN[1], P_.TRN[2]], T_RIS + 4.0, T_RIS + 6.0],
  ['MAN', "Rails' coolant manifold", st => `${Math.round(100 * manFill(ST_T))} %`, 'B', [.12, -.52, 4.0], T_CUP1 - 3.2, T_CUP1 + .2],
  // the cryo: a cold head, the header, the coil row
  ['CRC', 'Cryocoolers ×24 · pulse tube', st => `${Math.round(st.chK)} K`, 'B', [.5, .78, ZST(4) - .14], T_CRYO + .5, T_FH - .3],
  ['STG', 'Cold head · 2nd stage', st => '', 'B', [.5, .5, ZST(4) - .14], T_CRYO + 1.2, T_FH],
  ['FRS', 'Frost · moisture from the air', st => '', 'B', [.55, .52, ZST(4) - .1], T_CRYO + 2.2, T_FH + .4],
  ['HEL', 'Helium header · cold front', st => `${Math.max(0, st.hdr - HZ0).toFixed(1)} m`, 'B', st => [.17, .53, E.clamp(st.hdr, HZ0, HZ1)], T_FH + .5, T_FR - .3],
  ['ROW', 'Coil row · 12 stations', st => `${nCold(ST_T)}/12 at 20 K`, 'B', [.62, .42, ZST(3)], T_FR + .8, T_CR1 + .3],
  ['CRY', 'Cryostats · vacuum', st => '', 'B', [.62, -.3, ZST(8)], T_FR + 2.0, T_CR1 + .3],
  // the cutaway, current into the coils
  ['RLS', 'Rails ×2 · copper', st => '', 'B', [.05, .24, ZST(5)], T_CUT + 1.4, T_CUT + 4.0],
  ['INS', 'Insulating sidewalls', st => '', 'B', [.2, -.04, ZST(6)], T_CUT + 1.9, T_CUT + 4.3],
  ['BOR', 'Bore · 280 mm square', st => '', 'B', [0, 0, ZST(7)], T_CUT + 2.4, T_EN + .2],
  ['CNT', 'Containment · composite', st => '', 'B', [.36, .22, ZST(8)], T_CUT + 2.6, T_EN + .6],
  ['LDS', 'Current leads', st => '', 'B', [.45, P_.KY + .2, ZST(4) + .22], T_EN + .3, T_EN + 2.6],
  ['COIL', 'Superconducting coils ×24 · REBCO', st => `${(5 * st.field).toFixed(1)} T`, 'B', [.62, .25, ZST(6)], T_EN + 1.2, T_SL - .4],
  ['FLD', 'Field across the bore', st => `${(5 * st.field).toFixed(2)} T`, 'B', [0, .02, ZST(7)], T_EN + 3.0, T_SL],
  ['SEC', 'Section', st => '', 'B', st => [0, .62, E.mix(P_.RZ0, P_.SLV1, E.ss(TS0, TS1, ST_T))], TS0 + .3, TS1 - .2],
  // the hydraulics
  ['HPU', 'Hydraulic power unit', st => `${(P_HYD * st.hp).toFixed(1)} MPa`, 'T', [1.9, 1.62, -3.9], T_HPU + .5, T_HPU + 2.8],
  ['PIS', 'Axial piston pump · 9 pistons', st => '', 'T', [P_.HPU.pump[0], P_.HPU.pump[1] + .14, P_.HPU.pump[2] + .2], T_HPU + 1.4, T_HPU + 3.8],
  ['GAU', 'Pressure', st => `${(P_HYD * st.hp).toFixed(1)} MPa`, 'T', P_.HPU.gauge, T_HPU + 2.2, T_HPU1],
  ['ACC', 'Piston accumulators ×3', st => `${Math.round(100 * st.acc)} %`, 'T', [2.32, 1.55, -2.35], T_HPU + 3.0, T_HPU1],
  ['VLV2', 'Valve stack · 4 spools', st => st.spool > .5 ? 'shifted' : '', 'T', [1.6, 1.0, -2.2], T_HPU + 4.0, T_HPU1],
  // the sensors
  ['EOIR', 'Electro-optical / infrared director', st => 'TV · IR · laser', 'eoP', [0, .16, .2], T_DLK - 2.0, T_DLK + 1.4],
  ['FCR', 'Fire-control radar · X band', st => st.fcScan > .5 ? 'search' : st.fcLk > .5 ? 'track' : '', 'fcY', [0, .62, .1], T_RLK - 2.4, T_RLK + 1.8],
  // the lay
  ['ELR', 'Elevation rams ×2', st => `${Math.round(st.el / DEG)}°`, 'C', [.9, -.4, 1.2], T_LAY + .7, T_LAY + 4.6],
  ['TRD', 'Train drives ×2 · hydraulic motor', st => `${Math.round(st.yaw / DEG)}°`, 'T', [2.0, .7, 1.15], T_LAY + 1.1, T_LAY + 4.6],
  ['RNG', 'Ring gear · 112 teeth', st => '', 'M', [1.7, .2, 1.76], T_LAY + 1.8, T_LAY + 4.6],
  ['MZC', 'Muzzle cover', st => '', 'B', [.5, .5, P_.SLV1], T_TR + 4.5, T_TR + 6.4],
  ['MVR', 'Muzzle velocity radar · Doppler', st => '', 'C', [0, 1.14, 2.86], T_TR1 - .2, T_DWN],
  // the loader
  ['MAG', 'Magazine drum · 12 cells', st => '', 'W', [1.3, 3.0, 48.3], T_DRUM - .1, T_LD],
  ['HST', 'Hoist', st => `${(st.hoistY - HOIST_B).toFixed(1)} m`, 'T', [.24, -2.4, P_.HZ], LD(.4), LD(2.8)],
  ['PRB', 'Probe · long rod', st => '2.0 m', 'RND', [.05, 0, .8], T_XP + .6, T_XP + XH - .3],
  ['SAB', 'Sabot ×3', st => '', 'RND', [.3, 0, 0], T_XP + 1.1, T_XP + XH - .3],
  ['ARM', 'Armature', st => '', 'RND', [.1, -.14, -.72], T_XP + 1.6, T_XP + XH - .3],
  ['TRY', 'Loading tray', st => '', 'tray', [.19, .1, .6], LD(3.4), LD(5.9)],
  ['BRC', 'Breech block', st => '', 'B', [.46, .5, -2.7], LD(3.6), LD(6.3)],
  ['RMR', 'Chain rammer · 2.4 m', st => `${(P_.RAM_L * st.ram).toFixed(1)} m`, 'C', [.17, .16, -4.9], LD(6.4), LD(8.5)],
  ['CLP', 'Preload clamps ×13', st => `${nLocked(ST_T)}/13`, 'B', [.56, .46, P_.BANDS[3] + .05], LD(9.3), T_RAIL + .2],
  // the charge: the breech cut away
  ['ARM2', 'Armature · seated', st => '', 'B', [.1, .14, P_.SEAT_Z - .66], T_RAIL + 2.0, T_RAIL + 4.6],
  ['BUS', 'Rail feed · bus straps', st => '4.2 MA at the shot', 'B', [.3, .3, -.6], T_RAIL + 2.8, T_RAIL + 5.4],
  ['BND', 'Preload bands · hold the rails', st => '', 'B', [.56, .46, P_.BANDS[1] + .05], T_REL - 3.0, T_REL - .5],
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
  else if (T < T_SPIN) { l1 = 'Pulsed alternator 3 · <b>opened</b>'; l2 = T < T_AX + .6 ? 'Guide rods <b>out</b>' : T < T_AX + 1.7 ? 'End bell <b>drawn</b>' : T < T_AX + 4.0 ? 'Rotor <b>drawn</b> · 4 poles' : T < T_AX + 5.2 ? 'Rotor <b>in</b>' : 'End bell <b>closing</b>'; }
  else if (T < T_BANK - .2) { rate = PREW.rate(T); l1 = 'Pulsed alternators ×4 · <b>spin-up</b>'; l2 = `Rotors <b>${Math.round(RPM * st.rate / 10) * 10} rpm</b>`; }
  else if (T < T_CUP) { const n = nCharged(T); l1 = 'Capacitor racks · <b>charging</b>'; l2 = `Bank <b>${2 * n} MJ</b> · ${n}/${NMOD} modules`; }
  else if (T < T_CRYO) {
    l1 = 'Coolant · <b>to the gun</b>';
    const d = riseD(T);
    l2 = d < 0 ? 'Riser valve <b>opening</b>' : d < RISE.L[0] ? `Power column · <b>${d.toFixed(1)} m</b>` : d < RISE.L[1] ? 'Trunnion · <b>rotary union</b>' : `Rails' manifold <b>${Math.round(100 * manFill(T))} %</b>`;
  }
  else if (T < T_CR1) {
    rate = PREW.rate(T); l1 = 'Cryocoolers ×24 · <b>coils to 20 K</b>';
    l2 = T < T_FH ? `Cold heads <b>${Math.round(st.chK)} K</b> · 2nd stage` : T < T_FR ? `Helium header · cold front <b>${Math.max(0, st.hdr - HZ0).toFixed(1)} m</b>` : `Coils <b>${nCold(T)}/${NST}</b> at 20 K`;
  }
  else if (T < T_HPU - 1.0) {
    rate = PREW.rate(T); let n = 0; for (let k = 0; k < NST; k++) if (st.coil[k] > .98) n++;
    l1 = T < T_SL ? 'Superconducting coils · <b>energising</b>' : 'Barrel · <b>section</b>';
    l2 = T < T_EN ? 'Cut away · <b>rails · sidewalls · coils</b>' : T < T_SL ? `Field <b>${(5 * st.field).toFixed(2)} T</b> · coils <b>${n}/${NST}</b>` : `Field <b>5.0 T</b> · coils <b>20 K</b>`;
  }
  else if (T < T_DLK - 2.4) { l1 = `Hydraulic power unit · <b>${st.hp > .995 ? 'charged' : st.hpuR > .02 ? 'charging' : 'starting'}</b>`; l2 = `Pressure <b>${(P_HYD * st.hp).toFixed(1)} MPa</b> · accumulators ×3`; }
  else if (T < T_LAY) {
    l1 = T < T_DLK ? 'Director · <b>acquiring</b>' : T < T_RLK - 2.6 ? 'Director <b>locked</b>' : T < T_RLK ? 'Director <b>locked</b> · radar <b>search</b>' : 'Target <b>locked</b> · radar <b>track</b>';
    l2 = `Range <b>${km(RANGE)} km</b> · bearing <b>${String(Math.round(AZ / DEG)).padStart(3, '0')}°</b> rel`;
  }
  else if (T < T_DWN) { l1 = T > T_EL1 ? 'Mount · <b>laid</b>' : 'Hydraulics · <b>laying</b>'; l2 = `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b> · <b>${(P_HYD * st.hp).toFixed(1)} MPa</b>`; }
  else if (T < T_RAIL) {
    l1 = T < T_LD ? 'Magazine · <b>12 cells</b>' : 'Loader · <b>2 m round</b>';
    l2 = T < T_DRUM ? 'X-ray · <b>down to the drum</b>' : T < T_LD ? 'Drum <b>indexing</b> · cell 01' : T < LD(.4) ? 'Cell 01 <b>latched</b>' : T < LD(2.8) ? `Hoist <b>${(st.hoistY - HOIST_B).toFixed(1)} m</b>` : T < T_XP + XH ? 'Round <b>check</b> · rod · sabot · armature'
      : T < LD(4.2) ? 'Grips <b>closed</b> · breech <b>open</b>' : T < LD(6.6) ? 'Tray <b>in line</b>' : T < LD(7.8) ? `Ramming <b>${(P_.RAM_L * st.ram).toFixed(1)} m</b>` : T < LD(9.3) ? 'Round <b>seated</b> · breech <b>closing</b>' : `Clamps <b>${nLocked(T)}/13</b> locked`;
  }
  else if (T < T_REL) { l1 = 'Pulse power · <b>armed</b>'; l2 = `Bank <b>160 MJ</b> · field <b>${(5 * st.field).toFixed(1)} T</b> · <b>${Math.round(100 * st.chg)} %</b>`; rate = simRate(T); }
  else if (T < TF) { const tau = simAt(T) + T_BORE; rate = simRate(T); l1 = `Round · <b>in the bore</b>`; l2 = `<b>${Math.round(ACC * tau)} m/s</b> · <b>${(roundZ(T) - P_.SEAT_Z).toFixed(1)}</b> / ${LB_.toFixed(1)} m`; }
  else if (T < TBU) { const s = climbS(T), v = vOfS(s); rate = climbRate(T); probeAt(s, Q4); l1 = `Probe · <b>alt ${km(Q4[1])} km</b> · range <b>${km(Math.hypot(Q4[0], Q4[2]))} km</b>`; l2 = `<b>${Math.round(v)} m/s</b> · Mach <b>${(v / C_SND(Q4[1])).toFixed(1)}</b>`; }
  else if (T < T_LEAD) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Charge <b>${Math.round(100 * E.ss(TBU, T_LEAD, T))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - T_LEAD) / LEAD))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < TRET0) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 48.4 + SH - .6) { l1 = `Scan · <b>${SITE.V.length}/${SITE.V.length} identified</b> · range <b>${km(RANGE)} km</b>`; l2 = `Ship <b>${km(V.dist(C.eye, MW))} km</b> · trail <b>fading</b>`; }
  else { l1 = 'Railgun · <b>stowing</b>'; l2 = T < SX(49.3) ? 'Coils <b>de-energising</b>' : T < SX(51.2) ? 'Director · radar <b>stowed</b>' : T < SX(54.3) ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : 'Cover <b>closing</b>'; }
  // (after the shot: the sim clock, plus what the inserts after it covered once they have played; T+ to the seam)
  const sim = T < TF - 1.6 ? TRNOW - TF_R - (PREW(TF) - PREW(T) - (TF - T)) : simAt(T) + INS.reduce((a, q) => a + (q.at > TF && TRNOW >= q.r0 + q.len ? (q.mod.span !== undefined ? q.mod.span : q.len) : 0), 0);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate < 9.5 ? rate.toFixed(1) : Math.round(rate)}</span>` : rate < .92 ? `<span class="l">×${rate < .0095 ? rate.toFixed(3) : rate < .1 ? rate.toFixed(2) : rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(sim)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
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
let NP = 0;
function render(TR, info) {
  const tr0 = performance.now(); density();
  K.beginTags();
  TRNOW = TR;
  const sg = mapIn(TR), T = sg.T, iq = sg.k >= 0 ? INS[sg.k] : null;
  const st = stateAt(T), Ws = shipW(TR);
  mountXf(Ws, st); focusAt(T);
  let xr = xrayAt(T);
  if (iq) {
    CTX.T = TR; CTX.u = sg.u; CTX.Ws = Ws; CTX.st = st; CTX.camOld = iq.at === B_PR ? PATH_O(B_PR) : camAt(iq.at);   // (the engine insert starts from the opening)
    const xi = iq.mod.xray ? iq.mod.xray(sg.u, XS, CTX) : false;
    xr = iq.mod.room ? xr : false; CTX.xray = xi;
  }
  FILM.apply(C, iq ? iq.mod.cam(sg.u, CTX) : camAt(T));
  const af = T > TF - 1.6 ? simAt(T) : -1, tb = T - TB;
  C.shake = af > 0 && af < 1 ? FILM.shake(TF + af * 3, 7 * (1 - af) * E.ss(-.001, .004, af), 24) : tb > 0 && tb < .8 ? FILM.shake(T, 3 * (1 - tb / .8), 22) : [0, 0];
  if (RSC !== 1) C.shake = [C.shake[0] * RSC, C.shake[1] * RSC];
  C.near = .1; C.update();
  RO.foc = MO.foc = 1.15 * V.dist(C.eye, C.target);
  if (PROF) pt0 = performance.now();
  K.pb.clear();
  // the mount and the room are drawn within NR of the lens (smooth: fading out over the last fifth, not cut)
  const dMW = V.dist(C.eye, MW), NR = HQ ? 3000 : 400, near = dMW < NR, nearA = SMOOTH ? 1 - E.ss(NR * .8, NR, dMW) : 1;
  if (near) occluders(T, st, Ws); else P_.occReset();
  pf('clear');
  K.drawStars(STARS, .9, TR, -.02);
  const siteOn = T > TF + 1 && T < TRET1 + 1;
  if (siteOn) SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null, SMOOTH ? E.ss(TF + 1, TF + 1.3, T) * (1 - E.ss(TRET1 + .7, TRET1 + 1, T)) : 1);
  pf('ground');
  drawSea(TR); pf('sea');
  K.setLight(V.add(V.add(V.mul(C.r, .45), V.mul(C.u, .7)), V.mul(C.f, -.55)));
  drawShip(Ws); pf('ship');
  if (near) { XS.gain = nearA; drawMount(T, st); XS.gain = 1; pf('mount'); }
  CTX.T = TR; CTX.Tb = T; CTX.Ws = Ws; CTX.st = st; RCTX.T = TR;
  if (window.RGK && RGK.drawBase) RGK.drawBase(T, CTX);                   // the heat sink under the hull (base time)
  if (iq && iq.mod.draw) { iq.mod.draw(sg.u, CTX); pf('insert'); }
  if (xr && near) { XS.gain = nearA; drawRoom(T, st, Ws); drawLoader(T, st, Ws); pf('room'); drawRoomFX(T, st, Ws); loaderFX(T, st, Ws); XS.gain = 1; pf('roomfx'); }
  if (near) { XS.gain = nearA; mechFX(T, st); XS.gain = 1; }
  if (siteOn) { K.setLight(L_SITE); SITE.drawVehicles(T > TB - 1 ? tb : null); }
  drawCharge(T, st);
  if (near) { XS.gain = nearA; drawSlice(T, st); drawBore(T, st); drawSabot(T); XS.gain = 1; }
  drawFire(T); drawProbe(T); drawBurst(T);
  if (T > TBU && siteOn) SITE.drawBolt(BOLT, tb, LEAD);
  pf('fx');
  octx.clearRect(0, 0, K.BW, K.BH);
  let fl = 0;
  if (af > 0 && af < .4) fl = .12 * Math.exp(-af * 700);
  if (tb > 0 && tb < .7) fl = Math.max(fl, .1 * Math.min(1, K.Bolt.stroke(tb)));
  if (T > TBU && T < TBU + .3) fl = Math.max(fl, .08 * Math.exp(-(T - TBU) * 12));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, K.BW, K.BH); }
  if (T > TB - 1.2 && T < TRET0 + 7.2) SITE.overlay(T, tb, 1 - E.ss(TRET0 + 4.5, TRET0 + 7, T));   // (the battery's tags stay up as the lens rises)
  if (iq) { if (iq.mod.tags) iq.mod.tags(sg.u, CTX); } else unitTags(T, st);
  shipMark(T, Ws);
  readout(T, st);
  pf('overlay');
  K.pb.blit();
  K.endTags(); pf('blit');
  K.govern(performance.now() - tr0, info);
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
  // the power room: the valves, the pumps start, alternator 3 opens and closes, the spin-up, the racks charge
  [T_VLV, whirr(300, 260, 1.3)], [T_VLV + 1.3, clack],
  [T_PMP, () => { SFX.tone(120, 980, 1.6, 'sine', .009); SFX.tone(240, 1960, 1.6, 'triangle', .004); }], [T_PMP + .2, () => SFX.noise(2.4, 1200, .5, .01, .8)],
  [T_AX - .1, clack], [T_AX, whirr(160, 220, .6)], [T_AX + .5, whirr(120, 140, 1.2)], [T_AX + 1.5, whirr(100, 120, 1.4)], [T_AX + 4.0, whirr(120, 100, 1.2)], [T_AX + 5.0, whirr(140, 120, 1.1)], [T_AX + 6.0, clunk], [T_AX + 6.5, clack],
  [T_SPIN, () => { SFX.tone(55, 420, 3.4, 'sawtooth', .016); SFX.tone(110, 840, 3.4, 'triangle', .012); }],
  [T_SPIN1, () => { SFX.tone(420, 436, 5.0, 'sawtooth', .007); SFX.tone(840, 872, 5.0, 'triangle', .006); }],
  ...[0, 1, 2, 3].map(r => [brkT(r) + .1, clack]),
  ...Array.from({ length: 10 }, (_, k) => [modT(k * 8) + .1, tick]),
  // the riser opens, the coolant climbs into the gun
  [T_RIS - .2, whirr(260, 200, 1.0)], [T_RIS, () => SFX.noise(7.5, 700, .6, .012, 1.2)], [T_RIS + 4.4, clack],
  // the cryo (x240): the compressors' hum, the cold heads' pulse, a tick as each station reaches 20 K
  [T_CRYO - .3, () => { SFX.tone(52, 52, 12.4, 'sawtooth', .008); SFX.tone(104, 98, 12.4, 'triangle', .005); }], [T_CRYO + .2, () => SFX.noise(4.0, 4200, .5, .008, 1.5)],
  [T_HF0 + 2.6, () => SFX.noise(4.2, 2600, .4, .007, 1.2)],
  ...Array.from({ length: 12 }, (_, k) => [rowT(k) + .6, () => SFX.tone(1200 + 40 * k, 1200 + 40 * k, .04, 'square', .005)]),
  // the cutaway; current into the coils (x60), a tick as each station reaches field; the slice
  [T_CUT, whirr(500, 300, 1.6)], [T_CUT1 - 1.4, whirr(300, 500, 1.4)],
  [T_EN - .2, () => SFX.tone(110, 330, 6.0, 'sine', .01)],
  ...Array.from({ length: 12 }, (_, k) => [enT(k) + .45, () => SFX.tone(560 + 70 * k, 560 + 70 * k, .05, 'square', .007)]),
  [T_SL, () => SFX.tone(900, 2600, 2.4, 'sine', .008)],
  // the hydraulic power unit: the motor, the pump's pistons, the accumulators charging, the pump unloading
  [T_HPU + .3, () => { SFX.tone(40, 120, 1.2, 'sawtooth', .014); SFX.noise(1.6, 600, .7, .02, .4); }], [T_HPU + 1.1, () => SFX.tone(180, 420, 4.4, 'triangle', .007)],
  [T_HPU + 5.5, clack], [T_HPU + 5.6, () => SFX.tone(420, 260, .5, 'sine', .006)],
  // the sensors: the director's laser, its lock; the radar's search, its lock
  [T_DLK - 1.8, whirr(260, 330, 1.6)], [T_DLK, () => { SFX.tone(1400, 1400, .07, 'square', .008); SFX.tone(1870, 1870, .07, 'square', .008); }],
  [T_RLK - 2.6, () => SFX.noise(2.4, 3000, .4, .008, .6)], [T_RLK, () => { SFX.tone(1200, 1200, .06, 'square', .008); SFX.tone(1600, 1600, .09, 'square', .008); }],
  // the lay: the spools shift, train and elevation, the cover, laid
  [T_LAY, clack], [T_TR, whirr(90, 150, 7.6)], [T_EL, whirr(110, 85, 7.6)], [T_EL, () => SFX.noise(7.2, 900, .6, .014, 1.5)],
  [T_TR + 4.4, () => SFX.tone(300, 180, .3, 'square', .01)], [T_TR + 5.1, clunk], [T_EL1, clunk], [T_EL1 + .1, tick],
  // down to the magazine, the loader
  [X_O0, () => SFX.tone(900, 2600, .9, 'sine', .012)],
  [T_DRUM, whirr(200, 160, .6)], [T_DRUM + .6, clunk], [LD(.3), clack], [LD(.4), whirr(180, 420, 2.4)], [LD(2.8), clunk],
  [LD(3.4), clack], [LD(3.4), () => SFX.tone(260, 160, .35, 'square', .008)], [LD(3.5), whirr(150, 120, .6)], [LD(4.1), clunk], [LD(4.2), whirr(150, 230, 1.1)], [LD(5.3), clunk],
  [LD(6.6), whirr(300, 800, 1.2)], [LD(7.8), clunk], [LD(7.9), whirr(700, 260, .8)], [LD(6.8), whirr(380, 160, 2.0)], [LD(8.7), whirr(230, 150, .6)], [LD(9.3), clunk],
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
const TF_R = mapOut(TF);
const FCH = CHAPTERS.map(c => ({ t: mapOut(c.t), title: c.title }))
  .concat(...INS.map(q => (q.mod.chapters || []).map(c => ({ t: q.r0 + c.t, title: c.title })))).sort((a, b) => a.t - b.t);
const FCUES = cues.map(([t, fn]) => [mapOut(t), fn]).concat(...INS.map(q => (q.mod.cues || []).map(([u, fn]) => [q.r0 + u, fn])));
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
FILM.run({ duration: DUR, chapters: FCH, render, cues: FCUES });
STAGE.dbg = () => ({ camAt, prof: PROF, log: LOG, np: NP, mz: MZ0, dir: DIR0, btop: B_TOP, s1: S1, arc: ARC.len, range: RANGE, e21: E21, stateAt, XF, XR, site: SITE, side: SIDE, hit: S_HIT, PATH_A, times: { T_REL, TF, TBU, T_LEAD, TB, TRET0, TRET1, SH, DUR0, DUR, T_BORE }, mapOut, mapIn: t => Object.assign({}, mapIn(t)), INS: INS.map(q => ({ at: q.at, r0: q.r0, len: q.len })) });
})();
