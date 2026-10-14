/* ORBITAL RAILGUN platform (window.ORP(ORL) -> the model): a 1.7 km orbital railgun, built from the procedural lattice
   bodies of pc_orbital_railgun_lat.js. Every pose is a pure function of a state object; poses are written into
   preallocated transforms (no allocation per frame). Repeated parts are instanced bodies with a far LOD.

   Frame: metres, +Z along the bore toward the muzzle, +Y the top, +X starboard; origin on the bore at the chamber's
   front face (the round sits centred at Z_RND).
     Barrel      z 0..1003.5 deployed. Six 150 m segments of fifteen 10 m bays, folded in a concertina under the first
                 one when stowed (alternate hinges on the bottom and top flats), then three telescoping muzzle stages
                 (36 m, slimmer hexes) and the crown with a six-petal iris. Cross-section: a 26 m hexagonal frame,
                 a lined bore (r 1.0, two rails), nine superconducting magnet tubes round it (r 6.4), a charge ring
                 every 5 m between them; under each face of each bay a pulse cassette, over it a skin flap (540 of
                 each) that open in stages. Joint collars with 12 sliding lock jaws and a bore sleeve each; a sensor
                 mast on each joint for the laser line.
     Chamber     z -40..0: a hex housing (r 21) round the chamber tube, two chamber coils, the breech block sliding
                 down, three lock rings (slide, then turn 30 deg), twelve clamp jaws; four retro pods on the housing.
     Bay         the fabrication bay, z -116..-44 (56 x 44 x 72 m), a port on the bore axis into the chamber; a
                 16 m tender docked on its starboard wall.
     Spine       a hex truss (r 24) z -116..-560 with the power bus, the transit tube, the switchyard (z -190..-134,
                 four rotary switches), two clusters of six cryogen tanks (liquid helium for the magnets) and the
                 gyro hub (z -300).
     Gyro ring   a deployable hoop: 16 momentum nodes and 32 half-chords with knee joints (stowed as a bundle of V's
                 round the spine at r 40, deployed r 170), on cables from the hub; it spins.
     Reactor     z -660..-580: a thermoelectric core (r 28): hot shoe, a layer of Seebeck couples (8 rows of 160 in
                 series), the cold shoe; twelve accordion radiator fins of six 14 x 64 m panels.
     Engines     four vectored engines on outriggers (r 90, between the fins), nozzle extensions that slide out.
     Lasers      an emitter on the reactor, mirrors on the hub and the housing, a periscope down to the barrel line,
                 sensor plates on the joints and the crown; four sensors on the ring.
   Effect channels (ch, q) for the film's callback; q is a z (bore metres, local to an instance: the film adds CUR.z)
   unless stated: 1 charge ring, 2 power bus / rails / conduits, 3 status light, 4 magnet tube, 5 reactor heat
   (q 0 core, 1 hot shoe), 6 radiator fin (CUR.j panel), 7 muzzle crown / iris, 8 the round (q 0 rod, 1 sabot,
   2 armature), 9 chamber (q 0 coils, 1 block, 2 lock rings, 3 clamps, 4 chamber tube), 10 gyro ring (q 0 nodes,
   1 chords, 2 cables, -1 rotor), 11 couples (q row), 12 engine (q 0 bell, 1 extension, 2 pod, 3 retro), 13 switch
   (q 0 disc, 1 blades, 10 engine terminals, 11 gun terminals), 14 laser hardware (q station), 15 lock jaw (CUR.k
   joint), 16 cryogen (q tank). */
window.ORP = function (L) {
'use strict';
const { V, R, X, E } = M3, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const { Body } = L;
const XA = [1, 0, 0], YA = [0, 1, 0], ZA = [0, 0, 1], NYA = [0, -1, 0], NZA = [0, 0, -1];
const perp = L.perp, C30 = Math.cos(PI / 6);

/* ---------------- dimensions ---------------- */
const HR = 13, HA = HR * C30;                                   // barrel hex: circumradius, apothem
const NSEG = 6, LSEG = 150, BAYL = 10, NBAY = 15, NB = NSEG * NBAY;
const BORE_R = 1.0, LINER_R = 2.2, NMAG = 9, MAG_RC = 6.4, MAG_R = 1.1, CRING_R = 3.7;
const NTEL = 3, TEL_R = [11.6, 10.2, 8.8], TEL_L = 36, TEL_S0 = [111, 111.8, 112.6], TEL_S1 = [147, 180, 213];
const Z_TELEND = (NSEG - 1) * LSEG + TEL_S1[2] + TEL_L, CROWN_L = 4.5, Z_MZ = Z_TELEND + CROWN_L;
const COL_R = 15, COL_L = 2.2;                                  // joint collars
const Z_RND = -6, RND_L = 8.4, RND_R = .96, ROD_L = 6, ROD_R = .25;
const HSG_R = 21, HSG_Z0 = -40, HSG_Z1 = 0, CHT_Z0 = -15, CHT_R = 1.95;
const BLK_Z = [-15.8, -13.4], LOCK_Z = [-12.6, -7.4, -2.0], CLAMP_Z = [-8.4, -3.6];
const BAY_C = [0, 0, -80], BAY_H = [28, 22, 36];
const SR = 24, SZ0 = -116, SZ1 = -560, NSB = 32, SBAY = (SZ0 - SZ1) / NSB;
const SWZ = [-190, -134], SWX = 30, SWY = 28;
const HUB_Z = -300, HUB_R = 32, HUB_L = 36;
const NND = 16, RING_R = 170, CHORD = 2 * RING_R * Math.sin(PI / NND), RST_R = 40;
const KAPPA_S = Math.acos(2 * RST_R * Math.sin(PI / NND) / CHORD), HC = CHORD / 2;
const REA_Z0 = -660, REA_Z1 = -580, CORE_R = 28, HS_R = 28.4, CS_R = 30.8, SHELL_R = 31.8;
const NFIN = 12, NFP = 6, FPW = 14, FIN_Z0 = -652, FIN_L = 64, FPHI_S = 84 * DEG;
const NENG = 4, ENG_R = 90, ENG_Z0 = -586, ENG_TH = -628, BELL_L = 24, BELL_R1 = 9.5, EXT_L = 12, EXT_R1 = 12.5;
const TANKS = [[-255, -205], [-470, -420]], TANK_RC = SR + 9.6, TANK_R = 6.4;
const BEAM_Y = 19.5;
const LZ = { emit: [0, 38, -568], mHub: [0, 38, -300], mHsg: [0, 38, -24], mDn: [0, BEAM_Y, -24] };

/* ---------------- in-place rigid transforms ---------------- */
const xf = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] });
const _m = new Float64Array(9), _t = new Float64Array(3);
function mulTo(o, a, b) {
  const A = a.R, B = b.R, at = a.T, bt = b.T;
  for (let i = 0; i < 3; i++) {
    const a0 = A[i * 3], a1 = A[i * 3 + 1], a2 = A[i * 3 + 2];
    _m[i * 3] = a0 * B[0] + a1 * B[3] + a2 * B[6]; _m[i * 3 + 1] = a0 * B[1] + a1 * B[4] + a2 * B[7]; _m[i * 3 + 2] = a0 * B[2] + a1 * B[5] + a2 * B[8];
    _t[i] = a0 * bt[0] + a1 * bt[1] + a2 * bt[2] + at[i];
  }
  const M = o.R; for (let i = 0; i < 9; i++) M[i] = _m[i]; o.T[0] = _t[0]; o.T[1] = _t[1]; o.T[2] = _t[2]; return o;
}
/* o = translate(t) * rotate(axis 0/1/2, ang) about pivot p */
function rot(o, ax, ang, px, py, pz, tx, ty, tz) {
  const c = Math.cos(ang), s = Math.sin(ang), M = o.R;
  if (ax === 0) { M[0] = 1; M[1] = 0; M[2] = 0; M[3] = 0; M[4] = c; M[5] = -s; M[6] = 0; M[7] = s; M[8] = c; }
  else if (ax === 1) { M[0] = c; M[1] = 0; M[2] = s; M[3] = 0; M[4] = 1; M[5] = 0; M[6] = -s; M[7] = 0; M[8] = c; }
  else { M[0] = c; M[1] = -s; M[2] = 0; M[3] = s; M[4] = c; M[5] = 0; M[6] = 0; M[7] = 0; M[8] = 1; }
  px = px || 0; py = py || 0; pz = pz || 0;
  o.T[0] = px - (M[0] * px + M[1] * py + M[2] * pz) + (tx || 0);
  o.T[1] = py - (M[3] * px + M[4] * py + M[5] * pz) + (ty || 0);
  o.T[2] = pz - (M[6] * px + M[7] * py + M[8] * pz) + (tz || 0);
  return o;
}
const tr = (o, x, y, z) => rot(o, 2, 0, 0, 0, 0, x, y, z);
function axes(o, ex, ey, ez, t) { const M = o.R; M[0] = ex[0]; M[1] = ey[0]; M[2] = ez[0]; M[3] = ex[1]; M[4] = ey[1]; M[5] = ez[1]; M[6] = ex[2]; M[7] = ey[2]; M[8] = ez[2]; o.T[0] = t[0]; o.T[1] = t[1]; o.T[2] = t[2]; return o; }
const apTo = (o, x, p) => { const M = x.R, t = x.T; o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + t[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + t[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + t[2]; return o; };
const L1 = xf(), L2 = xf(), L3 = xf(), L4 = xf();

/* ---------------- builders ---------------- */
const bodies = [];
const mk = name => { const B = new Body(name); bodies.push(B); return B; };
const HEX = (r, a0) => { const P = []; for (let k = 0; k < 6; k++) { const t = (a0 || 0) + k * PI / 3; P.push([Math.cos(t) * r, Math.sin(t) * r]); } return P; };
const sq = (B, c, U, W, h, br, ch, q) => { const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => V.add(c, V.add(V.mul(U, i * h), V.mul(W, j * h)))); B.poly(P, true, br, ch, q); };
/* a square lattice truss along unit axis ax from a, side axes u, w, half size h, n bays */
function truss(B, a, ax, u, w, h, len, n, o) {
  o = o || {};
  const rL = o.rL || .3, rB = o.rB || .16, rD = o.rD || .12, kn = o.kn || 1, tag = o.tag || 'tr';
  const C4 = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const P = (s, i) => V.add(V.mad(a, ax, s), V.add(V.mul(u, C4[i][0] * h), V.mul(w, C4[i][1] * h)));
  for (let b = 0; b < n; b++) {
    if (o.chunk !== false && b % (o.per || 1) === 0) B.chunk(tag + b);
    const s0 = len * b / n, s1 = len * (b + 1) / n;
    for (let i = 0; i < 4; i++) {
      B.tube(P(s0, i), P(s1, i), rL, .62);
      B.tube(P(s0, i), P(s0, (i + 1) % 4), rB, .5);
      const f = (b + i) % 2; B.tube(P(f ? s0 : s1, i), P(f ? s1 : s0, (i + 1) % 4), rD, .4);
      B.knot(P(s0, i), kn, .85);
    }
    if (b === n - 1) for (let i = 0; i < 4; i++) { B.tube(P(s1, i), P(s1, (i + 1) % 4), rB, .5); B.knot(P(s1, i), kn, .85); }
  }
}
/* a hexagonal truss along Z (vertices at 0, 60...: flat top and bottom); heavy(b): a bulkhead frame at the bay's start */
function hexTruss(B, z0, z1, r, nb, o) {
  o = o || {};
  const HV_ = HEX(r), tag = o.tag || 'hx', rL = o.rL || .6, rB = o.rB || .4, rD = o.rD || .26, kn = o.kn || 1.4;
  for (let b = 0; b < nb; b++) {
    if (b % (o.per || 1) === 0) B.chunk(tag + b);
    const za = z0 + (z1 - z0) * b / nb, zb = z0 + (z1 - z0) * (b + 1) / nb, heavy = o.heavy && o.heavy(b);
    for (let k = 0; k < 6; k++) {
      const [x, y] = HV_[k], [x2, y2] = HV_[(k + 1) % 6];
      B.tube([x, y, za], [x, y, zb], rL, .64);
      B.tube([x, y, za], [x2, y2, za], heavy ? rB * 2 : rB, heavy ? .66 : .5);
      const f = (b + k) % 2; B.tube([x, y, f ? za : zb], [x2, y2, f ? zb : za], rD, .4);
      B.knot([x, y, za], heavy ? kn * 1.6 : kn, .85);
      if (heavy) { B.tube([x * .55, y * .55, za], [x, y, za], rB, .5); B.knot([x * .55, y * .55, za], kn * .8, .8); B.tube([x * .55, y * .55, za], [x2 * .55, y2 * .55, za], rB * .8, .48); }
    }
    if (b === nb - 1) for (let k = 0; k < 6; k++) { const [x, y] = HV_[k], [x2, y2] = HV_[(k + 1) % 6]; B.tube([x, y, zb], [x2, y2, zb], rB * 1.6, .6); B.knot([x, y, zb], kn * 1.4, .85); }
  }
}
/* an equipment box with lid seams and a handrail; c centre, ax ay az axes (ay out of the face), h half sizes */
function eqBox(B, c, ax, ay, az, h, o) {
  o = o || {};
  B.obox(c, ax, ay, az, h, o.cell || .08, { br: o.br || .9, edge: .7, skip: o.skip, ch: o.ch, q: o.q });
  const top = V.mad(c, ay, h[1] * 1.004);
  for (let k = 1; k < 4; k++) { const z = -h[2] + 2 * h[2] * k / 4; B.line(V.add(V.mad(top, az, z), V.mul(ax, -h[0])), V.add(V.mad(top, az, z), V.mul(ax, h[0])), .4, 0, 0, h[2] * .5); }
  B.line(V.add(V.mad(top, ax, -h[0] * .6), V.mul(az, -h[2] * .8)), V.add(V.mad(top, ax, -h[0] * .6), V.mul(az, h[2] * .8)), .35, 0, 0, h[0]);
  if (o.rail !== false) { const rr = V.mad(top, ay, .35); B.line(V.add(V.mad(rr, ax, h[0] * .8), V.mul(az, -h[2] * .9)), V.add(V.mad(rr, ax, h[0] * .8), V.mul(az, h[2] * .9)), .32, 0, 0, h[0] * 1.5); }
}
/* an RCS quad: a block and four nozzles; c centre, n outward normal, t tangent; s scale */
function rcsQuad(B, c, n, t, s) {
  s = s || 1; const b = V.cross(n, t);
  B.obox(V.mad(c, n, .5 * s), t, b, n, [.7 * s, .7 * s, .5 * s], .05 * s, { br: .95, edge: .8 });
  for (const d of [t, V.mul(t, -1), b, V.mul(b, -1)]) B.lathe(V.add(V.mad(c, n, .55 * s), V.mul(d, .7 * s)), d, [[0, .12 * s], [.45 * s, .32 * s]], { cell: .04 * s, br: .9, two: true, rbr: .7 });
}
/* a dish: rim radius r, depth dp, facing n */
function dish(B, c, n, r, dp) {
  const [U, W] = perp(n), st = [];
  for (let k = 0; k <= 6; k++) { const u = k / 6; st.push([dp * u * u, r * u]); }
  B.lathe(V.mad(c, n, -dp), n, st, { cell: .1, br: .9, two: true, rings: false });
  B.ringP(c, U, W, r, .8); B.ringP(V.mad(c, n, -dp * .25), U, W, r * .5, .45);
  for (let k = 0; k < 12; k++) { const t = k / 12 * TAU, dir = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t))); B.line(V.add(V.mad(c, n, -dp), V.mul(dir, r * .08)), V.add(c, V.mul(dir, r)), .45); }
  const f = V.mad(c, n, r * .55);
  for (let k = 0; k < 3; k++) { const t = k / 3 * TAU + .3, dir = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t))); B.tube(V.add(c, V.mul(dir, r * .96)), f, .06 * r / 3, .55); }
}
/* a panel with ribs every rs (m) along v */
function ribbed(B, o, u, v, cell, rs, opt) {
  B.panel(o, u, v, cell, Object.assign({ seams: [0, 0] }, opt));
  const Lv = V.len(v), n = Math.max(1, Math.round(Lv / rs));
  for (let k = 1; k < n; k++) { const a = V.mad(o, v, k / n); B.line(a, V.add(a, u), .36, opt.ch, opt.q, rs * (k % 2 ? 1 : 2)); }
}

