/* ORBITAL RAILGUN platform (window.ORP(ORL) -> the model): a railgun platform about three times the ISS, built from
   the procedural lattice bodies of pc_orbital_railgun_lat.js. Every pose is a pure function of a state object.

   Frame: metres, +Z along the bore toward the muzzle, +Y the top (zenith while parked), +X starboard; origin on the
   bore where the barrel truss starts.
     Barrel truss  z 0..250, 5.2 m square, 50 bays of 5 m: four longerons, battens, face diagonals, node plates;
                   inside the twin rails (top and bottom of the bore), a coil ring every metre (250), a rail clamp
                   frame at every node, four cooling lines and two bus bars, manifolds every 25 m, a cable tray
                   under it. Four lattice masts at z 5 (top, bottom, port, starboard) hold stay cables to the barrel.
     Muzzle        z 244..253: a collar frame, the crown, a six-petal iris, four RCS quads.
     Core truss    z -45.5..0, 13 m square, 7 bays: the breech (chamber housing, sliding block), the transfer cage,
                   the eight-cell revolver magazine (rods 6 m, closed shells), the three-stage rammer, equipment
                   boxes on the faces; four capacitor modules (7.2 m x 34 m) on the diagonals, a node with a
                   docking port on top, an aft node with star trackers, a dish and RCS quads.
     Cross truss   along X at z -24, 9 m square, to x +-168: radiator wings (8 accordion panels, 13 x 7.5 m) at
                   x +-33.5 and +-69.5 hanging nadir; alpha joints at x +-90.5; outboard of them two wing pairs a
                   side (x +-111.5, +-151.5): each wing a beta gimbal, a 98 m mast and two 6.5 m blankets. The
                   robotic arm (two 24 m booms, seven joints) rides on top at x 22. Dishes, RCS quads at the ends.
   Effect channels (ch, q) for the film's callback: 1 coil ring (q = z), 2 rails / bus (q = z), 3 status light
   (q = index), 4 array blanket (q = wing*2+blanket), 5 capacitor segment (q = module*16+segment), 6 radiator
   panel (q = rad*8+panel), 7 muzzle (q 0), 8 magazine rod (q = cell), 9 breech (q 0). */
window.ORP = function (L) {
'use strict';
const { V, R, X, E } = M3, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const { Body } = L;
const XA = [1, 0, 0], YA = [0, 1, 0], ZA = [0, 0, 1];
const perp = L.perp;

/* ---------------- dimensions ---------------- */
const BZ1 = 250, BH = 2.6, BAY = 5, NB = 50;            // barrel truss
const CZ0 = -45.5, CH = 6.5, CBAY = 6.5;                // core truss
const XZ = -24, XH = 4.5, XB = 9;                       // cross truss: z centre, half size, bay
const XI0 = CH, XI1 = 87.5, XAJ = 90.5, XO0 = 93.5, XO1 = 165.5, XEND = 168;
const WX = [111.5, 151.5];                              // wing pair axes (outboard, |x|)
const WR0 = 9, WR1 = 107;                               // wing root / tip distance from the truss axis
const BLW = 6.5, BLG = .9;                              // blanket width, gap from the mast axis
const RADX = [33.5, 69.5], RPW = 13, RPH = 7.5, NRP = 8; // radiators
const MODS = [[10.6, 10.6], [-10.6, 10.6], [10.6, -10.6], [-10.6, -10.6]], MR = 3.6, MZ0 = -44, MZ1 = -10;
const DRUM_Y = -2.4, DRUM_R = 2.4, DRUM_Z0 = -36, DRUM_Z1 = -28, NCELL = 8, ROD_L = 6, ROD_R = .25;
const CHAMBER = [-14, 0], BLOCK_Z = [-16.2, -14.2], RAM_Z0 = -45, ROD_Z_DRUM = -32, ROD_Z_CH = -7.2;
const MAST_Z = 5, MAST_H = 44;
const ARM_BASE = [22, XH, XZ];

/* ---------------- helpers ---------------- */
const sq = (B, c, U, W, h, br, ch, q) => { const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => V.add(c, V.add(V.mul(U, i * h), V.mul(W, j * h)))); B.poly(P, true, br, ch, q); };
/* a square lattice truss along unit axis ax from a (length len), side axes u, w, half size h, bays n */
function truss(B, a, ax, u, w, h, len, n, o) {
  o = o || {};
  const rL = o.rL || .3, rB = o.rB || .16, rD = o.rD || .12, kn = o.kn || 1, tag = o.tag || 'tr';
  const C4 = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const P = (s, i) => V.add(V.mad(a, ax, s), V.add(V.mul(u, C4[i][0] * h), V.mul(w, C4[i][1] * h)));
  for (let b = 0; b < n; b++) {
    if (o.skipBay && o.skipBay(b)) continue;
    B.chunk(tag + b);
    const s0 = len * b / n, s1 = len * (b + 1) / n;
    for (let i = 0; i < 4; i++) {
      if (!(o.noL && o.noL(i))) B.tube(P(s0, i), P(s1, i), rL, .62);
      if (!(o.noB && o.noB(i))) B.tube(P(s0, i), P(s0, (i + 1) % 4), rB, .5);
      // face diagonal (alternating)
      if (!(o.noD && o.noD(i))) { const f = (b + i) % 2; B.tube(P(f ? s0 : s1, i), P(f ? s1 : s0, (i + 1) % 4), rD, .42); }
      B.knot(P(s0, i), kn, .85);
    }
    if (b === n - 1) for (let i = 0; i < 4; i++) { if (!(o.noB && o.noB(i))) B.tube(P(s1, i), P(s1, (i + 1) % 4), rB, .5); B.knot(P(s1, i), kn, .85); }
  }
}
/* an equipment box with lid seams and a handrail */
function eqBox(B, c, ax, ay, az, h, o) {
  o = o || {};
  B.obox(c, ax, ay, az, h, o.cell || .06, { br: o.br || .9, edge: .7, skip: o.skip });
  const top = V.mad(c, ay, h[1] * 1.004);
  for (let k = 1; k < 4; k++) { const z = -h[2] + 2 * h[2] * k / 4; B.line(V.add(V.mad(top, az, z), V.mul(ax, -h[0])), V.add(V.mad(top, az, z), V.mul(ax, h[0])), .4, 0, 0, h[2] * .5); }
  B.line(V.add(V.mad(top, ax, -h[0] * .6), V.mul(az, -h[2] * .8)), V.add(V.mad(top, ax, -h[0] * .6), V.mul(az, h[2] * .8)), .35, 0, 0, h[0]);
}
/* an RCS quad: a block and four nozzles; c centre, n outward normal, t tangent */
function rcsQuad(B, c, n, t) {
  const b = V.cross(n, t);
  B.obox(V.mad(c, n, .5), t, b, n, [.7, .7, .5], .04, { br: .95, edge: .8 });
  for (const d of [t, V.mul(t, -1), b, V.mul(b, -1)]) {
    const a = V.add(V.mad(c, n, .55), V.mul(d, .7));
    B.lathe(a, d, [[0, .12], [.45, .32]], { cell: .03, br: .9, two: true, rings: true, rbr: .7 });
  }
  B.lathe(V.mad(c, n, 1), n, [[0, .14], [.4, .28]], { cell: .03, br: .9, two: true, rbr: .7 });
}
/* a dish: rim radius r, depth dp, facing n, on a boom from c */
function dish(B, c, n, r, dp, o) {
  o = o || {};
  const [U, W] = perp(n), st = [];
  for (let k = 0; k <= 6; k++) { const u = k / 6, rr = r * u; st.push([dp * u * u, rr]); }
  const v0 = V.mad(c, n, -dp);
  B.lathe(v0, n, st, { cell: o.cell || .06, br: .9, two: true, rings: false });
  B.ringP(c, U, W, r, .8); B.ringP(V.mad(c, n, -dp * .25), U, W, r * .5, .45);
  for (let k = 0; k < 12; k++) { const t = k / 12 * TAU, dir = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t))); B.line(V.add(V.mad(c, n, -dp), V.mul(dir, r * .08)), V.add(c, V.mul(dir, r)), .45); }
  const f = V.mad(c, n, r * .55);
  for (let k = 0; k < 3; k++) { const t = k / 3 * TAU + .3, dir = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t))); B.tube(V.add(c, V.mul(dir, r * .96)), f, .05, .55); }
  B.lathe(V.mad(f, n, -.4), n, [[0, 0], [0, .3], [.5, .4], [.5, 0]], { cell: .04, br: 1 });
}
/* a star tracker: a box and a baffle cone */
function tracker(B, c, n, t) {
  const b = V.cross(n, t);
  B.obox(c, t, b, n, [.45, .45, .4], .035, { br: .9, edge: .8 });
  B.lathe(V.mad(c, n, .4), n, [[0, .26], [1.0, .5]], { cell: .03, br: .85, two: true, rbr: .8 });
}

