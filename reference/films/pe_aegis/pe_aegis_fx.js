/* AEGIS: the fighting, drawn into the hooks pe_aegis_film.js calls every frame after the dot world and the scope,
   before the blit (launchFx, interceptFx, ciwsFx, hitFx), then fxOverlay after it (blooms, tags); PE.fxCues are the
   fight's sounds.

   The Mk 41 launches: the hatch swings open, the cell flashes, the exhaust rolls over the deck, the SM-6 climbs out
   of it on a white-hot head with a lime streak, and its smoke hangs along the climb and drifts aft (the ship steams
   out of it). The kills far out on the horizon: a flash, sparks, debris into the sea, a smoke ball; on the scope the
   track's returns flare and scatter, tagged "stopped". S5 misses the weaving round and self-destructs past it. The
   last round is the aft Phalanx's: the forward mount sits behind the SPY deckhouse from the whole close-in camera,
   so the aft one takes it. It slews, spins up, its own radar reaches out as a dense cone of dots, a stream of tracer
   dots meets the round ~480 m out and its debris rains into the sea short of the bow.
   Spectacle only: the flights are stage A's tables, the bursts are templates at the stop events. Every particle is
   analytic in its age and a seeded index, so render(T) stays a pure function of T; nothing of the fight draws
   before 60.5 or after 134. */
