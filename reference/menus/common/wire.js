/* Hairline wireframe renderer for the Orbital menus. Segments are projected,
   near-clipped, depth-faded and bucketed by opacity so a frame is a handful
   of stroke() calls. Opacity buckets are quadratic: faint lines keep detail. */
(function () {
  const NB = 18;
  class Wire {
    constructor(cam, o) {
      o = o || {};
      this.cam = cam; this.fog = o.fog || [60, 900]; this.styles = new Map(); this.cur = null;
      this.style(o.color || '#F6F5F2', o.width || 1);
      this.cull = o.cull || 40;
    }
    style(color, width) {
      const k = color + '|' + (width || 1);
      let s = this.styles.get(k);
      if (!s) { s = { color, width: width || 1, b: Array.from({ length: NB }, () => []) }; this.styles.set(k, s); }
      this.cur = s; return this;
    }
    reset() { for (const s of this.styles.values()) for (const b of s.b) b.length = 0; return this; }
    fogK(z) { const [a, b] = this.fog; return z <= a ? 1 : z >= b ? 0 : 1 - (z - a) / (b - a); }
    /* world segment */
    seg(a, b, al) {
      if (al <= .004) return;
      const c = this.cam, n = c.near;
      let A = c.toCam(a), B = c.toCam(b);
      if (A[2] < n && B[2] < n) return;
      if (A[2] < n) { const t = (n - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, n]; }
      else if (B[2] < n) { const t = (n - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, n]; }
      al *= this.fogK((A[2] + B[2]) * .5);
      if (al <= .004) return;
      const pa = c.fromCam(A), pb = c.fromCam(B), m = this.cull, W = c.W, H = c.H;
      if ((pa[0] < -m && pb[0] < -m) || (pa[0] > W + m && pb[0] > W + m) || (pa[1] < -m && pb[1] < -m) || (pa[1] > H + m && pb[1] > H + m)) return;
      const k = Math.min(NB - 1, Math.floor(Math.sqrt(Math.min(1, al)) * NB));
      const bk = this.cur.b[k]; bk.push(pa[0], pa[1], pb[0], pb[1]);
    }
    /* screen-space segment (already projected) */
    seg2(x0, y0, x1, y1, al) {
      if (al <= .004) return;
      const k = Math.min(NB - 1, Math.floor(Math.sqrt(Math.min(1, al)) * NB));
      this.cur.b[k].push(x0, y0, x1, y1);
    }
    poly(pts, al, closed) {
      for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1], al);
      if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], al);
    }
    /* ring around axis (unit U, V span the ring plane); facing-aware */
    ring(c, U, V, r, n, front, back) {
      const eye = this.cam.eye;
      let px = c[0] + U[0] * r, py = c[1] + U[1] * r, pz = c[2] + U[2] * r;
      for (let i = 1; i <= n; i++) {
        const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const qx = c[0] + (U[0] * ca + V[0] * sa) * r, qy = c[1] + (U[1] * ca + V[1] * sa) * r, qz = c[2] + (U[2] * ca + V[2] * sa) * r;
        let al = front;
        if (back !== undefined) {
          const am = (i - .5) / n * Math.PI * 2, cm = Math.cos(am), smm = Math.sin(am);
          const nx = U[0] * cm + V[0] * smm, ny = U[1] * cm + V[1] * smm, nz = U[2] * cm + V[2] * smm;
          const mx = c[0] + nx * r, my = c[1] + ny * r, mz = c[2] + nz * r;
          const f = nx * (eye[0] - mx) + ny * (eye[1] - my) + nz * (eye[2] - mz);
          al = f > 0 ? front : back;
        }
        this.seg([px, py, pz], [qx, qy, qz], al);
        px = qx; py = qy; pz = qz;
      }
    }
    /* camera-facing circle (smoke puffs, shock rings seen face-on) */
    disc(c, r, n, al) { this.ring(c, this.cam.r, this.cam.u, r, n, al); }
    flush(ctx) {
      ctx.lineCap = 'round';
      for (const s of this.styles.values()) {
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
        for (let k = 0; k < NB; k++) {
          const b = s.b[k]; if (!b.length) continue;
          const a = (k + .5) / NB; ctx.globalAlpha = a * a;
          ctx.beginPath();
          for (let i = 0; i < b.length; i += 4) { ctx.moveTo(b[i], b[i + 1]); ctx.lineTo(b[i + 2], b[i + 3]); }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  window.Wire = Wire;
})();
