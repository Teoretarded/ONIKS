/* SCAN · RAILGUN parts: the railgun mount that takes the Mk 45's seat on the Burke's foredeck, the power room
   under it (four pulsed alternators, four capacitor racks, switchgear, pump, bus bars, coolant loop), and the
   X-ray point pass (a slice opens a window in the hull, the room shows only where it is open).
   Frames: ship (HD.destroyer: +Z fwd, +X stbd, origin midships waterline); M (mount base on the deck, not
   training); T (turret, trains about Y); B (barrel, elevates about the trunnion, +Z along the bore);
   E (the muzzle sleeve, slides along B's Z). Loaded after scan_kit.js; exposes window.RGP. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const G = GEO, K = SK;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const F = o => Object.assign({ fine: true }, o || {});
const DA = HD.destroyer.A, hD = DA.deckY;

/* ---------- placement ---------- */
const GZ = 48.6, GY = hD(GZ), M0 = [0, GY, GZ];        // the mount's seat (the Mk 45's)
const FL = 1.3;                                         // power room floor (ship y)
const TRN = [0, 1.95, .9];                              // trunnion in T
const SLV0 = 1.4, SLV1 = 5.66, EXT = 4.0;               // sleeve span in E at ext 0, and its travel
const MZ_E = [0, 0, SLV1 + .06];                        // bore mouth in E

/* a flat bar between two points (bus bars): w across, h thick, `up` picks the thin direction */
function bar(a, b, w, h, up, o) {
  const d = V.norm(V.sub(b, a));
  let n = up || [0, 1, 0]; if (Math.abs(V.dot(n, d)) > .9) n = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 0, 1];
  const s = V.norm(V.cross(d, n)), u = V.cross(s, d), hw = w / 2, hh = h / 2;
  const q = (p, i, j) => V.add(p, V.add(V.mul(s, i * hw), V.mul(u, j * hh)));
  return G.hex([q(a, -1, -1), q(a, 1, -1), q(b, 1, -1), q(b, -1, -1), q(a, -1, 1), q(a, 1, 1), q(b, 1, 1), q(b, -1, 1)], o);
}
const bars = (P, w, h, up, o) => { const out = []; for (let i = 0; i < P.length - 1; i++) out.push(bar(P[i], P[i + 1], w, h, up, o)); return out; };
const pipes = (P, r, o) => { const out = []; for (let i = 0; i < P.length - 1; i++) out.push(G.cyl(P[i], P[i + 1], r, Object.assign({ n: 7, gen: 0 }, o))); return out; };

