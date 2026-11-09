/* The mark a warhead leaves on land, as a LiDAR scan would show it: the ground's returns charred dark round the
   point (a ragged disc, darkest in the crater), the crater's raised lip a bright, dense ring of returns, a few
   sparse rings of returns down in its bowl, the ejecta thrown out in rays (pale, thinning with distance) and clods
   lying beyond; for the first minute embers glow in it. It stays for the match (the FX system keeps the newest
   SCORCH_MAX of them).

   Built once at spawn on the ground as drawn (o.ground): every dot is a seeded table entry, nothing per frame but
   the LOD stride. The charring is drawn with alpha-over dots (sink.over: depth tested, dark over the terrain's own
   returns), and so are the lip, the bowl and the ejecta after it (the engine composites the over dots after the max
   ones: a max dot there would be painted out by the char); a sink without `over` (the bench's CPU sink) leaves the
   charring out and draws the rest as film dots.

   o: { t0, pos: [x, ground y, z], kg (the warhead's charge; 0: a crash, scorched ground and no crater), seed,
        ground(x, z) } */
import { TAU, hsh, rng, clamp, ss, noise } from './core.js';

export const SCORCH_MAX = 48;
const CHAR = [13, 13, 11];                 // the graphite ground, a little warm: returns burnt out
const LIP = [226, 226, 216], BOWL = [168, 166, 158], DUSTC = [196, 194, 184], EMBER = [255, 170, 90];

