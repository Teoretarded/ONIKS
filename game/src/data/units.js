/* ONIKS unit table: game stats per unit type, the HD model each type is drawn with, how sim state maps onto that
   model's state fields, and which model parts can be damaged (and what a destroyed part switches off).

   Units: metres, seconds, m/s, radians. Real sizes and speeds; weapon and sensor ranges are scaled to the
   80-160 km maps. Combat is a board-game abstraction: range, speed, reload time, ammo, hit chance, damage.

   import { UNITS, PROJ, SIDES, typesOf } from './data/units.js'
   UNITS[type].modelState(unit, t) writes the model state into unit.st (no allocation) and returns it. The sim
   calls it every tick with sim.t; a renderer may call it again with an interpolated time for smooth spinning. */

const TAU = Math.PI * 2, D2R = Math.PI / 180, KN = 0.5144, KMH = 1 / 3.6;
const wrap = a => a - TAU * Math.floor(a / TAU);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const spin = (u, t, w) => wrap(t * w + u.id * 1.7);               // steady spinners: rotors, fans, props
const antAt = (u, t) => wrap(u.antA + u.antW * (t - u.antT));     // radar antennas (stop under EMCON)

export const SIDES = ['coast', 'fleet'];
export const ENEMY = { coast: 'fleet', fleet: 'coast' };
export const CLASSIFY = 0.6;                                      // contact confidence that classifies a track
export const TEL_ELEV = 1.53;                                     // K340P launcher erect angle (rad)

/* Part entries: w = hit weight, disables = capability tokens switched off when the part is destroyed
   (tokens: 'move', 'radar', 'camera', 'scan', 'deploy', 'air' (aircraft ops), 'reload', 'launch' (drones), and
   weapon names), slow = speed factor while destroyed, fatal = unit is lost, lose = ammo fraction lost. */

