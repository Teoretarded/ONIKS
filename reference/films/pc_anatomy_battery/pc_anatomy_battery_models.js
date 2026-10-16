/* ANATOMY · BATTERY (Point Cloud C): the air-defence side of the battery as the assemblies the
   cutaway pulls apart. HD.pantsir partitioned by position (frame, equipment module, cab, turret
   ring, turret, twin guns, missile packs as their own objects), plus what the HD model leaves out
   (KamAZ V8 and its radiator fan under the cab, the power unit and its cooling fans in the module);
   HD.radar with its mast as five nested stages that slide out one after another (HD.radar extends
   them together), its engine bay and shelter interior; a KamAZ-6560 transloader with a loader crane.
   Public-reference level. The missile packs stay closed containers. Geometry only. */
(function () {
  const { V, R, X } = M3;
  const G = GEO;
  const PI = Math.PI, DEG = PI / 180, FY = [0, 1, 0], FZ = [0, 0, 1], FX = [1, 0, 0];
  const tp = (T, pr) => HD.tp(T, pr);
  const tpAll = (T, L) => L.map(pr => tp(T, pr));

  function bboxOf(pr) {
    let P;
    if (pr.p) P = pr.p;
    else if (pr.t === 'lathe') P = pr.st.map(q => V.mad(pr.a, pr.d, q[0]));
    else if (pr.t === 'blades') P = [pr.c];
    else P = [[0, 0, 0]];
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const q of P) for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
    return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
  }
  /* oriented box: centre c, unit axes u, w in the XY plane (third axis Z), half sizes */
  function obox(c, u, w, hu, hw, hz, o) {
    const q = (a, b, d) => [c[0] + u[0] * a + w[0] * b, c[1] + u[1] * a + w[1] * b, c[2] + d];
    return G.hex([q(-hu, -hw, -hz), q(-hu, hw, -hz), q(-hu, hw, hz), q(-hu, -hw, hz), q(hu, -hw, -hz), q(hu, hw, -hz), q(hu, hw, hz), q(hu, -hw, hz)], Object.assign({ bottom: true }, o || {}));
  }
  /* fan-local: hub at the origin, axis +Y; the film spins it about Y */
  const fanLocal = (n, r0, r1, o) => [G.blades([0, 0, 0], FY, n, r0, r1, Object.assign({ chord: 1.05, taper: 1, pitch: .28 }, o || {})),
    G.lathe([0, -.05, 0], FY, [[0, r0 * 1.05], [.08, r0 * 1.05], [.11, r0 * .5]], { n: 18, caps: true })];

  /* ================= Pantsir-S1 on KamAZ-6560 =================
     constants of HD.pantsir (hd_land.js): turret ring, gun/pack trunnion, search-radar mount */
  const PZ_RING = [0, 2.5, -2.0], PZ_PIV = [0, .85, -.1], PZ_SR = [0, 1.35, -.72], PZ_AX = [3.9, 2.1, -1.9, -3.3];
  const PACK_C = [1.19, .86, .1];                 // pack centre in the pitch frame (x mirrored for the left pack)
  const turretXf = st => X.make(R.y(st.yaw || 0), PZ_RING);
  const about = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  const pitchXf = st => X.mul(turretXf(st), about(R.x(-(st.pitch || 0)), PZ_PIV));
  const packXf = (st, side) => X.mul(pitchXf(st), X.make(R.I(), [side * PACK_C[0], PACK_C[1], PACK_C[2]]));
  const searchXf = st => X.mul(turretXf(st), X.make(R.y(st.sAnt || 0), PZ_SR));

  /* KamAZ-740 V8 under the cab (90° vee), radiator and fan at the front, gearbox behind */
  const PZ_FAN = [0, 1.06, 4.86];
  function kamazEngine() {
    const E = [], zb = 3.4, zf = 4.45, zm = (zb + zf) / 2, hz = (zf - zb) / 2;
    E.push(G.box([-.33, .9, zb], [.33, 1.28, zf], { bottom: true }));                           // crankcase
    for (const sx of [-1, 1]) {
      const u = [sx * Math.SQRT1_2, Math.SQRT1_2, 0], w = [Math.SQRT1_2, -sx * Math.SQRT1_2, 0], c = [sx * .27, 1.44, zm];
      const at = h => [c[0] + u[0] * h, c[1] + u[1] * h, zm];
      E.push(obox(c, u, w, .17, .14, hz - .03));                                                 // cylinder bank
      for (let k = 0; k < 4; k++) { const q = at(.23); q[2] = zb + .16 + k * .245; E.push(obox(q, u, w, .06, .14, .1)); }   // heads
      E.push(G.cyl([sx * .58, 1.42, zb + .1], [sx * .58, 1.42, zf - .1], .045, { n: 10 }));      // exhaust manifold
      E.push(G.lathe([sx * .1, 1.62, 3.55], [sx, 0, 0], [[0, .05], [.04, .11], [.12, .12], [.16, .07], [.2, .1], [.27, .1], [.3, .05]], { n: 16, caps: true }));   // turbo
    }
    E.push(G.box([-.09, 1.5, zb + .08], [.09, 1.7, zf - .1]));                                   // intake plenum
    E.push(G.lathe([0, 1.14, zb], [0, 0, -1], [[0, .36], [.1, .34], [.16, .25]], { n: 26, caps: true }));        // flywheel housing
    E.push(G.box([-.24, .92, 2.82], [.24, 1.2, 3.25], { bottom: true }));                        // gearbox
    for (const z of [2.95, 3.1]) E.push(G.box([-.25, .91, z], [.25, 1.21, z + .03]));
    E.push(G.lathe([0, 1.1, zf], FZ, [[0, .22], [.05, .2], [.07, .12], [.12, .12]], { n: 20, caps: true }));      // timing cover + damper
    E.push(G.lathe([.26, 1.36, zf - .02], FZ, [[0, .08], [.14, .08]], { n: 12, caps: true }));                   // alternator
    // radiator core, tanks, fan shroud
    E.push(G.box([-.56, .66, 5.0], [.56, .74, 5.1]));
    E.push(G.box([-.56, 1.4, 5.0], [.56, 1.48, 5.1]));
    for (const x of [-.56, .56]) E.push(G.box([x - .03, .74, 5.0], [x + .03, 1.4, 5.1]));
    for (let x = -.52; x < .53; x += .045) E.push(G.line([[x, .75, 5.05], [x, 1.39, 5.05]]));
    E.push(G.lathe([0, PZ_FAN[1], 4.98], [0, 0, -1], [[0, .38], [.12, .38], [.15, .34]], { n: 30 }));            // shroud
    return E;
  }
  /* power unit in the equipment module: turbine generator on a skid, heat exchangers and four
     cooling fans behind the side louvres */
  const PWR_FANS = [];
  for (const sx of [-1, 1]) for (const z of [-2.45, -1.75]) PWR_FANS.push({ c: [sx * 1.13, 2.12, z], sx });
  function powerUnit() {
    const P = [];
    P.push(G.box([-.2, 1.3, -3.7], [.75, 1.42, -.95], { bottom: true }));                        // skid
    P.push(G.lathe([.28, 1.78, -3.6], FZ, [[0, .16], [.08, .24], [.3, .26], [.5, .2], [.9, .22], [1.15, .18], [1.3, .24], [1.36, .12]], { n: 22, caps: true }));   // gas turbine
    P.push(G.lathe([.28, 1.78, -2.2], FZ, [[0, .3], [.95, .3], [1.05, .22]], { n: 24, caps: true }));             // generator
    P.push(G.box([.02, 1.42, -3.55], [.54, 1.52, -1.1]));
    P.push(G.cyl([.28, 1.98, -3.5], [.28, 2.44, -3.9], .1, { n: 10, caps: true }));             // exhaust duct
    for (const sx of [-1, 1]) {
      P.push(G.box([sx * .93, 1.86, -2.82], [sx * 1.05, 2.38, -1.38]));                           // heat exchanger
      for (const f of PWR_FANS.filter(f => f.sx === sx)) P.push(G.lathe([sx * 1.08, 2.12, f.c[2]], [sx, 0, 0], [[0, .23], [.1, .23]], { n: 20 }));   // fan rings
    }
    // electronics racks forward in the module, down both walls
    for (const sx of [-1, 1]) for (const z of [.35, 1.15, 1.95]) {
      P.push(G.box([sx * .62, 1.32, z], [sx * 1.16, 2.38, z + .7]));
      for (let k = 1; k < 6; k++) P.push(G.box([sx * .6, 1.32 + k * .18, z + .04], [sx * .62, 1.34 + k * .18, z + .66]));
    }
    return P;
  }
  function pantsir() {
    const M = HD.pantsir(), by = n => M.parts.find(p => p.name === n);
    const S = { frame: [], body: [], wheelsL: [], wheelsR: [], ring: [], turret: [], gunL: [], gunR: [], packL: [], packR: [] };
    for (const pr of by('chassis').prims) { const b = bboxOf(pr); (b.mn[1] >= 1.29 && b.mx[1] > 1.42 && b.mn[0] > -1.3 && b.mx[0] < 1.3 ? S.body : S.frame).push(pr); }
    for (const pr of by('wheels').prims) S[bboxOf(pr).c[0] > 0 ? 'wheelsR' : 'wheelsL'].push(pr);
    by('turret').prims.forEach((pr, i) => (i === 0 ? S.ring : S.turret).push(pr));
    for (const pr of by('guns').prims) S[bboxOf(pr).c[0] > 0 ? 'gunR' : 'gunL'].push(pr);
    for (const pr of by('missiles').prims) {
      const b = bboxOf(pr), sd = b.c[0] > 0 ? 'R' : 'L', w = b.mx[0] - b.mn[0];
      const cradle = (pr.t === 'hex' && w < .06) || (pr.t === 'lathe' && Math.abs(pr.d[0]) > .9);
      (cradle ? S['gun' + sd] : S['pack' + sd]).push(pr);
    }
    // the packs in their own frame (centre at the origin), so the crane can carry them
    const packL = tpAll(X.make(R.I(), [PACK_C[0], -PACK_C[1], -PACK_C[2]]), S.packL);
    const packR = tpAll(X.make(R.I(), [-PACK_C[0], -PACK_C[1], -PACK_C[2]]), S.packR);
    // pack end frames: the six container ends read as a closed bank
    for (const P of [packL, packR]) for (const z of [-1.62, 1.62]) {
      P.push(G.box([-.31, -.21, z - .02], [.33, -.19, z + .02]), G.box([-.31, .19, z - .02], [.33, .21, z + .02]));
      for (const x of [-.31, .31]) P.push(G.box([x - .01, -.21, z - .02], [x + .01, .21, z + .02]));
    }
    for (const P of [packL, packR]) for (const z of [-1.25, 1.2]) for (const x of [-.16, .16]) P.push(G.lathe([x, .21, z], FY, [[0, .04], [.07, .04], [.07, .02]], { n: 8, caps: true }));   // lifting lugs
    return {
      M, S, packL, packR,
      cab: by('cab').prims, search: by('searchRadar').prims, track: by('trackRadar').prims, eo: by('eo').prims,
      engine: kamazEngine(), power: powerUnit(),
      engFan: fanLocal(7, .09, .33, { chord: 1.2 }), pwrFan: fanLocal(5, .06, .2, { chord: 1.3 }),
    };
  }

  /* ================= Monolith-B on MZKT-7930 =================
     HD.radar constants: mast base, array offsets; the mast here is five stages that slide out one
     after another (joint 1 first), and the array rides the top stage */
  const RAD_MZ = -5.1, MAST_R = [.24, .2, .165, .135, .11], MAST_L = 1.9, MAST_Y0 = 1.6, MAST_RISE = 1.75, ROOF = 3.4;
  function mastStage(i) {
    const r = MAST_R[i], last = i === MAST_R.length - 1, g = .08, L = MAST_L;
    const st = last ? [[0, r], [L, r]] : [[0, r], [L - g, r], [L - g, r * 1.12], [L, r * 1.12]];
    const out = [G.lathe([0, 0, 0], FY, st, { n: 18, caps: true })];
    if (!last) for (const a of [0, PI / 2, PI, 1.5 * PI]) out.push(G.box([Math.cos(a) * r * 1.12 - .02, L - .16, Math.sin(a) * r * 1.12 - .02], [Math.cos(a) * r * 1.12 + .02, L - .02, Math.sin(a) * r * 1.12 + .02]));   // locking pins
    return out;
  }
  function mastHead() {
    return [G.lathe([0, 0, 0], FY, [[0, .2], [.1, .2], [.1, .27], [.24, .27], [.26, .2]], { n: 18, caps: true }),
      G.cyl([0, .26, 0], [0, .5, 0], .15, { n: 14, caps: true }),
      G.lathe([0, .5, 0], FY, [[0, .19], [.07, .19]], { n: 16, caps: true })];      // rotary joint
  }
  const MZ_FAN_C = [1.35, 2.2, 3.525];
  function yamzEngine() {
    const E = [], zb = 2.84, zf = 4.08, zm = (zb + zf) / 2, hz = (zf - zb) / 2;
    E.push(G.box([-.38, 1.22, zb], [.38, 1.78, zf], { bottom: true }));
    for (const sx of [-1, 1]) {
      const u = [sx * Math.SQRT1_2, Math.SQRT1_2, 0], w = [Math.SQRT1_2, -sx * Math.SQRT1_2, 0], c = [sx * .36, 2.02, zm];
      const at = h => [c[0] + u[0] * h, c[1] + u[1] * h, zm];
      E.push(obox(c, u, w, .2, .17, hz - .02));
      for (let k = 0; k < 6; k++) { const q = at(.27); q[2] = zb + .12 + k * .2; E.push(obox(q, u, w, .07, .16, .088)); }
      E.push(obox(at(.38), u, w, .04, .12, hz - .08));
      E.push(G.cyl([sx * .7, 2.02, zb + .1], [sx * .7, 2.02, zf - .1], .05, { n: 10 }));
      E.push(G.lathe([sx * .06, 2.32, 3.9], [sx, 0, 0], [[0, .05], [.04, .12], [.13, .13], [.17, .08], [.21, .11], [.3, .11], [.33, .05]], { n: 18, caps: true }));
    }
    E.push(G.box([-.1, 1.98, zb + .08], [.1, 2.22, zf - .1]));
    E.push(G.lathe([0, 1.55, zb], [0, 0, -1], [[0, .4], [.12, .38], [.18, .28]], { n: 28, caps: true }));
    E.push(G.lathe([0, 1.5, zf], FZ, [[0, .26], [.05, .24], [.07, .15], [.12, .15]], { n: 22, caps: true }));
    for (const sx of [-1, 1]) {
      const xa = Math.min(sx * 1.06, sx * 1.24), xb = Math.max(sx * 1.06, sx * 1.24), xm = sx * 1.15;
      E.push(G.box([xa, 2.66, 3.1], [xb, 2.76, 3.95]), G.box([xa, 1.64, 3.1], [xb, 1.74, 3.95], { bottom: true }));
      for (const z of [3.1, 3.95]) E.push(G.box([xa, 1.74, z - .025], [xb, 2.66, z + .025]));
      for (let z = 3.15; z < 3.93; z += .045) E.push(G.line([[xm, 1.75, z], [xm, 2.65, z]]));
      E.push(G.lathe([sx * 1.25, MZ_FAN_C[1], MZ_FAN_C[2]], [sx, 0, 0], [[0, .44], [.14, .44], [.16, .47]], { n: 32 }));
    }
    return E;
  }
  /* shelter interior: operator consoles, electronics racks, cabling trunk to the mast */
  function shelterInside() {
    const P = [];
    for (const z of [-3.9, -3.2, -2.5, -1.8]) { P.push(G.box([-1.36, 1.52, z], [-.86, 3.2, z + .62])); for (let k = 1; k < 7; k++) P.push(G.box([-.87, 1.52 + k * .22, z + .04], [-.85, 1.54 + k * .22, z + .58])); }
    for (const z of [-.6, .7]) {
      P.push(G.box([.62, 1.52, z], [1.36, 2.28, z + 1.0]));                                     // console desk
      P.push(G.box([1.1, 2.28, z + .05], [1.34, 2.98, z + .95]));                               // screen bank
      P.push(G.panel([[1.09, 2.36, z + .12], [1.09, 2.36, z + .88], [1.09, 2.9, z + .88], [1.09, 2.9, z + .12]]));
      P.push(G.box([.2, 1.52, z + .3], [.55, 1.95, z + .7]));                                   // seat
      P.push(G.box([.2, 1.95, z + .62], [.55, 2.45, z + .7]));
    }
    P.push(G.box([-.3, 1.52, -4.62], [.3, 1.6, -4.2]));
    P.push(G.box([-.12, 1.6, -4.7], [.12, 3.35, -4.5]));                                        // cable trunk up the mast well
    return P;
  }
  function radar() {
    const M = HD.radar(), by = n => M.parts.find(p => p.name === n);
    const S = { frame: [], bay: [], wheelsL: [], wheelsR: [] };
    for (const pr of by('chassis').prims) { const b = bboxOf(pr); (b.c[2] > 2.9 && b.c[2] < 4.2 && b.mx[1] > 1.44 ? S.bay : S.frame).push(pr); }
    for (const pr of by('wheels').prims) S[bboxOf(pr).c[0] > 0 ? 'wheelsR' : 'wheelsL'].push(pr);
    return {
      M, S, cab: by('cab').prims, body: by('body').prims, array: by('array').prims,
      stages: MAST_R.map((_, i) => mastStage(i)), head: mastHead(),
      engine: yamzEngine(), inside: shelterInside(),
      radFan: fanLocal(7, .11, .41, { chord: 1.1 }), acFan: fanLocal(5, .08, .36, { chord: .9, pitch: .3 }),
    };
  }
  /* the mast's joints: e[j] (0..MAST_RISE) for joint j = 1..4 between stage j-1 and j */
  function mastPose(e) {
    const base = [MAST_Y0]; for (let i = 1; i < 5; i++) base.push(base[i - 1] + e[i - 1]);
    return { base, top: base[4] + MAST_L };
  }
  /* the array on the rotary joint: k 0 stowed flat along the roof .. 1 raised; yaw the array azimuth */
  function arrayXf(top, k, ant) {
    const tilt = (90 + (14 - 90) * k) * DEG, yaw = PI / 2 + (ant - PI / 2) * k;
    return X.mul(X.make(R.y(yaw), [0, top + .7, RAD_MZ]), X.make(R.x(-tilt), [0, 0, -.2]));
  }
  const headXf = (top, k, ant) => X.make(R.y(PI / 2 + (ant - PI / 2) * k), [0, top, RAD_MZ]);

  /* ================= transloader: KamAZ-6560 with a loader crane =================
     vehicle-local like the Pantsir: origin on the ground at the vehicle centre, +Z forward */
  const TZL = { PIVOT: [0, 3.3, 2.55], BOOM: 4.6, EXT: 4.4, HOOK_DROP: 1.6,
    SLOTS: { fA: [.64, 1.64, .45], fB: [-.64, 1.64, .45], sA: [.64, 1.64, -3.3], sB: [-.64, 1.64, -3.3] } };
  function transloader(cabPrims) {
    const C = [], W = [], B = [], J = [], TU = [], BMp = [], JB = [], HK = [];
    const fine = { fine: true };
    HD.chassis8x8(C, 5.35, -5.1, { axles: PZ_AX, r: .62, x: .85, w: .42, halfW: 1.25, deckY: 1.3, railY: [.72, 1.12], deckFront: 2.05, fenders: [[1.26, 3.1, false, true], [-4.08, -1.14, true, true]] });
    for (const z of PZ_AX) for (const sx of [-1, 1]) HD.wheel(W, z, sx, { r: .62, w: .42, x: .85, lugs: 14, n: 22 });
    C.push(G.lathe([1.05, .92, -1.0], FZ, [[0, .18], [.04, .25], [1.5, .25], [1.54, .18]], { n: 16, caps: true }));     // fuel tank
    C.push(G.box([-1.25, .6, -1.6], [-.85, 1.1, -.7]));                                          // battery box
    // bed: headboard, low side boards, cradles (two saddles per pack)
    B.push(G.box([-1.25, 1.3, 1.98], [1.25, 2.2, 2.08]));
    for (const sx of [-1, 1]) B.push(G.box([sx * 1.2, 1.3, -5.05], [sx * 1.25, 1.55, 1.98]));
    B.push(G.box([-1.25, 1.3, -5.1], [1.25, 1.55, -5.05]));
    for (const k of Object.keys(TZL.SLOTS)) { const s = TZL.SLOTS[k]; for (const dz of [-1.05, 1.05]) B.push(G.box([s[0] - .33, 1.3, s[2] + dz - .1], [s[0] + .33, 1.42, s[2] + dz + .1], { bottom: true })); }
    // stabiliser legs (move with dep) and their beams
    for (const x of [-1.62, 1.62]) for (const z of [2.3, -4.6]) {
      J.push(G.cyl([x, .08, z], [x, 1.1, z], .09, { n: 10 })); J.push(G.box([x - .26, 0, z - .26], [x + .26, .08, z + .26]));
      C.push(G.box([Math.sign(x) * .8, 1.0, z - .13], [x, 1.2, z + .13]));
    }
    // slewing column, luffing ram
    TU.push(G.lathe([0, 1.3, TZL.PIVOT[2]], FY, [[0, .5], [.22, .5], [.28, .4], [1.55, .36], [1.7, .32]], { n: 24 }));
    TU.push(G.box([-.36, 2.95, TZL.PIVOT[2] - .42], [.36, 3.55, TZL.PIVOT[2] + .42]));
    TU.push(G.box([.36, 2.3, TZL.PIVOT[2] - .28], [.72, 2.95, TZL.PIVOT[2] + .28], fine));    // control station
    TU.push(G.cyl([.22, 2.2, TZL.PIVOT[2] + .4], [.1, 3.05, TZL.PIVOT[2] + 1.15], .08, { n: 10 }));
    // boom (boom-local: heel pin at the origin, along +Z), telescopic jib and its head sheave
    BMp.push(G.box([-.2, -.26, -.35], [.2, .26, TZL.BOOM], { ribs: { z: 5 } }));
    BMp.push(G.cyl([-.26, 0, 0], [.26, 0, 0], .18, { n: 12 }));
    JB.push(G.box([-.15, -.19, 0], [.15, .19, TZL.BOOM - .2]));
    JB.push(G.cyl([-.13, 0, TZL.BOOM - .1], [.13, 0, TZL.BOOM - .1], .22, { n: 14 }));
    // hook block and spreader (hook-local: hook eye at the origin; the beam runs along the pack)
    HK.push(G.box([-.15, -.32, -.15], [.15, 0, .15]));
    HK.push(G.box([-.08, -.72, -1.4], [.08, -.56, 1.4], { ribs: { z: 4 } }));
    HK.push(G.box([-.035, -.56, -.05], [.035, -.32, .05], fine));
    return { C, W, cab: cabPrims, B, J, TU, BM: BMp, JB, HK };
  }
  const slewXf = slew => about(R.y(slew), [0, 0, TZL.PIVOT[2]]);
  const boomXf = st => X.make(R.mul(R.y(st.slew || 0), R.x(-(st.luff || 0))), TZL.PIVOT);
  const boomTip = st => X.ap(boomXf(st), [0, 0, TZL.BOOM - .1 + (st.ext || 0)]);
  /* crane IK: hook position (vehicle-local) + rope length -> slew, luff, ext */
  function craneSolve(hook, cable) {
    const tip = [hook[0], hook[1] + cable, hook[2]], d = V.sub(tip, TZL.PIVOT);
    const rho = Math.hypot(d[0], d[2]), L = Math.hypot(rho, d[1]);
    return { slew: Math.atan2(d[0], d[2]), luff: Math.atan2(d[1], rho), ext: Math.max(0, Math.min(TZL.EXT, L - (TZL.BOOM - .1))) };
  }

  window.BATM = { bboxOf, pantsir, radar, transloader, TZL, slewXf, boomXf, boomTip, craneSolve,
    PZ_RING, PZ_PIV, PZ_SR, PZ_AX, PACK_C, PZ_FAN, PWR_FANS, turretXf, pitchXf, packXf, searchXf,
    RAD_MZ, MAST_R, MAST_L, MAST_Y0, MAST_RISE, ROOF, MZ_FAN_C, mastPose, arrayXf, headXf };
})();
