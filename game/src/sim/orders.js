/* Orders: issue (with formations for groups) and per-tick processing of each unit's order queue.
   order = { kind: 'move'|'attack'|'stop'|'hold'|'weapons'|'salvo'|'deploy'|'undeploy'|'reload'|'scan'|'radar'
             |'launch_drone'|'patrol'|'return'|'dive', x?, z?, target?, on?, free?, n?, salvo?, r?, queue?, stay?, depth? }
   'attack' with `n`: one volley of n rounds (the AI, the campaign scripts). Without `n` (the player's): persistent,
   volleys of the salvo size until the target is destroyed, the weapon is empty with no reload coming, the track has
   been lost for GRACE s (the order holds meanwhile and resumes when the track is back), or it is cancelled.
   'salvo' (immediate): the unit's volley size for its persistent attacks, n = 1 | 2 | 0 (all in hand).
   'dive' (submarines, immediate): depth 0 surface · 1 periscope depth · 2 deep, or no depth: the next one down
   (surface -> periscope -> deep -> periscope ...). A boat ordered to fire missiles comes up to periscope depth
   for the salvo and goes back to its depth after it.
   Rules of engagement: `u.hold` is the unit's weapons-free flag (offensive weapons pick their own targets in reach;
   defensive weapons always fire by themselves). 'hold' { on } sets it AND halts the unit (the AI's stance);
   'weapons' { free } only sets it (the player's Weapons free / Hold fire toggle: the unit keeps its orders; hold fire
   also drops attack orders, so nothing fires until the next order). 'stop' also takes an aircraft off the launch queue. */
import { CLASSIFY, TEL_ELEV, UNITS } from '../data/units.js';
import { canMove, stow, navDom } from './movement.js';
import { startScan, scanBlocked } from './sensors.js';
import { ammoFull, atDepot, elevOf, replenishPoint } from './mech.js';
import { atPD } from './subs.js';
import { dxz, clamp } from './util.js';

/* orbit radius of an aircraft loitering (after a move), on patrol, idle */
const ORBIT = { fighter: [6000, 9000], aew: [12000, 15000], helo: [0, 3500], drone: [1500, 2500] };

const SPACING = { land: 180, sea: 1600, air: 900 };

export function issue(sim, ids, o) {
  const us = [];
  for (const id of ids) { const u = sim.units.get(id); if (u && u.alive) us.push(u); }
  if (!us.length || !o || !o.kind) return;
  if ((o.kind === 'move' || o.kind === 'patrol') && us.length > 1 && o.x !== undefined) {
    // formation: line abreast across the direction of travel, sorted so nobody crosses; group speed = slowest
    const byDom = {};
    for (const u of us) (byDom[u.def.domain] = byDom[u.def.domain] || []).push(u);
    for (const dom in byDom) {
      const g = byDom[dom];
      let cx = 0, cz = 0; for (const u of g) { cx += u.pos[0]; cz += u.pos[2]; } cx /= g.length; cz /= g.length;
      let fx = o.x - cx, fz = o.z - cz; const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L;
      const px = fz, pz = -fx, sp = SPACING[dom] * (o.spacing || 1);
      g.sort((a, b) => ((a.pos[0] - cx) * px + (a.pos[2] - cz) * pz) - ((b.pos[0] - cx) * px + (b.pos[2] - cz) * pz));
      const perRow = Math.min(g.length, dom === 'sea' ? 4 : 6);
      let vmin = 1e9; for (const u of g) vmin = Math.min(vmin, dom === 'land' ? u.def.road : u.def.speed);
      g.forEach((u, i) => {
        const row = Math.floor(i / perRow), col = i % perRow, n = Math.min(perRow, g.length - row * perRow);
        const lat = (col - (n - 1) / 2) * sp, back = row * sp;
        const oo = Object.assign({}, o, { x: o.x + px * lat - fx * back, z: o.z + pz * lat - fz * back, spd: dom === 'air' ? 0 : vmin });
        give(sim, u, oo);
      });
    }
    return;
  }
  for (const u of us) give(sim, u, Object.assign({}, o));
}

