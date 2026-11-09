/* Intercept lab (dev): one defender against a stream of rounds, many seeds; what each interceptor / gun achieves.
   In the page console of any game page:
     const L = await import('/game/src/dev/intercept_lab.js'); L.all(12)          // every case, 12 seeds each
     L.run('pantsir', 20)                                                            // one case
   A case: a defender with only the named weapon armed, one threat round flown straight at it from `from` m out at
   `h` m (level, in cruise). Per shot: 'kill' (broke it up), 'spin' (knocked out of control), 'miss', 'open'.
   Per threat: stopped (anything) or landed. Pure sim, deterministic per seed. */
import { Sim } from '../sim/sim.js';
import { stubMap } from '../sim/stubmap.js';
import { launch } from '../sim/weapons.js';

const calm = { kind: 'calm', wind: [0, 0], sea: .2 };
let MAP = null;
const shore = m => { for (let x = -m.W / 2; x < m.W / 2; x += 100) if (m.h(x, 0) > 0) return x; return 0; };

/* cases: defender type, weapon kept, threat kind, start range, height, lateral offset of the path (crossing) */
export const CASES = {
  sm6: { def: 'ddg', keep: ['sm6'], threat: 'oniks', from: 45000, h: 15, off: 0 },
  'sm6-x': { def: 'ddg', keep: ['sm6'], threat: 'oniks', from: 40000, h: 15, off: 6000 },
  'sm6-sub': { def: 'ddg', keep: ['sm6'], threat: 'kalibr', from: 40000, h: 20, off: 0 },
  essm: { def: 'cg', keep: ['pdms'], threat: 'uran', from: 30000, h: 10, off: 0 },
  'essm-x': { def: 'cg', keep: ['pdms'], threat: 'oniks', from: 30000, h: 15, off: 3000 },
  ram: { def: 'lcs', keep: ['searam'], threat: 'uran', from: 12000, h: 10, off: 0 },
  ciws: { def: 'ddg', keep: ['ciws'], threat: 'uran', from: 8000, h: 10, off: 0 },
  'ciws-fast': { def: 'ddg', keep: ['ciws'], threat: 'oniks', from: 12000, h: 15, off: 0 },
  '57e6': { def: 'pantsir', keep: ['sam'], threat: 'tlam', from: 25000, h: 60, off: 0 },
  gun30: { def: 'pantsir', keep: ['gun30'], threat: 'tlam', from: 8000, h: 60, off: 0 },
  pantsir: { def: 'pantsir', keep: ['sam', 'gun30'], threat: 'tlam', from: 25000, h: 60, off: 0 },
  'pantsir-slam': { def: 'pantsir', keep: ['sam', 'gun30'], threat: 'slam', from: 25000, h: 90, off: 1500 },
};

