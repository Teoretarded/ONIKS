/* The films' CPU renderer as an FX sink, for the bench: PointBuf (max-blend square dots over the graphite
   vignette, reference/menus/common/dots.js) and M3.Cam. The sink has the game's frame.sink names: dot (max), add
   (additive square dot), glow (soft additive disc), light, lift. Effects are recorded first, then the scene is
   drawn lit by the lights, then the effect dots (max), the additive dots and discs, then the frame lift: the
   order the WebGL engine uses. Sizes: > 0 px at 1080p, < 0 metres. */
const REC = 8;
class Rec {
  constructor(n) { this.a = new Float32Array(n * REC); this.n = 0; }
  push(x, y, z, s, r, g, b, al) {
    if ((this.n + 1) * REC > this.a.length) { const b2 = new Float32Array(this.a.length * 2); b2.set(this.a); this.a = b2; }
    const o = this.n++ * REC, A = this.a; A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = s; A[o + 4] = r; A[o + 5] = g; A[o + 6] = b; A[o + 7] = al;
  }
}

export class CpuRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.pb = new PointBuf(canvas, [11, 12, 10], { vignette: .55 });
    this.cam = new M3.Cam(canvas.width, canvas.height);
    this.cam.near = .3; this.cam.fov = 40 * Math.PI / 180; this.cam.update();
    this.mx = new Rec(1 << 16); this.ad = new Rec(1 << 14); this.ha = new Rec(1 << 10);
    this.lights = []; this.liftV = 0; this.liftC = [255, 255, 255]; this.models = []; this.hasModel = null;
    const self = this;
    this.sink = {
      cam: { eye: [0, 0, 0], f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], fl: 1000, tanX: 1, tanY: .6, near: .3 },
      dot(x, y, z, s, r, g, b, a) { self.mx.push(x, y, z, s, r, g, b, a); },
      add(x, y, z, s, r, g, b, a) { self.ad.push(x, y, z, s, r, g, b, a); },
      glow(x, y, z, s, r, g, b, a) { self.ha.push(x, y, z, s, r, g, b, a); },
      light(x, y, z, r, g, b, i, rad) {
        const L = self.lights;
        if (L.length >= 16) { let mi = 0; for (let k = 1; k < 16; k++) if (L[k].i < L[mi].i) mi = k; if (L[mi].i >= i) return; L.splice(mi, 1); }
        L.push({ x, y, z, r, g, b, i, rad });
      },
      lift(v, r, g, b) { if (v > self.liftV) { self.liftV = v; self.liftC = [r, g, b]; } },
      /* a model instance to draw with the scene (key, world position, 3x3 row-major rotation, alpha); false if unknown */
      model(key, T, R9, a) { if (!self.hasModel || !self.hasModel(key)) return false; self.models.push({ key, T: [T[0], T[1], T[2]], R: R9.slice(), a: a === undefined ? 1 : a }); return true; },
    };
  }
  /* camera orbit: target, yaw (0 = looking north), pitch (+ looks down), distance */
  orbit(target, yaw, pitch, dist, fovDeg) {
    const c = this.cam;
    if (fovDeg) c.fov = fovDeg * Math.PI / 180;
    c.orbit(target, yaw, pitch, dist);
    const k = this.sink.cam;
    k.eye = c.eye; k.f = c.f; k.r = c.r; k.u = c.u; k.fl = c.fl * 1080 / c.H; k.tanY = (c.H / 2) / c.fl; k.tanX = (c.W / 2) / c.fl; k.near = c.near;
  }
  begin() { this.mx.n = 0; this.ad.n = 0; this.ha.n = 0; this.lights.length = 0; this.liftV = 0; this.models.length = 0; }
  get fxCount() { return this.mx.n + this.ad.n + this.ha.n; }

  /* lights at a world point: [add (0..), r, g, b weights] into out */
  lightAt(x, y, z, out) {
    let I = 0, lr = 0, lg = 0, lb = 0;
    for (let k = 0; k < this.lights.length; k++) {
      const L = this.lights[k], dx = x - L.x, dy = y - L.y, dz = z - L.z, d2 = dx * dx + dy * dy + dz * dz, R2 = L.rad * L.rad;
      if (d2 >= R2) continue;
      const u = 1 - d2 / R2, w = u * u * L.i;
      I += w; lr += w * L.r; lg += w * L.g; lb += w * L.b;
    }
    out[0] = I; if (I > 0) { out[1] = lr / I; out[2] = lg / I; out[3] = lb / I; }
    return out;
  }
  /* a scene point: world position, base brightness b (0..1), colour; lights brighten it */
  scenePt(x, y, z, b, r, g, bl, size, LT) {
    const c = this.cam, e = c.eye, f = c.f, dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < c.near) return;
    const sx = c.cx + c.fl * (dx * c.r[0] + dy * c.r[1] + dz * c.r[2]) / zc, sy = c.cy - c.fl * (dx * c.u[0] + dy * c.u[1] + dz * c.u[2]) / zc;
    if (sx < 0 || sy < 0 || sx >= c.W || sy >= c.H) return;
    if (this.lights.length) {
      // as the engine does it: the light's colour added, (1 - d^2/r^2)^2 * intensity * .9
      const l = this.lightAt(x, y, z, LT);
      if (l[0] > 0) { const k = l[0] * .9; this.pb.dot(sx, sy, size, r * b + l[1] * k, g * b + l[2] * k, bl * b + l[3] * k, 1); return; }
    }
    this.pb.dot(sx, sy, size, r, g, bl, b > 1 ? 1 : b);
  }
  /* flush the recorded effect dots, glows and halos, then the lift */
  flush() {
    const c = this.cam, e = c.eye, f = c.f, rr = c.r, u = c.u, fl = c.fl, cx = c.cx, cy = c.cy, W = c.W, H = c.H, pb = this.pb, k1080 = H / 1080;
    const pass = (R, add) => {
      const A = R.a;
      for (let i = 0, o = 0; i < R.n; i++, o += REC) {
        const dx = A[o] - e[0], dy = A[o + 1] - e[1], dz = A[o + 2] - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
        if (zc < c.near) continue;
        const sx = cx + fl * (dx * rr[0] + dy * rr[1] + dz * rr[2]) / zc, sy = cy - fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
        let s = A[o + 3]; s = s > 0 ? s * k1080 : -s * fl / zc;
        s = Math.max(1, Math.min(add ? 80 : 12, Math.round(s)));
        if (sx < -s || sy < -s || sx >= W + s || sy >= H + s) continue;
        if (add) pb.add(sx, sy, s, A[o + 4], A[o + 5], A[o + 6], A[o + 7]); else pb.dot(sx, sy, s, A[o + 4], A[o + 5], A[o + 6], A[o + 7]);
      }
    };
    pass(this.mx, false);
    pass(this.ad, true);
    // halos: soft additive discs, (1 - d^2/R^2)^2
    const A = this.ha.a, d = pb.d;
    for (let i = 0, o = 0; i < this.ha.n; i++, o += REC) {
      const dx = A[o] - e[0], dy = A[o + 1] - e[1], dz = A[o + 2] - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
      if (zc < c.near) continue;
      const x = cx + fl * (dx * rr[0] + dy * rr[1] + dz * rr[2]) / zc, y = cy - fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
      let Rr = A[o + 3]; Rr = Rr > 0 ? Rr * k1080 : -Rr * fl / zc; Rr = Math.min(Rr, 700);
      const a = A[o + 7]; if (a <= .002 || Rr < 1) continue;
      const x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(H - 1, Math.ceil(y + Rr)), iR2 = 1 / (Rr * Rr);
      const r = A[o + 4], g = A[o + 5], b = A[o + 6];
      for (let j = y0; j <= y1; j++) { const ddy = j - y; for (let q = x0; q <= x1; q++) { const ddx = q - x, uu = 1 - (ddx * ddx + ddy * ddy) * iR2; if (uu <= 0) continue; const w = uu * uu * a, kk = (j * W + q) * 4; d[kk] += r * w; d[kk + 1] += g * w; d[kk + 2] += b * w; } }
    }
    if (this.liftV > .002) { const v = this.liftV * 255, C = this.liftC, n = d.length; for (let i = 0; i < n; i += 4) { d[i] += v * C[0] / 255; d[i + 1] += v * C[1] / 255; d[i + 2] += v * C[2] / 255; } }
  }
}
