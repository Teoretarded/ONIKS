/* Impacts and what they leave.
   Splash    a water column (the crown thrown up and falling back), its ring on the water, a mist, foam.
   Dirt      a land impact: dust and clods thrown up in a cone, a ground ring of dust, the cloud drifting off.
   ShipHit   pc_anatomy_film drawStrike: the fireball swells, lifts off the hull and cools white -> lime -> smoke;
             sparks, hot debris arcing into the sea with splashes, water thrown off the waterline.
   Fire      persistent on a unit: flames flickering along the struck part (in real time, so time compression
             never strobes them), their glow on the hull, and a smoke column rising, spreading under its ceiling
             and leaning downwind as it climbs. Puff emission times are an index, not state.
   Sinking   bubbles, a sheen spreading on the water, steam where the hot hull goes under. */
import { WH, LIME, HOT, GREY, SMOKE, TAU, G2, GT, GM, BALL, NB, sat, ss, clamp, hsh, rng, noise, dragH, landTime, dotHalo, streak } from './core.js';
import { heatCol } from './burst.js';

/* ---------------- water splash ---------------- */
/* o: { t0, pos (on the water), size (column height, m: fragment 4, shell 25, missile 40), seed, ring (0..1 lime) } */
export class Splash {
  constructor(o) {
    const r = rng(o.seed || 808), H = o.size || 25, n = Math.round(clamp(180 + H * 16, 120, 900)), D = new Float32Array(n * 4);
    this.t0 = o.t0; this.p = o.pos.slice(); this.H = H; this.seed = o.seed || 808; this.ring = o.ring === undefined ? .35 : o.ring;
    const v0 = Math.sqrt(2 * 9.81 * H);
    for (let i = 0; i < n; i++) {
      // most of the water goes up in a hollow column; the rest is a crown sheet thrown out
      const crown = r() < .28, a = r() * TAU, s = r();
      const vr = crown ? v0 * (.25 + .35 * r()) : v0 * (.04 + .1 * s), vy = crown ? v0 * (.35 + .35 * r()) : v0 * (.45 + .55 * Math.pow(r(), .6)) * (1 - .35 * s);
      D[i * 4] = Math.cos(a) * vr; D[i * 4 + 1] = vy; D[i * 4 + 2] = Math.sin(a) * vr; D[i * 4 + 3] = .3 + .7 * r();
    }
    this.D = D; this.n = n; this.T = 2 * v0 / 9.81; this.dur = this.T + 9;
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, p = this.p, H = this.H, y0 = p[1];
    if (!V.vis(p[0], y0 + H / 2, p[2], H * 1.5 + 20)) return;
    const pxm = V.pxm(p[0], y0 + H / 2, p[2]); if (pxm <= 0) return;
    // far off a splash is a few px: its column only, fewer dots
    const stp = Math.max(1, Math.round((H * pxm > 60 ? 1 : H * pxm > 20 ? 2 : H * pxm > 6 ? 4 : 9) / C.q));
    const D = this.D, fall = 1 - ss(this.T * .6, this.T * 1.15, age);
    if (fall > 0) for (let i = 0; i < this.n; i += stp) {
      const t = age * (.9 + .1 * D[i * 4 + 3]), vy = D[i * 4 + 1], y = vy * t - G2 * t * t;
      if (y < 0 && t > .2) continue;
      // spray lags: a short vertical smear while it flies fast
      const x = p[0] + D[i * 4] * t, z = p[2] + D[i * 4 + 2] * t, al = .85 * fall * (.55 + .45 * D[i * 4 + 3]) * (stp > 2 ? 1.3 : 1);
      dot(x, y0 + Math.max(0, y), z, pxm > 3 ? 2 : 1, WH[0], WH[1], WH[2], al > 1 ? 1 : al);
      if (pxm > 1.5 && Math.abs(vy - 9.81 * t) > 6) dot(x, y0 + Math.max(0, y) - (vy - 9.81 * t) * .02, z, 1, WH[0], WH[1], WH[2], al * .5);
    }
    // the ring running out on the water, lime for a moment, then white foam
    if (age < 7) {
      const R = H * .25 + 2 + age * (3 + H * .18), w = 1 - age / 7, n = Math.round(clamp(R * pxm * 2.5, 12, 260) * C.q), lm = this.ring * Math.exp(-age * .8);
      for (let k = 0; k < n; k++) {
        const th = k / n * TAU, rr = R * (.95 + .1 * hsh(k, this.seed));
        dot(p[0] + Math.cos(th) * rr, y0 + .3, p[2] + Math.sin(th) * rr, 1, WH[0] + (LIME[0] - WH[0]) * lm, WH[1] + (LIME[1] - WH[1]) * lm, WH[2] + (LIME[2] - WH[2]) * lm, .75 * w);
      }
    }
    // mist hanging where the column stood, drifting off
    if (age > this.T * .4) {
      const b = age - this.T * .4, life = 7, w = 1 - b / life;
      if (w > 0) {
        const n = Math.round(clamp(H * 3, 20, 140) * C.q * (pxm > .5 ? 1 : .5)), rad = H * .25 + 1.2 * Math.sqrt(b) + .4 * b;
        for (let k = 0; k < n; k++) {
          const j = (k * 5 + this.seed) & GM;
          const y = y0 + H * (.15 + .5 * hsh(k, this.seed + 2)) * (1 - .2 * b / life) + GT[(j + 1) & GM] * rad * .4;
          dot(p[0] + GT[j] * rad + C.wind[0] * b, Math.max(y0 + .3, y), p[2] + GT[(j + 2) & GM] * rad + C.wind[2] * b, 1, GREY[0], GREY[1], GREY[2], .35 * w * w * (.5 + hsh(k, 1)));
        }
      }
    }
    // foam left on the water
    if (age > .3) {
      const w = 1 - age / this.dur, R = H * .35 + 3, n = Math.round(clamp(R * R * pxm * .5, 10, 200) * C.q);
      for (let k = 0; k < n; k++) { const th = hsh(k, this.seed + 7) * TAU, rr = R * Math.sqrt(hsh(k, this.seed + 8)); dot(p[0] + Math.cos(th) * rr, y0 + .25, p[2] + Math.sin(th) * rr, 1, WH[0], WH[1], WH[2], .45 * w * (.4 + .6 * hsh(k, 3))); }
    }
  }
}

