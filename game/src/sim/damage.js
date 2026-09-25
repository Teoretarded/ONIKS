/* Damage: HP plus per-part damage (0..1). A destroyed part switches off what it carries (radar, a weapon, movement,
   aircraft ops...). A destroyed unit plays a death animation (dying 0 -> 1: ships list and settle over ~60 s,
   vehicles burn ~20 s, aircraft fall) and is then removed. */
import { ENEMY } from '../data/units.js';
import { DT } from './consts.js';
import { ground, clamp } from './util.js';

/* hit (weapons.js): { part, part2, pos } where it struck: the part whose box the round entered (sim/bodies.js) and the
   nearest other part (the spill-over). Without it (scripts, old callers) the part is drawn by weight. */
export function applyDamage(sim, u, dmg, src, hit) {
  if (!u.alive) return;
  const d = u.def, r = sim.rng.dmg;
  u.hp -= dmg;
  if (d.domain === 'sea') floodHit(sim, u, dmg, src);
  // the hit lands on one part; some of it spreads to a second part
  const hitPart = hit && hit.part && d.parts[hit.part] ? hit.part : pickPart(d, r);
  hurtPart(sim, u, hitPart, dmg / u.hpMax * 2.2);
  if (d.partNames.length > 1) {
    let p2 = hit && hit.part2 && d.parts[hit.part2] ? hit.part2 : null;
    if (!p2) { p2 = pickPart(d, r); if (p2 === hitPart) p2 = pickPart(d, r); }
    if (p2 !== hitPart) hurtPart(sim, u, p2, dmg / u.hpMax * .8);
  }
  sim.emit('damage', { unit: u.id, side: u.side, part: hitPart, hp: Math.max(0, u.hp), dmg, pos: u.pos.slice() });
  if (u.hp <= 0) kill(sim, u, src);
}

/* Flooding. Where a ship was hit, in her own frame (fSide -1 port .. 1 starboard, fEnd -1 stern .. 1 bow, weighted by
   the damage of every hit): the 'hit' event weapons.js has just emitted for her gives the point, else the side facing
   the shooter. Water in (u.flood 0..0.5 while she floats; a torpedo under her keel lets in three times as much): the
   dynamics list her toward the damaged side and trim her by the damaged end, the pumps gaining slowly. */
function floodHit(sim, u, dmg, src) {
  const d = u.def, L = d.size[0], B = (d.mot && d.mot.beam) || d.size[1], ev = sim.events[sim.events.length - 1];
  let px, pz, under = false, far = false;
  if (ev && ev.type === 'hit' && ev.target === u.id && ev.pos) { px = ev.pos[0]; pz = ev.pos[2]; under = !!ev.under; }
  else if (src && src.pos) { px = src.pos[0]; pz = src.pos[2]; far = true; }
  else { px = u.pos[0]; pz = u.pos[2]; }
  const s = Math.sin(u.hdg), c = Math.cos(u.hdg), dx = px - u.pos[0], dz = pz - u.pos[2];
  let lx = (dx * c - dz * s) / (B * .5), lz = (dx * s + dz * c) / (L * .5);
  if (far) { const k = Math.max(Math.abs(lx), Math.abs(lz), 1e-6); lx /= k; lz /= k; }
  lx = lx < -1 ? -1 : lx > 1 ? 1 : lx; lz = lz < -1 ? -1 : lz > 1 ? 1 : lz;
  const w0 = u.fW || 0, W = w0 + dmg;
  u.fSide = ((u.fSide || 0) * w0 + lx * dmg) / W; u.fEnd = ((u.fEnd || 0) * w0 + lz * dmg) / W; u.fW = W;
  u.flood = Math.min(.5, (u.flood || 0) + dmg / u.hpMax * (under ? 1.4 : .45));
  if (under) u.fUnder = (u.fUnder || 0) + dmg / u.hpMax;
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
  if (u.def.domain === 'sea' && !u.def.sub) u.sinkP = sinkPlan(u);
  u.alive = false; u.hp = 0; u.dying = 0; u.orders.length = 0; u.path = null; u.trapped = 0;
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
  if (u.def.air || u.def.carry) for (const v of sim.alive(u.side)) if (v.aboard === u.id) kill(sim, v, src);   // and what it carries
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
    } else if (d.hover && sim.map.h(u.pos[0], u.pos[2]) > 0) {
      u.speed = 0;                                                // a hovercraft lost on the beach burns there
    } else if (d.domain === 'sea') {
      sinkStep(u, d);
    } else if (d.domain === 'air' && !u.aboard) {
      fallStep(sim, u, d);
    } else if (d.domain === 'land' && !d.static) {
      wreckStep(sim, u);
    } else u.speed = 0;
    if (u.dying >= 1) {
      sim.units.delete(u.id); removed = true;
      for (const side in sim.sides) { const c = sim.sides[side].contacts.get(u.id); if (c) sim.sides[side].contacts.delete(u.id); }
      sim.emit('removed', { unit: u.id, type: u.type, side: u.side });
    }
  }
  if (removed) sim._dirty = true;
}

