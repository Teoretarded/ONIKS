/* Weapons. Launchers fire projectiles that fly simple kinematic paths with phases (launch -> climb -> cruise ->
   final) and simple steering (turn toward the aim point at the type's turn rate and lateral-acceleration limit);
   guns fire bursts of rounds that fly with gravity and air drag. Nothing is rolled: a hit happens when a path crosses
   a body (sim/bodies.js): a strike missile's path must reach the target's part boxes, a gun round's the target's
   body, an interceptor's burst must go off within its burst radius of the target's body. Aim dispersion (seeded:
   the fire-control track error, the rounds' cone) is what makes rounds miss. A missile hit by gun rounds or by a burst
   that does not destroy it outright loses control and tumbles down (spinout).
   Defensive weapons fire by themselves at incoming rounds and aircraft in range; offensive weapons fire at an
   explicit attack target, or pick their own targets when the unit is on hold. */
import { PROJ, CLASSIFY, ENEMY, TEL_ELEV } from '../data/units.js';
import { DT } from './consts.js';
import { applyDamage } from './damage.js';
import { launchSeen, radarWorks, torpedoHeard } from './sensors.js';
import { gauss } from './rand.js';
import { clamp, angTo, local, closest, ground, dxz, d3 } from './util.js';
import { atPD, submerged, isSub, domOf } from './subs.js';
import { elevOf } from './mech.js';
import { HIT, bodyOf, segUnit, distUnit, pointUnit, segAxis, partNear, projPart, toWorld } from './bodies.js';

const G = 9.81;
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const TAU = Math.PI * 2;
const KILL = .5;                         // a burst within this fraction of its radius destroys a missile outright
const DEFBODY = [3, .3, 150];            // a munition without PROJ.body: length, diameter m, mass kg
const F = new Float64Array(3), DSP = new Float64Array(3);
/* deterministic 0..1 from integers (spin rates, event seeds; not a dice roll on the outcome) */
function hsh(a, b) { let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return (h >>> 0) / 4294967296; }
const seedOf = (sim, p) => (Math.imul(sim.seed, 2654435761) ^ Math.imul(p.id, 40503) ^ sim.tick) >>> 0;
/* a munition's axis (unit, world): its heading and pitch, or its tumbling frame */
function axisOf(p, o) {
  if (p.fw) { o[0] = p.fw[0]; o[1] = p.fw[1]; o[2] = p.fw[2]; return o; }
  const cp = Math.cos(p.pitch);
  o[0] = Math.sin(p.hdg) * cp; o[1] = Math.sin(p.pitch); o[2] = Math.cos(p.hdg) * cp; return o;
}
const velOf = (e, o) => { if (e.vel) { o[0] = e.vel[0]; o[1] = e.vel[1]; o[2] = e.vel[2]; } else { o[0] = (e.pos[0] - e.prev[0]) / DT; o[1] = (e.pos[1] - e.prev[1]) / DT; o[2] = (e.pos[2] - e.prev[2]) / DT; } return o; };
/* the fire-control track error a guided round steers by: a slow wander around a seeded offset, sig0 + range x sigR
   metres (PROJ[kind].sig0 / sigR), into DSP */
function dispAt(p, range) {
  const P = p.P, s = (P.sig0 || 0) + range * (P.sigR || 0), D = p.dsp;
  if (!D || s <= 0) { DSP[0] = DSP[1] = DSP[2] = 0; return; }
  const t = p.age;
  DSP[0] = s * (D[0] + .4 * Math.sin(D[3] + t * D[6]));
  DSP[1] = s * (D[1] + .4 * Math.sin(D[4] + t * D[7]));
  DSP[2] = s * (D[2] + .4 * Math.sin(D[5] + t * D[8]));
}

/* ---------- target choice and firing (every SENSE_EVERY ticks) ---------- */
/* what a weapon engages, from its `vs` list (cached on the weapon's table entry; `vs` is never changed at run time) */
function vsOf(w) {
  let f = w._vs;
  if (f === undefined) {
    const v = w.vs;
    f = w._vs = (v.includes('land') || v.includes('sea') || v.includes('sub') ? 1 : 0) | (v.includes('missile') ? 2 : 0) | (v.includes('air') ? 4 : 0);
  }
  return f;
}
const VS_SURF = 1, VS_MISSILE = 2, VS_AIR = 4;
const THREATS = { coast: [], fleet: [] }, INB = { coast: new Map(), fleet: new Map() };
export function weaponsTick(sim) {
  const list = sim.list(), t = sim.t;
  THREATS.coast.length = 0; THREATS.fleet.length = 0; INB.coast.clear(); INB.fleet.clear();
  for (const p of sim.projectiles.values()) {
    if (!p.alive || !(p.P.threat || p.P.torpedo)) continue;
    const foe = p.side === 'coast' ? 'fleet' : 'coast';
    if (p.P.threat && p.ctrl && t - p.seen[foe] <= 1.01) THREATS[foe].push(p);   // a tumbling round is no longer engaged
    if (p.tk === 'unit') INB[p.side].set(p.target, (INB[p.side].get(p.target) || 0) + 1);
  }
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (!u.alive || u.aboard) continue;
    const W = u.def.weapons;
    for (const wn in W) {
      const w = W[wn];
      if (u.ammo[wn] <= 0 || u.cooldowns[wn] > 0 || u.off[wn]) continue;
      if (w.mounts && allOff(u, w.mounts)) continue;
      if (w.needsRadar && !radarWorks(u)) continue;
      if (w.sub && isSub(u) && !atPD(u)) continue;               // missiles leave a boat from periscope depth
      if (w.auto && autoFire(sim, u, w)) continue;
      if (vsOf(w) & VS_SURF) offensive(sim, u, w);
    }
  }
}
function allOff(u, mounts) { for (let i = 0; i < mounts.length; i++) if (!u.off[mounts[i]]) return false; return true; }

