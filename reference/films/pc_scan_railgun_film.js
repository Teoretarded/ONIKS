/* SCAN · RAILGUN (Point Cloud): the game's SCAN with a source. An Arleigh Burke on station at night, an
   electromagnetic railgun mount in the Mk 45's seat on the foredeck (pc_scan_railgun_parts.js). The mount wakes: the
   hydraulic power unit starts and the accumulators charge (its cheek ghosted); the cryocoolers top the superconducting
   coils down to 20 K, frost forming on the cold heads and helium lines, and the 12 coil stations energise breech to
   muzzle, their field looping across the bore (x240, shown); the muzzle cover opens, the electro-optical director and
   the fire-control radar acquire and lock, the train drives and the elevation rams lay it; a slice opens the hull
   under it and shows the power room: the valves open and the coolant pumps start (their brushless motors' coils
   switching round with the rotors), coolant runs up the power column and down to the keel, one of the four pulsed
   alternators comes apart on its guide rods and closes again, the rotors spin up, the breakers close and the
   capacitor racks charge module by module while the cabinets count; then the loader: the drum brings the empty cell
   under the hoist (the magazine fills it), the hoist lifts the 2 m round to the tray, the breech block drops, the tray
   swings into line and the chain rammer seats it, all draw back, the block closes and the preload clamps lock breech
   to muzzle. The rails charge; it fires a probe toward the coast, the probe bursts over the headland and the lime
   lightning forks down onto a coastal battery, which the scan identifies part by part. The lens climbs away over the
   coast, back along the trail to the ship, as the mount stows. One take, loops. Render is a pure function of T. */
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
const DUR0 = 87.8;                                                    // the base take (old time)
/* the mount's wake (base time): the hydraulics come up, the cryocoolers top the coils down to 20 K and the coils
   energise breech -> muzzle (x240, shown), the cover opens, the sensors acquire and lock, it trains and elevates (x1);
   the X-ray opens the power room */
const T_HPU = 4.2, T_CRYO = 6.4, T_EN = 8.6, T_CR1 = 10.6, T_TR = 11.6, T_TR1 = 14.4, T_EL = 12.0, T_EL1 = 14.8, T_X = 15.0;
const enT = k => T_EN + .14 * k;                                      // coil station k energises
const T_BANK = 24.4, T_BANK1 = 27.8;                                  // racks charge
/* loader time -> film time: the loader holds XH s with the round at the top of the hoist (its exploded view) */
const T_LD = 29.0, XH = 1.8, LD = t => T_LD + t + (t > 1.6 ? XH : 0), T_XP = T_LD + 1.6;
const T_RAIL = LD(4.0), TF = T_RAIL + 4.8;                            // rails charge, the round leaves the muzzle
/* the clock before the shot: x240 through the cryo stretch (the coils' top-off and energising take minutes) */
const PREW = FILM.warp([{ t: 0, rate: 1 }, { t: T_CRYO - .2, rate: 1 }, { t: T_CRYO + .2, rate: 240 }, { t: T_CR1 - .2, rate: 240 }, { t: T_CR1 + .2, rate: 1 }, { t: DUR0, rate: 1 }]);
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
const TRET1 = DUR0 - 7.6;                                              // the lens reaches the ship (it leaves the site at TRET0)
const SH = 2.6 + (TRET1 - 52.4);                                      // the stow runs this much later than in the 58 s cut
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const pulse = (T, a, b) => kk(T, a, b);

