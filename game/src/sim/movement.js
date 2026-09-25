/* Movement: land units stay on land (faster on roads, slower on slopes), ships stay in water deeper than their
   draught, submarines in deep water only (and at their depth), aircraft fly direct at their altitude band. Hard
   rules are enforced per step, the nav grid only plans. */
import { clamp, angTo, ground } from './util.js';
import { DT } from './consts.js';
import { kill } from './damage.js';
import { subSpeed, submerged } from './subs.js';
import { hoverOK, dockMove, followHost } from './amphib.js';
import { drive, passWaypoint, attitudeLand, attitudeShip, flyAir } from './dynamics.js';

/* the nav grid a unit plans on: boats keep to the deep-water grid */
export const navDom = u => u.def.hover ? 'hover' : u.def.sub ? 'sub' : u.def.domain;

const G = 9.81;

export function canMove(u) {
  return u.alive && !u.def.static && !u.off.move && u.dep === 0 && u.elev === 0 && u.mast === 0 && !u.reloader && !u.busy && !u.dockT && !(u.lift > 0);
}
/* lower everything so the unit can drive (TEL: launcher down then jacks up; radar: mast down) */
export function stow(sim, u) {
  if (u.dep > 0 || u.elev > 0) { u.elevT = 0; u.depT = 0; }
  if (u.mast > 0) u.mastT = 0;
  if (u.lift > 0 || u.def.lift) u.stowT = sim.t;              // the Kornet's launcher comes down (mech.js)
}

export function moveUnit(sim, u) {
  if (u.aboard) return followCarrier(sim, u);
  if (u.dockT) return dockMove(sim, u);                   // an LCAC passing the LHD's stern gate
  const dom = u.def.domain;
  if (dom === 'air') return moveAir(sim, u);
  if (u.def.static) { u.speed = 0; return; }
  moveSurface(sim, u, dom);
}

function followCarrier(sim, u) {
  const cv = sim.units.get(u.aboard);
  if (!cv) return;
  if (u.def.domain !== 'air' && cv.def.carry) return followHost(sim, u);   // a craft in the well, a vehicle on a deck
  u.pos[0] = cv.pos[0]; u.pos[1] = cv.pos[1] + (cv.def.air ? cv.def.air.deckY : 10); u.pos[2] = cv.pos[2]; u.hdg = cv.hdg; u.speed = 0; u.pitch = 0; u.roll = 0;
}

function speedCap(sim, u, dom) {
  const d = u.def;
  let v;
  if (dom === 'land') {
    // road / off-road governor; the grade along the heading and the side slope are the dynamics' (dynamics.js)
    const road = u.onRoad = sim.nav.isRoad(u.pos[0], u.pos[2]);
    v = road ? d.road : d.hover ? d.speed * (1 - .6 * Math.min(1, sim.map.slope(u.pos[0], u.pos[2]) / .45)) : d.speed;
  } else v = d.sub ? subSpeed(u) : d.speed;
  // a hovercraft: slower over land, and only on cushion; a ship with its well deck open keeps to a few knots
  if (d.hover) { if (sim.map.h(u.pos[0], u.pos[2]) > 0) v = Math.min(v, d.landSpeed || v); v *= Math.max(0, Math.min(1, ((u.cushion || 0) - .5) * 2)); }
  if (d.well && (u.well > 0 || u.wellT > 0)) v = Math.min(v, d.well.slow);
  for (const p in u.parts) if (u.parts[p] >= 1 && d.parts[p].slow) v *= d.parts[p].slow;
  if (u.hp < u.hpMax * .35) v *= .7;
  if (u.spdCap > 0 && u.spdCap < v) v = u.spdCap;
  return v;
}

function valid(sim, u, dom, x, z) {
  // never off the map (a goal beyond its edge is sailed toward and stopped at the edge; aircraft are clamped to it)
  if (Math.abs(x) > sim.map.W / 2 - 300 || Math.abs(z) > sim.map.H / 2 - 300) return false;
  if (u.def.hover) return hoverOK(sim, x, z);
  const h = sim.map.h(x, z);
  if (dom === 'land') return h >= .3;
  if (u.def.sub) return h <= -u.def.sub.water;
  return h <= -(u.def.draught + 1.5);
}