/* closest centre-to-centre distance over the last tick (both moving linearly) */
function segMin(q, P) {
  const ax = q.prev[0] - P.prev[0], ay = q.prev[1] - P.prev[1], az = q.prev[2] - P.prev[2];
  const bx = q.pos[0] - P.pos[0] - ax, by = q.pos[1] - P.pos[1] - ay, bz = q.pos[2] - P.pos[2] - az;
  const bb = bx * bx + by * by + bz * bz, s = bb > 1e-9 ? Math.max(0, Math.min(1, -(ax * bx + ay * by + az * bz) / bb)) : 0;
  return Math.hypot(ax + bx * s, ay + by * s, az + bz * s);
}
export let LOG = null;
export function log(on) { LOG = on ? [] : null; return LOG; }
export function one(name, seed) {
  const C = CASES[name], m = MAP || (MAP = stubMap()), sx = shore(m);
  const sim = new Sim(m, { seed, fog: false, weather: calm });
  const land = C.def === 'pantsir';
  const dx = land ? sx + 4000 : sx - 30000;
  const D = sim.spawn(C.def, land ? 'coast' : 'fleet', dx, 0, { hdg: 0 });
  D.hp = D.hpMax = 1e6;
  for (const k in D.ammo) if (!C.keep.includes(k)) D.ammo[k] = 0;
  if (D.def.sensors.radar) sim.setRadar(D, true, true);
  const foe = land ? 'fleet' : 'coast';
  // the shooter: parked far away out of every reach (its type only lends the side)
  const S = sim.spawn(land ? 'ddg' : 'tel', foe, land ? sx - 60000 : sx + 20000, 60000, { hdg: 0 });
  for (const k in S.ammo) S.ammo[k] = 0;
  sim.run(10);
  // the threat: launched, then placed on its path in cruise (bearing from the west for ships; from the sea for land)
  const r = sim.rng.fire, jit = (r() - .5) * 2;
  const ang = (land ? -Math.PI / 2 : -Math.PI / 2 + .6) + jit * .15;          // where it comes from (bearing from D)
  const ox = D.pos[0] + Math.sin(ang) * C.from, oz = D.pos[2] + Math.cos(ang) * C.from;
  const hdg = Math.atan2(D.pos[0] - ox, D.pos[2] - oz);
  const cx = Math.cos(hdg) * C.off, cz = -Math.sin(hdg) * C.off;             // a crossing path: shifted sideways
  S.ammo._lab = 1;
  const P = launch(sim, S, { proj: C.threat, name: '_lab', range: C.from * 2, cd: 0 }, D.id, 'unit', D.pos);
  const x = ox + cx, z = oz + cz;
  P.pos[0] = P.prev[0] = x; P.pos[1] = P.prev[1] = C.h; P.pos[2] = P.prev[2] = z;
  P.hdg = hdg; P.pitch = 0; P.age = 30; P.spd = P.P.speed; P.phase = 'cruise'; P.sep = true; P.st.booster = false;
  P.fromPos = [x - Math.sin(hdg) * 20000, 0, z - Math.cos(hdg) * 20000];
  P.aim[0] = D.pos[0] + cx; P.aim[1] = C.h; P.aim[2] = D.pos[2] + cz;
  if (C.off) P.locked = false;
  P.vel[0] = Math.sin(hdg) * P.spd; P.vel[1] = 0; P.vel[2] = Math.cos(hdg) * P.spd;
  P.spd0 = P.spd; P.t0 = sim.t - 30;
  P.P = Object.assign({}, P.P, { ign: 0, boost: 0, sus: null, vert: 0, drop: 0, v0: P.P.speed });   // a cruise-speed round (no motor phases)
  sim.drainEvents();
  const shots = new Map(), res = { moot: 0, shots: 0, kill: 0, spin: 0, miss: 0, open: 0, gunKill: 0, gunSpin: 0, bursts: 0, stopped: 0, landed: 0, miss_d: [], cpa: [] };
  const cpa = new Map();
  let end = null;
  for (let i = 0; i < 20 * 400 && !end; i++) {
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.type === 'launch' && e.from === D.id) { shots.set(e.proj, 'open'); res.shots++; }
      else if (e.type === 'gunfire' && e.unit === D.id) res.bursts++;
      else if ((e.type === 'intercept' || e.type === 'spinout') && e.proj === P.id) {
        const k = e.type === 'intercept' ? 'kill' : 'spin';
        if (shots.has(e.by)) { shots.set(e.by, k); if (e.miss !== undefined) res.miss_d.push(e.miss); }
        else if (e.cause === 'gun') res[k === 'kill' ? 'gunKill' : 'gunSpin']++;
        if (!end) end = 'stopped';
      } else if (e.type === 'splash' && shots.has(e.proj) && shots.get(e.proj) === 'open') { shots.set(e.proj, e.why === 'selfdestruct' ? 'open' : 'miss'); const q = sim.projectiles.get(e.proj); if (LOG) LOG.push({ why: e.why, t: +sim.t.toFixed(2), age: q ? +q.age.toFixed(2) : null, miss: e.miss, d: Math.round(Math.hypot(e.pos[0] - P.pos[0], e.pos[1] - P.pos[1], e.pos[2] - P.pos[2])), tgt: e.target === P.id }); }
      else if (e.type === 'hit' && e.proj === P.id) end = 'landed';
      else if (e.type === 'splash' && e.proj === P.id) end = end || 'stopped';
    }
    if (!P.alive && !end) end = 'stopped';
    if (P.alive) for (const [id, v] of shots) { const q = sim.projectiles.get(id); if (!q || !q.alive) continue; const d = segMin(q, P); if (!(cpa.get(id) <= d)) cpa.set(id, d); }
  }
  for (const [id, v] of shots) if (v !== 'kill' && v !== 'spin' && cpa.has(id)) res.cpa.push(cpa.get(id));
  // interceptors still up when the threat ended: they went on to self-destruct (counted as misses unless it was theirs)
  for (const v of shots.values()) res[v === 'open' ? 'moot' : v]++;
  res[end === 'landed' ? 'landed' : end ? 'stopped' : 'landed']++;
  return res;
}

export function run(name, n = 12, seed0 = 1) {
  const T = { moot: 0, shots: 0, kill: 0, spin: 0, miss: 0, open: 0, gunKill: 0, gunSpin: 0, bursts: 0, stopped: 0, landed: 0, miss_d: [], cpa: [] };
  for (let s = seed0; s < seed0 + n; s++) {
    const r = one(name, s);
    for (const k in r) if (k === 'miss_d' || k === 'cpa') T[k].push(...r[k]); else T[k] += r[k];
  }
  const pk = T.shots - T.moot ? (T.kill + T.spin) / (T.shots - T.moot) : NaN;
  const md = T.miss_d.slice().sort((a, b) => a - b);
  return { name, n, shots: T.shots, moot: T.moot, pk: +pk.toFixed(2), kill: T.kill, spin: T.spin, miss: T.miss, bursts: T.bursts, gunKill: T.gunKill, gunSpin: T.gunSpin,
    stopped: T.stopped + '/' + n, medMiss: md.length ? +md[md.length >> 1].toFixed(1) : null, missCpa: T.cpa.sort((a, b) => a - b).map(v => Math.round(v)).join(' ') };
}

export function all(n = 12) { return Object.keys(CASES).map(k => run(k, n)); }
