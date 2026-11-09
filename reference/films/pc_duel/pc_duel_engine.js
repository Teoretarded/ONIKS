/* SCAN · RAILGUN insert (window.RGE): the ship's two power plants, spliced in at base time 4.0
   (pc_scan_railgun_film.js, "inserted sequences"). Ship frame: +Z fwd, +X stbd, y up from the waterline, origin
   midships. One take of 121.6 s (round 3: cut from 189.5), the lens slow (moves of 3-6 s, a calm hold of 4 s or more
   on each machine, the look under 25 deg/s):
   1. from the power room the hull opens bow to stern over the whole machinery length (the ship service generators
      already on line);
   2. the gas turbine plant as built (DDG-51 Flight IIA): LM2500 1B's enclosure lifts and it cranks; in slow motion
      (x0.01) a lime scan plane runs down the open engine naming its six sections, 1.5 s each (inlet guide vanes,
      compressor 1-6 with the variable stators, compressor 7-16, the combustor, the HP turbine, the power turbine);
      end-on, the flame front runs round the annular combustor's thirty nozzles; the engines run up to idle; the
      locked-train reduction gear comes apart (exploded) and back, the clutches go in and the gears and shafts turn;
   3. the railgun's own plant (fiction: a real Burke is all gas turbine): a compact pressurised-water reactor below
      the 2nd deck between the engine rooms and the railgun power room (reactor compartment z 13.5-24, turbine room
      24-36.2, the railgun switchboards under the forward launcher 36.2-40.4). The coolant pumps start, the rods
      withdraw and the neutron flux climbs eight decades (traced beside the core) until it is critical and at power
      (x600); the steam generator boils off its U-tubes and the swirl vanes fling the water out of the steam (x0.1);
      one lime trace runs the power from the core to the switchboard; the steam streaks through the horizontally split
      high- and low-pressure turbines (x0.01; the scan plane names their stages), down into the shell-and-tube
      condenser (x0.1: seawater through the tubes and the waterboxes, the condensate curtain into the hotwell); the
      generator's two-pole rotor turns its field lobe past the slotted stator and its three-phase windings (x0.01,
      the phase currents traced);
   4. at the railgun switchboard the feeder breakers rack in and close (the arc chutes flash) and one current pulse
      runs forward along the cables into the power room, where the take hands back, close and level, to the base
      camera.
   The port loop and turbine set are the starboard ones mirrored. Render is a pure function of u; no allocation in
   the per-dot loops. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const LEN = 121.6;
const G = GEO;
let K = null, P_ = null, LIME = null, HOT = null, WH = null;
const F = o => Object.assign({ fine: true }, o || {});
const kk = (u, a, b) => E.inOut(E.sat((u - a) / (b - a)));
const ss = (a, b, v) => E.ss(a, b, v);
const frac = x => x - Math.floor(x);
const inSec = (a, a0, a1) => ((a - a0) % TAU + TAU) % TAU <= a1 - a0;

/* ================= layout ================= */
const YL = -4.8, YU = -0.6, Y2 = 3.6, YA = -2.7;          // lower level floor plates, upper level, 2nd deck, machinery axis
const hD = z => HD.destroyer.A.deckY(z);
const ytr = z => Math.min(6.3, hD(z) - .75);              // cable trays under the main deck
const BH = [-25.5, -12.5, -6.0, 8.0, 13.5, 24.0, 36.2, 40.4];
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
const RAT = { nb: 219, np: 43, ng: 147, ni: 35 };
const RATIO = RAT.nb / RAT.np * RAT.ng / RAT.ni;         // 21.39
const SH_RPM = 55;                                       // shafts at zero pitch on station
/* the beats (u, film s into the insert) */
const U_SCAN = [13.4, 22.4], U_EO = [23.6, 25.8, 31.2, 33.2], U_XP = [36.0, 37.8, 40.2, 41.8], U_HPS = [78.0, 82.6], U_LPS = [83.2, 87.8];
/* time compression (sim s per film s), shown on screen: x1 the opening, x20 the crank, x0.01 the scan down the
   engine and the light-off, x20 the run-up, x1 the exploded gear, x4 the clutches, x600 the reactor start-up, x0.1
   the boiling, x0.01 the turbine, x0.1 the condenser, x0.01 the generator, x1 the switchboard and the run */
const U_SL1 = 31.4;                                      // the end of the light-off's slow motion
const RK = [[0, 1], [11.8, 1], [12.2, 20], [12.8, 20], [13.2, .01], [31.2, .01], [31.8, 20], [34.8, 20], [35.2, 1], [42.6, 1], [43.0, 4], [46.0, 4], [46.4, 1],
  [53.6, 1], [54.0, 600], [61.6, 600], [62.4, .1], [75.0, .1], [75.8, .01], [89.4, .01], [90.0, .1], [96.0, .1], [96.6, .01], [105.4, .01], [106.0, 1], [LEN, 1]];
/* the ship service generators have been on line since before the take (start, light-off, rated, breaker) */
const GT_T = [[-60, -59, -58, -57], [-60, -59, -58, -57], [-60, -59, -58, -57]];
const GM_T = { '1B': [12.0, 26.3, 34.4], '1A': [32.0, 32.5, 34.2], '2A': [32.4, 32.9, 34.6], '2B': [32.8, 33.3, 35.0] };   // start, light-off, idle
const XF_T = { '1B': 3.2, '1A': .1, '2A': .1, '2B': .1 };   // the flame front's run round the annulus (film s; 32 ms at x0.01)
const CLU = [44.0, 44.4];                                // clutches in (MER 1, MER 2)
const RCP_T = [50.0, 52.4];                              // reactor coolant pumps: start, at speed
const ROD_T = [[54.2, 56.2], [56.0, 57.8], [57.6, 58.6]];   // rod banks A, B, C withdrawing
const ROD_H = [1.45, 1.45, .58], ROD_F = 4.35;           // each bank's withdrawal (m; C, the regulating bank, stops at 40 %); full travel x 3
const T_CRIT = 57.4, T_FULL = 60.4;                      // critical (rods 63 % out); full power (165 MW thermal, rods 80 % out)
const TG_T = [60.8, 61.8];                               // the turbines rolled up to 3 600 rpm
const T_FP = [60.0, 61.0], T_STM = [60.4, 61.8];         // the feed pumps; steam to the turbines
const T_ON = 62.0;                                       // the generators onto the railgun bus
const U_SGV = [62.8, 64.8, 74.6, 76.6];                  // the U-tubes drawn up while the lens is on the steam generator
const U_CND = [89.4, 96.4], U_GEN = [95.6, 105.6];       // the condenser's and the generator's beats
const T_RACK = [106.6, 107.9], T_FDR = 108.8, T_PULSE = 110.8;   // the feeder breakers rack in, close; the pulse
const LIFT = [10.4, 12.0, 32.4, 34.0];                   // the enclosure of LM2500 1B lifts off and goes back
function ngg(id, u) {
  const [a, b, c] = GM_T[id];
  if (id === '1B') return u < a ? 0 : u < a + 1.0 ? 1700 * ss(a, a + 1.0, u) : u < U_SL1 ? 1700 + 60 * ss(b, b + 3, u) : 1760 + 3140 * ss(U_SL1, c, u);
  return u < a ? 0 : u < b ? 1700 * ss(a, b, u) : 1700 + 3200 * ss(b, c, u);
}
function fgen(k, u) { const [a, b, c] = GT_T[k]; return u < a ? 0 : u < b ? .13 * ss(a, b, u) : .13 + .87 * ss(b, c, u); }
const shRpm = (i, u) => SH_RPM * ss(CLU[i] + .3, CLU[i] + 3.4, u);
function lpow(u) { return u < T_CRIT ? -8 + 2 * ss(ROD_T[0][0], T_CRIT, u) : -6 + 6 * Math.min(1, (u - T_CRIT) / (T_FULL - T_CRIT)); }

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
  const full = a1 - a0 >= TAU - 1e-6, nf = opt && opt.noFace, ne = opt && opt.noEdge, sg = opt && opt.inner ? -1 : 1;
  for (let i = 0; i < st.length - 1 && !nf; i++) {
    const [z0, r0] = st[i], [z1, r1] = st[i + 1], dz = z1 - z0, dr = r1 - r0, L = Math.hypot(dz, dr); if (L < 1e-6) continue;
    const na = Math.max(1, Math.round(L / s)), kz = -dr / L * sg, kr = dz / L * sg;
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
const CUT0 = 120 * DEG, CUT1 = 340 * DEG;
const ENC = { x: 1.325, y0: -1.6, y1: 1.45, z1: 8.1 };
const COMP = []; for (let i = 0; i < 16; i++) { const f = i / 15; COMP.push({ z: 6.2 - i * .114, h: .27 + .09 * f, t: .53 - .1 * f, n: Math.round(36 + 40 * f), c: .085 - .045 * f }); }
const HPT = [{ z: 3.4, h: .4, t: .52, n: 80, c: .055 }, { z: 3.24, h: .4, t: .535, n: 84, c: .055 }];
const PTR = []; for (let j = 0; j < 6; j++) { const f = j / 5; PTR.push({ z: 2.75 - j * .21, h: .42, t: .58 + .17 * f, n: 88 + 8 * j, c: .07 }); }
const VSV_N = 7;                                         // IGV + stages 1-6 vary
/* the enclosure: frame, sparse walls with stiffeners and doors, the roof's two openings (its own cloud: it lifts
   off the engine in the close-ups) */
function gtmEnc() {
  const P = [];
  const { x: ex, y0, y1, z1 } = ENC;
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
  return P;
}
function gtmStatic() {
  const P = [];
  const { y0, z1 } = ENC;
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
  P.push(G.box([-.38, -.98, 4.6], [.38, -.68, 5.95], { ds: 3.5 }));
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
  for (const sx of [-1, 1]) P.push(G.box([sx * .7 - .08, -.92, .45], [sx * .7 + .08, -.5, 2.05], { ds: 2.5 }));
  P.push(G.box([-.48, .74, .45], [.48, 1.18, 2.05], { ds: 2.5 }));
  for (let z = .55; z < 2; z += .1) P.push(G.line([[-.47, 1.19, z], [.47, 1.19, z]], F()));
  // reduction gearbox, inlet plenum and bellmouth
  P.push(G.box([-.52, -.75, 2.45], [.52, .9, 3.25], { ds: 2.5 }));
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
const gtgTerm = tb => [G.box([tb * .74, -.05, 1.0], [tb * .98, .55, 1.65], { ds: 2.5 }), ...[1.12, 1.32, 1.52].map(z => G.cyl([tb * .98, .4, z], [tb * 1.06, .4, z], .035, F()))];
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

/* ================= the railgun switchboard (round 3; local: x along the line-up, y up, z out of the front) =================
   three sections: the generator incomer (s0), metering and protection (s1), two feeder cubicles stacked (s2); each
   breaker a draw-out truck on rails (its own cloud: it racks in), three arc chutes of splitter plates on its top, the
   primary disconnects (finger clusters) at its back mating with the cubicle's stabs; the main bus (three bars) along
   the top back with droppers to the line stabs, the feeders' cables up the back to the trays */
const RSW_H = 2.3, RSW_D = .95, RSTAB = -.6, RTRAV = .3;
const RCUB = [{ x: .5, y: .1 }, { x: 2.5, y: .1 }, { x: 2.5, y: 1.15 }];   // cubicles (front-bottom centre): the incomer, feeder A (lower), feeder B (upper)
const RBUS = [-.68, -.78, -.88], RBY = 2.17;                                // the bus bars' z (phases A, B, C) and height
const rPole = p => -.2 + p * .2, RSY = [.52, .22];                          // a pole's x in its cubicle; the line (upper) and load (lower) stabs' heights
function rswStatic() {
  const P = [];
  for (let i = 0; i < 3; i++) {
    const x0 = i, x1 = i + 1;
    P.push(G.box([x0, 0, -RSW_D], [x1, RSW_H, 0], { edgeOnly: true }));
    P.push(fnp((o, s) => P_.quadL(o, [x0, 0, -RSW_D], [x0, RSW_H, -RSW_D], [x1, RSW_H, -RSW_D], [x1, 0, -RSW_D], [0, 0, 1], s), { ds: 6 }));
    for (let k = 0; k < 5; k++) P.push(G.line([[x0 + .15, RSW_H, -.12 - k * .08], [x1 - .15, RSW_H, -.12 - k * .08]], F()));
  }
  // section 1: meters, the synchroscope, lamps, a protection relay rack, the mimic's frame
  P.push(fnp((o, s, es) => { const x0 = 1;
    for (const [cx, cy] of SW_DIALS) { arcZ(o, x0 + cx, cy, .01, .075, 0, TAU, es); arcZ(o, x0 + cx, cy, .01, .08, 0, TAU, es);
      for (let k = 0; k <= 10; k++) { const a = PI / 2 + 135 * DEG - k * 27 * DEG; seg(o, [x0 + cx + Math.cos(a) * .06, cy + Math.sin(a) * .06, .012], [x0 + cx + Math.cos(a) * .073, cy + Math.sin(a) * .073, .012], es * .6); } }
    arcZ(o, x0 + .5, 1.12, .01, .09, 0, TAU, es); arcZ(o, x0 + .5, 1.12, .01, .095, 0, TAU, es);
    for (let k = 0; k < 4; k++) arcZ(o, x0 + .25 + k * .166, .86, .012, .025, 0, TAU, es);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) sqZ(o, x0 + .2 + c * .2, .25 + r * .16, .008, .07, .05, es);
    sqZ(o, x0 + .5, 2.12, .008, .42, .1, es); }));
  // the cubicles: their openings, back walls, racking rails, the stabs in their insulating spouts
  for (const c of RCUB) {
    const xa = c.x - .45, xb = c.x + .45, ya = c.y, yb = c.y + .95;
    P.push(G.line([[xa, ya, .006], [xb, ya, .006], [xb, yb, .006], [xa, yb, .006], [xa, ya, .006]]));
    P.push(G.line([[xa, ya, RSTAB - .04], [xb, ya, RSTAB - .04], [xb, yb, RSTAB - .04], [xa, yb, RSTAB - .04], [xa, ya, RSTAB - .04]], F()));
    for (const sx of [-1, 1]) P.push(G.line([[c.x + sx * .3, ya + .02, RSTAB], [c.x + sx * .3, ya + .02, .02]]), G.line([[c.x + sx * .35, ya + .06, RSTAB], [c.x + sx * .35, ya + .06, .02]], F()));
    P.push(fnp((o, s, es) => { for (const yy of RSY) for (let p = 0; p < 3; p++) slathe(o, c.x + rPole(p), ya + yy, [[RSTAB - .04, .05], [RSTAB, .05], [RSTAB, .028], [RSTAB + .05, .028]], 0, TAU, s, es); }, { ds: 1.4 }));
    // droppers from the bus to the line stabs; the load stabs' cables (feeders: up the back to the top; the incomer: the
    // generator's cables down from the top)
    P.push(fnp((o, s, es) => { for (let p = 0; p < 3; p++) { const x = c.x + rPole(p), zb = RBUS[p], yl = ya + RSY[0], yd = ya + RSY[1];
      seg(o, [x, RBY, zb], [x, yl, zb], es); seg(o, [x + .025, RBY, zb], [x + .025, yl, zb], es); seg(o, [x, yl, zb], [x, yl, RSTAB - .04], es);
      seg(o, [x, yd, RSTAB - .04], [x, yd, -.93], es); seg(o, [x, yd, -.93], [x, RSW_H, -.93], es); seg(o, [x + .02, yd, -.93], [x + .02, RSW_H, -.93], es); } }));
  }
  // the main bus: three flat copper bars along the top back on standoff insulators
  P.push(fnp((o, s, es) => { for (const zb of RBUS) { for (const dy of [-.05, .05]) seg(o, [.05, RBY + dy, zb], [2.95, RBY + dy, zb], es); for (let x = .05; x < 2.95; x += s) for (let y = RBY - .045; y < RBY + .05; y += s) o.push(x, y, zb, 0, 0, 1);
    for (let x = .25; x < 2.95; x += .5) { seg(o, [x, RBY - .05, zb], [x, RBY - .14, zb], es); arcZ(o, x, RBY - .1, zb, .02, 0, TAU, es); } }
    for (let x = .25; x < 2.95; x += .5) seg(o, [x, RBY - .14, RBUS[0] + .04], [x, RBY - .14, RBUS[2] - .04], es); }, { ds: 1.6 }));
  return P;
}
/* a draw-out breaker truck (local: the cubicle's front-bottom centre, racked in): body, front panel (charge window,
   close/open buttons, the racking screw), wheels, three poles (their vacuum bottles) with an arc chute of eight
   splitter plates over each, the finger clusters at the back */
function brkTruck() {
  const P = [];
  P.push(G.box([-.33, .04, -.52], [.33, .64, -.03], { edgeOnly: true }));
  P.push(fnp((o, s) => { P_.quadL(o, [-.33, .04, -.03], [.33, .04, -.03], [.33, .64, -.03], [-.33, .64, -.03], [0, 0, 1], s); for (const sx of [-1, 1]) P_.quadL(o, [sx * .33, .04, -.52], [sx * .33, .04, -.03], [sx * .33, .64, -.03], [sx * .33, .64, -.52], [sx, 0, 0], s); }, { ds: 4.5 }));
  P.push(fnp((o, s, es) => { sqZ(o, 0, .34, -.02, .29, .26, es); sqZ(o, -.13, .5, -.018, .08, .04, es); arcZ(o, .1, .5, -.018, .032, 0, TAU, es); arcZ(o, .2, .5, -.018, .032, 0, TAU, es);
    arcZ(o, 0, .15, -.018, .03, 0, TAU, es); arcZ(o, 0, .15, -.018, .012, 0, TAU, es); sqZ(o, .14, .3, -.018, .06, .025, es);
    seg(o, [-.22, .32, -.02], [-.22, .32, .06], es); seg(o, [-.22, .32, .06], [-.06, .32, .06], es); seg(o, [-.06, .32, .06], [-.06, .32, -.02], es); }));
  for (const sx of [-1, 1]) for (const z of [-.44, -.1]) P.push(G.cyl([sx * .3, .06, z], [sx * .36, .06, z], .04, F()));
  for (let p = 0; p < 3; p++) {
    const x = rPole(p);
    P.push(G.cyl([x, .2, -.36], [x, .56, -.36], .045, F({ ds: 1.4 })));
    P.push(G.box([x - .075, .64, -.48], [x + .075, .86, -.22], { edgeOnly: true }));
    P.push(fnp((o, s, es) => { for (let k = 0; k < 8; k++) { const y = .66 + k * .025; seg(o, [x - .07, y, -.47], [x + .07, y, -.47], es); seg(o, [x - .07, y, -.47], [x - .07, y, -.23], es); seg(o, [x + .07, y, -.47], [x + .07, y, -.23], es); }
      for (let k = 0; k < 3; k++) seg(o, [x - .07, .86, -.44 + k * .1], [x + .07, .86, -.44 + k * .1], es); }));
    P.push(fnp((o, s, es) => { for (const y of RSY) { slathe(o, x, y, [[-.52, .04], [-.58, .04]], 0, TAU, s, es); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; seg(o, [x + Math.cos(a) * .042, y + Math.sin(a) * .042, -.58], [x + Math.cos(a) * .042, y + Math.sin(a) * .042, -.66], es); } } }, { ds: 1.2 }));
  }
  return P;
}
/* a truck's racking offset (out of the cubicle, local +z): the incomer racked in from the start; each feeder from its
   test position in along T_RACK (the port board a beat later) */
const rackOff = (j, u, m) => j ? RTRAV * (1 - kk(u, T_RACK[0] + (j - 1) * .3 + m * .2, T_RACK[1] - .3 + (j - 1) * .3 + m * .2)) : 0;
const fdrT = (j, m) => T_FDR + (j - 1) * .14 + m * .3;      // feeder j's breaker closes
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

/* ================= the reactor plant (ship frame; the starboard loop, the port one its mirror) ================= */
const RV = [0, 18.0];                                    // reactor vessel axis (x, z)
const RVC = [20 * DEG, 250 * DEG];                       // kept sector (ship xz angle: 0 = +x, 90° = +z): the aft-starboard quarter cut away
const SGX = 4.4, SGZ = 19.0;                             // starboard steam generator axis
const SGC = [-70 * DEG, 160 * DEG];                      // its kept sector: the aft-inboard quarter cut away
const PZ = [2.4, 21.3];                                  // pressurizer
const RCPX = 3.5, RCPZ = 16.0, RCPY = -3.35;             // starboard reactor coolant pump (impeller centre)
const TGO = [3.1, -1.3, 24.4];                           // starboard turbine-generator: axis origin at the HP inlet end, +z fwd
const TGC = [200 * DEG, 430 * DEG];                      // kept sector of its casings (local xy angle): the upper inboard quarter cut away
const MIRX = X.make([-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]);
const PITCH = .215, CORE0 = -3.45, CORE1 = -2.0, GRIDS = [-3.15, -2.85, -2.55, -2.25];
const ASM = []; for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 10) ASM.push([i, j]);   // 37 fuel assemblies
const RODS = [[0, 0, 2], [2, 0, 1], [-2, 0, 1], [0, 2, 1], [0, -2, 1], [2, 2, 0], [-2, 2, 0], [2, -2, 0], [-2, -2, 0]];   // [i, j, bank]
const RODQ = [[-.055, -.055], [.055, -.055], [.055, .055], [-.055, .055]];
/* the turbine set (local): HP 7 stages, LP double flow 2 x 5 about LZC, the condenser under it, the generator */
const HPS = []; for (let k = 0; k < 7; k++) HPS.push({ z: .35 + k * .23, h: .3, t: .42 + .025 * k, n: 64 + 4 * k, c: .055 });
const LZC = 4.0, LPS = [.22, .49, .76, 1.03, 1.3].map((d, k) => ({ d, h: .42, t: [.66, .76, .88, 1.02, 1.2][k], n: [72, 64, 56, 52, 48][k], c: [.07, .08, .09, .11, .13][k] }));
const GZ0 = 6.6, GZ1 = 9.6;                              // generator core
/* the stator (round 3): 36 slots, two bars a slot (top r .64, bottom .70), 60 deg phase belts (each phase's + belt
   centred at 90 - 120 p deg, its - belt opposite: C- A+ B- C+ A- B+ round from 0); the end windings (ENDW, built in
   coils) a basket of five-sixths pitch coils */
const NSL = 36, SLW = 1.9 * DEG, SLR = [.64, .7], SPAN = 15;
const SLA = k => (k + .5) / NSL * TAU;
const SLP = [], SLS = [];
for (let k = 0; k < NSL; k++) { const a = SLA(k); let best = 9, bp = 0, bs = 1;
  for (let p = 0; p < 3; p++) for (const sg of [1, -1]) { const c = PI / 2 - p * TAU / 3 + (sg < 0 ? PI : 0), d = Math.abs(((a - c) % TAU + TAU + PI) % TAU - PI); if (d < best) { best = d; bp = p; bs = sg; } }
  SLP.push(bp); SLS.push(bs); }
const ENDW = [];
const CX0 = 2.6, CX1 = 5.4;                              // condenser shell
const CTX = [-1.0, -.6, -.2, .2, .6, 1.0], CTY = [-1.75, -2.15, -2.55, -2.95];
const SEPS = [[0, 0]]; for (let k = 0; k < 6; k++) SEPS.push([Math.cos(k * PI / 3) * .45, Math.sin(k * PI / 3) * .45]);
const UB = .55, SGW = 1.75, PZW = .75;                   // U-bend centres, the steam generator's and the pressurizer's water levels
const UT = []; for (const zo of [-.6, -.4, -.2, 0, .2, .4, .6]) for (const a of [.14, .25, .36, .47, .58, .69, .8]) if (Math.hypot(a + .02, zo) < .86) UT.push([zo, a]);
/* the railgun switchboards under the forward launcher (local as the others: x along the line-up, z out of the front) */
const RSW = { o: [3.4, -3.6, 38.0], ry: PI, n: 3 };
/* pipes (starboard, ship frame; the corners rounded) */
const PIPES = {
  hot: { P: [[1.9, -1.05, 18.43], [2.9, -1.05, 18.66], [3.45, -1.45, 18.84], [3.83, -2.3, 19.0]], r: .28, rf: .5 },
  cold1: { P: [[4.97, -2.3, 19.0], [5.25, -2.8, 18.75], [5.2, -3.35, 17.4], [4.5, -3.35, 16.3], [4.12, -3.35, 16.0]], r: .26, rf: .5 },
  cold2: { P: [[2.88, -3.35, 16.0], [2.35, -3.35, 16.3], [1.9, -2.0, 16.75], [1.65, -1.05, 17.06]], r: .26, rf: .45 },
  steam: { P: [[4.4, 3.25, 19.0], [4.4, 3.45, 19.0], [4.4, 3.45, 19.7], [3.75, 3.4, 21.0], [3.5, 3.4, 23.6], [3.25, 2.4, 24.5], [3.1, .6, 24.85], [3.1, -.3, 24.89]], r: .2, rf: .5 },
  feed: { P: [[1.0, -4.0, 30.7], [1.0, -3.6, 30.7], [1.0, -3.6, 25.4], [1.0, -.4, 24.9], [1.25, 1.35, 24.3], [2.6, 1.45, 22.4], [4.4, 1.45, 21.0], [4.4, 1.45, 20.18]], r: .11, rf: .45 },
  cond: { P: [[2.55, -5.68, 29.0], [2.55, -5.68, 29.5], [1.0, -5.0, 29.75], [1.0, -4.3, 30.1], [1.0, -4.3, 30.35]], r: .1, rf: .25 },
  seaIn: { P: [[7.6, -4.3, 26.95], [4.58, -4.3, 26.95]], r: .2, rf: .3 },
  seaOut: { P: [[4.58, -3.25, 29.95], [7.55, -3.25, 29.95]], r: .2, rf: .3 },
};
const PLP = {};                                          // the smoothed centre lines (for the flows)

/* ================= geometry helpers ================= */
/* a lathe about a vertical axis through (cx, cz): profile [[y, r, ring?], ...]; sector [a0, a1] in the ship's xz plane
   (0 = +x, 90° = +z); inner: normals pointing in (an inside wall seen through a cut); a station with ring 0 has no
   edge arc */
function arcY(o, cx, y, cz, r, a0, a1, es) { const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) * r / es)); for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * (k + .5) / n; o.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 0, 0); } }
function vlathe(o, cx, cz, st, a0, a1, s, es, opt) {
  const full = a1 - a0 >= TAU - 1e-6, nf = opt && opt.noFace, ne = opt && opt.noEdge, sg = opt && opt.inner ? -1 : 1;
  for (let i = 0; i < st.length - 1 && !nf; i++) {
    const y0 = st[i][0], r0 = st[i][1], y1 = st[i + 1][0], r1 = st[i + 1][1], dy = y1 - y0, dr = r1 - r0, L = Math.hypot(dy, dr); if (L < 1e-6) continue;
    const na = Math.max(1, Math.round(L / s)), ky = -dr / L * sg, kr = dy / L * sg;
    for (let a = 0; a < na; a++) {
      const v = (a + .5) / na, yy = y0 + dy * v, rr = r0 + dr * v, nt = Math.max(3, Math.round(Math.abs(a1 - a0) * rr / s));
      for (let t = 0; t < nt; t++) { const th = a0 + (a1 - a0) * (t + .5 + (full && (a & 1) ? .5 : 0)) / nt, c = Math.cos(th), sn = Math.sin(th); o.push(cx + c * rr, yy, cz + sn * rr, c * kr, ky, sn * kr); }
    }
  }
  if (!ne) for (const q of st) if (q[1] > .005 && q[2] !== 0) arcY(o, cx, q[0], cz, q[1], a0, a1, es);
  if (!full && !(opt && opt.noCut)) for (const a of [a0, a1]) { const c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < st.length - 1; i++) seg(o, [cx + c * st[i][1], st[i][0], cz + sn * st[i][1]], [cx + c * st[i + 1][1], st[i + 1][0], cz + sn * st[i + 1][1]], es); }
}
function sph(yc, Rr, a0, a1, n, ev) { const o = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; o.push([yc + Rr * Math.sin(a), Rr * Math.cos(a), k % (ev || 2) ? 0 : 1]); } return o; }
function prof(st, y) { for (let i = 0; i < st.length - 1; i++) { const a = st[i], b = st[i + 1]; if (Math.abs(b[0] - a[0]) > 1e-6 && y >= Math.min(a[0], b[0]) && y <= Math.max(a[0], b[0])) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); } return 0; }
function sqY(o, x, y, z, h, es) { seg(o, [x - h, y, z - h], [x + h, y, z - h], es); seg(o, [x + h, y, z - h], [x + h, y, z + h], es); seg(o, [x + h, y, z + h], [x - h, y, z + h], es); seg(o, [x - h, y, z + h], [x - h, y, z - h], es); }
function sqZ(o, x, y, z, hx, hy, es) { seg(o, [x - hx, y - hy, z], [x + hx, y - hy, z], es); seg(o, [x + hx, y - hy, z], [x + hx, y + hy, z], es); seg(o, [x + hx, y + hy, z], [x - hx, y + hy, z], es); seg(o, [x - hx, y + hy, z], [x - hx, y - hy, z], es); }
function helix(o, cx, cz, r, y0, y1, a0, turns, es) { const L = Math.hypot(TAU * r * turns, y1 - y0), n = Math.max(4, Math.ceil(L / es)); for (let k = 0; k < n; k++) { const f = (k + .5) / n, a = a0 + TAU * turns * f; o.push(cx + Math.cos(a) * r, y0 + (y1 - y0) * f, cz + Math.sin(a) * r, 0, 0, 0); } }
/* the corners of a polyline rounded (quadratic), as a poly with lengths */
function smooth(P, rf) {
  const out = [P[0].slice()], add = p => { const l = out[out.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]) > 1e-4) out.push(p); };
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], d1 = V.dist(a, b), d2 = V.dist(b, c), d = Math.min(rf, d1 * .45, d2 * .45);
    const p0 = V.lerp(b, a, d / d1), p1 = V.lerp(b, c, d / d2);
    for (let k = 0; k <= 8; k++) { const t = k / 8, m = 1 - t; add([m * m * p0[0] + 2 * m * t * b[0] + t * t * p1[0], m * m * p0[1] + 2 * m * t * b[1] + t * t * p1[1], m * m * p0[2] + 2 * m * t * b[2] + t * t * p1[2]]); }
  }
  add(P[P.length - 1].slice());
  return P_.poly(out);
}
const TQ2 = [0, 0, 0];
function tangentAt(pl, d, out) { P_.polyAt(pl, Math.max(0, d - .015), TQ2); P_.polyAt(pl, Math.min(pl.L, d + .015), out); const x = out[0] - TQ2[0], y = out[1] - TQ2[1], z = out[2] - TQ2[2], l = Math.hypot(x, y, z) || 1; out[0] = x / l; out[1] = y / l; out[2] = z / l; return out; }
/* a pipe along a poly: rings of lit dots, flange rings every fl metres and at the ends */
function tube(o, pl, r, s, es, fl) {
  const n = Math.max(1, Math.round(pl.L / s)), nt = Math.max(6, Math.round(TAU * r / s)), T3 = [0, 0, 0], C3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const d = (i + .5) / n * pl.L; P_.polyAt(pl, d, C3); tangentAt(pl, d, T3);
    const [U, W] = P_.perp(T3);
    for (let k = 0; k < nt; k++) { const a = (k + .5 * (i & 1)) / nt * TAU, c = Math.cos(a), sn = Math.sin(a), nx = U[0] * c + W[0] * sn, ny = U[1] * c + W[1] * sn, nz = U[2] * c + W[2] * sn;
      o.push(C3[0] + nx * r, C3[1] + ny * r, C3[2] + nz * r, nx, ny, nz); }
  }
  const nr = Math.max(1, Math.round(pl.L / (fl || 1.4)));
  for (let i = 0; i <= nr; i++) { const d = Math.min(pl.L - .001, Math.max(.001, i / nr * pl.L)); P_.polyAt(pl, d, C3); tangentAt(pl, d, T3); const [U, W] = P_.perp(T3); P_.ringL(o, C3, U, W, r * 1.1, es); }
}
const pipe = (P, r, rf, o) => fnp((q, s, es) => tube(q, smooth(P, rf), r, s, es), Object.assign({ ds: 1.6 }, o || {}));
/* a U-tube in the plane z: the hot leg at x0 - a, the bend, the cold leg at x0 + a */
function uTube(o, x0, z, a, es) { seg(o, [x0 - a, -1.0, z], [x0 - a, UB, z], es); seg(o, [x0 + a, -1.0, z], [x0 + a, UB, z], es); const n = Math.max(4, Math.ceil(PI * a / es)); for (let k = 0; k < n; k++) { const f = PI - PI * (k + .5) / n; o.push(x0 + Math.cos(f) * a, UB + Math.sin(f) * a, z, 0, 0, 0); } }
function uAt(x0, z, a, q, out) { const L1 = UB + 1.0, L2 = PI * a, d = q * (2 * L1 + L2); if (d < L1) { out[0] = x0 - a; out[1] = -1.0 + d; } else if (d < L1 + L2) { const f = PI - (d - L1) / a; out[0] = x0 + Math.cos(f) * a; out[1] = UB + Math.sin(f) * a; } else { out[0] = x0 + a; out[1] = UB - (d - L1 - L2); } out[2] = z; return out; }

