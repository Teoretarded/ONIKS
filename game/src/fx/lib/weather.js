/* Weather: lightning (oh_storm_sky: a flicker envelope with dips between the return strokes, a jagged channel by
   midpoint displacement with branches forking down and out, strokes spreading in the cloud base; the anatomy's
   bolt: a white-lime core with a lime breath round it, sparks where it strikes) and rain (a world lattice of
   drops round the lens, streaked by their fall; shafts hanging under the squalls for the far view). */
import { WH, LIME, TAU, G2, GT, GM, sat, ss, clamp, hsh, rng } from './core.js';

function frac(a, b, lv, k, r) {
  let pts = [a, b];
  for (let l = 0; l < lv; l++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      out.push([(p[0] + q[0]) / 2 + (r() - .5) * 2 * k * L, (p[1] + q[1]) / 2 + (r() - .5) * k * L * .6, (p[2] + q[2]) / 2 + (r() - .5) * 2 * k * L], q);
    }
    pts = out;
  }
  return pts;
}

/* o: { t0, pos (strike point on the ground / sea), top (in the cloud), seed, s (strength 0..1), kind 'cg' | 'ic' } */
export class Lightning {
  constructor(o) {
    const r = rng(o.seed || 17), G = o.pos.slice(), T = o.top ? o.top.slice() : [G[0], G[1] + 3200, G[2]];
    T[0] += (r() - .5) * 360; T[2] += (r() - .5) * 360;
    this.t0 = o.t0; this.G = G; this.T = T; this.s = o.s || 1; this.kind = o.kind || 'cg'; this.seed = o.seed || 17;
    this.durF = this.kind === 'ic' ? .22 + .1 * r() : .14 + .05 * r();
    this.dips = this.kind === 'ic' ? [[.04 + .02 * r(), .6], [.09 + .03 * r(), .45], [.15 + .03 * r(), .65]] : [[.032 + .01 * r(), .55], [.074 + .015 * r(), .35 + .2 * r()], [.112 + .015 * r(), .6]];
    this.lead = .035 + .02 * r();
    this.dur = this.lead + this.durF + 1.2;
    const lines = [];
    if (this.kind === 'cg') {
      const main = frac(T, G, 7, .2, r);
      lines.push({ p: main, w: 1, at: 0 });
      const nb = 4 + Math.floor(r() * 4);
      for (let k = 0; k < nb; k++) {
        const i0 = Math.floor(main.length * (.08 + .6 * r())), p0 = main[i0], p6 = main[Math.min(main.length - 1, i0 + 6)];
        let dx = p6[0] - p0[0], dy = p6[1] - p0[1], dz = p6[2] - p0[2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        let ox = dx + (r() - .5) * 1.6, oy = -.4 - .5 * r(), oz = dz + (r() - .5) * 1.6; const lo = Math.hypot(ox, oy, oz); ox /= lo; oy /= lo; oz /= lo;
        const len = (160 + 420 * r()) * (T[1] - G[1]) / 3200, p1 = [p0[0] + ox * len, Math.max(G[1] + 20, p0[1] + oy * len), p0[2] + oz * len];
        const br = frac(p0, p1, 5, .24, r);
        lines.push({ p: br, w: .5 + .2 * r(), at: i0 / main.length });
        if (r() < .5) { const j = Math.floor(br.length * (.3 + .4 * r())), q0 = br[j]; lines.push({ p: frac(q0, [q0[0] + (r() - .5) * 160, Math.max(G[1] + 10, q0[1] - 60 - 120 * r()), q0[2] + (r() - .5) * 160], 4, .25, r), w: .3, at: i0 / main.length + .05 }); }
      }
    }
    // strokes spreading in the cloud base from the channel's top
    for (let k = 0; k < (this.kind === 'ic' ? 5 : 3); k++) { const a = r() * TAU, l = 400 + 800 * r(); lines.push({ p: frac(T, [T[0] + Math.cos(a) * l, T[1] - 60 + 120 * r(), T[2] + Math.sin(a) * l], 5, .18, r), w: .35, cloud: true, at: 0 }); }
    this.lines = lines;
    // sparks where it strikes
    this.SP = new Float32Array(40 * 4);
    for (let i = 0; i < 40; i++) { const a = r() * TAU, s = 4 + 14 * r(); this.SP[i * 4] = Math.cos(a) * s; this.SP[i * 4 + 1] = 3 + 12 * r(); this.SP[i * 4 + 2] = Math.sin(a) * s; this.SP[i * 4 + 3] = .3 + .5 * r(); }
  }
  /* brightness at age a (after the leader): a plateau with dips, a fast fall, a faint afterglow */
  flick(a) {
    if (a < 0 || a > 1.6) return 0;
    let v = ss(0, .006, a) * (1 - ss(this.durF, this.durF + .06, a));
    for (const [o, dep] of this.dips) { const b = (a - o) / .011; v *= 1 - dep * Math.exp(-b * b); }
    return Math.max(v, .1 * Math.exp(-Math.max(0, a - this.durF) / .35) * ss(0, .01, a)) * this.s;
  }
  /* 0..1: how lit the scene is (for rain freezing etc.) */
  level(age) { return this.flick(age - this.lead); }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, G = this.G, T = this.T;
    const mid = [(G[0] + T[0]) / 2, (G[1] + T[1]) / 2, (G[2] + T[2]) / 2];
    const tr = age - this.lead, leading = tr < 0, I = leading ? .5 : this.flick(tr);
    const reach = leading ? sat(age / this.lead) : 1;
    // the light: everything within a few km lifts, the whole frame breathes
    if (!leading && I > .01) {
      C.light(mid[0], mid[1], mid[2], 235, 245, 255, 1.0 * I, 5200);
      C.light(G[0], G[1] + 60, G[2], 240, 255, 230, .7 * I, 1400);
      const d = V.dist(mid[0], mid[1], mid[2]);
      C.lift(.085 * I * clamp(9000 / d, .3, 1), 225, 238, 255);
    }
    if (!V.vis(mid[0], mid[1], mid[2], (T[1] - G[1]) * .75 + 900)) return;
    const lin = leading ? .45 : Math.max(I / this.s, .16 * (1 - ss(this.durF, this.durF + .45, tr)));
    if (lin > .004) for (const l of this.lines) {
      if (leading && l.cloud) continue;
      const al = lin * l.w * (l.cloud ? .7 : 1) * this.s;
      if (al < .004) continue;
      const p = l.p, main = l.w >= 1;
      // the leader steps down the channel; branches appear as it passes them
      const vis = leading ? (main ? reach : sat((reach - l.at) * 4)) : 1;
      const nSeg = Math.max(0, Math.min(p.length - 1, Math.floor((p.length - 1) * vis)));
      let k3 = 0;
      for (let i = 0; i < nSeg; i++) {
        const a = p[i], b = p[i + 1];
        const zc = V.depth(a[0], a[1], a[2]); if (zc < V.near) continue;
        const pxm = V.fl / zc, L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L * pxm / (main ? 1.1 : 1.5)));
        for (let k = 0; k < n; k++) {
          const f = k / n, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
          dot(x, y, z, main ? (leading ? 2 : 3) : 2, 248, 255, 232, Math.min(1, al * 1.1));
          if ((k3++ % 4) === 0) { C.glow(x, y, z, main ? 9 : 6, LIME[0], LIME[1], LIME[2], .05 * al); if (main) C.glow(x, y, z, 21, LIME[0] * .6, LIME[1] * .6, LIME[2] * .6, .016 * al); }
        }
      }
    }
    // sparks at the strike
    if (!leading && tr < .9 && this.kind === 'cg') for (let i = 0; i < 40; i++) {
      const S = this.SP, o = i * 4; if (tr > S[o + 3]) continue;
      const w = 1 - tr / S[o + 3], y = G[1] + S[o + 1] * tr - 11 * tr * tr; if (y < G[1]) continue;
      dot(G[0] + S[o] * tr, y, G[2] + S[o + 2] * tr, 2, 230, 255, 170, w);
    }
  }
}

