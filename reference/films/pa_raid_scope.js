/* THE PICTURE: the Monolith-B 3D clutter scope (from the Clutter menu).
   Sea lattice of range x azimuth resolution cells, sea clutter ~R^-3 / R^-7 with wind rows
   and spikes, the squall's rain returns, ship and helicopter returns, CA-CFAR detections and a
   CV Kalman tracker with existence probability. The tracker is simulated once at load and
   stored as per-track event tables; render(tau) only looks them up, so every frame is a pure
   function of sim time. Internal units km (radar at the origin), drawn in world metres. */
(function () {
  const { E, rng, fbm, gauss } = M3;
  const PA = window.PA, DEG = PA.DEG, TAU = PA.TAU, hsh = PA.hsh;
  const RMAX = 64, OMEGA = PA.OMEGA;
  const RHOR = 18, WIND = -28 * DEG, ALPHA = 8.2, BW = 1.1 * DEG, SR = .22, SB = .6 * DEG;
  const SX = PA.SITE.x, SZ = PA.SITE.z;
  const hKm = (x, z) => PA.hAt(SX + x * 1000, SZ + z * 1000);
  const r0 = rng(2402);
  const phase = PA.phase;

  function clutMean(r, az) {
    const g = r < RHOR ? Math.pow(RHOR / r, 3) : Math.pow(RHOR / r, 7);
    return 6.3 * g * (.3 + .7 * Math.pow(.5 + .5 * Math.cos(az - WIND), 2));
  }
  function surfAt(x, z) {
    for (const d of [.3, .8, 1.8]) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; if (hKm(x + Math.sin(a) * d, z + Math.cos(a) * d) > 0) return 420 * Math.exp(-d / .9); }
    return 0;
  }

  /* ---------- sea lattice ---------- */
  const AZA = -94 * DEG, DAZ = .8 * DEG, NAZ = Math.round(188 / .8);
  const rstep = r => .07 + r * .022;
  const A = { x: [], z: [], a: [], r: [], c: [], k: [], o: [], p: [], rs: [] }, BIN = [];
  for (let k = 0; k < NAZ; k++) {
    const azc = AZA + (k + .5) * DAZ, i0 = A.x.length;
    for (let r = .5; r < RMAX; r += rstep(r)) {
      const az = azc + (r0() - .5) * DAZ * .7, rr = r + (r0() - .5) * rstep(r) * .6;
      const x = Math.sin(az) * rr, z = Math.cos(az) * rr, hh = hKm(x, z);
      if (hh > -3) continue;
      const u = x * Math.sin(WIND) + z * Math.cos(WIND), v = x * Math.cos(WIND) - z * Math.sin(WIND);
      const tex = Math.exp(1.4 * fbm(u * .14, v * .7, 3.7, 3) - .25);
      const c = (clutMean(rr, az) + (hh > -40 ? surfAt(x, z) : 0)) * tex;
      A.x.push(x); A.z.push(z); A.a.push(az); A.r.push(rr); A.c.push(c); A.rs.push(rstep(rr));
      A.k.push(TAU * u / 2.2); A.o.push(Math.floor(r0() * 3)); A.p.push(.00008 * Math.min(1, c / 20));
    }
    BIN.push([i0, A.x.length, azc - DAZ / 2, azc + DAZ / 2]);
  }
  const NL = A.x.length;
  const LX = new Float32Array(A.x), LZ = new Float32Array(A.z), LA = new Float32Array(A.a), LR = new Float32Array(A.r), LC = new Float32Array(A.c);
  const LK = new Float32Array(A.k), LO = new Int8Array(A.o), LP = new Float32Array(A.p), LRS = new Float32Array(A.rs);
  const LWX = new Float64Array(NL), LWZ = new Float64Array(NL);
  for (let i = 0; i < NL; i++) { LWX[i] = SX + LX[i] * 1000; LWZ[i] = SZ + LZ[i] * 1000; }
  /* cells the squall can reach during the film */
  const RAINABLE = new Uint8Array(NL);
  { const c0 = PA.SQ.at(-120), c1 = PA.SQ.at(140);
    for (let i = 0; i < NL; i++) { const x = LX[i], z = LZ[i];
      const t = E.clamp(((x - c0[0]) * (c1[0] - c0[0]) + (z - c0[1]) * (c1[1] - c0[1])) / ((c1[0] - c0[0]) ** 2 + (c1[1] - c0[1]) ** 2), 0, 1);
      if (Math.hypot(x - (c0[0] + (c1[0] - c0[0]) * t), z - (c0[1] + (c1[1] - c0[1]) * t)) < 5.2) RAINABLE[i] = 1; } }
  /* the sim time at which sweep s paints bearing b */
  const tauOf = (b, s) => (b + s * TAU - PA.PH0) / OMEGA;
  /* rain return (noise units) of a cell in sweep s */
  function rainC(i, s) {
    if (!RAINABLE[i]) return 0;
    const q = PA.rain(LX[i], LZ[i], tauOf(LA[i], s));
    return q > 0 ? Math.pow(10, 5 * q) - 1 : 0;
  }
  /* one cell's return power for sweep s; negative = over the CFAR threshold */
  let lastRc = 0;
  function cellP(i, s) {
    const rc = lastRc = rainC(i, s);
    const c = LC[i] * (1 + .45 * Math.sin(LK[i] + s * 1.3)) + rc;
    const spike = hsh(i, Math.floor((s + LO[i]) / 3) * 7 + 3) < LP[i] + (rc > 30 ? .0022 : 0) ? 14 : 1;
    const P = -Math.log(hsh(i, s * 2 + 1)) + c * spike * -Math.log(hsh(i, s * 2 + 2));
    return P / (1 + c) > ALPHA ? -P : P;
  }
  const bright = P => E.clamp((4.343 * Math.log(P) + 14) / 40, .16, 1);
  const dbOf = P => Math.max(0, 4.343 * Math.log(P) - 2);
  const LS = new Int32Array(NL).fill(-999999), LB = new Float32Array(NL), LY = new Float32Array(NL), LD = new Uint8Array(NL), LRN = new Float32Array(NL);
  function paintCell(i, s) {
    const P = cellP(i, s), a = Math.abs(P);
    LS[i] = s; LB[i] = bright(a); LY[i] = dbOf(a) + (P < 0 ? 12 : 0); LD[i] = P < 0 ? 1 : 0; LRN[i] = lastRc;
  }

  /* ---------- rain cores: small convective cells in the squall, drifting with it; they
     print track-like detections for a few sweeps and then die ---------- */
  const CORES = [];
  { const rc = rng(515);
    for (let k = 0; k < 7; k++) CORES.push({ t0: -110 + k * 34 + rc() * 12, life: 18 + rc() * 16, off: [(rc() - .5) * 3.6, (rc() - .5) * 2.8], v: [(rc() - .5) * .006, (rc() - .5) * .006] }); }
  function coreDets(s) {
    const out = [];
    CORES.forEach((c, k) => {
      const sq = PA.SQ.at(0), x0 = sq[0] + c.off[0], z0 = sq[1] + c.off[1];
      let t = tauOf(Math.atan2(x0, z0), s); if (t < c.t0 || t > c.t0 + c.life) return;
      const ctr = PA.SQ.at(t), x = ctr[0] + c.off[0] + c.v[0] * (t - c.t0), z = ctr[1] + c.off[1] + c.v[1] * (t - c.t0);
      const age = (t - c.t0) / c.life, pd = Math.sin(Math.PI * age) * .95;
      if (hsh(7000 + k, s) < pd) out.push({ x: x + (hsh(k, s * 3) - .5) * .18, z: z + (hsh(k, s * 3 + 1) - .5) * .18, az: Math.atan2(x, z), pass: s, core: k });
    });
    return out;
  }

  /* ---------- ship / helicopter returns ---------- */
  const SH = PA.SHIPS;
  function attDb(x, z, tau) {
    // two-way attenuation through the squall along the line of sight (heavy rain, ~4 dB/km)
    let a = 0; const n = 16;
    for (let k = 1; k <= n; k++) { const f = k / n; a += PA.rain(x * f, z * f, tau); }
    return -6 * a * Math.hypot(x, z) / n;
  }
  const retCache = SH.map(() => new Map());
  /* probe: detection probability of truth j at sim time t (same model as shipRet) */
  PA.pdAt = function (j, t) {
    const p = PA.shipKm(j, t), az = Math.atan2(p[0], p[1]), rg = Math.hypot(p[0], p[1]), q = PA.rain(p[0], p[1], t);
    const att = attDb(p[0], p[1], t), snr = SH[j].rcs - 40 * Math.log10(rg / 30) - 14 + att;
    const c = clutMean(rg, az) + (q > 0 ? Math.pow(10, 5 * q) - 1 : 0);
    return Math.exp(-ALPHA / (1 + Math.pow(10, snr / 10) / (1 + c)));
  };
  /* the return of truth j on sweep s: dots (x, z, dB, bright*sign) and the detection, if any */
  function shipRet(j, s) {
    const cache = retCache[j]; let r = cache.get(s);
    if (r) return r;
    const sh = SH[j];
    let p = PA.shipKm(j, 0), t = tauOf(Math.atan2(p[0], p[1]), s);
    for (let it = 0; it < 3; it++) { p = PA.shipKm(j, t); let az = Math.atan2(p[0], p[1]); t = tauOf(az, s); }
    p = PA.shipKm(j, t);
    const az = Math.atan2(p[0], p[1]), rg = Math.hypot(p[0], p[1]), rr = rng(7919 * (j + 1) + s * 31);
    const rain = PA.rain(p[0], p[1], t) > 0 || attDb(p[0], p[1], t) < -.1;
    const att = rain ? attDb(p[0], p[1], t) : 0;
    const snr = sh.rcs - 40 * Math.log10(rg / 30) - 14 + att;
    let c = clutMean(rg, az) + (rain ? Math.pow(10, 5 * PA.rain(p[0], p[1], t)) - 1 : 0);
    if (sh.helo) c = c * 1e-4 + (hKm(p[0], p[1]) > 0 ? 0 : 0);            // MTI: the clutter does not move, the helicopter does
    const scr = Math.pow(10, snr / 10) / (1 + c);
    const Pd = Math.exp(-ALPHA / (1 + scr)), det = hsh(900 + j, s) < Pd;
    const ux = Math.sin(az), uz = Math.cos(az), cross = rg * BW / 2.4, Lv = sh.L * 4;
    const dots = [], n = Math.round(E.clamp(6 + 1.1 * snr, 6, 40)), S = Math.pow(10, snr / 10);
    const hd = sh.helo ? [0, 0] : sh.d;
    let wx = 0, wz = 0, ws = 0;
    for (let k = 0; k < n; k++) {
      const al = (rr() - .5) * Lv, cr = gauss(rr) * cross, rgn = gauss(rr) * .05;
      const x = p[0] + hd[0] * al + uz * cr + ux * rgn, z = p[1] + hd[1] * al - ux * cr + uz * rgn;
      const P = S * Math.exp(-.5 * (cr / cross) ** 2) * -Math.log(rr()) - Math.log(rr()) + c * -Math.log(rr()), db = 4.343 * Math.log(P);
      if (db < 2) continue;
      const on = det && P / (1 + c) > ALPHA;
      // an airborne return is drawn at the helicopter's own scale, not as a 40 dB sea pillar
      dots.push(x, z, sh.helo ? Math.min(10, dbOf(P)) + (on ? 3 : 0) : dbOf(P) + (on ? 12 : 0), bright(P) * (on ? 1 : -1));
      if (on) { wx += x * P; wz += z * P; ws += P; }
    }
    r = { t, ph: az + s * TAU, dots, det: null };
    if (det && ws > 0) {
      const gc = gauss(rr) * rg * SB * .6, gr = gauss(rr) * SR * .5;
      r.det = { x: wx / ws + gc * uz + gr * ux, z: wz / ws - gc * ux + gr * uz, az, pass: s, rcs: sh.rcs + att + 4.343 * Math.log(-Math.log(rr())) + 2.5, ship: j };
    }
    cache.set(s, r);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    return r;
  }

  /* ---------- tracker (simulated once) ---------- */
  function Rmeas(x, z) {
    const r = Math.hypot(x, z), b = Math.atan2(x, z), ux = Math.sin(b), uz = Math.cos(b), a = SR * SR, c = (r * SB) ** 2;
    return [a * ux * ux + c * uz * uz, (a - c) * ux * uz, a * uz * uz + c * ux * ux];
  }
  function kfPred(tr, ts) {
    const dt = ts - tr.t, x = tr.x, P = tr.P, q = tr.q, d2 = dt * dt, d3 = d2 * dt;
    const xp = [x[0] + x[2] * dt, x[1] + x[3] * dt, x[2], x[3]];
    const FP = new Array(16);
    for (let c = 0; c < 4; c++) { FP[c] = P[c] + dt * P[8 + c]; FP[4 + c] = P[4 + c] + dt * P[12 + c]; FP[8 + c] = P[8 + c]; FP[12 + c] = P[12 + c]; }
    const Pp = new Array(16);
    for (let r = 0; r < 4; r++) { Pp[r * 4] = FP[r * 4] + dt * FP[r * 4 + 2]; Pp[r * 4 + 1] = FP[r * 4 + 1] + dt * FP[r * 4 + 3]; Pp[r * 4 + 2] = FP[r * 4 + 2]; Pp[r * 4 + 3] = FP[r * 4 + 3]; }
    Pp[0] += q * d3 / 3; Pp[5] += q * d3 / 3; Pp[2] += q * d2 / 2; Pp[8] += q * d2 / 2; Pp[7] += q * d2 / 2; Pp[13] += q * d2 / 2; Pp[10] += q * dt; Pp[15] += q * dt;
    return { x: xp, P: Pp };
  }
  function kfGate(pr, z, Rm) {
    const P = pr.P, S00 = P[0] + Rm[0], S01 = P[1] + Rm[1], S11 = P[5] + Rm[2], det = S00 * S11 - S01 * S01;
    const i00 = S11 / det, i01 = -S01 / det, i11 = S00 / det, n0 = z[0] - pr.x[0], n1 = z[1] - pr.x[1];
    return { d2: n0 * (i00 * n0 + i01 * n1) + n1 * (i01 * n0 + i11 * n1), det, i00, i01, i11, n0, n1 };
  }
  function kfUpd(pr, g) {
    const P = pr.P, K = [];
    for (let r = 0; r < 4; r++) { const a = P[r * 4], b = P[r * 4 + 1]; K.push(a * g.i00 + b * g.i01, a * g.i01 + b * g.i11); }
    const x = pr.x.map((v, r) => v + K[r * 2] * g.n0 + K[r * 2 + 1] * g.n1);
    const Pn = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) Pn[r * 4 + c] = P[r * 4 + c] - K[r * 2] * P[c] - K[r * 2 + 1] * P[4 + c];
    return { x, P: Pn };
  }
  const logit = p => Math.log(p / (1 - p)), sigm = l => 1 / (1 + Math.exp(-l));
  function faDensity(r, az) {
    const c = clutMean(r, az), cell = rstep(r) * r * DAZ;
    return (Math.exp(-ALPHA) + .0003 * Math.min(1, c / 20) * .6) / Math.max(.02, cell);
  }
  const CLS = [[51, 'CVN'], [40, 'DDG'], [33, 'AK'], [21, 'FAC']];
  function classify(tr) {
    if (Math.hypot(tr.x[2], tr.x[3]) > .03) return ['HELO', .97];
    const rcs = tr.rcs;
    const lp = CLS.map(([m]) => rcs.reduce((s, v) => s - (v - m) ** 2 / (2 * 5.6 * 5.6), 0)), mx = Math.max(...lp);
    const w = lp.map(v => Math.exp(v - mx)), sw = w.reduce((a, b) => a + b, 0), k = lp.indexOf(mx);
    return [CLS[k][1], w[k] / sw];
  }
  const TRACKS = [];                     // every track ever: {id, ship, ev: [snapshots]}
  let freeId = 0;
  const snap = (tr, ts) => {
    const tgt = sigm(tr.lg);
    const prev = tr.ev[tr.ev.length - 1];
    const pS = prev ? prev.tgt + (prev.pS - prev.tgt) * Math.exp(-5 * (ts - prev.t)) : .22;
    const [cl, pc] = tr.rcs.length >= 3 ? classify(tr) : [null, 0];
    tr.ev.push({ t: ts, x: tr.x.slice(), P: tr.P.slice(), q: tr.q, lg: tr.lg, tgt, pS, st: tr.st, hits: tr.hits, hist: tr.hist.map(h => h.slice()), tHit: tr.tHit, Pold: tr.Pold, pass: tr.pass, tDrop: tr.tDrop, cl, pc });
  };
  {
    const live = [], cands = [];
    const T0 = -118, T1 = PA.TJ + 2, DT = 1 / 60;
    const faBySweep = new Map(); let faCur = 0;
    let ph = phase(T0);
    const inSweep = (ph0, ph1, b) => { const m = Math.floor((ph0 - b) / TAU) + 1; return b + m * TAU <= ph1 ? m : null; };
    const binHit = (ph0, ph1, a0, a1) => { const m = Math.floor((ph0 - a1) / TAU) + 1; return a0 + m * TAU <= ph1; };
    for (let ts = T0 + DT; ts <= T1; ts += DT) {
      const ph0 = ph, ph1 = phase(ts); ph = ph1;
      const dets = [];
      for (const [i0, i1, a0, a1] of BIN) {
        if (!binHit(ph0, ph1, a0, a1)) continue;
        for (let i = i0; i < i1; i++) { const s = inSweep(ph0, ph1, LA[i]); if (s === null) continue; paintCell(i, s); if (LD[i]) dets.push({ x: LX[i], z: LZ[i], az: LA[i], pass: s }); }
      }
      SH.forEach((sh, j) => {
        const p = PA.shipKm(j, ts), s = inSweep(ph0, ph1, Math.atan2(p[0], p[1])); if (s === null) return;
        const r = shipRet(j, s); if (r.det) dets.push(r.det);
      });
      { const s0 = Math.floor((ph0 - PA.SQ.c0[0] * 0) / TAU), s = inSweep(ph0, ph1, Math.atan2(PA.SQ.at(ts)[0], PA.SQ.at(ts)[1]));
        if (s !== null) for (const d of coreDets(s)) dets.push(d); }
      dets.sort((a, b) => a.az - b.az);
      for (const d of dets) {
        let best = null, bg = null, bp = null;
        for (const tr of live) {
          if (tr.st === 'drop' || tr.pass === d.pass) continue;
          const pr = kfPred(tr, ts), g = kfGate(pr, [d.x, d.z], Rmeas(d.x, d.z));
          if (g.d2 < 16 && (!bg || g.d2 < bg.d2)) { best = tr; bg = g; bp = pr; }
        }
        if (best) {
          const u = kfUpd(bp, bg);
          best.Pold = [bp.P[0], bp.P[1], bp.P[5]]; best.tHit = ts;
          best.x = u.x; best.P = u.P; best.t = ts; best.pass = d.pass; best.hits++;
          const r = Math.hypot(d.x, d.z), N = Math.exp(-bg.d2 / 2) / (TAU * Math.sqrt(bg.det)), L = .85 * N / faDensity(r, Math.atan2(d.x, d.z));
          best.lg = Math.min(4.6, best.lg + E.clamp(.1 * Math.log(L), .15, 1.05));
          if (d.rcs !== undefined) best.rcs.push(d.rcs);
          best.hist.push([u.x[0], u.x[1]]); if (best.hist.length > 12) best.hist.shift();
          if (best.st === 'tent' && sigm(best.lg) >= .8) best.st = 'conf';
          if (best.st !== 'conf') faCur++;
          snap(best, ts); continue;
        }
        faCur++;
        const r = Math.hypot(d.x, d.z), gate = .5 + .012 * r;
        if (r > 37) continue;                       // automatic track initiation inside 37 km only
        const ci = cands.findIndex(c => c.pass === d.pass - 1 && Math.hypot(c.x - d.x, c.z - d.z) < gate + (c.ship !== undefined && c.ship === d.ship && SH[d.ship].helo ? .5 : 0));
        if (ci >= 0) {
          const cand = cands[ci]; cands.splice(ci, 1);
          const Rm = Rmeas(d.x, d.z), dtc = ts - cand.ts;
          let vx = (d.x - cand.x) / dtc, vz = (d.z - cand.z) / dtc; const sp = Math.hypot(vx, vz); if (sp > .09) { vx *= .09 / sp; vz *= .09 / sp; }
          const fast = sp > .03;
          const P = [Rm[0], Rm[1], 0, 0, Rm[1], Rm[2], 0, 0, 0, 0, fast ? .002 : .0007, 0, 0, 0, 0, fast ? .002 : .0007];
          const ship = d.ship !== undefined ? d.ship : cand.ship;
          const id = ship !== undefined ? SH[ship].id : 31 + (freeId++ % 19);
          const tr = { id, ship, x: [d.x, d.z, vx, vz], P, q: fast ? 3e-5 : 1.5e-6, fast, t: ts, lg: logit(.22), st: 'tent', hits: 2, rcs: [], hist: [[cand.x, cand.z], [d.x, d.z]], tHit: ts, Pold: null, pass: d.pass, tDrop: null, born: ts, ev: [] };
          if (d.rcs !== undefined) tr.rcs.push(d.rcs);
          live.push(tr); TRACKS.push(tr); snap(tr, ts);
        } else cands.push({ x: d.x, z: d.z, ts, pass: d.pass, ship: d.ship });
      }
      for (let k = cands.length - 1; k >= 0; k--) if (ts - cands[k].ts > PA.ROT * 1.6 + .1) cands.splice(k, 1);
      for (const tr of live) {
        if (tr.st === 'drop') continue;
        const pr = kfPred(tr, ts), b = Math.atan2(pr.x[0], pr.x[1]) + 3 * DEG, s = inSweep(ph0, ph1, b);
        if (s !== null && tr.pass !== s) {
          tr.lg -= .95; tr.pass = null;
          const p = sigm(tr.lg);
          if ((tr.st === 'tent' && p < .1) || (tr.st === 'conf' && p < .2)) { tr.st = 'drop'; tr.tDrop = ts; }
          snap(tr, ts);
        }
      }
      for (let k = live.length - 1; k >= 0; k--) if (live[k].st === 'drop') live.splice(k, 1);
      if (Math.floor(ph1 / TAU) > Math.floor(ph0 / TAU)) { faBySweep.set(Math.floor(ph1 / TAU), faCur); faCur = 0; }
    }
    PA.faBySweep = faBySweep;
  }
  for (const tr of TRACKS) { tr.t0 = tr.ev[0].t; tr.t1 = tr.tDrop !== null && tr.tDrop !== undefined ? tr.tDrop + 3.2 : 1e9; }
  const lastEv = (tr, ts) => { const ev = tr.ev; if (ts < ev[0].t) return null; let lo = 0, hi = ev.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ev[m].t <= ts) lo = m; else hi = m - 1; } return ev[lo]; };

  /* public: the tracker picture at sim time tau */
  PA.tracksAt = function (tau) {
    const out = [];
    for (const tr of TRACKS) {
      if (tau < tr.t0 || tau > tr.t1) continue;
      const e = lastEv(tr, tau); if (!e) continue;
      const pr = kfPred(e, tau);
      const pS = e.tgt + (e.pS - e.tgt) * Math.exp(-5 * (tau - e.t));
      out.push({ tr, e, pr, pS, st: e.st, id: tr.id, ship: tr.ship, born: tr.t0 });
    }
    return out;
  };
  PA.Rmeas = Rmeas;
  PA.TRACKS = TRACKS;
  PA.sweepNo = tau => 139 + Math.floor(phase(tau) / TAU);

  /* ---------- land relief (display), the local patch around the site, map ---------- */
  const G = { x: [], y: [], z: [], b: [], a: [], l: [] };
  const shadeKm = (x, z) => { const e = .6, dx = hKm(x + e, z) - hKm(x - e, z), dz = hKm(x, z + e) - hKm(x, z - e); const nx = -dx * 4 / 1000 / (2 * e), nz = -dz * 4 / 1000 / (2 * e), l = Math.hypot(nx, 1, nz); return Math.max(0, (-.5 * nx + .75 - .45 * nz) / l); };
  /* level 0: coarse relief everywhere; level 1: coarse points near the site (fade out up close);
     level 2: the radar's own terrain returns near the site, fine (fade in up close) */
  for (let z = -12; z < 3; z += .42) for (let x = -60; x < 70; x += .42 + Math.abs(x) * .012) {
    const px = x + (r0() - .5) * .35, pz = z + (r0() - .5) * .35;
    const h = hKm(px, pz); if (h <= 0) continue;
    G.x.push(SX + px * 1000); G.y.push(h * PA.VE); G.z.push(SZ + pz * 1000); G.b.push(.1 + .3 * shadeKm(px, pz) + .08 * r0()); G.a.push(Math.atan2(px, pz)); G.l.push(Math.hypot(px, pz) < 3.2 ? 1 : 0);
  }
  for (let z = -3.2; z < 3.2; z += .03) for (let x = -3.2; x < 3.2; x += .03) {
    const px = x + (r0() - .5) * .026, pz = z + (r0() - .5) * .026, d = Math.hypot(px, pz);
    if (d > 3.2 || r0() > .35 + .65 * E.ss(3.2, .3, d)) continue;
    const h = hKm(px, pz); if (h <= 0) continue;
    G.x.push(SX + px * 1000); G.y.push(h * PA.VE); G.z.push(SZ + pz * 1000); G.b.push(.1 + .3 * shadeKm(px, pz) + .08 * r0()); G.a.push(Math.atan2(px, pz)); G.l.push(2);
  }
  // level 3: right around the site, 12 m, for the pass low over the array
  for (let z = -1.4; z < 1.4; z += .012) for (let x = -1.4; x < 1.4; x += .012) {
    const px = x + (r0() - .5) * .011, pz = z + (r0() - .5) * .011; if (Math.hypot(px, pz) > 1.4) continue;
    const h = hKm(px, pz); if (h <= 0) continue;
    G.x.push(SX + px * 1000); G.y.push(h * PA.VE); G.z.push(SZ + pz * 1000); G.b.push(.1 + .3 * shadeKm(px, pz) + .08 * r0()); G.a.push(Math.atan2(px, pz)); G.l.push(3);
  }
  const NG = G.x.length;
  const GXw = new Float64Array(G.x), GYw = new Float32Array(G.y), GZw = new Float64Array(G.z), GB = new Float32Array(G.b), GA = new Float32Array(G.a), GL = new Uint8Array(G.l);

  /* lattice neighbours for the near-field surface: next cell out in range, nearest cell in the next bin */
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
  const CYa = new Float32Array(NL), CBa = new Float32Array(NL), CKa = new Float32Array(NL), CPX = new Float32Array(NL), SXa = new Float32Array(NL), SYa = new Float32Array(NL);

  const MAP = [];
  for (const line of THEATRE.contours['0']) for (let k = 0; k < line.length - 1; k++) {
    const a = line[k], b = line[k + 1], ax = a[0] - SX / 1000, az = a[1] - SZ / 1000, bx = b[0] - SX / 1000, bz = b[1] - SZ / 1000;
    if (az < -20 || Math.abs(ax) > 90 || Math.hypot(bx - ax, bz - az) > 6) continue;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / .18));
    for (let j = 0; j < n; j++) MAP.push(ax + (bx - ax) * j / n, az + (bz - az) * j / n, az > 25 ? 6 : 0);
  }
  const RINGS = [16, 32, 48, 64];
  for (const rr of RINGS) for (let a = -92; a <= 92; a += rr === RMAX ? .2 : .32) { const x = Math.sin(a * DEG) * rr, z = Math.cos(a * DEG) * rr; if (hKm(x, z) < 0) MAP.push(x, z, rr === RMAX ? 2 : 1); }
  for (let rr = 2; rr < 32; rr += 2) if (rr % 16) for (let a = -92; a <= 92; a += 16 / rr * .45) { const x = Math.sin(a * DEG) * rr, z = Math.cos(a * DEG) * rr; if (hKm(x, z) < 0) MAP.push(x, z, 5); }
  for (let a = -80; a <= 80; a += 10) for (let d = .2; d < 1.6; d += .2) MAP.push(Math.sin(a * DEG) * (RMAX + d), Math.cos(a * DEG) * (RMAX + d), 3);
  const MP = new Float32Array(MAP), NMP = MP.length / 3;
  const MPW = new Float64Array(NMP * 2); for (let i = 0; i < NMP; i++) { MPW[i * 2] = SX + MP[i * 3] * 1000; MPW[i * 2 + 1] = SZ + MP[i * 3 + 1] * 1000; }
  PA.RINGS = RINGS;

  function ellipse(cxz, P, k) {
    const a = P[0], b = P[1], c = P[2], m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    const l1 = Math.max(1e-6, m + d), l2 = Math.max(1e-6, m - d), th = .5 * Math.atan2(2 * b, a - c);
    return { c: cxz, A: Math.sqrt(l1) * k, B: Math.sqrt(l2) * k, e1: [Math.cos(th), Math.sin(th)], e2: [-Math.sin(th), Math.cos(th)] };
  }
  PA.ellipse = ellipse;

  /* ---------- render ----------
     o: { a: scope alpha, hk: display metres per dB, land, map, beam, tracks, lod (near cells as patches),
          tagMin: only tag tracks this close to the camera or conf, near: skip cells this close to the eye } */
  PA.scope = function (pb, cam, tau, o) {
    const a0 = o.a; if (a0 <= .003) return { tags: [] };
    const hk = o.hk;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const e0 = e[0], e1 = e[1], e2 = e[2], f0 = f[0], f1 = f[1], f2 = f[2], r0x = ru[0], r1x = ru[1], r2x = ru[2], u0 = u[0], u1 = u[1], u2 = u[2];
    const ph = phase(tau);
    const LIME = PA.LIME, WH = PA.WH;
    const LR0 = LIME[0] - WH[0], LG0 = LIME[1] - WH[1], LB0 = LIME[2] - WH[2];
    const near = o.near || 1, lod = o.lod || 0;
    const skyFade = o.fadeFar || 0;
    // sea cells: pass 1 evaluates every cell (height, brightness, lime, screen position)
    const surf = lod ? 1 : 0;
    for (let i = 0; i < NL; i++) {
      let d = ph - LA[i]; const s = Math.floor(d / TAU); d -= s * TAU;
      if (LS[i] !== s) paintCell(i, s);
      const glow = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1;
      const y = LY[i] * hk * rise * (.45 + .55 * glow);
      let b = LB[i] * (.4 + .9 * glow) * (1 + .3 * LR[i] / RMAX);
      const k = d < .6 ? Math.exp(-d * 7) : 0;
      if (k) b = Math.max(b, k * .7);
      if (LD[i]) b = Math.max(b, .5 + .5 * glow);
      CYa[i] = y; CBa[i] = b; CKa[i] = k; CPX[i] = -1;
      const x = LWX[i], z = LWZ[i], dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      SXa[i] = sx; SYa[i] = sy; CPX[i] = zc;
    }
    // pass 2: far cells as single dots, near cells as a continuous surface, bilinear between
    // neighbouring cells, subdivided by the quad's projected size
    for (let i = 0; i < NL; i++) {
      const zc = CPX[i]; if (zc < 0) continue;
      const sx = SXa[i], sy = SYa[i];
      const k = CKa[i], b = CBa[i], cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
      if (LRN[i] > 6) {
        // rain: volume returns fill the cell from the sea up to its displayed level, a curtain
        const cs = LRS[i] * 1000, wd = LR[i] * 1000 * DAZ, sz = F * Math.sqrt(cs * wd) / zc, n = Math.min(26, Math.max(4, Math.round(sz * sz / 40 + 4)));
        const ca = Math.cos(LA[i]), sa = Math.sin(LA[i]), yT = CYa[i];
        for (let q = 0; q < n; q++) {
          const h1 = hsh(i, q + 300), h2 = hsh(i + 911, q), h3 = hsh(q, i + 17);
          const ur = (h1 - .5) * cs, uw = (h2 - .5) * wd, X = LWX[i] + sa * ur + ca * uw, Z = LWZ[i] + ca * ur - sa * uw, Y = yT * h3;
          const dx = X - e0, dy = Y - e1, dz = Z - e2, z2c = dx * f0 + dy * f1 + dz * f2;
          if (z2c < near) continue;
          pb.dot(cx + F * (dx * r0x + dy * r1x + dz * r2x) / z2c, cy - F * (dx * u0 + dy * u1 + dz * u2) / z2c, 1, cr, cg, cb, b * a0 * (.22 + .5 * h3));
        }
      }
      let m = 1;
      const i1 = NRi[i], i2 = NAi[i];
      if (surf && i1 >= 0 && i2 >= 0 && CPX[i1] > 0 && CPX[i2] > 0 && sx > -400 && sx < 2320 && sy > -400 && sy < 1480) {
        const ax = SXa[i1] - sx, ay = SYa[i1] - sy, bx2 = SXa[i2] - sx, by2 = SYa[i2] - sy, area = Math.abs(ax * by2 - ay * bx2);
        m = Math.min(9, Math.round(Math.sqrt(area) / 6.5));
      }
      if (m >= 2) {
        const i3 = NRi[i2] >= 0 && CPX[NRi[i2]] > 0 ? NRi[i2] : i2;
        const x0 = LWX[i], z0 = LWZ[i], x1 = LWX[i1], z1 = LWZ[i1], x2 = LWX[i2], z2 = LWZ[i2], x3 = LWX[i3], z3 = LWZ[i3];
        const y0 = CYa[i], y1 = CYa[i1], y2 = CYa[i2], y3 = CYa[i3], b0 = b, b1 = CBa[i1], b2 = CBa[i2], b3 = CBa[i3], k0 = k, k1 = CKa[i1], k2 = CKa[i2], k3 = CKa[i3];
        for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) {
          const q = a * m + c, u = (a + .5 + (hsh(i, q) - .5) * .8) / m, v = (c + .5 + (hsh(i + 5171, q) - .5) * .8) / m;
          const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = (1 - u) * v, w3 = u * v;
          const X = x0 * w0 + x1 * w1 + x2 * w2 + x3 * w3, Z = z0 * w0 + z1 * w1 + z2 * w2 + z3 * w3, Y = y0 * w0 + y1 * w1 + y2 * w2 + y3 * w3;
          const dx = X - e0, dy = Y - e1, dz = Z - e2, z2c = dx * f0 + dy * f1 + dz * f2;
          if (z2c < near) continue;
          const px = cx + F * (dx * r0x + dy * r1x + dz * r2x) / z2c, py = cy - F * (dx * u0 + dy * u1 + dz * u2) / z2c;
          if (px < 0 || py < 0 || px >= 1920 || py >= 1080) continue;
          const kk = k0 * w0 + k1 * w1 + k2 * w2 + k3 * w3, bb = (b0 * w0 + b1 * w1 + b2 * w2 + b3 * w3) * (.95 + .55 * hsh(q, i + 99)) * a0;
          pb.dot(px, py, z2c < 2200 ? 2 : 1, WH[0] + LR0 * kk, WH[1] + LG0 * kk, WH[2] + LB0 * kk, bb > 1 ? 1 : bb);
        }
        if (!LD[i]) continue;
      }
      if (sx < -60 || sy < -60 || sx >= 1980 || sy >= 1140) continue;
      if (k > .4) pb.add(sx, sy, 3, LIME[0], LIME[1], LIME[2], .05 * k * a0);
      if (LD[i]) {
        // over the CFAR threshold: a stalk from the sea surface
        const x = LWX[i], z = LWZ[i], dx = x - e0, dz = z - e2, zb = dx * f0 - e1 * f1 + dz * f2;
        if (zb > near) pb.dline(cx + F * (dx * r0x - e1 * r1x + dz * r2x) / zb, cy - F * (dx * u0 - e1 * u1 + dz * u2) / zb, sx, sy, 2.5, 1, cr, cg, cb, b * .55 * a0);
        pb.dot(sx, sy, 2, cr, cg, cb, Math.min(1, b * 1.1 * a0));
        continue;
      }
      pb.dot(sx, sy, zc < 36000 ? 2 : 1, cr, cg, cb, Math.min(1, b * a0));
    }
    // land relief, lit by the beam as it passes; the fine patch only up close
    const la = o.land * a0;
    const dSite = Math.hypot(e0 - SX, e2 - SZ, e1 - PA.PADY), fineA = E.ss(9000, 3500, dSite), vfA = E.ss(1600, 500, dSite);
    if (la > .01) for (let i = 0; i < NG; i++) {
      const lv = GL[i], lw = lv === 0 ? 1 : lv === 1 ? 1 - fineA : lv === 2 ? fineA : vfA;
      if (lw < .01) continue;
      const x = GXw[i], y = GYw[i], z = GZw[i], dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      let d = ph - GA[i]; d -= Math.floor(d / TAU) * TAU;
      const k = d < .6 ? Math.exp(-d * 6) : 0;
      const b = (GB[i] * (1 + .6 * Math.exp(-d * 1.2)) * (lv >= 2 ? 1.7 : 1) + k * .4) * la * lw;
      pb.dot(sx, sy, zc < 1500 ? 2 : 1, WH[0] + LR0 * k, WH[1] + LG0 * k, WH[2] + LB0 * k, b);
    }
    // map: coast, rings, ticks
    const ma = o.map * a0;
    if (ma > .01) for (let i = 0; i < NMP; i++) {
      const kind = MP[i * 3 + 2];
      if (kind === 5 && o.fine < .02) continue;
      const x = MPW[i * 2], z = MPW[i * 2 + 1], dx = x - e0, dy = 2 - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      const al = kind === 0 ? .5 : kind === 2 ? .38 : kind === 5 ? .3 * o.fine : kind === 6 ? .16 : .22;
      pb.dot(sx, sy, zc < 2500 && kind !== 5 ? 2 : 1, WH[0], WH[1], WH[2], al * ma);
    }
    // ship and helicopter returns
    for (let j = 0; j < SH.length; j++) {
      if (o.skip && o.skip.includes(j)) continue;
      const p = PA.shipKm(j, tau), az = Math.atan2(p[0], p[1]);
      const s = Math.floor((ph - az) / TAU); if (s < -99999) continue;
      const r = shipRet(j, s), d = ph - r.ph; if (d < 0 || d > TAU * 1.5) continue;
      const glow = Math.exp(-d * .75), rise = d < .5 ? 1 - Math.exp(-d * 16) : 1, k = d < .6 ? Math.exp(-d * 7) : 0, D = r.dots;
      const cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
      for (let q = 0; q < D.length; q += 4) {
        const y = D[q + 2] * hk * rise * (.45 + .55 * glow), on = D[q + 3] > 0;
        const x = SX + D[q] * 1000, z = SZ + D[q + 1] * 1000, dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
        if (zc < near) continue;
        const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
        let b = Math.abs(D[q + 3]) * (.36 + .64 * glow);
        if (on) {
          b = Math.max(b, .55 + .45 * glow);
          const zb = dx * f0 - e1 * f1 + dz * f2;
          if (zb > near) pb.dline(cx + F * (dx * r0x - e1 * r1x + dz * r2x) / zb, cy - F * (dx * u0 - e1 * u1 + dz * u2) / zb, sx, sy, 2.5, 1, cr, cg, cb, b * .55 * a0 * o.ships);
        }
        pb.dot(sx, sy, 2, cr, cg, cb, Math.min(1, b) * a0 * o.ships);
      }
    }
    // beam: lime leading edge on the sea + a thin sheet of light above it, sampled finer near the eye
    const ba = o.beam * a0;
    if (ba > .01) {
      const bx = Math.sin(ph), bz = Math.cos(ph), top = o.beamTop || 1;
      for (let r = 300; r < RMAX * 1000;) {
        const x = SX + bx * r, z = SZ + bz * r, dx = x - e0, dy = 2 - e1, dz = z - e2;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const step = Math.max(12, Math.min(260, dist * .012 + r * .004));
        const zc = dx * f0 + dy * f1 + dz * f2;
        const fa = ba * (1 - .45 * r / (RMAX * 1000));
        if (zc > near) {
          const sx = cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
          pb.dot(sx, sy, 2, LIME[0], LIME[1], LIME[2], fa);
          pb.add(sx, sy, 7, LIME[0], LIME[1], LIME[2], .018 * fa);
        }
        if (r > 1500) {
          const H = 160 * Math.pow(r / 10000, .6) * 6 * top, nh = Math.max(3, Math.min(40, Math.round(H / Math.max(20, dist * .01))));
          for (let j = 1; j <= nh; j++) {
            const fj = j / nh; if (hsh((r / 7) | 0, j) > .6 - fj * .38) continue;
            const hy = fj * H, ddy = hy - e1, z2 = dx * f0 + ddy * f1 + dz * f2; if (z2 < near) continue;
            pb.dot(cx + F * (dx * r0x + ddy * r1x + dz * r2x) / z2, cy - F * (dx * u0 + ddy * u1 + dz * u2) / z2, 1, LIME[0], LIME[1], LIME[2], ba * .55 * (1 - fj * .85) * (1 - .5 * r / (RMAX * 1000)));
          }
        }
        r += step;
      }
    }
    // close to the site: the fan beam leaving the array face (elevation ~ -2..+14 deg, 1.1 deg wide)
    const na = (o.arrayBeam || 0) * a0;
    if (na > .01) {
      const A = PA.ARRAY, bx = Math.sin(ph), bz = Math.cos(ph), cxv = Math.cos(ph), czv = -Math.sin(ph);
      for (let r = 3; r < 2400;) {
        const step = Math.max(1.2, r * .018);
        const lo = -r * Math.tan(2 * DEG), hi = r * Math.tan(14 * DEG), nh = Math.max(2, Math.min(34, Math.round((hi - lo) / Math.max(1.5, r * .02))));
        for (let j = 0; j <= nh; j++) {
          const fj = j / nh, hy = A[1] + lo + (hi - lo) * fj;
          if (hy < PA.gy(A[0] + bx * r, A[2] + bz * r) + 1) continue;
          if (j && j < nh && hsh((r * 13) | 0, j) > .5 - .3 * fj) continue;
          const wid = (hsh(j, (r * 7) | 0) - .5) * r * BW;
          const x = A[0] + bx * r + cxv * wid, z = A[2] + bz * r + czv * wid, dx = x - e0, dy = hy - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
          if (zc < near) continue;
          const edge = j === 0 || j === nh ? 1 : .55 * (1 - fj * .7);
          pb.dot(cx + F * (dx * r0x + dy * r1x + dz * r2x) / zc, cy - F * (dx * u0 + dy * u1 + dz * u2) / zc, zc < 120 ? 2 : 1, LIME[0], LIME[1], LIME[2], na * edge * (1 - r / 2600));
        }
        r += step;
      }
    }
    // tracks
    const tags = [];
    if (o.tracks > .01) {
      const ta = o.tracks * a0;
      for (const T of PA.tracksAt(tau)) {
        const { tr, e: ev, pr, st } = T;
        if (o.skip && tr.ship !== undefined && o.skip.includes(tr.ship)) continue;
        const conf = st === 'conf', drop = st === 'drop';
        const ageHit = tau - ev.tHit, sh = E.outCubic(E.sat(ageHit / .55));
        const Rm = Rmeas(pr.x[0], pr.x[1]);
        let Pp = [pr.P[0], pr.P[1], pr.P[5]];
        if (ev.Pold && sh < 1) Pp = Pp.map((v, k) => v + (ev.Pold[k] - v) * (1 - sh));
        const el = ellipse([pr.x[0], pr.x[1]], [Pp[0] + Rm[0], Pp[1] + Rm[1], Pp[2] + Rm[2]], 3.5);
        const col = conf ? LIME : WH, fl = 1 - sh;
        const da = drop ? 1 - E.sat((tau - ev.tDrop) / 1.4) : 1, spread = drop ? 1 + 1.5 * E.sat((tau - ev.tDrop) / 1.4) : 1;
        const born = E.sat((tau - T.born) / .5);
        const cw = PA.kmW(pr.x[0], pr.x[1]);
        const cp = cam.project([cw[0], 0, cw[1]]); if (!cp) continue;
        const pxkm = F / cp[2] * 1000, n = Math.round(E.clamp(TAU * el.A * pxkm / 5.5, 18, 160));
        let rx = -1e9, ry = null;
        for (let k = 0; k < n; k++) {
          const aa = k / n * TAU, ca = Math.cos(aa), sa = Math.sin(aa), jit = drop ? (hsh(tr.id * 131 + k, 5) - .5) * (spread - 1) * .8 : 0;
          const wx = el.c[0] + (el.e1[0] * ca * el.A + el.e2[0] * sa * el.B) * (spread + jit), wz = el.c[1] + (el.e1[1] * ca * el.A + el.e2[1] * sa * el.B) * (spread + jit);
          const q = cam.project([SX + wx * 1000, 30, SZ + wz * 1000]); if (!q) continue;
          if (k % 2 === 0 || !drop) pb.dot(q[0], q[1], conf ? 2 : 1 + (fl > .3 ? 1 : 0), col[0], col[1], col[2], ta * born * da * Math.min(1, (conf ? .95 : .7) + fl * .5));
          if (q[0] - q[1] * .25 > rx) { rx = q[0] - q[1] * .25; ry = q; }
        }
        if (!drop && ageHit < .7) {
          const g = 1 + E.outCubic(ageHit / .7) * 1.4, al = (1 - ageHit / .7) * born * ta;
          for (let k = 0; k < 56; k++) {
            const th = k / 56 * TAU, ca = Math.cos(th), sa = Math.sin(th);
            const q = cam.project([SX + (el.c[0] + (el.e1[0] * ca * el.A + el.e2[0] * sa * el.B) * g) * 1000, 30, SZ + (el.c[1] + (el.e1[1] * ca * el.A + el.e2[1] * sa * el.B) * g) * 1000]);
            if (q) pb.dot(q[0], q[1], 1, LIME[0], LIME[1], LIME[2], al * .8);
          }
        }
        if (!drop) {
          pb.dot(cp[0], cp[1], 3, col[0], col[1], col[2], born * ta);
          let prev = null;
          ev.hist.forEach((hp, k) => {
            const q = cam.project([SX + hp[0] * 1000, 20, SZ + hp[1] * 1000]); if (!q) return;
            const al = born * ta * (.25 + .6 * k / ev.hist.length);
            pb.dot(q[0], q[1], 2, col[0], col[1], col[2], al);
            if (prev) pb.dline(prev[0], prev[1], q[0], q[1], 3, 1, col[0], col[1], col[2], al * .6);
            prev = q;
          });
          if (conf) { const v = cam.project([SX + (pr.x[0] + pr.x[2] * 60) * 1000, 20, SZ + (pr.x[1] + pr.x[3] * 60) * 1000]); if (v) pb.dline(cp[0], cp[1], v[0], v[1], 3, 1, col[0], col[1], col[2], .55 * ta); }
        }
        let txt;
        if (drop) txt = 'dropped';
        else if (ev.cl) txt = `${ev.cl}${ev.pc < .93 ? '?' : ''} · p ${T.pS.toFixed(2)}`;
        else txt = `p ${T.pS.toFixed(2)}`;
        const tAl = born * (drop ? 1 - E.sat((tau - ev.tDrop - 1.9) / 1.1) : 1) * ta;
        if (ry) tags.push({ key: 'trk' + tr.id + '_' + tr.t0.toFixed(1), id: 'TRK ' + String(tr.id).padStart(2, '0'), txt, cls: conf ? 'lime' : drop ? 'drop' : 'sm', ax: ry[0], ay: ry[1], x: ry[0] + 16, y: ry[1] - 30, a: tAl, pri: conf ? 2 : 1, ship: tr.ship, dist: cp[2], conf });
      }
    }
    return { tags };
  };
  PA.scopeInfo = { NL, NG, NMP };  PA.shipRet = shipRet;
})();
