/* Launches: one-shot effects with a duration, drawn analytically in their age.
   ColdLaunch  the TEL's cold ejection (pc_anatomy_film): gas out of the tube mouth, the front cap blown off and
               tumbling away, the booster lighting a few metres up, its jet reaching the pad and rolling out.
   VlsLaunch   Mk 41 (pe_aegis_fx drawLaunch): the cell flashes, the exhaust rolls over the deck, rises, drifts.
   HotLaunch   a tube or rail launch (57E6, ESSM, aircraft stores): a flash and a burst of smoke back and out.
   GunBlast    the 5" Mk 45: flash, a small fireball pushed out along the bore, the blast ring, the pressure
               ring on the water, a cloud of gun smoke drifting off. */
import { WH, LIME, HOT, SMOKE, GREY, TAU, GT, GM, BALL, NB, sat, ss, clamp, hsh, rng, perp, dragH, ballistic, puffN, dotHalo } from './core.js';

/* a table of puffs: birth, x0 y0 z0 (offset from origin), vx vy vz, kd, life, size, growth, heat, bright */
const PS = 13;
function drawPuffs(C, T, n, ox, oy, oz, age, k, o) {
  const V = C.V, e = V.eye, f = V.f, fl = V.fl, near = V.near, wx = C.wind[0], wz = C.wind[2], q = C.q, dot = C.dot;
  const rise = o.rise || 0, hot0 = o.hotC || HOT, cool = o.cool || SMOKE, ground = o.gy === undefined ? -1e9 : o.gy, lime = o.lime || 0;
  for (let i = 0; i < n; i++) {
    const j = i * PS, b = age - T[j]; if (b < 0) continue;
    const life = T[j + 8]; if (b > life) continue;
    const kd = T[j + 7], h = dragH(kd, b), heat = T[j + 11] * Math.exp(-b / 1.2);
    const x = ox + T[j + 1] + T[j + 4] * h + wx * (b - h * .6), z = oz + T[j + 3] + T[j + 6] * h + wz * (b - h * .6);
    let y = oy + T[j + 2] + T[j + 5] * h + rise * b + 1.8 * heat * (1 - Math.exp(-b / 1.2));
    if (y < ground + .3) y = ground + .3;
    const zc = (x - e[0]) * f[0] + (y - e[1]) * f[1] + (z - e[2]) * f[2];
    const rad = T[j + 9] + T[j + 10] * Math.sqrt(b);
    if (zc < near + rad * .3) continue;
    const pxm = fl / zc;
    const life1 = 1 - b / life, al = k * T[j + 12] * Math.min(1, b * 6) * Math.pow(life1, .7) * (.55 + .45 * Math.min(1, heat * 2));
    if (al < .01) continue;
    const lm = lime * Math.exp(-b * 2.2);
    const cr = cool[0] + (hot0[0] - cool[0]) * heat + (LIME[0] - cool[0]) * lm, cg = cool[1] + (hot0[1] - cool[1]) * heat + (LIME[1] - cool[1]) * lm, cb = cool[2] + (hot0[2] - cool[2]) * heat + (LIME[2] - cool[2]) * lm;
    const rp = rad * pxm;
    if (rp < 1.2) { dot(x, y, z, 1, cr, cg, cb, Math.min(1, al * 1.3)); continue; }
    if (!V.vis(x, y, z, rad * 2.5)) continue;
    const nd = Math.max(1, Math.round(Math.min(o.cap || 40, 2 + rp * rp * .03) * q));
    const aa = al * Math.min(1, 2.4 / Math.sqrt(nd / 3)) * ss(rad * .4, rad * 2, zc);
    const sz = heat > .4 && pxm > 3 ? 2 : pxm > 6 ? 2 : 1, g0 = (i * 131 + 17) | 0;
    for (let m = 0; m < nd; m++) {
      const g = (g0 + m * 1733) & GM, py = y + GT[(g + 1) & GM] * .75 * rad;
      if (py < ground + .15) continue;
      const w = aa * (.55 + .8 * ((g * .618034) % 1));
      dot(x + GT[g] * rad, py, z + GT[(g + 2) & GM] * rad, sz, cr, cg, cb, w > 1 ? 1 : w);
    }
  }
}
function table(n) { return new Float32Array(n * PS); }
function setP(T, i, tb, x, y, z, vx, vy, vz, kd, life, sz, gr, heat, br) { const j = i * PS; T[j] = tb; T[j + 1] = x; T[j + 2] = y; T[j + 3] = z; T[j + 4] = vx; T[j + 5] = vy; T[j + 6] = vz; T[j + 7] = kd; T[j + 8] = life; T[j + 9] = sz; T[j + 10] = gr; T[j + 11] = heat; T[j + 12] = br; }

