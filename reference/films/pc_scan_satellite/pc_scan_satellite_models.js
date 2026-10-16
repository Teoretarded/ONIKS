/* SCAN · SATELLITE models: the carrier's scan satellite and the carrier's island radars, as LOD point clouds in
   their own frames, sampled on regular lattices (no jitter: faces read as structured grids, edges as dense hairlines),
   with every pose a pure function of a state object (no time inside).

   Satellite frame: +Z the muzzle, +Y the top (away from the Earth while dormant), +X starboard.
   Bus (z -7.2..-2.6, 2.6 m square): skin on six faces (X-ray thins it), inside the power conditioning unit, eight
   capacitor modules (six cans each), four reaction wheels, six contactors and the busbars; the rammer stowed on
   the axis behind the front bulkhead.
   Breech (z -2.6..-0.2): the six-round revolver magazine (axis 0.62 m below the bore), its cage, the sliding breech
   block on two guide rails with two locking lugs.
   Barrel: three 6 m segments, two rails and a truss each, four coils each (twelve), the busbar feed underneath.
   Stowed Z-folded over the breech (B reversed on top of A, C on top of B); B swings over on a hinge pin at A's
   muzzle end, C swings down and forward on a pin at B's end, lock collars slide over each joint. Muzzle crown on C.
   Solar wings: a root hinge on each side face (the four-panel pack stowed flat against the side), then the panels
   unfold one by one on pinned hinges (Z-fold), then the drive turns the wing to the sun. Two radiators hinged at the
   top edges, stowed flat on the top face. On the belly the uplink dish on a two-stage telescoping mast (twelve ribs
   opening like an umbrella) and the dormant receiver horn; the magnetometer boom telescopes aft from the top.
   window.SSAT(K) -> { sat: {...}, radar: {...} } */
