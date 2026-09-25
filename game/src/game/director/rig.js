/* The cinematic rig: the camera helpers shared with the hit replay (replay.js imports them through director.js), and
   the director's camera: an eye and a look point that are always one continuous, smooth move.

   How a shot drives it: every shot has an anchor (its subject's interpolated position: a round, a hull, a meet point),
   and an eye and a look point as offsets from it. The anchor moves the camera exactly (no lag behind a round at Mach 3,
   no feed-forward guesses); the offsets ride critically damped springs (exact solution: frame-rate independent), so a
   reframing is always eased.

   A change of subject is never a jump: the rig keeps the camera it had (its eye and look carried on with the old anchor,
   or, when that is gone, coasting on its last velocity and slowing) and cross-fades to the new shot with a quintic
   ease (zero speed and acceleration change at both ends), the lens turning a little ahead of the eye so the new subject
   is found before the move lands; long moves lift the eye on the way. A new change mid-glide starts from wherever the
   camera is. The output keeps the subject inside the frame with a soft limit (never a clamp that kinks). */

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
/* one axis of a critically damped spring toward a goal moving at gv (exact for a goal moving linearly over dt) */
export function spring(x, v, g, gv, w, dt, k) {
  const e0 = x[k] - g[k], w0 = v[k] - gv[k], ex = Math.exp(-w * dt), a = w0 + w * e0;
  x[k] = g[k] + (e0 + a * dt) * ex; v[k] = gv[k] + (w0 - w * a * dt) * ex;
}

/* ================================================================ the director's camera */
const nrm = o => { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return l; };

