/* OE "Ring": one slow orbit around a destroyer through three raids, each bigger; the fire's smoke drifts across
   the lens and the orbit comes out on the sister ship astern, calm, as at frame 0. Stage A: timeline, camera,
   ships, sea, rounds, interceptor paths, mounts / gun / cells moving, menu, log, captions, labels, seam.
   The combat effects live in oe_ring_fx.js (OEFX hooks). */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, VK, D2R, PI, TAU, DA } = OE;
  const SA = OE.A, SB = OE.B;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const sm = t => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const cam = new Cam(1920, 1080), W = new Wire(cam, { fog: [1e8, 2e8], color: '#F6F5F2' });
  const HI = '#F4D23C', WH = '#F6F5F2';
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };

  /* ---------------- menu ---------------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((it, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('oe' + i)}<span class="tx">${it}</span></span><span class="go">→</span><div class="bar"></div></div>`).join('');
  STAGE.menu({ el: menuEl, blurb: document.getElementById('blurb') });

  /* ---------------- models (compiled once for the fast hairline path) ---------------- */
  const DDM = HD.destroyer(), part = n => DDM.parts.find(p => p.name === n);
  const MOVING = ['gun', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA'];
  const sub = (m, keep) => ({ parts: m.parts.filter(p => keep(p.name)) });
  const cp = (prims, fine) => FAST.compilePrims(prims, fine);
  // a dynamic part's prims: those shared between two calls are fixed, the rebuilt ones move with the state
  function split(p, st) { const a = p.dyn(st), b = p.dyn(st), fixed = [], moving = []; a.forEach((q, i) => (q === b[i] ? fixed : moving).push(q)); return { fixed, moving }; }
  const C = {
    body: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: true }),
    bodyF: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: false }),
    rest: FAST.compile(DDM, { fine: true }), restF: FAST.compile(DDM, { fine: false }),
    far: FAST.compile(sub(DDM, n => ['hull', 'super', 'mast', 'spy', 'stacks', 'sps', 'gun', 'hangar', 'deck'].includes(n)), { fine: false }),
  };
  // trunnions of the Mk 45 and the Phalanx in their part frames (hd_sea_air GUN_TR / CIWS_TR)
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
  const fA = T => OE.shipFrame(SA, T), fB = T => OE.shipFrame(SB, T);
  const SPY = DA.spy, SPYN = DA.spyN;                    // stbd-fwd, port-fwd, stbd-aft, port-aft
  const TG = {
    ship: [0, 12, 0], vlsF: [0, 7.3, 38.9], vlsA: [0, 6.1, -29.4], gun: [0, 9.2, 49.4],
    cF: [0, 12.6, 33.4], cA: [0, 15.4, -47.5], hit: OE.HIT_P, deck: [0, 7, -64],
  };
  const far = (brg, d, y) => [Math.sin(brg * D2R) * d, y === undefined ? 0 : y, Math.cos(brg * D2R) * d];

  /* ---------------- camera ----------------
     ORBIT: keys in the ship's heading frame: eye on a circle around midships (azimuth th deg from the bow,
     + to starboard; the orbit runs anticlockwise, th falling), radius r, height h; the lens aimed at a ship-frame
     point. Look angles are interpolated (not points), so near and far aims blend without swinging. bias (deg)
     turns the lens left so its subject sits right of centre, clear of the menu. Negative times: the arrival on
     the next ship (B at T - D). */
  const K = (t, th, r, h, tg, fov, bias) => ({ t, th, r, h, tg, fov, bias });
  const ORBK = [
    // the arrival on the next ship (B's film at T - D): in from ahead, down its starboard bow
    K(-15, -6, 1000, 85, [0, 9, -30], 36, 4),
    K(-8, 12, 600, 60, [0, 10, -15], 35, 5),
    K(-3.5, 28, 370, 44, [0, 11, -6], 34, 6),
    // Watch: the starboard bow, bow to the right, the wake trailing under the menu
    K(0, 40, 262, 34, [0, 12, 0], 33, 7),
    K(6, 44, 196, 29, [0, 12, 6], 33, 8),
    K(11.5, 48, 110, 22, [3, 13, 18], 34, 8),
    // Contact: the starboard-forward SPY face, then the forward cells from abeam; up with the pair, round the
    // stern, and high behind the ship to the horizon ahead where they meet the raid
    K(16, 52, 50, 16, SPY[0], 36, 6),
    K(20.5, 72, 52, 17, [2, 10, 34], 38, 6),
    K(24, 92, 56, 17, TG.vlsF, 40, 8),
    K(28, 132, 76, 32, [0, 34, 50], 44, 6),
    K(33, 186, 108, 50, far(18, 3000, -330), 42, 8),
    K(39, 200, 120, 56, far(18, 3000, -380), 40, 8),
    // Ripple: high over the port quarter, down to the port-forward face, ahead of the bow for the ripple from both
    // launchers, up with the four and out to the starboard beam looking west across the ship
    K(45, 228, 140, 82, TG.ship, 38, 9),
    K(50.5, 280, 80, 34, SPY[1], 36, 8),
    K(54, 300, 50, 17, SPY[1], 36, 6),
    K(58, 356, 108, 38, [0, 5, 4], 42, 3),
    K(61.5, 374, 116, 40, [0, 30, 0], 44, 4),
    K(66.5, 410, 152, 44, [0, 18, 0], 44, 6),
    K(72, 446, 180, 46, [0, 14, 0], 43, 8),
    // Close-in: the gun on the leaker from the beam, then in to the aft Phalanx from the starboard quarter
    K(78, 468, 135, 32, [0, 10, 0], 38, 8),
    K(83, 489, 78, 20, TG.cA, 38, 5),
    K(86.5, 493, 69, 18, TG.cA, 38, 2),
    // Two bearings: high round the stern, down the port side to the gun, decoys, the forward Phalanx; over the bow
    // to the starboard bow looking aft for the aft Phalanx and the hit
    K(93, 540, 135, 70, TG.ship, 38, 9),
    K(99, 610, 100, 40, TG.vlsF, 38, 8),
    K(104, 663, 48, 13, TG.gun, 38, 5),
    K(110, 666, 46, 12, TG.gun, 38, 5),
    K(115, 668, 64, 24, [30, 22, 40], 42, 8),
    K(119.5, 670, 56, 19, TG.cF, 49, 11),
    K(121.4, 673, 50, 20, TG.cF, 38, 14),
    K(125, 746, 56, 28, [0, 12, -10], 40, 5),
    K(128, 768, 62, 25, TG.cA, 38, 6),
    K(131, 775, 64, 24, TG.hit, 38, 6),
    // Hit: aft along the starboard side past the fire, into the smoke
    K(135, 800, 62, 20, TG.vlsA, 40, 6),
    K(140, 830, 66, 18, TG.hit, 38, 8),
    K(145, 852, 90, 24, [-5, 18, -80], 38, 6),
    K(150, 866, 125, 36, [0, 22, -130], 40, 4),
  ];
  // per key: eye + look angles (azimuth unwrapped along the list)
  let prevAz = null;
  for (const k of ORBK) {
    const th = k.th * D2R; k.eye = [k.r * Math.sin(th), k.h, k.r * Math.cos(th)];
    const d = V.sub(k.tg, k.eye); let az = Math.atan2(d[0], d[2]);
    if (prevAz !== null) az = prevAz + OE.angD(prevAz, az);
    k.az = az; k.el = Math.atan2(d[1], Math.hypot(d[0], d[2])); prevAz = az;
  }
  // time-parameterised cubic Hermite over named fields (tangents from the neighbours), clamped at the ends
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
  // the lens follows moving things for a while (weight w, eased in over fi, out over fo)
  const mid = ps => { const q = ps.filter(Boolean); if (!q.length) return null; return V.mul(q.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / q.length); };
  const I_ = OE.INTS, RID = OE.RID;
  const RIPPLE_KILLS = mid([I_[2].PI, I_[3].PI, I_[4].PI, I_[5].PI]);
  const TRK = [
    { a: 24.2, b: 32.5, fi: 1.6, fo: 4, w: .38, p: T => mid([OE.intAt(I_[0], T), T > 25.6 ? OE.intAt(I_[1], T) : null]) },
    // across the ship to the ripple's far kills on the WNW horizon, then onto the leaker
    { a: 66.4, b: 75.5, fi: 2.2, fo: 2.6, w: .3, p: () => RIPPLE_KILLS },
    { a: 72, b: 85, fi: 2, fo: 3, w: .3, p: T => OE.roundAt(RID.T6, T) },
    { a: 101.6, b: 105, fi: 1, fo: 2, w: .35, p: T => mid([OE.intAt(I_[6], T), T > 102.6 ? OE.intAt(I_[7], T) : null]) },
    // up with the decoy rockets and their blooms, then down onto T9 for the forward Phalanx's kill
    { a: OE.DECOYS[0].t, b: 120.9, fi: 1.3, fo: 1.7, w: .55, p: T => OEFX.decoyFocus(T) },
    { a: 119.2, b: 121.4, fi: 1.3, fo: 1.2, w: .3, p: T => OE.roundAt(RID.T9, Math.min(T, RID.T9.tEnd)) },
    { a: 125.5, b: 130.8, fi: 1.5, fo: 1.2, w: .25, p: T => OE.roundAt(T < RID.T10.tEnd ? RID.T10 : RID.T11, Math.min(T, RID.T11.tEnd)) },
    { a: 133.2, b: 137, fi: 1, fo: 2, w: .3, p: T => OE.intAt(I_[8], T) },
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
  // the flight from A's stern through the smoke and aft along the track to B (A's heading frame)
  const inA = (T, s) => { const F = fA(T); return { eye: V.sub(s.eye, F.T), target: V.sub(s.target, F.T) }; };
  const FL_T0 = 146, FL_T1 = 158.5;
  const flKeys = [];
  for (const t of [FL_T0 - 1.5, FL_T0]) { const s = inA(t, orbitA(t)); flKeys.push({ t, eye: s.eye, target: s.target, fov: orbitA(t).fov / D2R }); }
  flKeys.push(
    { t: 148, eye: [4, 24, -122], target: [8, 26, -200], fov: 42 },
    { t: 150, eye: [14, 30, -180], target: [26, 24, -330], fov: 42 },
    { t: 152, eye: [28, 36, -265], target: [40, 14, -800], fov: 40 },
    { t: 154.2, eye: [55, 45, -420], target: [60, 12, -1300], fov: 37 },
    { t: 156.3, eye: [92, 50, -640], target: [40, 12, -1320], fov: 36 },
  );
  for (const t of [FL_T1, FL_T1 + 2]) { const s = inA(t, orbitB(t)); flKeys.push({ t, eye: s.eye, target: s.target, fov: orbitB(t).fov / D2R }); }
  const FLP = FILM.path(flKeys);
  const flight = T => { const s = FLP(T), F = fA(T); return { eye: V.add(s.eye, F.T), target: V.add(s.target, F.T), fov: s.fov, roll: 0 }; };
  const SEQ = [
    { f: orbitA, end: FL_T0 + .8, bl: 3 },
    { f: flight, end: FL_T1 + .2, bl: 3.2 },
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
    const res = v => OE.modp(v + 512, 1024) - 512;
    const rF = res(PHF[PH_N]), rR = res(PHR[PH_N]);
    for (let i = 0; i <= PH_N; i++) { PHF[i] -= rF * i / PH_N; PHR[i] -= rR * i / PH_N; }
    PSP[0] = PSP[1];
  }
  const phaseAt = T => { const x = clamp(T * 60, 0, PH_N - .001), i = Math.floor(x), f = x - i; return [PHF[i] + (PHF[i + 1] - PHF[i]) * f, PHR[i] + (PHR[i + 1] - PHR[i]) * f, PSP[i]]; };

  /* ---------------- drawing ---------------- */
  function objFog(dist) { W.fog = [Math.max(30, dist * .55), dist * 2.4 + 700]; }
  // ships fade out with distance from the lens alone (the same rule for all three keeps the seam exact)
  const shipFade = d => 1 - ss(1750, 2400, d);
  const shipSt = (S, T) => ({ sps: (T - S.tau) * (PI / 2) + 1.1, hangar: 0 });
  function drawRestShip(S, T, dist, al) {
    const Xs = OE.shipXf(S, T), a = clamp(1.25 - dist / 9000, .3, 1) * al;
    objFog(dist);
    FAST.draw(W, dist > 4200 ? C.far : dist > 1500 ? C.restF : C.rest, Xs, shipSt(S, T), { fine: dist <= 1500, a });
    return Xs;
  }
  function drawHero(T, dist, al) {
    const S = SA, Xs = OE.shipXf(S, T), fine = dist <= 1500, fi = fine ? 0 : 1, a = clamp(1.25 - dist / 9000, .3, 1) * al;
    objFog(dist);
    FAST.draw(W, fine ? C.body : C.bodyF, Xs, shipSt(S, T), { fine, a });
    if (!FAST.visible(cam, X.ap(Xs, [0, 10, 0]), 90)) return { Xs, cs: OE.ciwsState(S, T), gs: OE.gunState(S, T), spin: [0, 0] };
    const emit = FAST.emitter(W);
    const cs = OE.ciwsState(S, T), gs = OE.gunState(S, T);
    // Mk 45: house trains, barrel elevates about its trunnion
    const gX = X.mul(Xs, gP.xf({ gunYaw: gs.yaw }));
    FAST.drawPart(W, GUN.house[fi], gX, a, emit);
    FAST.drawPart(W, GUN.barrel[fi], X.mul(X.mul(gX, piv(R.x(-gs.pitch), GUN_TR)), X.make(R.I(), [0, 0, -OEFX.gunRecoil(T)])), a, emit);
    // Phalanx: mount trains, the gun group elevates; the six barrels are quantised in spin, smeared when turning fast
    const spin = [OE.ciwsSpin(S, 0, T), OE.ciwsSpin(S, 1, T)];
    for (let m = 0; m < 2; m++) {
      const mX = X.mul(Xs, cPs[m].xf({ ciwsYaw: cs.yaw }));
      FAST.drawPart(W, CIWS.base[fi], mX, a, emit);
      const eX = X.mul(mX, piv(R.x(-cs.pitch[m]), CIWS_TR));
      const rate = (OE.ciwsSpin(S, m, T + .01) - spin[m]) / .01, step = TAU / 6 / SPQ;
      const q = Math.round(OE.modp(spin[m], TAU / 6) / step) % SPQ;
      if (rate > 25) { FAST.drawPart(W, CIWS.el[q][fi], eX, a * .6, emit); FAST.drawPart(W, CIWS.el[(q + SPQ / 2) % SPQ][fi], eX, a * .45, emit); }
      else FAST.drawPart(W, CIWS.el[q][fi], eX, a, emit);
    }
    // Mk 41: module frames always; hatches are close-up detail
    const open = OE.vlsOpen(S, T), om = new Map(); if (open) for (const [i, f] of open) om.set(i, f);
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
    return { Xs, cs, gs, spin };
  }
  // SPY faces in world coordinates
  const facesW = Xs => SPY.map((c, i) => ({ c: X.ap(Xs, c), n: X.dir(Xs, SPYN[i]) }));
  function drawFaceFlash(Fw, k) {
    const n = Fw.n, h = V.norm(V.cross([0, 1, 0], n)), u = V.cross(n, h), p = [];
    for (let i = 0; i <= 8; i++) { const a = (i + .5) / 8 * TAU; p.push(V.add(V.mad(Fw.c, n, .12), V.add(V.mul(h, Math.cos(a) * 2.05), V.mul(u, Math.sin(a) * 2.05)))); }
    for (let i = 0; i < 8; i++) W.seg(p[i], p[i + 1], .75 * k);
  }
  // the incoming rounds: the model near, a dash along the line at range (a 0.7 m body is sub-pixel past ~2 km)
  function drawRounds(T, dim) {
    for (const r of OE.ROUNDS) {
      const vis = OE.roundVis(r, T) * dim; if (vis <= .003) continue;
      const p = OE.roundAt(r, T), d = V.dist(p, cam.eye), dir = OE.roundDir(r, T);
      if (d < 2500 && FAST.visible(cam, p, 6)) {
        objFog(Math.max(20, d));
        FAST.draw(W, d < 450 ? C.onk : C.onkF, X.make(R.look(dir, [0, 1, 0]), p), ONK_ST, { fine: d < 450, a: vis * clamp(1.5 - d / 2000, .45, 1), noCull: true });
      }
      W.fog = [1e8, 2e8];
      const tail = V.mad(p, dir, -4.6), L1 = Math.max(3, d * .0032), L2 = Math.max(14, d * .018);
      W.seg(V.mad(tail, dir, -L1), tail, .9 * vis);
      W.seg(V.mad(tail, dir, -L2), V.mad(tail, dir, -L1), .2 * vis);
    }
  }
  // interceptor flight paths: the path flown so far as a faint line, a short bright head, the missile when near
  function drawInterceptors(T, dim) {
    for (const I of OE.INTS) {
      if (T < I.tL) continue;
      const age = T - I.tEnd, fade = (age > 0 ? 1 - ss(0, 7, age) : 1) * dim; if (fade <= .003) continue;
      W.fog = [1e8, 2e8];
      const tr = OE.intTrace(I, T, 4);
      for (let k = 0; k < tr.length - 1; k++) W.seg(tr[k], tr[k + 1], .15 * fade);
      if (T > I.tEnd) continue;
      const h = OE.intAt(I, T), dir = OE.intDir(I, T), d = V.dist(h, cam.eye);
      W.seg(V.mad(h, dir, -Math.max(5, d * .005)), h, .85 * dim);
      if (d < 900 && FAST.visible(cam, h, 5)) {
        objFog(Math.max(15, d));
        FAST.draw(W, d < 160 ? C.sm6 : C.sm6F, X.make(R.look(dir, [0, 1, 0]), V.mad(h, dir, -3.3)), { booster: T - I.tL < 6 }, { fine: d < 160, a: dim * clamp(1.4 - d / 900, .4, 1), noCull: true });
      }
    }
  }
  // the fire's smoke: a billow per parcel along the stream; big and close they sweep across the lens
  function smokeDensity(T, e) {
    if (T < OE.HIT.t) return 0;
    let s = 0;
    for (const p of OE.PARCELS) {
      if (p.te > T) break;
      if (T - p.te > OE.smokeLife) continue;
      const q = OE.smokeAt(p, T); if (!q) continue;
      const dd = V.dist(q.c, e) / (q.r * 1.3); if (dd < 2.2) s += q.k * Math.exp(-dd * dd) * .55;
    }
    return s;
  }
  function drawSmoke(T, dim) {
    if (T < OE.HIT.t) return;
    W.fog = [1e8, 2e8];
    let pv = null;
    for (const p of OE.PARCELS) {
      if (p.te > T) break;
      const q = OE.smokeAt(p, T); if (!q || q.a > OE.smokeLife) { pv = null; continue; }
      const life = 1 - q.a / OE.smokeLife, al = .2 * q.k * life * (.45 + .55 * dim);
      const z = cam.depth(q.c); if (z < -q.r) { pv = null; continue; }
      // a billow: scalloped outline, folds inside, a smaller crown rolling over its top
      const sd = p.h1 * 37.1 + p.h2 * 5.3, wob = M3.noise(q.a * .3, p.h3 * 9);
      OEFX.billow(W, cam, q.c[0], q.c[1], q.c[2], q.r * (.9 + .08 * wob), al * 1.75, sd, q.a, 2, .2);
      const cr = q.r * (.5 + .1 * p.h3), ca = p.h2 * TAU + q.a * .1;
      OEFX.billow(W, cam, q.c[0] + cam.r[0] * Math.cos(ca) * q.r * .35, q.c[1] + q.r * .45, q.c[2] + cam.r[2] * Math.cos(ca) * q.r * .35, cr, al * 1.1, sd + 3.3, q.a, 1, .2);
      if (pv) {
        // the stream's edges: faint strands joining neighbouring parcels
        const sd = V.norm(V.cross([0, 1, 0], V.sub(q.c, cam.eye)));
        for (const f of [-.8, .8]) W.seg(V.mad(pv.c, sd, pv.r * f), V.mad(q.c, sd, q.r * f), al * .5);
      }
      pv = q;
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

  /* ---------------- log, readout, captions ---------------- */
  const LOG = [
    [.8, 'SHIP', 'Condition III · 15.6 kn · 000'], [4.5, 'SPY', 'Volume search · 4 faces'],
    [13.6, 'SPY', '2 tracks · 015 · 25 km'], [15.2, 'EVAL', 'Vampire ×2 · 3M55 · M2.0'], [41, 'SHIP', 'Raid 1 · 2 of 2 · cells 94'],
    [47.6, 'SPY', '4 tracks · 285 · 25 km'], [49, 'EVAL', 'Vampire ×4 · 3M55 · M2.0'], [74.2, 'EVAL', 'T6 leaking · 8.2 km'],
    [88.2, 'SHIP', 'Raid 2 · 4 of 4 · cells 90'], [85, 'SPY', '3 tracks · 080 · 25 km'], [92.2, 'SPY', '3 tracks · 220 · 25 km'],
    [93.4, 'EVAL', 'Vampire ×6 · two axes'],
  ];
  for (const ev of OE.EVENTS) {
    if (ev.kind === 'launch') LOG.push([ev.t, 'SM-6', `Bird away · cell ${ev.I.cell}`]);
    else if (ev.kind === 'intercept') LOG.push([ev.t, 'KILL', `${ev.r.id} · ${km(OE.roundDist(ev.r, ev.t))}`]);
    else if (ev.kind === 'miss') LOG.push([ev.t, 'MISS', `${ev.r.id} · weaves through`]);
    else if (ev.kind === 'ciws') LOG.push([ev.t, 'CIWS', `${ev.e.m ? 'Aft' : 'Fwd'} mount · ${ev.e.round.id} · ${km(OE.roundDist(ev.e.round, ev.t))}`]);
    else if (ev.kind === 'ciwsKill') LOG.push([ev.t, 'KILL', `${ev.r.id} · ${Math.round(OE.roundDist(ev.r, ev.t))} m`]);
    else if (ev.kind === 'hit') LOG.push([ev.t, 'HIT', 'Port quarter · fire aft']);
  }
  for (const e of OE.GUN_ENG) LOG.push([e.shots[0] - .05, 'GUN', `Mk 45 · ${e.round.id} · ${km(OE.roundDist(e.round, e.shots[0]))}`]);
  LOG.push([OE.DECOYS[0].t, 'DECOY', 'SRBOC · 4 rounds']);
  LOG.push([OE.HIT.t + 3.2, 'DC', 'Fire party aft · fighting on'], [141.5, 'SHIP', 'Raid 3 · 5 of 6 · hit aft'], [150.5, 'SHIP', 'Next ship · DDG · astern']);
  LOG.sort((a, b) => a[0] - b[0]);
  const logRows = document.getElementById('logRows');
  let logKey = '';
  function updateLog(T) {
    const all = LOG.map(([t, c, x]) => [t <= T ? t : t - D, c, x]).sort((a, b) => a[0] - b[0]).slice(-7);
    const key = all.map(r => r[2]).join('|');
    if (key === logKey) return; logKey = key;
    logRows.innerHTML = all.map(([t, c, x], i) => `<div class="r${i === all.length - 1 ? ' new' : ''}"><span class="c">${fmtT(t)}</span><span class="t">${c}</span><span>${x}</span></div>`).join('');
  }
  // the log's clock: ship's time, 04:12:00 at frame 0
  const fmtT = t => { const s = Math.floor(OE.modp(t, D)) + 4 * 3600 + 12 * 60; return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`.slice(3); };
  const roEl = document.getElementById('ro'); let roKey = '';
  function readout(T) {
    let k = 'SOG', v = '15.6 kn · 000';
    let best = null, bd = 1e9;
    for (const r of OE.ROUNDS) { if (!OE.roundLive(r, T)) continue; const d = OE.roundDist(r, T); if (d < bd) { bd = d; best = r; } }
    if (best) { k = 'Closest'; v = `${best.id} · ${bd < 1000 ? Math.round(bd) + ' m' : km(bd)} · M2.0`; }
    else if (T > OE.HIT.t && T < 147) { k = 'Damage'; v = 'fire aft · 15.6 kn'; }
    else if (T >= 147 && T < 159) { k = 'Next ship'; v = `DDG · ${km(V.dist(cam.eye, OE.shipPos(SB, T)))} astern`; }
    const key = k + v; if (key === roKey) return; roKey = key;
    roEl.innerHTML = `<span class="k">${k}</span>${v}`;
  }
  const CH = [
    { t: 0, title: 'Watch', sub: 'DDG Flight IIA underway · 15.6 kn' },
    { t: 11, title: 'Contact', sub: 'Raid one · two rounds from 015' },
    { t: 43, title: 'Ripple', sub: 'Raid two · four rounds from 285' },
    { t: 73, title: 'Close-in', sub: 'The 5-inch gun, then Phalanx at 480 m' },
    { t: 89, title: 'Two bearings', sub: 'Raid three · six rounds from 080 and 220' },
    { t: 125.5, title: 'Hit', sub: 'Hit aft · the ship keeps fighting' },
    { t: 144, title: 'Sister ship', sub: 'Through the smoke to the next destroyer' },
  ];
  const figT = document.getElementById('figT'), figS = document.getElementById('figS');

  /* ---------------- sound (bed + simple cues; stage B adds its own through OEFX.cues) ---------------- */
  const SND = { on: false };
  function sndInit() {
    const S = STAGE.SFX; if (!S.ac || SND.on) return !!SND.on;
    const ac = S.ac, out = S.master;
    const nb = (() => { const b = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = l * .97 + w * .03; d[i] = w * .5 + l * 3; } return b; })();
    const src = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || .7; return b; };
    const bed = gain(0); src().connect(filt('lowpass', 380)).connect(bed).connect(out);
    const hum = gain(0), ho = ac.createOscillator(); ho.type = 'triangle'; ho.frequency.value = 61; ho.connect(filt('lowpass', 200)).connect(hum).connect(out); ho.start();
    const fire = gain(0); src().connect(filt('lowpass', 260, .6)).connect(fire).connect(out);
    Object.assign(SND, { on: true, bed, hum, fire });
    return true;
  }
  function sndUpdate(T, playing) {
    if (!sndInit()) return;
    const ac = STAGE.SFX.ac, t = ac.currentTime, set = (p, v) => p.setTargetAtTime(STAGE.SFX.on && playing ? v : 0, t, .12);
    const e = cam.eye, dA = V.dist(X.ap(fA(T), [0, 10, 0]), e), dB = V.dist(X.ap(fB(T), [0, 10, 0]), e);
    set(SND.bed.gain, .05 + .05 * (1 - sat(e[1] / 300)));
    set(SND.hum.gain, .05 * (1 / (1 + dA / 120) + 1 / (1 + dB / 120)));
    set(SND.fire.gain, .08 * OE.fireK(T) / (1 + V.dist(X.ap(fA(T), OE.HIT.fire), e) / 60));
  }
  const S = STAGE.SFX, CUES = [];
  for (const ev of OE.EVENTS) {
    if (ev.kind === 'launch') CUES.push([ev.t, () => { S.noise(2.8, 160, .8, .2, .03); S.noise(.9, 2400, .5, .05, .01); }]);
    else if (ev.kind === 'intercept' || ev.kind === 'miss') { const d = OE.roundDist(ev.r, ev.t); CUES.push([ev.t + Math.min(6, d / 343 * .35), () => { S.tone(48, 32, 1.1, 'sine', .05); S.noise(1.6, 150, .8, .04, .03); }]); }
    else if (ev.kind === 'ciws') CUES.push([ev.t, () => { S.noise(ev.e.t1 - ev.e.t0 + .1, 1400, 2.4, .05, .02); S.tone(75, 75, ev.e.t1 - ev.e.t0, 'square', .012); }]);
    else if (ev.kind === 'gun') CUES.push([ev.t, () => { S.tone(62, 36, .5, 'sine', .14); S.noise(.35, 700, 1, .08, .003); }]);
    else if (ev.kind === 'decoy') CUES.push([ev.t, () => S.noise(.8, 1800, .7, .05, .01)]);
    else if (ev.kind === 'hit') CUES.push([ev.t, () => { S.tone(44, 28, 1.6, 'sine', .2); S.crack(); S.rumble(3.5, .25); }]);
  }
  for (const c of OEFX.cues || []) CUES.push(c);

  /* ---------------- render ---------------- */
  const shipsForSea = [];
  const GL = [];
  const K_ = { W, cam, glow: (p, a, m, px, max) => GL.push({ p, a, m, px: px || 4, max: max || 160 }), hero: null, dim: 1 };
  function render(T, info) {
    const shot = shotAt(T);
    const dv = V.norm(V.sub(shot.target, shot.eye));
    cam.up = Math.abs(dv[1]) > .985 ? [0, 0, 1] : [0, 1, 0];
    FILM.apply(cam, shot);
    cam.shake = OEFX.shake(T) || [0, 0];
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    W.reset(); W.style(WH, 1); W.fog = [1e8, 2e8];
    GL.length = 0;
    const e = cam.eye, dim = 1 - .62 * sat(smokeDensity(T, e));
    // sea
    shipsForSea.length = 0;
    for (const Sx of OE.SHIPS) { const p = OE.shipPos(Sx, T); shipsForSea.push({ S: Sx, x: p[0], z: p[2], L: Sx.L, r2: Math.pow(Sx.L / 2 + 25, 2) }); }
    const ph = phaseAt(T);
    OE.drawSea(W, cam, T, ph, { ships: shipsForSea, speed: ph[2], alpha: dim, horizon: dim });
    OE.drawCaps(W, cam, T, { ships: shipsForSea, alpha: dim });
    OE.drawIsland(W, cam, { alpha: dim });
    // wakes, ships, shimmer
    let hero = null;
    for (const Sx of OE.SHIPS) {
      const p = OE.shipPos(Sx, T), dist = V.dist([p[0], 10, p[2]], e), fade = shipFade(dist) * dim;
      if (fade <= .003) continue;
      W.fog = [1e8, 2e8]; OE.drawWake(W, Sx, T, { alpha: clamp(1.4 - dist / 7000, .35, 1) * fade });
      let Xs;
      if (Sx.n === 0) { hero = drawHero(T, dist, fade); Xs = hero.Xs; }
      else Xs = drawRestShip(Sx, T, dist, fade);
      W.fog = [1e8, 2e8];
      if (Sx.n === 0) {
        const Fw = facesW(Xs);
        const fired = OE.drawPulses(W, Sx, T, Fw, { alpha: clamp(1.3 - dist / 8000, .4, 1) * fade });
        for (const f of fired) drawFaceFlash(Fw[f.f], f.k * clamp(1 - dist / 2500, 0, 1) * fade);
      }
      if (dist < 2500) {
        const tau = T - Sx.tau, up = X.dir(Xs, [0, 1, 0]), aft = X.dir(Xs, [0, 0, -1]), side = X.dir(Xs, [1, 0, 0]);
        for (const m of DA.stacks) OE.drawShimmer(W, X.ap(Xs, m), up, aft, side, tau, { alpha: clamp(1.2 - dist / 1800, 0, 1) * fade, w: 3.4 });
      }
    }
    // the raids
    drawRounds(T, dim);
    drawInterceptors(T, dim);
    K_.hero = hero ? { X: hero.Xs, ciws: hero.cs, gun: hero.gs, spin: hero.spin } : null; K_.dim = dim;
    for (const fx of ['launchFx', 'interceptFx', 'ciwsFx', 'gunFx', 'decoyFx', 'hitFx']) { W.fog = [1e8, 2e8]; OEFX[fx](T, K_); }
    drawSmoke(T, dim);
    W.flush(ctx);
    // glows from the hooks (additive, restrained)
    if (GL.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const gl of GL) {
        const p = cam.project(gl.p); if (!p || gl.a <= .004) continue;
        const r = Math.min(gl.max, gl.px + gl.m * cam.fl / p[2]);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        g.addColorStop(0, `rgba(255,255,255,${Math.min(1, gl.a).toFixed(3)})`); g.addColorStop(.22, `rgba(255,250,235,${(gl.a * .3).toFixed(3)})`); g.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // menu-side calm (off with the UI: H gives the clean film)
    if (!FILM.uiHidden) {
      const lg = ctx.createLinearGradient(0, 0, 760, 0);
      lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.62, 'rgba(0,0,0,.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, 760, 1080);
      // and a soft shade behind the log so its lines read over the rigging
      const rg = ctx.createRadialGradient(1660, 160, 30, 1660, 160, 400);
      rg.addColorStop(0, 'rgba(0,0,0,.82)'); rg.addColorStop(.55, 'rgba(0,0,0,.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(1200, 0, 720, 580);
    }
    // labels
    const labels = [], XsA = hero ? hero.Xs : OE.shipXf(SA, T);
    const shipLab = (S, sub2, a) => labels.push({ id: 'DDG · Arleigh Burke IIA', sub: sub2, at: X.ap(OE.shipXf(S, T), [0, 22, 14]), a, dx: 80, dy: -100 });
    shipLab(SA, '155 m · Flight IIA · 15.6 kn', win(T, 2.5, 9.5));
    shipLab(SB, '155 m · the next ship', win(T, D - 9.5, D - 2.5));
    labels.push({ id: 'AN/SPY-1D(V)', sub: 'array face · 045', at: X.ap(XsA, SPY[0]), a: win(T, 13.2, 19.4), dx: 70, dy: -80 });
    labels.push({ id: 'Mk 41 VLS', sub: 'forward · 32 cells', at: X.ap(XsA, TG.vlsF), a: win(T, 20.6, 24.6), dx: 70, dy: -70 });
    labels.push({ id: 'AN/SPY-1D(V)', sub: 'array face · 315', at: X.ap(XsA, SPY[1]), a: win(T, 50.5, 55.6), dx: 70, dy: -80 });
    labels.push({ id: 'Mk 41 VLS', sub: 'fore 32 · aft 64 cells', at: X.ap(XsA, TG.vlsF), a: win(T, 56, 60), dx: 70, dy: -70 });
    labels.push({ id: 'Phalanx 1B', sub: 'aft mount · 20 mm', at: X.ap(XsA, TG.cA), a: win(T, 80.2, 87), dx: 70, dy: -80 });
    labels.push({ id: 'Mk 45 5"/62', sub: 'Mod 4 gun', at: X.ap(XsA, TG.gun), a: win(T, 102.6, 110.5), dx: 70, dy: -80 });
    labels.push({ id: 'Phalanx 1B', sub: 'forward mount · 20 mm', at: X.ap(XsA, TG.cF), a: win(T, 115.5, 121.4), dx: 70, dy: -80 });
    labels.push({ id: 'Mk 36 SRBOC', sub: 'decoy launchers', at: X.ap(XsA, [5.5, 11.2, 2.2]), a: win(T, 115.5, 118.6), dx: 70, dy: -70 });
    for (const [r, a, b, sub2] of [[RID.T1, 28, 34.4, null], [RID.T6, 73, 85.8, 'weaving'], [RID.T9, 116, 120.8, null], [RID.T11, 127.8, 130.6, null]]) {
      const w = win(T, a, Math.min(b, r.tEnd - .05), .6) * OE.roundVis(r, T); if (w <= .01) continue;
      labels.push({ id: `3M55 · ${r.id}`, sub: `${sub2 ? sub2 + ' · ' : ''}${OE.roundDist(r, T) < 1000 ? Math.round(OE.roundDist(r, T)) + ' m' : km(OE.roundDist(r, T))}`, y: true, at: OE.roundAt(r, T), a: w, dx: 64, dy: -70 });
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
    const Xs = OE.shipXf(SA, T), o = { eye: sh.eye.map(Math.round), fov: +(sh.fov / D2R).toFixed(1) };
    o.bow = P(X.ap(Xs, DA.bow)); o.stern = P(X.ap(Xs, DA.stern)); o.mid = P(X.ap(Xs, [0, 12, 0]));
    for (const k of ['vlsF', 'vlsA', 'gun', 'cF', 'cA']) o[k] = P(X.ap(Xs, TG[k]));
    for (const r of OE.ROUNDS) if (OE.roundLive(r, T)) o[r.id] = P(OE.roundAt(r, T));
    for (const I of OE.INTS) if (T >= I.tL && T <= I.tEnd) o['I' + I.i] = P(OE.intAt(I, T));
    o.B = P(X.ap(OE.shipXf(SB, T), [0, 12, 0]));
    return o;
  }
  window.OEX = { shotAt, cam, phaseAt, SEQ, proj, ORBF };
})();
