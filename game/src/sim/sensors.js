/* Sensors and the picture (fog of war).
   - Radars sweep with a period; each paint of a target inside range, above the radar horizon and in line of sight
     raises that contact's confidence. Horizon: d_km = 4.12 (sqrt(h1_m) + sqrt(h2_m)).
   - Cameras (drone, helo) give fast confidence at short range.
   - Radiating units (radars on, the command post's comms) can be heard by the other side: a rough contact with a
     large error that never classifies on its own.
   - Unseen contacts decay and their error grows; confidence >= CLASSIFY classifies the track and allows engagement.
   - SCAN: after a short delay every enemy unit in the radius is identified (conf .97); the scanner is revealed. */
import { UNITS, PROJ, ENEMY, CLASSIFY } from '../data/units.js';
import { SIDE_SCAN_CD, SCAN_DELAY } from './consts.js';
import { gauss } from './rand.js';
import { dxz, ground, wrapPi } from './util.js';

const R43 = 16.99e6;          // 2 x (4/3 earth radius), m: bulge = f (1 - f) d^2 / R43
const TAU = Math.PI * 2;

export function horizon(h1, h2) { return 4120 * (Math.sqrt(h1 > 0 ? h1 : 0) + Math.sqrt(h2 > 0 ? h2 : 0)); }

/* line of sight over terrain (with earth bulge) between two absolute points [x, y, z] */
export function los(map, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.sqrt(dx * dx + dz * dz);
  if (d < 50) return true;
  const n = Math.min(28, Math.max(3, Math.ceil(d / 2000)));
  for (let i = 1; i < n; i++) {
    const f = i / n;
    let g = map.h(ax + dx * f, az + dz * f); if (g < 0) g = 0;
    g += f * (1 - f) * d * d / R43;
    if (g > ay + (by - ay) * f) return false;
  }
  return true;
}

/* absolute antenna height of a sensor unit, and the height of a target's top */
function antH(u, R) {
  if (u.def.domain === 'air') return u.pos[1];
  const h = R && R.h ? R.h * (R.needsMast ? Math.max(.25, u.mast) : 1) : u.def.top;
  return u.pos[1] + h;
}
export function topH(e) {
  if (e.def.domain === 'air') return e.pos[1];
  if (e.dying > 0) return e.pos[1] + e.def.top * (1 - e.dying);
  return e.pos[1] + (e.type === 'tel' && e.elev > .3 ? e.def.topErect : e.def.top);
}

export function radarWorks(u) {
  const R = u.def.sensors.radar;
  return !!R && u.radarOn && !u.off.radar && !u.aboard && (!R.needsMast || u.mast >= 1) && u.alive;
}
export function emitting(u) {
  if (!u.alive || u.aboard) return false;
  if (u.def.hq && u.def.emits && u.def.domain === 'land') return !u.off.scan;
  return radarWorks(u);
}

function rangeVs(R, e) {
  const dom = e.def.domain;
  if (dom === 'air') return R.air;
  if (dom === 'land') return R.surf * (R.land || 0);
  return R.surf;
}

/* ---------- contacts ---------- */
export function getContact(sim, side, e) {
  const S = sim.sides[side];
  let c = S.contacts.get(e.id);
  if (!c) {
    c = {
      track: 'TRK ' + (S.trkNext++), unitId: e.id, conf: 0, cls: null, type: null, name: null,
      pos: [e.pos[0], e.pos[1], e.pos[2]], vel: [0, 0, 0], err: 5000, lastSeen: sim.t, firstSeen: sim.t,
      identified: false, emitting: false, lastEmit: -1e9, dom: e.def.domain, hits: 0, dead: false, fresh: true,
    };
    S.contacts.set(e.id, c);
  }
  return c;
}