/* ================= reactor vessel, internals, drives, shield ================= */
const RV_OUT = [...sph(-3.7, 1.3, -PI / 2, 0, 10), [-1.55, 1.3], [-1.55, 1.42], [-.62, 1.42], [-.62, 1.3], [-.45, 1.3], [-.45, 1.62], [-.15, 1.62], [-.15, 1.3], ...sph(-.15, 1.3, 0, PI / 2, 10)];
const RV_IN = [...sph(-3.7, 1.15, -PI / 2, 0, 10), [-.45, 1.15]];
const NOZ = [];
{ const th = Math.atan2(SGZ - RV[1], SGX - RV[0]), tc = Math.atan2(RCPZ - RV[1], RCPX - RV[0]); NOZ.push([th, .3, -1.05], [PI - th, .3, -1.05], [tc, .27, -1.05], [PI - tc, .27, -1.05]); }
const yHead = r => -.15 + Math.sqrt(Math.max(0, 1.69 - r * r));
function vesselPrims() {
  const P = [], cx = RV[0], cz = RV[1], a0 = RVC[0], a1 = RVC[1];
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, RV_OUT, a0, a1, s, es), { ds: 2.4 }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, RV_IN, a0, a1, s, es, { inner: true, noCut: true, noEdge: true }), { ds: 3.4 }));
  // the cut faces: the inner profile and the wall's thickness hatched
  P.push(fnp((o, s, es) => { for (const a of [a0, a1]) { const c = Math.cos(a), sn = Math.sin(a);
    for (let y = -4.75; y < -.5; y += .16) { const ro = prof(RV_OUT, y), ri = prof(RV_IN, y); if (ri > .05) seg(o, [cx + c * ri, y, cz + sn * ri], [cx + c * ro, y, cz + sn * ro], es); }
    for (let i = 0; i < RV_IN.length - 1; i++) seg(o, [cx + c * RV_IN[i][1], RV_IN[i][0], cz + sn * RV_IN[i][1]], [cx + c * RV_IN[i + 1][1], RV_IN[i + 1][0], cz + sn * RV_IN[i + 1][1]], es); } }, F()));
  // closure studs round the flange
  P.push(fnp((o, s, es) => { for (let k = 0; k < 32; k++) { const a = k / 32 * TAU; if (!inSec(a, a0, a1)) continue; const c = Math.cos(a), sn = Math.sin(a);
    seg(o, [cx + c * 1.52, -.52, cz + sn * 1.52], [cx + c * 1.52, .0, cz + sn * 1.52], es); arcY(o, cx + c * 1.52, 0, cz + sn * 1.52, .04, 0, TAU, es); } }, F()));
  // nozzles: two outlets to the hot legs, two inlets from the cold legs
  for (const [th, r, y] of NOZ) { const c = Math.cos(th), sn = Math.sin(th); P.push(G.cyl([cx + c * 1.25, y, cz + sn * 1.25], [cx + c * 1.92, y, cz + sn * 1.92], r + .06, { ds: 1.6 })); }
  // core barrel, the lower core plate, the upper core and support plates (rings), the skirt
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-3.62, 1.0], [-.62, 1.0, 0], [-.55, 1.0], [-.55, 1.12]], a0, a1, s, es), { ds: 4 }));
  P.push(fnp((o, s, es) => { arcY(o, cx, -3.6, cz, .98, 0, TAU, es); arcY(o, cx, -1.93, cz, .98, a0, a1, es); arcY(o, cx, -.6, cz, .98, a0, a1, es); arcY(o, cx, -.6, cz, .3, 0, TAU, es);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + .2; if (inSec(a, a0, a1)) seg(o, [cx + Math.cos(a) * .3, -.6, cz + Math.sin(a) * .3], [cx + Math.cos(a) * .98, -.6, cz + Math.sin(a) * .98], es); } }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-3.6, .98], [-3.6, .02]], 0, TAU, s, es, { noEdge: true }), { ds: 3.5 }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-5.15, .85], [-4.69, .85]], 0, TAU, s, es), { ds: 2.5 }));
  // control rod guide tubes (upper internals)
  P.push(fnp((o, s, es) => { for (const [i, j] of RODS) vlathe(o, cx + i * PITCH, cz + j * PITCH, [[-1.93, .07], [-.6, .07]], 0, TAU, s, es); }, { ds: 1.6 }));
  // control rod drive mechanisms on the head: pressure housings, the stepping coil stacks, the rod position coils
  P.push(fnp((o, s, es) => { for (const [i, j] of RODS) { const x = cx + i * PITCH, z = cz + j * PITCH, yh = yHead(Math.hypot(i, j) * PITCH);
    vlathe(o, x, z, [[yh - .05, .085, 0], [1.82, .085], [1.84, .13], [2.6, .13], [2.62, .085], [3.35, .085], [3.4, .05]], 0, TAU, s, es);
    arcY(o, x, 2.08, z, .135, 0, TAU, es); arcY(o, x, 2.34, z, .135, 0, TAU, es); for (const y of [2.8, 2.92, 3.04, 3.16]) arcY(o, x, y, z, .1, 0, TAU, es); } }, { ds: 1.3 }));
  P.push(fnp((o, s, es) => { arcY(o, cx, 3.2, cz, .82, 0, TAU, es); for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; seg(o, [cx + Math.cos(a) * .82, 3.2, cz + Math.sin(a) * .82], [cx + Math.cos(a) * 1.5, -.15, cz + Math.sin(a) * 1.5], es); }
    for (const [i, j] of RODS) seg(o, [cx + i * PITCH, 3.4, cz + j * PITCH], [cx + i * PITCH * .5, Y2, cz + j * PITCH * .5], es); }, F()));
  // the primary shield tank round the vessel (cut with it)
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-5.15, 2.15], [-.8, 2.15], [-.8, 1.95]], a0, a1, s, es), { ds: 6 }));
  P.push(fnp((o, s, es) => { for (let a = a0; a <= a1 + 1e-6; a += 15 * DEG) seg(o, [cx + Math.cos(a) * 2.15, -5.15, cz + Math.sin(a) * 2.15], [cx + Math.cos(a) * 2.15, -.8, cz + Math.sin(a) * 2.15], es); for (let y = -4.6; y < -.8; y += .9) arcY(o, cx, y, cz, 2.15, a0, a1, es); }, F()));
  return P;
}
/* the core: 37 fuel assemblies (nozzles, corner posts, spacer grids, a 4 x 4 of rods each), the top nozzles lit */
function corePrims() {
  const P = [], cx = RV[0], cz = RV[1], h = .1;
  P.push(fnp((o, s, es) => { for (const [i, j] of ASM) { const x = cx + i * PITCH, z = cz + j * PITCH;
    for (const y of [CORE0, CORE1, CORE1 + .06]) sqY(o, x, y, z, h, es);
    for (const [dx, dz] of [[-h, -h], [h, -h], [h, h], [-h, h]]) seg(o, [x + dx, CORE0, z + dz], [x + dx, CORE1 + .06, z + dz], es); } }));
  P.push(fnp((o, s, es) => { for (const [i, j] of ASM) for (const y of GRIDS) sqY(o, cx + i * PITCH, y, cz + j * PITCH, h * .98, es); }, F()));
  P.push(fnp((o, s, es) => { for (const [i, j] of ASM) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const x = cx + i * PITCH + (a - 1) * .06, z = cz + j * PITCH + (b - 1) * .06; seg(o, [x, CORE0 + .04, z], [x, CORE1 - .02, z], es * 2.4); } }, F()));
  P.push(fnp((o, s) => { for (const [i, j] of ASM) { const x = cx + i * PITCH, z = cz + j * PITCH, w = h * .85, y = CORE1 + .065; P_.quadL(o, [x - w, y, z - w], [x + w, y, z - w], [x + w, y, z + w], [x - w, y, z + w], [0, 1, 0], s); } }, { ds: 1.4 }));
  return P;
}
/* one bank of control rod clusters (ship frame, inserted; drawn lifted by the withdrawal) */
function rodPrims(bank) {
  const P = [], cx = RV[0], cz = RV[1];
  for (const [i, j, b] of RODS) { if (b !== bank) continue; const x = cx + i * PITCH, z = cz + j * PITCH;
    P.push(fnp((o, s, es) => { for (const [dx, dz] of RODQ) vlathe(o, x + dx, z + dz, [[-3.42, .004, 0], [-3.38, .019], [-2.0, .019]], 0, TAU, s, es); }, { ds: .8 }));
    P.push(fnp((o, s, es) => { vlathe(o, x, z, [[-2.0, .05], [-1.88, .05], [-1.88, .025, 0], [1.9, .025]], 0, TAU, s, es);
      for (const [dx, dz] of RODQ) { seg(o, [x, -1.94, z], [x + dx, -1.99, z + dz], es); seg(o, [x, -1.9, z], [x + dx, -1.97, z + dz], es); } }, { ds: 1.2 })); }
  return P;
}

/* ================= steam generator (starboard): shell (cut), channel head, tube sheet, U-tube bundle, wrapper,
   feedwater ring, swirl-vane separators and the dryer ================= */
const SG_OUT = [...sph(-1.55, .95, -PI / 2, 0, 8), [-1.3, .95], [-1.0, .95, 0], [1.2, .95], [1.7, 1.32], [2.75, 1.32], ...[0, 1, 2, 3, 4, 5, 6].map(k => { const a = k / 6 * PI / 2; return [2.75 + .5 * Math.sin(a), 1.32 * Math.cos(a), k % 2 ? 0 : 1]; })];
function sgPrims() {
  const P = [], cx = SGX, cz = SGZ, a0 = SGC[0], a1 = SGC[1];
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, SG_OUT, a0, a1, s, es), { ds: 2.6 }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-1.0, .87], [1.2, .87], [1.7, 1.24], [2.75, 1.24]], a0, a1, s, es, { inner: true, noCut: true, noEdge: true }), { ds: 4.5 }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[3.2, .24], [3.42, .24], [3.42, .2, 0]], 0, TAU, s, es), { ds: 1.5 }));
  P.push(G.cyl([cx - .45, -2.05, cz], [cx - .62, -2.36, cz], .3, { ds: 1.6 }), G.cyl([cx + .45, -2.05, cz], [cx + .62, -2.36, cz], .28, { ds: 1.6 }));
  P.push(G.cyl([cx, 1.45, cz + .9], [cx, 1.45, cz + 1.18], .13, { ds: 1.5 }));
  // tube sheet and the channel head's divider plate (hot half inboard, cold half outboard)
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-1.0, .95], [-1.0, .02]], a0, a1, s, es), { ds: 2.2 }));
  P.push(fnp((o, s, es) => { arcY(o, cx, -1.3, cz, .95, 0, TAU, es); for (let y = -1.3; y > -2.45; y -= .23) { const w = Math.sqrt(Math.max(0, .9025 - (y + 1.55) * (y + 1.55))); seg(o, [cx, y, cz - w], [cx, y, cz + w], es); } }, F()));
  // the U-tube bundle, the wrapper, the support plates
  P.push(fnp((o, s, es) => { for (const y of [-.9, -.3, .3, 1.2]) arcY(o, cx, y, cz, .88, a0, a1, es); for (let k = 0; k < 16; k++) { const a = a0 + (a1 - a0) * k / 15; seg(o, [cx + Math.cos(a) * .88, -.9, cz + Math.sin(a) * .88], [cx + Math.cos(a) * .88, 1.2, cz + Math.sin(a) * .88], es); } }));
  // feedwater ring and its J-tubes
  P.push(fnp((o, s, es) => { arcY(o, cx, 1.45, cz, .78, 0, TAU, es); arcY(o, cx, 1.49, cz, .78, 0, TAU, es); for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; seg(o, [cx + Math.cos(a) * .78, 1.49, cz + Math.sin(a) * .78], [cx + Math.cos(a) * .78, 1.62, cz + Math.sin(a) * .78], es); } }, F()));
  // separators on their deck plate, swirl vanes inside; the chevron dryer above
  P.push(fnp((o, s, es) => { vlathe(o, cx, cz, [[1.9, 1.28], [1.9, .02]], a0, a1, s, es, { noEdge: true }); for (const [dx, dz] of SEPS) vlathe(o, cx + dx, cz + dz, [[1.9, .16], [2.42, .16], [2.42, .11]], 0, TAU, s, es); }, { ds: 2.4 }));
  P.push(fnp((o, s, es) => { for (const [dx, dz] of SEPS) for (let k = 0; k < 3; k++) helix(o, cx + dx, cz + dz, .12, 1.95, 2.35, k * TAU / 3, 1.3, es); }, F()));
  P.push(fnp((o, s, es) => { const y0 = 2.5, y1 = 2.86, w = .78; for (const zz of [-.45, 0, .45]) for (let x = -w; x < w - .01; x += .13) for (let k = 0; k < 6; k++) seg(o, [cx + x + (k & 1 ? .065 : 0), y0 + k * (y1 - y0) / 6, cz + zz], [cx + x + (k & 1 ? 0 : .065), y0 + (k + 1) * (y1 - y0) / 6, cz + zz], es);
    sqY(o, cx, y0, cz, w, es); sqY(o, cx, y1, cz, w, es); }, F()));
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4, c = Math.cos(a), sn = Math.sin(a); P.push(G.cyl([cx + c * .72, -1.6, cz + sn * .72], [cx + c * .9, YL, cz + sn * .9], .06, F())); }
  return P;
}
const utPrims = () => [fnp((o, s, es) => { for (const [zo, a] of UT) uTube(o, SGX, SGZ + zo, a, es * 1.5); }, F())];
/* pressurizer (starboard only): shell (cut), heaters, spray head, relief valves, the surge line to the hot leg */
const PZ_OUT = [...sph(-1.5, .55, -PI / 2, 0, 6), [2.0, .55], ...sph(2.0, .55, 0, PI / 2, 6)];
const PZH = []; for (let k = 0; k < 13; k++) { const r = k ? (k < 7 ? .18 : .34) : 0, a = k < 7 ? k / 6 * TAU : (k - 7) / 6 * TAU + .5; PZH.push([PZ[0] + Math.cos(a) * r, PZ[1] + Math.sin(a) * r]); }
function pzPrims() {
  const P = [], cx = PZ[0], cz = PZ[1], a0 = RVC[0], a1 = RVC[1];
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, PZ_OUT, a0, a1, s, es), { ds: 2.4 }));
  P.push(fnp((o, s, es) => { for (const [x, z] of PZH) { seg(o, [x, -2.15, z], [x, -.75, z], es); arcY(o, x, -.75, z, .016, 0, TAU, es); } }, F()));
  P.push(fnp((o, s, es) => { vlathe(o, cx, cz, [[2.3, .05], [2.55, .05]], 0, TAU, s, es); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; seg(o, [cx, 2.3, cz], [cx + Math.cos(a) * .18, 2.12, cz + Math.sin(a) * .18], es); } }, F()));
  P.push(fnp((o, s, es) => { for (const dx of [-.18, .18]) { vlathe(o, cx + dx, cz, [[2.5, .07], [2.85, .07], [2.85, .1], [3.0, .1]], 0, TAU, s, es); seg(o, [cx + dx, 3.0, cz], [cx + dx, Y2, cz], es); } }, { ds: 1.5 }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-2.3, .1], [-2.05, .1]], 0, TAU, s, es), { ds: 1.5 }));
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; P.push(G.cyl([cx + Math.cos(a) * .4, -1.9, cz + Math.sin(a) * .4], [cx + Math.cos(a) * .5, YL, cz + Math.sin(a) * .5], .05, F())); }
  P.push(pipe([[2.4, -2.3, 21.3], [2.4, -2.55, 20.9], [2.85, -2.55, 19.5], [2.95, -1.35, 18.75]], .09, .3));
  return P;
}
/* reactor coolant pump (starboard): volute casing (cut), the canned motor with its cooling ribs, nozzles, the base */
function rcpPrims() {
  const P = [], cx = RCPX, cz = RCPZ, a0 = RVC[0], a1 = RVC[1];
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-3.85, .2], [-3.78, .42], [-3.55, .5], [-3.15, .5], [-2.98, .4], [-2.95, .27]], a0, a1, s, es), { ds: 1.8 }));
  P.push(fnp((o, s, es) => vlathe(o, cx, cz, [[-2.95, .3], [-2.9, .4], [-1.55, .4, 0], [-1.5, .32], [-1.35, .22], [-1.3, .02]], 0, TAU, s, es), { ds: 2.2 }));
  P.push(fnp((o, s, es) => { for (let y = -2.78; y < -1.6; y += .12) arcY(o, cx, y, cz, .43, 0, TAU, es); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; seg(o, [cx + Math.cos(a) * .43, -2.85, cz + Math.sin(a) * .43], [cx + Math.cos(a) * .43, -1.6, cz + Math.sin(a) * .43], es); } }, F()));
  P.push(G.cyl([cx + .42, RCPY, cz], [cx + .62, RCPY, cz], .28, { ds: 1.5 }), G.cyl([cx - .42, RCPY, cz], [cx - .62, RCPY, cz], .28, { ds: 1.5 }));
  P.push(G.box([cx - .6, YL, cz - .6], [cx + .6, -3.85, cz + .6], { edgeOnly: true }));
  return P;
}
/* the pump's impeller and shaft (local: the pump axis, y up from the impeller's centre) */
const rcpRotor = () => [G.blades([0, 0, 0], [0, 1, 0], 7, .07, .44, { chord: .3, pitch: .4 }), fnp((o, s, es) => { vlathe(o, 0, 0, [[-.12, .02], [-.08, .09], [.12, .09], [.12, .045, 0], [1.95, .045]], 0, TAU, s, es); seg(o, [.047, .12, 0], [.047, 1.95, 0], es * .7); }, { ds: 1.2 })];
/* the loop's pipework (starboard): hot leg, cold legs, main steam, feed, condensate, seawater */
function loopPrims() {
  const P = [];
  for (const k of ['hot', 'cold1', 'cold2', 'steam', 'feed', 'cond', 'seaIn', 'seaOut']) { const p = PIPES[k]; P.push(pipe(p.P, p.r, p.rf, { ds: k === 'steam' || k === 'feed' ? 1.4 : 1.7 })); }
  // the main steam line's isolation valve (by the bulkhead), sea valves at the hull, the feed check valve
  P.push(G.box([3.32, 3.1, 23.0], [3.72, 3.7, 23.5], { ds: 2 }), G.cyl([3.52, 3.7, 23.25], [3.52, 4.05, 23.25], .05, F()));
  for (const [x, y, z] of [[7.0, -4.3, 26.95], [7.0, -3.25, 29.95]]) P.push(G.box([x - .25, y - .3, z - .3], [x + .25, y + .3, z + .3], { ds: 2 }), G.cyl([x, y + .3, z], [x, y + .7, z], .04, F()), G.line([[x - .2, y + .7, z], [x + .2, y + .7, z]], F()));
  return P;
}
/* the feed pump set (starboard, on the lower level inboard of the generator): pump, coupling, motor */
function feedPumpPrims() {
  const P = [], x = 1.0, y = -4.3;
  P.push(G.box([x - .4, YL, 30.25], [x + .4, YL + .12, 32.7], { ds: 3 }));
  P.push(G.lathe([x, y, 30.35], [0, 0, 1], [[0, .2], [.12, .3], [.5, .3], [.6, .18]], { caps: true, ds: 1.6 }));
  P.push(fnp((o, s, es) => { for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; seg(o, [x + Math.cos(a) * .2, y + Math.sin(a) * .2, 30.95], [x + Math.cos(a) * .2, y + Math.sin(a) * .2, 31.3], es); } arcZ(o, x, y, 30.95, .2, 0, TAU, es); arcZ(o, x, y, 31.3, .2, 0, TAU, es); }, F()));
  P.push(G.lathe([x, y, 31.3], [0, 0, 1], [[0, .3], [.05, .34], [1.2, .34], [1.3, .2]], { caps: true, ds: 2 }));
  P.push(fnp((o, s, es) => { for (let z = 31.45; z < 32.5; z += .1) arcZ(o, x, y, z, .35, 0, TAU, es); }, F()));
  for (const z of [30.4, 31.2, 32.4]) P.push(G.box([x - .35, YL + .12, z - .06], [x + .35, y - .2, z + .06], F()));
  return P;
}

/* ================= turbine-generator set (local: the set's axis, origin at the HP inlet end, +z fwd) ================= */
const COILS = [];
/* the stator's three phases, two full-pitch coils each (2 poles): conductors at t1 and t1 + 180°, end turns round */
function coils() {
  COILS.length = 0;
  for (let p = 0; p < 3; p++) for (let q = 0; q < 2; q++) {
    const t1 = PI / 2 - p * TAU / 3 + (q ? 7.5 : -7.5) * DEG, r = .645, Q = [];
    Q.push([Math.cos(t1) * r, Math.sin(t1) * r, GZ0 - .12], [Math.cos(t1) * r, Math.sin(t1) * r, GZ1 + .12]);
    for (let k = 1; k <= 24; k++) { const f = k / 24, a = t1 + PI * f, rr = r + .12 * Math.sin(PI * f); Q.push([Math.cos(a) * rr, Math.sin(a) * rr, GZ1 + .12 + .26 * Math.sin(PI * f)]); }
    Q.push([Math.cos(t1 + PI) * r, Math.sin(t1 + PI) * r, GZ0 - .12]);
    for (let k = 1; k <= 24; k++) { const f = k / 24, a = t1 + PI + PI * f, rr = r + .12 * Math.sin(PI * f); Q.push([Math.cos(a) * rr, Math.sin(a) * rr, GZ0 - .12 - .26 * Math.sin(PI * f)]); }
    COILS.push({ p, q, t1, pl: P_.poly(Q) });
  }
  ENDW.length = 0;
  for (const [zE, dz] of [[GZ0, -1], [GZ1, 1]]) for (let k = 0; k < NSL; k++) {
    const a0 = SLA(k), Q = [[Math.cos(a0) * SLR[0], Math.sin(a0) * SLR[0], zE]];
    for (let j = 0; j <= 20; j++) { const f = j / 20, a = a0 + f * SPAN * TAU / NSL, r = SLR[0] + (SLR[1] - SLR[0]) * f + .1 * Math.sin(PI * f); Q.push([Math.cos(a) * r, Math.sin(a) * r, zE + dz * (.07 + .27 * Math.sin(PI * f))]); }
    const a1 = a0 + SPAN * TAU / NSL; Q.push([Math.cos(a1) * SLR[1], Math.sin(a1) * SLR[1], zE]);
    ENDW.push({ k, pl: P_.poly(Q) });
  }
}
/* ---- the turbines: both casings split on the horizontal joint (y = 0). The lower halves are drawn whole (casing,
   nozzle diaphragms, the joint's flanges and studs), the upper halves ghosted in their own cloud so the rotor reads ---- */
const HPC = [[-.15, .3], [0, .48], [.12, .58], [1.85, .72], [2.0, .62], [2.1, .3]];      // HP casing (outer profile)
const LZ0 = LZC - 1.52, LZ1 = LZC + 1.52, LHW = 1.38;                                   // LP exhaust hood: ends, half width
const LPI = [[LZC + .1, .82], [LZC + .16, .7], [LZC + .49, .8], [LZC + .76, .92], [LZC + 1.03, 1.06], [LZC + 1.3, 1.24], [LZC + 1.42, 1.28]];
const LPI2 = LPI.map(([z, r]) => [2 * LZC - z, r]).reverse();
const LO = [PI, TAU], UP = [0, PI];
/* a sector of a flat annulus at z (lit along nz) */
function sdisc(o, z, r0, r1, a0, a1, s, nz) {
  const nr = Math.max(1, Math.round((r1 - r0) / s));
  for (let k = 0; k < nr; k++) { const rr = r0 + (k + .5) / nr * (r1 - r0), nt = Math.max(3, Math.round((a1 - a0) * rr / s));
    for (let t = 0; t < nt; t++) { const th = a0 + (a1 - a0) * (t + .5) / nt; o.push(Math.cos(th) * rr, Math.sin(th) * rr, z, 0, 0, nz); } }
}
/* the joint flange along a casing whose radius runs r(z): a flat band each side at y = 0 (width w), its edges, studs
   with nuts every pitch metres */
function jointZ(o, rz, za, zb, w, s, es, pitch) {
  for (const sx of [-1, 1]) {
    const n = Math.max(2, Math.round((zb - za) / s));
    for (let i = 0; i < n; i++) { const z = za + (zb - za) * (i + .5) / n, r = rz(z); for (let x = r + s * .5; x < r + w; x += s) o.push(sx * x, 0, z, 0, 1, 0); }
    const ne = Math.max(2, Math.round((zb - za) / es));
    for (let i = 0; i <= ne; i++) { const z = za + (zb - za) * i / ne, r = rz(z); o.push(sx * r, .002, z, 0, 0, 0, sx * (r + w), .002, z, 0, 0, 0, sx * (r + w), -.06, z, 0, 0, 0); }
    for (let z = za + pitch * .5; z < zb; z += pitch) { const x = sx * (rz(z) + w * .55); seg(o, [x, -.08, z], [x, .09, z], es * .6); arcY(o, x, .05, z, .028, 0, TAU, es * .6); arcY(o, x, .08, z, .028, 0, TAU, es * .6); }
  }
}
const hpR = z => prof(HPC, z) || .3;
function hpLower() {
  const P = [];
  P.push(fnp((o, s, es) => slathe(o, 0, 0, HPC, LO[0], LO[1], s, es), { ds: 2.4 }));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, HPC.map(([z, r]) => [z, r - .07]), LO[0], LO[1], s, es, { inner: true, noEdge: true, noCut: true }), { ds: 4 }));
  // nozzle diaphragms (lower halves): the outer ring to the casing, the partitions (nozzle vanes), the inner web and its seal
  P.push(fnp((o, s, es) => { for (const h of HPS) { const z = h.z - .115, ro = hpR(z) - .07;
    sdisc(o, z, h.t + .03, ro, LO[0], LO[1], s * 1.6, 1); sdisc(o, z, .17, h.h - .01, LO[0], LO[1], s * 1.6, 1);
    arcZ(o, 0, 0, z, h.t + .03, LO[0], LO[1], es); arcZ(o, 0, 0, z, h.h - .01, LO[0], LO[1], es); arcZ(o, 0, 0, z, .17, LO[0], LO[1], es);
    for (const a of LO) seg(o, [Math.cos(a) * .17, 0, z], [Math.cos(a) * ro, 0, z], es); } }, { ds: 1.6 }));
  P.push(fnp((o, s, es) => { for (const h of HPS) bladeRow(o, h.z - .115, 52, h.h - .01, h.t + .03, .05, -.95, -.85, s, es, .1, LO[0], LO[1]); }, F({ ds: 1.4 })));
  // end glands (labyrinth rings), the joint
  P.push(fnp((o, s, es) => { for (const z0 of [-.12, 2.02]) for (let k = 0; k < 5; k++) arcZ(o, 0, 0, z0 + k * .02, .16 + (k & 1) * .015, LO[0], LO[1], es); }, F()));
  P.push(fnp((o, s, es) => jointZ(o, hpR, -.1, 2.05, .12, s, es, .14), { ds: 1.4 }));
  // the steam chest and its two leads into the upper half's nozzle box
  P.push(G.box([-.32, .55, .2], [.32, .98, .78], { ds: 2.4 }), G.cyl([0, .98, .49], [0, 1.45, .49], .11, { ds: 1.6 }), G.cyl([0, 1.45, .49], [0, 1.62, .49], .05, F()));
  for (const sx of [-1, 1]) P.push(pipe([[sx * .2, .6, .3], [sx * .42, .5, .25], [sx * .5, .38, .2], [sx * .48, .3, .1]], .055, .1, { ds: 1.4 }));
  return P;
}
function hpUpper() {
  const P = [];
  P.push(fnp((o, s, es) => slathe(o, 0, 0, HPC, UP[0], UP[1], s * 1.6, es, { noCut: true }), { ds: 2.4 }));
  P.push(fnp((o, s, es) => { for (const h of HPS) { const z = h.z - .115; arcZ(o, 0, 0, z, h.t + .03, UP[0], UP[1], es); arcZ(o, 0, 0, z, hpR(z) - .07, UP[0], UP[1], es); } }, F()));
  P.push(fnp((o, s, es) => jointZ(o, hpR, -.1, 2.05, .12, s * 1.6, es, .14), { ds: 1.4 }));
  return P;
}
const lpR = z => z < LZ0 || z > LZ1 ? 0 : LHW;
function lpLower() {
  const P = [];
  // the exhaust hood's lower half: the outboard wall and the end walls down to the condenser neck (the inboard wall
  // open), the inner casing (blade carrier) and the diaphragms of both flows
  P.push(fnp((o, s) => P_.quadL(o, [LHW, -1.45, LZ0], [LHW, -1.45, LZ1], [LHW, 0, LZ1], [LHW, 0, LZ0], [1, 0, 0], s), { ds: 3.4 }));
  P.push(fnp((o, s) => { P_.quadL(o, [-LHW, -1.45, LZ0], [LHW, -1.45, LZ0], [LHW, 0, LZ0], [-LHW, 0, LZ0], [0, 0, -1], s); P_.quadL(o, [-LHW, -1.45, LZ1], [LHW, -1.45, LZ1], [LHW, 0, LZ1], [-LHW, 0, LZ1], [0, 0, 1], s); }, { ds: 5 }));
  P.push(G.line([[LHW, -1.45, LZ0], [LHW, 0, LZ0]]), G.line([[LHW, -1.45, LZ1], [LHW, 0, LZ1]]), G.line([[-LHW, -1.45, LZ0], [-LHW, 0, LZ0]]), G.line([[-LHW, -1.45, LZ1], [-LHW, 0, LZ1]]),
    G.line([[LHW, -1.45, LZ0], [LHW, -1.45, LZ1]]), G.line([[-LHW, -1.45, LZ0], [-LHW, -1.45, LZ1]]));
  P.push(fnp((o, s, es) => { for (let z = LZ0 + .38; z < LZ1 - .2; z += .38) { seg(o, [LHW + .02, -1.45, z], [LHW + .02, 0, z], es); seg(o, [-LHW, -1.45, z], [-LHW, -.05, z], es * 2); } }, F()));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, LPI, LO[0], LO[1], s, es, { inner: true }); slathe(o, 0, 0, LPI2, LO[0], LO[1], s, es, { inner: true }); arcZ(o, 0, 0, LZC, .82, LO[0], LO[1], es); }, { ds: 2.6 }));
  P.push(fnp((o, s, es) => { for (const sd of [-1, 1]) for (const p of LPS) { const z = LZC + sd * (p.d - .13);
    bladeRow(o, z, p.n + 8, p.h, p.t + .03, p.c * .8, -sd * .95, -sd * .7, s, es, .2, LO[0], LO[1]); arcZ(o, 0, 0, z, p.h - .01, LO[0], LO[1], es); } }, F({ ds: 1.6 })));
  P.push(fnp((o, s, es) => jointZ(o, lpR, LZ0, LZ1, .12, s, es, .16), { ds: 1.4 }));
  P.push(fnp((o, s, es) => { for (const z of [LZ0, LZ1]) { for (let x = -LHW - .12; x < LHW + .12; x += s) o.push(x, 0, z + (z < LZC ? -.03 : .03), 0, 1, 0); seg(o, [-LHW - .12, .002, z], [LHW + .12, .002, z], es); } }, { ds: 1.4 }));
  return P;
}
function lpUpper() {
  const P = [];
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[LZ0, LHW], [LZ1, LHW]], UP[0], UP[1], s * 1.8, es, { noCut: true }); for (let z = LZ0 + .38; z < LZ1 - .2; z += .38) arcZ(o, 0, 0, z, LHW + .01, UP[0], UP[1], es); }, { ds: 3 }));
  P.push(fnp((o, s, es) => { for (const z of [LZ0, LZ1]) sdisc(o, z, .3, LHW, UP[0], UP[1], s * 2.2, z < LZC ? -1 : 1); }, { ds: 3 }));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, LPI, UP[0], UP[1], s * 1.8, es, { inner: true, noCut: true }); slathe(o, 0, 0, LPI2, UP[0], UP[1], s * 1.8, es, { inner: true, noCut: true });
    for (const sd of [-1, 1]) for (const p of LPS) arcZ(o, 0, 0, LZC + sd * (p.d - .13), p.t + .03, UP[0], UP[1], es); }, { ds: 2.4 }));
  return P;
}
/* ---- the condenser (single pass: seawater in through the aft waterbox, out through the forward one) ---- */
const CS0 = 2.75, CS1 = 5.25, CWB = .42;                  // tube sheets; the waterboxes' depth
const CHW = 1.2, CY0 = -3.55, CY1 = -1.75, CRR = .45;     // shell: half width, bottom, top, corner radius
/* the shell's section: a rounded rectangle, as (x, y, nx, ny) along its perimeter at spacing sp, scaled by k about
   the section's centre */
