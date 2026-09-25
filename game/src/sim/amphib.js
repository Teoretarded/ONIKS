/* Amphibious operations: the LHD's well deck, the LCAC hovercraft, the landing force, the command post overrun.

   Carrying: a carried unit has `aboard` = its host's id (like aircraft on a deck: not seen, not hit, holds no ground,
   its orders wait). An LHD (def.carry { craft, veh }) holds LCACs in its well deck (def.well.slots, u.slot) and ACVs
   on its vehicle decks; an LCAC (def.carry { veh }) holds two ACVs on its cargo deck. carried(sim, host) lists them.
   Vehicles on the vehicle decks load into the LCACs docked in the well by themselves (one every def.well.load s).

   The well deck (wellStep, per tick for def.well): an LCAC that has somewhere to go asks for the gate (requestWell,
   renewed every tick by its order); the ship slows to def.well.slow, lowers the stern gate (u.well 0..1 over
   def.well.open s) and ballasts down (def.well.ballast m, movement.js); one craft passes the gate at a time
   (def.well.gap s apart): out, it backs out of its slot astern on cushion and is released 12 m clear of the stern
   (u.dockT: a scripted slide in the ship's frame, dockMove); in, it runs from the approach point astern of the ship
   up into the forward-most free slot, bow first. The gate comes up again once nothing has used it for 40 s.

   The LCAC (def.hover): the only unit that crosses the waterline. It moves on the 'hover' nav grid: any water, and
   flat, low ground within 1.5 km of the water (beaches). Over land it is slower (def.landSpeed). u.cushion 0..1 (off
   cushion it rests on its pads and cannot move), u.rampB 0..1 (the bow ramp). Orders (orders.js H):
     land { x, z, then?, hold?, cycle? }   out of the well (with what it carries), to the beach nearest (x, z)
                                           (beachPoint), off cushion, ramp down, the vehicles roll off one every
                                           ROLL s and drive clear (then `then`, e.g. a move to an objective; hold sets
                                           their weapons-free flag), ramp up, back on cushion; with cycle (the default)
                                           it returns to its LHD for more while the ship has vehicles, and runs the
                                           same beach again; at the end it docks. o.ph = 'go' | 'unload' | 'back' | 'dock'
     unload {}                             land at the nearest beach from where it is (or right here, on a beach)
     dock { target }                       back into the LHD's well
   Vehicles: embark { target } drives to a beached LCAC's bow ramp and boards it (room permitting).

   Overrun: fleet ground units inside OVERRUN_R of the coast's command post with no coast ground unit there, for
   OVERRUN_T s, take the post: it is destroyed (the ordinary command-post rule ends the match). Events: 'landing' { state: 'done' | 'empty' | 'nobeach' | 'noroute' } (a craft), 'well' { dir: 'out' | 'clear' | 'in' | 'docked' }, 'unload', 'embark', 'overrun'
   { state: 'start' | 'lost' | 'taken', side, unit: post id, t (s held) }. */
import { UNITS } from '../data/units.js';
import { DT } from './consts.js';
import { clamp, angTo, dxz, local } from './util.js';

export const ROLL = 8;                 // s between two vehicles rolling off the ramp
export const OVERRUN_R = 1500;         // m round the command post
export const OVERRUN_T = 120;          // s held to take it

const navOf = u => u.def.hover ? 'hover' : u.def.sub ? 'sub' : u.def.domain;
export const isHover = u => !!(u && u.def && u.def.hover);