window.SSAT = function (K) {
'use strict';
const { V, R, X, E } = M3, G = GEO, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;

/* ---------- a regular-lattice sampler ---------- */
const LIN = .3;                                             // edge lines: 1/LIN times denser than faces
const Q = (a, b, c, d, o) => ({ t: 'q', p: [a, b, c, d], two: o && o.two, ds: o && o.ds || 1, n: o && o.n });
const L = (p, o) => ({ t: 'l', p, closed: !!(o && o.closed), ds: o && o.ds || LIN });
const LA = (a, d, st, o) => ({ t: 'la', a, d: V.norm(d), st, caps: !!(o && o.caps), ds: o && o.ds || 1, rings: o && o.rings, inner: o && o.inner });
const CY = (a, b, r, o) => { const d = V.sub(b, a); return LA(a, d, [[0, r], [V.len(d), r]], o); };
const circ = (c, U, W, r, n) => { const p = []; for (let k = 0; k < n; k++) { const a = k / n * TAU; p.push(V.add(c, V.add(V.mul(U, Math.cos(a) * r), V.mul(W, Math.sin(a) * r)))); } return p; };
const RZ = (z, r, o) => L(circ([0, 0, z], [1, 0, 0], [0, 1, 0], r, 96), Object.assign({ closed: true }, o || {}));
/* a box: six outward faces (o.skip: 'x-','x+','y-','y+','z-','z+'), twelve edges (o.edges false: none) */
function BOX(mn, mx, o) {
  o = o || {};
  const [a, b, c] = mn, [d, e, f] = mx, sk = o.skip || [], P = [], ds = o.ds || 1;
  const F = {
    'x-': [[a, b, c], [a, b, f], [a, e, f], [a, e, c], [-1, 0, 0]], 'x+': [[d, b, c], [d, e, c], [d, e, f], [d, b, f], [1, 0, 0]],
    'y-': [[a, b, c], [d, b, c], [d, b, f], [a, b, f], [0, -1, 0]], 'y+': [[a, e, c], [a, e, f], [d, e, f], [d, e, c], [0, 1, 0]],
    'z-': [[a, b, c], [a, e, c], [d, e, c], [d, b, c], [0, 0, -1]], 'z+': [[a, b, f], [d, b, f], [d, e, f], [a, e, f], [0, 0, 1]],
  };
  for (const k in F) if (!sk.includes(k)) P.push(Q(F[k][0], F[k][1], F[k][2], F[k][3], { n: F[k][4], ds }));
  if (o.edges !== false) {
    const C8 = [[a, b, c], [d, b, c], [d, e, c], [a, e, c], [a, b, f], [d, b, f], [d, e, f], [a, e, f]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) P.push(L([C8[i], C8[j]], { ds: o.eds || LIN }));
  }
  return P;
}
/* map prims through a transform */
function TX(P, Tf) {
  return P.map(p => {
    if (p.t === 'q') return Object.assign({}, p, { p: p.p.map(q => X.ap(Tf, q)), n: p.n ? X.dir(Tf, p.n) : undefined });
    if (p.t === 'l') return Object.assign({}, p, { p: p.p.map(q => X.ap(Tf, q)) });
    return Object.assign({}, p, { a: X.ap(Tf, p.a), d: X.dir(Tf, p.d) });
  });
}
function samp(P, s) {
  const out = [];
  const push = (x, y, z, n) => out.push(x, y, z, n[0], n[1], n[2]);
  const Z3 = [0, 0, 0];
  for (const p of P) {
    const sp = s * p.ds;
    if (p.t === 'q') {
      const [a, b, c, d] = p.p, ab = V.sub(b, a), ad = V.sub(d, a);
      const nu = Math.max(1, Math.round(V.len(ab) / sp)), nv = Math.max(1, Math.round(V.len(ad) / sp));
      const n = p.two ? Z3 : p.n || V.norm(V.cross(ab, ad));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const u = (i + .5) / nu, v = (j + .5) / nv; push(a[0] + ab[0] * u + ad[0] * v, a[1] + ab[1] * u + ad[1] * v, a[2] + ab[2] * u + ad[2] * v, n); }
    } else if (p.t === 'l') {
      const Pp = p.closed ? p.p.concat([p.p[0]]) : p.p;
      for (let i = 0; i < Pp.length - 1; i++) {
        const A = Pp[i], B = Pp[i + 1], n = Math.max(1, Math.round(V.dist(A, B) / sp));
        for (let k = 0; k < n; k++) { const u = k / n; push(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u, Z3); }
      }
      if (!p.closed) { const B = Pp[Pp.length - 1]; push(B[0], B[1], B[2], Z3); }
    } else {
      const [U, W] = G.perp(p.d), st = p.st, sg = p.inner ? -1 : 1;
      for (let i = 0; i < st.length - 1; i++) {
        const [s0, r0] = st[i], [s1, r1] = st[i + 1], Ls = Math.hypot(s1 - s0, r1 - r0);
        const na = Math.max(1, Math.round(Ls / sp)), nt = Math.max(8, Math.round(TAU * Math.max(r0, r1) / sp));
        for (let a = 0; a < na; a++) { const u = (a + .5) / na, sr = s0 + (s1 - s0) * u, rr = r0 + (r1 - r0) * u, ph = (a % 2) * .5;
          for (let t = 0; t < nt; t++) { const th = (t + ph) / nt * TAU, cs = Math.cos(th), sn = Math.sin(th), nr = [U[0] * cs + W[0] * sn, U[1] * cs + W[1] * sn, U[2] * cs + W[2] * sn];
            push(p.a[0] + p.d[0] * sr + nr[0] * rr, p.a[1] + p.d[1] * sr + nr[1] * rr, p.a[2] + p.d[2] * sr + nr[2] * rr, sg > 0 ? nr : [-nr[0], -nr[1], -nr[2]]); } }
      }
      const rings = p.rings || [];
      for (const i of rings) { const [sc, rc] = st[i], nt = Math.max(12, Math.round(TAU * rc / (sp * LIN))), c = V.mad(p.a, p.d, sc); for (let t = 0; t < nt; t++) { const th = t / nt * TAU; push(c[0] + (U[0] * Math.cos(th) + W[0] * Math.sin(th)) * rc, c[1] + (U[1] * Math.cos(th) + W[1] * Math.sin(th)) * rc, c[2] + (U[2] * Math.cos(th) + W[2] * Math.sin(th)) * rc, Z3); } }
      if (p.caps) for (const i of [0, st.length - 1]) {
        const [sc, rc] = st[i]; if (rc < .01) continue;
        const nr = Math.max(1, Math.round(rc / sp)), c = V.mad(p.a, p.d, sc), nn = V.mul(p.d, i ? 1 : -1);
        for (let k = 0; k < nr; k++) { const rr = (k + .5) / nr * rc, nt = Math.max(6, Math.round(TAU * rr / sp)); for (let t = 0; t < nt; t++) { const th = (t + .5 * (k % 2)) / nt * TAU; push(c[0] + (U[0] * Math.cos(th) + W[0] * Math.sin(th)) * rr, c[1] + (U[1] * Math.cos(th) + W[1] * Math.sin(th)) * rr, c[2] + (U[2] * Math.cos(th) + W[2] * Math.sin(th)) * rr, nn); } }
      }
    }
  }
  return new Float32Array(out);
}
const cloud = (P, lv, cs) => K.lodCloud(lv.map(sp => ({ sp, pts: samp(P, sp) })), cs || .8);
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const rot = (Rm, p) => X.make(Rm, p || [0, 0, 0]);
const axR = (ax, a) => K.Q.toR(K.Q.axis(ax, a));
const pivot = (ax, a, h) => { const Rm = axR(ax, a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const LV = [.02, .04, .08, .16, .32, .64], LVF = [.009, .018, .036, .072, .144, .288, .576];

/* ======================= the satellite ======================= */
const HB = 1.3, ZB0 = -7.2, ZB1 = -2.6, ZBC = (ZB0 + ZB1) / 2;
/* skin: one face at a time (X-ray thins them), seams every 1.15 m, access hatches */
const skinFace = (k) => {
  const P = [];
  const seam = (A, B) => P.push(L([A, B], { ds: .5 }));
  if (k === 'top' || k === 'bot') {
    const y = k === 'top' ? HB : -HB;
    P.push(...BOX([-HB, y - .001, ZB0], [HB, y + .001, ZB1], { skip: ['x-', 'x+', 'z-', 'z+', k === 'top' ? 'y-' : 'y+'], edges: false }));
    for (let z = ZB0 + 1.15; z < ZB1 - .1; z += 1.15) seam([-HB, y, z], [HB, y, z]);
    seam([0, y, ZB0], [0, y, ZB1]);
    if (k === 'bot') P.push(L([[-.5, y, -4.2], [.5, y, -4.2], [.5, y, -3.0], [-.5, y, -3.0]], { closed: true, ds: .5 }));
  } else if (k === 'stb' || k === 'prt') {
    const x = k === 'stb' ? HB : -HB;
    P.push(...BOX([x - .001, -HB, ZB0], [x + .001, HB, ZB1], { skip: ['y-', 'y+', 'z-', 'z+', k === 'stb' ? 'x-' : 'x+'], edges: false }));
    for (let z = ZB0 + 1.15; z < ZB1 - .1; z += 1.15) seam([x, -HB, z], [x, HB, z]);
    seam([x, -.2, ZB0], [x, -.2, ZB1]);
    P.push(L([[x, -1.05, -6.6], [x, -.45, -6.6], [x, -.45, -5.6], [x, -1.05, -5.6]], { closed: true, ds: .5 }));
  } else if (k === 'aft') {
    P.push(...BOX([-HB, -HB, ZB0 - .001], [HB, HB, ZB0 + .001], { skip: ['x-', 'x+', 'y-', 'y+', 'z+'], edges: false }));
    for (const r of [.35, .6]) P.push(L(circ([0, -.2, ZB0], [1, 0, 0], [0, 1, 0], r, 60), { closed: true, ds: .5 }));
  } else {
    P.push(...BOX([-HB, -HB, ZB1 - .001], [HB, HB, ZB1 + .001], { skip: ['x-', 'x+', 'y-', 'y+', 'z-'], edges: false }));
    P.push(L(circ([0, 0, ZB1], [1, 0, 0], [0, 1, 0], .16, 40), { closed: true, ds: .5 }));
  }
  return P;
};
// the bus frame: twelve edges as longerons, corner fittings
const P_FRAME = (() => {
  const P = BOX([-HB, -HB, ZB0], [HB, HB, ZB1], { skip: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], eds: .22 });
  for (const x of [-HB, HB]) for (const y of [-HB, HB]) for (const z of [ZB0, ZB1]) P.push(...BOX([x - .06, y - .06, z - .06], [x + .06, y + .06, z + .06], { eds: .5 }));
  // star trackers (top aft), baffles pointing up and aft
  for (const x of [-.8, .8]) { P.push(...BOX([x - .16, HB, -7.1], [x + .16, HB + .2, -6.78])); P.push(LA([x, HB + .2, -6.94], [0, .8, -.6], [[0, .1], [.34, .18]], { rings: [0, 1] })); }
  // RCS pods: four at the aft corners, four at the fore corners (4 nozzles each)
  for (const z of [ZB0 + .12, ZB1 - .12]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const c = [sx * (HB + .08), sy * (HB + .08), z];
    P.push(...BOX(V.sub(c, [.1, .1, .1]), V.add(c, [.1, .1, .1]), { ds: 2.5, eds: .5 }));
    for (const d of [[sx, 0, 0], [0, sy, 0], [0, 0, z < -5 ? -1 : 1]]) P.push(LA(V.mad(c, d, .1), d, [[0, .03], [.12, .06]], { rings: [1] }));
  }
  // wing root brackets and radiator hinge rails
  for (const s of [-1, 1]) { P.push(...BOX([s * HB - (s > 0 ? 0 : .08), .98, -5.4], [s * HB + (s > 0 ? .08 : 0), 1.22, -4.4])); P.push(L([[s * 1.22, HB + .02, -6.8], [s * 1.22, HB + .02, -3.2]], { ds: .25 })); }
  return P;
})();
/* power conditioning unit, aft in the bus: a box, heat-sink fins across its face, six output terminals */
const P_PCU = (() => {
  const P = BOX([-1.0, -1.05, -7.0], [1.0, .25, -6.35]);
  for (let x = -.92; x <= .92; x += .08) P.push(L([[x, -.98, -6.34], [x, .18, -6.34]], { ds: 1.4 }));
  for (let k = 0; k < 6; k++) P.push(CY([-.75 + .3 * k, .25, -6.6], [-.75 + .3 * k, .4, -6.6], .05, { caps: true }));
  return P;
})();
/* capacitor module: a frame, six cans (2 across x, 3 along z), bands; local y -0.8..0.8 */
const P_CAPM = (() => {
  const P = BOX([-.42, -.8, -.32], [.42, .8, .32], { skip: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], eds: .35 });
  for (const y of [-.8, .8]) for (const x of [-.3, -.1, .1, .3]) P.push(L([[x, y, -.32], [x, y, .32]], { ds: .5 }));
  return P;
})();
/* one can (local centre), six per module */
const P_CAN = (() => { const P = [CY([0, -.76, 0], [0, .76, 0], .085, { caps: true, rings: [0, 1], ds: 3 })]; for (const y of [-.5, -.25, 0, .25, .5]) P.push(L(circ([0, y, 0], [1, 0, 0], [0, 0, 1], .088, 28), { closed: true, ds: .5 })); P.push(CY([0, .76, 0], [0, .84, 0], .03, { caps: true })); return P; })();
const CAN_C = []; for (const z of [-.2, 0, .2]) for (const x of [-.2, .2]) CAN_C.push([x, 0, z]);
const CAPM_C = []; for (const s of [-1, 1]) for (let k = 0; k < 4; k++) CAPM_C.push([s * .66, -.3, -5.9 + .78 * k]);
/* reaction wheel: rim, web, hub, six spokes (spin readable) */
const P_WHEEL = (() => {
  const P = [LA([0, 0, -.06], [0, 0, 1], [[0, .27], [.12, .27]], { rings: [0, 1] }), LA([0, 0, -.06], [0, 0, 1], [[0, .22], [.12, .22]], { inner: true })];
  P.push(CY([0, 0, -.12], [0, 0, .12], .05, { caps: true }));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(L([[.05 * Math.cos(a), .05 * Math.sin(a), 0], [.22 * Math.cos(a), .22 * Math.sin(a), 0]], { ds: .4 })); }
  P.push(...BOX([.22, -.03, -.05], [.27, .03, .05], { edges: false }));
  return P;
})();
const WHEEL_P = [[-.52, .86, -5.55], [.52, .86, -5.55], [-.52, .86, -4.45], [.52, .86, -4.45]].map((c, i) => ({ c, ax: V.norm([c[0] * .5, 1, (i < 2 ? -1 : 1) * .35]) }));
/* contactor: base, two terminals, the knife blade (a separate piece), local hinge at (0, .1, -.08) about X */
const P_CONT = [...BOX([-.11, -.14, -.12], [.11, .1, .12], { eds: .4 }), CY([0, .1, .08], [0, .2, .08], .03, { caps: true }), CY([0, .1, -.08], [0, .16, -.08], .03, { caps: true })];
const P_BLADE = [...BOX([-.025, 0, 0], [.025, .03, .18], { eds: .5 })];
const CONT_X = [-.9, -.54, -.18, .18, .54, .9];
const P_BUSBAR = (() => {
  const P = [];
  for (const s of [-1, 1]) for (const y of [.55, .6]) P.push(L([[s * .66, y, -6.35], [s * .66, y, -3.2]], { ds: .4 }));
  for (const s of [-1, 1]) P.push(L([[s * .66, .55, -3.2], [s * .66, -.75, -3.0], [s * .2, -.75, -2.9]], { ds: .4 }));
  P.push(L([[-1, -.8, -2.9], [1, -.8, -2.9]], { ds: .3 }), L([[-1, -.8, -2.85], [1, -.8, -2.85]], { ds: .3 }));
  P.push(L([[0, -.95, -2.75], [0, -.95, -2.6], [0, -.72, -.2], [0, -.72, 0]], { ds: .3 }));
  return P;
})();
/* rammer: three nested tubes and the plunger head (each piece offset along z by the pose) */
const P_RAM = [0, 1, 2].map(k => { const r = .075 - .015 * k; return [CY([0, 0, 0], [0, 0, .85], r, { rings: [0, 1] }), RZ(.84, r + .012)]; });
const P_RAMH = [CY([0, 0, 0], [0, 0, .9], .03), CY([0, 0, .9], [0, 0, .96], .085, { caps: true, rings: [0, 1] })];
/* breech module */
const DR_Y = -.62, DR_R = .62, DR_O = .84, DZ0 = -2.42, DZ1 = -.62;
const P_CAGE = (() => {
  const P = [];
  for (const x of [-1.05, 1.05]) for (const y of [-1.6, .42]) P.push(...BOX([x - .05, y - .05, -2.6], [x + .05, y + .05, -.2], { skip: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], eds: .3 }));
  for (const z of [-2.55, -.25]) P.push(L([[-1.05, -1.6, z], [1.05, -1.6, z], [1.05, .42, z], [-1.05, .42, z]], { closed: true, ds: .3 }));
  // front plate with the bore and the drum axle bearing, the drum axle
  P.push(...BOX([-1.1, -1.65, -.2], [1.1, .47, -.12], { skip: ['x-', 'x+', 'y-', 'y+', 'z-'], ds: 2.5, eds: .3 }));
  for (let y = -1.45; y < .4; y += .3) P.push(L([[-1.1, y, -.115], [1.1, y, -.115]], { ds: .6 }));
  P.push(L(circ([0, 0, -.11], [1, 0, 0], [0, 1, 0], .14, 48), { closed: true }), L(circ([0, DR_Y, -.11], [1, 0, 0], [0, 1, 0], .12, 40), { closed: true }));
  P.push(CY([0, DR_Y, -2.58], [0, DR_Y, -.2], .07));
  // breech block guide rails, across the bore behind the front plate
  for (const y of [-.24, .24]) P.push(...BOX([-.3, y - .03, -.46], [1.35, y + .03, -.18], { ds: 2, eds: .35 }));
  // indexing motor
  P.push(...BOX([-.25, -1.6, -2.55], [.25, -1.35, -2.2]), CY([0, -1.35, -2.37], [0, -1.18, -2.37], .06));
  return P;
})();
const P_DRUM = (() => {
  const P = [LA([0, 0, DZ0], [0, 0, 1], [[0, DR_O], [DZ1 - DZ0, DR_O]], { ds: 1.4, rings: [0, 1] })];
  for (const z of [DZ0, DZ1]) { P.push(L(circ([0, 0, z], [1, 0, 0], [0, 1, 0], DR_O * .45, 60), { closed: true, ds: .4 })); for (let k = 0; k < 6; k++) { const a = PI / 2 + k * TAU / 6; P.push(L(circ([DR_R * Math.cos(a), DR_R * Math.sin(a), z], [1, 0, 0], [0, 1, 0], .13, 30), { closed: true, ds: .4 })); } }
  for (let k = 0; k < 6; k++) { const a = PI / 2 + k * TAU / 6 + PI / 6; P.push(L([[DR_O * Math.cos(a), DR_O * Math.sin(a), DZ0], [DR_O * Math.cos(a), DR_O * Math.sin(a), DZ1]], { ds: .35 })); }
  return P;
})();
const P_TUBES = (() => { const P = []; for (let k = 0; k < 6; k++) { const a = PI / 2 + k * TAU / 6; P.push(CY([DR_R * Math.cos(a), DR_R * Math.sin(a), DZ0], [DR_R * Math.cos(a), DR_R * Math.sin(a), DZ1], .12, { ds: 1.6 })); } return P; })();
const P_BLOCK = [...BOX([-.2, -.2, -.44], [.2, .2, -.2], { eds: .3 }), L([[-.12, -.12, -.199], [.12, -.12, -.199], [.12, .12, -.199], [-.12, .12, -.199]], { closed: true })];
const P_LUG = [...BOX([-.06, 0, -.4], [.06, .14, -.24], { eds: .4 })];
/* the rod: a closed shell, 1.4 m (local z 0..1.4), nose cone, four tail fins */
const P_ROD = (() => {
  const P = [LA([0, 0, 0], [0, 0, 1], [[0, .03], [.02, .075], [1.05, .075], [1.4, 0]], { caps: true, rings: [1, 2] })];
  for (const z of [.35, .7]) P.push(RZ(z, .077));
  for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2, c = Math.cos(a), s = Math.sin(a); P.push(Q([c * .075, s * .075, .02], [c * .16, s * .16, .02], [c * .16, s * .16, .2], [c * .075, s * .075, .3], { two: true })); P.push(L([[c * .16, s * .16, .02], [c * .16, s * .16, .2], [c * .075, s * .075, .3]])); }
  return P;
})();
/* barrel segment (local z 0..6): two rails, a truss, end frames, the busbar under it; hinge lugs per segment */
const SL = 6, RC0 = .42, RC1 = .55, HH = .7;
const P_SEG = (() => {
  const P = [];
  for (const s of [-1, 1]) P.push(...BOX([s * .24 - .05, -.12, 0], [s * .24 + .05, .12, SL], { ds: 1.8, eds: .3 }));
  for (let k = 0; k <= 12; k++) { const z = k * SL / 12; for (const y of [-.12, .12]) P.push(L([[-.19, y, z], [.19, y, z]], { ds: .5 })); if (k < 12) for (const y of [-.12, .12]) P.push(L([[-.19, y, z], [.19, y, z + SL / 12]], { ds: .6 })); }
  for (const z of [.02, SL - .02]) P.push(L([[-.36, -.36, z], [.36, -.36, z], [.36, .36, z], [-.36, .36, z]], { closed: true, ds: .3 }), L([[-.36, -.36, z], [-.29, -.12, z]]), L([[.36, -.36, z], [.29, -.12, z]]), L([[-.36, .36, z], [-.29, .12, z]]), L([[.36, .36, z], [.29, .12, z]]));
  P.push(L([[0, -.72, 0], [0, -.72, SL]], { ds: .3 }), L([[.05, -.72, 0], [.05, -.72, SL]], { ds: .3 }));
  for (let k = 0; k <= 6; k++) P.push(L([[0, -.36, k], [0, -.72, k]], { ds: .5 }));
  return P;
})();
/* hinge lug pair and pin at (y = sgn * HH, z = zc) across x */
const P_HINGE = sg => { const y = sg * HH, P = []; for (const x of [-.34, .34]) { P.push(...BOX([x - .05, Math.min(0, y) - (sg < 0 ? .02 : -.12), -.35], [x + .05, Math.max(0, y) + (sg < 0 ? -.12 : .02), 0], { eds: .35 })); } P.push(CY([-.46, y, -.02], [.46, y, -.02], .045, { caps: true, rings: [0, 1] })); for (const x of [-.34, 0, .34]) P.push(CY([x - .07, y, -.02], [x + .07, y, -.02], .075, { caps: true })); return P; };
const P_COLLAR = [LA([0, 0, 0], [0, 0, 1], [[0, .36], [.46, .36]], { rings: [0, 1], ds: .9 }), RZ(.23, .38), RZ(.1, .37), RZ(.36, .37)];
const P_COIL = (() => {
  const P = [LA([0, 0, -.12], [0, 0, 1], [[0, RC1], [.24, RC1]], { rings: [0, 1], ds: 1.3 }), LA([0, 0, -.12], [0, 0, 1], [[0, RC0], [.24, RC0]], { inner: true, ds: 2 })];
  for (const z of [-.12, .12]) P.push(LA([0, 0, z], [0, 0, 1], [[0, RC0], [0, RC1]], { ds: 1.6 }));
  for (let k = 1; k < 8; k++) P.push(RZ(-.12 + .24 * k / 8, RC1 + .004, { ds: .5 }));
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; P.push(L([[RC1 * Math.cos(a), RC1 * Math.sin(a), -.12], [RC1 * Math.cos(a), RC1 * Math.sin(a), .12]], { ds: .5 })); }
  P.push(...BOX([-.08, -.66, -.07], [.08, -.54, .07], { eds: .4 }), L([[0, -.66, 0], [0, -.72, 0]], { ds: .3 }));
  return P;
})();
const P_CROWN = (() => { const P = [LA([0, 0, SL - .2], [0, 0, 1], [[0, .4], [.3, .5], [.55, .7]], { rings: [0, 1, 2] })]; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(Q([.3 * Math.cos(a), .3 * Math.sin(a), SL - .15], [.66 * Math.cos(a), .66 * Math.sin(a), SL + .3], [.66 * Math.cos(a), .66 * Math.sin(a), SL + .34], [.3 * Math.cos(a), .3 * Math.sin(a), SL - .1], { two: true })); } return P; })();
const COIL_Z = [.75, 2.25, 3.75, 5.25];
/* solar wing panel: spans local x 0..PW, z -PL/2..PL/2; cells on the top (lattice), strings, frame; a hinge pin
   and three knuckles on its outer edge (the pin the next panel turns on) */
