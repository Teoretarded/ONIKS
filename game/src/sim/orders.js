/* Orders: issue (with formations for groups) and per-tick processing of each unit's order queue.
   order = { kind: 'move'|'attack'|'stop'|'hold'|'deploy'|'undeploy'|'reload'|'scan'|'radar'|'launch_drone'
             |'patrol'|'return', x?, z?, target?, on?, n?, r?, queue? } */
import { CLASSIFY, TEL_ELEV, UNITS } from '../data/units.js';
import { canMove, stow } from './movement.js';
import { startScan, scanBlocked } from './sensors.js';
import { ammoFull, atDepot } from './mech.js';
import { dxz, clamp } from './util.js';

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
  if (o.kind === 'stop') { cancel(sim, u); u.orders.length = 0; u.path = null; u.spdCap = 0; if (u.def.domain === 'air' && !u.aboard) { u.goal = [u.pos[0], u.pos[2]]; u.orbitR = u.def.domain === 'air' && u.type !== 'helo' ? 1500 : 0; } return; }
  if (o.kind === 'radar') { if (u.def.sensors.radar) sim.setRadar(u, o.on === undefined ? !u.radarOn : o.on); return; }
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
  if (!u.orbitR && u.type !== 'helo') u.orbitR = u.type === 'fighter' ? 6000 : 1500;
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
  let best = null, bd = 1e18;
  for (const v of sim.alive(u.side)) {
    if (u.type === 'drone') { if (v.type !== 'catapult') continue; }
    else if (!v.def.air || !v.def.air.types.includes(u.type) || v.off.air) continue;
    else if (v.type !== 'carrier' && v !== sim.units.get(u.aboardOf || 0) && deckFull(sim, v)) continue;
    const dd = dxz(u.pos[0], u.pos[2], v.pos[0], v.pos[2]);
    if (dd < bd) { bd = dd; best = v; }
  }
  return best;
}

function deckFull(sim, v) {
  let n = 0; for (const w of sim.alive(v.side)) if (w.aboard === v.id || w.landing === v.id) n++;
  return n >= v.def.air.cap;
}

function requestLaunch(sim, u) {
  const cv = sim.units.get(u.aboard);
  if (!cv || !cv.alive) return;
  if (!cv.launchQ.includes(u.id)) cv.launchQ.push(u.id);
}

/* surface path to (x, z); returns false when nothing is reachable */
function goSurface(sim, u, x, z) {
  u.goal = [x, z];
  u.path = sim.nav.path(u.def.domain, u.pos[0], u.pos[2], x, z);
  u.wi = 0; u.blocked = 0; u.repaths = 0;
  return !!u.path;
}

function moveTo(sim, u, o, x, z, arrive) {
  const dom = u.def.domain;
  if (dom === 'air') {
    if (u.aboard) { requestLaunch(sim, u); return false; }
    u.goal = [x, z]; u.orbitR = 0;
    return dxz(u.pos[0], u.pos[2], x, z) < (arrive || (u.type === 'fighter' ? 2500 : 400));
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
    if (done && u.def.domain === 'air') { u.goal = [o.x, o.z]; u.orbitR = u.type === 'helo' ? 0 : u.type === 'fighter' ? 6000 : 1500; }
    return done;
  },

  patrol(sim, u, o) {
    if (u.def.domain === 'air') {
      if (u.aboard) { requestLaunch(sim, u); return false; }
      u.goal = [o.x, o.z];
      u.orbitR = o.r || (u.type === 'fighter' ? 9000 : u.type === 'helo' ? 3500 : 2500);
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

  attack(sim, u, o) {
    const S = sim.sides[u.side], c = S.contacts.get(o.target);
    if (!c || c.dead || c.conf < CLASSIFY) return true;
    const dom = c.dom, W = u.def.weapons;
    let w = null;
    for (const k in W) {
      const X = W[k];
      if (X.auto && !X.vs.includes('land') && !X.vs.includes('sea') && !(dom === 'air' && X.vs.includes('air'))) continue;
      if (!X.vs.includes(dom) || u.ammo[k] <= 0 || u.off[k]) continue;
      w = X; break;
    }
    if (!w) return true;
    o.w = w.name;
    const n = o.n || w.salvo || 1;
    if ((o.fired || 0) >= n) return true;
    if (u.aboard) { requestLaunch(sim, u); return false; }
    const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]);
    if (d > w.range * .97) {
      // close to 85% of range along the line to the target
      const f = (d - w.range * .85) / d;
      const x = u.pos[0] + (c.pos[0] - u.pos[0]) * f, z = u.pos[2] + (c.pos[2] - u.pos[2]) * f;
      if (u.def.domain === 'air') { u.goal = [x, z]; u.orbitR = 0; return false; }
      if (u.def.static || u.off.move) return true;
      if (!canMove(u)) { stow(sim, u); return false; }
      if (!u.path || dxz(u.goal[0], u.goal[1], x, z) > w.range * .1) { if (!goSurface(sim, u, x, z)) return true; }
      return false;
    }
    if (d < (w.min || 0)) return true;
    if (u.def.domain !== 'air') { u.path = null; }
    else if (u.type !== 'fighter') { u.goal = [u.pos[0], u.pos[2]]; }
    if (w.needs === 'erect') { u.wantElev = TEL_ELEV; if (!u.reloader) { u.depT = 1; u.elevT = TEL_ELEV; } }
    return false;
  },

  deploy(sim, u, o) {
    if (u.def.deploy) {
      if (u.off.deploy) return true;
      u.path = null; u.depT = 1; u.elevT = TEL_ELEV; u.wantElev = TEL_ELEV;
      return u.dep >= 1 && u.elev >= TEL_ELEV;
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
      const R = sim.map.replenish;
      const magFull = !u.mag || Object.keys(u.mag).every(k => u.mag[k] >= u.def.magazine[k]);
      if (!R || (ammoFull(u) && magFull)) return true;
      const inside = dxz(u.pos[0], u.pos[2], R.x, R.z) < R.r * .8;
      if (!inside) { moveTo(sim, u, o, R.x, R.z, R.r * .5); return false; }
      u.path = null;
      return ammoFull(u) && magFull;
    }
    if (u.type === 'pantsir') {
      if (ammoFull(u)) return true;
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
};

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