export const UNITS = {
  /* ------------------------------------------------------------------ COAST */
  hq: {
    type: 'hq', side: 'coast', name: 'K380R', cls: 'HQ', label: 'K380R command post · Bastion-P',
    domain: 'land', model: 'hq', hq: true, static: true,
    size: [28, 28, 4], top: 18.6, speed: 0, road: 0, turn: 0,          // site: two shelter trucks, comms, 18 m mast
    hp: 80, rcs: 0.5, dieTime: 20,                                // balance: 150 -> 80 (two TLAM or SLAM hits)
    sensors: { esm: 120000 },
    emits: { range: 70000 },                                      // comms: always radiating
    scan: { reach: 50000, r: 4000, cd: 90 },
    weapons: {},
    cost: 0, buildTime: 0,
    parts: {
      truckA: { label: 'Command vehicle 1 · 6×6', w: 1.5 },
      shelterA: { label: 'Command shelter 1', w: 2 },
      truckB: { label: 'Command vehicle 2 · 6×6', w: 1.5 },
      shelterB: { label: 'Command shelter 2', w: 2 },
      container: { label: 'Comms shelter · 20 ft ISO', w: 1, disables: ['scan'] },
      generator: { label: 'Diesel generator', w: .7 },
      mast: { label: 'Antenna mast · 18 m', w: .8, disables: ['scan'] },
    },
    modelState(u, t) { return u.st; },
  },

  tel: {
    type: 'tel', side: 'coast', name: 'K340P', cls: 'TEL', label: 'K340P TEL · Bastion-P',
    domain: 'land', model: 'tel',
    size: [13.9, 3.1, 4.0], top: 4, topErect: 12,
    speed: 8, road: 16.7, turn: .45, accel: 1.2, slopeMax: .4,
    hp: 30, rcs: 0.5, dieTime: 20,
    deploy: { jacks: 10, erect: 15 },                             // ~25 s from driving to ready to fire
    reload: { perRound: 45, depot: 90 },                          // from a transloader / by the depot crane
    sensors: {},
    weapons: {
      oniks: { proj: 'oniks', ammo: 2, range: 110000, min: 10000, cd: 2.5, vs: ['sea'], salvo: 2,
               muzzle: [.66, 10.9, -7.2], alt: true, needs: 'erect' },
    },
    cost: 450, buildTime: 90,
    parts: {
      chassis: { label: 'MZKT-7930 chassis', w: 3, slow: .6 },
      wheels: { label: 'Wheels 8x8', w: 2, disables: ['move'] },
      cab: { label: 'Cab', w: 1, slow: .7 },
      launcher: { label: 'TLC pair · 3M55', w: 2, disables: ['oniks', 'reload'] },
      ram: { label: 'Erector ram', w: 1, disables: ['oniks'] },
      jacks: { label: 'Outriggers', w: 1, disables: ['deploy', 'oniks'] },
    },
    modelState(u, t) {
      const s = u.st; s.elev = u.elev; s.dep = u.dep; s.capR = u.caps[0]; s.capL = u.caps[1];
      s.wheel = wrap(u.odo / .66); s.fan = spin(u, t, 14); return s;
    },
  },

  radar: {
    type: 'radar', side: 'coast', name: 'Monolith-B', cls: 'RADAR', label: 'Monolith-B · surface search',
    domain: 'land', model: 'radar',
    size: [12.5, 3.1, 4.0], top: 16,
    speed: 8, road: 16.7, turn: .45, accel: 1.2, slopeMax: .4,
    hp: 25, rcs: 0.5, dieTime: 20,
    mast: { time: 15, h: 14 },                                    // raise the mast before radiating
    sensors: { radar: { surf: 90000, air: 40000, land: 0, period: 5, gain: .16, h: 14, needsMast: true } },   // balance: surf 110 -> 90 km
    emits: { range: 140000 },
    scan: { reach: 85000, r: 4000, cd: 90 },                      // balance: 70 -> 85 km (finds the carrier as it closes)
    weapons: {},
    cost: 350, buildTime: 90,
    parts: {
      chassis: { label: 'Chassis 8x8', w: 3, slow: .6 },
      wheels: { label: 'Wheels', w: 2, disables: ['move'] },
      cab: { label: 'Cab', w: 1, slow: .7 },
      body: { label: 'Equipment shelter', w: 2, disables: ['radar', 'scan'] },
      mast: { label: 'Telescopic mast', w: 1, disables: ['radar', 'scan'] },
      array: { label: 'Planar array', w: 1, disables: ['radar', 'scan'] },
    },
    modelState(u, t) { const s = u.st; s.ant = antAt(u, t); s.mast = u.mast; s.wheel = wrap(u.odo / .66); return s; },
  },

  pantsir: {
    type: 'pantsir', side: 'coast', name: 'Pantsir-S1', cls: 'SAM', label: 'Pantsir-S1 · 96K6',
    domain: 'land', model: 'pantsir',
    size: [11.5, 3.1, 4.6], top: 6,
    speed: 10, road: 20, turn: .5, accel: 1.5, slopeMax: .45,
    hp: 30, rcs: 0.5, dieTime: 20,
    sensors: { radar: { surf: 0, air: 32000, land: 0, period: 1.5, gain: .28, h: 6 } },
    emits: { range: 45000 },
    weapons: {
      sam: { proj: 'sam', ammo: 12, range: 18000, min: 1000, cd: 2.0, vs: ['missile', 'air'], auto: true, maxEng: 2, maxShots: 3, needsRadar: true,
             muzzle: [1.3, 3.6, .5], refill: 50 },
      gun30: { gun: true, ammo: 28, range: 4000, cd: 1.0, vs: ['missile', 'air'], auto: true, needsRadar: true,
               pk: { missile: .15, air: .3 }, dmg: 5, muzzle: [0, 3.4, 2.2], burst: 1.0, refill: 10 },
    },
    cost: 380, buildTime: 80,
    parts: {
      chassis: { label: 'KamAZ-6560 chassis', w: 3, slow: .6 },
      wheels: { label: 'Wheels 8x8', w: 2, disables: ['move'] },
      cab: { label: 'Cab', w: 1, slow: .7 },
      turret: { label: 'Combat module', w: 2, disables: ['sam', 'gun30'] },
      guns: { label: '2A38M 30 mm ×2', w: 1, disables: ['gun30'] },
      missiles: { label: '57E6 ×12', w: 1, disables: ['sam'] },
      searchRadar: { label: '1RS2-1E search radar', w: 1, disables: ['radar'] },
      trackRadar: { label: '1RS2-1E tracking radar', w: 1, disables: ['sam'] },
      eo: { label: 'EO tracker', w: .5 },
    },
    modelState(u, t) {
      const s = u.st; s.yaw = u.tYaw; s.pitch = u.tPitch; s.sAnt = antAt(u, t);
      const f = t - u.fireT; s.fire = f >= 0 && f < 1.0 ? 1 - ((f * 11) % 1) : 0; s.wheel = wrap(u.odo / .6); return s;
    },
  },

  catapult: {
    type: 'catapult', side: 'coast', name: 'Orlan-10 launcher', cls: 'UAV-L', label: 'Orlan-10 catapult',
    domain: 'land', model: 'catapult',
    size: [4.9, 2.2, 2.4], top: 3,
    speed: 8, road: 16.7, turn: .5, accel: 1.2, slopeMax: .4,
    hp: 15, rcs: 0.3, dieTime: 15,
    drones: 3, launchPrep: 12,
    sensors: {},
    weapons: {},
    cost: 150, buildTime: 60,
    parts: {
      trailer: { label: 'Launch trailer', w: 2, disables: ['move'] },
      rail: { label: 'Pneumatic launch rail', w: 2, disables: ['launch'] },
      carriage: { label: 'Carriage', w: 1, disables: ['launch'] },
    },
    modelState(u, t) { const s = u.st; s.carriage = u.carriage; return s; },
  },

  drone: {
    type: 'drone', side: 'coast', name: 'Orlan-10', cls: 'UAV', label: 'Orlan-10 · UAV',
    domain: 'air', model: 'drone',
    size: [2.0, 3.1, .6], alt: [300, 800], altDef: 500,
    speed: 30, turn: .35, climb: 4, accel: 2,
    hp: 4, rcs: 0.08, dieTime: 8, endurance: 30000,
    sensors: { camera: { range: 7000, gain: .35 } },
    scan: { reach: 8000, r: 3000, cd: 90 },
    weapons: {},
    cost: 45, buildTime: 25,
    parts: {
      fuselage: { label: 'Fuselage', w: 2 },
      wing: { label: 'Wing 3.1 m', w: 2, fatal: true },
      tail: { label: 'Tail', w: 1 },
      prop: { label: 'Propeller', w: .5, fatal: true },
      gimbal: { label: 'EO gimbal', w: .5, disables: ['camera', 'scan'] },
      antennas: { label: 'Datalink', w: .3 },
    },
    modelState(u, t) { const s = u.st; s.prop = spin(u, t, 140); s.gimYaw = u.gimYaw; s.gimPitch = u.gimPitch; return s; },
  },

  transloader: {
    type: 'transloader', side: 'coast', name: 'K342P', cls: 'TLV', label: 'K342P transloader',
    domain: 'land', model: 'transloader',
    size: [14.0, 3.1, 3.6], top: 5,
    speed: 8, road: 16.7, turn: .45, accel: 1.2, slopeMax: .4,
    hp: 25, rcs: 0.5, dieTime: 20,
    cargo: 2, reload: { perRound: 45 }, refill: 30,
    sensors: {},
    weapons: {},
    cost: 160, buildTime: 60,
    parts: {
      chassis: { label: 'MZKT-7930 · 8×8', w: 3, slow: .6 },
      wheelsL: { label: 'Wheels ×4 · L', w: 1, disables: ['move'] },
      wheelsR: { label: 'Wheels ×4 · R', w: 1, disables: ['move'] },
      cab: { label: 'Cab · crew 3', w: 1, slow: .7 },
      bed: { label: 'Bed · 2 TLC cradles', w: 1, lose: { cargo: 1 } },
      stabilisers: { label: 'Stabilisers ×4', w: .5, disables: ['reload'] },
      column: { label: 'Crane column', w: .7, disables: ['reload'] },
      boom: { label: 'Crane boom', w: .7, disables: ['reload'] },
      jib: { label: 'Telescopic jib', w: .4, disables: ['reload'] },
    },
    /* crane pose: the renderer applies TRANSLOADER.reloadPose(st.reload, { slot: st.slot }) (data/models.js) while
       st.reload > 0; bedR / bedL show the TLCs in the cradles (right is unloaded first) */
    modelState(u, t) {
      const s = u.st, r = u.reloadU || 0, slot = u.cargo >= 2 ? 0 : 1, gone = r >= .14;
      s.reload = r; s.slot = slot; s.refill = u.refillU || 0;
      s.bedR = u.cargo >= 2 && !(r > 0 && slot === 0 && gone);
      s.bedL = u.cargo >= 1 && !(r > 0 && slot === 1 && gone);
      s.dep = u.busy || s.refill > 0 ? 1 : 0; s.wheel = wrap(u.odo / .66); s.crane = u.crane; s.cargo = u.cargo; return s;
    },
  },

  bal: {
    type: 'bal', side: 'coast', name: 'Bal', cls: 'TEL', label: 'Bal · 3K60 coastal missile system',
    domain: 'land', model: 'bal',
    size: [14.0, 3.1, 3.6], top: 3.6, topErect: 6,
    speed: 8, road: 16.7, turn: .45, accel: 1.2, slopeMax: .4,
    hp: 30, rcs: 0.5, dieTime: 20,
    deploy: { jacks: 6, erect: 8, elev: .52 },                     // ~14 s from driving to ready to fire
    // the pack (models.js BAL): hinged at its front on piv, containers len long; k-th round leaves container order[k]
    // (tier, column) from its rear end, the pack raised to deploy.elev
    pack: { piv: [0, 1.66, -.35], len: 6.3, cols: [-.96, -.32, .32, .96], rows: [.36, .98], order: [[1, 0], [1, 3], [1, 1], [1, 2], [0, 0], [0, 3], [0, 1], [0, 2]] },
    reload: { depot: 40 },                                        // a round per 40 s at a depot
    sensors: {},
    weapons: {
      uran: { proj: 'uran', ammo: 8, range: 95000, min: 6000, cd: 3, vs: ['sea'], salvo: 4, needs: 'erect', refill: 40 },
    },
    cost: 520, buildTime: 90,
    parts: {
      chassis: { label: 'MZKT-7930 · 8×8', w: 3, slow: .6 },
      wheelsL: { label: 'Wheels ×4 · L', w: 1, disables: ['move'] },
      wheelsR: { label: 'Wheels ×4 · R', w: 1, disables: ['move'] },
      cab: { label: 'Cab', w: 1, slow: .7 },
      cabin: { label: 'Crew cabin · launch control', w: 1.5, disables: ['uran'] },
      pack: { label: 'Containers ×8 · Kh-35U', w: 2, lose: { uran: .5 }, disables: ['reload'] },
      ram: { label: 'Pack ram', w: .8, disables: ['uran'] },
      jacks: { label: 'Outriggers', w: .8, disables: ['deploy', 'uran'] },
    },
    modelState(u, t) {
      const s = u.st; s.elev = u.elev; s.dep = u.dep; s.n = u.ammo.uran; s.wheel = wrap(u.odo / .66); return s;
    },
  },

  ssk: {
    type: 'ssk', side: 'coast', name: 'Kilo 636.3', cls: 'SSK', label: 'Project 636.3 Kilo · SSK',
    domain: 'sea', model: 'ssk',
    // depth: keel depth (m) at periscope depth / deep; dive rate m/s; least water; noise (1 = a ship); speeds surfaced / PD / deep
    sub: { pd: 16, deep: 150, rate: 1.2, water: 30, quiet: .55, snort: 1.8, speeds: [10 * KN, 7 * KN, 17 * KN] },
    size: [73.8, 9.9, 14], top: 7.75, draught: 6.2,
    speed: 17 * KN, turn: .045, accel: .1,
    hp: 45, rcs: 0.6, dieTime: 45,
    sensors: { sonar: { sub: 13000, ship: 28000, gain: .1 }, camera: { range: 9000, gain: .3, mast: true } },
    weapons: {
      klub: { proj: 'kalibr', ammo: 4, range: 75000, min: 8000, cd: 4, vs: ['sea'], salvo: 2, sub: true, refill: 60 },
      t53: { proj: 't53', ammo: 12, range: 14000, min: 800, cd: 8, vs: ['sub', 'sea'], salvo: 1, refill: 40 },
    },
    cost: 820, buildTime: 240,
    parts: {
      bow: { label: 'Bow · sonar · 6 tubes', w: 2, disables: ['sonar'] },
      hull: { label: 'Hull', w: 4, slow: .7 },
      stern: { label: 'Stern', w: 1.5, slow: .6 },
      casing: { label: 'Upper casing', w: 1 },
      sail: { label: 'Sail', w: 1.5 },
      masts: { label: 'Periscopes · masts', w: .6, disables: ['camera', 'klub'] },
      bowPlanes: { label: 'Bow planes', w: .5 },
      sternPlanes: { label: 'Stern planes · rudders', w: .8, slow: .6 },
      prop: { label: 'Propeller', w: .8, slow: .4 },
    },
    modelState(u, t) { const s = u.st; s.mast = u.mastUp; s.prop = wrap((u.propA || 0)); return s; },
  },

  /* ------------------------------------------------------------------ FLEET */
  carrier: {
    type: 'carrier', side: 'fleet', name: 'CVN-68', cls: 'CVN', label: 'Nimitz · CVN',
    domain: 'sea', model: 'carrier', hq: true,
    size: [332.8, 76.8, 62], top: 62, draught: 11.3,
    speed: 30 * KN, turn: .02, accel: .08,
    hp: 300, rcs: 1.6, dieTime: 60,                               // balance: 400 -> 300 (four Oniks hits)
    sensors: { radar: { surf: 45000, air: 110000, land: .3, period: 4, gain: .15, h: 45 } },
    emits: { range: 150000 },
    air: { cap: 12, launchGap: 20, deckY: 19.5, types: ['fighter', 'helo', 'aew'] },   // launches F/A-18E, MH-60R and E-2D
    magazine: { slam: 60, aam: 40, hellfire: 32 },                // aircraft stores aboard; refilled at the replenishment point
    weapons: {
      pdms: { proj: 'pdms', ammo: 16, range: 15000, min: 1000, cd: 2.0, vs: ['missile', 'air'], auto: true, maxEng: 2, maxShots: 4,
              muzzle: [30, 21, -140], vert: false, refill: 30 },
      ciws: { gun: true, ammo: 60, range: 2000, cd: 1.0, vs: ['missile', 'air'], auto: true,
              pk: { missile: .12, air: .3 }, dmg: 4, muzzle: [-34, 20, 120], burst: .9, refill: 8 },
    },
    cost: 0, buildTime: 0,
    parts: {
      hull: { label: 'Hull · CVN Nimitz class', w: 5, slow: .7 },
      deck: { label: 'Flight deck', w: 3, disables: ['air'] },
      island: { label: 'Island', w: 2, disables: ['radar'] },
      radars: { label: 'AN/SPS-48E · AN/SPS-49', w: 1, disables: ['radar'] },
      cats: { label: 'C-13 catapults ×4', w: 1, disables: ['air'] },
      elevators: { label: 'Aircraft elevators ×4', w: 1 },
      air: { label: 'Air wing', w: 1 },
    },
    modelState(u, t) { const s = u.st; s.radar = spin(u, t, TAU / 4); return s; },
  },

  ddg: {
    type: 'ddg', side: 'fleet', name: 'DDG-51', cls: 'DDG', label: 'Arleigh Burke · DDG',
    domain: 'sea', model: 'destroyer',
    size: [155, 20, 45], top: 45, draught: 9.4,
    speed: 30 * KN, turn: .03, accel: .15,
    hp: 110, rcs: 1.0, dieTime: 60,
    // AN/SQS-53C hull sonar: hears submerged boats close by (less at speed)
    sensors: { radar: { surf: 45000, air: 110000, land: .3, period: 1, gain: .1, h: 20 }, sonar: { sub: 11000, ship: 0, gain: .12, hull: true } },
    emits: { range: 150000 },
    scan: { reach: 60000, r: 4000, cd: 90 },
    air: { cap: 2, launchGap: 30, deckY: 8, types: ['helo'] },       // Flight IIA hangar: two MH-60R
    weapons: {
      sm6: { proj: 'sm6', ammo: 32, range: 60000, airRange: 35000, min: 2000, cd: 1.0, vs: ['missile', 'air'], auto: true, maxEng: 2, maxShots: 2, needsRadar: true,
             vls: true, refill: 20 },
      strike: { proj: 'tlam', ammo: 8, range: 120000, min: 10000, cd: 2.0, vs: ['land'], salvo: 2, vls: true, refill: 30 },
      gun5: { proj: 'shell', ammo: 300, range: 24000, min: 1500, cd: 3.0, vs: ['land', 'sea'], salvo: 6,
              muzzle: [0, 9, 60], refill: 2 },
      ciws: { gun: true, ammo: 40, range: 2000, cd: 1.0, vs: ['missile', 'air'], auto: true, mounts: ['ciwsF', 'ciwsA'],
              pk: { missile: .12, air: .3 }, dmg: 4, burst: .9, refill: 8 },
      svtt: { proj: 'mk54', ammo: 6, range: 8000, min: 500, cd: 6, vs: ['sub'], salvo: 1, muzzle: [4.6, 3.2, -14], refill: 30 },   // Mk 32 tubes ×2
    },
    cost: 1400, buildTime: 240,
    parts: {
      hull: { label: 'Hull', w: 5, slow: .7 },
      super: { label: 'Superstructure', w: 2 },
      mast: { label: 'Mast', w: 1, disables: ['scan'] },
      spy: { label: 'AN/SPY-1D ×4', w: 2, disables: ['radar', 'sm6'] },
      stacks: { label: 'Stacks · LM2500', w: 1, slow: .5 },
      sps: { label: 'AN/SPS-67(V)3', w: .5 },
      gun: { label: 'Mk 45 5"/62', w: 1, disables: ['gun5'] },
      vlsF: { label: 'Mk 41 VLS · 32 cells', w: 1, lose: { sm6: .33, strike: .33 } },
      vlsA: { label: 'Mk 41 VLS · 64 cells', w: 1.5, lose: { sm6: .67, strike: .67 } },
      ciwsF: { label: 'Phalanx 1B · fwd', w: .7, disables: ['ciwsF'] },
      ciwsA: { label: 'Phalanx 1B · aft', w: .7, disables: ['ciwsA'] },
      hangar: { label: 'Hangar', w: 1, disables: ['air'] },
      boats: { label: 'RHIB', w: .3 },
      decoys: { label: 'Mk 36 · Nulka', w: .3 },
    },
    modelState(u, t) {
      const s = u.st; s.sps = spin(u, t, TAU / 2.5); s.gunYaw = u.tYaw; s.gunPitch = u.tPitch;
      if (!s.ciwsYaw) { s.ciwsYaw = [0, Math.PI]; s.ciwsPitch = [.35, .35]; }
      s.ciwsYaw[0] = u.cYaw[0]; s.ciwsYaw[1] = u.cYaw[1]; s.ciwsPitch[0] = u.cPitch[0]; s.ciwsPitch[1] = u.cPitch[1];
      s.ciwsSpin = u.cSpin; s.vlsOpen = u.vlsOpen; return s;
    },
  },

  helo: {
    type: 'helo', side: 'fleet', name: 'MH-60R', cls: 'HELO', label: 'MH-60R Seahawk',
    domain: 'air', model: 'helo',
    size: [19.8, 16.4, 5.1], alt: [60, 150], altDef: 100,
    speed: 70, turn: .3, climb: 8, accel: 3,
    hp: 12, rcs: 0.5, dieTime: 8, endurance: 9000, rearm: 150,
    sensors: {
      radar: { surf: 60000, air: 25000, land: .35, period: 3, gain: .15, h: 0 },
      camera: { range: 10000, gain: .3 },
      sonar: { sub: 9000, ship: 0, gain: .18, dip: true },       // AN/AQS-22 dipping sonar: only while hovering
    },
    emits: { range: 80000 },
    scan: { reach: 20000, r: 3000, cd: 90 },
    weapons: {
      hellfire: { proj: 'hellfire', ammo: 4, range: 8000, min: 500, cd: 3.0, vs: ['land', 'sea'], salvo: 2 },
      mk54: { proj: 'mk54', ammo: 2, range: 3500, min: 0, cd: 5, vs: ['sub'], salvo: 1 },
    },
    cost: 220, buildTime: 60,
    parts: {
      fuselage: { label: 'Fuselage', w: 3 },
      rotor: { label: 'Main rotor · 16.36 m', w: 1, fatal: true },
      tailrotor: { label: 'Tail rotor', w: .5, fatal: true },
      tail: { label: 'Tail boom', w: 1, slow: .6 },
      gear: { label: 'Landing gear', w: .5 },
      sensors: { label: 'AN/APS-153 · MTS-FLIR · AQS-22', w: 1, disables: ['radar', 'camera', 'scan', 'sonar'] },
      pylons: { label: 'Pylons · Hellfire · Mk 54', w: .5, disables: ['hellfire', 'mk54'] },
    },
    modelState(u, t) {
      const s = u.st, on = !u.aboard || u.spool > 0;
      s.rotor = on ? spin(u, t, 27) : 0; s.trotor = on ? spin(u, t, 124) : 0; s.droop = u.aboard ? 1 - u.spool : 0; return s;
    },
  },

  fighter: {
    type: 'fighter', side: 'fleet', name: 'F/A-18E', cls: 'FTR', label: 'F/A-18E Super Hornet',
    domain: 'air', model: 'fighter',
    size: [18.3, 13.6, 4.9], alt: [3000, 8000], altDef: 6000,
    speed: 250, turn: .15, climb: 90, accel: 25,
    hp: 15, rcs: 0.6, dieTime: 10, endurance: 5400, rearm: 240,
    sensors: { radar: { surf: 60000, air: 90000, land: .4, period: 2, gain: .12, h: 0 } },
    emits: { range: 110000 },
    weapons: {
      slam: { proj: 'slam', ammo: 2, range: 80000, min: 8000, cd: 2.0, vs: ['land', 'sea'], salvo: 2 },
      aam: { proj: 'aam', ammo: 2, range: 50000, min: 1000, cd: 2.0, vs: ['air'], auto: true, maxEng: 1 },
    },
    cost: 320, buildTime: 60,
    parts: {
      fuselage: { label: 'Fuselage', w: 3 },
      lex: { label: 'LEX', w: 1 },
      wings: { label: 'Wings', w: 2, fatal: true },
      tails: { label: 'Twin tails', w: 1, slow: .8 },
      stabs: { label: 'Stabilators', w: 1, slow: .8 },
      canopy: { label: 'Canopy', w: .5, fatal: true },
      intakes: { label: 'Intakes · F414', w: 1, slow: .7 },
      nozzles: { label: 'Nozzles · F414', w: 1, slow: .7 },
      pylons: { label: 'Pylons', w: .5, disables: ['slam', 'aam'] },
    },
    modelState(u, t) {
      const s = u.st; s.fan = u.aboard ? 0 : spin(u, t, 60); s.ab = u.ab; s.nozzle = u.aboard ? 0 : .35 + .65 * u.ab; return s;
    },
  },

  aew: {
    type: 'aew', side: 'fleet', name: 'E-2D', cls: 'AEW', label: 'E-2D Advanced Hawkeye',
    domain: 'air', model: 'aew',
    size: [17.6, 24.56, 5.58], alt: [6000, 9000], altDef: 7600,
    speed: 150, turn: .1, climb: 15, accel: 5,
    hp: 12, rcs: 1.0, dieTime: 10, endurance: 14400, rearm: 300,
    // AN/APY-9: the rotodome turns once in 10 s (the sweep period); game-scaled reach over the horizon
    sensors: { radar: { surf: 110000, air: 140000, land: .12, period: 10, gain: .14, h: 0, skim: .45 } },   // an air and sea search radar: little over land
    emits: { range: 200000 },
    weapons: {},
    cost: 420, buildTime: 120,
    parts: {
      fuselage: { label: 'Fuselage', w: 3 },
      wing: { label: 'Wing centre section', w: 1.5, fatal: true },
      outerL: { label: 'Outer wing · L', w: 1, slow: .7 },
      outerR: { label: 'Outer wing · R', w: 1, slow: .7 },
      nacelleL: { label: 'T56 nacelle · L', w: 1, slow: .6 },
      nacelleR: { label: 'T56 nacelle · R', w: 1, slow: .6 },
      propL: { label: 'Propeller · L', w: .5, slow: .7 },
      propR: { label: 'Propeller · R', w: .5, slow: .7 },
      pylon: { label: 'Rotodome pylon', w: .5, disables: ['radar'] },
      dome: { label: 'Rotodome · AN/APY-9', w: 1.5, disables: ['radar'] },
      tail: { label: 'Tailplane · four fins', w: 1, slow: .8 },
      hook: { label: 'Arresting hook', w: .2 },
    },
    // the rotodome is the radar antenna: it turns with the sweep and stops under EMCON or on deck (wings folded)
    modelState(u, t) {
      const s = u.st, on = !u.aboard || u.spool > 0;
      s.dome = antAt(u, t); s.prop = on ? spin(u, t, 70) : 0; s.fold = u.aboard ? 1 - u.spool : 0; return s;
    },
  },

  ssn: {
    type: 'ssn', side: 'fleet', name: 'SSN-774', cls: 'SSN', label: 'Virginia · SSN',
    domain: 'sea', model: 'ssn',
    sub: { pd: 18, deep: 180, rate: 1.5, water: 36, quiet: .4, speeds: [12 * KN, 10 * KN, 25 * KN] },
    size: [114.9, 10.4, 17.2], top: 7.9, draught: 9.3,
    speed: 25 * KN, turn: .035, accel: .1,
    hp: 70, rcs: 0.8, dieTime: 60,
    sensors: { sonar: { sub: 17000, ship: 32000, gain: .1 }, camera: { range: 10000, gain: .3, mast: true } },
    weapons: {
      strike: { proj: 'tlam', ammo: 12, range: 120000, min: 10000, cd: 3.0, vs: ['land'], salvo: 2, vls: true, sub: true, refill: 40 },
      mk48: { proj: 'mk48', ammo: 12, range: 16000, min: 800, cd: 8, vs: ['sub', 'sea'], salvo: 1, refill: 40 },
    },
    // VPT cell tops (ship frame, surfaced): the launch points of the strike rounds
    vlsAt: (() => { const out = []; for (let i = 0; i < 12; i++) { const t = i < 6 ? 0 : 1, a = (i % 6) / 6 * TAU + Math.PI / 6, z = [46.2, 42.6][t]; out.push([Math.sin(a) * .62, 1.0, z + Math.cos(a) * .62]); } return out; })(),
    cost: 1500, buildTime: 300,
    parts: {
      bow: { label: 'Large Aperture Bow · sonar', w: 2, disables: ['sonar'] },
      hull: { label: 'Hull', w: 5, slow: .7 },
      stern: { label: 'Stern', w: 2, slow: .6 },
      sail: { label: 'Sail', w: 1.5 },
      masts: { label: 'Photonics masts', w: .6, disables: ['camera'] },
      vpt: { label: 'Virginia Payload Tubes', w: 1, disables: ['strike'] },
      bowPlanes: { label: 'Bow planes', w: .5 },
      sternPlanes: { label: 'Stern planes · rudders', w: .8, slow: .6 },
      arrays: { label: 'Flank arrays', w: .8 },
      propulsor: { label: 'Pump-jet propulsor', w: .8, slow: .4 },
    },
    modelState(u, t) {
      const s = u.st; s.mast = u.mastUp; s.prop = wrap(u.propA || 0);
      s.vptA = 0; s.vptB = 0;
      for (const [cell, f] of u.vlsOpen) { if (cell % 12 < 6) s.vptA = Math.max(s.vptA, f); else s.vptB = Math.max(s.vptB, f); }
      return s;
    },
  },
};

