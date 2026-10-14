/* SCAN · RAILGUN insert (window.RGE): the Burke's main machinery and the power and data runs forward, spliced in at
   base time 4.0 (pc_scan_railgun_film.js, "inserted sequences"). DDG-51 Flight IIA, ship frame (+Z fwd, +X stbd,
   y up from the waterline, origin midships):
   two main engine rooms under the uptakes (MER 1 under the forward stack, MER 2 under the aft one), each with two
   GE LM2500-30 gas turbine modules (19.6 MW) driving a double-input, locked-train main reduction gear (21.4 : 1:
   input pinions, first-reduction gears, second-reduction pinions, the bull gear) and a line shaft aft (MER 1 the
   port shaft, MER 2 the starboard one); three Allison 501-K34 gas-turbine generators (2.5 MW, 450 VAC, 60 Hz: GTG 1
   in MER 1, GTG 2 in MER 2, GTG 3 on the upper level of AMR 2 between them) with main switchboards 1S, 2S, 3S.
   The hull opens amidships; the generators start (starter, light-off in their six cans, rated speed), synchronise and
   go on line (breakers close, the meters count); the main engines start on bleed air from the generators (starter,
   light-off round the thirty fuel nozzles, the gas generators wind up into lime rim streaks; the power turbines held
   on their brakes); the clutches go in and the gear trains and the shafts turn; current runs up the risers and
   forward along the cable trays, data from the SPY-1D arrays and the CIC along the fibre trunk, past the bulkheads to
   the railgun power room under the mount; the lens rises out to the base take. The starts run at x20, the clutch and
   the shafts at x4 (shown). Render is a pure function of u; no allocation in the per-dot loops. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const LEN = 23.0;
const G = GEO;
let K = null, P_ = null, LIME = null, HOT = null, WH = null;
const F = o => Object.assign({ fine: true }, o || {});
const kk = (u, a, b) => E.inOut(E.sat((u - a) / (b - a)));
const ss = (a, b, v) => E.ss(a, b, v);

/* ================= layout ================= */
const YL = -4.8, YU = -0.6, Y2 = 3.6, YA = -2.7;          // lower level floor plates, upper level, 2nd deck, machinery axis
const hD = z => HD.destroyer.A.deckY(z);
const ytr = z => Math.min(6.3, hD(z) - .75);              // cable trays under the main deck
const BH = [-25.5, -12.5, -6.0, 8.0, 13.5, 23.5, 31.0, 36.2, 40.4];
/* half breadth below the waterline (wall to the bilge, 2.6 m bilge radius, 0.5 m rise of floor); above it the parts'
   section (hd_sea_air's DDG-51 form) */
function hwl(z) { const u = z / 77.6, ue = 70.6 / 77.6; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; }
function hb(z, y) {
  if (y >= 0) return P_.hullAt(z, y);
  const w = hwl(z), rb = 2.6, yb = -3.2, xb = w - rb;
  if (y >= yb) return w;
  if (y >= -5.8) return xb + Math.sqrt(Math.max(0, rb * rb - (y - yb) * (y - yb)));
  return Math.max(0, xb * (y + 6.3) / .5);
}
/* the engine rooms; per room the shaft side s, the bull gear's x, the gear's centre z, the GT enclosures' aft end */
const MER = [
  { k: 1, z0: -6.0, z1: 8.0, s: -1, bx: -2.0, zc: -4.1, ze: -1.6, stk: 2.2 },
  { k: 2, z0: -25.5, z1: -12.5, s: 1, bx: 2.0, zc: -23.4, ze: -20.9, stk: -17.0 },
];
const DXI = 1.685, DYG = 1.24;                           // input pinions at B ± (DXI, 0), gear shafts at B ± (DXI, ±DYG)
const GTM = [];
MER.forEach((m, mi) => [-1, 1].forEach((sx, j) => GTM.push({ id: `${m.k}${j ? 'B' : 'A'}`, mi, sx, o: [m.bx + sx * DXI, YA, m.ze], xo: .95 * sx, zo: m.stk - 2.9 })));
/* generators: local frame origin on the generator axis at its outer end, +z toward the turbine's exhaust */
const GTGS = [
  { id: 1, o: [4.6, YL + 1.1, -4.6], ry: 0, tb: 1, xo: 1.05, zo: 2.2 + .95 },
  { id: 2, o: [-5.0, YL + 1.1, -23.3], ry: 0, tb: -1, xo: -1.05, zo: -17 + .95 },
  { id: 3, o: [-4.4, YU + 1.1, -9.25], ry: PI / 2, tb: 1, xo: 1.05, zo: -17 + .95 },
];
/* switchboards: local x along the line-up, y up, z out of the front */
const SWB = [
  { id: '1S', o: [6.4, YU, -4.0], ry: -PI / 2, n: 6, tray: 1 },
  { id: '2S', o: [-6.4, YU, -16.5], ry: PI / 2, n: 6, tray: -1 },
  { id: '3S', o: [1.2, YU, -11.6], ry: 0, n: 5, tray: 1 },
];
/* line shafts from the gears' thrust bearings aft */
const SHAFT = [
  { mi: 0, a: [-2.0, YA, -5.65], d: V.norm([-.03, -.023, -1]), L: 40.6, brg: [4.4, 11.0, 16.4, 23.5, 29.5, 35.5], cpl: [8.2, 20.8, 32.6] },
  { mi: 1, a: [2.0, YA, -24.95], d: V.norm([.03, -.023, -1]), L: 21.1, brg: [4.0, 10.0, 16.0], cpl: [7.6, 18.6] },
];

/* ================= schedules (u: film s into the insert) ================= */
const GT_T = [[3.2, 3.6, 4.6, 5.0], [3.9, 4.25, 5.25, 5.65], [4.4, 4.75, 5.75, 6.15]];        // GTG start, light-off, rated, breaker
const GM_T = { '1B': [6.7, 7.6, 9.2], '1A': [7.5, 8.2, 9.7], '2A': [8.1, 8.7, 10.2], '2B': [8.7, 9.2, 10.6] };   // start, light-off, idle
const CLU = [10.75, 11.45];                               // clutches in (MER 1, MER 2)
const RAT = { nb: 219, np: 43, ng: 147, ni: 35 };
const RATIO = RAT.nb / RAT.np * RAT.ng / RAT.ni;         // 21.39
const SH_RPM = 55;                                       // shafts at zero pitch on station
const GENW = [], GGW = {}, SHW = [];

/* ================= sampling ================= */
const LVF = [.006, .012, .024, .048, .096, .192];       // rotors, gears, small parts in close-up
const LVF8 = [.008, .016, .032, .064, .128, .256];      // engines, switchboards
const LVM = [.012, .024, .048, .096, .192, .384];       // generator sets
const LV16 = [.016, .032, .064, .128, .256, .512];      // plant pipework, ducts, shafts
const LVB = [.024, .048, .096, .192, .384];             // structure
const fnp = (f, o) => Object.assign({ t: 'fn', f }, o || {});
function samp(prims, s0, coarse) {
  const o = P_.sampleLat(prims, s0, coarse);
  for (const pr of prims) if (pr.t === 'fn' && !(coarse && pr.fine)) { const ds = pr.ds || 1; pr.f(o, s0 * ds, s0 * .6 * Math.min(2, ds), coarse); }
  return o;
}
let NPT = 0;
function lod(prims, cs, L) {
  L = L || LVM;
  const ml = K.lodCloud(L.map((sp, li) => ({ sp, pts: new Float32Array(samp(prims, sp, li >= 3)) })), cs || .7);
  NPT += ml.lv[0].length / 6;
  return ml;
}
const seg = (o, a, b, es) => P_.lineL(o, a, b, es);
function arcZ(o, cx, cy, z, r, a0, a1, es) {
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) * r / es));
  for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * (k + .5) / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, 0, 0, 0); }
}
/* a lathe about the z axis through (cx, cy) over the sector [a0, a1]: faces (lit), edge arcs at the stations, the
   cut edges as lines */
function slathe(o, cx, cy, st, a0, a1, s, es, opt) {
  const full = a1 - a0 >= TAU - 1e-6, nf = opt && opt.noFace, ne = opt && opt.noEdge;
  for (let i = 0; i < st.length - 1 && !nf; i++) {
    const [z0, r0] = st[i], [z1, r1] = st[i + 1], dz = z1 - z0, dr = r1 - r0, L = Math.hypot(dz, dr); if (L < 1e-6) continue;
    const na = Math.max(1, Math.round(L / s)), kz = -dr / L, kr = dz / L;
    for (let a = 0; a < na; a++) {
      const u = (a + .5) / na, zz = z0 + dz * u, rr = r0 + dr * u, nt = Math.max(3, Math.round(Math.abs(a1 - a0) * rr / s));
      for (let t = 0; t < nt; t++) {
        const th = a0 + (a1 - a0) * (t + .5 + (full && (a & 1) ? .5 : 0)) / nt, c = Math.cos(th), sn = Math.sin(th);
        o.push(cx + c * rr, cy + sn * rr, zz, c * kr, sn * kr, kz);
      }
    }
  }
  if (!ne) for (const [z, r] of st) if (r > .005) arcZ(o, cx, cy, z, r, a0, a1, es);
  if (!full && !(opt && opt.noCut)) for (const a of [a0, a1]) {
    const c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < st.length - 1; i++) seg(o, [cx + c * st[i][1], cy + sn * st[i][1], st[i][0]], [cx + c * st[i + 1][1], cy + sn * st[i + 1][1], st[i + 1][0]], es);
  }
}
/* a disc (annulus) at z about (cx, cy), normal along nz */
function disc(o, cx, cy, z, r0, r1, nz, s) {
  const nr = Math.max(1, Math.round((r1 - r0) / s));
  for (let k = 0; k < nr; k++) { const rr = r0 + (k + .5) / nr * (r1 - r0), nt = Math.max(6, Math.round(TAU * rr / s));
    for (let t = 0; t < nt; t++) { const th = (t + .5 + (k & 1) * .5) / nt * TAU; o.push(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, z, 0, 0, nz); } }
}
/* transform the points pushed since i0 (positions and normals) */
function xfp(o, i0, Rm, t) {
  for (let i = i0; i < o.length; i += 6) {
    const x = o[i], y = o[i + 1], z = o[i + 2], a = o[i + 3], b = o[i + 4], c = o[i + 5];
    o[i] = Rm[0] * x + Rm[1] * y + Rm[2] * z + t[0]; o[i + 1] = Rm[3] * x + Rm[4] * y + Rm[5] * z + t[1]; o[i + 2] = Rm[6] * x + Rm[7] * y + Rm[8] * z + t[2];
    o[i + 3] = Rm[0] * a + Rm[1] * b + Rm[2] * c; o[i + 4] = Rm[3] * a + Rm[4] * b + Rm[5] * c; o[i + 5] = Rm[6] * a + Rm[7] * b + Rm[8] * c;
  }
}
/* a rotation taking +z to d (columns U, W, d) */
function alignZ(d) { const [U, W] = P_.perp(d); return [U[0], W[0], d[0], U[1], W[1], d[1], U[2], W[2], d[2]]; }
/* a row of blades about z: n blades from r0 to r1 at axial z, chord ch, stagger g0 (root) -> g1 (tip) from the
   axis, sector [a0, a1] (static rows in a cut-away), phase ph */
function bladeRow(o, z, n, r0, r1, ch, g0, g1, s, es, ph, a0, a1) {
  const stator = a1 !== undefined, nd = stator ? -1 : 1;      // stators: outlines in the kept sector, seen from inside; rotors: sparse faces, leading edge and tip
  for (let k = 0; k < n; k++) {
    const th0 = ph + k / n * TAU;
    if (a1 !== undefined) { const t = ((th0 - a0) % TAU + TAU) % TAU; if (t > a1 - a0) continue; }
    const at = (t, v) => {
      const r = r0 + (r1 - r0) * t, g = g0 + (g1 - g0) * t, c = ch * (1 - .25 * t) * .5, hz = c * Math.cos(g), ht = c * Math.sin(g) / r;
      const th = th0 + v * ht + .35 * ht * (1 - v * v), cs = Math.cos(th), sn = Math.sin(th);
      return [cs * r, sn * r, z + v * hz, nd * cs, nd * sn, 0];      // radial normals: the far side of the row culls
    };
    if (!stator) { const sf = s * 3.4, nsf = Math.max(1, Math.round((r1 - r0) / sf)), nc = Math.max(1, Math.round(ch / sf));
      for (let i = 0; i < nsf; i++) for (let j = 0; j < nc; j++) { const p = at((i + .5) / nsf, -1 + 2 * (j + .5) / nc); o.push(p[0], p[1], p[2], p[3], p[4], p[5]); } }
    const ne = Math.max(2, Math.round((r1 - r0) / es));
    for (let i = 0; i <= ne; i++) { const p = at(i / ne, 1); o.push(p[0], p[1], p[2], p[3], p[4], p[5]); }
    const nt = Math.max(2, Math.round(ch / es));
    for (let j = 0; j <= nt; j++) { const p = at(1, -1 + 2 * j / nt); o.push(p[0], p[1], p[2], p[3], p[4], p[5]); }
  }
}
/* a spur / double-helical gear about z at the origin: N teeth on pitch radius Rp, face F centred on z = 0 (a groove
   gap in the middle when double helical), the tooth outline at the faces, tip lands and flank lines along the
   helices, the rim, the web with lightening holes, the hub */
const PROF = [[-.5, 'r'], [-.3, 'r'], [-.22, 'p'], [-.15, 'a'], [.15, 'a'], [.22, 'p'], [.3, 'r'], [.5, 'r']];
function gear(o, N, Rp, Fw, s, es, opt, coarse) {
  const m = 2 * Rp / N, ra = Rp + m, rr = Rp - 1.25 * m, Pp = TAU / N, psi = opt.psi || 0, gap = opt.gap || 0, ph = opt.ph || 0;
  if (coarse) { slathe(o, 0, 0, [[-Fw / 2, Rp], [Fw / 2, Rp]], 0, TAU, s, es); if (Rp > .4) disc(o, 0, 0, 0, opt.hub || Rp * .3, Rp, 1, s * 2); return; }
  const rad = c => c === 'a' ? ra : c === 'p' ? Rp : rr;
  const hel = z => psi ? Math.tan(psi) * (opt.dbl ? Math.abs(z) : z) / Rp : 0;
  const faces = opt.dbl && gap ? [-Fw / 2, -gap / 2, gap / 2, Fw / 2] : [-Fw / 2, Fw / 2];
  const P0 = [0, 0, 0], P1 = [0, 0, 0];
  for (const z of faces) {
    const h = hel(z), nz = (Math.abs(z) > Fw / 2 - 1e-6 ? 1 : -1) * Math.sign(z) * .7;
    for (let k = 0; k < N; k++) {
      const b = ph + k * Pp + h;
      for (let i = 0; i < PROF.length - 1; i++) {
        const a0 = b + PROF[i][0] * Pp, r0 = rad(PROF[i][1]), a1 = b + PROF[i + 1][0] * Pp, r1 = rad(PROF[i + 1][1]);
        const n = Math.max(1, Math.round(Math.hypot(Math.cos(a1) * r1 - Math.cos(a0) * r0, Math.sin(a1) * r1 - Math.sin(a0) * r0) / es));
        for (let j = 0; j < n; j++) { const u = (j + .5) / n, a = a0 + (a1 - a0) * u, r = r0 + (r1 - r0) * u, c = Math.cos(a), sn = Math.sin(a); o.push(c * r, sn * r, z, c * .7, sn * .7, nz); }
      }
    }
  }
  // along the face: the tips' corners and the roots follow the helix
  const spans = opt.dbl && gap ? [[-Fw / 2, -gap / 2], [gap / 2, Fw / 2]] : [[-Fw / 2, Fw / 2]];
  for (const [za, zb] of spans) {
    const nz = Math.max(2, Math.round((zb - za) / es * 1.1));
    for (let k = 0; k < N; k++) {
      const b = ph + k * Pp;
      for (const [f, c] of [[-.15, 'a'], [.15, 'a'], [-.22, 'p'], [.22, 'p']]) {
        if (c === 'p' && !opt.flank) continue;
        const r_ = rad(c);
        for (let j = 0; j <= nz; j++) { const z = za + (zb - za) * j / nz, a = b + f * Pp + hel(z); o.push(Math.cos(a) * r_, Math.sin(a) * r_, z, Math.cos(a), Math.sin(a), 0); }
      }
    }
  }
  // rim, web, hub
  const rim = rr - Math.max(.03, .08 * Rp), hub = opt.hub || Rp * .3;
  slathe(o, 0, 0, [[-Fw / 2, rim], [Fw / 2, rim]], 0, TAU, s * 2.5, es, { noFace: Rp < .4 });
  if (Rp > .4) {
    const wt = Math.min(.12, Fw * .3);
    for (const z of [-wt / 2, wt / 2]) { disc(o, 0, 0, z, hub, rim, z < 0 ? -1 : 1, s * 3); arcZ(o, 0, 0, z, rim, 0, TAU, es); arcZ(o, 0, 0, z, hub, 0, TAU, es); }
    const nh = opt.holes || 0, rh = (hub + rim) / 2, hr = (rim - hub) * .28;
    for (let k = 0; k < nh; k++) { const a = (k + .5) / nh * TAU; for (const z of [-wt / 2, wt / 2]) arcZ(o, Math.cos(a) * rh, Math.sin(a) * rh, z, hr, 0, TAU, es); }
    slathe(o, 0, 0, [[-Fw / 2 - .05, hub], [Fw / 2 + .05, hub]], 0, TAU, s * 1.5, es);
  }
}