/* ---------------------------------------------------------------- carrying */
/* units carried by a host (aircraft on its deck excepted), and the crafts / vehicles among them */
export function carried(sim, host, kind) {
  const out = [];
  for (const v of sim.alive(host.side)) {
    if (v.aboard !== host.id || v.def.domain === 'air') continue;
    if (kind === 'craft' ? !v.def.hover : kind === 'veh' ? v.def.hover : false) continue;
    out.push(v);
  }
  return out;
}
/* can host take one more unit of this type now */
export function room(sim, host, type) {
  const C = host && host.alive && host.def.carry, d = UNITS[type];
  if (!C || !d || !C.types.includes(type) || host.off.well && d.hover) return false;
  if (d.hover) return crafts(sim, host) < (C.craft || 0);
  return carried(sim, host, 'veh').length < (C.veh || 0);
}
/* the crafts that belong to a well: aboard, passing the gate, or out on a run from it (a berth is kept for each) */
function crafts(sim, host) {
  let n = 0;
  for (const v of sim.alive(host.side)) if (v.def.hover && (v.aboard === host.id || v.aboardOf === host.id || (v.dockT && v.dockT.host === host.id))) n++;
  return n;
}
/* where a unit of this type bought (or spawned loaded) goes: an LCAC into an LHD's well; a vehicle onto an LCAC in a
   well first, else onto an LHD's vehicle decks (prefer: the host that must be used first) */
export function hostFor(sim, side, type, prefer) {
  const d = UNITS[type];
  if (!d || !d.embark) return null;
  const al = sim.alive(side), ok = h => h && h.alive && h.side === side && room(sim, h, type);
  if (d.hover) { if (ok(prefer)) return prefer; return al.find(h => h.def.well && ok(h)) || null; }
  const inWell = h => al.find(c => c.def.hover && c.aboard === h.id && ok(c));
  if (prefer) { const c = inWell(prefer); if (c) return c; if (ok(prefer)) return prefer; }
  for (const h of al) if (h.def.well) { const c = inWell(h); if (c) return c; }
  return al.find(h => h.def.well && ok(h)) || null;
}
/* put a unit aboard a host (no checks) */
export function embark(sim, v, host) {
  v.aboard = host.id; v.aboardOf = host.id; v.speed = 0; v.path = null; v.goal = null; v.dockT = null;
  if (v.def.hover) { if (!(v.slot >= 0) || slotTaken(sim, host, v.slot, v)) v.slot = freeSlot(sim, host, true, v); v.cushion = 0; v.cushionT = 0; v.rampB = 0; v.rampT = 0; }
  else if (host.def.hover) { const used = new Set(carried(sim, host, 'veh').filter(w => w !== v).map(w => w.slot)); v.slot = used.has(0) ? 1 : 0; }   // its berth on the cargo deck
  sim._dirty = true;
  followHost(sim, v);
}
/* the well's berths: taken by a craft aboard or coming in (self excepted); the forward-most free one (entries fill
   from forward; `any`: 0 when none is free) */
function slotTaken(sim, host, i, self) {
  for (const v of sim.alive(host.side)) if (v !== self && v.def.hover && v.slot === i && (v.aboard === host.id || (v.dockT && v.dockT.host === host.id && v.dockT.mode === 'in'))) return true;
  return false;
}
function freeSlot(sim, host, any, self) {
  const S = host.def.well.slots;
  for (let i = S.length - 1; i >= 0; i--) if (!slotTaken(sim, host, i, self)) return i;
  return any ? 0 : -1;
}
/* a carried unit rides with its host: crafts in their slot in the well, vehicles on the deck */
export function followHost(sim, v) {
  const h = sim.units.get(v.aboard);
  if (!h) return;
  let p;
  if (v.def.hover && h.def.well) { const W = h.def.well; p = local(h, [0, W.y, W.slots[v.slot || 0]]); p[1] = Math.max(p[1], 0); }
  else p = [h.pos[0], h.pos[1] + ((h.def.carry && h.def.carry.deckY) || 2), h.pos[2]];
  v.pos[0] = p[0]; v.pos[1] = p[1]; v.pos[2] = p[2]; v.hdg = h.hdg; v.speed = 0; v.pitch = h.pitch || 0; v.roll = h.roll || 0;
}
/* a new LHD comes with its landing force (def.carry.start): its LCACs in the well, the vehicles in the LCACs, the rest
   on the vehicle decks */