const PW = 2.3, PL = 3.8, WZ = -4.9, WTH = .02;
const P_PANEL = (() => {
  const P = [Q([0, 0, -PL / 2], [0, 0, PL / 2], [PW, 0, PL / 2], [PW, 0, -PL / 2], { n: [0, 1, 0], ds: 1.25 })];
  for (let x = PW / 5; x < PW - .01; x += PW / 5) P.push(L([[x, .002, -PL / 2 + .04], [x, .002, PL / 2 - .04]], { ds: .45 }));
  for (let z = -PL / 2 + PL / 8; z < PL / 2 - .01; z += PL / 8) P.push(L([[.04, .002, z], [PW - .04, .002, z]], { ds: .55 }));
  P.push(...BOX([0, -WTH, -PL / 2], [PW, 0, PL / 2], { skip: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], eds: .25 }));
  return P;
})();
const P_PIN = sg => { const y = sg * .015, P = [CY([PW, y, -PL / 2 + .1], [PW, y, PL / 2 - .1], .014)]; for (const z of [-1.5, 0, 1.5]) P.push(CY([PW, y, z - .09], [PW, y, z + .09], .03, { caps: true })); P.push(...BOX([PW - .12, y - .02, -.3], [PW - .02, y + .02, .3], { eds: .4 })); return P; };
const P_YOKE = [...BOX([0, -.04, -.5], [.15, .04, .5], { eds: .3 }), CY([0, 0, -.6], [0, 0, .6], .035, { caps: true, rings: [0, 1] })];
/* radiator: hinged at local x 0, spans +x 1.15 m, z -6.8..-3.2 (heat pipes along z) */
const RDW = 1.15;
const P_RAD = (() => {
  const P = [Q([0, 0, -6.8], [0, 0, -3.2], [RDW, 0, -3.2], [RDW, 0, -6.8], { n: [0, 1, 0], ds: 1.3 }), Q([0, -.015, -6.8], [RDW, -.015, -6.8], [RDW, -.015, -3.2], [0, -.015, -3.2], { n: [0, -1, 0], ds: 1.6 })];
  for (let x = .1; x < RDW; x += .15) P.push(L([[x, .003, -6.75], [x, .003, -3.25]], { ds: .5 }));
  P.push(...BOX([0, -.015, -6.8], [RDW, 0, -3.2], { skip: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], eds: .25 }));
  P.push(CY([0, 0, -6.85], [0, 0, -3.15], .03));
  return P;
})();
/* belly: telescoping dish mast (two stages), dish ribs, mesh, feed; the dormant horn */
const DISH_Z = -5.7, DF = .7, DRr = 1.25;
const P_MAST = [0, 1].map(k => [CY([0, 0, 0], [0, -.95, 0], .1 - .025 * k, { rings: [0, 1] })]);
const P_RIB = [L((() => { const p = []; for (let k = 0; k <= 16; k++) { const r = .12 + (DRr - .12) * k / 16; p.push([r, -r * r / (4 * DF), 0]); } return p; })(), { ds: .5 })];
const P_MESH = [LA([0, 0, 0], [0, -1, 0], (() => { const s = []; for (let k = 0; k <= 8; k++) { const r = .12 + (DRr - .12) * k / 8; s.push([r * r / (4 * DF), r]); } return s; })(), { ds: 1.2 })];
const P_FEED = [L([[.12, 0, .12], [0, -DF, 0]], { ds: .5 }), L([[-.12, 0, .12], [0, -DF, 0]], { ds: .5 }), L([[0, 0, -.16], [0, -DF, 0]], { ds: .5 }), LA([0, -DF + .05, 0], [0, 1, 0], [[0, .03], [.14, .09]], { rings: [1] })];
const P_HORN = [CY([0, -HB, -3.4], [0, -HB - .14, -3.4], .07), LA([0, -HB - .14, -3.4], [0, -1, 0], [[0, .07], [.32, .21]], { rings: [0, 1] })];
const P_BOOM = [0, 1, 2, 3].map(k => { const r = .055 - .01 * k; return [CY([0, 0, 0], [0, 0, 1.4], r), RZ(1.36, r + .012)]; });
const P_BHEAD = [...BOX([-.1, -.1, 0], [.1, .1, .26]), CY([0, 0, .26], [0, 0, .36], .07, { caps: true })];
const BOOM_B = [0, HB, ZB0 + .1], BOOM_D = V.norm([0, .35, -1]);
// status lights: twelve along the top edges
const LIGHTS = []; for (let k = 0; k < 12; k++) LIGHTS.push([(k % 2 ? 1 : -1) * (HB - .12), HB + .01, -7.0 + .38 * Math.floor(k / 2) * 1.0 + (k % 2) * .19]);