/* Projectiles and gun rounds (kind -> stats). mode: 'cruise' holds an altitude profile and flies to the
   aim point; 'direct' flies at a moving point; 'ballistic' is a shell arc. pk = hit chance on arrival
   (per target domain for interceptors), reach = how far the target may be from the aim point and still be
   reached (a stale track misses). */
export const PROJ = {
  oniks: { name: '3M55 Oniks', cls: 'ASCM', model: 'oniks', boosterModel: 'oniks_booster', mode: 'cruise', threat: true, speed: 750, dmg: 80, pk: .85, reach: 4000,
           rcs: .3, vert: 1.4, v0: 30, boost: 6, sepAt: 7, alt: 40, seaAlt: 15, pitchMax: .55, pitchRate: .35, turn: .25,
           finalDist: 25000, finalAlt: 10 },
  tlam: { name: 'RGM-109 Tomahawk', cls: 'LACM', model: 'tomahawk', boosterModel: null, mode: 'cruise', threat: true, speed: 245, dmg: 45, pk: .9, reach: 1500,
          rcs: .15, vert: 2.0, v0: 25, boost: 12, sepAt: 12, alt: 60, pitchMax: .5, pitchRate: .3, turn: .12,
          finalDist: 4000, finalAlt: 25 },
  slam: { name: 'AGM-84H SLAM-ER', cls: 'ASM', model: 'slam', mode: 'cruise', threat: true, speed: 240, dmg: 40, pk: .85, reach: 1500,
          rcs: .15, vert: 0, v0: 0, boost: 3, alt: 90, pitchMax: .35, pitchRate: .25, turn: .12, finalDist: 4000, finalAlt: 25 },
  hellfire: { name: 'AGM-114 Hellfire', cls: 'ATGM', model: 'hellfire', mode: 'direct', threat: true, speed: 400, dmg: 25, pk: .8, reach: 400,
              rcs: .03, vert: 0, v0: 0, boost: 2.5, turn: .6, pitchRate: .6 },
  sm6: { name: 'RIM-174 SM-6', cls: 'SAM', model: 'sm6', boosterModel: 'mk72', mode: 'direct', speed: 1100, dmg: 15, pk: { missile: .15, air: .75 },
         vert: 2.0, v0: 20, boost: 6, sepAt: 6, turn: .35, pitchRate: .28 },
  pdms: { name: 'RIM-162 ESSM', cls: 'SAM', model: 'essm', mode: 'direct', speed: 1000, dmg: 12, pk: { missile: .15, air: .7 },
          vert: 1.0, v0: 20, boost: 3, turn: .5, pitchRate: .45 },
  sam: { name: '57E6', cls: 'SAM', model: 'sam57e6', mode: 'direct', speed: 900, dmg: 12, pk: { missile: .22, air: .75 },
         vert: 0, v0: 60, boost: 2.4, sepAt: 2.4, turn: .6, pitchRate: .6 },
  aam: { name: 'AIM-120D', cls: 'AAM', model: 'aim120', mode: 'direct', speed: 1200, dmg: 15, pk: { air: .7, missile: 0 },
         vert: 0, v0: 0, boost: 3, turn: .5, pitchRate: .5 },
  shell: { name: '5"/62 round', cls: 'SHELL', model: 'shell', mode: 'ballistic', speed: 810, dmg: 6, pk: 1, sigma: 40 },
  uran: { name: 'Kh-35U', cls: 'ASCM', model: 'kh35', boosterModel: null, mode: 'cruise', threat: true, speed: 270, dmg: 35, pk: .82, reach: 3000,
          rcs: .1, vert: 0, v0: 35, boost: 2, sepAt: 2, alt: 25, seaAlt: 10, pitchMax: .45, pitchRate: .35, turn: .3,
          finalDist: 12000, finalAlt: 5 },
  kalibr: { name: '3M-54 Kalibr', cls: 'ASCM', model: 'kalibr', boosterModel: null, mode: 'cruise', threat: true, speed: 280, dmg: 55, pk: .85, reach: 4000,
            rcs: .15, vert: 1.6, v0: 25, boost: 5, sepAt: 5, alt: 30, seaAlt: 15, pitchMax: .5, pitchRate: .35, turn: .2,
            finalDist: 20000, finalAlt: 8 },
  /* torpedoes run under water (not drawn; heard by sonar): mode 'run' holds a depth and closes on the target once it
     is near the aim point (reach). drop: released from an aircraft, it falls into the sea first */
  mk48: { name: 'Mk 48 torpedo', cls: 'TORP', model: null, mode: 'run', torpedo: true, speed: 28, dmg: 60, pk: .8, reach: 2500, depth: 60, noise: 3 },
  mk54: { name: 'Mk 54 torpedo', cls: 'TORP', model: null, mode: 'run', torpedo: true, speed: 20, dmg: 30, pk: .75, reach: 2000, depth: 40, noise: 2.5 },
  t53: { name: '533 mm torpedo', cls: 'TORP', model: null, mode: 'run', torpedo: true, speed: 25, dmg: 55, pk: .78, reach: 2500, depth: 50, noise: 3 },
};

export function typesOf(side) { return Object.keys(UNITS).filter(k => UNITS[k].side === side); }
export function buyable(side) { return typesOf(side).filter(k => UNITS[k].cost > 0); }

/* sanity: every weapon names a projectile or is a gun; every part list is non-empty */
for (const k in UNITS) {
  const d = UNITS[k];
  for (const w in d.weapons) { const W = d.weapons[w]; W.name = w; if (!W.gun && !PROJ[W.proj]) throw new Error(`units: ${k}.${w} unknown proj ${W.proj}`); }
  d.partNames = Object.keys(d.parts);
  d.partW = d.partNames.reduce((a, p) => a + d.parts[p].w, 0);
}
export { TAU, D2R, KN, KMH, wrap, sat };