function cnSect(sp, k, fn) {
  const cy = (CY0 + CY1) / 2, hw = CHW * k, hh = (CY1 - CY0) / 2 * k, r = CRR * k, ax = hw - r, ay = hh - r;
  const L = 4 * ax + 4 * ay + TAU * r, n = Math.max(12, Math.round(L / sp));
  for (let i = 0; i < n; i++) {
    let d = (i + .5) / n * L, x, y, nx, ny;
    const seg_ = [2 * ax, PI / 2 * r, 2 * ay, PI / 2 * r, 2 * ax, PI / 2 * r, 2 * ay, PI / 2 * r];
    let q = 0; while (d > seg_[q]) { d -= seg_[q]; q++; }
    if (q === 0) { x = -ax + d; y = hh; nx = 0; ny = 1; }
    else if (q === 2) { x = hw; y = ay - d; nx = 1; ny = 0; }
    else if (q === 4) { x = ax - d; y = -hh; nx = 0; ny = -1; }
    else if (q === 6) { x = -hw; y = -ay + d; nx = -1; ny = 0; }
    else { const c = [[ax, ay, PI / 2], [ax, -ay, 0], [-ax, -ay, -PI / 2], [-ax, ay, PI]][(q - 1) / 2], a = c[2] - d / r; nx = Math.cos(a); ny = Math.sin(a); x = c[0] + nx * r; y = c[1] + ny * r; }
    fn(x, cy + y, nx, ny);
  }
}
const cnKeep = (x, y) => !(x < -.3 && y > -3.2);           // the cut: the inboard wall open above the bottom
/* the tube field: two bundles either side of a steam lane, triangular pitch, peaked tops (the steam reaches deep in);
   an air-cooler section (baffled) in each bundle's core */
const CTUBE = [];
{ const p = .085, h = p * .866;
  for (let j = 0; ; j++) { const y = -3.32 + j * h; if (y > -1.95) break;
    for (let i = 0; ; i++) { const x = .13 + i * p + (j & 1 ? p / 2 : 0); if (x > 1.04) break;
      if (y > -2.35 && x < .13 + (y + 2.35) * 1.1) continue;     // the peak: the inner top corner open to the lane
      if (y > -2.2 && x > .95 - (y + 2.2) * .9) continue;        // ... and the outer
      for (const sx of [-1, 1]) CTUBE.push([sx * x, y]); } } }
const CAIR = [[.42, -2.9], [.76, -2.55]];                // the air-cooler box (each bundle, x mirrored)
function cndPrims() {
  const P = [];
  // shell (cut), stiffening ribs, the cut's edges
  P.push(fnp((o, s) => { const n = Math.max(2, Math.round((CS1 - CS0 + .1) / s)); cnSect(s, 1, (x, y, nx, ny) => { if (!cnKeep(x, y)) return; for (let i = 0; i < n; i++) o.push(x, y, CS0 - .05 + (i + .5) / n * (CS1 - CS0 + .1), nx, ny, 0); }); }, { ds: 2.6 }));
  P.push(fnp((o, s, es) => { for (let z = CS0 + .32; z < CS1 - .1; z += .32) cnSect(es, 1.018, (x, y) => { if (cnKeep(x, y)) o.push(x, y, z, 0, 0, 0); }); }, F()));
  P.push(fnp((o, s, es) => { seg(o, [-.3, CY1, CS0], [-.3, CY1, CS1], es); seg(o, [-CHW, -3.2, CS0], [-CHW, -3.2, CS1], es); }));
  // tube sheets: the plate, its flange ring, a hole per tube
  P.push(fnp((o, s, es) => { for (const z of [CS0, CS1]) { cnSect(es, 1, (x, y) => o.push(x, y, z, 0, 0, 0)); cnSect(es, 1.06, (x, y) => o.push(x, y, z, 0, 0, 0));
    for (const [x, y] of CTUBE) arcZ(o, x, y, z, .016, 0, TAU, es * .7); } }));
  P.push(fnp((o, s) => { for (const z of [CS0, CS1]) for (let y = CY0 + .05; y < CY1; y += s) for (let x = -CHW + .05; x < CHW; x += s) o.push(x, y, z + (z < 4 ? -.01 : .01), 0, 0, z < 4 ? -1 : 1); }, { ds: 4.4 }));
  // three support plates: the section and the bundles' outlines; the air-cooler baffles
  P.push(fnp((o, s, es) => { for (const z of [CS0 + .62, (CS0 + CS1) / 2, CS1 - .62]) { cnSect(es * 1.4, .985, (x, y) => o.push(x, y, z, 0, 0, 0));
    for (const [x, y] of CTUBE) if (((x * 97 + y * 31) % 1 + 1) % 1 < .5) o.push(x, y, z, 0, 0, 0); } }, F()));
  P.push(fnp((o, s, es) => { for (const sx of [-1, 1]) { const [a, b] = CAIR, x0 = sx * a[0], x1 = sx * b[0];
    seg(o, [x0, a[1], CS0], [x0, a[1], CS1], es); seg(o, [x1, a[1], CS0], [x1, a[1], CS1], es); seg(o, [x0, b[1], CS0], [x0, b[1], CS1], es); seg(o, [x1, b[1], CS0], [x1, b[1], CS1], es);
    // the air-removal pipe out of each cooler, along the shell to the forward end
    slathe(o, sx * (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, [[CS0 + .1, .035], [CS1 + .02, .035]], 0, TAU, s * 1.5, es); } }, F()));
  // the waterboxes: dished bonnets (cut like the shell), their flanges, manways; the nozzles
  P.push(fnp((o, s, es) => { for (const sd of [-1, 1]) { const z0 = sd < 0 ? CS0 : CS1;
    for (let d = .02; d < CWB; d += s) { const f = d / CWB, k = 1 - .3 * f * f, nz = sd * (.25 + .75 * f); cnSect(s, k, (x, y, nx, ny) => { if (cnKeep(x, y)) o.push(x, y, z0 + sd * d, nx * (1 - f * .6), ny * (1 - f * .6), nz); }); }
    for (let k = .65; k > .02; k -= s * 1.2 / CHW) cnSect(s, k, (x, y) => { if (cnKeep(x, y)) o.push(x, y, z0 + sd * CWB, 0, 0, sd); });
    cnSect(es, 1.06, (x, y) => o.push(x, y, z0 + sd * .04, 0, 0, 0)); cnSect(es, .7, (x, y) => { if (cnKeep(x, y)) o.push(x, y, z0 + sd * CWB, 0, 0, 0); });
    arcZ(o, .2, -2.65, z0 + sd * (CWB + .005), .22, 0, TAU, es); arcZ(o, .2, -2.65, z0 + sd * (CWB + .02), .26, 0, TAU, es); } }, { ds: 2.2 }));
  P.push(G.cyl([1.12, -3.0, CS0 - .2], [1.48, -3.0, CS0 - .2], .2, { ds: 1.6 }), G.cyl([1.42, -3.0, CS0 - .2], [1.48, -3.0, CS0 - .2], .26, F()));
  P.push(G.cyl([1.0, -1.95, CS1 + .3], [1.48, -1.95, CS1 + .3], .2, { ds: 1.6 }), G.cyl([1.42, -1.95, CS1 + .3], [1.48, -1.95, CS1 + .3], .26, F()));
  // the exhaust neck from the LP hood down to the shell, its bellows
  P.push(fnp((o, s, es) => { for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    for (let k = 0; k < 4; k++) { const y = -1.5 - k * .055, g = 1 + (k & 1) * .03, hx = LHW * g * (1 - .1 * k / 3), hz = (LZ1 - LZ0) / 2 * g * (1 - .08 * k / 3);
      seg(o, [x0 * hx, y, LZC + z0 * hz], [x1 * hx, y, LZC + z1 * hz], es); } }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) seg(o, [sx * LHW, -1.45, LZC + sz * (LZ1 - LZ0) / 2], [sx * (CHW - CRR + .1), CY1, sz < 0 ? CS0 : CS1], es); }, F()));
  // the hotwell under the shell (cut like it): walls, bottom, the condensate's level, the outlet to the pumps
  P.push(fnp((o, s) => { const x0 = -.85, x1 = .85, y0 = -4.2, y1 = -3.5, z0 = 3.1, z1 = 4.9;
    P_.quadL(o, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], s); P_.quadL(o, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], s);
    P_.quadL(o, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], s); P_.quadL(o, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], s); }, { ds: 3 }));
  P.push(G.box([-.85, -4.2, 3.1], [.85, -3.5, 4.9], { edgeOnly: true }));
  P.push(G.cyl([-.55, -4.2, 4.6], [-.55, -4.38, 4.6], .1, F()));
  return P;
}
/* the condenser's tubes (their own cloud: a field of fine lines) */
const cndTubes = () => [fnp((o, s, es) => { for (const [x, y] of CTUBE) seg(o, [x, y, CS0], [x, y, CS1], es * 2.2); }, F({ ds: 1 }))];
function tgStatic() {
  const P = [], a0 = TGC[0], a1 = TGC[1];
  // front standard (governor end) and the bearing pedestals
  P.push(G.box([-.45, -.95, -1.05], [.45, .45, -.35], { ds: 3 }));
  for (const z of [2.3, 5.75]) P.push(G.box([-.42, -1.0, z - .18], [.42, .32, z + .18], { ds: 3 }));
  P.push(...hpLower());
  // the crossover pipe: HP exhaust over to the LP inlet
  P.push(pipe(CROSS, .25, .4));
  P.push(...lpLower(), ...cndPrims());
  // coupling guard; the generator: frame (cut) and a few rings, feet
  P.push(fnp((o, s, es) => { for (const z of [5.65, 5.95]) arcZ(o, 0, 0, z, .36, 0, TAU, es); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; seg(o, [Math.cos(a) * .36, Math.sin(a) * .36, 5.65], [Math.cos(a) * .36, Math.sin(a) * .36, 5.95], es); } }, F()));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[6.0, .3], [6.05, .62], [6.2, .98], [6.3, 1.02], [9.9, 1.02], [10.0, .98], [10.15, .62], [10.2, .3]], a0, a1, s, es), { ds: 3.4 }));
  P.push(fnp((o, s, es) => { for (let z = 7.1; z < 9.8; z += 1.0) arcZ(o, 0, 0, z, 1.04, a0, a1, es); }, F()));
  for (const sx of [-1, 1]) P.push(G.box([sx * .95 - .12, -1.05, 6.4], [sx * .95 + .12, -.62, 9.8], { ds: 2.5 }));
  // the stator core (round 3): the bore with its 36 slot openings, the end plates with the slots and teeth cut in them,
  // the laminations hatched on the cut faces, the back of the core
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[GZ0, .58], [GZ1, .58]], a0, a1, s, es, { inner: true, noEdge: true }), { ds: 4.0 }));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[GZ0, .76], [GZ0, .9]], a0, a1, s, es); slathe(o, 0, 0, [[GZ1, .9], [GZ1, .76]], a0, a1, s, es); }, { ds: 2.4 }));
  P.push(fnp((o, s, es) => { for (let k = 0; k < NSL; k++) { const a = SLA(k); if (!inSec(a, a0, a1)) continue;
    for (const sg of [-1, 1]) { const b = a + sg * SLW, c = Math.cos(b), sn = Math.sin(b); seg(o, [c * .58, sn * .58, GZ0], [c * .58, sn * .58, GZ1], es);
      for (const z of [GZ0, GZ1]) seg(o, [c * .58, sn * .58, z], [c * .75, sn * .75, z], es); }
    for (const z of [GZ0, GZ1]) arcZ(o, 0, 0, z, .75, a - SLW, a + SLW, es); } }));
  P.push(fnp((o, s, es) => { for (const a of [a0, a1]) { const c = Math.cos(a), sn = Math.sin(a); for (let z = GZ0 + .03; z < GZ1; z += .06) seg(o, [c * .59, sn * .59, z], [c * .9, sn * .9, z], es * 1.4);
    seg(o, [c * .9, sn * .9, GZ0], [c * .9, sn * .9, GZ1], es); seg(o, [c * .58, sn * .58, GZ0], [c * .58, sn * .58, GZ1], es); }
    for (const z of [GZ0, GZ1]) { arcZ(o, 0, 0, z, .9, a0, a1, es); arcZ(o, 0, 0, z, .58, a0, a1, es); } }, F()));
  // the windings: two bars in each slot (top and bottom coil sides) along the core; the end windings, a basket of
  // five-sixths pitch coils flaring out past each end, all round
  P.push(fnp((o, s, es) => { for (let k = 0; k < NSL; k++) { const a = SLA(k); if (!inSec(a, a0, a1)) continue; const c = Math.cos(a), sn = Math.sin(a);
    for (const r of SLR) seg(o, [c * r, sn * r, GZ0 - .06], [c * r, sn * r, GZ1 + .06], es * 2.5); } }, F()));
  P.push(fnp((o, s, es) => { for (const e of ENDW) { const p = e.pl.P; for (let i = 0; i < p.length - 1; i++) seg(o, p[i], p[i + 1], es); } }, F()));
  P.push(fnp((o, s, es) => { for (const z of [GZ0 - .3, GZ1 + .3]) { arcZ(o, 0, 0, z, .86, 0, TAU, es); arcZ(o, 0, 0, z + (z < GZ0 ? -.04 : .04), .86, 0, TAU, es); } }, F()));
  // terminal box and bushings on top; the exciter's housing (cut)
  P.push(G.box([-.35, .98, 8.85], [.35, 1.2, 9.65], { ds: 2 }), ...[-.2, 0, .2].map(x => G.cyl([x, 1.2, 9.25], [x, 1.42, 9.25], .045, F())));
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[10.45, .2], [10.5, .42], [11.1, .42], [11.15, .2]], a0, a1, s, es), { ds: 2 }));
  return P;
}
const CROSS = [[0, .62, 1.95], [0, 1.5, 2.3], [0, 1.62, 2.9], [0, 1.62, LZC - .5], [0, 1.38, LZC]];
/* the turbine rotor: the HP's seven wheels (disc, blades, a shroud band on the tips), the LP drum with its two flows of
   five stages (twisted blades growing outward; shrouds on the first three, a lacing wire through the last two), the
   shaft with its glands and coupling */
function tgRotor() {
  const P = [];
  P.push(fnp((o, s, es) => { HPS.forEach((h, k) => bladeRow(o, h.z, h.n, h.h, h.t, h.c, .7, .95, s, es, k * .17));
    for (const sd of [-1, 1]) LPS.forEach((p, k) => bladeRow(o, LZC + sd * p.d, p.n, p.h, p.t, p.c, sd * .35, sd * 1.2, s, es, k * .21 + (sd > 0 ? 0 : .1))); }, F({ ds: .9 })));
  P.push(fnp((o, s, es) => { for (const h of HPS) { for (const dz of [-.022, .022]) sdisc(o, h.z + dz, .16, h.h, 0, TAU, s * 1.4, dz < 0 ? -1 : 1);
    slathe(o, 0, 0, [[h.z - .03, h.h], [h.z + .03, h.h]], 0, TAU, s * 1.2, es);
    slathe(o, 0, 0, [[h.z - h.c * .55, h.t + .006], [h.z + h.c * .55, h.t + .006]], 0, TAU, s * 1.4, es); } }, { ds: 1.4 }));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[LZC - 1.42, .42], [LZC + 1.42, .42]], 0, TAU, s, es);
    for (const sd of [-1, 1]) LPS.forEach((p, k) => { const z = LZC + sd * p.d;
      if (k < 3) { arcZ(o, 0, 0, z - p.c * .45, p.t + .005, 0, TAU, es); arcZ(o, 0, 0, z + p.c * .45, p.t + .005, 0, TAU, es); }
      else arcZ(o, 0, 0, z, p.h + .62 * (p.t - p.h), 0, TAU, es);
      arcZ(o, 0, 0, z, p.h + .004, 0, TAU, es); }); }, { ds: 2 }));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[-.9, .15], [5.6, .15]], 0, TAU, s, es); seg(o, [.152, 0, -.9], [.152, 0, 5.6], es * .7); seg(o, [-.152, 0, -.9], [-.152, 0, 5.6], es * 1.5);
    for (const z0 of [-.14, 2.0, LZ0 - .14, LZ1 + .02]) for (let k = 0; k < 6; k++) arcZ(o, 0, 0, z0 + k * .024, .155 + (k & 1) * .012, 0, TAU, es);
    slathe(o, 0, 0, [[5.6, .15], [5.6, .34], [5.75, .34], [5.75, .15]], 0, TAU, s, es); }, { ds: 2 }));
  return P;
}
/* the generator rotor: two poles (d axis local +x and -x), four nested field coils round each, retaining rings, fans,
   the exciter's rotor */
function genRotor2() {
  const P = [];
  P.push(fnp((o, s, es) => slathe(o, 0, 0, [[GZ0 - .15, .5], [GZ1 + .15, .5]], 0, TAU, s, es, { noEdge: true }), { ds: 3.4 }));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[GZ0 - .45, .5], [GZ0 - .45, .53], [GZ0 - .15, .53], [GZ0 - .15, .5]], 0, TAU, s, es); slathe(o, 0, 0, [[GZ1 + .15, .5], [GZ1 + .15, .53], [GZ1 + .45, .53], [GZ1 + .45, .5]], 0, TAU, s, es); }, { ds: 1.6 }));
  P.push(fnp((o, s, es) => { for (const pa of [0, PI]) for (let m = 0; m < 4; m++) { const b = (24 + m * 12) * DEG, r = .505;
    for (const sg of [-1, 1]) for (const e of [-1.4 * DEG, 1.4 * DEG]) { const a = pa + sg * b + e, c = Math.cos(a), sn = Math.sin(a); seg(o, [c * r, sn * r, GZ0 - .15], [c * r, sn * r, GZ1 + .15], es);
      for (const z of [GZ0 - .15, GZ1 + .15]) seg(o, [c * .42, sn * .42, z], [c * r, sn * r, z], es); }
    for (const z of [GZ0 - .2 - m * .05, GZ1 + .2 + m * .05]) arcZ(o, 0, 0, z, r - .02, pa - b, pa + b, es); } }));
  P.push(fnp((o, s) => { for (const pa of [0, PI]) for (let z = GZ0 + s / 2; z < GZ1; z += s) for (let a = -.3; a <= .3; a += s / .5) { const c = Math.cos(pa + a), sn = Math.sin(pa + a); o.push(c * .505, sn * .505, z, c, sn, 0); } }, { ds: 1.5 }));
  P.push(fnp((o, s, es) => { slathe(o, 0, 0, [[5.75, .16], [11.05, .16]], 0, TAU, s, es); seg(o, [.162, 0, 5.8], [.162, 0, 11.0], es * .7); slathe(o, 0, 0, [[10.55, .3], [10.95, .3]], 0, TAU, s, es);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; arcZ(o, Math.cos(a) * .24, Math.sin(a) * .24, 10.97, .03, 0, TAU, es); } }, { ds: 2 }));
  for (const z of [GZ0 - .55, GZ1 + .55]) P.push(G.blades([0, 0, z], [0, 0, 1], 10, .18, .34, { chord: .1, pitch: .3, ds: 3, fine: true }));
  return P;
}

/* ================= structure: the lower hull, bulkheads, decks (ghosted) ================= */
function structure() {
  const P = [], zA = -33, zF = 40.4;
  const sect = z => { const L = []; for (let y = -6.3; y <= .01; y += .3) L.push([hb(z, y), y]); return L; };
  for (let z = zA; z <= zF + .01; z += 2.44) { const S = sect(z); for (const sx of [-1, 1]) P.push(G.line(S.map(([x, y]) => [sx * x, y, z]))); }
  for (const y of [-6.0, -5.2, -4.2, -3.0, -1.6]) for (const sx of [-1, 1]) { const L = []; for (let z = zA; z <= zF + .01; z += 2.44) L.push([sx * hb(z, y), y, z]); P.push(G.line(L, F())); }
  P.push(G.line([[0, -6.3, zA], [0, -6.3, zF]]), G.line([[0, -5.15, zA], [0, -5.15, zF]], F()));
  for (const sx of [-1, 1]) { const x = hb(0, -5.0); P.push(G.line([[sx * x, -5.0, -24], [sx * (x + .45), -5.45, -24 + .4], [sx * (x + .45), -5.45, 5], [sx * x, -5.0, 5.4]])); }
  // bulkheads: outline keel to the main deck, stiffeners, a sparse face, the 2nd deck's line
  for (const z of BH) {
    const L = []; for (let y = -6.3; y <= hD(z) + .01; y += .25) L.push(y);
    const R_ = L.map(y => [hb(z, y), y]);
    P.push(G.line([...R_.map(([x, y]) => [x, y, z]).reverse(), ...R_.map(([x, y]) => [-x, y, z])]));
    P.push(G.line([[-hb(z, hD(z)), hD(z), z], [hb(z, hD(z)), hD(z), z]]), G.line([[-hb(z, Y2), Y2, z], [hb(z, Y2), Y2, z]]));
    for (let x = -8.4; x <= 8.41; x += 1.2) { const L2 = []; for (const y of L) if (hb(z, y) > Math.abs(x) + .05) L2.push([x, y, z]); if (L2.length > 1) P.push(G.line([L2[0], L2[L2.length - 1]], F())); }
    P.push(fnp((o, s) => { for (let y = -6.3 + s / 2; y < hD(z); y += s) { const w = hb(z, y); for (let x = -w + s / 2; x < w; x += s) o.push(x, y, z, 0, 0, z > 0 ? -1 : 1); } }, { ds: 14 }));
    if (z > -7) { const y0 = Y2 + .02; P.push(G.line([[-1.6, y0, z], [-1.6, y0 + 1.7, z], [-1.3, y0 + 1.95, z], [-.6, y0 + 1.95, z], [-.3, y0 + 1.7, z], [-.3, y0, z]], F())); }
  }
  // the 2nd deck: beams and girders
  for (let z = -25.5; z <= zF + .01; z += 2.44) { const w = hb(z, Y2) - .1; P.push(G.line([[-w, Y2, z], [w, Y2, z]], F())); }
  for (const x of [-4.8, -2.4, 0, 2.4, 4.8]) P.push(G.line([[x, Y2, -25.5], [x, Y2, zF]], Math.abs(x) > 3 ? F() : {}));
  // the engine rooms' upper flats (gratings), handrails; the floor plates; ladders
  [[-25.5, -12.5], [-12.5, -6.0], [-6.0, 8.0]].forEach(([z0, z1], fi) => {
    const amr = fi === 1;
    for (const sx of [-1, 1]) {
      const xi = amr ? 0 : 5.3;
      for (let z = z0 + .12; z < z1; z += .5) P.push(G.line([[sx * xi, YU, z], [sx * (hb(z, YU) - .1), YU, z]], F()));
      P.push(G.line([[sx * xi, YU, z0], [sx * xi, YU, z1]]));
      if (!amr) { P.push(G.line([[sx * xi, YU + 1.0, z0], [sx * xi, YU + 1.0, z1]], F())); for (let z = z0 + .3; z < z1; z += 1.2) P.push(G.line([[sx * xi, YU, z], [sx * xi, YU + 1.0, z]], F())); }
    }
  });
  for (const [z0, z1] of [[-25.3, 8], [13.7, 24], [24.2, 36.2]]) for (let z = z0; z < z1; z += 1.0) { const w = hb(z, YL) - .1; P.push(G.line([[-w, YL, z], [w, YL, z]], F())); }
  for (let z = 36.4; z < 40.4; z += .5) { const w = hb(z, -3.6) - .1; P.push(G.line([[-w, -3.6, z], [w, -3.6, z]], F())); }
  for (const [x, z, dz] of [[6.0, 6.4, -1], [-6.0, -14.0, 1], [6.0, -24.6, 1], [-6.2, 6.6, -1], [6.4, 22.0, -1], [-6.4, 34.0, -1]]) {
    const y0 = YL, y1 = z > 13 ? YU : YU;
    for (const dx of [-.35, .35]) P.push(G.line([[x + dx, y0, z], [x + dx, y1, z + dz * 2.4]], F()));
    for (let k = 1; k < 14; k += 2) { const f = k / 14; P.push(G.line([[x - .35, y0 + (y1 - y0) * f, z + dz * 2.4 * f], [x + .35, y0 + (y1 - y0) * f, z + dz * 2.4 * f]], F())); }
  }
  return P;
}
/* the gas turbine plant's static parts (ship frame): gear casings, uptakes and intakes, shaft bearings and seals,
   the lube pumps' pipework, the generator leads, the bleed air to the starters */
function gtPlant() {
  const P = [];
  for (const m of MER) P.push(...mrgCase(m));
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
  for (const sh of SHAFT) {
    const Rm = alignZ(sh.d);
    for (const sb of sh.brg) P.push(fnp((o, s, es) => { const i0 = o.length; slathe(o, 0, 0, [[-.3, .34], [-.25, .44], [.25, .44], [.3, .34]], 0, TAU, s * 1.3, es); xfp(o, i0, Rm, V.mad(sh.a, sh.d, sb)); }));
    for (const sb of sh.brg) { const c = V.mad(sh.a, sh.d, sb); P.push(G.box([c[0] - .5, -5.1, c[2] - .28], [c[0] + .5, c[1] - .38, c[2] + .28], { ds: 2.5 }), G.box([c[0] - .62, c[1] - .1, c[2] - .2], [c[0] + .62, c[1] + .02, c[2] + .2], F({ ds: 2 }))); }
    for (const z of BH) { if (z > sh.a[2] - .1 || z < sh.a[2] - sh.L) continue; const sb = (sh.a[2] - z) / -sh.d[2], c = V.mad(sh.a, sh.d, sb);
      P.push(fnp((o, s, es) => { slathe(o, c[0], c[1], [[z - .2, .48], [z + .2, .48]], 0, TAU, s * 1.2, es); arcZ(o, c[0], c[1], z, .62, 0, TAU, es); })); }
  }
  for (const p of PUMPS) { const m = MER[p.mi], xc = m.bx + (p.p[0] > m.bx ? 2.86 : -2.86); P.push(G.line([[p.p[0] + .5, p.p[1] + .3, p.p[2]], [p.p[0] + .5, -3.9, p.p[2]], [xc, -3.9, p.p[2]]])); }
  for (const pl of PL.gen) { P.push(G.line(pl.P)); P.push(G.line(pl.P.map(p => [p[0] + .05, p[1], p[2] + .05])), G.line(pl.P.map(p => [p[0] - .05, p[1], p[2] - .05]))); }
  for (const pl of PL.air) for (let i = 0; i < pl.P.length - 1; i++) { P.push(G.cyl(pl.P[i], pl.P[i + 1], .06, { ds: 1.6 })); if (i) P.push(G.cyl(V.mad(pl.P[i], V.norm(V.sub(pl.P[i + 1], pl.P[i])), -.03), V.mad(pl.P[i], V.norm(V.sub(pl.P[i + 1], pl.P[i])), .03), .1, F())); }
  return P;
}
/* forward: the Mk 41 launcher below the deck, the Combat Information Center's consoles, the fibre-optic data trunk,
   the generator bus ducts, the railgun cables and their trays */