/* ================= GE LM2500-30 module (local: the engine axis, origin at the enclosure's aft end, +z fwd) =================
   exhaust collector 0.1-1.5, power turbine 1.5-2.9 (6 stages), mid frame, HP turbine 3.15-3.5 (2 stages), annular
   combustor 3.5-4.35 (30 fuel nozzles), compressor 4.35-6.35 (16 stages, inlet guide vanes and six variable stator
   rows), front frame, bellmouth; the accessory gearbox under the compressor with the air start motor. The casings
   are cut away over the upper outboard quarter (the blades show). */
const CUT0 = 100 * DEG, CUT1 = 350 * DEG;
const ENC = { x: 1.325, y0: -1.6, y1: 1.45, z1: 8.1 };
const COMP = []; for (let i = 0; i < 16; i++) { const f = i / 15; COMP.push({ z: 6.2 - i * .114, h: .27 + .09 * f, t: .53 - .1 * f, n: Math.round(36 + 40 * f), c: .085 - .045 * f }); }
const HPT = [{ z: 3.4, h: .4, t: .52, n: 80, c: .055 }, { z: 3.24, h: .4, t: .535, n: 84, c: .055 }];
const PTR = []; for (let j = 0; j < 6; j++) { const f = j / 5; PTR.push({ z: 2.75 - j * .21, h: .42, t: .58 + .17 * f, n: 88 + 8 * j, c: .07 }); }
const VSV_N = 7;                                         // IGV + stages 1-6 vary
function gtmStatic() {
  const P = [];
  const { x: ex, y0, y1, z1 } = ENC;
  // enclosure: frame, sparse walls with stiffeners and doors, the roof's two openings
  P.push(G.box([-ex, y0, 0], [ex, y1, z1], { edgeOnly: true }));
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    for (const z of [2.0, 4.05, 6.1]) P.push(G.line([[x, y0, z], [x, y1, z]], F()));
    for (const [za, zb] of [[1.9, 2.8], [5.3, 6.2]]) {
      P.push(G.line([[x, y0 + .12, za], [x, y0 + 2.1, za], [x, y0 + 2.1, zb], [x, y0 + .12, zb]]));
      P.push(G.line([[x, y0 + 1.45, za + .25], [x, y0 + 1.85, za + .25], [x, y0 + 1.85, zb - .25], [x, y0 + 1.45, zb - .25], [x, y0 + 1.45, za + .25]], F()));
      P.push(G.line([[x - sx * .02, y0 + 1.0, zb - .12], [x - sx * .02, y0 + 1.2, zb - .12]], F()));
    }
  }
  P.push(G.line([[-ex, y1, 1.5], [ex, y1, 1.5]]), G.line([[-ex, y1, 5.9], [ex, y1, 5.9]]));
  for (let z = 2.4; z < 5.8; z += 1.2) P.push(G.line([[-ex, y1, z], [ex, y1, z]], F()));
  // base skid and engine mounts
  for (const sx of [-1, 1]) P.push(G.box([sx * .85 - .09, y0, .15], [sx * .85 + .09, y0 + .24, z1 - .15], { edgeOnly: true }));
  for (let z = .6; z < z1; z += 1.5) P.push(G.box([-.76, y0, z - .06], [.76, y0 + .16, z + .06], F({ edgeOnly: true })));
  for (const sx of [-1, 1]) { P.push(G.cyl([sx * .7, -.25, 2.9], [sx * .85, y0 + .24, 2.9], .035, {}), G.cyl([sx * .52, -.3, 6.42], [sx * .78, y0 + .24, 6.42], .04, {})); }
  // exhaust collector (box round the diffuser) and the diffuser cone, centre body
  P.push(G.box([-1.05, -1.15, .1], [1.05, 1.15, 1.5], { edgeOnly: true }));
  for (const sx of [-1, 1]) P.push(fnp((o, s) => P_.quadL(o, [sx * 1.05, -1.15, .1], [sx * 1.05, -1.15, 1.5], [sx * 1.05, 1.15, 1.5], [sx * 1.05, 1.15, .1], [sx, 0, 0], s), { ds: 4 }));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[.45, 1.0], [1.5, .8]], CUT0, CUT1, s * 3.5, es)));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[.6, .1], [1.0, .32], [1.6, .36]], 0, TAU, s * 1.5, es)));
  // casings (cut away)
  const CAS = [[[1.5, .8], [2.9, .72]], [[2.9, .72], [2.95, .66], [3.15, .62]], [[3.15, .58], [3.5, .58]], [[3.5, .58], [3.62, .66], [4.22, .66], [4.35, .55]], [[4.35, .45], [6.35, .58]], [[6.35, .58], [6.65, .6]]];
  for (const st of CAS) P.push(fnp((o, s, es) => slathe(o, 0, 0, st, CUT0, CUT1, s * 3.5, es)));
  for (const z of [1.5, 2.2, 2.9, 3.5, 4.35, 5.33, 6.35, 6.65]) { const r = z < 2.95 ? .8 - (z - 1.5) * .055 + .03 : z < 3.6 ? .64 : z < 4.4 ? .7 : .48 + (z - 4.35) * .055 + .03;
    P.push(fnp((o, s, es) => arcZ(o, 0, 0, z, r, CUT0, CUT1, es))); }
  // flow-path hubs (static): the turbine inner casing, the compressor discharge
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[3.5, .42], [4.35, .42]], 0, TAU, s * 2.5, es), F()));
  // stator vanes (in the kept sector): compressor (IGV + 16), HPT nozzles, PT nozzles
  P.push(fnp((o, s, es) => {
    bladeRow(o, 6.3, 34, .26, .545, .07, -.1, -.25, s, es, .02, CUT0, CUT1);           // IGV
    for (let i = 0; i < 16; i++) { const c = COMP[i]; bladeRow(o, c.z - .057, Math.round(c.n * 1.25), c.h + .01, c.t + .025, c.c * .8, -.6, -.75, s, es, .05 * i, CUT0, CUT1); }
    for (const h of HPT) bladeRow(o, h.z + .07, 46, h.h, h.t + .03, .06, .9, .8, s, es, .1, CUT0, CUT1);
    for (const p of PTR) bladeRow(o, p.z + .1, Math.round(p.n * .8), p.h, p.t + .03, .07, .85, .75, s, es, .2, CUT0, CUT1);
  }, F({ ds: 2.2 })));
  // front frame struts, bellmouth, centre body
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + .26; if (((a - CUT0) % TAU + TAU) % TAU > CUT1 - CUT0) continue; P.push(G.line([[Math.cos(a) * .22, Math.sin(a) * .22, 6.5], [Math.cos(a) * .58, Math.sin(a) * .58, 6.5]]), G.line([[Math.cos(a + .05) * .22, Math.sin(a + .05) * .22, 6.5], [Math.cos(a + .05) * .58, Math.sin(a + .05) * .58, 6.5]], F())); }
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[6.65, .6], [6.85, .66], [7.05, .8], [7.22, .98]], 0, TAU, s * 3, es)));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[6.35, .22], [6.9, .2], [7.15, .12], [7.3, .02]], 0, TAU, s * 1.2, es)));
  // variable stator vanes: two actuators (the rings and levers are their own cloud: they turn as the vanes open)
  P.push(...vsvRams());
  return gtmStatic2(P);
}
function vsvRams() {
  const P = [];
  for (const a of [160 * DEG, 205 * DEG]) {
    const c = Math.cos(a), sn = Math.sin(a), r = .74;
    P.push(G.cyl([c * r, sn * r, 4.85], [c * r, sn * r, 5.55], .045, {}), G.cyl([c * r, sn * r, 5.55], [c * r, sn * r, 6.0], .016, F()));
    P.push(G.line([[c * r, sn * r, 6.0], [c * .62, sn * .62, 6.2], [c * .62, sn * .62, 5.6]], F()));
  }
  return P;
}
/* the variable stator vanes' actuation rings and a lever per vane (turned a few degrees as the gas generator comes up) */
function vsvRings() {
  const P = [];
  P.push(fnp((o, s, es) => {
    const zz = [6.3]; for (let i = 0; i < VSV_N - 1; i++) zz.push(COMP[i].z - .057);
    zz.forEach((z, i) => {
      const rc = .48 + (z - 4.35) * .055 + .005, n = i ? Math.round(COMP[i - 1].n * 1.25) : 34;
      arcZ(o, 0, 0, z + .035, rc + .06, CUT0, CUT1, es); arcZ(o, 0, 0, z + .045, rc + .06, CUT0, CUT1, es);
      for (let k = 0; k < n; k++) { const a = .02 + .05 * i + k / n * TAU; if (((a - CUT0) % TAU + TAU) % TAU > CUT1 - CUT0) continue;
        const c = Math.cos(a), sn = Math.sin(a);
        seg(o, [c * rc, sn * rc, z], [c * (rc + .025), sn * (rc + .025), z], es);
        seg(o, [c * (rc + .025), sn * (rc + .025), z], [c * (rc + .06), sn * (rc + .06), z + .04], es); }
    });
  }, F()));
  return P;
}
function gtmStatic2(P) {
  // combustor: the fuel manifold and thirty nozzles, two igniters
  P.push(fnp((o, s, es) => {
    arcZ(o, 0, 0, 4.26, .76, CUT0, CUT1, es); arcZ(o, 0, 0, 4.3, .74, CUT0, CUT1, es);
    for (let k = 0; k < 30; k++) { const a = k / 30 * TAU; if (((a - CUT0) % TAU + TAU) % TAU > CUT1 - CUT0) continue;
      const c = Math.cos(a), sn = Math.sin(a);
      seg(o, [c * .76, sn * .76, 4.26], [c * .7, sn * .7, 4.22], es); seg(o, [c * .7, sn * .7, 4.22], [c * .66, sn * .66, 4.15], es);
      arcZ(o, c * .69, sn * .69, 4.2, .022, 0, TAU, es); }
  }, F()));
  for (const a of [190 * DEG, 235 * DEG]) P.push(G.cyl([Math.cos(a) * .66, Math.sin(a) * .66, 3.95], [Math.cos(a) * .8, Math.sin(a) * .8, 3.95], .025, F()));
  // accessory gearbox, radial drive, the air start motor and its supply elbow, fuel and lube pumps
  P.push(G.box([-.38, -.98, 4.6], [.38, -.68, 5.95], { ds: 3 }));
  P.push(G.cyl([0, -.46, 5.25], [0, -.68, 5.25], .05, F()));
  P.push(G.lathe([-.17, -.83, 5.95], [0, 0, 1], [[0, .14], [.18, .14], [.24, .11], [.36, .11]], { caps: true }));
  P.push(G.cyl([-.17, -.83, 6.2], [-.17, -1.25, 6.2], .065, {}), G.cyl([-.17, -1.25, 6.2], [-.5, -1.25, 6.2], .065, F()));
  for (const [x, y, z, r] of [[.38, -.84, 5.0, .1], [.38, -.84, 5.5, .08], [-.38, -.84, 5.2, .09]]) P.push(G.lathe([x, y, z], [Math.sign(x), 0, 0], [[0, r], [.16, r]], { caps: true }));
  P.push(G.line([[.46, -.84, 5.0], [.6, -.6, 5.0], [.72, -.1, 4.6], [.76, 0, 4.27]], F()), G.line([[-.46, -.84, 5.2], [-.62, -.5, 4.8], [-.7, -.2, 3.6], [-.66, -.2, 2.0]], F()));
  // the coupling shaft guard: a cage of rings and rods round the high-speed shaft, through the collector's aft wall
  P.push(fnp((o, s, es) => { for (const z of [-1.2, -.6, 0]) arcZ(o, 0, 0, z, .34, 0, TAU, es); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + .3; seg(o, [Math.cos(a) * .34, Math.sin(a) * .34, -1.2], [Math.cos(a) * .34, Math.sin(a) * .34, .1], es); } }));
  return P;
}
/* the gas generator rotor (compressor 16 stages, HP turbine 2) and the power turbine rotor with the high-speed coupling
   shaft to the gear's clutch (local, spinning about z) */
function ggRotor() {
  const P = [];
  P.push(fnp((o, s, es) => {
    COMP.forEach((c, i) => bladeRow(o, c.z, c.n, c.h, c.t, c.c, .6, .95, s, es, i * .13));
    HPT.forEach((h, i) => bladeRow(o, h.z, h.n, h.h, h.t, h.c, -.75, -.6, s, es, i * .2));
  }, F()));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[4.43, .36], [6.27, .27]], 0, TAU, s * 2.2, es)));
  P.push(fnp((o, s, es) => { for (const c of COMP) arcZ(o, 0, 0, c.z, c.h - .004, 0, TAU, es); slathe(o, 0, 0, [[3.18, .4], [3.46, .4]], 0, TAU, s * 2, es); slathe(o, 0, 0, [[6.27, .27], [6.4, .2], [6.45, .1]], 0, TAU, s, es); }));
  return P;
}
function ptRotor() {
  const P = [];
  P.push(fnp((o, s, es) => PTR.forEach((p, j) => bladeRow(o, p.z, p.n, p.h, p.t, p.c, -.8, -.62, s, es, j * .17)), F()));
  P.push(fnp((o, s, es) => {
    slathe(o, 0, 0, [[1.58, .42], [2.83, .42]], 0, TAU, s * 2.2, es);
    for (const p of PTR) arcZ(o, 0, 0, p.z, p.h - .004, 0, TAU, es);
    slathe(o, 0, 0, [[1.58, .42], [1.4, .2], [.95, .12]], 0, TAU, s * 1.5, es);
    // the coupling shaft (with a painted line along it) and its two disc-pack couplings
    slathe(o, 0, 0, [[-1.22, .095], [.95, .095]], 0, TAU, s * 2, es);
    seg(o, [.097, 0, -1.2], [.097, 0, .93], es * .7); seg(o, [-.097, 0, -1.2], [-.097, 0, .93], es * .7);
    for (const z of [.8, -1.08]) { slathe(o, 0, 0, [[z - .05, .22], [z + .05, .22]], 0, TAU, s, es, {}); disc(o, 0, 0, z + .05, .1, .22, 1, s); disc(o, 0, 0, z - .05, .1, .22, -1, s);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; arcZ(o, Math.cos(a) * .17, Math.sin(a) * .17, z + .055, .016, 0, TAU, es); arcZ(o, Math.cos(a) * .17, Math.sin(a) * .17, z - .055, .016, 0, TAU, es); } }
  }));
  return P;
}

