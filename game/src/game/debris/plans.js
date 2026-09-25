/* How each model comes apart: its modules (the model's own parts, as the Anatomy films' exploded views group them),
   public-reference level, external modules only (nose, body sections, wings, fins, booster, tail; masts, arrays,
   turrets, cranes; wings, tails, rotors). Munitions are closed shells.

   Rounds (PROJ_PLANS[model key]):
     draw     the model the pieces are drawn from (the cutaway where it splits the wings and fins one by one; the
              same frame and state as the flying model)
     body     the airframe part that breaks in two at the hit (front and rear sections, cut by a plane)
     joints   section joints along the body (z, m): a break within .5 m of one goes along it
     fixed    parts that stay with the section their middle is in (intake, nozzle, booster in its chamber)
     loose    groups that come off as bodies of their own (fins, wings, a strapped-on booster)
     shed     a round out of control sheds these in order (fins first, then wings, then the tail section)
     tail     where its tail section breaks off when it sheds it (z, m)
     rho      bulk density of the sections (kg/m^3 of their cylinder), sigma: of the plates (kg/m^2)
     motor    the section that burns ('rear' | 'front')
   Units:
     takeover (aircraft): the whole airframe is drawn here from `draw` once it is hit for good: `core` stays together
              (the fuselage, tumbling as it falls), `loose` groups come off one after the other (`order` weights),
              `spin` the fuselage's tumble (rad/s: roll, pitch, yaw ranges)
     mods     (ships, vehicles, sites): modules that break loose off the hull / the wreck as it is destroyed:
              how 'toss' (thrown up and off by the blast) | 'topple' (goes over about its foot, then falls free);
              up (m/s), spin (rad/s), rho (kg/m^3 of its box: masts and arrays are mostly air) */