/* the instance being drawn (the film's effect callback reads it) */
const CUR = { z: 0, k: -1, j: 0, inst: 0 };

/* ================= the barrel ================= */
const HV = HEX(HR);
/* ---- a bay's frame (instanced 90 times): longerons, frames, braces under the skin, latches, conduits, lights ---- */
const bayFr = mk('bayFr'); bayFr.chunk('frame');
for (let k = 0; k < 6; k++) {
  const [x, y] = HV[k], [x2, y2] = HV[(k + 1) % 6];
  bayFr.tube([x, y, 0], [x, y, BAYL], .55, .66);
  bayFr.tube([x, y, 0], [x2, y2, 0], .4, .52);
  bayFr.tube([x, y, .3], [x2, y2, BAYL - .3], .16, .32); bayFr.tube([x2, y2, .3], [x, y, BAYL - .3], .16, .32);
  bayFr.knot([x, y, 0], 1.3, .9);
  bayFr.box([x * 1.02 - .35, y * 1.02 - .35, 4.3], [x * 1.02 + .35, y * 1.02 + .35, 5.7], .05, { br: .95, edge: .7 });
  bayFr.line([x * 1.06, y * 1.06, 0], [x * 1.06, y * 1.06, BAYL], .46, 2, 5);
  bayFr.line([x * 1.09, y * 1.09, 0], [x * 1.09, y * 1.09, BAYL], .3, 0, 0);
}
bayFr.chunk('lt');
bayFr.knot([HV[1][0] * 1.08, HV[1][1] * 1.08, 5], .5, .9, 3, 5); bayFr.knot([HV[4][0] * 1.08, HV[4][1] * 1.08, 5.2], .5, .9, 3, 5.2);
bayFr.done();
const bayLo = mk('bayLo'); bayLo.chunk('f');
for (let k = 0; k < 6; k++) { const [x, y] = HV[k], [x2, y2] = HV[(k + 1) % 6]; bayLo.line([x, y, 0], [x, y, BAYL], .66); bayLo.line([x, y, 0], [x2, y2, 0], .52); }
bayLo.knot([HV[1][0] * 1.08, HV[1][1] * 1.08, 5], .5, .9, 3, 5);
bayLo.done();
/* ---- a bay's interior: the lined bore, rails, nine magnet tubes, spiders, two charge rings, bus bars, lines ---- */
const bayIn = mk('bayIn');
bayIn.chunk('core');
bayIn.lathe([0, 0, 0], ZA, [[0, LINER_R], [BAYL, LINER_R]], { cell: .12, br: .86, seams: 16, sbr: .3, rbr: .45 });
for (const s of [1, -1]) bayIn.box([-.22, s > 0 ? BORE_R - .34 : -BORE_R, 0], [.22, s > 0 ? BORE_R : -BORE_R + .34, BAYL], .06, { br: 1, edge: .8, ch: 2, q: 5 });
for (let m = 0; m < NMAG; m++) {
  const t = PI / 2 + m * TAU / NMAG, x = Math.cos(t) * MAG_RC, y = Math.sin(t) * MAG_RC;
  bayIn.tube([x, y, 0], [x, y, BAYL], MAG_R, .74, 4, 5);
  for (const z of [1.25, 3.75, 6.25, 8.75]) bayIn.ringP([x, y, z], XA, YA, MAG_R * 1.08, .5, 4, z, 2.5);
  bayIn.line([x * (MAG_RC + MAG_R + .35) / MAG_RC, y * (MAG_RC + MAG_R + .35) / MAG_RC, 0], [x * (MAG_RC + MAG_R + .35) / MAG_RC, y * (MAG_RC + MAG_R + .35) / MAG_RC, BAYL], .36, 16, m);
}
bayIn.chunk('spider');
for (const z of [.25, 5.25]) {
  for (let m = 0; m < NMAG; m++) { const t = PI / 2 + m * TAU / NMAG, c = Math.cos(t), s = Math.sin(t); bayIn.tube([c * LINER_R, s * LINER_R, z], [c * (MAG_RC - MAG_R), s * (MAG_RC - MAG_R), z], .12, .44); }
  for (let k = 0; k < 6; k++) { const t = k * PI / 3, c = Math.cos(t), s = Math.sin(t); bayIn.tube([c * (MAG_RC + MAG_R + .1), s * (MAG_RC + MAG_R + .1), z], [c * HR * .96, s * HR * .96, z], .15, .44); }
  bayIn.ringP([0, 0, z], XA, YA, MAG_RC + MAG_R + .2, .4, 0, 0, 5);
}
for (const z of [2.5, 7.5]) {
  bayIn.lathe([0, 0, z - .45], ZA, [[0, CRING_R], [.9, CRING_R]], { cell: .08, br: .92, rings: false, ch: 1, q: z });
  bayIn.ringP([0, 0, z - .46], XA, YA, CRING_R, .62, 1, z); bayIn.ringP([0, 0, z + .46], XA, YA, CRING_R, .62, 1, z);
  bayIn.ringP([0, 0, z], XA, YA, LINER_R + .1, .5, 1, z, 3);
  for (let k = 0; k < 4; k++) { const t = PI / 4 + k * PI / 2; bayIn.line([Math.cos(t) * CRING_R, Math.sin(t) * CRING_R, z], [Math.cos(t) * (MAG_RC - 1.2), Math.sin(t) * (MAG_RC - 1.2), z], .5, 1, z); }
}
for (const s of [1, -1]) bayIn.box([-.7, s * 4.6 - .16, 0], [.7, s * 4.6 + .16, BAYL], .08, { br: .9, edge: .62, ch: 2, q: 5 });
for (let k = 0; k < 6; k++) { const t = PI / 6 + k * PI / 3; bayIn.line([Math.cos(t) * 8.6, Math.sin(t) * 8.6, 0], [Math.cos(t) * 8.6, Math.sin(t) * 8.6, BAYL], .38, 0, 0); }
bayIn.done();

/* the interior far away: the liner, the magnets and the rings as hairlines */
const bayInLo = mk('bayInLo'); bayInLo.chunk('c');
for (let m = 0; m < NMAG; m++) { const t = PI / 2 + m * TAU / NMAG, x = Math.cos(t) * MAG_RC, y = Math.sin(t) * MAG_RC; bayInLo.line([x, y, 0], [x, y, BAYL], .9, 4, 5); }
for (let k = 0; k < 4; k++) { const t = k * PI / 2, x = Math.cos(t) * LINER_R, y = Math.sin(t) * LINER_R; bayInLo.line([x, y, 0], [x, y, BAYL], .6); }
for (const z of [2.5, 7.5]) bayInLo.ringP([0, 0, z], XA, YA, CRING_R, .9, 1, z);
for (const s of [1, -1]) bayInLo.line([0, s * 4.6, 0], [0, s * 4.6, BAYL], .7, 2, 5);
bayInLo.done();

/* ---- a skin flap (instanced 540): canonical over the top face, hinged on the vertex at x = +HR/2; far LOD ---- */
const FW = HR - .3, FLL = BAYL - .3;
const flap = mk('flap'); flap.chunk('f');
flap.panel([-.15, .04, .15], [-FW, 0, 0], [0, 0, FLL], .1, { n: YA, br: .8, edge: .72, seams: [16, 16], sbr: .25 });
flap.panel([-.15, -.5, .15], [-FW, 0, 0], [0, 0, FLL], .25, { n: NYA, br: .45, edge: false });
for (const z of [.15, FLL + .15]) flap.line([-.15, .04, z], [-.15, -.5, z], .5), flap.line([-.15 - FW, .04, z], [-.15 - FW, -.5, z], .5);
for (const z of [2.6, 5.1, 7.6]) flap.line([-.5, .07, z], [-FW + .2, .07, z], .42, 0, 0, 2.5);
for (const x of [-FW / 3, -2 * FW / 3]) flap.line([x, .07, .4], [x, .07, FLL - .1], .3, 0, 0, 3);
for (const z of [1.2, 5, 8.8]) flap.lathe([0, 0, z - .6], ZA, [[0, .4], [1.2, .4]], { cell: .06, br: 1 });
flap.box([-FW - .1, -.35, 4.5], [-FW + .6, .2, 5.6], .05, { br: .95, edge: .8 });
flap.done();
const flapLo = mk('flapLo'); flapLo.chunk('f');
flapLo.panel([-.15, .04, .15], [-FW, 0, 0], [0, 0, FLL], .3, { n: YA, br: .8, edge: .62 });
flapLo.done();