/* ================= Allison 501-K34 generator set (local: generator axis at the origin, +z to the exhaust; the turbine
   axis 0.3 m higher, output through the offset reduction gearbox ahead of the compressor inlet) ================= */
const TY = .3;
const GC = []; for (let i = 0; i < 14; i++) { const f = i / 13; GC.push({ z: 4.04 + i * .088, h: .15 + .07 * f, t: .33 - .06 * f, n: Math.round(24 + 26 * f), c: .06 - .025 * f }); }
const GTB = [0, 1, 2, 3].map(i => ({ z: 6.42 + i * .1, h: .24, t: .35 + .01 * i, n: 64 + 4 * i, c: .045 }));
function gtgStatic() {
  const P = [];
  // base frame and acoustic enclosure (frame, sparse walls)
  for (const sx of [-1, 1]) P.push(G.box([sx * .82 - .08, -1.1, 0], [sx * .82 + .08, -.92, 7.9], { edgeOnly: true }));
  for (let z = .4; z < 7.9; z += 1.25) P.push(G.box([-.74, -1.1, z - .05], [.74, -.96, z + .05], F({ edgeOnly: true })));
  P.push(G.box([-1.15, -1.1, -.1], [1.15, 1.5, 8.0], { edgeOnly: true }));
  for (const sx of [-1, 1]) for (const z of [2.6, 5.3]) P.push(G.line([[sx * 1.15, -1.1, z], [sx * 1.15, 1.5, z]], F()));
  // generator: stator frame (cut away), end bells, feet, the air cooler on top, the terminal box with its glands
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[.2, .74], [2.3, .74]], CUT0, CUT1, s * 1.4, es)));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[0, .3], [.2, .74]], 0, TAU, s * 1.4, es); slathe(o, 0, 0, [[2.3, .74], [2.45, .4]], CUT0, CUT1, s * 1.4, es);
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; if (((a - CUT0) % TAU + TAU) % TAU > CUT1 - CUT0) continue; seg(o, [Math.cos(a) * .745, Math.sin(a) * .745, .25], [Math.cos(a) * .745, Math.sin(a) * .745, 2.25], es); } }));
  for (const sx of [-1, 1]) P.push(G.box([sx * .7 - .08, -.92, .45], [sx * .7 + .08, -.5, 2.05]));
  P.push(G.box([-.48, .74, .45], [.48, 1.18, 2.05]));
  for (let z = .55; z < 2; z += .1) P.push(G.line([[-.47, 1.19, z], [.47, 1.19, z]], F()));
  // reduction gearbox, inlet plenum and bellmouth
  P.push(G.box([-.52, -.75, 2.45], [.52, .9, 3.25]));
  P.push(G.line([[-.4, -.55, 2.44], [.4, -.55, 2.44], [.4, .7, 2.44], [-.4, .7, 2.44], [-.4, -.55, 2.44]], F()));
  P.push(G.box([-.8, -.55, 3.25], [.8, 1.12, 3.95], { edgeOnly: true }));
  for (const sx of [-1, 1]) P.push(fnp((o, s) => P_.quadL(o, [sx * .8, -.55, 3.25], [sx * .8, -.55, 3.95], [sx * .8, 1.12, 3.95], [sx * .8, 1.12, 3.25], [sx, 0, 0], s), { ds: 3 }));
  P.push(fnp((o, s, es) => slathe(o, 0, TY, [[3.4, .5], [3.7, .4], [3.98, .345]], 0, TAU, s * 1.3, es)));
  // compressor casing (cut), combustion: six cans with crossfire tubes, the outer case; turbine; exhaust collector
  P.push(fnp((o, s, es) => slathe(o, 0, TY, [[3.98, .35], [5.3, .28]], CUT0, CUT1, s * 1.5, es)));
  P.push(fnp((o, s, es) => {
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + PI / 6, cx = Math.cos(a) * .42, cy = TY + Math.sin(a) * .42;
      slathe(o, cx, cy, [[5.35, .04], [5.42, .1], [6.2, .1], [6.28, .06]], 0, TAU, s, es);
      seg(o, [cx, cy, 5.22], [cx, cy, 5.36], es);
      const b = a + PI / 6; seg(o, [Math.cos(a + .2) * .43, TY + Math.sin(a + .2) * .43, 5.62], [Math.cos(b + .32) * .43, TY + Math.sin(b + .32) * .43, 5.62], es); }
    slathe(o, 0, TY, [[5.3, .28], [5.42, .56], [6.22, .56], [6.35, .37]], CUT0, CUT1, s * 2.2, es);
    slathe(o, 0, TY, [[6.35, .37], [6.85, .39]], CUT0, CUT1, s * 1.5, es);
  }, F()));
  P.push(fnp((o, s, es) => { bladeRow(o, 3.99, 26, .14, .35, .05, -.15, -.3, s, es, 0, CUT0, CUT1); for (const c of GC) bladeRow(o, c.z + .044, Math.round(c.n * 1.3), c.h + .01, c.t + .015, c.c * .8, -.6, -.7, s, es, .2, CUT0, CUT1); for (const t of GTB) bladeRow(o, t.z - .05, 52, t.h, t.t + .02, .045, .85, .75, s, es, .1, CUT0, CUT1); }, F()));
  P.push(G.box([-.72, -.45, 6.85], [.72, 1.1, 7.75], { edgeOnly: true }));
  for (const sx of [-1, 1]) P.push(fnp((o, s) => P_.quadL(o, [sx * .72, -.45, 6.85], [sx * .72, -.45, 7.75], [sx * .72, 1.1, 7.75], [sx * .72, 1.1, 6.85], [sx, 0, 0], s), { ds: 3 }));
  return P;
}
function gtgRotor() {
  const P = [];
  P.push(fnp((o, s, es) => { for (const [i, c] of GC.entries()) bladeRow(o, c.z, c.n, c.h, c.t, c.c, .65, .95, s, es, i * .21); for (const t of GTB) bladeRow(o, t.z, t.n, t.h, t.t, t.c, -.75, -.6, s, es, .3); }, F()));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[4.0, .15], [5.24, .22]], 0, TAU, s * 2, es); slathe(o, 0, 0, [[6.38, .24], [6.76, .24]], 0, TAU, s * 2, es); slathe(o, 0, 0, [[3.3, .06], [6.8, .06]], 0, TAU, s * 2, es); seg(o, [.062, 0, 3.3], [.062, 0, 4.0], es * .7); }));
  return P;
}
/* the terminal box on one side, its cable glands */
const gtgTerm = tb => [G.box([tb * .74, -.05, 1.0], [tb * .98, .55, 1.65]), ...[1.12, 1.32, 1.52].map(z => G.cyl([tb * .98, .4, z], [tb * 1.06, .4, z], .035, F()))];
/* the generator rotor: four salient poles (1 800 rpm, 60 Hz), the shaft, the fan */
function genRotor() {
  const P = [];
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2;
    P.push(P_.boxZ([Math.cos(a) * .36, Math.sin(a) * .36, 1.25], [.13, .15, .82], a, { ds: 2 }));
    P.push(P_.boxZ([Math.cos(a) * .53, Math.sin(a) * .53, 1.25], [.04, .26, .84], a, { ds: 2 }));
    P.push(fnp((o, s, es) => { for (let j = 0; j < 7; j++) { const r = .26 + j * .03, c = Math.cos(a), sn = Math.sin(a), w = .17, L = .86;
      const p = (u, v) => [c * r - sn * u, sn * r + c * u, 1.25 + v]; seg(o, p(-w, -L), p(w, -L), es); seg(o, p(-w, L), p(w, L), es); seg(o, p(-w, -L), p(-w, L), es); seg(o, p(w, -L), p(w, L), es); } }, F()));
  }
  P.push(G.cyl([0, 0, -.12], [0, 0, 2.6], .1, {}));
  P.push(G.blades([0, 0, .32], [0, 0, 1], 9, .14, .58, { chord: .4, pitch: .3 }));
  P.push(fnp((o, s, es) => { seg(o, [.102, 0, -.1], [.102, 0, 2.55], es * .7); }));
  return P;
}

/* ================= main reduction gear (ship frame; gears drawn as their own spinning clouds) ================= */
const GR = { rb: 1.75, fb: .8, gb: .1, rp: 1.75 * RAT.np / RAT.nb, rg: 1.0, fg: .5, ri: 1.0 * RAT.ni / RAT.ng, psi: 30 * DEG };
function mrgCase(m) {
  const P = [], bx = m.bx, zc = m.zc, xw = 2.86, y0 = -5.05, y1 = YA + 2.42, z0 = zc - 1.1, z1 = zc + 1.1;
  // the lower casing (sump) as faces, the upper cover lifted away: its split flange and a few ribs
  P.push(G.box([bx - xw, y0, z0], [bx + xw, YA, z1], { ds: 3.5, skip: [1, 4] }));
  P.push(G.line([[bx - xw, YA, z0], [bx - xw, y1 - .4, z0], [bx - xw + .5, y1, z0], [bx + xw - .5, y1, z0], [bx + xw, y1 - .4, z0], [bx + xw, YA, z0]]));
  P.push(G.line([[bx - xw, YA, z1], [bx - xw, y1 - .4, z1], [bx - xw + .5, y1, z1], [bx + xw - .5, y1, z1], [bx + xw, y1 - .4, z1], [bx + xw, YA, z1]]));
  for (const x of [bx - xw + .5, bx + xw - .5]) P.push(G.line([[x, y1, z0], [x, y1, z1]], F()));
  for (const x of [bx - xw, bx + xw]) P.push(G.line([[x, y1 - .4, z0], [x, y1 - .4, z1]], F()));
  for (let x = bx - xw; x <= bx + xw + .01; x += xw / 4) P.push(G.line([[x, YA + .04, z0], [x, YA + .04, z1]], F()));
  // bearing housings on the end walls, at every shaft (input pinions, gear shafts, the bull gear)
  const AX = [[bx, YA, .5], [bx - DXI, YA, .2], [bx + DXI, YA, .2]];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) AX.push([bx + sx * DXI, YA + sy * DYG, .22]);
  for (const [x, y, r] of AX) for (const z of [z0, z1]) P.push(fnp((o, s, es) => { slathe(o, x, y, [[z - .08, r], [z + .08, r]], 0, TAU, s * 1.5, es, { noFace: z > z0 }); arcZ(o, x, y, z, r * .55, 0, TAU, es); }));
  // feet on the seating, the inspection openings, lube oil piping round the casing, the turning gear motor
  for (const sx of [-1, 1]) P.push(G.box([bx + sx * xw - (sx > 0 ? 0 : .3), y0, z0 + .1], [bx + sx * xw + (sx > 0 ? .3 : 0), y0 + .25, z1 - .1]));
  P.push(G.cyl([bx - xw + .2, y1 - .25, z1 + .15], [bx + xw - .2, y1 - .25, z1 + .15], .045, F()));
  for (const [x, y] of AX.slice(1)) P.push(G.line([[x, y1 - .25, z1 + .15], [x, y + .3, z1 + .09]], F()));
  P.push(G.lathe([bx - 1.0, y1 - .1, z0 + .2], [0, 1, 0], [[0, .2], [.5, .2]], { caps: true }), G.box([bx - 1.25, y1 - .2, z0 + .05], [bx - .75, y1 - .1, z0 + .5], F()));
  // the clutch/brake housings on the inputs (forward), the thrust bearing aft
  for (const sx of [-1, 1]) P.push(fnp((o, s, es) => slathe(o, bx + sx * DXI, YA, [[z1 + .1, .3], [z1 + .16, .46], [z1 + .62, .46], [z1 + .68, .3]], CUT0, CUT1, s * 1.4, es, { noFace: true })));
  P.push(fnp((o, s, es) => slathe(o, bx, YA, [[z0 - .58, .32], [z0 - .5, .62], [z0 - .08, .62], [z0, .5]], 0, TAU, s * 1.6, es)));
  P.push(G.box([bx - .7, y0, z0 - .6], [bx + .7, YA - .62, z0 - .02]));
  return P;
}
/* gear shapes (local: axis z, the face centred on z = 0) */
const gearBull = () => [fnp((o, s, es, c) => gear(o, RAT.nb, GR.rb, GR.fb, s, es, { psi: GR.psi, dbl: true, gap: GR.gb, hub: .42, holes: 8 }, c)), fnp((o, s, es) => slathe(o, 0, 0, [[-.62, .27], [.62, .27]], 0, TAU, s * 1.5, es))];
const gearP2 = () => [fnp((o, s, es, c) => gear(o, RAT.np, GR.rp, GR.fb, s, es, { psi: -GR.psi, dbl: true, gap: GR.gb, flank: true }, c)), fnp((o, s, es) => { slathe(o, 0, 0, [[-.5, .14], [1.0, .14]], 0, TAU, s * 1.5, es); seg(o, [.142, 0, -.5], [.142, 0, 1.0], es * .7); })];
const gearG1 = () => [fnp((o, s, es, c) => gear(o, RAT.ng, GR.rg, GR.fg, s, es, { psi: 25 * DEG, dbl: true, gap: .06, hub: .2, holes: 6 }, c)), fnp((o, s, es) => slathe(o, 0, 0, [[-.4, .12], [.4, .12]], 0, TAU, s * 1.5, es))];
const gearI = () => [fnp((o, s, es, c) => gear(o, RAT.ni, GR.ri, GR.fg, s, es, { psi: -25 * DEG, dbl: true, gap: .06, flank: true }, c)), fnp((o, s, es) => { slathe(o, 0, 0, [[-.35, .1], [1.2, .1]], 0, TAU, s * 1.5, es); seg(o, [.102, 0, -.3], [.102, 0, 1.2], es * .7);
  for (const z of [.85, .95, 1.05]) { arcZ(o, 0, 0, z, .36, 0, TAU, es); arcZ(o, 0, 0, z, .3, 0, TAU, es); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; arcZ(o, Math.cos(a) * .24, Math.sin(a) * .24, z, .02, 0, TAU, es); } } })];   // the clutch plates
/* the planes: input pinions and first-reduction gears forward, second-reduction pinions and the bull gear aft */
const ZG = m => m.zc + .55, ZB = m => m.zc - .45;
/* tooth phases so every mesh rolls: angle(alpha) = c + k * alpha for each gear, alpha the bull's angle */
function meshPhases() {
  const nb = RAT.nb, np = RAT.np, ng = RAT.ng, ni = RAT.ni, out = {};
  const pair = (cA, kA, NA, NB, th) => ({ c: th + PI - PI / NB + th * NA / NB - cA * NA / NB, k: -kA * NA / NB });   // B from A: b = (th+PI-PI/NB) - (a - th) NA/NB
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const th = Math.atan2(sy * DYG, sx * DXI), p = pair(0, 1, nb, np, th);
    out['P' + sx + sy] = p;
  }
  for (const sx of [-1, 1]) {
    const up = out['P' + sx + '1'], g = { c: up.c, k: up.k };     // G (upper) coaxial with P (upper), phase 0
    out['G' + sx + '1'] = g;
    const i = pair(g.c, g.k, ng, ni, -PI / 2); out['I' + sx] = i;
    const dn = pair(i.c, i.k, ni, ng, -PI / 2); out['G' + sx + '-1'] = dn;   // the lower gear's phase follows from the input
  }
  return out;
}
let MESH = null;