const bodies = [];
const mk = name => { const B = new Body(name); bodies.push(B); return B; };

/* ================= the root: barrel, core, cross truss (inboard), modules, masts ================= */
const root = mk('root');
const lights = [];                                      // status light positions (root frame), in wake order
const BAYZ = [];
/* ---- barrel truss, bay by bay (each bay one chunk so it can flex) ---- */
for (let b = 0; b < NB; b++) {
  const z0 = b * BAY, z1 = z0 + BAY;
  root.chunk('bay' + b); BAYZ.push(z0 + BAY / 2);
  const C4 = [[BH, BH], [-BH, BH], [-BH, -BH], [BH, -BH]];
  for (let i = 0; i < 4; i++) {
    const [x, y] = C4[i], [x2, y2] = C4[(i + 1) % 4];
    root.tube([x, y, z0], [x, y, z1], .26, .66);
    root.tube([x, y, z0], [x2, y2, z0], .14, .5);
    const f = (b + i) % 2; root.tube([x, y, f ? z0 : z1], [x2, y2, f ? z1 : z0], .1, .4);
    root.knot([x, y, z0], .55, .9);
  }
  if (b === NB - 1) for (let i = 0; i < 4; i++) { const [x, y] = C4[i], [x2, y2] = C4[(i + 1) % 4]; root.tube([x, y, z1], [x2, y2, z1], .14, .5); root.knot([x, y, z1], .55, .9); }
  // the rails (top and bottom of the bore), a box section each
  for (const s of [1, -1]) root.box([-.17, s > 0 ? .3 : -.72, z0], [.17, s > 0 ? .72 : -.3, z1], .04, { br: 1, edge: .8, ch: 2, q: z0 + 2.5 });
  // rail clamp frame at the node: a square round the rails, four struts to the longerons
  sq(root, [0, 0, z0 + .05], XA, YA, 1.0, .62, 2, z0);
  for (let i = 0; i < 4; i++) { const [x, y] = C4[i]; root.tube([Math.sign(x) * 1.0, Math.sign(y) * 1.0, z0 + .05], [x, y, z0 + .05], .07, .45); root.knot([Math.sign(x) * 1.0, Math.sign(y) * 1.0, z0 + .05], .22, .8); }
  for (const s of [1, -1]) { root.box([-.4, s > 0 ? .72 : -1.0, z0 - .12], [.4, s > 0 ? 1.0 : -.72, z0 + .22], .04, { br: .95, edge: .75 }); }
  // coil rings, one a metre: an outer band (two circles) and the inner winding
  for (let k = 0; k < 5; k++) {
    const z = z0 + .5 + k;
    root.ringP([0, 0, z - .11], XA, YA, 1.38, .6, 1, z); root.ringP([0, 0, z + .11], XA, YA, 1.38, .6, 1, z);
    root.ringP([0, 0, z], XA, YA, 1.12, .42, 1, z, 3);
    root.lathe([0, 0, z - .11], ZA, [[0, 1.38], [.22, 1.38]], { cell: .04, br: .85, rings: false, ch: 1, q: z });
  }
  // cooling lines (two a side) and the bus bars (top and bottom)
  for (const x of [1.95, -1.95]) for (const y of [.5, -.5]) root.tube([x, y, z0], [x, y, z1], .13, .5);
  for (const y of [1.72, -1.72]) root.box([-.42, y - .07, z0], [.42, y + .07, z1], .04, { br: .9, edge: .6, ch: 2, q: z0 + 2.5 });
  // manifolds every 25 m
  if (b % 5 === 0) for (const x of [1.95, -1.95]) root.box([x - .3, -.8, z0 + 1.8], [x + .3, .8, z0 + 3.2], .04, { br: .95, edge: .75 });
  // the cable tray under the truss and its hangers
  root.panel([-.6, -BH - .55, z0], [1.2, 0, 0], [0, 0, BAY], .05, { n: [0, -1, 0], br: .7, edge: .5 });
  for (const x of [-.6, .6]) root.line([x, -BH - .55, z0], [x, -BH - .25, z0], .45), root.line([x, -BH - .25, z0], [x, -BH - .25, z1], .4);
  for (let k = 0; k < 3; k++) root.line([-.5, -BH - .5, z0 + .8 + k * 1.6], [.5, -BH - .5, z0 + .8 + k * 1.6], .32, 0, 0, 1.6);
  // status lights along the top longerons every 10 m
  if (b % 2 === 0) for (const x of [BH, -BH]) lights.push({ p: [x, BH + .3, z0 + 2.5], k: lights.length, z: z0 + 2.5 });
}
/* ---- muzzle: collar frame, crown, iris ring ---- */
root.chunk('muzzle');
root.obox([0, 0, 248.5], XA, YA, ZA, [3.25, 3.25, 4.5], .06, { br: .95, edge: .8, skip: ['z-', 'z+'], ch: 7, q: 0 });
for (let k = 0; k < 4; k++) { const z = 244.8 + k * 2.4; sq(root, [0, 0, z], XA, YA, 3.27, .5, 7, 0); }
root.panel([-3.25, -3.25, 253], [6.5, 0, 0], [0, 6.5, 0], .06, { n: ZA, br: .9, edge: .8 });
root.lathe([0, 0, 249], ZA, [[0, 1.5], [3.4, 1.62], [4.4, 2.05], [4.6, 2.3]], { cell: .05, br: 1, two: true, ch: 7, q: 0, seams: 24 });
root.ringP([0, 0, 253.62], XA, YA, 2.3, .9, 7, 0); root.ringP([0, 0, 253.62], XA, YA, 1.5, .7, 7, 0);
for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) rcsQuad(root, [x * 3.25, y * 3.25, 250.5], V.norm([x, y, 0]), V.norm([-y, x, 0]));
lights.push({ p: [0, 3.4, 253], k: lights.length, z: 253 }, { p: [0, -3.4, 253], k: lights.length + 1, z: 253 });