function fwdStatic() {
  const P = [];
  { const zc = 38.9, yt = hD(zc) - .08, yb = yt - 7.7;
    for (let m = 0; m < 4; m++) { const xm = (-3 + 2 * m) * 1.05;
      P.push(G.box([xm - 1.02, yb, zc - 1.72], [xm + 1.02, yt, zc + 1.72], { edgeOnly: true }));
      for (const y of [yb + .4, yb + 2.6, yb + 4.9, yt - .5]) P.push(G.line([[xm - 1.02, y, zc - 1.72], [xm + 1.02, y, zc - 1.72], [xm + 1.02, y, zc + 1.72], [xm - 1.02, y, zc + 1.72], [xm - 1.02, y, zc - 1.72]], F()));
      for (const j of [-1, 1]) for (let r = 0; r < 4; r++) { const x = xm + j * .72, z = zc + (1.5 - r) * .85, h = .3; P.push(G.box([x - h, yb + .9, z - h], [x + h, yt - .15, z + h], F({ edgeOnly: true }))); } } }
  P.push(G.box([-5.0, Y2 + .02, 13.5], [5.0, 6.35, 23.5], { edgeOnly: true }));
  for (const zr of [16.0, 19.0]) for (let k = 0; k < 6; k++) { const x = -3.9 + k * 1.3;
    P.push(G.box([x - .45, Y2, zr - .35], [x + .45, Y2 + .75, zr + .35], { ds: 4 }));
    P.push(G.line([[x - .42, Y2 + .78, zr + .3], [x + .42, Y2 + .78, zr + .3], [x + .42, Y2 + 1.35, zr + .45], [x - .42, Y2 + 1.35, zr + .45], [x - .42, Y2 + .78, zr + .3]])); }
  for (const pl of PL.data) P.push(G.line(pl.P), G.line(pl.P.map(p => [p[0], p[1] - .06, p[2]]), F()));
  // the bus ducts (both sides): a rectangular duct round three phase bars
  for (const sx of [1, -1]) {
    const B = BUS_P.map(p => [p[0] * sx, p[1], p[2]]);
    for (let i = 0; i < B.length - 1; i++) { const a = B[i], b = B[i + 1], L = V.dist(a, b); for (const [dx, dy] of [[-.2, -.12], [.2, -.12], [.2, .12], [-.2, .12]]) P.push(G.line([[a[0] + dx, a[1] + dy, a[2]], [b[0] + dx, b[1] + dy, b[2]]], F()));
      for (let t = .2; t < L; t += .5) { const q = V.lerp(a, b, t / L); P.push(G.line([[q[0] - .2, q[1] - .12, q[2]], [q[0] + .2, q[1] - .12, q[2]], [q[0] + .2, q[1] + .12, q[2]], [q[0] - .2, q[1] + .12, q[2]], [q[0] - .2, q[1] - .12, q[2]]], F())); } }
  }
  // the railgun cables (both sides) and their ladder trays
  for (const sx of [1, -1]) {
    const T = RG_P[0].map(p => [p[0] * sx, p[1] - .06, p[2]]);
    for (let i = 2; i < T.length - 2; i++) { const a = T[i], b = T[i + 1], d = V.norm(V.sub(b, a)), n = V.norm([d[2], 0, -d[0]]), L = V.dist(a, b);
      for (const k of [-.3, .3]) P.push(G.line([V.mad(a, n, k), V.mad(b, n, k)]));
      for (let t = .15; t < L; t += .3) { const p = V.mad(a, d, t); P.push(G.line([V.mad(p, n, -.3), V.mad(p, n, .3)], F())); } }
  }
  return P;
}
/* the railgun's conductors: the generator bus bars and the cables forward (lit once they carry current) */
function rgCables() {
  const P = [];
  for (const sx of [1, -1]) { for (const pl of PL.bus) P.push(G.line(pl.P.map(p => [p[0] * sx, p[1], p[2]]))); for (const pl of PL.rg) P.push(G.line(pl.P.map(p => [p[0] * sx, p[1], p[2]]))); }
  P.push(G.line([RG_P[1][4], ...PBR]), G.line([RG_P[1][4], ...PBR].map(p => [p[0], p[1] - .03, p[2] + .03]), F()));   // the branch to the helium compressor's drive
  return P;
}
/* polylines with lengths (for pulses and flows) */
const PL = { gen: [], air: [], data: [], rg: [], bus: [] };
/* the branch the pulse takes off the starboard feeder: inboard under the power room's floor, up into the drive on the
   helium compressor (pc_duel_bank.js: its drive box's cable gland, at the old coolant pump's seat) */
const PBR = [[1.2, 1.05, 41.45], [.62, 1.2, 41.45], [.62, 2.07, 41.45]];
const BUS_P = [[3.1, .12, 33.65], [3.1, .4, 33.95], [3.1, .4, 36.4], [2.95, -1.0, 37.0], [2.9, -1.3, 38.45]];
const RG_P = [0, 1].map(f => { const x0 = .9 + (f ? -.18 : .18), xa = 4.6 + f * .25, xc = f ? .92 : 1.84;
  return [[x0, -1.3, 38.45], [x0, -.95, 38.7], [xa, -.95, 38.75], [xa, -.95, 40.9], [xa, 1.05, 41.3], [3.1 + f * .25, 1.05, 44.0], [2.2 + f * .2, 1.05, 52.0], [xc, 1.05, 54.9], [xc, 1.3, 55.6]]; });
function offPath(P, d, dy) {
  const n = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], tx = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(tx, tz); return l > .05 ? [tz / l, -tx / l] : null; });
  for (let i = n.length - 2; i >= 0; i--) if (!n[i]) n[i] = n[i + 1];
  for (let i = 1; i < n.length; i++) if (!n[i]) n[i] = n[i - 1];
  return P.map((p, i) => [p[0] + (n[i] ? n[i][0] : 1) * d, p[1] + dy, p[2] + (n[i] ? n[i][1] : 0) * d]);
}
function routes() {
  for (const k in PL) PL[k].length = 0;
  SWB.forEach((sw, i) => { const L = X.make(R.y(sw.ry), sw.o), g = GTGS[i], Lg = X.make(R.y(g.ry), g.o), tb = X.ap(Lg, [g.tb * 1.06, .4, 1.32]), bot = X.ap(L, [.5, 0, -.45]);
    PL.gen.push(P_.poly([tb, [tb[0], YU - .25, tb[2]], [bot[0], YU - .25, bot[2]], bot])); });
  MER.forEach((m, mi) => {
    const g = GTGS[mi], Lg = X.make(R.y(g.ry), g.o), bp = X.ap(Lg, [0, TY + .4, 4.6]), yh = -1.25;
    GTM.filter(t => t.mi === mi).forEach(t => { const st = [t.o[0] - .5, t.o[1] - 1.25, t.o[2] + 6.2]; PL.air.push(P_.poly([bp, [bp[0], yh, bp[2]], [bp[0], yh, st[2] + .9], [st[0], yh, st[2] + .9], [st[0], st[1] + .02, st[2] + .9], st])); });
  });
  const SP_ = HD.destroyer.A.spy;
  SP_.forEach(c => { const zc = E.clamp(c[2], 14.5, 22.5), xi = Math.sign(c[0]) * 2.4; PL.data.push(P_.poly([c, [c[0] * .8, c[1], c[2]], [xi, 10.0, c[2]], [xi, 6.2, zc], [xi * .4, 5.95, zc], [1.0, 5.9, 23.5]])); });
  const TR = [[1.0, 5.9, 23.5], [1.0, 5.9, 25.0], [4.0, ytr(25) - .2, 26.0], [4.0, ytr(34) - .2, 34.0], [5.6, ytr(35.2) - .2, 35.4], [5.6, ytr(41.4) - .2, 41.4], [2.4, 6.15, 42.8], [.5, 6.2, 46.6], [0, 6.36, 47.6]];
  for (const d of [-.05, 0, .05]) PL.data.push(P_.poly(offPath(TR, d, 0)));
  PL.data.push(P_.poly([[2.4, 6.15, 42.8], [2.6, 6.15, 55.0], [.4, 6.15, 55.6], [.4, 3.8, 55.62]]));
  for (let k = 0; k < 3; k++) PL.bus.push(P_.poly(BUS_P.map(p => [p[0] + (k - 1) * .1, p[1], p[2]])));
  for (const RT of RG_P) for (let k = 0; k < 3; k++) PL.rg.push(P_.poly(offPath(RT, (k - 1) * .06, 0)));
  PL.pulse = P_.poly([...RG_P[1].slice(0, 5), ...PBR]);
  // the power path (round 3, starboard): the core, up and out of the hot leg, up through the steam generator, along the
  // main steam line into the HP turbine, over the casings (the crossover) to the LP, on along the set to the
  // generator's terminals and down the bus duct into the railgun switchboard's incomer
  { const T_ = p => [TGO[0] + p[0], TGO[1] + p[1], TGO[2] + p[2]];
    PL.pow = smooth([[0, CORE0 + .3, RV[1]], [0, -1.05, RV[1]], ...PIPES.hot.P, [SGX, -1.6, SGZ], [SGX, 3.25, SGZ], ...PIPES.steam.P.slice(1),
      T_([0, .75, .55]), ...CROSS.slice(1).map(T_), T_([0, 1.5, LZ1 - .2]), T_([0, 1.1, 6.3]), T_([0, 1.1, 8.9]), ...BUS_P], .3); }
  for (const k in PIPES) PLP[k] = smooth(PIPES[k].P, PIPES[k].rf);
  PLP.cross = smooth(CROSS, .4);
}

/* ================= build ================= */
const CL = {};
let O = null, OB = null, OF = null, OR = null, OC = null;
const AF = 1.35;                                          // the machines' brightness
const PX = { m: 5.2, b: 10.0, f: 4.6, r: 8.5 };
const TAGS = [];
function build(ctx) {
  K = ctx.K; P_ = ctx.P_; LIME = ctx.LIME; HOT = ctx.HOT; WH = ctx.WH;
  const t0 = performance.now(); NPT = 0;
  O = Object.assign({}, ctx.RO, { md: 3, S: null, lime: 0, a: 1.2, edge: .9, keep: 1, zfix: undefined, bk: .15, foc: 0, amb: .24 });
  OB = Object.assign({}, O, { a: .5, edge: .5, amb: .1, bk: 0 });
  OF = Object.assign({}, O, { a: AF, edge: 1.0, amb: .22, fade: 110, bk: .22 });
  OR = Object.assign({}, O, { a: .95, edge: .75, keep: .6 });
  OC = Object.assign({}, OF, { tint: HOT, tk: 0, edge: .8 });
  routes(); coils();
  MESH = meshPhases();
  SIMW = FILM.warp(RK.map(([t, rate]) => ({ t, rate })));
  clocks(); spins();
  PATH = mpath(KEYS);
  CL.shell = lod(structure(), 1.4, LVB);
  CL.gtp = lod(gtPlant(), 1.1, LV16);
  CL.fwd = lod(fwdStatic(), 1.1, LV16);
  CL.rgc = lod(rgCables(), 1.0, LV16);
  CL.gtm = lod(gtmStatic(), .7, LVF8);
  CL.enc = lod(gtmEnc(), .9, LVF8);
  CL.vsv = lod(vsvRings(), .5, LVF8);
  CL.gg = lod(ggRotor(), .5, LVF8);
  CL.pt = lod(ptRotor(), .5, LVF8);
  CL.gtg = lod(gtgStatic(), .7, LVM);
  CL.gtgT = [lod(gtgTerm(1), .5, LVM), lod(gtgTerm(-1), .5, LVM)];
  CL.gtgR = lod(gtgRotor(), .5, LVF8);
  CL.gtgG = lod(genRotor(), .5, LVM);
  CL.bull = lod(gearBull(), .6, LVF8);
  CL.p2 = lod(gearP2(), .4, LVF);
  CL.g1 = lod(gearG1(), .5, LVF8);
  CL.gi = lod(gearI(), .4, LVF);
  CL.pump = lod(pumpStatic(), .5, LV16);
  CL.pcpl = lod(pumpCoupling(), .3, LVF);
  CL.swb = [lod(swbStatic(6), .6, LVF8), lod(swbStatic(5), .6, LVF8)];
  CL.shaft = SHAFT.map(sh => lod(shaftPrims(sh), 1.0, LV16));
  CL.rv = lod(vesselPrims(), .8, LVF8);
  CL.core = lod(corePrims(), .5, LVF8);
  CL.rod = [0, 1, 2].map(b => lod(rodPrims(b), .5, LVF8));
  CL.sg = lod(sgPrims(), .8, LVF8);
  CL.ut = lod(utPrims(), .6, LVF8);
  CL.pz = lod(pzPrims(), .7, LVF8);
  CL.rcp = lod(rcpPrims(), .6, LVF8);
  CL.rcpR = lod(rcpRotor(), .5, LVF8);
  CL.loop = lod(loopPrims(), 1.0, LV16);
  CL.tg = lod(tgStatic(), .8, LVF8);
  CL.tgU = lod([...hpUpper(), ...lpUpper()], .8, LVF8);
  CL.cnd = lod(cndTubes(), .7, LV16);
  CL.tgR = lod(tgRotor(), .6, LVF8);
  CL.genR = lod(genRotor2(), .6, LVF8);
  CL.fp = lod(feedPumpPrims(), .6, LVF8);
  CL.rsw = lod(rswStatic(), .6, LVF8);
  CL.rbk = lod(brkTruck(), .4, LVF);
  for (const t of TAGDEF) TAGS.push(Object.assign({ tg: K.mkTag() }, t));
  for (let k = 0; k < 3; k++) SCT.push(K.mkTag());
  for (const k in CL) (Array.isArray(CL[k]) ? CL[k] : [CL[k]]).forEach((c, i) => { c.__n = Array.isArray(CL[k]) ? k + i : k; });
  RGE.info = { ms: Math.round(performance.now() - t0), pts: NPT, n: Object.fromEntries(Object.entries(CL).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(c => c.lv[0].length / 6)])) };
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

/* ================= time: the compression warp, clocks for the flows, the rotors' angles ================= */
let SIMW = null;
const CK = {}, SP = {};
const RATE = u => SIMW.rate(u);
const DU = 1 / 120, NS = Math.ceil(LEN / DU) + 2;
function mkClock(fn) { const seg_ = []; for (let t = 0; t <= LEN + 1e-6; t += .1) seg_.push({ t, rate: fn(t) }); return FILM.warp(seg_); }
function clocks() {
  CK.fx = mkClock(u => E.clamp(RATE(u), .04, 1));            // flicker: normal speed, slowed in slow motion
  CK.prim = mkClock(u => Math.min(12 * RATE(u), 2.4));       // primary coolant (12 m/s)
  CK.steam = mkClock(u => Math.min(40 * RATE(u), 3.6));      // main steam (40 m/s)
  CK.turb = mkClock(u => Math.min(150 * RATE(u), 2.6));      // steam through the blading
  CK.feed = mkClock(u => Math.min(4 * RATE(u), 1.6));        // feedwater, condensate
  CK.sea = mkClock(u => Math.min(2.5 * RATE(u), 1.4));       // seawater
  CK.bub = mkClock(u => Math.min(2.4 * RATE(u), .9));        // bubbles rising
}
/* a rotor: angle (rad, as seen on screen) and visual rev/s, from its rpm and the time compression */
function mkSpin(rpm) { const A = new Float64Array(NS), Rv = new Float32Array(NS); let a = 0; for (let k = 0; k < NS; k++) { const u = k * DU, um = u + DU / 2; Rv[k] = rpm(u) / 60 * RATE(u); A[k] = a; a += TAU * rpm(um) / 60 * RATE(um) * DU; } return { A, Rv }; }
function spA(S, u) { const x = E.clamp(u / DU, 0, NS - 1.001), k = Math.floor(x); return S.A[k] + (S.A[k + 1] - S.A[k]) * (x - k); }
const spR = (S, u) => S.Rv[Math.min(NS - 1, Math.max(0, Math.round(u / DU)))];
function spins() {
  SP.gen = [0, 1, 2].map(k => mkSpin(u => 1800 * fgen(k, u)));
  SP.gg = {}; for (const id in GM_T) SP.gg[id] = mkSpin(u => ngg(id, u));
  SP.sh = [0, 1].map(i => mkSpin(u => shRpm(i, u)));
  SP.rcp = mkSpin(u => 1800 * ss(RCP_T[0], RCP_T[1], u));
  SP.tg = mkSpin(u => 3600 * ss(TG_T[0], TG_T[1], u));
  SP.fp = mkSpin(u => 5000 * ss(T_FP[0], T_FP[1], u));
}

/* ================= state ================= */
const ST = { rate: 1, gen: new Float64Array(3), genA: new Float64Array(3), genV: new Float64Array(3), brk: new Float64Array(3), gg: {}, ggA: {}, ggV: {},
  sh: new Float64Array(2), shA: new Float64Array(2), shV: new Float64Array(2), rod: new Float64Array(3), rodM: new Float64Array(3),
  lp: -8, heat: 0, nf: 0, rcp: 0, rcpA: 0, rcpV: 0, tg: 0, tgA: 0, tgV: 0, fp: 0, fpA: 0, steam: 0, load: 0, heaters: 0 };
function state(u) {
  ST.rate = RATE(u);
  for (let k = 0; k < 3; k++) { ST.gen[k] = fgen(k, u); ST.genA[k] = spA(SP.gen[k], u); ST.genV[k] = spR(SP.gen[k], u); ST.brk[k] = kk(u, GT_T[k][3], GT_T[k][3] + .12); }
  for (const id in GM_T) { ST.gg[id] = ngg(id, u) / 4900; ST.ggA[id] = spA(SP.gg[id], u); ST.ggV[id] = spR(SP.gg[id], u); }
  for (let i = 0; i < 2; i++) { ST.sh[i] = shRpm(i, u); ST.shA[i] = spA(SP.sh[i], u) * (i ? 1 : -1); ST.shV[i] = spR(SP.sh[i], u); }
  for (let b = 0; b < 3; b++) { const [a, c] = ROD_T[b]; ST.rod[b] = ROD_H[b] * ss(a, c, u); ST.rodM[b] = u > a - .05 && u < c + .05 ? 1 : 0; }
  ST.lp = lpow(u); ST.heat = E.sat((ST.lp + 3) / 3); ST.nf = E.sat((ST.lp + 8.6) / 8.6);
  ST.rcp = ss(RCP_T[0], RCP_T[1], u); ST.rcpA = spA(SP.rcp, u); ST.rcpV = spR(SP.rcp, u);
  ST.tg = ss(TG_T[0], TG_T[1], u); ST.tgA = spA(SP.tg, u); ST.tgV = spR(SP.tg, u);
  ST.fp = ss(T_FP[0], T_FP[1], u); ST.fpA = spA(SP.fp, u);
  ST.steam = ss(T_STM[0], T_STM[1], u); ST.load = ss(T_ON - .2, T_ON + .3, u) * (.12 + .88 * ss(T_FDR + .2, T_FDR + 7, u));   // the plant's own pumps (3 MW a set), then the power room's draw
  ST.heaters = ss(RCP_T[0] + 1, RCP_T[0] + 1.8, u) * (1 - ss(T_FULL - .4, T_FULL + .6, u)) * .8 + .2 * ss(T_FULL - .4, T_FULL + .6, u);
  return ST;
}

/* ================= the window ================= */
/* the X-ray window opens bow to stern over the whole machinery length; it closes behind the pulse from aft up to the
   power room; in the last 5 s it eases to the base take's window as it stands at the splice (read here: the film sets
   it from base time 4.0 just before this call), so the hand-off is seamless */
const XB = { open: false, zo: 99, zs: 99, ko: 1, ks: 1, box: [0, 0, 0, 0, 0, 0] }, XB0 = [-11.5, 11.5, -7, 24, -33, 57.6];
function xray(u, XS) {
  CUR_U = u;
  XB.open = XS.zo < 90; XB.zo = XS.zo; XB.zs = XS.zs; XB.ko = XS.ko; XB.ks = XS.ks; for (let i = 0; i < 6; i++) XB.box[i] = XS.box[i];
  let zo = 57.6 - 90.6 * ss(.4, 6.4, u), ko = 1 - ss(6.4, 7.4, u);
  if (u > T_PULSE) { zo = -33 + 73 * ss(T_PULSE, T_PULSE + 7.6, u); ko = 1 - ss(T_PULSE + 7.2, T_PULSE + 8.6, u); }
  const w = XB.open ? ss(LEN - 5, LEN - .05, u) : 0;
  for (let i = 0; i < 6; i++) XS.box[i] = XB0[i] + (XB.box[i] - XB0[i]) * w;
  if (u < .4) { XS.zo = 99; XS.zs = 99; XS.dim = 1; return false; }                 // (the base take's window is shut before the splice; a base window shut at
                                                                                     // the splice's end: this one stays open to the end)
  XS.zo = zo + (Math.min(XB.zo, 60) - zo) * w; XS.zs = 99 + (XB.zs - 99) * w;
  XS.ko = ko + (XB.ko - ko) * w; XS.ks = XB.ks * w;
  XS.dim = .45 + .55 * Math.max(w, 1 - ss(.4, 2.4, u));  // the ship's shell ghosted while inside (restored in draw)
  return true;
}
const XW = { zo: 99, zs: 99 };
/* while the lens is still near the splice and once the pulse runs, the base take draws the power room itself (its own
   parts as they stand at the splice, through this window), so nothing pops at either hand-off; only when its window is
   open there (else this module's room); in the last 2 s everything else this module draws fades out */
let CUR_U = 0;
const roomBase = () => XB.open && (CUR_U < 6.5 || CUR_U > T_PULSE);
const isOpen = z => XW.zo < 90 && z > XW.zo && z < XW.zs && z > -33 && z < 57.6;

/* ================= camera (ship frame keys; world through the ship's motion) =================
   Keys 4-6 s apart; a pair of near-equal keys is a hold. Interpolated per component with a monotone cubic (no
   overshoot: a hold is still, a run eases in and out, nothing swings back). Over the first 6.5 s the lens eases in
   from the base take's (its position and its motion at the splice), over the last 5 s it eases back into it; the
   look between them turns by direction (slerp), never through a lerped target. While the pulse runs forward the lens
   rides with it */
const KEYS = [
  { t: 6.0, eye: [12, 7, 26], target: [1.5, -2, 8], fov: 46 },                // the machinery spaces open: MER 1 ahead
  { t: 9.0, eye: [7.5, 3.2, 13.8], target: [.6, -2.5, 5.0], fov: 45 },
  { t: 11.6, eye: [3.3, .8, 7.4], target: [-.3, -2.6, 4.2], fov: 42 },        // LM2500 1B: the enclosure lifts, it cranks
  { t: 13.2, eye: [2.7, .25, 6.3], target: [-.3, -2.6, 4.4], fov: 42 },       // (x0.01) the scan down the six sections
  { t: 17.7, eye: [2.65, .15, 4.8], target: [-.3, -2.65, 3.0], fov: 42 },
  { t: 22.2, eye: [2.6, .05, 3.3], target: [-.3, -2.7, 1.5], fov: 42 },
  { t: 26.6, eye: [-.05, -2.45, 8.9], target: [-.3, -2.7, 2.5], fov: 22 },    // end-on: the flame front runs round
  { t: 31.0, eye: [-.08, -2.47, 8.7], target: [-.3, -2.7, 2.5], fov: 22 },
  { t: 35.6, eye: [3.2, 1.0, 1.2], target: [-2.0, -2.7, -4.1], fov: 46 },     // (x20 on the way) the main reduction gear, exploded
  { t: 38.6, eye: [3.0, 1.1, 1.0], target: [-2.0, -2.6, -4.0], fov: 48 },
  { t: 41.2, eye: [2.8, 1.0, .6], target: [-2.0, -2.6, -4.1], fov: 48 },
  { t: 43.6, eye: [2.6, -.8, -3.0], target: [-1.6, -2.4, -4.4], fov: 44 },    // the clutches in: the gears turn
  { t: 45.6, eye: [2.6, -.75, -3.1], target: [-1.6, -2.4, -4.4], fov: 44 },
  { t: 51.0, eye: [7.0, 3.2, 10.6], target: [.6, -1.8, 18.4], fov: 48 },      // the reactor compartment: the coolant pumps start
  { t: 54.6, eye: [4.6, 2.6, 11.4], target: [.2, -2.6, 18.2], fov: 46 },       // (x600) the rods withdraw, the flux climbs
  { t: 58.6, eye: [3.4, 2.3, 11.2], target: [.2, -3.0, 18.3], fov: 46 },      // critical, the power rises
  { t: 60.6, eye: [3.25, 2.25, 11.2], target: [.2, -3.0, 18.3], fov: 46 },
  { t: 64.4, eye: [1.2, 2.2, 13.4], target: [4.4, .3, 19.0], fov: 44 },       // (x0.1) the steam generator boils
  { t: 66.6, eye: [1.25, 2.3, 13.6], target: [4.4, .45, 19.0], fov: 44 },
  { t: 69.4, eye: [2.5, 3.0, 16.2], target: [4.4, 2.25, 19.0], fov: 40 },     // the separators fling the water out
  { t: 73.4, eye: [2.55, 3.05, 16.35], target: [4.4, 2.3, 19.0], fov: 40 },
  { t: 75.7, eye: [.4, 2.6, 21.6], target: [3.2, -.6, 24.9], fov: 48 },       // the main steam line down into the HP turbine
  { t: 77.8, eye: [-1.0, 1.1, 25.0], target: [3.1, -1.7, 25.4], fov: 46 },      // (x0.01) the steam down the line into the HP turbine
  { t: 82.4, eye: [-1.15, 1.25, 26.4], target: [3.1, -1.75, 26.6], fov: 49 },    // a slow dolly aft along the set: the HP, then the LP
  { t: 85.2, eye: [-1.3, 1.4, 28.2], target: [3.1, -1.85, 28.4], fov: 52 },
  { t: 88.0, eye: [-1.3, 1.4, 28.4], target: [3.1, -1.85, 28.4], fov: 52 },
  { t: 91.2, eye: [-.5, -1.6, 25.8], target: [3.0, -4.4, 28.4], fov: 50 },     // (x0.1) the condenser
  { t: 95.4, eye: [-.6, -1.7, 26.6], target: [3.0, -4.5, 28.8], fov: 50 },
  { t: 98.6, eye: [-1.2, 1.9, 29.2], target: [3.1, -2.0, 32.6], fov: 46 },     // (x0.01) the generator
  { t: 103.4, eye: [-1.3, 2.2, 30.4], target: [3.1, -2.0, 32.9], fov: 46 },
  { t: 106.8, eye: [-.25, .35, 34.5], target: [1.4, -2.55, 38.0], fov: 44 },   // between the boards: the feeders rack in and close
  { t: 110.4, eye: [-.2, .3, 34.6], target: [1.4, -2.55, 38.0], fov: 44 },
  { t: LEN, eye: [-.2, .3, 34.6], target: [1.4, -2.55, 38.0], fov: 44 },  // (then the lens rides with the pulse: pulseCam)
];
/* a monotone cubic through keys (Fritsch-Butland tangents; zero at the ends and wherever a component turns) */
function mpath(keys) {
  const n = keys.length, T = keys.map(k => k.t), Vv = keys.map(k => [...k.eye, ...k.target, k.fov]), M = [];
  for (let c = 0; c < 7; c++) {
    const d = []; for (let i = 0; i < n - 1; i++) d.push((Vv[i + 1][c] - Vv[i][c]) / (T[i + 1] - T[i]));
    const m = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) { if (d[i - 1] * d[i] <= 0) continue; const h0 = T[i] - T[i - 1], h1 = T[i + 1] - T[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    M.push(m);
  }
  const out = { eye: [0, 0, 0], target: [0, 0, 0], fov: 0 };
  return t => {
    t = E.clamp(t, T[0], T[n - 1]);
    let i = 0; while (i < n - 2 && T[i + 1] <= t) i++;
    const h = T[i + 1] - T[i], s = (t - T[i]) / h, s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let c = 0; c < 7; c++) { const v = Vv[i][c] * h00 + M[c][i] * h * h10 + Vv[i + 1][c] * h01 + M[c][i + 1] * h * h11; if (c < 3) out.eye[c] = v; else if (c < 6) out.target[c - 3] = v; else out.fov = v; }
    return out;
  };
}
let PATH = null;
/* two shots blended by eye position and by look direction (slerp), the target distance lerped */
function blendS(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = V.len(da), lb = V.len(db), ua = V.mul(da, 1 / la), ub = V.mul(db, 1 / lb);
  const c = E.clamp(V.dot(ua, ub), -1, 1), om = Math.acos(c), eye = V.lerp(a.eye, b.eye, w);
  let d; if (om < 1e-4) d = V.lerp(ua, ub, w); else { const so = Math.sin(om); d = V.add(V.mul(ua, Math.sin((1 - w) * om) / so), V.mul(ub, Math.sin(w * om) / so)); }
  return { eye, target: V.mad(eye, V.norm(d), la + (lb - la) * w), fov: a.fov + (b.fov - a.fov) * w, roll: 0 };
}
/* the base take's lens at the splice: in, its opening (ctx.camOld, at rest there); out, its lens at base 4.0
   carried on by its own motion there (decaying over ~1 s) */
const SPL = { ok: false, s0: null, s1: null, v1: null };
function splice(ctx) {
  if (SPL.ok) return; SPL.ok = true;
  const a = ctx.camAt(4.0), ap = ctx.camAt(4.05);
  SPL.s0 = ctx.camOld || a; SPL.s1 = a;
  const v = { e: V.mul(V.sub(ap.eye, a.eye), 20), t: V.mul(V.sub(ap.target, a.target), 20) }, sp = Math.max(V.len(v.e), V.len(v.t));
  if (sp > 4) { v.e = V.mul(v.e, 4 / sp); v.t = V.mul(v.t, 4 / sp); }
  SPL.v1 = v;
}
function carried(dt) { const s = SPL.s1, v = SPL.v1, k = -(1 - Math.exp(dt)); return { eye: V.mad(s.eye, v.e, k), target: V.mad(s.target, v.t, k), fov: s.fov, roll: 0 }; }
/* the pulse's lens: on the pulse (its path smoothed over 4 m), from behind it, above and inboard where the switchboard
   shot left the lens; as the pulse runs forward the lens swings round it through port (165 deg, a slow eased orbit
   about the vertical) and ends ahead of it, looking aft at the coolant pump it reaches, where the base lens is */
const PF = [0, 0, 0];
function pulseCam(u) {
  const s = pulseS(u), pl = PL.pulse; let x = 0, y = 0, z = 0;
  for (let k = -14; k <= 14; k++) { P_.polyAt(pl, E.clamp(s + k * .2, 0, pl.L), PF); x += PF[0]; y += PF[1]; z += PF[2]; }
  x /= 29; y /= 29; z /= 29;
  const w = ss(T_PULSE + .4, LEN - 1.0, u), a = (190 + 165 * w) * DEG, r = 5.5 + .1 * w;
  return { eye: [x + Math.sin(a) * r, y + 2.4 - .1 * w, z + Math.cos(a) * r], target: [x, y + .1 + .1 * w, z + .3 * (1 - w)], fov: 42 + 4 * w };
}
/* debug: ?ecams=u:ex,ey,ez,tx,ty,tz,fov;... (ship frame) holds those cameras at those moments (read from the shoot page too) */
const QS = (() => { let q = location.search; try { if (window.parent !== window) q += '&' + parent.location.search.slice(1); } catch (e) {} return new URLSearchParams(q); })();
const ECAMS = (QS.get('ecams') || '').split(';').filter(Boolean).map(x => { const [u, v] = x.split(':'); return { u: +u, c: v.split(',').map(Number) }; });
/* the path in the ship frame (fov in degrees; no splice blends) */
function camShip(u) {
  if (!PATH) PATH = mpath(KEYS);
  const s = PATH(u);
  let shot = { eye: s.eye.slice(), target: s.target.slice(), fov: s.fov };
  const wf = ss(T_PULSE - .4, T_PULSE + 3.4, u);
  if (wf > 0) shot = blendS(shot, pulseCam(u), wf);
  return shot;
}
function cam(u, ctx) {
  for (const e of ECAMS) if (Math.abs(e.u - u) < .02) return { eye: X.ap(ctx.Ws, e.c.slice(0, 3)), target: X.ap(ctx.Ws, e.c.slice(3, 6)), fov: (e.c[6] || 40) * DEG, roll: 0 };
  splice(ctx);
  const s = camShip(u), Ws = ctx.Ws;
  let shot = { eye: X.ap(Ws, s.eye), target: X.ap(Ws, s.target), fov: s.fov * DEG, roll: 0 };
  const a = ss(0, KEYS[0].t, u), b = ss(LEN - 5, LEN, u);
  if (a < 1) shot = blendS(SPL.s0, shot, a);
  if (b > 0) shot = blendS(shot, carried(u - LEN), b);
  return shot;
}

