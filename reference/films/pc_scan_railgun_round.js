/* SCAN · RAILGUN round: the long-rod probe (window.RGR). Shared by the magazine (fabrication), the loader, the bore,
   the flight and the shatter.
   Round frame: +Z the nose, origin at the middle of the rod; metres.
     The rod: tungsten, Ø25 mm (ROD_R .0125), 2.0 m (REAR -1.0 .. NOSE 1.0), 19 kg; an ogive nose .12 long, six swept
     fins at the tail (span .07, z -1.0 .. -.86). Eight conductive traces are engraved along it (channels cut in the
     surface), with 45° jogs and via pads, between two contact rings (z -.66, under the armature's boss, and .84); they
     run on up the nose cone.
     The sabot: three segments round the middle of the rod (SAB_Z0 -.62 .. SAB_Z1 .48, Ø.28: SAB_R .14 fills the bore
     between the rails), each a 120° wedge of nano-crystalline micro-lattice: two lattice shells (r .052 .096) and
     the skin on the profile (a chamfered rear, the bore-riding body, the forward ramp), tied by radial struts, a
     grooved sleeve on the rod. Segment k is centred on angle k·120° (k 0 on +X).
     The armature: two halves (±Y) on the sabot's rear face (z -.70 .. -.62), each a back plate, a boss round the rod
     and a contact pad on the rail face (|Y| .118 .. .140).
   API:
     RGR.build(rctx)                       clouds (rctx: K, P_, CL, X, R, V, E, M3, LIME, HOT, WH, apI, tr, T film time)
     RGR.draw(Lw, Ls, e, o, glow, rctx)    the round (Lw round -> world, Ls round -> ship for the X-ray tests or null,
                                           e the exploded view 0..1, o drawX options, glow the circuit lit 0..1)
     RGR.drawRod(Lw, o, glow, rctx)        the rod alone (its sabot and armature gone: the flight)
     RGR.sabotSeg(k)                       segment k's cloud (round frame, in place), RGR.SEG_A[k] its centre angle
     RGR.lines(Lw, opt)                    the circuit FX alone. opt (all optional): glow 0..1, T (s: the streaks' clock),
                                           sp (streak speed m/s), n (streaks per trace), tail (m), sync (1: all traces in
                                           step), back (m: streaks leaving the laying front instead, fading over it),
                                           laid (round z: drawn only below it, a lime band at it), fresh (its width),
                                           white (the unlit line's level), a (alpha), Ls/md/zfix (the X-ray test), cut
                                           (ship y: hidden below it, with Ls), kinds (bits: 1 traces, 2 rings, 4 vias),
                                           rev (1: the streaks run nose to tail)
     RGR.xray(Lw, opt)                     the circuit X-rayed: the channels' walls and floors, the conductor in them,
                                           the via barrels into the core, both sides of the rod. opt: z0 z1 (round z),
                                           fz (fade), a, glow, T, sp, rev, Ls/cut
     RGR.thAt(k, z), RGR.surfR(z)          trace k's angle at round z, the rod's radius there (the nose's ogive)
     RGR.LINES                             the circuit as polylines (round frame), RGR.CL the clouds
   Render is a pure function of the transforms, e, glow and rctx.T. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI;
const ROD_LEN = 2.0, ROD_R = .0125, SAB_LEN = 1.1, SAB_R = .14, SAB_Z0 = -.62, SAB_Z1 = .48, LEN = 2.0, REAR = -1.0, NOSE = 1.0;
const ARM_Z0 = -.70, ARM_Z1 = -.62;
const NOSE_Z = .88;                                   // the nose cone's base
const FIN_Z1 = -.86, FIN_R = .035, NFIN = 6;
const TR_Z0 = -.66, TR_Z1 = .84, NTR = 8;             // the traces run between the two contact rings (the rear one under the armature's boss)
const CH_W = .0008;                                   // a channel's half width
const RL = ROD_R + .00025;                            // the traces' radius (in the channel's mouth)

/* ---------- the circuit: per trace a piecewise-linear angle th(z) with 45° jogs (a quarter of the pitch; the
   neighbours never meet), via pads at alternate jogs ---------- */
const TRACES = [], VIAS = [];
(function design() {
  const r = M3.rng(7741), dth = PI / 16;
  for (let k = 0; k < NTR; k++) {
    const th0 = (k + .5) * TAU / NTR, Z = [TR_Z0], TH = [th0];
    let z = TR_Z0, off = 0, sg = r() < .5 ? 1 : -1, nj = 0;
    for (;;) {
      z += .07 + .17 * r();
      if (z > TR_Z1 - .1) break;
      Z.push(z); TH.push(th0 + off);
      const nOff = off === 0 ? sg * dth : 0; if (off !== 0) sg = -sg;
      z += Math.abs(nOff - off) * RL; Z.push(z); TH.push(th0 + nOff);
      if (nj++ % 2 === 0) VIAS.push([z, th0 + nOff], [Z[Z.length - 2], th0 + off]);
      off = nOff;
    }
    if (off !== 0) { z += .02; Z.push(z); TH.push(th0 + off); z += Math.abs(off) * RL; Z.push(z); TH.push(th0); }
    Z.push(NOSE_Z); TH.push(th0);
    TRACES.push({ Z, TH, th0 });
  }
  VIAS.sort((a, b) => a[0] - b[0]);
})();
function thAt(tr, z) {
  const Z = tr.Z, TH = tr.TH;
  if (z <= Z[0]) return TH[0];
  for (let i = 1; i < Z.length; i++) if (z <= Z[i]) { const w = (z - Z[i - 1]) / Math.max(1e-9, Z[i] - Z[i - 1]); return TH[i - 1] + (TH[i] - TH[i - 1]) * w; }
  return TH[TH.length - 1];
}
/* the nose: an ogive from NOSE_Z to the tip */
const noseR = z => { const t = E.clamp((z - NOSE_Z) / (NOSE - NOSE_Z), 0, 1); return Math.max(.0006, ROD_R * Math.pow(1 - t, .72) * (1 + .25 * t * (1 - t))); };
const TR_TIP = .955;                                  // the traces stop here on the cone