/* ================= pumps (motor over pump, the coupling seen through its guard) ================= */
const PUMPS = [];
MER.forEach((m, mi) => { const xs = m.bx - m.s * 3.6; for (const z of [m.zc - .5, m.zc + .5, m.zc + 1.5]) PUMPS.push({ p: [xs, YL, z], mi }); });
function pumpStatic() {
  const P = [];
  P.push(G.box([-.35, 0, -.35], [.35, .12, .35]));
  P.push(G.lathe([0, .12, 0], [0, 1, 0], [[0, .16], [.08, .22], [.3, .22], [.38, .14]], { caps: true }));
  P.push(G.cyl([.18, .3, 0], [.5, .3, 0], .06, {}), G.cyl([0, .3, .18], [0, .3, .5], .05, {}));
  P.push(G.line([[-.13, .38, -.13], [.13, .38, -.13], [.13, .58, -.13], [-.13, .58, -.13], [-.13, .38, -.13]], F()), G.line([[-.13, .38, .13], [.13, .38, .13], [.13, .58, .13], [-.13, .38, .13]], F()));
  P.push(G.lathe([0, .58, 0], [0, 1, 0], [[0, .24], [.62, .24], [.72, .18]], { caps: true }));
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P.push(G.line([[Math.cos(a) * .25, .62, Math.sin(a) * .25], [Math.cos(a) * .25, 1.15, Math.sin(a) * .25]], F())); }
  P.push(G.box([.22, .8, -.1], [.36, 1.0, .1], F()));
  return P;
}
const pumpCoupling = () => [fnp((o, s, es) => { slathe(o, 0, 0, [[-.04, .1], [.04, .1]], 0, TAU, s, es); for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; seg(o, [0, 0, .04], [Math.cos(a) * .1, Math.sin(a) * .1, .04], es); } seg(o, [0, 0, -.1], [0, 0, .1], es); })];
const PUMP_R = R.x(-PI / 2);                             // coupling cloud's z -> ship up

/* ================= switchboard (local) ================= */
const SW_H = 2.3, SW_D = .9;
const swG = i => ({ x: i + .5 });
function swbStatic(n) {
  const P = [];
  for (let i = 0; i < n; i++) {
    const x0 = i, x1 = i + 1;
    P.push(G.box([x0, 0, -SW_D], [x1, SW_H, 0], { edgeOnly: true }));
    P.push(fnp((o, s) => P_.quadL(o, [x0, 0, 0], [x1, 0, 0], [x1, SW_H, 0], [x0, SW_H, 0], [0, 0, 1], s), { ds: 3 }));
    P.push(G.line([[x0 + .05, .08, .005], [x1 - .05, .08, .005], [x1 - .05, SW_H - .08, .005], [x0 + .05, SW_H - .08, .005], [x0 + .05, .08, .005]]));
    for (let k = 0; k < 6; k++) P.push(G.line([[x0 + .2, SW_H - .25 + k * .025, .006], [x1 - .2, SW_H - .25 + k * .025, .006]], F()));
    P.push(G.cyl([x1 - .12, 1.0, 0], [x1 - .12, 1.3, 0], .015, F()));
    if (i === 0) {          // the generator's air circuit breaker (draw-out): its face, the closing spring window, the racking slot
      P.push(G.line([[x0 + .14, .45, .008], [x1 - .14, .45, .008], [x1 - .14, 1.45, .008], [x0 + .14, 1.45, .008], [x0 + .14, .45, .008]]));
      P.push(G.box([x0 + .2, .5, -.05], [x1 - .2, 1.4, .03], F()));
      P.push(G.line([[x0 + .3, 1.22, .035], [x0 + .46, 1.22, .035], [x0 + .46, 1.32, .035], [x0 + .3, 1.32, .035], [x0 + .3, 1.22, .035]], F()));
      P.push(G.line([[x0 + .54, 1.22, .035], [x0 + .7, 1.22, .035], [x0 + .7, 1.32, .035], [x0 + .54, 1.32, .035], [x0 + .54, 1.22, .035]], F()));
      P.push(G.line([[x0 + .38, .58, .035], [x0 + .62, .58, .035]], F()));
      P.push(fnp((o, s, es) => { arcZ(o, x0 + .5, .92, .036, .05, 0, TAU, es); arcZ(o, x0 + .5, .92, .036, .03, 0, TAU, es); }));
    } else if (i === 1) {   // meters (kW, A, V, Hz), the synchroscope, lamps
      P.push(fnp((o, s, es) => {
        for (const [cx, cy] of SW_DIALS) { arcZ(o, x0 + cx, cy, .01, .075, 0, TAU, es); arcZ(o, x0 + cx, cy, .01, .08, 0, TAU, es);
          for (let k = 0; k <= 10; k++) { const a = PI / 2 + 135 * DEG - k * 27 * DEG; seg(o, [x0 + cx + Math.cos(a) * .06, cy + Math.sin(a) * .06, .012], [x0 + cx + Math.cos(a) * .073, cy + Math.sin(a) * .073, .012], es * .6); } }
        arcZ(o, x0 + .5, 1.12, .01, .09, 0, TAU, es); arcZ(o, x0 + .5, 1.12, .01, .095, 0, TAU, es);
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; seg(o, [x0 + .5 + Math.cos(a) * .078, 1.12 + Math.sin(a) * .078, .012], [x0 + .5 + Math.cos(a) * .088, 1.12 + Math.sin(a) * .088, .012], es * .6); }
        for (let k = 0; k < 4; k++) arcZ(o, x0 + .25 + k * .166, .86, .012, .025, 0, TAU, es);
      }));
      for (let k = 0; k < 3; k++) P.push(G.line([[x0 + .2, .62 - k * .1, .008], [x1 - .2, .62 - k * .1, .008]], F()));
    } else {                // feeders: two rows of three moulded-case breakers
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const bx = x0 + .12 + c * .27, by = .55 + r * .62;
        P.push(G.line([[bx, by, .008], [bx + .22, by, .008], [bx + .22, by + .42, .008], [bx, by + .42, .008], [bx, by, .008]]), G.box([bx + .04, by + .05, -.03], [bx + .18, by + .37, .02], F())); }
    }
  }
  return P;
}
const SW_DIALS = [[.3, 1.85], [.7, 1.85], [.3, 1.5], [.7, 1.5]];

/* ================= ducts: round uptakes, rectangular intake trunks (ship frame) ================= */
function roundDuct(P, path, r0, r1, bel) {
  const n = path.length;
  for (let i = 0; i < n - 1; i++) {
    const a = path[i], b = path[i + 1], r = r0 + (r1 - r0) * (i / Math.max(1, n - 2)), d = V.sub(b, a), L = V.len(d);
    P.push(fnp((o, s, es) => { const i0 = o.length; slathe(o, 0, 0, [[0, r], [L, r]], 0, TAU, s, es); xfp(o, i0, alignZ(V.mul(d, 1 / L)), a); }, { ds: 3.6 }));
    P.push(fnp((o, s, es) => { const i0 = o.length; for (let z = .45; z < L - .2; z += .9) arcZ(o, 0, 0, z, r + .012, 0, TAU, es);
      for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; seg(o, [Math.cos(t) * r, Math.sin(t) * r, 0], [Math.cos(t) * r, Math.sin(t) * r, L], es); }
      xfp(o, i0, alignZ(V.mul(d, 1 / L)), a); }, F()));
    if (bel && i === 0) P.push(fnp((o, s, es) => { const i0 = o.length; for (const z of [.3, .38, .46, .54, .62]) arcZ(o, 0, 0, z, r + .05, 0, TAU, es); xfp(o, i0, alignZ(V.mul(d, 1 / L)), a); }, F()));
  }
}
function rectDuct(P, path, w0, d0, w1, d1) {
  const n = path.length, C = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), w = (w0 + (w1 - w0) * f) / 2, dd = (d0 + (d1 - d0) * f) / 2, p = path[i];
    C.push([[p[0] - w, p[1], p[2] - dd], [p[0] + w, p[1], p[2] - dd], [p[0] + w, p[1], p[2] + dd], [p[0] - w, p[1], p[2] + dd]]);
  }
  for (let i = 0; i < n - 1; i++) {
    P.push(G.hex([...C[i], ...C[i + 1]], { skip: [1], ds: 4.2 }));
    const L = V.dist(path[i], path[i + 1]);
    for (let t = .8; t < L - .3; t += .8) { const u = t / L, q = C[i].map((p, j) => V.lerp(p, C[i + 1][j], u)); P.push(G.line([...q, q[0]], F())); }
  }
}
/* polylines with lengths (for pulses) */
const PL = { pw: [], gen: [], data: [], air: [] };

/* ================= the plant's static clouds ================= */
function structure() {
  const P = [];
  const zA = -33, zF = 10;
  // lower hull: frames every 1.22 m (keel to waterline, both sides), longitudinals, the keel, bilge keels
  const sect = z => { const L = []; for (let y = -6.3; y <= .01; y += .25) L.push([hb(z, y), y]); return L; };
  for (let z = zA; z <= zF; z += 1.22) { const S = sect(z); for (const sx of [-1, 1]) P.push(G.line(S.map(([x, y]) => [sx * x, y, z]), z % 2.44 < 1.22 ? {} : F())); }
  for (const y of [-6.25, -6.0, -5.7, -5.2, -4.5, -3.6, -2.4, -1.2]) for (const sx of [-1, 1]) P.push(G.line([[sx * hb(zA, y), y, zA], [sx * hb(-10, y), y, -10], [sx * hb(zF, y), y, zF]]));
  P.push(G.line([[0, -6.3, zA], [0, -6.3, zF]]), G.line([[0, -5.15, zA], [0, -5.15, zF]]));
  for (const sx of [-1, 1]) { const x = hb(0, -5.0); P.push(G.line([[sx * x, -5.0, -24], [sx * (x + .45), -5.45, -24 + .4], [sx * (x + .45), -5.45, 5], [sx * x, -5.0, 5.4]])); }
  // bulkheads: outline keel/tank top to the main deck, stiffeners, a sparse face, the decks' lines on them
  for (const z of BH) {
    const L = [], yb = z < zF ? -6.3 : -1.5;
    for (let y = yb; y <= hD(z) + .01; y += .25) L.push(y);
    const R_ = L.map(y => [hb(z, y), y]);
    P.push(G.line([...R_.map(([x, y]) => [x, y, z]).reverse(), ...R_.map(([x, y]) => [-x, y, z])]));
    P.push(G.line([[-hb(z, hD(z)), hD(z), z], [hb(z, hD(z)), hD(z), z]]));
    for (let x = -8.4; x <= 8.41; x += .6) { const L2 = []; for (const y of L) if (hb(z, y) > Math.abs(x) + .05) L2.push([x, y, z]); if (L2.length > 1) P.push(G.line([L2[0], L2[L2.length - 1]], F())); }
    for (const y of [YL, YU, Y2]) if (y > yb) P.push(G.line([[-hb(z, y), y, z], [hb(z, y), y, z]]));
    P.push(fnp((o, s) => { for (let y = yb + s / 2; y < hD(z); y += s) { const w = hb(z, y); for (let x = -w + s / 2; x < w; x += s) o.push(x, y, z, 0, 0, z > 0 ? -1 : 1); } }, { ds: 9 }));
    // cable transits round the trays and the fibre trunk (multi-cable frames)
    for (const sx of [-1, 1]) { const x = sx * (z > 35 && z < 42 ? 5.2 : 3.4), y = ytr(z);
      P.push(G.line([[x - .4, y - .28, z], [x + .4, y - .28, z], [x + .4, y + .28, z], [x - .4, y + .28, z], [x - .4, y - .28, z]]));
      for (let k = 1; k < 4; k++) P.push(G.line([[x - .4, y - .28 + k * .14, z], [x + .4, y - .28 + k * .14, z]], F()));
      for (let k = 1; k < 6; k++) P.push(G.line([[x - .4 + k * .133, y - .28, z], [x - .4 + k * .133, y + .28, z]], F())); }
    if (z > 8) { const y = 5.9; P.push(G.line([[.75, y - .15, z], [1.25, y - .15, z], [1.25, y + .15, z], [.75, y + .15, z], [.75, y - .15, z]])); }
    // a watertight door on the 2nd deck level
    if (z > -7) { const y0 = Y2 + .02; P.push(G.line([[-1.6, y0, z], [-1.6, y0 + 1.7, z], [-1.3, y0 + 1.95, z], [-.6, y0 + 1.95, z], [-.3, y0 + 1.7, z], [-.3, y0, z]]), G.line([[-.45, y0 + .9, z], [-.45, y0 + 1.1, z]], F())); }
  }
  // decks: the 2nd deck over the machinery (beams and girders), forward of it as the passage floor; the upper level
  // flats along the sides (gratings); the lower level's floor plates; handrails, ladders
  for (let z = -25.5; z <= 8; z += 1.22) P.push(G.line([[-hb(z, Y2), Y2, z], [hb(z, Y2), Y2, z]], F()));
  for (const x of [-4.8, -2.4, 0, 2.4, 4.8]) P.push(G.line([[x, Y2, -25.5], [x, Y2, 8]]));
  for (let z = 8; z <= 40.4; z += .61) { const w = hb(z, Y2) - .2; P.push(G.line([[-w, Y2, z], [w, Y2, z]], F())); }
  for (const x of [-3.0, 3.0]) P.push(G.line([[x, Y2, 8], [x, Y2, 40.4]]));
  // the main deck's beams and girders over the passage (they tick past on the run forward)
  for (let z = 8.6; z <= 40.4; z += 1.22) { const y = hD(z) - .14, w = hb(z, y) - .1; P.push(G.line([[-w, y, z], [w, y, z]]), G.line([[-w, y - .18, z], [w, y - .18, z]], F())); }
  for (const x of [-4.8, -2.4, 2.4, 4.8]) P.push(G.line([[x, hD(8) - .14, 8], [x, hD(24) - .14, 24], [x, hD(40.4) - .14, 40.4]]));
  const flats = [[-25.5, -12.5], [-12.5, -6.0], [-6.0, 8.0]];
  flats.forEach(([z0, z1], fi) => {
    const amr = fi === 1;
    for (const sx of [-1, 1]) {
      const xi = amr ? 0 : 5.3;
      for (let z = z0 + .12; z < z1; z += .25) P.push(G.line([[sx * xi, YU, z], [sx * (hb(z, YU) - .1), YU, z]], F()));
      P.push(G.line([[sx * xi, YU, z0], [sx * xi, YU, z1]]));
      if (!amr) { P.push(G.line([[sx * xi, YU + 1.0, z0], [sx * xi, YU + 1.0, z1]]), G.line([[sx * xi, YU + .5, z0], [sx * xi, YU + .5, z1]], F()));
        for (let z = z0 + .3; z < z1; z += 1.2) P.push(G.line([[sx * xi, YU, z], [sx * xi, YU + 1.0, z]])); }
    }
  });
  for (let z = -25.3; z < 8; z += .5) { const w = hb(z, YL) - .1; P.push(G.line([[-w, YL, z], [w, YL, z]], F())); }
  for (let x = -7.5; x <= 7.51; x += 1.0) P.push(G.line([[x, YL, -25.5], [x, YL, 8]], F()));
  for (const [x, z, dz] of [[6.0, 6.4, -1], [-6.0, -14.0, 1], [6.0, -24.6, 1], [-6.2, 6.6, -1]]) {
    const a = [x, YL, z], b = [x, YU, z + dz * 2.4];
    for (const dx of [-.35, .35]) P.push(G.line([[a[0] + dx, a[1], a[2]], [b[0] + dx, b[1], b[2]]]));
    for (let k = 1; k < 14; k++) { const f = k / 14; P.push(G.line([[x - .35, YL + (YU - YL) * f, z + dz * 2.4 * f], [x + .35, YL + (YU - YL) * f, z + dz * 2.4 * f]], F())); }
  }
  return P;
}
/* the machinery static parts in the ship frame: gear casings, ducts, pumps' pipework, line shaft bearings, trays,
   cable risers, air start piping, the CIC and the fibre trunk */
