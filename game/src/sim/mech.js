/* Per-unit timers and animations that are game state: TEL jacks and erector, radar mast, reloads from a
   transloader, refills at depots and at the replenishment point, turret slews, VLS hatches, aircraft rearm,
   carrier flight deck launches. */
import { TEL_ELEV } from '../data/units.js';
import { DT } from './consts.js';
import { clamp, angTo, wrapPi, dxz, local } from './util.js';

const SLEW = 1.6;   // rad/s turret slew

export function mechanics(sim, u) {
  const d = u.def, t = sim.t;
  for (const k in u.cooldowns) if (u.cooldowns[k] > 0) u.cooldowns[k] -= DT;

  // TEL: jacks down, then erect; lower before raising the jacks
  if (d.deploy) {
    const J = DT / d.deploy.jacks, E = TEL_ELEV * DT / d.deploy.erect;
    const wasDep = u.dep, wasElev = u.elev;
    if (u.off.deploy) { u.depT = u.dep; }
    if (u.depT > u.dep && u.speed < .3) u.dep = Math.min(u.depT, u.dep + J);
    else if (u.depT < u.dep && u.elev === 0) u.dep = Math.max(u.depT, u.dep - J);
    if (u.elevT > u.elev && u.dep >= 1 && !u.off.oniks) u.elev = Math.min(u.elevT, u.elev + E);
    else if (u.elevT < u.elev) u.elev = Math.max(u.elevT, u.elev - E);
    if (u.dep >= 1 && wasDep < 1) sim.emit('deploy', { unit: u.id, side: u.side, what: 'jacks', pos: u.pos.slice() });
    if (u.dep <= 0 && wasDep > 0) sim.emit('deploy', { unit: u.id, side: u.side, what: 'stowed', pos: u.pos.slice() });
    if (u.elev >= TEL_ELEV && wasElev < TEL_ELEV) sim.emit('deploy', { unit: u.id, side: u.side, what: 'erect', pos: u.pos.slice() });
    if (u.elev <= 0 && wasElev > 0) sim.emit('deploy', { unit: u.id, side: u.side, what: 'lowered', pos: u.pos.slice() });
    u.deployed = u.dep >= 1;
    if (u.reloader) reloadStep(sim, u);
    else if (u.depotLoad) depotReload(sim, u);
  }
  // radar mast
  if (d.mast) {
    const was = u.mast, r = DT / d.mast.time;
    if (u.mastT > u.mast && u.speed < .3) u.mast = Math.min(u.mastT, u.mast + r);
    else if (u.mastT < u.mast) u.mast = Math.max(u.mastT, u.mast - r);
    if (u.mast >= 1 && was < 1) sim.emit('deploy', { unit: u.id, side: u.side, what: 'mast_up', pos: u.pos.slice() });
    if (u.mast <= 0 && was > 0) sim.emit('deploy', { unit: u.id, side: u.side, what: 'mast_down', pos: u.pos.slice() });
    u.deployed = u.mast >= 1;
  }
  // radar antenna turns only while radiating and able to
  const R = d.sensors.radar;
  if (R) {
    const able = u.radarOn && !u.off.radar && (!R.needsMast || u.mast >= 1) && !u.aboard;
    const w = able ? Math.PI * 2 / R.period : 0;
    if (w !== u.antW) { const a = u.antA + u.antW * (t - u.antT); u.antA = a - Math.PI * 2 * Math.floor(a / (Math.PI * 2)); u.antT = t; u.antW = w; }
  }
  // turret (Pantsir module, DDG gun) slews toward the last aim bearing, back to fore when idle
  if (d.model === 'pantsir' || d.model === 'destroyer') {
    const idle = t - u.lastFire > 12;
    const yT = idle ? 0 : wrapPi(u.aimB - u.hdg), pT = idle ? 0 : u.aimP;
    u.tYaw += clamp(angTo(u.tYaw, yT), -SLEW * DT, SLEW * DT);
    u.tPitch += clamp(pT - u.tPitch, -SLEW * DT, SLEW * DT);
  }
  if (d.model === 'destroyer' || d.model === 'carrier') {
    if (t - u.fireT < 1.2) u.cSpin = (u.cSpin + 75 * DT) % (Math.PI * 2);
    // VLS hatches: open .5 s, stay 2 s, close 1 s
    for (let i = u.vlsOpen.length - 1; i >= 0; i--) {
      const a = t - u.vlsT[i];
      const f = a < .5 ? a / .5 : a < 2.5 ? 1 : a < 3.5 ? 1 - (a - 2.5) : -1;
      if (f < 0) { u.vlsOpen.splice(i, 1); u.vlsT.splice(i, 1); } else u.vlsOpen[i][1] = f;
    }
  }
  // drone gimbal looks down-forward, toward the last camera target when there is one
  if (u.type === 'drone') {
    u.gimYaw += clamp(angTo(u.gimYaw, u.aimB === null ? 0 : wrapPi(u.aimB - u.hdg)), -1.5 * DT, 1.5 * DT);
    u.gimPitch += clamp((u.aimB === null ? -.6 : -.9) - u.gimPitch, -DT, DT);
  }
  if (u.type === 'fighter') u.ab = !u.aboard && (t - u.born < 1 || u.pitch > .15 || u.speed < 180) ? 1 : 0;
  if (u.type === 'catapult' && !(u.orders[0] && u.orders[0].kind === 'launch_drone')) u.carriage = Math.max(0, u.carriage - DT / 3);
  if (u.type === 'transloader') {
    if (!u.busy) u.crane = Math.max(0, u.crane - DT / 4);
    refillTransloader(sim, u);
  }
  if (u.type === 'pantsir') refillAtDepot(sim, u);
  if (d.domain === 'sea') replenish(sim, u);
  if (u.aboard) aboardStep(sim, u);
}