/* ---- a whole segment far away with its skin closed (one draw instead of 15 bays and 90 flaps) ---- */
const segLo = mk('segLo');
for (let k = 0; k < 6; k++) {
  segLo.chunk('f' + k);
  const [x, y] = HV[k], [x2, y2] = HV[(k + 1) % 6];
  segLo.panel([x, y, 0], [x2 - x, y2 - y, 0], [0, 0, LSEG], [.4, 1.25], { n: V.norm([(x + x2) / 2, (y + y2) / 2, 0]), br: .8, edge: false, seams: [0, 8], sbr: .4 });
  segLo.line([x, y, 0], [x, y, LSEG], .7);
  for (let b = 0; b <= NBAY; b++) segLo.line([x, y, b * BAYL], [x2, y2, b * BAYL], .55, 0, 0, b % 5 ? BAYL : 0);
}
segLo.chunk('lt');
for (let b = 0; b < NBAY; b++) { segLo.knot([HV[1][0] * 1.08, HV[1][1] * 1.08, b * BAYL + 5], .5, .9, 3, b * BAYL + 5); }
segLo.done();

/* ---- a pulse cassette (instanced 540): under the top face; slides out and turns up ---- */
const CAS_Y = HA - 2.0, CAS_H = [4.6, 1.1, 4.0];
const cas = mk('cas'); cas.chunk('c');
eqBox(cas, [0, CAS_Y, 5], XA, YA, ZA, CAS_H, { cell: .1, br: .9, rail: false });
for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) cas.line([x, CAS_Y - CAS_H[1] - .02, 1.4], [x, CAS_Y - CAS_H[1] - .02, 8.6], .4, 1, 5, 1.6);
for (const x of [-3.6, 3.6]) cas.lathe([x, CAS_Y - CAS_H[1], 5], NYA, [[0, .35], [.7, .35], [.7, 0]], { cell: .05, br: 1, ch: 2, q: 5 });
cas.done();
const casLo = mk('casLo'); casLo.chunk('c');
casLo.box([-CAS_H[0], CAS_Y - CAS_H[1], 5 - CAS_H[2]], [CAS_H[0], CAS_Y + CAS_H[1], 5 + CAS_H[2]], .5, { br: .75, edge: .8 });
casLo.done();

/* ---- a collar (instanced at every segment end): a heavy hex ring, hinge knuckles, a sensor mast ---- */
const CV = HEX(COL_R);
function makeCollar(name, mast) {
  const B = mk(name); B.chunk('c');
  for (let k = 0; k < 6; k++) {
    const [x, y] = CV[k], [x2, y2] = CV[(k + 1) % 6], [hx, hy] = HV[k], [hx2, hy2] = HV[(k + 1) % 6];
    B.panel([x, y, 0], [x2 - x, y2 - y, 0], [0, 0, COL_L], .1, { br: .9, edge: .75, n: V.norm([(x + x2) / 2, (y + y2) / 2, 0]), seams: [6, 0], sbr: .3 });
    B.panel([hx, hy, 0], [x - hx, y - hy, 0], [hx2 - hx, hy2 - hy, 0], .12, { br: .7, edge: .6, n: NZA, two: true });
    B.knot([x, y, COL_L / 2], 1.1, .9);
    for (const f of [.25, .75]) { const px = x + (x2 - x) * f, py = y + (y2 - y) * f; B.line([px, py, 0], [px, py, COL_L], .45); }
  }
  for (const sy of [1, -1]) for (const x of [-5, 0, 5]) B.lathe([x - 1.1, sy * HA, 0], XA, [[0, .85], [2.2, .85]], { cell: .06, br: 1 });
  if (mast) {
    B.chunk('m');
    const y0 = COL_R * C30;
    B.tube([0, y0, 1.1], [0, BEAM_Y - 1.1, 1.1], .35, .6);
    B.tube([-2, y0, 1.1], [0, BEAM_Y - 2.6, 1.1], .16, .45); B.tube([2, y0, 1.1], [0, BEAM_Y - 2.6, 1.1], .16, .45);
    B.panel([-1.1, BEAM_Y - 1.1, 1.1], [2.2, 0, 0], [0, 2.2, 0], .07, { n: NZA, two: true, br: .7, edge: .85, ch: 14, q: 1 });
    B.ringP([0, BEAM_Y, 1.08], XA, YA, .7, .7, 14, 1); B.ringP([0, BEAM_Y, 1.08], XA, YA, .35, .6, 14, 1);
    B.line([-.9, BEAM_Y, 1.07], [.9, BEAM_Y, 1.07], .5, 14, 1); B.line([0, BEAM_Y - .9, 1.07], [0, BEAM_Y + .9, 1.07], .5, 14, 1);
  }
  B.done(); return B;
}
const collarM = makeCollar('collarM', true), collarE = makeCollar('collarE', false);
const jaw = mk('jaw'); jaw.chunk('j');
for (const x of [-3.4, 3.4]) jaw.box([x - 1, COL_R * C30 + .1, .3], [x + 1, COL_R * C30 + 1.2, 3.8], .07, { br: 1, edge: .85, ch: 15, q: 0 });
jaw.done();
const sleeve = mk('sleeve'); sleeve.chunk('s');
sleeve.lathe([0, 0, 0], ZA, [[0, LINER_R + .05], [0, LINER_R + .4], [3.4, LINER_R + .4], [3.4, LINER_R + .05]], { cell: .07, br: 1, seams: 8, ch: 2, q: 1.7 });
sleeve.done();

/* ---- the telescoping muzzle stages ---- */
const tel = TEL_R.map((r, k) => {
  const B = mk('tel' + k), H = HEX(r), ap = r * C30, sm = r / HR;
  for (let b = 0; b < 6; b++) {
    B.chunk('t' + b);
    const z0 = b * 6, z1 = z0 + 6;
    for (let i = 0; i < 6; i++) {
      const [x, y] = H[i], [x2, y2] = H[(i + 1) % 6];
      B.tube([x, y, z0], [x, y, z1], .42, .64); B.tube([x, y, z0], [x2, y2, z0], .3, .52);
      B.panel([x, y, z0 + .1], [x2 - x, y2 - y, 0], [0, 0, 5.8], .12, { br: .74, edge: false, seams: [8, 10], sbr: .24, n: V.norm([(x + x2) / 2, (y + y2) / 2, 0]) });
      B.knot([x, y, z0], .9, .9);
    }
    B.lathe([0, 0, z0], ZA, [[0, LINER_R], [6, LINER_R]], { cell: .12, br: .86, seams: 12, sbr: .3, rbr: .45 });
    for (let m = 0; m < NMAG; m++) { const t = PI / 2 + m * TAU / NMAG; B.tube([Math.cos(t) * MAG_RC * sm, Math.sin(t) * MAG_RC * sm, z0], [Math.cos(t) * MAG_RC * sm, Math.sin(t) * MAG_RC * sm, z1], MAG_R * sm, .72, 4, z0 + 3); }
    const zc = z0 + 3;
    B.lathe([0, 0, zc - .45], ZA, [[0, CRING_R], [.9, CRING_R]], { cell: .08, br: .92, rings: false, ch: 1, q: zc });
    B.ringP([0, 0, zc - .46], XA, YA, CRING_R, .62, 1, zc); B.ringP([0, 0, zc + .46], XA, YA, CRING_R, .62, 1, zc);
    B.knot([0, ap + .5, zc], .5, .9, 3, zc);
  }
  B.chunk('end');
  for (let i = 0; i < 6; i++) { const [x, y] = H[i], [x2, y2] = H[(i + 1) % 6]; B.tube([x, y, TEL_L], [x2, y2, TEL_L], .5, .62); B.tube([x * 1.06, y * 1.06, TEL_L - 1.8], [x2 * 1.06, y2 * 1.06, TEL_L - 1.8], .36, .55); B.knot([x, y, TEL_L], 1.2, .9); }
  B.done(); return B;
});
/* the crown: a flared collar at the muzzle, RCS quads, the iris seat, the last sensor */
const crown = mk('crown'); crown.chunk('c');
const CRR = TEL_R[2] * 1.18, IRIS_R = 5.4;
{
  const r = TEL_R[2], H = HEX(CRR);
  for (let i = 0; i < 6; i++) { const [x, y] = H[i], [x2, y2] = H[(i + 1) % 6]; crown.panel([x, y, 0], [x2 - x, y2 - y, 0], [0, 0, CROWN_L], .1, { br: .92, edge: .8, ch: 7, q: 0, n: V.norm([(x + x2) / 2, (y + y2) / 2, 0]) }); crown.knot([x, y, CROWN_L], .9, .9); crown.panel([x, y, CROWN_L], [x2 - x, y2 - y, 0], [-x * .4, -y * .4, 0], .14, { two: true, br: .6, edge: .5, ch: 7, q: 0 }); }
  crown.lathe([0, 0, .2], ZA, [[0, LINER_R], [2.6, LINER_R + .3], [3.6, 3.6], [CROWN_L, IRIS_R]], { cell: .07, br: 1, two: true, ch: 7, q: 0, seams: 24 });
  crown.ringP([0, 0, CROWN_L + .02], XA, YA, IRIS_R, .9, 7, 0); crown.ringP([0, 0, CROWN_L + .02], XA, YA, BORE_R + .1, .7, 7, 0);
  for (let i = 0; i < 4; i++) { const t = PI / 4 + i * PI / 2, n = [Math.cos(t), Math.sin(t), 0]; rcsQuad(crown, [n[0] * r * 1.1, n[1] * r * 1.1, 2.2], n, ZA, 2); }
  crown.tube([0, CRR * C30, 1.2], [0, BEAM_Y - 1.2, 1.2], .35, .6);
  crown.panel([-1.2, BEAM_Y - 1.2, 1.2], [2.4, 0, 0], [0, 2.4, 0], .07, { n: NZA, two: true, br: .8, edge: .9, ch: 14, q: 2 });
  crown.ringP([0, BEAM_Y, 1.18], XA, YA, .8, .8, 14, 2);
  crown.knot([0, CRR * C30 + .4, CROWN_L * .5], .6, .9, 3, 2);
}
crown.done();
const iris = mk('iris'); iris.chunk('p');
iris.panel([-2.6, 0, 0], [5.2, 0, 0], [0, -IRIS_R, 0], .06, { n: ZA, two: true, br: .95, edge: .85, ch: 7, q: 1 });
iris.done();

/* ================= the root: chamber, bay, spine, switchyard, tanks, hub, reactor core, outriggers, lasers ================= */
const root = mk('root');
const LTS = [];
const light = (B, p) => { B.knot(p, .6, .9, 3, p[2]); LTS.push(p); };

