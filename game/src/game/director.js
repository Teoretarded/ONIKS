/* Cinematic camera (C): an auto-director that frames the action the way the films do. With rounds selected
   (game/select.js: click or box them) C and B hand it those rounds: director.watch(ids, i) pins the shot to them (the
   i-th first, then whichever's moment comes next; B: bullet time on them). bus 'watch' { ids, id }.

   Shots (one continuous take: the eye and the look point ride critically damped springs toward each shot's goal,
   the goal's own velocity fed forward, so a change of subject is a glide from wherever the camera is, never a cut):
     round     one shot for a round's whole flight, its framings eased into each other by weights:
                 launch  low beside the launcher, rising with the round (Scale · Strike, Aegis)
                 chase   close behind and a little above and beside it, the lens along its line of sight to its
                         target: the target grows ahead (Engagement's chase)
                 engaged an interceptor on its way (game/director/predict.js: time to go from range and closing
                         speed): back and out to the side, just far enough for the round and the interceptor to meet
                         in the frame; never out to the interceptor
                 guns    a gun about to fire or firing at it: low beside and behind the mount, the mount big in the
                         corner, the tracers streaming out to the round (Engagement)
                 end     the last seconds: a witness angle across the target, the round coming in
               the round never leaves the frame (the goal turns toward it past 14 deg, the lens past 17 deg)
     break     the round came apart: in close, a slow orbit round the pieces (their centre from the debris bodies)
     after     the hit: held on the target, then slowly up and off its quarter (Engagement after the hit)
     site      a hit, an intercept or a loss seen after the fact: a slow low orbit of the place
     death     a dying unit at a low angle, the sinking hull; at the end of the match the last kill, held
     idle      nothing happening: slow low orbits of the most important own unit, then of the enemy group
   Rounds: with rounds selected (C / B) the director takes the one whose moment (intercept, burst, impact) comes
   next, stays through its moment and the break-up, then moves on; alone it scores every round (being engaged first).
   Time (game/director/pace.js): B eases the rate down ahead of each predicted moment (x0.1; x0.3 while bursts are on
   their way), holds through it and the break-up, eases back up; the cinematic alone does the same at x0.25 for an
   intercept or a burst (with the Hit replay setting, 12 s apart). Presentation only: the sim never changes.
   Hand-over: any camera input (WASD / arrows / Q E / PageUp / PageDown, wheel, right or middle drag) hands the camera
   back; C again resumes. While the hit replay (replay.js) has the camera the director waits, then glides on from
   where the replay left it. createDirector returns [director, replay] (the replay loads with it; see replay.js).

   The rig (exported, shared with the replay): a shot is an eye and a look point, turned into the RTS camera's own
   orbit pose { T, dist, yaw, pitch } by lookFrom() (a near-level or upward look uses the camera's look-up tilt:
   the orbit target goes on the floor ray ahead of the eye). fitDist() is the distance at which points fill a
   screen box; blendPose() the glide (log distance, a pull-back bump on long moves); putCam() writes the camera. */
import { PRI } from './game.js';
import { createPace } from './director/pace.js';
import { predict, newPrediction } from './director/predict.js';

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
const RANK = { carrier: 10, hq: 9, cg: 8, ddg: 8, lcs: 6, tel: 6, s400: 5, radar: 5, s400r: 5, pantsir: 4, bereg: 4, transloader: 3, helo: 2, fighter: 2, catapult: 1, drone: 1 };
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

const FAR = 1e9;
const up3 = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
const norm3 = o => { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return o; };
const mix3 = (o, a, b, k) => { o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k; return o; };
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* a weight eased toward its target at its own rates (1/s up, down): real time, frame-rate independent */
const toward = (v, tgt, dt, rUp, rDn) => v + (tgt - v) * (1 - Math.exp(-dt * (tgt > v ? rUp : rDn)));

