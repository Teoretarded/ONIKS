/* Debrief: the camera. The film maker's exact-view rig (filmmaker.js: the RTS camera's orbit state written from the
   take, then the exact eye, look, fov and roll set after the camera's own update, so every overlay projects with it),
   and the subjects a key can ride on.

   A key: { t, eye: S, look: S, fov }  where S is a world point [x, y, z] or a subject point
     { u: unitId | p: projId, o: [a, b, c], fr: 'w' | 'b', at: [x, y, z] }
       fr 'w': o is a world offset from the subject; 'b': [right, up, forward] in the subject's heading frame.
       at: where the point is while the subject is not there (before a launch, after the round is gone).
     { mid: [S, S], k }  k of the way from the first point to the second.
   A subject that goes (a round that hit, a hull removed) keeps its last place. */
import { evalPath } from '../filmmaker/path.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2, R_EARTH = 6371000;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);

export function createView(game) {
  const cam = game.R.camera, sim = game.sim;
  const fov0 = cam.fov;
  const ov = { on: false, eye: [0, 0, 0], look: [0, 0, 100], fov: fov0, roll: 0 };
  const hadOwn = Object.prototype.hasOwnProperty.call(cam, 'update');
  const base = cam.update;
  cam.update = function (dt) {
    const r = base.call(this, dt);
    if (ov.on) exact(this);
    return r;
  };
  function exact(c) {
    const e = ov.eye, l = ov.look;
    let fx = l[0] - e[0], fy = l[1] - e[1], fz = l[2] - e[2];
    const D = Math.hypot(fx, fy, fz) || 1; fx /= D; fy /= D; fz /= D;
    let rx = fz, rz = -fx, rl = Math.hypot(rx, rz);
    if (rl < 1e-6) { rx = Math.cos(c.yaw); rz = -Math.sin(c.yaw); rl = 1; }
    rx /= rl; rz /= rl;
    let ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;
    let r0 = rx, r1 = 0, r2 = rz;
    if (ov.roll) {
      const cs = Math.cos(ov.roll), sn = Math.sin(ov.roll);
      const nr0 = r0 * cs + ux * sn, nr1 = r1 * cs + uy * sn, nr2 = r2 * cs + uz * sn;
      ux = ux * cs - r0 * sn; uy = uy * cs - r1 * sn; uz = uz * cs - r2 * sn;
      r0 = nr0; r1 = nr1; r2 = nr2;
    }
    c.eye = [e[0], e[1], e[2]]; c.f = [fx, fy, fz]; c.r = [r0, r1, r2]; c.u = [ux, uy, uz];
    c.fov = ov.fov; c.fl = (c.H / 2) / Math.tan(ov.fov / 2); c.tilt = 0;
    c.dist = clamp(D, c.minDist, c.maxDist);
    const g = Math.max(0, c.ground(e[0], e[2])), clear = Math.max(.5, e[1] - g);
    c.clearance = clear;
    c.near = clamp(Math.min(D * .02, clear * .4), .03, 200);
    c.far = Math.max(60000, Math.sqrt(2 * R_EARTH * Math.max(1, e[1])) * 1.25 + D * 3);
  }
  /* the orbit state that shows (about) this view: consistent for everything that reads the orbit, and a hand-over
     without a jump */
  function orbitTo(eye, look) {
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
    const h = Math.max(1e-6, Math.hypot(dx, dz)), L = Math.max(1, Math.hypot(h, dy));
    const yaw = Math.atan2(dx, dz), mp = cam.minPitch;
    let el = Math.atan2(-dy, h), T = look, D = L;
    if (el < mp) {
      el = Math.max(el, mp - (cam.lookUp || 0) + .6 * DEG);
      const g = Math.max(0, cam.ground(eye[0], eye[2])), clear = Math.max(2, eye[1] - g);
      D = clamp(Math.min(L, clear * 80), Math.max(cam.minDist, 20), (cam.lookUpNear || 2500) * .96);
      const c = Math.cos(mp);
      T = [eye[0] + Math.sin(yaw) * c * D, eye[1] - Math.sin(mp) * D, eye[2] + Math.cos(yaw) * c * D];
    }
    cam.fly = null; cam.followFn = null; cam.followOff = [0, 0, 0];
    const b = cam.bounds, tx = b ? clamp(T[0], b[0], b[2]) : T[0], tz = b ? clamp(T[2], b[1], b[3]) : T[2];
    cam.target[0] = cam.goal.target[0] = tx; cam.target[1] = cam.goal.target[1] = T[1]; cam.target[2] = cam.goal.target[2] = tz;
    const d = clamp(D, cam.minDist, cam.maxDist);
    cam.dist = cam.goal.dist = d;
    cam.yaw = cam.goal.yaw = cam.yaw + wrapPi(yaw - cam.yaw);
    cam.pitch = cam.goal.pitch = clamp(el, cam.pitchMin ? cam.pitchMin(d) : mp, cam.maxPitch);
  }
  /* the view on screen now (the exact one, else the orbit camera's) */
  function current() {
    if (ov.on) return { eye: ov.eye.slice(), look: ov.look.slice(), fov: ov.fov / DEG };
    const e = cam.eye.slice(), f = cam.f, D = cam.dist || 500;
    const look = cam.tilt > 0 || !cam.target ? [e[0] + f[0] * D, e[1] + f[1] * D, e[2] + f[2] * D] : cam.target.slice();
    return { eye: e, look, fov: cam.fov / DEG };
  }
  function put(eye, look, fovDeg, rollDeg) {
    for (let c = 0; c < 3; c++) { ov.eye[c] = eye[c]; ov.look[c] = look[c]; }
    ov.fov = clamp(fovDeg || 40, 5, 100) * DEG; ov.roll = (rollDeg || 0) * DEG;
    ov.on = true;
    orbitTo(ov.eye, ov.look);
  }
  function release() {
    if (!ov.on) return;
    orbitTo(ov.eye, ov.look);
    ov.on = false;
    cam.fov = fov0;
  }

  /* ------------------------------------------------------------------ subjects */
  const cache = new Map();
  function projHdg(p) {
    const v = p.vel;
    if (v) { const h = Math.hypot(v[0], v[2]), s = Math.hypot(h, v[1]); if (s > 1 && h > .3 * s) return Math.atan2(v[0], v[2]); }
    if (Number.isFinite(p.hdg)) return p.hdg;
    const a = p.aim, f = p.fromPos;
    return a && f ? Math.atan2(a[0] - f[0], a[2] - f[2]) : 0;
  }
  /* { pos, hdg, live } of a unit or a round now (the last known once it is gone); null if never seen */
  function subject(spec) {
    const isP = spec.p !== undefined, id = isP ? spec.p : spec.u, key = (isP ? 'p' : 'u') + id;
    let s = cache.get(key), live = null, raw = 0;
    if (isP) { const p = sim.projectiles.get(id); if (p && p.alive) { live = game.projPose(p).pos; raw = projHdg(p); } }
    else { const u = sim.units.get(id); if (u && !u.aboard) { const q = game.unitPose(u); live = q.pos; raw = q.hdg; } }
    if (live) {
      if (!s) { s = { pos: live.slice(), hdg: raw, f: game.frameN, live: true }; cache.set(key, s); }
      else if (s.f !== game.frameN) {
        s.pos[0] = live[0]; s.pos[1] = live[1]; s.pos[2] = live[2];
        // a round's heading is eased (a chase camera does not snap round with every correction)
        s.hdg = isP ? s.hdg + wrapPi(raw - s.hdg) * (1 - Math.exp(-Math.max(game.dtReal, 1 / 60) * 2.4)) : raw;
        s.f = game.frameN; s.live = true;
      }
    } else if (s) s.live = false;
    return s || null;
  }
  const MA = [0, 0, 0], MB = [0, 0, 0];
  function point(S, out) {
    if (Array.isArray(S)) { out[0] = S[0]; out[1] = S[1]; out[2] = S[2]; return out; }
    if (S.mid) {
      // a point between two others (k of the way from the first): a launcher and the round leaving it both in frame
      point(S.mid[0], MA); point(S.mid[1], MB);
      const k = S.k === undefined ? .5 : S.k;
      for (let c = 0; c < 3; c++) out[c] = MA[c] + (MB[c] - MA[c]) * k;
      return out;
    }
    const s = subject(S), o = S.o || [0, 0, 0];
    if (!s) { const a = S.at || [0, 0, 0]; out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
    if (S.fr === 'b') {
      const sn = Math.sin(s.hdg), cs = Math.cos(s.hdg);
      out[0] = s.pos[0] + cs * o[0] + sn * o[2]; out[1] = s.pos[1] + o[1]; out[2] = s.pos[2] - sn * o[0] + cs * o[2];
    } else { out[0] = s.pos[0] + o[0]; out[1] = s.pos[1] + o[1]; out[2] = s.pos[2] + o[2]; }
    return out;
  }
  const RK = [];
  const OUT = { eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0, i: 0, u: 0 };
  const OPT = { loop: false, gap: 1, ease: 'clamped' };
  /* the shot's view at shot time t: keys resolved against the subjects now, the films' Hermite path through them;
     the eye kept off the ground and the swell */
  function pathAt(keys, t) {
    while (RK.length < keys.length) RK.push({ t: 0, eye: [0, 0, 0], look: [0, 0, 0], fov: 40, roll: 0 });
    RK.length = keys.length;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], r = RK[i];
      r.t = k.t; r.fov = k.fov || 40; r.roll = k.roll || 0;
      point(k.eye, r.eye); point(k.look, r.look);
    }
    evalPath(RK, t, OPT, OUT);
    const g = game.ground(OUT.eye[0], OUT.eye[2]), lo = g > .5 ? g + 2 : 3;
    if (OUT.eye[1] < lo) OUT.eye[1] = lo;
    return OUT;
  }

  return {
    ov, put, release, current, subject, point, pathAt, orbitTo,
    dispose() { if (hadOwn) cam.update = base; else delete cam.update; },
  };
}

export { DEG, clamp, wrapPi };