/* ---- chamber (inside the housing) ---- */
root.chunk('chamber');
root.lathe([0, 0, CHT_Z0], ZA, [[0, BORE_R + .05], [0, CHT_R + .5], [1.2, CHT_R + .5], [1.2, CHT_R], [-CHT_Z0, CHT_R], [-CHT_Z0, BORE_R + .05]], { cell: .11, br: .95, seams: 16, sbr: .3, ch: 9, q: 4 });
for (const z of [-14, -11, -9, -6, -3, -1]) root.ringP([0, 0, z], XA, YA, CHT_R + .03, .4, 9, 4, 2);
for (const z of [[-10.8, -6.8], [-5.4, -1.4]]) {
  root.lathe([0, 0, z[0]], ZA, [[0, CHT_R + .2], [0, 4.4], [z[1] - z[0], 4.4], [z[1] - z[0], CHT_R + .2]], { cell: .12, br: .95, seams: 24, sbr: .32, ch: 9, q: 0 });
  for (let k = 1; k < 5; k++) root.ringP([0, 0, z[0] + (z[1] - z[0]) * k / 5], XA, YA, 4.42, .45, 9, 0, 1);
}
for (let m = 0; m < NMAG; m++) { const t = PI / 2 + m * TAU / NMAG; root.tube([Math.cos(t) * MAG_RC, Math.sin(t) * MAG_RC, -14], [Math.cos(t) * MAG_RC, Math.sin(t) * MAG_RC, 0], MAG_R, .72, 4, -7); }
root.chunk('transfer');
for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; root.line([Math.cos(t) * 1.35, Math.sin(t) * 1.35, -44], [Math.cos(t) * 1.35, Math.sin(t) * 1.35, BLK_Z[0] - .3], .5); }
for (let z = -44; z <= BLK_Z[0] - .2; z += 2) root.ringP([0, 0, z], XA, YA, 1.38, .55, 0, 0, 2);
for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) for (const z of [-40, -30, -20]) root.tube([x * 1, y * 1, z], [x * HSG_R * .6, y * HSG_R * .6, z], .16, .42);
root.chunk('breech');
for (const s of [1, -1]) root.box([s * 2.5, -8.6, BLK_Z[0] - .2], [s * 2.9, 2.8, BLK_Z[1] + .2], .05, { br: .9, edge: .75 });
root.box([-2.9, -9.0, BLK_Z[0] - .2], [2.9, -8.6, BLK_Z[1] + .2], .05, { br: .9, edge: .7 });
/* ---- the fabrication bay's frame (its walls are their own body, so they can fade) and the docked tender ---- */
root.chunk('bayframe');
{
  const [cx, cy, cz] = BAY_C, [hx, hy, hz] = BAY_H, C8 = [];
  for (let k = 0; k < 8; k++) C8.push([cx + (k & 1 ? hx : -hx), cy + (k & 2 ? hy : -hy), cz + (k & 4 ? hz : -hz)]);
  for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) root.tube(C8[i], C8[j], .8, .66);
  for (let k = 0; k < 8; k++) root.knot(C8[k], 2.2, .9);
  for (let k = 1; k < 9; k++) { const z = cz - hz + 2 * hz * k / 9; root.tube([-hx, hy, z], [hx, hy, z], .45, .55); }
  for (const x of [-hx / 2, 0, hx / 2]) root.tube([x, hy, cz - hz], [x, hy, cz + hz], .35, .5);
  for (const s of [1, -1]) for (let k = 0; k < 7; k++) light(root, [s * (hx + .5), hy + .5, cz - hz + 5 + k * 11]);
}
root.chunk('tender');
{
  const c = [BAY_H[0] + 9.2, 2, BAY_C[2] + 8], ax = ZA;
  root.lathe([BAY_H[0], c[1], c[2]], XA, [[0, 1.6], [6.6, 1.6], [6.6, 2.2]], { cell: .06, br: .95, seams: 8 });            // docking adapter
  root.lathe([c[0] - 2.6, c[1], c[2] - 7], ax, [[0, 0], [0, 1.6], [1.2, 2.8], [11, 2.8], [13, 2.2], [15.5, .9], [16, 0]], { cell: .06, br: .9, seams: 12, sbr: .3 });
  root.lathe([c[0] + .6, c[1], c[2] - 8], NZA, [[0, .7], [1.6, 1.6]], { cell: .05, br: .9, two: true });
  for (const s of [1, -1]) root.panel([c[0] - 2.6 + s * 3, c[1] - .1, c[2] - 3], [s * 7, 0, 0], [0, 0, 6], .1, { n: YA, two: true, br: .7, edge: .7, seams: [8, 6], sbr: .3 });
  light(root, [c[0] - 2.6, c[1] + 2.9, c[2] + 2]);
}
/* ---- the spine: a hex truss with bulkheads every 4 bays, the bus, trays, boxes ---- */
hexTruss(root, SZ1, SZ0, SR, NSB, { tag: 'sp', rL: 1.0, rB: .6, rD: .38, kn: 2.0, heavy: b => b % 4 === 0 });
const SV = HEX(SR);
for (let b = 0; b < NSB; b++) {
  const z0 = SZ1 + b * SBAY, zc = z0 + SBAY / 2;
  root.chunk('spq' + b);
  for (const s of [1, -1]) root.box([s * 9 - .9, -.9, z0], [s * 9 + .9, .9, z0 + SBAY], .12, { br: .88, edge: .62, ch: 2, q: zc });
  for (const [x, y] of [[4.5, 5], [-4.5, 5], [4.5, -5], [-4.5, -5]]) root.line([x, y, z0], [x, y, z0 + SBAY], .4, 0, 0);
  for (const k of (b % 4 === 0 ? [0, 3] : b % 4 === 2 ? [2, 5] : [])) { const t = PI / 6 + k * PI / 3, c = Math.cos(t), s = Math.sin(t); eqBox(root, [c * (SR * C30 + 1.1), s * (SR * C30 + 1.1), zc], [-s, c, 0], [c, s, 0], ZA, [4.2, 1.1, 5.4]); }
  if (b % 2 === 1) light(root, [SV[1][0] * 1.05, SV[1][1] * 1.05, zc]), light(root, [SV[5][0] * 1.05, SV[5][1] * 1.05, zc]);
  root.panel([-3.2, -SR * C30 - 1, z0], [6.4, 0, 0], [0, 0, SBAY], .12, { n: NYA, br: .6, edge: .45 });
  for (const x of [-2.4, 0, 2.4]) root.line([x, -SR * C30 - 1.3, z0], [x, -SR * C30 - 1.3, z0 + SBAY], .4, 2, zc);
}
root.chunk('transit');
root.lathe([0, 0, SZ1], ZA, [[0, 3.2], [SZ0 - SZ1, 3.2]], { cell: .32, br: .7, seams: 8, rings: false });
for (let z = SZ1; z <= SZ0; z += 7) root.ringP([0, 0, z], XA, YA, 3.24, .45, 0, 0, 7);
/* ---- the cryogen tanks: two clusters of six round the spine (liquid helium for the magnets) ---- */
TANKS.forEach(([z0, z1], ci) => {
  for (let k = 0; k < 6; k++) {
    root.chunk('tank' + ci + k);
    const t = PI / 6 + k * PI / 3, c = Math.cos(t), s = Math.sin(t), x = c * TANK_RC, y = s * TANK_RC, L_ = z1 - z0;
    root.lathe([x, y, z0], ZA, [[0, 0], [0, 2.4], [2.6, 5.4], [5, TANK_R], [L_ - 5, TANK_R], [L_ - 2.6, 5.4], [L_, 2.4], [L_, 0]], { cell: .26, br: .9, seams: 12, sbr: .28, rbr: .4, ch: 16, q: ci * 6 + k, solid: true });
    for (let r = 1; r < 6; r++) root.ringP([x, y, z0 + 5 + (L_ - 10) * r / 6], XA, YA, TANK_R * 1.01, .4, 16, ci * 6 + k, (L_ - 10) / 6);
    for (const z of [z0 + 8, z1 - 8]) { root.tube([x - c * TANK_R, y - s * TANK_R, z], [c * SR * C30, s * SR * C30, z], .5, .55); root.knot([x - c * TANK_R, y - s * TANK_R, z], 1.2, .85); }
    root.line([x - c * (TANK_R + .3), y - s * (TANK_R + .3), z0 + 2], [c * (SR * C30 - 1), s * (SR * C30 - 1), z0 - 4], .5, 16, ci * 6 + k);
    light(root, [x + c * (TANK_R + .3), y + s * (TANK_R + .3), (z0 + z1) / 2]);
  }
});
/* ---- the switchyard: a hall round the spine with four rotary switches on its sides ---- */
root.chunk('swhall');
{
  const [z0, z1] = SWZ;
  root.box([-SWX, -SWY, z0], [SWX, SWY, z1], .16, { br: .82, edge: .78, skip: ['x-', 'x+'] });
  for (let k = 1; k < 7; k++) root.line([-SWX, SWY + .05, z0 + (z1 - z0) * k / 7], [SWX, SWY + .05, z0 + (z1 - z0) * k / 7], .4, 0, 0, 8);
  for (const s of [1, -1]) {
    ribbed(root, [s * SWX, -SWY, s > 0 ? z0 : z1], [0, 2 * SWY, 0], [0, 0, s * (z1 - z0)], .16, 7, { n: [s, 0, 0], br: .8, edge: .7 });
    for (const zc of [-176, -148]) {
      root.ringP([s * (SWX + .3), 0, zc], YA, ZA, 7.6, .6);
      for (let k = 0; k < 6; k++) { const t = k / 6 * TAU + PI / 6, y = Math.cos(t) * 7.6, z = zc + Math.sin(t) * 7.6; root.box([s * SWX, y - .8, z - .8], [s * (SWX + 1.6), y + .8, z + .8], .06, { br: .95, edge: .8, ch: 13, q: k < 3 ? 10 : 11 }); }
    }
  }
  for (const s of [1, -1]) for (const z of [z0 + 6, z1 - 6]) light(root, [s * (SWX + .5), SWY + .5, z]);
}
/* ---- the hub's stator (bearing housing) ---- */
root.chunk('hubst');
root.lathe([0, 0, HUB_Z - 6], ZA, [[0, SR], [0, HUB_R + 5], [12, HUB_R + 5], [12, SR]], { cell: .3, br: .9, seams: 24, sbr: .3 });
for (const z of [HUB_Z - HUB_L / 2 - 2, HUB_Z + HUB_L / 2 + 2]) { root.ringP([0, 0, z], XA, YA, HUB_R + 1, .6); for (let k = 0; k < 6; k++) { const [x, y] = SV[k]; root.tube([x, y, z], [x * (HUB_R + 1) / SR, y * (HUB_R + 1) / SR, z], .45, .5); } }
for (let k = 0; k < 4; k++) light(root, [Math.cos(k * PI / 2 + PI / 4) * (HUB_R + 5.3), Math.sin(k * PI / 2 + PI / 4) * (HUB_R + 5.3), HUB_Z]);
/* ---- the reactor: the core (with the hot shoe) and the thrust frame; the jacket and the couples are bodies ---- */
const RL = REA_Z1 - REA_Z0;
root.chunk('thrustframe');
for (let k = 0; k < 6; k++) { const [x, y] = SV[k]; root.tube([x, y, SZ1], [x * 1.05, y * 1.05, REA_Z1 + 8], 1.1, .62); root.knot([x * 1.05, y * 1.05, REA_Z1 + 8], 2, .85); }
root.ringP([0, 0, REA_Z1 + 8], XA, YA, SR * 1.05, .6);
root.chunk('finroots');
for (let f = 0; f < NFIN; f++) { const t = f * TAU / NFIN, c = Math.cos(t), s = Math.sin(t); for (const z of [FIN_Z0 + 2, FIN_Z0 + FIN_L / 2, FIN_Z0 + FIN_L - 2]) root.lathe([c * SHELL_R, s * SHELL_R, z - 1.6], ZA, [[0, 1.1], [3.2, 1.1]], { cell: .07, br: 1 }); }
/* ---- the engine outriggers (arms and pods; the bells and extensions are bodies) ---- */
for (let e = 0; e < NENG; e++) {
  const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t), rad = [c, s, 0], tng = [-s, c, 0];
  root.chunk('arm' + e);
  const a0 = [c * SR * .88, s * SR * .88, -520], a1 = [c * (ENG_R - 9), s * (ENG_R - 9), ENG_Z0 - 4];
  const ax = V.norm(V.sub(a1, a0)), w = V.norm(V.cross(ax, tng));
  truss(root, a0, ax, tng, w, 3.2, V.dist(a0, a1), 9, { rL: .45, rB: .26, rD: .18, kn: 1.0, tag: 'arm' + e, chunk: false });
  root.line(V.add(a0, V.mul(w, 3.6)), V.add(a1, V.mul(w, 3.6)), .5, 2, -540);
  root.chunk('pod' + e);
  const pc = [c * ENG_R, s * ENG_R, 0];
  root.lathe([pc[0], pc[1], ENG_TH + 4], ZA, [[0, 3.6], [8, 7.2], [ENG_Z0 - ENG_TH - 4, 7.2], [ENG_Z0 - ENG_TH, 3.4]], { cell: .14, br: .9, seams: 16, sbr: .3, ch: 12, q: 2 });
  for (let r = 1; r < 6; r++) root.ringP([pc[0], pc[1], ENG_TH + 12 + r * 5], XA, YA, 7.24, .4, 0, 0, 5);
  for (const k of [-1, 1]) eqBox(root, V.add([pc[0], pc[1], ENG_TH + 20], V.mul(tng, k * 8.6)), rad, V.mul(tng, k), ZA, [3.0, 1.6, 7], { cell: .1 });
  for (const k of [-1, 1]) root.lathe(V.add([pc[0], pc[1], ENG_TH + 30], V.mul(rad, k * 9.2)), ZA, [[0, 0], [0, 2.2], [12, 2.2], [12, 0]], { cell: .08, br: .85, seams: 8 });   // propellant tanks
  root.lathe([pc[0], pc[1], ENG_TH], ZA, [[0, 4.6], [2.4, 4.6]], { cell: .08, br: 1, seams: 16 });
  rcsQuad(root, V.add([pc[0], pc[1], ENG_Z0 - 9], V.mul(rad, 7.2)), rad, ZA, 2);
  light(root, V.add([pc[0], pc[1], ENG_Z0 - 2], V.mul(rad, 7.4)));
}
/* ---- the retro pods on the housing (forward-facing, canted out) ---- */
for (let e = 0; e < 4; e++) {
  const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t), d = V.norm([c * .55, s * .55, 1]);
  root.chunk('retro' + e);
  const b = [c * (HSG_R + 4), s * (HSG_R + 4), -10];
  root.tube([c * HSG_R * .9, s * HSG_R * .9, -10], b, 1.0, .6);
  root.lathe(V.mad(b, d, -6), d, [[0, 0], [0, 3], [6, 3], [6, 1.5], [11, 4.2]], { cell: .09, br: .95, two: true, seams: 12, ch: 12, q: 3 });
}
/* ---- the laser line: emitter, mirrors, periscope (the sensors ride the collars and the crown) ---- */
root.chunk('lasers');
{
  const E_ = LZ.emit;
  root.tube([0, CORE_R * .7, E_[2] - 2], [0, E_[1] - 1.4, E_[2]], .6, .6); root.tube([0, SR * C30, E_[2] + 10], [0, E_[1] - 1.4, E_[2]], .4, .5);
  root.box([-1.2, E_[1] - 1.4, E_[2] - 2], [1.2, E_[1] + 1.4, E_[2] + 1.6], .06, { br: 1, edge: .9, ch: 14, q: 0 });
  root.lathe([0, E_[1], E_[2] + 1.6], ZA, [[0, .7], [.9, .7], [.9, .4]], { cell: .04, br: 1, ch: 14, q: 0 });
  const M = LZ.mHub;
  root.tube([0, HUB_R + 5, M[2]], [0, M[1] - 1.5, M[2]], .6, .6);
  root.box([-1.5, M[1] - 1.5, M[2] - 1.5], [1.5, M[1] + 1.5, M[2] + 1.5], .06, { br: 1, edge: .9, ch: 14, q: 3 });
  root.panel([-1.3, M[1] - 1.3, M[2] - 1.3], [2.6, 0, 0], [0, 2.6, 2.6], .06, { two: true, br: .6, edge: .8, ch: 14, q: 3 });
  const H = LZ.mHsg, D = LZ.mDn;
  root.tube([0, HSG_R * C30, H[2]], [0, H[1] - 1.4, H[2]], .6, .6);
  root.box([-1.3, H[1] - 1.3, H[2] - 1.3], [1.3, H[1] + 1.3, H[2] + 1.3], .06, { br: 1, edge: .9, ch: 14, q: 4 });
  root.tube([1.6, D[1], D[2]], [1.6, H[1], H[2]], .3, .5); root.tube([-1.6, D[1], D[2]], [-1.6, H[1], H[2]], .3, .5);
  root.box([-1.2, D[1] - 1.2, D[2] - 1.2], [1.2, D[1] + 1.2, D[2] + 1.2], .06, { br: 1, edge: .9, ch: 14, q: 5 });
}
root.chunk('rcs');
for (const z of [-130, -420]) for (const [x, y] of [[1, 0], [-1, 0]]) rcsQuad(root, [x * SR, 0, z], [x, y, 0], ZA, 2);
root.chunk('dish');
root.tube([0, -SR * C30, -240], [0, -SR * C30 - 12, -246], .5, .55);
dish(root, [0, -SR * C30 - 13, -248], V.norm([0, -.5, 1]), 8, 2.8);
root.chunk('lights');
for (let b = 0; b < 5; b++) light(root, [HSG_R * .5, HSG_R * C30 + .5, HSG_Z0 + 4 + b * 8]);
light(root, [0, -SR * C30 - 1.2, -560]); light(root, [0, LZ.emit[1] + 1.6, LZ.emit[2]]);
root.done();

