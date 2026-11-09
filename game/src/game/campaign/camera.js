/* Camera flights for the mission scripts: one continuous move through composed shots (no cuts), like the films'
   FILM.path. Keys are { t (real s), T: [x, y, z] | unit | () => [x, y, z], dist, yaw, pitch }; every channel is a
   Hermite curve through the keys (Catmull-Rom tangents inside, still at both ends), distance in log space, yaw
   unwrapped. Any camera input from the player (pan / rotate / zoom keys, wheel, right or middle drag) hands the
   camera back at once, where it is.

   const F = flight(game, keys, { onEnd, hold, handOver })   F.update() each frame (before the camera), F.done, F.cancel()
     hold: the target keeps the keys' height exactly (the camera otherwise eases its target down to the ground)
     handOver: anything else that moves the camera between two frames (edge pan, a drag, a key) ends the flight there

   The match's opening (Combat, Sandbox, a campaign mission without its own intro) is `opening(game, o)`, below. */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);

export function flight(game, keys, o) {
  o = o || {};
  const cam = game.camera, sim = game.sim;
  const K = keys.map(k => Object.assign({}, k));
  let t0 = -1, done = false, T = [0, 0, 0], last = null;
  const hold = () => T;
  const release = () => { if (cam.followFn === hold) cam.followFn = null; };
  // did something other than this flight move the camera since the last frame?
  const moved = () => {
    const g = cam.goal;
    return Math.abs(g.target[0] - last[0]) > .01 || Math.abs(g.target[2] - last[2]) > .01 || Math.abs(g.dist - last[3]) > .01 * last[3] ||
      Math.abs(wrapPi(g.yaw - last[4])) > 1e-4 || Math.abs(g.pitch - last[5]) > 1e-4;
  };
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
    cancel() { if (done) return; done = true; release(); if (o.onEnd) o.onEnd(false); },
    update() {
      if (done) return;
      if (o.handOver && last && moved()) { F.cancel(); return; }
      if (t0 < 0) t0 = game.realT;
      const t = game.realT - t0;
      const P = K.map(posOf);
      const x = chan(P.map(p => p[0]), t), y = chan(P.map(p => p[1]), t), z = chan(P.map(p => p[2]), t);
      const dist = Math.exp(chan(K.map(k => Math.log(k.dist)), t));
      const yaw = chan(K.map(k => k.yaw), t), pitch = chan(K.map(k => k.pitch), t);
      T = [x, y, z];
      cam.fly = null;
      if (o.hold) { cam.followFn = hold; cam.followOff = [0, 0, 0]; } else cam.followFn = null;
      cam.target = T.slice(); cam.goal.target = T.slice();
      cam.dist = cam.goal.dist = Math.max(cam.minDist, Math.min(cam.maxDist, dist));
      cam.yaw = cam.goal.yaw = yaw;
      cam.pitch = cam.goal.pitch = Math.max(cam.minPitch, Math.min(cam.maxPitch, pitch));
      if (o.handOver) last = [T[0], T[1], T[2], cam.goal.dist, cam.goal.yaw, cam.goal.pitch];
      if (t >= K[K.length - 1].t) { done = true; release(); if (o.onEnd) o.onEnd(true); }
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

/* ---------- the match's opening ----------
   Close and low on the command post (the fleet: the carrier; the side's `hq` unit), the subject about a third of the
   frame (the command post from 60-120 m, a ship from about twice its length), the lens off one quarter and looking
   toward the enemy's side of the map. It holds a moment while the loading screen fades, then pulls out, slow and eased,
   to the play view over the core of the force (4.9 s): one continuous move, the Anatomy films' way of opening on a
   subject. Any input (a key, a click, the wheel, an edge pan, a drag) takes the camera at once, where it is.
     const O = opening(game, { fly })   puts the camera on the first frame now (the loading frames warm that view);
                                        O.start() as the picture is revealed; O.cancel(). With fly false (a ?cam=, a
                                        bench, ?ui=0) the camera is put on the play view and null is returned.
   The lens is placed where the ground neither hides the subject nor rises over the lens (slopes, cliffs, a fjord
   wall); a ship is seen from the side away from its island (the deck and the island stand against the sky); the move
   follows the subject's drawn pose (a ship's heave). In a campaign mission the script's intro wins: the opening
   stands down on its first frame if one is flying. */
export const OPENING = { hold: 1.1, mid: 3.3, end: 6 };
export function opening(game, o) {
  o = o || {};
  const { sim, map } = game, cam = game.camera, Tr = game.R.terrain;
  const ground = (x, z) => Math.max(0, Tr.heightAt(x, z));
  const own = sim.alive(game.side).filter(u => !u.aboard && u.def.domain !== 'air');
  const sp = map.spawns[game.side], en = map.spawns[game.enemy];
  const subj = own.find(u => u.def.hq) || own.slice().sort((a, b) => b.def.size[0] - a.def.size[0])[0] || null;
  const c0 = subj ? [subj.pos[0], subj.pos[2]] : [sp.x, sp.z];

  /* the play view: from 21 deg above, looking toward the enemy (the far side and the horizon in the top of the frame),
     as close as frames the core of the force round the subject clear of the HUD's edges (the subject counts twice in
     the centre; the target slides along the view to fit) */
  const core = own.filter(u => Math.hypot(u.pos[0] - c0[0], u.pos[2] - c0[1]) < (game.side === 'fleet' ? 8000 : 2500));
  let cx = c0[0] * 2, cz = c0[1] * 2, n = 2, r = 0;
  for (const u of core) if (u !== subj) { cx += u.pos[0]; cz += u.pos[2]; n++; }
  cx /= n; cz /= n;
  for (const u of core) r = Math.max(r, Math.hypot(u.pos[0] - cx, u.pos[2] - cz));
  const yawE = Math.atan2(en.x - cx, en.z - cz);
  // (a ship is seen off its quarter, not end-on down its wake)
  const play = { dist: clamp(r * 1.3 + 900, 1500, 3600), yaw: yawE - (subj && subj.def.domain === 'sea' ? .42 : .12), pitch: 21 * DEG, T: [cx, 0, cz] };
  {
    const W = cam.W || 1920, H = cam.H || 1080, fl = (H / 2) / Math.tan(cam.fov / 2);
    const sy = Math.sin(play.yaw), cy = Math.cos(play.yaw), cp = Math.cos(play.pitch), sp = Math.sin(play.pitch);
    const f = [sy * cp, -sp, cy * cp], rt = [cy, 0, -sy], up = [f[1] * rt[2] - f[2] * rt[1], f[2] * rt[0] - f[0] * rt[2], f[0] * rt[1] - f[1] * rt[0]];
    const fits = (D, s) => {
      const tx = cx + sy * s, tz = cz + cy * s, e = [tx - f[0] * D, ground(tx, tz) - f[1] * D, tz - f[2] * D];
      for (const u of core) {
        const dx = u.pos[0] - e[0], dy = u.pos[1] + 5 - e[1], dz = u.pos[2] - e[2];
        const z = dx * f[0] + dy * f[1] + dz * f[2];
        if (z < 10) return false;
        const x = W / 2 + fl * (dx * rt[0] + dy * rt[1] + dz * rt[2]) / z, y = H / 2 - fl * (dx * up[0] + dy * up[1] + dz * up[2]) / z;
        if (x < W * .12 || x > W * .88 || y < H * .2 || y > H * .74) return false;
      }
      return true;
    };
    search: for (let D = 1500; D <= 3600 * 1.05; D *= 1.1) {
      for (const k of [0, -.08, .08, -.16, .16, -.24, .24, -.32, .32]) {
        if (fits(D, k * D)) { play.dist = D; play.T = [cx + sy * k * D, 0, cz + cy * k * D]; break search; }
      }
    }
    play.T[1] = ground(play.T[0], play.T[2]);
  }
  const off = [play.T[0] - c0[0], play.T[2] - c0[1]];
  if (!subj || o.fly === false) {
    cam.set({ target: play.T, dist: play.dist, yaw: play.yaw, pitch: play.pitch });
    return null;
  }

  /* the first frame */
  const d = subj.def, ship = d.domain === 'sea', L = d.size[0], top = d.top || d.size[2] || 5;
  const lift = ship ? Math.min(top * .35, 24) : clamp(top * .25, 1.5, 5);
  const d0 = ship ? clamp(L * 1.75, 90, 650) : clamp(L * 3, 60, 120);
  const pose = game.unitPose(subj), hdg = pose.hdg;
  const P0 = [pose.pos[0], pose.pos[1] + lift, pose.pos[2]];
  const yS = Math.atan2(en.x - P0[0], en.z - P0[2]);
  // is the subject in plain view from (yaw, pitch)? The lens above the ground under it, the sight line above the
  // ground all the way in
  function clear(yaw, p) {
    const cp = Math.cos(p), ex = P0[0] - Math.sin(yaw) * cp * d0, ey = P0[1] + Math.sin(p) * d0, ez = P0[2] - Math.cos(yaw) * cp * d0;
    if (ground(ex, ez) > ey - Math.max(3, d0 * .03)) return false;
    for (let i = 1; i < 15; i++) {
      const f = i / 16, x = ex + (P0[0] - ex) * f, z = ez + (P0[2] - ez) * f, y = ey + (P0[1] - ey) * f;
      if (ground(x, z) > y - 1.5) return false;
    }
    return true;
  }
  // low first; off one quarter (a ship: from its port side, away from the island), then wider, then higher
  const OFFS = [.55, .85, .3, 1.15, 0, 1.5, 2, 2.6, Math.PI];
  const PITCH = ship ? [6, 9, 13, 18] : [8, 11, 15, 20, 26, 34];
  let ys = yS - .55, ps = PITCH[PITCH.length - 1] * DEG, found = false;
  for (const pd of PITCH) {
    for (const a of OFFS) {
      for (const s of a ? [-1, 1] : [1]) {
        // a ship: its port quarter first
        const sg = ship ? (wrapPi(yS - a - hdg) < 0 ? s : -s) : s;
        const y = yS + sg * a;
        if (clear(y, pd * DEG)) { ys = y; ps = pd * DEG; found = true; break; }
      }
      if (found) break;
    }
    if (found) break;
  }
  const pin = () => P0;
  cam.set({ target: P0, dist: d0, yaw: ys, pitch: ps });
  cam.follow(pin);                                   // the loading frames hold the subject's height too

  /* the move: hold (a slow creep), then the pull-out. The target leaves the subject for the core of the force in step
     with the distance (its offset stays a fixed share of the view, so the subject never slides out of the frame) */
  const d1 = d0 * 1.07;
  const aim = () => {
    const p = game.unitPose(subj).pos, f = clamp((cam.dist - d1) / (play.dist - d1), 0, 1);
    const x = p[0] + off[0] * f, z = p[2] + off[1] * f;
    return [x, (p[1] + lift) * (1 - f) + ground(x, z) * f, z];
  };
  const sgn = Math.sign(wrapPi(play.yaw - ys)) || 1;
  const Y = [ys, ys + .035 * sgn, 0, 0];
  Y[3] = Y[1] + wrapPi(play.yaw - Y[1]); Y[2] = Y[1] + (Y[3] - Y[1]) * .4;
  const lnD = f => Math.exp(Math.log(d0) + (Math.log(play.dist) - Math.log(d0)) * f);
  const keys = [
    { t: 0, T: aim, dist: d0, yaw: Y[0], pitch: ps },
    { t: OPENING.hold, T: aim, dist: d1, yaw: Y[1], pitch: ps + .3 * DEG },
    { t: OPENING.mid, T: aim, dist: lnD(.4), yaw: Y[2], pitch: ps + (play.pitch - ps) * .35 },
    { t: OPENING.end, T: aim, dist: play.dist, yaw: Y[3], pitch: play.pitch },
  ];

  let F = null, sys = null, first = true;
  const EV = ['keydown', 'pointerdown', 'wheel'];
  function stop() {
    for (const k of EV) removeEventListener(k, onInput, true);
    if (cam.followFn === pin) cam.followFn = null;
    const s = sys; sys = null;
    // out of the frame's system loop (a removal inside it would skip the next system for a frame)
    if (s) Promise.resolve().then(() => game.removeSystem(s));
  }
  function onInput(e) {
    if (e.type === 'keydown' && /^(Shift|Control|Alt|Meta|OS)/.test(e.key || '')) return;   // a modifier alone is not a command
    if (F) F.cancel(); else stop();
  }
  return {
    subject: subj, keys, play,
    get on() { return !!sys; },
    start() {
      if (F || sys) return;
      F = flight(game, keys, { hold: true, handOver: true, onEnd: () => { F = null; stop(); } });
      sys = { name: 'opening', priority: 85,
        update() {
          // a campaign script's own intro has the camera: stand down
          if (first) { first = false; if (game.campaign && game.campaign.intro_) { F.cancel(); return; } }
          if (F) F.update();
        } };
      game.addSystem(sys);
      for (const k of EV) addEventListener(k, onInput, { capture: true, passive: true });
    },
    cancel() { if (F) F.cancel(); else stop(); },
  };
}
