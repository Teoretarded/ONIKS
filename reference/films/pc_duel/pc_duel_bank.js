/* RAILGUN · DUEL: the power room's pulse-forming network (window.RGB), the capacitor banks under the mount and the
   liquid helium that cools their superconducting parts. Loaded after pc_duel_parts.js (window.RGP), drawn by
   pc_duel_film.js in base time.
   The banks: four racks of twenty PFN modules (2 MJ at 11 kV each, 160 MJ in all). A module (local frame: its centre,
   the terminal face -X toward the aisle; the port racks turned 180 deg): a steel case (frame, lid, sides on slides,
   the back's vents), four film capacitor cans (8.3 mF, 500 kJ each) with their bushings, the laminated bus plates,
   the thyristor switch (three press-pack discs between finned heat sinks in a clamp), the crowbar diode stack, the
   pulse-shaping inductor (a superconducting winding in its own small cryostat, fed helium through a bayonet in the
   lid), the front panel (handles, two output bushings, the status window). Each rack: its vertical output bus, a
   superconducting bus duct along its top (vacuum-jacketed). At the aft end of each side a switch bay: the charge
   contactor (three poles in arc chutes, the armature closing), the dump switch (a knife that swings open), the dump
   resistor grid.
   The helium plant aft between the alternators: the compressor (motor and screw stage on a skid; the engine
   insert's feeder ends at its drive box), the cold box (a liquefier: the vacuum vessel, the 80 K shield, two
   turbo-expanders on top, the 4.2 K pot), the dewar of liquid helium; from it vacuum-jacketed transfer lines run up
   and forward over both aisles, down a riser at each rack and along each shelf, a bayonet into every module.
   Render is a pure function of base time T: the cold front's reach, the frost and the vapour, the lightning scan's
   hops, the module's exploded view; no Math.random, no allocation in the per-dot loops. */