export function loadStart(sim, host) {
  for (const [type, n] of host.def.carry.start || []) for (let i = 0; i < n; i++) {
    // its helicopters on the flight deck
    if (UNITS[type].domain === 'air') { sim.spawn(type, host.side, host.pos[0], host.pos[2], { aboard: host.id }); continue; }
    const to = hostFor(sim, host.side, type, host);
    if (!to) break;
    const v = sim.spawn(type, host.side, host.pos[0], host.pos[2], { hdg: host.hdg, loaded: false });
    embark(sim, v, to);
  }
}

/* ---------------------------------------------------------------- the well deck (LHD, every tick) */
export function wellStep(sim, h) {
  const W = h.def.well, t = sim.t;
  // the craft passing the gate now
  if (h.transit) { const v = sim.units.get(h.transit); if (!v || !v.alive || !v.dockT || v.dockT.host !== h.id) h.transit = 0; }
  // who wants the gate: crafts aboard whose order asks to go out, crafts near the approach point asking to come in
  let want = null, busy = !!h.transit;
  for (const v of sim.alive(h.side)) {
    if (!v.def.hover || t - (v.wellReq || -1e9) > .5 || v.wellHost !== h.id) continue;
    busy = true;
    // crafts coming in go first (they wait at sea), then the lowest id
    if (!want) { want = v; continue; }
    const a = v.aboard === h.id ? 1 : 0, b = want.aboard === h.id ? 1 : 0;
    if (a < b || (a === b && v.id < want.id)) want = v;
  }
  if (busy) h.wellUse = t;
  const open = !h.off.well && (busy || t - (h.wellUse || -1e9) < 40);
  h.wellT = open ? 1 : 0;
  const was = h.well;
  if (h.wellT > h.well && h.speed <= W.slow + .4) h.well = Math.min(1, h.well + DT / W.open);
  else if (h.wellT < h.well && !h.transit) h.well = Math.max(0, h.well - DT / W.open);
  if (h.well >= 1 && was < 1) sim.emit('deploy', { unit: h.id, side: h.side, what: 'well_open', pos: h.pos.slice() });
  if (h.well <= 0 && was > 0) sim.emit('deploy', { unit: h.id, side: h.side, what: 'well_shut', pos: h.pos.slice() });
  // one craft through the gate at a time
  if (want && h.well >= 1 && !h.transit && t >= (h.nextWell || 0)) {
    if (want.aboard === h.id) startOut(sim, h, want);
    else if (dxz(want.pos[0], want.pos[2], ...approach(h)) < 900 && freeSlot(sim, h, false, want) >= 0) startIn(sim, h, want);
  }
  // vehicles on the vehicle decks load into the crafts in the well (one every W.load s), those with a landing first
  if (t >= (h.loadT || 0)) {
    const veh = carried(sim, h, 'veh');
    const landing = c => c.orders[0] && c.orders[0].kind === 'land' ? 0 : 1;
    if (veh.length) for (const c of carried(sim, h, 'craft').sort((a, b) => landing(a) - landing(b) || a.id - b.id)) {
      if (!room(sim, c, veh[0].type)) continue;
      const v = veh.shift(); embark(sim, v, c); h.loadT = t + W.load;
      sim.emit('embark', { unit: v.id, side: v.side, host: c.id, pos: c.pos.slice() });
      break;
    }
  }
}
/* the point astern of the ship where a craft waits for the gate */
const approach = h => { const p = local(h, [0, 0, h.def.well.z0 - 260]); return [p[0], p[2]]; };
export function requestWell(sim, v, host) {
  const h = host || sim.units.get(v.aboard || v.aboardOf);
  if (!h || !h.alive || !h.def.well) return false;
  v.wellReq = sim.t; v.wellHost = h.id;
  return true;
}
function startOut(sim, h, v) {
  // the craft asking goes first: if it is not the aftmost in the well, it swaps berths with the aftmost one
  const aft = carried(sim, h, 'craft').sort((a, b) => a.slot - b.slot)[0];
  if (aft && aft !== v && aft.slot < v.slot) { const s = aft.slot; aft.slot = v.slot; v.slot = s; followHost(sim, aft); }
  const W = h.def.well;
  v.aboard = 0; v.aboardOf = h.id; v.dockT = { mode: 'out', host: h.id, z: W.slots[v.slot || 0], x: 0, v: 0 };
  v.cushion = Math.max(v.cushion, .6); v.cushionT = 1; v.path = null;
  h.transit = v.id; h.nextWell = sim.t + W.gap;
  sim._dirty = true;
  sim.emit('well', { unit: v.id, host: h.id, side: v.side, dir: 'out', pos: v.pos.slice() });
}
function startIn(sim, h, v) {
  const W = h.def.well, dx = v.pos[0] - h.pos[0], dz = v.pos[2] - h.pos[2], c = Math.cos(h.hdg), s = Math.sin(h.hdg);
  v.slot = freeSlot(sim, h, false, v);
  v.dockT = { mode: 'in', host: h.id, x: dx * c - dz * s, z: dx * s + dz * c, v: v.speed, leg: 0, yaw: angTo(h.hdg, v.hdg) };
  v.path = null; v.cushionT = 1;
  h.transit = v.id; h.nextWell = sim.t + W.gap;
  sim.emit('well', { unit: v.id, host: h.id, side: v.side, dir: 'in', pos: v.pos.slice() });
}
/* the scripted slide through the gate, in the ship's frame (movement.js calls it instead of moving the craft) */
export function dockMove(sim, v) {
  const D = v.dockT, h = sim.units.get(D.host);
  if (!h || !h.alive) { v.dockT = null; return; }
  const W = h.def.well, half = v.def.size[0] / 2;
  let lx = D.x, lz = D.z, yaw = 0;
  if (D.mode === 'out') {
    // astern out of the slot, on cushion, speeding up to 4 m/s; released 12 m clear of the stern
    D.v = Math.min(4, D.v + .8 * DT); D.z -= D.v * DT; lz = D.z;
    if (D.z < W.z0 - half - 12) {
      v.dockT = null; h.transit = 0;
      const p = local(h, [0, 0, lz]); v.pos[0] = p[0]; v.pos[2] = p[2]; v.pos[1] = 0; v.hdg = h.hdg; v.speed = 0;
      sim.emit('well', { unit: v.id, host: h.id, side: v.side, dir: 'clear', pos: v.pos.slice() });
      return;
    }
  } else {
    // in: to the gate's line astern, then straight up into the slot, bow first
    const P = [[0, W.z0 - half - 30], [0, W.slots[v.slot || 0]]];
    const tgt = P[D.leg], ex = tgt[0] - D.x, ez = tgt[1] - D.z, e = Math.hypot(ex, ez);
    // turn onto the line of travel, then onto the ship's heading for the run up the well (a hovercraft yaws in place)
    D.yaw += clamp(angTo(D.yaw, D.leg ? 0 : Math.atan2(ex, ez)), -.3 * DT, .3 * DT);
    D.v = Math.min(D.leg ? (Math.abs(D.yaw) < .08 ? 3.5 : .5) : 6, D.v + .8 * DT);
    const st = D.v * DT;
    if (e <= st) { D.x = tgt[0]; D.z = tgt[1]; if (D.leg === 0) D.leg = 1; else { embark(sim, v, h); sim.emit('well', { unit: v.id, host: h.id, side: v.side, dir: 'docked', pos: v.pos.slice() }); h.transit = 0; return; } }
    else { D.x += ex / e * st; D.z += ez / e * st; }
    lx = D.x; lz = D.z; yaw = D.yaw;
  }
  const p = local(h, [lx, W.y, lz]);
  const inside = lz > W.z0;
  v.pos[0] = p[0]; v.pos[2] = p[2]; v.pos[1] = inside ? Math.max(0, p[1]) : 0;
  v.hdg = h.hdg + yaw; v.speed = D.v; v.pitch = 0; v.roll = 0;
  v.odo += D.v * DT;
}

