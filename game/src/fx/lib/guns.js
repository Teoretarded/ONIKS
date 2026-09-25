/* Guns: tracer streams (Phalanx 4 500 rpm, the Pantsir's 30 mm twins) and their muzzles (pe_aegis_fx drawTracers,
   drawMuzzle). Every round of a burst has its firing time, muzzle, direction and water-entry age from its index;
   the stream is drawn analytically at any age.
   The sim resolves a burst at once (the round is stopped the tick the gun fires), so the stream is drawn already
   established: the first rounds left the muzzle one time of flight before the event and arrive as the round
   bursts; the gun keeps firing half the burst after it, those rounds fly on through the smoke into the sea. */
import { WH, LIME, GREY, TAU, G2, GT, GM, sat, ss, hsh, noise, perp } from './core.js';

const GUN = {
  ciws: { rate: 75, v0: 1100, kd: .3, disp: .0022, burn: 3, rounds: 1, mz: 1.2 },          // Mk 15 Phalanx, 20 mm
  gun30: { rate: 40, v0: 960, kd: .35, disp: .003, burn: 3.2, rounds: 2, mz: 1.5, sep: 1.1 }, // 2A38M, two guns
};
/* time of flight to range r under linear drag kd from v0 */
function tofOf(g, r) { const x = g.kd * r / g.v0; return x < .97 ? -Math.log(1 - x) / g.kd : 12; }

/* o: { t0, mz (muzzle), to (target point at fire time), weapon 'ciws' | 'gun30', dur (s), hit, seed, gy (sea level
   under the stream, 0) } */
