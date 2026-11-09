/* STRIKE · the rod line (window.STRIKE_FAB): a 10 s X-ray glimpse into the orbital railgun's fabrication bay during
   the closing act of the Duel. The craft is holed and its seams still glow, and the line keeps making tungsten rods:
   a row of bars stepping sideways through six stations (the powder compact in its mould, the press, the sintering
   furnace glowing white-hot, the radial forge with the bar still orange, the lathe cutting the ogive, the sabot's three
   petals closing round the finished rod); the handling arm lifts the finished round off the end of the line to the
   bore line, a cradle and a ram run it through the port in the bay's front wall into the open chamber, and the row
   steps on, the next rod into the petals. (The look follows the orbital film's fabrication bay,
   ../pc_orbital_railgun/pc_orbital_railgun_fab.js, drawn smaller and faster; nothing is shared with it.)

   Contract (strike_orbit.js, its beat 'Line'): STRIKE_FAB = { len, draw(u, Wt, o), cam(u), readout(u), tags(u, Wt, put),
   cues: [[name, u]], poi(u, PW) }; u s into the shot (the act's x20 clock: 1 s = 20 s sim), Wt the platform -> world
   pose, o { a (the X-ray's fade 0..1), T (base time), tH (the damage's time), dmg (the intercept's damage, for its
   entry hole) }. The round's hand-off: at u = SEAT it lies where the platform's own round sits (CHAMBER: platform
   z -12.5, nose +Z); the orbital film draws that one from base time 159.8 on and this one fades out over it.
   Frames: the bay (metres; the platform's axes, origin the bay's centre at platform z -80; floor y -22, the front wall
   z +36 with a 2.3 m port on the bore axis). Everything is a pure function of u. */