/* the polylines (round frame), with normals and running lengths: traces (tail -> nose), the contact rings, vias */
const LN = [];                                        // {p: Float32Array xyz, n: Float32Array, s: Float32Array, kind}
function addLine(P, Nn, kind) {
  const n = P.length, p = new Float32Array(n * 3), nn = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { p.set(P[i], i * 3); nn.set(Nn[i], i * 3); if (i) s[i] = s[i - 1] + V.dist(P[i], P[i - 1]); }
  LN.push({ p, n: nn, s, kind, L: s[n - 1] });
}
const LINES = [];
(function lines() {
  for (const tr of TRACES) {
    const P = [], Nn = [];
    for (let i = 0; i < tr.Z.length; i++) {
      const z = tr.Z[i], th = tr.TH[i], c = Math.cos(th), s = Math.sin(th);
      // long runs are subdivided (the streaks' lengths and the facing test stay local)
      if (i) { const z0 = tr.Z[i - 1], n = Math.ceil((z - z0) / .06); for (let k = 1; k < n; k++) { const zz = z0 + (z - z0) * k / n, t2 = thAt(tr, zz); P.push([Math.cos(t2) * RL, Math.sin(t2) * RL, zz]); Nn.push([Math.cos(t2), Math.sin(t2), 0]); } }
      P.push([c * RL, s * RL, z]); Nn.push([c, s, 0]);
    }
    const c = Math.cos(tr.th0), s = Math.sin(tr.th0);
    for (let k = 1; k <= 8; k++) {
      const z = NOSE_Z + (TR_TIP - NOSE_Z) * k / 8, r = noseR(z) + .0002, dr = (noseR(z + .001) - noseR(z - .001)) / .002, nl = Math.hypot(1, dr);
      P.push([c * r, s * r, z]); Nn.push([c / nl, s / nl, -dr / nl]);
    }
    addLine(P, Nn, 0);
  }
  for (const z of [TR_Z0, TR_Z1]) {
    const P = [], Nn = [];
    for (let k = 0; k <= 48; k++) { const a = k / 48 * TAU; P.push([Math.cos(a) * RL, Math.sin(a) * RL, z]); Nn.push([Math.cos(a), Math.sin(a), 0]); }
    addLine(P, Nn, 1);
  }
  for (const [z, th] of VIAS) {
    const P = [], Nn = [], c = Math.cos(th), s = Math.sin(th), t = [-s, c, 0];
    for (let k = 0; k <= 10; k++) { const a = k / 10 * TAU, u = Math.cos(a) * .0012, w = Math.sin(a) * .0012, th2 = th + u / RL; P.push([Math.cos(th2) * RL, Math.sin(th2) * RL, z + w]); Nn.push([c, s, 0]); }
    addLine(P, Nn, 2);
  }
  for (const l of LN) { const A = []; for (let i = 0; i < l.p.length; i += 3) A.push([l.p[i], l.p[i + 1], l.p[i + 2]]); LINES.push(A); }
})();