/* ================= the mount ================= */
/* M: static above deck (barbette ring) */
function baseAbove() {
  return [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, 3.05], [.28, 3.05]], { n: 60, gen: 0, rings: [0, 1] }),
    G.lathe([0, .01, 0], [0, 1, 0], [[0, 3.45], [.001, 3.45]], F({ n: 60, gen: 0 })),
  ];
}
/* M: static below deck (seen only in the X-ray): roller path, slip rings, the power column, coolant risers */
function baseBelow() {
  const P = [], yF = FL - GY;
  P.push(G.lathe([0, -.95, 0], [0, 1, 0], [[0, 2.7], [.62, 2.7]], { n: 56, gen: 10, rings: [0, 1] }));
  P.push(G.lathe([0, -.95, 0], [0, 1, 0], [[0, 2.3], [.5, 2.3]], { n: 48, gen: 0, rings: [0, 1] }));
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, c = Math.cos(a), s = Math.sin(a); P.push(G.cyl([c * 2.32, -.6, s * 2.32], [c * 2.68, -.6, s * 2.68], .09, F({ n: 6, gen: 0 }))); }
  P.push(G.cyl([0, yF, 0], [0, -.25, 0], .5, { n: 22, gen: 4 }));                             // power column
  for (const y of [yF + .15, yF + 1.6, yF + 3.1]) P.push(G.lathe([0, y, 0], [0, 1, 0], [[0, .66], [.14, .66]], { n: 24, gen: 0, caps: true }));
  P.push(G.lathe([0, -1.55, 0], [0, 1, 0], [[0, .9], [.75, .9]], { n: 30, gen: 6, caps: true, rings: [0, 1] }));   // slip-ring housing
  P.push(G.lathe([0, 6.35 - GY, 0], [0, 1, 0], [[0, .95], [.14, .95]], { n: 34, gen: 0, caps: true }));          // collector ring
  for (const s of [-1, 1]) {
    P.push(G.cyl([s * .64, yF + .15, 0], [s * .64, -.55, 0], .075, { n: 7, gen: 0 }));
    P.push(G.cyl([s * .64, -.55, 0], [s * 3.6, -.55, 0], .075, { n: 7, gen: 0 }));
  }
  return P;
}
/* M: heat exchangers under the vent hatches (fins show when the hatch opens) */
function exchanger(s) {
  const P = [G.box([s * 3.55, -1.2, -1.2], [s * 4.85, -.14, 1.2], { skip: [1] })];
  for (let z = -1.08; z <= 1.09; z += .16) P.push(G.box([s * 3.62, -.4, z - .012], [s * 4.78, -.06, z + .012], { skip: [0, 2, 3, 4, 5] }));
  P.push(G.box([s * 3.5, -.02, -1.3], [s * 4.9, .08, -1.22], F()), G.box([s * 3.5, -.02, 1.22], [s * 4.9, .08, 1.3], F()));
  return P;
}
/* M: vent hatch lid, hinge on the outboard edge */
const HATCH_HINGE = s => [s * 4.9, .08, 0];
function hatchLid(s) {
  const P = [G.box([s * 3.5, 0, -1.26], [s * 4.9, .1, 1.26])];
  for (let z = -.9; z <= .91; z += .6) P.push(G.line([[s * 3.62, .105, z], [s * 4.78, .105, z]], F({ w: .5 })));
  P.push(G.cyl([s * 4.9, .08, -1.1], [s * 4.9, .08, 1.1], .05, F({ n: 6, gen: 0 })));
  return P;
}
/* T: the gunhouse, split by the barrel slot */
function turret() {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(G.hex([[s * .64, .3, -3.6], [s * 2.62, .3, -3.6], [s * 2.3, .3, 2.45], [s * .64, .3, 2.45], [s * .64, 2.78, -3.2], [s * 1.92, 2.78, -3.2], [s * 1.5, 2.78, .95], [s * .64, 2.78, .95]]));
    for (let k = 0; k < 5; k++) { const z = -2.6 + k * .32; P.push(G.line([[s * 2.5, .9, z], [s * 2.18, 2.0, z + .08]], F({ w: .5 }))); }
    P.push(G.cyl([s * .64, TRN[1], TRN[2]], [s * .95, TRN[1], TRN[2]], .32, { n: 16, gen: 0, caps: true }));
    P.push(G.line([[s * 1.72, 2.8, -2.9], [s * 1.72, 3.05, -2.9], [s * 1.4, 3.05, .5], [s * 1.4, 2.8, .5]], F({ w: .5 })));
  }
  P.push(G.box([-.64, 2.58, -3.2], [.64, 2.78, -1.3]));
  P.push(G.box([-.64, .3, -3.6], [.64, 2.58, -3.34]));
  P.push(G.lathe([0, 0, 0], [0, 1, 0], [[0, 2.72], [.32, 2.64]], { n: 56, gen: 0, rings: [0, 1] }));
  P.push(G.box([.9, 2.78, -2.7], [1.45, 3.2, -2.05], F()), G.cyl([1.18, 3.2, -2.38], [1.18, 3.55, -2.38], .06, F({ n: 6, gen: 0 })));
  P.push(G.panel([[-1.4, .7, -3.62], [-.8, .7, -3.62], [-.8, 2.2, -3.62], [-1.4, 2.2, -3.62]], F({ al: .6 })));
  return P;
}
/* B: rail housing (rear section), cage bands, insulator spacers, breech, trunnion */
const RZ0 = -1.9, RZ1 = 5.4;
function barrelRear() {
  const P = [];
  P.push(G.box([-.4, .22, RZ0], [.4, .5, RZ1]), G.box([-.4, -.5, RZ0], [.4, -.22, RZ1]));
  for (let z = RZ0 + .35; z < RZ1 - .1; z += .36) for (const s of [-1, 1]) P.push(G.box([s * .13 - .035, -.2, z], [s * .13 + .035, .2, z + .11], F()));
  for (let z = -1.55; z <= 5.2; z += .675) {
    P.push(G.box([-.46, .5, z], [.46, .56, z + .1]), G.box([-.46, -.56, z], [.46, -.5, z + .1]));
    for (const s of [-1, 1]) P.push(G.box([s * .4, .3, z], [s * .46, .5, z + .1], F()), G.box([s * .4, -.5, z], [s * .46, -.3, z + .1], F()));
  }
  P.push(G.box([-.54, -.64, -2.4], [.54, .64, RZ0]));
  P.push(G.box([-.26, .64, -2.35], [.26, .82, -1.98], F()), G.box([-.26, -.92, -2.35], [.26, -.64, -1.98]));
  P.push(G.box([-.5, -.62, -.38], [.5, .62, .38]));
  P.push(G.cyl([-.64, 0, 0], [.64, 0, 0], .18, { n: 12, gen: 0 }));
  return P;
}
const barrelRails = z1 => [G.box([-.1, .14, RZ0], [.1, .22, z1]), G.box([-.1, -.22, RZ0], [.1, -.14, z1])];
/* B: side cover, hinge on the top outer edge */
const COVER_HINGE = s => [s * .52, .56, 0];
function cover(s) {
  const P = [G.box([s * .47, -.56, -1.45], [s * .52, .56, 5.2])];
  for (let z = -.9; z < 5.2; z += 1.2) P.push(G.line([[s * .525, -.46, z], [s * .525, .46, z]], F({ w: .45 })));
  return P;
}
/* E: the muzzle sleeve (rides over the front of the rear section, runs out EXT to extend the rails) */
function sleeve() {
  const P = [];
  P.push(G.box([-.58, .5, SLV0], [.58, .62, SLV1]), G.box([-.58, -.62, SLV0], [.58, -.5, SLV1]));
  for (const s of [-1, 1]) P.push(G.box([s * .52, -.5, SLV0], [s * .58, .5, SLV1]));
  for (let z = SLV0 + .3; z < SLV1 - .4; z += .7) P.push(G.box([-.62, -.66, z], [.62, .66, z + .09], { skip: [2, 4] }));
  P.push(G.box([-.66, -.74, SLV1 - .26], [.66, .74, SLV1], { skip: [5] }));
  P.push(G.lathe([0, 0, SLV1], [0, 0, 1], [[0, .34], [.06, .34]], { n: 22, gen: 0, caps: false }));
  P.push(G.lathe([0, 0, SLV1 - .26], [0, 0, 1], [[0, .9], [.26, .9]], F({ n: 40, gen: 0, rings: [0, 1] })));
  for (const s of [-1, 1]) P.push(G.box([s * .6 - .04, -.4, SLV0 - .1], [s * .6 + .04, .4, SLV0 + .12], F()));
  return P;
}
const sleeveRails = () => [G.box([-.1, .14, SLV0], [.1, .22, SLV1 - .02]), G.box([-.1, -.22, SLV0], [.1, -.14, SLV1 - .02])];
/* E: muzzle cover petals (top +1 / bottom -1), hinged on the outer edge of the muzzle face */
const PETAL_HINGE = s => [0, s * .74, SLV1 + .03];
function petal(s) {
  const y0 = s > 0 ? 0 : -.74, y1 = s > 0 ? .74 : 0;
  const P = [G.box([-.66, y0, SLV1], [.66, y1, SLV1 + .06])];
  P.push(G.line([[-.5, s * .37, SLV1 + .065], [.5, s * .37, SLV1 + .065]], F({ w: .5 })));
  return P;
}