/* ---------------------------------------------------------------- the LCAC (every tick) */
export function hoverStep(sim, u) {
  const d = u.def;
  const o = u.orders[0], unloading = o && o.kind === 'land' && o.ph === 'unload';
  if (u.aboard) { u.cushionT = 0; u.rampT = 0; }
  else if (!unloading) {
    // on cushion to move; an idle craft settles on its pads after 20 s (and lifts again on the next order)
    if (o || u.dockT || u.speed > .3) u.idleT = sim.t;
    u.cushionT = sim.t - (u.idleT || 0) > 20 ? 0 : 1; u.rampT = 0;
  }
  u.cushion = clamp((u.cushion || 0) + clamp(u.cushionT - (u.cushion || 0), -DT / 4, DT / 4), 0, 1);
  u.rampB = clamp((u.rampB || 0) + clamp((u.rampT || 0) - (u.rampB || 0), -DT / 5, DT / 5), 0, 1);
  // propellers turn with the thrust asked of them, the lift fans while on cushion
  u.propA = ((u.propA || 0) + (u.cushion > .2 ? 6 + u.speed * .9 : 0) * DT) % (Math.PI * 2);
  u.fanA = ((u.fanA || 0) + u.cushion * 40 * DT) % (Math.PI * 2);
  u.rud = clamp(angTo(u.prevHdg, u.hdg) / DT * -3, -.45, .45);
  if ((sim.tick + u.id) % 10 === 0) u.cargoN = carried(sim, u, 'veh').length;      // for the UI
}
/* a beached craft (on land, stopped) can take vehicles over its bow ramp */
export const beached = (sim, u) => !u.aboard && !u.dockT && sim.map.h(u.pos[0], u.pos[2]) > .3 && u.speed < .5;