/* a detection with measurement noise sigma (m) and confidence gain */
export function detect(sim, side, e, sigma, gain, how) {
  if (!e.alive || e.aboard) return null;
  const S = sim.sides[side], isNew = !S.contacts.has(e.id);
  const c = getContact(sim, side, e), r = sim.rng.sense, t = sim.t;
  const mx = e.pos[0] + gauss(r) * sigma, mz = e.pos[2] + gauss(r) * sigma;
  const my = e.def.domain === 'air' ? e.pos[1] + gauss(r) * sigma * .3 : e.pos[1];
  if (isNew || c.err > sigma * 4 || t - c.lastSeen > 60) {
    c.pos[0] = mx; c.pos[1] = my; c.pos[2] = mz; c.vel[0] = c.vel[1] = c.vel[2] = 0; c.err = sigma;
  } else {
    const dt = Math.max(.25, t - c.lastSeen), a = .5, b = .08 / dt;
    const rx = mx - c.pos[0], ry = my - c.pos[1], rz = mz - c.pos[2];
    c.pos[0] += a * rx; c.pos[1] += a * ry; c.pos[2] += a * rz;
    c.vel[0] += b * rx; c.vel[1] += b * ry; c.vel[2] += b * rz;
    const vmax = c.dom === 'air' ? 400 : c.dom === 'sea' ? 20 : 25, v = Math.sqrt(c.vel[0] * c.vel[0] + c.vel[2] * c.vel[2]);
    if (v > vmax) { c.vel[0] *= vmax / v; c.vel[2] *= vmax / v; }
    c.vel[1] = c.dom === 'air' ? Math.max(-60, Math.min(60, c.vel[1])) : 0;
    c.err = Math.min(c.err, sigma) * .9 + sigma * .1;
  }
  c.conf += (1 - c.conf) * gain;
  if (c.conf > .995) c.conf = .995;
  c.lastSeen = t; c.hits++;
  if (isNew) sim.emit('detect', { side, unit: e.id, track: c.track, pos: c.pos.slice(), how, dom: c.dom });
  classify(sim, side, c, e);
  return c;
}
function classify(sim, side, c, e) {
  if (!c.cls && c.conf >= CLASSIFY) {
    c.cls = e.def.cls; c.type = e.type; c.name = e.def.name;
    sim.emit('classify', { side, unit: e.id, track: c.track, cls: c.cls, name: c.name, pos: c.pos.slice() });
  }
}

/* a rough contact from hearing a radiating unit or seeing a launch: never classifies by itself */
export function roughContact(sim, side, e, err, gain, cap) {
  if (!e.alive || e.aboard) return null;
  const S = sim.sides[side], isNew = !S.contacts.has(e.id), c = getContact(sim, side, e), r = sim.rng.sense;
  // fuse the fix by accuracy (a precise track barely moves; repeated rough fixes average down, not below err / 3)
  const mx = e.pos[0] + gauss(r) * err * .6, mz = e.pos[2] + gauss(r) * err * .6;
  if (isNew || sim.t - c.lastSeen > 60) { c.pos[0] = mx; c.pos[2] = mz; c.pos[1] = e.pos[1]; c.err = err; c.vel[0] = c.vel[1] = c.vel[2] = 0; c.lastSeen = sim.t; }
  else if (c.err > err * .34) {
    const a = c.err * c.err, b = err * err, w = a / (a + b);
    c.pos[0] += (mx - c.pos[0]) * w; c.pos[2] += (mz - c.pos[2]) * w;
    c.err = Math.max(err / 3, Math.sqrt(a * b / (a + b)));
    if (c.err > 1000) { c.vel[0] = c.vel[1] = c.vel[2] = 0; }
    c.lastSeen = sim.t;
  }
  if (c.conf < cap) c.conf = Math.min(cap, c.conf + gain);
  if (isNew) sim.emit('detect', { side, unit: e.id, track: c.track, pos: c.pos.slice(), how: 'esm', dom: c.dom });
  classify(sim, side, c, e);
  return c;
}

