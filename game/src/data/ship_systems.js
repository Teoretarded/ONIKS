/* ONIKS ship systems: what runs a ship, where it sits and what it needs (sim/ship.js; the rules in sim/README.md,
   "Ships: compartments, systems, flooding").

   Every ship with a subdivision (data/ship_layouts.js) has a system graph: its modules (data/modules.js, by id) and
   the supporting systems below, each a node placed in the model frame (a box, or a line for cable ways and shaft
   lines), with a tolerance class (TOL) and what it needs:
     pw        it needs electrical power: a live switchboard reached through the cable ways (redundant port and
               starboard runs, cut into segments at the watertight bulkheads), or casualty power rigged later
     needs     ['a|b', 'c']: all of the entries, each one of its alternatives (node ids or capability names)
   Power: gens (generators; a module may be one: a boat's battery), buses [[switchboard, its generator]], trunks
   [[id, label, x, y]] (the cable ways, run the length of the ship at x, y). Propulsion (DDG, CG): shafts, each driven
   by its prime movers (a module and how many engines it holds) through its gear / shaft line / pitch control; the
   speed goes as the cube root of the power left. Steering: the steering gear node (lost: emergency steering, a third
   of the rudder). caps: the capability tokens (sim/README.md: 'radar', 'sm6', weapon names ...) and what each needs;
   a token is off while its needs are not met (the modules' own `disables` are not used on these ships). fire: the
   fire pumps (the firemain: fire fighting and the eductors that pump out flooded spaces).

   Placement: a node's box is [x0, y0, z0, x1, y1, z1] (model frame: +X starboard, +Y up, +Z bow), or 'SPACE:f'
   (fractions of that space's bounding box: x port -> starboard, y bottom -> top, z aft -> forward), or a line
   { line: [[x, y, z], ...] }. Estimates fitted to the game models: a game's arrangement, not a real ship's. */

/* tolerance classes: P (Pa) and I (Pa s): the peak overpressure and impulse at which half of it is wrecked (it needs
   both: min(P / Pc, I / Ic) = 1 -> half); frag: the share of it one fragment strike wrecks; fire: seconds of a
   fully developed fire to burn it out (0: it does not burn); flood: out once its space is flooded above it.
   Coarse, public blast-effects orders of magnitude: electronics racks tens of kPa, machinery a few hundred */
export const TOL = {
  elec:  { P: 40e3, I: 150, frag: .2, fire: 45, flood: 1, label: 'electronics' },
  array: { P: 35e3, I: 100, frag: .01, fire: 90, flood: 1, label: 'antenna array' },
  swbd:  { P: 70e3, I: 250, frag: .15, fire: 60, flood: 1, label: 'switchboard' },
  cable: { P: 120e3, I: 400, frag: .1, fire: 90, flood: 0, label: 'cable way' },
  pump:  { P: 150e3, I: 600, frag: .05, fire: 150, flood: 1, label: 'auxiliary machinery' },
  mach:  { P: 180e3, I: 900, frag: .015, fire: 240, flood: 1, label: 'main machinery' },
  heavy: { P: 700e3, I: 4000, frag: .005, fire: 0, flood: 0, label: 'shafting · gearing' },
  mag:   { P: 250e3, I: 1500, frag: .02, fire: 0, flood: 0, label: 'magazine · launcher' },
  mount: { P: 150e3, I: 700, frag: .04, fire: 200, flood: 0, label: 'weapon mount' },
  space: { P: 60e3, I: 300, frag: .01, fire: 120, flood: 0, label: 'working space' },
};

/* the charges (sim/ship.js): W kg TNT equivalent (game/src/blast/phys.js TNT: approximate public figures), F effective
   fragments (a light-cased penetrator throws few heavy ones, a blast-frag SAM many light ones), pen: plating (mm) its
   fragments go through, fz: how it meets the ship ('in' a delayed fuze inside the hull, 'out' contact or a shell at
   the skin, 'frag' a proximity burst, 'under' a torpedo under the keel, 'gun' small rounds); H: the hole a penetrating
   round punches on its way in (m^2: its body and the petals round it) */
