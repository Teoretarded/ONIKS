/* Air bursts: an intercept, a self-destruct, a kill in the air (pe_aegis_fx mkBurst / drawBurst / drawSplashes).
   The first instant a white core; the fireball a cluster of lobes cooling from the outside in, white-hot to lime
   to smoke; sparks as short white streaks; fragments carrying part of the momentum under drag and gravity, the
   brands trailing dots, each knowing when it reaches the sea, where it throws a small column and a ring; the
   smoke ball it leaves grows, drifts and thins. Also the booster casing that tumbles off after burnout. */
import { WH, LIME, HOT, GREY, SMOKE, TAU, G2, GT, GM, BALL, NB, sat, ss, clamp, hsh, rng, dragH, landTime, ballistic, dotHalo, streak } from './core.js';

/* the fireball: a cluster of lobes (not a ball), dots filling each toward its skin */
export const SHELL = (() => {
  const r = rng(4401), n = 1800, NL = 7, a = new Float32Array(n * 5), LB = [];
  for (let l = 0; l < NL; l++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = l ? .38 + .32 * r() : 0; LB.push([s * Math.cos(th) * d, u * d * .75, s * Math.sin(th) * d, l ? .42 + .3 * r() : .72]); }
  for (let i = 0; i < n; i++) {
    const L = LB[i % NL], u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = Math.pow(r(), .4);
    a[i * 5] = L[0] + s * Math.cos(th) * rr * L[3]; a[i * 5 + 1] = L[1] + u * rr * L[3]; a[i * 5 + 2] = L[2] + s * Math.sin(th) * rr * L[3];
    a[i * 5 + 3] = Math.min(1, rr * (i % NL ? .8 : 1) + .25 * Math.hypot(L[0], L[1], L[2])); a[i * 5 + 4] = r();
  }
  return { n, a };
})();
/* the smoke ball a burst leaves */
export const NQ = 260, SMK = new Float32Array(NQ * 5);
{ const r = rng(5517); for (let i = 0; i < NQ; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u), qq = Math.cbrt(r()); SMK[i * 5] = Math.cos(a) * h * qq; SMK[i * 5 + 1] = u * qq * .7; SMK[i * 5 + 2] = Math.sin(a) * h * qq; SMK[i * 5 + 3] = .55 + .45 * r(); SMK[i * 5 + 4] = .45 + .55 * r(); } }

/* fireball dot colour from its heat: white-hot, lime, smoke (the brief's cooling ramp) */
export function heatCol(heat, out) {
  if (heat > .5) { const u = (heat - .5) / .5; out[0] = 238 + 17 * u; out[1] = 250 + 5 * u; out[2] = 196 + 50 * u * u; out[3] = .75 + .6 * u; }
  else if (heat > .16) { const u = (heat - .16) / .34; out[0] = GREY[0] + (LIME[0] + 30 - GREY[0]) * u; out[1] = GREY[1] + (LIME[1] + 8 - GREY[1]) * u; out[2] = GREY[2] + (LIME[2] + 90 - GREY[2]) * u; out[3] = .34 + .5 * u; }
  else { out[0] = GREY[0]; out[1] = GREY[1]; out[2] = GREY[2]; out[3] = .34; }
  return out;
}

/* o: { t0, pos, mom [vx vy vz] (m/s the debris carries), sc (size, 1 = a missile kill), seed, gy (sea / ground
   height under it), kind 'kill' | 'destruct' | 'gun' | 'air', nF, ns, heavy, big, smoke (m), life (s) } */
