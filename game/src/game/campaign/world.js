/* World helpers for the mission scripts: points on the map, placing units, the enemy's picture, the enemy AI on and
   off, air raids, radars, weather changes (a squall rolling in, a storm starting) and a lightning strike. All of it
   goes through the sim's own state and functions, so the sim stays deterministic for a given run of the script. */
import { detect, flashReveal, los } from '../../sim/sensors.js';
import { setAi } from '../setup.js';
import { UNITS, TEL_ELEV, CLASSIFY } from '../../data/units.js';

const SEA_STATE = { calm: .2, haze: .3, rain: .55, storm: .85 };
/* points: a unit, { x, z }, [x, z] or [x, y, z] */
export const xz = p => p.pos ? [p.pos[0], p.pos[2]] : p.x !== undefined ? [p.x, p.z] : p.length === 2 ? p : [p[0], p[2]];
export const dist = (a, b) => { const A = xz(a), B = xz(b); return Math.hypot(A[0] - B[0], A[1] - B[1]); };
/* bearing from a to b, radians clockwise from north */
export const bearing = (a, b) => { const A = xz(a), B = xz(b); return Math.atan2(B[0] - A[0], B[1] - A[1]); };
export const toward = (a, b, d) => { const A = xz(a), B = xz(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; return [A[0] + (B[0] - A[0]) / L * d, A[1] + (B[1] - A[1]) / L * d]; };
export const offset = (a, brg, d) => { const A = xz(a); return [A[0] + Math.sin(brg) * d, A[1] + Math.cos(brg) * d]; };
export const deg = r => ((Math.round(r * 180 / Math.PI) % 360) + 360) % 360;

/* the nearest open cell of a domain ('sea' | 'land') to (x, z) */
export function snap(sim, dom, x, z, maxR) {
  const k = sim.nav.nearestOpen(dom, sim.nav.cellOf(x, z), -1, maxR || 120);
  return k < 0 ? [x, z] : [sim.nav.cx(k), sim.nav.cz(k)];
}
/* the nearest water to p within maxR (rings of 250 m, 24 bearings), at least `minDepth` m deep; [x, z] or null */
export function nearestWater(map, p, maxR, minDepth) {
  const P = xz(p);
  for (let d = 250; d <= maxR; d += 250) for (let k = 0; k < 24; k++) {
    const b = k / 24 * Math.PI * 2, x = P[0] + Math.sin(b) * d, z = P[1] + Math.cos(b) * d;
    if (map.h(x, z) < -(minDepth || 5)) return [x, z];
  }
  return null;
}
/* the highest flat land within r of (x, z) (a radar site), sampled on a grid */
export function highGround(sim, x, z, r, step, maxSlope) {
  const map = sim.map;
  let best = null, bh = -1e9;
  step = step || 200;
  for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
    if (dx * dx + dz * dz > r * r) continue;
    const px = x + dx, pz = z + dz, h = map.h(px, pz);
    if (h < 3 || map.slope(px, pz) > (maxSlope || .2) || !sim.nav.open('land', px, pz)) continue;
    if (h > bh) { bh = h; best = [px, pz]; }
  }
  return best || snap(sim, 'land', x, z);
}
/* a sea route from a to b ([[x, z], ...], null when there is none) */
export function seaPath(sim, a, b) {
  const A = xz(a), B = xz(b);
  const s = snap(sim, 'sea', A[0], A[1]), e = snap(sim, 'sea', B[0], B[1]);
  return sim.nav.path('sea', s[0], s[1], e[0], e[1]);
}
/* the first place along a path that is `d` m (straight line) from p (interpolated along its legs) */
export function pathFrom(path, p, d) {
  if (!path || !path.length) return null;
  if (dist(path[0], p) >= d) return path[0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (dist(b, p) < d) continue;
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, q = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (dist(q, p) < d) lo = m; else hi = m; }
    return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
  }
  return path[path.length - 1];
}
/* a point out at sea from `from` toward `to`, `d` m out, `lat` m to the side, clamped to the map and snapped to water */
export function seaward(sim, from, to, d, lat) {
  const b = bearing(from, to), F = xz(from), W = sim.map.W / 2 - 3000, H = sim.map.H / 2 - 3000;
  const x = Math.max(-W, Math.min(W, F[0] + Math.sin(b) * d + Math.cos(b) * (lat || 0)));
  const z = Math.max(-H, Math.min(H, F[1] + Math.cos(b) * d - Math.sin(b) * (lat || 0)));
  return snap(sim, 'sea', x, z);
}
/* a radar site within r of `near` that sees the most of `targets` ([[x, z], ...], at `h` m) over the terrain;
   ties go to the closer one */