/* ---------------- land impact ---------------- */
/* o: { t0, pos, size (m, the height the dust goes: shell 18, missile 35), seed } */
const DUST = [196, 194, 184];
export class Dirt {
  constructor(o) {
    const r = rng(o.seed || 919), H = o.size || 20, n = Math.round(clamp(160 + H * 14, 120, 700)), D = new Float32Array(n * 5);
    this.t0 = o.t0; this.p = o.pos.slice(); this.H = H; this.seed = o.seed || 919;
    const v0 = Math.sqrt(2 * 9.81 * H);
    for (let i = 0; i < n; i++) {
      // a cone of dust and clods: steep, fast in the middle; clods heavy (low drag), dust light
      const a = r() * TAU, el = (45 + 43 * Math.pow(r(), .7)) * Math.PI / 180, clod = i % 5 === 0, sp = v0 * (clod ? .5 + .6 * r() : .6 + .8 * r());
      D[i * 5] = Math.cos(a) * Math.cos(el) * sp; D[i * 5 + 1] = Math.sin(el) * sp; D[i * 5 + 2] = Math.sin(a) * Math.cos(el) * sp;
      D[i * 5 + 3] = clod ? .15 + .2 * r() : 1 + 2.2 * r(); D[i * 5 + 4] = clod ? 1 : 0;
    }
    this.D = D; this.n = n; this.dur = 22;
    this.AW = new Float32Array(n);
    for (let i = 0; i < n; i++) this.AW[i] = landTime(0, D[i * 5 + 1], D[i * 5 + 3], 0, 14);
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, p = this.p, H = this.H;
    if (!V.vis(p[0], p[1] + H / 2, p[2], H * 2 + 40)) return;
    const pxm = V.pxm(p[0], p[1] + H / 2, p[2]); if (pxm <= 0) return;
    const stp = Math.max(1, Math.round((H * pxm > 60 ? 1 : H * pxm > 20 ? 2 : H * pxm > 6 ? 4 : 8) / C.q)), D = this.D, AW = this.AW;
    for (let i = 0; i < this.n; i += stp) {
      const kd = D[i * 5 + 3], clod = D[i * 5 + 4], aw = AW[i];
      if (age > aw + (clod ? 12 : 0)) continue;
      const t = Math.min(age, aw), h = dragH(kd, t), y = D[i * 5 + 1] * h - G2 * t * t;
      const x = p[0] + D[i * 5] * h + (clod ? 0 : C.wind[0] * t * .5), z = p[2] + D[i * 5 + 2] * h + (clod ? 0 : C.wind[2] * t * .5);
      const al = clod ? (age > aw ? .5 * (1 - (age - aw) / 12) : .9) : .7 * (1 - age / aw);
      if (al < .02) continue;
      dot(x, p[1] + Math.max(.1, y), z, clod && pxm > 2 ? 2 : 1, DUST[0] + 20 * clod, DUST[1] + 20 * clod, DUST[2] + 20 * clod, al);
    }
    // the dust cloud: a column thrown up by the blast, then its puffs roll out, rise, drift and thin
    const nP = Math.round(46 * C.q);
    for (let k = 0; k < nP; k++) {
      const tb = .03 + .35 * hsh(k, this.seed), b = age - tb; if (b < 0) continue;
      const life = 9 + 11 * hsh(k, this.seed + 1); if (b > life) continue;
      const th = hsh(k, this.seed + 2) * TAU, u = hsh(k, this.seed + 3), sp = H * (.15 + .45 * u), hh = dragH(1.2, b);
      // high puffs go up fast and slow (the column), low ones roll out along the ground (the base surge)
      const up = H * (1.1 - .9 * u) * (1 - Math.exp(-b * 1.6)) + .5 * b;
      const x = p[0] + Math.cos(th) * sp * hh + C.wind[0] * b * .8, z = p[2] + Math.sin(th) * sp * hh + C.wind[2] * b * .8, y = p[1] + 1 + up;
      const rad = H * (.1 + .12 * u) + 1.8 * Math.sqrt(b) + .15 * b, pm = V.pxm(x, y, z), rp = rad * pm; if (rp <= 0) continue;
      const nd = Math.max(1, Math.round(Math.min(90, 3 + rp * rp * .035) * C.q));
      const al = .75 * Math.min(1, b * 5) * Math.pow(1 - b / life, .8) * Math.min(1, 2.6 / Math.sqrt(nd / 3)) * (.6 + .4 * hsh(k, this.seed + 5));
      const hot = Math.exp(-b * 3) * .6, cr = DUST[0] + (250 - DUST[0]) * hot, cg = DUST[1] + (255 - DUST[1]) * hot, cb = DUST[2] + (220 - DUST[2]) * hot;
      const g0 = (k * 97 + this.seed) | 0;
      for (let m = 0; m < nd; m++) { const j = (g0 + m * 1733) & GM, yy = y + GT[(j + 1) & GM] * .6 * rad; if (yy < p[1] + .1) continue; dot(x + GT[j] * rad, yy, z + GT[(j + 2) & GM] * rad, rp > 25 ? 2 : 1, cr, cg, cb, al * (.6 + .8 * ((j * .618034) % 1))); }
    }
    // the ground ring of dust running out
    if (age < 2.5) {
      const R = 2 + H * 1.4 * Math.sqrt(age / 2.5), w = 1 - age / 2.5, n = Math.round(clamp(R * pxm * 2, 12, 220) * C.q);
      for (let k = 0; k < n; k++) { const th = k / n * TAU, rr = R * (.9 + .2 * hsh(k, this.seed + 4)); dot(p[0] + Math.cos(th) * rr, p[1] + .4 + .8 * hsh(k, 6), p[2] + Math.sin(th) * rr, 1, DUST[0], DUST[1], DUST[2], .6 * w); }
    }
  }
}

