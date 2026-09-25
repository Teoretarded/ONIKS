/* Cinematic camera (C): an auto-director that frames the action the way the films do.

   Shots (one continuous take: every change of subject is an eased glide from wherever the camera is, pulling back
   on long moves; never a cut):
     launch    the salvo from the side: the launchers and the rising rounds held in the frame together, low, a little
               behind the line of fire (Scale · Strike, Aegis)
     chase     just behind and above the plume, the lens on the round's target, so the round rides low in the frame
               with the target ahead of it (Engagement's chase)
     approach  the last seconds: across the target, low over the sea, the target off centre and the round's side of
               the frame left open for it to come in (Aegis' close-in)
     after     the hit: held on the target, then slowly up and off its quarter (Engagement after the hit)
     site      a hit, an intercept or a loss seen after the fact: a slow low orbit of the place
     death     a dying unit at a low angle, the sinking hull; at the end of the match the last kill, held
     idle      nothing happening: slow low orbits of the most important own unit, then of the enemy group, from over
               the sea when there is sea to stand on
   Framing: every shot names the points that must stay in frame (the round, its target, the launchers). The shot is
   fitted to them, and a box check against the drawn view pulls the camera back while one of them is outside it, so
   the frame is never empty sky. Land shots rise until the line of sight clears the ground.
   Hand-over: any camera input (WASD / arrows / Q E / PageUp / PageDown, wheel, right or middle drag) hands the camera
   back; C again resumes. While the hit replay (replay.js) has the camera the director waits, then glides on from
   where the replay left it. createDirector returns [director, replay] (the replay loads with it; see replay.js).

   The rig (exported, shared with the replay): a shot is an eye and a look point, turned into the RTS camera's own
   orbit pose { T, dist, yaw, pitch } by lookFrom() (a near-level or upward look uses the camera's look-up tilt:
   the orbit target goes on the floor ray ahead of the eye). fitDist() is the distance at which points fill a
   screen box; blendPose() the glide (log distance, a pull-back bump on long moves); putCam() writes the camera. */
import { PRI } from './game.js';

export const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
export const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);
/* how much a round is worth watching */
const HERO = { oniks: 10, tlam: 8, slam: 7, sm6: 5, hellfire: 4, pdms: 3, sam: 3, aam: 3, shell: 0 };
/* how much a unit is worth watching */
const RANK = { carrier: 10, hq: 9, ddg: 8, tel: 6, radar: 5, pantsir: 4, transloader: 3, helo: 2, fighter: 2, catapult: 1, drone: 1 };
const APPROACH_REAL = 4.6;         // s of real time before the impact the approach shot takes over
const BOX = [.06, .08, .94, .92];  // the frame the named points must stay in (fractions of the view)
const INNER = [.17, .19, .83, .81];

/* ================================================================ the rig */
export const newPose = () => ({ T: [0, 0, 0], dist: 300, yaw: 0, pitch: .1 });

/* eye + look point -> orbit pose. A look below the orbit floor (near level, or up) keeps the eye and tilts the lens up
   (camera.js): the orbit target goes on the floor ray ahead of the eye, close enough for the full tilt. */
export function lookFrom(cam, eye, look, o) {
  const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
  const h = Math.max(1e-6, Math.hypot(dx, dz)), L = Math.max(1, Math.hypot(h, dy));
  const yaw = Math.atan2(dx, dz), mp = cam.minPitch;
  let el = Math.atan2(-dy, h);
  const floor = mp - (cam.lookUp || 0) + .6 * DEG;
  if (el < floor) el = floor;
  o.yaw = yaw; o.pitch = el;
  if (el >= mp) {
    const c = Math.cos(el);
    o.T[0] = eye[0] + Math.sin(yaw) * c * L; o.T[1] = eye[1] - Math.sin(el) * L; o.T[2] = eye[2] + Math.cos(yaw) * c * L;
    o.dist = L;
  } else {
    const g = Math.max(0, cam.ground(eye[0], eye[2])), clear = Math.max(2, eye[1] - g);
    const D = clamp(Math.min(L, clear * 80), Math.max(cam.minDist, 20), (cam.lookUpNear || 2500) * .96);
    const c = Math.cos(mp);
    o.T[0] = eye[0] + Math.sin(yaw) * c * D; o.T[1] = eye[1] - Math.sin(mp) * D; o.T[2] = eye[2] + Math.cos(yaw) * c * D;
    o.dist = D;
  }
  return o;
}
/* the eye of an orbit pose (a look-up tilt keeps the eye on the floor orbit) */
export function eyeOf(cam, o, out) {
  const po = Math.max(o.pitch, cam.minPitch), c = Math.cos(po);
  out[0] = o.T[0] - Math.sin(o.yaw) * c * o.dist; out[1] = o.T[1] + Math.sin(po) * o.dist; out[2] = o.T[2] - Math.cos(o.yaw) * c * o.dist;
  return out;
}
/* the distance from look point T (yaw, pitch) at which pts[0..n) fit a box of half extents bx, by (fractions of the
   half view): 1 fills the frame edge to edge */