export function siteWithView(sim, near, targets, r, h, step) {
  const map = sim.map, N = xz(near);
  let best = null, bs = -1e18;
  step = step || 500;
  for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
    const x = N[0] + dx, z = N[1] + dz, g = map.h(x, z);
    if (g < 5 || map.slope(x, z) > .2 || !sim.nav.open('land', x, z)) continue;
    let n = 0;
    for (const t of targets) if (los(map, x, g + 14, z, t[0], h || 45, t[1])) n++;
    const s = n * 10000 - Math.hypot(dx, dz) + g;
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return best || snap(sim, 'land', N[0], N[1]);
}
/* a flat land spot near (x, z), clear of the given points by `clear` m */
export function landSpot(sim, x, z, r, avoid, clear) {
  const map = sim.map, rnd = sim.rng.place;
  for (let k = 0; k < 80; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * (1 + k / 40);
    const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    if (map.h(px, pz) < 2 || map.slope(px, pz) > .22 || !sim.nav.open('land', px, pz)) continue;
    if (avoid && avoid.some(p => Math.hypot(p[0] - px, p[1] - pz) < (clear || 60))) continue;
    return [px, pz];
  }
  return snap(sim, 'land', x, z);
}

/* a supply point for a mission (transloaders refill there, Pantsirs reload): one more map objective of kind 'depot' */
export function addDepot(sim, x, z, name, side) {
  const o = { id: 'OBJ ' + String(sim.objectives.length + 1).padStart(2, '0'), name: name || 'Depot · forward', x, z, r: 700, kind: 'depot', owner: side || 'coast' };
  sim.objectives.push(o);
  return o;
}
/* move a unit to (x, z) now (start of a mission): position, last position, height, heading */
export function put(sim, u, x, z, hdg) {
  const d = u.def;
  let y = u.pos[1];
  if (d.domain === 'land') y = Math.max(0, sim.map.h(x, z));
  else if (d.domain === 'sea') y = 0;
  else if (d.domain === 'air') y = Math.max(0, sim.map.h(x, z)) + (d.altDef || 300);
  u.pos[0] = u.prev[0] = x; u.pos[1] = u.prev[1] = y; u.pos[2] = u.prev[2] = z;
  if (hdg !== undefined) { u.hdg = u.prevHdg = hdg; }
  u.path = null; u.goal = null;
  sim._dirty = true;
  return u;
}
/* a TEL / radar in its travel state or emplaced */
export function stow(u) {
  if (u.type === 'tel') { u.dep = u.depT = 0; u.elev = u.elevT = u.wantElev = 0; u.deployed = false; }
  if (u.def.mast) { u.mast = u.mastT = 0; u.deployed = false; }
}
export function emplace(sim, u) {
  if (u.type === 'tel') { u.dep = u.depT = 1; u.elev = u.elevT = u.wantElev = TEL_ELEV; u.deployed = true; }
  if (u.def.mast) { u.mast = u.mastT = 1; u.deployed = true; }
  u.def.modelState(u, sim.t);
}
export function radarOn(sim, u, on) { if (u && u.def.sensors.radar && u.radarOn !== !!on) sim.setRadar(u, !!on); }

/* `side` knows `u`: a classified track (recon, a report); returns the contact */
export function knows(sim, side, u, err) {
  if (!u || !u.alive) return null;
  const c = detect(sim, side, u, err || 60, 1, 'report');
  if (c && c.conf < CLASSIFY) c.conf = .9;
  return c;
}
/* the enemy commander on / off (the stock AI; campaign scripts drive the enemy themselves while it is off) */
export function enemyAi(sim, side, on, level) { return setAi(sim, side, on, level); }
/* the fleet answers without being steered: its commander's scan and strike decisions only (the script keeps the
   ships on their course). `ai` is an AI instance for the fleet that is not registered with the sim. */
export function fleetAnswer(sim, ai) {
  ai.inb = new Map();
  for (const p of sim.projectiles.values()) if (p.side === ai.side && p.alive && p.tk === 'unit' && p.P.threat) ai.inb.set(p.target, (ai.inb.get(p.target) || 0) + 1);
  ai._targets = null;
  const by = { carrier: [], ddg: [], helo: [], fighter: [] };
  for (const u of sim.alive(ai.side)) (by[u.type] || (by[u.type] = [])).push(u);
  const sams = [];
  for (const c of sim.sides[ai.side].contacts.values()) if (!c.dead && c.cls === 'SAM') sams.push(c);
  ai.fleetScan();
  ai.fleetStrike(by, sams);
}
/* a measured answer: their scans as the commander would, then one strike of at most `max` rounds on the most
   valuable land target they hold a track on, from the ship best placed to fire. Returns the target or null. */
