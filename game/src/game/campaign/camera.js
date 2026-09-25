/* Camera flights for the mission scripts: one continuous move through composed shots (no cuts), like the films'
   FILM.path. Keys are { t (real s), T: [x, y, z] | unit | () => [x, y, z], dist, yaw, pitch }; every channel is a
   Hermite curve through the keys (Catmull-Rom tangents inside, still at both ends), distance in log space, yaw
   unwrapped. Any camera input from the player (pan / rotate / zoom keys, wheel, right or middle drag) hands the
   camera back at once, where it is.

   const F = flight(game, keys, { onEnd })   F.update() each frame (before the camera), F.done, F.cancel() */

const TAU = Math.PI * 2;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
export const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);

export function flight(game, keys, o) {
  o = o || {};
  const cam = game.camera, sim = game.sim;
  const K = keys.map(k => Object.assign({}, k));
  let t0 = -1, done = false, T = [0, 0, 0];
  // unwrap the yaws so the move takes the short way round from one key to the next
  for (let i = 1; i < K.length; i++) K[i].yaw = K[i - 1].yaw + wrapPi(K[i].yaw - K[i - 1].yaw);

  function posOf(k) {
    const x = k.T;
    if (typeof x === 'function') return x();
    if (x && x.pos) { const p = game.unitPose(x).pos; return [p[0], p[1] + (k.lift || 0), p[2]]; }
    return x;
  }
  // a channel's value at time t: cubic Hermite with monotone tangents (no overshoot: a channel that holds between
  // two keys stays put), still at both ends
  function chan(vals, t) {
    const n = K.length;
    if (t <= K[0].t) return vals[0];
    if (t >= K[n - 1].t) return vals[n - 1];
    let i = 0; while (i < n - 2 && t > K[i + 1].t) i++;
    const t0_ = K[i].t, t1 = K[i + 1].t, h = t1 - t0_, u = (t - t0_) / h;
    const m = j => {
      if (j <= 0 || j >= n - 1) return 0;
      const d0 = (vals[j] - vals[j - 1]) / (K[j].t - K[j - 1].t), d1 = (vals[j + 1] - vals[j]) / (K[j + 1].t - K[j].t);
      if (d0 * d1 <= 0) return 0;
      return 2 / (1 / d0 + 1 / d1) * h;
    };
    const p0 = vals[i], p1 = vals[i + 1], m0 = m(i), m1 = m(i + 1);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  }
  const F = {
    get done() { return done; },
    cancel() { if (done) return; done = true; if (o.onEnd) o.onEnd(false); },
    update() {
      if (done) return;
      if (t0 < 0) t0 = game.realT;
      const t = game.realT - t0;
      const P = K.map(posOf);
      const x = chan(P.map(p => p[0]), t), y = chan(P.map(p => p[1]), t), z = chan(P.map(p => p[2]), t);
      const dist = Math.exp(chan(K.map(k => Math.log(k.dist)), t));
      const yaw = chan(K.map(k => k.yaw), t), pitch = chan(K.map(k => k.pitch), t);
      T[0] = x; T[1] = y; T[2] = z;
      cam.fly = null; cam.followFn = null;
      cam.target = T.slice(); cam.goal.target = T.slice();
      cam.dist = cam.goal.dist = Math.max(cam.minDist, Math.min(cam.maxDist, dist));
      cam.yaw = cam.goal.yaw = yaw;
      cam.pitch = cam.goal.pitch = Math.max(cam.minPitch, Math.min(cam.maxPitch, pitch));
      if (t >= K[K.length - 1].t) { done = true; if (o.onEnd) o.onEnd(true); }
    },
    /* the player touched the camera: stop here */
    onKey(e) { if (!done && e.type === 'keydown' && CAM_KEYS.has(e.code)) F.cancel(); },
    onPointer(ev) { if (!done && ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel')) F.cancel(); },
  };
  return F;
}

/* a still of the camera now, as a key */
export function camKey(game, t) {
  const c = game.camera;
  return { t, T: c.target.slice(), dist: c.dist, yaw: c.yaw, pitch: c.pitch };
}