/* ================= the power room (ship frame) ================= */
const ALT = [[-2.1, 2.75, 42.6], [2.1, 2.75, 42.6], [-2.1, 2.75, 45.6], [2.1, 2.75, 45.6]];
const RACKS = [];
for (const s of [1, -1]) for (const [z0, z1] of [[47.3, 50.5], [50.9, 54.1]]) RACKS.push({ s, z0, z1, zm: (z0 + z1) / 2 });
const MOD = [];                    // module centres, charge order: rack by rack, bottom shelf up
RACKS.forEach((rk, r) => { for (let k = 0; k < 4; k++) for (let j = 0; j < 5; j++) MOD.push({ r, s: rk.s, p: [rk.s * 2.22, FL + .61 + k * 1.12, rk.z0 + .32 + j * .64] }); });
/* alternator (A frame: centre, axis +Z): stator cage + skid (static), end bells (exploded), rotor (spins) */
function altStator() {
  const P = [];
  for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + .1; P.push(G.cyl([Math.cos(a) * 1.02, Math.sin(a) * 1.02, -.92], [Math.cos(a) * 1.02, Math.sin(a) * 1.02, .92], .055, { n: 5, gen: 0 })); }
  for (const z of [-.9, 0, .9]) P.push(G.lathe([0, 0, z - .05], [0, 0, 1], [[0, 1.08], [.1, 1.08]], { n: 36, gen: 0, rings: [0, 1] }));
  P.push(G.box([-1.2, -1.45, -1.55], [1.2, -1.28, 1.55]));
  for (const s of [-1, 1]) {
    P.push(G.box([-.32, -1.28, s * 1.42 - .13], [.32, -.12, s * 1.42 + .13]));
    P.push(G.lathe([0, 0, s * 1.42 - .15], [0, 0, 1], [[0, .2], [.3, .2]], { n: 12, gen: 0, caps: true }));
    P.push(G.box([s * .75, -1.28, -.7], [s * .95, -.72, .7], F()));
  }
  P.push(G.box([-.42, 1.06, -.36], [.42, 1.5, .36]));                    // rectifier on top, where the bus leaves
  return P;
}
function altBell(s) {
  return [G.lathe([0, 0, s * .95], [0, 0, s], [[0, 1.12], [.16, 1.1], [.28, .55], [.3, .22]], { n: 36, gen: 6, rings: [0, 1, 2], caps: true }),
          G.cyl([0, 0, s * 1.25], [0, 0, s * 1.3], .2, F({ n: 10, gen: 0 }))];
}
function altRotor() {
  const P = [G.lathe([0, 0, -.8], [0, 0, 1], [[0, .8], [1.6, .8]], { n: 44, gen: 0, caps: true, rings: [0, 1] })];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, c = Math.cos(a), s = Math.sin(a); P.push(G.cyl([c * .84, s * .84, -.78], [c * .84, s * .84, .78], .05, { n: 5, gen: 0 })); }
  for (const z of [-.82, .82]) for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; P.push(G.line([[Math.cos(a) * .15, Math.sin(a) * .15, z], [Math.cos(a) * .76, Math.sin(a) * .76, z]], { w: .9 })); }
  P.push(G.cyl([0, 0, -1.5], [0, 0, 1.5], .11, { n: 8, gen: 0 }));
  return P;
}
/* capacitor module (local: centre; the terminal face is -X, toward the aisle on the starboard racks) */
function module() {
  return [G.box([-.55, -.36, -.24], [.55, .36, .24]),
          G.panel([[-.555, -.26, -.17], [-.555, .26, -.17], [-.555, .26, .17], [-.555, -.26, .17]], F({ al: .6 })),
          G.cyl([-.55, .24, -.11], [-.66, .24, -.11], .04, F({ n: 6, gen: 0 })), G.cyl([-.55, .24, .11], [-.66, .24, .11], .04, F({ n: 6, gen: 0 }))];
}
function racks() {
  const P = [];
  for (const rk of RACKS) {
    const s = rk.s, xi = s * 1.52, xo = s * 2.95;
    for (const x of [xi, xo]) for (const z of [rk.z0, rk.z1]) P.push(G.box([x - .04, FL, z - .04], [x + .04, FL + 4.66, z + .04]));
    for (let k = 0; k <= 4; k++) { const y = FL + .12 + k * 1.12; P.push(G.box([Math.min(xi, xo), y, rk.z0], [Math.max(xi, xo), y + .05, rk.z1], { pts: k === 0 || k === 4 })); }
    P.push(bar([s * 1.44, FL + .2, rk.zm], [s * 1.44, FL + 4.6, rk.zm], .16, .05, [1, 0, 0]));   // riser bus
  }
  return P;
}
function switchgear() {
  const P = [];
  for (const [x0, x1] of [[-1.35, -.47], [-.43, .43], [.47, 1.35]]) {
    P.push(G.box([x0, FL, 54.5], [x1, FL + 3.4, 55.5]));
    P.push(G.panel([[x0 + .08, FL + .5, 54.49], [x1 - .08, FL + .5, 54.49], [x1 - .08, FL + 3.0, 54.49], [x0 + .08, FL + 3.0, 54.49]], F({ al: .6 })));
    P.push(G.cyl([x1 - .16, FL + 1.6, 54.49], [x1 - .16, FL + 1.6, 54.36], .05, F({ n: 6, gen: 0 })));
  }
  P.push(G.cyl([-1.1, FL + 3.62, 55.0], [1.1, FL + 3.62, 55.0], .2, { n: 14, gen: 0, caps: true }));
  return P;
}
function pumpSet() {
  return [G.cyl([0, 1.95, 41.9], [0, 1.95, 43.2], .4, { n: 18, gen: 0, caps: true }), G.box([-.38, FL, 43.2], [.38, 2.4, 44.1]),
          G.cyl([0, FL, 45.3], [0, 3.1, 45.3], .34, { n: 16, gen: 0, caps: true })];
}
function floor() {
  const P = [];
  for (let z = 41.2; z <= 55.7; z += .6) P.push(G.line([[-3.3 + .8 * (z - 41) / 15, FL, z], [3.3 - .8 * (z - 41) / 15, FL, z]], { w: .25 }));
  return P;
}
/* bus bar routes (ship frame) and the coolant loop */
const BUS_A = ALT.map(([x, y, z], k) => { const s = Math.sign(x), xi = s * (.55 + .24 * (k >> 1)); return [[x, y + 1.5, z], [x, 6.75, z], [xi, 6.75, z], [xi, 6.75, 54.95], [xi, FL + 3.4, 54.95]]; });
const BUS_B = RACKS.map(rk => [[rk.s * .9, FL + .3, 54.45], [rk.s * 1.18, FL + .2, 54.2], [rk.s * 1.18, FL + .2, rk.zm], [rk.s * 1.44, FL + .2, rk.zm]]);
const BUS_C = RACKS.map(rk => { const d = V.norm([rk.s * 1.44, 0, rk.zm - GZ]); return [[rk.s * 1.44, FL + 4.6, rk.zm], [rk.s * 1.44, 6.35, rk.zm], [d[0] * .95, 6.35, GZ + d[2] * .95]]; });
const COOL_S = [[0, 1.95, 43.2], [.34, 1.5, 43.6], [.34, 1.5, GZ], [.64, 1.5, GZ], [.64, GY - .55, GZ], [3.6, GY - .55, GZ]];
const COOL_S2 = [[.34, 1.5, GZ], [.34, 1.5, 54.4]];
const COOL_R = COOL_S.map(p => [-p[0], p[1], p[2]]).reverse(), COOL_R2 = [[-.34, 1.5, 54.4], [-.34, 1.5, GZ]];
function busPrims() {
  const P = [];
  for (const p of BUS_A) P.push(...bars(p, .16, .06, [0, 0, 1]));
  for (const p of BUS_B) P.push(...bars(p, .16, .05, [0, 1, 0]));
  for (const p of BUS_C) P.push(...bars(p, .16, .05, [0, 1, 0]));
  return P;
}
function coolPrims() {
  const P = [];
  const lo = COOL_S.slice(0, 4);
  for (const p of [lo, lo.map(q => [-q[0], q[1], q[2]]), COOL_S2, COOL_R2]) P.push(...pipes(p, .075));
  return P;
}
/* a polyline with cumulative lengths, for pulses along it */
function poly(P) { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + V.dist(P[i], P[i - 1])); return { P, c, L: c[c.length - 1] }; }
function polyAt(pl, s, out) {
  const P = pl.P, c = pl.c; let i = 1; while (i < P.length - 1 && c[i] < s) i++;
  const k = E.clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), 0, 1), a = P[i - 1], b = P[i];
  out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out;
}