/* a point where water or flat low ground carries a hovercraft (movement.js) */
export function hoverOK(sim, x, z) {
  const h = sim.map.h(x, z);
  if (h < 0) return true;
  return h < 14 && sim.map.slope(x, z) < .16 && sim.nav.open('hover', x, z);
}

/* the landing point nearest (x, z): a beach cell (land the hovercraft reaches, by the water, that vehicles can drive
   off) in the craft's reach (its hover component); [x, z] or null */
export function beachPoint(sim, x, z, u) {
  const nav = sim.nav, H = nav.grid('hover'), Lg = nav.grid('land'), map = sim.map, cols = nav.cols, rows = nav.rows;
  let comp = -1;
  if (u) { const k = nav.nearestOpen('hover', nav.cellOf(u.pos[0], u.pos[2]), -1, 12); if (k >= 0) comp = H.comp[k]; }
  const k0 = nav.cellOf(x, z), i0 = k0 % cols, j0 = (k0 - i0) / cols;
  for (let r = 0; r <= 60; r++) {
    let best = -1, bd = 1e18;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 1 || j < 1 || i >= cols - 1 || j >= rows - 1) continue;
      const k = j * cols + i;
      if (!H.cost[k] || !Lg.cost[k] || (comp >= 0 && H.comp[k] !== comp) || !isBeach(nav, map, H, k)) continue;
      const d = (nav.cx(k) - x) ** 2 + (nav.cz(k) - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) return [nav.cx(best), nav.cz(best)];
  }
  return null;
}
/* a land cell of the hover grid with open water in the hover grid within two cells */
function isBeach(nav, map, H, k) {
  if (map.h(nav.cx(k), nav.cz(k)) < 1) return false;
  const cols = nav.cols, i = k % cols, j = (k - i) / cols;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const kk = (j + dj) * cols + (i + di);
    if (kk >= 0 && kk < nav.N && H.cost[kk] && map.h(nav.cx(kk), nav.cz(kk)) < -1) return true;
  }
  return false;
}
/* every beach cell of the map (the AI's candidates), cached on the sim: [{ x, z, comp }] */
export function beaches(sim) {
  if (sim._beaches) return sim._beaches;
  const nav = sim.nav, H = nav.grid('hover'), Lg = nav.grid('land'), out = [];
  for (let k = 0; k < nav.N; k++) if (H.cost[k] && Lg.cost[k] && isBeach(nav, sim.map, H, k)) out.push({ x: nav.cx(k), z: nav.cz(k), comp: H.comp[k], lcomp: Lg.comp[k] });
  return (sim._beaches = out);
}

