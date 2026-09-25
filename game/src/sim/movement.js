/* Movement: land units stay on land (faster on roads, slower on slopes), ships stay in water deeper than their
   draught, aircraft fly direct at their altitude band. Hard rules are enforced per step, the nav grid only plans. */
import { clamp, angTo, ground } from './util.js';
import { DT } from './consts.js';
import { kill } from './damage.js';

const G = 9.81;

export function canMove(u) {
  return u.alive && !u.def.static && !u.off.move && u.dep === 0 && u.elev === 0 && u.mast === 0 && !u.reloader && !u.busy;
}
/* lower everything so the unit can drive (TEL: launcher down then jacks up; radar: mast down) */
export function stow(sim, u) {
  if (u.dep > 0 || u.elev > 0) { u.elevT = 0; u.depT = 0; }
  if (u.mast > 0) u.mastT = 0;
}

export function moveUnit(sim, u) {
  if (u.aboard) return followCarrier(sim, u);
  const dom = u.def.domain;
  if (dom === 'air') return moveAir(sim, u);
  if (u.def.static) { u.speed = 0; return; }
  moveSurface(sim, u, dom);
}

function followCarrier(sim, u) {
  const cv = sim.units.get(u.aboard);
  if (!cv) return;
  u.pos[0] = cv.pos[0]; u.pos[1] = cv.pos[1] + (cv.def.air ? cv.def.air.deckY : 10); u.pos[2] = cv.pos[2]; u.hdg = cv.hdg; u.speed = 0; u.pitch = 0; u.roll = 0;
}

function speedCap(sim, u, dom) {
  const d = u.def;
  let v;
  if (dom === 'land') {
    const road = sim.nav.isRoad(u.pos[0], u.pos[2]);
    v = road ? d.road : d.speed * (1 - .6 * Math.min(1, sim.map.slope(u.pos[0], u.pos[2]) / .45));
  } else v = d.speed;
  for (const p in u.parts) if (u.parts[p] >= 1 && d.parts[p].slow) v *= d.parts[p].slow;
  if (u.hp < u.hpMax * .35) v *= .7;
  if (u.spdCap > 0 && u.spdCap < v) v = u.spdCap;
  return v;
}

function valid(sim, u, dom, x, z) {
  const h = sim.map.h(x, z);
  if (dom === 'land') return h >= .3;
  return h <= -(u.def.draught + 1.5);
}

