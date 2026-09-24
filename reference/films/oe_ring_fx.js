/* OE "Ring" combat effects (stage B). Stage A calls each hook every frame, after the scene's hairlines and before
   the flush, with the film time T and a context K:
     K.W       the Wire (hairline segments: K.W.seg(a, b, alpha), K.W.seg2 screen space, K.W.ring, K.W.disc)
     K.cam     the M3.Cam of this frame
     K.glow(p, a, m, px, max)   additive radial glow drawn after the flush (restrained bloom)
     K.hero    { X: A's ship transform at T (rolling), ciws: {yaw, pitch}, gun: {yaw, pitch}, spin: [f, a] } or null
     K.dim     0..1 world visibility (drops inside the fire's smoke)
   Data: OE.ROUNDS, OE.INTS, OE.CIWS_ENG, OE.GUN_ENG, OE.DECOYS, OE.HIT, OE.EVENTS (oe_ring_world.js).
   Spectacle only: launch blasts, smoke-ring trails, flames, far bursts, tracer, shell bursts, chaff, debris, splashes,
   the hit and its fire. Every element is analytic in its own event time plus seeded hashes (loaded tables for
   tracer muzzles, debris impacts, shell meeting points), so render(T) stays a pure function of T. Nothing lingering
   survives the smoke veil before the seam (seamK). OEFX.billow draws smoke for film.js too. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const { PI, TAU, hash, DA, WIND, VK } = OE;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp, noise = M3.noise;
  const HI = '#F4D23C', WH = '#F6F5F2', G = 9.81, SA = OE.A;
  const fr = x => x - Math.floor(x);
  // A's fight leaves no trace across the seam: whatever still lingers fades while the smoke veils the lens
  const seamK = T => 1 - ss(146.5, 151.5, T);

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
  /* world segment, near-clipped (the hooks run with fog off) */
  function segW(W, cam, ax, ay, az, bx, by, bz, al) {
    if (al <= .004) return;
    const e = cam.eye, f = cam.f, r = cam.r, u = cam.u, n = cam.near;
    const x0 = ax - e[0], y0 = ay - e[1], z0 = az - e[2], x1 = bx - e[0], y1 = by - e[1], z1 = bz - e[2];
    let A0 = x0 * r[0] + y0 * r[1] + z0 * r[2], B0 = x0 * u[0] + y0 * u[1] + z0 * u[2], C0 = x0 * f[0] + y0 * f[1] + z0 * f[2];
    let A1 = x1 * r[0] + y1 * r[1] + z1 * r[2], B1 = x1 * u[0] + y1 * u[1] + z1 * u[2], C1 = x1 * f[0] + y1 * f[1] + z1 * f[2];
    if (C0 < n && C1 < n) return;
    if (C0 < n) { const t = (n - C0) / (C1 - C0); A0 += (A1 - A0) * t; B0 += (B1 - B0) * t; C0 = n; }
    else if (C1 < n) { const t = (n - C1) / (C0 - C1); A1 += (A0 - A1) * t; B1 += (B0 - B1) * t; C1 = n; }
    const cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], fl = cam.fl;
    const px0 = cx + fl * A0 / C0, py0 = cy - fl * B0 / C0, px1 = cx + fl * A1 / C1, py1 = cy - fl * B1 / C1;
    const m = 40, Wd = cam.W, Hd = cam.H;
    if ((px0 < -m && px1 < -m) || (px0 > Wd + m && px1 > Wd + m) || (py0 < -m && py1 < -m) || (py0 > Hd + m && py1 > Hd + m)) return;
    W.seg2(px0, py0, px1, py1, al);
  }
  const seg = (W, cam, a, b, al) => segW(W, cam, a[0], a[1], a[2], b[0], b[1], b[2], al);
  const offscreen = (cam, sx, sy, R) => sx + R < -30 || sx - R > cam.W + 30 || sy + R < -30 || sy - R > cam.H + 30;

  /* a smoke billow: a camera-facing scalloped outline (lobes bulge out, cusps between) with folds inside, the lobes
     turning slowly as it ages. Faded out when the lens is inside it (the dim veil takes over there). */
  function billow(W, cam, x, y, z, r, al, seed, age, folds, nearMul) {
    if (al <= .004 || r <= 0 || !pj(cam, x, y, z)) return;
    const nm = nearMul || 1, zc = PJ[2], near = ss(r * .8 * nm, r * 2.6 * nm, zc);
    if (near <= 0) return;
    const Rp = r * cam.fl / zc;
    if (Rp < .7) return;
    const sx = PJ[0], sy = PJ[1];
    if (offscreen(cam, sx, sy, Rp)) return;
    al *= near * (1 - ss(700, 1600, Rp));
    if (al <= .004) return;
    // small ones are round puffs; the lobes (and their cusps) grow in as they get big enough to show
    const nl = 5 + Math.floor(fr(seed * 7.31) * 4), per = clamp(Math.round(Rp / (nl * 2.4)), 2, 7), n = Math.max(12, nl * per);
    const dep = .2 * ss(5, 16, Rp), f0 = 1 - dep;
    const sg = fr(seed * 3.7) < .5 ? 1 : -1, ph = seed * TAU + sg * age * .09, hs = seed * 131.7;
    let px = 0, py = 0;
    for (let i = 0; i <= n; i++) {
      const th = ph + i / n * TAU, li = i / n * nl, j = Math.floor(li) % nl;
      const f = f0 + dep * Math.abs(Math.sin(PI * li)) * (.65 + .7 * hash(j, hs));
      const qx = sx + Math.cos(th) * Rp * f, qy = sy - Math.sin(th) * Rp * f;
      if (i) W.seg2(px, py, qx, qy, al);
      px = qx; py = qy;
    }
    if (!folds || Rp < 5) return;
    const fa = al * .55, m = clamp(Math.round(Rp / 9), 3, 9);
    for (let k = 0; k < folds; k++) {
      const a0 = ph * 1.3 + k * 2.55 + seed * 4.1, ox = sx + Math.cos(a0) * Rp * .4, oy = sy - Math.sin(a0) * Rp * .4, rr = Rp * (.34 + .08 * hash(k, hs + 3));
      let qx0 = 0, qy0 = 0;
      for (let i = 0; i <= m; i++) {
        const th = a0 - 1.15 + 2.3 * i / m, qx = ox + Math.cos(th) * rr, qy = oy - Math.sin(th) * rr;
        if (i) W.seg2(qx0, qy0, qx, qy, fa);
        qx0 = qx; qy0 = qy;
      }
    }
  }
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
     close; the half facing the lens at alF, the far half at alB; wob bends it into a slightly irregular loop */
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
  const ringH = (W, cam, c, r, al, n) => ringA(W, cam, c, UX, UZ, r, al, al * .7, n);
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

  /* ================= debris: seeded fragments, flung and falling (drag + gravity), impacts precomputed ================= */
  function mkSparks(n, seed, v0, v1, up) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.4, 1.25, hash(k + 3, seed)) + (up || 0), v = mix(v0, v1, hash(k + 9, seed));
      o.push([Math.cos(az) * Math.cos(el) * v, Math.sin(el) * v, Math.sin(az) * Math.cos(el) * v, .7 + 1.3 * hash(k + 5, seed)]);
    }
    return o;
  }
  function drawSparks(W, cam, c, S, age, al, tail) {
    tail = tail || .08;
    for (const s of S) {
      if (age > s[3]) continue;
      const a0 = Math.max(0, age - tail);
      segW(W, cam, c[0] + s[0] * a0, c[1] + s[1] * a0 - 4.9 * a0 * a0, c[2] + s[2] * a0, c[0] + s[0] * age, c[1] + s[1] * age - 4.9 * age * age, c[2] + s[2] * age, al * Math.pow(1 - age / s[3], 1.3));
    }
  }
  // fragments with momentum v0 (m/s vector), spread, drag time tau; each falls to the sea (y ~ 0) at tImp
  function mkFrags(p, v0, n, seed, k0, k1, spread, tau, upBias) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.5, 1.1, hash(k + 1, seed)) + (upBias || 0), sp = spread * (.3 + .7 * hash(k + 2, seed));
      const kk = mix(k0, k1, hash(k + 4, seed));
      const v = [v0[0] * kk + Math.cos(az) * Math.cos(el) * sp, v0[1] * kk + Math.sin(el) * sp, v0[2] * kk + Math.sin(az) * Math.cos(el) * sp];
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
  // a splash: jets thrown up and falling back, a ring spreading on the swell
  function splash(W, cam, x, z, a, sz, al, seed, T) {
    if (a < 0 || a > 2.6 || al <= .004) return;
    const y0 = OE.swell(x, z, T) * .9;
    if (a < 1.5) for (let k = 0; k < 4; k++) {
      const dur = 1.1 + .4 * hash(k, seed + 1), u = a / dur; if (u >= 1) continue;
      const hk = sz * (.55 + .7 * hash(k, seed)) * Math.sin(PI * u), lean = (hash(k, seed + 2) - .5) * .6 * sz, ang = hash(k, seed + 3) * TAU;
      segW(W, cam, x + Math.cos(ang) * lean * .2, y0, z + Math.sin(ang) * lean * .2, x + Math.cos(ang) * lean, y0 + hk, z + Math.sin(ang) * lean, al * (1 - u * .6));
    }
    ringH(W, cam, [x, y0 + .05, z], .3 * sz + 1.6 * sz * Math.pow(a, .6), al * .5 * (1 - a / 2.6), 18);
  }
  function drawFrags(W, cam, Fs, a, al, T, splashSz) {
    for (const F of Fs) {
      if (a < F.tImp) {
        const q0 = fragAt(F, Math.max(0, a - .05)), q1 = fragAt(F, a);
        seg(W, cam, q0, q1, al * (.45 + .55 * F.big) * (1 - .4 * a / F.tImp));
      } else if (F.imp && splashSz && F.big > .35) splash(W, cam, F.imp[0], F.imp[2], a - F.tImp, splashSz * (.5 + F.big), al * .8, F.h * 97, T);
    }
  }
  /* a hanging burst cloud: n billows around c, grown and drifting on the wind */
  function puffs(W, cam, c, a, n, r0, rg, spread, al, seed, sink, push) {
    for (let k = 0; k < n; k++) {
      const ak = a - k * .05; if (ak <= 0) continue;
      const h1 = hash(k, seed), h2 = hash(k + 1, seed), h3 = hash(k + 2, seed);
      let x = c[0] + (h1 - .5) * spread + WIND[0] * ak, y = c[1] + (h2 - .5) * spread * .6 - (sink || 0) * ak, z = c[2] + (h3 - .5) * spread + WIND[2] * ak;
      if (push) { const kk = push[3] * (1 - Math.exp(-ak / push[3])); x += push[0] * kk; y += push[1] * kk; z += push[2] * kk; }
      billow(W, cam, x, y, z, (r0 + rg * Math.sqrt(ak)) * (.7 + .6 * hash(k + 3, seed)), al * ss(0, .35, ak), seed + k * 1.618, ak, k % 2 ? 1 : 2);
    }
  }
  const heroX = (T, K) => K.hero ? K.hero.X : OE.shipXf(SA, T);

  /* ================= SM-6 launches ================= */
  const SEP = 6;                           // Mk 72 burnout and separation, s after launch
  const MK72 = FAST.compile(HD.mk72(), { fine: false });
  const RISE = a => 1.4 * (1 - Math.exp(-a / 3)) + .14 * a;
  for (const I of OE.INTS) {
    const P = I.P, N = I.N, cum = new Float64Array(N);
    for (let j = 1; j < N; j++) cum[j] = cum[j - 1] + Math.hypot(P[j * 3] - P[j * 3 - 3], P[j * 3 + 1] - P[j * 3 - 2], P[j * 3 + 2] - P[j * 3 - 1]);
    I.cum = cum; I.seed = 11.3 + I.i * 7.77; I.jSep = Math.round(SEP * 60);
    const sm = j => [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]];
    const tan = j => V.norm(V.sub(sm(Math.min(N - 1, j + 1)), sm(Math.max(0, j - 1))));
    // the smoke is laid at the nozzle (Mk 72 cluster, then the Mk 104), a few metres behind the path's head
    const TN = new Float64Array(N * 3);
    for (let j = 0; j < N; j++) { const t = tan(j), o = j < I.jSep ? 6.8 : 5.1; TN[j * 3] = P[j * 3] - t[0] * o; TN[j * 3 + 1] = P[j * 3 + 1] - t[1] * o; TN[j * 3 + 2] = P[j * 3 + 2] - t[2] * o; }
    I.TN = TN;
    const tn = j => [TN[j * 3], TN[j * 3 + 1], TN[j * 3 + 2]];
    // until the nozzle clears the cell its smoke goes down the plenum (the uptake vents it): the trail starts there
    let j0 = 0; while (j0 < N - 1 && cum[j0] < 7) j0++;
    I.j0 = j0;
    // billow nodes along the whole trail (close together where it is still slow), smoke rings on the booster's
    const nodes = []; let d = 9, j = 0;
    const jFly = Math.min(N - 2, Math.floor((I.tI - I.tL) * 60));
    for (;;) {
      while (j < N - 1 && cum[j] < d) j++;
      if (j >= jFly) break;
      const t = tan(j), [U, Vv] = perp(t), boost = j < I.jSep;
      nodes.push({ j, s: I.tL + j / 60, p: tn(j), U, V: Vv, h: hash(nodes.length, I.i + 17), boost });
      d += boost ? 4.6 + .055 * d : Math.max(45, .07 * d);
    }
    I.nodes = nodes;
    // the Mk 41 uptake beside the cell (module centre line) vents the booster's exhaust at launch
    const c = DA.vls(I.cell), xm = [-3.15, -1.05, 1.05, 3.15].reduce((b, q) => Math.abs(q - c[0]) < Math.abs(b - c[0]) ? q : b, 99);
    I.upL = [xm, c[1] + .05, c[2]]; I.cellL = c;
    // the spent booster: carried on from separation, tumbling, falling
    const ts = I.tL + SEP, hs = OE.intAt(I, ts), dir = OE.intDir(I, ts);
    const v = V.mul(V.sub(OE.intAt(I, ts + .02), OE.intAt(I, ts - .02)), 1 / .04);
    I.bst = { p: V.mad(hs, dir, -5.7), v: V.mul(v, .92), dir, ax: perp(dir)[0], w: 3.2 + 2 * hash(I.i, 3) };
  }
  const bstAt = (b, a) => { const k = 1.6 * (1 - Math.exp(-a / 1.6)); return [b.p[0] + b.v[0] * k, b.p[1] + b.v[1] * k - 4.9 * a * a, b.p[2] + b.v[2] * k]; };

  // trail buffers (projected laid-smoke centres)
  const NBUF = 2048, BX = new Float64Array(NBUF), BY = new Float64Array(NBUF), BW = new Float64Array(NBUF), BA = new Float64Array(NBUF), BG = new Float64Array(NBUF);
  const NX = new Float64Array(NBUF), NY = new Float64Array(NBUF), BOK = new Uint8Array(NBUF);
  function meander(I, j, age, o) {
    const amp = .3 + 1.15 * Math.pow(age, .8), u = j * .04 + I.seed, v = age * .07;
    o[0] = amp * noise(u, v, 1.7); o[1] = amp * .6 * noise(u, v, 5.3); o[2] = amp * noise(u, v, 8.9);
    return o;
  }
  const MQ = [0, 0, 0];
  const trailW = (age, boost) => boost ? .8 + 2.5 * Math.sqrt(age) : .4 + 1.4 * Math.sqrt(age);
  /* the laid trail: wispy, broken edges of the smoke column (screen-space offsets of the projected centres), a hot
     core near the motor, billows riding along it, and fresh smoke rings shed across the booster's stretch */
  function drawTrail(W, cam, I, T, A) {
    const s1 = Math.min(T, I.tEnd) - I.tL; if (s1 <= 0) return;
    const P = I.TN, jN = Math.min(I.N - 1, Math.floor(s1 * 60)), fl = cam.fl, sd = I.seed;
    if (jN <= I.j0) return;
    let n = 0;
    const put = (x, y, z, age, boost, j) => {
      if (pj(cam, x, y, z)) {
        BX[n] = PJ[0]; BY[n] = PJ[1]; BW[n] = Math.min(900, trailW(age, boost) * fl / PJ[2]); BOK[n] = 1; BG[n] = age; NX[n] = j;
        BA[n] = (boost ? .3 * (.4 + .6 * Math.exp(-age / 1.8)) * Math.exp(-age / 22) : .2 * (.4 + .6 * Math.exp(-age / 1.2)) * Math.exp(-age / 14))
          * ss(0, .06, age) * (1 - ss(260, 700, BW[n]));
      } else BOK[n] = 0;
      n++;
    };
    for (let j = I.j0; n < NBUF - 2;) {
      const age = T - (I.tL + j / 60);
      meander(I, j, age, MQ);
      put(P[j * 3] + WIND[0] * age + MQ[0], P[j * 3 + 1] + RISE(age) + MQ[1], P[j * 3 + 2] + WIND[2] * age + MQ[2], age, j < I.jSep, j);
      if (j === jN) break;
      j = Math.min(jN, j + (j < I.jSep ? 2 : j < I.jSep + 240 ? 3 : 5));
    }
    // up to the nozzle now
    if (T < I.tEnd) { const h = OE.intAt(I, T), dr = OE.intDir(I, T), o = T - I.tL < SEP ? 6.8 : 5.1; if (h) put(h[0] - dr[0] * o, h[1] - dr[1] * o, h[2] - dr[2] * o, 0, T - I.tL < SEP, jN + 1); }
    // edges: offset along the screen normal, each edge swelling and thinning on its own, broken into wisps
    let pxL = 0, pyL = 0, pxR = 0, pyR = 0, prev = false;
    for (let i = 0; i < n; i++) {
      if (!BOK[i]) { prev = false; continue; }
      const a = i > 0 && BOK[i - 1] ? i - 1 : i, b = i < n - 1 && BOK[i + 1] ? i + 1 : i;
      const tx = BX[b] - BX[a], ty = BY[b] - BY[a], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
      const j = NX[i], g = BG[i], w = BW[i], u = j * .09 + sd, v = g * .22;
      const wl = w * (1 + .32 * noise(u, v, 2.1)), wr = w * (1 + .32 * noise(u, v, 6.7));
      const qxL = BX[i] + nx * wl, qyL = BY[i] + ny * wl, qxR = BX[i] - nx * wr, qyR = BY[i] - ny * wr;
      if (prev) {
        const al = (BA[i] + BA[i - 1]) * .5 * A;
        if (w < 1.1) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], al * 1.5);
        else {
          const bL = sat(.55 + 1.3 * noise(u * .8, v, 9.2)), bR = sat(.55 + 1.3 * noise(u * .8, v, 13.4));
          W.seg2(pxL, pyL, qxL, qyL, al * bL); W.seg2(pxR, pyR, qxR, qyR, al * bR);
        }
        if (g < 1.2) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], A * .5 * (1 - g / 1.2));
      }
      pxL = qxL; pyL = qyL; pxR = qxR; pyR = qyR; prev = true;
    }
    // billows along the column; young smoke rings round the booster's stretch
    for (const nd of I.nodes) {
      if (nd.s > T) break;
      const age = T - nd.s;
      meander(I, nd.j, age, MQ);
      const x = nd.p[0] + WIND[0] * age + MQ[0], y = nd.p[1] + RISE(age) + MQ[1], z = nd.p[2] + WIND[2] * age + MQ[2];
      const w = trailW(age, nd.boost);
      const ab = A * (nd.boost ? .2 * (.35 + .65 * Math.exp(-age / 2.2)) * Math.exp(-age / 20) : .13 * (.4 + .6 * Math.exp(-age / 1.5)) * Math.exp(-age / 12)) * ss(.05, .5, age);
      billow(W, cam, x, y, z, w * (1.1 + .3 * nd.h), ab, sd + nd.h * 57, age, nd.boost && nd.h > .4 ? 1 : 0);
      if (nd.boost && age < 3) {
        const ar = A * .36 * Math.pow(1 - age / 3, 1.5) * ss(0, .06, age);
        ringA(W, cam, [x, y, z], nd.U, nd.V, w, ar, ar * .4, 28, .08 + .1 * sat(age / 2), nd.h * 20 + age * .5);
      }
    }
  }
  /* the launch cloud: exhaust out of the cell and the uptake, billowing over the deck and left behind in the air */
  function drawCloud(W, cam, I, T, A) {
    const s = T - I.tL;
    const P0 = I.P0, up = I.upW || (I.upW = X.ap(OE.shipXf(SA, I.tL), I.upL));
    for (let k = 0; k < 11; k++) {
      const a = s - k * .1; if (a <= 0 || a > 40) continue;
      const h1 = hash(k, I.i + 31), h2 = hash(k + 1, I.i + 31), h3 = hash(k + 2, I.i + 31);
      const src = k % 2 ? up : P0, ph = h1 * TAU, el = .25 + .7 * h2;
      const dl = Math.hypot(Math.cos(ph), el, Math.sin(ph)), v0 = (5 + 9 * h3) / dl, kk = .9 * (1 - Math.exp(-a / .9));
      const x = src[0] + Math.cos(ph) * v0 * kk + WIND[0] * a, y = src[1] + el * v0 * kk + 1.9 * Math.pow(a, .7), z = src[2] + Math.sin(ph) * v0 * kk + WIND[2] * a;
      const r = (1 + 3.1 * Math.sqrt(a)) * (.75 + .5 * h3);
      billow(W, cam, x, y, z, r, A * .34 * ss(0, .12, a) * Math.exp(-a / 8) * (k < 4 ? 1 : .8), I.seed + k * 1.7, a, 2);
    }
  }
  /* the vent: flame out of the uptake and the cell as the booster lights in it (moves with the ship) */
  function drawVent(W, cam, K, I, T, A) {
    const a = T - I.tL; if (a < -.04 || a > 1.4) return;
    const Xh = heroX(T, K), up = X.ap(Xh, I.upL), cell = X.ap(Xh, I.cellL), k = Math.exp(-Math.max(0, a) / .32);
    for (let q = 0; q < 6; q++) {
      const src = q < 4 ? up : cell, h = (4 + 8 * hash(q, I.i + 3)) * (.6 + .4 * noise(T * 22 + q, I.i)) * (a < 0 ? .3 : 1);
      const lx = (hash(q, I.i + 5) - .5) * 1.2, lz = (hash(q, I.i + 6) - .5) * 1.6;
      segW(W, cam, src[0] + lx * .3, src[1], src[2] + lz * .3, src[0] + lx + WIND[0] * .08 * h, src[1] + h, src[2] + lz - 1.2 * h * .1, A * .8 * k);
    }
    K.glow(up, A * (.65 * k + .1), 6, 6, 120);
  }
  /* flame out of the nozzles: a spindle of flickering meridians and a bright core; a single stroke far off */
  function drawPlume(W, cam, K, I, T, A) {
    const h = OE.intAt(I, T); if (!h) return;
    const s = T - I.tL, dir = OE.intDir(I, T), boost = s < SEP;
    const nz = V.mad(h, dir, boost ? -6.8 : -5.1), d = V.dist(nz, cam.eye), fk = .5 + .5 * noise(T * 34 + I.i * 9, 1.7);
    let Lf = boost ? (8 + 6 * fk) * (.35 + .65 * ss(0, .15, s)) : 2.6 + 1.6 * fk;
    // still in or just out of the cell: the flame stops at the deck (the rest goes down the plenum and out the uptake)
    if (s < 3) {
      const Xh = heroX(T, K), c = X.ap(Xh, I.cellL), up = X.dir(Xh, [0, 1, 0]);
      const hN = (nz[0] - c[0]) * up[0] + (nz[1] - c[1]) * up[1] + (nz[2] - c[2]) * up[2], dn = Math.max(.05, V.dot(dir, up));
      Lf = Math.min(Lf, Math.max(0, hN + .5) / dn);
    }
    const ax = [-dir[0], -dir[1], -dir[2]];
    if (Lf > .05) seg(W, cam, nz, V.mad(nz, ax, Math.max(Lf * .7, d * .004)), (boost ? .95 : .75) * A);
    if (d < 1500 && Lf > .3) {
      const [U, Vv] = perp(dir), R0 = boost ? .55 : .15, M = 7;
      for (let k = 0; k < M; k++) {
        const ph = k / M * TAU + T * 11 + I.i, c = Math.cos(ph), sn = Math.sin(ph);
        let px = nz[0], py = nz[1], pz = nz[2];
        for (let q = 1; q <= 5; q++) {
          const t = q / 5, rr = R0 * (1 + 2.8 * t) * Math.pow(1 - t, .7) * (1 + .3 * noise(T * 40 + k * 3, q * 1.3));
          const L = Lf * t * (1 + .15 * noise(T * 29 + k, 2.2));
          const qx = nz[0] + ax[0] * L + (U[0] * c + Vv[0] * sn) * rr, qy = nz[1] + ax[1] * L + (U[1] * c + Vv[1] * sn) * rr, qz = nz[2] + ax[2] * L + (U[2] * c + Vv[2] * sn) * rr;
          segW(W, cam, px, py, pz, qx, qy, qz, A * (boost ? .55 : .4) * (1 - .55 * t));
          px = qx; py = qy; pz = qz;
        }
      }
    }
    K.glow(V.mad(nz, ax, Lf * .25), A * (boost ? .5 : .24) * (.8 + .2 * fk), boost ? 7 : 2.5, 4, boost ? 100 : 50);
  }
  function drawSpent(W, cam, K, I, T, A) {
    const a = T - I.tL - SEP; if (a < 0 || a > 6) return;
    const b = I.bst, p = bstAt(b, a), d = V.dist(p, cam.eye);
    // tumbling about an axis across its flight
    const th = b.w * a * a / (a + .6), c = Math.cos(th), sn = Math.sin(th), u = b.ax, f = b.dir;
    const w = V.cross(u, f), ax = [f[0] * c + w[0] * sn, f[1] * c + w[1] * sn, f[2] * c + w[2] * sn];
    const fade = A * (1 - ss(4.5, 6, a));
    if (d < 700) FAST.draw(W, MK72, X.make(R.look(ax, u), p), {}, { fine: false, a: fade * .85 });
    else { const L = Math.max(.9, d * .0011); seg(W, cam, V.mad(p, ax, -L), V.mad(p, ax, L), fade * .7); }
    // residual smoke off the casing, the separation puff, the sustainer lighting
    const q0 = bstAt(b, Math.max(0, a - .35));
    seg(W, cam, q0, p, fade * .22);
    if (a < 5) billow(W, cam, b.p[0] + WIND[0] * a, b.p[1] + RISE(a), b.p[2] + WIND[2] * a, 1.5 + 4 * Math.sqrt(a), A * .3 * Math.exp(-a / 2.5) * ss(0, .1, a), I.seed * 3.1, a, 1);
    if (a < .5) K.glow(OE.intAt(I, T) || p, A * .35 * Math.exp(-a / .12), 4, 4, 60);
  }

  /* ================= far kills: SM-6 meets its round (the miss self-destructs past it) ================= */
  const KILLS = OE.INTS.map(I => {
    const miss = !!I.miss, t = miss ? I.tEnd : I.tI, p = miss ? OE.intAt(I, I.tEnd - 1e-3) : I.PI;
    const r = I.round, rd = OE.roundDir(r, Math.min(I.tI, r.tEnd - .02));
    return {
      I, t, p, miss, seed: 3.1 + I.i * 5.3,
      sparks: mkSparks(22, 40 + I.i, 45, 170),
      frags: miss ? [] : mkFrags(p, V.mul(rd, 680), 12, 70 + I.i, .3, .75, 60, 1.1),
    };
  });
  function drawFarKill(W, cam, K, k, T, A) {
    const a = T - k.t; if (a < 0 || a > 40) return;
    const p = k.p, sc = k.miss ? .6 : 1;
    if (a < 3) {
      K.glow(p, A * (1 * Math.exp(-a / .12) + .25 * Math.exp(-a / .9)) * sc, 200 * sc, 12, 170);
      K.glow(p, A * .16 * Math.exp(-a / .5) * sc, 1400, 50, 280);
    }
    if (a < .2) star(W, cam, p, 70 * sc, 30, A * .9 * (1 - a / .2), k.seed, 12);
    if (a < 1.4) discS(W, cam, p, (22 + 230 * (1 - Math.exp(-a / .38))) * sc, A * .6 * Math.pow(1 - a / 1.4, 1.6), 48);
    if (a < 1) discS(W, cam, p, (10 + 100 * (1 - Math.exp(-a / .25))) * sc, A * .45 * Math.pow(1 - a, 2), 36);
    if (a < 2.2) ringH(W, cam, p, (30 + 360 * (1 - Math.exp(-a / .5))) * sc, A * .32 * Math.pow(1 - a / 2.2, 1.5), 56);
    if (a < 2.4) drawSparks(W, cam, p, k.sparks, a, A * .85, .12);
    drawFrags(W, cam, k.frags, a, A * .7, T, 8);
    // the burst's smoke: a dense core that swells, then hangs and drifts
    puffs(W, cam, p, a, k.miss ? 4 : 8, 20 * sc, 34 * sc, 80 * sc, A * .36 * Math.exp(-a / 14), k.seed, .3);
    if (a < 6) billow(W, cam, p[0] + WIND[0] * a, p[1] + 3 * a, p[2] + WIND[2] * a, (10 + 45 * (1 - Math.exp(-a / .6))) * sc, A * .5 * Math.exp(-a / 1.6) * ss(0, .08, a), k.seed * 1.3, a, 2);
  }

  /* ================= Phalanx: tracer streams, muzzle fire, close kills ================= */
  const ROF = 75, V0 = 1100, TD = 2.4, TR_LIFE = 1.75;
  for (const e of OE.CIWS_ENG) {
    const n = Math.floor((e.t1 - e.t0) * ROF) + 1, M = new Float64Array(n * 3), Dd = new Float64Array(n * 3);
    for (let k = 0; k < n; k++) {
      const tk = e.t0 + k / ROF, st = OE.ciwsState(SA, tk), Xs = OE.shipXf(SA, tk), sst = { ciwsYaw: st.yaw, ciwsPitch: st.pitch };
      const m = X.ap(Xs, DA.ciws(sst, e.m)), d0 = X.dir(Xs, DA.ciwsDir(sst, e.m)), [U, Vv] = perp(d0);
      // dispersion: ~2 mrad, triangular
      const g1 = (hash(k, e.m * 7 + 1) + hash(k + 3, e.m * 7 + 2) - 1) * .004, g2 = (hash(k + 5, e.m * 7 + 3) + hash(k + 7, e.m * 7 + 4) - 1) * .004;
      const d = V.norm([d0[0] + U[0] * g1 + Vv[0] * g2, d0[1] + U[1] * g1 + Vv[1] * g2, d0[2] + U[2] * g1 + Vv[2] * g2]);
      M.set(m, k * 3); Dd.set(d, k * 3);
    }
    e.n = n; e.M = M; e.Dd = Dd;
    const r = e.round;
    if (!e.late) {
      e.kp = OE.roundAt(r, r.tEnd); e.kd = OE.roundDir(r, r.tEnd - .02);
      e.frags = mkFrags(e.kp, V.mul(e.kd, 680), 34, 90 + e.m * 13 + r.i, .15, .6, 95, .65, .15);
      e.sparks = mkSparks(26, 120 + r.i, 40, 160);
      e.seed = 7.7 + r.i * 3.9;
    }
  }
  function tracerAt(e, k, a, o) {
    const s = V0 * TD * (1 - Math.exp(-a / TD)), j = k * 3;
    o[0] = e.M[j] + e.Dd[j] * s; o[1] = e.M[j + 1] + e.Dd[j + 1] * s - 4.9 * a * a; o[2] = e.M[j + 2] + e.Dd[j + 2] * s + VK * a;
    return o;
  }
  const TQ0 = [0, 0, 0], TQ1 = [0, 0, 0];
  function drawBurst(W, cam, K, e, T, A) {
    if (T < e.t0 || T > e.t1 + TR_LIFE + .1) return;
    // tracers in flight: every round a dash flown from its own firing time; every fourth a brighter tracer
    const k1 = Math.min(e.n - 1, Math.floor((T - e.t0) * ROF)), k0 = Math.max(0, Math.ceil((T - TR_LIFE - e.t0) * ROF));
    for (let k = k0; k <= k1; k++) {
      const a = T - (e.t0 + k / ROF); if (a <= 0) continue;
      const tr = k % 3 === 0;
      tracerAt(e, k, Math.max(0, a - (tr ? .026 : .013)), TQ0); tracerAt(e, k, a, TQ1);
      const al = A * (tr ? 1 : .6) * ss(0, .012, a) * (1 - ss(TR_LIFE - .45, TR_LIFE, a));
      segW(W, cam, TQ0[0], TQ0[1], TQ0[2], TQ1[0], TQ1[1], TQ1[2], al);
    }
    // muzzle fire and the gun's own smoke (current mount pose)
    const Xh = heroX(T, K), cs = K.hero ? K.hero.ciws : OE.ciwsState(SA, T), sst = { ciwsYaw: cs.yaw, ciwsPitch: cs.pitch };
    if (T <= e.t1 + .02) {
      const m = X.ap(Xh, DA.ciws(sst, e.m)), d = X.dir(Xh, DA.ciwsDir(sst, e.m)), [U, Vv] = perp(d);
      const fi = Math.floor(T * ROF), f1 = hash(fi, e.m + 3), f2 = hash(fi + 1, e.m + 5);
      for (let q = 0; q < 5; q++) {
        const ph = q / 5 * TAU + f2 * 3, sp = .12 + .22 * hash(q, fi % 97), L = 1 + 1.8 * f1 * (.6 + .4 * hash(q + 2, fi % 89));
        const tip = V.add(V.mad(m, d, L), V.add(V.mul(U, Math.cos(ph) * sp * L), V.mul(Vv, Math.sin(ph) * sp * L)));
        seg(W, cam, m, tip, A * .85);
      }
      for (let q = 0; q < 4; q++) { const ph = q / 4 * TAU + f1 * 2, l = .35 + .45 * f2; seg(W, cam, V.mad(m, d, .15), V.add(V.mad(m, d, .15), V.add(V.mul(U, Math.cos(ph) * l), V.mul(Vv, Math.sin(ph) * l))), A * .6); }
      K.glow(V.mad(m, d, .7), A * (.3 + .25 * f1), 1.8, 4, 50);
    }
    // gun smoke: small wisps off the muzzle, left behind as the ship steams on
    const tEnd = Math.min(T, e.t1);
    for (let q = Math.max(0, Math.floor((T - 4 - e.t0) * 7)); e.t0 + q / 7 <= tEnd; q++) {
      const te = e.t0 + q / 7, a = T - te, k = Math.min(e.n - 1, Math.round((te - e.t0) * ROF)), j = k * 3, h = hash(q, e.m + 61);
      const kk = (3 + 4 * h) * (1 - Math.exp(-a / .2));
      billow(W, cam, e.M[j] + e.Dd[j] * kk + WIND[0] * a, e.M[j + 1] + e.Dd[j + 1] * kk + .6 * a, e.M[j + 2] + e.Dd[j + 2] * kk + WIND[2] * a,
        (.3 + 1.1 * Math.sqrt(a)) * (.6 + .8 * h), A * .085 * Math.exp(-a / 1.8) * ss(0, .06, a), e.m * 5.1 + q * 1.37, a, 0);
    }
  }
  function drawCloseKill(W, cam, K, e, T, A) {
    if (e.late) return;
    const a = T - e.round.tEnd; if (a < 0 || a > 26) return;
    const p = e.kp;
    if (a < 2.5) K.glow(p, A * (1.05 * Math.exp(-a / .1) + .25 * Math.exp(-a / .7)), 22, 8, 170);
    if (a < .14) star(W, cam, p, 14, 22, A * (1 - a / .14), e.seed, 12);
    if (a < 1) discS(W, cam, p, 3 + 42 * (1 - Math.exp(-a / .24)), A * .6 * Math.pow(1 - a, 1.6), 48);
    if (a < .7) discS(W, cam, p, 2 + 17 * (1 - Math.exp(-a / .14)), A * .5 * Math.pow(1 - a / .7, 2), 32);
    if (a < 1.6) ringH(W, cam, [p[0], OE.swell(p[0], p[2], T) * .9 + .1, p[2]], 4 + 60 * (1 - Math.exp(-a / .35)), A * .35 * (1 - a / 1.6), 48);
    if (a < 2) drawSparks(W, cam, p, e.sparks, a, A * .85, .07);
    drawFrags(W, cam, e.frags, a, A * .8, T, 4.5);
    puffs(W, cam, p, a, 5, 2.5, 7.5, 9, A * .32 * Math.exp(-a / 8), e.seed, .15, [e.kd[0] * 45, e.kd[1] * 45, e.kd[2] * 45, .45]);
  }

  /* ================= Mk 45: muzzle blast, shells, air bursts ================= */
  const GUN_SHOTS = [], GV = 760, GTAU = 9;
  for (const e of OE.GUN_ENG) e.shots.forEach((t, k) => {
    const st = OE.gunState(SA, t), Xs = OE.shipXf(SA, t), gst = { gunYaw: st.yaw, gunPitch: st.pitch };
    const m = X.ap(Xs, DA.gun(gst)), d = X.dir(Xs, DA.gunDir(gst));
    let tb = t + 3;
    for (let it = 0; it < 8; it++) tb = t + V.dist(m, OE.roundAt(e.round, tb)) / GV;
    tb = Math.min(tb, e.round.tEnd - .3);
    const rp = OE.roundAt(e.round, tb), rd = OE.roundDir(e.round, tb), nn = V.norm(V.cross([0, 1, 0], rd));
    const h1 = hash(k, 41 + e.round.i), h2 = hash(k + 1, 41 + e.round.i), h3 = hash(k + 2, 41 + e.round.i);
    // proximity bursts off the weaving round: close, never on it
    const B = V.add(V.add(V.mad(rp, nn, (k % 2 ? 1 : -1) * (12 + 20 * h1)), [0, 7 + 13 * h2, 0]), V.mul(rd, -(6 + 18 * h3)));
    const tf = tb - t;
    GUN_SHOTS.push({ t, m, d, tb, tf, B, H: G * tf * tf / 8, seed: 5.5 + GUN_SHOTS.length * 2.9, sparks: mkSparks(12, 200 + GUN_SHOTS.length, 30, 120) });
  });
  function shellAt(g, a) {
    const u = (1 - Math.exp(-a / GTAU)) / (1 - Math.exp(-g.tf / GTAU)), m = g.m, B = g.B;
    return [m[0] + (B[0] - m[0]) * u, m[1] + (B[1] - m[1]) * u + 4 * g.H * u * (1 - u), m[2] + (B[2] - m[2]) * u];
  }
  function drawShot(W, cam, K, g, T, A) {
    const a = T - g.t; if (a < 0 || a > g.tf + 22) return;
    if (a < 1.3) {
      const Xh = heroX(T, K), gs = K.hero ? K.hero.gun : OE.gunState(SA, T), gst = { gunYaw: gs.yaw, gunPitch: gs.pitch };
      const m = X.ap(Xh, DA.gun(gst)), d = X.dir(Xh, DA.gunDir(gst)), [U, Vv] = perp(d);
      K.glow(V.mad(m, d, 3), A * (1.05 * Math.exp(-a / .05) + .25 * Math.exp(-a / .25)), 7, 8, 150);
      // the flash ball in front of the muzzle, blown forward and gone in a few frames
      if (a < .4) { const c = V.mad(m, d, 3 + 9 * a); billow(W, cam, c[0], c[1], c[2], 1.4 + 3.6 * (1 - Math.exp(-a / .06)), A * .95 * Math.exp(-a / .1), g.seed * 2.3, a * 4, 1); }
      if (a < .13) {
        const k = 1 - a / .13;
        for (let q = 0; q < 12; q++) {
          const ph = q / 12 * TAU + g.seed, sp = .1 + .3 * hash(q, g.seed), L = (5 + 9 * hash(q + 3, g.seed)) * (.5 + .5 * k);
          seg(W, cam, V.mad(m, d, .3), V.add(V.mad(m, d, L), V.add(V.mul(U, Math.cos(ph) * sp * L), V.mul(Vv, Math.sin(ph) * sp * L))), A * .9 * k);
        }
        for (let q = 0; q < 6; q++) { const ph = q / 6 * TAU + g.seed * 2, l = (2 + 3 * hash(q + 7, g.seed)) * k; seg(W, cam, m, V.add(m, V.add(V.mul(U, Math.cos(ph) * l), V.mul(Vv, Math.sin(ph) * l))), A * .6 * k); }
      }
      // the blast: a ring shed off the muzzle across the barrel, a spherical front, its print on the water
      if (a < .4) ringA(W, cam, V.mad(m, d, 1 + 6 * a), U, Vv, 1 + 9 * (1 - Math.exp(-a / .08)), A * .7 * Math.pow(1 - a / .4, 2), A * .35 * Math.pow(1 - a / .4, 2), 36, .06, g.seed);
      if (a < .55) discS(W, cam, V.mad(m, d, 2), 2 + 20 * (1 - Math.exp(-a / .15)), A * .35 * Math.pow(1 - a / .55, 2), 40);
      if (a < 1.1) {
        const w = V.mad(m, V.norm([d[0], 0, d[2]]), 9);
        ringH(W, cam, [w[0], OE.swell(w[0], w[2], T) * .9 + .1, w[2]], 4 + 42 * (1 - Math.exp(-a / .3)), A * .3 * Math.pow(1 - a / 1.1, 1.5), 48);
      }
    }
    // muzzle smoke, thrown forward and left on the wind
    const [U, Vv] = g.perp || (g.perp = perp(g.d));
    for (let q = 0; q < 6; q++) {
      const aq = a - q * .04; if (aq <= 0 || aq > 16) continue;
      const h = hash(q, g.seed), v0 = 20 + 30 * h, kk = .35 * (1 - Math.exp(-aq / .35)) * v0;
      const o = (hash(q + 4, g.seed) - .5) * 2.4, o2 = (hash(q + 6, g.seed) - .5) * 2;
      billow(W, cam, g.m[0] + g.d[0] * kk + U[0] * o + Vv[0] * o2 + WIND[0] * aq, g.m[1] + g.d[1] * kk + U[1] * o + Vv[1] * o2 + .4 * aq, g.m[2] + g.d[2] * kk + U[2] * o + Vv[2] * o2 + WIND[2] * aq,
        (1 + 2.8 * Math.sqrt(aq)) * (.8 + .4 * hash(q + 2, g.seed)), A * .26 * ss(0, .1, aq) * Math.exp(-aq / 4.5), g.seed + q * 1.31, aq, 1);
    }
    // the shell: a faint streak on its arc
    if (a > 0 && a < g.tf) seg(W, cam, shellAt(g, Math.max(0, a - .028)), shellAt(g, a), A * .6 * ss(0, .03, a) * (1 - ss(g.tf - .2, g.tf, a) * .5));
    // the air burst
    const ab = a - g.tf;
    if (ab >= 0 && ab < 20) {
      const B = g.B;
      if (ab < 2) K.glow(B, A * (.8 * Math.exp(-ab / .08) + .16 * Math.exp(-ab / .6)), 20, 6, 110);
      if (ab < .1) star(W, cam, B, 16, 10, A * .85 * (1 - ab / .1), g.seed, 8);
      if (ab < .9) discS(W, cam, B, 3 + 28 * (1 - Math.exp(-ab / .2)), A * .5 * Math.pow(1 - ab / .9, 1.6), 40);
      if (ab < 1.8) drawSparks(W, cam, B, g.sparks, ab, A * .75, .09);
      puffs(W, cam, B, ab, 3, 4, 8, 7, A * .3 * Math.exp(-ab / 7), g.seed * 1.9, .2);
    }
  }

  /* ================= SRBOC: rockets, chaff blooms ================= */
  const DV0 = 90, DTAU = 1;                // the rocket carries its chaff ~30-45 m up and 40-55 m out before it blooms
  for (const d of OE.DECOYS) {
    const Xs = OE.shipXf(SA, d.t);
    d.M0 = X.ap(Xs, d.mouth); d.D0 = X.dir(Xs, d.dir);
    d.seed = 3.3 + d.t * 1.7;
    d.Bp = decoyAt(d, d.bloom);
    // dipole glints: seeded points inside the cloud, each flashing as it turns
    d.gl = [];
    for (let k = 0; k < 110; k++) {
      const z = hash(k, d.seed) * 2 - 1, ph = hash(k + 1, d.seed) * TAU, rr = Math.cbrt(hash(k + 2, d.seed)), sq = Math.sqrt(1 - z * z);
      const oz = hash(k + 3, d.seed) * 2 - 1, oph = hash(k + 4, d.seed) * TAU, osq = Math.sqrt(1 - oz * oz);
      d.gl.push({ p: [sq * Math.cos(ph) * rr, z * rr * .7, sq * Math.sin(ph) * rr], o: [osq * Math.cos(oph), oz, osq * Math.sin(oph)], w: 3 + 9 * hash(k + 5, d.seed), f: hash(k + 6, d.seed) * TAU, fall: .6 + .8 * hash(k + 7, d.seed) });
    }
  }
  function decoyAt(d, a) {
    const k = DV0 * DTAU * (1 - Math.exp(-a / DTAU));
    return [d.M0[0] + d.D0[0] * k, d.M0[1] + d.D0[1] * k - 4.9 * a * a, d.M0[2] + d.D0[2] * k + VK * a];
  }
  function drawDecoy(W, cam, K, d, T, A) {
    const a = T - d.t; if (a < 0 || a > 60) return;
    const tb = d.bloom;
    // rocket
    if (a < tb) {
      const p = decoyAt(d, a), q = decoyAt(d, Math.max(0, a - .03));
      seg(W, cam, q, p, A * .95);
      const dir = V.norm(V.sub(p, q)), fk = .5 + .5 * noise(T * 40 + d.seed, 1);
      seg(W, cam, p, V.mad(p, dir, -(1.6 + 1.8 * fk)), A * .85);
      K.glow(p, A * .42 * (.8 + .2 * fk), 2.5, 4, 50);
    }
    // the launch: a flash at the tube and a puff of its own
    if (a < .35) K.glow(d.M0, A * .6 * Math.exp(-a / .08), 3, 6, 80);
    if (a < 6) billow(W, cam, d.M0[0] + d.D0[0] * 3 + WIND[0] * a, d.M0[1] + d.D0[1] * 3 + .8 * a, d.M0[2] + d.D0[2] * 3 + WIND[2] * a, .8 + 2 * Math.sqrt(a), A * .3 * Math.exp(-a / 2) * ss(0, .06, a), d.seed * 1.7, a, 1);
    // its smoke: a thin laid line with small puffs
    const aEnd = Math.min(a, tb), nS = Math.ceil(aEnd / .05);
    let px = 0, py = 0, pz = 0;
    for (let k = 0; k <= nS; k++) {
      const ak = Math.min(aEnd, k * .05), age = a - ak, q = decoyAt(d, ak), m = .2 + .6 * Math.pow(age, .8);
      const x = q[0] + WIND[0] * age + m * noise(k * .3 + d.seed, age * .1, 1.1), y = q[1] + .5 * RISE(age) + m * .5 * noise(k * .3 + d.seed, age * .1, 4.4), z = q[2] + WIND[2] * age + m * noise(k * .3 + d.seed, age * .1, 7.7);
      if (k) segW(W, cam, px, py, pz, x, y, z, A * .5 * Math.exp(-age / 7) * ss(0, .05, age));
      if (k % 2 === 1) billow(W, cam, x, y, z, .3 + .9 * Math.sqrt(age), A * .2 * Math.exp(-age / 6) * ss(0, .1, age), d.seed + k * .77, age, 0);
      px = x; py = y; pz = z;
    }
    // the bloom: a flash, a burst ring, then a hairline cloud of dipoles glinting as they turn and settle
    const b = a - tb; if (b < 0) return;
    const Rc = 4 + 24 * (1 - Math.exp(-b / 1.1)) + .7 * b, cx = d.Bp[0] + WIND[0] * b, cy = d.Bp[1] - .9 * b, cz = d.Bp[2] + WIND[2] * b;
    if (b < 1.2) K.glow(d.Bp, A * (.55 * Math.exp(-b / .07) + .1 * Math.exp(-b / .5)), 6, 5, 80);
    if (b < .6) discS(W, cam, d.Bp, 1 + 22 * (1 - Math.exp(-b / .15)), A * .55 * Math.pow(1 - b / .6, 1.6), 36);
    const env = A * .17 * ss(0, .5, b) * Math.exp(-b / 30);
    for (let k = 0; k < 5; k++) {
      const h1 = hash(k, d.seed + 9), h2 = hash(k + 1, d.seed + 9), h3 = hash(k + 2, d.seed + 9);
      billow(W, cam, cx + (h1 - .5) * Rc * 1.1, cy + (h2 - .5) * Rc * .6, cz + (h3 - .5) * Rc * 1.1, Rc * (.42 + .2 * h2), env, d.seed + k * 2.1, b, 1);
    }
    const ga = A * ss(0, .25, b) * Math.exp(-b / 26);
    if (ga > .01) for (const g of d.gl) {
      const x = cx + g.p[0] * Rc, y = cy + g.p[1] * Rc - g.fall * .4 * b, z = cz + g.p[2] * Rc;
      const tw = g.f + g.w * T, o = g.o, c = Math.cos(tw), sn = Math.sin(tw);
      const ox = o[0] * c - o[2] * sn, oz = o[0] * sn + o[2] * c, L = .45;
      const glint = .22 + .78 * Math.pow(Math.max(0, Math.sin(tw * 1.7 + g.f)), 8);
      segW(W, cam, x - ox * L, y - o[1] * L, z - oz * L, x + ox * L, y + o[1] * L, z + oz * L, ga * .6 * glint);
    }
  }

  /* ================= the hit aft ================= */
  const HIT = OE.HIT;
  const HX0 = OE.shipXf(SA, HIT.t), HP0 = X.ap(HX0, HIT.at);
  const HIT_DEB = (() => {
    // mostly out through the port side and up, some aft
    const base = X.dir(HX0, V.norm([-.8, .75, -.2]));
    return mkFrags(HP0, V.mul(base, 20), 40, 311, .35, 1.25, 14, 1.4, 0);
  })();
  const HIT_SPK = mkSparks(30, 333, 18, 65, .3);
  // the breach: a torn outline on the port quarter plating, cracks running out of it (ship frame)
  const BREACH = (() => {
    const c = HIT.at, n = 14, out = [], cracks = [];
    for (let k = 0; k <= n; k++) {
      const th = k / n * TAU, rr = (k % 2 ? .75 : 1.25) * (.8 + .5 * hash(k % n, 51));
      out.push([c[0] - .06, c[1] + Math.sin(th) * rr * .75, c[2] + Math.cos(th) * rr * 1.1]);
    }
    for (let k = 0; k < 6; k++) {
      const th = (k + .3 * hash(k, 52)) / 6 * TAU, r0 = 1.1, r1 = 1.9 + 1.6 * hash(k, 53), kink = (hash(k, 54) - .5) * .6;
      cracks.push([[c[0] - .06, c[1] + Math.sin(th) * r0 * .75, c[2] + Math.cos(th) * r0 * 1.1],
        [c[0] - .06, c[1] + Math.sin(th + kink) * (r0 + r1) * .5 * .75, c[2] + Math.cos(th + kink) * (r0 + r1) * .5 * 1.1],
        [c[0] - .06, c[1] + Math.sin(th) * r1 * .75, c[2] + Math.cos(th) * r1 * 1.1]]);
    }
    const scorch = [];
    for (let k = 0; k <= 18; k++) { const th = k / 18 * TAU, rr = 3 * (.8 + .4 * hash(k % 18, 55)); scorch.push([c[0] - .05, c[1] + Math.sin(th) * rr * .6, c[2] + Math.cos(th) * rr * 1.2]); }
    return { out, cracks, scorch };
  })();
  function drawHit(W, cam, K, T, A) {
    const a = T - HIT.t; if (a < 0) return;
    const Xh = heroX(T, K), sk = seamK(T);
    // flash and a restrained bloom
    if (a < 3) K.glow(HP0, A * (1.15 * Math.exp(-a / .09) + .32 * Math.exp(-a / .7)), 30, 14, 240);
    if (a < .16) star(W, cam, HP0, 18, 40, A * (1 - a / .16), 4.4, 14);
    // shock front and its ring on the water
    if (a < .8) discS(W, cam, HP0, 2 + 110 * (1 - Math.exp(-a / .22)), A * .5 * Math.pow(1 - a / .8, 2), 64);
    if (a < 1.6) ringH(W, cam, [HP0[0], .15, HP0[2]], 5 + 70 * (1 - Math.exp(-a / .4)), A * .4 * Math.pow(1 - a / 1.6, 1.4), 64);
    // fireball: layered billows swelling and rising off the quarter, becoming the smoke
    if (a < 9) for (let k = 0; k < 6; k++) {
      const h1 = hash(k, 71), h2 = hash(k + 1, 71), h3 = hash(k + 2, 71), g = 1 - Math.exp(-a / .45);
      const x = HP0[0] + (h1 - .5) * 9 * g - 4 * g + WIND[0] * a, y = HP0[1] + 1 + 6 * g * (.5 + h2) + 2.2 * a, z = HP0[2] + (h3 - .5) * 10 * g + WIND[2] * a;
      billow(W, cam, x, y, z, (2 + 9 * g + 1.2 * a) * (.7 + .5 * h2), A * .7 * Math.exp(-a / 2.2) * ss(0, .04, a), 9.1 + k * 1.9, a, 2);
    }
    // debris arcs into the sea, sparks
    if (a < 2) drawSparks(W, cam, HP0, HIT_SPK, a, A * .9, .06);
    if (a < 8) for (const F of HIT_DEB) {
      if (a < F.tImp) {
        let q0 = fragAt(F, Math.max(0, a - .15));
        for (let s = 1; s <= 3; s++) { const q1 = fragAt(F, Math.max(0, a - .15 + .05 * s)); seg(W, cam, q0, q1, A * (.25 + .6 * F.big) * (s / 3)); q0 = q1; }
      } else if (F.imp && F.big > .45) splash(W, cam, F.imp[0], F.imp[2], a - F.tImp, 2 + 3 * F.big, A * .7, F.h * 91, T);
    }
    // the breach mark (yellow), with the flash that marks it
    const le = OE.toShip(Xh, V.sub(cam.eye, Xh.T)), facing = le[0] < HIT.at[0] ? 1 : .7;
    W.style(HI, 1);
    if (a < .7) { const n = V.norm(X.dir(Xh, [-1, 0, 0])), [U, Vv] = perp(n); ringA(W, cam, X.ap(Xh, [HIT.at[0] - .1, HIT.at[1], HIT.at[2]]), U, Vv, .8 + 11 * (1 - Math.exp(-a / .16)), A * .9 * Math.pow(1 - a / .7, 1.4), A * .5 * Math.pow(1 - a / .7, 1.4), 40); }
    const bk = A * sk * ss(.04, .35, a) * facing;
    if (bk > .005) {
      const P = BREACH.out.map(p => X.ap(Xh, p));
      for (let k = 0; k < P.length - 1; k++) seg(W, cam, P[k], P[k + 1], bk * .95);
      for (const c of BREACH.cracks) { const q = c.map(p => X.ap(Xh, p)); seg(W, cam, q[0], q[1], bk * .6); seg(W, cam, q[1], q[2], bk * .45); }
    }
    W.style(WH, 1);
    if (bk > .005) { const S = BREACH.scorch.map(p => X.ap(Xh, p)); for (let k = 0; k < S.length - 1; k++) seg(W, cam, S[k], S[k + 1], bk * .22); }
    // fire on deck: flickering tongues leaning aft in the ship's wind, embers, its glow; it feeds the smoke
    const fk = OE.fireK(T) * sk;
    if (fk > .004) {
      const F0 = X.ap(Xh, HIT.fire), lean = X.dir(Xh, [.2, 0, -1]), side = X.dir(Xh, [1, 0, 0]), fwd = X.dir(Xh, [0, 0, 1]);
      // tongues: teardrop outlines that leap, lick and collapse on their own cycles, laid over aft by the ship's wind;
      // a smaller one burns inside every other
      // their width lies across the line of sight so every tongue reads as a shape from any side
      const e = cam.eye, ax = V.norm([lean[0] * .45, 1, lean[2] * .45]);
      const cs = V.norm(V.cross(ax, [e[0] - F0[0], e[1] - F0[1], e[2] - F0[2]]));
      for (let k = 0; k < 9; k++) {
        const kk = k % 6, inner = k >= 6, Pk = .42 + .3 * hash(k, 83), ph = T / Pk + hash(k, 84), u = fr(ph), cyc = Math.floor(ph);
        const H = (1.3 + 3 * hash(k, cyc * 1.7 + 85)) * (.55 + .45 * fk) * (inner ? .55 : 1);
        const ht = H * (.3 + .7 * Math.pow(Math.sin(PI * Math.min(1, u * 1.2)), .7));
        const bx = (kk - 2.5) * .95 + (hash(kk, 86) - .5) * .7, bz = (hash(kk, 81) - .5) * 3.5 - (inner ? .3 : 0), w0 = (.55 + .45 * hash(k, 87)) * (inner ? .5 : 1);
        const b0 = F0[0] + side[0] * bx + fwd[0] * bz, b1 = F0[1] - .25, b2 = F0[2] + side[2] * bx + fwd[2] * bz;
        let lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0;
        const al = A * fk * (inner ? .8 : .65);
        for (let q = 0; q <= 7; q++) {
          const t = q / 7, y = ht * t, wd = w0 * Math.pow(Math.sin(PI * Math.min(1, (t + .12) / 1.12)), .75);
          const wob = .4 * t * noise(T * 6.5 + k * 1.9, t * 2.2 + k), lk = y * (.2 + .55 * t);
          const cx = b0 + lean[0] * lk + cs[0] * wob, cy = b1 + y + cs[1] * wob, cz = b2 + lean[2] * lk + cs[2] * wob;
          const Lx = cx - cs[0] * wd, Ly = cy - cs[1] * wd, Lz = cz - cs[2] * wd, Rx = cx + cs[0] * wd, Ry = cy + cs[1] * wd, Rz = cz + cs[2] * wd;
          if (q) { segW(W, cam, lx, ly, lz, Lx, Ly, Lz, al * (1 - t * .35)); segW(W, cam, rx, ry, rz, Rx, Ry, Rz, al * (1 - t * .35)); }
          lx = Lx; ly = Ly; lz = Lz; rx = Rx; ry = Ry; rz = Rz;
        }
        // the lick that breaks off the top as the tongue collapses
        if (!inner && u > .6) {
          const v = (u - .6) / .4, y = ht + .8 + 1.8 * v, lk = y * .7, s = .3 * (1 - v) + .08;
          const cx = b0 + lean[0] * lk, cy = b1 + y, cz = b2 + lean[2] * lk;
          segW(W, cam, cx - cs[0] * s, cy - .35, cz - cs[2] * s, cx, cy + .45, cz, al * (1 - v));
          segW(W, cam, cx + cs[0] * s, cy - .35, cz + cs[2] * s, cx, cy + .45, cz, al * (1 - v));
        }
      }
      for (let j = 0; j < 14; j++) {
        const Pj = 1.1 + .7 * hash(j, 91), u = fr((T + hash(j, 92) * 5) / Pj), cyc = Math.floor((T + hash(j, 92) * 5) / Pj);
        const t = u * Pj, h1 = hash(j, cyc + 93), h2 = hash(j + 7, cyc + 93);
        const x = F0[0] + side[0] * (h1 - .5) * 5 + lean[0] * (3 * t + 4 * t * t) + side[0] * .8 * Math.sin(t * 7 + j), y = F0[1] + 7 * t - 1.2 * t * t, z = F0[2] + side[2] * (h1 - .5) * 5 + fwd[2] * (h2 - .5) * 3 + lean[2] * (3 * t + 4 * t * t);
        segW(W, cam, x, y, z, x - lean[0] * .5, y - .35, z - lean[2] * .5, A * .7 * fk * (1 - u) * ss(0, .1, u));
      }
      K.glow(V.add(F0, [0, 2, 0]), A * fk * .2 * (.75 + .25 * noise(T * 7, 3.3)), 6, 5, 110);
    }
  }

  /* ================= hooks ================= */
  const CLOSE = OE.CIWS_ENG.filter(e => !e.late);
  const OEFX = window.OEFX = {
    launchFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const I of OE.INTS) {
        const s = T - I.tL; if (s < -.05 || s > 70) continue;
        if (s >= 0) { drawTrail(K.W, K.cam, I, T, A); drawCloud(K.W, K.cam, I, T, A); }
        drawVent(K.W, K.cam, K, I, T, A);
        if (s >= 0 && T <= I.tEnd) drawPlume(K.W, K.cam, K, I, T, A);
        drawSpent(K.W, K.cam, K, I, T, A);
      }
    },
    interceptFx(T, K) { const A = K.dim * seamK(T); if (A > .003) for (const k of KILLS) drawFarKill(K.W, K.cam, K, k, T, A); },
    ciwsFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const e of OE.CIWS_ENG) drawBurst(K.W, K.cam, K, e, T, A);
      for (const e of CLOSE) drawCloseKill(K.W, K.cam, K, e, T, A);
    },
    gunFx(T, K) { const A = K.dim * seamK(T); if (A > .003) for (const g of GUN_SHOTS) drawShot(K.W, K.cam, K, g, T, A); },
    decoyFx(T, K) { const A = K.dim * seamK(T); if (A > .003) for (const d of OE.DECOYS) drawDecoy(K.W, K.cam, K, d, T, A); },
    hitFx(T, K) { if (T >= HIT.t && T < 152) drawHit(K.W, K.cam, K, T, K.dim); },
    /* camera shake (px): the hit, close kills, the gun, launches, the Phalanx's own vibration */
    shake(T) {
      let amp = 0;
      const h = T - HIT.t; if (h >= 0 && h < 2.5) amp += 15 * Math.exp(-h / .32);
      for (const e of CLOSE) { const a = T - e.round.tEnd; if (a >= 0 && a < 1.5) amp += 5 * Math.exp(-a / .22); }
      for (const e of OE.CIWS_ENG) if (T >= e.t0 && T <= e.t1) amp += 1.1;
      for (const g of GUN_SHOTS) { const a = T - g.t; if (a >= 0 && a < .8) amp += 3.5 * Math.exp(-a / .09); }
      for (const I of OE.INTS) { const a = T - I.tL; if (a >= 0 && a < 3) amp += 2.2 * ss(0, .1, a) * Math.exp(-a / .9); }
      return amp > .05 ? FILM.shake(T, amp, 21) : null;
    },
    /* Mk 45 barrel recoil (m) for the film's gun drawing */
    gunRecoil(T) {
      let r = 0;
      for (const g of GUN_SHOTS) { const a = T - g.t; if (a >= 0 && a < .9) r = Math.max(r, .55 * (a < .035 ? a / .035 : Math.exp(-(a - .035) / .16))); }
      return r;
    },
    /* where the decoys are (rockets, then their clouds), for the film's camera; null before the first one */
    decoyFocus(T) {
      let s = [0, 0, 0], n = 0;
      for (const d of OE.DECOYS) {
        const a = T - d.t; if (a <= 0) continue;
        const p = a < d.bloom ? decoyAt(d, a) : [d.Bp[0] + WIND[0] * (a - d.bloom), d.Bp[1] - .9 * (a - d.bloom), d.Bp[2] + WIND[2] * (a - d.bloom)];
        const w = ss(0, .7, a);             // each joins the average smoothly
        s = V.mad(s, p, w); n += w;
      }
      return n > 1e-9 ? V.mul(s, 1 / n) : null;
    },
    billow, seamK,
    cues: [],
  };

  /* ================= sound (added to the film's cues; fired only in real time) ================= */
  const S = STAGE.SFX, CU = OEFX.cues;
  const dShip = (p, t) => V.dist(p, OE.shipPos(SA, t));
  for (const I of OE.INTS) CU.push([I.tL + SEP, () => { S.noise(.3, 1100, .6, .025, .004); S.tone(180, 90, .25, 'sine', .015); }]);
  for (const e of CLOSE) {
    const t = e.round.tEnd, dl = Math.min(1.6, dShip(e.kp, t) / 343);
    CU.push([t + dl, () => { S.crack(); S.tone(70, 38, .8, 'sine', .09); }]);
    CU.push([t + dl + .7, () => S.noise(1.4, 650, .5, .035, .06)]);
  }
  for (const g of GUN_SHOTS) CU.push([g.tb + Math.min(3, dShip(g.B, g.tb) / 343 * .35), () => { S.tone(52, 36, .7, 'sine', .045); S.noise(.8, 300, .8, .03, .01); }]);
  for (const d of OE.DECOYS) CU.push([d.t + d.bloom + .45, () => { S.noise(.35, 2600, .7, .045, .004); S.tone(420, 260, .2, 'triangle', .012); }]);
  CU.push([HIT.t + .12, () => S.noise(1.6, 3400, .5, .05, .01)]);
  CU.push([HIT.t + .35, () => S.noise(4.5, 330, .7, .1, .45)]);
  CU.push([HIT.t + 1.4, () => S.noise(1.8, 800, .5, .03, .08)]);
})();