/* ---- the masts (top, bottom, port, starboard) at z 5: square lattice towers ---- */
const MASTS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
const MAST_TIPS = [];
for (let m = 0; m < 4; m++) {
  const d = MASTS[m], u = m < 2 ? XA : YA, a = V.mul(d, BH);
  truss(root, V.mad(a, ZA, MAST_Z), d, u, ZA, 1.1, MAST_H - BH, 9, { rL: .16, rB: .08, rD: .06, kn: .32, tag: 'mast' + m });
  const tip = V.add(V.mul(d, MAST_H), [0, 0, MAST_Z]);
  root.chunk('masttip' + m);
  root.lathe(tip, d, [[0, 0], [0, 1.6], [1.4, 1.2], [1.4, 0]], { cell: .05, br: 1 });
  MAST_TIPS.push(tip);
  lights.push({ p: V.mad(tip, d, 1.6), k: lights.length, z: MAST_Z });
}
const STAY_Z = [55, 105, 155, 205, 245];

/* ---- core truss (z -45.5..0) with the faces' equipment boxes ---- */
truss(root, [0, 0, CZ0], ZA, XA, YA, CH, -CZ0, 7, { rL: .42, rB: .24, rD: .17, kn: .95, tag: 'core',
  noD: i => false });
for (let b = 0; b < 7; b++) {
  const z = CZ0 + CBAY * (b + .5);
  root.chunk('coreeq' + b);
  if (b !== 3) for (const s of [1, -1]) eqBox(root, [s * 2.4, CH + .55, z], XA, YA, ZA, [1.5, .5, 2.6]), eqBox(root, [s * 2.4, -CH - .55, z], XA, V.mul(YA, -1), ZA, [1.5, .5, 2.6]);
  if (b === 1 || b === 5) for (const s of [1, -1]) eqBox(root, [s * (CH + .55), 0, z], YA, V.mul(XA, s), ZA, [2.2, .5, 2.4]);
  lights.push({ p: [CH + .4, CH + .4, z], k: lights.length, z }, { p: [-CH - .4, CH + .4, z], k: lights.length + 1, z });
}
/* ---- the breech: chamber housing, block guides ---- */
root.chunk('breech');
root.box([-1.9, -1.9, CHAMBER[0]], [1.9, 1.9, CHAMBER[1]], .05, { br: 1, edge: .85, ch: 9, q: 0 });
for (let k = 1; k < 7; k++) { const z = CHAMBER[0] + k * 2; sq(root, [0, 0, z], XA, YA, 1.92, .45, 9, 0); }
for (const s of [1, -1]) root.box([s * 1.75, -5.6, BLOCK_Z[0] - .15], [s * 2.05, 2.1, BLOCK_Z[1] + .15], .04, { br: .9, edge: .75 });
root.box([-2.05, -5.9, BLOCK_Z[0] - .15], [2.05, -5.6, BLOCK_Z[1] + .15], .04, { br: .9, edge: .7 });
for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) root.tube([x * 1.9, y * 1.9, -1], [x * CH, y * CH, 0], .2, .5);
/* ---- transfer cage (z -28..-16.2) ---- */
root.chunk('cage');
for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; root.line([Math.cos(t) * .62, Math.sin(t) * .62, -28], [Math.cos(t) * .62, Math.sin(t) * .62, -16.2], .5); }
for (let z = -28; z <= -16.1; z += 1.2) root.ringP([0, 0, z], XA, YA, .64, .55);
for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) { root.tube([x * .45, y * .45, -22], [x * CH, y * CH, -22], .12, .4); }
/* ---- rammer housing (z -45..-37) on the bore axis ---- */
root.chunk('ramhouse');
root.lathe([0, 0, RAM_Z0], ZA, [[0, 0], [0, .95], [8, .95], [8, .7]], { cell: .05, br: 1, seams: 12 });
for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) root.tube([x * .7, y * .7, -41], [x * CH, y * CH, -40], .14, .45);
/* ---- the drum's bearings (the drum turns in its own body) ---- */
root.chunk('drumframe');
for (const z of [DRUM_Z0 - .6, DRUM_Z1 + .6]) { root.ringP([0, DRUM_Y, z], XA, YA, DRUM_R + .9, .55); for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) root.tube([x * (DRUM_R + .6) * .7, DRUM_Y + y * (DRUM_R + .6) * .7, z], [x * CH, y * CH, z], .14, .42); }
/* ---- capacitor modules on the diagonals, each in 12 bands for the charge fill ---- */
const MOD_SEG = 12;
MODS.forEach(([x, y], m) => {
  const a = [x, y, MZ0], L_ = MZ1 - MZ0;
  root.chunk('mod' + m + 'a');
  root.lathe(a, ZA, [[0, 0], [0, 1.6], [.55, 2.8], [1.5, MR]], { cell: .06, br: .95, ch: 5, q: m * 16, seams: 8, rbr: .4 });
  for (let k = 0; k < MOD_SEG; k++) {
    if (k === 6) root.chunk('mod' + m + 'b');
    const s0 = 1.5 + (L_ - 3) * k / MOD_SEG, s1 = 1.5 + (L_ - 3) * (k + 1) / MOD_SEG;
    root.lathe(a, ZA, [[s0, MR], [s1, MR]], { cell: .06, br: .95, ch: 5, q: m * 16 + 1 + k, seams: 12, sbr: .28, rings: true, rbr: .36, solid: true });
    root.ringP(V.mad(a, ZA, (s0 + s1) / 2), XA, YA, MR * 1.004, .22, 5, m * 16 + 1 + k, 2.8);
  }
  root.lathe(V.mad(a, ZA, L_ - 1.5), ZA, [[0, MR], [.95, 2.8], [1.5, 1.6], [1.5, 0]], { cell: .06, br: .95, ch: 5, q: m * 16 + 13, seams: 8, rbr: .4 });
  // berthing ring, struts to the core
  root.chunk('mod' + m + 's');
  root.ringP([x, y, MZ1 + .2], XA, YA, 1.25, .7); root.ringP([x, y, MZ0 - .2], XA, YA, 1.25, .7);
  for (const z of [MZ0 + 6, MZ1 - 6]) { const c = [x * .62, y * .62, z]; root.tube(V.add([x, y, z], V.mul(V.norm([-x, -y, 0]), MR)), [Math.sign(x) * CH, Math.sign(y) * CH, z], .2, .5); root.knot(c, .6, .7); }
  for (const z of [MZ0 + 3, (MZ0 + MZ1) / 2, MZ1 - 3]) lights.push({ p: [x + Math.sign(x) * MR * .72, y + Math.sign(y) * MR * .72, z], k: lights.length, z });
});
/* ---- node with the docking port on top ---- */
root.chunk('node');
root.lathe([0, CH, -30], YA, [[0, 2.7], [11, 2.7], [11.8, 2.1], [13.2, 2.1]], { cell: .06, br: .95, seams: 8 });
root.ringP([0, CH + 13.2, -30], XA, ZA, 2.1, .8); root.ringP([0, CH + 13.4, -30], XA, ZA, 1.6, .9);
for (let k = 0; k < 3; k++) { const t = k / 3 * TAU; root.panel([Math.cos(t) * 1.3, CH + 13.2, -30 + Math.sin(t) * 1.3], [Math.cos(t + PI / 2) * .9, 0, Math.sin(t + PI / 2) * .9], [Math.cos(t) * -.35, 1.1, Math.sin(t) * -.35], .04, { two: true, br: .9, edge: .8 }); }
lights.push({ p: [0, CH + 13.6, -30], k: lights.length, z: -30 });
/* ---- aft node, trackers, the aft dish, RCS ---- */
root.chunk('aft');
root.lathe([0, 0, CZ0 - 7], ZA, [[0, 0], [0, 2.2], [.8, 3.0], [7, 3.0]], { cell: .06, br: .95, seams: 8 });
for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) rcsQuad(root, [x * 3, y * 3, CZ0 - 4], [x, y, 0], [0, 0, 1]);
tracker(root, [2.2, 2.2, CZ0 - 6.2], V.norm([1, 1, -1.2]), V.norm([1, -1, 0]));
tracker(root, [-2.2, 2.2, CZ0 - 6.2], V.norm([-1, 1, -1.2]), V.norm([1, 1, 0]));
root.chunk('aftdish');
root.tube([0, -3, CZ0 - 4], [0, -9, CZ0 - 6], .18, .55);
dish(root, [0, -9.5, CZ0 - 8.5], V.norm([0, -.4, -1]), 3.2, 1.1);
lights.push({ p: [0, 3.1, CZ0 - 6.8], k: lights.length, z: CZ0 - 7 });