/* ---- the chamber housing (fades for the X-ray) ---- */
const hsg = mk('hsg');
{
  const H = HEX(HSG_R);
  for (let b = 0; b < 4; b++) {
    hsg.chunk('h' + b);
    const z0 = HSG_Z0 + b * 10, z1 = z0 + 10;
    for (let k = 0; k < 6; k++) {
      const [x, y] = H[k], [x2, y2] = H[(k + 1) % 6], n = V.norm([(x + x2) / 2, (y + y2) / 2, 0]);
      hsg.tube([x, y, z0], [x, y, z1], .8, .66); hsg.tube([x, y, z0], [x2, y2, z0], .6, .55); hsg.knot([x, y, z0], 1.8, .9);
      if (k !== 1 || b === 0) hsg.panel([x, y, z0 + .2], [x2 - x, y2 - y, 0], [0, 0, 9.6], .12, { n, br: .82, edge: .6, seams: [10, 16], sbr: .26 });
      else for (let q = 0; q < 2; q++) hsg.tube([x, y, z0 + q * 10], [x2, y2, z0 + 10 - q * 10], .24, .4);
    }
    for (const k of [0, 3]) { const t = PI / 6 + k * PI / 3, c = Math.cos(t), s = Math.sin(t); eqBox(hsg, [c * (HSG_R * C30 + 1), s * (HSG_R * C30 + 1), z0 + 5], [-s, c, 0], [c, s, 0], ZA, [4, 1, 3.6]); }
  }
  hsg.chunk('front');
  for (let k = 0; k < 6; k++) { const [x, y] = H[k], [x2, y2] = H[(k + 1) % 6]; hsg.tube([x, y, HSG_Z1], [x2, y2, HSG_Z1], .8, .64); hsg.knot([x, y, HSG_Z1], 1.8, .9); hsg.panel([x * .2, y * .2, HSG_Z1], [x2 * .2 - x * .2, y2 * .2 - y * .2, 0], [x - x * .2, y - y * .2, 0], .14, { two: true, br: .5, edge: .4 }); }
}
hsg.done();
/* ---- the bay's walls (fade for the insert / X-ray) ---- */
const hall = mk('hall');
{
  const [cx, cy, cz] = BAY_C, [hx, hy, hz] = BAY_H;
  for (const s of [1, -1]) {
    hall.chunk('side' + s);
    ribbed(hall, [s * hx, -hy, cz + (s > 0 ? -hz : hz)], [0, 2 * hy, 0], [0, 0, s * 2 * hz], .18, 9, { n: [s, 0, 0], br: .8, edge: .7 });
    for (let k = 0; k < 3; k++) if (!(s > 0 && k === 1)) eqBox(hall, [s * (hx + 1), -hy + 9 + k * 13, cz - 16], ZA, [s, 0, 0], YA, [6, 1, 4]);
  }
  hall.chunk('floor'); ribbed(hall, [-hx, -hy, cz - hz], [2 * hx, 0, 0], [0, 0, 2 * hz], .2, 9, { n: NYA, br: .7, edge: .6 });
  hall.chunk('rear'); ribbed(hall, [-hx, -hy, cz - hz], [0, 2 * hy, 0], [2 * hx, 0, 0], .18, 7, { n: NZA, br: .78, edge: .7 });
  sq(hall, [0, 0, cz - hz - .05], XA, YA, 11, .7);
  hall.chunk('front');
  for (const [o, u, v] of [[[-hx, -hy, cz + hz], [hx - 2.6, 0, 0], [0, 2 * hy, 0]], [[2.6, -hy, cz + hz], [hx - 2.6, 0, 0], [0, 2 * hy, 0]], [[-2.6, -hy, cz + hz], [5.2, 0, 0], [0, hy - 2.6, 0]], [[-2.6, 2.6, cz + hz], [5.2, 0, 0], [0, hy - 2.6, 0]]]) hall.panel(o, u, v, .18, { n: ZA, br: .78, edge: .6 });
  hall.ringP([0, 0, cz + hz + .05], XA, YA, 2.3, .9); hall.ringP([0, 0, cz + hz + .05], XA, YA, 1.5, .7);
}
hall.done();
/* ---- the reactor's core (the heat source, its domes) and the hot shoe, in slabs (for culling and the X-ray's clip) ---- */
const coreB = mk('core');
coreB.chunk('aft'); coreB.lathe([0, 0, REA_Z0 - 16], ZA, [[0, 0], [0, 7], [4, 16], [10, 24], [16, CORE_R]], { cell: .32, br: .9, seams: 24, sbr: .3, ch: 5, q: 0, solid: true });
for (let k = 0; k < 8; k++) {
  coreB.chunk('c' + k);
  const z0 = REA_Z0 + k * RL / 8;
  coreB.lathe([0, 0, z0], ZA, [[0, CORE_R], [RL / 8, CORE_R]], { cell: .32, br: .9, seams: 24, sbr: .3, ch: 5, q: 0, solid: true, rings: k === 0 });
  if (k > 0 && k < 7) coreB.lathe([0, 0, z0], ZA, [[0, HS_R], [RL / 8, HS_R]], { cell: .3, br: .7, rings: false, ch: 5, q: 1, solid: true });
}
coreB.chunk('fwd'); coreB.lathe([0, 0, REA_Z1], ZA, [[0, CORE_R], [8, 20], [12, 15], [12, 0]], { cell: .32, br: .9, seams: 24, sbr: .3, ch: 5, q: 0, solid: true });
coreB.done();
/* the core's section where an X-ray cuts it (a flat disc, drawn by the film at the cut) */
const capD = mk('capD'); capD.chunk('d');
capD.lathe([0, 0, 0], ZA, [[0, 0], [0, CORE_R - .1]], { cell: .14, br: 1, two: true, rings: false, ch: 5, q: 2 });
capD.done();
/* ---- the jacket: the cold shoe shell ---- */
const jacket = mk('jacket');
for (let k = 0; k < 8; k++) { jacket.chunk('j' + k); jacket.lathe([0, 0, REA_Z0 + k * RL / 8], ZA, [[0, SHELL_R], [RL / 8, SHELL_R]], { cell: .3, br: .82, seams: 48, sbr: .26, rbr: .5, solid: true }); }
jacket.done();
/* ---- the Seebeck couples: rows of p/n legs between the hot shoe and the cold shoe, in series ---- */
const NCP = 160, CP_ROWS = 8, CP_Z0 = REA_Z0 + 8, CP_DZ = (RL - 16) / (CP_ROWS - 1);
const couples = mk('couples');
for (let sct = 0; sct < 16; sct++) {
  couples.chunk('c' + sct);
  for (let row = 0; row < CP_ROWS; row++) {
    const z = CP_Z0 + row * CP_DZ;
    for (let i = sct * NCP / 16; i < (sct + 1) * NCP / 16; i++) {
      const t0 = i / NCP * TAU, t1 = t0 + TAU / NCP * .42, t2 = (i + 1) / NCP * TAU;
      const P = (t, r) => [Math.cos(t) * r, Math.sin(t) * r, z];
      couples.tube(P(t0, HS_R + .15), P(t0, CS_R - .15), .26, .72, 11, row);
      couples.tube(P(t1, HS_R + .15), P(t1, CS_R - .15), .26, .58, 11, row);
      couples.line(P(t0, HS_R + .1), P(t1, HS_R + .1), .6, 5, 1);
      couples.line(P(t1, CS_R - .1), P(t2, CS_R - .1), .6, 11, row);
    }
  }
}
couples.done();

