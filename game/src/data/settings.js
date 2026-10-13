/* Player settings, persisted in localStorage `oniks.settings`.

   import { getSettings, setSetting, onSettings, SETTINGS, KEYBINDS } from '../data/settings.js'

   getSettings()        -> a fresh object: defaults merged with what is stored
   getSetting(k)        -> one value
   setSetting(k, v)     -> stores (validated against SETTINGS), notifies listeners, returns the new object
   resetSettings()      -> back to defaults
   onSettings(fn)       -> fn(settings, key) on every change, also from other tabs; returns an unsubscribe
   DOT_DENSITY[s.dotDensity] -> dot-count multiplier for the renderer

   Keys (the shell's Settings screen edits all of them; the in-game panel (ui/help, pause menu > Settings) the ones
   marked *, applied live):
     renderStyle * 'pointcloud' | 'orbital'     the look: Point Cloud (graphite, white dots) or Orbital (black, hairlines)
     renderScale * 0.5 | 0.67 | 0.75 | 1        fraction of the device-pixel canvas size
     dotDensity  * 'low' | 'medium' | 'high' | 'ultra'
     effects     * 'low' | 'medium' | 'high'    smoke, debris and spark dots, dynamic lights, landmark detail
                                                 (fx/index.js FX_LEVELS, game/landmarks.js DETAIL; read live)
     autoQuality * bool                          hold 60 fps: effects, dot density, then render scale step down under load
                                                 and back up with headroom (game/perfguard.js; the FPS readout shows it)
     showFps     * bool
     envTone     * 'muted' | 'classic'           the world's returns: muted (sea blue-grey, land warm grey, both dimmer, so the
                                                 units' white stands out) or classic (the films' all-white world); engine/terrain.js ENV_TONES
     radarSweep  * bool                          own radars paint their sweep on the world (Shift V; ui/sensors/radar.js)
     volume      * 0..1 (steps of 0.1)          master volume (films, UI, game)
     uiSound       bool                          menu / HUD clicks
     edgePan     * bool                          camera pans at the screen edges
     invertRotate  bool                          right-drag / Q E rotate the other way
     autoSlow    * bool                          drop to x1 on a launch or a new contact (game.autoSlow; was 'oniks.autoSlow')
     hitReplay   * bool                          the kill cam: a decisive hit replays in slow motion (game/replay.js; Shift+J too)
     killCam*    *                               the kill cam: what it plays on, its angle, the defence in the frame, its rate,
                                                 the X-ray, rounds shot down (debris/slowmo.js), the gap between kill cams
     cine*       *                               the cinematic camera (C, game/director.js): its mode or a mix of modes, slow
                                                 motion, shot length, cuts, lens, the hand on the camera, quiet time, captions
   The Camera tab holds the cine* and kill cam rows (TABS, a row's `tab`).
     timeRate      1 | 2 | 4 | 8 | 16 | 32       time rate a match starts at
     menuFilm      'random' | film id           the film behind the main menu */

const KEY = 'oniks.settings';

export const DOT_DENSITY = { low: .4, medium: .7, high: 1, ultra: 1.45 };

/* Film ids the menu may pin: the user's favourites only. */
export const MENU_FILMS = [
  ['random', 'Random'],
  ['pc_anatomy', 'Anatomy'],
  ['pc_anatomy_ship', 'Anatomy · Ship'],
  ['pc_anatomy_battery', 'Anatomy · Battery'],
  ['pd_engagement', 'Engagement'],
  ['pe_aegis', 'Aegis'],
  ['oa_scale', 'Scale'],
  ['oa_strike', 'Scale · Strike'],
  ['oe_ring', 'Ring'],
  ['od_salvo', 'Salvo'],
];

/* The cinematic camera's modes (game/director/modes.js): five of their own, two that combine them. */
export const CINE_MODES = [
  ['director', 'Director'], ['chase', 'Chase'], ['tripod', 'Tripod'], ['showcase', 'Showcase'], ['overview', 'Overview'],
  ['story', 'Storyteller'], ['duel', 'Duel'],
];

