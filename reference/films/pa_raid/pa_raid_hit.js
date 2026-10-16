/* THE PICTURE · RAID: the closing beat on the scope as a full raid. Six own rounds leave three
   launchers on the bluff within a second and cross the picture under a time warp to the group on
   the squall's lee side (two destroyers and a transport). The destroyers' interceptors rise to meet
   them: three rounds are stopped in bursts over the sea, the close-in guns spit tracer at the rest,
   three get through: the contacts' returns flare, burst into a spray and rising plumes, thin back
   into the clutter, and the tracks drop.
   A pure function of film T, drawn only inside [T_ON, T_END]: the scope at the loop seam (and the
   contact that starts forming at frame 0) is exactly what it was. */
(function () {
  const { E, rng, gauss } = M3;
  const PA = window.PA, DEG = PA.DEG, TAU = PA.TAU, hsh = PA.hsh, LIME = PA.LIME, WH = PA.WH, CORAL = PA.CORAL;
  const SX = PA.SITE.x, SZ = PA.SITE.z;
  const T_ON = 143, T_L = 147.2, FL = .22, T_END = 163.3;

  /* film time -> the raid's own clock: real time through the launches and the hits, x4 on the way out */
  const warp = FILM.warp([{ t: 0, rate: 1 }, { t: 148.6, rate: 1 }, { t: 149.6, rate: 4 }, { t: 153.9, rate: 4 }, { t: 154.7, rate: 1 }, { t: PA.D, rate: 1 }]);
  const invW = w => { let lo = 0, hi = PA.D; for (let k = 0; k < 48; k++) { const m = (lo + hi) / 2; if (warp(m) < w) lo = m; else hi = m; } return (lo + hi) / 2; };

  /* ---------- the group: two DDGs and a transport, steaming WSW like the ship the film opened on ---------- */
  const HDG = [Math.sin(250 * DEG), Math.cos(250 * DEG)], SPD = .0077;
  const TG = [
    { id: 21, cls: 'DDG', rcs: 40, L: .62, P: [.9, 19.0], TX: 155.2 },
    { id: 23, cls: 'DDG', rcs: 40, L: .62, P: [3.55, 18.15], TX: 155.85 },
    { id: 25, cls: 'AK', rcs: 34, L: .72, P: [2.0, 15.6], TX: 156.5 },
  ];
  TG.forEach((g, j) => {
    g.j = j; g.tauX = PA.tau(g.TX); g.CW = PA.kmW(g.P[0], g.P[1]); g.DROP = g.TX + 3.3; g.cache = new Map();
    g.c = tau => [g.P[0] + HDG[0] * SPD * (tau - g.tauX), g.P[1] + HDG[1] * SPD * (tau - g.tauX)];
    g.w = T => { const p = g.c(PA.tau(T)), w = PA.kmW(p[0], p[1]); return [w[0], 0, w[1]]; };
  });

  /* ---------- the returns of each contact, one set per antenna sweep (the scope's ship-return model) ---------- */
  const OMEGA = PA.OMEGA, ALPHA = 8.2, BW = 1.1 * DEG, CLUT = 3.2;
  const bright = P => E.clamp((4.343 * Math.log(P) + 14) / 40, .16, 1), dbOf = P => Math.max(0, 4.343 * Math.log(P) - 2);
  const paintTau = (b, s) => (b + s * TAU - PA.PH0) / OMEGA;
  function sweep(g, s) {
    let r = g.cache.get(s); if (r) return r;
    let p = g.c(g.tauX), b = Math.atan2(p[0], p[1]), tp = paintTau(b, s);
    p = g.c(tp); b = Math.atan2(p[0], p[1]); tp = paintTau(b, s);
    const T = tp + PA.D, post = T >= g.TX, f = post ? Math.exp(-(T - g.TX) / 2.2) : 1;
    const hd = [HDG[0], HDG[1]];
    const rg = Math.hypot(p[0], p[1]), ux = Math.sin(b), uz = Math.cos(b), cross = rg * BW / 2.4 * (post ? 1.6 : 1), Lv = g.L * (post ? 1.9 : 1);
    const snr = g.rcs - (post ? 18 * (1 - f) + 6 : 0) - 40 * Math.log10(rg / 30) - 14, S = Math.pow(10, snr / 10);
    const rr = rng(52711 + s * 97 + g.j * 7919), n = Math.round(E.clamp(6 + 1.1 * snr, 6, 40)), dots = [];
    for (let k = 0; k < n; k++) {
      const al = (rr() - .5) * Lv, cr = gauss(rr) * cross, rgn = gauss(rr) * .05;
      const x = p[0] + hd[0] * al + uz * cr + ux * rgn, z = p[1] + hd[1] * al - ux * cr + uz * rgn;
      const P = S * Math.exp(-.5 * (cr / cross) ** 2) * -Math.log(rr()) - Math.log(rr()) + CLUT * -Math.log(rr());
      if (4.343 * Math.log(P) < 2 || (post && hsh(k + g.j * 50, s + 40) > .15 + f)) continue;
      const on = !post && P / (1 + CLUT) > ALPHA;
      dots.push(SX + x * 1000, SZ + z * 1000, dbOf(P) + (on ? 12 : 0), bright(P) * (on ? 1 : -1));
    }
    r = { s, b, T, post, dots };
    g.cache.set(s, r);
    if (g.cache.size > 12) g.cache.delete(g.cache.keys().next().value);
    return r;
  }

  /* ---------- per contact: the burst (the last paint's returns thrown outward), spray, plume ---------- */
  const NS = 900, NP = 1500;
  for (const g of TG) {
    g.bX = Math.atan2(g.P[0], g.P[1]); const phX = PA.phase(g.tauX); g.sLast = Math.floor((phX - g.bX) / TAU);
    const dX = phX - (g.bX + g.sLast * TAU); g.glowX = Math.exp(-dX * .75); g.riseX = dX < .5 ? 1 - Math.exp(-dX * 16) : 1;
    { const rr = rng(8123 + g.j * 31), d = sweep(g, g.sLast).dots, n = d.length / 4, CW = g.CW;
      const o = { n, x: new Float64Array(n), z: new Float64Array(n), db: new Float32Array(n), vx: new Float32Array(n), vz: new Float32Array(n), vy: new Float32Array(n), k: new Float32Array(n) };
      for (let i = 0; i < n; i++) {
        const x = d[i * 4], z = d[i * 4 + 1]; let hx = x - CW[0], hz = z - CW[1]; const hl = Math.hypot(hx, hz);
        if (hl < 1) { const a = rr() * TAU; hx = Math.sin(a); hz = Math.cos(a); } else { hx /= hl; hz /= hl; }
        const sp = 500 + 2600 * rr() * rr();
        o.x[i] = x; o.z[i] = z; o.db[i] = d[i * 4 + 2]; o.vx[i] = hx * sp; o.vz[i] = hz * sp; o.vy[i] = 150 + 1100 * rr(); o.k[i] = 1.4 + 1.2 * rr();
      }
      g.BU = o; }
    { const rr = rng(9127 + g.j * 17), CW = g.CW, big = g.cls === 'AK' ? 1.15 : 1;
      const SP = g.SP = { x: new Float64Array(NS), z: new Float64Array(NS), y: new Float32Array(NS), vx: new Float32Array(NS), vz: new Float32Array(NS), vy: new Float32Array(NS), k: new Float32Array(NS), life: new Float32Array(NS), hot: new Uint8Array(NS) };
      for (let i = 0; i < NS; i++) {
        const al = (rr() - .5) * 620 * big, a = rr() * TAU, sp = 250 + 4200 * Math.pow(rr(), 2);
        SP.x[i] = CW[0] + HDG[0] * al; SP.z[i] = CW[1] + HDG[1] * al; SP.y[i] = 10 + 260 * rr();
        SP.vx[i] = Math.sin(a) * sp; SP.vz[i] = Math.cos(a) * sp; SP.vy[i] = 100 + 2200 * Math.pow(rr(), 1.4);
        SP.k[i] = 1.2 + rr(); SP.life[i] = 1.4 + 2.4 * rr(); SP.hot[i] = rr() < .1 ? 1 : 0;
      } }
    { const rr = rng(4447 + g.j * 13), hs = [1, .82, .9][g.j];
      const PL = g.PL = { b: new Float32Array(NP), H: new Float32Array(NP), tk: new Float32Array(NP), ca: new Float32Array(NP), sa: new Float32Array(NP), r0: new Float32Array(NP), r1: new Float32Array(NP), mu: new Float32Array(NP), br: new Float32Array(NP), ox: new Float32Array(NP) };
      for (let i = 0; i < NP; i++) {
        const a = rr() * TAU;
        PL.b[i] = 1.3 * Math.pow(rr(), 1.6); PL.H[i] = (800 + 3800 * Math.pow(rr(), .7)) * hs; PL.tk[i] = .9 + 1.4 * rr();
        PL.ca[i] = Math.cos(a); PL.sa[i] = Math.sin(a); PL.r0[i] = 50 + 170 * rr(); PL.r1[i] = 110 + 420 * rr(); PL.mu[i] = rr(); PL.br[i] = .6 + .4 * rr(); PL.ox[i] = (rr() - .5) * 300;
      } }
  }
  // the plumes lean with the squall's wind, toward SSE
  const WND = [Math.sin(152 * DEG) * 34, Math.cos(152 * DEG) * 34];

  /* ---------- the launchers on the bluff and the six rounds ---------- */
  const TELW = PA.VEH.tel.W.T;
  const lpt = (x, z) => [x, PA.gy(x, z), z];
  const LN = [[TELW[0], TELW[1], TELW[2]], lpt(650, -900), lpt(500, -1250)];
  /* tg: aimed contact; stop: film time the round is stopped (0 = it gets through at the contact's TX).
     Each launcher takes the contact on its own side, so the six tracks fan out without crossing */
  const RD = [
    { n: 1, ln: 0, tl: 147.2, tg: 0, stop: 0, bend: 900 },
    { n: 2, ln: 1, tl: 147.45, tg: 1, stop: 152.9, bend: 350 },
    { n: 3, ln: 0, tl: 147.65, tg: 0, stop: 152.3, bend: 500 },
    { n: 4, ln: 2, tl: 147.9, tg: 2, stop: 0, bend: 600 },
    { n: 5, ln: 1, tl: 148.1, tg: 1, stop: 0, bend: -150 },
    { n: 6, ln: 2, tl: 148.35, tg: 2, stop: 153.5, bend: 250 },
  ];
  const NB = 400, TB = 1.3, g0 = m => { m = Math.max(0, m - .35); return m - TB * (1 - Math.exp(-m / TB)); };
  for (const r of RD) {
    const L0 = LN[r.ln], g = TG[r.tg], P0 = [L0[0], L0[2]], P2 = g.CW;
    const ddx = P2[0] - P0[0], ddz = P2[1] - P0[1], dl = Math.hypot(ddx, ddz);
    const P1 = [(P0[0] + P2[0]) / 2 - ddz / dl * r.bend, (P0[1] + P2[1]) / 2 + ddx / dl * r.bend];
    const BX = new Float64Array(NB + 1), BZ = new Float64Array(NB + 1), BS = new Float64Array(NB + 1);
    for (let k = 0; k <= NB; k++) {
      const u = k / NB, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      BX[k] = a * P0[0] + b * P1[0] + c * P2[0]; BZ[k] = a * P0[1] + b * P1[1] + c * P2[1];
      if (k) BS[k] = BS[k - 1] + Math.hypot(BX[k] - BX[k - 1], BZ[k] - BZ[k - 1]);
    }
    Object.assign(r, { L0, BX, BZ, BS, LP: BS[NB], m0: warp(r.tl) });
    r.hitT = r.stop || g.TX;
    // same cruise as a round that would arrive just after its contact's hit time
    r.VM = r.LP / g0(warp(r.stop ? g.TX + .35 : g.TX) - r.m0);
    r.mEnd = warp(r.hitT) - r.m0;
  }
  function atS(r, s) {
    s = E.clamp(s, 0, r.LP);
    let lo = 0, hi = NB; const BS = r.BS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BS[m] <= s) lo = m; else hi = m; }
    const u = (s - BS[lo]) / (BS[hi] - BS[lo] || 1), tx = r.BX[hi] - r.BX[lo], tz = r.BZ[hi] - r.BZ[lo], tl = Math.hypot(tx, tz) || 1;
    return [r.BX[lo] + tx * u, r.BZ[lo] + tz * u, tx / tl, tz / tl];
  }
  /* boost out of the tube, then a ramjet cruise low over the sea */
  function roundAt(r, m) {
    m = Math.min(m, r.mEnd);
    const s = r.VM * g0(m), q = atS(r, s);
    const yb = r.L0[1] + 3 + 175 * E.outCubic(E.sat(m / 1.7));
    const y = Math.max(E.mix(yb, 22, E.ss(350, 3600, s)), PA.gy(q[0], q[1]) + 25 * E.ss(200, 500, s));
    return { x: q[0], y, z: q[1], s, tx: q[2], tz: q[3] };
  }
  const mOf = (r, T) => warp(T) - r.m0;
  for (const r of RD) { const e = roundAt(r, r.mEnd); r.E = [e.x, e.y, e.z]; }

  /* launch sparks and the boost smoke laid along the first 2.6 s of each flight */
  const NK = 70, SK = [];
  { const rr = rng(3301); for (let i = 0; i < NK; i++) { const a = rr() * TAU, u = rr(), sp = 6 + 16 * rr(), h = Math.sqrt(1 - u * u); SK.push([Math.cos(a) * h * sp, u * sp + 3, Math.sin(a) * h * sp, .6 + .8 * rr()]); } }
  const NM = 520;
  for (const r of RD) {
    const rr = rng(3303 + r.n * 11); r.SM = [];
    for (let i = 0; i < NM; i++) {
      const Te = r.tl + 2.6 * Math.pow(i / NM, 1.25), p = roundAt(r, mOf(r, Te));
      r.SM.push({ Te, x: p.x, y: p.y, z: p.z, jx: gauss(rr), jy: gauss(rr), jz: gauss(rr), life: 3.2 + 1.8 * rr(), br: .6 + .4 * rr() });
    }
  }

  /* ---------- interceptors: lofted arcs from the destroyers onto the rounds ---------- */
  /* rd: the round met; te: film time of the meeting;
     partner: arrives just after the first and bursts in its debris; high: bursts this far above the round */
  const IC = [
    { from: 0, rd: 2, te: 152.3 },
    { from: 0, rd: 2, te: 152.44, partner: true },
    { from: 1, rd: 1, te: 152.9 },
    { from: 1, rd: 5, te: 153.5 },
    { from: 0, rd: 5, te: 153.62, partner: true },
    { from: 0, rd: 0, te: 153.25, high: 1250 },
    { from: 1, rd: 4, te: 153.7, high: 1450 },
    { from: 1, rd: 3, te: 154.15, high: 1050 },
  ];
  const NI = 240;
  IC.forEach((c, k) => {
    const r = RD[c.rd], g = TG[c.from];
    let M = roundAt(r, mOf(r, c.te));
    if (c.high) M = [M.x + M.tx * 900, M.y + c.high, M.z + M.tz * 900];
    else M = [M.x, M.y, M.z];
    if (c.partner) M = [M[0] + (hsh(k, 3) - .5) * 260, M[1] + 60 + 140 * hsh(k, 4), M[2] + (hsh(k, 5) - .5) * 260];
    // flight time from the lofted path's length (~1 km/s), launch point from the ship at launch: iterate
    let fs = 10, P0 = null, X, Y, Z, S;
    for (let it = 0; it < 3; it++) {
      const tl = invW(warp(c.te) - fs), s0 = g.w(tl);
      P0 = [s0[0], 14, s0[2]];
      const d = Math.hypot(M[0] - P0[0], M[2] - P0[2]);
      const B1 = [P0[0], P0[1] + .5 * d, P0[2]], B2 = [M[0] + (P0[0] - M[0]) * .3, M[1] + .42 * d, M[2] + (P0[2] - M[2]) * .3];
      X = new Float64Array(NI + 1); Y = new Float64Array(NI + 1); Z = new Float64Array(NI + 1); S = new Float64Array(NI + 1);
      for (let i = 0; i <= NI; i++) {
        const u = i / NI, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, cc = 3 * u * u * (1 - u), e = u ** 3;
        X[i] = a * P0[0] + b * B1[0] + cc * B2[0] + e * M[0]; Y[i] = a * P0[1] + b * B1[1] + cc * B2[1] + e * M[1]; Z[i] = a * P0[2] + b * B1[2] + cc * B2[2] + e * M[2];
        if (i) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1], Z[i] - Z[i - 1]);
      }
      fs = S[NI] / 980 + .6;
    }
    c.fs = fs; c.tl = invW(warp(c.te) - fs);
    Object.assign(c, { k, P0, M, X, Y, Z, S, L: S[NI], w0: warp(c.te) - fs });
    c.stopTag = !c.partner && !c.high;
  });
  /* the missile's position after sf of its flight (0..1): it accelerates off the rail */
  const icQ = [0, 0, 0];
  function icAt(c, sf) {
    const s = c.L * Math.pow(E.sat(sf), 1.35);
    let lo = 0, hi = NI; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.S[m] <= s) lo = m; else hi = m; }
    const u = (s - c.S[lo]) / (c.S[hi] - c.S[lo] || 1);
    icQ[0] = c.X[lo] + (c.X[hi] - c.X[lo]) * u; icQ[1] = c.Y[lo] + (c.Y[hi] - c.Y[lo]) * u; icQ[2] = c.Z[lo] + (c.Z[hi] - c.Z[lo]) * u;
    return icQ;
  }
  /* burst templates: fragments on a sphere, a smoke ball */
  const NF = 380, FR = { x: new Float32Array(NF), y: new Float32Array(NF), z: new Float32Array(NF), sp: new Float32Array(NF), k: new Float32Array(NF), life: new Float32Array(NF), hot: new Uint8Array(NF) };
  { const rr = rng(6611); for (let i = 0; i < NF; i++) { const u = rr() * 2 - 1, a = rr() * TAU, h = Math.sqrt(1 - u * u); FR.x[i] = Math.cos(a) * h; FR.y[i] = u; FR.z[i] = Math.sin(a) * h; FR.sp[i] = 400 + 2100 * Math.pow(rr(), 1.5); FR.k[i] = 1.5 + 1.5 * rr(); FR.life[i] = 1 + 1.7 * rr(); FR.hot[i] = rr() < .25 ? 1 : 0; } }
  const NQ = 200, SMK = { x: new Float32Array(NQ), y: new Float32Array(NQ), z: new Float32Array(NQ), r: new Float32Array(NQ), br: new Float32Array(NQ) };
  { const rr = rng(6617); for (let i = 0; i < NQ; i++) { const u = rr() * 2 - 1, a = rr() * TAU, h = Math.sqrt(1 - u * u), q = Math.cbrt(rr()); SMK.x[i] = Math.cos(a) * h * q; SMK.y[i] = u * q * .7; SMK.z[i] = Math.sin(a) * h * q; SMK.r[i] = 220 + 380 * rr(); SMK.br[i] = .5 + .5 * rr(); } }

  /* ---------- close-in guns: tracer streams at the rounds that get through ---------- */
  const CW_ = [{ from: 0, rd: 0 }, { from: 1, rd: 4 }, { from: 1, rd: 3 }];
  const TR_RATE = 26, TR_V = 1050, TR_LIFE = 1.6;
  for (const s of CW_) {
    const r = RD[s.rd], g = TG[s.from]; s.t1 = r.hitT - .06; s.t0 = r.hitT - 1.5; s.shots = [];
    const rr = rng(7001 + s.rd * 7);
    for (let t = s.t0; t < s.t1; t += 1 / TR_RATE) {
      const o = g.w(t), m = roundAt(r, mOf(r, t + .7)), d = [m.x - o[0], m.y + 20 - 18, m.z - o[2]], l = Math.hypot(d[0], d[1], d[2]);
      // the mount walks its stream round the round's line: at this range it reads as a spray
      const sw = Math.sin(t * 5.3 + s.rd) * .12, jx = gauss(rr) * .04 + sw, jy = gauss(rr) * .03 + .05 + .04 * Math.sin(t * 3.1), jz = gauss(rr) * .04 - sw * .6;
      s.shots.push({ t, w: warp(t), o: [o[0], 18, o[2]], d: [d[0] / l + jx, d[1] / l + jy, d[2] / l + jz], hot: rr() < .3 });
    }
  }

  /* ---------- draw ---------- */
  let qx = 0, qy = 0, qz = 0;
  const prj = (cam, x, y, z) => {
    const e = cam.eye, f = cam.f, dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < cam.near) return false;
    const r = cam.r, u = cam.u;
    qx = cam.cx + cam.fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; qy = cam.cy - cam.fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; qz = zc;
    return true;
  };
  const warpTxt = T => '×' + warp.rate(T).toFixed(1);
  /* additive round glow with a soft (1 - d²/R²)² falloff; pb.add is square and would show its edges */
  function glow(pb, x, y, R, r, g, b, a) {
    if (a <= .002 || x < -R || y < -R || x > pb.W + R || y > pb.H + R) return;
    const d = pb.d, W = pb.W, x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R)), y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(pb.H - 1, Math.ceil(y + R)), iR2 = 1 / (R * R);
    for (let j = y0; j <= y1; j++) {
      const dy = j - y;
      for (let i = x0; i <= x1; i++) {
        const dx = i - x, q = 1 - (dx * dx + dy * dy) * iR2; if (q <= 0) continue;
        const w = q * q * a, k = (j * W + i) * 4; d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w;
      }
    }
  }
  PA.glow = glow;
  const LR0 = LIME[0] - WH[0], LG0 = LIME[1] - WH[1], LB0 = LIME[2] - WH[2];

  function drawContact(pb, cam, T, g, sp, aS, hk, ph, tau, out) {
    const age = T - g.TX, hit = age >= 0;
    // returns: the scope's own look (stalks over the threshold, lime at the leading edge)
    if (aS > .01) {
      const p = g.c(tau), b = Math.atan2(p[0], p[1]), s0 = Math.floor((ph - b) / TAU);
      for (const s of [s0, s0 - 1]) {
        const r = sweep(g, s), d = ph - (r.b + s * TAU);
        if (d < 0 || d > TAU * 1.5) continue;
        if (!r.post && age >= FL) continue;                       // the burst has these now
        if (r.post && r.T > g.TX + 4) continue;
        const flare = !r.post && hit ? E.sat(age / .08) : 0;
        const gl = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1, k = d < .6 ? Math.exp(-d * 7) : 0, D = r.dots;
        const cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
        for (let q = 0; q < D.length; q += 4) {
          const y = D[q + 2] * hk * rise * (.45 + .55 * gl) * (1 + 1.3 * flare), on = D[q + 3] > 0;
          if (!prj(cam, D[q], y, D[q + 1])) continue;
          const sx = qx, sy = qy;
          let bb = Math.abs(D[q + 3]) * (.36 + .64 * gl);
          if (on) bb = Math.max(bb, .55 + .45 * gl);
          bb = bb + (1.2 - bb) * flare;
          const fr = flare ? 255 : cr, fg = flare ? 255 : cg, fb = flare ? 250 : cb;
          if (on && prj(cam, D[q], 0, D[q + 1])) pb.dline(qx, qy, sx, sy, 2.5, 1, fr, fg, fb, Math.min(1, bb * (.55 + .45 * flare)) * aS);
          pb.dot(sx, sy, 2, fr, fg, fb, Math.min(1, bb) * aS);
        }
      }
    }
    // the track and its tag
    const aT0 = sp.a * Math.max(sp.tracks, E.ss(146.5, 149.5, T)), aT = aT0 * (T < g.DROP ? 1 : 1 - E.sat((T - g.DROP) / 1.4));
    if (aT0 > .01) {
      const p = g.c(Math.min(tau, g.tauX)), Rm = PA.Rmeas(p[0], p[1]);
      const el = PA.ellipse(p, [Rm[0] * 1.3, Rm[1] * 1.3, Rm[2] * 1.3], 3.5);
      const drop = T >= g.DROP, spread = drop ? 1 + 1.5 * E.sat((T - g.DROP) / 1.4) : 1;
      const col = hit ? WH : LIME;
      const b = Math.atan2(p[0], p[1]), dLast = ph - b - Math.floor((ph - b) / TAU) * TAU, ageHit = dLast / OMEGA;
      const cp = cam.project([SX + p[0] * 1000, 0, SZ + p[1] * 1000]);
      if (cp) {
        const pxkm = cam.fl / cp[2] * 1000, n = Math.round(E.clamp(TAU * el.A * pxkm / 5.5, 18, 160));
        let rx = -1e9, ax = 0, ay = 0;
        for (let k = 0; k < n; k++) {
          const th = k / n * TAU, ca = Math.cos(th), sa = Math.sin(th), jit = drop ? (hsh(2100 + k + g.j * 400, 5) - .5) * (spread - 1) * .8 : 0;
          const wx = el.c[0] + (el.e1[0] * ca * el.A + el.e2[0] * sa * el.B) * (spread + jit), wz = el.c[1] + (el.e1[1] * ca * el.A + el.e2[1] * sa * el.B) * (spread + jit);
          if (!prj(cam, SX + wx * 1000, 30, SZ + wz * 1000)) continue;
          if (k % 2 === 0 || !drop) pb.dot(qx, qy, hit ? 1 : 2, col[0], col[1], col[2], aT * (hit ? .75 : .95));
          if (qx - qy * .25 > rx) { rx = qx - qy * .25; ax = qx; ay = qy; }
        }
        if (!hit) {
          // the update ring each time the beam paints it, the history, the velocity leader
          if (ageHit < .7) {
            const gg = 1 + E.outCubic(ageHit / .7) * 1.4, al = (1 - ageHit / .7) * aT;
            for (let k = 0; k < 56; k++) { const th = k / 56 * TAU, ca = Math.cos(th), sa = Math.sin(th); if (prj(cam, SX + (el.c[0] + (el.e1[0] * ca * el.A + el.e2[0] * sa * el.B) * gg) * 1000, 30, SZ + (el.c[1] + (el.e1[1] * ca * el.A + el.e2[1] * sa * el.B) * gg) * 1000)) pb.dot(qx, qy, 1, LIME[0], LIME[1], LIME[2], al * .8); }
          }
          pb.dot(cp[0], cp[1], 3, LIME[0], LIME[1], LIME[2], aT);
          const sNow = Math.floor((ph - b) / TAU);
          let px = null, py = 0;
          for (let j = 8; j >= 0; j--) {
            const h = g.c(paintTau(b, sNow - j)), jx = (hsh(sNow - j, 71 + g.j) - .5) * .12, jz = (hsh(sNow - j, 73 + g.j) - .5) * .12;
            if (!prj(cam, SX + (h[0] + jx) * 1000, 20, SZ + (h[1] + jz) * 1000)) continue;
            const al = aT * (.25 + .6 * (8 - j) / 9);
            pb.dot(qx, qy, 2, LIME[0], LIME[1], LIME[2], al);
            if (px !== null) pb.dline(px, py, qx, qy, 3, 1, LIME[0], LIME[1], LIME[2], al * .6);
            px = qx; py = qy;
          }
          if (prj(cam, SX + (p[0] + HDG[0] * SPD * 60) * 1000, 20, SZ + (p[1] + HDG[1] * SPD * 60) * 1000)) pb.dline(cp[0], cp[1], qx, qy, 3, 1, LIME[0], LIME[1], LIME[2], .55 * aT);
        }
        const tagA = aT0 * (drop ? 1 - E.sat((T - g.DROP - 1) / .8) : 1);
        if (rx > -1e9) out.tags.push({ key: 'beat' + g.id, id: 'TRK ' + g.id, txt: hit ? (drop ? 'dropped' : 'HIT') : g.cls + ' · p 0.99', cls: drop ? 'drop' : hit ? 'coral' : 'lime', ax, ay, x: ax + 16, y: ay - 30, a: tagA, pri: hit ? 7 : 4 });
      }
    }
    // the hit: flare, burst, spray, ring, plume
    if (hit && aS > .01) {
      const CW = g.CW;
      if (age < 1.2 && prj(cam, CW[0], 160, CW[1])) {
        const I = Math.exp(-age * 4.5);
        glow(pb, qx, qy, 16, 255, 255, 255, .8 * I); glow(pb, qx, qy, 46, 255, 245, 230, .22 * I); glow(pb, qx, qy, 100, CORAL[0], CORAL[1], CORAL[2], .11 * I); glow(pb, qx, qy, 230, 255, 225, 200, .035 * I);
      }
      if (age >= FL) {
        const ab = age - FL, BU = g.BU;
        const fade = Math.exp(-ab * .9) * aS;
        if (fade > .01) for (let i = 0; i < BU.n; i++) {
          const k = BU.k[i], dd = (1 - Math.exp(-k * ab)) / k, y0 = BU.db[i] * hk * g.riseX * (.45 + .55 * g.glowX) * 2.3;
          let y = y0 + BU.vy[i] * dd - 210 * ab * ab; const low = y < 0 ? E.sat(1 + y / 200) : 1; if (y < 0) y = 0;
          if (!prj(cam, BU.x[i] + BU.vx[i] * dd, y, BU.z[i] + BU.vz[i] * dd)) continue;
          pb.dot(qx, qy, ab < .8 ? 2 : 1, 255, 255, 248, Math.min(1, 1.2 * fade * low));
        }
        const SP = g.SP;
        for (let i = 0; i < NS; i++) {
          const L = SP.life[i]; if (ab > L) continue;
          const k = SP.k[i], dd = (1 - Math.exp(-k * ab)) / k;
          let y = SP.y[i] + SP.vy[i] * dd - 240 * ab * ab; const low = y < 0 ? E.sat(1 + y / 160) : 1; if (y < 0) y = 0;
          if (!prj(cam, SP.x[i] + SP.vx[i] * dd, y, SP.z[i] + SP.vz[i] * dd)) continue;
          const al = (1 - ab / L) * low * aS, hot = SP.hot[i] ? E.sat(1 - ab / 1.1) : 0;
          pb.dot(qx, qy, ab < .7 || hot > .2 ? 2 : 1, 255 + (CORAL[0] - 255) * hot, 255 + (CORAL[1] - 255) * hot, 250 + (CORAL[2] - 250) * hot, Math.min(1, al * (.8 + .4 * hot)));
        }
        if (ab < 1.8) {
          const R = 3000 * E.outExpo(ab / 1.8), al = .85 * (1 - ab / 1.8) * aS;
          for (let k = 0; k < 300; k++) {
            const th = k / 300 * TAU, rr = R * (1 + (hsh(k + g.j * 300, 17) - .5) * .06);
            if (prj(cam, CW[0] + Math.sin(th) * rr, 0, CW[1] + Math.cos(th) * rr)) pb.dot(qx, qy, hsh(k, 23 + g.j) < .5 ? 2 : 1, WH[0], WH[1], WH[2], al * (.55 + .45 * hsh(k, 19 + g.j)));
          }
        }
      }
      // the plume: points rising and spreading into a head, leaning downwind, lit as the beam passes
      const fP = (1 - E.ss(g.TX + 3.2, g.TX + 6.6, T)) * aS;
      if (fP > .01) {
        const PL = g.PL;
        const dB = ph - g.bX - Math.floor((ph - g.bX) / TAU) * TAU, gB = Math.exp(-dB * .75), kB = dB < .6 ? Math.exp(-dB * 7) : 0;
        const beamMod = .75 + .5 * gB;
        for (let i = 0; i < NP; i++) {
          const ap = age - PL.b[i]; if (ap < 0) continue;
          // the tall ones roll out into a head: the higher they get, the further they spread
          const H = PL.H[i], h = H * (1 - Math.exp(-ap / PL.tk[i])), u = h / H, head = E.sat((H - 2400) / 1600);
          const r = (PL.r0[i] + PL.r1[i] * u) * (1 - .45 * head) + head * (900 + 2200 * PL.mu[i]) * Math.pow(u, 2.5) + 40 * ap;
          if (!prj(cam, CW[0] + HDG[0] * PL.ox[i] + PL.sa[i] * r + WND[0] * ap, 15 + h, CW[1] + HDG[1] * PL.ox[i] + PL.ca[i] * r + WND[1] * ap)) continue;
          const hot = ap < .35 ? 1 - ap / .35 : 0, b = PL.br[i] * (.55 + .45 * Math.exp(-ap * .7)) * fP * beamMod;
          const k = kB * .8 * (1 - hot);
          pb.dot(qx, qy, ap < .8 || b > .35 ? 2 : 1, WH[0] + (255 - WH[0]) * hot + LR0 * k, WH[1] + (255 - WH[1]) * hot + LG0 * k, WH[2] + (250 - WH[2]) * hot + LB0 * k, Math.min(1, b));
        }
      }
    }
  }

  function drawRound(pb, cam, T, r, aL, first, out) {
    const la = T - r.tl; if (la < 0) return;
    const m = mOf(r, T), R = roundAt(r, m), end = T >= r.hitT, age = T - r.hitT, L0 = r.L0;
    // launch: tube flash, sparks, boost smoke
    if (la < .9 && prj(cam, L0[0], L0[1] + 4, L0[2])) {
      const I = Math.exp(-la * 6);
      glow(pb, qx, qy, 10, 255, 255, 245, .8 * I); glow(pb, qx, qy, 34, 255, 255, 235, .16 * I); glow(pb, qx, qy, 110, LIME[0], LIME[1], LIME[2], .05 * I);
    }
    if (la < 1.6) for (const k of SK) {
      if (la > k[3]) continue;
      if (!prj(cam, L0[0] + k[0] * la, L0[1] + 4 + k[1] * la - 4.9 * la * la, L0[2] + k[2] * la)) continue;
      pb.dot(qx, qy, 2, 240, 255, 200, (1 - la / k[3]) * .95);
    }
    if (la < 8) for (const q of r.SM) {
      const a = T - q.Te; if (a < 0 || a > q.life) continue;
      const sp2 = 1.2 + 6 * a;
      if (!prj(cam, q.x + q.jx * sp2 + 3 * a, q.y + q.jy * sp2 * .7 + 2 * a, q.z + q.jz * sp2 + 1.2 * a)) continue;
      const hot = Math.exp(-a * 7), al = (.4 + .6 * Math.exp(-a * 1.6)) * (1 - a / q.life) * q.br;
      pb.dot(qx, qy, qz < 5000 ? 2 : 1, WH[0] + (255 - WH[0]) * hot, WH[1] + (255 - WH[1]) * hot, WH[2] + (240 - WH[2]) * hot, Math.min(1, al));
    }
    // the track: its history on the raid's own clock, the whole run from the coast
    const ta = E.ss(r.tl + .2, r.tl + .8, T) * aL, tr = end ? 1 - E.sat(age / 1.6) : 1;
    if (ta * tr > .01) {
      let px = null, py = 0;
      const m1 = Math.min(m, r.mEnd);
      for (let mj = 1.1; mj <= m1; mj += .25) {
        const h = roundAt(r, mj); if (!prj(cam, h.x, Math.max(h.y, 20), h.z)) { px = null; continue; }
        const al = ta * tr * (.3 + .6 * Math.exp(-(m1 - mj) / 8));
        pb.dot(qx, qy, 2, LIME[0], LIME[1], LIME[2], al);
        if (px !== null) pb.dline(px, py, qx, qy, 2, 1, LIME[0], LIME[1], LIME[2], al * .5);
        px = qx; py = qy;
      }
    }
    const ah = ta * (end ? 1 - E.sat(age / .06) : 1);
    if (ah > .01 && prj(cam, R.x, R.y, R.z)) {
      const hx = qx, hy = qy, boost = E.sat(1 - la / 2.4);
      // the motor: white-hot on the boost, a lime point once it is a track
      glow(pb, hx, hy, 6, 255, 255, 240, (.25 + .6 * boost) * ah); glow(pb, hx, hy, 16, LIME[0], LIME[1], LIME[2], (.1 + .12 * boost) * ah);
      pb.dot(hx, hy, 3, LIME[0], LIME[1], LIME[2], ah);
      pb.dot(hx, hy, 1, 255, 255, 255, ah);
      // own-track ring (screen size, like the symbol on a plot) and velocity leader
      for (let k = 0; k < 18; k++) { const th = k / 18 * TAU; pb.dot(hx + Math.cos(th) * 8, hy + Math.sin(th) * 8, 1, LIME[0], LIME[1], LIME[2], ah * .9); }
      if (R.s > 400 && prj(cam, R.x + R.tx * 2600, Math.max(R.y, 30), R.z + R.tz * 2600)) pb.dline(hx, hy, qx, qy, 3, 1, LIME[0], LIME[1], LIME[2], .6 * ah);
      // the lead round carries the tag; the others read as its wingmen by their symbol alone
      const rate = warp.rate(T);
      if (first) out.tags.push({ key: 'own' + r.n, id: 'OWN 01', txt: '3M55 Oniks', v: rate > 1.05 ? warpTxt(T) : '', cls: 'lime', ax: hx + 6, ay: hy + 6, x: hx + 18, y: hy + 12, a: ah, pri: 5, down: true });
    }
  }

  function drawInterceptor(pb, cam, T, c, aL, out) {
    const ww = warp(T), sf = (ww - c.w0) / c.fs;
    if (sf < 0) return;
    const done = sf >= 1, age = T - c.te;
    // launch flash at the ship
    const la = T - c.tl;
    if (la < .7 && prj(cam, c.P0[0], c.P0[1] + 6, c.P0[2])) {
      const I = Math.exp(-la * 7);
      glow(pb, qx, qy, 8, 255, 250, 240, .75 * I * aL); glow(pb, qx, qy, 30, CORAL[0], CORAL[1], CORAL[2], .12 * I * aL);
    }
    // the track: coral, the whole flight, hotter toward the head
    const tf = done ? 1 - E.sat(age / 1.3) : 1;
    if (tf > .01) {
      const s1 = Math.min(1, sf), n = Math.max(2, Math.ceil(s1 * 46));
      let px = null, py = 0;
      for (let j = 0; j <= n; j++) {
        const s = s1 * j / n, q = icAt(c, s);
        if (!prj(cam, q[0], q[1], q[2])) { px = null; continue; }
        const rec = Math.exp(-(s1 - s) * c.fs / 3.2), al = aL * tf * (.3 + .7 * rec);
        pb.dot(qx, qy, 2, CORAL[0], CORAL[1], CORAL[2], al);
        if (px !== null) pb.dline(px, py, qx, qy, 2, rec > .5 ? 2 : 1, CORAL[0], CORAL[1], CORAL[2], al * .7);
        px = qx; py = qy;
      }
    }
    if (!done) {
      const q = icAt(c, sf);
      if (prj(cam, q[0], q[1], q[2])) {
        const boost = E.sat(1 - sf * 3);
        glow(pb, qx, qy, 5, 255, 245, 235, (.35 + .45 * boost) * aL); glow(pb, qx, qy, 14, CORAL[0], CORAL[1], CORAL[2], .16 * aL);
        pb.dot(qx, qy, 3, CORAL[0], CORAL[1], CORAL[2], aL);
        pb.dot(qx, qy, 1, 255, 240, 230, aL);
      }
      return;
    }
    // the meeting: flash, fragments, a smoke ball; the round's own tag says what happened
    const M = c.M, big = c.high ? 1.2 : c.partner ? .7 : 1;
    if (age < 1.2 && prj(cam, M[0], M[1], M[2])) {
      // screen size of the flash follows range, within limits
      const I = Math.exp(-age * 5) * aL, sc = E.clamp(cam.fl * 700 / qz / 60, .7, 2.2) * big;
      glow(pb, qx, qy, 13 * sc, 255, 255, 250, .9 * I); glow(pb, qx, qy, 42 * sc, 255, 230, 210, .24 * I); glow(pb, qx, qy, 110 * sc, CORAL[0], CORAL[1], CORAL[2], .08 * I);
    }
    if (age < 2.6) {
      const rot = c.k * 1.7, cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i < NF; i++) {
        const L = FR.life[i]; if (age > L) continue;
        const k = FR.k[i], dd = (1 - Math.exp(-k * age)) / k * FR.sp[i] * big;
        const dx = FR.x[i] * cr - FR.z[i] * sr, dz = FR.x[i] * sr + FR.z[i] * cr;
        let y = M[1] + FR.y[i] * dd - 160 * age * age; if (y < 0) y = 0;
        if (!prj(cam, M[0] + dx * dd, y, M[2] + dz * dd)) continue;
        const hot = FR.hot[i] ? E.sat(1 - age / 1.4) : E.sat(1 - age / .35), al = (1 - age / L) * aL;
        pb.dot(qx, qy, age < .5 || hot > .3 ? 2 : 1, 255 + (CORAL[0] - 255) * hot * FR.hot[i], 255 + (CORAL[1] - 255) * hot * FR.hot[i], 250 + (CORAL[2] - 250) * hot * FR.hot[i], Math.min(1, al * (.75 + .5 * hot)));
      }
    }
    if (age < 5) {
      const f = (1 - age / 5) * aL * .55;
      for (let i = 0; i < NQ; i++) {
        const g2 = SMK.r[i] * big * (.4 + .6 * (1 - Math.exp(-age * 1.8)));
        if (!prj(cam, M[0] + SMK.x[i] * g2 + WND[0] * age, M[1] + SMK.y[i] * g2 + 12 * age, M[2] + SMK.z[i] * g2 + WND[1] * age)) continue;
        pb.dot(qx, qy, 1, WH[0], WH[1], WH[2], f * SMK.br[i]);
      }
    }
    if (c.stopTag && age < 3.4 && prj(cam, M[0], M[1] + 40, M[2])) {
      const a = E.sat(age / .15) * (1 - E.sat((age - 2.6) / .8)) * aL;
      out.tags.push({ key: 'stop' + c.rd, id: 'OWN 0' + RD[c.rd].n, txt: 'stopped', cls: '', ax: qx, ay: qy, x: qx + 16, y: qy - 34, a, pri: 6 });
    }
  }

  function drawGuns(pb, cam, T, aL) {
    const ww = warp(T);
    for (const s of CW_) {
      if (T < s.t0 || T > s.t1 + TR_LIFE) continue;
      let firing = false;
      for (const q of s.shots) {
        // tracer ages run on the raid's clock, like everything else in flight
        const a = ww - q.w; if (a < 0) break;
        if (a > TR_LIFE) continue;
        firing = true;
        // each tracer a short dash: where it is and where it was 40 ms ago
        const d0 = TR_V * Math.max(0, a - .04);
        if (!prj(cam, q.o[0] + q.d[0] * d0, q.o[1] + q.d[1] * d0, q.o[2] + q.d[2] * d0)) continue;
        const bx = qx, by = qy, d = TR_V * a;
        if (!prj(cam, q.o[0] + q.d[0] * d, q.o[1] + q.d[1] * d - 4.9 * a * a, q.o[2] + q.d[2] * d)) continue;
        const al = (1 - a / TR_LIFE) * aL;
        pb.dline(bx, by, qx, qy, 1.5, 1, CORAL[0], CORAL[1], CORAL[2], al * .7);
        pb.dot(qx, qy, 2, CORAL[0], CORAL[1], CORAL[2], Math.min(1, al * (q.hot ? 1.2 : .85)));
        if (q.hot) { pb.dot(qx, qy, 1, 255, 235, 220, al); pb.add(qx, qy, 5, CORAL[0], CORAL[1], CORAL[2], .05 * al); }
      }
      if (firing && T < s.t1 && prj(cam, s.shots[0].o[0], 18, s.shots[0].o[2])) glow(pb, qx, qy, 7, CORAL[0], CORAL[1], CORAL[2], (.25 + .15 * hsh(Math.floor(T * 30), s.rd)) * aL);
    }
  }

  /* sp: the scope's layer params this frame (a, hk, tracks, ships) */
  PA.beat = function (pb, cam, T, sp) {
    const out = { tags: [], read: null };
    if (T < T_ON || T > T_END) return out;
    const tau = PA.tau(T), ph = PA.phase(tau), hk = sp.hk, aS = sp.a * sp.ships * (1 - E.ss(162, T_END, T));
    for (const g of TG) drawContact(pb, cam, T, g, sp, aS, hk, ph, tau, out);
    if (T >= T_L) {
      const aL = sp.a > .01 ? 1 : 0;
      for (let i = 0; i < RD.length; i++) drawRound(pb, cam, T, RD[i], aL, i === 0, out);
      for (const c of IC) drawInterceptor(pb, cam, T, c, aL * (1 - E.ss(161, T_END, T)), out);
      drawGuns(pb, cam, T, aL);
      // readout: the raid in three numbers
      const up = RD.filter(r => T >= r.tl).length, stopped = RD.filter(r => r.stop && T >= r.stop).length, hits = TG.filter(g => T >= g.TX).length;
      if (!hits) {
        const lead = RD[0], R = roundAt(lead, mOf(lead, T));
        const km = `<span><b>${((lead.LP - R.s) / 1000).toFixed(1)}</b> km</span>`, st = `<span><b>${stopped}</b> stopped</span>`;
        const parts = warp.rate(T) > 1.05 ? [`<span class="rate">Warp ${warpTxt(T)}</span>`, stopped ? st : km] : [km, stopped ? st : ''];
        out.read = `<i></i><span><b>${up}</b> OWN</span>` + parts.filter(Boolean).map(p => `<span>·</span>${p}`).join('');
      } else if (T < TG[2].DROP + 1) out.read = `<i></i><span><b>${up}</b> OWN</span><span>·</span><span><b>${stopped}</b> stopped</span><span>·</span><span class="co"><b style="color:inherit">${hits}</b> hit</span>`;
    }
    return out;
  };
  PA.BEAT = { T_ON, T_L, T_END, warp, TG, RD, IC, CW: CW_, T_X: TG[0].TX, T_DROP: TG[0].DROP };
})();
