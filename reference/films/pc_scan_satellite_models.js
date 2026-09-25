/* SCAN · SATELLITE models: the sleeper satellite and the carrier's island radars, as LOD point clouds in their own
   frames, with the poses as pure functions of a state object (no time inside).
   Satellite frame: +Z the emitter (boresight), +Y the top, +X starboard. A hexagonal bus 5.6 m long (six side panels
   that float apart for the exploded view), inside it the power core, six capacitor banks, four reaction wheels in a
   pyramid and two tanks; at the front the emitter collar with a six-petal nose cover and an eight-blade iris; three
   telescoping rails and seven charge rings stowed round the collar; two four-panel solar wings on yokes; two
   radiators, two magnetometer booms, the uplink dish (twelve ribs) and its horn on the belly; sixteen status lights.
   Radars (carrier island): AN/SPS-48E, the 3-D planar array (frequency-scanned slotted waveguide rows, the serpentine
   feed down one side, the IFF bar on top), and AN/SPS-49, the long-range 2-D reflector with its feed horn.
   window.SSAT(K) -> { sat: {...}, radar: {...} } */
window.SSAT = function (K) {
'use strict';
const { V, R, X, E } = M3, G = GEO, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const LV = [.035, .07, .14, .28, .56];
const lp = (P, seed, lv, cs) => K.lodPrims(P, lv || LV, seed, cs || .8);
const circ = (c, U, W, r, n) => { const p = []; for (let k = 0; k < n; k++) { const a = k / n * TAU; p.push(V.add(c, V.add(V.mul(U, Math.cos(a) * r), V.mul(W, Math.sin(a) * r)))); } return p; };
const ringZ = (z, r, n, o) => G.line(circ([0, 0, z], [1, 0, 0], [0, 1, 0], r, n || 64), Object.assign({ closed: true, ds: .5 }, o || {}));
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const rot = (Rm, p) => X.make(Rm, p || [0, 0, 0]);
/* rotation by angle a about unit axis ax through point h */
const axR = (ax, a) => K.Q.toR(K.Q.axis(ax, a));
const pivot = (ax, a, h) => { const Rm = axR(ax, a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };

/* ======================= the satellite ======================= */
const RB = 1.7, AP = RB * Math.cos(PI / 6), ZB0 = -3.0, ZB1 = 2.6;
const vtx = k => [RB * Math.cos((30 + 60 * k) * DEG), RB * Math.sin((30 + 60 * k) * DEG), 0];
const FACE_C = [0, 1, 2, 3, 4, 5].map(i => i * 60 * DEG);
const P_PANEL = (() => {
  const w = RB / 2 - .012, P = [G.box([-w, -.05, ZB0 + .02], [w, 0, ZB1 - .02])];
  for (const x of [-w * .36, w * .36]) P.push(G.line([[x, .01, ZB0 + .1], [x, .01, ZB1 - .1]], { ds: .45 }));
  for (let z = ZB0 + .45; z < ZB1 - .1; z += .7) P.push(G.line([[-w + .05, .01, z], [w - .05, .01, z]], { ds: .6 }));
  P.push(G.line([[-.36, .012, -2.2], [.36, .012, -2.2], [.36, .012, -1.0], [-.36, .012, -1.0]], { closed: true, ds: .4 }));
  P.push(G.line([[-w, .012, ZB0 + .04], [w, .012, ZB0 + .04], [w, .012, ZB1 - .04], [-w, .012, ZB1 - .04]], { closed: true, ds: .4 }));
  return P;
})();
const P_BULK = [G.cyl([0, 0, ZB0 - .06], [0, 0, ZB0], AP * .98, { caps: true }), ringZ(ZB0 - .07, AP * .7, 60), ringZ(ZB0 - .07, AP * .4, 40)];
for (const [x, y] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) P_BULK.push(G.lathe([x, y, ZB0 - .06], [0, 0, -1], [[0, .06], [.22, .16]], { n: 12 }));   // RCS nozzles
const P_COLLAR = [
  G.lathe([0, 0, ZB1], [0, 0, 1], [[0, 1.62], [.3, 1.62], [.36, 1.5], [1.3, 1.38], [1.6, 1.47]], { n: 60 }),
  G.lathe([0, 0, ZB1 + .3], [0, 0, 1], [[0, 1.3], [1.2, 1.3]], { n: 60 }),
  G.cyl([0, 0, 2.98], [0, 0, 3.02], 1.3, { caps: true }),
  ringZ(3.03, .45, 40), ringZ(3.03, .85, 56), ringZ(3.03, 1.15, 64), ringZ(ZB1 + .02, 1.64, 80), ringZ(4.2, 1.49, 80),
];
const P_CORE = (() => {
  const P = [G.cyl([0, 0, -1.3], [0, 0, 1.3], .5, { n: 40 })];
  P.push(G.lathe([0, 0, 1.3], [0, 0, 1], [[0, .5], [.2, .45], [.38, .28], [.48, 0]], { n: 40 }));
  P.push(G.lathe([0, 0, -1.3], [0, 0, -1], [[0, .5], [.2, .45], [.38, .28], [.48, 0]], { n: 40 }));
  for (let z = -1.15; z < 1.2; z += .13) P.push(ringZ(z, .54, 48, { ds: .4 }));
  P.push(G.lathe([0, 0, -.12], [0, 0, 1], [[0, .62], [.04, .8], [.12, .84], [.2, .8], [.24, .62]], { n: 50 }));
  return P;
})();
const P_CAP = [G.cyl([0, 0, -1.1], [0, 0, 1.1], .16, { caps: true, n: 16 }), ringZ(-.7, .17, 20), ringZ(0, .17, 20), ringZ(.7, .17, 20)];
const CAP_A = [0, 60, 120, 180, 240, 300].map(d => (d + 30) * DEG);
const P_WHEEL = (() => {
  const P = [G.lathe([0, 0, -.07], [0, 0, 1], [[0, .34], [.14, .34]], { n: 36 }), G.lathe([0, 0, -.05], [0, 0, 1], [[0, .27], [.1, .27]], { n: 30 })];
  P.push(G.cyl([0, 0, -.015], [0, 0, .015], .27, { caps: true }), G.cyl([0, 0, -.15], [0, 0, .15], .06, { caps: true }));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(G.line([[.07 * Math.cos(a), .07 * Math.sin(a), .02], [.27 * Math.cos(a), .27 * Math.sin(a), .02]], { ds: .3 })); }
  P.push(G.box([.28, -.05, -.08], [.36, .05, .08]));
  return P;
})();
const WHEEL_P = [45, 135, 225, 315].map(d => { const a = d * DEG; return { c: [.78 * Math.cos(a), .78 * Math.sin(a), -2.25], ax: V.norm([Math.cos(a) * .57, Math.sin(a) * .57, .82]) }; });
const P_TANK = [G.lathe([0, 0, -.42], [0, 0, 1], [[0, 0], [.06, .21], [.16, .34], [.42, .42], [.68, .34], [.78, .21], [.84, 0]], { n: 30 }), ringZ(0, .43, 36)];
const TANK_P = [[-.72, 0, 1.95], [.72, 0, 1.95]];
// nose petals (closed cone: rim r 1.47 at z 4.2 to the tip at z 5.35), petal 0 centred on +X
const PET_H = [1.47, 0, 4.2];
const P_PETAL = (() => {
  const tip = [0, 0, 5.35], a0 = -29 * DEG, a1 = 29 * DEG;
  const p1 = [1.47 * Math.cos(a0), 1.47 * Math.sin(a0), 4.2], p2 = [1.47 * Math.cos(a1), 1.47 * Math.sin(a1), 4.2];
  const m1 = V.lerp(p1, tip, .96), m2 = V.lerp(p2, tip, .96);
  const n = V.norm([1, 0, 1.47 / 1.15]), th = .03, o = p => V.mad(p, n, th);
  const P = [G.hex([p1, p2, m2, m1, o(p1), o(p2), o(m2), o(m1)], { bottom: true })];
  P.push(G.line([V.mad(V.lerp(p1, p2, .5), n, th + .01), V.mad(V.lerp(m1, m2, .5), n, th + .01)], { ds: .35 }));
  P.push(G.line([o(p1), o(m1)], { ds: .4 }), G.line([o(p2), o(m2)], { ds: .4 }));
  for (const f of [.3, .6]) P.push(G.line([o(V.lerp(p1, tip, f)), o(V.lerp(p2, tip, f))], { ds: .5 }));
  return P;
})();
const PETAL_AX = [0, 1, 0];
// iris blades at z 3.6, blade 0 pivoting at +X
const IRIS_PV = [1.24, 0, 3.6];
const P_BLADE = [G.panel([[1.3, -.2, 3.6], [1.3, .24, 3.6], [-.04, .52, 3.6], [-.04, .02, 3.6]]), G.line([[1.3, .24, 3.61], [-.04, .52, 3.61]], { ds: .35 })];
// charge ring (all seven alike)
const RR = 1.78;
const P_RING = (() => {
  const P = [G.lathe([0, 0, -.1], [0, 0, 1], [[0, RR], [.2, RR]], { n: 90 }), G.lathe([0, 0, -.07], [0, 0, 1], [[0, RR - .13], [.14, RR - .13]], { n: 80 })];
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * TAU, c = Math.cos(a), s = Math.sin(a), r0 = RR - .02, r1 = RR + .09, w = .05;
    P.push(G.hex([[r0 * c - w * s, r0 * s + w * c, -.11], [r0 * c + w * s, r0 * s - w * c, -.11], [r0 * c + w * s, r0 * s - w * c, .11], [r0 * c - w * s, r0 * s + w * c, .11], [r1 * c - w * s, r1 * s + w * c, -.11], [r1 * c + w * s, r1 * s - w * c, -.11], [r1 * c + w * s, r1 * s - w * c, .11], [r1 * c - w * s, r1 * s + w * c, .11]]));
  }
  P.push(G.box([RR + .09, -.12, -.12], [RR + .2, .12, .12]));
  return P;
})();
const RING_STOW = j => 2.72 + .11 * j, RING_DEP = j => 5.1 + 1.12 * j;
// rails: three, four telescoping sections each
const RAIL_A = [90, 210, 330].map(d => d * DEG), RAIL_R = 2.0, RAIL_L = 2.6;
const P_RAIL = [0, 1, 2, 3].map(j => { const w = .075 - .012 * j; return [G.box([-w, -w, 0], [w, w, RAIL_L]), G.line([[-w - .01, w + .01, .1], [-w - .01, w + .01, RAIL_L - .1]], { ds: .4 }), G.box([-w - .02, -w - .02, RAIL_L - .08], [w + .02, w + .02, RAIL_L])]; });
// solar wing panel (deployed plane XZ, spans +X from the hinge)
const PW = 2.5, PL = 3.8;
const P_WING = (() => {
  const P = [G.box([0, -.025, -PL / 2], [PW, 0, PL / 2], { bottom: true })];
  for (let x = PW / 5; x < PW - .01; x += PW / 5) P.push(G.line([[x, .006, -PL / 2 + .03], [x, .006, PL / 2 - .03]], { ds: .45 }));
  for (let z = -PL / 2 + PL / 8; z < PL / 2 - .01; z += PL / 8) P.push(G.line([[.03, .006, z], [PW - .03, .006, z]], { ds: .55 }));
  P.push(G.line([[0, .008, -PL / 2], [PW, .008, -PL / 2], [PW, .008, PL / 2], [0, .008, PL / 2]], { closed: true, ds: .35 }));
  return P;
})();
const P_YOKE = [G.box([0, -.05, -.05], [1.0, .05, .05]), G.box([.95, -.08, -.9], [1.05, .08, .9]), G.line([[0, 0, 0], [1, 0, -.85]], { ds: .4 }), G.line([[0, 0, 0], [1, 0, .85]], { ds: .4 })];
// radiators: hinged at the belly vertex, span +X in their plane
const RAD_Z0 = -.6, RAD_Z1 = 2.3;
const P_RAD = (() => { const P = [G.box([0, -.02, RAD_Z0], [1.5, 0, RAD_Z1], { bottom: true })]; for (let x = .2; x < 1.5; x += .22) P.push(G.line([[x, .006, RAD_Z0 + .05], [x, .006, RAD_Z1 - .05]], { ds: .45 })); return P; })();
// magnetometer booms: four sections along +Z, a sensor head
const P_BOOM = [0, 1, 2, 3].map(j => { const r = .07 - .012 * j; return [G.cyl([0, 0, 0], [0, 0, 1.5], r, { n: 10 }), ringZ(1.46, r + .015, 14)]; });
const P_HEAD = [G.box([-.12, -.12, 0], [.12, .12, .3]), G.cyl([0, 0, .3], [0, 0, .42], .08, { caps: true, n: 12 })];
const BOOM_B = [[.9, .9, ZB0 + .05], [-.9, .9, ZB0 + .05]], BOOM_D = [V.norm([.55, .45, -1]), V.norm([-.55, .45, -1])];
// uplink dish on the belly (axis -Y), twelve ribs that open like an umbrella, a mesh, the feed; the dormant horn
const DISH_C = [0, -RB - .85, -2.25], DF = .75, DR = 1.35;
const P_DMAST = [G.cyl([0, -RB + .1, -2.25], [0, -RB - .85, -2.25], .09, { n: 10 }), G.cyl([0, -RB - .8, -2.25], [0, -RB - .9, -2.25], .2, { caps: true })];
const P_RIB = [G.line((() => { const p = []; for (let k = 0; k <= 14; k++) { const r = .12 + (DR - .12) * k / 14; p.push([r, -r * r / (4 * DF), 0]); } return p; })(), { ds: .3 })];
const P_MESH = [G.lathe([0, 0, 0], [0, -1, 0], (() => { const s = []; for (let k = 0; k <= 8; k++) { const r = .12 + (DR - .12) * k / 8; s.push([r * r / (4 * DF), r]); } return s; })(), { n: 60 })];
const P_FEED = [G.line([[.1, 0, .1], [0, -DF, 0]], { ds: .4 }), G.line([[-.1, 0, .1], [0, -DF, 0]], { ds: .4 }), G.line([[0, 0, -.12], [0, -DF, 0]], { ds: .4 }), G.lathe([0, -DF + .05, 0], [0, 1, 0], [[0, .03], [.14, .09]], { n: 12 })];
const P_HORN = [G.cyl([0, -RB + .05, -.9], [0, -RB - .12, -.9], .07, { n: 10 }), G.lathe([0, -RB - .12, -.9], [0, -1, 0], [[0, .07], [.3, .2]], { n: 16 })];
// status lights: sixteen along the two top faces near the ridge
const LIGHTS = [];
for (let k = 0; k < 16; k++) {
  const f = k % 2 ? 0 : 2, a = vtx(1), b = vtx(f), p = V.add(a, V.mul(V.sub(b, a), .14));
  const fc = f ? FACE_C[2] : FACE_C[1];
  LIGHTS.push([p[0] + Math.cos(fc) * .03, p[1] + Math.sin(fc) * .03, -2.6 + .32 * k]);
}

