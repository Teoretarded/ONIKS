/* Weapons as game stats. Launchers fire projectiles that fly simple kinematic paths with phases
   (launch -> climb -> cruise -> final) so the renderer can show them; guns fire bursts that are resolved at once.
   Defensive weapons fire by themselves at incoming rounds and aircraft in range; offensive weapons fire at an
   explicit attack target, or pick their own targets when the unit is on hold. Every shot rolls its hit chance. */
import { PROJ, CLASSIFY, ENEMY, TEL_ELEV } from '../data/units.js';
import { DT } from './consts.js';
import { applyDamage } from './damage.js';
import { launchSeen, radarWorks, torpedoHeard } from './sensors.js';
import { gauss } from './rand.js';
import { clamp, angTo, local, closest, ground, dxz, d3 } from './util.js';
import { atPD, submerged, isSub } from './subs.js';
import { elevOf } from './mech.js';

const G = 9.81;
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

/* ---------- target choice and firing (every SENSE_EVERY ticks) ---------- */
const THREATS = { coast: [], fleet: [] }, INB = { coast: new Map(), fleet: new Map() };
export function weaponsTick(sim) {
  const list = sim.list(), t = sim.t;
  THREATS.coast.length = 0; THREATS.fleet.length = 0; INB.coast.clear(); INB.fleet.clear();
  for (const p of sim.projectiles.values()) {
    if (!p.alive || !(p.P.threat || p.P.torpedo)) continue;
    const foe = p.side === 'coast' ? 'fleet' : 'coast';
    if (p.P.threat && t - p.seen[foe] <= 1.01) THREATS[foe].push(p);
    if (p.tk === 'unit') INB[p.side].set(p.target, (INB[p.side].get(p.target) || 0) + 1);
  }
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (!u.alive || u.aboard) continue;
    const W = u.def.weapons;
    for (const wn in W) {
      const w = W[wn];
      if (u.ammo[wn] <= 0 || u.cooldowns[wn] > 0 || u.off[wn]) continue;
      if (w.mounts && w.mounts.every(m => u.off[m])) continue;
      if (w.needsRadar && !radarWorks(u)) continue;
      if (w.sub && isSub(u) && !atPD(u)) continue;               // missiles leave a boat from periscope depth
      if (w.auto && autoFire(sim, u, w)) continue;
      if (w.vs.includes('land') || w.vs.includes('sea') || w.vs.includes('sub')) offensive(sim, u, w);
    }
  }
}

function threatsFor(sim, u, w) {
  const side = u.side, t = sim.t, ux = u.pos[0], uy = u.pos[1], uz = u.pos[2];
  let best = null, bs = 1e18;
  if (!w.vs.includes('missile')) return null;
  const list = THREATS[side];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    const d = Math.sqrt((p.pos[0] - ux) ** 2 + (p.pos[1] - uy) ** 2 + (p.pos[2] - uz) ** 2);
    if (d > w.range || d < (w.min || 0)) continue;
    if (!w.gun && (p.eng >= (w.maxEng || 2) || p.shots >= (w.maxShots || 99))) continue;
    if (w.gun && dxz(p.aim[0], p.aim[2], ux, uz) > w.range * 3 && d > w.range * .6) continue;   // guns guard the ship itself
    const tgo = Math.sqrt((p.aim[0] - p.pos[0]) ** 2 + (p.aim[2] - p.pos[2]) ** 2) / Math.max(50, p.spd);
    const s = tgo + d / 5000 + p.eng * 30;
    if (s < bs) { bs = s; best = p; }
  }
  return best;
}
function aircraftFor(sim, u, w) {
  if (!w.vs.includes('air')) return null;
  const S = sim.sides[u.side], t = sim.t;
  let best = null, bd = 1e18;
  for (const c of S.contacts.values()) {
    if (c.dom !== 'air' || c.dead || c.conf < CLASSIFY || t - c.lastSeen > 5) continue;
    const e = sim.units.get(c.unitId);
    if (!e || !e.alive || e.aboard) continue;
    const d = Math.sqrt((c.pos[0] - u.pos[0]) ** 2 + (c.pos[1] - u.pos[1]) ** 2 + (c.pos[2] - u.pos[2]) ** 2);
    if (d > (w.airRange || w.range) || d < (w.min || 0)) continue;
    if (!w.gun && e.eng >= (w.maxEng || 1)) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function autoFire(sim, u, w) {
  const p = threatsFor(sim, u, w);
  if (p) { if (w.gun) burst(sim, u, w, p, true); else launch(sim, u, w, p.id, 'proj', p.pos); return true; }
  const e = aircraftFor(sim, u, w);
  if (e) { if (w.gun) burst(sim, u, w, e, false); else launch(sim, u, w, e.id, 'unit', e.pos); return true; }
  return false;
}

const PRIO = { HQ: 10, CVN: 9, TEL: 8, DDG: 7, SSN: 7, SSK: 7, SAM: 6, RADAR: 6, TLV: 4, AEW: 3, 'UAV-L': 3, HELO: 2, FTR: 1, UAV: 1 };
function offensive(sim, u, w) {
  const S = sim.sides[u.side], o = u.orders[0];
  let c = null;
  if (o && o.kind === 'attack') {
    const cc = S.contacts.get(o.target);
    if (cc && !cc.dead && cc.conf >= CLASSIFY && w.vs.includes(cc.dom) && (o.w === w.name || !o.w)) c = cc;
    if (!c) return;
    if ((o.fired || 0) >= (o.n || w.salvo || 1)) return;
  } else if (u.hold) {
    let bs = -1e18;
    for (const cc of S.contacts.values()) {
      if (cc.dead || cc.conf < CLASSIFY || !w.vs.includes(cc.dom)) continue;
      const d = dxz(u.pos[0], u.pos[2], cc.pos[0], cc.pos[2]);
      if (d > w.range || d < (w.min || 0)) continue;
      const s = (PRIO[cc.cls] || 1) * 10 - d / 10000 - (INB[u.side].get(cc.unitId) || 0) * 15;
      if (s > bs) { bs = s; c = cc; }
    }
    if (!c) return;
    if (w.proj !== 'shell' && (INB[u.side].get(c.unitId) || 0) >= (c.dom === 'sea' ? 4 : 2)) return;
  } else return;
  const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]);
  if (d > w.range || d < (w.min || 0)) return;
  if (w.needs === 'erect' && (u.elev < elevOf(u.def) - 1e-6 || u.dep < 1 || u.reloader)) return;
  if (u.def.domain === 'air' && u.aboard) return;
  const p = launch(sim, u, w, c.unitId, 'unit', c.pos);
  if (p.P.threat || p.P.torpedo) INB[u.side].set(c.unitId, (INB[u.side].get(c.unitId) || 0) + 1);
  if (o && o.kind === 'attack') o.fired = (o.fired || 0) + 1;
}

