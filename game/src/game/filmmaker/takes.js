/* Film maker: takes. What a take is, how it is kept (localStorage 'oniks.films'), exported and imported as JSON, and
   the built-in takes, made for whatever map and side is being played.

   take = { v: 1, name, map, side,
            loop,            // the path closes from the last key back to the first (over `gap` s) and repeats
            gap,             // s: the spacing of new keys, and the closing span of a looping take
            start,           // 'now' | 'launch' (armed: the take holds on its first key until the next heavy round leaves the rail)
            sky,             // '' (the map's) | 'night' | 'dusk' | 'day'
            hand,            // a hand on the camera (the director's slight drift)
            ease,            // 'clamped' (held looks hold, no overshoot; see path.js) | 'film' (FILM.path's tangents as they are)
            caption,         // the take's own caption (bottom line, 'Fig. 1  ...'); keys may carry their own
            keys: [{ t, eye: [x, y, z], look: [x, y, z], fov (deg), roll (deg), cap,
                     follow: null | { kind: 'unit' | 'proj' | 'round', id, frame: 'world' | 'body', name,
                                      eye: [right, up, fwd], look: [right, up, fwd] } }],
            rates: [{ t, rate }] }          // time-rate ramps (eased); none: the game's rate is left alone
   A follow key sits at its offsets from the subject (in the subject's heading frame for 'body'); `eye` / `look` keep the
   world pose it had when set (used while the subject does not exist). 'round' is the next heavy round launched after
   the take starts. */

import * as LB from '../labels.js';

export const STORE = 'oniks.films';
const DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const num = (v, d) => Number.isFinite(+v) ? +v : d;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const v3 = (a, d) => Array.isArray(a) && a.length === 3 && a.every(x => Number.isFinite(+x)) ? a.map(Number) : (d ? d.slice() : null);

/* the heavy rounds a 'round' key waits for (the director's heroes: what a chase is worth) */
export const HEAVY = { oniks: 1, tlam: 1, slam: 1, hellfire: 1 };

export function blank(game, name) {
  return { v: 1, name: name || 'Take 1', map: game.map.id, side: game.side, loop: false, gap: 6, start: 'now', sky: '', hand: false,
    ease: 'clamped', caption: '', keys: [], rates: [] };
}

/* a clean, sorted take from anything (a stored or pasted object); null if it is not a take */
export function normalize(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.keys)) return null;
  const keys = [];
  for (const k of o.keys) {
    if (!k) continue;
    const eye = v3(k.eye), look = v3(k.look);
    if (!eye || !look) continue;
    const key = { t: Math.max(0, num(k.t, 0)), eye, look, fov: clamp(num(k.fov, 40), 5, 100), roll: clamp(num(k.roll, 0), -90, 90), cap: String(k.cap || '').slice(0, 64), follow: null };
    const f = k.follow;
    if (f && (f.kind === 'unit' || f.kind === 'proj' || f.kind === 'round')) {
      key.follow = { kind: f.kind, id: f.kind === 'round' ? 0 : num(f.id, 0), frame: f.frame === 'body' ? 'body' : 'world', name: String(f.name || '').slice(0, 32),
        eye: v3(f.eye, [0, 30, -120]), look: v3(f.look, [0, 0, 200]) };
    }
    keys.push(key);
  }
  keys.sort((a, b) => a.t - b.t);
  const rates = (Array.isArray(o.rates) ? o.rates : []).filter(r => r && Number.isFinite(+r.t) && +r.rate > 0)
    .map(r => ({ t: Math.max(0, +r.t), rate: clamp(+r.rate, .05, 64) })).sort((a, b) => a.t - b.t);
  return { v: 1, name: String(o.name || 'Take').slice(0, 40), map: String(o.map || ''), side: String(o.side || ''),
    loop: !!o.loop, gap: clamp(num(o.gap, 6), .5, 60), start: o.start === 'launch' ? 'launch' : 'now',
    sky: ['night', 'dusk', 'day'].includes(o.sky) ? o.sky : '', hand: !!o.hand, ease: o.ease === 'film' ? 'film' : 'clamped',
    caption: String(o.caption || '').slice(0, 64), keys, rates };
}

/* compact JSON (metres to 0.1, offsets to 0.01) */
export function toJSON(take) {
  const t = normalize(take);
  if (!t) return '';
  const out = Object.assign({}, t, {
    keys: t.keys.map(k => {
      const o = { t: r2(k.t), eye: k.eye.map(r1), look: k.look.map(r1), fov: r1(k.fov) };
      if (k.roll) o.roll = r1(k.roll);
      if (k.cap) o.cap = k.cap;
      if (k.follow) { const f = k.follow; o.follow = { kind: f.kind, frame: f.frame, eye: f.eye.map(r2), look: f.look.map(r2) }; if (f.kind !== 'round') o.follow.id = f.id; if (f.name) o.follow.name = f.name; }
      return o;
    }),
    rates: t.rates.map(r => ({ t: r2(r.t), rate: r2(r.rate) })),
  });
  return JSON.stringify(out);
}
export function fromJSON(txt) {
  try { return normalize(JSON.parse(String(txt).trim())); } catch (e) { return null; }
}

