/* Player settings, persisted in localStorage `oniks.settings`.

   import { getSettings, setSetting, onSettings, SETTINGS, KEYBINDS } from '../data/settings.js'

   getSettings()        -> a fresh object: defaults merged with what is stored
   getSetting(k)        -> one value
   setSetting(k, v)     -> stores (validated against SETTINGS), notifies listeners, returns the new object
   resetSettings()      -> back to defaults
   onSettings(fn)       -> fn(settings, key) on every change, also from other tabs; returns an unsubscribe
   DOT_DENSITY[s.dotDensity] -> dot-count multiplier for the renderer

   Keys (the shell's Settings screen edits all of them):
     renderScale   0.5 | 0.67 | 0.75 | 1        fraction of the device-pixel canvas size
     dotDensity    'low' | 'medium' | 'high' | 'ultra'
     effects       'low' | 'medium' | 'high'    particles, smoke, debris, dynamic lights
     showFps       bool
     volume        0..1 (steps of 0.1)          master volume (films, UI, game)
     uiSound       bool                          menu / HUD clicks
     edgePan       bool                          camera pans at the screen edges
     invertRotate  bool                          right-drag / Q E rotate the other way
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
  { key: 'renderScale', group: 'Graphics', label: 'Render scale', def: 1, choices: [[.5, '50%'], [.67, '67%'], [.75, '75%'], [1, '100%']] },
  { key: 'dotDensity', group: 'Graphics', label: 'Dot density', def: 'high', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { key: 'effects', group: 'Graphics', label: 'Effects', def: 'high', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'showFps', group: 'Graphics', label: 'Show FPS', def: false, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'volume', group: 'Sound', label: 'Master volume', def: .8, meter: true, choices: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1].map(v => [v, Math.round(v * 100) + '']) },
  { key: 'uiSound', group: 'Sound', label: 'UI sound', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'edgePan', group: 'Controls', label: 'Edge pan', def: true, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'invertRotate', group: 'Controls', label: 'Invert rotate', def: false, choices: [[false, 'Off'], [true, 'On']] },
  { key: 'timeRate', group: 'Controls', label: 'Start time rate', def: 4, choices: [1, 2, 4, 8, 16, 32].map(v => [v, 'x' + v]) },
  { key: 'menuFilm', group: 'Menu', label: 'Menu film', def: 'random', cycle: true, choices: MENU_FILMS },
];

export const DEFAULTS = Object.fromEntries(SETTINGS.map(s => [s.key, s.def]));

/* Keybinds reference (shown in Settings; the HUD can show the same list). */
export const KEYBINDS = [
  { group: 'Camera', binds: [
    ['W A S D', 'Pan'], ['Edges', 'Pan'], ['Middle drag', 'Pan'],
    ['Right drag', 'Rotate 360°'], ['Q E', 'Rotate'], ['PgUp PgDn', 'Pitch'], ['Wheel', 'Zoom'], ['F', 'Follow'] ] },
  { group: 'Select', binds: [
    ['Click', 'Select'], ['Shift click', 'Add / remove'], ['Drag', 'Box select'], ['Double click', 'All of a type'],
    ['Ctrl / Alt 1-9', 'Set group'], ['1-9', 'Recall group'], ['Tab', 'Next unit'] ] },
  { group: 'Orders', binds: [
    ['Right click', 'Move / attack / reload'], ['Shift', 'Queue'], ['Z', 'Stop'], ['H', 'Hold'], ['T', 'Deploy'],
    ['R', 'Reload'], ['X', 'Scan'], ['Y', 'Radar on / off'], ['L', 'Launch drone'], ['B', 'Reinforce'],
    ['I', 'Inspect'], ['E', 'Exploded view'] ] },
  { group: 'Time and view', binds: [
    ['Space', 'Pause'], ['+ −', 'Time rate'], ['C', 'Cinematic camera'], ['V', 'Radar view'], ['F10', 'Hide UI'],
    ['Esc', 'Menu'] ] },
  { group: 'Sandbox', binds: [
    ['P', 'Spawn palette'], ['1-7 ⇧1-4', 'Pick a unit'], ['Del', 'Delete'], ['G', 'Fog'], ['K', 'Enemy AI'],
    ['J', 'Switch side'], ['N', 'Weather'] ] },
];

const spec = k => SETTINGS.find(s => s.key === k);
const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;
function valid(k, v) {
  const s = spec(k);
  if (!s) return false;
  return s.choices.some(c => same(c[0], v));
}

function read() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
  catch (e) { return {}; }
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