/* ---------------- the TEL's cold launch ---------------- */
/* o: { t0, pos (tube mouth), axis (unit, along the tube), ground(x, z), seed, ign (s after ejection the booster
   lights, default .38), rise (m/s the round climbs meanwhile, default 30) } */
export class ColdLaunch {
  constructor(o) {
    const r = rng(o.seed || 606), a = o.axis, P = o.pos;
    this.t0 = o.t0; this.p = P.slice(); this.a = a.slice(); this.ign = o.ign || .38; this.dur = 42;
    this.gy = o.ground ? o.ground(P[0], P[2]) : 0;
    const B = perp(a[0], a[1], a[2], new Float64Array(6));
    // gas generator: out of the mouth in the first .75 s
    const nG = 360, TG = table(nG);
    for (let i = 0; i < nG; i++) {
      const tb = r() * .7, th = r() * TAU, s = 2 + r() * 7, sp = 4 + r() * 22, c = Math.cos(th) * s, d = Math.sin(th) * s;
      setP(TG, i, tb, 0, 0, 0, a[0] * sp + B[0] * c + B[3] * d, a[1] * sp + B[1] * c + B[4] * d + r() * 2, a[2] * sp + B[2] * c + B[5] * d, 1.6 + r() * 1.4, 3 + r() * 3.5, .45, 1.2 + r() * .5, .12, .6 + .4 * r());
    }
    this.TG = TG; this.nG = nG;
    // the booster lights above the mouth: its jet reaches the pad and rolls out along the ground
    const hI = (o.rise || 30) * this.ign + 2, top = [P[0] + a[0] * hI, P[1] + a[1] * hI, P[2] + a[2] * hI];
    this.pI = top;
    const nI = 900, TI = table(nI), gy = this.gy;
    for (let i = 0; i < nI; i++) {
      const tb = this.ign + .05 + Math.pow(r(), 1.5) * .9, th = r() * TAU, s = 6 + r() * 24;
      setP(TI, i, tb, (r() - .5) * 3, gy - P[1] + .4, (r() - .5) * 3, Math.cos(th) * s, .4 + r() * 2.8, Math.sin(th) * s, .9 + r() * .8, 12 + r() * 14, 1, 2.2 + r() * .6, .45, .5 + .5 * r());
    }
    this.TI = TI; this.nI = nI;
    // a column of the jet's own smoke between the pad and the ignition point
    const nC = 160, TC = table(nC);
    for (let i = 0; i < nC; i++) {
      const u = r(), tb = this.ign + u * .5, y = (gy - P[1]) + (P[1] - gy + hI) * u;
      setP(TC, i, tb, a[0] * hI * u + (r() - .5), y, a[2] * hI * u + (r() - .5), (r() - .5) * 6, -8 * (1 - u) + r() * 3, (r() - .5) * 6, 1.4, 8 + r() * 10, .8, 1.8, .7, .6 + .4 * r());
    }
    this.TC = TC; this.nC = nC;
    // the front cap, blown off by the gas: tumbling away and down
    const side = [B[0] * (r() - .5) * 10, 3 + r() * 4, B[2] * (r() - .5) * 10];
    this.cap = ballistic(P, [a[0] * 22 + side[0], a[1] * 22 + side[1], a[2] * 22 + side[2]], .018, o.ground, 14);
    this.capSpin = 11 + r() * 6; this.capAx = [r() - .5, r() - .5, r() - .5];
    this.seed = o.seed || 606; this.Q = [0, 0, 0];
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p, V = C.V;
    if (!V.vis(P[0], P[1] + 20, P[2], 260)) return;
    const k = 1;
    drawPuffs(C, this.TG, this.nG, P[0], P[1], P[2], age, k, { rise: .35, cap: 36 });
    drawPuffs(C, this.TC, this.nC, P[0], P[1], P[2], age, k, { rise: .8, lime: .6, gy: this.gy, cap: 30 });
    drawPuffs(C, this.TI, this.nI, P[0], P[1], P[2], age, k, { rise: .25, lime: .9, gy: this.gy, cap: 44 });
    // ejection: a soft white breath at the mouth; ignition: a flash that lights the launcher and the pad
    if (age < .25) { const w = 1 - age / .25; C.halo(P[0], P[1], P[2], -2.5, 230, 236, 220, .2 * w); }
    const ai = age - this.ign;
    if (ai > -.02 && ai < 1.4) {
      const w = ai < .04 ? sat((ai + .02) / .06) : Math.exp(-(ai - .04) * 3.2), I = this.pI;
      C.dot(I[0], I[1], I[2], 4, 255, 255, 240, Math.min(1, w * 1.4));
      C.halo(I[0], I[1], I[2], -5 * (.6 + .4 * w), 255, 250, 225, .6 * w);
      dotHalo(C, I[0], I[1], I[2], Math.max(30, 26 * C.V.pxm(I[0], I[1], I[2])), 500, LIME[0], LIME[1], LIME[2], .22 * w);
      C.light(I[0], (I[1] + this.gy) / 2, I[2], 245, 255, 210, .55 * w, 90);
      // the jet hitting the pad: a flat bright ring
      if (ai > 0 && ai < .9) {
        const R = 3 + ai * 26, n = Math.round(Math.min(160, 20 + R * V.pxm(P[0], this.gy, P[2]) * 2) * C.q), al = .7 * (1 - ai / .9);
        for (let m = 0; m < n; m++) { const th = m / n * TAU + hsh(m, this.seed) * .2, rr = R * (.85 + .3 * hsh(m, this.seed + 1)); C.dot(P[0] + Math.cos(th) * rr, this.gy + .3 + .6 * hsh(m, 9), P[2] + Math.sin(th) * rr, 1, 245, 255, 215, al); }
      }
    }
    // the cap: a disc of dots, tumbling
    const cp = this.cap;
    if (age < 14) {
      const p = cp.at(age, this.Q), pxm = V.pxm(p[0], p[1], p[2]);
      if (pxm > .4) {
        const sp = Math.min(age, cp.landed) * this.capSpin, ca = Math.cos(sp), sa = Math.sin(sp), A = this.capAx;
        const fade = 1 - ss(10, 14, age), n = pxm > 20 ? 40 : pxm > 4 ? 18 : 6;
        for (let m = 0; m < n; m++) {
          const th = m / n * TAU, rr = .47 * (m & 1 ? 1 : .6);
          let lx = Math.cos(th) * rr, ly = Math.sin(th) * rr, lz = 0;
          // tumble: rotate the disc about its own axis A mixed in
          const y2 = ly * ca - lz * sa, z2 = ly * sa + lz * ca; ly = y2; lz = z2;
          const x3 = lx * Math.cos(sp * .6) + lz * Math.sin(sp * .6), z3 = -lx * Math.sin(sp * .6) + lz * Math.cos(sp * .6);
          C.dot(p[0] + x3 + A[0] * .05, p[1] + ly, p[2] + z3, pxm > 30 ? 2 : 1, WH[0], WH[1], WH[2], .85 * fade);
        }
      }
    }
  }
}

