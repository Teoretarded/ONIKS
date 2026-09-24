/* ENGAGEMENT: the Monolith-B 3D clutter scope (after pa_picture_scope.js / the Clutter menu).
   Range x azimuth sea lattice, sea clutter ~R^-3 / R^-7 with wind rows and spikes, CA-CFAR stalks,
   the ships' returns painted sweep by sweep, a track on each hostile contact (updated when the beam
   paints it, dead-reckoned between), and the raid as lime own tracks. A pure function of the picture's
   clock tau (plus film time T for the hit hook). Internal km (radar at the origin), drawn in metres. */
(function () {
  const { E, rng, fbm, gauss } = M3;
  const PD = window.PD, DEG = PD.DEG, TAU = PD.TAU, hsh = PD.hsh, LIME = PD.LIME, WH = PD.WH;
  // a whole number of antenna turns in S(D): the beam is where it was across the picture-clock jump at TJ
  const RMAX = PD.RMAX / 1000, ROT = PD.SD / Math.round(PD.SD / 4), OMEGA = TAU / ROT, PH0 = 1.1;
  Object.assign(PD, { ROT, OMEGA, PH0 });
  PD.phase = tau => OMEGA * tau + PH0;                // beam bearing from north, clockwise (unwrapped)
  const phase = PD.phase;
  const RHOR = 18, WIND = -28 * DEG, ALPHA = 8.2, BW = 1.1 * DEG, SR = .03, SB = .6 * DEG;
  const r0 = rng(2402);
  const shoreKm = (x, z) => z * 1000 - PD.coastZ(x * 1000);      // m north of the shore (>0 at sea)

  function clutMean(r, az) {
    const g = r < RHOR ? Math.pow(RHOR / r, 3) : Math.pow(RHOR / r, 7);
    return 6.3 * g * (.3 + .7 * Math.pow(.5 + .5 * Math.cos(az - WIND), 2));
  }

  /* ---------- sea lattice ---------- */
  const AZA = -94 * DEG, DAZ = .8 * DEG, NAZ = Math.round(188 / .8);
  const rstep = r => .07 + r * .022;
  const A = { x: [], z: [], a: [], r: [], c: [], k: [], o: [], p: [], rs: [] }, BIN = [];
  for (let k = 0; k < NAZ; k++) {
    const azc = AZA + (k + .5) * DAZ, i0 = A.x.length;
    for (let r = .5; r < RMAX; r += rstep(r)) {
      const az = azc + (r0() - .5) * DAZ * .7, rr = r + (r0() - .5) * rstep(r) * .6;
      const x = Math.sin(az) * rr, z = Math.cos(az) * rr, sh = shoreKm(x, z);
      if (sh < 80) continue;
      const u = x * Math.sin(WIND) + z * Math.cos(WIND), v = x * Math.cos(WIND) - z * Math.sin(WIND);
      const tex = Math.exp(1.4 * fbm(u * .14, v * .7, 3.7, 3) - .25);
      const c = (clutMean(rr, az) + (sh < 3000 ? 420 * Math.exp(-sh / 900) : 0)) * tex;
      A.x.push(x); A.z.push(z); A.a.push(az); A.r.push(rr); A.c.push(c); A.rs.push(rstep(rr));
      A.k.push(TAU * u / 2.2); A.o.push(Math.floor(r0() * 3)); A.p.push(.00008 * Math.min(1, c / 20));
    }
    BIN.push([i0, A.x.length]);
  }
  const NL = A.x.length;
  const LX = new Float32Array(A.x), LZ = new Float32Array(A.z), LA = new Float32Array(A.a), LR = new Float32Array(A.r), LC = new Float32Array(A.c);
  const LK = new Float32Array(A.k), LO = new Int8Array(A.o), LP = new Float32Array(A.p), LRS = new Float32Array(A.rs);
  const LWX = new Float64Array(NL), LWZ = new Float64Array(NL);
  for (let i = 0; i < NL; i++) { LWX[i] = LX[i] * 1000; LWZ[i] = LZ[i] * 1000; }
  const tauOf = (b, s) => (b + s * TAU - PH0) / OMEGA;

  /* one cell's return power for sweep s; negative = over the CFAR threshold */
  function cellP(i, s) {
    const c = LC[i] * (1 + .45 * Math.sin(LK[i] + s * 1.3));
    const spike = hsh(i, Math.floor((s + LO[i]) / 3) * 7 + 3) < LP[i] ? 14 : 1;
    const P = -Math.log(hsh(i, s * 2 + 1)) + c * spike * -Math.log(hsh(i, s * 2 + 2));
    return P / (1 + c) > ALPHA ? -P : P;
  }
  const bright = P => E.clamp((4.343 * Math.log(P) + 14) / 40, .16, 1);
  const dbOf = P => Math.max(0, 4.343 * Math.log(P) - 2);
  const LS = new Int32Array(NL).fill(-999999), LB = new Float32Array(NL), LY = new Float32Array(NL), LD = new Uint8Array(NL);
  function paintCell(i, s) {
    const P = cellP(i, s), a = Math.abs(P);
    LS[i] = s; LB[i] = bright(a); LY[i] = dbOf(a) + (P < 0 ? 12 : 0); LD[i] = P < 0 ? 1 : 0;
  }
  /* false alarms in the last sweep (for the readout) */
  PD.faCount = tau => { let n = 0; const s = Math.floor(phase(tau) / TAU) - 1; for (let i = 0; i < NL; i += 7) if (cellP(i, s) < 0) n++; return n * 7; };

  /* ---------- ship returns ---------- */
  const SH = PD.SHIPS;
  const retCache = SH.map(() => new Map());
  function paintT(j, s) {
    let p = PD.shipKm(j, 0), t = tauOf(Math.atan2(p[0], p[1]), s);
    for (let it = 0; it < 3; it++) { p = PD.shipKm(j, t); t = tauOf(Math.atan2(p[0], p[1]), s); }
    return t;
  }
  function shipRet(j, s) {
    const cache = retCache[j]; let r = cache.get(s);
    if (r) return r;
    const sh = SH[j], t = paintT(j, s), p = PD.shipKm(j, t);
    const az = Math.atan2(p[0], p[1]), rg = Math.hypot(p[0], p[1]), rr = rng(7919 * (j + 1) + s * 31);
    const snr = sh.rcs - 40 * Math.log10(rg / 30) - 14, c = clutMean(rg, az);
    const scr = Math.pow(10, snr / 10) / (1 + c), Pd = Math.exp(-ALPHA / (1 + scr)), det = hsh(900 + j, s) < Pd;
    const ux = Math.sin(az), uz = Math.cos(az), cross = rg * BW / 2.4, Lv = sh.L * 4, hd = [PD.FWD[0], PD.FWD[2]];
    const dots = [], n = Math.round(E.clamp(6 + 1.1 * snr, 6, 40)), S_ = Math.pow(10, snr / 10);
    for (let k = 0; k < n; k++) {
      const al = (rr() - .5) * Lv, cr = gauss(rr) * cross, rgn = gauss(rr) * .05;
      const x = p[0] + hd[0] * al + uz * cr + ux * rgn, z = p[1] + hd[1] * al - ux * cr + uz * rgn;
      const P = S_ * Math.exp(-.5 * (cr / cross) ** 2) * -Math.log(rr()) - Math.log(rr()) + c * -Math.log(rr()), db = 4.343 * Math.log(P);
      if (db < 2) continue;
      const on = det && P / (1 + c) > ALPHA;
      dots.push(x * 1000, z * 1000, dbOf(P) + (on ? 12 : 0), bright(P) * (on ? 1 : -1));
    }
    r = { t, ph: az + s * TAU, dots };
    cache.set(s, r);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return r;
  }

  /* ---------- tracks: one update per paint, measurement scatter from the range / bearing errors ---------- */
  const trkCache = SH.map(() => new Map());
  function upd(j, s) {
    let u = trkCache[j].get(s); if (u) return u;
    const t = paintT(j, s), p = PD.shipKm(j, t), r = Math.hypot(p[0], p[1]), ux = p[0] / r, uz = p[1] / r;
    const ec = PD.gH(300 + j, s) * r * SB * .4, er = PD.gH(500 + j, s) * SR * .6;
    u = { s, t, x: p[0] + uz * ec + ux * er, z: p[1] - ux * ec + uz * er, r };
    trkCache[j].set(s, u); if (trkCache[j].size > 64) trkCache[j].delete(trkCache[j].keys().next().value);
    return u;
  }
  const VKM = [PD.FWD[0] * PD.VS / 1000, PD.FWD[2] * PD.VS / 1000];
  PD.trackAt = function (j, tau) {
    const p = PD.shipKm(j, tau), b = Math.atan2(p[0], p[1]);
    let s = Math.floor((phase(tau) - b) / TAU), u = upd(j, s);
    if (u.t > tau) { s--; u = upd(j, s); }
    const age = tau - u.t;
    return { u, s, age, x: u.x + VKM[0] * age, z: u.z + VKM[1] * age, r: u.r };
  };

  /* ---------- land relief, map ---------- */
  const G = { x: [], y: [], z: [], b: [], a: [] };
  const shade = (x, z) => { const e = 600, dx = PD.landH(x + e, z) - PD.landH(x - e, z), dz = PD.landH(x, z + e) - PD.landH(x, z - e); const nx = -dx * 3 / (2 * e), nz = -dz * 3 / (2 * e), l = Math.hypot(nx, 1, nz); return Math.max(0, (-.5 * nx + .75 - .45 * nz) / l); };
  for (let z = -16; z < 3; z += .42) for (let x = -72; x < 72; x += .42 + Math.abs(x) * .01) {
    const px = (x + (r0() - .5) * .35) * 1000, pz = (z + (r0() - .5) * .35) * 1000;
    const h = PD.landH(px, pz); if (h <= 0) continue;
    G.x.push(px); G.y.push(h); G.z.push(pz); G.b.push(.1 + .3 * shade(px, pz) + .08 * r0()); G.a.push(Math.atan2(px, pz));
  }
  const NG = G.x.length;
  const GX = new Float64Array(G.x), GY = new Float32Array(G.y), GZ = new Float64Array(G.z), GB = new Float32Array(G.b), GA = new Float32Array(G.a);
  const MAP = [];
  for (let x = -72; x <= 72; x += .16) { const z = PD.coastZ(x * 1000) / 1000; if (Math.hypot(x, z) < RMAX + 4) MAP.push(x, z, 0); }
  const RINGS = [16, 32, 48, 64];
  for (const rr of RINGS) for (let a = -92; a <= 92; a += rr === RMAX ? .2 : .32) { const x = Math.sin(a * DEG) * rr, z = Math.cos(a * DEG) * rr; if (shoreKm(x, z) > 0) MAP.push(x, z, rr === RMAX ? 2 : 1); }
  for (let a = -80; a <= 80; a += 10) for (let d = .2; d < 1.6; d += .2) MAP.push(Math.sin(a * DEG) * (RMAX + d), Math.cos(a * DEG) * (RMAX + d), 3);
  const MP = new Float32Array(MAP), NMP = MP.length / 3;
  PD.RINGS = RINGS;

  /* ---------- scratch ---------- */
  const CYa = new Float32Array(NL), CBa = new Float32Array(NL), CKa = new Float32Array(NL), CPX = new Float32Array(NL), SXa = new Float32Array(NL), SYa = new Float32Array(NL);
  const NRi = new Int32Array(NL).fill(-1), NAi = new Int32Array(NL).fill(-1);
  for (let k = 0; k < BIN.length; k++) {
    const [i0, i1] = BIN[k], nb = BIN[k + 1];
    for (let i = i0; i < i1; i++) {
      if (i + 1 < i1 && LR[i + 1] - LR[i] < LRS[i] * 1.8) NRi[i] = i + 1;
      if (!nb) continue;
      let lo = nb[0], hi = nb[1] - 1; if (hi < lo) continue;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LR[m] < LR[i]) lo = m; else hi = m; }
      const j = Math.abs(LR[lo] - LR[i]) < Math.abs(LR[hi] - LR[i]) ? lo : hi;
      if (Math.abs(LR[j] - LR[i]) < LRS[i] * .8) NAi[i] = j;
    }
  }

  /* ---------- render ----------
     o: { a: scope alpha, hk: display metres per dB, land, map, beam, tracks, ships, own (raid tracks),
          lod (near cells as a surface), near, T (film time, for the hit hook) } */
  PD.scope = function (pb, cam, tau, o) {
    const a0 = o.a, tags = []; if (a0 <= .003) return { tags };
    const hk = o.hk;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const e0 = e[0], e1 = e[1], e2 = e[2], f0 = f[0], f1 = f[1], f2 = f[2], r0x = ru[0], r1x = ru[1], r2x = ru[2], u0 = u[0], u1 = u[1], u2 = u[2];
    const ph = phase(tau);
    const LR0 = LIME[0] - WH[0], LG0 = LIME[1] - WH[1], LB0 = LIME[2] - WH[2];
    const near = o.near || 1, surf = o.lod ? 1 : 0, BIG = o.big || 36000, gain = o.gain || 1, mcap = o.mcap || 9;
    // the picture exists only between two beam passes: painted in after showFrom, wiped after hideFrom (tau)
    const shF = o.showFrom === undefined ? -1e9 : o.showFrom, hdF = o.hideFrom === undefined ? 1e9 : o.hideFrom;
    const live = (b, d) => { const tp = tau - d / OMEGA; return tp >= shF && tp < hdF; };
    // sea cells, pass 1: height, brightness, lime, screen position
    for (let i = 0; i < NL; i++) {
      let d = ph - LA[i]; const s = Math.floor(d / TAU); d -= s * TAU;
      CPX[i] = -1;
      if (!live(LA[i], d)) continue;
      if (LS[i] !== s) paintCell(i, s);
      const glow = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1;
      const y = LY[i] * hk * rise * (.45 + .55 * glow);
      let b = LB[i] * (.5 + .9 * glow) * (1 + .3 * LR[i] / RMAX);
      const k = d < .6 ? Math.exp(-d * 7) : 0;
      if (k) b = Math.max(b, k * .7);
      if (LD[i]) b = Math.max(b, .5 + .5 * glow);
      CYa[i] = y; CBa[i] = b; CKa[i] = k; CPX[i] = -1;
      const dx = LWX[i] - e0, dy = y - e1, dz = LWZ[i] - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      SXa[i] = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc; SYa[i] = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc; CPX[i] = zc;
    }
    // pass 2: far cells as dots, near cells as a surface between neighbours
    for (let i = 0; i < NL; i++) {
      const zc = CPX[i]; if (zc < 0) continue;
      const sx = SXa[i], sy = SYa[i];
      const k = CKa[i], b = CBa[i], cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
      let m = 1;
      const i1 = NRi[i], i2 = NAi[i];
      if (surf && i1 >= 0 && i2 >= 0 && CPX[i1] > 0 && CPX[i2] > 0 && sx > -400 && sx < 2320 && sy > -400 && sy < 1480) {
        const ax = SXa[i1] - sx, ay = SYa[i1] - sy, bx2 = SXa[i2] - sx, by2 = SYa[i2] - sy;
        m = Math.min(mcap, Math.round(Math.sqrt(Math.abs(ax * by2 - ay * bx2)) / 6.5));
      }
      if (m >= 2) {
        const i3 = NRi[i2] >= 0 && CPX[NRi[i2]] > 0 ? NRi[i2] : i2;
        const x0 = LWX[i], z0 = LWZ[i], x1 = LWX[i1], z1 = LWZ[i1], x2 = LWX[i2], z2 = LWZ[i2], x3 = LWX[i3], z3 = LWZ[i3];
        const y0 = CYa[i], y1 = CYa[i1], y2 = CYa[i2], y3 = CYa[i3], b1 = CBa[i1], b2 = CBa[i2], b3 = CBa[i3], k1 = CKa[i1], k2 = CKa[i2], k3 = CKa[i3];
        for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) {
          const q = a * m + c, uu = (a + .5 + (hsh(i, q) - .5) * .8) / m, vv = (c + .5 + (hsh(i + 5171, q) - .5) * .8) / m;
          const w0 = (1 - uu) * (1 - vv), w1 = uu * (1 - vv), w2 = (1 - uu) * vv, w3 = uu * vv;
          const X = x0 * w0 + x1 * w1 + x2 * w2 + x3 * w3, Z = z0 * w0 + z1 * w1 + z2 * w2 + z3 * w3, Y = y0 * w0 + y1 * w1 + y2 * w2 + y3 * w3;
          const dx = X - e0, dy = Y - e1, dz = Z - e2, z2c = dx * f0 + dy * f1 + dz * f2;
          if (z2c < near) continue;
          const px = cx + F * (dx * r0x + dy * r1x + dz * r2x) / z2c, py = cy - F * (dx * u0 + dy * u1 + dz * u2) / z2c;
          if (px < 0 || py < 0 || px >= 1920 || py >= 1080) continue;
          const kk = k * w0 + k1 * w1 + k2 * w2 + k3 * w3, bb = (b * w0 + b1 * w1 + b2 * w2 + b3 * w3) * (.95 + .55 * hsh(q, i + 99)) * a0 * (.5 + .5 * gain);
          pb.dot(px, py, z2c < 2200 ? 2 : 1, WH[0] + LR0 * kk, WH[1] + LG0 * kk, WH[2] + LB0 * kk, bb > 1 ? 1 : bb);
        }
        if (!LD[i]) continue;
      }
      if (sx < -60 || sy < -60 || sx >= 1980 || sy >= 1140) continue;
      if (k > .4) pb.add(sx, sy, 3, LIME[0], LIME[1], LIME[2], .05 * k * a0);
      if (LD[i]) {
        // over the CFAR threshold: a stalk from the sea surface
        const dx = LWX[i] - e0, dz = LWZ[i] - e2, zb = dx * f0 - e1 * f1 + dz * f2;
        if (zb > near) pb.dline(cx + F * (dx * r0x - e1 * r1x + dz * r2x) / zb, cy - F * (dx * u0 - e1 * u1 + dz * u2) / zb, sx, sy, 2.5, 1, cr, cg, cb, b * .55 * a0);
        pb.dot(sx, sy, 2, cr, cg, cb, Math.min(1, b * 1.1 * a0));
        continue;
      }
      pb.dot(sx, sy, zc < BIG ? 2 : 1, cr, cg, cb, Math.min(1, b * a0 * gain));
    }
    // land relief, lit by the beam as it passes
    const la = o.land * a0;
    if (la > .01) for (let i = 0; i < NG; i++) {
      const dx = GX[i] - e0, dy = GY[i] - e1, dz = GZ[i] - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      let d = ph - GA[i]; d -= Math.floor(d / TAU) * TAU;
      if (!live(GA[i], d)) continue;
      const k = d < .6 ? Math.exp(-d * 6) : 0;
      pb.dot(sx, sy, zc < 1500 ? 2 : 1, WH[0] + LR0 * k, WH[1] + LG0 * k, WH[2] + LB0 * k, (GB[i] * (1 + .6 * Math.exp(-d * 1.2)) + k * .4) * la);
    }
    // map: coast, rings, bearing ticks
    const ma = o.map * a0;
    if (ma > .01) for (let i = 0; i < NMP; i++) {
      const kind = MP[i * 3 + 2];
      const dx = MP[i * 3] * 1000 - e0, dy = 2 - e1, dz = MP[i * 3 + 1] * 1000 - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      pb.dot(sx, sy, zc < 2500 ? 2 : 1, WH[0], WH[1], WH[2], (kind === 0 ? .5 : kind === 2 ? .4 : .22) * ma);
    }
    // ship returns (TRK 21's may be dressed by the hit stage through PD.scopeContact)
    const cm = PD.scopeContact ? PD.scopeContact(o.T, tau) : null;
    for (let j = 0; j < SH.length; j++) {
      const p = PD.shipKm(j, tau), az = Math.atan2(p[0], p[1]);
      const s0 = Math.floor((ph - az) / TAU);
      for (const s of [s0, s0 - 1]) {
        const r = shipRet(j, s), d = ph - r.ph; if (d < 0 || d > TAU * 1.02) continue;
        if (r.t < shF || r.t >= hdF) continue;
        const glow = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1, k = d < .6 ? Math.exp(-d * 7) : 0, Dt = r.dots;
        const cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
        const c = j === 0 && cm ? cm : null, hM = c ? c.hMul : 1, bM = c ? c.bMul : 1, keep = c ? c.keep : 1;
        const fade = d > TAU ? 1 - (d - TAU) / (TAU * .02) : 1;
        for (let q = 0; q < Dt.length; q += 4) {
          if (keep < 1 && hsh(q, s + 11) > keep) continue;
          const y = Dt[q + 2] * hk * rise * (.45 + .55 * glow) * hM, on = Dt[q + 3] > 0;
          const dx = Dt[q] - e0, dy = y - e1, dz = Dt[q + 1] - e2, zc = dx * f0 + dy * f1 + dz * f2;
          if (zc < near) continue;
          const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
          let b = Math.abs(Dt[q + 3]) * (.36 + .64 * glow);
          if (on) {
            b = Math.max(b, .55 + .45 * glow);
            const zb = dx * f0 - e1 * f1 + dz * f2;
            if (zb > near) pb.dline(cx + F * (dx * r0x - e1 * r1x + dz * r2x) / zb, cy - F * (dx * u0 - e1 * u1 + dz * u2) / zb, sx, sy, 2.5, 1, cr, cg, cb, Math.min(1, b * bM) * .55 * a0 * o.ships * fade);
          }
          pb.dot(sx, sy, 2, cr, cg, cb, Math.min(1, b * bM) * a0 * o.ships * fade);
        }
      }
    }
    // beam: lime leading edge on the sea + a thin sheet of light above it
    const ba = o.beam * a0;
    if (ba > .01) {
      const bx = Math.sin(ph), bz = Math.cos(ph);
      for (let r = 400; r < RMAX * 1000;) {
        const x = bx * r, z = bz * r, dx = x - e0, dy = 2 - e1, dz = z - e2;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz), step = Math.max(12, Math.min(300, dist * .01 + r * .004));
        const zc = dx * f0 + dy * f1 + dz * f2, fa = ba * (1 - .45 * r / (RMAX * 1000));
        if (zc > near && shoreKm(x / 1000, z / 1000) > 0) {
          const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
          pb.dot(sx, sy, 2, LIME[0], LIME[1], LIME[2], fa);
          pb.add(sx, sy, 7, LIME[0], LIME[1], LIME[2], .018 * fa);
        }
        if (r > 1500) {
          const H = 160 * Math.pow(r / 10000, .6) * 6 * (hk / 20), nh = Math.max(3, Math.min(40, Math.round(H / Math.max(20, dist * .01))));
          for (let j = 1; j <= nh; j++) {
            const fj = j / nh; if (hsh((r / 7) | 0, j) > .6 - fj * .38) continue;
            const ddy = fj * H - e1, z2 = dx * f0 + ddy * f1 + dz * f2; if (z2 < near) continue;
            pb.dot(cx + F * (dx * r0x + ddy * r1x + dz * r2x) / z2, cy - F * (dx * u0 + ddy * u1 + dz * u2) / z2, 1, LIME[0], LIME[1], LIME[2], ba * .55 * (1 - fj * .85) * (1 - .5 * r / (RMAX * 1000)));
          }
        }
        r += step;
      }
    }
    // hostile tracks: ellipse, update ring, history, velocity leader, tag
    if (o.tracks > .01) {
      const ta = o.tracks * a0;
      for (let j = 0; j < SH.length; j++) {
        const tr = PD.trackAt(j, tau), sh = SH[j];
        const cp = cam.project([tr.x * 1000, 30, tr.z * 1000]); if (!cp) continue;
        const ux = tr.x / tr.r, uz = tr.z / tr.r, A = Math.max(.12, tr.r * SB * 1.3), B = .09;
        const pxkm = F / cp[2] * 1000, n = Math.round(E.clamp(TAU * A * pxkm / 5.5, 18, 120));
        let rx = -1e9, ry = null;
        const ring = (g, al, sz) => { for (let k = 0; k < n; k++) { const th = k / n * TAU, ca = Math.cos(th), sa = Math.sin(th); const wx = tr.x + (uz * ca * A + ux * sa * B) * g, wz = tr.z + (-ux * ca * A + uz * sa * B) * g; const q = cam.project([wx * 1000, 30, wz * 1000]); if (!q) continue; pb.dot(q[0], q[1], sz, WH[0], WH[1], WH[2], al); if (g === 1 && q[0] - q[1] * .25 > rx) { rx = q[0] - q[1] * .25; ry = q; } } };
        ring(1, ta * .9, 1);
        if (tr.age < .7) { const g = 1 + E.outCubic(tr.age / .7) * 1.4; ring(g, (1 - tr.age / .7) * ta * .8, 1); }
        pb.dot(cp[0], cp[1], 3, WH[0], WH[1], WH[2], ta);
        let prev = null;
        for (let k = 8; k >= 1; k--) {
          const h = upd(j, tr.s - k), q = cam.project([h.x * 1000, 20, h.z * 1000]); if (!q) { prev = null; continue; }
          const al = ta * (.25 + .6 * (8 - k) / 8);
          pb.dot(q[0], q[1], 2, WH[0], WH[1], WH[2], al);
          if (prev) pb.dline(prev[0], prev[1], q[0], q[1], 3, 1, WH[0], WH[1], WH[2], al * .6);
          prev = q;
        }
        const v = cam.project([(tr.x + VKM[0] * 240) * 1000, 20, (tr.z + VKM[1] * 240) * 1000]);
        if (v) pb.dline(cp[0], cp[1], v[0], v[1], 3, 1, WH[0], WH[1], WH[2], .55 * ta);
        if (ry) tags.push({ key: 'trk' + sh.id, id: 'TRK ' + sh.id, txt: sh.cls, cls: 'coral sm', ax: ry[0], ay: ry[1], x: ry[0] + 16, y: ry[1] - 30, a: ta * (o.tagA === undefined ? 1 : o.tagA), pri: j === 0 ? 3 : 1, ship: j });
      }
    }
    // own tracks: the raid (datalink, smooth), lime ring, trail from the scope's edge, velocity leader
    const oa = (o.own || 0) * a0;
    if (oa > .01) {
      const RO = {};
      let lead = null;
      for (let k = 0; k < 4; k++) {
        PD.round(k, tau, RO);
        const rk = Math.hypot(RO.p[0], RO.p[2]) / 1000, inA = E.ss(RMAX + .2, RMAX - 1.2, rk) * RO.a * oa;
        if (inA < .01) continue;
        const cp = cam.project([RO.p[0], 25, RO.p[2]]); if (!cp) continue;
        // trail: one dot per half second back to where it came over the edge
        const TR = {};
        let prev = null;
        for (let j = 1; j < 90; j++) {
          const tp = Math.min(tau, PD.tauStop(k)) - j * .5; PD.round(k, tp, TR);
          if (Math.hypot(TR.p[0], TR.p[2]) > PD.RMAX) break;
          const q = cam.project([TR.p[0], 25, TR.p[2]]); if (!q) break;
          const al = inA * (.2 + .7 * Math.exp(-j / 30));
          pb.dot(q[0], q[1], j % 4 ? 1 : 2, LIME[0], LIME[1], LIME[2], al);
          if (prev && j % 4 === 0) pb.dline(prev[0], prev[1], q[0], q[1], 3, 1, LIME[0], LIME[1], LIME[2], al * .5);
          if (j % 4 === 0) prev = q;
        }
        for (let q = 0; q < 20; q++) { const th = q / 20 * TAU; pb.dot(cp[0] + Math.cos(th) * 7, cp[1] + Math.sin(th) * 7, 1, LIME[0], LIME[1], LIME[2], inA); }
        pb.dot(cp[0], cp[1], 3, LIME[0], LIME[1], LIME[2], inA);
        const v = cam.project([RO.p[0] + RO.dir[0] * 10000, 25, RO.p[2] + RO.dir[2] * 10000]);
        if (v && !RO.stopped) pb.dline(cp[0], cp[1], v[0], v[1], 3, 1, LIME[0], LIME[1], LIME[2], .55 * inA);
        if (k === 3) lead = { cp, a: inA, d: RO.d };
      }
      if (lead) tags.push({ key: 'raid', id: 'OWN 1–4', txt: '3M55 Oniks', v: 'M2.0', cls: 'lime', ax: lead.cp[0] + 6, ay: lead.cp[1] + 6, x: lead.cp[0] + 20, y: lead.cp[1] + 14, a: lead.a * (o.tagA === undefined ? 1 : o.tagA), pri: 5, down: true });
    }
    return { tags };
  };
  PD.scopeInfo = { NL, NG, NMP };
  PD.shipRet = shipRet;
})();
