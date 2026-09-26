/* ONIKS damage modules: what is inside each unit, where, and what happens when it is hit (sim/damage.js; the rules
   in sim/README.md, "Damage: modules and cook-off").

   MODULES[type] = [ M(id, label, part, box, hp, more), ... ]
     id      unique in the unit ('vlsF')                 label  what the UI shows ('Mk 41 VLS · fwd · 32 cells')
     part    the model part it sits in / is drawn by (the visual part it tints; UNITS[type].parts)
     box     [x0, y0, z0, x1, y1, z1] m in the model frame (sim/bodies.js: +Z forward, +Y up, +X starboard; origin on the
             ground for vehicles, at the waterline for ships and surfaced boats, mid-fuselage for aircraft). Taken from
             the HD model's part bounds (the cutaway models' interior parts: data/models*.js *_cut, default state)
     hp      damage it takes before it is destroyed (the same hp as the unit's; a module keeps what it has taken)
     more:
       disables  capability tokens switched off when it is destroyed (as sim/README.md: 'move', 'radar', 'camera',
                 'scan', 'deploy', 'air', 'reload', 'launch', 'sonar', 'well', weapon names)
       group     disables apply only once every module of the same group is destroyed (twin engines, the SPY faces)
       slow      speed factor while destroyed (multiplies: two engine rooms at .6 leave .36)
       lose      { weapon: fraction } of that ammunition lost (cargo: TLCs aboard)
       fatal     the unit is lost when it is destroyed (a wing, a main rotor)
       armor     0..1: the share of a charge it shrugs off (magazines deep in a hull, a reactor compartment)
       cook      explosion risk: { p, size, out, ammo, dmg, fire, burn }
                   p     the cook-off chance of a hit that destroys it outright (rises with damage: see COOK)
                   size  how big it goes (m: the fireball / blast radius the visuals scale to; 'cookoff' event)
                   out   'kill' (default): the unit is destroyed outright; 'heavy' (big ships): dmg hp of structural
                         damage bursting from the module (it reaches size x COOK.chainR and may set off its neighbours)
                         and a fire burning burn hp/s for fire s
                   ammo  only while there is something to go up: a weapon name (or several: any > 0), 'cargo'
       contents  what goes up in one cook-off, for the blast solver (game/src/blast; ships): { he (kg TNT-eq of explosive
                 fill), det (the share of it that detonates at once; the rest burns), prop (kg of propellant that burns: gas
                 ~0.25 TNT-eq), fuel (kg), vapour (kg of fuel vapour that deflagrates, capped ~0.8 MPa in its space) }.
                 Coarse public figures (an 8-cell Mk 41 module, a magazine's racks, a tank's ullage), not an inventory

   Munitions carry no internals here: a charge is its PROJ dmg only (its reach: COOK.reach). */

/* the rules' numbers (sim/damage.js) */
export const COOK = {
  reach: 1.2,        // a charge of dmg hp reaches reach x sqrt(dmg) m inside (Oniks 80: 10.7 m, Tomahawk 45: 8 m, 5" 6: 2.9 m)
  reachMin: .5,      // (a gun round's few hp: half a metre)
  reachMax: 14,
  pen: 2,            // a round that struck bursts this far inside along its path (m; at most 0.3 x its reach)
  bite: 3,           // a hit's cook-off chance scales with its size: full when it deals 1/bite of the module's hp
  over: .5,          // a cook-off kill leaves the unit at -over x hpMax (a ship goes down fast and hard)
  chainR: .5,        // a heavy cook-off's blast reaches size x chainR m from the module
  depth: 2,          // how many cook-offs one can set off in a chain
};

/* the hull itself (it has no box): a ship whose hull part is wrecked (u.parts.hull at 1, about 45 % of her hp in hits
   on it: holed along her length, compartments open to the sea) keeps to this fraction of her speed for good
   (multiplies u.slowK, sim/damage.js). Her machinery's losses are the modules' (engine rooms, shafts). */
export const HULL_SLOW = { carrier: .7, lhd: .7, ddg: .7, cg: .7, lcs: .6, ssn: .7, ssk: .7, lcac: .7 };

const M = (id, label, part, box, hp, more) => Object.assign({ id, label, part, box, hp }, more || {});
const kill = (p, size, ammo) => ({ p, size, out: 'kill', ammo });
const heavy = (p, size, dmg, fire, burn, ammo) => ({ p, size, out: 'heavy', dmg, fire, burn, ammo });
/* contents (blast solver): an 8-cell VLS module (missiles' fill and motors), a gun magazine's racks, fuel */
const VLS8 = { he: 480, det: .5, prop: 3600 };
const MAG5 = { he: 600, det: .15, prop: 1200 };
const fuelOf = (kg, vapour) => ({ fuel: kg, vapour });

/* the MZKT-7930 8x8 every Bastion vehicle stands on (cab, YaMZ-846, tank, wheel runs) */
const mzkt = () => [
  M('cab', 'Cab · crew 3', 'cab', [-1.9, .7, 4.1, 1.9, 3.4, 6.6], 10, { slow: .7 }),
  M('engine', 'YaMZ-846 · V12 diesel · 500 hp', 'chassis', [-1.4, 1.2, 2.7, 1.4, 2.8, 4.2], 10, { disables: ['move'] }),
  M('fuel', 'Fuel tank · diesel', 'chassis', [-1.6, .7, -1.9, -.9, 1.5, .5], 8, { cook: kill(.2, 6) }),
];
const wheelsLR = (partL, partR, hp) => [
  M('wheelsL', 'Wheels ×4 · L', partL, [-1.6, 0, -5.7, -1, 1.5, 5.2], hp, { slow: .5, group: 'wheels', disables: ['move'] }),
  M('wheelsR', 'Wheels ×4 · R', partR, [1, 0, -5.7, 1.6, 1.5, 5.2], hp, { slow: .5, group: 'wheels', disables: ['move'] }),
];