/* ---------- sampling (stride 6: xyz, normal; a zero normal is two-sided) ---------- */
function seg(o, a, b, n, s) {                         // a straight strut, dots every s (start included, end not)
  const L = V.dist(a, b), m = Math.max(1, Math.round(L / s));
  for (let k = 0; k < m; k++) { const u = k / m; o.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, n ? n[0] : 0, n ? n[1] : 0, n ? n[2] : 0); }
}
function arc(o, r, z, a0, a1, s, nrm) {               // an arc about the axis; nrm: 'r' radial, [x,y,z] fixed, null two-sided
  const m = Math.max(1, Math.round(Math.abs(a1 - a0) * r / s));
  for (let k = 0; k < m; k++) { const a = a0 + (a1 - a0) * k / m, c = Math.cos(a), sn = Math.sin(a); o.push(c * r, sn * r, z, nrm === 'r' ? c : nrm ? nrm[0] : 0, nrm === 'r' ? sn : nrm ? nrm[1] : 0, nrm === 'r' ? 0 : nrm ? nrm[2] : 0); }
}
/* the rod: the cylinder with its channels and via holes, the nose, the tail face, the fins */
const THZ = new Float64Array(NTR);
function rodPts(s) {
  const o = [], nth = Math.max(12, Math.round(TAU * ROD_R / s)), nz = Math.round((NOSE_Z - REAR) / s);
  let vi = 0;
  for (let j = 0; j < nz; j++) {
    const z = REAR + (j + .5) * (NOSE_Z - REAR) / nz, inTr = z > TR_Z0 - CH_W && z < NOSE_Z, ring = Math.abs(Math.abs(z) - TR_Z1) < CH_W;
    if (ring) continue;
    if (inTr) for (let k = 0; k < NTR; k++) THZ[k] = thAt(TRACES[k], z);
    while (vi < VIAS.length && VIAS[vi][0] < z - .0025) vi++;
    for (let i = 0; i < nth; i++) {
      const th = (i + .5 * (j & 1)) / nth * TAU;
      if (inTr && z > TR_Z0 + CH_W) {
        let gap = false;
        for (let k = 0; k < NTR; k++) { let d = th - THZ[k]; d -= TAU * Math.round(d / TAU); if (Math.abs(d) * ROD_R < CH_W) { gap = true; break; } }
        if (gap) continue;
      }
      let hole = false;
      for (let v = vi; v < VIAS.length && VIAS[v][0] < z + .0025; v++) { let d = th - VIAS[v][1]; d -= TAU * Math.round(d / TAU); const dz = z - VIAS[v][0], da = d * ROD_R; if (da * da + dz * dz < .0019 * .0019) { hole = true; break; } }
      if (hole) continue;
      const c = Math.cos(th), sn = Math.sin(th);
      o.push(c * ROD_R, sn * ROD_R, z, c, sn, 0);
    }
  }
  // the nose (its channels too, up to TR_TIP)
  const nn = Math.max(4, Math.round((NOSE - NOSE_Z) / s * 1.15));
  for (let j = 0; j < nn; j++) {
    const z = NOSE_Z + (j + .5) * (NOSE - NOSE_Z) / nn, r = noseR(z), dr = (noseR(z + .001) - noseR(z - .001)) / .002, nl = Math.hypot(1, dr), m = Math.max(5, Math.round(TAU * r / s));
    for (let i = 0; i < m; i++) {
      const th = (i + .5 * (j & 1)) / m * TAU;
      if (z < TR_TIP) { let gap = false; for (let k = 0; k < NTR; k++) { let d = th - TRACES[k].th0; d -= TAU * Math.round(d / TAU); if (Math.abs(d) * r < CH_W * .8) { gap = true; break; } } if (gap) continue; }
      const c = Math.cos(th), sn = Math.sin(th);
      o.push(c * r, sn * r, z, c / nl, sn / nl, -dr / nl);
    }
  }
  // edges: the nose's base and the tail rim, two-sided
  arc(o, ROD_R + .0001, NOSE_Z, 0, TAU, s * .6, null); arc(o, ROD_R + .0001, REAR, 0, TAU, s * .6, null);
  // the tail face
  for (let r = s * .5; r < ROD_R; r += s) arc(o, r, REAR, 0, TAU, s, [0, 0, -1]);
  // the fins: thin swept plates (both faces lit, their outlines two-sided)
  const P_ = window.RGP;
  for (let f = 0; f < NFIN; f++) {
    const a = (f + .5) / NFIN * TAU, c = Math.cos(a), sn = Math.sin(a), rd = [c, sn, 0], t = [-sn, c, 0], h = .0011;
    const at = (rr, z, sd) => [c * rr + t[0] * h * sd, sn * rr + t[1] * h * sd, z];
    for (const sd of [-1, 1]) {
      const A = at(ROD_R, REAR + .004, sd), B = at(ROD_R, FIN_Z1, sd), C = at(FIN_R, -.945, sd), D = at(FIN_R, -.992, sd);
      P_.quadL(o, A, B, C, D, sd > 0 ? t : [-t[0], -t[1], 0], s);
      P_.lineL(o, A, B, s * .6); P_.lineL(o, B, C, s * .6); P_.lineL(o, C, D, s * .6); P_.lineL(o, D, A, s * .6);
    }
    seg(o, at(FIN_R, -.945, 0), at(FIN_R, -.992, 0), rd, s * .6);
  }
  return o;
}
/* the sabot segment k: the profile, lattice shells, the skin, radial struts, the split faces, the rear and front
   faces, the grooved sleeve */
