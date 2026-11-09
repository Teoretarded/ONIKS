/* ORBITAL · RAILGUN insert: the fabrication bay (window.ORFAB; the contract is in pc_orbital_railgun_film.js,
   "inserted sequences"). The platform makes its one round on board, and the bay's back half is the platform's mind.
   One continuous take through a 70 m bay, microgravity throughout (augers and pushers move the powder, chips and
   sparks fly straight into the extraction hoods).
     The round line (port side, the bar lying across the line, +Z of the rod frame = its nose): the core's powder dosed
     and cold-isostatically pressed (a wire-wound vessel in a pit), hydrogen-sintered (a clamshell furnace), radially
     forged, turned and ground, the ogive and the fin slots milled; the casing's five sections faced, slid over the
     core and orbit-welded joint by joint; the fill mixed in three vessels and poured through the casing's ports (a
     closed casing: only its level is shown, in X-ray), cured in a split oven; the round carried to the lift station
     and inspected (an X-ray ring along it, then a scan back).
     Then the camera turns to the back of the bay: the chip fab (wafers, an EUV scanner and its light path, etch and
     deposition, dicing, bonding) that makes the processors of the platform's AI, and the data hall they run in (four
     rows of racks, contained cold aisles, fibre trunks, the cooling plant). Then back to the round: the travelling
     column lifts it, turns it once round (the turntable) onto the bore's axis, the sabot's petals close round it, the
     armature behind, and it slides out through the port to the chamber.
   Clocks: u (s into the insert, the film's); a, the round line's (a monotone warp of u through the beats' ends); the
   chip fab's own (it works while the camera is there); and the readout's fabrication clock (hours before the shot,
   its rate the time compression on screen). Lighting: the station on screen keyed (from the camera's side) and its
   lamp lit, the rest of the hall dimmed. Frames: the bay (metres): +Z down the hall, +Y up off the deck, +X starboard;
   origin on the deck at the hall's centre line by the entrance. World = BAY(Tb) (from the film, when it gives one) ∘
   bay. Render is a pure function of u. ?fcam=ex,ey,ez,tx,ty,tz,fov sets a debug camera (bay), ?fabL=17 a core length. */
(function () {
'use strict';
const { V, R, X, E, rng } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const ss = E.ss, sat = E.sat, mix = E.mix;
const kk = (u, a, b) => E.inOut(sat((u - a) / (b - a)));
const lin = (u, a, b) => sat((u - a) / (b - a));
const hh = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const QS = new URLSearchParams(location.search);

/* ---------------- time ----------------
   Two clocks: u (s into the insert, the film's) and a, the machines' clock (0..70: every station's motion is written
   in a). The beats below hold the camera on each station for several seconds while it works and give the moves
   between stations their own slow seconds; a(u) is a monotone cubic through the beats' ends (rates ease, no jumps).
   [id, duration (u), a at its end]; ids starting with m are the camera's moves. */
/* Round 3: fewer, longer holds; the stations between them (dosing, turning) work while the camera follows the round;
   the reveal (AI*) holds the round line still while the chip fab and the hall work on their own clock */
const BEATS = [
  ['IN', 7.5, 2.2], ['mIN', 3.6, 6.0], ['R2', 7.0, 9.9], ['m23', 3.0, 11.0], ['R3', 6.0, 13.1], ['m34', 3.0, 14.05],
  ['R4', 6.5, 16.9], ['m46', 4.6, 20.7], ['R6', 6.5, 23.47], ['m67', 3.0, 24.45], ['R7', 8.0, 27.15], ['m78', 3.0, 28.0],
  ['R8', 9.0, 30.7], ['mMT', 6.5, 58.0], ['MT', 8.0, 63.7],
  ['mAI', 8.0, 63.75], ['AI1', 8.5, 63.8], ['mAI2', 6.0, 63.83], ['AI2', 8.0, 63.86], ['mAI3', 4.0, 63.88], ['AI3a', 4.5, 63.9], ['mAI3b', 2.0, 63.91],
  ['AI3b', 6.0, 63.93], ['mAI4', 4.5, 63.95], ['AI4', 9.0, 64.0], ['mTR', 8.0, 64.3],
  ['TRb', 9.0, 65.8], ['TRc', 3.2, 66.8], ['TRd', 6.0, 70.0],
];
const BW_ = {}, KU = [0], KA = [0];
{ let u = 0; for (const [id, d, a1] of BEATS) { BW_[id] = [u, u + d]; u += d; KU.push(u); KA.push(a1); } }
const LEN = KU[KU.length - 1];
/* the monotone cubic (Fritsch-Carlson) through (KU, KA) */
const KM = (() => {
  const n = KU.length, dl = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) dl.push((KA[i + 1] - KA[i]) / (KU[i + 1] - KU[i]));
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : 3 * (KU[i + 1] - KU[i - 1]) / ((2 * KU[i + 1] - KU[i] - KU[i - 1]) / dl[i - 1] + (KU[i + 1] + KU[i] - 2 * KU[i - 1]) / dl[i]);
  return m;
})();
const kseg = (U, u) => { let lo = 0, hi = U.length - 2; while (lo < hi) { const md = (lo + hi + 1) >> 1; if (U[md] <= u) lo = md; else hi = md - 1; } return lo; };
function warp(u) {
  if (u <= 0) return KA[0] + KM[0] * u; if (u >= LEN) return KA[KA.length - 1] + KM[KM.length - 1] * (u - LEN);
  const i = kseg(KU, u), h = KU[i + 1] - KU[i], t = (u - KU[i]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * KA[i] + (t3 - 2 * t2 + t) * h * KM[i] + (-2 * t3 + 3 * t2) * KA[i + 1] + (t3 - t2) * h * KM[i + 1];
}
const wrate = u => (warp(u + .02) - warp(u - .02)) / .04;
/* u at the machines' time a (bisection: a(u) is monotone) */
function unwarp(a) {
  if (a <= 0) return 0; if (a >= KA[KA.length - 1]) return LEN;
  const i = kseg(KA, a); let lo = KU[i], hi = KU[i + 1];
  for (let k = 0; k < 40; k++) { const md = (lo + hi) / 2; if (warp(md) < a) lo = md; else hi = md; }
  return (lo + hi) / 2;
}
const WIN = BW_;
/* the station working on screen in each beat (a move shows the station the part is passing) */
const BST = { IN: 'IN', mIN: 'R1', R2: 'R2', m23: 'R3', R3: 'R3', m34: 'R4', R4: 'R4', m46: 'R5', R6: 'R6', m67: 'R7', R7: 'R7', m78: 'R8',
  R8: 'R8', mMT: 'MT', MT: 'MT', mAI: 'AI', AI1: 'AI', mAI2: 'C2', AI2: 'C2', mAI3: 'C34', AI3a: 'C5', mAI3b: 'C6', AI3b: 'C6', mAI4: 'AI', AI4: 'AI',
  mTR: 'TR', TRb: 'TR', TRc: 'TR', TRd: 'TR' };
const beatAt = u => { for (const [id] of BEATS) if (u < BW_[id][1]) return id; return 'TRd'; };
const stationAt = u => { const b = beatAt(u); if (b === 'mIN' && warp(u) < 3.0) return 'IN'; return BST[b]; };
let U_ = 0, A_ = 0;                                             // this frame's u and a

/* ---------------- the bay ---------------- */
/* the hall: the platform's bay interior (BAY_HALF 28 x 22 x 36) seen from its front wall: this frame is the bay's turned
   half round (bay x = -2 - x, bay y = y - 22, bay z = 26 - z), so the front wall with the port to the chamber is z -10 */
const HALL = { x0: -30, x1: 26, y1: 44, z0: -10, z1: 62 };
const LOC = { R: [-1, 0, 0, 0, 1, 0, 0, 0, -1], T: [-2, -22, 26] };     // this frame -> the bay's (BAY)
const PORT = [-2, 22, -10], PORT_R = 2.3;
const XR = -11, YR = 1.5;                                  // the rod line: the bar's axis (across the line) and height
const ZR = { R1: 3.6, R2: 8, R3: 15, R4: 23, R5: 31, R6: 38.5, R7: 45.5, R8: 52.5, MT: -5 };
const XV = -12;                                          // the isostatic press's axis (vertical, in its pit)
const XF = -12.5;                                          // the forge's hammer plane
const XC = 7.5;                                            // the capsule line
const ZC = { C1: 54, C2: 44.5, C3: 35.6, C4: 31.4, C5: 27, C6: 22.5, C7: 18, C8: 13.5, C9: 9, C10: 4.5 };
const YG = 14;                                             // the transfer gantry's rails

/* ---------------- in-place rigid transforms ---------------- */
const mkX = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] });
const M9a = [1, 0, 0, 0, 1, 0, 0, 0, 1], M9b = M9a.slice(), M9c = M9a.slice();
function rot9(o, ax, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (ax === 0) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = c; o[5] = -s; o[6] = 0; o[7] = s; o[8] = c; }
  else if (ax === 1) { o[0] = c; o[1] = 0; o[2] = s; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = -s; o[7] = 0; o[8] = c; }
  else if (ax === 2) { o[0] = c; o[1] = -s; o[2] = 0; o[3] = s; o[4] = c; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; }
  else { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; }
  return o;
}
function mul9(o, A, B) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; }
/* rotation whose +Z is f and +Y as near u as possible (R.look's layout) */
function look9(o, fx, fy, fz, ux, uy, uz) {
  let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
  let xx = uy * fz - uz * fy, xy = uz * fx - ux * fz, xz = ux * fy - uy * fx; l = Math.hypot(xx, xy, xz);
  if (l < 1e-6) { xx = 0; xy = fz; xz = -fy; l = Math.hypot(xx, xy, xz) || 1; }
  xx /= l; xy /= l; xz /= l;
  const yx = fy * xz - fz * xy, yy = fz * xx - fx * xz, yz = fx * xy - fy * xx;
  o[0] = xx; o[1] = yx; o[2] = fx; o[3] = xy; o[4] = yy; o[5] = fy; o[6] = xz; o[7] = yz; o[8] = fz; return o;
}
/* o = P ∘ (translate t, then rotate Rl): o.R = P.R Rl, o.T = P.R t + P.T (o must not be P) */
function cmp(o, P, Rl, tx, ty, tz) {
  const M = P.R, r = o.R;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = M[i * 3] * Rl[j] + M[i * 3 + 1] * Rl[3 + j] + M[i * 3 + 2] * Rl[6 + j];
  o.T[0] = M[0] * tx + M[1] * ty + M[2] * tz + P.T[0]; o.T[1] = M[3] * tx + M[4] * ty + M[5] * tz + P.T[1]; o.T[2] = M[6] * tx + M[7] * ty + M[8] * tz + P.T[2];
  return o;
}
const at = (o, P, tx, ty, tz, ax, a) => cmp(o, P, rot9(M9a, ax === undefined ? -1 : ax, a || 0), tx, ty, tz);
const at2 = (o, P, tx, ty, tz, ax1, a1, ax2, a2) => cmp(o, P, mul9(M9c, rot9(M9a, ax1, a1), rot9(M9b, ax2, a2)), tx, ty, tz);
const atL = (o, P, tx, ty, tz, fx, fy, fz, ux, uy, uz) => cmp(o, P, look9(M9a, fx, fy, fz, ux, uy, uz), tx, ty, tz);
const apX = (P, x, y, z, o) => { const M = P.R; o[0] = M[0] * x + M[1] * y + M[2] * z + P.T[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + P.T[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + P.T[2]; return o; };
const dirX = (P, x, y, z, o) => { const M = P.R; o[0] = M[0] * x + M[1] * y + M[2] * z; o[1] = M[3] * x + M[4] * y + M[5] * z; o[2] = M[6] * x + M[7] * y + M[8] * z; return o; };

/* ---------------- state ---------------- */
let K = null, L = null, Body = null, CTX = null, P_ = null;
const BWX = mkX();                                           // bay -> world
const LB = V.norm([.32, 1, -.42]), LW = [0, 1, 0];           // the bay's key light (bay, world)
const LIME = [198, 244, 50], HOT = [248, 255, 232], WH = [238, 238, 228];
const XA = [1, 0, 0], YA = [0, 1, 0], ZA = [0, 0, 1];
/* the round (from the film's CTX.ROUND at build, else a 17 m core in a 20.5 m sabot): a long tungsten core, a
   segmented casing round it with its fill, fins, the sabot's petals and the armature */
let RL = 17, RR = .32, RNDL = 20.5, RNDR = 1.1;
const NPET = 3;
let SABL = 8.4, SABR = .96, ARML = .9;
const D = {};
function dims(P, RO) {
  const fl = parseFloat(QS.get('fabL'));
  if (fl > 0) { RL = fl; RR = fl / 53; }
  else if (RO && RO.rodLen) { RL = RO.rodLen; RR = RO.rodR; }
  else if (P && P.ROD_L && P.ROD_L > 10) { RL = P.ROD_L; RR = P.ROD_R; }
  RNDL = RO && RO.len > RL ? RO.len : RL * 1.2; RNDR = RO && RO.r ? RO.r : Math.max(.96, RR * 3.4);
  SABL = RNDL; SABR = RNDR; ARML = RO && RO.armature ? RO.armature : 1.2;
  D.M = 19.25 * PI * RR * RR * RL;                           // t (tungsten, 19.25 t/m3)
  D.Lb = 1.137 * RL; D.rb = 1.48 * RR;                       // the loose powder in its mould (45 % dense)
  D.Lg = 1.006 * RL; D.rg = 1.312 * RR;                      // the pressed compact (65 %)
  D.Ls = .889 * RL; D.rs = 1.16 * RR;                        // sintered (94 %)
  D.rf = 1.04 * RR; D.LT = RL / 9;                           // forged; the tail left unforged (gripped)
  D.Lf = (D.Ls - D.LT) * (D.rs / D.rf) * (D.rs / D.rf) * .945; // the forged length (the tail aside)
  D.crop = D.LT + D.Lf - RL;                                 // turned off the nose end at R5
  D.LN = Math.min(.156 * RL, 7 * RR);                        // the ogive
  D.rc = .16; D.Lc = .5;                                     // (the AI module's size: the bonder's board)
  D.rbore = .1; D.dbore = .1;
  D.rcore = .87 * RR;                                        // the tail between the fins
  D.rcas = Math.min(1.75 * RR, RNDR * .72);                  // the casing (its sections slid over the core)
  D.zc0 = -RL / 2 + D.LT + .25; D.zc1 = RL / 2 - D.LN - .15; D.NSEC = 5;
  D.secL = (D.zc1 - D.zc0) / D.NSEC;
  D.Mc = D.M + 7.8 * PI * (D.rcas * D.rcas - (D.rcas - .03) ** 2) * (D.zc1 - D.zc0) + 1.7 * PI * ((D.rcas - .03) ** 2 - RR * RR) * (D.zc1 - D.zc0);
  D.mass = m => `${m.toFixed(1)} T`;
}

/* ---------------- building ---------------- */
const OPT = o => Object.assign({ L: LW, a: 1, pxf: 1, occ: true, fx: null }, o);
const O = {
  hall: OPT({ a: .55, pxf: 1.5 }), hallL: OPT({ a: .9 }), mc: OPT({ a: .92, pxf: 1.1 }), mcd: OPT({ a: .6, pxf: 1.4 }), st: OPT({ a: .8, pxf: 2.0 }),
  mcx: OPT({ a: .55, keep: .45, pxf: 1.3 }), hero: OPT({ a: 1.25, pxf: .8 }), heroD: OPT({ a: .95, pxf: .88 }),
  pow: OPT({ a: .78, pxf: .62, col: [226, 222, 206] }), hot: OPT({ a: 1.4, pxf: .7, col: [255, 214, 160] }),
  glass: OPT({ a: .5, pxf: 1.3, keep: .7 }), hot3: OPT({ a: .6, pxf: 1.2, col: [255, 160, 80] }), lime: OPT({ a: 1, lime: 1, pxf: .9 }),
  hot2: OPT({ a: 1.4, pxf: .8, col: [255, 200, 140] }), forg: OPT({ a: .8, pxf: 1.0, col: [212, 208, 198] }),
  heroG: OPT({ a: 1.3, pxf: .78 }), xrod: OPT({ a: .95, pxf: .9 }), xbay: OPT({ a: 1.2, pxf: .8 }), capx: OPT({ a: 1.25, pxf: .8 }), coat: OPT({ a: .95, pxf: .62, col: [224, 226, 212] }), wrap: OPT({ a: 1, pxf: .8 }), pet: OPT({ a: 1.0, pxf: 1.25 }), fillo: OPT({ a: .9, pxf: .8, col: [215, 212, 196] }),
};
const allO = () => Object.values(O);
let FXF = null;
const OA_X = .95;
/* a body; its lattice cells scaled by k (machines are seen from a metre or two: finer cells there, the lattice's LOD
   coarsens them with distance) */
const CELLK = .3;
const mkB = (name, fn, k) => {
  const B = new Body(name); k = k === undefined ? CELLK : k;
  if (k !== 1) {
    const p0 = B.panel.bind(B), l0 = B.lathe.bind(B), sc = c => c <= .015 ? c : Math.max(.012, c * k);
    B.panel = (o, u, v, cell, opt) => p0(o, u, v, Array.isArray(cell) ? cell.map(sc) : sc(cell), opt);
    B.lathe = (a, d, st, opt) => l0(a, d, st, Object.assign({}, opt || {}, { cell: sc((opt && opt.cell) || .3) }));
  }
  fn(B); B.done(); return B;
};
const sphere = (B, c, r, o) => { const st = []; for (let k = 0; k <= 12; k++) { const p = k / 12 * PI; st.push([r * (1 - Math.cos(p)), r * Math.sin(p) + 1e-4]); } return B.lathe([c[0], c[1] - r, c[2]], YA, st, o); };
const bx = (B, x0, y0, z0, x1, y1, z1, cell, o) => {
  B.box([x0, y0, z0], [x1, y1, z1], cell || .08, Object.assign({ br: .85, edge: .7 }, o || {}));
  if (o && o.occ) OCCS.push({ mn: [x0 + .03, y0 + .03, z0 + .03], mx: [x1 - .03, y1 - .03, z1 - .03], g: o.occ });
  if (!(o && o.plain)) detailBox(B, [x0, y0, z0], [x1, y1, z1]);
};
/* a machine box's skin: panel joints, bolts at the panels' corners, here a louvred panel, there an access panel with a
   handle, a rating plate; a second line inset along the vertical edges (the chamfer) */
function detailBox(B, mn, mx, faces) {
  const sx = mx[0] - mn[0], sy = mx[1] - mn[1], sz = mx[2] - mn[2];
  if (Math.max(sx, sy, sz) < .3 || Math.min(sx, sy, sz) < .05) return;
  const h0 = hh(mn[0] * 3.1 + mn[2] * 1.7, mx[1] * 2.3 + mx[0] * .7);
  for (const f of faces || ['x-', 'x+', 'z-', 'z+', 'y+']) {
    const F = faceF(mn, mx, f); if (F.Lu < .25 || F.Lv < .2) continue;
    const nu = Math.max(1, Math.round(F.Lu / .75)), nv = f === 'y+' ? Math.max(1, Math.round(F.Lv / .75)) : Math.max(1, Math.round(F.Lv / .85)), du = F.Lu / nu, dv = F.Lv / nv;
    for (let i = 1; i < nu; i++) B.line(fpm(F, i * du, 0), fpm(F, i * du, F.Lv), .3);
    for (let j = 1; j < nv; j++) B.line(fpm(F, 0, j * dv), fpm(F, F.Lu, j * dv), .26);
    const bo = Math.min(.04, du * .12, dv * .12);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const s0 = i * du, s1 = s0 + du, t0 = j * dv, t1 = t0 + dv, r = hh(i * 7.1 + h0 * 13 + f.charCodeAt(1), j * 3.3 + f.charCodeAt(0) * .1);
      if (du > .18 && dv > .18) for (const [s, t] of [[s0 + bo, t0 + bo], [s1 - bo, t0 + bo], [s1 - bo, t1 - bo], [s0 + bo, t1 - bo]]) B.knot(fpm(F, s, t, .004), .012, .55);
      if (f === 'y+' || du < .3 || dv < .3) continue;
      if (r < .28) { const n = Math.min(9, Math.floor(dv * .45 / .035)); for (let k = 0; k < n; k++) { const t = t0 + dv * .12 + k * .035; B.line(fpm(F, s0 + du * .2, t), fpm(F, s1 - du * .2, t), .3); } }
      else if (r < .52) { frm(B, F, s0 + .06, t0 + .06, s1 - .06, t1 - .06, .3); B.line(fpm(F, s1 - .12, t0 + dv * .42, .02), fpm(F, s1 - .12, t0 + dv * .58, .02), .7); }
      else if (r < .62) { frm(B, F, s0 + du * .2, t1 - dv * .32, s0 + du * .62, t1 - dv * .14, .45); B.line(fpm(F, s0 + du * .25, t1 - dv * .2), fpm(F, s0 + du * .55, t1 - dv * .2), .3); B.line(fpm(F, s0 + du * .25, t1 - dv * .26), fpm(F, s0 + du * .48, t1 - dv * .26), .3); }
      else if (r < .68 && dv > .5) { const p = fpm(F, s0 + du * .5, t0 + dv * .5, .01), [U, W] = perp(F.n); B.ringP(p, U, W, Math.min(.07, du * .15), .55); B.ringP(p, U, W, Math.min(.045, du * .1), .35); }
    }
  }
  for (const [x, z] of [[mn[0], mn[2]], [mx[0], mn[2]], [mx[0], mx[2]], [mn[0], mx[2]]]) { const ix = x === mn[0] ? .025 : -.025, iz = z === mn[2] ? .025 : -.025; if (sy > .3) B.line([x + ix, mn[1] + .02, z], [x + ix, mx[1] - .02, z], .3); if (sy > .3) B.line([x, mn[1] + .02, z + iz], [x, mx[1] - .02, z + iz], .3); }
}
/* solid boxes: occluders (bay) registered each frame near the camera; g names a group that can be X-rayed off */
const OCCS = [], OCC_OFF = {};
/* facet panels of a shell about the x axis (centre y, z; radius r; angles a0..a1 in the y-z plane from +y toward +z) */
function shellX(B, x0, x1, cy, cz, r, a0, a1, nf, o) {
  for (let k = 0; k < nf; k++) {
    const t0 = a0 + (a1 - a0) * k / nf, t1 = a0 + (a1 - a0) * (k + 1) / nf, tm = (t0 + t1) / 2;
    const p0 = [x0, cy + r * Math.cos(t0), cz + r * Math.sin(t0)], p1 = [x0, cy + r * Math.cos(t1), cz + r * Math.sin(t1)];
    B.panel(p0, [x1 - x0, 0, 0], V.sub(p1, p0), o.cell || .1, Object.assign({ n: [0, Math.cos(tm), Math.sin(tm)], edge: false }, o));
  }
}
/* ======================== the machine kit: dense detail (bay frame, metres) ========================
   Every station is dressed from these: cabinets with doors, louvres, hinges, handles, screens, gauges and status
   lights; motors with fins, fan cowls and terminal boxes; pipes with flanges; hoses and cables with sag; cable trays;
   linear rails with bolts; structural frames; railings and ladders; extraction hoods with ducts; bolt circles. Moving
   parts are separate bodies (fans, flywheels, screws, rollers) or drawn per frame (needles, chains, screens). */
const nrm = V.norm, add = V.add, mul = V.mul, sub = V.sub;
const perp = d => { const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0], u = nrm(V.cross(a, d)); return [u, V.cross(d, u)]; };
/* a box face as a frame: corner o, edge vectors u (along x, or z for x faces), v (up, or z for the top), outward n */
function faceF(mn, mx, f) {
  const ax = { x: 0, y: 1, z: 2 }[f[0]], sg = f[1] === '+' ? 1 : -1, ua = ax === 0 ? 2 : 0, va = ax === 1 ? 2 : 1;
  const o = [mn[0], mn[1], mn[2]]; o[ax] = sg > 0 ? mx[ax] : mn[ax];
  const u = [0, 0, 0], v = [0, 0, 0], n = [0, 0, 0]; u[ua] = mx[ua] - mn[ua]; v[va] = mx[va] - mn[va]; n[ax] = sg;
  return { o, u, v, n, Lu: Math.abs(u[ua]), Lv: Math.abs(v[va]) };
}
/* a point on a face at (s, t) metres from its corner, e off the surface */
const fpm = (F, s, t, e) => { const a = s / F.Lu, b = t / F.Lv, k = e === undefined ? .006 : e; return [F.o[0] + F.u[0] * a + F.v[0] * b + F.n[0] * k, F.o[1] + F.u[1] * a + F.v[1] * b + F.n[1] * k, F.o[2] + F.u[2] * a + F.v[2] * b + F.n[2] * k]; };
function frm(B, F, s0, t0, s1, t1, br, e) { const a = fpm(F, s0, t0, e), b = fpm(F, s1, t0, e), c = fpm(F, s1, t1, e), d = fpm(F, s0, t1, e); B.line(a, b, br); B.line(b, c, br); B.line(c, d, br); B.line(d, a, br); }
/* status lights: ch 3, q = kind * 1000 + id: 5 steady, 6 blinking, 7 lit while station id (STN index) is on screen */
const STN = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'MT', 'C1', 'C2', 'C34', 'C5', 'C6', 'AI'];
const lightQ = (kind, st, k) => kind * 1000 + STN.indexOf(st) * 20 + (k || 0);
/* an equipment cabinet: doors (gaps, pressed panels, handles, hinges, louvres), a plinth, a light stack, optional
   screen [s0, t0, s1, t1] (m on the front face, returned as a frame for live drawing), gauges [[s, t, r]] */
const SCREENS = {}, GAUGES = {};
function cab(B, mn, mx, o) {
  o = o || {};
  B.chunk('cab');
  bx(B, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], o.cell || .07, { br: o.br || .55, edge: .78, occ: o.occ, plain: true });
  const F = faceF(mn, mx, o.front || 'z-'), nd = o.doors || Math.max(1, Math.round(F.Lu / .75)), w = F.Lu / nd, pl = o.plinth === false ? 0 : .1;
  if (pl) { B.line(fpm(F, 0, pl), fpm(F, F.Lu, pl), .55); for (let s = .15; s < F.Lu - .1; s += .3) B.line(fpm(F, s, .02), fpm(F, s + .12, .08), .25); }
  for (let k = 0; k < nd; k++) {
    const s0 = k * w + .012, s1 = (k + 1) * w - .012, t0 = pl + .012, t1 = F.Lv - .012;
    if (o.noDoors) break;
    frm(B, F, s0, t0, s1, t1, .5); frm(B, F, s0 + .05, t0 + .05, s1 - .05, t1 - .05, .22);
    const hs = k % 2 ? s0 + .07 : s1 - .07, hm = Math.min(t1 - .2, t0 + F.Lv * .5);
    B.line(fpm(F, hs, hm - .1, .03), fpm(F, hs, hm + .1, .03), .95); B.knot(fpm(F, hs, hm - .12, .02), .02, .8);
    for (const t of [t0 + .15, t1 - .15]) B.knot(fpm(F, k % 2 ? s1 - .015 : s0 + .015, t, .012), .03, .75);
    if (o.louvre !== false && t1 - t0 > .7) for (let j = 0; j < 7; j++) { const t = t0 + .1 + j * .035; B.line(fpm(F, s0 + .12, t), fpm(F, s1 - .12, t), .3); }
    B.line(fpm(F, s0 + .1, t1 - .12), fpm(F, s0 + .1 + Math.min(.25, (s1 - s0) * .4), t1 - .12), .4);         // a nameplate
    B.line(fpm(F, s0 + .1, t1 - .16), fpm(F, s0 + .1 + Math.min(.25, (s1 - s0) * .4), t1 - .16), .4);
  }
  if (o.screen) {
    const [s0, t0, s1, t1] = o.screen; frm(B, F, s0 - .02, t0 - .02, s1 + .02, t1 + .02, .9, .012);
    B.panel(fpm(F, s0, t0, .01), sub(fpm(F, s1, t0, .01), fpm(F, s0, t0, .01)), sub(fpm(F, s0, t1, .01), fpm(F, s0, t0, .01)), .02, { n: F.n, br: .1, edge: false });
    for (let k = 0; k < 5; k++) B.knot(fpm(F, s0 + (s1 - s0) * (k + .5) / 5, t0 - .07, .015), .022, .9);              // the keys under it
    if (o.id) SCREENS[o.id] = { o: fpm(F, s0, t0, .016), u: sub(fpm(F, s1, t0, .016), fpm(F, s0, t0, .016)), v: sub(fpm(F, s0, t1, .016), fpm(F, s0, t0, .016)) };
  }
  if (o.gauges) o.gauges.forEach(([s, t, r], k) => { const g = gauge(B, fpm(F, s, t, .012), F.n, r); if (o.id) GAUGES[o.id + k] = g; });
  if (o.estop) { const p = fpm(F, o.estop[0], o.estop[1], .02); const [U, W] = perp(F.n); B.ringP(p, U, W, .035, 1); B.ringP(p, U, W, .05, .6); }
  if (o.lights !== false) {                                    // the light stack on the top's front corner
    const top = [mx[0], mx[1], mx[2]], c = fpm(F, F.Lu - .12, F.Lv, 0); c[1] = top[1];
    B.cyl(c, [c[0], c[1] + .18, c[2]], .018, { cell: .01, br: .8 });
    for (let k = 0; k < 3; k++) B.knot([c[0], c[1] + .22 + k * .055, c[2]], .045, .9, 3, lightQ(k === 0 ? 7 : k === 1 ? 5 : 6, o.st || 'R1', k));
  }
  if (o.top !== false) {                                       // the roof: a fan grille or a cable gland plate
    const T = faceF(mn, mx, 'y+'), cx = T.Lu / 2, cz = T.Lv / 2;
    if (T.Lu > .5 && T.Lv > .4) { const p = fpm(T, cx, cz, .01), r = Math.min(T.Lu, T.Lv) * .28; B.ringP(p, XA, ZA, r, .55); for (let k = -2; k <= 2; k++) B.line(add(p, [k * r / 3, 0, -r * .9]), add(p, [k * r / 3, 0, r * .9]), .25); }
  }
  return F;
}
/* a round gauge: rim, ticks, a hub; the needle is drawn live (needle) */
function gauge(B, c, n, r) {
  const [U, W] = perp(n);
  B.ringP(c, U, W, r, .9); B.ringP(c, U, W, r * 1.12, .5);
  for (let k = 0; k <= 10; k++) { const a = -2.36 + k * 4.71 / 10, d = add(mul(U, Math.cos(a)), mul(W, Math.sin(a))); B.line(add(c, mul(d, r * .78)), add(c, mul(d, r * .92)), k % 5 ? .4 : .8); }
  B.knot(c, r * .15, .9);
  return { c, U, W, r };
}
function needle(g, v, a) {
  if (!g) return;
  const t = -2.36 + 4.71 * E.clamp(v, 0, 1), d = add(mul(g.U, Math.cos(t)), mul(g.W, Math.sin(t)));
  apX(BWX, g.c[0], g.c[1], g.c[2], PW); apX(BWX, g.c[0] + d[0] * g.r * .85, g.c[1] + d[1] * g.r * .85, g.c[2] + d[2] * g.r * .85, PW2);
  K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1, 2, v > .8 ? LIME : WH, a === undefined ? .9 : a);
}
/* a live trace on a cabinet's screen: f(s) -> 0..1 sampled over s 0..p (the sweep), a grid behind it */
function trace(id, f, p, a, col) {
  const S = SCREENS[id]; if (!S || a < .02) return;
  const at = (s, t, o) => apX(BWX, S.o[0] + S.u[0] * s + S.v[0] * t, S.o[1] + S.u[1] * s + S.v[1] * t, S.o[2] + S.u[2] * s + S.v[2] * t, o);
  for (let k = 1; k < 4; k++) { at(0, k / 4, PW); at(1, k / 4, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 5, 1, WH, .18 * a); }
  const n = 40, m = Math.max(1, Math.floor(n * E.clamp(p, 0, 1)));
  for (let k = 0; k < m; k++) { at(k / n, .08 + .84 * f(k / n), PW); at((k + 1) / n, .08 + .84 * f((k + 1) / n), PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1.5, 1, col || LIME, .9 * a); }
  at(m / n, .08 + .84 * f(m / n), PW); K.glowW(PW[0], PW[1], PW[2], 6, col || LIME, .5 * a);
}
/* an electric motor along a->b (b: the drive end): finned body, fan cowl, end bell, terminal box, feet, shaft */
function motor(B, a, b, r, o) {
  o = o || {};
  const d = nrm(sub(b, a)), L = V.dist(a, b), [U, W] = perp(d);
  B.chunk('mot');
  B.lathe(a, d, [[0, 0], [0, r * .9], [.05 * L, r], [.9 * L, r], [L, r * .82], [L, r * .3]], { cell: Math.max(.012, r / 5), br: .8, rings: true, rbr: .6 });
  for (let k = 0; k < 18; k++) { const t = k / 18 * TAU, p = add(mul(U, Math.cos(t) * r * 1.015), mul(W, Math.sin(t) * r * 1.015)); B.line(add(V.mad(a, d, .1 * L), p), add(V.mad(a, d, .86 * L), p), .42); }
  for (let k = 0; k < 4; k++) B.ringP(V.mad(a, d, (.02 + k * .012) * L), U, W, r * .97, .35);
  const up = o.up || YA, az = nrm(V.cross(d, up)), ay = V.cross(az, d), tb = add(V.mad(a, d, .55 * L), mul(ay, r * 1.12));
  B.obox(tb, d, ay, az, [Math.min(.2 * L, r * .7), r * .14, r * .5], Math.max(.01, r / 8), { br: .9, edge: .85 });
  B.line(add(tb, mul(ay, r * .14)), add(add(tb, mul(ay, r * .14)), mul(az, r * .9)), .5);
  B.cyl(b, V.mad(b, d, o.shaft || r * .9), r * .2, { cell: Math.max(.008, r / 12), br: .95 });
  if (o.feet) for (const f of [.2, .8]) { const p = add(V.mad(a, d, f * L), mul(ay, -r)); B.obox(add(p, mul(ay, -.02)), d, ay, az, [r * .25, .02, r * 1.05], .02, { br: .7, edge: .7 }); }
}
/* a pipe through points with flanges at its joints and ends */
function pipe(B, P, r, br, fl) {
  for (let i = 0; i < P.length - 1; i++) {
    B.tube(P[i], P[i + 1], r, br === undefined ? .6 : br);
    if (fl !== false) { const d = nrm(sub(P[i + 1], P[i])), [U, W] = perp(d); B.ringP(V.mad(P[i], d, r * 1.5), U, W, r * 1.7, .7); B.ringP(V.mad(P[i + 1], d, -r * 1.5), U, W, r * 1.7, .7); }
  }
}
/* a hose or cable hanging between points (catenary sag s, m) */
function hose(B, P, s, br) {
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], n = 10; let q = a;
    for (let k = 1; k <= n; k++) { const t = k / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - s * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]; B.line(q, p, br === undefined ? .5 : br); q = p; }
  }
}
/* a cable tray a->b (horizontal run): two side rails, rungs, and its cables */
function tray(B, a, b, w, n) {
  const d = nrm(sub(b, a)), sd = nrm(V.cross(YA, d)), h = w / 2, L = V.dist(a, b);
  for (const s of [-1, 1]) { const o = mul(sd, s * h); B.line(add(a, o), add(b, o), .55); B.line(add(add(a, o), [0, .06, 0]), add(add(b, o), [0, .06, 0]), .45); }
  for (let t = 0; t <= L; t += .3) { const p = V.mad(a, d, t); B.line(add(p, mul(sd, -h)), add(p, mul(sd, h)), .35); }
  for (let k = 0; k < (n || 4); k++) { const o = add(mul(sd, (k / ((n || 4) - 1) - .5) * w * .8), [0, .03, 0]); B.line(add(a, o), add(b, o), .3); }
}
/* a linear guide rail a->b: the rail's profile, its bolts */
function rail(B, a, b, w, br) {
  const d = nrm(sub(b, a)), sd = nrm(V.cross(YA, d)), h = (w || .04) / 2, L = V.dist(a, b);
  for (const s of [-1, 1]) B.line(add(a, mul(sd, s * h)), add(b, mul(sd, s * h)), br || .7);
  B.line(add(a, [0, .012, 0]), add(b, [0, .012, 0]), .5);
  for (let t = .05; t < L; t += .12) B.knot(add(V.mad(a, d, t), [0, .014, 0]), h * .5, .5);
}
/* a structural frame round a box: tubes on its 12 edges, x-braces on the sides listed */
function frameB(B, mn, mx, r, br, braces) {
  const C8 = [[mn[0], mn[1], mn[2]], [mx[0], mn[1], mn[2]], [mx[0], mx[1], mn[2]], [mn[0], mx[1], mn[2]], [mn[0], mn[1], mx[2]], [mx[0], mn[1], mx[2]], [mx[0], mx[1], mx[2]], [mn[0], mx[1], mx[2]]];
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) B.tube(C8[i], C8[j], r, br || .7);
  for (const f of braces || []) { const F = faceF(mn, mx, f); B.line(fpm(F, 0, 0, 0), fpm(F, F.Lu, F.Lv, 0), .35); B.line(fpm(F, F.Lu, 0, 0), fpm(F, 0, F.Lv, 0), .35); }
  for (const p of C8) B.knot(p, r * 2.2, .7);
}
/* a railing along points (posts every ~1.2 m, top and knee rails, a toe board) */
function railing(B, P, h) {
  h = h || 1.1;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = V.dist(a, b), n = Math.max(1, Math.round(L / 1.2));
    for (let k = 0; k <= n; k++) { const p = V.lerp(a, b, k / n); B.tube(p, [p[0], p[1] + h, p[2]], .025, .55); }
    B.tube([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], .025, .6); B.line([a[0], a[1] + h * .5, a[2]], [b[0], b[1] + h * .5, b[2]], .45);
    B.line([a[0], a[1] + .12, a[2]], [b[0], b[1] + .12, b[2]], .4);
  }
}
function ladder(B, a, b, w) {
  const d = nrm(sub(b, a)), sd = nrm(V.cross(d, Math.abs(d[1]) > .9 ? XA : YA)), L = V.dist(a, b);
  for (const s of [-1, 1]) B.tube(add(a, mul(sd, s * w / 2)), add(b, mul(sd, s * w / 2)), .02, .6);
  for (let t = .3; t < L; t += .3) { const p = V.mad(a, d, t); B.line(add(p, mul(sd, -w / 2)), add(p, mul(sd, w / 2)), .5); }
}
/* an extraction hood: its mouth (x0..x1, z0..z1 at y), a tapered skirt up to a round duct that runs up to the roof */
function hood(B, x0, x1, z0, z1, y, h, rd, top) {
  B.chunk('hood');
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, yt = y + h, s = rd * .9;
  const M = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], T = [[cx - s, yt, cz - s], [cx + s, yt, cz - s], [cx + s, yt, cz + s], [cx - s, yt, cz + s]];
  for (let k = 0; k < 4; k++) { const a = M[k], b = M[(k + 1) % 4], c = T[(k + 1) % 4], d = T[k]; B.panel(a, sub(b, a), sub(d, a), .12, { br: .38, edge: .7, two: true }); B.line(b, c, .6); }
  for (let k = 0; k < 4; k++) B.line(M[k], M[(k + 1) % 4], .9);
  for (let t = .25; t < 1; t += .25) for (let k = 0; k < 4; k++) B.line(V.lerp(M[k], T[k], t), V.lerp(M[(k + 1) % 4], T[(k + 1) % 4], t), .22);
  B.cyl([cx, yt, cz], [cx, top || yt + 3, cz], rd, { cell: .1, br: .5, rings: false, seams: 8, sbr: .3 });
  for (let yy = yt + .6; yy < (top || yt + 3); yy += 1.2) B.ringP([cx, yy, cz], XA, ZA, rd * 1.06, .6);
  // the grille across the mouth
  for (let x = x0 + .15; x < x1; x += .15) B.line([x, y + .01, z0], [x, y + .01, z1], .18);
}
/* a clean-room cell over a bench: corner posts, a filter unit on the roof (grille, two fans), glass sides with
   mullions and a rail, the open side's door raised (its guides, a handle), a light bar, a signal tower */
function cell(B, x0, x1, z0, z1, y0, y1, open, st) {
  B.chunk('cell');
  const C4 = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (const [x, z] of C4) B.tube([x, y0, z], [x, y1, z], .025, .7);
  for (let k = 0; k < 4; k++) { const [xa, za] = C4[k], [xb, zb] = C4[(k + 1) % 4]; B.tube([xa, y1, za], [xb, y1, zb], .025, .7); B.line([xa, y0 + .02, za], [xb, y0 + .02, zb], .5); }
  B.panel([x0, y1 + .12, z0], [0, 0, z1 - z0], [x1 - x0, 0, 0], .08, { n: YA, br: .22, edge: .7 });
  for (const [x, z] of C4) B.line([x, y1, z], [x, y1 + .12, z], .6);
  for (let x = x0 + .1; x < x1 - .05; x += .1) B.line([x, y1 + .005, z0 + .1], [x, y1 + .005, z1 - .1], .14);
  for (const f of [.3, .7]) B.ringP([x0 + (x1 - x0) * f, y1 + .125, (z0 + z1) / 2], XA, ZA, Math.min(.28, (z1 - z0) * .25), .5);
  const faces = { 'x-': [[x0, z1], [x0, z0]], 'x+': [[x1, z0], [x1, z1]], 'z-': [[x0, z0], [x1, z0]], 'z+': [[x1, z1], [x0, z1]] };
  for (const f in faces) {
    const [[xa, za], [xb, zb]] = faces[f], u = [xb - xa, 0, zb - za], L_ = Math.hypot(u[0], u[2]), n = { 'x-': [-1, 0, 0], 'x+': XA, 'z-': [0, 0, -1], 'z+': ZA }[f];
    if (f === open) {
      B.panel([xa, y1 - .32, za], u, [0, .3, 0], .06, { n, br: .12, edge: .8, two: true });
      B.line([xa + u[0] * .4, y1 - .3, za + u[2] * .4], [xa + u[0] * .6, y1 - .3, za + u[2] * .6], .9);
      for (const t of [0, 1]) B.line([xa + u[0] * t, y0, za + u[2] * t], [xa + u[0] * t, y1, za + u[2] * t], .8);
      continue;
    }
    B.panel([xa, y0, za], u, [0, y1 - y0, 0], .12, { n, br: .05, edge: .6, two: true });
    const m = Math.max(1, Math.round(L_ / .9));
    for (let k = 1; k < m; k++) B.line([xa + u[0] * k / m, y0, za + u[2] * k / m], [xa + u[0] * k / m, y1, za + u[2] * k / m], .45);
    B.line([xa, y0 + (y1 - y0) * .55, za], [xb, y0 + (y1 - y0) * .55, zb], .35);
  }
  B.line([x0 + .1, y1 - .05, (z0 + z1) / 2], [x1 - .1, y1 - .05, (z0 + z1) / 2], .7);
  for (let k = 0; k < 6; k++) B.knot([x0 + .2 + k * (x1 - x0 - .4) / 5, y1 - .06, (z0 + z1) / 2], .03, 1, 3, lightQ(5, st || 'C5', k));
  B.tube([x1 - .1, y1 + .12, z0 + .1], [x1 - .1, y1 + .4, z0 + .1], .012, .7);
  for (let k = 0; k < 3; k++) B.knot([x1 - .1, y1 + .45 + k * .05, z0 + .1], .035, .9, 3, lightQ(k === 0 ? 7 : k === 1 ? 5 : 6, st || 'C5', 10 + k));
  B.tube([x0 + .1, y1 + .2, z1 - .1], [x1 - .1, y1 + .2, z1 - .1], .05, .45);
}
/* small machines: a linear axis (two rails, a ball screw, end blocks, its motor, bellows over the screw), a camera with
   a ring light, a magazine of slots */
function axis(B, a, b, w, o) {
  o = o || {};
  const d = nrm(sub(b, a)), up = o.up || YA, sd = nrm(V.cross(up, d)), L = V.dist(a, b), h = w / 2;
  for (const s of [-1, 1]) rail(B, add(a, mul(sd, s * h)), add(b, mul(sd, s * h)), .022, .75);
  B.line(add(a, mul(up, .02)), add(b, mul(up, .02)), .55);
  for (const p of [a, b]) B.obox(add(p, mul(up, .03)), d, up, sd, [.02, .03, h * .55], .006, { br: .85, edge: .85 });
  motor(B, V.mad(a, d, -.02 - (o.mL || .12)), V.mad(a, d, -.02), o.mR || .035, { up });
  if (o.bellows !== false) { const n = Math.max(4, Math.round(L / .025)); for (let k = 0; k < n; k++) { const p0 = V.mad(a, d, .05 + (L - .1) * k / n), p1 = V.mad(a, d, .05 + (L - .1) * (k + .5) / n), p2 = V.mad(a, d, .05 + (L - .1) * (k + 1) / n); B.line(add(add(p0, mul(sd, -h * .5)), mul(up, .03)), add(add(p1, mul(sd, -h * .5)), mul(up, .055)), .35); B.line(add(add(p1, mul(sd, -h * .5)), mul(up, .055)), add(add(p2, mul(sd, -h * .5)), mul(up, .03)), .35); } }
}
function camU(B, p, dir, r) {
  r = r || .025; const d = nrm(dir), [U, W] = perp(d);
  B.cyl(p, V.mad(p, d, -r * 5), r, { cell: r / 3, br: .95, caps: true }); B.obox(V.mad(p, d, -r * 6.5), d, U, W, [r * 1.6, r * 1.5, r * 1.5], r / 3, { br: .85, edge: .85 });
  for (let k = 0; k < 10; k++) { const t = k / 10 * TAU; B.knot(add(V.mad(p, d, .003), add(mul(U, Math.cos(t) * r * 1.5), mul(W, Math.sin(t) * r * 1.5))), r * .25, .95); }
  hose(B, [V.mad(p, d, -r * 8), add(V.mad(p, d, -r * 12), [0, .1, 0])], .03, .45);
}
function magazine(B, mn, mx, n) {
  bx(B, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], .02, { br: .55, edge: .85, plain: true });
  for (let k = 1; k < n; k++) { const y = mn[1] + (mx[1] - mn[1]) * k / n; B.line([mn[0] - .002, y, mn[2] + .01], [mn[0] - .002, y, mx[2] - .01], .5); B.line([mx[0] + .002, y, mn[2] + .01], [mx[0] + .002, y, mx[2] - .01], .35); }
}
/* a ring of bolts */
function bolts(B, c, U, W, r, n, s) { for (let k = 0; k < n; k++) { const t = k / n * TAU; B.knot(add(c, add(mul(U, Math.cos(t) * r), mul(W, Math.sin(t) * r))), s || .02, .8); } }
/* a hazard-striped floor border round a rectangle (deck level) */
function zone(B, x0, z0, x1, z1) {
  B.chunk('zone');
  const y = .006, d = .12;
  for (const [a, b] of [[[x0, y, z0], [x1, y, z0]], [[x1, y, z0], [x1, y, z1]], [[x1, y, z1], [x0, y, z1]], [[x0, y, z1], [x0, y, z0]]]) {
    B.line(a, b, .45); const dd = nrm(sub(b, a)), sd = nrm(V.cross(YA, dd)), L = V.dist(a, b);
    B.line(add(a, mul(sd, -d)), add(b, mul(sd, -d)), .3);
    for (let t = .1; t < L - .1; t += .3) { const p = V.mad(a, dd, t); B.line(p, add(add(p, mul(dd, .12)), mul(sd, -d)), .3); }
  }
}
/* a handwheel: rim, hub, spokes (in the plane of U, W) */
function handwheel(B, c, U, W, r) { B.ringP(c, U, W, r, .9); B.ringP(c, U, W, r * .2, .8); for (let k = 0; k < 3; k++) { const t = k / 3 * TAU; B.line(add(c, add(mul(U, Math.cos(t) * r * .2), mul(W, Math.sin(t) * r * .2))), add(c, add(mul(U, Math.cos(t) * r), mul(W, Math.sin(t) * r))), .7); } }
/* an operator pendant on a swing arm from a post: the arm, the box, its screen and buttons */
function pendant(B, base, h, arm, dir, id) {
  B.chunk('pend');
  const top = [base[0], base[1] + h, base[2]], end = add(top, mul(dir, arm));
  B.tube(base, top, .04, .7); B.tube(top, end, .035, .7); B.knot(top, .07, .8);
  const bc = [end[0], end[1] - .3, end[2]], n = nrm([-dir[0], 0, -dir[2]]);
  B.tube(end, add(bc, [0, .2, 0]), .02, .6);
  const az = nrm(V.cross(n, YA));
  B.obox(bc, az, YA, n, [.22, .16, .05], .02, { br: .7, edge: .85 });
  const F = { o: add(add(bc, mul(az, -.18)), add([0, -.1, 0], mul(n, .052))), u: mul(az, .36), v: [0, .24, 0], n, Lu: .36, Lv: .24 };
  frm(B, F, .02, .08, .26, .22, .9); B.panel(fpm(F, .02, .08, .003), mul(az, .24), [0, .14, 0], .015, { n, br: .1, edge: false });
  for (let k = 0; k < 4; k++) B.knot(fpm(F, .3, .06 + k * .045), .012, .9);
  B.ringP(fpm(F, .31, .23), az, YA, .018, 1);
  if (id) SCREENS[id] = { o: fpm(F, .02, .08, .006), u: mul(az, .24), v: [0, .14, 0] };
}
/* an energy chain (live): fixed end F on the base, the carriage end M (the chain's upper run ends there, 2r above F's
   line), travel along dn; total length Lc, so the bend rides at half the carriage's speed. Two side plates and a
   rung per link, width w across sd */
const CHP = [0, 0, 0], CHQ = [0, 0, 0], CHA = [0, 0, 0], CHB = [0, 0, 0];
function chainW(F, dn, up, xM, r, Lc, w, a) {
  if (a < .02) return;
  const sd = nrm(V.cross(up, dn)), xb = (Lc - PI * r + xM) / 2, step = .07, n = Math.ceil(Lc / step);
  let px = 0, py = 0;
  const pos = s => { if (s < xb) return [s, 0]; const t = (s - xb) / r; if (t < PI) return [xb + Math.sin(t) * r, r - Math.cos(t) * r]; return [xb - (s - xb - PI * r), 2 * r]; };
  for (let k = 0; k <= n; k++) {
    const [x, y] = pos(k * step);
    const c = [F[0] + dn[0] * x + up[0] * y, F[1] + dn[1] * x + up[1] * y, F[2] + dn[2] * x + up[2] * y];
    apX(BWX, c[0] + sd[0] * w / 2, c[1] + sd[1] * w / 2, c[2] + sd[2] * w / 2, CHA); apX(BWX, c[0] - sd[0] * w / 2, c[1] - sd[1] * w / 2, c[2] - sd[2] * w / 2, CHB);
    K.lineW(CHA[0], CHA[1], CHA[2], CHB[0], CHB[1], CHB[2], 2, 1, WH, .5 * a);
    if (k) {
      const p = [F[0] + dn[0] * px + up[0] * py, F[1] + dn[1] * px + up[1] * py, F[2] + dn[2] * px + up[2] * py];
      for (const s of [-1, 1]) { apX(BWX, p[0] + sd[0] * s * w / 2, p[1] + sd[1] * s * w / 2, p[2] + sd[2] * s * w / 2, CHP); apX(BWX, c[0] + sd[0] * s * w / 2, c[1] + sd[1] * s * w / 2, c[2] + sd[2] * s * w / 2, CHQ); K.lineW(CHP[0], CHP[1], CHP[2], CHQ[0], CHQ[1], CHQ[2], 1.6, 1, WH, .75 * a); }
    }
    px = x; py = y;
  }
}
/* a spinning part: body B (its axis +Z) at p with its axis along d, turned by angle t */
const XSP = mkX();
function spin(Bd, p, d, t, o) { const [U, W] = perp(d), c = Math.cos(t), s = Math.sin(t); atL(XSP, BWX, p[0], p[1], p[2], d[0], d[1], d[2], U[0] * c + W[0] * s, U[1] * c + W[1] * s, U[2] * c + W[2] * s); L.draw(Bd, XSP, o); }
/* bodies for spinning parts (axis +Z): a fan (hub, blades), a flywheel (rim, spokes), a pulley, a screw flight */
function fanB(r, nb) { return mkB('fan', B => { B.cyl([0, 0, -.02], [0, 0, .04], r * .22, { cell: .01, br: .9, caps: true }); for (let k = 0; k < (nb || 7); k++) { const t = k / (nb || 7) * TAU; B.line([Math.cos(t) * r * .22, Math.sin(t) * r * .22, 0], [Math.cos(t + .35) * r * .95, Math.sin(t + .35) * r * .95, .02], .85); B.line([Math.cos(t + .25) * r * .22, Math.sin(t + .25) * r * .22, 0], [Math.cos(t + .55) * r * .95, Math.sin(t + .55) * r * .95, .02], .55); } B.ringP([0, 0, .03], XA, YA, r, .5); }, 1); }
function wheelB(r, wd, ns) { return mkB('fw', B => { B.lathe([0, 0, -wd / 2], ZA, [[0, r * .8], [0, r], [wd, r], [wd, r * .8]], { cell: Math.max(.01, r / 10), br: .9, rbr: .8 }); B.cyl([0, 0, -wd * .7], [0, 0, wd * .7], r * .16, { cell: .01, br: .95, caps: true }); for (let k = 0; k < (ns || 6); k++) { const t = k / (ns || 6) * TAU; for (const z of [-wd * .3, wd * .3]) B.line([Math.cos(t) * r * .16, Math.sin(t) * r * .16, z], [Math.cos(t) * r * .8, Math.sin(t) * r * .8, z], .75); } B.line([r * .82, 0, wd / 2 + .002], [r * .98, 0, wd / 2 + .002], 1); }, 1); }
function screwB(r, L, pitch) { return mkB('scr', B => { const P = [], n = Math.ceil(L / pitch * 24); for (let k = 0; k <= n; k++) { const t = k / 24 * TAU; P.push([Math.cos(t) * r, Math.sin(t) * r, k / n * L]); } B.poly(P, false, .85); B.cyl([0, 0, 0], [0, 0, L], r * .3, { cell: Math.max(.006, r / 6), br: .8 }); }, 1); }

/* an industrial six-axis arm: bodies per link (each along its local +Z) */
function mkArm(s) {
  s = Object.assign({ H: 1.0, L1: 1.6, L2: 1.5, LT: .45, r: .2 }, s);
  const r = s.r;
  s.base = mkB('ab', B => { B.cyl([0, 0, 0], [0, .35, 0], r * 2.2, { cell: .05, br: .8, caps: true }); B.cyl([0, .35, 0], [0, .5, 0], r * 1.6, { cell: .05, br: .85 }); bolts(B, [0, .352, 0], XA, ZA, r * 1.95, 12, r * .12); B.box([-r * .5, .05, r * 2.1], [r * .5, .3, r * 2.5], .02, { br: .9, edge: .85 }); hose(B, [[0, .2, r * 2.5], [0, .05, r * 4]], .04, .5); });
  s.turret = mkB('at', B => { B.obox([0, s.H * .55, 0], XA, YA, ZA, [r * 1.3, s.H * .45, r * 1.3], .05, { br: .9, edge: .75 }); B.cyl([-r * 1.4, s.H, 0], [r * 1.4, s.H, 0], r * 1.1, { cell: .04, br: .9, caps: true }); for (const sx of [-1, 1]) { B.ringP([sx * r * 1.41, s.H, 0], YA, ZA, r * .8, .8); bolts(B, [sx * r * 1.42, s.H, 0], YA, ZA, r * .9, 8, r * .08); } motor(B, [r * 1.35, s.H * .45, -r * .4], [r * 1.35, s.H * .45, r * .9], r * .45, {}); for (let k = 1; k < 4; k++) B.line([-r * 1.31, s.H * .25 * k, -r * 1.31], [r * 1.31, s.H * .25 * k, -r * 1.31], .35); });
  s.l1 = mkB('a1', B => { B.obox([0, 0, s.L1 / 2], XA, YA, ZA, [r * .8, r * .9, s.L1 / 2 + r * .3], .05, { br: .95, edge: .8 }); B.cyl([-r, 0, s.L1], [r, 0, s.L1], r * .9, { cell: .04, br: .9, caps: true }); for (const sx of [-1, 1]) { B.line([sx * r * .81, -r * .5, 0], [sx * r * .81, -r * .5, s.L1], .4); B.line([sx * r * .81, r * .5, 0], [sx * r * .81, r * .5, s.L1], .4); B.ringP([sx * r * 1.01, 0, s.L1], YA, ZA, r * .6, .8); } hose(B, [[0, r * .95, r * .2], [0, r * 1.25, s.L1 * .5], [0, r * .95, s.L1 - r * .2]], .02, .55); });
  s.l2 = mkB('a2', B => { B.obox([0, 0, s.L2 * .45], XA, YA, ZA, [r * .6, r * .65, s.L2 * .45], .05, { br: .95, edge: .8 }); B.cyl([0, 0, s.L2 * .86], [0, 0, s.L2], r * .55, { cell: .03, br: .9, caps: true }); motor(B, [0, r * .7, -r * .2], [0, r * .7, r * 1.1], r * .35, {}); for (const sx of [-1, 1]) B.line([sx * r * .61, 0, r * .3], [sx * r * .61, 0, s.L2 * .82], .4); hose(B, [[0, r * .66, r * .4], [0, r * .9, s.L2 * .5], [0, r * .6, s.L2 * .85]], .02, .55); });
  s.wr = mkB('aw', B => { B.cyl([0, 0, 0], [0, 0, s.LT * .5], r * .45, { cell: .03, br: .95, caps: true }); B.obox([0, 0, s.LT * .75], XA, YA, ZA, [r * .7, r * .25, s.LT * .25], .03, { br: 1, edge: .85 }); bolts(B, [0, 0, s.LT * .5 + .002], XA, YA, r * .35, 6, r * .06); for (const sx of [-1, 1]) B.box([sx * r * .62 - r * .08, -r * .2, s.LT * .95], [sx * r * .62 + r * .08, r * .2, s.LT * 1.15], .01, { br: 1, edge: .9 }); });
  s.X = [mkX(), mkX(), mkX(), mkX(), mkX()];
  s.P = { sh: [0, 0, 0], el: [0, 0, 0], wr: [0, 0, 0], tip: [0, 0, 0] };
  return s;
}
const AW = [0, 0, 0];
/* pose an arm (base at b, bay) so its tool tip is at p with the tool along d (unit), elbow up */
function armPose(s, b, p, d, roll) {
  const wx = p[0] - d[0] * s.LT, wy = p[1] - d[1] * s.LT, wz = p[2] - d[2] * s.LT;
  const yaw = Math.atan2(wx - b[0], wz - b[2]);
  const rh = Math.hypot(wx - b[0], wz - b[2]), h = wy - (b[1] + s.H);
  let dd = Math.hypot(rh, h); const mx = s.L1 + s.L2 - 1e-3; if (dd > mx) dd = mx;
  const ce = E.clamp((dd * dd - s.L1 * s.L1 - s.L2 * s.L2) / (2 * s.L1 * s.L2), -1, 1), e = Math.acos(ce);
  const sh = Math.atan2(h, rh) + Math.atan2(s.L2 * Math.sin(e), s.L1 + s.L2 * Math.cos(e));
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const S = s.P.sh; S[0] = b[0]; S[1] = b[1] + s.H; S[2] = b[2];
  const El = s.P.el; El[0] = S[0] + sy * Math.cos(sh) * s.L1; El[1] = S[1] + Math.sin(sh) * s.L1; El[2] = S[2] + cy * Math.cos(sh) * s.L1;
  const fa = sh - e;
  const Wr = s.P.wr; Wr[0] = El[0] + sy * Math.cos(fa) * s.L2; Wr[1] = El[1] + Math.sin(fa) * s.L2; Wr[2] = El[2] + cy * Math.cos(fa) * s.L2;
  s.P.tip[0] = Wr[0] + d[0] * s.LT; s.P.tip[1] = Wr[1] + d[1] * s.LT; s.P.tip[2] = Wr[2] + d[2] * s.LT;
  s.yaw = yaw; s.d = d; s.roll = roll || 0; s.b = b;
}
function armDraw(s, o) {
  const X_ = s.X, b = s.b;
  at(X_[0], BWX, b[0], b[1], b[2], 1, s.yaw); L.draw(s.base, X_[0], o); L.draw(s.turret, X_[0], o);
  const S = s.P.sh, El = s.P.el, Wr = s.P.wr, sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  atL(X_[1], BWX, S[0], S[1], S[2], El[0] - S[0], El[1] - S[1], El[2] - S[2], cy, 0, -sy); L.draw(s.l1, X_[1], o);
  atL(X_[2], BWX, El[0], El[1], El[2], Wr[0] - El[0], Wr[1] - El[1], Wr[2] - El[2], cy, 0, -sy); L.draw(s.l2, X_[2], o);
  const d = s.d, rl = s.roll; let ux = cy * Math.cos(rl), uy = Math.sin(rl), uz = -sy * Math.cos(rl);
  atL(X_[3], BWX, Wr[0], Wr[1], Wr[2], d[0], d[1], d[2], ux, uy, uz); L.draw(s.wr, X_[3], o);
  return X_[3];
}

/* ---------------- the rod's lattice runs: power-of-two lengths (a run's dots stay put as it grows) ---------------- */
const CR = 1 / 128, KR = 11;
function rodSet(r, br, cell) {
  const c = cell || CR, segs = [];
  for (let k = 0; k <= KR; k++) segs.push(mkB('rs', B => B.lathe([0, 0, 0], ZA, [[0, r], [(1 << k) * c, r]], { cell: c, br, rings: false }), 1));
  const cap = mkB('rc', B => { B.lathe([0, 0, 0], ZA, [[0, 0], [0, r]], { cell: c * 1.6, br: br * .8, two: true, rings: false }); B.ringP([0, 0, 0], XA, YA, r, .8); }, 1);
  return { r, segs, cap, c };
}
const XS = mkX();
/* draw a run of set S along P's +Z from z0, in direction dir, length len */
function run(S, P, z0, dir, len, o) {
  const c = S.c; let n = Math.floor(len / c + 1e-6), off = 0;
  for (let k = KR; k >= 0 && n > 0; k--) {
    const m = 1 << k;
    while (n >= m) { const z = dir > 0 ? z0 + off * c : z0 - (off + m) * c; at(XS, P, 0, 0, z); L.draw(S.segs[k], XS, o); off += m; n -= m; }
  }
}
const capAt = (S, P, z, o) => { at(XS, P, 0, 0, z); L.draw(S.cap, XS, o); };
/* sets between two radii (for the shrinking stages) */
const setsBetween = (r0, r1, n, br) => { const A = []; for (let i = 0; i < n; i++) A.push(rodSet(r0 + (r1 - r0) * i / (n - 1), br)); return A; };
const pickSet = (A, f) => A[Math.max(0, Math.min(A.length - 1, Math.round(f * (A.length - 1))))];

let BB = {};                                                 // built bodies
let S_ = {};                                                 // rod sets

/* ---------------- the hall ---------------- */
const NLIGHT = [];                                           // ceiling lights (z) for the wave
function buildHall() {
  const H = HALL, T4 = 4, px0 = -22, px1 = -10, pz0 = 6, pz1 = 10;
  BB.hall = mkB('hall', B => {
    for (let x = H.x0; x < H.x1; x += T4) for (let z = H.z0; z < H.z1; z += T4) {
      if (x >= px0 && x < px1 && z >= pz0 && z < pz1) continue;          // the press pit
      B.chunk('d'); B.panel([x, 0, z], [T4, 0, 0], [0, 0, T4], .25, { n: YA, br: .3, edge: .34, two: true, seams: [4, 4], sbr: .14 });
    }
    // the side walls and the rear (dim, seamed), the roof an open grid of beams with lights under it
    for (let z = H.z0; z < H.z1; z += T4) {
      B.chunk('wl'); B.panel([H.x0, 0, z], [0, 0, T4], [0, H.y1, 0], .6, { n: XA, br: .2, edge: .24, seams: [0, 6], sbr: .14 });
      B.chunk('wr'); B.panel([H.x1, 0, z], [0, H.y1, 0], [0, 0, T4], .6, { n: [-1, 0, 0], br: .2, edge: .24, seams: [6, 0], sbr: .14 });
      B.chunk('rf'); B.tube([H.x0, H.y1 - .6, z], [H.x1, H.y1 - .6, z], .3, .5);
      for (let x = H.x0 + 4; x < H.x1; x += 8) { B.knot([x, H.y1 - 1.3, z + 2], .4, 1, 3, NLIGHT.length); NLIGHT.push(z + 2); }
    }
    B.chunk('rf2'); for (const x of [H.x0 + 14, -2, H.x1 - 14]) B.tube([x, H.y1 - .6, H.z0], [x, H.y1 - .6, H.z1], .3, .5);
    for (let x = H.x0; x < H.x1; x += T4) { B.chunk('we'); B.panel([x, 0, H.z1], [T4, 0, 0], [0, H.y1, 0], .6, { n: [0, 0, -1], br: .2, edge: .24, seams: [0, 6], sbr: .14 }); }
    // the front wall round the port to the chamber (on the bore's axis, 22 m up)
    B.chunk('front');
    const [qx, qy, qz] = PORT, h = 2.6;
    for (const [o, u, v] of [[[H.x0, 0, qz], [qx - h - H.x0, 0, 0], [0, H.y1, 0]], [[qx + h, 0, qz], [H.x1 - qx - h, 0, 0], [0, H.y1, 0]], [[qx - h, 0, qz], [2 * h, 0, 0], [0, qy - h, 0]], [[qx - h, qy + h, qz], [2 * h, 0, 0], [0, H.y1 - qy - h, 0]]])
      B.panel(o, u, v, .6, { n: ZA, br: .2, edge: .3 });
    B.ringP([qx, qy, qz + .05], XA, YA, PORT_R, .95); B.ringP([qx, qy, qz + .05], XA, YA, PORT_R - .4, .6); B.ringP([qx, qy, qz + .05], XA, YA, PORT_R + .5, .5);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; B.knot([qx + Math.cos(a) * (PORT_R + .25), qy + Math.sin(a) * (PORT_R + .25), qz + .08], .12, .9); }
    // the gantry's rails on their columns
    B.chunk('rails');
    for (const x of [-24.6, -.9]) { for (let z = H.z0; z < H.z1; z += 8) B.box([x - .3, YG - .5, z], [x + .3, YG - .1, Math.min(H.z1, z + 8)], .1, { br: .55, edge: .5 }); for (let z = H.z0 + 4; z < H.z1; z += 16) B.box([x - .25, 0, z - .25], [x + .25, YG - .5, z + .25], .1, { br: .45, edge: .45 }); }
    // the aisle's lime dashes
    B.chunk('aisle');
    for (const x of [-2.6, 2.6]) for (let z = H.z0 + .5; z < H.z1 - 1; z += 2) B.line([x, .01, z], [x, .01, z + 1], .9, 10, 0);
    // the clean room's frame (starboard)
    B.chunk('cr');
    for (let z = 0; z <= 57; z += 5.7) for (const x of [2.8, 13.6]) B.tube([x, 0, z], [x, 7.2, z], .07, .4);
    for (const x of [2.8, 13.6]) B.tube([x, 7.2, 0], [x, 7.2, 57], .08, .4);
    for (let z = 0; z <= 57; z += 5.7) B.line([2.8, 7.2, z], [13.6, 7.2, z], .3);
    // the press pit
    B.chunk('pit');
    const pd = PD;
    B.panel([px0, pd, pz0], [0, 0, pz1 - pz0], [0, -pd, 0], .5, { n: XA, br: .16, edge: .3 });
    B.panel([px1, pd, pz0], [0, -pd, 0], [0, 0, pz1 - pz0], .5, { n: [-1, 0, 0], br: .16, edge: .3 });
    B.panel([px0, pd, pz0], [0, -pd, 0], [px1 - px0, 0, 0], .5, { n: ZA, br: .16, edge: .3 });
    B.panel([px0, pd, pz1], [px1 - px0, 0, 0], [0, -pd, 0], .5, { n: [0, 0, -1], br: .16, edge: .3 });
    B.panel([px0, pd, pz0], [px1 - px0, 0, 0], [0, 0, pz1 - pz0], .5, { n: YA, br: .16, edge: .3 });
    for (let k = 0; k <= 12; k += 3) { B.tube([px0 + k, 0, pz0 - .3], [px0 + k, 1.1, pz0 - .3], .03, .5); B.tube([px0 + k, 0, pz1 + .3], [px0 + k, 1.1, pz1 + .3], .03, .5); }
    B.tube([px0, 1.1, pz0 - .3], [px1, 1.1, pz0 - .3], .03, .55); B.tube([px0, 1.1, pz1 + .3], [px1, 1.1, pz1 + .3], .03, .55);
    for (const z of [pz0 + .9, pz1 - .9]) B.box([px0 + .2, pd, z - .15], [px1 - .2, pd + .3, z + .15], .08, { br: .5, edge: .5 });   // the yoke's rails
  }, 1);
}

/* ---------------- the transfer gantry ---------------- */
function buildGantry() {
  BB.gBridge = mkB('gb', B => {
    B.box([-24.6, YG - .1, -.55], [-.9, YG + .9, .55], .1, { br: .8, edge: .7 });
    for (let x = -23; x < -2; x += 2.5) B.line([x, YG - .1, -.56], [x + 2.5, YG + .9, -.56], .4);
    for (const x of [-24.6, -.9]) B.box([x - .5, YG - .5, -1.6], [x + .5, YG + 1.1, 1.6], .08, { br: .85, edge: .75 });
    // the girder's skin, the walkway and its railing, the end trucks' motors and wheels, the festoon cable's loops
    detailBox(B, [-24.6, YG - .1, -.55], [-.9, YG + .9, .55]);
    for (let x = -23; x < -2; x += 2.5) B.line([x, YG - .1, .56], [x + 2.5, YG + .9, .56], .4);
    for (let x = -24.4; x < -1; x += .25) B.line([x, YG + .91, -.5], [x, YG + .91, .5], .2);
    railing(B, [[-24.4, YG + .9, .52], [-1.1, YG + .9, .52]], .9);
    for (const x of [-24.6, -.9]) for (const s of [-1, 1]) { motor(B, [x + s * .9, YG + .4, s * 1.2], [x + s * .5, YG + .4, s * 1.2], .16, {}); B.ringP([x, YG - .55, s * 1.25], XA, YA, .22, .8); B.ringP([x, YG - .55, s * 1.25], XA, YA, .08, .6); }
    for (let x = -23.5; x < -1.5; x += 1.4) hose(B, [[x, YG - .15, -.6], [x + 1.4, YG - .15, -.6]], .35, .4);
  });
  BB.gTrolley = mkB('gt', B => {
    B.box([-.9, -.1, -.8], [.9, .8, .8], .06, { br: .95, edge: .8 }); B.box([-.5, .8, -.5], [.5, 1.2, .5], .06, { br: .8, edge: .7 });
    detailBox(B, [-.9, -.1, -.8], [.9, .8, .8]);
    for (const s of [-1, 1]) { motor(B, [s * 1.45, .35, .3], [s * .92, .35, .3], .18, {}); B.cyl([s * .2, .35, -.78], [s * .75, .35, -.78], .2, { cell: .02, br: .8, rings: true, seams: 10 }); }
    for (let k = 0; k < 4; k++) B.knot([-.7 + k * .45, .82, .79], .03, 1, 3, lightQ(5, 'R1', 15 + k));
  });
  BB.gMast = [0, 1, 2].map(k => mkB('gm', B => { const h = .32 - k * .07; B.box([-h, -4.6, -h], [h, 0, h], .05, { br: .9, edge: .75 }); for (let y = -4.2; y < 0; y += 1) { B.line([-h, y, -h - .002], [h, y, -h - .002], .4); B.line([-h - .002, y, -h], [-h - .002, y, h], .35); } for (const s of [-1, 1]) B.line([s * h * .5, -4.6, -h - .004], [s * h * .5, 0, -h - .004], .6); for (let y = -4.4; y < 0; y += .5) B.knot([h + .004, y, 0], .02, .6); }));
  /* the gripper head: a rotary joint, a clamp around the bar (its +Z into the bar) */
  BB.gHead = mkB('gh', B => {
    B.cyl([0, 0, -.45], [0, 0, .45], .34, { cell: .04, br: .9, caps: true });            // the rotary joint (its axis = bay z)
    B.box([-.25, .2, -.25], [.25, .55, .25], .04, { br: .9, edge: .8 });
  });
  BB.gClamp = mkB('gc', B => {
    // a split collar around the bar (axis +Z), two arms up to the joint
    B.lathe([0, 0, -.25], ZA, [[0, .62], [.5, .62]], { cell: .04, br: .95, two: true, rbr: .8 });
    for (const s of [-1, 1]) B.box([s * .5 - .08, 0, -.2], [s * .5 + .08, .7, .2], .04, { br: .9, edge: .8 });
    B.box([-.58, .62, -.2], [.58, .78, .2], .04, { br: .9, edge: .8 });
  });
  BB.gX = [mkX(), mkX(), mkX(), mkX(), mkX(), mkX(), mkX()];
}
/* the gantry's moves: [u, x, y, z, tilt (0: bar along +x, PI/2: hanging, +Z end up)] (the gripping point) */
let GK = [], GH = [];                                          // keys; holds [u0, u1, e (piece z held), piece]
const GP = { x: -6, y: 12, z: 1, th: 0, hold: null };
function gantryAt(u) {
  let i = 0; while (i < GK.length - 2 && GK[i + 1][0] <= u) i++;
  const a = GK[i], b = GK[i + 1], w = u <= a[0] ? 0 : u >= b[0] ? 1 : kk(u, a[0], b[0]);
  GP.x = mix(a[1], b[1], w); GP.y = mix(a[2], b[2], w); GP.z = mix(a[3], b[3], w); GP.th = mix(a[4], b[4], w);
  GP.hold = null; for (const h of GH) if (u >= h[0] && u < h[1]) { GP.hold = h; break; }
  return GP;
}
function drawGantry(o) {
  const X_ = BB.gX, g = GP;
  at(X_[0], BWX, 0, 0, g.z); L.draw(BB.gBridge, X_[0], o);
  at(X_[1], BWX, g.x, YG - 1, g.z); L.draw(BB.gTrolley, X_[1], o);
  const ext = (YG - 1.1) - (g.y + .8);                         // trolley bottom to the head's top
  for (let k = 0; k < 3; k++) { at(X_[2], BWX, g.x, YG - 1.1 - ext * k / 3, g.z); L.draw(BB.gMast[k], X_[2], o); }
  at(X_[3], BWX, g.x, g.y + .55, g.z); L.draw(BB.gHead, X_[3], o);
  // the clamp: its +Z along the bar (direction (cos th, sin th, 0)), its arms toward the head (+Y local up)
  const c = Math.cos(g.th), s = Math.sin(g.th);
  atL(X_[4], BWX, g.x, g.y, g.z, c, s, 0, -s, c, 0); L.draw(BB.gClamp, X_[4], o);
}
/* the held piece's pose: origin = G - d e, +Z = d (tilt th about bay z) */
function heldPose(o, e) {
  const c = Math.cos(GP.th), s = Math.sin(GP.th);
  return atL(o, BWX, GP.x - c * e, GP.y - s * e, GP.z, c, s, 0, -s, c, 0);
}

/* ---------------- R1 · powder dosing ---------------- */
function buildR1() {
  const z = ZR.R1, xe = XR + D.Lb / 2;
  BB.r1 = mkB('r1', B => {
    // the vibrating bed: a long table on springs, four saddles
    B.chunk('bed'); bx(B, XR - D.Lb / 2 - .3, .2, z - .7, XR + D.Lb / 2 + .3, .5, z + .7, .06, { br: .8, occ: 'r1' });
    for (let k = 0; k < 6; k++) { const x = XR - D.Lb / 2 + k * D.Lb / 5; B.tube([x, 0, z - .5], [x, .2, z - .5], .07, .6); B.tube([x, 0, z + .5], [x, .2, z + .5], .07, .6); }
    for (let k = 0; k < 4; k++) { const x = XR - D.Lb / 2 + .8 + k * (D.Lb - 1.6) / 3; bx(B, x - .2, .5, z - .55, x + .2, YR - D.rb - .03, z + .55, .05, { br: .9 }); }
    bx(B, XR - .6, -.3, z - .9, XR + .6, .2, z + .9, .06, { br: .7 });                       // the vibrator
    // the powder tank (an auger under it), its legs, the auger tube to the mould
    B.chunk('tank');
    sphere(B, [xe + 2.25, 2.95, z], .8, { cell: .05, br: .9, seams: 8 });
    B.lathe([xe + 2.25, 1.55, z], YA, [[0, .14], [.65, .55], [.65, .62]], { cell: .04, br: .85, two: true });
    for (const [dx, dz] of [[.8, .8], [-.8, .8], [.8, -.8], [-.8, -.8]]) B.tube([xe + 2.25 + dx, 0, z + dz], [xe + 2.25 + dx * .7, 2.6, z + dz * .7], .06, .55);
    B.cyl([xe + 2.25, YR, z], [xe + 2.25, 1.6, z], .16, { cell: .03, br: .85 });
    B.cyl([xe + .55, YR, z], [xe + 2.4, YR, z], .17, { cell: .03, br: .9, seams: 4 });
    bx(B, xe + 2.4, YR - .35, z - .3, xe + 3.3, YR + .35, z + .3, .04, { br: .95, occ: 'r1' });          // the auger motor
    B.knot([xe + 2.25, 4.15, z], .14, 1, 3, 1001);
    B.box([xe + 1.85, 4.05, z - .25], [xe + 2.65, 4.4, z + .25], .04, { br: .9, edge: .8 });    // the vent filter
  }, .6);;
  BB.r1coup = mkB('r1c', B => { B.cyl([0, 0, 0], [.5, 0, 0], .26, { cell: .03, br: 1, caps: true, seams: 6 }); });
  // the mould: a perforated sleeve round the bag, end plugs, a grip flange on the +Z end (piece frame)
  BB.mould = mkB('mo', B => {
    const h = D.Lb / 2, r = D.rb + .04;
    B.lathe([0, 0, -h], ZA, [[0, r], [D.Lb, r]], { cell: .055, br: .42, two: true, rings: false });
    for (let k = 0; k <= Math.round(D.Lb / .6); k++) B.ringP([0, 0, -h + k * D.Lb / Math.round(D.Lb / .6)], XA, YA, r + .005, .62);
    for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; B.line([Math.cos(t) * (r + .006), Math.sin(t) * (r + .006), -h], [Math.cos(t) * (r + .006), Math.sin(t) * (r + .006), h], .5); }
    for (const s of [-1, 1]) B.lathe([0, 0, s * h], ZA, [[0, 0], [0, r + .06], [s * .12, r + .06], [s * .12, 0]], { cell: .04, br: .9 });
    B.cyl([0, 0, h + .12], [0, 0, h + .4], .24, { cell: .03, br: .95, caps: true });
  });
  S_.bag = rodSet(D.rb - .01, .8);
}
const R1S = { fill: 0, coup: 0 };
function r1State(u) {
  R1S.fill = lin(u, 3.0, 6.0);
  R1S.coup = kk(u, 6.0, 6.2);
}
const PW = [0, 0, 0], PW2 = [0, 0, 0];
const FLOWR = (() => { const r = rng(4101), A = new Float32Array(420 * 3); for (let i = 0; i < 420; i++) { A[i * 3] = r(); A[i * 3 + 1] = r(); A[i * 3 + 2] = r(); } return A; })();
function drawR1(u) {
  const z = ZR.R1, xe = XR + D.Lb / 2;
  L.draw(BB.r1, BWX, O.st);
  at(BB.gX[5], BWX, xe + .05 + .5 * R1S.coup, YR, z); L.draw(BB.r1coup, BB.gX[5], O.mc);
  // the powder in the auger tube and the mould: dots streaming, a bright fill front
  if (u > 3.0 && u < 6.05) {
    const t = u * 3.2, front = XR - D.Lb / 2 + D.Lb * R1S.fill;
    for (let i = 0; i < 400; i++) {
      const o = i * 3, ph = (FLOWR[o] + t * (i < 140 ? 1.3 : 1)) % 1;
      let x, y, zz;
      if (i < 140) { x = xe + 2.3 - 1.75 * ph; const a = FLOWR[o + 1] * TAU, rr = .12 * Math.sqrt(FLOWR[o + 2]); y = YR + Math.cos(a + ph * 9) * rr; zz = z + Math.sin(a + ph * 9) * rr; }
      else { x = xe - (xe - front) * ph; const a = FLOWR[o + 1] * TAU, rr = (D.rb - .03) * Math.sqrt(FLOWR[o + 2]) * (.25 + .75 * ph); y = YR + Math.cos(a) * rr; zz = z + Math.sin(a) * rr; }
      apX(BWX, x, y, zz, PW); K.dotW(PW[0], PW[1], PW[2], (i & 3) ? 1 : 2, WH, .95);
    }
    apX(BWX, front, YR, z, PW); K.glowW(PW[0], PW[1], PW[2], 40, LIME, .3);
    // the front: a ring of bright dots
    for (let k = 0; k < 64; k++) { const a = k / 64 * TAU + u; apX(BWX, front, YR + Math.cos(a) * (D.rb - .02), z + Math.sin(a) * (D.rb - .02), PW); K.dotW(PW[0], PW[1], PW[2], 2, LIME, .9); }
  }
}

/* ---------------- R2 · cold isostatic pressing ---------------- */
let VY0 = -11.6, PD = -13;
const VY1 = 1.0, VR = 1.25, VRI = .58;
function buildR2() {
  const z = ZR.R2;
  VY0 = -(D.Lb + 1.0); PD = VY0 - 1.4;
  BB.r2 = mkB('r2', B => {
    // the vessel: a forged cylinder wound with pre-stressed wire (the winding lights with the pressure)
    B.chunk('v');
    B.lathe([XV, VY0, z], YA, [[0, 0], [0, VR], [VY1 - VY0, VR], [VY1 - VY0, VRI]], { cell: .06, br: .8, rings: true, rbr: .6 });
    B.lathe([XV, VY0 + .4, z], YA, [[0, VRI], [VY1 - VY0 - .4, VRI]], { cell: .05, br: .35, two: true, rings: false });
    B.lathe([XV, VY1 - .2, z], YA, [[0, VR + .12], [.2, VR + .12]], { cell: .04, br: .9, rbr: .8 });
    B.chunk('w');
    const nt = 26, ns = 40;
    for (let t = 0; t < nt; t++) {
      const P = []; for (let k = 0; k <= ns; k++) { const a = k / ns * TAU, y = VY0 + .4 + (t + k / ns) * (VY1 - VY0 - .8) / nt; P.push([XV + Math.cos(a) * (VR + .015), y, z + Math.sin(a) * (VR + .015)]); }
      B.poly(P, false, .55, 11, t);
    }
    // the pump and its line
    B.chunk('pump');
    bx(B, -8.4, 0, z + 1.2, -6.6, 1.5, z + 2.6, .06, { br: .85, occ: 'r2p' });
    B.tube([-8.4, 1.1, z + 1.9], [XV + .9, 1.1, z + 1.9], .06, .7, 11, 99); B.tube([XV + .9, 1.1, z + 1.9], [XV + .9, VY1 + .25, z + .8], .06, .7, 11, 99);
    B.knot([-7.5, 1.6, z + 1.2], .12, 1, 3, 1002);
    // the plug's hinge post
    bx(B, XV + 1.7, 0, z - 1.9, XV + 2.1, 2.2, z - 1.5, .05, { br: .85 });
  });
  BB.plug = mkB('pl', B => {                                  // origin: the plug's top centre; it seats down to -0.6
    B.cyl([0, -.62, 0], [0, 0, 0], VRI - .01, { cell: .04, br: .95, caps: true, seams: 8 });
    B.cyl([0, 0, 0], [0, .22, 0], .32, { cell: .03, br: .9, caps: true });
    B.box([-.08, .22, -.08], [.08, .45, .08], .03, { br: .9 });
  });
  BB.plugArm = mkB('pa', B => B.box([0, -.12, -.12], [2.2, .12, .12], .04, { br: .85, edge: .75 }));
  BB.yoke = mkB('yk', B => {                                  // origin: on the vessel's axis at the deck
    const w = 2.4, c = .8, d = 1.1;
    B.chunk('top'); B.box([-w, VY1 + .05, -d], [w, VY1 + 1.65, d], .07, { br: .95, edge: .85 });
    for (let k = 1; k < 8; k++) B.line([-w, VY1 + .05 + k * .2, -d - .003], [w, VY1 + .05 + k * .2, -d - .003], .35, 11, 50);
    for (const s of [-1, 1]) { B.chunk('col'); B.box([s * w - (s > 0 ? c : 0), PD, -d], [s * w + (s < 0 ? c : 0), VY1 + .05, d], .08, { br: .9, edge: .8 }); for (let k = 1; k < 4; k++) { const x = s * w + (s > 0 ? -c : 0) + k * c / 4; B.line([x, PD, -d - .003], [x, VY1, -d - .003], .35, 11, 51); } }
    B.chunk('bot'); B.box([-w, PD, -d], [w, VY0 - .1, d], .08, { br: .8, edge: .7 });
    detailBox(B, [-w, VY1 + .05, -d], [w, VY1 + 1.65, d]); detailBox(B, [-w, PD, -d], [w, VY0 - .1, d]);
    for (const s of [-1, 1]) detailBox(B, [s * w - (s > 0 ? c : 0), PD, -d], [s * w + (s < 0 ? c : 0), VY1 + .05, d], ['z-', 'z+']);
    for (const s of [-1, 1]) for (const zz of [-.6, .6]) B.lathe([s * 1.8, PD - .2, zz], ZA, [[0, .2], [.001, .2]], { cell: .04, br: .7, two: true });
  });
  S_.cip = setsBetween(D.rb - .01, D.rg, 7, .8);
}
const R2S = { plug: 0, yoke: 0, p: 0, shrink: 0, xr: 0 };
function r2State(u) {
  R2S.plug = kk(u, 8.0, 8.25) * (1 - kk(u, 9.35, 9.55));
  R2S.yoke = kk(u, 8.1, 8.45) * (1 - kk(u, 9.15, 9.45));
  R2S.p = kk(u, 8.45, 8.95) * (1 - kk(u, 9.05, 9.15));
  R2S.shrink = kk(u, 8.45, 8.95);
  R2S.xr = ss(8.2, 8.5, u) * (1 - ss(9.2, 9.5, u));
}
function drawR2(u) {
  const z = ZR.R2, oV = R2S.xr > .02 ? O.mcx : O.st;
  O.mcx.keep = .9 - .62 * R2S.xr; O.mcx.a = .85 - .45 * R2S.xr;
  L.draw(BB.r2, BWX, oV);
  // the plug: swung aside on its arm (open), over and down into the mouth (closed)
  const sw = Math.min(1, R2S.plug * 1.6), dn = sat((R2S.plug - .62) / .38);
  const hx = XV + 1.9, hz = z - 1.7, phi = Math.atan2(1.7, -1.9) + (1 - sw) * 1.9;
  const px = hx + 2.55 * Math.cos(phi), pz = hz + 2.55 * Math.sin(phi), py = VY1 + .9 - .9 * dn;
  at(BB.gX[5], BWX, px, py, pz); L.draw(BB.plug, BB.gX[5], oV);
  at(BB.gX[6], BWX, hx, py + .1, hz, 1, -phi); L.draw(BB.plugArm, BB.gX[6], O.mc);
  // the yoke rolls over the vessel along x
  at(BB.gX[5], BWX, XV - 5 * (1 - R2S.yoke), 0, z); L.draw(BB.yoke, BB.gX[5], oV);
  // the pressure: lime rings closing in on the mould from all sides, the bore lit
  if (R2S.p > .02) {
    const r1 = mix(D.rb, D.rg, R2S.shrink) + .02, y0 = VY0 + .5;
    for (let j = 0; j < 9; j++) {
      const y = y0 + (D.Lb * (.06 + .88 * j / 8)), ph = (u * 2.2 + j * .37) % 1, r = VRI - .03 - (VRI - .03 - r1) * ph;
      for (let k = 0; k < 72; k++) { const a = k / 72 * TAU; apX(BWX, XV + Math.cos(a) * r, y, z + Math.sin(a) * r, PW); K.dotW(PW[0], PW[1], PW[2], 1, LIME, R2S.p * (.25 + .75 * ph)); }
    }
    apX(BWX, XV, y0 + D.Lb * .5, z, PW); K.glowW(PW[0], PW[1], PW[2], 70, LIME, .18 * R2S.p);
  }
}

/* ---------------- R3 · sintering (a clamshell hydrogen furnace) ---------------- */
const FR = 1.05, FRI = .78, FHZ = 1.08;                       // shell radius, insulation, hinge offset (z)
function buildR3() {
  const z = ZR.R3, x0 = XR - D.Lg / 2 - .8, x1 = XR + D.Lg / 2 + .8;
  BB.r3 = mkB('r3', B => {
    B.chunk('stand');
    for (let k = 0; k < 5; k++) { const x = x0 + .5 + k * (x1 - x0 - 1) / 4; bx(B, x - .25, 0, z - .9, x + .25, YR - FR + .05, z + .9, .05, { br: .8 }); }
    B.chunk('low'); shellX(B, x0, x1, YR, z, FR, PI / 2, PI * 1.5, 14, { cell: .09, br: .75, two: false });
    for (const x of [x0, x1]) { B.ring([x, YR, z], YA, ZA, FR, 24, .8, 0, 0, PI / 2, PI * 1.5); B.ring([x, YR, z], YA, ZA, FRI, 20, .5, 0, 0, PI / 2, PI * 1.5); B.line([x, YR, z - FR], [x, YR, z + FR], .7); }
    for (const a of [.62, .82, 1.0, 1.18, 1.38]) B.tube([x0 + .2, YR + Math.cos(a * PI) * .66, z + Math.sin(a * PI) * .66], [x1 - .2, YR + Math.cos(a * PI) * .66, z + Math.sin(a * PI) * .66], .035, .6, 12, 0);
    // the boat (molybdenum) under the bar, the gas lines
    B.chunk('boat'); bx(B, XR - D.Lg / 2 - .2, YR - D.rg - .12, z - .32, XR + D.Lg / 2 + .2, YR - D.rg, z + .32, .05, { br: .7 });
    B.tube([x1, YR - .5, z + .5], [x1 + 1.2, YR - .5, z + .5], .05, .6); B.tube([x0 - 1.2, YR - .5, z + .5], [x0, YR - .5, z + .5], .05, .6);
    bx(B, x1 + 1.2, 0, z - .2, x1 + 2.2, 2.4, z + 1.0, .05, { br: .85, occ: 'r3c' }); B.knot([x1 + 1.7, 2.5, z + .4], .12, 1, 3, 1003);
  });
  // the lid: its own frame on the hinge (along x at y = YR, z + FHZ); closed: the upper half shell
  BB.lid = mkB('lid', B => {
    const xa = x0, xb = x1;
    const sh = (r, nf, o) => { for (let k = 0; k < nf; k++) { const t0 = -PI / 2 + PI * k / nf, t1 = -PI / 2 + PI * (k + 1) / nf, tm = (t0 + t1) / 2; const p0 = [xa, Math.cos(t0) * r, Math.sin(t0) * r - FHZ], p1 = [xa, Math.cos(t1) * r, Math.sin(t1) * r - FHZ]; B.panel(p0, [xb - xa, 0, 0], V.sub(p1, p0), o.cell, Object.assign({ n: [0, Math.cos(tm), Math.sin(tm)], edge: false }, o)); } };
    sh(FR, 14, { cell: .09, br: .8 });
    for (const x of [xa, xb]) { B.ring([x, 0, -FHZ], YA, ZA, FR, 24, .85, 0, 0, -PI / 2, PI / 2); B.ring([x, 0, -FHZ], YA, ZA, FRI, 20, .5, 0, 0, -PI / 2, PI / 2); }
    for (let k = 0; k < 9; k++) { const x = xa + .4 + k * (xb - xa - .8) / 8; B.ring([x, 0, -FHZ], YA, ZA, FR + .03, 16, .55, 0, 0, -PI / 2, PI / 2); }
    for (const a of [-.38, -.18, 0, .18, .38]) B.tube([xa + .2, Math.cos(a * PI) * .66, Math.sin(a * PI) * .66 - FHZ], [xb - .2, Math.cos(a * PI) * .66, Math.sin(a * PI) * .66 - FHZ], .035, .6, 12, 0);
    for (const x of [xa + 1, xb - 1]) B.box([x - .15, -.15, -.15], [x + .15, .15, .25], .04, { br: .9, edge: .8 });
  });
  S_.sint = setsBetween(D.rg, D.rs, 6, .85);
  BB.r3in = mkB('r3i', B => shellX(B, x0 + .1, x1 - .1, YR, z, FRI, PI / 2, PI * 1.5, 12, { cell: .06, br: .7, two: true }));
  BB.lidIn = mkB('lii', B => { for (let k = 0; k < 12; k++) { const t0 = -PI / 2 + PI * k / 12, t1 = -PI / 2 + PI * (k + 1) / 12, tm = (t0 + t1) / 2; const p0 = [x0 + .1, Math.cos(t0) * FRI, Math.sin(t0) * FRI - FHZ], p1 = [x0 + .1, Math.cos(t1) * FRI, Math.sin(t1) * FRI - FHZ]; B.panel(p0, [x1 - x0 - .2, 0, 0], V.sub(p1, p0), .06, { n: [0, Math.cos(tm), Math.sin(tm)], br: .7, two: true, edge: false }); } });
}
const R3S = { lid: 0, heat: 0, shrink: 0, glow: 0, xr: 0 };
function r3State(u) {
  R3S.lid = 1 - kk(u, 11.3, 11.6) * (1 - kk(u, 12.55, 12.85));      // 1 open
  R3S.heat = ss(11.55, 12.15, u) * (1 - .45 * ss(12.3, 13.4, u)) * (1 - ss(13.4, 15.2, u));
  R3S.shrink = kk(u, 11.8, 12.45);
  R3S.xr = ss(11.4, 11.7, u) * (1 - ss(12.45, 12.75, u));
}
function drawR3(u) {
  const z = ZR.R3, oS = R3S.xr > .02 ? O.mcx : O.mc;
  if (R3S.xr > .02) { O.mcx.keep = .9 - .55 * R3S.xr; O.mcx.a = .85 - .3 * R3S.xr; }
  L.draw(BB.r3, BWX, oS === O.mc ? O.st : oS);
  at(BB.gX[5], BWX, 0, YR, z + FHZ, 0, -R3S.lid * 1.95); L.draw(BB.lid, BB.gX[5], oS);
  // the insulation inside: lit by the hot zone (dull red to yellow-white)
  const hi = R3S.heat;
  if (hi > .03) { heatCol(O.hot3, Math.min(1, hi * .9)); O.hot3.a *= .55; } else { O.hot3.col[0] = 200; O.hot3.col[1] = 200; O.hot3.col[2] = 190; O.hot3.a = .35; }
  L.draw(BB.r3in, BWX, O.hot3); L.draw(BB.lidIn, BB.gX[5], O.hot3);
  // the hot zone: a warm glow filling the tube round the bar
  const h = R3S.heat;
  if (h > .03) {
    GLC3[1] = 110 + 120 * h; GLC3[2] = 50 + 140 * h;
    const n = 10; for (let i = 0; i <= n; i++) { apX(BWX, XR - D.Lg / 2 + D.Lg * i / n, YR, z, PW); K.glowW(PW[0], PW[1], PW[2], 110, GLC3, .16 * h); }
  }
}
const GLC3 = [255, 160, 80];

/* the colour of hot metal: dull red -> orange -> yellow -> white */
function heatCol(o, h) {
  const c = o.col;
  if (h < .5) { const t = h / .5; c[0] = 120 + 135 * t; c[1] = 40 + 90 * t; c[2] = 20 + 30 * t; }
  else { const t = (h - .5) / .5; c[0] = 255; c[1] = 130 + 120 * t; c[2] = 50 + 180 * t; }
  o.a = 1.1 + 1.1 * h;
}
const GLC = [255, 170, 90];
function glowAlong(P, z0, z1, h) {
  const n = Math.max(2, Math.round((z1 - z0) / .55));
  GLC[1] = 120 + 120 * h; GLC[2] = 60 + 150 * h;
  for (let i = 0; i <= n; i++) { apX(P, 0, 0, z0 + (z1 - z0) * i / n, PW); K.glowW(PW[0], PW[1], PW[2], 48, GLC, .26 * h); }
}

/* ---------------- particles: straight streams (microgravity), analytic in u ---------------- */
const RND = (() => { const r = rng(7771), A = new Float32Array(8192); for (let i = 0; i < 8192; i++) A[i] = r(); return A; })();
const SPU = [0, 0, 0], SPW = [0, 0, 0];
/* n particles cycling with period life from o along d (unit, bay) with a cone spread, speeds v0..v1 */
function spray(ua, t0, t1, n, ox, oy, oz, dx, dy, dz, spread, v0, v1, life, col, a, sz, seed) {
  // the window in the machines' clock; the particles fly in real seconds
  const u = U_; t0 = unwarp(t0); t1 = unwarp(t1);
  if (u < t0 || u > t1 + life || a < .01) return;
  let px = Math.abs(dx) < .9 ? 1 : 0, py = px ? 0 : 1, pz = 0;
  let ux = dy * pz - dz * py, uy = dz * px - dx * pz, uz = dx * py - dy * px; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
  const s0 = (seed || 0) * 97;
  for (let i = 0; i < n; i++) {
    const j = (s0 + i * 5) & 8191, ph = RND[j] * life;
    let age = (u - t0 - ph) % life; if (u - t0 - ph < 0) continue;
    const born = u - age; if (born > t1) continue;
    const k = age / life, v = v0 + (v1 - v0) * RND[(j + 1) & 8191];
    const g = (RND[(j + 2) & 8191] - .5) * 2 * spread, h = (RND[(j + 3) & 8191] - .5) * 2 * spread;
    const ex = dx + ux * g + wx * h, ey = dy + uy * g + wy * h, ez = dz + uz * g + wz * h;
    const d = v * age;
    apX(BWX, ox + ex * d, oy + ey * d, oz + ez * d, SPW);
    K.dotW(SPW[0], SPW[1], SPW[2], sz || 1, col, a * (1 - k * k));
  }
}

/* ---------------- R4 · radial forging ---------------- */
const COIL_X = [XF - 2.3, XF - 1.35];
function buildR4() {
  const z = ZR.R4, hx = 1.1, y0 = -1.6, y1 = 4.6, hz = 2.9, ob = .85;
  BB.r4 = mkB('r4', B => {
    // the forge's frame: a block with a bore, the four hammer barrels out of its chamfered corners
    for (const s of [-1, 1]) {
      const x = XF + s * hx; B.chunk('face');
      const pn = (a, b, c, d) => B.panel([x, a, c], [0, b - a, 0], [0, 0, d - c], .08, { n: [s, 0, 0], br: .85, edge: .7, two: false });
      pn(y0, YR - ob, z - hz, z + hz); pn(YR + ob, y1, z - hz, z + hz); pn(YR - ob, YR + ob, z - hz, z - ob); pn(YR - ob, YR + ob, z + ob, z + hz);
      B.ringP([x + s * .01, YR, z], YA, ZA, .78, .9); B.ringP([x + s * .01, YR, z], YA, ZA, .62, .6);
      for (const [yy, zz] of [[YR + ob + .5, z - hz + .5], [YR + ob + .5, z + hz - .5], [y0 + .5, z - hz + .5], [y0 + .5, z + hz - .5]]) B.knot([x + s * .02, yy, zz], .22, .9);
      for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; B.knot([x + s * .02, YR + Math.cos(a) * 1.05, z + Math.sin(a) * 1.05], .09, 1); }
      for (const zz of [z - hz + 1.2, z + hz - 1.2]) B.line([x + s * .01, y0 + .3, zz], [x + s * .01, y1 - .3, zz], .45);
      for (const yy of [y1 - 1.0, y0 + 1.6]) B.line([x + s * .01, yy, z - hz + .3], [x + s * .01, yy, z + hz - .3], .45);
    }
    B.chunk('sides');
    B.panel([XF - hx, y1, z - hz], [0, 0, 2 * hz], [2 * hx, 0, 0], .08, { n: YA, br: .8, edge: .7 });
    B.panel([XF - hx, y0, z - hz], [2 * hx, 0, 0], [0, y1 - y0, 0], .08, { n: [0, 0, -1], br: .8, edge: .7 });
    B.panel([XF - hx, y0, z + hz], [0, y1 - y0, 0], [2 * hx, 0, 0], .08, { n: ZA, br: .8, edge: .7 });
    B.lathe([XF - hx, YR, z], XA, [[0, .78], [2 * hx, .78]], { cell: .05, br: .3, two: true, rings: false });
    detailBox(B, [XF - hx, y0, z - hz], [XF + hx, y1, z + hz], ['z-', 'z+', 'y+']);
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * PI / 2, c = Math.cos(a), s = Math.sin(a);
      B.chunk('barrel');
      B.cyl([XF - .7, YR + c * 2.7, z + s * 2.7], [XF + .7, YR + c * 2.7, z + s * 2.7], .62, { cell: .16, br: .9, caps: true, seams: 6 });
      B.cyl([XF + .7, YR + c * 2.7, z + s * 2.7], [XF + 1.6, YR + c * 2.7, z + s * 2.7], .36, { cell: .04, br: .85, caps: true });
      B.knot([XF + 1.62, YR + c * 2.7, z + s * 2.7], .1, 1, 3, 1004 + k);
    }
    // the entry: manipulator rails, the coil's stand; the exit: the roller table
    B.chunk('rails');
    for (const dz of [-.75, .75]) bx(B, -22.5, 0, z + dz - .15, XF - 1.3, .25, z + dz + .15, .06, { br: .6 });
    bx(B, COIL_X[0] - .2, 0, z - .9, COIL_X[1] + .2, YR - .75, z + .9, .06, { br: .75, occ: 'r4' });
    for (const [y0_, y1_, z0_, z1_] of [[y0, YR - ob, z - hz, z + hz], [YR + ob, y1, z - hz, z + hz], [YR - ob, YR + ob, z - hz, z - ob], [YR - ob, YR + ob, z + ob, z + hz]]) OCCS.push({ mn: [XF - hx + .03, y0_ + .03, z0_ + .03], mx: [XF + hx - .03, y1_ - .03, z1_ - .03], g: 'r4' });
    B.chunk('rollers');
    for (let x = XF + 1.6; x < -3; x += 1.25) { B.cyl([x, YR - D.rf - .16, z - .55], [x, YR - D.rf - .16, z + .55], .15, { cell: .03, br: .8, caps: true }); bx(B, x - .1, 0, z - .7, x + .1, YR - D.rf - .16, z - .58, .04, { br: .6 }); bx(B, x - .1, 0, z + .58, x + .1, YR - D.rf - .16, z + .7, .04, { br: .6 }); }
    bx(B, XF + 1.3, 0, z - .8, -3.2, .3, z + .8, .08, { br: .55 });
  }, .6);;
  // the induction coil: a horseshoe (open on top) of six turns, its own lime channel
  BB.coil = mkB('coil', B => {
    const n = 6, r = .52;
    for (let t = 0; t < n; t++) {
      const P = []; for (let k = 0; k <= 30; k++) { const a = .55 + k / 30 * (TAU - 1.1), x = COIL_X[0] + (t + k / 30) * (COIL_X[1] - COIL_X[0]) / n; P.push([x, YR + Math.cos(a) * r, ZR.R4 + Math.sin(a) * r]); }
      B.poly(P, false, .9, 13, t);
    }
    for (const s of [-1, 1]) B.tube([COIL_X[0], YR + Math.cos(.55) * r, ZR.R4 + s * Math.sin(.55) * r], [COIL_X[0] - .5, YR + .9, ZR.R4 + s * .4], .04, .8, 13, 9);
  });
  // a hammer die (its own frame: +Y radially outward from the bar, origin at its face)
  BB.die = mkB('die', B => { B.box([-.42, 0, -.17], [.42, .5, .17], .03, { br: 1, edge: .9 }); B.box([-.3, .5, -.12], [.3, 1.3, .12], .04, { br: .85, edge: .7 }); for (const x of [-.42, .42]) B.line([x, 0, -.17], [x * .7, -.0, .17], .5); });
  // the manipulator: carriage on the rails, a rotating chuck (its jaws grip the tail)
  BB.manip = mkB('mp', B => { B.box([-1.6, .25, -1.0], [0, 2.6, 1.0], .07, { br: .9, edge: .8 }); B.box([-1.2, 2.6, -.5], [-.3, 3.1, .5], .05, { br: .85, edge: .7 }); B.knot([-.75, 3.15, 0], .12, 1, 3, 1008); });
  BB.chuck = mkB('ch', B => {                                 // axis +Z (= bay +x)
    B.lathe([0, 0, -.5], ZA, [[0, 0], [0, .62], [.5, .62], [.5, .45]], { cell: .04, br: .95, seams: 6 });
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU, c = Math.cos(a), s = Math.sin(a); B.obox([c * (D.rs + .12), s * (D.rs + .12), .25], [c, s, 0], [-s, c, 0], ZA, [.12, .1, .25], .03, { br: 1, edge: .9 }); }
  });
  S_.frg = rodSet(D.rf, .8);
}
const R4S = { f: 0, man: 0, ham: 0, spin: 0, ind: 0, hot: 0 };
const FG0 = 14.35, FG1 = 16.65;
function r4State(u) {
  R4S.f = (D.Ls - D.LT) * kk(u, FG0, FG1) ;
  R4S.ham = ss(FG0 - .1, FG0 + .05, u) * (1 - ss(FG1 - .05, FG1 + .1, u));
  R4S.ind = ss(13.8, 14.2, u) * (1 - ss(FG1, FG1 + .4, u));
  R4S.spin = u * 2.2;
  const x0 = D.xF - D.Ls;
  R4S.xt = u < 14.2 ? x0 : u < FG0 ? mix(x0, XF - D.Ls, kk(u, 14.2, FG0)) : XF - D.Ls + R4S.f;
  R4S.man = u < 14.0 ? -21.8 : u < 14.2 ? mix(-21.8, x0, kk(u, 14.0, 14.2)) : u < FG1 + .1 ? R4S.xt : mix(R4S.xt, -21.8, kk(u, FG1 + .1, FG1 + .5));
}
const XF4 = mkX();
function drawR4(u) {
  const z = ZR.R4;
  L.draw(BB.r4, BWX, O.st); L.draw(BB.coil, BWX, O.mc);
  // the hammers: four dies striking radially (a blow each 1/14 s here; their faces close to the bar)
  const blow = R4S.ham > .01 ? .5 + .5 * Math.cos(u * TAU * 14) : 1;
  const open = .42 * (1 - R4S.ham) + R4S.ham * (.02 + .07 * blow);
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2, c = Math.cos(a), s = Math.sin(a), r = D.rf + open;
    atL(XF4, BWX, XF, YR + c * r, z + s * r, 1, 0, 0, 0, c, s); L.draw(BB.die, XF4, O.hero);
  }
  // the manipulator: grips the tail end and pushes the bar through
  const xm = R4S.man;
  at(XF4, BWX, xm - .05, 0, z); L.draw(BB.manip, XF4, O.mc);
  at2(XF4, BWX, xm + .1, YR, z, 1, PI / 2, 2, u > 14.2 && u < FG1 ? R4S.spin : 0); L.draw(BB.chuck, XF4, O.mc);
  // sparks of scale flying off the dies at the blows
  if (R4S.ham > .05) for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2 + .3;
    spray(u, FG0, FG1, 26, XF + .45, YR + Math.cos(a) * D.rf, z + Math.sin(a) * D.rf, .35, Math.cos(a), Math.sin(a), .55, 2.5, 6, .45, GLC, 1, 1, k + 1);
  }
}

/* ---------------- R5 · turning and grinding ---------------- */
const TURN = [18.15, 19.0], GRIND = [19.05, 19.75];
function buildR5() {
  const z = ZR.R5, xa = XR - RL / 2, xb = XR + RL / 2;
  BB.r5 = mkB('r5', B => {
    B.chunk('bed'); bx(B, xa - 2.8, 0, z + .5, xb + 1.6, 1.0, z + 2.3, .08, { br: .8, occ: 'r5' });
    for (const dz of [.65, 2.05]) bx(B, xa - 2.5, 1.0, z + dz - .1, xb + 1.4, 1.1, z + dz + .1, .04, { br: .9 });
    B.chunk('head'); bx(B, xa - 3.0, 0, z - 1.3, xa - .75, 3.0, z + 2.3, .08, { br: .9, occ: 'r5' });
    B.knot([xa - 1.9, 3.05, z - .5], .12, 1, 3, 1010);
    for (let k = 0; k < 4; k++) B.line([xa - 3.0, .6 + k * .6, z - 1.31], [xa - .75, .6 + k * .6, z - 1.31], .35);
    B.chunk('tail'); bx(B, xb + .5, 0, z - .8, xb + 1.6, 2.2, z + .9, .07, { br: .9, occ: 'r5' });
    B.chunk('rest'); // the steady rest at the middle: a frame with three rollers
    B.ring([XR, YR, z], YA, ZA, .7, 24, .8); B.ring([XR + .12, YR, z], YA, ZA, .7, 24, .6); bx(B, XR - .15, 0, z - .5, XR + .15, YR - .7, z + .5, .05, { br: .8 });
    for (const a of [0, 2.1, -2.1]) B.cyl([XR - .08, YR + Math.cos(a) * (D.rf + .08), z + Math.sin(a) * (D.rf + .08)], [XR + .08, YR + Math.cos(a) * (D.rf + .08), z + Math.sin(a) * (D.rf + .08)], .07, { cell: .02, br: .9, caps: true });
    B.knot([XR, YR + .75, z], .1, 1, 3, 1011);
    // the chip conveyor under the work
    bx(B, xa, 0, z - .9, xb, .35, z + .4, .1, { br: .5, occ: 'r5' });
  });
  BB.lchuck = mkB('lc', B => { B.lathe([0, 0, -.55], ZA, [[0, 0], [0, .78], [.55, .78], [.55, .5]], { cell: .04, br: .95, seams: 8 }); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU, c = Math.cos(a), s = Math.sin(a); B.obox([c * (D.rs + .14), s * (D.rs + .14), .2], [c, s, 0], [-s, c, 0], ZA, [.14, .11, .3], .03, { br: 1, edge: .9 }); } });
  BB.quill = mkB('qu', B => { B.cyl([0, 0, 0], [1.4, 0, 0], .2, { cell: .03, br: .95, caps: true }); B.lathe([0, 0, 0], [-1, 0, 0], [[0, .2], [.22, 0]], { cell: .02, br: 1 }); });
  // the carriage and turret (tool on the -z side of the bar), the wheel head
  BB.carr = mkB('cr', B => { B.box([-.6, 1.1, -.45], [.6, 1.45, 1.5], .05, { br: .9, edge: .8 }); B.box([-.35, 1.45, -1.0], [.35, 1.95, -.35], .04, { br: .95, edge: .85 }); B.lathe([0, YR, -.9], ZA, [[0, .45], [.25, .45]], { cell: .03, br: .95, rbr: .8 }); B.box([-.04, YR - .03, -.66], [.04, YR + .03, -D.rf - .0], .015, { br: 1, edge: 1 }); });
  BB.wheel = mkB('wh', B => { B.lathe([-.06, 0, 0], XA, [[0, 0], [0, .62], [.12, .62], [.12, 0]], { cell: .03, br: 1, seams: 12 }); B.cyl([0, 0, 0], [0, 0, -1.2], .16, { cell: .03, br: .85 }); B.box([-.5, -.5, -2.2], [.5, .5, -1.2], .05, { br: .9, edge: .8 }); });
  S_.trn = rodSet(RR, 1);
}
const R5S = { tc: 0, gc: 0, spin: 0, tail: 0 };
function r5State(u) {
  R5S.tc = RL / 2 + D.crop - (RL + D.crop) * kk(u, TURN[0], TURN[1]);    // the turning front (rod frame): turned above it
  R5S.gc = -RL / 2 + RL * kk(u, GRIND[0], GRIND[1]);                     // ground below it
  R5S.spin = u * 3.1;
  R5S.tail = kk(u, 17.9, 18.05) * (1 - kk(u, 19.78, 19.9));
}
function drawR5(u) {
  const z = ZR.R5, xa = XR - RL / 2, xb = XR + RL / 2;
  L.draw(BB.r5, BWX, O.st);
  at2(XF4, BWX, xa - .75, YR, z, 1, PI / 2, 2, R5S.spin); L.draw(BB.lchuck, XF4, O.mc);
  at(XF4, BWX, xb + D.crop * (1 - kk(u, 18.0, 18.15)) + .5 - .45 * R5S.tail + .02, YR, z); L.draw(BB.quill, XF4, O.mc);
  const xt = XR + R5S.tc, xg = XR + R5S.gc;
  at(XF4, BWX, u < TURN[1] + .05 ? xt : xg, 0, z); L.draw(BB.carr, XF4, O.mc);
  at(XF4, BWX, u < GRIND[0] - .2 ? xb + .4 : xg, YR - .1, z - D.rf - .62 - .01 * (1 - kk(u, GRIND[0] - .15, GRIND[0]))); L.draw(BB.wheel, XF4, O.mc);
  if (u > TURN[0] && u < TURN[1]) spray(u, TURN[0], TURN[1], 70, xt, YR + .05, z - D.rf, .2, .45, -.85, .35, 1.0, 2.6, .5, WH, .95, 1, 21);
  if (u > GRIND[0] && u < GRIND[1]) spray(u, GRIND[0], GRIND[1], 110, xg, YR - .3, z - D.rf - .05, .15, -.95, -.25, .3, 3, 7, .35, GLC, 1, 1, 22);
}

/* ---------------- R6 · nose and fin machining ---------------- */
const OGV = [20.9, 22.25], PART = [99, 99.1], BORE = [99, 99.1], FINS = [22.4, 23.35];
const ogR = s => { const R_ = RR, Ln = D.LN, rho = (R_ * R_ + Ln * Ln) / (2 * R_); return Math.max(.012, Math.sqrt(Math.max(0, rho * rho - s * s)) + R_ - rho); };
function buildR6() {
  const z = ZR.R6, xa = XR - RL / 2;
  BB.r6 = mkB('r6', B => {
    // the gantry: two columns behind the bar, a bridge along x
    for (const x of [XR - RL / 2 - 1.2, XR + RL / 2 + 1.0]) { B.chunk('col'); bx(B, x - .45, 0, z + 1.0, x + .45, 5.6, z + 2.1, .07, { br: .85, occ: 'r6' }); }
    B.chunk('bridge'); bx(B, XR - RL / 2 - 1.65, 4.6, z + .9, XR + RL / 2 + 1.45, 5.6, z + 2.2, .08, { br: .9, occ: 'r6' });
    for (let x = XR - RL / 2 - 1.4; x < XR + RL / 2 + 1.3; x += 1) B.line([x, 4.6, z + .89], [x + .5, 5.6, z + .89], .35);
    // the indexer (tail) and two clamps
    B.chunk('idx'); bx(B, xa - 1.9, 0, z - .9, xa - .55, 2.4, z + .9, .07, { br: .9, occ: 'r6' }); B.knot([xa - 1.2, 2.45, z], .12, 1, 3, 1012);
    for (const x of [XR - 1.5, XR + 1.6]) { B.chunk('clamp'); bx(B, x - .25, 0, z - .55, x + .25, YR - RR - .02, z + .55, .05, { br: .85 }); B.ring([x, YR, z], YA, ZA, RR + .06, 20, .8, 0, 0, -1.2, 1.2); bx(B, x - .2, YR + RR + .02, z - .25, x + .2, YR + RR + .14, z + .25, .03, { br: .9 }); }
    // the shuttle rail (to the mating station) along the aisle edge
  });
  BB.ram = mkB('rm', B => { B.box([-.45, -.0, -.45], [.45, 3.4, .45], .05, { br: .95, edge: .85 }); B.box([-.7, 3.4, -.6], [.7, 4.0, .6], .05, { br: .9, edge: .8 }); detailBox(B, [-.45, 0, -.45], [.45, 3.4, .45]); detailBox(B, [-.7, 3.4, -.6], [.7, 4.0, .6]); });
  BB.spin = mkB('sp', B => { B.cyl([0, 0, 0], [0, -.55, 0], .2, { cell: .025, br: 1, caps: true }); B.cyl([0, -.55, 0], [0, -.8, 0], .05, { cell: .012, br: 1, caps: true }); B.lathe([0, -.86, 0], YA, [[0, .11], [.06, .11]], { cell: .01, br: 1 }); });
  BB.saw = mkB('sw', B => { B.lathe([-.012, 0, 0], XA, [[0, 0], [0, .38], [.024, .38], [.024, 0]], { cell: .02, br: 1, seams: 16 }); B.cyl([0, 0, 0], [0, -.9, 0], .07, { cell: .02, br: .85 }); });
  BB.borer = mkB('bb', B => { B.cyl([0, 0, 0], [0, 0, -(D.dbore + .6)], .09, { cell: .02, br: 1, caps: true }); B.lathe([0, 0, -(D.dbore + .6)], [0, 0, -1], [[0, .16], [.1, .16]], { cell: .02, br: 1 }); B.cyl([0, 0, .0], [0, 0, 1.2], .22, { cell: .03, br: .9 }); });
  // the ogive in slices (contoured from the tip back), the nose cap (whole), the bay, the tail's fins and stock
  BB.ogs = [];
  const NS = 14, z0 = RL / 2 - D.LN;
  for (let i = 0; i < NS; i++) { const sa = D.LN * i / NS, sb = D.LN * (i + 1) / NS; BB.ogs.push(mkB('og', B => B.lathe([0, 0, z0 + sa], ZA, [[0, ogR(sa)], [sb - sa, ogR(sb)]], { cell: CR, br: 1, rings: false }))); }
  const capSt = []; for (let i = 0; i <= 20; i++) { const s = D.LN * i / 20; capSt.push([s, ogR(s)]); }
  capSt.push([D.LN, 0]);
  BB.cap = mkB('cap', B => { B.lathe([0, 0, 0], ZA, [[0, 0]].concat(capSt), { cell: CR * 1.5, br: 1, rings: false }); B.ringP([0, 0, .002], XA, YA, RR, .9); B.ringP([0, 0, .002], XA, YA, D.rbore - .02, .7); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; B.ringP([Math.cos(a) * (RR - .045), Math.sin(a) * (RR - .045), .003], XA, YA, .014, .8); } });
  BB.bay = mkB('bay', B => {
    const zf = RL / 2 - D.LN;
    B.lathe([0, 0, zf - D.dbore], ZA, [[0, 0], [0, D.rbore], [D.dbore, D.rbore]], { cell: .012, br: .6, two: true, rings: false });
    B.ringP([0, 0, zf + .002], XA, YA, D.rbore, 1); B.ringP([0, 0, zf + .002], XA, YA, RR, .9);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; B.ringP([Math.cos(a) * (RR - .045), Math.sin(a) * (RR - .045), zf + .003], XA, YA, .014, .9); }
    B.lathe([0, 0, zf], ZA, [[0, D.rbore], [0, RR]], { cell: .012, br: .8, two: true, rings: false });
  });
  BB.fins = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, c = Math.cos(a), s = Math.sin(a), rm = (D.rcore + D.rs) / 2;
    BB.fins.push(mkB('fin', B => B.obox([c * rm, s * rm, -RL / 2 + D.LT / 2], [c, s, 0], [-s, c, 0], ZA, [(D.rs - D.rcore) / 2, .025, D.LT / 2 - .04], .012, { br: 1, edge: .9 })));
  }
  BB.stock = mkB('stk', B => {
    for (let sg = 0; sg < 4; sg++) for (let j = 0; j < 36; j++) {
      if (j % 6 === 0) continue;
      const a0 = (j - .5) / 36 * TAU, a1 = (j + .5) / 36 * TAU, zA = -RL / 2 + sg * D.LT / 4;
      const p0 = [Math.cos(a0) * D.rs, Math.sin(a0) * D.rs, zA], p1 = [Math.cos(a1) * D.rs, Math.sin(a1) * D.rs, zA];
      B.panel(p0, V.sub(p1, p0), [0, 0, D.LT / 4], CR, { n: [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], br: 1, edge: false, ch: 14, q: j + 36 * sg });
    }
  });
  S_.core = rodSet(D.rcore, 1);
  // the nose-cap robot (aisle side) and the shuttle that takes the cap to the mating station
  BB.arm6 = mkArm({ H: .9, L1: 1.25, L2: 1.2, LT: .5, r: .17 });
  BB.shuttle = mkB('sh', B => { B.box([-.6, .12, -.5], [.6, .5, .5], .04, { br: .9, edge: .8 }); B.box([-.45, .5, -.35], [-.3, .78, .35], .03, { br: .9 }); B.box([.3, .5, -.35], [.45, .78, .35], .03, { br: .9 }); B.knot([0, .52, .5], .08, 1, 3, 1013); });
}
const R6S = { oz: 0, part: 0, bore: 0, fin: 0, spin: 0, capT: 0 };
let R6HX = -8, R6HY = 2.6;
function r6State(u) {
  R6S.oz = RL / 2 - D.LN * kk(u, OGV[0], OGV[1]);          // the ogive front (rod frame): contoured above it
  R6S.part = kk(u, PART[0], PART[1]);
  R6S.bore = lin(u, BORE[0], BORE[1]);
  R6S.fin = 6 * lin(u, FINS[0], FINS[1]);
  R6S.spin = u < OGV[1] + .05 ? u * 3.4 : OGV[1] * 3.4 + Math.floor(R6S.fin) * TAU / 6 + (R6S.fin % 1 > .85 ? (R6S.fin % 1 - .85) / .15 * TAU / 6 : 0);
}
const SHUT_Z = u => u < 22.45 ? ZR.R6 - 1.2 : E.mix(ZR.R6 - 1.2, ZR.MT + 2.4, kk(u, 22.6, 40));
const SHUT_X = u => u < 40 ? XSH : E.mix(XSH, XFM + .9, kk(u, 40, 46));
const AP = [0, 0, 0], AD = [0, 0, 0], AB6 = [-3.0, 0, ZR.R6 - 1.9];
function drawR6(u) {
  const z = ZR.R6;
  L.draw(BB.r6, BWX, O.st);
  // the ram follows the cut: the nose (contouring, parting, boring), then the tail (fins)
  let hx, hy;
  if (u < FINS[0] - .05) { const xo = XR + R6S.oz; hx = u < OGV[1] ? xo + .1 : XR + RL / 2 - D.LN + .35; hy = YR + ogR(R6S.oz - (RL / 2 - D.LN)) + .87; }
  else { const k = R6S.fin % 1; hx = XR - RL / 2 + .05 + D.LT * (k < .85 ? k / .85 : 1 - (k - .85) / .15); hy = YR + D.rs + .86 + (k > .85 ? .25 : 0); }
  if (u < OGV[0] - .1) { hx = XR + RL / 2 + .4; hy = YR + 1.6; }
  hx = Math.min(hx, XR + RL / 2 + .6); R6HX = hx; R6HY = hy;
  at(XF4, BWX, hx, hy + .8, z - .0); L.draw(BB.ram, XF4, O.mc);
  at(XF4, BWX, hx, hy + .8, z, 1, R6S.spin * 4); L.draw(BB.spin, XF4, O.hero);
  // the slitting saw comes up from below at the nose's base
  if (u > PART[0] - .3 && u < PART[1] + .3) { const up = kk(u, PART[0] - .25, PART[0]) * (1 - kk(u, PART[1], PART[1] + .25)); at(XF4, BWX, XR + RL / 2 - D.LN, YR - RR - .45 + .5 * up * (.6 + .4 * R6S.part), z, 0, u * 40); L.draw(BB.saw, XF4, O.hero); }
  // the boring bar into the bay
  if (u > BORE[0] - .1 && u < BORE[1] + .2) { const d = Math.sin(PI * R6S.bore) * (D.dbore + .05), xf = XR + RL / 2 - D.LN; at2(XF4, BWX, xf + .65 + D.dbore - d, YR, z, 1, PI / 2, 2, u * 30); L.draw(BB.borer, XF4, O.hero); }
  // chips: off the ogive and the fins
  if (u > OGV[0] && u < OGV[1]) spray(u, OGV[0], OGV[1], 60, XR + R6S.oz, YR + ogR(R6S.oz - (RL / 2 - D.LN)), z - .05, .3, .8, -.5, .35, 1, 2.6, .45, WH, .95, 1, 31);
  if (u > PART[0] && u < PART[1]) spray(u, PART[0], PART[1], 60, XR + RL / 2 - D.LN, YR - RR, z, 0, -.4, -.9, .4, 2, 6, .35, GLC, 1, 1, 32);
  if (u > FINS[0] && u < FINS[1]) spray(u, FINS[0], FINS[1], 50, hx, YR + D.rs, z - .05, .2, .85, -.45, .35, 1, 2.4, .4, WH, .9, 1, 33);
}
const CAPW = [0, 0, 0], XSH = -3.3;
/* the nose cap's base centre (bay; its axis along +x): on the rod, carried to the shuttle, riding it */
function capPose(u) {
  const xf = XR + RL / 2 - D.LN, sz = SHUT_Z(u), sy = .5 + RR + .02, sx = SHUT_X(u) - D.LN / 2;
  if (u < 22.0) { CAPW[0] = xf; CAPW[1] = YR; CAPW[2] = ZR.R6; }
  else if (u < 22.4) { const w = kk(u, 22.0, 22.4); CAPW[0] = mix(xf + .02, sx, w); CAPW[1] = mix(YR, sy, w) + .5 * Math.sin(PI * w); CAPW[2] = mix(ZR.R6, sz, w); }
  else { CAPW[0] = sx; CAPW[1] = sy; CAPW[2] = sz; }
  return CAPW;
}

/* ---------------- R7 · the casing: five sections faced at their ends, slid over the core from the tail and orbit-welded
   joint by joint (in microgravity the core hangs in the headstock's collet by its ogive alone) ---------------- */
const CS0 = 24.55, CSD = .46, CSEND = CS0 + 5 * CSD;            // the first section's slot, each slot (a), the tail ring
const CSW = k => { const t0 = CS0 + k * CSD; return [t0, t0 + .12, t0 + .32, t0 + .33, t0 + .45]; };   // lift, push, weld
const XRK = 2.6;                                                 // the magazine behind the line (+z)
const R7S = { k: -1, ph: '', sx: 0, sy: 0, sz: 0, wx: 0, wOn: 0, fOn: 0, ldx: 0, ldz: 0 };
/* section k's centre on the core (bay x) and in the rack */
const secX = k => XR + D.zc1 - (k + .5) * D.secL;
const rackX = k => XR - RL / 2 + 1.2 + k * (D.secL + .35) + D.secL / 2;
const entX = () => XR - RL / 2 - .5 - D.secL / 2;
function buildR7() {
  const z = ZR.R7, xn = XR + RL / 2, xt = XR - RL / 2, rc = D.rcas, L_ = D.secL;
  BB.r7 = mkB('r7', B => {
    // the headstock: its body beyond the nose, the collet ring round the ogive's shoulder, its drive
    B.chunk('head'); bx(B, xn + .25, 0, z - 1.2, xn + 2.4, 3.1, z + 1.2, .07, { br: .85 });
    const xc = xn - D.LN * .55, rcol = ogR(D.LN * .45) + .06;
    B.lathe([xc, YR, z], XA, [[0, rcol], [0, rcol + .22], [D.LN * .55 + .3, rcol + .22], [D.LN * .55 + .3, .2]], { cell: .03, br: .95, seams: 12, rbr: .8 });
    bolts(B, [xc - .005, YR, z], YA, ZA, rcol + .14, 12, .025);
    motor(B, [xn + 2.4, 3.4, z], [xn + .6, 3.4, z], .32, { feet: true });
    // the entry: the facing ring's stand at the tail end, the pusher's rails, the magazine behind, the loader's beam
    B.chunk('entry'); bx(B, xt - .55, 0, z - .45, xt - .15, YR - rc - .32, z + .45, .04, { br: .85 });
    for (const dz of [-.95, -.65]) rail(B, [xt - L_ - 1.6, .2, z + dz], [xn - D.LN - .2, .2, z + dz], .05, .75);
    bx(B, xt - L_ - 1.7, 0, z - 1.1, xn - D.LN, .19, z - .5, .1, { br: .5 });
    B.chunk('rack');
    for (let k = 0; k <= 5; k++) { const x = XR - RL / 2 + 1.2 - .18 + k * (L_ + .35); bx(B, x - .08, 0, z + XRK - .7, x + .08, YR - rc - .05, z + XRK + .7, .03, { br: .8 }); B.ring([x, YR, z + XRK], YA, ZA, rc + .03, 16, .7, 0, 0, PI * .55, PI * 1.45); }
    bx(B, xt + .9, 0, z + XRK - .8, xt + 1.2 + 5 * (L_ + .35), .12, z + XRK + .8, .1, { br: .5 });
    B.chunk('beam'); for (const zz of [z - .2, z + XRK + .2]) bx(B, xt - L_ - 1.5, 4.9, zz - .12, xn - D.LN, 5.15, zz + .12, .04, { br: .75 });
    for (const x of [xt - L_ - 1.5, xn - D.LN]) for (const zz of [z - .2, z + XRK + .2]) B.tube([x, 0, zz], [x, 4.9, zz], .07, .6);
    // the welder's rail (aisle side, below), the hood over the joints with its duct
    B.chunk('wrail'); rail(B, [xt - .5, .55, z - 1.45], [xn - D.LN, .55, z - 1.45], .06, .8); bx(B, xt - .6, 0, z - 1.6, xn - D.LN + .1, .5, z - 1.3, .08, { br: .55 });
    hood(B, xt, xn - D.LN, z - 1.0, z + .9, 3.4, .5, .3, 11);
    B.knot([xn + 1.3, 3.2, z - 1.2], .1, 1, 3, 1018);
  }, .6);
  // a casing section (axis +Z from 0 to its length): the tube, its end rings, two fill ports on top, weld preps
  BB.sec = mkB('sec', B => {
    B.lathe([0, 0, 0], ZA, [[0, rc - .03], [0, rc + .03], [.06, rc + .03], [.06, rc], [L_ - .06, rc], [L_ - .06, rc + .03], [L_, rc + .03], [L_, rc - .03]], { cell: .035, br: .9, rbr: .85, seams: 12, sbr: .35 });
    B.lathe([0, 0, .04], ZA, [[0, rc - .03], [L_ - .08, rc - .03]], { cell: .06, br: .25, two: true, rings: false });
    for (const f of [.25, .75]) { const p = [0, rc, L_ * f]; B.cyl(p, [0, rc + .07, L_ * f], .07, { cell: .012, br: 1, caps: true }); B.ringP([0, rc + .071, L_ * f], XA, ZA, .045, .9); }
    for (let k = 1; k < 4; k++) B.ringP([0, 0, L_ * k / 4], XA, YA, rc + .004, .4);
  });
  BB.face = mkB('fc', B => {                                   // the facing ring (axis +Z): three tool posts inward
    B.lathe([0, 0, -.08], ZA, [[0, rc + .12], [0, rc + .3], [.16, rc + .3], [.16, rc + .12]], { cell: .025, br: .9, seams: 12 });
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.obox([Math.cos(a) * (rc + .07), Math.sin(a) * (rc + .07), 0], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], ZA, [.06, .04, .05], .01, { br: 1, edge: .9 }); }
  }, 1);
  BB.pushr = mkB('pr', B => {                                  // the push ring (axis +Z) on its carriage's arm (down to -y, toward -z)
    B.lathe([0, 0, -.1], ZA, [[0, rc - .02], [0, rc + .12], [.1, rc + .12], [.1, rc - .02]], { cell: .025, br: .95, seams: 8 });
    B.box([-.08, -(YR - .2), -.12], [.08, -rc - .1, .02], .03, { br: .9, edge: .85 });
    B.box([-.35, -(YR - .2) - .02, -.25], [.35, -(YR - .2) + .2, .25], .03, { br: .9, edge: .85 });
  }, 1);
  BB.orb = mkB('ob', B => {                                    // the orbital welder: a split ring on its rail carriage, the torch (local +y)
    B.lathe([0, 0, -.07], ZA, [[0, rc + .14], [0, rc + .26], [.14, rc + .26], [.14, rc + .14]], { cell: .025, br: .95, seams: 16 });
    B.box([-.14, -(YR - .55), -.18], [.14, -rc - .26, .18], .03, { br: .9, edge: .85 });
  }, 1);
  BB.jring = mkB('jr', B => { B.lathe([0, 0, -.03], ZA, [[0, rc + .032], [.06, rc + .032]], { cell: .015, br: 1.15, rbr: 1 }); }, 1);
  BB.torch = mkB('tc', B => { B.box([-.04, rc + .1, -.04], [.04, rc + .22, .04], .01, { br: 1, edge: .9 }); B.cyl([0, rc + .1, 0], [0, rc + .03, 0], .015, { cell: .004, br: 1 }); }, 1);
  BB.ldr = mkB('ld', B => { B.box([-.4, -.15, -.25], [.4, .15, XRK + .65], .03, { br: .9, edge: .85 }); B.box([-.25, -.45, -.2], [.25, -.15, .2], .03, { br: .9, edge: .85 }); }, 1);
}
function r7State(u) {
  const S = R7S; S.k = -1; S.wOn = 0; S.fOn = 0;
  S.ldx = rackX(0); S.ldz = ZR.R7 + XRK;
  for (let k = 0; k < D.NSEC; k++) {
    const [l0, l1, p1, w0, w1] = CSW(k);
    if (u < l0 - .06 || u > w1) continue;
    S.k = k;
    if (u < l0) { S.ph = 'reach'; const t = kk(u, l0 - .06, l0); S.ldx = mix(entX(), rackX(k), k ? t : 1); S.ldz = ZR.R7 + XRK; }
    else if (u < l1) { S.ph = 'lift'; const t = kk(u, l0, l1); S.sx = mix(rackX(k), entX(), t); S.sz = mix(ZR.R7 + XRK, ZR.R7, t); S.sy = YR + .7 * Math.sin(PI * t); S.ldx = S.sx; S.ldz = S.sz; }
    else if (u < p1) { S.ph = 'push'; const t = kk(u, l1, p1); S.sx = mix(entX(), secX(k), t); S.sy = YR; S.sz = ZR.R7; S.ldx = entX(); S.ldz = ZR.R7;
      const tail = S.sx - D.secL / 2, xf = XR - RL / 2 - .35; S.fOn = tail < xf && tail > xf - D.secL ? 1 : 0; }
    else { S.ph = 'weld'; S.sx = secX(k); S.sy = YR; S.sz = ZR.R7; S.wOn = ss(w0, w0 + .02, u) * (1 - ss(w1 - .02, w1, u)); S.ldx = entX(); S.ldz = ZR.R7; }
  }
  // the welder: parked at the tail, to each new joint (the section's front), the tail ring at the end
  const jx = k => XR + D.zc1 - k * D.secL;
  let wx = XR - RL / 2 - .2;
  for (let k = 0; k < D.NSEC; k++) { const [, , p1, w0] = CSW(k); if (u > p1 - .1) wx = u < w0 ? mix(wx, jx(k), kk(u, p1 - .1, w0)) : jx(k); }
  if (u > CSEND - .05) { wx = u < CSEND + .03 ? mix(wx, XR + D.zc0, kk(u, CSEND - .05, CSEND + .03)) : XR + D.zc0; if (u > CSEND + .03 && u < CSEND + .17) S.wOn = ss(CSEND + .03, CSEND + .05, u) * (1 - ss(CSEND + .15, CSEND + .17, u)); }
  S.wx = wx;
}
/* the sections not yet on the core: on the rack, in the loader, sliding on */
const nSecOn = u => { let n = 0; for (let k = 0; k < D.NSEC; k++) if (u > CSW(k)[2]) n++; return n; };
function drawR7(u) {
  const z = ZR.R7, S = R7S, rc = D.rcas;
  L.draw(BB.r7, BWX, O.st);
  if (u < 27.2) for (let k = 0; k < D.NSEC; k++) {
    const [l0, , p1] = CSW(k);
    if (u >= l0 && u <= p1) continue;                          // (the moving one below; the placed ones ride the piece)
    if (u < l0) { atL(XF4, BWX, rackX(k) - D.secL / 2, YR, z + XRK, 1, 0, 0, 0, 1, 0); L.draw(BB.sec, XF4, O.heroD); }
  }
  if (S.k >= 0 && (S.ph === 'lift' || S.ph === 'push')) { atL(XF4, BWX, S.sx - D.secL / 2, S.sy, S.sz, 1, 0, 0, 0, 1, 0); L.draw(BB.sec, XF4, O.hero); }
  // the loader's carriage and its two hooks
  const lx = S.ldx, lz = S.ldz, hy = S.ph === 'lift' ? S.sy + rc + .05 : YR + rc + 1.2;
  at(XF4, BWX, lx, 5.4, lz - XRK / 2 + .1); L.draw(BB.ldr, XF4, O.mc);
  for (const dx of [-.6, .6]) { apX(BWX, lx + dx, 4.95, lz, PW); apX(BWX, lx + dx, hy, lz, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, WH, .7); }
  // the push ring behind the moving section
  const px = S.ph === 'push' ? S.sx - D.secL / 2 - .02 : entX() - D.secL / 2 - .4;
  atL(XF4, BWX, px, YR, z, 1, 0, 0, 0, 1, 0); L.draw(BB.pushr, XF4, O.mc);
  // the facing ring turns while a section's end passes through it; its chips fly up into the hood
  const xf = XR - RL / 2 - .35;
  at2(XF4, BWX, xf, YR, z, 1, PI / 2, 2, S.fOn ? U_ * 9 : 0); L.draw(BB.face, XF4, O.mc);
  if (S.fOn) for (let k = 0; k < 3; k++) spray(u, CSW(S.k)[1], CSW(S.k)[2], 40, xf, YR + Math.cos(k * 2.1 + U_ * 9) * (rc + .05), z + Math.sin(k * 2.1 + U_ * 9) * (rc + .05), 0, .85, -.4, .4, 1.2, 3, .4, WH, .9, -1, 61 + k);
  // the orbital welder at its joint: the torch orbits, the joint glows, sparks up into the hood
  at2(XF4, BWX, S.wx, YR, z, 1, PI / 2, -1, 0); L.draw(BB.orb, XF4, O.mc);
  const ta = U_ * 5.5;
  at2(XF4, BWX, S.wx, YR, z, 1, PI / 2, 2, ta); L.draw(BB.torch, XF4, O.hero);
  if (S.wOn > .02) {
    const c = Math.cos(ta), s = Math.sin(ta);
    apX(BWX, S.wx, YR + c * (rc + .03), z + s * (rc + .03), PW); K.glowW(PW[0], PW[1], PW[2], 46, HOT, .7 * S.wOn); K.glowW(PW[0], PW[1], PW[2], 14, [255, 255, 255], S.wOn); K.glowW(PW[0], PW[1], PW[2], 30, LIME, .25 * S.wOn);
    for (let k = 0; k < 72; k++) { const a = k / 72 * TAU; if (((ta - a) % TAU + TAU) % TAU > TAU * .9) continue; apX(BWX, S.wx, YR + Math.cos(a) * (rc + .032), z + Math.sin(a) * (rc + .032), PW); K.dotW(PW[0], PW[1], PW[2], 2, GLC, .8 * S.wOn); }
    spray(u, CS0, CSEND + .2, 90, S.wx, YR + c * (rc + .03), z + s * (rc + .03), .1, .75 + .2 * c, .3 * s, .45, 1.5, 4.5, .55, GLC, S.wOn, -1.6, 71);
    spray(u, CS0, CSEND + .2, 40, S.wx, YR + rc + .2, z, 0, 1, 0, .12, 2.5, 4, 1.1, GLC, .5 * S.wOn, -2.2, 72);
  }
}

/* ---------------- R8 · the fill bay and the curing oven: the fill mixed in three vessels on the mezzanine, poured
   through the casing's ports (a closed casing, shown only by the level along it), then cured in a split oven ---------------- */
const MIX = [27.6, 28.2], FL = [28.15, 29.0], CU = [29.15, 30.55];
const MXX = [-5.2, 0, 5.2], YMZ = 4.6;                          // the vessels (x from the bar's centre), the mezzanine's deck
const R8S = { mix: 0, fill: 0, heat: 0, close: 0, head: 0 };
function buildR8() {
  const z = ZR.R8, xa = XR - RL / 2, xb = XR + RL / 2, zm = z + 3.1, ol = RL + 2.2, ow = 1.7, oh = 3.0;
  BB.r8 = mkB('r8', B => {
    // the cradle: three yokes under the round (it is held at its tail ring and nose)
    for (const x of [xa + .6, XR, xb - D.LN - .4]) { B.chunk('yoke'); bx(B, x - .25, 0, z - .6, x + .25, YR - D.rcas - .05, z + .6, .04, { br: .85 }); B.ring([x, YR, z], YA, ZA, D.rcas + .05, 16, .8, 0, 0, PI * .6, PI * 1.4); }
    // the mezzanine: columns, its deck and railing, a stair
    B.chunk('mez');
    for (const x of [xa - 1, XR, xb + 1]) for (const zz of [zm - 1.6, zm + 1.6]) B.tube([x, 0, zz], [x, YMZ, zz], .1, .65);
    B.panel([xa - 1, YMZ, zm - 1.6], [0, 0, 3.2], [RL + 2, 0, 0], .2, { n: YA, br: .4, edge: .8, two: true, seams: [10, 2], sbr: .3 });
    railing(B, [[xa - 1, YMZ, zm - 1.6], [xb + 1, YMZ, zm - 1.6]], 1.0);
    ladder(B, [xb + 1.3, 0, zm], [xb + 1.3, YMZ + 1, zm], .5);
    // the vessels: jacketed shells on legs, dished heads, outlet valves, the agitators' gearboxes and motors
    for (const dx of MXX) {
      const x = XR + dx; B.chunk('vsl');
      B.lathe([x, YMZ + .5, zm], YA, [[0, .12], [.35, .85], [2.2, .85], [2.45, .6], [2.5, 0]], { cell: .05, br: .55, two: true, rings: true, rbr: .8, seams: 12, sbr: .3 });
      B.lathe([x, YMZ + .9, zm], YA, [[0, .92], [1.5, .92]], { cell: .08, br: .3, two: true, rings: false });
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; B.tube([x + Math.cos(a) * .8, YMZ, zm + Math.sin(a) * .8], [x + Math.cos(a) * .85, YMZ + 1.0, zm + Math.sin(a) * .85], .05, .6); }
      bx(B, x - .22, YMZ + 3.0, zm - .22, x + .22, YMZ + 3.35, zm + .22, .03, { br: .9 }); motor(B, [x, YMZ + 3.35, zm], [x, YMZ + 3.95, zm], .17, { up: ZA });
      B.cyl([x, YMZ + .5, zm], [x, YMZ - .2, zm], .07, { cell: .015, br: .85 }); B.ringP([x, YMZ - .2, zm], XA, ZA, .1, .9);
      B.ringP([x + .86, YMZ + 1.6, zm], [0, 0, 1], YA, .1, .9); B.ringP([x + .86, YMZ + 1.6, zm], [0, 0, 1], YA, .07, .5);           // a sight glass
      B.knot([x + .4, YMZ + 3.05, zm - .5], .06, 1, 3, lightQ(7, 'R8', 4 + (dx > 0 ? 2 : dx < 0 ? 0 : 1)));
    }
    // the manifold under the deck, the drop pipes to the pour bridge over the round, its five heads' slides
    B.chunk('pipe'); pipe(B, [[XR + MXX[0], YMZ - .2, zm], [XR + MXX[0], YMZ - .5, zm], [XR + MXX[2], YMZ - .5, zm], [XR + MXX[2], YMZ - .2, zm]], .06, .7);
    pipe(B, [[XR, YMZ - .5, zm], [XR, YMZ - .5, z + .6], [XR, 3.6, z + .6]], .06, .7);
    bx(B, xa - .3, 3.55, z + .35, xb - D.LN, 3.8, z + .85, .04, { br: .85 });
    for (const x of [xa - .3, xb - D.LN]) B.tube([x, 0, z + .6], [x, 3.55, z + .6], .07, .6);
    // the oven's rails both sides, its control cabinet, the heat exchanger
    B.chunk('orail'); for (const zz of [z - 2.3, z + 2.3]) for (const dz of [-.55, .55]) rail(B, [xa - 1.4, .05, zz + dz], [xb + 1.0, .05, zz + dz], .06, .7);
    cab(B, [xb + 1.6, 0, z - 2.2], [xb + 2.6, 2.3, z - .2], { front: 'x+', st: 'R8', id: 'r8', screen: [.3, 1.25, 1.7, 1.9], gauges: [[.5, .95, .09], [.9, .95, .09]], estop: [1.6, 1.0] });
  }, .6);
  // an oven half (its open side toward the round, -z: local -Z), heaters lining it (lit with the cure)
  BB.ovH = mkB('ovh', B => {
    const x0 = -ol / 2, x1 = ol / 2;
    B.chunk('box');
    B.panel([x0, 0, 0], [ol, 0, 0], [0, oh, 0], .12, { n: ZA, br: .7, edge: .8, seams: [12, 3], sbr: .35 });
    B.panel([x0, oh, -ow], [ol, 0, 0], [0, 0, ow], .12, { n: YA, br: .75, edge: .8, seams: [12, 2], sbr: .3 });
    for (const x of [x0, x1]) B.panel([x, 0, -ow], [0, 0, ow], [0, oh, 0], .1, { n: [x < 0 ? -1 : 1, 0, 0], br: .65, edge: .8 });
    for (let k = 0; k <= 12; k++) B.line([x0 + k * ol / 12, 0, .005], [x0 + k * ol / 12, oh, .005], .45);
    B.chunk('heat'); for (let j = 0; j < 4; j++) B.tube([x0 + .3, .5 + j * .65, -.15], [x1 - .3, .5 + j * .65, -.15], .03, .8, 20, j);
    for (const x of [x0 + .5, x1 - .5]) { B.cyl([x, .0, -ow * .5], [x, -.15, -ow * .5], .14, { cell: .02, br: .85, caps: true }); }
    motor(B, [x1 - .3, oh + .3, -ow * .5], [x1 - 1.2, oh + .3, -ow * .5], .14, {}); B.box([x0 + 1, oh, -.6], [x0 + 2.2, oh + .45, -.2], .03, { br: .85, edge: .85 });
  }, .6);
  BB.agit = mkB('ag', B => { B.cyl([0, 0, 0], [0, 0, 2.4], .04, { cell: .01, br: .95 }); for (const zz of [.5, 1.4]) for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.obox([Math.cos(a) * .32, Math.sin(a) * .32, zz], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), .3], ZA, [.28, .02, .08], .01, { br: 1, edge: .9 }); } }, 1);
  BB.phead = mkB('ph', B => { B.box([-.12, 0, -.12], [.12, .5, .12], .02, { br: .95, edge: .85 }); B.cyl([0, 0, 0], [0, -.14, 0], .05, { cell: .008, br: 1, caps: true }); B.ringP([0, -.14, 0], XA, ZA, .06, .9); }, 1);
  S_.fill = rodSet(D.rcas - .045, .9);
}
function r8State(u) {
  R8S.mix = ss(MIX[0], MIX[0] + .1, u) * (1 - ss(FL[1], FL[1] + .1, u));
  R8S.fill = lin(u, FL[0], FL[1]);
  R8S.close = kk(u, CU[0], CU[0] + .25) * (1 - kk(u, CU[1] - .2, CU[1]));
  R8S.heat = ss(CU[0] + .25, CU[0] + .45, u) * (1 - ss(CU[1] - .45, CU[1] - .2, u));
  R8S.head = kk(u, FL[0] - .12, FL[0]) * (1 - kk(u, FL[1], FL[1] + .12));
}
const PORTZ = [];                                              // the fill ports (rod frame z)
function drawR8(u) {
  const z = ZR.R8, zm = z + 3.1, ow = 1.7, gap = .25;
  L.draw(BB.r8, BWX, O.st);
  // the agitators turning (the vessels are drawn faint: the swirl seen through them)
  for (const dx of MXX) spin(BB.agit, [XR + dx, YMZ + 3.0, zm], [0, -1, 0], U_ * 4 * R8S.mix + dx, O.mc);
  if (R8S.mix > .02) for (const dx of MXX) for (let i = 0; i < 70; i++) {
    const j = (i * 13 + 7 + (dx + 6) * 31) & 8191, r = .1 + .7 * RND[j], a = RND[(j + 1) & 8191] * TAU + U_ * (1.5 + 2 / r) * R8S.mix, y = YMZ + .9 + 1.6 * RND[(j + 2) & 8191];
    apX(BWX, XR + dx + Math.cos(a) * r, y, zm + Math.sin(a) * r, PW); K.dotW(PW[0], PW[1], PW[2], 1, WH, .5 * R8S.mix);
  }
  // the pour heads down onto the ports, the fill's packets down the drop pipe and along the bridge
  if (!PORTZ.length) for (let k = 0; k < D.NSEC; k++) for (const f of [.25, .75]) PORTZ.push(D.zc1 - (k + 1) * D.secL + D.secL * f);
  const hy = YR + D.rcas + .08 + (3.4 - YR - D.rcas) * (1 - R8S.head);
  for (let i = 0; i < PORTZ.length; i += 2) { at(XF4, BWX, XR + PORTZ[i], hy + .14, z); L.draw(BB.phead, XF4, O.mc); apX(BWX, XR + PORTZ[i], 3.55, z + .3, PW); apX(BWX, XR + PORTZ[i], hy + .64, z, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, WH, .7); }
  if (R8S.fill > 0 && R8S.fill < 1) {
    for (let i = 0; i < 30; i++) { const ph = (i / 30 + U_ * .9) % 1; let x, y, zz; if (ph < .3) { x = XR; y = YMZ - .5 - (YMZ - 4.1) * ph / .3; zz = mix(zm, z + .6, ph / .3); } else { const q = (ph - .3) / .7, tgt = PORTZ[(i * 2) % PORTZ.length]; x = XR + tgt * q; y = 3.67; zz = z + .6; } apX(BWX, x, y, zz, PW); K.dotW(PW[0], PW[1], PW[2], 2, LIME, .9); }
  }
  // the split oven: the halves roll in from both sides, the heaters glow with the cure
  const zo = (1 - R8S.close) * 2.6 + gap * R8S.close;
  O.mcx.keep = .85 - .5 * R8S.close; O.mcx.a = .9 - .4 * R8S.close;
  atL(XF4, BWX, XR, 0, z + ow + zo, 0, 0, 1, 0, 1, 0); L.draw(BB.ovH, XF4, R8S.close > .02 ? O.mcx : O.st);
  atL(XF4, BWX, XR, 0, z - ow - zo, 0, 0, -1, 0, 1, 0); L.draw(BB.ovH, XF4, R8S.close > .02 ? O.mcx : O.st);
  if (R8S.heat > .02) { GLC3[1] = 120 + 60 * R8S.heat; GLC3[2] = 60 + 40 * R8S.heat; for (let i = 0; i <= 8; i++) { apX(BWX, XR - RL / 2 + RL * i / 8, YR + .3, z, PW); K.glowW(PW[0], PW[1], PW[2], 90, GLC3, .14 * R8S.heat); } }
}

/* ---------------- the mating station and the port elevator: up to the port, out to the chamber ---------------- */
let XMO = -2, XFM = 0;                                        // the round's centre at the station (on the port's axis), its nose
const LIFT = [64.3, 65.8], SAB = [65.9, 66.55], ARMT = [66.4, 66.85], PUSH = [66.9, 69.95];
const INSP = [58.45, 61.55, 61.75, 63.6];                       // the inspection ring: the X-ray pass, then the scan back
let ZCH = -46, ZCOL = -1;                                      // the chamber (the round's seat), the column's turning station (z)
const RX = mkX();
/* the lift: the travelling column carries the round up, back from the wall, turns it once round (the turntable) and on
   to the bore's axis (nose to the chamber) at the port's height; then it slides out through the port to its seat */
const liftK = u => lin(u, LIFT[0], LIFT[1]);
const elevY = u => { const k = liftK(u); return YR + (9 - YR) * kk(k, 0, .3) + 7 * kk(k, .3, .8) + (PORT[1] - 16 - YR + YR) * kk(k, .8, 1); };
const elevZ = u => ZR.MT + (ZCOL - ZR.MT) * kk(liftK(u), .18, .48);
const elevA = u => PI / 2 + (PI / 2 + TAU) * kk(liftK(u), .38, .97);
function roundAt(u) {
  const p = u < PUSH[0] ? 0 : u > PUSH[1] ? 1 : E.inOut(lin(u, PUSH[0], PUSH[1])), z = elevZ(u);
  return at(RX, BWX, XMO, elevY(u), z + (ZCH - z) * p, 1, elevA(u));
}
function buildMT() {
  const z = ZR.MT, rc = D.rcas; XMO = PORT[0]; XFM = XMO + RL / 2;
  ZCOL = Math.max(ZR.MT, Math.min(2.4, HALL.z0 + RL / 2 + 1.1));
  BB.mt = mkB('mt', B => {
    // the column's floor rails (from the station back to the turning point), the port's head on the wall
    for (const s of [-1, 1]) { B.chunk('rail'); rail(B, [XMO + s * .9, .02, z - 1.6], [XMO + s * .9, .02, ZCOL + 1.6], .12, .8); }
    bx(B, XMO - 1.3, 0, z - 1.7, XMO + 1.3, .08, ZCOL + 1.7, .1, { br: .4, plain: true });
    B.chunk('head'); bx(B, XMO - 2.4, PORT[1] - 3.4, HALL.z0 + .05, XMO + 2.4, PORT[1] - 2.7, HALL.z0 + 1.2, .05, { br: .85 });
    for (let k = 0; k < 6; k++) B.knot([XMO + 2.6, 2 + k * 3.4, HALL.z0 + .6], .1, 1, 3, 1015 + k);
    // the inspection ring's rails along the round (both sides)
    for (const s of [-1, 1]) rail(B, [XMO - RL / 2 - 1.5, .02, z + s * 1.3], [XMO + RL / 2 + 1.5, .02, z + s * 1.3], .1, .75);
  });
  // the column: a carriage on the rails, four telescoping stages, the slewing head under the saddle
  BB.colBase = mkB('cb', B => { B.box([-1.2, 0, -1.2], [1.2, .55, 1.2], .05, { br: .9, edge: .8 }); detailBox(B, [-1.2, 0, -1.2], [1.2, .55, 1.2]); for (const s of [-1, 1]) for (const zz of [-.9, .9]) B.cyl([s * .9, .08, zz - .15], [s * .9, .08, zz + .15], .08, { cell: .012, br: .9, caps: true }); motor(B, [1.25, .3, -.6], [1.25, .3, .4], .14, {}); B.knot([-1.0, .6, 1.0], .07, 1, 3, 1021); }, .6);
  BB.colSt = [0, 1, 2, 3].map(i => mkB('cs', B => { const r = .55 - i * .1; B.cyl([0, 0, 0], [0, 5.2, 0], r, { cell: .04, br: .85 - i * .03, rings: true, seams: 8, sbr: .35 }); B.ringP([0, 5.18, 0], XA, ZA, r + .03, .9); }, .6));
  BB.slew = mkB('sw', B => { B.cyl([0, -.62, 0], [0, -.3, 0], .8, { cell: .03, br: .9, caps: true, seams: 12 }); for (let k = 0; k < 48; k++) { const t = k / 48 * TAU; B.line([Math.cos(t) * .8, -.46, Math.sin(t) * .8], [Math.cos(t) * .86, -.46, Math.sin(t) * .86], .55); } motor(B, [.95, -.2, -.3], [.95, -.6, -.3], .12, { up: ZA }); }, .6);
  BB.saddle = mkB('sd', B => {                                // turns with the round (its +Z along the round)
    for (const zz of [-RL * .3, RL * .25]) { B.box([-.4, -rc - .4, zz - .3], [.4, -rc - .05, zz + .3], .03, { br: .9, edge: .85 }); B.ring([0, 0, zz], XA, YA, rc + .05, 16, .8, 0, 0, PI * 1.1, PI * 1.9); }
    B.box([-.25, -rc - .5, -RL * .3], [.25, -rc - .3, RL * .25], .03, { br: .85, edge: .8 });
    for (const zz of [-RL * .3, RL * .25]) for (const s of [-1, 1]) {
      const a = PI * 1.5 + s * .5, cx = Math.cos(a) * (rc + .06), cy = Math.sin(a) * (rc + .06);
      B.cyl([cx, cy, zz - .14], [cx, cy, zz + .14], .06, { cell: .01, br: .95, caps: true });
      B.line([s * .4, -rc - .25, zz], [s * (rc + .12), 0, zz], .8); B.cyl([s * .4, -rc - .35, zz], [s * .42, -rc - .05, zz + .1], .035, { cell: .008, br: .85 });
    }
  });
  // the inspection ring: a source and a detector arc in a ring round the round, on two carriages
  const ri = rc + .55;
  BB.insp = mkB('ir', B => {
    B.lathe([-.25, 0, 0], XA, [[0, ri], [0, ri + .35], [.5, ri + .35], [.5, ri]], { cell: .04, br: .9, seams: 16, sbr: .4, rbr: .8 });
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; B.knot([.26, Math.cos(a) * (ri + .18), Math.sin(a) * (ri + .18)], .025, .8); }
    B.box([-.3, ri - .1, -.3], [.3, ri + .55, .3], .03, { br: 1, edge: .9 });              // the source's housing (top)
    for (const s of [-1, 1]) { B.box([-.2, -(YR), s * 1.3 - .2], [.2, -ri * .4, s * 1.3 + .2], .03, { br: .85, edge: .85 }); B.box([-.4, -YR, s * 1.3 - .35], [.4, -YR + .25, s * 1.3 + .35], .03, { br: .9 }); }
  }, .6);
  // the sabot: three petals (a sleeve round the casing, tapered at the front) and the armature's disc pack behind them
  const ri_ = rc + .02, ro = Math.max(SABR, rc + .25), z0 = -SABL / 2, zt = z0 + SABL - Math.min(3.2, SABL * .16), z1 = z0 + SABL, rt = rc + .3, NF_ = 14;
  BB.petals = [];
  for (let k = 0; k < NPET; k++) BB.petals.push(mkB('pt', B => {
    const a0 = k / NPET * TAU + .04, a1 = (k + 1) / NPET * TAU - .04, P_ = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    for (let f = 0; f < NF_; f++) {
      const b0 = a0 + (a1 - a0) * f / NF_, b1 = a0 + (a1 - a0) * (f + 1) / NF_, bm = (b0 + b1) / 2, n = [Math.cos(bm), Math.sin(bm), 0];
      B.panel(P_(b0, ro, z0), V.sub(P_(b1, ro, z0), P_(b0, ro, z0)), [0, 0, zt - z0], .05, { n, br: .85, edge: false });
      const t0 = P_(b0, ro, zt), t1 = P_(b1, ro, zt), t2 = P_(b0, rt, z1);
      B.panel(t0, V.sub(t1, t0), V.sub(t2, t0), .05, { n: V.norm([n[0] * 1.6, n[1] * 1.6, ro - rt]), br: .85, edge: false });
      B.panel(P_(b0, ri_, z0), V.sub(P_(b1, ri_, z0), P_(b0, ri_, z0)), [0, 0, SABL], .08, { n: [-n[0], -n[1], 0], br: .3, edge: false });
      B.panel(P_(b0, ri_, z0), V.sub(P_(b1, ri_, z0), P_(b0, ri_, z0)), V.sub(P_(b0, ro, z0), P_(b0, ri_, z0)), .05, { n: [0, 0, -1], br: .7, edge: false, two: true });
    }
    for (const a of [a0, a1]) { B.panel(P_(a, ri_, z0), V.sub(P_(a, ro, z0), P_(a, ri_, z0)), [0, 0, zt - z0], .04, { n: [-Math.sin(a), Math.cos(a), 0], br: .7, two: true, edge: .9 }); B.line(P_(a, ro, zt), P_(a, rt, z1), .9); }
    for (let j = 0; j <= 6; j++) B.ring([0, 0, z0 + (zt - z0) * j / 6], XA, YA, ro * 1.003, 20, j % 3 ? .55 : .8, 18, 1, a0, a1);
    B.ring([0, 0, zt], XA, YA, ro * 1.003, 20, .9, 18, 1, a0, a1); B.ring([0, 0, z1], XA, YA, rt, 12, .9, 18, 1, a0, a1);
  }, 1));
  BB.armat = mkB('am', B => { B.lathe([0, 0, z0 - ARML], ZA, [[0, .3], [0, ro * .99], [ARML, ro * .99], [ARML, .3]], { cell: .04, br: .95, seams: 16, rbr: .8 }); for (let k = 1; k < 6; k++) B.ringP([0, 0, z0 - ARML + k * ARML / 6], XA, YA, ro, .55); });
}
/* the inspection ring's x and what it shows: the X-ray pass tail to nose, the lime scan back */
const INS = { x: 0, xr: 0, sc: 0 };
function inspState(u) {
  const x0 = XMO - RL / 2 - 1.0, x1 = XMO + RL / 2 + .6;
  INS.x = u < INSP[0] ? x0 : u < INSP[1] ? mix(x0, x1, kk(u, INSP[0], INSP[1])) : u < INSP[2] ? x1 : u < INSP[3] ? mix(x1, x0, kk(u, INSP[2], INSP[3])) : x0;
  INS.xr = ss(INSP[0] - .1, INSP[0] + .15, u) * (1 - ss(INSP[1] + .05, INSP[2], u));
  INS.sc = ss(INSP[2] - .05, INSP[2] + .1, u) * (1 - ss(INSP[3] - .1, INSP[3] + .05, u));
}
function drawMT(u) {
  const z = elevZ(u), y = elevY(u), a = elevA(u);
  L.draw(BB.mt, BWX, O.st);
  at(XF4, BWX, XMO, 0, z); L.draw(BB.colBase, XF4, O.mc);
  const top = y - D.rcas - .95;
  const ext = Math.max(0, top - 5.7);
  for (let i = 0; i < 4; i++) { at(XF4, BWX, XMO, top - 5.2 - ext * (1 - i / 3), z); L.draw(BB.colSt[i], XF4, O.mc); }
  at(XF4, BWX, XMO, y - D.rcas - .05, z, 1, a); L.draw(BB.slew, XF4, O.mc);
  if (u < PUSH[0] + .4) { at(XF4, BWX, XMO, y, z, 1, a); L.draw(BB.saddle, XF4, O.mc); }
  // the inspection ring
  if (u > INSP[0] - 2 && u < INSP[3] + 1.5) {
    at(XF4, BWX, INS.x, YR, ZR.MT); L.draw(BB.insp, XF4, O.mc);
    const ri = D.rcas + .5;
    if (INS.xr > .02) {                                       // the source's fan through the round onto the detector arc
      for (let k = -4; k <= 4; k++) { const b = PI * 1.5 + k * .09; apX(BWX, INS.x, YR + ri + .1, ZR.MT, PW); apX(BWX, INS.x, YR + Math.sin(b) * ri, ZR.MT + Math.cos(b) * ri, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 3, 1, LIME, .35 * INS.xr); }
      apX(BWX, INS.x, YR + ri + .1, ZR.MT, PW); K.glowW(PW[0], PW[1], PW[2], 20, LIME, .6 * INS.xr);
    }
    if (INS.sc > .02) for (let k = 0; k < 96; k++) { const b = k / 96 * TAU; apX(BWX, INS.x + .02, YR + Math.cos(b) * (D.rcas + .012), ZR.MT + Math.sin(b) * (D.rcas + .012), PW); K.dotW(PW[0], PW[1], PW[2], 2, LIME, INS.sc); }
  }
  drawSabot(u);
}
const XPT = mkX();
/* the petals float in from three sides (an exploded view closing), lime at their seams as they lock; the disc pack
   slides on behind */
function drawSabot(u) {
  if (u < SAB[0] - .3) return;
  const R_ = roundAt(u), d0 = 2.2 + 1.6 * SABR;
  for (let k = 0; k < NPET; k++) {
    const t = kk(u, SAB[0] + k * .12, SAB[1] - (2 - k) * .1), d = d0 * (1 - t) * (1 - t), am = (k + .5) / NPET * TAU, tw_ = .5 * (1 - t);
    if (u < SAB[0] + k * .12 - .25) continue;
    at2(XPT, R_, Math.cos(am) * d, Math.sin(am) * d, (1 - t) * (k - 1) * .8, 2, tw_ * (k - 1), -1, 0);
    O.pet.lime = t > .97 ? .55 * (1 - kk(u, SAB[1], SAB[1] + .5)) : .15 * (1 - t);
    L.draw(BB.petals[k], XPT, O.pet);
  }
  if (u > ARMT[0] - .2) { const t = kk(u, ARMT[0], ARMT[1]); at(XPT, R_, 0, 0, -2.2 * (1 - t)); L.draw(BB.armat, XPT, O.mc); }
}

/* ======================== the rod line's dressing (built once) and live parts ======================== */
const helix = (B, c, r, h, turns, br) => { const P = [], n = Math.round(turns * 16); for (let k = 0; k <= n; k++) { const t = k / 16 * TAU; P.push([c[0] + Math.cos(t) * r, c[1] + h * k / n, c[2] + Math.sin(t) * r]); } B.poly(P, false, br || .6); };
/* R1 · the powder line: weigh hopper on load cells, rotary valve, auger in a windowed trough, vibrating bed on coil
   springs with two unbalanced motors, a dust hood, the control cabinet (fill weight trace) */
function dressR1() {
  const z = ZR.R1, xe = XR + D.Lb / 2, tx = xe + 2.25;
  BB.r1x = mkB('r1x', B => {
    zone(B, -17.8, .3, -3.4, 4.9);
    cab(B, [-17.5, 0, .7], [-16.2, 2.1, 4.3], { front: 'x+', st: 'R1', id: 'r1', screen: [1.3, 1.15, 2.4, 1.75], gauges: [[.45, 1.5, .1], [.8, 1.5, .1]], estop: [3.0, 1.45] });
    B.chunk('bed');
    for (let k = 0; k < 6; k++) { const x = XR - D.Lb / 2 + k * D.Lb / 5; for (const dz of [-.5, .5]) helix(B, [x, 0, z + dz], .065, .2, 4, .7); }
    for (const dz of [-.71, .71]) for (const y of [.26, .44]) B.line([XR - D.Lb / 2 - .3, y, z + dz], [XR + D.Lb / 2 + .3, y, z + dz], .45);
    for (let x = XR - D.Lb / 2 - .2; x < XR + D.Lb / 2 + .3; x += .45) B.line([x, .5, z - .71], [x, .2, z - .71], .3);
    for (let k = 0; k < 4; k++) { const x = XR - D.Lb / 2 + .8 + k * (D.Lb - 1.6) / 3; for (const s of [-1, 1]) { B.box([x - .06, YR - .05, z + s * .5 - .05], [x + .06, YR + .25, z + s * .5 + .05], .02, { br: .9, edge: .85 }); B.line([x, YR + .25, z + s * .5], [x, YR + .1, z + s * (D.rb + .06)], .8); } }
    for (const x of [XR - 2.2, XR + 2.2]) for (const s of [-1, 1]) motor(B, [x, .18, z + s * 1.25], [x, .18, z + s * .78], .13, { up: YA });
    B.chunk('tank');
    for (const [dx, dz] of [[.8, .8], [-.8, .8], [.8, -.8], [-.8, -.8]]) { B.box([tx + dx - .12, 0, z + dz - .12], [tx + dx + .12, .14, z + dz + .12], .02, { br: .9, edge: .85 }); B.knot([tx + dx, .16, z + dz], .05, 1, 3, lightQ(7, 'R1', 3)); }
    B.lathe([tx, 2.2, z], YA, [[0, .82], [.3, .82]], { cell: .04, br: .7, rbr: .9 });
    bolts(B, [tx, 2.52, z], XA, ZA, .84, 20, .03);
    B.box([tx - .2, 1.25, z - .22], [tx + .2, 1.55, z + .22], .03, { br: .9, edge: .85 });              // the rotary valve
    motor(B, [tx, 1.4, z + .62], [tx, 1.4, z + .24], .1, { up: YA });
    pipe(B, [[tx, 3.75, z], [tx, 6.2, z], [tx + .2, 7.0, z - .6], [tx + .2, 12, z - .6]], .12, .55);       // the powder supply from the silo deck
    B.cyl([tx + .35, 3.72, z + .3], [tx + .35, 3.95, z + .3], .05, { cell: .01, br: .95, caps: true }); B.line([tx + .35, 3.72, z + .3], [tx + .35, 2.3, z + .3], .6);
    B.cyl([tx - .45, 3.72, z - .25], [tx - .45, 4.35, z - .25], .14, { cell: .02, br: .8, caps: true, seams: 6 });    // the filter
    for (const [dx, dz] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) B.tube([tx + dx, 0, z + dz], [tx + dx, 3.85, z + dz], .035, .55);
    B.chunk('plat');
    for (let k = -5; k <= 5; k++) { B.line([tx - 1.1, 3.85, z + k * .22], [tx + 1.1, 3.85, z + k * .22], .3); B.line([tx + k * .22, 3.85, z - 1.1], [tx + k * .22, 3.85, z + 1.1], .22); }
    railing(B, [[tx - 1.1, 3.85, z - 1.1], [tx + 1.1, 3.85, z - 1.1], [tx + 1.1, 3.85, z + 1.1], [tx - 1.1, 3.85, z + 1.1]], 1.0);
    ladder(B, [tx + 1.25, 0, z + .6], [tx + 1.25, 4.8, z + .6], .45);
    B.chunk('auger');
    motor(B, [xe + 4.45, YR, z], [xe + 3.32, YR, z], .21, { feet: true });
    B.box([xe + 3.15, YR - .2, z - .22], [xe + 3.32, YR + .2, z + .22], .02, { br: .85, edge: .8 });
    for (let k = 0; k < 3; k++) { const x0 = xe + .7 + k * .55; B.line([x0, YR + .17, z - .1], [x0 + .4, YR + .17, z - .1], .9); B.line([x0, YR + .17, z + .1], [x0 + .4, YR + .17, z + .1], .9); B.line([x0, YR + .17, z - .1], [x0, YR + .17, z + .1], .9); B.line([x0 + .4, YR + .17, z - .1], [x0 + .4, YR + .17, z + .1], .9); }
    bolts(B, [xe + .56, YR, z], YA, ZA, .22, 8, .02);
    hood(B, xe - .45, xe + .55, z - .5, z + .5, 2.35, .45, .13, 6.5);
    tray(B, [-16.8, 2.7, 4.6], [-4.6, 2.7, 4.6], .3);
    hose(B, [[-16.2, .9, 3.6], [XR - 2.2, .3, z + 1.3]], .2, .45); hose(B, [[-16.2, .8, 3.2], [XR + 2.2, .3, z + 1.3]], .25, .45);
    hose(B, [[-5.0, 2.7, 4.6], [xe + 3.9, YR + .25, z + .1]], .15, .5); hose(B, [[tx, 2.7, 4.6], [tx, 1.6, z + .7]], .1, .5);
    pendant(B, [-8.6, 0, -.2], 1.5, .6, [0, 0, 1], 'r1p');
  });
  BB.r1scr = screwB(.13, 1.8, .14); BB.r1star = fanB(.15, 6); BB.r1ecc = wheelB(.09, .05, 1);
}
function drawR1x(u) {
  const z = ZR.R1, xe = XR + D.Lb / 2, tx = xe + 2.25, feed = ss(2.95, 3.1, u) * (1 - ss(5.95, 6.05, u));
  L.draw(BB.r1x, BWX, O.st);
  const turns = TAU * 22 * R1S.fill;
  spin(BB.r1scr, [xe + .56, YR, z], XA, -turns, O.mc);
  spin(BB.r1star, [tx, 1.4, z - .22], ZA, turns * .3, O.mc);
  for (const x of [XR - 2.2, XR + 2.2]) for (const s of [-1, 1]) spin(BB.r1ecc, [x, .18, z + s * 1.3], ZA, U_ * 30 * feed + s, O.mc);
  // the hopper's level float, the gauges, the fill trace
  apX(BWX, tx + .35, 3.35 - 1.0 * R1S.fill, z + .3, PW); K.dotW(PW[0], PW[1], PW[2], 3, LIME, .9);
  needle(GAUGES.r10, .15 + .6 * feed + .05 * Math.sin(U_ * 9) * feed); needle(GAUGES.r11, R1S.fill);
  trace('r1', s => s * .95, R1S.fill + (u > 6 ? 1 : 0), 1); trace('r1p', s => .5 + .35 * Math.sin(s * 30) * Math.exp(-s * 2), lin(u, 3, 6), .8);
}

/* R2 · the press: the pit's railings and ladder, the vessel's flange and collar, the high-pressure skid
   (intensifier with tie rods, motor, accumulators, a gauge), the yoke's racks and its cable chain, a beacon */
function dressR2() {
  const z = ZR.R2, px0 = -22, px1 = -10, pz0 = 6, pz1 = 10;
  BB.r2x = mkB('r2x', B => {
    zone(B, -23.2, 4.6, -4.4, 11.8);
    railing(B, [[px0 - .3, 0, pz0 - .3], [px0 - .3, 0, pz1 + .3]], 1.1); railing(B, [[px1 + .3, 0, pz0 - .3], [px1 + .3, 0, pz1 + .3]], 1.1);
    ladder(B, [px0 + .35, PD, pz0 + .5], [px0 + .35, 1.1, pz0 + .5], .45);
    B.chunk('pitw'); for (let x = px0 + 1; x < px1; x += 1) { B.line([x, PD, pz0 + .01], [x, 0, pz0 + .01], .25); B.line([x, PD, pz1 - .01], [x, 0, pz1 - .01], .25); }
    for (let y = PD + 1.5; y < 0; y += 1.5) { B.line([px0, y, pz0 + .01], [px1, y, pz0 + .01], .2); B.line([px0, y, pz1 - .01], [px1, y, pz1 - .01], .2); }
    B.chunk('rack'); for (const zz of [pz0 + .9, pz1 - .9]) for (let x = px0 + .3; x < px1 - .2; x += .12) B.line([x, PD + .31, zz - .12], [x, PD + .31, zz + .12], .35);
    B.chunk('flange');
    B.lathe([XV, VY1 - .35, z], YA, [[0, VR + .02], [0, VR + .2], [.32, VR + .2], [.32, VR + .02]], { cell: .04, br: .8, rbr: .9 });
    bolts(B, [XV, VY1 - .02, z], XA, ZA, VR + .11, 28, .035);
    B.lathe([XV, -.45, z], YA, [[0, VR], [0, VR + .3], [.4, VR + .3], [.4, VR]], { cell: .05, br: .7, rbr: .8 });
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; B.box([XV + Math.cos(a) * 1.55 - .12, -.45, z + Math.sin(a) * 1.55 - .12], [XV + Math.cos(a) * 1.55 + .12, -.05, z + Math.sin(a) * 1.55 + .12], .03, { br: .75, edge: .8 }); }
    B.chunk('skid');
    B.box([-9.0, 0, 9.0], [-5.8, .15, 12.4], .05, { br: .6, edge: .7 });
    B.cyl([-8.35, 1.85, 9.9], [-6.65, 1.85, 9.9], .22, { cell: .02, br: .85, caps: true, rbr: .8 });
    for (const x of [-8.5, -6.5]) B.box([x - .12, 1.55, 9.6], [x + .12, 2.15, 10.2], .02, { br: .9, edge: .85 });
    for (const [dy, dz] of [[.2, .2], [.2, -.2], [-.2, .2], [-.2, -.2]]) B.line([-8.6, 1.85 + dy, 9.9 + dz], [-6.4, 1.85 + dy, 9.9 + dz], .7);
    motor(B, [-7.4, .5, 12.25], [-7.4, .5, 10.75], .3, { feet: true });
    B.box([-7.75, .15, 10.4], [-7.05, .85, 10.75], .03, { br: .85, edge: .8 });
    for (const zz of [10.9, 11.6]) { B.cyl([-8.75, .15, zz], [-8.75, 1.25, zz], .16, { cell: .02, br: .8 }); B.lathe([-8.75, 1.25, zz], YA, [[0, .16], [.12, .08], [.16, 0]], { cell: .02, br: .85 }); }
    B.tube([-8.6, 0, 8.9], [-8.6, 1.75, 8.9], .025, .6);
    GAUGES.r2p = gauge(B, [-8.6, 1.95, 8.9], nrm([1, 0, -.55]), .16);
    hose(B, [[-6.65, 1.85, 9.9], [-6.2, 1.6, 9.2], [XV + 1.1, VY1 + .3, z + .6]], .2, .6);
    hose(B, [[-8.75, 1.3, 10.9], [-8.35, 1.85, 9.9]], .05, .55);
    cab(B, [-9.8, 0, 3.4], [-8.7, 2.0, 5.2], { front: 'x+', st: 'R2', id: 'r2', screen: [.25, 1.2, 1.5, 1.78], gauges: [[.45, .95, .08]], estop: [1.6, 1.0] });
    B.tube([px1 + .5, 0, pz0 - .6], [px1 + .5, 2.6, pz0 - .6], .03, .6); B.knot([px1 + .5, 2.7, pz0 - .6], .08, 1, 3, lightQ(8, 'R2'));
    tray(B, [-9.3, 2.4, 11.0], [-21.5, 2.4, 11.0], .3);
  });
  BB.r2rod = mkB('r2r', B => { B.cyl([0, 0, 0], [0, 0, .7], .07, { cell: .01, br: 1, caps: true }); B.box([-.1, -.1, .7], [.1, .1, .82], .02, { br: .9, edge: .85 }); }, 1);
  BB.gear = mkB('gr', B => { B.lathe([0, 0, -.05], ZA, [[0, .14], [.1, .14]], { cell: .01, br: .9, rbr: .8 }); for (let k = 0; k < 16; k++) { const t = k / 16 * TAU; B.line([Math.cos(t) * .14, Math.sin(t) * .14, 0], [Math.cos(t) * .17, Math.sin(t) * .17, 0], .9); } B.line([0, 0, .06], [.12, 0, .06], .9); }, 1);
}
function drawR2x(u) {
  const z = ZR.R2;
  L.draw(BB.r2x, BWX, O.st);
  const pump = R2S.p, st = Math.sin(U_ * 7) * .5 + .5;
  atL(XF4, BWX, -6.62 + .25 * st * (pump > .05 ? 1 : 0), 1.85, 9.9, 1, 0, 0, 0, 1, 0); L.draw(BB.r2rod, XF4, O.mc);
  const yx = XV - 5 * (1 - R2S.yoke);
  for (const s of [-1, 1]) spin(BB.gear, [yx + s * 2.0, PD + .5, z + s * 1.15], ZA, -(yx - XV) / .15, O.mc);
  chainW([-21.6, PD + .02, z - 1.6], XA, YA, yx - 2.2 + 21.6, .28, 9, .18, 1);
  needle(GAUGES.r2p, pump * .95 + .02 * Math.sin(U_ * 21) * pump); needle(GAUGES.r20, .2 + .7 * pump);
  trace('r2', s => ss(.05, .32, s) * (1 - ss(.78, .92, s)) * (.96 + .04 * Math.sin(s * 70)), lin(u, 8.0, 9.6) + (u > 9.6 ? 1 : 0), 1);
}

/* R3 · the furnace: two hydraulic cylinders lifting the lid, heating elements, thermocouples, the hydrogen panel
   (flow meters, valves), the burn-off flare, the transformer and its bus bars, cooling-water hoses, shell ribs */
const LIDC = [[0, 0, 0], [0, 0, 0]];
function dressR3() {
  const z = ZR.R3, x0 = XR - D.Lg / 2 - .8, x1 = XR + D.Lg / 2 + .8;
  BB.r3x = mkB('r3x', B => {
    zone(B, -18.6, 12.6, -5.6, 18.6);
    B.chunk('ribs');
    for (let x = x0 + .4; x < x1; x += .75) B.ring([x, YR, z], YA, ZA, FR + .03, 16, .55, 0, 0, PI / 2, PI * 1.5);
    for (let x = x0 + .2; x < x1; x += .3) B.knot([x, YR + .02, z - FR - .03], .03, .8);
    for (const x of [x0 + 1, x1 - 1]) { B.box([x - .14, 0, z + 1.9], [x + .14, .35, z + 2.3], .03, { br: .85, edge: .8 }); B.box([x - .08, YR - .1, z + FHZ - .1], [x + .08, YR + .1, z + FHZ + .25], .02, { br: .9, edge: .85 }); }
    B.chunk('cool');
    for (const y of [.42, .62]) B.tube([x0 + .2, y, z - 1.2], [x1 - .2, y, z - 1.2], .035, .55);
    for (let k = 0; k < 5; k++) { const x = x0 + .7 + k * (x1 - x0 - 1.4) / 4; hose(B, [[x, .62, z - 1.2], [x + .2, YR - .4, z - FR - .02]], .08, .45); hose(B, [[x + .35, .42, z - 1.2], [x + .5, YR - .7, z - FR + .1]], .06, .4); }
    B.chunk('elem');
    for (const a of [.62, .82, 1.0, 1.18, 1.38]) for (let x = x0 + .4; x < x1 - .3; x += .8) B.knot([x, YR + Math.cos(a * PI) * .7, z + Math.sin(a * PI) * .7], .03, .7);
    B.chunk('gas');
    B.box([-16.7, 0, 12.8], [-16.5, 2.2, 14.2], .04, { br: .55, edge: .8 });
    for (let k = 0; k < 4; k++) { const zz = 13.0 + k * .32; B.line([-16.48, 1.1, zz - .04], [-16.48, 1.9, zz - .04], .8); B.line([-16.48, 1.1, zz + .04], [-16.48, 1.9, zz + .04], .8); handwheel(B, [-16.45, .75, zz], ZA, YA, .07); }
    pipe(B, [[-16.5, .55, 13.5], [-15.2, .55, 13.5], [-15.2, .55, z - .4], [x0 - .05, .9, z - .4]], .04, .6);
    B.tube([-16.0, 0, 17.0], [-16.0, 3.6, 17.0], .06, .7); B.ringP([-16.0, 3.62, 17.0], XA, ZA, .1, .9); B.ringP([-16.0, 3.62, 17.0], XA, ZA, .16, .5);
    pipe(B, [[x1 + 1.7, 2.4, z + .4], [x1 + 1.7, 3.0, z + .4], [-16.0, 3.0, 17.0]], .035, .45, false);
    cab(B, [-18.4, 0, 14.9], [-17.1, 2.3, 17.8], { front: 'x+', st: 'R3', id: 'r3', screen: [.4, 1.25, 1.75, 1.9], gauges: [[2.25, 1.6, .1], [2.6, 1.6, .1]], estop: [2.4, 1.1] });
    for (let k = 0; k < 3; k++) pipe(B, [[-17.6, 2.3, 15.4 + k * .25], [-17.6, 2.75 + k * .08, 15.4 + k * .25], [x0 - .05, 2.75 + k * .08, z + .2 + k * .25], [x0 - .05, YR + .9, z + .2 + k * .25]], .025, .75, false);
    tray(B, [-17.8, 3.4, 13.0], [-5.8, 3.4, 13.0], .3);
  });
  BB.lidx = mkB('lidx', B => {                                 // in the lid's frame (hinge on x at the origin)
    for (let k = 0; k < 5; k++) { const x = x0 + .9 + k * (x1 - x0 - 1.8) / 4; B.cyl([x, FR - .05, -FHZ], [x, FR + .35, -FHZ], .025, { cell: .008, br: .9 }); B.box([x - .05, FR + .35, -FHZ - .05], [x + .05, FR + .45, -FHZ + .05], .015, { br: .95, edge: .9 }); }
    for (const x of [x0 + .5, x1 - .5]) { B.box([x - .1, FR - .05, -FHZ - .1], [x + .1, FR + .12, -FHZ + .1], .02, { br: .85, edge: .8 }); B.ringP([x, FR + .2, -FHZ], XA, YA, .08, .9); }
    for (let k = 0; k < 4; k++) { const x = x0 + 1.0 + k * (x1 - x0 - 2) / 3; hose(B, [[x, FR - .2, -FHZ + .65], [x + .6, FR + .1, -FHZ + .2], [x + 1.2, FR - .2, -FHZ + .65]], .05, .45); }
    for (const x of [x0 + 1, x1 - 1]) B.box([x - .06, .1, -.15], [x + .06, .55, .2], .015, { br: .9, edge: .85 });
  });
  BB.lidel = mkB('lide', B => { for (const a of [-.38, -.18, 0, .18, .38]) B.line([x0 + .35, Math.cos(a * PI) * .7, Math.sin(a * PI) * .7 - FHZ], [x1 - .35, Math.cos(a * PI) * .7, Math.sin(a * PI) * .7 - FHZ], .8, 18, 0); });
  BB.r3el = mkB('r3e', B => { for (const a of [.62, .82, 1.0, 1.18, 1.38]) B.line([x0 + .35, YR + Math.cos(a * PI) * .7, z + Math.sin(a * PI) * .7], [x1 - .35, YR + Math.cos(a * PI) * .7, z + Math.sin(a * PI) * .7], .8, 18, 0); });
  BB.hcyl = mkB('hc', B => { B.cyl([0, 0, 0], [0, 0, .95], .075, { cell: .012, br: .85, caps: true }); B.ringP([0, 0, .9], XA, YA, .09, .8); B.box([-.05, -.09, -.12], [.05, .09, 0], .015, { br: .9 }); hose(B, [[.07, 0, .15], [.2, -.1, .5], [.07, 0, .85]], .03, .5); }, 1);
  BB.hrod = mkB('hr', B => { B.cyl([0, 0, 0], [0, 0, 1.0], .035, { cell: .008, br: 1 }); B.box([-.04, -.06, -.1], [.04, .06, 0], .012, { br: .9 }); }, 1);
}
function drawR3x(u) {
  const z = ZR.R3, x0 = XR - D.Lg / 2 - .8, x1 = XR + D.Lg / 2 + .8, X5 = BB.gX[5];
  L.draw(BB.r3x, BWX, O.st);
  L.draw(BB.r3el, BWX, O.mc); L.draw(BB.lidel, X5, O.mc); L.draw(BB.lidx, X5, O.mc);
  // the lid's cylinders: from their anchors behind the furnace to the lid's lugs
  const th = R3S.lid * 1.95;
  for (const [k, x] of [[0, x0 + 1], [1, x1 - 1]]) {
    const ly = .45, lz = .1, c = Math.cos(-th), s = Math.sin(-th);
    const P = [x, YR + ly * c - lz * s, z + FHZ + ly * s + lz * c], A = [x, .32, z + 2.1], d = nrm(sub(P, A));
    atL(XF4, BWX, A[0], A[1], A[2], d[0], d[1], d[2], 1, 0, 0); L.draw(BB.hcyl, XF4, O.mc);
    const e = sub([0, 0, 0], d); atL(XF4, BWX, P[0], P[1], P[2], e[0], e[1], e[2], 1, 0, 0); L.draw(BB.hrod, XF4, O.hero);
    LIDC[k] = P;
  }
  // flow meters, the flare, gauges, the program trace
  const h = R3S.heat;
  for (let k = 0; k < 4; k++) { apX(BWX, -16.47, 1.15 + (.25 + .45 * h) * (.6 + .4 * ((k * .37) % 1)) + .01 * Math.sin(U_ * 7 + k), 13.0 + k * .32, PW); K.dotW(PW[0], PW[1], PW[2], 3, LIME, .9); }
  if (h > .05) { const fl = .7 + .3 * hh(Math.floor(U_ * 20), 5); apX(BWX, -16.0, 3.75, 17.0, PW); K.glowW(PW[0], PW[1], PW[2], 30, GLC, .6 * h * fl); K.glowW(PW[0], PW[1], PW[2], 10, HOT, .7 * h * fl); spray(u, 11.5, 13.4, 30, -16.0, 3.7, 17.0, 0, 1, 0, .25, .3, .7, .5, GLC, .7 * h, 1, 81); }
  needle(GAUGES.r30, h); needle(GAUGES.r31, .1 + .5 * h);
  trace('r3', s => s < .25 ? s / .25 * .95 : s < .7 ? .95 : .95 - (s - .7) / .3 * .8, lin(u, 11.3, 13.0) + (u > 13 ? 1 : 0), 1, GLC);
}

/* R4 · the forge: crank flywheels on the four hammer barrels, the top drive, tie rods and the top platform, the
   manipulator's cab and cable chain, driven rollers, the descaling ring, the induction cabinet and coil hoses, the
   spark hood over the exit */
function dressR4() {
  const z = ZR.R4, hx = 1.1, y1 = 4.6, hz = 2.9;
  BB.r4x = mkB('r4x', B => {
    zone(B, -23.4, 19.4, -2.4, 26.6);
    B.chunk('top');
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [XF + dx * (hx - .2), 0, z + dz * (hz - .25)]; B.tube([p[0], -1.6, p[2]], [p[0], y1 + .35, p[2]], .09, .75); B.lathe([p[0], y1, p[2]], YA, [[0, .2], [.3, .2], [.3, 0]], { cell: .03, br: .9 }); }
    railing(B, [[XF - hx, y1, z - hz], [XF + hx, y1, z - hz], [XF + hx, y1, z + hz], [XF - hx, y1, z + hz], [XF - hx, y1, z - hz]], 1.0);
    ladder(B, [XF + hx + .15, 0, z - hz + .4], [XF + hx + .15, y1 + 1, z - hz + .4], .45);
    motor(B, [XF - .9, y1 + .45, z + 1.4], [XF + .7, y1 + .45, z + 1.4], .36, { feet: true });
    B.box([XF + .7, y1 + .1, z - 1.8], [XF + .95, y1 + 1.1, z + 1.9], .04, { br: .7, edge: .8 });
    for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2, c = Math.cos(a), s = Math.sin(a); B.chunk('crank'); B.box([XF + 1.62, YR + c * 2.7 - .45, z + s * 2.7 - .45], [XF + 1.72, YR + c * 2.7 + .45, z + s * 2.7 + .45], .03, { br: .6, edge: .8 }); hose(B, [[XF + 1.2, YR + c * 3.25, z + s * 3.25], [XF + 1.0, YR + c * 3.6, z + s * 2.0], [XF + .2, y1, z]], .1, .45); }
    B.chunk('manip');
    for (const dz of [-.75, .75]) for (let x = -22.4; x < XF - 1.4; x += .15) B.line([x, .26, z + dz - .1], [x, .26, z + dz + .1], .3);
    B.chunk('roll');
    for (let x = XF + 1.6; x < -3; x += 1.25) motor(B, [x, YR - D.rf - .16, z + 1.15], [x, YR - D.rf - .16, z + .72], .13, { up: YA });
    B.chunk('desc');
    const dx = COIL_X[0] - .7;
    B.ringP([dx, YR, z], YA, ZA, .5, .8); B.ringP([dx, YR, z], YA, ZA, .56, .6);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; B.line([dx, YR + Math.cos(a) * .5, z + Math.sin(a) * .5], [dx, YR + Math.cos(a) * .38, z + Math.sin(a) * .38], .9); }
    pipe(B, [[dx, YR - .56, z], [dx, 0, z], [dx - 1.2, 0, z - 1.4]], .04, .6);
    hood(B, XF + 1.3, XF + 3.4, z - 1.2, z + 1.2, 3.3, .8, .28, 11);
    cab(B, [-20.2, 0, 24.9], [-18.0, 2.4, 26.5], { front: 'x+', st: 'R4', id: 'r4', screen: [.25, 1.3, 1.35, 1.95], gauges: [[.35, .95, .09], [.7, .95, .09]], estop: [1.3, 1.0] });
    for (const s of [-1, 1]) hose(B, [[COIL_X[0] - .5, YR + .9, z + s * .4], [-17.0, 2.4, z + s * .4 + 1.0], [-18.0, 1.9, 25.6 + s * .2]], .3, .6);
    pendant(B, [-7.0, 0, 19.6], 1.55, .55, nrm([-.6, 0, .8]), 'r4p');
    tray(B, [-19.0, 3.0, 26.8], [-6.0, 3.0, 26.8], .35);
    B.panel([XF + .9, 0, z - .8], [1.6, -.0, 0], [0, .0, 1.6], .1, { n: YA, br: .3, edge: .6, two: true });
  });
  BB.fly = wheelB(.42, .14, 6); BB.roller = mkB('rl', B => { B.lathe([0, 0, -.55], ZA, [[0, .15], [1.1, .15]], { cell: .03, br: .9, rbr: .7 }); for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; B.line([Math.cos(t) * .152, Math.sin(t) * .152, -.5], [Math.cos(t) * .152, Math.sin(t) * .152, .5], .5); } }, 1);
  BB.mcab = mkB('mcb', B => { B.box([-1.5, 2.6, -1.0], [-.4, 3.5, -.2], .05, { br: .55, edge: .85 }); for (let k = 0; k < 3; k++) B.line([-1.4 + k * .35, 2.7, -1.01], [-1.4 + k * .35, 3.4, -1.01], .5); B.box([-1.6, .25, -1.05], [0, .55, 1.05], .04, { br: .7, edge: .8 }); for (const s of [-1, 1]) B.cyl([-1.3, .25, s * .75], [-.3, .25, s * .75], .12, { cell: .02, br: .8 }); }, 1);
}
function drawR4x(u) {
  const z = ZR.R4;
  L.draw(BB.r4x, BWX, O.st);
  const ham = R4S.ham, ang = TAU * 14 * (u - FG0) * ham;
  for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2; spin(BB.fly, [XF + 1.9, YR + Math.cos(a) * 2.7, z + Math.sin(a) * 2.7], XA, ang + k * PI / 2, O.mc); }
  const xm = R4S.man; at(XF4, BWX, xm - .05, 0, z); L.draw(BB.mcab, XF4, O.mc);
  chainW([-22.6, .27, z - 1.25], XA, YA, xm - 1.2 + 22.6, .3, 12, .22, 1);
  const trav = R4S.f * D.Lf / (D.Ls - D.LT);
  for (let x = XF + 1.6; x < -3; x += 1.25) spin(BB.roller, [x, YR - D.rf - .16, z], ZA, -trav / .15, O.mc);
  // the descaling spray at the entry, the sparks up into the hood
  if (ham > .05) {
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; spray(u, FG0, FG1, 10, COIL_X[0] - .7, YR + Math.cos(a) * .45, z + Math.sin(a) * .45, 0, -Math.cos(a), -Math.sin(a), .25, 1.5, 3, .25, WH, .55, 1, 90 + k); }
    spray(u, FG0, FG1, 90, XF + 1.1, YR + .2, z, .45, .85, 0, .35, 2.5, 6, .7, GLC, 1, 1, 98);
    spray(u, FG0, FG1, 50, XF + 2.35, 4.1, z, 0, 1, 0, .08, 3, 5, 1.6, GLC, .45, 1, 99);
  }
  needle(GAUGES.r40, .3 + .6 * ham); needle(GAUGES.r41, R4S.ind);
  trace('r4', s => .2 + .6 * Math.abs(Math.sin(s * 40)) * ss(.05, .15, s) * (1 - ss(.9, 1, s)), lin(u, FG0, FG1) + (u > FG1 ? 1 : 0), 1);
  trace('r4p', s => s, lin(u, FG0, FG1), .8);
}

/* R5 · the lathe and grinder: ways and lead screw, the apron with handwheels, an eight-tool turret, the headstock's
   motor and belt guard, the tailstock's wheel, coolant, the wheel guard and its spark hood, a slat chip conveyor,
   sliding doors parked open, the pendant (the profile on its screen) */
function dressR5() {
  const z = ZR.R5, xa = XR - RL / 2, xb = XR + RL / 2;
  BB.r5x = mkB('r5x', B => {
    zone(B, -18.8, 28.6, -5.2, 34.2);
    B.chunk('ways');
    for (const dz of [.65, 2.05]) { rail(B, [xa - 2.5, 1.11, z + dz], [xb + 1.4, 1.11, z + dz], .12, .8); B.line([xa - 2.5, 1.0, z + dz - .12], [xb + 1.4, 1.0, z + dz - .12], .5); }
    B.box([xa - 2.7, .55, z + .38], [xb + 1.5, .62, z + .44], .02, { br: .7, edge: .7 });
    for (let x = xa - 2.6; x < xb + 1.4; x += .8) B.knot([x, .7, z + .45], .03, .7);
    B.chunk('head');
    motor(B, [xa - 2.9, 2.1, z + 2.8], [xa - 1.2, 2.1, z + 2.8], .32, { feet: false });
    B.box([xa - 1.2, 1.4, z + 2.3], [xa - .9, 2.95, z + 3.3], .03, { br: .7, edge: .85 });
    const F = faceF([xa - 3.0, 0, z - 1.3], [xa - .75, 3.0, z + 2.3], 'z-');
    frm(B, F, .2, .6, 1.2, 2.6, .5); frm(B, F, 1.35, .6, 2.05, 1.5, .5); B.ringP(fpm(F, 1.7, 1.05, .01), XA, YA, .08, .9);
    for (let k = 0; k < 6; k++) B.knot(fpm(F, 1.45 + k * .1, 2.4, .01), .025, .9);
    bolts(B, [xa - .76, YR, z], YA, ZA, .7, 12, .03);
    B.chunk('tail'); handwheel(B, [xb + 1.62, 1.45, z], ZA, YA, .22); B.line([xb + .9, 2.2, z - .3], [xb + 1.2, 2.55, z - .45], .9);
    B.chunk('conv'); for (const dz of [-.9, .4]) B.line([xa, .36, z + dz], [xb, .36, z + dz], .6);
    B.box([xb, 0, z - 1.0], [xb + .9, 1.1, z - .2], .04, { br: .6, edge: .8 }); B.line([xb + .9, 1.1, z - .6], [xb + 1.6, 1.4, z - .6], .5);
    B.chunk('doors');
    for (const x of [xa - 3.0, xb + 1.6]) B.tube([x, 0, z - 1.9], [x, 2.7, z - 1.9], .04, .6);
    B.tube([xa - 3.0, 2.7, z - 1.9], [xb + 1.6, 2.7, z - 1.9], .04, .65); B.tube([xa - 3.0, 0, z - 1.9], [xb + 1.6, 0, z - 1.9], .03, .5);
    for (const [x0, x1] of [[xa - 2.95, xa - 1.2], [xb - .1, xb + 1.55]]) { B.panel([x0, .1, z - 1.95], [x1 - x0, 0, 0], [0, 2.5, 0], .1, { n: [0, 0, -1], br: .12, edge: .8, two: true }); B.line([x0 + .2, 1.1, z - 1.98], [x0 + .2, 1.5, z - 1.98], .9); }
    hood(B, xa - .4, xb + .4, z - 1.5, z - .3, 3.1, .55, .26, 11);
    pendant(B, [-6.1, 0, 29.4], 1.55, .55, nrm([-.5, 0, .85]), 'r5p');
    cab(B, [-19.0, 0, 29.6], [-17.6, 2.2, 33.0], { front: 'x+', st: 'R5', id: 'r5', screen: [1.0, 1.25, 2.4, 1.85], gauges: [[.45, 1.55, .09]], estop: [2.8, 1.2] });
    tray(B, [-18.3, 3.1, 33.8], [-6.0, 3.1, 33.8], .3);
  });
  BB.lscr = screwB(.035, RL + 3.6, .05);
  BB.apron = mkB('apr', B => {                                 // rides the carriage (origin at the carriage, as BB.carr)
    B.box([-.55, .55, -.62], [.55, 1.1, -.45], .03, { br: .75, edge: .85 });
    for (const x of [-.32, .3]) handwheel(B, [x, .82, -.66], XA, YA, .13);
    B.ringP([0, .7, -.64], XA, YA, .03, 1); B.knot([.1, 1.0, -.64], .025, 1, 3, lightQ(7, 'R5', 1));
    for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; B.box([Math.cos(t) * .45 - .04, YR + Math.sin(t) * .45 - .04, -1.0], [Math.cos(t) * .45 + .04, YR + Math.sin(t) * .45 + .04, -.88], .01, { br: .95, edge: .9 }); }
    hose(B, [[.25, 1.95, -.7], [.15, YR + .35, -.62], [.05, YR + .12, -D.rf - .1]], .02, .7);
    B.box([-.08, 1.1, .5], [.08, 1.95, .62], .02, { br: .8 });
  }, .6);
  BB.wguard = mkB('wgd', B => { B.ring([.08, 0, 0], ZA, YA, .7, 24, .8, 0, 0, -.6, PI + .6); B.ring([-.08, 0, 0], ZA, YA, .7, 24, .8, 0, 0, -.6, PI + .6); for (let k = 0; k <= 12; k++) { const t = -.6 + k / 12 * (PI + 1.2); B.line([-.08, Math.sin(t) * .7, Math.cos(t) * .7], [.08, Math.sin(t) * .7, Math.cos(t) * .7], .45); } motor(B, [0, .2, -2.6], [0, .2, -2.2], .25, {}); }, .6);
}
function drawR5x(u) {
  const z = ZR.R5, xa = XR - RL / 2, xb = XR + RL / 2;
  L.draw(BB.r5x, BWX, O.st);
  const turning = u > TURN[0] && u < TURN[1], grinding = u > GRIND[0] && u < GRIND[1];
  spin(BB.lscr, [xa - 2.6, .78, z + .55], XA, (R5S.tc + R5S.gc) * 40, O.mc);
  const xt = XR + R5S.tc, xg = XR + R5S.gc;
  at(XF4, BWX, u < TURN[1] + .05 ? xt : xg, 0, z); L.draw(BB.apron, XF4, O.mc);
  chainW([xa - 2.3, 1.15, z + 2.45], XA, YA, (u < TURN[1] + .05 ? xt : xg) - (xa - 2.3), .22, 9, .16, 1);
  if (u > GRIND[0] - .25) { at(XF4, BWX, xg, YR - .1, z - D.rf - .62); L.draw(BB.wguard, XF4, O.mc); }
  // coolant onto the tool, the slats of the chip conveyor
  if (turning) spray(u, TURN[0], TURN[1], 60, xt + .05, YR + .12, z - D.rf - .1, 0, -.8, .55, .25, .8, 1.6, .35, [200, 230, 255], .6, 1, 101);
  if (grinding) { spray(u, GRIND[0], GRIND[1], 120, xg, YR - .25, z - D.rf - .1, .1, .75, -.65, .35, 3, 7, .45, GLC, 1, 1, 102); spray(u, GRIND[0], GRIND[1], 40, XR, 3.7, z - .9, 0, 1, 0, .08, 3, 5, 1.6, GLC, .4, 1, 103); }
  const sl = (U_ * .25) % .2;
  for (let x = xa + sl; x < xb; x += .2) { apX(BWX, x, .36, z - .9, PW); apX(BWX, x, .36, z + .4, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 3, 1, WH, .35); }
  needle(GAUGES.r50, .2 + .6 * (turning || grinding ? 1 : 0) + .04 * Math.sin(U_ * 13));
  trace('r5', s => s < (R5S.tc + RL / 2) / RL ? .45 : .6, lin(u, 17.9, 19.9), 1); trace('r5p', s => .5 + .08 * Math.sin(s * 60) * Math.exp(-s * 3), lin(u, TURN[0], GRIND[1]), .8);
}

/* R6 · the mill: linear rails and a ball screw on the bridge, the ram's saddle and cable chain, the spindle motor,
   a 16-tool carousel, the indexer's dial, hydraulic clamps, a chip guard and a hood over the nose */
function dressR6() {
  const z = ZR.R6, xa = XR - RL / 2, xb = XR + RL / 2, x0 = XR - RL / 2 - 1.65, x1 = XR + RL / 2 + 1.45;
  BB.r6x = mkB('r6x', B => {
    zone(B, -17.6, 35.6, -2.4, 41.4);
    B.chunk('bridge');
    for (const y of [4.72, 5.48]) rail(B, [x0 + .1, y, z + .89], [x1 - .1, y, z + .89], .05, .8);
    for (let x = x0 + .3; x < x1; x += .6) { B.knot([x, 4.62, z + .9], .04, .8); B.knot([x, 5.58, z + .9], .04, .8); }
    for (const x of [XR - RL / 2 - 1.2, XR + RL / 2 + 1.0]) { const F = faceF([x - .45, 0, z + 1.0], [x + .45, 5.6, z + 2.1], 'z-'); for (let t = .5; t < 5.4; t += .5) B.line(fpm(F, .05, t), fpm(F, .85, t), .22); frm(B, F, .15, .3, .75, 1.6, .5); bolts(B, [x, .1, z + 1.55], XA, ZA, .4, 8, .04); }
    motor(B, [x1 + .1, 5.1, z + .75], [x1 - .3, 5.1, z + .75], .2, {});
    B.chunk('tc');
    B.box([x1 - .55, 2.2, z + .2], [x1 + .45, 4.5, z + .95], .05, { br: .6, edge: .85 });
    B.chunk('idx');
    B.ringP([xa - .54, YR, z], YA, ZA, .62, .9); for (let k = 0; k < 36; k++) { const t = k / 36 * TAU; B.line([xa - .53, YR + Math.cos(t) * .58, z + Math.sin(t) * .58], [xa - .53, YR + Math.cos(t) * (k % 3 ? .54 : .5), z + Math.sin(t) * (k % 3 ? .54 : .5)], .7); }
    motor(B, [xa - 2.6, .9, z + .55], [xa - 1.9, .9, z + .55], .18, {});
    for (const x of [XR - 1.5, XR + 1.6]) { B.cyl([x + .32, .2, z - .45], [x + .32, YR + .3, z - .45], .06, { cell: .01, br: .9, caps: true }); hose(B, [[x + .32, .3, z - .45], [x + .9, .05, z - 1.0]], .05, .5); B.line([x + .32, YR + .3, z - .45], [x, YR + RR + .12, z - .1], .9); }
    B.chunk('guard'); B.box([xa, 0, z - .8], [xb + .4, .28, z + .7], .08, { br: .45, edge: .7 }); for (let x = xa + .2; x < xb + .3; x += .25) B.line([x, .29, z - .78], [x, .29, z + .68], .22);
    hood(B, xb - 1.6, xb + .9, z - 1.1, z + .8, 3.2, .6, .24, 11);
    cab(B, [-18.6, 0, 36.2], [-17.2, 2.2, 39.8], { front: 'x+', st: 'R6', id: 'r6', screen: [.9, 1.25, 2.6, 1.9], gauges: [[.4, 1.55, .09]], estop: [3.1, 1.2] });
    pendant(B, [-4.6, 0, 36.9], 1.5, .5, nrm([-.6, 0, .8]), 'r6p');
    tray(B, [-17.9, 5.9, 40.4], [x1, 5.9, 40.4], .3);
  });
  BB.saddle6 = mkB('sd6', B => { B.box([-.6, 4.4, .45], [.6, 5.8, .88], .03, { br: .75, edge: .85 }); for (const y of [4.72, 5.48]) for (const s of [-1, 1]) B.box([s * .4 - .12, y - .05, .82], [s * .4 + .12, y + .05, .89], .01, { br: .95 }); }, .6);
  BB.ramMot = mkB('rmm', B => { motor(B, [0, .95, 0], [0, .05, 0], .24, { up: ZA }); for (const s of [-1, 1]) { B.line([s * .46, -3.9, -.46], [s * .46, 0, -.46], .6); B.line([s * .46, -3.9, .46], [s * .46, 0, .46], .45); } hose(B, [[.3, .6, .3], [.6, -1.0, .5], [.25, -3.6, -.3]], .2, .45); }, .6);
  BB.carou = mkB('cr6', B => { B.lathe([0, 0, -.06], ZA, [[0, .62], [.12, .62]], { cell: .02, br: .8, rbr: .9 }); for (let k = 0; k < 16; k++) { const t = k / 16 * TAU, c = Math.cos(t), s = Math.sin(t); B.box([c * .52 - .05, s * .52 - .05, -.08], [c * .52 + .05, s * .52 + .05, .1], .01, { br: .9, edge: .85 }); B.cyl([c * .52, s * .52, .1], [c * .52, s * .52, .22 + .1 * (k % 3)], .025, { cell: .006, br: 1 }); } B.knot([0, 0, .1], .08, .9); }, 1);
  BB.bscr = screwB(.04, x1 - x0 - .4, .06);
}
function drawR6x(u) {
  const z = ZR.R6, x0 = XR - RL / 2 - 1.65, x1 = XR + RL / 2 + 1.45;
  L.draw(BB.r6x, BWX, O.st);
  const hxr = R6HX;
  at(XF4, BWX, hxr, 0, z); L.draw(BB.saddle6, XF4, O.mc);
  at(XF4, BWX, hxr, R6HY + 4.8, z); L.draw(BB.ramMot, XF4, O.mc);
  spin(BB.bscr, [x0 + .2, 5.1, z + .82], XA, hxr * 30, O.mc);
  chainW([x0 + .3, 5.62, z + 1.15], XA, YA, hxr - x0 - .3, .2, 10, .14, 1);
  spin(BB.carou, [x1 - .05, 3.35, z + .1], ZA, Math.floor(R6S.fin) * TAU / 16 + (u > OGV[0] ? TAU / 16 : 0), O.mc);
  needle(GAUGES.r60, u > OGV[0] && u < FINS[1] ? .55 + .25 * Math.sin(U_ * 5) : .1);
  trace('r6', s => .3 + .5 * Math.abs(Math.sin(s * 22 + 1)) * (s < .35 ? 1 : .6), lin(u, OGV[0], FINS[1]), 1); trace('r6p', s => 1 - s * .3, lin(u, OGV[0], FINS[1]), .8);
}

/* R7 · the casing line: its zone, the control cabinet (the weld's trace), a pendant, the section magazine's tray,
   the welder's cable chain */
function dressR7() {
  const z = ZR.R7, xa = XR - RL / 2, xb = XR + RL / 2;
  BB.r7x = mkB('r7x', B => {
    zone(B, xa - D.secL - 2, z - 2.0, xb + 2.6, z + XRK + 1.1);
    cab(B, [xb + 3.0, 0, z + .4], [xb + 4.1, 2.3, z + 2.8], { front: 'x-', st: 'R7', id: 'r7', screen: [.4, 1.25, 1.9, 1.9], gauges: [[.5, .95, .09], [.85, .95, .09]], estop: [2.0, 1.1] });
    pendant(B, [xb + 2.4, 0, z - 2.2], 1.55, .55, nrm([-.6, 0, .8]), 'r7p');
    tray(B, [xa - 2, 5.9, z - 2.0], [xb + 3.5, 5.9, z - 2.0], .3);
    for (let k = 0; k < D.NSEC; k++) B.line([rackX(k) - D.secL / 2 + .1, .13, z + XRK - .78], [rackX(k) + D.secL / 2 - .1, .13, z + XRK - .78], .8, 10, 0);
  });
}
function drawR7x(u) {
  const z = ZR.R7;
  L.draw(BB.r7x, BWX, O.st);
  chainW([XR - RL / 2 - .4, .56, z - 1.75], XA, YA, R7S.wx - (XR - RL / 2 - .4), .18, RL + 1, .14, 1);
  needle(GAUGES.r70, .1 + .8 * R7S.wOn); needle(GAUGES.r71, .2 + .6 * lin(u, CS0, CSEND));
  trace('r7', s => .3 + .5 * (Math.floor(s * 5) % 2 ? .8 : .3), lin(u, CS0, CSEND + .2), 1); trace('r7p', s => s, lin(u, CS0, CSEND), .8);
}
/* R8 · the fill bay: a zone, gauges on the vessels' panel, the fill and the cure on the cabinet's screen */
function dressR8() {
  const z = ZR.R8, xa = XR - RL / 2, xb = XR + RL / 2;
  BB.r8x = mkB('r8x', B => {
    zone(B, xa - 1.6, z - 4.4, xb + 1.4, z + 4.8);
    cab(B, [xa - 2.6, YMZ, z + 2.1], [xa - 1.4, YMZ + 2.0, z + 4.1], { front: 'x+', st: 'R8', id: 'r8m', screen: [.3, 1.1, 1.7, 1.75], gauges: [[.4, .75, .08], [.75, .75, .08]] });
    tray(B, [xa - 1, 7.4, z + 4.2], [xb + 1, 7.4, z + 4.2], .3);
  });
}
function drawR8x(u) {
  L.draw(BB.r8x, BWX, O.st);
  needle(GAUGES.r80, .1 + .8 * R8S.heat); needle(GAUGES.r81, R8S.fill); needle(GAUGES.r8m0, .2 + .6 * R8S.mix); needle(GAUGES.r8m1, R8S.fill);
  trace('r8', s => s < .3 ? s * 2.4 : s < .8 ? .72 : .72 - (s - .8) * 3, lin(u, CU[0], CU[1]), 1, GLC); trace('r8m', s => s, R8S.fill, 1);
}
/* MT · the inspection and lift station: the floor zone, the cell's cabinet, the ring's cable chain */
function dressMT() {
  BB.mtx = mkB('mtx', B => {
    zone(B, XMO - RL / 2 - 2, ZR.MT - 2.2, XMO + RL / 2 + 2, ZR.MT + 2.2);
    cab(B, [XMO + RL / 2 + 2.6, 0, ZR.MT - 2.4], [XMO + RL / 2 + 3.6, 2.3, ZR.MT], { front: 'x-', st: 'MT', id: 'mt', screen: [.3, 1.3, 1.9, 1.95], gauges: [[2.1, 1.6, .1]], estop: [2.1, 1.1] });
  });
}
function drawMTx(u) {
  L.draw(BB.mtx, BWX, O.st);
  chainW([XMO - RL / 2 - 1.2, .05, ZR.MT - 1.6], XA, YA, INS.x - (XMO - RL / 2 - 1.2), .2, RL + 3, .16, 1);
  needle(GAUGES.mt0, INS.xr * .8 + INS.sc * .5);
  trace('mt', s => .5 + .3 * Math.sin(s * 30) * .3 + .1 * (s > .5 ? 1 : 0), lin(u, INSP[0], INSP[3]), 1);
}

/* ---------------- the rod's journey: the gantry's keys and holds ---------------- */
let PIECE = { st: '', X: mkX(), e: 0, held: false };
function buildJourney() {
  const xe1 = XR + D.Lb / 2 + .26, ytopV = (VY0 + .5) + D.Lb, gx3 = XR + D.Lg / 2 - .4, gx3s = XR + D.Ls / 2 - .4;
  const xF = XF - .4, gxF = xF - .4;                         // the sintered bar's +Z end on the entry table
  const xFe = XF + D.Lf - .5, x5 = XR + RL / 2 + D.crop - .5, x6 = XR + RL / 2 - .5, x7 = XR + RL / 2 - D.LN - .5, x7c = XR + RL / 2 - D.LN - 1.2, xm = XMO + RL / 2 - D.LN - 1.2;
  D.xF = xF;
  GK = [
    [0, -6, 12, -1, 0], [5.3, -6, 12, -1, 0],
    [5.85, xe1, YR, ZR.R1, 0], [6.15, xe1, YR, ZR.R1, 0], [6.4, xe1, 2.8, ZR.R1, 0],
    [7.15, XV, (D.Lb + 1.6), ZR.R2, PI / 2], [7.8, XV, ytopV - .3, ZR.R2, PI / 2], [7.95, XV, ytopV - .3, ZR.R2, PI / 2], [8.35, XV, 9.4, ZR.R2, PI / 2], [8.75, XV + 6, 9.4, ZR.R2 + 2, PI / 2],
    [9.15, XV + 6, 9.4, ZR.R2 + 2, PI / 2], [9.45, XV, 9.4, ZR.R2, PI / 2], [9.75, XV, (VY0 + .5) + D.Lg - .3, ZR.R2, PI / 2], [9.85, XV, (VY0 + .5) + D.Lg - .3, ZR.R2, PI / 2],
    [10.35, XV, (D.Lb + 1.6), ZR.R2, PI / 2], [10.9, gx3, (D.Lb + 1.6), ZR.R3, 0], [11.25, gx3, YR, ZR.R3, 0], [11.32, gx3, YR, ZR.R3, 0], [11.6, gx3, 8, ZR.R3, 0],
    [12.6, gx3s, 8, ZR.R3, 0], [12.95, gx3s, YR, ZR.R3, 0], [13.05, gx3s, YR, ZR.R3, 0], [13.35, gx3s, 5, ZR.R3, 0], [13.85, gxF, 5, ZR.R4, 0], [14.1, gxF, YR, ZR.R4, 0], [14.15, gxF, YR, ZR.R4, 0], [14.45, gxF, 8, ZR.R4, 0],
    [16.55, xFe, 8, ZR.R4, 0], [16.8, xFe, YR, ZR.R4, 0], [16.88, xFe, YR, ZR.R4, 0], [17.15, xFe, 5, ZR.R4, 0], [17.6, x5, 5, ZR.R5, 0], [17.85, x5, YR, ZR.R5, 0], [17.9, x5, YR, ZR.R5, 0], [18.15, x5, 7, ZR.R5, 0],
    [19.6, x6, 7, ZR.R5, 0], [19.9, x6, YR, ZR.R5, 0], [19.95, x6, YR, ZR.R5, 0], [20.2, x6, 5, ZR.R5, 0], [20.55, x6, 5, ZR.R6, 0], [20.8, x6, YR, ZR.R6, 0], [20.85, x6, YR, ZR.R6, 0], [21.1, x6 + 1.5, 7, ZR.R6, 0],
    [23.2, x7, 7, ZR.R6, 0], [23.45, x7, YR, ZR.R6, 0], [23.5, x7, YR, ZR.R6, 0], [23.75, x7, 5, ZR.R6, 0], [24.1, x7, 5, ZR.R7, 0], [24.35, x7, YR, ZR.R7, 0], [24.4, x7, YR, ZR.R7, 0], [24.65, x7, 7, ZR.R7, 0],
    [26.9, x7c, 7, ZR.R7, 0], [27.15, x7c, YR, ZR.R7, 0], [27.2, x7c, YR, ZR.R7, 0], [27.45, x7c, 5, ZR.R7, 0], [27.8, x7c, 5, ZR.R8, 0], [28.0, x7c, YR, ZR.R8, 0], [28.05, x7c, YR, ZR.R8, 0], [28.3, x7c, 8, ZR.R8, 0],
    [30.65, x7c, 8, ZR.R8, 0], [30.9, x7c, YR, ZR.R8, 0], [30.95, x7c, YR, ZR.R8, 0], [31.4, x7c, 12, ZR.R8, 0], [57.0, xm, 12, ZR.MT, 0], [57.8, xm, YR, ZR.MT, 0], [57.9, xm, YR, ZR.MT, 0], [58.4, xm, 12, ZR.MT, 0], [59.6, xm, 12, 30, 0], [80, xm, 12, 30, 0],
  ];
  GH = [[6.15, 7.9, D.Lb / 2 + .26, 'mould'], [9.8, 11.3, D.Lg / 2 - .4, 'green'], [13.0, 14.12, D.Ls / 2 - .4, 'sint'], [16.85, 17.88, RL / 2 + D.crop - .5, 'forged'],
    [19.93, 20.83, RL / 2 - .5, 'turned'], [23.48, 24.38, RL / 2 - D.LN - .5, 'body'], [27.18, 28.03, RL / 2 - D.LN - 1.2, 'cased'], [30.93, 57.88, RL / 2 - D.LN - 1.2, 'cured']];
}
/* where the rod is and what it is, at u (rod frame: +Z the nose) */
function pieceAt(u) {
  const P = PIECE; gantryAt(u);
  if (GP.hold) { P.st = GP.hold[3]; P.held = true; heldPose(P.X, GP.hold[2]); return P; }
  P.held = false;
  if (u < 6.15) { P.st = 'mould'; at(P.X, BWX, XR, YR, ZR.R1, 1, PI / 2); }
  else if (u < 9.8) { P.st = u < 8.45 ? 'mould' : 'cip'; at2(P.X, BWX, XV, (VY0 + .5) + D.Lb / 2, ZR.R2, 2, PI / 2, 1, PI / 2); }
  else if (u < 13.0) { P.st = 'sint'; at(P.X, BWX, XR, YR, ZR.R3, 1, PI / 2); }
  else if (u < 16.85) { P.st = 'forge'; at2(P.X, BWX, 0, YR, ZR.R4, 1, PI / 2, 2, u < FG0 ? 0 : R4S.spin); }
  else if (u < 19.93) { P.st = 'turn'; at2(P.X, BWX, XR, YR, ZR.R5, 1, PI / 2, 2, u > 17.95 && u < 19.8 ? R5S.spin : 0); }
  else if (u < 23.48) { P.st = 'mill'; at2(P.X, BWX, XR, YR, ZR.R6, 1, PI / 2, 2, R6S.spin); }
  else if (u < 27.18) { P.st = 'case'; at(P.X, BWX, XR, YR, ZR.R7, 1, PI / 2); }
  else if (u < 30.93) { P.st = 'fill'; at(P.X, BWX, XR, YR, ZR.R8, 1, PI / 2); }
  else { P.st = 'done'; const R_ = roundAt(u); for (let i = 0; i < 9; i++) P.X.R[i] = R_.R[i]; for (let i = 0; i < 3; i++) P.X.T[i] = R_.T[i]; }
  return P;
}
/* the round (rod frame): the core (tail with its fins, the body, the ogive), the casing's sections on it (ns of them,
   their joints welded), the fill (X-ray: the casing faint, the core and the fill's front seen through it) */
const XRS = mkX();
let XRV = 0;                                                   // the X-ray's share this frame (the fill, the inspection)
function drawRound(X_, ns, nw, o, xr, fillTo) {
  const t0 = -RL / 2, t1 = -RL / 2 + D.LT, f = RL / 2 - D.LN;
  const oc = xr > .02 ? O.xrod : o;
  if (xr > .02) { O.xrod.keep = 1; O.xrod.a = OA_X * (1 - .2 * xr); O.xrod.lime = .25 * xr; }
  run(S_.core, X_, t0, 1, D.LT, oc); capAt(S_.core, X_, t0, oc); for (let k = 0; k < 6; k++) L.draw(BB.fins[k], X_, oc);
  run(S_.trn, X_, t1, 1, f - t1, oc);
  for (let i = 0; i < BB.ogs.length; i++) L.draw(BB.ogs[i], X_, o);
  if (fillTo !== undefined && fillTo > D.zc0) { O.fillo.lime = xr > .02 ? .5 : .1; run(S_.fill, X_, D.zc0, 1, Math.min(D.zc1, fillTo) - D.zc0, O.fillo); }
  const os = xr > .02 ? O.capx : O.heroG;
  if (xr > .02) { O.capx.keep = 1 - .75 * xr; O.capx.a = 1.1 * (1 - .4 * xr); O.capx.lime = .3 * xr; }
  for (let k = 0; k < Math.min(ns, D.NSEC); k++) { at(XRS, X_, 0, 0, D.zc1 - (k + 1) * D.secL); L.draw(BB.sec, XRS, os); }
  for (let k = 0; k < Math.min(nw, D.NSEC + 1); k++) { at(XRS, X_, 0, 0, D.zc1 - k * D.secL); L.draw(BB.jring, XRS, O.heroG); }
}
function drawPiece(u) {
  const P = PIECE, X_ = P.X, st = P.st;
  if (st === 'mould' || st === 'cip') {
    if (st === 'cip') {
      const f = R2S.shrink, S = pickSet(S_.cip, f), Lc = mix(D.Lb, D.Lg, f), z0 = -D.Lb / 2;
      run(S, X_, z0, 1, Lc, O.pow); capAt(S, X_, z0, O.pow); capAt(S, X_, z0 + Lc, O.pow);
      if (f < .98) { O.glass.a = .5 * (1 - f); L.draw(BB.mould, X_, O.glass); }
      return;
    }
    L.draw(BB.mould, X_, O.mcd);
    const fill = P.held ? 1 : R1S.fill;
    if (fill > 0) run(S_.bag, X_, -D.Lb / 2, 1, D.Lb * fill, O.pow);
    return;
  }
  if (st === 'green') { const S = pickSet(S_.cip, 1); run(S, X_, -D.Lg / 2, 1, D.Lg, O.pow); capAt(S, X_, -D.Lg / 2, O.pow); capAt(S, X_, D.Lg / 2, O.pow); return; }
  if (st === 'sint') {
    const inF = u < 13.0, f = inF ? R3S.shrink : 1, S = pickSet(S_.sint, f), Ln = mix(D.Lg, D.Ls, f);
    const h = inF ? R3S.heat : .55, o = h > .03 ? O.hot : O.pow;
    if (h > .03) heatCol(o, h);
    run(S, X_, -Ln / 2, 1, Ln, o); capAt(S, X_, -Ln / 2, o); capAt(S, X_, Ln / 2, o);
    if (h > .05) glowAlong(X_, -Ln / 2, Ln / 2, h * .8);
    return;
  }
  if (st === 'forge') {
    // bay-x along the local z: the unforged part (anchored at the tail end) and the forged (anchored at its far end)
    const f = R4S.f, k = D.Lf / (D.Ls - D.LT), xt = R4S.xt, h = .55 + .25 * R4S.ind;
    heatCol(O.hot, h);
    const S = S_.sint[S_.sint.length - 1];
    const lu = Math.min(D.Ls, XF - xt);
    run(S, X_, xt, 1, lu, O.hot); capAt(S, X_, xt, O.hot);
    if (f > .01) { const xe = XF + f * k; heatCol(O.hot2, .7); run(S_.frg, X_, xe, -1, f * k, O.hot2); capAt(S_.frg, X_, xe, O.hot2); }
    else capAt(S, X_, xt + lu, O.hot);
    // the glow at the dies and the coil
    apX(BWX, XF + .5, YR, ZR.R4, PW); K.glowW(PW[0], PW[1], PW[2], 80, GLC, .4 * R4S.ham + .12); apX(BWX, XF - .5, YR, ZR.R4, PW); K.glowW(PW[0], PW[1], PW[2], 60, GLC, .3 * R4S.ham + .1);
    if (R4S.ind > .05) { apX(BWX, (COIL_X[0] + COIL_X[1]) / 2, YR, ZR.R4, PW); K.glowW(PW[0], PW[1], PW[2], 50, HOT, .3 * R4S.ind); }
    glowAlong(X_, xt, XF + f * k, .45);
    return;
  }
  if (st === 'forged') {
    heatCol(O.hot, .35);
    run(S_.sint[S_.sint.length - 1], X_, -RL / 2, 1, D.LT, O.hot); capAt(S_.sint[S_.sint.length - 1], X_, -RL / 2, O.hot);
    run(S_.frg, X_, RL / 2 + D.crop, -1, RL + D.crop - D.LT, O.hot); capAt(S_.frg, X_, RL / 2 + D.crop, O.hot);
    return;
  }
  if (st === 'turn') {
    const tc = u < 18.0 ? RL / 2 + D.crop : R5S.tc, gc = R5S.gc, t1 = -RL / 2 + D.LT, end = RL / 2 + D.crop * (1 - kk(u, 18.0, 18.15));
    const oF = O.forg, oT = u > GRIND[0] ? O.hero : O.heroD, oG = O.heroG;
    // the tail section (rs): forged-rough until the tool passes it
    const Sd = S_.sint[S_.sint.length - 1];
    run(Sd, X_, -RL / 2, 1, D.LT, tc < t1 ? (gc > t1 ? oG : oT) : oF); capAt(Sd, X_, -RL / 2, oF);
    // the body: rough (rf) above the tool... turned (RR) below it ... ground below the wheel
    const top = Math.max(t1, Math.min(end, tc));
    if (end > top) run(S_.frg, X_, end, -1, end - top, oF);
    capAt(top < end ? S_.frg : S_.trn, X_, end, oT);
    if (top > t1) {
      if (gc > t1) { const g = Math.min(gc, top); run(S_.trn, X_, t1, 1, g - t1, oG); if (top > g) run(S_.trn, X_, top, -1, top - g, oT); }
      else run(S_.trn, X_, top, -1, top - t1, oT);
    }
    if (u < 18.0) { /* the turned marks */ }
    return;
  }
  if (st === 'turned') { const t1 = -RL / 2 + D.LT, Sd = S_.sint[S_.sint.length - 1]; run(Sd, X_, -RL / 2, 1, D.LT, O.heroG); capAt(Sd, X_, -RL / 2, O.heroG); run(S_.trn, X_, t1, 1, RL - D.LT, O.heroG); capAt(S_.trn, X_, RL / 2, O.heroG); return; }
  if (st === 'mill') {
    const t1 = -RL / 2 + D.LT, zf = RL / 2 - D.LN, fin = R6S.fin;
    // the tail: the stock's facets (the slots fade as they are cut), the core and fins as they appear
    if (fin > .01) { run(S_.core, X_, -RL / 2, 1, D.LT, O.hero); for (let k = 0; k < 6; k++) if (fin > k + .85) L.draw(BB.fins[k], X_, O.hero); }
    L.draw(BB.stock, X_, O.heroG);
    capAt(S_.sint[S_.sint.length - 1], X_, -RL / 2, O.heroG);
    // the body, the nose (blank above the contouring front, the ogive's slices beyond it), then the cap leaves
    run(S_.trn, X_, t1, 1, zf - t1, O.heroG);
    {
      const oz = R6S.oz; if (oz > zf + .001) run(S_.trn, X_, zf, 1, oz - zf, O.heroG);
      if (oz < RL / 2 - .01) capAt(S_.trn, X_, oz, O.heroG);
      const NS = BB.ogs.length; for (let i = 0; i < NS; i++) { const sa = zf + D.LN * i / NS; if (sa >= oz - 1e-4) L.draw(BB.ogs[i], X_, O.hero); }
      if (oz > RL / 2 - .01) capAt(S_.trn, X_, RL / 2, O.heroG);
    }
    return;
  }
  const N = D.NSEC;
  if (st === 'body') { drawRound(X_, 0, 0, O.heroG, 0); return; }
  if (st === 'case') { let nw = 0; for (let k = 0; k < N; k++) if (u > CSW(k)[4]) nw++; if (u > CSEND + .17) nw++; drawRound(X_, nSecOn(u), nw, O.heroG, 0); return; }
  if (st === 'cased') { drawRound(X_, N, N + 1, O.heroG, 0); return; }
  if (st === 'fill') { XRV = ss(FL[0] - .12, FL[0] + .03, u) * (1 - ss(FL[1] + .02, FL[1] + .15, u)); drawRound(X_, N, N + 1, O.heroG, XRV, u < FL[0] ? undefined : D.zc0 + (D.zc1 - D.zc0) * R8S.fill); return; }
  if (st === 'cured' || st === 'done') { XRV = INS.xr; drawRound(X_, N, N + 1, O.heroG, XRV); return; }
}

/* ---------------- the lime scan: a plane sweeping a part's box (its frame), the films' identification look ---------------- */
const SW0 = [0, 0, 0], SW1 = [0, 0, 0], SWC = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
function sweep(X_, mn, mx, ax, p, a) {
  if (a < .01 || p <= 0 || p >= 1) return;
  const b1 = (ax + 1) % 3, b2 = (ax + 2) % 3, v = mn[ax] + (mx[ax] - mn[ax]) * p;
  for (let k = 0; k < 4; k++) { const c = SWC[k]; c[ax] = v; c[b1] = k & 1 ? mx[b1] : mn[b1]; c[b2] = k & 2 ? mx[b2] : mn[b2]; }
  for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0]]) { apX(X_, SWC[i][0], SWC[i][1], SWC[i][2], SW0); apX(X_, SWC[j][0], SWC[j][1], SWC[j][2], SW1); K.lineW(SW0[0], SW0[1], SW0[2], SW1[0], SW1[1], SW1[2], 1.6, 2, LIME, a); }
  // a sparse grid on the plane and a glow at its centre
  for (let i = 1; i < 6; i++) { const t = i / 6; SWC[0][b1] = mn[b1] + (mx[b1] - mn[b1]) * t; SWC[0][b2] = mn[b2]; SWC[1][b1] = SWC[0][b1]; SWC[1][b2] = mx[b2]; SWC[0][ax] = SWC[1][ax] = v; apX(X_, SWC[0][0], SWC[0][1], SWC[0][2], SW0); apX(X_, SWC[1][0], SWC[1][1], SWC[1][2], SW1); K.lineW(SW0[0], SW0[1], SW0[2], SW1[0], SW1[1], SW1[2], 4, 1, LIME, .35 * a); }
  SWC[0][ax] = v; SWC[0][b1] = (mn[b1] + mx[b1]) / 2; SWC[0][b2] = (mn[b2] + mx[b2]) / 2; apX(X_, SWC[0][0], SWC[0][1], SWC[0][2], SW0); K.glowW(SW0[0], SW0[1], SW0[2], 40, LIME, .22 * a);
}
const SCANS = [];                                            // [u0, u1, key, label, value, frame fn, mn, mx, axis]

/* ======================== the capsule line (starboard, the clean side; its stations run toward -z) ======================== */
const WRAD = .15, LX = XC;                                   // the wafer (300 mm); the scanner's centre line
/* the exposure fields (26 x 33 mm) wholly on the wafer, column by column (serpentine) */
const FIELDS = (() => {
  const A = [];
  for (let i = 0; i < 11; i++) {
    const x = (i - 5) * .026, col = [];
    for (let j = 0; j < 9; j++) { const z = (j - 4) * .033; let ok = true; for (const [dx, dz] of [[-.013, -.0165], [.013, -.0165], [-.013, .0165], [.013, .0165]]) if (Math.hypot(x + dx, z + dz) > .147) ok = false; if (ok) col.push([x, z]); }
    if (i % 2) col.reverse(); A.push(...col);
  }
  return A;
})();
const NF = FIELDS.length, EXP0 = 35.5, EXPDT = .068;
const WP = { x: 0, y: 0, z: 0, yaw: 0, st: '' };

/* ---------------- C1 · wafer handling ---------------- */
const C1 = { z: ZC.C1, foup: [9.62, 1.08, ZC.C1 + .3], pre: [6.5, 1.07, ZC.C1 - .55], hand: [5.85, 1.07, ZC.C1 + .55], ry: .9 };
const SC1 = .4, SC2 = .48;                                   // the SCARA's links (to the blade's centre)
function buildC1() {
  const z = C1.z;
  BB.c1 = mkB('c1', B => {
    B.chunk('frame');
    for (const x of [5.6, 9.4]) for (const zz of [z - 1.1, z + 1.1]) B.tube([x, 0, zz], [x, 2.5, zz], .035, .6);
    for (const y of [.9, 2.5]) { B.line([5.6, y, z - 1.1], [9.4, y, z - 1.1], .5); B.line([5.6, y, z + 1.1], [9.4, y, z + 1.1], .5); B.line([5.6, y, z - 1.1], [5.6, y, z + 1.1], .5); B.line([9.4, y, z - 1.1], [9.4, y, z + 1.1], .5); }
    bx(B, 5.6, .72, z - 1.1, 9.4, .9, z + 1.1, .05, { br: .75, occ: 'c1' });
    B.panel([9.4, .9, z - 1.1], [0, 0, 2.2], [0, 1.6, 0], .12, { n: [-1, 0, 0], br: .1, edge: .3, two: true });
    bx(B, 7.9, 2.35, z - .6, 9.1, 2.5, z + .6, .04, { br: .7 });               // the fan filter unit
    bx(B, 6.6, .9, z - .06, 9.0, .96, z + .06, .02, { br: .7 });                // the robot's track (along x)
    // the load port and the FOUP (its slots), the prealigner
    B.chunk('foup');
    bx(B, 9.4, 0, C1.foup[2] - .45, 9.95, .9, C1.foup[2] + .45, .05, { br: .85, occ: 'c1' });
    bx(B, 9.45, .9, C1.foup[2] - .21, 9.9, 1.28, C1.foup[2] + .21, .02, { br: .95, skip: ['x-'] });
    for (let k = 0; k < 13; k++) B.line([9.5, .95 + k * .025, C1.foup[2] - .17], [9.5, .95 + k * .025, C1.foup[2] + .17], .4);
    B.knot([9.92, .95, C1.foup[2] + .35], .06, 1, 3, 1020);
    B.chunk('pre'); B.cyl([C1.pre[0], .9, C1.pre[2]], [C1.pre[0], 1.04, C1.pre[2]], .08, { cell: .01, br: .9, caps: true });
    bx(B, C1.pre[0] - .2, .9, C1.pre[2] + .12, C1.pre[0] - .14, 1.15, C1.pre[2] + .2, .01, { br: 1 });
    B.chunk('track');                                        // the wafer track along the clean room's aisle side
    bx(B, 3.82, .88, 26.4, 4.18, .98, 55.2, .25, { br: .5, edge: .55 });
    for (let zz = 27; zz < 55; zz += 3) B.tube([4.0, 0, zz], [4.0, .88, zz], .03, .45);
  });
  BB.foupDoor = mkB('fd', B => B.box([-.01, 0, -.2], [.01, .37, .2], .02, { br: .9, edge: .8 }));
  // the SCARA: a column on the track, two links, the blade (a fork under the wafer)
  BB.sc0 = mkB('s0', B => { B.box([-.16, 0, -.13], [.16, .08, .13], .02, { br: .9, edge: .8 }); B.cyl([0, .08, 0], [0, .2, 0], .1, { cell: .015, br: .9, caps: true }); bolts(B, [0, .201, 0], XA, ZA, .085, 8, .008); for (const s of [-1, 1]) B.knot([s * .12, .081, .1], .015, 1, 3, lightQ(s > 0 ? 7 : 5, 'C1', 5)); hose(B, [[-.16, .04, 0], [-.3, .02, .1], [-.5, .0, .1]], .02, .5); });
  BB.sc1 = mkB('s1', B => { B.box([0, -.03, -.05], [SC1, .03, .05], .015, { br: 1, edge: .85 }); B.cyl([0, -.04, 0], [0, .04, 0], .07, { cell: .012, br: .9, caps: true }); });
  BB.sc2 = mkB('s2', B => { B.box([0, -.025, -.04], [SC2 - .2, .025, .04], .012, { br: 1, edge: .85 }); B.cyl([0, -.03, 0], [0, .03, 0], .055, { cell: .01, br: .9, caps: true }); B.box([SC2 - .2, -.004, -.03], [SC2 + .1, .004, .03], .006, { br: 1, edge: .9 }); });
  BB.wafer = mkB('wf', B => {
    const n = 24;
    for (let k = 0; k < n; k++) { const z0 = -WRAD + 2 * WRAD * k / n, z1 = z0 + 2 * WRAD / n, zm = Math.min(Math.abs(z0), Math.abs(z1)), h = Math.sqrt(Math.max(0, WRAD * WRAD - zm * zm)) - .002; if (h < .01) continue; B.panel([-h, 0, z0], [2 * h, 0, 0], [0, 0, z1 - z0], .0035, { n: YA, br: 1, two: true, edge: false }); }
    B.ringP([0, .0008, 0], XA, ZA, WRAD, 1); B.ringP([0, .0008, 0], XA, ZA, WRAD - .003, .6);
    B.line([-.006, .0009, WRAD - .004], [.006, .0009, WRAD - .004], 1);
  }, 1);
  BB.wgrid = mkB('wg', B => { for (const f of FIELDS) { const x0 = f[0] - .013, x1 = f[0] + .013, z0 = f[1] - .0165, z1 = f[1] + .0165, y = .0009; B.line([x0, y, z0], [x1, y, z0], .5); B.line([x1, y, z0], [x1, y, z1], .5); B.line([x1, y, z1], [x0, y, z1], .5); B.line([x0, y, z1], [x0, y, z0], .5); } });
  BB.carrier = mkB('wc', B => { B.box([-.17, -.06, -.17], [.17, -.008, .17], .02, { br: .9, edge: .8 }); });
  BB.tape = mkB('tp', B => { B.lathe([0, -.001, 0], YA, [[0, .19], [0, .225]], { cell: .006, br: .85, two: true }); B.ringP([0, 0, 0], XA, ZA, .225, .9); B.ringP([0, 0, 0], XA, ZA, .19, .6); });
}
/* the SCARA: its column's x on the track, its links to put the blade's centre at (px, pz) */
const SCA = { cx: 7.6, a0: 0, a1: 0 };
function scaraTo(cx, px, pz) {
  SCA.cx = cx;
  const dx = px - cx, dz = pz - C1.z, d = Math.min(SC1 + SC2 - .01, Math.max(.12, Math.hypot(dx, dz)));
  const c = E.clamp((d * d - SC1 * SC1 - SC2 * SC2) / (2 * SC1 * SC2), -1, 1), e = Math.acos(c);
  SCA.a0 = Math.atan2(dz, dx) + Math.atan2(SC2 * Math.sin(e), SC1 + SC2 * Math.cos(e)); SCA.a1 = SCA.a0 - e;
}
/* the wafer through C1 to the scanner's measuring table */
const W1 = { door: [30.9, 31.2], pick: [31.2, 31.5], toPre: [31.5, 31.9], spin: [32.0, 32.55], toHand: [32.6, 33.0], track: [33.05, 34.45], inL: [34.45, 34.75] };
function c1Wafer(u) {
  const f = C1.foup, p = C1.pre, h = C1.hand;
  WP.yaw = 0; WP.st = 'scara';
  if (u < W1.pick[0]) { WP.x = f[0]; WP.y = f[1]; WP.z = f[2]; WP.st = 'foup'; return; }
  if (u < W1.pick[1]) { const w = kk(u, W1.pick[0] + .1, W1.pick[1]); WP.x = mix(f[0], 8.9, w); WP.y = f[1]; WP.z = f[2]; return; }
  if (u < W1.toPre[1]) { const w = kk(u, W1.toPre[0], W1.toPre[1]); WP.x = mix(8.9, p[0], w); WP.y = mix(f[1], p[1] + .015, w); WP.z = mix(f[2], p[2], w); return; }
  if (u < W1.toHand[0]) { WP.x = p[0]; WP.y = p[1]; WP.z = p[2]; WP.yaw = u < W1.spin[0] ? 0 : (u - W1.spin[0]) * 11; WP.st = 'pre'; return; }
  if (u < W1.toHand[1]) { const w = kk(u, W1.toHand[0], W1.toHand[1]); WP.x = mix(p[0], h[0], w); WP.y = p[1] + .015; WP.z = mix(p[2], h[2], w); WP.yaw = (W1.toHand[0] - W1.spin[0]) * 11; return; }
  WP.yaw = (W1.toHand[0] - W1.spin[0]) * 11; WP.st = 'track';
  if (u < W1.track[0] + .3) { const w = kk(u, W1.toHand[1], W1.track[0] + .3); WP.x = mix(h[0], 4.0, w); WP.y = h[1] + .015; WP.z = h[2]; return; }
  if (u < W1.track[1]) { const w = kk(u, W1.track[0] + .3, W1.track[1]); WP.x = 4.0; WP.y = h[1] + .015; WP.z = mix(h[2], MEAS_Z, w); return; }
  const w = kk(u, W1.inL[0], W1.inL[1]); WP.x = mix(4.0, LX, w); WP.y = mix(h[1] + .015, EXPO[1], w); WP.z = MEAS_Z; WP.st = w < .5 ? 'track' : 'litho';
}
function drawC1(u) {
  const z = C1.z;
  L.draw(BB.c1, BWX, O.st);
  at(XF4, BWX, 9.45, .9 - .38 * kk(u, W1.door[0], W1.door[1]), C1.foup[2]); L.draw(BB.foupDoor, XF4, O.mc);
  // the SCARA: its column runs along the track to stay in reach; the blade under the wafer while it holds it
  let cx = 7.6, tx = 7.2, tz = z - .2;
  if (u > 34.5) { cx = 7.6; }
  else if (u > W1.door[0] && u < W1.pick[1]) { cx = mix(7.6, 8.6, kk(u, W1.door[0], W1.pick[0])); tx = u < W1.pick[0] ? mix(7.2, 8.95, kk(u, W1.door[0], W1.pick[0])) : WP.x; tz = u < W1.pick[0] ? mix(z - .2, C1.foup[2], kk(u, W1.door[0], W1.pick[0])) : WP.z; }
  else if (WP.st === 'scara') { cx = mix(8.6, 7.0, kk(u, W1.toPre[0], W1.toPre[1])); if (u > W1.toHand[0]) cx = 7.0; tx = WP.x; tz = WP.z; }
  else if (WP.st === 'pre') { cx = 7.0; const w = kk(u, W1.toPre[1], W1.spin[0]) * (1 - kk(u, W1.spin[1], W1.toHand[0])); tx = mix(C1.pre[0], 7.15, w); tz = mix(C1.pre[2], z - .4, w); }
  else { cx = mix(7.0, 7.6, kk(u, W1.toHand[1], W1.toHand[1] + .4)); tx = mix(C1.hand[0], 7.2, kk(u, W1.toHand[1], W1.toHand[1] + .4)); tz = mix(C1.hand[2], z - .2, kk(u, W1.toHand[1], W1.toHand[1] + .4)); }
  scaraTo(cx, tx, tz);
  const y0 = .9;
  at(XF4, BWX, cx, y0, z); L.draw(BB.sc0, XF4, O.mc);
  at(XF4, BWX, cx, y0 + .22, z, 1, -SCA.a0); L.draw(BB.sc1, XF4, O.mc);
  at(XF4, BWX, cx + Math.cos(SCA.a0) * SC1, y0 + .27, z + Math.sin(SCA.a0) * SC1, 1, -SCA.a1); L.draw(BB.sc2, XF4, O.mc);
  if (WP.st === 'pre' && u > W1.spin[0] && u < W1.spin[1]) {    // the notch finder: a lime beam across the edge
    apX(BWX, C1.pre[0] - .17, 1.13, C1.pre[2] + .16, PW); apX(BWX, C1.pre[0] - .17, 1.0, C1.pre[2] + .16, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1.5, 2, LIME, .9);
    apX(BWX, C1.pre[0] - .14, 1.07, C1.pre[2] + .13, PW); K.glowW(PW[0], PW[1], PW[2], 12, LIME, .6);
  }
}

/* ---------------- C2 · EUV lithography ---------------- */
const LP = {                                                 // the light's path (x = LX): [y, z]
  pl: [2.0, 47.6], IF: [2.0, 45.95], ffm: [1.62, 44.85], pfm: [3.12, 45.4], gi: [3.24, 44.2], ret: [3.29, 42.65],
  M: [[2.6, 43.2], [3.05, 41.9], [2.1, 42.95], [2.75, 41.75], [1.6, 42.1], [2.3, 42.75]], waf: [.995, 42.4],
};
const LPATH = [];
const EXPO = [LX, .995, 42.4], MEAS_Z = 44.2;
function mirN3(a, m, b) { return V.norm(V.add(V.norm(V.sub(a, m)), V.norm(V.sub(b, m)))); }
function buildC2() {
  for (const [y, z] of [LP.IF, LP.ffm, LP.pfm, LP.gi, LP.ret, ...LP.M, LP.waf]) LPATH.push([LX, y, z]);
  BB.c2 = mkB('c2', B => {
    // the stage block (granite), the alignment head over the measuring side
    B.chunk('granite'); bx(B, 5.0, 0, 40.6, 10.0, .8, 45.2, .08, { br: .75, occ: 'c2' });
    for (let k = 1; k < 6; k++) B.line([5.0, .801, 40.6 + k * .766], [10.0, .801, 40.6 + k * .766], .25);
    B.chunk('align'); bx(B, LX - .22, 1.38, MEAS_Z - .2, LX + .22, 1.62, MEAS_Z + .2, .02, { br: .95 }); B.tube([LX, 1.62, MEAS_Z], [LX, 3.4, MEAS_Z + .4], .05, .6);
    B.chunk('pob'); bx(B, 6.7, 1.2, 41.55, 8.3, 3.25, 43.45, .07, { br: .45, edge: .7 });
    B.chunk('rsb'); bx(B, 6.4, 3.42, 40.9, 8.6, 3.56, 44.3, .05, { br: .7 }); bx(B, 6.4, 3.29, 40.9, 6.7, 3.42, 44.3, .04, { br: .7 }); bx(B, 8.3, 3.29, 40.9, 8.6, 3.42, 44.3, .04, { br: .7 });
    B.chunk('ill'); bx(B, 6.7, 1.3, 43.55, 8.3, 3.38, 45.75, .08, { br: .42, edge: .7 });
    // the facet mirrors: grids of small mirrors (each lights as the light reaches it)
    for (const [a, c, b] of [[LP.IF, LP.ffm, LP.pfm], [LP.ffm, LP.pfm, LP.gi]]) {
      const n = mirN3([LX, a[0], a[1]], [LX, c[0], c[1]], [LX, b[0], b[1]]), [U, W] = L.perp(n);
      B.chunk('fm');
      for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) B.knot([LX + U[0] * i * .045 + W[0] * j * .045, c[0] + U[1] * i * .045 + W[1] * j * .045, c[1] + U[2] * i * .045 + W[2] * j * .045], .036, 1, 15, 2);
      // its mount: a backing plate, a strut back to a hub, the hub's arm to the frame's wall (x 6.7)
      const cc = [LX, c[0], c[1]], bp = V.mad(cc, n, -.03), hub = V.mad(cc, n, -.22);
      B.panel(add(add(bp, mul(U, -.17)), mul(W, -.12)), mul(U, .34), mul(W, .24), .02, { n: mul(n, -1), br: .55, edge: .9, two: true });
      for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.line(add(add(bp, mul(U, su * .14)), mul(W, sw * .09)), hub, .7);
      B.knot(hub, .03, .9); B.tube(hub, [6.72, hub[1], hub[2]], .02, .75); B.ringP([6.73, hub[1], hub[2]], YA, ZA, .05, .8);
    }
    // the source vessel: its cone to the intermediate focus, the drum, the droplet generator and catcher
    B.chunk('src');
    B.lathe([LX, 2.0, 45.85], ZA, [[0, .07], [.95, .78], [2.45, .8], [2.55, .5], [2.55, .12]], { cell: .04, br: .62, two: true, rings: true, rbr: .8, seams: 12, sbr: .5 });
    B.cyl([LX, 2.88, 47.6], [LX, 3.45, 47.6], .07, { cell: .015, br: .95, caps: true }); bx(B, LX - .18, 3.45, 47.42, LX + .18, 3.75, 47.78, .02, { br: .95 });
    B.cyl([LX, 1.12, 47.6], [LX, .65, 47.6], .09, { cell: .015, br: .9, caps: true });
    B.knot([LX + .2, 3.76, 47.6], .06, 1, 3, 1021);
    // the drive laser (CO2): its box, four amplifier tubes, the beam's tube up and over to the collector
    B.chunk('laser'); bx(B, 5.2, 0, 48.9, 9.8, 1.5, 51.8, .08, { br: .7, occ: 'c2' });
    for (const x of [5.9, 6.95, 8.05, 9.1]) B.cyl([x, 1.75, 49.1], [x, 1.75, 51.6], .22, { cell: .05, br: .85, caps: true, seams: 4 });
    B.cyl([LX, 1.5, 50.4], [LX, 2.0, 50.4], .1, { cell: .02, br: .8 }); B.cyl([LX, 2.0, 50.4], [LX, 2.0, 48.42], .1, { cell: .02, br: .6, two: true });
    B.knot([9.75, 1.55, 49.0], .07, 1, 3, 1022);
    // the scanner's covers (dim: the machine is shown in X-ray)
    B.chunk('cov');
    B.panel([4.6, 0, 40.2], [0, 3.95, 0], [0, 0, 8.4], .4, { n: [-1, 0, 0], br: .12, edge: .45 });
    B.panel([10.4, 0, 40.2], [0, 0, 8.4], [0, 3.95, 0], .4, { n: XA, br: .12, edge: .45 });
    B.panel([4.6, 3.95, 40.2], [0, 0, 8.4], [5.8, 0, 0], .4, { n: YA, br: .1, edge: .45 });
    B.panel([4.6, 0, 40.2], [5.8, 0, 0], [0, 3.95, 0], .4, { n: [0, 0, -1], br: .12, edge: .45 });
    B.chunk('ll'); bx(B, 4.15, .7, MEAS_Z - .3, 4.65, 1.25, MEAS_Z + .3, .03, { br: .9 });
  });
  BB.coll = mkB('col', B => { const st = []; for (let k = 0; k <= 8; k++) { const r = .05 + .28 * k / 8; st.push([-.12 * (r / .33) * (r / .33), r]); } B.lathe([LX, 2.0, 48.12], ZA, st, { cell: .012, br: 1, two: true, rings: false, ch: 15, q: 1 }); B.ringP([LX, 2.0, 48.12 - .12 * .9], XA, YA, .33, 1, 15, 1); });
  BB.mirs = mkB('mir', B => {
    const P = LPATH;
    for (let i = 3; i < P.length - 1; i++) {
      if (i === 4) continue;                                 // (the reticle is its own body)
      const m = P[i], n = mirN3(P[i - 1], m, P[i + 1]), [U, W] = L.perp(n), r = i === 3 ? .16 : .13 + .03 * (i % 3);
      B.chunk('m' + i);
      B.lathe(V.mad(m, n, -.002), n, [[0, 0], [0, r]], { cell: .005, br: 1.2, two: true, rings: false, ch: 15, q: 10 + i });
      B.ringP(m, U, W, r, 1, 15, 10 + i); B.lathe(V.mad(m, n, -.06), n, [[0, r * .95], [.05, r * .95]], { cell: .015, br: .6 });
      // the mirror's cell on three flexure legs to a hub, the hub on an arm from the optics box's frame (x 6.7)
      const hub = V.mad(m, n, -.24); B.lathe(V.mad(m, n, -.11), n, [[0, r * .3], [.03, r * .3]], { cell: .01, br: .8, caps: true });
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .5, p = add(V.mad(m, n, -.08), add(mul(U, Math.cos(a) * r * .9), mul(W, Math.sin(a) * r * .9))); B.line(p, hub, .75); B.knot(p, .012, .9); }
      B.knot(hub, .03, .95); B.tube(hub, [6.72, hub[1], hub[2]], .02, .75); B.ringP([6.73, hub[1], hub[2]], YA, ZA, .05, .8);
      for (const s_ of [-1, 1]) B.line(add(hub, [0, s_ * .04, 0]), [6.72, hub[1] + s_ * .12, hub[2]], .5);
    }
  });
  BB.reticle = mkB('ret', B => { B.box([-.125, .0, -.125], [.125, .05, .125], .015, { br: .9, edge: .8 }); B.box([-.076, -.007, -.076], [.076, 0, .076], .006, { br: 1, edge: 1, ch: 15, q: 5 }); for (let k = -3; k <= 3; k++) B.line([-.07, -.0072, k * .02], [.07, -.0072, k * .02], .6, 15, 5); });
  BB.wtable = mkB('wt', B => { B.box([-.3, -.15, -.3], [.3, -.005, .3], .02, { br: .9, edge: .85 }); B.lathe([0, -.005, 0], YA, [[0, .152], [.005, .152]], { cell: .01, br: .8 }); for (const [x, zz] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) B.knot([x, -.005, zz], .03, 1); });
}
/* the exposure: the current field and its scan; the stage's and the reticle's offsets */
const EXS = { k: -1, s: 0, on: 0, wx: 0, wz: 0, rz: 0, swap: 0, tz: 0 };
function c2State(u) {
  const t = (u - EXP0) / EXPDT;
  EXS.k = u < EXP0 ? -1 : Math.min(NF - 1, Math.floor(t)); EXS.s = u < EXP0 ? 0 : Math.min(1, t - EXS.k);
  EXS.on = ss(EXP0 - .2, EXP0, u) * (1 - ss(40.0, 40.15, u)) * (t < NF ? 1 : 0);
  const f = EXS.k >= 0 ? FIELDS[EXS.k] : [0, 0], fn = EXS.k >= 0 && EXS.k < NF - 1 ? FIELDS[EXS.k + 1] : f;
  const scan = EXS.s < .72 ? (EXS.s / .72 - .5) * .033 * (EXS.k % 2 ? -1 : 1) : 0, st = EXS.s < .72 ? 0 : kk(EXS.s, .72, 1);
  EXS.wx = EXS.k < 0 ? 0 : -mix(f[0], fn[0], st); EXS.wz = EXS.k < 0 ? 0 : -(mix(f[1], fn[1], st) + scan);
  EXS.rz = EXS.k < 0 ? 0 : 4 * scan;
  EXS.swap = kk(u, 35.0, 35.4);                               // the two wafer tables trade places
  EXS.tz = mix(MEAS_Z, EXPO[2], EXS.swap);
}
const LPK = [0, 0, 0], SEGL = [];
/* a lime stream along a polyline: a faint dotted line, bright packets flowing */
function lightPath(P, u, a, speed, gap) {
  if (a < .01) return;
  if (!SEGL.length) for (let i = 1; i < P.length; i++) SEGL.push(V.dist(P[i - 1], P[i]));
  let Ltot = 0;
  for (let i = 1; i < P.length; i++) {
    const p = P[i - 1], q = P[i], w = .045 * (i < 5 ? 1.4 : 1);
    for (let j = -2; j <= 2; j++) {
      const ox = j * w / 2;
      apX(BWX, p[0] + ox, p[1], p[2], PW); apX(BWX, q[0] + ox, q[1], q[2], PW2);
      K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], j ? 3 : 2, 1, LIME, (j ? .38 : .7) * a);
    }
    apX(BWX, q[0], q[1], q[2], PW); K.glowW(PW[0], PW[1], PW[2], 26, LIME, .35 * a);
    Ltot += SEGL[i - 1];
  }
  const head = (u * speed) % gap;
  for (let s = head; s < Ltot; s += gap) {
    let rem = s, i = 1; while (i < P.length - 1 && rem > SEGL[i - 1]) { rem -= SEGL[i - 1]; i++; }
    const p = P[i - 1], q = P[i], d = SEGL[i - 1], k = Math.min(1, rem / d);
    for (let j = 0; j < 7; j++) {
      const kj = Math.max(0, k - j * .012 / d);
      apX(BWX, p[0] + (q[0] - p[0]) * kj, p[1] + (q[1] - p[1]) * kj, p[2] + (q[2] - p[2]) * kj, LPK);
      K.dotW(LPK[0], LPK[1], LPK[2], j ? 1 : 2, j ? LIME : HOT, a * (1 - j / 7));
    }
  }
}
const DPAT = [[-.8, .15, -.05, .8], [.05, .15, .8, .8], [-.8, -.55, .2, .05], [.32, -.55, .8, -.18], [-.75, -.9, .75, -.84], [-.75, .84, .75, .9]];
let DPON = false;
function drawC2(u) {
  DPON = U_ > BW_.AI2[0] + 3 && U_ < BW_.AI2[1] + 2;
  const xr = ss(33.2, 33.9, u) * (1 - ss(40.3, 41.0, u)), on = ss(33.6, 34.4, u) * (1 - ss(40.1, 40.5, u));
  O.mcx.keep = .9 - .5 * xr; O.mcx.a = .92 - .35 * xr;
  L.draw(BB.c2, BWX, xr > .02 ? O.mcx : O.st);
  L.draw(BB.coll, BWX, O.mc); L.draw(BB.mirs, BWX, O.mc);
  // the reticle scans opposite the wafer, four times as far
  at(XF4, BWX, LX, 3.29, LP.ret[1] + EXS.rz); L.draw(BB.reticle, XF4, O.hero);
  // the two wafer tables: ours (under the wafer) and the other one
  at(XF4, BWX, LX + EXS.wx * EXS.swap, EXPO[1] - .002, EXS.tz + EXS.wz * EXS.swap); L.draw(BB.wtable, XF4, O.mc);
  at(XF4, BWX, LX, EXPO[1] - .002, mix(EXPO[2], MEAS_Z, EXS.swap) - (1 - EXS.swap) * 0); L.draw(BB.wtable, XF4, O.mc);
  if (on < .01) return;
  // tin droplets (strobed), the drive laser's pulse, the plasma's flashes
  const pl = LP.pl, fr = Math.floor(u * 30);
  for (let k = 0; k < 16; k++) { const y = 2.86 - ((k * .055 + u * .5) % .86); if (y < pl[0] - .02) continue; apX(BWX, LX, y, pl[1], PW); K.dotW(PW[0], PW[1], PW[2], 3, WH, on); K.glowW(PW[0], PW[1], PW[2], 6, WH, .25 * on); }
  const fl = .55 + .45 * hh(fr, 3.1);
  for (const o_ of [-.012, 0, .012]) { apX(BWX, LX + o_, 2.0, 50.3, PW); apX(BWX, LX + o_, pl[0], pl[1] + .01, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, HOT, (o_ ? .45 : .9) * on); }
  apX(BWX, LX, pl[0], pl[1], PW); K.glowW(PW[0], PW[1], PW[2], 110, HOT, .5 * on * fl); K.glowW(PW[0], PW[1], PW[2], 34, [255, 255, 255], on * fl); K.glowW(PW[0], PW[1], PW[2], 60, LIME, .25 * on);
  // the collector's light: out to its rim, in to the intermediate focus
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU + .2, ry = Math.cos(a) * .31, rz = Math.sin(a) * .31, cz = 48.12 - .12 * .88;
    apX(BWX, LX, pl[0], pl[1], PW); apX(BWX, LX + rz, 2.0 + ry, cz, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 3, 1, LIME, .35 * on);
    apX(BWX, LX, LP.IF[0], LP.IF[1], PW); K.lineW(PW2[0], PW2[1], PW2[2], PW[0], PW[1], PW[2], 3, 1, LIME, .45 * on);
  }
  apX(BWX, LX, LP.IF[0], LP.IF[1], PW); K.glowW(PW[0], PW[1], PW[2], 26, LIME, .5 * on);
  lightPath(LPATH, u, on, 2.6, .34);
  // the exposure: a lime slit on the wafer; the fields already printed (lime, then white)
  const wx = LX + EXS.wx, wz = EXPO[2] + EXS.wz, y = EXPO[1] + .002;
  for (let k = 0; k <= EXS.k && k < NF; k++) {
    const f = FIELDS[k], age = u - (EXP0 + (k + .72) * EXPDT), al = (k === EXS.k ? 1 : .4 + .6 * Math.exp(-Math.max(0, age) * 3)) * on;
    const x0 = wx + f[0] - .0125, x1 = wx + f[0] + .0125, z0 = wz + f[1] - .016, z1 = wz + f[1] + .016, c = age < .5 ? LIME : WH, aa = Math.min(1, al * 1.2);
    apX(BWX, x0, y, z0, PW); apX(BWX, x1, y, z0, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1.5, 1, c, aa);
    apX(BWX, x1, y, z1, PW); K.lineW(PW2[0], PW2[1], PW2[2], PW[0], PW[1], PW[2], 1.5, 1, c, aa);
    apX(BWX, x0, y, z1, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1.5, 1, c, aa);
    apX(BWX, x0, y, z0, PW); K.lineW(PW2[0], PW2[1], PW2[2], PW[0], PW[1], PW[2], 1.5, 1, c, aa);
    if (age < .35) { apX(BWX, wx + f[0], y, wz + f[1], PW); K.glowW(PW[0], PW[1], PW[2], 14, LIME, .5 * (1 - age / .35)); }
    // the printed die's pattern (seen up close at the wafer stage): two cores, the memory, the pad rows
    if (DPON && age > .2) for (const [p0, q0, p1, q1] of DPAT) {
      const xa = wx + f[0] + p0 * .0125, xb = wx + f[0] + p1 * .0125, za = wz + f[1] + q0 * .016, zb = wz + f[1] + q1 * .016, ca = age < 1 ? LIME : WH, al = .55 * on;
      apX(BWX, xa, y, za, PW); apX(BWX, xb, y, za, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, ca, al);
      apX(BWX, xb, y, zb, PW); K.lineW(PW2[0], PW2[1], PW2[2], PW[0], PW[1], PW[2], 2, 1, ca, al);
      apX(BWX, xa, y, zb, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, ca, al);
      apX(BWX, xa, y, za, PW); K.lineW(PW2[0], PW2[1], PW2[2], PW[0], PW[1], PW[2], 2, 1, ca, al);
    }
  }
  if (EXS.on > .05 && EXS.s < .72) {
    apX(BWX, LX - .013, y + .001, EXPO[2], PW); apX(BWX, LX + .013, y + .001, EXPO[2], PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1, 2, LIME, EXS.on);
    apX(BWX, LX, y, EXPO[2], PW); K.glowW(PW[0], PW[1], PW[2], 18, LIME, .7 * EXS.on);
  }
  // the alignment sensor reads marks on the wafer at the measuring side
  if (u > 34.75 && u < 35.05) for (let k = 0; k < 4; k++) { apX(BWX, LX + Math.cos(k * 1.57 + u * 9) * .1, y, MEAS_Z + Math.sin(k * 1.57 + u * 9) * .1, PW); K.dotW(PW[0], PW[1], PW[2], 2, LIME, 1); }
}

/* ---------------- C3 / C4 · etch and deposition (a cluster tool) ---------------- */
const CC = [7.7, 0, 33.5], HEXR = 1.0;
const TH_ETCH = PI * 150 / 180, TH_DEP = PI * 210 / 180, TH_LLA = PI / 2, TH_LLB = PI * 1.5;
const chC = th => [CC[0] + Math.cos(th) * 1.5, CC[2] + Math.sin(th) * 1.5];
function buildC34() {
  const y0 = .95, y1 = 1.45;
  BB.c34 = mkB('c34', B => {
    B.chunk('frame'); bx(B, CC[0] - 2.3, 0, CC[2] - 2.3, CC[0] + 2.3, .8, CC[2] + 2.3, .12, { br: .45, edge: .5, occ: 'c34' });
    B.chunk('hex');
    for (let k = 0; k < 6; k++) {
      const a0 = k / 6 * TAU, a1 = (k + 1) / 6 * TAU, p0 = [CC[0] + Math.cos(a0) * HEXR, y0, CC[2] + Math.sin(a0) * HEXR], p1 = [CC[0] + Math.cos(a1) * HEXR, y0, CC[2] + Math.sin(a1) * HEXR];
      const am = (a0 + a1) / 2; B.panel(p0, V.sub(p1, p0), [0, y1 - y0, 0], .04, { n: [Math.cos(am), 0, Math.sin(am)], br: .6, edge: .85 });
      B.line([p0[0], y1, p0[2]], [p1[0], y1, p1[2]], .8); B.line([p0[0], y1, p0[2]], [CC[0], y1, CC[2]], .25);
    }
    B.cyl([CC[0], .8, CC[2]], [CC[0], y0, CC[2]], .3, { cell: .03, br: .7 });
    for (const th of [TH_ETCH, TH_DEP, PI / 6, -PI / 6]) {
      const [cx, cz] = chC(th), c = Math.cos(th), s = Math.sin(th); B.chunk('ch');
      B.cyl([cx, .85, cz], [cx, 1.58, cz], .55, { cell: .03, br: .7, seams: 8, rbr: .7 });
      B.lathe([cx, 1.58, cz], YA, [[0, .58], [.07, .58], [.07, 0]], { cell: .03, br: .45, rbr: .8 });
      B.obox([CC[0] + c * (HEXR * .87 + .07), 1.2, CC[2] + s * (HEXR * .87 + .07)], [c, 0, s], YA, [-s, 0, c], [.08, .2, .3], .02, { br: .9, edge: .85 });
      B.cyl([cx, .85, cz], [cx, .35, cz], .2, { cell: .03, br: .8, caps: true, seams: 6 });
      B.cyl([cx, .95, cz], [cx, 1.02, cz], .17, { cell: .01, br: .9, caps: true });
      B.knot([cx + c * .58, 1.5, cz + s * .58], .06, 1, 3, 1023 + Math.round(Math.abs(th) * 10));
    }
    for (const th of [TH_LLA, TH_LLB]) { const c = Math.cos(th), s = Math.sin(th); B.chunk('ll'); B.obox([CC[0] + c * 1.35, 1.15, CC[2] + s * 1.35], [c, 0, s], YA, [-s, 0, c], [.32, .25, .28], .03, { br: .85, edge: .8 }); }
    { const [cx, cz] = chC(TH_ETCH); B.chunk('icp'); const P = []; for (let k = 0; k <= 120; k++) { const a = k / 120 * TAU * 3.5, r = .12 + .3 * k / 120; P.push([cx + Math.cos(a) * r, 1.67, cz + Math.sin(a) * r]); } B.poly(P, false, .9, 16, 1); bx(B, cx - .2, 1.75, cz - .2, cx + .2, 2.05, cz + .2, .02, { br: .9 }); }
    { const [cx, cz] = chC(TH_DEP); B.chunk('pvd'); B.lathe([cx, 1.5, cz], YA, [[0, 0], [0, .4], [.04, .4]], { cell: .02, br: .8, two: true }); B.ring([cx, 1.47, cz], XA, ZA, .25, 48, .9, 16, 2); B.ring([cx, 1.47, cz], XA, ZA, .12, 32, .9, 16, 2); bx(B, cx - .18, 1.75, cz - .18, cx + .18, 2.0, cz + .18, .02, { br: .9 }); }
  });
  BB.crHub = mkB('ch0', B => { B.cyl([0, 0, 0], [0, .1, 0], .18, { cell: .015, br: .95, caps: true }); });
  BB.crL1 = mkB('ch1', B => B.box([0, -.02, -.05], [.45, .02, .05], .012, { br: .95, edge: .85 }));
  BB.crBlade = mkB('chb', B => { B.box([-.02, -.004, -.04], [.38, .004, .04], .006, { br: 1, edge: .9 }); });
}
const CR_ = { th: TH_LLA, r: .45 };
const CRSEG = [[40.45, TH_LLA, .45], [40.6, TH_LLA, 1.35], [40.72, TH_LLA, .45], [40.85, TH_ETCH, .45], [40.98, TH_ETCH, 1.5], [41.1, TH_ETCH, .45],
  [42.3, TH_ETCH, .45], [42.42, TH_ETCH, 1.5], [42.54, TH_ETCH, .45], [42.66, TH_DEP, .45], [42.78, TH_DEP, 1.5], [42.9, TH_DEP, .45],
  [44.75, TH_DEP, .45], [44.87, TH_DEP, 1.5], [44.99, TH_DEP, .45], [45.1, TH_LLB, .45], [45.22, TH_LLB, 1.35], [45.34, TH_LLB, .45]];
function c34State(u) {
  const seg = CRSEG; let i = 0; while (i < seg.length - 2 && seg[i + 1][0] <= u) i++;
  const a = seg[i], b = seg[i + 1], w = u <= a[0] ? 0 : u >= b[0] ? 1 : kk(u, a[0], b[0]);
  CR_.th = mix(a[1], b[1], w); CR_.r = mix(a[2], b[2], w);
}
const PLE = u => ss(41.15, 41.35, u) * (1 - ss(42.1, 42.25, u)), PLD = u => ss(42.95, 43.15, u) * (1 - ss(44.55, 44.7, u));
function drawC34(u) {
  const xr = ss(40.4, 40.8, u) * (1 - ss(45.0, 45.4, u));
  O.mcx.keep = .9 - .45 * xr; O.mcx.a = .92 - .3 * xr;
  L.draw(BB.c34, BWX, xr > .02 ? O.mcx : O.st);
  at(XF4, BWX, CC[0], 1.05, CC[2]); L.draw(BB.crHub, XF4, O.mc);
  const th = CR_.th, ext = CR_.r, elb = Math.acos(E.clamp((ext - .2) / .9, -1, 1));
  at(XF4, BWX, CC[0], 1.12, CC[2], 1, -(th + elb)); L.draw(BB.crL1, XF4, O.mc);
  at(XF4, BWX, CC[0], 1.13, CC[2], 1, -(th - elb)); L.draw(BB.crL1, XF4, O.mc);
  at(XF4, BWX, CC[0] + Math.cos(th) * (ext - .2), 1.14, CC[2] + Math.sin(th) * (ext - .2), 1, -th); L.draw(BB.crBlade, XF4, O.mc);
  const pe = PLE(u), pd = PLD(u);
  if (pe > .01) {
    const [cx, cz] = chC(TH_ETCH);
    const fl = .8 + .2 * hh(Math.floor(u * 24), 7);
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, r = k ? .2 : 0; apX(BWX, cx + Math.cos(a) * r, 1.24, cz + Math.sin(a) * r, PW); K.glowW(PW[0], PW[1], PW[2], 70, [214, 206, 255], .2 * pe * fl); }
    apX(BWX, cx, 1.24, cz, PW); K.glowW(PW[0], PW[1], PW[2], 40, LIME, .45 * pe * fl);
    for (let k = 0; k < 40; k++) { const j = (k * 13) & 8191, a = RND[j] * TAU, r = .16 * Math.sqrt(RND[j + 1]), ph = (u * 3 + RND[j + 2]) % 1, y = 1.42 - .37 * ph; apX(BWX, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, PW); apX(BWX, cx + Math.cos(a) * r, y + .05, cz + Math.sin(a) * r, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1.5, 1, LIME, pe * (1 - ph * .5)); }
  }
  if (pd > .01) {
    const [cx, cz] = chC(TH_DEP);
    for (let k = 0; k < 96; k++) { const a = k / 96 * TAU + u * 3; apX(BWX, cx + Math.cos(a) * .185, 1.465, cz + Math.sin(a) * .185, PW); K.dotW(PW[0], PW[1], PW[2], 2, LIME, pd); if (!(k % 12)) K.glowW(PW[0], PW[1], PW[2], 18, LIME, .4 * pd); }
    apX(BWX, cx, 1.42, cz, PW); K.glowW(PW[0], PW[1], PW[2], 90, LIME, .28 * pd);
    spray(u, 42.95, 44.7, 260, cx, 1.45, cz, 0, -1, 0, .45, .6, 1.1, .42, WH, pd, 2, 52);
  }
}

/* ---------------- C5 · dicing ---------------- */
const C5 = { z: ZC.C5, t: [7.0, .97, ZC.C5] };
const CUTX = [45.65, 46.45], ROT5 = [46.45, 46.65], CUTZ = [46.65, 47.45];
const streetX = k => -.1485 + .033 * k, streetZ = k => -.143 + .026 * k;
function buildC5() {
  const z = C5.z;
  BB.c5 = mkB('c5', B => {
    B.chunk('base'); bx(B, 5.6, 0, z - 1.2, 9.6, .85, z + 1.2, .07, { br: .8, occ: 'c5' });
    bx(B, 5.8, .85, z - .35, 8.6, .9, z + .35, .03, { br: .7 });
    B.chunk('col'); bx(B, 8.9, .85, z - 1.1, 9.5, 1.95, z + 1.1, .05, { br: .85, occ: 'c5' }); bx(B, 7.2, 1.55, z - 1.0, 9.0, 1.95, z - .55, .04, { br: .9 });
    B.knot([9.2, 1.97, z - .8], .06, 1, 3, 1030);
    B.panel([5.6, .85, z + 1.2], [4.0, 0, 0], [0, 1.4, 0], .1, { n: [0, 0, -1], br: .1, edge: .35, two: true });
  });
  BB.c5table = mkB('c5t', B => { B.cyl([0, -.07, 0], [0, 0, 0], .21, { cell: .012, br: .85, caps: true }); });
  BB.spind = mkB('c5s', B => {                               // origin: the blade's centre; the spindle along -z; the blade in the x-y plane
    B.cyl([0, 0, -.006], [0, 0, -.36], .045, { cell: .008, br: 1, caps: true }); B.box([-.06, -.06, -.62], [.06, .07, -.36], .012, { br: .95, edge: .85 });
    B.lathe([0, 0, -.0005], ZA, [[0, 0], [0, .028], [.001, .028], [.001, 0]], { cell: .002, br: 1, two: true, rbr: 1 });
    B.cyl([.04, .02, .004], [.04, .02, -.05], .006, { cell: .003, br: .9 });
  });
}
const C5S = { tx: 0, tz: 0, rot: 0, nx: 0, nz: 0, line: -1, s: 0, cut: false, ph2: false };
function c5State(u) {
  const NX = 10, NZ = 12;
  C5S.rot = kk(u, ROT5[0], ROT5[1]) * PI / 2; C5S.ph2 = u >= CUTX[1];
  if (!C5S.ph2) { const t = lin(u, CUTX[0], CUTX[1]) * NX; C5S.nx = u < CUTX[0] ? 0 : Math.min(NX, Math.floor(t)); C5S.nz = 0; C5S.s = t % 1; C5S.line = u < CUTX[0] ? -1 : C5S.nx; }
  else { const t = lin(u, CUTZ[0], CUTZ[1]) * NZ; C5S.nx = NX; C5S.nz = u < CUTZ[0] ? 0 : Math.min(NZ, Math.floor(t)); C5S.s = t % 1; C5S.line = u < CUTZ[0] || u > CUTZ[1] ? -1 : C5S.nz; }
  C5S.cut = C5S.line >= 0 && ((u > CUTX[0] && u < CUTX[1]) || (u > CUTZ[0] && u < CUTZ[1]));
  const off = C5S.cut ? (C5S.ph2 ? streetZ(C5S.line) : streetX(C5S.line)) : 0, e = C5S.cut ? (C5S.s - .5) * .46 : 0;
  C5S.e = e; C5S.tx = C5.t[0] - e; C5S.tz = C5.t[2] + (C5S.ph2 ? off : -off);
}
const XTAB = mkX();
function drawC5(u) {
  L.draw(BB.c5, BWX, O.st);
  at(XTAB, BWX, C5S.tx, C5.t[1], C5S.tz, 1, C5S.rot); L.draw(BB.c5table, XTAB, O.mc);
  at(XF4, BWX, C5.t[0], C5.t[1] + .028 - (C5S.cut ? .0008 : -.04), C5.t[2]); L.draw(BB.spind, XF4, O.hero);
  { const bx_ = C5.t[0], by_ = C5.t[1] + .028 - (C5S.cut ? .0008 : -.04), bz = C5.t[2];
    for (let k = 0; k < 48; k++) { const a = k / 48 * TAU + u * 37; apX(BWX, bx_ + Math.cos(a) * .028, by_ + Math.sin(a) * .028, bz, PW); K.dotW(PW[0], PW[1], PW[2], 1, k < 6 ? LIME : WH, k < 6 ? 1 : .6); } }
  if (C5S.cut) {
    apX(BWX, C5.t[0], C5.t[1] + .002, C5.t[2], PW); K.glowW(PW[0], PW[1], PW[2], 14, HOT, .7);
    spray(u, CUTX[0], CUTZ[1], 60, C5.t[0] + .02, C5.t[1] + .01, C5.t[2], 1, .4, 0, .4, .25, .6, .25, WH, .8, 1, 61);
  }
}
/* the streets cut so far (wafer frame Xw), and the cut running under the blade */
function drawCuts(Xw, u, a) {
  const y = .0012;
  for (let k = 0; k < C5S.nx; k++) { const o = streetX(k), h = Math.sqrt(Math.max(0, WRAD * WRAD - o * o)); apX(Xw, -h, y, o, PW); apX(Xw, h, y, o, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, u < CUTX[1] + .3 ? LIME : WH, .8 * a); }
  for (let k = 0; k < C5S.nz; k++) { const o = streetZ(k), h = Math.sqrt(Math.max(0, WRAD * WRAD - o * o)); apX(Xw, o, y, -h, PW); apX(Xw, o, y, h, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, u < CUTZ[1] + .3 ? LIME : WH, .8 * a); }
  if (C5S.cut) {
    const o = C5S.ph2 ? streetZ(C5S.line) : streetX(C5S.line), h = Math.sqrt(Math.max(0, WRAD * WRAD - o * o)), e = Math.min(h, C5S.e);
    if (e > -h) { if (!C5S.ph2) { apX(Xw, -h, y, o, PW); apX(Xw, e, y, o, PW2); } else { apX(Xw, o, y, -h, PW); apX(Xw, o, y, e, PW2); } K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 1.5, 2, LIME, a); }
  }
}

/* ---------------- C6 · die and wire bonding: the control module ---------------- */
const C6 = { z: ZC.C6, w: [6.75, .97, ZC.C6 + .35], b: [8.35, .97, ZC.C6 - .35] };
const C6T = { pick: [47.85, 48.1], move: [48.1, 48.4], place: [48.4, 48.6], wire: [48.7, 49.7], lid: [49.75, 50.05] };
const NWIRE = 28, WHX = [7.4, 1.2, 22.8];
function buildC6() {
  const z = C6.z;
  BB.c6 = mkB('c6', B => {
    B.chunk('base'); bx(B, 5.8, 0, z - 1.2, 9.4, .85, z + 1.2, .07, { br: .8, occ: 'c6' });
    B.chunk('gantry'); for (const x of [6.0, 9.2]) bx(B, x - .1, .85, z + .8, x + .1, 1.9, z + 1.0, .03, { br: .85 }); bx(B, 5.9, 1.75, z + .78, 9.3, 1.9, z + 1.02, .03, { br: .9 });
    bx(B, C6.w[0] - .3, .85, C6.w[2] - .3, C6.w[0] + .3, .94, C6.w[2] + .3, .02, { br: .85 });
    bx(B, C6.b[0] - .22, .85, C6.b[2] - .22, C6.b[0] + .22, .94, C6.b[2] + .22, .02, { br: .85 });
    B.knot([9.3, 1.92, z + .9], .06, 1, 3, 1031);
  });
  BB.bhead = mkB('bh', B => { B.box([-.06, .1, -.06], [.06, .42, .06], .012, { br: .95, edge: .85 }); B.cyl([0, .1, 0], [0, .003, 0], .016, { cell: .004, br: 1, caps: true }); B.box([-.04, .42, -.04], [.04, .5, .5], .012, { br: .9, edge: .8 }); });
  BB.whead = mkB('wb', B => { B.box([-.04, .12, -.04], [.04, .32, .04], .01, { br: .95, edge: .85 }); B.cyl([0, .12, 0], [0, .03, .0], .006, { cell: .003, br: 1 }); B.cyl([0, .03, 0], [0, .0, 0], .0025, { cell: .0015, br: 1, caps: true }); B.box([-.03, .32, -.03], [.03, .4, .5], .01, { br: .9, edge: .8 }); });
  BB.die = mkB('di', B => { B.box([-.0125, 0, -.0155], [.0125, .0008, .0155], .0016, { br: 1, edge: 1 }); for (let k = 0; k < 7; k++) { B.knot([-.0105 + k * .0035, .0009, -.0135], .0011, 1); B.knot([-.0105 + k * .0035, .0009, .0135], .0011, 1); } });
  BB.board = mkB('bd', B => {
    const r = D.rc - .045;
    B.lathe([0, 0, 0], YA, [[0, 0], [0, r], [.006, r], [.006, 0]], { cell: .004, br: .85, rbr: .9 });
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; B.box([Math.cos(a) * (r - .018) - .006, .006, Math.sin(a) * (r - .018) - .004], [Math.cos(a) * (r - .018) + .006, .012, Math.sin(a) * (r - .018) + .004], .002, { br: .95, edge: .8 }); }
    for (let k = 0; k < 7; k++) { B.knot([-.0105 + k * .0035, .0065, -.026], .0013, 1); B.knot([-.0105 + k * .0035, .0065, .026], .0013, 1); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; B.box([Math.cos(a) * .05 - .01, .006, Math.sin(a) * .05 - .006], [Math.cos(a) * .05 + .01, .011, Math.sin(a) * .05 + .006], .002, { br: .9, edge: .8 }); }
  });
  BB.mcover = mkB('mc', B => { const r = D.rc - .043; B.lathe([0, .006, 0], YA, [[0, r], [.045, r], [.055, r - .01], [.055, 0]], { cell: .005, br: 1, rbr: .9, seams: 12 }); });
}
const DIEP = [0, 0, 0], BHP = [0, 0, 0], MODX = mkX();
function c6State(u) {
  const w = C6.w, b = C6.b, dW = [w[0] + .013, w[1] + .001, w[2] - .0165], up = .12, dY = b[1] + .0068;
  DIEP[0] = dW[0]; DIEP[1] = dW[1]; DIEP[2] = dW[2];
  if (u < C6T.pick[0]) { const k = kk(u, C6T.pick[0] - .3, C6T.pick[0]); BHP[0] = mix(7.6, dW[0], k); BHP[1] = w[1] + up; BHP[2] = mix(C6.z, dW[2], k); return; }
  if (u < C6T.move[0]) { const l = lin(u, C6T.pick[0], C6T.pick[1]); BHP[0] = dW[0]; BHP[1] = w[1] + up - (up - .0018) * Math.sin(PI * l); BHP[2] = dW[2]; if (l > .5) DIEP[1] = BHP[1] - .0018; return; }
  if (u < C6T.place[0]) { const k = kk(u, C6T.move[0], C6T.move[1]); BHP[0] = mix(dW[0], b[0], k); BHP[1] = w[1] + up; BHP[2] = mix(dW[2], b[2], k); DIEP[0] = BHP[0]; DIEP[1] = BHP[1] - .0018; DIEP[2] = BHP[2]; return; }
  DIEP[0] = b[0]; DIEP[2] = b[2];
  if (u < C6T.place[1]) { const l = lin(u, C6T.place[0], C6T.place[1]); BHP[0] = b[0]; BHP[1] = w[1] + up - (up - (dY - w[1] + .0018)) * Math.sin(PI * l); BHP[2] = b[2]; DIEP[1] = l < .5 ? BHP[1] - .0018 : dY; return; }
  DIEP[1] = dY;
  const k = kk(u, C6T.place[1], C6T.place[1] + .2), k2 = kk(u, C6T.lid[0] - .3, C6T.lid[0]);
  BHP[0] = mix(mix(b[0], 7.0, k), b[0], k2); BHP[2] = mix(mix(b[2], C6.z, k), b[2], k2); BHP[1] = w[1] + up + .1 * k2 - .15 * kk(u, C6T.lid[0], C6T.lid[1]);
}
const WIRE = [0, 0, 0], WIRE2 = [0, 0, 0], WPD = [[0, 0, 0], [0, 0, 0]];
function wirePads(k) {
  const b = C6.b, side = k % 2 ? 1 : -1, i = (k >> 1) % 7, x = b[0] - .0105 + i * .0035;
  WPD[0][0] = x; WPD[0][1] = b[1] + .0077; WPD[0][2] = b[2] + side * .0135;
  WPD[1][0] = x; WPD[1][1] = b[1] + .0066; WPD[1][2] = b[2] + side * .026;
  return WPD;
}
function drawC6(u) {
  const z = C6.z, b = C6.b;
  L.draw(BB.c6, BWX, O.st);
  at(XF4, BWX, BHP[0], BHP[1], BHP[2]); L.draw(BB.bhead, XF4, O.mc);
  if (u > 46.0) { at(XF4, BWX, DIEP[0], DIEP[1], DIEP[2]); L.draw(BB.die, XF4, O.hero); }
  // the module's board on the bond stage; its cover comes down with the head at the end
  if (u > 46.0 && u < 50.6) {
    at(MODX, BWX, b[0], b[1], b[2]); L.draw(BB.board, MODX, O.hero);
    if (u > C6T.lid[0] - .3) { at(MODX, BWX, b[0], BHP[1] - .056, b[2]); L.draw(BB.mcover, MODX, O.hero); }
  }
  // the wire bonder: its capillary darts pad to pad; each wire a loop left behind
  const nw = Math.floor(NWIRE * lin(u, C6T.wire[0], C6T.wire[1]));
  let cx = 7.4, cy = b[1] + .25, cz = z + .3;
  if (u > C6T.wire[0] && u < C6T.wire[1]) {
    const k = Math.min(NWIRE - 1, nw), ph = (lin(u, C6T.wire[0], C6T.wire[1]) * NWIRE) % 1, [dp, bp] = wirePads(k), w = ph < .5 ? ph * 2 : (ph - .5) * 2;
    const p = ph < .5 ? dp : bp, q = ph < .5 ? bp : dp;
    cx = mix(p[0], q[0], w); cz = mix(p[2], q[2], w); cy = b[1] + .008 + .02 * Math.sin(PI * w);
  } else if (u > C6T.wire[0] - .25 && u <= C6T.wire[0]) { const k = kk(u, C6T.wire[0] - .25, C6T.wire[0]); cx = mix(7.4, b[0], k); cz = mix(z + .3, b[2], k); cy = mix(b[1] + .25, b[1] + .03, k); }
  at(XF4, BWX, cx, cy, cz); L.draw(BB.whead, XF4, O.mc); WHX[0] = cx; WHX[1] = cy; WHX[2] = cz;
  for (let k = 0; k < nw; k++) {
    const [dp, bp] = wirePads(k), age = u - (C6T.wire[0] + (k + 1) / NWIRE * (C6T.wire[1] - C6T.wire[0]));
    for (let j = 0; j < 8; j++) {
      const t0 = j / 8, t1 = (j + 1) / 8, h0 = .006 * Math.sin(PI * Math.min(1, t0 * 1.5)), h1 = .006 * Math.sin(PI * Math.min(1, t1 * 1.5));
      apX(BWX, mix(dp[0], bp[0], t0), mix(dp[1], bp[1], t0) + h0, mix(dp[2], bp[2], t0), WIRE); apX(BWX, mix(dp[0], bp[0], t1), mix(dp[1], bp[1], t1) + h1, mix(dp[2], bp[2], t1), WIRE2);
      K.lineW(WIRE[0], WIRE[1], WIRE[2], WIRE2[0], WIRE2[1], WIRE2[2], 1.2, 1, age < .25 ? LIME : WH, u > C6T.lid[1] ? 0 : 1);
    }
  }
}

/* ======================== the capsule line's dressing (the clean room) ======================== */
function dressCR() {
  BB.crx = mkB('crx', B => {
    B.chunk('ffu');                                            // the ceiling's filter units and the raised floor's tiles
    for (let z = 0; z <= 57; z += 1.2) B.line([2.8, 7.19, z], [13.6, 7.19, z], .22);
    for (let x = 2.8; x <= 13.6; x += 1.2) B.line([x, 7.19, 0], [x, 7.19, 57], .22);
    for (let z = .6; z < 57; z += 2.4) for (let x = 3.4; x < 13.6; x += 2.4) B.ringP([x, 7.18, z], XA, ZA, .25, .2);
    B.chunk('floor');
    for (let z = 0; z <= 57; z += 1.2) B.line([2.8, .008, z], [13.6, .008, z], .16);
    for (let x = 2.8; x <= 13.6; x += 1.2) B.line([x, .008, 0], [x, .008, 57], .16);
    for (const x of [2.8, 13.6]) { B.line([x, 2.4, 0], [x, 2.4, 57], .3); B.line([x, .15, 0], [x, .15, 57], .3); }
  });
}
/* C1 · the equipment front end: enclosure with a window, its fan unit (fan turning), two load ports (one FOUP open,
   one closed), the ionizer bar, a light curtain, the robot's cable, the prealigner's sensor, a rack with a screen */
function dressC1() {
  const z = C1.z;
  BB.c1x = mkB('c1x', B => {
    B.chunk('encl');
    B.panel([5.6, .9, z - 1.1], [0, 0, 2.2], [0, 1.45, 0], .08, { n: [-1, 0, 0], br: .08, edge: .8, two: true });
    frm(B, faceF([5.6, .9, z - 1.1], [9.4, 2.5, z + 1.1], 'x-'), .15, .15, 2.05, 1.3, .7, .01);
    B.panel([5.6, 2.5, z - 1.1], [3.8, 0, 0], [0, 0, 2.2], .1, { n: YA, br: .2, edge: .7 });
    for (let x = 7.95; x < 9.1; x += .08) B.line([x, 2.35, z - .58], [x, 2.35, z + .58], .3);
    B.line([5.75, 2.3, z - 1.0], [5.75, 2.3, z + 1.0], .8); for (let k = 0; k < 12; k++) B.knot([5.75, 2.29, z - .95 + k * .17], .015, .9);
    for (let y = 1.0; y < 2.3; y += .12) { B.knot([9.38, y, C1.foup[2] - .32], .01, .9); B.knot([9.38, y, C1.foup[2] + .32], .01, .9); }
    B.chunk('lp2');
    const z2 = C1.foup[2] - .9;
    B.box([9.4, 0, z2 - .45], [9.95, .9, z2 + .45], .05, { br: .75, edge: .8 });
    B.box([9.45, .9, z2 - .21], [9.95, 1.28, z2 + .21], .02, { br: .9, edge: .85 }); B.box([9.6, 1.28, z2 - .08], [9.8, 1.33, z2 + .08], .01, { br: .95 });
    for (const zz of [C1.foup[2], z2]) { B.knot([9.97, .7, zz + .35], .03, 1, 3, lightQ(5, 'C1', 0)); B.knot([9.97, .62, zz + .35], .03, 1, 3, lightQ(7, 'C1', 1)); for (let y = .1; y < .85; y += .15) B.line([9.96, y, zz - .4], [9.96, y, zz + .4], .25); }
    B.box([9.6, 1.28, C1.foup[2] - .08], [9.8, 1.33, C1.foup[2] + .08], .01, { br: .95 });
    for (let k = 0; k < 25; k++) { const y = .93 + k * .0135; B.line([9.48, y, C1.foup[2] - .15], [9.85, y, C1.foup[2] - .15], .25); }
    B.chunk('pre'); B.box([C1.pre[0] - .25, .9, C1.pre[2] + .1], [C1.pre[0] - .1, 1.18, C1.pre[2] + .25], .01, { br: .9, edge: .85 });
    hose(B, [[7.6, .92, z + .1], [7.2, 1.3, z + .6], [6.4, 1.0, z + .95]], .15, .5);
    cab(B, [10.4, 0, z - 1.4], [11.2, 2.0, z + 1.2], { front: 'x-', st: 'C1', id: 'c1', screen: [.4, 1.2, 1.7, 1.75], estop: [2.2, 1.2] });
  });
  BB.c1fan = fanB(.5, 7);
}
function drawC1x(u) {
  L.draw(BB.c1x, BWX, O.st);
  spin(BB.c1fan, [8.5, 2.46, C1.z], YA, U_ * 9, O.mc);
  trace('c1', s => Math.min(1, s * 1.4) * .7 + .1, lin(u, W1.door[0], W1.inL[1]), 1);
}
/* C2 · the scanner: turbo pumps and forelines, the laser's beam line and cooling, the stages' cable chains, the
   planar motor's coils under the wafer stage, cover seams and service ports, a row of racks with screens */
function dressC2() {
  BB.c2x = mkB('c2x', B => {
    B.chunk('pumps');
    for (const [x, y, z, ax] of [[LX, .65, 47.0, YA], [LX + .9, 2.0, 46.6, XA], [8.6, 1.8, 42.5, XA], [8.6, 2.8, 44.6, XA]]) {
      const d = ax, [U, W] = perp(d), b = [x, y, z], e = V.mad(b, d, -.32);
      B.lathe(e, d, [[0, 0], [0, .16], [.3, .16], [.3, .2], [.34, .2], [.34, 0]], { cell: .02, br: .85, rbr: .9 });
      bolts(B, V.mad(b, d, -.01), U, W, .18, 12, .015); B.ringP(V.mad(e, d, -.002), U, W, .12, .6);
      hose(B, [V.mad(e, d, .05), [x + (ax === XA ? .4 : .3), .2, z + .5]], .2, .45);
    }
    B.chunk('beam');
    for (const x of [5.9, 6.95, 8.05, 9.1]) { B.ringP([x, 1.75, 49.1], XA, YA, .26, .7); B.ringP([x, 1.75, 51.6], XA, YA, .26, .7); hose(B, [[x + .2, 1.5, 49.3], [x + .3, 1.0, 50.2], [x + .2, 1.5, 51.4]], .1, .4); }
    for (let k = 0; k < 3; k++) { const x0 = [5.9, 6.95, 8.05][k], x1 = x0 + 1.05; B.tube([x0 + .2, 2.05, 51.75], [x1 - .2, 2.05, 51.75], .05, .6); B.box([x0 - .12, 1.9, 51.65], [x0 + .12, 2.2, 51.9], .02, { br: .9 }); }
    B.chunk('stage');
    for (let x = 5.2; x < 9.9; x += .15) B.line([x, .805, 40.8], [x, .805, 45.0], .2);
    for (let z = 40.8; z < 45.0; z += .15) B.line([5.2, .805, z], [9.8, .805, z], .14);
    for (let k = 0; k < 18; k++) { B.knot([6.45, 3.3, 41.1 + k * .18], .03, .7); B.knot([8.55, 3.3, 41.1 + k * .18], .03, .7); }
    B.chunk('seams');
    for (let z = 41.4; z < 48.6; z += 1.2) { B.line([4.6, 0, z], [4.6, 3.95, z], .3); B.line([4.6, 3.95, z], [10.4, 3.95, z], .25); }
    for (let y = 1.3; y < 3.95; y += 1.3) B.line([4.6, y, 40.2], [4.6, y, 48.6], .25);
    for (const z of [42.0, 45.6]) { frm(B, faceF([4.6, 0, 40.2], [10.4, 3.95, 48.6], 'x-'), z - 40.2, .6, z - 40.2 + .9, 1.6, .6, .01); B.knot([4.58, 1.1, z + .45], .04, 1, 3, lightQ(7, 'C2', 0)); }
    B.chunk('racks');
    for (let k = 0; k < 4; k++) cab(B, [10.8, 0, 40.4 + k * 2.0], [11.6, 2.1, 42.2 + k * 2.0], { front: 'x-', st: 'C2', id: 'c2' + k, screen: [.35, 1.25, 1.45, 1.8], doors: 2 });
    tray(B, [11.2, 2.6, 40.4], [11.2, 2.6, 48.2], .35); tray(B, [11.2, 2.6, 44.0], [10.4, 3.2, 44.0], .3);
  });
}
function drawC2x(u) {
  L.draw(BB.c2x, BWX, O.st);
  chainW([LX - 1.2, 3.58, 41.0], ZA, YA, 1.6 + EXS.rz, .12, 4.5, .1, .9);
  chainW([5.3, .82, 41.2], ZA, YA, EXS.tz + EXS.wz * EXS.swap - 41.2, .14, 6, .12, .9);
  const p = lin(u, EXP0, EXP0 + NF * EXPDT);
  trace('c20', s => .5 + .4 * Math.sin(s * 40 + U_ * 2) * .2, 1, .8); trace('c21', s => s < p ? .8 : .1, 1, 1);
  trace('c22', s => .3 + .5 * Math.exp(-s * 4) + .05 * Math.sin(s * 50), p, 1); trace('c23', s => .5 + .15 * Math.sin(s * 9), 1, .8, WH);
}
/* C3 / C4 · the cluster tool: lids on hinges with their cylinders, the etch chamber's RF match and cable, gas lines
   from the gas box, forelines to the pumps, viewports (the plasma's glow), the gas box (mass flow controllers) */
function dressC34() {
  BB.c34x = mkB('c34x', B => {
    for (const th of [TH_ETCH, TH_DEP, PI / 6, -PI / 6]) {
      const [cx, cz] = chC(th), c = Math.cos(th), s = Math.sin(th);
      B.chunk('ch');
      bolts(B, [cx, 1.65, cz], XA, ZA, .54, 16, .02);
      B.box([cx - c * .62 - .05, 1.55, cz - s * .62 - .05], [cx - c * .62 + .05, 1.72, cz - s * .62 + .05], .01, { br: .9 });
      B.ringP([cx + c * .56, 1.2, cz + s * .56], [-s, 0, c], YA, .08, 1); B.ringP([cx + c * .56, 1.2, cz + s * .56], [-s, 0, c], YA, .11, .6);
      hose(B, [[cx, .35, cz], [cx + c * .7, .12, cz + s * .7], [CC[0] + c * 2.4, .1, CC[2] + s * 2.4]], .05, .45);
      pipe(B, [[cx + c * .3, 1.72, cz + s * .3], [cx + c * .3, 2.4, cz + s * .3], [10.4, 2.4, 33.5]], .02, .55, false);
    }
    const [ex, ez] = chC(TH_ETCH);
    B.chunk('rf'); B.box([ex - .2, 2.05, ez - .2], [ex + .2, 2.4, ez + .2], .02, { br: .85, edge: .85 }); for (let k = 0; k < 4; k++) B.line([ex - .2, 2.1 + k * .07, ez - .201], [ex + .2, 2.1 + k * .07, ez - .201], .3);
    hose(B, [[ex, 2.4, ez], [ex - .6, 2.9, ez - 1.0], [5.4, 2.2, 31.0]], .3, .6);
    cab(B, [4.9, 0, 30.4], [5.9, 2.1, 31.6], { front: 'z+', st: 'C34', id: 'c3r', screen: [.2, 1.3, .8, 1.75], gauges: [[.3, .95, .07], [.6, .95, .07]] });
    B.chunk('gas');
    cab(B, [10.4, 0, 31.6], [11.2, 2.4, 35.4], { front: 'x-', st: 'C34', id: 'c34', screen: [2.4, 1.6, 3.5, 2.1], doors: 1, louvre: false });
    for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) { const zz = 32.0 + k * .32, y = .6 + j * .45; B.box([10.36, y, zz - .08], [10.4, y + .3, zz + .08], .01, { br: .9, edge: .85 }); B.line([10.36, y + .3, zz], [10.36, y + .45, zz], .6); B.knot([10.35, y + .2, zz], .015, 1, 3, lightQ(j === 1 ? 6 : 5, 'C34', k)); }
    for (const [x0, x1] of [[CC[0] - 2.3, CC[0] + 2.3]]) for (let x = x0 + .3; x < x1; x += .6) B.line([x, .02, CC[2] - 2.3], [x, .78, CC[2] - 2.31], .25);
  });
}
function drawC34x(u) {
  L.draw(BB.c34x, BWX, O.st);
  const pe = PLE(u), pd = PLD(u);
  for (const [th, a] of [[TH_ETCH, pe], [TH_DEP, pd]]) { if (a < .02) continue; const [cx, cz] = chC(th), c = Math.cos(th), s = Math.sin(th); apX(BWX, cx + c * .57, 1.2, cz + s * .57, PW); K.glowW(PW[0], PW[1], PW[2], 14, th === TH_ETCH ? [214, 206, 255] : LIME, .8 * a); }
  needle(GAUGES.c3r0, .2 + .7 * pe); needle(GAUGES.c3r1, .2 + .7 * pd);
  trace('c3r', s => .2 + .6 * (s > .1 && s < .45 ? 1 : 0) * (.9 + .1 * Math.sin(s * 80)), lin(u, 41.0, 42.4), 1, [214, 206, 255]);
  trace('c34', s => .2 + .5 * ss(.1, .3, s) * (1 - ss(.85, .95, s)), lin(u, 42.9, 44.8), 1);
}
/* C5 · the dicer: the blade's cover and coolant jets, the alignment microscope and its ring light, bellows over the
   table's travel, the spinner (clean and dry), the tape frame, the touchscreen */
function dressC5() {
  const z = C5.z;
  BB.c5x = mkB('c5x', B => {
    B.chunk('bell');
    for (const s of [-1, 1]) for (let k = 0; k < 16; k++) { const x = 5.85 + k * .17; B.line([x, .9, z + s * .36], [x + .085, .935, z + s * .36], .5); B.line([x + .085, .935, z + s * .36], [x + .17, .9, z + s * .36], .5); }
    B.chunk('axes');
    axis(B, [5.95, .86, z], [8.6, .86, z], .3, { mL: .2, mR: .06 });
    axis(B, [8.9, .9, z - .78], [8.9, 1.9, z - .78], .22, { up: [-1, 0, 0], bellows: false });
    B.box([7.2, 1.45, z - .9], [8.95, 1.55, z - .48], .01, { br: .8, edge: .85 }); rail(B, [7.25, 1.552, z - .78], [8.85, 1.552, z - .78], .02);
    camU(B, [7.25, 1.2, z - .2], [0, -1, 0], .022);
    magazine(B, [6.0, .86, z + .62], [6.42, 1.45, z + 1.02], 13);
    B.cyl([6.21, .86, z + .82], [6.21, .3, z + .82], .02, { cell: .006, br: .8 });
    B.box([8.15, .86, z - 1.08], [8.85, 1.22, z - .62], .02, { br: .6, edge: .85 }); for (let k = 0; k < 6; k++) B.line([8.15 + k * .12, 1.221, z - 1.05], [8.15 + k * .12, 1.221, z - .65], .5);
    B.cyl([6.6, .86, z + .35], [6.6, 1.05, z + .35], .04, { cell: .008, br: .9, caps: true }); B.box([6.6, 1.02, z + .32], [6.95, 1.05, z + .38], .006, { br: .95 }); B.box([6.9, .99, z + .3], [7.05, 1.03, z + .4], .006, { br: .95 });
    pipe(B, [[8.9, 1.5, z - .25], [7.6, 1.5, z - .25], [7.2, 1.22, z - .05]], .008, .7, false);
    B.chunk('scope'); B.cyl([7.45, 1.25, z], [7.45, 1.55, z], .035, { cell: .008, br: .95, caps: true }); B.ringP([7.45, 1.24, z], XA, ZA, .045, 1); bolts(B, [7.45, 1.235, z], XA, ZA, .045, 8, .006); B.box([7.38, 1.55, z - .07], [7.52, 1.68, z + .07], .01, { br: .9, edge: .85 });
    B.chunk('spin'); B.lathe([8.55, .85, z + .75], YA, [[0, .22], [.12, .25], [.12, .2]], { cell: .015, br: .8, two: true }); B.cyl([8.55, .85, z + .75], [8.55, .93, z + .75], .08, { cell: .01, br: .9, caps: true }); B.line([8.55, 1.15, z + .75], [8.55, 1.3, z + .45], .8);
    B.chunk('ui'); const F = faceF([5.6, 0, z - 1.2], [9.6, .85, z + 1.2], 'z-'); frm(B, F, .2, .25, .9, .7, .7); B.panel(fpm(F, .25, .3, .008), [.6, 0, 0], [0, .35, 0], .02, { n: [0, 0, -1], br: .1, edge: false });
    SCREENS.c5 = { o: fpm(F, .25, .3, .012), u: [.6, 0, 0], v: [0, .35, 0] };
    for (let k = 0; k < 6; k++) B.knot(fpm(F, 1.1 + k * .12, .5), .02, .9, 3, lightQ(k % 2 ? 5 : 7, 'C5', k));
    cell(B, 5.7, 9.5, z - 1.1, z + 1.1, .85, 2.15, 'x-', 'C5');
    cab(B, [9.9, 0, z - 1.0], [10.7, 2.0, z + 1.0], { front: 'x-', st: 'C5', id: 'c5c', gauges: [[.5, 1.5, .08], [.9, 1.5, .08]], screen: [.3, .9, 1.7, 1.3] });
  });
  BB.c5cov = mkB('c5v', B => { B.box([-.045, -.005, .002], [.045, .06, .04], .006, { br: .7, edge: .85 }); for (const s of [-1, 1]) B.line([s * .04, .03, .02], [s * .015, -.003, .005], .9); }, 1);
}
function drawC5x(u) {
  const z = C5.z;
  L.draw(BB.c5x, BWX, O.st);
  const by = C5.t[1] + .028 - (C5S.cut ? .0008 : -.04);
  at(XF4, BWX, C5.t[0], by, C5.t[2]); L.draw(BB.c5cov, XF4, O.mc);
  if (C5S.cut) for (const s of [-1, 1]) spray(u, CUTX[0], CUTZ[1], 40, C5.t[0] + s * .04, by + .03, C5.t[2] + .02, -s * .5, -.8, 0, .2, .4, .9, .2, [200, 230, 255], .6, 1, 120 + s);
  if (u > 47.5 && u < 47.7) { const w = lin(u, 47.5, 47.7); apX(BWX, 8.55, .95, z + .75, PW); K.glowW(PW[0], PW[1], PW[2], 10, LIME, .5 * Math.sin(PI * w)); }
  trace('c5', s => .5 + .02 * Math.sin(s * 120), lin(u, CUTX[0], CUTZ[1]), 1); needle(GAUGES.c5c0, C5S.cut ? .8 : .1); needle(GAUGES.c5c1, .55);
}
/* C6 · the bonders: the wafer and bond stages' slides, the pick tool's camera and heater, the wire spool and the
   ultrasonic horn, the monitors on the gantry, the heated stage's glow */
function dressC6() {
  const z = C6.z;
  BB.c6x = mkB('c6x', B => {
    B.chunk('slides');
    for (const [p, w] of [[C6.w, .3], [C6.b, .22]]) { rail(B, [p[0] - w - .1, .86, p[2] - w + .05], [p[0] + w + .1, .86, p[2] - w + .05], .03); rail(B, [p[0] - w - .1, .86, p[2] + w - .05], [p[0] + w + .1, .86, p[2] + w - .05], .03); motor(B, [p[0] + w + .35, .9, p[2]], [p[0] + w + .12, .9, p[2]], .05, {}); }
    B.chunk('dies');
    B.ringP([C6.w[0], C6.w[1] + .005, C6.w[2]], XA, ZA, .19, .9); B.ringP([C6.w[0], C6.w[1] + .005, C6.w[2]], XA, ZA, .17, .5); B.cyl([C6.w[0], .86, C6.w[2]], [C6.w[0], .6, C6.w[2]], .05, { cell: .008, br: .8 });
    for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; B.box([C6.w[0] + Math.cos(t) * .2 - .02, .93, C6.w[2] + Math.sin(t) * .2 - .02], [C6.w[0] + Math.cos(t) * .2 + .02, .99, C6.w[2] + Math.sin(t) * .2 + .02], .005, { br: .95 }); }
    rail(B, [5.95, 1.91, z + .86], [9.25, 1.91, z + .86], .03); rail(B, [5.95, 1.74, z + .79], [9.25, 1.74, z + .79], .02);
    for (const [dx, dz] of [[-.13, -.13], [.13, -.13], [.13, .13], [-.13, .13]]) B.box([C6.b[0] + dx - .015, .95, C6.b[2] + dz - .015], [C6.b[0] + dx + .015, .985, C6.b[2] + dz + .015], .004, { br: 1, edge: .9 });
    magazine(B, [9.0, .86, z - .95], [9.3, 1.4, z - .55], 10);
    for (const s of [-1, 1]) rail(B, [8.62, .9, z - .35 + s * .09], [9.0, .9, z - .75 + s * .09], .015);
    camU(B, [7.9, 1.25, z - .35], [-.5, -1, 0], .02); camU(B, [6.95, 1.3, z + .35], [-.3, -1, 0], .02);
    B.chunk('mon');
    for (const [x, k] of [[6.6, 0], [8.4, 1]]) { B.box([x - .3, 1.95, z + .82], [x + .3, 2.32, z + .86], .01, { br: .5, edge: .9 }); B.panel([x - .27, 1.98, z + .819], [.54, 0, 0], [0, .31, 0], .015, { n: [0, 0, -1], br: .08, edge: false }); SCREENS['c6' + k] = { o: [x - .27, 1.98, z + .815], u: [.54, 0, 0], v: [0, .31, 0] }; B.line([x, 1.9, z + .9], [x, 1.95, z + .86], .7); }
    B.chunk('heat'); B.lathe([C6.b[0], .94, C6.b[2]], YA, [[0, .12], [.025, .12]], { cell: .006, br: .9, ch: 19 });
    cell(B, 5.85, 9.35, z - 1.15, z + 1.15, .85, 2.45, 'x-', 'C6');
    cab(B, [9.7, 0, z - 1.1], [10.5, 2.0, z + 1.1], { front: 'x-', st: 'C6', id: 'c6c', gauges: [[.5, 1.5, .08]], estop: [1.6, 1.2] });
  });
  BB.spool = wheelB(.035, .03, 4);
  BB.c6car = mkB('c6c', B => { B.box([-.12, -.08, -.07], [.12, .14, .02], .01, { br: .85, edge: .85 }); motor(B, [0, .14, -.03], [0, .3, -.03], .035, { up: ZA }); for (const s of [-1, 1]) B.line([s * .1, -.08, -.072], [s * .1, .14, -.072], .6); }, 1);
  BB.horn = mkB('hrn', B => { B.lathe([0, .04, 0], [0, 0, 1], [[0, .012], [.18, .004]], { cell: .003, br: 1 }); B.box([-.02, .02, -.05], [.02, .06, 0], .004, { br: .9 }); B.cyl([.05, .14, -.02], [.05, .02, -.02], .008, { cell: .003, br: .95 }); B.ringP([.05, .015, -.02], XA, ZA, .01, 1); }, 1);
}
function drawC6x(u) {
  L.draw(BB.c6x, BWX, O.st);
  at(XF4, BWX, BHP[0], 1.8, C6.z + .78); L.draw(BB.c6car, XF4, O.mc);
  K.lineW(...apX(BWX, BHP[0], 1.72, C6.z + .72, PW), ...apX(BWX, BHP[0], BHP[1] + .5, BHP[2] + .45, PW2), 2, 1, WH, .5);
  spin(BB.spool, [WHX[0], WHX[1] + .36, WHX[2] + .1], XA, U_ * 4 * (u > C6T.wire[0] && u < C6T.wire[1] ? 1 : 0), O.mc);
  at(XF4, BWX, WHX[0], WHX[1] - .02, WHX[2] - .18); L.draw(BB.horn, XF4, O.hero);
  needle(GAUGES.c6c0, u > C6T.wire[0] && u < C6T.wire[1] ? .7 : .2);
}
/* ---------------- the wafer between the machines ---------------- */
const XWF = mkX();
const W3 = { out: [40.15, 40.45], carry: [[40.6, 40.98], [42.42, 42.78], [44.87, 45.22]], toDice: [45.4, 45.65], toBond: [47.5, 47.75] };
function wafPos(u) {
  if (u < 30.6 || u > 50.6) return false;
  if (u < W1.inL[1]) { c1Wafer(u); at(XWF, BWX, WP.x, WP.y, WP.z, 1, WP.yaw); return true; }
  if (u < W3.out[0]) { at(XWF, BWX, LX + EXS.wx * EXS.swap, EXPO[1], EXS.tz + EXS.wz * EXS.swap); return true; }
  const lla = [CC[0], 1.07, CC[2] + 1.35], llb = [CC[0], 1.07, CC[2] - 1.35];
  if (u < W3.out[1]) { const k = kk(u, W3.out[0], W3.out[1]); at(XWF, BWX, mix(LX, lla[0], k), mix(EXPO[1], lla[1], k) + .4 * Math.sin(PI * k), mix(EXPO[2], lla[2], k)); return true; }
  if (u < 45.4) {
    for (const [a, b] of W3.carry) if (u >= a && u < b) { at(XWF, BWX, CC[0] + Math.cos(CR_.th) * CR_.r, 1.16, CC[2] + Math.sin(CR_.th) * CR_.r); return true; }
    if (u < W3.carry[0][0]) { at(XWF, BWX, lla[0], lla[1], lla[2]); return true; }
    const p = u < W3.carry[1][0] ? chC(TH_ETCH) : u < W3.carry[2][0] ? chC(TH_DEP) : null;
    if (p) { at(XWF, BWX, p[0], 1.025, p[1]); return true; }
    at(XWF, BWX, llb[0], llb[1], llb[2]); return true;
  }
  if (u < W3.toDice[1]) { const k = kk(u, W3.toDice[0], W3.toDice[1]); at(XWF, BWX, mix(llb[0], C5.t[0], k), mix(llb[1], C5.t[1], k) + .5 * Math.sin(PI * k), mix(llb[2], C5.t[2], k)); return true; }
  if (u < W3.toBond[0]) { cmp(XWF, XTAB, rot9(M9a, -1, 0), 0, .001, 0); return true; }
  if (u < W3.toBond[1]) { const k = kk(u, W3.toBond[0], W3.toBond[1]); at(XWF, BWX, mix(C5.t[0], C6.w[0], k), mix(C5.t[1], C6.w[1], k) + .4 * Math.sin(PI * k), mix(C5.t[2], C6.w[2], k), 1, PI / 2); return true; }
  at(XWF, BWX, C6.w[0], C6.w[1], C6.w[2], 1, PI / 2); return true;
}
function drawWafer(u) {
  if (!wafPos(u)) return;
  L.draw(BB.wafer, XWF, u > 44.8 ? O.heroG : O.hero);
  if (u > 40.1) L.draw(BB.wgrid, XWF, O.mcd);
  if (u > W3.toDice[0]) { L.draw(BB.tape, XWF, O.mc); drawCuts(XWF, u, 1); }
  if (WP.st === 'track' && u < W1.inL[1]) { at(XF4, BWX, WP.x, WP.y, WP.z); L.draw(BB.carrier, XF4, O.mc); }
}

/* ======================== the platform's AI: the data hall (starboard, behind the chip fab) and its cooling plant ========================
   Four rows of racks in two pods (cold aisles contained under glass, hot aisles between the backs), cable trays and
   fibre trunks overhead (light pulses running along them, one trunk out to the port: the AI lays the gun), the coolant
   distribution units and the loop's mains along the wall, the plant's heat exchangers in the clean room's front bay.
   The chip fab makes the AI's own processors; the hall is what they run in. */
const DH = { z0: 5.4, seg: 7.2, gap: 1.2, nseg: 6, nr: 12, rw: .6, rd: 1.2, rh: 2.3 };
const ROWS = [[15.0, 1], [17.6, -1], [20.2, 1], [22.8, -1]];    // [centre x, the side the fronts face]
const TRUNK = [[18.9, 3.4, 56], [18.9, 3.4, 3.2], [8.2, 7.6, 3.2], [-2, 7.6, 3.2], [-2, 20.2, -9.6]];   // the fibre trunk to the port
let NRACK = 0;
function buildAI() {
  NRACK = ROWS.length * DH.nseg * DH.nr;
  BB.dh = mkB('dh', B => {
    for (const [x, f] of ROWS) for (let s = 0; s < DH.nseg; s++) {
      const z0 = DH.z0 + s * (DH.seg + DH.gap), z1 = z0 + DH.seg, x0 = x - DH.rd / 2, x1 = x + DH.rd / 2, xf = f > 0 ? x1 : x0, xb = f > 0 ? x0 : x1;
      B.chunk('row');
      B.box([x0, 0, z0], [x1, DH.rh, z1], .1, { br: .55, edge: .8 });
      B.panel([xf + f * .008, .05, z0], [0, 0, DH.seg], [0, DH.rh - .1, 0], .06, { n: [f, 0, 0], br: .3, edge: .7, seams: [DH.nr, 7], sbr: .28 });
      for (let k = 0; k <= DH.nr; k++) B.line([xf + f * .012, 0, z0 + k * DH.rw], [xf + f * .012, DH.rh, z0 + k * DH.rw], .7);
      B.panel([xb - f * .008, .05, z0], [0, 0, DH.seg], [0, DH.rh - .1, 0], .1, { n: [-f, 0, 0], br: .22, edge: .6, seams: [DH.nr * 2, 6], sbr: .25 });   // the rear doors' coils
      for (let k = 0; k < DH.nr; k++) { const zz = z0 + (k + .5) * DH.rw; B.cyl([xb, .25, zz], [xb, -.05, zz], .03, { cell: .008, br: .6 }); }
      B.chunk('top'); tray(B, [x, DH.rh + .5, z0], [x, DH.rh + .5, z1], .45, 6);
      for (let k = 0; k < DH.nr; k += 2) B.line([x, DH.rh, z0 + (k + .5) * DH.rw], [x, DH.rh + .5, z0 + (k + .5) * DH.rw], .4);
    }
    // the cold aisles' containment: glass roofs, door frames at the segments' ends
    B.chunk('cont');
    for (const xa of [15.6, 20.8]) for (let s = 0; s < DH.nseg; s++) {
      const z0 = DH.z0 + s * (DH.seg + DH.gap), z1 = z0 + DH.seg;
      B.panel([xa, DH.rh + .02, z0], [1.4, 0, 0], [0, 0, DH.seg], .2, { n: YA, br: .08, edge: .55, two: true, seams: [2, 12], sbr: .2 });
      for (const zz of [z0, z1]) { B.line([xa, 0, zz], [xa, DH.rh, zz], .7); B.line([xa + 1.4, 0, zz], [xa + 1.4, DH.rh, zz], .7); B.line([xa, DH.rh, zz], [xa + 1.4, DH.rh, zz], .7); B.line([xa + .7, 0, zz], [xa + .7, DH.rh - .1, zz], .45); B.line([xa + .55, 1.1, zz], [xa + .55, 1.3, zz], .9); }
    }
    // the raised floor's grid, the partition from the clean room (mullions), the loop's mains and the CDUs along the wall
    B.chunk('floor');
    for (let z = 2.4; z <= 58.2; z += 1.2) B.line([14.2, .006, z], [25.6, .006, z], .14);
    for (let x = 14.4; x <= 25.6; x += 1.2) B.line([x, .006, 2.4], [x, .006, 58.2], .14);
    for (let z = 2.4; z <= 58.2; z += 1.8) B.line([14.1, 0, z], [14.1, 7.2, z], .35);
    B.line([14.1, 7.2, 2.4], [14.1, 7.2, 58.2], .5); B.line([14.1, 2.6, 2.4], [14.1, 2.6, 58.2], .3);
    B.chunk('mains');
    for (const [y, r] of [[.55, .22], [1.2, .22]]) { B.cyl([25.1, y, 3.0], [25.1, y, 57.5], r, { cell: .06, br: .7, rings: false, seams: 6, sbr: .35 }); for (let z = 4; z < 57; z += 3) B.ringP([25.1, y, z], XA, YA, r * 1.15, .7); }
    for (let s = 0; s < DH.nseg; s++) {
      const zc = DH.z0 + s * (DH.seg + DH.gap) + DH.seg / 2;
      cab(B, [23.9, 0, zc - .9], [24.8, 2.0, zc + .9], { front: 'x-', st: 'AI', id: 'cdu' + s, gauges: [[.45, 1.45, .08], [.85, 1.45, .08]], screen: [.3, .9, 1.5, 1.25], doors: 2 });
      for (const y of [.55, 1.2]) pipe(B, [[24.8, y + .3, zc], [25.1, y, zc]], .06, .65, false);
    }
    // the plant: three heat exchangers and their pumps in the clean room's front bay, the mains across to the hall
    B.chunk('plant');
    for (const x of [5.0, 8.0, 11.0]) {
      B.lathe([x, 1.25, 4.0], ZA, [[0, 0], [.25, .85], [6.2, .85], [6.45, 0]], { cell: .06, br: .7, rings: true, rbr: .8, seams: 10, sbr: .3 });
      for (let k = 0; k < 4; k++) B.ringP([x, 1.25, 4.6 + k * 1.6], XA, YA, .9, .8);
      for (const zz of [5.0, 9.4]) bx(B, x - .55, 0, zz - .15, x + .55, .45, zz + .15, .03, { br: .8 });
      motor(B, [x + .9, .45, 12.0], [x + .9, .45, 11.0], .22, { feet: true });
      B.lathe([x + .9, .45, 12.35], ZA, [[0, .3], [.35, .3]], { cell: .03, br: .85, caps: true });
      pipe(B, [[x, 2.1, 7.0], [x, 3.0, 7.0], [13.8, 3.0, 7.0], [25.1, 3.0, 7.0], [25.1, 1.4, 7.0]], .12, .65);
    }
  }, .6);
}
/* the status lights: each rack's few LEDs, blinking (a pure function of time and the rack) */
const AIP = [0, 0, 0];
function drawAI(u, a) {
  L.draw(BB.dh, BWX, O.st);
  if (a < .02) return;
  const e = K.C.eye; toBay(e, AIP);
  for (let r = 0; r < ROWS.length; r++) {
    const [x, f] = ROWS[r], xf = x + f * (DH.rd / 2 + .015);
    for (let s = 0; s < DH.nseg; s++) {
      const z0 = DH.z0 + s * (DH.seg + DH.gap), zc = z0 + DH.seg / 2, d2 = (AIP[0] - xf) ** 2 + (AIP[2] - zc) ** 2;
      if (d2 > 2500) continue;
      for (let k = 0; k < DH.nr; k++) for (let j = 0; j < 7; j++) {
        const id = ((r * 97 + s * 31 + k) * 7 + j), h = hh(id * .37, j * 1.3), on = Math.floor(U_ * (2 + 6 * h) + h * 9) % 3 !== 0;
        if (!on && h > .3) continue;
        apX(BWX, xf, .25 + j * .29 + .05 * h, z0 + (k + .5) * DH.rw + (h - .5) * .3, PW);
        K.dotW(PW[0], PW[1], PW[2], h < .22 ? 3 : 2, h < .22 ? LIME : WH, a * (on ? 1 : .25));
      }
    }
  }
  // the trunks: light packets running out of the hall to the fab and on to the port
  let Ltot = 0; for (let i = 1; i < TRUNK.length; i++) Ltot += V.dist(TRUNK[i - 1], TRUNK[i]);
  for (let i = 1; i < TRUNK.length; i++) { const p = TRUNK[i - 1], q = TRUNK[i]; apX(BWX, p[0], p[1], p[2], PW); apX(BWX, q[0], q[1], q[2], PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 3, 1, LIME, .3 * a); }
  for (let n = 0; n < 60; n++) {
    let s_ = ((n / 60) + U_ * .06) % 1 * Ltot, i = 1;
    while (i < TRUNK.length - 1 && s_ > V.dist(TRUNK[i - 1], TRUNK[i])) { s_ -= V.dist(TRUNK[i - 1], TRUNK[i]); i++; }
    const p = TRUNK[i - 1], q = TRUNK[i], k = Math.min(1, s_ / V.dist(p, q));
    apX(BWX, p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k, PW); K.dotW(PW[0], PW[1], PW[2], 3, LIME, a); K.glowW(PW[0], PW[1], PW[2], 8, LIME, .3 * a);
  }
  // each row's own trunk on its tray
  for (let r = 0; r < ROWS.length; r++) for (let n = 0; n < 14; n++) {
    const x = ROWS[r][0], zz = DH.z0 + ((n / 14 + U_ * .05 * (r % 2 ? -1 : 1) + 1) % 1) * (DH.nseg * (DH.seg + DH.gap) - DH.gap);
    apX(BWX, x, DH.rh + .56, zz, PW); K.dotW(PW[0], PW[1], PW[2], 2, LIME, .8 * a);
  }
  for (let s = 0; s < DH.nseg; s++) { needle(GAUGES['cdu' + s + '0'], .55 + .1 * Math.sin(U_ + s)); needle(GAUGES['cdu' + s + '1'], .4); trace('cdu' + s, x_ => .5 + .25 * Math.sin(x_ * 18 + U_ * 2 + s), 1, .8); }
}
/* the chip fab's own clock (it runs while the camera is there: the reveal) */
let AF_ = 30.6;
const AFK = [];                                                 // [u, af] keys, set from the beats
function afAt(u) {
  if (!AFK.length || u <= AFK[0][0]) return AFK.length ? AFK[0][1] : 30.6;
  for (let i = 1; i < AFK.length; i++) if (u < AFK[i][0]) return mix(AFK[i - 1][1], AFK[i][1], (u - AFK[i - 1][0]) / (AFK[i][0] - AFK[i - 1][0]));
  return AFK[AFK.length - 1][1];
}

/* ---------------- the camera (bay frame) ----------------
   One hold per station while it works (the eye drifting slowly: a slow push or slide), the moves between holds cubic
   Hermite curves whose end velocities are the holds' drifts (no stops, no whips). The up vector is always the bay's
   (no roll). At the splices the camera continues the base take's own camera (ctx.camAt either side of the splice
   time, so position and velocity match) and blends into or out of the bay's path: eye lerp, look and up slerped. */
const SH = [];                                                // holds: {id, u0, u1, e0, e1, g0, g1, f0, f1}
const HD = (id, e0, e1, g0, g1, f0, f1) => { if (!BW_[id]) return; const [u0, u1] = BW_[id]; SH.push({ id, u0, u1, e0, e1, g0, g1, f0, f1: f1 === undefined ? f0 : f1 }); };
/* the moves: the look follows the part being carried (the rod on the gantry, the wafer, the capsule), the eye rides
   along with it (k: the share of the part's motion the eye takes) and rises clear of the machines (lift, m) */
const MV = {};
function buildCam() {
  SH.length = 0;
  const T = id => BW_[id];
  HD('IN', [-1.5, 26, -7.5], [-2.6, 20.5, -5.2], [-2, 2, 28], [-5, 1.5, 19], 52, 50);
  HD('R2', [-4.4, 5.6, .4], [-5.6, 6.6, 3.0], [-11, .6, 5.6], [-12, -.9, 8], 48, 48);
  HD('R3', [-4.8, 3.9, 9.4], [-5.3, 3.4, 10.2], [-10.8, 1.5, 15], [-10.6, 1.4, 15.1], 46, 44);
  HD('R4', [-5.2, 2.9, 18.2], [-6.0, 2.5, 19.0], [-12.2, 1.6, 23], [-12.0, 1.5, 23], 50, 47);
  HD('R6', [-4.8, 2.7, 34.4], [-6.0, 2.5, 34.9], [-8.9, 1.6, 38.5], [-12.4, 1.5, 38.5], 44, 46);
  HD('R7', [4.5, 6.0, 39.0], [3.5, 5.4, 40.0], [-11.5, 1.0, 46.0], [-10.5, 1.0, 45.8], 56, 54);
  HD('R8', [.5, 5.2, 45.5], [-.5, 4.6, 46.5], [-11, 2.8, 53.5], [-11, 2.4, 53.0], 56, 54);
  HD('MT', [9, 5, 4.5], [7.5, 4.2, 3.2], [-2.5, 1.6, -5], [-2, 1.6, -5], 52, 50);
  // the reveal: the turn to the back of the bay, the whole fab and the hall from high up, then down into them
  HD('AI1', [1.5, 15, -8.5], [4, 12.5, 2], [14, 1.5, 30], [11, 1.5, 36], 56, 54);
  HD('AI2', [4.5, 2.7, 49.4], [4.6, 2.8, 46.4], [7.5, 2.1, 48.0], [7.5, 2.4, 45.0], 48, 48);
  HD('AI3a', [4.6, 2.3, 24.6], [5.4, 1.8, 25.4], [7.2, 1.0, 27], [7.1, 1.0, 27], 40, 36);
  HD('AI3b', [4.8, 2.2, 19.8], [5.6, 1.7, 20.6], [7.6, 1.0, 22.4], [7.7, 1.0, 22.4], 40, 36);
  HD('AI4', [19, 6.5, 2.5], [19, 5.6, 10.0], [19, .5, 26], [19, .5, 34], 50, 48);
  // the round on the column: up and once round (the turntable), the petals closing, out through the port
  HD('TRb', [10, 4.5, 10], [1, 24, 13], [-2, 3, -2], [-2, 17.5, -1], 54, 54);
  HD('TRc', [-7, 26, 9], [-9, 26, 6.5], [-2, 21.5, -1], [-2, 21.5, -2.5], 52, 52);
  HD('TRd', [-11, 27, 3.5], [-17, 29, -3], [-2, 21.5, -8], [-2, 21, -18], 50, 48);   // (to the base camera's side: port, high, looking at the chamber)
  { const H = id => SH.find(h => h.id === id); H('TRb').u1 -= 1.2; H('TRc').u0 += .6; H('TRc').u1 -= .6; H('TRd').u0 += .8; }   // (eased moves between the round's shots)
  // the moves: the part followed, the share of its motion the eye takes (k), the lift (m), the aisle the eye pulls
  // toward (x), the share of the part's height the look takes (vy); or a crane through a point (via: eye, look)
  const mv = (id, o) => { if (BW_[id]) MV[id] = Object.assign({ u0: BW_[id][0], u1: BW_[id][1], part: null, k: .5, lift: 0, ax: null, vy: .45, via: null, pw: 0 }, o); };
  mv('mIN', { part: 'rod', k: 0, vy: 1 });
  for (const id of ['m23', 'm34', 'm46', 'm67', 'm78']) mv(id, { part: 'rod', k: .55, lift: 1.2, ax: -3.4 });
  mv('mMT', { part: 'rod', k: 1, lift: 4.5, vy: 1 });
  mv('mAI', { via: [[2, 9, -7.5], [12, 2.0, 12]] });
  mv('mAI3', { part: 'waf', via: [[4.0, 3.6, 36], [7.5, 1.2, 33]], pw: .3 });
  mv('mAI4', { via: [[11, 6.0, 14], [19, 1.0, 22]] });
  mv('mAI2', { via: [[6, 7, 30], [7.5, 1.5, 42]] });
  mv('mTR', { via: [[12, 12, 8], [0, 6, -2]] });
  // the chip fab's clock through the reveal
  AFK.length = 0;
  for (const [u, af] of [[T('mAI')[0], 32.8], [T('AI1')[0], 33.4], [T('AI2')[0], 34.6], [T('AI2')[1], 40.0], [T('AI3a')[0], 45.55], [T('AI3a')[0] + 3.0, 47.6], [T('AI3a')[1], 47.7], [T('AI3b')[0], 47.8], [T('AI3b')[0] + 3.4, 49.8], [T('AI3b')[1], 50.1], [T('AI4')[1], 50.3]]) AFK.push([u, af]);
}
const HDt = (id, u0, u1, e0, e1, g0, g1, f0, f1) => SH.push({ id, u0, u1, e0, e1, g0, g1, f0, f1: f1 === undefined ? f0 : f1 });
const lerp3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
function herm(o, p0, m0, p1, m1, t, h) {
  const t2 = t * t, t3 = t2 * t, a = 2 * t3 - 3 * t2 + 1, b = (t3 - 2 * t2 + t) * h, c = -2 * t3 + 3 * t2, d = (t3 - t2) * h;
  for (let k = 0; k < 3; k++) o[k] = a * p0[k] + b * m0[k] + c * p1[k] + d * m1[k];
  return o;
}
const CB_ = { eye: [0, 0, 0], target: [0, 0, 0], fov: 1 };
const VA = [0, 0, 0], VB = [0, 0, 0], VV = [0, 0, 0];
function camBay(u) {
  const dc = window.FABCAM || DBGC;
  if (dc) return { eye: dc.slice(0, 3), target: dc.slice(3, 6), fov: (dc[6] || 50) * DEG };
  const o = CB_;
  let i = 0; while (i < SH.length - 1 && SH[i + 1].u0 <= u) i++;
  const s = SH[i];
  if (u <= s.u1 || i === SH.length - 1) {
    const t = Math.min(1.4, Math.max(-1, (u - s.u0) / (s.u1 - s.u0)));
    lerp3(o.eye, s.e0, s.e1, t); lerp3(o.target, s.g0, s.g1, t); o.fov = (s.f0 + (s.f1 - s.f0) * t) * DEG;
    return o;
  }
  const n = SH[i + 1], h = n.u0 - s.u1, t = (u - s.u1) / h, da = s.u1 - s.u0, db = n.u1 - n.u0;
  for (let k = 0; k < 3; k++) { VA[k] = (s.e1[k] - s.e0[k]) / da; VB[k] = (n.e1[k] - n.e0[k]) / db; }
  herm(o.eye, s.e1, VA, n.e0, VB, t, h);
  for (let k = 0; k < 3; k++) { VA[k] = (s.g1[k] - s.g0[k]) / da; VB[k] = (n.g1[k] - n.g0[k]) / db; }
  herm(o.target, s.g1, VA, n.g0, VB, t, h);
  const fa = (s.f1 - s.f0) / da, fb = (n.f1 - n.f0) / db, t2 = t * t, t3 = t2 * t;
  o.fov = ((2 * t3 - 3 * t2 + 1) * s.f1 + (t3 - 2 * t2 + t) * h * fa + (-2 * t3 + 3 * t2) * n.f0 + (t3 - t2) * h * fb) * DEG;
  // a following move: the look onto the part (smoothed over 1.2 s), the eye carried along part way, lifted and
  // pulled toward the aisle; or a crane through a waypoint
  for (const id in MV) {
    const m = MV[id]; if (u <= m.u0 || u >= m.u1) continue;
    const w = Math.sin(PI * (u - m.u0) / (m.u1 - m.u0)) ** 2;
    PSM[0] = PSM[1] = PSM[2] = 0; let ws = 0;
    if (m.part) for (let j = -3; j <= 3; j++) { const wj = 4 - Math.abs(j); partPos(m.part, warp(u + j * .2), PPB); PSM[0] += wj * PPB[0]; PSM[1] += wj * PPB[1]; PSM[2] += wj * PPB[2]; ws += wj; }
    if (m.via) {
      // a crane through the waypoint: the eye a Hermite curve through it (velocity-matched at the holds), the look
      // turned by slerp hold -> waypoint -> hold (it never whips past the eye)
      const ve = m.via[0], g = [0, 0, 0];
      for (let k = 0; k < 3; k++) g[k] = m.via[1][k] + (ws ? m.pw * (PSM[k] / ws - m.via[1][k]) : 0);
      for (let k = 0; k < 3; k++) { VA[k] = (s.e1[k] - s.e0[k]) / da; VB[k] = (n.e1[k] - n.e0[k]) / db; VV[k] = (n.e0[k] - s.e1[k]) / h; }
      if (t < .5) herm(o.eye, s.e1, VA, ve, VV, t * 2, h / 2); else herm(o.eye, ve, VV, n.e0, VB, t * 2 - 1, h / 2);
      const fs = nrm(sub(s.g1, s.e1)), fv = nrm(sub(g, ve)), fn = nrm(sub(n.g0, n.e0)), ds = V.dist(s.g1, s.e1), dv = V.dist(g, ve), dn = V.dist(n.g0, n.e0);
      const f = m.lookVia ? (t < .5 ? slerp(fs, fv, smoother(t * 2)) : slerp(fv, fn, smoother(t * 2 - 1))) : slerp(fs, fn, smoother(t)), dd = mix(ds, dn, smoother(t)) * (1 + .6 * Math.sin(PI * t));
      for (let k = 0; k < 3; k++) o.target[k] = o.eye[k] + f[k] * dd;
      if (m.part) pieceAt(A_);
      break;
    }
    PSM[1] = o.target[1] + (PSM[1] / ws - o.target[1]) * m.vy; PSM[1] *= ws;
    for (let k = 0; k < 3; k++) { const d = PSM[k] / ws - o.target[k]; o.target[k] += w * d; o.eye[k] += w * m.k * d; }
    o.eye[1] += m.lift * w;
    if (m.ax !== null) o.eye[0] += w * .8 * (m.ax - o.eye[0]);
    pieceAt(A_);
    break;
  }
  return o;
}
/* where the part being carried is (bay), at the machines' time a */
const PPB = [0, 0, 0], PSM = [0, 0, 0];
function toBay(w, o) { const M = BWX.R, t = BWX.T, dx = w[0] - t[0], dy = w[1] - t[1], dz = w[2] - t[2]; o[0] = M[0] * dx + M[3] * dy + M[6] * dz; o[1] = M[1] * dx + M[4] * dy + M[7] * dz; o[2] = M[2] * dx + M[5] * dy + M[8] * dz; return o; }
function partPos(part, a, o) {
  if (part === 'rod') { pieceAt(a); toBay(PIECE.X.T, o); if (PIECE.st === 'forge') { o[0] = XF + 1.5; } return o; }
  if (part === 'waf') { if (wafPos(a)) return toBay(XWF.T, o); o[0] = C6.w[0]; o[1] = C6.w[1]; o[2] = C6.w[2]; return o; }
  o[0] = C6.b[0]; o[1] = C6.b[1]; o[2] = C6.b[2]; return o;
}
const DBGC = (() => { const q = QS.get('fcam'); return q ? q.split(',').map(Number) : null; })();
/* a shot as a basis: eye, look f, up, fov, target distance (the Cam's own convention: r from the world's +Y, then roll) */
function basisOf(s, o) {
  const f = V.norm(V.sub(s.target, s.eye)), r0 = V.norm(V.cross([0, 1, 0], f)), u0 = V.cross(f, r0), c = Math.cos(s.roll || 0), sn = Math.sin(s.roll || 0);
  o.eye = s.eye.slice(); o.f = f; o.up = V.sub(V.mul(u0, c), V.mul(r0, sn)); o.fov = s.fov; o.d = V.dist(s.eye, s.target); return o;
}
function shotOf(b) {
  const r0 = V.norm(V.cross([0, 1, 0], b.f)), u0 = V.cross(b.f, r0), up = V.norm(V.sub(b.up, V.mul(b.f, V.dot(b.f, b.up))));
  return { eye: b.eye, target: V.add(b.eye, V.mul(b.f, b.d)), fov: b.fov, roll: Math.atan2(-V.dot(up, r0), V.dot(up, u0)) };
}
function slerp(a, b, t) {
  const d = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(d);
  if (th < 1e-5) return V.norm(V.lerp(a, b, t));
  const s = Math.sin(th); return V.norm(V.add(V.mul(a, Math.sin((1 - t) * th) / s), V.mul(b, Math.sin(t * th) / s)));
}
function blendB(a, b, w) {
  const f = slerp(a.f, b.f, w), up0 = V.norm(V.sub(a.up, V.mul(f, V.dot(f, a.up)))), up1 = V.norm(V.sub(b.up, V.mul(f, V.dot(f, b.up))));
  return { eye: V.lerp(a.eye, b.eye, w), f, up: slerp(up0, up1, w), fov: a.fov + (b.fov - a.fov) * w, d: Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * w) };
}
const smoother = x => { x = E.clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
const T_IN = 6.5, T_OUT = 8.5;                               // the splice blends (s)
/* the base scene shows through at the splices (the film reads hideBase after cam each frame) */
let BASEW = 0;
const baseW = u => { const w = 1 - kk(u, 3.0, 5.6) + kk(u, LEN - T_OUT + 1.5, LEN - 3.2); return w < .04 ? 0 : w; };
const BA = {}, BB_ = {}, TAUX = .9;
let SPL = null;
function cam(u, ctx) {
  update(u, ctx);
  BASEW = (ctx.BAY && !window.FABCAM) ? baseW(u) : 0;
  const c = camBay(u), eye = X.ap(BWX, c.eye), tg = X.ap(BWX, c.target);
  const bay = { eye, f: V.norm(V.sub(tg, eye)), up: dirX(BWX, 0, 1, 0, [0, 0, 0]), fov: c.fov, d: V.dist(eye, tg) };
  const old = ctx.camOld;
  if (old && !DBGC && !window.FABCAM) {
    const at0 = ctx.AT_FAB !== undefined ? ctx.AT_FAB : (window.ORFAB && ORFAB.at);
    // the base camera at the splice and its velocity there (eye and look), carried on and dying away over TAUX: the
    // splices match the base take's motion without following it anywhere else
    if (!SPL) {
      const b0 = basisOf(old, {}), b1 = basisOf((ctx.camAt && at0 !== undefined) ? ctx.camAt(at0 + .05) : old, {});
      SPL = { b0, v: V.mul(V.sub(b1.eye, b0.eye), 20), w: V.mul(V.sub(b1.f, b0.f), 20) };
    }
    const base = t => {
      const k = t >= 0 ? TAUX * (1 - Math.exp(-t / TAUX)) : -TAUX * (1 - Math.exp(t / TAUX)), b = SPL.b0;
      return { eye: V.add(b.eye, V.mul(SPL.v, k)), target: V.add(V.add(b.eye, V.mul(SPL.v, k)), V.mul(V.norm(V.add(b.f, V.mul(SPL.w, k))), b.d)), fov: b.fov, roll: old.roll || 0, _up: b.up };
    };
    // the entry: position and look blend over T_IN; the up (the roll) more slowly, over T_IN + 4.5 s
    if (u < T_IN + 4.5) {
      const bb = basisOf(base(Math.min(u, T_IN)), BA), wu = smoother(u / (T_IN + 4.5));
      const f = bay.f, a = V.norm(V.sub(bb.up, V.mul(f, V.dot(f, bb.up)))), b = V.norm(V.sub(bay.up, V.mul(f, V.dot(f, bay.up))));
      bay.up = slerp(a, b, wu);
      if (u < T_IN) return shotOf(blendB(bb, bay, smoother(u / T_IN)));
      return shotOf(bay);
    }
    if (u > LEN - T_OUT) return shotOf(blendB(bay, basisOf(base(u - LEN), BB_), smoother((u - (LEN - T_OUT)) / T_OUT)));
  }
  return shotOf(bay);
}

/* ---------------- the key light: the station on screen lit, the rest of the hall dimmed ---------------- */
const ACT = {}; for (const s of STN) ACT[s] = 0;
const HOLDST = { AI1: 'AI', AI2: 'C2', AI3a: 'C5', AI3b: 'C6', AI4: 'AI', TRb: 'MT', TRc: 'MT', TRd: 'MT' };
/* the stations a move passes (lit as the part goes by) */
const PASS = { mIN: ['R1'], m46: ['R5'], mAI3: ['C34'], mAI: ['AI'], mAI4: ['AI'] };
let WIDE = 0;                                                  // the overviews: everything half lit
function activity(u) {
  for (const s of STN) ACT[s] = 0; WIDE = 0;
  for (const h of SH) {
    const w = ss(h.u0 - 2.4, h.u0 - .2, u) * (1 - ss(h.u1 + .2, h.u1 + 2.4, u)); if (w <= 0) continue;
    if (h.id === 'IN' || h.id === 'AI1') WIDE = Math.max(WIDE, w * (h.id === 'AI1' ? .8 : 1));
    if (h.id === 'IN') continue;
    const st = HOLDST[h.id] || h.id; if (w > ACT[st]) ACT[st] = w;
  }
  for (const id in MV) { const m = MV[id]; if (u > m.u0 && u < m.u1) WIDE = Math.max(WIDE, Math.sin(PI * (u - m.u0) / (m.u1 - m.u0)) ** 2); }
  for (const id in PASS) {
    const b = BW_[id]; if (!b || u < b[0] - .5 || u > b[1] + .5) continue;
    const L_ = PASS[id], n = L_.length;
    for (let i = 0; i < n; i++) { const c = b[0] + (b[1] - b[0]) * (i + .5) / n, hw = (b[1] - b[0]) / n * .75 + .6, w = Math.max(0, 1 - Math.abs(u - c) / hw); if (w > ACT[L_[i]]) ACT[L_[i]] = E.inOut(w); }
  }
}
const gainOf = st => { const b = .36 + .34 * WIDE; return b + (1.3 - b) * (ACT[st] || 0); };
const STC = { R1: [-10, 3.6], R2: [-12, 8], R3: [-11, 15], R4: [-12, 23], R5: [-11, 31], R6: [-10, 38.5], R7: [-11, 45.5], R8: [-10, 52.5], MT: [-1, -4.5],
  C1: [7.6, 53.8], C2: [7.5, 45], C34: [7.4, 33.5], C5: [7.2, 27], C6: [7.4, 22.4], AI: [19, 22] };
let DECKI = null;
/* the deck's light pool under the station on screen (per tile, the lattice's chunk light) */
function deckPool() {
  const H = BB.hall; if (!DECKI) DECKI = H.CH.filter(c => c.tag === 'd').map(c => c.i);
  for (const i of DECKI) {
    const c = H.CH[i].c; let l = 0;
    for (const s of STN) { const a = ACT[s]; if (a < .01) continue; const p = STC[s], dx = c[0] - p[0], dz = c[2] - p[1]; l += a * 1.5 * Math.exp(-(dx * dx + dz * dz) / 30); }
    H.lit[i] = l;
  }
}
/* the work lamps: a lamp over the station on screen, its cone picked out by drifting dust (the key light made visible) */
const LAMPY = { C1: 5.2, C2: 5.6, C34: 5.0, C5: 4.6, C6: 4.6, MT: 6.5, R7: 7.5, R8: 9.5 };
function lamps() {
  for (const st of STN) {
    const a = ACT[st]; if (a < .05 || st === 'AI') continue;
    const c = STC[st], y0 = LAMPY[st] || 7.5, R = st[0] === 'C' ? 1.5 : 2.6;
    for (let k = 0; k < 24; k++) { const t = k / 24 * TAU; apX(BWX, c[0] + Math.cos(t) * .35, y0, c[1] + Math.sin(t) * .35, PW); K.dotW(PW[0], PW[1], PW[2], 2, WH, .8 * a); }
    apX(BWX, c[0], y0 - .05, c[1], PW); K.glowW(PW[0], PW[1], PW[2], 26, [255, 250, 232], .35 * a);
    apX(BWX, c[0], y0 + .1, c[1], PW); apX(BWX, c[0], y0 + 4, c[1], PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, WH, .4 * a);
    for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; apX(BWX, c[0] + Math.cos(t) * .35, y0, c[1] + Math.sin(t) * .35, PW); apX(BWX, c[0] + Math.cos(t) * .12, y0 + .25, c[1] + Math.sin(t) * .12, PW2); K.lineW(PW[0], PW[1], PW[2], PW2[0], PW2[1], PW2[2], 2, 1, WH, .5 * a); }
    for (let i = 0; i < 260; i++) {
      const j = (i * 7 + 11) & 8191, ph = (RND[j] + U_ * (.03 + .03 * RND[(j + 1) & 8191])) % 1, h = y0 * (1 - ph), rr = R * (1 - h / y0) * Math.sqrt(RND[(j + 2) & 8191]), t = RND[(j + 3) & 8191] * TAU + U_ * .05;
      apX(BWX, c[0] + Math.cos(t) * rr, h, c[1] + Math.sin(t) * rr, PW); K.dotW(PW[0], PW[1], PW[2], 1, WH, .22 * a * Math.sin(PI * ph));
    }
  }
}
/* the key light's direction (bay): from above, toward the camera's side */
const LKEY = [0, 1, 0];
function keyLight() {
  const e = K.C.eye, t = BWX.T, M = BWX.R, dx = e[0] - t[0], dy = e[1] - t[1], dz = e[2] - t[2];
  const ex = M[0] * dx + M[3] * dy + M[6] * dz, ez = M[2] * dx + M[5] * dy + M[8] * dz, g = K.C.target, gx = M[0] * (g[0] - t[0]) + M[3] * (g[1] - t[1]) + M[6] * (g[2] - t[2]), gz = M[2] * (g[0] - t[0]) + M[5] * (g[1] - t[1]) + M[8] * (g[2] - t[2]);
  let vx = ex - gx, vz = ez - gz; const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
  LKEY[0] = .62 * vx + .25 * vz; LKEY[1] = 1; LKEY[2] = .62 * vz - .25 * vx;
  const n = Math.hypot(LKEY[0], LKEY[1], LKEY[2]); LKEY[0] /= n; LKEY[1] /= n; LKEY[2] /= n; dirX(BWX, LKEY[0], LKEY[1], LKEY[2], LW);
  // the active station's key: from the camera's right, in front and above, so its faces model (the rim comes from
  // the lattice's own edge term and the rim lamp behind it)
  KEY3[0] = .45 * vx - .8 * vz; KEY3[1] = .95; KEY3[2] = .45 * vz + .8 * vx;
  const m = Math.hypot(KEY3[0], KEY3[1], KEY3[2]); KEY3[0] /= m; KEY3[1] /= m; KEY3[2] /= m;
}
const KEY3 = [0, 1, 0], LMIX = [0, 0, 0];
/* the light the next draws take: the hall's (a 0) or the active station's key (a 1) */
function setLight(a) {
  for (let k = 0; k < 3; k++) LMIX[k] = LKEY[k] + (KEY3[k] - LKEY[k]) * a;
  const n = Math.hypot(LMIX[0], LMIX[1], LMIX[2]) || 1; dirX(BWX, LMIX[0] / n, LMIX[1] / n, LMIX[2] / n, LW);
}
/* ---------------- the frame ---------------- */
let LASTU = -1, LASTT = -1;
function update(u, ctx) {
  if (u === LASTU && ctx.T === LASTT) return;
  LASTU = u; LASTT = ctx.T;
  U_ = u; A_ = warp(u); u = A_;
  // the bay in the world: the film's frame for it, else hung under the platform's core
  if (ctx.BAY) cmp(BWX, ctx.BAY(ctx.Tb), LOC.R, LOC.T[0], LOC.T[1], LOC.T[2]);
  else { cmp(XF4, ctx.Wt, rot9(M9a, -1, 0), 0, -120, -80); cmp(BWX, XF4, LOC.R, LOC.T[0], LOC.T[1], LOC.T[2]); }
  dirX(BWX, LB[0], LB[1], LB[2], LW);
  activity(U_);
  r1State(u); r2State(u); r3State(u); r4State(u); r5State(u); r6State(u); r7State(u); r8State(u);
  AF_ = afAt(U_); c2State(AF_); c34State(AF_); c5State(AF_); c6State(AF_); inspState(u);
  pieceAt(u);
}
let FXU = 0;
function fxf(ch, q) {
  const u = FXU;
  switch (ch) {
    case 3: {
      if (q >= 5000) {
        const kind = Math.floor(q / 1000), st = STN[Math.floor((q % 1000) / 20)], k = q % 20, on = lightOn(u, 0);
        if (kind === 5) return on;
        if (kind === 6) return on * (Math.floor(U_ * 1.4 + k * .37) % 2 ? 1 : .2);
        if (kind === 7) return on * (.2 + .9 * (ACT[st] || 0));
        if (kind === 8) return on * (R2S.p > .03 ? (Math.floor(U_ * 3) % 2 ? 1.6 : .2) : .15);
      }
      if (q >= 1000) return lightOn(u, 0) * (q % 3 === 1 ? (Math.floor(u * 1.7 + q) % 2 ? 1 : .3) : 1);
      return lightOn(u, NLIGHT[q] || 0);
    }
    case 10: return .85;                                      // the aisle's dashes
    case 11: return q >= 50 ? .55 * R2S.p : .1 + .95 * R2S.p * (q === 99 ? 1 : ss(0, 1, R2S.p * 1.3 - q / 26 * .3));
    case 12: return R3S.heat > .02 ? 1 + R3S.heat : 0;
    case 13: return R4S.ind > .01 ? (q === 9 ? .6 * R4S.ind : .5 * R4S.ind + R4S.ind * (.6 + .4 * Math.sin(u * 40 + q))) : 0;
    case 14: { const j = q % 36, sg = (q / 36) | 0, k = Math.floor(j / 6); return R6S.fin > k + (sg + 1) / 4 * .85 ? -1 : 0; }
    case 15: { const f = AF_, on = ss(33.6, 34.4, f) * (1 - ss(40.1, 40.5, f)); return on * (.35 + .25 * Math.sin(f * 9 + q)); }
    case 16: return q === 1 ? .9 * PLE(AF_) : .9 * PLD(AF_);
    case 18: return R3S.heat > .02 ? 10 + 1.7 * R3S.heat : 0;                      // the furnace's elements
    case 19: return AF_ > 47.8 && AF_ < 50.1 ? 10.7 : 0;                              // the bond stage's heater
    case 20: return R8S.heat > .02 ? 10 + 1.4 * R8S.heat : 0;                       // the curing oven's elements
  }
  return 0;
}
/* the lights come on down the hall at the entry */
const lightOn = (u, z) => { const a = u - (1.2 + (z + 10) / 70 * 1.8); return a < 0 ? 0 : a < .05 ? 1.5 : a < .09 ? .3 : 1; };
/* the deck hides what is under it (the press pit open) */
let DECK = [[-30, -10, 26, 6], [-30, 10, 26, 62], [-30, 6, -22, 10], [-10, 6, 26, 10]];
function deckOcc() { for (const [x0, z0, x1, z1] of DECK) K.occBox(BWX, [x0, -.9, z0], [x1, -.04, z1]); }
/* the rod (and the capsule) as solids: boxes inscribed in them */
const OMN = [0, 0, 0], OMX = [0, 0, 0];
const occIn = (X_, r, z0, z1) => { const h = r * .66; OMN[0] = -h; OMN[1] = -h; OMN[2] = z0; OMX[0] = h; OMX[1] = h; OMX[2] = z1; K.occBox(X_, OMN, OMX); };
function pieceOcc(u) {
  const st = PIECE.st, X_ = PIECE.X;
  if (st === 'green') occIn(X_, D.rg, -D.Lg / 2 + .05, D.Lg / 2 - .05);
  else if (st === 'sint' && u > 12.6) { if (K.SMOOTH) K.occA(E.ss(12.6, 12.85, u)); occIn(X_, D.rs, -D.Ls / 2 + .05, D.Ls / 2 - .05); K.occA(1); }
  else if (st === 'forge') { occIn(X_, D.rs, R4S.xt + .05, Math.min(XF - .05, R4S.xt + D.Ls - .05)); if (R4S.f > .1) occIn(X_, D.rf, XF + .05, XF + R4S.f * D.Lf / (D.Ls - D.LT) - .05); }
  else if (st === 'forged' || st === 'turn' || st === 'turned' || st === 'mill') occIn(X_, RR, -RL / 2 + D.LT + .05, RL / 2 - D.LN - .05);
  else if (st === 'body') occIn(X_, RR, -RL / 2 + D.LT + .05, RL / 2 - D.LN - .05);
  else if (st === 'case') { const zl = D.zc1 - nSecOn(u) * D.secL; occIn(X_, RR, -RL / 2 + D.LT + .05, zl - .05); if (zl < D.zc1 - .1) occIn(X_, D.rcas, zl + .05, D.zc1 - .05); }
  else if (st === 'cased' || st === 'fill' || st === 'cured' || st === 'done') {
    const xr = st === 'fill' ? ss(FL[0] - .12, FL[0] + .03, u) * (1 - ss(FL[1] + .02, FL[1] + .15, u)) : st === 'cased' ? 0 : INS.xr;
    if (xr < .05) occIn(X_, D.rcas, D.zc0 + .05, D.zc1 - .05);
  }
}
/* the machines' solid blocks near the lens (not while X-rayed) */
const EB = [0, 0, 0];
function machOcc() {
  const e = K.C.eye, M = BWX.R, t = BWX.T, dx = e[0] - t[0], dy = e[1] - t[1], dz = e[2] - t[2];
  EB[0] = M[0] * dx + M[3] * dy + M[6] * dz; EB[1] = M[1] * dx + M[4] * dy + M[7] * dz; EB[2] = M[2] * dx + M[5] * dy + M[8] * dz;
  OCC_OFF.r2p = false;
  for (const o of OCCS) {
    if (OCC_OFF[o.g]) continue;
    const cx = (o.mn[0] + o.mx[0]) / 2 - EB[0], cy = (o.mn[1] + o.mx[1]) / 2 - EB[1], cz = (o.mn[2] + o.mx[2]) / 2 - EB[2];
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 > 1300) continue;
    if (K.SMOOTH && d2 > 1050) { K.occA(1 - (d2 - 1050) / 250); K.occBox(BWX, o.mn, o.mx); K.occA(1); continue; }   // (SMOOTH: fading out from 32 to 36 m)
    K.occBox(BWX, o.mn, o.mx);
  }
}

/* keep w of what the base scene drew (fading it to the background), the rest of the frame is the bay's */
let D32 = null, BG32 = null;
function fadeBase(w) {
  const d = K.pb.d, bg = K.pb.bg;
  if (!D32 || D32.buffer !== d.buffer) { D32 = new Uint32Array(d.buffer); BG32 = new Uint32Array(bg.buffer); }
  const n = D32.length;
  for (let p = 0; p < n; p++) {
    if (D32[p] === BG32[p]) continue;                         // (most of the frame is background)
    const i = p << 2; d[i] = bg[i] + (d[i] - bg[i]) * w; d[i + 1] = bg[i + 1] + (d[i + 1] - bg[i + 1]) * w; d[i + 2] = bg[i + 2] + (d[i + 2] - bg[i + 2]) * w;
  }
}
let OA = null, OL = null;
const XSN = mkX();
function scanFrames(u, k) {
  switch (k) {
    case 'wid': return at(XSN, BWX, C1.pre[0], C1.pre[1], C1.pre[2]);
    case 'dic': return XTAB;
    case 'mod': return at(XSN, BWX, C6.b[0], C6.b[1], C6.b[2]);
  }
  return BWX;
}
function drawScans(u) {
  for (const s of SCANS) {
    const [u0, u1, k, lab, val, mn, mx, ax] = s;
    if (u < u0 - .05 || u > u1 + .9) continue;
    const X_ = scanFrames(u, k), p = lin(u, u0, u1), a = u < u1 ? 1 : 0;
    sweep(X_, mn, mx, ax, p, a);
  }
}
function draw(u0, ctx) {
  update(u0, ctx);
  const u = A_;
  FXU = u;
  const C = K.C;
  // the splices: the base scene (drawn under this) fades out as the bay fades in, and back at the end
  if (BASEW > .001) { if (BASEW < .999) fadeBase(BASEW); } else K.pb.clear();
  if (!OA) { OL = allO(); OA = OL.map(o => o.a); }
  const fd = 1 - BASEW, gain = g => { for (let i = 0; i < OL.length; i++) OL[i].a = OA[i] * fd * g; }, G = st => { gain(gainOf(st)); setLight(ACT[st] || 0); };
  gain(1);
  const late = BASEW > .96, tr = U_ > BW_.TRc[0];
  if (late && !tr) return;
  keyLight(); deckPool();
  K.occReset();
  L.frame({ zref: Math.max(4, V.dist(C.eye, C.target)), PXF: 3.1, PXL: 1.35 });
  // the closing crossfade: the base scene back, the round alone (bright) sliding on to its seat in the chamber
  if (late) { L.G.occ = false; gain(1.2 / Math.max(fd, .01)); drawSabot(u); drawPiece(u); return; }
  deckOcc(); machOcc(); pieceOcc(u); L.G.occ = true;
  setLight(0); gain(.85 + .3 * WIDE); L.draw(BB.hall, BWX, O.hall);
  gain(1); drawGantry(O.mc);
  G('R1'); drawR1(u); drawR1x(u); G('R2'); drawR2(u); drawR2x(u); G('R3'); drawR3(u); drawR3x(u); G('R4'); drawR4(u); drawR4x(u);
  G('R5'); drawR5(u); drawR5x(u); G('R6'); drawR6(u); drawR6x(u); G('R7'); drawR7(u); drawR7x(u); G('R8'); drawR8(u); drawR8x(u); G('MT'); drawMTx(u); if (tr) gain(1.2 / Math.max(fd, .01)); drawMT(u);
  setLight(0); gain(.8 + .3 * WIDE); L.draw(BB.crx, BWX, O.hallL);
  const f = AF_;                                               // (the chip fab and the hall on their own clock)
  G('C1'); drawC1(f); drawC1x(f); G('C2'); drawC2(f); drawC2x(f); G('C34'); drawC34(f); drawC34x(f); G('C5'); drawC5(f); drawC5x(f); G('C6'); drawC6(f); drawC6x(f);
  G('AI'); drawAI(f, Math.max(.35, ACT.AI || 0, WIDE));
  setLight(1); gain(tr ? 1.2 / Math.max(fd, .01) : U_ > BW_.TRb[0] - 1 ? 1.45 : 1.15); drawPiece(u);                 // (the round stays bright out to the splice)
  gain(1); drawWafer(f); drawScans(f); drawLens(f); lamps();
}

/* ---------------- magnified inspection views (the films' X-ray look): a hairline frame floating by the part, a
   leader to it, the magnified part inside: the wafer map at the dicer, the die map at the bonder, the CT slice ---------------- */
const LNS = {};
/* placed from its hold's camera: right of the part (oR), up (oU), toward the lens (oF), square to the camera */
function mkLens(key, beat, half, part, oR, oU, oF) {
  const h = SH.find(q => q.id === beat), e = V.lerp(h.e0, h.e1, .2), g = V.lerp(h.g0, h.g1, .2), f = nrm(sub(g, e)), r = nrm([f[2], 0, -f[0]]), up = nrm(V.cross(f, r));
  const c = add(add(add(g, mul(r, oR)), mul(up, oU)), mul(f, -oF)), n = nrm(sub(e, c)), U = nrm(V.cross(n, YA)), W = V.cross(U, n);
  LNS[key] = { c, U, W, h: half, part };
}
const LA = [0, 0, 0], LB2 = [0, 0, 0];
/* a lens's point (x right, y up, metres in its plane) into PW-style world arrays */
const lp = (L_, x, y, o) => apX(BWX, L_.c[0] + L_.U[0] * x + L_.W[0] * y, L_.c[1] + L_.U[1] * x + L_.W[1] * y, L_.c[2] + L_.U[2] * x + L_.W[2] * y, o);
function lline(L_, x0, y0, x1, y1, col, a, step) { lp(L_, x0, y0, LA); lp(L_, x1, y1, LB2); K.lineW(LA[0], LA[1], LA[2], LB2[0], LB2[1], LB2[2], step || 1.5, 1, col, a); }
function lrect(L_, x0, y0, x1, y1, col, a, step) { lline(L_, x0, y0, x1, y0, col, a, step); lline(L_, x1, y0, x1, y1, col, a, step); lline(L_, x1, y1, x0, y1, col, a, step); lline(L_, x0, y1, x0, y0, col, a, step); }
function lcirc(L_, x, y, r, n, col, a, a0, a1) { a0 = a0 || 0; a1 = a1 === undefined ? TAU : a1; for (let k = 0; k < n; k++) { const t0 = a0 + (a1 - a0) * k / n, t1 = a0 + (a1 - a0) * (k + 1) / n; lline(L_, x + Math.cos(t0) * r, y + Math.sin(t0) * r, x + Math.cos(t1) * r, y + Math.sin(t1) * r, col, a); } }
/* the frame: corner brackets, a faint fill grid, the leader to the part */
function lensFrame(L_, a) {
  const h = L_.h, c = .06;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { lline(L_, sx * h, sy * h, sx * (h - c), sy * h, LIME, a, 1.2); lline(L_, sx * h, sy * h, sx * h, sy * (h - c), LIME, a, 1.2); }
  lrect(L_, -h, -h, h, h, LIME, .35 * a, 3);
  for (let k = 1; k < 8; k++) { const y = -h + 2 * h * k / 8; lline(L_, -h, y, h, y, WH, .06 * a, 6); lline(L_, y, -h, y, h, WH, .06 * a, 6); }
  lp(L_, -h, -h, LA); apX(BWX, L_.part[0], L_.part[1], L_.part[2], LB2); K.lineW(LA[0], LA[1], LA[2], LB2[0], LB2[1], LB2[2], 4, 1, LIME, .45 * a);
  K.dotW(LB2[0], LB2[1], LB2[2], 3, LIME, a);
}
function buildLens() {
  mkLens('wmap', 'AI3a', .2, C5.t, .62, .36, -.5);
  mkLens('dmap', 'AI3b', .2, C6.b, .55, .16, -.5);
  mkLens('xs', 'MT', 2.3, [XMO - RL * .3, YR + .3, ZR.MT], 3.2, 4.2, -3.0);
}
/* u at the chip fab's time af (its keys are piecewise linear) */
function afInv(af) { for (let i = 1; i < AFK.length; i++) if (af <= AFK[i][1] && AFK[i][1] > AFK[i - 1][1]) return AFK[i - 1][0] + (AFK[i][0] - AFK[i - 1][0]) * sat((af - AFK[i - 1][1]) / (AFK[i][1] - AFK[i - 1][1])); return LEN; }
const lensA = (beat, d0, d1) => { const b = BW_[beat]; return tw(U_, b[0] + d0, b[1] - d1); };
/* the defective dies (a few at the edge): their field indices */
const BADD = new Set([0, 9, 47]);
function drawLens(u) {
  // the wafer map at the dicer: 2x, the dies, the streets as they are cut, then the probe results
  let a = lensA('AI3a', .5, .2);
  if (a > .02) {
    const L_ = LNS.wmap, k = 1.2; lensFrame(L_, a);
    lcirc(L_, 0, 0, WRAD * k, 72, WH, .8 * a); lline(L_, -.012 * k, -WRAD * k + .006, .012 * k, -WRAD * k + .006, WH, a);
    const res = sat((U_ - afInv(CUTZ[1] - .1)) / 1.6);
    for (let i = 0; i < NF; i++) {
      const f = FIELDS[i], x0 = (f[0] - .0125) * k, x1 = (f[0] + .0125) * k, y0 = (f[1] - .016) * k, y1 = (f[1] + .016) * k;
      const col = res > 0 && i / NF < res ? (BADD.has(i) ? K.CORAL || [255, 106, 61] : LIME) : WH;
      lrect(L_, x0, y0, x1, y1, col, (col === WH ? .45 : .85) * a, 2);
      if (col !== WH && BADD.has(i)) { lline(L_, x0, y0, x1, y1, col, a); lline(L_, x0, y1, x1, y0, col, a); }
    }
    for (let j = 0; j < C5S.nx; j++) { const o = streetX(j) * k, hh_ = Math.sqrt(Math.max(0, (WRAD * k) ** 2 - o * o)); lline(L_, -hh_, o, hh_, o, LIME, .5 * a, 3); }
    for (let j = 0; j < C5S.nz; j++) { const o = streetZ(j) * k, hh_ = Math.sqrt(Math.max(0, (WRAD * k) ** 2 - o * o)); lline(L_, o, -hh_, o, hh_, LIME, .5 * a, 3); }
    if (res > 0 && res < 1) { const y = -WRAD * k + 2 * WRAD * k * res; for (let j = 0; j < 4; j++) lline(L_, -WRAD * k, y - j * .004, WRAD * k, y - j * .004, LIME, a * (1 - j * .25), 1); lp(L_, 0, y, LA); K.glowW(LA[0], LA[1], LA[2], 30, LIME, .3 * a); }
  }
  // the die map at the bonder: 14x, the blocks, the pad ring, the pads lighting as the wires land
  a = lensA('AI3b', .5, .2);
  if (a > .02) {
    const L_ = LNS.dmap, k = 11, w = .0125 * k, h = .0155 * k; lensFrame(L_, a);
    lrect(L_, -w, -h, w, h, WH, .9 * a, 1.2); lrect(L_, -w * .86, -h * .88, w * .86, h * .88, WH, .4 * a, 2);
    const B_ = [[-.8, .15, -.05, .8], [.05, .15, .8, .8], [-.8, -.55, .2, .05], [.32, -.55, .8, -.18], [.32, -.8, .8, -.62]];
    for (const [x0, y0, x1, y1] of B_) lrect(L_, x0 * w, y0 * h, x1 * w, y1 * h, WH, .7 * a, 1.5);
    for (let j = 1; j < 8; j++) { const y = (-.55 + .6 * j / 8) * h; lline(L_, -.8 * w, y, .2 * w, y, WH, .3 * a, 3); }
    for (const [x0, x1] of [[-.8, -.05], [.05, .8]]) for (let j = 1; j < 4; j++) { const x = (x0 + (x1 - x0) * j / 4) * w; lline(L_, x, .15 * h, x, .8 * h, WH, .3 * a, 3); }
    lcirc(L_, -.55 * w, -.72 * h, .1 * w, 24, WH, .7 * a);
    const nw = Math.floor(NWIRE * lin(u, C6T.wire[0], C6T.wire[1]));
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) { const x = (-.75 + i * .25) * w, y = s * .94 * h, on = (i * 2 + (s > 0 ? 1 : 0)) < nw; lrect(L_, x - .03 * w, y - .025 * h, x + .03 * w, y + .025 * h, on ? LIME : WH, (on ? 1 : .5) * a, 1); if (on) lline(L_, x, y, x, y + s * .12 * h, LIME, .8 * a, 1.5); }
    const sc = sat((U_ - afInv(48.4)) / 2.0); if (sc > 0 && sc < 1) { const x = -w + 2 * w * sc; for (let j = 0; j < 4; j++) lline(L_, x - j * .004, -h, x - j * .004, h, LIME, a * (1 - j * .25), 1); lp(L_, x, 0, LA); K.glowW(LA[0], LA[1], LA[2], 30, LIME, .3 * a); }
  }
  // the inspection: the slice under the ring (core, fill, casing; the fins at the tail) and the round's section built
  // up slice by slice behind it as the ring travels (its height x6)
  a = lensA('MT', .9, .6);
  if (a > .02 && LNS.xs) {
    const L_ = LNS.xs, h = L_.h, ks = h * .38 / D.rcas, cx = -h * .55, xr = INS.xr, zr = INS.x - XMO, fz = zr / RL + .5;
    lensFrame(L_, a);
    lcirc(L_, cx, 0, D.rcas * ks, 64, WH, a); lcirc(L_, cx, 0, (D.rcas - .03) * ks, 56, WH, .6 * a);
    const onBody = zr > D.zc0 && zr < D.zc1, onTail = zr > -RL / 2 && zr < -RL / 2 + D.LT;
    if (onBody || onTail) lcirc(L_, cx, 0, RR * ks, 48, LIME, (xr > .02 ? 1 : .5) * a);
    if (onBody) for (let j = 0; j < 3; j++) lcirc(L_, cx, 0, (RR + (D.rcas - .03 - RR) * (j + 1) / 4) * ks, 40, WH, .25 * a);
    if (onTail) for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; lline(L_, cx + Math.cos(t) * D.rcore * ks, Math.sin(t) * D.rcore * ks, cx + Math.cos(t) * D.rs * ks, Math.sin(t) * D.rs * ks, LIME, a); }
    // the section: x across the round's length, y x6
    const x0 = -h * .02, x1 = h * .92, ky = 6 * (x1 - x0) / RL, X_ = z => x0 + (x1 - x0) * (z / RL + .5);
    lrect(L_, X_(-RL / 2), -D.rcas * ky, X_(D.zc1), D.rcas * ky, WH, .35 * a, 3);
    const n = Math.floor(64 * sat(fz));
    for (let i = 0; i < n; i++) {
      const z = -RL / 2 + RL * (i + .5) / 64, x = X_(z), core = z < RL / 2 - D.LN ? RR : ogR(z - (RL / 2 - D.LN)), cas = z > D.zc0 && z < D.zc1;
      lline(L_, x, -core * ky, x, core * ky, LIME, (i > n - 4 ? 1 : .55) * a, 1.5);
      if (cas) { lline(L_, x, core * ky, x, D.rcas * ky, WH, .35 * a, 2); lline(L_, x, -D.rcas * ky, x, -core * ky, WH, .35 * a, 2); }
    }
    if (n > 0 && n < 64) { const x = X_(-RL / 2 + RL * n / 64); lline(L_, x, -h * .5, x, h * .5, LIME, a, 1); }
  }
}
function lensTags(u) {
  const T = (key, beat, d0, lab, val) => { const L_ = LNS[key], b = BW_[beat], w0 = b[0] + d0, w1 = Math.max(b[1] - .3, w0 + 3.1); if (U_ < w0 || U_ > w1) return; const a = tw(U_, w0, w1); lp(L_, L_.h, L_.h, TP2); if (!K.pj(TP2[0], TP2[1], TP2[2])) return; const tg = BXT[key] || (BXT[key] = K.mkTag()); K.setTag(tg, '', K.decode(lab, sat((U_ - w0) / .6), FXU, key.length), val, 'lime sm', K.PJ[0] + 8 * K.S, K.PJ[1] - 26 * K.S, a); };
  T('wmap', 'AI3a', .6, `WAFER MAP ×1.2 · ${NF} DIES`, u > CUTZ[1] + .2 ? `${NF - BADD.size} GOOD` : 'PROBING');
  T('dmap', 'AI3b', .6, 'DIE MAP ×11 · 2 CORES · MEMORY · PADS', `${Math.floor(NWIRE * lin(u, C6T.wire[0], C6T.wire[1]))}/${NWIRE}`);
  T('xs', 'MT', 1.0, 'X-RAY · SECTION BUILT SLICE BY SLICE (HEIGHT ×6)', `${Math.round(100 * sat((INS.x - XMO) / RL + .5))} %`);
}

/* ---------------- tags and readout ----------------
   Every tag decodes in 0.6 s and then stays fully legible for at least 2.4 s; each acronym is spelled out the first
   time it shows. Windows are in the film's seconds, from a hold's start: [beat, from, to]. */
const TG = {};
const tgOf = k => TG[k] || (TG[k] = K.mkTag());
const TP = [0, 0, 0];
const TP2 = [0, 0, 0], CAPT = [0, 0, 0];
function tag(id, lab, val, x, y, z, a, age, side, world, lift) {
  if (a < .01) return;
  if (world) { TP[0] = x; TP[1] = y; TP[2] = z; } else apX(BWX, x, y, z, TP);
  const S = K.S;                                             // (raster px: the offsets are stage px x S)
  if (!K.pj(TP[0], TP[1], TP[2])) return;
  // an anchor drifting off the frame keeps its tag at the frame's edge (the tag stays legible for its whole window)
  const px = K.PJ[0], py = K.PJ[1], mx = 90 * S, my = 110 * S, sx = Math.min(K.BW - mx, Math.max(mx, px)), sy = Math.min(K.BH - my, Math.max(my, py)), off = sx !== px || sy !== py;
  if (off && (Math.abs(sx - px) > 500 * S || Math.abs(sy - py) > 400 * S)) return;
  const tg = tgOf(id + lab.slice(0, 12)), w = K.tagW(tg);
  let s = side || (sx > 1100 * S ? -1 : 1);
  if (s > 0 && sx / S + 58 + w > 1880) s = -1; else if (s < 0 && sx / S - 58 - w < 40) s = 1;
  const dx = 54 * s * S, lx = sx + dx;
  let ly = sy - 50 * S - (lift || 0) * S;
  if ((dx > 0 ? lx / S + 4 : lx / S - 4 - w) < 440 && ly / S < 250) ly = 262 * S;          // (clear of the readout)
  K.leader(sx, sy, lx, ly, '#C6F432', .8 * a); if (!off) K.dot(sx, sy, Math.round(3 * S), LIME[0], LIME[1], LIME[2], a);
  K.setTag(tg, id, K.decode(lab, sat(age / .6), FXU, id.length + lab.length), val, 'lime sm', dx > 0 ? lx + 4 * S : lx - 4 * S - w * S, ly - 12 * S, a);
}
const tw = (u, a, b) => sat((u - a) / .25) * (1 - sat((u - b + .3) / .3));
/* a tag shown from from to to seconds after beat id starts */
function T_(beat, from, to, id, lab, val, p, side, lift) {
  if (!BW_[beat]) return;
  const b0 = BW_[beat][0], w0 = b0 + from, w1 = Math.max(b0 + to, w0 + 3.1), U = U_;
  if (U < w0 - .1 || U > w1 + .1) return;
  tag(id, lab, val, p[0], p[1], p[2], tw(U, w0, w1), U - w0, side, false, lift);
}
const BXT = {};
/* a bracket round a box (bay min / max) with a short placard */
function boxTag(key, lab, val, mn, mx, a, age, X_) {
  if (a < .01) return;
  const b = K.boxOf(mn, mx, X_ || BWX, 6 * K.S); if (!b) return;
  K.bracket(b, '#C6F432', .85 * a, 10, 1.2);
  const tg = BXT[key] || (BXT[key] = K.mkTag());
  K.setTag(tg, '', K.decode(lab, sat(age / .6), FXU, key.length), val, 'lime sm', b[2] + 6 * K.S, b[1] - 2 * K.S, a);
}
function scanTags(u) {
  for (const s of SCANS) {
    const [a0, a1, k, lab, val, mn, mx] = s, w0 = afInv(a0), w1 = Math.max(afInv(a1) + 2.6, w0 + 3.2), U = U_;
    if (U < w0 || U > w1) continue;
    const X_ = scanFrames(u, k), b = K.boxOf(mn, mx, X_, 6 * K.S); if (!b) continue;
    const a = tw(U, w0, w1);
    K.bracket(b, '#C6F432', .9 * a, 10, 1.3);
    const tg = BXT[k] || (BXT[k] = K.mkTag());
    K.setTag(tg, '', K.decode(lab, sat((U - w0) / .6), FXU, k.length), val, 'lime sm', b[2] + 6 * K.S, b[1] - 2 * K.S, a);
  }
}
function tags(u0, ctx) {
  update(u0, ctx); const u = A_, f = AF_; FXU = u;
  scanTags(f); lensTags(f);
  const z1 = ZR.R1, xe = XR + D.Lb / 2, zf = XR + RL / 2 - D.LN, M = D.M, rc = D.rcas;
  const T3 = Math.round(20 + 2380 * Math.min(1, R3S.heat / .99));
  T_('IN', 5.4, 8.8, '', 'FABRICATION BAY · ONE ROUND', '70 M', [-2, 12, 22], 1);
  T_('IN', 5.8, 9.4, '', 'ROUND LINE · 8 STATIONS', 'PORT', [-11, 3.5, 24], -1);
  // the core
  T_('R2', .4, 5.8, 'R2', 'COLD ISOSTATIC PRESS · WATER', `${Math.round(310 * R2S.p)} MPA`, [XV, 1.6, ZR.R2], 1);
  T_('R2', 1.4, 5.8, '', 'WIRE-WOUND VESSEL · 26 LAYERS', '', [XV - 1.25, -3, ZR.R2], -1);
  T_('R2', 3.2, 6.8, '', 'COMPACT · 65 % DENSE', `Ø ${Math.round(2000 * mix(D.rb - .01, D.rg, R2S.shrink))} MM`, [XV, -4.5, ZR.R2 - .3], -1, 70);
  T_('R3', .3, 5.3, 'R3', 'SINTERING FURNACE · HYDROGEN (H₂)', `${T3} °C`, [XR + 3, YR + FR + .3, ZR.R3 - .4], 1);
  T_('R3', 2.0, 5.6, '', 'DENSITY 65 → 94 %', `Ø ${Math.round(2000 * mix(D.rg, D.rs, R3S.shrink))} MM`, [XR - 2.5, YR + .5, ZR.R3], -1);
  T_('R4', .3, 6.3, 'R4', 'RADIAL FORGE · 4 HAMMERS', '840 BLOWS/MIN', [XF, 4.8, ZR.R4 - 1.5], 1);
  T_('R4', 1.0, 6.3, '', 'INDUCTION COIL · 1450 °C', '', [(COIL_X[0] + COIL_X[1]) / 2, YR + .6, ZR.R4], -1);
  T_('R4', 2.2, 6.3, '', `Ø ${Math.round(D.rs * 2000)} → ${Math.round(D.rf * 2000)} MM`, `${Math.round(100 * R4S.f / (D.Ls - D.LT))} %`, [XF + 1.8, YR + .4, ZR.R4], 1, 40);
  { const P = PIECE.X.T, w0 = BW_.m46[0] + .6, w1 = w0 + 3.4; if (U_ > w0 - .1 && U_ < w1 + .1) tag('R5', 'TURNING AND GRINDING · Ra 0.2 µm', `Ø ${(RR * 2000).toFixed(1)} MM`, P[0], P[1], P[2], tw(U_, w0, w1), U_ - w0, 1, true, 30); }
  T_('R6', .3, 3.8, 'R6', 'OGIVE · 5-AXIS MILL', `${(D.LN * 1000).toFixed(0)} MM`, [zf + D.LN * .5, YR + .35, ZR.R6], 1);
  T_('R6', 1.2, 4.6, '', 'TOOL CAROUSEL · 16 TOOLS', '', [XR + RL / 2 + 1.4, 3.9, ZR.R6 + .1], 1, 80);
  T_('R6', 3.0, 6.4, '', 'FINS · 6 SLOTS', `${Math.min(6, Math.floor(R6S.fin))}/6`, [XR - RL / 2 + D.LT * .5, YR + D.rs, ZR.R6], -1);
  // the casing, the fill, the cure
  { let nw = 0; for (let k = 0; k < D.NSEC; k++) if (u > CSW(k)[4]) nw++; if (u > CSEND + .17) nw++;
    T_('R7', .3, 4.2, 'R7', `CASING · ${D.NSEC} SECTIONS · STEEL`, `${nSecOn(u)}/${D.NSEC}`, [XR + D.zc1 - D.secL * 1.5, YR + rc + .15, ZR.R7], -1);
    T_('R7', 1.0, 4.6, '', 'FACING HEAD · JOINT FACES ±20 µm', '', [XR - RL / 2 - .35, YR + rc + .35, ZR.R7], 1, 30);
    T_('R7', 4.2, 7.8, '', 'ORBITAL WELD · EACH JOINT 360°', `${nw}/${D.NSEC + 1}`, [XR + D.zc1 - D.secL * 3, YR + rc + .4, ZR.R7 - .3], 1, 30);
    T_('R7', 4.6, 7.8, '', 'CORE · HELD BY ITS OGIVE (MICROGRAVITY)', '', [XR + RL / 2 - D.LN * .55, YR + .7, ZR.R7], -1, 60); }
  T_('m78', .4, 3.6, 'R8', 'FILL · MIXED IN 3 VESSELS', '', [XR, YMZ + 3.5, ZR.R8 + 3.1], 1);
  T_('R8', .5, 4.4, '', 'POUR · 10 PORTS · CLOSED CASING (X-RAY)', `${Math.round(100 * R8S.fill)} %`, [XR - 3, YR + rc + .3, ZR.R8], -1);
  T_('R8', 4.8, 8.8, '', 'CURING OVEN · 160 °C · 4 H', `${Math.round(20 + 140 * R8S.heat)} °C`, [XR + RL / 2 - 1, 3.2, ZR.R8 - 1.8], 1);
  { const P = PIECE.X.T, w0 = BW_.mMT[0] + .6, w1 = w0 + 3.4; if (U_ > w0 - .1 && U_ < w1 + .1) tag('', `ROUND · CORE AND CASING · ${D.Mc.toFixed(0)} T`, `${RL.toFixed(1)} M`, P[0], P[1], P[2], tw(U_, w0, w1), U_ - w0, -1, true); }
  // the inspection
  T_('MT', .4, 4.4, 'MT', 'INSPECTION RING · X-RAY', INS.xr > .05 ? 'SCANNING' : 'DONE', [XMO - RL / 2 - 1.0, YR + rc + 1.2, ZR.MT], -1);
  T_('MT', 3.8, 7.8, '', 'CORE STRAIGHT · FILL 0 VOIDS · JOINTS 6/6', '', [XMO + RL * .25, YR + rc + .2, ZR.MT], 1, 30);
  // the reveal: the chip fab and the hall
  T_('AI1', 1.0, 8.4, '', 'PLATFORM AI · AUTONOMOUS · NO CREW', '', [19.5, 4.2, 30], 1);
  T_('AI1', 2.2, 8.4, '', 'CHIP FAB · ITS OWN PROCESSORS', 'ISO 3', [8, 7.4, 40], -1);
  T_('AI1', 3.4, 8.4, '', `DATA HALL · ${NRACK} RACKS · 2.4 MW`, '', [20, 2.8, 14], 1, 40);
  T_('AI1', 4.6, 8.4, '', 'FIBRE TRUNK · TO THE FAB AND THE GUN', '', [18.9, 3.4, 30], -1, 30);
  T_('AI2', .2, 3.9, 'C2', 'EXTREME-ULTRAVIOLET (EUV) SCANNER', '13.5 NM', [7.5, 3.95, 46.5], 1);
  T_('AI2', .6, 3.8, '', 'TIN DROPLETS · 50 000 /S', '27 µm', [LX, 2.6, LP.pl[1]], 1, 40);
  T_('AI2', 1.0, 4.2, '', 'COLLECTOR MIRROR · Ø 650 MM', '', [LX, 2.33, 48.0], -1, 60);
  T_('AI2', 4.2, 7.8, '', 'PROJECTION · 6 MIRRORS ON FLEXURE MOUNTS', '', [LX, 2.6, 43.2], -1, 50);
  T_('AI2', 4.6, 7.8, '', 'RETICLE · 4× THE PRINT', `${(EXS.rz * 1000).toFixed(0)} MM`, [LX, 3.56, LP.ret[1] + EXS.rz], 1);
  T_('AI3a', .3, 4.2, 'C5', 'DICING · Ø 56 MM DIAMOND BLADE', '30 000 RPM', [C5.t[0], C5.t[1] + .07, C5.t[2]], -1);
  T_('AI3b', .3, 4.2, 'C6', 'DIE BOND · AI PROCESSOR · ±3 µm', `${Math.floor(NWIRE * lin(f, C6T.wire[0], C6T.wire[1]))}/${NWIRE} WIRES`, [C6.b[0], C6.b[1] + .01, C6.b[2]], -1);
  T_('AI4', .4, 4.4, '', 'COLD AISLE · CONTAINED · 22 °C', '', [16.3, 2.2, 22], 1);
  T_('AI4', 1.4, 5.4, '', 'RACK · 42 U · 40 KW · LIQUID-COOLED DOORS', '', [15.6, 1.6, 17.5], -1, 40);
  T_('AI4', 4.6, 8.6, '', 'FIBRE · 400 Gb/s PER LINK', '', [17.6, DH.rh + .56, 24], 1, 30);
  // the round on the column, the sabot
  { const R_ = roundAt(u); apX(R_, 0, rc + .1, 0, TP2); const w0 = BW_.TRb[0] + .6, w1 = w0 + 5.2; if (U_ > w0 - .1 && U_ < w1 + .1) tag('', `ROUND · ${D.Mc.toFixed(0)} T · ${RL.toFixed(1)} M`, 'THE TURNTABLE · 1 TURN', TP2[0], TP2[1], TP2[2], tw(U_, w0, w1), U_ - w0, -1, true); }
  { const R_ = roundAt(u); apX(R_, 0, SABR, 0, TP2); const w0 = BW_.TRc[0] + .3, w1 = BW_.TRd[1] - 1.2; if (U_ > w0 && U_ < w1 + .1) tag('', `SABOT · ${NPET} PETALS · ARMATURE`, `${SABL.toFixed(1)} M`, TP2[0], TP2[1], TP2[2], tw(U_, w0, w1), U_ - w0, 1, true, 40); }
}
const r2 = (x, n) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, x))) - (n - 1))); return Math.round(x / p) * p; };
/* the fabrication's own clock: it ran hours before the shot (the readout's T counts to the base take's T at the
   splice); its rate is the station's time compression x the beats' warp, integrated over the insert */
const NOM = { IN: 2, R1: 600, R2: 600, R3: 5000, R4: 60, R5: 120, R6: 300, R7: 600, R8: 3000, MT: 30, AI: 1, C1: 2, C2: 3, C34: 60, C5: 10, C6: 4, TR: 1 };
const FABST = { C1: 1, C2: 1, C34: 1, C5: 1, C6: 1 };
const afRate = u => (afAt(u + .02) - afAt(u - .02)) / .04;
const rateAt = u => { const s = stationAt(u); return s === 'AI' ? 1 : NOM[s] * (FABST[s] ? afRate(u) : wrate(u)); };
const CLK = [], CLKDT = .05;
let ENDC = null;
function buildClock() {
  CLK.length = 0; let acc = 0; CLK.push(0);
  for (let u = 0; u < LEN; u += CLKDT) { const m = u + CLKDT / 2; acc += rateAt(m) * CLKDT; CLK.push(acc); }
}
const clockAt = u => { const i = Math.max(0, Math.min(CLK.length - 2, Math.floor(u / CLKDT))), f = E.clamp(u / CLKDT - i, 0, 1); return CLK[i] + (CLK[i + 1] - CLK[i]) * f; };
function fabClock(u) {
  if (ENDC === null) { ENDC = -20.4; try { const d = window.STAGE && STAGE.dbg && STAGE.dbg(); if (d && d.simClock) ENDC = d.simClock(CTX.AT_FAB !== undefined ? CTX.AT_FAB : 149.2); } catch (e) { /* the harness: no film */ } }
  const t = ENDC - (CLK[CLK.length - 1] - clockAt(u)), a = Math.abs(t), sg = t < 0 ? '−' : '+';
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), sec = Math.floor(a % 60);
  return `T${sg}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function readout(u0, ctx) {
  const r = readStation(u0, ctx), s = stationAt(u0);
  return { l1: r.l1, l2: `${r.l2}<br>Fabrication · <b>${fabClock(u0)}</b>`, rate: Math.max(1, r2(rateAt(u0), 2)) };
}
function readStation(u0, ctx) {
  update(u0, ctx);
  const u = A_, s = stationAt(u0), M = D.M, wr = wrate(u0), R = n => Math.max(1, r2(n * wr, 2)), RF = n => Math.max(1, r2(n * afRate(u0), 2));
  switch (s) {
    case 'IN': return { l1: 'Fabrication bay · <b>70 m</b> · 2 lines', l2: `Rod · <b>${RL.toFixed(1)} m</b> · Ø <b>${Math.round(RR * 2000)} mm</b> · <b>${M.toFixed(1)} t</b>`, rate: R(2) };
    case 'R1': return { l1: `Powder · <b>${(M * 1.046 * R1S.fill).toFixed(1)} t</b> of ${(M * 1.046).toFixed(1)}`, l2: 'Tungsten <b>99.95 %</b> · auger fed', rate: R(600) };
    case 'R2': return { l1: `Isostatic press · <b>${Math.round(310 * R2S.p)} MPa</b>`, l2: `Compact · <b>${Math.round(45 + 20 * R2S.shrink)} %</b> dense`, rate: R(600) };
    case 'R3': { const T = Math.round(20 + 2380 * Math.min(1, R3S.heat / .99)); return { l1: `Sinter · H₂ · <b>${T} °C</b>`, l2: `Density <b>${Math.round(65 + 29 * R3S.shrink)} %</b> · 6 h`, rate: R(5000) }; }
    case 'R4': return { l1: `Radial forge · <b>${Math.round(100 * R4S.f / (D.Ls - D.LT))} %</b>`, l2: 'Bar <b>1450 °C</b> · 2.4 m/min', rate: R(60) };
    case 'R5': return u < GRIND[0] ? { l1: `Turning · Ø <b>${(RR * 2000).toFixed(1)} mm</b>`, l2: 'Feed <b>0.6 mm/rev</b> · 40 rpm', rate: R(120) } : { l1: 'Grinding · Ra <b>0.2 µm</b>', l2: 'Wheel <b>Ø 1240 mm</b> · 30 m/s', rate: R(120) };
    case 'R6': return u < FINS[0] ? { l1: `Ogive · <b>${(D.LN * 1000).toFixed(0)} mm</b>`, l2: 'Mill-turn · <b>5 axes</b>', rate: R(300) } : { l1: `Fins · <b>${Math.min(6, Math.floor(R6S.fin))}/6</b>`, l2: 'Slot depth <b>85 mm</b>', rate: R(300) };
    case 'R7': { let nw = 0; for (let k = 0; k < D.NSEC; k++) if (u > CSW(k)[4]) nw++; if (u > CSEND + .17) nw++; return { l1: `Casing · <b>${nSecOn(u)}/${D.NSEC}</b> sections on`, l2: `Orbital welds · <b>${nw}/${D.NSEC + 1}</b>`, rate: R(NOM.R7) }; }
    case 'R8': return u < CU[0] ? { l1: `Fill · <b>${Math.round(100 * R8S.fill)} %</b> poured`, l2: 'Three vessels · <b>mixing</b>', rate: R(NOM.R8) } : { l1: `Cure · <b>${Math.round(20 + 140 * R8S.heat)} °C</b>`, l2: 'Split oven · <b>closed</b>', rate: R(NOM.R8) };
    case 'MT': return u < 58 ? { l1: `Round · <b>${D.Mc.toFixed(0)} t</b> · to the lift`, l2: 'Gantry · <b>over the hall</b>', rate: R(NOM.MT) } : { l1: `Inspection · <b>${INS.xr > .05 ? 'X-ray' : INS.sc > .05 ? 'scan' : 'done'}</b>`, l2: 'Core straight · fill <b>0 voids</b>', rate: R(NOM.MT) };
    case 'AI': return { l1: 'Platform AI · <b>autonomous</b>', l2: `Data hall · <b>${NRACK} racks</b> · 2.4 MW`, rate: 1 };
    case 'C1': return { l1: 'Wafer · <b>300 mm</b> · silicon', l2: 'Chip fab · <b>the AI’s processors</b>', rate: RF(NOM.C1) };
    case 'C2': return { l1: 'EUV · <b>13.5 nm</b> · NA 0.33', l2: `Field <b>${Math.max(0, EXS.k + 1)}/${NF}</b> · overlay 1.1 nm`, rate: RF(NOM.C2) };
    case 'C34': return AF_ < 42.6 ? { l1: 'Plasma etch · <b>CF₄/O₂</b>', l2: 'Depth <b>120 nm</b> · 13.56 MHz', rate: RF(NOM.C34) } : { l1: 'PVD · <b>copper</b> · 40 nm', l2: 'Target <b>18 kW</b>', rate: RF(NOM.C34) };
    case 'C5': return { l1: `Dicing · <b>${C5S.nx + C5S.nz}/22</b> streets`, l2: 'Blade <b>Ø 56 mm</b> · 30 000 rpm', rate: RF(NOM.C5) };
    case 'C6': return { l1: 'Die bond · <b>AI processor</b> · ±3 µm', l2: `Wire bond · <b>${Math.floor(NWIRE * lin(AF_, C6T.wire[0], C6T.wire[1]))}/${NWIRE}</b> · 25 µm gold`, rate: RF(NOM.C6) };
    case 'TR': return { l1: `Round · <b>${D.Mc.toFixed(0)} t</b> · ${RL.toFixed(1)} m`, l2: u < LIFT[1] ? 'Column · <b>up and once round</b>' : u < PUSH[0] ? 'Sabot · <b>closing</b>' : 'Through the port · <b>to the chamber</b>', rate: R(NOM.TR) };
  }
  return { l1: '', l2: '', rate: 1 };
}

/* ---------------- build ---------------- */
function build(ctx) {
  CTX = ctx; K = ctx.K; L = ctx.L; Body = L.Body; P_ = ctx.P;
  dims(P_, ctx.ROUND);
  // the hall is the platform's bay (its half extents), seen from the front wall; the chamber on the bore's axis
  if (ctx.BAY_HALF) {
    const [hx, hy, hz] = ctx.BAY_HALF;
    HALL.x0 = -2 - hx; HALL.x1 = -2 + hx; HALL.y1 = 2 * hy; HALL.z1 = HALL.z0 + 2 * hz;
    LOC.T[0] = -2; LOC.T[1] = -hy; LOC.T[2] = HALL.z0 + hz; PORT[1] = hy;
    if (ctx.CHAMBER_IN_BAY) ZCH = HALL.z0 + hz - Math.abs(ctx.CHAMBER_IN_BAY[2]);          // (the chamber is ahead of the bay along the bore)
    DECK = [[HALL.x0, HALL.z0, HALL.x1, 6], [HALL.x0, 10, HALL.x1, HALL.z1], [HALL.x0, 6, -22, 10], [-10, 6, HALL.x1, 10]];
  }
  for (const o of allO()) o.fx = fxf;
  buildHall(); buildGantry(); buildR1(); buildR2(); buildR3(); buildR4(); buildR5(); buildR6(); buildR7(); buildR8(); buildMT();
  buildC1(); buildC2(); buildC34(); buildC5(); buildC6(); buildAI();
  dressR1(); dressR2(); dressR3(); dressR4(); dressR5(); dressR6(); dressR7(); dressR8(); dressMT();
  dressCR(); dressC1(); dressC2(); dressC34(); dressC5(); dressC6();
  buildJourney(); buildCam(); buildLens(); buildClock();
  const W_ = WRAD, rc = D.rc, Lc = D.Lc;
  SCANS.push([47.42, 47.62, 'dic', 'DIES · 64 GOOD', 'KERF 35 µm', [-W_, -.002, -W_], [W_, .02, W_], 2]);
  SCANS.push([49.72, 49.94, 'mod', 'BOND CHECK · 28 WIRES', 'PULL 9 gf', [-rc + .04, 0, -rc + .04], [rc - .04, .065, rc - .04], 0]);
}

/* ---------------- sound ---------------- */
const SFX = () => window.STAGE && STAGE.SFX;
const sfx = (fn) => () => { const S = SFX(); if (S) fn(S); };
const clunk = sfx(S => { S.tone(110, 60, .25, 'square', .03); S.noise(.22, 500, 1, .04, .005); });
const tick = sfx(S => S.tone(1650, 1650, .05, 'square', .012));
const whir = d => sfx(S => S.tone(80, 140, d, 'sawtooth', .008));
const cues = [
  [1.3, sfx(S => S.tone(220, 880, 1.2, 'sine', .012))], [1.6, tick], [2.0, tick], [2.4, tick],
  [3.6, whir(2.4)], [6.15, clunk], [6.4, whir(1.4)], [7.85, clunk], [8.45, sfx(S => S.tone(55, 190, .7, 'sawtooth', .014))], [9.1, sfx(S => S.noise(.5, 2400, .6, .03, .02))],
  [11.3, clunk], [11.55, sfx(S => S.tone(48, 64, 1.1, 'sawtooth', .016))], [12.55, whir(.4)],
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => [14.35 + k * .21, sfx(S => S.noise(.07, 900, 1, .05, .002))]),
  [17.9, clunk], [18.15, sfx(S => S.tone(320, 360, .85, 'sawtooth', .008))], [19.05, sfx(S => S.noise(.7, 3200, .5, .03, .02))],
  [20.85, clunk], [20.9, sfx(S => S.tone(260, 300, .85, 'sawtooth', .008))], ...[0, 1, 2, 3, 4, 5].map(k => [22.4 + k * .158, tick]),
  [24.35, clunk], ...[0, 1, 2, 3, 4].map(k => [CS0 + k * CSD + .12, whir(.6)]), ...[0, 1, 2, 3, 4, 5].map(k => [k < 5 ? CS0 + k * CSD + .33 : CSEND + .03, sfx(S => S.noise(.6, 2600, .5, .03, .03))]),
  [27.6, sfx(S => S.tone(70, 90, 1.6, 'sawtooth', .01))], [28.15, sfx(S => S.noise(1.4, 500, .6, .03, .3))], [29.15, clunk], [29.4, sfx(S => S.tone(60, 62, 2.0, 'sine', .014))], [30.55, clunk],
  [31.0, whir(2.0)], [57.8, clunk], [58.45, sfx(S => S.tone(700, 1400, 1.8, 'sine', .006))], [61.75, sfx(S => S.tone(900, 1800, .35, 'sine', .012))],
  [64.3, whir(1.5)], [65.6, clunk], [66.3, clunk], [66.8, sfx(S => S.noise(2.6, 600, .7, .05, .4))],
];
const fabCues = [[34.4, sfx(S => S.tone(1400, 1400, .05, 'square', .01))], [35.5, sfx(S => S.tone(1900, 2100, 4.6, 'sine', .006))], [45.65, sfx(S => S.tone(3000, 3100, 1.8, 'sine', .006))], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [48.7 + k * .1, tick])];
window.ORFAB = {
  len: LEN, at: 32.6,
  chapters: [{ t: 0, title: 'Fabrication' }, { t: WIN.mIN[0], title: 'Core' }, { t: WIN.m67[0], title: 'Casing' }, { t: WIN.m78[0], title: 'Fill' }, { t: WIN.mMT[0], title: 'Inspection' }, { t: WIN.mAI[0], title: 'Platform AI' }, { t: WIN.mTR[0], title: 'Round' }],
  get cues() { return cues.map(([a, fn]) => [unwarp(a), fn]).concat(fabCues.map(([a, fn]) => [afInv(a), fn])); }, build, cam, draw, readout, tags,
  dbg: () => ({ camBay: u => { const c = camBay(u); return { eye: c.eye.slice(), target: c.target.slice(), fov: c.fov }; }, stationAt, beatAt, clockAt, CLK, BW: BW_, SH, LNS, ACT, warp, unwarp, A: A_, D, RL, RR, GP, PIECE, BWX, BB, O, S_, R1S, R2S, R3S, R4S, R5S, R6S, R7S, R8S, EXS, C5S, INS, AFK, afAt, BASEW }),
};
Object.defineProperty(window.ORFAB, 'hideBase', { get: () => BASEW < .001, configurable: true });
})();