(function () {
'use strict';
const { V, R, X, E, rng } = M3;
const G = GEO, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const F = o => Object.assign({ fine: true }, o || {});
const P_ = window.RGP;
const FL = P_.FL, RACKS = P_.RACKS, MOD = P_.MOD, NMOD = MOD.length;
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const ss = (a, b, v) => E.ss(a, b, v);
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0], Q4 = [0, 0, 0];
function apI(Tw, x, y, z, out) {
  const M = Tw.R, t = Tw.T;
  out[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; out[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; out[2] = M[6] * x + M[7] * y + M[8] * z + t[2];
  return out;
}

/* ================= layout ================= */
const CBX = [-.55, FL, 41.5], CB_R = .48, CB_H = 2.88;                 // cold box (foot centre)
const DWR = [.55, FL, 43.7], DW_R = .45, DW_H = 2.1;                  // dewar (foot centre); its neck to y NECK
const NECK = FL + 2.45;
const CMP = { x: .62, y: FL + .42, z0: 40.72, z1: 41.62, z2: 41.68, z3: 42.46 };   // compressor: motor z0-z1, screw stage z2-z3
const CMP_HP = [[.62, FL + .68, 42.3], [.62, FL + 1.3, 42.3], [-.55, FL + 1.3, 42.3], [-.55, FL + 1.3, 41.98]];   // compressor -> cold box (warm, 1.8 MPa)
const YH = 5.75;                                                      // the transfer header's height
const HX = 1.72;                                                      // the header and branches (|x|) over the rack fronts
const yb = k => FL + .84 + k * 1.12;                                  // shelf k's helium branch
const ytop = k => FL + .69 + k * 1.12;                                // shelf k's module tops
const RZ = rk => rk.z1 - .1;                                          // a rack's riser (z)
const XM = 7;                                                         // the module drawn out and exploded (rack 0, shelf 1, slot 2)
const MOD_L = MOD.map(m => X.make(m.s > 0 ? R.I() : R.y(PI), m.p));
/* the PFN modules charge in waves down the aisle, aft to forward: by slot along the side (10), then shelf (4), both sides
   together: rank 0..39 */
const RANK = MOD.map(m => { const rk = RACKS[m.r], q = Math.round((m.p[2] - rk.z0 - .38) / .64), k = Math.round((m.p[1] - FL - .43) / 1.12); return (rk.j * 5 + q) * 4 + k; });
const NRANK = 40;

/* ================= the cold front's network: polylines with their distance from the dewar's neck ================= */
const NET = [];          // { pl, d0, kind }
const poly = P_.poly;
function addNet(P, d0, kind, extra) { const pl = poly(P); NET.push(Object.assign({ pl, d0, kind }, extra || {})); return d0 + pl.L; }
const TRUNK = [[DWR[0], NECK, DWR[2]], [DWR[0], YH, DWR[2]], [DWR[0], YH, 46.6]];
const dTrunk = addNet(TRUNK, 0, 'trunk');
const BAYD = new Float64Array(NMOD);     // each module's bayonet: the front's distance to it
const SIDES = [1, -1].map(s => [[DWR[0], YH, 46.6], [s * HX, YH, 46.6], [s * HX, YH, 55.0]]);
const RISERS = [], BRANCHES = [], JUMP = [];
SIDES.forEach((P, i) => {
  const s = i ? -1 : 1;
  addNet(P, dTrunk, 'side');
  const dCorner = dTrunk + Math.abs(s * HX - DWR[0]);
  for (const rk of RACKS) if (rk.s === s) {
    const rz = RZ(rk), dR = dCorner + (rz - 46.6);
    RISERS.push([[s * HX, YH, rz], [s * HX, yb(0), rz]]); addNet(RISERS[RISERS.length - 1], dR, 'riser');
    // the jumper up to the rack's superconducting bus duct
    JUMP.push([[s * HX, YH, rz], [s * HX, YH + .25, rz], [s * 2.5, YH + .25, rz], [s * 2.5, FL + 4.82, rz]]); addNet(JUMP[JUMP.length - 1], dR, 'jump');
    for (let k = 0; k < 4; k++) {
      const P = [[s * HX, yb(k), rz], [s * HX, yb(k), rk.z0 + .12]], dB = dR + (YH - yb(k));
      BRANCHES.push(P); addNet(P, dB, 'branch');
      MOD.forEach((m, mi) => { if (m.r === RACKS.indexOf(rk) && Math.abs(m.p[1] - (FL + .43 + k * 1.12)) < .01) BAYD[mi] = dB + (rz - m.p[2]) + .34 + .15; });
    }
  }
});
const NET_L = NET.reduce((a, n) => Math.max(a, n.d0 + n.pl.L), 0);
/* frost points (ship frame): the risers' tees, the header's corners, the dewar's neck and valves; each with its front distance */
const FROSTP = [];
FROSTP.push({ p: [DWR[0], NECK + .05, DWR[2]], d: 0, r: .1 }, { p: [DWR[0], YH, DWR[2]], d: YH - NECK, r: .07 }, { p: [DWR[0], YH, 46.6], d: dTrunk, r: .08 });
for (const n of NET) if (n.kind === 'riser') FROSTP.push({ p: n.pl.P[0], d: n.d0, r: .08 }, { p: n.pl.P[1], d: n.d0 + n.pl.L, r: .06 });

/* ================= geometry ================= */
const { bar, bars, pipes, circ, boxZ, lod, LF, LV, LB } = P_;
const LFF = [.004, .008, .016, .032, .064, .128];
/* a vacuum-jacketed line: the jacket (sparse), bellows every 0.45 m, clamps */
function vj(P, r) {
  const out = pipes(P, r, { ds: 1.6 });
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = V.dist(a, b), d = V.norm(V.sub(b, a));
    for (let s = .3; s < L - .15; s += .45) { const c = V.mad(a, d, s); out.push(circ(c, d, r * 1.3, F()), circ(V.mad(c, d, .03), d, r * 1.3, F()), circ(V.mad(c, d, .06), d, r * 1.3, F())); }
  }
  return out;
}
/* the module's parts (local) */
const M = { x0: -.4, x1: .4, h: .26 };
function modBase() {
  const P = [G.box([-.4, -.26, -.26], [.4, .26, .26], { edgeOnly: true })];
  P.push(G.panel([[-.4, -.26, -.26], [.4, -.26, -.26], [.4, -.26, .26], [-.4, -.26, .26]], { fill: true, ds: 3.6 }));
  P.push(G.panel([[.4, -.26, -.26], [.4, .26, -.26], [.4, .26, .26], [.4, -.26, .26]], { fill: true, ds: 4 }));
  for (let k = 0; k < 7; k++) P.push(G.line([[.402, -.18 + k * .06, -.18], [.402, -.18 + k * .06, .18]], F()));      // the back's vents
  for (const z of [-.2, .2]) P.push(bar([-.38, -.24, z], [.38, -.24, z], .04, .02, [0, 1, 0], F()));            // the cans' rails
  for (const z of [-.125, .125]) P.push(G.line([[-.02, -.24, z], [-.02, .24, z]], F()), G.line([[.3, -.24, z], [.3, .24, z]], F()));   // the straps
  return P;
}
function modLid() {
  const P = [G.panel([[-.4, .26, -.26], [.4, .26, -.26], [.4, .26, .26], [-.4, .26, .26]], { fill: true, ds: 3.4 })];
  P.push(G.line([[-.38, .262, -.24], [.38, .262, -.24], [.38, .262, .24], [-.38, .262, .24], [-.38, .262, -.24]], F()));
  P.push(G.panel([[.05, .263, -.15], [.3, .263, -.15], [.3, .263, .02], [.05, .263, .02]], F()));                 // the warning plate
  for (const x of [-.2, .2]) P.push(circ([x, .29, .17], [0, 0, 1], .03, F()), G.cyl([x, .26, .17], [x, .27, .17], .02, F()));
  P.push(circ([-.3, .265, 0], [0, 1, 0], .04), circ([-.3, .265, 0], [0, 1, 0], .028, F()));                     // the bayonet's socket
  return P;
}
function modSide(sz) {
  const z = sz * .26, P = [G.panel([[-.4, -.26, z], [.4, -.26, z], [.4, .26, z], [-.4, .26, z]], { fill: true, ds: 4 })];
  for (let k = 0; k < 8; k++) P.push(G.line([[-.3 + k * .08, -.12, z + sz * .002], [-.3 + k * .08, .12, z + sz * .002]], F()));   // louvres
  P.push(bar([-.4, 0, z + sz * .02], [.4, 0, z + sz * .02], .05, .03, [0, 0, 1]));                                  // the slide
  for (const x of [-.32, 0, .32]) P.push(G.cyl([x, 0, z + sz * .035], [x, 0, z + sz * .05], .012, F()));
  return P;
}
const shed = (a, d, L, r0, r1, n) => { const st = [[0, r0]]; for (let k = 0; k < n; k++) { const s = (k + .5) / n * L; st.push([s - .006, r0], [s - .003, r1], [s + .003, r1], [s + .006, r0]); } st.push([L, r0 * .7]); return G.lathe(a, d, st, { caps: true }); };
function modFront() {
  const x = -.405, P = [];
  P.push(G.panel([[x, -.26, -.26], [x, .26, -.26], [x, .26, .26], [x, -.26, .26]], { fill: true, ds: 3.4 }));
  P.push(G.line([[x - .002, -.235, -.235], [x - .002, .235, -.235], [x - .002, .235, .235], [x - .002, -.235, .235], [x - .002, -.235, -.235]], F()));
  for (const z of [-.215, .215]) P.push(...bars([[x, .12, z], [x - .07, .12, z], [x - .07, -.12, z], [x, -.12, z]], .02, .02, [0, 0, 1], F()));   // handles
  for (const z of [-.1, .1]) {                                                                                   // the output bushings and lugs
    P.push(shed([x, -.15, z], [-1, 0, 0], .1, .028, .044, 4), G.cyl([x - .1, -.15, z], [x - .14, -.15, z], .012, F()));
    P.push(bar([x - .13, -.15, z], [x - .13, -.26, z], .04, .012, [1, 0, 0], F()));
  }
  P.push(G.panel([[x - .002, .05, -.17], [x - .002, .05, .04], [x - .002, .1, .04], [x - .002, .1, -.17]], F()));   // the status window
  P.push(G.panel([[x - .002, .14, -.17], [x - .002, .14, .17], [x - .002, .2, .17], [x - .002, .2, -.17]], F()));   // the rating plate
  for (let k = 0; k < 3; k++) P.push(G.line([[x - .003, .155 + k * .015, -.15], [x - .003, .155 + k * .015, .12 - k * .05]], F()));
  P.push(circ([x - .003, -.02, .17], [1, 0, 0], .025, F()), circ([x - .003, -.02, .17], [1, 0, 0], .012, F()));   // the interlock plug
  return P;
}
/* a film capacitor can (local: its centre, the bushings' end -X): case, crimped bands, two bushings with sheds, studs */
function modCan() {
  const P = [G.box([-.17, -.095, -.095], [.2, .095, .095], { ds: 1.5, bottom: true })];
  for (const x of [-.12, .15]) P.push(G.line([[x, -.097, -.097], [x, .097, -.097], [x, .097, .097], [x, -.097, .097], [x, -.097, -.097]], F()));
  for (const z of [-.048, .048]) P.push(shed([-.17, 0, z], [-1, 0, 0], .07, .018, .03, 3), G.cyl([-.24, 0, z], [-.27, 0, z], .007, F()));
  P.push(G.panel([[-.05, .096, -.06], [.12, .096, -.06], [.12, .096, .06], [-.05, .096, .06]], F()));
  return P;
}
const CAN_P = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => [.17, a * .125, b * .125]);
/* the laminated bus plates over the bushings (two copper sheets and the insulation between) */
function modBus() {
  const P = [];
  for (const [x, w] of [[-.275, .21], [-.29, .2]]) P.push(G.panel([[x, -w, -w], [x, w, -w], [x, w, w], [x, -w, w]], { fill: true, ds: 2.4 }));
  P.push(G.line([[-.283, -.23, -.23], [-.283, .23, -.23], [-.283, .23, .23], [-.283, -.23, .23], [-.283, -.23, -.23]]));
  for (const c of CAN_P) for (const dz of [-.048, .048]) P.push(circ([-.278, c[1], c[2] + dz], [1, 0, 0], .016, F()));
  P.push(bar([-.29, -.15, -.1], [-.36, -.15, -.1], .04, .01, [1, 0, 0]), bar([-.29, -.15, .1], [-.36, -.15, .1], .04, .01, [1, 0, 0]));
  return P;
}
/* a press-pack stack along z (local: centre c): n discs between n + 1 finned heat sinks, clamp plates, tie rods */
function stack(c, n, r) {
  const P = [], hs = .028, dk = .024, L = (n + 1) * hs + n * dk;
  let z = c[2] - L / 2;
  for (let i = 0; i <= n; i++) {
    P.push(G.box([c[0] - .055, c[1] - .055, z], [c[0] + .055, c[1] + .055, z + hs], { ds: 1.2 }));
    for (let f = 0; f < 6; f++) P.push(G.line([[c[0] - .055 + f * .022, c[1] + .055, z + .004], [c[0] - .055 + f * .022, c[1] + .075, z + .004], [c[0] - .055 + f * .022, c[1] + .075, z + hs - .004], [c[0] - .055 + f * .022, c[1] + .055, z + hs - .004]], F()));
    z += hs;
    if (i < n) { const st = [[0, r * .7], [.002, r]]; for (let k = 1; k < 4; k++) st.push([k * dk / 4 - .002, r * .9], [k * dk / 4, r]); st.push([dk - .002, r], [dk, r * .7]); P.push(G.lathe([c[0], c[1], z], [0, 0, 1], st, { ds: .9 })); z += dk; }
  }
  for (const e of [-1, 1]) P.push(G.box([c[0] - .07, c[1] - .07, c[2] + e * (L / 2 + .012) - .008], [c[0] + .07, c[1] + .07, c[2] + e * (L / 2 + .012) + .008]));
  for (const [dx, dy] of [[-.06, -.06], [.06, .06]]) P.push(G.cyl([c[0] + dx, c[1] + dy, c[2] - L / 2 - .03], [c[0] + dx, c[1] + dy, c[2] + L / 2 + .03], .007, F()));
  return P;
}
const SCR_C = [-.33, .14, 0], DIO_C = [-.33, -.01, 0], IND_C = [-.33, -.165, 0];
function modSCR() { const P = stack(SCR_C, 3, .045); P.push(G.line([[SCR_C[0] - .055, SCR_C[1], -.01], [-.39, SCR_C[1] + .04, -.01], [-.39, .05, -.1]], F())); return P; }
function modDIO() { return stack(DIO_C, 2, .036); }
/* the superconducting pulse inductor's cryostat (axis z): the vessel, flanges, the vacuum port, the helium line up to the lid */
function modIND() {
  const c = IND_C, P = [G.lathe([c[0], c[1], -.2], [0, 0, 1], [[0, .055], [.012, .075], [.388, .075], [.4, .055]], { caps: true, ds: 1.4 })];
  for (const z of [-.19, .19]) P.push(circ([c[0], c[1], z], [0, 0, 1], .082));
  P.push(G.cyl([c[0], c[1] - .07, .1], [c[0], c[1] - .1, .1], .015, F()));
  P.push(...pipes([[c[0] + .03, c[1] + .07, .12], [c[0] + .03, .2, .12], [-.3, .2, .12], [-.3, .25, 0]], .011, F()));
  return P;
}
/* its winding (drawn lit when it carries current / when cold): a solenoid of 9 turns round a former */
function modCoil() {
  const c = IND_C, P = [], L = [];
  for (let k = 0; k <= 9 * 24; k++) { const a = k / 24 * TAU, z = -.16 + .32 * k / (9 * 24); L.push([c[0] + Math.cos(a) * .045, c[1] + Math.sin(a) * .045, z]); }
  P.push(G.line(L), G.cyl([c[0], c[1], -.17], [c[0], c[1], .17], .03, F({ ds: 1.6 })));
  return P;
}
/* the exploded view's offsets (module local; -X out into the aisle) and the order they part in */
const XP = {
  lid: [0, .46, 0], sideP: [0, 0, .4], sideN: [0, 0, -.4], front: [-.8, 0, 0], bus: [-.3, 0, 0],
  scr: [-.5, .44, 0], dio: [-.66, .04, 0], ind: [-.5, -.42, 0],
  can: CAN_P.map(c => [.4, c[1] * 1.1, c[2] * 1.2]),
};
/* while apart the parts float: a slow drift each (m), pure in the film's time */
const BOBV = [0, 0, 0];
let TNOW = 0;
function bob(key, e) { let h = 0; for (let i = 0; i < key.length; i++) h = h * 31 + key.charCodeAt(i); h = (h % 97) / 97 * TAU; const w = .012 * E.sat(e * 1.5 - .5); BOBV[0] = w * Math.sin(TNOW * .9 + h); BOBV[1] = w * 1.4 * Math.sin(TNOW * .7 + h * 1.7); BOBV[2] = w * Math.sin(TNOW * .8 + h * 2.3); return BOBV; }
const XORD = { lid: 0, sideP: .08, sideN: .08, front: .16, bus: .3, scr: .4, dio: .46, ind: .52, can: .6 };
/* the per-rack bayonet (module local): the stub off the shelf branch and its valve; the male bayonet down into the lid */
function bayH() { return [...pipes([[-.64, .41, 0], [-.3, .41, 0]], .016, F()), G.box([-.5, .39, -.025], [-.44, .43, .025], F()), G.cyl([-.47, .43, 0], [-.47, .5, 0], .006, F()), circ([-.47, .5, 0], [0, 1, 0], .025, F())]; }
function bayV() { return [G.cyl([-.3, .41, 0], [-.3, .275, 0], .022, F()), G.lathe([-.3, .3, 0], [0, 1, 0], [[0, .03], [.03, .03]], F({ caps: true })), circ([-.3, .4, 0], [0, 1, 0], .028, F())]; }
/* the transfer lines (ship frame) */
function heLines() {
  const P = [];
  P.push(...vj(TRUNK, .055));
  for (const S of SIDES) P.push(...vj(S, .05));
  for (const Rr of RISERS) P.push(...vj(Rr, .045));
  for (const B of BRANCHES) P.push(...vj(B, .03));
  for (const J of JUMP) P.push(...vj(J, .03));
  // supports from the deckhead
  for (const s of [1, -1]) for (let z = 47.2; z < 55; z += 1.5) P.push(G.line([[s * HX, YH + .06, z], [s * HX, P_.hD(z) - .25, z]], F()), G.line([[s * HX - .08, YH + .06, z], [s * HX + .08, YH + .06, z]], F()));
  // tees and valves at the risers' heads
  for (const Rr of RISERS) { const p = Rr[0]; P.push(G.box([p[0] - .07, p[1] - .07, p[2] - .07], [p[0] + .07, p[1] + .07, p[2] + .07]), G.cyl([p[0], p[1], p[2] - .07], [p[0], p[1], p[2] - .2], .015, F()), circ([p[0], p[1], p[2] - .2], [0, 0, 1], .04, F())); }
  return P;
}
/* the inner lines (shown in the X-ray: lime as they go cold) as polylines for the FX */
/* the superconducting bus ducts on the racks' tops */
function scBus() {
  const P = [];
  for (const rk of RACKS) {
    const s = rk.s, x = s * 2.62, y = FL + 4.86, z0 = rk.z0 + .1, z1 = rk.z1 - .1;
    P.push(G.lathe([x, y, z0], [0, 0, 1], [[0, .06], [.02, .08], [z1 - z0 - .02, .08], [z1 - z0, .06]], { caps: true, ds: 1.8 }));
    for (let z = z0 + .25; z < z1 - .1; z += .4) P.push(circ([x, y, z], [0, 0, 1], .095, F()));
    for (const z of [z0 + .3, (z0 + z1) / 2, z1 - .3]) P.push(G.box([x - .05, FL + 4.72, z - .04], [x + .05, y - .08, z + .04], F()));
    for (const z of [z0, z1]) P.push(G.box([x - .12, y - .12, z - .06], [x + .12, y + .12, z + .06]));
    P.push(...bars([[x, y - .12, z0], [x, FL + 4.6, z0], [s * 1.83, FL + 4.6, z0 - .06]], .08, .03, [0, 0, 1]));     // its lead down to the rack's bus
  }
  return P;
}
/* the inner superconducting bars (two) inside each duct, for the X-ray */
function scBusIn() { const P = []; for (const rk of RACKS) { const s = rk.s, x = s * 2.62, y = FL + 4.86; for (const dy of [-.025, .025]) P.push(bar([x, y + dy, rk.z0 + .15], [x, y + dy, rk.z1 - .15], .05, .012, [0, 1, 0])); } return P; }
/* a switch bay at the aft end of each side (s): frame, contactor base and chutes, coil, the dump resistor grid, the
   dump switch's jaw and pivot; cables to the rack */
const BAY_Z = [46.6, 47.75], BZM = 47.175;
function swBay(s) {
  const P = [], xi = s * 1.98, xo = s * 3.15, x = v => s * v;
  for (const xx of [xi, xo]) for (const z of BAY_Z) P.push(G.box([xx - .03, FL, z - .03], [xx + .03, FL + 2.3, z + .03], { edgeOnly: true }));
  for (const y of [FL + 1.15, FL + 2.3]) P.push(G.box([Math.min(xi, xo), y - .03, BAY_Z[0]], [Math.max(xi, xo), y, BAY_Z[1]], { edgeOnly: true }));
  // the back panel and the contactor: base, three poles with arc chutes, the fixed contacts
  P.push(G.panel([[x(3.1), FL + 1.18, BAY_Z[0]], [x(3.1), FL + 1.18, BAY_Z[1]], [x(3.1), FL + 2.26, BAY_Z[1]], [x(3.1), FL + 2.26, BAY_Z[0]]], { fill: true, ds: 2.6 }));
  for (const z of [46.82, 47.175, 47.53]) {
    P.push(G.box([Math.min(x(2.78), x(3.08)), FL + 1.62, z - .12], [Math.max(x(2.78), x(3.08)), FL + 2.12, z + .12], { ds: 1.4 }));
    for (let f = 0; f < 9; f++) P.push(G.line([[x(2.78), FL + 1.66 + f * .05, z - .11], [x(2.78), FL + 1.66 + f * .05, z + .11]], F()));
    P.push(G.box([Math.min(x(2.66), x(2.78)), FL + 1.5, z - .05], [Math.max(x(2.66), x(2.78)), FL + 1.56, z + .05], F()));
    P.push(bar([x(2.9), FL + 2.12, z], [x(2.9), FL + 2.3, z], .06, .02, [0, 0, 1]));
  }
  P.push(G.box([Math.min(x(2.7), x(3.05)), FL + 1.22, 46.75], [Math.max(x(2.7), x(3.05)), FL + 1.42, 47.6], { ds: 1.4 }));        // the closing coil
  for (let k = 0; k < 10; k++) P.push(G.line([[x(2.7), FL + 1.24 + k * .018, 46.78], [x(2.7), FL + 1.24 + k * .018, 47.57]], F()));
  // the dump resistor: six grid elements stacked, zig-zag ribbons
  for (let k = 0; k < 6; k++) {
    const y = FL + .1 + k * .14;
    P.push(G.box([Math.min(x(2.08), x(2.62)), y, 46.72], [Math.max(x(2.08), x(2.62)), y + .02, 47.62], { edgeOnly: true }));
    const L = []; for (let j = 0; j <= 22; j++) L.push([x(2.12 + (j % 2) * .46), y + .07, 46.76 + j * .038]); P.push(G.line(L, F()));
  }
  for (const z of [46.72, 47.62]) P.push(G.cyl([x(2.35), FL + .08, z], [x(2.35), FL + .98, z], .012, F()));
  // the dump switch's pivot and jaw
  P.push(G.box([Math.min(x(2.82), x(3.0)), FL + .9, 47.1], [Math.max(x(2.82), x(3.0)), FL + 1.0, 47.25]), G.box([Math.min(x(2.82), x(3.0)), FL + .3, 47.12], [Math.max(x(2.82), x(3.0)), FL + .42, 47.23]));
  // cables: the contactor to the rack's bus; the switch to the resistor
  P.push(...bars([[x(2.9), FL + 2.3, 47.53], [x(2.9), FL + 2.45, 47.75], [x(1.83), FL + 2.45, 47.92]], .1, .03, [0, 1, 0]));
  P.push(...bars([[x(2.9), FL + .36, 47.12], [x(2.62), FL + .36, 47.0]], .05, .015, [0, 1, 0], F()));
  return P;
}
const ctrArm = s => [G.box([Math.min(s * 2.6, s * 2.68), FL + 1.48, 46.68], [Math.max(s * 2.6, s * 2.68), FL + 1.58, 47.67], { ds: 1.2 }), ...[46.82, 47.175, 47.53].map(z => G.box([Math.min(s * 2.68, s * 2.76), FL + 1.5, z - .045], [Math.max(s * 2.68, s * 2.76), FL + 1.56, z + .045], F()))];
const knife = () => [bar([0, 0, -.03], [0, -.52, -.03], .04, .012, [0, 0, 1]), bar([0, 0, .03], [0, -.52, .03], .04, .012, [0, 0, 1]), G.cyl([0, 0, -.06], [0, 0, .06], .02, F()), G.box([-.03, -.32, -.03], [.03, -.26, .03], F())];
/* the helium plant */
function compressor() {
  const x = CMP.x, y = CMP.y, P = [];
  P.push(G.box([x - .42, FL, CMP.z0 - .12], [x + .42, FL + .14, CMP.z3 + .1], { ds: 1.6 }));
  P.push(G.lathe([x, y, CMP.z0], [0, 0, 1], [[0, .2], [.03, .26], [CMP.z1 - CMP.z0 - .03, .26], [CMP.z1 - CMP.z0, .2]], { caps: true, ds: 2 }));
  for (let k = 0; k < 18; k++) { const a = (k + .5) / 18 * TAU; if (Math.sin(a) > .7) continue; P.push(G.line([[x + Math.cos(a) * .26, y + Math.sin(a) * .26, CMP.z0 + .05], [x + Math.cos(a) * .3, y + Math.sin(a) * .3, CMP.z0 + .05], [x + Math.cos(a) * .3, y + Math.sin(a) * .3, CMP.z1 - .05]], F())); }
  P.push(G.box([x - .15, y + .24, 41.3], [x + .15, y + .4, 41.6], { ds: 1.2 }), G.cyl([x, y + .4, 41.45], [x, y + .48, 41.45], .03, F()));      // the drive box, the gland
  P.push(G.box([x - .3, y - .3, CMP.z2], [x + .3, y + .26, CMP.z3], { ds: 1.6 }));                                          // the screw stage
  for (let k = 0; k < 4; k++) P.push(G.line([[x - .301, y - .25 + k * .15, CMP.z2 + .04], [x - .301, y - .25 + k * .15, CMP.z3 - .04]], F()));
  P.push(G.lathe([x, y, CMP.z1], [0, 0, 1], [[0, .12], [CMP.z2 - CMP.z1, .12]], F()));
  P.push(...pipes(CMP_HP, .04));                                                                                       // high pressure to the cold box
  P.push(...pipes([[-.2, FL + .9, CBX[2] + .35], [x - .2, FL + .9, CBX[2] + .35], [x - .2, FL + .9, 42.2], [x - .2, y, 42.2]], .05)); // the return
  return P;
}
/* the screw stage's rotors (local: axis z), turning */
const screws = () => { const P = []; for (const dx of [-.1, .1]) { const L = []; for (let k = 0; k <= 80; k++) { const a = k / 80 * 4 * TAU * (dx > 0 ? 1 : -1), z = k / 80 * .7; L.push([dx + Math.cos(a) * .08, Math.sin(a) * .08, z]); } P.push(G.line(L), G.cyl([dx, 0, 0], [dx, 0, .7], .04, F({ ds: 1.4 }))); } return P; };
function coldBox() {
  const c = CBX, P = [];
  P.push(G.lathe([c[0], FL + .14, c[2]], [0, 1, 0], [[0, CB_R], [CB_H - .32, CB_R], [CB_H - .22, CB_R * .9], [CB_H - .14, CB_R * .6], [CB_H - .12, 0]], { caps: true, ds: 2.2 }));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .5; P.push(G.cyl([c[0] + Math.cos(a) * .4, FL, c[2] + Math.sin(a) * .4], [c[0] + Math.cos(a) * .4, FL + .16, c[2] + Math.sin(a) * .4], .035, F())); }
  for (const y of [FL + .5, FL + 1.2, FL + 1.9]) P.push(circ([c[0], y, c[2]], [0, 1, 0], CB_R + .012, F()));
  const yt = FL + .14 + CB_H - .12;
  P.push(G.lathe([c[0], yt - .02, c[2]], [0, 1, 0], [[0, .34], [.05, .34]], { caps: true }));
  for (const dx of [-.15, .15]) { P.push(G.lathe([c[0] + dx, yt + .03, c[2] - .05], [0, 1, 0], [[0, .06], [.22, .06], [.24, .085], [.34, .085], [.36, .05]], { caps: true, ds: 1.2 })); }
  for (const [dx, dz] of [[.0, .2], [.22, .12], [-.22, .14]]) P.push(G.cyl([c[0] + dx, yt + .03, c[2] + dz], [c[0] + dx, yt + .2, c[2] + dz], .018, F()), circ([c[0] + dx, yt + .22, c[2] + dz], [0, 1, 0], .04, F()));
  P.push(G.panel([[c[0] - .2, FL + 1.4, c[2] - CB_R - .01], [c[0] + .2, FL + 1.4, c[2] - CB_R - .01], [c[0] + .2, FL + 1.65, c[2] - CB_R - .01], [c[0] - .2, FL + 1.65, c[2] - CB_R - .01]], F()));
  // the fill line over to the dewar (vacuum-jacketed)
  P.push(...vj([[c[0], yt + .05, c[2] + .05], [c[0], yt + .4, c[2] + .05], [c[0], yt + .4, DWR[2]], [DWR[0] - .2, yt + .4, DWR[2]], [DWR[0] - .2, NECK, DWR[2]]], .035));
  return P;
}
/* inside it (the X-ray): the 80 K shield, the cold column, the expanders' shafts, the 4.2 K pot */
function coldBoxIn() {
  const c = CBX, P = [], yt = FL + .14 + CB_H - .12;
  P.push(G.lathe([c[0], FL + .35, c[2]], [0, 1, 0], [[0, .4], [2.2, .4]], { edgeOnly: true }));
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; P.push(G.line([[c[0] + Math.cos(a) * .4, FL + .35, c[2] + Math.sin(a) * .4], [c[0] + Math.cos(a) * .4, FL + 2.55, c[2] + Math.sin(a) * .4]], F())); }
  P.push(G.lathe([c[0], FL + .6, c[2]], [0, 1, 0], [[0, .14], [1.9, .14]], { ds: 1.4 }));
  for (const dx of [-.15, .15]) P.push(G.cyl([c[0] + dx, yt, c[2] - .05], [c[0] + dx, FL + 1.9, c[2] - .05], .02, F()), G.lathe([c[0] + dx, FL + 1.8, c[2] - .05], [0, 1, 0], [[0, .06], [.12, .06]], F({ caps: true })));
  P.push(G.lathe([c[0], FL + .3, c[2]], [0, 1, 0], [[0, .22], [.32, .22]], { caps: true, ds: 1.2 }));
  const L = []; for (let k = 0; k <= 120; k++) { const a = k / 12 * TAU, y = FL + .7 + 1.6 * k / 120; L.push([c[0] + Math.cos(a) * .2, y, c[2] + Math.sin(a) * .2]); } P.push(G.line(L, F()));
  return P;
}
const twheel = () => [G.blades([0, 0, 0], [0, 1, 0], 11, .012, .05, { chord: .5, pitch: .35 }), G.lathe([0, -.01, 0], [0, 1, 0], [[0, .055], [.02, .055]], F())];
function dewar() {
  const c = DWR, P = [];
  P.push(G.lathe([c[0], FL + .12, c[2]], [0, 1, 0], [[0, DW_R * .7], [.06, DW_R], [DW_H - .3, DW_R], [DW_H - .18, DW_R * .85], [DW_H - .1, .12], [DW_H - .08, 0]], { caps: true, ds: 2.0 }));
  for (const y of [FL + .7, FL + 1.4]) P.push(circ([c[0], y, c[2]], [0, 1, 0], DW_R + .015, F()));
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; P.push(G.cyl([c[0] + Math.cos(a) * .35, FL, c[2] + Math.sin(a) * .35], [c[0] + Math.cos(a) * .35, FL + .16, c[2] + Math.sin(a) * .35], .03, F())); }
  P.push(G.cyl([c[0], FL + DW_H - .1, c[2]], [c[0], NECK, c[2]], .07, {}), G.box([c[0] - .1, NECK - .12, c[2] - .1], [c[0] + .1, NECK, c[2] + .1]));
  for (const dz of [-.15, .15]) P.push(G.cyl([c[0], NECK - .06, c[2]], [c[0], NECK - .06, c[2] + dz], .018, F()), circ([c[0], NECK - .06, c[2] + dz * 1.2], [0, 0, 1], .045, F()));
  // the level gauge
  P.push(G.box([c[0] + DW_R + .02, FL + .3, c[2] - .04], [c[0] + DW_R + .08, FL + 1.9, c[2] + .04], F()));
  return P;
}
function dewarIn() { const c = DWR; return [G.lathe([c[0], FL + .26, c[2]], [0, 1, 0], [[0, .3], [.06, .36], [1.5, .36], [1.62, .28], [1.68, .07]], { ds: 1.6 })]; }