const GAPA = .9 * PI / 180;                           // half the seam (a 1.8° split)
const RS = [.052, .096];
const R_IN = .0142;
function Rz(z) {                                      // the outer profile
  if (z < SAB_Z0 + .035) return .128 + .012 * (z - SAB_Z0) / .035;
  if (z < .2) return SAB_R;
  return SAB_R - (SAB_R - .05) * (z - .2) / (SAB_Z1 - .2);
}
const DZ = .0244, DA = .024;
function segPts(k, s) {
  const o = [], a0 = k * TAU / 3, th0 = a0 - PI / 3 + GAPA, th1 = a0 + PI / 3 - GAPA;
  const ZN = []; for (let z = SAB_Z0 + .006; z <= SAB_Z1 - .004; z += DZ) ZN.push(z);
  const nz = ZN.length;
  const shells = RS.concat([-1]);                     // -1: the skin
  const rad = (sh, z) => sh < 0 ? Rz(z) - .0015 : sh;
  const live = (sh, z) => sh < 0 || sh < Rz(z) - .008;
  const nAt = sh => Math.max(2, Math.round((th1 - th0) * (sh < 0 ? SAB_R : sh) / DA));
  const nrmS = (sh, z, c, sn) => { if (sh >= 0 || z < .2 && z > SAB_Z0 + .035) return [c, sn, 0]; const d = (Rz(z + .002) - Rz(z - .002)) / .004, l = Math.hypot(1, d); return [c / l, sn / l, -d / l]; };
  const P = (sh, i, j, n) => { const z = ZN[i], a = th0 + (th1 - th0) * j / n, r = rad(sh, z); return [Math.cos(a) * r, Math.sin(a) * r, z]; };
  for (let m = 0; m < shells.length; m++) {
    const sh = shells[m], n = nAt(sh);
    for (let i = 0; i < nz; i++) {
      const z = ZN[i]; if (!live(sh, z)) continue;
      const okUp = i + 1 < nz && live(sh, ZN[i + 1]);
      for (let j = 0; j <= n; j++) {
        const a = th0 + (th1 - th0) * j / n, c = Math.cos(a), sn = Math.sin(a), p = P(sh, i, j, n), nr = nrmS(sh, z, c, sn);
        // the node: a small bright cross (two-sided), the crystal's sparkle
        if (s < .004) { const q = .0024; seg(o, [p[0] - c * q, p[1] - sn * q, p[2]], [p[0] + c * q, p[1] + sn * q, p[2]], null, s * .6); seg(o, [p[0] + sn * q, p[1] - c * q, p[2]], [p[0] - sn * q, p[1] + c * q, p[2]], null, s * .6); seg(o, [p[0], p[1], p[2] - q], [p[0], p[1], p[2] + q], null, s * .6); }
        if (j < n) arc(o, rad(sh, z), z, a, th0 + (th1 - th0) * (j + 1) / n, s, nr === null ? null : 'r');
        if (okUp) seg(o, p, P(sh, i + 1, j, n), nr, s);
        if (okUp && j < n) { const d = (i + j) & 1; seg(o, d ? P(sh, i, j + 1, n) : p, d ? P(sh, i + 1, j, n) : P(sh, i + 1, j + 1, n), nr, s); }
        // radial struts on to the next shell out, at every other node
        if (m < shells.length - 1 && !(i & 1) && !(j & 1)) {
          const sh2 = shells[m + 1]; if (!live(sh2, z)) continue;
          const r2 = rad(sh2, z); seg(o, p, [c * r2, sn * r2, z], [c, sn, 0], s);
        }
      }
    }
  }
  // the split faces: a lattice in (r, z) on each, lit from its own side
  for (const [a, sd] of [[th0, -1], [th1, 1]]) {
    const c = Math.cos(a), sn = Math.sin(a), nf = [-sn * sd, c * sd, 0], rr = [R_IN, ...RS];
    for (let i = 0; i < nz; i++) {
      const z = ZN[i], ro = Rz(z) - .0015, Rr = rr.filter(r => r < ro - .008).concat([ro]);
      for (let q = 0; q < Rr.length - 1; q++) seg(o, [c * Rr[q], sn * Rr[q], z], [c * Rr[q + 1], sn * Rr[q + 1], z], nf, s);
      if (i + 1 < nz) {
        const z2 = ZN[i + 1], ro2 = Rz(z2) - .0015;
        seg(o, [c * R_IN, sn * R_IN, z], [c * R_IN, sn * R_IN, z2], nf, s);
        const rm = Math.min(ro, ro2), rmid = (R_IN + Math.min(RS[0], rm)) / 2;
        if ((i & 1) === 0) seg(o, [c * R_IN, sn * R_IN, z], [c * rmid, sn * rmid, z2], nf, s);
      }
    }
  }
  // the rear face (z SAB_Z0) and the front (SAB_Z1): arcs at each shell, spokes at the skin's nodes
  for (const [z, nz_] of [[SAB_Z0, -1], [SAB_Z1, 1]]) {
    const ro = Rz(z) - .0015, n = nAt(-1);
    for (const r of [R_IN, ...RS, ro]) if (r <= ro) arc(o, r, z, th0, th1, s, [0, 0, nz_]);
    for (let j = 0; j <= n; j++) { const a = th0 + (th1 - th0) * j / n, c = Math.cos(a), sn = Math.sin(a); seg(o, [c * R_IN, sn * R_IN, z], [c * ro, sn * ro, z], [0, 0, nz_], s); }
  }
  // the sleeve on the rod: a fine surface, its grooves as rings
  const ns = Math.max(4, Math.round((th1 - th0) * R_IN / (s * 1.2)));
  for (let z = SAB_Z0 + s * .6; z < SAB_Z1; z += s * 1.2) {
    const groove = ((z - SAB_Z0) % .012) < s * 1.2;
    for (let j = 0; j < ns; j++) { const a = th0 + (th1 - th0) * (j + .5) / ns, c = Math.cos(a), sn = Math.sin(a); o.push(c * R_IN, sn * R_IN, z, groove ? 0 : c, groove ? 0 : sn, 0); }
  }
  return o;
}
/* an armature half (sd ±1: the +Y or -Y half), as GEO prims sampled by the parts' sampler: a C in section, its
   throat plate pressing the sabot's rear face, its leg trailing to the contact pad on the rail face, a boss round
   the rod (the halves meet at Y 0) */