(function () {
'use strict';
const { V, X, E, rng } = M3;
const PI = Math.PI, TAU = 2 * PI;
const ss = E.ss, sat = E.sat;
const kk = (u, a, b) => E.inOut(sat((u - a) / (b - a)));
const K = window.ORK, L = window.ORL, IO = window.IORB || null, P = IO ? IO.P : null;
if (!K || !L || !P) return;
const Body = L.Body;
const LIME = [198, 244, 50], HOT = [248, 255, 232], WH = [238, 238, 228], CORAL = [255, 106, 61];
const XA = [1, 0, 0], YA = [0, 1, 0], ZA = [0, 0, 1];

/* ---------------- the beat (u) ---------------- */
const LEN = 10;
const IDX = [[.4, 2.0], [6.7, 8.3]];                           // the row steps one station (walking beams)
const PET = [2.0, 2.9];                                         // the petals close round the rod at the end
const GRIP = [2.9, 3.4], LIFT = [3.5, 5.7], REL = [5.8, 6.3];   // the jaws close, the round up to the bore line, released
const RAM = [6.5, 9.3], SEAT = 9.4;                             // the ram runs it along the rails, through the port
const RATE = 20;                                                // (the act's clock here: sim s per film s)

/* ---------------- the bay ---------------- */
const BZ = P.BAY_C ? P.BAY_C[2] : -80, ZCH = (P.Z_RND !== undefined ? P.Z_RND : -12.5) - BZ;   // the chamber's centre (bay z 67.5)
const YL = -14, ZL = -6;                                        // the line: the bars' axis height, their centres (z)
const XS = [-26, -20.8, -15.6, -10.4, -5.2, 0];                 // stations: mould, press, furnace, forge, lathe, sabot
const RND_L = P.RND_L || 21, RND_R = P.RND_R || .96, ARM_L = P.ARM_L || 1.6, ROD_L = P.ROD_L || 18, ROD_R = P.ROD_R || .15;
const MASS = PI * ROD_R * ROD_R * ROD_L * 19.3;

/* ---------------- transforms (in place) ---------------- */
const mkX = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] });
const M9a = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function rot9(o, ax, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (ax === 0) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = c; o[5] = -s; o[6] = 0; o[7] = s; o[8] = c; }
  else if (ax === 1) { o[0] = c; o[1] = 0; o[2] = s; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = -s; o[7] = 0; o[8] = c; }
  else if (ax === 2) { o[0] = c; o[1] = -s; o[2] = 0; o[3] = s; o[4] = c; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; }
  else { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; }
  return o;
}
/* o = Pf ∘ (translate t, rotate Rl) */
function cmp(o, Pf, Rl, tx, ty, tz) {
  const M = Pf.R, r = o.R;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = M[i * 3] * Rl[j] + M[i * 3 + 1] * Rl[3 + j] + M[i * 3 + 2] * Rl[6 + j];
  o.T[0] = M[0] * tx + M[1] * ty + M[2] * tz + Pf.T[0]; o.T[1] = M[3] * tx + M[4] * ty + M[5] * tz + Pf.T[1]; o.T[2] = M[6] * tx + M[7] * ty + M[8] * tz + Pf.T[2];
  return o;
}
const at = (o, Pf, x, y, z, ax, a) => cmp(o, Pf, rot9(M9a, ax === undefined ? -1 : ax, a || 0), x, y, z);
const apX = (Pf, x, y, z, o) => { const M = Pf.R; o[0] = M[0] * x + M[1] * y + M[2] * z + Pf.T[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + Pf.T[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + Pf.T[2]; return o; };
const BWX = mkX();                                              // bay -> world (this frame)
const XQ = []; for (let i = 0; i < 48; i++) XQ.push(mkX());
let xq = 0; const nx = () => XQ[(xq++) % XQ.length];
const PWa = [0, 0, 0], PWb = [0, 0, 0];

/* ---------------- the look ---------------- */
let HEATQ = 0, SEAMQ = 0;
const fx = (ch, q) => ch === 1 ? HEATQ : ch === 2 ? (SEAMQ * (.75 + .25 * Math.sin(q * 3.1 + UU * 2.3))) : 0;
const OPT = o => Object.assign({ L: [0, 1, 0], a: 1, keep: 1, pxf: 1, fx }, o);
const O = {
  mc: OPT({ a: .95, keep: .85, pxf: 1.05 }), mcd: OPT({ a: .62, keep: .65, pxf: 1.3 }), hero: OPT({ a: 1.15, pxf: .85 }),
  rod: OPT({ a: 1.45, pxf: .7 }), hot: OPT({ a: 1.2, pxf: .75 }), arm: OPT({ a: 1.0, keep: .9, pxf: .95 }), seam: OPT({ a: 1.1, pxf: .9 }),
  sab: OPT({ a: 1.25, pxf: .8 }),
};
const OA = Object.keys(O).map(k => [O[k], O[k].a]);
const heatV = h => h <= 0 ? 0 : h < 1 ? 10 + h : 11 + Math.min(1, h - 1);       // the lattice's heat channel (warm .. white-hot)
const GLC = [255, 170, 90];
function glowAlong(Pf, z0, z1, h, px, a) {
  const n = Math.max(2, Math.round((z1 - z0) / 1.2));
  GLC[1] = 120 + 110 * Math.min(1, h); GLC[2] = 60 + 140 * Math.min(1, h);
  for (let i = 0; i <= n; i++) { apX(Pf, 0, 0, z0 + (z1 - z0) * i / n, PWa); K.glowW(PWa[0], PWa[1], PWa[2], px, GLC, a); }
}

/* ---------------- building ---------------- */
const B_ = {};
const mk = (name, fn) => { const B = new Body(name); fn(B); B.done(); return B; };
const bx = (B, x0, y0, z0, x1, y1, z1, cell, o) => B.box([x0, y0, z0], [x1, y1, z1], cell || .12, Object.assign({ br: .8, edge: .72 }, o || {}));
const rodB = (len, r, br, nose) => mk('rod', B => {
  const st = nose ? [[0, 0], [0, r * .8], [.12, r], [len - nose, r], [len - .25, r * .42], [len, 0]] : [[0, 0], [0, r], [len, r], [len, 0]];
  B.lathe([0, 0, -len / 2], ZA, st, { cell: .045, br, seams: 6, sbr: .4, ch: 1, q: 0, rbr: .55 });
  B.ringP([0, 0, -len / 2 + .8], XA, YA, r * 1.03, .55, 1, 0); B.ringP([0, 0, len / 2 - 1.2], XA, YA, r * 1.03, .45, 1, 0);
});
function build() {
  if (B_.done) return;
  const zA = ZL - 10.6, zB = ZL + 10.6;
  // the line's bed: four beams across the row, legs to the deck, a V-block per station per beam; the walking beams
  B_.bed = mk('bed', B => {
    for (const z of [ZL - 8.6, ZL - 3, ZL + 3, ZL + 8.6]) {
      bx(B, -30, YL - 1.75, z - .3, 3.2, YL - 1.25, z + .3, .1, { br: .75 });
      for (let x = -29; x <= 3; x += 4) B.tube([x, YL - 1.75, z], [x, -22, z], .16, .55);
      for (const xs of XS) { B.box([xs - .38, YL - 1.25, z - .22], [xs + .38, YL - .6, z + .22], .04, { br: .85, edge: .8 }); B.line([xs - .3, YL - .62, z], [xs, YL - .3, z], .7); B.line([xs + .3, YL - .62, z], [xs, YL - .3, z], .7); }
    }
    for (let x = -29; x <= 3; x += 8) { B.line([x, YL - 1.5, ZL - 8.6], [x, YL - 1.5, ZL + 8.6], .4); }
    // the deck under the line: a plate grid
    for (let x = -30; x <= 6; x += 3) B.line([x, -21.95, zA - 3], [x, -21.95, zB + 3], .22);
    for (let z = zA - 3; z <= zB + 3.01; z += 3) B.line([-30, -21.95, z], [6, -21.95, z], .22);
  });
  B_.walk = mk('walk', B => { for (const z of [ZL - 6, ZL + 6]) { bx(B, -27.5, -.25, z - .18, 1.6, .25, z + .18, .06, { br: .8 }); for (const xs of XS) B.box([xs - .3, .25, z - .2], [xs + .3, .55, z + .2], .03, { br: .95, edge: .85 }); } });
  // S0 the mould: a long trough on the bed, the dosing hopper above, its auger
  B_.mould = mk('mould', B => {
    const x = XS[0];
    bx(B, x - .55, YL - .6, zA + .2, x + .55, YL - .45, zB - .2, .08, { br: .7 });
    for (const s of [-1, 1]) bx(B, x + s * .55 - .05, YL - .6, zA + .2, x + s * .55 + .05, YL + .45, zB - .2, .08, { br: .62 });
    B.lathe([x, YL + 4.2, ZL], YA, [[0, .25], [1.6, 1.6], [3.4, 1.6], [3.4, 0]], { cell: .12, br: .7, seams: 8, rbr: .6 });
    B.cyl([x, YL + 3.9, zA + 1], [x, YL + 3.9, zB - 1], .32, { cell: .08, br: .6, rings: true });
    B.tube([x, YL + 4.2, ZL], [x, YL + 3.9, ZL], .2, .7);
    for (const s of [-1, 1]) B.tube([x + s * 1.8, YL + 4.2, ZL - 1.2], [x + s * 1.8, -22, ZL - 1.2], .14, .5);
  });
  // S1 the press: five frames along the bar, a crown beam, a ram each, one long platen (moving)
  B_.press = mk('press', B => {
    const x = XS[1];
    for (const z of [ZL - 8.4, ZL - 4.2, ZL, ZL + 4.2, ZL + 8.4]) {
      for (const s of [-1, 1]) bx(B, x + s * 1.5 - .25, YL - 1.75, z - .4, x + s * 1.5 + .25, YL + 5.2, z + .4, .1, { br: .85 });
      bx(B, x - 1.9, YL + 5.2, z - .5, x + 1.9, YL + 6.0, z + .5, .1, { br: .9 });
      B.cyl([x, YL + 5.2, z], [x, YL + 3.6, z], .42, { cell: .06, br: .8, caps: true, seams: 6 });
      B.knot([x + 1.95, YL + 5.6, z], .12, .9);
    }
    B.tube([x - 1.9, YL + 6.1, ZL - 9], [x - 1.9, YL + 6.1, ZL + 9], .12, .55);
  });
  B_.platen = mk('platen', B => { bx(B, -.7, 0, -9.6, .7, .55, 9.6, .1, { br: .95 }); for (const z of [-8.4, -4.2, 0, 4.2, 8.4]) B.cyl([0, .55, z], [0, 2.0, z], .22, { cell: .04, br: .85 }); });
  // S2 the furnace: a long clamshell tube (the lower half fixed; the lid hinged on the far side), heater rings inside
  const FR = 1.45;
  B_.furn = mk('furn', B => {
    const x = XS[2];
    for (let k = 0; k < 12; k++) { const t0 = PI + PI * k / 12, t1 = PI + PI * (k + 1) / 12, tm = (t0 + t1) / 2, p0 = [x + Math.cos(t0) * FR, YL + Math.sin(t0) * FR, zA], p1 = [x + Math.cos(t1) * FR, YL + Math.sin(t1) * FR, zA]; B.panel(p0, [0, 0, zB - zA], V.sub(p1, p0), .14, { n: [Math.cos(tm), Math.sin(tm), 0], br: .7, edge: false }); }
    for (const z of [zA, zB]) { B.ring([x, YL, z], XA, YA, FR, 24, .85, 0, 0, PI, TAU); B.ring([x, YL, z], XA, YA, FR * .7, 20, .5, 0, 0, PI, TAU); B.line([x - FR, YL, z], [x + FR, YL, z], .7); }
    for (let k = 0; k < 4; k++) B.tube([x - FR * .9, YL - 1.75, zA + 1 + k * (zB - zA - 2) / 3], [x + FR * .9, YL - 1.75, zA + 1 + k * (zB - zA - 2) / 3], .2, .6);
    bx(B, x + FR + .4, YL - 1.75, zB - 2.2, x + FR + 1.6, YL + 1.4, zB + .2, .08, { br: .8 });
    B.tube([x + FR, YL - .6, zB - 1], [x + FR + .4, YL - .6, zB - 1], .12, .6);
  });
  B_.lid = mk('lid', B => {                                    // hinge line at the lid's +x edge, the bar's axis at (-FR, 0)
    for (let k = 0; k < 12; k++) { const t0 = PI * k / 12, t1 = PI * (k + 1) / 12, tm = (t0 + t1) / 2, p0 = [-FR + Math.cos(t0) * FR, Math.sin(t0) * FR, zA], p1 = [-FR + Math.cos(t1) * FR, Math.sin(t1) * FR, zA]; B.panel(p0, [0, 0, zB - zA], V.sub(p1, p0), .14, { n: [Math.cos(tm), Math.sin(tm), 0], br: .72, edge: false }); }
    for (const z of [zA, zB]) B.ring([-FR, 0, z], XA, YA, FR, 24, .85, 0, 0, 0, PI);
    for (let j = 1; j < 9; j++) B.ring([-FR, 0, zA + j * (zB - zA) / 9], XA, YA, FR + .03, 16, .5, 0, 0, 0, PI);
  });
  // (the heater rings and the hot lining: drawn in heat)
  B_.lining = mk('lining', B => {
    const x = XS[2];
    for (let j = 0; j <= 14; j++) B.ring([x, YL, zA + .4 + j * (zB - zA - .8) / 14], XA, YA, FR * .66, 20, .8, 1, j);
    for (let k = 0; k < 8; k++) { const t = PI + PI * k / 7; B.line([x + Math.cos(t) * FR * .7, YL + Math.sin(t) * FR * .7, zA + .3], [x + Math.cos(t) * FR * .7, YL + Math.sin(t) * FR * .7, zB - .3], .5, 1, k); }
  });
  // S3 the radial forge: a housing ring round the bar with four hammers (the head travels along the bar)
  B_.forge = mk('forge', B => {
    B.lathe([0, 0, -.8], ZA, [[0, .9], [0, 2.5], [1.6, 2.5], [1.6, .9]], { cell: .1, br: .85, seams: 12, rbr: .7 });
    for (let k = 0; k < 4; k++) { const t = k / 4 * TAU + PI / 4, c = Math.cos(t), s = Math.sin(t); B.obox([c * 3.0, s * 3.0, 0], [c, s, 0], [-s, c, 0], ZA, [.6, .5, .6], .06, { br: .9, edge: .8 }); }
  });
  B_.forgeRail = mk('fRail', B => { const x = XS[3]; for (const s of [-1, 1]) bx(B, x + s * 2.0 - .2, YL - 3.6, zA - 1, x + s * 2.0 + .2, YL - 3.2, zB + 1, .1, { br: .7 }); for (const s of [-1, 1]) for (const z of [zA, ZL, zB]) B.tube([x + s * 2.0, YL - 3.6, z], [x + s * 2.0, -22, z], .15, .5); });
  B_.forgeCar = mk('fCar', B => { for (const s of [-1, 1]) B.box([s * 2.0 - .3, -3.6, -1], [s * 2.0 + .3, -2.4, 1], .06, { br: .85, edge: .8 }); B.line([-2, -2.4, 0], [-1.2, -1.4, 0], .7); B.line([2, -2.4, 0], [1.2, -1.4, 0], .7); });
  B_.hammer = mk('ham', B => { B.obox([0, 0, 0], XA, YA, ZA, [.32, .55, .45], .04, { br: 1, edge: .9 }); B.line([0, .55, 0], [0, 1.4, 0], .8); });
  // S4 the lathe: bed, headstock, tailstock, the tool carriage (moving)
  B_.lathe = mk('lathe', B => {
    const x = XS[4];
    for (const s of [-1, 1]) bx(B, x + s * .9 - .25, YL - 2.4, zA - 2, x + s * .9 + .25, YL - 1.8, zB + 2, .1, { br: .75 });
    bx(B, x - 1.3, YL - 2.4, zA - 2.6, x + 1.3, YL + 1.4, zA - .3, .1, { br: .9 });
    bx(B, x - .9, YL - 2.4, zB + .3, x + .9, YL + .9, zB + 2.0, .1, { br: .85 });
    B.cyl([x, YL, zA - .3], [x, YL, zA + .2], .8, { cell: .05, br: .95, caps: true, seams: 6 });
    B.cyl([x, YL, zB - .2], [x, YL, zB + .3], .3, { cell: .04, br: .9, caps: true });
    for (const z of [zA - 1.6, zB + 1]) B.tube([x, YL - 2.4, z], [x, -22, z], .25, .55);
  });
  B_.chuck = mk('chuck', B => { for (let k = 0; k < 3; k++) { const t = k / 3 * TAU; B.obox([Math.cos(t) * .5, Math.sin(t) * .5, 0], [Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], ZA, [.18, .12, .25], .03, { br: 1, edge: .9 }); } });
  B_.carr = mk('carr', B => { bx(B, -1.1, -2.0, -.9, 1.1, -1.3, .9, .06, { br: .9 }); bx(B, -1.1, -1.3, -.4, -.35, .2, .4, .05, { br: .95 }); B.line([-.35, 0, 0], [-.18, 0, 0], 1); });
  // S5 the sabot: three petals and the armature disc pack (the platform's own round takes over once it is closed)
  const ri = ROD_R + .02, ro = RND_R, z0 = -RND_L / 2, zt = z0 + RND_L - 1.6, z1 = z0 + RND_L, rt = ROD_R + .3;
  B_.pet = [0, 1, 2].map(k => mk('pet', B => {
    const a0 = k / 3 * TAU + .04, a1 = (k + 1) / 3 * TAU - .04, Pp = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z], NF = 8;
    for (let f = 0; f < NF; f++) {
      const b0 = a0 + (a1 - a0) * f / NF, b1 = a0 + (a1 - a0) * (f + 1) / NF, bm = (b0 + b1) / 2, n = [Math.cos(bm), Math.sin(bm), 0];
      B.panel(Pp(b0, ro, z0), V.sub(Pp(b1, ro, z0), Pp(b0, ro, z0)), [0, 0, zt - z0], .08, { n, br: .75, edge: false });
      const t0 = Pp(b0, ro, zt), t1 = Pp(b1, ro, zt), t2 = Pp(b0, rt, z1);
      B.panel(t0, V.sub(t1, t0), V.sub(t2, t0), .08, { n: V.norm([n[0] * 1.6, n[1] * 1.6, ro - rt]), br: .75, edge: false });
    }
    for (const a of [a0, a1]) { B.panel(Pp(a, ri, z0), V.sub(Pp(a, ro, z0), Pp(a, ri, z0)), [0, 0, zt - z0], .08, { n: [-Math.sin(a), Math.cos(a), 0], br: .6, two: true, edge: .9 }); B.line(Pp(a, ro, zt), Pp(a, rt, z1), .9); }
    for (let j = 0; j <= 6; j++) B.ring([0, 0, z0 + (zt - z0) * j / 6], XA, YA, ro * 1.004, 16, j % 3 ? .5 : .8, 0, 0, a0, a1);
  }));
  B_.armat = mk('arm8', B => { B.lathe([0, 0, z0 - ARM_L], ZA, [[0, .3], [0, ro * .99], [ARM_L, ro * .99], [ARM_L, .3]], { cell: .06, br: .9, seams: 12, rbr: .75 }); });
  // the bars in their states (centred, along +z, the nose at +z)
  B_.rC = rodB(19.8, .23, .8); B_.rP = rodB(19.2, .2, .88); B_.rS = rodB(18.7, .175, .8); B_.rF = rodB(18.3, .158, .85); B_.rM = rodB(ROD_L, ROD_R, .95, 1.3);
  // the handling arm (a big six-axis arm on the deck starboard of the line's end) and its gripper bar
  const ar = .7;
  B_.aBase = mk('aB', B => { B.cyl([0, 0, 0], [0, 1.4, 0], ar * 2.6, { cell: .1, br: .8, caps: true, seams: 12 }); B.cyl([0, 1.4, 0], [0, 2.0, 0], ar * 1.9, { cell: .1, br: .85, seams: 12 }); });
  B_.aTur = mk('aT', B => { B.obox([0, 3.0, 0], XA, YA, ZA, [ar * 1.5, 1.1, ar * 1.5], .1, { br: .9, edge: .75 }); B.cyl([-ar * 1.6, 4.4, 0], [ar * 1.6, 4.4, 0], ar * 1.25, { cell: .08, br: .9, caps: true, seams: 8 }); });
  B_.aL1 = mk('a1', B => { B.obox([0, 0, 6.2], XA, YA, ZA, [ar * .9, ar * 1.0, 6.6], .1, { br: .92, edge: .8 }); B.cyl([-ar * 1.1, 0, 12.5], [ar * 1.1, 0, 12.5], ar, { cell: .08, br: .9, caps: true }); for (const s of [-1, 1]) B.line([s * ar * .91, -ar * .5, 0], [s * ar * .91, -ar * .5, 12.5], .4); });
  B_.aL2 = mk('a2', B => { B.obox([0, 0, 5.4], XA, YA, ZA, [ar * .7, ar * .75, 5.6], .1, { br: .92, edge: .8 }); B.cyl([0, 0, 10.6], [0, 0, 12], ar * .6, { cell: .06, br: .9, caps: true }); for (const s of [-1, 1]) B.line([s * ar * .71, 0, .4], [s * ar * .71, 0, 10.4], .4); });
  B_.grip = mk('gr', B => {                                     // the tool frame: +z the arm's tool axis (down), the bar along x
    B.cyl([0, 0, 0], [0, 0, 1.0], .45, { cell: .05, br: .95, caps: true });
    bx(B, -8, -.35, 1.0, 8, .35, 1.6, .08, { br: .95 });
    for (const x of [-6.5, -2.2, 2.2, 6.5]) {
      for (const s of [-1, 1]) { B.box([x - .25, s * (RND_R + .15) - .12, 1.6], [x + .25, s * (RND_R + .15) + .12, 1.6 + RND_R + .6], .04, { br: 1, edge: .9 }); }
      B.line([x, -RND_R - .2, 1.6], [x, RND_R + .2, 1.6], .7);
    }
  });
  // the transfer: rails to the wall, the cradle, the ram's three stages, the port ring
  B_.rails = mk('rails', B => {
    for (const s of [-1, 1]) bx(B, s * .75 - .12, -RND_R - .55, ZL - 12, s * .75 + .12, -RND_R - .35, 36, .1, { br: .85 });
    for (let z = ZL - 12; z < 36; z += 6) { B.tube([0, -RND_R - .55, z], [0, -22, z], .16, .45); B.line([-.75, -RND_R - .55, z], [.75, -RND_R - .55, z], .6); }
    B.ringP([0, 0, 36 - .1], XA, YA, 2.3, 1, 0, 0); B.ringP([0, 0, 36 - .1], XA, YA, 2.7, .6, 0, 0);
    for (let k = 0; k < 12; k++) { const t = k / 12 * TAU; B.knot([Math.cos(t) * 2.5, Math.sin(t) * 2.5, 35.9], .12, .85); }
  });
  B_.ram = [0, 1, 2].map(i => mk('ram', B => { const r = .42 - i * .1; B.cyl([0, 0, 0], [0, 0, 12.4], r, { cell: .05, br: .85 - .05 * i, seams: 6, rbr: .7 }); B.ringP([0, 0, 12.4], XA, YA, r + .03, .9); }));
  B_.ramHead = mk('rh', B => { B.cyl([0, 0, -.25], [0, 0, 0], RND_R * .8, { cell: .04, br: 1, caps: true }); });
  B_.ramBase = mk('rb', B => { bx(B, -1.2, -1.2, -2.2, 1.2, 1.2, 0, .08, { br: .9 }); B.cyl([0, 0, -14.6], [0, 0, -2.2], .62, { cell: .08, br: .75, seams: 6, rbr: .6 }); for (const s of [-1, 1]) for (const z of [-1.1, -12]) B.tube([s * .9, -.6, z], [s * .9, -22, z], .2, .5); });
  B_.done = true;
}

/* ---------------- the damage round the bay (platform frame): torn seams glowing, buckled plates, sparking ends ---- */
const DMG = { built: false, seams: null, plates: null, ends: [], gl: [] };
function buildDamage(entry) {
  const r = rng(51117);
  // a torn line: midpoint displacement (sharp zigzags at every scale)
  const jag = (a, b, n, amp) => {
    const d = V.sub(b, a), L_ = V.len(d), side = V.norm(V.cross(d, Math.abs(d[1]) < .9 * L_ ? YA : XA)), up = V.norm(V.cross(side, d));
    let P_ = [a, b];
    for (let lv = 0, A_ = amp; P_.length < n * 2 + 1; lv++, A_ *= .55) { const Q = [P_[0]]; for (let i = 0; i < P_.length - 1; i++) { const m = V.lerp(P_[i], P_[i + 1], .35 + .3 * r()); Q.push(V.add(m, V.add(V.mul(side, (r() - .5) * 2 * A_), V.mul(up, (r() - .5) * A_ * .5))), P_[i + 1]); } P_ = Q; }
    return P_;
  };
  DMG.seams = mk('seam', B => {
    let q = 0;
    const seam = (a, b, n, amp, br) => { const pts = jag(a, b, n, amp); for (let i = 0; i < pts.length - 1; i++) { B.line(pts[i], pts[i + 1], br || 1, 2, q); B.line(V.add(pts[i], [.14, .14, .1]), V.add(pts[i + 1], [.14, .14, .1]), (br || 1) * .6, 2, q + .5); q += .37; DMG.gl.push(pts[i]); } return pts; };
    // from the entry wound forward along the starboard plating to the bay's aft wall, then cracks across the wall
    const e = entry || [52, -24, -170], c0 = [27, -20, -116.5];
    const main = seam(V.add(e, [-2, 3, 6]), c0, 14, 2.6, 1);
    seam(main[5], [30, 4, -128], 7, 1.6, .85); seam(main[9], [22, -21.5, -126], 5, 1.2, .8);
    // across the aft wall (bay z -36 = platform -116): a branching crack, up and inboard
    const w1 = seam(c0, [6, -2, -116.2], 10, 1.4, 1), w2 = seam(w1[4], [16, 14, -116.2], 7, 1.2, .9); seam(w1[7], [-4, -14, -116.2], 6, 1.0, .8); seam(w2[3], [26, 18, -116.3], 5, .9, .75);
    // the deckhead seam over the line (a frame line split open)
    seam([24, 21.5, -110], [-6, 21.6, -94], 12, .9, .8);
    // the deck under the line torn along its plate joints, and the port wall beside it (the shock ran through the frames)
    const f1 = seam([27, -21.8, -114], [-4, -21.8, -98], 14, 1.6, 1), f2 = seam(f1[9], [-26, -21.8, -72], 12, 1.4, .95);
    seam(f1[17], [8, -21.8, -66], 8, 1.0, .85); seam(f2[8], [-27.8, -21.8, -100], 6, .9, .8);
    const p1 = seam([-27.9, -21.5, -112], [-27.9, 8, -84], 12, 1.2, .9); seam(p1[11], [-27.9, 16, -104], 6, .9, .8);
  });
  // plates bowed in by the shock: outlines pushed inward with their corners still on the frames
  DMG.plates = mk('plates', B => {
    const plate = (c, u, w, n, depth) => { const P_ = []; for (let i = 0; i <= 8; i++) { const t = i / 8 * TAU, k = 1 + (r() - .5) * .15; P_.push(V.add(c, V.add(V.mul(u, Math.cos(t) * 2.4 * k), V.add(V.mul(w, Math.sin(t) * 1.8 * k), V.mul(n, depth * (1 - Math.abs(Math.cos(t)) * .3)))))); } B.poly(P_, true, .9, 2, 3.3); B.line(V.sub(c, V.mul(u, 2.2)), V.add(V.add(c, V.mul(u, 2.2)), V.mul(n, depth * .6)), .6, 2, 1.1); B.line(V.sub(c, V.mul(w, 1.6)), V.add(c, V.mul(w, 1.6)), .5, 0, 0); };
    plate([20, 6, -116.3], XA, YA, ZA, 1.6); plate([10, 12, -116.3], XA, YA, ZA, 1.2); plate([24, -10, -116.3], XA, YA, ZA, 1.9);
    plate([28.2, -4, -106], ZA, YA, [-1, 0, 0], 1.4); plate([28.2, 8, -98], ZA, YA, [-1, 0, 0], 1.0);
    plate([12, -21.9, -104], XA, ZA, YA, 1.3); plate([-18, -21.9, -78], XA, ZA, YA, 1.1); plate([-27.9, -6, -96], ZA, YA, XA, 1.2);
  });
  DMG.ends = [[26.5, 9, -114], [12, -1, -115.5], [27.8, -6, -104], [3, 20.8, -97], [-27.6, 2, -92], [-6, -21.6, -94]];
  DMG.built = true;
}
/* sparks off the cut cable ends and the forge (straight lines in microgravity, analytic in u) */
const RND = (() => { const r = rng(9091), A = new Float32Array(4096); for (let i = 0; i < 4096; i++) A[i] = r(); return A; })();
const SPC = [255, 196, 120], SPW = [255, 236, 200];
function sparks(Pf, p, dir, n, spread, v0, v1, life, u, a, seed, col) {
  const s0 = seed * 131;
  for (let i = 0; i < n; i++) {
    const j = (s0 + i * 7) & 4095, ph = RND[j] * life, age = ((u - ph) % life + life) % life, k = age / life;
    const v = v0 + (v1 - v0) * RND[(j + 1) & 4095], g = (RND[(j + 2) & 4095] - .5) * 2 * spread, h = (RND[(j + 3) & 4095] - .5) * 2 * spread, w = (RND[(j + 4) & 4095] - .5) * 2 * spread, d = v * age;
    apX(Pf, p[0] + (dir[0] + g) * d, p[1] + (dir[1] + h) * d, p[2] + (dir[2] + w) * d, PWa);
    K.dotW(PWa[0], PWa[1], PWa[2], 1, col || SPC, a * (1 - k * k));
  }
}

/* ---------------- the state at u ---------------- */
/* which bar sits where: before the first step the row holds bars 0..4 at stations 0..4; each step moves every bar one
   station (a new compact enters the mould from the left); bar 4 reaches the sabot at the first step and is the round */
const steps = u => (u > IDX[0][1] ? 1 : 0) + (u > IDX[1][1] ? 1 : 0);
/* a bar's station position (fractional while a step runs) and its lift off the bed */
function barPos(b, u, out) {
  let s = b, lift = 0;
  for (const [a0, a1] of IDX) {
    if (u >= a1) { s += 1; continue; }
    if (u > a0) { const w = (u - a0) / (a1 - a0); lift = Math.sin(PI * sat(w * 1.25 - .125)); s += kk(w, .2, .8); }
    break;
  }
  out.s = s; out.lift = .7 * lift; return out;
}
const BP = { s: 0, lift: 0 };
const stX = s => { const i = Math.max(0, Math.min(XS.length - 1, Math.floor(s))), f = s - i; return i >= XS.length - 1 ? XS[XS.length - 1] + (s - (XS.length - 1)) * 5.2 : XS[i] + (XS[i + 1] - XS[i]) * f; };
/* the round's centre (bay) and whether the arm holds it: on the line, lifted, set on the cradle, run in by the ram */
const BP4 = { s: 0, lift: 0 };
function roundAt(u, o) {
  if (u < LIFT[0]) { barPos(4, u, BP4); o[0] = stX(BP4.s); o[1] = YL + BP4.lift; o[2] = ZL; return o; }
  o[0] = 0; o[1] = YL * (1 - kk(u, LIFT[0], LIFT[1])); o[2] = ZL + (ZCH - ZL) * kk(u, RAM[0], RAM[1]);
  return o;
}
const RC = [0, 0, 0];

/* ---------------- the arm (IK, elbow up) ---------------- */
const ARM = { b: [9.5, -22, ZL], H: 4.4, L1: 12.5, L2: 12.0, LT: 2.0 };
const AP = { sh: [0, 0, 0], el: [0, 0, 0], wr: [0, 0, 0] };
function armPose(p) {                                          // the tool tip at p, the tool pointing down (-y)
  const b = ARM.b, wx = p[0], wy = p[1] + ARM.LT, wz = p[2];
  const yaw = Math.atan2(wx - b[0], wz - b[2]), rh = Math.hypot(wx - b[0], wz - b[2]), h = wy - (b[1] + ARM.H);
  let dd = Math.hypot(rh, h); const mx = ARM.L1 + ARM.L2 - 1e-3; if (dd > mx) dd = mx;
  const ce = E.clamp((dd * dd - ARM.L1 ** 2 - ARM.L2 ** 2) / (2 * ARM.L1 * ARM.L2), -1, 1), e = Math.acos(ce);
  const sh = Math.atan2(h, rh) + Math.atan2(ARM.L2 * Math.sin(e), ARM.L1 + ARM.L2 * Math.cos(e)), fa = sh - e;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  AP.sh[0] = b[0]; AP.sh[1] = b[1] + ARM.H; AP.sh[2] = b[2];
  AP.el[0] = AP.sh[0] + sy * Math.cos(sh) * ARM.L1; AP.el[1] = AP.sh[1] + Math.sin(sh) * ARM.L1; AP.el[2] = AP.sh[2] + cy * Math.cos(sh) * ARM.L1;
  AP.wr[0] = AP.el[0] + sy * Math.cos(fa) * ARM.L2; AP.wr[1] = AP.el[1] + Math.sin(fa) * ARM.L2; AP.wr[2] = AP.el[2] + cy * Math.cos(fa) * ARM.L2;
  AP.yaw = yaw;
}
/* the rotation whose +Z is f, +Y as near u as possible */
function look9(o, f, up) {
  const fz = V.norm(f); let xx = V.cross(up, fz); if (V.len(xx) < 1e-6) xx = V.cross([1, 0, 0], fz); xx = V.norm(xx); const yy = V.cross(fz, xx);
  o[0] = xx[0]; o[1] = yy[0]; o[2] = fz[0]; o[3] = xx[1]; o[4] = yy[1]; o[5] = fz[1]; o[6] = xx[2]; o[7] = yy[2]; o[8] = fz[2]; return o;
}
const M9L = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const segX = (o, a, b, up) => cmp(o, BWX, look9(M9L, V.sub(b, a), up), a[0], a[1], a[2]);
/* the arm's tip through the beat: parked high over the line, down onto the round, up with it, back */
const PARK = [4.5, 2, ZL];
function armTip(u, o) {
  const top = [0, YL + RND_R + .55, ZL];
  roundAt(u, RC);
  if (u < GRIP[0] - 1.2) { o[0] = PARK[0]; o[1] = PARK[1]; o[2] = PARK[2]; return o; }
  if (u < GRIP[0]) { const w = kk(u, GRIP[0] - 1.2, GRIP[0]); for (let k = 0; k < 3; k++) o[k] = PARK[k] + (top[k] - PARK[k]) * w; return o; }
  if (u < REL[1]) { o[0] = 0; o[1] = Math.min(RC[1], 0) + RND_R + .55; o[2] = ZL; return o; }
  const w = kk(u, REL[1], REL[1] + .6), up = [0, RND_R + .55 + 3.5 * w, ZL];
  for (let k = 0; k < 3; k++) o[k] = up[k] + (PARK[k] - up[k]) * kk(u, REL[1] + .4, REL[1] + 2.4);
  return o;
}
const TIP = [0, 0, 0];
const jawAt = u => kk(u, GRIP[0] + .1, GRIP[1]) * (1 - kk(u, REL[0], REL[1]));

/* ---------------- draw ---------------- */
let UU = 0;
function draw(u, Wt, o) {
  if (!B_.done) build();
  if (!DMG.built) buildDamage(o && o.dmg && o.dmg.holes ? o.dmg.holes[0].C : null);
  UU = u; xq = 0;
  const a = o && o.a !== undefined ? o.a : 1;
  for (const [op, a0] of OA) op.a = a0 * a;
  // the bay keyed from the lens's side (the X-ray's own light: the sun would leave the faces we see dark)
  const C = K.C, Ls = V.norm([-C.f[0] * .75 + C.u[0] * .55 + C.r[0] * .3, -C.f[1] * .75 + C.u[1] * .55 + C.r[1] * .3, -C.f[2] * .75 + C.u[2] * .55 + C.r[2] * .3]); for (const k in O) O[k].L = Ls;
  // bay -> world
  const M = Wt.R; BWX.R = Wt.R; BWX.T[0] = M[2] * BZ + Wt.T[0]; BWX.T[1] = M[5] * BZ + Wt.T[1]; BWX.T[2] = M[8] * BZ + Wt.T[2];
  // the damage first (platform frame): seams pulsing, slowly cooling
  SEAMQ = 20.6 + .5 * ss(0, 1, a); HEATQ = 0;
  L.draw(DMG.seams, Wt, O.seam); L.draw(DMG.plates, Wt, O.mc);
  for (let i = 0; i < DMG.gl.length; i += 2) { const g = DMG.gl[i], fl = .7 + .3 * Math.sin(i * 1.7 + u * 3.1); apX(Wt, g[0], g[1], g[2], PWa); K.glowW(PWa[0], PWa[1], PWa[2], 9, [255, 140, 70], .3 * fl * a); }
  for (let i = 0; i < DMG.ends.length; i++) { const e = DMG.ends[i], pf = { R: Wt.R, T: Wt.T }; sparks(pf, e, [(i % 2 ? -1 : 1) * .3, .2, .4], 26, .6, .6, 2.4, 1.1 + .2 * i, u * 1.0, .9 * a, 17 + i, i % 2 ? SPW : SPC); }
  // the bed, the static machines
  HEATQ = 0;
  L.draw(B_.bed, BWX, O.mcd); L.draw(B_.mould, BWX, O.mc); L.draw(B_.press, BWX, O.mc); L.draw(B_.furn, BWX, O.mc);
  L.draw(B_.forgeRail, BWX, O.mcd); L.draw(B_.lathe, BWX, O.mc); L.draw(B_.rails, BWX, O.mc);
  // the walking beams: up, across one station, down and back during a step
  for (const [a0, a1] of IDX) if (u > a0 - .2 && u < a1 + .6) { const w = (u - a0) / (a1 - a0), up = Math.sin(PI * sat(w * 1.25 - .125)), dx = w < 1 ? 5.2 * kk(w, .2, .8) : 5.2 * (1 - kk(u, a1, a1 + .5)); L.draw(B_.walk, at(nx(), BWX, dx, YL - 1.55 + .7 * up, 0), O.mc); }
  // the furnace lid: open while the row steps
  let lid = 0; for (const [a0, a1] of IDX) lid = Math.max(lid, kk(u, a0 - .5, a0 - .05) * (1 - kk(u, a1 + .05, a1 + .5)));
  L.draw(B_.lid, at(nx(), BWX, XS[2] + 1.45, YL, 0, 2, -lid * 1.9), O.mc);
  const fh = 1.15 - .35 * lid;                                  // the furnace's heat (white-hot inside, falling as it opens)
  HEATQ = heatV(fh); L.draw(B_.lining, BWX, O.hot); HEATQ = 0;
  // the press platen: down onto its bar, dwell, up (between the steps)
  const pc = u < IDX[0][0] ? kk(u, -.6, .1) * (1 - kk(u, .1, .4)) : u < IDX[1][0] ? kk(u, 2.4, 3.4) * (1 - kk(u, 5.2, 6.3)) : kk(u, 8.6, 9.6);
  L.draw(B_.platen, at(nx(), BWX, XS[1], YL + .22 + 2.4 * (1 - pc), ZL), O.mc);
  // the bars (and the round): state by station
  const st = steps(u);
  for (let b = -2; b <= 4; b++) {
    if (b === 4 && u >= PET[0] - .3) continue;                  // (the round's code takes it over at the sabot)
    barPos(b, u, BP); const s = BP.s; if (s <= -.98) continue;
    const x = stX(s), y = YL + BP.lift, fa = sat(1 + s);        // (a new compact slides into the mould from the left)
    const bodyK = s < .5 ? B_.rC : s < 1.5 ? B_.rP : s < 2.5 ? B_.rS : s < 3.5 ? B_.rF : B_.rM;
    // heat: white-hot in the furnace, orange through the forge, dull red into the lathe
    let h = 0;
    if (s > 1.5 && s < 2.5) h = fh * (1 - .4 * Math.abs(s - 2));
    else if (s >= 2.5 && s < 3.5) h = .78 - .1 * (s - 3);
    else if (s >= 3.5 && s < 4.0) h = .3 * (4 - s) / .5;
    HEATQ = heatV(h);
    const Xb = Math.abs(s - 4) < .02 ? at(nx(), BWX, x, y, ZL, 2, u * 7.3) : at(nx(), BWX, x, y, ZL);   // (spinning in the lathe)
    const op = h > .05 ? O.hot : O.rod, a0 = op.a; op.a = a0 * fa;
    L.draw(bodyK, Xb, op); op.a = a0;
    if (h > .3) glowAlong(Xb, -8.6, 8.6, h, 26 + 20 * h, .16 * h * fa * a);
  }
  HEATQ = 0;
  // the forge head: travels along the bar while the row is still; four hammers beating
  { const fu = u < IDX[0][0] ? u + 3 : u < IDX[1][0] ? u - IDX[0][1] : u - IDX[1][1], zf = ZL - 8.2 + 16.4 * sat(fu / 4.3), still = u < IDX[0][0] - .1 || (u > IDX[0][1] + .2 && u < IDX[1][0] - .1) || u > IDX[1][1] + .2;
    const Xf = at(nx(), BWX, XS[3], YL, zf); L.draw(B_.forge, Xf, O.mc); L.draw(B_.forgeCar, at(nx(), BWX, XS[3], YL, zf), O.mc);
    const beat = still ? .5 + .5 * Math.sin(u * TAU * 4.2) : 0;
    for (let k = 0; k < 4; k++) { const t = k / 4 * TAU + PI / 4, c = Math.cos(t), s = Math.sin(t), rr = 1.25 + .5 * beat; const Xh = cmp(nx(), BWX, rot9(M9a, 2, t - PI / 2), XS[3] + c * rr, YL + s * rr, zf); L.draw(B_.hammer, Xh, O.hero); }
    if (still) { const pf = { R: BWX.R, T: BWX.T }; sparks(pf, [XS[3], YL, zf], [0, .5, 0], 34, .9, 1.2, 4.0, .45, u, .9 * a, 3, SPC); }
    if (still) { apX(BWX, XS[3], YL, zf, PWa); K.glowW(PWa[0], PWa[1], PWa[2], 70, [255, 150, 70], .22 * a); }
  }
  // the lathe: the chuck turning, the carriage cutting along the bar (sparks and chips off the tool)
  { const cu = u < IDX[0][0] ? u + 3 : u < IDX[1][0] ? u - IDX[0][1] : u - IDX[1][1], zc = ZL - 8.6 + 17 * sat(cu / 4.4), cut = u < IDX[0][0] - .1 || (u > IDX[0][1] + .2 && u < IDX[1][0] - .1) || u > IDX[1][1] + .2;
    L.draw(B_.chuck, at(nx(), BWX, XS[4], YL, ZL - 10.3, 2, u * 7.3), O.hero);
    L.draw(B_.carr, at(nx(), BWX, XS[4], YL, zc), O.mc);
    if (cut) { const pf = { R: BWX.R, T: BWX.T }; sparks(pf, [XS[4] - .2, YL, zc], [-.4, .6, .1], 30, .7, .8, 2.6, .5, u, .85 * a, 9, SPW); }
  }
  // the sabot: the petals fly in round the rod that has just arrived; then the round
  roundAt(u, RC);
  const Xr = at(nx(), BWX, RC[0], RC[1], RC[2]);
  const fade = 1 - ss(SEAT, SEAT + .5, u);
  if (u > PET[0] - .3 && u < PET[1] + .25) {
    const t = kk(u, PET[0], PET[1]);
    for (let k = 0; k < 3; k++) { const am = (k + .5) / 3 * TAU, d = 2.6 * (1 - t) * (1 - t); L.draw(B_.pet[k], at(nx(), Xr, Math.cos(am) * d, Math.sin(am) * d, 0), O.sab); }
    L.draw(B_.armat, at(nx(), Xr, 0, 0, -2.0 * (1 - t)), O.sab);
    HEATQ = 0; L.draw(B_.rM, Xr, O.rod);
  } else if (u >= PET[1] + .25 && fade > .01) {
    // the round (the platform's own bodies: the same as the one it will become in the chamber)
    const oo = O.sab, a0 = oo.a; oo.a = a0 * fade;
    if (P.sabot) L.draw(P.sabot, Xr, oo); if (P.rodBody) L.draw(P.rodBody, Xr, oo);
    oo.a = a0;
  }
  // the arm: base, turret, links and the gripper bar (jaws closing on the round)
  armTip(u, TIP); armPose(TIP);
  { const b = ARM.b;
    L.draw(B_.aBase, at(nx(), BWX, b[0], b[1], b[2]), O.arm);
    L.draw(B_.aTur, at(nx(), BWX, b[0], b[1], b[2], 1, AP.yaw), O.arm);
    const sy = Math.sin(AP.yaw), cy = Math.cos(AP.yaw), side = [cy, 0, -sy];
    L.draw(B_.aL1, segX(nx(), AP.sh, AP.el, side), O.arm);
    L.draw(B_.aL2, segX(nx(), AP.el, AP.wr, side), O.arm);
    // (the tool frame: +z down the tool, its x along the bay's z: the bar lies along the round)
    const Xg = cmp(nx(), BWX, look9(M9L, [0, -1, 0], [1, 0, 0]), AP.wr[0], AP.wr[1], AP.wr[2]);
    L.draw(B_.grip, Xg, O.arm);
    if (jawAt(u) > .02) { apX(BWX, RC[0], RC[1] + RND_R + .5, RC[2], PWa); K.glowW(PWa[0], PWa[1], PWa[2], 10, CORAL, .25 * jawAt(u) * a); }
  }
  // the ram: behind the line's end on the bore line, its stages run out after the round's tail
  { const zb = ZL - 13.5;
    L.draw(B_.ramBase, at(nx(), BWX, 0, 0, zb), O.mc);
    const rear = RC[2] - RND_L / 2 - ARM_L, ext = u < RAM[0] - .4 ? 0 : Math.max(0, rear - zb) * kk(u, RAM[0] - .4, RAM[0]) * (1 - kk(u, SEAT + .2, LEN + .8));
    if (ext > .05) {
      const n = Math.max(1, Math.ceil(ext / 12.0));
      for (let i = 0; i < Math.min(3, n) || i < n; i++) { const z0 = zb + ext - (i + 1) * 12.4; if (z0 < zb - 12.4) break; L.draw(B_.ram[Math.max(0, 2 - i)], at(nx(), BWX, 0, 0, z0), O.mc); }
      L.draw(B_.ramHead, at(nx(), BWX, 0, 0, zb + ext), O.mc);
    }
  }
}

/* ---------------- the lens (platform frame): over the line, then after the round to the chamber ---------------- */
/* (from above the bay and a little to port: the world's up is the platform's aft here, so with no roll the bars stand
   upright on screen, the stations run left to right and the round runs down the screen into the chamber) */
const CK = [
  [0, [-22, 31, -95], [-9, -14, -88], 42],
  [3.4, [-18, 35, -92], [-4, -11, -85], 42],
  [6.4, [-21, 48, -84], [-1, -6, -72], 42],
  [10, [-26, 64, -56], [0, -2, -36], 44],
];
function cam(u) {
  u = E.clamp(u, 0, LEN);
  let i = 0; while (i < CK.length - 2 && CK[i + 1][0] <= u) i++;
  const [u0, e0, g0, f0] = CK[i], [u1, e1, g1, f1] = CK[i + 1], w = E.inOut(sat((u - u0) / (u1 - u0)));
  // (a gentle ease per leg, the legs' ends continuous: a Catmull-Rom would overshoot the wall)
  const lerp = (p, q) => [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w];
  return { e: lerp(e0, e1), g: lerp(g0, g1), fov: f0 + (f1 - f0) * w };
}

/* ---------------- readout, tags, cues ---------------- */
function readout(u) {
  if (u < 3.6) return ['Rod line · <b>tungsten</b> · six stations', 'Pressed · sintered at <b>2 600 K</b> · forged · turned'];
  if (u < 6.6) return [`Round · <b>${MASS.toFixed(1)} t</b> · ${RND_L} m in its sabot`, 'Handling arm · <b>lifting</b> to the bore line'];
  return [`Round · <b>to the chamber</b> · ${Math.round(ZCH - ZL)} m`, 'Breech <b>open</b> · next rod <b>into the petals</b>'];
}
const win = (u, a, b) => ss(a, a + .5, u) * (1 - ss(b - .5, b, u));
function tags(u, Wt, put) {
  const M = Wt.R, bw = p => [M[0] * p[0] + M[1] * p[1] + M[2] * (p[2] + BZ) + Wt.T[0], M[3] * p[0] + M[4] * p[1] + M[5] * (p[2] + BZ) + Wt.T[1], M[6] * p[0] + M[7] * p[1] + M[8] * (p[2] + BZ) + Wt.T[2]];
  put('fline', 'LINE', 'Rod line · tungsten', 'six stations', bw([XS[2], YL + 1.6, ZL + 6]), win(u, .7, 4.4), -1);
  put('fdmg', 'DECK', 'Deck torn · seams hot', 'the intercept', bw([-4, -21.8, -18]), win(u, 1.1, 4.6), 1);
  roundAt(u, RC);
  put('farm', 'ARM', 'Handling arm · round', `${MASS.toFixed(1)} t · ${RND_L} m`, bw([RC[0], RC[1] + RND_R, RC[2] + 4]), win(u, 4.0, 7.6), 1);
}
function poi(u, PW) { roundAt(u, RC); return [{ name: 'rod line', p: PW([-13, YL, ZL + BZ]), r: 16 }, { name: 'round', p: PW([RC[0], RC[1], RC[2] + BZ]), r: 11 }]; }
const cues = [['rod_lift', LIFT[0]], ['rod_load', RAM[0]]];

window.STRIKE_FAB = { len: LEN, draw, cam, readout, tags, poi, cues, SEAT, RATE, build };
})();