/* ================= the hub rotor and the gyro ring ================= */
const rotor = mk('rotor'); rotor.chunk('r');
rotor.lathe([0, 0, HUB_Z - HUB_L / 2], ZA, [[0, SR + 1], [0, HUB_R], [HUB_L, HUB_R], [HUB_L, SR + 1]], { cell: .32, br: .88, seams: 32, sbr: .3, ch: 10, q: -1 });
for (const z of [HUB_Z - 10, HUB_Z + 10]) for (let i = 0; i < NND; i++) { const t = i / NND * TAU; rotor.box([Math.cos(t) * HUB_R - .9, Math.sin(t) * HUB_R - .9, z - .9], [Math.cos(t) * HUB_R + .9, Math.sin(t) * HUB_R + .9, z + .9], .05, { br: 1, edge: .8 }); }
rotor.done();
const node = mk('node'); node.chunk('n');
node.obox([0, 0, 0], XA, YA, ZA, [4.5, 3.6, 6], .12, { br: .9, edge: .8, ch: 10, q: 0 });
for (const z of [-3, 0, 3]) node.line([4.52, -3.4, z], [4.52, 3.4, z], .4, 0, 0, 3);
for (const s of [1, -1]) node.lathe([0, s * 3.6, 0], [0, s, 0], [[0, 1.6], [1.4, 1.6], [1.4, .9]], { cell: .06, br: 1 });
node.knot([4.7, 0, 0], .6, .9, 3, 0);
node.done();
function makeChord(name, lo) {
  const B = mk(name); B.chunk('c');
  const hy = 2.2, hz = 4.4, nb = lo ? 2 : 8;
  const P = (s, i) => [s, i & 1 ? hy : -hy, i & 2 ? hz : -hz];
  for (let b = 0; b <= nb; b++) {
    const s = HC * b / nb;
    for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0]]) lo ? B.line(P(s, i), P(s, j), .5) : B.tube(P(s, i), P(s, j), .2, .5);
    if (!lo) for (let i = 0; i < 4; i++) B.knot(P(s, i), .7, .85);
    if (b < nb) { const s1 = HC * (b + 1) / nb; for (let i = 0; i < 4; i++) lo ? B.line(P(s, i), P(s1, i), .64) : B.tube(P(s, i), P(s1, i), .34, .64); if (!lo) { B.tube(P(s, b % 2 ? 0 : 2), P(s1, b % 2 ? 2 : 0), .14, .4); B.tube(P(s, b % 2 ? 1 : 3), P(s1, b % 2 ? 3 : 1), .14, .4); } }
  }
  if (!lo) B.panel([0, hy + .05, -hz], [HC, 0, 0], [0, 0, 2 * hz], .18, { n: YA, br: .62, edge: false, seams: [16, 0], sbr: .24 });
  B.line([0, 0, hz + .3], [HC, 0, hz + .3], .7, 10, 1); B.line([0, 0, -hz - .3], [HC, 0, -hz - .3], .7, 10, 1);
  B.knot([HC / 2, hy + .4, 0], .5, .9, 3, 0);
  B.done(); return B;
}
const chord = makeChord('chord', false), chordLo = makeChord('chordLo', true);

/* ================= the radiator fins: accordion panels (instanced 72) ================= */
const finP = mk('finP'); finP.chunk('p');
finP.panel([.1, 0, .2], [FPW - .2, 0, 0], [0, 0, FIN_L - .4], .14, { n: YA, two: true, br: .72, edge: .7, seams: [0, 0], ch: 6, q: 0 });
for (let k = 1; k < 16; k++) finP.line([.2, .06, FIN_L * k / 16], [FPW - .2, .06, FIN_L * k / 16], .42, 6, 0, FIN_L / 16 * (1 << (k % 2 ? 0 : 1)));
for (const x of [.3, FPW / 2, FPW - .3]) finP.line([x, .1, .2], [x, .1, FIN_L - .2], .55, 6, 0);
for (const z of [3, FIN_L / 2, FIN_L - 3]) finP.lathe([0, 0, z - 1.4], ZA, [[0, .55], [2.8, .55]], { cell: .06, br: 1 });
finP.done();
const finLo = mk('finLo'); finLo.chunk('p');
finLo.panel([.1, 0, .2], [FPW - .2, 0, 0], [0, 0, FIN_L - .4], .3, { n: YA, two: true, br: .72, edge: .7, ch: 6, q: 0 });
finLo.done();

/* ================= engines: bells (gimballed) and the sliding extensions ================= */
const bell = mk('bell'); bell.chunk('b');
bell.lathe([0, 0, 0], NZA, [[0, 2.8], [2, 2.2], [6, 4.4], [14, 7.4], [BELL_L, BELL_R1]], { cell: .12, br: .9, two: true, seams: 32, sbr: .3, rbr: .55, ch: 12, q: 0 });
for (let k = 1; k < 8; k++) { const s = BELL_L * k / 8; bell.ringP([0, 0, -s], XA, YA, 2.2 + (BELL_R1 - 2.2) * Math.pow(k / 8, .8), .4, 12, 0, 3); }
bell.lathe([0, 0, 2.5], ZA, [[0, 3.6], [1.2, 3.6]], { cell: .06, br: 1, seams: 12 });
for (const s of [1, -1]) bell.tube([s * 3.6, 0, 3.1], [s * 4.2, 0, 3.1], .5, .7), bell.tube([0, s * 3.6, 3.1], [0, s * 4.2, 3.1], .5, .7);
for (let k = 0; k < 4; k++) { const t = PI / 4 + k * PI / 2; bell.tube([Math.cos(t) * 4.4, Math.sin(t) * 4.4, 6], [Math.cos(t) * 2.6, Math.sin(t) * 2.6, -4], .3, .55); }   // gimbal actuators
bell.done();
const ext = mk('ext'); ext.chunk('e');
ext.lathe([0, 0, -BELL_L + 1], NZA, [[0, BELL_R1 + .1], [EXT_L, EXT_R1]], { cell: .14, br: .85, two: true, seams: 40, sbr: .28, rbr: .55, ch: 12, q: 1 });
ext.done();

/* ================= the chamber's moving parts and the round ================= */
const block = mk('block'); block.chunk('b');
block.box([-2.4, -2.4, BLK_Z[0]], [2.4, 2.4, BLK_Z[1]], .05, { br: 1, edge: .9, ch: 9, q: 1 });
block.ringP([0, 0, BLK_Z[1] + .02], XA, YA, 1.0, .8, 9, 1); block.ringP([0, 0, BLK_Z[1] + .02], XA, YA, 1.6, .6, 9, 1);
for (const y of [-1.8, -.9, 0, .9, 1.8]) block.line([-2.3, y, BLK_Z[0] - .02], [2.3, y, BLK_Z[0] - .02], .35);
block.done();
const lockR = mk('lockR'); lockR.chunk('l');
lockR.lathe([0, 0, -.6], ZA, [[0, CHT_R + .55], [0, 3.0], [1.2, 3.0], [1.2, CHT_R + .55]], { cell: .09, br: .95, seams: 24, ch: 9, q: 2 });
for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; lockR.obox([Math.cos(t) * 3.4, Math.sin(t) * 3.4, 0], [Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], ZA, [.45, .7, .55], .05, { br: 1, edge: .85, ch: 9, q: 2 }); }
lockR.done();
const clampJ = mk('clampJ'); clampJ.chunk('c');
clampJ.box([BORE_R + .02, -.35, -1.1], [BORE_R + .8, .35, 1.1], .04, { br: 1, edge: .85, ch: 9, q: 3 });
clampJ.tube([BORE_R + .8, 0, 0], [CHT_R + .9, 0, 0], .2, .6, 9, 3);
clampJ.done();
const rod = mk('rod'); rod.chunk('r');
rod.lathe([0, 0, -ROD_L / 2], ZA, [[0, 0], [0, ROD_R * .8], [.15, ROD_R], [ROD_L - 1.3, ROD_R], [ROD_L - .3, ROD_R * .45], [ROD_L, 0]], { cell: .03, br: .6, seams: 6, sbr: .35, ch: 8, q: 0 });
rod.ringP([0, 0, -ROD_L / 2 + .9], XA, YA, ROD_R * 1.02, .55, 8, 0); rod.ringP([0, 0, .6], XA, YA, ROD_R * 1.02, .45, 8, 0);
rod.done();
const sabot = mk('sabot'); sabot.chunk('s');
sabot.lathe([0, 0, -RND_L / 2], ZA, [[0, ROD_R + .02], [0, RND_R], [RND_L - 1.6, RND_R], [RND_L, ROD_R + .3]], { cell: .05, br: .62, seams: 4, sbr: .6, rings: true, rbr: .5, ch: 8, q: 1 });
sabot.lathe([0, 0, -RND_L / 2 - .9], ZA, [[0, .3], [0, RND_R * .99], [.9, RND_R * .99], [.9, .3]], { cell: .05, br: .9, seams: 16, ch: 8, q: 2 });
for (const z of [-2.4, 0, 2]) sabot.ringP([0, 0, z], XA, YA, RND_R * 1.01, .5, 8, 1);
sabot.done();
/* the rotary switch: a disc facing X with three contact blades */
const swDisc = mk('sw'); swDisc.chunk('d');
swDisc.lathe([0, 0, 0], XA, [[0, 0], [0, 6.2], [1.0, 6.2], [1.0, 2]], { cell: .06, br: .95, seams: 24, ch: 13, q: 0 });
for (let k = 0; k < 3; k++) { const t = k / 3 * TAU, c = Math.cos(t), s = Math.sin(t); swDisc.obox([1.3, c * 5.2, s * 5.2], XA, [0, c, s], [0, -s, c], [.3, 2.6, .5], .05, { br: 1, edge: .9, ch: 13, q: 1 }); }
swDisc.done();

/* ---------------- poses (preallocated) ---------------- */
const PP = { W: null, seg: [], bay: [], colS: [], colE: [], jaws: [], sleeves: [], tel: [], crown: xf(), iris: [], rotor: xf(), nodes: [], chords: [], cables: [],
  fins: [], bells: [], exts: [], block: xf(), locks: [], clamps: [], round: xf(), roundOn: false, switches: [], muzzle: [0, 0, 0], laser: [], ring: { r: 0, k: 0, hk: 0, psi: 0 } };
for (let s = 0; s < NSEG; s++) { PP.seg.push(xf()); PP.colS.push(xf()); PP.colE.push(xf()); }
for (let k = 0; k < NB; k++) PP.bay.push(xf());
for (let j = 0; j < NSEG; j++) { PP.sleeves.push(xf()); const J = []; for (let f = 0; f < 6; f++) J.push(xf()); PP.jaws.push(J); }
for (let k = 0; k < NTEL; k++) PP.tel.push(xf());
for (let k = 0; k < 6; k++) PP.iris.push(xf());
for (let i = 0; i < NND; i++) { PP.nodes.push(xf()); PP.chords.push(xf(), xf()); PP.cables.push([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]); }
for (let k = 0; k < NFIN * NFP; k++) PP.fins.push(xf());
for (let e = 0; e < NENG; e++) { PP.bells.push(xf()); PP.exts.push(xf()); }
for (let k = 0; k < 3; k++) PP.locks.push(xf());
for (let k = 0; k < 12; k++) PP.clamps.push(xf());
for (let k = 0; k < 4; k++) PP.switches.push(xf());
for (let k = 0; k < 16; k++) PP.laser.push([0, 0, 0]);
const SWC = [[1, -176], [1, -148], [-1, -176], [-1, -148]];
const KN = [0, 0, 0], NA = [0, 0, 0], NB_ = [0, 0, 0], EX = [0, 0, 0], EY = [0, 0, 0], EZ = [0, 0, 0];
const phiStow = j => (j % 2 ? 1 : -1) * PI, hingeY = j => (j % 2 ? -HA : HA);