function armPrims(sd) {
  const G = GEO, P = [], F = { fine: true };
  const bx = (a, b, o) => G.box([a[0], Math.min(a[1], b[1]), a[2]], [b[0], Math.max(a[1], b[1]), b[2]], o);
  P.push(bx([-.085, sd * .0005, ARM_Z1 - .035], [.085, sd * .1, ARM_Z1], {}));                    // the throat plate
  P.push(bx([-.09, sd * .1, ARM_Z0], [.09, sd * .14, ARM_Z1], {}));                                // the leg and its rail pad
  const ba = sd > 0 ? 0 : PI, at = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  for (let k = 0; k < 6; k++) {
    const a0 = ba + k / 6 * PI, a1 = ba + (k + 1) / 6 * PI;
    P.push(G.hex([at(a0, .0135, ARM_Z0 + .02), at(a1, .0135, ARM_Z0 + .02), at(a1, .0135, ARM_Z1), at(a0, .0135, ARM_Z1), at(a0, .026, ARM_Z0 + .02), at(a1, .026, ARM_Z0 + .02), at(a1, .026, ARM_Z1), at(a0, .026, ARM_Z1)], {}));
  }
  // the pad's laminations, the plate's seam
  for (let k = 0; k < 9; k++) { const x = -.08 + k * .02; P.push(G.line([[x, sd * .1405, ARM_Z0 + .004], [x, sd * .1405, ARM_Z1 - .004]], F)); }
  P.push(G.line([[-.084, sd * .0005, ARM_Z1 - .0355], [.084, sd * .0005, ARM_Z1 - .0355]], F));
  return P;
}

/* ---------- build ---------- */
let K = null, P_ = null, LIME = null, HOT = null, WH = null;
const CL = {};
const LV_ROD = [.0006, .0012, .0024, .0048, .0096, .0192], LV_SAB = [.0015, .003, .006, .012, .024, .048], LV_ARM = [.0026, .0052, .0104, .0208, .0416, .0832];
const SEG_A = [0, 1, 2].map(k => k * TAU / 3);
function build(rctx) {
  if (CL.rod) return;
  const t0 = performance.now();
  K = rctx.K; P_ = rctx.P_; LIME = rctx.LIME; HOT = rctx.HOT; WH = rctx.WH;
  CL.rod = K.lodCloud(LV_ROD.map(sp => ({ sp, pts: new Float32Array(rodPts(sp)) })), .07);
  CL.seg = SEG_A.map((a, k) => K.lodCloud(LV_SAB.map(sp => ({ sp, pts: new Float32Array(segPts(k, sp)) })), .07));
  CL.armA = P_.lod(armPrims(1), .06, LV_ARM); CL.armB = P_.lod(armPrims(-1), .06, LV_ARM);
  const n = ml => ml.lv[0].length / 6;
  RGR.stats = { ms: Math.round(performance.now() - t0), rod: n(CL.rod), seg: n(CL.seg[0]), arm: n(CL.armA) };
}

/* ---------- the circuit FX: dots along the traces in screen space (1.4 px apart), the far side culled, the
   occluders and the X-ray respected; unlit a faint line in its channel, lit lime with streaks running to the nose ---------- */