export const CHARGE = {
  oniks: { W: 120, F: 500, pen: 12, fz: 'in', H: 1.5 }, kalibr: { W: 100, F: 500, pen: 12, fz: 'in', H: 1.2 }, uran: { W: 65, F: 350, pen: 10, fz: 'in', H: .8 },
  tlam: { W: 200, F: 800, pen: 10, fz: 'in', H: 1.2 }, slam: { W: 100, F: 600, pen: 10, fz: 'in', H: 1 }, mk84: { W: 450, F: 3000, pen: 12, fz: 'in', H: 1.2 },
  hellfire: { W: 5, F: 250, pen: 8, fz: 'out' }, kornet: { W: 3, F: 120, pen: 6, fz: 'out' },
  shell: { W: 3.2, F: 600, pen: 8, fz: 'out' }, gun5: { W: 3.2, F: 600, pen: 8, fz: 'out' }, shell130: { W: 3.6, F: 700, pen: 8, fz: 'out' },
  shell57: { W: .35, F: 120, pen: 5, fz: 'out' },
  sm6: { W: 24, F: 4000, pen: 6, fz: 'frag' }, pdms: { W: 12, F: 2500, pen: 5, fz: 'frag' }, sam: { W: 5, F: 1500, pen: 5, fz: 'frag' },
  sam48: { W: 56, F: 5000, pen: 6, fz: 'frag' }, ram: { W: 3, F: 800, pen: 4, fz: 'frag' }, aam: { W: 5, F: 1500, pen: 5, fz: 'frag' },
  mk48: { W: 290, F: 0, pen: 0, fz: 'under' }, mk54: { W: 44, F: 0, pen: 0, fz: 'under' }, t53: { W: 300, F: 0, pen: 0, fz: 'under' },
  ciws: { W: 0, F: 25, pen: 20, fz: 'gun' }, gun30: { W: .05, F: 30, pen: 6, fz: 'gun' }, rws: { W: 0, F: 15, pen: 8, fz: 'gun' },
};
export function chargeOf(kind, dmg) {
  return CHARGE[kind] || { W: Math.max(.2, (dmg || 10) * 1.4), F: (dmg || 10) * 12, pen: 8, fz: 'in', H: .6 };
}

/* the rules' numbers (sim/ship.js); named so the pacing is a tuning pass */
export const SHIPK = {
  step: 5,                // ticks between flooding / fire / damage-control steps (0.25 s)
  cd: .6,                 // discharge coefficient of a ragged hole (orifice flow Q = cd A sqrt(2 g h))
  cdIn: .5,               // ... of a door or a torn bulkhead between spaces
  zTearIn: .6,            // plating tears within this scaled distance (m / kg^1/3) of a charge inside a space (10 mm; ~sqrt(10 / t))
  zTearOut: .18,          // ... of a charge on the outside (contact)
  zTearUnder: .5,         // hole radius under the keel for a torpedo, m / kg^1/3
  pGas: 40e3,             // Pa per mm of plating: the gas pressure in a closed space that splits its boundaries
  gasTear: .15,           // share of a boundary torn per unit of gas over-pressure (capped at half)
  gasReach: 4,           // m / kg^1/3: the gas splits a boundary only this near the charge, less toward it (a long space's far end,
                          // tens of metres off, holds: the plating nearest the burst gives first and vents it)
  trans: .5,              // a shock keeps this share through a torn boundary or an open door (blast/phys.js DIFF)
  wall: .03,              // ... through intact plating (the plate's own motion)
  tGas: .05,              // s: the quasi-static gas pressure acts this long (it vents)
  reach: 6,               // m / kg^1/3: beyond this scaled distance a blast does nothing to equipment (~25 kPa)
  refl: 2,                // the shock reflecting off equipment face-on
  wreck: [.6, .8],        // blast damage index D -> damage: sat((D - a) / b)
  shockUnder: 1.6,        // a torpedo's hull shock (whipping) on machinery within this x W^1/3 m ... (index at 1 m scaled)
  // flooding, stability
  capsize: .5,            // rad: a list past this, or a negative metacentric height, capsizes her
  awash: -.6,             // m: the main deck's edge this far under at an end: she founders (down-flooding)
  fsK: 1,                 // free-surface penalty (x the partly flooded spaces' breadth^3 length / 12)
  subReserve: 1,          // a boat's reserve buoyancy share (x the layout's reserve)
  // damage control
  teams: { ddg: 3, cg: 3, carrier: 8, lhd: 5, lcs: 2, ssn: 1, ssk: 1 },
  fireFight: 45,          // s to put out a developed fire with the firemain (x4 without it: portable extinguishers)
  fireGrow: 40,           // s to a developed fire
  fireSpread: 180,        // s a developed fire takes to spread through an open or torn boundary (intact steel holds)
  patch: .03,             // m^2/s a team plugs (holes up to 1.5 m^2, not deeper than 4 m, a space not full)
  shore: .05,             // m^2/s a team shores of a torn bulkhead or a blown door
  pump: .065,             // m^3/s per live fire pump (eductors)
  casualty: 240,          // s to rig casualty power to an intact load that lost its supply
  cfList: .07,            // rad: a list past this, and damage control counter-floods a tank or void on the other side
  cfRate: 1.5,            // m^3/s through the counter-flooding valves
  zebra: [15, 120],       // s: open doors are shut this long after she goes to general quarters (per door, fixed)
  yokeOpen: .35,          // share of doors and hatches open in cruising condition (Yoke)
  gqHold: 900,            // s without firing, being hit or a threat near: back to Yoke
};

