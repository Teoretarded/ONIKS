/* The cinematic rig: the camera helpers shared with the hit replay (replay.js imports them through director.js), and
   the director's camera: an eye and a look point that are always one continuous, smooth move.

   How a shot drives it: every shot has an anchor (its subject's interpolated position: a round, a hull, a meet point),
   and an eye and a look point as offsets from it. The anchor moves the camera exactly (no lag behind a round at Mach 3,
   no feed-forward guesses); the offsets ride critically damped springs (exact solution: frame-rate independent), so a
   reframing is always eased.

   A change of subject is a blend (or, for a long move, a cut: game/director.js): the rig keeps stepping the old shot
   while its subject lasts (else a carry or a coasting ghost: createRig below) and cross-fades to the new one with a
   quintic ease (zero speed and acceleration change at both ends), the lens turning a little ahead of the eye so the new
   subject is found before the move lands. A new change mid-blend starts from wherever the camera is. The output keeps
   the subject inside the frame with a soft limit (never a clamp that kinks). */

export const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
export const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
export const smoother = u => { u = sat(u); return u * u * u * (u * (u * 6 - 15) + 10); };

/* ================================================================ orbit poses (shared with the replay) */
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

/* ================================================================ springs */
/* one axis of a critically damped spring toward a goal moving at gv (exact for a goal moving linearly over dt): x, v
   are last frame's, g this frame's goal (so last frame's was g - gv dt) */
export function spring(x, v, g, gv, w, dt, k) {
  const e0 = x[k] - g[k] + gv[k] * dt, w0 = v[k] - gv[k], ex = Math.exp(-w * dt), a = w0 + w * e0;
  x[k] = g[k] + (e0 + a * dt) * ex; v[k] = gv[k] + (w0 - w * a * dt) * ex;
}

/* ================================================================ the director's camera */
const nrm = o => { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return l; };

/* createRig(game, stepShot) -> rig. stepShot(sh, dt) -> bool steps a shot (shots.js step): the rig steps the outgoing
   shot itself while a blend runs. Every frame: rig.frame(dt, shot) -> rig.E, rig.L (eye, look), rig.K (lens factor).
     rig.reset()                     start from the camera as it is (the next shot blends from there, at rest)
     rig.blend(prev, o)              a new shot from here: o = { dur, lead, carry (anchor fn: the old view carried
                                     with it, e.g. the pieces of the round the camera rode), min, max }
     rig.cut()                       the new shot at once (a cut; the director dips the picture for it)
   What the blend starts from, in this order: the old shot itself, live, while its subject lasts (two framings of one
   round blend with no drift between them); a carry (the old view's offsets ride a new anchor: the camera that rode a
   round rides on with its pieces); else a ghost: the view as it was, coasting on its own velocity and slowing. A live
   old shot that loses its subject mid-blend turns into a ghost from where it was, with its speed. */