/* missiles already flying at a unit (side's own count) */
export function inbound(sim, side, unitId) {
  let n = 0;
  for (const p of sim.projectiles.values()) if (p.alive && p.side === side && p.tk === 'unit' && p.target === unitId && (p.P.threat || p.P.torpedo)) n++;
  return n;
}

/* ---------- guns: a burst is resolved at once ---------- */
function burst(sim, u, w, tgt, isProj) {
  const wn = w.name;
  u.ammo[wn]--;
  let alive = 1;
  if (w.mounts) { alive = w.mounts.filter(m => !u.off[m]).length / w.mounts.length; }
  u.cooldowns[wn] = w.cd / Math.max(.5, alive);
  let mz = w.muzzle ? local(u, w.muzzle) : [u.pos[0], u.pos[1] + 12, u.pos[2]], mount = 0;
  if (w.mounts) {
    // the Phalanx facing the target: fwd for targets ahead, aft for targets behind
    const b = Math.atan2(tgt.pos[0] - u.pos[0], tgt.pos[2] - u.pos[2]);
    mount = Math.abs(angTo(u.hdg, b)) < Math.PI / 2 ? 0 : 1;
    if (u.off[w.mounts[mount]]) mount ^= 1;
    mz = local(u, mount === 0 ? [0, 16, 52] : [0, 13, -48]);
    u.cYaw[mount] = angTo(u.hdg, b) - (mount ? Math.PI : 0);
    u.cPitch[mount] = Math.atan2(tgt.pos[1] - mz[1], Math.max(1, dxz(mz[0], mz[2], tgt.pos[0], tgt.pos[2])));
  }
  aimTurret(u, tgt.pos);
  u.fireT = sim.t; u.lastFire = sim.t;
  const pk = isProj ? w.pk.missile : w.pk.air;
  const hit = sim.rng.fire() < pk;
  sim.emit('gunfire', { unit: u.id, side: u.side, weapon: wn, pos: mz, to: tgt.pos.slice(), dur: w.burst || 1, hit, target: tgt.id, tk: isProj ? 'proj' : 'unit', mount });
  if (!hit) return;
  if (isProj) killProj(sim, tgt, 'intercept', { by: u.id, byKind: wn, unit: u.id });
  else { sim.emit('hit', { pos: tgt.pos.slice(), target: tgt.id, kind: wn, side: u.side, from: u.id }); applyDamage(sim, tgt, w.dmg, u); }
}

function aimTurret(u, p) {
  u.aimB = Math.atan2(p[0] - u.pos[0], p[2] - u.pos[2]);
  u.aimP = clamp(Math.atan2(p[1] - u.pos[1], Math.max(1, dxz(u.pos[0], u.pos[2], p[0], p[2]))), 0, 1.4);
}