/* ================= a fine patch of the hull round the mount (the ship cloud is cut there) =================
   Section curves copied from hd_sea_air.js (DDG-51): half breadth at the deck hB, at the waterline hW, deck hD. */
const ZB = 77.6, ZST = 70.6, CUT = [41, 64];
const hB = z => { const u = z / ZB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); return 10; };
const hW = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); return 9; };
function sec(z) { const d = hD(z), b = hB(z), w = hW(z), yk = d - Math.min(1.6, d * .3); return { w: [w, 0], k: [w + (b - w) * .9, yk], d: [b, d] }; }
const skin = (q, n, o) => G.hex([...q, ...q.map(p => V.mad(p, n, .01))], Object.assign({ skip: [2, 3, 4, 5] }, o || {}));
function hullPatch() {
  const P = [], Z = []; for (let z = CUT[0]; z < CUT[1] + .01; z += .5) Z.push(z);
  const HX = [3.5, 4.9], HZ = [GZ - 1.26, GZ + 1.26];
  for (let i = 0; i < Z.length - 1; i++) {
    const z0 = Z[i], z1 = Z[i + 1], a = sec(z0), b = sec(z1);
    for (const s of [-1, 1]) {
      const p = (q, z) => [s * q[0], q[1], z];
      P.push(skin([p(a.w, z0), p(b.w, z1), p(b.k, z1), p(a.k, z0)], [s, 0, 0]));
      P.push(skin([p(a.k, z0), p(b.k, z1), p(b.d, z1), p(a.d, z0)], [s, 0, 0]));
    }
    // deck, with the vent hatch openings
    const zm = (z0 + z1) / 2, hole = zm > HZ[0] && zm < HZ[1];
    const xs = hole ? [[-a.d[0], -HX[1]], [-HX[0], HX[0]], [HX[1], a.d[0]]] : [[-a.d[0], a.d[0]]];
    for (const [x0, x1] of xs) {
      const f = x => x === -a.d[0] ? -b.d[0] : x === a.d[0] ? b.d[0] : x;
      P.push(skin([[x0, a.d[1], z0], [x1, a.d[1], z0], [f(x1), b.d[1], z1], [f(x0), b.d[1], z1]], [0, 1, 0]));
    }
  }
  for (const s of [-1, 1]) for (const key of ['k', 'd']) { const L = Z.map(z => { const q = sec(z)[key]; return [s * q[0], q[1] + .01, z]; }); P.push(G.line(L, { w: .8 })); }
  return P;
}