/* st: { joint [6] (1..5: 0 folded .. 1 open), jaw [6], sleeve [6], tel, flapAt(gb, out[3]) (flap angle, cassette slide m,
   cassette turn), fin, ring (0 bundle .. 1 hoop), spin (rad), engExt, gimbal [8] (pitch, yaw per engine),
   sw (0 engines .. 1 gun), breech (1 closed), lock (0..1), clamp (0..1), iris, roundZ (null: no round), flex(z, out) } */
const FLX = [0, 0, 0];
const addFlex = (o, st, z, a) => { st.flex(z, FLX); const t = o.T, M = o.R; t[0] += (M[0] * FLX[0] + M[1] * FLX[1]) * a; t[1] += (M[3] * FLX[0] + M[4] * FLX[1]) * a; t[2] += (M[6] * FLX[0] + M[7] * FLX[1]) * a; };
function pose(W, st) {
  const P = PP; P.W = W;
  mulTo(P.seg[0], W, tr(L1, 0, 0, 0));
  for (let j = 1; j < NSEG; j++) { const h = hingeY(j), u = st.joint[j], phi = phiStow(j) * (1 - u); rot(L1, 0, phi, 0, h, 0, 0, 0, LSEG); mulTo(P.seg[j], P.seg[j - 1], L1); }
  for (let s = 0; s < NSEG; s++) {
    for (let b = 0; b < NBAY; b++) { const k = s * NBAY + b; mulTo(P.bay[k], P.seg[s], tr(L1, 0, 0, b * BAYL)); if (st.flex) addFlex(P.bay[k], st, s * LSEG + b * BAYL + 5, 1); }
    mulTo(P.colS[s], P.seg[s], tr(L1, 0, 0, 0)); mulTo(P.colE[s], P.seg[s], tr(L1, 0, 0, LSEG - COL_L));
    if (st.flex) { addFlex(P.colS[s], st, s * LSEG, 1); addFlex(P.colE[s], st, s * LSEG + LSEG, 1); }
  }
  for (let j = 1; j < NSEG; j++) {
    for (let f = 0; f < 6; f++) { mulTo(P.jaws[j][f], P.colS[j], rot(L1, 2, f * PI / 3, 0, 0, 0, 0, 0, -3.4 * st.jaw[j])); }
    mulTo(P.sleeves[j], P.colE[j - 1], tr(L1, 0, 0, COL_L - 3.4 + 1.7 * st.sleeve[j]));
  }
  const trav2 = TEL_S1[2] - TEL_S0[2];
  for (let k = 0; k < NTEL; k++) { const tv = TEL_S1[k] - TEL_S0[k]; mulTo(P.tel[k], P.seg[NSEG - 1], tr(L1, 0, 0, TEL_S0[k] + Math.min(tv, st.tel * trav2))); if (st.flex) addFlex(P.tel[k], st, Z_MZ - 40 + 15 * k, 1); }
  mulTo(P.crown, P.tel[2], tr(L1, 0, 0, TEL_L));
  for (let k = 0; k < 6; k++) { mulTo(L2, P.crown, rot(L1, 2, k * PI / 3 + PI / 6, 0, 0, 0, 0, 0, CROWN_L + .05)); mulTo(P.iris[k], L2, rot(L1, 0, -st.iris * 1.75, 0, IRIS_R, 0, 0, 0, 0)); }
  apTo(P.muzzle, P.crown, [0, 0, CROWN_L]);
  // the gyro ring
  const kap = KAPPA_S * (1 - st.ring), r = CHORD * Math.cos(kap) / (2 * Math.sin(PI / NND)), hk = HC * Math.sin(kap), psi = st.spin;
  P.ring.r = r; P.ring.k = kap; P.ring.hk = hk; P.ring.psi = psi;
  mulTo(P.rotor, W, rot(L1, 2, psi, 0, 0, 0, 0, 0, 0));
  for (let i = 0; i < NND; i++) {
    const a = psi + i * TAU / NND, a1 = a + TAU / NND, am = a + PI / NND;
    mulTo(P.nodes[i], W, rot(L1, 2, a, 0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, HUB_Z));
    NA[0] = Math.cos(a) * r; NA[1] = Math.sin(a) * r; NA[2] = HUB_Z; NB_[0] = Math.cos(a1) * r; NB_[1] = Math.sin(a1) * r; NB_[2] = HUB_Z;
    KN[0] = (NA[0] + NB_[0]) / 2; KN[1] = (NA[1] + NB_[1]) / 2; KN[2] = HUB_Z + hk;
    EY[0] = Math.cos(am); EY[1] = Math.sin(am); EY[2] = 0;
    for (let hh = 0; hh < 2; hh++) {
      const A = hh ? KN : NA, B = hh ? NB_ : KN;
      EX[0] = B[0] - A[0]; EX[1] = B[1] - A[1]; EX[2] = B[2] - A[2]; const l = Math.hypot(EX[0], EX[1], EX[2]); EX[0] /= l; EX[1] /= l; EX[2] /= l;
      EZ[0] = EX[1] * EY[2] - EX[2] * EY[1]; EZ[1] = EX[2] * EY[0] - EX[0] * EY[2]; EZ[2] = EX[0] * EY[1] - EX[1] * EY[0];
      axes(L2, EX, EY, EZ, A); mulTo(P.chords[i * 2 + hh], W, L2);
    }
    const c = Math.cos(a), s = Math.sin(a), rn = r - 4.6;
    apTo(P.cables[i * 4], W, [c * HUB_R, s * HUB_R, HUB_Z - 10]); apTo(P.cables[i * 4 + 1], W, [c * rn, s * rn, HUB_Z - 4]);
    apTo(P.cables[i * 4 + 2], W, [c * HUB_R, s * HUB_R, HUB_Z + 10]); apTo(P.cables[i * 4 + 3], W, [c * rn, s * rn, HUB_Z + 4]);
  }
  // the fins: accordion chains
  const phi = FPHI_S * (1 - st.fin);
  for (let f = 0; f < NFIN; f++) {
    const t = f * TAU / NFIN;
    mulTo(L3, W, rot(L1, 2, t, 0, 0, 0, Math.cos(t) * SHELL_R, Math.sin(t) * SHELL_R, FIN_Z0));
    let px = 0, py = 0;
    for (let j = 0; j < NFP; j++) { const th = (j % 2 ? -1 : 1) * phi; mulTo(P.fins[f * NFP + j], L3, rot(L1, 2, th, 0, 0, 0, px, py, 0)); px += Math.cos(th) * FPW; py += Math.sin(th) * FPW; }
  }
  // engines: gimbal (pitch about the tangent, yaw about the radial) at the throat; the extension slides aft
  for (let e = 0; e < NENG; e++) {
    const t = PI / 4 + e * PI / 2;
    mulTo(L3, W, rot(L1, 2, t, 0, 0, 0, Math.cos(t) * ENG_R, Math.sin(t) * ENG_R, ENG_TH));
    mulTo(L3, L3, rot(L1, 1, st.gimbal[e * 2], 0, 0, 0, 0, 0, 0));
    mulTo(P.bells[e], L3, rot(L1, 0, st.gimbal[e * 2 + 1], 0, 0, 0, 0, 0, 0));
    mulTo(P.exts[e], P.bells[e], tr(L1, 0, 0, -EXT_L * .82 * st.engExt));
  }
  // the chamber
  mulTo(P.block, W, tr(L1, 0, -5.6 * (1 - st.breech), 0));
  for (let k = 0; k < 3; k++) mulTo(P.locks[k], W, rot(L1, 2, (st.lock - 1) * PI / 6, 0, 0, 0, 0, 0, LOCK_Z[k] - .5 * (1 - Math.min(1, st.lock * 2))));
  for (let k = 0; k < 12; k++) { const t = PI / 6 + (k % 6) * PI / 3; mulTo(L2, W, rot(L1, 2, t, 0, 0, 0, 0, 0, CLAMP_Z[k < 6 ? 0 : 1])); mulTo(P.clamps[k], L2, tr(L1, 1.25 * (1 - st.clamp), 0, 0)); }
  P.roundOn = st.roundZ !== null && st.roundZ !== undefined;
  if (P.roundOn) { mulTo(P.round, W, tr(L1, 0, 0, st.roundZ)); if (st.flex) addFlex(P.round, st, st.roundZ, 1); }
  for (let k = 0; k < 4; k++) { const [s, z] = SWC[k]; mulTo(P.switches[k], W, rot(L1, 0, s * st.sw * PI / 3, 0, 0, 0, s * (SWX + 1.2), 0, z)); }
  // the laser line's points (world): emitter, hub mirror, housing mirror, periscope foot, the joint sensors, the crown; the ring sensors
  apTo(P.laser[0], W, LZ.emit); apTo(P.laser[1], W, LZ.mHub); apTo(P.laser[2], W, LZ.mHsg); apTo(P.laser[3], W, LZ.mDn);
  for (let s = 1; s < NSEG; s++) apTo(P.laser[3 + s], P.colS[s], [0, BEAM_Y, 1.1]);
  apTo(P.laser[3 + NSEG], P.crown, [0, BEAM_Y, 1.2]);
  for (let k = 0; k < 4; k++) apTo(P.laser[10 + k], P.nodes[k * 4], [-4.6, 0, 0]);
  return P;
}

/* ---------------- draw ---------------- */
/* LK: { o (base options), hsg, hall, jk (the jacket), cp (the couples, drawn only when given), x (the chamber's
   moving parts and the round), bar (barrel interiors, X-ray), skinOcc (the closed skin occludes: interiors skipped),
   wave(worldPos) -> lime 0..1 (the wake) } */