function give(sim, u, o) {
  // immediate orders (never queued)
  if (o.kind === 'stop') { cancel(sim, u); unqueue(sim, u); u.orders.length = 0; u.path = null; u.spdCap = 0; if (u.def.domain === 'air' && !u.aboard) { u.goal = [u.pos[0], u.pos[2]]; u.orbitR = u.def.domain === 'air' && u.type !== 'helo' ? 1500 : 0; } return; }
  if (o.kind === 'radar') { if (u.def.sensors.radar) sim.setRadar(u, o.on === undefined ? !u.radarOn : o.on); return; }
  if (o.kind === 'dive') {
    if (!u.def.sub) return;
    u.dive = o.depth !== undefined ? clamp(o.depth | 0, 0, 2) : u.dive === 2 ? 1 : u.dive + 1;
    for (const x of u.orders) if (x.kind === 'attack') x._dive = u.dive;       // an attack in hand returns to this depth
    sim.emit('dive', { unit: u.id, side: u.side, depth: u.dive, pos: u.pos.slice() });
    return;
  }
  if (o.kind === 'salvo') {
    // the player's salvo size for attacks: 1, 2 or 0 (every round in hand); undefined: the weapon's own
    u.salvo = o.n === undefined || o.n === null ? undefined : clamp(o.n | 0, 0, 99);
    return;
  }
  if (o.kind === 'weapons') {
    u.hold = !!o.free;
    if (!o.free && u.orders.some(x => x.kind === 'attack')) {
      const head = u.orders[0].kind === 'attack';
      for (let i = u.orders.length - 1; i >= 0; i--) if (u.orders[i].kind === 'attack') u.orders.splice(i, 1);
      if (head) { u.path = null; u.spdCap = 0; if (!u.orders.length) unqueue(sim, u); }
    }
    return;
  }
  if (o.kind === 'hold' && !o.queue) {
    u.hold = o.on !== false;
    if (u.hold) { cancel(sim, u); u.orders.length = 0; u.path = null; }
    return;
  }
  if (o.queue && u.orders.length) { u.orders.push(o); return; }
  cancel(sim, u);
  u.orders.length = 0; u.orders.push(o);
  u.path = null; u.spdCap = 0; u.landing = false;
}

/* an aircraft on deck that no longer has anywhere to go leaves the carrier's launch queue */
function unqueue(sim, u) {
  if (!u.aboard) return;
  const cv = sim.units.get(u.aboard), i = cv && cv.launchQ ? cv.launchQ.indexOf(u.id) : -1;
  if (i >= 0) cv.launchQ.splice(i, 1);
}

/* leaving the current order: a transloader drops a reload in progress */
function cancel(sim, u) {
  if (u.type === 'transloader' && u.busy) {
    for (const v of sim.alive(u.side)) if (v.reloader === u.id) { v.reloader = 0; v.reloadP = 0; v.elevT = v.wantElev; }
    u.busy = false;
  }
  if (u.type === 'catapult') u.carriage = 0;
}

export function processOrders(sim, u) {
  let o = u.orders[0];
  if (!o) { idle(sim, u); return; }
  let guard = 0;
  while (o && guard++ < 4) {
    const h = H[o.kind];
    const done = h ? h(sim, u, o) : true;
    if (!done) return;
    u.orders.shift();
    u.path = null; u.spdCap = 0;
    o = u.orders[0];
  }
  if (!o) idle(sim, u);
}

function idle(sim, u) {
  const d = u.def;
  if (d.domain !== 'air' || u.aboard) return;
  // aircraft: loiter where they are; go home when fuel runs low or (fighters) when out of weapons
  if (!u.goal) u.goal = [u.pos[0], u.pos[2]];
  if (!u.orbitR && u.type !== 'helo') u.orbitR = (ORBIT[u.type] || ORBIT.drone)[0];
  autoReturn(sim, u);
}

function autoReturn(sim, u) {
  const d = u.def;
  if (!d.endurance || (sim.tick + u.id) % 20 !== 0) return false;      // checked once a second
  const home = homeOf(sim, u);
  const dist = home ? dxz(u.pos[0], u.pos[2], home.pos[0], home.pos[2]) : 0;
  const low = u.fuel < dist / d.speed * 1.3 + 300;
  const dry = u.type === 'fighter' && (u.ammo.slam === 0 || u.off.slam);
  if ((low || dry) && home && !(u.orders[0] && u.orders[0].kind === 'return')) {
    u.orders.length = 0; u.orders.push({ kind: 'return', auto: true });
    return true;
  }
  if (u.fuel <= 0) { u.fuelOut = true; }
  return false;
}