/* ---------- launches ---------- */
export function launch(sim, u, w, target, tk, aimAt) {
  const P = PROJ[w.proj], t = sim.t, wn = w.name;
  const before = u.ammo[wn];
  u.ammo[wn]--; u.cooldowns[wn] = w.cd; u.lastFire = t;
  sim.sides[u.side].fired++;
  let pos, hdg = Math.atan2(aimAt[0] - u.pos[0], aimAt[2] - u.pos[2]), pitch, spd = P.v0 || 0;
  if (P.torpedo) {
    // torpedoes: dropped from an aircraft, out of a ship's side tubes, or from a boat's bow tubes at its depth
    if (u.def.domain === 'air') pos = [u.pos[0], u.pos[1] - 2, u.pos[2]];
    else if (isSub(u)) pos = local(u, [0, -u.def.draught * .45, u.def.size[0] * .36]);
    else pos = local(u, w.muzzle ? [(before % 2 ? -1 : 1) * w.muzzle[0], 0, w.muzzle[2]] : [0, 0, 0]);
    pitch = 0; spd = u.def.domain === 'air' ? 0 : 12;
  } else if (u.def.domain === 'air') {
    pos = [u.pos[0], u.pos[1] - 2, u.pos[2]]; pitch = Math.min(0, u.pitch) - .03; spd = Math.max(spd, u.speed);
    if (P.mode === 'direct') hdg = u.hdg + clamp(angTo(u.hdg, hdg), -.6, .6); else hdg = u.hdg;
  } else if (w.vls && u.def.vlsAt) {
    // a boat's vertical tubes: the round broaches from the cell and climbs out of the water
    const cell = u.vlsNext++ % u.def.vlsAt.length;
    pos = local(u, u.def.vlsAt[cell]); pos[1] = Math.max(pos[1], .5); pitch = Math.PI / 2;
    u.vlsOpen.push([cell, 0]); u.vlsT.push(t);
    u.fireT = t;
  } else if (w.sub && isSub(u)) {
    // missiles out of a boat's torpedo tubes: the capsule broaches over the bow, the round rises from the water
    pos = local(u, [0, 0, u.def.size[0] * .42]); pos[1] = .5; pitch = Math.PI / 2;
  } else if (w.vls) {
    const cell = u.vlsNext++ % 96;
    const zc = cell < 32 ? 38.9 + ((3 - Math.floor(cell / 8)) - 1.5) * .85 : -29.4 + ((7 - Math.floor((cell - 32) / 8)) - 3.5) * .85;
    const xc = ((cell % 8) >> 1) * 2.1 - 3.15 + (cell & 1 ? .72 : -.72);
    pos = local(u, [xc, 8.5, zc]); pitch = Math.PI / 2;
    u.vlsOpen.push([cell, 0]); u.vlsT.push(t);
    u.fireT = t;
  } else if (w.needs === 'erect' && u.def.pack) {
    // Bal: the round leaves the rear end of its container, over the back of the raised pack
    const K = u.def.pack, k = Math.max(0, Math.min(K.order.length - 1, K.order.length - before)), [r, c] = K.order[k];
    const a = u.elev, dy = K.rows[r], dz = -K.len - .2, ca = Math.cos(a), sa = Math.sin(a);
    pos = local(u, [K.cols[c], K.piv[1] + ca * dy - sa * dz, K.piv[2] + sa * dy + ca * dz]);
    hdg = u.hdg + Math.PI; pitch = a;
  } else if (w.needs === 'erect') {
    const tube = 2 - before;                    // first round from the right tube
    const side = tube === 0 ? 1 : -1;
    pos = local(u, [side * w.muzzle[0], w.muzzle[1], w.muzzle[2]]); pitch = Math.PI / 2;
    u.caps[Math.max(0, Math.min(1, tube))] = 1;
  } else {
    pos = w.muzzle ? local(u, w.muzzle) : [u.pos[0], u.pos[1] + 5, u.pos[2]];
    pitch = P.vert > 0 ? Math.PI / 2 : .35;
    aimTurret(u, aimAt);
    if (u.type === 'pantsir') { hdg = u.aimB; pitch = Math.max(.2, u.aimP + .15); }
  }
  const p = {
    id: sim.nextId++, kind: w.proj, side: u.side, P,
    pos, prev: pos.slice(), vel: [0, 0, 0], from: u.id, fromPos: pos.slice(), target, tk,
    aim: [aimAt[0], aimAt[1], aimAt[2]], phase: 'launch', t0: t, age: 0, alive: true, st: { booster: true, wing: 0, fin: 0 },
    spd, spd0: spd, hdg, pitch, eng: 0, shots: 0, minD: 1e9, seen: { coast: -1e9, fleet: -1e9 }, locked: false, sep: false,
    maxT: (w.range / P.speed) * 1.8 + (P.vert || 0) + (P.boost || 0) + 20, ball: null,
    gA: undefined, gL: null, gLx: 0, gLz: 0, gLmax: 0, gFl: -9, depth: 0,    // terrain look-ahead; torpedo depth
  };
  p.seen[u.side] = t;
  if (tk === 'proj') { const q = sim.projectiles.get(target); if (q) { q.eng++; q.shots++; } }
  else if (!P.threat) { const e = sim.units.get(target); if (e) e.eng++; }
  if (P.mode === 'ballistic') setupShell(sim, p, u, aimAt);
  if (P.mode === 'direct' && P.threat) p.locked = true;
  setVel(p);
  sim.projectiles.set(p.id, p);
  sim.emit('launch', { proj: p.id, kind: p.kind, side: u.side, from: u.id, target, tk, pos: pos.slice(), hdg, pitch, weapon: wn });
  if (P.threat || P.mode === 'ballistic') launchSeen(sim, u);
  if (P.torpedo) { p.depth = isSub(u) ? Math.max(20, -pos[1]) : 0; torpedoHeard(sim, u); }
  return p;
}