/* ---------------- the fireball of a hit (ship or land): swells, lifts, cools white -> lime -> smoke ---------------- */
/* o: { t0, pos, sc (1 = an Oniks on a destroyer), seed, gy (surface under it), sea (spray off the waterline) } */
export class Blast {
  constructor(o) {
    const r = rng(o.seed || 4242), sc = o.sc || 1, n = Math.round(360 * Math.sqrt(sc)), m = o.sea ? Math.round(620 * Math.sqrt(sc)) : 0;
    this.t0 = o.t0; this.p = o.pos.slice(); this.sc = sc; this.seed = o.seed || 4242; this.gy = o.gy || 0; this.sea = !!o.sea;
    // spray: hot fragments (kind 1) and water thrown off the waterline (kind 0): vx vy vz life kind drag
    const L = new Float32Array((n + m) * 6), s2 = Math.sqrt(sc);
    for (let i = 0; i < n; i++) { const a = r() * TAU, el = (10 + r() * 74) * Math.PI / 180, s = (70 + r() * 200) * s2; L.set([Math.cos(el) * Math.sin(a) * s, Math.sin(el) * s, Math.cos(el) * Math.cos(a) * s, 1.6 + r() * 3.4, 1, .4 + r() * .45], i * 6); }
    for (let i = 0; i < m; i++) { const a = r() * TAU, el = (55 + r() * 33) * Math.PI / 180, s = (35 + r() * 95) * s2; L.set([Math.cos(el) * Math.sin(a) * s, Math.sin(el) * s, Math.cos(el) * Math.cos(a) * s, 2.8 + r() * 3.8, 0, .6 + r() * .5], (n + i) * 6); }
    this.S = L; this.nS = n + m; this.dur = 9; this.HC = [0, 0, 0, 0];
  }
  draw(C, sa) {
    if (sa < 0 || sa > this.dur) return;
    const V = C.V, dot = C.dot, P = this.p, sc = this.sc, s2 = Math.sqrt(sc);
    if (!V.vis(P[0], P[1] + 20 * s2, P[2], 300 * s2)) return;
    const zc = V.depth(P[0], P[1], P[2]); if (zc < V.near) return;
    const pxm = V.fl / zc, I = sa < .05 ? sa / .05 : Math.exp(-(sa - .05) * 1.6);
    // the light: the flash lights the hull, the water, the smoke round it
    C.light(P[0], P[1] + 8 * s2, P[2], 245, 255, 215, 1.1 * I * s2, 420 * s2);
    if (sa < .15) C.lift(.1 * (1 - sa / .15) * Math.min(1, 2500 * s2 / zc), 240, 255, 220);
    // the fireball swells, lifts off the hull and cools from white through lime to smoke
    if (sa < 3.5) {
      const rf = s2 * (4.5 + 12 * (1 - Math.exp(-sa * 3.5))), lift = 4.5 * s2 * sa, heat = Math.exp(-sa / .8);
      const If = Math.min(1, sa / .04) * (1 - ss(1.2, 3.4, sa)), rp = rf * pxm;
      const nf = Math.round(Math.min(8000, 80 + rp * rp * .5) * C.q), boost = Math.min(1.6, Math.sqrt(1600 / Math.max(80, nf)));
      if (If > .01) for (let k = 0; k < nf; k++) {
        const j = ((k * 61 + this.seed) % NB) * 4, s = .25 + .75 * ((k * .618034) % 1), g = (k * 3 + this.seed) & GM;
        const ox = BALL[j] * s + GT[g] * .03, oy = BALL[j + 1] * s + GT[(g + 1) & GM] * .03, oz = BALL[j + 2] * s + GT[(g + 2) & GM] * .03, d2 = ox * ox + oy * oy + oz * oz, hh = heat * (1 - .6 * d2);
        // white-hot inside, lime at the cooling skin, smoke grey as it goes
        const lm = (1 - heat) * Math.exp(-sa * .9) * d2;
        dot(P[0] + ox * rf, P[1] + (oy * .8 + .3) * rf + lift, P[2] + oz * rf, pxm * rf > 30 ? 2 : 1,
          200 + 52 * hh - (200 - LIME[0]) * lm * .6, 202 + 53 * hh + 30 * lm, 196 + 40 * hh - (196 - LIME[2]) * lm, Math.min(1, If * (1 - .45 * d2) * (.45 + .55 * hh) * boost));
      }
      // a halo of lime light round it (dots, as the anatomy draws it), a white core, the streak across the lens
      const hy = P[1] + rf * .3 + lift;
      dotHalo(C, P[0], hy, P[2], Math.max(90, pxm * 110 * s2) * (.55 + .45 * (1 - Math.exp(-sa * 5))), 1400, LIME[0], LIME[1], LIME[2], .3 * I);
      C.halo(P[0], hy, P[2], Math.min(60, Math.max(8, pxm * 10 * s2)), 255, 255, 236, .7 * I);
      if (sa < 1.5) streak(C, P[0], hy, P[2], Math.max(520, pxm * 1600 * s2), 250, 255, 220, I * Math.exp(-sa * 1.8));
    }
    // spray and fragments
    if (sa < 7) {
      const S = this.S, far = pxm * s2 < .15, q = C.q, nS = this.nS;
      for (let j = 0; j < nS; j++) {
        if (far && (j & 3)) continue;
        if (q < 1 && hsh(j, 7) > q) continue;
        const o = j * 6, life = S[o + 3]; if (sa > life) continue;
        const k = S[o + 5], hot = S[o + 4] > 0, tails = hot ? (far ? 2 : 9) : 1, x0 = P[0], z0 = P[2], yb = hot ? P[1] + 3 * s2 : this.gy + 1;
        for (let t = 0; t < tails; t++) {
          const a = sa - t * .035; if (a <= 0) break;
          const m = (1 - Math.exp(-k * a)) / k, y = yb + (S[o + 1] + 9.81 / k) * m - 9.81 * a / k; if (y < this.gy) break;
          const fade = Math.pow(1 - sa / life, 1.3) * (1 - t / tails);
          if (hot) { const ht = Math.exp(-sa / .8); dot(x0 + S[o] * m, y, z0 + S[o + 2] * m, ht > .4 && !t && pxm > .5 ? 2 : 1, 238 + 12 * ht, 238 + 17 * ht, 228 - 40 * ht, fade); }
          else dot(x0 + S[o] * m, y, z0 + S[o + 2] * m, 1, 236, 238, 230, .85 * fade);
        }
      }
    }
  }
}