/* where an aircraft lands: drones at a catapult; others on a deck that takes their type (carrier; helos also a DDG) */
function homeOf(sim, u) {
  let best = null, bd = 1e18, occ = null;
  const own = u.type !== 'drone' ? sim.units.get(u.aboardOf || 0) : null, al = hostsOf(sim, u.side, u.type);
  for (let i = 0; i < al.length; i++) {
    const v = al[i];
    if (u.type !== 'drone') {
      if (v.off.air) continue;
      if (v.type !== 'carrier' && v !== own && (occ || (occ = deckCounts(sim, u.side)))[v.id] >= v.def.air.cap) continue;
    }
    const dd = dxz(u.pos[0], u.pos[2], v.pos[0], v.pos[2]);
    if (dd < bd) { bd = dd; best = v; }
  }
  return best;
}

/* the side's units an aircraft of this type can land on (a drone: catapults; else decks that take the type), in
   sim.alive() order: rebuilt whenever sim.alive() gives a new array */
const HOSTS = { coast: { al: null, by: {} }, fleet: { al: null, by: {} } };
function hostsOf(sim, side, type) {
  const al = sim.alive(side), H = HOSTS[side];
  if (H.al !== al) { H.al = al; H.by = {}; }
  let L = H.by[type];
  if (!L) {
    L = H.by[type] = [];
    for (let i = 0; i < al.length; i++) {
      const v = al[i];
      if (type === 'drone' ? v.type === 'catapult' : v.def.air && v.def.air.types.includes(type)) L.push(v);
    }
  }
  return L;
}

/* aircraft on or landing on each deck of a side, by host id (deckFull for every deck in one pass) */
let OCC = new Int32Array(256);
function deckCounts(sim, side) {
  if (OCC.length < sim.nextId) OCC = new Int32Array(sim.nextId * 2);
  else OCC.fill(0, 0, sim.nextId);
  for (const w of sim.alive(side)) {
    if (w.aboard) OCC[w.aboard]++;
    if (w.landing && w.landing !== w.aboard) OCC[w.landing]++;
  }
  return OCC;
}

function requestLaunch(sim, u) {
  const cv = sim.units.get(u.aboard);
  if (!cv || !cv.alive) return;
  if (!cv.launchQ.includes(u.id)) cv.launchQ.push(u.id);
}

/* surface path to (x, z); returns false when nothing is reachable */
function goSurface(sim, u, x, z) {
  u.goal = [x, z];
  u.path = sim.nav.path(navDom(u), u.pos[0], u.pos[2], x, z);
  u.wi = 0; u.blocked = 0; u.repaths = 0;
  return !!u.path;
}

function moveTo(sim, u, o, x, z, arrive) {
  const dom = u.def.domain;
  if (dom === 'air') {
    if (u.aboard) { requestLaunch(sim, u); return false; }
    u.goal = [x, z]; u.orbitR = 0;
    return dxz(u.pos[0], u.pos[2], x, z) < (arrive || (u.type === 'fighter' || u.type === 'aew' ? 2500 : 400));
  }
  if (u.def.static || u.off.move) return true;
  if (!canMove(u)) { stow(sim, u); return false; }
  if (!o._p || (o._gx !== x || o._gz !== z) && !u.path) {
    o._p = 1; o._gx = x; o._gz = z;
    if (o.spd) u.spdCap = o.spd;
    if (!goSurface(sim, u, x, z)) return true;
  }
  if (arrive && dxz(u.pos[0], u.pos[2], x, z) < arrive) { u.path = null; return true; }
  return !u.path;
}