function threatsFor(sim, u, w) {
  const side = u.side, t = sim.t, ux = u.pos[0], uy = u.pos[1], uz = u.pos[2];
  let best = null, bs = 1e18;
  if (!(vsOf(w) & VS_MISSILE)) return null;
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
  if (!(vsOf(w) & VS_AIR)) return null;
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

const PRIO = { HQ: 10, CVN: 9, TEL: 8, LHD: 8, DDG: 7, SSN: 7, SSK: 7, SAM: 6, RADAR: 6, ATGM: 5, ACV: 5, LCAC: 5, TLV: 4, AEW: 3, 'UAV-L': 3, HELO: 2, FTR: 1, UAV: 1 };
function offensive(sim, u, w) {
  const S = sim.sides[u.side], o = u.orders[0];
  let c = null;
  if (o && o.kind === 'attack') {
    const cc = S.contacts.get(o.target);
    if (cc && !cc.dead && cc.conf >= CLASSIFY && w.vs.includes(cc.dom) && (o.w === w.name || !o.w)) c = cc;
    if (!c) return;
    // the order's volley (orders.js): o.hot while a volley is on, o.vn rounds in it
    if (!o.hot || (o.fired || 0) >= (o.vn || 1)) return;
  } else if (u.hold) {
    let bs = -1e18;
    for (const cc of S.contacts.values()) {
      if (cc.dead || cc.conf < CLASSIFY || !w.vs.includes(cc.dom)) continue;
      if (cc.cls === 'LCAC' && PROJ[w.proj] && PROJ[w.proj].torpedo) continue;
      const d = dxz(u.pos[0], u.pos[2], cc.pos[0], cc.pos[2]);
      if (d > w.range || d < (w.min || 0)) continue;
      const s = (PRIO[cc.cls] || 1) * 10 - d / 10000 - (INB[u.side].get(cc.unitId) || 0) * 15 + (w.prefer && w.prefer.includes(cc.cls) ? 60 : 0);
      if (s > bs) { bs = s; c = cc; }
    }
    if (!c) return;
    if (w.proj !== 'shell' && (INB[u.side].get(c.unitId) || 0) >= (c.dom === 'sea' ? 4 : 2)) return;
  } else return;
  const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]);
  if (d > w.range || d < (w.min || 0)) return;
  if (w.needs === 'erect' && (u.elev < elevOf(u.def) - 1e-6 || u.dep < 1 || u.reloader)) return;
  if (w.needs === 'lift' && u.lift < 1) return;                 // the Kornet's launcher up
  if (u.def.domain === 'air' && u.aboard) return;
  if (w.gun) {
    // a gun at a ground target (the ACV's remote weapon station): a burst, resolved at once
    const e = sim.units.get(c.unitId);
    if (!e || !e.alive || e.aboard) return;
    burst(sim, u, w, e, false);
    if (o && o.kind === 'attack') o.fired = (o.fired || 0) + 1;
    return;
  }
  const p = launch(sim, u, w, c.unitId, 'unit', c.pos);
  if (p.P.threat || p.P.torpedo) INB[u.side].set(c.unitId, (INB[u.side].get(c.unitId) || 0) + 1);
  if (o && o.kind === 'attack') o.fired = (o.fired || 0) + 1;
}

/* missiles already flying at a unit (side's own count) */
export function inbound(sim, side, unitId) {
  let n = 0;
  for (const p of sim.projectiles.values()) if (p.alive && p.ctrl && p.side === side && p.tk === 'unit' && p.target === unitId && (p.P.threat || p.P.torpedo)) n++;
  return n;
}

/* ---------- guns: every burst is a stream of rounds flown against the target's body ----------
   A burst of w.burst s at w.rpm leaves the muzzle as w.rounds representative rounds (each stands for rpm/60 x burst /
   rounds real ones), spread over the burst. Each is aimed where the target will be after its time of flight (the
   target's current velocity relative to the gun: simple lead; the gravity drop taken out), with a seeded angular
   dispersion (w.disp, rad, per axis), and flies with gravity and air drag (w.drag: dv/dx = -drag v). A round whose
   path crosses the target's body during a tick hits the part it crossed: rounds into a missile tumble it out of
   control (spinout) or break it up (PROJ[kind].tough real hits); rounds into a unit do w.dmgR hp each.
   sim.bursts: the bursts in the air (renderers may draw their rounds: b.x = positions, b.st = 0 not fired, 1 flying,
   2 done). */
const MOUNT = [[0, 13.6, 33.3], [0, 16.4, -47.9]];            // DDG Phalanx fwd / aft (model part centres)
function burst(sim, u, w, tgt, isProj) {
  const wn = w.name;
  u.ammo[wn]--;
  let alive = 1;
  if (w.mounts) { alive = w.mounts.filter(m => !u.off[m]).length / w.mounts.length; }
  u.cooldowns[wn] = w.cd / Math.max(.5, alive);
  let mount = 0;
  if (w.mounts) {
    // the Phalanx facing the target: fwd for targets ahead, aft for targets behind
    const b = Math.atan2(tgt.pos[0] - u.pos[0], tgt.pos[2] - u.pos[2]);
    mount = Math.abs(angTo(u.hdg, b)) < Math.PI / 2 ? 0 : 1;
    if (u.off[w.mounts[mount]]) mount ^= 1;
  }
  const mz = muzzleOf(u, w, mount);
  if (w.mounts) {
    const b = Math.atan2(tgt.pos[0] - u.pos[0], tgt.pos[2] - u.pos[2]);
    u.cYaw[mount] = angTo(u.hdg, b) - (mount ? Math.PI : 0);
    u.cPitch[mount] = Math.atan2(tgt.pos[1] - mz[1], Math.max(1, dxz(mz[0], mz[2], tgt.pos[0], tgt.pos[2])));
  }
  aimTurret(u, tgt.pos);
  u.fireT = sim.t; u.lastFire = sim.t;
  const L = sim.bursts || (sim.bursts = []);
  const dur = w.burst || 1, n = w.rounds || 24, real = (w.rpm || 3000) / 60 * dur;
  const B = {
    id: sim.nextBurst = (sim.nextBurst || 0) + 1, unit: u.id, side: u.side, weapon: wn, w, target: tgt.id, tk: isProj ? 'proj' : 'unit',
    t0: sim.t, dur, n, fired: 0, live: 0, wt: real / n, mount, hits: 0, tmax: (w.range || 2000) * 1.8 / (w.v0 || 1000) + 1,
    x: new Float64Array(n * 3), p: new Float64Array(n * 3), v: new Float64Array(n * 3), st: new Uint8Array(n), age: new Float32Array(n),
    aim: [0, 0, 0], tof: 0,
  };
  leadOf(u, w, tgt, mz, B.aim);
  B.tof = LEAD.tof;
  L.push(B);
  sim.emit('gunfire', { unit: u.id, side: u.side, weapon: wn, pos: mz, to: tgt.pos.slice(), aim: B.aim.slice(), tof: B.tof, dur, n: Math.round(real),
    hit: false, target: tgt.id, tk: B.tk, mount, burst: B.id });
}
/* a burst from unit u's gun wn at tgt (a projectile or a unit) now, whatever its cooldown (tests, scripts) */
export function fireGun(sim, u, wn, tgt) {
  const w = u.def.weapons[wn];
  if (!w || !w.gun || !tgt) return null;
  burst(sim, u, w, tgt, sim.projectiles.get(tgt.id) === tgt);
  return sim.bursts[sim.bursts.length - 1];
}
function muzzleOf(u, w, mount) {
  return w.mounts ? local(u, MOUNT[mount]) : w.muzzle ? local(u, w.muzzle) : [u.pos[0], u.pos[1] + 12, u.pos[2]];
}
/* where to point: the target's position plus its velocity relative to the gun times the time of flight (drag slows
   the round: v = v0 e^(-drag x), so a distance d takes (e^(drag d) - 1) / (drag v0)), raised by what the round falls
   on the way (flown out with drag and gravity, twice) */