/* ---------------------------------------------------------------- orders (orders.js H) */
function go(sim, u, o, x, z) {
  if (u.path && o._g && dxz(o._g[0], o._g[1], x, z) < 60) return true;
  if (o._g && !u.path && dxz(o._g[0], o._g[1], x, z) < 60 && (o._fail || 0) > 3) return false;
  o._g = [x, z]; u.goal = [x, z];
  u.path = sim.nav.path(navOf(u), u.pos[0], u.pos[2], x, z); u.wi = 0; u.blocked = 0; u.repaths = 0;
  if (!u.path) o._fail = (o._fail || 0) + 1;
  return !!u.path;
}
const hostOf = (sim, u, o) => { const h = sim.units.get((o && o.host) || u.aboard || u.aboardOf || 0); return h && h.alive && h.def.well ? h : null; };

export const ORDERS = {
  land(sim, u, o) {
    if (!u.def.hover || u.off.move) return true;
    const t = sim.t;
    if (u.aboard) {
      const h = sim.units.get(u.aboard);
      if (!h || !h.alive) return true;
      o.host = h.id;
      // a craft waits in the well for the vehicles still coming from the vehicle decks; empty, with none left, it stays
      const cargo = carried(sim, u, 'veh').length, left = carried(sim, h, 'veh').length;
      if (cargo === 0 && left === 0 && !o.empty) { sim.emit('landing', { unit: u.id, side: u.side, state: 'empty', pos: u.pos.slice() }); return true; }
      if (left > 0 && cargo < (u.def.carry.veh || 2)) return false;
      requestWell(sim, u, h);
      o.ph = 'go';
      return false;
    }
    if (u.dockT) return false;
    if (!o.ph) o.ph = 'go';
    if (o.ph === 'go') {
      if (!o.bp) {
        // right here, on a beach: unload where it stands
        o.bp = beachHere(sim, u) || beachPoint(sim, o.x, o.z, u);
        if (!o.bp) { sim.emit('landing', { unit: u.id, side: u.side, state: 'nobeach', pos: u.pos.slice() }); return true; }
        o.bp = spread(sim, u, o.bp);
      }
      const dd = dxz(u.pos[0], u.pos[2], o.bp[0], o.bp[1]), onLand = sim.map.h(u.pos[0], u.pos[2]) > .8;
      if ((dd < 60 || (!u.path && onLand && dd < 700)) && carried(sim, u, 'veh').length) { u.path = null; o.ph = 'unload'; o.t0 = t; o.next = 0; return false; }
      if (dd < 60) { o.ph = 'back'; return false; }
      if (!go(sim, u, o, o.bp[0], o.bp[1]) && !u.path) {
        // no way on: a craft already ashore unloads where it is; afloat, it gives up
        if (onLand) { o.ph = 'unload'; o.t0 = t; o.next = 0; return false; }
        if ((o._fail || 0) > 3) { sim.emit('landing', { unit: u.id, side: u.side, state: 'noroute', pos: u.pos.slice() }); return true; }
      }
      return false;
    }
    if (o.ph === 'unload') {
      u.path = null;
      if (u.speed > .4) return false;
      const veh = carried(sim, u, 'veh');
      if (veh.length) {
        u.cushionT = 0;
        if (u.cushion > .08) return false;
        u.rampT = 1;
        if (u.rampB < 1 || t < o.next) return false;
        rollOff(sim, u, o, veh[0], o.n || 0);
        o.n = (o.n || 0) + 1; o.next = t + ROLL;
        return false;
      }
      // empty: ramp up, back on cushion
      u.rampT = 0;
      if (u.rampB > 0) return false;
      u.cushionT = 1;
      if (u.cushion < .95) return false;
      sim.emit('landing', { unit: u.id, side: u.side, state: 'done', n: o.n || 0, pos: u.pos.slice() });
      o.ph = 'back';
      return false;
    }
    if (o.ph === 'back') {
      const h = hostOf(sim, u, o);
      if (!h) return true;
      o.ph = 'dock';
      // for more: while the ship still has vehicles aboard (the cycle); else home to stay
      if (o.cycle === false || !carried(sim, h, 'veh').length) { u.orders[0] = { kind: 'dock', target: h.id }; return false; }
      return false;
    }
    if (o.ph === 'dock') {
      const h = hostOf(sim, u, o);
      if (!h) return true;
      if (dockStep(sim, u, h, o)) { o.ph = 'go'; o.n = 0; }      // aboard: loads, then out again to the same beach
      return false;
    }
    return true;
  },

  unload(sim, u, o) {
    if (!u.def.hover) return true;
    // land at the nearest beach (right here on one): a landing without the return trip
    u.orders[0] = { kind: 'land', x: u.pos[0], z: u.pos[2], cycle: false, then: o.then, hold: o.hold };
    return false;
  },

  dock(sim, u, o) {
    if (!u.def.hover) return true;
    const h = sim.units.get(o.target) || hostOf(sim, u, null) || nearestWell(sim, u);
    if (!h || !h.alive || !h.def.well) return true;
    if (u.aboard === h.id) return true;
    if (u.aboard) return true;
    if (!u.dockT && u.aboardOf !== h.id && !room(sim, h, u.type)) return true;      // its own ship keeps its berth
    return dockStep(sim, u, h, o);
  },

  embark(sim, u, o) {
    const T = sim.units.get(o.target);
    if (u.aboard || u.def.domain !== 'land') return true;
    if (!T || !T.alive || T.side !== u.side || !T.def.hover || !room(sim, T, u.type)) return true;
    const bow = local(T, [0, 0, T.def.size[0] / 2 + 7]);
    if (dxz(u.pos[0], u.pos[2], bow[0], bow[2]) > 40) {
      if (!go(sim, u, o, bow[0], bow[2]) && !u.path && (o._fail || 0) > 3) return true;
      return false;
    }
    u.path = null;
    if (!beached(sim, T)) { o.wait = (o.wait || 0) + DT; return o.wait > 600; }
    embark(sim, u, T);
    sim.emit('embark', { unit: u.id, side: u.side, host: T.id, pos: T.pos.slice() });
    return true;
  },
};

