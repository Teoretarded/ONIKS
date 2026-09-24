/* OH "Storm": one take at night in a storm at sea. The calm before; the squall line comes through (heavy swell,
   spray over the bow, rain, lightning that lights every hairline at once); the raid comes in low through the rain,
   interceptors climb into the cloud, the forward Phalanx fights, a hit forward; the next lightning shows the damage;
   the storm rolls on and the lens flies aft down the wake to the next ship in the column, in the calm before, as at
   frame 0. Stage A: timeline, camera, ships riding the sea, weather, rounds, interceptor paths, mounts, menu, log,
   captions, labels, seam. The combat effects live in oh_storm_fx.js (OHFX hooks). */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, VK, D2R, PI, TAU, DA, CB } = OH;
  const SA = OH.A, SB = OH.B;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const sm = t => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const cam = new Cam(1920, 1080), W = new Wire(cam, { fog: [1e8, 2e8], color: '#F6F5F2' });
  const HI = '#F4D23C', WH = '#F6F5F2';
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };

  /* ---------------- menu ---------------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((it, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('oh' + i)}<span class="tx">${it}</span></span><span class="go">→</span><div class="bar"></div></div>`).join('');
  STAGE.menu({ el: menuEl, blurb: document.getElementById('blurb') });

  /* ---------------- models (compiled once for the fast hairline path) ---------------- */
  const DDM = HD.destroyer(), part = n => DDM.parts.find(p => p.name === n);
  const MOVING = ['gun', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA'];
  const sub = (m, keep) => ({ parts: m.parts.filter(p => keep(p.name)) });
  const cp = (prims, fine) => FAST.compilePrims(prims, fine);
  function split(p, st) { const a = p.dyn(st), b = p.dyn(st), fixed = [], moving = []; a.forEach((q, i) => (q === b[i] ? fixed : moving).push(q)); return { fixed, moving }; }
  const C = {
    body: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: true }),
    bodyF: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: false }),
    rest: FAST.compile(DDM, { fine: true }), restF: FAST.compile(DDM, { fine: false }),
    far: FAST.compile(sub(DDM, n => ['hull', 'super', 'mast', 'spy', 'stacks', 'sps', 'gun', 'hangar', 'deck'].includes(n)), { fine: false }),
  };
  const GUN_TR = [0, 1.28, .95], CIWS_TR = [0, 1.55, 0];
  const gP = part('gun'), gS = split(gP, { gunPitch: 0 });
  const GUN = { house: [cp(gS.fixed, true), cp(gS.fixed, false)], barrel: [cp(gS.moving, true), cp(gS.moving, false)] };
  const cPs = [part('ciwsF'), part('ciwsA')], cS = split(cPs[0], { ciwsPitch: [0, 0], ciwsSpin: 0 });
  const SPQ = 8;
  const CIWS = { base: [cp(cS.fixed, true), cp(cS.fixed, false)], el: [] };
  for (let q = 0; q < SPQ; q++) { const m = split(cPs[0], { ciwsPitch: [0, 0], ciwsSpin: q / SPQ * TAU / 6 }).moving; CIWS.el.push([cp(m, true), cp(m, false)]); }
  const VLSG = [part('vlsF'), part('vlsA')].map((p, g) => {
    const s = split(p, {}), n = g ? 64 : 32;
    return { p, n, i0: g ? 32 : 0, fixed: [cp(s.fixed, true), cp(s.fixed, false)], closed: cp(s.moving, true),
      cell: Array.from({ length: n }, (_, k) => cp(s.moving.slice(3 * k, 3 * k + 3), true)), open: new Map() };
  });
  function vlsOpenCell(G, i, q) {
    const key = i * 64 + q; let c = G.open.get(key);
    if (!c) { const m = split(G.p, { vlsOpen: [[i, q / 16]] }).moving, k = i - G.i0; c = cp(m.slice(3 * k, 3 * k + 3), true); G.open.set(key, c); }
    return c;
  }
  const ONK = HD.oniks(), SM6 = HD.sm6();
  C.onk = FAST.compile(ONK, { fine: true }); C.onkF = FAST.compile(ONK, { fine: false });
  C.sm6 = FAST.compile(SM6, { fine: true }); C.sm6F = FAST.compile(SM6, { fine: false });
  const ONK_ST = { booster: false, cover: false };

  /* ---------------- frames ---------------- */
  const fA = T => OH.shipFrame(SA, T), fB = T => OH.shipFrame(SB, T);
  const SPY = DA.spy;
  const TG = {
    ship: [0, 12, 0], vlsF: [0, 7.3, 38.9], gun: [0, 9.2, 48.6], cF: [0, 12.5, 32.9], cA: [0, 15.4, -47.5],
    fcsl: [2, 8.5, 50], hit: OH.HIT_P,
  };
  const far = (brg, d, y) => [Math.sin(brg * D2R) * d, y === undefined ? 0 : y, Math.cos(brg * D2R) * d];

  /* ---------------- camera ----------------
     ORBIT keys in the ship's heading frame (steady: the ship pitches and rolls in the frame): eye on a circle around
     midships (azimuth th deg from the bow, + to starboard, unwrapped), radius r, height h; the lens aimed at a
     ship-frame point; bias (deg) turns the lens left so the subject sits right of centre, clear of the menu.
     Negative times: the arrival on the next ship (B's film at T - D). */
  const K = (t, th, r, h, tg, fov, bias) => ({ t, th, r, h, tg, fov, bias });
  const ORBK = [
    // the arrival on the next ship: in from ahead down its starboard bow, out of the thinning rain
    K(-15, 17, 720, 44, [0, 10, -12], 35, 5),
    K(-8, 25, 440, 30, [0, 10, -10], 34, 6),
    K(-3.5, 30, 310, 23, [0, 10, -8], 34, 7),
    // Calm before: off the starboard bow, low on the long swell, the ship coming on
    K(0, 34, 245, 20, [0, 10, -6], 34, 7),
    K(7, 38, 205, 18, [0, 10, 0], 34, 7),
    K(14, 42, 165, 16, [0, 10, 8], 34, 7),
    // Squall: in toward the bow as the rain sweeps in; a far bolt; low off the starboard bow as she buries it
    K(21, 44, 150, 15, [0, 10, 30], 35, 8),
    K(27, 42, 128, 13, [0, 9, 45], 36, 8),
    K(33, 45, 112, 12, [0, 9, 52], 37, 8),
    K(39, 54, 100, 12, [0, 9, 52], 38, 8),
    K(44, 70, 96, 17, [0, 10, 40], 40, 8),
    // up and round the stern to the port quarter
    K(50, 118, 100, 34, [0, 14, 10], 40, 8),
    K(56, 168, 140, 46, TG.ship, 40, 8),
    // Contact: high off the port quarter, the ship on the right, looking past her bow to 040 where the raid comes
    K(62, 236, 130, 32, far(40, 2500, 0), 42, 4),
    K(68, 238, 126, 30, far(41, 2500, 0), 42, 4),
    // Into the cloud: up with the pair to the cloud base, down to the horizon for the far kills, up with the third
    K(75, 240, 124, 30, [40, 135, 260], 56, 3),
    K(80, 242, 126, 30, far(40, 7000, 300), 46, 4),
    K(86, 244, 124, 29, far(42, 3000, 60), 44, 4),
    K(92, 248, 118, 28, far(42, 5000, 250), 46, 5),
    // Close-in: in along the port side to abreast the bridge, looking across the forecastle and the forward Phalanx to 040
    K(97, 280, 62, 24, far(40, 2500, 0), 44, 3),
    K(102, 290, 34, 22, far(43, 2500, 0), 46, 6),
    K(108, 296, 33, 21, far(46, 1500, 20), 46, 5),
    K(111.5, 300, 34, 21, TG.fcsl, 46, 4),
    // Hit forward: out past the port bow and round ahead of her, back to the forecastle in the dark; the lightning shows it
    K(113.5, 322, 58, 22, TG.fcsl, 44, 4),
    K(116.5, 356, 96, 20, TG.fcsl, 42, 5),
    K(121, 398, 104, 24, [0, 14, 40], 42, 7),
    K(126, 424, 104, 22, [0, 11, 26], 40, 8),
    // Storm rolls on: aft down the starboard side, falling back to watch her steam on into the rain
    K(130, 452, 110, 24, [0, 11, 14], 38, 8),
    K(134, 470, 140, 28, [0, 12, 12], 38, 7),
  ];
  let prevAz = null;
  for (const k of ORBK) {
    const th = k.th * D2R; k.eye = [k.r * Math.sin(th), k.h, k.r * Math.cos(th)];
    const d = V.sub(k.tg, k.eye); let az = Math.atan2(d[0], d[2]);
    if (prevAz !== null) az = prevAz + OH.angD(prevAz, az);
    k.az = az; k.el = Math.atan2(d[1], Math.hypot(d[0], d[2])); prevAz = az;
  }
  function herm(keys, fields) {
    const n = keys.length;
    const tan = (i, f) => { if (i <= 0 || i >= n - 1) return 0; const a = keys[i - 1], b = keys[i + 1]; return (b[f] - a[f]) / (b.t - a.t); };
    return t => {
      t = clamp(t, keys[0].t, keys[n - 1].t);
      let i = 0; while (i < n - 2 && keys[i + 1].t <= t) i++;
      const a = keys[i], b = keys[i + 1], dt = b.t - a.t, u = clamp((t - a.t) / dt, 0, 1), u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, o = {};
      for (const f of fields) o[f] = a[f] * h00 + tan(i, f) * dt * h10 + b[f] * h01 + tan(i + 1, f) * dt * h11;
      return o;
    };
  }
  const ORBF = herm(ORBK, ['th', 'r', 'h', 'az', 'el', 'fov', 'bias']);
  const mid = ps => { const q = ps.filter(Boolean); if (!q.length) return null; return V.mul(q.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / q.length); };
  const I_ = OH.INTS, RID = OH.RID;
  const TRK = [
    { a: 71.6, b: 80.5, fi: 1.8, fo: 3, w: .42, p: T => mid([OH.intAt(I_[0], T), T > 71.4 ? OH.intAt(I_[1], T) : null]) },
    { a: 79.5, b: 85.5, fi: 1.4, fo: 2.4, w: .3, p: () => mid([I_[0].PI, I_[1].PI]) },
    { a: 86, b: 94, fi: 1.3, fo: 2.6, w: .36, p: T => OH.intAt(I_[2], T) },
    { a: 98.5, b: 111.4, fi: 1.8, fo: 1.2, w: .22, p: T => mid([T < RID.R3.tEnd ? OH.roundAt(RID.R3, T) : null, OH.roundAt(RID.R4, Math.min(T, RID.R4.tEnd))]) },
  ];
  function orbitShot(frame, tau, T, track) {
    const k = ORBF(tau), F = frame(T), th = k.th * D2R;
    const eye = X.ap(F, [k.r * Math.sin(th), k.h, k.r * Math.cos(th)]);
    let d = [Math.cos(k.el) * Math.sin(k.az), Math.sin(k.el), Math.cos(k.el) * Math.cos(k.az)];
    if (track) for (const tr of TRK) {
      if (T < tr.a || T > tr.b) continue;
      const w = tr.w * ss(tr.a, tr.a + tr.fi, T) * (1 - ss(tr.b - tr.fo, tr.b, T)); if (w <= 0) continue;
      const p = tr.p(T); if (!p) continue;
      d = V.norm(V.lerp(d, V.norm(V.sub(p, eye)), w));
    }
    const cb = Math.cos(k.bias * D2R), sb = Math.sin(k.bias * D2R);
    d = [d[0] * cb - d[2] * sb, d[1], d[2] * cb + d[0] * sb];
    return { eye, target: V.mad(eye, d, 100), fov: k.fov * D2R, roll: 0 };
  }
  const orbitA = T => orbitShot(fA, T, T, true);
  const orbitB = T => orbitShot(fB, T - D, T, false);
  // the flight aft from A's quarter down the wake to B (A's heading frame)
  const inA = (T, s) => { const F = fA(T); return { eye: V.sub(s.eye, F.T), target: V.sub(s.target, F.T) }; };
  const FL_T0 = 134.5, FL_T1 = 152;
  const flKeys = [];
  for (const t of [FL_T0 - 1.5, FL_T0]) { const s = inA(t, orbitA(t)); flKeys.push({ t, eye: s.eye, target: s.target, fov: orbitA(t).fov / D2R }); }
  flKeys.push(
    { t: 137.5, eye: [104, 34, -170], target: [0, 14, 22], fov: 36 },
    { t: 141, eye: [118, 42, -290], target: [0, 16, 34], fov: 34 },
    // the lens turns (clockwise, through east) from the receding ship to the next one astern
    { t: 144.6, eye: [150, 46, -380], target: [470, 135, -500], fov: 38 },
    { t: 147.8, eye: [178, 44, -440], target: [80, 10, -1150], fov: 36 },
  );
  for (const t of [FL_T1, FL_T1 + 2]) { const s = inA(t, orbitB(t)); flKeys.push({ t, eye: s.eye, target: s.target, fov: orbitB(t).fov / D2R }); }
  const FLP = FILM.path(flKeys);
  const flight = T => { const s = FLP(T), F = fA(T); return { eye: V.add(s.eye, F.T), target: V.add(s.target, F.T), fov: s.fov, roll: 0 }; };
  const SEQ = [
    { f: orbitA, end: FL_T0 + .6, bl: 2.6 },
    { f: flight, end: FL_T1 + .2, bl: 3 },
    { f: orbitB, end: 1e9, bl: 0 },
  ];
  function mixShot(a, b, w) {
    if (w <= 0) return a; if (w >= 1) return b;
    const da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = V.len(da), lb = V.len(db);
    const dir = V.norm(V.lerp(V.mul(da, 1 / la), V.mul(db, 1 / lb), w)), eye = V.lerp(a.eye, b.eye, w);
    return { eye, target: V.mad(eye, dir, mix(la, lb, w)), fov: mix(a.fov, b.fov, w), roll: 0 };
  }
  function shotAt(T) {
    T = ((T % D) + D) % D;
    for (let i = 0; i < SEQ.length; i++) {
      const s = SEQ[i], w0 = s.end - s.bl / 2, w1 = s.end + s.bl / 2;
      if (T < w0 || i === SEQ.length - 1) return s.f(T);
      if (T < w1) return mixShot(s.f(T), SEQ[i + 1].f(T), sm((T - w0) / s.bl));
    }
    return SEQ[SEQ.length - 1].f(T);
  }
  OHS.buildBolts(shotAt);

  /* sea row phases: the camera's travel along / across its view, integrated once; the residual mod 1024 m is
     spread over the loop so the rows at T = D stand where they stood at T = 0 */
  const PH_N = D * 60, PHF = new Float64Array(PH_N + 1), PHR = new Float64Array(PH_N + 1), PSP = new Float32Array(PH_N + 1);
  {
    let prev = null;
    for (let i = 0; i <= PH_N; i++) {
      const s = shotAt(i / 60 % D + (i === PH_N ? D - 1e-6 : 0)), f = V.norm(V.sub(s.target, s.eye));
      const r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
      let fx = f[0] + u[0] * .8, fz = f[2] + u[2] * .8; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      if (prev) { const dx = s.eye[0] - prev[0], dz = s.eye[2] - prev[2]; PHF[i] = PHF[i - 1] + dx * fx + dz * fz; PHR[i] = PHR[i - 1] + dx * fz - dz * fx; PSP[i] = Math.hypot(dx, dz) * 60; }
      prev = s.eye;
    }
    const res = v => OH.modp(v + 512, 1024) - 512;
    const rF = res(PHF[PH_N]), rR = res(PHR[PH_N]);
    for (let i = 0; i <= PH_N; i++) { PHF[i] -= rF * i / PH_N; PHR[i] -= rR * i / PH_N; }
    PSP[0] = PSP[1];
  }
  const phaseAt = T => { const x = clamp(T * 60, 0, PH_N - .001), i = Math.floor(x), f = x - i; return [PHF[i] + (PHF[i + 1] - PHF[i]) * f, PHR[i] + (PHR[i + 1] - PHR[i]) * f, PSP[i]]; };

  /* ---------------- drawing ---------------- */
  let VIS = 8000, LL = 0;                          // this frame's visibility and lightning level
  const visK = d => mix(Math.exp(-Math.pow(d / VIS, 1.3)), 1, LL * .85);
  function objFog(dist) { W.fog = [Math.max(30, dist * .55), dist * 2.4 + 700]; }
  // ships fade out with distance from the lens alone (the same rule for all three keeps the seam exact)
  const shipFade = d => 1 - ss(1500, 2150, d);
  const shipSt = (S, T) => ({ sps: (T - S.tau) * (PI / 2) + 1.1, hangar: 0 });
  function drawRestShip(S, T, dist, al) {
    const Xs = OH.shipXf(S, T), a = clamp(1.25 - dist / 9000, .3, 1) * al;
    objFog(dist);
    FAST.draw(W, dist > 4200 ? C.far : dist > 1500 ? C.restF : C.rest, Xs, shipSt(S, T), { fine: dist <= 1500, a });
    return Xs;
  }
  function drawHero(T, dist, al) {
    const S = SA, Xs = OH.shipXf(S, T), fine = dist <= 1500, fi = fine ? 0 : 1, a = clamp(1.25 - dist / 9000, .3, 1) * al;
    objFog(dist);
    FAST.draw(W, fine ? C.body : C.bodyF, Xs, shipSt(S, T), { fine, a });
    const cs = OH.ciwsState(S, T);
    if (!FAST.visible(cam, X.ap(Xs, [0, 10, 0]), 90)) return { Xs, cs, spin: [0, 0] };
    const emit = FAST.emitter(W);
    FAST.drawPart(W, GUN.house[fi], X.mul(Xs, gP.xf({ gunYaw: 0 })), a, emit);
    FAST.drawPart(W, GUN.barrel[fi], X.mul(X.mul(Xs, gP.xf({ gunYaw: 0 })), piv(R.x(0), GUN_TR)), a, emit);
    const spin = [OH.ciwsSpin(S, 0, T), OH.ciwsSpin(S, 1, T)];
    for (let m = 0; m < 2; m++) {
      const mX = X.mul(Xs, cPs[m].xf({ ciwsYaw: cs.yaw }));
      FAST.drawPart(W, CIWS.base[fi], mX, a, emit);
      const eX = X.mul(mX, piv(R.x(-cs.pitch[m]), CIWS_TR));
      const rate = (OH.ciwsSpin(S, m, T + .01) - spin[m]) / .01, step = TAU / 6 / SPQ;
      const q = Math.round(OH.modp(spin[m], TAU / 6) / step) % SPQ;
      if (rate > 25) { FAST.drawPart(W, CIWS.el[q][fi], eX, a * .6, emit); FAST.drawPart(W, CIWS.el[(q + SPQ / 2) % SPQ][fi], eX, a * .45, emit); }
      else FAST.drawPart(W, CIWS.el[q][fi], eX, a, emit);
    }
    const open = OH.vlsOpen(S, T), om = new Map(); if (open) for (const [i, f] of open) om.set(i, f);
    for (const G of VLSG) {
      FAST.drawPart(W, G.fixed[fi], Xs, a, emit);
      if (!fine) continue;
      let any = false; for (const i of om.keys()) if (i >= G.i0 && i < G.i0 + G.n) any = true;
      if (!any) { FAST.drawPart(W, G.closed, Xs, a, emit); continue; }
      for (let k = 0; k < G.n; k++) {
        const f = om.get(G.i0 + k) || 0, q = Math.round(f * 16);
        FAST.drawPart(W, q ? vlsOpenCell(G, G.i0 + k, q) : G.cell[k], Xs, a, emit);
      }
    }
    return { Xs, cs, spin };
  }
  // the incoming rounds: the model near, a dash along the line at range, faded into the murk (never quite gone)
  function drawRounds(T, dim) {
    for (const r of OH.ROUNDS) {
      const vis = OH.roundVis(r, T) * dim; if (vis <= .003) continue;
      const p = OH.roundAt(r, T), d = V.dist(p, cam.eye), dir = OH.roundDir(r, T), vk = mix(.4, 1, visK(d));
      if (d < 2500 && FAST.visible(cam, p, 6)) {
        objFog(Math.max(20, d));
        FAST.draw(W, d < 450 ? C.onk : C.onkF, X.make(R.look(dir, [0, 1, 0]), p), ONK_ST, { fine: d < 450, a: vis * vk * clamp(1.5 - d / 2000, .45, 1), noCull: true });
      }
      W.fog = [1e8, 2e8];
      const tail = V.mad(p, dir, -4.6), L1 = Math.max(3, d * .0032), L2 = Math.max(14, d * .018);
      W.seg(V.mad(tail, dir, -L1), tail, .9 * vis * vk);
      W.seg(V.mad(tail, dir, -L2), V.mad(tail, dir, -L1), .2 * vis * vk);
    }
  }
  // interceptor flight paths: the path flown so far as a faint line, lost in the cloud above its base; a short bright
  // head below the cloud; the missile when near
  const inCloud = y => ss(CB - 40, CB + 20, y);
  function drawInterceptors(T, dim) {
    for (const I of OH.INTS) {
      if (T < I.tL) continue;
      const age = T - I.tEnd, fade = (age > 0 ? 1 - ss(0, 7, age) : 1) * dim; if (fade <= .003) continue;
      W.fog = [1e8, 2e8];
      const tr = OH.intTrace(I, T, 4);
      for (let k = 0; k < tr.length - 1; k++) {
        const y = (tr[k][1] + tr[k + 1][1]) * .5, dd = V.dist(tr[k], cam.eye);
        W.seg(tr[k], tr[k + 1], .16 * fade * (1 - .93 * inCloud(y)) * mix(.45, 1, visK(dd)));
      }
      if (T > I.tEnd) continue;
      const h = OH.intAt(I, T), dir = OH.intDir(I, T), d = V.dist(h, cam.eye), hk = (1 - .9 * inCloud(h[1])) * mix(.45, 1, visK(d));
      W.seg(V.mad(h, dir, -Math.max(5, d * .005)), h, .85 * dim * hk);
      if (d < 900 && hk > .1 && FAST.visible(cam, h, 5)) {
        objFog(Math.max(15, d));
        FAST.draw(W, d < 160 ? C.sm6 : C.sm6F, X.make(R.look(dir, [0, 1, 0]), V.mad(h, dir, -3.3)), { booster: T - I.tL < 6 }, { fine: d < 160, a: dim * hk * clamp(1.4 - d / 900, .4, 1), noCull: true });
      }
    }
  }

  /* ---------------- labels ---------------- */
  const callsEl = document.getElementById('calls'), POOL = [];
  for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'call'; callsEl.appendChild(d); POOL.push({ el: d, html: '', on: false }); }
  let LEAD = [];
  function setLabels(list) {
    LEAD = [];
    const placed = [];
    for (let i = 0; i < POOL.length; i++) {
      const L = list[i], P = POOL[i];
      if (!L || L.a <= .01) { if (P.on) { P.el.style.opacity = 0; P.on = false; } continue; }
      const p = cam.project(L.at);
      if (!p || p[0] < 700 || p[0] > 1880 || p[1] < 40 || p[1] > 1060) { if (P.on) { P.el.style.opacity = 0; P.on = false; } continue; }
      const dx = L.dx === undefined ? 70 : L.dx, dy = L.dy === undefined ? -64 : L.dy;
      const html = ORB.cat(L.id, { sq: L.y ? 'y' : '', code: L.id }) + (L.sub ? `<span class="s2">${L.sub}</span>` : '');
      if (html !== P.html) { P.el.innerHTML = html; P.html = html; P.w = P.el.offsetWidth; }
      const left = dx < 0, wv = P.w || 200;
      let lx = p[0] + dx, ly = p[1] + dy;
      ly = clamp(ly, 300, 870);
      let x0 = left ? lx - wv - 6 : lx + 6;
      x0 = clamp(x0, 720, 1810 - wv);
      lx = left ? x0 + wv + 6 : x0 - 6;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(b => x0 < b[2] + 12 && x0 + wv > b[0] - 12 && ly - 10 < b[3] && ly + 34 > b[1]);
        if (!hit) break;
        ly = clamp(hit[1] - 48, 300, 870) === ly ? ly + 48 : hit[1] - 48;
      }
      placed.push([x0, ly - 10, x0 + wv, ly + 34]);
      P.el.style.transform = `translate(${x0.toFixed(1)}px, ${(ly - 7).toFixed(1)}px)`;
      P.el.style.opacity = L.a.toFixed(3); P.on = true;
      LEAD.push({ p, q: [lx, ly], a: L.a, y: L.y });
    }
  }
  function drawLeaders() {
    ctx.lineWidth = 1;
    for (const l of LEAD) {
      ctx.strokeStyle = WH; ctx.globalAlpha = .55 * l.a;
      ctx.beginPath(); ctx.moveTo(l.p[0], l.p[1]); ctx.lineTo(l.q[0], l.q[1]); ctx.stroke();
      ctx.globalAlpha = .9 * l.a; ctx.strokeStyle = l.y ? HI : WH;
      ctx.beginPath(); ctx.arc(l.p[0], l.p[1], 2.6, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const win = (T, a, b, f) => ss(a, a + (f || .8), T) * (1 - ss(b - (f || .8), b, T));
  const km = d => (d / 1000).toFixed(d < 9950 ? 1 : 0) + ' km';
  const kn = v => Math.round(v * 1.944);

  /* ---------------- log, readout, captions ---------------- */
  const LOG = [
    [.8, 'SHIP', 'Condition III · 13.6 kn · 000'], [5.5, 'MET', 'Glass 994 hPa · falling'],
    [15.5, 'MET', 'Squall line · 040 · 3 nm'], [30.5, 'MET', 'Wind 040 · 44 kn · sea 6'],
    [43.6, 'MET', 'Lightning · 2.3 km'],
    [65, 'SPY', '2 tracks · 040 · 24 km'], [66.6, 'EVAL', 'Vampire ×2 · 3M55 · M2.0'],
    [73.8, 'SPY', '2 more · 045 · 24 km'], [77.2, 'EVAL', 'Vampire ×4 · low in the rain'],
    [OH.HIT.t + 2.6, 'DC', 'Repair 2 · fire forward'], [121.2, 'DC', 'Hull open · stbd bow · above wl'],
    [129, 'SHIP', 'Raid · 3 of 4 · hit forward'], [134.5, 'MET', 'Squall passing · 220'], [150.5, 'SHIP', 'Next ship · DDG · astern'],
  ];
  for (const ev of OH.EVENTS) {
    if (ev.kind === 'launch') LOG.push([ev.t, 'SM-6', `Bird away · cell ${ev.I.cell}`]);
    else if (ev.kind === 'intercept') LOG.push([ev.t, 'KILL', `${ev.r.id} · ${km(OH.roundDist(ev.r, ev.t))}`]);
    else if (ev.kind === 'miss') LOG.push([ev.t, 'MISS', `${ev.r.id} · weaves through`]);
    else if (ev.kind === 'ciws') LOG.push([ev.t, 'CIWS', `Fwd mount · ${ev.e.round.id} · ${km(OH.roundDist(ev.e.round, ev.t))}`]);
    else if (ev.kind === 'ciwsKill') LOG.push([ev.t, 'KILL', `${ev.r.id} · ${Math.round(OH.roundDist(ev.r, ev.t))} m`]);
    else if (ev.kind === 'hit') LOG.push([ev.t, 'HIT', 'Starboard bow · R4']);
  }
  LOG.sort((a, b) => a[0] - b[0]);
  const logRows = document.getElementById('logRows');
  let logKey = '';
  const fmtT = t => { const s = Math.floor(OH.modp(t, D)) + 2 * 3600 + 40 * 60; return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`.slice(3); };
  function updateLog(T) {
    const all = LOG.map(([t, c, x]) => [t <= T ? t : t - D, c, x]).sort((a, b) => a[0] - b[0]).slice(-7);
    const key = all.map(r => r[2]).join('|');
    if (key === logKey) return; logKey = key;
    logRows.innerHTML = all.map(([t, c, x], i) => `<div class="r${i === all.length - 1 ? ' new' : ''}"><span class="c">${fmtT(t)}</span><span class="t">${c}</span><span>${x}</span></div>`).join('');
  }
  const roEl = document.getElementById('ro'); let roKey = '';
  function readout(T) {
    let k = 'Wind', v = `040 · ${kn(OH.windSpd(T))} kn · sea ${OH.seaK(T) > .5 ? 6 : 5}`;
    let best = null, bd = 1e9;
    for (const r of OH.ROUNDS) { if (!OH.roundLive(r, T)) continue; const d = OH.roundDist(r, T); if (d < bd) { bd = d; best = r; } }
    if (best) { k = 'Closest'; v = `${best.id} · ${bd < 1000 ? Math.round(bd) + ' m' : km(bd)} · M2.0`; }
    else if (T > OH.HIT.t && T < 138) { k = 'Damage'; v = 'stbd bow · steaming on'; }
    else if (T >= 140 && T < 160) { k = 'Next ship'; v = `DDG · ${km(V.dist(cam.eye, OH.shipPos(SB, T)))} astern`; }
    const key = k + v; if (key === roKey) return; roKey = key;
    roEl.innerHTML = `<span class="k">${k}</span>${v}`;
  }
  const CH = [
    { t: 0, title: 'Calm before', sub: 'DDG Flight IIA · night · 13.6 kn into the swell' },
    { t: 19, title: 'Squall', sub: 'Wind 040 at 44 kn · sea state 6' },
    { t: 58, title: 'Contact', sub: 'Four rounds low through the rain from 040' },
    { t: 69, title: 'Into the cloud', sub: 'SM-6 up through the overcast' },
    { t: 99, title: 'Close-in', sub: 'Phalanx through the rain' },
    { t: OH.HIT.t, title: 'Hit forward', sub: 'Starboard bow · the lightning shows it' },
    { t: 128, title: 'Storm rolls on', sub: 'Aft down the column to the next ship' },
  ];
  const figT = document.getElementById('figT'), figS = document.getElementById('figS');

  /* ---------------- sound: rain, wind, sea bed; thunder after each flash; simple engagement cues ---------------- */
  const SND = { on: false };
  function sndInit() {
    const S = STAGE.SFX; if (!S.ac || SND.on) return !!SND.on;
    const ac = S.ac, out = S.master;
    const nb = (() => { const b = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = l * .97 + w * .03; d[i] = w * .5 + l * 3; } return b; })();
    const src = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || .7; return b; };
    const sea = gain(0); src().connect(filt('lowpass', 320)).connect(sea).connect(out);
    const rain = gain(0); src().connect(filt('highpass', 2600)).connect(filt('lowpass', 9000)).connect(rain).connect(out);
    const wind = gain(0), wf = filt('bandpass', 480, 1.4); src().connect(wf).connect(wind).connect(out);
    const hum = gain(0), ho = ac.createOscillator(); ho.type = 'triangle'; ho.frequency.value = 58; ho.connect(filt('lowpass', 200)).connect(hum).connect(out); ho.start();
    Object.assign(SND, { on: true, sea, rain, wind, wf, hum });
    return true;
  }
  function sndUpdate(T, playing) {
    if (!sndInit()) return;
    const ac = STAGE.SFX.ac, t = ac.currentTime, on = STAGE.SFX.on && playing, set = (p, v) => p.setTargetAtTime(on ? v : 0, t, .15);
    const e = cam.eye, dA = V.dist(X.ap(fA(T), [0, 10, 0]), e), dB = V.dist(X.ap(fB(T), [0, 10, 0]), e), g = OH.gust(T), sk = OH.stormK(T);
    set(SND.sea.gain, .05 + .06 * OH.seaK(T));
    set(SND.rain.gain, .07 * OH.rainK(T));
    set(SND.wind.gain, .015 + .06 * sk * g * g);
    SND.wf.frequency.setTargetAtTime(380 + 260 * sk * g, t, .2);
    set(SND.hum.gain, .04 * (1 / (1 + dA / 120) + 1 / (1 + dB / 120)));
  }
  const S = STAGE.SFX, CUES = [];
  for (const F of OHS.FLASHES) {
    const e = shotAt(F.t).eye, d = F.G0 ? Math.hypot(F.G0[0] - e[0], F.G0[2] - e[2]) : F.dist, dl = d / 343, g = F.s * clamp(2200 / d, .25, 1);
    if (d < 3000) CUES.push([F.t + dl, () => { S.crack(); S.noise(.9, 1800, .6, .08 * g, .004); }]);
    CUES.push([F.t + dl + .1, () => { S.noise(4.5 + d / 3000, 140, .8, .22 * g, .08); S.noise(3, 420, .6, .07 * g, .3); S.tone(38, 26, 3, 'sine', .08 * g); }]);
  }
  for (const ev of OH.EVENTS) {
    if (ev.kind === 'launch') CUES.push([ev.t, () => { S.noise(2.8, 160, .8, .2, .03); S.noise(.9, 2400, .5, .05, .01); }]);
    else if (ev.kind === 'intercept' || ev.kind === 'miss') { const d = OH.roundDist(ev.r, ev.t); CUES.push([ev.t + Math.min(6, d / 343 * .35), () => { S.tone(48, 32, 1.1, 'sine', .05); S.noise(1.6, 150, .8, .04, .03); }]); }
    else if (ev.kind === 'ciws') CUES.push([ev.t, () => { S.noise(ev.e.t1 - ev.e.t0 + .1, 1400, 2.4, .05, .02); S.tone(75, 75, ev.e.t1 - ev.e.t0, 'square', .012); }]);
    else if (ev.kind === 'hit') CUES.push([ev.t, () => { S.tone(44, 28, 1.6, 'sine', .2); S.crack(); S.rumble(3.5, .25); }]);
  }
  for (const sl of OH.SLAMS) if (sl.tau >= 0 && sl.tau < D && sl.s > .25) CUES.push([sl.tau, () => S.noise(1.6, 900, .5, .03 * sl.s, .05)]);
  for (const c of OHFX.cues || []) CUES.push(c);

  /* ---------------- render ---------------- */
  const shipsForSea = [];
  const GL = [];
  const K_ = { W, cam, glow: (p, a, m, px, max) => GL.push({ p, a, m: m || 1, px: px || 4, max: max || 160 }), hero: null, dim: 1, L: 0, rain: 0, wind: [0, 0, 0], CB, vis: 8000 };
  const HOOKS = ['launchFx', 'cloudGlowFx', 'interceptFx', 'ciwsFx', 'hitFx'];
  function render(T, info) {
    const shot = shotAt(T);
    const dv = V.norm(V.sub(shot.target, shot.eye));
    cam.up = Math.abs(dv[1]) > .985 ? [0, 0, 1] : [0, 1, 0];
    FILM.apply(cam, shot);
    const sk = OH.stormK(T), L = OHS.lift(T);
    LL = L; VIS = OH.visRange(T, 0);
    // the storm buffets the lens (gust-driven, deterministic), plus stage B's shake
    const g = OH.gust(T), bu = sk * (.6 + .9 * Math.max(0, g - .9));
    const sh = FILM.shake(T, 1.3 * bu, 2.2), s2 = OHFX.shake(T);
    cam.shake = s2 ? [sh[0] + s2[0], sh[1] + s2[1]] : sh;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    W.reset(); W.style(WH, 1); W.fog = [1e8, 2e8];
    GL.length = 0;
    const e = cam.eye, dim = 1, night = mix(.92, .78, sk);
    // sea
    shipsForSea.length = 0;
    for (const Sx of OH.SHIPS) { const p = OH.shipPos(Sx, T); shipsForSea.push({ S: Sx, x: p[0], z: p[2], L: Sx.L, r2: Math.pow(Sx.L / 2 + 25, 2) }); }
    const ph = phaseAt(T);
    OH.drawSea(W, cam, T, ph, { ships: shipsForSea, speed: ph[2], alpha: night, horizon: mix(.8, .45, sk) + .5 * L, vis: VIS * 1.6, L });
    OH.drawCaps(W, cam, T, { ships: shipsForSea, alpha: night, vis: VIS * 1.4, L });
    // cloud and rain shafts
    OHS.drawClouds(W, cam, T, { L, vis: VIS });
    OHS.drawScud(W, cam, T, { L, vis: VIS });
    OHS.drawShafts(W, cam, T, { L, vis: VIS });
    // wakes, ships, spray, shimmer
    let hero = null;
    for (const Sx of OH.SHIPS) {
      const p = OH.shipPos(Sx, T), dist = V.dist([p[0], 10, p[2]], e), fade = shipFade(dist) * dim;
      if (fade <= .003) continue;
      const vk = visK(dist);
      W.fog = [1e8, 2e8]; OH.drawWake(W, Sx, T, { alpha: clamp(1.4 - dist / 7000, .35, 1) * fade * mix(.5, 1, vk) * night });
      let Xs;
      if (Sx.n === 0) { hero = drawHero(T, dist, fade * mix(.55, 1, vk) * mix(.95, .86, sk)); Xs = hero.Xs; }
      else Xs = drawRestShip(Sx, T, dist, fade * mix(.35, 1, vk) * mix(.95, .86, sk));
      W.fog = [1e8, 2e8];
      if (dist < 900) OHS.drawSpray(W, cam, Sx, T, { alpha: clamp(1.3 - dist / 900, 0, 1) });
      if (dist < 2000) {
        const tau = T - Sx.tau, up = X.dir(Xs, [0, 1, 0]), aft = X.dir(Xs, [0, 0, -1]), side = X.dir(Xs, [1, 0, 0]);
        for (const m of DA.stacks) OH.drawShimmer(W, X.ap(Xs, m), up, aft, side, tau, { alpha: clamp(1.2 - dist / 1600, 0, 1) * fade * mix(1, .6, sk), w: 3.2, lean: mix(.7, 1.6, sk) });
      }
    }
    // the raid
    drawRounds(T, dim);
    drawInterceptors(T, dim);
    Object.assign(K_, { hero: hero ? { X: hero.Xs, ciws: hero.cs, spin: hero.spin } : null, dim, L, rain: OH.rainK(T), wind: OH.windAt(T), vis: OH.visRange(T, L) });
    for (const fx of HOOKS) { W.fog = [1e8, 2e8]; OHFX[fx](T, K_); }
    // lightning and the near rain on top
    W.fog = [1e8, 2e8];
    OHS.drawBolts(W, cam, T);
    const s0 = shotAt(T - .05).eye, s1 = shotAt(T + .05).eye, vcam = [(s1[0] - s0[0]) * 10, (s1[1] - s0[1]) * 10, (s1[2] - s0[2]) * 10];
    OHS.drawRain(W, cam, T, vcam, { L });
    OHS.flush(W, ctx, L);
    // glows from the hooks (additive, restrained)
    if (GL.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const gl of GL) {
        const p = cam.project(gl.p); if (!p || gl.a <= .004) continue;
        const r = Math.min(gl.max, gl.px + gl.m * cam.fl / p[2]);
        const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, gl.a).toFixed(3)})`); gr.addColorStop(.22, `rgba(255,250,235,${(gl.a * .3).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = gr; ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // menu-side calm (off with the UI: H gives the clean film)
    if (!FILM.uiHidden) {
      const lg = ctx.createLinearGradient(0, 0, 760, 0);
      lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.62, 'rgba(0,0,0,.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, 760, 1080);
      const rg = ctx.createRadialGradient(1660, 160, 30, 1660, 160, 400);
      rg.addColorStop(0, 'rgba(0,0,0,.82)'); rg.addColorStop(.55, 'rgba(0,0,0,.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(1200, 0, 720, 580);
    }
    // labels
    const labels = [], XsA = hero ? hero.Xs : OH.shipXf(SA, T);
    const shipLab = (Sx, sub2, a) => labels.push({ id: 'DDG · Arleigh Burke IIA', sub: sub2, at: X.ap(OH.shipXf(Sx, T), [0, 22, 14]), a, dx: 80, dy: -100 });
    shipLab(SA, '155 m · 13.6 kn into the swell', win(T, 2.5, 9.5));
    shipLab(SB, '155 m · the next ship', win(T, D - 9.5, D - 2.5));
    shipLab(SA, 'hit forward · steaming on', win(T, 136.5, 142));
    labels.push({ id: 'AN/SPY-1D(V)', sub: 'array face · 045', at: X.ap(XsA, SPY[0]), a: win(T, 52.4, 57.6), dx: 70, dy: -80 });
    labels.push({ id: 'Mk 41 VLS', sub: 'forward · 32 cells', at: X.ap(XsA, TG.vlsF), a: win(T, 66, 70.2), dx: 70, dy: -70 });
    labels.push({ id: 'Phalanx 1B', sub: 'forward mount · 20 mm', at: X.ap(XsA, TG.cF), a: win(T, 100.5, 105.8), dx: 70, dy: -80 });
    for (const [r, a, b] of [[RID.R1, 62, 70], [RID.R3, 99, 105.8], [RID.R4, 106, 111.3]]) {
      const w = win(T, a, Math.min(b, r.tEnd - .05), .6) * OH.roundVis(r, T); if (w <= .01) continue;
      const d = OH.roundDist(r, T);
      labels.push({ id: `3M55 · ${r.id}`, sub: `${d < 1000 ? Math.round(d) + ' m' : km(d)} · sea-skimming`, y: true, at: OH.roundAt(r, T), a: w, dx: 64, dy: -70 });
    }
    setLabels(FILM.uiHidden ? [] : labels.filter(l => l.a > .01).sort((a, b) => b.a - a.a).slice(0, 5));
    drawLeaders();

    updateLog(T); readout(T);
    if (info && (info.playing || info.seeking === false)) sndUpdate(T, !!info.playing);
  }

  FILM.run({
    duration: D,
    chapters: CH,
    cues: CUES,
    onChapter(c) { const i = CH.indexOf(c); figT.innerHTML = `<b>Fig. ${i + 1}</b>${c.title}`; figS.textContent = c.sub; },
    render,
  });
  // probe: screen positions of the main objects at film time T (tuning aid)
  function proj(T) {
    const c = new Cam(1920, 1080), sh = shotAt(T); FILM.apply(c, sh);
    const P = p => { const q = c.project(p); return q ? [Math.round(q[0]), Math.round(q[1]), Math.round(q[2])] : null; };
    const Xs = OH.shipXf(SA, T), o = { eye: sh.eye.map(Math.round), fov: +(sh.fov / D2R).toFixed(1) };
    o.bow = P(X.ap(Xs, DA.bow)); o.stern = P(X.ap(Xs, DA.stern)); o.mid = P(X.ap(Xs, [0, 12, 0]));
    for (const k of ['vlsF', 'gun', 'cF', 'cA', 'hit']) o[k] = P(X.ap(Xs, TG[k]));
    for (const r of OH.ROUNDS) if (OH.roundLive(r, T)) o[r.id] = P(OH.roundAt(r, T));
    for (const I of OH.INTS) if (T >= I.tL && T <= I.tEnd) o['I' + I.i] = P(OH.intAt(I, T));
    for (const F of OHS.FLASHES) if (F.G0) o['F' + F.t] = P(F.G0);
    o.B = P(X.ap(OH.shipXf(SB, T), [0, 12, 0]));
    return o;
  }
  window.OHX = { shotAt, cam, phaseAt, SEQ, proj, ORBF };
})();