export function fitDist(cam, T, pts, n, yaw, pitch, bx, by) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const f0 = sy * cp, f1 = -sp, f2 = cy * cp, r0 = cy, r2 = -sy;
  const u0 = f1 * r2, u1 = f2 * r0 - f0 * r2, u2 = -f1 * r0;
  const ty = Math.tan(cam.fov / 2), tx = ty * cam.W / Math.max(1, cam.H);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], qx = p[0] - T[0], qy = p[1] - T[1], qz = p[2] - T[2];
    const x = qx * r0 + qz * r2, y = qx * u0 + qy * u1 + qz * u2, z = qx * f0 + qy * f1 + qz * f2;
    d = Math.max(d, Math.abs(x) / (tx * bx) - z, Math.abs(y) / (ty * by) - z);
  }
  return d;
}
export function camState(cam, o) {
  o = o || newPose();
  o.T[0] = cam.target[0]; o.T[1] = cam.target[1]; o.T[2] = cam.target[2];
  o.dist = cam.dist; o.yaw = cam.yaw; o.pitch = cam.pitch;
  return o;
}
/* the pull-back on a long move (as camera.flyTo) */
export function bumpOf(from, to) {
  const tr = Math.hypot(to.T[0] - from.T[0], to.T[2] - from.T[2]);
  return Math.max(0, Math.log(1 + tr / (from.dist + to.dist)) * .9);
}
/* a glide duration for the move (s) */
export function glideDur(from, to, lo, hi) {
  const tr = Math.hypot(to.T[0] - from.T[0], to.T[1] - from.T[1], to.T[2] - from.T[2]);
  return clamp(1.05 + .42 * Math.log(1 + tr / 700) + .16 * Math.abs(Math.log(to.dist / Math.max(1, from.dist))), lo || 1.2, hi || 3.4);
}
export function blendPose(from, to, s, bump, out) {
  for (let k = 0; k < 3; k++) out.T[k] = from.T[k] + (to.T[k] - from.T[k]) * s;
  out.dist = Math.exp(Math.log(Math.max(1, from.dist)) + (Math.log(Math.max(1, to.dist)) - Math.log(Math.max(1, from.dist))) * s + bump * Math.sin(Math.PI * s));
  out.yaw = from.yaw + wrapPi(to.yaw - from.yaw) * s;
  out.pitch = from.pitch + (to.pitch - from.pitch) * s;
  return out;
}
const ZERO = [0, 0, 0];
/* write a pose into the camera (current and goal: no damping of our own moves); follow() keeps the target height */
export function putCam(cam, o, follow) {
  cam.fly = null;
  for (let k = 0; k < 3; k++) cam.target[k] = cam.goal.target[k] = o.T[k];
  const d = clamp(o.dist, cam.minDist, cam.maxDist);
  cam.dist = cam.goal.dist = d;
  cam.yaw = cam.goal.yaw = o.yaw;
  cam.pitch = cam.goal.pitch = clamp(o.pitch, cam.pitchMin ? cam.pitchMin(d) : cam.minPitch, cam.maxPitch);
  cam.followFn = follow; cam.followOff = ZERO;
}
/* metres the ground stands above the straight line a -> b at its worst point (< 0: clear) */
export function blockedBy(ground, a, b) {
  let worst = -1e9;
  for (let i = 1; i < 9; i++) {
    const u = i / 9, x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u, y = a[1] + (b[1] - a[1]) * u;
    const g = ground(x, z) - y; if (g > worst) worst = g;
  }
  return worst;
}
/* the eight corners of a unit's hull box at its drawn pose (ships: to the mast top at .6) -> pts[o..o+8) */
export function hullCorners(pose, def, pts, o) {
  const L = def.size[0] / 2, W = def.size[1] / 2, H = def.size[2] * (def.domain === 'sea' ? .55 : .9);
  const s = Math.sin(pose.hdg), c = Math.cos(pose.hdg), P = pose.pos;
  for (let j = 0; j < 8; j++) {
    const a = j & 1 ? L : -L, b = j & 2 ? W : -W, h = j & 4 ? H : 0, q = pts[o + j];
    q[0] = P[0] + s * a + c * b; q[1] = P[1] + h; q[2] = P[2] + c * a - s * b;
  }
  return o + 8;
}
/* the across view of a target (shared with the replay): the camera off the line of approach `appr` by ~69 deg on
   `side`, low; the target on the far side of centre so the round has its side of the frame to come in through
   (shift > 0 instead puts the subject that fraction of the half width right of centre: the end screen's side).
   pts[0..n) the hull corners. Writes eye, look; returns the distance. */