/* crafts landing together keep 75 m apart along the beach: the nearest free point either side of bp */
function spread(sim, u, bp) {
  const taken = [];
  for (const v of sim.alive(u.side)) if (v !== u && v.def.hover) { const q = v.orders[0]; if (q && q.kind === 'land' && q.bp) taken.push(q.bp); }
  const free = (x, z) => !taken.some(p => dxz(p[0], p[1], x, z) < 70);
  if (free(bp[0], bp[1])) return bp;
  const ax = bp[0] - u.pos[0], az = bp[1] - u.pos[2], L = Math.hypot(ax, az) || 1, px = az / L, pz = -ax / L;
  for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const x = bp[0] + px * k * 75, z = bp[1] + pz * k * 75;
    if (sim.map.h(x, z) > .8 && hoverOK(sim, x, z) && sim.nav.open('land', x, z) && free(x, z)) return [x, z];
  }
  return bp;
}
/* the craft on a beach now: unload here */
function beachHere(sim, u) { return sim.map.h(u.pos[0], u.pos[2]) > .8 && sim.nav.open('land', u.pos[0], u.pos[2]) ? [u.pos[0], u.pos[2]] : null; }
function nearestWell(sim, u) {
  let best = null, bd = 1e18;
  for (const h of sim.alive(u.side)) if (h.def.well && room(sim, h, u.type)) { const d = dxz(u.pos[0], u.pos[2], h.pos[0], h.pos[2]); if (d < bd) { bd = d; best = h; } }
  return best;
}
/* back to the ship: to the approach point astern, then ask for the gate; true once aboard */
function dockStep(sim, u, h, o) {
  if (u.aboard === h.id) return true;
  if (u.dockT) return false;
  const ap = approach(h), d = dxz(u.pos[0], u.pos[2], ap[0], ap[1]);
  if (d > 600) { go(sim, u, o, ap[0], ap[1]); if (u.path && o._g && dxz(o._g[0], o._g[1], ap[0], ap[1]) > 300) { o._g = null; go(sim, u, o, ap[0], ap[1]); } return false; }
  u.path = null;
  requestWell(sim, u, h);
  return false;
}