/* ---------------------------------------------------------------- storage */
function readStore() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (o && Array.isArray(o.takes)) { if (!o.drafts || typeof o.drafts !== 'object') o.drafts = {}; return o; }
  } catch (e) { /* */ }
  return { v: 1, takes: [], drafts: {} };
}
function writeStore(o) {
  try { localStorage.setItem(STORE, JSON.stringify(o)); return true; } catch (e) { return false; }
}
export function listSaved() { return readStore().takes.map(normalize).filter(Boolean); }
export function save(take) {
  const s = readStore(), t = JSON.parse(toJSON(take));
  const i = s.takes.findIndex(x => x && String(x.name).toLowerCase() === t.name.toLowerCase());
  if (i >= 0) s.takes[i] = t; else s.takes.push(t);
  return writeStore(s);
}
export function remove(name) {
  const s = readStore();
  s.takes = s.takes.filter(x => x && String(x.name).toLowerCase() !== String(name).toLowerCase());
  return writeStore(s);
}
/* the take being worked on, one per map (world keys belong to their map), kept across reloads */
export function loadDraft(mapId) { const d = readStore().drafts[mapId]; return d ? normalize(d) : null; }
export function saveDraft(take, mapId) {
  const s = readStore(), m = mapId || take.map;
  if (take && take.keys.length) s.drafts[m] = JSON.parse(toJSON(take)); else delete s.drafts[m];
  writeStore(s);
}

/* ---------------------------------------------------------------- built-in takes (any map, either side) */
const RANK = { tel: 10, ddg: 10, carrier: 8, radar: 6, pantsir: 5, hq: 4, transloader: 3, catapult: 2 };

/* the unit that stands for the player's force: the launchers first */
function leadOf(game) {
  const own = game.sim.alive(game.side).filter(u => !u.aboard && u.def.domain !== 'air');
  if (!own.length) return null;
  let best = own[0];
  for (const u of own) if ((RANK[u.type] || 1) > (RANK[best.type] || 1)) best = u;
  return best;
}
export function unitName(u) { return (LB.SHORT && LB.SHORT[u.type]) || u.def.name; }
function enemyDir(game, P) {
  const sp = game.map.spawns && game.map.spawns[game.enemy];
  let dx = sp ? sp.x - P[0] : 1, dz = sp ? sp.z - P[2] : 0;
  const L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L];
}
/* metres the ground stands above the straight line a -> b at its worst point (< 0: clear) */
function blocked(game, a, b) {
  let worst = -1e9;
  for (let i = 1; i < 12; i++) {
    const u = i / 12, x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u, y = a[1] + (b[1] - a[1]) * u;
    worst = Math.max(worst, game.ground(x, z) - y);
  }
  return worst;
}
/* world pose from offsets in a heading frame at P */
export function local(P, hdg, o, out) {
  const s = Math.sin(hdg), c = Math.cos(hdg);
  out = out || [0, 0, 0];
  out[0] = P[0] + c * o[0] + s * o[2]; out[1] = P[1] + o[1]; out[2] = P[2] - s * o[0] + c * o[2];
  return out;
}

/* 1. a slow low orbit of the own battery at dusk (loops) */
function orbitTake(game) {
  const u = leadOf(game); if (!u) return null;
  const P = game.unitPose(u).pos, sea = u.def.domain === 'sea';
  const C = [P[0], P[1] + u.def.size[2] * .45, P[2]];
  const R = sea ? Math.max(420, u.def.size[0] * 3.2) : Math.max(125, u.def.size[0] * 10);
  const [ex, ez] = enemyDir(game, P);
  const az0 = Math.atan2(ex, ez) + Math.PI * .8, N = 8, span = 9;
  const keys = [];
  for (let i = 0; i < N; i++) {
    const az = az0 + i / N * Math.PI * 2, rr = R * (1 + .08 * Math.sin(az * 2 + 1));
    const eye = [P[0] + Math.sin(az) * rr, 0, P[2] + Math.cos(az) * rr];
    const g = game.ground(eye[0], eye[2]);
    eye[1] = Math.max(g, 0) + (sea ? 16 : 18) + 5 * Math.sin(az * 3);
    for (let it = 0; it < 6; it++) { const b = blocked(game, eye, C); if (b < -3) break; eye[1] += b + 6; }
    keys.push({ t: i * span, eye, look: C.slice(), fov: sea ? 36 : 34, roll: 0, cap: '', follow: null });
  }
  return normalize({ name: 'Orbit · battery at dusk', map: game.map.id, side: game.side, loop: true, gap: span, start: 'now', sky: 'dusk', hand: true,
    caption: `${u.def.name} · dusk`, keys, rates: [{ t: 0, rate: 1 }] });
}

