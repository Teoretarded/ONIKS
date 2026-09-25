/* RTS camera: orbits a ground target. Full 360 degree yaw, pitch 3..89 degrees, distance 20 m .. 150 km
   (exponential zoom toward the cursor), pan with WASD / arrows / screen edges / middle-drag, rotate with
   right-drag and Q/E, smooth damping, follow, fly-to, frame a set of points. Picking: screen -> ground (with
   the Earth's curvature, as drawn), project() for overlays.
   M3 conventions: X east, Y up, Z north; yaw 0 looks north, pi/2 looks east; pitch > 0 looks down. */

const DEG = Math.PI / 180;
const R_EARTH = 6371000;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

export class RTSCamera {
  constructor(opts) {
    opts = opts || {};
    this.fov = (opts.fov || 40) * DEG;              // vertical
    this.minDist = opts.minDist || 20;
    this.maxDist = opts.maxDist || 150000;
    this.minPitch = 3 * DEG;
    this.maxPitch = 89 * DEG;
    this.ground = opts.ground || (() => 0);          // (x, z) -> surface height (sea = 0)
    this.bounds = opts.bounds || null;               // [x0, z0, x1, z1] the target stays inside
    this.target = (opts.target || [0, 0, 0]).slice();
    this.yaw = opts.yaw || 0;
    this.pitch = opts.pitch !== undefined ? opts.pitch : 35 * DEG;
    this.dist = opts.dist || 1500;
    this.goal = { target: this.target.slice(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.rate = { pan: 12, rot: 12, zoom: 9 };
    this.keys = true;                                // the game can switch keyboard control off
    this.invert = false;                             // settings.invertRotate: right-drag and Q / E turn the other way
    this.edge = opts.edge !== false;
    this.edgePx = 10;
    this.W = 1920; this.H = 1080;                    // CSS px of the view
    this.eye = [0, 0, 0]; this.f = [0, 0, 1]; this.r = [1, 0, 0]; this.u = [0, 1, 0];
    this.fl = 1; this.near = .1; this.far = 1e6;
    this.followFn = null; this.followOff = [0, 0, 0];
    this.fly = null;
    this.down = new Set();
    this.mouse = { x: 0, y: 0, in: false, moved: false, btn: -1, lx: 0, ly: 0, grab: null };
    this.onClick = null;                             // (sx, sy, button, event) for left/right clicks without drag
    this.update(0);
  }

  /* ---------- input ---------- */
  attach(el) {
    this.el = el;
    const key = e => (e.code || e.key);
    const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    this._kd = e => { if (typing(e)) return; this.down.add(key(e)); };
    this._ku = e => { this.down.delete(key(e)); };
    this._blur = () => { this.down.clear(); this.mouse.btn = -1; this.mouse.in = false; };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    const pos = e => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mousedown', e => {
      const [x, y] = pos(e); const m = this.mouse;
      m.btn = e.button; m.lx = x; m.ly = y; m.sx = x; m.sy = y; m.drag = 0;
      if (e.button === 1) { e.preventDefault(); const g = this.pickGround(x, y); m.grab = g ? g.slice() : null; this.followFn = null; this.fly = null; }
    });
    window.addEventListener('mouseup', e => {
      const m = this.mouse;
      if (m.btn >= 0 && m.drag < 5 && this.onClick) { const [x, y] = pos(e); this.onClick(x, y, m.btn, e); }
      m.btn = -1; m.grab = null;
    });
    window.addEventListener('mousemove', e => {
      const [x, y] = pos(e); const m = this.mouse;
      m.x = x; m.y = y; m.moved = true;
      m.in = x >= 0 && y >= 0 && x < this.W && y < this.H;
      if (m.btn < 0) return;
      const dx = x - m.lx, dy = y - m.ly; m.lx = x; m.ly = y; m.drag += Math.abs(dx) + Math.abs(dy);
      if (m.btn === 2 && m.drag > 4) {
        this.goal.yaw += dx * .0055 * (this.invert ? -1 : 1);
        this.goal.pitch = clamp(this.goal.pitch + dy * .0045, this.minPitch, this.maxPitch);
      } else if (m.btn === 1 && m.grab) this._dragPan(x, y);
    });
    el.addEventListener('mouseleave', () => { this.mouse.in = false; });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = pos(e);
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.zoomAt(x, y, Math.exp(clamp(d, -600, 600) * .0016));
    }, { passive: false });
    return this;
  }
  detach() {
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); window.removeEventListener('blur', this._blur);
  }

  /* zoom by factor k (< 1 in) about the ground point under (sx, sy) */
  zoomAt(sx, sy, k) {
    const g = this.goal, d0 = g.dist, d1 = clamp(d0 * k, this.minDist, this.maxDist);
    const q = d1 / d0;
    if (sx !== undefined && !this.followFn) {
      const p = this.pickGround(sx, sy);
      if (p && Math.hypot(p[0] - g.target[0], p[2] - g.target[2]) < 6 * d0) {
        g.target[0] += (p[0] - g.target[0]) * (1 - q);
        g.target[2] += (p[2] - g.target[2]) * (1 - q);
      }
    }
    g.dist = d1; this.fly = null;
  }
  _dragPan(x, y) {
    const m = this.mouse, gy = m.grab[1];
    const ray = this.ray(x, y);
    if (ray.d[1] > -1e-4) return;
    const t = (gy - ray.o[1]) / ray.d[1];
    if (t <= 0 || t > 4e6) return;
    const px = ray.o[0] + ray.d[0] * t, pz = ray.o[2] + ray.d[2] * t;
    const dx = m.grab[0] - px, dz = m.grab[2] - pz;
    this.target[0] += dx; this.target[2] += dz; this.goal.target[0] += dx; this.goal.target[2] += dz;
    this._pose();
  }

  /* ---------- commands ---------- */
  /* follow a moving object: fn() -> [x, y, z] (null stops); the target keeps the offset it has now if keepOffset */
  follow(fn, keepOffset) {
    this.followFn = fn; this.fly = null;
    if (fn && keepOffset) { const p = fn(); if (p) this.followOff = [this.goal.target[0] - p[0], 0, this.goal.target[2] - p[2]]; }
    else this.followOff = [0, 0, 0];
  }
  /* fly to a target (and optionally dist / yaw / pitch), with a pull-back arc on long moves */
  flyTo(target, o) {
    o = o || {};
    const g = this.goal;
    const from = { target: this.target.slice(), dist: this.dist, yaw: this.yaw, pitch: this.pitch };
    const to = {
      target: [target[0], target[1] !== undefined ? target[1] : this.ground(target[0], target[2]), target[2]],
      dist: clamp(o.dist || g.dist, this.minDist, this.maxDist),
      yaw: o.yaw !== undefined ? from.yaw + wrapPi(o.yaw - from.yaw) : from.yaw,
      pitch: clamp(o.pitch !== undefined ? o.pitch : g.pitch, this.minPitch, this.maxPitch),
    };
    const travel = Math.hypot(to.target[0] - from.target[0], to.target[2] - from.target[2]);
    const bump = Math.max(0, Math.log(1 + travel / (from.dist + to.dist)) * .9);
    const dur = o.time || clamp(.8 + .5 * Math.log(1 + travel / 800) + .25 * Math.abs(Math.log(to.dist / from.dist)), .6, 4.5);
    this.fly = { from, to, bump, t: 0, dur };
    this.followFn = null;
  }
  /* frame a set of world points (or {center, radius}) */
  frame(pts, o) {
    o = o || {};
    let c, r;
    if (pts.center) { c = pts.center; r = pts.radius; }
    else {
      const mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18];
      for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      r = Math.max(5, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2);
    }
    const half = Math.min(this.fov / 2, Math.atan(Math.tan(this.fov / 2) * this.W / this.H));
    const dist = r * (o.pad || 1.25) / Math.sin(half);
    this.flyTo(c, Object.assign({ dist }, o));
  }
  /* jump without animation */
  set(o) {
    const g = this.goal;
    if (o.target) { g.target = o.target.slice(); this.target = o.target.slice(); }
    if (o.dist !== undefined) g.dist = this.dist = clamp(o.dist, this.minDist, this.maxDist);
    if (o.yaw !== undefined) g.yaw = this.yaw = o.yaw;
    if (o.pitch !== undefined) g.pitch = this.pitch = clamp(o.pitch, this.minPitch, this.maxPitch);
    this.fly = null;
    this._pose();
  }

  /* ---------- per frame ---------- */
  update(dt) {
    const g = this.goal, E = 1 - Math.exp(-this.rate.pan * dt), Er = 1 - Math.exp(-this.rate.rot * dt), Ez = 1 - Math.exp(-this.rate.zoom * dt);
    const has = k => this.down.has(k);
    if (this.keys && dt > 0) {
      // pan, relative to the view heading
      let px = 0, pz = 0;
      if (has('KeyW') || has('ArrowUp')) pz += 1;
      if (has('KeyS') || has('ArrowDown')) pz -= 1;
      if (has('KeyD') || has('ArrowRight')) px += 1;
      if (has('KeyA') || has('ArrowLeft')) px -= 1;
      const m = this.mouse;
      if (this.edge && m.in && m.moved && m.btn < 0 && document.hasFocus()) {
        const e = this.edgePx;
        if (m.x < e) px -= 1; else if (m.x > this.W - e) px += 1;
        if (m.y < e) pz += 1; else if (m.y > this.H - e) pz -= 1;
      }
      if (px || pz) {
        const sp = g.dist * .95 * (has('ShiftLeft') || has('ShiftRight') ? 3 : 1) * dt / Math.hypot(px, pz);
        const s = Math.sin(g.yaw), c = Math.cos(g.yaw);
        g.target[0] += (s * pz + c * px) * sp; g.target[2] += (c * pz - s * px) * sp;
        this.followFn = null; this.fly = null;
      }
      const inv = this.invert ? -1 : 1;
      if (has('KeyQ')) { g.yaw -= 1.6 * dt * inv; this.fly = null; }
      if (has('KeyE')) { g.yaw += 1.6 * dt * inv; this.fly = null; }
      if (has('Equal') || has('NumpadAdd')) this.zoomAt(undefined, undefined, Math.exp(-2.2 * dt));
      if (has('Minus') || has('NumpadSubtract')) this.zoomAt(undefined, undefined, Math.exp(2.2 * dt));
      if (has('PageUp')) g.pitch = clamp(g.pitch - 1.1 * dt, this.minPitch, this.maxPitch);
      if (has('PageDown')) g.pitch = clamp(g.pitch + 1.1 * dt, this.minPitch, this.maxPitch);
    }
    if (this.followFn) {
      const p = this.followFn();
      if (p) { g.target[0] = p[0] + this.followOff[0]; g.target[2] = p[2] + this.followOff[2]; g.target[1] = p[1]; g.followY = true; }
      else this.followFn = null;
    }
    if (this.bounds) { const b = this.bounds; g.target[0] = clamp(g.target[0], b[0], b[2]); g.target[2] = clamp(g.target[2], b[1], b[3]); }
    if (this.fly) {
      const F = this.fly; F.t += dt;
      const u = clamp(F.t / F.dur, 0, 1), s = u * u * (3 - 2 * u), s2 = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      for (let k = 0; k < 3; k++) this.target[k] = F.from.target[k] + (F.to.target[k] - F.from.target[k]) * s2;
      this.dist = Math.exp(Math.log(F.from.dist) + (Math.log(F.to.dist) - Math.log(F.from.dist)) * s + F.bump * Math.sin(Math.PI * s));
      this.dist = clamp(this.dist, this.minDist, this.maxDist * 1.5);
      this.yaw = F.from.yaw + (F.to.yaw - F.from.yaw) * s;
      this.pitch = F.from.pitch + (F.to.pitch - F.from.pitch) * s;
      g.target = this.target.slice(); g.dist = F.to.dist; g.yaw = this.yaw; g.pitch = this.pitch;
      if (u >= 1) { this.fly = null; g.dist = this.dist = F.to.dist; }
    } else if (dt > 0) {
      for (const k of [0, 2]) this.target[k] += (g.target[k] - this.target[k]) * E;
      this.yaw += (g.yaw - this.yaw) * Er;
      this.pitch += (g.pitch - this.pitch) * Er;
      this.dist = Math.exp(Math.log(this.dist) + (Math.log(g.dist) - Math.log(this.dist)) * Ez);
    } else { this.target = g.target.slice(); this.yaw = g.yaw; this.pitch = g.pitch; this.dist = g.dist; }
    // the target rides the ground (or the followed object's height)
    const gy = g.followY && this.followFn ? g.target[1] : this.ground(this.target[0], this.target[2]);
    g.followY = false;
    this.target[1] = dt > 0 ? this.target[1] + (gy - this.target[1]) * (1 - Math.exp(-8 * dt)) : gy;
    this._pose();
    return this;
  }
  _pose() {
    const t = this.target, cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let e = [t[0] - sy * cp * this.dist, t[1] + sp * this.dist, t[2] - cy * cp * this.dist];
    // keep the lens above the ground
    const g0 = this.ground(e[0], e[2]), ge = Math.max(0, g0) + Math.max(g0 > .5 ? 1.2 : 3, this.dist * .01);   // over the sea: above the swell
    if (e[1] < ge) e[1] = ge;
    this.eye = e;
    let f = [t[0] - e[0], t[1] - e[1], t[2] - e[2]]; const fl = Math.hypot(f[0], f[1], f[2]) || 1; f = [f[0] / fl, f[1] / fl, f[2] / fl];
    let r = [f[2], 0, -f[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    this.f = f; this.r = r; this.u = u;
    this.fl = (this.H / 2) / Math.tan(this.fov / 2);
    const clear = Math.max(.5, e[1] - Math.max(0, this.ground(e[0], e[2])));
    this.clearance = clear;
    this.near = clamp(Math.min(this.dist * .02, clear * .4), .03, 200);
    this.far = Math.max(60000, Math.sqrt(2 * R_EARTH * Math.max(1, e[1])) * 1.25 + this.dist * 3);
  }
  setViewport(W, H) { this.W = W; this.H = H; this.fl = (H / 2) / Math.tan(this.fov / 2); }

  /* ---------- projection (with the curvature drop, as the renderer draws) ---------- */
  project(p, out) {
    const e = this.eye, dx = p[0] - e[0], dz = p[2] - e[2], dy = p[1] - e[1] - (dx * dx + dz * dz) / (2 * R_EARTH);
    const z = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
    if (z < this.near) return null;
    const x = dx * this.r[0] + dy * this.r[1] + dz * this.r[2], y = dx * this.u[0] + dy * this.u[1] + dz * this.u[2];
    out = out || [0, 0, 0];
    out[0] = this.W / 2 + this.fl * x / z; out[1] = this.H / 2 - this.fl * y / z; out[2] = z;
    return out;
  }
  /* world ray through a screen point (CSS px) */
  ray(sx, sy) {
    const x = (sx - this.W / 2) / this.fl, y = -(sy - this.H / 2) / this.fl;
    const d = [this.f[0] + this.r[0] * x + this.u[0] * y, this.f[1] + this.r[1] * x + this.u[1] * y, this.f[2] + this.r[2] * x + this.u[2] * y];
    const l = Math.hypot(d[0], d[1], d[2]);
    return { o: this.eye.slice(), d: [d[0] / l, d[1] / l, d[2] / l] };
  }
  /* the ground (terrain or sea surface) under a screen point, as drawn (curved); null if the ray misses */
  pickGround(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    const above = t => { const x = o[0] + d[0] * t, z = o[2] + d[2] * t, dx = x - o[0], dz = z - o[2]; return o[1] + d[1] * t - (Math.max(0, this.ground(x, z)) - (dx * dx + dz * dz) / (2 * R_EARTH)); };
    let t = 0, a = above(0);
    if (a < 0) return [o[0], Math.max(0, this.ground(o[0], o[2])), o[2]];
    const tMax = this.far;
    for (let i = 0; i < 400; i++) {
      const st = Math.max(.5, a * .45, t * .004);
      const t2 = t + st;
      if (t2 > tMax) return null;
      const a2 = above(t2);
      if (a2 <= 0) {
        let lo = t, hi = t2;
        for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (above(m) > 0) lo = m; else hi = m; }
        const x = o[0] + d[0] * hi, z = o[2] + d[2] * hi;
        return [x, Math.max(0, this.ground(x, z)), z];
      }
      t = t2; a = a2;
    }
    return null;
  }
  /* on-screen size (px) of a length L at world point p */
  pxSize(p, L) { const q = this.project(p); return q ? this.fl * L / q[2] : 0; }
}