const H = {
  move(sim, u, o) {
    const done = moveTo(sim, u, o, o.x, o.z);
    if (done && u.def.domain === 'air') { u.goal = [o.x, o.z]; u.orbitR = (ORBIT[u.type] || ORBIT.drone)[0]; }
    return done;
  },

  patrol(sim, u, o) {
    if (u.def.domain === 'air') {
      if (u.aboard) { requestLaunch(sim, u); return false; }
      u.goal = [o.x, o.z];
      u.orbitR = o.r || (ORBIT[u.type] || ORBIT.drone)[1];
      return autoReturn(sim, u) ? false : false;
    }
    if (!o.pts) { o.pts = [[u.pos[0], u.pos[2]], [o.x, o.z]]; o.i = 1; }
    if (!canMove(u)) { stow(sim, u); return false; }
    if (!u.path) {
      if (o._started) o.i ^= 1;
      o._started = true;
      if (!goSurface(sim, u, o.pts[o.i][0], o.pts[o.i][1])) return true;
    }
    return false;
  },

  /* attack: with `n` (the AI's and the campaign scripts' orders) one volley of n rounds, then done. Without `n` (the
     player's orders) it persists: volleys of the salvo size (o.salvo, else the unit's setting u.salvo, else the
     weapon's own salvo; 0 = every round in hand), each one watched until its rounds are down (shoot, look, shoot),
     until the target is destroyed, the weapon is empty with no reload coming, the track has been lost for GRACE s,
     or the order is cancelled. A lost track holds the order ('lost': the unit stops where it is) and it resumes when
     the track is back. o.st = 'close' | 'fire' | 'look' | 'reload' | 'lost'; o.vol = volleys fired; the sim emits
     'engage' { unit, side, target, track, state: 'lost' | 'resume' | 'volley' | 'done', why, n }. */
  attack(sim, u, o) {
    if (o.n === undefined) return persistAttack(sim, u, o);
    const S = sim.sides[u.side], c = S.contacts.get(o.target);
    if (!c || c.dead || c.conf < CLASSIFY) return true;
    const w = pickWeapon(u, c.dom, true);
    if (!w) return true;
    o.w = w.name;
    const n = o.n || w.salvo || 1;
    o.vn = n; o.hot = true;
    if ((o.fired || 0) >= n) { if (o._dive !== undefined && u.def.sub) u.dive = o._dive; return true; }
    if (u.aboard) { requestLaunch(sim, u); return false; }
    const r = engageFrom(sim, u, o, w, c);
    return r === 'end' ? true : false;
  },

  deploy(sim, u, o) {
    if (u.def.deploy) {
      if (u.off.deploy) return true;
      const el = elevOf(u.def);
      u.path = null; u.depT = 1; u.elevT = el; u.wantElev = el;
      return u.dep >= 1 && u.elev >= el;
    }
    if (u.def.mast) { u.path = null; u.mastT = 1; return u.mast >= 1; }
    return true;
  },

  undeploy(sim, u, o) {
    if (u.def.deploy) { u.depT = 0; u.elevT = 0; u.wantElev = 0; return u.dep === 0 && u.elev === 0; }
    if (u.def.mast) { u.mastT = 0; return u.mast === 0; }
    return true;
  },

  reload(sim, u, o) {
    const d = u.def;
    if (u.type === 'transloader') {
      if (u.off.reload) return true;
      if (o.target) {
        const T = sim.units.get(o.target);
        if (!T || !T.alive || T.side !== u.side || T.ammo.oniks >= T.def.weapons.oniks.ammo) return true;
        if (u.cargo <= 0) return true;
        if (T.reloader && T.reloader !== u.id) return true;
        const side = [T.pos[0] + Math.cos(T.hdg) * 9, T.pos[2] - Math.sin(T.hdg) * 9];
        const near = dxz(u.pos[0], u.pos[2], T.pos[0], T.pos[2]) < 45;
        if (!near) { moveTo(sim, u, o, side[0], side[1], 30); return false; }
        u.path = null;
        if (u.speed > .3) return false;
        if (!T.reloader) { T.reloader = u.id; T.reloadP = 0; if (!T.wantElev && T.elev > 0) T.wantElev = TEL_ELEV; }
        return false;       // stays until the TEL ends the reload (then the order completes via checks above)
      }
      // no target: go and fill up at a depot
      if (u.cargo >= d.cargo) return true;
      if (atDepot(sim, u)) { u.path = null; return false; }
      const dp = nearestDepot(sim, u);
      if (!dp) return true;
      moveTo(sim, u, o, dp[0], dp[1], 300);
      return false;
    }
    if (u.type === 'tel') {
      if (u.ammo.oniks >= d.weapons.oniks.ammo) return true;
      if (u.reloader) return true;
      let best = null, bd = 1e18;
      for (const v of sim.alive(u.side)) if (v.type === 'transloader' && v.cargo > 0 && !v.busy && !v.off.reload) {
        const dd = dxz(u.pos[0], u.pos[2], v.pos[0], v.pos[2]);
        if (dd < bd && !(v.orders[0] && v.orders[0].kind === 'reload' && v.orders[0].target && v.orders[0].target !== u.id)) { bd = dd; best = v; }
      }
      if (best) { give(sim, best, { kind: 'reload', target: u.id }); return true; }
      // no transloader free: drive to a depot and load there
      if (o.depot === false) return true;
      if (atDepot(sim, u)) { u.path = null; u.depotLoad = true; return u.ammo.oniks >= d.weapons.oniks.ammo; }
      const dp = nearestDepot(sim, u);
      if (!dp) return true;
      moveTo(sim, u, o, dp[0], dp[1], 400);
      return false;
    }
    if (d.domain === 'air') { u.orders[0] = { kind: 'return' }; return false; }
    if (d.domain === 'sea') {
      const R = replenishPoint(sim, u);
      const magFull = !u.mag || Object.keys(u.mag).every(k => u.mag[k] >= u.def.magazine[k]);
      if (!R || (ammoFull(u) && magFull)) return true;
      const inside = dxz(u.pos[0], u.pos[2], R.x, R.z) < R.r * .8;
      if (!inside) { moveTo(sim, u, o, R.x, R.z, R.r * .5); return false; }
      u.path = null;
      return ammoFull(u) && magFull;
    }
    if (u.type === 'pantsir' || u.type === 'bal') {
      if (ammoFull(u)) return true;
      if (u.type === 'bal' && (u.dep > 0 || u.elev > 0)) { u.depT = 0; u.elevT = 0; u.wantElev = 0; if (!canMove(u)) return false; }
      if (atDepot(sim, u)) { u.path = null; return ammoFull(u); }
      const dp = nearestDepot(sim, u); if (!dp) return true;
      moveTo(sim, u, o, dp[0], dp[1], 300); return false;
    }
    return true;
  },

  scan(sim, u, o) {
    const sc = u.def.scan;
    if (!sc || u.off.scan) return true;
    if (u.aboard) { requestLaunch(sim, u); return false; }
    const d = dxz(u.pos[0], u.pos[2], o.x, o.z);
    if (d > sc.reach) {
      if (u.def.static || (o.stay && u.def.domain !== 'air')) return true;
      const f = (d - sc.reach * .9) / d;
      const x = u.pos[0] + (o.x - u.pos[0]) * f, z = u.pos[2] + (o.z - u.pos[2]) * f;
      if (u.def.domain === 'air') { u.goal = [x, z]; u.orbitR = 0; return false; }
      if (u.off.move) return true;
      if (!canMove(u)) { stow(sim, u); return false; }
      if (!u.path || dxz(u.goal[0], u.goal[1], x, z) > 2000) { if (!goSurface(sim, u, x, z)) return true; }
      return false;
    }
    if (u.def.domain !== 'air') u.path = null;
    if (u.def.mast) {
      if (u.mast < 1) { u.mastT = 1; return false; }
      if (!u.radarOn) sim.setRadar(u, true);
    }
    const why = scanBlocked(sim, u);
    if (why === 'cooldown') { o.waited = (o.waited || 0) + 1; return o.waited > 20 * 120; }
    if (why) return true;
    startScan(sim, u, o.x, o.z);
    if (u.def.domain === 'air' && u.type !== 'fighter') { u.goal = [o.x, o.z]; u.orbitR = u.type === 'helo' ? 0 : 1500; }
    return true;
  },

  launch_drone(sim, u, o) {
    if (u.type !== 'catapult' || u.off.launch || u.drones <= 0) return true;
    if (u.speed > .3) { u.path = null; return false; }
    u.path = null;
    if (o._t0 === undefined) o._t0 = sim.t;
    const prep = u.def.launchPrep, a = sim.t - o._t0;
    u.carriage = clamp((a - (prep - 1.2)) / 1.2, 0, 1);
    if (a < prep) return false;
    u.drones--;
    const s = Math.sin(u.hdg), c = Math.cos(u.hdg);
    const dr = sim.spawn('drone', u.side, u.pos[0] + s * 4, u.pos[2] + c * 4, { hdg: u.hdg, alt: 20 });
    dr.speed = 25; dr.born = sim.t;
    const x = o.x !== undefined ? o.x : u.pos[0] + s * 8000, z = o.z !== undefined ? o.z : u.pos[2] + c * 8000;
    dr.orders.push({ kind: 'patrol', x, z, r: o.r });
    sim.emit('takeoff', { unit: dr.id, side: u.side, type: 'drone', from: u.id, pos: dr.pos.slice() });
    return true;
  },

  return(sim, u, o) {
    const d = u.def;
    if (d.domain === 'air') {
      if (u.aboard) return true;
      const home = homeOf(sim, u);
      if (!home) { u.goal = [u.pos[0], u.pos[2]]; u.orbitR = u.type === 'helo' ? 0 : 2000; return true; }
      u.goal = [home.pos[0], home.pos[2]]; u.orbitR = 0;
      const dist = dxz(u.pos[0], u.pos[2], home.pos[0], home.pos[2]);
      if (u.type === 'drone') {
        if (dist < 300) {
          home.drones++;
          u.alive = false; u.hp = 0; u.dying = 1; u.recovered = true;
          sim.emit('land', { unit: u.id, side: u.side, type: u.type, to: home.id, pos: u.pos.slice() });
          sim._dirty = true;
          return true;
        }
        return false;
      }
      u.landing = home.id;
      if (dist < 1500 && u.pos[1] < home.pos[1] + 400) {
        u.aboard = home.id; u.aboardOf = home.id; u.landing = false; u.speed = 0; u.orbitR = 0;
        u.rearmT = sim.t + d.rearm; u.goal = null; u.roll = 0; u.pitch = 0;
        sim.emit('land', { unit: u.id, side: u.side, type: u.type, to: home.id, pos: u.pos.slice() });
        return true;
      }
      return false;
    }
    if (d.domain === 'sea') { o.kind = 'reload'; return false; }
    const s = sim.map.spawns && sim.map.spawns[u.side];
    if (!s) return true;
    return moveTo(sim, u, o, s.x, s.z, 400);
  },

  hold(sim, u, o) { u.hold = o.on !== false; if (u.hold) u.path = null; return true; },
  stop(sim, u) { u.path = null; return true; },
  radar(sim, u, o) { if (u.def.sensors.radar) sim.setRadar(u, o.on === undefined ? !u.radarOn : o.on); return true; },
  dive(sim, u, o) { give(sim, u, Object.assign({}, o, { queue: false })); return true; },
};