const LVF = [.05, .1, .2, .4, .8];
const S = {
  panel: lp(P_PANEL, 401), bulk: lp(P_BULK, 403), collar: lp(P_COLLAR, 405), core: lp(P_CORE, 407, null, .5), cap: lp(P_CAP, 409, null, .6),
  wheel: lp(P_WHEEL, 411, [.02, .04, .08, .16, .32], .5), tank: lp(P_TANK, 413), petal: lp(P_PETAL, 415), blade: lp(P_BLADE, 417),
  ring: lp(P_RING, 419, null, .7), rail: P_RAIL.map((P, j) => lp(P, 421 + j * 3, null, .9)), wing: lp(P_WING, 431, LVF, 1.2), yoke: lp(P_YOKE, 433),
  rad: lp(P_RAD, 435, LVF, 1), boom: P_BOOM.map((P, j) => lp(P, 437 + j * 3)), head: lp(P_HEAD, 449), dmast: lp(P_DMAST, 451), rib: lp(P_RIB, 453, [.02, .04, .08, .16, .32]),
  mesh: lp(P_MESH, 455), feed: lp(P_FEED, 457), horn: lp(P_HORN, 459),
};

/* pose: world transforms of every piece at state st (see SAT_ST) under the satellite's world transform W */
const PO = { panels: [], caps: [], wheels: [], tanks: [], petals: [], blades: [], rings: [], rails: [], wings: [], yokes: [], rads: [], booms: [], heads: [], ribs: [], lights: [] };
function pose(W, st) {
  const ex = st.ex || 0;
  PO.W = W;
  // bus panels, floating out in the exploded view (each a little differently)
  PO.panels.length = 0;
  for (let i = 0; i < 6; i++) {
    const c = FACE_C[i], d = ex * (1.5 + .25 * (i % 3)), tilt = ex * (i % 2 ? .12 : -.1);
    const L = X.mul(rot(R.z(c - PI / 2), [(AP + d) * Math.cos(c), (AP + d) * Math.sin(c), ex * .3 * (i - 2.5)]), rot(R.x(tilt)));
    PO.panels.push(X.mul(W, L));
  }
  PO.bulk = X.mul(W, tr(0, 0, -1.1 * ex));
  PO.collar = X.mul(W, tr(0, 0, .9 * ex));
  PO.core = X.mul(W, rot(R.z(st.coreSpin || 0)));
  PO.caps.length = 0;
  for (let i = 0; i < 6; i++) { const a = CAP_A[i], r = 1.08 + .6 * ex; PO.caps.push(X.mul(W, tr(r * Math.cos(a), r * Math.sin(a), 0))); }
  PO.wheels.length = 0;
  for (let i = 0; i < 4; i++) { const w = WHEEL_P[i], c = V.add(w.c, [w.c[0] * .5 * ex, w.c[1] * .5 * ex, -1.3 * ex]); PO.wheels.push(X.mul(W, X.mul(rot(R.look(w.ax, [0, 0, 1]), c), rot(R.z((st.wheel || 0) * (i % 2 ? -1 : 1) + i))))); }
  PO.tanks.length = 0;
  for (const p of TANK_P) PO.tanks.push(X.mul(W, tr(p[0] * (1 + .5 * ex), p[1], p[2] + 1.2 * ex)));
  // nose petals peel back about their rim hinges
  PO.petals.length = 0;
  for (let i = 0; i < 6; i++) PO.petals.push(X.mul(W, X.mul(X.mul(tr(0, 0, .9 * ex), rot(R.z(i * PI / 3))), pivot(PETAL_AX, (st.petal ? st.petal[i] : 0) * 152 * DEG, PET_H))));
  // iris blades swing out about their pivots
  PO.blades.length = 0;
  for (let i = 0; i < 8; i++) PO.blades.push(X.mul(W, X.mul(X.mul(tr(0, 0, .9 * ex), rot(R.z(i * PI / 4 + .2))), pivot([0, 0, 1], -(st.iris || 0) * 50 * DEG, IRIS_PV))));
  // rails telescope forward, rings slide out along them
  PO.rails.length = 0;
  const re = st.rails || 0;
  for (let r = 0; r < 3; r++) { const a = RAIL_A[r]; for (let j = 0; j < 4; j++) PO.rails.push(X.mul(W, tr(RAIL_R * Math.cos(a), RAIL_R * Math.sin(a), ZB1 + j * .06 + re * j * (RAIL_L - .15) + .9 * ex))); }
  PO.rings.length = 0;
  for (let j = 0; j < 7; j++) { const u = st.ring ? st.ring[j] : 0, z = RING_STOW(j) + (RING_DEP(j) - RING_STOW(j)) * u; PO.rings.push(X.mul(W, rot(R.z((st.ringSpin || 0) * (j % 2 ? -1 : 1) * u + j * .7), [0, 0, z + .9 * ex]))); }
  PO.ringZ = j => { const u = st.ring ? st.ring[j] : 0; return RING_STOW(j) + (RING_DEP(j) - RING_STOW(j)) * u + .9 * ex; };
  // solar wings: the yoke slides out, then the four-panel accordion opens
  PO.wings.length = 0; PO.yokes.length = 0;
  const f = 1 - (st.wing || 0), yk = st.yoke || 0;
  for (const s of [1, -1]) {
    const base = X.mul(W, X.mul(rot(s > 0 ? R.I() : R.z(PI)), tr(AP + ex * 1.6, 0, -.2)));
    PO.yokes.push(X.mul(base, tr(-.95 + .95 * yk, 0, 0)));
    let Tk = X.mul(base, X.mul(tr(.1 + .95 * yk, -1.25 * f, 0), rot(R.z(PI / 2 * f))));
    PO.wings.push(Tk);
    for (let j = 1; j < 4; j++) { Tk = X.mul(Tk, X.mul(tr(PW, 0, 0), rot(R.z((j % 2 ? -1 : 1) * PI * f * .985)))); PO.wings.push(Tk); }
  }
  // radiators: hinged at the belly vertex, stowed along the lower faces
  PO.rads.length = 0;
  const rd = st.rad || 0;
  PO.rads.push(X.mul(W, rot(R.z((30 - 75 * rd) * DEG), [0, -RB - ex * .8, 0])));
  PO.rads.push(X.mul(W, rot(R.z((150 + 75 * rd) * DEG), [0, -RB - ex * .8, 0])));
  // booms
  PO.booms.length = 0; PO.heads.length = 0;
  const be = st.boom || 0;
  for (let b = 0; b < 2; b++) {
    const B = X.mul(W, X.mul(tr(0, 0, -1.1 * ex), rot(R.look(BOOM_D[b], [0, 1, 0]), BOOM_B[b])));
    for (let j = 0; j < 4; j++) PO.booms.push(X.mul(B, tr(0, 0, j * .05 + be * j * 1.4)));
    PO.heads.push(X.mul(B, tr(0, 0, 1.5 + be * 3 * 1.4)));
  }
  // dish
  const dsh = st.dish || 0;
  PO.dmast = X.mul(W, tr(0, -ex * .8, -1.1 * ex));
  const DC = X.mul(PO.dmast, tr(DISH_C[0], DISH_C[1], DISH_C[2]));
  PO.dish = DC;
  PO.ribs.length = 0;
  for (let k = 0; k < 12; k++) PO.ribs.push(X.mul(DC, X.mul(rot(R.y(k * PI / 6)), rot(R.z(-(1 - dsh) * 78 * DEG)))));
  PO.horn = X.mul(W, tr(0, -ex * .8, 0));
  PO.lights.length = 0;
  for (const p of LIGHTS) PO.lights.push(X.ap(W, p));
  PO.aperture = X.ap(W, [0, 0, 3.05 + .9 * ex]);
  PO.hornTip = X.ap(W, [0, -RB - .4, -.9]);
  return PO;
}
/* model-space point of a world point under a transform (for the lime ripple origin per cloud) */
const inv = (Tw, p, o) => { const M = Tw.R, dx = p[0] - Tw.T[0], dy = p[1] - Tw.T[1], dz = p[2] - Tw.T[2]; o.x = M[0] * dx + M[3] * dy + M[6] * dz; o.y = M[1] * dx + M[4] * dy + M[7] * dz; o.z = M[2] * dx + M[5] * dy + M[8] * dz; return o; };
const SO = { a: 1.3, fade: 400, lime: 0, keep: 1, px: 4.2, px0: 26, rev: null, tint: null, tk: 0, back: .12 };
const REV = { x: 0, y: 0, z: 0, age: 0, v: 5, pre: 1, after: 0 };
/* draw the satellite. o: { xr (X-ray 0..1: skin thins, insides lime), rip: {p: world, age, v} (lime ripple), lime (all),
   core (core lime 0..1), ringLit [7], dish (mesh visibility) } */