const CA = new Float64Array(3), CB = new Float64Array(3), WA = new Float64Array(3), WB = new Float64Array(3);
const OL = { glow: 0, T: 0, laid: 9, fresh: .035, a: 1, Ls: null, md: 0, zfix: undefined, cut: -99, sp: 1.6, n: 2, step: 1.4, white: .3, kinds: 7, tail: .12, back: 0, sync: 0, rev: 0 };
const OLO = Object.assign({}, OL);
function xrOpen(o) {
  if (!o.md || !o.Ls) return true;
  const XS = P_.XS; if (XS.zo > 90) return o.md !== 3;
  const T = o.Ls.T, b = XS.box, z = o.zfix === undefined ? T[2] : o.zfix;
  if (T[0] < b[0] || T[0] > b[1] || T[1] < b[2] || T[1] > b[3] || z < b[4] || z > b[5]) return o.md !== 3;
  return o.md !== 3 || (z > XS.zo && z < XS.zs);
}
function lines(Lw, opt) {
  const o = OLO; for (const k in OL) o[k] = opt && opt[k] !== undefined ? opt[k] : OL[k];
  if (o.a < .01 || !xrOpen(o)) return;
  const C = K.C, M = Lw.R, T = Lw.T, e = C.eye, r = C.r, u = C.u, f = C.f, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near;
  const occd = P_.occd, g = o.glow, lit = Math.min(1, g * 1.6), A = o.a, BW = K.BW, BH = K.BH;
  const cr = WH[0] + (LIME[0] - WH[0]) * lit, cg = WH[1] + (LIME[1] - WH[1]) * lit, cb = WH[2] + (LIME[2] - WH[2]) * lit;
  const base = (o.white + .5 * g) * A, Ls = o.Ls, cut = o.cut, useCut = cut > -98 && Ls;
  const tim = o.T * o.sp, laid = o.laid, fr = o.fresh;
  for (let li = 0; li < LN.length; li++) {
    const ln = LN[li]; if (!((o.kinds >> ln.kind) & 1)) continue;
    const p = ln.p, nn = ln.n, S = ln.s, np = S.length, per = ln.L + .7, ph = o.sync ? 0 : (li * .6180339887) % 1 * per;
    for (let i = 0; i < np - 1; i++) {
      const i3 = i * 3, z0 = p[i3 + 2], z1 = p[i3 + 5];
      if (z0 > laid) break;
      // facing: the segment's normal against the view
      const nx = M[0] * nn[i3] + M[1] * nn[i3 + 1] + M[2] * nn[i3 + 2], ny = M[3] * nn[i3] + M[4] * nn[i3 + 1] + M[5] * nn[i3 + 2], nz = M[6] * nn[i3] + M[7] * nn[i3 + 1] + M[8] * nn[i3 + 2];
      for (let q = 0; q < 2; q++) {
        const j = i3 + q * 3, W = q ? WB : WA;
        W[0] = M[0] * p[j] + M[1] * p[j + 1] + M[2] * p[j + 2] + T[0]; W[1] = M[3] * p[j] + M[4] * p[j + 1] + M[5] * p[j + 2] + T[1]; W[2] = M[6] * p[j] + M[7] * p[j + 1] + M[8] * p[j + 2] + T[2];
      }
      if (nx * (WA[0] - e[0]) + ny * (WA[1] - e[1]) + nz * (WA[2] - e[2]) > 0) continue;
      if (useCut) { const ys = Ls.R[3] * p[i3] + Ls.R[4] * p[i3 + 1] + Ls.R[5] * p[i3 + 2] + Ls.T[1]; if (ys < cut) continue; }
      for (let q = 0; q < 2; q++) { const W = q ? WB : WA, Cc = q ? CB : CA, dx = W[0] - e[0], dy = W[1] - e[1], dz = W[2] - e[2]; Cc[0] = dx * r[0] + dy * r[1] + dz * r[2]; Cc[1] = dx * u[0] + dy * u[1] + dz * u[2]; Cc[2] = dx * f[0] + dy * f[1] + dz * f[2]; }
      if (CA[2] < near || CB[2] < near) continue;
      const x0 = cx + Fl * CA[0] / CA[2], y0 = cy - Fl * CA[1] / CA[2], x1 = cx + Fl * CB[0] / CB[2], y1 = cy - Fl * CB[1] / CB[2];
      if ((x0 < 0 && x1 < 0) || (y0 < 0 && y1 < 0) || (x0 > BW && x1 > BW) || (y0 > BH && y1 > BH)) continue;
      const Lp = Math.hypot(x1 - x0, y1 - y0), m = Math.min(1500, Math.max(1, Math.ceil(Lp / o.step))), iz0 = 1 / CA[2], iz1 = 1 / CB[2];
      const wide = Fl * CH_W * 2 * Math.max(iz0, iz1) > (g > .5 ? 1.2 : 4);   // the channel wide on screen (or lit): 2 px traces
      const s0 = S[i], s1 = S[i + 1];
      for (let k = 0; k < m; k++) {
        const t = k / m, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (x < 0 || y < 0 || x >= BW || y >= BH) continue;
        const iz = iz0 + (iz1 - iz0) * t, w = (t * iz1) / iz, zl = z0 + (z1 - z0) * w;
        if (zl > laid) break;
        if (occd(x, y, 1 / iz)) continue;
        let b = base, rr = cr, gg = cg, bb = cb;
        const sl0 = s0 + (s1 - s0) * w, sl = o.rev ? ln.L - sl0 : sl0;   // (rev: the streaks run nose to tail)
        if (g > .01 && ln.kind === 0) {
          if (o.back > 0) {
            // streaks leaving the laying front and running back down the new trace, fading over o.back
            const pb = o.back * 1.6;
            for (let h = 0; h < o.n; h++) {
              const zh = laid - ((tim + ph * .37 + h * pb / o.n) % pb), d = zl - zh;
              if (d >= 0 && d < o.tail) { const v = 1 - d / o.tail; b += 1.4 * g * A * v * v * Math.exp(-(laid - zl) / o.back); }
            }
          } else for (let h = 0; h < o.n; h++) {
            let d = ((tim + ph + h * per / o.n) % per) - sl;
            if (d >= 0 && d < o.tail) { const v = 1 - d / o.tail; b += 1.3 * g * A * v * v; }
          }
        }
        if (laid < 8 && zl > laid - fr) { const v = 1 - (laid - zl) / fr; b = Math.max(b, (.6 + .4 * v) * A); rr = LIME[0]; gg = LIME[1]; bb = LIME[2]; }
        if (b < .02) continue;
        if (b > 1.25) b = 1.25;
        const bc = b > 1 ? 1 : b, wh = b > 1 ? (b - 1) * 2 : 0;
        const R_ = rr + (255 - rr) * wh, G_ = gg + (255 - gg) * wh, B_ = bb + (255 - bb) * wh;
        K.dot(x, y, 1, R_, G_, B_, bc);
        if (wide) { K.dot(x + 1, y, 1, R_, G_, B_, bc * .8); K.dot(x, y + 1, 1, R_, G_, B_, bc * .8); }
        if ((k & 3) === 0 && (b > .85 || lit > .3)) K.add(x, y, wide ? 7 : 5, LIME[0], LIME[1], LIME[2], b > .85 ? .1 * (b - .6) : .025 * lit * b);
        if (b > 1.05 && (k % 3) === 0) K.add(x, y, 13, LIME[0], LIME[1], LIME[2], .05 * (b - 1));
      }
    }
  }
}

/* ---------- the circuit X-rayed: each channel's two walls and its floor (CH_D deep) as hairlines with section ticks,
   the conductor in it lime (a charge pulse running it), the vias' barrels down into the core with a ring at their foot,
   the contact rings' grooves; both sides of the rod (the far side at half), between round z z0..z1 (faded over fz) ---------- */