const LEAD = { tof: 0 }, VT = new Float64Array(3);
function leadOf(u, w, tgt, mz, out) {
  const v0 = w.v0 || 1000, k = w.drag || 0;
  velOf(tgt, VT);
  const ux = (u.pos[0] - u.prev[0]) / DT, uy = (u.pos[1] - u.prev[1]) / DT, uz = (u.pos[2] - u.prev[2]) / DT;
  const vx = VT[0] - ux, vy = VT[1] - uy, vz = VT[2] - uz;
  const tx = tgt.pos[0] - mz[0], ty = tgt.pos[1] - mz[1], tz = tgt.pos[2] - mz[2];
  // the time of flight to where the target will be: a damped fixed-point iteration (crossing targets make the plain
  // one oscillate)
  let tof = Math.sqrt(tx * tx + ty * ty + tz * tz) / v0;
  for (let it = 0; it < 10; it++) {
    const px = tx + vx * tof, py = ty + vy * tof, pz = tz + vz * tof, d = Math.sqrt(px * px + py * py + pz * pz);
    const t1 = k > 1e-9 ? Math.min(20, (Math.exp(Math.min(20, k * d)) - 1) / (k * v0)) : d / v0;
    tof = .5 * (tof + t1);
  }
  const ax = tx + vx * tof, ay = ty + vy * tof, az = tz + vz * tof;
  let lift = .5 * G * tof * tof;
  for (let it = 0; it < 2 && tof > .05; it++) {
    // fly a round aimed at (ax, ay + lift, az) for the time of flight: how far off in height it arrives
    const dl = Math.sqrt(ax * ax + (ay + lift) * (ay + lift) + az * az) || 1, ns = Math.min(40, Math.ceil(tof / DT)), h = tof / ns;
    let ry = 0, sx = ax / dl * v0, sy = (ay + lift) / dl * v0, sz = az / dl * v0;
    for (let n = 0; n < ns; n++) {
      const sp = Math.sqrt(sx * sx + sy * sy + sz * sz), dr = k * sp * h, oy = sy;
      sx -= sx * dr; sy -= sy * dr + G * h; sz -= sz * dr;
      ry += (oy + sy) * .5 * h;
    }
    lift -= ry - ay;
  }
  out[0] = mz[0] + ax; out[1] = mz[1] + ay + lift; out[2] = mz[2] + az;
  LEAD.tof = tof;
  return out;
}
const AIM = new Float64Array(3);
function stepBursts(sim) {
  const L = sim.bursts, map = sim.map;
  for (let bi = 0; bi < L.length; bi++) {
    const B = L[bi], u = sim.units.get(B.unit), w = B.w;
    const T = B.tk === 'proj' ? sim.projectiles.get(B.target) : sim.units.get(B.target);
    const tOk = !!(T && T.alive && !(B.tk === 'unit' && T.aboard));
    // the rounds due this tick leave the muzzle (the gun keeps tracking the target through the burst)
    const due = Math.min(B.n, Math.floor(B.n * Math.min(1, (sim.t - B.t0 + DT) / B.dur) + 1e-9));
    if (due > B.fired) {
      if (!u || !u.alive || !tOk) B.fired = B.n;                // the gun or its target is gone: the rest stays in the barrel
      else {
        const mz = muzzleOf(u, w, B.mount);
        leadOf(u, w, T, mz, AIM);
        const ux = (u.pos[0] - u.prev[0]) / DT, uy = (u.pos[1] - u.prev[1]) / DT, uz = (u.pos[2] - u.prev[2]) / DT;
        const rvx = VT[0] - ux, rvy = VT[1] - uy, rvz = VT[2] - uz;              // the target's velocity relative to the gun
        const v0 = w.v0 || 1000, sg = w.disp === undefined ? .003 : w.disp, r = sim.rng.fire, k0 = B.fired, cnt = due - k0;
        for (let i = k0; i < due; i++) {
          // rounds of one tick are strung along the stream: one that left `lead` of a tick earlier is that much further
          // out and arrives that much sooner, so it is aimed where the target is that much sooner
          const lead = (i - k0 + 1) / cnt, lt = lead * DT;
          let dx = AIM[0] - rvx * lt - mz[0], dy = AIM[1] - rvy * lt - mz[1], dz = AIM[2] - rvz * lt - mz[2];
          const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= dl; dy /= dl; dz /= dl;
          // two axes across the line of fire for the dispersion cone
          let ex = dz, ez = -dx; const el = Math.sqrt(ex * ex + ez * ez) || 1; ex /= el; ez /= el;
          const fx = dy * ez, fy = dz * ex - dx * ez, fz = -dy * ex;
          const a = gauss(r) * sg, b = gauss(r) * sg;
          let cx = dx + ex * a + fx * b, cy = dy + fy * b, cz = dz + ez * a + fz * b;
          const cl = Math.sqrt(cx * cx + cy * cy + cz * cz); cx /= cl; cy /= cl; cz /= cl;
          const j = i * 3;
          B.v[j] = cx * v0 + ux; B.v[j + 1] = cy * v0 + uy; B.v[j + 2] = cz * v0 + uz;
          B.x[j] = mz[0] + B.v[j] * DT * lead; B.x[j + 1] = mz[1] + B.v[j + 1] * DT * lead; B.x[j + 2] = mz[2] + B.v[j + 2] * DT * lead;
          B.p[j] = mz[0]; B.p[j + 1] = mz[1]; B.p[j + 2] = mz[2];
          B.st[i] = 3; B.age[i] = DT * lead; B.live++;             // 3: out this tick (its first path: muzzle -> x)
        }
        B.fired = due;
      }
    }
    // fly the rounds already out, and test each path against the target's body
    const k = w.drag || 0;
    let nh = 0, hj = -1, hpart = null, hx = 0, hy = 0, hz = 0;
    let tvx = 0, tvy = 0, tvz = 0, R = 0, h = 0, qP = null;
    if (tOk) {
      velOf(T, VT); tvx = VT[0]; tvy = VT[1]; tvz = VT[2];
      if (B.tk === 'proj') { const bd = T.P.body || DEFBODY; h = bd[0] / 2; R = bd[1] / 2 + .01; axisOf(T, F); qP = T.P; }
    }
    for (let i = 0; i < B.fired; i++) {
      const st = B.st[i];
      if (st !== 1 && st !== 3) continue;
      const j = i * 3;
      if (st === 1) {
        B.p[j] = B.x[j]; B.p[j + 1] = B.x[j + 1]; B.p[j + 2] = B.x[j + 2];
        const vx = B.v[j], vy = B.v[j + 1], vz = B.v[j + 2], sp = Math.sqrt(vx * vx + vy * vy + vz * vz), dr = k * sp * DT;
        B.v[j] = vx - vx * dr; B.v[j + 1] = vy - vy * dr - G * DT; B.v[j + 2] = vz - vz * dr;
        B.x[j] += (vx + B.v[j]) * .5 * DT; B.x[j + 1] += (vy + B.v[j + 1]) * .5 * DT; B.x[j + 2] += (vz + B.v[j + 2]) * .5 * DT;
        B.age[i] += DT;
      } else B.st[i] = 1;
      const x = B.x[j], y = B.x[j + 1], z = B.x[j + 2];
      let done = B.age[i] > B.tmax || (y < 300 && y < ground(map, x, z));
      if (!done && tOk) {
        const ax = B.p[j] - T.prev[0], ay = B.p[j + 1] - T.prev[1], az = B.p[j + 2] - T.prev[2];
        const bx = x - T.pos[0], by = y - T.pos[1], bz = z - T.pos[2];
        if (qP) {
          if (segAxis(ax, ay, az, bx, by, bz, F[0], F[1], F[2], h) <= R) {
            // the round met the missile: where on its skin (relative to the missile at that instant), which part
            const s = HIT.s, t = HIT.t;
            nh++; done = true;
            if (hj < 0) {
              hj = i;
              hx = B.p[j] + (x - B.p[j]) * s; hy = B.p[j + 1] + (y - B.p[j + 1]) * s; hz = B.p[j + 2] + (z - B.p[j + 2]) * s;
              hpart = partOnSkin(T, ax + (bx - ax) * s, ay + (by - ay) * s, az + (bz - az) * s, t);
            }
          }
        } else if (segUnit(T, ax, ay, az, bx, by, bz, .01, .3) >= 0) {
          nh++; done = true;
          if (hj < 0) { hj = i; hpart = HIT.part; const P3 = toWorld(T, HIT.x, HIT.y, HIT.z, [0, 0, 0]); hx = P3[0]; hy = P3[1]; hz = P3[2]; B.lx = HIT.x; B.ly = HIT.y; B.lz = HIT.z; }
        }
        // past the target and opening: it will not come back
        if (!done) { const rx = bx, ry = by, rz = bz; if (rx * (B.v[j] - tvx) + ry * (B.v[j + 1] - tvy) + rz * (B.v[j + 2] - tvz) > 0 && rx * rx + ry * ry + rz * rz > 900) done = true; }
      }
      if (done) { B.st[i] = 2; B.live--; }
    }
    if (nh) {
      B.hits += nh;
      const j = hj * 3, rv = [B.v[j], B.v[j + 1], B.v[j + 2]];
      if (B.tk === 'proj') gunHitProj(sim, B, T, nh, hpart, [hx, hy, hz], rv);
      else gunHitUnit(sim, B, T, nh, hpart, [hx, hy, hz], rv);
    }
    if (B.fired >= B.n && B.live <= 0) { L[bi] = L[L.length - 1]; L.pop(); bi--; }
  }
}
/* the part of a missile struck at offset (dx, dy, dz) from its centre (world axes), t along its axis */
function partOnSkin(q, dx, dy, dz, t) {
  axisOf(q, F);
  const f0 = F[0], f1 = F[1], f2 = F[2];
  let upx = 0, upy = 1, upz = 0;
  if (q.up) { upx = q.up[0]; upy = q.up[1]; upz = q.up[2]; }
  let rx = upy * f2 - upz * f1, ry = upz * f0 - upx * f2, rz = upx * f1 - upy * f0;   // starboard = up x forward
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rl < 1e-6) { rx = 1; ry = 0; rz = 0; } else { rx /= rl; ry /= rl; rz /= rl; }
  const ux = f1 * rz - f2 * ry, uy = f2 * rx - f0 * rz, uz = f0 * ry - f1 * rx;
  return projPart(q.P, dx * rx + dy * ry + dz * rz, dx * ux + dy * uy + dz * uz, t);
}
function gunHitProj(sim, B, q, nh, part, pos, rv) {
  if (!q.alive) return;
  const real = nh * B.wt;
  q.gh = (q.gh || 0) + real;
  sim.emit('gunhit', { unit: B.unit, side: B.side, weapon: B.weapon, target: q.id, tk: 'proj', pos, n: +real.toFixed(1), part, vel: rv, burst: B.id });
  const rel = [rv[0] - q.vel[0], rv[1] - q.vel[1], rv[2] - q.vel[2]], rl = Math.hypot(rel[0], rel[1], rel[2]) || 1;
  const imp = [rel[0] / rl, rel[1] / rl, rel[2] / rl];
  const info = { by: B.unit, byKind: B.weapon, unit: B.unit, part, pos, rel, imp, cause: 'gun' };
  if (q.gh >= (q.P.tough || 3) || !q.ctrl) breakup(sim, q, info);
  else spinout(sim, q, info);
}
function gunHitUnit(sim, B, e, nh, part, pos, rv) {
  if (!e.alive) return;
  const real = nh * B.wt, dmg = real * (B.w.dmgR || .2);
  sim.emit('hit', { pos, target: e.id, kind: B.weapon, side: B.side, from: B.unit, part, n: +real.toFixed(1), vel: rv, burst: B.id });
  applyDamage(sim, e, dmg, sim.units.get(B.unit), { part, part2: partNear(e.def, B.lx, B.ly, B.lz, part), pos });
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
    else if (w.needs === 'lift') { hdg = u.aimB; pitch = Math.max(.02, u.aimP + .03); }   // the Kornet: out along the sight line
  }
  const p = {
    id: sim.nextId++, kind: w.proj, side: u.side, P,
    pos, prev: pos.slice(), vel: [0, 0, 0], from: u.id, fromPos: pos.slice(), target, tk,
    aim: [aimAt[0], aimAt[1], aimAt[2]], phase: 'launch', t0: t, age: 0, alive: true, st: { booster: true, wing: 0, fin: 0 },
    spd, spd0: spd, hdg, pitch, eng: 0, shots: 0, minD: 1e9, seen: { coast: -1e9, fleet: -1e9 }, locked: false, sep: false,
    maxT: (w.range / P.speed) * 1.8 + (P.vert || 0) + (P.boost || 0) + 20, ball: null,
    gA: undefined, gL: null, gLx: 0, gLz: 0, gLmax: 0, gFl: -9, depth: 0,    // terrain look-ahead; torpedo depth
    // physics: under control (false: tumbling, see spinout), gun hits taken (real rounds), roll, the tumbling frame
    // (fw forward, up) and angular velocity w (rad/s, world axes), the track-error seeds (dispersion), a missed pass
    ctrl: true, gh: 0, roll: 0, fw: null, up: null, w: null, dsp: null, missed: null,
  };
  if (P.sig0 || P.sigR) {
    const r = sim.rng.fire;
    p.dsp = [gauss(r), gauss(r), gauss(r), r() * TAU, r() * TAU, r() * TAU, .3 + r() * .6, .3 + r() * .6, .3 + r() * .6];
  }
  p.seen[u.side] = t;
  if (tk === 'proj') { const q = sim.projectiles.get(target); if (q) { q.eng++; q.shots++; } }
  else if (!P.threat) { const e = sim.units.get(target); if (e) e.eng++; }
  if (P.mode === 'ballistic') setupShell(sim, p, u, aimAt);
  if (P.mode === 'direct' && P.threat) p.locked = true;
  setVel(p);
  sim.projectiles.set(p.id, p);
  sim.emit('launch', { proj: p.id, kind: p.kind, side: u.side, from: u.id, target, tk, pos: pos.slice(), hdg, pitch, weapon: wn });
  if (P.threat || P.mode === 'ballistic' || P.reveal) launchSeen(sim, u);
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
  const pf = sim.prof, t0 = pf ? performance.now() : 0;          // sim.prof = { proj: 0, guns: 0 }: ms spent (perf tests)
  if (sim.projectiles.size) {
    const dead = [];
    for (const p of sim.projectiles.values()) {
      if (!p.alive) { dead.push(p.id); continue; }
      stepOne(sim, p);
      if (!p.alive) dead.push(p.id);
    }
    for (const id of dead) sim.projectiles.delete(id);
  }
  // gun rounds fly after the missiles have moved: their paths are tested against this tick's motion
  const t1 = pf ? performance.now() : 0;
  if (sim.bursts && sim.bursts.length) stepBursts(sim);
  if (pf) { pf.proj += t1 - t0; pf.guns += performance.now() - t1; }
}

