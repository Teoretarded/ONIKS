/* Weather: natural lightning (oh_storm_sky: a stepped leader, then 2-4 return strokes with dark gaps between them, a
   continuing glow; a jagged channel by midpoint displacement from inside the cloud down to the sea, the land or a
   ship's mast, branches forking down and out, strokes crawling through the cloud from the channel's top) and the
   rain round the lens (a world lattice of drops, streaked by their fall, frozen by a flash).
   Natural lightning is WHITE with a faint cold tint, never lime (lime is the player's SCAN). It reads at 20-40 km:
   the channel keeps a minimum width and a halo in screen pixels, it lights the terrain and the hulls round it
   (R.light), lifts the frame in proportion to how close it is, and the cloud it came from lights up (the storm's
   cloud is drawn by SENSORS: ui/sensors/weather.js, which shares this file's flash envelope).
   Timing is real time (a flash looks the same at x1 and x32); every shape is seeded by the sim event's seed. */
import { TAU, sat, ss, clamp, hsh, rng } from './core.js';

export const BOLT = { core: [250, 252, 255], cold: [214, 226, 255], halo: [208, 220, 255], veil: [196, 206, 228], spark: [236, 244, 255] };

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

/* ---------- the flash envelope (shared with the cloud, SENSORS) ----------
   cg: a stepped leader (faint), then n return strokes (a sharp peak each, ~20 ms decay, 40-110 ms apart: the flicker
   the eye catches), a continuing current glowing under them; ic: softer pulses spreading in the cloud.
   seed: the sim event's seed; a: age (s, real time); returns 0..~1.2 */
export function flashLead(seed) { return .05 + .035 * hsh(seed, 1); }
export function flashLevel(seed, kind, a) {
  if (a < 0 || a > 1.6) return 0;
  if (kind === 'ic') {
    const n = 3 + Math.floor(hsh(seed, 2) * 3);
    let v = .22 * ss(0, .04, a) * Math.exp(-a / .35), tk = 0;
    for (let k = 0; k < n; k++) {
      if (k) tk += .05 + .09 * hsh(seed, 10 + k);
      const b = a - tk; if (b < 0) break;
      const pk = k ? .45 + .55 * hsh(seed, 20 + k) : .8;
      v = Math.max(v, pk * Math.exp(-b / .045) * ss(0, .012, b));
    }
    return v;
  }
  const L = flashLead(seed);
  if (a < L) return .12 * a / L;
  const b0 = a - L, n = 2 + Math.floor(hsh(seed, 2) * 2.6);
  let v = .2 * Math.exp(-b0 / .22), tk = 0;
  for (let k = 0; k < n; k++) {
    if (k) tk += .04 + .07 * hsh(seed, 10 + k);
    const b = b0 - tk; if (b < 0) break;
    const pk = k ? .55 + .4 * hsh(seed, 20 + k) : 1;
    v = Math.max(v, pk * Math.exp(-b / .022));
  }
  return v;
}
/* which stroke is up at age a (0 the first; -1 during the leader or a gap): later strokes run the main channel only */
function strokeAt(seed, a) {
  const L = flashLead(seed); if (a < L) return -1;
  const b0 = a - L, n = 2 + Math.floor(hsh(seed, 2) * 2.6);
  let tk = 0, cur = -1;
  for (let k = 0; k < n; k++) { if (k) tk += .04 + .07 * hsh(seed, 10 + k); if (b0 >= tk) cur = k; }
  return cur;
}

/* o: { t0 (real clock), pos (the strike: sea, ground or a mast), top (in the cloud), base (the cloud base, m), seed,
        s (strength 0..1), kind 'cg' | 'ic', big (false: a flash that came too soon after another: no frame lift) } */