/* node helpers */
const N = (id, label, cls, at, o) => Object.assign({ id, label, cls, at }, o || {});
const line = (...pts) => ({ line: pts });

/* module classes by id where the default guess is wrong (default: cook -> mag, slow -> mach, radar/scan -> array) */
export const MODCLS = {
  ddg: { vlsF: 'mag', vlsA: 'mag', gun: 'mount', mag5: 'mag', spyF: 'array', spyA: 'array', bridge: 'space', mast: 'array', engF: 'mach', engA: 'mach', shafts: 'heavy', hangar: 'space', jp5: 'mag', ciwsF: 'mount', ciwsA: 'mount' },
  cg: { vlsF: 'mag', vlsA: 'mag', gunF: 'mount', gunA: 'mount', magF: 'mag', magA: 'mag', spyF: 'array', spyA: 'array', bridge: 'space', mastF: 'array', engF: 'mach', engA: 'mach',
    shafts: 'heavy', hangar: 'space', jp5: 'mag', harpoon: 'mount', svtt: 'mount', ciwsF: 'mount', ciwsA: 'mount' },
  carrier: { magF: 'mag', magA: 'mag', jp5F: 'mag', jp5A: 'mag', hangar: 'space', parked: 'space', reactors: 'heavy', machinery: 'mach', shafts: 'heavy', catsBow: 'mount', catsWaist: 'mount',
    landing: 'mount', prifly: 'space', sps48: 'array', sps49: 'array' },
  lhd: { mag: 'mag', jp5: 'mag', hangar: 'space', vehicles: 'space', well: 'space', gate: 'mount', machinery: 'mach', shafts: 'heavy', flight: 'space', island: 'space', sps48: 'array', nssm: 'mount', ciws: 'mount' },
  lcs: { gun: 'mount', mag57: 'mag', searam: 'mount', radar: 'array', bridge: 'space', hangar: 'space', bay: 'space', jp5: 'mag', mach: 'mach', jets: 'heavy' },
  ssn: { torpRoom: 'mag', vpt: 'mag', sonar: 'array', control: 'elec', reactor: 'heavy', engine: 'mach', masts: 'array', planes: 'heavy' },
  ssk: { torpRoom: 'mag', sonar: 'array', control: 'elec', battery: 'swbd', diesels: 'mach', motor: 'mach', masts: 'array', planes: 'heavy' },
};