const CH_D = .0013, VIA_D = .0045, XTICK = .012;
const XO = { z0: -9, z1: 9, fz: .06, a: 1, glow: 0, T: 0, sp: 1.2, rev: 0, Ls: null, cut: -99 };
const XOO = Object.assign({}, XO);
const XP = [new Float64Array(3), new Float64Array(3), new Float64Array(3), new Float64Array(3), new Float64Array(3), new Float64Array(3)];
function xray(Lw, opt) {
  const o = XOO; for (const k in XO) o[k] = opt && opt[k] !== undefined ? opt[k] : XO[k];
  if (o.a < .01 || !CL.rod) return;
  // (the channels' walls, floors and ticks only where the rod is wide enough on screen to show them: below 70 px
  // across they fade, leaving the conductors and the pulse)
  const dz_ = Math.max(.05, K.C.depth(Lw.T)), dpx = K.C.fl * 2 * ROD_R / dz_, kd = E.sat((dpx - 25) / 45);
  const M = Lw.R, T = Lw.T, e = K.C.eye, z0 = o.z0, z1 = o.z1, fz = Math.max(1e-4, o.fz), A = o.a, g = o.glow;
  const Ls = o.Ls, cut = o.cut, useCut = cut > -98 && Ls;
  const W = (x, y, z, out) => { out[0] = M[0] * x + M[1] * y + M[2] * z + T[0]; out[1] = M[3] * x + M[4] * y + M[5] * z + T[1]; out[2] = M[6] * x + M[7] * y + M[8] * z + T[2]; return out; };
  const band = z => z < z0 - fz || z > z1 + fz ? 0 : Math.min(1, (z - z0 + fz) / fz, (z1 + fz - z) / fz);
  const shipY = (x, y, z) => Ls.R[3] * x + Ls.R[4] * y + Ls.R[5] * z + Ls.T[1];
  const L = (P, Q, st, col, a, gl) => K.lineW(P[0], P[1], P[2], Q[0], Q[1], Q[2], st, 1, col, a, gl ? LIME : null, gl || 0, 0);
  const [P0, P1, Q0, Q1, R0, R1] = XP;
  // (in step with lines()' synchronised streaks: the head at (T sp) mod (L + .7) along the trace)
  const pulse = (s, Ln) => { if (g < .01) return 0; const per = Ln + .7, d = (o.T * o.sp) % per - (o.rev ? Ln - s : s); return d >= 0 && d < .12 ? 1 - d / .12 : 0; };
  for (let li = 0; li < LN.length; li++) {
    const ln = LN[li]; if (ln.kind !== 0) continue;
    const p = ln.p, nn = ln.n, S = ln.s, np = S.length;
    for (let i = 0; i < np - 1; i++) {
      const i3 = i * 3, za = p[i3 + 2], zb = p[i3 + 5], wz = band((za + zb) * .5);
      if (wz < .02) continue;
      if (useCut && shipY(p[i3], p[i3 + 1], za) < cut) continue;
      const nx = nn[i3], ny = nn[i3 + 1], nz = nn[i3 + 2], tx = -ny, ty = nx;   // (the channel's normal, its width across)
      // the far side of the rod (its channels facing away) at half
      const wnx = M[0] * nx + M[1] * ny + M[2] * nz, wny = M[3] * nx + M[4] * ny + M[5] * nz, wnz = M[6] * nx + M[7] * ny + M[8] * nz;
      W(p[i3], p[i3 + 1], za, P0);
      const far = wnx * (P0[0] - e[0]) + wny * (P0[1] - e[1]) + wnz * (P0[2] - e[2]) > 0, k = (far ? .45 : 1) * wz * A;
      const dd = .00025 + CH_D, dm = .00025 + CH_D * .45;
      // the walls' lips, the floor, the conductor
      if (kd > .02) {
        for (const sd of [-1, 1]) {
          W(p[i3] + tx * CH_W * sd, p[i3 + 1] + ty * CH_W * sd, za, P0); W(p[i3 + 3] + tx * CH_W * sd, p[i3 + 4] + ty * CH_W * sd, zb, P1); L(P0, P1, 1.5, WH, .55 * k * kd);
        }
        W(p[i3] - nx * dd, p[i3 + 1] - ny * dd, za, Q0); W(p[i3 + 3] - nx * dd, p[i3 + 4] - ny * dd, zb, Q1); L(Q0, Q1, 1.5, WH, .4 * k * kd);
      }
      W(p[i3] - nx * dm, p[i3 + 1] - ny * dm, za, R0); W(p[i3 + 3] - nx * dm, p[i3 + 4] - ny * dm, zb, R1); L(R0, R1, 1.2, LIME, (.5 + .4 * g) * k * (.35 + .65 * kd), .05 * (.5 + g) * kd);
      // section ticks: the channel's U, wall to floor to wall
      if (kd > .02) for (let q = Math.ceil(S[i] / XTICK); q * XTICK < S[i + 1]; q++) {
        const w = (q * XTICK - S[i]) / Math.max(1e-6, S[i + 1] - S[i]), x = p[i3] + (p[i3 + 3] - p[i3]) * w, y = p[i3 + 1] + (p[i3 + 4] - p[i3 + 1]) * w, z = za + (zb - za) * w;
        const kt = .4 * k * kd;
        W(x + tx * CH_W, y + ty * CH_W, z, P0); W(x + tx * CH_W - nx * dd, y + ty * CH_W - ny * dd, z, P1); L(P0, P1, 1.2, WH, kt);
        W(x - tx * CH_W - nx * dd, y - ty * CH_W - ny * dd, z, Q0); L(P1, Q0, 1.2, WH, kt); W(x - tx * CH_W, y - ty * CH_W, z, Q1); L(Q0, Q1, 1.2, WH, kt);
      }
      // the charge pulse riding the conductor
      const pa = pulse(S[i], ln.L), pb = pulse(S[i + 1], ln.L), pm = Math.max(pa, pb);
      if (pm > .02) { L(R0, R1, 1, HOT, Math.min(1, pm * 1.3) * k, .12 * pm); K.glowW((R0[0] + R1[0]) / 2, (R0[1] + R1[1]) / 2, (R0[2] + R1[2]) / 2, 9, LIME, .25 * pm * k); }
    }
  }
  // the vias: a barrel down into the core (four walls, the conductor lime down its axis), a ring at its foot
  for (const [z, th] of VIAS) {
    const wz = band(z); if (wz < .02) continue;
    const c = Math.cos(th), s = Math.sin(th);
    if (useCut && shipY(c * RL, s * RL, z) < cut) continue;
    W(c * RL, s * RL, z, P0);
    const far = (M[0] * c + M[1] * s) * (P0[0] - e[0]) + (M[3] * c + M[4] * s) * (P0[1] - e[1]) + (M[6] * c + M[7] * s) * (P0[2] - e[2]) > 0, k = (far ? .45 : 1) * wz * A;
    const rb = RL - VIA_D;
    for (let q = 0; q < 4; q++) {
      const ph = q * PI / 2 + .4, ot = Math.cos(ph) * .0011, oz = Math.sin(ph) * .0011;
      if (kd > .02) { W(c * RL - s * ot, s * RL + c * ot, z + oz, P1); W(c * rb - s * ot, s * rb + c * ot, z + oz, Q0); L(P1, Q0, 1.2, WH, .45 * k * kd); }
    }
    W(c * rb, s * rb, z, Q1); L(P0, Q1, 1, LIME, (.6 + .4 * g) * k * (.35 + .65 * kd), .06 * kd);
    if (kd > .02) K.ringW(Q1, [-(M[0] * s) + M[1] * c, -(M[3] * s) + M[4] * c, -(M[6] * s) + M[7] * c], [M[2], M[5], M[8]], .0011, 10, 1, LIME, .7 * k, 0);
  }
  // the contact rings' grooves
  for (const zr of [TR_Z0, TR_Z1]) {
    const wz = band(zr); if (wz < .02) continue;
    const r = RL - .00025 - CH_D * .45;
    for (let q = 0; q < 32; q++) {
      const a0 = q / 32 * TAU, a1 = (q + 1) / 32 * TAU;
      W(Math.cos(a0) * r, Math.sin(a0) * r, zr, P0); W(Math.cos(a1) * r, Math.sin(a1) * r, zr, P1); L(P0, P1, 1.2, LIME, (.5 + .4 * g) * wz * A, .04);
    }
  }
}

