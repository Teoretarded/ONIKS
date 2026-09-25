/* Launches: one-shot effects with a duration, drawn analytically in their age.
   ColdLaunch  the TEL's cold ejection (pc_anatomy_film): gas out of the tube mouth, the front cap blown off and
               tumbling away, the booster lighting a few metres up, its jet reaching the pad and rolling out.
   VlsLaunch   Mk 41 (pe_aegis_fx drawLaunch): the cell flashes, the exhaust rolls over the deck, rises, drifts.
   HotLaunch   a tube or rail launch (57E6, ESSM, aircraft stores): a flash and a burst of smoke back and out.
   GunBlast    the 5" Mk 45: flash, a small fireball pushed out along the bore, the blast ring, the pressure
               ring on the water, a cloud of gun smoke drifting off.
   BalLaunch   a Kh-35U out of the Bal's raised pack: the booster lighting in its container (a flash lighting the pack
               and the ground), the efflux out of the container's front end rolling over the cab and the ground, the
               jet splashing off the pack and raising dust under the climb.
   SubLaunch   a round out of a submarine (Kalibr from the Kilo's tubes, Tomahawk from the Virginia's payload tubes):
               the sea heaving up in a dome as it breaches, a column of water dragged up and falling back, the
               booster lighting a few metres over the sea (flash, a ring blasted across the water, a cloud of steam
               rolling out and rising), the spray coming down in rings.
   TorpLaunch  a torpedo into the water: out of a ship's deck tubes (a puff of air, the round arcing out, a small
               splash off the hull), dropped from a helicopter (falling under its drogue chute, a splash under it),
               from a boat's bow tubes (at most a faint boil when the boat runs shallow). */