export function acrossView(cam, T, pts, n, appr, side, pitch, o, eye, look) {
  const yaw = appr + side * 1.2, r0 = Math.cos(yaw), r2 = -Math.sin(yaw);
  const tx = Math.tan(cam.fov / 2) * cam.W / Math.max(1, cam.H);
  let d = Math.max(o.min || 0, fitDist(cam, T, pts, n, yaw, pitch, o.bx || .44, o.by || .4));
  const k = o.shift ? -o.shift : side * (o.lead === undefined ? .22 : o.lead);
  for (let it = 0; it < 2; it++) {
    look[0] = T[0] + r0 * k * d * tx; look[1] = T[1]; look[2] = T[2] + r2 * k * d * tx;
    d = Math.max(d, fitDist(cam, look, pts, n, yaw, pitch, .9, .8));
  }
  d *= o.k || 1;
  const cp = Math.cos(pitch);
  eye[0] = look[0] - Math.sin(yaw) * cp * d; eye[1] = look[1] + Math.sin(pitch) * d; eye[2] = look[2] - Math.cos(yaw) * cp * d;
  return d;
}

/* ================================================================ the director */
export async function createDirector(game, ctx) {
  const dir = makeDirector(game);
  let rep = null;
  try { const m = await import('./replay.js'); rep = await m.createReplay(game, ctx); } catch (e) { console.error('director: hit replay unavailable', e); }
  return rep ? [dir, rep] : dir;
}