export function fleetStrikeOnce(sim, ai, max) {
  ai.inb = new Map(); ai._targets = null;
  ai.fleetScan();
  const sams = [];
  for (const c of sim.sides[ai.side].contacts.values()) if (!c.dead && c.cls === 'SAM') sams.push(c);
  const list = ai.strikeTargets(sams);
  for (const { c } of list) {
    const u = sim.units.get(c.unitId);
    if (!u || !u.alive) continue;
    let inbound = 0;
    for (const p of sim.projectiles.values()) if (p.alive && p.side === ai.side && p.target === c.unitId && p.P.threat) inbound++;
    if (inbound) continue;
    const ships = sim.alive(ai.side).filter(s => s.type === 'ddg' && s.ammo.strike > 0 && !s.off.strike && dist(s, c.pos) < s.def.weapons.strike.range * .95)
      .sort((a, b) => b.ammo.strike - a.ammo.strike);
    if (!ships.length) continue;
    const s = ships[0];
    sim.order([s.id], { kind: 'attack', target: c.unitId, n: Math.min(max || 4, s.ammo.strike) });
    return u;
  }
  return null;
}

/* aircraft already airborne at (x, z), heading toward (tx, tz); returns the units */
export function airborne(sim, type, side, x, z, n, toward_, spread) {
  const out = [], d = UNITS[type];
  const hdg = toward_ ? Math.atan2(toward_[0] - x, toward_[1] - z) : 0;
  const px = Math.cos(hdg), pz = -Math.sin(hdg);
  for (let i = 0; i < n; i++) {
    const s = (i - (n - 1) / 2) * (spread || 900);
    const u = sim.spawn(type, side, x + px * s, z + pz * s, { hdg, alt: d.altDef });
    u.speed = d.speed * .9;
    out.push(u);
  }
  return out;
}
/* an air raid: `n` aircraft of `type` from (x, z), each given a target from `targets` (their side learns of the
   targets first); `salvo` rounds each. Returns the aircraft. */
export function raid(sim, o) {
  const side = o.side || 'fleet', ts = (o.targets || []).filter(t => t && t.alive);
  const first = ts[0] ? xz(ts[0]) : null;
  const us = airborne(sim, o.type || 'fighter', side, o.from[0], o.from[1], o.n || 2, first, o.spread);
  us.forEach((u, i) => {
    const t = ts.length ? ts[i % ts.length] : null;
    if (!t) return;
    knows(sim, side, t, o.err);
    sim.order([u.id], { kind: 'attack', target: t.id, n: o.salvo || 2 });
    sim.order([u.id], { kind: 'return', queue: true });
  });
  return us;
}

/* weather: change the kind in place (the squalls kept or replaced), wind, sea state; the scene follows */
export function setWeather(game, kind, o) {
  o = o || {};
  const sim = game.sim, W = sim.weather;
  W.kind = kind;
  if (o.wind) {
    W.wind = o.wind.slice();
    const w = Math.hypot(W.wind[0], W.wind[1]);
    W.vx = w > .1 ? W.wind[0] * 1.5 : 2; W.vz = w > .1 ? W.wind[1] * 1.5 : 1;
  }
  if (o.squalls) W.squalls = o.squalls.map(s => ({ x: s.x, z: s.z, r: s.r, k: s.k !== undefined ? s.k : kind === 'storm' ? .45 : .55 }));
  if (kind === 'calm' || kind === 'haze') { if (o.clear !== false && !o.squalls) W.squalls = []; }
  if (kind === 'storm') { if (!(W.nextFlash < sim.t + 30)) W.nextFlash = sim.t + (o.flashIn !== undefined ? o.flashIn : 4); }
  else W.nextFlash = 1e18;
  const sea = o.sea !== undefined ? o.sea : SEA_STATE[kind];
  W.sea = sea;
  game.weather = { kind, wind: W.wind.slice(), sea };
  if (game.R && game.R.terrain) game.R.terrain.setWeather({ wind: W.wind, sea });
  game.bus.emit('weather', game.weather);
}
/* one more rain cell (kind stays unless it was calm / haze: then it rains) */
export function addSquall(game, s) {
  const W = game.sim.weather;
  if (W.kind !== 'rain' && W.kind !== 'storm') setWeather(game, 'rain', { squalls: W.squalls.concat([s]) });
  else W.squalls.push({ x: s.x, z: s.z, r: s.r, k: s.k !== undefined ? s.k : .55 });
  return W.squalls[W.squalls.length - 1];
}
/* a lightning strike at (x, z) now: the bolt, the flash, everything near it seen by both sides */
export function lightning(sim, x, z) {
  const g = Math.max(0, sim.map.h(x, z));
  sim.emit('lightning', { pos: [x, g, z], top: [x, 3500, z], r: 3000 });
  flashReveal(sim, x, z, 3000);
}

/* order helpers */
export const move = (sim, us, x, z, o) => sim.order((Array.isArray(us) ? us : [us]).map(u => u.id), Object.assign({ kind: 'move', x, z }, o || {}));
export function sail(sim, u, pts, spd) {
  sim.order([u.id], { kind: 'move', x: pts[0][0], z: pts[0][1] });
  for (let i = 1; i < pts.length; i++) sim.order([u.id], { kind: 'move', x: pts[i][0], z: pts[i][1], queue: true });
  if (spd) u.spdCap = spd;
}