/* ================= small parts: bolts, nuts, glands, labels, gauges ================= */
/* a hex nut / bolt head on axis ax at c (across flats w, height h) */
function nut(c, ax, w, h) {
  const d = V.norm(ax), [U, W] = P_.perp(d), r = w / Math.sqrt(3), L = [];
  for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU + PI / 6; L.push(V.add(c, V.add(V.mul(U, Math.cos(a) * r), V.mul(W, Math.sin(a) * r)))); }
  const L2 = L.map(p => V.mad(p, d, h)), P = [G.line(L, F()), G.line(L2, F())];
  for (let k = 0; k < 6; k += 2) P.push(G.line([L[k], L2[k]], F()));
  return P;
}
/* a ring of n bolts round axis ax at radius R about c */
function boltRing(c, ax, R, n, w, h) {
  const d = V.norm(ax), [U, W] = P_.perp(d), P = [];
  for (let k = 0; k < n; k++) { const a = (k + .5) / n * TAU; P.push(...nut(V.add(c, V.add(V.mul(U, Math.cos(a) * R), V.mul(W, Math.sin(a) * R))), d, w, h)); }
  return P;
}
/* a cable gland on a face (axis ax out of it): the body nut, the dome, the cable stub */
function gland(c, ax, r, L) {
  const d = V.norm(ax);
  return [...nut(c, d, r * 2.4, r * .5), G.lathe(V.mad(c, d, r * .5), d, [[0, r * 1.05], [r * .7, r * 1.05], [r * 1.2, r * .75], [r * 1.4, r * .55]], F({ caps: true })), G.cyl(V.mad(c, d, r * 1.4), V.mad(c, d, r * 1.4 + (L || .06)), r * .5, F())];
}
/* a label plate on a plane (centre c, in-plane axes u (width) w (height), size a x b): its outline and n text lines */
function label(c, u, w, a, b, n) {
  const q = (x, y) => V.add(c, V.add(V.mul(u, x), V.mul(w, y))), P = [G.line([q(-a / 2, -b / 2), q(a / 2, -b / 2), q(a / 2, b / 2), q(-a / 2, b / 2), q(-a / 2, -b / 2)], F())];
  for (let k = 0; k < n; k++) { const y = b / 2 - (k + 1) * b / (n + 1), x1 = a / 2 - a * .08 - (k % 3) * a * .14; P.push(G.line([q(-a / 2 + a * .08, y), q(x1, y)], F())); }
  return P;
}
/* a pressure gauge (dial facing n): the case, the bezel, the ticks, the stem down to the line */
function gauge(c, n, r, stem) {
  const d = V.norm(n), [U, W] = P_.perp(d), P = [G.lathe(V.mad(c, d, -.02), d, [[0, r], [.02, r]], F({ caps: true })), circ(V.mad(c, d, .021), d, r * .92, F())];
  for (let k = 0; k <= 10; k++) { const a = (-135 + 27 * k) * DEG, cs = Math.cos(a), sn = Math.sin(a), p0 = V.mad(V.add(c, V.add(V.mul(U, sn * r * .8), V.mul(W, cs * r * .8))), d, .022), p1 = V.mad(V.add(c, V.add(V.mul(U, sn * r * .68), V.mul(W, cs * r * .68))), d, .022); P.push(G.line([p0, p1], F())); }
  if (stem) P.push(G.cyl(V.mad(c, d, -.02), stem, .008, F()));
  return P;
}
/* a globe valve body on a line (axis ax), its bonnet and handwheel up (up) */
function valve(c, ax, up, r) {
  const d = V.norm(ax), u = V.norm(up);
  return [G.lathe(V.mad(c, d, -r * 1.6), d, [[0, r * .8], [r * .4, r * 1.3], [r * 2.8, r * 1.3], [r * 3.2, r * .8]], F({ caps: true })), G.cyl(c, V.mad(c, u, r * 3.2), r * .45, F()), ...boltRing(V.mad(c, u, r * 1.6), u, r * .9, 6, r * .3, r * .2), circ(V.mad(c, u, r * 3.4), u, r * 1.9, F()), circ(V.mad(c, u, r * 3.4), u, r * 1.6, F()), G.line([V.mad(V.mad(c, u, r * 3.4), d, -r * 1.75), V.mad(V.mad(c, u, r * 3.4), d, r * 1.75)], F())];
}
/* the module's extras: the front panel's screws, label, earthing stud, the LED strip's lens; the lid's bolts and its
   signal gland; the cans' nuts and relief discs; the bus plates' bolt heads; the stacks' disc springs and nuts; the
   cryostat's flange bolts, relief valve, instrument feedthrough */
