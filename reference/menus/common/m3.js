/* Tiny 3D kit shared by every menu scene: vectors, rotations, a look-at
   perspective camera that projects into the 1920x1080 stage, seeded rng,
   value noise, easing. World: metres, X east, Y up, Z north. */
(function () {
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  };

  /* 3x3 rotation matrices, row-major flat arrays */
  const R = {
    I: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
    x: a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; },
    y: a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
    z: a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; },
    mul: (A, B) => {
      const o = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
      return o;
    },
    ap: (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]],
    /* frame whose +Z is `fwd` (model forward), +Y as close to `up` as possible */
    look: (fwd, up) => {
      const z = V.norm(fwd); let x = V.cross(up || [0, 1, 0], z);
      if (V.len(x) < 1e-6) x = V.cross([1, 0, 0], z);
      x = V.norm(x); const y = V.cross(z, x);
      return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
    },
  };
  /* rigid transform {R, T}: p -> R p + T */
  const X = {
    make: (Rm, T) => ({ R: Rm || R.I(), T: T || [0, 0, 0] }),
    ap: (x, p) => { const M = x.R, v = p; return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2] + x.T[0], M[3] * v[0] + M[4] * v[1] + M[5] * v[2] + x.T[1], M[6] * v[0] + M[7] * v[1] + M[8] * v[2] + x.T[2]]; },
    dir: (x, d) => R.ap(x.R, d),
    mul: (a, b) => ({ R: R.mul(a.R, b.R), T: X.ap(a, b.T) }),
    /* rotate about an axis-aligned pivot: angle about local X through point o */
    pivotX: (o, ang) => { const Rm = R.x(ang); const ro = R.ap(Rm, o); return { R: Rm, T: [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]] }; },
  };

  class Cam {
    constructor(W, H) { this.W = W || 1920; this.H = H || 1080; this.eye = [0, 2, -10]; this.target = [0, 0, 0]; this.up = [0, 1, 0]; this.fov = 40 * Math.PI / 180; this.roll = 0; this.near = .3; this.shake = [0, 0]; this.cx = this.W / 2; this.cy = this.H / 2; this.update(); }
    update() {
      // X east, Y up, Z north is left-handed: looking north, east must land on screen right
      const f = V.norm(V.sub(this.target, this.eye));
      let r = V.norm(V.cross(this.up, f));
      let u = V.cross(f, r);
      if (this.roll) { const c = Math.cos(this.roll), s = Math.sin(this.roll); const r2 = V.add(V.mul(r, c), V.mul(u, s)); u = V.add(V.mul(u, c), V.mul(r, -s)); r = r2; }
      this.f = f; this.r = r; this.u = u;
      this.fl = (this.H / 2) / Math.tan(this.fov / 2);
      return this;
    }
    /* camera-space depth of a world point */
    depth(p) { return (p[0] - this.eye[0]) * this.f[0] + (p[1] - this.eye[1]) * this.f[1] + (p[2] - this.eye[2]) * this.f[2]; }
    /* -> [sx, sy, z] or null behind the near plane */
    project(p) {
      const dx = p[0] - this.eye[0], dy = p[1] - this.eye[1], dz = p[2] - this.eye[2];
      const z = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
      if (z < this.near) return null;
      const x = dx * this.r[0] + dy * this.r[1] + dz * this.r[2];
      const y = dx * this.u[0] + dy * this.u[1] + dz * this.u[2];
      return [this.cx + this.shake[0] + this.fl * x / z, this.cy + this.shake[1] - this.fl * y / z, z];
    }
    /* camera-space coords (for clipping) */
    toCam(p) {
      const dx = p[0] - this.eye[0], dy = p[1] - this.eye[1], dz = p[2] - this.eye[2];
      return [dx * this.r[0] + dy * this.r[1] + dz * this.r[2], dx * this.u[0] + dy * this.u[1] + dz * this.u[2], dx * this.f[0] + dy * this.f[1] + dz * this.f[2]];
    }
    fromCam(c) { return [this.cx + this.shake[0] + this.fl * c[0] / c[2], this.cy + this.shake[1] - this.fl * c[1] / c[2]]; }
    /* orbit helper: yaw (rad, 0 = looking north), pitch (rad, + looks down), distance */
    orbit(target, yaw, pitch, dist) {
      this.target = target.slice();
      this.eye = [target[0] - Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] - Math.cos(yaw) * Math.cos(pitch) * dist];
      return this.update();
    }
  }

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* value noise, 3D, smooth; fbm */
  const P = new Uint8Array(512); { const r = rng(90210); const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
  const hv = (x, y, z) => P[P[P[x & 255] + (y & 255)] + (z & 255)] / 255;
  const sm = t => t * t * (3 - 2 * t);
  function noise(x, y, z) {
    z = z || 0;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = sm(xf), v = sm(yf), w = sm(zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(hv(xi, yi, zi), hv(xi + 1, yi, zi), u), l(hv(xi, yi + 1, zi), hv(xi + 1, yi + 1, zi), u), v),
             l(l(hv(xi, yi, zi + 1), hv(xi + 1, yi, zi + 1), u), l(hv(xi, yi + 1, zi + 1), hv(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
  }
  function fbm(x, y, z, oct) { let s = 0, a = .5, f = 1; for (let i = 0; i < (oct || 4); i++) { s += a * noise(x * f, y * f, z * f); f *= 2.03; a *= .5; } return s; }

  const E = {
    clamp: (v, a, b) => v < a ? a : v > b ? b : v,
    sat: v => v < 0 ? 0 : v > 1 ? 1 : v,
    mix: (a, b, t) => a + (b - a) * t,
    ss: (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); },
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    /* critically damped approach, frame-rate independent */
    damp: (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt)),
    dampV: (cur, tgt, rate, dt) => { const k = 1 - Math.exp(-rate * dt); return [cur[0] + (tgt[0] - cur[0]) * k, cur[1] + (tgt[1] - cur[1]) * k, cur[2] + (tgt[2] - cur[2]) * k]; },
  };

  window.M3 = { V, R, X, Cam, rng, gauss, noise, fbm, E };
})();