export const MODULES = {
  /* ------------------------------------------------------------------ COAST */
  hq: [
    M('cmdA', 'Command shelter 1 · consoles', 'shelterA', [-5.7, 1.3, -3.8, -3.1, 3.7, 2.5], 30),
    M('cmdB', 'Command shelter 2 · consoles', 'shelterB', [3.1, 1.3, -6.1, 5.9, 3.7, .4], 30),
    M('comms', 'Comms shelter · 20 ft ISO', 'container', [-3.9, 0, -12.8, 3.2, 2.6, -10.3], 20, { disables: ['scan'] }),
    M('mast', 'Antenna mast · 18 m', 'mast', [-1.7, 0, 8, 1.7, 18.6, 10.4], 15, { disables: ['scan'] }),
    M('genset', 'Diesel generator · fuel tank', 'generator', [9.4, 0, -9.6, 14.9, 2.7, -7.4], 12, { cook: heavy(.35, 8, 8, 30, .1) }),
  ],

  tel: [
    M('canL', '3M55 in TLC · L', 'launcher', [-1.3, 1.4, -6.9, 0, 3.1, 2.7], 12, { lose: { oniks: .5 }, cook: kill(.45, 18, 'oniks') }),
    M('canR', '3M55 in TLC · R', 'launcher', [0, 1.4, -6.9, 1.3, 3.1, 2.7], 12, { lose: { oniks: .5 }, cook: kill(.45, 18, 'oniks') }),
    M('ram', 'Erector ram · 3-stage hydraulic', 'ram', [-.2, 1.2, -2.6, .2, 1.7, 2.6], 8, { disables: ['oniks'] }),
    M('jacks', 'Outrigger jacks ×4', 'jacks', [-2, 0, -6.8, 2, .9, 1.5], 10, { disables: ['deploy', 'oniks'] }),
    ...mzkt(), ...wheelsLR('wheels', 'wheels', 12),
  ],

  radar: [
    M('array', 'Monolith-B · planar array', 'array', [-2.5, 10.2, -6, 2.5, 12.3, -5], 8, { disables: ['radar', 'scan'] }),
    M('mast', 'Telescopic mast', 'mast', [-.3, 1.6, -5.4, .3, 11, -4.8], 8, { disables: ['radar', 'scan'] }),
    M('consoles', 'Operator consoles ×2 · racks ×4', 'body', [-1.4, 1.5, -4.7, 1.4, 3.4, 1.7], 12, { disables: ['radar', 'scan'] }),
    ...mzkt(), ...wheelsLR('wheels', 'wheels', 12),
  ],

  pantsir: [
    M('search', '1RS1-E search radar', 'searchRadar', [-1, 3.9, -2.9, 1, 5, -2.5], 6, { disables: ['radar'] }),
    M('track', '1RS2-E tracking radar', 'trackRadar', [-.5, 2.8, -1.3, .5, 3.8, -1], 6, { disables: ['sam'] }),
    M('guns', '2A38M 30 mm ×2', 'guns', [-1.3, 2.6, -3.1, 1.3, 3.7, .9], 8, { disables: ['gun30'] }),
    M('packL', '57E6 ×6 · pack L', 'missiles', [-1.5, 2.9, -3.6, -.9, 3.9, -.3], 6, { lose: { sam: .5 }, cook: kill(.3, 10, 'sam') }),
    M('packR', '57E6 ×6 · pack R', 'missiles', [.9, 2.9, -3.6, 1.5, 3.9, -.3], 6, { lose: { sam: .5 }, cook: kill(.3, 10, 'sam') }),
    M('power', 'Power unit · fire control racks', 'chassis', [-1.2, 1.3, -4, 1.2, 2.5, 2.7], 14, { disables: ['sam', 'gun30'] }),
    M('cab', 'Cab · crew 3', 'cab', [-1.7, .6, 3.2, 1.7, 3.3, 5.6], 10, { slow: .7 }),
    M('engine', 'KamAZ-740 · V8 diesel', 'chassis', [-.6, .7, 2.8, .6, 1.7, 5.1], 8, { disables: ['move'] }),
    M('wheelsL', 'Wheels ×4 · L', 'wheels', [-1.3, 0, -3.9, -.8, 1.3, 4.5], 10, { slow: .5, group: 'wheels', disables: ['move'] }),
    M('wheelsR', 'Wheels ×4 · R', 'wheels', [.9, 0, -3.9, 1.3, 1.3, 4.5], 10, { slow: .5, group: 'wheels', disables: ['move'] }),
  ],

  catapult: [
    M('trailer', 'Launch trailer', 'trailer', [-.9, 0, -1.65, .9, .95, 2.49], 8, { disables: ['move'] }),
    M('rail', 'Pneumatic launch rail', 'rail', [-.49, .51, -2.05, .49, 2.17, 2.82], 8, { disables: ['launch'] }),
    M('carriage', 'Carriage', 'carriage', [-.14, 1.06, -1.93, .14, 1.26, -1.42], 3, { disables: ['launch'] }),
  ],

  drone: [
    M('engine', 'Engine · single-cylinder', 'prop', [-.07, -.1, .45, .08, .03, 1], 1.2, { fatal: true }),
    M('fuel', 'Fuel tank', 'fuselage', [-.1, -.1, -.1, .1, .1, .2], 1, { cook: kill(.3, 2) }),
    M('wingL', 'Wing · L', 'wing', [-1.55, .11, -.14, -.1, .23, .18], 1.5, { fatal: true }),
    M('wingR', 'Wing · R', 'wing', [.1, .11, -.14, 1.55, .23, .18], 1.5, { fatal: true }),
    M('gimbal', 'EO gimbal', 'gimbal', [-.07, -.27, .29, .07, -.12, .43], .8, { disables: ['camera', 'scan'] }),
  ],

  transloader: [
    M('tlcL', '3M55 in TLC · L', 'bed', [-1.3, 1.6, -7.4, -.1, 2.8, 2.2], 12, { lose: { cargo: 1 }, cook: kill(.45, 18, 'cargo') }),
    M('tlcR', '3M55 in TLC · R', 'bed', [.2, 1.6, -7.4, 1.3, 2.8, 2.2], 12, { lose: { cargo: 1 }, cook: kill(.45, 18, 'cargo') }),
    M('crane', 'Crane · column and boom', 'column', [-.8, 1.5, -2.4, .6, 3.9, 3.5], 10, { disables: ['reload'] }),
    M('stab', 'Stabilisers ×4', 'stabilisers', [-2, 0, -6.6, 2.1, 1.3, 2.9], 10, { disables: ['reload'] }),
    ...mzkt(), ...wheelsLR('wheelsL', 'wheelsR', 12),
  ],

  bal: [
    M('packL', 'Kh-35U containers ×4 · L', 'pack', [-1.3, 1.6, -6.7, 0, 3.1, -.3], 12, { lose: { uran: .5 }, cook: kill(.35, 12, 'uran') }),
    M('packR', 'Kh-35U containers ×4 · R', 'pack', [0, 1.6, -6.7, 1.3, 3.1, -.3], 12, { lose: { uran: .5 }, cook: kill(.35, 12, 'uran') }),
    M('ram', 'Pack ram', 'ram', [-.2, 1.4, -3.8, .2, 1.8, -2.9], 8, { disables: ['uran'] }),
    M('consoles', 'Launch control · consoles', 'cabin', [-1.2, 1.5, .2, 1, 3.1, 2.6], 12, { disables: ['uran'] }),
    M('jacks', 'Outrigger jacks ×4', 'jacks', [-2, 0, -6.8, 2, .9, 1.5], 10, { disables: ['deploy', 'uran'] }),
    ...mzkt(), ...wheelsLR('wheelsL', 'wheelsR', 12),
  ],

  ssk: [
    M('torpRoom', 'Torpedo room · 6 tubes · 12 reloads', 'bow', [-3.4, -4, 17.5, 3.4, -.5, 36.7], 20, { armor: .2, cook: kill(.3, 20, ['t53', 'klub']), contents: { he: 1000, det: .25, prop: 300 } }),
    M('sonar', 'MGK-400EM sonar · bow array', 'bow', [-4.4, -6.3, 30, 4.4, 2.5, 36.9], 12, { disables: ['sonar'] }),
    M('control', 'Control room · attack centre', 'hull', [-3.5, -1.6, -3.5, 3.5, 2.5, 8.5], 15, { disables: ['klub', 't53'], group: 'fc' }),
    M('battery', 'Battery · 2 × 120 cells', 'hull', [-3.3, -5.5, -4, 3.3, -3.8, 16.5], 20, { armor: .2, slow: .5, cook: kill(.12, 10) }),
    M('diesels', 'Diesel generators ×2', 'stern', [-2.7, -3.3, -15.5, 2.7, -1, -7.9], 15, { slow: .8 }),
    M('motor', 'Main motor · shaft', 'stern', [-1.5, -3.4, -34.4, 1.5, -.4, -18.6], 15, { slow: .4 }),
    M('masts', 'Periscopes · masts', 'masts', [-.7, 7.8, -3.2, .7, 13.5, 5.8], 6, { disables: ['camera', 'klub'] }),
    M('planes', 'Stern planes · rudders', 'sternPlanes', [-5.3, -6.9, -32.2, 5.3, 3, -26.5], 12, { slow: .6 }),
  ],

  kornet: [
    M('packL', '9M133 ×4 · launch pack L', 'packL', [-.8, 3, -2.3, -.2, 3.4, -1.1], 3, { lose: { kornet: .25 }, cook: kill(.25, 4, 'kornet') }),
    M('packR', '9M133 ×4 · launch pack R', 'packR', [.2, 3, -2.3, .8, 3.4, -1.1], 3, { lose: { kornet: .25 }, cook: kill(.25, 4, 'kornet') }),
    M('reloads', 'Reload rounds · rack', 'cab', [-1, 1.1, -2.6, 1, 2, -1.4], 4, { lose: { kornet: .5 }, cook: kill(.2, 5, 'kornet') }),
    M('sightL', 'Sighting unit · thermal · L', 'sightL', [-.8, 2.6, -2.2, -.3, 3, -1.2], 2, { disables: ['camera'] }),
    M('sightR', 'Sighting / guidance unit · R', 'sightR', [.3, 2.6, -2.2, .8, 3, -1.2], 2, { disables: ['kornet'] }),
    M('engine', 'YaMZ-534 · turbodiesel', 'body', [-.6, .5, -1.5, .6, 1.5, 2.6], 4, { disables: ['move'] }),
    M('wheelsL', 'Wheels ×2 · L', 'wheelsL', [-1.2, 0, -2.2, -.8, 1, 2.2], 4, { slow: .5, group: 'wheels', disables: ['move'] }),
    M('wheelsR', 'Wheels ×2 · R', 'wheelsR', [.8, 0, -2.2, 1.2, 1, 2.2], 4, { slow: .5, group: 'wheels', disables: ['move'] }),
  ],

  s400: [
    M('packL', '48N6 containers ×2 · L', 'pack', [-1.6, 1.8, -8, 0, 3.1, -.5], 12, { lose: { sam48: .5 }, cook: kill(.35, 20, 'sam48') }),
    M('packR', '48N6 containers ×2 · R', 'pack', [0, 1.8, -8, 1.6, 3.1, -.5], 12, { lose: { sam48: .5 }, cook: kill(.35, 20, 'sam48') }),
    M('racks', 'Equipment cabin · launch racks', 'cabin', [-1.2, 1.9, .3, 1.3, 3.9, 3.6], 12, { disables: ['sam48'] }),
    M('ram', 'Erector ram', 'ram', [-.2, 1.6, -4.5, .2, 2, -1.2], 8, { disables: ['sam48'] }),
    M('jacks', 'Outriggers', 'jacks', [-1.5, .6, -8, 1.6, 1.6, -.6], 10, { disables: ['deploy', 'sam48'] }),
    M('engine', 'BAZ-64022 · engine', 'tractor', [-.6, 1, 4.4, .6, 2.1, 6.9], 10, { disables: ['move'] }),
    M('cab', 'Tractor cab', 'tractor', [-1.6, 2.2, 6.9, 1.6, 3.5, 8.2], 8, { slow: .7 }),
    M('wheels', 'Tractor wheels', 'wheelsT', [-1.3, 0, .9, 1.3, 1.3, 7.6], 12, { disables: ['move'] }),
  ],

  s400r: [
    M('array', '92N6E phased array', 'array', [-1.7, 3.75, -5.35, 1.7, 8.35, -4.67], 10, { disables: ['radar'] }),
    M('pedestal', 'Antenna pedestal · drive', 'pedestal', [-1.45, .76, -6.75, 1.45, 3.75, -2.85], 10, { disables: ['radar'] }),
    M('consoles', 'Equipment shelter · consoles', 'shelter', [-1.2, 1.5, -4.2, 1.2, 3.4, 2.85], 12, { disables: ['radar'] }),
    ...mzkt(), ...wheelsLR('wheelsL', 'wheelsR', 12),
  ],

  bereg: [
    M('ammo', '130 mm rounds · racks', 'turret', [-1.3, 1.6, -5.6, 1.4, 2.6, -3.9], 12, { armor: .2, cook: kill(.3, 10, 'gun130') }),
    M('turret', 'Turret · loader', 'turret', [-1.4, 2.6, -5.6, 1.5, 3.9, -.7], 12, { disables: ['gun130'] }),
    M('gun', '130 mm gun', 'gun', [-.6, 2.6, -.7, .6, 3.6, 5.2], 8, { disables: ['gun130'] }),
    M('fc', 'Fire-control compartment · radar', 'body', [-1.5, 1.3, .6, 1.5, 3.2, 4], 12, { disables: ['radar'] }),
    M('engine', 'D12A-525 · diesel', 'cabs', [-.4, 1, 4, .5, 2.2, 5.7], 8, { disables: ['move'] }),
    M('cabs', 'Cabs ×2', 'cabs', [-1.5, .9, 4, 1.6, 3, 6], 8, { slow: .7 }),
    M('wheelsL', 'Wheels ×4 · L', 'wheelsL', [-1.5, 0, -4, -1, 1.5, 4.7], 12, { slow: .5, group: 'wheels', disables: ['move'] }),
    M('wheelsR', 'Wheels ×4 · R', 'wheelsR', [1, 0, -4, 1.5, 1.5, 4.7], 12, { slow: .5, group: 'wheels', disables: ['move'] }),
  ],

  /* ------------------------------------------------------------------ FLEET */
  carrier: [
    M('magF', 'Magazines · forward · bombs and missiles', 'hull', [-14.5, -9.6, 38, 14.5, 4.8, 98], 110, { armor: .5, cook: heavy(.2, 80, 110, 300, .12), contents: { he: 8000, det: .02, prop: 1500 } }),
    M('magA', 'Magazines · aft · bombs and missiles', 'hull', [-14.5, -9.6, -104, 14.5, 4.8, -44], 110, { armor: .5, cook: heavy(.2, 80, 110, 300, .12), contents: { he: 8000, det: .02, prop: 1500 } }),
    M('jp5F', 'Aviation fuel · JP-5 · forward', 'hull', [-16.5, -9.6, 98, 16.5, 2, 130], 80, { armor: .3, cook: heavy(.15, 50, 50, 420, .1), contents: fuelOf(900000, 60) }),
    M('jp5A', 'Aviation fuel · JP-5 · aft', 'hull', [-16.5, -9.6, -130, 16.5, 2, -104], 80, { armor: .3, cook: heavy(.15, 50, 50, 420, .1), contents: fuelOf(900000, 60) }),
    M('hangar', 'Hangar deck · aircraft fuelled and armed', 'hull', [-16.5, 8, -130, 16.5, 16.4, 78], 120, { cook: heavy(.12, 60, 60, 240, .1), contents: { he: 1500, det: .03, prop: 300, fuel: 40000, vapour: 30 } }),
    M('parked', 'Air wing · parked on deck', 'air', [-12, 19.57, -150, 36, 24.5, -60], 60, { cook: heavy(.15, 40, 25, 180, .08), contents: { he: 1000, det: .05, fuel: 30000, vapour: 20 } }),
    M('reactors', 'A4W reactor ×2', 'hull', [-12, -9.6, -24, 12, 6.4, 38], 150, { armor: .6, slow: .3 }),
    M('machinery', 'Main machinery rooms ×2 · turbines ×4', 'hull', [-16.5, -9.6, -44, 16.5, 6.4, 20], 120, { armor: .4, slow: .6 }),
    M('shafts', 'Shafts ×4 · propellers · rudders', 'hull', [-20.1, -10.6, -159.2, 20.1, 0, -92], 100, { armor: .3, slow: .6 }),
    M('catsBow', 'C-13 catapults 1–2 · bow', 'cats', [-12, 17, 60, 12, 20.5, 163], 60, { group: 'cats', disables: ['air'] }),
    M('catsWaist', 'C-13 catapults 3–4 · waist', 'cats', [-36.5, 17, -50, 0, 20.5, 60], 60, { group: 'cats', disables: ['air'] }),
    M('landing', 'Landing area · arresting gear', 'deck', [-42.2, 16.8, -166, 13.6, 22, -46.9], 120, { disables: ['air'] }),
    M('prifly', 'Island · bridge · Pri-Fly', 'island', [21.7, 19.5, -47.2, 33.9, 40.2, -8], 50),
    M('sps48', 'AN/SPS-48E', 'radars', [24.7, 45.4, -17.5, 30.5, 52.9, -15.6], 20, { group: 'radar', disables: ['radar'] }),
    M('sps49', 'AN/SPS-49', 'radars', [24.2, 41.4, -44.6, 29.6, 47.3, -37.9], 20, { group: 'radar', disables: ['radar'] }),
  ],

  ddg: [
    M('vlsF', 'Mk 41 VLS · fwd · 32 cells', 'vlsF', [-4.2, -.9, 37.2, 4.2, 7.4, 40.6], 35, { lose: { sm6: .33, strike: .33 }, cook: kill(.22, 45, ['sm6', 'strike']), contents: VLS8 }),
    M('vlsA', 'Mk 41 VLS · aft · 64 cells', 'vlsA', [-4.2, -2.1, -32.8, 4.2, 6.2, -26], 45, { lose: { sm6: .67, strike: .67 }, cook: kill(.22, 60, ['sm6', 'strike']), contents: VLS8 }),
    M('gun', 'Mk 45 Mod 4 · 5"/62', 'gun', [-2, 7.8, 46.2, 2.1, 10.2, 56.8], 20, { disables: ['gun5'] }),
    M('mag5', 'Gun magazine · 5" rounds', 'hull', [-3.5, -4, 44, 3.5, 6.5, 52], 30, { armor: .3, cook: kill(.2, 25, 'gun5'), contents: MAG5 }),
    M('spyF', 'AN/SPY-1D · fwd faces', 'spy', [-7, 12.1, 20, 7, 15.7, 30], 30, { group: 'spy', disables: ['radar', 'sm6'] }),
    M('spyA', 'AN/SPY-1D · aft faces', 'spy', [-7, 12.1, 9.1, 7, 15.7, 20], 30, { group: 'spy', disables: ['radar', 'sm6'] }),
    M('bridge', 'Bridge · CIC below', 'super', [-8, 11, 24, 8, 19, 35.5], 30, { slow: .8 }),
    M('mast', 'Mast · SPS-67 · datalinks', 'mast', [-6.6, 20.5, 14.9, 6.6, 44.8, 23.1], 15, { disables: ['scan'] }),
    M('engF', 'Engine room 1 · LM2500 ×2', 'hull', [-5.4, -5.7, -8, 4.4, -.9, 8.3], 40, { slow: .6 }),
    M('engA', 'Engine room 2 · LM2500 ×2', 'hull', [-5.4, -5.7, -26.8, 4.4, -.9, -8], 40, { slow: .6 }),
    M('shafts', 'Shafts ×2 · CRP propellers', 'hull', [-6.5, -7.2, -72.5, 6.5, 0, -39.7], 30, { slow: .5 }),
    M('hangar', 'Hangars ×2 · MH-60R', 'hangar', [-7.5, 5.8, -53, 7.5, 11.5, -36.3], 30, { disables: ['air'] }),
    M('jp5', 'Aviation fuel · JP-5', 'hull', [-4, -4, -60, 4, 4, -53], 20, { cook: heavy(.25, 25, 35, 150, .1), contents: fuelOf(60000, 25) }),
    M('ciwsF', 'Phalanx 1B · fwd', 'ciwsF', [-1, 11, 31.6, 1.1, 14.4, 35], 8, { disables: ['ciwsF'] }),
    M('ciwsA', 'Phalanx 1B · aft', 'ciwsA', [-1.1, 13.9, -49.6, 1, 17.3, -46.2], 8, { disables: ['ciwsA'] }),
  ],

  helo: [
    M('rotor', 'Main rotor · 16.36 m', 'rotor', [-8.18, 3.51, -8.18, 8.18, 4.51, 8.18], 5, { fatal: true }),
    M('gearbox', 'Main gearbox', 'fuselage', [-.8, 2.5, -1.5, .8, 3.3, .9], 3, { fatal: true }),
    M('engines', 'T700-GE-401C ×2', 'fuselage', [-1.1, 2.7, -.7, 1.1, 3.3, 1], 4, { slow: .5 }),
    M('tailDrive', 'Tail drive shaft', 'tail', [-.2, 2.3, -10, .3, 3.8, -7.1], 2, { fatal: true }),
    M('tailrotor', 'Tail rotor', 'tailrotor', [-.24, 2.08, -11.63, .91, 5.23, -8.27], 2, { fatal: true }),
    M('fuel', 'Fuel cells ×2', 'fuselage', [-.5, 1.3, -3.8, .5, 2.1, -2.6], 3, { cook: kill(.3, 8) }),
    M('sensors', 'AN/APS-153 · MTS-FLIR · AQS-22', 'sensors', [-.7, .26, -1.3, .7, .8, 5.23], 4, { disables: ['radar', 'camera', 'scan', 'sonar'] }),
    M('pylonL', 'Pylon · L', 'pylons', [-2.4, 1.1, -2.6, -1.1, 2, .4], 3, { group: 'pylons', disables: ['hellfire', 'mk54'] }),
    M('pylonR', 'Pylon · R', 'pylons', [1.1, 1.3, -2.6, 2.3, 2, .4], 3, { group: 'pylons', disables: ['hellfire', 'mk54'] }),
  ],

  fighter: [
    M('engL', 'F414-GE-400 · L', 'nozzles', [-1.1, -.7, -7.4, 0, .3, -5], 4, { slow: .7 }),
    M('engR', 'F414-GE-400 · R', 'nozzles', [0, -.7, -7.4, 1.1, .3, -5], 4, { slow: .7 }),
    M('fuel', 'Fuel · fuselage cells ×5 · wing tanks', 'fuselage', [-4.3, -.3, -3.8, 4.3, .5, 2.4], 5, { cook: kill(.3, 12) }),
    M('wingL', 'Wing · L', 'wings', [-6.4, -.1, -4.5, -1, .2, .9], 5, { fatal: true }),
    M('wingR', 'Wing · R', 'wings', [1, -.1, -4.5, 6.4, .2, .9], 5, { fatal: true }),
    M('cockpit', 'Cockpit · crew 1', 'canopy', [-.4, -.3, 2.7, .4, 1.1, 5.2], 3, { fatal: true }),
    M('radar', 'AN/APG-79 radar', 'fuselage', [-.3, -.3, 6.1, .3, .4, 6.9], 2, { disables: ['radar', 'pod'] }),
    M('tails', 'Twin tails', 'tails', [-2.1, .5, -7.6, 2.1, 3.4, -3.5], 4, { slow: .85 }),
    M('pylonL', 'Pylons · L', 'pylons', [-4.4, -.6, -3.2, -2.1, 0, -.4], 3, { group: 'pylons', disables: ['slam', 'aam'] }),
    M('pylonR', 'Pylons · R', 'pylons', [2.1, -.6, -3.2, 4.4, 0, -.4], 3, { group: 'pylons', disables: ['slam', 'aam'] }),
  ],

  aew: [
    M('dome', 'Rotodome · AN/APY-9', 'dome', [-3.7, 2.6, -5.8, 3.7, 3.5, 1.6], 4, { disables: ['radar'] }),
    M('pylon', 'Rotodome pylon', 'pylon', [-.24, 1.1, -3.6, .24, 2.74, -.7], 3, { disables: ['radar'] }),
    M('engL', 'T56 · L', 'nacelleL', [-4.6, -.9, -4.9, -3.1, 1.2, 4.1], 4, { slow: .6 }),
    M('engR', 'T56 · R', 'nacelleR', [3.1, -.9, -4.9, 4.6, 1.2, 4.1], 4, { slow: .6 }),
    M('fuel', 'Wing tanks · centre section', 'wing', [-4.5, .9, -1.9, 4.5, 1.5, 1.7], 4, { cook: kill(.25, 10) }),
    M('spar', 'Wing centre spar', 'wing', [-1.2, .9, -1, 1.2, 1.5, .8], 4, { fatal: true }),
    M('cabin', 'Mission crew · consoles ×3', 'fuselage', [-1, -.7, -3.2, 1.1, 1.1, 7.3], 5, { disables: ['radar'] }),
    M('outerL', 'Outer wing · L', 'outerL', [-12.4, 1, -1.7, -4.4, 1.7, 1.3], 4, { slow: .7 }),
    M('outerR', 'Outer wing · R', 'outerR', [4.4, 1, -1.7, 12.4, 1.7, 1.3], 4, { slow: .7 }),
  ],

  ssn: [
    M('torpRoom', 'Torpedo room · 4 tubes · Mk 48 ×25', 'bow', [-5, -7.3, 20.5, 5, -5.2, 40.6], 30, { armor: .2, cook: kill(.25, 25, 'mk48'), contents: { he: 1200, det: .25, prop: 400 } }),
    M('vpt', 'Virginia Payload Tubes · Tomahawk ×12', 'vpt', [-1.1, -8.7, 41.5, 1.1, 1.3, 47.4], 25, { disables: ['strike'], cook: kill(.25, 25, 'strike'), contents: { he: 1200, det: .2, prop: 1800 } }),
    M('sonar', 'Large Aperture Bow array', 'bow', [-5.2, -9.3, 47.5, 5.2, 1.1, 57.5], 15, { disables: ['sonar'] }),
    M('control', 'Control room · command centre', 'hull', [-4.2, -2, 5, 4.2, 1.1, 20], 20, { disables: ['strike', 'mk48'] }),
    M('reactor', 'S9G reactor compartment', 'hull', [-4.4, -8.3, -6, 4.4, -.2, 6], 40, { armor: .5, slow: .15 }),
    M('engine', 'Engine room · turbines · shaft', 'stern', [-4, -7.3, -51.8, 4, -1.8, -8], 30, { slow: .4 }),
    M('masts', 'Photonics masts', 'masts', [-.8, 7.9, 24, .8, 13.2, 30.6], 6, { disables: ['camera'] }),
    M('planes', 'Stern planes · rudders', 'sternPlanes', [-6.7, -11, -48.4, 6.7, 2.8, -40.5], 12, { slow: .6 }),
  ],

  lhd: [
    M('mag', 'Magazines · missiles and ordnance', 'hull', [-10, -6.6, 20, 10, 1, 60], 70, { armor: .4, cook: heavy(.2, 50, 70, 240, .1), contents: { he: 3000, det: .03, prop: 1500 } }),
    M('jp5', 'Aviation fuel · JP-5', 'hull', [-10, -6.6, 64, 10, 1, 90], 50, { armor: .3, cook: heavy(.15, 40, 40, 300, .08), contents: fuelOf(400000, 40) }),
    M('hangar', 'Hangar deck · helicopters · AV-8B', 'hull', [-14.6, 10.7, -84, 14.6, 17.1, 14], 80, { cook: heavy(.1, 40, 40, 200, .08), contents: { he: 800, det: .03, prop: 200, fuel: 20000, vapour: 20 } }),
    M('vehicles', 'Vehicle decks · fuelled', 'hull', [-10.5, 1, -46.9, 10.5, 10.6, 8], 60, { cook: heavy(.08, 30, 25, 180, .06), contents: { he: 300, det: .02, fuel: 15000, vapour: 15 } }),
    M('well', 'Well deck · 81 × 15.2 m', 'well', [-7.6, 1, -128.6, 7.6, 10.2, -30.8], 70, { disables: ['well'] }),
    M('gate', 'Stern gate', 'gate', [-7.6, 1, -129.05, 7.6, 9.2, -127.5], 25, { disables: ['well'] }),
    M('machinery', 'Machinery rooms · boilers ×2 · turbines', 'hull', [-12.5, -6.6, -40, 12.5, .6, 4], 70, { armor: .3, slow: .5 }),
    M('shafts', 'Shafts ×2 · 5-blade propellers', 'props', [-10.5, -8.1, -106.8, 10.5, 1.3, -66], 50, { slow: .5 }),
    M('flight', 'Flight deck · 9 spots', 'deck', [-17.3, 16.9, -128.6, 17.3, 18.4, 128.7], 100, { disables: ['air'] }),
    M('island', 'Island · bridges · Pri-Fly', 'island', [7.4, 18.3, -41, 18, 33.9, 14], 40),
    M('sps48', 'AN/SPS-48E', 'sps48', [9.7, 37.6, 4, 15.5, 45.1, 5.9], 15, { disables: ['radar'] }),
    M('nssm', 'Mk 29 NSSM ×2', 'nssm', [-21.4, 15.7, -102.3, 18.7, 19, 94.4], 25, { disables: ['pdms'] }),
    M('ciws', 'Phalanx CIWS ×2', 'ciws', [-19.9, 15.7, -124.3, 13.8, 30.7, 14.5], 25, { disables: ['ciws'] }),
  ],

  lcac: [
    M('turbines', 'TF40B gas turbines ×4', 'sideS', [-5.5, 3, -8.1, 5.5, 4.9, 0], 6, { slow: .4 }),
    M('fans', 'Lift fans ×4', 'hull', [-6, 2.3, -5.4, 6, 4.2, 1.8], 6, { slow: .5 }),
    M('tanks', 'Fuel tanks · JP-5', 'hull', [-3.6, 1.5, -9.7, 3.6, 2.2, 4.7], 5, { cook: kill(.25, 10), contents: fuelOf(20000, 8) }),
    M('propS', 'Propeller · 3.58 m · stbd', 'propS', [3.1, 3.2, -11.7, 6.9, 7.1, -8.9], 4, { slow: .6 }),
    M('propP', 'Propeller · 3.58 m · port', 'propP', [-6.9, 3.2, -11.7, -3.1, 7.1, -8.9], 4, { slow: .6 }),
    M('cab', 'Control cab · crew 5', 'cabS', [4.1, 4.8, 6.4, 6, 8, 10], 4, { slow: .6 }),
    M('skirt', 'Skirt · bag and finger', 'skirt', [-7.2, 0, -13.4, 7.2, 1.2, 13.4], 6, { slow: .5 }),
  ],

  acv: [
    M('power', 'Powerpack · 690 hp', 'hull', [.1, .7, 1.4, 1.1, 2.4, 3.2], 4, { disables: ['move'] }),
    M('drive', 'Driveline', 'lower', [-1.1, .5, -3.3, 1.1, 1.3, 1.9], 4, { slow: .6 }),
    M('fuel', 'Fuel cells', 'lower', [-1.1, .3, -1, -.2, 1, 1.4], 3, { cook: kill(.15, 5) }),
    M('rws', 'Protector RS4 · M2HB', 'rws', [0, 2.7, .5, .8, 3.6, 2.6], 3, { disables: ['rws'] }),
    M('wheelsL', 'Wheels ×4 · L', 'wheelsL', [-1.55, 0, -3.6, -1.1, 1.2, 2.3], 4, { slow: .5, group: 'wheels', disables: ['move'] }),
    M('wheelsR', 'Wheels ×4 · R', 'wheelsR', [1.1, 0, -3.6, 1.55, 1.2, 2.3], 4, { slow: .5, group: 'wheels', disables: ['move'] }),
  ],

  cg: [
    M('vlsF', 'Mk 41 VLS · fwd · 61 cells', 'vlsF', [-4.2, -1.9, 47.6, 4.2, 7.3, 54.4], 40, { lose: { sm6: .5, pdms: .5, strike: .5 }, cook: kill(.22, 55, ['sm6', 'pdms', 'strike']), contents: VLS8 }),
    M('vlsA', 'Mk 41 VLS · aft · 61 cells', 'vlsA', [-4.2, -1.9, -64.4, 4.2, 6.1, -57.6], 40, { lose: { sm6: .5, pdms: .5, strike: .5 }, cook: kill(.22, 55, ['sm6', 'pdms', 'strike']), contents: VLS8 }),
    M('gunF', 'Mk 45 5"/54 · fwd', 'gunF', [-2, 7.7, 60.1, 2, 10.1, 70], 20, { disables: ['gun5'] }),
    M('magF', 'Gun magazine · fwd', 'hull', [-3.5, -4, 58, 3.5, 6, 66], 30, { armor: .3, cook: kill(.2, 25, 'gun5'), contents: MAG5 }),
    M('gunA', 'Mk 45 5"/54 · aft', 'gunA', [-2, 5.7, -80.5, 2, 8.1, -70.6], 20),
    M('magA', 'Gun magazine · aft', 'hull', [-3.5, -4, -78, 3.5, 5, -70], 30, { armor: .3, cook: kill(.2, 25, 'gun5'), contents: MAG5 }),
    M('spyF', 'AN/SPY-1B · fwd faces', 'spy', [-6.5, 11.2, 30, 6.3, 15.4, 40.7], 30, { group: 'spy', disables: ['radar', 'sm6', 'pdms'] }),
    M('spyA', 'AN/SPY-1B · aft faces', 'spy', [-6.5, 11.2, -29.6, 6.3, 15.4, -20], 30, { group: 'spy', disables: ['radar', 'sm6', 'pdms'] }),
    M('bridge', 'Bridge · CIC below', 'houseF', [-7.9, 12, 36, 7.9, 18.3, 42], 30, { slow: .8 }),
    M('mastF', 'Foremast · datalinks', 'mastF', [-5.2, 18.3, 35, 5.2, 40.7, 38.6], 12, { disables: ['scan'] }),
    M('engF', 'Engine room 1 · LM2500 ×2', 'hull', [-3.2, -4.5, -15, 3.2, -.4, 6], 40, { slow: .6 }),
    M('engA', 'Engine room 2 · LM2500 ×2', 'hull', [-3.2, -4.5, -36.2, 3.2, -.4, -15], 40, { slow: .6 }),
    M('shafts', 'Shafts ×2 · propellers', 'hull', [-6.6, -7.5, -73.6, 6.7, -1.4, -30], 30, { slow: .5 }),
    M('hangar', 'Hangars · aft deckhouse', 'hangar', [-6, 5.9, -36.1, 6, 11.1, -28], 25, { disables: ['air'] }),
    M('jp5', 'Aviation fuel · JP-5', 'hull', [-3, -4, -46, 3, 3, -38], 20, { cook: heavy(.25, 25, 35, 150, .1), contents: fuelOf(60000, 25) }),
    M('harpoon', 'Harpoon launchers ×2', 'harpoon', [-5.6, 5.7, -80.9, 5.6, 10.3, -78.1], 10),
    M('svtt', 'Mk 32 SVTT', 'arms', [-7.4, 6.1, -1.2, 7.4, 7.9, 1.9], 8, { disables: ['svtt'] }),
    M('ciwsF', 'Phalanx 1B · stbd', 'ciwsF', [2.9, 15.4, 20.9, 5, 18.8, 24.3], 8, { disables: ['ciwsF'] }),
    M('ciwsA', 'Phalanx 1B · port', 'ciwsA', [-5.8, 11.3, -34.7, -3.7, 14.7, -31.3], 8, { disables: ['ciwsA'] }),
  ],

  lcs: [
    M('gun', 'Mk 110 57 mm', 'gun', [-1.45, 9.5, 38.2, 1.45, 11.42, 45.4], 12, { disables: ['gun57'] }),
    M('mag57', 'Gun magazine · 57 mm', 'hull', [-2, -2, 36, 2, 9.5, 44], 15, { cook: kill(.2, 12, 'gun57'), contents: { he: 120, det: .2, prop: 150 } }),
    M('searam', 'SeaRAM · 11 rounds', 'searam', [-.82, 15.6, -23.85, .95, 18.8, -21.85], 8, { disables: ['searam'], cook: kill(.15, 8, 'searam'), contents: { he: 50, det: .3, prop: 275 } }),
    M('radar', 'Sea Giraffe AMB', 'radar', [-1.2, 30.2, 9.4, 1.2, 31.8, 10.1], 6, { disables: ['radar', 'searam'] }),
    M('bridge', 'Bridge · integrated mast', 'bridge', [-10.5, 9.2, 0, 10.5, 29.8, 24], 25, { disables: ['scan'] }),
    M('hangar', 'Hangar · MH-60', 'hangar', [-9, 9.2, -26, 9, 15.6, 0], 20, { disables: ['air'] }),
    M('bay', 'Mission bay', 'cross', [-12.5, 3.6, -60, 12.5, 8.9, -28], 25),
    M('jp5', 'Aviation fuel · JP-5', 'hull', [-3, -2.8, -44, 3, 0, -36], 12, { cook: kill(.2, 20), contents: fuelOf(20000, 12) }),
    M('mach', 'Engine rooms · diesels · gas turbines', 'hull', [-3.4, -2.8, -36, 3.4, -.2, -8], 25, { slow: .5 }),
    M('jets', 'Waterjets ×4', 'jets', [-3.6, -.5, -64.65, 3.6, 1.2, -60], 12, { slow: .5 }),
  ],
};

/* checked once (data/units.js): every module is inside its unit and names a real part */
export function checkModules(UNITS) {
  const bad = [];
  for (const k in UNITS) {
    const L = MODULES[k] || [], ids = new Set();
    for (const m of L) {
      if (ids.has(m.id)) bad.push(`${k}.${m.id}: duplicate id`);
      ids.add(m.id);
      if (!UNITS[k].parts[m.part]) bad.push(`${k}.${m.id}: unknown part ${m.part}`);
      if (!(m.hp > 0) || m.box.length !== 6 || m.box[0] > m.box[3] || m.box[1] > m.box[4] || m.box[2] > m.box[5]) bad.push(`${k}.${m.id}: bad hp or box`);
      if (m.cook && !(m.cook.p >= 0 && m.cook.p <= 1 && m.cook.size > 0)) bad.push(`${k}.${m.id}: bad cook`);
      const c = m.contents;
      if (c && (['he', 'prop', 'fuel', 'vapour'].some(q => c[q] !== undefined && !(c[q] >= 0)) || (c.det !== undefined && !(c.det >= 0 && c.det <= 1)))) bad.push(`${k}.${m.id}: bad contents`);
    }
  }
  return bad;
}