import { WH, LIME, HOT, SMOKE, GREY, TAU, G, G2, DEG, GT, GM, BALL, NB, sat, ss, clamp, hsh, rng, perp, dragH, yDrag, dropTime, ballistic, puffN, dotHalo } from './core.js';
import { Splash } from './impact.js';

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
/* o: { t0, pos (muzzle), axis, seed, scale (1 = 57E6), ground, steam (a catapult's breath: white, no flash) } */
export class HotLaunch {
  constructor(o) {
    const r = rng(o.seed || 707), s = o.scale || 1, a = o.axis, n = Math.round(90 + 90 * s), T = table(n);
    this.t0 = o.t0; this.p = o.pos.slice(); this.a = a.slice(); this.s = s; this.dur = 14; this.steam = !!o.steam;
    this.gy = o.ground ? o.ground(o.pos[0], o.pos[2]) : -1e9;
    for (let i = 0; i < n; i++) {
      // most of the blast goes back out of the tube, some forward with the round
      const back = r() < .75, sp = (back ? 8 + 28 * r() : 4 + 12 * r()) * s, dir = back ? -1 : 1;
      const j = (i * 3) & GM;
      setP(T, i, .25 * Math.pow(r(), 1.5), 0, 0, 0, a[0] * sp * dir + GT[j] * 4 * s, a[1] * sp * dir + GT[j + 1] * 4 * s + 1, a[2] * sp * dir + GT[j + 2] * 4 * s, 1.2 + r(), 3 + 6 * r() * s, .3 * s, .8 * s, this.steam ? 0 : .7, .5 + .5 * r());
    }
    this.T = T; this.n = n;
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p;
    if (!C.V.vis(P[0], P[1], P[2], 80)) return;
    if (age < .5 && !this.steam) {
      const w = 1 - age / .5;
      C.dot(P[0], P[1], P[2], 3, 255, 252, 236, Math.min(1, w * 1.6));
      C.halo(P[0], P[1], P[2], -3.5 * this.s, 255, 240, 210, .55 * w * w);
      C.light(P[0], P[1], P[2], 250, 245, 215, .4 * w * w * this.s, 40 * this.s);
    }
    if (this.steam) drawPuffs(C, this.T, this.n, P[0], P[1], P[2], age, .8, { rise: .8, gy: this.gy, cap: 24, cool: STEAM });
    else drawPuffs(C, this.T, this.n, P[0], P[1], P[2], age, 1, { rise: .6, lime: .5, gy: this.gy, cap: 24 });
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

/* ---------------- Bal: a Kh-35U out of the raised pack ---------------- */
/* o: { t0, pos (the container's mouth: the round leaves here), axis (unit, its flight: rearward and up the raise),
   len (m, the container: the booster's efflux also leaves its front end, low over the cab), ground(x, z), seed } */
const DUSTC = [206, 202, 190];
export class BalLaunch {
  constructor(o) {
    const r = rng(o.seed || 353), a = o.axis, P = o.pos, len = o.len || 6.5;
    this.t0 = o.t0; this.p = P.slice(); this.a = a.slice(); this.dur = 45; this.seed = o.seed || 353;
    const gy = this.gy = o.ground ? o.ground(P[0], P[2]) : 0;
    const B = perp(a[0], a[1], a[2], new Float64Array(6));
    // the container's front end, and where its efflux meets the ground ahead of it
    const fx = -a[0] * len, fy = -a[1] * len, fz = -a[2] * len;
    const hF = Math.max(.4, P[1] + fy - gy), sF = hF / Math.max(.25, a[1]);
    this.gp = [P[0] + fx - a[0] * sF, gy, P[2] + fz - a[2] * sF];
    // 1. out of the front end: the booster's first breath through the container, down over the cab onto the ground
    const nF = 220, TF = table(nF);
    for (let i = 0; i < nF; i++) {
      const sp = 8 + 26 * r(), j = (i * 3) & GM;
      setP(TF, i, .22 * Math.pow(r(), 1.5), fx, fy, fz, -a[0] * sp + GT[j] * 5, -a[1] * sp + GT[j + 1] * 3, -a[2] * sp + GT[j + 2] * 5, 1.3 + r(), 5 + 9 * r(), .45, 1.1 + .5 * r(), .8, .5 + .5 * r());
    }
    // 2. at the mouth: the jet splashing off the pack as the round leaves, thrown out round it
    const nM = 240, TM = table(nM);
    for (let i = 0; i < nM; i++) {
      const th = r() * TAU, s = 6 + 18 * r(), back = 3 + 10 * r(), c = Math.cos(th) * s, d = Math.sin(th) * s;
      setP(TM, i, .45 * Math.pow(r(), 1.4), 0, 0, 0, -a[0] * back + B[0] * c + B[3] * d, -a[1] * back + B[1] * c + B[4] * d + 1.5 * r(), -a[2] * back + B[2] * c + B[5] * d, 1.4 + r(), 6 + 10 * r(), .5, 1.3 + .5 * r(), .7, .5 + .5 * r());
    }
    // 3. the ground under the climb: the jet's smoke and the dust it raises for the first twenty metres
    const nG = 300, TG = table(nG);
    for (let i = 0; i < nG; i++) {
      const s = 2 + 22 * Math.pow(r(), .8), tb = s / 38 + .05 * r(), th = r() * TAU, sp = 4 + 16 * r();
      setP(TG, i, tb, a[0] * s + (r() - .5) * 3, gy - P[1] + .4, a[2] * s + (r() - .5) * 3, Math.cos(th) * sp, .4 + 2.2 * r(), Math.sin(th) * sp, 1 + .8 * r(), 10 + 14 * r(), .9, 1.9 + .6 * r(), .35, .45 + .5 * r());
    }
    this.T = [TF, TM, TG]; this.N = [nF, nM, nG];
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p, V = C.V;
    if (!V.vis(P[0], P[1] + 10, P[2], 220)) return;
    // the booster lighting in its container: a flash at the mouth lighting the pack, the vehicle and the ground
    if (age < 1.2) {
      const w = age < .03 ? age / .03 : Math.exp(-(age - .03) * 3.4);
      C.dot(P[0], P[1], P[2], 4, 255, 255, 240, Math.min(1, w * 1.4));
      C.halo(P[0], P[1], P[2], -4 * (.6 + .4 * w), 255, 250, 225, .6 * w);
      dotHalo(C, P[0], P[1], P[2], Math.max(26, 20 * V.pxm(P[0], P[1], P[2])), 420, LIME[0], LIME[1], LIME[2], .2 * w);
      C.light(P[0], P[1] - 1, P[2], 245, 255, 210, .55 * w, 60);
      if (age < .08) C.lift(.03 * (1 - age / .08) * Math.min(1, 250 / V.dist(P[0], P[1], P[2])), 250, 255, 225);
      // the efflux out of the front end hitting the ground: a flat ring running out
      if (age < .8) {
        const Gp = this.gp, R = 2 + age * 16, n = Math.round(Math.min(140, 16 + R * V.pxm(Gp[0], Gp[1], Gp[2]) * 2) * C.q), al = .6 * (1 - age / .8);
        for (let m = 0; m < n; m++) { const th = m / n * TAU + hsh(m, this.seed) * .2, rr = R * (.85 + .3 * hsh(m, this.seed + 1)); C.dot(Gp[0] + Math.cos(th) * rr, Gp[1] + .3 + .5 * hsh(m, 9), Gp[2] + Math.sin(th) * rr, 1, 245, 255, 215, al); }
      }
    }
    drawPuffs(C, this.T[0], this.N[0], P[0], P[1], P[2], age, 1, { rise: .5, lime: .7, gy: this.gy, cap: 36 });
    drawPuffs(C, this.T[1], this.N[1], P[0], P[1], P[2], age, 1, { rise: .6, lime: .8, gy: this.gy, cap: 36 });
    drawPuffs(C, this.T[2], this.N[2], P[0], P[1], P[2], age, .85, { rise: .3, lime: .4, gy: this.gy, cap: 40, cool: DUSTC });
  }
}

/* ---------------- a round out of a submarine ---------------- */
/* o: { t0, pos (on the sea over the tube / cell), seed, ign (s after the breach the booster lights, default .15),
   rise (m/s it leaves the water at, default 25), s (size: 1 Kalibr, .9 Tomahawk) } */
const STEAM = [224, 228, 220];
const WS = 7;   // water dot stride: vx vy vz k r0 delay tLand
export class SubLaunch {
  constructor(o) {
    const r = rng(o.seed || 1117), s = o.s || 1, P = o.pos;
    this.t0 = o.t0; this.p = [P[0], 0, P[2]]; this.s = s; this.seed = o.seed || 1117; this.dur = 42;
    this.ign = o.ign === undefined ? .15 : o.ign; this.hI = (o.rise || 25) * this.ign + 1.2;
    // the dome: the sea heaving up round the breaching round, thrown out and falling back
    const nD = Math.round(560 * s), D = new Float32Array(nD * WS);
    for (let i = 0; i < nD; i++) {
      const th = r() * TAU, el = (20 + 65 * Math.pow(r(), .7)) * DEG, v = (6 + 11 * r()) * s, k = .5 + 1.1 * r(), o6 = i * WS;
      D[o6] = Math.cos(th) * Math.cos(el) * v; D[o6 + 1] = Math.sin(el) * v; D[o6 + 2] = Math.sin(th) * Math.cos(el) * v;
      D[o6 + 3] = k; D[o6 + 4] = .4 + 1.4 * r(); D[o6 + 5] = .04 * r(); D[o6 + 6] = dropTime(0, D[o6 + 1], k, 0, 8);
    }
    // the column: water torn up by the round and its jet, sheeting off it, then falling back
    const nC = Math.round(950 * s), W = new Float32Array(nC * WS);
    for (let i = 0; i < nC; i++) {
      const th = r() * TAU, vr = .4 + 3.6 * r() * r(), vy = (7 + 32 * Math.pow(r(), 1.8)) * s, k = .25 + .6 * r(), o6 = i * WS;
      W[o6] = Math.cos(th) * vr; W[o6 + 1] = vy; W[o6 + 2] = Math.sin(th) * vr;
      W[o6 + 3] = k; W[o6 + 4] = .2 + .7 * r(); W[o6 + 5] = .35 * Math.pow(r(), 2); W[o6 + 6] = dropTime(0, vy, k, 0, 12);
    }
    this.D = D; this.nD = nD; this.W = W; this.nC = nC;
    // the steam: the booster's jet on the sea, rolling out across the water and rising
    const ig = this.ign, nI = Math.round(700 * s), TI = table(nI);
    for (let i = 0; i < nI; i++) {
      const tb = ig + .04 + Math.pow(r(), 1.6) * 1.3, th = r() * TAU, sp = (4 + 24 * r()) * s;
      setP(TI, i, tb, (r() - .5) * 3, .5, (r() - .5) * 3, Math.cos(th) * sp, .5 + 2.6 * r(), Math.sin(th) * sp, 1 + .7 * r(), 11 + 14 * r(), 1, 2.3 + .6 * r(), .5, .5 + .5 * r());
    }
    // and up the column between the sea and the flame
    const nT = 140, TC = table(nT);
    for (let i = 0; i < nT; i++) {
      const u = r(), tb = ig + u * .45;
      setP(TC, i, tb, (r() - .5) * 1.4, .6 + this.hI * u, (r() - .5) * 1.4, (r() - .5) * 5, -6 * (1 - u) + 3 * r(), (r() - .5) * 5, 1.4, 8 + 10 * r(), .7, 1.7, .75, .6 + .4 * r());
    }
    this.TI = TI; this.nI = nI; this.TC = TC; this.nT = nT;
    // the spray coming back down in rings, as the dome and the column land
    this.rings = [[.9, 3, 5.2], [1.9, 6, 4.2], [3.1, 9, 3.4]].map(([tb, r0, v]) => [tb * Math.sqrt(s), r0 * s, v]);
  }
  /* water dots flown from a table (the dome or the column) */
  water(C, T, n, age, pxm, al0) {
    const P = this.p, dot = C.dot, stp = Math.max(1, Math.round((pxm > 6 ? 1 : pxm > 2 ? 2 : pxm > .7 ? 4 : 8) / C.q)), sz = pxm > 2 ? 2 : 1;
    for (let i = 0; i < n; i += stp) {
      const o = i * WS, t = age - T[o + 5]; if (t <= 0) continue;
      const tl = T[o + 6], hl = Math.hypot(T[o], T[o + 2]) || 1, c = T[o] / hl, d = T[o + 2] / hl;
      if (t < tl) {
        const k = T[o + 3], h = dragH(k, t), y = yDrag(T[o + 1], k, t);
        const al = al0 * (.55 + .45 * hsh(i, this.seed)) * (stp > 2 ? 1.3 : 1);
        dot(P[0] + c * T[o + 4] + T[o] * h, Math.max(.2, y), P[2] + d * T[o + 4] + T[o + 2] * h, sz, WH[0], WH[1], WH[2], al > 1 ? 1 : al);
      } else if (t < tl + .5 && !(i % 3) && pxm > .4) {
        // where a drop comes down: a flick of spray off the water
        const w = t - tl, h = dragH(T[o + 3], tl), y = (2 + 3 * hsh(i, 5)) * w - G2 * w * w * 4;
        if (y > 0) dot(P[0] + c * T[o + 4] + T[o] * h, y + .2, P[2] + d * T[o + 4] + T[o + 2] * h, 1, WH[0], WH[1], WH[2], .6 * (1 - w / .5));
      }
    }
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p, V = C.V, dot = C.dot, s = this.s;
    if (!V.vis(P[0], 20, P[2], 260)) return;
    const pxm = V.pxm(P[0], 4, P[2]); if (pxm <= 0) return;
    // the breach: the dome and the column
    if (age < 4) this.water(C, this.D, this.nD, age, pxm, .85);
    if (age < 7) this.water(C, this.W, this.nC, age, pxm, .9);
    // the booster lighting just over the sea: a flash, the dotted lime halo, light on the water, a ring blasted out
    const ai = age - this.ign;
    if (ai > -.02 && ai < 1.4) {
      const w = ai < .04 ? sat((ai + .02) / .06) : Math.exp(-(ai - .04) * 3.2), y = this.hI;
      dot(P[0], y, P[2], 4, 255, 255, 240, Math.min(1, w * 1.4));
      C.halo(P[0], y, P[2], -5 * (.6 + .4 * w), 255, 250, 225, .6 * w);
      dotHalo(C, P[0], y, P[2], Math.max(30, 26 * V.pxm(P[0], y, P[2])), 500, LIME[0], LIME[1], LIME[2], .22 * w);
      C.light(P[0], y * .5 + 1, P[2], 245, 255, 210, .6 * w, 110);
      if (ai > 0 && ai < .1) C.lift(.04 * (1 - ai / .1) * Math.min(1, 300 / V.dist(P[0], y, P[2])), 250, 255, 225);
      if (ai > 0 && ai < 1) {
        const R = 3 + ai * 30 * s, n = Math.round(Math.min(220, 24 + R * pxm * 2) * C.q), al = .7 * (1 - ai);
        for (let m = 0; m < n; m++) { const th = m / n * TAU + hsh(m, this.seed) * .2, rr = R * (.86 + .28 * hsh(m, this.seed + 1)); dot(P[0] + Math.cos(th) * rr, .3 + .8 * hsh(m, 9) * (1 - ai), P[2] + Math.sin(th) * rr, 1, 240, 252, 222, al); }
      }
    }
    // the spray coming down: rings running out on the water
    for (let k = 0; k < 3; k++) {
      const R0 = this.rings[k], a = age - R0[0]; if (a < 0 || a > 4.5) continue;
      const R = R0[1] + a * R0[2], n = Math.round(Math.min(200, 14 + R * pxm * 2.2) * C.q), al = .55 * (1 - a / 4.5) * Math.min(1, a * 4);
      for (let m = 0; m < n; m++) { const th = m / n * TAU + k, rr = R * (.94 + .12 * hsh(m, this.seed + k)); dot(P[0] + Math.cos(th) * rr, .3, P[2] + Math.sin(th) * rr, 1, WH[0], WH[1], WH[2], al); }
    }
    // foam where it broke the surface
    if (age > .2) {
      const w = 1 - age / this.dur, R = 3 + 5 * s * sat(age / 3), n = Math.round(Math.min(160, 12 + R * R * pxm * .6) * C.q);
      for (let m = 0; m < n; m++) { const th = hsh(m, this.seed + 7) * TAU, rr = R * Math.sqrt(hsh(m, this.seed + 8)); dot(P[0] + Math.cos(th) * rr + C.wind[0] * age * .2, .25, P[2] + Math.sin(th) * rr + C.wind[2] * age * .2, 1, WH[0], WH[1], WH[2], .45 * w * (.4 + .6 * hsh(m, 3))); }
    }
    drawPuffs(C, this.TC, this.nT, P[0], 0, P[2], age, 1, { rise: .8, lime: .5, gy: 0, cap: 30, cool: STEAM });
    drawPuffs(C, this.TI, this.nI, P[0], 0, P[2], age, .85, { rise: .45, lime: .5, gy: 0, cap: 44, cool: STEAM });
  }
}

/* ---------------- a torpedo into the water ---------------- */
/* o: { t0, mode 'ship' | 'air' | 'sub', pos (the tube's mouth on deck / the release point / the bow tube under the
   sea), out (ship: unit horizontal vector the tube points, outboard), vel (ship: its velocity, the round carries it),
   hdg (air: the aircraft's heading), depth (sub, m), len (m, the round: 2.72 Mk 54, 5.8 Mk 48, 7.2 533 mm), fall
   (air: m/s it comes down under the chute), seed } */
const BODY = [218, 220, 212];
export class TorpLaunch {
  constructor(o) {
    const r = rng(o.seed || 4747), P = o.pos;
    this.t0 = o.t0; this.mode = o.mode || 'ship'; this.p = P.slice(); this.seed = o.seed || 4747; this.len = o.len || 2.72;
    this.tL = 0; this.sp = null; this.dur = 12; this.Bf = new Float64Array(6);
    if (this.mode === 'ship') {
      // a puff of air out of the tube; the round arcs out clear of the hull and drops in
      const out = o.out || [1, 0, 0], sv = o.vel || [0, 0, 0], v = [out[0] * 11 + sv[0], 2.5, out[2] * 11 + sv[2]];
      this.v = v; this.tL = (v[1] + Math.sqrt(v[1] * v[1] + 2 * G * Math.max(.5, P[1]))) / G;
      const lp = [P[0] + v[0] * this.tL, 0, P[2] + v[2] * this.tL];
      this.sp = new Splash({ t0: 0, pos: lp, size: 4.5, seed: this.seed + 1, ring: .12 });
      const nA = 70, TA = table(nA);
      for (let i = 0; i < nA; i++) { const sp = 3 + 10 * r(), j = (i * 5) & GM; setP(TA, i, .12 * r(), 0, 0, 0, out[0] * sp + GT[j] * 2, GT[(j + 1) & GM] * 1.5 + .5, out[2] * sp + GT[(j + 2) & GM] * 2, 2.2 + r(), 2 + 2.5 * r(), .18, .45 + .2 * r(), 0, .4 + .5 * r()); }
      this.TA = TA; this.nA = nA;
      this.dur = this.tL + this.sp.dur;
    } else if (this.mode === 'air') {
      // falling under its drogue chute, nose down; into the sea under the helicopter
      this.fall = o.fall || 18; this.tL = Math.max(.2, P[1] / this.fall); this.hdg = o.hdg || 0;
      this.sp = new Splash({ t0: 0, pos: [P[0], 0, P[2]], size: 5.5, seed: this.seed + 1, ring: .12 });
      this.dur = this.tL + this.sp.dur;
    } else {
      // a boat's bow tube: only a boat running shallow shows it, a faint boil over the tube
      this.depth = o.depth || 30; this.tB = .8 + this.depth / 25; this.kB = Math.exp(-this.depth / 22); this.dur = this.tB + 7;
    }
  }
  /* the round: a closed shell of dots along unit axis (ax, ay, az), centred at (x, y, z) */
  body(C, x, y, z, ax, ay, az, al) {
    const V = C.V, pxm = V.pxm(x, y, z); if (pxm <= 0) return;
    const L = this.len, R = L > 4 ? .267 : .162;
    if (L * pxm < 3) { C.dot(x, y, z, 1, BODY[0], BODY[1], BODY[2], al); return; }
    const nl = Math.min(28, Math.round(L * pxm / 1.6)), nr = R * pxm > 1.5 ? Math.min(10, Math.round(TAU * R * pxm / 1.8)) : 1;
    const B = perp(ax, ay, az, this.Bf);
    for (let i = 0; i <= nl; i++) {
      const s = -L / 2 + L * i / nl, taper = s > L * .38 ? Math.sqrt(Math.max(0, 1 - (s - L * .38) / (L * .12))) : 1;
      for (let j = 0; j < nr; j++) {
        const th = (j + (i & 1) * .5) / nr * TAU, c = nr > 1 ? Math.cos(th) * R * taper : 0, d = nr > 1 ? Math.sin(th) * R * taper : 0;
        C.dot(x + ax * s + B[0] * c + B[3] * d, y + ay * s + B[1] * c + B[4] * d, z + az * s + B[2] * c + B[5] * d, 1, BODY[0], BODY[1], BODY[2], al);
      }
    }
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const P = this.p, V = C.V, dot = C.dot;
    if (!V.vis(P[0], P[1] * .5, P[2], P[1] + 60)) return;
    if (this.mode === 'ship') {
      drawPuffs(C, this.TA, this.nA, P[0], P[1], P[2], age, .8, { rise: .3, cool: GREY, cap: 16 });
      if (age < this.tL) {
        const v = this.v, t = age, x = P[0] + v[0] * t, y = P[1] + v[1] * t - G2 * t * t, z = P[2] + v[2] * t, vy = v[1] - G * t, l = Math.hypot(v[0], vy, v[2]);
        this.body(C, x, y, z, v[0] / l, vy / l, v[2] / l, .8);
      } else this.sp.draw(C, age - this.tL);
    } else if (this.mode === 'air') {
      if (age < this.tL) {
        // nose down, swinging a little under the chute
        const y = P[1] - this.fall * age, sw = .12 * Math.sin(C.tr * 2.1 + this.seed), pt = -1.05 + sw, h = this.hdg;
        const ax = Math.sin(h) * Math.cos(pt), ay = Math.sin(pt), az = Math.cos(h) * Math.cos(pt);
        this.body(C, P[0], y, P[2], ax, ay, az, .85);
        // the chute: a small canopy on its risers above the tail, breathing
        const tx = P[0] - ax * this.len / 2, ty = y - ay * this.len / 2, tz = P[2] - az * this.len / 2, cy = ty + 3.2, pxm = V.pxm(tx, cy, tz);
        if (pxm > .6) {
          const n = Math.min(60, Math.round(12 + pxm * 6)), Rc = .75 * (1 + .06 * Math.sin(C.tr * 9 + this.seed));
          for (let m = 0; m < n; m++) {
            const th = m / n * TAU * 3, u = (m % 3) / 3, rr = Rc * (1 - u * u * .8);
            dot(tx + Math.cos(th) * rr, cy + u * .45, tz + Math.sin(th) * rr, 1, WH[0], WH[1], WH[2], .75);
          }
          if (pxm > 3) for (let k = 0; k < 4; k++) for (let m = 1; m < 6; m++) { const th = k / 4 * TAU, f = m / 6; dot(tx + Math.cos(th) * Rc * f, ty + (cy - ty) * f, tz + Math.sin(th) * Rc * f, 1, WH[0], WH[1], WH[2], .4); }
        } else dot(tx, cy, tz, 1, WH[0], WH[1], WH[2], .6);
      } else {
        this.sp.draw(C, age - this.tL);
        // the chute on the water, sinking
        const a = age - this.tL;
        if (a < 5) { const pxm = V.pxm(P[0], 0, P[2]); if (pxm > .8) for (let m = 0; m < 24; m++) { const th = m / 24 * TAU; dot(P[0] + 2 + Math.cos(th) * .8, .22, P[2] + Math.sin(th) * .8, 1, WH[0], WH[1], WH[2], .6 * (1 - a / 5)); } }
      }
    } else {
      const a = age - this.tB; if (a < 0 || a > 7 || this.kB < .05) return;
      const pxm = V.pxm(P[0], 0, P[2]); if (pxm <= 0) return;
      const n = Math.round(Math.min(120, 14 + pxm * 20) * C.q * this.kB), R = 1.5 + 4.5 * sat(a / 2.5), fr = Math.floor(C.tr * 8);
      for (let m = 0; m < n; m++) {
        const th = hsh(m, this.seed) * TAU, rr = R * Math.sqrt(hsh(m, this.seed + 1)), f = hsh(m, fr);
        dot(P[0] + Math.cos(th) * rr, .25, P[2] + Math.sin(th) * rr, 1, WH[0], WH[1], WH[2], .55 * this.kB * (1 - a / 7) * (.35 + .65 * f));
      }
    }
  }
}
