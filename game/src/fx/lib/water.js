/* Water driven by motion, not events.
   Wake      Kelvin wake of a moving ship: rows of dots laid at the stern and left in the water; the two arms
             spread at 19.47 degrees with short feathered crests, the churned centre widens and fades, the prop wash
             boils white right astern, the bow wave rolls off the stem and along the sides (sea_excerpts drawWake,
             pd_engagement_dots drawWake). Rows are emission records (time, place, heading, speed), not particles.
   Downwash  the ring of spray a hovering helicopter blows out on the water (dust on land): periodic particles. */
import { WH, TAU, GT, GM, sat, ss, hsh, noise } from './core.js';

const TANK = Math.tan(19.47 * Math.PI / 180);
const RS = 6;   // row stride: t, x, z, sin, cos, speed

export class Wake {
  /* o: { L (m), B (beam, m), len (m of track the wake lasts), rate (rows / s), seed } */
  constructor(o) {
    o = o || {};
    this.L = o.L || 155; this.B = o.B || 20; this.len = o.len || 1400; this.rate = o.rate || 8; this.seed = (o.seed || 1) * 7919;
    this.cap = 2048; this.R = new Float32Array(this.cap * RS); this.n = 0; this.head = 0; this.k = 0;
    this.lastT = -1e9; this.pos = [0, 0, 0]; this.hdg = 0; this.speed = 0; this.t = 0; this.alive = true;
  }
  /* each frame: the ship's position, heading, speed (m/s) and sim time */
  update(pos, hdg, speed, t) {
    if (t < this.lastT - 1) { this.n = 0; this.lastT = -1e9; }
    const dtE = 1 / this.rate;
    if (this.lastT < t - 4) this.lastT = t - dtE;
    const s = Math.sin(hdg), c = Math.cos(hdg), back = this.L / 2 * .96;
    while (this.lastT + dtE <= t) {
      this.lastT += dtE;
      // where the stern was at that moment (the ship moved on since)
      const d = (t - this.lastT) * speed, o = this.head * RS, R = this.R;
      R[o] = this.lastT; R[o + 1] = pos[0] - s * (back + d); R[o + 2] = pos[2] - c * (back + d); R[o + 3] = s; R[o + 4] = c; R[o + 5] = speed;
      this.head = (this.head + 1) % this.cap; if (this.n < this.cap) this.n++; this.k++;
    }
    this.pos[0] = pos[0]; this.pos[1] = pos[1]; this.pos[2] = pos[2]; this.hdg = hdg; this.speed = speed; this.t = t;
  }
  done(t) { return !this.alive && (this.n === 0 || t - this.lastT > this.len / 4 + 30); }
  draw(C, a) {
    a = a === undefined ? 1 : a;
    const V = C.V, dot = C.dot, t = C.t, R = this.R, cap = this.cap, q = C.q, B = this.B, L = this.L;
    const P = this.pos;
    if (!V.vis(P[0], 0, P[2], this.len + L)) return;
    const pxS = V.pxm(P[0], 0, P[2]);
    // rows far off land closer than a pixel: keep one in 2^k
    const sp = this.speed / this.rate * Math.max(pxS, .0001);
    const thin = sp > 1.2 ? 0 : sp > .6 ? 1 : sp > .3 ? 3 : sp > .15 ? 7 : 15;
    const fr = Math.floor(C.tr * 20);
    for (let c = 0; c < this.n; c++) {
      const idx = this.k - 1 - c, i = (this.head - 1 - c + cap * 4) % cap, o = i * RS, age = t - R[o];
      if (age < 0) continue;
      const v = Math.max(.5, R[o + 5]), d = age * v, u = d / this.len;
      if (u >= 1) break;
      if (idx & thin) continue;
      const x0 = R[o + 1], z0 = R[o + 2], s = R[o + 3], cc = R[o + 4], px = cc, pz = -s;
      const zc = V.depth(x0, 0, z0); if (zc < V.near) continue;
      const pxm = V.fl / zc, sk = Math.min(1, v / 8), fa = a * Math.pow(1 - u, 1.5) * (.35 + .65 * sk) * (thin ? 1.25 : 1);
      if (fa < .01) continue;
      // the two arms, with feathered crests just inside them
      const lat = B * .45 + d * TANK;
      for (let sd = -1; sd <= 1; sd += 2) {
        dot(x0 + px * sd * lat, .25, z0 + pz * sd * lat, 1, WH[0], WH[1], WH[2], fa * .6);
        if (pxm > .25 && !(idx & 1)) {
          const nf = pxm > 2 ? 4 : 2;
          for (let m = 1; m <= nf; m++) { const l2 = lat * (1 - .045 * m) - m * .6, back = m * 1.4; dot(x0 + px * sd * l2 - s * back, .25, z0 + pz * sd * l2 - cc * back, 1, WH[0], WH[1], WH[2], fa * .38 * (1 - m / (nf + 1))); }
        }
      }
      // the churned centre: widening, brightest near the stern; the prop wash boils white right astern
      const wash = Math.exp(-d / (L * .8)), nC = Math.max(1, Math.round((u < .1 ? 5 : 3) * q * (pxm > 1 ? 2 : 1) + wash * 8 * q * Math.min(1, pxm)));
      const wid = B * .5 + d * .055;
      for (let m = 0; m < nC; m++) {
        const r1 = hsh(idx * 7 + m, this.seed) - .5, r2 = hsh(idx * 13 + m, this.seed + 1) - .5;
        // the boil: the wash near the stern shifts about in time
        const jb = wash > .3 ? (hsh(idx * 5 + m, fr) - .5) * .8 : 0;
        const l = r1 * wid * (1 - .45 * wash) + jb, al = r2 * 6;
        dot(x0 + px * l - s * al, .3 + .4 * wash * hsh(m, fr), z0 + pz * l - cc * al, 1, WH[0], WH[1], WH[2], Math.min(.8, fa * (.42 + .3 * Math.exp(-u * 8) + .25 * wash) * (.6 + .8 * hsh(idx * 3 + m, 11))));
      }
    }
    // the bow wave off the stem and the foam along the waterline
    if (this.speed > .5 && pxS > .02) {
      const s = Math.sin(this.hdg), c = Math.cos(this.hdg), px = c, pz = -s, h = L / 2, spd = Math.min(1, this.speed / 12);
      const nb = Math.round((pxS * L > 60 ? 90 : 40) * q);
      for (let k = 0; k < nb; k++) {
        const sd = k & 1 ? 1 : -1, f = (k >> 1) / (nb / 2), zz = h * .95 - f * L * .95;
        const bw = B / 2 * (zz > h * .3 ? Math.max(0, 1 - Math.pow((zz / h - .3) / .7, 1.75)) : 1) + .8 + 1.4 * spd * Math.exp(-f * 4);
        dot(P[0] + s * zz + px * sd * bw, .35 + .3 * Math.sin(k + t * 3), P[2] + c * zz + pz * sd * bw, 1, WH[0], WH[1], WH[2], a * (.3 + .45 * spd) * (1 - .5 * f));
      }
      // the bow wave rolling out: a crest from the stem, angled back, spreading
      const nw = Math.round((pxS * L > 60 ? 60 : 24) * q * spd);
      for (let k = 0; k < nw; k++) {
        const sd = k & 1 ? 1 : -1, f = (k >> 1) / (nw / 2), back = f * L * .55, out = B * .5 + back * .42 + 1;
        const zz = h * .9 - back;
        dot(P[0] + s * zz + px * sd * out, .3, P[2] + c * zz + pz * sd * out, 1, WH[0], WH[1], WH[2], a * .5 * spd * (1 - f));
      }
      // spray at the stem when she is fast
      if (spd > .6 && pxS > .5) {
        const ns = Math.round(30 * q * (spd - .5) * 2);
        for (let k = 0; k < ns; k++) {
          const ph = C.tr * 1.3 + hsh(k, this.seed), f = ph - Math.floor(ph), sd = k & 1 ? 1 : -1, j = (k * 3 + Math.floor(ph) * 11) & GM;
          const zz = h * .96 - f * 6, out = 1 + f * 5 + GT[j], y = 1 + 5 * f * (1 - f) * 2;
          dot(P[0] + s * zz + px * sd * out, y, P[2] + c * zz + pz * sd * out, 1, WH[0], WH[1], WH[2], .6 * (1 - f));
        }
      }
    }
  }
}