function setVel(p) {
  const cp = Math.cos(p.pitch);
  p.vel[0] = p.spd * Math.sin(p.hdg) * cp; p.vel[1] = p.spd * Math.sin(p.pitch); p.vel[2] = p.spd * Math.cos(p.hdg) * cp;
}

function setupShell(sim, p, u, aimAt) {
  const r = sim.rng.fire, S = p.P.sigma;
  const e = sim.units.get(p.target), c = sim.sides[u.side].contacts.get(p.target);
  const v = p.P.speed, R0 = dxz(p.pos[0], p.pos[2], aimAt[0], aimAt[2]);
  const th = .5 * Math.asin(Math.min(1, G * R0 / (v * v))), tof = R0 / (v * Math.cos(th));
  // aim where the track will be after the time of flight, then add dispersion
  let ix = aimAt[0] + (c ? c.vel[0] * tof : 0) + gauss(r) * (S + R0 * .003), iz = aimAt[2] + (c ? c.vel[2] * tof : 0) + gauss(r) * (S + R0 * .003);
  const iy = Math.max(0, sim.map.h(ix, iz));
  const R = dxz(p.pos[0], p.pos[2], ix, iz), T = Math.max(.5, R / (v * Math.cos(th)));
  const vx = (ix - p.pos[0]) / T, vz = (iz - p.pos[2]) / T, vy = (iy - p.pos[1] + .5 * G * T * T) / T;
  p.ball = { p0: p.pos.slice(), v: [vx, vy, vz], T, imp: [ix, iy, iz] };
  p.spd = Math.sqrt(vx * vx + vy * vy + vz * vz); p.hdg = Math.atan2(vx, vz); p.pitch = Math.atan2(vy, Math.sqrt(vx * vx + vz * vz));
  p.aim = [ix, iy, iz]; p.phase = 'cruise';
  if (e) aimTurret(u, e.pos);
  u.fireT = sim.t;
}

/* ---------- terrain look-ahead ----------
   The ground along the next ~2 km of the track (sampled 5x a second). The climb angle that clears the highest of it
   by `clr` metres is a floor on the round's pitch: it starts climbing early and smoothly for a cliff ahead instead
   of flying into it. Only ground short of the aim point counts (maxD), so a round still comes down on its target. */
const LOOK = [120, 250, 400, 600, 850, 1100, 1400, 1750, 2100];
function lookAhead(sim, p) {
  const vh = Math.sqrt(p.vel[0] * p.vel[0] + p.vel[2] * p.vel[2]);
  const ux = vh > 1 ? p.vel[0] / vh : Math.sin(p.hdg), uz = vh > 1 ? p.vel[2] / vh : Math.cos(p.hdg);
  if (!p.gL) p.gL = new Float32Array(LOOK.length);
  let mx = 0;
  for (let i = 0; i < LOOK.length; i++) { const g = ground(sim.map, p.pos[0] + ux * LOOK[i], p.pos[2] + uz * LOOK[i]); p.gL[i] = g; if (g > mx) mx = g; }
  p.gLx = p.pos[0]; p.gLz = p.pos[2]; p.gLmax = mx;
}
function clearAngle(p, clr, maxD) {
  if (!p.gL || p.pos[1] > p.gLmax + clr + 250) return -9;           // well clear of everything ahead
  const mx = p.pos[0] - p.gLx, mz = p.pos[2] - p.gLz, moved = Math.sqrt(mx * mx + mz * mz), y = p.pos[1] - clr;
  let k = -1e9;
  for (let i = 0; i < LOOK.length; i++) {
    const d = LOOK[i] - moved;
    if (d < 40 || d > maxD) continue;
    const s = (p.gL[i] - y) / d;
    if (s > k) k = s;
  }
  return k === -1e9 ? -9 : Math.atan(k);
}

