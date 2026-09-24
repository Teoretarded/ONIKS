/* ENGAGEMENT: the defence. Chapter 3 (T 50-92). Two SM-6s leave TRK 21's VLS on coral streaks with lingering
   dot smoke, arc over and come down on rounds 1 and 2 (bursts of dots, debris into the sea); the forward Phalanx
   slews and hoses coral tracer dots at round 3, which bursts ~500 m short, then swings onto round 4. The EO inset
   is the destroyer's director looking down the raid's line, dotted boxes on each round's true bounds.
   Spectacle only: the flight paths are keyed curves timed to the stage-A stop events, not a guidance model.
   Everything is analytic in sim time S (= tau before TJ), in world coordinates, and gone before T ~103.8
   (PD.TJ = 104.5, where the picture clock jumps). */
(function () {
  'use strict';
  const PD = window.PD, DW = PD.DW;
  const { V, R, X, E } = M3;
  const { DEG, TAU, LIME, WH, CORAL, hsh, gH } = PD;
  const DDA = HD.destroyer.A;
  const sat = E.sat, ss = E.ss, mix = E.mix, G2 = 4.905;
  const q = DW.q, P3 = DW.P3, put = DW.put, glow = DW.glow;
  const WIND = PD.WIND || (PD.WIND = [1.7, 0, -1.1]);          // m/s, the air the smoke drifts with
  const GREY = [212, 216, 206];
  /* every effect here has faded out before the picture clock jumps */
  const gate = T => 1 - ss(101.2, 103.8, T);

  /* gaussian offsets, tabled so hot loops index instead of calling log / cos */
  const GN = 8192, GM = GN - 1, GT = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GT[i] = gH(i, 7331);

  /* ---------- the rounds' fate: gone at the instant they are stopped (the burst covers it) ---------- */
  const fate0 = PD.fate;
  PD.fate = (k, tau) => k < 3 ? (tau < PD.tauStop(k) ? 1 : 0) : fate0(k, tau);

  /* ---------- SM-6: vertical launch, pitch-over, a shallow loft, a dive onto the round ---------- */
  const SM = [
    { k: 0, cell: 45, tL: 52.6, apex: 2300, bend: -170, dive: 16 },
    { k: 1, cell: 12, tL: 62.4, apex: 1750, bend: 150, dive: 15 },
  ];
  function buildSM(m) {
    const tI = PD.tauStop(m.k), Ip = PD.round(m.k, tI).p, P0 = X.ap(PD.shipX(0, m.tL), DDA.vls(m.cell));
    const hx = Ip[0] - P0[0], hz = Ip[2] - P0[2], Lh = Math.hypot(hx, hz), hd = [hx / Lh, 0, hz / Lh], sd = [hd[2], 0, -hd[0]];
    const at = (u, s, y) => [P0[0] + hd[0] * u + sd[0] * s, y, P0[2] + hd[2] * u + sd[2] * s];
    const dir = (c, y) => V.norm([hd[0] * c, y, hd[2] * c]);
    const ga = m.dive * DEG, Dd = 1700;
    // [point, unit tangent]: Hermite segments with chord-length tangents
    const K = [
      [P0, [0, 1, 0]],
      [at(110, 0, P0[1] + 620), dir(.36, 1)],
      [at(2400, m.bend * .3, m.apex * .7), dir(1, .5)],
      [at(Lh * .42, m.bend, m.apex), dir(1, 0)],
      [at(Lh - Dd, m.bend * .25, Ip[1] + Dd * Math.tan(ga)), dir(Math.cos(ga), -Math.sin(ga))],
      [Ip, dir(Math.cos(ga), -Math.sin(ga))],
    ];
    const pts = [P0.slice()];
    for (let s = 0; s < K.length - 1; s++) {
      const a = K[s][0], b = K[s + 1][0], ch = V.dist(a, b), m0 = V.mul(K[s][1], ch), m1 = V.mul(K[s + 1][1], ch), n = Math.max(24, Math.ceil(ch / 10));
      for (let i = 1; i <= n; i++) {
        const u = i / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        pts.push([0, 1, 2].map(c => a[c] * h00 + m0[c] * h10 + b[c] * h01 + m1[c] * h11));
      }
    }
    const N = pts.length, P = new Float64Array(N * 3), A = new Float64Array(N);
    for (let i = 0; i < N; i++) { P[i * 3] = pts[i][0]; P[i * 3 + 1] = pts[i][1]; P[i * 3 + 2] = pts[i][2]; if (i) A[i] = A[i - 1] + V.dist(pts[i], pts[i - 1]); }
    // speed: a linear ramp through the Mk 72 boost (tb), then flat; scaled so the head meets the round on time
    const L = A[N - 1], Tf = tI - m.tL, tb = 3.2, vmax = L / (Tf - tb / 2);
    Object.assign(m, { tI, Ip, P0, P, A, N, L, Tf, tb, vmax, a0: vmax * tb / 2 });
  }
  SM.forEach(buildSM);
  const headArc = (m, t) => { t = E.clamp(t, 0, m.Tf); return t < m.tb ? m.vmax * t * t / (2 * m.tb) : m.vmax * (t - m.tb / 2); };
  const HP = [0, 0, 0], HQ = [0, 0, 0];
  function posAt(m, a, out) {
    const A = m.A, P = m.P; a = E.clamp(a, 0, m.L);
    let lo = 0, hi = m.N - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (A[md] <= a) lo = md; else hi = md; }
    const u = (a - A[lo]) / (A[hi] - A[lo] || 1), l3 = lo * 3, h3 = hi * 3;
    out[0] = P[l3] + (P[h3] - P[l3]) * u; out[1] = P[l3 + 1] + (P[h3 + 1] - P[l3 + 1]) * u; out[2] = P[l3 + 2] + (P[h3 + 2] - P[l3 + 2]) * u;
    return out;
  }
  const SMK_DS = 5;
  /* the trail: puffs laid where the head passed, thick off the booster, thinner off the sustainer, a wisp in the
     glide; they spread, drift with the wind and thin out (booster smoke lingers longest) */
  function drawSM(m, T, S, k) {
    const t = S - m.tL; if (t < 0 || k <= 0) return;
    const ha = headArc(m, t), n1 = Math.floor(ha / SMK_DS), P = m.P, A = m.A, vm = m.vmax, tb = m.tb, a0 = m.a0;
    const seed = m.k * 4099;
    let i = 0;
    for (let n = 1; n <= n1; n++) {
      const a = n * SMK_DS;
      while (i < m.N - 2 && A[i + 1] < a) i++;
      const born = a < a0 ? Math.sqrt(2 * tb * a / vm) : a / vm + tb / 2, age = t - born;
      let np, B, tauS, end, spr;
      if (born < 6) { np = 3; B = .62; tauS = 22; end = 40; spr = 1.5; }
      else if (born < 11.5) { np = 2; B = .42; tauS = 11; end = 26; spr = 1.05; }
      else { np = 1; B = .26; tauS = 6; end = 15; spr = .8; }
      if (age > end) continue;
      const env = k * B * sat(age / .05) * Math.exp(-age / tauS) * (1 - ss(end * .6, end, age));
      if (env < .012) continue;
      const u = (a - A[i]) / (A[i + 1] - A[i] || 1), i3 = i * 3;
      const bx = P[i3] + (P[i3 + 3] - P[i3]) * u + WIND[0] * age, by = P[i3 + 1] + (P[i3 + 4] - P[i3 + 1]) * u + .25 * age, bz = P[i3 + 2] + (P[i3 + 5] - P[i3 + 2]) * u + WIND[2] * age;
      // the long lens sees a sliver of the sky: drop samples whose centre is well out of its frame
      if (EOV && !P3(bx, by, bz)) continue;
      const r = spr * (.45 + 1.45 * Math.sqrt(age) + .1 * age);
      // the fresh trail glows coral for a second or so behind the head (the streak), then pales to smoke
      const hot = age < 2.8 ? Math.exp(-age * 1.3) * (born < 11.5 ? 1 : .7) : 0;
      const cr = GREY[0] + (CORAL[0] - GREY[0]) * hot, cg = GREY[1] + (CORAL[1] - GREY[1]) * hot, cb = GREY[2] + (CORAL[2] - GREY[2]) * hot;
      const bb = env * (1 + 2.2 * hot) + .5 * hot * k, big = hot > .3 ? 2 : 1;
      for (let j = 0; j < np; j++) {
        const g0 = (seed + n * 5 + j * 1733) & GM;
        const y = by + GT[(g0 + 1) & GM] * r * .8; if (y < .5) continue;
        if (!P3(bx + GT[g0] * r, y, bz + GT[(g0 + 2) & GM] * r)) continue;
        const b = bb * (.7 + .6 * hsh(n, j + 11));
        put(q.x, q.y, q.z < 1100 ? 2 : q.z < 9000 ? big : 1, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
    // the head: a white-hot point, the motor's flame, a coral glow; none once it has met the round
    if (t > m.Tf) return;
    posAt(m, ha, HP); posAt(m, Math.max(0, ha - 5), HQ);
    let dx = HP[0] - HQ[0], dy = HP[1] - HQ[1], dz = HP[2] - HQ[2]; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const burn = t < 6 ? 1 : t < 11.5 ? .55 : .18, Lf = t < 6 ? 30 : t < 11.5 ? 12 : 4, fr = Math.floor(S * 60);
    for (let j = 0; j < 70; j++) {
      const s = Lf * Math.pow(hsh(j + 31 * m.k, fr), 1.7), rad = (.25 + .06 * s) * GT[(j * 3 + fr) & GM] * .6;
      if (!P3(HP[0] - dx * s + rad, HP[1] - dy * s + GT[(j * 3 + fr + 1) & GM] * .3 * (.25 + .06 * s), HP[2] - dz * s - rad)) continue;
      const h = 1 - s / Lf, b = k * burn * (.35 + .9 * h);
      put(q.x, q.y, q.z < 700 ? 2 : 1, 255, 170 + 80 * h, 120 + 110 * h * h, b > 1 ? 1 : b);
    }
    if (P3(HP[0], HP[1], HP[2])) {
      const z = q.z, sx = q.x, sy = q.y;
      put(sx, sy, z < 2500 ? 3 : 2, 255, 246, 232, k);
      glow(sx, sy, Math.min(80, 5 + 9000 * (.35 + burn) / z), CORAL[0], CORAL[1] + 30, CORAL[2] + 30, .5 * k * (.5 + burn));
      glow(sx, sy, Math.min(20, 2 + 1500 / z), 255, 240, 220, .6 * k);
    }
    // the launch: the VLS cell flares, a flash over the deck
    if (t < 1.4 && P3(m.P0[0], m.P0[1] + 2, m.P0[2])) {
      const w = 1 - t / 1.4;
      glow(q.x, q.y, Math.min(90, 6 + 9000 / q.z) * (.6 + .4 * w), 255, 200, 160, .7 * k * w * w);
      put(q.x, q.y, 3, 255, 248, 236, k * w);
    }
  }

  /* ---------- bursts: a flash, a fireball of lobes cooling to smoke, sparks, fragments arcing into the sea ---------- */
  /* the fireball: a cluster of lobes (not a ball), dots filling each toward its skin */
  const SHELL = (() => {
    const r = M3.rng(4401), n = 1800, NL = 7, a = new Float32Array(n * 5), LB = [];
    for (let l = 0; l < NL; l++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = l ? .38 + .32 * r() : 0; LB.push([s * Math.cos(th) * d, u * d * .75, s * Math.sin(th) * d, l ? .42 + .3 * r() : .72]); }
    for (let i = 0; i < n; i++) {
      const L = LB[i % NL], u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = Math.pow(r(), .4);
      a[i * 5] = L[0] + s * Math.cos(th) * rr * L[3]; a[i * 5 + 1] = L[1] + u * rr * L[3]; a[i * 5 + 2] = L[2] + s * Math.sin(th) * rr * L[3];
      a[i * 5 + 3] = Math.min(1, rr * (i % NL ? .8 : 1) + .25 * Math.hypot(L[0], L[1], L[2])); a[i * 5 + 4] = r();
    }
    return { n, a };
  })();
  const BU = [0, 1, 2].map(k => {
    const t0 = PD.tauStop(k), RO = PD.round(k, t0), big = k === 2;
    // an interceptor coming down on it adds a downward shove; the gun kill keeps its momentum toward the ship
    const dir = big ? RO.dir : V.norm(V.add(RO.dir, [0, -.2, 0]));
    const s = big ? 1.25 : 1.1, n = big ? 380 : 210, rr = M3.rng(9100 + k * 17);
    const F = new Float32Array(n * 6), AW = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = big ? .08 + .5 * rr() : .1 + .5 * rr(), sp = (25 + (big ? 230 : 150) * Math.pow(rr(), 1.4)) * s;
      const u = rr() * 2 - 1, th = rr() * TAU, c = Math.sqrt(1 - u * u);
      const vx = dir[0] * 680 * f + c * Math.cos(th) * sp, vy = dir[1] * 680 * f + u * sp * (big ? .5 : .7) + 12, vz = dir[2] * 680 * f + c * Math.sin(th) * sp;
      const kd = big ? 1.5 + 2.6 * rr() : .9 + 2.8 * rr();
      F[i * 6] = vx; F[i * 6 + 1] = vy; F[i * 6 + 2] = vz; F[i * 6 + 3] = kd; F[i * 6 + 4] = rr(); F[i * 6 + 5] = i % 5 === 0 ? 1 : 0;
      // the moment it reaches the water
      const yAt = a => RO.p[1] + vy * (1 - Math.exp(-kd * a)) / kd - G2 * a * a;
      let lo = 0, hi = 8; for (let it = 0; it < 40; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
      AW[i] = lo;
    }
    // sparks: fast, short-lived streaks thrown out of the flash
    const ns = 130, SP = new Float32Array(ns * 5);
    for (let i = 0; i < ns; i++) {
      const u = rr() * 2 - 1, th = rr() * TAU, c = Math.sqrt(1 - u * u), sp = (150 + 300 * rr()) * s;
      SP[i * 5] = c * Math.cos(th) * sp + dir[0] * 220; SP[i * 5 + 1] = u * sp * .8 + dir[1] * 220 + 20; SP[i * 5 + 2] = c * Math.sin(th) * sp + dir[2] * 220;
      SP[i * 5 + 3] = 1.6 + 1.8 * rr(); SP[i * 5 + 4] = .45 + .65 * rr();
    }
    return { k, t0, p: RO.p, dir, s, fs: big ? .8 : 1.05, n, F, AW, ns, SP, big, life: 6, rot: R.mul(R.y(k * 2.1 + .4), R.x(k * 1.3 - .5)) };
  });
  PD.BURSTS = BU;
  const burstC = (B, a, out) => { const d = 680 / 3.4 * (1 - Math.exp(-3.4 * a)) * (B.big ? .4 : .7); out[0] = B.p[0] + B.dir[0] * d + WIND[0] * a; out[1] = B.p[1] + B.dir[1] * d + 1.2 * a; out[2] = B.p[2] + B.dir[2] * d + WIND[2] * a; return out; };
  const BC = [0, 0, 0];
  const HOT = [255, 246, 228], MID0 = [255, 132, 84], MID_EO = [236, 222, 204];
  /* the EO is a monochrome sensor: in the inset a burst blooms warm white, only the marks stay coral */
  let EOV = false;
  function drawBurst(B, T, S, k) {
    const a = S - B.t0; if (a < 0 || a > B.life + 1.3 || k <= 0) return;
    const s = B.s, c = burstC(B, a, BC), cx = c[0], cy = c[1], cz = c[2], M = B.rot, MID = EOV ? MID_EO : MID0;
    // the fireball: white-hot lobes with coral skins, cooling from the outside in, then a thinning grey puff
    const str = 1 - Math.exp(-a * 3), Rb = B.fs * (13 * (1 - Math.exp(-a * 7)) + 3.8 * a), fade = 1 - ss(B.life * .5, B.life, a), SA = SHELL.a, thin = .45 * ss(1, 3, a);
    if (fade > 0) for (let i = 0; i < SHELL.n; i++) {
      const o = i * 5, rr = SA[o + 3], rn = SA[o + 4];
      if (rn < thin) continue;
      const ux = SA[o], uy = SA[o + 1], uz = SA[o + 2];
      const wx = M[0] * ux + M[1] * uy + M[2] * uz, wy = M[3] * ux + M[4] * uy + M[5] * uz, wz = M[6] * ux + M[7] * uy + M[8] * uz;
      // momentum smears the cloud forward: each dot runs ahead by its own share
      const run = Rb * 1.1 * (((rn * 3.7) % 1) - .3) * str, D0 = B.dir;
      const y = cy + wy * Rb + D0[1] * run; if (y < .3) continue;
      if (!P3(cx + wx * Rb + D0[0] * run, y, cz + wz * Rb + D0[2] * run)) continue;
      const heat = Math.exp(-a * (.8 + 1.5 * rr) * (.65 + .7 * ((rn * 7.31) % 1)));
      let cr, cg, cb, al;
      if (heat > .5) { const u = (heat - .5) / .5, uu = u * u; cr = 255; cg = MID[1] + (HOT[1] - MID[1]) * uu; cb = MID[2] + (HOT[2] - MID[2]) * uu; al = .75 + .6 * u; }
      else if (heat > .16) { const u = (heat - .16) / .34; cr = GREY[0] + (MID[0] - GREY[0]) * u; cg = GREY[1] + (MID[1] - GREY[1]) * u; cb = GREY[2] + (MID[2] - GREY[2]) * u; al = .34 + .5 * u; }
      else { cr = GREY[0]; cg = GREY[1]; cb = GREY[2]; al = .34 * (.6 + .6 * rn); }
      // a ragged texture: some dots flare, most sit back, so the fireball never reads as a flat blob
      const b = k * fade * al * (.35 + 1.1 * rn * rn);
      put(q.x, q.y, q.z < 70 ? 3 : q.z < 1400 && (heat > .45 || rn > .7) ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
    // the first instant: a white core
    if (a < .2 && P3(B.p[0], B.p[1], B.p[2])) {
      const w = 1 - a / .2;
      put(q.x, q.y, 7, 255, 255, 250, k * w);
      glow(q.x, q.y, Math.min(190, 8 + 36000 * s / q.z) * (.6 + .4 * w), 255, 236, 214, .9 * k * w);
    }
    // sparks: white streaks going coral as they slow
    if (a < 1.2) for (let i = 0; i < B.ns; i++) {
      const o = i * 5, life = B.SP[o + 4]; if (a > life) continue;
      const kd = B.SP[o + 3], vx = B.SP[o], vy = B.SP[o + 1], vz = B.SP[o + 2], p = B.p, w = 1 - a / life;
      for (let m = 0; m < 5; m++) {
        const t2 = Math.max(0, a - m * .014), h = (1 - Math.exp(-kd * t2)) / kd;
        if (!P3(p[0] + vx * h, p[1] + vy * h - G2 * t2 * t2, p[2] + vz * h)) continue;
        const hw = Math.min(1, 1.3 * w) * (1 - m * .17);
        if (EOV) put(q.x, q.y, 1, 250, 244, 232, k * hw * .8); else put(q.x, q.y, q.z < 1200 && m < 2 ? 2 : 1, 255, 150 + 100 * w, 90 + 140 * w * w, k * hw);
      }
    }
    // fragments: bright specks, every fifth a burning brand trailing dots; a splash where each meets the sea
    const F = B.F, AW = B.AW, p = B.p;
    for (let i = 0; i < B.n; i++) {
      const o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], rn = F[o + 4], brand = F[o + 5], aw = AW[i];
      if (a < aw) {
        const h = (1 - Math.exp(-kd * a)) / kd;
        if (brand) {
          for (let m = 1; m < 12; m++) {
            const t2 = a - m * .03; if (t2 < 0) break;
            const h2 = (1 - Math.exp(-kd * t2)) / kd, u = m / 12;
            if (P3(p[0] + vx * h2, p[1] + vy * h2 - G2 * t2 * t2 + m * .15, p[2] + vz * h2)) put(q.x, q.y, 1, EOV ? 236 : 255 - 50 * u, EOV ? 228 : 150 + 50 * u, EOV ? 214 : 100 + 100 * u, k * .8 * (1 - u) * (1 - .5 * a / aw));
          }
        }
        if (!P3(p[0] + vx * h, p[1] + vy * h - G2 * a * a, p[2] + vz * h)) continue;
        const hot = Math.exp(-a * 1.3);
        const b = k * (brand ? 1 : .55 + .4 * rn) * (.55 + .45 * hot);
        put(q.x, q.y, q.z < 900 && (brand || rn > .6) ? 2 : 1, 255, brand ? 200 : 236 + 19 * hot, brand ? 150 : 226 + 29 * hot, b > 1 ? 1 : b);
      } else if (a < aw + 1.3) {
        const w = a - aw, h = (1 - Math.exp(-kd * aw)) / kd, x = p[0] + vx * h, z = p[2] + vz * h, al = k * .8 * (1 - w / 1.3), hs = B.big ? 1.5 : 1;
        for (let m = 0; m < 5; m++) {
          const vs = (3 + m * 2.4 + rn * 3) * hs, yy = vs * w - G2 * w * w; if (yy < 0) continue;
          if (P3(x + (m - 2) * .4 * (1 + w), yy, z + GT[(i * 5 + m) & GM] * .5)) put(q.x, q.y, q.z < 900 ? 2 : 1, WH[0], WH[1], WH[2], al);
        }
        if (w < .6) for (let m = 0; m < 8; m++) { const th = m / 8 * TAU + rn * 3, rr = 1 + 7 * w; if (P3(x + Math.cos(th) * rr, .2, z + Math.sin(th) * rr)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], al * .7); }
      }
    }
  }

  /* ---------- the close-in gun: forward Phalanx, 75 rounds/s at 1100 m/s, every one a tracer dot ----------
     It slews onto the raid's line, hoses round 3 until it bursts, then swings onto round 4 (PD.CIWS, sim time). */
  const CW = { rate: 75, v0: 1100, kd: .3, mount: 0 };
  const CIWS = PD.CIWS = {
    slew: [87.0, 88.3],
    fire: [{ s0: 88.85, s1: PD.tauStop(2) + .02, k: 2 }, { s0: 91.9, s1: PD.TAU_HIT - .3, k: 3 }],
  };
  const capOf = k => k === 3 ? PD.TAU_HIT - .25 : PD.tauStop(k);
  const RT = {};
  const tgtAt = (k, s) => PD.round(k, Math.min(s, capOf(k)), RT).p;
  const invShip = d => { const Rm = PD.shipR; return [Rm[0] * d[0] + Rm[3] * d[1] + Rm[6] * d[2], Rm[1] * d[0] + Rm[4] * d[1] + Rm[7] * d[2], Rm[2] * d[0] + Rm[5] * d[1] + Rm[8] * d[2]]; };
  const tof = r => { const x = CW.kd * r / CW.v0; return x < .95 ? -Math.log(1 - x) / CW.kd : 10; };
  const ST = { ciwsYaw: [0, Math.PI], ciwsPitch: [0, 0] };
  /* aim of mount i at target k for a round leaving at sim time s: {M: muzzle (world), D: unit dir, yaw, pitch, t: time of flight} */
  function aimAt(i, k, s) {
    const Xs = PD.shipX(0, s);
    let M = X.ap(Xs, DDA.ciws(ST, i)), t = 1, yaw = 0, pitch = 0, D = null;
    for (let it = 0; it < 3; it++) {
      const P = tgtAt(k, s + t), r = V.dist(P, M); t = tof(r);
      D = V.norm([P[0] - M[0], P[1] - M[1] + G2 * t * t, P[2] - M[2]]);
      const dl = invShip(D); yaw = Math.atan2(dl[0], dl[2]); pitch = Math.asin(E.clamp(dl[1], -1, 1));
      ST.ciwsYaw[i] = yaw; ST.ciwsPitch[i] = pitch; M = X.ap(Xs, DDA.ciws(ST, i));
    }
    return { M, D, yaw, pitch, t };
  }
  /* every round of both bursts, precomputed on first use (so a later file may still edit PD.CIWS.fire): fire time,
     muzzle, direction (with dispersion), water-entry age */
  let TR = null;
  const buildTR = () => {
    const list = [];
    CIWS.fire.forEach((w, wi) => {
      const n = Math.floor((w.s1 - w.s0) * CW.rate);
      for (let j = 0; j <= n; j++) {
        const tk = w.s0 + j / CW.rate, A = aimAt(CW.mount, w.k, tk);
        // the stream walks onto the target from short, then wanders a little around it
        const walk = .006 * Math.exp(-(tk - w.s0) / .45), wx = .0012 * M3.noise(tk * 1.7, 3.3), wy = .0012 * M3.noise(tk * 1.9, 8.1);
        const u = V.norm(V.cross(A.D, [0, 1, 0])), vv = V.cross(u, A.D), id = wi * 1000 + j;
        const ex = gH(id, 41) * .0022 + wx, ey = gH(id, 43) * .0022 + wy - walk;
        const D = V.norm([A.D[0] + u[0] * ex + vv[0] * ey, A.D[1] + u[1] * ex + vv[1] * ey, A.D[2] + u[2] * ex + vv[2] * ey]);
        const yAt = a => A.M[1] + D[1] * CW.v0 / CW.kd * (1 - Math.exp(-CW.kd * a)) - G2 * a * a;
        let lo = 0, hi = 6; for (let it = 0; it < 36; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
        list.push({ tk, M: A.M, D, aw: Math.min(lo, 4.2), wet: lo < 4.2, rn: hsh(id, 5) });
      }
    });
    return list;
  };
  Object.defineProperty(CIWS, 'list', { get: () => TR || (TR = buildTR()) });
  /* gun state per film time: rest until the slew, on the raid's line after (held once round 4 is in) */
  const AIM_END = aimAt(CW.mount, 3, PD.TAU_HIT - .3), AIM_END1 = aimAt(1, 3, PD.TAU_HIT - .3);
  let stT = -1; const stC = { yaw: [0, Math.PI], pitch: [0, 0], fire: 0 };
  function ciwsState(T) {
    if (T === stT) return stC; stT = T;
    if (T < 86) { stC.yaw[0] = 0; stC.yaw[1] = Math.PI; stC.pitch[0] = stC.pitch[1] = .35; stC.fire = 0; return stC; }
    const S = PD.S(T);
    let a0, a1;
    if (T < PD.T_HIT && T < PD.TJ) {
      const s = Math.min(S, PD.TAU_HIT - .3), sw = ss(PD.tauStop(2) - .05, PD.tauStop(2) + .3, s);
      const A = aimAt(CW.mount, 2, s), B = sw > 0 ? aimAt(CW.mount, 3, s) : A, C = aimAt(1, sw > .5 ? 3 : 2, s);
      a0 = { yaw: mix(A.yaw, B.yaw, sw), pitch: mix(A.pitch, B.pitch, sw) }; a1 = C;
    } else { a0 = AIM_END; a1 = AIM_END1; }
    const w = ss(CIWS.slew[0], CIWS.slew[1], T < PD.TJ ? S : 1e9);
    stC.yaw[0] = mix(0, a0.yaw, w); stC.pitch[0] = a0.pitch; stC.yaw[1] = mix(Math.PI, a1.yaw < 0 ? a1.yaw + TAU : a1.yaw, w); stC.pitch[1] = a1.pitch;
    stC.fire = T < PD.TJ && CIWS.fire.some(f => S >= f.s0 && S <= f.s1) ? 1 : 0;
    return stC;
  }
  /* HD.destroyer's CIWS are dyn parts the film samples once at rest (barrels 20 deg up): add a second sampling of
     each mount with the barrels level and switch to it while the ship is kilometres away (T 86, invisible). */
  (function levelPose() {
    DW.DDG_LV.forEach((lv, li) => {
      const add = [];
      for (const s of lv.parts) {
        const i = s.part.name === 'ciwsF' ? 0 : s.part.name === 'ciwsA' ? 1 : -1;
        if (i < 0) continue;
        const base = s.part;
        if (!base.show) base.show = st => !(st.ciwsPose && st.ciwsPose[i]);
        const alt = Object.assign({}, base, { show: st => !!(st.ciwsPose && st.ciwsPose[i]) });
        const smp = GEO.sample({ parts: [alt] }, lv.sp, 900 + li * 7 + i, { ciwsPitch: [0, 0] }, li >= 1 ? { fine: false } : undefined)[0];
        if (smp.pts.length) add.push({ name: base.name, label: base.label, part: alt, pts: smp.pts });
      }
      lv.parts.push(...add);
    });
  })();
  PD.shipStateFx = function (st, T) {
    const c = ciwsState(T);
    st.ciwsYaw = [c.yaw[0], c.yaw[1]]; st.ciwsPitch = [c.pitch[0], c.pitch[1]];
    if (T >= 86) st.ciwsPose = [1, 1];
    if (T >= 52.6 && T < PD.TJ) st.vlsOpen = [[SM[0].cell, 1]].concat(T >= 62.4 ? [[SM[1].cell, 1]] : []);
    return st;
  };
  const TRL = CW.v0 / CW.kd;
  function drawTracers(T, S, rate, k) {
    if (k <= 0 || S < CIWS.fire[0].s0 || T >= PD.TJ) return;
    const blur = .0034 * rate + .0004, t0 = S - 5.4, TR = CIWS.list;
    // rounds in flight or splashing: a coral head, a short streak along the velocity; a white splash where they land
    for (let i = 0; i < TR.length; i++) {
      const r = TR[i], a = S - r.tk; if (a < 0) break; if (r.tk < t0) continue;
      if (a < r.aw) {
        const ex = Math.exp(-CW.kd * a), h = TRL * (1 - ex), v = CW.v0 * ex;
        const x = r.M[0] + r.D[0] * h, y = r.M[1] + r.D[1] * h - G2 * a * a, z = r.M[2] + r.D[2] * h;
        const vx = r.D[0] * v, vy = r.D[1] * v - 9.81 * a, vz = r.D[2] * v, al = k * (1 - ss(r.aw - .4, r.aw, a) * (r.wet ? 0 : 1)) * (.8 + .2 * r.rn);
        if (P3(x, y, z)) { put(q.x, q.y, q.z < 1500 ? 2 : 1, 255, 190, 150, al); if (q.z < 400) put(q.x, q.y, 1, 255, 244, 230, al); }
        // a motion streak about a frame long, so the ones that pass near the lens whip across it
        for (let m = 1; m <= 6; m++) { const d = blur * m; if (P3(x - vx * d, y - vy * d, z - vz * d)) put(q.x, q.y, q.z < 700 ? 2 : 1, CORAL[0], CORAL[1] + 20, CORAL[2] + 20, al * (1 - m * .14)); }
      } else if (r.wet && a < r.aw + .9) {
        const w = a - r.aw, ex = Math.exp(-CW.kd * r.aw), h = TRL * (1 - ex), x = r.M[0] + r.D[0] * h, z = r.M[2] + r.D[2] * h, al = k * .7 * (1 - w / .9);
        for (let m = 0; m < 3; m++) { const vs = 2.5 + m * 2 + r.rn * 2, yy = vs * w - G2 * w * w; if (yy > 0 && P3(x + (m - 1) * .3, yy, z)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], al); }
      }
    }
    // the muzzle: a flickering white-coral point while it fires, a little gun smoke drifting off
    const c = ciwsState(T);
    const Xs = PD.shipX(0, PD.tau(T));
    ST.ciwsYaw[0] = c.yaw[0]; ST.ciwsPitch[0] = c.pitch[0];
    const Mz = X.ap(Xs, DDA.ciws(ST, 0));
    if (c.fire && P3(Mz[0], Mz[1], Mz[2])) {
      const f = hsh(Math.floor(S * 75), 3);
      put(q.x, q.y, q.z < 800 ? 3 : 2, 255, 236, 214, k * (.6 + .4 * f));
      glow(q.x, q.y, Math.min(40, 3 + 3000 / q.z), 255, 170, 120, .45 * k * (.5 + .5 * f));
    }
    for (let j = 0; j < 90; j++) {
      const tb = Math.floor(S * 30) / 30 - j / 30, fw = CIWS.fire.find(f => tb >= f.s0 && tb <= f.s1); if (!fw) continue;
      const a = S - tb, r = .3 + 1.2 * Math.sqrt(a);
      if (P3(Mz[0] + WIND[0] * a + GT[(j * 3 + Math.floor(tb * 30)) & GM] * r, Mz[1] + .6 * a + GT[(j * 3 + 1) & GM] * r * .5, Mz[2] + WIND[2] * a + GT[(j * 3 + 2) & GM] * r)) put(q.x, q.y, 1, GREY[0], GREY[1], GREY[2], k * .35 * (1 - a / 3));
    }
  }

  /* ---------- everything of the defence into the synced view ---------- */
  function drawAll(T, S, rate, k) {
    if (T < 52 || T > 103.8) return;
    const g = k * gate(T);
    for (const m of SM) drawSM(m, T, S, g);
    for (const B of BU) drawBurst(B, T, S, g);
    drawTracers(T, S, rate, g);
    // the rounds' own lime trails linger a moment past the burst
    for (let j = 0; j < 3; j++) { const a = S - PD.tauStop(j); if (a > 0 && a < 1.3 && T < PD.TJ) DW.drawTrail(j, T, g); }
  }
  PD.defenceFx = function (T, ctx) { drawAll(T, ctx.S, ctx.rate, ctx.dA); };

  /* ---------- main-view overlay: bloom on the bursts, short tags ---------- */
  function bloom(octx, x, y, r, A) {
    if (A <= .005) return;
    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,246,228,${A.toFixed(3)})`); g.addColorStop(.3, `rgba(255,170,130,${(A * .35).toFixed(3)})`); g.addColorStop(1, 'rgba(255,140,100,0)');
    octx.globalCompositeOperation = 'lighter'; octx.fillStyle = g; octx.fillRect(x - r, y - r, 2 * r, 2 * r); octx.globalCompositeOperation = 'source-over';
  }
  PD.defenceOverlay = function (T, octx, tags, ctx) {
    if (T < 52 || T > 103.8 || ctx.dA < .05) return;
    const cam = ctx.cam, S = ctx.S;
    for (const B of BU) {
      const a = S - B.t0; if (a < 0 || a > 3) continue;
      const c = burstC(B, a, BC), p = cam.project(c); if (!p) continue;
      bloom(octx, p[0], p[1], Math.min(420, (60 + 110 * sat(a * 3)) * B.s * Math.max(.5, Math.min(2.4, 900 / p[2]))), (.7 * Math.exp(-a * 6) + .16 * Math.exp(-a * 1.3)) * ctx.dA);
      const al = sat(a / .15) * (1 - ss(2.2, 3, a)) * ss(110, 220, p[2]);
      if (al > .02) tags.push({ key: 'stop' + B.k, id: 'OWN 0' + (B.k + 1), txt: 'stopped', cls: 'drop', ax: p[0], ay: p[1], x: p[0] + 34, y: p[1] - 58, a: al * ctx.dA, pri: 8 });
    }
    for (const m of SM) {
      const t = S - m.tL; if (t < 0 || t > 5.5) continue;
      posAt(m, headArc(m, t), HP); const p = cam.project(HP); if (!p) continue;
      tags.push({ key: 'sm' + m.k, id: 'SM-6', txt: 'launch', cls: 'coral', ax: p[0], ay: p[1], x: p[0] + 28, y: p[1] - 64, a: sat(t / .4) * (1 - ss(4.6, 5.5, t)) * ctx.dA, pri: 7, leadCol: 'rgba(255,106,61,.8)' });
    }
    const c = ciwsState(T);
    if (T < PD.TJ && S > CIWS.fire[0].s0 - .2 && S < CIWS.fire[1].s1 + .4) {
      ST.ciwsYaw[0] = c.yaw[0]; ST.ciwsPitch[0] = c.pitch[0];
      const Mz = X.ap(PD.shipX(0, ctx.tau), DDA.ciws(ST, 0)), p = cam.project(Mz);
      if (p) tags.push({ key: 'ciws', id: 'CIWS', txt: 'Phalanx', cls: 'coral', ax: p[0], ay: p[1], x: p[0] - 150, y: p[1] - 92, a: sat((S - CIWS.fire[0].s0 + .2) / .3) * (1 - ss(CIWS.fire[0].s1 + .1, CIWS.fire[0].s1 + .5, S)) * ctx.dA, pri: 7, leadCol: 'rgba(255,106,61,.8)' });
    }
  };

  /* ---------- the EO inset: TRK 21's director down the raid's line ---------- */
  const EO_L = [0, 21.8, 28.6];                     // on the bridge roof, ship model coords
  const INS = [51.2, 92.85];
  const EOS = { h: EO_L[1], th0: EO_L[1] / 150000, fl0: 240 / Math.tan(.5 * DEG) };
  EOS.dth = 3.0 / EOS.fl0; EOS.da = 3.6 / EOS.fl0;
  /* the sea as the long lens sees it: rows parallel to the ship's track at even steps of depression, dots along
     each row at even steps of bearing, anchored in the world (they slide aft as the ship steams) */
  function drawEOSea(cam2, S, tau, k) {
    const O = PD.ship(0, tau), f = PD.FWD, rt = PD.STB, h = EOS.h, F = cam2.f;
    // zooming out: every other row and dot of the finer level fades out, and once gone is not visited at all
    const Lc = Math.max(0, Math.log2(EOS.fl0 / cam2.fl)), L = Math.floor(Lc), fo = sat(1 - (Lc - L) * 1.5), st2 = 2 << L, st = fo > 0 ? st2 >> 1 : st2;
    const lx = F[0] * rt[0] + F[2] * rt[2], lw = F[0] * f[0] + F[2] * f[2], el = Math.asin(F[1]), phi = Math.atan2(lw, lx);
    const halfV = Math.atan(135 / cam2.fl) * 1.2, halfH = Math.atan(240 / cam2.fl) * 1.12;
    const thLo = Math.max(EOS.th0, -(el + halfV)), thHi = -(el - halfV); if (thHi <= thLo) return;
    const j0 = Math.max(0, Math.floor((thLo - EOS.th0) / EOS.dth / st) * st), j1 = Math.ceil((thHi - EOS.th0) / EOS.dth);
    const wE = EO_L[2], shift = PD.VS * tau, flk = S * .37;
    for (let j = j0; j <= j1; j += st) {
      const th = EOS.th0 + j * EOS.dth, x = h / Math.tan(th), sj = EOS.da * x;
      const wlo = wE + x * Math.tan(phi - halfH), whi = wE + x * Math.tan(phi + halfH);
      const i0 = (Math.floor((wlo + shift) / sj / st) - 1) * st, i1 = Math.ceil((whi + shift) / sj) + st;
      const rowOdd = (j % st2) !== 0, haze = k * (1 - .55 * ss(2500, 40000, x)) * (.8 + .2 * ss(900, 3000, x));
      // DW.swell along the row by rotation recurrences (the dots' jitter is below the swell's scale)
      const dd = st * sj, c1 = Math.cos(TAU * dd / 144), n1 = Math.sin(TAU * dd / 144), c2 = Math.cos(TAU * dd / 96), n2 = Math.sin(TAU * dd / 96), c3 = Math.cos(TAU * dd / 48), n3 = Math.sin(TAU * dd / 48);
      let ph = TAU * (i0 * sj / 144 + x / 432) + 1.1 * S, s1 = Math.sin(ph), k1 = Math.cos(ph);
      ph = TAU * (i0 * sj / 96 - x / 216) - 1.7 * S; let s2 = Math.sin(ph), k2 = Math.cos(ph);
      ph = TAU * (i0 * sj / 48 + x / 72) + 2.9 * S; let s3 = Math.sin(ph), k3 = Math.cos(ph);
      for (let i = i0; i <= i1; i += st) {
        const y = .85 * s1 + .45 * s2 + .25 * s3;
        let t_ = s1 * c1 + k1 * n1; k1 = k1 * c1 - s1 * n1; s1 = t_;
        t_ = s2 * c2 + k2 * n2; k2 = k2 * c2 - s2 * n2; s2 = t_;
        t_ = s3 * c3 + k3 * n3; k3 = k3 * c3 - s3 * n3; s3 = t_;
        const odd = rowOdd || (((i % st2) + st2) % st2) !== 0, fa = odd ? fo : 1;
        if (fa <= .02) continue;
        const hw = hsh(i, j + 31), hx_ = hsh(i + 7, j);
        const w = (i + (hw - .5) * .85) * sj - shift, xr = h / Math.tan(th + (hx_ - .5) * EOS.dth * .9);
        if (!P3(O[0] + rt[0] * xr + f[0] * w, y, O[2] + rt[2] * xr + f[2] * w)) continue;
        let cr = hsh(i + 5, j + 3) + flk; cr -= Math.floor(cr); cr = cr < .5 ? cr * 2 : 2 - cr * 2;
        // the swell's crests catch the light: long bright streaks along the rows, troughs nearly dark
        const sw = (y + 1.55) / 3.1, b = haze * fa * (.06 + .62 * sw * sw * sw + .1 * cr);
        put(q.x, q.y, 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
      }
    }
  }
  /* haze over the horizon down the raid's line: dots at infinity, thickest just above the sea */
  const HZ = (() => {
    const r = M3.rng(5150), n = 5000, a = new Float32Array(n * 3), az0 = Math.atan2(-PD.U[0], -PD.U[2]);
    for (let i = 0; i < n; i++) { const az = az0 + (r() - .5) * 16 * DEG, el = Math.pow(r(), 2.2) * .5 * DEG; a[i * 3] = Math.sin(az); a[i * 3 + 1] = Math.cos(az); a[i * 3 + 2] = el; }
    return { n, a };
  })();
  function drawHaze(cam2, k) {
    const f = cam2.f, r = cam2.r, u = cam2.u, fl = cam2.fl, A = HZ.a;
    for (let i = 0; i < HZ.n; i++) {
      const el = A[i * 3 + 2], ce = Math.cos(el), dx = A[i * 3] * ce, dy = Math.sin(el), dz = A[i * 3 + 1] * ce;
      const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < .5) continue;
      const sx = 240 + fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc, sy = 135 - fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
      if (sx < 0 || sy < 0 || sx >= 480 || sy >= 270) continue;
      const b = k * .5 * Math.exp(-el / (.1 * DEG));
      put(sx, sy, 1, 206, 212, 200, b);
    }
  }
  /* model-space box of a round (wings and fins out), from its own coarse dots */
  const RB = (() => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const s of DW.RND_LV[2].parts) { const Tp = s.part.xf ? s.part.xf({ wing: 1, fin: 1 }) : X.make(); for (let j = 0; j < s.pts.length; j += 6) { const p = X.ap(Tp, [s.pts[j], s.pts[j + 1], s.pts[j + 2]]); for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[c]); mx[c] = Math.max(mx[c], p[c]); } } } return [mn, mx]; })();
  function boxIn(cam2, Xf) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const sx of [RB[0][0], RB[1][0]]) for (const sy of [RB[0][1], RB[1][1]]) for (const sz of [RB[0][2], RB[1][2]]) { const p = cam2.project(X.ap(Xf, [sx, sy, sz])); if (!p) return null; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }
  const RO = {}, EOW = [0, 0, 0, 0];
  const eoW = (k, tau) => k < 3 ? 1 - ss(PD.tauStop(k) + .45, PD.tauStop(k) + 1.3, tau) : 1;
  /* aim at the raid's centre weighted toward the nearest rounds, zoom to fit every weighted round (a stopped one is
     held ~1 s); the zoom stops at a 3.6 deg field, so late in the run the nearest round owns the frame */
  const DK = [0, 0, 0, 0];
  function eoAim(T, tau, cam2) {
    const eye = X.ap(PD.shipX(0, tau), EO_L), P = [];
    let sx = 0, sy = 0, sz = 0, sw = 0, dmin = 1e9;
    // a fading track counts as farther away, so the weights (and the aim) hand over smoothly
    for (let k = 0; k < 4; k++) { PD.round(k, tau, RO); P.push(RO.p); EOW[k] = eoW(k, tau); DK[k] = V.dist(RO.p, eye) / Math.max(EOW[k], 1e-3); dmin = Math.min(dmin, DK[k]); }
    for (let k = 0; k < 4; k++) { const w = EOW[k] * Math.pow(dmin / DK[k], 2); sx += P[k][0] * w; sy += P[k][1] * w; sz += P[k][2] * w; sw += w; }
    const tg = [sx / sw, sy / sw + .6, sz / sw], f = V.norm(V.sub(tg, eye)), r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
    let nh = 0, nv = 0;
    for (let k = 0; k < 4; k++) {
      if (EOW[k] <= 0) continue;
      const d = V.sub(P[k], eye), z = V.dot(d, f), ax = Math.abs(Math.atan(V.dot(d, r) / z)), ay = Math.abs(Math.atan(V.dot(d, u) / z));
      nh = Math.max(nh, ax * EOW[k]); nv = Math.max(nv, ay * EOW[k]);
    }
    const hwH = Math.min(1.8 * DEG, Math.max(.5 * DEG, nh * 1.5 + .14 * DEG, (nv * 1.5 + .1 * DEG) * 480 / 270));
    cam2.eye = eye; cam2.target = V.mad(eye, f, 1000); cam2.fov = 2 * Math.atan(Math.tan(hwH) * 270 / 480); cam2.near = 1; cam2.update();
    return hwH * 2;
  }
  let insL = '', insR = '';
  PD.defenceInset = function (T, ctx) {
    if (T < INS[0] || T > INS[1]) return false;
    const I = ctx.inset, cam2 = I.cam, pb2 = I.pb, tau = ctx.tau, S = ctx.S;
    const fovH = eoAim(T, tau, cam2);
    DW.sync(cam2, pb2); pb2.clear();
    drawHaze(cam2, 1);
    drawEOSea(cam2, S, tau, 1);
    for (let k = 0; k < 4; k++) {
      PD.round(k, tau, RO); if (RO.a <= .01) continue;
      DW.drawRound(k, T, RO, RO.a);
      // the ramjet seen nose-on: a hot spot the tracker sits on
      if (P3(RO.p[0], RO.p[1], RO.p[2])) { glow(q.x, q.y, 7, 255, 250, 232, .45); glow(q.x, q.y, 2.5, 255, 255, 250, .8); }
    }
    EOV = true; drawAll(T, S, ctx.rate, 1); EOV = false;
    pb2.blit();
    // the director's marks: a gapped cross, corner ticks; dotted boxes on each round's true bounds
    const c2 = pb2.ctx;
    c2.lineWidth = 1; c2.strokeStyle = 'rgba(255,255,255,.5)'; c2.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c2.moveTo(240 + dx * 14, 135 + dy * 14); c2.lineTo(240 + dx * 34, 135 + dy * 34); }
    for (const [x, y, sx, sy] of [[10, 10, 1, 1], [470, 10, -1, 1], [470, 260, -1, -1], [10, 260, 1, -1]]) { c2.moveTo(x + sx * 16, y); c2.lineTo(x, y); c2.lineTo(x, y + sy * 16); }
    c2.stroke();
    c2.font = '500 10px "Geist Mono", Consolas, monospace'; c2.textBaseline = 'alphabetic';
    let nearest = 1e9;
    const bx = [];
    for (let k = 0; k < 4; k++) {
      const since = tau - PD.tauStop(k);
      if ((k < 3 && since > 2.2) || (k === 3 && since >= 0)) continue;
      PD.round(k, tau, RO); if (since < 0) nearest = Math.min(nearest, V.dist(RO.p, cam2.eye));
      const b = boxIn(cam2, DW.roundX(k, RO)); if (!b) continue;
      const pad = 4, x0 = Math.round(b[0] - pad) + .5, y0 = Math.round(b[1] - pad) + .5, x1 = Math.round(b[2] + pad) + .5, y1 = Math.round(b[3] + pad) + .5;
      if (x1 < 0 || x0 > 480 || y1 < 0 || y0 > 270) continue;
      const dead = since >= 0;
      bx.push({ k, x0, y0, x1, y1, dead, al: dead ? 1 - ss(1.5, 2.2, since) : 1 });
    }
    // labels: above the box if free, else below, else stacked higher; never over another box or label
    const taken = bx.map(b => [b.x0 - 2, b.y0 - 3, b.x1 + 2, b.y1 + 3]);
    const hit = (r) => taken.some(t => r[0] < t[2] && t[0] < r[2] && r[1] < t[3] && t[1] < r[3]);
    bx.sort((a, b) => a.x0 - b.x0);
    for (const b of bx) {
      const col = b.dead ? '255,106,61' : '255,255,255';
      c2.globalAlpha = b.al; c2.strokeStyle = `rgba(${col},.85)`; c2.setLineDash([2, 2]); c2.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); c2.setLineDash([]);
      const cl = Math.min(5, (b.x1 - b.x0) * .4);
      c2.strokeStyle = `rgba(${col},1)`; c2.beginPath();
      for (const [x, y, sx, sy] of [[b.x0, b.y0, 1, 1], [b.x1, b.y0, -1, 1], [b.x1, b.y1, -1, -1], [b.x0, b.y1, 1, -1]]) { c2.moveTo(x + sx * cl, y); c2.lineTo(x, y); c2.lineTo(x, y + sy * cl); }
      c2.stroke();
      const lab = 'OWN 0' + (b.k + 1) + (b.dead ? ' · STOPPED' : ''), w = c2.measureText(lab).width, lx = Math.max(4, Math.min(b.x0 - .5, 476 - w));
      let ly = null;
      for (const cand of [b.y0 - 5, b.y1 + 12, b.y0 - 17, b.y1 + 24, b.y0 - 29]) { const r = [lx - 1, cand - 9, lx + w + 1, cand + 2]; if (cand > 10 && cand < 266 && !hit(r)) { ly = cand; taken.push(r); break; } }
      if (ly !== null) { c2.fillStyle = b.dead ? '#FF6A3D' : '#C6F432'; c2.fillText(lab, lx, ly); }
      c2.globalAlpha = 1;
    }
    DW.sync(ctx.cam, ctx.pb);
    const l = `EO · TRK 21 · NFOV ${(fovH / DEG).toFixed(2)}°`, r = nearest < 1e8 ? `${(nearest / 1000).toFixed(1)} km` : '';
    if (l !== insL) { insL = l; I.label.textContent = l; }
    if (r !== insR) { insR = r; I.right.textContent = r; }
    return true;
  };

  /* ---------- sound: synthesized, fired only while playing forward (the film adds these to its cues) ---------- */
  const SFX = STAGE.SFX;
  const launch = () => { SFX.noise(4.5, 240, .8, .07, .15); SFX.noise(1.6, 1300, .5, .025, .05); SFX.tone(58, 38, 3, 'sine', .05); };
  const boom = big => { SFX.noise(.22, 4600, .5, big ? .12 : .08, .002); SFX.noise(big ? 3.2 : 2.2, 170, .9, big ? .2 : .13, .01); SFX.tone(110, 36, big ? 1.6 : 1.1, 'sine', big ? .1 : .07); if (big) SFX.noise(3, 900, .6, .04, .4, .35); };
  const brrt = dur => { SFX.tone(75, 72, dur, 'sawtooth', .028); SFX.tone(150, 146, dur, 'square', .008); SFX.noise(dur, 2200, .7, .035, .02); };
  PD.defenceCues = [
    [SM[0].tL, launch], [SM[1].tL, launch],
    [PD.EV.stop1, () => boom(false)], [PD.EV.stop2, () => boom(false)],
    [CIWS.slew[0], () => SFX.tone(420, 380, .5, 'square', .006)],
    [CIWS.fire[0].s0, () => brrt(CIWS.fire[0].s1 - CIWS.fire[0].s0)],
    [PD.EV.burst3, () => boom(true)],
    [CIWS.fire[1].s0, () => brrt(PD.filmOf(CIWS.fire[1].s1) - CIWS.fire[1].s0)],
  ];
})();