export class Lightning {
  constructor(o) {
    const seed = o.seed || 17, r = rng(seed * 7 + 3);
    this.t0 = o.t0; this.seed = seed; this.s = o.s || 1; this.kind = o.kind || 'cg'; this.big = o.big !== false;
    this.base = o.base || 1200;
    this.dur = 1.3;
    const G = o.pos.slice();
    const T = o.top ? o.top.slice() : [G[0] + (r() - .5) * 700, Math.max(G[1] + 2500, this.base + 2600), G[2] + (r() - .5) * 700];
    this.G = G; this.T = T;
    const lines = [];
    if (this.kind === 'cg') {
      const H = T[1] - G[1];
      const main = frac(T, G, 8, .15, r);
      lines.push({ p: main, w: 1, at: 0, main: true });
      // branches off the upper two thirds, down and out; some of them long, a few with their own forks
      const nb = 6 + Math.floor(r() * 5);
      for (let k = 0; k < nb; k++) {
        const i0 = Math.floor(main.length * (.06 + .62 * r())), p0 = main[i0], p6 = main[Math.min(main.length - 1, i0 + 10)];
        let dx = p6[0] - p0[0], dy = p6[1] - p0[1], dz = p6[2] - p0[2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        let ox = dx + (r() - .5) * 1.9, oy = -.25 - .55 * r(), oz = dz + (r() - .5) * 1.9; const lo = Math.hypot(ox, oy, oz); ox /= lo; oy /= lo; oz /= lo;
        let len = H * (.08 + .3 * r() * r() + (r() < .25 ? .18 : 0));
        // a branch dies out in the air (never runs along the ground)
        const floor = G[1] + H * (.1 + .12 * r());
        if (p0[1] + oy * len < floor) len = Math.max(H * .04, (p0[1] - floor) / Math.max(.2, -oy));
        const p1 = [p0[0] + ox * len, Math.max(floor, p0[1] + oy * len), p0[2] + oz * len];
        const br = frac(p0, p1, 6, .2, r);
        lines.push({ p: br, w: .45 + .3 * r(), at: i0 / main.length });
        const nf = r() < .6 ? 1 + Math.floor(r() * 2) : 0;
        for (let f = 0; f < nf; f++) {
          const j = Math.floor(br.length * (.25 + .5 * r())), q0 = br[j], fl = len * (.25 + .35 * r());
          lines.push({ p: frac(q0, [q0[0] + (r() - .5) * fl, Math.max(G[1] + H * .06, q0[1] - fl * (.3 + .5 * r())), q0[2] + (r() - .5) * fl], 5, .22, r), w: .28, at: i0 / main.length + .06 });
        }
      }
    }
    // strokes crawling through the cloud from the channel's top (inside the cloud: veiled)
    const nc = this.kind === 'ic' ? 4 + Math.floor(r() * 3) : 3 + Math.floor(r() * 3);
    for (let k = 0; k < nc; k++) {
      const a = r() * TAU, l = (this.kind === 'ic' ? 1200 : 700) + 2600 * r();
      const e = [T[0] + Math.cos(a) * l, T[1] + (r() - .6) * 500, T[2] + Math.sin(a) * l];
      lines.push({ p: frac(T, e, 6, .17, r), w: .5, cloud: true, at: 0 });
    }
    this.lines = lines;
    // sparks and spray where it strikes
    this.SP = new Float32Array(56 * 4);
    for (let i = 0; i < 56; i++) { const a = r() * TAU, s = 5 + 20 * r(); this.SP[i * 4] = Math.cos(a) * s; this.SP[i * 4 + 1] = 4 + 16 * r(); this.SP[i * 4 + 2] = Math.sin(a) * s; this.SP[i * 4 + 3] = .25 + .55 * r(); }
  }
  /* 0..1: how lit the scene is (rain freezing etc.) */
  level(age) { return flashLevel(this.seed, this.kind, age) * this.s; }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, glow = C.halo, G = this.G, T = this.T, cg = this.kind === 'cg', base = this.base;
    const lead = cg ? flashLead(this.seed) : 0, leading = cg && age < lead;
    const I = flashLevel(this.seed, this.kind, age) * this.s;
    // the light: the land, the sea and the hulls round the channel lift; the whole frame breathes
    const mx = cg ? (G[0] + T[0]) / 2 : T[0], mz = cg ? (G[2] + T[2]) / 2 : T[2], my = cg ? Math.min(base * .7, (G[1] + base) / 2) : T[1];
    if (!leading && I > .01) {
      const d = Math.max(200, V.dist(mx, my, mz));
      if (cg) {
        C.light(mx, my, mz, 222, 232, 255, (this.big ? 1.5 : .8) * I, 7500);
        C.light(G[0], G[1] + 40, G[2], 236, 242, 255, (this.big ? 2 : 1) * I, 1700);
        // the scene round it catches the flash: every return within ~14 km lifts a little (the film's flush)
        if (this.big) C.light(mx, base, mz, 210, 222, 255, .28 * I, 14000);
        if (this.big) C.lift(Math.min(.1, .1 * I * clamp(1500 / d, .03, 1)), 214, 226, 255);
      } else {
        C.light(T[0], T[1] - 800, T[2], 214, 226, 255, .55 * I, 6500);
        if (this.big) C.lift(Math.min(.035, .035 * I * clamp(3000 / d, .05, 1)), 214, 226, 255);
      }
    }
    if (!V.vis(mx, (G[1] + T[1]) / 2, mz, (T[1] - G[1]) * .75 + 4500)) return;
    const st = cg ? strokeAt(this.seed, age) : 0;
    // brightness of the lines: the strokes, and a faint channel glowing on between them
    const lin = leading ? .5 : Math.max(I / this.s, (cg ? .14 : .06) * (1 - ss(.1, .55, age - lead)));
    if (lin < .004) return;
    const dFar = V.dist(G[0], (G[1] + base) / 2, G[2]);
    // the halo keeps the channel readable far off: wider in pixels with distance
    const hR = 12 + 12 * ss(6000, 32000, dFar), hRb = 7 + 6 * ss(6000, 32000, dFar);
    const reach = leading ? sat(age / lead) : 1;
    for (const l of this.lines) {
      if (leading && l.cloud) continue;
      if (!cg && !l.cloud) continue;
      // later strokes run the main channel; the branches only glow with the first
      const wk = l.main ? 1 : l.cloud ? (st <= 0 ? .75 : .35) : (st <= 0 ? 1 : .22);
      const al0 = lin * l.w * wk * this.s * (cg ? 1 : .55);
      if (al0 < .004) continue;
      const p = l.p, main = !!l.main;
      const vis = leading ? (main ? reach : sat((reach - l.at) * 5)) : 1;
      const nSeg = Math.max(0, Math.min(p.length - 1, Math.floor((p.length - 1) * vis)));
      // the halo: a disc every ~.6 of its radius along the line on screen (the same glow at any distance)
      let gacc = 1e9, gacc2 = 1e9;
      const R1 = main ? hR : hRb;
      for (let i = 0; i < nSeg; i++) {
        const a = p[i], b = p[i + 1];
        const zc = V.depth(a[0], a[1], a[2]); if (zc < V.near) continue;
        const pxm = V.fl / zc, L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Lpx = L * pxm;
        const n = Math.max(1, Math.min(90, Math.ceil(Lpx / (main ? 1.1 : 1.5)))), stp = Lpx / n;
        for (let k = 0; k < n; k++) {
          const f = k / n, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
          // inside the cloud the channel is veiled: a dim line through the lit billows
          const veil = y > base + 80, al = veil ? al0 * .34 : al0, rg = veil ? R1 * 1.5 : R1;
          if (veil) dot(x, y, z, main ? 2 : 1, BOLT.veil[0], BOLT.veil[1], BOLT.veil[2], Math.min(1, al * 1.2));
          else dot(x, y, z, main ? (leading ? 2 : 3) : 2, BOLT.core[0], BOLT.core[1], BOLT.core[2], Math.min(1, al * 1.15));
          gacc += stp; gacc2 += stp;
          if (gacc >= rg * .6) { gacc = 0; glow(x, y, z, rg, BOLT.halo[0], BOLT.halo[1], BOLT.halo[2], (main ? (veil ? .06 : .12) : .08) * al); }
          if (main && !veil && gacc2 >= rg * 1.4) { gacc2 = 0; glow(x, y, z, rg * 2.8, BOLT.halo[0] * .7, BOLT.halo[1] * .7, BOLT.halo[2] * .75, .045 * al); }
        }
      }
    }
    if (!cg || leading) return;
    // where it strikes: a white burst, sparks thrown up, a glow on the sea / the ground / the mast
    const tr = age - lead;
    if (tr < .5) glow(G[0], G[1] + 6, G[2], Math.max(14, 90 * V.pxm(G[0], G[1], G[2])), BOLT.cold[0], BOLT.cold[1], BOLT.cold[2], .5 * I);
    if (tr < .9) for (let i = 0; i < 56; i++) {
      const S = this.SP, o = i * 4; if (tr > S[o + 3]) continue;
      const w = 1 - tr / S[o + 3], y = G[1] + S[o + 1] * tr - 11 * tr * tr; if (y < G[1]) continue;
      dot(G[0] + S[o] * tr, y, G[2] + S[o + 2] * tr, 2, BOLT.spark[0], BOLT.spark[1], BOLT.spark[2], w);
    }
  }
}