/* ---------------- rotor downwash ---------------- */
/* o: { seed, D (rotor diameter, m) }; draw(C, pos (hub), gy (surface height), wet (water), k (0..1)) */
export class Downwash {
  constructor(o) { this.seed = (o && o.seed) || 5; this.D = (o && o.D) || 16.4; }
  draw(C, pos, gy, wet, k) {
    const h = pos[1] - gy, D = this.D;
    const kk = k * sat(1 - (h - D * .25) / (D * 2.2));
    if (kk < .02) return;
    const V = C.V, dot = C.dot;
    if (!V.vis(pos[0], gy, pos[2], D * 3)) return;
    const pxm = V.pxm(pos[0], gy, pos[2]); if (pxm <= 0) return;
    const n = Math.round(Math.min(2200, 120 + D * pxm * 30) * C.q * kk), t = C.t, sd = this.seed;
    const col = wet ? WH : [206, 202, 190], r0 = D * .45, R1 = D * (1.6 + .6 * kk);
    for (let i = 0; i < n; i++) {
      const per = .9 + .8 * hsh(i, sd), ph = t / per + hsh(i, sd + 1), cyc = Math.floor(ph), f = ph - cyc;
      const th = (hsh(i * 31 + cyc, sd + 2) + .03 * f) * TAU, rr = r0 + (R1 - r0) * Math.sqrt(f);
      const y = gy + .25 + (wet ? 2.2 : 1.4) * f * (1 - f) * (1 + hsh(i, sd + 3));
      dot(pos[0] + Math.sin(th) * rr, y, pos[2] + Math.cos(th) * rr, pxm > 3 ? 2 : 1, col[0], col[1], col[2], .85 * kk * Math.sin(f * Math.PI) * (.5 + .5 * hsh(i, sd + 4)));
    }
    // the flattened, darkened disc under the rotor: a faint ring at its edge
    const nr = Math.round(Math.min(160, 30 + D * pxm * 3) * C.q);
    for (let i = 0; i < nr; i++) { const th = i / nr * TAU + t * .4, rr = D * .55 * (1 + .06 * noise(i * .3, t * .8, sd)); dot(pos[0] + Math.sin(th) * rr, gy + .2, pos[2] + Math.cos(th) * rr, 1, col[0], col[1], col[2], .35 * kk); }
  }
}