function stepOne(sim, p) {
  const P = p.P, map = sim.map;
  p.age += DT;
  if (P.mode === 'ballistic') {
    const b = p.ball, a = Math.min(p.age, b.T);
    p.pos[0] = b.p0[0] + b.v[0] * a; p.pos[1] = b.p0[1] + b.v[1] * a - .5 * G * a * a; p.pos[2] = b.p0[2] + b.v[2] * a;
    p.vel[0] = b.v[0]; p.vel[1] = b.v[1] - G * a; p.vel[2] = b.v[2];
    // a shell strikes what its arc passes through
    const tgt = sim.units.get(p.target);
    if (tgt && tgt.alive && !tgt.aboard) {
      const R = bodyOf(tgt.def).R + 60, dx = p.pos[0] - tgt.pos[0], dz = p.pos[2] - tgt.pos[2];
      if (dx * dx + dz * dz < R * R && segUnit(tgt, p.prev[0] - tgt.prev[0], p.prev[1] - tgt.prev[1], p.prev[2] - tgt.prev[2], dx, p.pos[1] - tgt.pos[1], dz, (P.body ? P.body[1] / 2 : .07), .5) >= 0) { impact(sim, p, tgt); return; }
    }
    if (p.age >= b.T) shellImpact(sim, p);
    return;
  }
  if (P.mode === 'run') { stepTorpedo(sim, p); if (p.alive && p.age > p.maxT) endTorpedo(sim, p, 'selfdestruct'); return; }
  if (!p.ctrl) { stepTumble(sim, p); return; }
  // target and aim point
  let tgt = null;
  if (p.tk === 'proj') {
    tgt = sim.projectiles.get(p.target);
    if (!tgt || !tgt.alive) { tgt = retarget(sim, p); if (!tgt) { selfDestruct(sim, p); return; } }
  } else {
    tgt = sim.units.get(p.target);
    if (tgt && (!tgt.alive || tgt.aboard || submerged(tgt))) tgt = null;     // a boat that dives is out of a missile's reach
  }
  if (p.missed) {
    // it passed its target without striking it: no turning back, it flies on and down
  } else if (P.mode === 'direct') {
    if (tgt) {
      // lead: the target's position plus its velocity times the time to go (simple lead: the time at which a round at
      // this speed meets a target keeping its velocity, |r + v t| = s t), plus the track error
      const rx = tgt.pos[0] - p.pos[0], ry = tgt.pos[1] - p.pos[1], rz = tgt.pos[2] - p.pos[2];
      const d = Math.sqrt(rx * rx + ry * ry + rz * rz), sp = Math.max(200, p.age < (P.boost || 0) ? P.speed * .8 : p.spd);
      const vx = (tgt.pos[0] - tgt.prev[0]) / DT, vy = (tgt.pos[1] - tgt.prev[1]) / DT, vz = (tgt.pos[2] - tgt.prev[2]) / DT;
      const qa = vx * vx + vy * vy + vz * vz - sp * sp, qb = 2 * (rx * vx + ry * vy + rz * vz);
      let tgo = d / sp;
      if (qa < -1e-6) { const disc = qb * qb - 4 * qa * d * d; if (disc >= 0) { const t1 = (-qb - Math.sqrt(disc)) / (2 * qa); if (t1 > 0) tgo = t1; } }
      tgo = clamp(tgo, 0, 25);
      p.aim[0] = tgt.pos[0] + vx * tgo; p.aim[1] = tgt.pos[1] + vy * tgo; p.aim[2] = tgt.pos[2] + vz * tgo;
      if (p.tk === 'unit') bodyAim(tgt, p.aim);
      dispAt(p, d);
      p.aim[0] += DSP[0]; p.aim[1] += DSP[1]; p.aim[2] += DSP[2];
      // interceptors never lead into the ground or the sea (sea-skimmers); strike rounds fly into what they aim at
      if (p.tk === 'proj' || tgt.def.domain === 'air') {
        const ga = ground(map, p.aim[0], p.aim[2]) + 4;
        if (p.aim[1] < ga) p.aim[1] = Math.max(ga, Math.min(tgt.pos[1], ga + 20));
      }
    }
  } else {
    // cruise: fly to the side's track of the target; in the final leg, reach the target if it is near the aim point
    if (!p.locked) {
      const c = sim.sides[p.side].contacts.get(p.target);
      if (c && !c.dead) { p.aim[0] = c.pos[0]; p.aim[2] = c.pos[2]; }
      if (tgt && p.phase === 'final' && dxz(p.pos[0], p.pos[2], p.aim[0], p.aim[2]) < Math.max(P.reach * 2.5, 8000)
        && dxz(tgt.pos[0], tgt.pos[2], p.aim[0], p.aim[2]) < P.reach) p.locked = true;
    }
    if (p.locked && tgt) {
      // the target's body (its aim point: the heaviest part's centre) plus the track error
      p.aim[0] = tgt.pos[0]; p.aim[1] = tgt.pos[1]; p.aim[2] = tgt.pos[2];
      bodyAim(tgt, p.aim);
      dispAt(p, Math.sqrt((p.aim[0] - p.pos[0]) ** 2 + (p.aim[1] - p.pos[1]) ** 2 + (p.aim[2] - p.pos[2]) ** 2));
      p.aim[0] += DSP[0]; p.aim[1] += DSP[1]; p.aim[2] += DSP[2];
    }
    else if (p.locked && !tgt) p.locked = false;
  }
  // speed
  if (p.age < (P.boost || 0)) p.spd = p.spd0 + (P.speed - p.spd0) * ease(p.age / P.boost);
  else p.spd = P.speed;
  // steering
  const dx = p.aim[0] - p.pos[0], dz = p.aim[2] - p.pos[2], dist = Math.sqrt(dx * dx + dz * dz);
  if (p.age >= (P.vert || 0)) {
    let hT = Math.atan2(dx, dz);
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
    if (p.missed) { hT = p.hdg; pT = Math.min(pT, -.3); }
    // turn-rate limit, and the lateral-acceleration limit (gMax, m/s²) as a turn rate at this speed
    const gl = P.gMax ? P.gMax / Math.max(60, p.spd) : 99;
    const tr = Math.min(P.turn, gl) * DT * (P.vert ? Math.max(.15, bend) : 1), pr = Math.min(P.pitchRate, gl) * DT * (P.vert ? Math.max(.1, bend) : 1);
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
  // resolution: by geometry only. Interceptors (proximity fuze, PROJ.burst) go off when their path this tick passes
  // within the burst radius of the target's body; strike rounds hit when their path enters the target's part boxes.
  // A round that passes its target flies on (no circling back): an interceptor ends in the air, a strike round goes
  // down past the target.
  const g = p.pos[1] > p.gA + 150 ? 0 : ground(map, p.pos[0], p.pos[2]);     // far above the terrain ahead: no contact possible
  const icpt = p.tk === 'proj' || (!P.threat && !!P.burst);
  if (icpt) {
    if (tgt && fuse(sim, p, tgt)) return;
  } else if (tgt && p.tk === 'unit' && (p.locked || P.mode === 'direct')) {
    if (strike(sim, p, tgt)) return;
  } else if (P.threat && !p.locked && !p.missed && p.phase === 'final' && dist < Math.max(30, p.spd * DT * 1.2) && p.age > 3) {
    splash(sim, p, [p.aim[0], Math.max(0, map.h(p.aim[0], p.aim[2])), p.aim[2]], false, tgt ? 'moved' : 'lost');
    return;
  }
  if (p.pos[1] < g + 1) {
    // interceptors skim, they never fly into the ground; strike rounds in their final dive (or past their target) do
    if (!icpt && ((P.threat && p.age > (P.vert || 0) + 2 && p.phase === 'final') || p.missed || (!P.threat && p.age > 1.5))) {
      let why = p.missed || 'terrain';
      if (!p.missed && tgt && p.locked) {
        // down short of a target ahead: the path met the surface before the body
        const rx = tgt.pos[0] - p.pos[0], rz = tgt.pos[2] - p.pos[2];
        if (rx * p.vel[0] + rz * p.vel[2] > 0 && rx * rx + rz * rz < 2000 * 2000) why = 'short';
      }
      splash(sim, p, [p.pos[0], g, p.pos[2]], false, why); return;
    }
    p.pos[1] = g + 1;
    if (p.pitch < 0) p.pitch = 0;
  }
  if (p.age > p.maxT) selfDestruct(sim, p);
}

/* the target's aim point (its body's: the heaviest part's centre) added to a position, in the target's heading */
function bodyAim(u, a) {
  const b = bodyOf(u.def).aim, c = Math.cos(u.hdg), s = Math.sin(u.hdg);
  a[0] += b[0] * c + b[2] * s; a[1] += b[1]; a[2] += -b[0] * s + b[2] * c;
}

/* a strike round against its target's body: its path this tick (relative to the target) enters the part boxes (grown
   by the round's radius) -> hit on the part it entered; past the target and opening -> it has missed (it flies on and
   down: 'wide', or 'over' when it passed above the body) */
function strike(sim, p, tgt) {
  const r = p.P.body ? p.P.body[1] / 2 : .2;
  const bx = p.pos[0] - tgt.pos[0], by = p.pos[1] - tgt.pos[1], bz = p.pos[2] - tgt.pos[2];
  const B = bodyOf(tgt.def), R = B.R + 40 + p.spd * DT;
  if (bx * bx + by * by + bz * bz > R * R * 4) return false;
  if (segUnit(tgt, p.prev[0] - tgt.prev[0], p.prev[1] - tgt.prev[1], p.prev[2] - tgt.prev[2], bx, by, bz, r, 1.5) >= 0) { impact(sim, p, tgt); return true; }
  if (!p.missed && bx * p.vel[0] + by * p.vel[1] + bz * p.vel[2] > 0 && bx * bx + by * by + bz * bz < R * R) {
    // behind it now: above the body's top, or beside it
    let top = -1e9;
    for (let i = 0; i < B.n; i++) top = Math.max(top, B.bx[i * 6 + 4]);
    p.missed = by > top + r ? 'over' : 'wide';
    p.locked = false;
  }
  return false;
}
/* a strike round hits: the part it entered takes the damage (spilling onto the nearest other part) */
function impact(sim, p, tgt) {
  const part = HIT.part, lx = HIT.x, ly = HIT.y, lz = HIT.z;
  const pos = toWorld(tgt, lx, ly, lz, [0, 0, 0]);
  const vel = p.vel.slice();
  sim.emit('hit', { pos, target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, part, vel });
  killProj(sim, p, null);
  applyDamage(sim, tgt, p.P.dmg, sim.units.get(p.from), { part, part2: partNear(tgt.def, lx, ly, lz, part), pos });
}

/* an interceptor's proximity fuze: its path this tick against the target's body (a missile's capsule, a unit's
   boxes). Within the burst radius -> it goes off at the closest point (if that point is still ahead at the end of
   the tick and nothing touched, it waits a tick). Past the target and opening -> a miss: it ends in the air. */
function fuse(sim, p, tgt) {
  const P = p.P, Rb = P.burst || 5;
  let d, s, t = 0;
  const ax = p.prev[0] - tgt.prev[0], ay = p.prev[1] - tgt.prev[1], az = p.prev[2] - tgt.prev[2];
  const bx = p.pos[0] - tgt.pos[0], by = p.pos[1] - tgt.pos[1], bz = p.pos[2] - tgt.pos[2];
  const far = bx * bx + by * by + bz * bz > (Rb + 120 + p.spd * DT * 2) ** 2 && ax * ax + ay * ay + az * az > (Rb + 120 + p.spd * DT * 2) ** 2;
  if (far) { d = Infinity; s = 1; }
  else if (p.tk === 'proj') {
    const bd = tgt.P.body || DEFBODY;
    axisOf(tgt, F);
    d = Math.max(0, segAxis(ax, ay, az, bx, by, bz, F[0], F[1], F[2], bd[0] / 2) - bd[1] / 2); s = HIT.s; t = HIT.t;
  } else { d = distUnit(tgt, ax, ay, az, bx, by, bz, Rb); s = d === Infinity ? 1 : HIT.s; }
  velOf(tgt, VT);
  const rvx = p.vel[0] - VT[0], rvy = p.vel[1] - VT[1], rvz = p.vel[2] - VT[2];
  const closing = bx * rvx + by * rvy + bz * rvz < 0;
  if (d <= Rb) {
    if (s >= .999 && d > 0 && closing) return false;             // the closest point is still ahead
    detonate(sim, p, tgt, d, s, t);
    return true;
  }
  // passed: it is now opening from a target behind it that it came near
  if (!closing && bx * p.vel[0] + by * p.vel[1] + bz * p.vel[2] > 0 && bx * bx + by * by + bz * bz < 2000 * 2000) {
    sim.emit('splash', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, air: true, miss: true, why: 'miss', target: tgt.id });
    killProj(sim, p, null);
    return true;
  }
  return false;
}
/* the burst: fragments over its radius. A missile within KILL x radius breaks up (intercept); farther out it is
   knocked out of control (spinout; one already tumbling breaks up). A unit takes the round's damage on the part
   nearest the burst (half beyond KILL x radius). */