/* ---------------- rain ---------------- */
/* near rain: a world lattice of drops round the lens in layers by distance, each drop a short streak of dots along
   its fall (shorter while lightning freezes it). k 0..1 intensity (0 outside the cells), wind [x, 0, z] m/s,
   flash 0..1, base: the cloud base over the lens (m; no rain round a lens above it) */
const RL = [
  { c: 4, z0: .8, z1: 8, k: 14, a: .2, ex: .028 },
  { c: 8, z0: 8, z1: 24, k: 20, a: .19, ex: .034 },
  { c: 16, z0: 24, z1: 64, k: 26, a: .16, ex: .04 },
  { c: 32, z0: 64, z1: 150, k: 30, a: .11, ex: .045 },
];
const OFF = new Float32Array(4096 * 3); { const r = rng(4242); for (let i = 0; i < OFF.length; i++) OFF[i] = r(); }
const modp = (v, m) => ((v % m) + m) % m;
export function drawRain(C, k, flash, base) {
  if (k < .01) return;
  const V = C.V, dot = C.dot, e = V.eye, cf = V.f, cr = V.r, cu = V.u, t = C.t;
  if (e[1] > (base || 1500)) return;                     // above the cloud base: no rain round the lens
  const vx = C.wind[0] * .92, vy = -8.6, vz = C.wind[2] * .92;
  const tW = V.tx, tH = V.ty;
  for (const ly of RL) {
    const c = ly.c, K = Math.round(ly.k * k * C.q); if (K < 1) continue;
    const ex = ly.ex + (.006 - ly.ex) * flash, sx = vx * ex, sy = vy * ex, sz = vz * ex;
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (let q = 0; q < 8; q++) {
      const zz = q & 1 ? ly.z1 : ly.z0, a = q & 2 ? 1 : -1, b = q & 4 ? 1 : -1;
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
        for (let s = 0; s < ns; s++) { const f = s / ns; dot(px - sx * f, py - sy * f, pz - sz * f, 1, 222, 228, 236, Math.min(1, al * 2.2)); }
      }
    }
  }
}