/* ---------- how they go ---------- */
const G = 9.81;
const hash01 = (id, k) => ((Math.imul(id * 7919 + k * 104729, 2654435761) >>> 0) % 100000) / 100000;

/* a ship's sinking, fixed when she is lost: how hard she was hit (sv 0..1: overkill, torpedoes under the keel, the
   water already in her), the side and the end the water came in by, whether she rolls over */
function sinkPlan(u) {
  const d = u.def, over = Math.max(0, -u.hp) / u.hpMax;
  const sv = clamp(.25 + over * 2.5 + (u.fUnder || 0) * 1.5 + (u.flood || 0) * .6, 0, 1);
  const side = u.fW ? u.fSide : (hash01(u.id, 1) - .5) * .6;
  const end = u.fW && Math.abs(u.fEnd) > .08 ? u.fEnd : hash01(u.id, 2) < .6 ? -.4 : .4;   // no clue: more often by the stern
  const p0 = .8 - .25 * sv;
  return { sv, side, end, cap: Math.abs(side) > .45 && sv > .45, p0, p1: Math.min(.97, p0 + .25),
    fb: (d.mot && d.mot.freeboard) || Math.max(3, d.size[2] * .16), L: d.size[0], B: d.size[1], H: d.size[2] };
}

/* Flooding to the end: she settles (the water gains on her: fast at first, then slower), lists toward the side she was
   hit on and trims by the damaged end until her deck edge is at the water (dying p0); then the final plunge, the
   flooded end first with her other end rising, or, flooded down one side, she rolls over. She loses way meanwhile.
   Writes u.pos[1] (- settling), u.roll (= u.list), u.pitch (= u.trim), u.flood (0..1+) for the render and the FX. */
function sinkStep(u, d) {
  const S = u.sinkP || (u.sinkP = sinkPlan(u)), k = u.dying;
  u.speed *= Math.exp(-DT / 14);
  u.pos[0] += Math.sin(u.hdg) * u.speed * DT; u.pos[2] += Math.cos(u.hdg) * u.speed * DT;
  const x = Math.min(1, k / S.p0), f = 1 - (1 - x) * (1 - x);
  const list0 = S.side * (.08 + .25 * Math.abs(S.side) * S.sv) * f, trim0 = -S.end * (.02 + .05 * S.sv) * f;
  let sink = S.fb * .75 * f, list = list0, trim = trim0;
  if (k > S.p0) {
    const y = Math.min(1, (k - S.p0) / (S.p1 - S.p0)), e = y * y * (3 - 2 * y);
    if (S.cap) {
      // she rolls over, floats keel up a moment, then goes
      const r = Math.min(1, y / .55), er = r * r * (3 - 2 * r), g2 = Math.max(0, (y - .5) / .5);
      list = list0 + ((S.side > 0 ? 2.6 : -2.6) - list0) * er;
      sink = S.fb * .75 * (1 - .6 * er) + (S.H + S.B) * g2 * g2;       // keel up she shows a third of her hull
    } else {
      // the flooded end goes down, pivoting about the buoyant end's third (it rises out of the water), then she slides under
      trim = trim0 + ((S.end > 0 ? -.55 : .55) - trim0) * e;
      const g2 = Math.max(0, (y - .5) / .5);
      sink += .3 * S.L * (Math.abs(Math.sin(trim)) - Math.abs(Math.sin(trim0))) + (S.L * .5 * Math.sin(.55) + S.H) * g2 * g2;
    }
    if (k > S.p1) sink += (k - S.p1) * 200;                     // gone: on down to the bottom
  }
  u.pos[1] = -sink; u.roll = list; u.pitch = trim;
  u.list = list; u.trim = trim; u.flood = k < S.p0 ? f * .75 : .75 + .25 * Math.min(1, (k - S.p0) / (S.p1 - S.p0));
}