function detonate(sim, p, tgt, d, s, t) {
  const P = p.P, Rb = P.burst || 5;
  const bp = [p.prev[0] + (p.pos[0] - p.prev[0]) * s, p.prev[1] + (p.pos[1] - p.prev[1]) * s, p.prev[2] + (p.pos[2] - p.prev[2]) * s];
  if (p.tk === 'proj') {
    const q = tgt;
    axisOf(q, F);
    // the struck point: the target's axis point nearest the burst, at the tick's instant s
    const qx = q.prev[0] + (q.pos[0] - q.prev[0]) * s + F[0] * t, qy = q.prev[1] + (q.pos[1] - q.prev[1]) * s + F[1] * t, qz = q.prev[2] + (q.pos[2] - q.prev[2]) * s + F[2] * t;
    let ix = qx - bp[0], iy = qy - bp[1], iz = qz - bp[2];
    const il = Math.sqrt(ix * ix + iy * iy + iz * iz);
    const rel = [p.vel[0] - q.vel[0], p.vel[1] - q.vel[1], p.vel[2] - q.vel[2]];
    if (il < 1e-3) { const rl = Math.hypot(rel[0], rel[1], rel[2]) || 1; ix = rel[0] / rl; iy = rel[1] / rl; iz = rel[2] / rl; } else { ix /= il; iy /= il; iz /= il; }
    // the part: the skin point facing the burst, at t along the axis
    const r = (q.P.body || DEFBODY)[1] / 2;
    const part = partOnSkin(q, F[0] * t - ix * r, F[1] * t - iy * r, F[2] * t - iz * r, t);
    const info = { by: p.id, byKind: p.kind, unit: p.from, part, pos: [qx - ix * r, qy - iy * r, qz - iz * r], rel, imp: [ix, iy, iz], cause: 'burst', miss: +d.toFixed(2), burst: bp };
    killProj(sim, p, null);
    if (d <= Rb * KILL || !q.ctrl) breakup(sim, q, info);
    else {
      sim.emit('splash', { pos: bp, kind: p.kind, side: p.side, proj: p.id, air: true, why: 'burst', target: q.id, miss: info.miss });
      spinout(sim, q, info);
    }
  } else {
    const part = HIT.part, lx = HIT.x, ly = HIT.y, lz = HIT.z, pos = toWorld(tgt, lx, ly, lz, [0, 0, 0]);
    sim.emit('hit', { pos, target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, part, miss: +d.toFixed(2), burst: bp });
    killProj(sim, p, null);
    applyDamage(sim, tgt, P.dmg * (d <= Rb * KILL ? 1 : .5), sim.units.get(p.from), { part, part2: partNear(tgt.def, lx, ly, lz, part), pos });
  }
}