function draw(P, st, o) {
  const xr = o.xr || 0, rip = o.rip;
  const put = (ml, Tw, lime, keep, a) => {
    SO.lime = Math.min(1, (lime || 0) + (o.lime || 0)); SO.keep = keep === undefined ? 1 : keep; SO.a = a === undefined ? 1.3 : a;
    if (rip && rip.age > -.2 && rip.age < 4) { inv(Tw, rip.p, REV); REV.age = rip.age; REV.v = rip.v; REV.after = rip.after || 0; SO.rev = REV; } else SO.rev = null;
    K.drawLod(ml, Tw, SO);
  };
  const skinK = 1 - .8 * xr, skinL = .15 * xr;
  for (const T of P.panels) put(S.panel, T, skinL, skinK);
  put(S.bulk, P.bulk, skinL, 1 - .5 * xr);
  put(S.collar, P.collar, .05 * xr);
  // insides: only drawn while the skin is thinned or apart
  const inside = Math.max(xr, st.ex || 0);
  if (inside > .02) {
    const a = 1.3 * Math.min(1, inside * 1.6);
    put(S.core, P.core, .55 + .45 * (o.core || 0), 1, a);
    for (const T of P.caps) put(S.cap, T, .4, 1, a);
    for (const T of P.wheels) put(S.wheel, T, .5, 1, a);
    for (const T of P.tanks) put(S.tank, T, .2, 1, a);
  }
  for (const T of P.petals) put(S.petal, T, 0);
  for (const T of P.blades) put(S.blade, T, 0, 1, 1.1);
  for (let k = 0; k < P.rails.length; k++) put(S.rail[k % 4], P.rails[k], 0);
  for (let j = 0; j < 7; j++) put(S.ring, P.rings[j], o.ringLit ? o.ringLit[j] : 0, 1, 1.7);
  for (const T of P.yokes) put(S.yoke, T, 0);
  for (const T of P.wings) put(S.wing, T, o.wingLit || 0);
  for (const T of P.rads) put(S.rad, T, 0);
  for (let k = 0; k < P.booms.length; k++) put(S.boom[k % 4], P.booms[k], 0);
  for (const T of P.heads) put(S.head, T, 0);
  put(S.dmast, P.dmast, 0);
  for (const T of P.ribs) put(S.rib, T, .1);
  const dm = E.ss(.8, 1, st.dish || 0);
  if (dm > .01) put(S.mesh, P.dish, 0, dm);
  if ((st.dish || 0) > .9) put(S.feed, P.dish, 0, 1);
  put(S.horn, P.horn, o.hornLit || 0);
  SO.rev = null; SO.lime = 0; SO.keep = 1; SO.a = 1.3;
}
const sat = { pose, draw, S, RB, AP, ZB0, ZB1, RR, RING_DEP, RING_STOW, PW, PL, LIGHTS, WHEEL_P, CAP_A, TANK_P, pivot, axR,
  // model-space boxes for the part tags
  BOX: {
    core: [[-.84, -.84, -1.8], [.84, .84, 1.8]], wheels: [[-1.15, -1.15, -2.6], [1.15, 1.15, -1.9]], caps: [[-1.3, -1.3, -1.1], [1.3, 1.3, 1.1]],
    wing: [[0, -.03, -PL / 2], [PW * 4, .03, PL / 2]], rings: [[-RR - .2, -RR - .2, -.12], [RR + .2, RR + .2, .12]], dish: [[-DR, -DF - .1, -DR], [DR, .1, DR]],
  },
};

