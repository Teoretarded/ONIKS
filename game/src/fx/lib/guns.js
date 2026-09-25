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