function plantStatic() {
  const P = [];
  for (const m of MER) P.push(...mrgCase(m));
  // uptakes (round, with bellows) and intake trunks to the stacks
  for (const g of GTM) {
    const zx = g.o[2] + .8, x = g.o[0];
    roundDuct(P, [[x, YA + 1.15, zx], [x, 4.6, zx], [g.xo, 11.0, g.zo], [g.xo, 21.0, g.zo]], .76, .62, true);
    const zi = g.o[2] + 7.0, m = MER[g.mi];
    P.push(G.box([x - 1.2, YA + 1.45, g.o[2] + 5.9], [x + 1.2, YA + 2.45, g.o[2] + 8.05], { ds: 4 }));
    rectDuct(P, [[x, YA + 2.45, zi], [x, 4.8, zi], [g.xo * 1.4, 11.5, m.stk + 2.35], [g.xo * 1.4, 15.6, m.stk + 2.35]], 2.0, 2.0, 1.5, 1.5);
  }
  for (const g of GTGS) {
    const L = X.make(R.y(g.ry), g.o), ex = X.ap(L, [0, 1.1, 7.3]), it = X.ap(L, [0, 1.12, 3.6]);
    roundDuct(P, [ex, [ex[0], 4.4, ex[2]], [g.xo, 11.6, g.zo], [g.xo, 21.0, g.zo]], .36, .32, true);
    rectDuct(P, [it, [it[0], 4.6, it[2]], [g.xo, 11.8, g.zo - 2.15], [g.xo, 15.4, g.zo - 2.15]], .9, .9, .8, .8);
  }
  // line shaft bearings (pedestals) and bulkhead seals
  for (const sh of SHAFT) {
    const Rm = alignZ(sh.d);
    for (const sb of sh.brg) P.push(fnp((o, s, es) => { const i0 = o.length; slathe(o, 0, 0, [[-.3, .34], [-.25, .44], [.25, .44], [.3, .34]], 0, TAU, s * 1.3, es); xfp(o, i0, Rm, V.mad(sh.a, sh.d, sb)); }));
    for (const sb of sh.brg) { const c = V.mad(sh.a, sh.d, sb); P.push(G.box([c[0] - .5, -5.1, c[2] - .28], [c[0] + .5, c[1] - .38, c[2] + .28], { ds: 2.5 }), G.box([c[0] - .62, c[1] - .1, c[2] - .2], [c[0] + .62, c[1] + .02, c[2] + .2], F({ ds: 2 }))); }
    for (const z of BH) { if (z > sh.a[2] - .1 || z < sh.a[2] - sh.L) continue; const sb = (sh.a[2] - z) / -sh.d[2], c = V.mad(sh.a, sh.d, sb);
      P.push(fnp((o, s, es) => { slathe(o, c[0], c[1], [[z - .2, .48], [z + .2, .48]], 0, TAU, s * 1.2, es); arcZ(o, c[0], c[1], z, .62, 0, TAU, es); })); }
  }
  // pumps' pipework to the gear casing
  for (const p of PUMPS) { const m = MER[p.mi], xc = m.bx + (p.p[0] > m.bx ? 2.86 : -2.86); P.push(G.line([[p.p[0] + .5, p.p[1] + .3, p.p[2]], [p.p[0] + .5, -3.9, p.p[2]], [xc, -3.9, p.p[2]]])); }
  // cable trays: ladder trays under the main deck, both sides, MER 2 to the power room (round the forward VLS)
  for (const sx of [-1, 1]) {
    const tr = trayPath(sx);
    for (let i = 0; i < tr.length - 1; i++) {
      const a = tr[i], b = tr[i + 1], d = V.norm(V.sub(b, a)), n = V.norm([d[2], 0, -d[0]]);
      for (const k of [-.3, .3]) { P.push(G.line([V.mad(a, n, k), V.mad(b, n, k)]), G.line([V.add(V.mad(a, n, k), [0, .1, 0]), V.add(V.mad(b, n, k), [0, .1, 0])], F())); }
      const L = V.dist(a, b);
      for (let s = .15; s < L; s += .3) { const p = V.mad(a, d, s); P.push(G.line([V.mad(p, n, -.3), V.mad(p, n, .3)])); }
      for (let s = .4; s < L; s += 1.5) { const p = V.mad(a, d, s), y1 = hD(p[2]) - .05; P.push(G.line([V.mad(p, n, -.32), V.add(V.mad(p, n, -.32), [0, y1 - p[1], 0])]), G.line([V.mad(p, n, .32), V.add(V.mad(p, n, .32), [0, y1 - p[1], 0])])); }
    }
  }
  // the cables themselves (one line each, in the trays and the risers) and the generator leads
  for (const c of PL.pw) P.push(G.line(c.pl.P));
  for (const sx of [-1, 1]) { const tr = trayPath(sx); for (let k = 0; k < 7; k++) P.push(G.line(offPath(tr, (k - 3) * .08, .02 + (k % 3) * .03 + (sx > 0 ? .0 : .09)), k & 1 ? F() : {})); }
  for (const pl of PL.gen) { P.push(G.line(pl.P)); P.push(G.line(pl.P.map(p => [p[0] + .05, p[1], p[2] + .05])), G.line(pl.P.map(p => [p[0] - .05, p[1], p[2] - .05]))); }
  for (const pl of PL.air) for (let i = 0; i < pl.P.length - 1; i++) { P.push(G.cyl(pl.P[i], pl.P[i + 1], .06, { ds: 1.6 })); if (i) P.push(G.cyl(V.mad(pl.P[i], V.norm(V.sub(pl.P[i + 1], pl.P[i])), -.03), V.mad(pl.P[i], V.norm(V.sub(pl.P[i + 1], pl.P[i])), .03), .1, F())); }
  for (const pl of PL.data) P.push(G.line(pl.P), G.line(pl.P.map(p => [p[0], p[1] - .06, p[2]]), F()));
  // the forward Mk 41 launcher below the deck (four 8-cell modules; the trays pass outboard of it): module frames, the
  // canisters (square, ribbed), the gas uptake between each module's two columns
  { const zc = 38.9, yt = hD(zc) - .08, yb = yt - 7.7;
    for (let m = 0; m < 4; m++) { const xm = (-3 + 2 * m) * 1.05;
      P.push(G.box([xm - 1.02, yb, zc - 1.72], [xm + 1.02, yt, zc + 1.72], { edgeOnly: true }));
      for (const y of [yb + .4, yb + 2.6, yb + 4.9, yt - .5]) P.push(G.line([[xm - 1.02, y, zc - 1.72], [xm + 1.02, y, zc - 1.72], [xm + 1.02, y, zc + 1.72], [xm - 1.02, y, zc + 1.72], [xm - 1.02, y, zc - 1.72]], F()));
      P.push(G.box([xm - .14, yb, zc - 1.6], [xm + .14, yt, zc + 1.6], F({ edgeOnly: true })));
      for (const j of [-1, 1]) for (let r = 0; r < 4; r++) { const x = xm + j * .72, z = zc + (1.5 - r) * .85, h = .3;
        P.push(G.box([x - h, yb + .9, z - h], [x + h, yt - .15, z + h], { edgeOnly: true }));
        for (let y = yb + 1.6; y < yt - .3; y += 1.1) P.push(G.line([[x - h, y, z - h], [x + h, y, z - h], [x + h, y, z + h], [x - h, y, z + h], [x - h, y, z - h]], F())); } } }
  // the combat system equipment room forward of the CIC: two rows of electronics cabinets each side, under the trays
  for (const c of EQC) {
    const [x, z, f] = c, x0 = x - .3, x1 = x + .3, zf = z + f * .4, zb = z - f * .4;
    P.push(G.box([x0, Y2, Math.min(zf, zb)], [x1, Y2 + 2.0, Math.max(zf, zb)], { edgeOnly: true }));
    P.push(fnp((o, s) => P_.quadL(o, [x0, Y2, zf], [x1, Y2, zf], [x1, Y2 + 2.0, zf], [x0, Y2 + 2.0, zf], [0, 0, f], s), { ds: 4 }));
    P.push(G.line([[x0 + .04, Y2 + .1, zf + f * .005], [x1 - .04, Y2 + .1, zf + f * .005], [x1 - .04, Y2 + 1.9, zf + f * .005], [x0 + .04, Y2 + 1.9, zf + f * .005], [x0 + .04, Y2 + .1, zf + f * .005]], F()));
    for (let k = 0; k < 5; k++) P.push(G.line([[x0 + .08, Y2 + .5 + k * .25, zf + f * .006], [x1 - .08, Y2 + .5 + k * .25, zf + f * .006]], F()));
  }
  // the CIC (2nd deck level under the SPY house): consoles in two rows facing forward, the large screens
  P.push(G.box([-5.0, Y2 + .02, 13.5], [5.0, 6.35, 23.5], { edgeOnly: true }));
  for (const zr of [16.0, 19.0]) for (let k = 0; k < 6; k++) { const x = -3.9 + k * 1.3;
    P.push(G.box([x - .45, Y2, zr - .35], [x + .45, Y2 + .75, zr + .35], { ds: 3 }));
    P.push(G.line([[x - .42, Y2 + .78, zr + .3], [x + .42, Y2 + .78, zr + .3], [x + .42, Y2 + 1.35, zr + .45], [x - .42, Y2 + 1.35, zr + .45], [x - .42, Y2 + .78, zr + .3]]));
    P.push(G.line([[x - .38, Y2 + .82, zr + .32], [x + .38, Y2 + .82, zr + .32], [x + .38, Y2 + 1.3, zr + .44], [x - .38, Y2 + 1.3, zr + .44], [x - .38, Y2 + .82, zr + .32]], F())); }
  for (let k = 0; k < 4; k++) { const x = -3.6 + k * 2.4; P.push(G.line([[x - 1.0, Y2 + 1.1, 23.4], [x + 1.0, Y2 + 1.1, 23.4], [x + 1.0, Y2 + 2.3, 23.4], [x - 1.0, Y2 + 2.3, 23.4], [x - 1.0, Y2 + 1.1, 23.4]]), G.line([[x - .95, Y2 + 1.15, 23.38], [x + .95, Y2 + 1.15, 23.38], [x + .95, Y2 + 2.25, 23.38], [x - .95, Y2 + 2.25, 23.38], [x - .95, Y2 + 1.15, 23.38]], F())); }
  return P;
}
/* electronics cabinets forward of the CIC: [x, z, facing] */
const EQC = [];
for (const x of [-4.2, -3.55, -2.9, -2.25, 2.25, 2.9, 3.55, 4.2]) for (const [z, f] of [[25.2, 1], [27.0, -1], [28.6, 1], [30.4, -1]]) EQC.push([x, z, f]);
/* the tray route on one side (ship frame) */
function trayPath(sx) {
  const P = [];
  for (let z = -24.5; z < 34.0; z += 2.0) P.push([sx * 3.4, ytr(z), z]);
  P.push([sx * 3.4, ytr(34.0), 34.0], [sx * 5.2, ytr(35.2), 35.2], [sx * 5.2, ytr(41.6), 41.6], [sx * 2.0, 6.33, 42.8], [sx * 1.8, 6.33, 55.3]);
  return P;
}
/* a path offset sideways (horizontal normal of its run) and up */
function offPath(P, d, dy) {
  const n = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], tx = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(tx, tz); return l > .05 ? [tz / l, -tx / l] : null; });
  for (let i = n.length - 2; i >= 0; i--) if (!n[i]) n[i] = n[i + 1];
  for (let i = 1; i < n.length; i++) if (!n[i]) n[i] = n[i - 1];
  return P.map((p, i) => [p[0] + (n[i] ? n[i][0] : 1) * d, p[1] + dy, p[2] + (n[i] ? n[i][1] : 0) * d]);
}
/* the power cables: from each switchboard's generator section up through the 2nd deck into its tray and forward to
   the railgun power room's cabinets; the generator leads from each GTG's terminal box to its switchboard */
function routes() {
  PL.pw.length = 0; PL.gen.length = 0; PL.data.length = 0; PL.air.length = 0;
  SWB.forEach((sw, i) => {
    const L = X.make(R.y(sw.ry), sw.o), top = X.ap(L, [.5, SW_H, -.45]), sx = sw.tray;
    const tray = trayPath(sx), z0 = top[2];
    const P = [top, [top[0], 5.2, top[2]], [sx * 3.4, ytr(z0), z0]];
    for (const p of tray) if (p[2] > z0 + .5) P.push(p.slice());
    const end = P[P.length - 1]; P.push([end[0], 3.8, 55.62]);
    // two feeders, three phases each: six cables side by side in the tray (the third board's a layer above)
    for (let k = 0; k < 6; k++) PL.pw.push({ i, k, pl: P_.poly(offPath(P, (k - 2.5) * .075, .03 + (i === 2 ? .09 : 0) + (k & 1) * .045)) });
    const g = GTGS[i], Lg = X.make(R.y(g.ry), g.o), tb = X.ap(Lg, [g.tb * 1.06, .4, 1.32]), bot = X.ap(L, [.5, 0, -.45]);
    PL.gen.push(P_.poly([tb, [tb[0], YU - .25, tb[2]], [bot[0], YU - .25, bot[2]], bot]));
  });
  // bleed air from each MER's generator compressor to its two starters (GTG 3 feeds MER 2's header through AMR 2)
  MER.forEach((m, mi) => {
    const g = GTGS[mi], Lg = X.make(R.y(g.ry), g.o), bp = X.ap(Lg, [0, TY + .4, 4.6]), yh = -1.25;
    GTM.filter(t => t.mi === mi).forEach(t => {
      const st = [t.o[0] - .5, t.o[1] - 1.25, t.o[2] + 6.2];
      PL.air.push(P_.poly([bp, [bp[0], yh, bp[2]], [bp[0], yh, st[2] + .9], [st[0], yh, st[2] + .9], [st[0], st[1] + .02, st[2] + .9], st]));
    });
  });
  // data: from the SPY-1D faces down the house to the CIC, then the fibre trunk forward to the mount and the cabinets
  const SP = HD.destroyer.A.spy;
  SP.forEach((c, k) => { const zc = E.clamp(c[2], 14.5, 22.5), xi = Math.sign(c[0]) * 2.4;
    PL.data.push(P_.poly([c, [c[0] * .8, c[1], c[2]], [xi, 10.0, c[2]], [xi, 6.2, zc], [xi * .4, 5.95, zc], [1.0, 5.9, 23.5]])); });
  const TR = [[1.0, 5.9, 23.5], [1.0, 5.9, 25.0], [4.0, ytr(25) - .2, 26.0], [4.0, ytr(34) - .2, 34.0], [5.6, ytr(35.2) - .2, 35.4], [5.6, ytr(41.4) - .2, 41.4], [2.4, 6.15, 42.8], [.5, 6.2, 46.6], [0, 6.36, 47.6]];
  for (const d of [-.05, 0, .05]) PL.data.push(P_.poly(offPath(TR, d, 0)));
  PL.data.push(P_.poly([[2.4, 6.15, 42.8], [2.6, 6.15, 55.0], [.4, 6.15, 55.6], [.4, 3.8, 55.62]]));
}