/* ======================= the carrier's island radars =======================
   Frames: origin on the rotation axis at the turntable, +Y up, +Z the boresight (face normal, level) */
const LVR = [.03, .06, .12, .24, .48];
const tilt = 15 * DEG, FW = 2.6, FH = 4.8;
const faceP = (x, v) => [x, .15 + v * Math.cos(tilt), .95 - v * Math.sin(tilt)];      // v along the face, 0..FH
const P48 = (() => {
  const P = [];
  P.push(G.hex([faceP(-FW, 0), faceP(FW, 0), V.add(faceP(FW, 0), [0, 0, -.12]), V.add(faceP(-FW, 0), [0, 0, -.12]), faceP(-FW, FH), faceP(FW, FH), V.add(faceP(FW, FH), [0, 0, -.12]), V.add(faceP(-FW, FH), [0, 0, -.12])]));
  P.push(G.panel([faceP(-FW, 0), faceP(FW, 0), faceP(FW, FH), faceP(-FW, FH)].map(p => V.add(p, [0, .03 * Math.sin(tilt), .03 * Math.cos(tilt)]))));
  // slotted waveguide rows across the face
  for (let k = 0; k <= 36; k++) { const v = .1 + (FH - .2) * k / 36, a = faceP(-FW + .08, v), b = faceP(FW - .08, v); P.push(G.line([V.add(a, [0, .01, .06]), V.add(b, [0, .01, .06])], { ds: .45 })); }
  // frame
  for (const [a, b] of [[faceP(-FW, 0), faceP(FW, 0)], [faceP(-FW, FH), faceP(FW, FH)], [faceP(-FW, 0), faceP(-FW, FH)], [faceP(FW, 0), faceP(FW, FH)]]) P.push(G.line([V.add(a, [0, 0, .07]), V.add(b, [0, 0, .07])], { ds: .3 }));
  // the serpentine feed down the port side, behind the face
  const sp = []; for (let k = 0; k <= 40; k++) { const v = FH * k / 40, p = faceP(-FW - .12 - (k % 2 ? .38 : 0), v); sp.push(V.add(p, [0, 0, -.3])); }
  P.push(G.line(sp, { ds: .35 }));
  P.push(G.box(V.add(faceP(-FW - .6, 0), [0, -.1, -.5]), V.add(faceP(-FW - .05, .25), [0, 0, -.1])));
  // back truss to the turntable
  for (const x of [-1.9, 1.9]) for (const v of [1.2, 3.8]) P.push(G.line([[x * .45, .1, -.3], V.add(faceP(x, v), [0, 0, -.14])], { ds: .4 }));
  P.push(G.line([V.add(faceP(-1.9, 2.5), [0, 0, -.14]), V.add(faceP(1.9, 2.5), [0, 0, -.14])], { ds: .4 }));
  // IFF bar on top
  P.push(G.box(V.add(faceP(-FW - .2, FH), [0, .08, -.25]), V.add(faceP(FW + .2, FH), [0, .32, -.05])));
  // turntable
  P.push(G.cyl([0, -.2, 0], [0, .1, 0], 1.05, { caps: true, n: 30 }));
  return P;
})();
const P48B = [G.cyl([0, -1.3, 0], [0, -.2, 0], .55, { n: 20 }), G.cyl([0, -1.45, 0], [0, -1.3, 0], 1.4, { caps: true, n: 30 })];
const P49 = (() => {
  const P = [], f = 3.5, zc = x => -1.2 + x * x / (4 * f), yc = y => (y - 2.5) * (y - 2.5) / 30;
  const xs = []; for (let k = 0; k <= 12; k++) xs.push(-3.65 + 7.3 * k / 12);
  for (let k = 0; k < 12; k++) {
    const x0 = xs[k], x1 = xs[k + 1];
    for (let j = 0; j < 4; j++) { const y0 = .4 + 4.3 * j / 4, y1 = .4 + 4.3 * (j + 1) / 4; P.push(G.panel([[x0, y0, zc(x0) + yc(y0)], [x1, y0, zc(x1) + yc(y0)], [x1, y1, zc(x1) + yc(y1)], [x0, y1, zc(x0) + yc(y1)]], { ds: 1.6 })); }
  }
  for (const x of xs) { const p = []; for (let j = 0; j <= 10; j++) { const y = .4 + 4.3 * j / 10; p.push([x, y, zc(x) + yc(y) - .02]); } P.push(G.line(p, { ds: .4 })); }
  for (const y of [.4, 2.55, 4.7]) { const p = xs.map(x => [x, y, zc(x) + yc(y) - .03]); P.push(G.line(p, { ds: .4 })); }
  P.push(G.line([[0, .6, -1.2], [0, 1.9, 2.25]], { ds: .3 }), G.line([[-.8, .5, -1.1], [0, 1.9, 2.25]], { ds: .4 }), G.line([[.8, .5, -1.1], [0, 1.9, 2.25]], { ds: .4 }));
  P.push(G.box([-.28, 1.7, 2.1], [.28, 2.2, 2.55]));
  P.push(G.cyl([0, -.3, -1.2], [0, .5, -1.2], .35, { n: 16 }), G.cyl([0, -.4, -1.2], [0, -.25, -1.2], .8, { caps: true, n: 24 }));
  return P;
})();
const radar = {
  s48: lp(P48, 471, LVR, .9), s48b: lp(P48B, 473, LVR, .9), s49: lp(P49, 475, LVR, 1),
  FACE_C: faceP(0, FH / 2), FH, FW, tilt,
};
return { sat, radar };
};