/* ---- the cross truss, inboard part (static), both sides ---- */
for (const s of [1, -1]) {
  truss(root, [s * XI0, 0, XZ], [s, 0, 0], ZA, YA, XH, XI1 - XI0, 9, { rL: .34, rB: .2, rD: .15, kn: .8, tag: 'xi' + s });
  for (let b = 0; b < 9; b++) {
    const x = s * (XI0 + XB * (b + .5));
    root.chunk('xieq' + s + b);
    if (b % 3 !== 1) eqBox(root, [x, XH + .5, XZ + 2.2], ZA, YA, XA, [1.4, .45, 2.8]);
    if (b % 2 === 0) eqBox(root, [x, 0, XZ + XH + .5], YA, ZA, XA, [2.0, .45, 3.0]);
    if (b % 2) lights.push({ p: [x, XH + .4, XZ - XH], k: lights.length, z: XZ });
  }
  // radiator rotary joints under the truss
  for (const rx of RADX) { root.chunk('radj' + s + rx); root.lathe([s * rx, -XH, XZ], [0, -1, 0], [[0, 0], [0, 1.6], [1.4, 1.6], [1.4, 0]], { cell: .05, br: 1, seams: 8 }); }
  // the alpha joint: a drum round the truss axis
  root.chunk('alpha' + s);
  root.lathe([s * XI1, 0, XZ], [s, 0, 0], [[0, 0], [0, 6.2], [3, 6.2], [3, 0]], { cell: .07, br: 1, seams: 16 });
  for (let k = 0; k < 3; k++) root.ringP([s * (XI1 + .75 + k * .75), 0, XZ], ZA, YA, 6.24, .5);
  // high gain dish on a boom at the front face
  root.chunk('hgdish' + s);
  root.tube([s * 46, 0, XZ + XH], [s * 46, 6, XZ + 11], .2, .55);
  dish(root, [s * 46, 7.5, XZ + 12.5], V.norm([s * .3, .6, 1]), 3.6, 1.2);
}
lights.sort((a, b) => a.z - b.z); lights.forEach((l, i) => { l.k = i; });
root.chunk('lights');
for (const l of lights) root.knot(l.p, .5, .9, 3, l.k);
root.done();