/* ---------- the sensor tick (every SENSE_EVERY ticks) ---------- */
const SENSORS = [];
export function senseTick(sim, dt) {
  const t = sim.t, map = sim.map, wx = sim.weather;
  // fog off (sandbox): both pictures are ground truth, silently, so attacks work on anything in view
  if (!sim.fog) for (const side of ['coast', 'fleet']) for (const e of sim.alive(ENEMY[side])) {
    if (e.aboard) continue;
    const c = getContact(sim, side, e);
    c.pos[0] = e.pos[0]; c.pos[1] = e.pos[1]; c.pos[2] = e.pos[2]; c.vel[0] = c.vel[1] = c.vel[2] = 0;
    c.err = 10; c.conf = .995; c.lastSeen = t; c.identified = true; c.fresh = false;
    if (!c.cls) { c.cls = e.def.cls; c.type = e.type; c.name = e.def.name; }
  }
  for (const side of ['coast', 'fleet']) {
    const all = sim.alive(side), foes = sim.alive(ENEMY[side]);
    // only units that carry a radar or a camera look
    const own = SENSORS; own.length = 0;
    for (let i = 0; i < all.length; i++) { const u = all[i]; if (!u.aboard && (u.def.sensors.radar || u.def.sensors.camera)) own.push(u); }
    for (let i = 0; i < own.length; i++) {
      const u = own[i];
      if (u.aboard) continue;
      const Sd = u.def.sensors;
      // radar sweep: world-bearing sector covered since the last tick
      if (Sd.radar && radarWorks(u)) {
        const R = Sd.radar, ha = antH(u, R);
        const a1 = u.hdg + u.antA + u.antW * (t - u.antT), sweep = u.antW * dt, a0 = a1 - sweep;
        const full = sweep >= TAU - 1e-6;
        const rmax = Math.max(R.air, R.surf);
        for (let j = 0; j < foes.length; j++) {
          const e = foes[j];
          if (e.aboard) continue;
          const dx = e.pos[0] - u.pos[0], dz = e.pos[2] - u.pos[2];
          if (Math.abs(dx) > rmax || Math.abs(dz) > rmax) continue;
          const d = Math.sqrt(dx * dx + dz * dz);
          let rng = rangeVs(R, e);
          if (!rng || d > rng) continue;
          if (!full) {
            const b = Math.atan2(dx, dz), off = wrapPi(b - a0);
            if ((off < 0 ? off + TAU : off) > sweep) continue;
          }
          rng *= Math.pow(e.def.rcs, .25) * wx.radar(e.pos[0], e.pos[2]);
          if (d > rng) continue;
          const ht = topH(e);
          if (d > horizon(ha, ht)) continue;
          if (!los(map, u.pos[0], ha, u.pos[2], e.pos[0], ht, e.pos[2])) continue;
          const f = d / rng, pd = .95 - .55 * f * f;
          if (sim.rng.sense() > pd) continue;
          detect(sim, side, e, 30 + .004 * d, R.gain, 'radar');
        }
      }
      // camera: every tick, all around, short range
      if (Sd.camera && !u.off.camera) {
        const C = Sd.camera, ha = u.pos[1];
        for (let j = 0; j < foes.length; j++) {
          const e = foes[j];
          if (e.aboard) continue;
          const dx = e.pos[0] - u.pos[0], dz = e.pos[2] - u.pos[2];
          if (Math.abs(dx) > C.range || Math.abs(dz) > C.range) continue;
          const d = Math.sqrt(dx * dx + dz * dz), rng = C.range * wx.camera(e.pos[0], e.pos[2]);
          if (d > rng) continue;
          if (!los(map, u.pos[0], ha, u.pos[2], e.pos[0], topH(e), e.pos[2])) continue;
          if (sim.rng.sense() > .92 - .3 * (d / rng)) continue;
          detect(sim, side, e, 8 + .002 * d, C.gain, 'camera');
          u.aimB = Math.atan2(dx, dz);
        }
      }
    }
    seeProjectiles(sim, side, own);
    decay(sim, side, dt);
  }
}

/* projectiles are not contacts; a side "sees" one while any of its radars or cameras covers it */
function seeProjectiles(sim, side, own) {
  const t = sim.t, map = sim.map;
  for (const p of sim.projectiles.values()) {
    if (p.side === side || !p.alive) continue;
    if (t - p.seen[side] < .3) continue;
    const rcs = p.P.rcs || .1, k = Math.pow(rcs, .25);
    for (let i = 0; i < own.length; i++) {
      const u = own[i];
      if (u.aboard) continue;
      const Sd = u.def.sensors;
      let rng = 0, ha = 0;
      if (Sd.radar && radarWorks(u)) { rng = Sd.radar.air * k * sim.weather.radar(p.pos[0], p.pos[2]); ha = antH(u, Sd.radar); }
      if (Sd.camera && !u.off.camera && Sd.camera.range > rng) { rng = Sd.camera.range; ha = u.pos[1]; }
      if (!rng) continue;
      const dx = p.pos[0] - u.pos[0], dz = p.pos[2] - u.pos[2];
      if (Math.abs(dx) > rng || Math.abs(dz) > rng) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > rng || d > horizon(ha, p.pos[1])) continue;
      if (!los(map, u.pos[0], ha, u.pos[2], p.pos[0], p.pos[1], p.pos[2])) continue;
      if (p.seen[side] < 0) sim.emit('detect', { side, proj: p.id, kind: p.kind, pos: p.pos.slice(), how: 'radar', dom: 'missile' });
      p.seen[side] = t;
      break;
    }
  }
}

function decay(sim, side, dt) {
  const S = sim.sides[side], t = sim.t;
  for (const [id, c] of S.contacts) {
    c.pos[0] += c.vel[0] * dt; c.pos[2] += c.vel[2] * dt;
    if (c.dom === 'air') c.pos[1] += c.vel[1] * dt;
    const since = t - c.lastSeen;
    if (since > 4) {
      c.conf -= (c.cls ? (c.dom === 'air' ? .01 : .004) : .015) * dt;
      c.err = Math.min(30000, c.err + (c.dom === 'air' ? 120 : c.dom === 'sea' ? 12 : c.type === 'hq' ? 0 : 6) * dt);
      if (since > (c.dom === 'air' ? 8 : 30)) { c.vel[0] *= .96; c.vel[1] *= .9; c.vel[2] *= .96; }
    }
    c.fresh = since < 6;
    if (c.emitting && t - c.lastEmit > 10) c.emitting = false;
    if (c.conf < .04 || since > 900 || (c.dead && t - c.deadT > 8)) {
      S.contacts.delete(id);
      if (!c.dead) sim.emit('lost', { side, unit: id, track: c.track, pos: c.pos.slice() });
    }
  }
}

