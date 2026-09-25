/* Campaign: six escalating battles on the Coast side. Each opens with one of the reference films as its
   cutscene (the story), then a briefing, then play.html?mode=campaign&mission=<n> (n is 1-based).

   import { MISSIONS, getMission, getProgress, isUnlocked, recordResult, takeLastResult } from '../data/campaign.js'

   Mission = {
     n, id, title,
     film: { id, from, to },            // reference film and the stretch of it (film seconds) that plays
     map, side, time, weather,          // map id (world/maps.js), 'coast', 'night'|'dusk'|'day', 'calm'|'haze'|'rain'|'storm'
     ai,                                // enemy strength: 'easy' | 'normal' | 'hard'
     brief: [..],                       // terse briefing lines, true to the mission
     objectives: [Objective],           // declarative; the match checks them
     forces: { coast: [[type, n]], fleet: [[type, n]] },   // starting units per side (unit types, data/units.js)
     waves?: [{ t, side, units: [[type, n]] }],            // reinforcements that arrive at sim time t (s)
     carry: bool,                       // TEL rounds left over from the previous mission carry into this one
   }
   Objective = { kind, text, hint?, optional?, ... } with kind one of
     'deploy'  { type }                 deploy a unit of this type
     'radar'   { type }                 switch a radar of this type on
     'scan'    { count }                identify `count` contacts with SCAN
     'inspect' {}                       open Inspect on any unit
     'launch'  { count }                fire `count` rounds
     'reload'  {}                       complete a TEL reload
     'destroy' { type, count, within? } destroy `count` enemy units of `type` (within `within` s, if set)
     'survive' { seconds }              last this long
     'hold'    { objective, seconds }   hold a map objective (by kind or id) this long
     'protect' { type }                 lose no unit of this type (fails when one is destroyed)
     'lose'    { type, max }            lose at most `max` units of this type

   Progress lives in localStorage `oniks.campaign`:
     { grades: { <n>: 'S'|'A'|'B'|'C'|'D' }, passed: [n...], best: { <n>: stats }, carry: { ammo } }
   play.html writes the outcome of a match to localStorage `oniks.lastResult`:
     { mode: 'campaign'|'combat'|'sandbox', mission?: n, win: bool, grade?: 'S'..'D', stats?: {...} }
   and returns to index.html#campaign (or #combat); the shell folds it into progress (takeLastResult). */