export const PROJ_PLANS = {
  oniks: {
    draw: 'oniks_cut', body: 'body', joints: [-3.98, -2.3, -.15, 1.85, 3.42],
    fixed: ['intake', 'nozzle', 'booster'],
    loose: [['fin1'], ['fin2'], ['fin3'], ['fin4'], ['wingR'], ['wingL'], ['cover']],
    shed: [['fin1', 'fin2', 'fin3', 'fin4'], ['wingR', 'wingL'], 'tail'], tail: -2.3,
    rho: 950, sigma: 34, motor: 'rear',
  },
  sm6: {
    draw: 'sm6_cut', body: 'body', joints: [-.9, .35, 1.2],
    fixed: ['radome', 'nozzle'],
    loose: [['fin1'], ['fin2'], ['fin3'], ['fin4'], ['mk72', 'mk72fins']],
    shed: [['fin1', 'fin2', 'fin3', 'fin4'], ['mk72', 'mk72fins'], 'tail'], tail: -.9,
    rho: 1100, sigma: 28, motor: 'rear',
  },
  kh35: {
    draw: 'kh35', body: 'body', joints: [-1.1, .1, 1.2],
    fixed: ['nose', 'inlet'],
    loose: [['wings'], ['fins'], ['booster']],
    shed: [['fins'], ['wings'], ['booster'], 'tail'], tail: -1.1,
    rho: 900, sigma: 26, motor: 'rear',
  },
  kalibr: {
    draw: 'kalibr', body: 'body', joints: [-1.9, -.6, .6],
    fixed: ['inlet'],
    loose: [['wings'], ['fins'], ['booster'], ['terminal', 'nose']],
    shed: [['fins'], ['wings'], ['booster'], 'tail'], tail: -1.9,
    rho: 900, sigma: 28, motor: 'rear',
  },
  strike_missile: {
    draw: 'strike_missile', body: 'body', joints: [-2.3, -.6, 1.0],
    fixed: ['nose', 'inlet'],
    loose: [['wings'], ['fins'], ['booster']],
    shed: [['fins'], ['wings'], ['booster'], 'tail'], tail: -2.3,
    rho: 800, sigma: 26, motor: 'rear',
  },
  slam: {
    draw: 'slam', body: 'body', joints: [-1.8, 0, 1.5],
    fixed: ['nose'],
    loose: [['wings'], ['fins']],
    shed: [['fins'], ['wings'], 'tail'], tail: -1.6,
    rho: 850, sigma: 26, motor: 'rear',
  },
  aam: {
    draw: 'aam', body: 'body', joints: [-.8, .5],
    fixed: ['radome'],
    loose: [['wings'], ['fins']],
    shed: [['fins'], ['wings'], 'tail'], tail: -1.2,
    rho: 1100, sigma: 24, motor: 'rear',
  },
  essm: {
    draw: 'essm', body: 'body', joints: [-.8, .4],
    fixed: ['radome'],
    loose: [['fins']],
    shed: [['fins'], 'tail'], tail: -1.2,
    rho: 1100, sigma: 24, motor: 'rear',
  },
  pantsir_missile: {
    draw: 'pantsir_missile', body: 'dart', joints: [.5],
    fixed: ['nose', 'finsD'],
    loose: [['booster', 'finsB']],
    shed: [['booster', 'finsB'], 'tail'], tail: .2,
    rho: 1300, sigma: 20, motor: 'rear',
  },
  hellfire: {
    draw: 'hellfire', body: 'body', joints: [0],
    fixed: ['nose'],
    loose: [['wings'], ['canards']],
    shed: [['canards'], ['wings'], 'tail'], tail: -.4,
    rho: 1200, sigma: 20, motor: 'rear',
  },
  kornet_msl: { draw: 'kornet_msl', body: 'body', joints: [0], fixed: [], loose: [], shed: ['tail'], tail: 0, rho: 1200, sigma: 20, motor: 'rear' },
};
/* the projectile model names data/units.js uses */
PROJ_PLANS.tomahawk = PROJ_PLANS.strike_missile;
PROJ_PLANS.aim120 = PROJ_PLANS.aam;
PROJ_PLANS.sam57e6 = PROJ_PLANS.pantsir_missile;
/* the heavy rounds: their break-ups are worth the slow motion from farther off */
export const HEAVY = { oniks: 1, tlam: 1, slam: 1, uran: 1, kalibr: 1 };
/* rounds that never break into modules (a gun shell) */
export const NO_BREAK = { shell: 1 };