/* ================= build ================= */
const CL = {};
let O = null, OB = null, OF = null, OR = null;                      // draw options: machinery, structure, fine parts
const PX = { m: 6.0, b: 8.5, f: 5.6, r: 9.5 };
const TAGS = [];
function build(ctx) {
  K = ctx.K; P_ = ctx.P_; LIME = ctx.LIME; HOT = ctx.HOT; WH = ctx.WH;
  const t0 = performance.now(); NPT = 0;
  O = Object.assign({}, ctx.RO, { md: 3, S: null, lime: 0, a: .95, edge: .85, keep: 1, zfix: undefined, bk: .2, foc: 0 });
  OB = Object.assign({}, O, { a: .6, edge: .6 });
  OF = Object.assign({}, O, { a: .95, edge: .9 });
  OR = Object.assign({}, O, { a: .85, edge: .7, keep: .6 });
  routes();
  MESH = meshPhases();
  PATH = FILM.path(KEYS);
  CL.shell = lod(structure(), 1.4, LVB);
  CL.plant = lod(plantStatic(), 1.1, LV16);
  CL.gtm = lod(gtmStatic(), .7, LVF8);
  CL.vsv = lod(vsvRings(), .5, LVF8);
  CL.gg = lod(ggRotor(), .5, LVF8);
  CL.pt = lod(ptRotor(), .5, LVF8);
  CL.gtg = lod(gtgStatic(), .7, LVM);
  CL.gtgT = [lod(gtgTerm(1), .5, LVM), lod(gtgTerm(-1), .5, LVM)];
  CL.gtgR = lod(gtgRotor(), .5, LVF8);
  CL.genR = lod(genRotor(), .5, LVM);
  CL.bull = lod(gearBull(), .6, LVF8);
  CL.p2 = lod(gearP2(), .4, LVF);
  CL.g1 = lod(gearG1(), .5, LVF8);
  CL.gi = lod(gearI(), .4, LVF);
  CL.pump = lod(pumpStatic(), .5, LV16);
  CL.pcpl = lod(pumpCoupling(), .3, LVF);
  CL.swb = [lod(swbStatic(6), .6, LVF8), lod(swbStatic(5), .6, LVF8)];
  CL.shaft = SHAFT.map(sh => lod(shaftPrims(sh), 1.0, LV16));
  // warps: generator speeds, gas generators, shafts (rev/s shown on screen)
  GENW.length = 0; GT_T.forEach(([a, b, c]) => GENW.push(FILM.warp([{ t: 0, rate: 0 }, { t: a, rate: 0 }, { t: b, rate: .35 }, { t: c, rate: 2.6 }, { t: LEN, rate: 2.6 }])));
  for (const id in GM_T) { const [a, b, c] = GM_T[id]; GGW[id] = FILM.warp([{ t: 0, rate: 0 }, { t: a, rate: 0 }, { t: b, rate: .7 }, { t: c, rate: 3.0 }, { t: LEN, rate: 3.0 }]); }
  SHW.length = 0; CLU.forEach(c => SHW.push(FILM.warp([{ t: 0, rate: 0 }, { t: c, rate: 0 }, { t: c + 1.4, rate: .05 }, { t: c + 2.6, rate: .42 }, { t: c + 3.7, rate: SH_RPM / 60 }, { t: LEN, rate: SH_RPM / 60 }])));
  for (const t of TAGDEF) TAGS.push(Object.assign({ tg: K.mkTag() }, t));
  for (const k in CL) (Array.isArray(CL[k]) ? CL[k] : [CL[k]]).forEach((c, i) => { c.__n = Array.isArray(CL[k]) ? k + i : k; });
  RGE.info = { ms: Math.round(performance.now() - t0), pts: NPT, n: Object.fromEntries(Object.entries(CL).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(c => c.lv.map(l => l.length / 6))])) };
}
/* a line shaft (local: along z from 0 to L): the shaft, a painted line, coupling flanges with their bolts */
function shaftPrims(sh) {
  const P = [];
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[0, .265], [sh.L, .265]], 0, TAU, s * 2.2, es)));
  P.push(fnp((o, s, es) => { seg(o, [.268, 0, 0], [.268, 0, sh.L], es * .8); seg(o, [-.268, 0, 0], [-.268, 0, sh.L], es * 2); }));
  for (const c of sh.cpl) P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[c - .2, .3], [c - .12, .56], [c + .12, .56], [c + .2, .3]], 0, TAU, s, es);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; for (const z of [c - .13, c + .13]) arcZ(o, Math.cos(a) * .46, Math.sin(a) * .46, z, .035, 0, TAU, es); } }));
  return P;
}

/* ================= state ================= */
const ST = { gen: new Float64Array(3), genA: new Float64Array(3), brk: new Float64Array(3), gg: {}, ggA: {}, sh: new Float64Array(2), shA: new Float64Array(2) };
function state(u) {
  for (let k = 0; k < 3; k++) { const w = GENW[k]; ST.gen[k] = w.rate(u) / 2.6; ST.genA[k] = w(u) * TAU; ST.brk[k] = kk(u, GT_T[k][3], GT_T[k][3] + .12); }
  for (const id in GGW) { const w = GGW[id]; ST.gg[id] = w.rate(u) / 3.0; ST.ggA[id] = w(u) * TAU; }
  for (let i = 0; i < 2; i++) { const w = SHW[i]; ST.sh[i] = w.rate(u) * 60; ST.shA[i] = w(u) * TAU * (i ? 1 : -1); }
  return ST;
}
const ngg = (id, u) => { const [a, b, c] = GM_T[id]; return u < a ? 0 : u < b ? 1200 * ss(a, b, u) : 1200 + 3700 * ss(b, c, u); };

/* ================= the window ================= */
function xray(u, XS) {
  const b = XS.box; b[0] = -11.5; b[1] = 11.5; b[2] = -7; b[3] = 24; b[4] = -33; b[5] = 57.6;
  XS.ko = 0; XS.ks = 0;
  if (u < .9 || u > 22.6) { XS.zo = 99; XS.zs = 99; return false; }
  let zo = 9.5 - 42.5 * kk(u, .9, 3.1);
  if (u > 15.5) zo = -33 + 60 * ss(15.5, 20.4, u) + 30.6 * ss(20.6, 22.6, u);
  XS.zo = zo; XS.ko = u < 3.1 ? 1 : u < 3.7 ? 1 - ss(3.1, 3.7, u) : u > 20.6 ? 1 : 0;
  // the run: the front opens the hull a little ahead of the lens (each bulkhead flashes as it passes), the aft edge follows
  const front = u < 14.2 ? 9.5 : Math.max(9.5, PATH(u).eye[2] + 15 * ss(14.2, 14.8, u));
  XS.zs = front > 57.5 ? 99 : front; XS.ks = u > 14.2 && front < 57.5 ? 1 : 0;
  return true;
}
const XW = { zo: 99, zs: 99 };
const isOpen = z => XW.zo < 90 && z > XW.zo && z < XW.zs && z > -33 && z < 57.6;

/* ================= camera (ship frame keys; world through the ship's motion) ================= */
const KEYS = [
  { t: 0, eye: [19.6, 11, 63], target: [1.9, 8.5, 49], fov: 33 },
  { t: 1.3, eye: [24, 9, 30], target: [0, 1.5, -2], fov: 48 },
  { t: 2.5, eye: [16, 2, 14], target: [0, 2, -6], fov: 56 },              // low by the waterline: the uptakes rise, the slice runs aft
  { t: 3.5, eye: [7.0, -.2, 7.5], target: [4.6, -3.0, -.5], fov: 50 },     // down into MER 1: GTG 1 starts
  { t: 4.4, eye: [4.8, .6, 2.4], target: [6.1, .1, -2.8], fov: 44 },
  { t: 5.3, eye: [4.0, .9, -.4], target: [6.4, .7, -3.1], fov: 40 },       // switchboard 1S: the breaker, the meters
  { t: 6.2, eye: [3.6, 1.3, 4.4], target: [1.6, -1.2, .4], fov: 50 },
  { t: 7.0, eye: [3.0, .2, 9.0], target: [-.3, -2.7, 4.0], fov: 46 },      // LM2500 1B: starter, variable vanes
  { t: 7.9, eye: [3.2, -.6, 4.6], target: [-.3, -2.75, 2.4], fov: 40 },    // light-off
  { t: 9.0, eye: [3.0, -.9, 2.0], target: [-.3, -2.7, .2], fov: 44 },      // the turbines
  { t: 9.9, eye: [2.7, -.9, -1.8], target: [-.8, -2.7, -4.3], fov: 46 },
  { t: 10.9, eye: [2.5, -.6, -8.2], target: [-1.4, -2.6, -4.6], fov: 44 }, // round the gear's aft end: the clutch goes in
  { t: 11.7, eye: [-.4, -1.3, -9.6], target: [-2.0, -2.7, -4.6], fov: 40 }, // the bull gear and its four pinions meshing
  { t: 12.6, eye: [1.6, 1.8, -6.8], target: [-1.4, -2.2, -4.2], fov: 46 },  // over the open casing: the locked train turning
  { t: 13.6, eye: [5.5, 4.0, -14.5], target: [-1.5, -2.5, -9.0], fov: 60 }, // the shafts, MER 2, AMR 2 from above
  { t: 14.6, eye: [5.8, 9.0, -24], target: [3.4, 5.4, -15], fov: 54 },  // the run forward: over the starboard tray, through the X-ray
  { t: 15.6, eye: [5.8, 9.2, -12], target: [3.4, 5.5, -3], fov: 54 },
  { t: 16.6, eye: [5.8, 9.4, 0], target: [3.4, 5.7, 9], fov: 54 },
  { t: 17.6, eye: [5.6, 9.6, 12], target: [3.4, 5.8, 21], fov: 54 },
  { t: 18.6, eye: [5.4, 9.8, 24], target: [3.6, 6.0, 33], fov: 54 },
  { t: 19.4, eye: [6.2, 9.6, 32.5], target: [4.6, 6.0, 41], fov: 54 },       // the forward launcher below
  { t: 20.3, eye: [3.2, 4.8, 42.5], target: [0, 3.4, 51], fov: 52 },        // the railgun power room
  { t: 21.4, eye: [9.0, 9.5, 49], target: [.5, 4.5, 50.5], fov: 46 },      // up through the deck: the room under the mount as the slice shuts
  { t: LEN, eye: [19.6, 11, 63], target: [1.9, 8.5, 49], fov: 33 },
];
let PATH = null;
const SHOT = { eye: [0, 0, 0], target: [0, 0, 0], fov: 1, roll: 0 };
/* debug: ?ecams=u:ex,ey,ez,tx,ty,tz,fov;... (ship frame) holds those cameras at those moments (read from the shoot page too) */
const QS = (() => { let q = location.search; try { if (window.parent !== window) q += '&' + parent.location.search.slice(1); } catch (e) {} return new URLSearchParams(q); })();
const ECAMS = (QS.get('ecams') || '').split(';').filter(Boolean).map(x => { const [u, v] = x.split(':'); return { u: +u, c: v.split(',').map(Number) }; });
function cam(u, ctx) {
  for (const e of ECAMS) if (Math.abs(e.u - u) < .02) return { eye: X.ap(ctx.Ws, e.c.slice(0, 3)), target: X.ap(ctx.Ws, e.c.slice(3, 6)), fov: (e.c[6] || 40) * DEG, roll: 0 };
  if (!PATH) PATH = FILM.path(KEYS);
  const s = PATH(u), Ws = ctx.Ws;
  let shot = { eye: X.ap(Ws, s.eye), target: X.ap(Ws, s.target), fov: s.fov, roll: 0 };
  const a = ss(0, 1.8, u), b = ss(LEN - 1.6, LEN, u);
  if (a < 1) shot = K.blendShot(ctx.camAt(4.0 + u), shot, a);
  if (b > 0) shot = K.blendShot(shot, ctx.camAt(4.0 - (LEN - u)), b);
  return shot;
}

/* ================= draw ================= */
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0];
function apI(Tw, x, y, z, out) {
  const M = Tw.R, t = Tw.T;
  out[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; out[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; out[2] = M[6] * x + M[7] * y + M[8] * z + t[2];
  return out;
}
const LG = {}, GTGL = [], SWL = [];
function density() { const q = K.DQ; O.px = PX.m / q; OB.px = PX.b / q; OF.px = PX.f / q; OR.px = PX.r / q; }
/* debug (?eprof): points and ms per cloud in RGE.prof */
const EPROF = QS.has('eprof');
function profX(ml, Tw, o) { P_.np(); const t = performance.now(); P_.drawX(ml, Tw, o); const k = ml.__n || 'room', A = RGE.prof || (RGE.prof = {}); A[k] = A[k] || [0, 0]; A[k][0] += P_.np(); A[k][1] += performance.now() - t; }
/* focus: in the close passes the part at work is drawn full, the rest of the plant sparse and dim (and coarser with
   distance, through drawX's foc) */
const FOCUS = [[3.0, 5.9, [5.6, -1.4, -1.5], 4.6], [6.3, 9.7, [-.3, -2.7, 3.0], 4.6], [9.7, 13.1, [-1.6, -2.7, -4.3], 3.8]];
const FC = { p: [0, 0, 0], r: 5, k: 0 };
function focusAt(u) {
  FC.k = 0;
  for (let i = 0; i < FOCUS.length; i++) {
    const [a, b, p, r] = FOCUS[i], n = FOCUS[i + 1];
    if (u >= a - .4 && u <= b) { FC.k = Math.min(ss(a - .4, a + .1, u), n && n[0] <= b + .01 ? 1 : 1 - ss(b - .5, b, u));
      const w = n && n[0] <= b + .01 ? ss(b - .45, b + .05, u) : 0;
      for (let j = 0; j < 3; j++) FC.p[j] = p[j] + ((n ? n[2][j] : p[j]) - p[j]) * w; FC.r = r + ((n ? n[3] : r) - r) * w; break; }
  }
  return FC;
}
const fw = c => FC.k < .01 ? 1 : 1 - FC.k * ss(FC.r, FC.r * 2.2, Math.hypot(c[0] - FC.p[0], c[1] - FC.p[1], c[2] - FC.p[2]));
function fset(o, c, a, keep) { const f = fw(c); o.a = a * (.38 + .62 * f); o.keep = keep * (.3 + .7 * f); }
const GC_ = {};
function draw(u, ctx) {
  const Ws = ctx.Ws, X_ = EPROF ? profX : P_.drawX;
  density();
  XW.zo = ctx.XS.zo; XW.zs = ctx.XS.zs;
  if (XW.zo > 90) return;
  const st = state(u); focusAt(u);
  const ce = K.C.eye, fd = FC.k > .3 ? 1.3 * Math.hypot(ce[0] - FC.p[0], ce[1] - FC.p[1], ce[2] - FC.p[2]) : 0;
  O.foc = OB.foc = OF.foc = fd;
  // structure and static plant
  OB.S = null; OB.a = .62; OB.keep = 1 - .45 * FC.k; X_(CL.shell, Ws, OB); OB.keep = 1;
  O.S = null; O.a = .9; O.lime = 0; O.keep = 1 - .35 * FC.k; X_(CL.plant, Ws, O); O.keep = 1;
  // gas turbine modules and their rotors
  for (const g of GTM) {
    const L = LG[g.id] || (LG[g.id] = X.make(R.I(), g.o)), Lw = X.mul(Ws, L), n = st.gg[g.id], c = GC_[g.id] || (GC_[g.id] = V.add(g.o, [0, 0, 3.5]));
    OF.S = L; OF.lime = 0; fset(OF, c, .95, 1); X_(CL.gtm, Lw, OF);
    const Lv = X.mul(L, X.make(R.z((ngg(g.id, u) / 4900 - .5) * 6 * DEG), [0, 0, 0])); OF.S = Lv; X_(CL.vsv, X.mul(Ws, Lv), OF);
    const Lr = X.mul(L, X.make(R.z(st.ggA[g.id] * (g.mi ? -1 : 1)), [0, 0, 0]));
    OF.S = Lr; fset(OF, c, .85, 1 - .55 * E.sat(n * 1.3 - .3)); OF.lime = .12 * n; X_(CL.gg, X.mul(Ws, Lr), OF);
    const pa = ptAngle(g, st), Lp = X.mul(L, X.make(R.z(pa), [0, 0, 0])), ps = st.sh[g.mi] / SH_RPM;
    OF.S = Lp; fset(OF, c, .85, 1 - .55 * E.sat(ps * 1.3 - .2)); OF.lime = .1 * ps; X_(CL.pt, X.mul(Ws, Lp), OF);
    OF.keep = 1; OF.lime = 0; OF.a = .95;
  }
  // main reduction gears
  for (let mi = 0; mi < 2; mi++) drawGears(MER[mi], mi, st, Ws);
  // generator sets
  GTGS.forEach((g, k) => {
    const L = GTGL[k] || (GTGL[k] = X.make(R.y(g.ry), g.o)), n = st.gen[k], c = GC_['g' + k] || (GC_['g' + k] = X.ap(L, [0, 0, 3.5]));
    OF.S = L; fset(OF, c, .95, 1); OF.lime = 0; const Lw = X.mul(Ws, L); X_(CL.gtg, Lw, OF); X_(CL.gtgT[g.tb > 0 ? 0 : 1], Lw, OF);
    const Lr = X.mul(L, X.make(R.z(st.genA[k] * 5.2), [0, TY, 0]));
    OF.S = Lr; fset(OF, c, .85, 1 - .55 * E.sat(n * 1.3 - .3)); OF.lime = .12 * n; X_(CL.gtgR, X.mul(Ws, Lr), OF);
    const Lg = X.mul(L, X.make(R.z(st.genA[k]), [0, 0, 0]));
    OF.S = Lg; fset(OF, c, .9, 1); OF.lime = .25 * st.brk[k]; X_(CL.genR, X.mul(Ws, Lg), OF);
    OF.lime = 0; OF.keep = 1; OF.a = .95;
  });
  // switchboards
  SWB.forEach((sw, k) => { const L = SWL[k] || (SWL[k] = X.make(R.y(sw.ry), sw.o)); O.S = L; fset(O, sw.o, .95, 1); X_(CL.swb[sw.n === 6 ? 0 : 1], X.mul(Ws, L), O); });
  // pumps (the lube oil pumps run before the clutches go in)
  PUMPS.forEach((p, i) => {
    const L = X.make(R.I(), p.p); O.S = L; fset(O, p.p, .9, 1); X_(CL.pump, X.mul(Ws, L), O);
    const on = ss(5.8 + .3 * i, 6.3 + .3 * i, u), Lc = X.make(R.mul(R.y(on * (u - 5.8) * 9 + i), PUMP_R), [p.p[0], p.p[1] + .48, p.p[2]]);
    OF.S = Lc; fset(OF, p.p, .95, 1); X_(CL.pcpl, X.mul(Ws, Lc), OF);
  });
  // line shafts
  SHAFT.forEach((sh, i) => {
    const Lb = X.make(R.mul(alignZ(sh.d), R.z(st.shA[i])), sh.a);
    O.S = Lb; fset(O, V.mad(sh.a, sh.d, 6), .9, 1); O.lime = .08 * Math.min(1, st.sh[i] / SH_RPM); X_(CL.shaft[i], X.mul(Ws, Lb), O); O.lime = 0;
  });
  O.S = null; OF.S = null; O.keep = OF.keep = 1; O.a = .9; OF.a = .95;
  drawRoom(u, ctx, Ws);
  fx(u, ctx, st, Ws);
}
/* the PT (and its coupling shaft) is held on its brake until the clutch is in, then turns with the input pinion */
function ptAngle(g, st) { const i = MESH['I' + g.sx]; return (i.c + i.k * st.shA[g.mi]) * 1; }
function drawGears(m, mi, st, Ws) {
  const X_ = EPROF ? profX : P_.drawX, al = st.shA[mi], bx = m.bx, zb = ZB(m), zg = ZG(m), lit = .25 * E.sat(st.sh[mi] / 8);
  const put = (cl, c, k, x, y, z) => { const L = X.make(R.z(c + k * al), [x, y, z]); OF.S = L; Q3[0] = x; Q3[1] = y; Q3[2] = z; fset(OF, Q3, 1.0, .85); X_(cl, X.mul(Ws, L), OF); };
  OF.lime = lit * .6;
  put(CL.bull, 0, 1, bx, YA, zb);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const p = MESH['P' + sx + sy], g = MESH['G' + sx + sy];
      put(CL.p2, p.c, p.k, bx + sx * DXI, YA + sy * DYG, zb);
      put(CL.g1, g.c, g.k, bx + sx * DXI, YA + sy * DYG, zg);
    }
    const i = MESH['I' + sx]; put(CL.gi, i.c, i.k, bx + sx * DXI, YA, zg);
  }
  OF.lime = 0; OF.a = .95;
}
/* the railgun power room as it stands before the mount wakes: dark (the parts module's clouds) */
let ALT_L = null, MOD_L = null;
function drawRoom(u, ctx, Ws) {
  if (XW.zs < 41 && XW.zs < 90) return;
  const X_ = EPROF ? profX : P_.drawX, C_ = ctx.CL;
  if (!ALT_L) { ALT_L = P_.ALT.map((c, k) => X.make(P_.ALT_FLIP[k] ? R.y(PI) : R.I(), c)); MOD_L = P_.MOD.map(m => X.make(m.s > 0 ? R.I() : R.y(PI), m.p)); }
  const o = OR, kr = u > 20.9 ? .42 : .6; o.S = null; o.a = .5; o.keep = .5; X_(C_.floor, Ws, o); o.a = .85; o.keep = kr;
  X_(C_.racks, Ws, o); X_(C_.cab, Ws, o); X_(C_.over, Ws, o); X_(C_.cool, Ws, o); o.lime = .3 * pwr(u); X_(C_.bus, Ws, o); o.lime = 0;
  for (let k = 0; k < 4; k++) { const L = ALT_L[k]; o.S = L; const Lw = X.mul(Ws, L); X_(C_.body, Lw, o); X_(C_.bell, Lw, o); X_(C_.exc, Lw, o); X_(C_.fan, Lw, o); X_(C_.rotor, Lw, o); }
  o.keep = kr * .55; for (let k = 0; k < MOD_L.length; k++) { const L = MOD_L[k]; o.S = L; X_(C_.module, X.mul(Ws, L), o); }
  o.S = null;
}
const pwr = u => ss(17.2, 19.6, u);