/* ---------------- Mk 41 cell ---------------- */
/* o: { t0, pos (cell top), seed, big (Tomahawk: a longer, fatter blast) } */
export class VlsLaunch {
  constructor(o) {
    const r = rng(o.seed || 6101), n = o.big ? 440 : 380, T = table(n);
    this.t0 = o.t0; this.p = o.pos.slice(); this.dur = 22; this.big = !!o.big; this.seed = o.seed || 6101;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = 3 + 22 * Math.pow(r(), 1.4);
      setP(T, i, 1.6 * Math.pow(r(), 1.8), (r() - .5) * .6, .3, (r() - .5) * .6, Math.cos(a) * sp, 2 + 16 * r(), Math.sin(a) * sp * .8, .45 + .8 * r(), 6 + 13 * r(), .5, .9 + .5 * r(), .8, .55 + .45 * r());
    }
    this.T = T; this.n = n;
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p, V = C.V;
    if (!V.vis(P[0], P[1] + 20, P[2], 220)) return;
    if (age < 1.3) {
      const w = 1 - age / 1.3;
      C.halo(P[0], P[1] + 1.2, P[2], -9 * (.55 + .45 * w), 255, 226, 190, .7 * w * w);
      dotHalo(C, P[0], P[1] + 2, P[2], Math.max(24, 30 * C.V.pxm(P[0], P[1], P[2])), 400, 255, 236, 200, .3 * w * w);
      C.dot(P[0], P[1] + 1.2, P[2], V.pxm(P[0], P[1], P[2]) > .7 ? 4 : 3, 255, 250, 238, Math.min(1, w * 1.5));
      C.light(P[0], P[1] + 4, P[2], 255, 236, 200, .6 * w * w, 70);
      if (age < .12) C.lift(.05 * (1 - age / .12) * Math.min(1, 300 / V.dist(P[0], P[1], P[2])), 255, 240, 220);
    }
    drawPuffs(C, this.T, this.n, P[0], P[1], P[2], age, 1, { rise: 1.4, hotC: [255, 228, 184], cool: GREY, cap: 28 });
  }
}