function frontDet() {
  const x = -.405, P = [];
  for (const y of [-.235, .235]) for (const z of [-.235, -.08, .08, .235]) P.push(circ([x - .002, y, z], [1, 0, 0], .008, F()), circ([x - .002, y, z], [1, 0, 0], .004, F()));
  P.push(...label([x - .003, -.03, -.04], [0, 0, 1], [0, 1, 0], .12, .04, 2));
  P.push(...nut([x, -.22, .17], [-1, 0, 0], .018, .012), G.cyl([x - .012, -.22, .17], [x - .035, -.22, .17], .005, F()));
  for (const z of [-.1, .1]) P.push(...nut([x - .14, -.15, z], [-1, 0, 0], .028, .012), ...nut([x - .13, -.24, z], [-1, 0, 0], .022, .01));
  for (const z of [-.215, .215]) for (const y of [-.12, .12]) P.push(...nut([x, y, z], [-1, 0, 0], .016, .008));
  return P;
}
function lidDet() {
  const P = [];
  for (const x of [-.36, -.18, 0, .18, .36]) for (const z of [-.24, .24]) P.push(...nut([x, .26, z], [0, 1, 0], .014, .006));
  for (const z of [-.12, .12]) P.push(...nut([-.38, .26, z], [0, 1, 0], .014, .006), ...nut([.38, .26, z], [0, 1, 0], .014, .006));
  P.push(...gland([.25, .26, .14], [0, 1, 0], .012, .05), ...label([.17, .264, -.065], [1, 0, 0], [0, 0, 1], .2, .1, 4));
  return P;
}
function canDet() {
  const P = [];
  for (const z of [-.048, .048]) P.push(...nut([-.24, 0, z], [-1, 0, 0], .022, .01), ...nut([-.255, 0, z], [-1, 0, 0], .018, .008));
  P.push(circ([.2, .03, .03], [1, 0, 0], .025, F()), circ([.2, .03, .03], [1, 0, 0], .014, F()));                   // the pressure relief disc
  P.push(...label([.035, .097, 0], [1, 0, 0], [0, 0, 1], .14, .1, 4));
  for (const x of [-.12, .15]) for (const s of [-1, 1]) P.push(...nut([x, s * .097, -.097], [0, s, 0], .012, .006));
  return P;
}
function busDet() { const P = []; for (const c of CAN_P) for (const dz of [-.048, .048]) P.push(...nut([-.29, c[1], c[2] + dz], [-1, 0, 0], .024, .012)); return P; }
function stackDet(c, L) {
  const P = [];
  for (let k = 0; k < 4; k++) P.push(G.lathe([c[0], c[1], c[2] + L / 2 + .02 + k * .008], [0, 0, 1], [[0, .04], [.004, .03]], F()));   // disc springs
  for (const [dx, dy] of [[-.06, -.06], [.06, .06]]) for (const e of [-1, 1]) P.push(...nut([c[0] + dx, c[1] + dy, c[2] + e * (L / 2 + .02)], [0, 0, e], .016, .01));
  P.push(...label([c[0] - .056, c[1], c[2]], [0, 0, 1], [0, 1, 0], .08, .05, 2));
  return P;
}
function indDet() {
  const c = IND_C, P = [];
  for (const z of [-.2, .2]) P.push(...boltRing([c[0], c[1], z], [0, 0, z > 0 ? 1 : -1], .066, 10, .009, .006));
  P.push(G.cyl([c[0] - .075, c[1], -.05], [c[0] - .11, c[1], -.05], .012, F()), ...nut([c[0] - .11, c[1], -.05], [-1, 0, 0], .03, .012), circ([c[0] - .125, c[1], -.05], [1, 0, 0], .01, F()));   // relief valve
  P.push(G.cyl([c[0], c[1] + .075, -.12], [c[0], c[1] + .11, -.12], .009, F()), ...gland([c[0], c[1] + .11, -.12], [0, 1, 0], .009, .04));    // the instrument feedthrough
  P.push(...label([c[0], c[1] - .076, 0], [0, 0, 1], [1, 0, 0], .16, .04, 2));
  return P;
}
/* the helium lines' extras: the risers' gauges, valves at each branch's head, flags (LHe), clamps */
function heDet() {
  const P = [];
  for (const Rr of RISERS) {
    const p = Rr[0], s = Math.sign(p[0]);
    P.push(...gauge([p[0] - s * .16, p[1] - .25, p[2] - .07], [-s, 0, 0], .05, [p[0] - s * .04, p[1] - .25, p[2] - .07]));
    for (let k = 0; k < 4; k++) P.push(...valve([p[0], yb(k), p[2] - .2], [0, 0, 1], [-s, 0, 0], .022));
    P.push(...label([p[0] - s * .06, p[1] - .6, p[2]], [0, 0, 1], [0, 1, 0], .1, .05, 2));
  }
  for (const S of SIDES) { const s = Math.sign(S[1][0]); for (let z = 47.2; z < 55; z += 1.5) P.push(G.lathe([s * HX, YH, z - .03], [0, 0, 1], [[0, .07], [.06, .07]], F()), ...nut([s * HX, YH + .07, z], [0, 1, 0], .02, .01)); }
  P.push(...valve([DWR[0], YH - .9, DWR[2]], [0, 1, 0], [0, 0, 1], .035), ...gauge([DWR[0] + .16, YH - 1.3, DWR[2]], [0, 0, 1], .06, [DWR[0] + .06, YH - 1.3, DWR[2]]));
  return P;
}
/* the plant's extras */
function plantDet() {
  const P = [], c = CBX, yt = FL + .14 + CB_H - .12;
  P.push(...boltRing([c[0], yt - .02, c[2]], [0, 1, 0], .31, 20, .02, .012));
  P.push(...gauge([c[0] + .2, FL + 1.9, c[2] - CB_R - .03], [0, 0, -1], .06), ...gauge([c[0] - .2, FL + 1.9, c[2] - CB_R - .03], [0, 0, -1], .06));
  P.push(...label([c[0], FL + 1.2, c[2] - CB_R - .02], [1, 0, 0], [0, 1, 0], .3, .16, 5));
  P.push(G.cyl([c[0] + CB_R, FL + .5, c[2]], [c[0] + CB_R + .15, FL + .5, c[2]], .05, F()), ...valve([c[0] + CB_R + .15, FL + .5, c[2]], [1, 0, 0], [0, 1, 0], .04));   // the vacuum pump-out port
  P.push(G.cyl([c[0] - .25, yt + .03, c[2] + .2], [c[0] - .25, yt + .3, c[2] + .2], .02, F()), G.lathe([c[0] - .25, yt + .3, c[2] + .2], [0, 1, 0], [[0, .04], [.08, .03], [.1, 0]], F()));   // the relief valve
  // the compressor's motor cowl and its glands; the skid's bolts; its oil separator vessel
  const x = CMP.x, y = CMP.y;
  P.push(G.lathe([x, y, CMP.z0 - .08], [0, 0, 1], [[0, .2], [.08, .24]], F({ caps: true })));
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(G.line([[x + Math.cos(a) * .05, y + Math.sin(a) * .05, CMP.z0 - .08], [x + Math.cos(a) * .22, y + Math.sin(a) * .22, CMP.z0 - .08]], F())); }
  P.push(...gland([x - .1, y + .4, 41.45], [0, 1, 0], .012, .04), ...gland([x + .1, y + .4, 41.45], [0, 1, 0], .012, .04), ...label([x + .151, y + .32, 41.45], [0, 0, 1], [0, 1, 0], .16, .08, 3));
  for (const zz of [CMP.z0 - .05, 41.5, CMP.z3 + .03]) for (const s of [-1, 1]) P.push(...nut([x + s * .38, FL + .14, zz], [0, 1, 0], .03, .015));
  P.push(G.lathe([x + .32, FL + .14, 42.15], [0, 1, 0], [[0, .12], [.04, .15], [.75, .15], [.82, .1], [.86, 0]], F({ caps: true, ds: 1.4 })), G.cyl([x + .32, FL + 1.0, 42.15], [x + .32, FL + 1.12, 42.15], .02, F()));
  P.push(...gauge([x + .32, FL + 1.22, 42.15], [-1, 0, 0], .05));
  // the dewar's top
  P.push(...boltRing([DWR[0], NECK, DWR[2]], [0, 1, 0], .085, 8, .018, .01), ...label([DWR[0], FL + 1.0, DWR[2] - DW_R - .02], [1, 0, 0], [0, 1, 0], .3, .18, 5));
  return P;
}
/* the switch bays' extras: the mimic (a line diagram) on the back panel, the warning plates, the cable glands */
function bayDet(s) {
  const P = [], x = v => s * v, xb = x(3.095);
  const q = (y, z) => [xb, y, z];
  P.push(G.line([q(FL + 2.2, 46.7), q(FL + 2.2, 47.65)], F()), G.line([q(FL + 2.2, 47.175), q(FL + 1.98, 47.175)], F()));
  P.push(...label([xb, FL + 1.32, 46.78], [0, 0, 1], [0, 1, 0], .12, .1, 3), ...label([xb, FL + 1.32, 47.57], [0, 0, 1], [0, 1, 0], .12, .1, 3));
  for (const z of [46.82, 47.175, 47.53]) P.push(...nut([x(2.9), FL + 2.3, z], [0, 1, 0], .03, .015), ...gland([x(3.0), FL + 2.3, z + .07], [0, 1, 0], .015, .06));
  for (let k = 0; k < 6; k++) for (const z of [46.72, 47.62]) P.push(...nut([x(2.35), FL + .1 + k * .14, z], [0, 1, 0], .02, .01));
  return P;
}

