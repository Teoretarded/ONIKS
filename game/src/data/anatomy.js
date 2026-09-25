/* ONIKS · anatomy data for the Inspect view (X-ray, exploded view, part tags).

   ANATOMY[key]            key = the unit / munition / structure model key (tel, radar, ..., oniks, depot ...)
     model   model key to draw in Inspect: the cutaway from CUT_MODELS when there is one (same frame and
             state as the unit model, finer parts + interior parts), else the model itself
     title   'K340P TEL · Bastion-P'          size  overall size string        note  one public-reference line
     frame   the word the X-ray slice tag uses for what it runs through ('chassis', 'hull', 'airframe', 'container'...;
             optional: ui/inspect/subject.js has defaults for the rest)
     st      state the cutaway reads best in (merge under the unit's own state; optional)
     view    { yaw, pitch } suggested camera angles (rad; fitView() computes target and distance)
     parts   ordered entries; every model part appears in exactly one entry:
       { id: '01' | null (no placard), parts: [model part names], label, size, note,
         explode: [dx, dy, dz]  model-space offset when fully exploded,
         w0: 0..1               when it leaves in the explode (it comes home in the reverse order),
         cls: 'shell'           outer skin: goes see-through under the X-ray
            | 'part'            always drawn as it is
            (interior model parts carry inside:true / show = st.xray and are 'hidden' whatever the entry says:
             revealed by the X-ray scan, and lifted out in the exploded view; set st.xray = 1 for both),
         anchor?: [x, y, z]     tag anchor in the first part's frame (default: centre of the parts' bounds),
         side?: 'L' | 'R'       placard column preference }
     xray    what the X-ray reveals inside containers, drawn only while the X-ray is on:
       { id, label, model, st, parent (the part whose xf and explode offset it follows, or null),
         inst(st) -> [rigid X in model space, before the parent's explode offset], when?(st) -> bool }

   Aliases: ANATOMY.tomahawk / sam57e6 / aim120 are the strike_missile / pantsir_missile / aam entries.
   The viewer game/models.html (src/models_view.js) draws all of this and validates it (lime dot per model).

   Helpers: explodeK(w0, e), entryOf(key, part), partOffset(key, part, e), xrayOf(key, st),
   anchorOf(model, entry, st), boundsOf(key, model, st, e), fitView(key, model, st, e, fovY),
   validateAnatomy(key, model). */
import { TRANSLOADER, DEPOT_SLOTS, DDG, PANTSIR, SUBS, BAL } from './models.js';
import { LHD_ANATOMY } from './models_lhd.js';
import { AMPHIB_ANATOMY } from './models_amphib.js';
import { UNITS3_ANATOMY } from './models_units3.js';

const { V, R, X } = window.M3;
const T3 = p => X.make(R.I(), p);
const TEL_PIV = window.HD.tel.PIV, TEL_TUBE = window.HD.tel.TUBE, TLC_LEN = window.HD.tel.TUBE_LEN;
const RIN = 4.72;                                        // round mid-body station from the TLC base
const telLauncherXf = st => X.pivotX(TEL_PIV, -((st && st.elev) || 0));
/* stowed in its container: wings and fins folded over past flat so they stay inside the TLC's Ø 1.0 m */
const ROUND_IN_TLC = { wing: -.25, fin: -.39, booster: true, cover: true };
const E = (id, parts, label, size, explode, w0, cls, more) => Object.assign({ id, parts, label, size: size || '', explode, w0, cls }, more || {});