/* ---------- out of control and break-up ----------
   spinout: the round tumbles: an angular velocity from the blow (the torque of the impulse about its centre, 1.5-4.5
   rad/s, plus a roll), no more steering; it flies on with gravity, the drag of the area it shows the flow and the
   normal force of a body at incidence, until it strikes its target's body, the ground or the sea.
   breakup: destroyed outright (the 'intercept' event, breakup: true). */
export function spinout(sim, q, info) {
  if (!q.alive || !q.ctrl) return;
  q.ctrl = false; q.locked = false; q.phase = 'spin';
  axisOf(q, F);
  const f = [F[0], F[1], F[2]];
  let rx = f[2], ry = 0, rz = -f[0];                               // starboard = up x forward (level)
  let rl = Math.hypot(rx, rz); if (rl < 1e-6) { rx = 1; rz = 0; rl = 1; } rx /= rl; rz /= rl;
  const up = [f[1] * rz - f[2] * ry, f[2] * rx - f[0] * rz, f[0] * ry - f[1] * rx];
  q.fw = f; q.up = up;
  // torque of the blow about the centre: lever from the centre to the struck point, force along the impulse
  const lx = info.pos[0] - q.pos[0], ly = info.pos[1] - q.pos[1], lz = info.pos[2] - q.pos[2], I = info.imp;
  let wx = ly * I[2] - lz * I[1], wy = lz * I[0] - lx * I[2], wz = lx * I[1] - ly * I[0];
  let wl = Math.hypot(wx, wy, wz);
  if (wl < 1e-6) { wx = up[0]; wy = up[1]; wz = up[2]; wl = 1; }   // a blow through the centre: it pitches
  const h1 = hsh(q.id, sim.tick), h2 = hsh(sim.tick, q.id + 7), rate = 1.5 + 3 * h1, roll = (h2 < .5 ? -1 : 1) * (2 + 6 * h2);
  q.w = [wx / wl * rate + f[0] * roll, wy / wl * rate + f[1] * roll, wz / wl * rate + f[2] * roll];
  sim.emit('spinout', {
    proj: q.id, kind: q.kind, side: q.side, pos: info.pos.slice(), at: q.pos.slice(), vel: q.vel.slice(), w: q.w.slice(), imp: I.slice(), rel: info.rel,
    model: q.P.model, part: info.part, by: info.by, byKind: info.byKind, unit: info.unit, cause: info.cause, miss: info.miss,
    seed: seedOf(sim, q), hdg: q.hdg, pitch: q.pitch, roll: q.roll, target: q.target, tk: q.tk,
  });
}
function breakup(sim, q, info) {
  killProj(sim, q, 'intercept', info);
}
const RHO0 = 1.225;
function stepTumble(sim, p) {
  const P = p.P, bd = P.body || DEFBODY, Lb = bd[0], Db = bd[1], m = bd[2] || 100, map = sim.map;
  // turn the frame by the angular velocity (Rodrigues); the tumble slowly damps
  const w = p.w, wl = Math.hypot(w[0], w[1], w[2]);
  if (wl > 1e-9) { rotate(p.fw, w, wl, DT); rotate(p.up, w, wl, DT); }
  const f = p.fw, u = p.up;
  let fl = Math.hypot(f[0], f[1], f[2]); f[0] /= fl; f[1] /= fl; f[2] /= fl;
  const fu = f[0] * u[0] + f[1] * u[1] + f[2] * u[2];
  u[0] -= f[0] * fu; u[1] -= f[1] * fu; u[2] -= f[2] * fu; fl = Math.hypot(u[0], u[1], u[2]) || 1; u[0] /= fl; u[1] /= fl; u[2] /= fl;
  const dmp = 1 - .08 * DT; w[0] *= dmp; w[1] *= dmp; w[2] *= dmp;
  // aerodynamics of a slender body at any incidence: the flow along its axis (va) drags on its cross-section; the flow
  // across it (vc) pushes on its side (crossflow drag on the planform, plus the potential normal force), opposing vc
  const v = p.vel, rho = RHO0 * Math.exp(-Math.max(0, p.pos[1]) / 8500);
  const Af = Math.PI * Db * Db / 4, As = Lb * Db;
  const va = v[0] * f[0] + v[1] * f[1] + v[2] * f[2], cx = v[0] - va * f[0], cy = v[1] - va * f[1], cz = v[2] - va * f[2];
  const vcl = Math.hypot(cx, cy, cz), aA = .5 * rho * .3 * Af * Math.abs(va) * va / m, aC = .5 * rho * (1.2 * As * vcl + 2 * Af * Math.abs(va)) / m;
  v[0] -= (aA * f[0] + aC * cx) * DT; v[1] -= (aA * f[1] + aC * cy + G) * DT; v[2] -= (aA * f[2] + aC * cz) * DT;
  p.pos[0] += v[0] * DT; p.pos[1] += v[1] * DT; p.pos[2] += v[2] * DT;
  p.spd = Math.hypot(v[0], v[1], v[2]);
  p.hdg = Math.atan2(f[0], f[2]); p.pitch = Math.asin(clamp(f[1], -1, 1));
  { // roll: the frame's up against the level up about the axis
    let rx = f[2], rz = -f[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const lux = f[1] * rz, luy = f[2] * rx - f[0] * rz, luz = -f[1] * rx;
    p.roll = Math.atan2(u[0] * rx + u[2] * rz, u[0] * lux + u[1] * luy + u[2] * luz);
  }
  // what it falls on: its target's body, else the ground or the sea
  if (p.tk === 'unit') {
    const tgt = sim.units.get(p.target);
    if (tgt && tgt.alive && !tgt.aboard) {
      const bx = p.pos[0] - tgt.pos[0], by = p.pos[1] - tgt.pos[1], bz = p.pos[2] - tgt.pos[2], R = bodyOf(tgt.def).R + p.spd * DT + 10;
      if (bx * bx + by * by + bz * bz < R * R && segUnit(tgt, p.prev[0] - tgt.prev[0], p.prev[1] - tgt.prev[1], p.prev[2] - tgt.prev[2], bx, by, bz, Db / 2, 1) >= 0) {
        const part = HIT.part, lx = HIT.x, ly = HIT.y, lz = HIT.z, pos = toWorld(tgt, lx, ly, lz, [0, 0, 0]);
        sim.emit('hit', { pos, target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, part, vel: v.slice(), spin: true });
        killProj(sim, p, null);
        applyDamage(sim, tgt, P.dmg * .6, sim.units.get(p.from), { part, part2: partNear(tgt.def, lx, ly, lz, part), pos });
        return;
      }
    }
  }
  const g = ground(map, p.pos[0], p.pos[2]);
  if (p.pos[1] <= g) {
    sim.emit('splash', { pos: [p.pos[0], g, p.pos[2]], kind: p.kind, side: p.side, proj: p.id, air: false, water: map.h(p.pos[0], p.pos[2]) < 0, why: 'spinout',
      vel: v.slice(), w: w.slice(), model: P.model, seed: seedOf(sim, p), hdg: p.hdg, pitch: p.pitch, roll: p.roll });
    killProj(sim, p, null);
    return;
  }
  if (p.age > p.maxT + 120) selfDestruct(sim, p);
}
/* rotate vector a about the unit axis w/wl by wl*dt */
function rotate(a, w, wl, dt) {
  const kx = w[0] / wl, ky = w[1] / wl, kz = w[2] / wl, th = wl * dt, c = Math.cos(th), s = Math.sin(th);
  const d = kx * a[0] + ky * a[1] + kz * a[2];
  const cx = ky * a[2] - kz * a[1], cy = kz * a[0] - kx * a[2], cz = kx * a[1] - ky * a[0];
  a[0] = a[0] * c + cx * s + kx * d * (1 - c); a[1] = a[1] * c + cy * s + ky * d * (1 - c); a[2] = a[2] * c + cz * s + kz * d * (1 - c);
}

/* ---------- torpedoes ----------
   A dropped torpedo falls into the sea first; then it runs at depth toward the side's track of its target (the aim
   point), and closes on the target itself (plus its sonar track error, PROJ.sig0) once the target is within reach of
   the aim point and near. It goes off when its path passes within PROJ.burst of the target's hull boxes (under the
   keel counts), or passes and ends, or ends on the bottom / a shore or when its run is spent.
   Not drawn (under water); the other side hears it (sensors.sonarTick). */
function stepTorpedo(sim, p) {
  const P = p.P, map = sim.map;
  let tgt = sim.units.get(p.target);
  if (tgt && (!tgt.alive || tgt.def.domain !== 'sea' || tgt.def.hover)) tgt = null;          // (a hovercraft has no hull in the water)
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
  if (p.locked && tgt) {
    dispAt(p, dxz(p.pos[0], p.pos[2], tgt.pos[0], tgt.pos[2]));
    p.aim[0] = tgt.pos[0] + DSP[0]; p.aim[2] = tgt.pos[2] + DSP[2]; p.phase = 'final';
  }
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
    const bx = p.pos[0] - tgt.pos[0], by = p.pos[1] - tgt.pos[1], bz = p.pos[2] - tgt.pos[2], R = bodyOf(tgt.def).R + (P.burst || 6) + 20;
    if (bx * bx + by * by + bz * bz < R * R) {
      if (segUnit(tgt, p.prev[0] - tgt.prev[0], p.prev[1] - tgt.prev[1], p.prev[2] - tgt.prev[2], bx, by, bz, P.burst || 6) >= 0) {
        const part = HIT.part, lx = HIT.x, ly = HIT.y, lz = HIT.z, at = toWorld(tgt, lx, ly, lz, [0, 0, 0]);
        const pos = [at[0], .5, at[2]];
        sim.emit('hit', { pos, target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, under: true, part, depth: -at[1] });
        killProj(sim, p, null);
        applyDamage(sim, tgt, P.dmg, sim.units.get(p.from), { part, part2: partNear(tgt.def, lx, ly, lz, part), pos: at });
        return;
      }
      // past it and opening: it runs on and ends
      velOf(tgt, VT);
      if (bx * (p.vel[0] - VT[0]) + by * (p.vel[1] - VT[1]) + bz * (p.vel[2] - VT[2]) > 0 && bx * p.vel[0] + bz * p.vel[2] > 0) { endTorpedo(sim, p, 'miss'); return; }
    }
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
    if (!q.alive || !q.ctrl || q.side === p.side || !q.P.threat) continue;
    if (sim.t - q.seen[p.side] > 1.01 || q.eng >= 2 || q.shots >= 4) continue;
    const d = Math.sqrt((q.pos[0] - p.pos[0]) ** 2 + (q.pos[1] - p.pos[1]) ** 2 + (q.pos[2] - p.pos[2]) ** 2);
    if (d < bd) { bd = d; best = q; }
  }
  if (best) { p.target = best.id; best.eng++; best.shots++; p.minD = 1e9; }
  return best;
}