/* TEL side of a reload: lower the launcher, then one round per `perRound` from the transloader beside it */
function reloadStep(sim, u) {
  const L = sim.units.get(u.reloader);
  const full = u.ammo.oniks >= u.def.weapons.oniks.ammo;
  if (!L || !L.alive || L.cargo <= 0 || L.off.reload || u.off.reload || full || dxz(L.pos[0], L.pos[2], u.pos[0], u.pos[2]) > 60) {
    if (L) { L.busy = false; L.reloadU = 0; }
    sim.emit('reload_end', { unit: u.id, by: L ? L.id : 0, side: u.side, pos: u.pos.slice(), ammo: u.ammo.oniks });
    u.reloader = 0; u.reloadP = 0; u.elevT = u.wantElev; u.depT = u.wantElev > 0 ? 1 : u.depT;
    return;
  }
  L.busy = true; u.depT = 1; u.elevT = 0;
  if (u.dep < 1 || u.elev > 0) return;
  if (u.reloadP === 0) sim.emit('reload_start', { unit: u.id, by: L.id, side: u.side, pos: u.pos.slice(), round: u.ammo.oniks + 1 });
  u.reloadP += DT;
  const per = u.def.reload.perRound;
  L.reloadU = Math.min(1, u.reloadP / per);
  L.crane = Math.sin(Math.PI * L.reloadU);
  if (u.reloadP >= per) {
    L.reloadU = 0;
    // rounds leave right (caps[0]) then left (caps[1]); reloads refill left first so the next launch finds it
    const n = u.ammo.oniks;
    u.ammo.oniks++; L.cargo--; u.caps[n === 0 ? 1 : 0] = 0; u.reloadP = 0;
    sim.emit('reload_done', { unit: u.id, by: L.id, side: u.side, pos: u.pos.slice(), ammo: u.ammo.oniks, cargo: L.cargo });
  }
}

/* a TEL at a depot reloads there (slower than from a transloader): launcher down, one round per reload.depot */
function depotReload(sim, u) {
  const full = u.ammo.oniks >= u.def.weapons.oniks.ammo;
  if (full || u.off.reload || !atDepot(sim, u) || u.speed > .5) {
    if (full) { u.depotLoad = false; u.reloadP = 0; u.elevT = u.wantElev; }
    return;
  }
  u.depT = 1; u.elevT = 0;
  if (u.dep < 1 || u.elev > 0) return;
  if (u.reloadP === 0) sim.emit('reload_start', { unit: u.id, by: 0, side: u.side, pos: u.pos.slice(), round: u.ammo.oniks + 1 });
  u.reloadP += DT;
  if (u.reloadP >= u.def.reload.depot) {
    const n = u.ammo.oniks;
    u.ammo.oniks++; u.caps[n === 0 ? 1 : 0] = 0; u.reloadP = 0;
    sim.emit('reload_done', { unit: u.id, by: 0, side: u.side, pos: u.pos.slice(), ammo: u.ammo.oniks, cargo: 0 });
  }
}

