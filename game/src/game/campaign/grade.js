/* Grades and the rounds carried from one battle to the next.

   Grade (a won mission): the optional objectives are how a mission is done well (losses, time, rounds fired);
   S = every optional objective met and nothing lost; each optional missed costs a step, any loss a step, losing
   over a third of the force another: A, B, C. A mission with a par (`par: { kills }`) caps it: no enemy ship sunk
   is C at best, fewer than the par B at best, so a battle sat out never grades well. A lost mission is D. The
   grade replaces the match's own in game.result and oniks.lastResult.

   Carry: progress.carry = { after: n, ammo: { tel, telCap, cargo, cargoCap } } (the match's stats.ammo, kept by
   data/campaign.js recordResult). The next mission starts with the rounds left (in TELs and transloaders) plus
   `mission.resupply` new containers, never more than its own full load; the missing rounds come out of the
   transloaders first, then the TELs. */
import { getProgress } from '../../data/campaign.js';

export function gradeOf(game, win) {
  if (!win) return 'D';
  const objs = (game.objectives || []).filter(o => o.optional);
  const missed = objs.filter(o => o.state !== 'done').length;
  const sim = game.sim, S = sim.sides[game.side];
  const start = game.startCount || Math.max(1, sim.alive(game.side).length + S.lost);
  // drones are spent, not lost: an Orlan-10 shot down over the fleet does not cost a step
  const o = game.getSystem && game.getSystem('objectives'), byType = o && o.counts ? o.counts.losses : null;
  const lost = Math.max(0, S.lost - (byType && byType.drone || 0));
  // one step per optional missed, one for any loss, one more for heavy losses (a third of the force). A mission with
  // `grade: { anyLoss: false }` (06 Strike) grades losses by its own 'lose' objective instead of the step for any loss
  const G = (game.mission && game.mission.grade) || {};
  let k = missed;
  if (lost > 0 && G.anyLoss !== false) k++;
  if (lost > start / 3) k++;
  // a battle that was sat out is not done well: with a par, no ship sunk is C at best, short of the par B at best
  const par = game.mission && game.mission.par;
  if (par && par.kills) {
    const n = shipKills(game);
    if (n === 0) k = Math.max(k, 3);
    else if (n < par.kills) k = Math.max(k, 2);
  }
  return ['S', 'A', 'B', 'C'][Math.min(3, k)];
}

/* enemy ships sunk by the player (the objectives system counts kills by type) */
export function shipKills(game) {
  const o = game.getSystem && game.getSystem('objectives');
  const k = o && o.counts ? o.counts.kills : null;
  if (!k) return 0;
  return (k.ddg || 0) + (k.carrier || 0);
}

/* rewrite the grade the match computed (bus 'result' comes right after oniks.lastResult is written) */
export function regrade(game, r) {
  if (!r || game.mode !== 'campaign') return;
  const g = gradeOf(game, r.win);
  r.grade = g;
  if (game.result) game.result.grade = g;
  try {
    const raw = localStorage.getItem('oniks.lastResult');
    if (raw) { const o = JSON.parse(raw); o.grade = g; localStorage.setItem('oniks.lastResult', JSON.stringify(o)); }
  } catch (e) { /* storage off */ }
  return g;
}

/* the rounds a mission starts with: { load, left, carried, full } (null when nothing carries over) */
export function carryFor(m, coast) {
  if (!m.carry) return null;
  const c = getProgress().carry;
  if (!c || c.after !== m.n - 1 || !c.ammo) return null;
  const tels = coast.filter(u => u.type === 'tel'), tls = coast.filter(u => u.type === 'transloader');
  const full = tels.reduce((a, u) => a + u.def.weapons.oniks.ammo, 0) + tls.reduce((a, u) => a + (u.def.cargo || 0), 0);
  const left = (c.ammo.tel || 0) + (c.ammo.cargo || 0);
  const load = Math.min(full, left + (m.resupply || 0));
  return { load, left, full, resupply: m.resupply || 0 };
}
export function applyCarry(sim, m, coast) {
  const k = carryFor(m, coast);
  if (!k) return null;
  let missing = k.full - k.load;
  for (const u of coast.filter(u => u.type === 'transloader')) { if (missing <= 0) break; const n = Math.min(missing, u.cargo); u.cargo -= n; missing -= n; }
  for (const u of coast.filter(u => u.type === 'tel')) {
    if (missing <= 0) break;
    const n = Math.min(missing, u.ammo.oniks); u.ammo.oniks -= n; missing -= n;
    // the empty container is gone from the launcher: right first (caps 1 = fired)
    if (u.ammo.oniks < 2) u.caps[0] = 1;
    if (u.ammo.oniks < 1) u.caps[1] = 1;
  }
  return k;
}
