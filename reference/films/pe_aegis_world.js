/* AEGIS (Point Cloud, defence P2): the shared world. The own ship's frame is the world frame: the DDG-51 sits
   at the origin, bow +Z (north), starboard +X (east), steaming at VS through a sea that flows aft. The group
   keeps station around it, the aircraft fly closed orbits, the raid and the interceptors fly paths integrated
   once at load. Everything is a pure function of film time T, and everything alive at the loop seam is
   periodic in D (the sea, the sweep, the orbits), so T = D is T = 0. */
(function () {
  const { V, R, X, E, rng } = M3;
  const PE = window.PE = {};
  const DEG = Math.PI / 180, TAU = Math.PI * 2;
  const D = 165;
  Object.assign(PE, { DEG, TAU, D, LIME: [198, 244, 50], WH: [238, 238, 228], CORAL: [255, 106, 61] });

  PE.hsh = function (a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  };
  const hsh = PE.hsh;
  PE.gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
  const gH = PE.gH;
  PE.win = (T, a, b, c, d) => E.ss(a, b, T) * (1 - E.ss(c, d, T));
  PE.lerpK = (T, ks) => { if (T <= ks[0][0]) return ks[0][1]; for (let i = 0; i < ks.length - 1; i++) if (T < ks[i + 1][0]) { const u = E.ss(ks[i][0], ks[i + 1][0], T); return ks[i][1] + (ks[i + 1][1] - ks[i][1]) * u; } return ks[ks.length - 1][1]; };
  PE.logK = (T, ks) => Math.exp(PE.lerpK(T, ks.map(k => [k[0], Math.log(k[1])])));
  const pol = (bDeg, r, y) => [Math.sin(bDeg * DEG) * r, y || 0, Math.cos(bDeg * DEG) * r];
  PE.pol = pol;

  /* ---------- own ship ---------- */
  PE.VS = 8;                                         // m/s (15.5 kn); VS * D = 1320 m = 110 sea cells of 12 m
  const A = HD.destroyer.A;
  PE.A = A;
  /* the four SPY-1D(V) faces: centre, normal, in-face horizontal and up axes */
  PE.FACES = A.spy.map((c, k) => {
    const n = V.norm(A.spyN[k]), h = V.norm(V.cross([0, 1, 0], n)), u = V.cross(n, h);
    return { c, n, h, u, brg: Math.atan2(n[0], n[2]) };
  });
  PE.FACE0 = PE.FACES[0];                            // starboard forward: it looks at the raid

  /* ---------- SPY search: each face sweeps its 90° sector clockwise in PS seconds with an electronic flyback,
     so the four beams read as four arms 90° apart turning at 90°/PS. Every bearing is painted every PS. ---------- */
  PE.PS = 2.5;
  PE.NS = Math.round(D / PE.PS);                     // 66 paints per film: the per-paint noise repeats exactly
  PE.TH0 = .31;
  PE.arm = T => PE.TH0 + T / PE.PS * (TAU / 4);      // unwrapped bearing of arm 0 (rad, clockwise from the bow)
  /* seconds since bearing b was last painted */
  PE.since = (T, b) => { const q = (PE.arm(T) - b) / (TAU / 4); return (q - Math.floor(q)) * PE.PS; };
  /* index of the last paint of bearing b (unwrapped) and the film time of paint j */
  PE.paintIdx = (T, b) => Math.floor((PE.arm(T) - b) / (TAU / 4));
  PE.paintT = (j, b) => ((j * TAU / 4 + b) - PE.TH0) / (TAU / 4) * PE.PS;
  /* steering of face 0's beam off its normal (rad, -45°..45°) */
  PE.face0Steer = T => { let a = PE.arm(T) - PE.FACE0.brg + TAU / 8; a -= Math.floor(a / (TAU / 4)) * (TAU / 4); return a - TAU / 8; };

  /* ---------- the group (station-keeping: fixed in our frame, a slow wander periodic in D) ---------- */
  PE.GROUP = [
    { key: 'cvn', id: '02', label: 'CVN · Nimitz class', model: 'carrier', p: pol(214, 4300), hdg: 0, L: 333, B: 77, own: true, rcs: 52 },
    { key: 'ddg2', id: '03', label: 'DDG · Arleigh Burke', model: 'destroyer', p: pol(318, 6600), hdg: 0, L: 155, B: 20, own: true, rcs: 42 },
    { key: 'ak', id: '31', label: 'Merchant', model: null, p: pol(104, 17400), hdg: 0, L: 180, B: 28, own: false, rcs: 44 },
    { key: 'fv', id: '32', label: 'Fishing vessel', model: null, p: pol(283, 23800), hdg: 0, L: 30, B: 8, own: false, rcs: 26 },
  ];
  PE.GROUP.forEach((g, k) => {
    g.at = T => {
      const w = TAU * T / D;
      return [g.p[0] + 60 * Math.sin(w + k * 1.7), 0, g.p[2] + 45 * Math.sin(2 * w + k)];
    };
  });

  /* ---------- aircraft: closed orbits, one or two laps per film ---------- */
  function orbit(c, r, alt, laps, ph, cw) {
    const w = TAU * laps / D * (cw ? 1 : -1);
    const at = T => { const a = ph + w * T; return [c[0] + Math.sin(a) * r, alt, c[2] + Math.cos(a) * r]; };
    const vel = T => { const a = ph + w * T; return [Math.cos(a) * r * w, 0, -Math.sin(a) * r * w]; };
    return { at, vel, speed: Math.abs(w) * r, r, alt, c };
  }
  PE.AIR = [
    { key: 'helo', id: '06', label: 'MH-60R', ...orbit([0, 0, 0], 1700, 120, 1, 3.3, true) },
    { key: 'cap1', id: '11', label: 'F/A-18E', ...orbit(pol(342, 21000), 5250, 7600, 1, .6, false) },
    { key: 'cap2', id: '12', label: 'F/A-18E', ...orbit(pol(342, 21000), 5250, 7300, 1, .6 - .09, false) },
    { key: 'awacs', id: '14', label: 'E-2D', ...orbit(pol(150, 24000), 3950, 8500, 1, 2.2, true) },
  ];

  /* ---------- the raid: six P-800 rounds, low over the sea at Mach 2, from the starboard bow ----------
     TA: the time a round would reach the ship; each is stopped (interceptor, or the Phalanx) before. */
  const VR = PE.VR = 700;
  const RDET = PE.RDET = 32300;                      // radar horizon: SPY face ~22 m, round ~10 m
  PE.RAID = [
    { id: 41, brg: 52.0, TA: 98.0, alt: 9.5 },
    { id: 42, brg: 61.0, TA: 99.0, alt: 11 },
    { id: 43, brg: 56.5, TA: 101.0, alt: 8.5 },
    { id: 44, brg: 66.0, TA: 103.5, alt: 10 },
    { id: 45, brg: 58.5, TA: 101.69, alt: 9, weave: true },
    { id: 46, brg: 48.5, TA: 104.0, alt: 10.5 },
  ];
  /* weave: +-120 m, 5 s period, from 12.5 km in, straightening over the last 2.5 km */
  const weaveOf = (k, r) => {
    const q = PE.RAID[k]; if (!q.weave) return 0;
    const on = E.ss(12500, 11000, r) * E.ss(1800, 3200, r);
    return 120 * on * Math.sin(TAU * (12500 - r) / 3500);
  };
  /* truth of round k at film time T (no stop applied) */
  PE.roundTruth = function (k, T, out) {
    const q = PE.RAID[k], r = VR * (q.TA - T), b = q.brg * DEG, s = Math.sin(b), c = Math.cos(b), w = weaveOf(k, r);
    out = out || [0, 0, 0];
    out[0] = s * r + c * w; out[1] = q.alt + .8 * Math.sin(T * 1.9 + k * 2.1); out[2] = c * r - s * w;
    return out;
  };
  PE.roundRange = (k, T) => VR * (PE.RAID[k].TA - T);
  PE.roundVel = k => { const b = PE.RAID[k].brg * DEG; return [-Math.sin(b) * VR, 0, -Math.cos(b) * VR]; };

  /* ---------- interceptors: six SM-6 from the Mk 41 cells, and the Phalanx for the leaker ---------- */
  PE.SHOTS = [
    { id: 'S1', cell: 3, tL: 61.6, rnd: 0, tI: 77.0 },
    { id: 'S2', cell: 38, tL: 62.5, rnd: 1, tI: 78.2 },
    { id: 'S3', cell: 14, tL: 63.6, rnd: 2, tI: 79.6 },
    { id: 'S4', cell: 45, tL: 64.8, rnd: 3, tI: 81.2 },
    { id: 'S5', cell: 60, tL: 77.2, rnd: 4, tI: 88.0, miss: true },
    { id: 'S6', cell: 22, tL: 78.1, rnd: 5, tI: 88.8 },
  ];
  PE.T_CIWS0 = 97.9;                                 // the Phalanx opens fire on round 45 (~2.6 km)
  PE.T_CIWS = 101.0;                                 // and stops it ~480 m out
  /* when each round stops, and by what */
  PE.RAID.forEach((q, k) => { q.tStop = Infinity; q.by = null; });
  for (const s of PE.SHOTS) if (!s.miss) { PE.RAID[s.rnd].tStop = s.tI; PE.RAID[s.rnd].by = s.id; }
  PE.RAID[4].tStop = PE.T_CIWS; PE.RAID[4].by = 'CIWS';

  /* interceptor flight: vertical boost off the cell, a lofted arc, the dive onto the meeting point.
     A cubic path, arc-length tabled, flown with a boost-then-coast speed law scaled to the flight time. */
  const NP = 480;
  for (const s of PE.SHOTS) {
    const P0 = A.vls(s.cell); P0[1] += .6;
    const P3 = PE.roundTruth(s.rnd, s.tI);
    if (s.miss) {
      // aimed at where the round would be without its weave, 80 m up: it passes ~125 m off and flies on
      const q = PE.RAID[s.rnd], r = VR * (q.TA - s.tI), b = q.brg * DEG;
      P3[0] = Math.sin(b) * r; P3[2] = Math.cos(b) * r; P3[1] = q.alt + 80;
    }
    const hz = Math.hypot(P3[0] - P0[0], P3[2] - P0[2]), dir = [(P3[0] - P0[0]) / hz, 0, (P3[2] - P0[2]) / hz];
    const loft = 560 + hz * .07;
    const P1 = [P0[0], P0[1] + loft * .75, P0[2]];
    // the miss comes in on a shallow 9° glide, so it can pull out over the sea after the pass
    const P2 = s.miss ? [P0[0] + dir[0] * hz * .64, P3[1] + hz * .36 * Math.tan(9 * DEG), P0[2] + dir[2] * hz * .64]
      : [P0[0] + dir[0] * hz * .58, loft * 1.55, P0[2] + dir[2] * hz * .58];
    const pts = new Float64Array((NP + 1) * 3), S = new Float64Array(NP + 1);
    for (let i = 0; i <= NP; i++) {
      const u = i / NP, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
      for (let j = 0; j < 3; j++) pts[i * 3 + j] = a * P0[j] + b * P1[j] + c * P2[j] + d * P3[j];
      if (i) S[i] = S[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
    }
    const L = S[NP], dur = s.tI - s.tL;
    const v0 = t => (1 - Math.exp(-t / 1.35)) * (1 - .018 * t);   // boost, then a slow coast-down
    const NT = 600, ST = new Float64Array(NT + 1);
    for (let i = 1; i <= NT; i++) { const t0 = (i - 1) / NT * dur, t1 = i / NT * dur; ST[i] = ST[i - 1] + (v0(t0) + v0(t1)) * .5 * (t1 - t0); }
    const k = L / ST[NT];
    s.P0 = P0; s.P3 = P3; s.L = L; s.dur = dur; s.pts = pts; s.S = S; s.ST = ST; s.NT = NT; s.vmax = k; s.dir = dir;
    // after the meeting point a miss flies on along its last tangent for 1.6 s, then ends
    const tx = pts[NP * 3] - pts[NP * 3 - 3], ty = pts[NP * 3 + 1] - pts[NP * 3 - 2], tz = pts[NP * 3 + 2] - pts[NP * 3 - 1], tl = Math.hypot(tx, ty, tz);
    s.tan = [tx / tl, ty / tl, tz / tl];
    s.vEnd = k * v0(dur);
    s.tEnd = s.miss ? s.tI + 1.6 : s.tI;
    s.vAvg = L / dur;
    if (s.miss) {
      // past the round it pulls out of the glide at ~25 g (turn radius v²/a) into a 3° climb: a table every 8 m
      const hl = Math.hypot(s.tan[0], s.tan[2]), hx = s.tan[0] / hl, hzz = s.tan[2] / hl;
      const g0 = Math.atan2(s.tan[1], hl), g1 = 3 * DEG, Rt = s.vEnd * s.vEnd / 245, Lp = (g1 - g0) * Rt;
      const n = Math.ceil(((s.tEnd - s.tI) * s.vEnd + 400) / 8), post = new Float64Array((n + 1) * 3);
      let x = P3[0], y = P3[1], z = P3[2];
      post[0] = x; post[1] = y; post[2] = z;
      for (let i = 1; i <= n; i++) {
        const g = g0 + (g1 - g0) * Math.min(1, (i - .5) * 8 / Lp);
        x += hx * Math.cos(g) * 8; y += Math.sin(g) * 8; z += hzz * Math.cos(g) * 8;
        post[i * 3] = x; post[i * 3 + 1] = y; post[i * 3 + 2] = z;
      }
      s.post = post; s.postN = n;
    }
  }
  /* arc length flown by shot s at film time T */
  function shotS(s, T) {
    const t = E.clamp(T - s.tL, 0, s.dur), x = t / s.dur * s.NT, i = Math.min(s.NT - 1, Math.floor(x));
    return (s.ST[i] + (s.ST[i + 1] - s.ST[i]) * (x - i)) * s.vmax;
  }
  function pathAt(s, sl, out) {
    const S = s.S; let lo = 0, hi = NP;
    if (sl >= S[NP]) {
      const x = sl - S[NP];
      if (s.post) {
        const f = Math.min(s.postN - 1e-6, x / 8), i = Math.floor(f), u = f - i, P = s.post;
        for (let j = 0; j < 3; j++) out[j] = P[i * 3 + j] + (P[i * 3 + 3 + j] - P[i * 3 + j]) * u;
        return out;
      }
      out[0] = s.pts[NP * 3] + s.tan[0] * x; out[1] = s.pts[NP * 3 + 1] + s.tan[1] * x; out[2] = s.pts[NP * 3 + 2] + s.tan[2] * x; return out;
    }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= sl) lo = m; else hi = m; }
    const u = (sl - S[lo]) / (S[hi] - S[lo] || 1);
    for (let j = 0; j < 3; j++) out[j] = s.pts[lo * 3 + j] + (s.pts[hi * 3 + j] - s.pts[lo * 3 + j]) * u;
    return out;
  }
  /* position of shot s at film time T (null before launch / after it ends) */
  PE.shotAt = function (s, T, out) {
    out = out || [0, 0, 0];
    if (T < s.tL || T > s.tEnd) return null;
    if (T > s.tI) return pathAt(s, s.L + (T - s.tI) * s.vEnd, out);
    return pathAt(s, shotS(s, T), out);
  };
  PE.shotSl = (s, T) => T > s.tI ? s.L + (T - s.tI) * s.vEnd : shotS(s, T);
  PE.shotPath = pathAt;
  PE.shotSpeed = (s, T) => { const d = .05; return (PE.shotSl(s, T + d) - PE.shotSl(s, T - d)) / (2 * d); };
  /* is round k in flight (existing) at T, and is it above the radar horizon */
  PE.roundAlive = (k, T) => T < PE.RAID[k].tStop;

  /* ---------- the picture: tracks formed from the SPY paints ----------
     A raid track is born at the first paint over the horizon; each later paint shrinks its uncertainty.
     Estimate = truth + an error that jumps (eased) at each paint; the error's sigma decays look by look. */
  const LOOK_EASE = .42;
  const sigOf = (n, r) => {
    const f = Math.exp(-.72 * n);
    return [Math.max(7, 480 * f), Math.max(9, r * 1.6 * DEG * f + 9), Math.max(3, 260 * f)];   // range, cross, height (m)
  };
  PE.sigOf = sigOf;
  PE.RAID.forEach((q, k) => {
    const b = q.brg * DEG, tDet0 = q.TA - RDET / VR;
    let j = PE.paintIdx(tDet0, b) + 1;
    const looks = [];
    for (; ; j++) { const t = PE.paintT(j, b); if (t >= q.tStop) break; looks.push(t); if (looks.length > 40) break; }
    q.looks = looks; q.tDet = looks[0];
    q.los = [Math.sin(b), 0, Math.cos(b)]; q.crs = [Math.cos(b), 0, -Math.sin(b)];
  });
  /* error vector of track k at look n (m, world axes) */
  function lookErr(k, n, out) {
    const q = PE.RAID[k], t = q.looks[n], r = PE.roundRange(k, t), sg = sigOf(n, r);
    const a = gH(q.id * 97 + n, 11) * sg[0], c = gH(q.id * 97 + n, 23) * sg[1], h = gH(q.id * 97 + n, 37) * sg[2];
    out[0] = q.los[0] * a + q.crs[0] * c; out[1] = h; out[2] = q.los[2] * a + q.crs[2] * c;
    return out;
  }
  const EA = [0, 0, 0], EB = [0, 0, 0], TR = [0, 0, 0];
  /* the raid track k at T -> {p (estimate), sig [r, c, h], n (looks so far), since, age} or null */
  PE.track = function (k, T) {
    const q = PE.RAID[k];
    if (T < q.tDet || T >= q.tStop + 1.2) return null;
    let n = 0; while (n + 1 < q.looks.length && q.looks[n + 1] <= T) n++;
    const since = T - q.looks[n], u = E.outCubic(E.sat(since / LOOK_EASE));
    lookErr(k, n, EA);
    if (n > 0) lookErr(k, n - 1, EB); else { EB[0] = EA[0] * 3; EB[1] = EA[1] * 3; EB[2] = EA[2] * 3; }
    PE.roundTruth(k, Math.min(T, q.tStop), TR);
    const r = PE.roundRange(k, T), s1 = sigOf(n, r), s0 = sigOf(Math.max(0, n - 1), r);
    return {
      k, q, n, since, stopped: T >= q.tStop, age: T - q.tDet,
      p: [TR[0] + EB[0] + (EA[0] - EB[0]) * u, TR[1] + EB[1] + (EA[1] - EB[1]) * u, TR[2] + EB[2] + (EA[2] - EB[2]) * u],
      sig: [s0[0] + (s1[0] - s0[0]) * u, s0[1] + (s1[1] - s0[1]) * u, s0[2] + (s1[2] - s0[2]) * u],
      range: Math.max(0, r),
    };
  };
  /* history of estimates at each look up to T (for the trail) */
  PE.trackHist = function (k, T, out) {
    const q = PE.RAID[k]; out.length = 0;
    for (let n = 0; n < q.looks.length && q.looks[n] <= T; n++) {
      const t = q.looks[n]; lookErr(k, n, EA); PE.roundTruth(k, t, TR);
      out.push([TR[0] + EA[0], TR[1] + EA[1], TR[2] + EA[2], t]);
    }
    return out;
  };
  PE.lookErr = lookErr;

  /* ---------- events for the effect stage and the sound ---------- */
  PE.EV = {
    raidFirst: Math.min(...PE.RAID.map(q => q.tDet)), raidLast: Math.max(...PE.RAID.map(q => q.tDet)),
    launches: PE.SHOTS.map(s => ({ t: s.tL, shot: s, cell: s.cell })),
    intercepts: PE.SHOTS.map(s => ({ t: s.tI, shot: s, miss: !!s.miss, round: s.rnd, p: s.P3 })),
    ciws0: PE.T_CIWS0, ciwsKill: PE.T_CIWS,
  };
  PE.hostileAt = T => { let n = 0; PE.RAID.forEach((q, k) => { if (T >= q.tDet && T < q.tStop) n++; }); return n; };
  PE.birdsAway = T => PE.SHOTS.filter(s => T >= s.tL).length;

  /* ---------- models, sampled once ---------- */
  const DDM = HD.destroyer();
  PE.DDM = DDM;
  /* part-local points (rigid parts with xf are sampled in their own frame and moved per frame) */
  function bake(model, s, seed, st, opt) {
    return GEO.sample(model, s, seed, st || {}, opt).filter(p => p.pts.length);
  }
  PE.bake = bake;
  PE.dd = {
    coarse: bake(DDM, .85, 21, {}, { fine: false }),
    mid: bake(DDM, .42, 22, {}),
    fine: bake(DDM, .3, 23, {}),
  };
  /* dense returns around the starboard-forward SPY face, for the close-up and the pull-out */
  {
    const F = PE.FACE0, R0 = 8.5, near = [];
    for (const part of DDM.parts) {
      if (part.xf) continue;
      const prims = GEO.primsOf(part, {}).filter(pr => {
        const P = pr.p || (pr.a ? [pr.a] : null); if (!P) return false;
        return P.some(p => V.dist(p, F.c) < R0 + 8);
      });
      if (!prims.length) continue;
      near.push({ name: part.name, label: part.label, parts: [{ name: part.name, label: part.label, prims }] });
    }
    const out = [];
    near.forEach((m, i) => {
      for (const sp of GEO.sample({ parts: m.parts }, .065, 40 + i, {})) {
        const src = sp.pts, keep = [];
        for (let j = 0; j < src.length; j += 6) {
          const d = Math.hypot(src[j] - F.c[0], src[j + 1] - F.c[1], src[j + 2] - F.c[2]);
          // density tapers off towards the edge of the patch, where the ship's own sampling takes over
          if (d > 5 && hsh(j, 71 + i) > Math.pow(1 - (d - 5) / (R0 - 5), 1.5)) continue;
          if (d < R0 && !(sp.name === 'spy' && Math.abs((src[j] - F.c[0]) * F.n[0] + (src[j + 1] - F.c[1]) * F.n[1] + (src[j + 2] - F.c[2]) * F.n[2]) < .25 && Math.hypot(src[j] - F.c[0], src[j + 1] - F.c[1], src[j + 2] - F.c[2]) < 2.05)) for (let c = 0; c < 6; c++) keep.push(src[j + c]);
        }
        if (keep.length) out.push({ name: sp.name, label: sp.label, part: sp.part, pts: new Float32Array(keep) });
      }
    });
    PE.dd.near = out;
    PE.dd.nearR = R0;
  }
  /* ---------- the SPY deckhouse: an octagonal prism (01 level to 19.4 m, walls sloped in 1.3 m), as the model
     builds it. Its planes are an exact occluder for the close-up, and its three walls round face 1 are
     re-sampled densely (the model's own dots are sized for the whole ship). ---------- */
  {
    const P = [[-3.9, 31.0], [3.9, 31.0], [8.0, 26.9], [8.0, 12.2], [3.9, 8.1], [-3.9, 8.1], [-8.0, 12.2], [-8.0, 26.9]];
    const Y0 = 10.3, Y1 = 19.4, IN = 1.3;
    const inset = (P, d) => {
      const n = P.length; let A = 0;
      for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
      const sg = A > 0 ? 1 : -1, L = [];
      for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); L.push([a[0] - dz / l * sg * d, a[1] + dx / l * sg * d, dx, dz]); }
      const out = [];
      for (let i = 0; i < n; i++) { const l1 = L[(i + n - 1) % n], l2 = L[i], den = l1[2] * l2[3] - l1[3] * l2[2]; const t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / den; out.push([l1[0] + l1[2] * t, l1[1] + l1[3] * t]); }
      return out;
    };
    const TP = inset(P, IN), B = P.map(p => [p[0], Y0, p[1]]), Tt = TP.map(p => [p[0], Y1, p[1]]);
    const C = [0, (Y0 + Y1) / 2, 19.55];
    const planes = [];
    const walls = [];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      let n = V.norm(V.cross(V.sub(B[j], B[i]), V.sub(Tt[i], B[i])));
      if (V.dot(n, V.sub(B[i], C)) < 0) n = V.mul(n, -1);
      planes.push([n[0], n[1], n[2], V.dot(n, B[i])]);
      walls.push({ b0: B[i], b1: B[j], t0: Tt[i], t1: Tt[j], n });
    }
    planes.push([0, -1, 0, -Y0], [0, 1, 0, Y1]);
    PE.HOUSE = { planes, walls, B, T: Tt };
    /* dense returns on walls 0 (front), 1 (face 1) and 2 (starboard side), thinning away from the face */
    const F = PE.FACE0, pts = [], rr = rng(707), s = .033;
    const inOct = (x, y, a) => { for (let i = 0; i < 8; i++) if (x * Math.cos(i / 8 * TAU) + y * Math.sin(i / 8 * TAU) > a) return false; return true; };
    for (const wi of [0, 1, 2]) {
      const w = walls[wi], L = V.dist(w.b0, w.b1), H = V.dist(V.lerp(w.b0, w.b1, .5), V.lerp(w.t0, w.t1, .5));
      const nu = Math.round(L / s), nv = Math.round(H / s);
      for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
        const u = (a + .5 + (rr() - .5) * .7) / nu, v = (b + .5 + (rr() - .5) * .7) / nv;
        const p = V.lerp(V.lerp(w.b0, w.b1, u), V.lerp(w.t0, w.t1, u), v);
        const d = V.dist(p, F.c), keep = d < 3.2 ? 1 : Math.pow(3.2 / d, 3);
        if (rr() > keep) continue;
        // leave the face itself to the element lattice
        const q = V.sub(p, F.c), fx = V.dot(q, F.h), fy = V.dot(q, F.u);
        if (Math.abs(V.dot(q, F.n)) < .3 && inOct(fx, fy, 1.95 * Math.cos(Math.PI / 8) + .04)) continue;
        pts.push(p[0], p[1], p[2], w.n[0], w.n[1], w.n[2]);
      }
    }
    PE.dd.wall = [{ name: 'spyHouse', label: 'SPY deckhouse', part: { name: 'spyHouse' }, pts: new Float32Array(pts) }];
    // the model's own dots on those three walls are dropped from the near patch (the dense ones replace them)
    const onWall = (x, y, z) => {
      for (const wi of [0, 1, 2]) { const pl = planes[wi]; if (Math.abs(pl[0] * x + pl[1] * y + pl[2] * z - pl[3]) < .06 && y > Y0 + .05 && y < Y1 - .05) {
        const w = walls[wi], e = V.sub(w.b1, w.b0), t = ((x - w.b0[0]) * e[0] + (z - w.b0[2]) * e[2]) / (e[0] * e[0] + e[2] * e[2]); if (t > -.01 && t < 1.01) return true; } }
      return false;
    };
    const nearWall = [];
    PE.dd.near = PE.dd.near.map(sp => {
      if (sp.name !== 'super' && sp.name !== 'spy') return sp;
      const src = sp.pts, keep = [], wall = [];
      for (let j = 0; j < src.length; j += 6) { const dst = onWall(src[j], src[j + 1], src[j + 2]) ? wall : keep; for (let c = 0; c < 6; c++) dst.push(src[j + c]); }
      if (wall.length) nearWall.push(Object.assign({}, sp, { pts: new Float32Array(wall) }));
      return Object.assign({}, sp, { pts: new Float32Array(keep) });
    });
    PE.dd.nearWall = nearWall;
  }

  PE.CVM = HD.carrier();
  PE.cv = bake(PE.CVM, 1.15, 31, {}, { fine: false });
  PE.HLM = HD.helo();
  PE.helo = bake(PE.HLM, .11, 33, { rotor: 0, trotor: 0, droop: 0 });
  PE.ONM = HD.oniks();
  PE.oniks = bake(PE.ONM, .075, 35, { wing: 1, fin: 1, booster: false, cover: false });

  /* ---------- the element lattice of a SPY face: 4 350 radiating elements in a triangular grid, clipped to the
     octagon (apothem 1.80 m) ---------- */
  {
    const ap = 1.95 * Math.cos(Math.PI / 8), pts = [];
    const inOct = (x, y) => { for (let i = 0; i < 8; i++) if (x * Math.cos(i / 8 * TAU) + y * Math.sin(i / 8 * TAU) > ap) return false; return true; };
    // spacing chosen so the octagon holds ~4 350 elements
    const area = 8 * ap * ap * Math.tan(Math.PI / 8), d = Math.sqrt(area * 2 / (Math.sqrt(3) * 4350));
    for (let r = 0, y = -ap; y <= ap; y += d * Math.sqrt(3) / 2, r++) for (let x = -ap + (r & 1) * d / 2; x <= ap; x += d) if (inOct(x, y)) pts.push(x, y);
    PE.ELEM = new Float32Array(pts); PE.ELEM_D = d; PE.ELEM_AP = ap;
  }
})();