/* The settings table: order, grouping, labels and allowed values (multi: a comma list of any of the choices). */
export const SETTINGS = [
  { key: 'renderStyle', group: 'Graphics', label: 'Render style', def: 'pointcloud', choices: [['pointcloud', 'Point Cloud'], ['orbital', 'Orbital']] },
  { key: 'renderScale', group: 'Graphics', label: 'Render scale', def: 1, choices: [[.5, '50%'], [.67, '67%'], [.75, '75%'], [1, '100%']] },
  { key: 'dotDensity', group: 'Graphics', label: 'Dot density', def: 'high', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { key: 'effects', group: 'Graphics', label: 'Effects', def: 'high', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'autoQuality', group: 'Graphics', label: 'Auto quality', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'showFps', group: 'Graphics', label: 'Show FPS', def: false, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'envTone', group: 'Graphics', label: 'Environment tone', def: 'muted', choices: [['muted', 'Muted'], ['classic', 'Classic']] },
  { key: 'radarSweep', group: 'Graphics', label: 'Radar sweeps', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'volume', group: 'Sound', label: 'Master volume', def: .8, meter: true, choices: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1].map(v => [v, Math.round(v * 100) + '']) },
  { key: 'uiSound', group: 'Sound', label: 'UI sound', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'edgePan', group: 'Controls', label: 'Edge pan', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'invertRotate', group: 'Controls', label: 'Invert rotate', def: false, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'autoSlow', group: 'Controls', label: 'Auto ×1', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'timeRate', group: 'Controls', label: 'Start time rate', def: 1, choices: [1, 2, 4, 8, 16, 32].map(v => [v, 'x' + v]) },
  { key: 'menuFilm', group: 'Menu', label: 'Menu film', def: 'random', cycle: true, choices: MENU_FILMS },
  // the Camera tab: the cinematic camera (C; game/director.js) and the kill cam (game/replay.js, game/debris/slowmo.js)
  { key: 'cineMode', tab: 'camera', group: 'Cinematic camera', label: 'Mode', def: 'director', cycle: true, choices: CINE_MODES.concat([['mix', 'Mix']]) },
  { key: 'cineMix', tab: 'camera', group: 'Cinematic camera', label: 'In the mix', def: 'director,tripod,story,duel', multi: true, choices: CINE_MODES },
  { key: 'cineMixEvery', tab: 'camera', group: 'Cinematic camera', label: 'Mix changes', def: 90, choices: [[45, '45 s'], [90, '90 s'], [180, '3 min'], [300, '5 min']] },
  { key: 'cineSlow', tab: 'camera', group: 'Cinematic camera', label: 'Slow motion', def: 'normal', choices: [['off', 'Off'], ['light', 'x0.5'], ['normal', 'x0.25'], ['strong', 'x0.1']] },
  { key: 'cinePace', tab: 'camera', group: 'Cinematic camera', label: 'Shot length', def: 'normal', choices: [['quick', 'Quick'], ['normal', 'Normal'], ['long', 'Long']] },
  { key: 'cineCuts', tab: 'camera', group: 'Cinematic camera', label: 'Long moves', def: 'cut', choices: [['cut', 'Cut'], ['dip', 'Dip'], ['glide', 'Fly']] },
  { key: 'cineLens', tab: 'camera', group: 'Cinematic camera', label: 'Lens', def: 'normal', choices: [['wide', 'Wide'], ['normal', 'Normal'], ['long', 'Long']] },
  { key: 'cineShake', tab: 'camera', group: 'Cinematic camera', label: 'Hand on the camera', def: 'subtle', choices: [['off', 'Off'], ['subtle', 'Subtle'], ['handheld', 'Handheld']] },
  { key: 'cineQuiet', tab: 'camera', group: 'Cinematic camera', label: 'When it is quiet', def: 'rollby', choices: [['rollby', 'Rollbys'], ['overview', 'Overview'], ['orbit', 'Orbit']] },
  { key: 'cineSides', tab: 'camera', group: 'Cinematic camera', label: 'Whose rounds', def: 'both', choices: [['both', 'Both'], ['own', 'Own'], ['enemy', 'Enemy']] },
  { key: 'cineTitles', tab: 'camera', group: 'Cinematic camera', label: 'Captions', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'hitReplay', tab: 'camera', group: 'Kill cam', label: 'Kill cam', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'killCamWhen', tab: 'camera', group: 'Kill cam', label: 'Plays on', def: 'heavy', choices: [['kills', 'Kills'], ['heavy', 'Heavy hits'], ['all', 'Every hit']] },
  { key: 'killCamAngle', tab: 'camera', group: 'Kill cam', label: 'Angle', def: 'auto', choices: [['auto', 'Auto'], ['across', 'Across'], ['round', 'Round'], ['defence', 'Defence']] },
  { key: 'killCamDefence', tab: 'camera', group: 'Kill cam', label: 'Show the defence', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'killCamSlow', tab: 'camera', group: 'Kill cam', label: 'Slow motion', def: .25, choices: [[.1, 'x0.1'], [.25, 'x0.25'], [.5, 'x0.5']] },
  { key: 'killCamXray', tab: 'camera', group: 'Kill cam', label: 'X-ray sweep', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'killCamIntercept', tab: 'camera', group: 'Kill cam', label: 'Rounds shot down', def: 'slow', choices: [['off', 'Off'], ['slow', 'Slow motion'], ['camera', 'Camera']] },
  { key: 'killCamCool', tab: 'camera', group: 'Kill cam', label: 'Between kill cams', def: 'normal', choices: [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']] },
];

/* The tabs of the Settings screen and the in-game panel; a row's tab ('general' unless set). */
export const TABS = [['general', 'General'], ['camera', 'Camera']];
export const tabOf = d => d.tab || 'general';

/* One true line per setting, for the value it has (the Settings screen and the in-game panel show it). */
export const NOTES = {
  renderStyle: v => v === 'orbital' ? 'Black, white hairline wireframe, one yellow. The Orbital films.' : 'Graphite, white LiDAR dots, lime and coral. The Point Cloud films.',
  renderScale: v => v < 1 ? `Draws at ${Math.round(v * 100)}% of the screen's pixels and scales up. Faster.` : 'Draws at the full resolution of the screen.',
  dotDensity: v => ({ low: 'Fewer dots per model and per square of ground. Fastest.', medium: 'A lighter cloud.', high: 'The films\' density.', ultra: 'Denser than the films. Needs a strong GPU.' }[v]),
  effects: v => ({ low: 'Sparse smoke and debris; only the strongest flashes light the world. Fastest.', medium: 'Lighter smoke and debris, fewer dynamic lights.', high: 'Smoke, debris, sparks and dynamic light, as in the films.' }[v]),
  autoQuality: v => v ? 'Holds 60 fps: under load effects, then dots, then render scale step down, and come back.' : 'Quality stays as set, whatever the frame rate.',
  showFps: v => v ? 'Frame rate and frame time on screen.' : 'No frame counter.',
  envTone: v => v === 'classic' ? 'Sea and land in the films\' white, as bright as the units.' : 'Sea a dim blue-grey, land a dim warm grey: white is left to the units and the rounds.',
  radarSweep: v => v ? 'Own radars paint their sweep on the sea and the land. Shift V hides it.' : 'No sweep painted on the world; the radars still work. Shift V shows it.',
  volume: v => `Master volume ${Math.round(v * 100)}%. Films, interface and battle.`,
  uiSound: v => v ? 'Clicks and blips on the menus and the HUD.' : 'Silent menus and HUD.',
  edgePan: v => v ? 'The camera pans when the pointer touches a screen edge.' : 'Pan with W A S D or the middle button only.',
  invertRotate: v => v ? 'Right-drag and Q E turn the camera the other way.' : 'Right-drag and Q E turn the camera as the pointer moves.',
  autoSlow: v => v ? 'A launch or a new contact drops time to x1, so it is watched at real speed.' : 'Time stays at the rate you set.',
  hitReplay: v => v ? 'A decisive hit plays again in slow motion. J replays the last one; Shift J turns the kill cam on and off.' : 'No automatic kill cam. J still replays the last decisive hit.',
  cineMode: v => ({
    director: 'Goes to what is about to happen: launches, intercepts, gun bursts, impacts, and what they leave.',
    chase: 'Rides one round from the rail to its end, then the next. The engagement seen from the round.',
    tripod: 'Fixed cameras near the action, long lenses panning and zooming after the rounds, like test-range footage.',
    showcase: 'Slow rollbys of ships, vehicles, aircraft and rounds in flight: dolly, crane, orbit, flyby.',
    overview: 'High and wide: the whole engagement in one frame, every round, its target and the defence.',
    story: 'Director, Showcase and Overview in beats: the launch, the wide, the flyby, the moment, the aftermath.',
    duel: "Chase and Tripod: rides a round in, then over the defender's shoulder as it fires, held through the kill.",
    mix: 'Changes between the modes picked under In the mix, at a quiet moment. Shift C: the next mode.',
  }[v]),
  cineMix: v => v ? `Mix: ${v.split(',').map(k => (CINE_MODES.find(m => m[0] === k) || [k, k])[1]).join(', ')}. Used when the mode is Mix.` : 'None picked: the Mix plays the Director.',
  cineMixEvery: v => `The Mix moves to its next mode after about ${v < 60 ? v + ' s' : v / 60 + ' min'}, between moments.`,
  cineSlow: v => ({ off: 'The cinematic never changes the time rate.', light: 'Time eases to x0.5 for each intercept, gun burst and impact.', normal: 'Time eases to x0.25 for each intercept, gun burst and impact.', strong: 'Time eases to x0.1 for each intercept, gun burst and impact.' }[v]),
  cinePace: v => ({ quick: 'Shorter shots, more changes.', normal: 'Shots held as long as they read.', long: 'Long takes: a shot stays until its moment is over.' }[v]),
  cineLens: v => ({ wide: 'A wider lens: more of the scene round the subject.', normal: 'The lens each shot was framed for.', long: 'A longer lens: tighter and flatter, the subject larger.' }[v]),
  cineCuts: v => ({ cut: 'A move of more than about a kilometre is a cut; shorter ones glide.', dip: 'A long move dips to dark and back.', glide: 'Every move flies, however far: no cuts.' }[v]),
  cineShake: v => ({ off: 'A locked-off camera.', subtle: 'A slow sub-degree drift: a hand on the camera.', handheld: 'A handheld feel, stronger on the close shots.' }[v]),
  cineQuiet: v => ({ rollby: 'Nothing happening: rollbys of the forces.', overview: 'Nothing happening: a slow wide of both forces.', orbit: 'Nothing happening: a slow orbit of the most important unit.' }[v]),
  cineSides: v => ({ both: "Both sides' rounds are followed.", own: 'Only your own rounds are followed.', enemy: 'Only the rounds fired at you, and your defence.' }[v]),
  cineTitles: v => v ? 'A caption names the subject, its speed and its target, as in the films.' : 'No captions.',
  killCamWhen: v => ({ kills: 'Only a blow that destroys a ship or a major unit.', heavy: 'A heavy round (Oniks, Kalibr, Tomahawk, SLAM-ER, Kh-35) hitting a ship or a major unit.', all: 'Every missile hitting a ship or a major unit.' }[v]),
  killCamAngle: v => ({ auto: 'Across the target; from behind its defence while the round is engaged.', across: 'Across the target, low, the round coming in through the open side.', round: 'From behind the incoming round, the target ahead.', defence: "From behind the target's defence, looking out at the round coming in." }[v]),
  killCamDefence: v => v ? 'Guns and interceptors firing at the round stay in the frame; a round shot down is followed to its pieces.' : 'Framed on the target alone.',
  killCamSlow: v => `The kill cam runs at x${v}.`,
  killCamXray: v => v ? 'The lime X-ray sweeps the hull and names the parts that broke.' : 'No X-ray: the hit as it is.',
  killCamIntercept: v => ({ off: 'A round shot down nearby changes nothing.', slow: 'A round shot down near the camera slows time while it comes apart.', camera: 'A round shot down near the camera slows time and the camera turns to the pieces, then gives the view back.' }[v]),
  killCamCool: v => ({ short: 'Kill cams can follow each other closely.', normal: 'A pause between kill cams (a kill waits less).', long: 'Kill cams are rare: only the big moments.' }[v]),
  timeRate: v => `Matches start at x${v}.`,
  menuFilm: v => v === 'random' ? 'A different favourite film behind the menu each time.' : 'This film plays behind the menu.',
};

export const DEFAULTS = Object.fromEntries(SETTINGS.map(s => [s.key, s.def]));

/* Keybinds reference: the real bindings of the game's systems (camera.js, select.js, orders.js, time.js, director.js,
   sensors, inspect, sandbox.js, match.js). Shown by the Settings screen and the in-game help (F1).
   [key, what, { side: 'coast' | 'fleet', mode: 'sandbox', ctx }?]: the help shows a row only for that side / mode.
   ctx: where the key does this (a key is bound once per context; tools/validate.mjs checks it): 'play' (the default:
   the battle view), 'selection' (while units are selected; it comes before 'play'), 'inspect' (in the Inspect view),
   'film' (the film panel open, F9), 'palette' (the sandbox spawn palette open, P), 'rounds' (rounds in flight
   selected: a click on one, or a box round some). */
export const KEYBINDS = [
  { group: 'Camera', binds: [
    ['W A S D', 'Pan · Shift faster'], ['Edges', 'Pan'], ['Middle drag', 'Pan'], ['Right drag', 'Rotate 360° · pitch'],
    ['Q E', 'Rotate'], ['PgUp PgDn', 'Pitch'], ['Wheel', 'Zoom to the pointer'], ['= −', 'Zoom · numpad + − too'], ['F', 'Follow · again: stop'],
    ['Double click', 'Spectate · Esc leaves'] ] },
  { group: 'Select', binds: [
    ['Click', 'Select a unit or round'], ['Shift click', 'Add / remove'], ['Drag', 'Box select · or rounds'], ['Ctrl Double click', 'All of that type'],
    ['Ctrl 1-9', 'Set group · Alt 1-9 too'], ['1-9', 'Recall group · twice: fly'], ['Tab', 'Next unit'], ['Esc', 'Clear selection', { ctx: 'selection' }] ] },
  { group: 'Orders', binds: [
    ['Right click', 'Move · attack a track'], ['Shift', 'Queue the order'], ['Z', 'Stop'], ['H', 'Weapons free / hold'],
    ['~', 'Salvo fire · again: size'], ['G', 'Launch at a point · 1-9 rounds, click the map'],
    ['T', 'Deploy / undeploy', { side: 'coast' }], ['R', 'Reload'], ['X', 'Scan, then click'], ['Y', 'Radar on / off'],
    ['L', 'Launch Orlan-10', { side: 'coast' }], ['L', 'Launch strike package', { side: 'fleet' }], ['U', 'Launch MH-60R', { side: 'fleet' }],
    ['O', 'Boats: dive / come up · Shift: surface'], ['B', 'Reinforcements'] ] },
  { group: 'Inspect', binds: [
    ['I', 'Inspect the selection'], ['Alt click', 'Inspect a unit or round'], ['E', 'Exploded view', { ctx: 'inspect' }],
    ['X', 'X-ray on / off', { ctx: 'inspect' }], ['H', 'Hide the tags', { ctx: 'inspect' }], ['Esc', 'Leave', { ctx: 'inspect' }],
    ['Shift I', 'Anatomy browser', { mode: 'sandbox' }],
    ['B', 'Impact test on / off', { ctx: 'inspect', mode: 'sandbox' }], ['Click', 'Impact: strike there', { ctx: 'inspect', mode: 'sandbox' }],
    ['F', 'Impact: strike at the aim', { ctx: 'inspect', mode: 'sandbox' }], ['R', 'Impact: repeat the last strike', { ctx: 'inspect', mode: 'sandbox' }],
    ['↑ ↓', 'Impact: the round', { ctx: 'inspect', mode: 'sandbox' }], ['A', 'Impact: aim · click, random, waterline, deck', { ctx: 'inspect', mode: 'sandbox' }],
    ['V', 'Impact: from the camera / the dial', { ctx: 'inspect', mode: 'sandbox' }], ['← → PgUp PgDn', 'Impact: dial bearing · elevation', { ctx: 'inspect', mode: 'sandbox' }],
    ['Z', 'Impact: time ×1 ×0.25 ×0.1', { ctx: 'inspect', mode: 'sandbox' }], ['D', 'Impact: sim damage on / off', { ctx: 'inspect', mode: 'sandbox' }],
    ['C', 'Impact: reset the damage', { ctx: 'inspect', mode: 'sandbox' }] ] },
  { group: 'View and time', binds: [
    ['C', 'Cinematic camera'], ['Shift C', 'Cinematic: next mode'], ['C', 'Cinematic on rounds', { ctx: 'rounds' }],
    ['B', 'Bullet time on rounds', { ctx: 'rounds' }], ['Esc', 'Drop the rounds', { ctx: 'rounds' }], ['J', 'Replay the last hit'], ['Shift J', 'Kill cam on / off'], ['V', 'Radar view'], ['Shift V', 'Radar sweeps on / off'],
    ['F10', 'Hide the interface'], ['F1', 'Help'], ['Space', 'Pause'], ['[ ]', 'Time rate ×0.1 … ×32'], ['Esc', 'Menu'] ] },
  { group: 'Film maker', binds: [
    ['F9', 'Film panel'], ['K', 'Key at this view', { ctx: 'film' }], ['Shift K', 'Key that follows', { ctx: 'film' }], ['Shift F9', 'Play the take'],
    ['F8', 'Still · Shift: sequence'] ] },
  { group: 'Sandbox', mode: 'sandbox', binds: [
    ['P', 'Spawn palette'], ['1-9 ⇧1-9', 'Pick a unit to place', { ctx: 'palette' }], ['Del', 'Delete selected'], ['Shift G', 'Fog'], ['K', 'Enemy AI'],
    ['M', 'Switch side'], ['N', 'Weather'], ['F2', 'Map builder · time stops'],
    ['Wheel R', 'Builder: turn · drag moves · Del removes', { ctx: 'palette' }] ] },
];

const spec = k => SETTINGS.find(s => s.key === k);
const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;
function valid(k, v) {
  const s = spec(k);
  if (!s) return false;
  if (s.multi) return typeof v === 'string' && (v === '' || v.split(',').every(x => s.choices.some(c => c[0] === x)));
  return s.choices.some(c => same(c[0], v));
}

function read() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!o || typeof o !== 'object') o = {}; } catch (e) { o = {}; }
  // auto x1 used to live on its own key: an old Off carries over
  if (!('autoSlow' in o)) { try { if (localStorage.getItem('oniks.autoSlow') === '0') o.autoSlow = false; } catch (e) { /* */ } }
  return o;
}
function write(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode: settings live for this page only */ }
}

let mem = null;               // in-page copy (also covers storage being unavailable)
const listeners = new Set();

export function getSettings() {
  if (!mem) mem = read();
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k in mem && valid(k, mem[k])) out[k] = mem[k];
  return out;
}
export function getSetting(k) { return getSettings()[k]; }

export function setSetting(k, v) {
  if (!valid(k, v)) { console.warn('settings: rejected', k, v); return getSettings(); }
  if (!mem) mem = read();
  mem = { ...read(), ...mem, [k]: v };
  write(mem);
  const s = getSettings();
  for (const fn of listeners) { try { fn(s, k); } catch (e) { console.error(e); } }
  return s;
}

export function resetSettings() {
  mem = {}; write(mem);
  try { localStorage.removeItem('oniks.autoSlow'); } catch (e) { /* */ }
  const s = getSettings();
  for (const fn of listeners) { try { fn(s, null); } catch (e) { console.error(e); } }
  return s;
}

export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }

addEventListener('storage', e => {
  if (e.key !== KEY) return;
  mem = read();
  const s = getSettings();
  for (const fn of listeners) { try { fn(s, null); } catch (err) { console.error(err); } }
});