/* ---------- attack helpers ---------- */
const GRACE = 300;          // s a persistent attack holds a lost track before it ends
const LOOK = 4;             // s after a volley's last round is down before the next volley

/* the unit's offensive weapon against a domain (the first that fits); with `ammo` only one with rounds in hand */
function pickWeapon(u, dom, ammo) {
  const W = u.def.weapons;
  for (const k in W) {
    const X = W[k];
    if (X.auto && !X.vs.includes('land') && !X.vs.includes('sea') && !(dom === 'air' && X.vs.includes('air'))) continue;
    if (!X.vs.includes(dom) || u.off[k] || (ammo && u.ammo[k] <= 0)) continue;
    return X;
  }
  return null;
}

/* rounds in a volley: the order's salvo, else the unit's setting (1, 2, 0 = all in hand), else the weapon's own */
export function volleySize(u, o, w) {
  const s = o.salvo !== undefined ? o.salvo : u.salvo !== undefined ? u.salvo : null;
  if (s === 0) return Math.max(1, u.ammo[w.name]);
  if (s === null) return w.salvo || 1;
  return w.proj === 'shell' ? s * (w.salvo || 1) : s;      // a gun's volley is bursts of its salvo
}

/* close to the weapon's range, then stop, erect, come up to periscope depth: 'close' | 'fire' | 'end' */
function engageFrom(sim, u, o, w, c) {
  const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]);
  if (d > w.range * .97) {
    // close to 85% of range along the line to the target
    const f = (d - w.range * .85) / d;
    const x = u.pos[0] + (c.pos[0] - u.pos[0]) * f, z = u.pos[2] + (c.pos[2] - u.pos[2]) * f;
    if (u.def.domain === 'air') { u.goal = [x, z]; u.orbitR = 0; return 'close'; }
    if (u.def.static || u.off.move) return 'end';
    if (!canMove(u)) { stow(sim, u); return 'close'; }
    if (!u.path || dxz(u.goal[0], u.goal[1], x, z) > w.range * .1) { if (!goSurface(sim, u, x, z)) return 'end'; }
    return 'close';
  }
  if (d < (w.min || 0)) return 'end';
  if (u.def.domain !== 'air') { u.path = null; }
  else if (u.type !== 'fighter') { u.goal = [u.pos[0], u.pos[2]]; }
  if (w.needs === 'erect') { const el = elevOf(u.def); u.wantElev = el; if (!u.reloader) { u.depT = 1; u.elevT = el; } }
  // missiles leave a boat from periscope depth: come up for the salvo (and go back down after it)
  if (w.sub && u.def.sub && u.dive === 2) { if (o._dive === undefined) o._dive = 2; u.dive = 1; }
  return 'fire';
}