function makeDirector(game) {
  const { sim, R } = game, cam = R.camera;
  let on = false, shot = null, lastPick = -99, edgeWas = true, waiting = false, fitK = 1, dirInit = false;
  const recent = [];           // interesting events: { kind, pos, t, w, unit, seen }
  let lastKill = null, final = null;
  const eye = [0, 0, 0], look = [0, 0, 0], q3 = [0, 0, 0], c3 = [0, 0, 0], w3 = [0, 0, 0];
  const dirS = [0, 0, 1];
  const want = newPose(), cur = newPose();
  const KP = Array.from({ length: 32 }, () => [0, 0, 0]);
  const HC = Array.from({ length: 8 }, () => [0, 0, 0]);
  let nKeys = 0;
  const follow = () => cur.T;
  const addKey = p => { if (nKeys < KP.length) { const k = KP[nKeys++]; k[0] = p[0]; k[1] = p[1]; k[2] = p[2]; } };

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v; game.cinematic = on;
    shot = null; lastPick = -99;
    // the screen edges do not pan while the director flies (a resting mouse would fight it)
    if (on) { edgeWas = game.replay && game.replay.state && game.replay.state.edge0 !== undefined ? game.replay.state.edge0 : cam.edge; cam.edge = false; }
    else { cam.edge = edgeWas; if (!(game.replay && game.replay.active)) { cam.follow(null); cam.fly = null; } }
    game.bus.emit('cinematic', { on });
  }

  /* ---------- what the player may watch ---------- */
  const seen = u => { const v = u && game.vis(u); return v === 'own' || v === 'track'; };
  const heroOf = p => HERO[p.kind] || 1;
  const launchAge = p => { const P = p.P || game.PROJ[p.kind] || {}; return clamp((P.sepAt || P.boost || 4) + 2, 4, 10); };
  const upFrom = p => { const f = p.fromPos || p.pos; return Math.hypot(p.pos[0] - f[0], p.pos[1] - f[1], p.pos[2] - f[2]); };
  function tgtUnit(p) {
    if (p.tk !== 'unit') return null;
    const u = sim.units.get(p.target);
    return u && u.alive && !u.aboard && seen(u) ? u : null;
  }
  function tgtPoint(p, out) {
    if (p.tk === 'unit') { const u = tgtUnit(p); if (!u) return null; return centreOf(u, out); }
    const q = sim.projectiles.get(p.target);
    if (!q || !q.alive || !sim.projVisible(game.side, q)) return null;
    const pp = game.projPose(q).pos; out[0] = pp[0]; out[1] = pp[1]; out[2] = pp[2];
    return out;
  }
  function centreOf(u, out) {
    const p = game.unitPose(u).pos, H = u.def.size[2];
    out[0] = p[0]; out[1] = p[1] + Math.min(H * .28, 12); out[2] = p[2];
    return out;
  }
  /* real seconds until the round reaches its unit target */
  function ttiReal(p, u) {
    const H = Math.min(u.def.size[2] * .4, 14);
    const d = Math.max(0, Math.hypot(u.pos[0] - p.pos[0], u.pos[1] + H - p.pos[1], u.pos[2] - p.pos[2]) - Math.max(6, u.def.size[1] * .5));
    return d / Math.max(80, p.spd || 200) / Math.max(.05, game.timeRate);
  }
  function phaseOf(p) {
    if ((p.age || 0) < launchAge(p) && heroOf(p) >= 5) return 'launch';
    const u = tgtUnit(p);
    if (u && ttiReal(p, u) < APPROACH_REAL) return 'approach';
    return 'chase';
  }
  function score(p, ph) {
    let s = heroOf(p);
    if (ph === 'launch') s += (p.age || 0) < 4 ? 6 : 3;
    if (ph === 'approach') s += 12;
    if (p.side === game.side) s += 1;
    const u = p.tk === 'unit' ? sim.units.get(p.target) : null;
    if (u && u.side === game.side) s += 3;           // something is coming at us
    if (u && (u.def.domain === 'sea' || u.def.hq)) s += 1;
    if (shot && shot.id === p.id) s += 5;            // stay with the round we are on
    return s;
  }

  /* ---------- choosing ---------- */
  function pick() {
    lastPick = game.realT;
    const t = game.realT;
    if (final) { if (!shot || shot.kind !== 'death' || !shot.final) startDeath(final, true); return; }
    // the rounds
    let best = null, bs = 0, bph = null;
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !sim.projVisible(game.side, p) || heroOf(p) < 3) continue;
      const ph = phaseOf(p), s = score(p, ph);
      if (s > bs) { bs = s; best = p; bph = ph; }
    }
    const curP = shot && shot.id ? sim.projectiles.get(shot.id) : null;
    const curLive = curP && curP.alive;
    // an approach runs to its end
    if (shot && shot.kind === 'approach' && curLive) return;
    if (best && bph === 'approach' && (!shot || shot.id !== best.id)) { startProj(best, 'approach'); return; }
    if (shot && (shot.kind === 'launch' || shot.kind === 'chase') && curLive) {
      const age = t - shot.t0;
      if (best && best.id !== curP.id && bs > score(curP, shot.kind) + 6 && age > 5) { startProj(best, bph); return; }
      if (age < 28) return;
    }
    // the moments after a hit and the losses hold for a while (a new launch or approach may take over)
    if (shot && (shot.kind === 'after' || shot.kind === 'site' || shot.kind === 'death') && t < shot.until) {
      if (best && bs >= 14 && t - shot.t0 > 2.5) { startProj(best, bph); return; }
      return;
    }
    if (best && bs >= 6) { if (!shot || shot.id !== best.id) startProj(best, bph); return; }
    // what happened recently
    let ev = null, es = 0;
    for (const e of recent) {
      const age = sim.t - e.t;
      if (age > 40 || e.seen) continue;
      const s = e.w - age * .15;
      if (s > es) { es = s; ev = e; }
    }
    if (ev) {
      ev.seen = true;
      const u = ev.unit ? sim.units.get(ev.unit) : null;
      if (ev.kind === 'destroyed' && u) startDeath({ unit: u.id, pos: ev.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea', t: sim.t }, false);
      else startSite(ev, u);
      return;
    }
    if (!shot || t > shot.until) startIdle();
  }

  function begin(kind, o, glide) {
    shot = Object.assign({ kind, t0: game.realT, until: game.realT + 24, side: 1, raise: 0, chk: 0 }, o);
    shot.blend = { t0: game.realT, dur: glide || 1.6, from: camState(cam), bump: -1 };
    fitK = 1; dirInit = false;
  }
  /* which side of a line the camera goes: the one it is on now, over water if it can */
  function sideFor(yawA, yawB, P, d) {
    let best = 1, bs = 1e9;
    for (const s of [1, -1]) {
      const yaw = s > 0 ? yawA : yawB;
      const ex = P[0] - Math.sin(yaw) * d, ez = P[2] - Math.cos(yaw) * d;
      let c = Math.abs(wrapPi(yaw - cam.yaw)) * .6;
      const h = game.ground(ex, ez); if (h > .5) c += 1 + h / 60;
      if (c < bs) { bs = c; best = s; }
    }
    return best;
  }
  function startProj(p, ph) {
    const pp = game.projPose(p).pos;
    if (ph === 'launch') {
      const f = p.fromPos || pp, a = Math.atan2(p.aim[0] - f[0], p.aim[2] - f[2]);
      const lu = sim.units.get(p.from);
      begin('launch', { id: p.id, aim: a, L: lu ? lu.def.size[0] : 12, until: game.realT + 60 }, 1.7);
      shot.side = sideFor(a + 1.1, a - 1.1, f, 600);
    } else if (ph === 'approach') {
      const u = tgtUnit(p);
      const a = Math.atan2(p.vel[0], p.vel[2]);
      begin('approach', { id: p.id, tgt: u.id, appr: a, until: game.realT + 60 }, clamp(ttiReal(p, u) * .45, .9, 2));
      const T = centreOf(u, c3);
      shot.side = sideFor(a + 1.2, a - 1.2, T, u.def.size[0] * 2.5);
    } else {
      begin('chase', { id: p.id, until: game.realT + 90 }, 2);
      const v = p.vel || [0, 0, 1], h = Math.atan2(v[0], v[2]);
      shot.side = Math.sin(wrapPi(cam.yaw - h)) >= 0 ? 1 : -1;
    }
  }
  function startSite(e, u) {
    begin('site', { unit: u ? u.id : 0, pos: e.pos.slice(), L: u ? u.def.size[0] : 60, sea: u ? u.def.domain === 'sea' : game.ground(e.pos[0], e.pos[2]) < .5,
      yaw0: cam.yaw + .4, until: game.realT + (e.kind === 'intercept' ? 6 : 9) }, 2.2);
  }
  function startDeath(k, isFinal) {
    begin('death', { unit: k.unit, pos: k.pos.slice(), L: k.L, sea: k.sea, final: isFinal, yaw0: cam.yaw + .3, until: game.realT + (isFinal ? 1e9 : k.sea ? 18 : 10) }, 2.4);
  }
  function startIdle() {
    const own = sim.alive(game.side).filter(u => !u.aboard);
    const tracks = sim.list().filter(u => u.alive && u.side !== game.side && !u.aboard && game.vis(u) === 'track');
    const turn = Math.floor(game.realT / 26) % 2;
    let pts = null, L = 12, sea = false, id = 0;
    if (tracks.length && (turn || !own.length)) {
      // the enemy group: round its most important track, what is within 8 km of it
      let lead = tracks[0]; for (const u of tracks) if ((RANK[u.type] || 1) > (RANK[lead.type] || 1)) lead = u;
      const grp = tracks.filter(u => Math.hypot(u.pos[0] - lead.pos[0], u.pos[2] - lead.pos[2]) < 8000);
      pts = grp; L = Math.max(...grp.map(u => u.def.size[0])); id = lead.id; sea = lead.def.domain === 'sea';
    } else if (own.length) {
      let lead = own[0]; for (const u of own) if ((RANK[u.type] || 1) > (RANK[lead.type] || 1)) lead = u;
      pts = [lead]; L = Math.max(lead.def.size[0], 12); id = lead.id; sea = lead.def.domain === 'sea';
    }
    if (!pts) return;
    begin('idle', { unit: id, group: pts.map(u => u.id), L, sea, yaw0: cam.yaw, until: game.realT + 24 }, 3);
    // stand over the sea if there is sea round the subject
    const c = centreOf(sim.units.get(id), c3);
    let bestYaw = cam.yaw, bc = 1e9;
    for (let i = 0; i < 12; i++) {
      const yaw = cam.yaw + i / 12 * TAU, d = Math.max(400, L * 7);
      const h = game.ground(c[0] - Math.sin(yaw) * d, c[2] - Math.cos(yaw) * d);
      const cost = (h > .5 ? 2 + h / 50 : 0) + Math.abs(wrapPi(yaw - cam.yaw)) * .25;
      if (cost < bc) { bc = cost; bestYaw = yaw; }
    }
    shot.yaw0 = bestYaw;
  }
  function toKind(kind, o, glide) {
    const keep = { id: shot.id, side: shot.side };
    begin(kind, Object.assign(keep, o), glide);
  }

  /* ---------- where the camera wants to be ---------- */
  function orbit(T, yaw, pitch, dist) {
    const cp = Math.cos(pitch);
    look[0] = T[0]; look[1] = T[1]; look[2] = T[2];
    eye[0] = T[0] - Math.sin(yaw) * cp * dist; eye[1] = T[1] + Math.sin(pitch) * dist; eye[2] = T[2] - Math.cos(yaw) * cp * dist;
  }
  /* land shots rise until the line of sight clears the ground (checked twice a second) */
  function clearance(target) {
    if (game.realT < shot.chk) return;
    shot.chk = game.realT + .5;
    const b = blockedBy(game.ground, eye, target);
    if (b > -3) shot.raise = Math.min(30, shot.raise + 4);
    else if (b < -40 && shot.raise > 0) shot.raise = Math.max(0, shot.raise - 1);
  }
  function desired() {
    const t = game.realT, age = t - shot.t0;
    nKeys = 0;
    if (shot.kind === 'launch' || shot.kind === 'chase') {
      const p = sim.projectiles.get(shot.id);
      if (!p || !p.alive) return false;
      if (shot.kind === 'launch' && ((p.age || 0) > launchAge(p) || upFrom(p) > 1100)) {
        // the next round of the salvo still on the pad keeps the shot; else chase this one
        let nx = null;
        for (const q of sim.projectiles.values()) if (q.alive && q !== p && q.side === p.side && heroOf(q) >= 5 && (q.age || 0) < 3 && upFrom(q) < 900 && sim.projVisible(game.side, q) && Math.hypot(q.fromPos[0] - p.fromPos[0], q.fromPos[2] - p.fromPos[2]) < 3500) { nx = q; break; }
        if (nx) shot.id = nx.id;
        else { toKind('chase', {}, 2.2); return desired(); }
        return desired();
      }
      const u = tgtUnit(p);
      if (u && ttiReal(p, u) < APPROACH_REAL) {
        const a = Math.atan2(p.vel[0], p.vel[2]);
        toKind('approach', { tgt: u.id, appr: a, until: t + 60 }, clamp(ttiReal(p, u) * .45, .9, 2));
        shot.side = sideFor(a + 1.2, a - 1.2, centreOf(u, c3), u.def.size[0] * 2.5);
        return desired();
      }
      return shot.kind === 'launch' ? launchShot(p) : chaseShot(p, age);
    }
    if (shot.kind === 'approach' || shot.kind === 'after') {
      const u = sim.units.get(shot.tgt);
      if (!u) return false;
      const p = shot.kind === 'approach' ? sim.projectiles.get(shot.id) : null;
      if (shot.kind === 'approach' && (!p || !p.alive)) { toKind('after', { tgt: u.id, appr: shot.appr, until: t + 11 }, .8); shot.side = shot.side || 1; return desired(); }
      const pose = game.unitPose(u), T = centreOf(u, c3);
      const n = hullCorners(pose, u.def, HC, 0);
      const sea = u.def.domain === 'sea';
      const pull = shot.kind === 'after' ? ss(1.5, 11, age) : 0;
      const pitch = ((sea ? 5.5 : 10) + shot.raise + 7 * pull) * DEG;
      const appr = shot.appr + (shot.kind === 'after' ? shot.side * .05 * age : 0);
      acrossView(cam, T, HC, n, appr, shot.side, pitch, { min: sea ? 170 : Math.max(30, u.def.size[0] * 2.2), k: fitK * (1 + 1.3 * pull), shift: endShift() }, eye, look);
      addKey(T);
      if (p) { const pp = game.projPose(p).pos; if (Math.hypot(pp[0] - T[0], pp[2] - T[2]) < Math.hypot(eye[0] - T[0], eye[2] - T[2]) * 1.3) addKey(pp); }
      if (!sea) clearance(T);
      return true;
    }
    if (shot.kind === 'site' || shot.kind === 'death') {
      const u = shot.unit ? sim.units.get(shot.unit) : null;
      if (u) centreOf(u, shot.pos); else if (shot.kind === 'site' && shot.unit) { /* gone: stay on the place */ }
      const T = shot.pos, sea = shot.sea;
      const pull = ss(2, shot.kind === 'death' ? 20 : 12, age);
      const pitch = ((sea ? (shot.kind === 'death' ? 4.5 : 7) : 13) + shot.raise + 4 * pull) * DEG;
      const base = shot.kind === 'death' ? (sea ? Math.max(210, shot.L * 2.4) : Math.max(80, shot.L * 6)) : Math.max(sea ? 260 : 150, shot.L * 3.2);
      const yaw = shot.yaw0 + age * (shot.kind === 'death' ? .035 : .055);
      orbit(T, yaw, pitch, base * fitK * (1 + .7 * pull));
      addKey(T);
      if (endShift()) shiftLook(endShift(), base * fitK);
      if (!sea) clearance(T);
      return true;
    }
    if (shot.kind === 'idle') {
      const u = sim.units.get(shot.unit);
      if (!u || !u.alive) return false;
      // the group's centre and extent
      let n = 0; c3[0] = c3[1] = c3[2] = 0;
      for (const id of shot.group) { const g = sim.units.get(id); if (!g || !g.alive) continue; const p = centreOf(g, w3); c3[0] += p[0]; c3[1] += p[1]; c3[2] += p[2]; n++; addKey(p); }
      if (!n) return false;
      c3[0] /= n; c3[1] /= n; c3[2] /= n;
      const pitch = ((shot.sea ? 6 : 12) + shot.raise) * DEG, yaw = shot.yaw0 + age * .03 * (shot.unit % 2 ? 1 : -1);
      let d = Math.max(shot.sea ? 380 : 120, shot.L * (shot.sea ? 3 : 6));
      if (nKeys > 1) d = Math.max(d, fitDist(cam, c3, KP, nKeys, yaw, pitch, .7, .6));
      orbit(c3, yaw, pitch, d * fitK);
      if (!shot.sea) clearance(c3);
      return true;
    }
    return false;
  }
  /* the salvo from the side, a little behind the line of fire: the launchers and every round of the salvo in frame */
  function launchShot(p) {
    const f0 = p.fromPos || p.pos;
    let x0 = 1e18, y0 = 1e18, z0 = 1e18, x1 = -1e18, y1 = -1e18, z1 = -1e18;
    for (const q of sim.projectiles.values()) {
      if (!q.alive || q.side !== p.side || (q.age || 0) > launchAge(q) || heroOf(q) < 5 || !sim.projVisible(game.side, q)) continue;
      const f = q.fromPos || q.pos;
      if (q !== p && Math.hypot(f[0] - f0[0], f[2] - f0[2]) > 3500) continue;
      q3[0] = f[0]; q3[1] = f[1] + 3; q3[2] = f[2]; addKey(q3);
      // the rounds while they are still near the pad (one high above is left to climb out of the frame)
      if (upFrom(q) < 800) addKey(game.projPose(q).pos);
    }
    for (let i = 0; i < nKeys; i++) { const k = KP[i]; x0 = Math.min(x0, k[0]); x1 = Math.max(x1, k[0]); y0 = Math.min(y0, k[1]); y1 = Math.max(y1, k[1]); z0 = Math.min(z0, k[2]); z1 = Math.max(z1, k[2]); }
    c3[0] = (x0 + x1) / 2; c3[1] = (y0 + y1) / 2; c3[2] = (z0 + z1) / 2;
    const yaw = shot.aim + shot.side * 1.1, pitch = (6 + shot.raise) * DEG;
    const d = Math.max(fitDist(cam, c3, KP, nKeys, yaw, pitch, .62, .56), shot.L * 7, 150) * fitK;
    orbit(c3, yaw, pitch, d);
    q3[0] = f0[0]; q3[1] = f0[1] + 2; q3[2] = f0[2];
    clearance(q3);
    return true;
  }
  /* just behind and above the plume; the lens between the target and the round (the round low in the frame) */
  function chaseShot(p, age) {
    const pp = game.projPose(p), P = pp.pos, v = p.vel || [0, 0, 1];
    const spd = Math.hypot(v[0], v[1], v[2]) || p.spd || 200;
    const sh = Math.sin(pp.hdg), ch = Math.cos(pp.hdg), vy = v[1] / Math.max(1, spd);
    const k = fitK * clamp(spd / 600, .55, 1.3);
    const back = (40 + 12 * Math.sin(age * .21)) * k, side = shot.side * (12 + 6 * Math.sin(age * .13 + 1)) * k, up = (6 + 3 * Math.sin(age * .17 + 2)) * k;
    eye[0] = P[0] - sh * back + ch * side; eye[2] = P[2] - ch * back - sh * side;
    eye[1] = P[1] - vy * back * .6 + up;
    const g = game.ground(eye[0], eye[2]); if (eye[1] < g + 4) eye[1] = g + 4;
    // toward the target (or ahead along the flight), weighted toward the round so it rides low in the frame
    const T = tgtPoint(p, c3);
    let ax, ay, az;
    if (T && Math.hypot(T[0] - P[0], T[2] - P[2]) < 60000) { ax = T[0] - eye[0]; ay = T[1] - eye[1]; az = T[2] - eye[2]; }
    else { ax = sh * 1500; ay = -eye[1] * .4 + Math.max(0, vy) * 600; az = ch * 1500; }
    let l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    let bx = P[0] - eye[0], by = P[1] - eye[1], bz = P[2] - eye[2];
    l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
    const w = .4;
    look[0] = eye[0] + (ax * (1 - w) + bx * w) * 600; look[1] = eye[1] + (ay * (1 - w) + by * w) * 600; look[2] = eye[2] + (az * (1 - w) + bz * w) * 600;
    addKey(P);
    return true;
  }
  /* the end screen covers the left of the view: the subject goes right of centre (the menu over a live film) */
  function endShift() {
    if (!game.result) return 0;
    const el = document.querySelector('.oniks-end');
    return el && !el.classList.contains('min') ? .3 : 0;
  }
  function shiftLook(k, d) {
    const yaw = Math.atan2(look[0] - eye[0], look[2] - eye[2]), tx = Math.tan(cam.fov / 2) * cam.W / Math.max(1, cam.H);
    const dx = -Math.cos(yaw) * k * d * tx, dz = Math.sin(yaw) * k * d * tx;
    look[0] += dx; look[2] += dz; eye[0] += dx; eye[2] += dz;
  }

  /* the named points stay in the frame: while one is outside the box the shot pulls back, then it eases in again */
  function frameCheck(dt) {
    if (!shot || shot.blend || !nKeys) return;
    const W = cam.W, H = cam.H;
    let out = false, inner = true;
    for (let i = 0; i < nKeys; i++) {
      const q = cam.project(KP[i], q3);
      if (!q) { out = true; break; }
      const x = q[0] / W, y = q[1] / H;
      if (x < BOX[0] || x > BOX[2] || y < BOX[1] || y > BOX[3]) { out = true; break; }
      if (x < INNER[0] || x > INNER[2] || y < INNER[1] || y > INNER[3]) inner = false;
    }
    if (out) fitK = Math.min(5, fitK * (1 + 2.4 * dt));
    else if (inner && fitK > 1) fitK = Math.max(1, fitK * (1 - .3 * dt));
  }

  /* put the camera there: the eye as the shot says, the look smoothed, glided in from where the shot began */
  function apply(dt) {
    let dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    if (!dirInit) { dirS[0] = dx; dirS[1] = dy; dirS[2] = dz; dirInit = true; }
    else {
      const k = 1 - Math.exp(-dt * (shot.kind === 'chase' ? 5 : 3.2));
      dirS[0] += (dx - dirS[0]) * k; dirS[1] += (dy - dirS[1]) * k; dirS[2] += (dz - dirS[2]) * k;
      const n = Math.hypot(dirS[0], dirS[1], dirS[2]) || 1; dirS[0] /= n; dirS[1] /= n; dirS[2] /= n;
    }
    w3[0] = eye[0] + dirS[0] * L; w3[1] = eye[1] + dirS[1] * L; w3[2] = eye[2] + dirS[2] * L;
    lookFrom(cam, eye, w3, want);
    // a hand on the camera, low over the sea
    const t = game.realT, hk = eye[1] < 600 ? 1 : .3;
    want.yaw += (.0042 * Math.sin(t * .63) + .0028 * Math.sin(t * 1.37 + 1.1)) * hk;
    want.pitch += (.0026 * Math.sin(t * .81 + 2.3) + .0016 * Math.sin(t * 1.9)) * hk;
    const B = shot.blend;
    if (B) {
      if (B.bump < 0) { B.bump = bumpOf(B.from, want); B.dur = Math.max(B.dur, glideDur(B.from, want, 1.2, 3.4)); }
      const u = clamp((game.realT - B.t0) / B.dur, 0, 1);
      blendPose(B.from, want, ease(u), B.bump, cur);
      if (u >= 1) shot.blend = null;
    } else {
      cur.T[0] = want.T[0]; cur.T[1] = want.T[1]; cur.T[2] = want.T[2];
      cur.dist = want.dist; cur.pitch = want.pitch;
      cur.yaw = cur.yaw + wrapPi(want.yaw - cur.yaw);
    }
    putCam(cam, cur, follow);
  }

  return {
    name: 'director', priority: PRI.director,
    set, get on() { return on; }, get shot() { return shot; },
    get edgeWas() { return edgeWas; }, set edgeWas(v) { edgeWas = v; },
    /* for the replay: glide on from where the camera is now */
    resync() { shot = null; lastPick = -99; },
    onKey(e) {
      if (e.type !== 'keydown') return false;
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey) { set(!on); game.bus.emit('toast', { text: on ? 'CINEMATIC' : 'CINEMATIC OFF' }); return true; }
      if (on && e.code === 'Escape' && !(game.replay && game.replay.active)) { set(false); return true; }
      if (on && CAM_KEYS.has(e.code)) set(false);   // the camera takes it from here
      return false;
    },
    onPointer(ev) {
      if (!on) return false;
      if ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel') set(false);
      return false;
    },
    init() {
      game.bus.on('result', () => {
        // the end: the last kill, held (the most important of the last few, the command post first)
        if (lastKill && sim.t - lastKill.t < 90) final = { unit: lastKill.unit, pos: lastKill.pos.slice(), L: lastKill.L, sea: lastKill.sea, t: lastKill.t };
        if (on) { shot = null; lastPick = -99; }
      });
    },
    onEvent(e) {
      const t = e.t;
      let rec = null;
      if (e.type === 'hit') rec = { kind: 'hit', pos: e.pos, t, w: 9, unit: e.target };
      else if (e.type === 'destroyed') {
        const u = sim.units.get(e.unit);
        rec = { kind: 'destroyed', pos: e.pos, t, w: u && u.def.domain === 'sea' ? 12 : 8, unit: e.unit };
        if (u && seen(u) || (u && u.side === game.side)) {
          const r = (RANK[u.type] || 1) + (u.def.hq ? 20 : 0);
          if (!lastKill || sim.t - lastKill.t > 30 || r >= lastKill.r) lastKill = { unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea', t: sim.t, r };
        }
      }
      else if (e.type === 'intercept') rec = { kind: 'intercept', pos: e.pos, t, w: 5 };
      if (!rec) return;
      if (rec.unit) { const u = sim.units.get(rec.unit); if (u && !game.vis(u)) return; }   // only what the player may see
      // the hit we are already framing is not a new subject
      if (shot && (shot.kind === 'approach' || shot.kind === 'after') && rec.unit === shot.tgt && rec.kind === 'hit') rec.seen = true;
      recent.push(rec);
      if (recent.length > 24) recent.splice(0, recent.length - 24);
    },
    update(dt) {
      if (!on) return;
      if (game.replay && game.replay.active) { waiting = true; return; }
      if (waiting) { waiting = false; shot = null; lastPick = -99; }
      frameCheck(dt);
      if (game.realT - lastPick > .5 || !shot || game.realT > shot.until) pick();
      if (!shot) return;
      if (!desired()) { shot = null; lastPick = -99; pick(); if (!shot || !desired()) return; }
      apply(dt);
    },
    draw2d(ov) {
      if (!on || game.getSystem('hud') || (game.replay && game.replay.active)) return;
      ov.text(ov.W - 24, 30, 'CINEMATIC · C', { size: 10.5, col: '#C6F432', align: 'right' });
    },
  };
}
