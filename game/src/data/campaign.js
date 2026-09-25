/* Campaign: six escalating battles on the Coast side. Each opens with one of the reference films as its cutscene (the
   story), then a briefing, then play.html?mode=campaign&mission=<n> (n is 1-based). Each battle has one idea and a
   script (game/src/game/campaign/m<n>_<id>.js) that tells it: the opening flight, lines, objectives revealed in
   stages, the enemy's moves, weather.

   import { MISSIONS, getMission, getProgress, isUnlocked, recordResult, takeLastResult } from '../data/campaign.js'

   Mission = {
     n, id, title,
     film: { id, from, to },            // reference film and the stretch of it (film seconds) that plays
     map, side, time, weather,          // map id (world/maps.js), 'coast', 'night'|'dusk'|'day', 'calm'|'haze'|'rain'|'storm'
     ai,                                // enemy strength when its commander is on: 'easy' | 'normal' | 'hard'
     enemyAi,                           // false: the script drives the enemy (its commander starts off)
     fleetBuys,                         // true: the enemy may buy reinforcements (default: no)
     supply,                            // the player's starting supply (reinforcements, B)
     brief: [..],                       // terse briefing lines, true to the mission
     objectives: [Objective],           // declarative; objectives.js checks them, the script reveals the hidden ones
     forces: { coast: [[type, n]], fleet: [[type, n]] },   // starting units per side (unit types, data/units.js)
     carry: bool, resupply: n,          // rounds left from the last battle carry over, plus `resupply` new ones
     par: { kills },                    // ships (DDG, CVN) to sink for a good grade: none sunk grades C at best,
                                        // fewer than `kills` B at best (campaign/grade.js)
   }
   Objective = { id, kind, text, hint?, optional?, hidden?, ... } with kind one of
     'deploy'  { type }                 deploy a unit of this type
     'radar'   { type }                 switch a radar of this type on
     'scan'    { count }                identify `count` contacts with SCAN
     'classify'{ count, dom? }          hold `count` classified tracks (of domain 'sea' | 'land' | 'air')
     'inspect' {}                       open Inspect on any unit
     'launch'  { count }                fire `count` rounds
     'reload'  {}                       complete a TEL reload
     'destroy' { type, count, within? } destroy `count` enemy units of `type` (within `within` s, if set)
     'survive' { seconds }              last this long
     'hold'    { objective, seconds }   hold a map objective (by kind or id) this long
     'protect' { type }                 lose no unit of this type (fails when one is destroyed)
     'lose'    { type, max }            lose at most `max` units of this type ('*' or a list of types)
     'time'    { seconds }              finish before this sim time
     'rounds'  { max }                  fire at most `max` rounds
     'silent'  { type }                 no unit of this type radiates
     'script'  {}                       done or failed by the mission script
   Optional objectives are how a battle is done well: the grade is S with all of them and nothing lost, then A, B, C
   for each one missed (campaign/grade.js). A win that never fought (no ship sunk where the mission has a par) is C.

   Progress lives in localStorage `oniks.campaign`:
     { grades: { <n>: 'S'|'A'|'B'|'C'|'D' }, passed: [n...], best: { <n>: stats }, carry: { after: n, ammo } }
   Results count in unlock order only: a result for a mission that is still locked (a test tab, a hand-made URL,
   index.html?unlock) is not recorded (recordResult marks it `ignored: 'locked'`), and getProgress reads only the
   unbroken run of passed missions from 01 (stray entries from older builds are ignored and dropped on the next save).
   play.html writes the outcome of a match to localStorage `oniks.lastResult`:
     { mode: 'campaign'|'combat'|'sandbox', mission?: n, win: bool, grade?: 'S'..'D', stats?: { ..., ammo: { tel, telCap, cargo, cargoCap } } }
   and returns to index.html#campaign (or #combat); the shell folds it into progress (takeLastResult). */