/* ================= the outboard sections (turn on the alpha joints about X) ================= */
const out = [1, -1].map(s => {
  const B = mk('out' + s);
  // local frame: origin on the truss axis at the alpha joint (x = s * XAJ), axes as the platform
  const x0 = (XO0 - XAJ), x1 = (XO1 - XAJ);
  truss(B, [s * x0, 0, 0], [s, 0, 0], ZA, YA, XH, x1 - x0, 8, { rL: .34, rB: .2, rD: .15, kn: .8, tag: 'xo' });
  B.chunk('aj');
  B.lathe([s * (XO0 - XAJ - 3), 0, 0], [s, 0, 0], [[0, 6.0], [3, 6.0], [3, 0]], { cell: .07, br: 1, seams: 16 });
  // end cap, RCS, lights
  B.chunk('end');
  B.box([s * (x1) - (s > 0 ? 0 : 2.5), -XH, -XH], [s * (x1) + (s > 0 ? 2.5 : 0), XH, XH], .06, { br: .95, edge: .8 });
  for (const zz of [1, -1]) rcsQuad(B, [s * (x1 + 2.5), 0, zz * 2.6], [s, 0, 0], [0, 0, 1]);
  rcsQuad(B, [s * (x1 + 1.2), XH, 0], [0, 1, 0], [1, 0, 0]); rcsQuad(B, [s * (x1 + 1.2), -XH, 0], [0, -1, 0], [1, 0, 0]);
  tracker(B, [s * (x1 + 1.3), 0, XH + .4], [0, 0, 1], [1, 0, 0]);
  // PV module boxes at the wing pairs
  for (const wx of WX) { B.chunk('pvm' + wx); const cx = s * (wx - XAJ); eqBox(B, [cx, XH + 1.3, 0], XA, YA, ZA, [5.5, 1.3, 3.6], { cell: .07 }); eqBox(B, [cx, -XH - 1.3, 0], XA, V.mul(YA, -1), ZA, [5.5, 1.3, 3.6], { cell: .07 }); }
  B.chunk('olights');
  const lt = [];
  for (let k = 0; k < 4; k++) lt.push([s * (x0 + 9 + k * 18), XH + .4, -XH]);
  lt.push([s * (x1 + 2.6), XH, 0]);
  lt.forEach((p, i) => B.knot(p, .5, .9, 3, 200 + i));
  B.done();
  return B;
});
/* ================= the wings (beta gimbal about the wing's axis) ================= */
/* wing local frame: origin on the wing axis at the truss axis, +Z' along the wing (out from the truss), X' across */
function makeWing(name, w) {
  const B = mk(name);
  B.chunk('gimbal');
  B.lathe([0, 0, XH + .2], ZA, [[0, 0], [0, 2.2], [3.2, 2.2], [3.2, 1.2], [WR0 - XH - .2, 1.2]], { cell: .05, br: 1, seams: 12 });
  // storage boxes at the root and the tip
  B.box([-(BLG + BLW + .3), -.5, WR0 - 1.6], [BLG + BLW + .3, .5, WR0], .05, { br: .95, edge: .85 });
  // mast: a triangular lattice, battens every 1.4 m
  const NMB = 70, mr = 1.25, T3 = [0, 1, 2].map(k => [Math.cos(k / 3 * TAU + PI / 2) * mr, Math.sin(k / 3 * TAU + PI / 2) * mr]);
  for (let b = 0; b < NMB; b++) {
    if (b % 10 === 0) B.chunk('mast' + b);
    const z0 = WR0 + (WR1 - WR0) * b / NMB, z1 = WR0 + (WR1 - WR0) * (b + 1) / NMB;
    for (let i = 0; i < 3; i++) {
      const [x, y] = T3[i], [x2, y2] = T3[(i + 1) % 3];
      B.line([x, y, z0], [x, y, z1], .55);
      B.line([x, y, z0], [x2, y2, z0], .4);
      B.line([x, y, z0], [x2, y2, z1], .26, 0, 0, 2.8);
    }
  }
  // the blankets: cells on a 0.2 m lattice, seams (fold lines every 0.8 m, cell strings every 1.6 m across)
  for (const sd of [1, -1]) {
    const x0 = sd * BLG, x1 = sd * (BLG + BLW);
    for (let k = 0; k < 7; k++) {
      B.chunk('blk' + sd + k);
      const z0 = WR0 + .3 + (WR1 - WR0 - .6) * k / 7, z1 = WR0 + .3 + (WR1 - WR0 - .6) * (k + 1) / 7;
      const qq = w * 16 + (sd > 0 ? 0 : 8) + k;
      B.panel([Math.min(x0, x1), 0, z0], [BLW, 0, 0], [0, 0, z1 - z0], .05, { n: [0, 1, 0], two: true, br: .78, edge: false, seams: [32, 16], sbr: .3, ch: 4, q: qq });
      B.line([x1, 0, z0], [x1, 0, z1], .7, 4, qq); B.line([x0, 0, z0], [x0, 0, z1], .55, 4, qq);
      // tension wires
      B.line([x1 + sd * .12, .05, z0], [x1 + sd * .12, .05, z1], .3);
    }
  }
  B.chunk('tip');
  B.box([-(BLG + BLW + .3), -.45, WR1], [BLG + BLW + .3, .45, WR1 + 1.4], .05, { br: .95, edge: .85 });
  B.knot([BLG + BLW + .3, 0, WR1 + .7], .5, .9, 3, 300 + w * 2); B.knot([-(BLG + BLW + .3), 0, WR1 + .7], .5, .9, 3, 301 + w * 2);
  B.done();
  return B;
}
const wings = [];
for (let w = 0; w < 8; w++) wings.push(makeWing('wing' + w, w));
// wing w: side s = w < 4 ? +1 : -1; pair p = (w >> 1) & 1; direction dz = w & 1 ? -1 : +1
const WING = wings.map((B, w) => ({ B, s: w < 4 ? 1 : -1, p: (w >> 1) & 1, dz: w & 1 ? -1 : 1 }));

/* ================= radiators: 8 accordion panels each ================= */
/* panel local frame: hinge line along Z at the origin, the panel hangs along -Y (0..-RPH), width along Z */
function makeRadPanel(name, r, k) {
  const B = mk(name);
  B.chunk('p');
  B.panel([-.04, 0, -RPW / 2], [0, -RPH, 0], [0, 0, RPW], .06, { n: [1, 0, 0], two: true, br: .72, edge: .7, seams: [0, 8], sbr: .28, ch: 6, q: r * 8 + k });
  // flow tubes along the panel, a header at the top, hinge knuckles
  B.line([0, -.15, -RPW / 2], [0, -.15, RPW / 2], .55, 6, r * 8 + k);
  for (const z of [-RPW / 2 + .6, -1.2, 1.2, RPW / 2 - .6]) B.ringP([0, 0, z], XA, YA, .14, .6);
  B.done();
  return B;
}
const rads = [];
for (let r = 0; r < 4; r++) { const ps = []; for (let k = 0; k < NRP; k++) ps.push(makeRadPanel('rad' + r + '_' + k, r, k)); rads.push(ps); }
const RAD = [0, 1, 2, 3].map(r => ({ x: (r < 2 ? 1 : -1) * RADX[r % 2] }));

