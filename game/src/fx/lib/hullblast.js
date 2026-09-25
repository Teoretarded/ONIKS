/* HullBlast: a warhead going off on a hull, a vehicle, a site, in Point Cloud. Scaled by the warhead (kg: s = cbrt(kg /
   250), 1 = an Oniks-class hit). Everything an analytic function of the age plus a seeded index.
     flash      a white core and a warm light that lights the hull's dots round it (the engine's dynamic light), a lift of
                the whole frame when close, a halo of warm dots and a streak across the lens
     shell      the pressure front as a thin shell of faint white dots racing out for a quarter of a second, and where it
                meets the water a ring of dots running out across the sea (the shock), fading as it goes
     burst      a dense ball of sparks and fragments flung out, mostly off the struck face (the normal), fast and
                decelerating hard (drag), falling under gravity, each with a short tail of its earlier places; white-hot
                cooling through amber to a dull coral; a fifth of them heavy, arcing far
     fireball   swelling at the hole, white-hot, then amber with a coral skin, rising and rolling up as it cools into
     smoke      a dark mushroom: a stem from the hole and a cap climbing to ~60 m x s, spreading and drifting downwind,
                lit warm from below while the fire under it burns
   o: { t0, pos (world, on the surface), n (world outward normal), kg, seed, sea (water round it), gy (ground / sea y) } */
import { TAU, GT, GM, BALL, NB, sat, ss, hsh, dotHalo, streak } from './core.js';

const AMBER = [255, 176, 92], EMBER = [255, 106, 61], WHITE = [255, 250, 238];

