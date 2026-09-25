/* Match setup from the URL the menus hand over.
     ?mode=sandbox&map=&side=&fog=0|1&weather=calm|haze|rain|storm
     ?mode=combat&map=&side=&ai=easy|normal|hard&win=hq|obj&timer=<s>&fog=1
     ?mode=campaign&mission=<n>&map=&side=
   parseParams(search) -> params; createMatch(map, params, mission) -> { sim, side, spawned }
   Also: seed=<n> (default 1337), rate=<x> (start rate), debug extras (cam=, t=, bench=, scale=, ui=0). */
import { Sim } from '../sim/sim.js';
import { setupBattle } from '../sim/setup.js';
import { findSpot, spreadOut } from '../sim/economy.js';
import { AI } from '../sim/ai.js';
import { UNITS, ENEMY, TEL_ELEV } from '../data/units.js';
import { applyCarry } from './campaign/grade.js';

const WEATHERS = ['calm', 'haze', 'rain', 'storm'];
const SEA = { calm: .2, haze: .3, rain: .55, storm: .85 };

export function parseParams(search) {
  const Q = new URLSearchParams(search || '');
  const mode = ['sandbox', 'combat', 'campaign'].includes(Q.get('mode')) ? Q.get('mode') : 'sandbox';
  const side = Q.get('side') === 'fleet' ? 'fleet' : 'coast';
  const num = (k, d) => Q.has(k) && Q.get(k) !== '' && isFinite(+Q.get(k)) ? +Q.get(k) : d;
  return {
    mode, side,
    map: Q.get('map') || '',
    mission: num('mission', 1),
    fog: mode === 'combat' ? num('fog', 1) !== 0 : mode === 'campaign' ? true : num('fog', 0) !== 0,
    weather: WEATHERS.includes(Q.get('weather')) ? Q.get('weather') : null,
    ai: ['easy', 'normal', 'hard'].includes(Q.get('ai')) ? Q.get('ai') : 'normal',
    win: Q.get('win') === 'obj' ? 'obj' : 'hq',
    timer: num('timer', 1800),
    seed: num('seed', 1337) >>> 0,
    rate: num('rate', 0),
  };
}

/* the map's weather with the chosen preset (wind kept, sea state from the preset) */
export function weatherOf(map, kind) {
  const w = map.weather || { kind: 'calm', wind: [3, 1], sea: .2 };
  if (!kind || kind === w.kind) return Object.assign({}, w);
  return { kind, wind: w.wind ? w.wind.slice() : [3, 1], sea: SEA[kind] };
}

export function createMatch(map, P, mission) {
  const side = mission ? (mission.side || 'coast') : P.side, enemy = ENEMY[side];
  const weather = weatherOf(map, mission ? mission.weather : P.weather);
  const opts = { seed: P.seed, fog: P.fog, mode: P.mode, weather, difficulty: mission ? mission.ai : P.ai };
  if (P.mode === 'combat') { opts.aiSides = [enemy]; if (P.win === 'obj') opts.timeLimit = P.timer; }
  else if (P.mode === 'campaign') opts.aiSides = [enemy];
  else opts.aiSides = [];                          // sandbox: the enemy sleeps until woken
  const sim = new Sim(map, opts);
  let spawned;
  if (P.mode === 'campaign' && mission) spawned = campaignForces(sim, mission);
  else if (P.mode === 'combat') {
    spawned = setupBattle(sim, { coast: 1, fleet: 1, emplaced: true });
    // the first shot is the player's: offensive weapons start held (the sim's `hold` flag is weapons free; H toggles it,
    // right-click on a track orders an attack). Defensive fire (SAM, SM-6, ESSM, Phalanx, 30 mm) is always automatic.
    for (const u of spawned[side] || []) u.hold = false;
  }
  else spawned = setupBattle(sim, { coast: .5, fleet: .5, emplaced: true });
  // no two units on one spot: a planner's shared site or a shared fallback cell steps the later ones outward
  if (spawned) spreadOut(sim, [...(spawned.coast || []), ...(spawned.fleet || [])]);
  return { sim, side, enemy, weather, spawned };
}

/* ---------- sandbox: wake / sleep an AI ---------- */
export function setAi(sim, side, on, level) {
  sim._aiSleep = sim._aiSleep || {};
  if (on) {
    if (sim.ai[side]) return sim.ai[side];
    sim.ai[side] = sim._aiSleep[side] || new AI(sim, side, level || 'normal');
    delete sim._aiSleep[side];
    return sim.ai[side];
  }
  if (sim.ai[side]) { sim._aiSleep[side] = sim.ai[side]; delete sim.ai[side]; }
  return null;
}

