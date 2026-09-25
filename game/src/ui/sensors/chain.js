/* CHAIN LIGHTNING: the scan's bolt forks to every hull inside the ring (and the storm's bolt, in white, to every
   unit its flash reveals). A fork is a jagged channel that races low over the sea / ground from the strike point
   to the hull and climbs onto it: a bright leader head with a pour of dots behind it, side tendrils that die
   out, then its own return stroke (two flickers) when it connects.
   Geometry is built once per fork in a frame that stretches between the two ends (so the end rides a moving hull);
   drawing is analytic in the fork's age and allocation-free. */
import { rng, clamp, sat } from './core.js';
import { Bolt } from './bolt.js';

/* midpoint displacement of an offset profile over t = 0..1 (n = 2^depth segments): lateral and vertical offsets
   in metres, zero at both ends */
function profile(depth, L, rough, flat, rr) {
  const n = 1 << depth, lat = new Float32Array(n + 1), up = new Float32Array(n + 1);
  for (let step = n; step > 1; step >>= 1) {
    const h = step >> 1, seg = L * step / n;
    for (let i = 0; i + step <= n; i += step) {
      const m = i + h;
      lat[m] = (lat[i] + lat[i + step]) / 2 + (rr() - .5) * seg * rough;
      up[m] = (up[i] + up[i + step]) / 2 + (rr() - .5) * seg * rough * flat;
    }
  }
  return { n, lat, up };
}