/* ================= effects ================= */
function fx(u, ctx, st, Ws) {
  const odot = P_.odot, oglow = P_.oglow;
  // generator sets: the six cans light, rim streaks on the turbine
  GTGS.forEach((g, k) => {
    const L = X.mul(Ws, GTGL[k]), [ts, tl] = GT_T[k], n = st.gen[k];
    if (!isOpen(X.ap(GTGL[k], [0, 0, 5.8])[2])) return;
    const lo = lockU(u, tl), on = ss(tl, tl + .25, u);
    if (on > .01) for (let c = 0; c < 6; c++) {
      const a = c / 6 * TAU + PI / 6, f = .55 + .45 * K.hh(c + k * 7, Math.floor(u * 20));
      for (let z = 5.45; z < 6.2; z += .07) { apI(L, Math.cos(a) * .42, TY + Math.sin(a) * .42, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, HOT, on * f * .9); }
      apI(L, Math.cos(a) * .42, TY + Math.sin(a) * .42, 5.8, Q1); oglow(Q1[0], Q1[1], Q1[2], 16 + 30 * lo, LIME, (.3 + .6 * lo) * on);
    }
    if (n > .03) streaks(L, 0, TY, [4.05, 6.45], [.33, .35], st.genA[k] * 5.2, n, 1, 10);
    if (u > ts && u < tl + .4) { apI(L, 0, -.2, 2.9, Q1); oglow(Q1[0], Q1[1], Q1[2], 12, LIME, .4 * ss(ts, ts + .2, u) * (1 - ss(tl, tl + .4, u))); }
    // the generator's poles once it carries load
    if (n > .3) { const Lg = X.mul(L, X.make(R.z(st.genA[k]), [0, 0, 0])); for (let p = 0; p < 4; p++) { const a = p * PI / 2; for (let j = 0; j < 8; j++) { const aa = a - j * .06 * n; apI(Lg, Math.cos(aa) * .57, Math.sin(aa) * .57, 1.25, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, (.3 + .5 * st.brk[k]) * (1 - j / 8)); } } }
  });
  // the main engines: starter, light-off round the nozzle ring, the flame, rim streaks
  for (const g of GTM) {
    const [ts, tl] = GM_T[g.id], n = st.gg[g.id]; if (u < ts - .1) continue;
    const Lw = X.mul(Ws, LG[g.id]); if (!isOpen(g.o[2] + 4)) continue;
    const sg = g.mi ? -1 : 1, aG = st.ggA[g.id] * sg;
    if (u < tl + .5) {       // the air start motor turning, its ring lit
      const a = ss(ts, ts + .15, u) * (1 - ss(tl + .2, tl + .5, u));
      if (a > .01) { apI(Lw, -.17, -.83, 6.15, Q1); K.ringW(Q1, X.dir(Lw, [1, 0, 0]), X.dir(Lw, [0, 1, 0]), .15, 28, 1, LIME, .8 * a, aG * 3); oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .35 * a); }
    }
    const on = ss(tl, tl + .3, u);
    if (on > .01) {
      const lo = lockU(u, tl);
      for (let k = 0; k < 30; k++) {        // each nozzle lights as the flame runs round the annulus (crossfire)
        const a = k / 30 * TAU, d = Math.min(k, 30 - k) / 15, lit = ss(tl + d * .14, tl + d * .14 + .05, u);
        if (lit < .01) continue;
        const f = .6 + .4 * K.hh(k + g.mi * 31, Math.floor(u * 24)), c = Math.cos(a), sn = Math.sin(a);
        apI(Lw, c * .66, sn * .66, 4.15, Q1); odot(Q1[0], Q1[1], Q1[2], 2, HOT, lit * f);
        for (let j = 1; j < 6; j++) { const w = j / 6; apI(Lw, c * (.6 - .1 * w), sn * (.6 - .1 * w), 4.08 - .55 * w, Q2); odot(Q2[0], Q2[1], Q2[2], j < 3 ? 2 : 1, j < 2 ? HOT : LIME, lit * f * (1 - .7 * w)); }
        oglow(Q1[0], Q1[1], Q1[2], 14 + 30 * lo, LIME, (.35 + .6 * lo) * lit);
      }
      // the flame annulus inside the liner, flickering
      for (let k = 0; k < 72; k++) { const a = k / 72 * TAU + aG * .05, fl = .5 + .5 * K.hh(k + g.mi * 7, Math.floor(u * 30)); apI(Lw, Math.cos(a) * .5, Math.sin(a) * .5, 3.95 - .25 * K.hh(k, 4), Q2); odot(Q2[0], Q2[1], Q2[2], 1, fl > .7 ? HOT : LIME, on * (.35 + .6 * fl)); }
      apI(Lw, 0, 0, 3.9, Q1); oglow(Q1[0], Q1[1], Q1[2], 60 + 80 * lo, LIME, .18 * on + .5 * lo);
      // the hot gas through the turbines: a ring of embers drifting aft
      for (let k = 0; k < 40; k++) { const ph = (u * 2.2 + K.hh(k, 3)) % 1, a = K.hh(k, 9) * TAU + aG * .3, r = .45 + .07 * K.hh(k, 5), z = 3.8 - ph * 2.1;
        apI(Lw, Math.cos(a) * r, Math.sin(a) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, HOT, on * .5 * (1 - ph)); }
    }
    if (n > .05) streaks(Lw, 0, 0, [6.22, 3.4], [.53, .52], aG, n, 1, 12);
    const ps = st.sh[g.mi] / SH_RPM;
    if (ps > .05) streaks(Lw, 0, 0, [2.75, 1.7], [.58, .75], ptAngle(g, st), ps, -1, 12);
  }
  // exhaust from the stacks once the engines and generators burn
  plumes(u, Ws);
  // gear meshes: the lines of contact glow while torque goes through
  for (let mi = 0; mi < 2; mi++) meshFX(MER[mi], mi, st, Ws, u);
  // switchboards: breakers, meters, the synchroscope, lamps, feeders
  SWB.forEach((sw, k) => swbFX(sw, k, u, st, Ws));
  // current: generator leads, then up the risers and forward; bleed air to the starters; data along the fibre
  PL.gen.forEach((pl, k) => pulses(pl, u, GT_T[k][3] - .05, LEN, 2.4, .35, .9, Ws, LIME));
  for (const c of PL.pw) pulses(c.pl, u, GT_T[c.i][3] + .1 + c.k * .06, LEN, 15 + .6 * c.k, 1.7, .95, Ws, LIME);
  GTM.forEach((g, k) => { const [ts, tl] = GM_T[g.id]; pulses(PL.air[k], u, ts - .45, tl + .3, 3.0, .25, .8, Ws, WH); });
  PL.data.forEach((pl, k) => dataPulses(pl, u, 14.0 + (k < 4 ? 0 : .6 + .3 * k), Ws));
  // the equipment cabinets' status lights (busy once the data flows)
  if (isOpen(27.5)) { const busy = ss(14.4, 15.4, u), fr = Math.floor(u * 9);
    EQC.forEach((c, i) => { const [x, z, f] = c, zf = z + f * .41;
      for (let k = 0; k < 6; k++) { const on = K.hh(i * 6.1 + k, fr + (k & 1)) > .5 - .3 * busy; apI(Ws, x - .2 + k * .08, Y2 + 1.75, zf, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, on && busy > .3 ? LIME : WH, on ? .8 : .15); } }); }
  // shafts: lime ticks on the coupling flanges
  SHAFT.forEach((sh, i) => { const r = st.sh[i] / SH_RPM; if (r < .02) return;
    for (const c of sh.cpl) { const p = V.mad(sh.a, sh.d, c); if (!isOpen(p[2])) continue;
      const Lb = X.mul(Ws, X.make(R.mul(alignZ(sh.d), R.z(st.shA[i])), sh.a));
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; apI(Lb, Math.cos(a) * .46, Math.sin(a) * .46, c + .14, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .3 + .5 * r); } } });
}
const lockU = (u, t0) => { const a = u - t0; return a > 0 && a < .8 ? Math.exp(-a * 5) : 0; };
/* rim streaks: lime arcs trailing at the tip of a spinning row (local z axis through (cx, cy)) */
function streaks(L, cx, cy, zs, rs, ang, rate, dir, nd) {
  const len = Math.min(2.4, .2 + 2.2 * rate);
  for (let r = 0; r < zs.length; r++) for (let m = 0; m < 3; m++) {
    const a0 = ang + m * TAU / 3 + r;
    for (let j = 0; j < nd; j++) {
      const a = a0 - dir * len * j / nd, w = 1 - j / nd;
      apI(L, cx + Math.cos(a) * rs[r], cy + Math.sin(a) * rs[r], zs[r], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, j ? LIME : HOT, (.3 + .6 * rate) * w * w);
    }
  }
}
/* stack exhaust: shimmering dots rising from the outlets (pure in u) */
function plumes(u, Ws) {
  const outs = [];
  for (const g of GTM) { const [, tl] = GM_T[g.id]; if (u > tl) outs.push([g.xo, g.zo, .62, ss(tl, tl + 1, u)]); }
  GTGS.forEach((g, k) => { if (u > GT_T[k][1]) outs.push([g.xo, g.zo, .32, ss(GT_T[k][1], GT_T[k][1] + 1, u)]); });
  for (let q = 0; q < outs.length; q++) {
    const [x, z, r, a] = outs[q]; if (!isOpen(z)) continue;
    for (let i = 0; i < 26; i++) {
      const life = 1.6, t0 = K.hh(i, q * 3.1) * life, age = (u + t0) % life, f = age / life;
      const an = K.hh(i, q + 5) * TAU, rr = r * Math.sqrt(K.hh(i, q + 9)) * (1 + 1.6 * f);
      apI(Ws, x + Math.cos(an) * rr + .8 * f * f, 22.2 + 5.5 * f, z + Math.sin(an) * rr - .4 * f, Q1);
      P_.odot(Q1[0], Q1[1], Q1[2], 1, WH, a * .5 * (1 - f) * (1 - f));
    }
  }
}
function meshFX(m, mi, st, Ws, u) {
  // the clutches going in: their plates flash, a ring runs round each
  const cf = lockU(u, CLU[mi]);
  if (cf > .02 && isOpen(m.zc)) for (const sx of [-1, 1]) {
    apI(Ws, m.bx + sx * DXI, YA, ZG(m) + .95, Q1); K.ringW(Q1, X.dir(Ws, [1, 0, 0]), X.dir(Ws, [0, 1, 0]), .36 + .25 * (1 - cf), 64, 1, LIME, cf, u * 4);
    P_.oglow(Q1[0], Q1[1], Q1[2], 40, LIME, .5 * cf);
  }
  const r = st.sh[mi]; if (r < .2 || !isOpen(m.zc)) return;
  const I = Math.min(1, r / 6) * (.6 + .4 * Math.sin(u * 9)), bx = m.bx, zb = ZB(m), zg = ZG(m);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    // bull / second-reduction pinion contact: on the line of centres at the bull's pitch radius
    const th = Math.atan2(sy * DYG, sx * DXI), cx = bx + Math.cos(th) * GR.rb, cy = YA + Math.sin(th) * GR.rb;
    for (const [z0, z1] of [[zb - GR.fb / 2, zb - GR.gb / 2], [zb + GR.gb / 2, zb + GR.fb / 2]]) {
      apI(Ws, cx, cy, z0, Q1); apI(Ws, cx, cy, z1, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.4, 1, LIME, .75 * I);
    }
    // first-reduction gear / input pinion contact
    const gy = YA + sy * (DYG - GR.rg), gx = bx + sx * DXI;
    apI(Ws, gx, gy, zg - GR.fg / 2, Q1); apI(Ws, gx, gy, zg + GR.fg / 2, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.4, 1, LIME, .75 * I);
  }
}
/* the switchboard's moving bits: the generator breaker's lever throws, the meters' needles rise, the synchroscope
   slows to twelve o'clock as the incoming set comes into phase, the on-line lamp, the feeders close one by one */
