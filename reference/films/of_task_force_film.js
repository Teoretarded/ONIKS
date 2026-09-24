/* OF "Task Force": one take over a carrier group through a raid of twelve. High over the formation, the raid comes
   in from the coast, interceptors leave every ship; the lens dives through their paths to mast height, rides along
   DDG 2 as its Phalanx fires, watches DDG 1 on the threat axis take the round meant for the carrier; the carrier
   turns into the wind and launches two F/A-18E; pull back high as the group re-forms calm = frame 0.
   Stage A: timeline, camera, ships, sea, rounds, interceptor paths, mounts / cells / catapults / jets moving, menu,
   log, captions, labels, seam. The combat effects live in of_task_force_fx.js (OFFX hooks). */
(() => {
  'use strict';
  const { V, R, X, E, Cam } = M3;
  const { D, VK, D2R, PI, TAU, DA, SID } = OF;
  const SCV = SID.CV, SD1 = SID.D1, SD2 = SID.D2, SCG = SID.CG;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const sm = t => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const cam = new Cam(1920, 1080), W = new Wire(cam, { fog: [1e8, 2e8], color: '#F6F5F2' });
  const HI = '#F4D23C', WH = '#F6F5F2';
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  const NOFOG = [1e8, 2e8];

  /* ---------------- menu ---------------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((it, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('of' + i)}<span class="tx">${it}</span></span><span class="go">→</span><div class="bar"></div></div>`).join('');
  STAGE.menu({ el: menuEl, blurb: document.getElementById('blurb') });

  /* ---------------- models (compiled once for the fast hairline path) ---------------- */
  const sub = (m, keep) => ({ parts: m.parts.filter(p => keep(p.name)) });
  const cp = (prims, fine) => FAST.compilePrims(prims, fine);
  // a dynamic part's prims: those shared between two calls are fixed, the rebuilt ones move with the state
  function split(p, st) { const a = p.dyn(st), b = p.dyn(st), fixed = [], moving = []; a.forEach((q, i) => (q === b[i] ? fixed : moving).push(q)); return { fixed, moving }; }
  const DDM = HD.destroyer(), part = n => DDM.parts.find(p => p.name === n);
  const MOVING = ['gun', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA'];
  const C = {
    body: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: true }),
    bodyF: FAST.compile(sub(DDM, n => !MOVING.includes(n)), { fine: false }),
    ddgFar: FAST.compile(sub(DDM, n => ['hull', 'super', 'mast', 'spy', 'stacks', 'sps', 'gun', 'hangar', 'deck'].includes(n)), { fine: false }),
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
  // cruiser
  const CGM = OF.cruiser();
  C.cg = FAST.compile(CGM, { fine: true }); C.cgF = FAST.compile(CGM, { fine: false });
  // carrier: our own deck park (clear of the elevators and taxi lanes we use), elevators 1 and 2 as moving platforms
  const CVM = HD.carrier(), elP = CVM.parts.find(p => p.name === 'elevators').prims;
  const CV_MODEL = { parts: CVM.parts.filter(p => p.name !== 'air' && p.name !== 'elevators') };
  CV_MODEL.parts.push({ name: 'elevators', label: 'Aircraft elevators ×4', prims: elP.slice(6) });
  {
    const DY = OF.CV_DECK, air = [];
    for (const [x, z, h] of [[27, 124, -118], [27, 110, -118], [27, 96, -118], [30, -60, -92], [30, -72, -92], [-30, -100, 32], [-28, -88, 32], [-26, -76, 32], [24, -128, -100], [24, -142, -100], [-10, -150, 180]])
      air.push(...HD.seaAir.jetLow(X.make(R.y(h * D2R), [x, DY + 1.3, z]), { fold: true }));
    CV_MODEL.parts.push({ name: 'air', label: 'Air wing · F/A-18E', prims: air });
  }
  C.cv = FAST.compile(CV_MODEL, { fine: true, dyn: ['radars'] });
  C.cvF = FAST.compile(sub(CV_MODEL, n => n !== 'elevators'), { fine: false, dyn: ['radars'] });
  const ELEV_C = [cp(elP.slice(0, 3), true), cp(elP.slice(3, 6), true)];
  // fighters
  const JM = HD.fighter();
  C.jet = FAST.compile(JM, { fine: true, dyn: ['intakes', 'nozzles'] }); C.jetF = FAST.compile(JM, { fine: false, dyn: ['intakes', 'nozzles'] });
  const CACHE = new Map();
  function dynCache(fine) {
    return (name, st) => {
      let key, s2;
      if (name === 'intakes') { const step = TAU / 22, q = Math.round(OF.modp(st.fan || 0, step) / step * 6) % 6; key = 'i' + q; s2 = { fan: q / 6 * step }; }
      else if (name === 'nozzles') { const q = Math.round(sat(Math.max(st.nozzle || 0, st.ab || 0)) * 16); key = 'n' + q; s2 = { nozzle: q / 16, ab: 0 }; }
      else return null;
      key += fine ? 'f' : 'c';
      let c = CACHE.get(key);
      if (!c) { c = FAST.compilePrims(JM.parts.find(p => p.name === name).dyn(s2), fine); CACHE.set(key, c); }
      return c;
    };
  }
  const DYN = dynCache(true), DYNC = dynCache(false);
  function gearPrims(g) {
    const P = [], yb = -2.05;
    if (g <= .01) return P;
    const a = g;
    const nose = [0, -.72, 5.3], nw = [0, mix(-.9, yb + .28, a), mix(4.2, 5.5, a)];
    P.push(GEO.cyl(nose, nw, .07, { n: 6, gen: 0, al: a }));
    for (const s of [-1, 1]) P.push(GEO.lathe([s * .05, nw[1], nw[2]], [s, 0, 0], [[0, .28], [.18, .28]], { n: 12, gen: 0, al: a }));
    for (const s of [-1, 1]) {
      const top = [s * 1.25, -.72, -.9], wh = [s * mix(1.1, 1.62, a), mix(-.85, yb + .38, a), mix(-2.1, -1.1, a)];
      P.push(GEO.cyl(top, wh, .08, { n: 6, gen: 0, al: a }));
      P.push(GEO.lathe(wh, [s, 0, 0], [[0, .38], [.26, .38]], { n: 14, gen: 0, al: a }));
    }
    return P;
  }
  const GEAR_C = cp(gearPrims(1), true);
  // rounds and interceptors
  const ONK = HD.oniks(), SM6 = HD.sm6();
  C.onk = FAST.compile(ONK, { fine: true }); C.onkF = FAST.compile(ONK, { fine: false });
  C.sm6 = FAST.compile(SM6, { fine: true }); C.sm6F = FAST.compile(SM6, { fine: false });
  const ONK_ST = { booster: false, cover: false };

  /* ---------------- camera ----------------
     Keys hold the eye (m) and a look point, turned into look angles (azimuth unwrapped along the list) so near and far
     aims blend without swinging; bias (deg) turns the lens left so its subject sits right of centre, clear of the
     menu. GK: the group frame (the carrier's slot, north up, moving north at VK), looping: its last key is frame 0.
     CK: the carrier's heading frame (it turns), for the launches. */
  const K = (t, e, g, fov, bias) => ({ t, e, g, fov, bias: bias || 0 });
  const FIELDS = ['ex', 'ey', 'ez', 'az', 'el', 'fov', 'bias'];
  function prep(keys) {
    let prev = null;
    for (const k of keys) {
      const d = V.sub(k.g, k.e); let az = Math.atan2(d[0], d[2]);
      if (prev !== null) az = prev + OF.angD(prev, az);
      k.az = az; k.el = Math.atan2(d[1], Math.hypot(d[0], d[2])); prev = az;
      k.ex = k.e[0]; k.ey = k.e[1]; k.ez = k.e[2];
    }
    return keys;
  }
  function hermPath(keys, loop) {
    prep(keys);
    const n = keys.length, L = keys[n - 1].t - keys[0].t, off = {};
    for (const f of FIELDS) off[f] = loop ? keys[n - 1][f] - keys[0][f] : 0;
    const val = (i, f) => {
      if (!loop) { const k = keys[clamp(i, 0, n - 1)]; return [k.t, k[f]]; }
      if (i < 0) { const k = keys[n - 1 + i]; return [k.t - L, k[f] - off[f]]; }
      if (i > n - 1) { const k = keys[i - n + 1]; return [k.t + L, k[f] + off[f]]; }
      return [keys[i].t, keys[i][f]];
    };
    const tan = (i, f) => { if (!loop && (i <= 0 || i >= n - 1)) return 0; const a = val(i - 1, f), b = val(i + 1, f); return (b[1] - a[1]) / (b[0] - a[0]); };
    return t => {
      t = loop ? OF.modp(t - keys[0].t, L) + keys[0].t : clamp(t, keys[0].t, keys[n - 1].t);
      let i = 0; while (i < n - 2 && keys[i + 1].t <= t) i++;
      const a = keys[i], b = keys[i + 1], dt = b.t - a.t, u = clamp((t - a.t) / dt, 0, 1), u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, o = {};
      for (const f of FIELDS) o[f] = a[f] * h00 + tan(i, f) * dt * h10 + b[f] * h01 + tan(i + 1, f) * dt * h11;
      return o;
    };
  }
  const G1 = OF.SHIPS.map(S => S.off);          // ship slots in the group frame
  const [pCV, pD1, pD2, pCG] = G1;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const F0 = K(0, [-570, 1000, -1125], [380, 0, 520], 42, 8);
  const PAN_AZ = 48, PAN_FOV = 52;
  const GK = [
    F0,
    // Task force: high over the group from the south-south-west, calm; a slow drift to the right
    K(12, [-700, 940, -1180], [400, 0, 560], 42, 8),
    // Raid: lift the lens to the coast's horizon (035 ahead, 080 to the right) over the group as the rounds clear it
    K(23, [-900, 760, -1200], [947, 12, 1164], 44, 9),
    K(33, [-720, 650, -1080], [1250, 12, 1300], 46, 9),
    // the lens follows the first bursts along the horizon from 035 round toward 080, then comes back for the dive
    K(38.2, [-390, 555, -650], [-390 + 1000 * Math.sin(PAN_AZ * D2R), 555 - 207, -650 + 1000 * Math.cos(PAN_AZ * D2R)], PAN_FOV, 8.4),
    // Lattice: down through the interceptors' paths, over the carrier's wake, between DDG 1 and the cruiser
    K(41, [-150, 480, -350], [1100, 60, 1300], 48, 8),
    K(47, [420, 250, 250], [1250, 40, 1300], 50, 7),
    K(52.5, [820, 110, 760], [1250, 30, 1350], 50, 6),
    // Close-in: round DDG 2's stern and up its starboard side at mast height, over the top behind the mast to the
    // port bridge wing; forward over the Phalanx and the gun to the horizon at 035, where A3 comes in
    K(57, add(pD2, [70, 48, -150]), add(pD2, [-30, 5, 60]), 46, 8),
    K(60.5, add(pD2, [48, 38, -60]), add(pD2, [-60, 0, 150]), 47, 8),
    K(63.5, add(pD2, [4, 40, -9]), add(pD2, [60, -60, 520]), 52, 3),
    K(66, add(pD2, [-20.5, 29.3, 7.6]), add(pD2, [110, -100, 600]), 56, 0),
    K(70.6, add(pD2, [-21, 29, 8]), add(pD2, [110, -100, 600]), 56, 0),
    // Threat axis: back over the forward stack to the starboard side, the lens panning left across the ship's top
    // onto DDG 1 and the carrier to the south-west; aft to the starboard quarter, the aft Phalanx in the foreground
    K(73.2, add(pD2, [14, 36, -6]), add(pD2, [-358, -101, 46]), 50, 5),
    K(75.6, add(pD2, [18, 32, -24]), add(pD2, [-329, -85, -186]), 47, 8),
    K(78, add(pD2, [21, 26.5, -37]), add(pD1, [0, -130, 0]), 46, 12),
    K(81, add(pD2, [21, 26, -38]), add(pD1, [0, -125, 0]), 45, 12),
    K(85, add(pD2, [14, 28, -60]), add(pD1, [0, -70, -10]), 42, 9),
    // to the carrier: down the axis past DDG 1's burning starboard side, through her smoke, on to the carrier's bow
    K(89.5, add(pD1, [150, 55, 140]), add(pD1, [0, 10, -10]), 42, 8),
    K(93, add(pD1, [85, 26, -55]), add(pD1, [0, 24, -12]), 44, 2),
    // up through DDG 1's smoke as it streams toward the carrier, and out over the carrier's bow
    K(96.8, [528, 112, 600], [110, 20, 120], 45, 7),
    K(101, [230, 45, 320], [60, 24, 120], 42, 6),
    K(106, [150, 36, 290], [60, 22, 120], 40, 6),
    // (the carrier's own frame takes over for the launches; these keys only shape the way out of it)
    K(128, [230, 60, 330], [700, 40, 1000], 44, 6),
    K(136, [260, 200, 200], [900, 80, 1200], 46, 7),
    // Re-form: up and back, the group settling into frame 0
    K(146, [-40, 540, -560], [420, 0, 620], 45, 8),
    K(157, [-420, 900, -1060], [400, 0, 540], 43, 8),
    Object.assign({}, F0, { t: D }),
  ];
  const GP = hermPath(GK, true);
  // launches, in the carrier's heading frame (deck 19.5 m; cat 1 at x = 6, cat 2 at x = -6, bow at z = 166)
  const CK = [
    K(99, [120, 60, 320], [40, 22, 120], 42, 6),
    K(104, [48, 42, 238], [6, 22, 96], 36, 6),
    K(108.5, [22, 29.5, 192], [6, 21.5, 88], 26, 5),
    K(111.6, [20, 28, 190], [6, 21.5, 92], 20, 4),
    K(112.9, [20.1, 28.1, 190], [5, 21.5, 150], 40, 2),
    K(113.6, [20.3, 28.2, 190.5], [4, 23, 230], 56, 0),
    K(115.2, [20.5, 28.4, 191], [0, 26, 280], 50, 2),
    K(117.4, [20.4, 28.6, 190], [-6, 21.5, 92], 30, 4),
    K(119.3, [20.2, 28.6, 189], [-6, 21.5, 92], 22, 4),
    K(120.5, [20.2, 28.6, 189], [-6, 21.5, 130], 32, 2),
    K(121.3, [20.4, 29, 190], [-6, 24, 240], 56, 0),
    K(123, [21, 31, 195], [-4, 34, 330], 50, 4),
    K(127, [26, 42, 205], [120, 80, 700], 46, 6),
    K(132, [40, 70, 220], [300, 90, 900], 46, 7),
  ];
  const CP = hermPath(CK, false);
  // the lens leans toward moving things for a while (weight w, eased in over fi, out over fo)
  const RID = OF.RID;
  const jetPos = (J, T, off) => X.ap(OF.jet(J, T).X, off || [0, 0, 0]);
  const [J1, J2] = OF.JT;
  const TRK = [
    { a: 106, b: 116.5, fi: 2, fo: 2, w: .9, p: T => jetPos(J1, T - .05, [0, .5, 3]) },
    { a: 116.2, b: 124.5, fi: 1.5, fo: 2.5, w: .9, p: T => jetPos(J2, T - .05, [0, .5, 3]) },
    { a: 123.5, b: 134, fi: 2, fo: 3, w: .4, p: T => V.lerp(jetPos(J1, T), jetPos(J2, T), .5) },
  ];
  function shotFrom(k, F, h, T) {
    const eye = X.ap(F, [k.ex, k.ey, k.ez]), az = k.az + h;
    let d = [Math.cos(k.el) * Math.sin(az), Math.sin(k.el), Math.cos(k.el) * Math.cos(az)];
    for (const tr of TRK) {
      if (T < tr.a || T > tr.b) continue;
      const w = tr.w * ss(tr.a, tr.a + tr.fi, T) * (1 - ss(tr.b - tr.fo, tr.b, T)); if (w <= 0) continue;
      d = V.norm(V.lerp(d, V.norm(V.sub(tr.p(T), eye)), w));
    }
    const cb = Math.cos(k.bias * D2R), sb = Math.sin(k.bias * D2R);
    d = [d[0] * cb - d[2] * sb, d[1], d[2] * cb + d[0] * sb];
    return { eye, target: V.mad(eye, d, 100), fov: k.fov * D2R, roll: 0 };
  }
  const grpShot = T => shotFrom(GP(T), X.make(R.I(), OF.groupAt(T)), 0, T);
  const cvShot = T => shotFrom(CP(T), OF.shipFrame(SCV, T), OF.head(SCV, T), T);
  const SEQ = [
    { f: grpShot, end: 102.5, bl: 5 },
    { f: cvShot, end: 130.5, bl: 5 },
    { f: grpShot, end: 1e9, bl: 0 },
  ];
  function mixShot(a, b, w) {
    if (w <= 0) return a; if (w >= 1) return b;
    const da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = V.len(da), lb = V.len(db);
    const dir = V.norm(V.lerp(V.mul(da, 1 / la), V.mul(db, 1 / lb), w)), eye = V.lerp(a.eye, b.eye, w);
    return { eye, target: V.mad(eye, dir, mix(la, lb, w)), fov: mix(a.fov, b.fov, w), roll: 0 };
  }
  function shotAt(T) {
    T = OF.modp(T, D);
    for (let i = 0; i < SEQ.length; i++) {
      const s = SEQ[i], w0 = s.end - s.bl / 2, w1 = s.end + s.bl / 2;
      if (T < w0 || i === SEQ.length - 1) return s.f(T);
      if (T < w1) return mixShot(s.f(T), SEQ[i + 1].f(T), sm((T - w0) / s.bl));
    }
    return SEQ[SEQ.length - 1].f(T);
  }

  /* sea row phases: the camera's travel along / across its view, integrated once; the residual mod 1024 m is spread
     over the loop so the rows at T = D stand where they stood at T = 0 (relative to the lens) */
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
    // the eye's own travel over the loop is LZ north; only the part of it beyond whole 1024 m periods is a residual
    const res = v => OF.modp(v + 512, 1024) - 512;
    const rF = res(PHF[PH_N]), rR = res(PHR[PH_N]);
    for (let i = 0; i <= PH_N; i++) { PHF[i] -= rF * i / PH_N; PHR[i] -= rR * i / PH_N; }
    PSP[0] = PSP[1];
  }
  const phaseAt = T => { const x = clamp(OF.modp(T, D) * 60, 0, PH_N - .001), i = Math.floor(x), f = x - i; return [PHF[i] + (PHF[i + 1] - PHF[i]) * f, PHR[i] + (PHR[i + 1] - PHR[i]) * f, PSP[i]]; };

  /* ---------------- drawing ---------------- */
  function objFog(dist) { W.fog = [Math.max(30, dist * .55), dist * 2.4 + 700]; }
  const shipA = dist => clamp(1.25 - dist / 9000, .3, 1);
  const SPS_W = PI / 2;
  // destroyers: body compiled; Mk 45, both Phalanx mounts and the Mk 41 hatches moving
  function drawDDG(S, T, dist) {
    const Xs = OF.shipXf(S, T), fine = dist <= 1500, fi = fine ? 0 : 1, a = shipA(dist);
    const st = { sps: T * SPS_W + 1.1 + S.n, hangar: 0 };
    objFog(dist);
    if (dist > 4200) { FAST.draw(W, C.ddgFar, Xs, st, { fine: false, a }); return { X: Xs, ciws: null, spin: null }; }
    FAST.draw(W, fine ? C.body : C.bodyF, Xs, st, { fine, a });
    const cs = OF.ciwsState(S, T), spin = [OF.ciwsSpin(S, 0, T), OF.ciwsSpin(S, 1, T)];
    if (!FAST.visible(cam, X.ap(Xs, [0, 10, 0]), 90)) return { X: Xs, ciws: cs, spin };
    const emit = FAST.emitter(W);
    const gX = X.mul(Xs, gP.xf({ gunYaw: 0 }));
    FAST.drawPart(W, GUN.house[fi], gX, a, emit);
    FAST.drawPart(W, GUN.barrel[fi], X.mul(gX, piv(R.x(0), GUN_TR)), a, emit);
    for (let m = 0; m < 2; m++) {
      const mX = X.mul(Xs, cPs[m].xf({ ciwsYaw: cs.yaw }));
      FAST.drawPart(W, CIWS.base[fi], mX, a, emit);
      const eX = X.mul(mX, piv(R.x(-cs.pitch[m]), CIWS_TR));
      const rate = (OF.ciwsSpin(S, m, T + .01) - spin[m]) / .01, step = TAU / 6 / SPQ;
      const q = Math.round(OF.modp(spin[m], TAU / 6) / step) % SPQ;
      if (rate > 25) { FAST.drawPart(W, CIWS.el[q][fi], eX, a * .6, emit); FAST.drawPart(W, CIWS.el[(q + SPQ / 2) % SPQ][fi], eX, a * .45, emit); }
      else FAST.drawPart(W, CIWS.el[q][fi], eX, a, emit);
    }
    const open = OF.vlsOpen(S, T), om = new Map(); if (open) for (const [i, f] of open) om.set(i, f);
    for (const Gv of VLSG) {
      FAST.drawPart(W, Gv.fixed[fi], Xs, a, emit);
      if (!fine) continue;
      let any = false; for (const i of om.keys()) if (i >= Gv.i0 && i < Gv.i0 + Gv.n) any = true;
      if (!any) { FAST.drawPart(W, Gv.closed, Xs, a, emit); continue; }
      for (let k = 0; k < Gv.n; k++) {
        const f = om.get(Gv.i0 + k) || 0, q = Math.round(f * 16);
        FAST.drawPart(W, q ? vlsOpenCell(Gv, Gv.i0 + k, q) : Gv.cell[k], Xs, a, emit);
      }
    }
    return { X: Xs, ciws: cs, spin };
  }
  function drawCG(T, dist) {
    const Xs = OF.shipXf(SCG, T), far = dist > 1500;
    objFog(dist);
    FAST.draw(W, far ? C.cgF : C.cg, Xs, {}, { fine: !far, a: shipA(dist) });
    return { X: Xs, ciws: null, spin: null };
  }
  function drawCV(T, dist) {
    const Xs = OF.shipXf(SCV, T), fine = dist < 900, a = shipA(dist);
    objFog(dist);
    FAST.draw(W, fine ? C.cv : C.cvF, Xs, { radar: T * OF.CV_RADAR_W }, { fine, a });
    if (dist < 2600) {
      const emit = FAST.emitter(W);
      for (let k = 0; k < 2; k++) FAST.drawPart(W, ELEV_C[k], X.mul(Xs, X.make(R.I(), [0, -OF.elevDrop(k, T), 0])), a * .8, emit);
    }
    return { X: Xs, ciws: null, spin: null };
  }
  // SPY faces in world coordinates
  const facesW = (S, Xs) => S.kind === 'ddg' ? DA.spy.map((c, i) => ({ c: X.ap(Xs, c), n: X.dir(Xs, DA.spyN[i]) }))
    : S.kind === 'cg' ? CGM.FACES.map(f => ({ c: X.ap(Xs, f.c), n: X.dir(Xs, f.n) })) : [];
  function drawFaceFlash(Fw, k) {
    const n = Fw.n, h = V.norm(V.cross([0, 1, 0], n)), u = V.cross(n, h), p = [];
    for (let i = 0; i <= 8; i++) { const a = (i + .5) / 8 * TAU; p.push(V.add(V.mad(Fw.c, n, .12), V.add(V.mul(h, Math.cos(a) * 2.05), V.mul(u, Math.sin(a) * 2.05)))); }
    for (let i = 0; i < 8; i++) W.seg(p[i], p[i + 1], .75 * k);
  }
  // catapult hardware: shuttle, launch bar, steam off the track after the stroke (blown aft by the wind over the deck)
  function drawCat(J, T, Xcv) {
    const tl = T - J.tL, d = J.dir, s0 = V.add(J.s0, [0, -2.05, 0]), shuttle0 = V.mad(s0, d, 5.35);
    let s = 0;
    if (tl > 0) s = tl < J.tS ? .5 * J.acc * tl * tl : J.stroke;
    s *= 1 - ss(J.tS + 4, J.tS + 9, tl);
    const sp = X.ap(Xcv, V.mad(shuttle0, d, s));
    W.seg(X.ap(Xcv, V.mad(V.add(shuttle0, [-.35, .12, 0]), d, s)), X.ap(Xcv, V.mad(V.add(shuttle0, [.35, .12, 0]), d, s)), .9);
    W.seg(X.ap(Xcv, V.mad(V.add(shuttle0, [0, .12, -.5]), d, s)), X.ap(Xcv, V.mad(V.add(shuttle0, [0, .12, .5]), d, s)), .9);
    if (tl < J.tS && T > J.taxi[1]) W.seg(sp, X.ap(Xcv, V.add(V.mad(shuttle0, d, s), [0, .75, -.3])), .8);
    if (tl > 0 && tl < J.tS + 6) {
      for (let k = 0; k < 18; k++) {
        const sk = (k + .5) / 18 * J.stroke, tp = Math.sqrt(2 * sk / J.acc), age = tl - tp;
        if (age < 0 || age > 3.2) continue;
        const p = V.add(V.mad(shuttle0, d, sk - age * 11), [.4 * Math.sin(k * 2.1), .2 + age * 1.3, 0]);
        W.disc(X.ap(Xcv, p), .3 + age * 1.1, 10, .3 * (1 - age / 3.2));
      }
    }
  }
  function drawAB(Xj, st, T, seed) {
    const ab = st.ab; if (ab < .02) return;
    const d = X.dir(Xj, [0, 0, -1]), [U, Vv] = GEO.perp(d);
    for (let n = 0; n < 2; n++) {
      const c = X.ap(Xj, HD.fighter.NOZZLES[n]), fl = .85 + .15 * M3.noise(T * 23 + n * 7, seed);
      const Lp = (5.2 + 2.2 * ab) * fl;
      const eye = W.cam.eye; let w = V.sub(eye, V.mad(c, d, Lp * .4)); w = V.norm(V.sub(w, V.mul(d, V.dot(w, d)))); const sd = V.cross(d, w);
      for (const sg of [-1, 1]) { let pv = null; for (let k = 0; k <= 10; k++) { const s = k / 10 * Lp, r = .44 * (1 - Math.pow(s / Lp, 1.4)) + .04; const q = V.mad(V.mad(c, d, s), sd, sg * r); if (pv) W.seg(pv, q, .7 * ab); pv = q; } }
      for (let k = 0; k < 5; k++) {
        const s = (.75 + k * .95) * fl, r = .3 * (1 - k / 6.5);
        W.ring(V.mad(c, d, s), U, Vv, r, 16, ab * .75 * (1 - k / 6));
        W.seg(V.mad(V.mad(c, d, s - .45), sd, r * .9), V.mad(c, d, s), ab * .45 * (1 - k / 6));
        W.seg(V.mad(V.mad(c, d, s - .45), sd, -r * .9), V.mad(c, d, s), ab * .45 * (1 - k / 6));
      }
    }
  }
  // wingtip vortices once the turn pulls g, traced back along the jet's own integrated path
  function drawVortices(J, T, dist, al) {
    const tl = T - J.tL - J.tS; if (tl < 2) return;
    const i0 = Math.floor(tl * 120); if (i0 >= J.P.length) return;
    W.fog = [Math.max(30, dist * .6), dist * 3 + 800];
    for (const tip of [[6.3, .02, -2.2], [-6.3, .02, -2.2], [1.9, .12, 1.6], [-1.9, .12, 1.6]]) {
      const lex = Math.abs(tip[0]) < 3;
      let pv = null;
      for (let k = 0; k <= 30; k++) {
        const i = i0 - k * 5; if (i < 0) break;
        const up = [J.R[i][1], J.R[i][4], J.R[i][7]], g = Math.max(0, 1 / Math.max(.2, up[1]) - 1.25);
        const q = V.add(J.P[i], R.ap(J.R[i], tip)); q[1] -= k * .05;
        const a = sat(g * (lex ? .55 : .8)) * .5 * Math.pow(1 - k / 31, 1.6) * al;
        if (pv && a > .01) W.seg(pv, q, a);
        pv = q;
      }
    }
  }
  // a jet; `next` is the one riding the elevator up for the next loop (fades in once its platform is down)
  function drawJet(J, T, next) {
    const t = OF.modp(T, D);
    let al = 1;
    if (next) { const e = OF.ELEV[J.el]; if (t < e.down[1] - 1) return null; al = ss(e.down[1] - 1, e.down[1] + 1.5, t); }
    const j = OF.jet(J, T, next), dist = V.dist(j.X.T, cam.eye);
    // the departing pair thins out with range and is gone well before the seam (frame 0 has no jets in the air)
    if (j.phase === 'flight') al *= (1 - ss(9000, 14000, dist)) * (1 - ss(J.tL + 26, J.tL + 36, T));
    if (al <= .003) return j;
    objFog(Math.max(15, dist));
    const a = clamp(1.35 - dist / 4000, .3, 1) * al, fine = dist < 260;
    FAST.draw(W, fine ? C.jet : C.jetF, j.X, j.st, { fine, a, dynCache: fine ? DYN : DYNC });
    if (j.gear > .99 && dist < 1500) FAST.drawPart(W, GEAR_C, j.X, a, FAST.emitter(W));
    else if (j.gear > .01 && dist < 1500) GEO.draw(W, { parts: [{ name: 'gear', label: 'Gear', prims: gearPrims(j.gear) }] }, j.X, {}, { a });
    if (!next) { drawAB(j.X, j.st, T, J.cat * 3.3); if (j.phase === 'flight') drawVortices(J, T, dist, al); }
    return j;
  }
  // the incoming rounds: the model near, a dash along the line at range (a 0.7 m body is sub-pixel past ~2 km)
  function drawRounds(T, dim) {
    for (const r of OF.ROUNDS) {
      const vis = OF.roundVis(r, T) * dim; if (vis <= .003) continue;
      const p = OF.roundAt(r, T), d = V.dist(p, cam.eye), dir = OF.roundDir(r, T);
      if (d < 2500 && FAST.visible(cam, p, 6)) {
        objFog(Math.max(20, d));
        FAST.draw(W, d < 450 ? C.onk : C.onkF, X.make(R.look(dir, [0, 1, 0]), p), ONK_ST, { fine: d < 450, a: vis * clamp(1.5 - d / 2000, .45, 1), noCull: true });
      }
      W.fog = NOFOG;
      const tail = V.mad(p, dir, -4.6), L1 = Math.max(3, d * .0045), L2 = Math.max(14, d * .03);
      W.seg(V.mad(tail, dir, -L1), tail, .9 * vis);
      W.seg(V.mad(tail, dir, -L2), V.mad(tail, dir, -L1), .2 * vis);
      // seen from far off, the last few seconds of its low path as a faint fading track, so the raid reads as
      // three streams closing on the group (gone once it is near the lens)
      const tk = vis * .09 * ss(1800, 5000, d);
      if (tk > .004) {
        let pv = p;
        for (let k = 1; k <= 8; k++) { const q = OF.roundAt(r, Math.max(r.t0, T - k * .7)); W.seg(pv, q, tk * (1 - (k - 1) / 8)); pv = q; }
      }
    }
  }
  // interceptors in flight: a short bright head, the missile near (their smoke trails, the lattice, are OFFX.launchFx)
  function drawInterceptors(T, dim) {
    W.fog = NOFOG;
    for (const I of OF.INTS) {
      if (T < I.tL || T > I.tEnd) continue;
      const h = OF.intAt(I, T), dir = OF.intDir(I, T), d = V.dist(h, cam.eye);
      W.seg(V.mad(h, dir, -Math.max(5, d * .005)), h, .85 * dim);
      if (d < 900 && FAST.visible(cam, h, 5)) {
        objFog(Math.max(15, d));
        FAST.draw(W, d < 160 ? C.sm6 : C.sm6F, X.make(R.look(dir, [0, 1, 0]), V.mad(h, dir, -3.3)), { booster: !I.mk29 && T - I.tL < 6 }, { fine: d < 160, a: dim * clamp(1.4 - d / 900, .4, 1), noCull: true });
        W.fog = NOFOG;
      }
    }
  }

  /* ---------------- labels ---------------- */
  const callsEl = document.getElementById('calls'), POOL = [];
  for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'call'; callsEl.appendChild(d); POOL.push({ el: d, html: '', on: false }); }
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
  const SHIP_NAME = { CV: 'CVN', D1: 'DDG 1', D2: 'DDG 2', CG: 'CG' };

  /* ---------------- log, readout, captions ---------------- */
  const tg = g => OF.ROUNDS.filter(r => r.g === g);
  const brg3 = b => String(b).padStart(3, '0');
  const LOG = [
    [.8, 'CSG', 'Condition III · 15.6 kn · 000'], [4.2, 'SPY', 'Volume search · 3 ships'], [8.5, 'AIR', 'Ready deck · 2 × F/A-18E'],
  ];
  for (const g of ['A', 'B', 'C']) {
    const rs = tg(g), t0 = Math.min(...rs.map(r => r.t0)), b = rs[0].brg;
    LOG.push([t0 + .7, 'SPY', `${rs.filter(r => r.t0 < t0 + 5).length} tracks · ${brg3(b)} · 28 km`]);
    const late = rs.filter(r => r.t0 >= t0 + 5); if (late.length) LOG.push([Math.min(...late.map(r => r.t0)) + .7, 'SPY', `+${late.length} · ${brg3(b)} · 28 km`]);
  }
  LOG.push([20.6, 'EVAL', 'Vampire ×12 · 3M55 · M2.0']);
  for (const ev of OF.EVENTS) {
    if (ev.kind === 'launch') LOG.push([ev.t, ev.I.mk29 ? 'ESSM' : 'SM-6', `${SHIP_NAME[ev.I.S.id]} · ${ev.I.mk29 ? 'Mk 29' : 'cell ' + ev.I.c}`]);
    else if (ev.kind === 'intercept') LOG.push([ev.t, 'KILL', `${ev.r.id} · ${km(OF.roundDist(ev.r, ev.t))}`]);
    else if (ev.kind === 'miss') LOG.push([ev.t, 'MISS', `${ev.r.id} · weaves through`]);
    else if (ev.kind === 'ciws') LOG.push([ev.t, 'CIWS', `${SHIP_NAME[ev.e.S.id]} ${ev.e.m ? 'aft' : 'fwd'} · ${ev.e.round.id} · ${OF.roundDist(ev.e.round, ev.t, ev.e.S) < 1000 ? Math.round(OF.roundDist(ev.e.round, ev.t, ev.e.S)) + ' m' : km(OF.roundDist(ev.e.round, ev.t, ev.e.S))}`]);
    else if (ev.kind === 'ciwsKill') LOG.push([ev.t, 'KILL', `${ev.r.id} · ${Math.round(OF.roundDist(ev.r, ev.t, ev.e.S))} m · DDG 2`]);
    else if (ev.kind === 'hit') LOG.push([ev.t, 'HIT', 'DDG 1 · starboard · fire']);
    else if (ev.kind === 'cat') LOG.push([ev.t, `CAT ${ev.J.cat + 1}`, 'Launch · 140 kn'], [ev.t - 3.2, `CAT ${ev.J.cat + 1}`, 'Tension · burner']);
  }
  LOG.push([OF.HIT.t + 3.4, 'DC', 'DDG 1 · fire party · 15 kn'], [OF.TURN.a0 + 1, 'CVN', 'Turning 025 · into the wind'], [98, 'AIR', 'Taxi · cats 1 and 2'],
    [OF.TURN.b0 + 1, 'CVN', 'Back to station · 000'], [OF.HIT.t + 55, 'DC', 'DDG 1 · fire out'], [138.5, 'CSG', 'Raid · 11 of 12 · one hit'],
    [142, 'AIR', 'Pair on CAP · 035'], [OF.ELEV[0].up[0], 'AIR', 'Elevators · next pair up']);
  LOG.sort((a, b) => a[0] - b[0]);
  const logRows = document.getElementById('logRows');
  let logKey = '';
  // the log's clock (06:40:00 at frame 0); last loop's rows keep their earlier times so the column stays in order
  const fmtT = t => { const s = Math.floor(t) + 6 * 3600 + 40 * 60; return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`.slice(3); };
  function updateLog(T) {
    const all = LOG.map(([t, c, x]) => [t <= T ? t : t - D, c, x]).sort((a, b) => a[0] - b[0]).slice(-8);
    const key = all.map(r => r[0] + r[2]).join('|');
    if (key === logKey) return; logKey = key;
    logRows.innerHTML = all.map(([t, c, x], i) => `<div class="r${i === all.length - 1 ? ' new' : ''}"><span class="c">${fmtT(t)}</span><span class="t">${c}</span><span>${x}</span></div>`).join('');
  }
  const roEl = document.getElementById('ro'); let roKey = '';
  function readout(T) {
    let k = 'SOG', v = '15.6 kn · 000';
    let best = null, bd = 1e9;
    for (const r of OF.ROUNDS) { if (!OF.roundLive(r, T)) continue; const d = OF.roundDist(r, T); if (d < bd) { bd = d; best = r; } }
    if (best) { k = 'Closest'; v = `${best.id} · ${km(bd)} to CVN · M2.0`; }
    else if (T > OF.TURN.a0 && T < 106) { k = 'CVN'; v = `${String(Math.round(OF.head(SCV, T) / D2R + 360) % 360).padStart(3, '0')} · ${(VK / Math.cos(OF.head(SCV, T)) / .5144).toFixed(1)} kn`; }
    else if (T >= 106 && T < 128) { const J = T < 116.5 ? J1 : J2, j = OF.jet(J, T), rel = Math.max(0, j.spd - VK); k = `Cat ${J.cat + 1}`; v = j.tl < 0 ? `tension · T−${Math.max(0, -j.tl).toFixed(1)} s` : `${(rel / .5144).toFixed(0)} kn${j.tl < J.tS ? ' · stroke ' + j.tl.toFixed(2) + ' s' : ''}`; }
    else if (T >= 128 && T < 160) { k = 'CVN'; v = `${String(Math.round(OF.head(SCV, T) / D2R + 360) % 360).padStart(3, '0')} · back to station`; }
    else if (cam.eye[1] > 300) { k = 'Alt'; v = `${Math.round(cam.eye[1] / 10) * 10} m · 15.6 kn`; }
    const key = k + v; if (key === roKey) return; roKey = key;
    roEl.innerHTML = `<span class="k">${k}</span>${v}`;
  }
  const CH = [
    { t: 0, title: 'Task force', sub: 'CVN, a cruiser and two destroyers · 15.6 kn' },
    { t: 14, title: 'Raid', sub: 'Twelve rounds from 035, 080 and 125' },
    { t: 40, title: 'Lattice', sub: 'Interceptors from every ship' },
    { t: 59, title: 'Close-in', sub: 'Along DDG 2 · Phalanx at 600 m' },
    { t: 75, title: 'Threat axis', sub: 'DDG 1 takes the round meant for the carrier' },
    { t: 95, title: 'Launch', sub: 'The carrier turns into the wind · two F/A-18E' },
    { t: 134, title: 'Re-form', sub: 'Back on station · the group calm again' },
  ];
  const figT = document.getElementById('figT'), figS = document.getElementById('figS');

  /* ---------------- sound (bed + simple cues; stage B adds its own through OFFX.cues) ---------------- */
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
    const roar = gain(0); src().connect(filt('lowpass', 520, .5)).connect(roar).connect(out);
    Object.assign(SND, { on: true, bed, hum, roar });
    return true;
  }
  function sndUpdate(T, playing) {
    if (!sndInit()) return;
    const ac = STAGE.SFX.ac, t = ac.currentTime, set = (p, v) => p.setTargetAtTime(STAGE.SFX.on && playing ? v : 0, t, .12);
    const e = cam.eye;
    let near = 0; for (const S of OF.SHIPS) near += 1 / (1 + V.dist(X.ap(OF.shipFrame(S, T), [0, 10, 0]), e) / 120);
    set(SND.bed.gain, .05 + .05 * (1 - sat(e[1] / 400)));
    set(SND.hum.gain, .05 * Math.min(1.5, near));
    let r = 0;
    for (const J of OF.JT) { const j = OF.jet(J, T), dj = V.dist(j.X.T, e); r += (j.st.ab * .8 + .15 * ss(-8, -6, j.tl) * (1 - ss(20, 30, j.tl))) / (1 + dj / 90); }
    set(SND.roar.gain, .3 * r);
  }
  const S_ = STAGE.SFX, CUES = [];
  for (const ev of OF.EVENTS) {
    const dCam = p => V.dist(p, OF.shipPos(SD2, ev.t));
    if (ev.kind === 'launch') CUES.push([ev.t, () => { const k = 1 / (1 + dCam(ev.I.P0) / 600); S_.noise(2.8, 160, .8, .2 * k, .03); S_.noise(.9, 2400, .5, .05 * k, .01); }]);
    else if (ev.kind === 'intercept' || ev.kind === 'miss') { const d = OF.roundDist(ev.r, ev.t); CUES.push([ev.t + Math.min(6, d / 343 * .35), () => { S_.tone(48, 32, 1.1, 'sine', .05); S_.noise(1.6, 150, .8, .04, .03); }]); }
    else if (ev.kind === 'ciws') CUES.push([ev.t, () => { S_.noise(ev.e.t1 - ev.e.t0 + .1, 1400, 2.4, .05, .02); S_.tone(75, 75, ev.e.t1 - ev.e.t0, 'square', .012); }]);
    else if (ev.kind === 'hit') CUES.push([ev.t + .4, () => { S_.tone(44, 28, 1.6, 'sine', .16); S_.crack(); S_.rumble(3.5, .2); }]);
    else if (ev.kind === 'cat') { const J = ev.J; CUES.push([J.tL - 3, () => S_.noise(1.2, 900, .6, .06, .4)]); CUES.push([J.tL, () => { S_.tone(52, 38, .7, 'sine', .22); S_.noise(2.2, 3200, .5, .09, .02); S_.noise(.4, 300, 1, .2, .005); }]); CUES.push([J.tL + J.tS, () => { S_.tone(180, 90, .25, 'square', .03); S_.noise(.35, 1800, 1, .12, .002); }]); }
  }
  for (const c of OFFX.cues || []) CUES.push(c);

  /* ---------------- render ---------------- */
  const shipsForSea = [];
  const GL = [];
  OFFX.eyeAt = () => cam.eye;
  const KX = { W, cam, glow: (p, a, m, px, max) => GL.push({ p, a, m, px: px || 4, max: max || 160 }), ships: {}, dim: 1 };
  function render(T, info) {
    const shot = shotAt(T);
    const dv = V.norm(V.sub(shot.target, shot.eye));
    cam.up = Math.abs(dv[1]) > .985 ? [0, 0, 1] : [0, 1, 0];
    FILM.apply(cam, shot);
    cam.shake = OFFX.shake(T) || [0, 0];
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    W.reset(); W.style(WH, 1); W.fog = NOFOG;
    GL.length = 0;
    const e = cam.eye, dim = KX.dim = OFFX.dimAt ? OFFX.dimAt(T, e) : 1;
    // sea
    shipsForSea.length = 0;
    for (const Sx of OF.SHIPS) { const p = OF.shipPos(Sx, T); shipsForSea.push({ S: Sx, x: p[0], z: p[2], h: OF.head(Sx, T), r2: Math.pow(Sx.L / 2 + 30, 2) }); }
    const ph = phaseAt(T);
    OF.drawSea(W, cam, T, ph, { ships: shipsForSea, speed: ph[2], alpha: dim, horizon: dim });
    OF.drawCaps(W, cam, T, { ships: shipsForSea, alpha: dim });
    OF.drawIsland(W, cam, T, { alpha: dim });
    // wakes, ships, pulses, shimmer
    for (const Sx of OF.SHIPS) {
      const p = OF.shipPos(Sx, T), dist = V.dist([p[0], 10, p[2]], e);
      W.fog = NOFOG; OF.drawWake(W, Sx, T, { alpha: clamp(1.4 - dist / 7000, .35, 1) * dim });
      const H = Sx.kind === 'ddg' ? drawDDG(Sx, T, dist) : Sx.kind === 'cg' ? drawCG(T, dist) : drawCV(T, dist);
      KX.ships[Sx.id] = H;
      W.fog = NOFOG;
      const Fw = facesW(Sx, H.X), pa = clamp(1.3 - dist / 8000, .4, 1) * dim;
      if (Fw.length) {
        const fired = OF.drawPulses(W, Sx, T, Fw, { alpha: pa });
        for (const f of fired) drawFaceFlash(Fw[f.f], f.k * clamp(1 - dist / 2500, 0, 1));
      } else OF.drawSweep(W, X.ap(H.X, [31.6, OF.CV_DECK + 36, -28.5]), T, t => t * OF.CV_RADAR_W + OF.head(SCV, T), { alpha: pa });
      if (dist < 2500 && Sx.kind !== 'cvn') {
        const Xs = H.X, up = X.dir(Xs, [0, 1, 0]), aft = X.dir(Xs, [0, 0, -1]), side = X.dir(Xs, [1, 0, 0]);
        for (const m of Sx.kind === 'ddg' ? DA.stacks : OF.CG_STACKS) OF.drawShimmer(W, X.ap(Xs, m), up, aft, side, T, { alpha: clamp(1.2 - dist / 1800, 0, 1), w: Sx.kind === 'ddg' ? 3.4 : 2.4 });
      }
    }
    // carrier deck: catapults, jets (the launch pair, and the next pair riding the elevators up)
    const Xcv = KX.ships.CV.X, dcv = V.dist(Xcv.T, e);
    if (dcv < 6000) for (const J of OF.JT) { W.fog = NOFOG; drawCat(J, T, Xcv); }
    const JS = OF.JT.map(J => drawJet(J, T, false));
    for (const J of OF.JT) drawJet(J, T, true);
    // the raid
    drawRounds(T, dim);
    drawInterceptors(T, dim);
    for (const fx of ['launchFx', 'interceptFx', 'ciwsFx', 'hitFx', 'smokeFx']) { W.fog = NOFOG; OFFX[fx](T, KX); }
    W.flush(ctx);
    // restrained bloom at the burners
    for (const j of JS) {
      if (!j || j.st.ab < .05) continue;
      for (const n of HD.fighter.NOZZLES) {
        const p = cam.project(X.ap(j.X, V.add(n, [0, 0, -1.2]))); if (!p) continue;
        const r = clamp(900 / p[2], 6, 90), g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        g.addColorStop(0, `rgba(255,250,235,${(.28 * j.st.ab).toFixed(3)})`); g.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      }
    }
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
    // menu-side calm, and a soft shade behind the log (off with the UI: H gives the clean film)
    if (!FILM.uiHidden) {
      const lg = ctx.createLinearGradient(0, 0, 760, 0);
      lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.62, 'rgba(0,0,0,.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, 760, 1080);
      const rg = ctx.createRadialGradient(1660, 170, 30, 1660, 170, 420);
      rg.addColorStop(0, 'rgba(0,0,0,.82)'); rg.addColorStop(.55, 'rgba(0,0,0,.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(1200, 0, 720, 600);
    }
    // labels
    const labels = [], sx = id => KX.ships[id].X;
    const lf = (T0, T1) => win(T, T0, T1) + win(T + D, T0, T1) + win(T - D, T0, T1);
    labels.push({ id: 'CVN · Nimitz class', sub: '333 m · 4 catapults', at: X.ap(sx('CV'), [31.6, OF.CV_DECK + 22, -28]), a: lf(-5.5, 9.5) + win(T, 97, 104.5), dx: 70, dy: -90 });
    labels.push({ id: 'DDG 1 · Arleigh Burke', sub: 'picket · threat axis 035', at: X.ap(sx('D1'), [0, 22, 14]), a: lf(-4.5, 11), dx: -70, dy: -70 });
    labels.push({ id: 'DDG 2 · Arleigh Burke', sub: '155 m · outer picket', at: X.ap(sx('D2'), [0, 22, 14]), a: lf(-3.5, 11.5), dx: 70, dy: -90 });
    labels.push({ id: 'CG · Ticonderoga', sub: '173 m · AN/SPY-1B', at: X.ap(sx('CG'), [0, 20, 10]), a: lf(-2.5, 12), dx: 70, dy: -90 });
    labels.push({ id: 'Phalanx 1B', sub: 'DDG 2 · forward mount', at: X.ap(sx('D2'), [0, 12.6, 33.4]), a: win(T, 65.2, 69.4), dx: 80, dy: -110 });
    labels.push({ id: 'Phalanx 1B', sub: 'DDG 2 · aft mount', at: X.ap(sx('D2'), [0, 15.4, -47.5]), a: win(T, 76.5, 80.6), dx: 70, dy: -80 });
    labels.push({ id: 'DDG 1', sub: 'on the threat axis', at: X.ap(sx('D1'), [0, 24, 0]), a: win(T, 76.8, 80.4), dx: 60, dy: -110 });
    labels.push({ id: 'CVN · Nimitz class', sub: 'behind it · 1.7 km', at: X.ap(sx('CV'), [31.6, OF.CV_DECK + 22, -28]), a: win(T, 77.4, 80.6), dx: 40, dy: -130 });
    labels.push({ id: 'F/A-18E', sub: 'cat 1 · burner', y: true, at: jetPos(J1, T, [0, 1.2, 0]), a: win(T, 108.5, 112.8), dx: -80, dy: -90 });
    labels.push({ id: 'F/A-18E', sub: 'cat 2 · burner', y: true, at: jetPos(J2, T, [0, 1.2, 0]), a: win(T, 116.2, 120.3), dx: -80, dy: -90 });
    for (const [r, a, b] of [[RID.A1, 25, 33], [RID.A3, 66.4, 70.5], [RID.A4, 79.2, 80.9]]) {
      const w = win(T, a, Math.min(b, r.tEnd - .05), .6) * OF.roundVis(r, T); if (w <= .01) continue;
      const dd = OF.roundDist(r, T, r === RID.A3 ? SD2 : r === RID.A4 ? SD1 : SCV);
      labels.push({ id: `3M55 · ${r.id}`, sub: dd < 1000 ? `${Math.round(dd)} m` : km(dd), y: true, at: OF.roundAt(r, T), a: w, dx: 64, dy: -70 });
    }
    setLabels(FILM.uiHidden ? [] : labels.filter(l => l.a > .01).sort((a, b) => b.a - a.a).slice(0, 6));
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
    const o = { eye: sh.eye.map(Math.round), fov: +(sh.fov / D2R).toFixed(1) };
    for (const S of OF.SHIPS) o[S.id] = P(X.ap(OF.shipXf(S, T), [0, 10, 0]));
    for (const r of OF.ROUNDS) if (OF.roundLive(r, T)) o[r.id] = P(OF.roundAt(r, T));
    for (const I of OF.INTS) if (T >= I.tL && T <= I.tEnd) o['I' + I.i] = P(OF.intAt(I, T));
    for (const J of OF.JT) o['J' + J.cat] = P(OF.jet(J, T).X.T);
    return o;
  }
  window.OFX = { shotAt, cam, phaseAt, SEQ, proj, GP, CP };
})();