export class TracerStream {
  constructor(o) {
    const g = GUN[o.weapon] || GUN.ciws;
    this.g = g; this.t0 = o.t0; this.mz = o.mz.slice(); this.seed = o.seed || 41; this.hit = !!o.hit; this.gy = o.gy || 0;
    const to = o.to, dx = to[0] - o.mz[0], dy = to[1] - o.mz[1], dz = to[2] - o.mz[2], R = Math.hypot(dx, dy, dz);
    this.R = R; this.tof = tofOf(g, R);
    // aim above for the drop over the time of flight
    const ay = dy + G2 * this.tof * this.tof, l = Math.hypot(dx, ay, dz) || 1;
    this.D = [dx / l, ay / l, dz / l];
    this.B = perp(this.D[0], this.D[1], this.D[2], new Float64Array(6));
    this.side = [this.B[0], this.B[1], this.B[2]];
    this.dur = o.dur || 1;
    this.a0 = -this.tof;                          // first round, relative to the event
    this.a1 = Math.max(.25, this.dur * .5);       // last round
    this.n = Math.max(1, Math.floor((this.a1 - this.a0) * g.rate)) * g.rounds;
    this.life = this.a1 + g.burn + 1.5;
    this.TL = g.v0 / g.kd;
    // per round, filled on first use: the stream's wander (two noise lookups, the same every frame) and whether the
    // round is over for good (ended on the target, or its splash has faded): the loop skips those at once
    this.W = null; this.over = null;
  }
  get durAll() { return this.life; }
  /* the gun is firing now (for the muzzle and the mount's light) */
  firing(age) { return age >= 0 && age <= this.a1; }
  draw(C, age) {
    if (age > this.life || C.n >= C.cap) return;
    const g = this.g, V = C.V, dot = C.dot, M = this.mz, D = this.D, B = this.B, TL = this.TL;
    const mid = [M[0] + D[0] * this.R * .5, M[1] + D[1] * this.R * .5, M[2] + D[2] * this.R * .5];
    if (!V.vis(mid[0], mid[1], mid[2], this.R * .7 + 60)) return;
    const q = C.q, rounds = g.rounds;
    if (!this.W) { this.W = new Float64Array(this.n * 2).fill(NaN); this.over = new Uint8Array(this.n); this.lastAge = age; }
    if (age < this.lastAge) this.over.fill(0);          // time went back (a scrub): every round may show again
    this.lastAge = age;
    const W = this.W, over = this.over;
    for (let i = 0; i < this.n; i++) {
      if (over[i]) continue;
      if (C.n >= C.cap) return;             // the frame's dot budget is spent (dot and glow draw nothing more)
      const gun = i % rounds, j = Math.floor(i / rounds), tk = this.a0 + j / g.rate + gun * .004, a = age - tk;
      if (a < 0) break;
      if (q < 1 && hsh(i, 3) > q + .1) continue;
      // the stream walks onto the round from short, then wanders a little round it
      if (W[i * 2] !== W[i * 2]) { W[i * 2] = .0011 * noise(tk * 1.7, 3.3, this.seed); W[i * 2 + 1] = .0011 * noise(tk * 1.9, 8.1, this.seed); }
      const walk = .004 * Math.exp(-(tk - this.a0) / .4), wx = W[i * 2], wy = W[i * 2 + 1];
      const ex = GT[(i * 2 + this.seed) & GM] * g.disp + wx, ey = GT[(i * 2 + 1 + this.seed) & GM] * g.disp + wy - walk;
      const dx = D[0] + B[0] * ex + B[3] * ey, dy = D[1] + B[1] * ex + B[4] * ey, dz = D[2] + B[2] * ex + B[5] * ey;
      const off = rounds > 1 ? (gun ? 1 : -1) * g.sep : 0;
      const mx = M[0] + this.side[0] * off, my = M[1] + this.side[1] * off, mz = M[2] + this.side[2] * off;
      // about half the rounds that reach the round end there (they read as strikes); the rest fly on
      const endHit = this.hit && tk + this.tof <= .05 && hsh(i, 9) < .5 ? this.tof : 99;
      if (endHit < 50 && a >= endHit) { over[i] = 1; continue; }     // it ended on the round: nothing more of it
      const ex2 = Math.exp(-g.kd * a), h = TL * (1 - ex2), v = g.v0 * ex2;
      const y = my + dy * h - G2 * a * a;
      if (a < endHit && y > this.gy) {
        const al = (.8 + .2 * hsh(i, 5)) * (1 - ss(endHit - .05, endHit, a)) * (1 - ss(g.burn - .8, g.burn, a));
        if (al < .01) continue;
        const x = mx + dx * h, z = mz + dz * h, zc = V.depth(x, y, z); if (zc < V.near) continue;
        const hot = a < .06 ? 1 - a / .06 : 0, vx = dx * v, vy = dy * v - 9.81 * a, vz = dz * v;
        dot(x, y, z, zc < 1500 ? 2 : 1, 236 + 19 * hot, 255, 190 + 60 * hot, al);
        if (zc < 1200) C.glow(x, y, z, 4, LIME[0], LIME[1], LIME[2], .07 * al);
        // the streak: about a frame of flight behind the head, lime
        // a streak about a frame and a half of flight long, its dots a pixel or two apart on screen
        const nt = Math.max(2, Math.min(48, Math.round(v * .0228 * V.fl / zc / 1.6)));
        for (let m = 1; m <= nt; m++) { const d = .0228 * m / nt; dot(x - vx * d, y - vy * d, z - vz * d, zc < 1500 ? 2 : 1, LIME[0], LIME[1], LIME[2], al * (1 - .85 * m / (nt + 1))); }
      } else if (y <= this.gy && endHit > 50) {
        // into the sea: a little white splash
        const aw = this.landAge(i, a, dy, my), w = a - aw; if (w > .9) over[i] = 1; if (w < 0 || w > .9) continue;
        const hw = TL * (1 - Math.exp(-g.kd * aw)), x = mx + dx * hw, z = mz + dz * hw, al = .7 * (1 - w / .9), rn = hsh(i, 5);
        for (let m = 0; m < 3; m++) { const vs = 2.5 + m * 2 + rn * 2, yy = vs * w - G2 * w * w; if (yy > 0) dot(x + (m - 1) * .3, this.gy + yy, z, 1, WH[0], WH[1], WH[2], al); }
      }
    }
  }
  /* age at which round i reaches the sea (bisection on its drop) */
  landAge(i, a, dy, my) {
    const g = this.g, TL = this.TL;
    let lo = 0, hi = a;
    for (let it = 0; it < 24; it++) { const md = (lo + hi) / 2, y = my + dy * TL * (1 - Math.exp(-g.kd * md)) - G2 * md * md; if (y > this.gy) lo = md; else hi = md; }
    return lo;
  }
}

/* the muzzle while it fires: a flickering white point, a short flame, the glow and light; gun smoke drifting off.
   o: { t0, mz, dir, dur (s firing, from age 0), seed, weapon } */
