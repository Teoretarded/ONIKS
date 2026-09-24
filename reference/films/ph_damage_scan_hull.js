/* DAMAGE SCAN · what the scan finds inside her: the underwater body (keel, sonar dome, skeg, bilge keels), both
   main engine rooms (four LM2500s, two locked-train reduction gears), the shafts with their struts, the 5-blade CRP
   propellers and the spade rudders. Public-reference level, real dimensions, her frame (HD's: origin midships on
   the waterline, +Z bow, +X starboard, +Y up). Geometry after pc_anatomy_ship_models.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const G = GEO, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  const A = HD.destroyer.A, hD = A.deckY;
  const ZB = 77.6, ZS = -77.6, ZST = 70.6;
  const hW = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
  const O = (...a) => Object.assign({}, ...a);
  const F = o => O({ fine: true }, o);
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

  PH.INT = { hW, keelY, secPt, underwater, sectionRing, GT, lm2500, GTS, gtXf, MRGS, MRG_L, mrg, SHAFTS, shafts, PROP, propeller, RUDDER, rudder };
})();