/* ---------- campaign ---------- */
function campaignForces(sim, m) {
  const out = { coast: [], fleet: [] }, map = sim.map, r = sim.rng.place;
  for (const side of ['coast', 'fleet']) {
    const list = (m.forces && m.forces[side]) || [];
    const sp = map.spawns[side];
    let cv = null;
    // the carrier first (aircraft start aboard it)
    const order = list.slice().sort((a, b) => (b[0] === 'carrier') - (a[0] === 'carrier'));
    for (const [type, n] of order) {
      if (!UNITS[type]) { console.warn('campaign: unknown unit type', type); continue; }
      for (let i = 0; i < n; i++) {
        const u = place(sim, side, type, i, n, cv, r);
        if (u) { out[side].push(u); if (type === 'carrier') cv = u; }
      }
    }
  }
  // the battery on its sites (the coast planner picks them), then brought down to its travel state when the
  // mission asks the player to bring it up
  if (out.coast.length) {
    new AI(sim, 'coast', 'normal').emplace();
    const kinds = new Set((m.objectives || []).map(o => o.kind));
    for (const u of out.coast) {
      if (kinds.has('deploy') && u.type === 'tel') { u.dep = u.depT = 0; u.elev = u.elevT = u.wantElev = 0; u.deployed = false; }
      if (kinds.has('radar') && u.type === 'radar') { u.mast = u.mastT = 0; u.deployed = false; sim.setRadar(u, false, true); }
      u.def.modelState(u, sim.t);
    }
  }
  // the rounds carried from the last battle (campaign/grade.js; the mission script reports them)
  sim.campaignCarry = applyCarry(sim, m, out.coast);
  return out;
}

function place(sim, side, type, i, n, cv, r) {
  const map = sim.map, sp = map.spawns[side], cs = map.spawns.coast, fs = map.spawns.fleet, d = UNITS[type];
  if (d.domain === 'air' && side === 'fleet') {
    if (cv) return sim.spawn(type, side, cv.pos[0], cv.pos[2], { aboard: cv.id });
    const p = findSpot(sim, 'sea', sp.x + (i - (n - 1) / 2) * 800, sp.z, 1500, r);
    return sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
  }
  if (type === 'carrier') {
    const L = Math.hypot(cs.x - fs.x, cs.z - fs.z) || 1;
    const bx = Math.max(-map.W / 2 + 3000, Math.min(map.W / 2 - 3000, fs.x - (cs.x - fs.x) / L * 12000));
    const bz = Math.max(-map.H / 2 + 3000, Math.min(map.H / 2 - 3000, fs.z - (cs.z - fs.z) / L * 12000));
    const p = findSpot(sim, 'sea', bx, bz, 2000, r);
    return sim.spawn(type, side, p[0], p[1], { hdg: Math.atan2(cs.x - fs.x, cs.z - fs.z) });
  }
  if (d.domain === 'sea') {
    const L = Math.hypot(cs.x - fs.x, cs.z - fs.z) || 1, fx = (cs.x - fs.x) / L, fz = (cs.z - fs.z) / L;
    const lat = (i - (n - 1) / 2) * 5000, ax = fs.x + fx * 4000 + fz * lat, az = fs.z + fz * 4000 - fx * lat;
    const p = findSpot(sim, 'sea', ax, az, 1500, r);
    return sim.spawn(type, side, p[0], p[1], { hdg: Math.atan2(fx, fz) });
  }
  if (d.domain === 'air') {
    const p = findSpot(sim, 'land', sp.x, sp.z, sp.r, r);
    return sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
  }
  const p = findSpot(sim, 'land', sp.x, sp.z, type === 'hq' ? sp.r * .3 : sp.r, r);
  return sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
}


/* ---------- reinforcement waves (campaign) ---------- */
export function spawnWave(sim, side, units) {
  const out = [], map = sim.map, r = sim.rng.place;
  const cv = sim.alive(side).find(u => u.type === 'carrier');
  for (const [type, n] of units) {
    if (!UNITS[type]) continue;
    for (let i = 0; i < n; i++) {
      let u;
      if (UNITS[type].domain === 'air' && side === 'fleet') {
        // strike aircraft arrive from beyond the fleet's edge of the map, already airborne
        const sp = map.spawns.fleet, cs = map.spawns.coast, L = Math.hypot(cs.x - sp.x, cs.z - sp.z) || 1;
        const x = Math.max(-map.W / 2 + 1000, Math.min(map.W / 2 - 1000, sp.x - (cs.x - sp.x) / L * 20000 + (i - (n - 1) / 2) * 600));
        const z = Math.max(-map.H / 2 + 1000, Math.min(map.H / 2 - 1000, sp.z - (cs.z - sp.z) / L * 20000));
        u = cv ? sim.spawn(type, side, cv.pos[0], cv.pos[2], { aboard: cv.id }) : sim.spawn(type, side, x, z, { hdg: Math.atan2(cs.x - sp.x, cs.z - sp.z) });
      } else u = place(sim, side, type, i, n, cv, r);
      if (u) out.push(u);
    }
  }
  return out;
}

export { TEL_ELEV };