function moveSurface(sim, u, dom) {
  const d = u.def, map = sim.map;
  let vT = 0, turnTo = null, last = false, dist = 0;
  if (u.path && u.wi < u.path.length && canMove(u)) {
    const wp = u.path[u.wi];
    const dx = wp[0] - u.pos[0], dz = wp[1] - u.pos[2];
    dist = Math.sqrt(dx * dx + dz * dz); last = u.wi === u.path.length - 1;
    const arr = last ? (dom === 'land' ? 20 : 150) : (dom === 'land' ? sim.nav.cell * .45 : sim.nav.cell * .9);
    if (dist < arr) {
      u.wi++;
      if (u.wi >= u.path.length) { u.path = null; }
    } else {
      turnTo = Math.atan2(dx, dz);
      vT = speedCap(sim, u, dom);
      if (last) vT = Math.min(vT, Math.sqrt(2 * d.accel * Math.max(0, dist - arr * .5)) + .5);
    }
  }
  // steering
  if (turnTo !== null) {
    const err = angTo(u.hdg, turnTo);
    let rate = d.turn;
    if (dom === 'sea') rate *= .35 + .65 * Math.min(1, u.speed / (d.speed * .5));
    u.hdg += clamp(err, -rate * DT, rate * DT);
    if (dom === 'land' && Math.abs(err) > .9) vT *= .25;
    else if (dom === 'sea' && Math.abs(err) > 1.2) vT *= .7;
  }
  u.speed += clamp(vT - u.speed, -d.accel * 2 * DT, d.accel * DT);
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
          u.path = u.repaths > 4 ? null : sim.nav.path(dom, u.pos[0], u.pos[2], u.goal[0], u.goal[1]);
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
  if (dom === 'land') {
    if (u._ax !== u.pos[0] || u._az !== u.pos[2] || u._ah !== u.hdg) {
      u._ax = u.pos[0]; u._az = u.pos[2]; u._ah = u.hdg;
      const x = u.pos[0], z = u.pos[2], s = Math.sin(u.hdg), c = Math.cos(u.hdg), L = d.size[0] * .4, W = d.size[1] * .5;
      const hf = map.h(x + s * L, z + c * L), hb = map.h(x - s * L, z - c * L), hr = map.h(x + c * W, z - s * W), hl = map.h(x - c * W, z + s * W);
      u.pos[1] = Math.max(0, map.h(x, z));
      u.pitch = Math.atan2(hf - hb, 2 * L);
      u.roll = Math.atan2(hl - hr, 2 * W);
    }
  } else {
    const sea = (sim.map.weather && sim.map.weather.sea) || .2, t = sim.t + u.id * 3.1;
    u.pos[1] = Math.sin(t * .7) * .3 * sea;
    u.pitch = Math.sin(t * .45) * .006 * sea * (160 / d.size[0]);
    u.roll = Math.sin(t * .31) * .02 * sea + (u.speed > 2 && u.path ? clamp(angTo(u.prevHdg, u.hdg) / DT * -2, -.08, .08) : 0);
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
  const d = u.def, map = sim.map;
  if (!u.goal) u.goal = [u.pos[0] + Math.sin(u.hdg) * 2000, u.pos[2] + Math.cos(u.hdg) * 2000];
  const gx = u.goal[0], gz = u.goal[1], dx = gx - u.pos[0], dz = gz - u.pos[2], dist = Math.sqrt(dx * dx + dz * dz);
  const R = u.orbitR;
  let want, vT = d.speed;
  for (const p in u.parts) if (u.parts[p] >= 1 && d.parts[p].slow) vT *= d.parts[p].slow;
  if (R > 0 && dist < R * 1.6) {
    // orbit clockwise around the goal
    const b = Math.atan2(-dx, -dz);                  // bearing from goal to aircraft
    want = b + Math.PI / 2 + clamp((dist - R) / R, -1, 1) * .9;
    if (u.type === 'drone' || u.type === 'helo') vT *= .8;
  } else {
    want = Math.atan2(dx, dz);
    if (u.type === 'helo' && R === 0) vT = Math.min(vT, dist * .12);
    if (u.type === 'drone' && R === 0 && dist < 600) { want = Math.atan2(dx, dz) + Math.PI / 2; }
  }
  if (u.type === 'fighter' && u.speed < 150) vT = Math.max(vT, 150);
  const err = angTo(u.hdg, want);
  const rate = d.turn * (u.type === 'helo' && u.speed < 20 ? 3 : 1);
  const turn = clamp(err, -rate * DT, rate * DT);
  u.hdg += turn;
  u.speed += clamp(vT - u.speed, -d.accel * DT * 1.5, d.accel * DT);
  if (u.speed < 0) u.speed = 0;
  const omega = turn / DT;
  u.roll += clamp(Math.atan(u.speed * omega / G) - u.roll, -.8 * DT, .8 * DT);
  // altitude band: terrain-following for helos and drones
  const s = Math.sin(u.hdg), c = Math.cos(u.hdg);
  let g = ground(map, u.pos[0], u.pos[2]);
  if (u.type !== 'fighter') g = Math.max(g, ground(map, u.pos[0] + s * u.speed * 8, u.pos[2] + c * u.speed * 8));
  let yT = g + u.altT;
  if (u.landing) {
    const cv = sim.units.get(u.landing);
    if (cv && dist < 12000) yT = Math.max(cv.pos[1] + (cv.def.air ? cv.def.air.deckY : 10) + 30, g + 30) + (u.altT - 30) * clamp((dist - 1500) / 10500, 0, 1);
  }
  const vy = clamp((yT - u.pos[1]) * .4, -d.climb, d.climb);
  u.pos[0] += s * u.speed * DT; u.pos[2] += c * u.speed * DT; u.pos[1] += vy * DT;
  if (u.pos[1] < g + 10) u.pos[1] = g + 10;
  u.pitch = Math.atan2(vy, Math.max(u.speed, 5));
  u.odo += u.speed * DT;
  u.fuel -= DT;
  if (u.def.endurance && u.fuel < -600) { kill(sim, u, null); return; }     // nowhere to land: ditches
  const W = sim.map.W / 2, H = sim.map.H / 2;
  if (u.pos[0] < -W) u.pos[0] = -W; else if (u.pos[0] > W) u.pos[0] = W;
  if (u.pos[2] < -H) u.pos[2] = -H; else if (u.pos[2] > H) u.pos[2] = H;
}
