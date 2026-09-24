/* Point-cloud raster for the Point Cloud menus: square dots written straight
   into an ImageData buffer (max blend by default, so dense areas stay crisp
   instead of blowing out), then vector overlays drawn with the 2D context. */
(function () {
  class PointBuf {
    constructor(canvas, bg, o) {
      o = o || {};
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.W = canvas.width; this.H = canvas.height;
      this.img = this.ctx.createImageData(this.W, this.H); this.d = this.img.data;
      this.bg = new Uint8ClampedArray(this.W * this.H * 4);
      this.setBg(bg || [11, 12, 10], o.vignette === undefined ? .55 : o.vignette);
    }
    setBg(c, vig) {
      const W = this.W, H = this.H, b = this.bg;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2), v = 1 - vig * Math.min(1, (dx * dx * .6 + dy * dy * .9) * .7);
        const i = (y * W + x) * 4; b[i] = c[0] * v; b[i + 1] = c[1] * v; b[i + 2] = c[2] * v; b[i + 3] = 255;
      }
    }
    clear() { this.d.set(this.bg); }
    /* square dot, max blend. x,y stage px; s side in px (1..4); a 0..1 */
    dot(x, y, s, r, g, b, a) {
      const W = this.W, d = this.d;
      let x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
      if (x0 < 0 || y0 < 0 || x0 + s > W || y0 + s > this.H) return;
      const R = r * a, G = g * a, B = b * a;
      for (let j = 0; j < s; j++) {
        let i = ((y0 + j) * W + x0) * 4;
        for (let k = 0; k < s; k++, i += 4) {
          if (d[i] < R) d[i] = R; if (d[i + 1] < G) d[i + 1] = G; if (d[i + 2] < B) d[i + 2] = B;
        }
      }
    }
    /* additive, for glows and flashes */
    add(x, y, s, r, g, b, a) {
      const W = this.W, d = this.d;
      let x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
      if (x0 < 0 || y0 < 0 || x0 + s > W || y0 + s > this.H) return;
      const R = r * a, G = g * a, B = b * a;
      for (let j = 0; j < s; j++) {
        let i = ((y0 + j) * W + x0) * 4;
        for (let k = 0; k < s; k++, i += 4) { d[i] += R; d[i + 1] += G; d[i + 2] += B; }
      }
    }
    /* dotted line in screen space */
    dline(x0, y0, x1, y1, step, s, r, g, b, a) {
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / step));
      for (let i = 0; i <= n; i++) { const t = i / n; this.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, s, r, g, b, a); }
    }
    /* full-frame additive lift (lightning flash) */
    lift(v) { if (v <= 0) return; const d = this.d, n = d.length; for (let i = 0; i < n; i += 4) { d[i] += v; d[i + 1] += v; d[i + 2] += v; } }
    blit() { this.ctx.putImageData(this.img, 0, 0); }
  }

  /* transform stride-6 part points by T (rigid) and project with cam.
     out: Float32Array n*4 -> sx, sy, depth (<=0 = culled), facing (-1..1, 2 = two-sided) */
  function project(cam, T, pts, out) {
    const M = T.R, t = T.T, e = cam.eye, f = cam.f, r = cam.r, u = cam.u, fl = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], near = cam.near;
    const n = pts.length / 6;
    for (let i = 0, j = 0, o = 0; i < n; i++, j += 6, o += 4) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const wx = M[0] * px + M[1] * py + M[2] * pz + t[0], wy = M[3] * px + M[4] * py + M[5] * pz + t[1], wz = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = wx - e[0], dy = wy - e[1], dz = wz - e[2];
      const z = dx * f[0] + dy * f[1] + dz * f[2];
      if (z < near) { out[o + 2] = -1; continue; }
      out[o] = cx + fl * (dx * r[0] + dy * r[1] + dz * r[2]) / z;
      out[o + 1] = cy - fl * (dx * u[0] + dy * u[1] + dz * u[2]) / z;
      out[o + 2] = z;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      if (nx === 0 && ny === 0 && nz === 0) { out[o + 3] = 2; continue; }
      const wnx = M[0] * nx + M[1] * ny + M[2] * nz, wny = M[3] * nx + M[4] * ny + M[5] * nz, wnz = M[6] * nx + M[7] * ny + M[8] * nz;
      out[o + 3] = -(wnx * dx + wny * dy + wnz * dz) / (Math.hypot(wnx, wny, wnz) * Math.hypot(dx, dy, dz) + 1e-9);
    }
    return out;
  }

  window.PointBuf = PointBuf;
  window.DOTS = { project };
})();
