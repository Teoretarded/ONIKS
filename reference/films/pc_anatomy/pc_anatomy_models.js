/* ANATOMY (Point Cloud C): model adapters plus the film's own models:
   TLC 2 lifted out of HD.tel as its own object (so the crane can move it),
   the K342P transloader with a working loader crane, and the MZKT-7930
   carrier's machinery for the X-ray cutaway (public-reference level).
   Geometry only; the film samples it into dots. */
(function () {
  const { V, R, X } = M3;
  const G = GEO;
  const HDok = k => !!(window.HD && typeof HD[k] === 'function');

  /* ---------- adapters ---------- */
  const MOD = {
    hd: () => !!(window.HD && HD.READY_LAND),
    tel: () => HDok('tel') ? HD.tel() : G.tel(),
    tube: (m, st, side) => (window.HD && HD.telTube ? HD.telTube(m, st, side) : G.tubeFrame(m, st, side)),
    oniks: o => HDok('oniks') ? HD.oniks(o) : stubOniks(o),
    booster: () => HDok('oniksBooster') ? HD.oniksBooster() : stubBooster(),
    pantsir: () => HDok('pantsir') ? HD.pantsir() : stubPantsir(),
    ddg: () => HDok('destroyer') ? HD.destroyer() : G.destroyer(),
  };
  const tp = (T, pr) => {
    if (window.HD && HD.tp) return HD.tp(T, pr);
    const q = Object.assign({}, pr);
    if (pr.p) q.p = pr.p.map(p => X.ap(T, p));
    if (pr.t === 'lathe') { q.a = X.ap(T, pr.a); q.d = X.dir(T, pr.d); }
    if (pr.t === 'blades') { q.c = X.ap(T, pr.c); q.d = X.dir(T, pr.d); }
    return q;
  };

  function stubOniks() {
    const m = G.oniks({ wings: false, n: 40, gen: 14 }), P = m.parts[0].prims;
    const W = []; for (const sx of [-1, 1]) W.push(G.panel([[sx * .36, 0, .95], [sx * .88, 0, -.15], [sx * .88, 0, -.62], [sx * .36, 0, -.62]]));
    return { parts: [
      { name: 'body', label: 'P-800 Oniks', prims: P.filter((_, i) => i < 3) },
      { name: 'fins', label: 'Tail fins ×4', prims: P.filter((_, i) => i >= 3) },
      { name: 'wings', label: 'Wings ×2', prims: W },
      { name: 'cover', label: 'Intake cover', prims: [G.lathe([0, 0, 4.42], [0, 0, 1], [[0, .31], [.3, .2], [.42, 0]], { n: 24 })], show: st => !!st.cover },
    ] };
  }
  function stubBooster() { return { parts: [{ name: 'casing', label: 'Booster casing', prims: [G.lathe([0, 0, -1.2], [0, 0, 1], [[0, .12], [.4, .245], [2.3, .245], [2.4, .16]], { n: 22, caps: true })] }] }; }
  function stubPantsir() {
    const P = [G.box([-1.2, .95, -4.5], [1.2, 1.45, 4.2]), G.box([-1.3, 1.45, 2.8], [1.3, 3.1, 4.5]), G.box([-1.1, 1.45, -4.2], [1.1, 2.6, 2.3])];
    return { parts: [{ name: 'chassis', label: 'KamAZ-6560 8×8', prims: P }] };
  }

  /* ---------- TLC 2 out of the HD launcher ----------
     TLC-local: origin at the tube base (HD TUBE), +Z toward the mouth. The launcher keeps
     everything that is not TLC 2 (frame, cross members, TLC 1). */
  function splitLauncher(telM, side) {
    const lp = telM.parts.find(p => p.name === 'launcher');
    const base = MOD.tube(telM, { elev: 0 }, side).base;
    const inv = X.make(R.I(), [-base[0], -base[1], -base[2]]);
    const centre = pr => {
      if (pr.t === 'lathe') return pr.a;
      if (pr.t === 'blades') return pr.c;
      if (pr.p) { const s = [0, 0, 0]; for (const q of pr.p) { s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; } return V.mul(s, 1 / pr.p.length); }
      return [99, 99, 99];
    };
    const mine = [], rest = [];
    for (const pr of lp.prims) { const c = centre(pr); (Math.hypot(c[0] - base[0], c[1] - base[1]) < .64 ? mine : rest).push(pr); }
    const capPart = telM.parts.find(p => p.name === (side > 0 ? 'capR' : 'capL'));
    const shell = mine.map(pr => tp(inv, pr)), cap = capPart ? capPart.prims.map(pr => tp(inv, pr)) : [];
    return { base, rest, tlc: { LEN: telM.TUBE_LEN || 9.25, R: .5, parts: [{ name: 'shell', label: 'TLC · 3M55', prims: shell }, { name: 'cap', label: 'Front cap', prims: cap }] } };
  }

  /* ---------- K342P transloader (TZM) with a loader crane ----------
     vehicle-local like the TEL: origin on the ground at the vehicle centre, +Z forward */
  const TZM = {
    PIVOT: [0, 3.55, 2.95], BOOM: 5.3, EXT: 4.6,
    SLOTS: [[.74, 2.15, -7.2], [-.74, 2.15, -7.2]],      // TLC bases on the bed cradles (+Z along the bed)
  };
  function tzm() {
    const C = [], K = [], B = [], J = [], TU = [], BM = [], JB = [], HK = [];
    const fine = { fine: true };
    if (window.HD && HD.chassis8x8) HD.chassis8x8(C, 6.2, -6.9, { axles: [4.45, 2.25, -2.75, -4.95], deckFront: 2.35, fenders: [[1.42, 2.95, false, true], [-5.78, -1.9, true, true]] });
    else C.push(G.box([-1.2, .95, -6.7], [1.2, 1.42, 5.7], { ribs: { z: 8 } }));
    const W = [];
    if (window.HD && HD.wheel) for (const z of [4.45, 2.25, -2.75, -4.95]) for (const sx of [-1, 1]) HD.wheel(W, z, sx, {});
    for (const sx of [-1, 1]) C.push(G.cyl([sx * 1.28, 1.02, 1.0], [sx * 1.28, 1.02, -1.0], .3, { n: 16, gen: 4, caps: true }));
    C.push(G.box([.95, .66, -1.55], [1.48, 1.28, -1.05], fine));
    // cab (forward-control, like the launcher's)
    K.push(G.hex([[-1.5, 1.55, 4.1], [1.5, 1.55, 4.1], [1.5, 1.55, 6.3], [-1.5, 1.55, 6.3], [-1.42, 3.2, 4.16], [1.42, 3.2, 4.16], [1.42, 3.2, 5.85], [-1.42, 3.2, 5.85]]));
    K.push(G.box([-.93, 1.02, 4.35], [.93, 1.55, 6.24]));
    K.push(G.box([-1.55, 1.02, 6.2], [1.55, 1.36, 6.48]));
    for (const sx of [-1, 1]) K.push(G.panel([[sx * .05, 2.4, 6.22], [sx * 1.36, 2.4, 6.22], [sx * 1.3, 3.1, 5.9], [sx * .05, 3.1, 5.9]], { pts: false }));
    K.push(G.box([-1.36, 1.45, 3.55], [1.36, 2.95, 4.1]));
    // bed: deck, side rails, stanchions, two cradles of saddles
    if (!(window.HD && HD.chassis8x8)) B.push(G.box([-1.35, 1.35, -6.85], [1.35, 1.47, 2.3], { ribs: { z: 6 } }));
    for (const sx of [-1, 1]) {
      B.push(G.box([sx * 1.3 - .04, 1.47, -6.8], [sx * 1.3 + .04, 1.62, 2.25], fine));
      for (let z = -6.55; z < 2.2; z += 1.45) B.push(G.box([sx * 1.3 - .04, 1.47, z - .04], [sx * 1.3 + .04, 2.25, z + .04], fine));
    }
    for (const [x] of TZM.SLOTS) for (const z of [-5.8, -2.0, 1.2]) {
      B.push(G.box([x - .56, 1.47, z - .18], [x - .32, 1.86, z + .18]));
      B.push(G.box([x + .32, 1.47, z - .18], [x + .56, 1.86, z + .18]));
    }
    // boom rest behind the bed
    B.push(G.box([-.09, 1.45, -1.75], [.09, 3.12, -1.5]));
    B.push(G.box([-.16, 3.12, -1.8], [.16, 3.22, -1.45]));
    // stabiliser legs (move with dep)
    for (const x of [-1.75, 1.75]) for (const z of [2.6, -6.3]) { J.push(G.cyl([x, .1, z], [x, 1.3, z], .11, { n: 10, gen: 2 })); J.push(G.box([x - .3, 0, z - .3], [x + .3, .09, z + .3])); }
    for (const x of [-1.75, 1.75]) for (const z of [2.6, -6.3]) C.push(G.box([Math.sign(x) * .8, 1.2, z - .15], [x, 1.42, z + .15]));
    // slewing column
    TU.push(G.lathe([0, 1.47, TZM.PIVOT[2]], [0, 1, 0], [[0, .55], [.3, .55], [.36, .45], [1.55, .4], [1.72, .36]], { n: 24, gen: 8 }));
    TU.push(G.box([-.42, 3.08, TZM.PIVOT[2] - .45], [.42, 3.7, TZM.PIVOT[2] + .5]));
    TU.push(G.box([.42, 2.3, TZM.PIVOT[2] - .3], [.85, 3.0, TZM.PIVOT[2] + .3], fine));
    TU.push(G.cyl([.25, 2.2, TZM.PIVOT[2] + .5], [.1, 3.2, TZM.PIVOT[2] + 1.35], .09, { n: 10, gen: 2 }));   // luffing ram
    // main boom (boom-local: heel pin at origin, along +Z)
    BM.push(G.box([-.24, -.3, -.4], [.24, .3, TZM.BOOM], { ribs: { z: 5 } }));
    BM.push(G.cyl([-.3, 0, 0], [.3, 0, 0], .2, { n: 12, gen: 0 }));
    // telescopic jib with its head sheave
    JB.push(G.box([-.18, -.22, 0], [.18, .22, TZM.BOOM - .2]));
    JB.push(G.cyl([-.15, 0, TZM.BOOM - .1], [.15, 0, TZM.BOOM - .1], .25, { n: 14, gen: 0 }));
    // hook block + spreader beam (hook-local: hook eye at origin)
    HK.push(G.box([-.17, -.36, -.17], [.17, 0, .17]));
    HK.push(G.box([-.1, -1.02, -3.18], [.1, -.8, 3.18], { ribs: { z: 6 } }));
    HK.push(G.box([-.04, -.8, -.05], [.04, -.36, .05], fine));
    return {
      parts: [
        { name: 'chassis', label: 'MZKT-7930 · 8×8', prims: C },
        { name: 'wheels', label: 'Wheels ×8', prims: W, xf: st => X.make(R.I(), [0, 0, 0]) },
        { name: 'cab', label: 'Cab', prims: K },
        { name: 'bed', label: 'Bed · 2 TLC cradles', prims: B },
        { name: 'stabilisers', label: 'Stabilisers ×4', prims: J, xf: st => X.make(R.I(), [0, 1.2 * (1 - (st.dep || 0)), 0]) },
        { name: 'turret', label: 'Crane column', prims: TU, xf: st => slewXf(st.slew || 0) },
        { name: 'boom', label: 'Crane boom', prims: BM, xf: st => boomXf(st) },
        { name: 'jib', label: 'Telescopic jib', prims: JB, xf: st => X.mul(boomXf(st), X.make(R.I(), [0, 0, st.ext || 0])) },
        { name: 'hook', label: 'Hook · spreader', prims: HK, xf: st => X.make(R.y(st.hookYaw || 0), st.hook || [0, 3, 0]) },
      ],
    };
  }
  function slewXf(slew) { const Rm = R.y(slew), o = [0, 0, TZM.PIVOT[2]], ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], 0, o[2] - ro[2]]); }
  function boomXf(st) { return X.make(R.mul(R.y(st.slew || 0), R.x(-(st.luff || 0))), TZM.PIVOT); }
  const boomTip = st => X.ap(boomXf(st), [0, 0, TZM.BOOM - .1 + (st.ext || 0)]);
  /* crane IK: hook position (vehicle-local) + cable length -> slew, luff, ext */
  function craneSolve(hook, cable) {
    const tip = [hook[0], hook[1] + cable, hook[2]], d = V.sub(tip, TZM.PIVOT);
    const rho = Math.hypot(d[0], d[2]), L = Math.hypot(rho, d[1]);
    return { slew: Math.atan2(d[0], d[2]), luff: Math.atan2(d[1], rho), ext: Math.max(0, Math.min(TZM.EXT, L - (TZM.BOOM - .1))) };
  }

  /* ejected-booster model origin in the round (its nozzle exit at -4.85) */
  const BOOSTER_Z = -3.35;

  /* ---------- the carrier's machinery, for the X-ray cutaway ----------
     TEL-local: origin on the ground at the vehicle centre, +Z forward. The HD chassis is
     partitioned by position into the assemblies an exploded view pulls apart; the driveline
     the HD model leaves out (engine, transmission, transfer case, cardan shafts, wheel hubs,
     radiators, fans) is added in the MZKT-7930 layout (power pack behind the cab, transfer
     case between axles 2 and 3, through-drive to axles 1 and 4), sized to clear the HD frame.
     cls: 'shell' outer steel (see-through under the X-ray), 'part' always seen,
          'hidden' inside the shell (seen only once the scan has passed). */
  const AXZ = [4.45, 2.25, -2.75, -4.95];
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
  function chassisGroup(pr) {
    const { mn, mx, c } = bboxOf(pr), ax = Math.max(Math.abs(mn[0]), Math.abs(mx[0]));
    if (pr.t === 'lathe' && mx[1] < .9 && ax < 1.1 && AXZ.some(z => Math.abs(c[2] - z) < .4)) return 'axles';
    if (pr.t !== 'lathe' && mn[0] > -1.39 && mx[0] < 1.39 && mn[1] > 1.44 && mx[1] < 2.97 && mn[2] > 2.94 && mx[2] < 4.11) return 'bay';
    if (c[2] > 2.9 && c[2] < 4.2 && mx[1] > 2.97) return 'engacc';
    if (c[0] < -.9 && c[2] > -1.9 && c[2] < .6) return 'tank';
    if (c[0] > .85 && mx[1] < 1.35 && c[2] > -4.5 && c[2] < .6) return 'boxes';
    if (pr.t !== 'panel' && ax > 1.5 && (Math.abs(c[2] - 1.15) < .2 || Math.abs(c[2] + 6.5) < .2)) return c[0] > 0 ? 'outrigR' : 'outrigL';
    return 'frame';
  }
  /* oriented box: centre c, unit axes u, w in the XY plane (third axis Z), half sizes */
  function obox(c, u, w, hu, hw, hz, o) {
    const q = (a, b, d) => [c[0] + u[0] * a + w[0] * b, c[1] + u[1] * a + w[1] * b, c[2] + d];
    return G.hex([q(-hu, -hw, -hz), q(-hu, hw, -hz), q(-hu, hw, hz), q(-hu, -hw, hz), q(hu, -hw, -hz), q(hu, hw, -hz), q(hu, hw, hz), q(hu, -hw, hz)], Object.assign({ bottom: true }, o || {}));
  }
  const FAN_C = [1.35, 2.2, 3.525];
  /* YaMZ-846 V12 (90° vee), crank on the truck's axis */
  function engine() {
    const E = [], zb = 2.84, zf = 4.08, zm = (zb + zf) / 2, hz = (zf - zb) / 2;
    E.push(G.box([-.38, 1.22, zb], [.38, 1.78, zf], { bottom: true }));
    for (const sx of [-1, 1]) {
      const u = [sx * Math.SQRT1_2, Math.SQRT1_2, 0], w = [Math.SQRT1_2, -sx * Math.SQRT1_2, 0], c = [sx * .36, 2.02, zm];
      const at = h => [c[0] + u[0] * h, c[1] + u[1] * h, zm];
      E.push(obox(c, u, w, .2, .17, hz - .02));                                                // cylinder bank
      for (let k = 0; k < 6; k++) { const q = at(.27); q[2] = zb + .12 + k * .2; E.push(obox(q, u, w, .07, .16, .088)); }   // heads
      E.push(obox(at(.38), u, w, .04, .12, hz - .08));                                          // valve cover
      E.push(G.cyl([sx * .7, 2.02, zb + .1], [sx * .7, 2.02, zf - .1], .05, { n: 10 }));       // exhaust manifold
      for (let k = 0; k < 6; k++) E.push(G.cyl([sx * .6, 2.02, zb + .12 + k * .2], [sx * .7, 2.02, zb + .12 + k * .2], .035, { n: 8 }));
      // turbocharger at the front of the vee: compressor and turbine scrolls on one shaft
      E.push(G.lathe([sx * .06, 2.32, 3.9], [sx, 0, 0], [[0, .05], [.04, .12], [.13, .13], [.17, .08], [.21, .11], [.3, .11], [.33, .05]], { n: 18, caps: true }));
    }
    E.push(G.box([-.1, 1.98, zb + .08], [.1, 2.22, zf - .1]));                                  // intake plenum
    E.push(G.lathe([0, 1.55, zb], [0, 0, -1], [[0, .4], [.12, .38], [.18, .28]], { n: 28, caps: true }));        // flywheel housing
    E.push(G.lathe([0, 1.5, zf], [0, 0, 1], [[0, .26], [.05, .24], [.07, .15], [.12, .15]], { n: 22, caps: true })); // timing cover + damper
    E.push(G.lathe([.3, 1.95, zf - .02], [0, 0, 1], [[0, .09], [.16, .09]], { n: 14, caps: true }));             // alternator
    return E;
  }
  /* fan-local: hub at the origin, axis +X (the film spins it) */
  function fanLocal() {
    return [G.blades([0, 0, 0], [1, 0, 0], 7, .11, .41, { chord: 1.1, taper: 1, pitch: .28 }),
      G.lathe([-.06, 0, 0], [1, 0, 0], [[0, .12], [.1, .12], [.13, .06]], { n: 20, caps: true })];
  }
  function radiator(sx) {
    const R_ = [], xa = Math.min(sx * 1.06, sx * 1.24), xb = Math.max(sx * 1.06, sx * 1.24), xm = sx * 1.15;
    R_.push(G.box([xa, 2.66, 3.1], [xb, 2.76, 3.95]));                                           // top tank
    R_.push(G.box([xa, 1.64, 3.1], [xb, 1.74, 3.95], { bottom: true }));                         // bottom tank
    for (const z of [3.1, 3.95]) R_.push(G.box([xa, 1.74, z - .025], [xb, 2.66, z + .025]));
    for (let z = 3.15; z < 3.93; z += .045) R_.push(G.line([[xm, 1.75, z], [xm, 2.65, z]]));      // core tubes
    R_.push(G.lathe([sx * 1.25, FAN_C[1], FAN_C[2]], [sx, 0, 0], [[0, .44], [.14, .44], [.16, .47]], { n: 32 }));   // fan shroud
    return R_;
  }
  function gearbox() {
    const B = [];
    B.push(G.lathe([0, 1.01, 2.88], [0, 0, 1], [[0, .12], [.04, .19], [.26, .19], [.3, .17]], { n: 22, caps: true }));   // torque converter
    B.push(G.box([-.36, .82, 3.18], [.36, 1.2, 3.8], { bottom: true }));
    for (const z of [3.34, 3.52, 3.68]) B.push(G.box([-.375, .81, z], [.375, 1.21, z + .03]));
    B.push(G.box([-.18, .95, 2.64], [.18, 1.22, 2.88], { bottom: true }));                       // drop gear from the flywheel
    B.push(G.lathe([.28, .87, 2.9], [0, 0, -1], [[0, .08], [.05, .08]], { n: 12, caps: true }));
    B.push(G.box([-.28, 1.2, 3.3], [-.08, 1.26, 3.65]));                                          // valve body
    return B;
  }
  function transfer() {
    const B = [];
    B.push(G.box([-.34, .56, .14], [.34, 1.0, .96], { bottom: true }));
    for (const z of [.34, .56, .76]) B.push(G.box([-.355, .55, z], [.355, 1.01, z + .03]));
    for (const [x, y, z, d] of [[0, .74, .96, 1], [0, .74, .14, -1], [.28, .87, .96, 1]]) B.push(G.lathe([x, y, z], [0, 0, d], [[0, .085], [.06, .085]], { n: 12, caps: true }));
    B.push(G.lathe([-.2, .88, .96], [0, 0, 1], [[0, .1], [.26, .1], [.3, .06]], { n: 16, caps: true }));      // PTO hydraulic pump
    B.push(G.line([[-.2, .98, 1.22], [-.2, 1.08, 1.55], [-.16, 1.22, 1.95], [-.1, 1.32, 2.22]]));             // pressure line to the erector ram
    B.push(G.line([[-.25, .96, 1.2], [-.3, 1.1, 1.6], [-.3, 1.2, 1.95], [-.24, 1.3, 2.25]]));
    return B;
  }
  const SHAFTS = [[[.28, .87, 2.9], [.28, .87, .96]], [[0, .74, .96], [0, .74, 1.97]], [[0, .74, 2.53], [0, .74, 4.17]], [[0, .74, .14], [0, .74, -2.47]], [[0, .74, -3.03], [0, .74, -4.67]]];
  function shafts() {
    return SHAFTS.map(([a, b]) => { const L = V.dist(a, b); return G.lathe(a, V.sub(b, a), [[0, .07], [.05, .07], [.08, .045], [L - .08, .045], [L - .05, .07], [L, .07]], { n: 12, caps: true }); });
  }
  function hubs(sx) {
    return AXZ.map(z => G.lathe([sx * .84, .74, z], [sx, 0, 0], [[0, .1], [.1, .16], [.16, .3], [.2, .36], [.56, .36], [.6, .3], [.62, .2], [.72, .2], [.74, .12]], { n: 30, caps: true }));
  }
  /* the erector ram drawn out along its own line by k (1 = stowed length): the stages slide apart */
  const RAM_B = [0, 1.36, 2.45], RAM_A0 = [0, 1.5, -2.5];
  function ramExt(k) {
    const A = V.add(RAM_B, V.mul(V.sub(RAM_A0, RAM_B), k));
    const out = HD.ram(RAM_B, A, [.2, .16, .12], 4.9, { n: 16 });
    out.push(G.lathe(RAM_B, [1, 0, 0], [[-.2, .17], [.2, .17]], { n: 12 }));
    out.push(G.lathe(A, [1, 0, 0], [[-.12, .12], [.12, .12]], { n: 10 }));
    return out;
  }
  function anatomy(telM) {
    const by = n => telM.parts.find(p => p.name === n);
    const S = { frame: [], bay: [], engacc: [], axles: [], tank: [], boxes: [], outrigL: [], outrigR: [], tyresL: [], tyresR: [], jacksL: [], jacksR: [] };
    for (const pr of by('chassis').prims) S[chassisGroup(pr)].push(pr);
    for (const pr of by('wheels').prims) S[bboxOf(pr).c[0] > 0 ? 'tyresR' : 'tyresL'].push(pr);
    for (const pr of by('jacks').prims) S[bboxOf(pr).c[0] > 0 ? 'jacksR' : 'jacksL'].push(pr);
    /* off: exploded offset (m, TEL-local); w0: when in the explode it starts (0..1) */
    const g = (name, cls, prims, off, w0, tag) => ({ name, cls, prims, off, w0, tag: tag || null });
    const groups = [
      g('cab', 'shell', by('cab').prims, [0, 2.0, 1.5], .1, { id: '02', lab: 'Cab · crew 3', anchor: [.9, 3.2, 5.3] }),
      g('bay', 'shell', S.bay, [0, 4.1, .4], .05),
      g('engine', 'hidden', engine(), [0, 2.3, 0], .28, { id: '03', lab: 'YaMZ-846 · V12 diesel', val: '500 hp', anchor: [.62, 2.3, 3.2] }),
      g('engacc', 'part', S.engacc, [0, 2.3, 0], .28),
      g('fanR', 'hidden', radiator(1), [1.0, 2.3, 0], .36, { id: '04', lab: 'Radiator fans ×2', val: 'Ø 0.8 m', anchor: [1.36, 2.62, 3.52] }),
      g('fanL', 'hidden', radiator(-1), [-1.0, 2.3, 0], .36),
      g('frame', 'shell', S.frame, [0, 1.35, 0], .2, { id: '13', lab: 'MZKT-7930 · 8×8 frame', anchor: [.8, 1.45, -5.6] }),
      g('tank', 'shell', S.tank, [-.55, 1.35, 0], .24),
      g('boxes', 'shell', S.boxes, [.55, 1.35, 0], .24),
      g('outrigR', 'shell', S.outrigR, [.6, 1.35, 0], .3),
      g('outrigL', 'shell', S.outrigL, [-.6, 1.35, 0], .3),
      g('jacksR', 'part', S.jacksR, [.6, 1.35, 0], .3, { id: '12', lab: 'Outrigger jacks ×4', anchor: [1.7, .1, -6.5] }),
      g('jacksL', 'part', S.jacksL, [-.6, 1.35, 0], .3),
      g('gearbox', 'part', gearbox(), [0, .25, 0], .46, { id: '05', lab: 'Transmission · hydromechanical', anchor: [.37, 1.1, 3.5] }),
      g('transfer', 'part', transfer(), [0, .12, 0], .48, { id: '06', lab: 'Transfer case · PTO pump', anchor: [.35, .95, .5] }),
      g('shafts', 'part', shafts(), [0, 0, 0], .5, { id: '07', lab: 'Cardan shafts ×5', anchor: [0, .74, -1.4] }),
      g('axles', 'part', S.axles, [0, 0, 0], .5, { id: '08', lab: 'Axles ×4 · 1–2 steer', anchor: [.9, .74, -2.75] }),
      g('hubR', 'hidden', hubs(1), [.62, 0, 0], .52, { id: '09', lab: 'Wheel hubs ×8 · reduction gear', anchor: [1.58, .74, 2.25] }),
      g('hubL', 'hidden', hubs(-1), [-.62, 0, 0], .52),
      g('tyresR', 'shell', S.tyresR, [1.35, 0, 0], .45, { id: '10', lab: 'Tyres ×8 · 1500×600-635', anchor: [1.28, 1.46, -4.95] }),
      g('tyresL', 'shell', S.tyresL, [-1.35, 0, 0], .45),
    ];
    return { groups, FAN_C, fan: fanLocal(), SHAFTS, ramExt, RAM_B };
  }

  window.ANAT = { MOD, splitLauncher, tzm, TZM, craneSolve, boomTip, slewXf, boomXf, BOOSTER_Z, anatomy };
})();