/* between volleys and while holding: a boat goes back to its depth, a unit waiting on a track stops where it is */
function standDown(u, o, stop) {
  if (o._dive !== undefined && u.def.sub) { u.dive = o._dive; o._dive = undefined; }
  if (!stop) return;
  if (u.def.domain === 'air') { if (!u.aboard && u.orbitR === 0) { u.goal = [u.pos[0], u.pos[2]]; u.orbitR = u.type === 'helo' ? 0 : 1500; } }
  else u.path = null;
}

/* this unit's rounds still flying at the target */
function roundsAt(sim, u, target) {
  let n = 0;
  for (const p of sim.projectiles.values()) if (p.alive && p.from === u.id && p.target === target && p.tk === 'unit') n++;
  return n;
}

/* a reload is on its way to (or under way at) this unit; with `busy`, also a transloader with rounds that is busy
   with another launcher (the TEL calls it when that one is done) */
function reloadComing(sim, u, busy) {
  if (u.reloader || u.depotLoad) return true;
  for (const v of sim.alive(u.side)) {
    if (v.type !== 'transloader' || v.cargo <= 0 || v.off.reload) continue;
    const q = v.orders[0];
    if (q && q.kind === 'reload' && q.target === u.id) return true;
    if (busy && u.type === 'tel' && (v.busy || (q && q.kind === 'reload' && q.target))) return true;
  }
  return false;
}

