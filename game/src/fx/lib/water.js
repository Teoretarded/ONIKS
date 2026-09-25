/* Water driven by motion, not events.
   Wake      Kelvin wake of a moving ship: rows of dots laid at the stern and left in the water; the two arms
             spread at 19.47 degrees with short feathered crests, the churned centre widens and fades, the prop wash
             boils white right astern, the bow wave rolls off the stem and along the sides (sea_excerpts drawWake,
             pd_engagement_dots drawWake). Rows are emission records (time, place, heading, speed, strength), not
             particles: a boat that dives lays rows of strength 0, so the wake it left on the surface fades as it
             should. feather: the small wake of a periscope or mast at periscope depth, with its plume of spray.
   Downwash  the ring of spray a hovering helicopter blows out on the water (dust on land): periodic particles.
   Bubbles   a torpedo's run: a faint line of bubbles breaking on the surface over its track.
   SubWater  a boat breaking the surface (water pouring off the sail, sheeting off the casing, the blow boiling
             white along both sides) or leaving it (spray jetting from the vents, the sea closing over the deck, a
             swirl where the sail goes under). */
import { WH, TAU, GT, GM, G2, sat, ss, hsh, noise } from './core.js';

const TANK = Math.tan(19.47 * Math.PI / 180);
const RS = 7;   // row stride: t, x, z, sin, cos, speed, strength