export const ANATOMY = {
  /* ---------------------------------------------------------------- coast */
  tel: {
    model: 'tel_cut', frame: 'chassis', title: 'K340P TEL · Bastion-P', size: '13.8 × 3.1 × 3.4 m',
    note: 'Self-propelled launcher on the MZKT-7930 8×8: two 3M55 rounds in sealed transport-launch containers, erected to near-vertical to fire.',
    st: { elev: 0, dep: 1 }, view: { yaw: -1.2, pitch: .2 },
    parts: [
      E('01', ['launcher', 'capL', 'capR'], 'TLC ×2 · 3M55 Oniks', '9.25 m', [0, 3.4, 0], 0, 'shell', { anchor: [-.66, 3.06, -4.6], side: 'L', note: 'Sealed containers; the round is loaded at the factory and fired from it.' }),
      E('02', ['cab'], 'Cab · crew 3', '', [0, 2.0, 1.5], .1, 'shell', { anchor: [.9, 3.2, 5.3], side: 'R' }),
      E(null, ['bay', 'fans'], 'Power pack cover · grilles', '', [0, 4.1, .4], .05, 'shell'),
      E('03', ['engine', 'engacc'], 'YaMZ-846 · V12 diesel', '500 hp', [0, 2.3, 0], .28, 'part', { anchor: [.62, 2.3, 3.2], side: 'R' }),
      E('04', ['radR'], 'Radiator fans ×2', 'Ø 0.8 m', [1.0, 2.3, 0], .36, 'part', { anchor: [1.36, 2.62, 3.52], side: 'R' }),
      E(null, ['radL'], 'Radiator · L', '', [-1.0, 2.3, 0], .36, 'part'),
      E('05', ['ram'], 'Erector ram · 3-stage hydraulic', '4.95 m', [0, 2.2, 0], .3, 'part', { anchor: [0, 1.56, .2], side: 'L' }),
      E('06', ['gearbox'], 'Transmission · hydromechanical', '', [0, .25, 0], .46, 'part', { anchor: [.37, 1.1, 3.5], side: 'R' }),
      E('07', ['transfer'], 'Transfer case · PTO pump', '', [0, .12, 0], .48, 'part', { anchor: [.35, .95, .5], side: 'L' }),
      E(null, ['shafts'], 'Cardan shafts ×5', '', [0, 0, 0], .5, 'part'),
      E('08', ['jacksR', 'outrigR'], 'Outrigger jacks ×4', '', [.6, 1.35, 0], .3, 'part', { anchor: [1.7, .1, -6.5], side: 'L' }),
      E(null, ['jacksL', 'outrigL'], 'Outrigger jacks · L', '', [-.6, 1.35, 0], .3, 'part'),
      E('09', ['axles'], 'Axles ×4 · 1–2 steer', '', [0, 0, 0], .5, 'part', { side: 'L' }),
      E('10', ['hubR'], 'Wheel hubs ×8 · reduction gear', '', [.62, 0, 0], .52, 'part', { anchor: [1.58, .74, 2.25], side: 'R' }),
      E(null, ['hubL'], 'Wheel hubs · L', '', [-.62, 0, 0], .52, 'part'),
      E('11', ['tyresR'], 'Tyres ×8 · 1500×600-635', 'Ø 1.5 m', [1.35, 0, 0], .45, 'shell', { anchor: [1.28, 1.46, -4.95], side: 'L' }),
      E(null, ['tyresL'], 'Tyres · L', '', [-1.35, 0, 0], .45, 'shell'),
      E('12', ['frame'], 'MZKT-7930 · 8×8 frame', '13.1 m', [0, 1.35, 0], .2, 'shell', { anchor: [.8, 1.45, -5.6], side: 'L' }),
      E('13', ['tank', 'boxes'], 'Fuel tank · battery boxes', '', [0, 1.35, 0], .24, 'shell', { side: 'R' }),
    ],
    xray: [-1, 1].map(side => ({
      id: side > 0 ? 'R' : 'L', label: '3M55 · in TLC ' + (side > 0 ? 'R' : 'L'), model: 'oniks', st: ROUND_IN_TLC, parent: 'launcher',
      inst: st => [X.mul(telLauncherXf(st), T3([side * TEL_TUBE[0], TEL_TUBE[1], TEL_TUBE[2] + RIN]))],
      when: st => ((side > 0 ? st.capR : st.capL) || 0) < 1,
    })),
  },
  radar: {
    model: 'radar_cut', frame: 'chassis', title: 'Monolith-B · coastal radar', size: '13.8 × 3.1 m · mast 12.3 m',
    note: 'Search radar on an MZKT-7930: a planar array on a five-section telescopic mast over the equipment shelter.',
    view: { yaw: -1.15, pitch: .18 },
    parts: [
      E('01', ['array'], 'Monolith-B · active array', '5.0 × 1.7 m', [0, 3.2, 0], 0, 'part', { side: 'R' }),
      E('02', ['mast'], 'Telescopic mast · 5 sections', '10.5 m', [0, 2.2, 0], .1, 'part', { side: 'L' }),
      E('03', ['body'], 'Equipment shelter', '9.3 m', [0, 3.6, 0], .2, 'shell', { side: 'L' }),
      E('04', ['inside'], 'Operator consoles ×2 · racks ×4', '', [0, 1.6, 0], .3, 'part', { side: 'L' }),
      E('05', ['cab'], 'Cab · crew 3', '', [0, 2.0, 1.5], .1, 'shell', { side: 'R' }),
      E(null, ['bay', 'fans'], 'Power pack cover', '', [0, 4.1, .4], .05, 'shell'),
      E('06', ['engine'], 'YaMZ-846 · V12 · radiators ×2', '500 hp', [0, 2.3, 0], .28, 'part', { side: 'R' }),
      E('07', ['frame'], 'MZKT-7930 · 8×8 frame', '', [0, 1.0, 0], .24, 'shell', { side: 'L' }),
      E('08', ['wheelsR'], 'Wheels ×8 · 1500×600-635', '', [1.35, 0, 0], .45, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.35, 0, 0], .45, 'shell'),
    ],
    xray: [],
  },
  pantsir: {
    model: 'pantsir_cut', frame: 'chassis', title: 'Pantsir-S1 · 72V6', size: '10.9 × 2.5 m',
    note: 'Gun-missile air defence on a KamAZ-6560 8×8: twin 30 mm guns, twelve 57E6 in two packs, search and tracking radars.',
    st: { yaw: 0, pitch: .2 }, view: { yaw: -1.0, pitch: .2 },
    parts: [
      E('01', ['searchRadar'], 'Search radar · 1RS1-E', '', [0, 7.25, -.4], 0, 'part', { side: 'L' }),
      E('02', ['trackRadar'], 'Tracking radar · 1RS2-E', 'Ø 1.0 m', [0, 4.95, 1.9], .04, 'part', { side: 'R' }),
      E('03', ['eo'], 'EO director · TV / IR', '', [.6, 6.25, 1.3], .03, 'part', { side: 'R' }),
      E('04', ['gunR'], 'Twin 30 mm guns · 2A38M ×2', '30 mm', [1.15, 4.65, .4], .1, 'part', { side: 'R' }),
      E(null, ['gunL'], '2A38M · L', '', [-1.15, 4.65, .4], .1, 'part'),
      E('05', ['packR'], 'Missile packs ×2 · 6 TLC each', '3.2 m', [2.25, 5.65, -.2], .06, 'shell', { side: 'R' }),
      E(null, ['packL'], 'Missile pack · L', '', [-2.25, 5.65, -.2], .06, 'shell'),
      E('06', ['turret'], 'Combat module · turret', '', [0, 3.75, 0], .16, 'shell', { side: 'L' }),
      E('07', ['ring'], 'Turret ring · slewing bearing', 'Ø 2.0 m', [0, 2.95, 0], .22, 'part', { side: 'L' }),
      E('08', ['body'], 'Equipment module', '', [0, 1.95, 0], .3, 'shell', { side: 'L' }),
      E('09', ['power'], 'Power unit · cooling fans ×4', '', [0, .8, 0], .4, 'part', { side: 'L' }),
      E('10', ['engine'], 'KamAZ-740 · V8 diesel · radiator fan', '', [0, .45, 1.25], .44, 'part', { side: 'R' }),
      E('11', ['cab'], 'Cab · KamAZ-6560 · crew 3', '', [0, .95, 2.4], .38, 'shell', { side: 'R' }),
      E('12', ['frame'], 'Frame · KamAZ-6560 · 8×8', '', [0, 0, 0], 0, 'shell', { side: 'L' }),
      E('13', ['wheelsR'], 'Wheels ×8 · 425/85 R21', '', [1.35, 0, 0], .5, 'shell', { side: 'L' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.35, 0, 0], .5, 'shell'),
    ],
    xray: [-1, 1].map(sx => ({
      id: sx > 0 ? 'R' : 'L', label: '57E6 ×6 · in pack ' + (sx > 0 ? 'R' : 'L'), model: 'pantsir_missile', st: { booster: true, fin: 0 }, parent: sx > 0 ? 'packR' : 'packL',
      inst: st => PANTSIR.TUBES.filter(t => Math.sign(t[0]) === sx).map(t => X.mul(PANTSIR.pitchXf(st || {}), T3([t[0], t[1], (PANTSIR.TUBE_Z[0] + PANTSIR.TUBE_Z[1]) / 2]))),
    })),
  },
  drone: {
    model: 'drone_cut', title: 'Orlan-10 · recon UAV', size: '1.8 × 3.1 m',
    note: 'Small reconnaissance aircraft: tractor propeller, high wing, an EO/IR gimbal under the fuselage.',
    view: { yaw: -.9, pitch: .4 },
    parts: [
      E('01', ['wingR'], 'Wing · 3.1 m span', '3.1 m', [.5, .14, 0], .2, 'part', { side: 'R' }),
      E(null, ['wingL'], 'Wing · L', '', [-.5, .14, 0], .2, 'part'),
      E(null, ['wingC'], 'Wing centre section', '', [0, .14, 0], .2, 'part'),
      E('02', ['prop'], 'Propeller · 2 blades', '', [0, 0, .4], .1, 'part', { side: 'R' }),
      E('03', ['gimbal'], 'EO/IR gimbal', '', [0, -.24, .1], .3, 'part', { side: 'L' }),
      E('04', ['tail'], 'Tail · fin and stabiliser', '', [0, .06, -.4], .25, 'part', { side: 'L' }),
      E('05', ['antennas'], 'GNSS · datalink antennas', '', [0, .2, -.06], .35, 'part', { side: 'R' }),
      E('06', ['fuselage'], 'Fuselage · Orlan-10', '1.8 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  catapult: {
    model: 'catapult', title: 'Orlan-10 launch rail', size: '4.9 m',
    note: 'Pneumatic rail on a two-wheel trailer: the carriage throws the drone off the ramp.',
    view: { yaw: -1.0, pitch: .3 },
    parts: [
      E('01', ['carriage'], 'Carriage', '', [0, 1.4, 0], 0, 'part', { side: 'R' }),
      E('02', ['rail'], 'Pneumatic launch rail', '4.9 m', [0, .8, 0], .2, 'part', { side: 'L' }),
      E('03', ['trailer'], 'Launch trailer', '', [0, 0, 0], .4, 'part', { side: 'L' }),
    ],
    xray: [],
  },
  transloader: {
    model: 'transloader', frame: 'chassis', title: 'K342P transloader', size: '14.0 × 3.1 m',
    note: 'Reload vehicle on the MZKT-7930: carries two TLCs and swings them onto the launcher with its own crane.',
    st: { bedR: true, bedL: true }, view: { yaw: -1.1, pitch: .2 },
    parts: [
      E('01', ['tlcR', 'tlcL', 'tlcHook'], 'TLC ×2 · 3M55 · reload', '9.25 m', [0, 2.8, -.4], .06, 'shell', { side: 'L' }),
      E('02', ['boom', 'jib', 'hook', 'rope'], 'Loader crane · boom 5.3 m · jib 4.6 m', '', [0, 6.2, 1.4], 0, 'part', { side: 'R' }),
      E('03', ['column'], 'Crane column · slewing', '', [0, 3.4, 1.4], .12, 'part', { side: 'R' }),
      E('04', ['cab'], 'Cab · crew 3', '', [0, 2.0, 1.5], .1, 'shell', { side: 'R' }),
      E('05', ['bed'], 'Bed · 2 TLC cradles', '', [0, 1.6, 0], .16, 'part', { side: 'L' }),
      E('06', ['chassis', 'stabilisers'], 'MZKT-7930 · 8×8 · stabilisers ×4', '', [0, .9, 0], .22, 'shell', { side: 'L' }),
      E('07', ['wheelsR'], 'Wheels ×8 · 1500×600-635', 'Ø 1.5 m', [1.35, 0, 0], .4, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.35, 0, 0], .4, 'shell'),
    ],
    xray: [['tlcR', 'bedR'], ['tlcL', 'bedL'], ['tlcHook', 'hookTlc']].map(([part, flag]) => ({
      id: part, label: '3M55 · in TLC', model: 'oniks', st: ROUND_IN_TLC, parent: part,
      inst: st => [X.mul(tlcXfOf(part, st), T3([0, 0, RIN]))], when: st => !!st[flag],
    })),
  },
  hq: {
    model: 'hq', title: 'Coast command post', size: '28 × 28 m · mast 21.6 m',
    note: 'The battery command post: two command shelters on 6×6 trucks under a net, comms shelter, generator, antenna mast.',
    view: { yaw: -2.4, pitch: .42 },
    parts: [
      E('01', ['net'], 'Camouflage net · 23 × 16 m', '', [0, 7.5, 0], 0, 'part', { side: 'L' }),
      E('02', ['shelterA'], 'Command shelter · K1.4-type', '5.9 × 2.5 m', [0, 4.4, 0], .1, 'shell', { side: 'L' }),
      E(null, ['shelterB'], 'Command shelter 2', '', [0, 4.4, 0], .12, 'shell'),
      E('03', ['truckA'], 'Command vehicle · 6×6', '8.4 m', [0, 0, 0], .3, 'part', { side: 'L' }),
      E(null, ['truckB'], 'Command vehicle 2', '', [0, 0, 0], .3, 'part'),
      E('04', ['mast', 'guys'], 'Antenna mast · 18 m telescopic', '21.6 m', [0, 0, 4], .2, 'part', { side: 'R' }),
      E('05', ['container'], 'Comms shelter · 20 ft ISO', '6.1 m', [0, 0, -5], .25, 'shell', { side: 'R' }),
      E('06', ['generator'], 'Diesel generator · 30 kW', '', [5, 0, -2], .3, 'shell', { side: 'R' }),
      E(null, ['cables'], 'Field cables', '', [0, 0, 0], .5, 'part'),
    ],
    xray: [],
  },
  depot: {
    model: 'depot', title: 'Munition depot', size: '96 × 66 m',
    note: 'Two earth-covered magazines, an open revetment, fence and gate. Transloaders refill here.',
    st: {}, view: { yaw: -2.6, pitch: .45 },
    parts: [
      E('01', ['moundA', 'moundB'], 'Earth cover · magazines ×2', '20 × 12 m', [0, 11, 0], 0, 'shell', { side: 'L' }),
      E('02', ['archA', 'archB'], 'Concrete arch · 10.4 m span', '', [0, 6, 0], .15, 'part', { side: 'L' }),
      E('03', ['frontA', 'frontB'], 'Headwall · steel doors', '4.6 m', [0, 0, 6], .3, 'part', { side: 'R' }),
      E('04', ['stack'], 'TLC ×6 · on dunnage', '9.25 m', [0, 5, 0], .1, 'part', { side: 'R' }),
      E('05', ['revetment'], 'Revetment · earth berm', '3.6 m', [0, 0, 0], .4, 'part', { side: 'R' }),
      E('06', ['fence', 'gate', 'hut', 'lights'], 'Fence · gate · guard hut', '96 × 64 m', [0, 0, 0], .5, 'part', { side: 'L' }),
    ],
    xray: [{ id: 'MAG', label: 'TLC ×24 · stored', model: 'tlc', st: {}, parent: null,
      inst: () => DEPOT_SLOTS().flat().map(T => X.mul(T, T3([0, 0, TLC_LEN / 2]))) }],
  },
  port: {
    model: 'port', title: 'Harbour', size: '220 m quay · 230 m breakwater',
    note: 'A small commercial harbour: a quay with two portal cranes, transit sheds, and a breakwater with its light.',
    view: { yaw: 2.55, pitch: .32 },
    parts: [
      E('01', ['boomA', 'hookA', 'ropeA'], 'Portal crane · lattice jib 30 m', '30 m', [0, 14, 0], 0, 'part', { side: 'L' }),
      E(null, ['boomB', 'hookB', 'ropeB'], 'Crane B · jib', '', [0, 14, 0], 0, 'part'),
      E('02', ['houseA'], 'Slewing house · counterweight', '', [0, 8, 0], .1, 'part', { side: 'L' }),
      E(null, ['houseB'], 'Crane B · house', '', [0, 8, 0], .1, 'part'),
      E('03', ['portalA'], 'Portal · 10.5 m gauge', '', [0, 0, 0], .3, 'part', { side: 'L' }),
      E(null, ['portalB'], 'Crane B · portal', '', [0, 0, 0], .3, 'part'),
      E('04', ['shedA'], 'Transit sheds ×2 · 60 × 24 m', '', [0, 6, 0], .2, 'shell', { side: 'R' }),
      E(null, ['shedB'], 'Transit shed 2', '', [0, 6, 0], .2, 'shell'),
      E('05', ['containers'], 'Containers · 20 ft', '', [0, 10, 0], .15, 'part', { side: 'R' }),
      E('06', ['quay', 'fenders'], 'Quay · deck +2.5 m', '220 m', [0, 0, 0], .5, 'part', { side: 'L' }),
      E('07', ['breakwater'], 'Breakwater · rubble mound', '230 m', [0, 0, 0], .5, 'part', { side: 'R' }),
      E('08', ['light'], 'Breakwater head light', '9 m', [0, 12, 0], .25, 'part', { side: 'R' }),
    ],
    xray: [],
  },
  lighthouse: {
    model: 'lighthouse', title: 'Lighthouse', size: '29 m',
    note: 'Masonry tower with a lantern room; the lens turns and sweeps four beams.',
    view: { yaw: -2.2, pitch: .15 },
    parts: [
      E('01', ['lantern'], 'Lantern room · glazing · dome', '', [0, 7.5, 0], 0, 'shell', { side: 'R' }),
      E('02', ['lens'], 'Rotating lens · 4 panels', 'Ø 1.6 m', [0, 3.6, 0], .15, 'part', { side: 'L' }),
      E('03', ['gallery'], 'Gallery · railing', '', [0, 1.8, 0], .3, 'part', { side: 'R' }),
      E('04', ['tower'], 'Tower · masonry', '22 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
      E('05', ['house'], "Keeper's house", '', [7, 0, 0], .4, 'shell', { side: 'R' }),
      E('06', ['plinth'], 'Plinth · boundary wall', '', [0, 0, 0], .5, 'part', { side: 'L' }),
    ],
    xray: [],
  },
  radar_hill: {
    model: 'radar_hill', title: 'Radar station', size: '60 × 40 m · 28.3 m',
    note: 'Fixed air-surveillance post: a rotating search antenna inside a 12 m radome on a lattice tower.',
    view: { yaw: -2.3, pitch: .2 },
    parts: [
      E('01', ['radome'], 'Radome · Ø 12 m', 'Ø 12 m', [0, 10, 0], 0, 'shell', { side: 'R' }),
      E('02', ['antenna'], 'Search antenna · rotating', 'Ø 8.4 m', [0, 4.2, 0], .15, 'part', { side: 'L' }),
      E('03', ['platform'], 'Platform · railing', '12.6 m', [0, 1.8, 0], .3, 'part', { side: 'R' }),
      E('04', ['tower'], 'Lattice tower', '18 m', [0, 0, 0], .5, 'part', { side: 'L' }),
      E('05', ['building'], 'Equipment building', '14 × 7 m', [7, 0, 0], .4, 'shell', { side: 'R' }),
      E('06', ['dish'], 'Satcom dish', 'Ø 2.4 m', [4, 0, 4], .45, 'part', { side: 'R' }),
      E(null, ['fence'], 'Fence', '', [0, 0, 0], .5, 'part'),
    ],
    xray: [],
  },
  airfield: {
    model: 'airfield', title: 'Airfield', size: '2500 × 45 m runway',
    note: 'A single-runway airfield: parallel taxiway, apron, two arched hangars, control tower.',
    view: { yaw: -2.0, pitch: .5 },
    parts: [
      E('01', ['markings'], 'Runway markings · 18 / 36', '', [0, 5, 0], .1, 'part', { side: 'L' }),
      E('02', ['runway'], 'Runway · 2500 × 45 m', '2500 m', [0, 0, 0], .5, 'part', { side: 'L' }),
      E('03', ['taxiway'], 'Taxiway · 3 links', '23 m', [0, 0, 0], .5, 'part', { side: 'R' }),
      E('04', ['apron'], 'Apron · 140 × 300 m', '', [0, 0, 0], .5, 'part', { side: 'R' }),
      E('05', ['hangarA'], 'Hangars ×2 · arched', '40 m span', [0, 16, 0], 0, 'shell', { side: 'R' }),
      E(null, ['hangarB'], 'Hangar 2', '', [0, 16, 0], 0, 'shell'),
      E('06', ['tower'], 'Control tower', '22 m', [0, 20, 0], .05, 'part', { side: 'R' }),
      E(null, ['windsock'], 'Windsock', '', [0, 0, 0], .5, 'part'),
    ],
    xray: [],
  },
  /* ---------------------------------------------------------------- fleet */
  destroyer: {
    model: 'destroyer_cut', title: 'DDG-51 Arleigh Burke · Flight IIA', size: '155 × 20 m',
    note: 'Guided-missile destroyer: Aegis with four SPY-1D faces, 96 Mk 41 cells, a 5-inch gun, two Phalanx, twin hangars.',
    view: { yaw: -1.1, pitch: .3 },
    parts: [
      E('01', ['bow'], 'Bow · AN/SQS-53C sonar dome', '', [0, 0, 20], .44, 'shell', { side: 'R' }),
      E('02', ['gun'], 'Mk 45 Mod 4 · 5-inch/62', '127 mm', [0, 11, 22], .24, 'part', { side: 'R' }),
      E('03', ['vlsF', 'vlsBF'], 'Mk 41 VLS · forward', '32 cells', [0, 14, 6], .28, 'part', { side: 'R' }),
      E('04', ['superF'], 'Deckhouse · AN/SPY-1D(V) ×4', '', [0, 22, 4], .06, 'shell', { side: 'R' }),
      E('05', ['mast', 'sps'], 'Mast · AN/SPS-67 · URN-25 TACAN', '', [0, 25, 6], 0, 'part', { side: 'R' }),
      E('06', ['ciwsF'], 'Phalanx CIWS 1B · forward', '20 mm', [0, 27, 8], .12, 'part', { side: 'R' }),
      E('07', ['stacks'], 'Uptakes ×2 · midships deckhouse', '', [0, 24, -2], .16, 'shell', { side: 'L' }),
      E('08', ['boatsS'], '7 m RHIB ×2 · davits', '', [12, 8, 0], .2, 'part', { side: 'L' }),
      E(null, ['boatsP'], 'RHIB · port', '', [-12, 8, 0], .2, 'part'),
      E('09', ['mach', 'trunks'], 'LM2500 ×4 · reduction gears ×2', '100 000 shp', [0, 12, 0], .5, 'part', { side: 'L' }),
      E('10', ['vlsA', 'vlsBA'], 'Mk 41 VLS · aft', '64 cells', [0, 15, 0], .32, 'part', { side: 'L' }),
      E('11', ['ciwsA'], 'Phalanx CIWS 1B · aft', '20 mm', [0, 25, -10], .38, 'part', { side: 'L' }),
      E('12', ['hangar', 'hdoor'], 'Hangar ×2 · aft deckhouse', '', [0, 17, -8], .36, 'shell', { side: 'L' }),
      E('13', ['helo'], 'MH-60R Seahawk · blades folded', '', [0, 3.6, -21], .4, 'part', { side: 'L' }),
      E('14', ['props', 'shaftIn'], 'Shafts ×2 · 5-blade CRP propellers', 'Ø 5.2 m', [0, -9, -4], .56, 'part', { side: 'L' }),
      E('15', ['hullMid'], 'Hull · midbody', '155.3 m', [0, 0, 0], 0, 'shell', { side: 'R' }),
      E('16', ['stern'], 'Stern · flight deck', '', [0, 0, -18], .44, 'shell', { side: 'L' }),
    ],
    xray: [true, false].map(fwd => ({
      id: fwd ? 'VF' : 'VA', label: 'Mk 41 canisters · ' + (fwd ? '32' : '64'), model: 'mk41_can', st: {}, parent: fwd ? 'vlsBF' : 'vlsBA',
      inst: () => { const out = []; for (let i = fwd ? 0 : 32; i < (fwd ? 32 : 96); i++) { const c = DDG.cell(i); out.push(T3([c[0], c[1] - .35, c[2]])); } return out; },
    })),
  },
  carrier: {
    model: 'carrier_cut', frame: 'hull', title: 'CVN-68 · Nimitz class', size: '332.8 × 76.8 m · draught 11.3 m',
    note: 'Nuclear aircraft carrier: two A4W reactors, four shafts; a 9° angled deck with four C-13 steam catapults and three arresting wires, four deck-edge elevators, the island with AN/SPS-48E and AN/SPS-49.',
    st: { radar: .6, jbd: 1 }, view: { yaw: -1.38, pitch: .3 },
    parts: [
      // the island comes apart first, level by level, the radars highest
      E('01', ['radars48'], 'AN/SPS-48E · 3-D air search', '', [0, 106, 6], 0, 'part', { side: 'R' }),
      E('02', ['radars49'], 'AN/SPS-49 · 2-D air search', '', [0, 102, -6], .02, 'part', { side: 'R' }),
      E('03', ['mast'], 'Masts · URN-25 TACAN · SATCOM', '64 m', [0, 94, 0], .05, 'part', { side: 'R' }),
      E('04', ['islandTop'], 'Primary Flight Control · 010 level', '', [0, 84, 0], .08, 'shell', { side: 'R' }),
      E('05', ['islandBridge'], 'Navigation bridge · flag bridge', '', [0, 76, 0], .11, 'shell', { side: 'R' }),
      E('06', ['islandBase', 'islandIn'], 'Island · 05–07 levels', '38 × 8.8 m', [0, 68, 0], .14, 'shell', { side: 'R' }),
      // then what stands on the deck, then the deck lifts off
      E('07', ['cats', 'catsJbd'], 'C-13-1 steam catapults ×4 · JBDs', '94 m', [0, 58, 0], .18, 'part', { side: 'L' }),
      E('08', ['wires'], 'Mk 7 arresting gear · 3 pendants · IFLOLS', '', [0, 58, 0], .2, 'part', { side: 'L' }),
      E('09', ['elevatorsS'], 'Deck-edge elevators ×4 · 47 t', '26 × 13.4 m', [10, 52, 0], .22, 'part', { side: 'R' }),
      E(null, ['elevatorsP'], 'Elevator 4 · port', '', [-10, 52, 0], .22, 'part'),
      E('10', ['deck'], 'Flight deck · 9° angled deck', '332.8 × 76.8 m', [0, 50, 0], .27, 'shell', { side: 'L' }),
      E('11', ['nssm', 'ram'], 'Mk 29 NSSM ×2 · Mk 49 RAM ×2', '', [0, 50, 0], .3, 'part', { side: 'L' }),
      E('12', ['ciws'], 'Phalanx CIWS 1B ×3', '20 mm', [0, 50, 0], .31, 'part', { side: 'R' }),
      E('13', ['boats'], 'Boats · liferaft racks', '', [0, 30, -34], .33, 'part', { side: 'L' }),
      // the hangar rises out of the hull, the machinery spaces after it; the hull splits last
      E('14', ['hangar'], 'Hangar deck · 3 bays', '208 × 33 m', [0, 30, 0], .36, 'part', { side: 'L' }),
      E('15', ['reactors'], 'A4W reactor ×2', '', [0, 16, 0], .4, 'part', { side: 'R' }),
      E('16', ['machinery'], 'Main machinery rooms ×2 · steam turbines ×4', '260 000 shp', [0, 16, 0], .42, 'part', { side: 'L' }),
      E('17', ['magazines'], 'Magazines · forward · aft', '', [0, 16, 0], .44, 'part', { side: 'L' }),
      E('18', ['props', 'shaftsIn'], 'Shafts ×4 · 5-blade propellers', 'Ø 6.4 m', [0, -14, -46], .47, 'part', { side: 'L' }),
      E(null, ['rudders'], 'Rudders ×2', '', [0, -10, -52], .49, 'part'),
      E('19', ['anchors'], 'Anchors ×2 · 30 t', '', [0, 4, 46], .5, 'part', { side: 'R' }),
      E('20', ['hullMid'], 'Hull · 317 m on the waterline', '40.8 m beam', [0, 0, 0], .54, 'shell', { side: 'R' }),
      E('21', ['hullBow'], 'Bow · bulbous bow · hawse pipes', '', [0, 0, 34], .52, 'shell', { side: 'R' }),
      E('22', ['hullStern'], 'Stern · fantail', '', [0, 0, -32], .52, 'shell', { side: 'L' }),
    ],
    // the air wing below decks: F/A-18Es in bays 1-2, E-2Ds (wings folded) in bay 3
    xray: [
      { id: 'HB', label: 'F/A-18E Super Hornet ×8 · in hangar bays 1–2', model: 'fighter', st: {}, parent: 'hangar',
        inst: () => [[-8.2, 64], [8.2, 52], [-8.2, 38], [8.2, 26], [-8.2, -6], [8.2, -20], [-8.2, -34], [8.2, -48]].map(([x, z]) => T3([x, 10.4, z])) },
      { id: 'AW', label: 'E-2D Hawkeye ×2 · in hangar bay 3', model: 'aew', st: { fold: 1, dome: 0, prop: 0 }, parent: 'hangar',
        inst: () => [[-7.5, -86], [7.5, -106]].map(([x, z]) => T3([x, 8.3 + 2.1, z])) },
    ],
  },
  helo: {
    model: 'helo_cut', title: 'MH-60R Seahawk', size: '19.8 m · rotor Ø 16.4 m',
    note: 'Navy multi-mission helicopter: two T700 turboshafts, four-blade main rotor, canted tail rotor, radome and FLIR.',
    view: { yaw: -1.0, pitch: .22 },
    parts: [
      E('01', ['rotor'], 'Main rotor · 4 blades', 'Ø 16.36 m', [0, 3.2, 0], 0, 'part', { side: 'R' }),
      E('02', ['tailrotor'], 'Tail rotor · canted 20°', 'Ø 3.35 m', [1.3, .6, -3.0], .1, 'part', { side: 'L' }),
      E('03', ['tail'], 'Tail pylon · stabilator', '', [0, .4, -2.6], .16, 'part', { side: 'L' }),
      E('04', ['sensors'], 'MTS FLIR · AN/APS-153 radome', '', [0, -1.0, 1.4], .25, 'part', { side: 'R' }),
      E('05', ['pylonsR'], 'Weapon pylons ×2', '', [1.4, -.3, 0], .35, 'part', { side: 'R' }),
      E(null, ['pylonsL'], 'Pylon · L', '', [-1.4, -.3, 0], .35, 'part'),
      E('06', ['gearR'], 'Landing gear · main ×2 · tail', '', [1.1, -.9, 0], .3, 'part', { side: 'R' }),
      E(null, ['gearL'], 'Main gear · L', '', [-1.1, -.9, 0], .3, 'part'),
      E(null, ['gearT'], 'Tail wheel', '', [0, -.9, -.8], .3, 'part'),
      E('07', ['fuselage'], 'Fuselage · T700 ×2', '19.76 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  fighter: {
    model: 'fighter_cut', title: 'F/A-18E Super Hornet', size: '18.3 × 13.6 m',
    note: 'Carrier strike fighter: two F414-GE-400, caret intakes, twin canted tails.',
    view: { yaw: -.9, pitch: .45 },
    parts: [
      E('01', ['canopy'], 'Canopy', '', [0, 2.0, .8], 0, 'part', { side: 'R' }),
      E('02', ['wingsR'], 'Wing · 13.62 m span', '13.62 m', [3.6, .3, 0], .2, 'part', { side: 'R' }),
      E(null, ['wingsL'], 'Wing · L', '', [-3.6, .3, 0], .2, 'part'),
      E('03', ['tailsR'], 'Vertical tails ×2 · 20° cant', '', [1.4, 2.6, -.8], .15, 'part', { side: 'R' }),
      E(null, ['tailsL'], 'Tail · L', '', [-1.4, 2.6, -.8], .15, 'part'),
      E('04', ['stabsR'], 'Stabilators', '', [2.6, -.2, -2.4], .25, 'part', { side: 'R' }),
      E(null, ['stabsL'], 'Stabilator · L', '', [-2.6, -.2, -2.4], .25, 'part'),
      E('05', ['lexR'], 'Leading-edge extensions', '', [.8, .5, .8], .1, 'part', { side: 'L' }),
      E(null, ['lexL'], 'LEX · L', '', [-.8, .5, .8], .1, 'part'),
      E('06', ['intakesR'], 'Caret intakes · F414 fan', '', [1.6, -1.4, .8], .3, 'part', { side: 'L' }),
      E(null, ['intakesL', 'intakesC'], 'Intake · L', '', [-1.6, -1.4, .8], .3, 'part'),
      E('07', ['nozzlesR'], 'F414-GE-400 nozzles', '', [.7, 0, -3.2], .35, 'part', { side: 'L' }),
      E(null, ['nozzlesL', 'nozzlesC'], 'Nozzle · L', '', [-.7, 0, -3.2], .35, 'part'),
      E('08', ['pylonsR', 'pylonsC'], 'Pylons', '', [2.4, -2.2, 0], .4, 'part', { side: 'L' }),
      E(null, ['pylonsL'], 'Pylons · L', '', [-2.4, -2.2, 0], .4, 'part'),
      E('09', ['fuselage'], 'Fuselage · F/A-18E', '18.31 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  aew: {
    model: 'aew_cut', frame: 'airframe', title: 'E-2D Advanced Hawkeye', size: '17.6 × 24.6 m · rotodome Ø 7.32 m',
    note: 'Carrier-borne airborne early warning aircraft: the AN/APY-9 radar turns in its rotodome about six times a minute; two T56 turboprops, eight-blade propellers, four fins.',
    st: { dome: .5, prop: .3, fold: 0 }, view: { yaw: -.95, pitch: .36 },
    parts: [
      E('01', ['dome'], 'Rotodome · AN/APY-9', 'Ø 7.32 m', [0, 3.4, 0], 0, 'shell', { side: 'R' }),
      E('02', ['antenna'], 'AN/APY-9 · UHF electronically scanned array', '', [0, 2.2, 0], .08, 'part', { side: 'R' }),
      E('03', ['pylon'], 'Rotodome pylon', '', [0, 1.3, 0], .16, 'part', { side: 'L' }),
      E('04', ['propR'], 'NP2000 propellers · 8 blades', 'Ø 4.11 m', [0, 0, 2.4], .1, 'part', { side: 'R' }),
      E(null, ['propL'], 'Propeller · L', '', [0, 0, 2.4], .1, 'part'),
      E('05', ['engines'], 'T56-A-427A turboprops ×2', '5 100 shp', [0, -1.8, .6], .32, 'part', { side: 'L' }),
      E('06', ['nacelleR'], 'Engine nacelles · main gear bays', '', [1.1, -1.1, 0], .24, 'shell', { side: 'R' }),
      E(null, ['nacelleL'], 'Nacelle · L', '', [-1.1, -1.1, 0], .24, 'shell'),
      E('07', ['outerR'], 'Outer wings · fold back (Sto-Wing)', '7.8 m', [3.2, .5, 0], .18, 'part', { side: 'R' }),
      E(null, ['outerL'], 'Outer wing · L', '', [-3.2, .5, 0], .18, 'part'),
      E('08', ['wing'], 'Wing centre section', '24.56 m span', [0, .9, 0], .28, 'part', { side: 'L' }),
      E('09', ['tail'], 'Tailplane · four fins', '', [0, .7, -2.6], .2, 'part', { side: 'L' }),
      E('10', ['cabin'], 'Flight deck · mission crew ×3', '', [0, -.2, 0], .44, 'part', { side: 'R' }),
      E('11', ['hook'], 'Arresting hook', '', [0, -1.0, -1.4], .36, 'part', { side: 'L' }),
      E('12', ['fuselage'], 'Fuselage · crew 5', '17.6 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  ssn: {
    model: 'ssn_cut', frame: 'hull', title: 'SSN Virginia class · Block III', size: '114.9 × 10.4 m',
    note: 'Nuclear attack submarine: large-aperture bow sonar, two Virginia Payload Tubes of six Tomahawk cells, four 533 mm torpedo tubes, photonics masts instead of periscopes, a pump-jet.',
    st: { mast: 1, vptA: 0, vptB: 0 }, view: { yaw: -1.05, pitch: .3 },
    parts: [
      E('01', ['masts'], 'Photonics masts ×2 · mast array', '', [0, 9, 0], 0, 'part', { side: 'R' }),
      E('02', ['sail'], 'Sail · leading-edge fillet', '', [0, 12, 0], .05, 'shell', { side: 'R' }),
      E('03', ['control'], 'Control room · command deck', '', [0, 7, 0], .18, 'part', { side: 'L' }),
      E('04', ['vpt'], 'Virginia Payload Tubes ×2 · hatches', 'Ø 2.2 m', [0, 14, 6], .1, 'part', { side: 'R' }),
      E('05', ['vptTubes'], 'VPT · six cells each', '', [0, 9, 6], .14, 'part', { side: 'R' }),
      E('06', ['torpRoom'], 'Torpedo room · 4 tubes · 533 mm', '', [0, -9, 5], .26, 'part', { side: 'L' }),
      E('07', ['bow', 'lab'], 'Large Aperture Bow · sonar array', '', [0, 0, 18], .3, 'shell', { side: 'R' }),
      E('08', ['bowPlanes'], 'Bow planes · retractable', '', [0, 3, 12], .22, 'part', { side: 'R' }),
      E('09', ['reactor'], 'Reactor compartment · S9G', '', [0, 11, 0], .34, 'part', { side: 'L' }),
      E('10', ['engine'], 'Engine room · main turbines · shaft', '', [0, -9, -6], .38, 'part', { side: 'L' }),
      E('11', ['arrays'], 'Wide-aperture flank arrays ×6', '', [0, -5, 0], .2, 'part', { side: 'L' }),
      E('12', ['sternPlanes'], 'Stern planes · end plates · rudders', '', [0, 0, -14], .3, 'part', { side: 'L' }),
      E('13', ['propulsor'], 'Pump-jet propulsor', 'Ø 4.6 m', [0, 0, -24], .34, 'part', { side: 'L' }),
      E('14', ['hull'], 'Hull · Ø 10.4 m', '114.9 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
      E(null, ['stern'], 'Stern', '', [0, 0, -8], .42, 'shell'),
    ],
    xray: [
      { id: 'VPT', label: 'Tomahawk cells ×12 · VPT', model: 'vpt_can', st: {}, parent: 'vptTubes',
        inst: () => Array.from({ length: 12 }, (_, i) => { const c = SUBS.ssn.cell(i); return T3([c[0], c[1] - .1, c[2]]); }) },
      { id: 'SK', label: 'Mk 48 · 533 mm · skids ×6', model: 'torpedo533', st: {}, parent: 'torpRoom',
        inst: () => [-2.7, -1.75, -.8, .8, 1.75, 2.7].map(x => T3([x, SUBS.ssn.AX - 2.73, 25.5])) },
      { id: 'TT', label: 'Mk 48 · in the tubes ×4', model: 'torpedo533', st: {}, parent: 'torpRoom',
        inst: () => {
          const out = [], AX = SUBS.ssn.AX, R0 = SUBS.ssn.R;
          for (const s of [-1, 1]) for (const y of [AX - 1.5, AX - 2.6]) {
            const a = [s * .85, y, 30.5], b = [s * (Math.sqrt(Math.max(0, R0 * R0 - (y - AX) ** 2)) - .35), y, 40.5], d = V.norm(V.sub(b, a));
            out.push(X.make(R.look(d, [0, 1, 0]), V.mad(a, d, 3.4)));
          }
          return out;
        } },
    ],
  },
  ssk: {
    model: 'ssk_cut', frame: 'hull', title: 'Kilo class · Project 636.3', size: '73.8 × 9.9 m',
    note: 'Diesel-electric attack submarine: six 533 mm bow tubes for torpedoes and Kalibr missiles, a large bow sonar, very quiet running on its batteries.',
    st: { mast: 1 }, view: { yaw: -1.05, pitch: .3 },
    parts: [
      E('01', ['masts'], 'Periscopes ×2 · radar · ESM · snorkel', '', [0, 8, 0], 0, 'part', { side: 'R' }),
      E('02', ['sail'], 'Sail · bridge', '', [0, 10, 0], .05, 'shell', { side: 'R' }),
      E('03', ['control'], 'Central post', '', [0, 6, 0], .16, 'part', { side: 'L' }),
      E('04', ['casing'], 'Upper casing · limber holes', '', [0, 5, 0], .1, 'shell', { side: 'L' }),
      E('05', ['torpRoom'], 'Torpedo room · 6 tubes · 533 mm', '', [0, -7, 5], .24, 'part', { side: 'R' }),
      E('06', ['bow', 'sonarArr'], 'Bow · MGK-400EM sonar', '', [0, 0, 12], .3, 'shell', { side: 'R' }),
      E('07', ['bowPlanes'], 'Bow planes · retractable', '', [0, 3, 9], .2, 'part', { side: 'R' }),
      E('08', ['battery'], 'Batteries · 2 groups', '', [0, -8, 0], .32, 'part', { side: 'L' }),
      E('09', ['diesels'], 'Diesel generators ×2', '', [0, 7, -3], .36, 'part', { side: 'L' }),
      E('10', ['motor'], 'Main propulsion motor · shaft', '', [0, -6, -6], .4, 'part', { side: 'L' }),
      E('11', ['sternPlanes'], 'Stern planes · rudders', '', [0, 0, -9], .3, 'part', { side: 'L' }),
      E('12', ['prop'], 'Propeller · 7 blades · skewed', 'Ø 3.1 m', [0, 0, -15], .34, 'part', { side: 'L' }),
      E('13', ['hull'], 'Hull · double hull', '73.8 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
      E(null, ['stern'], 'Stern', '', [0, 0, -5], .42, 'shell'),
    ],
    xray: [
      { id: 'RK', label: 'Torpedoes · 533 mm · racks ×8', model: 'torpedo533', st: {}, parent: 'torpRoom',
        inst: () => { const out = [], AX = SUBS.ssk.AX; for (const s of [-1, 1]) for (const x of [.85, 1.9]) for (const y of [AX - 2.0, AX - .75]) out.push(T3([s * x, y + .39, 22.1])); return out; } },
      { id: 'TT', label: 'Torpedoes · 533 mm · in the tubes ×6', model: 'torpedo533', st: {}, parent: 'torpRoom',
        inst: () => SUBS.ssk.TUBES.map(([x, y]) => T3([x, y, 30.5])) },
    ],
  },
  bal: {
    model: 'bal_cut', frame: 'chassis', title: 'Bal · 3K60 coastal missile system', size: '14.0 × 3.1 m',
    note: 'Self-propelled launcher on the MZKT-7930 8×8: eight Kh-35U anti-ship missiles in containers; the pack rises at the rear and the rounds leave over the back.',
    st: { elev: 0, dep: 1, n: 8 }, view: { yaw: -2.1, pitch: .2 },
    parts: [
      E('01', ['pack'], 'Containers ×8 · Kh-35U', '6.3 m', [0, 2.8, -.3], 0, 'shell', { side: 'L' }),
      E('02', ['caps'], 'Container rear covers', '', [0, 2.8, -1.4], .03, 'part', { side: 'R' }),
      E('03', ['ram'], 'Pack ram · hydraulic', '', [0, 1.6, 0], .18, 'part', { side: 'L' }),
      E('04', ['cabin'], 'Crew cabin · launch control', '', [0, 2.6, 0], .1, 'shell', { side: 'R' }),
      E('05', ['consoles'], 'Launch control consoles ×2', '', [0, 1.5, 0], .22, 'part', { side: 'R' }),
      E('06', ['cab'], 'Cab · MZKT-7930', '', [0, 2.0, 1.5], .08, 'shell', { side: 'R' }),
      E(null, ['bay'], 'Power pack cover', '', [0, 3.6, .4], .05, 'shell'),
      E('07', ['engine'], 'YaMZ-846 · V12 diesel', '500 hp', [0, 2.0, .2], .3, 'part', { side: 'R' }),
      E('08', ['jacks'], 'Outrigger jacks ×4', '', [0, -.5, 0], .32, 'part', { side: 'L' }),
      E('09', ['chassis'], 'MZKT-7930 · 8×8 frame', '', [0, .9, 0], .24, 'shell', { side: 'L' }),
      E('10', ['wheelsR'], 'Wheels ×8 · 1500×600-635', 'Ø 1.5 m', [1.35, 0, 0], .42, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.35, 0, 0], .42, 'shell'),
    ],
    xray: [{ id: 'K', label: 'Kh-35U · in its container', model: 'kh35', st: { wing: 0, fin: 0, booster: true }, parent: 'pack',
      inst: st => { const n = st && st.n !== undefined ? Math.round(st.n) : 8, out = []; for (let k = 8 - Math.max(0, Math.min(8, n)); k < 8; k++) out.push(X.mul(BAL.packXf(st || {}), X.make(R.y(Math.PI), BAL.cont(k)))); return out; } }],
  },
  /* ---------------------------------------------------------------- munitions */
  oniks: {
    model: 'oniks_cut', title: 'P-800 Oniks · 3M55', size: '8.9 m · Ø 0.7 m',
    note: 'Supersonic anti-ship missile, ~Mach 2.5: integral rocket-ramjet; the solid booster sits in the ramjet chamber until burnout.',
    st: { wing: 1, fin: 1, booster: true, cover: false }, view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['cover'], 'Intake cover', '', [0, 0, 1.9], 0, 'part', { side: 'R' }),
      E('02', ['intake'], 'Annular intake · seeker radome', '', [0, 0, .95], .1, 'part', { side: 'R' }),
      E('03', ['wingR'], 'Wings ×2 · folding', '1.76 m', [.75, 0, 0], .2, 'part', { side: 'R' }),
      E(null, ['wingL'], 'Wing · L', '', [-.75, 0, 0], .2, 'part'),
      E('04', ['fin1'], 'Tail fins ×4 · folding', '', [.36, .36, -.35], .3, 'part', { side: 'L' }),
      E(null, ['fin2'], 'Tail fin 2', '', [-.36, .36, -.35], .3, 'part'),
      E(null, ['fin3'], 'Tail fin 3', '', [-.36, -.36, -.35], .3, 'part'),
      E(null, ['fin4'], 'Tail fin 4', '', [.36, -.36, -.35], .3, 'part'),
      E('05', ['nozzle'], 'Ramjet nozzle', 'Ø 0.61 m', [0, 0, -.8], .36, 'part', { side: 'L' }),
      E('06', ['booster'], 'Solid booster · in the ramjet chamber', '', [0, 0, -1.5], .42, 'part', { side: 'L' }),
      E('07', ['body'], 'Body · 3M55', '8.9 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
    ],
    xray: [{ id: 'B', label: 'Booster casing · in chamber', model: 'oniks_booster', st: {}, parent: 'booster', inst: () => [T3([0, 0, -3.35])], when: st => st.booster !== false }],
  },
  sm6: {
    model: 'sm6_cut', title: 'RIM-174 SM-6', size: '6.55 m',
    note: 'Extended-range interceptor: Mk 72 booster, active radar seeker, long low strakes and four tail control fins.',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['radome'], 'Radome · active seeker', '', [0, 0, .75], 0, 'part', { side: 'R' }),
      E('02', ['fin1'], 'Control fins ×4', '', [.3, .3, 0], .15, 'part', { side: 'R' }),
      E(null, ['fin2'], 'Fin 2', '', [-.3, .3, 0], .15, 'part'),
      E(null, ['fin3'], 'Fin 3', '', [-.3, -.3, 0], .15, 'part'),
      E(null, ['fin4'], 'Fin 4', '', [.3, -.3, 0], .15, 'part'),
      E('03', ['nozzle'], 'Mk 104 sustainer nozzle', '', [0, 0, -.5], .3, 'part', { side: 'L' }),
      E('04', ['mk72'], 'Mk 72 booster', 'Ø 0.53 m', [0, 0, -1.1], .35, 'part', { side: 'L' }),
      E('05', ['mk72fins'], 'Mk 72 fins ×4', '', [0, 0, -1.5], .42, 'part', { side: 'L' }),
      E('06', ['body'], 'RIM-174 SM-6 · Ø 0.34 m', '6.55 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
    ],
    xray: [],
  },
  tlc: {
    model: 'tlc', frame: 'container', title: 'TLC · 3M55 Oniks', size: '9.6 m · Ø 1.1 m',
    note: 'Sealed transport-launch container: the round is stored, carried and fired from it.',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['cap'], 'TLC front cap', '', [0, 0, 1.0], 0, 'part', { side: 'R' }),
      E('02', ['shell'], 'TLC · 3M55 Oniks · sealed', '9.25 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [{ id: 'R', label: '3M55 · in TLC', model: 'oniks', st: ROUND_IN_TLC, parent: 'shell', inst: () => [T3([0, 0, RIN - TLC_LEN / 2])] }],
  },
  oniks_booster: {
    model: 'oniks_booster', title: 'Oniks booster · spent', size: '2.84 m',
    view: { yaw: -1.3, pitch: .2 },
    parts: [E('01', ['nozzle'], 'Booster nozzle', '', [0, 0, -.35], 0, 'part'), E('02', ['casing'], 'Booster casing · spent', '', [0, 0, 0], .5, 'part')],
    xray: [],
  },
  mk72: {
    model: 'mk72', title: 'Mk 72 booster · spent', size: '1.73 m · Ø 0.53 m',
    view: { yaw: -1.3, pitch: .2 },
    parts: [E('01', ['mk72'], 'Mk 72 booster · spent', '1.73 m', [0, 0, 0], 0, 'part')],
    xray: [],
  },
  pantsir_missile: {
    model: 'pantsir_missile', title: '57E6 · Pantsir-S1', size: '3.2 m',
    note: 'Two-stage command-guided surface-to-air missile: a Ø 170 mm booster and a Ø 90 mm sustainer dart.',
    st: { booster: true, fin: 1 }, view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['nose'], 'Nose cone', '', [0, 0, .45], 0, 'part', { side: 'R' }),
      E('02', ['dart', 'finsD'], 'Sustainer dart · Ø 90 mm', '1.8 m', [0, 0, .12], .2, 'part', { side: 'R' }),
      E('03', ['booster'], 'Booster stage · Ø 170 mm', '1.4 m', [0, 0, -.45], .35, 'part', { side: 'L' }),
      E('04', ['finsB'], 'Booster fins ×4 · folding', '', [0, 0, -.7], .45, 'part', { side: 'L' }),
    ],
    xray: [],
  },
  strike_missile: {
    model: 'strike_missile', title: 'Strike missile · Tomahawk-class', size: '5.56 m · Ø 0.52 m',
    note: 'Subsonic land-attack / anti-ship cruise missile: pop-out wings, folding tail, ventral inlet, solid booster for launch.',
    st: { wing: 1, fin: 1, inlet: 1, booster: true }, view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['nose'], 'Nose', '', [0, 0, 1.0], 0, 'part', { side: 'R' }),
      E('02', ['wings'], 'Wings ×2 · pop-out', '2.67 m', [0, .9, 0], .15, 'part', { side: 'R' }),
      E('03', ['inlet'], 'Air inlet · ventral', '', [0, -.6, -.2], .25, 'part', { side: 'L' }),
      E('04', ['fins'], 'Tail fins ×4 · folding', '', [0, 0, -.8], .3, 'part', { side: 'L' }),
      E('05', ['booster'], 'Booster · solid', '0.72 m', [0, 0, -1.7], .38, 'part', { side: 'L' }),
      E('06', ['body'], 'Body · Ø 0.52 m', '5.56 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
    ],
    xray: [],
  },
  aam: {
    model: 'aam', title: 'AIM-120 AMRAAM', size: '3.66 m · Ø 178 mm',
    note: 'Medium-range air-to-air missile carried by the Super Hornet.',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['radome'], 'Radome', '', [0, 0, .5], 0, 'part', { side: 'R' }),
      E('02', ['wings'], 'Mid-body wings ×4', '', [0, 0, .25], .2, 'part', { side: 'R' }),
      E('03', ['fins'], 'Tail control fins ×4', '', [0, 0, -.5], .3, 'part', { side: 'L' }),
      E('04', ['body'], 'AIM-120 · Ø 178 mm', '3.66 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  shell: {
    model: 'shell', title: '5"/62 projectile', size: '127 mm · 0.66 m',
    note: 'Mk 45 Mod 4 gun round (projectile only).',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['ogive'], 'Ogive nose', '', [0, 0, .12], 0, 'part', { side: 'R' }),
      E('02', ['band'], 'Rotating band', '', [0, 0, -.07], .25, 'part', { side: 'L' }),
      E('03', ['body'], 'Projectile body · 127 mm', '0.66 m', [0, 0, 0], .5, 'part', { side: 'L' }),
    ],
    xray: [],
  },
  essm: {
    model: 'essm', title: 'RIM-162 ESSM', size: '3.66 m · Ø 254 mm',
    note: 'Evolved Sea Sparrow: short-range ship self-defence missile.',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['radome'], 'Radome', '', [0, 0, .45], 0, 'part', { side: 'R' }),
      E('02', ['fins'], 'Tail control fins ×4', '', [0, 0, -.5], .25, 'part', { side: 'L' }),
      E('03', ['body'], 'Body · strakes ×4', '3.66 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  slam: {
    model: 'slam', title: 'AGM-84H SLAM-ER', size: '4.37 m · Ø 0.34 m',
    note: 'Air-launched stand-off land-attack missile carried by the Super Hornet.',
    view: { yaw: -1.3, pitch: .25 },
    parts: [
      E('01', ['nose'], 'Nose · seeker window', '', [0, 0, .6], 0, 'part', { side: 'R' }),
      E('02', ['wings'], 'Wings ×4 · pop-out', '2.4 m', [0, .9, 0], .15, 'part', { side: 'R' }),
      E('03', ['fins'], 'Tail control fins ×4', '', [0, 0, -.6], .3, 'part', { side: 'L' }),
      E('04', ['body'], 'Body · Ø 0.34 m', '4.37 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  hellfire: {
    model: 'hellfire', title: 'AGM-114 Hellfire', size: '1.63 m · Ø 178 mm',
    note: 'Light air-to-surface missile carried by the MH-60R.',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['nose'], 'Nose · seeker dome', '', [0, 0, .25], 0, 'part', { side: 'R' }),
      E('02', ['canards'], 'Canards ×4', '', [0, 0, .12], .15, 'part', { side: 'R' }),
      E('03', ['wings'], 'Wings ×4', '', [0, 0, -.25], .3, 'part', { side: 'L' }),
      E('04', ['body'], 'Body · Ø 178 mm', '1.63 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  kh35: {
    model: 'kh35', title: 'Kh-35U · Bal', size: '4.4 m · Ø 0.42 m',
    note: 'Subsonic sea-skimming anti-ship missile: a small turbofan fed by a flush belly intake, cruciform folding wings, a solid booster for the launch.',
    st: { wing: 1, fin: 1, booster: true }, view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['nose'], 'Nose · radar seeker radome', '', [0, 0, .8], 0, 'part', { side: 'R' }),
      E('02', ['wings'], 'Wings ×4 · folding', '1.33 m', [0, 0, .25], .15, 'part', { side: 'R' }),
      E('03', ['inlet'], 'Air intake · ventral', '', [0, -.5, 0], .22, 'part', { side: 'L' }),
      E('04', ['fins'], 'Tail fins ×4 · folding', '', [0, 0, -.6], .3, 'part', { side: 'L' }),
      E('05', ['booster'], 'Booster · solid', '0.58 m', [0, 0, -1.3], .38, 'part', { side: 'L' }),
      E('06', ['body'], 'Kh-35U · Ø 0.42 m', '3.8 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
    ],
    xray: [],
  },
  kalibr: {
    model: 'kalibr', title: '3M-54 Kalibr · anti-ship', size: '8.22 m · Ø 0.533 m',
    note: 'Submarine-launched anti-ship cruise missile, fired from a 533 mm tube: a subsonic cruise stage and a supersonic terminal stage.',
    st: { wing: 1, fin: 1, booster: true }, view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['nose'], 'Nose · seeker radome', '', [0, 0, 1.4], 0, 'part', { side: 'R' }),
      E('02', ['terminal'], 'Terminal stage · supersonic', '', [0, 0, .8], .1, 'part', { side: 'R' }),
      E('03', ['wings'], 'Wings ×2 · pop-out', '3.1 m', [0, -.8, 0], .18, 'part', { side: 'R' }),
      E('04', ['inlet'], 'Air intake · ventral', '', [0, -.6, -.3], .24, 'part', { side: 'L' }),
      E('05', ['fins'], 'Tail fins ×4 · folding', '', [0, 0, -.8], .3, 'part', { side: 'L' }),
      E('06', ['booster'], 'Booster · solid', '1.66 m', [0, 0, -1.9], .38, 'part', { side: 'L' }),
      E('07', ['body'], 'Cruise stage · Ø 0.533 m', '', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  torpedo533: {
    model: 'torpedo533', title: 'Torpedo · 533 mm', size: '6.2 m · Ø 0.533 m',
    note: 'A heavyweight torpedo as it lies in a torpedo room, closed: homing head, body, shrouded propulsor.',
    view: { yaw: -1.3, pitch: .2 },
    parts: [
      E('01', ['nose'], 'Nose · homing head', '', [0, 0, .7], 0, 'part', { side: 'R' }),
      E('02', ['tail'], 'Afterbody · shrouded propulsor', '', [0, 0, -.7], .25, 'part', { side: 'L' }),
      E('03', ['body'], 'Torpedo · 533 mm', '6.2 m', [0, 0, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  vpt_can: {
    model: 'vpt_can', frame: 'canister', title: 'VPT cell canister', size: '6.35 m · Ø 0.6 m',
    view: { yaw: -1.3, pitch: .2 },
    parts: [E('01', ['canister'], 'Cell canister · Tomahawk · closed', '6.35 m', [0, 0, 0], 0, 'shell')],
    xray: [],
  },
  mk41_can: {
    model: 'mk41_can', frame: 'canister', title: 'Mk 41 canister', size: '6.7 m',
    view: { yaw: -1.3, pitch: .2 },
    parts: [E('01', ['canister'], 'Mk 41 canister · closed', '6.7 m', [0, 0, 0], 0, 'shell')],
    xray: [],
  },
};

/* the projectile names data/units.js uses read the same entries */
ANATOMY.tomahawk = ANATOMY.strike_missile; ANATOMY.sam57e6 = ANATOMY.pantsir_missile; ANATOMY.aim120 = ANATOMY.aam;
/* the amphibious units and the third wave: their entries live beside their models (models_lhd.js, models_amphib.js,
   models_units3.js) */
Object.assign(ANATOMY, LHD_ANATOMY, AMPHIB_ANATOMY, UNITS3_ANATOMY);

/* the transloader's TLC frames (parts tlcR / tlcL / tlcHook), as its model defines them */
function tlcXfOf(part, st) {
  st = st || {};
  if (part === 'tlcR') return T3(TRANSLOADER.SLOTS[0]);
  if (part === 'tlcL') return T3(TRANSLOADER.SLOTS[1]);
  const c = TRANSLOADER.crane(st);
  return X.mul(X.make(R.y(c.hookYaw), c.hook), T3([0, -TRANSLOADER.HOOK_DROP, -TLC_LEN / 2]));
}

/* ---------------------------------------------------------------- helpers */
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/* staged explode: e 0..1 global progress -> 0..1 for an entry leaving at w0 (w0 ∈ 0..1).
   Early w0 leave first; driving e back to 0 brings them home last (the reverse order). */
export function explodeK(w0, e) { return inOut(sat(((e * (.8 + .55)) - (w0 || 0) * .8) / .55)); }
export const ANATOMY_KEYS = Object.keys(ANATOMY);
export function entryOf(key, part) { const a = ANATOMY[key]; return a ? a.parts.find(en => en.parts.includes(part)) || null : null; }
/* model-space offset of a part at explode progress e */
export function partOffset(key, part, e) {
  const en = entryOf(key, part); if (!en || !e) return [0, 0, 0];
  const k = explodeK(en.w0, e); return [en.explode[0] * k, en.explode[1] * k, en.explode[2] * k];
}
/* flattened X-ray contents for a state: [{ id, label, model, st, parent, xf }] (xf before the parent's offset) */
export function xrayOf(key, st) {
  const a = ANATOMY[key], out = []; st = st || {};
  if (!a || !a.xray) return out;
  for (const x of a.xray) {
    if (x.when && !x.when(st)) continue;
    for (const T of x.inst(st)) out.push({ id: x.id, label: x.label, model: x.model, st: x.st, parent: x.parent, xf: T });
  }
  return out;
}
/* tag anchor in model space at state st (before the explode offset) */
export function anchorOf(model, en, st) {
  st = st || {};
  const parts = en.parts.map(n => model.parts.find(p => p.name === n)).filter(Boolean);
  if (!parts.length) return [0, 0, 0];
  if (en.anchor) { const p = parts[0]; return p.xf ? X.ap(p.xf(st), en.anchor) : en.anchor.slice(); }
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of parts) {
    const [a, b] = partBox(p, st); if (a[0] > b[0]) continue;
    const T = p.xf ? p.xf(st) : null;
    for (let i = 0; i < 8; i++) {
      const q = [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]], w = T ? X.ap(T, q) : q;
      for (let k = 0; k < 3; k++) { if (w[k] < mn[k]) mn[k] = w[k]; if (w[k] > mx[k]) mx[k] = w[k]; }
    }
  }
  return mn[0] > mx[0] ? [0, 0, 0] : [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
}
/* tight part-local bounds of the sampled surface (lathes and blades by their real radius; wire-only
   prims ignored) at state st */
function partBox(p, st) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const add = (q, e) => { for (let k = 0; k < 3; k++) { const w = e ? e[k] : 0; if (q[k] - w < mn[k]) mn[k] = q[k] - w; if (q[k] + w > mx[k]) mx[k] = q[k] + w; } };
  const ext = (d, r) => [r * Math.sqrt(Math.max(0, 1 - d[0] * d[0])), r * Math.sqrt(Math.max(0, 1 - d[1] * d[1])), r * Math.sqrt(Math.max(0, 1 - d[2] * d[2]))];
  for (const pr of window.GEO.primsOf(p, st)) {
    if (pr.pts === false) continue;
    if (pr.t === 'lathe') for (const [s0, r] of pr.st) add(V.mad(pr.a, pr.d, s0), ext(pr.d, r));
    else if (pr.t === 'blades') add(pr.c, ext(pr.d, pr.r1));
    else if (pr.p) for (const q of pr.p) add(q);
  }
  return [mn, mx];
}
/* model-space bounds of what is drawn at explode progress e (interior parts count once exploded) */
export function boundsOf(key, model, st, e) {
  st = st || {}; e = e || 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of model.parts) {
    if (p.inside ? !e : (p.show && !p.show(st))) continue;
    const [a, b] = partBox(p, st); if (a[0] > b[0]) continue;
    const T = p.xf ? p.xf(st) : null, off = e ? partOffset(key, p.name, e) : null;
    for (let i = 0; i < 8; i++) {
      let w = [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]];
      if (T) w = X.ap(T, w);
      if (off) w = V.add(w, off);
      for (let k = 0; k < 3; k++) { if (w[k] < mn[k]) mn[k] = w[k]; if (w[k] > mx[k]) mx[k] = w[k]; }
    }
  }
  return mn[0] > mx[0] ? [[-1, -1, -1], [1, 1, 1]] : [mn, mx];
}
/* camera fit for the Inspect view: target (bounds centre) and the distance at which the (exploded)
   model's bounds fill the frame from the suggested yaw / pitch (ANATOMY[key].view), leaving side room
   for the placard columns. fovY vertical field of view (rad), aspect W / H. */
export function fitView(key, model, st, e, fovY, aspect) {
  const [a, b] = boundsOf(key, model, st, e), v = (ANATOMY[key] && ANATOMY[key].view) || {};
  const yaw = v.yaw === undefined ? .75 : v.yaw, pitch = v.pitch === undefined ? .28 : v.pitch;
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const f = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
  const tv = Math.tan((fovY || 32 * Math.PI / 180) / 2) * .8, th = tv * (aspect || 16 / 9) * .62 / .8;
  let dist = 1e-3;
  for (let i = 0; i < 8; i++) {
    const d = V.sub([i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]], c);
    const x = Math.abs(V.dot(d, r)), y = Math.abs(V.dot(d, u)), z = V.dot(d, f);
    dist = Math.max(dist, x / th - z, y / tv - z);
  }
  return { tgt: c, dist, yaw, pitch, bounds: [a, b] };
}
/* every model part in exactly one entry; every entry part exists in the model */
export function validateAnatomy(key, model) {
  const a = ANATOMY[key], names = new Set(model.parts.map(p => p.name)), seen = new Map(), unknown = [], dup = [];
  if (!a) return { ok: false, missing: [...names], unknown, dup };
  for (const en of a.parts) for (const n of en.parts) { if (!names.has(n)) unknown.push(n); if (seen.has(n)) dup.push(n); seen.set(n, en); }
  const missing = [...names].filter(n => !seen.has(n));
  return { ok: !missing.length && !dup.length, missing, unknown, dup };
}
export default ANATOMY;
