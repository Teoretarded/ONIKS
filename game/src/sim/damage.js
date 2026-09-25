/* Damage: HP plus per-part damage (0..1). A destroyed part switches off what it carries (radar, a weapon, movement,
   aircraft ops...). A destroyed unit plays a death animation (dying 0 -> 1: ships list and settle over ~60 s,
   vehicles burn ~20 s, aircraft fall) and is then removed. */
import { ENEMY } from '../data/units.js';
import { DT } from './consts.js';
import { ground } from './util.js';

export function applyDamage(sim, u, dmg, src) {
  if (!u.alive) return;
  const d = u.def, r = sim.rng.dmg;
  u.hp -= dmg;
  // the hit lands on one part (by weight); some of it spreads to a second part
  const hitPart = pickPart(d, r);
  hurtPart(sim, u, hitPart, dmg / u.hpMax * 2.2);
  if (d.partNames.length > 1) {
    let p2 = pickPart(d, r); if (p2 === hitPart) p2 = pickPart(d, r);
    if (p2 !== hitPart) hurtPart(sim, u, p2, dmg / u.hpMax * .8);
  }
  sim.emit('damage', { unit: u.id, side: u.side, part: hitPart, hp: Math.max(0, u.hp), dmg, pos: u.pos.slice() });
  if (u.hp <= 0) kill(sim, u, src);
}

function pickPart(d, r) {
  let x = r() * d.partW;
  for (const p of d.partNames) { x -= d.parts[p].w; if (x <= 0) return p; }
  return d.partNames[d.partNames.length - 1];
}

function hurtPart(sim, u, p, amount) {
  const before = u.parts[p];
  u.parts[p] = Math.min(1, before + amount);
  if (before < 1 && u.parts[p] >= 1) {
    const P = u.def.parts[p];
    if (P.disables) for (const k of P.disables) u.off[k] = true;
    if (P.lose) for (const k in P.lose) {
      if (k === 'cargo') u.cargo = Math.max(0, u.cargo - P.lose[k]);
      else if (u.ammo[k] !== undefined) u.ammo[k] = Math.floor(u.ammo[k] * (1 - P.lose[k]));
    }
    if (u.off.radar && u.radarOn) sim.setRadar(u, false, true);
    sim.emit('part', { unit: u.id, side: u.side, part: p, label: P.label, disables: P.disables || [], pos: u.pos.slice() });
    if (P.fatal) u.hp = Math.min(u.hp, 0);
  }
}

export function kill(sim, u, src) {
  if (!u.alive) return;
  u.alive = false; u.hp = 0; u.dying = 0; u.orders.length = 0; u.path = null;
  sim._dirty = true;
  const S = sim.sides[u.side]; S.lost++;
  const foe = ENEMY[u.side];
  sim.sides[foe].kills++;
  sim.sides[foe].value += u.def.hq ? 3000 : (u.def.cost || 100);
  // mark it dead in the enemy picture (the explosion is seen)
  const c = sim.sides[ENEMY[u.side]].contacts.get(u.id);
  if (c) { c.dead = true; c.deadT = sim.t; }
  // a reload in progress ends; aircraft aboard a sinking carrier are lost with it
  if (u.reloader) { const L = sim.units.get(u.reloader); if (L) L.busy = false; u.reloader = 0; }
  if (u.type === 'transloader') for (const v of sim.alive(u.side)) if (v.reloader === u.id) { v.reloader = 0; v.elevT = v.wantElev; }
  // a boat lost under the water shows where it went down on the surface
  const pos = u.def.sub ? [u.pos[0], Math.max(0, u.pos[1]), u.pos[2]] : u.pos.slice();
  sim.emit('destroyed', { unit: u.id, type: u.type, side: u.side, pos, by: src ? src.id : 0 });
  if (u.def.air) for (const v of sim.alive(u.side)) if (v.aboard === u.id) kill(sim, v, src);
}

/* death animations and removal */
export function stepDying(sim) {
  const list = sim.list();
  let removed = false;
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (u.alive) continue;
    if (u.recovered) { sim.units.delete(u.id); removed = true; continue; }
    const d = u.def;
    u.dying = Math.min(1, u.dying + DT / d.dieTime);
    if (d.sub) {
      // a boat goes down from wherever it is, bow or stern first
      u.speed *= .99;
      u.pos[0] += Math.sin(u.hdg) * u.speed * DT; u.pos[2] += Math.cos(u.hdg) * u.speed * DT;
      u.pos[1] -= (1.5 + 5 * u.dying) * DT;
      u.pitch = (u.id % 2 ? -.25 : .2) * Math.min(1, u.dying * 3);
      u.roll = .2 * u.dying * (u.id % 2 ? 1 : -1);
    } else if (d.domain === 'sea') {
      // list, settle by the stern, slow to a stop
      u.speed *= .995;
      u.pos[0] += Math.sin(u.hdg) * u.speed * DT; u.pos[2] += Math.cos(u.hdg) * u.speed * DT;
      u.pos[1] = -d.size[2] * .7 * u.dying * u.dying;
      u.roll = .35 * Math.sin(u.dying * Math.PI * .5) * (u.id % 2 ? 1 : -1);
      u.pitch = -.08 * u.dying;
    } else if (d.domain === 'air' && !u.aboard) {
      const g = ground(sim.map, u.pos[0], u.pos[2]);
      if (u.pos[1] > g + 1) {
        u.vy = (u.vy || 0) - 9.81 * DT;
        u.pos[0] += Math.sin(u.hdg) * u.speed * DT; u.pos[2] += Math.cos(u.hdg) * u.speed * DT; u.pos[1] = Math.max(g, u.pos[1] + u.vy * DT);
        u.speed *= .99; u.pitch = Math.max(-1.2, u.pitch - .3 * DT); u.roll += .8 * DT;
        if (u.pos[1] <= g + .01) sim.emit('splash', { pos: u.pos.slice(), kind: 'crash', side: u.side, unit: u.id, water: sim.map.h(u.pos[0], u.pos[2]) < 0 });
      } else u.speed = 0;
    } else u.speed = 0;
    if (u.dying >= 1) {
      sim.units.delete(u.id); removed = true;
      for (const side in sim.sides) { const c = sim.sides[side].contacts.get(u.id); if (c) sim.sides[side].contacts.delete(u.id); }
      sim.emit('removed', { unit: u.id, type: u.type, side: u.side });
    }
  }
  if (removed) sim._dirty = true;
}
