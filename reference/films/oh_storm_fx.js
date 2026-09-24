/* OH "Storm" combat effects. Stage A (oh_storm_film.js) calls each hook every frame, after the scene's hairlines
   (sea, cloud, rain shafts, ships, spray, rounds, interceptor paths) and before the lightning bolts and the near rain,
   as hook(T, K):
     K.W       the Wire (K.W.seg(a, b, alpha) world, K.W.seg2 screen, K.W.ring, K.W.disc); fog is off when called
     K.cam     the M3.Cam of this frame
     K.glow(p, a, m, px, max)   additive radial glow drawn after the flush (restrained bloom: p world, a alpha,
               m radius in metres, px minimum radius in px, max cap in px)
     K.hero    { X: A's ship transform at T (pitching, rolling), ciws: {yaw:[f,a], pitch:[f,a]}, spin: [f,a] rad }
     K.L       0..1 lightning level at T (OHS.lift): every hairline is lifted toward full strength at flush while
               it is up; damage that only a flash should reveal is drawn at alpha * K.L
     K.rain    0..1 rain intensity, K.wind world wind velocity (m/s, blowing toward 220), K.CB cloud base (m)
     K.vis     visibility (m) at T (rain at night; lightning opens it): far flashes fade with exp(-(d/vis)^1.3)
     K.vcam    the lens's velocity (m/s), for rain streaks
     K.dim     0..1 world visibility
   Besides the hooks the film reads OHFX.lift(T) (the flashes of this file lift every hairline like lightning),
   OHFX.lightFn(T) (point lights for the bow spray) and OHS.fxLit (cloud base lit from below / within).
   Spectacle only: launch blasts, torn smoke trails, plumes glowing in the cloud, far flashes through the murk,
   tracer through lit rain, a close kill, the hit forward, its fire and smoke, the damage the lightning shows.
   Everything is analytic in its own event time plus seeded hashes (tables built at load), so render(T) stays a pure
   function of T. The fire is out by ~135 s and the last smoke parcel gone by ~148 s: nothing survives the seam. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const { PI, TAU, hash, DA, VK, D, CB, WTO } = OH;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp, noise = M3.noise;
  const HI = '#F4D23C', WH = '#F6F5F2', SA = OH.A, RID = OH.RID, HIT = OH.HIT;
  const fr = x => x - Math.floor(x);
  const modp = OH.modp;
  const WX = WTO[0], WZ = WTO[2];
  const OHFX = window.OHFX = { cues: [] };

  /* ================= the wind as a displacement: metres of air run downwind between two film times ================= */
  const WS_HZ = 30, WS_N = Math.ceil(D * WS_HZ) + 2, WSI = new Float64Array(WS_N);
  for (let i = 1; i < WS_N; i++) WSI[i] = WSI[i - 1] + (OH.windSpd((i - 1) / WS_HZ) + OH.windSpd(i / WS_HZ)) * .5 / WS_HZ;
  const windS = t => { const x = clamp(t * WS_HZ, 0, WS_N - 1.001), i = Math.floor(x); return WSI[i] + (WSI[i + 1] - WSI[i]) * (x - i); };
  // lighter in the sea's lee close down, stronger aloft
  const windRun = (te, T, y) => (windS(T) - windS(te)) * clamp(.72 + y / 700, .72, 1.35);
  const murk = (d, vis) => Math.exp(-Math.pow(d / vis, 1.3));
  const inCloud = y => ss(CB - 40, CB + 20, y);

  /* ================= drawing primitives (screen space after one projection, no allocations) ================= */
  const PJ = [0, 0, 0];
  function pj(cam, x, y, z) {
    const e = cam.eye, f = cam.f, dx = x - e[0], dy = y - e[1], dz = z - e[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < cam.near) return false;
    const r = cam.r, u = cam.u;
    PJ[0] = cam.cx + cam.shake[0] + cam.fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc;
    PJ[1] = cam.cy + cam.shake[1] - cam.fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
    PJ[2] = zc;
    return true;
  }
  const segW = OHS.segW;
  const seg = (W, cam, a, b, al) => segW(W, cam, a[0], a[1], a[2], b[0], b[1], b[2], al);
  const offscreen = (cam, sx, sy, R) => sx + R < -30 || sx - R > cam.W + 30 || sy + R < -30 || sy - R > cam.H + 30;

  /* a smoke billow: camera-facing scalloped outline with folds inside; st > 1 stretches it along the wind's screen
     direction (torn smoke), faded out when the lens is inside it */
  function billow(W, cam, x, y, z, r, al, seed, age, folds, nearMul, st) {
    if (al <= .004 || r <= 0 || !pj(cam, x, y, z)) return;
    const nm = nearMul || 1, zc = PJ[2], near = ss(r * .8 * nm, r * 2.6 * nm, zc);
    if (near <= 0) return;
    const Rp = r * cam.fl / zc;
    if (Rp < .7) return;
    const sx = PJ[0], sy = PJ[1];
    if (offscreen(cam, sx, sy, Rp * (st || 1))) return;
    al *= near * (1 - ss(700, 1600, Rp));
    if (al <= .004) return;
    let ux = 1, uy = 0, k = 1;
    if (st && st > 1.02 && pj(cam, x + WX * r, y, z + WZ * r)) {
      const dx = PJ[0] - sx, dy = PJ[1] - sy, l = Math.hypot(dx, dy);
      if (l > .5) { ux = dx / l; uy = dy / l; k = mix(1, st, sat(l / Rp)); }
    }
    const tx = (ox, oy) => { const a = (ox * ux + oy * uy) * k, b = -ox * uy + oy * ux; TX0 = sx + a * ux - b * uy; TY0 = sy + a * uy + b * ux; };
    const nl = 5 + Math.floor(fr(seed * 7.31) * 4), per = clamp(Math.round(Rp / (nl * 2.4)), 2, 7), n = Math.max(12, nl * per);
    const dep = .2 * ss(5, 16, Rp), f0 = 1 - dep;
    const sg = fr(seed * 3.7) < .5 ? 1 : -1, ph = seed * TAU + sg * age * .09, hs = seed * 131.7;
    let px = 0, py = 0;
    for (let i = 0; i <= n; i++) {
      const th = ph + i / n * TAU, li = i / n * nl, j = Math.floor(li) % nl;
      const f = f0 + dep * Math.abs(Math.sin(PI * li)) * (.65 + .7 * hash(j, hs));
      tx(Math.cos(th) * Rp * f, -Math.sin(th) * Rp * f);
      if (i) W.seg2(px, py, TX0, TY0, al);
      px = TX0; py = TY0;
    }
    if (!folds || Rp < 5) return;
    const fa = al * .55, m = clamp(Math.round(Rp / 9), 3, 9);
    for (let q = 0; q < folds; q++) {
      const a0 = ph * 1.3 + q * 2.55 + seed * 4.1, ox = Math.cos(a0) * Rp * .4, oy = -Math.sin(a0) * Rp * .4, rr = Rp * (.34 + .08 * hash(q, hs + 3));
      let qx0 = 0, qy0 = 0;
      for (let i = 0; i <= m; i++) {
        const th = a0 - 1.15 + 2.3 * i / m;
        tx(ox + Math.cos(th) * rr, oy - Math.sin(th) * rr);
        if (i) W.seg2(qx0, qy0, TX0, TY0, fa);
        qx0 = TX0; qy0 = TY0;
      }
    }
  }
  let TX0 = 0, TY0 = 0;
  /* camera-facing circle */
  function discS(W, cam, p, r, al, nMax) {
    if (al <= .004 || !pj(cam, p[0], p[1], p[2])) return;
    const zc = PJ[2]; if (zc < r * 1.1) return;
    const Rp = r * cam.fl / zc; if (Rp < .7) return;
    const sx = PJ[0], sy = PJ[1]; if (offscreen(cam, sx, sy, Rp)) return;
    const n = clamp(Math.round(Rp / 3.5), 16, Math.max(16, nMax || 40));
    let px = sx + Rp, py = sy;
    for (let i = 1; i <= n; i++) { const th = i / n * TAU, qx = sx + Math.cos(th) * Rp, qy = sy - Math.sin(th) * Rp; W.seg2(px, py, qx, qy, al); px = qx; py = qy; }
  }
  /* ring in a world plane (unit axes U, V): affine projection while small against its depth, the Wire's own when
     close; the half facing the lens at alF, the far half at alB; wob bends it into an irregular loop */
  function ringA(W, cam, c, U, Vv, r, alF, alB, nMax, wob, wph) {
    if (alF <= .004 || !pj(cam, c[0], c[1], c[2])) return;
    const zc = PJ[2];
    if (zc < r * 5) { if (zc > r * 1.2) W.ring(c, U, Vv, r, clamp(Math.round(nMax || 24), 8, 48), alF, alB); return; }
    const sx = PJ[0], sy = PJ[1], Rp = r * cam.fl / zc;
    if (Rp < .6 || offscreen(cam, sx, sy, Rp)) return;
    pj(cam, c[0] + U[0] * r, c[1] + U[1] * r, c[2] + U[2] * r); const ax = PJ[0] - sx, ay = PJ[1] - sy;
    pj(cam, c[0] + Vv[0] * r, c[1] + Vv[1] * r, c[2] + Vv[2] * r); const bx = PJ[0] - sx, by = PJ[1] - sy;
    const e = cam.eye, ex = e[0] - c[0], ey = e[1] - c[1], ez = e[2] - c[2];
    const du = U[0] * ex + U[1] * ey + U[2] * ez, dv = Vv[0] * ex + Vv[1] * ey + Vv[2] * ez;
    const n = clamp(Math.round(Rp / 3), 8, nMax || 32);
    wob = wob || 0; wph = wph || 0;
    let w = 1 + wob * Math.sin(wph), px = sx + ax * w, py = sy + ay * w;
    for (let i = 1; i <= n; i++) {
      const th = i / n * TAU, cs = Math.cos(th), sn = Math.sin(th);
      w = 1 + wob * Math.sin(3 * th + wph);
      const qx = sx + (ax * cs + bx * sn) * w, qy = sy + (ay * cs + by * sn) * w;
      const tm = (i - .5) / n * TAU;
      W.seg2(px, py, qx, qy, du * Math.cos(tm) + dv * Math.sin(tm) > 0 ? alF : alB);
      px = qx; py = qy;
    }
  }
  const UX = [1, 0, 0], UZ = [0, 0, 1];
  const ringH = (W, cam, c, r, al, n, wob, wph) => ringA(W, cam, c, UX, UZ, r, al, al * .7, n, wob, wph);
  /* a glint: short radial camera-facing lines (min length in px so far ones still read) */
  function star(W, cam, p, L, minPx, al, seed, n) {
    if (al <= .004 || !pj(cam, p[0], p[1], p[2])) return;
    const sx = PJ[0], sy = PJ[1], Lp = Math.max(minPx, L * cam.fl / PJ[2]);
    if (offscreen(cam, sx, sy, Lp)) return;
    for (let k = 0; k < n; k++) {
      const th = (k + .5 * hash(k, seed)) / n * TAU + seed, long = k % 2 === 0, l = Lp * (long ? .7 + .3 * hash(k + 5, seed) : .25 + .2 * hash(k + 5, seed)), l0 = l * .1;
      W.seg2(sx + Math.cos(th) * l0, sy - Math.sin(th) * l0, sx + Math.cos(th) * l, sy - Math.sin(th) * l, al * (long ? 1 : .6));
    }
  }
  function perp(d) {
    let U = V.cross(d, Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0]); U = V.norm(U);
    return [U, V.cross(d, U)];
  }

  /* ================= sparks, debris, splashes in a heavy sea ================= */
  function mkSparks(n, seed, v0, v1, up) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.4, 1.25, hash(k + 3, seed)) + (up || 0), v = mix(v0, v1, hash(k + 9, seed));
      o.push([Math.cos(az) * Math.cos(el) * v, Math.sin(el) * v, Math.sin(az) * Math.cos(el) * v, .7 + 1.3 * hash(k + 5, seed)]);
    }
    return o;
  }
  function drawSparks(W, cam, c, S, age, al, tail, te, T) {
    tail = tail || .08;
    // sparks are light: the gale carries them off
    const wr = te === undefined ? 0 : windRun(te, T, c[1]) * .8, ox = WX * wr, oz = WZ * wr;
    for (const s of S) {
      if (age > s[3]) continue;
      const a0 = Math.max(0, age - tail);
      segW(W, cam, c[0] + s[0] * a0 + ox, c[1] + s[1] * a0 - 4.9 * a0 * a0, c[2] + s[2] * a0 + oz, c[0] + s[0] * age + ox, c[1] + s[1] * age - 4.9 * age * age, c[2] + s[2] * age + oz, al * Math.pow(1 - age / s[3], 1.3));
    }
  }
  // fragments with momentum v0 (m/s vector) + vb (carried velocity), spread, drag time tau; each falls to the sea
  function mkFrags(p, v0, n, seed, k0, k1, spread, tau, upBias, vb) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.5, 1.1, hash(k + 1, seed)) + (upBias || 0), sp = spread * (.3 + .7 * hash(k + 2, seed));
      const kk = mix(k0, k1, hash(k + 4, seed));
      const v = [v0[0] * kk + Math.cos(az) * Math.cos(el) * sp, v0[1] * kk + Math.sin(el) * sp, v0[2] * kk + Math.sin(az) * Math.cos(el) * sp];
      if (vb) { v[0] += vb[0]; v[1] += vb[1]; v[2] += vb[2]; }
      const F = { v, tau, p, big: hash(k + 6, seed), tImp: 8, imp: null, h: hash(k + 8, seed) };
      for (let a = .005; a < 8; a += .005) {
        const q = fragAt(F, a);
        if (q[1] <= 0) { F.tImp = a; F.imp = [q[0], 0, q[2]]; break; }
      }
      o.push(F);
    }
    return o;
  }
  function fragAt(F, a) {
    const k = F.tau * (1 - Math.exp(-a / F.tau)), p = F.p, v = F.v;
    return [p[0] + v[0] * k, p[1] + v[1] * k - 4.9 * a * a, p[2] + v[2] * k];
  }
  /* a splash in the storm sea: jets thrown up off the heaving surface and torn downwind, a short broken ring */
  function splash(W, cam, x, z, a, sz, al, seed, T) {
    if (a < 0 || a > 2.2 || al <= .004) return;
    const y0 = OH.swellAt(x, z, T) * .92;
    if (a < 1.6) for (let k = 0; k < 5; k++) {
      const dur = 1.1 + .5 * hash(k, seed + 1), u = a / dur; if (u >= 1) continue;
      const hk = sz * (.6 + .9 * hash(k, seed)) * Math.sin(PI * u), lean = (hash(k, seed + 2) - .5) * .6 * sz, ang = hash(k, seed + 3) * TAU;
      const bl = hk * .45 * u;                       // the tops blow off downwind
      segW(W, cam, x + Math.cos(ang) * lean * .2, y0, z + Math.sin(ang) * lean * .2, x + Math.cos(ang) * lean + WX * bl, y0 + hk, z + Math.sin(ang) * lean + WZ * bl, al * (1 - u * .6));
    }
    if (a < 1.3) ringH(W, cam, [x, y0 + .05, z], .3 * sz + 1.4 * sz * Math.pow(a, .6), al * .45 * (1 - a / 1.3), 16, .25, seed);
  }
  function drawFrags(W, cam, Fs, a, al, T, splashSz, tail) {
    for (const F of Fs) {
      if (a < F.tImp) {
        const q0 = fragAt(F, Math.max(0, a - (tail || .05))), q1 = fragAt(F, a);
        seg(W, cam, q0, q1, al * (.45 + .55 * F.big) * (1 - .4 * a / F.tImp));
      } else if (F.imp && splashSz && F.big > .35) splash(W, cam, F.imp[0], F.imp[2], a - F.tImp, splashSz * (.5 + F.big), al * .8, F.h * 97, T);
    }
  }
  /* a burst cloud: billows around c, swelling, carried off downwind and stretched by the wind */
  function puffs(W, cam, c, te, T, n, r0, rg, spread, al, seed, sink, push) {
    const a = T - te;
    for (let k = 0; k < n; k++) {
      const ak = a - k * .05; if (ak <= 0) continue;
      const h1 = hash(k, seed), h2 = hash(k + 1, seed), h3 = hash(k + 2, seed), run = windRun(te + k * .05, T, c[1]);
      let x = c[0] + (h1 - .5) * spread + WX * run, y = c[1] + (h2 - .5) * spread * .6 - (sink || 0) * ak, z = c[2] + (h3 - .5) * spread + WZ * run;
      if (push) { const kk = push[3] * (1 - Math.exp(-ak / push[3])); x += push[0] * kk; y += push[1] * kk; z += push[2] * kk; }
      billow(W, cam, x, y, z, (r0 + rg * Math.sqrt(ak)) * (.7 + .6 * hash(k + 3, seed)), al * ss(0, .35, ak), seed + k * 1.618, ak, k % 2 ? 1 : 2, 1, 1 + .5 * sat(ak / 3));
    }
  }
  const heroX = (T, K) => K.hero ? K.hero.X : OH.shipXf(SA, T);

  /* ================= rain lit by a flash: a seeded drop lattice falling with the storm's rain, only the drops
     within Rr of the light drawn, each a short frozen streak (the flash is a fast exposure) ================= */
  const VF = 8.6, RO = [0, 0, 0];
  function litRain(W, cam, K, cx, cy, cz, Rr, lev, T, seed, N, exo) {
    if (lev <= .01 || K.rain < .05) return;
    const run = windS(T) * .92;
    RO[0] = WX * run; RO[1] = -VF * T; RO[2] = WZ * run;
    const v = OHS.rainVel(T), vc = K.vcam || RO, ex = exo || .016;
    const sx = (v[0] - vc[0]) * ex, sy = (v[1] - vc[1]) * ex, sz = (v[2] - vc[2]) * ex;
    const S = 2 * Rr, iR = 1 / Rr, e = cam.eye, lv = lev * K.rain;
    for (let k = 0; k < N; k++) {
      const h1 = hash(k, seed), h2 = hash(k + .37, seed + 1.3), h3 = hash(k + .71, seed + 2.9);
      const x = cx + modp(h1 * S + RO[0] - cx + Rr, S) - Rr, y = cy + modp(h2 * S + RO[1] - cy + Rr, S) - Rr, z = cz + modp(h3 * S + RO[2] - cz + Rr, S) - Rr;
      if (y < .6) continue;
      const dx = x - cx, dy = y - cy, dz = z - cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) * iR;
      if (d >= 1) continue;
      const ez = (x - e[0]) * cam.f[0] + (y - e[1]) * cam.f[1] + (z - e[2]) * cam.f[2];
      if (ez < 2.5) continue;
      const f = 1 - d;
      segW(W, cam, x - sx, y - sy, z - sz, x + sx * .25, y + sy * .25, z + sz * .25, lv * f * Math.sqrt(f) * (.5 + .5 * hash(k + 5.3, seed)));
    }
  }

  /* ================= SM-6 launches ================= */
  const SEP = 6;
  const RISE = a => 1.2 * (1 - Math.exp(-a / 2.5)) + .1 * a;
  const motor = s => s < 0 ? 0 : s < SEP ? ss(0, .12, s) : .5;             // Mk 72 boost, then the Mk 104's smaller flame
  for (const I of OH.INTS) {
    const P = I.P, N = I.N, cum = new Float64Array(N);
    for (let j = 1; j < N; j++) cum[j] = cum[j - 1] + Math.hypot(P[j * 3] - P[j * 3 - 3], P[j * 3 + 1] - P[j * 3 - 2], P[j * 3 + 2] - P[j * 3 - 1]);
    I.cum = cum; I.seed = 11.3 + I.i * 7.77; I.jSep = Math.round(SEP * 60);
    const sm = j => [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]];
    const tan = j => V.norm(V.sub(sm(Math.min(N - 1, j + 1)), sm(Math.max(0, j - 1))));
    const TN = new Float64Array(N * 3);
    for (let j = 0; j < N; j++) { const t = tan(j), o = j < I.jSep ? 6.8 : 5.1; TN[j * 3] = P[j * 3] - t[0] * o; TN[j * 3 + 1] = P[j * 3 + 1] - t[1] * o; TN[j * 3 + 2] = P[j * 3 + 2] - t[2] * o; }
    I.TN = TN;
    let j0 = 0; while (j0 < N - 1 && cum[j0] < 7) j0++;
    I.j0 = j0;
    const nodes = []; let d = 9, j = 0;
    const jFly = Math.min(N - 2, Math.floor((I.tI - I.tL) * 60));
    for (;;) {
      while (j < N - 1 && cum[j] < d) j++;
      if (j >= jFly) break;
      const t = tan(j), [U, Vv] = perp(t), boost = j < I.jSep;
      nodes.push({ j, s: I.tL + j / 60, U, V: Vv, h: hash(nodes.length, I.i + 17), boost });
      d += boost ? 4.6 + .055 * d : Math.max(45, .07 * d);
    }
    I.nodes = nodes;
    const c = DA.vls(I.cell), xm = [-3.15, -1.05, 1.05, 3.15].reduce((b, q) => Math.abs(q - c[0]) < Math.abs(b - c[0]) ? q : b, 99);
    I.upL = [xm, c[1] + .05, c[2]]; I.cellL = c;
    I.upW = X.ap(OH.shipXf(SA, I.tL), I.upL);
  }

  // the laid smoke: the nozzle's track, carried off downwind, gust-sheared by height, meandering, rising a little
  const TQ = [0, 0, 0];
  function trailPos(I, j, age, o) {
    const P = I.TN, q = j * 3, y0 = P[q + 1], te = I.tL + j / 60, run = windRun(te, te + age, y0);
    const amp = .4 + 1.7 * Math.pow(age, .8), u = j * .04 + I.seed, v = age * .08;
    const ag = Math.pow(age, .9);
    const gs = 4.5 * ag * noise(y0 * .011 + I.seed, te * .21, 3.3), gx = 2.2 * ag * noise(y0 * .013 + I.seed, te * .19, 7.1);
    o[0] = P[q] + WX * (run + gs) - WZ * gx + amp * noise(u, v, 1.7);
    o[1] = y0 + RISE(age) + amp * .6 * noise(u, v, 5.3);
    o[2] = P[q + 2] + WZ * (run + gs) + WX * gx + amp * noise(u, v, 8.9);
  }
  const NBUF = 2048, BX = new Float64Array(NBUF), BY = new Float64Array(NBUF), BW = new Float64Array(NBUF), BA = new Float64Array(NBUF), BG = new Float64Array(NBUF);
  const NX = new Float64Array(NBUF), BOK = new Uint8Array(NBUF);
  const trailW = (age, boost) => boost ? .9 + 3 * Math.sqrt(age) : .45 + 1.7 * Math.sqrt(age);
  function drawTrail(W, cam, K, I, T, A) {
    const s1 = Math.min(T, I.tEnd) - I.tL; if (s1 <= 0) return;
    const P = I.TN, jN = Math.min(I.N - 1, Math.floor(s1 * 60)), fl = cam.fl, sd = I.seed, e = cam.eye, vis = K.vis;
    if (jN <= I.j0) return;
    let n = 0;
    const put = (x, y, z, age, boost, j) => {
      const hide = 1 - inCloud(y);
      if (hide > .01 && pj(cam, x, y, z)) {
        BX[n] = PJ[0]; BY[n] = PJ[1]; BW[n] = Math.min(900, trailW(age, boost) * fl / PJ[2]); BOK[n] = 1; BG[n] = age; NX[n] = j;
        const dc = Math.hypot(x - e[0], y - e[1], z - e[2]);
        BA[n] = (boost ? .55 * (.45 + .55 * Math.exp(-age / 1.5)) * Math.exp(-age / 12) * (1 + 1.4 * Math.exp(-age / .7)) : .24 * (.4 + .6 * Math.exp(-age / 1.2)) * Math.exp(-age / 7))
          * ss(0, .06, age) * (1 - ss(260, 700, BW[n])) * hide * mix(.3, 1, murk(dc, vis));
      } else BOK[n] = 0;
      n++;
    };
    for (let j = I.j0; n < NBUF - 2;) {
      const age = T - (I.tL + j / 60);
      trailPos(I, j, age, TQ);
      put(TQ[0], TQ[1], TQ[2], age, j < I.jSep, j);
      if (j === jN) break;
      j = Math.min(jN, j + (j < I.jSep ? 2 : j < I.jSep + 240 ? 3 : 5));
    }
    if (T < I.tEnd) { const h = OH.intAt(I, T), dr = OH.intDir(I, T), o = T - I.tL < SEP ? 6.8 : 5.1; if (h) put(h[0] - dr[0] * o, h[1] - dr[1] * o, h[2] - dr[2] * o, 0, T - I.tL < SEP, jN + 1); }
    // edges swell and thin on their own and break into wisps, more the older (and more torn) the smoke
    let pxL = 0, pyL = 0, pxR = 0, pyR = 0, prev = false;
    for (let i = 0; i < n; i++) {
      if (!BOK[i]) { prev = false; continue; }
      const a = i > 0 && BOK[i - 1] ? i - 1 : i, b = i < n - 1 && BOK[i + 1] ? i + 1 : i;
      const tx = BX[b] - BX[a], ty = BY[b] - BY[a], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
      const j = NX[i], g = BG[i], w = BW[i], u = j * .09 + sd, v = g * .22;
      const wl = w * (1 + .38 * noise(u, v, 2.1)), wr = w * (1 + .38 * noise(u, v, 6.7));
      const qxL = BX[i] + nx * wl, qyL = BY[i] + ny * wl, qxR = BX[i] - nx * wr, qyR = BY[i] - ny * wr;
      if (prev) {
        const al = (BA[i] + BA[i - 1]) * .5 * A, tear = .3 * sat(g / 4);
        if (w < 1.1) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], al * 1.5);
        else {
          const bL = sat(.55 + 1.3 * noise(u * .8, v, 9.2) - tear), bR = sat(.55 + 1.3 * noise(u * .8, v, 13.4) - tear);
          W.seg2(pxL, pyL, qxL, qyL, al * bL); W.seg2(pxR, pyR, qxR, qyR, al * bR);
        }
        if (g < 1.2) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], A * .7 * (1 - g / 1.2) * Math.min(1, BA[i] / .5));
      }
      pxL = qxL; pyL = qyL; pxR = qxR; pyR = qyR; prev = true;
    }
    // billows along the column, smoke rings shed round the booster's stretch
    for (const nd of I.nodes) {
      if (nd.s > T) break;
      const age = T - nd.s;
      trailPos(I, nd.j, age, TQ);
      const x = TQ[0], y = TQ[1], z = TQ[2], hide = 1 - inCloud(y); if (hide <= .01) continue;
      const w = trailW(age, nd.boost), dc = Math.hypot(x - e[0], y - e[1], z - e[2]), mk = mix(.3, 1, murk(dc, vis));
      const ab = A * hide * mk * (nd.boost ? .36 * (.4 + .6 * Math.exp(-age / 2)) * Math.exp(-age / 12) : .15 * (.4 + .6 * Math.exp(-age / 1.5)) * Math.exp(-age / 7)) * ss(.05, .5, age);
      billow(W, cam, x, y, z, w * (1.1 + .3 * nd.h), ab, sd + nd.h * 57, age, nd.boost && nd.h > .4 ? 1 : 0, 1, 1 + .6 * sat(age / 4));
      if (nd.boost && age < 2.4) {
        const ar = A * hide * .5 * Math.pow(1 - age / 2.4, 1.5) * ss(0, .06, age);
        ringA(W, cam, [x, y, z], nd.U, nd.V, w, ar, ar * .4, 28, .1 + .16 * sat(age / 1.5), nd.h * 20 + age * .7);
      }
    }
  }
  /* the launch cloud: exhaust out of the cell and the uptake, flattened over the deck and ripped off downwind */
  function drawCloud(W, cam, I, T, A) {
    const P0 = I.P0, up = I.upW;
    for (let k = 0; k < 14; k++) {
      const te = I.tL + k * .09, a = T - te; if (a <= 0 || a > 14) continue;
      const h1 = hash(k, I.i + 31), h2 = hash(k + 1, I.i + 31), h3 = hash(k + 2, I.i + 31);
      const src = k % 2 ? up : P0, ph = h1 * TAU, el = .2 + .6 * h2;
      const dl = Math.hypot(Math.cos(ph), el, Math.sin(ph)), v0 = (5 + 9 * h3) / dl, kk = .9 * (1 - Math.exp(-a / .9));
      const run = windRun(te, T, src[1] + 5);
      const x = src[0] + Math.cos(ph) * v0 * kk + WX * run, y = src[1] + el * v0 * kk + 1.4 * Math.pow(a, .7), z = src[2] + Math.sin(ph) * v0 * kk + WZ * run;
      const r = (1 + 3.4 * Math.sqrt(a)) * (.75 + .5 * h3);
      billow(W, cam, x, y, z, r, A * .5 * ss(0, .12, a) * Math.exp(-a / 5) * (k < 4 ? 1 : .8), I.seed + k * 1.7, a, 2, 1, 1 + .8 * sat(a / 2));
    }
  }
  /* the vent: flame out of the uptake and the cell as the booster lights in it (moves with the ship) */
  function drawVent(W, cam, K, I, T, A) {
    const a = T - I.tL; if (a < -.04 || a > 1.4) return;
    const Xh = heroX(T, K), up = X.ap(Xh, I.upL), cell = X.ap(Xh, I.cellL), k = Math.exp(-Math.max(0, a) / .32);
    for (let q = 0; q < 7; q++) {
      const src = q < 4 ? up : cell, h = (4 + 8 * hash(q, I.i + 3)) * (.6 + .4 * noise(T * 22 + q, I.i)) * (a < 0 ? .3 : 1);
      const lx = (hash(q, I.i + 5) - .5) * 1.2, lz = (hash(q, I.i + 6) - .5) * 1.6, lean = .12 * h;
      segW(W, cam, src[0] + lx * .3, src[1], src[2] + lz * .3, src[0] + lx + WX * lean * 2, src[1] + h, src[2] + lz + WZ * lean * 2 - lean, A * .8 * k);
    }
    K.glow(up, A * (.7 * k + .1), 7, 6, 130);
  }
  /* flame out of the nozzle: a spindle of flickering meridians and a bright core; hidden in the cloud */
  function drawPlume(W, cam, K, I, T, A) {
    const h = OH.intAt(I, T); if (!h) return;
    const s = T - I.tL, dir = OH.intDir(I, T), boost = s < SEP;
    const nz = V.mad(h, dir, boost ? -6.8 : -5.1), d = V.dist(nz, cam.eye), fk = .5 + .5 * noise(T * 34 + I.i * 9, 1.7);
    const hide = 1 - .97 * inCloud(nz[1]); if (hide < .03) return;
    const mk = mix(.3, 1, murk(d, K.vis));
    A *= hide;
    let Lf = boost ? (8 + 6 * fk) * (.35 + .65 * ss(0, .15, s)) : 2.6 + 1.6 * fk;
    if (s < 3) {
      const Xh = heroX(T, K), c = X.ap(Xh, I.cellL), up = X.dir(Xh, [0, 1, 0]);
      const hN = (nz[0] - c[0]) * up[0] + (nz[1] - c[1]) * up[1] + (nz[2] - c[2]) * up[2], dn = Math.max(.05, V.dot(dir, up));
      Lf = Math.min(Lf, Math.max(0, hN + .5) / dn);
    }
    const ax = [-dir[0], -dir[1], -dir[2]];
    if (Lf > .05) seg(W, cam, nz, V.mad(nz, ax, Math.max(Lf * .7, d * .004)), (boost ? .95 : .75) * A * mk);
    if (d < 1500 && Lf > .3) {
      const [U, Vv] = perp(dir), R0 = boost ? .55 : .15, M = 7;
      // the flame's tail is bent downwind by the gale
      const bend = boost ? .25 : .4;
      for (let k = 0; k < M; k++) {
        const ph = k / M * TAU + T * 11 + I.i, c = Math.cos(ph), sn = Math.sin(ph);
        let px = nz[0], py = nz[1], pz = nz[2];
        for (let q = 1; q <= 5; q++) {
          const t = q / 5, rr = R0 * (1 + 2.8 * t) * Math.pow(1 - t, .7) * (1 + .3 * noise(T * 40 + k * 3, q * 1.3));
          const L = Lf * t * (1 + .15 * noise(T * 29 + k, 2.2)), bw = bend * L * t;
          const qx = nz[0] + ax[0] * L + (U[0] * c + Vv[0] * sn) * rr + WX * bw, qy = nz[1] + ax[1] * L + (U[1] * c + Vv[1] * sn) * rr, qz = nz[2] + ax[2] * L + (U[2] * c + Vv[2] * sn) * rr + WZ * bw;
          segW(W, cam, px, py, pz, qx, qy, qz, A * (boost ? .55 : .4) * (1 - .55 * t));
          px = qx; py = qy; pz = qz;
        }
      }
    }
    K.glow(V.mad(nz, ax, Lf * .25), A * (boost ? .55 : .3) * (.8 + .2 * fk) * mk, boost ? 7 : 3, boost ? 5 : 4, boost ? 110 : 60);
    // the rain round the climbing flame catches its light
    if (boost && s < 4.5 && d < 900) litRain(W, cam, K, nz[0], nz[1] - Lf * .4, nz[2], 24, 1.5 * A * ss(0, .1, s) * (1 - inCloud(nz[1])), T, 41 + I.i * 3, 420, .03);
  }

  /* ================= plumes inside the cloud: the base lit from within, a patch of light that moves with the
     missile; lobes of the cloud's underside picked out round it ================= */
  const LOBE = 80;
  function cloudPatch(I, T) {
    if (T < I.tL || T > I.tI) return null;
    const h = OH.intAt(I, T); if (!h) return null;
    const dd = h[1] - CB; if (dd < -200) return null;
    const m = motor(T - I.tL);
    // deeper in, the light spreads wider and dimmer through the cloud
    const k = m * (dd > 0 ? .9 * Math.exp(-dd / 850) : .7 * Math.exp(dd / 95));
    return { h, dd, k, r: 110 + .6 * Math.abs(dd) };
  }
  function drawCloudGlow(W, cam, K, I, T, A) {
    const c = cloudPatch(I, T); if (!c || c.k < .01) return;
    const { h, dd, k, r } = c;
    const e = cam.eye, fk = .82 + .18 * noise(T * 9 + I.i * 3, 4.4);
    const base = [h[0], CB - 6, h[2]], d = V.dist(base, e), mk = mix(.35, 1, murk(d, K.vis * 1.6));
    // the glow seen through the base: soft and broad, broader the deeper the motor is in the cloud
    if (dd > -30) {
      K.glow(base, A * 1.05 * k * fk * mk, r * .5, 12, 300);
      K.glow(base, A * .3 * k * mk, r * 1.4, 36, 360);
    }
    // the underside's lobes (fixed in the drifting cloud) caught by the light
    const dr = OHS.drift(T), sx0 = h[0] * WX + h[2] * WZ - dr, nx0 = h[0] * WZ - h[2] * WX, R2 = Math.min(2.3 * r, 560);
    const i0 = Math.floor((sx0 - R2) / LOBE), i1 = Math.floor((sx0 + R2) / LOBE), j0 = Math.floor((nx0 - R2) / LOBE), j1 = Math.floor((nx0 + R2) / LOBE);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const im = modp(i, 3000 / LOBE), hh = hash(im * 1.7 + 3.1, j * 2.3 + .7);
      if (hh > .8) continue;
      const s = (i + .2 + .6 * hash(im, j + 5)) * LOBE + dr, nn = (j + .2 + .6 * hash(j + 9, im)) * LOBE;
      const x = s * WX + nn * WZ, z = s * WZ - nn * WX;
      const dx = x - h[0], dz = z - h[2], q = (dx * dx + dz * dz) / (r * r);
      if (q > 5.3) continue;
      const lit = k * Math.exp(-q / 2) * fk;
      const y = CB - 10 - 26 * hash(im + 4, j), rr = 22 + 26 * hash(j, im + 8);
      const dl = Math.hypot(x - e[0], y - e[1], z - e[2]);
      ringH(W, cam, [x, y, z], rr, A * .8 * lit * mix(.35, 1, murk(dl, K.vis * 1.6)), 22, .18, hh * 40);
      if (hh < .35) ringH(W, cam, [x + 9, y - 6, z - 6], rr * .55, A * .32 * lit, 16, .22, hh * 70);
    }
  }

  /* ================= far kills: SM-6 meets its round ~12 km out, inside the murk ================= */
  const KILLS = OH.INTS.map(I => {
    const miss = !!I.miss, t = miss ? I.tEnd : I.tI, p = miss ? OH.intAt(I, I.tEnd - 1e-3) : I.PI;
    const r = I.round, rd = OH.roundDir(r, Math.min(I.tI, r.tEnd - .02));
    return {
      I, t, p, miss, seed: 3.1 + I.i * 5.3,
      sparks: mkSparks(22, 40 + I.i, 45, 170),
      frags: miss ? [] : mkFrags(p, V.mul(rd, 680), 12, 70 + I.i, .3, .75, 60, 1.1),
    };
  });
  const killFlash = (k, a) => (Math.exp(-a / .12) + .3 * Math.exp(-a / .9)) * (k.miss ? .5 : 1);
  function drawFarKill(W, cam, K, k, T, A) {
    const a = T - k.t; if (a < 0 || a > 20) return;
    const p = k.p, d = V.dist(p, cam.eye), vis = K.vis, dirV = murk(d, vis), sc = k.miss ? .6 : 1;
    const fk = a < .4 ? .72 + .28 * noise(T * 55, k.seed) : 1, fl = killFlash(k, a) * fk;
    // what the murk lets through: the flash scattered into a broad soft light, broader the more rain between
    const sp = 1 + d / vis;
    if (a < 3.5) {
      K.glow(p, A * .9 * fl, 70 * sp * sc, 6, 260);
      K.glow(p, A * .3 * fl, 420 * sp * sc, 50, 560);
    }
    // the heaving sea under it catches the flash: a broken path of glints toward the lens
    if (a < 1.4) {
      const e = cam.eye, gx = e[0] - p[0], gz = e[2] - p[2], gl = Math.hypot(gx, gz), ux = gx / gl, uz = gz / gl;
      const gk = A * .55 * fl * mix(.35, 1, dirV);
      for (let q = 0; q < 9; q++) {
        const dq = 15 + q * q * 14, h1 = hash(q, k.seed + 3), w = (8 + 26 * h1) * (1 + dq / 400);
        const cx = p[0] + ux * dq + uz * (h1 - .5) * 30, cz = p[2] + uz * dq - ux * (h1 - .5) * 30;
        const ga = gk * (1 - q / 9) * (.5 + .5 * noise(T * 12 + q, k.seed));
        segW(W, cam, cx - uz * w, .3, cz + ux * w, cx + uz * w, .3, cz - ux * w, ga);
      }
    }
    // the burst itself, only as much as the rain lets through
    const dk = A * dirV;
    if (dk > .02) {
      if (a < .2) star(W, cam, p, 70 * sc, 26, dk * .9 * (1 - a / .2), k.seed, 12);
      if (a < 1.4) discS(W, cam, p, (22 + 230 * (1 - Math.exp(-a / .38))) * sc, dk * .6 * Math.pow(1 - a / 1.4, 1.6), 48);
      if (a < 2.2) ringH(W, cam, p, (30 + 360 * (1 - Math.exp(-a / .5))) * sc, dk * .32 * Math.pow(1 - a / 2.2, 1.5), 56);
      if (a < 2.4) drawSparks(W, cam, p, k.sparks, a, dk * .85, .12, k.t, T);
      drawFrags(W, cam, k.frags, a, dk * .7, T, 8);
      puffs(W, cam, p, k.t, T, k.miss ? 3 : 6, 20 * sc, 34 * sc, 80 * sc, dk * .36 * Math.exp(-a / 8), k.seed, .3);
    } else if (a < .25) star(W, cam, p, 0, 7, A * .55 * (1 - a / .25) * sc, k.seed, 8);
  }
  // the interceptor's flame seen far off through the rain: a moving point of light below the cloud
  function drawFarPlume(W, cam, K, I, T, A) {
    if (T < I.tL + 2 || T > I.tEnd) return;
    const h = OH.intAt(I, T); if (!h) return;
    const hide = 1 - inCloud(h[1]); if (hide < .03) return;
    const d = V.dist(h, cam.eye); if (d < 600) return;
    const fk = .8 + .2 * noise(T * 30 + I.i, 2.2), m = motor(T - I.tL);
    K.glow(h, A * hide * m * fk * mix(.3, .8, murk(d, K.vis)), 4 + d * .004, 3, 40);
    K.glow(h, A * hide * m * .22 * fk, 60 * (1 + d / K.vis), 10, 130);
    // I3 passing its round: the two lights cross, a flare as it goes by
    if (I.miss) {
      const u = Math.abs(T - I.tI); if (u < .35) {
        const w = A * hide * (1 - u / .35);
        K.glow(h, w * .5, 35 * (1 + d / K.vis), 8, 140);
        star(W, cam, h, 0, 9, w * .6, 5.5, 8);
      }
    }
  }

  /* ================= Phalanx: tracer streams through lit rain, muzzle fire, the close kill ================= */
  const ROF = 75, V0 = 1100, TD = 2.4, TR_LIFE = 1.75;
  for (const e of OH.CIWS_ENG) {
    if (!(e.b > 0)) continue;
    const n = Math.floor((e.t1 - e.t0) * ROF) + 1, M = new Float64Array(n * 3), Dd = new Float64Array(n * 3);
    for (let k = 0; k < n; k++) {
      const tk = e.t0 + k / ROF, st = OH.ciwsState(SA, tk), Xs = OH.shipXf(SA, tk), sst = { ciwsYaw: st.yaw, ciwsPitch: st.pitch };
      const m = X.ap(Xs, DA.ciws(sst, e.m)), d0 = X.dir(Xs, DA.ciwsDir(sst, e.m)), [U, Vv] = perp(d0);
      const g1 = (hash(k, e.m * 7 + 1) + hash(k + 3, e.m * 7 + 2) - 1) * .004, g2 = (hash(k + 5, e.m * 7 + 3) + hash(k + 7, e.m * 7 + 4) - 1) * .004;
      const d = V.norm([d0[0] + U[0] * g1 + Vv[0] * g2, d0[1] + U[1] * g1 + Vv[1] * g2, d0[2] + U[2] * g1 + Vv[2] * g2]);
      M.set(m, k * 3); Dd.set(d, k * 3);
    }
    e.n = n; e.M = M; e.Dd = Dd; e.seed = 7.7 + e.round.i * 3.9;
    const r = e.round;
    if (!e.late) {
      e.kp = OH.roundAt(r, r.tEnd); e.kd = OH.roundDir(r, r.tEnd - .02);
      e.frags = mkFrags(e.kp, V.mul(e.kd, 680), 38, 90 + e.m * 13 + r.i, .15, .6, 95, .65, .15);
      e.sparks = mkSparks(28, 120 + r.i, 40, 160);
    }
  }
  const FIRE_E = OH.CIWS_ENG.filter(e => e.b > 0), CLOSE = FIRE_E.filter(e => !e.late);
  function tracerAt(e, k, a, o) {
    const s = V0 * TD * (1 - Math.exp(-a / TD)), j = k * 3;
    o[0] = e.M[j] + e.Dd[j] * s; o[1] = e.M[j + 1] + e.Dd[j + 1] * s - 4.9 * a * a; o[2] = e.M[j + 2] + e.Dd[j + 2] * s + VK * a;
    return o;
  }
  const TQ0 = [0, 0, 0], TQ1 = [0, 0, 0];
  const muzzleFlick = (e, T) => { const fi = Math.floor(T * ROF); return .55 + .45 * hash(fi, e.m + 3); };
  function drawBurst(W, cam, K, e, T, A) {
    if (T < e.t0 || T > e.t1 + TR_LIFE + 4) return;
    const firing = T <= e.t1 + .02;
    if (T <= e.t1 + TR_LIFE) {
      // every round a dash flown from its own firing time; every third a brighter tracer
      const k1 = Math.min(e.n - 1, Math.floor((T - e.t0) * ROF)), k0 = Math.max(0, Math.ceil((T - TR_LIFE - e.t0) * ROF));
      for (let k = k0; k <= k1; k++) {
        const a = T - (e.t0 + k / ROF); if (a <= 0) continue;
        const tr = k % 3 === 0;
        tracerAt(e, k, Math.max(0, a - (tr ? .026 : .013)), TQ0); tracerAt(e, k, a, TQ1);
        const al = A * (tr ? 1 : .55) * ss(0, .012, a) * (1 - ss(TR_LIFE - .45, TR_LIFE, a));
        segW(W, cam, TQ0[0], TQ0[1], TQ0[2], TQ1[0], TQ1[1], TQ1[2], al);
      }
    }
    const Xh = heroX(T, K), cs = K.hero ? K.hero.ciws : OH.ciwsState(SA, T), sst = { ciwsYaw: cs.yaw, ciwsPitch: cs.pitch };
    const m = X.ap(Xh, DA.ciws(sst, e.m)), d = X.dir(Xh, DA.ciwsDir(sst, e.m));
    if (firing) {
      const [U, Vv] = perp(d);
      const fi = Math.floor(T * ROF), f1 = hash(fi, e.m + 3), f2 = hash(fi + 1, e.m + 5);
      for (let q = 0; q < 6; q++) {
        const ph = q / 6 * TAU + f2 * 3, sp = .12 + .22 * hash(q, fi % 97), L = 1 + 2 * f1 * (.6 + .4 * hash(q + 2, fi % 89));
        const tip = V.add(V.mad(m, d, L), V.add(V.mul(U, Math.cos(ph) * sp * L), V.mul(Vv, Math.sin(ph) * sp * L)));
        seg(W, cam, m, tip, A * .85);
      }
      for (let q = 0; q < 4; q++) { const ph = q / 4 * TAU + f1 * 2, l = .35 + .45 * f2; seg(W, cam, V.mad(m, d, .15), V.add(V.mad(m, d, .15), V.add(V.mul(U, Math.cos(ph) * l), V.mul(Vv, Math.sin(ph) * l))), A * .6); }
      K.glow(V.mad(m, d, .7), A * (.38 + .3 * f1), 2.4, 5, 70);
      K.glow(V.mad(m, d, 1), A * .12 * (.6 + .4 * f1), 9, 20, 160);
      // the rain round the muzzle and along the first of the stream flickers in the flash
      const lv = A * muzzleFlick(e, T);
      litRain(W, cam, K, m[0] + d[0] * 2, m[1] + d[1] * 2, m[2] + d[2] * 2, 12, 1.6 * lv, T, 61 + e.m, 600);
      litRain(W, cam, K, m[0] + d[0] * 22, m[1] + d[1] * 22, m[2] + d[2] * 22, 9, .7 * lv, T, 67 + e.m, 200);
      litRain(W, cam, K, m[0] + d[0] * 55, m[1] + d[1] * 55, m[2] + d[2] * 55, 9, .45 * lv, T, 71 + e.m, 160);
    }
    // gun smoke: wisps off the muzzle, torn off downwind at once
    const tEnd = Math.min(T, e.t1);
    for (let q = Math.max(0, Math.floor((T - 3 - e.t0) * 8)); e.t0 + q / 8 <= tEnd; q++) {
      const te = e.t0 + q / 8, a = T - te, k = Math.min(e.n - 1, Math.round((te - e.t0) * ROF)), j = k * 3, h = hash(q, e.m + 61);
      const kk = (3 + 4 * h) * (1 - Math.exp(-a / .2)), run = windRun(te, T, e.M[j + 1]);
      billow(W, cam, e.M[j] + e.Dd[j] * kk + WX * run, e.M[j + 1] + e.Dd[j + 1] * kk + .5 * a, e.M[j + 2] + e.Dd[j + 2] * kk + WZ * run,
        (.3 + 1.2 * Math.sqrt(a)) * (.6 + .8 * h), A * .1 * Math.exp(-a / 1.1) * ss(0, .06, a), e.m * 5.1 + q * 1.37, a, 0, 1, 1.8);
    }
  }
  function drawCloseKill(W, cam, K, e, T, A) {
    const t = e.round.tEnd, a = T - t; if (a < 0 || a > 22) return;
    const p = e.kp, d = V.dist(p, cam.eye);
    A *= mix(.45, 1, murk(d, K.vis));
    if (a < 2.5) K.glow(p, A * (1.1 * Math.exp(-a / .1) + .28 * Math.exp(-a / .7)), 24, 8, 190);
    if (a < 1.5) K.glow(p, A * .18 * Math.exp(-a / .3), 160, 30, 360);
    if (a < .14) star(W, cam, p, 14, 24, A * (1 - a / .14), e.seed, 12);
    if (a < 1) discS(W, cam, p, 3 + 42 * (1 - Math.exp(-a / .24)), A * .6 * Math.pow(1 - a, 1.6), 48);
    if (a < .7) discS(W, cam, p, 2 + 17 * (1 - Math.exp(-a / .14)), A * .5 * Math.pow(1 - a / .7, 2), 32);
    if (a < 1.6) ringH(W, cam, [p[0], OH.swellAt(p[0], p[2], T) * .9 + .1, p[2]], 4 + 60 * (1 - Math.exp(-a / .35)), A * .35 * (1 - a / 1.6), 48, .12, e.seed);
    if (a < 2) drawSparks(W, cam, p, e.sparks, a, A * .85, .07, t, T);
    drawFrags(W, cam, e.frags, a, A * .8, T, 5.5);
    puffs(W, cam, p, t, T, 6, 2.5, 7.5, 9, A * .32 * Math.exp(-a / 5), e.seed, .15, [e.kd[0] * 45, e.kd[1] * 45, e.kd[2] * 45, .45]);
    if (a < .6) litRain(W, cam, K, p[0], p[1], p[2], 45, 1.2 * A * Math.exp(-a / .12), T, 83, 360);
  }

  /* ================= the hit forward ================= */
  const HX0 = OH.shipXf(SA, HIT.t), HP0 = X.ap(HX0, HIT.at), RD4 = OH.roundDir(RID.R4, HIT.t - .02);
  const VSHIP = [0, 0, VK];
  // mostly out over the starboard side and up, some carried on across the forecastle by the round's momentum
  const HIT_DEB = mkFrags(HP0, V.mul(X.dir(HX0, V.norm([.75, .62, .2])), 24), 46, 311, .3, 1.3, 16, 1.3, 0, VSHIP)
    .concat(mkFrags(HP0, V.mul(RD4, 60), 14, 377, .35, 1, 12, .55, .35, VSHIP));
  const HIT_SPK = mkSparks(34, 333, 18, 70, .3);
  const hB = OH.hB, hW = OH.hW, hD = DA.deckY;
  // the hull side at height y (after hd_sea_air's section: waterline, knuckle, deck edge)
  function sideX(z, y) {
    const d = hD(z), b = hB(z), w = hW(z), yk = d - Math.min(1.6, d * .3), kx = w + (b - w) * .9;
    return y <= yk ? w + (kx - w) * Math.max(0, y) / yk : kx + (b - kx) * (y - yk) / (d - yk);
  }
  // across the deck edge: s < 0 inboard on the deck, s > 0 down the side; lift along the surface normal
  function wrapP(z, s, lift) {
    lift = lift === undefined ? .05 : lift;
    if (s <= 0) return [hB(z) + s, hD(z) + lift, z];
    const y = hD(z) - s; return [sideX(z, y) + lift, y, z];
  }
  const DMG = (() => {
    const z0 = HIT.at[2], s0 = .85, n = 16, out = [], lip = [], petals = [], cracks = [];
    const th = [], rz = [], rs = [];
    for (let k = 0; k < n; k++) {
      const t = k / n * TAU, rr = (k % 2 ? .86 : 1.06) * (.9 + .2 * hash(k, 51));
      th.push(t); rz.push(Math.cos(t) * 2.3 * rr); rs.push(Math.sin(t) * 1.35 * rr);
    }
    // the hole's torn edge, subdivided so it wraps the deck edge; a second line just inside it for the lip
    for (let k = 0; k < n; k++) {
      const a = k, b = (k + 1) % n;
      for (let q = 0; q < 3; q++) {
        const f = q / 3, zz = rz[a] + (rz[b] - rz[a]) * f, sv = rs[a] + (rs[b] - rs[a]) * f;
        out.push(wrapP(z0 + zz, s0 + sv, .06)); lip.push(wrapP(z0 + zz * .78, s0 + sv * .74, -.25));
      }
    }
    out.push(out[0]); lip.push(lip[0]);
    // plating torn back off the lip, curled outward
    for (let k = 1; k < n; k += 3) {
      const z = z0 + rz[k], s = s0 + rs[k], c = Math.cos(th[k]), sn = Math.sin(th[k]), L = .6 + .5 * hash(k, 52);
      petals.push([wrapP(z, s, .06), wrapP(z + c * L * .45, s + sn * L * .45, .35 + .3 * hash(k, 53)), wrapP(z + c * L * .6, s + sn * L * .7, .8 + .4 * hash(k, 54))]);
    }
    for (let k = 0; k < 3; k++) {
      const t = (k + .6 + .3 * hash(k, 55)) / 3 * TAU, c = Math.cos(t), sn = Math.sin(t), L = .6 + .8 * hash(k, 56), pts = [];
      for (let q = 0; q <= 2; q++) {
        const f = 1.08 + L * q / 2, j = (hash(k * 5 + q, 57) - .5) * .35 * q;
        pts.push(wrapP(z0 + c * 2.3 * f - sn * j, s0 + sn * 1.35 * f + c * j, .05));
      }
      cracks.push(pts);
    }
    // scorch: a ragged ring round the hole, across the edge
    const scorch = [];
    for (let k = 0; k <= 28; k++) {
      const t = k / 28 * TAU, rr = .85 + .3 * hash(k % 28, 58) + .1 * Math.sin(3 * t + 1.7);
      scorch.push(wrapP(z0 - .4 + Math.cos(t) * 4.2 * rr, s0 + .2 + Math.sin(t) * 2.4 * rr, .04));
    }
    // the lifeline: stanchions every 3 m (hd_sea_air), two torn over the side, the wires parted and hanging
    const st = z => [hB(z) - .15, hD(z), z];
    const rail = [];
    const zA = 46.4, zB = 49.4, zC = 52.4, zD = 55.4;
    const top = z => [hB(z) - .15, hD(z) + 1, z], mid = z => [hB(z) - .15, hD(z) + .5, z];
    const bentB = [hB(zB) + .55, hD(zB) + .6, zB - .45], bentC = [hB(zC) + .95, hD(zC) + .15, zC + .2];
    rail.push([st(zB), [hB(zB) + .15, hD(zB) + .45, zB - .2], bentB]);
    rail.push([st(zC), [hB(zC) + .35, hD(zC) + .22, zC + .05], bentC]);
    rail.push([top(zA), [hB(47.9) + .1, hD(47.9) + .9, 47.9], bentB, [hB(50.4) + .35, hD(50.4) - .6, 50.3], [hB(50.6) + .3, hD(50.6) - 1.4, 50.7]]);
    rail.push([top(zD), [hB(53.9) + .15, hD(53.9) + .8, 53.9], bentC, [hB(51.8) + .55, hD(51.8) - .5, 51.7], [hB(51.6) + .45, hD(51.6) - 1.1, 51.5]]);
    rail.push([mid(zA), [hB(48) + .2, hD(48) + .3, 48], [hB(zB) + .45, hD(zB) + .1, zB - .3], [hB(50) + .4, hD(50) - .9, 50.1]]);
    rail.push([mid(zD), [hB(54) + .25, hD(54) + .25, 54], [hB(zC) + .7, hD(zC) - .1, zC + .1], [hB(52) + .5, hD(52) - .7, 51.9]]);
    return { out, lip, petals, cracks, scorch, rail };
  })();

  // the fire: flares, settles into a working fire, knocked down each time a sea comes over the forecastle, and
  // beaten out by the rain and the repair party by ~134 s
  const douse = T => {
    let v = 0;
    for (const { sl, age } of OH.slamsAt(SA, T, 3)) v += sl.s * ss(.25, .55, age) * (1 - ss(1, 2.6, age));
    return Math.min(1, v * 1.4);
  };
  const fireBase = T => { const a = T - HIT.t; return a < 0 ? 0 : ss(0, .5, a) * (1 + .4 * Math.exp(-a / 2.5)) * mix(1, .72, ss(6, 12, a)) * (1 - ss(124 - HIT.t, 134.5 - HIT.t, a)); };
  const fireK = T => fireBase(T) * (1 - .6 * douse(T));
  OHFX.fireK = fireK;
  // smoke parcels off the fire: each carried off downwind from where the fire was when it left
  const SM_DT = .2, PARCELS = [];
  for (let te = HIT.t + .25; te < 137.5; te += SM_DT) {
    const k = PARCELS.length, em = Math.max(fireBase(te), .35 * ss(HIT.t, HIT.t + .6, te) * (1 - ss(127, 137.5, te)));
    PARCELS.push({ te, src: X.ap(OH.shipXf(SA, te), [HIT.fire[0] - 1 + 2 * hash(k, 5), HIT.fire[1] + .4, HIT.fire[2] - 1.2 + 2.4 * hash(k, 6)]), em, h1: hash(k, 7), h2: hash(k, 13), h3: hash(k, 29) });
  }
  const SM_LIFE = 10.5;
  const smRise = a => 5 * (1 - Math.exp(-a / 1.6)) + .7 * a;
  const smRad = a => 1.1 + 2.3 * Math.sqrt(a) + .45 * a;
  const SQ = [0, 0, 0];
  function smokeAt(p, T, o) {
    const a = T - p.te, s = p.src, run = windRun(p.te, T, s[1] + 4), tu = 1.2 + a * 1.1;
    o[0] = s[0] + WX * run + (p.h2 - .5) * tu + WZ * (p.h1 - .5) * a * 1.4;
    o[1] = s[1] + smRise(a) * (.7 + .6 * p.h1) + 1.5 * noise(p.te * 2.1, a * .4, 3.3) * sat(a);
    o[2] = s[2] + WZ * run + (p.h3 - .5) * tu - WX * (p.h1 - .5) * a * 1.4;
    return a;
  }
  function drawSmoke(W, cam, K, T, A) {
    const e = cam.eye;
    let pv = false, px0 = 0, py0 = 0, px1 = 0, py1 = 0;
    for (const p of PARCELS) {
      const a = T - p.te; if (a < 0) break;
      if (a > SM_LIFE) { pv = false; continue; }
      smokeAt(p, T, SQ);
      const r = smRad(a) * (.8 + .4 * p.h2), life = 1 - ss(SM_LIFE * .55, SM_LIFE, a);
      const al = A * .24 * p.em * ss(0, .3, a) * Math.exp(-a / 5) * life * mix(.4, 1, murk(Math.hypot(SQ[0] - e[0], SQ[1] - e[1], SQ[2] - e[2]), K.vis));
      billow(W, cam, SQ[0], SQ[1], SQ[2], r, al, p.h1 * 31 + p.te, a, p.h3 > .5 ? 2 : 1, .5, 1.25 + .8 * sat(a / 4));
      // the stream's upper and lower edges from parcel to parcel, torn into pieces
      if (pj(cam, SQ[0], SQ[1] + r * .75, SQ[2])) {
        const ax = PJ[0], ay = PJ[1];
        if (pj(cam, SQ[0], SQ[1] - r * .45, SQ[2])) {
          const bx = PJ[0], by = PJ[1], br = sat(.5 + 1.4 * noise(p.te * 1.7, a * .3, 5.5));
          if (pv) { W.seg2(px0, py0, ax, ay, al * .8 * br); W.seg2(px1, py1, bx, by, al * .5 * (1 - br * .5)); }
          px0 = ax; py0 = ay; px1 = bx; py1 = by; pv = true;
        } else pv = false;
      } else pv = false;
    }
  }
  function drawFire(W, cam, K, T, A) {
    const fk = fireK(T) * A; if (fk <= .004) return;
    const Xh = heroX(T, K), F0 = X.ap(Xh, HIT.fire), side = X.dir(Xh, [1, 0, 0]), fwd = X.dir(Xh, [0, 0, 1]), upS = X.dir(Xh, [0, 1, 0]);
    // the flames lie over in the relative wind (the gale plus the ship's own way): aft and to port across the deck
    const rw = OH.windSpd(T), rx = WX * rw, rz = WZ * rw - VK, rl = Math.hypot(rx, rz), lean = [rx / rl, 0, rz / rl];
    const e = cam.eye, ax = V.norm([lean[0] * .9, 1, lean[2] * .9]);
    const cs = V.norm(V.cross(ax, [e[0] - F0[0], e[1] - F0[1], e[2] - F0[2]]));
    for (let k = 0; k < 14; k++) {
      const kk = k % 9, inner = k >= 9, Pk = .38 + .28 * hash(k, 83), ph = T / Pk + hash(k, 84), u = fr(ph), cyc = Math.floor(ph);
      const H = (2.4 + 4.6 * hash(k, cyc * 1.7 + 85)) * (.4 + .6 * fk) * (inner ? .55 : 1);
      const ht = H * (.3 + .7 * Math.pow(Math.sin(PI * Math.min(1, u * 1.2)), .7));
      const bx = -2.2 + (kk / 8) * 3.4 + (hash(kk, 86) - .5) * .5, bz = (hash(kk, 81) - .5) * 4, w0 = (.75 + .7 * hash(k, 87)) * (inner ? .5 : 1);
      const b0 = F0[0] + side[0] * bx + fwd[0] * bz, b1 = F0[1] + side[1] * bx + fwd[1] * bz - .3, b2 = F0[2] + side[2] * bx + fwd[2] * bz;
      let lx = 0, ly = 0, lz = 0, qx = 0, qy = 0, qz = 0;
      const al = fk * (inner ? .85 : .7);
      for (let q = 0; q <= 7; q++) {
        const t = q / 7, y = ht * t, wd = w0 * Math.pow(Math.sin(PI * Math.min(1, (t + .12) / 1.12)), .75);
        const wob = .6 * t * noise(T * 7.5 + k * 1.9, t * 2.2 + k), lk = y * (.3 + .85 * t);
        const cx = b0 + lean[0] * lk + cs[0] * wob, cy = b1 + y + cs[1] * wob, cz = b2 + lean[2] * lk + cs[2] * wob;
        const Lx = cx - cs[0] * wd, Ly = cy - cs[1] * wd, Lz = cz - cs[2] * wd, Rx = cx + cs[0] * wd, Ry = cy + cs[1] * wd, Rz = cz + cs[2] * wd;
        if (q) { segW(W, cam, lx, ly, lz, Lx, Ly, Lz, al * (1 - t * .35)); segW(W, cam, qx, qy, qz, Rx, Ry, Rz, al * (1 - t * .35)); }
        lx = Lx; ly = Ly; lz = Lz; qx = Rx; qy = Ry; qz = Rz;
      }
      // the top tears off and streams away downwind
      if (!inner && u > .5) {
        const v = (u - .5) / .5, lk = ht * 1.15 + 5 * v, y = ht + 1.2 * v;
        const cx = b0 + lean[0] * lk, cy = b1 + y, cz = b2 + lean[2] * lk, L = 1 + 1.5 * v;
        segW(W, cam, cx, cy, cz, cx + lean[0] * L, cy + .2, cz + lean[2] * L, al * .8 * (1 - v));
        segW(W, cam, cx + cs[0] * .25, cy - .25, cz + cs[2] * .25, cx + lean[0] * L * .7, cy + .05, cz + lean[2] * L * .7, al * .5 * (1 - v));
      }
    }
    // embers blown off down the wind
    for (let j = 0; j < 22; j++) {
      const Pj = .9 + .7 * hash(j, 91), ph = (T + hash(j, 92) * 5) / Pj, u = fr(ph), cyc = Math.floor(ph);
      const t = u * Pj, h1 = hash(j, cyc + 93), h2 = hash(j + 7, cyc + 93), run = 14 * t + 6 * t * t;
      const x = F0[0] + side[0] * (h1 - .5) * 4 + lean[0] * run, y = F0[1] + 4.5 * t - 2 * t * t + 1.5 * h2, z = F0[2] + side[2] * (h1 - .5) * 4 + fwd[2] * (h2 - .5) * 3 + lean[2] * run;
      segW(W, cam, x, y, z, x - lean[0] * .9, y - .1, z - lean[2] * .9, .75 * fk * (1 - u) * ss(0, .08, u));
    }
    K.glow(V.add(F0, V.mul(upS, 2.4)), fk * .32 * (.75 + .25 * noise(T * 8, 3.3)), 9, 8, 160);
    // steam where a sea comes aboard onto the fire
    for (const { sl, age } of OH.slamsAt(SA, T, 3.2)) {
      const a = age - .35; if (a <= 0) continue;
      const te = T - a, k0 = fireBase(te); if (k0 < .05) continue;
      for (let q = 0; q < 4; q++) {
        const h = hash(q, sl.seed), run = windRun(te, T, F0[1]);
        billow(W, cam, F0[0] + side[0] * (h - .5) * 3 + WX * run, F0[1] + 1 + 4.5 * (1 - Math.exp(-a / .8)) + q * .6, F0[2] + side[2] * (h - .5) * 3 + WZ * run,
          1 + 2.2 * Math.sqrt(a), A * .3 * sl.s * k0 * Math.exp(-a / 1.1) * ss(0, .15, a), sl.seed + q * 2.3, a, 1, .5, 1.6);
      }
    }
  }
  function drawDamage(W, cam, K, T, A) {
    const Xh = heroX(T, K), P = p => X.ap(Xh, p);
    const k = A * K.L * ss(HIT.t + .3, HIT.t + .9, T);
    if (k <= .005) return;
    W.style(HI, 1);
    const o = DMG.out.map(P), l = DMG.lip.map(P);
    for (let i = 0; i < o.length - 1; i++) { seg(W, cam, o[i], o[i + 1], k); seg(W, cam, l[i], l[i + 1], k * .45); }
    for (const pt of DMG.petals) { const q = pt.map(P); seg(W, cam, q[0], q[1], k * .9); seg(W, cam, q[1], q[2], k * .7); }
    for (const c of DMG.cracks) { const q = c.map(P); for (let i = 0; i < q.length - 1; i++) seg(W, cam, q[i], q[i + 1], k * .5 * (1 - i * .3)); }
    for (const r of DMG.rail) { const q = r.map(P); for (let i = 0; i < q.length - 1; i++) seg(W, cam, q[i], q[i + 1], k * .85); }
    const sc = DMG.scorch.map(P);
    for (let i = 0; i < sc.length - 1; i += 2) seg(W, cam, sc[i], sc[i + 1], k * .3);
    W.style(WH, 1);
  }
  function drawHit(W, cam, K, T, A) {
    const a = T - HIT.t; if (a < 0) return;
    const Xh = heroX(T, K);
    if (a < 12) {
      // flash
      if (a < 3) K.glow(HP0, A * (1.2 * Math.exp(-a / .09) + .34 * Math.exp(-a / .7)), 32, 16, 260);
      if (a < 1) K.glow(HP0, A * .25 * Math.exp(-a / .25), 220, 60, 520);
      if (a < .16) star(W, cam, HP0, 20, 44, A * (1 - a / .16), 4.4, 16);
      if (a < .5) litRain(W, cam, K, HP0[0], HP0[1] + 4, HP0[2], 42, 1.5 * A * Math.exp(-a / .09), T, 97, 900);
      // shock front, its print on the water
      if (a < .8) discS(W, cam, HP0, 2 + 110 * (1 - Math.exp(-a / .22)), A * .5 * Math.pow(1 - a / .8, 2), 64);
      if (a < 1.4) ringH(W, cam, [HP0[0] + 3, OH.swellAt(HP0[0] + 3, HP0[2], T) * .9 + .15, HP0[2]], 5 + 60 * (1 - Math.exp(-a / .4)), A * .4 * Math.pow(1 - a / 1.4, 1.4), 64, .15, 2.2);
      // the fireball rolls up in rings that rise and are torn off downwind
      for (let k = 0; k < 3; k++) {
        const ak = a - k * .07; if (ak <= 0 || ak > 1.8) continue;
        const g = 1 - Math.exp(-ak / .3), run = windRun(HIT.t, T, 20) * .7;
        const c = [HP0[0] + 2 * g + WX * run, HP0[1] + 1.2 + (4 + 3 * k) * g + 3.5 * ak, HP0[2] + WZ * run];
        const r = (1.5 + (7.5 - 1.8 * k) * g) * (1 + .25 * ak);
        const al = A * .62 * Math.pow(1 - ak / 1.8, 1.5);
        ringA(W, cam, c, UX, UZ, r, al, al * .45, 44, .14 + .1 * ak, k * 2.1 + ak * 2);
      }
      // fireball: layered billows, swelling, rising off the bow and ripped off downwind, becoming smoke
      if (a < 7) for (let k = 0; k < 8; k++) {
        const h1 = hash(k, 71), h2 = hash(k + 1, 71), h3 = hash(k + 2, 71), g = 1 - Math.exp(-a / .4), run = windRun(HIT.t, T, 15) * (.75 + .3 * h1);
        const x = HP0[0] + (h1 - .2) * 9 * g + WX * run, y = HP0[1] + 1 + 6 * g * (.4 + h2) + 2.4 * a, z = HP0[2] + (h3 - .5) * 10 * g + WZ * run;
        billow(W, cam, x, y, z, (2 + 8.5 * g + 1.1 * a) * (.7 + .5 * h2), A * .72 * Math.exp(-a / 1.6) * ss(0, .04, a), 9.1 + k * 1.9, a, 2, .6, 1 + .5 * sat(a / 1.5));
      }
      // sparks, debris arcing into the sea
      if (a < 2) drawSparks(W, cam, HP0, HIT_SPK, a, A * .9, .06, HIT.t, T);
      if (a < 8) for (const F of HIT_DEB) {
        if (a < F.tImp) {
          let q0 = fragAt(F, Math.max(0, a - .15));
          for (let s = 1; s <= 3; s++) { const q1 = fragAt(F, Math.max(0, a - .15 + .05 * s)); seg(W, cam, q0, q1, A * (.25 + .6 * F.big) * (s / 3)); q0 = q1; }
        } else if (F.imp && F.big > .4) splash(W, cam, F.imp[0], F.imp[2], a - F.tImp, 2 + 3.5 * F.big, A * .7, F.h * 91, T);
      }
      // the yellow flash that marks the breach, on the side plating
      if (a < .75) {
        W.style(HI, 1);
        const U = X.dir(Xh, [0, 0, 1]), Vv = X.dir(Xh, [0, 1, 0]);
        const c = X.ap(Xh, [sideX(HIT.at[2], hD(HIT.at[2]) - .4) + .1, hD(HIT.at[2]) - .4, HIT.at[2]]);
        const w = A * Math.pow(1 - a / .75, 1.4);
        ringA(W, cam, c, U, Vv, .8 + 11 * (1 - Math.exp(-a / .16)), w * .9, w * .5, 40, .06, 1.3);
        if (a < .3) ringA(W, cam, c, U, Vv, .5 + 4 * (1 - Math.exp(-a / .07)), w, w * .6, 28, .1, 2.9);
        W.style(WH, 1);
      }
    }
    drawFire(W, cam, K, T, A);
    drawSmoke(W, cam, K, T, A);
    if (T < 150) drawDamage(W, cam, K, T, A);
  }

  /* ================= lights: the cloud base lit from below / within, point lights for the spray ================= */
  const CL = { t: NaN, n: 0, x: new Float64Array(16), z: new Float64Array(16), r: new Float64Array(16), k: new Float64Array(16) };
  const PL = { t: NaN, n: 0, x: new Float64Array(16), y: new Float64Array(16), z: new Float64Array(16), r: new Float64Array(16), k: new Float64Array(16) };
  const addC = (x, z, r, k) => { if (k <= .004 || CL.n >= 16) return; const i = CL.n++; CL.x[i] = x; CL.z[i] = z; CL.r[i] = 1 / (2 * r * r); CL.k[i] = k; };
  const addP = (x, y, z, r, k) => { if (k <= .004 || PL.n >= 16) return; const i = PL.n++; PL.x[i] = x; PL.y[i] = y; PL.z[i] = z; PL.r[i] = r * r; PL.k[i] = k; };
  function prep(T) {
    if (CL.t === T) return;
    CL.t = T; CL.n = 0; PL.n = 0;
    for (const I of OH.INTS) {
      const s = T - I.tL; if (s < -.05 || T > I.tI) continue;
      if (s < 1.4) { const k = Math.exp(-Math.max(0, s) / .32); addC(I.P0[0], I.P0[2], 420, .2 * k); addP(I.P0[0], I.P0[1], I.P0[2], 34, 1.1 * k); }
      const c = cloudPatch(I, T); if (c) addC(c.h[0], c.h[2], c.r, c.k * 2.2);
      if (s < 4) { const h = OH.intAt(I, T); if (h && h[1] < 160) addP(h[0], h[1], h[2], 26, .7 * motor(s)); }
    }
    for (const k of KILLS) { const a = T - k.t; if (a >= 0 && a < 2.5) addC(k.p[0], k.p[2], 1500, 1.1 * killFlash(k, a)); }
    for (const e of CLOSE) { const a = T - e.round.tEnd; if (a >= 0 && a < 1.5) addC(e.kp[0], e.kp[2], 520, .32 * Math.exp(-a / .15)); }
    for (const e of FIRE_E) if (T >= e.t0 && T <= e.t1) {
      const cs = OH.ciwsState(SA, T), Xs = OH.shipXf(SA, T), m = X.ap(Xs, DA.ciws({ ciwsYaw: cs.yaw, ciwsPitch: cs.pitch }, e.m));
      addP(m[0], m[1], m[2], 12, .7 * muzzleFlick(e, T));
    }
    const a = T - HIT.t;
    if (a >= 0 && a < 1.5) { addC(HP0[0], HP0[2], 650, .6 * Math.exp(-a / .12)); addP(HP0[0], HP0[1] + 3, HP0[2], 45, 1.4 * Math.exp(-a / .1) + .35 * Math.exp(-a / .6)); }
    const fk = fireK(T);
    if (fk > .01) { const F = X.ap(OH.shipXf(SA, T), HIT.fire); addP(F[0], F[1] + 2, F[2], 16, .5 * fk * (.8 + .2 * noise(T * 8, 3.3))); }
  }
  OHS.fxLit = (x, z, T) => {
    prep(T); let v = 0;
    for (let i = 0; i < CL.n; i++) { const dx = x - CL.x[i], dz = z - CL.z[i]; v += CL.k[i] * Math.exp(-(dx * dx + dz * dz) * CL.r[i]); }
    return v;
  };
  OHS.fxLitN = T => { prep(T); return CL.n; };
  const lightAt = (x, y, z) => {
    let v = 0;
    for (let i = 0; i < PL.n; i++) { const dx = x - PL.x[i], dy = y - PL.y[i], dz = z - PL.z[i]; v += PL.k[i] * PL.r[i] / (PL.r[i] + dx * dx + dy * dy + dz * dz); }
    return v;
  };

  /* ================= hooks ================= */
  const seamK = T => 1 - ss(146, 150, T);
  Object.assign(OHFX, {
    /* Mk 41 launch blasts over the forward cells, SM-6 boost plumes and their smoke torn off downwind */
    launchFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const I of OH.INTS) {
        const s = T - I.tL; if (s < -.05 || s > 45) continue;
        if (s >= 0) { drawTrail(K.W, K.cam, K, I, T, A); drawCloud(K.W, K.cam, I, T, A); }
        drawVent(K.W, K.cam, K, I, T, A);
        if (s >= 0 && T <= I.tEnd) drawPlume(K.W, K.cam, K, I, T, A);
        if (s >= 0 && s < 1.2) litRain(K.W, K.cam, K, I.P0[0], I.P0[1] + 6, I.P0[2], 34, 1.6 * A * Math.exp(-s / .35), T, 31 + I.i, 800);
      }
    },
    /* the interceptors' plumes glowing inside the cloud layer, the base lit from within */
    cloudGlowFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const I of OH.INTS) drawCloudGlow(K.W, K.cam, K, I, T, A);
    },
    /* far flashes where I1 / I2 meet R1 / R2 in the rain; I3 missing R4 and flying on */
    interceptFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const I of OH.INTS) drawFarPlume(K.W, K.cam, K, I, T, A);
      for (const k of KILLS) drawFarKill(K.W, K.cam, K, k, T, A);
    },
    /* forward Phalanx tracer through the rain (R3 kill, then R4), muzzle fire, gun smoke */
    ciwsFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const e of FIRE_E) drawBurst(K.W, K.cam, K, e, T, A);
      for (const e of CLOSE) drawCloseKill(K.W, K.cam, K, e, T, A);
    },
    /* R4's strike on the starboard bow: flash, debris, fire and smoke; the damage shown by the lightning */
    hitFx(T, K) { if (T >= HIT.t && T < 150) drawHit(K.W, K.cam, K, T, K.dim); },
    /* extra camera shake (px): the hit, the close kill and its shock, launches, the Phalanx's own vibration */
    shake(T) {
      let amp = 0;
      const h = T - HIT.t; if (h >= 0 && h < 3) amp += 17 * Math.exp(-h / .3);
      for (const e of CLOSE) {
        const a = T - e.round.tEnd; if (a >= 0 && a < 1.2) amp += 3 * Math.exp(-a / .2);
        const b = a - 1.5; if (b >= 0 && b < 1.2) amp += 2.6 * Math.exp(-b / .22);
      }
      for (const e of FIRE_E) if (T >= e.t0 - .05 && T <= e.t1 + .05) amp += 1.3;
      for (const I of OH.INTS) { const a = T - I.tL; if (a >= 0 && a < 3) amp += 2.4 * ss(0, .08, a) * Math.exp(-a / .8); }
      return amp > .05 ? FILM.shake(T, amp, 21) : null;
    },
    /* the flashes of this file lift every hairline at flush, like the lightning */
    lift(T) {
      let v = 0;
      const h = T - HIT.t;
      if (h >= 0 && h < 2) v = Math.max(v, (.95 * Math.exp(-h / .07) + .3 * Math.exp(-h / .45)) * (h < .25 ? .8 + .2 * noise(T * 70, 1.1) : 1));
      for (const I of OH.INTS) { const a = T - I.tL; if (a >= 0 && a < 1.5) v = Math.max(v, .2 * Math.exp(-a / .25)); }
      for (const e of FIRE_E) if (T >= e.t0 && T <= e.t1) v = Math.max(v, .05 + .07 * muzzleFlick(e, T));
      for (const e of CLOSE) { const a = T - e.round.tEnd; if (a >= 0 && a < 1) v = Math.max(v, .22 * Math.exp(-a / .1)); }
      for (const k of KILLS) { const a = T - k.t; if (a >= 0 && a < 1) v = Math.max(v, .05 * killFlash(k, a)); }
      return Math.min(1, v);
    },
    /* point lights near the ship at T (launch flash, climbing flame, muzzle, the hit, the fire) for the bow spray:
       a function (x, y, z) -> added light, or null */
    lightFn(T) { prep(T); return PL.n ? lightAt : null; },
    billow, windRun,
  });

  /* ================= sound (added to the film's cues; fired only in real time) ================= */
  const S = STAGE.SFX, CU = OHFX.cues;
  const dShip = (p, t) => V.dist(p, OH.shipPos(SA, t));
  for (const I of OH.INTS) {
    CU.push([I.tL + .25, () => { S.noise(5.5, 420, .7, .06, .5); S.noise(2.2, 1600, .5, .02, .2); }]);
    if (I.tCloud[0]) CU.push([I.tCloud[0] + .4, () => S.noise(3, 220, .8, .035, .6)]);
  }
  for (const e of CLOSE) {
    const t = e.round.tEnd, dl = Math.min(1.8, dShip(e.kp, t) / 343);
    CU.push([t + dl, () => { S.crack(); S.tone(70, 38, .8, 'sine', .09); }]);
    CU.push([t + dl + .7, () => S.noise(1.4, 650, .5, .035, .06)]);
  }
  for (const k of KILLS) if (k.miss) CU.push([k.t + Math.min(6, dShip(k.p, k.t) / 343 * .35), () => S.tone(60, 40, .9, 'sine', .025)]);
  CU.push([HIT.t + .12, () => S.noise(1.6, 3400, .5, .06, .01)]);
  CU.push([HIT.t + .35, () => S.noise(5, 300, .7, .1, .45)]);
  CU.push([HIT.t + 1.4, () => S.noise(1.8, 800, .5, .03, .08)]);
  CU.push([HIT.t + 2.2, () => S.noise(11, 1100, .45, .018, 1.8)]);
  for (const sl of OH.SLAMS) {
    const t = sl.tau + .4;
    if (t > HIT.t + 1 && t < 134 && fireBase(t) > .1) CU.push([t, () => S.noise(1.3, 5200, .5, .03 * sl.s, .05)]);
  }
})();