function makeDirector(game) {
  const { sim, R } = game, cam = R.camera;
  const pace = createPace(game);
  let on = false, shot = null, lastPick = -99, edgeWas = true, waiting = false, fitK = 1;
  const recent = [];           // interesting events: { kind, pos, t, w, unit, proj, seen }
  let lastKill = null, lastHq = null, final = null;
  let pin = null;              // the player's own subject: { ids, i, lock (real t: a manual choice holds), bullet }
  let autoNext = 0;            // real t: the next automatic slow-down may start
  const eye = [0, 0, 0], look = [0, 0, 0], q3 = [0, 0, 0], c3 = [0, 0, 0], w3 = [0, 0, 0];
  const want = newPose(), cur = newPose();
  const KP = Array.from({ length: 32 }, () => [0, 0, 0]);
  const HC = Array.from({ length: 9 }, () => [0, 0, 0]);     // a hull's 8 corners (+ the round coming in)
  let nKeys = 0, near = 0, subj = null;   // subj: the round the lens must keep in the frame (round shots)
  const follow = () => cur.T;
  const addKey = p => { if (nKeys < KP.length) { const k = KP[nKeys++]; k[0] = p[0]; k[1] = p[1]; k[2] = p[2]; } };
  const PR = newPrediction(), PX = newPrediction();
  // scratch for the round shot
  const F = [0, 0, 1], FH = [0, 0, 1], SV = [1, 0, 0], LOS = [0, 0, 1], BD = [0, 0, 1];
  const eA = [0, 0, 0], dA = [0, 0, 1], eB = [0, 0, 0], dB = [0, 0, 1], tmp = [0, 0, 0], tmp2 = [0, 0, 0], M3 = [0, 0, 0], Q3 = [0, 0, 0], C3 = [0, 0, 0];

  /* ---------- the rig: critically damped springs on the eye and on the look point (world space, real time) ----------
     Each tracks its goal with the goal's own velocity fed forward (no lag behind a round at Mach 2.5, however fast it
     flies); every change of subject is a spring glide from wherever the camera is, never a cut. The look point is
     kept at the subject's distance, so the spring smooths the direction the lens turns. */
  const rig = { init: false, e: [0, 0, 0], ev: [0, 0, 0], l: [0, 0, 0], lv: [0, 0, 0], ge: [0, 0, 0], gl: [0, 0, 0], gve: [0, 0, 0], gvl: [0, 0, 0], jump: true, t0: 0 };
  function rigFromCam() {
    const e = cam.eye, f = cam.f, d = Math.max(50, Math.min(cam.dist || 500, 3000));
    for (let k = 0; k < 3; k++) { rig.e[k] = e[k]; rig.l[k] = e[k] + f[k] * d; rig.ev[k] = rig.lv[k] = 0; rig.gve[k] = rig.gvl[k] = 0; }
    rig.init = true; rig.jump = true; rig.t0 = game.realT;
  }
  function springAxis(x, v, g, gp, gv, w, dt, k) {
    const e0 = x[k] - gp[k], w0 = v[k] - gv[k], ex = Math.exp(-w * dt), a = w0 + w * e0;
    x[k] = g[k] + (e0 + a * dt) * ex; v[k] = gv[k] + (w0 - w * a * dt) * ex;
  }
  function rigStep(dt, wEye, wLook) {
    if (!rig.init) rigFromCam();
    const kf = 1 - Math.exp(-dt * 10);
    if (rig.jump || dt <= 0) {
      for (let k = 0; k < 3; k++) { rig.ge[k] = eye[k]; rig.gl[k] = look[k]; }
      rig.jump = false;
    } else for (let k = 0; k < 3; k++) {
      const ve = (eye[k] - rig.ge[k]) / dt, vl = (look[k] - rig.gl[k]) / dt;
      rig.gve[k] += (ve - rig.gve[k]) * kf; rig.gvl[k] += (vl - rig.gvl[k]) * kf;
    }
    if (dt > 0) for (let k = 0; k < 3; k++) {
      springAxis(rig.e, rig.ev, eye, rig.ge, rig.gve, wEye, dt, k);
      springAxis(rig.l, rig.lv, look, rig.gl, rig.gvl, wLook, dt, k);
      rig.ge[k] = eye[k]; rig.gl[k] = look[k];
    }
    // the lens stays above the ground and the swell
    const g = game.ground(rig.e[0], rig.e[2]), floor = Math.max(0, g) + (g > .5 ? 2 : 3.5);
    if (rig.e[1] < floor) { rig.e[1] = floor; if (rig.ev[1] < 0) rig.ev[1] = 0; }
  }
  /* a new subject: the goals jump, the springs glide (soft at first, then as tight as the shot wants) */
  function newGoal() { rig.jump = true; rig.t0 = game.realT; }

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v; game.cinematic = on;
    shot = null; lastPick = -99; rig.init = false;
    if (!on && pin) { pin = null; game.bus.emit('watch', { ids: [] }); }
    if (!on && pace.active) pace.stop(pace.owner === 'bullet');
    // the screen edges do not pan while the director flies (a resting mouse would fight it)
    if (on) { edgeWas = game.replay && game.replay.state && game.replay.state.edge0 !== undefined ? game.replay.state.edge0 : cam.edge; cam.edge = false; }
    else { cam.edge = edgeWas; cam.view = null; if (!(game.replay && game.replay.active)) { cam.follow(null); cam.fly = null; } }
    game.bus.emit('cinematic', { on });
  }

  /* ---------- what the player may watch ---------- */
  const seen = u => { const v = u && game.vis(u); return v === 'own' || v === 'track'; };
  const heroOf = p => HERO[p.kind] || 1;
  const launchAge = p => { const P = p.P || game.PROJ[p.kind] || {}; return clamp((P.sepAt || P.boost || 4) + 2, 4, 10); };
  const upFrom = p => { const f = p.fromPos || p.pos; return Math.hypot(p.pos[0] - f[0], p.pos[1] - f[1], p.pos[2] - f[2]); };
  const lenOf = p => { const P = p.P || game.PROJ[p.kind] || {}; return P.body ? P.body[0] : 4; };
  /* the rate the shot timings are scaled by: the player's (not the bullet time's own) */
  const rateRef = () => Math.max(1, pace.active ? pace.base : game.timeRate);
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
  /* the soonest thing about to happen to the round (game s): an intercept, a gun burst, the impact */
  const nextOf = r => Math.min(r.tEv, r.gunSoon, r.tImpact);
  function score(p, r) {
    let s = heroOf(p);
    const k = Math.sqrt(rateRef());
    if ((p.age || 0) < 4 && heroOf(p) >= 5) s += 6;
    if (r.tEv < 6 || r.gunSoon < 4) s += 13;                 // being engaged: the first thing worth watching
    if (r.tImpact < 9 * k) s += 12;
    if (p.side === game.side) s += 1;
    const u = p.tk === 'unit' ? sim.units.get(p.target) : null;
    if (u && u.side === game.side) s += 3;           // something is coming at us
    if (u && (u.def.domain === 'sea' || u.def.hq)) s += 1;
    if (shot && shot.id === p.id) s += 5;            // stay with the round we are on
    if (p.ctrl === false) s += 6;                    // a round out of control, coming apart (game/debris.js)
    return s;
  }

  /* ---------- choosing ---------- */
  function pick() {
    lastPick = game.realT;
    const t = game.realT;
    if (final) { if (!shot || shot.kind !== 'death' || !shot.final) startDeath(final, true); return; }
    // a break-up or a hit plays out before anything else takes the picture
    if (shot && (shot.kind === 'break' || shot.kind === 'after') && t < shot.minUntil) return;
    // the player's rounds (C / B on a selection of rounds): the one whose moment comes next; a manual choice holds
    if (pin) {
      // a moment the camera could not reach in time (under 2.5 real s away) is not one to move to
      const rr = Math.max(.1, game.timeRate);
      let best = null, bt = FAR, curAlive = false, curT = FAR;
      for (const id of pin.ids) {
        const q = sim.projectiles.get(id);
        if (!q || !q.alive) continue;
        const tt = nextOf(predict(game, q, PX));
        if (shot && shot.kind === 'round' && shot.id === id) { curAlive = true; curT = tt; continue; }
        const tq = tt / rr < 2.5 ? FAR * .5 : tt;
        if (tq < bt || !best) { bt = tq; best = q; }
      }
      if (curAlive && (!best || bt >= FAR * .5)) return;
      if (!best && curAlive) return;
      if (best) {
        if (curAlive) {
          // stay, unless another's moment comes clearly sooner and ours is not about to happen
          if (t < pin.lock || curT < 3.5 || bt > curT - 2 || t - shot.t0 < 3 || t - (shot.evT || -99) < 4 || pace.holding) return;
        }
        startRound(best);
        pin.i = Math.max(0, pin.ids.indexOf(best.id));
        game.bus.emit('watch', { ids: pin.ids.slice(), id: best.id });
        return;
      }
      if (shot && (shot.kind === 'break' || shot.kind === 'after') && t < shot.until) return;
      const wasBullet = pin.bullet;
      pin = null; game.bus.emit('watch', { ids: [] });
      if (wasBullet && pace.active && pace.owner === 'bullet') pace.finish();
    }
    // the rounds
    let best = null, bs = 0;
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !sim.projVisible(game.side, p) || heroOf(p) < 3) continue;
      const s = score(p, predict(game, p, PX));
      if (s > bs) { bs = s; best = p; }
    }
    const curP = shot && shot.kind === 'round' ? sim.projectiles.get(shot.id) : null;
    if (curP && curP.alive) {
      const age = t - shot.t0, cs = score(curP, predict(game, curP, PX));
      // a round in its moment (engaged, closing on its target) keeps the shot
      if (nextOf(PX) < 6) return;
      if (best && best.id !== curP.id && bs > cs + 6 && age > 5) { startRound(best); return; }
      if (age < 28) return;
    }
    // the moments after a hit and the losses hold for a while (a round in its moment may take over)
    if (shot && (shot.kind === 'after' || shot.kind === 'site' || shot.kind === 'death' || shot.kind === 'break') && t < shot.until) {
      if (best && bs >= 14 && t - shot.t0 > 2.5) { startRound(best); return; }
      return;
    }
    if (best && bs >= 6) { if (!shot || shot.id !== best.id || shot.kind !== 'round') startRound(best); return; }
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

  function begin(kind, o) {
    shot = Object.assign({ kind, t0: game.realT, until: game.realT + 24, minUntil: 0, side: 1, raise: 0, chk: 0 }, o);
    fitK = 1; newGoal();
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
  /* a round: from the launch (low beside the launcher) through the chase (close behind it, along its line of sight),
     the engagement (pulled back to the side: the round and what comes at it), the guns (low by the mount, the round
     in the tracers), the end (a witness angle on the target); one shot, its weights eased, the springs gliding */
  function startRound(p) {
    const v = p.vel || [0, 0, 1], h = Math.atan2(v[0], v[2]);
    const f = p.fromPos || p.pos, aim = p.aim ? Math.atan2(p.aim[0] - f[0], p.aim[2] - f[2]) : h;
    const young = (p.age || 0) < 3 && heroOf(p) >= 5 && upFrom(p) < 400;
    begin('round', { id: p.id, until: game.realT + 1e9, launch: young, aim,
      wL: young ? 1 : 0, wE: 0, wG: 0, wT: 0, appr: null, wside: 1, gside: 1, gun: 0, gunT: -99, eng: null, pr: null,
      lastP: game.projPose(p).pos.slice(), lastV: v.slice(), L: lenOf(p), tgt: p.tk === 'unit' ? p.target : 0, prevEv: FAR, prevSrc: 0 });
    shot.side = Math.sin(wrapPi(cam.yaw - h)) >= 0 ? 1 : -1;
    if (young) shot.side = sideFor(aim + 1.1, aim - 1.1, f, 300);
  }
  function startBreak(pos, vel, L, id) {
    const off = [rig.e[0] - pos[0], rig.e[1] - pos[1], rig.e[2] - pos[2]];
    const d = Math.hypot(off[0], off[1], off[2]) || 1;
    const dd = clamp(d, L * 5, 160);
    for (let k = 0; k < 3; k++) off[k] *= dd / d;
    if (off[1] < dd * .12) off[1] = dd * .12;
    const yaw0 = Math.atan2(-off[0], -off[2]);
    const spin = shot && shot.side ? shot.side : 1;
    begin('break', { id, pos: pos.slice(), vel: vel.slice(), L, t0s: sim.t, yaw0, pitch0: Math.asin(clamp(off[1] / dd, -.5, .8)), d0: dd,
      c: pos.slice(), minUntil: game.realT + 4.5, until: game.realT + 7.5, spin });
  }
  function startAfter(u, appr, side) {
    begin('after', { tgt: u.id, appr, until: game.realT + 11, minUntil: game.realT + 4 });
    shot.side = side || 1;
  }
  function startSite(e, u) {
    begin('site', { unit: u ? u.id : 0, pos: e.pos.slice(), L: u ? u.def.size[0] : 60, sea: u ? u.def.domain === 'sea' : game.ground(e.pos[0], e.pos[2]) < .5,
      yaw0: cam.yaw + .4, until: game.realT + (e.kind === 'intercept' ? 6 : 9) });
  }
  function startDeath(k, isFinal) {
    begin('death', { unit: k.unit, pos: k.pos.slice(), L: k.L, sea: k.sea, final: isFinal, yaw0: cam.yaw + .3, until: game.realT + (isFinal ? 1e9 : k.sea ? 18 : 10) });
  }
  function startIdle() {
    const own = sim.alive(game.side).filter(u => !u.aboard);
    const tracks = sim.list().filter(u => u.alive && u.side !== game.side && !u.aboard && game.vis(u) === 'track');
    const turn = Math.floor(game.realT / 26) % 2;
    let pts = null, L = 12, sea = false, id = 0;
    if (tracks.length && (turn || !own.length)) {
      let lead = tracks[0]; for (const u of tracks) if ((RANK[u.type] || 1) > (RANK[lead.type] || 1)) lead = u;
      const grp = tracks.filter(u => Math.hypot(u.pos[0] - lead.pos[0], u.pos[2] - lead.pos[2]) < 8000);
      pts = grp; L = Math.max(...grp.map(u => u.def.size[0])); id = lead.id; sea = lead.def.domain === 'sea';
    } else if (own.length) {
      let lead = own[0]; for (const u of own) if ((RANK[u.type] || 1) > (RANK[lead.type] || 1)) lead = u;
      pts = [lead]; L = Math.max(lead.def.size[0], 12); id = lead.id; sea = lead.def.domain === 'sea';
    }
    if (!pts) return;
    begin('idle', { unit: id, group: pts.map(u => u.id), L, sea, yaw0: cam.yaw, until: game.realT + 24 });
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
  /* eye e, direction d (unit) -> the goal: the look point at the subject's distance */
  function goal(e, d, Ls) {
    eye[0] = e[0]; eye[1] = e[1]; eye[2] = e[2];
    const L = clamp(Ls, 20, 4000);
    look[0] = e[0] + d[0] * L; look[1] = e[1] + d[1] * L; look[2] = e[2] + d[2] * L;
  }
  /* blend (eA, dA) toward (eB, dB) by k */
  function blendInto(k) {
    if (k <= 0) return;
    mix3(eA, eA, eB, k);
    mix3(dA, dA, dB, k); norm3(dA);
  }
  function floorAt(e, m) { const g = game.ground(e[0], e[2]); const f = Math.max(0, g) + (g > .5 ? m * .6 : m); if (e[1] < f) e[1] = f; }

  function desired(dt) {
    const t = game.realT, age = t - shot.t0;
    nKeys = 0; near = 0; subj = null;
    if (shot.kind === 'round') return roundShot(dt, age);
    if (shot.kind === 'break') return breakShot(dt, age);
    if (shot.kind === 'after') {
      const u = sim.units.get(shot.tgt);
      if (!u) return false;
      const pose = game.unitPose(u), T = centreOf(u, c3);
      const n = hullCorners(pose, u.def, HC, 0);
      const sea = u.def.domain === 'sea';
      const pull = ss(1.5, 11, age);
      const pitch = ((sea ? 5.5 : 10) + shot.raise + 7 * pull) * DEG;
      const appr = shot.appr + shot.side * .05 * age;
      acrossView(cam, T, HC, n, appr, shot.side, pitch, { min: sea ? 170 : Math.max(30, u.def.size[0] * 2.2), k: fitK * (1 + 1.3 * pull), shift: endShift() }, eye, look);
      addKey(T);
      if (!sea) clearance(T);
      return true;
    }
    if (shot.kind === 'site' || shot.kind === 'death') {
      const u = shot.unit ? sim.units.get(shot.unit) : null;
      if (u) centreOf(u, shot.pos);
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

  /* the round shot (see startRound) */
  function roundShot(dt, age) {
    const p = sim.projectiles.get(shot.id);
    if (!p || !p.alive) return roundEnded();
    const pp = game.projPose(p), P = pp.pos, v = p.vel || shot.lastV;
    shot.lastP[0] = P[0]; shot.lastP[1] = P[1]; shot.lastP[2] = P[2];
    shot.lastV[0] = v[0]; shot.lastV[1] = v[1]; shot.lastV[2] = v[2];
    const spd = Math.hypot(v[0], v[1], v[2]);
    if (spd > 1) up3(F, v[0] / spd, v[1] / spd, v[2] / spd);
    else up3(F, Math.sin(pp.hdg) * Math.cos(pp.pitch), Math.sin(pp.pitch), Math.cos(pp.hdg) * Math.cos(pp.pitch));
    up3(FH, F[0], 0, F[2]); if (Math.hypot(FH[0], FH[2]) < 1e-3) up3(FH, Math.sin(cam.yaw), 0, Math.cos(cam.yaw)); norm3(FH);
    up3(SV, FH[2] * shot.side, 0, -FH[0] * shot.side);
    const Lr = shot.L, r = predict(game, p, PR);
    shot.pr = r;
    const k = Math.sqrt(rateRef()), t = game.realT;

    // chase: close behind and a little beside and above, the lens along the round's line of sight to its target
    const T = tgtPoint(p, c3);
    if (T && dist3(T, P) < 80000) { up3(LOS, T[0] - P[0], T[1] - P[1], T[2] - P[2]); norm3(LOS); }
    else { up3(LOS, F[0], F[1] * .5, F[2]); norm3(LOS); }
    mix3(BD, F, LOS, .35); norm3(BD);
    const back = clamp(Lr * 5.8, 26, 90) * (1 + .08 * Math.sin(age * .21));
    for (let i = 0; i < 3; i++) eA[i] = P[i] - BD[i] * back + SV[i] * back * (.2 + .04 * Math.sin(age * .13 + 1));
    eA[1] += back * (.12 + .03 * Math.sin(age * .17 + 2));
    floorAt(eA, 3);
    for (let i = 0; i < 3; i++) dA[i] = P[i] + LOS[i] * back * 9 - eA[i];
    norm3(dA);
    let Ls = dist3(P, eA) * 1.5;

    // launch: low beside the launcher, rising with the round
    if (shot.launch) {
      const la = launchAge(p), uf = upFrom(p);
      const wl = (1 - ss(la * .55, la, p.age || 0)) * (1 - ss(300, 900, uf));
      shot.wL = toward(shot.wL, wl, dt, 3, 1.2);
      if (shot.wL > .002) {
        const f0 = p.fromPos || P, lu = sim.units.get(p.from), Lu = lu ? lu.def.size[0] : 12, sea = game.ground(f0[0], f0[2]) < .5;
        const dS = clamp(Lu * 1.5 + 30, 45, 300), sa = Math.sin(shot.aim), ca = Math.cos(shot.aim);
        eB[0] = f0[0] + ca * shot.side * dS - sa * dS * .35; eB[2] = f0[2] - sa * shot.side * dS - ca * dS * .35;
        const g = Math.max(0, game.ground(eB[0], eB[2]));
        eB[1] = g + (sea ? 6 : 2.5) + Math.min(260, .38 * Math.max(0, P[1] - f0[1]));
        up3(tmp, f0[0], f0[1] + (lu ? lu.def.size[2] * .5 : 3), f0[2]);
        mix3(tmp, tmp, P, .45 + .5 * ss(0, 140, uf));
        up3(dB, tmp[0] - eB[0], tmp[1] - eB[1], tmp[2] - eB[2]); norm3(dB);
        blendInto(shot.wL);
        Ls = Ls + (Math.max(dS, dist3(P, eB)) - Ls) * shot.wL;
      }
    }

    // engaged by interceptors: back and to the side, just enough for the round, the interceptor and where they meet
    let we = 0;
    if (r.kind === 'intercept' && r.tEv < 8) {
      we = ss(8, 3, r.tEv);
      const q = sim.projectiles.get(r.qId);
      const Qp = q ? game.projPose(q).pos : r.q;
      shot.eng = shot.eng || { Q: [0, 0, 0], M: [0, 0, 0] };
      for (let i = 0; i < 3; i++) { shot.eng.Q[i] = Qp[i]; shot.eng.M[i] = P[i] + v[i] * r.tEv; }
    }
    shot.wE = toward(shot.wE, we, dt, 1.4, .55);
    if (shot.wE > .002 && shot.eng) {
      // still round the round (never out to the interceptor): back and out to its side, farther the farther off the
      // interceptor still is
      const Qp = shot.eng.Q, dq = dist3(Qp, P);
      // how far out: set by the interceptor's distance, but changed only slowly (a closing interceptor must not pull
      // the camera in faster than the springs can follow)
      const Dt = clamp(dq * .1, Lr * 7, 260);
      shot.engD = shot.engD ? toward(shot.engD, Dt, dt, .35, .6) : Dt;
      const D = shot.engD;
      for (let i = 0; i < 3; i++) eB[i] = P[i] - F[i] * D * .8 + SV[i] * D * .45;
      eB[1] += D * .12;
      floorAt(eB, 4);
      // the lens between the round and the interceptor (held in close: past 1.3 D it only shows where it comes from)
      const dc = Math.min(dq, D * 1.3);
      mix3(Q3, P, Qp, dq > 1 ? dc / dq : 0);
      mix3(C3, P, Q3, .35);
      up3(dB, C3[0] - eB[0], C3[1] - eB[1], C3[2] - eB[2]); norm3(dB);
      blendInto(shot.wE);
      Ls = Ls + (dist3(eB, C3) - Ls) * shot.wE;
    }

    // the end: the target grows ahead, then a witness angle across it for the hit
    const u = tgtUnit(p);
    let wt = 0;
    if (u) {
      wt = ss(9 * k, 2.4 * k, r.tImpact);
      if (wt > 0 && shot.appr === null) {
        const Tc = centreOf(u, tmp);
        shot.appr = Math.atan2(Tc[0] - P[0], Tc[2] - P[2]);
        shot.wside = sideFor(shot.appr + 1.2, shot.appr - 1.2, Tc, u.def.size[0] * 2.5);
      }
    }
    shot.wT = toward(shot.wT, wt, dt, 2, .8);
    if (shot.wT > .002 && u && shot.appr !== null) {
      const pose = game.unitPose(u), Tc = centreOf(u, tmp2);
      let n = hullCorners(pose, u.def, HC, 0);
      const k9 = HC[n++]; k9[0] = P[0]; k9[1] = P[1]; k9[2] = P[2];
      const sea = u.def.domain === 'sea';
      acrossView(cam, Tc, HC, n, shot.appr, shot.wside, (sea ? 5.5 : 10) * DEG, { min: sea ? 150 : Math.max(30, u.def.size[0] * 2.2) }, eB, tmp);
      floorAt(eB, 4);
      const d = dist3(eB, tmp);
      up3(dB, tmp[0] - eB[0], tmp[1] - eB[1], tmp[2] - eB[2]); norm3(dB);
      blendInto(shot.wT);
      Ls = Ls + (d - Ls) * shot.wT;
    }

    // the guns: low by the mount, the tracers streaming out to the round (Engagement)
    let gid = 0;
    if (r.kind === 'gun' && r.tEv < 6) gid = r.gunUnit;
    else if (r.gunSoon < 4.5 * k) gid = r.gunSoonUnit;
    if (gid) {
      shot.gunT = t;
      if (gid !== shot.gun && (shot.wG < .3 || !sim.units.get(shot.gun))) {
        const gu = sim.units.get(gid);
        if (gu) {
          shot.gun = gid;
          // the camera on the left of the line of fire: the mount stands on the right of the frame (clear of the
          // HUD's left column)
          shot.gside = -1;
        }
      }
    }
    shot.wG = toward(shot.wG, t - shot.gunT < 1.2 ? 1 : 0, dt, 1.6, .5);
    const gu = shot.gun ? sim.units.get(shot.gun) : null;
    if (shot.wG > .002 && gu) {
      const gpose = game.unitPose(gu), A = gpose.pos, Lu = gu.def.size[0], Hu = gu.def.size[2];
      const dx = P[0] - A[0], dz = P[2] - A[2], h = Math.hypot(dx, dz) || 1, ux = dx / h, uz = dz / h;
      const sx = uz * shot.gside, sz = -ux * shot.gside;
      // low beside and behind the mount, the mount big in the corner of the frame, the lens up the line of fire
      const gb = (Lu * .75 + 7) * (1 + .05 * Math.sin(age * .3)), side = Lu * .3 + 4;
      eB[0] = A[0] - ux * gb + sx * side; eB[2] = A[2] - uz * gb + sz * side;
      eB[1] = A[1] + Hu * .45 + 1.2;
      floorAt(eB, 2.5);
      up3(tmp, A[0] - eB[0], A[1] + Hu * .6 - eB[1], A[2] - eB[2]); norm3(tmp);
      up3(dB, P[0] - eB[0], P[1] - eB[1], P[2] - eB[2]); norm3(dB);
      mix3(dB, tmp, dB, .75); norm3(dB);
      blendInto(shot.wG);
      Ls = Ls + (Math.max(60, dist3(eB, P) * .5) - Ls) * shot.wG;
      near = Math.max(.3, Math.min(gb * .2, 5));
    }
    // whatever the blend, the round stays in the frame: the lens turns toward it until it is within ~14 deg of the
    // centre (the launch climbing out of a low eye, a glide between two framings)
    up3(tmp, P[0] - eA[0], P[1] - eA[1], P[2] - eA[2]);
    if (Math.hypot(tmp[0], tmp[1], tmp[2]) > 1) {
      norm3(tmp);
      const c = clamp(dA[0] * tmp[0] + dA[1] * tmp[1] + dA[2] * tmp[2], -1, 1), a = Math.acos(c), amax = 14 * DEG;
      if (a > amax) { mix3(dA, dA, tmp, (a - amax) / a); norm3(dA); }
    }
    goal(eA, dA, Ls);
    subj = P;
    if (!near) near = clamp(Math.min(back * .2, dist3(eA, P) * .3), .3, 12);
    return true;
  }
  /* the watched round is gone: its hit (after), else its break-up (break) */
  function roundEnded() {
    const id = shot.id;
    const h = recent.find(e => e.kind === 'hit' && e.proj === id);
    const u = shot.tgt ? sim.units.get(shot.tgt) : null;
    if (h && u) {
      const appr = shot.appr !== null ? shot.appr : Math.atan2(u.pos[0] - shot.lastP[0], u.pos[2] - shot.lastP[2]);
      startAfter(u, appr, shot.wside);
    } else startBreak(shot.lastP, shot.lastV, shot.L, id);
    markEv();
    return desired(0);
  }
  /* the break-up: in close, a slow orbit round the pieces as they come apart and fall (their centre from the debris
     bodies born with it; the round's own path, slowing and falling, until there are any) */
  function breakShot(dt, age) {
    const W = game.debris && game.debris.world, s = shot;
    let n = 0, cx = 0, cy = 0, cz = 0, ext = 0;
    const inWin = b => b.t0 >= s.t0s - .3 && b.t0 <= s.t0s + 2.2;
    if (W) {
      W.each(b => {
        if (!inWin(b)) return;
        const dx = b.p[0] - s.c[0], dy = b.p[1] - s.c[1], dz = b.p[2] - s.c[2];
        if (dx * dx + dy * dy + dz * dz > 700 * 700) return;
        cx += b.p[0]; cy += b.p[1]; cz += b.p[2]; n++;
      });
    }
    if (n) {
      cx /= n; cy /= n; cz /= n;
      W.each(b => {
        if (!inWin(b)) return;
        const d = Math.hypot(b.p[0] - cx, b.p[1] - cy, b.p[2] - cz);
        if (d < 700) ext = Math.max(ext, d);
      });
      const kk = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
      s.c[0] += (cx - s.c[0]) * kk; s.c[1] += (cy - s.c[1]) * kk; s.c[2] += (cz - s.c[2]) * kk;
    } else {
      // no pieces (yet): where the round would be, slowing and falling
      const tg = Math.max(0, sim.t - s.t0s), dr = Math.exp(-tg * .5);
      for (let i = 0; i < 3; i++) s.c[i] = s.pos[i] + s.vel[i] * (1 - dr) / .5;
      s.c[1] -= 4.9 * tg * tg;
      ext = s.L;
    }
    const g = Math.max(0, game.ground(s.c[0], s.c[2]));
    if (s.c[1] < g + 2) s.c[1] = g + 2;
    const d = clamp(Math.max(s.L * 4.5, ext * 2.3), 22, 260) * (1 + .15 * ss(2, 7, age));
    s.d0 += (d - s.d0) * (dt > 0 ? 1 - Math.exp(-dt * 1.5) : 0);
    const yaw = s.yaw0 + s.spin * age * .16, pitch = clamp(s.pitch0 + .05 * Math.sin(age * .4), 4 * DEG, 40 * DEG);
    orbit(s.c, yaw, pitch, s.d0);
    floorAt(eye, 3);
    near = clamp(s.d0 * .15, .3, 10);
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
    if (!shot || !nKeys || shot.kind === 'round' || shot.kind === 'break') return;
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

  /* the springs to the goal, then the camera: the exact view, and the orbit pose kept with it for the hand-over */
  const OMEGA = { round: 3.6, break: 3, after: 1.8, site: 1.6, death: 1.5, idle: 1.3 };
  function apply(dt) {
    const age = game.realT - rig.t0, wS = OMEGA[shot.kind] || 1.6;
    // soft at the start of a move, then as tight as the shot wants
    const w0 = shot.kind === 'break' ? 2.2 : 1.5, w = wS - (wS - w0) * Math.exp(-age * 1.8);
    // a long move lifts the eye on the way (the pull-back arc), fading as it arrives
    if (rig.init && age < 4) {
      const far = Math.hypot(rig.e[0] - eye[0], rig.e[2] - eye[2]);
      if (far > 1500) eye[1] += Math.min(2500, (far - 1500) * .15) * (1 - age / 4);
    }
    rigStep(dt, w, w * 1.35);
    // the round never leaves the frame, whatever the springs lag: past 17 deg off the lens the look point is turned
    // toward it (a boundary, not a snap: inside it the springs alone move the lens)
    if (subj) {
      const L0 = dist3(rig.l, rig.e);
      up3(tmp, rig.l[0] - rig.e[0], rig.l[1] - rig.e[1], rig.l[2] - rig.e[2]); norm3(tmp);
      up3(tmp2, subj[0] - rig.e[0], subj[1] - rig.e[1], subj[2] - rig.e[2]);
      if (Math.hypot(tmp2[0], tmp2[1], tmp2[2]) > 1) {
        norm3(tmp2);
        const a = Math.acos(clamp(tmp[0] * tmp2[0] + tmp[1] * tmp2[1] + tmp[2] * tmp2[2], -1, 1)), amax = 17 * DEG;
        if (a > amax) {
          mix3(tmp, tmp, tmp2, (a - amax) / a); norm3(tmp);
          for (let k = 0; k < 3; k++) rig.l[k] = rig.e[k] + tmp[k] * L0;
        }
      }
    }
    // a hand on the camera: a slow drift of the look point (sub-degree)
    const t = game.realT, L = dist3(rig.l, rig.e), hk = rig.e[1] < 600 ? 1 : .3;
    const ly = (.0035 * Math.sin(t * .63) + .0022 * Math.sin(t * 1.37 + 1.1)) * hk * L, lx = (.0026 * Math.sin(t * .81 + 2.3) + .0016 * Math.sin(t * 1.9)) * hk * L;
    const f = norm3(up3(tmp, rig.l[0] - rig.e[0], rig.l[1] - rig.e[1], rig.l[2] - rig.e[2]));
    const rx = f[2], rz = -f[0], rl = Math.hypot(rx, rz) || 1;
    w3[0] = rig.l[0] + rx / rl * lx; w3[1] = rig.l[1] + ly; w3[2] = rig.l[2] + rz / rl * lx;
    lookFrom(cam, rig.e, w3, want);
    cur.T[0] = want.T[0]; cur.T[1] = want.T[1]; cur.T[2] = want.T[2];
    cur.dist = want.dist; cur.pitch = want.pitch; cur.yaw = cur.yaw + wrapPi(want.yaw - cur.yaw);
    putCam(cam, cur, follow);
    cam.view = { eye: rig.e.slice(), look: w3.slice(), near: near || undefined };
  }

  /* the watched round's moment is now: the rate holds, the shot stays on it a while */
  function markEv() { pace.mark(); if (shot) shot.evT = game.realT; }

  /* ---------- the time rate: bullet time (B) and the automatic moments ---------- */
  function paceFrame() {
    const r = shot && shot.kind === 'round' ? shot.pr : null;
    // what the rate waits for: an interceptor or a burst (both), the impact (bullet time only: the hit replay takes
    // the automatic ones)
    let tEv = FAR;
    if (r) {
      if (r.kind) tEv = r.tEv;
      if (pin && pin.bullet) tEv = Math.min(tEv, r.tImpact);
      // the moment passed (the interceptor went by, the burst ended): hold
      if (r.kind === 'intercept' && shot.prevEv < .35 && (tEv > shot.prevEv + .6 || (r.src !== shot.prevSrc && shot.prevSrc))) markEv();
      shot.prevEv = tEv; shot.prevSrc = r.src;
    }
    if (pin && pin.bullet) {
      if (!pace.active) { pin.bullet = false; return; }
      if (tEv < FAR) pace.feed(tEv, r && r.kind === 'gun' && tEv === r.tEv ? .3 : 0);
      return;
    }
    // the automatic moment (the cinematic without B): only with the Hit replay setting, as the break-up bullet time
    const auto = game.replay && game.replay.auto !== undefined ? game.replay.auto : !(game.settings && game.settings.hitReplay === false);
    if (!auto || game.result || game.paused || (game.inspect && game.inspect.active) || (game.film && game.film.playing)) return;
    if (pace.active) { if (pace.owner === 'auto' && tEv < FAR) pace.feed(tEv, r.kind === 'gun' ? .4 : 0); return; }
    if (!r || !r.kind || game.realT < autoNext || game.timeRate < 1) return;
    const lead = game.timeRate * Math.min(1.8, Math.max(.6, 2 / Math.sqrt(game.timeRate))) + .2;
    if (tEv < lead) {
      pace.start('auto', { slow: .25, hold: 1.7, up: 1.3 });
      pace.feed(tEv); pace.finish();
      autoNext = game.realT + 12;
    }
  }

  return {
    name: 'director', priority: PRI.director,
    set, get on() { return on; }, get shot() { return shot; },
    /* the player's rounds: the cinematic takes them (the i-th first, then whichever's moment comes next); [] lets go */
    watch(ids, i) {
      ids = (ids || []).filter(id => { const p = sim.projectiles.get(id); return p && p.alive; });
      const bullet = !!(pin && pin.bullet);
      pin = ids.length ? { ids, i: (i || 0) % ids.length, lock: game.realT + 6, bullet } : null;
      if (pin && !on) set(true);
      if (pin) { const p = sim.projectiles.get(ids[pin.i]); if (p) startRound(p); else shot = null; }
      else shot = null;
      lastPick = game.realT;
      game.bus.emit('watch', { ids: pin ? pin.ids.slice() : [], id: pin ? pin.ids[pin.i] : 0 });
      return !!pin;
    },
    get watching() { return pin ? { ids: pin.ids.slice(), i: pin.i, id: pin.ids[pin.i] } : null; },
    /* bullet time on the watched rounds (select.js, B): the rate eases down before each moment, holds, eases back */
    bullet(v, restore) {
      if (v) {
        if (!pin) return false;
        pin.bullet = true;
        if (!pace.active || pace.owner !== 'bullet') { if (pace.active) pace.stop(false); pace.start('bullet', { slow: .1, hold: 2.4, up: 1.6, keep: true }); }
        return true;
      }
      if (pin) pin.bullet = false;
      if (pace.active && pace.owner === 'bullet') pace.stop(restore);
      return true;
    },
    get bulletOn() { return pace.active && pace.owner === 'bullet'; },
    pace,
    get edgeWas() { return edgeWas; }, set edgeWas(v) { edgeWas = v; },
    /* for the replay: glide on from where the camera is now */
    resync() { shot = null; lastPick = -99; rig.init = false; },
    onKey(e) {
      if (e.type !== 'keydown') return false;
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { set(!on); game.bus.emit('toast', { text: on ? 'CINEMATIC' : 'CINEMATIC OFF' }); return true; }
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
      // a break-up (game/debris.js): the moment the intercept already put on the list weighs more; a spin-out or an
      // aircraft coming apart is a moment of its own
      game.bus.on('breakup', b => {
        if (!b || !b.pos) return;
        const r = recent.find(x => x.kind === 'intercept' && Math.abs(x.t - b.t) < .2);
        if (r) r.w = Math.max(r.w, b.w || 7);
        else { recent.push({ kind: 'intercept', pos: b.pos.slice(), t: b.t, w: b.w || 7, unit: b.unit }); if (recent.length > 24) recent.shift(); }
        if (on && shot && shot.kind === 'round' && b.id === shot.id) markEv();
      });
      game.bus.on('result', () => {
        // the end: the last kill, held (the most important of the last few, the command post first); else the command
        // post or carrier the match was lost with, where it went down
        if (lastKill && sim.t - lastKill.t < 90) final = { unit: lastKill.unit, pos: lastKill.pos.slice(), L: lastKill.L, sea: lastKill.sea, t: lastKill.t };
        else if (lastHq) final = { unit: lastHq.unit, pos: lastHq.pos.slice(), L: lastHq.L, sea: lastHq.sea, t: lastHq.t };
        const busy = (game.inspect && game.inspect.active) || (game.film && game.film.playing);
        if (!busy && !on) set(true);
        else if (on) { shot = null; lastPick = -99; }
      });
    },
    onEvent(e) {
      const t = e.t;
      // the watched round's moment is now (a burst on it, a hit, an intercept)
      if (on && shot && shot.kind === 'round') {
        const id = shot.id;
        if ((e.type === 'intercept' && e.proj === id) || (e.type === 'gunhit' && e.target === id) || (e.type === 'hit' && e.proj === id) ||
          (e.type === 'splash' && e.air && (e.proj === id || e.target === id))) markEv();
      }
      let rec = null;
      if (e.type === 'hit') rec = { kind: 'hit', pos: e.pos, t, w: 9, unit: e.target, proj: e.proj };
      else if (e.type === 'destroyed') {
        const u = sim.units.get(e.unit);
        rec = { kind: 'destroyed', pos: e.pos, t, w: u && u.def.domain === 'sea' ? 12 : 8, unit: e.unit };
        if (u && seen(u) || (u && u.side === game.side)) {
          const r = (RANK[u.type] || 1) + (u.def.hq ? 20 : 0);
          if (!lastKill || sim.t - lastKill.t > 30 || r >= lastKill.r) lastKill = { unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea', t: sim.t, r };
          if (u.def.hq) lastHq = { unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea', t: sim.t };
        }
      }
      else if (e.type === 'intercept') rec = { kind: 'intercept', pos: e.pos, t, w: 5 };
      if (!rec) return;
      if (rec.unit) { const u = sim.units.get(rec.unit); if (u && !game.vis(u)) return; }   // only what the player may see
      // the moment we are already framing is not a new subject
      if (shot && (shot.kind === 'round' || shot.kind === 'after') && rec.unit && rec.unit === shot.tgt && rec.kind === 'hit') rec.seen = true;
      if (shot && shot.kind === 'round' && rec.kind === 'intercept' && dist3(rec.pos, shot.lastP) < 400) rec.seen = true;
      recent.push(rec);
      if (recent.length > 24) recent.splice(0, recent.length - 24);
    },
    update(dt) {
      // the break-up bullet time (debris/slowmo.js) stands aside while this one has the rate
      const bt = game.bulletTime;
      if (bt && bt.want && !bt._dirWrap) { const w0 = bt.want; bt.want = b => pace.active ? false : w0.call(bt, b); bt._dirWrap = true; }
      if (!on) { if (pace.active) pace.update(dt); return; }
      if (game.replay && game.replay.active) { waiting = true; pace.update(dt); return; }
      if (waiting) { waiting = false; shot = null; lastPick = -99; rig.init = false; }
      frameCheck(dt);
      if (game.realT - lastPick > .5 || !shot || game.realT > shot.until) pick();
      if (shot) {
        if (!desired(dt)) { shot = null; lastPick = -99; pick(); if (shot && !desired(dt)) shot = null; }
        if (shot) apply(dt);
      }
      paceFrame();
      pace.update(dt);
    },
    draw2d(ov) {
      if (!on || game.getSystem('hud') || (game.replay && game.replay.active)) return;
      ov.text(ov.W - 24 * ov.ui, 30 * ov.ui, 'CINEMATIC · C', { size: 10.5, col: '#C6F432', align: 'right' });
    },
  };
}