(function () {
  'use strict';
  const PE = window.PE, DW = PE.DW, A = PE.A;
  const { V, R, X, E } = M3;
  const { DEG, TAU, LIME, WH, CORAL, hsh, gH } = PE;
  const sat = E.sat, ss = E.ss, mix = E.mix, G2 = 4.905;
  const q = DW.q, P3 = DW.P3, put = DW.put, putO = DW.putO, glow = DW.glow, occ = DW.occ;
  const T_ON = 60.5, T_OFF = 134;
  const live = T => T > T_ON && T < T_OFF;
  // the air past the ship: it steams at 8 m/s into a light breeze off the starboard bow, so smoke drifts aft
  const WIND = [-1.4, 0, -7.4];
  const GREY = [212, 216, 206];
  const SH = PE.SHOTS, RAID = PE.RAID;

  /* gaussian offsets, tabled so the hot loops index instead of calling log / cos */
  const GN = 8192, GM = GN - 1, GT = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GT[i] = gH(i, 7331);

  /* ================= the launches ================= */
  /* smoke puffs laid every DS metres of the flight, each with the moment the head passed it (the inverse of stage A's
     arc-length table), so a puff's age is exact at any T */
  const DS = 7, TPa = [0, 0, 0];
  for (const s of SH) {
    const Lend = s.miss ? PE.shotSl(s, s.tEnd) : s.L, n = Math.floor(Lend / DS);
    const PX = new Float32Array(n), PY = new Float32Array(n), PZ = new Float32Array(n), PB = new Float64Array(n);
    let i = 0;
    for (let j = 0; j < n; j++) {
      const a = (j + 1) * DS; let t;
      if (a <= s.L) {
        while (i < s.NT - 1 && s.ST[i + 1] * s.vmax < a) i++;
        const a0 = s.ST[i] * s.vmax, a1 = s.ST[i + 1] * s.vmax;
        t = s.tL + (i + E.clamp((a - a0) / (a1 - a0 || 1), 0, 1)) / s.NT * s.dur;
      } else t = s.tI + (a - s.L) / s.vEnd;
      PE.shotPath(s, a, TPa); PX[j] = TPa[0]; PY[j] = TPa[1]; PZ[j] = TPa[2]; PB[j] = t;
    }
    s.fx = { n, PX, PY, PZ, PB, seed: s.cell * 131 + 7 };
  }
  /* the trail: thick off the Mk 72 booster (first 6 s), thinner off the sustainer, a wisp in the glide. The fresh
     trail is white-hot behind the head, lime for a moment (the streak), then pales to smoke that spreads and drifts */
  function drawTrail(s, T, k) {
    const F = s.fx, PB = F.PB, PX = F.PX, PY = F.PY, PZ = F.PZ, sd = F.seed, cam = DW.cam;
    const e0 = cam.eye[0], e1 = cam.eye[1], e2 = cam.eye[2], f0 = cam.f[0], f1 = cam.f[1], f2 = cam.f[2], r0 = cam.r[0], r1 = cam.r[1], r2 = cam.r[2], u0 = cam.u[0], u1 = cam.u[1], u2 = cam.u[2];
    const fl = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], near = cam.near;
    for (let j = 0; j < F.n; j++) {
      const born = PB[j]; if (born > T) break;
      const age = T - born, bt = born - s.tL;
      let np, B, tauS, end, spr;
      // the booster's column off the deck is the thick, bright one (the first ~1.3 km of the climb); the exhaust
      // blasts its first tens of metres wide
      if (bt < 6) { const col = j < 190; np = col ? (age < 10 ? 8 : 5) : 3; B = col ? .85 : .6; tauS = 20; end = 30; spr = (col ? 2.5 : 1.6) + 3.5 * sat(1 - j / 10); }
      else if (bt < 11) { np = 2; B = .34; tauS = 9; end = 17; spr = 1.1; }
      else { np = 1; B = .2; tauS = 4.5; end = 8.5; spr = .7; }
      if (age > end) continue;
      const env = k * B * Math.exp(-age / tauS) * (1 - ss(end * .6, end, age));
      if (env < .012) continue;
      const r = spr * (.25 + 1.1 * Math.sqrt(age) + .12 * age);
      const bx = PX[j] + WIND[0] * age, by = PY[j] + .5 * age, bz = PZ[j] + WIND[2] * age;
      // one projection per puff; its dots are offsets a few metres across, placed on screen at the puff's scale
      const dx = bx - e0, dy = by - e1, dz = bz - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near + 3 * r) continue;
      // far out the 7 m puffs land < 2 px apart: every other one (every fourth past 9 km) carries the trail
      // (never the fresh streak behind the head)
      const thin = age < 1.2 ? 0 : zc > 9000 ? 3 : zc > 4500 ? 1 : 0;
      if (j & thin) continue;
      const s0 = fl / zc, sx = cx + (dx * r0 + dy * r1 + dz * r2) * s0, sy = cy - (dx * u0 + dy * u1 + dz * u2) * s0, rp = 3 * r * s0 + 2;
      if (sx < -rp || sy < -rp || sx > 1920 + rp || sy > 1080 + rp) continue;
      // far puffs land densely on screen anyway: fewer dots each; near ones spread wide: more, within a bound
      if (zc > 2600) np = Math.max(1, Math.round(np * 2600 / zc));
      else if (bt < 6 && r * s0 > 10) np = Math.round(np * Math.min(j < 190 ? 2 : 1.5, r * s0 / 10));
      const w = age < .3 ? Math.exp(-age * 16) : 0, l = age < 1.5 ? (1 - w) * Math.exp(-age * 3.4) : 0, g = 1 - w - l;
      const cr = 255 * w + LIME[0] * l + GREY[0] * g, cg = 250 * w + LIME[1] * l + GREY[1] * g, cb = 236 * w + LIME[2] * l + GREY[2] * g;
      const rs = r * s0, sz = zc < 1300 || (w + l > .3 && zc < 9000) ? 2 : 1;
      // smoke drifting right past the lens is a thin haze, not a scatter of bright specks
      const bb = env * (1 + 2.4 * (w + l)) * (rs > 45 ? 45 / rs : 1) * (thin ? 1.25 : 1);
      if (bb < .02) continue;
      for (let m = 0; m < np; m++) {
        const g0 = (sd + j * 5 + m * 1733) & GM, ox = GT[g0], oy = GT[(g0 + 1) & GM] * .8, oz = GT[(g0 + 2) & GM];
        if (by + oy * r < .5) continue;
        const px = sx + (ox * r0 + oy * r1 + oz * r2) * rs, py = sy - (ox * u0 + oy * u1 + oz * u2) * rs;
        if (occ(px, py, zc)) continue;
        const b = bb * (.6 + .8 * ((g0 * .618034) % 1));
        put(px, py, sz, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
  }
  /* the head: a white-hot point in a lime halo, the motor's flame behind it (long on the boost, short on the
     sustainer, none in the glide) */
  const HP = [0, 0, 0], HQ = [0, 0, 0];
  function drawHead(s, T, k) {
    if (T < s.tL || T > s.tEnd) return;
    const t = T - s.tL;
    PE.shotAt(s, T, HP); PE.shotAt(s, Math.max(s.tL, T - .02), HQ);
    let dx = HP[0] - HQ[0], dy = HP[1] - HQ[1], dz = HP[2] - HQ[2]; const dl = Math.hypot(dx, dy, dz);
    if (dl < 1e-4) { dx = 0; dy = 1; dz = 0; } else { dx /= dl; dy /= dl; dz /= dl; }
    const burn = t < 6 ? 1 : t < 11 ? .55 : .15, Lf = t < 6 ? 24 : t < 11 ? 10 : 3, fr = Math.floor(T * 60);
    for (let j = 0; j < 56; j++) {
      const sg = Lf * Math.pow(hsh(j + 31 * s.cell, fr), 1.7), rad = (.22 + .07 * sg) * .6;
      if (!P3(HP[0] - dx * sg + GT[(j * 3 + fr) & GM] * rad, HP[1] - dy * sg + GT[(j * 3 + fr + 1) & GM] * rad, HP[2] - dz * sg + GT[(j * 3 + fr + 2) & GM] * rad) || occ(q.x, q.y, q.z)) continue;
      const h = 1 - sg / Lf, b = k * burn * (.35 + .9 * h);
      put(q.x, q.y, q.z < 800 ? 2 : 1, 255, 205 + 50 * h, 150 + 100 * h * h, b > 1 ? 1 : b);
    }
    if (P3(HP[0], HP[1], HP[2]) && !occ(q.x, q.y, q.z)) {
      const z = q.z, sx = q.x, sy = q.y;
      glow(sx, sy, Math.min(56, 4 + 6000 * (.35 + burn) / z), LIME[0], LIME[1], LIME[2], .26 * k * (.45 + burn));
      glow(sx, sy, Math.min(16, 2 + 1300 / z), 255, 250, 232, .75 * k);
      put(sx, sy, z < 3500 ? 3 : 2, 255, 253, 242, k);
    }
  }
  /* Mk 41 hatch: hinged outboard, it swings up ~105° before the launch and shuts a few seconds after (drawn only when
     the lens is near enough to see a 0.6 m plate) */
  function drawHatch(cell, f, k) {
    const c = A.vls(cell);
    if (!P3(c[0], c[1], c[2])) return;
    const pxm = DW.cam.fl / q.z; if (pxm < 3.5) return;
    const kk = cell < 32 ? cell : cell - 32, hs = (kk % 8) & 1 ? 1 : -1, h = .3, y0 = c[1] + .02, hx = c[0] + hs * h;
    const ang = -hs * f * 105 * DEG, ca = Math.cos(ang), sa = Math.sin(ang);
    const n = Math.max(3, Math.min(12, Math.round(.6 * pxm / 2)));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const lx = c[0] - h + (i + .5) / n * 2 * h - hx, z = c[2] - h + (j + .5) / n * 2 * h;
      if (P3(hx + lx * ca, y0 + lx * sa, z)) putO(q.x, q.y, 1, WH[0], WH[1], WH[2], .85 * k);
    }
  }
  /* the exhaust cloud a hot launch throws over the deck: puffs out of the cell and its uptake, rolling out, rising,
     drifting aft */
  const ND = 380, DK = { t: new Float32Array(ND), vx: new Float32Array(ND), vy: new Float32Array(ND), vz: new Float32Array(ND), kd: new Float32Array(ND), life: new Float32Array(ND), br: new Float32Array(ND) };
  { const r = M3.rng(6101); for (let i = 0; i < ND; i++) { const a = r() * TAU, sp = 3 + 22 * Math.pow(r(), 1.4); DK.t[i] = 1.6 * Math.pow(r(), 1.8); DK.vx[i] = Math.cos(a) * sp; DK.vz[i] = Math.sin(a) * sp * .8; DK.vy[i] = 2 + 16 * r(); DK.kd[i] = .45 + .8 * r(); DK.life[i] = 6 + 13 * r(); DK.br[i] = .55 + .45 * r(); } }
  function drawLaunch(s, T, k) {
    const a = T - s.tL; if (a < -1.2 || a > 18) return;
    const f = ss(-.9, -.35, a) * (1 - ss(3.4, 4.4, a));
    if (f > 0) drawHatch(s.cell, f, k);
    if (a < 0) return;
    const P0 = s.P0;
    if (a < 1.3 && P3(P0[0], P0[1] + 1.2, P0[2])) {
      const w = 1 - a / 1.3, z = q.z;
      glow(q.x, q.y, E.clamp(22 * DW.cam.fl / z, 7, 120) * (.55 + .45 * w), 255, 214, 172, .8 * k * w * w);
      put(q.x, q.y, z < 1500 ? 4 : 3, 255, 250, 238, k * Math.min(1, w * 1.5));
    }
    for (let i = 0; i < ND; i++) {
      const b = a - DK.t[i]; if (b < 0 || b > DK.life[i]) continue;
      const kd = DK.kd[i], dd = (1 - Math.exp(-kd * b)) / kd;
      if (!P3(P0[0] + DK.vx[i] * dd + WIND[0] * b, P0[1] + DK.vy[i] * dd + 1.4 * b, P0[2] + DK.vz[i] * dd + WIND[2] * b) || occ(q.x, q.y, q.z)) continue;
      const hot = Math.exp(-b * 3), life = 1 - b / DK.life[i], al = DK.br[i] * life * Math.sqrt(life) * (.5 + .7 * hot) * k;
      put(q.x, q.y, q.z < 2600 ? 2 : 1, GREY[0] + (255 - GREY[0]) * hot, GREY[1] + (228 - GREY[1]) * hot, GREY[2] + (184 - GREY[2]) * hot, al > 1 ? 1 : al);
    }
  }
  PE.launchFx = function (T, ctx) {
    if (!live(T)) return;
    for (const s of SH) {
      if (T < s.tL - 1.2) continue;
      drawLaunch(s, T, 1);
      if (T >= s.tL) { drawTrail(s, T, 1); drawHead(s, T, 1); }
    }
  };

  /* ================= bursts: the kills, S5's self-destruct, round 45 ================= */
  /* debris: fragments thrown out of the burst carrying part of the momentum (mom, m/s), under drag and gravity;
     each knows when it reaches the sea. Heavy pieces (low drag) carry far; every sixth one burns (a brand). */
  function mkBurst(o) {
    const r = M3.rng(o.seed), n = o.nF, F = new Float32Array(n * 6), AW = new Float32Array(n), sc = o.sc, p = o.p;
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), f = .08 + .55 * r(), sp = (30 + 330 * Math.pow(r(), 1.4)) * sc;
      const heavy = o.heavy && i % 7 === 0;
      const vx = o.mom[0] * f + c * Math.cos(th) * sp, vy = o.mom[1] * f + u * sp * .75 + 16 * sc, vz = o.mom[2] * f + c * Math.sin(th) * sp;
      const kd = heavy ? .45 + .35 * r() : 1.2 + 2.6 * r();
      F[i * 6] = vx; F[i * 6 + 1] = vy; F[i * 6 + 2] = vz; F[i * 6 + 3] = kd; F[i * 6 + 4] = r(); F[i * 6 + 5] = i % 6 === 0 ? 1 : 0;
      const yAt = a => p[1] + vy * (1 - Math.exp(-kd * a)) / kd - G2 * a * a;
      let lo = 0, hi = 14; for (let it = 0; it < 40; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
      AW[i] = lo;
    }
    const ns = o.ns, SP = new Float32Array(ns * 5);
    for (let i = 0; i < ns; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), sp = (160 + 320 * r()) * sc;
      SP[i * 5] = c * Math.cos(th) * sp + o.mom[0] * .3; SP[i * 5 + 1] = u * sp * .8 + 25 * sc + o.mom[1] * .3; SP[i * 5 + 2] = c * Math.sin(th) * sp + o.mom[2] * .3;
      SP[i * 5 + 3] = 1.6 + 1.8 * r(); SP[i * 5 + 4] = .4 + .7 * r();
    }
    return Object.assign({ F, AW, SP, n, ns, rot: R.mul(R.y(o.seed * .37), R.x(o.seed * .11)) }, o);
  }
  /* the fireball: a cluster of lobes (not a ball), dots filling each toward its skin (after pd_engagement) */
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
  /* the smoke ball a burst leaves: it grows, drifts and thins */
  const NQ = 220, SMK = new Float32Array(NQ * 5);
  { const r = M3.rng(5517); for (let i = 0; i < NQ; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u), qq = Math.cbrt(r()); SMK[i * 5] = Math.cos(a) * h * qq; SMK[i * 5 + 1] = u * qq * .7; SMK[i * 5 + 2] = Math.sin(a) * h * qq; SMK[i * 5 + 3] = .55 + .45 * r(); SMK[i * 5 + 4] = .45 + .55 * r(); } }

  const BURSTS = [];
  const unitVel = k => V.mul(PE.roundVel(k), 1 / PE.VR);
  /* the interceptor kills, out at the horizon: the SM-6 comes down on the round, the debris carries both */
  for (const s of SH) {
    if (s.miss) continue;
    const k = s.rnd, rd = unitVel(k), mom = V.add(V.mul(rd, 700 * .5), V.mul(s.tan, s.vEnd * .45));
    BURSTS.push(mkBurst({ kind: 'kill', k, t0: s.tI, p: s.P3.slice(), mom, sc: 1.25, nF: 240, ns: 90, seed: 900 + k * 17, heavy: false, fire: 1.6, smoke: 55, life: 9 }));
  }
  /* S5 self-destructs where its flight ends, a small puff high over the sea */
  const S5 = SH.find(s => s.miss);
  let S5D = null;
  if (S5) {
    const pE = PE.shotAt(S5, S5.tEnd), dE = V.norm(V.sub(pE, PE.shotAt(S5, S5.tEnd - .05)));
    S5D = mkBurst({ kind: 'destruct', k: S5.rnd, t0: S5.tEnd, p: pE, mom: V.mul(dE, S5.vEnd * .35), sc: .8, nF: 160, ns: 80, seed: 977, heavy: false, fire: 1.1, smoke: 40, life: 7 });
    BURSTS.push(S5D);
  }
  /* round 45, stopped by the Phalanx ~480 m out: the round's own momentum carries its debris on toward the ship */
  const R45 = 4, T_KILL = PE.T_CIWS;
  const B45 = mkBurst({ kind: 'ciws', k: R45, t0: T_KILL, p: PE.roundTruth(R45, T_KILL), mom: V.mul(unitVel(R45), 680), sc: 1.1, nF: 360, ns: 140, seed: 4545, heavy: true, fire: 1.25, smoke: 34, life: 10, big: true });
  BURSTS.push(B45);
  PE.BURSTS = BURSTS;

  const BC = [0, 0, 0];
  /* the fireball's centre runs on with the momentum a little, then drifts with the wind and rises */
  function burstC(B, a, out) {
    const m = Math.hypot(B.mom[0], B.mom[1], B.mom[2]) || 1, d = m / 3.4 * (1 - Math.exp(-3.4 * a)) * (B.big ? .12 : .05);
    out[0] = B.p[0] + B.mom[0] / m * d + WIND[0] * a; out[1] = Math.max(B.p[1] * .6, B.p[1] + B.mom[1] / m * d) + 1.4 * a; out[2] = B.p[2] + B.mom[2] / m * d + WIND[2] * a;
    return out;
  }
  const HOTC = [255, 246, 228], MIDC = [255, 150, 96];
  function drawBurst(B, T, k) {
    const a = T - B.t0; if (a < 0 || a > B.life) return;
    const c = burstC(B, a, BC), cx = c[0], cy = c[1], cz = c[2], M = B.rot, sc = B.fire;
    // the first instant: a white core
    if (a < .22 && P3(B.p[0], B.p[1], B.p[2])) {
      const w = 1 - a / .22;
      put(q.x, q.y, B.big ? 7 : 5, 255, 255, 250, k * w);
      glow(q.x, q.y, Math.min(B.big ? 190 : 120, 8 + 26000 * sc / q.z) * (.6 + .4 * w), 255, 236, 214, .9 * k * w);
    }
    // the fireball: white-hot lobes with warm skins, cooling from the outside in, then a thinning grey puff
    const Rb = sc * (13 * (1 - Math.exp(-a * 7)) + 3.6 * a), fade = 1 - ss(B.life * .35, B.life * .6, a), SA = SHELL.a, thin = .45 * ss(1, 3, a);
    if (fade > 0 && P3(cx, cy, cz)) {
      // a fireball a few tens of px across is filled by a third of the template
      const pxm = DW.cam.fl / q.z, stp = Rb * pxm > 70 ? 1 : Rb * pxm > 30 ? 2 : 3;
      if (Rb * pxm > 1.5) for (let i = 0; i < SHELL.n; i += stp) {
        const o = i * 5, rr = SA[o + 3], rn = SA[o + 4];
        if (rn < thin) continue;
        const ux = SA[o], uy = SA[o + 1], uz = SA[o + 2];
        const y = cy + (M[3] * ux + M[4] * uy + M[5] * uz) * Rb; if (y < .3) continue;
        if (!P3(cx + (M[0] * ux + M[1] * uy + M[2] * uz) * Rb, y, cz + (M[6] * ux + M[7] * uy + M[8] * uz) * Rb) || occ(q.x, q.y, q.z)) continue;
        const heat = Math.exp(-a * (.8 + 1.5 * rr) * (.65 + .7 * ((rn * 7.31) % 1)));
        let cr, cg, cb, al;
        if (heat > .5) { const u = (heat - .5) / .5, uu = u * u; cr = 255; cg = MIDC[1] + (HOTC[1] - MIDC[1]) * uu; cb = MIDC[2] + (HOTC[2] - MIDC[2]) * uu; al = .75 + .6 * u; }
        else if (heat > .16) { const u = (heat - .16) / .34; cr = GREY[0] + (MIDC[0] - GREY[0]) * u; cg = GREY[1] + (MIDC[1] - GREY[1]) * u; cb = GREY[2] + (MIDC[2] - GREY[2]) * u; al = .34 + .5 * u; }
        else { cr = GREY[0]; cg = GREY[1]; cb = GREY[2]; al = .34 * (.6 + .6 * rn); }
        const b = k * fade * al * (.35 + 1.1 * rn * rn);
        put(q.x, q.y, q.z < 80 ? 3 : q.z < 1600 && (heat > .45 || rn > .7) ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
    // the smoke ball it leaves
    if (a > .4) {
      const g = B.smoke * (.3 + .7 * (1 - Math.exp(-a * .9))) + 1.5 * a, f = k * .5 * sat((a - .4) / 1.2) * (1 - ss(B.life * .45, B.life, a));
      if (f > .01) for (let i = 0; i < NQ; i++) {
        const o = i * 5, y = cy + SMK[o + 1] * g * SMK[o + 3]; if (y < .5) continue;
        if (!P3(cx + SMK[o] * g * SMK[o + 3], y, cz + SMK[o + 2] * g * SMK[o + 3]) || occ(q.x, q.y, q.z)) continue;
        put(q.x, q.y, q.z < 700 ? 2 : 1, GREY[0], GREY[1], GREY[2], f * SMK[o + 4]);
      }
    }
    // sparks: white streaks going amber as they slow
    if (a < 1.2) for (let i = 0; i < B.ns; i++) {
      const o = i * 5, life = B.SP[o + 4]; if (a > life) continue;
      const kd = B.SP[o + 3], vx = B.SP[o], vy = B.SP[o + 1], vz = B.SP[o + 2], p = B.p, w = 1 - a / life;
      for (let m = 0; m < 5; m++) {
        const t2 = Math.max(0, a - m * .014), h = (1 - Math.exp(-kd * t2)) / kd, y = p[1] + vy * h - G2 * t2 * t2; if (y < 0) break;
        if (!P3(p[0] + vx * h, y, p[2] + vz * h)) continue;
        const hw = Math.min(1, 1.3 * w) * (1 - m * .17);
        put(q.x, q.y, q.z < 1500 && m < 2 ? 2 : 1, 255, 160 + 90 * w, 100 + 130 * w * w, k * hw);
      }
    }
    // fragments in the air: bright specks, the brands trailing dots
    const F = B.F, AW = B.AW, p = B.p;
    for (let i = 0; i < B.n; i++) {
      const aw = AW[i]; if (a >= aw) continue;
      const o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], rn = F[o + 4], brand = F[o + 5];
      const h = (1 - Math.exp(-kd * a)) / kd;
      if (brand) for (let m = 1; m < 10; m++) {
        const t2 = a - m * .035; if (t2 < 0) break;
        const h2 = (1 - Math.exp(-kd * t2)) / kd, u = m / 10;
        if (P3(p[0] + vx * h2, p[1] + vy * h2 - G2 * t2 * t2 + m * .12, p[2] + vz * h2)) put(q.x, q.y, 1, 255 - 60 * u, 150 + 50 * u, 100 + 100 * u, k * .8 * (1 - u) * (1 - .5 * a / aw));
      }
      if (!P3(p[0] + vx * h, p[1] + vy * h - G2 * a * a, p[2] + vz * h) || occ(q.x, q.y, q.z)) continue;
      const hot = Math.exp(-a * 1.3), b = k * (brand ? 1 : .55 + .4 * rn) * (.55 + .45 * hot);
      put(q.x, q.y, q.z < 1000 && (brand || rn > .6) ? 2 : 1, 255, brand ? 200 : 236 + 19 * hot, brand ? 150 : 226 + 29 * hot, b > 1 ? 1 : b);
    }
  }
  /* where the debris meets the sea: a white column and a ring per fragment, a heave of spray under the burst */
  function drawSplashes(B, T, k) {
    const a = T - B.t0; if (a < 0 || a > B.life) return;
    const F = B.F, AW = B.AW, p = B.p, hs = B.big ? 1.6 : 1;
    // far out a splash is a pixel or two: its column top only
    const far = !P3(p[0], p[1], p[2]) || DW.cam.fl / q.z < .3, nm = far ? 1 : 5;
    for (let i = 0; i < B.n; i++) {
      const w = a - AW[i]; if (w < 0 || w > 1.5) continue;
      const o = i * 6, kd = F[o + 3], rn = F[o + 4], h = (1 - Math.exp(-kd * AW[i])) / kd, x = p[0] + F[o] * h, z = p[2] + F[o + 2] * h, al = k * .85 * (1 - w / 1.5);
      const heavy = kd < .9 ? 2.2 : 1;
      for (let m = far ? 2 : 0; m < nm + (far ? 2 : 0); m++) {
        const vs = (3 + m * 2.4 + rn * 3) * hs * heavy, yy = vs * w - G2 * w * w; if (yy < 0) continue;
        if (P3(x + (m - 2) * .35 * (1 + w) * heavy, yy, z + GT[(i * 5 + m) & GM] * .5) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 900 ? 2 : 1, WH[0], WH[1], WH[2], al);
      }
      if (!far && w < .7) for (let m = 0; m < 8; m++) { const th = m / 8 * TAU + rn * 3, rr = (1 + 7 * w) * heavy; if (P3(x + Math.cos(th) * rr, .2, z + Math.sin(th) * rr) && !occ(q.x, q.y, q.z)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], al * .6); }
    }
    // the sea heaves up under a low burst: a spray dome that rises and falls back
    if (p[1] < 40 && a < 3) {
      const R0 = (B.big ? 26 : 34) * B.sc, al = k * .75 * (1 - a / 3);
      for (let i = 0, n = far ? 70 : 160; i < n; i++) {
        const th = hsh(i, B.seed) * TAU, rr = R0 * Math.sqrt(hsh(i, B.seed + 1)) * (.4 + .6 * sat(a * 2)), vs = (8 + 22 * hsh(i, B.seed + 2)) * (B.big ? 1.2 : 1.5);
        const yy = vs * a - G2 * a * a; if (yy < 0) continue;
        if (P3(p[0] + Math.cos(th) * rr, yy, p[2] + Math.sin(th) * rr) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 900 ? 2 : 1, WH[0], WH[1], WH[2], al * (.5 + .5 * hsh(i, B.seed + 3)));
      }
    }
  }

  /* ---------- on the scope: a stopped track's returns flare, then scatter across the picture and cool out ---------- */
  /* the returns burst out as a dome of dots (scope scale: sized to the view, so a kill 15 km out reads like one
     at 500 m), each a short streak along its flight, sagging back to the picture's sea as they cool */
  const NSC = 130, SCT = new Float32Array(NSC * 5);
  { const r = M3.rng(7707); for (let i = 0; i < NSC; i++) { const u = .08 + .92 * r(), th = r() * TAU, c = Math.sqrt(1 - u * u); SCT[i * 5] = c * Math.cos(th); SCT[i * 5 + 1] = u * .85; SCT[i * 5 + 2] = c * Math.sin(th); SCT[i * 5 + 3] = .35 + .65 * Math.pow(r(), .6); SCT[i * 5 + 4] = .5 + .5 * r(); } }
  const STOP_P = RAID.map((qd, k) => { const tr = PE.track(k, qd.tStop); return tr ? tr.p.slice() : PE.roundTruth(k, qd.tStop); });
  PE.STOP_P = STOP_P;
  function drawScatter(k, T, kA) {
    const qd = RAID[k], a = T - qd.tStop; if (a < 0 || a > 2.8) return;
    scatterAt(STOP_P[k], 20, a, kA, k * 1.3, CORAL, 1);
  }
  function scatterAt(p, y0, a, kA, rot, C, size) {
    const d = V.dist(DW.eye, p), Rs = E.clamp(d * .065, 30, 1100) * size;
    if (a < .7 && P3(p[0], y0, p[2])) {
      const w = 1 - a / .7;
      put(q.x, q.y, 6, 255, 240, 226, kA * w);
      glow(q.x, q.y, (10 + 30 * w) * size, C[0], Math.min(255, C[1] + 40), Math.min(255, C[2] + 40), .6 * kA * w);
    }
    const fade = (1 - ss(1.2, 2.8, a)) * kA, hot = Math.exp(-a * 3.5), ca = Math.cos(rot), sa = Math.sin(rot);
    const cr = C[0] + (255 - C[0]) * hot, cg = C[1] + (242 - C[1]) * hot, cb = C[2] + (228 - C[2]) * hot;
    for (let i = 0; i < NSC; i++) {
      const o = i * 5, dx = SCT[o] * ca - SCT[o + 2] * sa, dz = SCT[o] * sa + SCT[o + 2] * ca, dy = SCT[o + 1], R1 = Rs * SCT[o + 3], b = fade * SCT[o + 4];
      for (let m = 0; m < 3; m++) {
        const t = Math.max(0, a - m * .045), rr = R1 * (1 - Math.exp(-t * 2.6)), y = y0 + dy * rr - Rs * .32 * t * t;
        if (y < y0 - 2) break;
        if (!P3(p[0] + dx * rr, y, p[2] + dz * rr)) continue;
        putO(q.x, q.y, m ? 1 : 2, cr, cg, cb, b * (1 - m * .3));
      }
    }
  }

  PE.interceptFx = function (T, ctx) {
    if (!live(T)) return;
    for (const B of BURSTS) if (B !== B45) drawBurst(B, T, 1);
    for (let k = 0; k < RAID.length; k++) if (k !== R45) drawScatter(k, T, 1);
    // S5's own track ends in a smaller lime burst of returns where it destructs
    if (S5D && T > S5D.t0 && T < S5D.t0 + 2.8) scatterAt(S5D.p, S5D.p[1], T - S5D.t0, .85, 2.2, LIME, .55);
  };

  /* ================= the aft Phalanx ================= */
  const MI = 1, CIWS_P = [0, 13.9, -47.5], CIWS_TR = [0, 1.55, 0], MZ = [0, 1.36, 2.12], RADOME = [0, 2.3, .25];
  const REST_Y = Math.PI, REST_P = .35;
  const CT = { slew0: 95.4, slew1: 96.9, spin0: 96.9, spin1: 97.7, fire0: PE.T_CIWS0, fire1: T_KILL + .03, spinD: 101.15, spinE: 102.9, back0: 103.4, back1: 105.8 };
  const CW = { rate: 75, v0: 1100, kd: .3 };
  const TRL = CW.v0 / CW.kd;
  const tof = r => { const x = CW.kd * r / CW.v0; return x < .97 ? -Math.log(1 - x) / CW.kd : 12; };
  const STA = { ciwsYaw: [0, REST_Y], ciwsPitch: [REST_P, REST_P] }, RT = [0, 0, 0];
  const mountX = (yaw, pitch) => X.mul(X.make(R.y(yaw), CIWS_P), X.pivotX(CIWS_TR, -pitch));
  /* the gun's lead on round 45 for a round leaving at tk: time of flight solved by bisection (the round closes at
     700 m/s, so a fixed-point iteration would oscillate); after the kill it holds on the kill point */
  function aimAt(tk, yaw0, pitch0) {
    let yaw = yaw0, pitch = pitch0, M = null, D = [0, 0, 1], tf = 1;
    for (let it = 0; it < 3; it++) {
      STA.ciwsYaw[MI] = yaw; STA.ciwsPitch[MI] = pitch; M = A.ciws(STA, MI);
      let lo = 0, hi = 9;
      for (let b = 0; b < 26; b++) { const md = (lo + hi) / 2; PE.roundTruth(R45, Math.min(tk + md, T_KILL + .01), RT); if (tof(Math.hypot(RT[0] - M[0], RT[1] - M[1], RT[2] - M[2])) > md) lo = md; else hi = md; }
      tf = (lo + hi) / 2; PE.roundTruth(R45, Math.min(tk + tf, T_KILL + .01), RT);
      D = V.norm([RT[0] - M[0], RT[1] - M[1] + G2 * tf * tf, RT[2] - M[2]]);
      yaw = Math.atan2(D[0], D[2]); pitch = Math.asin(E.clamp(D[1], -1, 1));
    }
    return { M, D, yaw, pitch, tf };
  }
  /* barrel spin: up to 4 500 rpm, integrated in closed form so the angle is exact at any T */
  const WMAX = TAU * 75;
  function spinAt(T) {
    const a0 = CT.spin0, a1 = CT.spin1, d0 = CT.spinD, d1 = CT.spinE, up = WMAX * (a1 - a0) / 2, hold = up + WMAX * (d0 - a1);
    if (T <= a0) return [0, 0];
    if (T < a1) { const t = T - a0; return [WMAX * t * t / (2 * (a1 - a0)), WMAX * t / (a1 - a0)]; }
    if (T < d0) return [up + WMAX * (T - a1), WMAX];
    if (T < d1) { const t = T - d0, Dd = d1 - d0; return [hold + WMAX * (t - t * t / (2 * Dd)), WMAX * (1 - t / Dd)]; }
    return [hold + WMAX * (d1 - d0) / 2, 0];
  }
  const wrapPi = x => x - TAU * Math.round(x / TAU);
  let csT = -1;
  const CS = { yaw: REST_Y, pitch: REST_P, spin: 0, w: 0, fire: false, X: null, aim: null };
  function ciwsState(T) {
    if (T === csT) return CS; csT = T;
    if (T < CT.slew0 || T > CT.back1) { CS.yaw = REST_Y; CS.pitch = REST_P; CS.spin = 0; CS.w = 0; CS.fire = false; CS.aim = null; }
    else {
      const Am = aimAt(Math.min(T, T_KILL + .02), 1, 0), w = ss(CT.slew0, CT.slew1, T) * (1 - ss(CT.back0, CT.back1, T));
      CS.yaw = REST_Y + wrapPi(Am.yaw - REST_Y) * w; CS.pitch = mix(REST_P, Am.pitch, w);
      const sp = spinAt(T); CS.spin = sp[0]; CS.w = sp[1];
      CS.fire = T >= CT.fire0 && T <= CT.fire1; CS.aim = Am;
    }
    CS.X = mountX(CS.yaw, CS.pitch);
    return CS;
  }
  /* HD.destroyer's Phalanx is a dyn part the film sampled once at rest: resample the aft mount as its base (turns with
     yaw) and its elevating group sampled level (turns with yaw and elevation, at draw time from st); the six barrels
     are left out and drawn per frame below, spinning */
  const MOUNT = {};
  (function rebuildMount() {
    const part = PE.DDM.parts.find(p => p.name === 'ciwsA'); if (!part || part.dyn({}).length !== 20) return;
    const xf0 = part.xf, pitchOf = st => (st.ciwsPitch && st.ciwsPitch[MI] !== undefined) ? st.ciwsPitch[MI] : REST_P;
    const base = { name: 'ciwsA', label: part.label, prims: [], dyn: st => part.dyn(st).slice(0, 5), xf: xf0 };
    const elev = { name: 'ciwsA', label: part.label, prims: [], dyn: () => { const p = part.dyn({ ciwsPitch: [REST_P, 0] }); return p.slice(5, 9).concat(p.slice(15)); }, xf: st => X.mul(xf0(st), X.pivotX(CIWS_TR, -pitchOf(st))) };
    for (const [lod, s, seed, opt] of [['coarse', .85, 21, { fine: false }], ['mid', .42, 22], ['fine', .3, 23]]) {
      const arr = PE.DDC[lod], i = arr.findIndex(c => c.rigid && c.sp.part.name === 'ciwsA'); if (i < 0) continue;
      const smp = GEO.sample({ parts: [base, elev] }, s, seed + 500, {}, opt).filter(p => p.pts.length);
      arr.splice(i, 1, ...smp.map(sp => ({ sp, rigid: true, pts: sp.pts })));
      MOUNT[lod] = smp;
    }
    // a denser sampling for the lime highlight while it engages
    MOUNT.hi = GEO.sample({ parts: [base, elev] }, .08, 577, {}).filter(p => p.pts.length);
  })();
  /* while it is on the round the mount lights lime (the system acting, as the SPY face does), over its own dots */
  const I0 = X.make(R.I(), [0, 0, 0]);
  function drawMountLit(c, T, k) {
    const aL = k * ss(95.2, 95.8, T) * (1 - ss(CT.fire1 + .6, CT.fire1 + 1.8, T)); if (aL < .02 || !MOUNT.hi) return;
    if (!P3(c.X.T[0], c.X.T[1] + 2, c.X.T[2])) return;
    const pxm = DW.cam.fl / q.z, set = pxm > 9 ? MOUNT.hi : pxm > 3 ? MOUNT.fine : MOUNT.mid; if (!set) return;
    const st = { ciwsYaw: [0, c.yaw], ciwsPitch: [REST_P, c.pitch] };
    // dense dots stay 1 px until they land > ~3 px apart
    for (const sp of set) DW.drawPts(sp.pts, X.mul(I0, sp.part.xf(st)), aL, pxm * .08 > 3 ? 1e9 : 0, null, .42 * aL, 1);
  }
  PE.shipStateFx = function (st, T) {
    if (!live(T)) return st;
    const c = ciwsState(T);
    st.ciwsYaw = [st.ciwsYaw[0], c.yaw]; st.ciwsPitch = [st.ciwsPitch[0], c.pitch]; st.ciwsSpin = c.spin;
    const open = [];
    for (const s of SH) { const a = T - s.tL, f = ss(-.9, -.35, a) * (1 - ss(3.4, 4.4, a)); if (f > 0) open.push([s.cell, f]); }
    st.vlsOpen = open;
    return st;
  };
  /* the six barrels on their 0.115 m circle, smeared over one frame's turn when they spin fast */
  function drawBarrels(c, T, k) {
    const Mx = c.X, ctr = X.ap(Mx, [0, MZ[1], 1.4]);
    if (!P3(ctr[0], ctr[1], ctr[2])) return;
    const pxm = DW.cam.fl / q.z, len = 1.5 * pxm;
    if (pxm < 1.2) return;
    const nd = Math.max(3, Math.min(40, Math.round(len / 1.6)));
    const turn = c.w / 60, nb = turn > .6 ? 6 : turn > .05 ? 3 : 1;
    const M = Mx.R, T0 = Mx.T, lm = .7 * ss(95.2, 95.8, T) * (1 - ss(CT.fire1 + .6, CT.fire1 + 1.8, T));
    const cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
    for (let b = 0; b < 6; b++) for (let m = 0; m < nb; m++) {
      const ang = c.spin - m * Math.min(turn, TAU / 6) / nb + b * TAU / 6, bx = Math.cos(ang) * .115, by = MZ[1] + Math.sin(ang) * .115, al = k * (m ? .5 : 1) * (.8 + .2 * lm);
      for (let j = 0; j <= nd; j++) {
        const bz = .62 + 1.5 * j / nd;
        if (P3(M[0] * bx + M[1] * by + M[2] * bz + T0[0], M[3] * bx + M[4] * by + M[5] * bz + T0[1], M[6] * bx + M[7] * by + M[8] * bz + T0[2])) putO(q.x, q.y, pxm > 30 ? 2 : 1, cr, cg, cb, al * (j === nd ? 1 : .8));
      }
    }
  }
  /* every round of the burst: fire time, muzzle, direction (the stream walks onto the round from short, then wanders
     a little round it), water-entry age */
  const TRC = (() => {
    const out = [], n = Math.floor((CT.fire1 - CT.fire0) * CW.rate);
    let yaw = 1, pitch = 0;
    for (let j = 0; j <= n; j++) {
      const tk = CT.fire0 + j / CW.rate, Am = aimAt(tk, yaw, pitch); yaw = Am.yaw; pitch = Am.pitch;
      const walk = .005 * Math.exp(-(tk - CT.fire0) / .5), wx = .0011 * M3.noise(tk * 1.7, 3.3), wy = .0011 * M3.noise(tk * 1.9, 8.1);
      const u = V.norm(V.cross(Am.D, [0, 1, 0])), vv = V.cross(u, Am.D);
      const ex = gH(j, 41) * .002 + wx, ey = gH(j, 43) * .002 + wy - walk;
      const D = V.norm([Am.D[0] + u[0] * ex + vv[0] * ey, Am.D[1] + u[1] * ex + vv[1] * ey, Am.D[2] + u[2] * ex + vv[2] * ey]);
      const yAt = a => Am.M[1] + D[1] * TRL * (1 - Math.exp(-CW.kd * a)) - G2 * a * a;
      let lo = 0, hi = 9; for (let it = 0; it < 36; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
      // about half the rounds that reach round 45 end there (they read as strikes); the rest fly on into the sea
      const hitA = tk + Am.tf <= T_KILL + .05 && hsh(j, 9) < .5 ? Am.tf : 99;
      out.push({ tk, M: Am.M, D, aw: Math.min(lo, 7), end: Math.min(lo, hitA), wet: hitA > lo, rn: hsh(j, 5) });
    }
    return out;
  })();
  function drawTracers(T, k) {
    if (T < CT.fire0 || T > CT.fire1 + 8) return;
    // a streak about a frame long: the tracers that pass near the lens whip across it
    for (let i = 0; i < TRC.length; i++) {
      const r = TRC[i], a = T - r.tk; if (a < 0) break;
      if (a < r.end) {
        const ex = Math.exp(-CW.kd * a), h = TRL * (1 - ex), v = CW.v0 * ex;
        const x = r.M[0] + r.D[0] * h, y = r.M[1] + r.D[1] * h - G2 * a * a, z = r.M[2] + r.D[2] * h;
        // the tracer burns out after ~3 s; the round flies on unseen
        const vx = r.D[0] * v, vy = r.D[1] * v - 9.81 * a, vz = r.D[2] * v, al = k * (.8 + .2 * r.rn) * (1 - ss(r.end - .25, r.end, a) * (r.wet ? 0 : .7)) * (1 - ss(2.2, 3.1, a));
        if (al < .01) continue;
        const hot = a < .06 ? 1 - a / .06 : 0;
        if (P3(x, y, z) && !occ(q.x, q.y, q.z)) {
          put(q.x, q.y, q.z < 1500 ? 2 : 1, 236 + 19 * hot, 255, 190 + 60 * hot, al);
          if (q.z < 1200) DW.add(q.x, q.y, 4, LIME[0], LIME[1], LIME[2], .07 * al);
        }
        for (let m = 1; m <= 6; m++) { const d = .0038 * m; if (P3(x - vx * d, y - vy * d, z - vz * d) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 1500 ? 2 : 1, LIME[0], LIME[1], LIME[2], al * (1 - m * .13)); }
      } else if (r.wet && a < r.aw + .9) {
        const w = a - r.aw, h = TRL * (1 - Math.exp(-CW.kd * r.aw)), x = r.M[0] + r.D[0] * h, z = r.M[2] + r.D[2] * h, al = k * .7 * (1 - w / .9);
        for (let m = 0; m < 3; m++) { const vs = 2.5 + m * 2 + r.rn * 2, yy = vs * w - G2 * w * w; if (yy > 0 && P3(x + (m - 1) * .3, yy, z) && !occ(q.x, q.y, q.z)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], al); }
      }
    }
  }
  /* the muzzle: a flickering white point and a short flame while it fires; gun smoke drifting aft */
  function drawMuzzle(c, T, k) {
    const Mz = X.ap(c.X, MZ), Dz = X.dir(c.X, [0, 0, 1]);
    if (c.fire) {
      const fr = Math.floor(T * 75), f = hsh(fr, 3);
      for (let j = 0; j < 16; j++) {
        const s = 2.2 * Math.pow(hsh(j, fr + 7), 1.5), rr = .18 * s;
        if (P3(Mz[0] + Dz[0] * s + GT[(j * 3 + fr) & GM] * rr, Mz[1] + Dz[1] * s + GT[(j * 3 + fr + 1) & GM] * rr, Mz[2] + Dz[2] * s + GT[(j * 3 + fr + 2) & GM] * rr) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 300 ? 2 : 1, 255, 236, 196, k * (1 - s / 2.4));
      }
      if (P3(Mz[0], Mz[1], Mz[2])) {
        put(q.x, q.y, q.z < 800 ? 3 : 2, 255, 244, 222, k * (.65 + .35 * f));
        glow(q.x, q.y, Math.min(46, 3 + 3600 / q.z), 255, 196, 140, .5 * k * (.55 + .45 * f));
      }
    }
    for (let j = 0; j < 100; j++) {
      const tb = Math.floor(T * 30) / 30 - j / 30; if (tb < CT.fire0 || tb > CT.fire1) continue;
      const a = T - tb, r = .3 + 1.3 * Math.sqrt(a), g0 = (j * 3 + Math.floor(tb * 30) * 7) & GM;
      if (P3(Mz[0] + Dz[0] * 1.2 + WIND[0] * a + GT[g0] * r, Mz[1] + .7 * a + GT[(g0 + 1) & GM] * r * .5, Mz[2] + Dz[2] * 1.2 + WIND[2] * a + GT[(g0 + 2) & GM] * r) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 500 ? 2 : 1, GREY[0], GREY[1], GREY[2], k * .38 * (1 - a / 3.4));
    }
  }
  /* the Phalanx's own search-and-track radar: a dense cone of dots out of the radome along the gun line, wide while it
     acquires, tight once it tracks, energy running out along it in bands; a ring round the round at the far end */
  const NCO = 2600, CO = new Float32Array(NCO * 4);
  { const r = M3.rng(8181); for (let i = 0; i < NCO; i++) { CO[i * 4] = Math.pow(r(), 1.7); CO[i * 4 + 1] = r() * TAU; const s = r(); CO[i * 4 + 2] = s < .55 ? .88 + .12 * r() : Math.sqrt(r()); CO[i * 4 + 3] = .45 + .55 * r(); } }
  function drawCone(c, T, k) {
    const aC = k * ss(96.0, 96.6, T) * (1 - ss(101.25, 101.9, T)); if (aC < .01) return;
    const Mx = c.X, ap = X.ap(Mx, RADOME), ax = X.dir(Mx, [0, 0, 1]);
    const lock = ss(96.9, 97.6, T), half = mix(8, 2.1, lock) * DEG, th = Math.tan(half);
    PE.roundTruth(R45, Math.min(T, T_KILL), RT);
    const dR = Math.hypot(RT[0] - ap[0], RT[1] - ap[1], RT[2] - ap[2]), L = mix(2600, dR, lock) * (T > T_KILL ? 1 + .6 * sat((T - T_KILL) / .6) : 1);
    const e1 = V.norm(V.cross(ax, [0, 1, 0])), e2 = V.cross(e1, ax);
    for (let i = 0; i < NCO; i++) {
      const o = i * 4, u = CO[o], s = u * L, ang = CO[o + 1] + T * .35, rho = CO[o + 2], rr = s * th * rho, ca = Math.cos(ang) * rr, sa = Math.sin(ang) * rr;
      if (!P3(ap[0] + ax[0] * s + e1[0] * ca + e2[0] * sa, ap[1] + ax[1] * s + e1[1] * ca + e2[1] * sa, ap[2] + ax[2] * s + e1[2] * ca + e2[2] * sa) || occ(q.x, q.y, q.z)) continue;
      const band = .5 + .5 * Math.cos(TAU * (s / 190 - T * 4.2)), b4 = band * band * band * band;
      const b = aC * CO[o + 3] * (rho > .87 ? 1 : .45) * (1 - .45 * u) * (.4 + 1.1 * b4);
      put(q.x, q.y, q.z < 700 ? 2 : 1, LIME[0], LIME[1], LIME[2], b > 1 ? 1 : b);
    }
    // the lock: a ring of dots round the round, turning
    if (lock > .05 && T < T_KILL + .1) {
      const rr = Math.max(6, dR * th * 1.1), n = 40;
      for (let j = 0; j < n; j++) {
        const a = j / n * TAU + T * 2.2, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
        if (P3(RT[0] + e1[0] * ca + e2[0] * sa, RT[1] + e1[1] * ca + e2[1] * sa, RT[2] + e1[2] * ca + e2[2] * sa)) put(q.x, q.y, 2, LIME[0], LIME[1], LIME[2], aC * lock * (j % 5 === 0 ? 1 : .55));
      }
    }
  }
  PE.ciwsFx = function (T, ctx) {
    const c = ciwsState(T);
    // always: the resampled mount carries no barrels of its own
    drawBarrels(c, T, 1);
    if (!live(T) || T < CT.slew0 - 1 || T > 112) return;
    if (T < CT.back1) { drawMountLit(c, T, 1); drawCone(c, T, 1); drawMuzzle(c, T, 1); drawTracers(T, 1); }
    drawBurst(B45, T, 1);
    drawScatter(R45, T, 1);
  };
  PE.hitFx = function (T, ctx) {
    if (!live(T)) return;
    for (const B of BURSTS) drawSplashes(B, T, 1);
  };

  /* ================= overlay: bloom on the flashes, short tags ================= */
  function bloom(octx, x, y, r, al, warm) {
    if (al <= .005 || x < -r || y < -r || x > 1920 + r || y > 1080 + r) return;
    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,248,232,${Math.min(1, al).toFixed(3)})`);
    g.addColorStop(.3, warm ? `rgba(255,176,128,${(al * .35).toFixed(3)})` : `rgba(210,244,120,${(al * .3).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,150,110,0)');
    octx.globalCompositeOperation = 'lighter'; octx.fillStyle = g; octx.fillRect(x - r, y - r, 2 * r, 2 * r); octx.globalCompositeOperation = 'source-over';
  }
  const TAGP = [0, 0, 0];
  PE.fxOverlay = function (T, octx, tags, ctx) {
    if (!live(T)) return;
    const cam = ctx.cam;
    for (const s of SH) {
      const a = T - s.tL;
      if (a >= 0 && a < 1.4) {
        const p = cam.project([s.P0[0], s.P0[1] + 1.5, s.P0[2]]);
        if (p) bloom(octx, p[0], p[1], E.clamp(70 * cam.fl / p[2], 50, 260), (.55 * Math.exp(-a * 5) + .12 * Math.exp(-a * 1.4)), true);
      }
      // the new bird, for its first seconds
      if (a > .35 && a < 3.4 && T <= s.tEnd) {
        PE.shotAt(s, T, TAGP); const p = cam.project(TAGP);
        if (p) tags.push({ key: 'sm' + s.id, id: 'SM-6', txt: 'launch', cls: 'lime', ax: p[0], ay: p[1], x: p[0] + 24, y: p[1] - 44, a: sat((a - .35) / .3) * (1 - ss(2.8, 3.4, a)), pri: 6 });
      }
    }
    for (const B of BURSTS) {
      const a = T - B.t0; if (a < 0 || a > 3) continue;
      const p = cam.project(B.p); if (!p) continue;
      const big = B.big ? 1.6 : B.kind === 'destruct' ? .6 : 1;
      bloom(octx, p[0], p[1], Math.min(460, (70 + 120 * sat(a * 3)) * big * E.clamp(1100 / p[2], .55, 2.6)), (.75 * Math.exp(-a * 6) + .16 * Math.exp(-a * 1.3)) * (B.kind === 'destruct' ? .7 : 1), true);
      // the flash lights the horizon round it for an instant
      if (a < .5 && B.kind !== 'destruct') bloom(octx, p[0], p[1], B.big ? 520 : 300, .13 * (1 - a / .5) * (1 - a / .5), true);
      if (B.kind === 'destruct' && a > .15 && a < 2.8) tags.push({ key: 'sd', id: 'SM-6', txt: 'self-destruct', cls: 'drop', ax: p[0], ay: p[1], x: p[0] + 22, y: p[1] - 40, a: sat((a - .15) / .2) * (1 - ss(2.3, 2.8, a)), pri: 6 });
    }
    // "TRK 43 · stopped", held at the burst on the scope
    for (let k = 0; k < RAID.length; k++) {
      const a = T - RAID[k].tStop; if (a < 0 || a > 3.4) continue;
      const P = STOP_P[k], p = cam.project([P[0], 20, P[2]]); if (!p) continue;
      tags.push({ key: 'stop' + RAID[k].id, id: 'TRK ' + RAID[k].id, txt: 'stopped', cls: 'drop', ax: p[0], ay: p[1], x: p[0] + 18, y: p[1] - 36, a: sat(a / .15) * (1 - ss(2.7, 3.4, a)), pri: 8 });
    }
    // the Phalanx: its tag while it is on the round, the muzzle's flicker
    if (T > CT.slew0 && T < CT.fire1 + 1) {
      const c = ciwsState(T), p = cam.project(X.ap(c.X, [0, 3.3, 0]));
      if (p) tags.push({ key: 'ciws', id: 'CIWS', txt: 'Mk 15 Phalanx', cls: 'lime', ax: p[0], ay: p[1], x: p[0] - 64, y: p[1] - 70, a: ss(96.2, 96.6, T) * (1 - ss(CT.fire1 + .4, CT.fire1 + 1, T)), pri: 9 });
      if (c.fire) { const m = cam.project(X.ap(c.X, MZ)); if (m) bloom(octx, m[0], m[1], E.clamp(9000 / m[2], 16, 60), .22 + .12 * hsh(Math.floor(T * 75), 9), true); }
    }
  };

  /* ================= sound: fired only while playing forward in real time ================= */
  const SFX = STAGE.SFX;
  const hatch = () => { SFX.tone(170, 95, .14, 'square', .018); SFX.noise(.25, 700, .6, .02, .005); };
  const launch = () => { SFX.noise(4.8, 230, .8, .075, .12); SFX.noise(1.7, 1300, .5, .026, .04); SFX.tone(56, 36, 3.2, 'sine', .05); };
  const farBoom = () => { SFX.noise(2.2, 150, .9, .06, .03); SFX.tone(70, 34, 1.2, 'sine', .035); };
  const stopBlip = () => { SFX.tone(1240, 1240, .045, 'square', .01); SFX.tone(930, 930, .06, 'square', .008, .07); };
  const pop = () => { SFX.noise(1.1, 420, .7, .04, .01); SFX.tone(90, 50, .6, 'sine', .02); };
  const brrt = dur => { SFX.tone(75, 72, dur, 'sawtooth', .026); SFX.tone(150, 146, dur, 'square', .008); SFX.noise(dur, 2300, .7, .034, .02); };
  const bigBoom = () => { SFX.noise(.22, 4600, .5, .12, .002); SFX.noise(3.2, 170, .9, .2, .01); SFX.tone(110, 36, 1.6, 'sine', .1); SFX.noise(3, 900, .6, .04, .4, .35); };
  const cues = [];
  for (const s of SH) { cues.push([s.tL - .6, hatch], [s.tL, launch]); }
  for (const s of SH) if (!s.miss) cues.push([s.tI + .25, farBoom], [s.tI + .05, stopBlip]);
  if (S5) cues.push([S5.tEnd + .15, pop]);
  cues.push([CT.slew0, () => SFX.tone(380, 520, 1.3, 'square', .006)]);
  cues.push([CT.spin0, () => { SFX.tone(160, 1500, .85, 'sawtooth', .009); SFX.tone(1500, 1450, 3.9, 'sine', .004, .85); }]);
  cues.push([CT.fire0, () => brrt(CT.fire1 - CT.fire0)]);
  cues.push([T_KILL, bigBoom], [T_KILL + .05, stopBlip], [T_KILL + .6, () => SFX.noise(1.6, 1900, .4, .03, .25)]);
  PE.fxCues = cues;
})();