/* ---------------- fire on a unit, with its smoke column ---------------- */
/* o: { t0, seed, size (1 = a destroyer fire; .25 a truck), local [along, up, across] (m, where it burns, in the
   unit frame), spread [along, up, across] (m), ceiling (m), dtE (s between smoke puffs), life (s a puff lives) }
   Each frame the system calls follow(t, pos, hdg, k) (k: how hard it burns now, 0..1); stop(t) lets it burn out. */
export class Fire {
  constructor(o) {
    const r = rng(o.seed || 5150), sz = o.size || 1;
    this.t0 = o.t0; this.seed = o.seed || 5150; this.size = sz;
    this.loc = (o.local || [0, 4, 0]).slice(); this.spr = (o.spread || [26 * sz, 16 * sz, 6 * sz]).slice();
    this.ceil = o.ceiling || 500 * Math.sqrt(sz); this.dtE = o.dtE || (sz > .6 ? .35 : .5); this.life = o.life || (sz > .6 ? 200 : 110);
    this.cap = Math.ceil(this.life / this.dtE) + 4;
    this.R = new Float32Array(this.cap * 5);  // birth, x, y, z, k (emission record: where the fire was)
    this.nE = 0; this.pos = [0, 0, 0]; this.hdg = 0; this.k = 0; this.kT = 0; this.end = 1e18; this.dur = 1e18;
    // the flame points, in the unit frame round the fire's centre
    const nF = Math.round(120 + 160 * Math.min(1, sz));
    this.FP = new Float32Array(nF * 4);
    for (let i = 0; i < nF; i++) { this.FP[i * 4] = (r() - .5) * 2 * this.spr[0]; this.FP[i * 4 + 1] = Math.pow(r(), 1.8) * this.spr[1]; this.FP[i * 4 + 2] = (r() - .5) * 2 * this.spr[2]; this.FP[i * 4 + 3] = r() * 40; }
    this.nF = nF;
  }
  /* the unit's pose now and how hard it burns; lays the smoke puffs due since the last call */
  follow(t, pos, hdg, k) {
    this.pos[0] = pos[0]; this.pos[1] = pos[1]; this.pos[2] = pos[2]; this.hdg = hdg || 0; this.k = k;
    if (t >= this.end) k = 0;
    const s = Math.sin(this.hdg), c = Math.cos(this.hdg), L = this.loc;
    const fx = pos[0] + s * L[0] + c * L[2], fz = pos[2] + c * L[0] - s * L[2], fy = pos[1] + L[1];
    const due = Math.floor((t - this.t0) / this.dtE);
    if (due - this.nE > this.cap) this.nE = due - this.cap;
    while (this.nE <= due) {
      const i = this.nE % this.cap, o = i * 5;
      this.R[o] = this.t0 + this.nE * this.dtE; this.R[o + 1] = fx; this.R[o + 2] = fy; this.R[o + 3] = fz; this.R[o + 4] = k;
      this.nE++;
    }
  }
  /* stop burning at time t: flames out, the smoke already up lives on */
  stop(t) { if (this.end > t) { this.end = t; this.dur = t - this.t0 + this.life; } }
  done(t) { return t > this.end + this.life; }
  draw(C, age) {
    const t = this.t0 + age, V = C.V, dot = C.dot, sz = this.size, q = C.q;
    const W0 = C.wind[0], W2 = C.wind[2], ceil = this.ceil, R = this.R;
    // flames along the struck part, flickering in real time; their glow lights the hull and the smoke
    const kNow = t < this.end ? this.k * sat(age / .5) : 0;
    const s = Math.sin(this.hdg), c = Math.cos(this.hdg), L = this.loc, P = this.pos;
    const fx = P[0] + s * L[0] + c * L[2], fz = P[2] + c * L[0] - s * L[2], fy = P[1] + L[1];
    if (kNow > .02 && V.vis(fx, fy, fz, 60 * sz + 10)) {
      const zc = V.depth(fx, fy, fz), pxm = zc > V.near ? V.fl / zc : 0, tr = C.tr, FP = this.FP;
      const flick = .75 + .25 * noise(tr * 3.1, this.seed * .1, 0);
      C.light(fx, fy + this.spr[1] * .5, fz, 240, 255, 190, .3 * kNow * flick * Math.sqrt(sz), 26 * Math.sqrt(sz) + 14);
      if (pxm * this.spr[0] < 3) {
        dot(fx, fy + 2, fz, 2, 242, 255, 190, kNow * flick);
        C.glow(fx, fy + 2, fz, 3, LIME[0], LIME[1], LIME[2], .12 * kNow);
      } else {
        // tongues of flame: each rises from its seat and dies at its own height, over and over (real time, so a
        // time-lapse never strobes them); as many as the fire's size on screen needs
        const S0 = this.spr[0], S1 = this.spr[1], S2 = this.spr[2], sd = this.seed;
        const area = 2 * S0 * pxm * S1 * pxm * (.4 + .6 * kNow);
        const nF = Math.round(Math.min(3500, 60 + area * .07) * q), big = pxm > .5 ? 2 : 1;
        for (let j = 0; j < nF; j++) {
          const seat = hsh(j, sd + 1), lx = (seat - .5) * 2 * S0 * (.25 + .75 * hsh(j, sd + 4)), lz = (hsh(j, sd + 2) - .5) * 2 * S2;
          const H = S1 * (.3 + .9 * Math.pow(hsh(j, sd + 3), 1.3)) * (.5 + .5 * kNow) * (1 - .5 * Math.abs(seat - .5));
          const ph = tr * (1.2 + 1.3 * hsh(j, sd + 5)) + hsh(j, sd + 6), u = ph - Math.floor(ph);
          const sway = Math.sin(tr * 2.3 + j) * .08 * H * u;
          const wx = fx + s * (lx + sway) + c * lz, wz = fz + c * (lx + sway) - s * lz, wy = fy + u * H;
          // white-hot at the seat, lime as the tongue thins
          const hot = 1 - u, al = Math.min(1, 1.5 * kNow) * Math.pow(1 - u, .75) * (.6 + .4 * hsh(j + Math.floor(ph), sd + 7));
          if (al < .03) continue;
          dot(wx, wy, wz, big, LIME[0] + (255 - LIME[0]) * hot, 255, LIME[2] + (225 - LIME[2]) * hot * hot, al > 1 ? 1 : al);
          if (!(j & 15)) C.glow(wx, wy, wz, 5, LIME[0], LIME[1], LIME[2], .08 * al);
        }
      }
    }
    // the smoke column: every puff from its emission record
    const n = Math.min(this.nE, this.cap), life = this.life;
    for (let c2 = 0; c2 < n; c2++) {
      const idx = this.nE - 1 - c2, i = idx % this.cap, o = i * 5, a = t - R[o];
      if (a <= 0) continue; if (a > life) break;
      const kk = R[o + 4]; if (kk < .03) continue;
      const hm = ceil * (.45 + .55 * hsh(idx, this.seed)), tr0 = (32 + 34 * hsh(idx, this.seed + 1)) * Math.sqrt(sz + .2), ea = Math.exp(-a / tr0);
      // the heat carries the smoke up fast (the first seconds faster still), then it slows under its ceiling;
      // the wind grows with height, so the column leans over as it climbs
      const h = hm * (1 - ea) + 40 * Math.sqrt(sz) * (1 - Math.exp(-a / 2.5));
      const dr = .4 * a + hm / 420 * (a - tr0 * (1 - ea)), tb = 5 * Math.sqrt(a) * Math.sqrt(sz), sd = (idx * 7.3 + this.seed) % 97;
      const bx = R[o + 1] + W0 * dr + tb * noise(sd, a * .02, 1.3), by = R[o + 2] + 3 * sz + h + tb * .4 * noise(sd + 3, a * .03, 8.2), bz = R[o + 3] + W2 * dr + tb * noise(sd + 7, a * .02, 4.1);
      const rad = (4 + 6 * hsh(idx, this.seed + 2)) * sz + 3.5 * Math.sqrt(a) * Math.sqrt(sz) + .1 * h + 110 * sz * (1 - ea) * (1 - ea);
      const zc = (bx - V.eye[0]) * V.f[0] + (by - V.eye[1]) * V.f[1] + (bz - V.eye[2]) * V.f[2];
      if (zc < V.near + rad * .3) continue;
      const pxm = V.fl / zc, rp = rad * pxm;
      // far: puffs half a second apart stack up; skip some and brighten the rest
      const thin = rp < 3 ? 3 : rp < 8 ? 1 : 0; if (idx & thin) continue;
      if (!V.vis(bx, by, bz, rad * 2)) continue;
      const nd = Math.max(1, Math.round(Math.min(260, 3 + rp * rp * .045) * q));
      const heat = Math.max(Math.exp(-a / 2.4), .55 * kk * Math.exp(-h / (140 * Math.sqrt(sz))));
      const al = kk * Math.min(1, a * 1.5) * Math.pow(1 - a / life, .7) * (.55 + .45 * heat) * Math.min(1, 3.4 / Math.sqrt(nd / 3)) * (.55 + .9 * hsh(idx, this.seed + 3)) * (thin ? 1.4 : 1) * ss(rad * .3, rad * 1.8, zc);
      if (al < .01) continue;
      const cr = 196 + (LIME[0] + 50 - 196) * heat, cg = 198 + (LIME[1] + 11 - 198) * heat, cb = 192 + (LIME[2] + 160 - 192) * heat;
      const g0 = (idx * 37 + this.seed) | 0;
      for (let m = 0; m < nd; m++) {
        const j = (g0 + m * 1733) & GM, ox = GT[j] * rad * .7, oy = GT[(j + 1) & GM] * rad * .55, oz = GT[(j + 2) & GM] * rad * .7;
        const d2 = (ox * ox + oy * oy + oz * oz) / (rad * rad);
        dot(bx + ox, by + oy, bz + oz, rp > 30 ? 2 : 1, cr, cg, cb, al * (1 - .35 * Math.min(1, d2)));
      }
    }
  }
}