/* 2. a chase of the next heavy round launched: armed on the launchers, then with the round, x0.25 off the rail */
const CHASE = [
  { t: 0, eye: [55, 4, -20], look: [0, 4, 6], fov: 40, cap: 'Launch' },
  { t: 4.5, eye: [46, 6, -62], look: [0, 6, 50], fov: 40 },
  { t: 11, eye: [15, 6, -62], look: [0, 1, 420], fov: 38, cap: 'Chase' },
  { t: 21, eye: [-17, 8, -58], look: [0, -2, 520], fov: 38 },
  { t: 31, eye: [-64, 26, -150], look: [0, 0, 320], fov: 40 },
];
function chaseTake(game) {
  const u = leadOf(game);
  const P = u ? game.unitPose(u).pos : [0, 0, 0];
  const [ex, ez] = enemyDir(game, P), hdg = Math.atan2(ex, ez);
  const keys = CHASE.map(k => ({ t: k.t, eye: local(P, hdg, k.eye), look: local(P, hdg, k.look), fov: k.fov, roll: 0, cap: k.cap || '',
    follow: { kind: 'round', id: 0, frame: 'body', name: 'Next round', eye: k.eye.slice(), look: k.look.slice() } }));
  for (const k of keys) { const g = game.ground(k.eye[0], k.eye[2]); if (k.eye[1] < g + 3) k.eye[1] = g + 3; }
  return normalize({ name: 'Chase · next round', map: game.map.id, side: game.side, loop: false, gap: 6, start: 'launch', sky: '', hand: true,
    caption: '', keys, rates: [{ t: 0, rate: .25 }, { t: 3, rate: .25 }, { t: 7, rate: 1 }, { t: 13, rate: 1 }, { t: 17, rate: 4 }, { t: 27, rate: 4 }, { t: 31, rate: 1 }] });
}

/* 3. a climb from the sea to 60 km: low over the nearest open sea, looking back at the force, then up over the
   middle of the map until the whole theatre is under the lens (from ~40 km the picture becomes the Orbital map) */
function climbTake(game) {
  const u = leadOf(game);
  const P = u ? game.unitPose(u).pos.slice() : [0, 0, 0];
  const [ex, ez] = enemyDir(game, P), azE = Math.atan2(ex, ez);
  // the nearest open sea, toward the enemy if it is about as near
  let best = null;
  for (let i = 0; i < 24; i++) {
    const da = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 12, az = azE + da, sx = Math.sin(az), sz = Math.cos(az);
    let d0 = -1;
    for (let d = 0; d <= 24000; d += 150) if (game.ground(P[0] + sx * d, P[2] + sz * d) < .5) { d0 = d; break; }
    if (d0 < 0) continue;
    const cost = (d0 + 400) * (1 + .6 * Math.abs(da) / Math.PI);
    if (!best || cost < best.cost) best = { cost, d0, sx, sz };
  }
  if (!best) best = { d0: 3000, sx: ex, sz: ez };
  const S = (d, y) => [P[0] + best.sx * d, y, P[2] + best.sz * d];
  const C = [0, 0, 0];                                           // the middle of the map
  let cx = P[0] - C[0], cz = P[2] - C[2]; const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
  const look0 = [P[0], P[1] + 12, P[2]];
  const e0 = S(best.d0 + 600, 4), e1 = S(best.d0 + 1800, 600), e2 = S(best.d0 + 5000, 5200);
  const e4 = [C[0] + cx * 14000, 60000, C[2] + cz * 14000];
  const e3 = [e2[0] + (e4[0] - e2[0]) * .55, 22000, e2[2] + (e4[2] - e2[2]) * .55];
  // the first key stays on the swell (the coast may stand between it and the force: the climb brings them in view);
  // the second clears the line of sight
  for (const e of [e0, e1]) { const g = game.ground(e[0], e[2]); if (e[1] < g + 4) e[1] = g + 4; }
  for (let it = 0; it < 6; it++) { const b = blocked(game, e1, look0); if (b < -3) break; e1[1] += b + 5; }
  const keys = [
    { t: 0, eye: e0, look: look0, fov: 40, cap: 'Sea level' },
    { t: 7, eye: e1, look: [P[0], P[1], P[2]], fov: 40 },
    { t: 15, eye: e2, look: [P[0] + (C[0] - P[0]) * .35, 0, P[2] + (C[2] - P[2]) * .35], fov: 40, cap: 'Climb' },
    { t: 25, eye: e3, look: C.slice(), fov: 40 },
    { t: 36, eye: e4, look: C.slice(), fov: 40, cap: '60 km' },
    { t: 42, eye: e4.slice(), look: C.slice(), fov: 40 },
  ].map(k => Object.assign({ roll: 0, cap: '', follow: null }, k));
  return normalize({ name: 'Climb · sea to 60 km', map: game.map.id, side: game.side, loop: false, gap: 6, start: 'now', sky: '', hand: false,
    caption: '', keys, rates: [{ t: 0, rate: 1 }, { t: 10, rate: 1 }, { t: 22, rate: 8 }] });
}

export const BUILTIN = [
  { id: 'orbit', name: 'Orbit · battery at dusk', make: orbitTake },
  { id: 'chase', name: 'Chase · next round', make: chaseTake },
  { id: 'climb', name: 'Climb · sea to 60 km', make: climbTake },
];

export { DEG };