/* ================= the X-ray point pass =================
   XS.zo / zs: the opening and shutting slices (ship z, both sweep bow -> stern); open where zo < z < zs inside
   the box. md 0 plain · 1 shell (thinned where open, lime at the slices) · 3 hidden (seen only where open).
   S: model -> ship transform for clouds not in the ship frame (or null); zfix: test this ship z instead. */
const XS = { zo: 99, zs: 99, ko: 1, ks: 1, box: [-11, 11, -1.5, 10.5, 40.4, 57.6], dim: 1 };
const LIME = K.LIME, WH = K.WH;
const XO = { a: 1, fade: 900, back: .1, lime: 0, keep: 1, md: 0, zfix: undefined, size: 1, S: null, tint: null, tk: 0, cut: null, px: 4.4 };
const XOO = Object.assign({}, XO);
function xopt(o) { for (const k in XO) XOO[k] = o && o[k] !== undefined ? o[k] : XO[k]; return XOO; }
function runX(P, i0, i1, sp, o, md, step) {
  const x = XMR, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, BW = 1920, BH = 1080;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, big = o.size, omd = o.md, allThin = md === 2;
  const lm = o.lime;
  let cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
  if (o.tint) { const tk = o.tk; cr += (o.tint[0] - cr) * tk; cg += (o.tint[1] - cg) * tk; cb += (o.tint[2] - cb) * tk; }
  const zo = XS.zo, zs = XS.zs, ko = XS.ko, ks = XS.ks, bx = XS.box, S = o.S, zfix = o.zfix, dim = XS.dim, cut = o.cut, c0 = cut ? cut[0] : 0, c1 = cut ? cut[1] : 0;
  const anyOpen = zo < 90;
  for (let i = i0, j = i0 * 6; i < i1; i += step, j += 6 * step) {
    const hs = (i * .6180339887) % 1;
    if (keep < 1 && hs > keep) continue;
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    if (cut && pz > c0 && pz < c1) continue;
    let k = 0, thin = allThin;
    if (md === 1) {
      let open = false;
      if (anyOpen) {
        let qx = px, qy = py, qz = pz;
        if (S) { qx = S.R[0] * px + S.R[1] * py + S.R[2] * pz + S.T[0]; qy = S.R[3] * px + S.R[4] * py + S.R[5] * pz + S.T[1]; qz = S.R[6] * px + S.R[7] * py + S.R[8] * pz + S.T[2]; }
        const z = zfix === undefined ? qz : zfix;
        if (qx > bx[0] && qx < bx[1] && qy > bx[2] && qy < bx[3] && z > bx[4] && z < bx[5]) {
          open = z > zo && z < zs;
          let d = z - zo;
          if (d > -.05 && d < 6) k = ko * (d < 0 ? 1 + d / .05 : d < .15 ? 1 : Math.exp(-(d - .15) * .9) * .75);
          d = z - zs;
          if (d > -.05 && d < 1.5) { const k2 = ks * (d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 3.5) * .7); if (k2 > k) k = k2; }
          if (omd === 3) { if (!open && k < .2) continue; }
          else if (open && k < .3) { if (hs > .36) continue; thin = true; }
        } else if (omd === 3) continue;
      } else if (omd === 3) continue;
    }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const iz = F_ / zc;
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz; if (sy < 0 || sy >= BH) continue;
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5];
    let b, bk = false;
    if (nx === 0 && ny === 0 && nz === 0) b = .5;
    else {
      const dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez);
      if (dn > 0) { if (i % 3) continue; b = back; bk = true; }
      else {
        let fac = -dn / zc; if (fac > 1) fac = 1;
        const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
        b = .06 + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
      }
    }
    b *= zc < fade ? A - kf * zc : kfar;
    if (thin) b = (bk ? .035 : .035 + .16 * b) * dim;
    let r = cr, g = cg, bl = cb;
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const pxs = sp * iz * big;
    if (pxs <= 3.6) {
      const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
      if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    } else K.pb.dot(sx, sy, pxs > 7.5 ? 3 : 2, r, g, bl, b);
  }
}
let NP = 0, XMR = null;
function sphereIn(mx, my, mz, rad) {
  const x = XMR, C = K.C, zc = x[6] * mx + x[7] * my + x[8] * mz + x[11];
  if (zc < C.near - rad) return false;
  const xc = x[0] * mx + x[1] * my + x[2] * mz + x[9], yc = x[3] * mx + x[4] * my + x[5] * mz + x[10];
  const Fl = C.fl, xr = (1920 - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
/* per cell: 0 plain (no X-ray tests), 1 per-point tests, 2 all thin (every 3rd point), -1 skip */
function cellMode(o, mx, my, mz, rad) {
  const md = o.md; if (!md) return 0;
  const zo = XS.zo, zs = XS.zs, bx = XS.box;
  if (zo > 90) return md === 3 ? -1 : 0;
  const S = o.S;
  let qx = mx, qy = my, qz = mz;
  if (S) { qx = S.R[0] * mx + S.R[1] * my + S.R[2] * mz + S.T[0]; qy = S.R[3] * mx + S.R[4] * my + S.R[5] * mz + S.T[1]; qz = S.R[6] * mx + S.R[7] * my + S.R[8] * mz + S.T[2]; }
  const z = o.zfix === undefined ? qz : o.zfix, rz = o.zfix === undefined ? rad : 0;
  const outBox = qx + rad < bx[0] || qx - rad > bx[1] || qy + rad < bx[2] || qy - rad > bx[3] || z + rz < bx[4] || z - rz > bx[5];
  if (outBox) return md === 3 ? -1 : 0;
  const inBox = qx - rad > bx[0] && qx + rad < bx[1] && qy - rad > bx[2] && qy + rad < bx[3] && z - rz > bx[4] && z + rz < bx[5];
  if (!inBox) return 1;
  const quiet = (z - rz - zo > 6 || XS.ko < .01) && (zs - (z + rz) > 1.6 || XS.ks < .01 || zs > 90);
  const openAll = z - rz > zo && z + rz < zs, shutAll = z + rz < zo - .06 || z - rz > zs + 1.6;
  if (md === 3) { if (shutAll) return -1; return openAll && quiet ? 0 : 1; }
  if (shutAll) return 0;
  return openAll && quiet ? 2 : 1;
}
function drawX(ml, Tw, o) {
  XMR = K.prep(Tw);
  const CH = ml.ch, SD = ml.sd, nl = ml.nl, Fl = K.C.fl, oo = xopt(o), PX = oo.px, PX0 = 18;
  const x = XMR, ex = x[12], ey = x[13], ez = x[14];
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(mx, my, mz, rad)) continue;
    const md = cellMode(oo, mx, my, mz, rad); if (md < 0) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.05, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    let li = nl - 1; while (li > 1 && ml.sp[li] * Fl / d > PX) li--;
    if (li === 1 && ml.sp[1] * Fl / d > PX0) li = 0;
    const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
    if (i1 > i0) { const st = md === 2 ? 3 : 1; runX(ml.lv[li], i0, i1, ml.sp[li], oo, md, st); NP += (i1 - i0) / st; }
  }
}