export const MISSIONS = [
  {
    n: 1, id: 'inside', title: 'Inside',
    film: { id: 'pc_anatomy', from: 0, to: 79.5 },
    map: 'krasnaya_kosa', side: 'coast', time: 'night', weather: 'calm', ai: 'easy', enemyAi: false, supply: 0,
    brief: [
      'The battery is on the bluff above Krasnaya Kosa.',
      'One destroyer is on patrol to the north.',
      'Bring the battery up. Find it, identify it, sink it.',
    ],
    objectives: [
      { id: 'deploy', kind: 'deploy', type: 'tel', text: 'Deploy the TEL' },
      { id: 'radar', kind: 'radar', type: 'radar', text: 'Radar on' },
      { id: 'find', kind: 'scan', count: 1, text: 'Identify the contact', hidden: true },
      { id: 'look', kind: 'inspect', text: 'Inspect the destroyer', hidden: true },
      { id: 'sink', kind: 'destroy', type: 'ddg', count: 1, text: 'Sink the destroyer', hidden: true },
      { id: 'reload', kind: 'reload', text: 'Reload the TEL', hidden: true },
      { id: 'rounds', kind: 'rounds', max: 4, optional: true, text: 'Four rounds or fewer', hidden: true },
    ],
    forces: { coast: [['hq', 1], ['tel', 1], ['radar', 1], ['transloader', 1]], fleet: [['ddg', 1]] },
    carry: false,
  },
  {
    n: 2, id: 'scale', title: 'Scale',
    film: { id: 'oa_scale', from: 0, to: 57 },
    map: 'archipelago', side: 'coast', time: 'day', weather: 'haze', ai: 'normal', enemyAi: false, supply: 200,
    brief: [
      'The task group has gone into the skerries of Belye Shkhery.',
      'Their radars are off. Yours is too. Whoever radiates first is found.',
      'Find them with the drones and fire before they light up. They sail at 30:00.',
    ],
    objectives: [
      { id: 'find', kind: 'classify', count: 2, dom: 'sea', text: 'Find the task group', hint: '4 · the drone · right-click in the ring' },
      { id: 'sail', kind: 'time', seconds: 1800, text: 'Before they sail' },
      { id: 'sink', kind: 'destroy', type: 'ddg', count: 1, text: 'Sink a destroyer', hidden: true },
      { id: 'sink2', kind: 'destroy', type: 'ddg', count: 2, optional: true, text: 'Sink a second', hidden: true },
      { id: 'quiet', kind: 'silent', type: 'radar', optional: true, text: 'Keep the radar silent' },
      { id: 'tels', kind: 'lose', type: 'tel', max: 0, optional: true, text: 'Lose no TEL' },
    ],
    forces: { coast: [['tel', 2], ['radar', 1], ['catapult', 1], ['transloader', 1]], fleet: [['ddg', 3], ['helo', 1]] },
    carry: true, resupply: 4,
  },
  {
    n: 3, id: 'battery', title: 'Battery',
    film: { id: 'pc_anatomy_battery', from: 0, to: 80 },
    map: 'fjord', side: 'coast', time: 'dusk', weather: 'rain', ai: 'normal', enemyAi: false, supply: 300,
    brief: [
      'The fleet knows where the battery is.',
      'Strike aircraft will come in three raids. They go for whatever radiates.',
      'Keep the command post. Reload between the raids.',
    ],
    objectives: [
      { id: 'raids', kind: 'script', text: 'Hold through three raids' },
      { id: 'cp', kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { id: 'keep', kind: 'lose', type: ['tel', 'radar'], max: 0, optional: true, text: 'Lose no TEL or radar' },
      { id: 'picket', kind: 'destroy', type: 'ddg', count: 1, optional: true, text: 'Sink the picket destroyer' },
    ],
    forces: { coast: [['hq', 1], ['tel', 2], ['radar', 1], ['pantsir', 2], ['transloader', 1]], fleet: [['carrier', 1], ['ddg', 1], ['fighter', 9]] },
    carry: true, resupply: 4,
  },
  {
    n: 4, id: 'engagement', title: 'Engagement',
    film: { id: 'pd_engagement', from: 0, to: 108 },
    map: 'strait', side: 'coast', time: 'dusk', weather: 'calm', ai: 'normal', enemyAi: false, supply: 400,
    brief: [
      'Three destroyers are running the strait, northbound.',
      'Round by round, they stop what you fire. Six at once, they cannot.',
      'Sink two before they reach the narrows at Ostrov Sredny.',
    ],
    objectives: [
      { id: 'sink', kind: 'destroy', type: 'ddg', count: 2, text: 'Sink two before the narrows' },
      { id: 'cp', kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { id: 'salvo', kind: 'script', optional: true, text: 'One salvo of six' },
      { id: 'tels', kind: 'lose', type: 'tel', max: 0, optional: true, text: 'Lose no TEL' },
    ],
    forces: { coast: [['hq', 1], ['tel', 3], ['radar', 1], ['pantsir', 2], ['catapult', 1], ['transloader', 2]], fleet: [['ddg', 3], ['helo', 1]] },
    carry: true, resupply: 6,
  },
  {
    n: 5, id: 'ring', title: 'Ring',
    film: { id: 'oe_ring', from: 0, to: 89 },
    map: 'delta', side: 'coast', time: 'night', weather: 'rain', ai: 'hard', enemyAi: false, supply: 500,
    brief: [
      'The fleet is striking back at the coast, salvo after salvo, all three destroyers at once.',
      'Every launch shows them where the TEL is. Move after you fire.',
      'Keep the command post for fifteen minutes. A destroyer with a 3M55 in it fires no more salvos.',
    ],
    objectives: [
      { id: 'hold', kind: 'survive', seconds: 900, text: 'Hold for 15 min' },
      { id: 'cp', kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { id: 'hit', kind: 'destroy', type: 'ddg', count: 2, optional: true, text: 'Sink two destroyers' },
      { id: 'tels', kind: 'lose', type: 'tel', max: 0, optional: true, text: 'Lose no TEL' },
    ],
    forces: { coast: [['hq', 1], ['tel', 3], ['radar', 1], ['pantsir', 3], ['catapult', 1], ['transloader', 2]], fleet: [['carrier', 1], ['ddg', 3], ['fighter', 8]] },
    carry: true, resupply: 6, par: { kills: 1 },
  },
  {
    n: 6, id: 'strike', title: 'Strike',
    film: { id: 'oa_strike', from: 33, to: 132 },
    map: 'caldera', side: 'coast', time: 'night', weather: 'storm', ai: 'hard', enemyAi: false, supply: 600,
    brief: [
      'The whole task group has run into the caldera, out of the storm.',
      'Inside a storm cell their radar is nearly blind. So is yours. Lightning shows both.',
      'Sink the carrier. When the storm is off them, they sail.',
    ],
    objectives: [
      { id: 'find', kind: 'script', text: 'Find the carrier' },
      { id: 'sink', kind: 'destroy', type: 'carrier', count: 1, text: 'Sink the carrier', hidden: true },
      { id: 'cp', kind: 'protect', type: 'hq', text: 'Keep the command post' },
      { id: 'escort', kind: 'destroy', type: 'ddg', count: 1, optional: true, text: 'Sink an escort' },
      { id: 'tels', kind: 'lose', type: 'tel', max: 1, optional: true, text: 'Lose one TEL at most' },
    ],
    forces: { coast: [['hq', 1], ['tel', 4], ['radar', 2], ['pantsir', 2], ['catapult', 1], ['transloader', 2]], fleet: [['carrier', 1], ['ddg', 3], ['helo', 2], ['fighter', 6]] },
    carry: true, resupply: 8, par: { kills: 1 },
  },
];

export const GRADES = ['S', 'A', 'B', 'C', 'D'];
export const getMission = n => MISSIONS[(+n || 1) - 1] || null;

const KEY = 'oniks.campaign', LAST = 'oniks.lastResult';

function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage off */ } }

/* the progress as it counts: only the unbroken run of passed missions from 01 (a stray "passed" for a mission that
   was never unlocked, from a test tab or an older build, is left out, with its grade and stats) */
export function getProgress() {
  const p = load(KEY, {}) || {};
  const raw = Array.isArray(p.passed) ? p.passed.map(Number) : [];
  const passed = [], grades = {}, best = {};
  for (let n = 1; n <= MISSIONS.length && raw.includes(n); n++) {
    passed.push(n);
    if (p.grades && GRADES.includes(p.grades[n])) grades[n] = p.grades[n];
    if (p.best && p.best[n]) best[n] = p.best[n];
  }
  const c = p.carry;
  const carry = c && passed.includes(+c.after) && c.ammo ? { after: +c.after, ammo: c.ammo } : null;
  return { grades, passed, best, carry };
}

/* mission n is open when every mission before it is passed */
export function isUnlocked(n, p) {
  p = p || getProgress();
  for (let k = 1; k < n; k++) if (!p.passed.includes(k)) return false;
  return true;
}
export const isPassed = (n, p) => (p || getProgress()).passed.includes(n);
export const better = (a, b) => !b || (a && GRADES.indexOf(a) >= 0 && GRADES.indexOf(a) < GRADES.indexOf(b));

/* fold a campaign result into the progress; returns the updated progress. Results count in unlock order only: a
   result for a mission that is still locked is not recorded (r.ignored = 'locked'). The rounds carried over come from
   the furthest mission passed (replaying an earlier one does not change what the next battle starts with). */
export function recordResult(r) {
  const p = getProgress();
  if (!r || r.mode !== 'campaign') return p;
  const n = +r.mission;
  if (!Number.isInteger(n) || n < 1 || n > MISSIONS.length) return p;
  if (!isUnlocked(n, p)) { r.ignored = 'locked'; return p; }
  if (r.win) {
    if (!p.passed.includes(n)) p.passed.push(n);
    p.passed.sort((a, b) => a - b);
    if (r.grade && GRADES.includes(r.grade) && better(r.grade, p.grades[n])) { p.grades[n] = r.grade; if (r.stats) p.best[n] = r.stats; }
    if (r.stats && r.stats.ammo && (!p.carry || n >= p.carry.after)) p.carry = { after: n, ammo: r.stats.ammo };
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