/* ---------- projectile flight and resolution (every tick) ---------- */
export function stepProjectiles(sim) {
  if (!sim.projectiles.size) return;
  const dead = [];
  for (const p of sim.projectiles.values()) {
    if (!p.alive) { dead.push(p.id); continue; }
    stepOne(sim, p);
    if (!p.alive) dead.push(p.id);
  }
  for (const id of dead) sim.projectiles.delete(id);
}

function stepOne(sim, p) {
  const P = p.P, map = sim.map;
  p.age += DT;
  if (P.mode === 'ballistic') {
    const b = p.ball, a = Math.min(p.age, b.T);
    p.pos[0] = b.p0[0] + b.v[0] * a; p.pos[1] = b.p0[1] + b.v[1] * a - .5 * G * a * a; p.pos[2] = b.p0[2] + b.v[2] * a;
    p.vel[0] = b.v[0]; p.vel[1] = b.v[1] - G * a; p.vel[2] = b.v[2];
    if (p.age >= b.T) shellImpact(sim, p);
    return;
  }
  if (P.mode === 'run') { stepTorpedo(sim, p); if (p.alive && p.age > p.maxT) endTorpedo(sim, p, 'selfdestruct'); return; }
  // target and aim point
  let tgt = null;
  if (p.tk === 'proj') {
    tgt = sim.projectiles.get(p.target);
    if (!tgt || !tgt.alive) { tgt = retarget(sim, p); if (!tgt) { selfDestruct(sim, p); return; } }
  } else {
    tgt = sim.units.get(p.target);
    if (tgt && (!tgt.alive || tgt.aboard || submerged(tgt))) tgt = null;     // a boat that dives is out of a missile's reach
  }
  if (P.mode === 'direct') {
    if (tgt) {
      const d = Math.sqrt((tgt.pos[0] - p.pos[0]) ** 2 + (tgt.pos[1] - p.pos[1]) ** 2 + (tgt.pos[2] - p.pos[2]) ** 2);
      const tgo = clamp(d / Math.max(200, p.spd), 0, 25);
      const vx = (tgt.pos[0] - tgt.prev[0]) / DT, vy = (tgt.pos[1] - tgt.prev[1]) / DT, vz = (tgt.pos[2] - tgt.prev[2]) / DT;
      p.aim[0] = tgt.pos[0] + vx * tgo; p.aim[1] = tgt.pos[1] + vy * tgo + (p.tk === 'unit' && tgt.def.domain !== 'air' ? tgt.def.size[2] * .5 : 0); p.aim[2] = tgt.pos[2] + vz * tgo;
      // never lead into the ground or the sea (sea-skimmers)
      const ga = ground(map, p.aim[0], p.aim[2]) + 4;
      if (p.aim[1] < ga) p.aim[1] = Math.max(ga, Math.min(tgt.pos[1], ga + 20));
    }
  } else {
    // cruise: fly to the side's track of the target; in the final leg, reach the target if it is near the aim point
    if (!p.locked) {
      const c = sim.sides[p.side].contacts.get(p.target);
      if (c && !c.dead) { p.aim[0] = c.pos[0]; p.aim[2] = c.pos[2]; }
      if (tgt && p.phase === 'final' && dxz(p.pos[0], p.pos[2], p.aim[0], p.aim[2]) < Math.max(P.reach * 2.5, 8000)
        && dxz(tgt.pos[0], tgt.pos[2], p.aim[0], p.aim[2]) < P.reach) p.locked = true;
    }
    if (p.locked && tgt) { p.aim[0] = tgt.pos[0]; p.aim[1] = tgt.pos[1] + tgt.def.size[2] * .4; p.aim[2] = tgt.pos[2]; }
    else if (p.locked && !tgt) p.locked = false;
  }
  // speed
  if (p.age < (P.boost || 0)) p.spd = p.spd0 + (P.speed - p.spd0) * ease(p.age / P.boost);
  else p.spd = P.speed;
  // steering
  const dx = p.aim[0] - p.pos[0], dz = p.aim[2] - p.pos[2], dist = Math.sqrt(dx * dx + dz * dz);
  if (p.age >= (P.vert || 0)) {
    const hT = Math.atan2(dx, dz);
    const bend = ease((p.age - (P.vert || 0)) / 2.5);           // gentle, round pitch-over after the vertical rise
    // terrain ahead (2 s and 4 s, and the next 2 km of the track; refreshed 5x a second): everything keeps clear of
    // the ground until the last stretch
    const g0 = ground(map, p.pos[0], p.pos[2]);
    const fresh = (sim.tick + p.id) % 4 === 0 || p.gA === undefined;
    if (fresh) {
      p.gA = Math.max(ground(map, p.pos[0] + p.vel[0] * 2, p.pos[2] + p.vel[2] * 2), ground(map, p.pos[0] + p.vel[0] * 4, p.pos[2] + p.vel[2] * 4));
      // the 2 km look-ahead: 2.5 times a second, and only for rounds low enough for the ground to matter
      if (P.look !== 0 && (!p.gL || ((sim.tick + p.id) % 8 === 0 && p.pos[1] < p.gA + 800))) lookAhead(sim, p);
    }
    const gA = Math.max(g0, p.gA);
    const near = Math.max(1200, p.spd * 2.5);
    let pT;
    if (P.mode === 'direct') {
      const ay = dist > near ? Math.max(p.aim[1], gA + 50) : p.aim[1];
      pT = Math.atan2(ay - p.pos[1], Math.max(1, dist));
      if (p.pos[1] < gA + 25 && dist > near) pT = Math.max(pT, .12);
      if (dist > near && P.look !== 0) {
        if (fresh) p.gFl = clearAngle(p, 25, dist - 200);         // the floor 5x a second (the pitch rate smooths it)
        if (p.gFl > pT) pT = Math.min(p.gFl, 1.2);
      }
      p.phase = p.age < (P.boost || 0) ? 'climb' : dist < 3000 ? 'final' : 'cruise';
    } else {
      const g = gA;
      const final = dist < P.finalDist;
      let yT;
      if (final) {
        yT = Math.max(g, g0) + P.finalAlt;
        p.phase = 'final';
        if (p.locked || dist < p.spd * 3) yT = dist > near ? Math.max(p.aim[1], g + P.finalAlt) : p.aim[1];
      } else {
        // sea-skimmers drop to the wave tops once they are out over open water
        const sea = P.seaAlt && g <= 0 && g0 <= 0 && dxz(p.pos[0], p.pos[2], p.fromPos[0], p.fromPos[2]) > 6000;
        yT = Math.max(g, g0) + (sea ? P.seaAlt : P.alt);
        p.phase = p.pos[1] < yT - 200 && p.pitch > .05 ? 'climb' : 'cruise';
      }
      const look = final && dist < near ? Math.max(1, dist) : p.spd * 4;
      pT = clamp(Math.atan2(yT - p.pos[1], look), -P.pitchMax - (final ? .3 : 0), P.pitchMax);
      if (p.pos[1] < g + 15 && dist > near) pT = Math.max(pT, .1);
      // cliffs short of the aim point: climb early enough to clear the highest ground of the next 2 km
      const clr = dist < near ? 8 : Math.max(12, final ? P.finalAlt : P.seaAlt && g <= 0 ? P.seaAlt : P.alt);
      if (fresh) p.gFl = P.look === 0 ? -9 : clearAngle(p, clr, dist - (dist < near ? 250 : 150));   // look: 0 switches it off (experiments)
      if (p.gFl > pT) pT = Math.min(p.gFl, P.pitchMax + .25);
    }
    if (p.age < (P.vert || 0) + .01 && P.vert) p.phase = 'climb';
    const tr = P.turn * DT * (P.vert ? Math.max(.15, bend) : 1), pr = P.pitchRate * DT * (P.vert ? Math.max(.1, bend) : 1);
    p.hdg += clamp(angTo(p.hdg, hT), -tr, tr);
    p.pitch += clamp(pT - p.pitch, -pr, pr);
  } else p.phase = 'launch';
  setVel(p);
  p.pos[0] += p.vel[0] * DT; p.pos[1] += p.vel[1] * DT; p.pos[2] += p.vel[2] * DT;
  // stage events and model state
  if (P.sepAt && !p.sep && p.age >= P.sepAt) {
    p.sep = true; p.st.booster = false;
    sim.emit('booster_sep', { proj: p.id, kind: p.kind, side: p.side, pos: p.pos.slice(), vel: p.vel.slice() });
  }
  p.st.wing = ease((p.age - (P.vert || 0) - .5) / 1.5); p.st.fin = ease((p.age - (P.vert || 0)) / .8); p.st.cover = p.age < .3; p.st.inlet = p.st.wing;
  // resolution
  const g = p.pos[1] > p.gA + 150 ? 0 : ground(map, p.pos[0], p.pos[2]);     // far above the terrain ahead: no contact possible
  // an engagement resolves when the missile passes its target: inside the hit box, or it got within reach and is now
  // opening (the hit chance decides; no circling back)
  if (p.tk === 'proj' || (!P.threat && tgt)) {
    if (tgt) {
      const dd = Math.sqrt((tgt.pos[0] - p.pos[0]) ** 2 + (tgt.pos[1] - p.pos[1]) ** 2 + (tgt.pos[2] - p.pos[2]) ** 2);
      if (closest(p, tgt) < 45 || (p.minD < 250 && dd > p.minD + 1)) return interceptRoll(sim, p, tgt);
      if (dd < p.minD) p.minD = dd;
    }
  } else if (P.threat) {
    if (p.locked && tgt) {
      const dd = Math.sqrt((tgt.pos[0] - p.pos[0]) ** 2 + (tgt.pos[1] - p.pos[1]) ** 2 + (tgt.pos[2] - p.pos[2]) ** 2);
      if (closest(p, tgt) < Math.max(12, tgt.def.size[1] * .6) || (p.minD < 300 && dd > p.minD + 1)) return impactRoll(sim, p, tgt);
      if (dd < p.minD) p.minD = dd;
    }
    if (!p.locked && p.phase === 'final' && dist < Math.max(30, p.spd * DT * 1.2) && p.age > 3) {
      splash(sim, p, [p.aim[0], Math.max(0, map.h(p.aim[0], p.aim[2])), p.aim[2]], false, tgt ? 'moved' : 'lost');
      return;
    }
  }
  if (p.pos[1] < g + 1) {
    // interceptors skim, they never fly into the ground; strike missiles in their final dive do
    if (P.threat && p.age > (P.vert || 0) + 2 && p.phase === 'final') { splash(sim, p, [p.pos[0], g, p.pos[2]], false, 'terrain'); return; }
    p.pos[1] = g + 1;
    if (p.pitch < 0) p.pitch = 0;
  }
  if (p.age > p.maxT) selfDestruct(sim, p);
}