/* ---------------- rain ---------------- */
/* near rain: a world lattice of drops round the lens in layers by distance, each drop a short streak of dots along
   its fall (shorter while lightning freezes it). k 0..1 intensity, wind [x, 0, z] m/s, flash 0..1 */
const RL = [
  { c: 4, z0: .8, z1: 8, k: 16, a: .2, ex: .028 },
  { c: 8, z0: 8, z1: 24, k: 22, a: .19, ex: .034 },
  { c: 16, z0: 24, z1: 64, k: 30, a: .16, ex: .04 },
  { c: 32, z0: 64, z1: 150, k: 36, a: .11, ex: .045 },
];
const OFF = new Float32Array(4096 * 3); { const r = rng(4242); for (let i = 0; i < OFF.length; i++) OFF[i] = r(); }
const modp = (v, m) => ((v % m) + m) % m;
export function drawRain(C, k, flash) {
  if (k < .01) return;
  const V = C.V, dot = C.dot, e = V.eye, cf = V.f, cr = V.r, cu = V.u, t = C.t;
  if (e[1] > 1800) return;                                // above the cloud base: no rain round the lens
  const vx = C.wind[0] * .92, vy = -8.6, vz = C.wind[2] * .92;
  const tW = V.tx, tH = V.ty;
  for (const ly of RL) {
    const c = ly.c, K = Math.round(ly.k * k * C.q); if (K < 1) continue;
    const ex = ly.ex + (.006 - ly.ex) * flash, sx = vx * ex, sy = vy * ex, sz = vz * ex;
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (const zz of [ly.z0, ly.z1]) for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const px = e[0] + cf[0] * zz + cr[0] * a * tW * zz + cu[0] * b * tH * zz, py = e[1] + cf[1] * zz + cr[1] * a * tW * zz + cu[1] * b * tH * zz, pz = e[2] + cf[2] * zz + cr[2] * a * tW * zz + cu[2] * b * tH * zz;
      if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py; if (pz < mnz) mnz = pz; if (pz > mxz) mxz = pz;
    }
    const i0 = Math.floor(mnx / c), i1 = Math.floor(mxx / c), j0 = Math.floor(Math.max(mny, -2) / c), j1 = Math.floor(mxy / c), k0 = Math.floor(mnz / c), k1 = Math.floor(mxz / c);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > 6000) continue;
    const ox = modp(vx * t, c), oy = modp(vy * t, c), oz = modp(vz * t, c), span = ly.z1 - ly.z0;
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) for (let ck = k0; ck <= k1; ck++) {
      const hc = (Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ Math.imul(ck, 83492791)) >>> 0;
      const bx = ci * c, by = cj * c, bz = ck * c;
      for (let m = 0; m < K; m++) {
        const q = ((hc + m * 1031) & 4095) * 3;
        let px = OFF[q] * c + ox, py = OFF[q + 1] * c + oy, pz = OFF[q + 2] * c + oz;
        if (px >= c) px -= c; if (py >= c) py -= c; if (pz >= c) pz -= c;
        px += bx; py += by; pz += bz;
        if (py < C.ground(px, pz)) continue;
        const dx = px - e[0], dy = py - e[1], dz = pz - e[2], zc = dx * cf[0] + dy * cf[1] + dz * cf[2];
        if (zc < ly.z0 || zc > ly.z1) continue;
        const xc = dx * cr[0] + dy * cr[1] + dz * cr[2], yc = dx * cu[0] + dy * cu[1] + dz * cu[2];
        if (xc > zc * tW * 1.08 || -xc > zc * tW * 1.08 || yc > zc * tH * 1.1 || -yc > zc * tH * 1.1) continue;
        const u = (zc - ly.z0) / span;
        const al = 1.4 * ly.a * k * (1 - .45 * u) * ss(ly.z0 * .95, ly.z0 * 1.4 + .6, zc) * (.55 + .45 * OFF[q + 1]) * (1 + 2.5 * flash);
        // the streak: its length on screen decides how many dots it needs
        const pl = Math.hypot(sx, sy, sz) * V.fl / zc, ns = Math.max(1, Math.min(8, Math.round(pl / 1.5)));
        for (let s = 0; s < ns; s++) { const f = s / ns; dot(px - sx * f, py - sy * f, pz - sz * f, 1, 222, 228, 232, Math.min(1, al * 2.2)); }
      }
    }
  }
}
/* rain shafts under the squall cells, for the far view: sparse streaks falling from the cloud base.
   squalls: [{ x, z, r }]; k intensity */