/* ---------------- tube / rail launches ---------------- */
/* o: { t0, pos (muzzle), axis, seed, scale (1 = 57E6), ground } */
export class HotLaunch {
  constructor(o) {
    const r = rng(o.seed || 707), s = o.scale || 1, a = o.axis, n = Math.round(90 + 90 * s), T = table(n);
    this.t0 = o.t0; this.p = o.pos.slice(); this.a = a.slice(); this.s = s; this.dur = 14;
    this.gy = o.ground ? o.ground(o.pos[0], o.pos[2]) : -1e9;
    for (let i = 0; i < n; i++) {
      // most of the blast goes back out of the tube, some forward with the round
      const back = r() < .75, sp = (back ? 8 + 28 * r() : 4 + 12 * r()) * s, dir = back ? -1 : 1;
      const j = (i * 3) & GM;
      setP(T, i, .25 * Math.pow(r(), 1.5), 0, 0, 0, a[0] * sp * dir + GT[j] * 4 * s, a[1] * sp * dir + GT[j + 1] * 4 * s + 1, a[2] * sp * dir + GT[j + 2] * 4 * s, 1.2 + r(), 3 + 6 * r() * s, .3 * s, .8 * s, .7, .5 + .5 * r());
    }
    this.T = T; this.n = n;
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p;
    if (!C.V.vis(P[0], P[1], P[2], 80)) return;
    if (age < .5) {
      const w = 1 - age / .5;
      C.dot(P[0], P[1], P[2], 3, 255, 252, 236, Math.min(1, w * 1.6));
      C.halo(P[0], P[1], P[2], -3.5 * this.s, 255, 240, 210, .55 * w * w);
      C.light(P[0], P[1], P[2], 250, 245, 215, .4 * w * w * this.s, 40 * this.s);
    }
    drawPuffs(C, this.T, this.n, P[0], P[1], P[2], age, 1, { rise: .6, lime: .5, gy: this.gy, cap: 24 });
  }
}