export class Muzzle {
  constructor(o) {
    this.t0 = o.t0; this.mz = o.mz.slice(); this.D = o.dir.slice(); this.fire = o.dur; this.seed = o.seed || 7;
    this.g = GUN[o.weapon] || GUN.ciws; this.dur = o.dur + 4;
    this.side = perp(this.D[0], this.D[1], this.D[2], new Float64Array(6));
  }
  draw(C, age) {
    if (age < 0 || age > this.dur) return;
    const V = C.V, dot = C.dot, M = this.mz, D = this.D, g = this.g;
    if (!V.vis(M[0], M[1], M[2], 30)) return;
    const zc = V.depth(M[0], M[1], M[2]); if (zc < V.near) return;
    const nm = g.rounds;
    if (age <= this.fire) {
      const fr = Math.floor(C.tr * 75), f = hsh(fr, 3);
      for (let gi = 0; gi < nm; gi++) {
        const off = nm > 1 ? (gi ? 1 : -1) * g.sep : 0, S = this.side;
        const mx = M[0] + S[0] * off, my = M[1] + S[1] * off, mz = M[2] + S[2] * off;
        for (let j = 0; j < 16; j++) {
          const s = 2.2 * g.mz / 1.2 * Math.pow(hsh(j, fr + 7 + gi * 31), 1.5), rr = .18 * s;
          dot(mx + D[0] * s + GT[(j * 3 + fr) & GM] * rr, my + D[1] * s + GT[(j * 3 + fr + 1) & GM] * rr, mz + D[2] * s + GT[(j * 3 + fr + 2) & GM] * rr, zc < 300 ? 2 : 1, 255, 240, 200, 1 - s / 2.8);
        }
        dot(mx, my, mz, zc < 800 ? 3 : 2, 255, 248, 226, .65 + .35 * f);
        C.halo(mx, my, mz, Math.min(46, 3 + 3600 / zc), 255, 230, 180, .45 * (.55 + .45 * f));
      }
      C.light(M[0] + D[0] * 2, M[1] + D[1] * 2, M[2] + D[2] * 2, 255, 240, 200, .3 * (.6 + .4 * f), 30);
    }
    // gun smoke: a puff every 1/30 s of firing, drifting downwind
    const n = Math.floor(Math.min(age, this.fire) * 30);
    for (let j = 0; j <= n; j++) {
      const tb = j / 30, a = age - tb; if (a > 3.4) continue;
      const r = .3 + 1.3 * Math.sqrt(a), g0 = (j * 3 + this.seed * 7) & GM;
      dot(M[0] + D[0] * 1.2 + C.wind[0] * a + GT[g0] * r, M[1] + .7 * a + GT[(g0 + 1) & GM] * r * .5, M[2] + D[2] * 1.2 + C.wind[2] * a + GT[(g0 + 2) & GM] * r, zc < 500 ? 2 : 1, GREY[0], GREY[1], GREY[2], .38 * (1 - a / 3.4));
    }
  }
}

/* A burst drawn from the sim's own rounds (sim.bursts, sim/weapons.js stepBursts): each representative round where
   the sim flies it, carried back from its last tick to the drawn time along its velocity, and the real rounds between
   two of them strung along the stream (B.wt real rounds each: 75 a second from a Phalanx read as a rope of light,
   ~15 m apart), so the stream bends and walks onto the target exactly as the sim's does, and the rounds that strike
   are the drawn ones that reach it (they end there, at the struck point). A round that missed flies on after the sim
   lets it go (gravity and drag): into the sea with a small splash, or, for self-destructing rounds (sd: the 30 mm;
   C-RAM's HEIT-SD), a small sparkle where its tracer burns out. Short bursts: the sim's (w.burst, w.cd).
   o: { t0, B (the sim's burst), sim, weapon, seed } */
