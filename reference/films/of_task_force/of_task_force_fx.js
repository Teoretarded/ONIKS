/* OF "Task Force" combat effects (stage B). Stage A (of_task_force_film.js) calls each hook every frame, after the
   scene's hairlines and before the flush, with the film time T and a context K:
     K.W       the Wire (K.W.seg(a, b, alpha) world, K.W.seg2 screen, K.W.ring, K.W.disc; fog is off when called)
     K.cam     the M3.Cam of this frame
     K.glow(p, a, m, px, max)   additive radial glow drawn after the flush (restrained bloom)
     K.ships   { CV, D1, D2, CG: { X (rolling ship transform at T), ciws: {yaw, pitch} | null, spin } }
     K.dim     0..1 world visibility (the film takes it from OFFX.dimAt: drops while the lens is inside D1's smoke)
   The film also sets OFFX.eyeAt (the lens position, for blast waves reaching it at the speed of sound in OFFX.shake).
   Data: OF.ROUNDS, OF.INTS, OF.CIWS_ENG, OF.HIT, OF.PARCELS / OF.smokeAt, OF.WIND (of_task_force_world.js).
   Spectacle only: cell blasts, the lattice of smoke trails from every ship (laid in the air, drifting on the wind and
   lingering for a minute), boost flames, spent boosters, far bursts, the misses' self-destructs, Phalanx tracer, A3's
   close kill, A4's strike on DDG 1 and its fire and smoke. Every element is analytic in its own event time plus seeded
   hashes (tables built at load), so render(T) stays a pure function of T; everything is gone by ~150 s (seam 168). */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const { PI, TAU, hash, DA, WIND, VK, SID, HIT } = OF;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp, noise = M3.noise;
  const HI = '#F4D23C', WH = '#F6F5F2', G = 9.81;
  const fr = x => x - Math.floor(x);
  const SD1 = SID.D1, SD2 = SID.D2;
  // a guard for the seam: whatever might still linger fades out high over the re-forming group
  const seamK = T => 1 - ss(148, 158, T);

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
  const offscreen = (cam, sx, sy, Rr) => sx + Rr < -30 || sx - Rr > cam.W + 30 || sy + Rr < -30 || sy - Rr > cam.H + 30;

  /* a smoke billow: a camera-facing scalloped outline (lobes bulge out, cusps between) with folds inside, the lobes
     turning slowly as it ages. Faded out when the lens is inside it (the dim veil takes over there). The outline runs
     off tables per (lobes, points per lobe): no trig or hashing per vertex (the lattice draws thousands). */
  const BT = new Map(), LH = new Float64Array(8);
  function btab(nl, per) {
    const key = nl * 16 + per; let t = BT.get(key);
    if (!t) {
      const n = nl * per, C = new Float64Array(n + 1), S = new Float64Array(n + 1), L = new Float64Array(n + 1), J = new Uint8Array(n + 1);
      for (let i = 0; i <= n; i++) { const th = i / n * TAU, li = i / n * nl; C[i] = Math.cos(th); S[i] = Math.sin(th); L[i] = Math.abs(Math.sin(PI * li)); J[i] = Math.floor(li) % nl; }
      t = { n, C, S, L, J }; BT.set(key, t);
    }
    return t;
  }
  function billow(W, cam, x, y, z, r, al, seed, age, folds, nearMul, minPx) {
    if (al <= .004 || r <= 0 || !pj(cam, x, y, z)) return;
    const nm = nearMul || 1, zc = PJ[2], near = ss(r * .8 * nm, r * 2.6 * nm, zc);
    if (near <= 0) return;
    const Rp = r * cam.fl / zc;
    if (Rp < (minPx || .7)) return;
    const sx = PJ[0], sy = PJ[1];
    if (offscreen(cam, sx, sy, Rp)) return;
    al *= near * (1 - ss(700, 1600, Rp));
    if (al <= .004) return;
    const nl = 5 + Math.floor(fr(seed * 7.31) * 4), per = clamp(Math.round(Rp / (nl * 2.4)), 2, 7), tb = btab(nl, per), n = tb.n;
    const dep = .2 * ss(5, 16, Rp), f0 = 1 - dep;
    const sg = fr(seed * 3.7) < .5 ? 1 : -1, ph = seed * TAU + sg * age * .09, hs = seed * 131.7, cph = Math.cos(ph), sph = Math.sin(ph);
    for (let j = 0; j < nl; j++) LH[j] = dep * (.65 + .7 * hash(j, hs));
    const C = tb.C, S = tb.S, L = tb.L, J = tb.J;
    let px = 0, py = 0;
    for (let i = 0; i <= n; i++) {
      const f = (f0 + L[i] * LH[J[i]]) * Rp, c = C[i] * cph - S[i] * sph, sn = S[i] * cph + C[i] * sph;
      const qx = sx + c * f, qy = sy - sn * f;
      if (i) W.seg2(px, py, qx, qy, al);
      px = qx; py = qy;
    }
    if (!folds || Rp < 14) return;
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
  function fragAt(F, a) {
    const k = F.tau * (1 - Math.exp(-a / F.tau)), p = F.p, v = F.v;
    return [p[0] + v[0] * k, p[1] + v[1] * k - 4.9 * a * a, p[2] + v[2] * k];
  }
  // fragments with momentum v0 (m/s vector), spread, drag time tau; each falls to the sea (y ~ 0) at tImp
  function mkFrags(p, v0, n, seed, k0, k1, spread, tau, upBias) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.5, 1.1, hash(k + 1, seed)) + (upBias || 0), sp = spread * (.3 + .7 * hash(k + 2, seed));
      const kk = mix(k0, k1, hash(k + 4, seed));
      const v = [v0[0] * kk + Math.cos(az) * Math.cos(el) * sp, v0[1] * kk + Math.sin(el) * sp, v0[2] * kk + Math.sin(az) * Math.cos(el) * sp];
      const F = { v, tau, p, big: hash(k + 6, seed), tImp: 12, imp: null, h: hash(k + 8, seed) };
      for (let a = .005; a < 12; a += .005) {
        const q = fragAt(F, a);
        if (q[1] <= 0) { F.tImp = a; F.imp = [q[0], 0, q[2]]; break; }
      }
      o.push(F);
    }
    return o;
  }
  // a splash: jets thrown up and falling back, a ring spreading on the swell
  function splash(W, cam, x, z, a, sz, al, seed, T) {
    if (a < 0 || a > 2.6 || al <= .004) return;
    const y0 = OF.swell(x, z, T) * .9;
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
      const hz = 1 - .6 * ss(3000, 14000, Math.abs(cam.depth([x, y, z])));
      billow(W, cam, x, y, z, (r0 + rg * Math.sqrt(ak)) * (.7 + .6 * hash(k + 3, seed)), al * hz * ss(0, .35, ak), seed + k * 1.618, ak, k % 2 ? 1 : 2);
    }
  }
  const shipX = (S, T, K) => (K.ships && K.ships[S.id] && K.ships[S.id].X) || OF.shipXf(S, T);

  /* ================= the lattice: interceptor launches, flames, smoke trails ================= */
  const SEP = 6;                           // Mk 72 burnout and separation (s after launch)
  const MK72 = FAST.compile(HD.mk72(), { fine: false });
  const RISE = a => 1.4 * (1 - Math.exp(-a / 3)) + .14 * a;
  // how the laid smoke lives on: thins quickly at first, then hangs for a minute, then goes
  const LINGER0 = 48, LINGER1 = 78;
  const linger = age => (.5 + .5 * Math.exp(-age / 11)) * (1 - ss(LINGER0, LINGER1, age));
  const trailW = (age, boost) => (boost ? .8 + 2.5 * Math.sqrt(age) : .45 + 1.5 * Math.sqrt(age)) + .05 * age;
  const cellOf = I => I.S.kind === 'ddg' ? DA.vls(I.c) : I.S.kind === 'cg' ? OF.cgCell(I.c) : OF.cvLauncher(I.c).p;
  for (const I of OF.INTS) {
    const P = I.P, N = I.N, cum = new Float64Array(N), dsj = new Float32Array(N);
    for (let j = 1; j < N; j++) { const d = Math.hypot(P[j * 3] - P[j * 3 - 3], P[j * 3 + 1] - P[j * 3 - 2], P[j * 3 + 2] - P[j * 3 - 1]); cum[j] = cum[j - 1] + d; dsj[j - 1] = d; }
    dsj[N - 1] = dsj[N - 2];
    I.cum = cum; I.dsj = dsj; I.seed = 11.3 + I.i * 7.77;
    // Mk 29 rounds (ESSM) burn a single motor and shed nothing; VLS SM-6s drop the Mk 72 at SEP
    I.jSep = Math.round((I.mk29 ? 3.4 : SEP) * 60);
    const sm = j => [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]];
    const tan = j => V.norm(V.sub(sm(Math.min(N - 1, j + 1)), sm(Math.max(0, j - 1))));
    // smoke is laid at the nozzle, a few metres behind the path's head
    const TN = new Float64Array(N * 3);
    for (let j = 0; j < N; j++) { const t = tan(j), o = j < I.jSep && !I.mk29 ? 6.8 : 4.4; TN[j * 3] = P[j * 3] - t[0] * o; TN[j * 3 + 1] = P[j * 3 + 1] - t[1] * o; TN[j * 3 + 2] = P[j * 3 + 2] - t[2] * o; }
    I.TN = TN;
    const tn = j => [TN[j * 3], TN[j * 3 + 1], TN[j * 3 + 2]];
    // until the nozzle clears the cell its smoke goes down the plenum (the uptake vents it): the trail starts there
    let j0 = 0; while (j0 < N - 1 && cum[j0] < (I.mk29 ? 2 : 7)) j0++;
    I.j0 = j0;
    // billow nodes: overlapping (so they read as one column, not beads) over the first stretch, the columns and first
    // arches over the ships where the lens flies close; beyond, sparse clumps. Smoke rings along the boost.
    const nodes = []; let d = 6, j = 0;
    const jFly = Math.min(N - 2, Math.floor((I.tI - I.tL) * 60));
    for (;;) {
      while (j < N - 1 && cum[j] < d) j++;
      if (j >= jFly) break;
      const t = tan(j), [U, Vv] = perp(t), boost = j < I.jSep, k = nodes.length;
      nodes.push({ j, s: I.tL + j / 60, p: tn(j), U, V: Vv, h: hash(k, I.i + 17), h2: hash(k, I.i + 23), h3: hash(k, I.i + 29), boost, dense: d < 800 });
      d += d < 800 ? (boost ? 9.5 : 8) * (.8 + .4 * hash(k, I.i + 37)) : Math.max(60, .07 * d) * (.7 + .6 * hash(k, I.i + 41));
    }
    I.nodes = nodes;
    const c = cellOf(I);
    I.cellL = c;
    if (I.S.kind === 'ddg') {
      // the Mk 41 uptake beside the cell (module centre line) vents the booster's exhaust at launch
      const xm = [-3.15, -1.05, 1.05, 3.15].reduce((b, q) => Math.abs(q - c[0]) < Math.abs(b - c[0]) ? q : b, 99);
      I.upL = [xm, c[1] + .05, c[2]];
    } else if (I.S.kind === 'cg') I.upL = [c[0] < 0 ? -3.05 : 3.05, c[1] + .05, c[2] + .7];
    else {
      // Mk 29: the blast leaves the back of the box launcher
      const L = OF.cvLauncher(I.c);
      I.upL = V.mad(L.p, L.d, -4.4); I.dirL = L.d;
    }
    if (!I.mk29) {
      // the spent booster: carried on from separation, tumbling, falling into the sea
      const ts = I.tL + SEP, hs = OF.intAt(I, ts), dir = OF.intDir(I, ts);
      const v = V.mul(V.sub(OF.intAt(I, ts + .02), OF.intAt(I, ts - .02)), 1 / .04);
      I.bst = { p: V.mad(hs, dir, -5.7), v: V.mul(v, .92), dir, ax: perp(dir)[0], w: 3.2 + 2 * hash(I.i, 3), tImp: 30, imp: null };
      for (let a = .01; a < 30; a += .01) { const q = bstAt(I.bst, a); if (q[1] <= 0) { I.bst.tImp = a; I.bst.imp = q; break; } }
    }
  }
  function bstAt(b, a) {
    // drag slows it along its flight; it falls, reaching a tumbling terminal speed of ~75 m/s
    const k = 1.6 * (1 - Math.exp(-a / 1.6)), vt = 75, tf = vt / G, fall = vt * tf * (a / tf - 1 + Math.exp(-a / tf));
    return [b.p[0] + b.v[0] * k, b.p[1] + b.v[1] * k - fall, b.p[2] + b.v[2] * k];
  }

  /* 2D value noise for the trails' meander and edges (half the lookups of M3.noise; a fixed seeded table) */
  const PT = new Uint8Array(512), HV = new Float64Array(256);
  { let a = 1337; const q = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { a = (a * 1103515245 + 12345) % 2147483648; const j = a % (i + 1); const t = q[i]; q[i] = q[j]; q[j] = t; } for (let i = 0; i < 512; i++) PT[i] = q[i & 255]; for (let i = 0; i < 256; i++) HV[i] = hash(i, 77.7) * 2 - 1; }
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X0 = xi & 255, Y0 = yi & 255, X1 = (X0 + 1) & 255, Y1 = (Y0 + 1) & 255;
    const a = HV[PT[PT[X0] + Y0]], b = HV[PT[PT[X1] + Y0]], c = HV[PT[PT[X0] + Y1]], d = HV[PT[PT[X1] + Y1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // trail buffers (projected laid-smoke centres)
  const NBUF = 3072, BX = new Float64Array(NBUF), BY = new Float64Array(NBUF), BW = new Float64Array(NBUF), BA = new Float64Array(NBUF), BG = new Float64Array(NBUF);
  const NX = new Float64Array(NBUF), BOK = new Uint8Array(NBUF);
  function meander(I, j, age, o) {
    const amp = .3 + 1.15 * Math.pow(age, .8), u = j * .04 + I.seed, v = age * .07;
    o[0] = amp * n2(u, v + 17.1); o[1] = amp * .6 * n2(u + 53.3, v); o[2] = amp * n2(u + 89.9, v + 41.3);
    return o;
  }
  const MQ = [0, 0, 0];
  const PX_STEP = 20;
  /* the laid trail: wispy, broken edges of the smoke column (screen-space offsets of the projected centres), a hot
     core near the motor, billows riding along it, fresh smoke rings shed across the boost. Sampled along the table at
     a step that keeps ~PX_STEP px between points on screen (powers of two, aligned so a region's samples stay put). */
  function drawTrail(W, cam, I, T, A) {
    const s1 = Math.min(T, I.tEnd) - I.tL; if (s1 <= 0) return;
    const P = I.TN, jN = Math.min(I.N - 1, Math.floor(s1 * 60)), fl = cam.fl, sd = I.seed, e = cam.eye;
    if (jN <= I.j0) return;
    if (T - (I.tL + jN / 60) > LINGER1) return;
    let n = 0;
    const put = (x, y, z, age, boost, j) => {
      if (pj(cam, x, y, z)) {
        const w = trailW(age, boost);
        BX[n] = PJ[0]; BY[n] = PJ[1]; BW[n] = Math.min(900, w * fl / PJ[2]); BOK[n] = 1; BG[n] = age; NX[n] = j;
        BA[n] = (boost ? .36 * (.45 + .55 * Math.exp(-age / 1.8)) : .27 * (.45 + .55 * Math.exp(-age / 1.2))) * linger(age)
          * ss(0, .06, age) * (1 - ss(260, 700, BW[n]));
      } else BOK[n] = 0;
      n++;
    };
    let j = I.j0;
    for (;;) {
      const age = T - (I.tL + j / 60), boost = j < I.jSep;
      const bx = P[j * 3] + WIND[0] * age, by = P[j * 3 + 1] + RISE(age), bz = P[j * 3 + 2] + WIND[2] * age;
      const dist = Math.hypot(bx - e[0], by - e[1], bz - e[2]);
      if (age <= LINGER1) {
        meander(I, j, age, MQ);
        put(bx + MQ[0], by + MQ[1], bz + MQ[2], age, boost, j);
      } else { BOK[n] = 0; n++; }
      if (j === jN || n >= NBUF - 2) break;
      const want = PX_STEP * Math.max(dist, 20) / (fl * Math.max(I.dsj[j], .3));
      let st = want < 2 ? 1 : want < 4 ? 2 : want < 8 ? 4 : want < 16 ? 8 : want < 32 ? 16 : 32;
      while (st > 1 && j % st) st >>= 1;
      j = Math.min(jN, j + st);
    }
    // up to the nozzle now
    if (T < I.tEnd) {
      const h = OF.intAt(I, T), dr = OF.intDir(I, T), o = T - I.tL < SEP && !I.mk29 ? 6.8 : 4.4;
      if (h) put(h[0] - dr[0] * o, h[1] - dr[1] * o, h[2] - dr[2] * o, 0, T - I.tL < I.jSep / 60, jN + 1);
    }
    // edges: offset along the screen normal, each edge swelling and thinning on its own, broken into wisps
    let pxL = 0, pyL = 0, pxR = 0, pyR = 0, prev = false;
    for (let i = 0; i < n; i++) {
      if (!BOK[i]) { prev = false; continue; }
      const a = i > 0 && BOK[i - 1] ? i - 1 : i, b = i < n - 1 && BOK[i + 1] ? i + 1 : i;
      const tx = BX[b] - BX[a], ty = BY[b] - BY[a], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
      const jj = NX[i], g = BG[i], w = BW[i];
      if (w < 1.1) {
        if (prev) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], (BA[i] + BA[i - 1]) * 1.1 * A);
        pxL = BX[i]; pyL = BY[i]; pxR = BX[i]; pyR = BY[i]; prev = true;
        continue;
      }
      const u = jj * .09 + sd, v = g * .22;
      const wl = w * (1 + .32 * n2(u, v + 21.3)), wr = w * (1 + .32 * n2(u + 67.1, v));
      const qxL = BX[i] + nx * wl, qyL = BY[i] + ny * wl, qxR = BX[i] - nx * wr, qyR = BY[i] - ny * wr;
      if (prev) {
        const al = (BA[i] + BA[i - 1]) * .5 * A;
        const bL = sat(.55 + 1.3 * n2(u * .8 + 92.1, v)), bR = sat(.55 + 1.3 * n2(u * .8, v + 134.7));
        W.seg2(pxL, pyL, qxL, qyL, al * bL); W.seg2(pxR, pyR, qxR, qyR, al * bR);
        if (g < 1.2) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], A * .5 * (1 - g / 1.2));
      }
      pxL = qxL; pyL = qyL; pxR = qxR; pyR = qyR; prev = true;
    }
    // billows along the column (jittered in size and place, the column breaking up as it ages); only where they are
    // big enough on screen to read as smoke, far off the edges alone carry the trail; young smoke rings on the boost
    for (const nd of I.nodes) {
      if (nd.s > T) break;
      const age = T - nd.s; if (age > LINGER1) continue;
      // far along the path only irregular clumps (evenly spaced beads would read as a string of pearls)
      if (nd.dense ? nd.h3 < .5 * ss(18, 60, age) : nd.h3 < .55) continue;
      const w0 = Math.max(4, trailW(age, nd.boost)), w = w0 * (nd.dense ? .8 + .55 * nd.h2 : 1.5 + 1.1 * nd.h2);
      const ou = (nd.h - .5) * .7 * w0, ov = (nd.h2 - .5) * .7 * w0;
      const bx = nd.p[0] + WIND[0] * age + nd.U[0] * ou + nd.V[0] * ov, by = nd.p[1] + RISE(age) + nd.U[1] * ou + nd.V[1] * ov, bz = nd.p[2] + WIND[2] * age + nd.U[2] * ou + nd.V[2] * ov;
      // cheap cull before the meander
      if (!pj(cam, bx, by, bz)) continue;
      const Rp = w * fl / PJ[2];
      if (Rp < 3.5 || offscreen(cam, PJ[0], PJ[1], Rp + 25 * fl / PJ[2])) continue;
      meander(I, nd.j, age, MQ);
      const x = bx + MQ[0], y = by + MQ[1], z = bz + MQ[2];
      const ab = A * (nd.boost ? .23 * (.4 + .6 * Math.exp(-age / 2.2)) : .17 * (.45 + .55 * Math.exp(-age / 1.5))) * linger(age) * ss(.05, .5, age)
        * ss(3.5, 10, Rp) * (nd.dense ? ss(2, 9, age) : .6);
      billow(W, cam, x, y, z, w, ab, sd + nd.h * 57, age, nd.h > .45 ? 1 : 0, 1, 3.5);
      if (nd.boost && age < 3 && nd.h > .3) {
        const ar = A * .16 * Math.pow(1 - age / 3, 1.5) * ss(0, .06, age);
        ringA(W, cam, [x, y, z], nd.U, nd.V, trailW(age, true), ar, ar * .4, 28, .08 + .1 * sat(age / 2), nd.h * 20 + age * .5);
      }
    }
  }
  /* the launch cloud: exhaust out of the cell and the uptake (or the launcher's back), billowing over the deck and left
     behind in the air as the ship steams on */
  function drawCloud(W, cam, I, T, A) {
    const s = T - I.tL;
    if (!I.P0w) { const Xs = OF.shipXf(I.S, I.tL); I.P0w = X.ap(Xs, I.cellL); I.upW = X.ap(Xs, I.upL); }
    const P0 = I.P0w, up = I.upW, big = I.mk29 ? .8 : 1;
    for (let k = 0; k < 11; k++) {
      const a = s - k * .1; if (a <= 0 || a > 44) continue;
      const h1 = hash(k, I.i + 31), h2 = hash(k + 1, I.i + 31), h3 = hash(k + 2, I.i + 31);
      const src = k % 2 ? up : P0, ph = h1 * TAU, el = .25 + .7 * h2;
      const dl = Math.hypot(Math.cos(ph), el, Math.sin(ph)), v0 = (5 + 9 * h3) / dl, kk = .9 * (1 - Math.exp(-a / .9));
      const x = src[0] + Math.cos(ph) * v0 * kk + WIND[0] * a, y = src[1] + el * v0 * kk + 1.9 * Math.pow(a, .7), z = src[2] + Math.sin(ph) * v0 * kk + WIND[2] * a;
      const r = (1 + 3.1 * Math.sqrt(a)) * (.75 + .5 * h3) * big;
      billow(W, cam, x, y, z, r, A * .34 * ss(0, .12, a) * (.35 + .65 * Math.exp(-a / 7)) * (1 - ss(20, 44, a)) * (k < 4 ? 1 : .8), I.seed + k * 1.7, a, 2);
    }
  }
  /* the vent: flame out of the uptake and the cell as the booster lights in it (moves with the ship); the Mk 29's
     back-blast */
  function drawVent(W, cam, K, I, T, A) {
    const a = T - I.tL; if (a < -.04 || a > 1.4) return;
    const Xh = shipX(I.S, T, K), up = X.ap(Xh, I.upL), cell = X.ap(Xh, I.cellL), k = Math.exp(-Math.max(0, a) / .32);
    // the ignition: a flash off the deck that reads even from high over the group
    if (a >= 0 && a < .8) K.glow(cell, A * (1.1 * Math.exp(-a / .12) + .25 * Math.exp(-a / .5)), 12, 9, 170);
    if (I.mk29) {
      const d = X.dir(Xh, I.dirL), [U, Vv] = perp(d);
      for (let q = 0; q < 9; q++) {
        const ph = q / 9 * TAU + hash(q, I.i), sp = .25 + .35 * hash(q + 3, I.i), L = (6 + 10 * hash(q + 1, I.i)) * (.6 + .4 * noise(T * 20 + q, I.i));
        const tip = V.add(V.mad(up, d, -L), V.add(V.mul(U, Math.cos(ph) * sp * L), V.mul(Vv, Math.sin(ph) * sp * L)));
        seg(W, cam, up, tip, A * .75 * k);
      }
      K.glow(up, A * (.6 * k + .08), 5, 6, 110);
      return;
    }
    for (let q = 0; q < 6; q++) {
      const src = q < 4 ? up : cell, h = (4 + 8 * hash(q, I.i + 3)) * (.6 + .4 * noise(T * 22 + q, I.i)) * (a < 0 ? .3 : 1);
      const lx = (hash(q, I.i + 5) - .5) * 1.2, lz = (hash(q, I.i + 6) - .5) * 1.6;
      segW(W, cam, src[0] + lx * .3, src[1], src[2] + lz * .3, src[0] + lx + WIND[0] * .08 * h, src[1] + h, src[2] + lz - 1.2 * h * .1, A * .8 * k);
    }
    K.glow(up, A * (.65 * k + .1), 6, 6, 120);
  }
  /* flame out of the nozzles: a spindle of flickering meridians and a bright core; a single stroke far off */
  function drawPlume(W, cam, K, I, T, A) {
    const h = OF.intAt(I, T); if (!h) return;
    const s = T - I.tL, dir = OF.intDir(I, T), boost = s < I.jSep / 60, big = boost && !I.mk29;
    const nz = V.mad(h, dir, big ? -6.8 : -4.4), d = V.dist(nz, cam.eye), fk = .5 + .5 * noise(T * 34 + I.i * 9, 1.7);
    let Lf = big ? (8 + 6 * fk) * (.35 + .65 * ss(0, .15, s)) : boost ? 6 + 4 * fk : 2.6 + 1.6 * fk;
    // still in or just out of the cell: the flame stops at the deck (the rest goes down the plenum and out the uptake)
    if (s < 3 && !I.mk29) {
      const Xh = shipX(I.S, T, K), c = X.ap(Xh, I.cellL), up = X.dir(Xh, [0, 1, 0]);
      const hN = (nz[0] - c[0]) * up[0] + (nz[1] - c[1]) * up[1] + (nz[2] - c[2]) * up[2], dn = Math.max(.05, V.dot(dir, up));
      Lf = Math.min(Lf, Math.max(0, hN + .5) / dn);
    }
    const ax = [-dir[0], -dir[1], -dir[2]];
    if (Lf > .05) seg(W, cam, nz, V.mad(nz, ax, Math.max(Lf * .7, d * .004)), (boost ? .95 : .75) * A);
    if (d < 1500 && Lf > .3) {
      const [U, Vv] = perp(dir), R0 = big ? .55 : boost ? .3 : .15, M = 7;
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
    K.glow(V.mad(nz, ax, Lf * .25), A * (big ? .5 : boost ? .38 : .22) * (.8 + .2 * fk), big ? 7 : 2.5, 4, big ? 100 : 50);
  }
  function drawSpent(W, cam, K, I, T, A) {
    if (!I.bst) return;
    const b = I.bst, a = T - I.tL - SEP; if (a < 0 || a > b.tImp + 2.6) return;
    if (a < b.tImp) {
      const p = bstAt(b, a), d = V.dist(p, cam.eye);
      // tumbling about an axis across its flight
      const th = b.w * a * a / (a + .6), c = Math.cos(th), sn = Math.sin(th), u = b.ax, f = b.dir;
      const w = V.cross(u, f), ax = [f[0] * c + w[0] * sn, f[1] * c + w[1] * sn, f[2] * c + w[2] * sn];
      if (d < 700) FAST.draw(W, MK72, X.make(R.look(ax, u), p), {}, { fine: false, a: A * .85 });
      else { const L = Math.max(.9, d * .0011); seg(W, cam, V.mad(p, ax, -L), V.mad(p, ax, L), A * .7); }
      // residual smoke off the casing
      const q0 = bstAt(b, Math.max(0, a - .35));
      seg(W, cam, q0, p, A * .22 * Math.exp(-a / 6));
    } else splash(W, cam, b.imp[0], b.imp[2], a - b.tImp, 5, A * .8, I.seed * 7.3, T);
    // the separation puff (strung along the path where the booster let go), the sustainer lighting
    if (a < 6) for (let q = 0; q < 3; q++) {
      const o = (q - 1) * (4 + 6 * Math.sqrt(a)), c = V.mad(b.p, b.dir, o);
      billow(W, cam, c[0] + WIND[0] * a, c[1] + RISE(a), c[2] + WIND[2] * a, (1.5 + 3.5 * Math.sqrt(a)) * (q === 1 ? 1 : .75), A * .15 * Math.exp(-a / 2.5) * ss(0, .1, a), I.seed * 3.1 + q, a, 0);
    }
    if (a < .5) K.glow(OF.intAt(I, T) || b.p, A * .35 * Math.exp(-a / .12), 4, 4, 60);
  }

  /* ================= far kills: the interceptor meets its round, its partner bursts in the debris, the misses fly on and
     self-destruct ================= */
  const KILLS = OF.INTS.map(I => {
    const miss = I.role === 'miss', second = I.role === 'second';
    const t = miss ? I.tEnd : I.tI, p = miss ? OF.intAt(I, I.tEnd - 1e-3) : I.PI;
    const r = I.round, rd = OF.roundDir(r, Math.min(I.tI, r.tEnd - .02));
    return {
      I, t, p, miss, second, sc: miss ? .5 : second ? .7 : 1, seed: 3.1 + I.i * 5.3,
      sparks: mkSparks(miss ? 14 : 22, 40 + I.i, 45, 170),
      frags: I.role === 'kill' ? mkFrags(p, V.mul(rd, 680), 14, 70 + I.i, .3, .75, 60, 1.1) : [],
    };
  });
  function drawFarKill(W, cam, K, k, T, A) {
    const a = T - k.t; if (a < 0 || a > 50) return;
    const p = k.p, sc = k.sc;
    if (a < 3) {
      K.glow(p, A * (1 * Math.exp(-a / .12) + .25 * Math.exp(-a / .9)) * sc, 200 * sc, 12, 170);
      K.glow(p, A * .16 * Math.exp(-a / .5) * sc, 1400, 50, 280);
    }
    if (a < .2) star(W, cam, p, 70 * sc, 30 * sc, A * .9 * (1 - a / .2), k.seed, 12);
    if (a < 1.4) discS(W, cam, p, (22 + 230 * (1 - Math.exp(-a / .38))) * sc, A * .6 * Math.pow(1 - a / 1.4, 1.6), 48);
    if (a < 1) discS(W, cam, p, (10 + 100 * (1 - Math.exp(-a / .25))) * sc, A * .45 * Math.pow(1 - a, 2), 36);
    if (a < 2.2) ringH(W, cam, p, (30 + 360 * (1 - Math.exp(-a / .5))) * sc, A * .32 * Math.pow(1 - a / 2.2, 1.5), 56);
    if (a < 2.4) drawSparks(W, cam, p, k.sparks, a, A * .85, .12);
    if (k.frags.length && a < 14) drawFrags(W, cam, k.frags, a, A * .7, T, 8);
    // the burst's smoke: a dense core that swells, then hangs and drifts
    puffs(W, cam, p, a, k.miss ? 4 : 8, 20 * sc, 30 * sc, 170 * sc, A * .22 * Math.exp(-a / 12) * (1 - ss(35, 50, a)), k.seed, .3);
    if (a < 6) billow(W, cam, p[0] + WIND[0] * a, p[1] + 3 * a, p[2] + WIND[2] * a, (10 + 45 * (1 - Math.exp(-a / .6))) * sc, A * .4 * Math.exp(-a / 1.4) * ss(0, .08, a), k.seed * 1.3, a, 1);
  }

  /* ================= Phalanx: tracer streams, muzzle fire, gun smoke, A3's close kill ================= */
  const ROF = 75, V0 = 1100, TD = 2.4, TR_LIFE = 2.2;
  for (const e of OF.CIWS_ENG) {
    const n = Math.floor((e.t1 - e.t0) * ROF) + 1, M = new Float64Array(n * 3), Dd = new Float64Array(n * 3), Sv = e.S;
    for (let k = 0; k < n; k++) {
      const tk = e.t0 + k / ROF, st = OF.ciwsState(Sv, tk), Xs = OF.shipXf(Sv, tk), sst = { ciwsYaw: st.yaw, ciwsPitch: st.pitch };
      const m = X.ap(Xs, DA.ciws(sst, e.m)), d0 = X.dir(Xs, DA.ciwsDir(sst, e.m)), [U, Vv] = perp(d0);
      // dispersion: ~2 mrad, triangular
      const g1 = (hash(k, e.m * 7 + 1 + Sv.n) + hash(k + 3, e.m * 7 + 2) - 1) * .004, g2 = (hash(k + 5, e.m * 7 + 3 + Sv.n) + hash(k + 7, e.m * 7 + 4) - 1) * .004;
      const d = V.norm([d0[0] + U[0] * g1 + Vv[0] * g2, d0[1] + U[1] * g1 + Vv[1] * g2, d0[2] + U[2] * g1 + Vv[2] * g2]);
      M.set(m, k * 3); Dd.set(d, k * 3);
    }
    e.n = n; e.M = M; e.Dd = Dd; e.sd = e.m * 5.1 + Sv.n * 13.3;
    const r = e.round;
    if (e.kill) {
      e.kp = OF.roundAt(r, r.tEnd); e.kd = OF.roundDir(r, r.tEnd - .02);
      e.frags = mkFrags(e.kp, V.mul(e.kd, 680), 36, 90 + e.m * 13 + r.i, .15, .6, 95, .65, .15);
      e.sparks = mkSparks(28, 120 + r.i, 40, 160);
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
    // the two bursts on A4 point toward the other destroyer (it comes in past DDG 2 onto DDG 1): their tracer burns out short
    const life = e.late ? .5 : e.pass ? .65 : TR_LIFE;
    if (T < e.t0 || T > e.t1 + life + 4.5) return;
    // tracers in flight: every round a dash flown from its own firing time; every third a brighter tracer
    if (T <= e.t1 + life + .1) {
      const k1 = Math.min(e.n - 1, Math.floor((T - e.t0) * ROF)), k0 = Math.max(0, Math.ceil((T - life - e.t0) * ROF));
      for (let k = k0; k <= k1; k++) {
        const a = T - (e.t0 + k / ROF); if (a <= 0) continue;
        const tr = k % 3 === 0;
        tracerAt(e, k, Math.max(0, a - (tr ? .026 : .013)), TQ0); tracerAt(e, k, a, TQ1);
        const al = A * (tr ? 1 : .55) * ss(0, .012, a) * (1 - ss(life - .4, life, a));
        segW(W, cam, TQ0[0], TQ0[1], TQ0[2], TQ1[0], TQ1[1], TQ1[2], al);
      }
    }
    // muzzle fire (current mount pose)
    const Xh = shipX(e.S, T, K), sh = K.ships && K.ships[e.S.id], cs = sh && sh.ciws ? sh.ciws : OF.ciwsState(e.S, T), sst = { ciwsYaw: cs.yaw, ciwsPitch: cs.pitch };
    if (T <= e.t1 + .02) {
      const m = X.ap(Xh, DA.ciws(sst, e.m)), d = X.dir(Xh, DA.ciwsDir(sst, e.m)), [U, Vv] = perp(d);
      const fi = Math.floor(T * ROF), f1 = hash(fi, e.sd + 3), f2 = hash(fi + 1, e.sd + 5);
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
      const te = e.t0 + q / 7, a = T - te, k = Math.min(e.n - 1, Math.round((te - e.t0) * ROF)), j = k * 3, h = hash(q, e.sd + 61);
      const kk = (3 + 4 * h) * (1 - Math.exp(-a / .2));
      billow(W, cam, e.M[j] + e.Dd[j] * kk + WIND[0] * a, e.M[j + 1] + e.Dd[j + 1] * kk + .6 * a, e.M[j + 2] + e.Dd[j + 2] * kk + WIND[2] * a,
        (.3 + 1.1 * Math.sqrt(a)) * (.6 + .8 * h), A * .09 * Math.exp(-a / 1.8) * ss(0, .06, a), e.sd + q * 1.37, a, 0);
    }
  }
  function drawCloseKill(W, cam, K, e, T, A) {
    const a = T - e.round.tEnd; if (a < 0 || a > 30) return;
    const p = e.kp;
    if (a < 2.5) K.glow(p, A * (1.05 * Math.exp(-a / .1) + .25 * Math.exp(-a / .7)), 22, 8, 190);
    if (a < .14) star(W, cam, p, 14, 26, A * (1 - a / .14), e.seed, 12);
    if (a < 1) discS(W, cam, p, 3 + 42 * (1 - Math.exp(-a / .24)), A * .6 * Math.pow(1 - a, 1.6), 48);
    if (a < .7) discS(W, cam, p, 2 + 17 * (1 - Math.exp(-a / .14)), A * .5 * Math.pow(1 - a / .7, 2), 32);
    if (a < 1.6) ringH(W, cam, [p[0], OF.swell(p[0], p[2], T) * .9 + .1, p[2]], 4 + 60 * (1 - Math.exp(-a / .35)), A * .35 * (1 - a / 1.6), 48);
    if (a < 2) drawSparks(W, cam, p, e.sparks, a, A * .85, .07);
    if (a < 8) drawFrags(W, cam, e.frags, a, A * .8, T, 4.5);
    // its fuel burning off: a fireball carried on along the round's line, rolling up into smoke
    if (a < 7) for (let k = 0; k < 6; k++) {
      const h1 = hash(k, e.seed), h2 = hash(k + 1, e.seed), h3 = hash(k + 2, e.seed), g = 1 - Math.exp(-a / .3), cr = 22 * (1 - Math.exp(-a / .35));
      const x = p[0] + e.kd[0] * cr + (h1 - .5) * 9 * g + WIND[0] * a, y = p[1] + e.kd[1] * cr + (h2 - .3) * 6 * g + 1.8 * a, z = p[2] + e.kd[2] * cr + (h3 - .5) * 9 * g + WIND[2] * a;
      billow(W, cam, x, y, z, (2 + 7 * g + a) * (.7 + .5 * h2), A * .6 * Math.exp(-a / 1.6) * ss(0, .03, a), e.seed + k * 2.3, a, 1);
    }
    puffs(W, cam, p, a, 5, 2.5, 7.5, 9, A * .32 * Math.exp(-a / 9), e.seed, .15, [e.kd[0] * 45, e.kd[1] * 45, e.kd[2] * 45, .45]);
  }

  /* ================= the rounds near the lens: ramjet flame with shock diamonds, spray off the sea under the shock ================= */
  const SPRAY_DT = .045;
  function drawRound(W, cam, K, r, T, A) {
    const vis = OF.roundVis(r, T); if (vis <= .01) return;
    const p = OF.roundAt(r, T), d = V.dist(p, cam.eye); if (d > 3500) return;
    const dir = OF.roundDir(r, T), tail = V.mad(p, dir, -4.5), ax = [-dir[0], -dir[1], -dir[2]], fk = .5 + .5 * noise(T * 40 + r.i * 3, 2.3);
    const Av = A * vis;
    seg(W, cam, tail, V.mad(tail, ax, Math.max(6 + 4 * fk, d * .006)), Av);
    seg(W, cam, V.mad(tail, ax, 2), V.mad(tail, ax, Math.max(16 + 6 * fk, d * .02)), Av * .35);
    if (d < 1400) {
      const [U, Vv] = perp(dir);
      for (let k = 0; k < 4; k++) ringA(W, cam, V.mad(tail, ax, 1.1 + k * 1.5), U, Vv, .3 * (1 - k * .17), Av * .75 * (1 - k * .2), Av * .35, 14);
    }
    K.glow(V.mad(tail, ax, 1.5), Av * (.3 + .35 * (1 - ss(300, 1500, d))) * (.8 + .2 * fk), 3.5, 3, 70);
    // the sea under a Mach 2 shock at ten metres: spray thrown up along its line, falling back behind it
    if (d > 2600) return;
    const n0 = Math.floor(T / SPRAY_DT);
    for (let k = 0; k < 30; k++) {
      const te = (n0 - k) * SPRAY_DT, a = T - te; if (te < r.t0 || a > 1.35) continue;
      const q = OF.roundAt(r, te), dq = OF.roundDir(r, te), h1 = hash(n0 - k, r.i + 5), h2 = hash(n0 - k, r.i + 9);
      const y0 = OF.swell(q[0], q[2], T) * .9, H = (2.5 + 3 * h1) * Math.sin(PI * Math.min(1, a / 1.35)) * (1 - .3 * a);
      const nx = -dq[2], nz = dq[0], sp = 1.5 + 5 * a;
      for (const sg of [-1, 1]) {
        const bx = q[0] + nx * sg * (.8 + 1.2 * h2), bz = q[2] + nz * sg * (.8 + 1.2 * h2);
        segW(W, cam, bx, y0, bz, bx + nx * sg * sp, y0 + H, bz + nz * sg * sp, Av * .32 * (1 - a / 1.35) * ss(0, .04, a));
      }
    }
  }

  /* ================= A4's strike on DDG 1 (starboard side, aft of the forward stack) ================= */
  const HX0 = OF.shipXf(SD1, HIT.t), HP0 = X.ap(HX0, HIT.at), HN = X.dir(HX0, [1, 0, 0]);
  const A4 = OF.RID.A4, A4D = OF.roundDir(A4, HIT.t - .02);
  // debris: vented out of the breach and up, a share carried on through with the round's momentum
  const HIT_DEB = mkFrags(HP0, V.mul(V.norm([HN[0] * .75, .8, HN[2] * .75 - .15]), 36), 52, 311, .35, 1.3, 26, 1.5, 0)
    .concat(mkFrags(HP0, V.mul(A4D, 680), 18, 317, .04, .09, 16, .9, .25));
  const HIT_SPK = mkSparks(34, 333, 18, 70, .3);
  // two small secondaries as the fire reaches ready stowage (spectacle; ship frame points near the fire)
  const SECOND = [
    { t: HIT.t + 3.6, at: [7.6, 9.4, -11], k: .55, sp: mkSparks(16, 351, 12, 45, .4) },
    { t: HIT.t + 7.9, at: [8.9, 9, -3.5], k: .4, sp: mkSparks(12, 357, 10, 38, .4) },
  ];
  // the breach: a torn outline on the starboard plating, cracks running out of it (ship frame)
  const BREACH = (() => {
    const c = HIT.at, n = 14, out = [], cracks = [];
    for (let k = 0; k <= n; k++) {
      const th = k / n * TAU, rr = (k % 2 ? .75 : 1.25) * (.8 + .5 * hash(k % n, 51));
      out.push([c[0] + .06, c[1] + Math.sin(th) * rr * .75, c[2] + Math.cos(th) * rr * 1.1]);
    }
    for (let k = 0; k < 6; k++) {
      const th = (k + .3 * hash(k, 52)) / 6 * TAU, r0 = 1.1, r1 = 1.9 + 1.6 * hash(k, 53), kink = (hash(k, 54) - .5) * .6;
      cracks.push([[c[0] + .06, c[1] + Math.sin(th) * r0 * .75, c[2] + Math.cos(th) * r0 * 1.1],
        [c[0] + .06, c[1] + Math.sin(th + kink) * (r0 + r1) * .5 * .75, c[2] + Math.cos(th + kink) * (r0 + r1) * .5 * 1.1],
        [c[0] + .06, c[1] + Math.sin(th) * r1 * .75, c[2] + Math.cos(th) * r1 * 1.1]]);
    }
    const scorch = [];
    for (let k = 0; k <= 18; k++) { const th = k / 18 * TAU, rr = 3 * (.8 + .4 * hash(k % 18, 55)); scorch.push([c[0] + .05, c[1] + Math.sin(th) * rr * .6, c[2] + Math.cos(th) * rr * 1.2]); }
    return { out, cracks, scorch };
  })();
  // the fire party's hoses: water thrown in arcs onto the fire from forward and aft of it (ship frame; flight ~0.9 s)
  const HOSES = [[7.3, 9.6, 2.5, .95, 0], [8.9, 9.3, -19.5, .85, 1.7], [6.4, 11.8, -1, 1.05, 3.1]].map(([x, y, z, tf, ph], i) => {
    const N = [x, y, z], F = [HIT.fire[0] - .4 + .5 * i, HIT.fire[1] + .3, HIT.fire[2] + (i === 1 ? -1 : 1.5)];
    return { N, tf, ph, v: [(F[0] - N[0]) / tf, (F[1] - N[1] + 4.905 * tf * tf) / tf, (F[2] - N[2]) / tf], t0: HIT.t + 7 + 2.5 * i };
  });
  const HQ0 = [0, 0, 0], HQ1 = [0, 0, 0];
  const hoseAt = (h, t, o) => { o[0] = h.N[0] + h.v[0] * t; o[1] = h.N[1] + h.v[1] * t - 4.905 * t * t; o[2] = h.N[2] + h.v[2] * t; return o; };
  function drawHoses(W, cam, Xh, T, A) {
    for (const h of HOSES) {
      const on = A * ss(h.t0, h.t0 + 1.5, T) * (1 - ss(HIT.t + 50, HIT.t + 58, T)); if (on <= .004) continue;
      // the solid stream near the nozzle breaking into droplets that flow along the arc
      let p0 = X.ap(Xh, hoseAt(h, 0, HQ0));
      for (let k = 1; k <= 6; k++) { const p1 = X.ap(Xh, hoseAt(h, h.tf * k / 6 * .55, HQ1)); seg(W, cam, p0, p1, on * .4 * (1 - k / 8)); p0 = p1; }
      for (let k = 0; k < 18; k++) {
        const u = fr(T * 1.6 + k / 18 + h.ph), t = u * h.tf, j = (hash(k, h.ph * 10) - .5) * .5;
        const a = X.ap(Xh, hoseAt(h, Math.max(0, t - .035), HQ0)), b = X.ap(Xh, hoseAt(h, t, HQ1));
        segW(W, cam, a[0] + j, a[1], a[2], b[0] + j, b[1], b[2] + j, on * .6 * (1 - u * .5));
      }
    }
  }
  // the wind over DDG 1's deck (true wind less her own way): the flames and the smoke lie over aft and to port
  const RELW = V.norm([WIND[0], 0, WIND[2] - VK]);
  function drawHit(W, cam, K, T, A) {
    const a = T - HIT.t; if (a < 0) return;
    const Xh = shipX(SD1, T, K);
    if (a < 12) {
      // flash and a restrained bloom
      if (a < 3.5) K.glow(HP0, A * (1.2 * Math.exp(-a / .1) + .34 * Math.exp(-a / .8)), 34, 16, 260);
      if (a < .6) K.glow(HP0, A * .22 * Math.exp(-a / .2), 260, 60, 420);
      if (a < .18) star(W, cam, HP0, 24, 48, A * (1 - a / .18), 4.4, 16);
      // shock front and its ring on the water
      if (a < .6) discS(W, cam, HP0, 2 + 80 * (1 - Math.exp(-a / .2)), A * .5 * Math.pow(1 - a / .6, 2), 64);
      if (a < .5) discS(W, cam, HP0, 1 + 45 * (1 - Math.exp(-a / .12)), A * .6 * Math.pow(1 - a / .5, 2), 48);
      if (a < 1.8) ringH(W, cam, [HP0[0], .15, HP0[2]], 5 + 90 * (1 - Math.exp(-a / .4)), A * .42 * Math.pow(1 - a / 1.8, 1.4), 64);
      // fireball: rings thrown off the breach, then layered billows swelling and rising, becoming the smoke
      if (a < 1.1) for (let k = 0; k < 3; k++) {
        const ak = a - k * .07; if (ak <= 0) continue;
        const [U, Vv] = perp(HN), c = V.mad(HP0, HN, 2 + 16 * (1 - Math.exp(-ak / .25)) + k * 2);
        ringA(W, cam, [c[0], c[1] + 4 * ak * (k + 1), c[2]], U, Vv, 3 + (18 + 6 * k) * (1 - Math.exp(-ak / .22)), A * .6 * Math.pow(1 - ak / 1.1, 1.5), A * .3 * Math.pow(1 - ak / 1.1, 1.5), 40, .12, k * 2.1);
      }
      if (a < 11) for (let k = 0; k < 11; k++) {
        const h1 = hash(k, 71), h2 = hash(k + 1, 71), h3 = hash(k + 2, 71), g = 1 - Math.exp(-a / .45);
        const x = HP0[0] + HN[0] * (5 + 12 * h1) * g + (h3 - .5) * 14 * g + WIND[0] * a, y = HP0[1] + 1 + 11 * g * (.4 + h2) + 3 * a, z = HP0[2] + HN[2] * (5 + 12 * h1) * g + (h1 - .5) * 16 * g + WIND[2] * a;
        billow(W, cam, x, y, z, (4 + 15 * g + 2 * a) * (.65 + .55 * h2), A * .72 * Math.exp(-a / 2.6) * ss(0, .04, a) * (1 - ss(7, 11, a)), 9.1 + k * 1.9, a, 2);
      }
      // debris arcs into the sea, sparks
      if (a < 2.4) drawSparks(W, cam, HP0, HIT_SPK, a, A * .9, .06);
      for (const F of HIT_DEB) {
        if (a < F.tImp) {
          let q0 = fragAt(F, Math.max(0, a - .15));
          for (let s = 1; s <= 3; s++) { const q1 = fragAt(F, Math.max(0, a - .15 + .05 * s)); seg(W, cam, q0, q1, A * (.25 + .6 * F.big) * (s / 3)); q0 = q1; }
        } else if (F.imp && F.big > .45) splash(W, cam, F.imp[0], F.imp[2], a - F.tImp, 2 + 3.5 * F.big, A * .7, F.h * 91, T);
      }
      // secondaries
      for (const s of SECOND) {
        const b = T - s.t; if (b < 0 || b > 6) continue;
        const p = X.ap(Xh, s.at);
        if (b < 1.5) K.glow(p, A * s.k * (1 * Math.exp(-b / .08) + .25 * Math.exp(-b / .5)), 10, 8, 140);
        if (b < .5) discS(W, cam, p, 1 + 14 * (1 - Math.exp(-b / .12)), A * .5 * s.k * Math.pow(1 - b / .5, 2), 32);
        if (b < 1.8) drawSparks(W, cam, p, s.sp, b, A * .85, .07);
        billow(W, cam, p[0] + WIND[0] * b, p[1] + 2 + 3 * b, p[2] + WIND[2] * b, 2 + 5 * Math.sqrt(b), A * .45 * s.k * Math.exp(-b / 1.6) * ss(0, .05, b), 5.5 + s.t, b, 1);
      }
    }
    // the breach mark (yellow), with the flash that marks it
    // the breach goes with the smoke, while the lens is high and far off on the way back to frame 0
    const le = OF.toShip(Xh, V.sub(cam.eye, Xh.T)), facing = le[0] > HIT.at[0] ? 1 : .6, sk = 1 - ss(138, 148, T);
    W.style(HI, 1);
    if (a < .8) { const n = X.dir(Xh, [1, 0, 0]), [U, Vv] = perp(n); ringA(W, cam, X.ap(Xh, [HIT.at[0] + .1, HIT.at[1], HIT.at[2]]), U, Vv, .8 + 13 * (1 - Math.exp(-a / .16)), A * .9 * Math.pow(1 - a / .8, 1.4), A * .5 * Math.pow(1 - a / .8, 1.4), 40); }
    const bk = A * sk * ss(.04, .35, a) * facing;
    if (bk > .005) {
      let p0 = X.ap(Xh, BREACH.out[0]);
      for (let k = 1; k < BREACH.out.length; k++) { const p1 = X.ap(Xh, BREACH.out[k]); seg(W, cam, p0, p1, bk * .95); p0 = p1; }
      for (const c of BREACH.cracks) { const q0 = X.ap(Xh, c[0]), q1 = X.ap(Xh, c[1]), q2 = X.ap(Xh, c[2]); seg(W, cam, q0, q1, bk * .6); seg(W, cam, q1, q2, bk * .45); }
    }
    W.style(WH, 1);
    if (bk > .005) { let p0 = X.ap(Xh, BREACH.scorch[0]); for (let k = 1; k < BREACH.scorch.length; k++) { const p1 = X.ap(Xh, BREACH.scorch[k]); seg(W, cam, p0, p1, bk * .22); p0 = p1; } }
    // fire on deck and out of the breach: flickering tongues leaning over in the wind across her deck, embers, its glow
    const fk = OF.fireK(T) * sk;
    if (fk > .004) {
      const F0 = X.ap(Xh, HIT.fire), side = X.dir(Xh, [1, 0, 0]), fwd = X.dir(Xh, [0, 0, 1]), lean = RELW;
      const e = cam.eye, ax = V.norm([lean[0] * .45, 1, lean[2] * .45]);
      // tongue width lies across the line of sight so every tongue reads as a shape from any side
      const cs = V.norm(V.cross(ax, [e[0] - F0[0], e[1] - F0[1], e[2] - F0[2]]));
      for (let k = 0; k < 14; k++) {
        const kk = k % 9, inner = k >= 9, Pk = .45 + .35 * hash(k, 83), ph = T / Pk + hash(k, 84), u = fr(ph), cyc = Math.floor(ph);
        const H = (2.6 + 5.2 * hash(k, cyc * 1.7 + 85)) * (.5 + .5 * fk) * (inner ? .55 : 1) * (kk >= 7 ? .75 : 1);
        const ht = H * (.3 + .7 * Math.pow(Math.sin(PI * Math.min(1, u * 1.2)), .7));
        // along the deck edge and out of the breach below it
        // seven along the deck edge, two out of the breach in the side below it
        const side2 = kk >= 7, bx = side2 ? 1.5 : (hash(kk, 81) - .5) * 2.2, bz = side2 ? 2.2 + (kk - 7) * 1.4 : (kk - 3) * 1.5 + (hash(kk, 86) - .5) * .9 - (inner ? .3 : 0), by = side2 ? -1.6 : 0;
        const w0 = (.8 + .6 * hash(k, 87)) * (inner ? .5 : 1);
        const b0 = F0[0] + side[0] * bx + fwd[0] * bz, b1 = F0[1] - .25 + by, b2 = F0[2] + side[2] * bx + fwd[2] * bz;
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
        if (!inner && u > .6) {
          const v = (u - .6) / .4, y = ht + .8 + 1.8 * v, lk = y * .7, s = .3 * (1 - v) + .08;
          const cx = b0 + lean[0] * lk, cy = b1 + y, cz = b2 + lean[2] * lk;
          segW(W, cam, cx - cs[0] * s, cy - .35, cz - cs[2] * s, cx, cy + .45, cz, al * (1 - v));
          segW(W, cam, cx + cs[0] * s, cy - .35, cz + cs[2] * s, cx, cy + .45, cz, al * (1 - v));
        }
      }
      for (let j = 0; j < 16; j++) {
        const Pj = 1.1 + .7 * hash(j, 91), u = fr((T + hash(j, 92) * 5) / Pj), cyc = Math.floor((T + hash(j, 92) * 5) / Pj);
        const t = u * Pj, h1 = hash(j, cyc + 93), h2 = hash(j + 7, cyc + 93);
        const x = F0[0] + side[0] * (h1 - .5) * 3 + fwd[0] * (h2 - .5) * 7 + lean[0] * (3 * t + 4 * t * t) + .8 * Math.sin(t * 7 + j) * side[0],
          y = F0[1] + 7 * t - 1.2 * t * t, z = F0[2] + side[2] * (h1 - .5) * 3 + fwd[2] * (h2 - .5) * 7 + lean[2] * (3 * t + 4 * t * t);
        segW(W, cam, x, y, z, x - lean[0] * .5, y - .35, z - lean[2] * .5, A * .7 * fk * (1 - u) * ss(0, .1, u));
      }
      K.glow(V.add(F0, [0, 2.5, 0]), A * fk * .3 * (.75 + .25 * noise(T * 7, 3.3)), 9, 6, 140);
    }
    if (T < HIT.t + 58 && V.dist(Xh.T, cam.eye) < 900) drawHoses(W, cam, Xh, T, A);
  }

  /* ================= D1's fire smoke (stage A's parcels): billows along the stream; close by they sweep across the lens ================= */
  function drawSmoke(W, cam, T, A) {
    if (T < HIT.t) return;
    let pv = null;
    for (const p of OF.PARCELS) {
      if (p.te > T) break;
      const q = OF.smokeAt(p, T); if (!q) { pv = null; continue; }
      const life = 1 - q.a / OF.smokeLife, al = .2 * q.k * life * (.45 + .55 * A) * seamK(T);
      if (al <= .004) { pv = null; continue; }
      if (cam.depth(q.c) < -q.r) { pv = null; continue; }
      // a billow: scalloped outline, folds inside, a smaller crown rolling over its top
      const sd = p.h1 * 37.1 + p.h2 * 5.3, wob = noise(q.a * .3, p.h3 * 9);
      billow(W, cam, q.c[0], q.c[1], q.c[2], q.r * (.9 + .08 * wob), al * 1.75, sd, q.a, 2, .2);
      const cr = q.r * (.5 + .1 * p.h3), ca = p.h2 * TAU + q.a * .1;
      billow(W, cam, q.c[0] + cam.r[0] * Math.cos(ca) * q.r * .35, q.c[1] + q.r * .45, q.c[2] + cam.r[2] * Math.cos(ca) * q.r * .35, cr, al * 1.1, sd + 3.3, q.a, 1, .2);
      if (pv) {
        // the stream's edges: faint strands joining neighbouring parcels
        const sdv = V.norm(V.cross([0, 1, 0], V.sub(q.c, cam.eye)));
        for (const f of [-.8, .8]) seg(W, cam, V.mad(pv.c, sdv, pv.r * f), V.mad(q.c, sdv, q.r * f), al * .5);
      }
      pv = q;
    }
  }
  function smokeDensity(T, e) {
    if (T < HIT.t) return 0;
    let s = 0;
    for (const p of OF.PARCELS) {
      if (p.te > T) break;
      if (T - p.te > OF.smokeLife) continue;
      const q = OF.smokeAt(p, T); if (!q) continue;
      const dx = q.c[0] - e[0], dy = q.c[1] - e[1], dz = q.c[2] - e[2], rr = q.r * 1.3, d2 = (dx * dx + dy * dy + dz * dz) / (rr * rr);
      if (d2 < 4.8) s += q.k * Math.exp(-d2) * .55;
    }
    return s;
  }

  /* ================= hooks ================= */
  const CLOSE = OF.CIWS_ENG.filter(e => e.kill);
  const OFFX = window.OFFX = {
    launchFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const I of OF.INTS) {
        const s = T - I.tL; if (s < -.05) continue;
        if (s >= 0) { drawTrail(K.W, K.cam, I, T, A); if (s < 44) drawCloud(K.W, K.cam, I, T, A); }
        drawVent(K.W, K.cam, K, I, T, A);
        if (s >= 0 && T <= I.tEnd) drawPlume(K.W, K.cam, K, I, T, A);
        drawSpent(K.W, K.cam, K, I, T, A);
      }
    },
    interceptFx(T, K) {
      const A = K.dim * seamK(T); if (A <= .003) return;
      for (const k of KILLS) drawFarKill(K.W, K.cam, K, k, T, A);
      for (const r of OF.ROUNDS) if (T > r.t0 && T < r.tEnd) drawRound(K.W, K.cam, K, r, T, A);
    },
    ciwsFx(T, K) {
      const A = K.dim; if (A <= .003) return;
      for (const e of OF.CIWS_ENG) drawBurst(K.W, K.cam, K, e, T, A);
      for (const e of CLOSE) drawCloseKill(K.W, K.cam, K, e, T, A);
    },
    hitFx(T, K) { if (T >= HIT.t && T < 160) drawHit(K.W, K.cam, K, T, K.dim); },
    smokeFx(T, K) { drawSmoke(K.W, K.cam, T, K.dim); },
    /* world visibility for the film (0..1): the lens inside D1's smoke */
    dimAt(T, e) { return 1 - .62 * sat(smokeDensity(T, e)) * seamK(T); },
    /* camera shake (px): blast waves reach the lens at the speed of sound; the Phalanx's own vibration aboard DDG 2;
       launches close by; the burners beside the catapults */
    shake(T) {
      const e = FILMCAM(); if (!e) return null;
      let amp = 0;
      const h = T - HIT.t - V.dist(HP0, e) / 343; if (h >= 0 && h < 3.5) amp += 30 * (Math.exp(-h / .3) + .15 * Math.exp(-h / 1.2)) * 900 / (900 + V.dist(HP0, e));
      for (const s of SECOND) { const b = T - s.t - V.dist(HP0, e) / 343; if (b >= 0 && b < 1.2) amp += 5 * s.k * Math.exp(-b / .2) * 500 / (500 + V.dist(HP0, e)); }
      for (const c of CLOSE) { const a = T - c.round.tEnd - V.dist(c.kp, e) / 343; if (a >= 0 && a < 1.8) amp += 16 * Math.exp(-a / .25) * 600 / (600 + V.dist(c.kp, e)); }
      for (const c of OF.CIWS_ENG) if (T >= c.t0 - .05 && T <= c.t1 + .05) { const d = V.dist(OF.shipPos(c.S, T), e); amp += 3.2 * 120 / (120 + d); }
      for (const I of OF.INTS) {
        const a = T - I.tL; if (a < 0 || a > 5) continue;
        const d = V.dist(I.P0, e), ad = a - d / 343; if (ad >= 0 && ad < 3) amp += 7 * ss(0, .1, ad) * Math.exp(-ad / .9) * 250 / (250 + d);
      }
      for (const J of OF.JT) {
        const tl = T - J.tL; if (tl < -4 || tl > 6) continue;
        const j = OF.jet(J, T), d = V.dist(j.X.T, e);
        amp += (3.5 * j.st.ab + (tl >= 0 && tl < 2 ? 6 * Math.exp(-tl / .4) : 0)) * 40 / (40 + d);
      }
      return amp > .05 ? FILM.shake(T, amp, 21) : null;
    },
    billow, seamK,
    cues: [],
  };
  // the camera eye for the shake (the film sets OFFX.eyeAt once it exists)
  const FILMCAM = () => OFFX.eyeAt ? OFFX.eyeAt() : null;

  /* ================= sound (added to the film's cues; fired only in real time) ================= */
  const S = STAGE.SFX, CU = OFFX.cues;
  // the lens positions are not known here at load; the heard delays use the ship the lens is on at the time
  const lensShip = t => (t > 55 && t < 88 ? OF.shipPos(SD2, t) : t >= 88 && t < 100 ? OF.shipPos(SD1, t) : OF.shipPos(SID.CV, t));
  for (const I of OF.INTS) if (!I.mk29) CU.push([I.tL + SEP, () => { S.noise(.3, 1100, .6, .025, .004); S.tone(180, 90, .25, 'sine', .015); }]);
  for (const e of CLOSE) {
    const t = e.round.tEnd, dl = V.dist(e.kp, lensShip(t)) / 343;
    CU.push([t + dl, () => { S.crack(); S.tone(70, 38, .8, 'sine', .1); }]);
    CU.push([t + dl + .7, () => S.noise(1.4, 650, .5, .035, .06)]);
  }
  {
    const dl = V.dist(HP0, lensShip(HIT.t)) / 343;
    CU.push([HIT.t + .12, () => S.noise(1.2, 3400, .5, .03, .01)]);
    CU.push([HIT.t + dl, () => { S.crack(); S.tone(40, 24, 2.2, 'sine', .2); S.rumble(4.5, .24); }]);
    CU.push([HIT.t + dl + .3, () => S.noise(4.5, 330, .7, .1, .45)]);
    for (const s of SECOND) CU.push([s.t + dl, () => { S.tone(62, 40, .6, 'sine', .07); S.noise(.6, 900, .7, .04, .01); }]);
  }
})();