/* ================= draw ================= */
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0], Q4 = [0, 0, 0];
function apI(Tw, x, y, z, out) {
  const M = Tw.R, t = Tw.T;
  out[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; out[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; out[2] = M[6] * x + M[7] * y + M[8] * z + t[2];
  return out;
}
const LG = {}, GTGL = [], SWL = [];
const TGL = X.make(R.I(), TGO), TGLm = X.mul(MIRX, TGL), RSL = X.make(R.y(RSW.ry), RSW.o), RSLm = X.mul(MIRX, RSL), ID = X.make(R.I(), [0, 0, 0]);
const RODL = [0, 1, 2].map(() => X.make(R.I(), [0, 0, 0]));
const FC_RV = [0, -1.6, 18.0], FC_SG = [SGX, .2, SGZ], FC_SGm = [-SGX, .2, SGZ], FC_PZ = [PZ[0], 0, PZ[1]], FC_RCP = [RCPX, RCPY, RCPZ], FC_RCPm = [-RCPX, RCPY, RCPZ];
const FC_TG = [TGO[0], TGO[1], TGO[2] + 5], FC_TGm = [-TGO[0], TGO[1], TGO[2] + 5], FC_FP = [1.0, -4.3, 31.5], FC_FPm = [-1.0, -4.3, 31.5], FC_RS = [1.9, -2.4, 38.4], FC_RSm = [-1.9, -2.4, 38.4];
function density() { const q = K.DQ; O.px = PX.m / q; OB.px = PX.b / q; OF.px = OC.px = PX.f / q; OR.px = PX.r / q; }
/* debug (?eprof): points and ms per cloud in RGE.prof */
const EPROF = QS.has('eprof');
function profX(ml, Tw, o) { P_.np(); const t = performance.now(); P_.drawX(ml, Tw, o); const k = ml.__n || 'room', A = RGE.prof || (RGE.prof = {}); A[k] = A[k] || [0, 0]; A[k][0] += P_.np(); A[k][1] += performance.now() - t; }
/* focus: in the close passes the part at work is drawn full, the rest of the plant sparse and dim. Back-to-back
   passes hand the focus over across 1.6 s (round 3: the 0.5 s hand-over popped the HP turbine in) */
const FOCUS = [[10.0, 22.6, [-.3, -2.7, 3.0], 3.8], [22.6, 31.6, [-.3, -2.7, 2.6], 3.0], [31.6, 34.4, [-.4, -2.7, 1.0], 4.4], [34.4, 46.6, [-2.0, -2.7, -4.1], 3.8],
  [50.4, 62.6, [0, -1.4, 18.0], 3.8], [62.6, 75.4, [4.4, .8, 19.0], 3.4], [75.4, 88.6, [3.1, -1.3, 26.6], 3.6], [88.6, 95.8, [3.1, -3.6, 28.4], 3.2],
  [95.8, 105.6, [3.1, -1.3, 32.4], 3.2], [105.6, 111.4, [1.4, -2.4, 38.2], 2.8]];
const FC = { p: [0, 0, 0], r: 5, k: 0 };
function focusAt(u) {
  FC.k = 0;
  for (let i = 0; i < FOCUS.length; i++) {
    const [a, b, p, r] = FOCUS[i], pv = FOCUS[i - 1], n = FOCUS[i + 1], cp = pv && pv[1] >= a - .01, cn = n && n[0] <= b + .01;
    if (u < a - 1.2 || u > b + (cn ? .4 : 0)) continue;
    FC.k = Math.min(cp ? 1 : ss(a - 1.2, a + .3, u), cn ? 1 : 1 - ss(b - 1.0, b, u));
    for (let j = 0; j < 3; j++) FC.p[j] = p[j]; FC.r = r;
    const wp = cp ? 1 - ss(a - 1.2, a + .4, u) : 0, wn = cn ? ss(b - 1.2, b + .4, u) : 0;
    if (wp > 0) { for (let j = 0; j < 3; j++) FC.p[j] += (pv[2][j] - p[j]) * wp; FC.r += (pv[3] - r) * wp; }
    if (wn > 0) { for (let j = 0; j < 3; j++) FC.p[j] += (n[2][j] - p[j]) * wn; FC.r += (n[3] - r) * wn; }
    break;
  }
  return FC;
}
const fw = c => FC.k < .01 ? 1 : 1 - FC.k * ss(FC.r, FC.r * 2.2, Math.hypot(c[0] - FC.p[0], c[1] - FC.p[1], c[2] - FC.p[2]));
let GDIM = 1;                                             // (the end-on view: all but the combustor's slice dimmed)
function fset(o, c, a, keep) { const f = fw(c); o.a = a * (.16 + .84 * f) * GDIM; o.keep = keep * (.22 + .78 * f); }
/* a spinning rotor: crisp while slow on screen, thinned (a blur) once it turns faster than the eye can follow */
function rotorOpts(o, c, a, vr) { fset(o, c, a, 1); const b = vr > 1.2 ? Math.max(.32, Math.sqrt(1.2 / vr)) : 1; o.keep *= b; o.a *= .7 + .3 * b; }
const GC_ = {};
function draw(u, ctx) {
  ctx.XS.dim = 1;
  const Ws = ctx.Ws, X_ = EPROF ? profX : P_.drawX;
  density();
  XW.zo = ctx.XS.zo; XW.zs = ctx.XS.zs;
  if (XW.zo > 90) return;
  if (XB.open) ctx.XS.gain = Math.min(ss(-.1, 1.2, u), 1 - ss(LEN - 2.2, LEN - .05, u));
  const st = state(u); focusAt(u); GDIM = 1 - .62 * eoAt(u);
  const ce = K.C.eye, fd = FC.k > .02 ? 1.3 * Math.hypot(ce[0] - FC.p[0], ce[1] - FC.p[1], ce[2] - FC.p[2]) / FC.k : 0;   // (eased with k: no step)
  O.foc = OB.foc = OF.foc = OC.foc = fd;
  OB.S = null; OB.a = .5 * GDIM; OB.keep = .62 - .3 * FC.k; X_(CL.shell, Ws, OB); OB.keep = 1;
  O.S = null; O.lime = 0; O.a = 1.1 * GDIM; O.keep = (1 - .45 * FC.k) * (1 - .5 * (1 - GDIM)); X_(CL.gtp, Ws, O); X_(CL.fwd, Ws, O); O.keep = 1;
  { const lv = .3 * ss(T_ON, T_ON + 1, u) + .4 * ss(T_PULSE, T_PULSE + 3, u); O.lime = lv; O.a = 1.1 + .7 * lv; X_(CL.rgc, Ws, O); O.lime = 0; O.a = 1.1; }
  drawGT(u, st, Ws, X_);
  drawRX(u, st, Ws, X_);
  drawTG(u, st, Ws, X_);
  O.S = OF.S = OC.S = null; O.keep = OF.keep = OC.keep = 1; OF.lime = 0; OF.a = AF;
  if (!roomBase()) drawRoom(u, ctx, Ws);
  fxGT(u, st, Ws); fxRX(u, st, Ws); fxTG(u, st, Ws); fxRun(u, st, Ws);
  ctx.XS.gain = 1;
}
/* the gas turbine plant: the four LM2500s, the reduction gears, the generator sets, switchboards, pumps, shafts */
function drawGT(u, st, Ws, X_) {
  const px0 = OF.px; OF.px = px0 * 1.3;
  for (const g of GTM) {
    const L = LG[g.id] || (LG[g.id] = X.make(R.I(), g.o)), Lw = X.mul(Ws, L), c = GC_[g.id] || (GC_[g.id] = V.add(g.o, [0, 0, 3.5]));
    const eo = g.id === '1B' ? eoAt(u) : 0, gh = 1 - .88 * eo;             // (end-on: the engine ghosted round its combustor)
    OF.S = L; OF.lime = 0; fset(OF, c, AF * gh, gh); X_(CL.gtm, Lw, OF);
    const lift = g.id === '1B' ? kk(u, LIFT[0], LIFT[1]) * (1 - kk(u, LIFT[2], LIFT[3])) : 0, Le = lift > 0 ? X.mul(L, X.make(R.I(), [0, 2.4 * lift, 0])) : L;
    OF.S = Le; fset(OF, c, AF * (1 - .65 * lift) * gh, gh); OF.keep *= 1 - .55 * lift; OF.lime = .35 * Math.sin(PI * lift); X_(CL.enc, X.mul(Ws, Le), OF); OF.lime = 0; OF.keep = 1;
    OF.S = L; fset(OF, c, AF * gh, gh);
    const Lv = X.mul(L, X.make(R.z((ngg(g.id, u) / 4900 - .5) * 6 * DEG), [0, 0, 0])); OF.S = Lv; X_(CL.vsv, X.mul(Ws, Lv), OF);
    const Lr = X.mul(L, X.make(R.z(st.ggA[g.id] * (g.mi ? -1 : 1)), [0, 0, 0]));
    OF.S = Lr; rotorOpts(OF, c, AF, st.ggV[g.id]); OF.a *= gh; OF.keep *= gh; OF.lime = .12 * st.gg[g.id]; X_(CL.gg, X.mul(Ws, Lr), OF);
    const Lp = X.mul(L, X.make(R.z(ptAngle(g, st)), [0, 0, 0]));
    OF.S = Lp; rotorOpts(OF, c, AF, st.shV[g.mi] * RATIO); OF.lime = .1 * st.sh[g.mi] / SH_RPM; X_(CL.pt, X.mul(Ws, Lp), OF);
    OF.keep = 1; OF.lime = 0; OF.a = AF;
  }
  OF.px = px0;
  for (let mi = 0; mi < 2; mi++) drawGears(MER[mi], mi, st, Ws, u);
  GTGS.forEach((g, k) => {
    const L = GTGL[k] || (GTGL[k] = X.make(R.y(g.ry), g.o)), c = GC_['g' + k] || (GC_['g' + k] = X.ap(L, [0, 0, 3.5]));
    OF.S = L; fset(OF, c, AF, 1); OF.lime = 0; const Lw = X.mul(Ws, L); X_(CL.gtg, Lw, OF); X_(CL.gtgT[g.tb > 0 ? 0 : 1], Lw, OF);
    const Lr = X.mul(L, X.make(R.z(st.genA[k] * 7.68), [0, TY, 0]));
    OF.S = Lr; rotorOpts(OF, c, AF, st.genV[k] * 7.68); OF.lime = .12 * st.gen[k]; X_(CL.gtgR, X.mul(Ws, Lr), OF);
    const Lg = X.mul(L, X.make(R.z(st.genA[k]), [0, 0, 0]));
    OF.S = Lg; rotorOpts(OF, c, AF, st.genV[k]); OF.lime = .25 * st.brk[k]; X_(CL.gtgG, X.mul(Ws, Lg), OF);
    OF.lime = 0; OF.keep = 1; OF.a = AF;
  });
  SWB.forEach((sw, k) => { const L = SWL[k] || (SWL[k] = X.make(R.y(sw.ry), sw.o)); O.S = L; fset(O, sw.o, 1.2, 1); X_(CL.swb[sw.n === 6 ? 0 : 1], X.mul(Ws, L), O); });
  PUMPS.forEach((p, i) => {
    const L = X.make(R.I(), p.p); O.S = L; fset(O, p.p, 1.1, 1); X_(CL.pump, X.mul(Ws, L), O);
    const t0 = CLU[0] - 2.4, on = ss(t0 + .2 * i, t0 + .6 + .2 * i, u), Lc = X.make(R.mul(R.y(on * (u - t0) * 9 + i), PUMP_R), [p.p[0], p.p[1] + .48, p.p[2]]);
    OF.S = Lc; fset(OF, p.p, AF, 1); X_(CL.pcpl, X.mul(Ws, Lc), OF);
  });
  SHAFT.forEach((sh, i) => {
    const Lb = X.make(R.mul(alignZ(sh.d), R.z(st.shA[i])), sh.a);
    O.S = Lb; fset(O, V.mad(sh.a, sh.d, 6), 1.2, 1); O.lime = .08 * Math.min(1, st.sh[i] / SH_RPM); X_(CL.shaft[i], X.mul(Ws, Lb), O); O.lime = 0;
  });
  O.S = null; OF.S = null; O.keep = OF.keep = 1; O.a = 1.1; OF.a = AF;
}
/* the PT (and its coupling shaft) is held on its brake until the clutch is in, then turns with the input pinion */
function ptAngle(g, st) { const i = MESH['I' + g.sx]; return i.c + i.k * st.shA[g.mi]; }
/* the end-on view of LM2500 1B's combustor */
const eoAt = u => kk(u, U_EO[0], U_EO[1]) * (1 - kk(u, U_EO[2], U_EO[3]));
/* the exploded view (gear set 1): the input pinions slide forward out of mesh, the quill-shaft assemblies (first-
   reduction gear and second-reduction pinion on one shaft) move out radially, the bull gear back along its shaft;
   each part flashes lime as its tag comes up */
const xpAt = u => kk(u, U_XP[0], U_XP[1]) * (1 - kk(u, U_XP[2], U_XP[3]));
const XPT = [U_XP[1] - .6, U_XP[1] - .1, U_XP[1] + .4, U_XP[1] + .9];     // tags: input pinion, first reduction, second reduction, bull gear
const XQ = [DXI / Math.hypot(DXI, DYG), DYG / Math.hypot(DXI, DYG)];
let XPV = 0;
function drawGears(m, mi, st, Ws, u) {
  const X_ = EPROF ? profX : P_.drawX, al = st.shA[mi], bx = m.bx, zb = ZB(m), zg = ZG(m), lit = .25 * E.sat(st.sh[mi] / 8), xp = mi ? 0 : xpAt(u);
  if (!mi) XPV = xp;
  const hl = j => xp > .01 ? .1 * xp + .55 * lockU(u, XPT[j], 1.8) : 0;
  const put = (cl, c, k, x, y, z, j) => { const L = X.make(R.z(c + k * al), [x, y, z]); OF.S = L; Q3[0] = x; Q3[1] = y; Q3[2] = z; fset(OF, Q3, AF, .9); OF.lime = lit * .6 + hl(j); X_(cl, X.mul(Ws, L), OF); };
  const px0 = OF.px; OF.px = px0 * 1.5;
  put(CL.bull, 0, 1, bx, YA, zb - 1.0 * xp, 3);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) { const p = MESH['P' + sx + sy], g = MESH['G' + sx + sy], ox = sx * XQ[0] * .9 * xp, oy = sy * XQ[1] * .9 * xp;
      put(CL.p2, p.c, p.k, bx + sx * DXI + ox, YA + sy * DYG + oy, zb, 2); put(CL.g1, g.c, g.k, bx + sx * DXI + ox, YA + sy * DYG + oy, zg + .2 * xp, 1); }
    const i = MESH['I' + sx]; put(CL.gi, i.c, i.k, bx + sx * DXI + sx * .2 * xp, YA, zg + 1.3 * xp, 0);
  }
  OF.lime = 0; OF.a = AF; OF.px = px0;
}
/* the reactor plant: the vessel and its internals, the core, the rod banks, both loops, the pressurizer */
function drawRX(u, st, Ws, X_) {
  if (!(XW.zo < 24.5)) return;
  const Wm = X.mul(Ws, MIRX);
  OF.S = null; OF.lime = 0; fset(OF, FC_RV, AF, 1); X_(CL.rv, Ws, OF);
  OC.S = null; fset(OC, FC_RV, AF * (.38 + .42 * st.nf), 1); OC.tk = .6 * st.heat; OC.lime = .12 * st.nf * (1 - st.heat); OC.a *= 1 + .25 * st.heat; X_(CL.core, Ws, OC);
  for (let b = 0; b < 3; b++) { const L = RODL[b]; L.T[1] = st.rod[b]; OF.S = L; fset(OF, FC_RV, AF, 1); OF.lime = .3 + .45 * st.rodM[b]; X_(CL.rod[b], X.mul(Ws, L), OF); }
  OF.lime = 0;
  for (let m = 0; m < 2; m++) {
    const W = m ? Wm : Ws, S = m ? MIRX : null;
    O.S = S; fset(O, m ? FC_SGm : FC_SG, 1.25, 1); X_(CL.loop, W, O);
    OF.S = S; fset(OF, m ? FC_SGm : FC_SG, AF, 1); X_(CL.sg, W, OF); OF.a *= .55 - .25 * ss(U_SGV[0], U_SGV[1], u) * (1 - ss(U_SGV[2], U_SGV[3], u)); OF.keep *= .7; X_(CL.ut, W, OF); fset(OF, m ? FC_SGm : FC_SG, AF, 1);
    fset(OF, m ? FC_RCPm : FC_RCP, AF, 1); X_(CL.rcp, W, OF);
    const Lp = X.make(R.y(st.rcpA), [RCPX, RCPY, RCPZ]), Lq = m ? X.mul(MIRX, Lp) : Lp;
    OF.S = Lq; rotorOpts(OF, m ? FC_RCPm : FC_RCP, AF, st.rcpV); X_(CL.rcpR, X.mul(Ws, Lq), OF);
  }
  OF.S = null; OF.keep = 1; fset(OF, FC_PZ, AF, 1); X_(CL.pz, Ws, OF);
  O.S = null; O.keep = 1; OF.keep = 1; OF.a = AF;
}
/* the turbine room: both sets (turbines, condensers, generators), the feed pumps; the railgun switchboards */
function drawTG(u, st, Ws, X_) {
  if (!(XW.zo < 36.5)) return;
  for (let m = 0; m < 2; m++) {
    const L = m ? TGLm : TGL, c = m ? FC_TGm : FC_TG;
    const Lw = X.mul(Ws, L);
    OF.S = L; fset(OF, c, AF, 1); X_(CL.tg, Lw, OF);
    fset(OF, c, AF * .5, .42); X_(CL.tgU, Lw, OF);                      // the upper halves, ghosted
    fset(OF, c, AF * 1.25, 1); X_(CL.cnd, Lw, OF); fset(OF, c, AF, 1);
    const La = X.mul(L, X.make(R.z(st.tgA * (m ? -1 : 1)), [0, 0, 0]));
    OF.S = La; rotorOpts(OF, c, AF, st.tgV); OF.lime = .08 * st.tg; X_(CL.tgR, X.mul(Ws, La), OF);
    OF.lime = .12 * st.tg; X_(CL.genR, X.mul(Ws, La), OF); OF.lime = 0;
    const Lf = m ? MIRX : ID; OF.S = Lf; fset(OF, m ? FC_FPm : FC_FP, AF, 1); X_(CL.fp, X.mul(Ws, Lf), OF);
    const Ls = m ? RSLm : RSL; O.S = Ls; fset(O, m ? FC_RSm : FC_RS, 1.3, 1); X_(CL.rsw, X.mul(Ws, Ls), O);
    // the breaker trucks: the feeders rack in (lime while they move and as their fingers mate), lit once closed
    for (let j = 0; j < 3; j++) { const c = RCUB[j], off = rackOff(j, u, m);
      const Lb = X.mul(Ls, X.make(R.I(), [c.x, c.y, off])), mv = j && u > T_RACK[0] - .2 && u < fdrT(j, m) + .6 ? 1 : 0;
      OF.S = Lb; fset(OF, m ? FC_RSm : FC_RS, AF, 1); OF.lime = (j ? (u > fdrT(j, m) ? .3 : .45 * mv) : u > T_ON ? .25 : 0); X_(CL.rbk, X.mul(Ws, Lb), OF); }
    OF.lime = 0;
  }
  O.S = null; OF.S = null; O.keep = OF.keep = 1; OF.a = AF;
}
/* the railgun power room as it stands before the mount wakes (the parts module's clouds) */
let ALT_L = null, MOD_L = null;
function drawRoom(u, ctx, Ws) {
  const X_ = EPROF ? profX : P_.drawX, C_ = ctx.CL;
  if (!ALT_L) { ALT_L = P_.ALT.map((c, k) => X.make(P_.ALT_FLIP[k] ? R.y(PI) : R.I(), c)); MOD_L = P_.MOD.map(m => X.make(m.s > 0 ? R.I() : R.y(PI), m.p)); }
  const o = OR, kr = .6; o.S = null; o.a = .5; o.keep = .5; X_(C_.floor, Ws, o); o.a = .85; o.keep = kr;
  X_(C_.racks, Ws, o); X_(C_.cab, Ws, o); X_(C_.over, Ws, o); o.lime = .3 * ss(T_PULSE + 4, T_PULSE + 6.5, u); X_(C_.bus, Ws, o); o.lime = 0;
  for (let k = 0; k < 4; k++) { const L = ALT_L[k]; o.S = L; const Lw = X.mul(Ws, L); X_(C_.body, Lw, o); X_(C_.bell, Lw, o); X_(C_.exc, Lw, o); X_(C_.fan, Lw, o); X_(C_.rotor, Lw, o); }
  if (window.RGB) RGB.drawStatic(Ws, o, X_, kr, ss(T_PULSE + 2, T_PULSE + 6.5, u));
  o.S = null; o.a = .85; o.keep = 1;
}

/* ================= effects: the gas turbine plant ================= */
const lockU = (u, t0, d) => { const a = u - t0; return a > 0 && a < (d || .8) ? Math.exp(-a * 5 * .8 / (d || .8)) : 0; };
function fxGT(u, st, Ws) {
  if (XW.zo > 9) return;
  const odot = P_.odot, oglow = P_.oglow, fc = CK.fx(u);
  // generator sets: the six cans light, rim streaks on the turbine, the generator's poles once it carries load
  GTGS.forEach((g, k) => {
    const L = X.mul(Ws, GTGL[k]), [ts, tl] = GT_T[k], n = st.gen[k];
    if (!isOpen(X.ap(GTGL[k], [0, 0, 5.8])[2])) return;
    const lo = lockU(u, tl), on = ss(tl, tl + .25, u);
    if (on > .01) for (let c = 0; c < 6; c++) {
      const a = c / 6 * TAU + PI / 6, f = .55 + .45 * K.hh(c + k * 7, Math.floor(fc * 20));
      for (let z = 5.45; z < 6.2; z += .07) { apI(L, Math.cos(a) * .42, TY + Math.sin(a) * .42, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, HOT, on * f * .9); }
      apI(L, Math.cos(a) * .42, TY + Math.sin(a) * .42, 5.8, Q1); oglow(Q1[0], Q1[1], Q1[2], 16 + 30 * lo, LIME, (.3 + .6 * lo) * on);
    }
    if (n > .03) streaks(L, 0, TY, [4.05, 6.45], [.33, .35], st.genA[k] * 7.68, E.sat(st.genV[k] * 7.68 / 3), 1, 10);
    if (u > ts && u < tl + .4) { apI(L, 0, -.2, 2.9, Q1); oglow(Q1[0], Q1[1], Q1[2], 12, LIME, .4 * ss(ts, ts + .2, u) * (1 - ss(tl, tl + .4, u))); }
    if (n > .3) { const Lg = X.mul(L, X.make(R.z(st.genA[k]), [0, 0, 0])); for (let p = 0; p < 4; p++) { const a = p * PI / 2; for (let j = 0; j < 8; j++) { apI(Lg, Math.cos(a - j * .06) * .57, Math.sin(a - j * .06) * .57, 1.25, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, (.3 + .5 * st.brk[k]) * (1 - j / 8)); } } }
  });
  // the main engines: the starter, light-off round the nozzle ring (the flame front runs round from the igniters),
  // the flame annulus, the hot gas through the turbines, rim streaks
  for (const g of GTM) {
    const [ts, tl] = GM_T[g.id]; if (u < ts - .1) continue;
    const Lw = X.mul(Ws, LG[g.id]); if (!isOpen(g.o[2] + 4)) continue;
    const sg = g.mi ? -1 : 1, aG = st.ggA[g.id] * sg, xf = XF_T[g.id], slow = xf > 1;
    if (u < tl + .5) {
      const a = ss(ts, ts + .15, u) * (1 - ss(tl + (slow ? 2 : .2), tl + (slow ? 4 : .5), u));
      if (a > .01) { apI(Lw, -.17, -.83, 6.15, Q1); K.ringW(Q1, X.dir(Lw, [1, 0, 0]), X.dir(Lw, [0, 1, 0]), .15, 28, 1, LIME, .8 * a, aG * 3); oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .35 * a); }
    }
    const on = ss(tl, tl + (slow ? 1.2 : .3), u);
    if (on > .01) {
      const lo = lockU(u, tl + xf * .5, slow ? 3 : .8);
      for (let k = 0; k < 30; k++) {
        const kd = Math.abs(k - 16), d = Math.min(kd, 30 - kd) / 15, t1 = tl + d * xf, lit = ss(t1, t1 + (slow ? .45 : .05), u);
        if (lit < .01) continue;
        const f = .6 + .4 * K.hh(k + g.mi * 31, Math.floor(fc * 24)), a = k / 30 * TAU, c = Math.cos(a), sn = Math.sin(a), fl = lockU(u, t1, slow ? 1.2 : .3);
        apI(Lw, c * .66, sn * .66, 4.15, Q1); odot(Q1[0], Q1[1], Q1[2], 3, HOT, lit * f);
        for (let j = 1; j < 14; j++) { const w = j / 14, sw = .05 * Math.sin(j * 1.7 + k + fc * 9); apI(Lw, Math.cos(a + sw) * (.64 - .13 * w), Math.sin(a + sw) * (.64 - .13 * w), 4.1 - .75 * w * (.55 + .45 * lit), Q2); odot(Q2[0], Q2[1], Q2[2], j < 6 ? 2 : 1, j < 4 ? HOT : LIME, lit * f * (1 - .7 * w)); }
        const ge = g.id === '1B' ? 1 - .7 * eoAt(u) : 1;
        oglow(Q1[0], Q1[1], Q1[2], (24 + 40 * fl) * ge, LIME, (.45 + .55 * fl) * lit * f * ge); oglow(Q1[0], Q1[1], Q1[2], 9, HOT, (.5 + .5 * fl) * lit * ge);
      }
      for (let k = 0; k < 180; k++) { const a = k / 180 * TAU + aG * .05, ka = (Math.round(a / TAU * 30) % 30 + 30) % 30, kd = Math.abs(ka - 16), lit = ss(tl + Math.min(kd, 30 - kd) / 15 * xf, tl + Math.min(kd, 30 - kd) / 15 * xf + .3, u);
        if (lit < .01) continue; const fl = .5 + .5 * K.hh(k + g.mi * 7, Math.floor(fc * 30));
        apI(Lw, Math.cos(a) * .5, Math.sin(a) * .5, 3.95 - .25 * K.hh(k, 4), Q2); odot(Q2[0], Q2[1], Q2[2], 2, fl > .7 ? HOT : LIME, on * lit * (.4 + .6 * fl)); }
      apI(Lw, 0, 0, 3.9, Q1); oglow(Q1[0], Q1[1], Q1[2], 60 + 80 * lo, LIME, .18 * on + .5 * lo);
      const ct = CK.turb(u);
      for (let k = 0; k < 48; k++) { const ph = frac(ct / 2.1 + K.hh(k, 3)), a = K.hh(k, 9) * TAU + aG * .3, r = .45 + .07 * K.hh(k, 5), z = 3.8 - ph * 2.1;
        apI(Lw, Math.cos(a) * r, Math.sin(a) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, HOT, on * .55 * (1 - ph)); }
    }
    const vr = st.ggV[g.id]; if (st.gg[g.id] > .05) streaks(Lw, 0, 0, [6.22, 5.5, 4.7, 3.4], [.53, .5, .47, .52], aG, E.sat(vr / 3) * .9 + .1, 1, 12);
    const ps = st.sh[g.mi] / SH_RPM; if (ps > .05) streaks(Lw, 0, 0, [2.75, 1.7], [.58, .75], ptAngle(g, st), E.sat(st.shV[g.mi] * RATIO / 3), -1, 12);
  }
  { const eo = eoAt(u); if (eo > .01) combSection(X.mul(Ws, LG['1B']), u, eo, fc); }
  if (u > U_SCAN[0] - .6 && u < U_SCAN[1] + 1) { const g = GTM1B(); scanFX(SC_GT, u, X.mul(Ws, LG['1B']), r => r.rot === 'g' ? st.ggA['1B'] : r.rot === 'p' ? ptAngle(g, st) : 0); }
  plumes(u, Ws, fc);
  for (let mi = 0; mi < 2; mi++) meshFX(MER[mi], mi, st, Ws, u);
  SWB.forEach((sw, k) => swbFX(sw, k, u, st, Ws));
  PL.gen.forEach((pl, k) => pulses(pl, u, GT_T[k][3] - .05, LEN + 1, 2.4, .35, .6, Ws, LIME, 1));
  GTM.forEach((g, k) => { const [ts, tl] = GM_T[g.id]; pulses(PL.air[k], u, ts - .45, tl + (XF_T[g.id] > 1 ? 1.5 : .3), 3.0, .25, .8, Ws, WH, 1); });
  SHAFT.forEach((sh, i) => { const r = st.sh[i] / SH_RPM; if (r < .02) return;
    for (const c of sh.cpl) { const p = V.mad(sh.a, sh.d, c); if (!isOpen(p[2])) continue;
      const Lb = X.mul(Ws, X.make(R.mul(alignZ(sh.d), R.z(st.shA[i])), sh.a));
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; apI(Lb, Math.cos(a) * .46, Math.sin(a) * .46, c + .14, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .3 + .5 * r); } } });
}
const GTM1B = () => GTM.find(q => q.id === '1B');
/* end-on: the annular combustor's section at its domes (an X-ray slice): the casings and liners, thirty swirl cups;
   the igniters spark, then the flame front runs round both ways from them and each cup's flame blooms (a cone seen
   end-on) */