/* ================= the robotic arm ================= */
/* bodies in chain order; each local frame: origin at its proximal joint, +Z along the link */
const ARM_L1 = 24, ARM_L2 = 24;
const arm = {};
arm.base = mk('armbase'); arm.base.chunk('b');
arm.base.box([-2.2, 0, -2.2], [2.2, .9, 2.2], .05, { br: .95, edge: .8 }); arm.base.lathe([0, .9, 0], YA, [[0, 1.1], [1.4, 1.1], [1.4, 0]], { cell: .04, br: 1 }); arm.base.done();
arm.sh = mk('armsh'); arm.sh.chunk('j');
arm.sh.lathe([-.9, 0, 0], XA, [[0, 0], [0, 1.15], [1.8, 1.15], [1.8, 0]], { cell: .04, br: 1, seams: 8 });
arm.sh.lathe([0, 0, 0], YA, [[-1.6, .9], [0, .9]], { cell: .04, br: 1 }); arm.sh.done();
arm.l1 = mk('arml1'); arm.l1.chunk('a'); arm.l1.lathe([0, 0, 1.2], ZA, [[0, .55], [ARM_L1 - 2.4, .55]], { cell: .04, br: .95, seams: 8 });
for (const z of [1.4, ARM_L1 / 2, ARM_L1 - 1.4]) arm.l1.ringP([0, 0, z], XA, YA, .6, .7);
arm.l1.lathe([0, 0, ARM_L1 - 1.2], ZA, [[0, 0], [0, .9], [1.2, .9]], { cell: .04, br: 1 }); arm.l1.knot([0, .62, ARM_L1 / 2], .4, .9, 3, 400); arm.l1.done();
arm.el = mk('armel'); arm.el.chunk('j'); arm.el.lathe([-.9, 0, 0], XA, [[0, 0], [0, 1.0], [1.8, 1.0], [1.8, 0]], { cell: .04, br: 1, seams: 8 }); arm.el.done();
arm.l2 = mk('arml2'); arm.l2.chunk('a'); arm.l2.lathe([0, 0, 1.0], ZA, [[0, .55], [ARM_L2 - 2.2, .55]], { cell: .04, br: .95, seams: 8 });
for (const z of [1.2, ARM_L2 / 2, ARM_L2 - 1.4]) arm.l2.ringP([0, 0, z], XA, YA, .6, .7);
arm.l2.knot([0, .62, ARM_L2 / 2], .4, .9, 3, 401); arm.l2.done();
arm.wr = mk('armwr'); arm.wr.chunk('j');
arm.wr.lathe([-.8, 0, 0], XA, [[0, 0], [0, .9], [1.6, .9], [1.6, 0]], { cell: .04, br: 1 });
arm.wr.lathe([0, 0, .8], ZA, [[0, .85], [2.6, .85], [2.6, 1.1], [3.6, 1.1], [3.6, 0]], { cell: .04, br: 1, seams: 6 });
for (let k = 0; k < 3; k++) { const t = k / 3 * TAU; arm.wr.line([Math.cos(t) * 1.1, Math.sin(t) * 1.1, 4.4], [Math.cos(t) * .5, Math.sin(t) * .5, 3.6], .6); }
arm.wr.done();

/* ================= the magazine drum, the rods, the rammer, the block, the iris ================= */
const drum = mk('drum'); drum.chunk('d');
// drum local: axis along Z through the origin (placed at (0, DRUM_Y)), cells on radius DRUM_R
for (const z of [DRUM_Z0, DRUM_Z1]) drum.lathe([0, 0, z], ZA, [[0, .5], [0, DRUM_R + .55]], { cell: .05, br: .95, two: true, rings: true });
drum.lathe([0, 0, DRUM_Z0], ZA, [[0, .45], [DRUM_Z1 - DRUM_Z0, .45]], { cell: .05, br: .9 });
for (let c = 0; c < NCELL; c++) {
  const t = PI / 2 + c / NCELL * TAU, cx = Math.cos(t) * DRUM_R, cy = Math.sin(t) * DRUM_R;
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; drum.line([cx + Math.cos(a) * .44, cy + Math.sin(a) * .44, DRUM_Z0], [cx + Math.cos(a) * .44, cy + Math.sin(a) * .44, DRUM_Z1], .45); }
  for (const z of [DRUM_Z0 + 2.6, DRUM_Z1 - 2.6]) drum.ringP([cx, cy, z], XA, YA, .46, .55);
  drum.knot([cx * 1.24, cy * 1.24, DRUM_Z0 - .05], .3, .9, 3, 500 + c);
}
drum.done();
const DRUM_CELL = c => { const t = PI / 2 + c / NCELL * TAU; return [Math.cos(t) * DRUM_R, Math.sin(t) * DRUM_R]; };
/* the rod: a closed shell, nose forward (+Z), local origin at its centre */
function makeRod(name, q) {
  const B = mk(name); B.chunk('r');
  B.lathe([0, 0, -ROD_L / 2], ZA, [[0, 0], [0, ROD_R * .8], [.15, ROD_R], [ROD_L - 1.3, ROD_R], [ROD_L - .3, ROD_R * .45], [ROD_L, 0]], { cell: .03, br: .6, seams: 6, sbr: .35, ch: 8, q });
  B.ringP([0, 0, -ROD_L / 2 + .9], XA, YA, ROD_R * 1.02, .55, 8, q); B.ringP([0, 0, .6], XA, YA, ROD_R * 1.02, .45, 8, q);
  B.done(); return B;
}
const rods = []; for (let c = 0; c < NCELL; c++) rods.push(makeRod('rod' + c, c));
const LOADED = [1, 2, 3, 5, 6];                         // cells holding rods besides cell 0 (the one fired)
/* rammer stages (local: origin at the housing front face, along +Z) */
const RAM_SL = 9;                                       // stage length; the head (stage 2's front) at RAM_Z0 + RAM_SL + ext
const ram = [0, 1, 2].map(k => { const B = mk('ram' + k); B.chunk('s'); const r = .62 - k * .13; B.lathe([0, 0, 0], ZA, [[0, r], [RAM_SL, r], [RAM_SL, 0]], { cell: .04, br: .95, seams: 8 }); B.ringP([0, 0, RAM_SL - .1], XA, YA, r * 1.02, .7); B.done(); return B; });
/* breech block (local: at its closed place) */
const block = mk('block'); block.chunk('b');
block.box([-1.7, -1.7, BLOCK_Z[0]], [1.7, 1.7, BLOCK_Z[1]], .04, { br: 1, edge: .9, ch: 9, q: 1 });
block.ringP([0, 0, BLOCK_Z[1] + .02], XA, YA, .5, .8, 9, 1); block.ringP([0, 0, BLOCK_Z[0] - .02], XA, YA, .5, .6, 9, 1);
for (const y of [-1.2, -.6, 0, .6, 1.2]) block.line([-1.6, y, BLOCK_Z[0] - .02], [1.6, y, BLOCK_Z[0] - .02], .35);
block.done();
/* the muzzle iris: six petals (local: hinge on the crown rim, petal closed over the bore) */
const iris = [];
for (let k = 0; k < 6; k++) {
  const B = mk('iris' + k); B.chunk('p');
  B.panel([-.85, 0, 0], [1.7, 0, 0], [0, -2.05, 0], .04, { n: ZA, two: true, br: .95, edge: .85, ch: 7, q: 1 });
  B.done(); iris.push(B);
}