function moveSurface(sim, u, dom) {
  const d = u.def, map = sim.map, hov = !!d.hover;
  let vT = 0, turnTo = null, last = false, dist = 0;
  if (u.path && u.wi < u.path.length && canMove(u)) {
    const wp = u.path[u.wi];
    const dx = wp[0] - u.pos[0], dz = wp[1] - u.pos[2];
    dist = Math.sqrt(dx * dx + dz * dz); last = u.wi === u.path.length - 1;
    const arr = last ? (dom === 'land' || hov ? 20 : 150) : (dom === 'land' || hov ? sim.nav.cell * .45 : sim.nav.cell * .9);
    if (dist < arr || passWaypoint(u, dist)) {
      u.wi++;
      if (u.wi >= u.path.length) { u.path = null; }
    } else {
      turnTo = Math.atan2(dx, dz);
      vT = speedCap(sim, u, dom);
      if (last) vT = Math.min(vT, Math.sqrt(2 * d.accel * Math.max(0, dist - arr * .5)) + .5);
    }
  }
  // steering and speed: physical for vehicles and ships (dynamics.js); the hovercraft keeps the plain rules below
  const phys = drive(sim, u, dom, vT, turnTo, dist, last);
  if (!phys && turnTo !== null) {
    const err = angTo(u.hdg, turnTo);
    let rate = d.turn;
    if (dom === 'sea' && !hov) rate *= .35 + .65 * Math.min(1, u.speed / (d.speed * .5));
    else if (hov && Math.abs(err) > 1.0) vT *= .3;              // a hovercraft yaws round nearly in place
    u.hdg += clamp(err, -rate * DT, rate * DT);
    if (dom === 'land' && Math.abs(err) > .9) vT *= .25;
    else if (dom === 'sea' && Math.abs(err) > 1.2) vT *= .7;
  }
  if (!phys) u.speed += clamp(vT - u.speed, -d.accel * 2 * DT, d.accel * DT);
  if (u.speed < .01 && vT === 0) u.speed = 0;
  if (u.speed > 0) {
    const step = u.speed * DT;
    let h = u.hdg, nx = u.pos[0] + Math.sin(h) * step, nz = u.pos[2] + Math.cos(h) * step;
    if (!valid(sim, u, dom, nx, nz)) {
      let ok = false;
      for (const off of [.35, -.35, .7, -.7, 1.2, -1.2, 1.8, -1.8]) {
        const hh = u.hdg + off, x = u.pos[0] + Math.sin(hh) * step, z = u.pos[2] + Math.cos(hh) * step;
        if (valid(sim, u, dom, x, z)) { nx = x; nz = z; h = hh; ok = true; break; }
      }
      if (!ok) {
        u.speed = 0; u.blocked++;
        if (u.blocked > 40 && u.goal) {
          u.blocked = 0; u.repaths = (u.repaths || 0) + 1;
          u.path = u.repaths > 4 ? null : sim.nav.path(navDom(u), u.pos[0], u.pos[2], u.goal[0], u.goal[1]);
          u.wi = 0;
          if (u.path && u.path.length && dom === 'sea') u.path.unshift(escapePoint(sim, u));
        }
        nx = u.pos[0]; nz = u.pos[2];
      } else { u.hdg += clamp(angTo(u.hdg, h), -.1, .1); u.blocked = Math.max(0, u.blocked - 1); }
    } else if (u.blocked) u.blocked--;
    u.odo += Math.sqrt((nx - u.pos[0]) ** 2 + (nz - u.pos[2]) ** 2);
    u.pos[0] = nx; u.pos[2] = nz;
  }
  // attitude (recomputed only when the unit moved or turned)
  if (hov && map.h(u.pos[0], u.pos[2]) > -.5) {
    // a hovercraft over the beach rides level over the ground under its skirt
    const x = u.pos[0], z = u.pos[2], s = Math.sin(u.hdg), c = Math.cos(u.hdg), L = d.size[0] * .4, W = d.size[1] * .4;
    const g = q => Math.max(0, map.h(q[0], q[1]));
    u.pos[1] = g([x, z]);
    u.pitch = Math.atan2(g([x + s * L, z + c * L]) - g([x - s * L, z - c * L]), 2 * L) * .8;
    u.roll = Math.atan2(g([x - c * W, z + s * W]) - g([x + c * W, z - s * W]), 2 * W) * .8;
  } else if (dom === 'land') {
    // the ground under the wheels and the body on its springs (dynamics.js)
    attitudeLand(sim, u);
  } else if (!hov) {
    // heel, squat, trim, flooding; a boat's depth and dive angle; an LHD's ballast (dynamics.js). The swell is the
    // render pose's (sim/sea.js: the same waves the sea is drawn with)
    attitudeShip(sim, u);
  } else {
    u.pos[1] = 0; u.pitch = 0; u.roll = 0;
  }
  if (u.path === null && u.orders.length === 0) u.spdCap = 0;
}

/* a nearby point in open water to back out of a dead end */
function escapePoint(sim, u) {
  for (let r = 300; r <= 2400; r += 300) for (let k = 0; k < 12; k++) {
    const a = u.hdg + Math.PI + (k - 6) * .5, x = u.pos[0] + Math.sin(a) * r, z = u.pos[2] + Math.cos(a) * r;
    if (valid(sim, u, 'sea', x, z)) return [x, z];
  }
  return [u.pos[0], u.pos[2]];
}

function moveAir(sim, u) {
  // bank to turn, energy, the catapult, the approach and the wires, the rotor's tilt (dynamics.js)
  flyAir(sim, u);
  u.fuel -= DT;
  if (u.def.endurance && u.fuel < -600) { kill(sim, u, null); return; }     // nowhere to land: ditches
  const W = sim.map.W / 2, H = sim.map.H / 2;
  if (u.pos[0] < -W) u.pos[0] = -W; else if (u.pos[0] > W) u.pos[0] = W;
  if (u.pos[2] < -H) u.pos[2] = -H; else if (u.pos[2] > H) u.pos[2] = H;
}
