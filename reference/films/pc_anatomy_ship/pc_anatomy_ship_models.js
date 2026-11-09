/* ANATOMY · SHIP (Point Cloud C, sister of pc_anatomy): the destroyer as a museum cutaway.
   HD.destroyer supplies everything above the waterline. This file adds what the cutaway opens:
   the underwater body (keel, sonar dome, skeg, bilge keels), both main engine rooms (four LM2500
   gas turbines with their intake trunks and uptakes, two locked-train reduction gears), the two
   shafts with struts, the 5-blade CRP propellers and the rudders, the Mk 41 modules below deck
   as blocks of cells, the launch-cell canister (a closed box), the MH-60R with its blades folded,
   and the pier's portal crane. Public-reference level, real dimensions.
   Ship frame is HD's: origin midships on the waterline, +Z bow, +X starboard, +Y up. */
(function () {
  const { V, R, X, E } = M3;
  const G = GEO, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const A = HD.destroyer.A, hD = A.deckY;
  const ZB = 77.6, ZS = -77.6, ZST = 70.6;
  // the HD hull's waterline half-breadth, so the underwater body meets it exactly
  const hW = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
  const O = (...a) => Object.assign({}, ...a);
  const F = o => O({ fine: true }, o);
  function tp(T, pr) {
    const q = Object.assign({}, pr);
    if (pr.p) q.p = pr.p.map(p => X.ap(T, p));
    if (pr.t === 'lathe') { q.a = X.ap(T, pr.a); q.d = X.dir(T, pr.d); }
    if (pr.t === 'blades') { q.c = X.ap(T, pr.c); q.d = X.dir(T, pr.d); }
    return q;
  }
  const tps = (T, L) => L.map(p => tp(T, p));
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  /* prims -> stride-6 points (xyz, normal) */
  const sampleP = (prims, s, seed, opt) => G.sample({ parts: [{ name: 'g', prims }] }, s, seed, {}, opt)[0].pts;
  /* thin rectangular duct between two centre points: 4 walls, open ends; w across x, d across z */
  function duct(a, b, w, d, o) {
    const q = (p, sx, sz) => [p[0] + sx * w / 2, p[1], p[2] + sz * d / 2];
    const P = [];
    for (const [s0, s1] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) P.push(G.panel([q(a, ...s0), q(a, ...s1), q(b, ...s1), q(b, ...s0)], o));
    return P;
  }

  /* ================= underwater body ================= */
  const keelY = z => z > 52 ? -6.3 * Math.sqrt(Math.max(0, 1 - Math.pow((z - 52) / (ZST - 52), 2))) : z < -28 ? -6.3 + 5.1 * E.ss(-28, -60, z) : -6.3;
  const secE = z => z > 16 ? E.mix(4.2, 2.1, E.ss(16, 64, z)) : z < -20 ? E.mix(4.2, 6.5, E.ss(-20, -64, z)) : 4.2;
  /* section quadrant, th 0 (keel) .. pi/2 (waterline) -> [x, y] */
  function secPt(z, th) {
    const b = hW(z), k = keelY(z), e = secE(z), s = Math.max(0, Math.sin(th)), c = Math.max(0, Math.cos(th));
    return [b * Math.pow(s, 2 / e), k * Math.pow(c, 2 / e)];
  }
  function secNormal(z, th, side) {
    const e1 = .004, p0 = secPt(z, th - e1), p1 = secPt(z, th + e1), q0 = secPt(z - .3, th), q1 = secPt(z + .3, th);
    const dth = [side * (p1[0] - p0[0]), p1[1] - p0[1], 0], dz = [side * (q1[0] - q0[0]), q1[1] - q0[1], .6];
    let n = V.norm(V.cross(dz, dth));
    const p = secPt(z, th);
    if (n[1] * p[1] + n[0] * side * p[0] < 0) n = V.mul(n, -1);
    return n;
  }
  /* -> Float32Array stride 6, ship frame; z0..z1 limits (for splitting into assemblies) */
  function underwater(s, seed) {
    const r = M3.rng(seed), out = [], push = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    const NS = 48;
    for (let z = ZS + s * .5; z < ZST; z += s) {
      const zz = z + (r() - .5) * s * .5;
      if (hW(zz) < .05) continue;
      // arc length along the quadrant
      const P = [], Lc = [0];
      for (let i = 0; i <= NS; i++) { P.push(secPt(zz, i / NS * PI / 2)); if (i) Lc.push(Lc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); }
      const L = Lc[NS], n = Math.max(2, Math.round(L / s));
      for (let k = 0; k < n; k++) {
        const t = (k + .5 + (r() - .5) * .6) / n * L;
        let i = 1; while (i < NS && Lc[i] < t) i++;
        const f = (t - Lc[i - 1]) / Math.max(1e-6, Lc[i] - Lc[i - 1]), th = (i - 1 + f) / NS * PI / 2;
        const p = secPt(zz, th);
        if (p[1] > -.02) continue;
        for (const side of [-1, 1]) push([side * p[0], p[1], zz], secNormal(zz, th, side));
      }
    }
    // transom below the waterline
    { const k = keelY(ZS), e = secE(ZS), b = hW(ZS);
      for (let y = k + s * .5; y < 0; y += s) { const xs = b * Math.pow(Math.max(0, 1 - Math.pow(y / k, e)), 1 / e); for (let x = -xs + s * .5; x < xs; x += s) push([x + (r() - .5) * s * .4, y, ZS], [0, 0, -1]); } }
    // AN/SQS-53C dome: the bulb under the forefoot, only where it stands proud of the hull
    { const c = [0, -6.75, 59.5], rx = 2.1, rz = 9.4;
      for (let a = 0; a < PI; a += s / rz) {
        const zz = c[2] - Math.cos(a) * rz, rr = Math.sin(a) * rx, nt = Math.max(6, Math.round(TAU * rr / s));
        for (let t = 0; t < nt; t++) {
          const th = (t + .5 + (r() - .5) * .5) / nt * TAU, p = [Math.cos(th) * rr, c[1] + Math.sin(th) * rr, zz];
          if (p[1] > keelY(zz) + .15) continue;
          push(p, V.norm([Math.cos(th) * Math.sin(a) / rx, Math.sin(th) * Math.sin(a) / rx, -Math.cos(a) / rz]));
        }
      } }
    // centreline skeg between the shafts
    for (let z = -58; z < -18; z += s) {
      const top = keelY(z), bot = z > -30 ? -6.3 : E.mix(-6.3, -3.1, (-30 - z) / 28);
      if (top - bot < .05) continue;
      for (let y = bot; y < top; y += s) for (const sx of [-1, 1]) push([sx * .2, y, z + (r() - .5) * s * .4], [sx, 0, 0]);
      push([0, bot, z], [0, -1, 0]);
    }
    // bilge keels
    for (let z = -24; z < 26; z += s) {
      const th = .62, p = secPt(z, th);
      for (const side of [-1, 1]) {
        const n = secNormal(z, th, side);
        for (let d = 0; d < .65; d += s) push([side * p[0] + n[0] * d, p[1] + n[1] * d, z], [0, 0, 0]);
      }
    }
    return new Float32Array(out);
  }
  /* the hull's cut section outline (drawn on the faces the exploded view opens) */
  function sectionRing(z, s) {
    const out = [], NS = 64;
    const push = (x, y) => out.push(x, y, z, 0, 0, 0);
    for (let i = 0; i <= NS; i++) { const p = secPt(z, i / NS * PI / 2); for (const sd of [-1, 1]) push(sd * p[0], p[1]); }
    const d = hD(z);
    for (let y = 0; y < d; y += s) for (const sd of [-1, 1]) push(sd * hW(z) * (1 + .11 * y / d), y);
    for (let x = -hW(z) * 1.1; x < hW(z) * 1.1; x += s) push(x, d);
    return new Float32Array(out);
  }

  /* ================= machinery ================= */
  /* GE LM2500 in its own frame: origin at the compressor face centre, +Z aft along the engine
     (inlet at the front, power turbine and exhaust collector at the back, hot-end drive) */
  const GT = { AXIS_Y: -2.4, LEN: 7.2, COUPLE: 8.6 };
  function lm2500() {
    const S = [], ROT = [], PT = [];
    // inlet plenum (air box) around the bellmouth, open on top where the trunk comes in
    for (const q of [[[-1.35, -1.2, -2.1], [1.35, -1.2, -2.1], [1.35, 1.45, -2.1], [-1.35, 1.45, -2.1]], [[-1.35, -1.2, -2.1], [-1.35, -1.2, -.78], [-1.35, 1.45, -.78], [-1.35, 1.45, -2.1]], [[1.35, -1.2, -2.1], [1.35, -1.2, -.78], [1.35, 1.45, -.78], [1.35, 1.45, -2.1]], [[-1.35, -1.2, -2.1], [1.35, -1.2, -2.1], [1.35, -1.2, -.78], [-1.35, -1.2, -.78]]]) S.push(G.panel(q, { ds: 1.7 }));
    S.push(G.lathe([0, 0, -.8], [0, 0, 1], [[0, 1.3], [0, 1.0]], { n: 40, ds: 1.4 }));
    S.push(G.panel([[-1.35, 1.45, -2.1], [-.9, 1.45, -2.1], [-.9, 1.45, -.78], [-1.35, 1.45, -.78]], { ds: 1.6 }));
    S.push(G.panel([[.9, 1.45, -2.1], [1.35, 1.45, -2.1], [1.35, 1.45, -.78], [.9, 1.45, -.78]], { ds: 1.6 }));
    // bellmouth and nose bullet
    S.push(G.lathe([0, 0, -.95], [0, 0, 1], [[0, 1.02], [.08, .93], [.3, .76], [.62, .67], [.95, .64]], { n: 40 }));
    S.push(G.lathe([0, 0, -.5], [0, 0, 1], [[0, 0], [.1, .12], [.28, .21], [.5, .25]], { n: 24 }));
    // front frame struts
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + .26, c = Math.cos(a), s = Math.sin(a); S.push(G.hex([[c * .25 - s * .03, s * .25 + c * .03, -.06], [c * .25 + s * .03, s * .25 - c * .03, -.06], [c * .25 + s * .03, s * .25 - c * .03, .06], [c * .25 - s * .03, s * .25 + c * .03, .06], [c * .64 - s * .03, s * .64 + c * .03, -.06], [c * .64 + s * .03, s * .64 - c * .03, -.06], [c * .64 + s * .03, s * .64 - c * .03, .06], [c * .64 - s * .03, s * .64 + c * .03, .06]])); }
    // inlet guide vanes (fixed)
    S.push(G.blades([0, 0, .13], [0, 0, 1], 28, .26, .63, { chord: .07, taper: 1.2, pitch: .18, ds: 2.2 }));
    // compressor casing: VSV actuation rings, the actuator, the rear frame and combustor
    S.push(G.lathe([0, 0, 0], [0, 0, 1], [[0, .67], [.25, .67], [.9, .61], [1.8, .53], [2.7, .48], [2.9, .6], [3.6, .63], [3.85, .56], [4.45, .57], [4.65, .63], [5.6, .76], [5.8, .77]], { n: 40 }));
    for (const [s, r] of [[.45, .67], [.7, .65], [.95, .62], [1.2, .6], [1.45, .57]]) S.push(G.lathe([0, 0, s], [0, 0, 1], [[0, r + .045], [.05, r + .045]], F({ n: 36 })));
    S.push(G.cyl([.72, .1, .4], [.62, .1, 1.5], .05, F({ n: 8 })));
    S.push(G.lathe([0, 0, 3.08], [0, 0, 1], [[0, .7], [.08, .7]], F({ n: 36 })));
    for (let k = 0; k < 15; k++) { const a = k / 15 * TAU, c = Math.cos(a), s = Math.sin(a); S.push(G.cyl([c * .64, s * .64, 3.12], [c * .76, s * .76, 3.0], .025, F({ n: 5 }))); }
    // exhaust collector: turns the gas up into the uptake
    S.push(G.box([-1.15, -1.1, 5.8], [1.15, 1.25, 7.2], { bottom: true, ds: 1.2 }));
    S.push(G.lathe([0, 1.25, 6.5], [0, 1, 0], [[0, .78], [.25, .74]], { n: 28 }));
    // skid, mounts, accessory gearbox, starter
    S.push(G.box([-.95, -1.22, -1.0], [.95, -1.02, 7.3], { bottom: true }));
    for (const s of [1.0, 4.1, 6.4]) for (const sx of [-1, 1]) S.push(G.box([sx * .62 - .08, -1.02, s - .1], [sx * .62 + .08, -.45, s + .1], F()));
    S.push(G.box([-.36, -.8, .6], [.36, -.46, 2.1], F({ bottom: true })));
    S.push(G.cyl([-.18, -.62, .6], [-.18, -.62, .25], .12, F({ n: 12 })));
    for (let k = 0; k < 3; k++) S.push(G.line([[.34, -.5 - k * .08, .8 + k * .3], [.62, -.1, 1.2 + k * .35], [.64, .2, 2.0 + k * .4]], F({ w: .5 })));
    // compressor rotor (16 stages; the first is the face the intake looks at) and HP turbine
    ROT.push(G.lathe([0, 0, .2], [0, 0, 1], [[0, .26], [.5, .27], [1.4, .33], [2.5, .39], [4.4, .39]], { n: 24, ds: 1.4 }));
    ROT.push(G.blades([0, 0, .33], [0, 0, 1], 30, .27, .62, { chord: .12, taper: .75, pitch: .5 }));
    for (let i = 1; i < 9; i++) { const s = .33 + i * .28, h = .27 + i * .014, t = .62 - i * .018; ROT.push(G.blades([0, 0, s], [0, 0, 1], 30 + i * 2, h, t, { chord: .1, taper: .8, pitch: .45, rot: i * .31, ds: 2.6 })); }
    for (const s of [3.95, 4.2]) ROT.push(G.blades([0, 0, s], [0, 0, 1], 44, .4, .55, { chord: .09, taper: .9, pitch: -.5, ds: 1.3 }));
    // six-stage power turbine on its own shaft, and the high-speed coupling shaft to the gear
    for (let i = 0; i < 6; i++) PT.push(G.blades([0, 0, 4.72 + i * .17], [0, 0, 1], 52, .44, .6 + i * .026, { chord: .08, taper: .9, pitch: -.45, rot: i * .2, ds: 1.4 }));
    PT.push(G.lathe([0, 0, 4.6], [0, 0, 1], [[0, .42], [1.2, .44]], { n: 24, ds: 1.4 }));
    PT.push(G.lathe([0, 0, 5.8], [0, 0, 1], [[0, .11], [2.4, .11], [2.45, .3], [2.55, .3], [2.6, .11], [GT.COUPLE - 5.8, .11]], { n: 14 }));
    return { stat: S, rot: ROT, pt: PT };
  }
  /* the four gas turbines: [name, x, inlet z, which gear] in the ship frame (inlet forward) */
  const GTS = [
    { id: '1A', x: -.8, z: 6.2, mer: 1 }, { id: '1B', x: 3.0, z: 6.2, mer: 1 },
    { id: '2A', x: -4.0, z: -13.0, mer: 2 }, { id: '2B', x: -.2, z: -13.0, mer: 2 },
  ];
  // GT-local -> ship: +Z local points aft
  const gtXf = g => X.make(R.y(PI), [g.x, GT.AXIS_Y, g.z]);
  /* locked-train double-reduction main reduction gear; xc its centre, zf its front face;
     the bull gear drives the shaft line from its centre */
  const MRGS = [{ id: 1, x: 1.1, zf: -2.4 }, { id: 2, x: -2.1, zf: -21.6 }];
  const MRG_L = 3.6, BULL_R = 1.78, SHAFT_Y0 = -3.6;
  function mrg(m) {
    const P = [], G_ = [], x = m.x, z0 = m.zf - MRG_L, z1 = m.zf, zc = (z0 + z1) / 2, yb = SHAFT_Y0;
    // gear case: lower box, hipped cover, flanges, sump; sparse so the gears read through it
    P.push(G.box([x - 2.6, -5.7, z0], [x + 2.6, -3.6, z1], { bottom: true, skip: [1], ds: 1.5 }));
    P.push(G.box([x - 2.75, -3.7, z0 - .05], [x + 2.75, -3.5, z1 + .05]));
    for (const sx of [-1, 1]) P.push(G.box([x + sx * 2.6 - (sx > 0 ? 0 : .5), -5.3, zc - .9], [x + sx * 2.6 + (sx > 0 ? .5 : 0), -4.2, zc + .9], F()));
    // bull gear (double helical: two rims), web and hub on the shaft line
    for (const dz of [-.62, .12]) G_.push(G.lathe([x, yb, zc + dz], [0, 0, 1], [[0, BULL_R - .12], [0, BULL_R], [.5, BULL_R], [.5, BULL_R - .12]], { n: 64 }));
    G_.push(G.lathe([x, yb, zc - .08], [0, 0, 1], [[0, .5], [0, BULL_R - .12], [.16, BULL_R - .12], [.16, .5]], { n: 48, ds: 1.4 }));
    G_.push(G.lathe([x, yb, z0 - .1], [0, 0, 1], [[0, .45], [MRG_L + .2, .45]], { n: 20 }));
    // second-reduction pinions on the bull gear, first-reduction gears and HP pinions from each turbine
    for (const sx of [-1, 1]) {
      const px = x + sx * (BULL_R + .38) * Math.sin(38 * DEG), py = yb + (BULL_R + .38) * Math.cos(38 * DEG);
      G_.push(G.lathe([px, py, zc - .7], [0, 0, 1], [[0, .38], [1.3, .38]], { n: 28 }));
      G_.push(G.lathe([px, py, z1 - .7], [0, 0, 1], [[0, .95], [.5, .95]], { n: 44 }));
      G_.push(G.lathe([x + sx * 1.9, GT.AXIS_Y, z1 - .9], [0, 0, 1], [[0, .26], [.9, .26]], { n: 18 }));
      G_.push(G.cyl([x + sx * 1.9, GT.AXIS_Y, z1 - .9], [x + sx * 1.9, GT.AXIS_Y, z1 + .05], .12, { n: 10 }));
    }
    // main thrust bearing just aft of the gear
    P.push(G.lathe([x, yb, z0 - 1.6], [0, 0, 1], [[0, .45], [.1, .72], [1.1, .72], [1.2, .45]], { n: 32, caps: true }));
    P.push(G.box([x - .8, -5.4, z0 - 1.5], [x + .8, yb - .5, z0 - .3], F()));
    return P.concat(G_);
  }
  /* shafts: thrust bearing -> stern tube -> struts -> propeller hub */
  const PROP = { R: 2.59, hubR: .84, z: -62.5, y: -4.6, x: 4.0, P: 6.4 };
  const SHAFTS = [
    { id: 'stbd', side: 1, a: [MRGS[0].x, SHAFT_Y0, MRGS[0].zf - MRG_L - 1.7], b: [PROP.x, PROP.y, PROP.z + .9] },
    { id: 'port', side: -1, a: [MRGS[1].x, SHAFT_Y0, MRGS[1].zf - MRG_L - 1.7], b: [-PROP.x, PROP.y, PROP.z + .9] },
  ];
  const shaftAt = (sh, z) => V.lerp(sh.a, sh.b, (z - sh.a[2]) / (sh.b[2] - sh.a[2]));
  const STERN_TUBE_Z = -41.5;
  function shafts() {
    const P = [];
    for (const sh of SHAFTS) {
      const d = V.sub(sh.b, sh.a), L = V.len(d);
      P.push(G.lathe(sh.a, d, [[0, .27], [L, .27]], { n: 20 }));
      // couplings every ~9 m, line-shaft bearings between them
      for (let s = 4; s < L - 22; s += 9.2) P.push(G.lathe(V.mad(sh.a, V.norm(d), s), d, [[0, .5], [.22, .5]], { n: 24, caps: true }));
      for (let s = 8.6; s < L - 24; s += 9.2) { const c = V.mad(sh.a, V.norm(d), s); P.push(G.box([c[0] - .55, c[1] - .5, c[2] - .5], [c[0] + .55, c[1] + .38, c[2] + .5])); P.push(G.box([c[0] - .7, -5.4, c[2] - .55], [c[0] + .7, c[1] - .5, c[2] + .55], F())); }
      // stern tube where the shaft leaves the hull, rope guard at the hub
      const st = shaftAt(sh, STERN_TUBE_Z);
      P.push(G.lathe(V.add(st, [0, 0, 1.8]), [0, 0, -1], [[0, .58], [3.2, .52], [3.8, .36]], { n: 24 }));
      P.push(G.lathe(V.add(sh.b, [0, 0, .5]), [0, 0, -1], [[0, .34], [.5, .52]], { n: 20 }));
      // intermediate strut (single leg) and the V-strut ahead of the propeller
      const s1 = shaftAt(sh, -50.5), s2 = shaftAt(sh, -59.6);
      P.push(G.lathe(V.add(s1, [0, 0, .6]), [0, 0, -1], [[0, .44], [1.2, .44]], { n: 20 }));
      P.push(strutLeg(s1, [sh.side * 2.9, -.8, -50.5]));
      P.push(G.lathe(V.add(s2, [0, 0, .7]), [0, 0, -1], [[0, .46], [1.4, .46]], { n: 20 }));
      P.push(strutLeg(s2, [sh.side * 1.8, -1.05, -59.4]), strutLeg(s2, [sh.side * 6.3, -.95, -59.8]));
    }
    return P;
  }
  function strutLeg(a, b) {
    const d = V.norm(V.sub(b, a)), side = V.norm(V.cross(d, [0, 0, 1])), t = .14, c = .55;
    const q = (p, u, v) => V.add(p, V.add(V.mul(side, u), [0, 0, v]));
    return G.hex([q(a, -t, -c), q(a, t, -c), q(a, t, c), q(a, -t, c), q(b, -t, -c), q(b, t, -c), q(b, t, c), q(b, -t, c)], { skip: [0, 1] });
  }
  /* controllable-reversible-pitch propeller, 5 skewed blades, in prop-local (hub centre origin,
     +Z = ship forward). Starboard hand; the port one is its mirror image. Points directly. */
  function propeller(s, seed, mirror) {
    const r = M3.rng(seed), out = [], R_ = PROP.R, k = PROP.P / TAU, mx = mirror ? -1 : 1;
    const push = (p, n) => out.push(mx * p[0], p[1], p[2], mx * n[0], n[1], n[2]);
    const chord = rho => rho > .68 ? 1.95 * Math.sqrt(Math.max(0, 1 - Math.pow((rho - .68) / .325, 2))) : 1.95 - 1.05 * Math.pow((.68 - rho) / .35, 2);
    const skew = rho => .42 * Math.pow((rho - .32) / .68, 2);
    const thick = (rho, u) => (.1 * (1 - rho) + .014) * Math.sqrt(Math.max(0, 1 - u * u));
    const surf = (rr, u) => { const rho = rr / R_, sk = skew(rho), th = sk + u * chord(rho) / 2 / rr; return [rr * Math.cos(th), rr * Math.sin(th), -k * (th - sk)]; };
    for (let b = 0; b < 5; b++) {
      const b0 = b / 5 * TAU, cb = Math.cos(b0), sb = Math.sin(b0);
      for (let rr = R_ * .33; rr < R_; rr += s) {
        const rp = rr + (r() - .5) * s * .4, rho = rp / R_, c = chord(rho); if (c < .04) continue;
        const n = Math.max(2, Math.round(c / s));
        for (let i = 0; i < n; i++) {
          const u = -1 + 2 * (i + .5 + (r() - .5) * .5) / n, e = .004;
          const p0 = surf(rp, u), du = V.sub(surf(rp, u + e), surf(rp, u - e)), dr = V.sub(surf(Math.min(R_ * .999, rp + e * 5), u), surf(rp - e * 5, u));
          const nn = V.norm(V.cross(dr, du)), t = thick(rho, u);
          const rot = q => [q[0] * cb - q[1] * sb, q[0] * sb + q[1] * cb, q[2]];
          const pp = rot(p0), nr = rot(nn);
          push(V.mad(pp, nr, t / 2), nr); push(V.mad(pp, nr, -t / 2), V.mul(nr, -1));
        }
      }
    }
    // hub with its fairing cap (aft)
    const hub = [[.9, .55], [.7, .8], [0, PROP.hubR], [-.9, .8], [-1.4, .55], [-1.75, .2], [-1.8, 0]];
    for (let i = 0; i < hub.length - 1; i++) {
      const [z0, r0] = hub[i], [z1, r1] = hub[i + 1], L = Math.hypot(z1 - z0, r1 - r0), na = Math.max(1, Math.round(L / s));
      for (let a = 0; a < na; a++) { const u = (a + .5) / na, zz = z0 + (z1 - z0) * u, rr = r0 + (r1 - r0) * u, nt = Math.max(8, Math.round(TAU * rr / s));
        for (let t = 0; t < nt; t++) { const th = (t + .5 + (r() - .5) * .5) / nt * TAU; push([rr * Math.cos(th), rr * Math.sin(th), zz], V.norm([Math.cos(th) * (z0 - z1), Math.sin(th) * (z0 - z1), r1 - r0])); } }
    }
    return new Float32Array(out);
  }
  /* spade rudder in rudder-local: stock axis at the origin (top), span down -Y, leading edge +Z */
  const RUDDER = { z: -70.2, x: 4.0, top: -1.15, span: 5.2, cf: 1.15, ca: 2.3 };
  function rudder(s, seed) {
    const r = M3.rng(seed), out = [], push = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    const C = RUDDER.cf + RUDDER.ca, tmax = .5;
    const half = u => tmax / 2 * 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u * u * u - .1015 * u * u * u * u) / .6;
    for (let y = -s * .5; y > -RUDDER.span; y -= s) {
      const taper = 1 - .18 * (-y / RUDDER.span), cc = C * taper, n = Math.max(3, Math.round(cc / s));
      for (let i = 0; i < n; i++) {
        const u = (i + .5 + (r() - .5) * .5) / n, z = RUDDER.cf * taper - u * cc, h = half(u) * taper, dh = (half(Math.min(1, u + .01)) - half(Math.max(0, u - .01))) / .02 * taper / cc;
        for (const sx of [-1, 1]) push([sx * h, y, z], V.norm([sx, 0, sx * dh]));
      }
    }
    for (const y of [0, -RUDDER.span]) { const taper = 1 - .18 * (-y / RUDDER.span), cc = C * taper; for (let z = RUDDER.cf * taper; z > RUDDER.cf * taper - cc; z -= s) { const u = (RUDDER.cf * taper - z) / cc, h = half(u) * taper; for (let x = -h; x <= h; x += s) push([x, y, z], [0, y ? -1 : 1, 0]); } }
    // stock up into the hull
    for (let y = 0; y < 1.1; y += s) for (let t = 0; t < 10; t++) { const th = t / 10 * TAU; push([Math.cos(th) * .2, y, Math.sin(th) * .2], [Math.cos(th), 0, Math.sin(th)]); }
    return new Float32Array(out);
  }
  /* air intake trunks (stack louvres -> the turbine's inlet plenum) and exhaust uptakes
     (collector -> the uptake mouth on the stack) */
  const STACK_Z = [2.2, -17.0];
  function trunks() {
    const P = [];
    for (const g of GTS) {
      const zc = STACK_Z[g.mer - 1], sx = g.x > (g.mer === 1 ? 1.1 : -1.3) ? 1 : -1;
      // intake: behind the side louvres, slanting down and forward to the plenum top
      const top = [sx * 1.55, 18.6, zc + .9], bot = [g.x, GT.AXIS_Y + 1.45, g.z + 1.44];
      P.push(...duct(top, [bot[0], 10.4, bot[2] - .2], 1.7, 1.9, { ds: 2.2 }));
      P.push(...duct([bot[0], 10.4, bot[2] - .2], bot, 1.7, 1.9, { ds: 2.2 }));
      P.push(G.box([sx * 2.55 - (sx > 0 ? .5 : 0), 15.9, zc - 3.0], [sx * 2.55 + (sx > 0 ? 0 : .5), 20.4, zc + 1.8], { ds: 1.8, skip: [1] }));
      // exhaust: collector top -> uptake mouth (HD stack lathe)
      const cz = g.z - 6.5, a = [g.x, GT.AXIS_Y + 1.5, cz], b = [sx * .95, 21.9, zc - 2.9];
      P.push(G.lathe(a, V.sub([a[0], 9.5, a[2]], a), [[0, .74], [9.5 - a[1], .74]], { n: 28, ds: 2.2 }));
      P.push(G.lathe([a[0], 9.5, a[2]], V.sub(b, [a[0], 9.5, a[2]]), [[0, .74], [V.dist(b, [a[0], 9.5, a[2]]), .62]], { n: 28, ds: 2.2 }));
    }
    return P;
  }
  /* inner bottom and the engine-room bulkheads, faint: the rooms the machinery stands in */
  function rooms(s) {
    const out = [], push = (x, y, z) => out.push(x, y, z, 0, 0, 0), r = M3.rng(88);
    for (let z = -28; z < 10.6; z += s * 1.6) for (let x = -6.8; x < 6.8; x += s * 1.6) push(x + (r() - .5) * s, -5.3, z + (r() - .5) * s);
    for (const zb of [10.6, -9.6, -28.2]) {
      const NS = 40; for (let i = 0; i <= NS; i++) { const p = secPt(zb, i / NS * PI / 2); for (const sd of [-1, 1]) push(sd * p[0] * .97, p[1] * .97, zb); }
      for (let y = 0; y < hD(zb); y += s) for (const sd of [-1, 1]) push(sd * hW(zb) * .97, y, zb);
    }
    return new Float32Array(out);
  }

  /* ================= Mk 41 below deck ================= */
  const VF_Z = 38.9, VA_Z = -29.4, VDEPTH = 7.7;
  /* module frames: [x centre, z centre] */
  const vlsModules = fwd => { const out = [], rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z, mods = rows / 4; for (let m = 0; m < 4; m++) for (let r = 0; r < mods; r++) out.push([(-3 + 2 * m) * 1.05, zc + (mods === 1 ? 0 : (r ? -1.7 : 1.7))]); return out; };
  /* the modules as blocks of cells: walls, the central uptake, cell dividers, a bottom plate */
  function vlsBlock(fwd) {
    const P = [], y0 = hD(fwd ? VF_Z : VA_Z) + .06 - .3, y1 = y0 - VDEPTH + .3;
    for (const [xm, zm] of vlsModules(fwd)) {
      P.push(G.box([xm - 1.02, y1, zm - 1.68], [xm + 1.02, y0, zm + 1.68], { bottom: true, skip: [1] }));
      for (const sx of [-1, 1]) P.push(G.panel([[xm + sx * .19, y1, zm - 1.68], [xm + sx * .19, y1, zm + 1.68], [xm + sx * .19, y0, zm + 1.68], [xm + sx * .19, y0, zm - 1.68]], { ds: 1.6 }));
      for (const dz of [-.85, 0, .85]) for (const sx of [-1, 1]) P.push(G.panel([[xm + sx * .19, y1, zm + dz], [xm + sx * 1.02, y1, zm + dz], [xm + sx * 1.02, y0, zm + dz], [xm + sx * .19, y0, zm + dz]], { ds: 2.2 }));
      // plenum at the bottom, the exhaust uptake hatch strip on top
      P.push(G.box([xm - 1.02, y1 - .55, zm - 1.68], [xm + 1.02, y1, zm + 1.68], F({ bottom: true, skip: [1], ds: 1.4 })));
    }
    return P;
  }
  /* launch-cell canister, closed: canister-local, top centre at the origin, axis down -Y */
  const CAN = { L: 6.7, W: .58, SEAT: .35 };
  function canister() {
    const P = [], w = CAN.W / 2;
    P.push(G.box([-w, -CAN.L, -w], [w, 0, w], { bottom: true }));
    for (const y of [-.25, -1.9, -3.5, -5.1, -6.45]) P.push(G.box([-w - .025, y - .07, -w - .025], [w + .025, y + .07, w + .025], F({ skip: [0, 1] })));
    P.push(G.box([-w + .06, -.02, -w + .06], [w - .06, .03, w - .06], F({ skip: [0] })));
    for (const sx of [-1, 1]) P.push(G.box([sx * .2 - .03, 0, -.06], [sx * .2 + .03, .12, .06], F()));
    return P;
  }

  /* ================= MH-60R, blades folded aft ================= */
  function heloFolded() {
    const m = HD.helo(), parts = [];
    for (const p of m.parts) {
      if (p.name === 'tailrotor') { parts.push({ name: p.name, prims: tps(p.xf({ trotor: .3 }), p.prims) }); continue; }
      if (p.name !== 'rotor') { parts.push({ name: p.name, prims: p.prims }); continue; }
      const P = p.dyn({ droop: .3 }), out = [], HC = HD.helo.HUB;
      for (let k = 0; k < 4; k++) {
        const a = PI / 4 + k * PI / 2, u = [Math.sin(a), 0, Math.cos(a)];
        const tgt = PI + [-.11, -.04, .04, .11][k];
        let d = tgt - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU;
        const hinge = [HC[0] + u[0] * .95, HC[1], HC[2] + u[2] * .95], Tf = piv(R.y(d), hinge), Tl = X.mul(X.make(R.I(), [0, -.06 * k + .1, 0]), Tf);
        const blade = P.slice(k * 13, k * 13 + 13);
        blade.forEach((pr, i) => out.push(i < 8 ? tp(Tl, pr) : pr));
      }
      for (const pr of P.slice(52)) out.push(pr);
      parts.push({ name: 'rotor', prims: out });
    }
    return { parts: parts.map(p => ({ name: p.name, prims: p.prims })) };
  }
  /* on deck in the port hangar, nose forward */
  const HELO_AT = [-3.7, hD(-40.4), -40.4];

  /* ================= portal crane on the pier =================
     crane-local: origin at the slew centre on the pier deck, +Z north along the pier. House-local:
     origin on the slewing ring, +Z the boom's heading. Boom-local: heel pin, +Z along the boom. */
  const CR = { GAUGE: 10.5, RING_Y: 13.2, HEEL: [0, 2.3, 2.5], BOOM: 30, TIPY: .6 };
  function cranePortal() {
    const P = [], g = CR.GAUGE / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P.push(G.hex([[sx * g - .55, 0, sz * 4.8 - .55], [sx * g + .55, 0, sz * 4.8 - .55], [sx * g + .55, 0, sz * 4.8 + .55], [sx * g - .55, 0, sz * 4.8 + .55],
        [sx * (g - 1.4) - .4, 12.2, sz * 3.2 - .4], [sx * (g - 1.4) + .4, 12.2, sz * 3.2 - .4], [sx * (g - 1.4) + .4, 12.2, sz * 3.2 + .4], [sx * (g - 1.4) - .4, 12.2, sz * 3.2 + .4]], { skip: [0, 1] }));
    }
    for (const sx of [-1, 1]) {
      P.push(G.box([sx * g - .6, .4, -6.6], [sx * g + .6, 1.3, 6.6]));                                 // sill beam over the bogies
      for (const z of [-5.6, -4.4, 4.4, 5.6]) P.push(G.cyl([sx * g - .3, .38, z], [sx * g + .3, .38, z], .38, F({ n: 14, caps: true })));
      P.push(G.box([sx * (g - 1.4) - .45, 11.4, -3.7], [sx * (g - 1.4) + .45, 12.6, 3.7]));
      for (const sz of [-1, 1]) P.push(G.cyl([sx * g, 1.4, sz * 4.6], [sx * (g - 1.3), 10.8, -sz * 2.6], .13, F({ n: 6 })));
    }
    for (const sz of [-1, 1]) P.push(G.box([-g + 1.0, 11.4, sz * 3.2 - .45], [g - 1.0, 12.6, sz * 3.2 + .45]));
    P.push(G.lathe([0, 12.6, 0], [0, 1, 0], [[0, 2.7], [.6, 2.6]], { n: 40 }));
    P.push(G.line([[-g + 1.2, 12.7, -3.3], [-g + 1.2, 14.1, -3.3], [-g + 1.2, 14.1, 3.3], [-g + 1.2, 12.7, 3.3]], F({ w: .6 })));
    return P;
  }
  function craneHouse() {
    const P = [];
    P.push(G.box([-3.2, 0, -6.2], [3.2, .6, 3.0], { bottom: true }));
    P.push(G.box([-2.8, .6, -5.9], [2.8, 4.9, .7]));
    for (let z = -5.2; z < 0; z += 1.1) P.push(G.panel([[2.81, 2.8, z], [2.81, 2.8, z + .7], [2.81, 4.2, z + .7], [2.81, 4.2, z]], F({ pts: false })));
    P.push(G.box([-2.5, .2, -8.2], [2.5, 3.6, -6.2]));                                                 // counterweight
    P.push(G.box([1.4, 1.2, 1.0], [2.9, 4.3, 3.3]));                                                  // cab
    P.push(G.panel([[1.45, 2.6, 3.32], [2.85, 2.6, 3.32], [2.85, 4.1, 3.32], [1.45, 4.1, 3.32]], F({ pts: false })));
    for (const sx of [-1, 1]) {
      P.push(G.cyl([sx * 2.0, 4.9, -4.6], [sx * .35, 15.2, -2.2], .22, { n: 10 }));                   // A-frame legs
      P.push(G.cyl([sx * 2.0, 4.9, .4], [sx * .35, 15.2, -2.2], .16, { n: 8 }));
      P.push(G.box([sx * .8 - .25, 1.2, 1.9], [sx * .8 + .25, 2.9, 2.9]));                            // heel brackets
    }
    P.push(G.cyl([-.6, 15.2, -2.2], [.6, 15.2, -2.2], .35, { n: 14, caps: true }));
    return P;
  }
  function craneBoom() {
    const P = [], L = CR.BOOM, sec = z => E.mix(.75, .4, z / L);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.push(G.cyl([sx * sec(0), sy * sec(0), 0], [sx * sec(L), sy * sec(L), L], .1, { n: 8 }));
    for (let z = 0; z < L - .8; z += 1.6) {
      const a = sec(z), b = sec(z + 1.6);
      for (const sx of [-1, 1]) P.push(G.line([[sx * a, -a, z], [sx * b, b, z + 1.6]], { w: .7 }));
      for (const sy of [-1, 1]) P.push(G.line([[-a, sy * a, z], [b, sy * b, z + 1.6]], { w: .7 }));
    }
    P.push(G.cyl([-.55, 0, 0], [.55, 0, 0], .3, { n: 12 }));
    P.push(G.lathe([-.25, CR.TIPY, L], [1, 0, 0], [[0, .5], [.5, .5]], { n: 20, caps: true }));
    return P;
  }
  function craneHook() {
    const P = [];
    P.push(G.box([-.32, -.95, -.22], [.32, 0, .22]));
    for (const sx of [-1, 1]) P.push(G.lathe([sx * .12, -.35, 0], [1, 0, 0], [[0, .3], [.08, .3]], F({ n: 14 })));
    P.push(G.lathe([0, -1.35, 0], [0, 1, 0], [[0, .18], [.4, .1]], { n: 10 }));
    P.push(G.box([-.55, -1.55, -.55], [.55, -1.35, .55], F()));                                       // lifting adapter
    return P;
  }
  const craneHouseXf = slew => X.make(R.y(slew), [0, CR.RING_Y, 0]);
  const craneBoomXf = (slew, luff) => X.mul(craneHouseXf(slew), X.make(R.x(-luff), CR.HEEL));
  const craneTip = (slew, luff) => X.ap(craneBoomXf(slew, luff), [0, CR.TIPY, CR.BOOM]);
  /* hook (crane-local) -> slew, luff with the rope hanging plumb under the boom tip */
  function craneSolve(hook) {
    const slew = Math.atan2(hook[0], hook[2]), rho = Math.hypot(hook[0], hook[2]);
    const Lr = Math.hypot(CR.BOOM, CR.TIPY), luff = Math.acos(E.clamp((rho - CR.HEEL[2]) / Lr, -1, 1)) - Math.atan2(CR.TIPY, CR.BOOM);
    return { slew, luff, tip: craneTip(slew, luff) };
  }

  window.SHIPM = {
    hW, hD, keelY, secPt, underwater, sectionRing,
    GT, GTS, gtXf, lm2500, MRGS, MRG_L, BULL_R, mrg, SHAFTS, shaftAt, STERN_TUBE_Z, shafts, PROP, propeller, RUDDER, rudder, trunks, rooms, STACK_Z,
    VF_Z, VA_Z, VDEPTH, vlsModules, vlsBlock, CAN, canister,
    heloFolded, HELO_AT,
    CR, cranePortal, craneHouse, craneBoom, craneHook, craneHouseXf, craneBoomXf, craneTip, craneSolve,
    sampleP, tp, tps, piv,
  };
})();
