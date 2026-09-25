/* Smoke trails: puffs laid every few metres of a flight, each with the moment the head passed it, so a puff's
   age is exact at any time and it is drawn analytically: it leaves the nozzle with the exhaust (backwards, under
   drag), rises a little, drifts with the wind (more with height), spreads with the square root of its age and
   fades; fresh smoke is white-hot, lime for a moment (the streak), then pale smoke (pe_aegis_fx drawTrail,
   pc_anatomy_film drawSmoke). The records are emission data, not particle state: nothing is integrated. */
import { WH, LIME, HOT, SMOKE, GT, GW, GM, sat, ss, clamp, hsh, noise, dragH } from './core.js';

/* stages: np dots per puff near, B brightness, tau / life (s), spr (m, spread scale), ds (m between puffs),
   v0 (m/s exhaust kick backwards), kd (1/s exhaust drag), rise (m/s), hot (seconds the gas glows) */
export const STAGE = {
  boost:   { id: 0, cap: 44, dens: 1, B: .85, tau: 24, life: 75, spr: 2.2, ds: .6, v0: 42, kd: 2.4, rise: .45, hot: 1.6, col: 1 },
  sustain: { id: 1, cap: 18, dens: .6, B: .4, tau: 9, life: 20, spr: .9, ds: 2.5, v0: 30, kd: 2.8, rise: .35, hot: 1.2, col: 1 },
  glide:   { id: 2, cap: 6, dens: .35, B: .22, tau: 4.5, life: 9, spr: .6, ds: 6, v0: 0, kd: 1, rise: .2, hot: .6, col: 1 },
  small:   { id: 3, cap: 24, dens: .8, B: .55, tau: 7, life: 16, spr: .7, ds: .6, v0: 25, kd: 3, rise: .3, hot: 1, col: 1 },   // short motors (57E6 booster, Hellfire)
  air:     { id: 4, cap: 1, dens: 1, B: .8, tau: .6, life: 1.6, spr: 0, ds: 10, v0: 0, kd: 1, rise: 0, hot: 0, col: 2 },       // ramjet: the lime air it flew through
  heat:    { id: 5, cap: 2, dens: .3, B: .16, tau: .5, life: 1.2, spr: .25, ds: 8, v0: 0, kd: 1, rise: 0, hot: 0, col: 0 },    // turbojets: a faint shimmer
  wreck:   { id: 6, cap: 40, dens: 1, B: .7, tau: 18, life: 45, spr: 1.4, ds: 1.5, v0: 0, kd: 1, rise: .5, hot: 1.4, col: 1 },   // a burning aircraft going down
  damaged: { id: 7, cap: 16, dens: .6, B: .45, tau: 10, life: 22, spr: .9, ds: 3, v0: 0, kd: 1, rise: .4, hot: .3, col: 1 },  // a hit aircraft trailing smoke
};
const BY_ID = Object.values(STAGE).sort((a, b) => a.id - b.id);
const S = 12;  // record stride: birth, x, y, z, vx, vy, vz, stage, k, ground under it at birth, spacing, path length