/* clouds */
const S = {
  skin: { top: cloud(skinFace('top'), LV), bot: cloud(skinFace('bot'), LV), stb: cloud(skinFace('stb'), LV), prt: cloud(skinFace('prt'), LV), aft: cloud(skinFace('aft'), LV), fwd: cloud(skinFace('fwd'), LV) },
  frame: cloud(P_FRAME, LV), pcu: cloud(P_PCU, LVF), capm: cloud(P_CAPM, LVF, .5), can: cloud(P_CAN, LVF, .5), wheel: cloud(P_WHEEL, LVF, .5), cont: cloud(P_CONT, LVF, .4), blade: cloud(P_BLADE, LVF, .4), busbar: cloud(P_BUSBAR, LVF),
  ram: P_RAM.map(P => cloud(P, LVF, .5)), ramh: cloud(P_RAMH, LVF, .5),
  cage: cloud(P_CAGE, LVF), drum: cloud(P_DRUM, LVF), tubes: cloud(P_TUBES, LVF), block: cloud(P_BLOCK, LVF, .5), lug: cloud(P_LUG, LVF, .5), rod: cloud(P_ROD, LVF, .4),
  seg: cloud(P_SEG, LV, 1), hingeUp: cloud(P_HINGE(1), LVF, .5), hingeDn: cloud(P_HINGE(-1), LVF, .5), collar: cloud(P_COLLAR, LVF, .5), coil: cloud(P_COIL, LVF, .5), crown: cloud(P_CROWN, LVF, .6),
  panel: cloud(P_PANEL, [.025, .05, .1, .2, .4, .8], 1.2), pinUp: cloud(P_PIN(1), LVF, .6), pinDn: cloud(P_PIN(-1), LVF, .6), yoke: cloud(P_YOKE, LVF, .5),
  rad: cloud(P_RAD, [.025, .05, .1, .2, .4, .8], 1.2), mast: P_MAST.map(P => cloud(P, LVF, .5)), rib: cloud(P_RIB, LVF, .5), mesh: cloud(P_MESH, LV, .6), feed: cloud(P_FEED, LVF, .5), horn: cloud(P_HORN, LVF, .5),
  boom: P_BOOM.map(P => cloud(P, LVF, .6)), bhead: cloud(P_BHEAD, LVF, .5),
};