export class Fork {
  /* o: { from [x, y, z] (fixed), to [x, y, z] (initial end; draw() takes the live one), seed, ground (fn(x, z) -> surface y, or null for the sea),
          climb (m: how high the end is above the surface: the hull's deck) } */
  constructor(o) {
    const rr = rng(o.seed || 1), a = o.from, b = o.to;
    const dx = b[0] - a[0], dz = b[2] - a[2], D = Math.max(1, Math.hypot(dx, dz));
    this.D = D; this.from = a.slice(); this.seed = o.seed || 1;
    // the channel: a low arc over the surface, rough across, a little up and down
    const P = profile(6, D, .42, .16, rr);
    const n = this.n = P.n;
    this.t = new Float32Array(n + 1); this.lat = P.lat; this.up = P.up; this.gy = new Float32Array(n + 1);
    const arch = D * (.01 + .01 * rr());
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.t[i] = t;
      // hug the surface, arc a little in the middle (the climb onto the hull is added in pt())
      this.up[i] = (Math.abs(this.up[i]) * .6 + arch * Math.sin(Math.PI * t) + 2) * Math.min(1, t * 12);
      if (i === n) { this.up[i] = 0; this.lat[i] = 0; }
      const x = a[0] + dx * t, z = a[2] + dz * t;
      this.gy[i] = o.ground ? Math.max(0, o.ground(x, z)) : 0;
    }
    // side tendrils: short dead ends forking off the channel, drawn once the leader has passed them
    const nb = 3 + Math.floor(rr() * 3) + (D > 2500 ? 2 : 0);
    this.br = [];
    for (let k = 0; k < nb; k++) {
      const at = .12 + rr() * .7, i = Math.floor(at * n), len = D * (.05 + .1 * rr());
      const side = rr() < .5 ? -1 : 1, bp = profile(4, len, .5, .3, rr);
      const pts = new Float32Array((bp.n + 1) * 3);         // (along, lateral, up) relative to the fork point
      for (let j = 0; j <= bp.n; j++) {
        const s = j / bp.n;
        pts[j * 3] = len * s * (.35 + .3 * rr());
        pts[j * 3 + 1] = side * len * s * (.6 + .5 * rr()) + bp.lat[j];
        pts[j * 3 + 2] = Math.abs(bp.up[j]) * .5 + 1;
      }
      this.br.push({ i, at: i / n, pts, m: bp.n, w: .35 + .3 * rr() });
    }
    this._a = [0, 0, 0]; this._b = [0, 0, 0]; this._P = [0, 0, 0];
    this.end = b.slice();
  }
  /* world point i of the channel for the live end e */
  pt(i, e, out) {
    const a = this.from, t = this.t[i], dx = e[0] - a[0], dz = e[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const px = -dz / L, pz = dx / L;                         // horizontal perpendicular
    out[0] = a[0] + dx * t + px * this.lat[i];
    out[2] = a[2] + dz * t + pz * this.lat[i];
    // over the surface, then up onto the hull over the last stretch (to the strike point's height)
    const g = this.gy[i], ge = this.gy[this.n], h = Math.max(0, e[1] - ge);
    const sl = clamp(Math.max(h * 2.5, 30) / this.D, .02, .3), c = t < 1 - sl ? 0 : (t - 1 + sl) / sl, k = c * c * (3 - 2 * c);
    out[1] = g + h * k + this.up[i] * (1 - k * .7);
    if (i === this.n) { out[0] = e[0]; out[1] = e[1]; out[2] = e[2]; }
    return out;
  }
  /* draw. e: live end (world), reach 0..1 (the leader's progress), I: brightness, pal { core, glow }, leading: bool,
     age: seconds since the fork started (flicker of the leader) */
  draw(fx, V, e, reach, I, pal, leading, age) {
    if (I < .004 && !leading) return 0;
    const n = this.n, nVis = reach * n, A = this._a, B = this._b, P = this._P, core = pal.core, gl = pal.glow;
    let dots = 0, k3 = 0;
    const iEnd = Math.min(n, Math.ceil(nVis));
    this.pt(0, e, A);
    for (let i = 0; i < iEnd; i++) {
      this.pt(i + 1, e, B);
      const frac = Math.min(1, nVis - i);
      const zc = V.depth(A[0], A[1], A[2]);
      if (zc > V.near) {
        // the leader's channel is dimmer behind the head and flickers; the return stroke is even
        const behind = leading ? (nVis - i) / Math.max(1, n * .35) : 0;
        const al = leading ? Math.min(1, .95 * Math.exp(-behind * 1.2) + .28) * (.8 + .2 * Math.sin(age * 90 + i)) : Math.min(1, I);
        const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * frac;
        const m = Math.max(1, Math.min(120, Math.ceil(L * V.fl / zc / 1.25)));
        for (let k = 0; k < m; k++) {
          const f = k / m * frac, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, z = A[2] + (B[2] - A[2]) * f;
          fx.dotXYZ(x, y, z, 2, core[0], core[1], core[2], al, 'add');
          dots++;
          if ((k3++ % 3) === 0) { P[0] = x; P[1] = y; P[2] = z; fx.glow(P, 8, gl, .05 * al); if ((k3 % 2) === 0) fx.glow(P, 18, gl, .018 * al); }
        }
      }
      A[0] = B[0]; A[1] = B[1]; A[2] = B[2];
    }
    // the tendrils
    for (const b of this.br) {
      if (nVis <= b.i) continue;
      const g = sat((nVis - b.i) / (n * .18)), al = (leading ? .55 : Math.min(1, I * .7)) * b.w / .5;
      if (al < .01) continue;
      this.pt(b.i, e, A);
      const dx = e[0] - this.from[0], dz = e[2] - this.from[2], L = Math.hypot(dx, dz) || 1, fx0 = dx / L, fz0 = dz / L;
      const mm = Math.ceil(b.m * g);
      let px = A[0], py = A[1], pz = A[2];
      for (let j = 1; j <= mm; j++) {
        const q = b.pts, o = j * 3;
        const x = A[0] + fx0 * q[o] - fz0 * q[o + 1], y = A[1] + q[o + 2], z = A[2] + fz0 * q[o] + fx0 * q[o + 1];
        const zc = V.depth(x, y, z);
        if (zc > V.near) {
          const s = Math.max(1, Math.min(40, Math.ceil(Math.hypot(x - px, y - py, z - pz) * V.fl / zc / 1.6)));
          for (let k = 0; k < s; k++) { const f = k / s; fx.dotXYZ(px + (x - px) * f, py + (y - py) * f, pz + (z - pz) * f, 1, core[0], core[1], core[2], al * (1 - .5 * j / b.m), 'add'); dots++; }
        }
        px = x; py = y; pz = z;
      }
    }
    // the head
    if (leading && nVis < n) {
      this.pt(Math.floor(nVis), e, A);
      fx.dotXYZ(A[0], A[1], A[2], 3, 255, 255, 255, 1, 'add');
      fx.glow(A, 14, gl, .4);
    }
    return dots;
  }
  /* the return stroke of a fork (s after it connects): the main bolt's two flickers, a little faster */
  static stroke(tr) { return Bolt.stroke(tr * 1.15); }
}

/* the leader's progress for a fork that takes `dur` s to connect: fast, a touch of hesitation mid-way (stepped) */
export function reachOf(a, dur) {
  if (a <= 0) return 0;
  const u = clamp(a / dur, 0, 1);
  return u + .06 * Math.sin(u * Math.PI * 3) * (1 - u);
}