function combSection(L, u, eo, fc) {
  const odot = P_.odot, z = 4.12, tl = GM_T['1B'][1], xf = XF_T['1B'];
  for (const [r, a] of [[.42, .55], [.47, .85], [.64, .85], [.66, .55], [.76, .35]]) for (let k = 0; k < 48; k++) { const a0 = k / 48 * TAU, a1 = (k + 1) / 48 * TAU;
    apI(L, Math.cos(a0) * r, Math.sin(a0) * r, z, Q1); apI(L, Math.cos(a1) * r, Math.sin(a1) * r, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2, 1, WH, a * eo); }
  for (let k = 0; k < 30; k++) {
    const a = k / 30 * TAU, cx = Math.cos(a) * .555, cy = Math.sin(a) * .555;
    for (let j = 0; j < 18; j++) { const b = j / 18 * TAU; apI(L, cx + Math.cos(b) * .034, cy + Math.sin(b) * .034, z + .02, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .95 * eo); }
    for (let j = 0; j < 8; j++) { const b = j / 8 * TAU + .3; apI(L, cx + Math.cos(b) * .016, cy + Math.sin(b) * .016, z + .02, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .7 * eo); }
    const kd = Math.abs(k - 16), t1 = tl + Math.min(kd, 30 - kd) / 15 * xf, lit = ss(t1, t1 + .45, u);
    if (lit < .01) continue;
    const fl = lockU(u, t1, 1.2);
    for (let j = 0; j < 40; j++) { const h1 = K.hh(k * 31 + j, 3.7), h2 = K.hh(k * 17 + j, Math.floor(fc * 30) + j), rr = (.012 + .075 * Math.sqrt(h1)) * lit * (.8 + .3 * h2), b = K.hh(j, k + 9.1) * TAU;
      apI(L, cx + Math.cos(b) * rr, cy + Math.sin(b) * rr * .9, z - .04 - .25 * h1 * h1, Q1); odot(Q1[0], Q1[1], Q1[2], rr < .035 ? 2 : 1, rr < .035 ? HOT : LIME, eo * lit * (.55 + .45 * h2)); }
    apI(L, cx, cy, z - .05, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 12 + 26 * fl, LIME, eo * (.35 + .5 * fl) * lit); P_.oglow(Q1[0], Q1[1], Q1[2], 6, HOT, eo * .6 * lit);
  }
  // the flame front: two bright heads running round both ways from the igniters' cup, a lime arc trailing each
  const fr = (u - tl) / xf;
  if (fr > 0 && fr < 1.1) for (const sg of [-1, 1]) {
    const af = 16 / 30 * TAU + sg * E.sat(fr) * PI, fa = 1 - E.sat((fr - 1) * 10);
    for (let j = 0; j < 30; j++) { const a = af - sg * j * .022, w = 1 - j / 30; apI(L, Math.cos(a) * .555, Math.sin(a) * .555, z - .04, Q1); P_.odot(Q1[0], Q1[1], Q1[2], j < 5 ? 3 : 2, j < 8 ? HOT : LIME, eo * w * fa); }
    apI(L, Math.cos(af) * .555, Math.sin(af) * .555, z - .04, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 46, LIME, .85 * eo * fa); P_.oglow(Q1[0], Q1[1], Q1[2], 16, HOT, .95 * eo * fa);
  }
  if (u > tl - .9 && u < tl + .5) for (const a of [190 * DEG, 235 * DEG]) { apI(L, Math.cos(a) * .7, Math.sin(a) * .7, 3.95, Q1); apI(L, Math.cos(a) * .6, Math.sin(a) * .6, 4.0, Q2); K.arcW(Q1, Q2, 7 + a, u * 3, eo * .9, .8); }
}

/* ================= the scan plane: a lime plane runs down a machine, naming each row as it passes =================
   rows: { d (the plane's coordinate there), zs (the row's axial stations), h, t (hub, tip radius), n blades, ph (their
   phase), rot (which rotor turns it), lab, val, num (its number on the ruler), w (slots), gap }; slots are equal time */
/* (round 3: rows gathered in groups, each named by one tag for an equal share of the pass, 1.5 s or more; the rows
   of a group share its time; the ruler still numbers every row) */
function mkScan(rows, u0, u1, d0, d1, rc, numA, zOf, groups) {
  if (groups) { const n = groups.map((_, g) => rows.filter(r => r.g === g).length); for (const r of rows) r.w = 1 / n[r.g]; }
  let sl = 0; for (const r of rows) { r.slot = sl + (r.w || 1) / 2; sl += (r.w || 1) + (r.gap || 0); }
  const S = { rows, slots: sl, u0, u1, d0, d1, rc, numA, zOf, groups: groups || null };
  if (groups) groups.forEach((G_, g) => { const rs = rows.filter(r => r.g === g), a = rs[0], b = rs[rs.length - 1];
    G_.t0 = u0 + (a.slot - a.w / 2) / sl * (u1 - u0); G_.t1 = u0 + (b.slot + b.w / 2) / sl * (u1 - u0); G_.tip = Math.max(...rs.map(r => r.t)); });
  return S;
}
const rng_ = (a, b) => a === b ? `${a}` : `${a}–${b}`;
const SC_GT = (() => { const R = [{ d: 6.3, zs: [6.3], h: .26, t: .545, n: 34, ph: .02, rot: null, num: 'IGV', g: 0 }];
  COMP.forEach((c, i) => R.push({ d: c.z, zs: [c.z], h: c.h, t: c.t, n: c.n, ph: i * .13, rot: 'g', num: String(i + 1), g: i < 6 ? 1 : 2 }));
  R.push({ d: 3.95, zs: [3.95], h: .45, t: .66, n: 0, rot: null, num: 'C', g: 3 });
  HPT.forEach((h, i) => R.push({ d: h.z, zs: [h.z], h: h.h, t: h.t, n: h.n, ph: i * .2, rot: 'g', num: 'H' + (i + 1), g: 4 }));
  PTR.forEach((q, j) => R.push({ d: q.z, zs: [q.z], h: q.h, t: q.t, n: q.n, ph: j * .17, rot: 'p', num: 'P' + (j + 1), g: 5 }));
  const GR_ = [{ id: 'IGV', lab: 'Inlet guide vanes · variable', val: '34 vanes' },
    { id: 'C1–6', lab: 'Compressor stages 1–6 · variable stators', val: `${rng_(COMP[0].n, COMP[5].n)} blades` },
    { id: 'C7–16', lab: 'Compressor stages 7–16', val: `${rng_(COMP[6].n, COMP[15].n)} blades · 18 : 1` },
    { id: 'CMB', lab: 'Combustor · annular', val: '30 fuel nozzles' },
    { id: 'HPT', lab: 'HP turbine · 2 stages · drives the compressor', val: `${HPT[0].n} + ${HPT[1].n} blades` },
    { id: 'PT', lab: 'Power turbine · 6 stages · to the gear', val: `${rng_(PTR[0].n, PTR[5].n)} blades · brake on` }];
  return mkScan(R, U_SCAN[0], U_SCAN[1], 6.6, 1.4, .82, 58 * DEG, d => [d], GR_); })();
const SC_HP = mkScan(HPS.map((h, k) => ({ d: h.z, zs: [h.z], h: h.h, t: h.t, n: h.n, ph: k * .17, rot: 't', num: String(k + 1), g: k ? (k < 6 ? 1 : 2) : 0 })),
  U_HPS[0], U_HPS[1], .05, 2.0, .8, 115 * DEG, d => [d],
  [{ id: 'HP1', lab: 'HP stage 1 · steam in at 6.0 MPa', val: `${HPS[0].n} blades` }, { id: 'HP2–6', lab: 'HP stages 2–6 · impulse wheels, shrouded', val: `${rng_(HPS[1].n, HPS[5].n)} blades` },
    { id: 'HP7', lab: 'HP stage 7 · out to the crossover', val: `${HPS[6].n} blades` }]);
const SC_LP = mkScan(LPS.map((q, k) => ({ d: q.d, zs: [LZC - q.d, LZC + q.d], h: q.h, t: q.t, n: q.n, ph: k * .21, rot: 't', num: 'L' + (k + 1), g: k < 3 ? 0 : k - 2 })),
  U_LPS[0], U_LPS[1], .05, 1.5, 1.34, 115 * DEG, d => [LZC - d, LZC + d],
  [{ id: 'LP1–3', lab: 'LP stages 1–3 · both flows · shrouded', val: `${rng_(LPS[0].n, LPS[2].n)} blades` }, { id: 'LP4', lab: 'LP stage 4 · both flows', val: `${LPS[3].n} blades · ${Math.round((LPS[3].t - LPS[3].h) * 100)} cm` },
    { id: 'LP5', lab: 'LP last stage · lacing wire', val: `${LPS[4].n} blades · ${Math.round((LPS[4].t - LPS[4].h) * 100)} cm` }]);
const SCQ = { d: 0, i: -1 };
function scanAt(S, u) {
  const s = (u - S.u0) / (S.u1 - S.u0) * S.slots, R_ = S.rows, n = R_.length;
  let d;
  if (s <= R_[0].slot) d = S.d0 + (R_[0].d - S.d0) * E.sat(s / R_[0].slot);
  else if (s >= R_[n - 1].slot) { const a = R_[n - 1]; d = a.d + (S.d1 - a.d) * E.sat((s - a.slot) / (S.slots - a.slot)); }
  else { let i = 0; while (R_[i + 1].slot < s) i++; const a = R_[i], b = R_[i + 1]; d = a.d + (b.d - a.d) * (s - a.slot) / (b.slot - a.slot); }
  let i = -1; for (let k = 0; k < n; k++) if (s >= R_[k].slot - .5 * (R_[k].w || 1)) i = k;
  SCQ.d = d; SCQ.i = s < 0 || s > S.slots ? -1 : i; return SCQ;
}
const passT = (S, r) => S.u0 + r.slot / S.slots * (S.u1 - S.u0);
function scanFX(S, u, L, rotA) {
  const A = ss(S.u0 - .5, S.u0, u) * (1 - ss(S.u1, S.u1 + .8, u)); if (A < .01) return;
  const q = scanAt(S, u), fc = CK.fx(u);
  for (const z of S.zOf(q.d)) {
    for (let k = 0; k < 64; k++) { const a = k / 64 * TAU, b = (k + 1) / 64 * TAU; apI(L, Math.cos(a) * S.rc, Math.sin(a) * S.rc, z, Q1); apI(L, Math.cos(b) * S.rc, Math.sin(b) * S.rc, z, Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.3, 1, LIME, .95 * A, LIME, .1, .03); }
    for (let k = 0; k < 64; k++) { const a = k / 64 * TAU, b = (k + 1) / 64 * TAU, r = S.rc * .985; apI(L, Math.cos(a) * r, Math.sin(a) * r, z, Q1); apI(L, Math.cos(b) * r, Math.sin(b) * r, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2.5, 1, LIME, .45 * A); }
    for (let k = 0; k < 220; k++) { const r = S.rc * (.2 + .8 * Math.sqrt(K.hh(k, 5.1))), a = K.hh(k, 6.3) * TAU + fc * .7; apI(L, Math.cos(a) * r, Math.sin(a) * r, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, A * .55 * K.hh(k, Math.floor(fc * 20))); }
  }
  for (const r of S.rows) {
    const age = u - passT(S, r); if (age < -.05 || age > 1.6) continue;
    const f = A * Math.exp(-Math.max(0, age) * 2.2), ang = rotA(r);
    for (const z of r.zs) {
      for (let k = 0; k < r.n; k++) { const a = r.ph + k / r.n * TAU + ang, c = Math.cos(a), sn = Math.sin(a);
        apI(L, c * r.h, sn * r.h, z, Q1); apI(L, c * r.t, sn * r.t, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.6, 1, LIME, f, LIME, .05); }
      circ3(L, r.t + .005, z, 240, LIME, .9 * f, 1); circ3(L, r.h, z, 160, LIME, .7 * f, 1);
    }
  }
}
/* rim streaks: lime arcs trailing at the tips of a spinning row (local z axis through (cx, cy)); rt 0..1 the speed */
function streaks(L, cx, cy, zs, rs, ang, rt, dir, nd) {
  const len = Math.min(2.4, .12 + 2.2 * rt);
  for (let r = 0; r < zs.length; r++) for (let m = 0; m < 3; m++) {
    const a0 = ang + m * TAU / 3 + r;
    for (let j = 0; j < nd; j++) { const a = a0 - dir * len * j / nd, w = 1 - j / nd;
      apI(L, cx + Math.cos(a) * rs[r], cy + Math.sin(a) * rs[r], zs[r], Q1); P_.odot(Q1[0], Q1[1], Q1[2], j < 2 ? 2 : 1, j ? LIME : HOT, (.5 + .5 * rt) * w); }
  }
}
/* stack exhaust: shimmering dots rising from the outlets */
function plumes(u, Ws, fc) {
  for (let q = 0; q < 7; q++) {
    let x, z, r, a;
    if (q < 4) { const g = GTM[q], tl = GM_T[g.id][1]; if (u < tl) continue; x = g.xo; z = g.zo; r = .62; a = ss(tl, tl + 1, u); }
    else { const g = GTGS[q - 4], tl = GT_T[q - 4][1]; if (u < tl) continue; x = g.xo; z = g.zo; r = .32; a = ss(tl, tl + 1, u); }
    if (!isOpen(z)) continue;
    for (let i = 0; i < 26; i++) {
      const life = 1.6, t0 = K.hh(i, q * 3.1) * life, f = ((fc + t0) % life) / life;
      const an = K.hh(i, q + 5) * TAU, rr = r * Math.sqrt(K.hh(i, q + 9)) * (1 + 1.6 * f);
      apI(Ws, x + Math.cos(an) * rr + .8 * f * f, 22.2 + 5.5 * f, z + Math.sin(an) * rr - .4 * f, Q1);
      P_.odot(Q1[0], Q1[1], Q1[2], 1, WH, a * .5 * (1 - f) * (1 - f));
    }
  }
}
function meshFX(m, mi, st, Ws, u) {
  const cf = lockU(u, CLU[mi]);
  if (cf > .02 && isOpen(m.zc)) for (const sx of [-1, 1]) {
    apI(Ws, m.bx + sx * DXI, YA, ZG(m) + .95, Q1); K.ringW(Q1, X.dir(Ws, [1, 0, 0]), X.dir(Ws, [0, 1, 0]), .36 + .25 * (1 - cf), 64, 1, LIME, cf, u * 4);
    P_.oglow(Q1[0], Q1[1], Q1[2], 40, LIME, .5 * cf);
  }
  const r = st.sh[mi]; if (r < .2 || !isOpen(m.zc)) return;
  const I = Math.min(1, r / 6) * (.6 + .4 * Math.sin(u * 9)), bx = m.bx, zb = ZB(m), zg = ZG(m);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const th = Math.atan2(sy * DYG, sx * DXI), cx = bx + Math.cos(th) * GR.rb, cy = YA + Math.sin(th) * GR.rb;
    for (const [z0, z1] of [[zb - GR.fb / 2, zb - GR.gb / 2], [zb + GR.gb / 2, zb + GR.fb / 2]]) { apI(Ws, cx, cy, z0, Q1); apI(Ws, cx, cy, z1, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.4, 1, LIME, .75 * I); }
    const gy = YA + sy * (DYG - GR.rg), gx = bx + sx * DXI;
    apI(Ws, gx, gy, zg - GR.fg / 2, Q1); apI(Ws, gx, gy, zg + GR.fg / 2, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.4, 1, LIME, .75 * I);
  }
}
/* the ship service switchboards: breaker, meters, the synchroscope, lamps, feeders */
function swbFX(sw, k, u, st, Ws) {
  if (!isOpen(sw.o[2])) return;
  const L = X.mul(Ws, SWL[k]), [, , tr, tb] = GT_T[k], c = st.brk[k], gen = st.gen[k];
  const la = (-55 + 110 * c) * DEG;
  apI(L, .5, .92, .05, Q1); apI(L, .5 + Math.sin(la) * .2, .92 + Math.cos(la) * .2, .05, Q2);
  K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 2, c > .5 ? LIME : WH, .95);
  const fl = lockU(u, tb + .12);
  if (fl > .02) { P_.oglow(Q2[0], Q2[1], Q2[2], 26, LIME, .6 * fl); apI(L, .4, 1.38, .05, Q1); apI(L, .6, 1.42, .05, Q3); K.arcW(Q1, Q3, 31 + k, u, fl * 1.5, .7); }
  const load = c * (.35 + .1 * ss(tb, tb + 3, u)), vv = gen > .9 ? 450 * ss(tr - .4, tr, u) : 450 * gen * gen, hz = gen > .5 ? 55 + 5 * E.sat((gen - .5) * 2) : 55;
  dials(L, [load * 2500 / 3000, load * 3200 / 4000, vv / 600, E.sat((hz - 55) / 10)]);
  const sa = k === 0 ? PI / 2 : PI / 2 - 1.8 * TAU * Math.pow(Math.max(0, tb - u), 1.5) * (u > tr - .3 ? 1 : 0);
  apI(L, 1.5, 1.12, .03, Q1); apI(L, 1.5 + Math.cos(sa) * .08, 1.12 + Math.sin(sa) * .08, .03, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, u > tr - .3 ? LIME : WH, .85);
  for (let j = 0; j < 4; j++) { apI(L, 1.25 + j * .166, .86, .02, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 2, j === 0 && c > .5 ? LIME : WH, j === 0 ? (c > .5 ? 1 : .2) : (gen > .9 ? .55 : .12)); if (j === 0 && c > .5) P_.oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .4); }
  for (let i = 2; i < sw.n; i++) for (let r = 0; r < 2; r++) for (let cc = 0; cc < 3; cc++) {
    const t = tb + .25 + ((i - 2) * 6 + r * 3 + cc) * .05, on = u > t, bx = i + .12 + cc * .27 + .11, by = .55 + r * .62 + .21;
    apI(L, bx, by, .035, Q1); apI(L, bx, by + (on ? .07 : -.07), .045, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1, 1, on ? LIME : WH, on ? .9 : .5);
    const f = lockU(u, t); if (f > .05) P_.oglow(Q2[0], Q2[1], Q2[2], 8, LIME, .5 * f);
  }
}
/* the meters on a board's section 1: values 0..1 */
function dials(L, vals) {
  for (let j = 0; j < 4; j++) { const [cx, cy] = SW_DIALS[j], a = PI / 2 + 135 * DEG - 270 * DEG * vals[j], x0 = 1 + cx;
    apI(L, x0, cy, .03, Q1); apI(L, x0 + Math.cos(a) * .065, cy + Math.sin(a) * .065, .03, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, vals[j] > .02 ? LIME : WH, .9); }
}
/* charge pulses crawling along a polyline (ship frame, mirrored in x by mir), only where the hull is open */
function pulses(pl, u, t0, t1, speed, gap, I, Ws, col, mir) {
  if (!pl) return;
  const A = I * ss(t0, t0 + .25, u) * (1 - ss(t1 - .4, t1, u)); if (A < .01) return;
  const front = (u - t0) * speed * 1.5, off = ((u - t0) * speed) % gap;
  for (let s = off; s < pl.L && s < front; s += gap) {
    P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue;
    apI(Ws, Q2[0] * mir, Q2[1] + .05, Q2[2], Q1);
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
/* a stream of dots along a poly at clock c (m travelled), mirrored in x by mir, through the transform L; lanes
   jittered round the centre line by rj; zo: the ship z of L's origin (the window is tested in the ship frame; round 3:
   it was tested on the world point, which hid every flow) */
function flow(pl, c, gap, col, A, mir, L, rj, sz, s0, s1, zo) {
  if (A < .01) return;
  const k0 = Math.ceil(((s0 || 0) - c) / gap), k1 = Math.floor(((s1 === undefined ? pl.L : s1) - c) / gap);
  for (let k = k0; k <= k1; k++) {
    const s = c + k * gap; P_.polyAt(pl, s, Q2);
    const j1 = (K.hh(k, 3.3) - .5) * rj, j2 = (K.hh(k, 4.7) - .5) * rj, j3 = (K.hh(k, 5.9) - .5) * rj;
    if (!isOpen(Q2[2] + (zo || 0))) continue; apI(L, (Q2[0] + j1) * mir, Q2[1] + j2, Q2[2] + j3, Q1);
    const e = Math.min(1, (s - (s0 || 0)) / .3, ((s1 === undefined ? pl.L : s1) - s) / .3);
    P_.odot(Q1[0], Q1[1], Q1[2], sz, col, A * (.55 + .45 * K.hh(k, 8.1)) * E.sat(e));
  }
}

/* ================= effects: the reactor plant ================= */
const SGQ = [0, 0, 0];
function fxRX(u, st, Ws) {
  if (!(XW.zo < 24.5)) return;
  const odot = P_.odot, oglow = P_.oglow, fc = CK.fx(u), cp = CK.prim(u), cx = RV[0], cz = RV[1];
  // neutrons: short lime tracks flickering through the core, sparse from the source, dense once critical
  if (st.nf > .01 && isOpen(cz)) {
    const n = Math.round(60 + 1000 * st.nf * st.nf), life = .1 + .35 * st.nf;
    for (let i = 0; i < n; i++) {
      const a = ASM[Math.floor(K.hh(i, 1) * ASM.length)], x = cx + a[0] * PITCH + (K.hh(i, 2) - .5) * .2, z = cz + a[1] * PITCH + (K.hh(i, 3) - .5) * .2, y = CORE0 + .05 + K.hh(i, 4) * (CORE1 - CORE0 - .1);
      const ph = frac(fc * (1.2 + 2.5 * K.hh(i, 5)) + K.hh(i, 6)); if (ph > life) continue;
      const f = 1 - ph / life, d = (1 - f) * .07, dx = K.hh(i, 7) - .5, dy = K.hh(i, 8) - .5, dz = K.hh(i, 9) - .5;
      apI(Ws, x + dx * d, y + dy * d, z + dz * d, Q1); odot(Q1[0], Q1[1], Q1[2], f > .4 ? 2 : 1, LIME, (.55 + .45 * st.nf) * f);
      if (f > .8 && (i & 7) === 0) oglow(Q1[0], Q1[1], Q1[2], 9, LIME, .3 * f * st.nf);
    }
    apI(Ws, cx, (CORE0 + CORE1) / 2, cz, Q1); oglow(Q1[0], Q1[1], Q1[2], 70 + 60 * st.nf, LIME, .04 + .3 * st.nf * st.nf);   // (round 3: the flux climbing, seen)
  }
  // heat: the core glows as the power comes up
  if (st.heat > .01 && isOpen(cz)) {
    apI(Ws, cx, (CORE0 + CORE1) / 2, cz, Q1); oglow(Q1[0], Q1[1], Q1[2], 120, HOT, .2 * st.heat); oglow(Q1[0], Q1[1], Q1[2], 60, LIME, .18 * st.heat);
    for (let k = 0; k < ASM.length; k += 2) { const [i, j] = ASM[k]; apI(Ws, cx + i * PITCH, CORE1 + .08, cz + j * PITCH, Q1); oglow(Q1[0], Q1[1], Q1[2], 10, HOT, (.2 + .2 * K.hh(k, Math.floor(fc * 8))) * st.heat); }
  }
  // the rods: tips lit as they move; the drive coils pulse as they step
  for (const [i, j, b] of RODS) {
    const x = cx + i * PITCH, z = cz + j * PITCH, h = st.rod[b], mv = st.rodM[b];
    if (mv) for (const y of [1.97, 2.21, 2.47]) { const on = K.hh(i * 7 + j * 3 + y * 10, Math.floor(fc * 14)) > .45; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; apI(Ws, x + Math.cos(a) * .14, y, z + Math.sin(a) * .14, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, on ? .95 : .3); } }
    if (mv || h > .01) for (const [dx, dz] of RODQ) { apI(Ws, x + dx, -3.42 + h, z + dz, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .5 + .5 * mv); }
    if (mv) { apI(Ws, x, -1.9 + h, z, Q1); oglow(Q1[0], Q1[1], Q1[2], 12, LIME, .35); }
  }
  // the coolant: down the downcomer, up through the core and out to the hot legs
  const fA = st.rcp;
  if (fA > .01 && isOpen(cz)) {
    for (let i = 0; i < 120; i++) { const a = K.hh(i, 11) * TAU, ph = frac(cp / 3.0 + K.hh(i, 12)), y = -.8 - ph * 2.9, r = 1.07;
      apI(Ws, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, Q1); odot(Q1[0], Q1[1], Q1[2], 2, WH, .7 * fA * Math.sin(PI * ph)); }
    for (let i = 0; i < 200; i++) { const a = ASM[Math.floor(K.hh(i, 13) * ASM.length)], ph = frac(cp / 3.2 + K.hh(i, 14)), y = -3.55 + ph * 2.95;
      apI(Ws, cx + a[0] * PITCH + (K.hh(i, 15) - .5) * .18, y, cz + a[1] * PITCH + (K.hh(i, 16) - .5) * .18, Q1);
      const hot = E.sat((y - CORE0) / (CORE1 - CORE0)) * st.heat; odot(Q1[0], Q1[1], Q1[2], 2, hot > .3 ? HOT : WH, (.45 + .55 * hot) * fA * Math.sin(PI * ph)); }
  }
  // both loops
  for (let m = 0; m < 2; m++) {
    const mir = m ? -1 : 1, hotA = fA * (.55 + .45 * st.heat);
    flow(PLP.hot, cp, .07, HOT, .95 * hotA, mir, Ws, .3, 2);
    flow(PLP.cold1, cp, .08, WH, .75 * fA, mir, Ws, .28, 2); flow(PLP.cold2, cp, .08, WH, .75 * fA, mir, Ws, .28, 2);
    // the U-tubes: primary water up the hot legs, round the bends, down the cold legs
    if (fA > .01 && isOpen(SGZ)) for (let t = 0; t < UT.length; t++) { const [zo, a] = UT[t], Lu = 2 * (UB + 1.0) + PI * a;
      for (let j = 0; j < 5; j++) { const q = frac(cp / Lu + j / 5 + .13 * K.hh(t, j + 1)); uAt(SGX, SGZ + zo, a, q, SGQ); apI(Ws, SGQ[0] * mir, SGQ[1], SGQ[2], Q1); odot(Q1[0], Q1[1], Q1[2], 2, q < .5 ? HOT : WH, hotA * (1 - .45 * q)); } }
    // the secondary side boils: bubbles off the bundle, rising and growing, bursting at the surface; steam on up
    // through the separators (swirling) and the dryer to the outlet
    const boil = st.heat * ss(T_CRIT + .8, T_FULL, u);
    if (boil > .01 && isOpen(SGZ)) {
      const cb = CK.bub(u), cs = CK.steam(u) * .1, nb = m ? 200 : 900;
      for (let i = 0; i < nb; i++) {
        // three in five nucleate on the tubes (mostly the hot legs, inboard), the rest through the bundle
        let x0, z0; const y0 = -.9 + K.hh(i, 23) * 1.4;
        if (i % 5 < 3) { const t = UT[Math.floor(K.hh(i, 26) * UT.length)]; x0 = SGX + (K.hh(i, 27) < .72 ? -t[1] : t[1]) + (K.hh(i, 28) - .5) * .03; z0 = SGZ + t[0] + (K.hh(i, 29) - .5) * .03; }
        else { const r = .84 * Math.sqrt(K.hh(i, 21)), a = K.hh(i, 22) * TAU; x0 = SGX + Math.cos(a) * r; z0 = SGZ + Math.sin(a) * r; }
        const v = .6 + .8 * K.hh(i, 24), H = SGW - y0, ph = frac(cb * v / H + K.hh(i, 25)), y = y0 + ph * H, wob = .025 * Math.sin(ph * 14 + i) * Math.min(1, ph * 4);
        apI(Ws, (x0 + wob) * mir, y, z0 + .6 * wob, Q1);
        const bA = boil * (.6 + .4 * ph) * E.sat((1 - ph) * 12); K.ringW(Q1, K.C.r, K.C.u, .012 + .04 * ph, 9, 1, WH, bA, i); if (!m) oglow(Q1[0], Q1[1], Q1[2], 5 + 7 * ph, WH, .2 * bA);
      }
      for (let i = 0; i < (m ? 80 : 420); i++) { const r = 1.25 * Math.sqrt(K.hh(i, 31)), a = K.hh(i, 32) * TAU;
        apI(Ws, (SGX + Math.cos(a) * r) * mir, SGW + .025 * Math.sin(fc * 5 + i * 1.7), SGZ + Math.sin(a) * r, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, boil * (.45 + .4 * K.hh(i, Math.floor(fc * 10)))); }
      // the steam up the middle of each separator, on through the dryer and out
      for (let i = 0; i < (m ? 70 : 300); i++) { const sp = SEPS[i % 7], ph = frac(cs * (.8 + .4 * K.hh(i, 41)) + K.hh(i, 42)), y = SGW + .1 + ph * 1.45;
        let x = SGX + sp[0], z = SGZ + sp[1];
        if (y < 2.42) { const sw = ph * 30 + i; x += Math.cos(sw) * .05; z += Math.sin(sw) * .05; } else if (y > 2.9) { const w = (y - 2.9) / .65; x += (SGX - x) * w; z += (SGZ - z) * w; } else { x += (K.hh(i, 43) - .5) * .5; z += (K.hh(i, 44) - .5) * .5; }
        apI(Ws, x * mir, y, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, boil * .55 * Math.sin(PI * ph)); }
      // the swirl vanes spin the wet steam: the water is flung out to the barrel wall, over its lip, and falls back
      // outside it to the water (the separators' drains)
      const cd = CK.bub(u) * 1.7;
      for (let i = 0; i < (m ? 84 : 490); i++) { const sp = SEPS[i % 7], ph = frac(cd * (.7 + .5 * K.hh(i, 45)) / 1.1 + K.hh(i, 46)), a0 = K.hh(i, 47) * TAU;
        let r, a, y;
        if (ph < .45) { const f = ph / .45; a = a0 + f * 9; r = .03 + .125 * f * f; y = 1.95 + .42 * f; }
        else if (ph < .58) { const f = (ph - .45) / .13; a = a0 + 9 + f * 1.5; r = .155 + .07 * f; y = 2.37 + .07 * Math.sin(PI * f); }
        else { const f = (ph - .58) / .42; a = a0 + 10.5 + f * .4; r = .225 + .03 * f; y = 2.4 - (2.4 - SGW) * f * f; }
        const da = ph < .45 ? .22 : 0;
        for (let j = 0; j < (ph < .45 ? 5 : 3); j++) { const aj = a - j * da * .8, rj = r * (1 - j * .06);
          apI(Ws, (SGX + sp[0] + Math.cos(aj) * rj) * mir, y - j * (ph < .45 ? .01 : -.018), SGZ + sp[1] + Math.sin(aj) * rj, Q1); odot(Q1[0], Q1[1], Q1[2], j ? (j < 2 ? 2 : 1) : 3, HOT, boil * (ph < .45 ? .55 + .4 * ph / .45 : .95) * (1 - j * .17)); }
        if (!m && (i & 1)) { apI(Ws, (SGX + sp[0] + Math.cos(a) * r) * mir, y, SGZ + sp[1] + Math.sin(a) * r, Q1); oglow(Q1[0], Q1[1], Q1[2], 5, WH, .28 * boil); }
        if (!m && ph > .43 && ph < .5 && (i & 1)) oglow(Q1[0], Q1[1], Q1[2], 7, LIME, .45 * boil);
      }
      // the feedwater: from the ring down the downcomer
      for (let i = 0; i < (m ? 30 : 90); i++) { const a = K.hh(i, 51) * TAU, ph = frac(CK.feed(u) * .5 + K.hh(i, 52)), y = 1.45 - ph * 2.3, r = .78 + .14 * Math.min(1, ph * 4);
        apI(Ws, (SGX + Math.cos(a) * r) * mir, y, SGZ + Math.sin(a) * r, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .5 * st.fp * Math.sin(PI * ph)); }
    }
    // steam to the turbines, feedwater back, the condensate
    flow(PLP.steam, CK.steam(u), .07, WH, .9 * st.steam, mir, Ws, .22, 2);
    flow(PLP.feed, CK.feed(u), .12, LIME, .7 * st.fp, mir, Ws, .1, 2);
    flow(PLP.cond, CK.feed(u), .12, LIME, .6 * st.fp, mir, Ws, .1, 2);
  }
  // the pressurizer: heaters glowing, the water's surface, bubbles off the heaters, the steam space
  if (isOpen(PZ[1])) {
    const hA = st.heaters;
    for (const [x, z] of PZH) for (let y = -2.05; y < -.8; y += .05) { apI(Ws, x, y, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, HOT, .3 + .6 * hA * (.7 + .3 * K.hh(x * 9 + y * 20, Math.floor(fc * 12)))); }
    for (let i = 0; i < 70; i++) { const r = .53 * Math.sqrt(K.hh(i, 61)), a = K.hh(i, 62) * TAU; apI(Ws, PZ[0] + Math.cos(a) * r, PZW + .02 * Math.sin(fc * 4 + i), PZ[1] + Math.sin(a) * r, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .35); }
    if (hA > .05) for (let i = 0; i < 80; i++) { const hz = PZH[i % PZH.length], ph = frac(CK.bub(u) * .5 + K.hh(i, 63)), y = -1.9 + ph * (PZW + 1.9);
      apI(Ws, hz[0] + .03 * Math.sin(ph * 9 + i), y, hz[1], Q1); odot(Q1[0], Q1[1], Q1[2], 2, WH, .75 * hA * (1 - ph)); }
  }
}

/* ================= effects: the turbine room ================= */
const FLD = [-.5, -.25, 0, .25, .5];
function fxTG(u, st, Ws) {
  if (!(XW.zo < 36.5)) return;
  const odot = P_.odot, oglow = P_.oglow, fc = CK.fx(u), ct = CK.turb(u);
  for (let m = 0; m < 2; m++) {
    const L = X.mul(Ws, m ? TGLm : TGL), sa = st.steam, th = st.tgA * (m ? -1 : 1), full = !m;
    if (!isOpen(TGO[2] + 2)) continue;
    // the steam: through the HP on streamlines between hub and tips, zigzagging as each nozzle turns it and each wheel
    // turns it back; over the crossover; out both ways through the LP, the annulus growing as it expands, then
    // turning down through the neck into the condenser
    if (sa > .01) {
      const nh = full ? 32 : 8, nl = full ? 40 : 10, ns = full ? 20 : 10;
      for (let l = 0; l < nh; l++) { const f = .15 + .7 * K.hh(l, 81), a0 = K.hh(l, 82) * TAU;
        streamline(L, (q, o) => hpSteam(f, a0, q, o), ns, ct / 2.2 + K.hh(l, 83), sa, full); }
      flow(PLP.cross, ct, .06, WH, .8 * sa, 1, L, .3, 2, 0, undefined, TGO[2]);
      for (let l = 0; l < nl; l++) { const sd = l & 1 ? 1 : -1, f = .12 + .76 * K.hh(l, 84), a0 = K.hh(l, 85) * TAU;
        streamline(L, (q, o) => lpSteam(f, a0, sd, q, o), ns, ct / 1.9 + K.hh(l, 86), sa, full); }
      // the condenser: the exhaust down the neck and the lanes into the bundles, condensing on the tubes; the
      // condensate raining off them into the hotwell, rings where it lands
      const cf = CK.feed(u), U_ = X.dir(L, [1, 0, 0]), W_ = X.dir(L, [0, 0, 1]);
      for (let i = 0; i < (full ? 300 : 40); i++) { const x = (K.hh(i, 87) - .5) * 2.4, lane = Math.abs(x) < .12 || Math.abs(x) > 1.08, ph = frac(cf * .55 + K.hh(i, 88)), z = CS0 + .1 + K.hh(i, 89) * (CS1 - CS0 - .2);
        const y = -1.45 - ph * (lane ? 1.7 : .55); apI(L, x, y, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, sa * .75 * (1 - ph) * Math.min(1, ph * 10)); }
      for (let i = 0; i < (full ? 560 : 70); i++) { const tb = CTUBE[Math.floor(K.hh(i, 90) * CTUBE.length)], ph = frac(cf * (.45 + .3 * K.hh(i, 91)) + K.hh(i, 92)), z = CS0 + .1 + K.hh(i, 93) * (CS1 - CS0 - .2);
        const x = tb[0] + (K.hh(i, 94) - .5) * .02, inW = Math.abs(x) < .83 && z > 3.12 && z < 4.88, land = inW ? -3.85 : -3.5, y0 = tb[1] - .02, y = y0 - (y0 - land) * ph * ph;
        for (let t = 0; t < 4; t++) { apI(L, x, y + t * (.012 + .03 * ph), z, Q1); odot(Q1[0], Q1[1], Q1[2], t ? 1 : 2, LIME, sa * (.95 - .2 * t)); }
        if (i & 1) { apI(L, x, y, z, Q1); oglow(Q1[0], Q1[1], Q1[2], 5, LIME, .3 * sa); }
        if (inW && ph > .9 && full && i % 3 === 0) { const g = (ph - .9) / .1; apI(L, x, -3.85, z, Q1); K.ringW(Q1, U_, W_, .02 + .1 * g, 14, 1, LIME, sa * .6 * (1 - g), i); } }
      for (let i = 0; i < (full ? 200 : 40); i++) { const x = (K.hh(i, 95) - .5) * 1.66, z = 3.12 + K.hh(i, 96) * 1.76; apI(L, x, -3.85 + .006 * Math.sin(fc * 3 + i), z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .4 * sa); }
      // (round 3) the condensate curtain: sheets of drops falling off the bundles' undersides into the hotwell
      if (full) for (const sx of [-1, 1]) for (let zi = 0; zi < 24; zi++) for (let li = 0; li < 6; li++) {
        const i = (sx > 0 ? 1000 : 0) + zi * 6 + li, x = sx * (.18 + li * .14 + (K.hh(i, 131) - .5) * .05), z = CS0 + .1 + (zi + K.hh(i, 132)) / 24 * (CS1 - CS0 - .2);
        const land = Math.abs(x) < .83 && z > 3.12 && z < 4.88 ? -3.85 : -3.5, y0 = -3.33, ph = frac(cf * (.9 + .4 * K.hh(i, 133)) + K.hh(i, 134)), y = y0 - (y0 - land) * ph * ph, l = .02 + .07 * ph;
        apI(L, x, y, z, Q1); apI(L, x, y + l, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, 1, LIME, sa * .75 * Math.min(1, (1 - ph) * 8));
      }
    }
    // seawater: through the tubes aft to forward; spreading from the inlet nozzle across the aft tube sheet, gathering
    // off the forward one to the outlet
    if (st.fp > .01) {
      const cs = CK.sea(u);
      // (round 3) streaks along the tubes (every third tube; every ninth on the far set), brighter while the lens is on it
      const cA = st.fp * (.5 + .5 * ss(U_CND[0] - 1, U_CND[0] + .5, u) * (1 - ss(U_CND[1] - .5, U_CND[1] + .5, u)));
      for (let t = 0; t < CTUBE.length; t += full ? 3 : 9) { const [x, y] = CTUBE[t], o = (t % 7) * .086;
        for (let k = Math.ceil((CS0 - cs - o) / .6); ; k++) { const z = cs + o + k * .6; if (z - .2 > CS1) break; if (z < CS0) continue;
          const z0 = Math.max(CS0, z - .2), z1 = Math.min(CS1, z); apI(L, x, y, z1, Q1); apI(L, x, y, z0, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, 1, WH, .6 * cA, WH, .02); } }
      // the waterboxes: the seawater fanning out from the inlet nozzle across the aft tube sheet, gathering off the
      // forward one to the outlet
      for (let i = 0; i < (full ? 260 : 40); i++) { const tb = CTUBE[Math.floor(K.hh(i, 97) * CTUBE.length)], ph = frac(cs * .9 + K.hh(i, 98)), b = Math.sin(PI * ph);
        apI(L, 1.3 + (tb[0] - 1.3) * ph, -3.0 + (tb[1] + 3.0) * ph, CS0 - .2 + .2 * ph - .14 * b, Q1); odot(Q1[0], Q1[1], Q1[2], 2, WH, .7 * cA * Math.min(1, b * 3));
        apI(L, tb[0] + (1.2 - tb[0]) * ph, tb[1] + (-1.95 - tb[1]) * ph, CS1 + .3 * ph + .14 * b, Q1); odot(Q1[0], Q1[1], Q1[2], 2, WH, .7 * cA * Math.min(1, b * 3)); }
      flow(PLP.seaIn, cs, .09, WH, .6 * st.fp, m ? -1 : 1, Ws, .25, 2); flow(PLP.seaOut, cs, .09, WH, .6 * st.fp, m ? -1 : 1, Ws, .25, 2);
    }
    if (full) { scanFX(SC_HP, u, L, () => th); scanFX(SC_LP, u, L, () => th); }
    // rim streaks on the blading
    if (st.tg > .02) { const rt = E.sat(st.tgV / 2.5); streaks(L, 0, 0, [HPS[0].z, HPS[3].z, HPS[6].z], [HPS[0].t, HPS[3].t, HPS[6].t], th, rt, m ? -1 : 1, 8);
      streaks(L, 0, 0, [LZC - LPS[4].d, LZC - LPS[2].d, LZC + LPS[2].d, LZC + LPS[4].d], [LPS[4].t, LPS[2].t, LPS[2].t, LPS[4].t], th, rt, m ? -1 : 1, 10); }
    // the generator: the rotor's field (lime field lines from the N pole out through the stator and round to the
    // S pole, a field lobe turning in the air gap), the current alternating in the stator's slots and end windings as
    // the poles sweep past (lime one way, white the other), the poles lit (N lime, S white)
    const fld = st.tg;
    if (fld > .01 && isOpen(TGO[2] + 8)) {
      const sc = ss(U_GEN[0], U_GEN[0] + 1.2, u) * (1 - ss(U_GEN[1] - .8, U_GEN[1] + .4, u)), gv = ss(U_GEN[0] - 1.0, U_GEN[0] + .6, u) * (1 - ss(U_GEN[1] - .6, U_GEN[1] + .6, u));
      const cv = ss(T_ON - .2, T_ON + .3, u) * (.55 + .45 * st.load);       // (the pattern's brightness: the stator carries the load from T_ON)
      if (sc > .01) genSection(L, th, fld * sc, cv * sc, fc, full);
      if (u > U_GEN[0] - .4 && u < U_GEN[0] + 1.6) { const rv = ss(U_GEN[0] - .4, U_GEN[0] + 1.4, u), zs = GZ0 - .7 + (GZM - GZ0 + .7) * rv, k = Math.sin(PI * E.sat((u - U_GEN[0] + .4) / 2.0));
        circ3(L, 1.02, zs, 240, LIME, .95 * k, 2); circ3(L, .8, zs, 200, LIME, .5 * k, 1); circ3(L, .55, zs, 150, LIME, .7 * k, 1); }
      for (const pa of [th, th + PI]) for (let z = GZ0 + .2; z < GZ1; z += .55) { apI(L, Math.cos(pa) * .51, Math.sin(pa) * .51, z, Q1); oglow(Q1[0], Q1[1], Q1[2], 14, pa === th ? LIME : WH, .3 * fld); }
      if (full && gv > .01) {
        // the field lobe: rings of dots in the air gap along the core, bright where the poles' flux crosses it
        for (let z = GZ0 + .15; z < GZ1; z += .3) for (let k = 0; k < 90; k++) { const a = k / 90 * TAU, c = Math.cos(a - th), ac = Math.abs(c); if (ac < .35) continue;
          apI(L, Math.cos(a) * .545, Math.sin(a) * .545, z, Q1); odot(Q1[0], Q1[1], Q1[2], ac > .9 ? 2 : 1, c > 0 ? LIME : WH, gv * fld * (ac - .35) / .65); }
        // the slots' bars (in the kept sector) and the end windings (all round): the current crawling along them
        const cw = gv * cv;
        if (cw > .01) for (let k = 0; k < NSL; k++) {
          const a = SLA(k), I = SLS[k] * -Math.cos(th - (PI / 2 - SLP[k] * TAU / 3)), aI = Math.abs(I), col = aI < .3 ? WH : I > 0 ? LIME : HOT, A = cw * (.2 + .8 * aI * aI);
          const off = frac(u * .9 * Math.sign(I)) * .09;
          if (inSec(a, TGC[0], TGC[1])) for (const r of SLR) { const c = Math.cos(a) * r, sn = Math.sin(a) * r; for (let z = GZ0 + off; z < GZ1; z += .09) { apI(L, c, sn, z, Q1); odot(Q1[0], Q1[1], Q1[2], aI > .8 ? 2 : 1, col, A); } }
          for (const e of [ENDW[k], ENDW[NSL + k]]) { const pl = e.pl; for (let s = off; s < pl.L; s += .09) { P_.polyAt(pl, s, Q2); apI(L, Q2[0], Q2[1], Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], 1, col, A * .85); } }
        }
      }
      // the output up the bus duct: three phases pulsing in turn, running forward to the switchboard
      const ld = cv;
      if (ld > .01) for (let k = 0; k < 3; k++) { const pl = PL.bus[k], ph = Math.abs(Math.sin(th - k * TAU / 3)), off = (u * 2.2) % .3;
        for (let s = off; s < pl.L; s += .3) { P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue; apI(Ws, Q2[0] * (m ? -1 : 1), Q2[1], Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, ld * (.25 + .75 * ph)); } }
    }
    // the feed pump's coupling turning
    if (st.fp > .02) { apI(Ws, 1.0 * (m ? -1 : 1), -4.3, 31.12, Q1); K.ringW(Q1, X.dir(Ws, [1, 0, 0]), X.dir(Ws, [0, 1, 0]), .21, 24, 1, LIME, .7 * st.fp, st.fpA); }
    rswFX(u, st, Ws, m);
  }
}
/* steam streamlines (turbine-set local): the HP between hub and tips, zigzagging as each nozzle turns the steam and
   each wheel turns it back; the LP out from the middle both ways, the annulus growing as it expands, then down
   through the neck into the condenser */