/* ================= build ================= */
const CL = {};
function build() {
  const t0 = performance.now();
  Object.assign(CL, {
    mBase: lod(modBase(), .5, LF), mLid: lod([...modLid(), ...lidDet()], .5, LFF), mSideP: lod(modSide(1), .5, LF), mSideN: lod(modSide(-1), .5, LF), mFront: lod([...modFront(), ...frontDet()], .5, LFF),
    mCan: lod([...modCan(), ...canDet()], .3, LFF), mBus: lod([...modBus(), ...busDet()], .3, LFF), mSCR: lod([...modSCR(), ...stackDet(SCR_C, 4 * .028 + 3 * .024)], .3, LFF), mDIO: lod([...modDIO(), ...stackDet(DIO_C, 3 * .028 + 2 * .024)], .3, LFF),
    mIND: lod([...modIND(), ...indDet()], .3, LFF), mCoil: lod(modCoil(), .3, LFF),
    bayH: lod(bayH(), .3, LF), bayV: lod(bayV(), .3, LF),
    he: lod([...heLines(), ...heDet()], .9, LF), scb: lod(scBus(), .9), scbIn: lod(scBusIn(), .9, LF),
    bayS: lod([...swBay(1), ...bayDet(1)], .6, LF), bayP: lod([...swBay(-1), ...bayDet(-1)], .6, LF), plant: lod(plantDet(), .5, LFF), armS: lod(ctrArm(1), .4, LF), armP: lod(ctrArm(-1), .4, LF), knife: lod(knife(), .3, LF),
    cmp: lod(compressor(), .6, LF), screws: lod(screws(), .3, LF), cbx: lod(coldBox(), .7, LF), cbxIn: lod(coldBoxIn(), .6, LF), tw: lod(twheel(), .2, LFF),
    dwr: lod(dewar(), .6, LF), dwrIn: lod(dewarIn(), .6, LF),
  });
  RGB.ms = performance.now() - t0;
  let n = 0; for (const k in CL) n += CL[k].lv[0].length / 6; RGB.n0 = n;
}

/* ================= time and state ================= */
let TM = null;
/* the cold front: distance from the dewar's neck (m) at base T (2 m/s on screen, x720: about 3 mm/s) */
const V_FR = 2.0;
const frontD = T => T < TM.T_HEF ? -1 : V_FR * (T - TM.T_HEF);
const arrT = d => TM.T_HEF + d / V_FR;                                // when the front reaches distance d
const kAt = (d, T) => { const a = T - arrT(d); return a <= 0 ? 300 : 4.4 + 295.6 * Math.exp(-a / .55); };   // a line's temperature (K) at d
const indK = (k, T) => { const a = T - arrT(BAYD[k]) - .25; return a <= 0 ? 300 : 4.2 + 295.8 * Math.exp(-a / 1.3); };   // a module's inductor
const meanIndK = T => { let s = 0; for (let k = 0; k < NMOD; k++) s += indK(k, T); return s / NMOD; };
const frostAt = (d, T) => { const a = T - arrT(d) - .6; return a <= 0 ? 0 : E.sat(a / 3.5) * (1 - E.ss(TM.TF + 6, TM.TF + 14, T)); };
const S = { cmp: 0, cmpRot: 0, tex: 0, texRot: 0, lvl: 0, pull: 0, xp: 0, bayUp: 0, ctr: 0, dump: 0, scan: 0 };
function state(T) {
  const t = TM; TNOW = T;
  S.cmp = ss(t.T_HE, t.T_HE + 1.4, T) * (1 - ss(t.TF + 10, t.TF + 13, T));
  S.cmpRot = 9 * Math.max(0, T - t.T_HE - .7) * (1 - .5 * ss(t.TF + 10, t.TF + 13, T));
  S.tex = ss(t.T_HE + 1.0, t.T_HE + 2.6, T) * (1 - ss(t.TF + 10, t.TF + 13, T));
  S.texRot = 30 * Math.max(0, T - t.T_HE - 1.6);
  S.lvl = .58 + .24 * ss(t.T_HE + 2.0, t.T_HEF, T) - .1 * ss(t.T_HEF, t.T_HE1, T);
  // the module drawn out: the bayonet lifts, it rolls out on its slides, it comes apart and back, in again
  const m = t.T_MX;
  S.bayUp = kk(T, m, m + .6) * (1 - kk(T, m + t.MXL - .6, m + t.MXL));
  S.pull = kk(T, m + .5, m + 1.9) * (1 - kk(T, m + t.MXL - 2.0, m + t.MXL - .6));
  S.xp = kk(T, m + 2.0, m + 4.2) * (1 - kk(T, m + t.MXL - 4.4, m + t.MXL - 2.1));
  // the switch bays: the dump switch opens, the contactor closes (and both back after the shot)
  S.dump = kk(T, t.T_BANK - .2, t.T_BANK + .5) * (1 - kk(T, t.TF + 4, t.TF + 5));
  S.ctr = kk(T, t.T_BANK + .5, t.T_BANK + .7) * (1 - kk(T, t.TF + .6, t.TF + .9));
  return S;
}
/* the explode's own easing per part (order 0 first out, last in) */
const xpPart = (o) => { const e = S.xp; if (e <= 0) return 0; const a = E.sat((e - o * .45) / .55); return E.inOut(a); };