const SNAME = new Map(); for (const k in S) { const v = S[k]; if (v.lv) SNAME.set(v, k); else if (Array.isArray(v)) v.forEach((q, i) => SNAME.set(q, k + i)); else for (const j in v) SNAME.set(v[j], k + '.' + j); }
/* ---------- pose: world transforms of every piece at state st under the satellite's world transform W ---------- */
const PO = { panels: [], pins: [], yokes: [], rads: [], wheels: [], capm: [], cont: [], blades: [], ram: [], segs: [], coils: [], ribs: [], booms: [], lights: [], rods: [], lugs: [] };
const MIR = X.make(R.y(PI), [0, 0, 2 * WZ]);
const MIRR = X.make(R.y(PI), [0, 0, 2 * -5.0]);
function pose(W, st) {
  PO.W = W;
  const rc = st.recoil || 0, WB = rc ? X.mul(W, tr(0, 0, -rc)) : W;           // recoil moves the whole craft back
  PO.WB = WB;
  // wings: root hinge (the pack swings out from the side face), the drive (sun), then panels one by one
  PO.panels.length = 0; PO.pins.length = 0; PO.yokes.length = 0;
  for (const side of [0, 1]) {
    const base = side ? X.mul(WB, MIR) : WB;
    const root = X.mul(base, X.mul(tr(HB + .04, 1.1, WZ), X.mul(rot(R.z(-PI / 2 * (1 - (st.root || 0)))), rot(R.x(st.sada || 0)))));
    PO.yokes.push(root);
    let Tk = X.mul(root, tr(.15, 0, 0));
    PO.panels.push(Tk);
    const pan = st.pan || [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      const sg = j % 2 ? -1 : 1, f = pan[j];
      PO.pins.push({ T: Tk, up: sg > 0 });
      Tk = X.mul(Tk, X.mul(pivot([0, 0, 1], sg * PI * (1 - f) * .992, [PW, sg * .015, 0]), tr(PW, 0, 0)));
      PO.panels.push(Tk);
    }
  }
  // radiators: hinged at the top edges, stowed flat on the top face pointing inward, swung up and out
  PO.rads.length = 0;
  for (const side of [0, 1]) { const base = side ? X.mul(WB, MIRR) : WB; PO.rads.push(X.mul(base, X.mul(tr(1.22, HB + .03, 0), rot(R.z(PI - (PI / 2 + 12 * DEG) * (st.rad || 0)))))); }
  // inside
  PO.bus = WB;
  PO.wheels.length = 0;
  for (let i = 0; i < 4; i++) { const w = WHEEL_P[i]; PO.wheels.push(X.mul(WB, X.mul(rot(R.look(w.ax, [0, 0, 1]), w.c), rot(R.z((st.wheel || 0) * (i % 2 ? -1 : 1) + i))))); }
  PO.capm.length = 0; PO.cans = PO.cans || []; PO.cans.length = 0;
  for (const c of CAPM_C) { const Tm = X.mul(WB, tr(c[0], c[1], c[2])); PO.capm.push(Tm); for (const q of CAN_C) PO.cans.push(X.mul(Tm, tr(q[0], q[1], q[2]))); }
  PO.cont.length = 0; PO.blades.length = 0;
  for (let i = 0; i < 6; i++) { const C = X.mul(WB, tr(CONT_X[i], -.85, -2.93)); PO.cont.push(C); PO.blades.push(X.mul(C, pivot([1, 0, 0], -(1 - (st.sw ? st.sw[i] : 0)) * 70 * DEG, [0, .1, -.08]))); PO.blades[i] = X.mul(PO.blades[i], tr(0, .1, -.08)); }
  // rammer: sequential telescoping
  const d = 2.5 * (st.ram || 0), o1 = Math.min(d, .83), o2 = o1 + E.clamp(d - .83, 0, .83), o3 = o2 + Math.max(0, d - 1.66);
  PO.ram.length = 0; PO.ram.push(X.mul(WB, tr(0, 0, -3.45)), X.mul(WB, tr(0, 0, -3.45 + o1)), X.mul(WB, tr(0, 0, -3.45 + o2)));
  PO.ramh = X.mul(WB, tr(0, 0, -3.56 + o3));
  PO.ramHead = -3.56 + o3 + .96;
  // breech: drum index, block, lugs
  PO.cage = WB;
  PO.drum = X.mul(WB, X.make(R.z(st.drum || 0), [0, DR_Y, 0]));
  PO.block = X.mul(WB, tr(1.05 * (1 - (st.block || 0)), 0, 0));
  PO.lugs.length = 0; for (const s of [-1, 1]) PO.lugs.push(X.mul(PO.block, X.mul(X.make(s > 0 ? R.I() : R.z(PI)), tr(0, .06 + .14 * (st.lugs || 0), 0))));
  // rods in the magazine: five (one slot empty or holding the loaded round until it is rammed)
  PO.rods.length = 0;
  for (let k = 0; k < 6; k++) {
    const a = PI / 2 + k * TAU / 6 + (st.drum || 0);
    if (k === 5 || (k === 0 && st.rodOut)) continue;
    PO.rods.push(X.mul(WB, tr(DR_R * Math.cos(a), DR_Y + DR_R * Math.sin(a), DZ0 + .12)));
  }
  // the loaded rod (on the bore axis, rear at rodZ) until it leaves the barrel
  PO.rod = st.rodOut && st.rodZ !== undefined && st.rodZ < 18.5 ? X.mul(WB, tr(0, 0, st.rodZ)) : null;
  // barrel segments: A fixed; B on the pin at A's muzzle end (top), C on the pin at B's end (bottom)
  PO.segs.length = 0;
  const A = X.mul(WB, tr(0, 0, 0));
  const B = X.mul(A, X.mul(pivot([1, 0, 0], -PI * (1 - (st.segB || 0)), [0, HH, SL]), tr(0, 0, SL)));
  const Cc = X.mul(B, X.mul(pivot([1, 0, 0], PI * (1 - (st.segC || 0)), [0, -HH, SL]), tr(0, 0, SL)));
  PO.segs.push(A, B, Cc);
  PO.coils.length = 0; for (let s = 0; s < 3; s++) for (const z of COIL_Z) PO.coils.push(X.mul(PO.segs[s], tr(0, 0, z)));
  PO.hinges = [X.mul(A, tr(0, 0, SL)), X.mul(B, X.make(R.y(PI), [0, 0, 0])), X.mul(B, tr(0, 0, SL)), X.mul(Cc, X.make(R.y(PI), [0, 0, 0]))];
  PO.collars = [X.mul(A, tr(0, 0, SL - .5 + .27 * (st.latchB || 0))), X.mul(B, tr(0, 0, SL - .5 + .27 * (st.latchC || 0)))];
  PO.crown = Cc;
  PO.muzzle = X.ap(Cc, [0, 0, SL + .4]);
  // belly: mast stages, dish, horn; boom
  const m = st.mast || 0;
  PO.mast = [X.mul(WB, tr(0, -HB, DISH_Z)), X.mul(WB, tr(0, -HB - .9 * m, DISH_Z))];
  const DC = X.mul(WB, tr(0, -HB - .95 - .9 * m, DISH_Z));
  PO.dish = DC;
  PO.ribs.length = 0; for (let k = 0; k < 12; k++) PO.ribs.push(X.mul(DC, X.mul(rot(R.y(k * PI / 6)), rot(R.z(-(1 - (st.dish || 0)) * 80 * DEG)))));
  PO.horn = WB;
  PO.booms.length = 0;
  const BB = X.mul(WB, rot(R.look(BOOM_D, [0, 1, 0]), BOOM_B)), be = st.boom || 0;
  for (let j = 0; j < 4; j++) PO.booms.push(X.mul(BB, tr(0, 0, j * .04 + be * j * 1.3)));
  PO.bhead = X.mul(BB, tr(0, 0, 1.4 + be * 3 * 1.3));
  PO.lights.length = 0; for (const p of LIGHTS) PO.lights.push(X.ap(WB, p));
  PO.hornTip = X.ap(WB, [0, -HB - .4, -3.4]);
  return PO;
}