export function atDepot(sim, u) {
  const x = u.pos[0], z = u.pos[2];
  for (const o of sim.objectives) if ((o.kind === 'depot' || o.kind === 'port') && dxz(x, z, o.x, o.z) < o.r && o.owner !== (u.side === 'coast' ? 'fleet' : 'coast')) return true;
  const s = sim.map.spawns && sim.map.spawns[u.side];
  return !!(s && dxz(x, z, s.x, s.z) < Math.max(s.r, 2500));
}
function refillTransloader(sim, u) {
  if (u.cargo >= u.def.cargo || u.speed > .5 || u.busy) { u.refillP.cargo = 0; u.refillU = 0; return; }
  if (!atDepot(sim, u)) { u.refillU = 0; return; }
  u.refillP.cargo = (u.refillP.cargo || 0) + DT;
  u.refillU = Math.min(1, u.refillP.cargo / u.def.refill);
  u.crane = Math.sin(Math.PI * u.refillU);
  if (u.refillP.cargo >= u.def.refill) { u.cargo++; u.refillP.cargo = 0; u.refillU = 0; sim.emit('resupply', { unit: u.id, side: u.side, pos: u.pos.slice(), what: 'cargo', n: u.cargo }); }
}
function refillWeapons(sim, u) {
  let any = false;
  for (const w in u.def.weapons) {
    const W = u.def.weapons[w];
    if (u.ammo[w] >= W.ammo) continue;
    any = true;
    u.refillP[w] += DT;
    const per = W.refill || 30;
    if (u.refillP[w] >= per) { u.refillP[w] = 0; u.ammo[w]++; if (u.ammo[w] >= W.ammo) sim.emit('resupply', { unit: u.id, side: u.side, pos: u.pos.slice(), what: w, n: u.ammo[w] }); }
  }
  return any;
}
/* a Pantsir reloads at a depot only while it is not fighting */
function refillAtDepot(sim, u) { if (u.speed < .5 && sim.t - u.lastFire > 60 && atDepot(sim, u)) refillWeapons(sim, u); }
function replenish(sim, u) {
  const R = sim.map.replenish;
  if (!R || u.speed > 4 || dxz(u.pos[0], u.pos[2], R.x, R.z) > R.r) return;
  refillWeapons(sim, u);
  if (u.mag) for (const k in u.def.magazine) if (u.mag[k] < u.def.magazine[k] && sim.tick % 60 === 0) u.mag[k]++;
}
export function ammoFull(u) { for (const w in u.def.weapons) if (u.ammo[w] < u.def.weapons[w].ammo) return false; return true; }

function aboardStep(sim, u) {
  const d = u.def;
  if (u.rearmT && sim.t >= u.rearmT) {
    u.rearmT = 0;
    const cvm = sim.units.get(u.aboard);
    for (const w in d.weapons) {
      const need = d.weapons[w].ammo - u.ammo[w], mag = cvm && cvm.mag ? cvm.mag : null;
      const take = mag && mag[w] !== undefined ? Math.min(need, mag[w]) : need;
      if (mag && mag[w] !== undefined) mag[w] -= take;
      u.ammo[w] += take;
    }
    u.fuel = d.endurance; u.hp = Math.min(u.hpMax, u.hp + u.hpMax * .5);
    sim.emit('resupply', { unit: u.id, side: u.side, pos: u.pos.slice(), what: 'rearm' });
  }
  const cv = sim.units.get(u.aboard);
  const queued = cv && cv.launchQ && cv.launchQ.includes(u.id);
  if (u.type === 'helo') u.spool = clamp(u.spool + (queued ? DT / 8 : -DT / 20), 0, 1);
}
export function ready(u) { return !u.aboard || !u.rearmT; }

/* carrier: one aircraft off the deck every launchGap seconds */
export function carrierOps(sim, cv) {
  if (!cv.launchQ.length || sim.t < cv.nextLaunch || cv.off.air) return;
  const id = cv.launchQ[0];
  const u = sim.units.get(id);
  if (!u || !u.alive || u.aboard !== cv.id) { cv.launchQ.shift(); return; }
  if (u.rearmT) return;                                      // still rearming: wait at the head of the queue
  cv.launchQ.shift();
  cv.nextLaunch = sim.t + (u.type === 'helo' ? cv.def.air.launchGap * .5 : cv.def.air.launchGap);
  const spot = cv.type === 'ddg' ? [0, 8, -65] : u.type === 'helo' ? [-8, 20, -120] : [-18, 20, 60];
  const p = local(cv, spot);
  u.aboard = 0; u.pos = p; u.prev = p.slice();
  u.hdg = cv.hdg + (u.type === 'fighter' ? -.157 : 0);
  u.speed = u.type === 'fighter' ? 75 : 5;
  u.born = sim.t; u.landing = false;
  sim._dirty = true;
  sim.emit('takeoff', { unit: u.id, side: u.side, type: u.type, from: cv.id, pos: p.slice() });
}
