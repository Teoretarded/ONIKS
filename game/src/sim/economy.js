/* Supply, objectives, reinforcements and the combat result (1 Hz).
   An objective is held by a side with units inside its radius and no enemy units there. Supply = base income +
   income per held objective. sim.buy(side, type) queues a unit that arrives at the side's spawn after its build
   time (aircraft appear on the carrier, drones join a catapult). A side loses when its HQ (command post /
   carrier) is destroyed; optional: objective hold timer, time limit. */
import { UNITS, SIDES, ENEMY } from '../data/units.js';
import { dxz } from './util.js';
import { hostFor, embark, overrunTick } from './amphib.js';
import { kill } from './damage.js';

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
  // the landing force holding the ground round the command post takes it (amphib.js)
  const by = overrunTick(sim);
  if (by) { const hq = sim.hq('coast'); if (hq) kill(sim, hq, by); }
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
  if (d.embark && !hostFor(sim, side, type)) return false;      // LCACs and ACVs need room aboard an LHD
  S.supply -= d.cost;
  S.queue.push({ type, at: sim.t + d.buildTime, ordered: sim.t });
  sim.emit('order_unit', { side, type, at: sim.t + d.buildTime });
  return true;
}

function arrive(sim, side, type) {
  const d = UNITS[type], sp = sim.map.spawns[side];
  let u = null;
  if (d.embark) {
    // the landing force joins an LHD: an LCAC in its well, a vehicle in an LCAC there or on its vehicle decks
    const h = hostFor(sim, side, type);
    if (!h) { sim.sides[side].supply += d.cost; sim.emit('reinforce', { side, type, unit: 0, lost: true, pos: [sp.x, 0, sp.z] }); return; }
    u = sim.spawn(type, side, h.pos[0], h.pos[2], { hdg: h.hdg });
    embark(sim, u, h);
  } else if (d.domain === 'air' && side === 'fleet') {
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
  for (const v of decks) { let n = 0; for (const w of al) if (w.aboard === v.id && w.def.domain === 'air') n++; if (n < v.def.air.cap) return v; }
  return null;
}

/* the room a unit keeps from every other when it is placed (m, between centres): vehicles 60, ships and boats 450
   (a carrier more), aircraft placed in the air 150 */
export const GAP = { land: 60, sea: 450, sub: 450, air: 150 };
const domOf = d => d.sub ? 'sub' : d.domain === 'sea' ? 'sea' : d.domain === 'air' ? 'air' : 'land';
export const gapOf = d => domOf(d) === 'sea' ? Math.max(GAP.sea, d.size[0] * 1.6) : GAP[domOf(d)];

/* a spot a unit of that domain can stand on; strict = the placement rule (flat dry land, deep water), else anything
   the unit can move on */
function validAt(sim, dom, px, pz, strict) {
  const map = sim.map;
  if (Math.abs(px) > map.W / 2 - 500 || Math.abs(pz) > map.H / 2 - 500) return false;
  if (dom === 'land') return (strict ? map.h(px, pz) > 1 && map.slope(px, pz) < .3 : map.h(px, pz) > .5) && sim.nav.open('land', px, pz);
  if (dom === 'sea') return (strict ? map.h(px, pz) < -25 : map.h(px, pz) < -8) && sim.nav.open('sea', px, pz);
  if (dom === 'sub') return (!strict || map.h(px, pz) < -60) && sim.nav.open('sub', px, pz);
  return true;
}
/* no other unit (alive, not on a deck; `skip` excepted) within gap of (px, pz) */
function clearAt(sim, px, pz, gap, skip) {
  if (!gap) return true;
  const g2 = gap * gap;
  for (const v of sim.units.values()) {
    if (v === skip || v.aboard || !v.alive) continue;
    const dx = v.pos[0] - px, dz = v.pos[2] - pz;
    if (dx * dx + dz * dz < g2) return false;
  }
  return true;
}
/* outward from (x, z), ring by ring (deterministic): the nearest spot that is valid and clear, out to rMax */
function outward(sim, dom, x, z, gap, rMax, skip) {
  const step = Math.max(gap, 40);
  for (const strict of [true, false]) {
    if (validAt(sim, dom, x, z, strict) && clearAt(sim, x, z, gap, skip)) return [x, z];
    for (let k = 1, rr = step; rr <= rMax; k++) {
      const n = Math.max(8, Math.min(96, Math.ceil(Math.PI * 2 * rr / Math.max(step, rr * .1)))), a0 = k * 2.39996;
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * Math.PI * 2, px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
        if (validAt(sim, dom, px, pz, strict) && clearAt(sim, px, pz, gap, skip)) return [px, pz];
      }
      rr = k < 40 ? rr + step : rr * 1.12;
    }
  }
  return null;
}

/* a valid spot near (x, z) for a domain, clear of the units already there by `gap` (default GAP[dom]): random tries
   inside r first, then outward ring by ring; never the one fallback cell for everybody */
export function findSpot(sim, dom, x, z, r, rnd, gap) {
  gap = gap === undefined ? GAP[dom] || 0 : gap;
  for (let k = 0; k < 60; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * (1 + k / 30);
    const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    if (validAt(sim, dom, px, pz, true) && clearAt(sim, px, pz, gap)) return [px, pz];
  }
  const p = outward(sim, dom, x, z, gap, Math.max(r * 4, 15000));
  if (p) return p;
  // nothing valid anywhere near: the nearest open cell, stepped round a spiral so two units never share a point
  const k = sim.nav.nearestOpen(dom === 'air' ? 'land' : dom, sim.nav.cellOf(x, z), -1, 80);
  const c = k >= 0 ? [sim.nav.cx(k), sim.nav.cz(k)] : [x, z];
  for (let m = 0; m < 64; m++) {
    const rr = gap * Math.sqrt(m), a = m * 2.39996, px = c[0] + Math.sin(a) * rr, pz = c[1] + Math.cos(a) * rr;
    if (clearAt(sim, px, pz, gap)) return [px, pz];
  }
  return c;
}

/* after a planner put units on their sites: any unit standing within its gap of another steps outward to the nearest
   clear spot (a shared site, a shared fallback); of two on one spot the later in the list keeps it. */
export function spreadOut(sim, units) {
  const map = sim.map;
  let moved = 0;
  for (const u of units) {
    if (!u || !u.alive || u.aboard || u.def.domain === 'air') continue;
    const gap = gapOf(u.def), dom = domOf(u.def);
    if (clearAt(sim, u.pos[0], u.pos[2], gap, u)) continue;
    const p = outward(sim, dom, u.pos[0], u.pos[2], gap, 6000, u);
    if (!p) continue;
    u.pos[0] = u.prev[0] = p[0]; u.pos[2] = u.prev[2] = p[1];
    if (dom === 'land') u.pos[1] = u.prev[1] = Math.max(0, map.h(p[0], p[1]));
    moved++;
  }
  return moved;
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
