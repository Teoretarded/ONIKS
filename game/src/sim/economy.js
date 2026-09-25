/* Supply, objectives, reinforcements and the combat result (1 Hz).
   An objective is held by a side with units inside its radius and no enemy units there. Supply = base income +
   income per held objective. sim.buy(side, type) queues a unit that arrives at the side's spawn after its build
   time (aircraft appear on the carrier, drones join a catapult). A side loses when its HQ (command post /
   carrier) is destroyed; optional: objective hold timer, time limit. */
import { UNITS, SIDES, ENEMY } from '../data/units.js';
import { dxz } from './util.js';

export const BASE_INCOME = 1.2;                       // SUP per second
export const OBJ_INCOME = { port: 1.0, depot: .8, radar_hill: .6, airfield: 1.0, lighthouse: .4 };

export function economyTick(sim) {
  const t = sim.t;
  // objectives
  for (const o of sim.objectives) {
    let c = 0, f = 0;
    for (const side of SIDES) for (const u of sim.alive(side)) {
      if (u.aboard || u.def.domain === 'air' || u.def.sub) continue;          // boats hold no ground
      if (dxz(u.pos[0], u.pos[2], o.x, o.z) < o.r) { if (side === 'coast') c++; else f++; }
    }
    const owner = c && !f ? 'coast' : f && !c ? 'fleet' : c && f ? o.owner : null;
    if (owner !== o.owner) {
      const prev = o.owner; o.owner = owner;
      sim.emit('objective', { id: o.id, name: o.name, owner, prev, pos: [o.x, 0, o.z] });
    }
  }
  for (const side of SIDES) {
    const S = sim.sides[side];
    let inc = BASE_INCOME;
    for (const o of sim.objectives) if (o.owner === side) inc += OBJ_INCOME[o.kind] || .6;
    S.income = inc;
    S.supply += inc;
    // reinforcements
    for (let i = S.queue.length - 1; i >= 0; i--) {
      const q = S.queue[i];
      if (t < q.at) continue;
      S.queue.splice(i, 1);
      arrive(sim, side, q.type);
    }
  }
}

export function buy(sim, side, type) {
  const d = UNITS[type], S = sim.sides[side];
  if (!d || d.side !== side || !d.cost) return false;
  if (S.supply < d.cost) return false;
  if (sim.result) return false;
  S.supply -= d.cost;
  S.queue.push({ type, at: sim.t + d.buildTime, ordered: sim.t });
  sim.emit('order_unit', { side, type, at: sim.t + d.buildTime });
  return true;
}

function arrive(sim, side, type) {
  const d = UNITS[type], sp = sim.map.spawns[side];
  let u = null;
  if (d.domain === 'air' && side === 'fleet') {
    const cv = deckFor(sim, side, type);
    if (cv) u = sim.spawn(type, side, cv.pos[0], cv.pos[2], { aboard: cv.id });
    else u = sim.spawn(type, side, sp.x, sp.z, { hdg: sp.hdg });
  } else if (type === 'drone') {
    const cat = sim.alive(side).filter(v => v.type === 'catapult').sort((a, b) => a.drones - b.drones)[0];
    if (cat) { cat.drones++; sim.emit('reinforce', { side, type, unit: cat.id, pos: cat.pos.slice(), stock: true }); return; }
    u = sim.spawn(type, side, sp.x, sp.z, { hdg: sp.hdg });
  } else {
    const p = findSpot(sim, d.sub ? 'sub' : d.domain === 'sea' ? 'sea' : 'land', sp.x, sp.z, sp.r, sim.rng.place);
    u = sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
  }
  sim.emit('reinforce', { side, type, unit: u.id, pos: u.pos.slice() });
}

/* a deck with room for an aircraft of this type (the carrier first, then a destroyer's hangar for helos) */
export function deckFor(sim, side, type) {
  const al = sim.alive(side);
  const decks = al.filter(v => v.def.air && v.def.air.types.includes(type) && !v.off.air).sort((a, b) => b.def.air.cap - a.def.air.cap);
  for (const v of decks) { let n = 0; for (const w of al) if (w.aboard === v.id) n++; if (n < v.def.air.cap) return v; }
  return null;
}

/* a random valid spot near (x, z) for a domain */
export function findSpot(sim, dom, x, z, r, rnd) {
  const map = sim.map;
  for (let k = 0; k < 60; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * (1 + k / 30);
    const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    if (Math.abs(px) > map.W / 2 - 500 || Math.abs(pz) > map.H / 2 - 500) continue;
    if (dom === 'land') { if (map.h(px, pz) > 1 && map.slope(px, pz) < .3 && sim.nav.open('land', px, pz)) return [px, pz]; }
    else if (dom === 'sea') { if (map.h(px, pz) < -25 && sim.nav.open('sea', px, pz)) return [px, pz]; }
    else if (dom === 'sub') { if (map.h(px, pz) < -60 && sim.nav.open('sub', px, pz)) return [px, pz]; }
    else return [px, pz];
  }
  const k = sim.nav.nearestOpen(dom === 'land' ? 'land' : dom, sim.nav.cellOf(x, z), -1, 80);
  return k >= 0 ? [sim.nav.cx(k), sim.nav.cz(k)] : [x, z];
}

export function checkResult(sim) {
  if (sim.result) return;
  const t = sim.t, o = sim.opts;
  let winner = null, reason = null;
  for (const side of SIDES) {
    const S = sim.sides[side];
    if (S.hadHq && !sim.hq(side)) { winner = ENEMY[side]; reason = 'hq'; break; }
    // a side without a command unit loses when nothing of it is left (and nothing is on the way)
    if (!S.hadHq && S.hadUnits && !sim.alive(side).length && !S.queue.length) { winner = ENEMY[side]; reason = 'destroyed'; break; }
    if (sim.alive(side).length) S.hadUnits = true;
  }
  if (!winner && o.holdTime && sim.objectives.length) {
    const need = Math.ceil(sim.objectives.length * 2 / 3);
    for (const side of SIDES) {
      const S = sim.sides[side], n = sim.objectives.filter(b => b.owner === side).length;
      S.holdT = n >= need ? S.holdT + 1 : 0;
      if (S.holdT >= o.holdTime) { winner = side; reason = 'objectives'; }
    }
  }
  if (!winner && sim.timeLimit && t >= sim.timeLimit) {
    // points: value of the enemy destroyed (an HQ counts 3000) + 300 per objective held
    for (const side of SIDES) {
      const S = sim.sides[side];
      S.score = Math.round(S.value + sim.objectives.filter(b => b.owner === side).length * 300);
    }
    winner = sim.sides.coast.score >= sim.sides.fleet.score ? 'coast' : 'fleet'; reason = 'time';
  }
  if (winner) {
    sim.result = { winner, reason, t };
    sim.emit('result', { winner, reason });
  }
}