/* ---------- torpedoes ----------
   A dropped torpedo falls into the sea first; then it runs at depth toward the side's track of its target (the aim
   point), and closes on the target itself once the target is within reach of the aim point and near. It resolves
   as it passes the target (the hit chance decides), or ends on the bottom / a shore or when its run is spent.
   Not drawn (under water); the other side hears it (sensors.sonarTick). */
function stepTorpedo(sim, p) {
  const P = p.P, map = sim.map;
  let tgt = sim.units.get(p.target);
  if (tgt && (!tgt.alive || tgt.def.domain !== 'sea')) tgt = null;
  if (p.pos[1] > -3 && p.phase === 'launch') {
    // into the water (off a helicopter: on its parachute)
    p.pos[1] -= (p.pos[1] > 0 ? 18 : 4) * DT;
    p.vel[0] = 0; p.vel[1] = -10; p.vel[2] = 0;
    return;
  }
  if (p.phase === 'launch') p.phase = 'cruise';
  if (!p.locked) {
    const c = sim.sides[p.side].contacts.get(p.target);
    if (c && !c.dead) { p.aim[0] = c.pos[0]; p.aim[2] = c.pos[2]; }
    if (tgt && dxz(tgt.pos[0], tgt.pos[2], p.aim[0], p.aim[2]) < P.reach && dxz(p.pos[0], p.pos[2], tgt.pos[0], tgt.pos[2]) < P.reach * 2) p.locked = true;
  }
  if (p.locked && tgt) { p.aim[0] = tgt.pos[0]; p.aim[2] = tgt.pos[2]; p.phase = 'final'; }
  else if (p.locked) p.locked = false;
  p.spd = Math.min(P.speed, (p.spd || 0) + 3 * DT);
  const dx = p.aim[0] - p.pos[0], dz = p.aim[2] - p.pos[2], dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 20) p.hdg += clamp(angTo(p.hdg, Math.atan2(dx, dz)), -.3 * DT, .3 * DT);
  // depth: a boat's own depth when chasing one, shallow under a ship; never into the bottom
  const floor = map.h(p.pos[0], p.pos[2]);
  let yT = tgt && p.locked && tgt.def.sub ? tgt.pos[1] - 4 : -Math.min(P.depth, 12);
  yT = Math.max(yT, floor + 6);
  const vy = clamp(yT - p.pos[1], -4, 4);
  p.vel[0] = Math.sin(p.hdg) * p.spd; p.vel[1] = vy; p.vel[2] = Math.cos(p.hdg) * p.spd;
  p.pos[0] += p.vel[0] * DT; p.pos[1] = Math.min(-2, p.pos[1] + vy * DT); p.pos[2] += p.vel[2] * DT;
  if (map.h(p.pos[0], p.pos[2]) > -4) { endTorpedo(sim, p, 'terrain'); return; }           // ran into the shallows
  if (p.locked && tgt) {
    const dd = Math.sqrt((tgt.pos[0] - p.pos[0]) ** 2 + (tgt.pos[1] - p.pos[1]) ** 2 + (tgt.pos[2] - p.pos[2]) ** 2);
    if (closest(p, tgt) < Math.max(15, tgt.def.size[1] * .8) || (p.minD < 120 && dd > p.minD + 1)) {
      if (sim.rng.fire() < P.pk) {
        const pos = [tgt.pos[0], .5, tgt.pos[2]];
        sim.emit('hit', { pos, target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, under: true });
        killProj(sim, p, null);
        applyDamage(sim, tgt, P.dmg, sim.units.get(p.from));
      } else endTorpedo(sim, p, 'pk');
      return;
    }
    if (dd < p.minD) p.minD = dd;
  } else if (dist < 60 && p.age > 10) endTorpedo(sim, p, tgt ? 'moved' : 'lost');
}
/* a torpedo that ran out or missed: no splash (it ends under the water) */
function endTorpedo(sim, p, why) {
  sim.emit('torpedo_end', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, why });
  killProj(sim, p, null);
}