export class Burst {
  constructor(o) {
    const r = rng(o.seed || 900), sc = o.sc || 1, p = o.pos, mom = o.mom || [0, 0, 0];
    this.t0 = o.t0; this.p = p.slice(); this.mom = mom.slice(); this.sc = sc; this.kind = o.kind || 'kill';
    this.big = !!o.big; this.seed = o.seed || 900; this.fire = o.fire || 1.4 * sc; this.smoke = o.smoke || 50 * sc; this.dur = o.life || 10;
    this.gy = o.gy || 0;
    const n = o.nF || Math.round(200 * sc), F = new Float32Array(n * 6), AW = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), fr = .08 + .55 * r(), sp = (30 + 330 * Math.pow(r(), 1.4)) * Math.sqrt(sc);
      const heavy = o.heavy && i % 7 === 0;
      const vx = mom[0] * fr + c * Math.cos(th) * sp, vy = mom[1] * fr + u * sp * .75 + 16 * sc, vz = mom[2] * fr + c * Math.sin(th) * sp;
      const kd = heavy ? .45 + .35 * r() : 1.2 + 2.6 * r();
      F[i * 6] = vx; F[i * 6 + 1] = vy; F[i * 6 + 2] = vz; F[i * 6 + 3] = kd; F[i * 6 + 4] = r(); F[i * 6 + 5] = i % 6 === 0 ? 1 : 0;
      AW[i] = landTime(p[1], vy, kd, this.gy, 30);
    }
    this.F = F; this.AW = AW; this.n = n;
    const ns = o.ns || Math.round(80 * sc), SP = new Float32Array(ns * 5);
    for (let i = 0; i < ns; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), sp = (160 + 320 * r()) * Math.sqrt(sc);
      SP[i * 5] = c * Math.cos(th) * sp + mom[0] * .3; SP[i * 5 + 1] = u * sp * .8 + 25 * sc + mom[1] * .3; SP[i * 5 + 2] = c * Math.sin(th) * sp + mom[2] * .3;
      SP[i * 5 + 3] = 1.6 + 1.8 * r(); SP[i * 5 + 4] = .4 + .7 * r();
    }
    this.SP = SP; this.ns = ns;
    const a = this.seed * .37, b = this.seed * .11, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    this.M = [ca, sa * sb, sa * cb, 0, cb, -sb, -sa, ca * sb, ca * cb];      // R.y(a) R.x(b)
    this.C3 = [0, 0, 0]; this.HC = [0, 0, 0, 0];
    this.wet = this.gy <= .05;
    // the burst lies low over the sea: the water heaves up under it
    this.heave = p[1] - this.gy < 40 * sc;
  }
  /* the fireball's centre runs on with the momentum a little, then drifts with the wind and rises */
  centre(C, a) {
    const B = this.mom, m = Math.hypot(B[0], B[1], B[2]) || 1, d = m / 3.4 * (1 - Math.exp(-3.4 * a)) * (this.big ? .12 : .05), o = this.C3;
    o[0] = this.p[0] + B[0] / m * d + C.wind[0] * a; o[1] = Math.max(this.p[1] * .6 + this.gy * .4, this.p[1] + B[1] / m * d) + 1.4 * a; o[2] = this.p[2] + B[2] / m * d + C.wind[2] * a;
    return o;
  }
  draw(C, a) {
    if (a < 0 || a > this.dur) return;
    const V = C.V, dot = C.dot, p = this.p, sc = this.sc, q = C.q;
    // everything in a sphere of the debris' reach
    if (!V.vis(p[0], p[1], p[2], 400 * Math.sqrt(sc) + 60)) return;
    const c = this.centre(C, a), cx = c[0], cy = c[1], cz = c[2], M = this.M;
    const zc0 = V.depth(p[0], p[1], p[2]);
    // the first instant: a white core; a flash of light over everything near
    if (a < .22 && zc0 > V.near) {
      const w = 1 - a / .22;
      dot(p[0], p[1], p[2], this.big ? 7 : 5, 255, 255, 250, w);
      C.halo(p[0], p[1], p[2], Math.min(this.big ? 190 : 120, 8 + 26000 * this.fire / zc0) * (.6 + .4 * w), 250, 255, 226, .9 * w);
      dotHalo(C, p[0], p[1], p[2], Math.min(this.big ? 420 : 260, 20 + 60000 * this.fire / zc0), 700, LIME[0], LIME[1], LIME[2], .3 * w * w);
      if (this.kind !== 'destruct') streak(C, p[0], p[1], p[2], Math.min(900, Math.max(260, 1.1e6 * this.fire / zc0)), 250, 255, 220, w * w);
    }
    if (a < 1.2) C.light(p[0], p[1], p[2], 245, 255, 215, (this.kind === 'destruct' ? .4 : .8) * Math.exp(-a * 5) * Math.sqrt(sc), 260 * Math.sqrt(sc));
    if (a < .1 && zc0 > V.near) C.lift(.06 * (1 - a / .1) * Math.min(1, 1500 * sc / zc0), 240, 255, 220);
    // the fireball: white-hot lobes cooling from the outside in, then a thinning grey puff
    const Rb = this.fire * (13 * (1 - Math.exp(-a * 7)) + 3.6 * a), fade = 1 - ss(this.dur * .35, this.dur * .6, a), SA = SHELL.a, thin = .45 * ss(1, 3, a);
    const zc = V.depth(cx, cy, cz);
    if (fade > 0 && zc > V.near) {
      // as many dots as its size on screen needs (the template repeats with a small jitter past its 1 800 points)
      const pxm = V.fl / zc, rp = Rb * pxm, HC = this.HC, NS = SHELL.n;
      const nF = Math.round(Math.min(9000, 30 + rp * rp * .5) * q), boost = nF < NS ? Math.min(1.8, Math.sqrt(NS / Math.max(1, nF))) : 1;
      const big = zc < 80 ? 3 : 2, jit = .045;
      if (rp > 1.2) for (let k = 0; k < nF; k++) {
        const i = nF < NS ? Math.floor(k * NS / nF) : k % NS, o = i * 5, rr = SA[o + 3], rn = SA[o + 4];
        if (rn < thin) continue;
        let ux = SA[o], uy = SA[o + 1], uz = SA[o + 2];
        if (k >= NS) { const j = (k * 3 + this.seed) & GM; ux += GT[j] * jit; uy += GT[(j + 1) & GM] * jit; uz += GT[(j + 2) & GM] * jit; }
        const y = cy + (M[3] * ux + M[4] * uy + M[5] * uz) * Rb; if (y < this.gy + .3) continue;
        const heat = Math.exp(-a * (.8 + 1.5 * rr) * (.65 + .7 * ((rn * 7.31) % 1)));
        heatCol(heat, HC);
        const b = fade * HC[3] * (.35 + 1.1 * rn * rn) * boost;
        dot(cx + (M[0] * ux + M[1] * uy + M[2] * uz) * Rb, y, cz + (M[6] * ux + M[7] * uy + M[8] * uz) * Rb,
          zc < 1600 && (heat > .45 || rn > .7) ? big : 1, HC[0], HC[1], HC[2], b > 1 ? 1 : b);
      } else if (fade > .3) dot(cx, cy, cz, 2, 250, 255, 226, fade * Math.exp(-a * 1.5));
    }
    // the smoke ball it leaves: grows, drifts, thins
    if (a > .4) {
      const g = this.smoke * (.3 + .7 * (1 - Math.exp(-a * .9))) + 1.5 * a, f = .5 * sat((a - .4) / 1.2) * (1 - ss(this.dur * .45, this.dur, a));
      if (f > .01 && zc > V.near) {
        const pxm = V.fl / zc, rp = g * pxm, n = Math.round(Math.min(7000, 12 + rp * rp * .09) * q), boost = Math.min(2, Math.sqrt(160 / Math.max(20, n)) + .4);
        for (let k = 0; k < n; k++) {
          const i = (k * 5 + this.seed) & (NB - 1), o = i * 4, s = .55 + .45 * ((k * .618034) % 1);
          const y = cy + BALL[o + 1] * g * s * .7; if (y < this.gy + .5) continue;
          dot(cx + BALL[o] * g * s, y, cz + BALL[o + 2] * g * s, rp > 60 ? 2 : 1, GREY[0], GREY[1], GREY[2], Math.min(1, f * (.45 + .55 * hsh(k, this.seed)) * boost * (1 - .4 * BALL[o + 3])));
        }
      }
    }
    // sparks: white streaks going lime as they slow
    if (a < 1.2) {
      const pxm = zc0 > V.near ? V.fl / zc0 : 0, tails = pxm > .05 ? 5 : 2, ns = Math.max(4, Math.round(this.ns * q));
      for (let i = 0; i < ns; i++) {
        const o = i * 5, life = this.SP[o + 4]; if (a > life) continue;
        const kd = this.SP[o + 3], vx = this.SP[o], vy = this.SP[o + 1], vz = this.SP[o + 2], w = 1 - a / life;
        for (let m = 0; m < tails; m++) {
          const t2 = Math.max(0, a - m * .014), h = dragH(kd, t2), y = p[1] + vy * h - G2 * t2 * t2; if (y < this.gy) break;
          const hw = Math.min(1, 1.3 * w) * (1 - m * .17);
          dot(p[0] + vx * h, y, p[2] + vz * h, zc0 < 1500 && m < 2 ? 2 : 1, 238 + 17 * w, 255, 170 + 70 * w * w, hw);
        }
      }
    }
    // fragments in the air: bright specks, the brands trailing dots; then where they meet the sea
    const F = this.F, AW = this.AW, nF = Math.max(8, Math.round(this.n * q)), pxm0 = zc0 > V.near ? V.fl / zc0 : 0, far = pxm0 < .3;
    for (let i = 0; i < nF; i++) {
      const aw = AW[i], o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], rn = F[o + 4], brand = F[o + 5];
      if (a < aw) {
        const h = dragH(kd, a);
        if (brand) for (let m = 1; m < (far ? 3 : 10); m++) {
          const t2 = a - m * .035; if (t2 < 0) break;
          const h2 = dragH(kd, t2), u = m / 10;
          dot(p[0] + vx * h2, p[1] + vy * h2 - G2 * t2 * t2 + m * .12, p[2] + vz * h2, 1, 255 - 30 * u, 250, 190 + 40 * u, .8 * (1 - u) * (1 - .5 * a / aw));
        }
        const hot = Math.exp(-a * 1.3), b = (brand ? 1 : .55 + .4 * rn) * (.55 + .45 * hot);
        dot(p[0] + vx * h, p[1] + vy * h - G2 * a * a, p[2] + vz * h, zc0 < 1000 && (brand || rn > .6) ? 2 : 1, 255, brand ? 250 : 236 + 19 * hot, brand ? 200 : 226 + 29 * hot, b > 1 ? 1 : b);
      } else if (this.wet && a - aw < 1.5) {
        // the splash of one fragment: a short white column and a ring
        const w = a - aw, h = dragH(kd, aw), x = p[0] + vx * h, z = p[2] + vz * h, al = .85 * (1 - w / 1.5), heavy = kd < .9 ? 2.2 : 1, hs = this.big ? 1.6 : 1;
        for (let m = far ? 2 : 0; m < (far ? 3 : 5); m++) {
          const vs = (3 + m * 2.4 + rn * 3) * hs * heavy, yy = vs * w - G2 * w * w; if (yy < 0) continue;
          dot(x + (m - 2) * .35 * (1 + w) * heavy, this.gy + yy, z + GT[(i * 5 + m) & GM] * .5, zc0 < 900 ? 2 : 1, WH[0], WH[1], WH[2], al);
        }
        if (!far && w < .7) for (let m = 0; m < 8; m++) { const th = m / 8 * TAU + rn * 3, rr = (1 + 7 * w) * heavy; dot(x + Math.cos(th) * rr, this.gy + .2, z + Math.sin(th) * rr, 1, WH[0], WH[1], WH[2], al * .6); }
      }
    }
    // the sea heaves up under a low burst: a spray dome that rises and falls back
    if (this.heave && this.wet && a < 3) {
      const R0 = (this.big ? 26 : 34) * sc, al = .75 * (1 - a / 3), n = Math.round((far ? 70 : 160) * q);
      for (let i = 0; i < n; i++) {
        const th = hsh(i, this.seed) * TAU, rr = R0 * Math.sqrt(hsh(i, this.seed + 1)) * (.4 + .6 * sat(a * 2)), vs = (8 + 22 * hsh(i, this.seed + 2)) * (this.big ? 1.2 : 1.5);
        const yy = vs * a - G2 * a * a; if (yy < 0) continue;
        dot(p[0] + Math.cos(th) * rr, this.gy + yy, p[2] + Math.sin(th) * rr, zc0 < 900 ? 2 : 1, WH[0], WH[1], WH[2], al * (.5 + .5 * hsh(i, this.seed + 3)));
      }
    }
  }
}