const OB = {}, OS = {}, OC_ = {}, OF = {};
const FL3 = [0, 0, 0], WP = [0, 0, 0];
let LKc = null;
/* the projected radius (px) of a sphere of radius r at local point lc under Tw */
function lodPx(Tw, lc, r) { apTo(WP, Tw, lc); const C = ORK.C, e = C.eye, d = Math.hypot(WP[0] - e[0], WP[1] - e[1], WP[2] - e[2]); return r * C.fl / Math.max(1, d); }
function inst(B, Tw, o, lc) {
  if (LKc.wave) { apTo(WP, Tw, lc); o.lime = Math.max(o.l0, LKc.wave(WP)); }
  L.draw(B, Tw, o);
}
function draw(P, st, LK) {
  const o = LK.o; LKc = LK;
  Object.assign(OB, LK.bar || o); Object.assign(OS, o); Object.assign(OC_, o); Object.assign(OF, o);
  OB.l0 = OB.lime || 0; OS.l0 = OS.lime || 0; OC_.l0 = OC_.lime || 0; OF.l0 = OF.lime || 0; OF.pxf = 2.6; OB.pxf = (OB.pxf || 1) * 1.7; OS.pxf = (OS.pxf || 1) * 1.6; OB.pxl = 1.5; OS.pxl = 1.4; OF.pxl = 1.3;
  CUR.z = 0; CUR.k = -1; CUR.inst = 0;
  const lm = root.lime;
  if (LK.wave) for (const c of root.CH) { apTo(WP, P.W, c.c); lm[c.i] = LK.wave(WP); } else lm.fill(0);
  L.draw(root, P.W, o);
  L.draw(hsg, P.W, LK.hsg || o); L.draw(hall, P.W, LK.hall || o); L.draw(coreB, P.W, o); L.draw(jacket, P.W, LK.jk || o);
  if (LK.cp) L.draw(couples, P.W, LK.cp);
  // the barrel: frames (far LOD), interiors when they can be seen, cassettes and flaps
  for (let s = 0; s < NSEG; s++) {
    const pxs = lodPx(P.seg[s], [0, 0, LSEG / 2], 16);
    st.flapAt(s * NBAY, FL3); let shut = FL3[0] < .01 && FL3[1] < .01;
    if (shut) { st.flapAt(s * NBAY + NBAY - 1, FL3); shut = FL3[0] < .01 && FL3[1] < .01; }
    const lo = shut && pxs < 26 && !LK.bar;
    if (lo) { CUR.z = s * LSEG; CUR.k = s * NBAY; CUR.inst = 1; inst(segLo, P.seg[s], OS, [0, 0, LSEG / 2]); }
    for (let b = 0; b < NBAY && !lo; b++) {
      const k = s * NBAY + b, Tb = P.bay[k];
      CUR.z = s * LSEG + b * BAYL; CUR.k = k; CUR.inst = 1;
      const px = lodPx(Tb, [0, 0, 5], 16);
      if (px < .8) continue;
      st.flapAt(k, FL3);
      const open = FL3[0] > .01 || FL3[1] > .01;
      inst(px > 40 ? bayFr : bayLo, Tb, OC_, [0, 0, 5]);
      if ((open || LK.bar || !LK.skinOcc) && px > 5) inst(px > 45 ? bayIn : bayInLo, Tb, OB, [0, 0, 5]);
      for (let f = 0; f < 6; f++) {
        mulTo(L2, Tb, rot(L1, 2, f * PI / 3, 0, 0, 0, 0, 0, 0));
        if (open && px > 4) { mulTo(L4, L2, rot(L1, 2, FL3[2], 0, CAS_Y, 0, 0, FL3[1], 0)); inst(px > 45 ? cas : casLo, L4, OB, [0, CAS_Y, 5]); }
        mulTo(L4, L2, rot(L1, 2, -FL3[0], 0, 0, 0, HR / 2, HA, 0)); inst(px > 60 ? flap : flapLo, L4, OS, [-HR / 2, 0, 5]);
      }
    }
    CUR.z = s * LSEG; CUR.k = s;
    inst(s ? collarM : collarE, P.colS[s], OC_, [0, 0, 1]);
    CUR.z = s * LSEG + LSEG - COL_L;
    inst(collarE, P.colE[s], OC_, [0, 0, 1]);
  }
  for (let j = 1; j < NSEG; j++) {
    CUR.z = j * LSEG; CUR.k = j;
    if (lodPx(P.colS[j], [0, 0, 0], 16) > 3) for (let f = 0; f < 6; f++) inst(jaw, P.jaws[j][f], OC_, [0, HA + 2, 2]);
    CUR.z = j * LSEG - 1.7; if (st.sleeve[j] > .01 || LK.bar) inst(sleeve, P.sleeves[j], OB, [0, 0, 1.7]);
  }
  for (let k = 0; k < NTEL; k++) { CUR.z = (NSEG - 1) * LSEG + TEL_S1[k]; CUR.k = k; inst(tel[k], P.tel[k], OC_, [0, 0, 18]); }
  CUR.z = Z_TELEND; inst(crown, P.crown, OC_, [0, 0, 2]);
  for (let k = 0; k < 6; k++) inst(iris, P.iris[k], OC_, [0, -2, 0]);
  // the ring
  CUR.z = HUB_Z; CUR.inst = 2;
  const far = lodPx(P.W, [0, 0, HUB_Z], 60) < 60;
  for (let i = 0; i < NND; i++) { CUR.k = i; inst(node, P.nodes[i], OC_, [0, 0, 0]); for (let hh = 0; hh < 2; hh++) { const T_ = P.chords[i * 2 + hh]; inst(far || lodPx(T_, [HC / 2, 0, 0], HC / 2) < 70 ? chordLo : chord, T_, OC_, [HC / 2, 0, 0]); } }
  CUR.k = -1; inst(rotor, P.rotor, OC_, [0, 0, HUB_Z]);
  for (let i = 0; i < NND * 2; i++) { CUR.k = i >> 1; L.lineW(P.cables[i * 2], P.cables[i * 2 + 1], .55, 10, 2, OC_); }
  // fins (sparser lattice: big flat panels), engines
  CUR.inst = 3;
  const finFar = lodPx(P.W, [0, 0, FIN_Z0 + FIN_L / 2], 40) < 40;
  for (let f = 0; f < NFIN; f++) for (let j = 0; j < NFP; j++) { CUR.k = f; CUR.j = j; CUR.z = FIN_Z0; const T_ = P.fins[f * NFP + j]; inst(finFar || lodPx(T_, [FPW / 2, 0, FIN_L / 2], 30) < 110 ? finLo : finP, T_, OF, [FPW / 2, 0, FIN_L / 2]); }
  CUR.inst = 4;
  for (let e = 0; e < NENG; e++) { CUR.k = e; CUR.z = ENG_TH; inst(bell, P.bells[e], OC_, [0, 0, -12]); inst(ext, P.exts[e], OC_, [0, 0, -BELL_L - 4]); }
  // the chamber's moving parts and the round
  CUR.inst = 0; CUR.z = 0; CUR.k = -1;
  const ox = LK.x || o;
  if (lodPx(P.W, [0, 0, -8], 10) > 4) {
    L.draw(block, P.block, ox);
    for (let k = 0; k < 3; k++) L.draw(lockR, P.locks[k], ox);
    for (let k = 0; k < 12; k++) L.draw(clampJ, P.clamps[k], ox);
  }
  if (P.roundOn) { L.draw(sabot, P.round, ox); L.draw(rod, P.round, ox); }
  for (let k = 0; k < 4; k++) { CUR.k = k; L.draw(swDisc, P.switches[k], o); }
}

/* ---------------- occluders ---------------- */
const PRP = {}, PRC = {};
for (const n of [6, 12, 16]) { PRP[n] = []; PRC[n] = []; for (let k = 0; k < n + 2; k++) PRP[n].push([0, 0, 0, 0]); for (let k = 0; k < n * 2; k++) PRC[n].push([0, 0, 0]); }
const PL = [0, 0, 0];
/* a prism of n sides (inscribed in radius r, first face normal at angle a0) along local Z from z0 to z1, under Tw */
function occPrism(Tw, n, r, a0, z0, z1, cx, cy) {
  cx = cx || 0; cy = cy || 0;
  const ri = r * Math.cos(PI / n) * .965, M = Tw.R, PR_P = PRP[n], PR_C = PRC[n];
  apTo(PL, Tw, [cx, cy, (z0 + z1) / 2]);
  if (!ORK.wIn(PL[0], PL[1], PL[2], Math.hypot(r, (z1 - z0) / 2))) return;
  for (let k = 0; k < n; k++) {
    const a = a0 + k * TAU / n, lx = Math.cos(a), ly = Math.sin(a), nx = M[0] * lx + M[1] * ly, ny = M[3] * lx + M[4] * ly, nz = M[6] * lx + M[7] * ly;
    const P = PR_P[k]; P[0] = nx; P[1] = ny; P[2] = nz; P[3] = nx * PL[0] + ny * PL[1] + nz * PL[2] + ri;
  }
  const dz = [M[2], M[5], M[8]], d0 = dz[0] * PL[0] + dz[1] * PL[1] + dz[2] * PL[2], hz = (z1 - z0) / 2 - .15;
  let P = PR_P[n]; P[0] = -dz[0]; P[1] = -dz[1]; P[2] = -dz[2]; P[3] = -d0 + hz;
  P = PR_P[n + 1]; P[0] = dz[0]; P[1] = dz[1]; P[2] = dz[2]; P[3] = d0 + hz;
  for (let k = 0; k < n; k++) { const a = a0 + k * TAU / n + PI / n; for (let e = 0; e < 2; e++) apTo(PR_C[k * 2 + e], Tw, [cx + Math.cos(a) * r, cy + Math.sin(a) * r, e ? z1 : z0]); }
  const C_ = ORK.C, dc = Math.hypot(PL[0] - C_.eye[0], PL[1] - C_.eye[1], PL[2] - C_.eye[2]);
  ORK.occS(r * C_.fl / (dc + (z1 - z0) / 2) > 140 ? 2 : 0);
  ORK.occPlanes(PR_P, PR_C);
  ORK.occS(0);
}
function occBoxV(Tw, mn, mx) {
  apTo(PL, Tw, [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]);
  if (!ORK.wIn(PL[0], PL[1], PL[2], Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2)) return;
  ORK.occBox(Tw, mn, mx);
}
/* oo: { skin (the barrel's flaps closed: the segments occlude), hsg, hall, core, coreTo (the core only up to that z) } */
function occlude(P, st, oo) {
  const W = P.W;
  if (oo.coreTo !== undefined) occPrism(W, 16, SHELL_R, 0, REA_Z0, oo.coreTo);           // the reactor up to an X-ray's cut
  else if (oo.core !== false) occPrism(W, 16, CORE_R, 0, REA_Z0, REA_Z1);
  occPrism(W, 16, HUB_R, 0, HUB_Z - HUB_L / 2, HUB_Z + HUB_L / 2);
  if (oo.hsg !== false) occPrism(W, 6, HSG_R, PI / 6, HSG_Z0, HSG_Z1);
  if (oo.hall !== false) occBoxV(W, [-BAY_H[0], -BAY_H[1], BAY_C[2] - BAY_H[2]], [BAY_H[0], BAY_H[1], BAY_C[2] + BAY_H[2]]);
  occBoxV(W, [-SWX, -SWY, SWZ[0]], [SWX, SWY, SWZ[1]]);
  for (const [z0, z1] of TANKS) for (let k = 0; k < 6; k++) { const t = PI / 6 + k * PI / 3; occPrism(W, 12, TANK_R, 0, z0 + 3, z1 - 3, Math.cos(t) * TANK_RC, Math.sin(t) * TANK_RC); }
  if (oo.skin) for (let s = 0; s < NSEG; s++) occPrism(P.seg[s], 6, HR, PI / 6, COL_L, LSEG - COL_L);
  if (oo.skin) for (let k = 0; k < NTEL; k++) occPrism(P.tel[k], 6, TEL_R[k], PI / 6, 0, TEL_L);
  for (let i = 0; i < NND; i++) occBoxV(P.nodes[i], [-4.4, -3.5, -5.9], [4.4, 3.5, 5.9]);
  for (let e = 0; e < NENG; e++) { const t = PI / 4 + e * PI / 2; occPrism(W, 12, 7.2, 0, ENG_TH + 10, ENG_Z0 - 2, Math.cos(t) * ENG_R, Math.sin(t) * ENG_R); }
}
const stats = () => { let n = 0; for (const B of bodies) n += B.L.length / 10 + B.T.length / 10 + B.P.length / 20 + B.Y.length + B.N.length / 7 + B.Rg.length / 14; return { bodies: bodies.length, prims: Math.round(n), lights: LTS.length }; };
/* the frames the fabrication insert works in */
const BAYX = X.make(R.I(), BAY_C.slice()), CHAMBERX = X.make(R.I(), [0, 0, Z_RND]);

return { bodies, root, rods: [rod], rodBody: rod, sabot, capD, pose, draw, occlude, stats, CUR, LTS, PP,
  HR, HA, NSEG, LSEG, BAYL, NBAY, NB, BORE_R, LINER_R, NMAG, MAG_RC, MAG_R, CRING_R, NTEL, TEL_R, TEL_L, TEL_S0, TEL_S1, Z_TELEND, CROWN_L, Z_MZ, COL_R, IRIS_R,
  Z_RND, RND_L, RND_R, ROD_L, ROD_R, HSG_R, HSG_Z0, HSG_Z1, BLK_Z, LOCK_Z, BAY_C, BAY_H, SR, SZ0, SZ1, SWZ, SWX, SWY, HUB_Z, HUB_R, NND, RING_R, CHORD, HC, RST_R, KAPPA_S,
  REA_Z0, REA_Z1, CORE_R, HS_R, CS_R, SHELL_R, NFIN, NFP, FPW, FIN_Z0, FIN_L, NENG, ENG_R, ENG_Z0, ENG_TH, BELL_L, EXT_L, LZ, BEAM_Y, NCP, CP_ROWS, CP_Z0, CP_DZ, TANKS, TANK_RC, TANK_R,
  BAYX, CHAMBERX, xf, mulTo, rot, tr, apTo };
};