function retarget(sim, p) {
  let best = null, bd = 12000;
  for (const q of sim.projectiles.values()) {
    if (!q.alive || q.side === p.side || !q.P.threat) continue;
    if (sim.t - q.seen[p.side] > 1.01 || q.eng >= 2 || q.shots >= 4) continue;
    const d = Math.sqrt((q.pos[0] - p.pos[0]) ** 2 + (q.pos[1] - p.pos[1]) ** 2 + (q.pos[2] - p.pos[2]) ** 2);
    if (d < bd) { bd = d; best = q; }
  }
  if (best) { p.target = best.id; best.eng++; best.shots++; p.minD = 1e9; }
  return best;
}

function interceptRoll(sim, p, tgt) {
  const pk = typeof p.P.pk === 'number' ? p.P.pk : (p.tk === 'proj' ? p.P.pk.missile : p.P.pk.air);
  const mid = [(p.pos[0] + tgt.pos[0]) / 2, (p.pos[1] + tgt.pos[1]) / 2, (p.pos[2] + tgt.pos[2]) / 2];
  if (sim.rng.fire() < pk) {
    if (p.tk === 'proj') { killProj(sim, tgt, 'intercept', { by: p.id, byKind: p.kind, unit: p.from, pos: mid }); killProj(sim, p, null); }
    else {
      sim.emit('hit', { pos: tgt.pos.slice(), target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id });
      killProj(sim, p, null);
      applyDamage(sim, tgt, p.P.dmg, sim.units.get(p.from));
    }
  } else {
    sim.emit('splash', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, air: true, miss: true, why: 'pk' });
    killProj(sim, p, null);
  }
}