export function createRig(game, stepShot) {
  const cam = game.R.camera;
  const E = [0, 0, 0], L = [0, 0, 0], V = [0, 0, 0], VL = [0, 0, 0], pE = [0, 0, 0], pL = [0, 0, 0];
  const B = { on: false, t: 0, dur: 1, lead: .8, lift: 0, prev: null, mode: 'ghost', carry: null,
    E: [0, 0, 0], L: [0, 0, 0], K: 1, vE: [0, 0, 0], vL: [0, 0, 0], A0: [0, 0, 0], Av: [0, 0, 0], pending: false, min: 1, max: 3 };
  const Ef = [0, 0, 0], Lf = [0, 0, 0], dF = [0, 0, 1], dN = [0, 0, 1], tmp = [0, 0, 0], tv = [0, 0, 0], q = [0, 0, 0];
  let init = false, fresh = true, cA = 0, cV = 0, K = 1;
  const rig = { E, L, V, dt: 0, get K() { return K; }, get gliding() { return B.on; }, get init() { return init; }, get blendS() { return B.on ? B.s || 0 : 1; }, B };

  rig.reset = () => {
    const e = cam.eye, f = cam.f, d = Math.max(50, Math.min(cam.dist || 500, 3000));
    for (let k = 0; k < 3; k++) { E[k] = pE[k] = e[k]; L[k] = pL[k] = e[k] + f[k] * d; V[k] = VL[k] = 0; }
    K = 1; init = true; fresh = true; B.on = false; cA = cV = 0;
  };
  /* the view the blend starts from: the rig's output as it is now, with its velocity (a ghost) */
  function ghostFromOutput() {
    for (let k = 0; k < 3; k++) { B.E[k] = E[k]; B.L[k] = L[k]; B.vE[k] = V[k]; B.vL[k] = VL[k]; }
    B.K = K; B.mode = 'ghost'; B.prev = null;
  }
  rig.blend = (prev, o) => {
    if (!init) rig.reset();
    o = o || {};
    // a blend that starts mid-blend starts from the picture as it is (a ghost of the output)
    const mid = B.on;
    B.on = true; B.pending = true; B.t = 0; B.s = 0;
    B.min = o.min || 1; B.max = o.max || 3; B.lead = o.lead || .8; B.dur = o.dur || 0;
    if (!mid && prev && prev.init && !o.carry) { B.mode = 'live'; B.prev = prev; }
    else if (o.carry && o.carry(B.A0, B.Av)) {
      // the old view's offsets from the new anchor (as it was last frame: less this frame's move)
      for (let k = 0; k < 3; k++) { B.A0[k] -= B.Av[k] * (rig.dt || 0); B.E[k] = E[k] - B.A0[k]; B.L[k] = L[k] - B.A0[k]; }
      B.K = K; B.mode = 'carry'; B.carry = o.carry; B.prev = null;
    } else ghostFromOutput();
    if (fresh) fresh = false;
  };
  rig.cut = () => { B.on = false; fresh = false; cA = cV = 0; rig.cutNow = true; };

  /* the view the blend comes from, this frame -> Ef, Lf, returns its lens factor */
  function fromView(dt) {
    if (B.mode === 'live') {
      const p = B.prev;
      if (stepShot(p, dt)) { for (let k = 0; k < 3; k++) { Ef[k] = p.En[k]; Lf[k] = p.Ln[k]; } B.lastK = p.fov || 1; return B.lastK; }
      // its subject is gone: a ghost from where it last was, at the speed it had
      for (let k = 0; k < 3; k++) { B.E[k] = p.En[k]; B.L[k] = p.Ln[k]; B.vE[k] = p.vEn ? p.vEn[k] : 0; B.vL[k] = p.vLn ? p.vLn[k] : 0; }
      B.K = B.lastK || 1; B.mode = 'ghost'; B.prev = null;
    }
    if (B.mode === 'carry') {
      if (B.carry(tmp, tv)) { for (let k = 0; k < 3; k++) { Ef[k] = tmp[k] + B.E[k]; Lf[k] = tmp[k] + B.L[k]; B.Av[k] = tv[k]; B.A0[k] = tmp[k]; } return B.K; }
      for (let k = 0; k < 3; k++) { B.E[k] += B.A0[k]; B.L[k] += B.A0[k]; B.vE[k] = B.vL[k] = B.Av[k]; }
      B.mode = 'ghost';
    }
    // a ghost: coasting on its velocity, slowing (a camera operator easing off)
    const kd = Math.exp(-2.2 * dt);
    for (let k = 0; k < 3; k++) { B.E[k] += B.vE[k] * dt; B.L[k] += B.vL[k] * dt; B.vE[k] *= kd; B.vL[k] *= kd; Ef[k] = B.E[k]; Lf[k] = B.L[k]; }
    return B.K;
  }

  /* the frame: the shot's goal eye sh.En and look sh.Ln (world) -> the output */
  rig.frame = (dt, sh) => {
    if (!init) rig.reset();
    const En = sh.En, Ln = sh.Ln, Kn = sh.fov || 1;
    rig.cutNow = false;
    if (fresh) { fresh = false; ghostFromOutput(); B.on = true; B.pending = true; B.t = 0; B.min = 1.2; B.max = 3; B.lead = .8; B.dur = 0; }
    if (B.on) {
      const Kf = fromView(dt);
      if (B.pending) {
        B.pending = false;
        const d = Math.hypot(En[0] - Ef[0], En[1] - Ef[1], En[2] - Ef[2]);
        up(dF, Lf[0] - Ef[0], Lf[1] - Ef[1], Lf[2] - Ef[2]); nrm(dF);
        up(dN, Ln[0] - En[0], Ln[1] - En[1], Ln[2] - En[2]); nrm(dN);
        const turn = Math.acos(clamp(dF[0] * dN[0] + dF[1] * dN[1] + dF[2] * dN[2], -1, 1));
        // the time a move takes: its length and its turn (a large turn in place is a move of its own), unless given
        if (!B.dur) B.dur = clamp(.85 + .48 * Math.log(1 + d / 120) + .55 * turn, B.min, B.max + (turn > 1.6 ? .6 : 0));
        if (turn > 1.6) B.lead = 1;
        B.lift = d > 900 ? Math.min(1800, (d - 900) * .1) : 0;
      }
      B.t += dt;
      const s = smoother(B.t / B.dur), sl = smoother(B.t / (B.dur * B.lead));
      B.s = s;
      for (let k = 0; k < 3; k++) E[k] = Ef[k] + (En[k] - Ef[k]) * s;
      E[1] += B.lift * Math.sin(Math.PI * s);
      // the lens turned as an operator turns it: in heading and in tilt, the horizon level
      up(dF, Lf[0] - Ef[0], Lf[1] - Ef[1], Lf[2] - Ef[2]); const lf = nrm(dF);
      up(dN, Ln[0] - En[0], Ln[1] - En[1], Ln[2] - En[2]); const ln = nrm(dN);
      const y0 = Math.atan2(dF[0], dF[2]), p0 = Math.asin(clamp(dF[1], -1, 1)), y1 = Math.atan2(dN[0], dN[2]), p1 = Math.asin(clamp(dN[1], -1, 1));
      const yw = y0 + wrapPi(y1 - y0) * sl, pt = p0 + (p1 - p0) * sl, cp = Math.cos(pt);
      dF[0] = Math.sin(yw) * cp; dF[1] = Math.sin(pt); dF[2] = Math.cos(yw) * cp;
      const ld = Math.exp(Math.log(Math.max(1, lf)) + (Math.log(Math.max(1, ln)) - Math.log(Math.max(1, lf))) * s);
      for (let k = 0; k < 3; k++) L[k] = E[k] + dF[k] * ld;
      K = Math.exp(Math.log(Kf) + (Math.log(Kn) - Math.log(Kf)) * sl);
      if (B.t >= B.dur) { B.on = false; B.prev = null; }
    } else {
      for (let k = 0; k < 3; k++) { E[k] = En[k]; L[k] = Ln[k]; }
      K = Kn;
    }
    // above the ground and the swell: a soft floor (no kink in the motion)
    const g = game.ground(E[0], E[2]), fl = Math.max(0, g) + (g > .5 ? 1.5 : 2.5);
    if (E[1] < fl + 2) E[1] = fl + 2 * Math.exp((E[1] - fl - 2) / 2);
    if (dt > 0) for (let k = 0; k < 3; k++) { V[k] = (E[k] - pE[k]) / dt; VL[k] = (L[k] - pL[k]) / dt; pE[k] = E[k]; pL[k] = L[k]; }
    if (rig.cutNow) for (let k = 0; k < 3; k++) V[k] = VL[k] = 0;
    rig.dt = dt;
    return rig;
  };
  return rig;
  function up(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
  /* unit a toward unit b by u (0..1), along the great circle */
  function slerp(o, a, b, u) {
    let c = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    if (u <= 0) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
    if (c > .9995) { for (let k = 0; k < 3; k++) o[k] = a[k] + (b[k] - a[k]) * u; nrm(o); return o; }
    if (c < -.999) { b = [b[0] + .05, b[1] + .05, b[2]]; nrm(b); c = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1); }
    const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - u) * th) / s, wb = Math.sin(u * th) / s;
    for (let k = 0; k < 3; k++) q[k] = a[k] * wa + b[k] * wb;
    o[0] = q[0]; o[1] = q[1]; o[2] = q[2]; nrm(o);
    return o;
  }
}