const GS = {
  ciws: { burn: 3, sd: 0, kd: .3 },            // Mk 15 Phalanx, 20 mm: rounds that miss fly on into the sea
  gun30: { burn: 3.2, sd: 1, kd: .35 },        // 2A38M, 30 mm: fused to burst at the end of the tracer
};
const STREAK = .0228;                          // s of flight behind a head (a frame and a half at 60 Hz)
export class GunStream {
  constructor(o) {
    const B = o.B;
    this.B = B; this.sim = o.sim; this.t0 = o.t0; this.seed = o.seed || 41;
    this.g = GS[o.weapon] || GS.ciws; this.gun = GUN[o.weapon] || GUN.ciws;
    this.dur = B.dur + Math.max(B.tmax, this.g.burn) + 1.5;
    this.L = new Float32Array(B.n).fill(-1);     // a missed round's sea-entry time after its end (-1 not yet found)
    this.P = new Float64Array(3); this.Q = new Float64Array(3);
  }
  get durAll() { return this.dur; }
  firing(age) { return age >= 0 && age <= this.B.dur; }
  /* round i at time t -> this.P (world), its velocity -> this.Q; 0 not out / gone, 1 flying, 2 a sparkle (sd) at
     age this.sa, 3 a splash at age this.sa */
  at(i, t) {
    const B = this.B, j = i * 3, st = B.st[i], P = this.P, Q = this.Q, simT = this.sim.t;
    if (st === 0) return 0;
    let te = simT, ex = B.x[j], ey = B.x[j + 1], ez = B.x[j + 2], age0 = B.age[i];
    if (st === 2) {
      te = B.te[i];
      const f = B.ef[i];
      ex = B.p[j] + (B.x[j] - B.p[j]) * f; ey = B.p[j + 1] + (B.x[j + 1] - B.p[j + 1]) * f; ez = B.p[j + 2] + (B.x[j + 2] - B.p[j + 2]) * f;
      age0 = B.age[i] - (1 - f) * .05;
    }
    const vx = B.v[j], vy = B.v[j + 1], vz = B.v[j + 2];
    Q[0] = vx; Q[1] = vy; Q[2] = vz;
    const back = te - t;
    if (back >= 0) {
      // before its last known point: back along its path (not before it left the muzzle)
      if (back > age0) return 0;
      P[0] = ex - vx * back; P[1] = ey - vy * back + 4.9 * back * back; P[2] = ez - vz * back;
      return 1;
    }
    if (st !== 2 || B.hk[i]) return 0;         // struck: it ended there
    // a miss, carried on: linear drag, gravity
    const g = this.g, tau = -back, fl = age0 + tau;
    if (g.sd && fl > g.burn) { const a = fl - g.burn; if (a > .35) return 0; this.sa = a; this.endAt(i, g.burn - age0); return 2; }
    const k = g.kd, e = (1 - Math.exp(-k * tau)) / k;
    P[0] = ex + vx * e; P[1] = ey + vy * e - 4.9 * tau * tau; P[2] = ez + vz * e;
    Q[1] = vy * Math.exp(-k * tau) - 9.81 * tau;
    if (P[1] <= 0) {
      if (this.L[i] < 0) { let lo = 0, hi = tau; for (let it = 0; it < 20; it++) { const m = (lo + hi) / 2; if (ey + vy * (1 - Math.exp(-k * m)) / k - 4.9 * m * m > 0) lo = m; else hi = m; } this.L[i] = lo; }
      const a = tau - this.L[i]; if (a > .9) return 0;
      this.sa = a; this.endAt(i, this.L[i]); P[1] = 0; return 3;
    }
    if (fl > g.burn + 1) return 0;
    return 1;
  }
  /* where round i was tau after its end -> this.P */
  endAt(i, tau) {
    const B = this.B, j = i * 3, f = B.ef[i], k = this.g.kd, e = (1 - Math.exp(-k * tau)) / k, P = this.P;
    P[0] = B.p[j] + (B.x[j] - B.p[j]) * f + B.v[j] * e; P[1] = Math.max(0, B.p[j + 1] + (B.x[j + 1] - B.p[j + 1]) * f + B.v[j + 1] * e - 4.9 * tau * tau); P[2] = B.p[j + 2] + (B.x[j + 2] - B.p[j + 2]) * f + B.v[j + 2] * e;
  }
  draw(C, age) {
    if (age > this.dur || C.n >= C.cap) return;
    const B = this.B, V = C.V, dot = C.dot, t = this.t0 + age, n = Math.min(B.fired, B.n), q = C.q;
    const fill = Math.max(0, Math.round(B.wt * Math.min(1, q + .2)) - 1);
    let px = 0, py = 0, pz = 0, pv = false, pvx = 0, pvy = 0, pvz = 0;
    for (let i = 0; i < n; i++) {
      if (C.n >= C.cap) return;
      const s = this.at(i, t);
      if (s === 2 || s === 3) { this.pop(C, i, s); pv = false; continue; }
      if (s !== 1) { pv = false; continue; }
      const x = this.P[0], y = this.P[1], z = this.P[2], vx = this.Q[0], vy = this.Q[1], vz = this.Q[2];
      if (y < 0) { pv = false; continue; }
      const zc = V.depth(x, y, z);
      if (zc > V.near && V.vis(x, y, z, 30)) {
        this.head(C, x, y, z, vx, vy, vz, zc, .85 + .15 * hsh(i, 5), 1);
        // the real rounds between this one and the one before it (the rope), where both are in the air and close
        if (pv && fill > 0) {
          const dx = px - x, dy = py - y, dz = pz - z;
          if (dx * dx + dy * dy + dz * dz < 150 * 150) for (let m = 1; m <= fill; m++) {
            const f = m / (fill + 1), jj = (i * 7 + m * 3 + this.seed) & GM, sp = .6 + .3 * Math.sqrt(dx * dx + dy * dy + dz * dz) * .01;
            const hx = x + dx * f + GT[jj] * sp, hy = y + dy * f + GT[(jj + 1) & GM] * sp, hz = z + dz * f + GT[(jj + 2) & GM] * sp;
            if (hy < 0) continue;
            const zf = V.depth(hx, hy, hz); if (zf < V.near) continue;
            this.head(C, hx, hy, hz, vx + (pvx - vx) * f, vy + (pvy - vy) * f, vz + (pvz - vz) * f, zf, .7 + .2 * hsh(i * 5 + m, 9), .6);
          }
        }
      }
      px = x; py = y; pz = z; pvx = vx; pvy = vy; pvz = vz; pv = true;
    }
  }
  /* one tracer: a white-hot point and a lime streak a frame and a half of flight long behind it */
  head(C, x, y, z, vx, vy, vz, zc, al, k) {
    const dot = C.dot, V = C.V;
    // close to the lens (a camera by the mount) the rope reads thick and bright: bigger heads, a stronger glow
    const sz = zc < 120 ? 4 : zc < 400 ? 3 : zc < 1500 ? 2 : 1;
    dot(x, y, z, sz, 250, 255, 226, al);
    if (zc < 1200) C.glow(x, y, z, Math.min(12, 4 + 500 / zc), LIME[0], LIME[1], LIME[2], (zc < 400 ? .13 : .07) * al);
    const nt = Math.max(2, Math.min(40, Math.round(Math.hypot(vx, vy, vz) * STREAK * V.fl / zc / 1.6 * k)));
    for (let m = 1; m <= nt; m++) { const d = STREAK * k * m / nt; dot(x - vx * d, y - vy * d, z - vz * d, sz, LIME[0], LIME[1], LIME[2], al * (1 - .85 * m / (nt + 1))); }
  }
  /* a missed round's end: a self-destruct sparkle, or a little splash in the sea */
  pop(C, i, s) {
    const P = this.P, a = this.sa, V = C.V, x = P[0], y = P[1], z = P[2];
    if (!V.vis(x, y, z, 20)) return;
    const zc = V.depth(x, y, z); if (zc < V.near) return;
    const sz = zc < 1500 ? 2 : 1;
    if (s === 2) {
      // HEIT-SD: a pop of white going lime, a few sparks flung out, gone in a third of a second
      const f = 1 - a / .35;
      dot1(C, x, y, z, zc < 800 ? 3 : 2, 255, 252, 236, f * (a < .05 ? 1 : .7));
      C.glow(x, y, z, Math.min(18, 3 + 2500 / zc), LIME[0], LIME[1], LIME[2], .3 * f);
      for (let m = 0; m < 7; m++) {
        const jj = (i * 11 + m * 5 + this.seed) & GM, r = (4 + 10 * hsh(i, m)) * Math.sqrt(a / .35);
        C.dot(x + GT[jj] * r, y + GT[(jj + 1) & GM] * r - 2 * a * a, z + GT[(jj + 2) & GM] * r, sz, LIME[0], LIME[1], LIME[2], .8 * f);
      }
      if (a < .06) C.light(x, y, z, 240, 255, 200, .12, 25);
      return;
    }
    // into the sea: a small white splash
    const al = .7 * (1 - a / .9), rn = hsh(i, 5);
    for (let m = 0; m < 3; m++) { const vs = 2.5 + m * 2 + rn * 2, yy = vs * a - 4.9 * a * a; if (yy > 0) C.dot(x + (m - 1) * .3, yy, z, 1, WH[0], WH[1], WH[2], al); }
  }
}
function dot1(C, x, y, z, s, r, g, b, a) { C.dot(x, y, z, s, r, g, b, a); }