/* ================= the lightning scan of the starboard switch bay and rack 0 =================
   a leader drops from the deckhead onto the contactor, then the chain leaps part to part; each part it lands on is
   lit (an X-ray flare in lime), boxed and named */
const SC = [
  { id: 'CTR', lab: 'Charge contactor · 3 poles', val: 'open · 13 kV', mn: [2.58, FL + 1.18, 46.66], mx: [3.12, FL + 2.3, 47.68], t: .55 },
  { id: 'DMP', lab: 'Dump switch · resistor grid', val: 'closed · safe', mn: [2.04, FL + .05, 46.66], mx: [3.08, FL + 1.06, 47.68], t: 1.9 },
  { id: 'RCK', lab: 'PFN rack 1 · 20 modules', val: '40 MJ', mn: [1.86, FL, 47.86], mx: [3.32, FL + 4.74, 51.34], t: 3.25 },
  { id: 'OUT', lab: 'Output bus · to the gun', val: '', mn: [1.75, FL, 47.85], mx: [1.92, FL + 4.68, 48.02], t: 4.6 },
  { id: 'MOD', lab: 'PFN module · 2 MJ · 11 kV', val: '33 mF', mn: [1.9, MOD[XM].p[1] - .27, MOD[XM].p[2] - .27], mx: [2.77, MOD[XM].p[1] + .27, MOD[XM].p[2] + .27], t: 5.95 },
  { id: 'HEL', lab: 'Helium lines · 4.4 K', val: 'vacuum-jacketed', mn: [1.64, FL + .76, 47.95], mx: [1.8, YH + .1, 51.28], t: 7.3 },
  { id: 'SCB', lab: 'Superconducting bus · NbTi', val: '4.4 K', mn: [2.5, FL + 4.74, 47.98], mx: [2.75, FL + 4.98, 51.22], t: 8.65 },
];
const SC_TOP = [2.3, 6.5, 46.9];
const scC = s => [(s.mn[0] + s.mx[0]) / 2, (s.mn[1] + s.mx[1]) / 2, (s.mn[2] + s.mx[2]) / 2];
const SC_PATH = SC.map((s, i) => { const a = i ? scC(SC[i - 1]) : SC_TOP, b = scC(s), r = rng(731 + i * 17); return K_disp(a, b, i ? 5 : 6, i ? .5 : .45, r); });
function K_disp(a, b, depth, rough, rr) { return SK.disp(a, b, depth, rough, rr, .9); }
const SC_BR = SC_PATH.map((P, i) => { const r = rng(977 + i * 31), out = []; for (let k = 0; k < 3; k++) { const at = .2 + .6 * r(), j = Math.floor(at * (P.length - 1)), s0 = P[j], d = [r() - .5, r() - .7, r() - .5], L = .25 + .35 * r(); out.push({ at, pts: SK.disp(s0, [s0[0] + d[0] * L, s0[1] + d[1] * L, s0[2] + d[2] * L], 4, .6, r, .9) }); } return out; });
const scLit = (i, T) => { if (!TM) return 0; const a = T - TM.T_SCN - SC[i].t; return a < 0 ? 0 : Math.max(.4 * (1 - ss(10.4 - SC[i].t, 11 - SC[i].t, a)), Math.min(1, 1.3 * Math.exp(-a * 1.4))); };

