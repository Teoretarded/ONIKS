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
     renderStyle   'pointcloud' | 'orbital'     the look: Point Cloud (graphite, white dots) or Orbital (black, hairlines)
     renderScale * 0.5 | 0.67 | 0.75 | 1        fraction of the device-pixel canvas size
     dotDensity  * 'low' | 'medium' | 'high' | 'ultra'
     effects     * 'low' | 'medium' | 'high'    smoke, debris and spark dots, dynamic lights, landmark detail
                                                 (fx/index.js FX_LEVELS, game/landmarks.js DETAIL; read live)
     showFps     * bool
     volume      * 0..1 (steps of 0.1)          master volume (films, UI, game)
     uiSound       bool                          menu / HUD clicks
     edgePan     * bool                          camera pans at the screen edges
     invertRotate  bool                          right-drag / Q E rotate the other way
     autoSlow    * bool                          drop to x1 on a launch or a new contact (game.autoSlow; was 'oniks.autoSlow')
     hitReplay   * bool                          a decisive hit replays in slow motion (game/replay.js; Shift+J too)
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

/* The settings table: order, grouping, labels and allowed values. */
export const SETTINGS = [
  { key: 'renderStyle', group: 'Graphics', label: 'Render style', def: 'pointcloud', choices: [['pointcloud', 'Point Cloud'], ['orbital', 'Orbital']] },
  { key: 'renderScale', group: 'Graphics', label: 'Render scale', def: 1, choices: [[.5, '50%'], [.67, '67%'], [.75, '75%'], [1, '100%']] },
  { key: 'dotDensity', group: 'Graphics', label: 'Dot density', def: 'high', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { key: 'effects', group: 'Graphics', label: 'Effects', def: 'high', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'showFps', group: 'Graphics', label: 'Show FPS', def: false, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'volume', group: 'Sound', label: 'Master volume', def: .8, meter: true, choices: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1].map(v => [v, Math.round(v * 100) + '']) },
  { key: 'uiSound', group: 'Sound', label: 'UI sound', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'edgePan', group: 'Controls', label: 'Edge pan', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'invertRotate', group: 'Controls', label: 'Invert rotate', def: false, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'autoSlow', group: 'Controls', label: 'Auto ×1', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'hitReplay', group: 'Controls', label: 'Hit replay', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'timeRate', group: 'Controls', label: 'Start time rate', def: 4, choices: [1, 2, 4, 8, 16, 32].map(v => [v, 'x' + v]) },
  { key: 'menuFilm', group: 'Menu', label: 'Menu film', def: 'random', cycle: true, choices: MENU_FILMS },
];

/* One true line per setting, for the value it has (the Settings screen and the in-game panel show it). */
export const NOTES = {
  renderStyle: v => v === 'orbital' ? 'Black, white hairline wireframe, one yellow. The Orbital films.' : 'Graphite, white LiDAR dots, lime and coral. The Point Cloud films.',
  renderScale: v => v < 1 ? `Draws at ${Math.round(v * 100)}% of the screen's pixels and scales up. Faster.` : 'Draws at the full resolution of the screen.',
  dotDensity: v => ({ low: 'Fewer dots per model and per square of ground. Fastest.', medium: 'A lighter cloud.', high: 'The films\' density.', ultra: 'Denser than the films. Needs a strong GPU.' }[v]),
  effects: v => ({ low: 'Sparse smoke and debris; only the strongest flashes light the world. Fastest.', medium: 'Lighter smoke and debris, fewer dynamic lights.', high: 'Smoke, debris, sparks and dynamic light, as in the films.' }[v]),
  showFps: v => v ? 'Frame rate and frame time on screen.' : 'No frame counter.',
  volume: v => `Master volume ${Math.round(v * 100)}%. Films, interface and battle.`,
  uiSound: v => v ? 'Clicks and blips on the menus and the HUD.' : 'Silent menus and HUD.',
  edgePan: v => v ? 'The camera pans when the pointer touches a screen edge.' : 'Pan with W A S D or the middle button only.',
  invertRotate: v => v ? 'Right-drag and Q E turn the camera the other way.' : 'Right-drag and Q E turn the camera as the pointer moves.',
  autoSlow: v => v ? 'A launch or a new contact drops time to x1, so it is watched at real speed.' : 'Time stays at the rate you set.',
  hitReplay: v => v ? 'A decisive hit plays again in slow motion, the X-ray sweeping the hull. J replays the last one.' : 'No automatic replays. J still replays the last decisive hit.',
  timeRate: v => `Matches start at x${v}.`,
  menuFilm: v => v === 'random' ? 'A different favourite film behind the menu each time.' : 'This film plays behind the menu.',
};