export const MISSIONS = [
  {
    n: 1, id: 'inside', title: 'Inside',
    film: { id: 'pc_anatomy', from: 0, to: 79.5 },
    map: 'krasnaya_kosa', side: 'coast', time: 'night', weather: 'calm', ai: 'easy',
    brief: [
      'The battery is on the bluff above Krasnaya Kosa.',
      'One destroyer is on patrol off the spit.',
      'Bring the battery up, find the ship and sink it.',
    ],
    objectives: [
      { kind: 'deploy', type: 'tel', text: 'Deploy the TEL', hint: 'Select the TEL, press T' },
      { kind: 'radar', type: 'radar', text: 'Radar on', hint: 'Select the Monolith-B and switch it on' },
      { kind: 'scan', count: 1, text: 'Scan the contact', hint: 'Select the radar, press X on the contact' },
      { kind: 'inspect', text: 'Inspect a unit', hint: 'Press I, E to explode it' },
      { kind: 'destroy', type: 'ddg', count: 1, text: 'Sink the destroyer', hint: 'Select the TEL, right-click the track' },
      { kind: 'reload', text: 'Reload the TEL', hint: 'Select the transloader, right-click the TEL' },
    ],
    forces: { coast: [['hq', 1], ['tel', 1], ['radar', 1], ['transloader', 1]], fleet: [['ddg', 1]] },
    carry: false,
  },
  {
    n: 2, id: 'scale', title: 'Scale',
    film: { id: 'oa_scale', from: 0, to: 57 },
    map: 'archipelago', side: 'coast', time: 'day', weather: 'haze', ai: 'normal',
    brief: [
      'The task group has gone into the archipelago.',
      'The islands shadow the radar. The drone sees behind them.',
      'Identify three contacts, then sink two destroyers.',
    ],
    objectives: [
      { kind: 'scan', count: 3, text: 'Identify three contacts' },
      { kind: 'destroy', type: 'ddg', count: 2, text: 'Sink two destroyers' },
      { kind: 'lose', type: 'tel', max: 0, optional: true, text: 'Lose no TEL' },
    ],
    forces: { coast: [['hq', 1], ['tel', 2], ['radar', 1], ['catapult', 1], ['transloader', 1]], fleet: [['ddg', 3], ['helo', 1]] },
    carry: true,
  },
  {
    n: 3, id: 'battery', title: 'Battery',
    film: { id: 'pc_anatomy_battery', from: 0, to: 80 },
    map: 'fjord', side: 'coast', time: 'dusk', weather: 'rain', ai: 'normal',
    brief: [
      'The fleet has found the battery.',
      'Strike aircraft will come up the fjord in waves.',
      'Keep the radar and the TELs alive for ten minutes.',
    ],
    objectives: [
      { kind: 'survive', seconds: 600, text: 'Hold out for 10 min' },
      { kind: 'protect', type: 'radar', text: 'Keep the radar alive' },
      { kind: 'destroy', type: 'fighter', count: 6, optional: true, text: 'Down six aircraft' },
    ],
    forces: { coast: [['hq', 1], ['tel', 2], ['radar', 1], ['pantsir', 2], ['transloader', 1]], fleet: [['carrier', 1], ['ddg', 1]] },
    waves: [
      { t: 60, side: 'fleet', units: [['fighter', 2]] },
      { t: 240, side: 'fleet', units: [['fighter', 2]] },
      { t: 420, side: 'fleet', units: [['fighter', 4]] },
    ],
    carry: true,
  },
  {
    n: 4, id: 'engagement', title: 'Engagement',
    film: { id: 'pd_engagement', from: 0, to: 108 },
    map: 'strait', side: 'coast', time: 'dusk', weather: 'calm', ai: 'normal',
    brief: [
      'Two destroyers are running the strait.',
      'Their defences stop single rounds. Fire in salvos.',
      'Sink both before they clear the strait.',
    ],
    objectives: [
      { kind: 'destroy', type: 'ddg', count: 2, within: 1200, text: 'Sink both destroyers in 20 min' },
      { kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { kind: 'lose', type: 'tel', max: 0, optional: true, text: 'Lose no TEL' },
    ],
    forces: { coast: [['hq', 1], ['tel', 3], ['radar', 1], ['pantsir', 1], ['catapult', 1], ['transloader', 2]], fleet: [['ddg', 2], ['helo', 1]] },
    carry: true,
  },
  {
    n: 5, id: 'ring', title: 'Ring',
    film: { id: 'oe_ring', from: 0, to: 89 },
    map: 'delta', side: 'coast', time: 'night', weather: 'rain', ai: 'hard',
    brief: [
      'The fleet is striking back at the coast.',
      'The delta is flat: the radar sees far and is seen far.',
      'Hold the port for ten minutes. Move between salvos.',
    ],
    objectives: [
      { kind: 'hold', objective: 'port', seconds: 600, text: 'Hold the port for 10 min' },
      { kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { kind: 'destroy', type: 'ddg', count: 1, optional: true, text: 'Sink a destroyer' },
    ],
    forces: { coast: [['hq', 1], ['tel', 3], ['radar', 2], ['pantsir', 2], ['catapult', 1], ['transloader', 2]], fleet: [['ddg', 3], ['helo', 2], ['fighter', 4]] },
    waves: [
      { t: 300, side: 'fleet', units: [['fighter', 4]] },
    ],
    carry: true,
  },
  {
    n: 6, id: 'strike', title: 'Strike',
    film: { id: 'oa_strike', from: 33, to: 132 },
    map: 'caldera', side: 'coast', time: 'night', weather: 'storm', ai: 'hard',
    brief: [
      'The whole task group is in the caldera lagoon.',
      'A storm is over the coast. Lightning shows what the radar cannot.',
      'Sink the carrier.',
    ],
    objectives: [
      { kind: 'destroy', type: 'carrier', count: 1, text: 'Sink the carrier' },
      { kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { kind: 'destroy', type: 'ddg', count: 3, optional: true, text: 'Sink the three escorts' },
    ],
    forces: { coast: [['hq', 1], ['tel', 4], ['radar', 2], ['pantsir', 2], ['catapult', 2], ['transloader', 2]], fleet: [['carrier', 1], ['ddg', 3], ['helo', 2], ['fighter', 8]] },
    carry: true,
  },
];

export const GRADES = ['S', 'A', 'B', 'C', 'D'];
export const getMission = n => MISSIONS[(+n || 1) - 1] || null;

const KEY = 'oniks.campaign', LAST = 'oniks.lastResult';

function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage off */ } }

export function getProgress() {
  const p = load(KEY, {}) || {};
  return { grades: p.grades || {}, passed: Array.isArray(p.passed) ? p.passed : [], best: p.best || {}, carry: p.carry || null };
}

/* mission n is open when every mission before it is passed */
export function isUnlocked(n, p) {
  p = p || getProgress();
  for (let k = 1; k < n; k++) if (!p.passed.includes(k)) return false;
  return true;
}
export const isPassed = (n, p) => (p || getProgress()).passed.includes(n);
export const better = (a, b) => !b || (a && GRADES.indexOf(a) >= 0 && GRADES.indexOf(a) < GRADES.indexOf(b));

/* fold a campaign result into the progress; returns the updated progress */
export function recordResult(r) {
  const p = getProgress();
  if (!r || r.mode !== 'campaign' || !getMission(r.mission)) return p;
  const n = +r.mission;
  if (r.win) {
    if (!p.passed.includes(n)) p.passed.push(n);
    p.passed.sort((a, b) => a - b);
    if (r.grade && better(r.grade, p.grades[n])) { p.grades[n] = r.grade; if (r.stats) p.best[n] = r.stats; }
    if (r.stats && r.stats.ammo) p.carry = { after: n, ammo: r.stats.ammo };
  }
  save(KEY, p);
  return p;
}

/* read `oniks.lastResult` once: returns it (or null) and removes it, folding a campaign result into progress */
export function takeLastResult() {
  const r = load(LAST, null);
  if (!r) return null;
  try { localStorage.removeItem(LAST); } catch (e) { /* */ }
  if (r.mode === 'campaign') recordResult(r);
  return r;
}

export function resetProgress() { save(KEY, {}); }