/* ================= drawing ================= */
let C = null;   // the film's context: { K, RO, drawX, odot, oglow, isOpen, LIME, HOT, WH, tagAt, modLvl, modT, lock }
function init(ctx, times) { C = ctx; TM = times; }
const ID = X.make(R.I(), [0, 0, 0]);
const LP = X.make(R.I(), [0, 0, 0]), LW = X.make(R.I(), [0, 0, 0]);
function xfMul(A, B, out) { const r = X.mul(A, B); out.R = r.R; out.T = r.T; return out; }
/* one module (k) in its slot (or the drawn-out one with its exploded parts); lvl its charge, cold its inductor's cold */
function drawModule(k, Ws, RO, keep, a, lime, coil, xpOn) {
  const X_ = C.drawX, L0 = MOD_L[k];
  let L = L0;
  if (k === XM && S.pull > 0) L = X.mul(L0, tr(-.72 * S.pull, 0, 0));
  const vin = xpOn || k === XM && S.pull > .01 ? 1 : (1 - E.ss(3.4, 5.2, V.dist(C.cam.eye, X.ap(Ws, MOD[k].p)))) * E.sat((keep - .45) / .35) * (1 - S.xp);
  const parts = [['mBase', null], ['mLid', 'lid'], ['mSideP', 'sideP'], ['mSideN', 'sideN'], ['mFront', 'front'], ['mBus', 'bus'], ['mSCR', 'scr'], ['mDIO', 'dio'], ['mIND', 'ind'], ['mCoil', 'ind']];
  RO.keep = keep;
  for (const [cl, key] of parts) {
    let Lp = L;
    if (xpOn && key) { const o = XP[key], e = xpPart(XORD[key]); if (e > 0) { const f = bob(key, e); Lp = X.mul(L, tr(o[0] * e + f[0], o[1] * e + f[1], o[2] * e + f[2])); } }
    const isCoil = cl === 'mCoil', inner = cl === 'mBus' || cl === 'mSCR' || cl === 'mDIO' || cl === 'mIND' || isCoil;
    if (inner && vin < .02) continue;                                  // (inside: only seen close)
    RO.keep = inner ? keep * vin : keep;
    RO.S = Lp; RO.a = a * (isCoil ? 1.2 : 1); RO.lime = isCoil ? Math.max(lime, coil) : xpOn ? Math.max(lime, .14 * S.xp) : lime;
    X_(CL[cl], X.mul(Ws, Lp), RO);
  }
  for (let c = 0; c < 4; c++) {
    let Lc = X.mul(L, tr(CAN_P[c][0], CAN_P[c][1], CAN_P[c][2]));
    if (xpOn) { const e = xpPart(XORD.can + .02 * c), o = XP.can[c]; if (e > 0) { const f = bob('can' + c, e); Lc = X.mul(Lc, tr(o[0] * e + f[0], o[1] * e + f[1], o[2] * e + f[2])); } }
    else if (vin < .02) continue;
    RO.keep = keep * vin; RO.S = Lc; RO.a = a; RO.lime = lime; X_(CL.mCan, X.mul(Ws, Lc), RO);
  }
}
function drawRoom(T, Ws, FK, dimk) {
  const RO = C.RO, X_ = C.drawX, K = C.K;
  state(T);
  RO.md = 3; RO.zfix = undefined;
  // the helium plant
  const fHe = FK.he;
  RO.keep = fHe; RO.S = null;
  RO.a = 1.5 * dimk(fHe); RO.lime = .4 * C.lock(T, TM.T_HE + .05); X_(CL.cmp, Ws, RO);
  { const L = X.make(R.z(S.cmpRot), [CMP.x, CMP.y, CMP.z2 + .02]); RO.S = L; RO.lime = .25 * S.cmp; RO.a = 1.6 * dimk(fHe); X_(CL.screws, X.mul(Ws, L), RO); RO.S = null; }
  RO.a = 1.25 * dimk(fHe); RO.lime = .3 * C.lock(T, TM.T_HE + 1.0); X_(CL.cbx, Ws, RO); RO.lime = 0; RO.a = 1.4 * dimk(fHe); X_(CL.plant, Ws, RO);
  RO.a = 1.1 * dimk(fHe); RO.lime = .35 * S.tex; X_(CL.cbxIn, Ws, RO);
  for (const dx of [-.15, .15]) { const L = X.make(R.y(S.texRot * (dx > 0 ? 1 : -1)), [CBX[0] + dx, FL + 1.8 + .02, CBX[2] - .05]); RO.S = L; RO.lime = .6 * S.tex; RO.a = 1.7; X_(CL.tw, X.mul(Ws, L), RO); }
  RO.S = null; RO.a = 1.3 * dimk(fHe); RO.lime = 0; X_(CL.dwr, Ws, RO); RO.a = 1.0 * dimk(fHe); X_(CL.dwrIn, Ws, RO);
  // the transfer lines: lit lime once cold (the FX draws the front and the inner line)
  const cold = E.ss(TM.T_HEF, TM.T_HEF + 6, T) * (1 - E.ss(TM.TF + 6, TM.TF + 14, T));
  RO.keep = Math.max(fHe, .5 * FK.rack); RO.a = 1.55 * dimk(RO.keep); RO.lime = Math.max(.42 * cold * fHe, .7 * scLit(5, T)); X_(CL.he, Ws, RO);
  RO.keep = Math.max(.6 * fHe, FK.rack); RO.a = 1.4 * dimk(RO.keep); RO.lime = Math.max(.12 * cold, .7 * scLit(6, T)); X_(CL.scb, Ws, RO);
  RO.a = 1.1 * dimk(RO.keep); RO.lime = Math.max(.3 * cold, .8 * scLit(6, T)); X_(CL.scbIn, Ws, RO);
  // the switch bays: frame and the contactor, the armature closing, the dump switch's knife swinging open
  const fr = FK.rack;
  RO.keep = fr; RO.a = 1.45 * dimk(fr);
  RO.lime = Math.max(.75 * scLit(0, T), .5 * scLit(1, T)); X_(CL.bayS, Ws, RO); RO.lime = 0; X_(CL.bayP, Ws, RO);
  for (const s of [1, -1]) {
    const L = tr(s * .08 * S.ctr, 0, 0); RO.S = L; RO.lime = Math.max(.9 * C.lock(T, TM.T_BANK + .7), .35 * S.ctr, s > 0 ? .8 * scLit(0, T) : 0); RO.a = 1.6 * dimk(fr); X_(s > 0 ? CL.armS : CL.armP, X.mul(Ws, L), RO);
    const Lk = X.make(R.z(s * 70 * DEG * S.dump), [s * 2.91, FL + .95, 47.175]); RO.S = Lk; RO.lime = Math.max(.8 * C.lock(T, TM.T_BANK + .5), s > 0 ? .8 * scLit(1, T) : 0); X_(CL.knife, X.mul(Ws, Lk), RO);
  }
  RO.S = null;
  // the modules: their charge in lime, the bayonets
  for (let k = 0; k < NMOD; k++) {
    const l = C.modLvl(k, T), xm = k === XM, close = xm && (S.pull > .001 || T > TM.T_SCN - 1 && T < TM.T_MX + TM.MXL + .5);
    const lime = (.5 * l + .4 * C.lock(T, C.modT(k))) * (.3 + .7 * fr) + (xm ? .7 * scLit(4, T) : 0) + (MOD[k].r === 0 ? .22 * scLit(2, T) : 0);
    const coil = .55 * E.sat((300 - indK(k, T)) / 250) * (xm ? 1 : .4);
    drawModule(k, Ws, RO, close ? 1 : fr, close ? 1.5 + .45 * S.xp : (1.2 + .5 * l) * dimk(fr), Math.min(1, lime), coil, xm && S.xp > .001);
    // the bayonet
    const L = MOD_L[k]; RO.keep = Math.max(fr, .6 * fHe); RO.a = 1.4 * dimk(RO.keep);
    const fz = frostAt(BAYD[k], T); RO.lime = .25 * fz + (xm ? .8 * scLit(5, T) : 0);
    RO.S = L; X_(CL.bayH, X.mul(Ws, L), RO);
    const Lv = xm && S.bayUp > 0 ? X.mul(L, tr(0, .18 * S.bayUp, 0)) : L; RO.S = Lv; X_(CL.bayV, X.mul(Ws, Lv), RO);
  }
  RO.S = null; RO.lime = 0; RO.keep = 1; RO.a = 1.5;
}
/* the room as it stands before the plant starts (the engine insert's view of it): k its keep, w the compressor lit */
function drawStatic(Ws, o, X_, kr, w) {
  o.S = null; o.keep = kr; const a0 = o.a;
  for (const c of [CL.he, CL.scb, CL.bayS, CL.bayP, CL.cbx, CL.dwr, CL.plant]) X_(c, Ws, o);
  for (const s of [1, -1]) { X_(s > 0 ? CL.armS : CL.armP, Ws, o); const Lk = X.make(R.I(), [s * 2.91, FL + .95, 47.175]); o.S = Lk; X_(CL.knife, X.mul(Ws, Lk), o); }
  o.S = null; o.keep = .9; o.a = a0 + .6 * w; X_(CL.cmp, Ws, o); o.a = a0;
  o.keep = kr * .7;
  for (let k = 0; k < NMOD; k++) { const L = MOD_L[k]; o.S = L; const Lw = X.mul(Ws, L); X_(CL.mBase, Lw, o); X_(CL.mLid, Lw, o); X_(CL.mFront, Lw, o); X_(CL.bayH, Lw, o); X_(CL.bayV, Lw, o); }
  o.S = null; o.keep = 1;
}
/* ---------- FX ---------- */
function fx(T, Ws) {
  const K = C.K, LIME = C.LIME, HOT = C.HOT, WH = C.WH, odot = C.odot, oglow = C.oglow, isOpen = C.isOpen;
  // the compressor's drive lamp; the turbo-expanders' rims
  if (S.cmp > .01 && isOpen(41.4)) {
    apI(Ws, CMP.x + .151, CMP.y + .34, 41.45, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .9 * S.cmp); oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .4 * S.cmp);
    for (const dx of [-.15, .15]) for (let j = 0; j < 22; j++) { const a = j / 22 * TAU + S.texRot * (dx > 0 ? 1 : -1); apI(Ws, CBX[0] + dx + Math.cos(a) * .052, FL + 1.82, CBX[2] - .05 + Math.sin(a) * .052, Q1); odot(Q1[0], Q1[1], Q1[2], 1, j % 4 ? LIME : HOT, .7 * S.tex); }
    // warm helium from the compressor to the cold box: white pulses along the line
    const pl = HP_PL, off = (T * .9) % .12;
    for (let d = off; d < pl.L; d += .12) { P_.polyAt(pl, d, Q2); apI(Ws, Q2[0], Q2[1], Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], 2, WH, .6 * S.cmp); }
  }
  // the dewar: its liquid (lime dots on the surface, a slow churn), the level gauge
  if (isOpen(DWR[2])) {
    const a = E.ss(TM.B_PR - .5, TM.B_PR, T) * (1 - E.ss(TM.XSH - 1, TM.XSH, T)), y = FL + .3 + 1.45 * S.lvl;
    if (a > .01) {
      for (let j = 0; j < 140; j++) { const r = .34 * Math.sqrt(K.hh(j, 3.1)), b = K.hh(j, 5.7) * TAU + T * .2 * (1 - r); apI(Ws, DWR[0] + Math.cos(b) * r, y + .006 * Math.sin(T * 3 + j), DWR[2] + Math.sin(b) * r, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .55 * a); }
      for (let yy = FL + .32; yy < FL + 1.88; yy += .03) { apI(Ws, DWR[0] + DW_R + .05, yy, DWR[2] - .041, Q1); const on = yy < FL + .32 + 1.56 * S.lvl; odot(Q1[0], Q1[1], Q1[2], on ? 2 : 1, on ? LIME : WH, on ? .85 * a : .2 * a); }
    }
  }
  // the cold front down the transfer lines: behind it the inner line lime (cold), a hot head and a streak at it
  const df = frontD(T);
  if (df > 0 && T < TM.TF + 14) {
    const fresh = 1 - E.ss(TM.T_HE1 + 1, TM.T_HE1 + 4, T), base = (1 - E.ss(TM.TF + 6, TM.TF + 14, T));
    for (const n of NET) {
      const reach = df - n.d0; if (reach <= 0) continue;
      const L = n.pl.L, d1 = Math.min(L, reach), st = n.kind === 'branch' || n.kind === 'jump' ? .05 : .035;
      for (let s = 0; s < d1; s += st) {
        P_.polyAt(n.pl, s, Q2); if (!isOpen(Q2[2])) continue;
        const behind = reach - s, k = Math.exp(-behind / 1.6), tw = .5 + .5 * Math.sin(s * 37 + T * 9);
        apI(Ws, Q2[0], Q2[1], Q2[2], Q1);
        odot(Q1[0], Q1[1], Q1[2], 2, k > .55 ? HOT : LIME, base * Math.min(1, .45 + .1 * tw + .8 * k * fresh));
      }
      if (reach < L && fresh > .01) {
        P_.polyAt(n.pl, d1, Q2); if (isOpen(Q2[2])) { apI(Ws, Q2[0], Q2[1], Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], 3, HOT, fresh); oglow(Q1[0], Q1[1], Q1[2], 34, LIME, .7 * fresh); oglow(Q1[0], Q1[1], Q1[2], 12, HOT, .6 * fresh); }
      }
    }
  }
  // frost on the fittings (white dots growing round them) and the cold vapour falling off them
  const fz0 = FROSTP;
  for (let i = 0; i < fz0.length; i++) { const f = fz0[i]; frost(f.p, f.r, frostAt(f.d, T), i * 13.7, T, Ws, null); }
  for (let k = 0; k < NMOD; k++) {
    const m = MOD[k]; if (!isOpen(m.p[2])) continue;
    const fz = frostAt(BAYD[k], T); if (fz < .01) continue;
    const L = MOD_L[k]; apI(L, -.3, .36 + (k === XM ? .18 * S.bayUp : 0), 0, Q4); frost(Q4, .04, fz, k * 3.3 + 100, T, Ws, 1); apI(L, -.47, .41, 0, Q4); frost(Q4, .03, fz * .8, k * 3.3 + 140, T, Ws, 1);
  }
}
const FQ = [0, 0, 0], FQ2 = [0, 0, 0];
const HP_PL = P_.poly(CMP_HP);
function frost(p, r, f, seed, T, Ws, small) {
  if (f < .01 || !C.isOpen(p[2])) return;
  const K = C.K, n = Math.round((small ? 90 : 200) * f), WH = C.WH;
  // the coat: crystals on the fitting's surface (a stub along y, radius r, length 2.6 r), each a short needle tilted off
  // it, longer and denser as the frost thickens
  for (let j = 0; j < n; j++) {
    const u = K.hh(j, seed), v = K.hh(j, seed + 1.3), w = K.hh(j, seed + 2.9), a = u * TAU, yy = (v - .5) * 2.6 * r;
    const th = (K.hh(j, seed + 5.5) - .5) * 1.2, nx = Math.cos(a + th), nz = Math.sin(a + th), ny = (K.hh(j, seed + 6.6) - .5) * .9;
    const r0 = r * (1 + .25 * f * K.hh(j, seed + 4.4)), L = (.003 + .011 * w) * Math.min(1, f * 1.3);
    apI(Ws, p[0] + Math.cos(a) * r0, p[1] + yy, p[2] + Math.sin(a) * r0, FQ); apI(Ws, p[0] + Math.cos(a) * r0 + nx * L, p[1] + yy + ny * L, p[2] + Math.sin(a) * r0 + nz * L, FQ2);
    K.lineW(FQ[0], FQ[1], FQ[2], FQ2[0], FQ2[1], FQ2[2], 1.2, 1, WH, .85 * Math.min(1, f * 1.6));
    C.odot(FQ2[0], FQ2[1], FQ2[2], 1, WH, Math.min(1, f * 1.6)); C.odot(FQ[0], FQ[1], FQ[2], 1, WH, .7 * Math.min(1, f * 1.6));
  }
  // vapour: wisps that sink off the fitting, spread and curl, and fade (the air chilled round it falls)
  const nv = small ? 7 : 18;
  for (let j = 0; j < nv; j++) {
    const h = K.hh(j, seed + 7.1), h2 = K.hh(j, seed + 8.3), ph = ((T * (.22 + .1 * h) + h) % 1), fall = ph * (small ? .42 : .8);
    for (let q = 0; q < 7; q++) {
      const pp = Math.max(0, ph - q * .018), dd = pp * (small ? .42 : .8), spread = r * (.6 + 2.4 * pp);
      const cx = Math.cos(h2 * TAU + pp * 3.2) * spread, cz = Math.sin(h2 * TAU + pp * 3.2) * spread;
      apI(Ws, p[0] + cx, p[1] - r * .6 - dd, p[2] + cz, FQ);
      C.odot(FQ[0], FQ[1], FQ[2], q ? 1 : 2, WH, f * .55 * Math.sin(Math.min(1, ph * 1.2) * PI) * (1 - q * .1));
    }
    if (fall < 0) continue;
  }
}
/* the lightning scan's leader, hops and tendrils, the parts' boxes (overlay pass) */
const SCT = [];
function scanFX(T, Ws) {
  if (!TM) return;
  const u = T - TM.T_SCN, K = C.K; if (u < -.2 || u > 11.2) return;
  for (let i = 0; i < SC.length; i++) {
    const s = SC[i], a = u - s.t + .45, P = SC_PATH[i];
    if (a < 0) continue;
    // the leader steps down (or leaps across) in .3 s, the stroke flickers
    const reach = Math.min(1, a / .3), I = a < .3 ? .8 : SK.Bolt.stroke(a - .3) * 1.1, n1 = reach * (P.length - 1);
    if (I > .01) for (let j = 0; j < n1; j++) {
      const A = P[j], B = P[Math.min(P.length - 1, j + 1)], f = Math.min(1, n1 - j);
      apI(Ws, A[0], A[1], A[2], Q1); apI(Ws, A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, a < .3 ? 4 : 5, C.HOT, Math.min(1, I), C.LIME, .1, .045);
      if (j % 2 === 0) { K.glowW(Q1[0], Q1[1], Q1[2], 70, C.LIME, .4 * Math.min(1, I)); K.glowW(Q1[0], Q1[1], Q1[2], 16, C.HOT, .5 * Math.min(1, I)); }
    }
    // its branches
    if (I > .01) for (const b of SC_BR[i]) {
      const s0 = b.at * (P.length - 1); if (n1 <= s0) continue;
      const m = Math.min(b.pts.length - 1, (n1 - s0) / ((P.length - 1) * .3) * (b.pts.length - 1));
      for (let j = 0; j < m; j++) { const A = b.pts[j], B = b.pts[j + 1]; apI(Ws, A[0], A[1], A[2], Q1); apI(Ws, B[0], B[1], B[2], Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.4, 2, C.HOT, Math.min(1, I) * .7 * (1 - j / b.pts.length), C.LIME, .04, 0); }
    }
    if (a < .3) { const tip = P[Math.floor(n1)]; apI(Ws, tip[0], tip[1], tip[2], Q1); K.dotW(Q1[0], Q1[1], Q1[2], 3, [255, 255, 255], 1); K.glowW(Q1[0], Q1[1], Q1[2], 18, C.LIME, .4); }
    // tendrils crawling over the part as it is identified
    const h = a - .3;
    if (h > 0 && h < 1.2) {
      const c = scC(s), I2 = (1 - h / 1.2);
      for (let k = 0; k < 4; k++) {
        const r = .5 + .5 * Math.sin(k * 2.1 + i);
        Q3[0] = s.mn[0] + (s.mx[0] - s.mn[0]) * K.hh(k, i + Math.floor(h * 12)); Q3[1] = s.mn[1] + (s.mx[1] - s.mn[1]) * K.hh(k + 9, i + Math.floor(h * 12)); Q3[2] = s.mn[2] + (s.mx[2] - s.mn[2]) * K.hh(k + 17, i + Math.floor(h * 12));
        apI(Ws, c[0], c[1], c[2], Q1); apI(Ws, Q3[0], Q3[1], Q3[2], Q2);
        K.arcW(Q1.slice(), Q2.slice(), 40 + i * 7 + k, T, I2 * r, .4, C.LIME);
      }
      apI(Ws, c[0], c[1], c[2], Q1); K.glowW(Q1[0], Q1[1], Q1[2], 110, C.LIME, .55 * Math.exp(-h * 3)); K.glowW(Q1[0], Q1[1], Q1[2], 30, C.HOT, .7 * Math.exp(-h * 6));
    }
  }
}
function scanOverlay(T, Ws) {
  if (!TM) return;
  const u = T - TM.T_SCN, K = C.K; if (u < 0 || u > 11.2) return;
  for (let i = 0; i < SC.length; i++) {
    const s = SC[i], h = u - s.t - .15; if (h < 0) continue;
    const a = E.sat(h / .3) * (1 - E.ss(10.4, 11, u));
    if (a < .01) continue;
    const b = K.boxOf(s.mn, s.mx, Ws, 3 * K.S); if (!b) continue;
    const cb = [Math.max(-20, b[0]), Math.max(-20, b[1]), Math.min(K.BW + 20, b[2]), Math.min(K.BH + 20, b[3])];
    K.bracket(cb, '#C6F432', .9 * a, 12, 1.4);
    if (!SCT[i]) SCT[i] = K.mkTag();
    // the tag off the box's top-left corner (inside the frame, clear of the readout), a leader to it
    const ax = E.clamp(cb[0] + 20 * K.S, 40 * K.S, K.BW - 40 * K.S), ay = E.clamp(cb[1] + 20 * K.S, 40 * K.S, K.BH - 300 * K.S);
    const tx = E.clamp(ax + 46 * K.S, 450 * K.S, K.BW - 470 * K.S), ty = E.clamp(ay - 60 * K.S, 250 * K.S, 820 * K.S);
    K.put(SCT[i], s.id, K.decode(s.lab, E.sat(h / .7), T, s.id.length), s.val, 'lime sm', tx, ty, a, 10 - i, null, [ax, ay, tx - 4 * K.S, 10 * K.S, '#C6F432', .8 * a]);
  }
  K.lay();
}
/* the exploded module: a scan ring sweeping along it, arcs leaping part to part as each is named */
const XT = [
  ['LID', 'Lid · bayonet socket', 'lid', [0, .27, .1], .3],
  ['CAN', 'Film capacitors ×4 · 500 kJ', 'can0', [.2, .1, 0], .9],
  ['BPL', 'Laminated bus plates', 'bus', [-.28, .2, -.1], 1.5],
  ['SCR', 'Thyristor switch · 3 press-packs', 'scr', [SCR_C[0], SCR_C[1] + .08, 0], 2.1],
  ['DIO', 'Crowbar diodes · 2 discs', 'dio', [DIO_C[0], DIO_C[1] + .06, 0], 2.7],
  ['IND', 'Pulse inductor · superconducting', 'ind', [IND_C[0], IND_C[1] - .08, .1], 3.3],
  ['FRP', 'Front panel · 2 output bushings', 'front', [-.42, -.15, .1], 3.9],
];
const XTG = [];
function partPos(key, p, out) {
  let L = X.mul(MOD_L[XM], tr(-.72 * S.pull, 0, 0)), o = null, e = 0;
  let f;
  if (key === 'can0') { o = XP.can[3]; e = xpPart(XORD.can + .06); L = X.mul(L, tr(CAN_P[3][0], CAN_P[3][1], CAN_P[3][2])); f = bob('can3', e); }
  else { o = XP[key]; e = xpPart(XORD[key]); f = bob(key, e); }
  return X.ap(X.mul(L, tr(o[0] * e + f[0], o[1] * e + f[1], o[2] * e + f[2])), p);
}
function explodeFX(T, Ws) {
  if (S.xp < .02) return;
  const K = C.K, e = S.xp, u = T - TM.T_MX - 4.0;
  const L = X.mul(Ws, X.mul(MOD_L[XM], tr(-.72 * S.pull, 0, 0)));
  // a lime ring sweeping along the module's length (aisle -> back) as the parts are named
  const xs = -1.3 + 1.9 * ((Math.max(0, u) / 2.6) % 1), U = X.dir(L, [0, 1, 0]), W = X.dir(L, [0, 0, 1]);
  apI(L, xs, 0, 0, Q1); K.ringW(Q1.slice(), U, W, .55 * e, 120, 1, C.LIME, .5 * e, T * 2);
  for (let i = 0; i < XT.length; i++) {
    const [, , key, p, t0] = XT[i], a = u - t0; if (a < 0 || a > .9) continue;
    const q = partPos(key, p, Q2), w = X.ap(Ws, q), pr = i ? X.ap(Ws, partPos(XT[i - 1][2], XT[i - 1][3], Q3)) : X.ap(Ws, partPos('lid', [0, .4, 0], Q3));
    K.arcW(pr, w, 300 + i, T, 1 - a / .9, .35, C.HOT);
    K.glowW(w[0], w[1], w[2], 30, C.LIME, .6 * (1 - a / .9));
  }
}
function explodeTags(T, Ws) {
  if (S.xp < .05) return;
  const u = T - TM.T_MX - 4.0, end = TM.MXL - 4.0 - 4.6;
  for (let i = 0; i < XT.length; i++) {
    const [id, lab, key, p, t0] = XT[i], age = u - t0; if (age < 0) continue;
    const a = E.sat(age / .25) * (1 - E.sat((u - end) / .5)) * E.sat((S.xp - .5) / .3);
    if (!XTG[i]) XTG[i] = C.K.mkTag();
    const q = partPos(key, p, Q2), w = X.ap(Ws, q);
    const val = id === 'IND' ? `${indK(XM, T).toFixed(1)} K · 4 mH` : id === 'CAN' ? '8.3 mF each' : id === 'SCR' ? '6.5 kV × 3' : '';
    C.tagAt(XTG[i], id, lab, val, w, a, age);
  }
}
/* the charge's arcs at the contactors as they close */
function bayFX(T, Ws) {
  const K = C.K;
  for (const s of [1, -1]) {
    const a = T - TM.T_BANK - .7; if (a < -.05 || a > .3) continue;
    for (const z of [46.82, 47.175, 47.53]) { apI(Ws, s * 2.7, FL + 1.53, z, Q1); apI(Ws, s * 2.8, FL + 1.66, z + .05, Q2); K.arcW(Q1.slice(), Q2.slice(), 90 + z * 3 + s, T, 1 - Math.abs(a - .05) * 3, .6); C.oglow(Q1[0], Q1[1], Q1[2], 26, C.LIME, .5 * Math.exp(-Math.max(0, a) * 8)); }
  }
}

const RGB = { CL, XM, MOD_L, RANK, NRANK, BAYD, NET, SC, CBX, DWR, CMP, YH, HX, NECK, CAN_P, XP, SCR_C, DIO_C, IND_C,
  build, init, state, S, drawRoom, drawStatic, fx, scanFX, scanOverlay, explodeFX, explodeTags, bayFX, frontD, kAt, indK, meanIndK, arrT, partPos,
  netL: NET_L, frontPos(T, out) {                                     // the front on the starboard side's line (for its tag)
    const d = frontD(T); let best = null;
    for (const n of NET) { if (n.pl.P[0][0] < 0 && n.kind !== 'trunk') continue; const r = d - n.d0; if (r >= 0 && r <= n.pl.L) { best = n; P_.polyAt(n.pl, r, out); if (n.kind === 'branch') break; } }
    return best ? out : null;
  } };
window.RGB = RGB;
})();