/* ---------------- pose ---------------- */
/* st: { wake, alpha [2], beta [8], rad [4], radYaw [4], arm [6], drum, ram, rodZ, rodOn, block, iris, flex(z, out) } */
const T0 = X.make();
const TMP3 = [0, 0, 0];
function pose(W, st) {
  const P = { W };
  // barrel flex: chunk offsets of the bays, masts unaffected
  const off = root.off; off.fill(0);
  if (st.flex) for (const c of root.CH) if (c.tag.startsWith('bay') || c.tag === 'muzzle') { st.flex(c.c[2], TMP3); off[c.i * 3] = TMP3[0]; off[c.i * 3 + 1] = TMP3[1]; off[c.i * 3 + 2] = TMP3[2]; }
  P.out = [1, -1].map((s, i) => X.mul(W, X.make(R.x(st.alpha[i]), [s * XAJ, 0, XZ])));
  P.wings = WING.map((g, w) => {
    const Ws = P.out[g.s > 0 ? 0 : 1];
    // wing local +Z' along +-Z of the outboard frame; beta about it
    const base = R.mul(g.dz > 0 ? R.I() : R.y(PI), R.z(st.beta[w]));
    return X.mul(Ws, X.make(base, [g.s * (WX[g.p] - XAJ), 0, 0]));
  });
  // radiators: yaw at the joint, then the accordion chain
  P.rads = RAD.map((rd, r) => {
    const u = st.rad[r], phi = (1 - u) * 87 * DEG, Wr = X.mul(W, X.make(R.y(st.radYaw[r]), [rd.x, -XH - 1.4, XZ]));
    const out = []; let p = [0, 0, 0];
    for (let k = 0; k < NRP; k++) {
      const th = (k % 2 ? -1 : 1) * phi * (rd.x > 0 ? 1 : -1);
      out.push(X.mul(Wr, X.make(R.z(th), p)));
      p = [p[0] + Math.sin(th) * RPH, p[1] - Math.cos(th) * RPH, 0];
    }
    return out;
  });
  // arm: base yaw a0, shoulder pitch a1, elbow a2, wrist pitch a3, wrist yaw a4, roll a5
  const A = st.arm;
  P.armBase = X.mul(W, X.make(R.y(A[0]), ARM_BASE));
  P.armSh = X.mul(P.armBase, X.make(R.I(), [0, 2.3, 0]));
  P.armL1 = X.mul(P.armSh, X.make(R.x(-A[1]), [0, 0, 0]));
  P.armEl = X.mul(P.armL1, X.make(R.I(), [0, 0, ARM_L1]));
  P.armL2 = X.mul(P.armEl, X.make(R.x(A[2]), [0, 0, 0]));
  P.armWr = X.mul(P.armL2, X.make(R.mul(R.x(A[3]), R.y(A[4])), [0, 0, ARM_L2]));
  P.drum = X.mul(W, X.make(R.z(st.drum), [0, DRUM_Y, 0]));
  // rods: in their cells (turning with the drum); cell 0 is the one rammed and fired (st.rodOn: out of the drum,
  // st.rodZ: its centre on the bore, null once it has left the muzzle)
  P.rods = rods.map((B, c) => {
    if (c === 0 && st.rodOn) return st.rodZ === null ? null : X.mul(W, X.make(R.I(), [0, 0, st.rodZ]));
    if (c !== 0 && !LOADED.includes(c)) return null;
    const [cx, cy] = DRUM_CELL(c); return X.mul(P.drum, X.make(R.I(), [cx, cy, (DRUM_Z0 + DRUM_Z1) / 2]));
  });
  P.ram = [0, 1, 2].map(k => X.mul(W, X.make(R.I(), [0, 0, RAM_Z0 + st.ram * (k + 1) / 3])));
  P.block = X.mul(W, X.make(R.I(), [0, -3.6 * (1 - st.block), 0]));
  P.iris = iris.map((B, k) => X.mul(W, X.mul(X.make(R.z(k / 6 * TAU), [0, 0, 253.7]), X.make(R.x(-st.iris * 1.75), [0, 2.05, 0]))));
  P.muzzle = X.ap(W, [0, 0, 253.8]); P.breech = X.ap(W, [0, 0, CHAMBER[0]]);
  // world positions of the stay cables' ends (with the flex)
  P.stays = [];
  for (let m = 0; m < 4; m++) {
    const tip = X.ap(W, MAST_TIPS[m]), d = MASTS[m];
    for (const z of STAY_Z) { const p = V.add(V.mul(d, BH), [0, 0, z]); if (st.flex) { st.flex(z, TMP3); p[0] += TMP3[0]; p[1] += TMP3[1]; p[2] += TMP3[2]; } P.stays.push([tip, X.ap(W, p), m, z]); }
    const back = m < 2 ? [0, d[1] * CH, CZ0] : [d[0] * 40, 0, XZ + XH];
    P.stays.push([tip, X.ap(W, back), m, -1]);
  }
  return P;
}