export function drawShafts(C, squalls, k) {
  if (!squalls || !squalls.length || k < .01) return;
  const V = C.V, dot = C.dot, t = C.t, CB = 1500;
  for (let s = 0; s < squalls.length; s++) {
    const S = squalls[s];
    if (!V.vis(S.x, CB / 2, S.z, S.r + CB)) continue;
    const zc = V.depth(S.x, CB / 2, S.z); if (zc < S.r * .3) continue;       // inside it: the near rain does it
    const pxm = V.fl / zc, n = Math.round(clamp(S.r * pxm * 6, 60, 2400) * C.q * k);
    for (let i = 0; i < n; i++) {
      const th = hsh(i, s * 7 + 1) * TAU, rr = S.r * Math.sqrt(hsh(i, s * 7 + 2)), x = S.x + Math.cos(th) * rr, z = S.z + Math.sin(th) * rr;
      const ph = (t * 9 / CB + hsh(i, s * 7 + 3)) % 1, y = CB * (1 - ph);
      const g = C.ground(x, z); if (y < g) continue;
      const edge = 1 - rr / S.r;
      const al = .16 * k * sat(edge * 3) * ss(0, .15, ph) * (.5 + .5 * hsh(i, s * 7 + 4));
      dot(x, y, z, 1, 214, 220, 226, al); dot(x - C.wind[0] * .5, y + 25, z - C.wind[2] * .5, 1, 214, 220, 226, al * .6);
    }
  }
}