export class Wake {
  /* o: { L (m), B (beam, m), len (m of track the wake lasts), rate (rows / s), seed, feather (a mast's wake) } */
  constructor(o) {
    o = o || {};
    this.L = o.L || 155; this.B = o.B || 20; this.len = o.len || 1400; this.rate = o.rate || 8; this.seed = (o.seed || 1) * 7919;
    this.feather = !!o.feather;
    this.cap = 2048; this.R = new Float32Array(this.cap * RS); this.n = 0; this.head = 0; this.k = 0;
    this.lastT = -1e9; this.pos = [0, 0, 0]; this.hdg = 0; this.speed = 0; this.t = 0; this.alive = true; this.kE = 1;
  }
  /* each frame: the ship's position, heading, speed (m/s), sim time, and how strongly she marks the surface now
     (1 a ship; a boat: less at periscope depth, 0 deep) */
  update(pos, hdg, speed, t, k) {
    if (t < this.lastT - 1) { this.n = 0; this.lastT = -1e9; }
    const dtE = 1 / this.rate;
    if (this.lastT < t - 4) this.lastT = t - dtE;
    this.kE = k === undefined ? 1 : k;
    const s = Math.sin(hdg), c = Math.cos(hdg), back = this.L / 2 * .96;
    while (this.lastT + dtE <= t) {
      this.lastT += dtE;
      // where the stern was at that moment (the ship moved on since)
      const d = (t - this.lastT) * speed, o = this.head * RS, R = this.R;
      R[o] = this.lastT; R[o + 1] = pos[0] - s * (back + d); R[o + 2] = pos[2] - c * (back + d); R[o + 3] = s; R[o + 4] = c; R[o + 5] = speed; R[o + 6] = this.kE;
      this.head = (this.head + 1) % this.cap; if (this.n < this.cap) this.n++; this.k++;
    }
    this.pos[0] = pos[0]; this.pos[1] = pos[1]; this.pos[2] = pos[2]; this.hdg = hdg; this.speed = speed; this.t = t;
  }
  done(t) { return !this.alive && (this.n === 0 || t - this.lastT > this.len / 4 + 30); }
  draw(C, a) {
    a = a === undefined ? 1 : a;
    const V = C.V, dot = C.dot, t = C.t, R = this.R, cap = this.cap, q = C.q, B = this.B, L = this.L, fe = this.feather;
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
      const kr = R[o + 6]; if (kr < .01) continue;
      const x0 = R[o + 1], z0 = R[o + 2], s = R[o + 3], cc = R[o + 4], px = cc, pz = -s;
      const zc = V.depth(x0, 0, z0); if (zc < V.near) continue;
      const pxm = V.fl / zc, sk = Math.min(1, v / 8), fa = a * kr * Math.pow(1 - u, 1.5) * (.35 + .65 * sk) * (thin ? 1.25 : 1);
      if (fa < .01) continue;
      // the two arms, with feathered crests just inside them
      const lat = B * .45 + d * TANK;
      for (let sd = -1; sd <= 1; sd += 2) {
        dot(x0 + px * sd * lat, .25, z0 + pz * sd * lat, 1, WH[0], WH[1], WH[2], fa * (fe ? .4 : .6));
        if (pxm > .25 && !(idx & 1)) {
          const nf = pxm > 2 ? 4 : 2;
          for (let m = 1; m <= nf; m++) { const l2 = lat * (1 - .045 * m) - m * .6, back = m * 1.4; dot(x0 + px * sd * l2 - s * back, .25, z0 + pz * sd * l2 - cc * back, 1, WH[0], WH[1], WH[2], fa * .38 * (1 - m / (nf + 1))); }
        }
      }
      // the churned centre: widening, brightest near the stern; the prop wash boils white right astern
      // (a mast's: a thin line of disturbed water)
      const wash = fe ? 0 : Math.exp(-d / (L * .8)), nC = Math.max(1, Math.round((fe ? 1 : u < .1 ? 5 : 3) * q * (pxm > 1 ? 2 : 1) + wash * 8 * q * Math.min(1, pxm)));
      const wid = fe ? B * .5 + d * .02 : B * .5 + d * .055;
      for (let m = 0; m < nC; m++) {
        const r1 = hsh(idx * 7 + m, this.seed) - .5, r2 = hsh(idx * 13 + m, this.seed + 1) - .5;
        // the boil: the wash near the stern shifts about in time
        const jb = wash > .3 ? (hsh(idx * 5 + m, fr) - .5) * .8 : 0;
        const l = r1 * wid * (1 - .45 * wash) + jb, al = r2 * 6;
        dot(x0 + px * l - s * al, .3 + .4 * wash * hsh(m, fr), z0 + pz * l - cc * al, 1, WH[0], WH[1], WH[2], Math.min(.8, fa * (.42 + .3 * Math.exp(-u * 8) + .25 * wash) * (.6 + .8 * hsh(idx * 3 + m, 11))));
      }
    }
    const kE = this.kE * a;
    if (kE < .01) return;
    if (fe) {
      // the periscope feather: a small bow wave off the mast and a plume of spray thrown up and back
      if (this.speed > .4 && pxS > .15) {
        const s = Math.sin(this.hdg), c = Math.cos(this.hdg), px = c, pz = -s, spd = Math.min(1, this.speed / 5);
        const nb = Math.round(Math.min(70, 12 + pxS * 8) * q), sz = pxS > 3 ? 2 : 1;
        for (let k = 0; k < nb; k++) {
          const sd = k & 1 ? 1 : -1, f = (k >> 1) / (nb / 2), back = f * 6, out = B * .5 + back * .45;
          dot(P[0] - s * back + px * sd * out, .3, P[2] - c * back + pz * sd * out, 1, WH[0], WH[1], WH[2], Math.min(1, kE * (.5 + .5 * spd) * (1 - f)));
        }
        const ns = Math.round(Math.min(140, 12 + pxS * 16) * q * spd);
        for (let k = 0; k < ns; k++) {
          const ph = C.tr * (1.1 + .6 * hsh(k, this.seed)) + hsh(k, this.seed + 1), f = ph - Math.floor(ph), j = (k * 3 + Math.floor(ph) * 11) & GM;
          const back = f * (1.5 + 3 * spd), out = GT[j] * .35 * (1 + 2 * f), y = .3 + (.6 + 1.8 * spd) * 4 * f * (1 - f) * (.6 + .4 * hsh(k, 7));
          dot(P[0] + s * (.3 - back) + px * out, y, P[2] + c * (.3 - back) + pz * out, sz, WH[0], WH[1], WH[2], Math.min(1, kE * 1.2 * (1 - f) * (.5 + .5 * hsh(k, 5))));
        }
      }
      return;
    }
    // the bow wave off the stem and the foam along the waterline
    if (this.speed > .5 && pxS > .02) {
      const s = Math.sin(this.hdg), c = Math.cos(this.hdg), px = c, pz = -s, h = L / 2, spd = Math.min(1, this.speed / 12);
      const nb = Math.round((pxS * L > 60 ? 90 : 40) * q);
      for (let k = 0; k < nb; k++) {
        const sd = k & 1 ? 1 : -1, f = (k >> 1) / (nb / 2), zz = h * .95 - f * L * .95;
        const bw = B / 2 * (zz > h * .3 ? Math.max(0, 1 - Math.pow((zz / h - .3) / .7, 1.75)) : 1) + .8 + 1.4 * spd * Math.exp(-f * 4);
        dot(P[0] + s * zz + px * sd * bw, .35 + .3 * Math.sin(k + t * 3), P[2] + c * zz + pz * sd * bw, 1, WH[0], WH[1], WH[2], kE * (.3 + .45 * spd) * (1 - .5 * f));
      }
      // the bow wave rolling out: a crest from the stem, angled back, spreading
      const nw = Math.round((pxS * L > 60 ? 60 : 24) * q * spd);
      for (let k = 0; k < nw; k++) {
        const sd = k & 1 ? 1 : -1, f = (k >> 1) / (nw / 2), back = f * L * .55, out = B * .5 + back * .42 + 1;
        const zz = h * .9 - back;
        dot(P[0] + s * zz + px * sd * out, .3, P[2] + c * zz + pz * sd * out, 1, WH[0], WH[1], WH[2], kE * .5 * spd * (1 - f));
      }
      // spray at the stem when she is fast
      if (spd > .6 && pxS > .5) {
        const ns = Math.round(30 * q * (spd - .5) * 2);
        for (let k = 0; k < ns; k++) {
          const ph = C.tr * 1.3 + hsh(k, this.seed), f = ph - Math.floor(ph), sd = k & 1 ? 1 : -1, j = (k * 3 + Math.floor(ph) * 11) & GM;
          const zz = h * .96 - f * 6, out = 1 + f * 5 + GT[j], y = 1 + 5 * f * (1 - f) * 2;
          dot(P[0] + s * zz + px * sd * out, y, P[2] + c * zz + pz * sd * out, 1, WH[0], WH[1], WH[2], .6 * kE * (1 - f));
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

/* ---------------- a torpedo's run: bubbles on the surface over its track ---------------- */
/* feed(t, x, z, depth) each frame while it runs (a record every .25 s); draw(C, k). The bubbles take a moment to
   reach the surface, break in a flicker (real time), spread a little and fade; fainter the deeper it runs. */
export class Bubbles {
  constructor(seed) {
    this.cap = 200; this.R = new Float32Array(this.cap * 4); this.n = 0; this.head = 0; this.k = 0; this.last = -1e9;
    this.seed = ((seed | 0) * 977 + 13) | 0; this.life = 24;
  }
  feed(t, x, z, depth) {
    if (t < this.last - 1) { this.n = 0; this.last = -1e9; }
    if (t - this.last < .25) return;
    const o = this.head * 4, R = this.R;
    R[o] = t; R[o + 1] = x; R[o + 2] = z; R[o + 3] = depth;
    this.head = (this.head + 1) % this.cap; if (this.n < this.cap) this.n++; this.k++; this.last = t;
  }
  done(t) { return t - this.last > this.life + 2; }
  draw(C, k) {
    const t = C.t, V = C.V, dot = C.dot, R = this.R, cap = this.cap, fr = Math.floor(C.tr * 7), life = this.life;
    k = k === undefined ? 1 : k;
    for (let c = 0; c < this.n; c++) {
      const idx = this.k - 1 - c, i = (this.head - 1 - c + cap) % cap, o = i * 4, age = t - R[o] - .8;
      if (age < 0) continue;
      if (age > life) break;
      const x = R[o + 1], z = R[o + 2], zc = V.depth(x, 0, z); if (zc < V.near) continue;
      const pxm = V.fl / zc; if (pxm < .015) continue;
      if (pxm < .15 && (idx & 3)) continue;
      if (!V.vis(x, 0, z, 6)) continue;
      const w = k * .95 * Math.exp(-R[o + 3] / 26) * Math.pow(1 - age / life, 1.3) * sat(age / 1.2) * (pxm < .15 ? 1.4 : 1);
      if (w < .01) continue;
      const nd = pxm > 3 ? 8 : pxm > .8 ? 4 : pxm > .3 ? 2 : 1, spr = .5 + age * .09, sz = pxm > 4 ? 2 : 1;
      for (let m = 0; m < nd; m++) {
        const j = (idx * 5 + m * 1733 + this.seed) & GM, pop = hsh(idx * 7 + m, fr + m * 3);
        dot(x + GT[j] * spr, .24, z + GT[(j + 2) & GM] * spr, sz, WH[0], WH[1], WH[2], w * (.3 + .7 * pop));
      }
    }
  }
}

/* ---------------- a boat breaking the surface, or leaving it ---------------- */
/* o: { L, B (m), sail [z0, z1, half width, top] (m, boat frame: +Z forward, the waterline at 0), deck (m, the casing's
   top over the waterline), hull [axis height, radius] (m), seed }. follow(pos, hdg, under) each frame (under: m the waterline is below the sea, 0
   surfaced); mark(what, t): 'sail' the sail broke the surface, 'hull' the casing did, 'vent' diving (the vents
   open), 'awash' the deck went under, 'sailDown' the sail went under. Each part is drawn in its age since then. */
export class SubWater {
  constructor(o) {
    this.L = o.L || 74; this.B = o.B || 10; this.sail = o.sail || [-5, 8, 1.2, 7.7]; this.deck = o.deck || 2.5; this.seed = ((o.seed || 1) * 131) | 0;
    this.ax = o.hull ? o.hull[0] : -1.9; this.R = o.hull ? o.hull[1] : 4.4;
    this.T = { sail: -1e9, hull: -1e9, vent: -1e9, awash: -1e9, sailDown: -1e9 };
    this.pos = [0, 0, 0]; this.hdg = 0; this.under = 0; this.vis = true;
  }
  follow(pos, hdg, under) { this.pos[0] = pos[0]; this.pos[1] = pos[1]; this.pos[2] = pos[2]; this.hdg = hdg; this.under = under; }
  mark(what, t) { this.T[what] = t; }
  busy(t) { const T = this.T; return t - T.sail < 8 || t - T.hull < 18 || t - T.vent < 8 || t - T.awash < 12 || t - T.sailDown < 9; }
  draw(C) {
    const t = C.t; if (!this.busy(t)) return;
    const V = C.V, dot = C.dot, P = this.pos, L = this.L, B = this.B, S = this.sail, q = C.q, sd = this.seed;
    if (!V.vis(P[0], 4, P[2], L * .7 + 20)) return;
    const pxm = V.pxm(P[0], 3, P[2]); if (pxm <= 0) return;
    const s = Math.sin(this.hdg), c = Math.cos(this.hdg), und = this.under, sz = pxm > 3 ? 2 : 1;
    const X = (la, lc) => P[0] + s * la + c * lc, Z = (la, lc) => P[2] + c * la - s * lc;
    const sm = (S[0] + S[1]) / 2, sh = (S[1] - S[0]) / 2, near = pxm * L > 40 ? 1 : .35;
    // the sail coming up: water pouring off its top and its sides; foam round its foot
    let a = t - this.T.sail;
    const yTop = S[3] - und;
    if (a >= 0 && a < 7 && yTop > .3) {
      const k = Math.pow(1 - a / 7, 1.3) * sat(a * 3), n = Math.round(Math.min(600, 40 + pxm * 70) * q * k * near);
      for (let i = 0; i < n; i++) {
        const per = 1.1 + .5 * hsh(i, sd), ph = a / per + hsh(i, sd + 1), cyc = Math.floor(ph), f = ph - cyc, tf = f * per;
        const side = hsh(i * 7 + cyc, sd + 2) < .5 ? -1 : 1, la = S[0] + (S[1] - S[0]) * hsh(i * 13 + cyc, sd + 3);
        const y = yTop - 4.9 * tf * tf; if (y < .2) continue;
        const lc = side * (S[2] + .2 + 1.4 * tf);
        dot(X(la, lc), y, Z(la, lc), sz, WH[0], WH[1], WH[2], .95 * k * (.55 + .45 * hsh(i, sd + 4)));
      }
      const nr = Math.round(Math.min(160, 20 + pxm * 18) * q * near), R0 = 1 + a * 1.4;
      for (let i = 0; i < nr; i++) { const th = i / nr * TAU, la = sm + Math.cos(th) * (sh + R0), lc = Math.sin(th) * (S[2] + R0); dot(X(la, lc), .3, Z(la, lc), 1, WH[0], WH[1], WH[2], .5 * (1 - a / 7)); }
    }
    // the casing coming up: water streaming off it down the hull's sides; the blow boiling white along both
    // sides, air bursting out of the flood holes in fountains of spray
    a = t - this.T.hull;
    if (a >= 0 && a < 18) {
      const yD = this.deck - und, AX = this.ax - und, RR = this.R;
      if (a < 8 && yD > .2) {
        const k = Math.pow(1 - a / 8, 1.2), n = Math.round(Math.min(1100, 60 + L * pxm * 5) * q * k * near);
        for (let i = 0; i < n; i++) {
          const per = .7 + .4 * hsh(i, sd + 5), ph = a / per + hsh(i, sd + 6), cyc = Math.floor(ph), tf = (ph - cyc) * per;
          const side = hsh(i * 3 + cyc, sd + 7) < .5 ? -1 : 1, la = L * (-.42 + .82 * hsh(i * 11 + cyc, sd + 8));
          const y = yD - 4.9 * tf * tf; if (y < .2) continue;
          // hugging the hull's side at that height (a circle of radius R round its axis), a little off it
          const dy = y - AX, hw = dy < RR ? Math.sqrt(RR * RR - dy * dy) : 0, lc = side * (Math.max(hw, B * .12) + .15 + .25 * tf);
          dot(X(la, lc), y, Z(la, lc), sz, WH[0], WH[1], WH[2], .9 * k * (.55 + .45 * hsh(i, sd + 9)));
        }
      }
      const k = (1 - a / 18) * sat(a * 2), n = Math.round(Math.min(2200, 120 + L * pxm * 12) * q * k * near);
      for (let i = 0; i < n; i++) {
        const per = .6 + .6 * hsh(i, sd + 10), ph = a / per + hsh(i, sd + 11), cyc = Math.floor(ph), f = ph - cyc;
        const side = i & 1 ? 1 : -1, la = L * (-.4 + .78 * hsh(i * 17 + cyc, sd + 12)), lc = side * (B * .5 + .3 + (1.2 + a * .35) * hsh(i * 5 + cyc, sd + 13));
        const y = .25 + (a < 4 ? 1.2 * (1 - a / 4) : 0) * 4 * f * (1 - f) * hsh(i, sd + 14);
        dot(X(la, lc), y, Z(la, lc), sz, WH[0], WH[1], WH[2], .95 * k * Math.sin(f * Math.PI) * (.6 + .4 * hsh(i, sd + 15)));
      }
      if (a < 5) {
        const e = sat(a * 3) * (1 - a / 5), nf = 7, m = Math.round(Math.min(80, 8 + pxm * 7) * q * near);
        for (let h = 0; h < nf * 2; h++) {
          const side = h & 1 ? 1 : -1, la = L * (-.36 + .7 * ((h >> 1) + .5) / nf), lc0 = side * (B * .5 + .2);
          for (let i = 0; i < m; i++) {
            const per = .7 + .3 * hsh(i, h + sd), ph = a / per + hsh(i + h * 31, sd + 16), cyc = Math.floor(ph), tf = (ph - cyc) * per;
            const vj = 4 + 5 * hsh(i * 7 + cyc, h + sd), vo = 1 + 2.5 * hsh(i * 3 + cyc, h + sd + 1), y = .3 + vj * tf - 4.9 * tf * tf; if (y < .2) continue;
            const lc = lc0 + side * vo * tf, dl = (hsh(i * 5 + cyc, h + sd + 2) - .5) * 1.5;
            dot(X(la + dl, lc), y, Z(la + dl, lc), sz, WH[0], WH[1], WH[2], .85 * e);
          }
        }
      }
    }
    // diving: spray jetting from the vents along the casing, and its mist drifting off
    a = t - this.T.vent;
    if (a >= 0 && a < 8) {
      const env = sat(a * 4) * (1 - ss(2.2, 5, a)), yV = Math.max(.3, this.deck - und), nv = 8;
      if (env > .01) {
        const per = .7, n = Math.round(Math.min(130, 12 + pxm * 11) * q * near);
        for (let v = 0; v < nv * 2; v++) {
          const side = v & 1 ? 1 : -1, la = L * (-.33 + .68 * ((v >> 1) + .5) / nv), lc = side * B * .26;
          for (let i = 0; i < n; i++) {
            const ph = a / per + hsh(i + v * 37, sd + 15), f = ph - Math.floor(ph), tf = f * per, vj = 11 + 6 * hsh(i, v + sd);
            const y = yV + vj * tf - G2 * tf * tf * 2.2, j = (i * 3 + v * 101 + Math.floor(ph) * 7) & GM, sp = .2 + 1.5 * f * f;
            dot(X(la, lc) + GT[j] * sp + C.wind[0] * tf, y, Z(la, lc) + GT[(j + 2) & GM] * sp + C.wind[2] * tf, pxm > 1.2 ? 2 : 1, WH[0], WH[1], WH[2], env * (1 - .7 * f * f));
          }
        }
      }
      if (a > .4) {
        const b = a - .4, n = Math.round(Math.min(320, 30 + pxm * 24) * q * near), w = 1 - b / 7.6;
        for (let i = 0; i < n; i++) {
          const la = L * (-.33 + .68 * hsh(i, sd + 16)), lc = (hsh(i, sd + 17) - .5) * B * .7, j = (i * 5 + sd) & GM, rad = 1 + .8 * b;
          dot(X(la, lc) + GT[j] * rad + C.wind[0] * b, yV + 3 + 2 * hsh(i, sd + 18) + .3 * b + GT[(j + 1) & GM] * rad * .4, Z(la, lc) + GT[(j + 2) & GM] * rad + C.wind[2] * b, 1, 226, 230, 222, .45 * w * w);
        }
      }
    }
    // the sea closing over the deck: two lines of foam running in over the casing, then a slick
    a = t - this.T.awash;
    if (a >= 0 && a < 12) {
      const close = sat(a / 2.5), n = Math.round(Math.min(700, 60 + L * pxm * 4) * q * near), w = 1 - a / 12, fr = Math.floor(C.tr * 8);
      for (let i = 0; i < n; i++) {
        const side = i & 1 ? 1 : -1, la = L * (-.45 + .9 * hsh(i, sd + 19)), lc = side * B * .5 * (1 - .85 * close) + (hsh(i, sd + 20) - .5) * (1 + 3 * close);
        dot(X(la, lc), .28, Z(la, lc), sz, WH[0], WH[1], WH[2], .8 * w * (.4 + .6 * hsh(i, fr)));
      }
    }
    // the sail going under: a swirl closing round where it stood
    a = t - this.T.sailDown;
    if (a >= 0 && a < 9) {
      const w = 1 - a / 9, n = Math.round(Math.min(220, 24 + pxm * 20) * q * near), shrink = 1 - .6 * sat(a / 3);
      for (let i = 0; i < n; i++) {
        const th = i / n * TAU + a * 1.3, rr = (1 + .5 * hsh(i, sd + 21)) * shrink;
        const la = sm + Math.cos(th) * (sh + 1.5) * rr, lc = Math.sin(th) * (S[2] + 2) * rr;
        dot(X(la, lc), .3 + (a < 1.5 ? (1.5 - a) * hsh(i, sd + 22) : 0), Z(la, lc), 1, WH[0], WH[1], WH[2], .6 * w);
      }
    }
  }
}