/* ---------------- a booster casing tumbling off after burnout ---------------- */
/* local points of a closed cylinder along +Z (radius, length), with its nozzle ring */
const CASE = {};
function casePts(kind) {
  if (CASE[kind]) return CASE[kind];
  const d = kind === 'oniks' ? [.36, 2.6, .25] : kind === 'mk72' ? [.27, 1.7, .2] : kind === 'tlam' ? [.26, 1.2, .18] : kind === 'kh35' ? [.2, .58, .15] : kind === 'kalibr' ? [.267, 1.66, .19] : [.19, 1.4, .12];
  const [R, L, rn] = d, P = [], nr = 14, nl = Math.max(4, Math.round(L / .22));
  for (let i = 0; i <= nl; i++) for (let j = 0; j < nr; j++) { const th = (j + (i & 1) * .5) / nr * TAU; P.push(Math.cos(th) * R, Math.sin(th) * R, -L / 2 + L * i / nl); }
  for (let j = 0; j < 10; j++) { const th = j / 10 * TAU; P.push(Math.cos(th) * rn, Math.sin(th) * rn, -L / 2 - .15); P.push(Math.cos(th) * R * .5, Math.sin(th) * R * .5, L / 2); }
  return (CASE[kind] = { P: new Float32Array(P), L, R });
}
const SEP_BACK = { oniks: 4.9, mk72: 3.2, tlam: 3.2, small: 3.2, kh35: 1.91, kalibr: 3.28 };
/* o: { t0, pos, vel, axis (unit, the round's), kind ('oniks' | 'mk72' | 'tlam' | 'kh35' | 'kalibr' | 'small'), ground, seed } */
export class BoosterSep {
  constructor(o) {
    const r = rng(o.seed || 31), a = o.axis, v = o.vel;
    this.t0 = o.t0; this.kind = o.kind || 'mk72'; this.shape = casePts(this.kind); this.seed = o.seed || 31;
    this.p = o.pos.slice(); this.a = a.slice();
    // the casing's centre behind the round's (models: oniks, mk72 / sm6, kh35 -1.91, kalibr -3.28)
    const back = SEP_BACK[this.kind] || 3.2, p0 = [o.pos[0] - a[0] * back, o.pos[1] - a[1] * back, o.pos[2] - a[2] * back];
    this.p0 = p0;
    const kick = [(r() - .5) * 8, (r() - .5) * 8, (r() - .5) * 8];
    this.fly = ballistic(p0, [v[0] - a[0] * 40 + kick[0], v[1] - a[1] * 40 + kick[1], v[2] - a[2] * 40 + kick[2]], 7e-4, o.ground, 70, 1 / 30);
    this.spin = 5 + r() * 4; this.dur = Math.min(70, this.fly.landed + (this.fly.wet ? 10 : 25));
    // the frame of the casing at separation: its axis along the round's
    const up = Math.abs(a[1]) < .95 ? [0, 1, 0] : [1, 0, 0];
    let x = [up[1] * a[2] - up[2] * a[1], up[2] * a[0] - up[0] * a[2], up[0] * a[1] - up[1] * a[0]]; const l = Math.hypot(x[0], x[1], x[2]); x = [x[0] / l, x[1] / l, x[2] / l];
    const y = [a[1] * x[2] - a[2] * x[1], a[2] * x[0] - a[0] * x[2], a[0] * x[1] - a[1] * x[0]];
    this.X = x; this.Y = y; this.Q = [0, 0, 0];
    this.splash = null;   // set by the system (a Splash at the landing point) if it lands in the sea
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, F = this.fly;
    // the separation: a pop of light and a puff of the last gas
    if (age < .5) {
      const p = this.p0, w = 1 - age / .5;
      dot(p[0], p[1], p[2], 3, 255, 255, 240, w);
      C.halo(p[0], p[1], p[2], -4, 245, 255, 215, .5 * w * w);
      const n = Math.round(30 * C.q);
      for (let m = 0; m < n; m++) { const j = (m * 7 + this.seed) & GM, rr = .5 + 5 * age; dot(p[0] + GT[j] * rr - this.a[0] * age * 20, p[1] + GT[(j + 1) & GM] * rr - this.a[1] * age * 20, p[2] + GT[(j + 2) & GM] * rr - this.a[2] * age * 20, 1, 226, 238, 205, .5 * w); }
    }
    if (F.wet && age > F.landed + .1) return;
    const p = F.at(age, this.Q), pxm = V.pxm(p[0], p[1], p[2]);
    if (pxm <= 0 || !V.vis(p[0], p[1], p[2], 3)) return;
    const fade = F.wet ? 1 : 1 - ss(this.dur - 6, this.dur, age);
    if (pxm * this.shape.L < 2.5) { dot(p[0], p[1], p[2], 1, WH[0], WH[1], WH[2], .8 * fade); return; }
    // tumbling end over end about the casing's X axis
    const sp = Math.min(age, F.landed) * this.spin, ca = Math.cos(sp), sa = Math.sin(sp), a = this.a, X = this.X, Y = this.Y;
    const Yx = Y[0] * ca + a[0] * sa, Yy = Y[1] * ca + a[1] * sa, Yz = Y[2] * ca + a[2] * sa;
    const Ax = a[0] * ca - Y[0] * sa, Ay = a[1] * ca - Y[1] * sa, Az = a[2] * ca - Y[2] * sa;
    // the real model when the renderer has it (the engine's HD oniksBooster / mk72), else a cylinder of dots
    const key = this.kind === 'oniks' ? 'oniksBooster' : this.kind === 'mk72' ? 'mk72' : null;
    if (key && C.model && C.model(key, p, [X[0], Yx, Ax, X[1], Yy, Ay, X[2], Yz, Az], fade)) return;
    const S = this.shape, L = S.L, R = S.R, hot = Math.exp(-age * 1.5);
    const nl = Math.max(3, Math.min(80, Math.round(L * pxm / 1.6))), nr = Math.max(6, Math.min(90, Math.round(TAU * R * pxm / 1.6)));
    const e = V.eye, sz = pxm > 60 ? 2 : 1;
    for (let i = 0; i <= nl; i++) {
      const lz = -L / 2 + L * i / nl, h = lz < -L * .35 ? hot : 0;
      for (let j = 0; j < nr; j++) {
        const th = (j + (i & 1) * .5) / nr * TAU, cx = Math.cos(th), cy = Math.sin(th);
        const nx = X[0] * cx + Yx * cy, ny = X[1] * cx + Yy * cy, nz = X[2] * cx + Yz * cy;
        const wx = p[0] + nx * R + Ax * lz, wy = p[1] + ny * R + Ay * lz, wz = p[2] + nz * R + Az * lz;
        // lit from the moon, the far side dropped
        const fac = -((wx - e[0]) * nx + (wy - e[1]) * ny + (wz - e[2]) * nz);
        if (fac < 0) continue;
        const lit = .3 + .6 * Math.max(0, nx * -.5 + ny * .62 + nz * -.6);
        dot(wx, wy, wz, sz, 238 + 17 * h, 238 + 17 * h, 228 - 30 * h, Math.min(1, (lit + .5 * h) * fade));
      }
    }
  }
}