export const UNIT_PLANS = {
  /* ---- aircraft: the whole airframe comes apart as it falls */
  fighter: {
    takeover: true, draw: 'fighter_cut',
    core: ['fuselage', 'intakesL', 'intakesR', 'intakesC', 'nozzlesL', 'nozzlesR', 'nozzlesC', 'pylonsC'],
    loose: [['wingsR', 'pylonsR'], ['wingsL', 'pylonsL'], ['tailsR'], ['tailsL'], ['stabsR'], ['stabsL'], ['canopy'], ['lexR'], ['lexL']],
    order: [1, .8, .7, .5, .5, .4, .6, .2, .2],
    spin: { roll: [1.6, 3.4], pitch: [-.5, -.1], yaw: [-.5, .5] },
    rho: 90, sigma: 70, burn: true,
  },
  helo: {
    takeover: true, draw: 'helo_cut',
    core: ['fuselage', 'sensors', 'gearL', 'gearR', 'gearT', 'pylonsL', 'pylonsR'],
    loose: [['rotor'], ['tailrotor'], ['tail']],
    order: [1, .9, .55],
    spin: { roll: [-.4, .4], pitch: [-.3, .1], yaw: [2.6, 4.2] },     // the torque of the rotor, nothing to hold it
    rotor: 'rotor', rho: 110, sigma: 18, burn: true,
  },
  aew: {
    takeover: true, draw: 'aew_cut',
    core: ['fuselage', 'wing', 'nacelleL', 'nacelleR', 'pylon', 'hook', 'antenna', 'engines', 'cabin'],
    loose: [['dome'], ['outerR'], ['outerL'], ['tail'], ['propR'], ['propL']],
    order: [1, .8, .6, .6, .4, .4],
    spin: { roll: [1.0, 2.2], pitch: [-.4, -.1], yaw: [-.4, .4] },
    rho: 70, sigma: 50, burn: true,
  },
  drone: {
    takeover: true, draw: 'drone_cut',
    core: ['fuselage', 'wingC', 'gimbal', 'antennas'],
    loose: [['wingR'], ['wingL'], ['tail'], ['prop']],
    order: [1, .7, .6, .5],
    spin: { roll: [2, 5], pitch: [-.8, -.2], yaw: [-1, 1] },
    rho: 120, sigma: 6, burn: false,
  },
  /* ---- ships: masts, arrays, mounts and boats break loose; the hull sinks as the render system has it */
  destroyer: {
    mods: [
      { parts: ['mast', 'sps'], how: 'topple', rho: 60, rel: 1.0 },
      { parts: ['gun'], how: 'toss', up: [6, 14], spin: [.6, 2.2], rho: 420 },
      { parts: ['ciwsF'], how: 'toss', up: [8, 16], spin: [1, 3.5], rho: 300 },
      { parts: ['ciwsA'], how: 'toss', up: [8, 16], spin: [1, 3.5], rho: 300 },
      { parts: ['boats'], how: 'toss', up: [4, 9], spin: [.5, 1.6], rho: 60 },
      { parts: ['stacks'], how: 'topple', rho: 45, rel: .8, p: .6 },
    ],
  },
  carrier: {
    mods: [
      { parts: ['mast'], how: 'topple', rho: 30, rel: 1.1 },
      { parts: ['radars'], how: 'toss', up: [6, 12], spin: [.5, 2], rho: 120 },
      { parts: ['ciws'], how: 'toss', up: [6, 12], spin: [.6, 2], rho: 20, p: .7 },
    ],
  },
  lhd: { mods: [] },
  /* ---- vehicles and sites: tossed off the burning wreck, left lying beside it */
  tel: { mods: [{ parts: ['launcher', 'capL', 'capR'], how: 'toss', up: [3, 6.5], spin: [.4, 1.4], rho: 360 }, { parts: ['cab'], how: 'toss', up: [2, 5], spin: [.3, 1.2], rho: 160, p: .45 }] },
  radar: { mods: [{ parts: ['array'], how: 'toss', up: [5, 11], spin: [.8, 2.6], rho: 260 }, { parts: ['mast'], how: 'topple', rho: 180, rel: 1.2 }] },
  pantsir: { mods: [{ parts: ['turret', 'guns', 'missiles', 'searchRadar', 'trackRadar', 'eo'], how: 'toss', up: [5, 10], spin: [.5, 1.8], rho: 330 }] },
  transloader: { mods: [{ parts: ['column', 'boom', 'jib', 'hook', 'rope'], how: 'topple', rho: 140, rel: 1.0 }, { parts: ['tlcR'], how: 'toss', up: [2, 4], spin: [.3, 1], rho: 250, p: .7 }, { parts: ['tlcL'], how: 'toss', up: [2, 4], spin: [.3, 1], rho: 250, p: .7 }] },
  bal: { mods: [{ parts: ['pack', 'caps'], how: 'toss', up: [3, 6], spin: [.4, 1.4], rho: 300 }] },
  hq: { mods: [{ parts: ['mast', 'guys'], how: 'topple', rho: 25, rel: 1.3 }, { parts: ['shelterA'], how: 'toss', up: [3, 7], spin: [.4, 1.5], rho: 160, p: .6 }, { parts: ['shelterB'], how: 'toss', up: [3, 7], spin: [.4, 1.5], rho: 160, p: .6 }] },
  catapult: { mods: [{ parts: ['rail', 'carriage'], how: 'toss', up: [4, 8], spin: [.8, 2.5], rho: 200 }] },
  acv: { mods: [] },
};