/* ---------------- sinking ---------------- */
/* o: { t0, pos, hdg, L, B, seed, dur (s) } ; follow(pos, hdg, dying 0..1) each frame while the hull is there */
export class Sinking {
  constructor(o) {
    this.t0 = o.t0; this.p = o.pos.slice(); this.hdg = o.hdg || 0; this.L = o.L || 155; this.B = o.B || 20; this.seed = o.seed || 77;
    this.dying = 0; this.dur = (o.dur || 60) + 120;
  }
  follow(pos, hdg, dying) { this.p[0] = pos[0]; this.p[2] = pos[2]; this.hdg = hdg; this.dying = dying; }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, P = this.p, L = this.L, B = this.B, s = Math.sin(this.hdg), c = Math.cos(this.hdg);
    if (!V.vis(P[0], 0, P[2], L * 1.5 + 60)) return;
    const pxm = V.pxm(P[0], 0, P[2]); if (pxm <= 0) return;
    const q = C.q, sd = this.seed, dy = this.dying, gone = 1 - ss(this.dur - 40, this.dur, age);
    // bubbles boiling up round the hull: each lives a moment, then is born again elsewhere (periodic in time)
    const nb = Math.round(Math.min(900, 60 + L * 3) * q * (pxm * L > 40 ? 1 : .3) * (.3 + dy)) ;
    for (let i = 0; i < nb; i++) {
      const per = .8 + 1.2 * hsh(i, sd), ph = (age / per + hsh(i, sd + 1)), cyc = Math.floor(ph), f = ph - cyc;
      const u = hsh(i * 31 + cyc, sd + 2) - .5, v = hsh(i * 17 + cyc, sd + 3) - .5;
      const al = u * L * 1.05, ac = v * B * 1.4 * (1 + age * .01);
      dot(P[0] + s * al + c * ac, .25 + .5 * f, P[2] + c * al - s * ac, pxm > 4 ? 2 : 1, WH[0], WH[1], WH[2], .8 * Math.sin(f * Math.PI) * gone);
    }
    // the sheen: a slick of faint dots spreading out on the water, drifting downwind
    const Rs = L * (.3 + .9 * sat(age / 150)), ns = Math.round(Math.min(1400, 200 + Rs * pxm * 12) * q * (pxm * L > 30 ? 1 : .3));
    for (let i = 0; i < ns; i++) {
      const th = hsh(i, sd + 4) * TAU, rr = Math.sqrt(hsh(i, sd + 5)), ex = 1 + .5 * hsh(i, sd + 6);
      const al = (i & 1 ? 1 : -1) * rr * Rs * .6 * ex, ac = Math.sin(th) * rr * Rs * .35;
      dot(P[0] + s * al + c * ac + C.wind[0] * age * .3, .2, P[2] + c * al - s * ac + C.wind[2] * age * .3, 1, 222, 228, 214, .38 * (1 - rr * .5) * gone * sat(age / 5) * (.6 + .4 * hsh(i, sd + 13)));
    }
    // steam where the hot hull goes under
    if (dy > .1 && dy < .95) {
      const k = Math.sin((dy - .1) / .85 * Math.PI), np = Math.round(90 * q * k);
      for (let i = 0; i < np; i++) {
        const per = 3 + 3 * hsh(i, sd + 9), ph = age / per + hsh(i, sd + 10), cyc = Math.floor(ph), f = ph - cyc;
        const u = hsh(i * 13 + cyc, sd + 11) - .5, al = u * L * .9, ac = (hsh(i * 7 + cyc, sd + 12) > .5 ? 1 : -1) * B * .5;
        const rad = 1 + 5 * f, j = (i * 3 + cyc * 7) & GM;
        dot(P[0] + s * al + c * ac + GT[j] * rad + C.wind[0] * f * per, 1 + 18 * f + GT[(j + 1) & GM] * rad * .5, P[2] + c * al - s * ac + GT[(j + 2) & GM] * rad + C.wind[2] * f * per, pxm > 3 ? 2 : 1, 236, 240, 232, .5 * k * (1 - f) * Math.min(1, f * 5));
      }
    }
  }
}