/* ================= build ================= */
function build() {
  const t0 = performance.now();
  const LM = [.025, .05, .1, .2, .4], LR = [.03, .06, .12, .24, .48], LQ = [.05, .1, .2, .4, .8];
  const lp = (P, L, seed, cs) => K.lodPrims(P, L, seed, cs || .6);
  const CL = {
    baseAbove: lp(baseAbove(), LM, 201), baseBelow: lp(baseBelow(), LR, 202, .9),
    exS: lp(exchanger(1), LM, 203), exP: lp(exchanger(-1), LM, 204),
    hatchS: lp(hatchLid(1), LM, 205), hatchP: lp(hatchLid(-1), LM, 206),
    turret: lp(turret(), LM, 207, .8), rear: lp(barrelRear(), LM, 208, .8),
    railsR: lp(barrelRails(RZ1), LM, 209), coverS: lp(cover(1), LM, 210), coverP: lp(cover(-1), LM, 211),
    sleeve: lp(sleeve(), LM, 212, .8), railsE: lp(sleeveRails(), LM, 213), petalT: lp(petal(1), LM, 214), petalB: lp(petal(-1), LM, 215),
    stator: lp(altStator(), LQ, 216, .8), bellF: lp(altBell(1), LQ, 217), bellA: lp(altBell(-1), LQ, 218), rotor: lp(altRotor(), LR, 219),
    module: lp(module(), LQ, 220), racks: lp(racks(), LQ, 221, .9), sw: lp(switchgear(), LR, 222, .9), pump: lp(pumpSet(), LR, 223),
    rackMods: RACKS.map((rk, r) => lp(MOD.filter(m => m.r === r).flatMap(m => { const Tm = X.make(m.s > 0 ? R.I() : R.y(PI), m.p); return module().map(pr => { const q = Object.assign({}, pr); if (pr.p) q.p = pr.p.map(p => X.ap(Tm, p)); if (pr.t === 'lathe') { q.a = X.ap(Tm, pr.a); q.d = X.dir(Tm, pr.d); } return q; }); }), LQ, 230 + r, .9)),
    hullP: lp(hullPatch(), [.035, .07, .14, .28, .56], 227, 1.4),
    floor: lp(floor(), [.06, .12, .24, .48, .96], 224, 1.2), bus: lp(busPrims(), LR, 225, .9), cool: lp(coolPrims(), LR, 226, .9),
  };
  CL.ms = performance.now() - t0;
  return CL;
}

window.RGP = {
  GZ, GY, M0, FL, CUT, TRN, SLV0, SLV1, EXT, MZ_E, RZ0, RZ1, ALT, RACKS, MOD,
  HATCH_HINGE, COVER_HINGE, PETAL_HINGE,
  BUS_A: BUS_A.map(poly), BUS_B: BUS_B.map(poly), BUS_C: BUS_C.map(poly),
  COOL: [COOL_S, COOL_S2, COOL_R, COOL_R2].map(poly),
  poly, polyAt, XS, drawX, build, np: () => { const n = NP; NP = 0; return n; },
};
})();