export class HullBlast {
  constructor(o) {
    this.t0 = o.t0; this.p = o.pos.slice(); this.seed = o.seed || 7;
    const n = o.n || [0, 1, 0], l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.n = [n[0] / l, n[1] / l, n[2] / l];
    this.s = Math.max(.25, Math.cbrt((o.kg || 250) / 250));
    this.sea = !!o.sea; this.gy = o.gy || 0;
    this.dur = 18 + 6 * this.s;
    this.nB = Math.round(700 + 2600 * Math.min(1.4, this.s));
  }
  draw(C, a) {
    if (a < 0 || a > this.dur) return;
    const V = C.V, dot = C.dot, P = this.p, N = this.n, s = this.s, sd = this.seed, q = C.q;
    if (!V.vis(P[0], P[1] + 40 * s, P[2], 160 * s + 60)) return;
    const zc = V.depth(P[0], P[1], P[2]); if (zc < V.near) return;
    const pxm = V.fl / zc, s2 = Math.sqrt(s);
    // ---- flash and its light
    const I = a < .03 ? a / .03 : Math.exp(-(a - .03) * 2.2);
    C.light(P[0] + N[0] * 4 * s, P[1] + N[1] * 4 * s + 2 * s, P[2] + N[2] * 4 * s, 255, 226, 180, 2.2 * I * s2, 90 * s + 30);
    if (a < .2) C.lift(.16 * (1 - a / .2) * Math.min(1, 3000 * s / zc), 255, 236, 210);
    if (a < 1.4) {
      C.halo(P[0], P[1], P[2], Math.min(90, Math.max(10, pxm * 14 * s)), 255, 250, 236, .9 * I);
      dotHalo(C, P[0], P[1], P[2], Math.max(110, pxm * 70 * s), 1600, AMBER[0], AMBER[1], AMBER[2], .32 * I);
      if (a < .9) streak(C, P[0], P[1], P[2], Math.max(600, pxm * 900 * s), 255, 236, 206, I * Math.exp(-a * 2.5));
    }
    // ---- the pressure front: a shell of faint dots, and the ring over the water
    if (a < .3) {
      const R = 34 * s * (1 - Math.exp(-a * 14)), rp = R * pxm, nS = Math.round(Math.min(2400, 120 + rp * rp * .06) * q), al = .5 * (1 - a / .3);
      for (let k = 0; k < nS; k++) {
        const j = ((k * 37 + sd) % NB) * 4, r = BALL[j + 3] || 1, x = BALL[j] / r, y = BALL[j + 1] / r, z = BALL[j + 2] / r;
        dot(P[0] + x * R, P[1] + y * R, P[2] + z * R, 1, 236, 238, 232, al);
      }
    }
    if (this.sea && a < 2.2 && P[1] - this.gy < 18 * s) {
      const R = 190 * s * (1 - Math.exp(-a * 2.4)) + 6 * s, al = .75 * (1 - ss(.2, 2.2, a)) * (1 - sat((P[1] - this.gy) / (18 * s)) * .6);
      const nR = Math.round(Math.min(2600, 80 + R * pxm * 5) * q);
      for (let k = 0; k < nR; k++) {
        const th = k / nR * TAU + hsh(k, sd) * .02, w = GT[(k * 7 + sd) & GM] * .9 * s * (1 + a);
        dot(P[0] + Math.sin(th) * (R + w), this.gy + .3 + Math.abs(GT[(k * 3 + sd) & GM]) * .5 * s * (1 - a / 2.2), P[2] + Math.cos(th) * (R + w), 1, 236, 240, 236, al * (.6 + .4 * hsh(k, sd + 1)));
      }
    }
    // ---- the burst: sparks and fragments
    if (a < 5) {
      const nB = Math.round(this.nB * q * (pxm * s < .08 ? .3 : 1)), tails = pxm * s > .4 ? 5 : 2;
      for (let i = 0; i < nB; i++) {
        const j = ((i * 53 + sd * 7) % NB) * 4, r0 = BALL[j + 3] || 1;
        // out of the struck face: the ball pushed along the normal
        let dx = BALL[j] / r0 + N[0] * 1.15, dy = BALL[j + 1] / r0 + N[1] * 1.15 + .25, dz = BALL[j + 2] / r0 + N[2] * 1.15;
        const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        const heavy = hsh(i, sd + 2) < .2, k = heavy ? .35 + .5 * hsh(i, sd + 3) : 1.6 + 2.8 * hsh(i, sd + 3);
        const v0 = (heavy ? 40 + 90 * hsh(i, sd + 4) : 60 + 320 * Math.pow(hsh(i, sd + 4), 1.4)) * s2;
        const life = heavy ? 2.5 + 2.5 * hsh(i, sd + 5) : .5 + 1.6 * hsh(i, sd + 5);
        if (a > life) continue;
        const heat = Math.exp(-a / (heavy ? 1.1 : .45)), fade = Math.pow(1 - a / life, .8);
        for (let t = 0; t < tails; t++) {
          const at = a - t * (heavy ? .05 : .025); if (at <= 0) break;
          const e = Math.exp(-k * at), m = (1 - e) / k, gy = 9.81 * (at - m) / k;
          const y = P[1] + dy * v0 * m - gy;
          if (y < this.gy) break;
          const w = fade * (1 - t / tails), h = heat * (1 - t / (tails + 1));
          const cr = 255, cg = EMBER[1] + (WHITE[1] - EMBER[1]) * h, cb = EMBER[2] + (WHITE[2] - EMBER[2]) * h * h;
          if (!t && h > .45) C.glow(P[0] + dx * v0 * m, y, P[2] + dz * v0 * m, pxm > .4 ? 2 : 1, cr, cg, cb, w * h);
          dot(P[0] + dx * v0 * m, y, P[2] + dz * v0 * m, !t && pxm > .6 ? 2 : 1, cr * (.5 + .5 * w), cg * (.5 + .5 * w), cb * (.5 + .5 * w), 1);
        }
      }
    }
    // ---- the fireball, then the smoke mushroom
    const W0 = C.wind[0], W2 = C.wind[2];
    if (a < 6) {
      const rf = s * (6 + 17 * (1 - Math.exp(-a * 3.5))), up = s * (a * 6 + 1.6 * a * a), off = s * 5 * (1 - Math.exp(-a * 6));
      const cx = P[0] + N[0] * off + W0 * a * .3, cy = P[1] + N[1] * off + up, cz = P[2] + N[2] * off + W2 * a * .3;
      const heat = Math.exp(-a / 1.5), If = Math.min(1, a / .03) * (1 - ss(3.5, 6, a)), rp = rf * pxm;
      const nf = Math.round(Math.min(6000, 300 + rp * rp * .5) * q), boost = Math.min(2, Math.sqrt(3000 / Math.max(100, nf)));
      C.light(cx, cy, cz, 255, 170, 90, .9 * If * s2 * (.3 + .7 * heat), 50 * s + 20);
      for (let k = 0; k < nf; k++) {
        const j = ((k * 61 + sd) % NB) * 4, g = (k * 3 + sd) & GM;
        const ox = BALL[j] + GT[g] * .04, oy = BALL[j + 1] * .85 + GT[(g + 1) & GM] * .04, oz = BALL[j + 2] + GT[(g + 2) & GM] * .04, d2 = ox * ox + oy * oy + oz * oz;
        // white-hot core, amber body, a coral skin; soot creeping in from the skin as it cools
        const h = heat * (1 - .5 * d2), soot = ss(1.4, 5, a) * (.35 + .65 * d2);
        let r = AMBER[0] + (WHITE[0] - AMBER[0]) * h, gg = AMBER[1] + (WHITE[1] - AMBER[1]) * h - 60 * d2 * (1 - h), b = AMBER[2] + (WHITE[2] - AMBER[2]) * h * h - 30 * d2;
        r = r * (1 - soot) + 150 * soot; gg = gg * (1 - soot) + 140 * soot; b = b * (1 - soot) + 130 * soot;
        const al = If * (1 - .4 * d2) * boost;
        if (al < .02) continue;
        dot(cx + ox * rf, cy + oy * rf, cz + oz * rf, rp > 40 ? 2 : 1, r, gg, b, al > 1 ? 1 : al);
      }
    }
    if (a > 1.6) {
      // the mushroom: the cap climbs and spreads, the stem thins; dark, lit warm from below early on
      const b = a - 1.6 + .8, H = 62 * s * (1 - Math.exp(-b / 4.5)) + 10 * s, Rc = s * (9 + 22 * (1 - Math.exp(-b / 5))) + b * .5;
      const dr = b * (.35 + .05 * b), cx = P[0] + W0 * dr, cz = P[2] + W2 * dr, cy = P[1] + H;
      const fade = ss(1.6, 4.5, a) * (1 - ss(this.dur - 9, this.dur, a)), lit = Math.exp(-b / 4);
      const rp = Rc * pxm, nc = Math.round(Math.min(3200, 160 + rp * rp * .3) * q), boost = Math.min(2.4, Math.sqrt(2400 / Math.max(120, nc)));
      for (let k = 0; k < nc; k++) {
        const g = (k * 5 + sd * 3) & GM, u = hsh(k, sd + 9);
        let x, y, z, sh;
        if (u < .7) {
          // cap: a flattened torus rolling over a dome
          const th = hsh(k, sd + 10) * TAU, ph = hsh(k, sd + 11) * TAU, rr = Rc * .62, tr = Rc * .42;
          x = Math.cos(th) * (rr + Math.cos(ph) * tr) + GT[g] * Rc * .12;
          z = Math.sin(th) * (rr + Math.cos(ph) * tr) + GT[(g + 2) & GM] * Rc * .12;
          y = Math.sin(ph) * tr * .7 + GT[(g + 1) & GM] * Rc * .1;
          sh = .5 + .5 * Math.sin(ph);
        } else {
          // stem
          const hh = hsh(k, sd + 12), rs = Rc * (.18 + .22 * (1 - hh)) * (.6 + .4 * Math.abs(GT[g]));
          const th = hsh(k, sd + 13) * TAU;
          x = Math.cos(th) * rs - W0 * dr * (1 - hh); z = Math.sin(th) * rs - W2 * dr * (1 - hh); y = -H * (1 - hh) * .92;
          sh = .3;
        }
        const al = fade * (.35 + .4 * sh) * boost * (.6 + .8 * ((k * .618034) % 1)) * .7;
        if (al < .02) continue;
        const warm = lit * (1 - sh) * (y < 0 ? 1 : .5);
        dot(cx + x, cy + y, cz + z, rp > 60 ? 2 : 1, 150 + 100 * warm + 40 * sh, 146 + 40 * warm + 40 * sh, 140 + 10 * warm + 38 * sh, al > 1 ? 1 : al);
      }
    }
  }
}