/* ---------------- 5" gun blast ---------------- */
/* o: { t0, pos (muzzle), axis (bore), seed, sea (true: the pressure ring on the water) } */
export class GunBlast {
  constructor(o) {
    const r = rng(o.seed || 505), a = o.axis, n = 140, T = table(n);
    this.t0 = o.t0; this.p = o.pos.slice(); this.a = a.slice(); this.dur = 9; this.sea = o.sea !== false; this.seed = o.seed || 505;
    this.B = perp(a[0], a[1], a[2], new Float64Array(6));
    for (let i = 0; i < n; i++) {
      const fw = r(), sp = 10 + 55 * fw * fw, j = (i * 5) & GM;
      setP(T, i, .03 * r(), 0, 0, 0, a[0] * sp + GT[j] * 5, a[1] * sp + GT[j + 1] * 5, a[2] * sp + GT[j + 2] * 5, 2.2 + 1.5 * r(), 3.5 + 4 * r(), .6, 1.3 + .6 * r(), .9, .5 + .5 * r());
    }
    this.T = T; this.n = n;
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p, a = this.a, B = this.B, V = C.V, dot = C.dot;
    if (!V.vis(P[0], P[1], P[2], 120)) return;
    const pxm = V.pxm(P[0], P[1], P[2]);
    // the flash: a white core and a fireball blown out along the bore, swelling and cooling in a quarter second
    if (age < .3) {
      const w = 1 - age / .3, L = 4 + 12 * Math.sqrt(age / .3), Rf = 1.4 + 2.6 * Math.sqrt(age / .3);
      dot(P[0], P[1], P[2], pxm > 1 ? 4 : 3, 255, 255, 245, Math.min(1, w * 1.5));
      C.halo(P[0] + a[0] * L * .4, P[1] + a[1] * L * .4, P[2] + a[2] * L * .4, -(4 + 5 * w), 255, 248, 222, .75 * w * w);
      dotHalo(C, P[0] + a[0] * 4, P[1] + a[1] * 4, P[2] + a[2] * 4, Math.max(40, 30 * pxm), 500, LIME[0], LIME[1], LIME[2], .2 * w * w);
      C.light(P[0] + a[0] * 5, P[1] + a[1] * 5 + 2, P[2] + a[2] * 5, 255, 248, 215, 1.4 * w * w, 80);
      if (age < .04) C.lift(.05 * (1 - age / .04) * Math.min(1, 400 / V.dist(P[0], P[1], P[2])), 255, 245, 225);
      const n = Math.round(Math.min(2400, 60 + L * Rf * pxm * pxm * 1.2) * C.q);
      for (let m = 0; m < n; m++) {
        // a pear of fire: a ball stretched along the bore, fat at its far end, hottest at the muzzle
        const j = ((m * 7 + this.seed) % NB) * 4, ux = BALL[j], uy = BALL[j + 1], uz = BALL[j + 2], q = BALL[j + 3];
        const s2 = L * (.5 + .5 * ux), rr = Rf * (.55 + .45 * ux);
        const c = uy * rr, d = uz * rr, h = Math.exp(-(s2 / L) * 2.2) * (1 - .5 * q) * w;
        dot(P[0] + a[0] * s2 + B[0] * c + B[3] * d, P[1] + a[1] * s2 + B[1] * c + B[4] * d, P[2] + a[2] * s2 + B[2] * c + B[5] * d,
          pxm > 6 ? 2 : 1, 236 + 19 * h, 255, 160 + 90 * h, Math.min(1, (.3 + .8 * h) * (.35 + .65 * w) * (1.1 - .5 * q)));
      }
    }
    // the blast ring: a ring of dots round the bore, running out and thinning
    if (age < .7) {
      const R = 1.5 + 18 * Math.sqrt(age / .7), w = 1 - age / .7, cx = P[0] + a[0] * 3, cy = P[1] + a[1] * 3, cz = P[2] + a[2] * 3;
      const n = Math.round(Math.min(700, 30 + R * pxm * 5) * C.q), sz = R * pxm > 150 ? 2 : 1;
      for (let m = 0; m < n; m++) {
        const th = m / n * TAU, rr = R * (.92 + .16 * hsh(m, this.seed + 3)), c = Math.cos(th) * rr, d = Math.sin(th) * rr;
        dot(cx + B[0] * c + B[3] * d, cy + B[1] * c + B[4] * d, cz + B[2] * c + B[5] * d, sz, 236, 240, 226, .75 * w);
      }
    }
    // the pressure wave flattening the sea under the muzzle
    if (this.sea && age < .6) {
      const R = 4 + 60 * Math.sqrt(age / .6), w = 1 - age / .6, gx = P[0] + a[0] * 8, gz = P[2] + a[2] * 8;
      const n = Math.round(Math.min(200, 30 + R * V.pxm(gx, 0, gz) * 3) * C.q);
      for (let m = 0; m < n; m++) { const th = m / n * TAU, rr = R * (.94 + .12 * hsh(m, 5)); dot(gx + Math.sin(th) * rr, .35, gz + Math.cos(th) * rr, 1, 236, 238, 228, .5 * w); }
    }
    drawPuffs(C, this.T, this.n, P[0], P[1], P[2], age, 1, { rise: .5, hotC: [255, 240, 205], cool: GREY, cap: 30 });
  }
}