function impactRoll(sim, p, tgt) {
  if (sim.rng.fire() < p.P.pk) {
    const pos = [p.pos[0], Math.max(p.pos[1], tgt.pos[1] + 2), p.pos[2]];
    sim.emit('hit', { pos, target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id });
    killProj(sim, p, null);
    applyDamage(sim, tgt, p.P.dmg, sim.units.get(p.from));
  } else {
    const r = sim.rng.fire, a = r() * Math.PI * 2, d = 40 + r() * 80;
    const x = tgt.pos[0] + Math.sin(a) * d, z = tgt.pos[2] + Math.cos(a) * d;
    splash(sim, p, [x, Math.max(0, sim.map.h(x, z)), z], false, 'pk');
  }
}

function shellImpact(sim, p) {
  const b = p.ball, tgt = sim.units.get(p.target);
  if (tgt && tgt.alive) {
    const L = tgt.def.size[0] * .5, W = tgt.def.size[1] * .5 + 8;
    // distance in the target's frame (ships are long)
    const dx = b.imp[0] - tgt.pos[0], dz = b.imp[2] - tgt.pos[2], s = Math.sin(tgt.hdg), c = Math.cos(tgt.hdg);
    const along = dx * s + dz * c, across = dx * c - dz * s;
    if (Math.abs(along) < L + 8 && Math.abs(across) < W) {
      sim.emit('hit', { pos: [b.imp[0], tgt.pos[1] + 3, b.imp[2]], target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id });
      killProj(sim, p, null);
      applyDamage(sim, tgt, p.P.dmg, sim.units.get(p.from));
      return;
    }
  }
  splash(sim, p, b.imp.slice(), false, 'short');
}

function splash(sim, p, pos, air, why) {
  sim.emit('splash', { pos, kind: p.kind, side: p.side, proj: p.id, air: !!air, water: !air && sim.map.h(pos[0], pos[2]) < 0, why: why || '' });
  killProj(sim, p, null);
}
function selfDestruct(sim, p) {
  sim.emit('splash', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, air: p.pos[1] > 30, miss: true, why: 'selfdestruct' });
  killProj(sim, p, null);
}

export function killProj(sim, p, how, info) {
  if (!p.alive) return;
  p.alive = false;
  if (p.tk === 'proj') { const q = sim.projectiles.get(p.target); if (q && q.eng > 0) q.eng--; }
  else if (!p.P.threat) { const e = sim.units.get(p.target); if (e && e.eng > 0) e.eng--; }
  if (how === 'intercept') {
    sim.emit('intercept', { pos: info.pos || p.pos.slice(), proj: p.id, kind: p.kind, side: p.side, by: info.by, byKind: info.byKind, unit: info.unit, target: p.target });
  }
}
