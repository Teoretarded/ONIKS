/* OG "Bullet Time": the last ~20 s of a destroyer's defence stretched over a 160 s take by a variable clock
   (OGC, og_bullet_time_world.js): x1 at the start, x0.02 through three long freezes, x1 for the last seconds,
   then a rewind to the calm first frame. The camera moves at its own real-time speed through the nearly frozen
   fight: past the destroyer, up an interceptor's path, past rounds hanging over the water, riding one in, under
   the Phalanx mount, to the last round a few metres from the hull. Stage A: clock + readout, camera, sea, ship,
   rounds, interceptor paths, mounts, labels, menu, log, captions, rewind, seam. The combat effects live in
   og_bullet_time_fx.js (OGFX hooks: plumeFx, tracerFx, burstFx, fragmentsFx, hitFx). */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D2R, PI, TAU, DA, VK } = OG;
  const D = OGC.D;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const sm = t => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const cam = new Cam(1920, 1080), W = new Wire(cam, { fog: [1e8, 2e8], color: '#F6F5F2' });
  const HI = '#F4D23C', WH = '#F6F5F2';
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  const Sx = T => OGC.S(T);
  const RID = OG.RID, IID = OG.IID, R4 = RID.R4;
  // R3's kill point and the forward mount's line of fire onto it: [side (off the line, north-west), up, along
  // (+ away from the ship)] offsets for the freeze-C camera that watches the stream side-on and holds on the burst
  const K3 = OG.roundAt(RID.R3, RID.R3.tEnd), US = (() => { const s = OG.shipPos(RID.R3.tEnd); return V.norm([K3[0] - s[0], 0, K3[2] - s[2]]); })();
  const K3W = v => [K3[0] - US[2] * v[0] + US[0] * v[2], K3[1] + v[1], K3[2] + US[0] * v[0] + US[2] * v[2]];

  /* ---------------- menu ---------------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((it, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('og' + i)}<span class="tx">${it}</span></span><span class="go">→</span><div class="bar"></div></div>`).join('');
  STAGE.menu({ el: menuEl, blurb: document.getElementById('blurb') });

  /* ---------------- models (compiled once for the fast hairline path, as in Ring) ---------------- */
  const DDM = HD.destroyer(), part = n => DDM.parts.find(p => p.name === n);
  const MOVING = ['gun', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA'];
  const sub = (m, keep) => ({ parts: m.parts.filter(p => keep(p.name)) });
  const cp = (prims, fine) => FAST.compilePrims(prims, fine);
  function split(p, st) { const a = p.dyn(st), b = p.dyn(st), fixed = [], moving = []; a.forEach((q, i) => (q === b[i] ? fixed : moving).push(q)); return { fixed, moving }; }
  const C = {
    body: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: true }),
    bodyF: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: false }),
  };
  const GUN_TR = [0, 1.28, .95], CIWS_TR = [0, 1.55, 0];
  const gP = part('gun'), gS = split(gP, { gunPitch: 0 });
  const GUN = { house: [cp(gS.fixed, true), cp(gS.fixed, false)], barrel: [cp(gS.moving, true), cp(gS.moving, false)] };
  // Phalanx: the six barrels turn with the sim clock, so a slow clock shows them stepping round; 24 poses per 60°
  const cPs = [part('ciwsF'), part('ciwsA')], cS = split(cPs[0], { ciwsPitch: [0, 0], ciwsSpin: 0 });
  const SPQ = 24;
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
  const ONK_ST = { booster: false, cover: false, wing: 1, fin: 1 };
  const SM6_NOSE = 3.275;                                 // head of the path = the SM-6's nose; origin mid-stack

  /* ======================================================================================================
     CAMERA
     Shots are keyframed in world points at their key times (helpers below place them on the ship, on an
     interceptor or on a round at that moment), stored relative to the shot's anchor (the ship's heading frame,
     or R4 itself for the ride in), Hermite-interpolated with look angles (not target points, so near and far
     aims blend without swinging). bias (deg) turns the lens left so the subject sits right of the menu.
     Shot A also carries the rewind (keys at T - D < 0) so the take arrives on frame 0 moving as it left it.
     ====================================================================================================== */
  function frameOff(f, v) {
    if (!v) return [0, 0, 0];
    let rt = V.cross([0, 1, 0], f); if (V.len(rt) < 1e-6) rt = [1, 0, 0]; rt = V.norm(rt);
    const up = V.cross(f, rt);
    return [rt[0] * v[0] + up[0] * v[1] + f[0] * v[2], rt[1] * v[0] + up[1] * v[1] + f[1] * v[2], rt[2] * v[0] + up[2] * v[1] + f[2] * v[2]];
  }
  const WP = {
    ship: (t, v) => V.add(OG.shipPos(Sx(t)), v),                       // ship heading frame (no roll)
    shipX: (t, v) => X.ap(OG.shipXf(Sx(t)), v),                        // on the rolling ship
    // on an interceptor ([right, up, fwd] in its travel frame; clamped to its cell / meeting point)
    I: (t, id, v) => { const I = IID[id], S = Sx(t); return V.add(OG.intAtC(I, S), frameOff(OG.intDir(I, S), v)); },
    // on a round ([right, up, fwd] in its travel frame)
    R: (t, id, v) => { const r = RID[id], S = Math.min(Sx(t), r.tEnd - 1e-4); return V.add(OG.roundAt(r, S), frameOff(OG.roundDir(r, S), v)); },
  };
  const ANC = {
    ship: T => OG.shipPos(Sx(T)),
    R4: T => OG.roundAt(R4, Math.min(Sx(T), R4.tEnd - 1e-4)),
  };
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
  const FIELDS = ['ex', 'ey', 'ez', 'az', 'el', 'fov', 'bias', 'roll'];
  function mkShot(anchor, keys) {
    let prevAz = null;
    const ks = keys.map(k => {
      const a = anchor(k.t), d = V.sub(k.at, k.eye);
      let az = Math.atan2(d[0], d[2]); if (prevAz !== null) az = prevAz + OG.angD(prevAz, az); prevAz = az;
      return { t: k.t, ex: k.eye[0] - a[0], ey: k.eye[1] - a[1], ez: k.eye[2] - a[2], az, el: Math.atan2(d[1], Math.hypot(d[0], d[2])),
        fov: k.fov || 40, bias: k.bias === undefined ? 8 : k.bias, roll: k.roll || 0 };
    });
    const H = herm(ks, FIELDS);
    const f = T => { const k = H(T), a = anchor(T); return { eye: [a[0] + k.ex, a[1] + k.ey, a[2] + k.ez], az: k.az, el: k.el, fov: k.fov, bias: k.bias, roll: k.roll }; };
    f.keys = ks;
    return f;
  }
  // a shot's pose as a key (to start the next shot exactly where this one is)
  const asKey = (shot, t) => { const s = shot(t), d = [Math.cos(s.el) * Math.sin(s.az), Math.sin(s.el), Math.cos(s.el) * Math.cos(s.az)]; return { t, eye: s.eye, at: V.mad(s.eye, d, 100), fov: s.fov, bias: s.bias, roll: s.roll }; };
  const K = (t, eye, at, fov, bias, roll) => ({ t, eye, at, fov, bias, roll });
  const sh = WP.ship, shX = WP.shipX;

  /* --- shot A: the rewind's arrival (T - D < 0), the calm, past the destroyer, up I1's path, out to the water --- */
  const TO = [5200 * Math.sin(70 * D2R), 8, 5200 * Math.cos(70 * D2R)];        // out along the threat axis (ship frame)
  const keysA0 = [
    K(-12, sh(-12, [74, 34, 96]), sh(-12, [6, 10, 20]), 40, 6),
    K(-6, sh(-6, [150, 30, 4]), sh(-6, [0, 14, 4]), 36, 7),
    K(0, sh(0, [192, 26, -92]), sh(0, [0, 12, 12]), 34, 8),
    K(3.5, sh(3.5, [166, 24, -80]), sh(3.5, [0, 18, 10]), 35, 8),
    // freeze A: in over the starboard quarter to I2 rising out of the aft cells in its fire
    K(7.2, sh(7.2, [100, 22, -70]), sh(7.2, [0, 22, -26]), 37, 7),
    K(12, sh(12, [34, 26, -58]), WP.I(12, 'I2', [0, -3, 0]), 38, 9),
    K(16, sh(16, [15, 35, -45]), WP.I(16, 'I2', [0, -3.5, 0]), 40, 10),
    // forward past it along the starboard side of the superstructure (stacks, mast, SPY), then up I1's column
    // above the forward cells and out along its path to the missile hanging over the sea
    K(19, sh(19, [12, 29, -12]), sh(19, [0, 22, 30]), 44, 6),
    K(21.5, sh(21.5, [11, 25, 12]), sh(21.5, [0, 40, 30]), 46, 6),
    K(23.5, sh(23.5, [5, 58, 29]), WP.I(23.5, 'I1'), 42, 6),
    K(28, WP.I(28, 'I1', [6, -3, -45]), WP.I(28, 'I1', [0, 0, -3.3]), 38, 7),
    K(31, WP.I(31, 'I1', [7, -1, -9]), WP.I(31, 'I1', [0, 0, -3.3]), 40, 13),
    K(34, WP.I(34, 'I1', [-2, 4, 13]), WP.I(34, 'I1', [0, 0, -3.3]), 42, 12),
    // transit 1: the clock speeds up, the interceptors streak off; out along the threat axis, down to the water
    K(38.5, sh(38.5, [380, 128, 190]), sh(38.5, TO), 42, 7),
    K(46, sh(46, [1250, 55, 480]), sh(46, TO), 40, 7),
    K(52, sh(52, [2080, 22, 720]), WP.R(52, 'R4', [50, 0, -40]), 36, 7),
    K(57, sh(57, [2470, 16, 850]), WP.R(57, 'R4', [50, 0, -40]), 34, 7),
  ];
  // the rewind leg is filled in after the last shot exists (its first keys come from it)
  let shotA = mkShot(ANC.ship, keysA0);

  /* --- shot B: the rounds over the water, riding R4 in (anchored on R4; offsets [right, up, fwd] in its travel
     frame; R3 flies ~70 m behind and 30..105 m to its right) --- */
  const R4f = (t, v) => WP.R(t, 'R4', v);
  const keysB = [asKey(shotA, 54), asKey(shotA, 56.5),
    K(62, R4f(62, [30, 8, 190]), R4f(62, [50, 0, -40]), 34, 8),
    K(67, R4f(67, [22, 5, 110]), R4f(67, [20, 0, -20]), 36, 8),
    // past R4 close on its right, R3 beyond
    K(71, R4f(71, [16, 3, 18]), R4f(71, [0, 0, -1]), 38, 10),
    K(74, R4f(74, [34, 4, -26]), R4f(74, [0, 0, -2]), 40, 9),
    // on to R3, past it, and round behind the pair to face the ship
    K(77.5, R4f(77.5, [88, 4, -48]), R4f(77.5, [104, 1.5, -72]), 40, 10),
    K(81, R4f(81, [70, 7, -100]), R4f(81, [30, 2, 40]), 38, 8),
    K(86, R4f(86, [-12, 6, -44]), sh(86, [0, 14, 0]), 36, 8),
    // transit 2: the clock runs up to x0.3 and the ship grows over R4's back
    K(91, R4f(91, [-7, 5, -28]), sh(91, [0, 14, 0]), 36, 8),
    K(95.5, R4f(95.5, [-2, 8, -22]), sh(95.5, [0, 14, 10]), 36, 8),
    // over its back to its right side: R4 in profile, the ship ahead of it on the right
    K(100, R4f(100, [14, 3.5, 1]), R4f(100, [0, 0, -4]), 38, 7),
    // freeze C: off R4's right side, a little off the forward mount's line of fire, looking back up it at R3:
    // the stream runs from beside the lens out to R3 as it flies into it
    K(104.5, K3W([16, 7, -42]), K3W([0, 1, 60]), 38, 7),
    K(108.5, K3W([21, 6, -35]), K3W([0, 1, 28]), 40, 7),
    // R3 stopped ~35 m off the lens: hold on the burst as it opens, drifting round to its side
    K(111.9, K3W([26, 5, -25]), K3W([0, 1, 1]), 42, 7),
    K(115.3, K3W([33, 4.5, -3]), K3W([0, 1.5, -2]), 44, 7),
    // then turn and rush the ship
    K(117.3, K3W([24, 7, -34]), K3W([-4, 6, -110]), 44, 7),
  ];
  const shotB = mkShot(ANC.R4, keysB);

  /* --- shot C: in to the ship's starboard bow and under the forward Phalanx, then out to meet R4 --- */
  const keysC = [asKey(shotB, 116.2), asKey(shotB, 117.3),
    K(120.3, sh(120.3, [120, 20, 84]), sh(120.3, [0, 12, 33]), 42, 7),
    K(122.6, sh(122.6, [26, 11, 44]), sh(122.6, [0, 13, 33]), 44, 6),
    K(124.5, sh(124.5, [6, 9, 37.5]), sh(124.5, [0, 12.6, 33.6]), 48, 4),
    // out over the starboard side, meeting R4 head-on; it passes close on our right
    K(127.5, sh(127.5, [45, 9.5, 42]), WP.R(127.5, 'R4'), 44, 6),
    K(131, sh(131, [110, 10, 40]), WP.R(131, 'R4'), 42, 6),
  ];
  const shotC = mkShot(ANC.ship, keysC);

  /* --- shot D: the whip round behind R4 and the ride on its left the last hundred metres to the hull; the
     kill, the flash, real time --- */
  const keysD = [asKey(shotC, 129.5), asKey(shotC, 131),
    K(133.5, R4f(133.5, [-7, 3.5, -16]), R4f(133.5, [2, -2.5, 40]), 40, 5),
    K(136, R4f(136, [-5, 3.2, -12.5]), R4f(136, [2.5, -1, 30]), 42, 3),
    K(138.4, R4f(138.4, [-4.2, 2.8, -10.5]), R4f(138.4, [3, 1.4, 26]), 43, 5),
    K(140.5, R4f(140.5, [-9, 5, -22]), R4f(140.5, [3, 2, 14]), 44, 6),
    K(143, R4f(143, [-16, 9, -36]), R4f(143, [4, 3, 10]), 42, 6),
    K(145, R4f(145, [-24, 13, -48]), R4f(145, [4, 4, 10]), 42, 6),
  ];
  const shotD = mkShot(ANC.R4, keysD);
  // shot A's rewind leg starts from shot D (T - D)
  {
    const k1 = asKey(shotD, 142.5), k2 = asKey(shotD, 144.5);
    k1.t -= D; k2.t -= D;
    shotA = mkShot(ANC.ship, [k1, k2, ...keysA0]);
  }
  const SEQ = [
    { f: T => shotA(T), end: 55.2, bl: 2.4 },
    { f: shotB, end: 116.75, bl: 1.1 },
    { f: shotC, end: 131.5, bl: 2 },
    { f: shotD, end: 143.5, bl: 2 },
    { f: T => shotA(T - D), end: 1e9, bl: 0 },
  ];
  /* the lens leans toward moving subjects for a while (weight w, eased in over fi, out over fo) */
  const TRK = [
    // keep R4 framed as we fly out to meet it and it passes
    { a: 125.6, b: 133.2, fi: 1.2, fo: 1.6, w: .8, p: T => OG.roundAt(R4, Math.min(Sx(T), R4.tEnd)) },
    // after the hit the ship steams on out of its own smoke: the lens keeps the breach in frame
    { a: 138.9, b: 145.2, fi: 1.4, fo: 1.6, w: .55, p: T => X.ap(OG.shipXf(Sx(T)), OG.HIT.at) },
  ];
  const dirOf = s => [Math.cos(s.el) * Math.sin(s.az), Math.sin(s.el), Math.cos(s.el) * Math.cos(s.az)];
  function poseAt(T) {
    T = ((T % D) + D) % D;
    for (let i = 0; i < SEQ.length; i++) {
      const s = SEQ[i], w0 = s.end - s.bl / 2, w1 = s.end + s.bl / 2;
      if (T < w0 || i === SEQ.length - 1) return fin(s.f(T), T);
      if (T < w1) return mixP(fin(s.f(T), T), fin(SEQ[i + 1].f(T), T), sm((T - w0) / s.bl));
    }
    return fin(SEQ[SEQ.length - 1].f(T), T);
  }
  function fin(s, T) {
    let d = dirOf(s);
    for (const tr of TRK) {
      if (T < tr.a || T > tr.b) continue;
      const w = tr.w * ss(tr.a, tr.a + tr.fi, T) * (1 - ss(tr.b - tr.fo, tr.b, T)); if (w <= 0) continue;
      const p = tr.p(T); if (!p) continue;
      d = V.norm(V.lerp(d, V.norm(V.sub(p, s.eye)), w));
    }
    const cb = Math.cos(s.bias * D2R), sb = Math.sin(s.bias * D2R);
    d = [d[0] * cb - d[2] * sb, d[1], d[2] * cb + d[0] * sb];
    return { eye: s.eye, dir: d, fov: s.fov * D2R, roll: s.roll * D2R };
  }
  function mixP(a, b, w) {
    if (w <= 0) return a; if (w >= 1) return b;
    return { eye: V.lerp(a.eye, b.eye, w), dir: V.norm(V.lerp(a.dir, b.dir, w)), fov: mix(a.fov, b.fov, w), roll: mix(a.roll, b.roll, w) };
  }
  const shotAt = T => { const p = poseAt(T); return { eye: p.eye, target: V.mad(p.eye, p.dir, 100), fov: p.fov, roll: p.roll }; };

  /* sea row phases: the camera's travel along / across its view, integrated once; the residual mod 1024 m is
     spread over the loop so the rows at T = D stand where they stood at T = 0 */
  const PH_N = D * 60, PHF = new Float64Array(PH_N + 1), PHR = new Float64Array(PH_N + 1), PSP = new Float32Array(PH_N + 1);
  {
    let prev = null;
    for (let i = 0; i <= PH_N; i++) {
      const s = shotAt(i === PH_N ? D - 1e-6 : i / 60), f = V.norm(V.sub(s.target, s.eye));
      const r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
      let fx = f[0] + u[0] * .8, fz = f[2] + u[2] * .8; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      if (prev) { const dx = s.eye[0] - prev[0], dz = s.eye[2] - prev[2]; PHF[i] = PHF[i - 1] + dx * fx + dz * fz; PHR[i] = PHR[i - 1] + dx * fz - dz * fx; PSP[i] = Math.hypot(dx, dz) * 60; }
      prev = s.eye;
    }
    const res = v => OG.modp(v + 512, 1024) - 512;
    const rF = res(PHF[PH_N]), rR = res(PHR[PH_N]);
    for (let i = 0; i <= PH_N; i++) { PHF[i] -= rF * i / PH_N; PHR[i] -= rR * i / PH_N; }
    PSP[0] = PSP[1];
  }
  const phaseAt = T => { const x = clamp(T * 60, 0, PH_N - .001), i = Math.floor(x), f = x - i; return [PHF[i] + (PHF[i + 1] - PHF[i]) * f, PHR[i] + (PHR[i + 1] - PHR[i]) * f, PSP[i]]; };

  /* ---------------- drawing ---------------- */
  function objFog(dist) { W.fog = [Math.max(30, dist * .55), dist * 2.4 + 700]; }
  const shipSt = S => ({ sps: S * (PI / 2) + 1.1, hangar: 0 });
  function drawShip(T, S, rate, dist) {
    const Xs = OG.shipXf(S), fine = dist <= 1500, fi = fine ? 0 : 1, a = clamp(1.25 - dist / 9000, .3, 1);
    objFog(dist);
    FAST.draw(W, fine ? C.body : C.bodyF, Xs, shipSt(S), { fine, a });
    const cs = OG.ciwsState(S), gs = OG.gunState(S), spin = [OG.ciwsSpin(0, S), OG.ciwsSpin(1, S)];
    if (!FAST.visible(cam, X.ap(Xs, [0, 10, 0]), 90)) return { Xs, cs, gs, spin };
    const emit = FAST.emitter(W);
    const gX = X.mul(Xs, gP.xf({ gunYaw: gs.yaw }));
    FAST.drawPart(W, GUN.house[fi], gX, a, emit);
    FAST.drawPart(W, GUN.barrel[fi], X.mul(gX, piv(R.x(-gs.pitch), GUN_TR)), a, emit);
    // Phalanx: mount trains, the gun group elevates; the barrels step round with the sim clock, smeared when the
    // clock runs them fast
    for (let m = 0; m < 2; m++) {
      const mX = X.mul(Xs, cPs[m].xf({ ciwsYaw: cs.yaw }));
      FAST.drawPart(W, CIWS.base[fi], mX, a, emit);
      const eX = X.mul(mX, piv(R.x(-cs.pitch[m]), CIWS_TR));
      const w = Math.abs(OG.spinRate(m, S) * rate), step = TAU / 6 / SPQ;
      const q = Math.round(OG.modp(spin[m], TAU / 6) / step) % SPQ;
      if (w > 30) { FAST.drawPart(W, CIWS.el[q][fi], eX, a * .6, emit); FAST.drawPart(W, CIWS.el[(q + SPQ / 2) % SPQ][fi], eX, a * .45, emit); }
      else FAST.drawPart(W, CIWS.el[q][fi], eX, a, emit);
    }
    const open = OG.vlsOpen(S), om = new Map(); if (open) for (const [i, f] of open) om.set(i, f);
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
  /* the rounds: the model near; a tick at range (a 0.7 m body is sub-pixel past ~2 km); a faint line along the
     last stretch of its path; a motion streak as long as the clock makes it (none when frozen) */
  function drawRounds(T, S, rate) {
    for (const r of OG.ROUNDS) {
      const vis = OG.roundVis(r, S); if (vis <= .003) continue;
      const p = OG.roundAt(r, S), d = V.dist(p, cam.eye), dir = OG.roundDir(r, S);
      if (d < 2600 && FAST.visible(cam, p, 6)) {
        objFog(Math.max(20, d));
        FAST.draw(W, d < 450 ? C.onk : C.onkF, X.make(R.look(dir, [0, 1, 0]), p), ONK_ST, { fine: d < 450, a: vis * clamp(1.5 - d / 2000, .45, 1), noCull: true });
      }
      W.fog = [1e8, 2e8];
      const tail = V.mad(p, dir, -4.45);
      // the path it has flown, fading back over ~1.2 km
      let pv = tail;
      for (let k = 1; k <= 12; k++) {
        const q = OG.roundAt(r, S - k * .15);
        W.seg(pv, q, .1 * vis * (1 - k / 13) * clamp(d / 120, .25, 1));
        pv = q;
      }
      const streak = VR_ * Math.abs(rate) / 30;
      if (streak > .3) W.seg(V.mad(tail, dir, -streak), tail, .75 * vis);
      if (d > 700) { const L1 = Math.max(3, d * .0028); W.seg(V.mad(tail, dir, -L1), V.mad(p, dir, 4.45), .9 * vis); }
    }
  }
  const VR_ = OG.VR;
  /* interceptor flight paths as plain lines: flown so far faint, a bright head, the missile when near */
  function drawInterceptors(T, S, rate) {
    for (const I of OG.INTS) {
      if (S < I.tL) continue;
      const age = S - I.tEnd, fade = age > 0 ? 1 - ss(0, 6, age) : 1; if (fade <= .003) continue;
      W.fog = [1e8, 2e8];
      const tr = OG.intTrace(I, S, 6);
      for (let k = 0; k < tr.length - 1; k++) W.seg(tr[k], tr[k + 1], .16 * fade);
      if (S > I.tEnd) continue;
      const h = OG.intAt(I, S), dir = OG.intDir(I, S), d = V.dist(h, cam.eye);
      W.seg(V.mad(h, dir, -Math.max(5, d * .005)), h, .85);
      const streak = OG.intSpeed(I, S) * Math.abs(rate) / 30;
      if (streak > .3) W.seg(V.mad(h, dir, -streak - 6.5), V.mad(h, dir, -6.5), .5);
      if (d < 1200 && FAST.visible(cam, h, 5)) {
        objFog(Math.max(15, d));
        FAST.draw(W, d < 200 ? C.sm6 : C.sm6F, X.make(R.look(dir, [0, 1, 0]), V.mad(h, dir, -SM6_NOSE)), { booster: S - I.tL < OG.SEP }, { fine: d < 200, a: clamp(1.4 - d / 1200, .4, 1), noCull: true });
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
      ly = clamp(ly, 440, 900);
      let x0 = left ? lx - wv - 6 : lx + 6;
      x0 = clamp(x0, 720, 1810 - wv);
      lx = left ? x0 + wv + 6 : x0 - 6;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find(b => x0 < b[2] + 12 && x0 + wv > b[0] - 12 && ly - 10 < b[3] && ly + 34 > b[1]);
        if (!hit) break;
        ly = clamp(hit[1] - 48, 440, 900) === ly ? ly + 48 : hit[1] - 48;
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
  const mOrKm = d => d < 1000 ? Math.round(d) + ' m' : km(d);

  /* ---------------- clock, log, readout, captions ---------------- */
  const clkR = document.getElementById('clkR'), clkL = document.getElementById('clkL'), clkBar = document.getElementById('clkBar');
  const T_IMP = R4.tArr;
  const fmtS = s => { const a = Math.abs(s); return `${String(Math.floor(a / 60)).padStart(2, '0')}:${(a % 60).toFixed(2).padStart(5, '0')}`; };
  const fmtRate = r => {
    const a = Math.abs(r);
    if (Math.abs(r - 1) < .004) return 'x1';
    if (a < .005) return 'x0';
    return `${r < 0 ? '−' : ''}x${a.toFixed(a < 3 ? 2 : 1)}`;
  };
  // the sim-time bar under the clock: the 20 s of the fight, a tick per event, the head at S
  const S_LO = -1.5, S_HI = 23.5, barX = s => ((s - S_LO) / (S_HI - S_LO) * 100).toFixed(2) + '%';
  clkBar.innerHTML = OG.EVENTS.filter(e => e.kind !== 'ciws').map(e => `<div class="k" style="left:${barX(e.S)}"></div>`).join('') + '<div class="h" id="clkH"></div>';
  const clkH = document.getElementById('clkH');
  let clkKR = '', clkKL = '';
  function updateClock(T, S, rate) {
    const r = fmtRate(rate), rh = r === 'x0' ? '<i>x</i>0' : r.replace('x', '<i>x</i>');
    if (rh !== clkKR) { clkKR = rh; clkR.innerHTML = rh; }
    const cd = S - T_IMP, word = Math.abs(rate) < .005 ? 'hold' : rate < 0 ? 'rewind' : Math.abs(rate - 1) < .004 ? 'real time' : `1 s = ${(1 / Math.abs(rate)).toFixed(Math.abs(rate) > .2 ? 1 : 0)} s`;
    const l = `Impact <b>T${cd < 0 ? '−' : '+'}${fmtS(cd)}</b> · ${rate < 0 ? '<span class="y">' + word + '</span>' : word}`;
    if (l !== clkKL) { clkKL = l; clkL.innerHTML = l; }
    clkH.style.left = barX(clamp(S, S_LO, S_HI));
  }
  const LOG = [];
  {
    const R = OG.ROUNDS, rd = (r, S) => mOrKm(OG.roundDist(r, S));
    LOG.push([.3, 'SPY', `4 tracks · 070 · ${km(OG.roundDist(R[0], .3))}`], [1.1, 'EVAL', 'Vampire ×4 · 3M55 · M2.0']);
    for (const ev of OG.EVENTS) {
      if (ev.kind === 'launch') LOG.push([ev.S, 'SM-6', `Bird away · cell ${ev.I.cell}`]);
      else if (ev.kind === 'intercept') LOG.push([ev.S, 'KILL', `${ev.r.id} · ${rd(ev.r, ev.S)}`]);
      else if (ev.kind === 'ciws') LOG.push([ev.S, 'CIWS', `${ev.e.m ? 'Aft' : 'Fwd'} mount · ${ev.e.round.id} · ${rd(ev.e.round, ev.S)}`]);
      else if (ev.kind === 'ciwsKill') LOG.push([ev.S, 'KILL', `${ev.r.id} · ${ev.r.id === 'R4' ? OG.RID.R4.d + ' m off the side' : rd(ev.r, ev.S)}`]);
      else if (ev.kind === 'hit') LOG.push([ev.S, 'HIT', 'Debris · starboard side']);
    }
    LOG.push([13.2, 'EVAL', `R3 R4 leaking · ${rd(R[3], 13.2)}`], [21.4, 'SHIP', 'Raid over · 4 of 4 · fighting on']);
    LOG.sort((a, b) => a[0] - b[0]);
  }
  const logRows = document.getElementById('logRows');
  let logKey = '';
  function updateLog(S) {
    const all = LOG.filter(r => r[0] <= S + 1e-9).slice(-7);
    const key = all.map(r => r[2]).join('|');
    if (key === logKey) return; logKey = key;
    logRows.innerHTML = all.map(([t, c, x], i) => `<div class="r${i === all.length - 1 ? ' new' : ''}"><span class="c">${fmtS(t)}</span><span class="t">${c}</span><span>${x}</span></div>`).join('');
  }
  const roEl = document.getElementById('ro'); let roKey = '';
  function readout(T, S) {
    let k = 'SOG', v = '15.6 kn · 000';
    let best = null, bd = 1e9;
    for (const r of OG.ROUNDS) { if (!OG.roundLive(r, S) || S < -.5) continue; const d = OG.roundDist(r, S); if (d < bd) { bd = d; best = r; } }
    if (best && best.id === 'R4' && bd < 160) { k = 'Hull gap'; v = `R4 · ${Math.round(OG.hullGap(R4, S))} m · M2.0`; }
    else if (best && S > 0) { k = 'Closest'; v = `${best.id} · ${mOrKm(bd)} · M2.0`; }
    else if (S >= R4.tEnd && S < 22.5) { k = 'Raid'; v = '4 of 4 stopped · hit starboard'; }
    const key = k + v; if (key === roKey) return; roKey = key;
    roEl.innerHTML = `<span class="k">${k}</span>${v}`;
  }
  const CH = [
    { t: 0, title: 'Watch', sub: 'DDG Flight IIA · four rounds inbound from 070' },
    { t: 5.2, title: 'Launch', sub: 'Two SM-6 off the Mk 41 cells' },
    { t: 34, title: 'Outbound', sub: 'The interceptors meet R1 and R2 five kilometres out' },
    { t: 56, title: 'Over the water', sub: 'R3 and R4 at ten metres, Mach 2' },
    { t: 86, title: 'Inbound', sub: 'Riding R4 in' },
    { t: 104, title: 'Close-in', sub: `Both Phalanx mounts · R3 at ${Math.round(OG.roundDist(RID.R3, RID.R3.tEnd) / 10) * 10} m` },
    { t: 136.5, title: 'Real time', sub: 'R4 stopped seven metres off the side' },
    { t: 143, title: 'Rewind', sub: 'Back to the calm' },
  ];
  const figT = document.getElementById('figT'), figS = document.getElementById('figS');

  /* ---------------- sound: a sea bed that sinks with the clock, simple cues (stage B adds OGFX.cues) ---------------- */
  const SND = { on: false };
  function sndInit() {
    const Sf = STAGE.SFX; if (!Sf.ac || SND.on) return !!SND.on;
    const ac = Sf.ac, out = Sf.master;
    const nb = (() => { const b = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = l * .97 + w * .03; d[i] = w * .5 + l * 3; } return b; })();
    const src = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || .7; return b; };
    const bedF = filt('lowpass', 380), bed = gain(0); src().connect(bedF).connect(bed).connect(out);
    const hum = gain(0), ho = ac.createOscillator(); ho.type = 'triangle'; ho.frequency.value = 61; ho.connect(filt('lowpass', 200)).connect(hum).connect(out); ho.start();
    Object.assign(SND, { on: true, bed, bedF, hum, ho });
    return true;
  }
  function sndUpdate(T, S, rate, playing) {
    if (!sndInit()) return;
    const ac = STAGE.SFX.ac, t = ac.currentTime, set = (p, v) => p.setTargetAtTime(STAGE.SFX.on && playing ? v : 0, t, .12);
    const e = cam.eye, dS = V.dist(X.ap(OG.shipXf(S), [0, 10, 0]), e), k = Math.pow(clamp(Math.abs(rate), .02, 1), .5);
    set(SND.bed.gain, .05 + .05 * (1 - sat(e[1] / 300)));
    SND.bedF.frequency.setTargetAtTime(90 + 300 * k, t, .2);
    set(SND.hum.gain, .06 / (1 + dS / 120));
    SND.ho.frequency.setTargetAtTime(22 + 39 * k, t, .2);
  }
  const Sf = STAGE.SFX, CUES = [];
  const slowDown = () => { Sf.tone(620, 90, 2.4, 'sine', .03); Sf.noise(2.2, 500, .6, .03, .4); };
  const speedUp = () => { Sf.tone(110, 700, 1.8, 'sine', .025); Sf.noise(1.6, 900, .6, .025, 1.2); };
  CUES.push([3, slowDown], [35.5, speedUp], [51.5, slowDown], [88, speedUp], [100, slowDown], [138.2, speedUp]);
  CUES.push([143.2, () => { Sf.tone(1500, 180, 3, 'sine', .028); Sf.noise(3.2, 1400, .6, .05, 2.4); }], [158.6, () => Sf.tone(880, 880, .12, 'sine', .03)]);
  for (const ev of OG.EVENTS) {
    const t = OGC.tOfS(ev.S), r = OGC.rate(t), low = r < .2;
    if (ev.kind === 'launch') CUES.push([t, () => { Sf.noise(2.8, low ? 70 : 160, .8, .2, .03); Sf.noise(.9, low ? 600 : 2400, .5, .05, .01); }]);
    else if (ev.kind === 'intercept') CUES.push([t + 1.2, () => { Sf.tone(48, 32, 1.1, 'sine', .05); Sf.noise(1.6, 150, .8, .04, .03); }]);
    else if (ev.kind === 'ciwsKill') CUES.push([t, () => { Sf.tone(low ? 34 : 60, 24, 2.2, 'sine', .12); Sf.noise(2.4, low ? 120 : 600, .7, .08, .05); }]);
    else if (ev.kind === 'hit') CUES.push([t, () => { Sf.tone(44, 28, 1.6, 'sine', .2); Sf.crack(); Sf.rumble(3.5, .25); }]);
  }
  for (const c of OGFX.cues || []) CUES.push(c);

  /* ---------------- render ---------------- */
  const shipsForSea = [{ x: 0, z: 0, r2: Math.pow(OG.SHIP.L / 2 + 25, 2) }];
  const GL = [];
  const K_ = { W, cam, glow: (p, a, m, px, max) => GL.push({ p, a, m, px: px || 4, max: max || 160 }), hero: null, dim: 1, rate: 1, S: 0 };
  const HOOKS = ['plumeFx', 'tracerFx', 'burstFx', 'fragmentsFx', 'hitFx'];
  function render(T, info) {
    const S = Sx(T), rate = OGC.rate(T);
    const shot = shotAt(T);
    const dv = V.norm(V.sub(shot.target, shot.eye));
    cam.up = Math.abs(dv[1]) > .985 ? [0, 0, 1] : [0, 1, 0];
    FILM.apply(cam, shot);
    cam.shake = OGFX.shake(T, S) || [0, 0];
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    W.reset(); W.style(WH, 1); W.fog = [1e8, 2e8];
    GL.length = 0;
    const e = cam.eye;
    // sea
    const sp = OG.shipPos(S); shipsForSea[0].x = sp[0]; shipsForSea[0].z = sp[2];
    const ph = phaseAt(T);
    OG.drawSea(W, cam, S, ph, { ships: shipsForSea, speed: ph[2] });
    OG.drawCaps(W, cam, S, { ships: shipsForSea });
    // wake, ship, shimmer
    const dist = V.dist([sp[0], 10, sp[2]], e);
    W.fog = [1e8, 2e8]; OG.drawWake(W, S, { alpha: clamp(1.4 - dist / 7000, .35, 1) });
    const hero = drawShip(T, S, rate, dist);
    W.fog = [1e8, 2e8];
    if (dist < 2500) {
      const Xs = hero.Xs, up = X.dir(Xs, [0, 1, 0]), aft = X.dir(Xs, [0, 0, -1]), side = X.dir(Xs, [1, 0, 0]);
      for (const m of DA.stacks) OG.drawShimmer(W, X.ap(Xs, m), up, aft, side, S, { alpha: clamp(1.2 - dist / 1800, 0, 1), w: 3.4 });
    }
    // the fight
    drawRounds(T, S, rate);
    drawInterceptors(T, S, rate);
    K_.hero = { X: hero.Xs, ciws: hero.cs, gun: hero.gs, spin: hero.spin }; K_.rate = rate; K_.S = S;
    for (const fx of HOOKS) { W.fog = [1e8, 2e8]; OGFX[fx](T, S, K_); }
    W.flush(ctx);
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
    // menu-side calm and a shade behind the clock + log (off with the UI: H gives the clean film)
    if (!FILM.uiHidden) {
      const lg = ctx.createLinearGradient(0, 0, 760, 0);
      lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.62, 'rgba(0,0,0,.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, 760, 1080);
      const rg = ctx.createRadialGradient(1660, 200, 30, 1660, 200, 440);
      rg.addColorStop(0, 'rgba(0,0,0,.84)'); rg.addColorStop(.55, 'rgba(0,0,0,.52)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(1180, 0, 740, 660);
    }
    // labels: what we are passing
    const Xs = hero.Xs, labels = [];
    labels.push({ id: 'DDG · Arleigh Burke IIA', sub: '155 m · Flight IIA · 15.6 kn', at: X.ap(Xs, [0, 22, 14]), a: win(T, 1, 6.5) + win(T, D - 4.2, D + 1), dx: 80, dy: -100 });
    const I1 = IID.I1, I2 = IID.I2;
    const iLab = (I, a, b, where) => {
      const w = win(T, a, b, .6) * (S >= I.tL && S < I.tEnd ? 1 : 0); if (w <= .01) return;
      const h = OG.intAt(I, S), v = OG.intSpeed(I, S);
      labels.push({ id: `RIM-174 SM-6 · ${I.id}`, sub: `${S - I.tL < OG.SEP ? 'Mk 72 boost' : 'Mk 104'} · ${Math.round(v)} m/s · ${Math.round(h[1])} m`, at: V.mad(h, OG.intDir(I, S), -SM6_NOSE), a: w, dx: where || 70, dy: -70 });
    };
    iLab(I2, 9.5, 17.5, 70); iLab(I1, 22, 35.5, -80);
    labels.push({ id: 'Mk 41 VLS', sub: `aft · 64 cells · cell ${I2.cell}`, at: X.ap(Xs, DA.vls(I2.cell)), a: win(T, 8.5, 14.5), dx: -80, dy: 40 });
    labels.push({ id: 'AN/SPY-1D(V)', sub: 'array face · 045', at: X.ap(Xs, DA.spy[0]), a: win(T, 19.2, 22.6), dx: 70, dy: -60 });
    for (const [id, a, b] of [['R3', 57.5, 77], ['R4', 57.5, 106], ['R3', 106, 113], ['R4', 126, 137.6]]) {
      const r = RID[id], w = win(T, a, b, .6) * OG.roundVis(r, S); if (w <= .01) continue;
      const sub2 = id === 'R4' && T > 120 ? `${Math.round(OG.hullGap(r, S))} m from the hull` : `${mOrKm(OG.roundDist(r, S))} · ${Math.round(OG.roundAt(r, S)[1])} m · M2.0`;
      labels.push({ id: `3M55 · ${id}`, sub: sub2, y: true, at: OG.roundAt(r, S), a: w, dx: 64, dy: -70 });
    }
    labels.push({ id: 'Phalanx 1B', sub: `fwd mount · ${OG.ciwsFiring(0, S) ? 'firing · 4 500 rds/min' : 'slewing'}`, at: X.ap(Xs, [0, 12.9, 32.9]), a: win(T, 119.8, 126.5), dx: 70, dy: -80 });
    labels.push({ id: 'Mk 45 5"/62', sub: 'trained on 070', at: X.ap(Xs, [0, 9.4, 49]), a: win(T, 119.3, 122.3), dx: 70, dy: -70 });
    setLabels(FILM.uiHidden ? [] : labels.filter(l => l.a > .01).sort((a, b) => b.a - a.a).slice(0, 5));
    drawLeaders();

    updateClock(T, S, rate); updateLog(S); readout(T, S);
    if (info && (info.playing || info.seeking === false)) sndUpdate(T, S, rate, !!info.playing);
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
    const c = new Cam(1920, 1080), s = shotAt(T); FILM.apply(c, s);
    const S = Sx(T), P = p => { const q = c.project(p); return q ? [Math.round(q[0]), Math.round(q[1]), Math.round(q[2])] : null; };
    const Xs = OG.shipXf(S), o = { T, S: +S.toFixed(3), rate: +OGC.rate(T).toFixed(3), eye: s.eye.map(v => +v.toFixed(1)), eyeShip: V.sub(s.eye, OG.shipPos(S)).map(v => +v.toFixed(1)), fov: +(s.fov / D2R).toFixed(1) };
    o.bow = P(X.ap(Xs, DA.bow)); o.stern = P(X.ap(Xs, DA.stern)); o.mid = P(X.ap(Xs, [0, 12, 0]));
    o.cF = P(X.ap(Xs, OG.CIWS_P[0])); o.cA = P(X.ap(Xs, OG.CIWS_P[1]));
    for (const r of OG.ROUNDS) if (OG.roundLive(r, S)) { o[r.id] = P(OG.roundAt(r, S)); o[r.id + 'w'] = OG.roundAt(r, S).map(v => Math.round(v)); }
    for (const I of OG.INTS) if (S >= I.tL && S <= I.tEnd) { o[I.id] = P(OG.intAt(I, S)); o[I.id + 'w'] = OG.intAt(I, S).map(v => Math.round(v)); }
    return o;
  }
  window.OGX = { shotAt, cam, phaseAt, SEQ, proj, WP, Sx, shots: { A: () => shotA, B: shotB, C: shotC, D: shotD } };
})();