/* ---------- draw ---------- */
const I3 = X.make(R.I(), [0, 0, 0]);
const LSEG = [I3, I3, I3].map(() => X.make(R.I(), [0, 0, 0])), LARM = [X.make(R.I(), [0, 0, 0]), X.make(R.I(), [0, 0, 0])];
function partsAt(e) {
  for (let k = 0; k < 3; k++) { const a = SEG_A[k], T = LSEG[k].T; T[0] = Math.cos(a) * .3 * e; T[1] = Math.sin(a) * .3 * e; T[2] = .03 * e; }
  LARM[0].T[1] = .05 * e; LARM[0].T[2] = -.38 * e; LARM[1].T[1] = -.05 * e; LARM[1].T[2] = -.38 * e;
}
function drawParts(Lw, Ls, o, rod, sab, arm) {
  const X_ = P_.drawX, S0 = o.S;
  if (rod) { o.S = Ls; X_(CL.rod, Lw, o); }
  if (sab) for (let k = 0; k < 3; k++) { o.S = Ls ? X.mul(Ls, LSEG[k]) : null; X_(CL.seg[k], X.mul(Lw, LSEG[k]), o); }
  if (arm) for (let k = 0; k < 2; k++) { o.S = Ls ? X.mul(Ls, LARM[k]) : null; X_(k ? CL.armB : CL.armA, X.mul(Lw, LARM[k]), o); }
  o.S = S0;
}
const LO = { glow: 0, T: 0, a: 1, Ls: null, md: 0, zfix: undefined };
function draw(Lw, Ls, e, o, glow, rctx) {
  if (!CL.rod) return;
  partsAt(e || 0);
  drawParts(Lw, Ls, o, true, true, true);
  LO.glow = glow || 0; LO.T = rctx ? rctx.T : 0; LO.a = Math.min(1.2, (o.a || 1) / 1.25) * (o.keep === undefined ? 1 : Math.max(.2, o.keep)); LO.Ls = Ls; LO.md = o.md || 0; LO.zfix = o.zfix;
  lines(Lw, LO);
}
function drawRod(Lw, o, glow, rctx) {
  if (!CL.rod) return;
  drawParts(Lw, o.S || null, o, true, false, false);
  LO.glow = glow || 0; LO.T = rctx ? rctx.T : 0; LO.a = Math.min(1.2, (o.a || 1) / 1.25); LO.Ls = o.S || null; LO.md = o.md || 0; LO.zfix = o.zfix;
  lines(Lw, LO);
}

window.RGR = { ROD_LEN, ROD_R, SAB_LEN, SAB_R, SAB_Z0, SAB_Z1, LEN, REAR, NOSE, ARM_Z0, ARM_Z1, NOSE_Z, FIN_R, TR_Z0, TR_Z1,
  LINES, SEG_A, CL, build, draw, drawRod, lines, xray, sabotSeg: k => CL.seg[k], Rz, R_IN, RS, stats: null,
  NTR, RL, CH_W, CH_D, TR_TIP, thAt: (k, z) => thAt(TRACES[k], z), surfR: z => z <= NOSE_Z ? ROD_R : noseR(z) };
})();