/* ---------- drawing ---------- */
const SO = { a: 1.25, fade: 600, lime: 0, keep: 1, px: 5.4, px0: 5.4, rev: null, tint: null, tk: 0, back: .1, clip: null, occ: 1, size: 1, lb: 0 };
const REV = { x: 0, y: 0, z: 0, age: 0, v: 5, pre: 1, after: 0 };
const inv = (Tw, p, o) => { const M = Tw.R, dx = p[0] - Tw.T[0], dy = p[1] - Tw.T[1], dz = p[2] - Tw.T[2]; o.x = M[0] * dx + M[3] * dy + M[6] * dz; o.y = M[1] * dx + M[4] * dy + M[7] * dz; o.z = M[2] * dx + M[5] * dy + M[8] * dz; return o; };
const CLIP = [0, 0, 0, 0];
/* o: { xr (bus X-ray 0..1), xrB (breech X-ray), rip {p, age, v, after}, lime (all), panLit [8 per wing x2], capFill [8],
   capLit, coilLit [12], railLit, wheelLit, swLit, rodLit, hot (charge glow on the barrel) } */
function draw(P, st, o) {
  const rip = o.rip;
  const put = (ml, Tw, lime, keep, a, clip, lb) => {
    SO.lb = lb || 0; SO.lime = Math.min(1, (lime || 0) + (o.lime || 0)); SO.keep = keep === undefined ? 1 : keep; SO.a = a === undefined ? 1.25 : a; SO.clip = clip || null;
    if (rip && rip.age > -.2 && rip.age < 4) { inv(Tw, rip.p, REV); REV.age = rip.age; REV.v = rip.v; REV.after = rip.after || 0; SO.rev = REV; } else SO.rev = null;
    if (o.stats) K.npts();
    K.drawLod(ml, Tw, SO);
    if (o.stats) { const nm = SNAME.get(ml) || '?'; o.stats[nm] = (o.stats[nm] || 0) + K.npts(); }
  };
  const xr = o.xr || 0, xrB = o.xrB || 0;
  const skK = 1 - .86 * xr, skL = .12 * xr;
  put(S.frame, P.bus, .1 * xr);
  const skB = xr > .3 ? 1 : 0, skK2 = xr > .3 ? Math.min(1, skK * 2.2) : skK;
  for (const k of ['top', 'bot', 'stb', 'prt', 'aft', 'fwd']) put(S.skin[k], P.bus, skL, skK2, 1.1, null, skB);
  // insides: only while the skin is thinned
  if (xr > .02) {
    const a = 1.3 * Math.min(1, xr * 1.5);
    SO.px = SO.px0 = 6.5;
    put(S.pcu, P.bus, .25 + .75 * (o.pcuLit || 0), 1, a);
    put(S.busbar, P.bus, .3 + .7 * (o.busLit || 0), 1, a);
    for (let i = 0; i < 8; i++) {
      const f = o.capFill ? o.capFill[i] : 0;
      put(S.capm, P.capm[i], .15 + .7 * (f > .999 ? 1 : 0), 1, a);
      for (let k = 0; k < 6; k++) {
        const g = E.clamp(f * 6 - k, 0, 1), Tm = P.cans[i * 6 + k];
        if (g <= .001) put(S.can, Tm, .12, 1, a * .9);
        else if (g >= .999) put(S.can, Tm, 1, 1, a * 1.25);
        else { const lv = -.8 + 1.6 * g; CLIP[0] = 0; CLIP[1] = -1; CLIP[2] = 0; CLIP[3] = -lv; put(S.can, Tm, 1, 1, a * 1.3, CLIP); CLIP[1] = 1; CLIP[3] = lv; put(S.can, Tm, .12, 1, a * .9, CLIP); }
      }
    }
    for (const Tm of P.wheels) put(S.wheel, Tm, .3 + .6 * (o.wheelLit || 0), 1, a);
    for (let i = 0; i < 6; i++) { put(S.cont, P.cont[i], .15, 1, a); put(S.blade, P.blades[i], (o.swLit ? o.swLit[i] : 0), 1, a * 1.2); }
    SO.px = SO.px0 = 5.4;
  }
  const rk = Math.max(xr, xrB);
  if (rk > .02) { for (let k = 0; k < 3; k++) put(S.ram[k], P.ram[k], .35, 1, 1.3 * Math.min(1, rk * 1.5)); put(S.ramh, P.ramh, .5, 1, 1.3 * Math.min(1, rk * 1.5)); }
  // breech
  const bgB = xr > .3 ? 1 : 0;
  put(S.cage, P.cage, .08 * xrB, 1, 1.25 * (1 - .45 * xr) * (1 - .5 * xrB), null, bgB);
  put(S.drum, P.drum, .1 * xrB, 1 - .6 * xrB, 1.25, null, xrB > .3 || bgB ? 1 : 0);
  put(S.tubes, P.drum, .05, 1 - .5 * xrB, 1, null, xrB > .3 || bgB ? 1 : 0);
  const rodA = .5 + .8 * xrB;
  for (const Tm of P.rods) put(S.rod, Tm, .55 * xrB, 1, rodA);
  if (P.rod) put(S.rod, P.rod, (o.rodLit || 0) + .3 * xrB, 1, 1.4);
  put(S.block, P.block, .3 * (o.blockLit || 0), 1, 1.3);
  for (const Tm of P.lugs) put(S.lug, Tm, o.blockLit || 0, 1, 1.3);
  // barrel
  const rl = o.railLit || 0;
  for (let s = 0; s < 3; s++) put(S.seg, P.segs[s], rl * (o.segLit ? o.segLit[s] : 1), 1, 1.2);
  put(S.hingeUp, P.hinges[0], o.hingeLit ? o.hingeLit[0] : 0); put(S.hingeUp, P.hinges[1], o.hingeLit ? o.hingeLit[0] : 0);
  put(S.hingeDn, P.hinges[2], o.hingeLit ? o.hingeLit[1] : 0); put(S.hingeDn, P.hinges[3], o.hingeLit ? o.hingeLit[1] : 0);
  put(S.collar, P.collars[0], o.hingeLit ? o.hingeLit[0] : 0, 1, 1.3); put(S.collar, P.collars[1], o.hingeLit ? o.hingeLit[1] : 0, 1, 1.3);
  for (let j = 0; j < 12; j++) put(S.coil, P.coils[j], o.coilLit ? o.coilLit[j] : 0, 1, 1.35);
  put(S.crown, P.crown, o.crownLit || 0, 1, 1.3);
  // wings, radiators
  for (let k = 0; k < P.panels.length; k++) put(S.panel, P.panels[k], o.panLit ? o.panLit[k] : 0, 1, 1.15, null, bgB || (o.panLb || 0));
  for (const pn of P.pins) put(pn.up ? S.pinUp : S.pinDn, pn.T, 0, 1, 1.35);
  for (const Tm of P.yokes) put(S.yoke, Tm, 0, 1, 1.3);
  for (const Tm of P.rads) put(S.rad, Tm, o.radLit || 0, 1 - .6 * xr, 1.1 * (1 - .5 * xr));
  // belly, boom
  put(S.mast[0], P.mast[0], 0); put(S.mast[1], P.mast[1], 0);
  for (const Tm of P.ribs) put(S.rib, Tm, .05, 1, 1.3);
  const dm = E.ss(.75, 1, st.dish || 0);
  if (dm > .01) put(S.mesh, P.dish, 0, dm, .9);
  if ((st.dish || 0) > .9) put(S.feed, P.dish, 0, 1, 1.2);
  put(S.horn, P.horn, o.hornLit || 0, 1, 1.3);
  for (let j = 0; j < 4; j++) put(S.boom[j], P.booms[j], 0, 1, 1.3);
  put(S.bhead, P.bhead, 0, 1, 1.3);
  SO.rev = null; SO.lime = 0; SO.keep = 1; SO.a = 1.25; SO.clip = null;
}
/* occluders (convex, world): the bus while its skin is shut, the wing panels, the radiators */
function occlude(P, st, xr) {
  if (xr < .05) K.occBox(P.bus, [-HB + .05, -HB + .05, ZB0 + .05], [HB - .05, HB - .05, ZB1 - .05]);
  for (const Tm of P.panels) K.occBox(Tm, [.05, -.014, -PL / 2 + .05], [PW - .05, -.006, PL / 2 - .05]);
  for (const Tm of P.rads) K.occBox(Tm, [.05, -.011, -6.75], [RDW - .05, -.004, -3.25]);
}
/* the rod drawn on its own (after it leaves the barrel), at world transform Tw */
function drawRod(Tw, lime, a) { SO.clip = null; SO.rev = null; SO.lime = lime || 0; SO.keep = 1; SO.a = a || 1.4; K.drawLod(S.rod, Tw, SO); SO.lime = 0; SO.a = 1.25; }
const sat = { pose, draw, occlude, drawRod, S, CAN_C, HB, ZB0, ZB1, ZBC, PW, PL, WZ, SL, RC1, HH, COIL_Z, CAPM_C, CONT_X, WHEEL_P, LIGHTS, DR_Y, DR_R, DZ0, DZ1, DISH_Z, pivot, axR };