export class Scorch {
  constructor(o) {
    const r = rng(o.seed || 777), kg = Math.max(0, o.kg || 0), crash = !(kg > 0), gnd = o.ground || (() => 0);
    const p = this.p = o.pos.slice();
    this.t0 = o.t0; this.seed = o.seed || 777; this.dur = 1e9;
    // crater radius (m) from the charge (cube root), the charred ground round it, the ejecta's reach
    const R = this.R = crash ? 0 : clamp(.5 * Math.cbrt(kg), .6, 5);
    const Rc = this.Rc = crash ? 7 : Math.max(2.2, R * 2.7), Re = this.Re = crash ? 9 : R * 5.5;
    this.ember = crash ? .6 : clamp(Math.cbrt(kg) / 6, .25, 1);
    const ph = r() * 100;
    // 1. charring: a jittered grid over the disc, its edge ragged (noise on the bearing), darkest in the crater
    const s = this.cs = Math.max(.3, Rc * 1.77 / 30);
    const ch = [];
    for (let gx = -Rc * 1.3; gx <= Rc * 1.3; gx += s) for (let gz = -Rc * 1.3; gz <= Rc * 1.3; gz += s) {
      const x = gx + (r() - .5) * s * .8, z = gz + (r() - .5) * s * .8, d = Math.hypot(x, z), th = Math.atan2(z, x);
      const edge = Rc * (1 + .28 * noise(Math.cos(th) * 1.6 + ph, Math.sin(th) * 1.6, ph) + .12 * noise(Math.cos(th) * 5 + ph, Math.sin(th) * 5, 3));
      if (d > edge) continue;
      const mott = .7 + .3 * (.5 + .5 * noise(x * .7 + ph, z * .7, 7));
      const a = (d < R ? 1 : 1 - .85 * ss(R, edge, d)) * mott;
      if (a < .06) continue;
      ch.push(p[0] + x, gnd(p[0] + x, p[2] + z) + .15, p[2] + z, a);
    }
    this.CH = new Float32Array(ch);
    // 2. the lip (dense, bright) and the bowl (sparse rings), on the ground (the dots cannot go under the drawn ground)
    const lip = [];
    if (R > 0) {
      const nL = Math.round(clamp(TAU * R / .12, 60, 420));
      for (let i = 0; i < nL; i++) {
        const th = (i + r() * .6) / nL * TAU, rr = R * (1.02 + .2 * (r() + r() - 1)), x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        lip.push(p[0] + x, gnd(p[0] + x, p[2] + z) + .12 + R * .1 * (1 - Math.abs(rr / R - 1.02) * 4) * (.6 + .4 * r()), p[2] + z, .55 + .45 * r(), 0);
      }
      for (let k = 1; k <= 3; k++) {
        const rk = R * k / 4, nK = Math.round(clamp(TAU * rk / .3, 8, 120));
        for (let i = 0; i < nK; i++) {
          const th = (i + r()) / nK * TAU, x = Math.cos(th) * rk, z = Math.sin(th) * rk;
          lip.push(p[0] + x, gnd(p[0] + x, p[2] + z) + .08, p[2] + z, (.25 + .2 * k / 3) * (.6 + .4 * r()), 1);
        }
      }
    }
    this.LP = new Float32Array(lip);
    // 3. ejecta: rays of pale returns out of the lip (thinning, spreading), clods lying beyond
    const ej = [], nR = crash ? 6 : 9 + Math.floor(r() * 6);
    for (let k = 0; k < nR; k++) {
      const th0 = (k + r() * .7) / nR * TAU, len = Re * (.55 + .45 * r()), w0 = .18 + .25 * r(), n = Math.round(clamp(len / .18, 12, 160) * (crash ? .4 : 1));
      for (let i = 0; i < n; i++) {
        const u = Math.pow(r(), .8), d = Math.max(R * 1.1, .5) + u * (len - R), th = th0 + (r() - .5) * w0 * (.4 + u), x = Math.cos(th) * d, z = Math.sin(th) * d;
        ej.push(p[0] + x, gnd(p[0] + x, p[2] + z) + .1, p[2] + z, (.6 - .45 * u) * (.6 + .4 * r()), 0);
      }
    }
    const nC = crash ? 20 : Math.round(clamp(R * 22, 14, 90));
    for (let i = 0; i < nC; i++) {
      const th = r() * TAU, d = R + (Re * 1.25 - R) * Math.sqrt(r()), x = Math.cos(th) * d, z = Math.sin(th) * d;
      ej.push(p[0] + x, gnd(p[0] + x, p[2] + z) + .2, p[2] + z, .5 + .4 * r(), 1);
    }
    this.EJ = new Float32Array(ej);
  }
  draw(C, age) {
    if (age < 0) return;
    const V = C.V, p = this.p, Rx = Math.max(this.Rc, this.Re * 1.25);
    if (!V.vis(p[0], p[1], p[2], Rx + 2)) return;
    const pxm = V.pxm(p[0], p[1], p[2]); if (pxm <= 0 || Rx * pxm < 1.5) return;
    // the lip and the ejecta land over the first second; the ground darkens as the fireball and the dust lift off it
    // (over dots are composited after the smoke's: dark ones under a bright fireball would cut holes in it)
    const kIn = ss(.15, .9, age), kCh = ss(.6, 7, age), kEj = ss(.3, 1.2, age), kOld = 1 - .25 * ss(120, 900, age);
    // 1. charring (alpha over the terrain's returns): metre-sized dots that tile the disc; fewer far off
    const over = C.over, CH = this.CH, nCh = CH.length / 4;
    if (over && nCh) {
      const spx = this.cs * pxm, want = Math.max(6, Math.PI * this.Rc * this.Rc * pxm * pxm * .6), stp = Math.max(1, Math.round(nCh / want / C.q));
      const sz = spx > 1.2 ? -this.cs * 1.35 : spx * stp > .7 ? 2 : 1, aK = .85 * kCh * kOld;
      for (let i = 0; i < nCh; i += stp) { const j = i * 4; over(CH[j], CH[j + 1], CH[j + 2], sz, CHAR[0], CHAR[1], CHAR[2], CH[j + 3] * aK); }
    }
    const pt = over || C.dot;
    if (this.R > 0) {
      // 2. the lip and the bowl's rings (max: returns brighter than the char)
      const LP = this.LP, nL = LP.length / 5, sL = Math.max(1, Math.round((this.R * pxm > 40 ? 1 : this.R * pxm > 12 ? 2 : 4) / C.q)), sz = this.R * pxm > 60 ? 2 : 1;
      for (let i = 0; i < nL; i += sL) {
        const j = i * 5, bowl = LP[j + 4], c = bowl ? BOWL : LIP;
        pt(LP[j], LP[j + 1], LP[j + 2], sz, c[0], c[1], c[2], LP[j + 3] * kIn * kOld);
      }
    }
    // 3. ejecta rays and clods
    const EJ = this.EJ, nE = EJ.length / 5, sE = Math.max(1, Math.round((this.Re * pxm > 120 ? 1 : this.Re * pxm > 40 ? 2 : 4) / C.q));
    for (let i = 0; i < nE; i += sE) {
      const j = i * 5, clod = EJ[j + 4];
      pt(EJ[j], EJ[j + 1], EJ[j + 2], clod && pxm > 6 ? 2 : 1, DUSTC[0], DUSTC[1], DUSTC[2], EJ[j + 3] * kEj * kOld * (clod ? 1 : .8));
    }
    // 4. embers in the crater for the first minute (real-time flicker, sim-time decay)
    const eK = this.ember * Math.exp(-age / 18) * ss(.2, .8, age);
    if (eK > .02) {
      const n = Math.round(clamp(this.R * 8 + 6, 6, 40) * C.q), Rr = Math.max(.6, this.R * .9);
      for (let k = 0; k < n; k++) {
        const th = hsh(k, this.seed) * TAU, d = Rr * Math.sqrt(hsh(k, this.seed + 1)), fl = .55 + .45 * Math.sin(C.tr * (5 + 4 * hsh(k, this.seed + 2)) + k * 2.1);
        const x = p[0] + Math.cos(th) * d, z = p[2] + Math.sin(th) * d;
        C.glow(x, C.ground(x, z) + .2, z, 1, EMBER[0], EMBER[1], EMBER[2], eK * fl * (.5 + .5 * hsh(k, this.seed + 3)));
      }
      C.light(p[0], p[1] + 1.5, p[2], 255, 160, 90, .12 * eK, Math.max(8, this.R * 4));
    }
  }
}