/* an aircraft falls under drag (a tumbling airframe: ~110 m/s at the end), its nose dropping toward its path; a
   helicopter without its tail rotor spins. Killed on a deck, it stays there with the ship. */
function fallStep(sim, u, d) {
  if (u.deck) {
    const cv = sim.units.get(u.deck.cv), k = u.deck;
    if (cv) { const s = Math.sin(cv.hdg), c = Math.cos(cv.hdg); u.pos[0] = cv.pos[0] + k.x * c + k.z * s; u.pos[2] = cv.pos[2] - k.x * s + k.z * c; u.pos[1] = cv.pos[1] + k.y; }
    u.speed = 0; return;
  }
  const g = ground(sim.map, u.pos[0], u.pos[2]);
  if (u.pos[1] <= g + 1) { u.speed = 0; return; }
  const vy = u.vy || 0, v = u.speed, V = Math.sqrt(v * v + vy * vy) || 1, kd = .0008;
  u.vy = vy + (-G - kd * V * vy) * DT;
  u.speed = Math.max(0, v - kd * V * v * DT);
  const heli = u.hvx !== undefined && d.type === 'helo';
  if (heli) { const f = u.speed / (v || 1); u.hvx *= f; u.hvz *= f; u.pos[0] += u.hvx * DT; u.pos[2] += u.hvz * DT; u.hdg += 2.4 * DT; u.roll += .15 * DT; }
  else { u.pos[0] += Math.sin(u.hdg) * u.speed * DT; u.pos[2] += Math.cos(u.hdg) * u.speed * DT; u.roll += .8 * DT; }
  u.pos[1] = Math.max(g, u.pos[1] + u.vy * DT);
  u.pitch += (clamp(Math.atan2(u.vy, Math.max(u.speed, 1)), -1.4, .3) - u.pitch) * Math.min(1, DT * 1.5);
  if (u.pos[1] <= g + .01) sim.emit('splash', { pos: u.pos.slice(), kind: 'crash', side: u.side, unit: u.id, water: sim.map.h(u.pos[0], u.pos[2]) < 0 });
}

/* a vehicle's wreck: it skids to a stop along its heading (~0.4 g), slides down a slope steeper than the friction of a
   burnt-out hull on the ground holds (mu .35: ~19 deg), and settles onto its axles as the tyres burn (u.settle, m, and a
   slight tilt u.wtP / u.wtR for the render pose) */
function wreckStep(sim, u) {
  const map = sim.map;
  let x = u.pos[0], z = u.pos[2];
  if (u.speed > 0) {
    u.speed = Math.max(0, u.speed - 4 * DT);
    const nx = x + Math.sin(u.hdg) * u.speed * DT, nz = z + Math.cos(u.hdg) * u.speed * DT;
    if (map.h(nx, nz) >= .3) { x = nx; z = nz; } else u.speed = 0;
  }
  const e = 3, gx = (map.h(x + e, z) - map.h(x - e, z)) / (2 * e), gz = (map.h(x, z + e) - map.h(x, z - e)) / (2 * e), gs = Math.hypot(gx, gz);
  const a = G * (gs - .35) / Math.sqrt(1 + gs * gs);
  const sv = u.sv = a > 0 ? (u.sv || 0) + a * DT : Math.max(0, (u.sv || 0) - 3 * DT);
  if (sv > 0 && gs > 1e-4) {
    const nx = x - gx / gs * sv * DT, nz = z - gz / gs * sv * DT;
    if (map.h(nx, nz) >= .3) { x = nx; z = nz; } else u.sv = 0;
  }
  u.pos[0] = x; u.pos[2] = z; u.pos[1] = Math.max(0, map.h(x, z));
  u.settle = .4 * Math.min(1, u.dying * 5);
  if (u.wtP === undefined) { u.wtP = (hash01(u.id, 3) - .5) * .07; u.wtR = (hash01(u.id, 4) - .5) * .09; }
}