/* a shell that came down without striking its target's body: its fragments reach a body within PROJ.blast of the
   burst point (the part nearest it takes half the damage) */
function shellImpact(sim, p) {
  const b = p.ball, tgt = sim.units.get(p.target), P = p.P;
  if (tgt && tgt.alive && !tgt.aboard && P.blast) {
    const d = pointUnit(tgt, b.imp[0] - tgt.pos[0], b.imp[1] - tgt.pos[1], b.imp[2] - tgt.pos[2]);
    if (d <= P.blast) {
      const part = HIT.part, lx = HIT.x, ly = HIT.y, lz = HIT.z;
      sim.emit('hit', { pos: b.imp.slice(), target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, part, blast: +d.toFixed(1) });
      killProj(sim, p, null);
      applyDamage(sim, tgt, P.dmg * .5, sim.units.get(p.from), { part, part2: partNear(tgt.def, lx, ly, lz, part), pos: b.imp.slice() });
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
    // destroyed outright: what a break-up (debris) system needs rides on the event (README: Events)
    sim.emit('intercept', { pos: info.pos || p.pos.slice(), proj: p.id, kind: p.kind, side: p.side, by: info.by, byKind: info.byKind, unit: info.unit, target: p.target,
      breakup: true, at: p.pos.slice(), vel: p.vel.slice(), rel: info.rel || null, imp: info.imp || null, w: p.w ? p.w.slice() : [0, 0, 0],
      model: p.P.model, part: info.part || null, cause: info.cause || null, miss: info.miss, burst: info.burst || null,
      hdg: p.hdg, pitch: p.pitch, roll: p.roll || 0, seed: seedOf(sim, p), tk: p.tk });
  }
}