export const DEFAULTS = Object.fromEntries(SETTINGS.map(s => [s.key, s.def]));

/* Keybinds reference: the real bindings of the game's systems (camera.js, select.js, orders.js, time.js, director.js,
   sensors, inspect, sandbox.js, match.js). Shown by the Settings screen and the in-game help (F1).
   [key, what, { side: 'coast' | 'fleet', mode: 'sandbox', ctx }?]: the help shows a row only for that side / mode.
   ctx: where the key does this (a key is bound once per context; tools/validate.mjs checks it): 'play' (the default:
   the battle view), 'selection' (while units are selected; it comes before 'play'), 'inspect' (in the Inspect view),
   'film' (the film panel open, F9), 'palette' (the sandbox spawn palette open, P). */
export const KEYBINDS = [
  { group: 'Camera', binds: [
    ['W A S D', 'Pan · Shift faster'], ['Edges', 'Pan'], ['Middle drag', 'Pan'], ['Right drag', 'Rotate 360° · pitch'],
    ['Q E', 'Rotate'], ['PgUp PgDn', 'Pitch'], ['Wheel', 'Zoom to the pointer'], ['F', 'Follow · again: stop'] ] },
  { group: 'Select', binds: [
    ['Click', 'Select'], ['Shift click', 'Add / remove'], ['Drag', 'Box select'], ['Double click', 'All of that type'],
    ['Ctrl 1-9', 'Set group · Alt 1-9 too'], ['1-9', 'Recall group · twice: fly'], ['Tab', 'Next unit'], ['Esc', 'Clear selection', { ctx: 'selection' }] ] },
  { group: 'Orders', binds: [
    ['Right click', 'Move · attack a track'], ['Shift', 'Queue the order'], ['Z', 'Stop'], ['H', 'Weapons free / hold'],
    ['~', 'Salvo 1 / 2 / all · Shift: back'],
    ['T', 'Deploy / undeploy', { side: 'coast' }], ['R', 'Reload'], ['X', 'Scan, then click'], ['Y', 'Radar on / off'],
    ['L', 'Launch Orlan-10', { side: 'coast' }], ['L', 'Launch strike package', { side: 'fleet' }], ['U', 'Launch MH-60R', { side: 'fleet' }],
    ['O', 'Boats: dive / come up · Shift: surface'], ['B', 'Reinforcements'] ] },
  { group: 'Inspect', binds: [
    ['I', 'Inspect the selection'], ['Alt click', 'Inspect a unit or round'], ['E', 'Exploded view', { ctx: 'inspect' }],
    ['X', 'X-ray on / off', { ctx: 'inspect' }], ['H', 'Hide the tags', { ctx: 'inspect' }], ['Esc', 'Leave', { ctx: 'inspect' }],
    ['Shift I', 'Anatomy browser', { mode: 'sandbox' }] ] },
  { group: 'View and time', binds: [
    ['C', 'Cinematic camera'], ['J', 'Replay the last hit'], ['Shift J', 'Hit replay on / off'], ['V', 'Radar view'],
    ['F10', 'Hide the interface'], ['F1', 'Help'], ['Space', 'Pause'], ['+ −', 'Time rate'], ['Esc', 'Menu'] ] },
  { group: 'Film maker', binds: [
    ['F9', 'Film panel'], ['K', 'Key at this view', { ctx: 'film' }], ['Shift K', 'Key that follows', { ctx: 'film' }], ['Shift F9', 'Play the take'],
    ['F8', 'Still · Shift: sequence'] ] },
  { group: 'Sandbox', mode: 'sandbox', binds: [
    ['P', 'Spawn palette'], ['1-9 ⇧1-9', 'Pick a unit to place', { ctx: 'palette' }], ['Del', 'Delete selected'], ['G', 'Fog'], ['K', 'Enemy AI'],
    ['M', 'Switch side'], ['N', 'Weather'] ] },
];

const spec = k => SETTINGS.find(s => s.key === k);
const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;
function valid(k, v) {
  const s = spec(k);
  if (!s) return false;
  return s.choices.some(c => same(c[0], v));
}

function read() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY) || '{}'); if (!o || typeof o !== 'object') o = {}; } catch (e) { o = {}; }
  // auto x1 used to live on its own key (game.js still writes it): an old Off carries over
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