function swbFX(sw, k, u, st, Ws) {
  if (!isOpen(sw.o[2] + (sw.ry ? 0 : 0))) return;
  const L = X.mul(Ws, SWL[k]), [ts, tl, tr, tb] = GT_T[k], c = st.brk[k], gen = st.gen[k];
  // breaker lever (pivot on the ACB face), lime flash and the arc at the contacts
  const la = (-55 + 110 * c) * DEG;
  apI(L, .5, .92, .05, Q1); apI(L, .5 + Math.sin(la) * .2, .92 + Math.cos(la) * .2, .05, Q2);
  K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, c > .5 ? LIME : WH, .95);
  const fl = lockU(u, tb + .12);
  if (fl > .02) { P_.oglow(Q2[0], Q2[1], Q2[2], 26, LIME, .6 * fl); apI(L, .4, 1.38, .05, Q1); apI(L, .6, 1.42, .05, Q3); K.arcW(Q1, Q3, 31 + k, u, fl * 1.5, .7); }
  // meters: kW (0-3 000), A (0-4 000), V (0-600), Hz (55-65)
  const load = c * (.35 + .1 * ss(tb, tb + 3, u) + .25 * pwr(u)), vv = gen > .9 ? 450 * ss(tr - .4, tr, u) : 450 * gen * gen;
  const hz = gen > .5 ? 55 + 5 * E.sat((gen - .5) * 2) + .0 : 55;
  const vals = [load * 2500 / 3000, load * 3200 / 4000, vv / 600, E.sat((hz - 55) / 10)];
  SW_DIALS.forEach(([cx, cy], j) => {
    const a = PI / 2 + 135 * DEG - 270 * DEG * vals[j], x0 = 1 + cx;
    apI(L, x0, cy, .03, Q1); apI(L, x0 + Math.cos(a) * .065, cy + Math.sin(a) * .065, .03, Q2);
    K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, vals[j] > .02 ? LIME : WH, .9);
  });
  // synchroscope: the pointer turns with the slip, slowing to 12 o'clock as the breaker closes (GTG 1 closes on a dead bus)
  const sa = k === 0 ? PI / 2 : PI / 2 - 1.8 * TAU * Math.pow(Math.max(0, tb - u), 1.5) * (u > tr - .3 ? 1 : 0);
  apI(L, 1.5, 1.12, .03, Q1); apI(L, 1.5 + Math.cos(sa) * .08, 1.12 + Math.sin(sa) * .08, .03, Q2);
  K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, u > tr - .3 ? LIME : WH, .85);
  // lamps: on line (lime) once closed
  for (let j = 0; j < 4; j++) { apI(L, 1.25 + j * .166, .86, .02, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, j === 0 && c > .5 ? LIME : WH, j === 0 ? (c > .5 ? 1 : .2) : (gen > .9 ? .55 : .12)); if (j === 0 && c > .5) P_.oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .4); }
  // feeders close one by one after the generator breaker
  for (let i = 2; i < sw.n; i++) for (let r = 0; r < 2; r++) for (let cc = 0; cc < 3; cc++) {
    const t = tb + .25 + ((i - 2) * 6 + r * 3 + cc) * .05, on = u > t ? 1 : 0, bx = i + .12 + cc * .27 + .11, by = .55 + r * .62 + .21;
    apI(L, bx, by, .035, Q1); apI(L, bx, by + (on ? .07 : -.07), .045, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, on ? LIME : WH, on ? .9 : .5);
    const f = lockU(u, t); if (f > .05) P_.oglow(Q2[0], Q2[1], Q2[2], 8, LIME, .5 * f);
  }
}
/* charge pulses crawling along a polyline (ship frame), only where the hull is open */
function pulses(pl, u, t0, t1, speed, gap, I, Ws, col) {
  if (!pl) return;
  const A = I * ss(t0, t0 + .25, u) * (1 - ss(t1 - .4, t1, u)); if (A < .01) return;
  const front = (u - t0) * speed * 1.5, off = ((u - t0) * speed) % gap;
  for (let s = off; s < pl.L && s < front; s += gap) {
    P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue;
    apI(Ws, Q2[0], Q2[1] + .05, Q2[2], Q1);
    const head = front < pl.L && s > front - gap * 1.5;
    P_.odot(Q1[0], Q1[1], Q1[2], 2, head ? HOT : col, A);
    P_.oglow(Q1[0], Q1[1], Q1[2], head ? 20 : 10, col, (head ? .55 : .3) * A);
  }
}
/* data: packets of three white dots running along the fibre */
function dataPulses(pl, u, t0, Ws) {
  const A = ss(t0, t0 + .4, u) * (1 - ss(LEN - .8, LEN, u)); if (A < .01) return;
  const sp = 9, front = (u - t0) * sp * 1.8, off = ((u - t0) * sp) % .9;
  for (let s = off; s < pl.L && s < front; s += .9) for (let j = 0; j < 3; j++) {
    const q = s - j * .07; if (q < 0) continue;
    P_.polyAt(pl, q, Q2); if (!isOpen(Q2[2])) continue;
    apI(Ws, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], j ? 1 : 2, WH, A * (1 - j * .25)); if (!j) P_.oglow(Q1[0], Q1[1], Q1[2], 7, WH, .22 * A);
  }
}

/* ================= tags, readout ================= */
const T_GTG = (k, p) => () => X.ap(GTGL[k] || X.make(R.y(GTGS[k].ry), GTGS[k].o), p);
const T_GTM = (id, p) => () => { const g = GTM.find(q => q.id === id); return V.add(g.o, p); };
const TAGDEF = [
  { id: 'GTG', lab: 'Allison 501-K34 · GTG 1', val: u => u > GT_T[0][3] + .1 ? '2.5 MW' : `${fmt(1800 * (GENW.length ? GENW[0].rate(u) / 2.6 : 0))} rpm`, at: T_GTG(0, [0, 1.25, 1.2]), t0: 3.3, t1: 5.0 },
  { id: '1S', lab: 'Main switchboard 1S', val: u => u > GT_T[0][3] ? '450 V · 60 Hz' : '', at: () => [6.4, 1.75, -1.0], t0: 4.4, t1: 6.0 },
  { id: 'ACB', lab: 'Generator breaker', val: u => u > GT_T[0][3] + .1 ? 'closed' : 'open', at: () => [6.36, .6, -3.5], t0: 4.7, t1: 5.9 },
  { id: 'GTM', lab: 'LM2500-30 · 1B', val: () => '19.6 MW', at: T_GTM('1B', [0, 1.5, 5.0]), t0: 6.5, t1: 8.0 },
  { id: 'VSV', lab: 'Variable stator vanes', val: () => '7 rows', at: T_GTM('1B', [.35, .5, 6.0]), t0: 6.8, t1: 7.6 },
  { id: 'STR', lab: 'Air start motor', val: () => 'bleed air', at: T_GTM('1B', [-.1, -.9, 6.3]), t0: 6.8, t1: 7.7 },
  { id: 'CMB', lab: 'Combustor · 30 fuel nozzles', val: u => u > GM_T['1B'][1] ? 'light-off' : '', at: T_GTM('1B', [.5, .55, 4.1]), t0: 7.6, t1: 8.8 },
  { id: 'PT', lab: 'Power turbine · 6 stages', val: u => u < CLU[0] ? 'brake on' : `${fmt(SH_RPM * RATIO * Math.min(1, SHW.length ? SHW[0].rate(u) * 60 / SH_RPM : 0))} rpm`, at: T_GTM('1B', [.55, .6, 2.2]), t0: 8.6, t1: 9.8 },
  { id: 'MRG', lab: 'Main reduction gear 1 · locked train', val: () => '21.4 : 1', at: () => [-2.0, -.3, -5.2], t0: 9.9, t1: 11.3 },
  { id: 'CLU', lab: 'Clutch · brake', val: u => u > CLU[0] ? 'engaged' : 'brake on', at: () => [-.32, -2.0, -2.6], t0: 10.4, t1: 11.4 },
  { id: 'BUL', lab: 'Bull gear · double helical', val: u => `${Math.round(SHW.length ? SHW[0].rate(u) * 60 : 0)} rpm`, at: () => [-1.0, -1.05, -4.55], t0: 11.4, t1: 13.0 },
  { id: 'SHF', lab: 'Line shaft · port', val: u => `${Math.round(SHW.length ? SHW[0].rate(u) * 60 : 0)} rpm`, at: () => [-2.25, -2.3, -9.2], t0: 13.1, t1: 14.4 },
  { id: 'CPL', lab: 'Shaft coupling', val: () => '', at: () => [-2.25, -2.2, -13.8], t0: 13.3, t1: 14.4 },
  { id: 'MER', lab: 'Main engine room 2', val: () => '2 × LM2500', at: () => [2.0, .6, -20.0], t0: 13.4, t1: 14.5 },
  { id: 'CBL', lab: 'Power cables · 450 V', val: () => '3 × 2.5 MW', at: () => [3.4, 5.9, -2.0], t0: 15.0, t1: 16.3 },
  { id: 'CIC', lab: 'CIC', val: () => 'Aegis', at: () => [-1.0, 5.6, 18.5], t0: 16.7, t1: 17.9 },
  { id: 'FIB', lab: 'Fibre trunk · SPY-1D → mount', val: () => '', at: () => [4.0, 5.9, 30.0], t0: 17.9, t1: 19.0 },
  { id: 'VLS', lab: 'Mk 41 VLS · 32 cells', val: () => '', at: () => [3.15, 6.4, 38.9], t0: 18.9, t1: 19.9 },
  { id: 'PWR', lab: 'Railgun power room', val: () => '', at: () => [0, 5.4, 47.0], t0: 20.0, t1: 21.4 },
];
function tags(u, ctx) {
  for (const t of TAGS) {
    if (u < t.t0 || u > t.t1) continue;
    const a = E.sat((u - t.t0) / .2) * (1 - E.sat((u - t.t1 + .4) / .4));
    const p = X.ap(ctx.Ws, t.at());
    ctx.tagAt(t.tg, t.id, t.lab, t.val(u), p, a, u - t.t0);
  }
}
const fmt = n => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
function readout(u) {
  let l1, l2, rate = 1;
  const w = (a, b) => u >= a && u < b;
  if (u < 3.1) { l1 = 'DDG-51 · <b>main machinery</b>'; l2 = 'MER 1 · AMR 2 · MER 2 <b>opening</b>'; }
  else if (u < 6.3) {
    const k = u < GT_T[0][3] + .3 ? 0 : u < GT_T[1][3] + .2 ? 1 : 2, [ts, tl, tr, tb] = GT_T[k], n = GENW[k].rate(u) / 2.6;
    l1 = `Electric plant · <b>GTG ${k + 1} ${u < tl ? 'starting' : u < tr ? 'light-off' : u < tb ? 'synchronising' : 'on line'}</b>`;
    const on = GT_T.filter(t => u > t[3]).length;
    l2 = `Generator <b>${fmt(1800 * n)} rpm</b> · <b>${on} × 2.5 MW</b> on line · 450 V`;
    rate = 20;
  } else if (u < 10.4) {
    const id = u < 9.3 ? '1B' : u < 9.8 ? '1A' : u < 10.25 ? '2A' : '2B', [ts, tl, ti] = GM_T[id];
    l1 = `LM2500 ${id} · <b>${u < tl ? 'cranking' : u < ti ? 'light-off' : 'idle'}</b>`;
    l2 = `Gas generator <b>${fmt(ngg(id, u))} rpm</b> · PT <b>brake on</b>`;
    rate = 20;
  } else if (u < 14.3) {
    const r = SHW[0].rate(u) * 60, r2 = SHW[1].rate(u) * 60;
    l1 = u < CLU[0] + .3 ? 'Main reduction gear 1 · <b>clutch in</b>' : `Shafts · <b>${Math.round(r)} rpm</b> port · <b>${Math.round(r2)}</b> stbd`;
    l2 = `PT <b>${fmt(r * RATIO)} rpm</b> · 21.4 : 1 · pitch <b>0 %</b>`;
    rate = 4;
  } else if (u < 19.6) { l1 = 'Ship service power · <b>7.5 MW</b> on line'; l2 = `Bus <b>450 V · 60 Hz</b> · forward to the mount`; }
  else { l1 = 'Railgun power room · <b>cold</b>'; l2 = 'Feed <b>live</b> · data <b>SPY-1D</b> → mount'; }
  void w;
  return { l1, l2, rate };
}

/* ================= sound ================= */
const SFX = () => STAGE.SFX;
const cues = [
  [.9, () => SFX().tone(900, 2600, .9, 'sine', .012)],
  ...GT_T.map(([a]) => [a, () => { SFX().tone(180, 900, 1.2, 'sawtooth', .008); }]),
  ...GT_T.map(([, b]) => [b, () => { SFX().noise(.6, 600, .7, .03, .02); SFX().tone(300, 1400, 1.2, 'triangle', .008); }]),
  ...GT_T.map(([, , , d]) => [d + .12, () => { SFX().tone(900, 300, .06, 'square', .014); SFX().noise(.08, 3000, .8, .02, .002); }]),
  ...Object.values(GM_T).map(([a]) => [a, () => SFX().tone(120, 700, 1.0, 'sawtooth', .009)]),
  ...Object.values(GM_T).map(([, b]) => [b, () => { SFX().noise(1.2, 400, .8, .04, .03); SFX().tone(70, 260, 1.6, 'sawtooth', .012); }]),
  [CLU[0], () => { SFX().tone(120, 70, .22, 'square', .03); SFX().noise(.2, 500, 1, .04, .005); }],
  [CLU[1], () => { SFX().tone(110, 66, .22, 'square', .025); SFX().noise(.2, 480, 1, .035, .005); }],
  [CLU[0] + 1.2, () => SFX().tone(40, 90, 3.0, 'sawtooth', .012)],
  [14.4, () => SFX().noise(5.5, 1400, .5, .014, 1.5)],
  [20.6, () => SFX().tone(400, 220, 1.6, 'sine', .01)],
];
const chapters = [{ t: 0, title: 'Plant' }, { t: 2.5, title: 'Generators' }, { t: 6.3, title: 'Engines' }, { t: 10.4, title: 'Gears' }, { t: 14.3, title: 'Power run' }];

/* debug: points per prim of a part at spacing sp */
function primCounts(fn, sp) { return fn().map((pr, i) => [i, pr.t, samp([pr], sp, false).length / 6]).sort((a, b) => b[2] - a[2]).slice(0, 12); }
const RGE = { dbg: { primCounts, gtmStatic, ggRotor, ptRotor, gtgStatic, plantStatic, structure, gearBull, gearG1, gearP2 }, len: LEN, build, chapters, cues, cam, draw, xray, readout, tags, info: null };
window.RGE = RGE;
})();