function hpSteam(f, a0, q, o) { const z = .12 + q * 1.86, kf = E.clamp((z - .35) / .23, 0, 6), x = frac((z - .35 + .115) / .23), tz = .44 + .025 * kf, r = .3 + f * (tz - .3), a = a0 + .06 * kf + .22 * (x < .5 ? x * 2 : 2 - x * 2);
  o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r; o[2] = z; return o; }
function lpSteam(f, a0, sd, q, o) {
  if (q < .8) { const dz = .06 + q / .8 * 1.38, kf = E.clamp((dz - .22) / .27, 0, 4), k0 = Math.floor(Math.min(3.999, kf)), tz = LPS[k0].t + (LPS[k0 + 1].t - LPS[k0].t) * (kf - k0), xs = frac((dz - .22 + .13) / .27);
    const r = .42 + f * (tz + .02 - .42), a = a0 - sd * (.05 * kf + .18 * (xs < .5 ? xs * 2 : 2 - xs * 2)); o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r; o[2] = LZC + sd * dz; return o; }
  const g = (q - .8) / .2, a = a0 - sd * .2, r = .42 + f * (1.22 - .42), x0 = Math.cos(a) * r, y0 = Math.sin(a) * r;
  o[0] = x0 * (1 - .1 * g); o[1] = y0 + (-1.6 - y0) * g * g; o[2] = LZC + sd * (1.44 + .05 * g); return o;
}
/* a streamline drawn as a faint dotted path, with packets of steam running along it (a head, a tail, a soft glow);
   the packets spread apart as the steam expands */
const SA = [0, 0, 0], SB = [0, 0, 0];
function streamline(L, fn, ns, c, sa, full) {
  for (let k = 0; k < ns; k++) { fn(k / ns, SA); fn((k + 1) / ns, SB); apI(L, SA[0], SA[1], SA[2], Q1); apI(L, SB[0], SB[1], SB[2], Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 2.6, 1, WH, .2 * sa); }
  // (round 3) the packets streak: each a bright line through the passages, its tail fading behind it
  const np = full ? 5 : 2;
  for (let j = 0; j < np; j++) { const q0 = frac(c + j / np), e = Math.min(1, q0 * 10) * Math.min(1, (1 - q0) * 12);
    fn(Math.pow(q0, .85), SA); apI(L, SA[0], SA[1], SA[2], Q1);
    for (let t = 1; t <= 5; t++) { const q = q0 - t * .014; if (q < 0) break; fn(Math.pow(q, .85), SB); apI(L, SB[0], SB[1], SB[2], Q2);
      K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.1, t < 2 ? 2 : 1, WH, sa * e * (1.05 - t / 5.5)); Q1[0] = Q2[0]; Q1[1] = Q2[1]; Q1[2] = Q2[2]; }
    if (full) { fn(Math.pow(q0, .85), SA); apI(L, SA[0], SA[1], SA[2], Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 7, WH, .3 * sa * e); } }
}
/* the generator's cross-section at its middle (an X-ray slice): rotor, air gap and stator core, the poles lit, the
   field lines out of the N pole across the gap, round the core both ways and into the S pole (dashes crawling N to
   S), the field coils' sides, the stator conductors lit by their phase's current (lime one way, white the other) */
const GZM = (GZ0 + GZ1) / 2;
function circ3(L, r, z, n, col, a, sz) { for (let k = 0; k < n; k++) { const t = (k + .5) / n * TAU; apI(L, Math.cos(t) * r, Math.sin(t) * r, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], sz, col, a); } }
function genSection(L, th, fld, ld, fc, full) {
  const odot = P_.odot, z = GZM;
  circ3(L, .5, z, 160, WH, .6, 1); circ3(L, .58, z, 180, WH, .5, 1); circ3(L, .9, z, 280, WH, .45, 1);
  for (let k = 0; k < NSL; k++) { const a = SLA(k); for (const b of [a - SLW, a + SLW]) for (let r = .585; r < .75; r += .016) { apI(L, Math.cos(b) * r, Math.sin(b) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .4); }
    for (let j = -2; j <= 2; j++) { const b = a + j * SLW / 2; apI(L, Math.cos(b) * .75, Math.sin(b) * .75, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, WH, .4); } }
  for (let i = 0; i < (full ? 900 : 120); i++) { const r = .58 + .32 * Math.sqrt(K.hh(i, 91)), a = K.hh(i, 92) * TAU; apI(L, Math.cos(a) * r, Math.sin(a) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .32 * fld); }
  for (const pa of [th, th + PI]) {
    for (let k = -16; k <= 16; k++) { const a = pa + k * .3 / 16; apI(L, Math.cos(a) * .505, Math.sin(a) * .505, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, fld); }
    for (let m = 0; m < 4; m++) for (const sg of [-1, 1]) { const a = pa + sg * (24 + m * 12) * DEG; apI(L, Math.cos(a) * .47, Math.sin(a) * .47, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, WH, .8 * fld); }
    apI(L, Math.cos(pa) * .5, Math.sin(pa) * .5, z, Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 34, LIME, .4 * fld);
  }
  // the field's axis through the rotor (S to N), turning with it: the rotating field
  { const c = Math.cos(th), s = Math.sin(th); apI(L, -c * .42, -s * .42, z, Q1); apI(L, c * .44, s * .44, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.6, 2, LIME, .95 * fld);
    for (const sg of [-1, 1]) { const b = th + PI + sg * .45; apI(L, c * .44 + Math.cos(b) * .1, s * .44 + Math.sin(b) * .1, z, Q3); K.lineW(Q2[0], Q2[1], Q2[2], Q3[0], Q3[1], Q3[2], 1.6, 2, LIME, .95 * fld); } }
  for (let i = -4; i <= 4; i++) {
    if (!i) continue;
    const ai = Math.abs(i), d = (i < 0 ? -1 : 1) * (.05 + .07 * ai), sg = i < 0 ? -1 : 1, rk = .88 - .055 * ai, a0 = th + d, sw = PI - 2 * Math.abs(d), st = .012;
    let sd = 0;
    for (let r = .51; r < rk; r += st, sd += st) { apI(L, Math.cos(a0) * r, Math.sin(a0) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, fld * dash(sd / .14 - fc * 1.4)); }
    const ns = Math.ceil(sw * rk / st);
    for (let k = 0; k <= ns; k++, sd += st) { const a = a0 + sg * sw * k / ns; apI(L, Math.cos(a) * rk, Math.sin(a) * rk, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .9 * fld * dash(sd / .14 - fc * 1.4)); }
    const a1 = a0 + sg * sw;
    for (let r = rk; r > .51; r -= st, sd += st) { apI(L, Math.cos(a1) * r, Math.sin(a1) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, fld * dash(sd / .14 - fc * 1.4)); }
    for (let f = 0; f < 1; f += .02) { const x = Math.cos(a1) * .49 * (1 - 2 * f), y = Math.sin(a1) * .49 * (1 - 2 * f); apI(L, x, y, z, Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .35 * fld * dash(f * 6 - fc * 1.4)); }
  }
  if (ld > .01) for (let k = 0; k < NSL; k++) { const a = SLA(k), v = SLS[k] * -Math.cos(th - (PI / 2 - SLP[k] * TAU / 3)) * ld, c = v > 0 ? LIME : HOT, av = Math.abs(v);
    for (const r of SLR) { apI(L, Math.cos(a) * r, Math.sin(a) * r, z, Q1); odot(Q1[0], Q1[1], Q1[2], 3, c, .2 + .8 * av); }
    if (av > .8) P_.oglow(Q1[0], Q1[1], Q1[2], 16, c, .4 * (av - .8) / .2); }
}
const dash = x => { const f = frac(x); return f < .55 ? .35 + .65 * Math.sin(f / .55 * PI) : .1; };
/* the railgun switchboards: the incomer in since T_ON (its lamp, the meters: MW, A, kV, Hz; the mimic lit); the
   feeders rack in (their fingers lime as they reach and mate with the stabs), then close: an arc struck in each pole's
   chute, drawn up into the splitter plates and quenched, the plates lit bottom to top; the main bus carries the load
   (dashes crawling from the incomer to the feeders), the droppers and the feeders' cables lit once they carry it */
const LW = (L, a, b, w, col, A) => { apI(L, a[0], a[1], a[2], Q1); apI(L, b[0], b[1], b[2], Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.2, w, col, A); };
const RA = [0, 0, 0], RB = [0, 0, 0];
function rswFX(u, st, Ws, m) {
  if (!isOpen(38.2)) return;
  const L = X.mul(Ws, m ? RSLm : RSL), on = u > T_ON ? 1 : 0, ld = st.load * on, odot = P_.odot, oglow = P_.oglow;
  dials(L, [ld * 25 / 30, ld * 3470 / 5000, on * 4.16 / 6, on * .5]);
  apI(L, 1.5, 1.12, .03, Q1); apI(L, 1.5, 1.2, .03, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], .8, 1, on ? LIME : WH, .85);
  const cl = j => j ? u > fdrT(j, m) : on > 0;
  for (let j = 0; j < 4; j++) { const lit = j < 3 ? cl(j) : on > 0; apI(L, 1.25 + j * .166, .86, .02, Q1); odot(Q1[0], Q1[1], Q1[2], 2, lit ? LIME : WH, lit ? 1 : .25); if (lit) oglow(Q1[0], Q1[1], Q1[2], 8, LIME, .35); }
  // the mimic: the bus across, the incomer's drop and the two feeders' drops
  if (on) { LW(L, [1.12, 2.15, .01], [1.88, 2.15, .01], 1, LIME, .8); LW(L, [1.2, 2.15, .01], [1.2, 2.06, .01], 1, LIME, .8);
    for (const j of [1, 2]) LW(L, [1.6 + .14 * j, 2.15, .01], [1.6 + .14 * j, 2.06, .01], 1, cl(j) ? LIME : WH, cl(j) ? .8 : .35); }
  for (const j of [1, 2]) {
    const c = RCUB[j], off = rackOff(j, u, m), tc = fdrT(j, m), mate = 1 - E.sat(off / .05);
    // the fingers reaching the stabs
    if (u > T_RACK[0] - .2 && u < tc + 1.5) for (let p = 0; p < 3; p++) for (const y of RSY) {
      apI(L, c.x + rPole(p), c.y + y, -.64 + off, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, .45 + .55 * mate);
      if (mate > .3) oglow(Q1[0], Q1[1], Q1[2], 9, LIME, .35 * mate * (1 - E.sat((u - tc - .5) / 1))); }
    // closing: the arcs in the chutes, the plates lit as the arc is drawn up and quenched
    const f = lockU(u, tc, 1.1);
    if (f > .02) for (let p = 0; p < 3; p++) {
      const x = c.x + rPole(p);
      RA[0] = x; RA[1] = c.y + .6; RA[2] = -.36; RB[0] = x; RB[1] = c.y + .66 + .2 * Math.min(1, (u - tc) * 6); RB[2] = -.36;
      apI(L, RA[0], RA[1], RA[2], Q3); apI(L, RB[0], RB[1], RB[2], Q4); if (f > .25) K.arcW(Q3, Q4, 60 + p + j * 3 + m * 7, u, (f - .2) * 2.2, .75);
      oglow(Q4[0], Q4[1], Q4[2], 26, LIME, .65 * f); oglow(Q3[0], Q3[1], Q3[2], 10, HOT, .7 * f);
      for (let k = 0; k < 8; k++) { const g = E.sat(1 - Math.abs((1 - f) * 9 - k) / 3) * f, y = c.y + .66 + k * .025; if (g > .02) LW(L, [x - .07, y, -.47], [x + .07, y, -.47], 1, LIME, g); }
    }
    // closed: the dropper and the feeder's cable carry the current
    if (u > tc) { const A = .55 * E.sat((u - tc) / .4) * (.5 + .5 * ld);
      for (let p = 0; p < 3; p++) { const x = c.x + rPole(p); LW(L, [x, RBY - .05, RBUS[p]], [x, c.y + RSY[0], RBUS[p]], 1, LIME, A); LW(L, [x, c.y + RSY[1], -.93], [x, RSW_H, -.93], 1, LIME, A); } }
  }
  // the bus: the bars live once the incomer is in; the load crawling along them from the incomer to the feeders
  if (on) for (let p = 0; p < 3; p++) { const zb = RBUS[p], A = .3 + .5 * ld, sp = .12, o0 = (u * (.4 + 1.2 * ld) + p * .04) % sp;
    for (let x = .5 + o0; x < 2.55; x += sp) { apI(L, x, RBY + .052, zb, Q1); odot(Q1[0], Q1[1], Q1[2], 2, LIME, A); } }
}
/* the one pulse followed forward: released as the second feeders close, along the starboard feeder's middle cable
   (a tracer for the current's path, not its speed) */
const PULSE_V = 2.4;
const pulseS = u => Math.max(0, (u - T_PULSE) * PULSE_V);
/* the pulse: a bright head with a comet's tail along the cable, the cable behind it lit (it carries current now); a
   flash at the drive it reaches, whose terminal stays lit */
function pulseFX(u, Ws) {
  if (u < T_PULSE - .05) return;
  const pl = PL.pulse, s = pulseS(u), A = 1 - ss(LEN - 1.5, LEN, u); if (A < .01) return;
  const odot = P_.odot, oglow = P_.oglow, sh = Math.min(s, pl.L);
  for (let q = .06; q < sh; q += .1) { P_.polyAt(pl, q, Q2); apI(Ws, Q2[0], Q2[1] + .04, Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .45 * A); }
  if (s < pl.L + .3) {
    for (let j = 0; j < 26; j++) { const q = s - j * .045; if (q < 0 || q > pl.L) continue; P_.polyAt(pl, q, Q2); apI(Ws, Q2[0], Q2[1] + .04, Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], j < 3 ? 3 : 2, j < 2 ? HOT : LIME, A * (1 - j / 26)); }
    P_.polyAt(pl, sh, Q2); apI(Ws, Q2[0], Q2[1] + .04, Q2[2], Q1); oglow(Q1[0], Q1[1], Q1[2], 34, LIME, .7 * A); oglow(Q1[0], Q1[1], Q1[2], 10, HOT, .8 * A);
  }
  const ta = T_PULSE + pl.L / PULSE_V, f = lockU(u, ta, 2.0);
  P_.polyAt(pl, pl.L, Q2); apI(Ws, Q2[0], Q2[1], Q2[2], Q1);
  if (f > .02) { oglow(Q1[0], Q1[1], Q1[2], 60, LIME, .6 * f); K.ringW(Q1, X.dir(Ws, [1, 0, 0]), X.dir(Ws, [0, 0, 1]), .08 + .35 * (1 - f), 40, 1, LIME, f, u); }
  if (u > ta) oglow(Q1[0], Q1[1], Q1[2], 16, LIME, .35 * A);
}
/* the power path traced in lime from the core to the switchboard as the generators go onto the railgun bus: a head runs
   it end to end (16 m/s), the path stays lit, the power crawling along it */
function powerTrace(u, Ws) {
  const pl = PL.pow; if (!pl || u < T_ON - .3) return;
  const A = ss(T_ON - .3, T_ON, u) * (1 - ss(LEN - 1.6, LEN - .1, u)), head = (u - T_ON + .3) * 16, odot = P_.odot;
  if (A < .01) return;
  for (let s = .05; s < Math.min(head, pl.L); s += .07) { P_.polyAt(pl, s, Q2); if (!isOpen(Q2[2])) continue; apI(Ws, Q2[0], Q2[1], Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], 1, LIME, .42 * A); }
  const o0 = (u * 1.6) % .9;
  for (let s = o0; s < Math.min(head, pl.L); s += .9) for (let j = 0; j < 4; j++) { const q = s - j * .045; if (q < 0) continue; P_.polyAt(pl, q, Q2); if (!isOpen(Q2[2])) continue; apI(Ws, Q2[0], Q2[1], Q2[2], Q1); odot(Q1[0], Q1[1], Q1[2], j ? 1 : 2, LIME, A * (.95 - .2 * j)); }
  if (head < pl.L + 1) { P_.polyAt(pl, Math.min(head, pl.L), Q2); if (isOpen(Q2[2])) { apI(Ws, Q2[0], Q2[1], Q2[2], Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 30, LIME, .7 * A); P_.oglow(Q1[0], Q1[1], Q1[2], 9, HOT, .8 * A); } }
}
/* the run: current along the railgun cables (the second feeders' current follows the pulse), data along the fibre */
function fxRun(u, st, Ws) {
  // (round 3: no current in the railgun cables before the feeders close; both feeders' current fronts run with the pulse)
  if (u > T_PULSE - .2) for (let m = 0; m < 2; m++) for (let k = 0; k < PL.rg.length; k++) pulses(PL.rg[k], u, T_PULSE + .1 * (k % 3) + (k < 3 ? .15 : 0) + m * .3, LEN, PULSE_V / 1.5, .45, .8, Ws, LIME, m ? -1 : 1);
  powerTrace(u, Ws);
  PL.data.forEach((pl, k) => dataPulses(pl, u, T_FDR - .6 + (k < 4 ? 0 : .5 + .2 * k), Ws));
  pulseFX(u, Ws);
}