export class Trail {
  constructor(cap, seed, ground) {
    this.cap = cap || 4096; this.R = new Float32Array(this.cap * S); this.ground = ground || null;
    this.n = 0; this.head = 0; this.k = 0; this.seed = (seed | 0) * 7919;
    this.lx = NaN; this.ly = 0; this.lz = 0; this.lt = 0; this.carry = 0; this.len = 0;
    this.last = -1e9; this.maxLife = 0; this.t0 = 0; this.cx = 0; this.cy = 0; this.cz = 0; this.rad = 0; this.bk = 0;
  }
  /* the head reached (x, y, z) at time t in stage st, flying along unit axis (ax, ay, az); lays puffs on the way */
  feed(t, x, y, z, st, ax, ay, az) {
    if (this.lx !== this.lx) { this.lx = x; this.ly = y; this.lz = z; this.lt = t; this.carry = 0; this.t0 = t; return; }
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz, L = Math.hypot(dx, dy, dz), dt = t - this.lt;
    if (L < 1e-3 || dt <= 0) { this.lt = t; return; }
    // dense off the launcher (the column the lens sees close), wider apart as the round gets away (the puffs have
    // grown by then): 4x the stage spacing after the first 1.2 km of trail
    const ds = st.ds * Math.min(4, 1 + this.len / 400);
    this.len += L;
    let s = ds - this.carry;
    while (s <= L) {
      const f = s / L, i = this.head, o = i * S, R = this.R, k = this.k++;
      const j = (this.seed + k * 3) & GM, v0 = st.v0 * (.8 + .5 * hsh(k, this.seed));
      R[o] = this.lt + dt * f; R[o + 1] = this.lx + dx * f; R[o + 2] = this.ly + dy * f; R[o + 3] = this.lz + dz * f;
      R[o + 4] = -ax * v0 + GT[j] * v0 * .12; R[o + 5] = -ay * v0 + GT[(j + 1) & GM] * v0 * .12; R[o + 6] = -az * v0 + GT[(j + 2) & GM] * v0 * .12;
      R[o + 7] = st.id; R[o + 8] = k; R[o + 9] = this.ground ? this.ground(R[o + 1], R[o + 3]) : 0; R[o + 10] = ds; R[o + 11] = this.len - L + s;
      this.head = (i + 1) % this.cap; if (this.n < this.cap) this.n++;
      s += ds;
    }
    this.carry = L - (s - ds);
    this.lx = x; this.ly = y; this.lz = z; this.lt = t;
    this.last = t; if (st.life > this.maxLife) this.maxLife = st.life;
  }
  /* nothing left to draw at time t */
  done(t) { return t - this.last > this.maxLife + 1; }
  /* rough bounds (for culling a whole trail) */
  bounds() {
    let mnx = 1e30, mny = 1e30, mnz = 1e30, mxx = -1e30, mxy = -1e30, mxz = -1e30;
    const R = this.R;
    for (let i = 0; i < this.n; i += 8) { const o = i * S; if (R[o + 1] < mnx) mnx = R[o + 1]; if (R[o + 1] > mxx) mxx = R[o + 1]; if (R[o + 2] < mny) mny = R[o + 2]; if (R[o + 2] > mxy) mxy = R[o + 2]; if (R[o + 3] < mnz) mnz = R[o + 3]; if (R[o + 3] > mxz) mxz = R[o + 3]; }
    this.cx = (mnx + mxx) / 2; this.cy = (mny + mxy) / 2; this.cz = (mnz + mxz) / 2; this.rad = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) / 2 + 200;
  }
  draw(C, k) {
    const t = C.t, R = this.R, V = C.V, dot = C.dot, n = this.n, cap = this.cap, q = C.q;
    if (!n || t - this.last > this.maxLife) return;
    if (this.k - this.bk >= 16 || this.rad === 0) { this.bounds(); this.bk = this.k; }
    if (!V.vis(this.cx, this.cy, this.cz, this.rad)) return;
    const wx = C.wind[0], wz = C.wind[2], wsp = Math.hypot(wx, wz), e = V.eye, f = V.f, fl = V.fl, near = V.near;
    k = k === undefined ? 1 : k;
    // newest first: the hot head is never the part a budget cuts
    for (let c = 0; c < n; c++) {
      const i = (this.head - 1 - c + cap) % cap, o = i * S, birth = R[o], age = t - birth;
      if (age < 0) continue;
      const st = BY_ID[R[o + 7]];
      if (age > st.life) continue;
      const kk = R[o + 8];
      if (st.col === 2) {
        // ramjet: the lime line of air behind the round
        const px = R[o + 1], py = R[o + 2], pz = R[o + 3], zc = (px - e[0]) * f[0] + (py - e[1]) * f[1] + (pz - e[2]) * f[2];
        if (zc < near) continue;
        const al = k * st.B * Math.exp(-age / st.tau) * (1 - age / st.life);
        if (al < .02) continue;
        const pxm = fl / zc; if (st.ds * pxm < 1.2 && (kk & 1)) continue;
        dot(px, py, pz, zc < 250 ? 2 : 1, LIME[0], LIME[1], LIME[2], al);
        continue;
      }
      const x0 = R[o + 1], y0 = R[o + 2], z0 = R[o + 3];
      // far out the puffs land < 1.5 px apart: keep every other (every fourth...) and brighten those
      // (tested first: most of a long trail is skipped here, before any of the costly maths)
      const zc0 = (x0 - e[0]) * f[0] + (y0 - e[1]) * f[1] + (z0 - e[2]) * f[2];
      let thin = 0;
      // near the launcher the exhaust blasts its first tens of metres wide
      const pl = R[o + 11], blast = st.id === 0 && pl < 50 ? 3.2 * (1 - pl / 50) : 0;
      const spr = st.spr + blast, sa = Math.sqrt(age), rad = spr * (.25 + 1.1 * sa + .16 * age);
      if (age > 1.2 && zc0 > 50) {
        // keep puffs a tenth of their own size apart on screen (at least a third of a pixel)
        const pm = fl / zc0, sp = R[o + 10] * pm, rw = rad * pm * .09, want = rw < .3 ? .3 : rw > 2.5 ? 2.5 : rw;
        thin = sp > want ? 0 : sp * 2 > want ? 1 : sp * 4 > want ? 3 : sp * 8 > want ? 7 : sp * 16 > want ? 15 : 31;
        if (kk & thin) continue;
      }
      const env = k * st.B * Math.exp(-age / st.tau) * (age > st.life * .6 ? 1 - ss(st.life * .6, st.life, age) : 1);
      if (env < .012) continue;
      const reach = rad * 3 + age * (wsp * 1.6 + 1) + 20;
      if (zc0 < -reach || !V.vis(x0, y0, z0, reach)) continue;
      // exhaust kick, wind (stronger with height), a slow meander
      const m1 = dragH(st.kd, age), wsh = 1 + Math.max(0, y0) / 300, cA = 2 * sa * (st.spr > .5 ? 1 : .3);
      const ph = kk * .61803 + this.seed * .001, ta = age * .21;
      const g0y = R[o + 9];
      const bx = x0 + R[o + 4] * m1 + wx * wsh * age + cA * Math.sin(ta + ph * 6.1);
      const by = Math.max(g0y + .4, y0 + R[o + 5] * m1 + st.rise * age + cA * .5 * Math.sin(ta * 1.3 + ph * 4.7));
      const bz = z0 + R[o + 6] * m1 + wz * wsh * age + cA * Math.cos(ta * .9 + ph * 5.3);
      const zc = (bx - e[0]) * f[0] + (by - e[1]) * f[1] + (bz - e[2]) * f[2];
      if (zc < near + rad * .4) continue;
      const pxm = fl / zc, rp = rad * pxm;
      if (!V.vis(bx, by, bz, rad * 2.5 + 2)) continue;
      // hot white at birth, lime for a moment, then smoke
      const w = age < st.hot * .2 ? Math.exp(-age * 16 / st.hot) : 0, l = age < st.hot ? (1 - w) * Math.exp(-age * 6 / st.hot) : 0, g = 1 - w - l;
      const tint = Math.exp(-age / 6) * .5;
      const gr = SMOKE[0] + (226 - SMOKE[0]) * tint, gg = SMOKE[1] + (238 - SMOKE[1]) * tint, gb = SMOKE[2] + (196 - SMOKE[2]) * tint;
      const cr = HOT[0] * w + LIME[0] * l + gr * g, cg = HOT[1] * w + LIME[1] * l + gg * g, cb = HOT[2] * w + LIME[2] * l + gb * g;
      // dots per puff from its size on screen (the anatomy's rule), fewer for the thin stages
      const np = Math.max(1, Math.round(Math.min(st.cap, 3.5 + rp * rp * .03) * st.dens * q));
      // the camera inside the smoke: a thin haze, not a scatter of bright specks
      const near2 = ss(rad * .5, rad * 2.2, zc);
      const bb = env * (1 + 2.2 * (w + l)) * Math.min(1, 2.4 / Math.sqrt(np / 3)) * (thin ? 1 + .25 * Math.log2(thin + 1) : 1) * near2;
      if (bb < .012) continue;
      const sz = zc < 1300 || (w + l > .3 && zc < 9000) ? 2 : 1, gy = g0y + .2;
      const g0 = (this.seed + kk * 5) | 0;
      for (let m = 0; m < np; m++) {
        const j = (g0 + m * 1733) & GM, oy = GT[(j + 1) & GM] * .8 * rad;
        if (by + oy < gy) continue;
        const bv = bb * GW[j];
        dot(bx + GT[j] * rad, by + oy, bz + GT[(j + 2) & GM] * rad, sz, cr, cg, cb, bv > 1 ? 1 : bv);
      }
    }
  }
}