/* ---------- the world: the ship on station, the coast 17 km to the north-north-east ---------- */
const S_POS = [7200, 0, 15600], PSI = Math.atan2(S_POS[0], S_POS[2]);
/* the scan walks the battery one vehicle at a time, the chain lightning leaping on from the last (tel2, sam, rdr, tel1) */
const SITE = K.makeSite({ xf: X.make(R.y(PSI), S_POS), seaR: 3100, landR: 14000, tF: [14.9, 2.9, 10.9, 6.9], chain: [2, -1, 3, 1], nearDim: .55,
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

/* ---------- the shot's clock: real time to the release, x0.01 through the bore and out of the muzzle, back to x1
   for the flight. simAt(T): sim s since the round left the muzzle (negative before) ---------- */
const V0 = 2300, V1 = 900;                                            // muzzle 2 300 m/s, 900 m/s at the burst
const LB_ = P_.SLV1 + .06 + P_.EXT - P_.SEAT_Z;                       // bore travel, seated round -> muzzle (m)
const T_BORE = 2 * LB_ / V0, ACC = V0 / T_BORE;                       // its time in the bore (uniform acceleration)
const SLO = .01, W0 = TF - 1.4;
const SIMW = FILM.warp([{ t: 0, rate: 1 }, { t: .2, rate: SLO }, { t: 2.3, rate: SLO }, { t: 4.0, rate: 1 }, { t: 40, rate: 1 }]);
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
const HPUW = FILM.warp([{ t: 0, rate: 0 }, { t: T_HPU, rate: 0 }, { t: T_HPU + .7, rate: 1 }, { t: SX(56.6), rate: 1 }, { t: SX(57.2), rate: 0 }, { t: DUR0, rate: 0 }]);
const ROTW = FILM.warp([{ t: 0, rate: 0 }, { t: 19.8, rate: 0 }, { t: 23.6, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: TF + 11, rate: 0 }, { t: DUR0, rate: 0 }]);
const ROTX = FILM.warp([{ t: 0, rate: 0 }, { t: 22.5, rate: 0 }, { t: 24.6, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: TF + 11, rate: 0 }, { t: DUR0, rate: 0 }]);
const PUMPW = FILM.warp([{ t: 0, rate: 0 }, { t: 17.2, rate: 0 }, { t: 18.4, rate: 1 }, { t: TF + 3, rate: 1 }, { t: TF + 12, rate: 0 }, { t: DUR0, rate: 0 }]);
const FANW = FILM.warp([{ t: 0, rate: 0 }, { t: 17.4, rate: 0 }, { t: 19.0, rate: 1 }, { t: TF + 3, rate: 1 }, { t: TF + 12, rate: 0 }, { t: DUR0, rate: 0 }]);
const RPM = 9600, VIS_REV = 2.4, PUMP_RPM = 2950;
const NMOD = P_.MOD.length;
const modT = k => T_BANK + .3 + (T_BANK1 - T_BANK - .3) * k / NMOD;
const modLvl = (k, T) => E.ss(modT(k), modT(k) + .3, T) * (1 - E.ss(TF, TF + .12, T));
const brkT = r => modT(r * 20) - .3;
const nCharged = T => { let n = 0; for (let k = 0; k < NMOD; k++) if (modLvl(k, T) > .98) n++; return n; };
const clampT = k => LD(3.3) + k * .05;
const T_DRUM = T_LD - .9;                                             // the drum indexes the empty cell under the hoist
const ST = { xp: 0, petal: 0, yaw: 0, el: 0, ext: 0, rec: 0, rot: 0, rate: 0, rotX: 0, rateX: 0, chg: 0, glow: 0,
  hpu: 0, hpuR: 0, acc: 0, ghS: 0, gh: 0, cryo: 0, cool: 0, frost: 0, field: 0, coil: new Float64Array(NST), eoY: 0, eoP: 0, fcY: 0, fcScan: 0, trv: 0, elv: 0,
  rod: 0, bell: 0, rtr: 0, pump: 0, pumpR: 0, fan: 0, fanR: 0, drum: 0, hoistY: 0, rnd: 0, tray: 0, brc: 0, ram: 0, ramH: 0, jaw: new Float64Array(P_.BANDS.length), valve: 0 };
const HOIST_B = P_.HY0;                                               // the round's centre in the drum (T y)
const yawAt = T => AZ * kk(T, T_TR, T_TR1) * (1 - kk(T, SX(51.4), SX(54.2)));
const elAt = T => EL * kk(T, T_EL, T_EL1) * (1 - kk(T, SX(51.2), SX(53.9)));
function stateAt(T) {
  const s = ST;
  // the hydraulic power unit starts, the accumulators charge; the starboard cheek ghosted to show them
  s.hpu = spin(HPUW, T) * 6 * TAU; s.hpuR = HPUW.rate(T);
  s.acc = E.ss(T_HPU + .2, T_HPU + 1.4, T) * (1 - E.ss(SX(56.8), SX(57.4), T));
  s.ghS = kk(T, T_HPU + .1, T_HPU + .6) * (1 - kk(T, T_CRYO - .4, T_CRYO + .1));
  // the cryocoolers top the coils down to 20 K (frost on the cold heads and the helium lines), the coils energise
  s.cryo = E.ss(T_CRYO - .2, T_CRYO + .3, T) * (1 - E.ss(SX(56.8), SX(57.4), T));
  s.cool = kk(T, T_CRYO + .2, T_EN) * (1 - kk(T, TF + 6, TF + 12));
  s.frost = .3 + .7 * kk(T, T_CRYO + .2, T_EN + .2) * (1 - kk(T, TF + 6, TF + 12));
  let f = 0;
  for (let k = 0; k < NST; k++) { const v = kk(T, enT(k), enT(k) + .5) * (1 - kk(T, SX(48.4) + .06 * k, SX(49.0) + .06 * k)); s.coil[k] = v; f += v; }
  s.field = f / NST;
  // the muzzle cover, the sensors acquire, train and elevation
  s.petal = kk(T, 10.7, 11.4) * (1 - kk(T, SX(54.3), SX(55.2)));
  s.yaw = yawAt(T); s.el = elAt(T);
  s.trv = Math.abs(yawAt(T + .03) - s.yaw) > 1e-4 ? 1 : 0; s.elv = Math.abs(elAt(T + .03) - s.el) > 1e-4 ? 1 : 0;
  const acq = kk(T, 10.8, 12.0) * (1 - kk(T, SX(50.6), SX(51.6)));
  s.eoY = acq * (AZ - s.yaw); s.eoP = -18 * DEG * (1 - acq) + .4 * DEG * acq;
  s.fcScan = kk(T, 10.9, 11.3) * (1 - kk(T, 12.2, 12.6));
  s.fcY = kk(T, 10.9, 11.6) * (1 - kk(T, SX(50.6), SX(51.6))) * (AZ - s.yaw) + s.fcScan * 24 * DEG * Math.sin((T - 10.9) * 3.4);
  // one alternator opens on its guide rods: rods out, exciter end bell off, the rotor drawn, and back
  s.rod = kk(T, 18.9, 19.4) * (1 - kk(T, 22.2, 22.6));
  s.bell = 1.2 * kk(T, 19.3, 20.1) * (1 - kk(T, 21.6, 22.3));
  s.rtr = .95 * kk(T, 19.9, 20.7) * (1 - kk(T, 21.1, 21.8));
  const a = T - TF, ar = T > TF - 1.6 ? simAt(T) + T_BORE : -1;      // sim s since the round was released
  s.rec = ar > 0 && ar < 1.6 ? .55 * (ar < .015 ? ar / .015 : Math.exp(-(ar - .015) * 4.2)) : 0;
  s.rot = spin(ROTW, T) * VIS_REV * TAU; s.rate = ROTW.rate(T);
  s.rotX = spin(ROTX, T) * VIS_REV * TAU; s.rateX = ROTX.rate(T);
  s.pump = spin(PUMPW, T) * 3 * TAU; s.pumpR = PUMPW.rate(T);
  s.fan = spin(FANW, T) * 3 * TAU; s.fanR = FANW.rate(T);
  s.valve = kk(T, 16.2, 17.3) * 1.5 * TAU;
  s.chg = E.ss(T_RAIL, T_REL - .3, T) * (1 - E.ss(T_REL - .02, T_REL + .25, T));
  s.glow = a > 0 ? Math.exp(-a * 1.2) : 0;
  // the loader: the drum brings the empty cell under the hoist (the magazine fills it), the hoist lifts the round to
  // the tray, the breech block drops, the tray swings into line, the rammer seats it, all back, the clamps lock
  s.drum = kk(T, T_DRUM, T_DRUM + .5) * (1 - kk(T, TF + 8, TF + 9));
  s.gh = kk(T, T_LD - .5, T_LD) * (1 - kk(T, LD(3.5), LD(4.1)));
  s.tray = (90 * DEG - EL) * (kk(T, LD(.1), LD(.5)) * (1 - kk(T, LD(1.7), LD(2.15))) + kk(T, LD(3.0), LD(3.35)) * (1 - kk(T, TF + 8, TF + 9)));
  const up = kk(T, LD(.3), LD(1.5)), down = kk(T, LD(2.7), LD(3.6));
  s.hoistY = HOIST_B + (P_.HY1 - HOIST_B) * up * (1 - down);
  s.rnd = T < T_LD ? 3 : T < LD(.3) ? 0 : T < LD(1.5) ? 1 : T < T_REL ? 2 : 3;   // (none) in the drum, on the hoist, in the tray / bore, fired
  s.ram = kk(T, LD(2.2), LD(2.65)) * (1 - kk(T, TF + 8, TF + 9));
  s.ramH = s.ram * (1 - kk(T, LD(2.65), LD(3.0)));
  s.xp = kk(T, T_XP + .15, T_XP + .75) * (1 - kk(T, T_XP + XH - .6, T_XP + XH - .05));     // the round's exploded view
  s.brc = kk(T, LD(1.6), LD(1.95)) * (1 - kk(T, LD(3.0), LD(3.3)));
  const un = kk(T, LD(.5), LD(.75));
  for (let k = 0; k < s.jaw.length; k++) s.jaw[k] = un * (1 - kk(T, clampT(k), clampT(k) + .12));
  return s;
}
/* the X-ray window over the power room */
const XSH = TF + 2.9;
const BOX0 = XS.box.slice();
function xrayAt(T) {
  for (let i = 0; i < 6; i++) XS.box[i] = BOX0[i];
  XS.ko = 1; XS.ks = 1;
  if (T < T_X || T > XSH + 1.2) { XS.zo = 99; XS.zs = 99; return false; }
  XS.zo = 57.6 - 17.2 * kk(T, T_X, T_X + 1.7); XS.ko = 1 - E.ss(T_X + 1.5, T_X + 2.4, T);
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
const TOUR_T = [2.9, 6.9, 10.9, 14.9];                                // the chain reaches tel2, sam, rdr, tel1 (s after the stroke)
const TRET0 = TB + TOUR_T[3] + 4.5;                                   // the lens leaves the site
PLACE_INS(TBU, TRET1 - 3);
const climbS = T => T <= TF ? 0 : T >= TBU ? S1 : simAt(T);
const climbRate = T => T <= TF - 1.6 || T >= TBU ? 1 : simRate(T);
const probeAt = (s, out) => bez(uOfD(dOfS(s)), out);
const bezT = (u, out) => { for (let k = 0; k < 3; k++) out[k] = 2 * (1 - u) * (B_C[k] - MZ0[k]) + 2 * u * (B_TOP[k] - B_C[k]); const l = Math.hypot(out[0], out[1], out[2]); out[0] /= l; out[1] /= l; out[2] /= l; return out; };
const CHAPTERS = [
  { t: 0, title: 'Station' }, { t: 4, title: 'Mount' }, { t: T_CRYO, title: 'Cryo' }, { t: T_CR1, title: 'Lay' }, { t: T_X, title: 'Power' }, { t: T_LD, title: 'Load' }, { t: T_RAIL, title: 'Charge' },
  { t: T_REL - .3, title: 'Fire' }, { t: TF + 2.4, title: 'Flight' }, { t: TBU - .2, title: 'Strike' }, { t: TB + .4, title: 'Scan' }, { t: TRET0, title: 'Return' }, { t: 48.4 + SH - .6, title: 'Stow' },
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

/* before the shot: slow drifts close on each mechanism at work, opening out for the reveals (the lens never cuts) */
const PATH_A = FILM.path([
  { t: -8, eye: [150, 55, 190], target: [0, 9, 26], fov: 32 },
  { t: -4, eye: [64, 22, 110], target: [0, 10, 44], fov: 32 },
  { t: 0, eye: [36, 14.5, 84], target: [0, 10, 48], fov: 32 },
  { t: 3.4, eye: [21, 11.2, 65], target: [1.5, 8.6, 49], fov: 34 },
  { t: 4.0, eye: [19.6, 11, 63], target: [1.9, 8.5, 49], fov: 33 },               // (the engine rooms hand back here)
  { t: 4.9, eye: [5.8, 12.6, 43.2], target: [1.9, 8.6, 45.6], fov: 40 },          // the hydraulic power unit
  { t: 5.9, eye: [5.6, 12.2, 44.8], target: [1.8, 8.6, 46.3], fov: 40 },          // the accumulators, the manifold
  { t: 6.8, eye: [4.4, 11.3, 54.4], target: [.4, 10.3, 53.6], fov: 40 },          // the cryocoolers in profile
  { t: 7.9, eye: [2.5, 11.35, 53.7], target: [.45, 10.62, 53.25], fov: 34 },        // the cold heads frosting
  { t: 8.9, eye: [3.4, 12.3, 48.4], target: [.2, 10.0, 51.2], fov: 44 },          // the coils energise
  { t: 10.3, eye: [3.8, 12.5, 55.6], target: [0, 9.9, 58.6], fov: 46 },           // ... on to the muzzle
  { t: 11.2, eye: [3.4, 12.6, 58.0], target: [.2, 10.1, 60.0], fov: 44 },         // the cover opens
  { t: 12.3, eye: [1.4, 13.0, 51.8], target: [-1.2, 11.3, 47.8], fov: 44 },       // the director acquires and locks
  { t: 13.2, eye: [4.6, 13.4, 50.2], target: [1.2, 11.6, 46.0], fov: 46 },        // the radar locks; it trains
  { t: 14.8, eye: [13.5, 10.6, 59.0], target: [1.4, 14.4, 51.8], fov: 54 },        // laid: the whole mount, from the deck
  { t: 16.2, eye: [7.0, 7.6, 37.6], target: [.6, 2.6, 42.0], fov: 44 },           // down into the power room
  { t: 17.4, eye: [.1, 3.4, 40.9], target: [.62, 1.8, 41.45], fov: 44 },          // a coolant pump starts: its motor
  { t: 18.6, eye: [.15, 3.2, 41.9], target: [.62, 1.8, 41.9], fov: 44 },          // ... the coupling, the pump
  { t: 19.4, eye: [8.6, 6.0, 49.2], target: [2.2, 2.7, 46.3], fov: 40 },          // the alternator opens
  { t: 21.6, eye: [8.9, 6.4, 48.2], target: [2.1, 2.7, 46.0], fov: 40 },
  { t: 23.2, eye: [12.8, 10.2, 40.8], target: [0, 3, 45], fov: 40 },              // spin-up
  { t: 24.2, eye: [5.4, 7.0, 46.6], target: [.3, 3.4, 52.6], fov: 42 },           // the racks charge
  { t: 24.9, eye: [2.3, 6.8, 48.6], target: [0, 3.2, 54.5], fov: 43 },
  { t: 25.8, eye: [.95, 4.7, 50.4], target: [0, 3.0, 55.4], fov: 44 },
  { t: 27.0, eye: [.7, 4.5, 51.0], target: [0, 2.9, 55.4], fov: 44 },
  { t: 28.2, eye: [.9, 3.9, 51.7], target: [-.3, 2.4, 48.3], fov: 46 },           // the drum indexes
  { t: T_LD, eye: [1.4, 5.6, 51.4], target: [-.45, 3.2, 47.6], fov: 44 },
  { t: LD(1.0), eye: [2.4, 6.7, 50.6], target: [-.45, 5.6, 47.6], fov: 44 },       // up the hoist
  { t: T_XP + .5, eye: [2.6, 7.4, 45.9], target: [-.45, 7.15, 47.6], fov: 42 },   // the round's exploded view
  { t: T_XP + XH - .4, eye: [2.4, 7.6, 46.2], target: [-.45, 7.2, 47.6], fov: 42 },
  { t: LD(2.0), eye: [3.7, 8.7, 46.6], target: [-.13, 8.08, 48.32], fov: 44 },    // the tray swings, the rammer
  { t: LD(3.0), eye: [5.2, 9.6, 45.6], target: [.2, 8.6, 48.8], fov: 42 },
  { t: LD(3.6), eye: [7.5, 11.5, 46.4], target: [.8, 10.2, 49.6], fov: 40 },       // the clamps
  { t: T_RAIL + .9, eye: [8.4, 11.8, 46.8], target: [1.0, 10.8, 50.0], fov: 42 },  // the rails charge
  { t: T_RAIL + 2.2, eye: [9.6, 14.2, 49.6], target: [2.0, 13.6, 52.6], fov: 42 },
  { t: T_RAIL + 3.4, eye: [10.4, 16.5, 52.4], target: [2.9, 16.4, 54.9], fov: 42 },
]);
const A_END = PATH_A(TF);
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

/* the scan: the lens drops out of the sky onto the battery and walks round it with the chain lightning, one vehicle
   at a time (site frame: +Z inland, the strike at (2, 13)); then it rises over the battery, landward, looking out to
   sea (the burst, the trail, the way home) */
const SXF = SITE.XF, ST_ = p => X.ap(SXF, p);
const TOUR_ORD = [1, 3, 2, 0];                                        // tel2, sam, rdr, tel1 (VEH_DEF order)
/* per vehicle: the lens arrives as the chain leaps onto it and drifts round it while the scan runs over it (a
   hold), then swings on to the next; every key is a rest (eased in and out), the swings lifted a little */
const TK = (() => {
  const keys = [], h = SITE.hitL;
  const near = (v, ang, d, up) => {
    const rx = v.x - h[0], rz = v.z - h[2], rl = Math.hypot(rx, rz), c = Math.cos(ang), sn = Math.sin(ang);
    const dx = (rx * c - rz * sn) / rl, dz = (rx * sn + rz * c) / rl, gx = v.x + dx * d, gz = v.z + dz * d;
    return [gx, Math.max(SITE.ground(gx, gz), SITE.ground(v.x, v.z)) + up, gz];
  };
  TOUR_ORD.forEach((k, i) => {
    const v = SITE.V[k], tall = v.kind === 'radar', c = V.add(v.cenW, [0, tall ? 2 : .5, 0]);
    const dA = tall ? 34 : i ? 18.5 : 24, uA = tall ? 15 : i ? 6.2 : 8.5, dB = tall ? 29 : 15, uB = tall ? 10 : 4.4;
    keys.push({ t: TB + (i ? TOUR_T[i] - .5 : 2.4), eye: ST_(near(v, -.85, dA, uA)), target: c, fov: tall ? 50 : 46, lift: 5 });
    keys.push({ t: TB + TOUR_T[i] + 2.1, eye: ST_(near(v, -.42, dB, uB)), target: c, fov: tall ? 52 : 48 });
  });
  keys.push({ t: TB + TOUR_T[3] + 3.6, eye: ST_([-36, 29 + 24, 50]), target: ST_([4, 26, 10]), fov: 50, lift: 6 });
  keys.push({ t: TRET0, eye: ST_([-10, 29 + 46, 96]), target: ST_([6, 22, 0]), fov: 52 });
  return keys;
})();
function PATH_S(T) {
  let i = 0; while (i < TK.length - 2 && TK[i + 1].t <= T) i++;
  const a = TK[i], b = TK[i + 1], u = E.ss(a.t, b.t, T), ut = b.lift ? E.ss(a.t, a.t + .6 * (b.t - a.t), T) : u;
  const eye = V.lerp(a.eye, b.eye, u); eye[1] += (b.lift || 0) * Math.sin(PI * u);
  return { eye, target: lookTurn(eye, a.target, b.target, ut), fov: E.mix(a.fov, b.fov, u) * DEG };
}
const DV0 = camB(TB - .2);
/* the drop: from the wide onto the battery, the distance falling three orders of magnitude, the view turning down
   from the stroke to the first vehicle */
function camDive(T) {
  const g = E.ss(TB - .2, TB + 2.4, T), K0 = TK[0], tgt = K0.target;
  const d0 = V.sub(DV0.eye, tgt), d1 = V.sub(K0.eye, tgt), L0 = V.len(d0), L1 = V.len(d1);
  const az0 = Math.atan2(d0[0], d0[2]), el0 = Math.asin(d0[1] / L0);
  let az1 = Math.atan2(d1[0], d1[2]); const el1 = Math.asin(d1[1] / L1);
  while (az1 - az0 > PI) az1 -= TAU; while (az1 - az0 < -PI) az1 += TAU;
  const eye = V.add(tgt, V.mul(sph(az0 + (az1 - az0) * g, E.mix(el0, el1, g)), K.logMix(L0, L1, g)));
  const target = lookTurn(eye, lookTurn(eye, DV0.target, S_HIT, E.ss(TB - .25, TB + .7, T)), tgt, E.ss(TB + .7, TB + 2.1, T));
  return { eye, target, fov: E.mix(DV0.fov, K0.fov * DEG, E.ss(TB, TB + 2.2, T)) };
}
/* the way home: from the landward side of the battery, over it and the coast, along the trail to the ship */
const E0 = PATH_A(TRET1 - DUR0);
const GA = [0, 0, 0];
function ahead(eye, T) {
  const dx = E0.eye[0] - eye[0], dz = E0.eye[2] - eye[2], h = Math.hypot(dx, dz) || 1, L = E.clamp(.25 * h, 260, 1800);
  GA[0] = eye[0] + dx / h * L; GA[1] = 0; GA[2] = eye[2] + dz / h * L;          // the ground (coast, then sea) ahead
  return lookTurn(eye, GA, E0.target, E.ss(TRET0 + 4.0, TRET1 - .8, T));
}
const seaLook = (eye, T) => lookTurn(eye, S_LOOK, ahead(eye, T), E.ss(TRET0 - 2.2, TRET0 + .6, T));
const P1 = TK[TK.length - 1].eye;
const HM = [(P1[0] + E0.eye[0]) / 2, 700, (P1[2] + E0.eye[2]) / 2], BZ = [0, 0, 0];
function homeEye(T) {
  const u = E.ss(TRET0, TRET1, T), w = u < .5 ? .5 * Math.pow(2 * u, 1.7) : 1 - .5 * Math.pow(2 - 2 * u, 2.4), a = (1 - w) * (1 - w), b = 2 * w * (1 - w), c = w * w;
  for (let k = 0; k < 3; k++) BZ[k] = a * P1[k] + b * HM[k] + c * E0.eye[k];
  return BZ;
}
function camD(T) {
  const eye = homeEye(T).slice(), v2 = E.ss(TRET0 + 3.0, TRET1 - .6, T);
  return { eye, target: seaLook(eye, T), fov: (30 + 8 * Math.sin(PI * v2) + 2 * v2 + 22 * (1 - E.ss(TRET0, TRET0 + 2.5, T))) * DEG };
}
const DBGCAM = (() => {
  let spec = STAGE.Q.get('cam');
  try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  return spec ? spec.split(',').map(Number) : null;
})();
let SHOT = null;                                                      // (pc_scan_railgun_shot.js, set below)
function camAt(T) {
  if (!DBGCAM && SHOT && SHOT.cam) { const c = SHOT.cam(T, camBase); if (c) return c; }
  return camBase(T);
}
function camBase(T) {
  if (DBGCAM) return { eye: DBGCAM.slice(0, 3), target: DBGCAM.slice(3, 6), fov: (DBGCAM[6] || 40) * DEG };
  if (T < T_REL - .7) { const s = PATH_A(T), d = FILM.drift(T, .05 * E.ss(T_X, T_X + 2, T) * (1 - E.ss(T_LD - 2, T_LD, T)), 3); s.eye = V.add(s.eye, d); return s; }
  if (T < T_REL + .1) return K.blendShot(PATH_A(T), camBore(T), E.ss(T_REL - .7, T_REL + .1, T));
  if (T < TF) return camBore(T);
  if (T < TF + .9) return camF1(T);
  if (T < TF + 2.3) return K.blendShot(camF1(T), camRig(T), E.ss(TF + .9, TF + 2.3, T));
  if (T < TF + 3.9) return camRig(T);
  if (T < TF + 6.4) return K.blendShot(camRig(T), camB(T), E.ss(TF + 3.9, TF + 6.4, T));
  if (T < TB - .2) return camB(T);
  if (T < TB + 2.4) return camDive(T);
  if (T < TRET0) return PATH_S(T);
  if (T < TRET0 + .8) return K.blendShot(PATH_S(TRET0), camD(T), E.ss(TRET0, TRET0 + .8, T));
  if (T < TRET1) return camD(T);
  return PATH_A(T - DUR0);
}

/* ---------- focus: in each beat the parts at work are drawn full, the rest sparse and dim ---------- */
const PH = [0, 16.9, 18.8, 22.6, 24.2, 27.7, T_LD - .1, T_RAIL - .3], NPH = PH.length, PW = new Float64Array(NPH);
const FKEEP = {                 // pre, pumps, explode, spin, racks, drum, loader, charge
  alt: [.7, .35, .4, 1, .4, .25, .25, .3], altX: [.7, .35, 1, 1, .4, .25, .25, .3], rack: [.7, .3, .35, .35, 1, .3, .22, .45], cab: [.7, .3, .35, .3, 1, .25, .25, .4],
  bus: [.7, .35, .4, .45, 1, .35, .3, 1], cool: [.7, 1, .5, .35, .35, .3, .3, .3], pump: [.75, 1, .45, .3, .3, .25, .25, .3], over: [.5, .35, .35, .25, .35, .3, .3, .3],
  floor: [.5, .45, .45, .3, .45, .35, .35, .35], base: [.7, .45, .45, .35, .5, .8, 1, 1], load: [.7, .4, .4, .3, .5, 1, 1, .6], ring: [.7, .4, .4, .3, .4, .2, .2, .5],
  above: [1, .8, 1, 1, .6, .3, .3, 1],
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
function occluders(T, st, Ws) {
  P_.occReset();
  const hx = (C8, Tw) => P_.occHex(C8.map(p => X.ap(Tw, p)));
  if (st.gh < .3) hx(P_.TUR_OCC[0], XF.T);
  if (Math.max(st.gh, st.ghS) < .3) hx(P_.TUR_OCC[1], XF.T);
  hx(P_.BR_OCC, XF.B);
  for (let r = 0; r < 4; r++) { const rk = P_.RACKS[r]; if (allOpen(rk.z0, rk.z1)) hx(P_.RACK_OCC[r], Ws); }
  if (allOpen(55.2, 56.3)) hx(P_.CAB_OCC, Ws);
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
function drawMount(T, st) {
  const X_ = P_.drawX, gl = st.glow, ch = st.chg, gS = Math.max(st.ghS, st.gh), gP = st.gh;
  MO.lime = 0; MO.a = 1.3; MO.md = 0; MO.S = null; MO.zfix = undefined; MO.keep = 1;
  MO.keep = FK.above; MO.a = 1.3 * (.35 + .65 * FK.above); X_(CL.baseAbove, XF.M, MO); MO.keep = 1; MO.a = 1.3;
  if (st.ghS > .02) { MO.keep = .45 * st.ghS; MO.a = .8; X_(CL.ring, XF.M, MO); MO.keep = 1; MO.a = 1.3; }
  // the gunhouse: a cheek ghosts while the lens looks inside it
  MO.keep = 1 - .86 * gS; MO.a = 1.3 * (1 - .4 * gS); X_(CL.cheekS, XF.T, MO);
  MO.keep = 1 - .86 * gP; MO.a = 1.3 * (1 - .4 * gP); X_(CL.cheekP, XF.T, MO);
  MO.keep = 1 - .5 * gS; MO.a = 1.3 * (1 - .3 * gS); X_(CL.gbody, XF.T, MO);
  // inside: the hydraulic power unit lit as it comes up (the spotlight of the wake), the cryo compressors and cabinet
  MO.keep = 1 - .6 * st.gh; MO.a = 1.5 + .4 * st.ghS; MO.lime = Math.max(.55 * lock(T, T_HPU), .35 * E.ss(T_HPU, T_HPU + .3, T) * (1 - E.ss(T_HPU + 1.4, T_HPU + 1.9, T)), .4 * st.trv * gS, .4 * st.elv * gS); X_(CL.ginH, XF.T, MO);
  MO.keep = 1 - .6 * Math.max(st.gh, st.ghS); MO.a = 1.4; MO.lime = .3 * lock(T, T_CRYO); X_(CL.ginC, XF.T, MO); MO.lime = 0; MO.a = 1.3; MO.keep = 1;
  // the train drives' pinions walk round the fixed ring gear
  if (st.ghS > .02) for (let i = 0; i < 2; i++) { const p = P_.TD_P[i]; MO.lime = .6 * st.trv; X_(CL.tpin, X.mul(XF.T, X.make(R.y(-st.yaw * P_.RING_R / P_.PIN_R + i), [p[0], .13, p[2]])), MO); }
  // the sensors: the director's yoke and head, the radar's head
  MO.lime = 0; X_(CL.eoBase, XF.T, MO); X_(CL.eoYoke, XF.eoY, MO);
  MO.lime = Math.max(.8 * lock(T, 12.0), .5 * lock(T, 14.9), .12 * E.ss(10.8, 11.2, T)); X_(CL.eoHead, XF.eoP, MO);
  MO.lime = 0; X_(CL.fcBase, XF.T, MO); MO.lime = Math.max(.8 * lock(T, 12.6), .2 * st.fcScan); X_(CL.fcHead, XF.fcY, MO);
  // the cradle and its rams
  MO.lime = Math.max(.22 * st.elv, .6 * lock(T, T_EL1)); X_(CL.cradle, XF.C, MO);
  for (const s of [-1, 1]) { const e = P_.RAM_E(s); ramDraw(XF.T, e[0], XF.C, e[1], st.elv); }
  // the barrel: structure, rails, sidewalls; the coils light station by station as they energise
  const rec = 1 - .55 * st.ghS - .3 * st.gh;                                          // (recedes behind the HPU's close-up)
  MO.keep = rec; MO.lime = Math.max(.1 * ch, .35 * gl, .45 * lock(T, T_EL1)); X_(CL.barrel, XF.B, MO); MO.keep = 1;
  if (ch > .01 || gl > .01 || (T > TS0 && T < TS1)) {                     // (inside the containment: seen only lit)
    MO.lime = Math.min(1, .9 * ch + gl); MO.a = 1.3 + .5 * ch; X_(CL.rails, XF.B, MO); MO.lime = .45 * ch; X_(CL.ins, XF.B, MO); MO.a = 1.3;
  }
  for (let k = 0; k < NST; k++) {
    const v = st.coil[k]; MO.lime = Math.min(1, .5 * v + .5 * lock(T, enT(k) + .45) + .3 * ch * v); MO.a = 1.35 + .35 * v;
    X_(CL.coil, X.mul(XF.B, STL[k]), MO);
  }
  MO.a = 1.3; MO.lime = .32 * st.cryo * (1 - .6 * st.field); X_(CL.cryo, XF.B, MO); MO.lime = 0;
  for (let k = 0; k < P_.BANDS.length; k++) {
    const z = P_.BANDS[k], o = .05 * st.jaw[k];
    MO.lime = Math.max(.9 * lock(T, clampT(k) + .12), .25 * ch, .4 * gl);
    X_(CL.jawS, X.mul(XF.B, tr(o, 0, z)), MO); X_(CL.jawP, X.mul(XF.B, tr(-o, 0, z)), MO);
  }
  MO.lime = Math.max(.8 * lock(T, LD(1.95)), .8 * lock(T, LD(3.3)), .15 * ch); X_(CL.breech, X.mul(XF.B, tr(0, -.86 * st.brc, 0)), MO);
  MO.lime = .7 * lock(T, 11.4); X_(CL.petalT, XF.petT, MO); X_(CL.petalB, XF.petB, MO);
  MO.lime = 0; MO.a = 1.3;
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
  const Lh = X.mul(XR.C, tr(0, 0, P_.TRAY_Z - P_.RND_H - .02 + P_.RAM_L * st.ramH)); RO.S = Lh; RO.lime = st.ramH > .005 ? .7 : 0; X_(CL.rhead, X.mul(Ws, Lh), RO);
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
  RO.keep = FK.cool; RO.a = 1.5 * dimk(FK.cool); RO.lime = .3 * E.ss(16.6, 17.4, T) * (1 - E.ss(XSH - 1, XSH, T)); X_(CL.cool, Ws, RO);
  RO.keep = FK.bus; RO.a = 1.5 * dimk(FK.bus); RO.lime = .4 * E.ss(T_BANK - .6, T_BANK, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.bus, Ws, RO);
  RO.keep = FK.base; RO.a = 1.5 * dimk(FK.base); RO.S = M_S; RO.zfix = P_.GZ; RO.lime = .3 * E.ss(T_RAIL - .4, T_RAIL + .6, T) * (1 - E.ss(TF, TF + .3, T)); X_(CL.baseBelow, XF.M, RO);
  RO.keep = FK.ring; RO.a = 1.5 * dimk(FK.ring); X_(CL.roller, XF.M, RO); RO.zfix = undefined;
  // the coolant pumps: housing, inverter, volute; the stator's wound teeth; the rotor, coupling and impeller turning
  for (let i = 0; i < 2; i++) {
    const L = PUMP_L[i], Lw = X.mul(Ws, L);
    const pr = st.pumpR;                                                 // (running: the housing and the iron recede, the coils carry the light)
    RO.keep = FK.pump; RO.a = (1.5 - .55 * pr) * dimk(FK.pump); RO.S = L; RO.lime = .5 * lock(T, 17.2 + .15 * i); X_(CL.pump, Lw, RO);
    RO.a = (.95 - .35 * pr) * dimk(FK.pump); RO.lime = 0; X_(CL.pstat, Lw, RO);
    const sg = i ? -1 : 1, rot = st.pump * sg + i;
    for (let k = 0; k < P_.PST; k++) {                                  // the coils, switched round with the rotor
      const a = (k + .5) / P_.PST * TAU, ph = Math.cos(4 * (a - rot) * sg), on = st.pumpR * E.clamp((ph - .2) / .5, 0, 1);
      const Lk = X.mul(L, PCOIL_R[k]); RO.S = Lk; RO.lime = on; RO.a = (.9 + 1.1 * on) * dimk(FK.pump); X_(CL.pcoil, X.mul(Ws, Lk), RO);
    }
    const Lr = X.mul(L, X.make(R.z(rot), [0, 0, 0])); RO.S = Lr; RO.lime = 0; RO.a = (1.15 - .45 * pr) * dimk(FK.pump); X_(CL.prot, X.mul(Ws, Lr), RO);
  }
  // valve handwheels, fans
  RO.lime = 0; RO.keep = FK.cool; RO.a = 1.5 * dimk(FK.cool);
  P_.VALVES.forEach((v, i) => { const L = X.make(R.y(-st.valve * (T > 16.2 + .15 * i ? 1 : 0) - i), v); RO.S = L; RO.lime = .7 * lock(T, 17.3 + .1 * i); X_(CL.wheel, X.mul(Ws, L), RO); });
  RO.lime = 0;
  P_.FANS.forEach((f, i) => { const L = X.make(R.z(st.fan * (i ? -1 : 1) + i), f); RO.S = L; X_(CL.fanB, X.mul(Ws, L), RO); });
  // alternators: body, the outer end bell + exciter + fan, the rotor
  for (let k = 0; k < 4; k++) {
    const L = ALT_L[k], xk = k === P_.XALT;
    RO.keep = xk ? FK.altX : FK.alt; RO.a = 1.5 * dimk(RO.keep);
    const Lb = xk ? XR.xexc : L, Lr0 = xk ? XR.xrot : L;
    const rot = (xk ? st.rotX : st.rot) * (k % 2 ? -1 : 1) + k, rate = xk ? st.rateX : st.rate;
    RO.lime = .5 * lock(T, 22.6) * (xk ? 1 : 0); RO.S = L; X_(CL.body, X.mul(Ws, L), RO);
    RO.lime = xk ? Math.max(.35 * Math.min(1, st.bell * 2), .6 * lock(T, 22.3)) : 0;
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
  const fl = Math.max(lock(T, 18.7), lock(T, 22.6));
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
  flow(P_.COOL_SUP, Ws, ID, T, 1.4, .26, 1, WH, A, 0);
  for (const pl of P_.COOL_COL) flow(pl, Ws, ID, T * (pl === P_.COOL_COL[0] ? 1 : -1), 1.4, .26, 1, WH, A, 0);
  flow(P_.COOL_RET, Ws, ID, T, 1.4, .26, 2, HOT, A, .25);
  for (const pl of P_.COOL_COLD) flow(pl, Ws, ID, T, 1.4, .26, 1, WH, A, 0);
  for (const pl of P_.COOL_PD) flow(pl, Ws, ID, T, 1.6, .22, 1, WH, A, 0);
}
/* the cabinets: three status rows each (power, activity, the bank's charge as a bar), breaker arcs */
function cabinetFX(T, st, Ws) {
  if (!allOpen(55.2, 56.3)) return;
  const on = E.ss(16.4, 16.7, T) * (1 - E.ss(TF + 12, TF + 13, T)), bank = nCharged(T) / NMOD, busy = E.ss(T_BANK - .5, T_BANK, T) * (1 - E.ss(TF + .5, TF + 1.5, T));
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
    apI(L, .142, .32, .27, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .9 * E.ss(17.0, 17.2, T)); P_.oglow(Q1[0], Q1[1], Q1[2], 6, LIME, .4 * E.ss(17.0, 17.2, T));
    for (let j = 0; j < 40; j++) { const a = j / 40 * TAU - rot * 1.3, rr = .2 + .1 * K.hh(j, 3.1); apI(L, Math.cos(a) * rr, Math.sin(a) * rr, 1.22, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, WH, .45 * r * (.4 + .6 * K.hh(j, 7.7))); }
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
  const cl = Math.max(lock(T, LD(.3)), lock(T, T_DRUM + .5));
  if (cl > .02) { apI(Ws, P_.MAG_CELL.p[0], P_.FL + .15, P_.MAG_CELL.p[2], Q1); K.ringW(Q1, [1, 0, 0], [0, 0, 1], .2 + .1 * (1 - cl), 48, 1, LIME, cl, 0); P_.oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .5 * cl); }
  // the hoist's chain while it runs
  if (T > LD(.3) && T < LD(3.6) && (T < LD(1.5) || T > LD(2.7))) {
    const dir = T < LD(1.5) ? 1 : -1, ph = ((T * 3.6 * dir) % .16 + .16) % .16, y0 = P_.HY0 - 1.1, y1 = P_.HY1 + 1.15;
    for (let y = y0 + ph; y < y1; y += .16) for (const dz of [.07, .27]) { apI(XF.T, 0, y, P_.HZ + dz, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .6); }
  }
  // the tray's grips close on the round
  const gp = lock(T, LD(1.6));
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
  if (st.rnd === 1 || (st.rnd === 2 && T < LD(2.9))) {
    const Lr = st.rnd === 1 ? X.mul(XF.T, X.make(ROT_UP, [0, st.hoistY, P_.HZ])) : st.ram > 0 ? X.mul(XF.B, tr(0, 0, P_.TRAY_Z + P_.RAM_L * st.ram)) : XF.tray;
    const U = X.dir(Lr, [1, 0, 0]), W = X.dir(Lr, [0, 1, 0]);
    for (const z of [-1.0, -.62, .48, 1.0]) { apI(Lr, 0, 0, z, Q1); K.ringW(Q1, U, W, z < -.7 || z > .9 ? .05 : .16, 40, 1, LIME, .8, T * 4); }
    apI(Lr, 0, 0, 1.0, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 18, LIME, .45);
  }
  // the breech seal as the block reaches home
  const bs = lock(T, LD(3.3));
  if (bs > .02) { apI(XF.B, 0, 0, -2.44, Q1); K.ringW(Q1, X.dir(XF.B, [1, 0, 0]), X.dir(XF.B, [0, 1, 0]), .2 + .3 * (1 - bs), 60, 1, LIME, bs, 0); }
}

/* ---------- the mount's FX: hydraulics, cryogenics, the field, sensors, currents ---------- */
/* oil to the rams and the train motors while they move, into the accumulators as they charge; the accumulators'
   oil level; the HPU's motor turning */
function hydFX(T, st) {
  const gS = Math.max(st.ghS, st.gh), A = .4 + .6 * gS;
  const ch = E.ss(T_HPU + .2, T_HPU + .4, T) * (1 - E.ss(T_HPU + 1.3, T_HPU + 1.5, T));
  if (st.elv) for (let i = 0; i < 2; i++) flow(P_.HYD[i], XF.T, null, T, 2.2, .1, 1, LIME, .8 * A, .15);
  if (st.trv) for (let i = 2; i < 4; i++) flow(P_.HYD[i], XF.T, null, T, 2.2, .1, 1, LIME, .8 * A, .15);
  if (gS < .05) return;
  for (const a of P_.HPU.acc) {
    const h = .42 + .95 * st.acc;
    for (let j = 0; j < 36; j++) { const b = j / 36 * TAU; apI(XF.T, a[0] + Math.cos(b) * .14, a[1] + h, a[2] + Math.sin(b) * .14, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .95 * gS); }
    for (let y = .45; y < h; y += .06) { apI(XF.T, a[0], a[1] + y, a[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .5 * gS); }
    if (ch > .01) for (let y = .06; y < .42; y += .05) { apI(XF.T, a[0] - .15 + ((T * 2.5 + y) % .3), a[1] + .1, a[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, ch * gS); }
  }
  if (st.hpuR > .02) { const m = P_.HPU.mot; for (let k = 0; k < 6; k++) { const b = st.hpu + k / 6 * TAU; for (let j = 1; j < 6; j++) { apI(XF.T, m[0] + Math.cos(b) * .035 * j, m[1] + Math.sin(b) * .035 * j, m[2] - .01, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, j > 3 ? HOT : LIME, .7 * st.hpuR * gS); } } }
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
const FLD_N = 96, FLD = (() => {                      // loop j, family f: points in the station's x-y plane (unit)
  const A = new Float32Array(3 * 2 * FLD_N * 2);
  for (let j = 0; j < 3; j++) for (let f = 0; f < 2; f++) for (let i = 0; i < FLD_N; i++) {
    const t = i / FLD_N * TAU, a = .78 + .2 * j, b = .52 + .26 * j, c = .025 + .02 * j, sn = Math.sin(t);
    const x = a * Math.cos(t), y = (sn > 0 ? b * sn : c * sn) * (f ? -1 : 1);
    const o = ((j * 2 + f) * FLD_N + i) * 2; A[o] = x; A[o + 1] = y;
  }
  return A;
})();
function fieldFX(T, st) {
  const ch = st.chg, B = XF.B;
  for (let k = 0; k < NST; k++) {
    const v = st.coil[k]; if (v < .02) continue;
    const g = .55 + .45 * v + .18 * ch, z = P_.STN[k], br = Math.min(.85, (.55 + .4 * ch) * v);
    for (let j = 0; j < 3; j++) for (let f = 0; f < 2; f++) {
      const o0 = (j * 2 + f) * FLD_N, ph = (T * .45 + k * .13 + j * .3) % 1, a = br * (1 - .22 * j);
      for (let i = 0; i < FLD_N; i++) {
        const o = (o0 + i) * 2, u = i / FLD_N, d = Math.abs(u - ph), hot = d < .03 || d > .97;
        apI(B, FLD[o] * g, FLD[o + 1] * g, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], hot ? 2 : 1, hot ? HOT : LIME, hot ? Math.min(1, a * 2.6) : a);
      }
    }
  }
}
/* the sensors: the director's laser ranging and its lock, the radar's search fan then its track beam, the muzzle
   velocity radar's beam along the bore */
function sensorFX(T, st) {
  const L = XF.eoP;
  const on = E.ss(10.8, 11.2, T) * (1 - E.ss(SX(51), SX(51.6), T));
  if (on > .01) for (const w of P_.EO_WIN) { apI(L, w[0], w[1], w[2] + .005, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .7 * on); }
  for (const t0 of [12.15, 13.4, 14.9]) {
    const a = T - t0; if (a < 0 || a > .5) continue;
    const w = P_.EO_WIN[2]; apI(L, w[0], w[1], w[2], Q1); apI(L, w[0], w[1], w[2] + 6 + 160 * a, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2, 1, HOT, .9 * (1 - a / .5), LIME, .2, .05);
  }
  const lk = lock(T, 12.0);
  if (lk > .02) { apI(L, 0, 0, 0, Q1); if (K.pj(Q1[0], Q1[1], Q1[2])) { const x = K.PJ[0], y = K.PJ[1], r = 26 + 30 * (1 - lk); K.bracket([x - r, y - r, x + r, y + r], '#C6F432', lk, 8, 1.4); } }
  // the radar: a fan of three beams sweeping while it searches, one steady beam (pulses running out) once it tracks
  const F = XF.fcY, A = P_.FC_A, srch = st.fcScan, trk = E.ss(12.4, 12.7, T) * (1 - E.ss(SX(50.6), SX(51), T));
  if (srch > .01 || trk > .01) {
    apI(F, A.T[0], A.T[1], A.T[2], Q1);
    const dz = X.dir(F, R.ap(A.R, [0, 0, 1])), dx = X.dir(F, R.ap(A.R, [1, 0, 0]));
    if (srch > .01) for (const k of [-1, 0, 1]) { const s = .07 * k; Q2[0] = Q1[0] + (dz[0] + dx[0] * s) * 30; Q2[1] = Q1[1] + (dz[1] + dx[1] * s) * 30; Q2[2] = Q1[2] + (dz[2] + dx[2] * s) * 30; K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 3, 1, LIME, .35 * srch * (k ? .6 : 1)); }
    if (trk > .01) for (let i = 0; i < 12; i++) { const d = ((T * 14 + i * 2.5) % 30) + .6; P_.odot(Q1[0] + dz[0] * d, Q1[1] + dz[1] * d, Q1[2] + dz[2] * d, 2, LIME, .8 * trk * (1 - d / 32)); }
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
  const P = P_.FROST.pts, f = st.frost; if (!P || f < .02) return;
  const B = XF.B, n = P.length / 6, fr = Math.floor(T * 10);
  apI(B, 0, .5, 4, Q1); const d = V.dist(C.eye, Q1), step = d < 12 ? 1 : d < 30 ? 2 : 4;
  for (let i = 0; i < n; i += step) {
    const h = K.hh(i, 1.7); if (h > f) continue;
    const o = i * 6; apI(B, P[o], P[o + 1], P[o + 2], Q1);
    const g = K.hh(i, fr) > .992, h2 = K.hh(i, 5.3);
    P_.odot(Q1[0], Q1[1], Q1[2], g || h2 > .5 ? 2 : 1, g ? HOT : WH, g ? 1 : (.65 + .35 * h2) * Math.min(1, (f - h) * 6));
  }
}
function mechFX(T, st) {
  frostFX(T, st); hydFX(T, st); cryoFX(T, st); fieldFX(T, st); sensorFX(T, st); mountFlow(T, st); straps(T, st);
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
const TS0 = T_RAIL + .35, TS1 = T_RAIL + 3.1;
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
SHOT = window.RGF_INIT({ ACC, ARC, BOLT, B_C, B_TOP, C, CL, DEG, DIR0, E, EM, EOFF, HANG, HDIR, HOT, K, LB_, LEAD, LIME, MO, MW, MZ0, NUP, P3, PATH_A, PI, P_, Q1, Q2, Q3, R, S1, SIDE, SITE, S_HIT, TAU, TB, TBU, TF, TG, TM, TOUR_T, TRET0, TRET1, T_BORE, T_LEAD, T_RAIL, T_REL, V, V0, V1, WH, X, XF, apI, bez, bezT, camBase, climbRate, climbS, dOfS, drawRound, filmAt, kk, lock, lookMix, lookTurn, probeAt, rng, roundZ, sOfD, shipW, simAt, simRate, stateAt, tr, uOfD, vOfS });
const { drawBore, drawSabot, drawFire, drawProbe, drawBurst } = SHOT;
function drawSea(T) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const S = SEA.F, TL = SEA.TL, ph = T * TAU / PER(6), sw = T * TAU / PER(12);
  for (let t = 0; t < SEA.nt; t++) {
    const q = t * 6; if (!K.wIn(TL[q + 2], 0, TL[q + 4], TL[q + 5] + 2)) continue;
    const zt = K.WZ[0], dsp = 400 / Math.sqrt(TL[q + 1] - TL[q]) * F / Math.max(1, zt);
    const s0 = 2.3 / Math.sqrt(K.DQ), step = dsp >= s0 ? 1 : Math.min(40, Math.round(s0 * s0 / (dsp * dsp)));
    const rf = 1 - E.ss(16000, 29000, Math.hypot(TL[q + 2], TL[q + 4]));
    for (let k = TL[q] + ((t * 5) % step), k1 = TL[q + 1]; k < k1; k += step) {
      const j = k * 4, x = S[j], z = S[j + 1], y = .2 * Math.sin(S[j + 3] + ph) + .45 * Math.sin(sw + z * .011 + x * .004);
      const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 2) continue;
      const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= 1920) continue;
      const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= 1080) continue;
      if (P_.occd(sx, sy, zc)) continue;
      const b = 1.7 * S[j + 2] * (zc < 3000 ? 1 - zc / 7000 : .57 + .5 * E.ss(3000, 12000, zc)) * rf * (step > 1 ? 1.3 : 1);
      K.dot(sx, sy, zc < 50 ? 2 : 1, 236, 238, 232, b);
    }
  }
}

/* ---------- tags and readout ---------- */
const ZST = k => P_.STN[k];
const nLocked = T => { let n = 0; for (let k = 0; k < P_.BANDS.length; k++) if (T > clampT(k) + .12) n++; return n; };
const UT = [
  ['MNT', 'Railgun mount', st => '12.7 m rails', 'T', [0, 3.3, -1.0], 4.15, 4.9],
  ['HPU', 'Hydraulic power unit', st => `${Math.round(21 * st.acc)} MPa`, 'T', [1.85, 1.62, -3.9], 4.5, 6.1],
  ['ACC', 'Accumulators ×3', st => '', 'T', [2.32, 1.5, -2.35], 4.8, 6.2],
  ['VLV', 'Valve manifold · 4 spools', st => '', 'T', [1.6, .9, -2.0], 5.1, 6.2],
  ['CRC', 'Cryocoolers ×24 · pulse tube', st => `${(40 - 20 * st.cool).toFixed(0)} K`, 'B', [.5, .78, ZST(4) - .14], 6.6, 8.6],
  ['HEL', 'Helium lines', st => '', 'B', [.17, .5, ZST(5) + .3], 7.0, 8.4],
  ['FRS', 'Frost', st => '', 'B', [.55, .5, ZST(5) - .14], 7.5, 8.6],
  ['COIL', 'Superconducting coils ×24 · REBCO', st => `${(5 * st.field).toFixed(1)} T`, 'B', [.62, .25, ZST(7)], 9.1, 10.5],
  ['CRY', 'Cryostats · vacuum', st => '20 K', 'B', [.62, -.3, ZST(9)], 9.5, 10.5],
  ['CLMP', 'Preload clamps ×13', st => '', 'B', [.56, .46, P_.BANDS[10] + .05], 9.8, 10.6],
  ['MZC', 'Muzzle cover', st => '', 'B', [.5, .5, P_.SLV1], 10.8, 11.8],
  ['EOIR', 'Electro-optical / infrared director', st => 'TV · IR · laser', 'eoP', [0, .16, .2], 11.0, 13.2],
  ['FCR', 'Fire-control radar · X band', st => st.fcScan > .5 ? 'search' : 'track', 'fcY', [0, .62, .1], 11.3, 13.4],
  ['ELR', 'Elevation rams ×2', st => `${Math.round(st.el / DEG)}°`, 'C', [.9, -.4, 1.2], 12.4, 14.7],
  ['TRD', 'Train drives ×2 · ring gear', st => `${Math.round(st.yaw / DEG)}°`, 'T', [2.0, .55, 1.15], 12.8, 14.7],
  ['MVR', 'Muzzle velocity radar · Doppler', st => '', 'C', [0, 1.14, 2.86], 13.6, 15.0],
  ['PMP', 'Coolant pump · brushless DC motor', st => `${Math.round(PUMP_RPM * st.pumpR / 10) * 10} rpm`, 'P0', [0, .45, .4], 17.0, 18.8],
  ['STA', 'Stator · 12 wound teeth', st => '', 'P0', [-.2, -.08, .36], 17.4, 18.8],
  ['PMR', 'Permanent-magnet rotor', st => '', 'P0', [.1, -.1, .5], 17.6, 18.8],
  ['IMP', 'Impeller', st => '', 'P0', [.2, -.1, 1.22], 17.8, 18.8],
  ['SEA', 'Coolant out to the keel heat exchangers', st => '', 'W', [0, 1.1, 40.95], 18.0, 19.0],
  ['EXC', 'Exciter · end bell', st => '', 'XEXC', [0, .5, 1.3], 19.7, 21.4],
  ['ROT', 'Rotor · 4 poles', st => '', 'XROT', [0, .8, .3], 20.5, 21.6],
  ['ALT', 'Pulsed alternators ×4', st => `${Math.round(RPM * st.rate / 10) * 10} rpm`, 'W', [3.2, 3.9, 45.0], 23.0, 24.8],
  ['CAP', 'Capacitor racks ×4 · 80 modules', st => `${2 * nCharged(ST_T)} MJ`, 'W', [-1.95, 3.6, 53.6], 24.6, 27.8],
  ['PCU', 'Power conditioning ×5', st => '', 'W', [-1.84, 3.85, 55.35], 25.2, 27.8],
  ['MAG', 'Magazine drum · 12 cells', st => '', 'W', [1.3, 3.0, 48.3], T_DRUM - .1, LD(.4)],
  ['HST', 'Hoist', st => `${(st.hoistY - HOIST_B).toFixed(1)} m`, 'T', [.24, -2.4, P_.HZ], LD(.3), LD(1.55)],
  ['PRB', 'Probe · long rod', st => '2.0 m', 'RND', [.05, 0, .8], T_XP + .5, T_XP + XH - .3],
  ['SAB', 'Sabot ×3', st => '', 'RND', [.3, 0, 0], T_XP + .7, T_XP + XH - .3],
  ['ARM', 'Armature', st => '', 'RND', [.1, -.14, -.72], T_XP + .9, T_XP + XH - .3],
  ['TRY', 'Loading tray', st => '', 'tray', [.19, .1, .6], LD(1.62), LD(2.4)],
  ['BRC', 'Breech block', st => '', 'B', [.46, .5, -2.7], LD(1.65), LD(3.3)],
  ['RMR', 'Chain rammer · 2.4 m', st => '', 'C', [.17, .16, -4.9], LD(2.15), LD(3.0)],
  ['CLP', 'Preload clamps ×13', st => `${nLocked(ST_T)}/13`, 'B', [.56, .46, P_.BANDS[3] + .05], LD(3.3), LD(4.0) + .4],
  ['RLS', 'Rails ×2 · copper', st => '', 'B', [.1, .24, 1.2], TS0 + .45, TS1 - .1],
  ['INS', 'Insulating sidewalls', st => '', 'B', [.2, -.08, 2.6], TS0 + .8, TS1 - .1],
  ['CNT', 'Containment · composite', st => '', 'B', [.36, .3, 3.8], TS0 + 1.15, TS1 - .1],
  ['BUS', 'Rail feed · bus straps', st => '4.2 MA peak', 'B', [.3, .3, -.6], T_RAIL + .3, T_RAIL + 2.4],
  ['MZL', 'Muzzle', st => `${Math.round(100 * st.chg)} %`, 'E', [.5, .5, P_.SLV1], T_RAIL + 2.6, TF - .1],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
let ST_T = 0;
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
function readout(T, st) {
  const ci = FCH.reduce((a, c, i) => c.t <= TRNOW ? i : a, 0);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${FCH[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2, rate = 1;
  const iq = SEG.k >= 0 ? INS[SEG.k] : null;
  if (iq) { const r = iq.mod.readout ? iq.mod.readout(SEG.u, CTX) : {}; l1 = r.l1 || ''; l2 = r.l2 || ''; rate = r.rate || 1; }
  else if (T < T_HPU || T > SX(56.8)) { l1 = 'DDG-51 · <b>on station</b>'; l2 = 'Railgun <b>stowed</b> · coils <b>40 K</b>'; }
  else if (T < T_CRYO) { l1 = 'Railgun · <b>waking</b>'; l2 = `Hydraulics <b>${Math.round(21 * st.acc)} MPa</b> · accumulators ×3`; }
  else if (T < T_CR1) {
    rate = PREW.rate(T); l1 = 'Cryocoolers · <b>coils to 20 K</b>';
    let n = 0; for (let k = 0; k < NST; k++) if (st.coil[k] > .98) n++;
    l2 = T < T_EN ? `Coils <b>${(40 - 20 * st.cool).toFixed(1)} K</b> · helium <b>2.1 MPa</b>` : `Field <b>${(5 * st.field).toFixed(2)} T</b> · coils <b>${n}/${NST}</b>`;
  }
  else if (T < T_X) {
    l1 = T < 12.0 ? 'Director · <b>acquiring</b>' : T < 12.6 ? 'Director <b>locked</b> · radar <b>search</b>' : 'Target <b>locked</b> · radar <b>track</b>';
    l2 = T > T_EL1 ? `<b>Laid</b> · train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>`;
  }
  else if (T < 17.0) { l1 = 'Power room · <b>coolant loop</b>'; l2 = T < 16.2 ? 'X-ray <b>opening</b>' : 'Valves <b>opening</b>'; }
  else if (T < 18.8) { l1 = 'Coolant pumps · <b>brushless DC</b>'; l2 = `<b>${Math.round(PUMP_RPM * st.pumpR / 10) * 10} rpm</b> · <b>${Math.round(1500 * st.pumpR)} L/min</b> each`; }
  else if (T < 22.6) { l1 = 'Pulsed alternator 3 · <b>opened</b>'; l2 = T < 20.1 ? 'End bell <b>drawn</b>' : T < 21.6 ? 'Rotor <b>drawn</b>' : 'End bell <b>closing</b>'; }
  else if (T < T_BANK - .2) { l1 = 'Power · <b>pulsed alternators</b>'; l2 = `Rotors <b>${Math.round(RPM * st.rate / 10) * 10} rpm</b>`; }
  else if (T < T_DRUM) { const n = nCharged(T); l1 = 'Capacitor racks · <b>charging</b>'; l2 = `Bank <b>${2 * n} MJ</b> · ${n}/${NMOD} modules`; }
  else if (T < T_RAIL) {
    l1 = 'Loader · <b>2 m round</b>';
    l2 = T < T_LD ? 'Drum <b>indexing</b> · cell 01' : T < LD(.3) ? 'Cell 01 <b>latched</b>' : T < LD(1.5) ? `Hoist <b>${(st.hoistY - HOIST_B).toFixed(1)} m</b>` : T < T_XP + XH ? 'Round <b>check</b> · rod · sabot · armature'
      : T < LD(2.2) ? 'Breech <b>open</b> · tray <b>in line</b>' : T < LD(2.65) ? `Ramming <b>${(P_.RAM_L * st.ram).toFixed(1)} m</b>` : T < LD(3.3) ? 'Round <b>seated</b> · breech <b>closing</b>' : `Clamps <b>${nLocked(T)}/13</b> locked`;
  }
  else if (T < T_REL) { l1 = 'Pulse power · <b>armed</b>'; l2 = `Bank <b>160 MJ</b> · field <b>${(5 * st.field).toFixed(1)} T</b> · <b>${Math.round(100 * st.chg)} %</b>`; rate = simRate(T); }
  else if (T < TF) { const tau = simAt(T) + T_BORE; rate = simRate(T); l1 = `Round · <b>in the bore</b>`; l2 = `<b>${Math.round(ACC * tau)} m/s</b> · <b>${(roundZ(T) - P_.SEAT_Z).toFixed(1)}</b> / ${LB_.toFixed(1)} m`; }
  else if (T < TBU) { const s = climbS(T); rate = climbRate(T); probeAt(s, Q4); l1 = `Probe · <b>alt ${km(Q4[1])} km</b>`; l2 = `<b>${Math.round(vOfS(s))} m/s</b> · range <b>${km(Math.hypot(Q4[0], Q4[2]))} km</b>`; }
  else if (T < T_LEAD) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Charge <b>${Math.round(100 * E.ss(TBU, T_LEAD, T))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - T_LEAD) / LEAD))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 48.4 + SH - .6) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else { l1 = 'Railgun · <b>stowing</b>'; l2 = T < SX(49.3) ? 'Coils <b>de-energising</b>' : T < SX(51.2) ? 'Director · radar <b>stowed</b>' : T < SX(54.3) ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : 'Cover <b>closing</b>'; }
  const sim = T < TF - 1.6 ? TRNOW - TF_R - (PREW(TF) - PREW(T) - (TF - T)) : T < TBU ? simAt(T) : S1 + (T - TBU);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate < 9.5 ? rate.toFixed(1) : Math.round(rate)}</span>` : rate < .92 ? `<span class="l">×${rate < .1 ? rate.toFixed(2) : rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(T > 48.4 + SH - .6 ? T - DUR0 - PREW(TF) : sim)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}
function unitTags(T, st) {
  ST_T = T;
  for (const t of UT) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const fr = t.fr === 'W' ? XF.W : XF[t.fr]; if (!fr) continue;
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
function render(TR, info) {
  const tr0 = performance.now(); density();
  K.beginTags();
  TRNOW = TR;
  const sg = mapIn(TR), T = sg.T, iq = sg.k >= 0 ? INS[sg.k] : null;
  const st = stateAt(T), Ws = shipW(TR);
  mountXf(Ws, st); focusAt(T);
  let xr = xrayAt(T);
  if (iq) {
    CTX.T = TR; CTX.u = sg.u; CTX.Ws = Ws; CTX.st = st; CTX.camOld = camAt(iq.at);
    const xi = iq.mod.xray ? iq.mod.xray(sg.u, XS, CTX) : false;
    xr = iq.mod.room ? xr : false; CTX.xray = xi;
  }
  FILM.apply(C, iq ? iq.mod.cam(sg.u, CTX) : camAt(T));
  const af = T > TF - 1.6 ? simAt(T) : -1, tb = T - TB;
  C.shake = af > 0 && af < 1 ? FILM.shake(TF + af * 3, 7 * (1 - af) * E.ss(-.001, .004, af), 24) : tb > 0 && tb < .8 ? FILM.shake(T, 3 * (1 - tb / .8), 22) : [0, 0];
  C.near = .1; C.update();
  RO.foc = MO.foc = 1.15 * V.dist(C.eye, C.target);
  if (PROF) pt0 = performance.now();
  K.pb.clear();
  const near = V.dist(C.eye, MW) < 400;
  if (near) occluders(T, st, Ws); else P_.occReset();
  pf('clear');
  K.drawStars(STARS, .9, TR, -.02);
  const siteOn = T > TF + 1 && T < TRET1 + 1;
  if (siteOn) SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null);
  pf('ground');
  drawSea(TR); pf('sea');
  K.setLight(V.add(V.add(V.mul(C.r, .45), V.mul(C.u, .7)), V.mul(C.f, -.55)));
  drawShip(Ws); pf('ship');
  if (near) { drawMount(T, st); pf('mount'); }
  CTX.T = TR; CTX.Tb = T; CTX.Ws = Ws; CTX.st = st; RCTX.T = TR;
  if (window.RGK && RGK.drawBase) RGK.drawBase(T, CTX);                   // the heat sink under the hull (base time)
  if (iq && iq.mod.draw) { iq.mod.draw(sg.u, CTX); pf('insert'); }
  if (xr && near) { drawRoom(T, st, Ws); drawLoader(T, st, Ws); pf('room'); drawRoomFX(T, st, Ws); loaderFX(T, st, Ws); pf('roomfx'); }
  if (near) mechFX(T, st);
  if (siteOn) { K.setLight(L_SITE); SITE.drawVehicles(T > TB - 1 ? tb : null); }
  drawCharge(T, st);
  if (near) { drawSlice(T, st); drawBore(T, st); drawSabot(T); }
  drawFire(T); drawProbe(T); drawBurst(T);
  if (T > TBU && siteOn) SITE.drawBolt(BOLT, tb, LEAD);
  pf('fx');
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (af > 0 && af < .4) fl = .12 * Math.exp(-af * 700);
  if (tb > 0 && tb < .7) fl = Math.max(fl, .1 * Math.min(1, K.Bolt.stroke(tb)));
  if (T > TBU && T < TBU + .3) fl = Math.max(fl, .08 * Math.exp(-(T - TBU) * 12));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < TRET0 + 2.2) SITE.overlay(T, tb, 1 - E.ss(TRET0 + .8, TRET0 + 2, T));
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
  // the mount wakes: the hydraulic pump, the accumulators charging
  [T_HPU, () => { SFX.tone(40, 120, 1.0, 'sawtooth', .014); SFX.noise(1.4, 600, .7, .02, .4); }], [T_HPU + .3, () => SFX.tone(180, 420, 1.1, 'triangle', .008)], [T_HPU + 1.4, clack],
  // the cryocoolers (x240): the compressors' hum, a tick as each coil reaches field
  [T_CRYO - .1, () => { SFX.tone(52, 52, 4.2, 'sawtooth', .008); SFX.tone(104, 98, 4.2, 'triangle', .005); }], [T_CRYO + .2, () => SFX.noise(2.2, 4200, .5, .008, 1.5)],
  ...Array.from({ length: 12 }, (_, k) => [enT(k) + .45, () => SFX.tone(560 + 70 * k, 560 + 70 * k, .05, 'square', .007)]),
  [T_EN, () => SFX.tone(110, 330, 2.0, 'sine', .01)],
  // the cover, the sensors, train and elevation, laid
  [10.7, () => SFX.tone(300, 180, .3, 'square', .01)], [11.4, clunk], [10.8, whirr(260, 330, 1.1)], [12.0, () => { SFX.tone(1400, 1400, .07, 'square', .008); SFX.tone(1870, 1870, .07, 'square', .008); }],
  [10.9, () => SFX.noise(1.6, 3000, .4, .008, .6)], [12.6, () => { SFX.tone(1200, 1200, .06, 'square', .008); SFX.tone(1600, 1600, .09, 'square', .008); }],
  [T_TR, whirr(90, 150, 2.8)], [T_EL, whirr(110, 85, 2.8)], [T_EL, () => SFX.noise(2.6, 900, .6, .014, .5)], [T_EL1, clunk], [T_EL1 + .1, tick],
  // the power room
  [T_X, () => SFX.tone(900, 2600, .9, 'sine', .012)], [16.2, whirr(300, 260, 1.1)], [17.2, () => { SFX.tone(120, 980, 1.3, 'sine', .009); SFX.tone(240, 1960, 1.3, 'triangle', .004); }], [17.4, () => SFX.noise(1.6, 1200, .5, .01, .5)],
  [18.7, clack], [18.9, whirr(160, 220, .5)], [19.3, whirr(120, 140, .8)], [19.9, whirr(100, 120, .8)], [21.1, whirr(120, 100, .7)], [21.6, whirr(140, 120, .7)], [22.3, clunk], [22.6, clack],
  [19.8, () => { SFX.tone(55, 420, 4.2, 'sawtooth', .016); SFX.tone(110, 840, 4.2, 'triangle', .012); }],
  [23.6, () => { SFX.tone(420, 436, 4.8, 'sawtooth', .007); SFX.tone(840, 872, 4.8, 'triangle', .006); }],
  ...[0, 1, 2, 3].map(r => [brkT(r) + .1, clack]),
  ...Array.from({ length: 10 }, (_, k) => [modT(k * 8) + .1, tick]),
  // the loader
  [T_DRUM, whirr(200, 160, .5)], [T_DRUM + .5, clunk], [LD(.3), clack], [LD(.3), whirr(180, 420, 1.2)], [LD(1.5), clunk], [LD(1.6), clack],
  [LD(1.6), () => SFX.tone(260, 160, .35, 'square', .008)], [LD(1.95), clunk], [LD(1.7), whirr(150, 230, .45)], [LD(2.15), clunk], [LD(2.2), whirr(300, 800, .45)], [LD(2.65), clunk],
  [LD(2.65), whirr(700, 260, .35)], [LD(2.7), whirr(380, 160, .9)], [LD(3.0), whirr(230, 150, .35)], [LD(3.3), clunk],
  ...Array.from({ length: 13 }, (_, k) => [clampT(k) + .12, tick]),
  [T_RAIL, () => SFX.tone(200, 2600, 5.0, 'sawtooth', .012)], [T_RAIL + 1, () => SFX.noise(4, 5000, .5, .016, 3)],
  [T_REL, () => { SFX.tone(48, 30, 2.6, 'sawtooth', .022); SFX.noise(2.4, 260, .7, .02, 1.6); }],
  [TF, () => { SFX.crack(); SFX.rumble(3, .3); SFX.tone(900, 60, 1.2, 'sawtooth', .02); }],
  [TF + 2.4, () => SFX.noise(5, 1800, .5, .012, 2)], [T_LEAD, () => { SFX.tone(2400, 600, 1.8, 'sawtooth', .006); SFX.noise(2, 6000, .4, .01, 1.5); }],
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
  K.leader(x, y, x + 46, y - 46, '#C6F432', .8 * a);
  K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
  K.setTag(tg, id, K.decode(lab, E.sat(age / .6), TRNOW, id.length), val, 'lime sm', x + 50, y - 60, a);
}
const CTX = { K, P_, CL, XS, XF, XR, M3, HD, GEO, FILM, STAGE, V, R, X, E, rng, PI, TAU, DEG, LIME, HOT, WH, CORAL: K.CORAL, SO, MO, RO,
  apI, kk, lock, tr, tagAt, odot: P_.odot, oglow: P_.oglow, drawX: P_.drawX, MW, GY: P_.GY, GZ: P_.GZ, SIDE, T: 0, u: 0, Ws: null, st: null, camOld: null, xray: false,
  PATH_A, camAt: t => camAt(t), Tb: 0, simAt, filmAt, T_REL, TF, TBU, T_LEAD, TB, TRET0, TRET1, T_RAIL, T_LD, MZ0, DIR0, B_TOP, S_HIT, SITE, bez, bezT, uOfD, dOfS, drawRound, SHOT };
if (window.RGK && RGK.build) RGK.build(CTX);
if (window.RGR && RGR.build) RGR.build(RCTX);
for (const q of INS) if (q.mod.build) { const t0 = performance.now(); q.mod.build(CTX); LOG.push(`insert ${q.at} ${(performance.now() - t0).toFixed(0)} ms`); }
const TF_R = mapOut(TF);
const FCH = CHAPTERS.map(c => ({ t: mapOut(c.t), title: c.title }))
  .concat(...INS.map(q => (q.mod.chapters || []).map(c => ({ t: q.r0 + c.t, title: c.title })))).sort((a, b) => a.t - b.t);
const FCUES = cues.map(([t, fn]) => [mapOut(t), fn]).concat(...INS.map(q => (q.mod.cues || []).map(([u, fn]) => [q.r0 + u, fn])));
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
FILM.run({ duration: DUR, chapters: FCH, render, cues: FCUES });
STAGE.dbg = () => ({ camAt, prof: PROF, log: LOG, np: NP, mz: MZ0, dir: DIR0, btop: B_TOP, s1: S1, arc: ARC.len, range: RANGE, e21: E21, stateAt, XF, XR, times: { T_REL, TF, TBU, T_LEAD, TB, TRET0, TRET1, SH, DUR0, DUR, T_BORE }, mapOut, mapIn: t => Object.assign({}, mapIn(t)), INS: INS.map(q => ({ at: q.at, r0: q.r0, len: q.len })) });
})();
