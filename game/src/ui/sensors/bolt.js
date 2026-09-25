/* The lightning bolt of the SCAN (p1_strike, pa_picture): a jagged channel by midpoint displacement from high
   above down to the struck point, branches forking down and out, a leader that steps down with a pour of dots
   running ahead of it, a white-lime core with a lime breath round it, the return stroke flickering twice, sparks
   where it lands. Geometry is built once per strike; drawing is analytic in the stroke's age. */
import { TAU, sat, clamp, rng, hsh } from './core.js';

function disp(a, b, depth, rough, rr, flat) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      out.push([(p[0] + q[0]) / 2 + (rr() - .5) * l * rough, (p[1] + q[1]) / 2 + (rr() - .5) * l * rough * (flat || .4), (p[2] + q[2]) / 2 + (rr() - .5) * l * rough], q);
    }
    pts = out;
  }
  return pts;
}

export class Bolt {
  /* o: { hit [x, y, z], height (m above the hit), seed, spread (horizontal offset of the top, fraction of height) } */
  constructor(o) {
    const rr = rng(o.seed || 1), H = o.height || 2000, hit = o.hit.slice();
    const sp = o.spread === undefined ? .18 : o.spread;
    const top = [hit[0] + (rr() - .5) * H * sp, hit[1] + H, hit[2] + (rr() - .5) * H * sp];
    this.hit = hit; this.top = top; this.H = H;
    const main = disp(top, hit, 7, .62, rr);
    // arc length table
    const cum = new Float32Array(main.length); let L = 0;
    for (let i = 1; i < main.length; i++) { L += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1], main[i][2] - main[i - 1][2]); cum[i] = L; }
    this.main = main; this.cum = cum; this.L = L;
    const br = [];
    const nb = 6 + Math.floor(rr() * 3);
    for (let k = 0; k < nb; k++) {
      const i = 6 + Math.floor(rr() * main.length * .72), s = main[i], q = main[Math.min(main.length - 1, i + 4)];
      let dx = q[0] - s[0] + (rr() - .5) * H * .3, dy = q[1] - s[1] - rr() * H * .05, dz = q[2] - s[2] + (rr() - .5) * H * .3;
      const l = Math.hypot(dx, dy, dz) || 1, len = H * (.07 + rr() * .2);
      dx /= l; dy /= l; dz /= l;
      const end = [s[0] + dx * len, Math.max(hit[1] + H * .03, s[1] + dy * len), s[2] + dz * len];
      const pts = disp(s, end, 5, .55, rr);
      br.push({ at: i / main.length, pts, w: .45 + .25 * rr() });
      if (rr() < .45) {
        const j = Math.floor(pts.length * (.3 + .4 * rr())), q0 = pts[j];
        br.push({ at: i / main.length + .04, pts: disp(q0, [q0[0] + (rr() - .5) * len * .6, Math.max(hit[1] + 5, q0[1] - len * (.2 + .3 * rr())), q0[2] + (rr() - .5) * len * .6], 4, .5, rr), w: .3 });
      }
    }
    this.br = br;
    // the pour: dots streaming down the channel with the leader
    this.rain = new Float32Array(360 * 5);
    for (let k = 0; k < 360; k++) { const o5 = k * 5; this.rain[o5] = -rr() * .9; this.rain[o5 + 1] = 2.6 + rr() * 2.2; this.rain[o5 + 2] = (rr() - .5) * H * .03; this.rain[o5 + 3] = (rr() - .5) * H * .01; this.rain[o5 + 4] = (rr() - .5) * H * .03; }
    // sparks
    this.SP = new Float32Array(160 * 4);
    for (let i = 0; i < 160; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = 6 + rr() * 34, h = Math.sqrt(1 - u * u); this.SP[i * 4] = Math.cos(a) * h * s; this.SP[i * 4 + 1] = Math.abs(u) * s * .8 + 3; this.SP[i * 4 + 2] = Math.sin(a) * h * s; this.SP[i * 4 + 3] = .4 + rr() * .9; }
    this.seed = o.seed || 1;
    this._p = [0, 0, 0];
  }
  /* point at arc fraction s (0 top .. 1 hit) */
  at(s, out) {
    const cum = this.cum, m = this.main, L = s * this.L;
    let lo = 1, hi = cum.length - 1;
    while (lo < hi) { const md = (lo + hi) >> 1; if (cum[md] < L) lo = md + 1; else hi = md; }
    const i = Math.max(1, lo), k = (L - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), a = m[i - 1], b = m[i];
    out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k;
    return out;
  }
  /* brightness of the return stroke at age tr (s after it connects): flickers twice */
  static stroke(tr) {
    if (tr < 0) return 0;
    return Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2));
  }
  /* draw. fx: R.fx, V: view. reach 0..1 (the leader's progress), I: brightness, pal: { core, glow } rgb,
     pour: 0..1 age of the pour (the stream of dots coming down with the leader), leading: bool */
  draw(fx, V, reach, I, pal, pour, leading) {
    if (I < .004 && !leading) return;
    if (pal.orb) return this.drawW(fx, V, reach, I, pal, pour, leading);
    const core = pal.core, gl = pal.glow;
    const m = this.main, nVis = reach * (m.length - 1);
    this._path(fx, V, m, 0, nVis, Math.min(1, I * 1.1), leading ? 2 : 3, core, gl, true);
    for (const b of this.br) {
      const s = b.at * (m.length - 1); if (nVis <= s) continue;
      const k = (nVis - s) / ((m.length - 1) * .25) * (b.pts.length - 1);
      this._path(fx, V, b.pts, 0, k, Math.min(1, I * .75 * b.w / .5), 2, core, gl, false);
    }
    if (leading) {
      const tip = m[Math.min(m.length - 1, Math.floor(nVis))];
      fx.dotXYZ(tip[0], tip[1], tip[2], 3, 255, 255, 255, 1, 'add');
      const P = this._p; P[0] = tip[0]; P[1] = tip[1]; P[2] = tip[2];
      fx.glow(P, 12, gl, .35);
    }
    // the pour: dots running down the channel ahead of and with the leader
    if (pour >= 0 && pour < 1.2) {
      const R = this.rain, p = this._p;
      for (let k = 0; k < 360; k++) {
        const o5 = k * 5, s = R[o5] + pour * R[o5 + 1]; if (s < 0 || s > 1) continue;
        this.at(s, p);
        const f = (1 - s) * .8;
        fx.dotXYZ(p[0] + R[o5 + 2] * f, p[1] + R[o5 + 3] * f, p[2] + R[o5 + 4] * f, 2, core[0] * .92, core[1], core[2] * .8, .85, 'add');
      }
    }
  }
  /* the Orbital style (pal.orb: the renderer's Wire): the channel and its branches as hairlines (pal.line 0..1), the
     pour as short strokes running down it, one restrained bloom at the leader's head */
  drawW(fx, V, reach, I, pal, pour, leading) {
    const W = pal.orb, c = pal.line, m = this.main, nVis = reach * (m.length - 1);
    pathW(W, V, m, nVis, Math.min(1, I * 1.1), c);
    for (const b of this.br) {
      const s = b.at * (m.length - 1); if (nVis <= s) continue;
      const k = (nVis - s) / ((m.length - 1) * .25) * (b.pts.length - 1);
      pathW(W, V, b.pts, k, Math.min(1, I * .7 * b.w / .5), c);
    }
    if (leading) {
      const tip = m[Math.min(m.length - 1, Math.floor(nVis))];
      const P = this._p; P[0] = tip[0]; P[1] = tip[1]; P[2] = tip[2];
      fx.glow(P, 10, pal.glow, .3);
    }
    if (pour >= 0 && pour < 1.2) {
      const R = this.rain, p = this._p, q = this._q || (this._q = [0, 0, 0]);
      for (let k = 0; k < 360; k += 3) {
        const o5 = k * 5, s = R[o5] + pour * R[o5 + 1]; if (s < .02 || s > 1) continue;
        this.at(s, p); this.at(s - .015, q);
        const f = (1 - s) * .8, ox = R[o5 + 2] * f, oy = R[o5 + 3] * f, oz = R[o5 + 4] * f;
        W.seg(q[0] + ox, q[1] + oy, q[2] + oz, p[0] + ox, p[1] + oy, p[2] + oz, c[0], c[1], c[2], .7);
      }
    }
  }
  _path(fx, V, pts, from, to, a, size, core, gl, main) {
    if (a < .004) return;
    const P = this._p, n1 = Math.min(pts.length - 1, to);
    let k3 = 0;
    for (let i = Math.floor(from); i < n1; i++) {
      const A = pts[i], B = pts[i + 1];
      const zc = V.depth(A[0], A[1], A[2]); if (zc < V.near) continue;
      const frac = Math.min(1, n1 - i);
      const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * frac, n = Math.max(1, Math.min(200, Math.ceil(L * V.fl / zc / (main ? 1.1 : 1.5))));
      for (let k = 0; k < n; k++) {
        const f = k / n * frac, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, z = A[2] + (B[2] - A[2]) * f;
        fx.dotXYZ(x, y, z, size, core[0], core[1], core[2], a, 'add');
        if ((k3++ % 3) === 0) {
          P[0] = x; P[1] = y; P[2] = z;
          fx.glow(P, 9, gl, .045 * a);
          if (main && (k3 % 2) === 0) fx.glow(P, 21, gl, .016 * a);
        }
      }
    }
  }
  /* sparks where the channel meets the ground / metal; age a (s after the stroke) */
  sparks(fx, a, pal) {
    if (a < 0 || a > 1.4) return;
    const S = this.SP, h = this.hit, c = pal.spark || pal.core;
    if (pal.orb) {
      // the Orbital style: each spark a short hairline stroke along its flight
      const W = pal.orb, lc = pal.line, a0 = Math.max(0, a - .05);
      for (let i = 0; i < 160; i += 2) {
        const o = i * 4, life = S[o + 3]; if (a > life) continue;
        const w = 1 - a / life, y1 = h[1] + S[o + 1] * a - 11 * a * a, y0 = h[1] + S[o + 1] * a0 - 11 * a0 * a0;
        if (y1 < h[1]) continue;
        W.seg(h[0] + S[o] * a0, y0, h[2] + S[o + 2] * a0, h[0] + S[o] * a, y1, h[2] + S[o + 2] * a, lc[0], lc[1], lc[2], w * .9);
      }
      return;
    }
    for (let i = 0; i < 160; i++) {
      const o = i * 4, life = S[o + 3]; if (a > life) continue;
      const w = 1 - a / life;
      let y = h[1] + S[o + 1] * a - 11 * a * a; if (y < h[1]) y = h[1] + (h[1] - y) * .25;
      fx.dotXYZ(h[0] + S[o] * a, y, h[2] + S[o + 2] * a, 2, c[0], c[1], c[2], w, 'add');
    }
  }
}

/* a jagged channel as hairlines up to point index `to` (fractional) */
function pathW(W, V, pts, to, a, c) {
  if (a < .004) return;
  const n1 = Math.min(pts.length - 1, to);
  for (let i = 0; i < n1; i++) {
    const A = pts[i], B = pts[i + 1], f = Math.min(1, n1 - i);
    W.seg(A[0], A[1], A[2], A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, c[0], c[1], c[2], a);
  }
}
/* cloud-to-ground lightning for weather (fallback when the FX system does not draw it) */
export function stormBolt(pos, top, seed) {
  const H = Math.max(800, (top ? top[1] : 3200) - pos[1]);
  return new Bolt({ hit: pos, height: H, seed, spread: .12 });
}
export { disp, clamp, sat, hsh };