/* an empty TEL on a persistent attack calls the nearest idle transloader with rounds (it does not drive off to a
   depot, and a transloader busy with an order of its own is left alone) */
function callLoader(sim, u) {
  if (u.type !== 'tel' || u.off.reload) return false;
  let best = null, bd = 1e18;
  for (const v of sim.alive(u.side)) {
    if (v.type !== 'transloader' || v.cargo <= 0 || v.busy || v.off.reload || v.orders.length) continue;
    const d = dxz(u.pos[0], u.pos[2], v.pos[0], v.pos[2]);
    if (d < bd) { bd = d; best = v; }
  }
  if (!best) return false;
  give(sim, best, { kind: 'reload', target: u.id });
  return true;
}

function engageEvent(sim, u, o, state, why) {
  sim.emit('engage', { unit: u.id, side: u.side, target: o.target, track: o.track || '', state, why: why || '', n: o.vol || 0, weapon: o.w || '', pos: u.pos.slice() });
}
function endAttack(sim, u, o, why) {
  standDown(u, o, false);
  o.hot = false; o.st = 'done';
  engageEvent(sim, u, o, 'done', why);
  return true;
}

function persistAttack(sim, u, o) {
  const t = sim.t, c = sim.sides[u.side].contacts.get(o.target), e = sim.units.get(o.target);
  if (c) o.track = c.track;
  if (o.vol === undefined) { o.vol = 0; o.fired = 0; o.hot = false; o.st = 'close'; }
  if (!e || !e.alive || (c && c.dead)) return endAttack(sim, u, o, 'destroyed');
  // aircraft still go home on fuel (autoReturn swaps the order for a return)
  if (u.def.domain === 'air' && !u.aboard && autoReturn(sim, u)) return false;
  // a volley is complete when its rounds are away (or the weapon ran dry mid-volley)
  if (o.hot && o.w && ((o.fired || 0) >= o.vn || (o.fired > 0 && u.ammo[o.w] <= 0))) {
    o.vol++; o.hot = false; o.fired = 0; o.st = 'look'; o.lookT = t;
    engageEvent(sim, u, o, 'volley');
  }
  // the track: lost (below classification or gone from the picture) holds the order, for GRACE s
  if (!c || c.conf < CLASSIFY) {
    if (o.lostT === undefined) { o.lostT = t; o.hot = false; engageEvent(sim, u, o, 'lost'); }
    if (o.st !== 'lost') o.was = o.st;
    o.st = 'lost';
    standDown(u, o, true);
    // the grace runs from the last of this unit's rounds at the target coming down (a hit may still tell)
    if ((sim.tick + u.id) % 20 === 0 && roundsAt(sim, u, o.target) > 0) o.lostT = t;
    return t - o.lostT > GRACE ? endAttack(sim, u, o, 'lost') : false;
  }
  if (o.lostT !== undefined) { o.lostT = undefined; o.st = o.was === 'look' ? 'look' : 'close'; engageEvent(sim, u, o, 'resume'); }
  // the weapon: chosen once and kept (a destroyer out of strike rounds does not sail in to use its gun)
  let w = o.w ? u.def.weapons[o.w] : null;
  if (!w) {
    w = pickWeapon(u, c.dom, true) || pickWeapon(u, c.dom, false);
    if (!w) return endAttack(sim, u, o, 'noweapon');
    o.w = w.name;
  }
  if (u.off[w.name]) return endAttack(sim, u, o, 'out');
  // empty: wait for a reload that is coming (a TEL calls a transloader), else the order is over
  if (u.ammo[w.name] <= 0) {
    o.hot = false; o.fired = 0;
    if (reloadComing(sim, u, false) || callLoader(sim, u) || reloadComing(sim, u, true)) {
      if (o.st !== 'reload') o.st = 'reload';
      standDown(u, o, false);
      if (w.needs === 'erect') u.wantElev = elevOf(u.def);
      return false;
    }
    return endAttack(sim, u, o, 'empty');
  }
  if (o.st === 'reload') o.st = 'look';
  // look: the next volley once this unit's rounds at the target are down (and a breath after)
  if (o.st === 'look') {
    if (roundsAt(sim, u, o.target) > 0) o.lookT = t;
    if (t - o.lookT < LOOK) { standDown(u, o, false); return false; }
    o.st = 'close';
  }
  if (u.aboard) { requestLaunch(sim, u); return false; }
  if (!o.hot) { o.vn = volleySize(u, o, w); o.fired = 0; o.hot = true; }
  const r = engageFrom(sim, u, o, w, c);
  if (r === 'end') return endAttack(sim, u, o, 'reach');
  o.st = r;
  return false;
}

function nearestDepot(sim, u) {
  let best = null, bd = 1e18;
  const enemy = u.side === 'coast' ? 'fleet' : 'coast';
  for (const o of sim.objectives) if ((o.kind === 'depot' || o.kind === 'port') && o.owner !== enemy && sim.nav.open('land', o.x, o.z)) {
    const d = dxz(u.pos[0], u.pos[2], o.x, o.z); if (d < bd) { bd = d; best = [o.x, o.z]; }
  }
  const s = sim.map.spawns && sim.map.spawns[u.side];
  if (s) { const d = dxz(u.pos[0], u.pos[2], s.x, s.z); if (d < bd) best = [s.x, s.z]; }
  return best;
}

export { nearestDepot, homeOf };