export function createRig(game) {
  const cam = game.R.camera;
  const E = [0, 0, 0], L = [0, 0, 0], V = [0, 0, 0], VL = [0, 0, 0], pE = [0, 0, 0], pL = [0, 0, 0];   // the output: eye, look, their velocities (real s)
  // the glide: where the camera was (carried on), the new shot's goal, the ease
  const G = { s: 1, on: false, t: 0, dur: 1, lead: .8, lift: 0, E0: [0, 0, 0], L0: [0, 0, 0], Vr: [0, 0, 0], VLr: [0, 0, 0], A0: [0, 0, 0], Al: [0, 0, 0], Av: [0, 0, 0],
    anchor: null, pending: false, min: 1, max: 3.2 };
  const Ef = [0, 0, 0], Lf = [0, 0, 0], dF = [0, 0, 1], dN = [0, 0, 1], tmp = [0, 0, 0], tv = [0, 0, 0], q = [0, 0, 0];
  let init = false, fresh = true, cA = 0, cV = 0;
  const rig = { E, L, V, dt: 0, get gliding() { return G.on; }, get init() { return init; } };

  /* start from the camera as it is (the director turned on, or handed the camera back by the replay) */
  rig.reset = () => {
    const e = cam.eye, f = cam.f, d = Math.max(50, Math.min(cam.dist || 500, 3000));
    for (let k = 0; k < 3; k++) { E[k] = pE[k] = e[k]; L[k] = pL[k] = e[k] + f[k] * d; V[k] = VL[k] = 0; }
    init = true; fresh = true; G.on = false; G.pending = false; cA = cV = 0;
  };
  /* a new subject: glide from here. anchor(out, vel) -> true while the old subject is there (its position, and its
     velocity in real m/s): the old camera carries on with it; else it coasts on its last velocity, slowing */
  rig.glide = (anchor, o) => {
    if (!init) rig.reset();
    o = o || {};
    G.on = true; G.pending = true; G.t = 0; G.anchor = anchor || null;
    G.min = o.min || 1.1; G.max = o.max || 3.2; G.lead = o.lead || .8;
    for (let k = 0; k < 3; k++) { G.E0[k] = E[k]; G.L0[k] = L[k]; }
    const has = !!(G.anchor && G.anchor(G.A0, G.Av));
    if (!has) G.anchor = null;
    for (let k = 0; k < 3; k++) {
      // the eye is last frame's: so is the anchor it is carried with (this frame's position less this frame's move)
      if (has) G.A0[k] -= G.Av[k] * rig.dt;
      else { G.A0[k] = E[k]; G.Av[k] = V[k]; }
      G.Al[k] = G.A0[k];
      // the camera's own speed over its anchor's, carried into the move and fading: no step in speed at the start
      G.Vr[k] = has ? V[k] - G.Av[k] : 0;
      G.VLr[k] = VL[k] - (has ? G.Av[k] : V[k]);
    }
    cA = cV = 0;     // the turn toward the old subject is in the look the move starts from
  };

  /* the frame: the shot's goal eye En and look Ln (world) -> the output; subj: the point the frame must keep (or null);
     aOut: how far off the lens (rad) it may sit before the soft limit turns the lens toward it */
  rig.frame = (dt, En, Ln, subj, aOut) => {
    if (!init) rig.reset();
    if (fresh) {
      // the first frame: the camera as it is is the glide's start
      fresh = false;
      if (!G.on) rig.glide(null);
    }
    if (G.on) {
      if (G.pending) {
        G.pending = false;
        const d = Math.hypot(En[0] - G.E0[0], En[1] - G.E0[1], En[2] - G.E0[2]);
        // turning the lens counts too: a large turn in place is a move of its own
        up(dF, G.L0[0] - G.E0[0], G.L0[1] - G.E0[1], G.L0[2] - G.E0[2]); nrm(dF);
        up(dN, Ln[0] - En[0], Ln[1] - En[1], Ln[2] - En[2]); nrm(dN);
        const turn = Math.acos(clamp(dF[0] * dN[0] + dF[1] * dN[1] + dF[2] * dN[2], -1, 1));
        G.dur = clamp(.75 + .5 * Math.log(1 + d / 150) + .5 * turn, G.min, G.max + (turn > 1.6 ? .5 : 0));
        // a large turn is spread over the whole move (a slower pan), a small one lands early
        G.lead = turn > 1.6 ? 1 : G.lead;
        G.lift = d > 800 ? Math.min(2500, (d - 800) * .12) : 0;
      }
      G.t += dt;
      // where the old camera would be now
      if (G.anchor && G.anchor(tmp, tv)) for (let k = 0; k < 3; k++) { G.Al[k] = tmp[k]; G.Av[k] = tv[k]; }
      else {
        G.anchor = null;
        const kd = Math.exp(-1.4 * dt);
        for (let k = 0; k < 3; k++) { G.Al[k] += G.Av[k] * dt; G.Av[k] *= kd; }
      }
      const kr = (1 - Math.exp(-2.5 * G.t)) / 2.5;
      for (let k = 0; k < 3; k++) { const dd = G.Al[k] - G.A0[k]; Ef[k] = G.E0[k] + dd + G.Vr[k] * kr; Lf[k] = G.L0[k] + dd + G.VLr[k] * kr; }
      const s = smoother(G.t / G.dur), sl = smoother(G.t / (G.dur * G.lead));
      for (let k = 0; k < 3; k++) E[k] = Ef[k] + (En[k] - Ef[k]) * s;
      E[1] += G.lift * Math.sin(Math.PI * s);
      // the lens: from the old direction to the new shot's own (not to the look point as seen from the moving eye: a
      // move that passes close by the subject would whip round it)
      up(dF, Lf[0] - Ef[0], Lf[1] - Ef[1], Lf[2] - Ef[2]); const lf = nrm(dF);
      up(dN, Ln[0] - En[0], Ln[1] - En[1], Ln[2] - En[2]); const ln = nrm(dN);
      // turned as an operator turns: in heading and in tilt (the horizon stays level, a reverse angle swings round
      // across the horizon rather than through the sky or the sea)
      const y0 = Math.atan2(dF[0], dF[2]), p0 = Math.asin(clamp(dF[1], -1, 1)), y1 = Math.atan2(dN[0], dN[2]), p1 = Math.asin(clamp(dN[1], -1, 1));
      const yw = y0 + wrapPi(y1 - y0) * sl, pt = p0 + (p1 - p0) * sl, cp = Math.cos(pt);
      dF[0] = Math.sin(yw) * cp; dF[1] = Math.sin(pt); dF[2] = Math.cos(yw) * cp;
      const ld = lf + (ln - lf) * s;
      for (let k = 0; k < 3; k++) L[k] = E[k] + dF[k] * ld;
      G.s = s;
      if (G.t >= G.dur) G.on = false;
    } else {
      for (let k = 0; k < 3; k++) { E[k] = En[k]; L[k] = Ln[k]; }
    }
    // above the ground and the swell
    const g = game.ground(E[0], E[2]), fl = Math.max(0, g) + (g > .5 ? 2 : 3.5);
    if (E[1] < fl + 2) E[1] = fl + 2 * Math.exp((E[1] - fl - 2) / 2);   // a soft floor: no kink in the motion
    // the subject stays in the frame: past aOut off the lens the look turns toward it, softly (faded in once a move
    // has landed, so a subject appearing never turns the lens at once; a move keeps to its own lens)
    // the turn toward the subject is a spring of its own (from rest: no turn starts at speed)
    let want = 0, a = 0;
    if (subj && !G.on) {
      up(dF, L[0] - E[0], L[1] - E[1], L[2] - E[2]);
      up(dN, subj[0] - E[0], subj[1] - E[1], subj[2] - E[2]);
      if (nrm(dN) > 1) {
        nrm(dF);
        a = Math.acos(clamp(dF[0] * dN[0] + dF[1] * dN[1] + dF[2] * dN[2], -1, 1));
        const a0 = aOut * .6, span = aOut - a0;
        if (a > a0) want = (a - a0) - span * Math.tanh((a - a0) / span);
      }
    }
    if (dt > 0) {
      const e0 = cA - want, ex = Math.exp(-2.6 * dt), k0 = cV + 2.6 * e0;
      cA = want + (e0 + k0 * dt) * ex; cV = (cV - 2.6 * k0 * dt) * ex;
      if (cA < 0) { cA = 0; if (cV < 0) cV = 0; }
    }
    if (cA > 1e-4 && a > 1e-4) {
      const ld = Math.hypot(L[0] - E[0], L[1] - E[1], L[2] - E[2]);
      slerp(dF, dF, dN, Math.min(1, cA / a));
      for (let k = 0; k < 3; k++) L[k] = E[k] + dF[k] * ld;
    }
    if (dt > 0) for (let k = 0; k < 3; k++) { V[k] = (E[k] - pE[k]) / dt; pE[k] = E[k]; VL[k] = (L[k] - pL[k]) / dt; pL[k] = L[k]; }
    return rig;
  };
  return rig;
  function up(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
  /* unit a toward unit b by u (0..1), along the great circle */
  function slerp(o, a, b, u) {
    let c = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    if (u <= 0) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
    if (c > .9995) { for (let k = 0; k < 3; k++) o[k] = a[k] + (b[k] - a[k]) * u; nrm(o); return o; }
    if (c < -.999) { b = [b[0] + .05, b[1] + .05, b[2]]; nrm(b); c = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1); }   // opposite: turn by way of one side (rare)
    const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - u) * th) / s, wb = Math.sin(u * th) / s;
    for (let k = 0; k < 3; k++) q[k] = a[k] * wa + b[k] * wb;
    o[0] = q[0]; o[1] = q[1]; o[2] = q[2]; nrm(o);
    return o;
  }
}
