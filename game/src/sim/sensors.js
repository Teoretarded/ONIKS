/* Sensors and the picture (fog of war).
   - Radars sweep with a period; each paint of a target inside range, above the radar horizon and in line of sight
     raises that contact's confidence. Horizon: d_km = 4.12 (sqrt(h1_m) + sqrt(h2_m)).
   - Cameras (drone, helo) give fast confidence at short range.
   - Radiating units (radars on, the command post's comms) can be heard by the other side: a rough contact with a
     large error that never classifies on its own.
   - Unseen contacts decay and their error grows; confidence >= CLASSIFY classifies the track and allows engagement.
   - SCAN: after a short delay every enemy unit in the radius is identified (conf .97); the scanner is revealed.
   - Submarines: a submerged boat is invisible to radar and cameras (at periscope depth its masts show to a radar at
     short range and to a camera close by), scans do not reach it, lightning does not show it. SONAR (destroyer hull
     sonar, the MH-60R's dipping sonar while it hovers, the boats' own) hears submerged boats at short range (boats
     also hear ships far off); the contacts it makes are like any other (confidence, classification). Torpedoes are
     heard by sonar, never seen by radar. A boat that launches is heard / seen for a moment (launchSeen). */
import { UNITS, PROJ, ENEMY, CLASSIFY } from '../data/units.js';
import { SIDE_SCAN_CD, SCAN_DELAY } from './consts.js';
import { gauss } from './rand.js';
import { dxz, ground, wrapPi } from './util.js';
import { isSub, submerged, deep, domOf, mastTop, noiseOf } from './subs.js';

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
  if (u.def.sub) return mastTop(u);
  const h = R && R.h ? R.h * (R.needsMast ? Math.max(.25, u.mast) : 1) : u.def.top;
  return u.pos[1] + h;
}
export function topH(e) {
  if (e.def.domain === 'air') return e.pos[1];
  if (e.def.sub) return mastTop(e);
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

/* a working sonar: the dipping sonar only while its helicopter hovers low; hull and boat sonars always */
export function sonarWorks(u) {
  const S = u.def.sensors.sonar;
  if (!S || !u.alive || u.aboard || u.off.sonar) return false;
  if (S.dip) return u.speed < 6;
  return true;
}
/* what a submerged boat still shows to radar / cameras: masts at periscope depth, nothing deeper */
const subVis = (e, cam) => !isSub(e) || !submerged(e) ? 1 : deep(e) ? 0 : cam ? .5 : .14;

function rangeVs(R, e) {
  const dom = e.def.domain;
  if (dom === 'air') return R.air;
  if (dom === 'land') return R.surf * (R.land || 0);
  return R.surf;
}

/* ---------- contacts ---------- */
/* bumped by everything here that adds, drops or updates a contact: a cache of a side's picture (weapons.js, within
   one weapons tick) is good while it has not moved */
export const PICTURE = { v: 0 };
export function getContact(sim, side, e) {
  PICTURE.v++;
  const S = sim.sides[side];
  let c = S.contacts.get(e.id);
  if (!c) {
    c = {
      track: 'TRK ' + (S.trkNext++), unitId: e.id, conf: 0, cls: null, type: null, name: null,
      pos: [e.pos[0], e.pos[1], e.pos[2]], vel: [0, 0, 0], err: 5000, lastSeen: sim.t, firstSeen: sim.t,
      identified: false, emitting: false, lastEmit: -1e9, dom: domOf(e), hits: 0, dead: false, fresh: true, pingT: -1e9, deadT: 0,
    };
    S.contacts.set(e.id, c);
  }
  return c;
}

/* a detection with measurement noise sigma (m) and confidence gain */
export function detect(sim, side, e, sigma, gain, how) {
  if (!e.alive || e.aboard) return null;
  PICTURE.v++;
  const S = sim.sides[side], isNew = !S.contacts.has(e.id);
  const c = getContact(sim, side, e), r = sim.rng.sense, t = sim.t;
  const mx = e.pos[0] + gauss(r) * sigma, mz = e.pos[2] + gauss(r) * sigma;
  const my = e.def.domain === 'air' ? e.pos[1] + gauss(r) * sigma * .3 : e.pos[1];
  c.dom = domOf(e);
  if (isNew || c.err > sigma * 4 || t - c.lastSeen > 60) {
    c.pos[0] = mx; c.pos[1] = my; c.pos[2] = mz; c.vel[0] = c.vel[1] = c.vel[2] = 0; c.err = sigma;
  } else {
    const dt = Math.max(.25, t - c.lastSeen), a = .5, b = .08 / dt;
    const rx = mx - c.pos[0], ry = my - c.pos[1], rz = mz - c.pos[2];
    c.pos[0] += a * rx; c.pos[1] += a * ry; c.pos[2] += a * rz;
    c.vel[0] += b * rx; c.vel[1] += b * ry; c.vel[2] += b * rz;
    const vmax = c.dom === 'air' ? 400 : c.dom === 'sea' || c.dom === 'sub' ? 20 : 25, v = Math.sqrt(c.vel[0] * c.vel[0] + c.vel[2] * c.vel[2]);
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
  PICTURE.v++;
  const S = sim.sides[side], isNew = !S.contacts.has(e.id), c = getContact(sim, side, e), r = sim.rng.sense;
  c.dom = domOf(e);
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

/* ---------- the sensor tick (every SENSE_EVERY ticks) ----------
   Hot path. Per side and tick the enemy units are copied once into flat tables (position, range class, what a
   submerged boat still shows) and the per-foe terms every sensor would recompute (weather at the target, its
   height, rcs^.25) are cached on first use; each sensor then scans the tables. Only pure tests are cached or
   reordered: the seeded draws (sim.rng.sense) happen for the same pairs in the same order as a plain loop. */
const SENSORS = [];
const FE = [];                                          // the foes (not aboard), in sim.alive() order
let FCAP = 0, FX, FZ, FDOM, FSVR, FSVC, FK4, FWR, FWC, FTOP;
function foeTables(foes) {
  if (foes.length > FCAP) {
    FCAP = Math.max(64, foes.length * 2);
    FX = new Float64Array(FCAP); FZ = new Float64Array(FCAP); FDOM = new Uint8Array(FCAP);
    FSVR = new Float64Array(FCAP); FSVC = new Float64Array(FCAP); FK4 = new Float64Array(FCAP);
    FWR = new Float64Array(FCAP); FWC = new Float64Array(FCAP); FTOP = new Float64Array(FCAP);
  }
  let n = 0;
  for (let j = 0; j < foes.length; j++) {
    const e = foes[j];
    if (e.aboard) continue;
    FE[n] = e; FX[n] = e.pos[0]; FZ[n] = e.pos[2];
    const dom = e.def.domain;
    FDOM[n] = dom === 'air' ? 0 : dom === 'land' ? 1 : 2;
    FSVR[n] = subVis(e, false); FSVC[n] = subVis(e, true);
    FK4[n] = NaN; FWR[n] = NaN; FWC[n] = NaN; FTOP[n] = NaN;       // computed on first use
    n++;
  }
  FE.length = n;
  return n;
}
/* the side's looking units, flattened (seeProjectiles reuses them) */
let SCAP = 0, SX, SZ, SY, SHA, SAIR, SSKIM, SCAM, SRAD;
function sensorTables(own) {
  if (own.length > SCAP) {
    SCAP = Math.max(64, own.length * 2);
    SX = new Float64Array(SCAP); SZ = new Float64Array(SCAP); SY = new Float64Array(SCAP); SHA = new Float64Array(SCAP);
    SAIR = new Float64Array(SCAP); SSKIM = new Float64Array(SCAP); SCAM = new Float64Array(SCAP); SRAD = new Uint8Array(SCAP);
  }
  for (let i = 0; i < own.length; i++) {
    const u = own[i], Sd = u.def.sensors;
    SX[i] = u.pos[0]; SZ[i] = u.pos[2]; SY[i] = u.pos[1];
    const R = Sd.radar, on = !!R && radarWorks(u);
    SRAD[i] = on ? 1 : 0;
    SAIR[i] = on ? R.air : 0; SHA[i] = on ? antH(u, R) : 0; SSKIM[i] = on && R.skim ? R.skim : 0;
    SCAM[i] = Sd.camera && !u.off.camera ? Sd.camera.range : 0;
  }
}
const SQ4120 = 4120;
export function senseTick(sim, dt) {
  const t = sim.t, map = sim.map, wx = sim.weather;
  // fog off (sandbox): both pictures are ground truth, silently, so attacks work on anything in view
  if (!sim.fog) for (const side of ['coast', 'fleet']) for (const e of sim.alive(ENEMY[side])) {
    if (e.aboard) continue;
    const c = getContact(sim, side, e);
    c.pos[0] = e.pos[0]; c.pos[1] = e.pos[1]; c.pos[2] = e.pos[2]; c.vel[0] = c.vel[1] = c.vel[2] = 0;
    c.err = 10; c.conf = .995; c.lastSeen = t; c.identified = true; c.fresh = false; c.dom = domOf(e);
    if (!c.cls) { c.cls = e.def.cls; c.type = e.type; c.name = e.def.name; }
  }
  for (const side of ['coast', 'fleet']) {
    const all = sim.alive(side), nf = foeTables(sim.alive(ENEMY[side]));
    // only units that carry a radar or a camera look
    const own = SENSORS; own.length = 0;
    for (let i = 0; i < all.length; i++) { const u = all[i]; if (!u.aboard && (u.def.sensors.radar || u.def.sensors.camera)) own.push(u); }
    sensorTables(own);
    for (let i = 0; i < own.length; i++) {
      const u = own[i];
      const Sd = u.def.sensors, ux = SX[i], uz = SZ[i];
      // radar sweep: world-bearing sector covered since the last tick
      if (SRAD[i]) {
        const R = Sd.radar, ha = SHA[i], sha = Math.sqrt(ha > 0 ? ha : 0);
        const a1 = u.hdg + u.antA + u.antW * (t - u.antT), sweep = u.antW * dt, a0 = a1 - sweep;
        const full = sweep >= TAU - 1e-6;
        const rmax = Math.max(R.air, R.surf), rA = R.air, rL = R.surf * (R.land || 0), rS = R.surf;
        // a cheap pre-test of the sector: the angle from the sector's centre, well outside its half-width (the
        // margin dwarfs the rounding of either test), rejects the pair; anything near the edge takes the exact test
        const hw = sweep * .5, pre = !full && hw + 1e-3 < Math.PI;
        const cs = pre ? Math.sin(a0 + hw) : 0, cc = pre ? Math.cos(a0 + hw) : 0, cl = pre ? Math.cos(hw + 1e-3) : 0;
        for (let j = 0; j < nf; j++) {
          const dx = FX[j] - ux, dz = FZ[j] - uz;
          if (Math.abs(dx) > rmax || Math.abs(dz) > rmax) continue;
          const d = Math.sqrt(dx * dx + dz * dz), dm = FDOM[j];
          let rng = (dm === 0 ? rA : dm === 1 ? rL : rS) * FSVR[j];
          if (!rng || d > rng) continue;
          if (!full) {
            if (pre && dx * cs + dz * cc < cl * d) continue;
            const b = Math.atan2(dx, dz), off = wrapPi(b - a0);
            if ((off < 0 ? off + TAU : off) > sweep) continue;
          }
          const e = FE[j];
          let k4 = FK4[j]; if (k4 !== k4) k4 = FK4[j] = Math.pow(e.def.rcs, .25);
          let wr = FWR[j]; if (wr !== wr) wr = FWR[j] = wx.radar(FX[j], FZ[j]);
          rng *= k4 * wr;
          if (d > rng) continue;
          let ht = FTOP[j]; if (ht !== ht) ht = FTOP[j] = topH(e);
          if (d > SQ4120 * (sha + Math.sqrt(ht > 0 ? ht : 0))) continue;          // horizon(ha, ht)
          if (!los(map, ux, ha, uz, FX[j], ht, FZ[j])) continue;
          const f = d / rng, pd = .95 - .55 * f * f;
          if (sim.rng.sense() > pd) continue;
          detect(sim, side, e, 30 + .004 * d, R.gain, 'radar');
        }
      }
      // camera: every tick, all around, short range
      if (Sd.camera && !u.off.camera && !(Sd.camera.mast && (u.mastUp || 0) < .8)) {
        const C = Sd.camera, ha = u.def.sub ? mastTop(u) : u.pos[1], CR = C.range;
        for (let j = 0; j < nf; j++) {
          const dx = FX[j] - ux, dz = FZ[j] - uz;
          if (Math.abs(dx) > CR || Math.abs(dz) > CR) continue;
          let wc = FWC[j]; if (wc !== wc) wc = FWC[j] = wx.camera(FX[j], FZ[j]);
          const d = Math.sqrt(dx * dx + dz * dz), rng = CR * wc * FSVC[j];
          if (d > rng) continue;
          const e = FE[j];
          let ht = FTOP[j]; if (ht !== ht) ht = FTOP[j] = topH(e);
          if (!los(map, ux, ha, uz, FX[j], ht, FZ[j])) continue;
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

/* projectiles are not contacts; a side "sees" one while any of its radars or cameras covers it (the sensor tables
   of senseTick: filled for this side just before) */
function seeProjectiles(sim, side, own) {
  const t = sim.t, map = sim.map, n = own.length, wx = sim.weather;
  for (const p of sim.projectiles.values()) {
    if (p.side === side || !p.alive || p.P.torpedo) continue;
    if (t - p.seen[side] < .3) continue;
    const rcs = p.P.rcs || .1, k = Math.pow(rcs, .25);
    const px = p.pos[0], py = p.pos[1], pz = p.pos[2], sp = Math.sqrt(py > 0 ? py : 0);
    // whether any sensor covers the round does not depend on the order they are asked in (nothing is drawn): ask
    // first the one that covered it last time (its index in this side's table), then the rest
    const last = side === 'coast' ? p._seeC : p._seeF;
    let wr = NaN, hit = -1;
    for (let q = -1; q < n; q++) {
      const i = q < 0 ? last : q;
      if (i < 0 || i >= n || (q >= 0 && i === last)) continue;
      let rng = 0, ha = 0;
      if (SRAD[i]) {
        if (wr !== wr) wr = wx.radar(px, pz);
        rng = SAIR[i] * k * wr; ha = SHA[i];
        // a look-down radar (the E-2D's) loses sea-skimmers in the sea clutter: skim = its range factor under 80 m
        if (SSKIM[i] && py < 80) rng *= SSKIM[i];
      }
      if (SCAM[i] > rng) { rng = SCAM[i]; ha = SY[i]; }
      if (!rng) continue;
      const dx = px - SX[i], dz = pz - SZ[i];
      if (Math.abs(dx) > rng || Math.abs(dz) > rng) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > rng || d > SQ4120 * (Math.sqrt(ha > 0 ? ha : 0) + sp)) continue;     // horizon(ha, p.pos[1])
      if (!los(map, SX[i], ha, SZ[i], px, py, pz)) continue;
      hit = i;
      break;
    }
    if (hit < 0) continue;
    if (side === 'coast') p._seeC = hit; else p._seeF = hit;
    if (p.seen[side] < 0) sim.emit('detect', { side, proj: p.id, kind: p.kind, pos: p.pos.slice(), how: 'radar', dom: 'missile' });
    p.seen[side] = t;
  }
}

function decay(sim, side, dt) {
  const S = sim.sides[side], t = sim.t;
  PICTURE.v++;
  for (const [id, c] of S.contacts) {
    c.pos[0] += c.vel[0] * dt; c.pos[2] += c.vel[2] * dt;
    if (c.dom === 'air') c.pos[1] += c.vel[1] * dt;
    const since = t - c.lastSeen;
    if (since > 4) {
      c.conf -= (c.cls ? (c.dom === 'air' ? .01 : .004) : .015) * dt;
      c.err = Math.min(30000, c.err + (c.dom === 'air' ? 120 : c.dom === 'sea' || c.dom === 'sub' ? 12 : c.type === 'hq' ? 0 : 6) * dt);
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
let LCAP = 0, LX, LZ, LTOP;
export function esmTick(sim) {
  for (const side of ['coast', 'fleet']) {
    const own = sim.alive(side), foes = sim.alive(ENEMY[side]);
    // the listeners, flattened once (roughContact below changes contacts only, never a unit)
    let n = 0;
    if (own.length > LCAP) { LCAP = Math.max(64, own.length * 2); LX = new Float64Array(LCAP); LZ = new Float64Array(LCAP); LTOP = new Float64Array(LCAP); }
    for (const u of own) {
      if (u.aboard || deep(u)) continue;                          // a deep boat has no mast up to listen with
      const h = topH(u);
      LX[n] = u.pos[0]; LZ[n] = u.pos[2]; LTOP[n] = Math.sqrt(h > 0 ? h : 0); n++;
    }
    for (const e of foes) {
      if (!emitting(e)) continue;
      const er = e.def.emits ? e.def.emits.range : 0;
      if (!er) continue;
      const he = e.def.domain === 'air' ? e.pos[1] : e.pos[1] + (e.def.sensors.radar ? e.def.sensors.radar.h || 5 : 10);
      const ex = e.pos[0], ez = e.pos[2], she = Math.sqrt(he > 0 ? he : 0);
      let best = 1e18;
      for (let i = 0; i < n; i++) {
        const ax = LX[i], az = LZ[i];
        if (Math.abs(ex - ax) > er || Math.abs(ez - az) > er) continue;
        const d = Math.sqrt((ex - ax) ** 2 + (ez - az) ** 2);              // dxz(u, e)
        if (d > er || d >= best) continue;
        if (d > 4120 * (she + LTOP[i]) * 1.15) continue;                   // horizon(he, topH(u))
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
  // a scan fired into a storm cell chains through the cloud: up to x1.5 radius at a storm core
  const boost = sim.weather && sim.weather.scanBoost ? sim.weather.scanBoost(x, z) : 1, r = sc.r * boost;
  sim.scans.push({ side: u.side, by: u.id, x, z, r, at: sim.t + SCAN_DELAY });
  sim.emit('scan', { phase: 'start', side: u.side, by: u.id, from: u.pos.slice(), pos: [x, y, z], r, boost, delay: SCAN_DELAY });
  // scanning shows the scanner to the other side for a moment
  const c = roughContact(sim, ENEMY[u.side], u, 400, .5, .55);
  if (c) { c.emitting = true; c.lastEmit = sim.t; }
}
export function resolveScans(sim) {
  const t = sim.t;
  PICTURE.v++;
  for (let i = sim.scans.length - 1; i >= 0; i--) {
    const s = sim.scans[i];
    if (t < s.at) continue;
    sim.scans.splice(i, 1);
    const hits = [];
    // what the scan does not find inside its radius is not there: stale contacts there are dropped
    for (const [id, c] of sim.sides[s.side].contacts) {
      if (c.dom === 'air' || c.dom === 'sub' || c.emitting || dxz(c.pos[0], c.pos[2], s.x, s.z) > s.r) continue;
      const e = sim.units.get(id);
      if (!e || !e.alive || dxz(e.pos[0], e.pos[2], s.x, s.z) > s.r) { sim.sides[s.side].contacts.delete(id); if (!c.dead) sim.emit('lost', { side: s.side, unit: id, track: c.track, pos: c.pos.slice(), by: 'scan' }); }
    }
    for (const e of sim.alive(ENEMY[s.side])) {
      if (e.aboard || submerged(e)) continue;                   // the scan does not reach under the water
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
    if (e.aboard || submerged(e)) continue;
    if (dxz(e.pos[0], e.pos[2], x, z) < r) detect(sim, side, e, 150, .3, 'lightning');
  }
}

/* ---------- SONAR (1 Hz) ----------
   Every working sonar listens all round. Range = the sonar's range for boats (sub) or ships (ship) x how loud the
   target is (subs.noiseOf: boats are quiet, louder fast and snorting) x the listener's own noise (a hull sonar
   hears less at speed) x the sea state. A hit raises the contact like any sensor; a 'sonar' event (at most every
   5 s per contact) tells the game where the side heard something. Torpedoes in the water are heard further. */
export function sonarTick(sim) {
  const t = sim.t, seaK = 1 - .35 * Math.min(1, (sim.weather && sim.weather.sea) || 0);
  for (const side of ['coast', 'fleet']) {
    const own = sim.alive(side), foes = sim.alive(ENEMY[side]);
    let any = false;
    for (let i = 0; i < own.length; i++) {
      const u = own[i], So = u.def.sensors.sonar;
      if (!So || !sonarWorks(u)) continue;
      any = true; u.sonarT = t;
      const v = Math.min(1, u.speed / Math.max(1, u.def.speed)), self = So.hull ? 1 - .45 * v : isSub(u) ? 1 - .3 * v : 1;
      for (let j = 0; j < foes.length; j++) {
        const e = foes[j];
        if (e.aboard || e.def.domain !== 'sea') continue;
        const sub = submerged(e), base = sub ? So.sub : So.ship;
        if (!base) continue;
        const rng = base * self * seaK * noiseOf(e);
        const dx = e.pos[0] - u.pos[0], dz = e.pos[2] - u.pos[2];
        if (Math.abs(dx) > rng || Math.abs(dz) > rng) continue;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > rng) continue;
        const f = d / rng;
        if (sim.rng.sense() > .9 - .6 * f * f) continue;
        const c = detect(sim, side, e, 120 + .04 * d, So.gain * (sub ? 1 : .7), 'sonar');
        if (c && sub && c.conf >= .9) c.identified = true;          // a boat held long on sonar is known by its sound (scans cannot reach it)
        if (c && t - (c.pingT || -1e9) >= 5) { c.pingT = t; sim.emit('sonar', { side, by: u.id, unit: e.id, track: c.track, pos: c.pos.slice(), r: Math.max(300, Math.min(2500, c.err * 1.5)) }); }
      }
    }
    if (!any) continue;
    // torpedoes are loud: heard (seen on the side's picture) while a listening unit is within reach
    for (const p of sim.projectiles.values()) {
      if (!p.alive || p.side === side || !p.P.torpedo) continue;
      for (let i = 0; i < own.length; i++) {
        const u = own[i], So = u.def.sensors.sonar;
        if (!So || u.sonarT !== t) continue;
        if (dxz(u.pos[0], u.pos[2], p.pos[0], p.pos[2]) < (So.sub || So.ship) * (p.P.noise || 2)) { p.seen[side] = t + .6; break; }
      }
    }
  }
}

/* a torpedo launch is loud: the other side's sonars close by get a rough fix on the shooter */
export function torpedoHeard(sim, u) {
  const foe = ENEMY[u.side];
  for (const v of sim.alive(foe)) {
    const So = v.def.sensors.sonar;
    if (!So || !sonarWorks(v)) continue;
    if (dxz(u.pos[0], u.pos[2], v.pos[0], v.pos[2]) < (So.sub || 10000) * 1.8) { roughContact(sim, foe, u, 1500, .2, .5); return; }
  }
}
