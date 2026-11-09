/* THE PICTURE: the closing beat on the scope. An own round, OWN 01, leaves the battery on the bluff
   and crosses the picture to TRK 21 under a time warp; the contact's returns flare, burst into a
   spray and a rising plume, thin back into the clutter, and the track drops.
   A pure function of film T, drawn only inside [T_ON, T_END]: the scope at the loop seam (and the
   contact that starts forming at frame 0) is exactly what it was. */
(function () {
  const { E, rng, gauss } = M3;
  const PA = window.PA, DEG = PA.DEG, TAU = PA.TAU, hsh = PA.hsh, LIME = PA.LIME, WH = PA.WH, CORAL = PA.CORAL;
  const SX = PA.SITE.x, SZ = PA.SITE.z;
  const T_ON = 143, T_L = 147.2, T_X = 155.4, FL = .22, T_DROP = T_X + 3.4, T_END = 162.4;

  /* film time -> the round's own clock: real time through the launch and the hit, x4 on the way out */
  const warp = FILM.warp([{ t: 0, rate: 1 }, { t: 148.4, rate: 1 }, { t: 149.5, rate: 4 }, { t: 154.3, rate: 4 }, { t: 155.1, rate: 1 }, { t: PA.D, rate: 1 }]);
  const mOf = T => warp(T) - warp(T_L);

  /* TRK 21: a destroyer on the squall's lee side, steaming WSW like the one the film opened on */
  const HDG = [Math.sin(250 * DEG), Math.cos(250 * DEG)], SPD = .0077;
  const PX = [3.55, 18.15], tauX = PA.tau(T_X);
  const c21 = tau => [PX[0] + HDG[0] * SPD * (tau - tauX), PX[1] + HDG[1] * SPD * (tau - tauX)];
  const CW = PA.kmW(PX[0], PX[1]);

  /* the round's ground track: a gentle arc out over the sea, arc-length tabulated */
  const TEL = PA.VEH.tel.W.T, P0 = [TEL[0], TEL[2]], P2 = CW;
  const ddx = P2[0] - P0[0], ddz = P2[1] - P0[1], dl = Math.hypot(ddx, ddz);
  const P1 = [(P0[0] + P2[0]) / 2 - ddz / dl * 1500, (P0[1] + P2[1]) / 2 + ddx / dl * 1500];
  const NB = 600, BX = new Float64Array(NB + 1), BZ = new Float64Array(NB + 1), BS = new Float64Array(NB + 1);
  for (let k = 0; k <= NB; k++) {
    const u = k / NB, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    BX[k] = a * P0[0] + b * P1[0] + c * P2[0]; BZ[k] = a * P0[1] + b * P1[1] + c * P2[1];
    if (k) BS[k] = BS[k - 1] + Math.hypot(BX[k] - BX[k - 1], BZ[k] - BZ[k - 1]);
  }
  const LP = BS[NB];
  function atS(s) {
    s = E.clamp(s, 0, LP);
    let lo = 0, hi = NB; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BS[m] <= s) lo = m; else hi = m; }
    const u = (s - BS[lo]) / (BS[hi] - BS[lo] || 1), tx = BX[hi] - BX[lo], tz = BZ[hi] - BZ[lo], tl = Math.hypot(tx, tz) || 1;
    return [BX[lo] + tx * u, BZ[lo] + tz * u, tx / tl, tz / tl];
  }
  /* boost out of the tube, then a ramjet cruise: s(m) = V (m' - tb (1 - e^(-m'/tb))) */
  const TB = 1.3, g0 = m => { m = Math.max(0, m - .35); return m - TB * (1 - Math.exp(-m / TB)); };
  const mX = mOf(T_X), VM = LP / g0(mX);
  function roundAt(m) {
    m = Math.min(m, mX);
    const s = VM * g0(m), q = atS(s);
    const yb = TEL[1] + 3 + 175 * E.outCubic(E.sat(m / 1.7));
    const y = Math.max(E.mix(yb, 22, E.ss(350, 3600, s)), PA.gy(q[0], q[1]) + 25 * E.ss(200, 500, s));
    return { x: q[0], y, z: q[1], s, tx: q[2], tz: q[3] };
  }

  /* ---------- TRK 21 returns, one set per antenna sweep (the scope's ship-return model) ---------- */
  const OMEGA = PA.OMEGA, ALPHA = 8.2, BW = 1.1 * DEG, CLUT = 3.2;
  const bright = P => E.clamp((4.343 * Math.log(P) + 14) / 40, .16, 1), dbOf = P => Math.max(0, 4.343 * Math.log(P) - 2);
  const paintTau = (b, s) => (b + s * TAU - PA.PH0) / OMEGA;
  const cache = new Map();
  function sweep(s) {
    let r = cache.get(s); if (r) return r;
    let p = c21(tauX), b = Math.atan2(p[0], p[1]), tp = paintTau(b, s);
    p = c21(tp); b = Math.atan2(p[0], p[1]); tp = paintTau(b, s);
    const T = tp + PA.D, post = T >= T_X, f = post ? Math.exp(-(T - T_X) / 2.2) : 1;
    const rg = Math.hypot(p[0], p[1]), ux = Math.sin(b), uz = Math.cos(b), cross = rg * BW / 2.4 * (post ? 1.6 : 1), Lv = .62 * (post ? 1.9 : 1);
    const snr = 40 - (post ? 18 * (1 - f) + 6 : 0) - 40 * Math.log10(rg / 30) - 14, S = Math.pow(10, snr / 10);
    const rr = rng(52711 + s * 97), n = Math.round(E.clamp(6 + 1.1 * snr, 6, 40)), dots = [];
    for (let k = 0; k < n; k++) {
      const al = (rr() - .5) * Lv, cr = gauss(rr) * cross, rgn = gauss(rr) * .05;
      const x = p[0] + HDG[0] * al + uz * cr + ux * rgn, z = p[1] + HDG[1] * al - ux * cr + uz * rgn;
      const P = S * Math.exp(-.5 * (cr / cross) ** 2) * -Math.log(rr()) - Math.log(rr()) + CLUT * -Math.log(rr());
      if (4.343 * Math.log(P) < 2 || (post && hsh(k, s + 40) > .15 + f)) continue;
      const on = !post && P / (1 + CLUT) > ALPHA;
      dots.push(SX + x * 1000, SZ + z * 1000, dbOf(P) + (on ? 12 : 0), bright(P) * (on ? 1 : -1));
    }
    r = { s, b, T, post, dots };
    cache.set(s, r);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    return r;
  }
  const bX = Math.atan2(PX[0], PX[1]), phX = PA.phase(tauX), sLast = Math.floor((phX - bX) / TAU);
  const dX = phX - (bX + sLast * TAU), glowX = Math.exp(-dX * .75), riseX = dX < .5 ? 1 - Math.exp(-dX * 16) : 1;

  /* ---------- the burst: every return of the last paint thrown outward, a spray, a plume, a ring ---------- */
  const BU = (() => {
    const rr = rng(8123), d = sweep(sLast).dots, n = d.length / 4;
    const o = { n, x: new Float64Array(n), z: new Float64Array(n), db: new Float32Array(n), vx: new Float32Array(n), vz: new Float32Array(n), vy: new Float32Array(n), k: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const x = d[i * 4], z = d[i * 4 + 1]; let hx = x - CW[0], hz = z - CW[1]; const hl = Math.hypot(hx, hz);
      if (hl < 1) { const a = rr() * TAU; hx = Math.sin(a); hz = Math.cos(a); } else { hx /= hl; hz /= hl; }
      const sp = 500 + 2600 * rr() * rr();
      o.x[i] = x; o.z[i] = z; o.db[i] = d[i * 4 + 2]; o.vx[i] = hx * sp; o.vz[i] = hz * sp; o.vy[i] = 150 + 1100 * rr(); o.k[i] = 1.4 + 1.2 * rr();
    }
    return o;
  })();
  const NS = 1100, SP = { x: new Float64Array(NS), z: new Float64Array(NS), y: new Float32Array(NS), vx: new Float32Array(NS), vz: new Float32Array(NS), vy: new Float32Array(NS), k: new Float32Array(NS), life: new Float32Array(NS), hot: new Uint8Array(NS) };
  { const rr = rng(9127);
    for (let i = 0; i < NS; i++) {
      const al = (rr() - .5) * 620, a = rr() * TAU, sp = 250 + 4200 * Math.pow(rr(), 2);
      SP.x[i] = CW[0] + HDG[0] * al; SP.z[i] = CW[1] + HDG[1] * al; SP.y[i] = 10 + 260 * rr();
      SP.vx[i] = Math.sin(a) * sp; SP.vz[i] = Math.cos(a) * sp; SP.vy[i] = 100 + 2200 * Math.pow(rr(), 1.4);
      SP.k[i] = 1.2 + rr(); SP.life[i] = 1.4 + 2.4 * rr(); SP.hot[i] = rr() < .1 ? 1 : 0;
    } }
  const NP = 1900, PL = { b: new Float32Array(NP), H: new Float32Array(NP), tk: new Float32Array(NP), ca: new Float32Array(NP), sa: new Float32Array(NP), r0: new Float32Array(NP), r1: new Float32Array(NP), mu: new Float32Array(NP), br: new Float32Array(NP), ox: new Float32Array(NP) };
  { const rr = rng(4447);
    for (let i = 0; i < NP; i++) {
      const a = rr() * TAU;
      PL.b[i] = 1.3 * Math.pow(rr(), 1.6); PL.H[i] = 800 + 3800 * Math.pow(rr(), .7); PL.tk[i] = .9 + 1.4 * rr();
      PL.ca[i] = Math.cos(a); PL.sa[i] = Math.sin(a); PL.r0[i] = 50 + 170 * rr(); PL.r1[i] = 110 + 420 * rr(); PL.mu[i] = rr(); PL.br[i] = .6 + .4 * rr(); PL.ox[i] = (rr() - .5) * 300;
    } }
  // the plume leans with the squall's wind, toward SSE
  const WND = [Math.sin(152 * DEG) * 34, Math.cos(152 * DEG) * 34];

  /* launch: tube flash, a few sparks, and the boost smoke laid along the first 2.4 s of the flight */
  const NK = 90, SK = [];
  { const rr = rng(3301); for (let i = 0; i < NK; i++) { const a = rr() * TAU, u = rr(), sp = 6 + 16 * rr(), h = Math.sqrt(1 - u * u); SK.push([Math.cos(a) * h * sp, u * sp + 3, Math.sin(a) * h * sp, .6 + .8 * rr()]); } }
  const NM = 760, SM = [];
  { const rr = rng(3303);
    for (let i = 0; i < NM; i++) {
      const Te = T_L + 2.6 * Math.pow(i / NM, 1.25), p = roundAt(mOf(Te));
      SM.push({ Te, x: p.x, y: p.y, z: p.z, jx: gauss(rr), jy: gauss(rr), jz: gauss(rr), life: 3.2 + 1.8 * rr(), br: .6 + .4 * rr() });
    } }

  /* ---------- draw ---------- */
  let qx = 0, qy = 0, qz = 0;
  const prj = (cam, x, y, z) => {
    const e = cam.eye, f = cam.f, dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < cam.near) return false;
    const r = cam.r, u = cam.u;
    qx = cam.cx + cam.fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; qy = cam.cy - cam.fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; qz = zc;
    return true;
  };
  const warpTxt = T => { const r = warp.rate(T); return '×' + r.toFixed(1); };
  /* additive round glow with a soft (1 - d²/R²)² falloff; pb.add is square and would show its edges */
  function glow(pb, x, y, R, r, g, b, a) {
    if (a <= .002) return;
    const d = pb.d, W = pb.W, x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R)), y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(pb.H - 1, Math.ceil(y + R)), iR2 = 1 / (R * R);
    for (let j = y0; j <= y1; j++) {
      const dy = j - y;
      for (let i = x0; i <= x1; i++) {
        const dx = i - x, q = 1 - (dx * dx + dy * dy) * iR2; if (q <= 0) continue;
        const w = q * q * a, k = (j * W + i) * 4; d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w;
      }
    }
  }

  /* sp: the scope's layer params this frame (a, hk, tracks, ships) */
  PA.beat = function (pb, cam, T, sp) {
    const out = { tags: [], read: null };
    if (T < T_ON || T > T_END) return out;
    const tau = PA.tau(T), ph = PA.phase(tau), hk = sp.hk, aS = sp.a * sp.ships * (1 - E.ss(161, T_END, T));
    const age = T - T_X, hit = age >= 0;
    const LR0 = LIME[0] - WH[0], LG0 = LIME[1] - WH[1], LB0 = LIME[2] - WH[2];

    // TRK 21 returns: the scope's own look (stalks over the threshold, lime at the leading edge)
    if (aS > .01) {
      const p = c21(tau), b = Math.atan2(p[0], p[1]), s0 = Math.floor((ph - b) / TAU);
      for (const s of [s0, s0 - 1]) {
        const r = sweep(s), d = ph - (r.b + s * TAU);
        if (d < 0 || d > TAU * 1.5) continue;
        if (!r.post && age >= FL) continue;                       // the burst has these now
        if (r.post && r.T > T_X + 4) continue;
        const flare = !r.post && hit ? E.sat(age / .08) : 0;
        const glow = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1, k = d < .6 ? Math.exp(-d * 7) : 0, D = r.dots;
        const cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
        for (let q = 0; q < D.length; q += 4) {
          const y = D[q + 2] * hk * rise * (.45 + .55 * glow) * (1 + 1.3 * flare), on = D[q + 3] > 0;
          if (!prj(cam, D[q], y, D[q + 1])) continue;
          const sx = qx, sy = qy;
          let bb = Math.abs(D[q + 3]) * (.36 + .64 * glow);
          if (on) bb = Math.max(bb, .55 + .45 * glow);
          bb = bb + (1.2 - bb) * flare;
          const fr = flare ? 255 : cr, fg = flare ? 255 : cg, fb = flare ? 250 : cb;
          if (on && prj(cam, D[q], 0, D[q + 1])) pb.dline(qx, qy, sx, sy, 2.5, 1, fr, fg, fb, Math.min(1, bb * (.55 + .45 * flare)) * aS);
          pb.dot(sx, sy, 2, fr, fg, fb, Math.min(1, bb) * aS);
        }
      }
    }

    // TRK 21 track, tag
    const aT0 = sp.a * Math.max(sp.tracks, E.ss(146.5, 149.5, T)), aT = aT0 * (T < T_DROP ? 1 : 1 - E.sat((T - T_DROP) / 1.4));
    if (aT0 > .01) {
      const p = c21(Math.min(tau, tauX)), Rm = PA.Rmeas(p[0], p[1]);
      const el = PA.ellipse(p, [Rm[0] * 1.3, Rm[1] * 1.3, Rm[2] * 1.3], 3.5);
      const drop = T >= T_DROP, spread = drop ? 1 + 1.5 * E.sat((T - T_DROP) / 1.4) : 1;
      const col = hit ? WH : LIME;
      const b = Math.atan2(p[0], p[1]), dLast = ph - b - Math.floor((ph - b) / TAU) * TAU, ageHit = dLast / OMEGA;
      const cp = cam.project([SX + p[0] * 1000, 0, SZ + p[1] * 1000]);
      if (cp) {
        const pxkm = cam.fl / cp[2] * 1000, n = Math.round(E.clamp(TAU * el.A * pxkm / 5.5, 18, 160));
        let rx = -1e9, ax = 0, ay = 0;
        for (let k = 0; k < n; k++) {
          const th = k / n * TAU, ca = Math.cos(th), sa = Math.sin(th), jit = drop ? (hsh(2100 + k, 5) - .5) * (spread - 1) * .8 : 0;
          const wx = el.c[0] + (el.e1[0] * ca * el.A + el.e2[0] * sa * el.B) * (spread + jit), wz = el.c[1] + (el.e1[1] * ca * el.A + el.e2[1] * sa * el.B) * (spread + jit);
          if (!prj(cam, SX + wx * 1000, 30, SZ + wz * 1000)) continue;
          if (k % 2 === 0 || !drop) pb.dot(qx, qy, hit ? 1 : 2, col[0], col[1], col[2], aT * (hit ? .75 : .95));
          if (qx - qy * .25 > rx) { rx = qx - qy * .25; ax = qx; ay = qy; }
        }
        if (!hit) {
          // the update ring each time the beam paints it, the history, the velocity leader
          if (ageHit < .7) {
            const g = 1 + E.outCubic(ageHit / .7) * 1.4, al = (1 - ageHit / .7) * aT;
            for (let k = 0; k < 56; k++) { const th = k / 56 * TAU, ca = Math.cos(th), sa = Math.sin(th); if (prj(cam, SX + (el.c[0] + (el.e1[0] * ca * el.A + el.e2[0] * sa * el.B) * g) * 1000, 30, SZ + (el.c[1] + (el.e1[1] * ca * el.A + el.e2[1] * sa * el.B) * g) * 1000)) pb.dot(qx, qy, 1, LIME[0], LIME[1], LIME[2], al * .8); }
          }
          pb.dot(cp[0], cp[1], 3, LIME[0], LIME[1], LIME[2], aT);
          const sNow = Math.floor((ph - b) / TAU);
          let px = null, py = 0;
          for (let j = 8; j >= 0; j--) {
            const h = c21(paintTau(b, sNow - j)), jx = (hsh(sNow - j, 71) - .5) * .12, jz = (hsh(sNow - j, 73) - .5) * .12;
            if (!prj(cam, SX + (h[0] + jx) * 1000, 20, SZ + (h[1] + jz) * 1000)) continue;
            const al = aT * (.25 + .6 * (8 - j) / 9);
            pb.dot(qx, qy, 2, LIME[0], LIME[1], LIME[2], al);
            if (px !== null) pb.dline(px, py, qx, qy, 3, 1, LIME[0], LIME[1], LIME[2], al * .6);
            px = qx; py = qy;
          }
          if (prj(cam, SX + (p[0] + HDG[0] * SPD * 60) * 1000, 20, SZ + (p[1] + HDG[1] * SPD * 60) * 1000)) pb.dline(cp[0], cp[1], qx, qy, 3, 1, LIME[0], LIME[1], LIME[2], .55 * aT);
        }
        const tagA = aT0 * (drop ? 1 - E.sat((T - T_DROP - 1) / .8) : 1);
        if (rx > -1e9) out.tags.push({ key: 'beat21', id: 'TRK 21', txt: hit ? 'hit' : 'DDG · p 0.99', cls: drop ? 'drop' : hit ? 'coral' : 'lime', ax, ay, x: ax + 16, y: ay - 30, a: tagA, pri: 4 });
      }
    }

    // OWN 01: launch, boost smoke, the round and its track
    if (T >= T_L) {
      const aL = sp.a > .01 ? 1 : 0, m = mOf(T), R = roundAt(m), la = T - T_L;
      if (la < .9 && prj(cam, TEL[0], TEL[1] + 4, TEL[2])) {
        const I = Math.exp(-la * 6);
        glow(pb, qx, qy, 10, 255, 255, 245, .8 * I); glow(pb, qx, qy, 34, 255, 255, 235, .16 * I); glow(pb, qx, qy, 110, LIME[0], LIME[1], LIME[2], .05 * I);
      }
      if (la < 1.6) for (const k of SK) {
        const a = la; if (a > k[3]) continue;
        if (!prj(cam, TEL[0] + k[0] * a, TEL[1] + 4 + k[1] * a - 4.9 * a * a, TEL[2] + k[2] * a)) continue;
        pb.dot(qx, qy, 2, 240, 255, 200, (1 - a / k[3]) * .95);
      }
      if (la < 8) for (const q of SM) {
        const a = T - q.Te; if (a < 0 || a > q.life) continue;
        const sp2 = 1.2 + 6 * a;
        if (!prj(cam, q.x + q.jx * sp2 + 3 * a, q.y + q.jy * sp2 * .7 + 2 * a, q.z + q.jz * sp2 + 1.2 * a)) continue;
        const hot = Math.exp(-a * 7), al = (.4 + .6 * Math.exp(-a * 1.6)) * (1 - a / q.life) * q.br;
        pb.dot(qx, qy, qz < 5000 ? 2 : 1, WH[0] + (255 - WH[0]) * hot, WH[1] + (255 - WH[1]) * hot, WH[2] + (240 - WH[2]) * hot, Math.min(1, al));
      }
      // the track: its history on the round's own clock, the whole run from the coast
      const ta = E.ss(T_L + .2, T_L + .8, T) * aL, tr = hit ? 1 - E.sat(age / 1.6) : 1;
      if (ta * tr > .01) {
        let px = null, py = 0;
        const m1 = Math.min(m, mX);
        for (let mj = 1.1; mj <= m1; mj += .25) {
          const h = roundAt(mj); if (!prj(cam, h.x, Math.max(h.y, 20), h.z)) { px = null; continue; }
          const al = ta * tr * (.3 + .6 * Math.exp(-(m1 - mj) / 8));
          pb.dot(qx, qy, 2, LIME[0], LIME[1], LIME[2], al);
          if (px !== null) pb.dline(px, py, qx, qy, 2, 1, LIME[0], LIME[1], LIME[2], al * .5);
          px = qx; py = qy;
        }
      }
      const ah = ta * (hit ? 1 - E.sat(age / .06) : 1);
      if (ah > .01 && prj(cam, R.x, R.y, R.z)) {
        const hx = qx, hy = qy, boost = E.sat(1 - la / 2.4);
        // the motor: white-hot on the boost, a lime point once it is a track
        glow(pb, hx, hy, 6, 255, 255, 240, (.25 + .6 * boost) * ah); glow(pb, hx, hy, 16, LIME[0], LIME[1], LIME[2], (.1 + .12 * boost) * ah);
        pb.dot(hx, hy, 3, LIME[0], LIME[1], LIME[2], ah);
        pb.dot(hx, hy, 1, 255, 255, 255, ah);
        // own-track ring (screen size, like the symbol on a plot) and velocity leader
        for (let k = 0; k < 18; k++) { const th = k / 18 * TAU; pb.dot(hx + Math.cos(th) * 8, hy + Math.sin(th) * 8, 1, LIME[0], LIME[1], LIME[2], ah * .9); }
        if (R.s > 400 && prj(cam, R.x + R.tx * 2600, Math.max(R.y, 30), R.z + R.tz * 2600)) pb.dline(hx, hy, qx, qy, 3, 1, LIME[0], LIME[1], LIME[2], .6 * ah);
        const rate = warp.rate(T);
        out.tags.push({ key: 'beatOwn', id: 'OWN 01', txt: '3M55 Oniks', v: rate > 1.05 ? warpTxt(T) : '', cls: 'lime', ax: hx + 6, ay: hy + 6, x: hx + 18, y: hy + 12, a: ah, pri: 5, down: true });
      }
      if (!hit) out.read = `<i></i><span><b>OWN 01</b></span><span>·</span><span class="rate">Warp ${warpTxt(T)}</span><span>·</span><span><b>${((LP - R.s) / 1000).toFixed(1)}</b> km</span>`;
      else if (T < T_DROP + .6) out.read = `<i></i><span><b>OWN 01</b></span><span>·</span><span>TRK 21</span><span>·</span><span class="rate">Hit</span>`;
    }

    // the hit: flare, burst, spray, ring, plume
    if (hit && aS > .01) {
      if (age < 1.2 && prj(cam, CW[0], 160, CW[1])) {
        const I = Math.exp(-age * 4.5);
        glow(pb, qx, qy, 16, 255, 255, 255, .8 * I); glow(pb, qx, qy, 46, 255, 245, 230, .22 * I); glow(pb, qx, qy, 100, CORAL[0], CORAL[1], CORAL[2], .11 * I); glow(pb, qx, qy, 230, 255, 225, 200, .035 * I);
      }
      if (age >= FL) {
        const ab = age - FL;
        // the last paint's returns, thrown outward from the flare
        const fade = Math.exp(-ab * .9) * aS;
        if (fade > .01) for (let i = 0; i < BU.n; i++) {
          const k = BU.k[i], dd = (1 - Math.exp(-k * ab)) / k, y0 = BU.db[i] * hk * riseX * (.45 + .55 * glowX) * 2.3;
          let y = y0 + BU.vy[i] * dd - 210 * ab * ab; const low = y < 0 ? E.sat(1 + y / 200) : 1; if (y < 0) y = 0;
          if (!prj(cam, BU.x[i] + BU.vx[i] * dd, y, BU.z[i] + BU.vz[i] * dd)) continue;
          pb.dot(qx, qy, ab < .8 ? 2 : 1, 255, 255, 248, Math.min(1, 1.2 * fade * low));
        }
        // spray: ballistic points off the hull, a few hot
        for (let i = 0; i < NS; i++) {
          const L = SP.life[i]; if (ab > L) continue;
          const k = SP.k[i], dd = (1 - Math.exp(-k * ab)) / k;
          let y = SP.y[i] + SP.vy[i] * dd - 240 * ab * ab; const low = y < 0 ? E.sat(1 + y / 160) : 1; if (y < 0) y = 0;
          if (!prj(cam, SP.x[i] + SP.vx[i] * dd, y, SP.z[i] + SP.vz[i] * dd)) continue;
          const al = (1 - ab / L) * low * aS, hot = SP.hot[i] ? E.sat(1 - ab / 1.1) : 0;
          pb.dot(qx, qy, ab < .7 || hot > .2 ? 2 : 1, 255 + (CORAL[0] - 255) * hot, 255 + (CORAL[1] - 255) * hot, 250 + (CORAL[2] - 250) * hot, Math.min(1, al * (.8 + .4 * hot)));
        }
        // the ring the blast throws across the sea
        if (ab < 1.8) {
          const R = 3000 * E.outExpo(ab / 1.8), al = .85 * (1 - ab / 1.8) * aS;
          for (let k = 0; k < 360; k++) {
            const th = k / 360 * TAU, rr = R * (1 + (hsh(k, 17) - .5) * .06);
            if (prj(cam, CW[0] + Math.sin(th) * rr, 0, CW[1] + Math.cos(th) * rr)) pb.dot(qx, qy, hsh(k, 23) < .5 ? 2 : 1, WH[0], WH[1], WH[2], al * (.55 + .45 * hsh(k, 19)));
          }
        }
      }
      // the plume: points rising and spreading into a head, leaning downwind, lit as the beam passes
      const fP = (1 - E.ss(158.6, 161.9, T)) * aS;
      if (fP > .01) {
        const dB = ph - bX - Math.floor((ph - bX) / TAU) * TAU, gB = Math.exp(-dB * .75), kB = dB < .6 ? Math.exp(-dB * 7) : 0;
        const beamMod = .75 + .5 * gB;
        for (let i = 0; i < NP; i++) {
          const ap = age - PL.b[i]; if (ap < 0) continue;
          // the tall ones roll out into a head: the higher they get, the further they spread
          const H = PL.H[i], h = H * (1 - Math.exp(-ap / PL.tk[i])), u = h / H, head = E.sat((H - 2400) / 1600);
          const r = (PL.r0[i] + PL.r1[i] * u) * (1 - .45 * head) + head * (900 + 2200 * PL.mu[i]) * Math.pow(u, 2.5) + 40 * ap;
          if (!prj(cam, CW[0] + HDG[0] * PL.ox[i] + PL.sa[i] * r + WND[0] * ap, 15 + h, CW[1] + HDG[1] * PL.ox[i] + PL.ca[i] * r + WND[1] * ap)) continue;
          const hot = ap < .35 ? 1 - ap / .35 : 0, b = PL.br[i] * (.55 + .45 * Math.exp(-ap * .7)) * fP * beamMod;
          const k = kB * .8 * (1 - hot);
          pb.dot(qx, qy, ap < .8 || b > .35 ? 2 : 1,WH[0] + (255 - WH[0]) * hot + LR0 * k, WH[1] + (255 - WH[1]) * hot + LG0 * k, WH[2] + (250 - WH[2]) * hot + LB0 * k, Math.min(1, b));
        }
      }
    }
    return out;
  };
  PA.BEAT = { T_ON, T_L, T_X, T_DROP, T_END, warp };
})();