export const SYSTEMS = {
  /* ------------------------------------------------------------------ DDG-51 (the bench's subdivision) */
  ddg: {
    nodes: [
      N('gtg1', 'Gas turbine generator 1 · 2.5 MW', 'mach', 'AMR1:.08,.05,.25,.45,.5,.8'),
      N('gtg2', 'Gas turbine generator 2 · 2.5 MW', 'mach', 'MER2:.6,.05,.03,.95,.4,.25'),
      N('gtg3', 'Gas turbine generator 3 · 2.5 MW', 'mach', 'AMR2:.08,.05,.2,.5,.85,.8'),
      N('swbd1', 'Main switchboard 1', 'swbd', 'AMR1:.55,.55,.3,.9,.92,.7'),
      N('swbd2', 'Main switchboard 2', 'swbd', 'MER2:.08,.55,.03,.4,.92,.25'),
      N('swbd3', 'Main switchboard 3', 'swbd', 'AMR2:.55,.3,.2,.92,.95,.8'),
      N('chw1', 'Chilled water plant 1', 'pump', 'AMR1:.08,.55,.05,.45,.92,.35', { pw: 1 }),
      N('chw2', 'Chilled water plant 2', 'pump', 'ST10:.1,.1,.2,.45,.9,.8', { pw: 1 }),
      N('fp1', 'Fire pump 1 · forward pump room', 'pump', 'PMP4:.3,.1,.3,.7,.8,.7', { pw: 1 }),
      N('fp2', 'Fire pump 2', 'pump', 'AMR1:.55,.05,.75,.9,.4,.95', { pw: 1 }),
      N('fp3', 'Fire pump 3', 'pump', 'MER1:.05,.05,.75,.3,.35,.95', { pw: 1 }),
      N('fp4', 'Fire pump 4', 'pump', 'MER2:.7,.05,.7,.95,.35,.95', { pw: 1 }),
      N('fp5', 'Fire pump 5', 'pump', 'AMR2:.55,.05,.05,.92,.3,.2', { pw: 1 }),
      N('fp6', 'Fire pump 6 · steering gear room', 'pump', 'STR:.05,.05,.7,.3,.5,.95', { pw: 1 }),
      N('lube1', 'Lube oil service · MRG 1', 'pump', 'MER1:.65,.05,.05,.95,.4,.3', { pw: 1 }),
      N('lube2', 'Lube oil service · MRG 2', 'pump', 'MER2:.05,.05,.3,.35,.4,.55', { pw: 1 }),
      N('mrg1', 'Main reduction gear 1', 'heavy', 'MER1:.3,.02,.02,.7,.45,.25'),
      N('mrg2', 'Main reduction gear 2', 'heavy', 'MER2:.3,.02,.02,.7,.45,.25'),
      N('lineP', 'Shaft line · port', 'heavy', line([-3, -4.2, -7.5], [-3, -4.4, -40], [-3.2, -5, -62])),
      N('lineS', 'Shaft line · starboard', 'heavy', line([3, -4.2, -27], [3, -4.4, -40], [3.2, -5, -62])),
      N('cppP', 'CRP hydraulics · port', 'pump', 'MER1:.05,.4,.02,.3,.6,.2', { pw: 1 }),
      N('cppS', 'CRP hydraulics · starboard', 'pump', 'MER2:.7,.4,.02,.95,.6,.2', { pw: 1 }),
      N('steer', 'Steering gear · hydraulic power units ×2', 'pump', 'STR:.25,.05,.25,.75,.6,.75', { pw: 1 }),
      N('cic', 'Combat information centre · Aegis displays', 'elec', 'FHF:.12,.05,.05,.88,.9,.55', { pw: 1, needs: ['chw1|chw2'] }),
      N('spyProc', 'AN/SPY-1D signal processor · transmitters', 'elec', 'SPY01:.15,.05,.15,.85,.9,.85', { pw: 1, needs: ['chw1|chw2'] }),
      N('sqs53', 'AN/SQS-53C · sonar electronics', 'elec', 'SON2:.2,.1,.1,.8,.9,.9', { pw: 1 }),
      N('hoist', 'Gun loading system · hoists', 'mach', 'GLR:.25,.05,.1,.75,.95,.9', { pw: 1 }),
    ],
    mods: { vlsF: { pw: 1 }, vlsA: { pw: 1 }, gun: { pw: 1 }, spyF: { pw: 1 }, spyA: { pw: 1 }, mast: { pw: 1 }, ciwsF: { pw: 1 }, ciwsA: { pw: 1 },
      engF: { needs: ['lube1'] }, engA: { needs: ['lube2'] } },
    power: { gens: ['gtg1', 'gtg2', 'gtg3'], buses: [['swbd1', 'gtg1'], ['swbd2', 'gtg2'], ['swbd3', 'gtg3']],
      trunks: [['P', 'Main cable way · port · 2nd deck', -6.5, 5.2], ['S', 'Main cable way · starboard · 3rd deck', 6.5, 2.4]] },
    prop: { total: 4, shafts: [
      { id: 'P', label: 'port shaft', units: [['engF', 2]], via: ['mrg1', 'lineP', 'cppP'] },
      { id: 'S', label: 'starboard shaft', units: [['engA', 2]], via: ['mrg2', 'lineS', 'cppS'] }] },
    steer: 'steer',
    fire: ['fp1', 'fp2', 'fp3', 'fp4', 'fp5', 'fp6'],
    caps: { radar: ['spyF|spyA', 'spyProc'], sm6: ['radar', 'cic', 'vlsF|vlsA'], strike: ['cic', 'vlsF|vlsA'], gun5: ['gun', 'hoist', 'cic'],
      ciwsF: ['ciwsF'], ciwsA: ['ciwsA'], scan: ['mast', 'cic'], sonar: ['sqs53'], air: ['hangar'] },
  },

  /* ------------------------------------------------------------------ CG-47 (generic subdivision) */
  cg: {
    nodes: [
      N('gtg1', 'Gas turbine generator 1 · 2.5 MW', 'mach', 'AMR1:.08,.05,.2,.45,.5,.8'),
      N('gtg2', 'Gas turbine generator 2 · 2.5 MW', 'mach', 'MER2:.6,.05,.03,.95,.4,.25'),
      N('gtg3', 'Gas turbine generator 3 · 2.5 MW', 'mach', 'AMR2:.08,.05,.2,.5,.85,.8'),
      N('swbd1', 'Main switchboard 1', 'swbd', 'AMR1:.55,.55,.3,.9,.92,.7'),
      N('swbd2', 'Main switchboard 2', 'swbd', 'MER2:.08,.55,.03,.4,.92,.25'),
      N('swbd3', 'Main switchboard 3', 'swbd', 'AMR2:.55,.3,.2,.92,.95,.8'),
      N('chw1', 'Chilled water plant 1', 'pump', 'AMR1:.08,.55,.05,.45,.92,.35', { pw: 1 }),
      N('chw2', 'Chilled water plant 2', 'pump', [-4, -1.5, -52, 0, 1.1, -48], { pw: 1 }),
      N('fp1', 'Fire pump 1', 'pump', [-2, -4.5, 36, 2, -2, 40], { pw: 1 }),
      N('fp2', 'Fire pump 2', 'pump', 'AMR1:.55,.05,.75,.9,.4,.95', { pw: 1 }),
      N('fp3', 'Fire pump 3', 'pump', 'MER1:.05,.05,.75,.3,.35,.95', { pw: 1 }),
      N('fp4', 'Fire pump 4', 'pump', 'MER2:.7,.05,.7,.95,.35,.95', { pw: 1 }),
      N('fp5', 'Fire pump 5', 'pump', 'AMR2:.55,.05,.05,.92,.3,.2', { pw: 1 }),
      N('fp6', 'Fire pump 6 · steering gear room', 'pump', [-3, 1.5, -84, 0, 4, -80], { pw: 1 }),
      N('lube1', 'Lube oil service · MRG 1', 'pump', 'MER1:.65,.05,.05,.95,.4,.3', { pw: 1 }),
      N('lube2', 'Lube oil service · MRG 2', 'pump', 'MER2:.05,.05,.3,.35,.4,.55', { pw: 1 }),
      N('mrg1', 'Main reduction gear 1', 'heavy', 'MER1:.3,.02,.02,.7,.45,.25'),
      N('mrg2', 'Main reduction gear 2', 'heavy', 'MER2:.3,.02,.02,.7,.45,.25'),
      N('lineP', 'Shaft line · port', 'heavy', line([-3, -4.2, -15], [-3, -4.4, -46], [-3.2, -5, -70])),
      N('lineS', 'Shaft line · starboard', 'heavy', line([3, -4.2, -36], [3, -4.4, -46], [3.2, -5, -70])),
      N('cppP', 'CRP hydraulics · port', 'pump', 'MER1:.05,.4,.02,.3,.6,.2', { pw: 1 }),
      N('cppS', 'CRP hydraulics · starboard', 'pump', 'MER2:.7,.4,.02,.95,.6,.2', { pw: 1 }),
      N('steer', 'Steering gear · hydraulic power units ×2', 'pump', [-3, 1.5, -84, 3, 4.5, -78], { pw: 1 }),
      N('cic', 'Combat information centre · Aegis displays', 'elec', 'FH1:.12,.05,.3,.88,.9,.75', { pw: 1, needs: ['chw1|chw2'] }),
      N('spyProc', 'AN/SPY-1B signal processor · transmitters', 'elec', 'FH2:.15,.05,.15,.85,.9,.85', { pw: 1, needs: ['chw1|chw2'] }),
      N('sqs53', 'AN/SQS-53 · sonar electronics', 'elec', [-3, 1.2, 67, 3, 3.9, 73], { pw: 1 }),
      N('hoistF', 'Gun loading system · forward', 'mach', 'MAGF:.25,.5,.1,.75,.98,.9', { pw: 1 }),
      N('hoistA', 'Gun loading system · aft', 'mach', 'MAGA:.25,.5,.1,.75,.98,.9', { pw: 1 }),
    ],
    mods: { vlsF: { pw: 1 }, vlsA: { pw: 1 }, gunF: { pw: 1 }, gunA: { pw: 1 }, spyF: { pw: 1 }, spyA: { pw: 1 }, mastF: { pw: 1 }, ciwsF: { pw: 1 }, ciwsA: { pw: 1 },
      svtt: { pw: 1 }, engF: { needs: ['lube1'] }, engA: { needs: ['lube2'] } },
    power: { gens: ['gtg1', 'gtg2', 'gtg3'], buses: [['swbd1', 'gtg1'], ['swbd2', 'gtg2'], ['swbd3', 'gtg3']],
      trunks: [['P', 'Main cable way · port · 2nd deck', -6, 5.2], ['S', 'Main cable way · starboard · 3rd deck', 6, 2.4]] },
    prop: { total: 4, shafts: [
      { id: 'P', label: 'port shaft', units: [['engF', 2]], via: ['mrg1', 'lineP', 'cppP'] },
      { id: 'S', label: 'starboard shaft', units: [['engA', 2]], via: ['mrg2', 'lineS', 'cppS'] }] },
    steer: 'steer',
    fire: ['fp1', 'fp2', 'fp3', 'fp4', 'fp5', 'fp6'],
    caps: { radar: ['spyF|spyA', 'spyProc'], sm6: ['radar', 'cic', 'vlsF|vlsA'], pdms: ['radar', 'cic', 'vlsF|vlsA'], strike: ['cic', 'vlsF|vlsA'],
      gun5: ['gunF+hoistF|gunA+hoistA', 'cic'], ciwsF: ['ciwsF'], ciwsA: ['ciwsA'], svtt: ['svtt'], scan: ['mastF', 'cic'], sonar: ['sqs53'], air: ['hangar'] },
  },

  /* ------------------------------------------------------------------ CVN-68 */
  carrier: {
    nodes: [
      N('tg1', 'Ship service turbine generators 1–2', 'mach', 'RX1:.1,.05,.05,.45,.45,.3'),
      N('tg2', 'Ship service turbine generators 3–4', 'mach', 'RX2:.55,.05,.05,.9,.45,.3'),
      N('tg3', 'Ship service turbine generators 5–6', 'mach', 'MMR1:.1,.05,.1,.45,.45,.5'),
      N('edg', 'Emergency diesel generators', 'mach', [-10, 4.2, 104, 10, 8, 116]),
      N('swbd1', 'Main switchboard 1', 'swbd', 'RX1:.55,.55,.05,.9,.95,.3'),
      N('swbd2', 'Main switchboard 2', 'swbd', 'RX2:.1,.55,.05,.45,.95,.3'),
      N('swbd3', 'Main switchboard 3', 'swbd', 'MMR1:.55,.55,.1,.9,.95,.5'),
      N('swbdE', 'Emergency switchboard', 'swbd', [-10, 4.2, 116, 10, 8, 124]),
      N('fp1', 'Fire pumps · bow', 'pump', [-8, -4.5, 120, 8, -1, 130], { pw: 1 }),
      N('fp2', 'Fire pumps · forward', 'pump', 'RX1:.05,.05,.8,.35,.35,.98', { pw: 1 }),
      N('fp3', 'Fire pumps · midships', 'pump', 'RX2:.65,.05,.7,.95,.35,.95', { pw: 1 }),
      N('fp4', 'Fire pumps · aft', 'pump', 'MMR1:.65,.05,.05,.95,.35,.3', { pw: 1 }),
      N('fp5', 'Fire pumps · stern', 'pump', [-8, -4.5, -140, 8, -1, -134], { pw: 1 }),
      N('chw1', 'Air-conditioning plants · forward', 'pump', [-10, -.4, 20, 0, 3.9, 36], { pw: 1 }),
      N('chw2', 'Air-conditioning plants · aft', 'pump', [0, -.4, -60, 10, 3.9, -46], { pw: 1 }),
      N('steer', 'Steering gear rooms ×2', 'pump', [-12, -4.5, -158, 12, 3.5, -148], { pw: 1 }),
      N('cicCV', 'Combat direction centre · CATCC', 'elec', 'GALA:.25,.1,.55,.75,.95,.8', { pw: 1, needs: ['chw1|chw2'] }),
      N('nssmFc', 'Mk 91 NSSM fire control', 'elec', 'GALA:.2,.1,.2,.8,.95,.35', { pw: 1, needs: ['chw1|chw2'] }),
      N('arrest', 'Arresting gear engines', 'mach', [-16, 8.4, -112, 12, 16.3, -60], { pw: 1 }),
    ],
    mods: { sps48: { pw: 1 }, sps49: { pw: 1 }, catsBow: {}, catsWaist: {}, landing: { needs: ['arrest'] } },
    power: { gens: ['tg1', 'tg2', 'tg3', 'edg'], buses: [['swbd1', 'tg1'], ['swbd2', 'tg2'], ['swbd3', 'tg3'], ['swbdE', 'edg']],
      trunks: [['P', 'Main cable way · port · 2nd deck', -12, 6], ['S', 'Main cable way · starboard · 3rd deck', 12, 1.5]] },
    prop: null, steer: 'steer',
    fire: ['fp1', 'fp2', 'fp3', 'fp4', 'fp5'],
    caps: { radar: ['sps48|sps49', 'cicCV'], air: ['catsBow|catsWaist', 'landing'], pdms: ['nssmFc'] },
  },

  /* ------------------------------------------------------------------ LHD-1 */
  lhd: {
    nodes: [
      N('tg1', 'Ship service turbine generators', 'mach', 'MMR:.1,.05,.1,.45,.5,.5'),
      N('dg1', 'Diesel generators · forward', 'mach', [-8, -6.4, 90, 8, -1, 100]),
      N('swbd1', 'Main switchboard 1', 'swbd', 'MMR:.55,.55,.1,.9,.95,.5'),
      N('swbd2', 'Main switchboard 2', 'swbd', [-8, -1, 94, 8, .9, 100]),
      N('fp1', 'Fire pumps · forward', 'pump', [-6, -6.4, 100, 6, -2, 104], { pw: 1 }),
      N('fp2', 'Fire pumps · machinery', 'pump', 'MMR:.6,.05,.6,.95,.4,.95', { pw: 1 }),
      N('fp3', 'Fire pumps · aft', 'pump', [-6, -6.4, -84, 6, -2, -70], { pw: 1 }),
      N('chw1', 'Air-conditioning plants', 'pump', [-8, -6.4, 4, 0, .9, 18], { pw: 1 }),
      N('ballast', 'Ballast pumps · well deck', 'pump', [-10, -6.4, -100, 10, -1, -86], { pw: 1 }),
      N('steer', 'Steering gear room', 'pump', [-10, -3, -126, 10, 1, -116], { pw: 1 }),
      N('cicL', 'Combat information centre', 'elec', 'ISL:.1,.05,.3,.9,.3,.8', { pw: 1, needs: ['chw1'] }),
    ],
    mods: { sps48: { pw: 1 }, nssm: { pw: 1 }, ciws: { pw: 1 }, gate: { pw: 1 } },
    power: { gens: ['tg1', 'dg1'], buses: [['swbd1', 'tg1'], ['swbd2', 'dg1']],
      trunks: [['P', 'Main cable way · port', -11, 5], ['S', 'Main cable way · starboard', 11, -2]] },
    prop: null, steer: 'steer',
    fire: ['fp1', 'fp2', 'fp3'],
    caps: { radar: ['sps48', 'cicL'], air: ['flight'], well: ['well', 'gate', 'ballast'], pdms: ['nssm'], ciws: ['ciws'] },
  },

  /* ------------------------------------------------------------------ LCS-2 */
  lcs: {
    nodes: [
      N('dg1', 'Ship service diesel generators ×2 · forward', 'mach', [-5, -2.7, 16, 5, 0, 26]),
      N('dg2', 'Ship service diesel generators ×2 · aft', 'mach', 'MMR:.1,.05,.05,.9,.45,.25'),
      N('swbd1', 'Switchboard 1', 'swbd', [-5, 0, 16, 5, 3.5, 22]),
      N('swbd2', 'Switchboard 2', 'swbd', 'MMR:.1,.5,.05,.9,.95,.25'),
      N('fp1', 'Fire pump · forward', 'pump', [-3, -2.7, 22, 3, 0, 26], { pw: 1 }),
      N('fp2', 'Fire pump · aft', 'pump', 'MMR:.1,.05,.8,.9,.45,.98', { pw: 1 }),
      N('chw1', 'Chilled water plant', 'pump', [-5, 0, 4, 5, 3.5, 12], { pw: 1 }),
      N('cicL', 'Combat information centre · mission control', 'elec', 'BRG:.1,.05,.1,.9,.5,.6', { pw: 1, needs: ['chw1'] }),
      N('steerJ', 'Waterjet steering · hydraulics', 'pump', [-4, -2.7, -60, 4, 1, -52], { pw: 1 }),
    ],
    mods: { gun: { pw: 1 }, searam: { pw: 1 }, radar: { pw: 1 }, mach: {}, jets: {} },
    power: { gens: ['dg1', 'dg2'], buses: [['swbd1', 'dg1'], ['swbd2', 'dg2']],
      trunks: [['P', 'Cable way · port', -4.5, 3.8], ['S', 'Cable way · starboard', 4.5, 1]] },
    prop: null, steer: 'steerJ',
    fire: ['fp1', 'fp2'],
    caps: { radar: ['radar', 'cicL'], searam: ['searam', 'radar'], gun57: ['gun', 'cicL'], scan: ['bridge'], air: ['hangar'] },
  },

  /* ------------------------------------------------------------------ SSN-774 */
  ssn: {
    nodes: [
      N('tg', 'Ship service turbine generators', 'mach', [-3.5, -8, -20, 3.5, -3, -10]),
      N('swbd1', 'Main switchboard', 'swbd', [-3.5, -3, -14, 3.5, -.5, -8]),
      N('batt', 'Battery · emergency', 'swbd', [-3, -8.4, 8, 3, -6.5, 14]),
      N('swbd2', 'Switchboard · forward', 'swbd', [-3, -5, 8, 3, -2.2, 12]),
      N('trim', 'Trim and drain pumps', 'pump', [-3, -8.6, 14, 3, -6, 20], { pw: 1 }),
      N('sonarProc', 'Sonar processing', 'elec', [-4, -5, 12, 4, -2.2, 20], { pw: 1 }),
      N('steer', 'Hydraulic plant · planes and rudder', 'pump', [-3, -6, -46, 3, -1, -40], { pw: 1 }),
    ],
    mods: { control: { pw: 1 }, sonar: { pw: 1 }, masts: { pw: 1 }, vpt: { pw: 1 } },
    power: { gens: ['tg', 'batt'], buses: [['swbd1', 'tg'], ['swbd2', 'batt']], trunks: [['C', 'Main cable way', 0, -2]] },
    prop: null, steer: 'steer',
    fire: ['trim'],
    caps: { sonar: ['sonar', 'sonarProc'], strike: ['vpt', 'control'], mk48: ['control'], camera: ['masts'] },
  },

  /* ------------------------------------------------------------------ Project 636 (Kilo) */
  ssk: {
    nodes: [
      N('swbd1', 'Main switchboard · central post', 'swbd', [-3, -3.7, -3, 3, -1, 2]),
      N('trim', 'Trim and drain pumps', 'pump', [-3, -5.5, 2, 3, -3.8, 8], { pw: 1 }),
      N('sonarProc', 'Sonar processing', 'elec', [-3, -3.7, 2, 3, 0, 8], { pw: 1 }),
      N('steer', 'Hydraulic plant · planes and rudder', 'pump', [-3, -4, -30, 3, 0, -26], { pw: 1 }),
    ],
    mods: { control: { pw: 1 }, sonar: { pw: 1 }, masts: { pw: 1 } },
    power: { gens: ['battery', 'diesels'], buses: [['swbd1', 'battery']], trunks: [['C', 'Main cable way', 0, -1.5]] },
    prop: null, steer: 'steer',
    fire: ['trim'],
    caps: { sonar: ['sonar', 'sonarProc'], klub: ['control', 'masts'], t53: ['control'], camera: ['masts'] },
  },
};