/* ================= tags, readout ================= */
const T_GTG = (k, p) => () => X.ap(GTGL[k] || X.make(R.y(GTGS[k].ry), GTGS[k].o), p);
const T_GTM = (id, p) => () => { const g = GTM.find(q => q.id === id); return V.add(g.o, p); };
const T_TG = p => () => [TGO[0] + p[0], TGO[1] + p[1], TGO[2] + p[2]];
const fmt = n => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const rpmS = (S, u, k) => `${fmt(Math.round(spR(S, u) / Math.max(1e-6, RATE(u)) * 60 * (k || 1) / 10) * 10)} rpm`;
const pct = u => { const p = Math.pow(10, lpow(u)) * 100; return p < .01 ? 'source range' : p < 1 ? `${p.toFixed(2)} %` : `${Math.round(p)} %`; };
const rodPct = () => Math.round(100 * (ST.rod[0] + ST.rod[1] + ST.rod[2]) / ROD_F);
/* the flame front (one of its two heads): the cup it has reached */
const flameAt = u => { const tl = GM_T['1B'][1], a = (16 + 14.5 * E.sat((u - tl) / XF_T['1B'])) / 30 * TAU; return X.ap(LG['1B'] || X.make(R.I(), GTM1B().o), [Math.cos(a) * .6, Math.sin(a) * .6, 4.1]); };
const TAGDEF = [
  { id: 'GTM', lab: 'LM2500 gas turbine · 1B', val: () => '19.6 MW', at: T_GTM('1B', [0, 1.5, 5.0]), t0: 9.4, t1: 12.6 },
  { id: 'STR', lab: 'Air start motor', val: () => 'bleed air', at: T_GTM('1B', [-.1, -.9, 6.3]), t0: 11.0, t1: 13.2 },
  { id: 'CMB', lab: 'Annular combustor · 30 fuel nozzles', val: u => u > GM_T['1B'][1] ? 'light-off' : 'fuel on', at: T_GTM('1B', [.35, .6, 4.12]), t0: 25.2, t1: 31.2 },
  { id: 'IGN', lab: 'Igniters', val: () => 'sparking', at: T_GTM('1B', [-.71, -.13, 3.95]), t0: 25.4, t1: 27.6 },
  { id: 'FLF', lab: 'Flame front · both ways round', val: u => `${Math.round(Math.min(u - GM_T['1B'][1], XF_T['1B']) * 10)} ms`, at: flameAt, t0: GM_T['1B'][1] + .3, t1: GM_T['1B'][1] + XF_T['1B'] + 1.0 },
  { id: 'PT', lab: 'Power turbine · 6 stages', val: u => u < CLU[0] ? 'brake on' : `${fmt(shRpm(0, u) * RATIO)} rpm`, at: T_GTM('1B', [.55, .6, 2.2]), t0: 31.6, t1: 34.4 },
  { id: 'MRG', lab: 'Main reduction gear · locked train', val: () => '21.4 : 1', at: () => [-2.0, -.3, -5.2], t0: 34.6, t1: 37.6 },
  { id: 'INP', lab: 'Input pinion · from the power turbine', val: () => '35 teeth', at: () => [MER[0].bx + DXI + .2 * XPV, YA + .38, ZG(MER[0]) + 1.3 * XPV], t0: XPT[0], t1: U_XP[2] + .2 },
  { id: 'RG1', lab: 'First-reduction gear', val: () => '147 teeth', at: () => [MER[0].bx + DXI + XQ[0] * .9 * XPV, YA + DYG + XQ[1] * .9 * XPV + 1.02, ZG(MER[0]) + .2 * XPV], t0: XPT[1], t1: U_XP[2] + .4 },
  { id: 'RP2', lab: 'Second-reduction pinion', val: () => '43 teeth', at: () => [MER[0].bx + DXI + XQ[0] * .9 * XPV, YA - DYG - XQ[1] * .9 * XPV - .4, ZB(MER[0])], t0: XPT[2], t1: U_XP[2] + .6 },
  { id: 'BUL', lab: 'Bull gear · double helical', val: () => '219 teeth', at: () => [MER[0].bx - 1.3, YA - 1.1, ZB(MER[0]) - 1.0 * XPV], t0: XPT[3], t1: U_XP[2] + .8 },
  { id: 'CLU', lab: 'Clutch', val: u => u > CLU[0] ? 'engaged' : 'brake on', at: () => [-.32, -2.0, -2.6], t0: 43.0, t1: 46.0 },
  { id: 'BG', lab: 'Bull gear · to the shaft', val: u => `${Math.round(shRpm(0, u))} rpm`, at: () => [-1.0, -1.05, -4.55], t0: 44.4, t1: 47.0 },
  { id: 'RXC', lab: 'Reactor compartment · shielded', val: () => 'railgun power', at: () => [5.8, 2.2, 13.5], t0: 48.4, t1: 51.6 },
  { id: 'RPV', lab: 'Reactor pressure vessel', val: () => '15.5 MPa', at: () => [-.7, 1.0, 17.4], t0: 49.4, t1: 53.0 },
  { id: 'RCP', lab: 'Reactor coolant pump', val: u => u < RCP_T[0] ? 'stopped' : u < RCP_T[1] ? 'starting' : 'running', at: () => [RCPX, -1.3, RCPZ], t0: 50.0, t1: 54.0 },
  { id: 'ROD', lab: 'Control rods · 9 clusters', val: () => `${rodPct()} % out`, at: () => [2 * PITCH, -1.9 + ST.rod[0], RV[1] - 2 * PITCH], t0: 54.0, t1: 59.4 },
  { id: 'CRD', lab: 'Control rod drive mechanisms', val: () => ST.rodM[0] + ST.rodM[1] + ST.rodM[2] ? 'stepping' : 'holding', at: () => [.43, 2.62, RV[1] - .43], t0: 54.4, t1: 57.6 },
  { id: 'CORE', lab: 'Core · 37 fuel assemblies', val: u => u < T_CRIT ? 'subcritical' : pct(u), at: () => [.45, CORE1, RV[1] - .65], t0: 56.8, t1: 61.8 },
  { id: 'PZR', lab: 'Pressurizer', val: () => '15.5 MPa · 345 °C', at: () => [PZ[0], 2.5, PZ[1]], t0: 59.2, t1: 61.8 },
  { id: 'HOT', lab: 'Hot leg', val: () => '315 °C', at: () => [2.9, -.76, 18.66], t0: 61.0, t1: 63.6 },
  { id: 'UTB', lab: 'U-tube bundle · primary water', val: () => '315 → 285 °C', at: () => [3.95, .2, 18.75], t0: 64.0, t1: 67.2 },
  { id: 'BOIL', lab: 'Boiling off the tubes', val: () => '6.0 MPa · 276 °C', at: () => [4.1, SGW, 18.55], t0: 64.8, t1: 68.4 },
  { id: 'SEP', lab: 'Swirl-vane separators', val: () => 'water flung out', at: () => [4.15, 2.42, 18.7], t0: 69.0, t1: 73.6 },
  { id: 'DRY', lab: 'Chevron dryer', val: () => '', at: () => [5.0, 2.9, 19.4], t0: 70.4, t1: 73.4 },
  { id: 'MSL', lab: 'Main steam line', val: () => '6.0 MPa · 276 °C', at: () => [3.62, 3.6, 22.4], t0: 73.8, t1: 76.6 },
  { id: 'HPS', lab: 'High-pressure turbine · 7 stages', val: () => '3 600 rpm', at: T_TG([-.45, .7, 1.0]), t0: 75.8, t1: 78.4 },
  { id: 'LPS', lab: 'Low-pressure turbine · double flow', val: () => '5 kPa exhaust', at: T_TG([-.7, 1.0, LZC - .8]), t0: 81.4, t1: 83.6 },
  { id: 'CND', lab: 'Condenser · shell and tube', val: () => '5 kPa · 33 °C', at: T_TG([-1.15, -1.7, 3.3]), t0: 89.4, t1: 92.6 },
  { id: 'TUB', lab: 'Tubes · seawater inside', val: () => `${CTUBE.length} tubes`, at: T_TG([-.55, -2.05, 3.8]), t0: 90.8, t1: 94.2 },
  { id: 'WBX', lab: 'Waterbox · seawater in', val: () => '20 °C', at: T_TG([1.1, -1.95, CS0 - .35]), t0: 92.0, t1: 95.0 },
  { id: 'HWL', lab: 'Condensate · into the hotwell', val: () => '33 °C', at: T_TG([-.85, -3.6, 4.6]), t0: 93.0, t1: 96.2 },
  { id: 'GEN', lab: 'Generator · 2 poles', val: () => '3 600 rpm · 60 Hz', at: T_TG([-.55, .95, 7.4]), t0: 96.8, t1: 100.0 },
  { id: 'FLD', lab: 'Rotating field', val: () => 'one turn per cycle', at: T_TG([-.3, .55, GZM]), t0: 98.6, t1: 102.6 },
  { id: 'STW', lab: `Stator · ${NSL} slots · 3 phases`, val: () => '4 160 V', at: T_TG([-.5, .5, GZ1 + .25]), t0: 99.8, t1: 104.0 },
  { id: 'ROT', lab: 'Rotor poles · DC field winding', val: () => '2 poles', at: T_TG([-.3, .42, 8.9]), t0: 101.0, t1: 104.8 },
  { id: 'RSB', lab: 'Railgun switchboard · 4 160 V', val: () => '2 × 25 MW in', at: () => [1.9, -1.0, 38.0], t0: 105.6, t1: 108.6 },
  { id: 'BRK', lab: 'Feeder breakers · draw-out', val: u => u < T_RACK[0] ? 'test position' : u < T_RACK[1] ? 'racking in' : u < T_FDR ? 'connected' : 'closed', at: () => [1.0, -1.0, 37.7], t0: 106.4, t1: 110.6 },
  { id: 'ARC', lab: 'Arc chutes', val: () => 'the arc quenched', at: () => [.75, -1.3, 38.05], t0: T_FDR - .1, t1: T_FDR + 1.9 },
  { id: 'PLS', lab: 'Feeder current · to the power room', val: () => '4 160 V', at: u => { P_.polyAt(PL.pulse, Math.min(pulseS(u), PL.pulse.L), Q4); return [Q4[0], Q4[1] + .1, Q4[2]]; }, t0: T_PULSE + .6, t1: T_PULSE + 5.0 },
  { id: 'CPD', lab: 'Helium compressor drive', val: () => 'powered', at: () => [.62, 2.4, 41.1], t0: T_PULSE + 5.6, t1: LEN - .5 },
];
function tags(u, ctx) {
  for (const t of TAGS) {
    if (u < t.t0 || u > t.t1) continue;
    if (t.tg.el.classList.contains('off')) t.tg.key = '';
    const a = E.sat((u - t.t0) / .25) * (1 - E.sat((u - t.t1 + .45) / .45));
    ctx.tagAt(t.tg, t.id, t.lab, t.val(u), X.ap(ctx.Ws, t.at(u)), a, u - t.t0);
  }
  if (LG['1B']) scanTags(SC_GT, SCT[0], u, ctx, X.mul(ctx.Ws, LG['1B']));
  scanTags(SC_HP, SCT[1], u, ctx, X.mul(ctx.Ws, TGL)); scanTags(SC_LP, SCT[2], u, ctx, X.mul(ctx.Ws, TGL));
  phaseTrace(u, ctx); fluxTrace(u, ctx);
}
/* the scan's tag on the row it is passing, and the ruler: each row's number left at its tip as the plane passes */
const SCT = [];
function scanTags(S, tg, u, ctx, L) {
  if (u < S.u0 - .2 || u > S.u1 + 3.2) return;
  const q = scanAt(S, u), A = ss(S.u0, S.u0 + .3, u) * (1 - ss(S.u1, S.u1 + .4, u)), c = Math.cos(S.numA), sn = Math.sin(S.numA);
  // one tag per group, from the group's first row to its last (riding on the plane)
  if (A > .01) { let g = -1; for (let k = 0; k < S.groups.length; k++) if (u >= S.groups[k].t0 - .05) g = k;
    if (g >= 0) { const G_ = S.groups[g], zs = S.zOf(Math.max(0, q.d)), z = zs[zs.length - 1], r = G_.tip + .04; apI(L, c * r, sn * r, z, Q4); ctx.tagAt(tg, G_.id, G_.lab, G_.val, Q4, A, (u - G_.t0) * 2.5); } }
  const o = K.octx, S_ = K.S, B = ss(S.u0, S.u0 + .3, u) * (1 - ss(S.u1 + 1.6, S.u1 + 3.0, u)); if (B < .01) return;
  o.font = `500 ${Math.round(15 * S_)}px "Geist Mono", monospace`; o.textAlign = 'center'; o.textBaseline = 'bottom'; o.fillStyle = '#C6F432';
  for (const r of S.rows) { const age = u - passT(S, r); if (age < 0) continue;
    for (const z of r.zs) { apI(L, c * (r.t + .1), sn * (r.t + .1), z, Q4); if (!K.pj(Q4[0], Q4[1], Q4[2])) continue;
      o.globalAlpha = B * (.62 + .38 * Math.exp(-age * 1.5)); o.fillText(r.num, K.PJ[0], K.PJ[1] - 4 * S_); } }
  o.globalAlpha = 1; o.textAlign = 'left'; o.textBaseline = 'alphabetic';
}
/* the generator's stator currents traced beside it: three phases, 120 deg apart, scrolling as the rotor turns (two
   cycles across; x0.01: one cycle in 1.7 s); the cursor at now, each phase's value marked where the slice lights it */
const PH_C = ['#C6F432', '#EEEEE4', '#C6F432'], PH_A = [.95, .8, .55];
/* the neutron flux traced beside the core as the rods come out (round 3): eight decades on a log scale, from the
   source range to full power; the rods' withdrawal under it (dashed, 0-100 % of their travel); criticality and full
   power marked as the trace reaches them */
const rodAt = t => { let h = 0; for (let b = 0; b < 3; b++) h += ROD_H[b] * ss(ROD_T[b][0], ROD_T[b][1], t); return h / ROD_F; };
function fluxTrace(u, ctx) {
  const t0 = ROD_T[0][0] - .8, t1 = T_FULL + 1.4, a = ss(t0 - .4, t0 + .6, u) * (1 - ss(T_FULL + 2.0, T_FULL + 3.0, u)); if (a < .01) return;
  apI(ctx.Ws, -1.5, -1.6, 18.0, Q4); if (!K.pj(Q4[0], Q4[1], Q4[2])) return;
  const S_ = K.S, W = 330 * S_, Hh = 150 * S_, o = K.octx;
  const x0 = E.clamp(K.PJ[0] - W - 30 * S_, 40 * S_, K.BW - W - 120 * S_), y0 = E.clamp(K.PJ[1] - Hh / 2, 260 * S_, 730 * S_ - Hh);
  const X_ = t => x0 + W * E.sat((t - t0) / (t1 - t0)), Y_ = lp => y0 + Hh * (1 - (lp + 8) / 8);
  o.globalAlpha = .86 * a; o.fillStyle = 'rgb(11,12,10)'; o.fillRect(x0 - 8 * S_, y0 - 30 * S_, W + 82 * S_, Hh + 58 * S_);
  K.bracket([x0 - 8 * S_, y0 - 6 * S_, x0 + W + 74 * S_, y0 + Hh + 6 * S_], '#C6F432', .7 * a, 10, 1.2);
  o.globalAlpha = .9 * a; o.fillStyle = '#C6F432'; o.font = `500 ${Math.round(13 * S_)}px "Geist Mono", monospace`; o.textBaseline = 'bottom';
  o.fillText('NEUTRON FLUX · LOG · 8 DECADES', x0 - 8 * S_, y0 - 10 * S_);
  o.font = `400 ${Math.round(11 * S_)}px "Geist Mono", monospace`; o.textBaseline = 'middle';
  for (const [lp, t] of [[0, '100 %'], [-2, '1 %'], [-4, '0.01 %'], [-6, '1E-4 %'], [-8, '1E-6 %']]) {
    const y = Y_(lp); o.globalAlpha = .25 * a; o.strokeStyle = '#EEEEE4'; o.lineWidth = S_; o.setLineDash([2 * S_, 4 * S_]); o.beginPath(); o.moveTo(x0, y); o.lineTo(x0 + W, y); o.stroke(); o.setLineDash([]);
    o.globalAlpha = .6 * a; o.fillStyle = '#EEEEE4'; o.fillText(t, x0 + W + 8 * S_, y); }
  const tn = Math.min(u, t1), N = 120;
  o.globalAlpha = .6 * a; o.strokeStyle = '#EEEEE4'; o.lineWidth = 1.2 * S_; o.setLineDash([5 * S_, 3 * S_]); o.beginPath();
  for (let j = 0; j <= N; j++) { const t = t0 + (tn - t0) * j / N, x = X_(t), y = y0 + Hh * (1 - rodAt(t)); if (j) o.lineTo(x, y); else o.moveTo(x, y); }
  o.stroke(); o.setLineDash([]);
  o.globalAlpha = a; o.strokeStyle = '#C6F432'; o.lineWidth = 1.8 * S_; o.beginPath();
  for (let j = 0; j <= N; j++) { const t = t0 + (tn - t0) * j / N, x = X_(t), y = Y_(lpow(t)); if (j) o.lineTo(x, y); else o.moveTo(x, y); }
  o.stroke();
  const xn = X_(tn), yn = Y_(lpow(tn)); o.fillStyle = '#C6F432'; o.beginPath(); o.arc(xn, yn, 3 * S_, 0, TAU); o.fill();
  o.globalAlpha = .7 * a; o.fillStyle = '#EEEEE4'; o.beginPath(); o.arc(xn, y0 + Hh * (1 - rodAt(tn)), 2.2 * S_, 0, TAU); o.fill();
  o.font = `500 ${Math.round(11 * S_)}px "Geist Mono", monospace`; o.textBaseline = 'bottom';
  for (const [t, lab] of [[T_CRIT, 'CRITICAL'], [T_FULL, 'FULL POWER']]) { if (u < t) continue; const x = X_(t), y = Y_(lpow(t));
    o.globalAlpha = .55 * a; o.strokeStyle = '#C6F432'; o.lineWidth = S_; o.beginPath(); o.moveTo(x, y0); o.lineTo(x, y0 + Hh); o.stroke();
    o.globalAlpha = .95 * a * E.sat((u - t) / .3); o.fillStyle = '#C6F432'; o.fillText(lab, Math.min(x + 4 * S_, x0 + W - 70 * S_), y - 6 * S_); }
  o.globalAlpha = .6 * a; o.fillStyle = '#EEEEE4'; o.textBaseline = 'top'; o.fillText(`RODS ${rodPct()} % OUT`, x0, y0 + Hh + 10 * S_);
  o.globalAlpha = 1; o.textBaseline = 'alphabetic'; o.textAlign = 'left';
}
function phaseTrace(u, ctx) {
  const a = ss(U_GEN[0] + 1.6, U_GEN[0] + 2.8, u) * (1 - ss(U_GEN[1] - 1.2, U_GEN[1], u)); if (a < .01) return;
  apI(X.mul(ctx.Ws, TGL), -2.6, .7, GZM - .9, Q4); if (!K.pj(Q4[0], Q4[1], Q4[2])) return;
  const S_ = K.S, W = 360 * S_, Hh = 116 * S_, o = K.octx;
  const x0 = E.clamp(K.PJ[0] - W, 40 * S_, K.BW - W - 70 * S_), y0 = E.clamp(K.PJ[1] - Hh / 2, 250 * S_, 840 * S_ - Hh), yc = y0 + Hh / 2, amp = Hh / 2 - 8 * S_;
  o.globalAlpha = .86 * a; o.fillStyle = 'rgb(11,12,10)'; o.fillRect(x0 - 8 * S_, y0 - 30 * S_, W + 42 * S_, Hh + 36 * S_);
  K.bracket([x0 - 8 * S_, y0 - 6 * S_, x0 + W + 34 * S_, y0 + Hh + 6 * S_], '#C6F432', .7 * a, 10, 1.2);
  o.globalAlpha = .9 * a; o.fillStyle = '#C6F432'; o.font = `500 ${Math.round(13 * S_)}px "Geist Mono", monospace`; o.textBaseline = 'bottom';
  o.fillText('STATOR CURRENT · 3 PHASES · 60 HZ', x0 - 8 * S_, y0 - 10 * S_);
  o.globalAlpha = .3 * a; o.strokeStyle = '#EEEEE4'; o.lineWidth = S_; o.setLineDash([2 * S_, 4 * S_]); o.beginPath(); o.moveTo(x0, yc); o.lineTo(x0 + W, yc); o.stroke(); o.setLineDash([]);
  const th = ST.tgA, N = 140;
  for (let p = 0; p < 3; p++) {
    const t1 = PI / 2 - p * TAU / 3;
    o.globalAlpha = PH_A[p] * a; o.strokeStyle = PH_C[p]; o.lineWidth = 1.4 * S_; if (p === 2) o.setLineDash([5 * S_, 3 * S_]);
    o.beginPath();
    for (let j = 0; j <= N; j++) { const e = th - (1 - j / N) * 2 * TAU, I = -Math.cos(e - t1), x = x0 + W * j / N, y = yc - I * amp; if (j) o.lineTo(x, y); else o.moveTo(x, y); }
    o.stroke(); o.setLineDash([]);
    const I = -Math.cos(th - t1), y = yc - I * amp;
    o.globalAlpha = a; o.fillStyle = PH_C[p]; o.beginPath(); o.arc(x0 + W, y, 2.6 * S_, 0, TAU); o.fill();
    o.textBaseline = 'middle'; o.fillText('ABC'[p], x0 + W + 8 * S_, y);
  }
  o.globalAlpha = .5 * a; o.strokeStyle = '#C6F432'; o.lineWidth = S_; o.beginPath(); o.moveTo(x0 + W, y0); o.lineTo(x0 + W, y0 + Hh); o.stroke();
  o.globalAlpha = 1; o.textBaseline = 'alphabetic';
}
function readout(u) {
  let l1, l2;
  const rate = RATE(u);
  if (u < 11.0) { l1 = 'DDG-51 · <b>machinery spaces</b>'; l2 = 'Gas turbine generators <b>3 × 2.5 MW</b> on line · 450 V · <b>railgun reactor</b> shut down'; }
  else if (u < U_SCAN[0]) { l1 = `LM2500 1B · <b>${u < GM_T['1B'][0] ? 'enclosure off' : 'cranking'}</b>`; l2 = `Air start motor · gas generator <b>${fmt(ngg('1B', u))} rpm</b>`; }
  else if (u < U_EO[0] + .4) {
    l1 = 'LM2500 1B · <b>the gas path, section by section</b>'; l2 = 'Compressor <b>16 stages</b> · combustor · HP turbine <b>2</b> · power turbine <b>6</b> · cranking at <b>1 700 rpm</b>';
  } else if (u < U_SL1) {
    const tl = GM_T['1B'][1];
    l1 = `LM2500 1B · <b>${u < tl - .6 ? 'fuel on' : u < tl + XF_T['1B'] + .3 ? 'light-off' : 'lit'}</b>`; l2 = `Annular combustor · <b>30 fuel nozzles</b> · the flame front round in <b>${Math.round(XF_T['1B'] * 10)} ms</b>`;
  } else if (u < 35.4) {
    const id = u < 32.4 ? '1B' : u < 33.2 ? '1A' : u < 34.0 ? '2A' : '2B', [, tl, ti] = GM_T[id];
    l1 = `LM2500 ${id} · <b>${u < tl ? 'cranking' : u < ti ? 'light-off' : 'idle'}</b>`; l2 = `Gas generator <b>${fmt(ngg(id, u))} rpm</b> · power turbine <b>brake on</b>`;
  } else if (u < CLU[0] - .2) {
    l1 = `Main reduction gear 1 · <b>${xpAt(u) > .05 ? 'exploded' : 'locked train'}</b>`; l2 = 'Input pinion <b>35</b> · first reduction <b>147</b> · second <b>43</b> · bull gear <b>219</b> · <b>21.4 : 1</b>';
  } else if (u < 47.4) {
    const r = shRpm(0, u), r2 = shRpm(1, u);
    l1 = u < CLU[0] + .4 ? 'Main reduction gear 1 · <b>clutch in</b>' : `Shafts · <b>${Math.round(r)} rpm</b> port · <b>${Math.round(r2)}</b> stbd`;
    l2 = `Power turbine <b>${fmt(r * RATIO)} rpm</b> · 21.4 : 1 · pitch <b>0 %</b>`;
  } else if (u < ROD_T[0][0] - .2) {
    l1 = 'Railgun power · <b>pressurised-water reactor</b>';
    l2 = u < RCP_T[0] ? 'Reactor <b>shut down</b> · 165 MW thermal' : `Reactor coolant pumps <b>${u < RCP_T[1] ? 'starting' : 'running'}</b> · 15.5 MPa`;
  } else if (u < 62.6) {
    l1 = `Reactor · <b>${u < T_CRIT ? 'rods withdrawing' : u < T_FULL ? 'critical · power rising' : 'full power · 165 MW thermal'}</b>`;
    l2 = `Rods <b>${rodPct()} % out</b> · power <b>${u < T_CRIT ? 'source range' : pct(u)}</b> · coolant <b>${Math.round(285 + 30 * ST.heat)} °C</b>`;
  } else if (u < 68.8) { l1 = 'Steam generator · <b>boiling</b>'; l2 = 'Primary <b>315 °C</b> in, <b>285 °C</b> out · steam <b>6.0 MPa · 276 °C</b>'; }
  else if (u < 74.0) { l1 = 'Steam separators · <b>swirl vanes</b>'; l2 = 'The water flung to the walls and back down · the steam on through the dryer'; }
  else if (u < U_CND[0]) {
    l1 = 'Steam turbine · <b>3 600 rpm</b>';
    l2 = u > U_HPS[0] - .5 && u < U_HPS[1] + .3 ? 'High-pressure turbine · <b>7 stages</b> · casing split on the horizontal joint' : u > U_LPS[0] - .3 && u < U_LPS[1] + 1 ? 'Low-pressure turbine · <b>2 × 5 stages</b> · exhaust <b>5 kPa</b>' : 'Steam <b>6.0 MPa</b> in · exhaust <b>5 kPa</b> · <b>25 MW</b> per set';
  } else if (u < U_CND[1]) { l1 = 'Condenser · <b>5 kPa · 33 °C</b>'; l2 = 'Seawater <b>20 → 30 °C</b> through the tubes · the condensate to the hotwell, back to the feed pumps'; }
  else if (u < U_GEN[1]) { l1 = 'Generator · <b>3 600 rpm · 60 Hz</b>'; l2 = `Rotor field <b>DC</b>, turning · stator <b>4 160 V</b> · 3 phases · load <b>${Math.round(25 * ST.load)} MW</b> of 25`; }
  else if (u < T_PULSE) { l1 = `Railgun switchboard · <b>${Math.round(50 * ST.load)} MW</b> of 50`; l2 = `Feeder breakers <b>${u < T_RACK[0] ? 'in test position' : u < T_RACK[1] ? 'racking in' : u < T_FDR ? 'connected · open' : 'closed'}</b> · 4 160 V · 60 Hz`; }
  else { l1 = 'Railgun power room · <b>feed live</b>'; l2 = u < T_PULSE + PULSE_L / PULSE_V ? 'Feeder <b>4 160 V</b> · current into the power room' : `Helium compressor drive · <b>powered</b> · bus <b>${Math.round(50 * ST.load)} MW</b> of 50`; }
  return { l1, l2, rate };
}
/* ================= sound ================= */
const SFX = () => STAGE.SFX;
const clunk = () => { SFX().tone(120, 70, .22, 'square', .03); SFX().noise(.2, 500, 1, .04, .005); };
const clack = () => { SFX().tone(900, 300, .06, 'square', .014); SFX().noise(.08, 3000, .8, .02, .002); };
const tick = () => SFX().tone(1650, 1650, .03, 'square', .004);
const PULSE_L = (() => { const P = [...RG_P[1].slice(0, 5), ...PBR]; let L = 0; for (let i = 1; i < P.length; i++) L += V.dist(P[i - 1], P[i]); return L; })();
const cues = [
  [.9, () => SFX().tone(900, 2600, .9, 'sine', .012)],
  ...Object.values(GM_T).map(([a]) => [a, () => SFX().tone(120, 700, 1.0, 'sawtooth', .009)]),
  ...Object.entries(GM_T).map(([id, [, b]]) => [b, () => { const sl = id === '1B'; SFX().noise(sl ? 3.6 : 1.2, sl ? 260 : 400, .8, .04, sl ? 1.4 : .03); SFX().tone(sl ? 40 : 70, sl ? 120 : 260, sl ? 4 : 1.6, 'sawtooth', .012); }]),
  ...[SC_GT, SC_HP, SC_LP].flatMap(S => S.rows.map(r => [passT(S, r), tick])),
  [U_XP[0], () => SFX().tone(160, 260, 2.4, 'sawtooth', .006)], [U_XP[2], () => SFX().tone(260, 160, 2.4, 'sawtooth', .006)], [U_XP[3] - .05, clunk],
  [CLU[0], clunk], [CLU[1], clunk], [CLU[0] + 1.2, () => SFX().tone(40, 90, 3.0, 'sawtooth', .012)],
  [RCP_T[0], () => SFX().tone(50, 220, 2.6, 'sawtooth', .01)],
  ...ROD_T.map(([a, b]) => [a, () => { for (let k = 0; k < 8; k++) SFX().tone(1500, 1500, .02, 'square', .006, k * (b - a) / 8); }]),
  [T_CRIT, () => SFX().tone(420, 840, 1.6, 'sine', .01)],
  [T_FULL + 4.0, () => SFX().noise(6.0, 900, .6, .014, 1.5)],
  [T_ON, () => SFX().tone(300, 900, 2.0, 'sine', .006)],
  [U_HPS[0] - 2.6, () => SFX().tone(55, 110, 4.0, 'sawtooth', .012)],
  [U_CND[0] + .6, () => SFX().noise(5.0, 700, .5, .01, 1.5)],
  [U_GEN[0] + 1.6, () => SFX().tone(60, 60, 4.8, 'sine', .016)],
  [T_RACK[0], () => SFX().tone(90, 140, T_RACK[1] - T_RACK[0], 'sawtooth', .007)], [T_RACK[1], clunk],
  [T_FDR, () => { clack(); SFX().noise(.25, 2600, .9, .03, .004); }], [T_FDR + .12, clack],
  [T_PULSE, () => { SFX().tone(1800, 500, .5, 'sawtooth', .008); SFX().noise(.4, 4000, .5, .01, .05); }],
  [T_PULSE + PULSE_L / PULSE_V, () => { clack(); SFX().tone(220, 440, .8, 'sine', .01); }],
];
const chapters = [{ t: 0, title: 'Machinery' }, { t: 9.0, title: 'Main engines' }, { t: 34.0, title: 'Reduction gear' }, { t: 47.0, title: 'Reactor' },
  { t: 62.6, title: 'Steam generator' }, { t: 74.0, title: 'Steam turbine' }, { t: 88.6, title: 'Condenser' }, { t: 96.0, title: 'Generator' }, { t: 104.8, title: 'Power run' }];
/* debug: points per prim of a part at spacing sp */
function primCounts(fn, sp) { return fn().map((pr, i) => [i, pr.t, samp([pr], sp, false).length / 6]).sort((a, b) => b[2] - a[2]).slice(0, 12); }
const RGE = { dbg: { primCounts, vesselPrims, corePrims, sgPrims, tgStatic, tgRotor, genRotor2, structure, gtPlant, fwdStatic, state, ST, PLP, CK, XW, fxRX, isOpen, KEYS, camShip, XB, SPL }, len: LEN, build, chapters, cues, cam, draw, xray, readout, tags, info: null,
  get room() { return roomBase(); } };
window.RGE = RGE;
})();
