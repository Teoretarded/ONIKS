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
const DUR0 = 82;                                                      // the base take (old time)
const T_BANK = 19.8, T_BANK1 = 23.2;                                  // racks charge
/* loader time -> film time: the loader holds XH s with the round at the top of the hoist (its exploded view) */
const T_LD = 23.9, XH = 1.8, LD = t => T_LD + t + (t > 1.355 ? XH : 0), T_XP = T_LD + 1.35;
const T_RAIL = LD(3.3), TF = T_RAIL + 4.8;                            // rails charge, the round leaves the muzzle
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
const AZ = PSI, EL = P_.EL_LOAD, HAT = 105 * DEG, COV = 125 * DEG, PET = 115 * DEG;
const ROTW = FILM.warp([{ t: 0, rate: 0 }, { t: 15.6, rate: 0 }, { t: 19.4, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: 45, rate: 0 }, { t: DUR0, rate: 0 }]);
const ROTX = FILM.warp([{ t: 0, rate: 0 }, { t: 18.5, rate: 0 }, { t: 20.6, rate: 1 }, { t: TF, rate: 1 }, { t: TF + 2.5, rate: .45 }, { t: 45, rate: 0 }, { t: DUR0, rate: 0 }]);
const PUMPW = FILM.warp([{ t: 0, rate: 0 }, { t: 14.6, rate: 0 }, { t: 16.0, rate: 1 }, { t: TF + 3, rate: 1 }, { t: 46, rate: 0 }, { t: DUR0, rate: 0 }]);
const FANW = FILM.warp([{ t: 0, rate: 0 }, { t: 14.9, rate: 0 }, { t: 16.6, rate: 1 }, { t: TF + 3, rate: 1 }, { t: 46, rate: 0 }, { t: DUR0, rate: 0 }]);
const RPM = 9600, VIS_REV = 2.4;
const NMOD = P_.MOD.length;
const modT = k => T_BANK + .3 + (T_BANK1 - T_BANK - .3) * k / NMOD;
const modLvl = (k, T) => E.ss(modT(k), modT(k) + .3, T) * (1 - E.ss(TF, TF + .12, T));
const brkT = r => modT(r * 20) - .3;
const nCharged = T => { let n = 0; for (let k = 0; k < NMOD; k++) if (modLvl(k, T) > .98) n++; return n; };
const clampT = k => LD(2.6) + k * .055;
const ST = { xp: 0, hatch: 0, petal: 0, yaw: 0, el: 0, ext: 0, covS: 0, covP: 0, rec: 0, rot: 0, rate: 0, rotX: 0, rateX: 0, chg: 0, glow: 0,
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
  const a = T - TF, ar = T > TF - 1.6 ? simAt(T) + T_BORE : -1;      // sim s since the round was released
  s.rec = ar > 0 && ar < 1.6 ? .55 * (ar < .015 ? ar / .015 : Math.exp(-(ar - .015) * 4.2)) : 0;
  s.rot = spin(ROTW, T) * VIS_REV * TAU; s.rate = ROTW.rate(T);
  s.rotX = spin(ROTX, T) * VIS_REV * TAU; s.rateX = ROTX.rate(T);
  s.pump = spin(PUMPW, T) * 4 * TAU; s.pumpR = PUMPW.rate(T);
  s.fan = spin(FANW, T) * 3 * TAU; s.fanR = FANW.rate(T);
  s.valve = kk(T, 13.9, 15.2) * 1.5 * TAU;
  s.chg = E.ss(T_RAIL, T_REL - .3, T) * (1 - E.ss(T_REL - .02, T_REL + .25, T));
  s.glow = a > 0 ? Math.exp(-a * 1.2) : 0;
  // the loader
  s.drum = kk(T, T_LD, T_LD + .5);                                      // one cell (30°)
  s.gh = kk(T, 20.4, 21.2) * (1 - kk(T, LD(3.1), LD(4.1)));           // the gunhouse ghosted
  s.tray = (90 * DEG - EL) * (kk(T, LD(.1), LD(.6)) * (1 - kk(T, LD(1.4), LD(1.85))));
  const up = kk(T, LD(.45), LD(1.35)), down = kk(T, LD(1.45), LD(2.3));
  s.hoistY = HOIST_B + (P_.HY1 - HOIST_B) * up * (1 - down);
  s.rnd = T < LD(.45) ? 0 : T < LD(1.35) ? 1 : T < T_REL ? 2 : 3;            // in the drum, on the hoist, in the tray / breech, fired
  s.ram = kk(T, LD(1.85), LD(2.2));
  s.xp = kk(T, T_XP + .15, T_XP + .75) * (1 - kk(T, T_XP + XH - .6, T_XP + XH - .05));     // the round's exploded view
  s.brc = kk(T, LD(.8), LD(1.2)) * (1 - kk(T, LD(2.25), LD(2.6)));
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
  { t: 0, title: 'Station' }, { t: 4, title: 'Mount' }, { t: 12.6, title: 'Power' }, { t: T_LD, title: 'Load' }, { t: T_RAIL, title: 'Charge' },
  { t: T_REL - .3, title: 'Fire' }, { t: TF + 2.4, title: 'Flight' }, { t: TBU - .2, title: 'Strike' }, { t: TB + .4, title: 'Scan' }, { t: TRET0, title: 'Return' }, { t: 48.4 + SH - .6, title: 'Stow' },
];
/* the sabot: three petals round the round; at the muzzle they peel off, slow in the air and fall away */
const BOLT = new K.Bolt({ top: B_TOP, hit: S_HIT, seed: 1402, depth: 9, nb: 14, rough: .55, spark: 26 });
const VAPOR = (() => { const r = rng(818), A = new Float32Array(90 * 5); for (let i = 0; i < 90; i++) { A[i * 5] = (r() - .5) * 1.1; A[i * 5 + 1] = (r() - .5) * 2.2; A[i * 5 + 2] = r(); A[i * 5 + 3] = .4 + .6 * r(); A[i * 5 + 4] = r() * TAU; } return A; })();
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
  { t: T_XP + .5, eye: [2.5, 8.3, 45.9], target: [-.43, 7.72, 47.77], fov: 40 },
  { t: T_XP + XH - .4, eye: [2.1, 8.9, 46.2], target: [-.43, 7.8, 47.77], fov: 40 },
  { t: LD(1.8), eye: [3.0, 6.9, 45.4], target: [-.3, 7.3, 47.8], fov: 42 },
  { t: LD(2.8), eye: [7.5, 10.8, 45.4], target: [.3, 9.0, 49.0], fov: 40 },
  { t: T_RAIL + .9, eye: [8.4, 11.2, 47.0], target: [.8, 10.2, 49.5], fov: 42 },
  { t: T_RAIL + 2.0, eye: [8.8, 13.2, 49.2], target: [1.8, 13.0, 51.9], fov: 42 },
  { t: T_RAIL + 3.1, eye: [9.6, 15.2, 51.6], target: [2.6, 15.6, 53.9], fov: 42 },
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
  if (T < T_REL - .7) { const s = PATH_A(T), d = FILM.drift(T, .05 * E.ss(12, 14, T) * (1 - E.ss(27, 29, T)), 3); s.eye = V.add(s.eye, d); return s; }
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
/* inside the X-ray: lit brighter and fading slower than the ship round them, so the machinery reads through the hull */
const RO = { a: 1.45, fade: 140, lime: 0, md: 3, S: null, size: .7, px: 4.8, edge: .78, zfix: undefined, bk: 0, foc: 0, amb: .2 };
/* dot density: the LOD keeps dots at most px apart on screen; DQ divides those spacings (?dq=1: the old density) */
const PX0 = [SO, SOP, MO, RO].map(o => o.px);
function density() { [SO, SOP, MO, RO].forEach((o, i) => { o.px = PX0[i] / K.DQ; }); SO.lmin = K.DQ > 1.3 ? 0 : 1; }
const lock = (T, t0) => { const a = T - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
function drawShip(Ws) {
  for (const p of SHIP) { SO.cut = p.name === 'hull' ? P_.CUT : null; P_.drawX(p.ml, Ws, SO); }
  for (const p of SHIPX.parts) { SO.cut = p.cut ? P_.CUT : null; P_.drawX(p.ml, Ws, SO); }
  SO.cut = null; P_.drawX(CL.hullP, Ws, SOP);
}
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
  if (Lr) {
    RO.a = 1.5 + .4 * st.xp; RO.lime = Math.max(.45, .9 * lock(T, LD(2.2))) * (st.rnd === 2 && T > LD(2.9) ? .4 : 1);
    RO.keep = Math.max(RO.keep, st.xp); XF.RND = X.mul(Ws, Lr);
    drawRound(XF.RND, Lr, st.xp, RO); RO.a = 1.15; RO.keep = FK.load;
  }
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
/* the loader's lights: the rammer's chain, the round seating, the breech seal; in the exploded view a scan plane
   sweeps the round's parts as they part and close */
function loaderFX(T, st, Ws) {
  if (!isOpen(P_.GZ)) return;
  if (st.xp > .01 && XF.RND) {
    const L = XF.RND, e = st.xp, U = X.dir(L, [1, 0, 0]), W = X.dir(L, [0, 1, 0]);
    const zs = -.9 + 1.8 * ((T - T_XP - .3) / 1.1 % 1);
    apI(L, 0, 0, zs, Q1); K.ringW(Q1, U, W, .24 + .1 * e, 90, 1, LIME, .8 * e, T * 3);
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + .9; apI(L, Math.cos(a) * (.13 + .34 * e), Math.sin(a) * (.13 + .34 * e), zs, Q2); P_.odot(Q2[0], Q2[1], Q2[2], 2, HOT, e); }
    for (const z of [-.42 * e - P_.RND_H - .07, .3 * e]) { apI(L, 0, 0, z, Q1); K.ringW(Q1, U, W, .2, 60, 1, LIME, .5 * e, -T * 2); }
  }
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
/* a hydraulic ram between a base (frame Tb) and a pin (frame Tp): the cylinder (four staves, collars) fixed at the
   base, the rod out to the pin; lit while it moves */
const EB0 = [0, 0, 0], EB1 = [0, 0, 0];
function ramSolid(Tb, b, Tp, p, cyl, rc, rr, a, lit) {
  apI(Tb, b[0], b[1], b[2], EB0); apI(Tp, p[0], p[1], p[2], EB1);
  const d = V.sub(EB1, EB0), L = V.len(d); if (L < .01) return;
  const f = V.mul(d, 1 / L), a_ = Math.abs(f[1]) < .9 ? [0, 1, 0] : [1, 0, 0], U = V.norm(V.cross(f, a_)), W = V.cross(f, U);
  const lc = Math.min(cyl, L - .05), col = lit > .05 ? LIME : WH;
  for (let k = 0; k < 4; k++) {
    const an = k * PI / 2 + .4, cs = Math.cos(an) * rc, sn = Math.sin(an) * rc;
    const ox = U[0] * cs + W[0] * sn, oy = U[1] * cs + W[1] * sn, oz = U[2] * cs + W[2] * sn;
    K.lineW(EB0[0] + ox, EB0[1] + oy, EB0[2] + oz, EB0[0] + f[0] * lc + ox, EB0[1] + f[1] * lc + oy, EB0[2] + f[2] * lc + oz, 1, 1, WH, .75 * a);
  }
  for (const u of [0, .5, 1]) K.ringW(V.mad(EB0, f, lc * u), U, W, rc * 1.15, 24, 1, WH, .8 * a, 0);
  const c0 = V.mad(EB0, f, lc);
  K.lineW(c0[0], c0[1], c0[2], EB1[0], EB1[1], EB1[2], .8, 2, col, (.75 + .25 * lit) * a);
  K.ringW(EB1, U, W, rr * 1.8, 16, 1, col, .9 * a, 0);
}
function mechFX(T, st) {
  const mv = x => .35 + .65 * x;
  // elevation rams under the barrel, either side of the bore
  const elv = Math.abs(EL * (kk(T + .03, 6.6, 9.4) * (1 - kk(T + .03, 51.2 + SH, 53.9 + SH))) - st.el) > 1e-4 ? 1 : 0;
  for (const sg of [-1, 1]) ramSolid(XF.T, [sg * .55, .42, 2.62], XF.B, [sg * .42, -.47, 1.4], 1.05, .085, .035, 1, elv);
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
/* while the rails charge, a scan plane runs the barrel breech -> muzzle and draws its section where it cuts:
   the rails top and bottom, the insulators between them, the containment round them, the sleeve over the front */
const TS0 = T_RAIL + .35, TS1 = T_RAIL + 3.1;
function rectB(Tw, x0, y0, x1, y1, z, col, a, s) {
  apI(Tw, x0, y0, z, Q1); apI(Tw, x1, y0, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, s, col, a);
  apI(Tw, x1, y1, z, Q1); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, s, col, a);
  apI(Tw, x0, y1, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, s, col, a);
  apI(Tw, x0, y0, z, Q1); K.lineW(Q2[0], Q2[1], Q2[2], Q1[0], Q1[1], Q1[2], 1, s, col, a);
}
function drawSlice(T, st) {
  if (T < TS0 || T > TS1) return;
  const u = E.ss(TS0, TS1, T), A = E.ss(TS0, TS0 + .25, T) * (1 - E.ss(TS1 - .25, TS1, T));
  const z0 = P_.RZ0 + .05, z1 = P_.SLV1 + st.ext - .05, z = z0 + (z1 - z0) * u, B = XF.B;
  // the plane: a faint lattice square to the bore, its rim lit
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) { if ((i + j) & 1) continue; apI(B, i * .08, j * .08, z, Q1); K.dotW(Q1[0], Q1[1], Q1[2], 1, LIME, .16 * A); }
  rectB(B, -1, -1, 1, 1, z, LIME, .55 * A, 1);
  // the section
  for (const sg of [1, -1]) {
    rectB(B, -.1, sg * .14, .1, sg * .22, z, HOT, A, 2);                                            // rail
    if (z < P_.RZ1) rectB(B, -.4, sg * .22, .4, sg * .5, z, LIME, .9 * A, 1);                       // containment
    rectB(B, sg * .095, -.14, sg * .165, .14, z, LIME, .75 * A, 1);                                 // insulator
  }
  if (z > P_.SLV0 + st.ext) { rectB(B, -.64, -.74, .64, .74, z, LIME, .9 * A, 1); rectB(B, -.58, -.62, .58, .62, z, LIME, .5 * A, 1); }   // sleeve
  for (const zb of P_.BANDS) if (Math.abs(z - zb - .05) < .07) rectB(B, -.46, -.56, .46, .56, z, HOT, A, 2);
  apI(B, 0, 0, z, Q1); K.glowW(Q1[0], Q1[1], Q1[2], 50, LIME, .3 * A);
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
  ['PRB', 'Probe · inert', st => '', 'RND', [.12, 0, .55], T_XP + .5, T_XP + XH - .3],
  ['SAB', 'Sabot ×3', st => '', 'RND', [.48, 0, 0], T_XP + .7, T_XP + XH - .3],
  ['ARM', 'Armature', st => '', 'RND', [.1, -.14, -.86], T_XP + .9, T_XP + XH - .3],
  ['BRC', 'Breech block', st => '', 'B', [.56, .64, -2.2], LD(.9), LD(2.6)],
  ['CLP', 'Rail clamps ×11', st => '', 'B', [.46, .55, 3.2], LD(2.7), LD(4.2)],
  ['RLS', 'Rails ×2 · copper', st => '', 'B', [.1, .22, 1.2], TS0 + .45, TS1 - .1],
  ['INS', 'Insulators', st => '', 'B', [.165, -.08, 2.6], TS0 + .8, TS1 - .1],
  ['CNT', 'Containment', st => '', 'B', [.4, .5, 3.8], TS0 + 1.15, TS1 - .1],
  ['MZL', 'Muzzle', st => `${Math.round(100 * st.chg)} %`, 'E', [.7, .82, P_.SLV1], T_RAIL + 1.4, TF - .1],
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
  else if (T < 4.2 || T > 56.8 + SH) { l1 = 'DDG-51 · <b>on station</b>'; l2 = 'Railgun <b>stowed</b>'; }
  else if (T < 12.6) {
    l1 = 'Railgun · <b>deploying</b>';
    l2 = T < 5.8 ? 'Hatches <b>opening</b>' : T < 9.4 ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : T < 10.9 ? `Rails <b>${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m</b>` : 'Covers <b>open</b>';
  } else if (T < 15.0) { l1 = 'Power · <b>coolant loop</b>'; l2 = T < 14.6 ? 'Valves <b>opening</b>' : 'Pumps <b>starting</b>'; }
  else if (T < 18.5) { l1 = 'Pulsed alternator 3 · <b>opened</b>'; l2 = T < 15.9 ? 'End bell <b>drawn</b>' : T < 17.4 ? 'Rotor <b>drawn</b>' : 'End bell <b>closing</b>'; }
  else if (T < T_BANK - .2) { l1 = 'Power · <b>pulsed alternators</b>'; l2 = `Rotors <b>${Math.round(RPM * st.rate / 10) * 10} rpm</b>`; }
  else if (T < T_LD) { const n = nCharged(T); l1 = 'Capacitor racks · <b>charging</b>'; l2 = `Bank <b>${(1.2 * n).toFixed(1)} MJ</b> · ${n}/${NMOD}`; }
  else if (T < T_RAIL) {
    l1 = 'Loader · <b>ramming</b>';
    l2 = T < LD(.45) ? 'Drum <b>indexing</b>' : T < LD(1.35) ? 'Hoist <b>up</b>' : T < T_XP + XH ? 'Round <b>check</b> · sabot · armature' : T < LD(1.85) ? 'Breech <b>open</b> · tray <b>in line</b>' : T < LD(2.6) ? 'Round <b>seated</b>' : 'Rail clamps <b>locking</b>';
  }
  else if (T < T_REL) { l1 = 'Rails · <b>charging</b>'; l2 = `Charge <b>${Math.round(100 * st.chg)} %</b> · 32 MJ`; rate = simRate(T); }
  else if (T < TF) { const tau = simAt(T) + T_BORE; rate = simRate(T); l1 = `Round · <b>in the bore</b>`; l2 = `<b>${Math.round(ACC * tau)} m/s</b> · <b>${(roundZ(T) - P_.SEAT_Z).toFixed(1)}</b> / ${LB_.toFixed(1)} m`; }
  else if (T < TBU) { const s = climbS(T); rate = climbRate(T); probeAt(s, Q4); l1 = `Probe · <b>alt ${km(Q4[1])} km</b>`; l2 = `<b>${Math.round(vOfS(s))} m/s</b> · range <b>${km(Math.hypot(Q4[0], Q4[2]))} km</b>`; }
  else if (T < T_LEAD) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Charge <b>${Math.round(100 * E.ss(TBU, T_LEAD, T))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - T_LEAD) / LEAD))} %</b> · range <b>${km(RANGE)} km</b>`; }
  else if (T < 48.4 + SH - .6) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · range <b>${km(RANGE)} km</b>`; }
  else { l1 = 'Railgun · <b>stowing</b>'; l2 = T < 49.8 + SH ? 'Covers <b>closing</b>' : T < 51.3 + SH ? `Rails <b>${(P_.SLV1 + st.ext - P_.RZ0).toFixed(1)} m</b>` : T < 54.6 + SH ? `Train <b>${Math.round(st.yaw / DEG)}°</b> · elev <b>${Math.round(st.el / DEG)}°</b>` : 'Hatches <b>closing</b>'; }
  const sim = T < TF - 1.6 ? TRNOW - TF_R : T < TBU ? simAt(T) : S1 + (T - TBU);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate.toFixed(1)}</span>` : rate < .92 ? `<span class="l">×${rate < .1 ? rate.toFixed(2) : rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(T > 48.4 + SH - .6 ? T - DUR0 - TF : sim)} · ${rateTxt}`;
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
  if (near) { trunk(T, st); mechFX(T, st); drawVapor(T, st); }
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
  [T_REL, () => { SFX.tone(48, 30, 2.6, 'sawtooth', .022); SFX.noise(2.4, 260, .7, .02, 1.6); }],
  [TF, () => { SFX.crack(); SFX.rumble(3, .3); SFX.tone(900, 60, 1.2, 'sawtooth', .02); }],
  [TF + 2.4, () => SFX.noise(5, 1800, .5, .012, 2)], [T_LEAD, () => { SFX.tone(2400, 600, 1.8, 'sawtooth', .006); SFX.noise(2, 6000, .4, .01, 1.5); }],
  ...TOUR_T.map(t => [TB + t, () => { SFX.crack(); SFX.tone(1200, 3000, .5, 'square', .006); }]),
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(4, .16); }],
  [TB + .5, tick], [TB + 1.2, tick],
  [S2(48.4), () => SFX.tone(260, 170, .5, 'square', .008)], [S2(49.4), clunk], [S2(49.8), () => SFX.noise(1.4, 1400, .6, .02, .3)], [S2(51.2), clunk],
  [S2(51.3), whirr(150, 90, 3.0)], [S2(54.6), () => SFX.tone(300, 180, .3, 'square', .01)], [S2(55.5), () => SFX.noise(1.2, 700, .8, .03, .2)], [S2(56.8), clunk],
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