/* ---------------- draw ---------------- */
/* a wave of lime light through the structure: chunks lit as a sphere of radius st.wave (m) grows from the core */
const CORE = [0, 0, XZ];
function wave(B, Tw, st, coreW) {
  const lm = B.lime;
  if (!(st.wave > 0)) { if (lm[0] !== 0 || lm[lm.length - 1] !== 0) lm.fill(0); else lm.fill(0); return; }
  const R0 = st.wave, wd = st.waveW || 14, tail = st.waveT || 0;
  for (const c of B.CH) {
    const M = Tw.R, t = Tw.T, x = M[0] * c.c[0] + M[1] * c.c[1] + M[2] * c.c[2] + t[0] - coreW[0], y = M[3] * c.c[0] + M[4] * c.c[1] + M[5] * c.c[2] + t[1] - coreW[1], z = M[6] * c.c[0] + M[7] * c.c[1] + M[8] * c.c[2] + t[2] - coreW[2];
    const d = Math.sqrt(x * x + y * y + z * z), w = (d - R0) / wd;
    lm[c.i] = (w < 0 ? Math.exp(w * .6) * tail + Math.exp(-w * w) * (1 - tail) : Math.exp(-w * w)) * st.waveA;
  }
}
function draw(P, st, o, ox) {
  ox = ox || o;
  const coreW = X.ap(P.W, CORE);
  wave(root, P.W, st, coreW); for (let i = 0; i < 2; i++) wave(out[i], P.out[i], st, coreW); for (let w = 0; w < 8; w++) wave(wings[w], P.wings[w], st, coreW);
  for (let r = 0; r < 4; r++) for (let k = 0; k < NRP; k++) wave(rads[r][k], P.rads[r][k], st, coreW);
  L.draw(root, P.W, o);
  for (let i = 0; i < 2; i++) L.draw(out[i], P.out[i], o);
  for (let w = 0; w < 8; w++) L.draw(wings[w], P.wings[w], o);
  for (let r = 0; r < 4; r++) for (let k = 0; k < NRP; k++) L.draw(rads[r][k], P.rads[r][k], o);
  L.draw(arm.base, P.armBase, o); L.draw(arm.sh, P.armSh, o); L.draw(arm.l1, P.armL1, o); L.draw(arm.el, P.armEl, o); L.draw(arm.l2, P.armL2, o); L.draw(arm.wr, P.armWr, o);
  L.draw(drum, P.drum, ox);
  for (let c = 0; c < NCELL; c++) if (P.rods[c]) L.draw(rods[c], P.rods[c], ox);
  for (let k = 0; k < 3; k++) L.draw(ram[k], P.ram[k], ox);
  L.draw(block, P.block, ox);
  for (let k = 0; k < 6; k++) L.draw(iris[k], P.iris[k], o);
}
/* ---------------- occluders (the solid modules and boxes hide what is behind them) ---------------- */
const PR_P = [], PR_C = [];
for (let k = 0; k < 14; k++) PR_P.push([0, 0, 0, 0]);
for (let k = 0; k < 24; k++) PR_C.push([0, 0, 0]);
/* a 12-sided prism inscribed in a cylinder: axis from a (model) along unit d, radius r, length len, under Tw */
function occPrism(Tw, a, d, r, len, i0, i1) {
  const [U, Wv] = perp(d), n = 12, ri = r * Math.cos(PI / n) * .97;
  const aw = X.ap(Tw, a), dw = X.dir(Tw, d), Uw = X.dir(Tw, U), Ww = X.dir(Tw, Wv);
  if (!ORK.wIn(aw[0] + dw[0] * len / 2, aw[1] + dw[1] * len / 2, aw[2] + dw[2] * len / 2, Math.hypot(r, len / 2))) return;
  for (let k = 0; k < n; k++) {
    const t = (k + .5) / n * TAU, nx = Uw[0] * Math.cos(t) + Ww[0] * Math.sin(t), ny = Uw[1] * Math.cos(t) + Ww[1] * Math.sin(t), nz = Uw[2] * Math.cos(t) + Ww[2] * Math.sin(t);
    const P = PR_P[k]; P[0] = nx; P[1] = ny; P[2] = nz; P[3] = nx * aw[0] + ny * aw[1] + nz * aw[2] + ri;
  }
  const e0 = i0 === undefined ? .15 : i0, e1 = len - (i1 === undefined ? .15 : i1);
  PR_P[12][0] = -dw[0]; PR_P[12][1] = -dw[1]; PR_P[12][2] = -dw[2]; PR_P[12][3] = -(dw[0] * aw[0] + dw[1] * aw[1] + dw[2] * aw[2]) - e0;
  PR_P[13][0] = dw[0]; PR_P[13][1] = dw[1]; PR_P[13][2] = dw[2]; PR_P[13][3] = dw[0] * aw[0] + dw[1] * aw[1] + dw[2] * aw[2] + e1;
  for (let k = 0; k < n; k++) { const t = k / n * TAU, c = Math.cos(t) * r, s_ = Math.sin(t) * r; for (let e = 0; e < 2; e++) { const o = PR_C[k * 2 + e], L_ = e ? e1 : e0; o[0] = aw[0] + dw[0] * L_ + Uw[0] * c + Ww[0] * s_; o[1] = aw[1] + dw[1] * L_ + Uw[1] * c + Ww[1] * s_; o[2] = aw[2] + dw[2] * L_ + Uw[2] * c + Ww[2] * s_; } }
  // its inset (6 % of r) wider than 8 px even at the far end: rasterise it in 8 px tiles
  const C_ = ORK.C, dc = Math.hypot(aw[0] + dw[0] * len / 2 - C_.eye[0], aw[1] + dw[1] * len / 2 - C_.eye[1], aw[2] + dw[2] * len / 2 - C_.eye[2]);
  ORK.occS(r * C_.fl / (dc + len / 2) > 140 ? 2 : 0);
  ORK.occPlanes(PR_P, PR_C);
  ORK.occS(0);
}
function occBoxV(Tw, mn, mx) {
  const c = X.ap(Tw, [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]);
  if (!ORK.wIn(c[0], c[1], c[2], Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2)) return;
  ORK.occBox(Tw, mn, mx);
}
function occlude(P) {
  const W = P.W;
  // each module in three overlapping lengths: three small screen boxes instead of one long diagonal one, and the
  // near ones large enough for 8 px tiles
  const ML = (MZ1 - MZ0 - 3) / 3;
  for (const [x, y] of MODS) for (let k = 0; k < 3; k++) occPrism(W, [x, y, MZ0 + 1.5 + k * ML], ZA, MR, ML, k ? -.05 : .15, k < 2 ? -.05 : .15);
  occPrism(W, [0, CH + .3, -30], YA, 2.7, 10.5);
  occPrism(W, [0, 0, CZ0 - 6.4], ZA, 3.0, 6.2);
  occBoxV(W, [-1.85, -1.85, CHAMBER[0] + .05], [1.85, 1.85, CHAMBER[1] - .05]);
  occBoxV(W, [-3.2, -3.2, 244.3], [3.2, 3.2, 252.7]);
  for (const s of [1, -1]) occPrism(W, [s * XI1, 0, XZ], [s, 0, 0], 6.2, 3);
  for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; occPrism(P.out[i], [0, 0, 0], [s, 0, 0], 6.0, 3); for (const wx of WX) { const cx = s * (wx - XAJ); occBoxV(P.out[i], [cx - 5.4, XH + .05, -3.5], [cx + 5.4, XH + 2.5, 3.5]); occBoxV(P.out[i], [cx - 5.4, -XH - 2.5, -3.5], [cx + 5.4, -XH - .05, 3.5]); } }
}
const stats = () => { let n = 0; for (const B of bodies) n += B.L.length / 10 + B.T.length / 10 + B.P.length / 20 + B.Y.length + B.N.length / 7 + B.Rg.length / 14; return { bodies: bodies.length, prims: n }; };

return { bodies, root, out, wings, rads, arm, drum, rods, ram, block, iris, pose, draw, stats, occlude, lights, WING, RAD,
  BZ1, NB, BAY, BH, CZ0, CH, XZ, XH, XAJ, WX, WR0, WR1, RADX, MODS, MR, MZ0, MZ1, DRUM_Y, DRUM_R, DRUM_Z0, DRUM_Z1, NCELL, ROD_L, ROD_R,
  CHAMBER, BLOCK_Z, RAM_Z0, RAM_SL, ROD_Z_DRUM, ROD_Z_CH, MAST_Z, MAST_H, MAST_TIPS, STAY_Z, ARM_BASE, ARM_L1, ARM_L2, LOADED, DRUM_CELL, rodBody: rods[0], XEND, RPH, NRP };
};