/* ---------- emitters (1 Hz): radiating units are heard by the other side ---------- */
export function esmTick(sim) {
  for (const side of ['coast', 'fleet']) {
    const own = sim.alive(side), foes = sim.alive(ENEMY[side]);
    for (const e of foes) {
      if (!emitting(e)) continue;
      const er = e.def.emits ? e.def.emits.range : 0;
      if (!er) continue;
      const he = e.def.domain === 'air' ? e.pos[1] : e.pos[1] + (e.def.sensors.radar ? e.def.sensors.radar.h || 5 : 10);
      let best = 1e18;
      for (const u of own) {
        if (u.aboard) continue;
        const d = dxz(u.pos[0], u.pos[2], e.pos[0], e.pos[2]);
        if (d > er || d >= best) continue;
        if (d > horizon(he, topH(u)) * 1.15) continue;
        best = d;
      }
      if (best === 1e18) continue;
      const c = roughContact(sim, side, e, Math.max(2500, .1 * best), .05, .45);
      if (c) { c.emitting = true; c.lastEmit = sim.t; }
    }
  }
}

/* a launch shows the shooter to the other side (rough position) */
export function launchSeen(sim, u) {
  const foe = ENEMY[u.side];
  for (const v of sim.alive(foe)) {
    if (v.aboard) continue;
    if (dxz(u.pos[0], u.pos[2], v.pos[0], v.pos[2]) < 160000) { roughContact(sim, foe, u, 2500, .2, .5); return; }
  }
}

/* ---------- SCAN ---------- */
export function scanBlocked(sim, u) {
  const sc = u.def.scan;
  if (!sc) return 'none';
  if (u.off.scan || !u.alive || u.aboard) return 'disabled';
  if (u.def.mast && !radarWorks(u)) return 'radar';
  if (sim.sides[u.side].scanCd > 0 || u.cooldowns.scan > 0) return 'cooldown';
  return '';
}
export function startScan(sim, u, x, z) {
  const sc = u.def.scan, S = sim.sides[u.side];
  S.scanCd = SIDE_SCAN_CD; u.cooldowns.scan = sc.cd;
  const y = ground(sim.map, x, z);
  sim.scans.push({ side: u.side, by: u.id, x, z, r: sc.r, at: sim.t + SCAN_DELAY });
  sim.emit('scan', { phase: 'start', side: u.side, by: u.id, from: u.pos.slice(), pos: [x, y, z], r: sc.r, delay: SCAN_DELAY });
  // scanning shows the scanner to the other side for a moment
  const c = roughContact(sim, ENEMY[u.side], u, 400, .5, .55);
  if (c) { c.emitting = true; c.lastEmit = sim.t; }
}
export function resolveScans(sim) {
  const t = sim.t;
  for (let i = sim.scans.length - 1; i >= 0; i--) {
    const s = sim.scans[i];
    if (t < s.at) continue;
    sim.scans.splice(i, 1);
    const hits = [];
    // what the scan does not find inside its radius is not there: stale contacts there are dropped
    for (const [id, c] of sim.sides[s.side].contacts) {
      if (c.dom === 'air' || c.emitting || dxz(c.pos[0], c.pos[2], s.x, s.z) > s.r) continue;
      const e = sim.units.get(id);
      if (!e || !e.alive || dxz(e.pos[0], e.pos[2], s.x, s.z) > s.r) { sim.sides[s.side].contacts.delete(id); if (!c.dead) sim.emit('lost', { side: s.side, unit: id, track: c.track, pos: c.pos.slice(), by: 'scan' }); }
    }
    for (const e of sim.alive(ENEMY[s.side])) {
      if (e.aboard) continue;
      if (dxz(e.pos[0], e.pos[2], s.x, s.z) > s.r) continue;
      const c = detect(sim, s.side, e, 5, 1, 'scan');
      if (!c) continue;
      c.conf = Math.max(c.conf, .97); c.identified = true; c.err = 5;
      c.pos[0] = e.pos[0]; c.pos[1] = e.pos[1]; c.pos[2] = e.pos[2];
      classify(sim, s.side, c, e);
      hits.push(e.id);
    }
    sim.emit('scan', { phase: 'hit', side: s.side, by: s.by, pos: [s.x, ground(sim.map, s.x, s.z), s.z], r: s.r, hits });
  }
}

/* lightning: a flash reveals everything near it to both sides */
export function flashReveal(sim, x, z, r) {
  for (const side of ['coast', 'fleet']) for (const e of sim.alive(ENEMY[side])) {
    if (e.aboard) continue;
    if (dxz(e.pos[0], e.pos[2], x, z) < r) detect(sim, side, e, 150, .3, 'lightning');
  }
}