/* ======================= the carrier's island radars =======================
   Frames: origin on the rotation axis at the turntable, +Y up, +Z the boresight (face normal, level) */
const LVR = [.03, .06, .12, .24, .48];
const lp = (P, seed, lv, cs) => K.lodPrims(P, lv || LVR, seed, cs || .8);
const ringZ = (z, r, n, o) => G.line(circ([0, 0, z], [1, 0, 0], [0, 1, 0], r, n || 64), Object.assign({ closed: true, ds: .5 }, o || {}));
const tilt = 15 * DEG, FW = 2.6, FH = 4.8;
const faceP = (x, v) => [x, .15 + v * Math.cos(tilt), .95 - v * Math.sin(tilt)];
const P48 = (() => {
  const P = [];
  P.push(G.hex([faceP(-FW, 0), faceP(FW, 0), V.add(faceP(FW, 0), [0, 0, -.12]), V.add(faceP(-FW, 0), [0, 0, -.12]), faceP(-FW, FH), faceP(FW, FH), V.add(faceP(FW, FH), [0, 0, -.12]), V.add(faceP(-FW, FH), [0, 0, -.12])]));
  P.push(G.panel([faceP(-FW, 0), faceP(FW, 0), faceP(FW, FH), faceP(-FW, FH)].map(p => V.add(p, [0, .03 * Math.sin(tilt), .03 * Math.cos(tilt)]))));
  for (let k = 0; k <= 36; k++) { const v = .1 + (FH - .2) * k / 36, a = faceP(-FW + .08, v), b = faceP(FW - .08, v); P.push(G.line([V.add(a, [0, .01, .06]), V.add(b, [0, .01, .06])], { ds: .45 })); }
  for (const [a, b] of [[faceP(-FW, 0), faceP(FW, 0)], [faceP(-FW, FH), faceP(FW, FH)], [faceP(-FW, 0), faceP(-FW, FH)], [faceP(FW, 0), faceP(FW, FH)]]) P.push(G.line([V.add(a, [0, 0, .07]), V.add(b, [0, 0, .07])], { ds: .3 }));
  const sp = []; for (let k = 0; k <= 40; k++) { const v = FH * k / 40, p = faceP(-FW - .12 - (k % 2 ? .38 : 0), v); sp.push(V.add(p, [0, 0, -.3])); }
  P.push(G.line(sp, { ds: .35 }));
  P.push(G.box(V.add(faceP(-FW - .6, 0), [0, -.1, -.5]), V.add(faceP(-FW - .05, .25), [0, 0, -.1])));
  for (const x of [-1.9, 1.9]) for (const v of [1.2, 3.8]) P.push(G.line([[x * .45, .1, -.3], V.add(faceP(x, v), [0, 0, -.14])], { ds: .4 }));
  P.push(G.line([V.add(faceP(-1.9, 2.5), [0, 0, -.14]), V.add(faceP(1.9, 2.5), [0, 0, -.14])], { ds: .4 }));
  P.push(G.box(V.add(faceP(-FW - .2, FH), [0, .08, -.25]), V.add(faceP(FW + .2, FH), [0, .32, -.05])));
  P.push(G.cyl([0, -.2, 0], [0, .1, 0], 1.05, { caps: true, n: 30 }));
  return P;
})();
const P48B = [G.cyl([0, -1.3, 0], [0, -.2, 0], .55, { n: 20 }), G.cyl([0, -1.45, 0], [0, -1.3, 0], 1.4, { caps: true, n: 30 })];
const P49 = (() => {
  const P = [], f = 3.5, zc = x => -1.2 + x * x / (4 * f), yc = y => (y - 2.5) * (y - 2.5) / 30;
  const xs = []; for (let k = 0; k <= 12; k++) xs.push(-3.65 + 7.3 * k / 12);
  for (let k = 0; k < 12; k++) { const x0 = xs[k], x1 = xs[k + 1]; for (let j = 0; j < 4; j++) { const y0 = .4 + 4.3 * j / 4, y1 = .4 + 4.3 * (j + 1) / 4; P.push(G.panel([[x0, y0, zc(x0) + yc(y0)], [x1, y0, zc(x1) + yc(y0)], [x1, y1, zc(x1) + yc(y1)], [x0, y1, zc(x0) + yc(y1)]], { ds: 1.6 })); } }
  for (const x of xs) { const p = []; for (let j = 0; j <= 10; j++) { const y = .4 + 4.3 * j / 10; p.push([x, y, zc(x) + yc(y) - .02]); } P.push(G.line(p, { ds: .4 })); }
  for (const y of [.4, 2.55, 4.7]) { const p = xs.map(x => [x, y, zc(x) + yc(y) - .03]); P.push(G.line(p, { ds: .4 })); }
  P.push(G.line([[0, .6, -1.2], [0, 1.9, 2.25]], { ds: .3 }), G.line([[-.8, .5, -1.1], [0, 1.9, 2.25]], { ds: .4 }), G.line([[.8, .5, -1.1], [0, 1.9, 2.25]], { ds: .4 }));
  P.push(G.box([-.28, 1.7, 2.1], [.28, 2.2, 2.55]));
  P.push(G.cyl([0, -.3, -1.2], [0, .5, -1.2], .35, { n: 16 }), G.cyl([0, -.4, -1.2], [0, -.25, -1.2], .8, { caps: true, n: 24 }));
  return P;
})();
const radar = { s48: lp(P48, 471, LVR, .9), s48b: lp(P48B, 473, LVR, .9), s49: lp(P49, 475, LVR, 1), FACE_C: faceP(0, FH / 2), FH, FW, tilt };
return { sat, radar };
};