/* a vehicle rolls off the bow ramp and drives clear, then on to the landing's objective */
function rollOff(sim, u, o, v, i) {
  const map = sim.map, s = Math.sin(u.hdg), c = Math.cos(u.hdg);
  let p = null;
  for (let f = 4; f <= 60; f += 8) {
    const q = local(u, [0, 0, u.def.size[0] / 2 + f]);
    if (map.h(q[0], q[2]) > .4 && sim.nav.open('land', q[0], q[2])) { p = q; break; }
  }
  if (!p) p = local(u, [0, 0, u.def.size[0] / 2 + 4]);
  v.aboard = 0; v.pos[0] = v.prev[0] = p[0]; v.pos[2] = v.prev[2] = p[2]; v.pos[1] = v.prev[1] = Math.max(0, map.h(p[0], p[2]));
  v.hdg = v.prevHdg = u.hdg; v.speed = 3; v.path = null; v.goal = null;
  if (o.hold !== undefined) v.hold = !!o.hold;
  // clear the ramp: fan out 90-150 m inland, then the landing's objective
  const lat = (i % 2 ? 1 : -1) * (25 + 20 * Math.floor(i / 2)), fwd = 110 + 30 * (i % 3);
  const kept = v.orders.slice(); v.orders.length = 0;
  v.orders.push({ kind: 'move', x: p[0] + s * fwd + c * lat, z: p[2] + c * fwd - s * lat });
  if (o.then) v.orders.push(Object.assign({}, o.then, { queue: true }));
  for (const k of kept) v.orders.push(k);
  sim._dirty = true;
  sim.emit('unload', { unit: v.id, from: u.id, side: v.side, type: v.type, pos: v.pos.slice() });
}

/* ---------------------------------------------------------------- the command post overrun (1 Hz, economy.js) */
export function overrunTick(sim) {
  const hq = sim.hq('coast');
  if (!hq || !hq.def.static) return;
  let f = null, c = 0;
  for (const side of ['coast', 'fleet']) for (const u of sim.alive(side)) {
    if (u.aboard || u.def.domain !== 'land' || u === hq) continue;
    if (dxz(u.pos[0], u.pos[2], hq.pos[0], hq.pos[2]) > OVERRUN_R) continue;
    if (side === 'coast') c++; else if (!f) f = u;
  }
  const was = hq.overrun || 0;
  hq.overrun = f && !c ? was + 1 : Math.max(0, was - 2);
  if (hq.overrun && !was) sim.emit('overrun', { state: 'start', side: 'fleet', unit: hq.id, t: 0, pos: hq.pos.slice() });
  else if (!hq.overrun && was) sim.emit('overrun', { state: 'lost', side: 'fleet', unit: hq.id, t: 0, pos: hq.pos.slice() });
  if (hq.overrun >= OVERRUN_T && f) {
    sim.emit('overrun', { state: 'taken', side: 'fleet', unit: hq.id, t: hq.overrun, by: f.id, pos: hq.pos.slice() });
    return f;
  }
  return null;
}
