/* ORBITAL RAILGUN platform (window.ORP(ORL) -> the model): a 1.7 km orbital railgun whose barrel is built in space.
   Procedural lattice bodies (pc_orbital_railgun_lat.js); every pose is a pure function of a state object, written
   into preallocated transforms (no allocation per frame). Repeated parts are instanced bodies with a far LOD.

   Frame: metres, +Z along the bore toward the muzzle, +Y the top, +X starboard; origin on the bore at the chamber's
   front face (the round sits centred at Z_RND).
     Hull        z -42 (prow) .. -598 (stern): an arrowhead frustum (its cross-section C0 at the prow, scaled by kz(z)
                 about the bore axis, x3 at the stern): a plateau deck, sloped shoulders, a side trench, ventral
                 slopes, a flat keel; two raised terraces (deck 2 from z -210, deck 3 from z -380) and the command
                 tower (z -478..-540) with its bridge and radomes; greebles, plating seams, marker lights; an open
                 well over the switchyard (z -198..-126); a hab module with an airlock and two suited crew on deck.
     Chamber     z -40..0: the hex housing (r 21) ahead of the prow, the breech block, three lock rings, twelve
                 clamps, four retro pods.
     Bay         the fabrication bay z -116..-44 (56 x 44 x 72 m) inside the prow (its plating fades for the insert).
     Rings       the stabiliser pair A, B (z -300, -370; r 340, 690 m across; 28 nodes each with a momentum wheel) on four bearing
                 pylons each; they counter-rotate, arcs jump between them; scissor tilt about the gimbal axis turns
                 the ship (no thrusters for attitude).
     Construction ring (CR)  r 92: a spinning rim (24 chords, 24 nodes) round a static stator (r 78) with 24
                 emitter heads, six spokes to a collar (r 36..44) that clears the barrel and its laser masts; six
                 alignment receivers (r 52) on the spokes, a bore-line receiver; docked round the housing (z -24)
                 by four arms from the prow; it detaches, flies the bore axis and builds the barrel behind it.
     Barrel      z 0..1003.5 (built): six 150 m segments of fifteen 10 m bays (a 26 m hex frame, the lined bore,
                 nine magnet tubes, a charge ring every 5 m, a pulse cassette and a skin flap on each face of each
                 bay), a collar every 150 m (12 lock jaws, a bore sleeve, a laser mast), three muzzle stages and the
                 crown with its iris. Each part belongs to a build layer (0 liner, 1 magnets, 2 frame, 3 cassettes,
                 4 flaps) and is drawn up to that layer's front (st.front[L], platform z).
     Reactor     z -690..-610 behind the stern: a thermoelectric core (r 28: fuel, twelve control drums, hot shoe,
                 a layer of Seebeck couples, cold shoe, shell); twelve accordion radiator fins; coolant pumps.
     Engines     four vectored main engines on the stern (translation only), gimbal actuators.
     Lasers      a reference emitter on the tower, a mirror on deck 3, the prow mirror and the bore line (y 30)
                 through the collar masts to the crown and the CR; six alignment posts round the prow (r 52).
   Effect channels (ch, q) for the film's callback; q is a z (bore metres, local to an instance: the film adds CUR.z)
   unless stated: 1 charge ring, 2 power bus / rails, 3 status light, 4 magnet tube, 5 reactor heat (q 0 core,
   1 hot shoe, 3 fuel, 4 drum), 6 radiator fin (CUR.j panel), 7 crown / iris, 8 the round, 9 chamber (q 0 coils,
   1 block, 2 lock rings, 3 clamps, 4 tube), 10 stabiliser ring (q 0 structure, 1 conductor rail, 2 rotor,
   3 bearing shoe, 4 pylon; CUR.k ring), 11 couples (q row), 12 engine (q 0 bell, 1 extension, 2 mount), 13 switch
   (q 0 disc, 1 blades, 10 engine terminals, 11 gun terminals), 14 laser hardware (q station), 15 lock jaw (CUR.k
   collar), 16 cryogen tank, 17 hull (q 0 plate, 1 edge, 2 greeble), 18 construction ring (q 0 rim, 1 stator,
   2 collar, 3 receivers, 4 emitters, 5 dock latch), 19 capacitor bank (q can index), 20 tower windows, 21 pump. */
window.ORP = function (L) {
'use strict';
const { V, R, X, E } = M3, PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const { Body } = L;
const XA = [1, 0, 0], YA = [0, 1, 0], ZA = [0, 0, 1], NXA = [-1, 0, 0], NYA = [0, -1, 0], NZA = [0, 0, -1];
const perp = L.perp, C30 = Math.cos(PI / 6);

/* ---------------- dimensions ---------------- */
const HR = 13, HA = HR * C30;                                   // barrel hex: circumradius, apothem
const NSEG = 6, LSEG = 150, BAYL = 10, NBAY = 15, NB = NSEG * NBAY;
const BORE_R = 1.0, LINER_R = 2.2, NMAG = 9, MAG_RC = 6.4, MAG_R = 1.1, CRING_R = 3.7;
const NTEL = 3, TEL_R = [11.6, 10.2, 8.8], TEL_L = 36, TEL_S0 = [111, 111.8, 112.6], TEL_S1 = [147, 180, 213];
const TEL_Z = TEL_S1.map(s => (NSEG - 1) * LSEG + s);
const Z_TELEND = TEL_Z[2] + TEL_L, CROWN_L = 4.5, Z_MZ = Z_TELEND + CROWN_L;
const Z_BARREL = (NSEG - 1) * LSEG + TEL_S1[0];                   // the segments end here (the stages overlap them)
const COL_R = 15, COL_L = 2.2;
const Z_RND = -6, RND_L = 8.4, RND_R = .96, ROD_L = 6, ROD_R = .25;
const HSG_R = 21, HSG_Z0 = -40, HSG_Z1 = 0, CHT_Z0 = -15, CHT_R = 1.95;
const BLK_Z = [-15.8, -13.4], LOCK_Z = [-12.6, -7.4, -2.0], CLAMP_Z = [-8.4, -3.6];
const BAY_C = [0, 0, -80], BAY_H = [28, 22, 36];
const SR = 24, SZ0 = -116, SZ1 = -598, NSB = 34, SBAY = (SZ0 - SZ1) / NSB;
const SWZ = [-190, -134], SWX = 30, SWY = 28, SWS = [[12, -194, 1], [-12, -194, 1], [12, -130, -1], [-12, -130, -1]];      // the rotary switches: x, z, facing
const TANKS = [[-255, -205], [-470, -420]], TANK_RC = SR + 9.6, TANK_R = 6.4;
// the hull
const Z_PROW = -42, Z_STERN = -598, KS = 3.0;
const kz = z => 1 + (KS - 1) * E.clamp((Z_PROW - z) / (Z_PROW - Z_STERN), 0, 1);
const C0 = [[0, 27], [27, 27], [42, 6], [38, 4], [38, -4], [42, -6], [30, -27], [0, -27]];
const D2 = { z0: -210, z1: -232, y0: 27, y1: 37, x0: 20, x1: 16 }, D3 = { z0: -380, z1: -402, y0: 37, y1: 47, x0: 12, x1: 9 };
const WELL = { x: 34, z0: -198, z1: -126, y: 29 };
const TOWER = { z0: -540, z1: -478, x: 14, yb: 47 * kz(-509), h: 40 };
// the stabiliser rings
const NRING = 2, RING_R = 340, RING_Z = [-300, -370], NRN = 28, RCH = 2 * RING_R * Math.sin(PI / NRN), RSEC = [10, 16];
const PYL = [PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4], SHOE_R = RING_R - RSEC[0] / 2 - 3.2;
// the construction ring
const CR_R = 92, NCN = 24, CRCH = 2 * CR_R * Math.sin(PI / NCN), CRSEC = [10, 14], CR_ST = 78, CR_CO = [36, 44], CR_RX = 52, CR_DOCK = -24;
// the reactor and its radiators
const REA_Z0 = -690, REA_Z1 = -610, CORE_R = 28, HS_R = 28.4, CS_R = 30.8, SHELL_R = 31.8, FUEL_R = 21, DRUM_RC = 24.6, DRUM_R = 2.3, NDRUM = 12;
const NFIN = 12, NFP = 6, FPW = 14, FIN_Z0 = -682, FIN_L = 64, FPHI_S = 84 * DEG;
// the engines (stern)
const NENG = 4, ENG_Z = Z_STERN, BELL_L = 38, BELL_R0 = 4.6, BELL_R1 = 15, EXT_L = 19, EXT_R1 = 20;
const ENG_P = [[102, 27.3], [-102, 27.3], [-102, -27.3], [102, -27.3]];
// the lasers
const BEAM_Y = 30;
const LZ = { emit: [0, TOWER.yb + 36, TOWER.z1 + 2], mid: [0, D3.y1 * kz(D3.z1) + 4, D3.z1 - 2], prow: [0, BEAM_Y, Z_PROW - 4] };
LZ.mHub = LZ.mid; LZ.mHsg = LZ.prow; LZ.mDn = LZ.prow;
const ALN_R = CR_RX, ALN = [0, 1, 2, 3, 4, 5].map(k => PI / 6 + k * PI / 3);

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
/* o = rotation by ang about the unit axis (ax, ay, az) through the origin, then translate t */
function rotAx(o, ax, ay, az, ang, tx, ty, tz) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, M = o.R;
  M[0] = t * ax * ax + c; M[1] = t * ax * ay - s * az; M[2] = t * ax * az + s * ay;
  M[3] = t * ax * ay + s * az; M[4] = t * ay * ay + c; M[5] = t * ay * az - s * ax;
  M[6] = t * ax * az - s * ay; M[7] = t * ay * az + s * ax; M[8] = t * az * az + c;
  o.T[0] = tx || 0; o.T[1] = ty || 0; o.T[2] = tz || 0; return o;
}
const tr = (o, x, y, z) => rot(o, 2, 0, 0, 0, 0, x, y, z);
function axes(o, ex, ey, ez, t) { const M = o.R; M[0] = ex[0]; M[1] = ey[0]; M[2] = ez[0]; M[3] = ex[1]; M[4] = ey[1]; M[5] = ez[1]; M[6] = ex[2]; M[7] = ey[2]; M[8] = ez[2]; o.T[0] = t[0]; o.T[1] = t[1]; o.T[2] = t[2]; return o; }
const apTo = (o, x, p) => { const M = x.R, t = x.T; o[0] = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + t[0]; o[1] = M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + t[1]; o[2] = M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + t[2]; return o; };
const apXYZ = (o, x, px, py, pz) => { const M = x.R, t = x.T; o[0] = M[0] * px + M[1] * py + M[2] * pz + t[0]; o[1] = M[3] * px + M[4] * py + M[5] * pz + t[1]; o[2] = M[6] * px + M[7] * py + M[8] * pz + t[2]; return o; };
const L1 = xf(), L2 = xf(), L3 = xf(), L4 = xf(), L5 = xf();

/* ---------------- builders ---------------- */
const bodies = [];
const mk = name => { const B = new Body(name); bodies.push(B); return B; };
const HEX = (r, a0) => { const P = []; for (let k = 0; k < 6; k++) { const t = (a0 || 0) + k * PI / 3; P.push([Math.cos(t) * r, Math.sin(t) * r]); } return P; };
const sq = (B, c, U, W, h, br, ch, q) => { const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => V.add(c, V.add(V.mul(U, i * h), V.mul(W, j * h)))); B.poly(P, true, br, ch, q); };
const RNG = seed => M3.rng(seed);
/* a square lattice truss along unit axis ax from a, side axes u, w, half size h, n bays */
function truss(B, a, ax, u, w, h, len, n, o) {
  o = o || {};
  const rL = o.rL || .3, rB = o.rB || .16, rD = o.rD || .12, kn = o.kn || 1, tag = o.tag || 'tr', hw = o.hw || h;
  const C4 = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const P = (s, i) => V.add(V.mad(a, ax, s), V.add(V.mul(u, C4[i][0] * h), V.mul(w, C4[i][1] * hw)));
  for (let b = 0; b < n; b++) {
    if (o.chunk !== false && b % (o.per || 1) === 0) B.chunk(tag + b);
    const s0 = len * b / n, s1 = len * (b + 1) / n;
    for (let i = 0; i < 4; i++) {
      B.tube(P(s0, i), P(s1, i), rL, .62, o.ch, o.q);
      B.tube(P(s0, i), P(s0, (i + 1) % 4), rB, .5, o.ch, o.q);
      const f = (b + i) % 2; B.tube(P(f ? s0 : s1, i), P(f ? s1 : s0, (i + 1) % 4), rD, .4, o.ch, o.q);
      B.knot(P(s0, i), kn, .85);
    }
    if (b === n - 1) for (let i = 0; i < 4; i++) { B.tube(P(s1, i), P(s1, (i + 1) % 4), rB, .5, o.ch, o.q); B.knot(P(s1, i), kn, .85); }
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
  B.lathe(V.mad(c, n, -dp), n, st, { cell: Math.max(.1, r / 60), br: .9, two: true, rings: false });
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
/* a gear: centre c, axis n, pitch radius r, teeth count, face width w */
function gear(B, c, n, r, teeth, w, ch, q) {
  const [U, W] = perp(n);
  B.lathe(V.mad(c, n, -w / 2), n, [[0, r * .25], [0, r * .92], [w, r * .92], [w, r * .25]], { cell: Math.max(.04, r / 40), br: .95, seams: 6, ch, q });
  for (let k = 0; k < teeth; k++) {
    const t = k / teeth * TAU, d = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t)));
    for (const s of [-.5, .5]) B.line(V.add(V.mad(c, n, s * w), V.mul(d, r * .92)), V.add(V.mad(c, n, s * w), V.mul(d, r * 1.06)), .7, ch, q);
    B.line(V.add(V.mad(c, n, -.5 * w), V.mul(d, r * 1.06)), V.add(V.mad(c, n, .5 * w), V.mul(d, r * 1.06)), .6, ch, q);
  }
}
/* a suited figure on EVA (1.8 m): feet at p, facing f (horizontal), up u; arm (0..1) raises the right arm */
function figure(B, p, f, u, arm) {
  const s = V.norm(V.cross(f, u)), at = (x, y, z) => V.add(p, V.add(V.mul(s, x), V.add(V.mul(u, y), V.mul(f, z))));
  B.tube(at(-.13, 0, 0), at(-.12, .86, 0), .1, .8); B.tube(at(.13, 0, 0), at(.12, .86, 0), .1, .8);       // legs
  B.obox(at(0, 1.18, 0), s, u, f, [.25, .34, .16], .04, { br: .95, edge: .8 });                               // torso
  B.obox(at(0, 1.2, -.3), s, u, f, [.24, .3, .13], .04, { br: .8, edge: .8 });                                 // life-support pack
  B.lathe(at(0, 1.52, 0), u, [[0, .05], [.08, .17], [.2, .19], [.32, .14], [.38, 0]], { cell: .025, br: 1, rings: false });   // helmet
  B.panel(at(-.09, 1.66, .17), V.mul(s, .18), V.mul(u, .14), .02, { n: f, br: .5, edge: .9, ch: 3, q: -1 });                // visor
  B.tube(at(-.3, 1.4, 0), at(-.36, .92, .1), .07, .8);
  const ha = at(.42, 1.4 + .5 * arm, .32 + .2 * arm); B.tube(at(.3, 1.4, 0), ha, .07, .8); B.knot(ha, .14, .9);
}
/* a hull cross-section point (C0 coordinates) at platform z */
const HP = (p, z) => { const k = kz(z); return [p[0] * k, p[1] * k, z]; };
/* a frustum face of the hull between section points a, b (C0) from z0 (prow side) to z1 (stern side) */
function hullFace(B, a, b, z0, z1, opt) {
  const o = HP(a, z1), p1 = HP(b, z1), o2 = HP(a, z0), p2 = HP(b, z0);
  const u0 = V.sub(p1, o), u1 = V.sub(p2, o2), v = V.sub(o2, o);
  let n = V.norm(V.cross(u0, v)); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if (n[0] * mx + n[1] * my < 0) n = V.mul(n, -1);
  B.trap(o, u0, u1, v, opt.cell || [.45, .45], Object.assign({ n, ch: 17, q: 0 }, opt));
  return n;
}
/* a flat face at z (prow or stern) filled in horizontal strips from a half-profile x(y) (C0 units) */
function capFace(B, z, ys, xOf, nz, opt) {
  const k = kz(z);
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1], x0 = xOf(y0 + 1e-6), x1 = xOf(y1 - 1e-6);
    B.trap([-x0 * k, y0 * k, z], [2 * x0 * k, 0, 0], [2 * x1 * k, 0, 0], [(x0 - x1) * k, (y1 - y0) * k, 0], opt.cell || [.45, .45], Object.assign({ n: [0, 0, nz], ch: 17, q: 0, edge: .3 }, opt));
  }
}
/* the hull's half-width (C0 units) at height y of the full profile (deck 1, and the terraces where they stand) */
function halfX(y, d2, d3) {
  const lin = (a, b, y) => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  if (y <= -6) return lin([30, -27], [42, -6], y);
  if (y <= -4) return lin([42, -6], [38, -4], y);
  if (y <= 4) return 38;
  if (y <= 6) return lin([38, 4], [42, 6], y);
  if (y <= 27) return lin([42, 6], [27, 27], y);
  if (d2 && y <= 37) return lin([20, 27], [16, 37], y);
  if (d3 && y <= 47) return lin([12, 37], [9, 47], y);
  return 0;
}

/* the instance being drawn (the film's effect callback reads it) */
const CUR = { z: 0, k: -1, j: 0, inst: 0 };
const LTS = [];
const light = (B, p, q) => { B.knot(p, .6, .9, 3, q === undefined ? p[2] : q); LTS.push(p); };

/* ================= the barrel (built in space, layer by layer) ================= */
const HV = HEX(HR);
/* ---- a bay's frame (layer 2; instanced 90 times): longerons, frames, braces under the skin, latches, conduits, lights ---- */
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
/* ---- the bore (layer 0): the lined bore and its two rails ---- */
const bayCore = mk('bayCore'); bayCore.chunk('core');
bayCore.lathe([0, 0, 0], ZA, [[0, LINER_R], [BAYL, LINER_R]], { cell: .12, br: .86, seams: 16, sbr: .3, rbr: .45 });
for (const s of [1, -1]) bayCore.box([-.22, s > 0 ? BORE_R - .34 : -BORE_R, 0], [.22, s > 0 ? BORE_R : -BORE_R + .34, BAYL], .06, { br: 1, edge: .8, ch: 2, q: 5 });
bayCore.done();
const bayCoreLo = mk('bayCoreLo'); bayCoreLo.chunk('c');
for (let k = 0; k < 4; k++) { const t = k * PI / 2, x = Math.cos(t) * LINER_R, y = Math.sin(t) * LINER_R; bayCoreLo.line([x, y, 0], [x, y, BAYL], .6); }
bayCoreLo.done();
/* ---- the magnet layer (layer 1): nine magnet tubes, spiders, two charge rings, bus bars, lines ---- */
const bayIn = mk('bayIn');
bayIn.chunk('mag');
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
const bayInLo = mk('bayInLo'); bayInLo.chunk('c');
for (let m = 0; m < NMAG; m++) { const t = PI / 2 + m * TAU / NMAG, x = Math.cos(t) * MAG_RC, y = Math.sin(t) * MAG_RC; bayInLo.line([x, y, 0], [x, y, BAYL], .9, 4, 5); }
for (const z of [2.5, 7.5]) bayInLo.ringP([0, 0, z], XA, YA, CRING_R, .9, 1, z);
for (const s of [1, -1]) bayInLo.line([0, s * 4.6, 0], [0, s * 4.6, BAYL], .7, 2, 5);
bayInLo.done();

/* ---- a skin flap (layer 4; instanced 540): canonical over the top face, hinged on the vertex at x = +HR/2 ---- */
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
/* ---- a whole segment far away, built and closed (one draw instead of 15 bays and 90 flaps) ---- */
const segLo = mk('segLo');
for (let k = 0; k < 6; k++) {
  segLo.chunk('f' + k);
  const [x, y] = HV[k], [x2, y2] = HV[(k + 1) % 6];
  segLo.panel([x, y, 0], [x2 - x, y2 - y, 0], [0, 0, LSEG], [.4, 1.25], { n: V.norm([(x + x2) / 2, (y + y2) / 2, 0]), br: .8, edge: false, seams: [0, 8], sbr: .4 });
  segLo.line([x, y, 0], [x, y, LSEG], .7);
  for (let b = 0; b <= NBAY; b++) segLo.line([x, y, b * BAYL], [x2, y2, b * BAYL], .55, 0, 0, b % 5 ? BAYL : 0);
}
segLo.chunk('lt');
for (let b = 0; b < NBAY; b++) segLo.knot([HV[1][0] * 1.08, HV[1][1] * 1.08, b * BAYL + 5], .5, .9, 3, b * BAYL + 5);
segLo.done();
/* ---- a pulse cassette (layer 3; instanced 540): under the top face; slides out and turns up ---- */
const CAS_Y = HA - 2.0, CAS_H = [4.6, 1.1, 4.0];
const cas = mk('cas'); cas.chunk('c');
eqBox(cas, [0, CAS_Y, 5], XA, YA, ZA, CAS_H, { cell: .1, br: .9, rail: false });
for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) cas.line([x, CAS_Y - CAS_H[1] - .02, 1.4], [x, CAS_Y - CAS_H[1] - .02, 8.6], .4, 1, 5, 1.6);
for (const x of [-3.6, 3.6]) cas.lathe([x, CAS_Y - CAS_H[1], 5], NYA, [[0, .35], [.7, .35], [.7, 0]], { cell: .05, br: 1, ch: 2, q: 5 });
cas.done();
const casLo = mk('casLo'); casLo.chunk('c');
casLo.box([-CAS_H[0], CAS_Y - CAS_H[1], 5 - CAS_H[2]], [CAS_H[0], CAS_Y + CAS_H[1], 5 + CAS_H[2]], .5, { br: .75, edge: .8 });
casLo.done();

/* ---- a collar (layer 2; at each segment's ends): a heavy hex ring, lock pins, a laser mast ---- */
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
  if (mast) {
    B.chunk('m');
    const y0 = COL_R * C30;
    B.tube([0, y0, 1.1], [0, BEAM_Y - 1.1, 1.1], .35, .6);
    B.tube([-2.4, y0, 1.1], [0, BEAM_Y - 4, 1.1], .16, .45); B.tube([2.4, y0, 1.1], [0, BEAM_Y - 4, 1.1], .16, .45);
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

/* ---- the muzzle stages (layer 2, built whole) ---- */
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
/* the crown: a flared collar at the muzzle, RCS quads, the iris seat, the last laser sensor */
const crown = mk('crown'); crown.chunk('c');
const CRR = TEL_R[2] * 1.18, IRIS_R = 5.4;
{
  const r = TEL_R[2], H = HEX(CRR);
  for (let i = 0; i < 6; i++) { const [x, y] = H[i], [x2, y2] = H[(i + 1) % 6]; crown.panel([x, y, 0], [x2 - x, y2 - y, 0], [0, 0, CROWN_L], .1, { br: .92, edge: .8, ch: 7, q: 0, n: V.norm([(x + x2) / 2, (y + y2) / 2, 0]) }); crown.knot([x, y, CROWN_L], .9, .9); crown.panel([x, y, CROWN_L], [x2 - x, y2 - y, 0], [-x * .4, -y * .4, 0], .14, { two: true, br: .6, edge: .5, ch: 7, q: 0 }); }
  crown.lathe([0, 0, .2], ZA, [[0, LINER_R], [2.6, LINER_R + .3], [3.6, 3.6], [CROWN_L, IRIS_R]], { cell: .07, br: 1, two: true, ch: 7, q: 0, seams: 24 });
  crown.ringP([0, 0, CROWN_L + .02], XA, YA, IRIS_R, .9, 7, 0); crown.ringP([0, 0, CROWN_L + .02], XA, YA, BORE_R + .1, .7, 7, 0);
  for (let i = 0; i < 4; i++) { const t = PI / 4 + i * PI / 2, n = [Math.cos(t), Math.sin(t), 0]; rcsQuad(crown, [n[0] * r * 1.1, n[1] * r * 1.1, 2.2], n, ZA, 2); }
  crown.tube([0, CRR * C30, 1.2], [0, BEAM_Y - 1.2, 1.2], .35, .6);
  crown.tube([-2.4, CRR * C30, 1.2], [0, BEAM_Y - 5, 1.2], .16, .45); crown.tube([2.4, CRR * C30, 1.2], [0, BEAM_Y - 5, 1.2], .16, .45);
  crown.panel([-1.2, BEAM_Y - 1.2, 1.2], [2.4, 0, 0], [0, 2.4, 0], .07, { n: NZA, two: true, br: .8, edge: .9, ch: 14, q: 2 });
  crown.ringP([0, BEAM_Y, 1.18], XA, YA, .8, .8, 14, 2);
  crown.knot([0, CRR * C30 + .4, CROWN_L * .5], .6, .9, 3, 2);
}
crown.done();
const iris = mk('iris'); iris.chunk('p');
iris.panel([-2.6, 0, 0], [5.2, 0, 0], [0, -IRIS_R, 0], .06, { n: ZA, two: true, br: .95, edge: .85, ch: 7, q: 1 });
iris.done();

/* ================= the root: chamber, bay, spine, switchyard, tanks, thrust frame, lasers ================= */
const root = mk('root');

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
}
function tender(B, c, ax, len) {
  const L_ = len || 16, [U, W] = perp(ax), s = L_ / 16;
  B.lathe(V.mad(c, ax, -L_ / 2), ax, [[0, 0], [0, 1.6 * s], [1.2 * s, 2.8 * s], [11 * s, 2.8 * s], [13 * s, 2.2 * s], [15.5 * s, .9 * s], [16 * s, 0]], { cell: .06 * s, br: .9, seams: 12, sbr: .3 });
  B.lathe(V.mad(c, ax, -L_ / 2 - .4 * s), V.mul(ax, -1), [[0, .7 * s], [1.6 * s, 1.6 * s]], { cell: .05 * s, br: .9, two: true });
  for (const k of [1, -1]) B.panel(V.add(V.mad(c, ax, -L_ * .2), V.mul(U, k * 3 * s)), V.mul(U, k * 7 * s), V.mul(ax, 6 * s), .1 * s, { n: W, two: true, br: .7, edge: .7, seams: [8, 6], sbr: .3 });
  for (const k of [0, 1, 2, 3]) { const t = k * PI / 2 + PI / 4, d = V.add(V.mul(U, Math.cos(t)), V.mul(W, Math.sin(t))); rcsQuad(B, V.add(V.mad(c, ax, L_ * .32), V.mul(d, 2.85 * s)), d, ax, .8 * s); }
  light(B, V.add(V.mad(c, ax, L_ * .1), V.mul(W, 2.9 * s)));
}
root.chunk('tender');
{
  // a 16 m tender docked on the starboard side abreast the bay, on a short adapter from the trench
  const zt = BAY_C[2] + 8, xh = 38 * kz(zt), c = [xh + 12.4, 0, zt];
  root.lathe([xh - .5, c[1], c[2]], XA, [[0, 1.6], [9.8, 1.6], [9.8, 2.2]], { cell: .06, br: .95, seams: 8 });
  tender(root, c, ZA, 16);
}
/* ---- the spine inside the hull: a hex truss with bulkheads every 4 bays, the bus, trays, boxes ---- */
hexTruss(root, SZ1, SZ0, SR, NSB, { tag: 'sp', rL: 1.0, rB: .6, rD: .38, kn: 2.0, heavy: b => b % 4 === 0, per: 2 });
const SV = HEX(SR);
for (let b = 0; b < NSB; b++) {
  const z0 = SZ1 + b * SBAY, zc = z0 + SBAY / 2;
  if (b % 2 === 0) root.chunk('spq' + b);
  for (const s of [1, -1]) root.box([s * 9 - .9, -.9, z0], [s * 9 + .9, .9, z0 + SBAY], .12, { br: .88, edge: .62, ch: 2, q: zc });
  for (const [x, y] of [[4.5, 5], [-4.5, 5], [4.5, -5], [-4.5, -5]]) root.line([x, y, z0], [x, y, z0 + SBAY], .4, 0, 0);
  for (const k of (b % 4 === 0 ? [0, 3] : b % 4 === 2 ? [2, 5] : [])) { const t = PI / 6 + k * PI / 3, c = Math.cos(t), s = Math.sin(t); eqBox(root, [c * (SR * C30 + 1.1), s * (SR * C30 + 1.1), zc], [-s, c, 0], [c, s, 0], ZA, [4.2, 1.1, 5.4]); }
}
root.chunk('transit');
root.lathe([0, 0, SZ1], ZA, [[0, 3.2], [SZ0 - SZ1, 3.2]], { cell: .32, br: .7, seams: 8, rings: false });
/* ---- the cryogen tanks: two clusters of six round the spine (liquid helium for the magnets) ---- */
TANKS.forEach(([z0, z1], ci) => {
  for (let k = 0; k < 6; k++) {
    root.chunk('tank' + ci + k);
    const t = PI / 6 + k * PI / 3, c = Math.cos(t), s = Math.sin(t), x = c * TANK_RC, y = s * TANK_RC, L_ = z1 - z0;
    root.lathe([x, y, z0], ZA, [[0, 0], [0, 2.4], [2.6, 5.4], [5, TANK_R], [L_ - 5, TANK_R], [L_ - 2.6, 5.4], [L_, 2.4], [L_, 0]], { cell: .26, br: .9, seams: 12, sbr: .28, rbr: .4, ch: 16, q: ci * 6 + k, solid: true });
    for (let r = 1; r < 6; r++) root.ringP([x, y, z0 + 5 + (L_ - 10) * r / 6], XA, YA, TANK_R * 1.01, .4, 16, ci * 6 + k, (L_ - 10) / 6);
    for (const z of [z0 + 8, z1 - 8]) root.tube([x - c * TANK_R, y - s * TANK_R, z], [c * SR * C30, s * SR * C30, z], .5, .55);
  }
});
/* ---- the switchyard: a hall round the spine with four rotary switches on its sides, two capacitor banks; seen from
   the open well in the deck above it ---- */
root.chunk('swhall');
const CAPS = [];
{
  const [z0, z1] = SWZ;
  root.box([-SWX, -SWY, z0], [SWX, SWY, z1], .16, { br: .82, edge: .78, skip: ['x-', 'x+'] });
  for (let k = 1; k < 7; k++) root.line([-SWX, SWY + .05, z0 + (z1 - z0) * k / 7], [SWX, SWY + .05, z0 + (z1 - z0) * k / 7], .4, 0, 0, 8);
  for (const s of [1, -1]) {
    ribbed(root, [s * SWX, -SWY, s > 0 ? z0 : z1], [0, 2 * SWY, 0], [0, 0, s * (z1 - z0)], .16, 7, { n: [s, 0, 0], br: .8, edge: .7 });
  }
  for (const s of [1, -1]) for (const z of [z0 + 6, z1 - 6]) light(root, [s * (SWX + .5), SWY + .5, z]);
  // the four rotary switches stand at the well's ends facing the hall, each in a ring of six contacts (engine side,
  // gun side) on a plinth, the bus bars running from them along the roof
  for (const [x, z, f] of SWS) {
    root.box([x - 9, SWY - 6, z - 2.4 * f - 2.2], [x + 9, SWY + .2, z - 2.4 * f + 2.2], .14, { br: .85, edge: .8 });
    root.ringP([x, SWY + 7, z + f * .05], XA, YA, 7.6, .7, 13, 0);
    for (let k = 0; k < 6; k++) { const t = k / 6 * TAU + PI / 6, xx = x + Math.cos(t) * 7.6, yy = SWY + 7 + Math.sin(t) * 7.6; root.box([xx - .8, yy - .8, z - .2], [xx + .8, yy + .8, z + 1.4 * f], .06, { br: .95, edge: .8, ch: 13, q: k < 3 ? 10 : 11 }); }
    root.box([x - .8, SWY + .2, z - .8], [x + .8, SWY + 7, z + .8], .06, { br: .9, edge: .8 });
    root.tube([x, SWY + 1, z], [x * .4, SWY + 6.6, f > 0 ? z0 + 6 : z1 - 6], .45, .7, 2, -162);
  }
  // capacitor banks on the hall's roof: two racks of 4 x 12 cans (ch 19, q the can's fill order)
  root.chunk('caps');
  for (const s of [1, -1]) {
    root.box([s * 4, SWY, z0 + 4], [s * 26, SWY + .8, z1 - 4], .2, { br: .8, edge: .7 });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 12; j++) {
      const x = s * (7 + i * 5.4), z = z0 + 8 + j * 4.2, q = j * 4 + i + (s > 0 ? 0 : 48);
      root.lathe([x, SWY + .8, z], YA, [[0, 0], [0, 1.6], [5.2, 1.6], [5.6, 1.1], [6, 0]], { cell: .08, br: .9, seams: 6, ch: 19, q });
      root.ringP([x, SWY + 6.05, z], XA, ZA, .6, .8, 19, q);
      CAPS.push([x, SWY + 6, z]);
    }
    root.tube([s * 4.5, SWY + 6.4, z0 + 6], [s * 4.5, SWY + 6.4, z1 - 6], .5, .7, 2, -162);
  }
}
/* ---- the thrust frame between the stern and the reactor ---- */
root.chunk('thrustframe');
for (let k = 0; k < 6; k++) { const [x, y] = SV[k]; root.tube([x, y, Z_STERN], [x * 1.05, y * 1.05, REA_Z1], 1.1, .62); root.knot([x * 1.05, y * 1.05, REA_Z1], 2, .85); }
root.ringP([0, 0, REA_Z1], XA, YA, SR * 1.05, .6);
root.chunk('finroots');
for (let f = 0; f < NFIN; f++) { const t = f * TAU / NFIN, c = Math.cos(t), s = Math.sin(t); for (const z of [FIN_Z0 + 2, FIN_Z0 + FIN_L / 2, FIN_Z0 + FIN_L - 2]) root.lathe([c * SHELL_R, s * SHELL_R, z - 1.6], ZA, [[0, 1.1], [3.2, 1.1]], { cell: .07, br: 1 }); }
/* ---- coolant: a manifold round the shell ahead of the fins, a pump at each fin's root ---- */
root.chunk('coolant');
{
  const zm = FIN_Z0 + FIN_L + 3;
  root.lathe([0, 0, zm - 1.4], ZA, [[0, SHELL_R + .2], [0, SHELL_R + 3.2], [2.8, SHELL_R + 3.2], [2.8, SHELL_R + .2]], { cell: .14, br: .9, seams: 24, ch: 21, q: -1 });
  for (let f = 0; f < NFIN; f++) {
    const t = f * TAU / NFIN + PI / NFIN, c = Math.cos(t), s = Math.sin(t), p = [c * (SHELL_R + 4.4), s * (SHELL_R + 4.4), zm];
    root.lathe(V.add(p, [0, 0, -2.2]), ZA, [[0, 0], [0, 2.2], [4.4, 2.2], [4.4, 0]], { cell: .06, br: .95, seams: 8, ch: 21, q: f });
    root.ringP(V.add(p, [0, 0, 2.3]), XA, YA, 1.6, .8, 21, f);
    root.tube([c * (SHELL_R + 3.2), s * (SHELL_R + 3.2), zm], V.add(p, [-c * 2.2, -s * 2.2, 0]), .5, .7);
  }
}
/* ---- the retro pods on the housing (forward-facing, canted out) ---- */
for (let e = 0; e < 4; e++) {
  const t = PI / 4 + e * PI / 2, c = Math.cos(t), s = Math.sin(t), d = V.norm([c * .55, s * .55, 1]);
  root.chunk('retro' + e);
  const b = [c * (HSG_R + 4), s * (HSG_R + 4), -10];
  root.tube([c * HSG_R * .9, s * HSG_R * .9, -10], b, 1.0, .6);
  root.lathe(V.mad(b, d, -6), d, [[0, 0], [0, 3], [6, 3], [6, 1.5], [11, 4.2]], { cell: .09, br: .95, two: true, seams: 12, ch: 12, q: 3 });
}
/* ---- the lasers: the reference emitter (tower), the deck mirror, the prow mirror; six alignment posts round the prow ---- */
root.chunk('lasers');
{
  const E_ = LZ.emit, M_ = LZ.mid, P_ = LZ.prow;
  root.box([-1.6, E_[1] - 1.6, E_[2] - 2.4], [1.6, E_[1] + 1.6, E_[2] + 1.6], .06, { br: 1, edge: .9, ch: 14, q: 0 });
  root.lathe([0, E_[1], E_[2] + 1.6], ZA, [[0, .8], [1.2, .8], [1.2, .45]], { cell: .04, br: 1, ch: 14, q: 0 });
  root.tube([0, M_[1] - 6, M_[2]], [0, M_[1] - 1.5, M_[2]], .6, .6);
  root.box([-1.5, M_[1] - 1.5, M_[2] - 1.5], [1.5, M_[1] + 1.5, M_[2] + 1.5], .06, { br: 1, edge: .9, ch: 14, q: 3 });
  root.panel([-1.3, M_[1] - 1.3, M_[2] - 1.3], [2.6, 0, 0], [0, 2.6, 2.6], .06, { two: true, br: .6, edge: .8, ch: 14, q: 3 });
  root.tube([0, 27.4, P_[2]], [0, P_[1] - 1.4, P_[2]], .6, .6);
  root.box([-1.3, P_[1] - 1.3, P_[2] - 1.3], [1.3, P_[1] + 1.3, P_[2] + 1.3], .06, { br: 1, edge: .9, ch: 14, q: 4 });
  root.panel([-1.1, P_[1] - 1.1, P_[2] + 1.1], [2.2, 0, 0], [0, 2.2, -2.2], .06, { two: true, br: .6, edge: .8, ch: 14, q: 4 });
  for (let k = 0; k < 6; k++) {
    const t = ALN[k], c = Math.cos(t), s = Math.sin(t), r0 = Math.min(HSG_R + 8, 30), p = [c * ALN_R, s * ALN_R, Z_PROW + 2];
    root.tube([c * r0, s * r0, Z_PROW - 1], p, .7, .66); root.tube([c * r0, s * r0, Z_PROW - 8], V.add(p, [0, 0, -2]), .4, .5);
    root.box(V.add(p, [-1.1, -1.1, -.4]), V.add(p, [1.1, 1.1, 2.2]), .05, { br: 1, edge: .9, ch: 14, q: 6 + k });
    root.ringP(V.add(p, [0, 0, 2.25]), XA, YA, .6, .9, 14, 6 + k);
  }
}
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
  for (let b = 0; b < 5; b++) light(hsg, [HSG_R * .5, HSG_R * C30 + .5, HSG_Z0 + 4 + b * 8]);
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

/* ================= the reactor (behind the stern) ================= */
const RL = REA_Z1 - REA_Z0;
/* the cutaway: a quarter taken out facing port and up (its centre at CUT_A): the shell (and the four fins over it) open
   over +-60 deg, the cold shoe over +-52, the core and the hot shoe over +-45 (the film sets the clip planes) */
const CUT_A = 135 * DEG, CUT_W = { shell: 60 * DEG, cold: 52 * DEG, core: 45 * DEG };
/* ---- the core (the heat source, its domes) and the hot shoe, in slabs (for culling and the cutaway's clip) ---- */
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
/* the fuel (only inside the core's window): element columns on a hex pitch, the core vessel's inner wall */
const fuel = mk('fuel');
{
  const z0 = REA_Z0 + 3, z1 = REA_Z1 - 3, pitch = 2.6;
  let n = 0;
  for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
    const x = (i + j * .5) * pitch, y = j * pitch * C30, r = Math.hypot(x, y), a = Math.atan2(y, x);
    let da = a - CUT_A; while (da > PI) da -= TAU; while (da < -PI) da += TAU;
    if (r > FUEL_R || r < 1.5 || Math.abs(da) > CUT_W.core + .05) continue;
    if (n++ % 24 === 0) fuel.chunk('f' + n);
    fuel.line([x, y, z0], [x, y, z1], .9, 5, 3);
    for (let k = 1; k < 8; k++) fuel.ringP([x, y, z0 + (z1 - z0) * k / 8], XA, YA, .55, .7, 5, 3, 4);
  }
  fuel.chunk('grid');
  for (let k = 0; k <= 8; k++) { const z = z0 + (z1 - z0) * k / 8; fuel.ringP([0, 0, z], XA, YA, FUEL_R + .6, .8, 5, 3); }
}
fuel.done();
/* a control drum (instanced in the window): a cylinder with an absorber face on one side; it turns 180 deg */
const drum = mk('drum'); drum.chunk('d');
drum.lathe([0, 0, REA_Z0 + 4], ZA, [[0, 0], [0, DRUM_R], [RL - 8, DRUM_R], [RL - 8, 0]], { cell: .32, br: .9, seams: 12, sbr: .4, ch: 5, q: 4 });
drum.panel([DRUM_R * .2, -DRUM_R * .95, REA_Z0 + 5], [0, DRUM_R * 1.9, 0], [0, 0, RL - 10], [.2, .5], { n: XA, two: true, br: 1.2, edge: .9, ch: 5, q: 5 });
drum.done();
const DRUMS = [];
for (let k = 0; k < NDRUM; k++) { const t = k * TAU / NDRUM, da = Math.abs(Math.atan2(Math.sin(t - CUT_A), Math.cos(t - CUT_A))); if (da < CUT_W.core + .06) DRUMS.push(t); }
/* the cold shoe, the shell (jacket) */
const coldB = mk('cold');
for (let k = 0; k < 8; k++) { coldB.chunk('k' + k); coldB.lathe([0, 0, REA_Z0 + k * RL / 8], ZA, [[0, CS_R], [RL / 8, CS_R]], { cell: .3, br: .6, rings: k === 0, seams: 48, sbr: .2, solid: true }); }
coldB.done();
const jacket = mk('jacket');
for (let k = 0; k < 8; k++) { jacket.chunk('j' + k); jacket.lathe([0, 0, REA_Z0 + k * RL / 8], ZA, [[0, SHELL_R], [RL / 8, SHELL_R]], { cell: .3, br: .82, seams: 48, sbr: .26, rbr: .5, solid: true }); }
jacket.done();
/* ---- the Seebeck couples (only those in the cold shoe's window): rows of p/n legs between the hot shoe and the cold
   shoe, in series ---- */
const NCP = 160, CP_ROWS = 8, CP_Z0 = REA_Z0 + 8, CP_DZ = (RL - 16) / (CP_ROWS - 1);
const couples = mk('couples');
const CP_I0 = Math.floor((CUT_A - CUT_W.cold) / TAU * NCP), CP_I1 = Math.ceil((CUT_A + CUT_W.cold) / TAU * NCP);
for (let row = 0; row < CP_ROWS; row++) {
  couples.chunk('r' + row);
  const z = CP_Z0 + row * CP_DZ;
  for (let i = CP_I0; i < CP_I1; i++) {
    const t0 = i / NCP * TAU, t1 = t0 + TAU / NCP * .42, t2 = (i + 1) / NCP * TAU;
    const P = (t, r) => [Math.cos(t) * r, Math.sin(t) * r, z];
    couples.tube(P(t0, HS_R + .15), P(t0, CS_R - .15), .26, .72, 11, row);
    couples.tube(P(t1, HS_R + .15), P(t1, CS_R - .15), .26, .58, 11, row);
    couples.line(P(t0, HS_R + .1), P(t1, HS_R + .1), .6, 5, 1);
    couples.line(P(t1, CS_R - .1), P(t2, CS_R - .1), .6, 11, row);
  }
}
couples.done();
/* the core's section where an old X-ray cut it (kept for the API) */
const capD = mk('capD'); capD.chunk('d');
capD.lathe([0, 0, 0], ZA, [[0, 0], [0, CORE_R - .1]], { cell: .14, br: 1, two: true, rings: false, ch: 5, q: 2 });
capD.done();
/* the cut faces (each a half-plane through the bore axis, in the local x z plane; posed at the window's edges): the
   core's (fuel in five bands hot to cooler outward, the reflector, the vessel, the hot shoe), the couples' band and the
   cold shoe, the shell's */
function secBody(name, bands, lines) {
  const B = mk(name); B.chunk('s');
  for (const [r0, r1, ch, q, br] of bands) B.panel([r0, 0, REA_Z0 + .6], [r1 - r0, 0, 0], [0, 0, RL - 1.2], [Math.max(.05, (r1 - r0) / 60), .08], { n: YA, two: true, br: br || 1, edge: false, ch, q });
  for (const [r, ch, q, br] of lines) B.line([r, 0, REA_Z0 + .6], [r, 0, REA_Z1 - .6], br, ch, q);
  B.done(); return B;
}
const secCore = secBody('secCore', [[0, 4.2, 5, 10, 1.1], [4.2, 8.4, 5, 11, 1], [8.4, 12.6, 5, 12], [12.6, 16.8, 5, 13], [16.8, FUEL_R, 5, 14], [FUEL_R, 25, 5, 15, .7], [25, CORE_R, 5, 16, .6], [CORE_R, HS_R, 5, 1, 1.2]],
  [[2.6, 5, 3, .9], [5.2, 5, 3, .9], [7.8, 5, 3, .9], [10.4, 5, 3, .9], [13, 5, 3, .9], [15.6, 5, 3, .9], [18.2, 5, 3, .9], [FUEL_R + .3, 0, 0, .9], [CORE_R, 5, 1, 1]]);
const secCp = mk('secCp'); secCp.chunk('s');
for (let row = 0; row < 8; row++) { const z = REA_Z0 + 8 + row * (RL - 16) / 7; for (const [dz, q] of [[-.62, 0], [.12, 1]]) secCp.panel([HS_R + .05, 0, z + dz], [CS_R - HS_R - .1, 0, 0], [0, 0, .5], .08, { n: YA, two: true, br: 1.1, edge: .9, ch: 11, q: row }); }
secCp.panel([CS_R - .05, 0, REA_Z0 + .6], [.4, 0, 0], [0, 0, RL - 1.2], [.1, .3], { n: YA, two: true, br: .9, edge: false });
secCp.line([HS_R + .05, 0, REA_Z0 + .6], [HS_R + .05, 0, REA_Z1 - .6], 1, 5, 1);
secCp.done();
const secSh = secBody('secSh', [[CS_R + .35, SHELL_R, 0, 0, .8]], [[SHELL_R, 0, 0, 1]]);
/* an impeller (a coolant pump's, turning) */
const impeller = mk('impeller'); impeller.chunk('i');
for (let k = 0; k < 5; k++) { const t = k / 5 * TAU; impeller.line([0, 0, 0], [Math.cos(t) * 1.5, Math.sin(t) * 1.5, 0], .9, 21, -2); }
impeller.ringP([0, 0, 0], XA, YA, 1.55, .8, 21, -2);
impeller.done();
const PUMPS = [];
for (let f = 0; f < NFIN; f++) { const t = f * TAU / NFIN + PI / NFIN; PUMPS.push([Math.cos(t) * (SHELL_R + 4.4), Math.sin(t) * (SHELL_R + 4.4), FIN_Z0 + FIN_L + 3 + 2.4]); }

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

/* ================= the engines (stern, translation only): mounts, gimballed bells, sliding extensions ================= */
const engMount = mk('engMount');
for (let e = 0; e < NENG; e++) {
  engMount.chunk('m' + e);
  const [x, y] = ENG_P[e], c = [x, y, ENG_Z - 4];
  eqBox(engMount, c, XA, NZA, YA, [13, 4, 13], { cell: .14, br: .85, rail: false, ch: 12, q: 2 });
  engMount.lathe([x, y, ENG_Z - 8], NZA, [[0, 7.4], [3, 7.4], [3, 5.2]], { cell: .1, br: .95, seams: 16 });
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = [x + dx * 10, y + dy * 10, ENG_Z - 8]; engMount.lathe(b, NZA, [[0, 1.4], [2.4, 1.4]], { cell: .05, br: 1 }); }
  light(engMount, [x + 12, y + 12, ENG_Z - 8.4]);
}
engMount.done();
const bell = mk('bell'); bell.chunk('b');
bell.lathe([0, 0, 0], NZA, [[0, BELL_R0], [3, BELL_R0 * .8], [9, BELL_R0 * 1.5], [22, 11.4], [BELL_L, BELL_R1]], { cell: .16, br: .9, two: true, seams: 40, sbr: .3, rbr: .55, ch: 12, q: 0 });
for (let k = 1; k < 10; k++) { const s = BELL_L * k / 10; bell.ringP([0, 0, -s], XA, YA, BELL_R0 * .8 + (BELL_R1 - BELL_R0 * .8) * Math.pow(k / 10, .8), .4, 12, 0, 4); }
bell.lathe([0, 0, 4], ZA, [[0, 6.2], [2, 6.2]], { cell: .06, br: 1, seams: 12 });
for (let k = 0; k < 4; k++) { const t = k * PI / 2; bell.tube([Math.cos(t) * 6.2, Math.sin(t) * 6.2, 3], [Math.cos(t) * 7.2, Math.sin(t) * 7.2, 3], .8, .8); }
bell.done();
const ext = mk('ext'); ext.chunk('e');
ext.lathe([0, 0, -BELL_L + 1.5], NZA, [[0, BELL_R1 + .15], [EXT_L, EXT_R1]], { cell: .18, br: .85, two: true, seams: 48, sbr: .28, rbr: .55, ch: 12, q: 1 });
ext.done();

/* ================= the hull ================= */
/* the faces of deck 1 (C0 pairs, the plateau handled in segments), mirrored to port */
const SIDE_R = [[[27, 27], [42, 6]], [[42, 6], [38, 4]], [[38, 4], [38, -4]], [[38, -4], [42, -6]], [[42, -6], [30, -27]]];
const SIDE = SIDE_R.concat(SIDE_R.map(([a, b]) => [[-b[0], b[1]], [-a[0], a[1]]]));
const KEEL = [[30, -27], [-30, -27]];
const HOPT = { cell: [.45, .45], edge: false, seams: [18, 44], sbr: .32, br: .78 };
/* the long edges of the silhouette (bright hairlines) and a marker light every ~22 m along them */
function hullEdge(B, p, z0, z1, lit) {
  const n = Math.max(1, Math.round((z0 - z1) / 22));
  B.line(HP(p, z0), HP(p, z1), .95, 17, 1);
  if (lit) for (let i = 0; i < n; i++) { const z = z0 - (z0 - z1) * (i + .5) / n, q = HP(p, z); light(B, [q[0] + Math.sign(p[0]) * .8, q[1] + Math.sign(p[1]) * .8, z]); }
}
/* greebles on a frustum face (C0 edge a-b, z0 prow side .. z1): boxes, stacks, pipes, vents, domes, masts */
function greebles(B, a, b, z0, z1, n, seed, o) {
  o = o || {};
  const r0 = RNG(seed), s0 = o.s0 === undefined ? .05 : o.s0, s1 = o.s1 === undefined ? .95 : o.s1, mix = o.mix || [.5, .66, .78, .88, .94];
  // the draws made first and sorted along the hull, so each chunk is a compact patch (culled, coarse when small)
  const G_ = []; for (let i = 0; i < n; i++) { const q = []; for (let k = 0; k < 10; k++) q.push(r0()); G_.push(q); }
  G_.sort((p, q) => p[0] - q[0]);
  for (let i = 0; i < n; i++) {
    const Q = G_[i]; let qi = 0; const r = () => Q[qi++];
    if (i % 12 === 0) B.chunk((o.tag || 'gr') + seed + '_' + i);
    const t = r(), z = z1 + (z0 - z1) * t, s = s0 + (s1 - s0) * r(), A = HP(a, z), Bp = HP(b, z);
    if (o.skip && o.skip(z, A, Bp, s)) continue;
    const au = V.norm(V.sub(Bp, A)), al = V.norm(V.sub(HP(a, z0), HP(a, z1))), nn = V.norm(V.cross(au, al)), nrm = (nn[0] * (a[0] + b[0]) + nn[1] * (a[1] + b[1])) < 0 ? V.mul(nn, -1) : nn;
    const ks = Math.sqrt(kz(z)) * (o.scale || 1), c0 = V.lerp(A, Bp, s), kind = r(), w = (1.4 + 9 * Math.pow(r(), 2.2)) * ks, l = (2 + 15 * Math.pow(r(), 1.8)) * ks, h = (.5 + 3.6 * Math.pow(r(), 2)) * ks;
    if (kind < mix[0]) B.obox(V.mad(c0, nrm, h / 2), au, nrm, al, [w / 2, h / 2, l / 2], .3, { skip: ['y-'], ch: 17, q: 2, br: .85, edge: .62 });
    else if (kind < mix[1]) { B.obox(V.mad(c0, nrm, h / 2), au, nrm, al, [w / 2, h / 2, l / 2], .3, { skip: ['y-'], ch: 17, q: 2, br: .85, edge: .62 }); B.obox(V.mad(c0, nrm, h * 1.5), au, nrm, al, [w * .3, h / 2, l * .3], .25, { skip: ['y-'], ch: 17, q: 2, br: .9, edge: .7 }); }
    else if (kind < mix[2]) { const rr = (.35 + .7 * r()) * ks, L_ = l * 2.4; B.tube(V.add(V.mad(c0, nrm, rr), V.mul(al, -L_ / 2)), V.add(V.mad(c0, nrm, rr), V.mul(al, L_ / 2)), rr, .7, 17, 2); B.tube(V.add(V.mad(c0, nrm, rr), V.add(V.mul(al, -L_ / 2), V.mul(au, rr * 2.6))), V.add(V.mad(c0, nrm, rr), V.add(V.mul(al, L_ / 2), V.mul(au, rr * 2.6))), rr * .7, .6, 17, 2); }
    else if (kind < mix[3]) { const q = V.mad(c0, nrm, .08); B.poly([V.add(q, V.add(V.mul(au, -w / 2), V.mul(al, -l / 2))), V.add(q, V.add(V.mul(au, w / 2), V.mul(al, -l / 2))), V.add(q, V.add(V.mul(au, w / 2), V.mul(al, l / 2))), V.add(q, V.add(V.mul(au, -w / 2), V.mul(al, l / 2)))], true, .7, 17, 2); for (let k = 1; k < 6; k++) { const f = -l / 2 + l * k / 6; B.line(V.add(q, V.add(V.mul(au, -w * .4), V.mul(al, f))), V.add(q, V.add(V.mul(au, w * .4), V.mul(al, f))), .45, 17, 2, l / 6); } }
    else if (kind < mix[4]) { const rr = (.8 + 2.2 * r()) * ks; B.lathe(c0, nrm, [[0, rr], [rr * .5, rr * .86], [rr * .85, rr * .5], [rr, 0]], { cell: Math.max(.08, rr / 14), br: .95, rings: false, ch: 17, q: 2 }); B.ringP(c0, au, al, rr, .6, 17, 2); }
    else { const hh = (4 + 10 * r()) * ks, top = V.mad(c0, nrm, hh); B.line(c0, top, .7, 17, 2); B.knot(top, .5, .9); B.line(V.mad(c0, nrm, hh * .6), V.add(V.mad(c0, nrm, hh * .6), V.mul(au, hh * .25)), .5, 17, 2); }
  }
}
const hullF = mk('hullF'), hullM = mk('hullM'), hullG = mk('hullG');
/* ---- deck 1: plateau (in segments: full, the well's strips, beside deck 2), shoulders, trench, ventral, keel ---- */
const ZS = [Z_PROW, -120, WELL.z1, WELL.z0, D2.z0, -300, -400, -500, Z_STERN];
for (let i = 0; i < ZS.length - 1; i++) {
  const z0 = ZS[i], z1 = ZS[i + 1], B = z0 > -120 ? hullF : hullM;
  B.chunk('s' + i);
  for (const [a, b] of SIDE) hullFace(B, a, b, z0, z1, HOPT);
  hullFace(B, KEEL[0], KEEL[1], z0, z1, HOPT);
  if (z0 === WELL.z1) {
    // the well: plateau strips beside it, its four walls
    const k0 = kz(z0), k1 = kz(z1), x0 = WELL.x;
    for (const s of [1, -1]) B.trap([s * x0, 27 * k1, z1], [s * (27 * k1 - x0), 0, 0], [s * (27 * k0 - x0), 0, 0], [0, 27 * (k0 - k1), z0 - z1], [.45, .45], Object.assign({}, HOPT, { n: [0, 1, 0] }));
    for (const s of [1, -1]) B.trap([s * x0, WELL.y, z1], [0, 27 * k1 - WELL.y, 0], [0, 27 * k0 - WELL.y, 0], [0, 0, z0 - z1], [.45, .45], { n: [-s, 0, 0], br: .55, edge: .5, ch: 17, q: 0, seams: [0, 16] });
    for (const [z, k, nz] of [[z0, k0, -1], [z1, k1, 1]]) B.panel([-x0, WELL.y, z], [2 * x0, 0, 0], [0, 27 * k - WELL.y, 0], [.45, .45], { n: [0, 0, nz], br: .55, edge: .5, ch: 17, q: 0 });
    for (const s of [1, -1]) for (let j = 0; j < 4; j++) light(B, [s * (x0 - .6), 27 * k0 - .6, z0 - 6 - j * 20]);
  } else if (z0 <= D2.z0) {
    for (const s of [1, -1]) hullFace(B, [s * D2.x0, 27], [s * 27, 27], z0, z1, HOPT);
  } else hullFace(B, [-27, 27], [27, 27], z0, z1, HOPT);
}
/* ---- deck 2 (from D2.z0) and deck 3 (from D3.z0): ramps, walls, plateaus ---- */
function terrace(B, D, xin, zs) {
  const ramp = (s) => { const o = HP([s * D.x0, D.y0], D.z0), p1 = HP([s * D.x1, D.y1], D.z1), p2 = HP([s * D.x0, D.y0], D.z1), u0 = V.sub(p1, p2), v = V.sub(o, p2); let n = V.norm(V.cross(u0, v)); if (n[0] * s < 0) n = V.mul(n, -1); B.trap(p2, u0, [0, 0, 0], v, [.45, .45], { n, ch: 17, q: 0, br: .78, edge: .7 }); };
  { const o = HP([-D.x0, D.y0], D.z0), u0 = [2 * D.x0 * kz(D.z0), 0, 0], v = V.sub(HP([-D.x1, D.y1], D.z1), o), u1 = [2 * D.x1 * kz(D.z1), 0, 0]; let n = V.norm(V.cross(u0, v)); if (n[1] < 0) n = V.mul(n, -1); B.trap(o, u0, u1, v, [.45, .45], { n, ch: 17, q: 0, br: .8, edge: .8, seams: [18, 0] }); }
  ramp(1); ramp(-1);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    B.chunk('t' + D.y1 + '_' + i);
    for (const s of [1, -1]) hullFace(B, s > 0 ? [D.x1, D.y1] : [-D.x0, D.y0], s > 0 ? [D.x0, D.y0] : [-D.x1, D.y1], z0, z1, HOPT);
    if (xin && z0 <= xin.z) { for (const s of [1, -1]) hullFace(B, [s * xin.x, D.y1], [s * D.x1, D.y1], z0, z1, HOPT); }
    else hullFace(B, [-D.x1, D.y1], [D.x1, D.y1], z0, z1, HOPT);
  }
}
hullM.chunk('d2'); terrace(hullM, D2, { z: D3.z0, x: D3.x0 }, [D2.z1, -300, D3.z0, -480, Z_STERN]);
hullM.chunk('d3'); terrace(hullM, D3, null, [D3.z1, -480, Z_STERN]);
/* ---- the silhouette's edges and their marker lights ---- */
hullM.chunk('edges'); hullF.chunk('edges');
for (const [B, z0, z1] of [[hullF, Z_PROW, -120], [hullM, -120, Z_STERN]]) {
  for (const s of [1, -1]) {
    for (const p of [[27, 27], [42, 6], [42, -6], [30, -27]]) hullEdge(B, [s * p[0], p[1]], z0, z1, true);
    for (const p of [[38, 4], [38, -4]]) hullEdge(B, [s * p[0], p[1]], z0, z1, false);
  }
}
for (const s of [1, -1]) { hullEdge(hullM, [s * D2.x1, D2.y1], D2.z1, Z_STERN, true); hullEdge(hullM, [s * D2.x0, D2.y0], D2.z0, Z_STERN, false); hullEdge(hullM, [s * D3.x1, D3.y1], D3.z1, Z_STERN, true); hullEdge(hullM, [s * D3.x0, D3.y0], D3.z0, Z_STERN, false); }
/* ---- the prow and stern faces ---- */
hullF.chunk('prow');
capFace(hullF, Z_PROW, [-27, -20, -13, -6, -4, 4, 6, 13, 20, 27], y => halfX(y, false, false), 1, { br: .7, seams: [18, 0], cell: [.45, .45] });
hullM.chunk('stern');
capFace(hullM, Z_STERN, [-27, -20, -13, -6, -4, 4, 6, 13, 20, 27, 32, 37, 42, 47], y => halfX(y, true, true), -1, { br: .7, seams: [18, 0], cell: [.45, .45] });
/* ---- the command tower on deck 3: a block, the bridge across its top with a band of windows, radomes, masts ---- */
hullM.chunk('tower');
{
  const { z0, z1, x, yb, h } = TOWER, zc = (z0 + z1) / 2, L_ = z1 - z0;
  hullM.obox([0, yb + h / 2, zc], XA, YA, ZA, [x, h / 2, L_ / 2], .3, { skip: ['y-'], br: .85, edge: .9, ch: 17, q: 0 });
  for (let k = 1; k < 6; k++) hullM.line([-x, yb + h * k / 6, z1 + .05], [x, yb + h * k / 6, z1 + .05], .5, 17, 1, h / 6);
  for (let k = 1; k < 8; k++) for (const s of [1, -1]) hullM.line([s * (x + .05), yb, z0 + L_ * k / 8], [s * (x + .05), yb + h, z0 + L_ * k / 8], .45, 17, 1, L_ / 8);
  const by = yb + h, bz0 = z1 - 30, bz1 = z1 - 2, bx = 46;
  hullM.obox([0, by + 6, (bz0 + bz1) / 2], XA, YA, ZA, [bx, 6, (bz1 - bz0) / 2], .3, { br: .9, edge: .95, ch: 17, q: 0 });
  hullM.obox([0, by + 13, (bz0 + bz1) / 2 - 2], XA, YA, ZA, [bx * .6, 2, (bz1 - bz0) / 2 - 3], .3, { skip: ['y-'], br: .9, edge: .9, ch: 17, q: 0 });
  for (let i = 0; i < 46; i++) { const xx = -bx + 2 + i * (2 * bx - 4) / 45; hullM.knot([xx, by + 7, bz1 + .2], .7, .9, 20, i); }
  for (let i = 0; i < 18; i++) for (const s of [1, -1]) hullM.knot([s * (bx + .2), by + 7, bz0 + 2 + i * 1.5], .6, .9, 20, 46 + i);
  for (const s of [1, -1]) { const c = [s * 26, by + 26, (bz0 + bz1) / 2]; hullM.tube([s * 26, by + 15, c[2]], [s * 26, by + 18, c[2]], 1.6, .8); hullM.lathe([c[0], by + 18, c[2]], YA, [[0, 3], [2, 6.4], [5, 8], [8, 7.2], [11, 5], [13, 2.4], [14, 0]], { cell: .14, br: .95, seams: 16, sbr: .35, ch: 17, q: 2 }); light(hullM, [c[0], by + 32.3, c[2]]); }
  for (const [mx, mh] of [[0, 34], [-8, 24], [9, 20]]) { hullM.line([mx, by + 15, bz0 + 8], [mx, by + 15 + mh, bz0 + 8], .8, 17, 2); light(hullM, [mx, by + 15 + mh, bz0 + 8]); for (let k = 1; k < 4; k++) hullM.line([mx - 2, by + 15 + mh * k / 4, bz0 + 8], [mx + 2, by + 15 + mh * k / 4, bz0 + 8], .5, 17, 2); }
  dish(hullM, [x + 4, yb + h * .55, zc], V.norm([1, .4, .3]), 5, 1.8);
}
/* ---- the hab and its airlock on deck 1 ahead of the well, two crew on EVA beside it ---- */
hullF.chunk('hab');
const HAB = { z: -108, x0: 6, x1: 22 };
{
  const yd = 27 * kz(HAB.z), y = yd + 4.4, z = HAB.z;
  hullF.lathe([HAB.x0, y, z], XA, [[0, 0], [0, 3], [1.4, 4.2], [HAB.x1 - HAB.x0 - 1.4, 4.2], [HAB.x1 - HAB.x0, 3.2], [HAB.x1 - HAB.x0, 0]], { cell: .08, br: .9, seams: 12, sbr: .3, ch: 17, q: 0 });
  for (let k = 1; k < 5; k++) hullF.ringP([HAB.x0 + 1.4 + (HAB.x1 - HAB.x0 - 2.8) * k / 5, y, z], YA, ZA, 4.22, .5, 17, 1);
  for (const dx of [3, 13]) for (const s of [1, -1]) hullF.tube([HAB.x0 + dx, yd, z + s * 2.6], [HAB.x0 + dx, y - 3.4, z + s * 2.6], .3, .6);
  // the airlock: a short drum at the far end with a hatch (1 x 2 m), its frame, a light; handrails out to the deck
  const ax = HAB.x1 + 2.4;
  hullF.lathe([HAB.x1, y, z], XA, [[0, 2.2], [2.4, 2.2], [2.4, 0]], { cell: .05, br: .95, seams: 8, ch: 17, q: 0 });
  hullF.panel([ax + .02, y - 1, z - .55], [0, 2, 0], [0, 0, 1.1], .03, { n: XA, br: .55, edge: .95, ch: 17, q: 1 });
  hullF.ringP([ax + .04, y + .5, z], YA, ZA, .18, .9, 3, -1);
  light(hullF, [ax + .1, y + 1.5, z]);
  for (const s of [1, -1]) { hullF.line([ax, y - 1.2, z + s * .9], [ax + 3, yd + 1.1, z + s * .9], .7, 17, 2); hullF.line([ax + 3, yd + 1.1, z + s * .9], [ax + 3, yd, z + s * .9], .6, 17, 2); }
  hullF.panel([ax, yd + .05, z - 1.6], [5, 0, 0], [0, 0, 3.2], .08, { n: YA, br: .6, edge: .8 });
  figure(hullF, [ax + 2.6, yd + .05, z - 4.2], V.norm([-.6, 0, .8]), YA, .7);
  figure(hullF, [ax + 5.6, yd + .05, z + 3.6], V.norm([-.9, 0, -.4]), YA, .1);
  hullF.line([ax + 2.6, yd + 1.1, z - 4.2], [ax + .4, y - 1.4, z - .6], .4, 3, -1);
  // a walkway from the hab to the well's edge, railings
  for (const s of [1, -1]) { hullF.line([HAB.x0 - 1, yd + 1.1, z + s * 1.4], [HAB.x0 - 1, yd + 1.1, WELL.z1 + 2], .5, 17, 1); hullF.line([HAB.x0 - 1 + s * .01, yd + .05, z + s * 1.4], [HAB.x0 - 1, yd + .05, WELL.z1 + 2], .35, 17, 1); }
}
/* ---- the antenna farm on deck 2 ---- */
hullM.chunk('antennas');
{
  const z = -262, y = D2.y1 * kz(z);
  dish(hullM, [-6, y + 12, z], V.norm([-.3, .7, .65]), 9, 3); hullM.tube([-6, y, z], [-6, y + 9, z - 3], 1.4, .7);
  dish(hullM, [8, y + 9, z - 22], V.norm([.4, .8, .45]), 6, 2); hullM.tube([8, y, z - 22], [8, y + 6.8, z - 23.2], 1, .7);
  dish(hullM, [-4, y + 7, z - 40], V.norm([-.2, .9, -.3]), 4.5, 1.6); hullM.tube([-4, y, z - 40], [-4, y + 5.4, z - 39.5], .8, .7);
  hullM.panel([10, y + .2, z - 2], [8, 0, 0], [0, 5, 3], .12, { n: V.norm([0, .5, -.85]), two: true, br: .7, edge: .9, seams: [8, 8], sbr: .4, ch: 17, q: 2 });
  for (const [x, dz, hh] of [[16, -32, 22], [-14, -12, 16], [-12, -52, 26], [14, -58, 14]]) { hullM.line([x, y, z + dz], [x, y + hh, z + dz], .8, 17, 2); light(hullM, [x, y + hh, z + dz]); }
}
hullM.done(); hullF.done();
/* ---- greebles (their own body: thinned with the hull) ---- */
{
  let sd = 11;
  const inWell = (z, A, Bp, s) => z < WELL.z1 + 4 && z > WELL.z0 - 4;
  const nearHab = z => z < HAB.z + 18 && z > HAB.z - 18;
  // deck 1 plateau (ahead of the well, the strips beside deck 2), shoulders, trench, ventral, keel
  greebles(hullG, [-27, 27], [27, 27], Z_PROW - 6, -122, 30, sd++, { skip: (z, A, B, s) => nearHab(z) && s > .55 });
  greebles(hullG, [-27, 27], [27, 27], WELL.z0 - 2, D2.z0, 6, sd++);
  for (const s of [1, -1]) {
    greebles(hullG, [s * D2.x0, 27], [s * 27, 27], D2.z0, Z_STERN + 4, 50, sd++, { scale: .8 });
    greebles(hullG, [s * 27, 27], [s * 42, 6], Z_PROW, Z_STERN + 4, 120, sd++);
    greebles(hullG, [s * 38, 4], [s * 38, -4], Z_PROW, Z_STERN + 4, 110, sd++, { s0: .1, s1: .9, mix: [.55, .75, .95, .97, .99], scale: .6 });
    greebles(hullG, [s * 42, -6], [s * 30, -27], Z_PROW, Z_STERN + 4, 80, sd++);
    greebles(hullG, [s * D2.x1, D2.y1], [s * D2.x0, D2.y0], D2.z1, Z_STERN + 4, 30, sd++, { scale: .7 });
  }
  greebles(hullG, [30, -27], [-30, -27], Z_PROW, Z_STERN + 4, 90, sd++);
  greebles(hullG, [-D2.x1, D2.y1], [D2.x1, D2.y1], D2.z1, D3.z0, 50, sd++, { skip: z => z < -246 && z > -320 });
  for (const s of [1, -1]) greebles(hullG, [s * D3.x0, D2.y1], [s * D2.x1, D2.y1], D3.z0, Z_STERN + 4, 30, sd++, { scale: .8 });
  greebles(hullG, [-D3.x1, D3.y1], [D3.x1, D3.y1], D3.z1, TOWER.z1 + 4, 24, sd++);
  greebles(hullG, [-D3.x1, D3.y1], [D3.x1, D3.y1], TOWER.z0 - 2, Z_STERN + 3, 10, sd++);
}
hullG.done(); hullG.coarse = 40;
/* ---- the bearing pylons of the rings (static): a tapered three-longeron truss from the hull to a slide head ---- */
const pylons = mk('pylons');
const PYH = [];
for (let ri = 0; ri < NRING; ri++) {
  const z = RING_Z[ri];
  for (let p = 0; p < 4; p++) {
    pylons.chunk('p' + ri + p);
    const a = PYL[p], d = [Math.cos(a), Math.sin(a), 0], up = d[1] > 0;
    const root_ = up ? HP([Math.sign(d[0]) * 27, 27], z) : HP([Math.sign(d[0]) * 30, -27], z);
    const head = V.mul(d, SHOE_R - 8); head[2] = z;
    PYH.push(head);
    const ax = V.norm(V.sub(head, root_)), side = V.norm(V.cross(ax, ZA)), Lp = V.dist(root_, head), n = 12;
    const P3 = (f, i) => { const w = (9 - 5 * f), t = i * TAU / 3, c = Math.cos(t), s = Math.sin(t); return V.add(V.mad(root_, ax, Lp * f), V.add(V.mul(side, c * w), [0, 0, s * w * 1.4])); };
    for (let b = 0; b < n; b++) {
      const f0 = b / n, f1 = (b + 1) / n;
      for (let i = 0; i < 3; i++) {
        pylons.tube(P3(f0, i), P3(f1, i), .9, .66, 10, 4); pylons.tube(P3(f0, i), P3(f0, (i + 1) % 3), .5, .5, 10, 4);
        pylons.tube(P3(f0, i), P3(f1, (i + 1) % 3), .35, .42, 10, 4); pylons.knot(P3(f0, i), 1.6, .85);
      }
    }
    // the head: a block with an axial slide the shoe rides on
    pylons.obox(V.mad(head, ax, -3), side, ax, ZA, [6, 4, 10], .2, { br: .9, edge: .85, ch: 10, q: 4 });
    for (const s of [1, -1]) pylons.box(V.add(head, [s * .6 * side[0] - .5, s * .6 * side[1] - .5, -16]), V.add(head, [s * .6 * side[0] + .5, s * .6 * side[1] + .5, 16]), .1, { br: 1, edge: .9, ch: 10, q: 4 });
    pylons.lathe(V.mad(root_, ax, -1), ax, [[0, 12], [4, 10], [4, 7]], { cell: .2, br: .9, seams: 16 });
    light(pylons, V.add(V.mad(head, ax, 1.5), [0, 0, 10.5]));
  }
}
pylons.done();
/* ---- the docking arms on the prow (they hold the construction ring while it is docked; they swing back) ---- */
const dockArm = mk('dockArm'); dockArm.chunk('a');
{
  // canonical: hinge at the origin, the arm along +Z to the latch (16 m), its plane the local XZ (it swings about Y)
  truss(dockArm, [0, 0, 0], ZA, XA, YA, 1.6, 12.6, 5, { rL: .4, rB: .22, rD: .16, kn: .9, chunk: false, ch: 18, q: 5 });
  dockArm.lathe([0, -2.4, 0], YA, [[0, 2], [4.8, 2]], { cell: .06, br: 1, seams: 8 });
  dockArm.obox([0, 0, 13.8], XA, YA, ZA, [2.4, 2.4, 1.2], .06, { br: 1, edge: .9, ch: 18, q: 5 });
  for (const s of [1, -1]) dockArm.box([s * 2.4 - .4, -1.6, 14.8], [s * 2.4 + .4, 1.6, 16], .05, { br: 1, edge: .9, ch: 18, q: 5 });
}
dockArm.done();
const ARM_A = [PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4], ARM_R0 = 35, ARM_R1 = 40, ARM_Z0 = Z_PROW - 2, ARM_LEN = 16;

/* ================= the stabiliser rings ================= */
/* a chord (local: x radial out, y along the ring, z axial; centred on the chord's middle) */
function ringChordBody(name, len, sec, lo, ch) {
  const B = mk(name); B.chunk('c');
  const hx = sec[0] / 2, hz = sec[1] / 2, hl = len / 2 - (lo ? 0 : 5.6), nb = lo ? 2 : Math.max(4, Math.round(2 * hl / 6.5));
  const P = (y, i) => [i & 1 ? hx : -hx, y, i & 2 ? hz : -hz];
  const lng = (a, b) => lo ? B.line(a, b, .7, ch, 0) : B.tube(a, b, .7, .64, ch, 0);
  for (const i of [0, 1, 2, 3]) lng(P(-hl, i), P(hl, i));
  for (let b = 0; b <= nb; b++) {
    const y = -hl + 2 * hl * b / nb;
    for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0]]) lo ? B.line(P(y, i), P(y, j), .5, ch, 0) : B.tube(P(y, i), P(y, j), .45, .55, ch, 0);
    if (lo || b === nb) continue;
    const y1 = -hl + 2 * hl * (b + 1) / nb, f = b % 2;
    for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3]]) B.tube(P(f ? y : y1, i), P(f ? y1 : y, j), .26, .4, ch, 0);
    for (const i of [0, 1, 2, 3]) B.knot(P(y, i), 1.1, .85);
  }
  if (!lo) {
    B.panel([hx + .1, -hl, -hz], [0, 2 * hl, 0], [0, 0, 2 * hz], [.5, .5], { n: XA, br: .7, edge: false, seams: [13, 8], sbr: .32, ch, q: 0 });
    for (const z of [-hz * .5, hz * .5]) B.box([-hx - .5, -hl, z - .5], [-hx + .2, hl, z + .5], .1, { br: 1, edge: .8, ch, q: 1 });
    for (let b = 0; b < nb; b++) for (const s of [1, -1]) B.knot([0, -hl + 2 * hl * (b + .5) / nb, s * (hz + .3)], .9, .95, ch, 1);
    B.knot([hx + .5, 0, 0], .7, .9, 3, 0);
  } else B.line([-hx, -hl, 0], [-hx, hl, 0], .9, ch, 1);
  B.done(); return B;
}
const rChord = ringChordBody('rChord', RCH, RSEC, false, 10), rChordLo = ringChordBody('rChordLo', RCH, RSEC, true, 10);
/* a node: a housing open fore and aft round its momentum wheel (local as the chord, centred on the node) */
const rNode = mk('rNode'); rNode.chunk('n');
{
  const hx = 7, hy = 6, hz = 10;
  rNode.obox([0, 0, 0], XA, YA, ZA, [hx, hy, hz], .2, { br: .88, edge: .9, skip: ['z-', 'z+'], ch: 10, q: 0 });
  for (const s of [1, -1]) { rNode.ringP([0, 0, s * hz], XA, YA, 5.6, .8, 10, 0); for (let k = 0; k < 4; k++) { const t = PI / 4 + k * PI / 2; rNode.line([Math.cos(t) * 5.6, Math.sin(t) * 5.6, s * hz], [Math.sign(Math.cos(t)) * hx, Math.sign(Math.sin(t)) * hy, s * hz], .6, 10, 0); } }
  rNode.lathe([0, 0, -hz], ZA, [[0, 1.2], [2 * hz, 1.2]], { cell: .08, br: .9, seams: 8, ch: 10, q: 0 });
  for (const s of [1, -1]) light(rNode, [hx + .3, s * (hy - 1), 0], -2);
  for (const s of [1, -1]) rNode.lathe([-hx, 0, s * (hz - 3)], NXA, [[0, 1.4], [1.6, 1.4], [1.6, .6]], { cell: .06, br: 1, ch: 10, q: 1 });
}
rNode.done();
const rRotor = mk('rRotor'); rRotor.chunk('r');
rRotor.lathe([0, 0, -.7], ZA, [[0, 1.4], [0, 5.1], [1.4, 5.1], [1.4, 1.4]], { cell: .12, br: .95, seams: 6, sbr: .7, ch: 10, q: 2, rings: true });
for (let k = 0; k < 6; k++) { const t = k / 6 * TAU; for (const s of [1, -1]) rRotor.line([Math.cos(t) * 1.4, Math.sin(t) * 1.4, s * .72], [Math.cos(t) * 5.1, Math.sin(t) * 5.1, s * .72], .9, 10, 2); }
rRotor.done();
/* the bearing shoe on each pylon head, hugging the ring's inner face (local as the chord, at its centre) */
const rShoe = mk('rShoe'); rShoe.chunk('s');
rShoe.obox([-1.4, 0, 0], XA, YA, ZA, [1.6, 9, 7], .12, { br: .9, edge: .9, ch: 10, q: 3 });
for (let k = 0; k < 5; k++) rShoe.panel([.25, -8 + k * 3.4, -5.6], [0, 2.6, 0], [0, 0, 11.2], .12, { n: XA, br: 1.1, edge: .9, ch: 10, q: 3 });
rShoe.done();

/* ================= the maintenance crawlers (8 m, on the hull's rails) ================= */
const NCRAWL = 6;
const crawler = mk('crawler'); crawler.chunk('c');
{
  crawler.obox([0, 1.3, 0], XA, YA, ZA, [1.6, 1.1, 4], .1, { br: .95, edge: .9, ch: 17, q: 0 });
  crawler.obox([0, 2.7, -1.2], XA, YA, ZA, [1.1, .4, 1.6], .08, { br: .95, edge: .9 });
  for (const s of [1, -1]) for (const z of [-3, 0, 3]) crawler.lathe([s * 1.7, .45, z], [s, 0, 0], [[0, .45], [.4, .45]], { cell: .05, br: 1 });
  crawler.tube([0, 3.1, 1.6], [.8, 5.2, 3.4], .18, .8); crawler.tube([.8, 5.2, 3.4], [.4, 4.2, 5.4], .14, .8); crawler.knot([.4, 4.2, 5.4], .3, .95);
  light(crawler, [0, 3.2, -2.6], -5); light(crawler, [1.2, 2.5, 4.1], -5);
  for (const z of [-4.05, 4.05]) crawler.panel([-1.4, .5, z], [2.8, 0, 0], [0, 1.6, 0], .1, { n: [0, 0, Math.sign(z)], br: .6, edge: .8 });
}
crawler.done();

/* ================= the construction ring ================= */
const crChord = ringChordBody('crChord', CRCH, CRSEC, false, 18), crChordLo = ringChordBody('crChordLo', CRCH, CRSEC, true, 18);
const crNode = mk('crNode'); crNode.chunk('n');
{
  crNode.obox([0, 0, 0], XA, YA, ZA, [5, 3.4, 8.4], .14, { br: .9, edge: .9, ch: 18, q: 0 });
  crNode.lathe([5, 0, 0], XA, [[0, 3], [2.2, 2.6], [3.2, 1.4], [3.6, 0]], { cell: .1, br: .95, rings: false, ch: 18, q: 0 });
  crNode.lathe([-5, 0, -2], NXA, [[0, 1.6], [1.4, 1.2], [2.2, .6]], { cell: .06, br: 1, two: true, ch: 18, q: 4 });
  crNode.lathe([-5, 0, 2], NXA, [[0, 1.6], [1.4, 1.2], [2.2, .6]], { cell: .06, br: 1, two: true, ch: 18, q: 4 });
  for (const s of [1, -1]) light(crNode, [5.3, 0, s * 6], -3);
}
crNode.done();
/* the static core: stator ring (r 78) with 24 emitter heads, six spokes, the collar (r 36..44), six alignment receivers, the
   bore-line receiver; in the CR frame (origin on the bore axis, +Z forward) */
const crCore = mk('crCore');
{
  crCore.chunk('stator');
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    for (const [r, z] of [[CR_ST - 1.6, -3], [CR_ST - 1.6, 3], [CR_ST + 1.6, -3], [CR_ST + 1.6, 3]]) crCore.tube([c0 * r, s0 * r, z], [c1 * r, s1 * r, z], .5, .62, 18, 1);
    for (const [ra, za, rb, zb] of [[CR_ST - 1.6, -3, CR_ST - 1.6, 3], [CR_ST + 1.6, -3, CR_ST + 1.6, 3], [CR_ST - 1.6, -3, CR_ST + 1.6, -3], [CR_ST - 1.6, 3, CR_ST + 1.6, 3]]) crCore.tube([c0 * ra, s0 * ra, za], [c0 * rb, s0 * rb, zb], .3, .5, 18, 1);
    crCore.panel([c0 * (CR_ST + 1.7), s0 * (CR_ST + 1.7), -3], [(c1 - c0) * (CR_ST + 1.7), (s1 - s0) * (CR_ST + 1.7), 0], [0, 0, 6], .3, { n: [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0], br: .65, edge: false, ch: 18, q: 1 });
    if (i % 2 === 0) { const d = V.norm([-c0 * .55, -s0 * .55, -1]); crCore.lathe([c0 * (CR_ST - 1), s0 * (CR_ST - 1), -3.2], d, [[0, 1.5], [2.4, 1.1], [3.8, .5]], { cell: .06, br: 1, two: true, ch: 18, q: 4 }); }
    if (i % 4 === 1) light(crCore, [c0 * (CR_ST + 1.8), s0 * (CR_ST + 1.8), 0], -4);
  }
  crCore.chunk('collar');
  crCore.lathe([0, 0, -4], ZA, [[0, CR_CO[1]], [8, CR_CO[1]], [8, CR_CO[0]], [0, CR_CO[0]], [0, CR_CO[1]]], { cell: .4, br: .85, seams: 36, sbr: .3, ch: 18, q: 2 });
  for (let k = 0; k < 12; k++) { const t = k / 12 * TAU + PI / 12, c = Math.cos(t), s = Math.sin(t), d = V.norm([-c * .4, -s * .4, -1]); crCore.lathe([c * 40, s * 40, -4.2], d, [[0, 1.6], [2.2, 1.2], [3.6, .5]], { cell: .06, br: 1, two: true, ch: 18, q: 4 }); }
  for (let k = 0; k < 6; k++) { const t = k / 6 * TAU, c = Math.cos(t), s = Math.sin(t); crCore.obox([c * (CR_CO[0] - .6), s * (CR_CO[0] - .6), 0], [c, s, 0], [-s, c, 0], ZA, [.6, 3, 3], .08, { br: 1.1, edge: .9, ch: 18, q: 2 }); }
  for (const z of [-4, 4]) crCore.ringP([0, 0, z], XA, YA, CR_CO[1] + .05, .9, 18, 2);
  crCore.chunk('spokes');
  for (let k = 0; k < 6; k++) {
    const t = ALN[k], c = Math.cos(t), s = Math.sin(t), tg = [-s, c, 0], a = [c * CR_CO[1], s * CR_CO[1], 0], b = [c * (CR_ST - 1.6), s * (CR_ST - 1.6), 0];
    truss(crCore, a, [c, s, 0], tg, ZA, 1.4, CR_ST - 1.6 - CR_CO[1], 6, { rL: .4, rB: .24, rD: .16, kn: .8, chunk: false, ch: 18, q: 1, hw: 2.2 });
    const rx = [c * ALN_R, s * ALN_R, -2.6];
    crCore.obox(rx, [c, s, 0], tg, ZA, [1.4, 1.4, 1], .06, { br: 1, edge: .9, ch: 18, q: 3 });
    crCore.ringP(V.add(rx, [0, 0, -1.05]), [c, s, 0], tg, .9, .9, 18, 3); crCore.ringP(V.add(rx, [0, 0, -1.05]), [c, s, 0], tg, .45, .8, 18, 3);
  }
  // the bore-line receiver, hung from the collar's top
  crCore.tube([0, CR_CO[0], -4], [0, BEAM_Y + 1.5, -4], .4, .6, 18, 1);
  crCore.panel([-1.2, BEAM_Y - 1.2, -4.4], [2.4, 0, 0], [0, 2.4, 0], .06, { n: NZA, two: true, br: .8, edge: .9, ch: 18, q: 3 });
  crCore.ringP([0, BEAM_Y, -4.45], XA, YA, .8, .9, 18, 3);
}
crCore.done();

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
const mkRing = n => { const o = { F: xf(), C: xf(), psi: 0, tilt: 0, nodes: [], chords: [], rotors: [], shoes: [], shoeP: [], head: [] }; for (let i = 0; i < n; i++) { o.nodes.push(xf()); o.chords.push(xf()); o.rotors.push(xf()); } for (let p = 0; p < 4; p++) { o.shoes.push(xf()); o.shoeP.push([0, 0, 0]); o.head.push([0, 0, 0]); } return o; };
const PP = { W: null, seg: [], bay: [], colS: [], colE: [], jaws: [], sleeves: [], tel: [], crown: xf(), iris: [], muzzle: [0, 0, 0],
  fins: [], bells: [], exts: [], act: [], block: xf(), locks: [], clamps: [], round: xf(), roundOn: false, switches: [], laser: [],
  align: { e: [], r: [] }, rings: [mkRing(NRN), mkRing(NRN)], ring: { r: RING_R, k: 0, hk: 0, psi: 0 }, nodes: null,
  cr: { F: xf(), rim: xf(), nodes: [], chords: [], z: CR_DOCK }, arms: [], drums: [], pumps: [] };
PP.nodes = PP.rings[0].nodes;
for (let s = 0; s < NSEG; s++) { PP.seg.push(xf()); PP.colS.push(xf()); PP.colE.push(xf()); }
for (let k = 0; k < NB; k++) PP.bay.push(xf());
for (let j = 0; j < NSEG; j++) { PP.sleeves.push(xf()); const J = []; for (let f = 0; f < 6; f++) J.push(xf()); PP.jaws.push(J); }
for (let k = 0; k < NTEL; k++) PP.tel.push(xf());
for (let k = 0; k < 6; k++) PP.iris.push(xf());
for (let k = 0; k < NFIN * NFP; k++) PP.fins.push(xf());
for (let e = 0; e < NENG; e++) { PP.bells.push(xf()); PP.exts.push(xf()); PP.act.push([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]); }
for (let k = 0; k < 3; k++) PP.locks.push(xf());
for (let k = 0; k < 12; k++) PP.clamps.push(xf());
for (let k = 0; k < 4; k++) PP.switches.push(xf());
for (let k = 0; k < 16; k++) PP.laser.push([0, 0, 0]);
for (let k = 0; k < 6; k++) { PP.align.e.push([0, 0, 0]); PP.align.r.push([0, 0, 0]); }
for (let i = 0; i < NCN; i++) { PP.cr.nodes.push(xf()); PP.cr.chords.push(xf()); }
for (let k = 0; k < 4; k++) PP.arms.push(xf());
for (let k = 0; k < DRUMS.length; k++) PP.drums.push(xf());
for (let k = 0; k < PUMPS.length; k++) PP.pumps.push(xf());
PP.secs = [xf(), xf(), xf(), xf(), xf(), xf()];
PP.crawl = []; for (let k = 0; k < NCRAWL; k++) PP.crawl.push(xf());

/* the rings' gimbal axis (platform XY, unit): the film sets it from the slew's axis */
const GAX = [1, 0, 0];
function setGimbal(x, y) { const l = Math.hypot(x, y) || 1; GAX[0] = x / l; GAX[1] = y / l; GAX[2] = 0; }

/* st: { front [5] (each build layer's front, platform z: drawn below it), fresh (the glow length behind the fronts, m),
   jaw [6], sleeve [6] (the collars' locks, 0..1), flapAt(gb, out[5]) (flap angle, cassette slide m, cassette turn,
   flap lime, cassette lime), fin, rings [{ psi, tilt, rotor }] x2, blur [2] (0..1 the rings' smear), cr { z, psi, rotor,
   blur, arms (0 holding .. 1 swung back) }, drum (0..1 the control drums turned), pump (rad), engExt, gimbal [8],
   sw (0 engines .. 1 gun), breech (1 closed), lock, clamp, iris, roundZ (null: no round), flex(z, out) } */
const FLX = [0, 0, 0];
const addFlex = (o, st, z, a) => { st.flex(z, FLX); const t = o.T, M = o.R; t[0] += (M[0] * FLX[0] + M[1] * FLX[1]) * a; t[1] += (M[3] * FLX[0] + M[4] * FLX[1]) * a; t[2] += (M[6] * FLX[0] + M[7] * FLX[1]) * a; };
function poseRing(R, W, zR, st, ri) {
  const S = st.rings[ri], tilt = S.tilt, psi = S.psi;
  R.psi = psi; R.tilt = tilt;
  mulTo(L2, W, rotAx(L1, GAX[0], GAX[1], 0, tilt, 0, 0, zR));            // the tilted ring plane (not spinning)
  for (let i = 0; i < 9; i++) R.C.R[i] = L2.R[i]; R.C.T[0] = L2.T[0]; R.C.T[1] = L2.T[1]; R.C.T[2] = L2.T[2];
  mulTo(R.F, L2, rot(L1, 2, psi, 0, 0, 0, 0, 0, 0));
  const da = TAU / NRN, ca = Math.cos(PI / NRN) * RING_R;
  for (let i = 0; i < NRN; i++) {
    mulTo(R.nodes[i], R.F, rot(L1, 2, i * da, 0, 0, 0, Math.cos(i * da) * RING_R, Math.sin(i * da) * RING_R, 0));
    const am = (i + .5) * da; mulTo(R.chords[i], R.F, rot(L1, 2, am, 0, 0, 0, Math.cos(am) * ca, Math.sin(am) * ca, 0));
    mulTo(R.rotors[i], R.nodes[i], rot(L1, 2, S.rotor + i * .7, 0, 0, 0, 0, 0, 0));
  }
  for (let p = 0; p < 4; p++) {
    const a = PYL[p];
    mulTo(R.shoes[p], L2, rot(L1, 2, a, 0, 0, 0, Math.cos(a) * SHOE_R, Math.sin(a) * SHOE_R, 0));
    apTo(R.shoeP[p], R.shoes[p], [-3, 0, 0]); apTo(R.head[p], W, PYH[ri * 4 + p]);
  }
}
function pose(W, st) {
  const P = PP; P.W = W;
  // the barrel: straight, built in place
  for (let s = 0; s < NSEG; s++) {
    mulTo(P.seg[s], W, tr(L1, 0, 0, s * LSEG));
    for (let b = 0; b < NBAY; b++) { const k = s * NBAY + b; mulTo(P.bay[k], P.seg[s], tr(L1, 0, 0, b * BAYL)); if (st.flex) addFlex(P.bay[k], st, s * LSEG + b * BAYL + 5, 1); }
    mulTo(P.colS[s], P.seg[s], tr(L1, 0, 0, 0)); mulTo(P.colE[s], P.seg[s], tr(L1, 0, 0, LSEG - COL_L));
    if (st.flex) { addFlex(P.colS[s], st, s * LSEG, 1); addFlex(P.colE[s], st, s * LSEG + LSEG, 1); }
  }
  for (let j = 1; j < NSEG; j++) {
    for (let f = 0; f < 6; f++) mulTo(P.jaws[j][f], P.colS[j], rot(L1, 2, f * PI / 3, 0, 0, 0, 0, 0, -3.4 * st.jaw[j]));
    mulTo(P.sleeves[j], P.colE[j - 1], rot(L1, 2, st.sleeve[j] * 3 * TAU, 0, 0, 0, 0, 0, COL_L - 3.4 + 1.7 * st.sleeve[j]));
  }
  for (let k = 0; k < NTEL; k++) { mulTo(P.tel[k], W, tr(L1, 0, 0, TEL_Z[k])); if (st.flex) addFlex(P.tel[k], st, Z_MZ - 40 + 15 * k, 1); }
  mulTo(P.crown, P.tel[2], tr(L1, 0, 0, TEL_L));
  for (let k = 0; k < 6; k++) { mulTo(L2, P.crown, rot(L1, 2, k * PI / 3 + PI / 6, 0, 0, 0, 0, 0, CROWN_L + .05)); mulTo(P.iris[k], L2, rot(L1, 0, -st.iris * 1.75, 0, IRIS_R, 0, 0, 0, 0)); }
  apTo(P.muzzle, P.crown, [0, 0, CROWN_L]);
  // the stabiliser rings
  for (let ri = 0; ri < NRING; ri++) poseRing(P.rings[ri], W, RING_Z[ri], st, ri);
  P.ring.psi = st.rings[0].psi;
  // the construction ring: a static core, the spinning rim
  const C = st.cr; P.cr.z = C.z;
  mulTo(P.cr.F, W, tr(L1, 0, 0, C.z)); mulTo(P.cr.rim, P.cr.F, rot(L1, 2, C.psi, 0, 0, 0, 0, 0, 0));
  { const da = TAU / NCN, ca = Math.cos(PI / NCN) * CR_R;
    for (let i = 0; i < NCN; i++) { mulTo(P.cr.nodes[i], P.cr.rim, rot(L1, 2, i * da, 0, 0, 0, Math.cos(i * da) * CR_R, Math.sin(i * da) * CR_R, 0)); const am = (i + .5) * da; mulTo(P.cr.chords[i], P.cr.rim, rot(L1, 2, am, 0, 0, 0, Math.cos(am) * ca, Math.sin(am) * ca, 0)); } }
  // the docking arms: hinge on the prow, swung back by C.arms
  for (let k = 0; k < 4; k++) {
    const a = ARM_A[k], c = Math.cos(a), s = Math.sin(a), d = V.norm([c * (ARM_R1 - ARM_R0), s * (ARM_R1 - ARM_R0), (CR_DOCK - 4) - ARM_Z0]);
    const ex = V.norm(V.sub([c, s, 0], V.mul(d, c * d[0] + s * d[1]))), ey = V.cross(d, ex);
    axes(L2, ex, ey, d, [c * ARM_R0, s * ARM_R0, ARM_Z0]);
    mulTo(L3, L2, rot(L1, 1, C.arms * 1.9, 0, 0, 0, 0, 0, 0)); mulTo(P.arms[k], W, L3);
  }
  // the fins: accordion chains
  const phi = FPHI_S * (1 - st.fin);
  for (let f = 0; f < NFIN; f++) {
    const t = f * TAU / NFIN;
    mulTo(L3, W, rot(L1, 2, t, 0, 0, 0, Math.cos(t) * SHELL_R, Math.sin(t) * SHELL_R, FIN_Z0));
    let px = 0, py = 0;
    for (let j = 0; j < NFP; j++) { const th = (j % 2 ? -1 : 1) * phi; mulTo(P.fins[f * NFP + j], L3, rot(L1, 2, th, 0, 0, 0, px, py, 0)); px += Math.cos(th) * FPW; py += Math.sin(th) * FPW; }
  }
  for (let k = 0; k < DRUMS.length; k++) { const t = DRUMS[k]; mulTo(P.drums[k], W, rot(L1, 2, t + PI + st.drum * PI, 0, 0, 0, Math.cos(t) * DRUM_RC, Math.sin(t) * DRUM_RC, 0)); }
  for (let k = 0; k < PUMPS.length; k++) mulTo(P.pumps[k], W, rot(L1, 2, st.pump + k, 0, 0, 0, PUMPS[k][0], PUMPS[k][1], PUMPS[k][2]));
  if (st.cut) { const H = [st.cut.hk, st.cut.hc, st.cut.hs]; for (let i = 0; i < 6; i++) mulTo(P.secs[i], W, rot(L1, 2, CUT_A + (i & 1 ? 1 : -1) * H[i >> 1], 0, 0, 0, 0, 0, 0)); }
  // engines: gimbal (pitch about X, yaw about Y) at the throat; the extension slides aft; the actuators' ends
  for (let e = 0; e < NENG; e++) {
    const [x, y] = ENG_P[e];
    mulTo(L3, W, rot(L1, 0, st.gimbal[e * 2], 0, 0, 0, x, y, ENG_Z - 11));
    mulTo(P.bells[e], L3, rot(L1, 1, st.gimbal[e * 2 + 1], 0, 0, 0, 0, 0, 0));
    mulTo(P.exts[e], P.bells[e], tr(L1, 0, 0, -EXT_L * .82 * st.engExt));
    const A = P.act[e];
    apTo(A[0], W, [x, y + 10, ENG_Z - 10.4]); apTo(A[1], P.bells[e], [0, 7.6, -9]);
    apTo(A[2], W, [x + 10, y, ENG_Z - 10.4]); apTo(A[3], P.bells[e], [7.6, 0, -9]);
  }
  // the chamber
  mulTo(P.block, W, tr(L1, 0, -5.6 * (1 - st.breech), 0));
  for (let k = 0; k < 3; k++) mulTo(P.locks[k], W, rot(L1, 2, (st.lock - 1) * PI / 6, 0, 0, 0, 0, 0, LOCK_Z[k] - .5 * (1 - Math.min(1, st.lock * 2))));
  for (let k = 0; k < 12; k++) { const t = PI / 6 + (k % 6) * PI / 3; mulTo(L2, W, rot(L1, 2, t, 0, 0, 0, 0, 0, CLAMP_Z[k < 6 ? 0 : 1])); mulTo(P.clamps[k], L2, tr(L1, 1.25 * (1 - st.clamp), 0, 0)); }
  P.roundOn = st.roundZ !== null && st.roundZ !== undefined;
  if (P.roundOn) { mulTo(P.round, W, tr(L1, 0, 0, st.roundZ)); if (st.flex) addFlex(P.round, st, st.roundZ, 1); }
  for (let k = 0; k < 4; k++) { const [x, z, f] = SWS[k]; mulTo(L2, W, rot(L1, 1, -f * PI / 2, 0, 0, 0, x, SWY + 7, z - 1.3 * f)); mulTo(P.switches[k], L2, rot(L1, 0, (x > 0 ? 1 : -1) * st.sw * PI / 3, 0, 0, 0, 0, 0, 0)); }
  // the laser points (world): emitter, deck mirror, prow mirror (x2), collar sensors 1..5, the crown, ring sensors, the CR
  apTo(P.laser[0], W, LZ.emit); apTo(P.laser[1], W, LZ.mid); apTo(P.laser[2], W, LZ.prow); apTo(P.laser[3], W, LZ.prow);
  for (let s = 1; s < NSEG; s++) apTo(P.laser[3 + s], P.colS[s], [0, BEAM_Y, 1.1]);
  apTo(P.laser[3 + NSEG], P.crown, [0, BEAM_Y, 1.2]);
  for (let k = 0; k < 4; k++) apTo(P.laser[10 + k], P.rings[k >> 1].nodes[(k & 1) * 12 + (k >> 1) * 6], [-7.6, 0, 0]);
  apTo(P.laser[14], P.cr.F, [0, BEAM_Y, -4.45]);
  for (let k = 0; k < 6; k++) { const c = Math.cos(ALN[k]), s = Math.sin(ALN[k]); apTo(P.align.e[k], W, [c * ALN_R, s * ALN_R, Z_PROW + 4.3]); apTo(P.align.r[k], P.cr.F, [c * ALN_R, s * ALN_R, -3.7]); }
  return P;
}
/* a point of a segment's frame without posing everything (camera use): platform frame */
const segPt = (s, p) => [p[0], p[1], s * LSEG + p[2]];
/* the maintenance crawlers: on the plateau's edge rails (k 0..3) and the keel (4, 5); st.crawl[k] its z */
function poseCrawlers(P, st) {
  const sl = 27 * (KS - 1) / (Z_PROW - Z_STERN);
  for (let k = 0; k < NCRAWL; k++) {
    const z = st.crawl ? st.crawl[k] : -200, s = k % 2 ? -1 : 1, keel = k >= 4, kk_ = kz(z);
    const x = keel ? s * 12 * kk_ : s * (27 * kk_ - 4), y = keel ? -27 * kk_ - 1.4 : 27 * kk_ + 1.4;
    mulTo(L2, P.W, rot(L1, 0, (keel ? -1 : 1) * Math.atan(sl), 0, 0, 0, x, y, z));
    if (keel) mulTo(P.crawl[k], L2, rot(L1, 2, PI, 0, 0, 0, 0, 0, 0)); else { const M = P.crawl[k]; for (let i = 0; i < 9; i++) M.R[i] = L2.R[i]; M.T[0] = L2.T[0]; M.T[1] = L2.T[1]; M.T[2] = L2.T[2]; }
  }
}

/* ---------------- draw ---------------- */
/* LK: { o (base options), hullF, hull, hullG (the hull's fwd plating, main plating, greebles), hsg, hall, jk (the shell),
   cold, core, cp (the couples), fuel (the fuel and the drums), x (the chamber's parts and the round), bar (barrel
   interiors, X-ray), skinOcc, ring (the stabiliser rings), cr (the construction ring), wave(worldPos) -> lime 0..1 } */
const OB = {}, OS = {}, OC_ = {}, OF = {}, OR_ = {}, OCR = {};
const OPL = [{}, {}, {}, {}, {}], CLP = [new Float64Array(4), new Float64Array(4), new Float64Array(4), new Float64Array(4), new Float64Array(4)];
const FL3 = [0, 0, 0, 0, 0], WP = [0, 0, 0];
let LKc = null, FRESH = 20;
/* the projected radius (px) of a sphere of radius r at local point lc under Tw */
function lodPx(Tw, lc, r) { apTo(WP, Tw, lc); const C = ORK.C, e = C.eye, d = Math.hypot(WP[0] - e[0], WP[1] - e[1], WP[2] - e[2]); return r * C.fl / Math.max(1, d); }
function inst(B, Tw, o, lc, fresh) {
  let l = o.l0 || 0;
  if (LKc.wave) { apTo(WP, Tw, lc); l = Math.max(l, LKc.wave(WP)); }
  if (fresh > l) l = fresh;
  o.lime = l;
  L.draw(B, Tw, o);
}
const setO = (dst, src, l0) => { for (const k in dst) delete dst[k]; Object.assign(dst, src); dst.l0 = l0 === undefined ? (src.lime || 0) : l0; dst.lime = dst.l0; return dst; };
/* the camera-space clip plane z > front (platform frame) for a build layer */
function frontPlane(o, W, front) {
  const C = ORK.C, r = C.r, u = C.u, f = C.f, e = C.eye, M = W.R;
  const nx = M[2], ny = M[5], nz = M[8], px = W.T[0] + nx * front - e[0], py = W.T[1] + ny * front - e[1], pz = W.T[2] + nz * front - e[2];
  o[0] = r[0] * nx + r[1] * ny + r[2] * nz; o[1] = u[0] * nx + u[1] * ny + u[2] * nz; o[2] = f[0] * nx + f[1] * ny + f[2] * nz;
  o[3] = o[0] * (r[0] * px + r[1] * py + r[2] * pz) + o[1] * (u[0] * px + u[1] * py + u[2] * pz) + o[2] * (f[0] * px + f[1] * py + f[2] * pz);
}
/* a layer's state over [z0, z1]: 0 absent, 1 whole, 2 cut at its front */
const lay = (st, L_, z0, z1) => { const f = st.front[L_]; return f <= z0 ? 0 : f >= z1 ? 1 : 2; };
const fresh = (st, L_, z) => { const d = st.front[L_] - z; return d < 0 || d > st.freshL ? 0 : st.freshA * (1 - d / st.freshL); };
function draw(P, st, LK) {
  const o = LK.o; LKc = LK;
  setO(OB, LK.bar || o); setO(OS, o); setO(OC_, o); setO(OF, o); setO(OR_, LK.ring || o); setO(OCR, LK.cr || o);
  OF.pxf = 3.6; OB.pxf = (OB.pxf || 1) * 1.7; OS.pxf = (OS.pxf || 1) * 1.6; OB.pxl = 1.5; OS.pxl = 1.4; OF.pxl = 1.3;
  CUR.z = 0; CUR.k = -1; CUR.inst = 0;
  const lm = root.lime;
  if (LK.wave) for (const c of root.CH) { apTo(WP, P.W, c.c); lm[c.i] = LK.wave(WP); } else lm.fill(0);
  L.draw(root, P.W, o);
  L.draw(hsg, P.W, LK.hsg || o); L.draw(hall, P.W, LK.hall || o);
  // the hull
  CUR.inst = 5;
  if (!LK.hullF || LK.hullF.a > .01) L.draw(hullF, P.W, LK.hullF || o);
  L.draw(hullM, P.W, LK.hull || o); L.draw(hullG, P.W, LK.hullG || LK.hull || o);
  L.draw(pylons, P.W, LK.ring || o); L.draw(engMount, P.W, o);
  // the reactor
  CUR.inst = 6;
  L.draw(coreB, P.W, LK.core || o); L.draw(coldB, P.W, LK.cold || LK.jk || o); L.draw(jacket, P.W, LK.jk || o);
  if (LK.cp) L.draw(couples, P.W, LK.cp);
  if (LK.fuel) for (let k = 0; k < DRUMS.length; k++) L.draw(drum, P.drums[k], LK.core || LK.fuel);
  if (LK.sec && st.cut) { const H = [st.cut.hk, st.cut.hc, st.cut.hs], SB = [secCore, secCp, secSh]; for (let i = 0; i < 6; i++) if (H[i >> 1] > .01) L.draw(SB[i >> 1], P.secs[i], LK.sec); }
  for (let k = 0; k < PUMPS.length; k++) { CUR.k = k; if (lodPx(P.pumps[k], [0, 0, 0], 2) > 2) L.draw(impeller, P.pumps[k], o); }
  // the barrel, layer by layer up to each layer's front
  CUR.inst = 1;
  for (let L_ = 0; L_ < 5; L_++) if (st.front[L_] > -1e8 && st.front[L_] < 1e8) frontPlane(CLP[L_], P.W, st.front[L_]);
  const OL = [OB, OB, OC_, OB, OS];
  for (let L_ = 0; L_ < 5; L_++) { setO(OPL[L_], OL[L_], OL[L_].l0); OPL[L_].clipP = CLP[L_]; OPL[L_].pxf = OL[L_].pxf; OPL[L_].pxl = OL[L_].pxl; }
  const lo_ = (L_, z0, z1) => { const s = lay(st, L_, z0, z1); return s === 0 ? null : s === 1 ? OL[L_] : OPL[L_]; };
  for (let s = 0; s < NSEG; s++) {
    const z0s = s * LSEG;
    if (st.front[0] <= z0s) break;
    const pxs = lodPx(P.seg[s], [0, 0, LSEG / 2], 16);
    st.flapAt(s * NBAY, FL3); let shut = FL3[0] < .01 && FL3[1] < .01;
    if (shut) { st.flapAt(s * NBAY + NBAY - 1, FL3); shut = FL3[0] < .01 && FL3[1] < .01; }
    const whole = st.front[4] >= z0s + LSEG + 40 && fresh(st, 4, z0s + LSEG) < .01;
    const lo = shut && whole && pxs < 26 && !LK.bar;
    if (lo) { CUR.z = z0s; CUR.k = s * NBAY; inst(segLo, P.seg[s], OS, [0, 0, LSEG / 2], 0); }
    for (let b = 0; b < NBAY && !lo; b++) {
      const k = s * NBAY + b, Tb = P.bay[k], z0 = z0s + b * BAYL, z1 = z0 + BAYL, zc = z0 + 5;
      if (st.front[0] <= z0) break;
      CUR.z = z0; CUR.k = k;
      const px = lodPx(Tb, [0, 0, 5], 16);
      if (px < .8) continue;
      st.flapAt(k, FL3);
      const open = FL3[0] > .01 || FL3[1] > .01;
      const o2 = lo_(2, z0, z1), o4 = lo_(4, z0, z1), skin = o4 === OS && !open && LK.skinOcc;
      if (o2) inst(px > 70 ? bayFr : bayLo, Tb, o2, [0, 0, 5], fresh(st, 2, zc));
      if (!skin || LK.bar) {
        const o0 = lo_(0, z0, z1), o1 = lo_(1, z0, z1);
        if (o0 && px > 5) inst(px > 80 ? bayCore : bayCoreLo, Tb, o0, [0, 0, 5], fresh(st, 0, zc));
        if (o1 && px > 5) inst(px > 80 ? bayIn : bayInLo, Tb, o1, [0, 0, 5], fresh(st, 1, zc));
      }
      const o3 = lo_(3, z0, z1);
      for (let f = 0; f < 6; f++) {
        mulTo(L2, Tb, rot(L1, 2, f * PI / 3, 0, 0, 0, 0, 0, 0));
        if (o3 && (open || !skin) && px > 4) { mulTo(L4, L2, rot(L1, 2, FL3[2], 0, CAS_Y, 0, 0, FL3[1], 0)); inst(px > 90 ? cas : casLo, L4, o3, [0, CAS_Y, 5], Math.max(fresh(st, 3, zc), FL3[4])); }
        if (o4) { mulTo(L4, L2, rot(L1, 2, -FL3[0], 0, 0, 0, HR / 2, HA, 0)); inst(px > 110 ? flap : flapLo, L4, o4, [-HR / 2, 0, 5], Math.max(fresh(st, 4, zc), FL3[3])); }
      }
    }
    CUR.z = z0s; CUR.k = s;
    const oc = lo_(2, z0s, z0s + COL_L);
    if (oc) inst(s ? collarM : collarE, P.colS[s], oc, [0, 0, 1], fresh(st, 2, z0s));
    CUR.z = z0s + LSEG - COL_L;
    const oe = lo_(2, z0s + LSEG - COL_L, z0s + LSEG);
    if (oe && s < NSEG - 1) inst(collarE, P.colE[s], oe, [0, 0, 1], fresh(st, 2, z0s + LSEG));
  }
  for (let j = 1; j < NSEG; j++) {
    if (st.front[2] < j * LSEG + COL_L) break;
    CUR.z = j * LSEG; CUR.k = j;
    if (lodPx(P.colS[j], [0, 0, 0], 16) > 3) for (let f = 0; f < 6; f++) inst(jaw, P.jaws[j][f], OC_, [0, HA + 2, 2], 0);
    CUR.z = j * LSEG - 1.7; if ((st.sleeve[j] > .01 || LK.bar) && st.front[0] > j * LSEG + 2) inst(sleeve, P.sleeves[j], OB, [0, 0, 1.7], 0);
  }
  for (let k = 0; k < NTEL; k++) { const z0 = TEL_Z[k], oT = lo_(2, z0, z0 + TEL_L); if (!oT) continue; CUR.z = z0; CUR.k = k; inst(tel[k], P.tel[k], oT, [0, 0, 18], fresh(st, 2, z0 + 18)); }
  { const oK = lo_(2, Z_TELEND, Z_MZ); if (oK) { CUR.z = Z_TELEND; inst(crown, P.crown, oK, [0, 0, 2], fresh(st, 2, Z_TELEND)); if (st.front[4] > Z_MZ) for (let k = 0; k < 6; k++) inst(iris, P.iris[k], OC_, [0, -2, 0], fresh(st, 4, Z_MZ)); } }
  // the stabiliser rings: nodes, chords, wheels, shoes (smeared when they spin fast on screen)
  for (let ri = 0; ri < NRING; ri++) {
    const R_ = P.rings[ri], bl = st.blur ? st.blur[ri] : 0, a0 = OR_.a === undefined ? 1 : OR_.a;
    CUR.inst = 2; CUR.k = ri; CUR.z = RING_Z[ri];
    OR_.a = a0 * (1 - .8 * bl); OR_.keep = 1 - .7 * bl;
    const far = lodPx(R_.F, [0, 0, 0], RING_R) < 260;
    if (bl < .85) for (let i = 0; i < NRN; i++) {
      CUR.j = i;
      inst(rNode, R_.nodes[i], OR_, [0, 0, 0], 0);
      inst(far || lodPx(R_.chords[i], [0, 0, 0], RCH / 2) < 90 ? rChordLo : rChord, R_.chords[i], OR_, [0, 0, 0], 0);
      if (!far && lodPx(R_.rotors[i], [0, 0, 0], 5) > 6) inst(rRotor, R_.rotors[i], OR_, [0, 0, 0], 0);
    }
    OR_.a = a0; OR_.keep = 1;
    for (let p = 0; p < 4; p++) inst(rShoe, R_.shoes[p], OR_, [0, 0, 0], 0);
    if (bl > .02) smear(R_.C, RING_R, RSEC, bl, OR_);
  }
  // the construction ring: the static core, the rim (smeared when fast), the docking arms
  {
    const bl = st.cr.blur || 0, a0 = OCR.a === undefined ? 1 : OCR.a;
    CUR.inst = 3; CUR.k = -1; CUR.z = st.cr.z;
    inst(crCore, P.cr.F, OCR, [0, 0, 0], 0);
    OCR.a = a0 * (1 - .8 * bl); OCR.keep = 1 - .7 * bl;
    const far = lodPx(P.cr.F, [0, 0, 0], CR_R) < 220;
    if (bl < .85) for (let i = 0; i < NCN; i++) { CUR.j = i; inst(crNode, P.cr.nodes[i], OCR, [0, 0, 0], 0); inst(far || bl > .3 ? crChordLo : crChord, P.cr.chords[i], OCR, [0, 0, 0], 0); }
    OCR.a = a0; OCR.keep = 1;
    if (bl > .02) smear(P.cr.F, CR_R, CRSEC, bl, OCR);
    CUR.inst = 0; for (let k = 0; k < 4; k++) inst(dockArm, P.arms[k], OC_, [0, 0, 8], 0);
  }
  // fins (sparser lattice: big flat panels), engines
  CUR.inst = 4;
  const finFar = lodPx(P.W, [0, 0, FIN_Z0 + FIN_L / 2], 40) < 40;
  for (let f = 0; f < NFIN; f++) for (let j = 0; j < NFP; j++) { CUR.k = f; CUR.j = j; CUR.z = FIN_Z0; const T_ = P.fins[f * NFP + j]; L.draw(finFar || lodPx(T_, [FPW / 2, 0, FIN_L / 2], 30) < 110 ? finLo : finP, T_, LK.fin || OF); }
  for (let e = 0; e < NENG; e++) { CUR.k = e; CUR.z = ENG_Z; L.draw(bell, P.bells[e], OC_); L.draw(ext, P.exts[e], OC_); }
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
  if (lodPx(P.W, [0, 0, -300], 300) > 120) { poseCrawlers(P, st); for (let k = 0; k < NCRAWL; k++) if (lodPx(P.crawl[k], [0, 1, 0], 4) > 1.5) L.draw(crawler, P.crawl[k], LK.hull || o); }
}
/* a fast-spinning ring as its swept surface: rings of dots at the section's corners and middle (Tc: the ring's frame,
   not spinning) */
const SMP = [0, 0, 0], SMU = [0, 0, 0], SMW = [0, 0, 0];
function smear(Tc, r, sec, bl, o) {
  const K = ORK, M = Tc.R, ax = [M[2], M[5], M[8]];
  SMU[0] = M[0]; SMU[1] = M[3]; SMU[2] = M[6]; SMW[0] = M[1]; SMW[1] = M[4]; SMW[2] = M[7];
  const d = Math.max(1, V.dist(Tc.T, K.C.eye)), rp = r * K.C.fl / d, n = Math.max(64, Math.min(2600, Math.round(rp * TAU / 2.4)));
  const a = bl * (o.a === undefined ? 1 : o.a), nf = rp > 300 ? 5 : rp > 120 ? 3 : 1;
  // the section's four corners bright, its outer and inner faces as bands of fainter rings (the swept surface)
  for (const [dr, dz, br] of [[-.5, -.5, .55], [-.5, .5, .55], [.5, -.5, .7], [.5, .5, .7]]) {
    SMP[0] = Tc.T[0] + ax[0] * dz * sec[1]; SMP[1] = Tc.T[1] + ax[1] * dz * sec[1]; SMP[2] = Tc.T[2] + ax[2] * dz * sec[1];
    K.ringW(SMP, SMU, SMW, r + dr * sec[0], n, 1, K.WH, br * a, dr * 3 + dz);
  }
  for (let i = 1; i < nf + 1; i++) for (const [dr, br] of [[.5, .3], [-.5, .22]]) {
    const dz = -.5 + i / (nf + 1);
    SMP[0] = Tc.T[0] + ax[0] * dz * sec[1]; SMP[1] = Tc.T[1] + ax[1] * dz * sec[1]; SMP[2] = Tc.T[2] + ax[2] * dz * sec[1];
    K.ringW(SMP, SMU, SMW, r + dr * sec[0], Math.round(n * .7), 1, K.WH, br * a, i * 1.7 + dr);
  }
}

/* ---------------- occluders ---------------- */
const PRP = {}, PRC = {};
for (const n of [6, 8, 12, 16]) { PRP[n] = []; PRC[n] = []; for (let k = 0; k < n + 2; k++) PRP[n].push([0, 0, 0, 0]); for (let k = 0; k < n * 2; k++) PRC[n].push([0, 0, 0]); }
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
/* a convex polygon (CCW, platform x y, scaled by k and shrunk) extruded from z0 to z1 (z1 < z0) */
const POLY = {};
for (const n of [4, 8]) { POLY[n] = { P: [], C: [] }; for (let k = 0; k < n + 2; k++) POLY[n].P.push([0, 0, 0, 0]); for (let k = 0; k < n * 2; k++) POLY[n].C.push([0, 0, 0]); }
function occPoly(W, poly, k, z0, z1) {
  const n = poly.length, M = W.R, sh = k * .975, POLY_P = POLY[n].P, POLY_C = POLY[n].C;
  let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx = cx / n * sh; cy = cy / n * sh;
  apTo(PL, W, [cx, cy, (z0 + z1) / 2]);
  let rr = 0; for (const p of poly) rr = Math.max(rr, Math.hypot(p[0] * sh - cx, p[1] * sh - cy));
  if (!ORK.wIn(PL[0], PL[1], PL[2], Math.hypot(rr, (z0 - z1) / 2))) return;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey), lx = ey / l, ly = -ex / l;
    const nx = M[0] * lx + M[1] * ly, ny = M[3] * lx + M[4] * ly, nz = M[6] * lx + M[7] * ly, P = POLY_P[i];
    apTo(WP, W, [a[0] * sh, a[1] * sh, z0]);
    P[0] = nx; P[1] = ny; P[2] = nz; P[3] = nx * WP[0] + ny * WP[1] + nz * WP[2];
    apTo(POLY_C[i * 2], W, [a[0] * sh, a[1] * sh, z0 - .3]); apTo(POLY_C[i * 2 + 1], W, [a[0] * sh, a[1] * sh, z1 + .3]);
  }
  const dz = [M[2], M[5], M[8]], d0 = dz[0] * PL[0] + dz[1] * PL[1] + dz[2] * PL[2], hz = (z0 - z1) / 2 - .3;
  let P = POLY_P[n]; P[0] = -dz[0]; P[1] = -dz[1]; P[2] = -dz[2]; P[3] = -d0 + hz;
  P = POLY_P[n + 1]; P[0] = dz[0]; P[1] = dz[1]; P[2] = dz[2]; P[3] = d0 + hz;
  ORK.occS(2); ORK.occPlanes(POLY_P, POLY_C); ORK.occS(0);
}
const HULL_POLY = [[42, -6], [42, 6], [27, 27], [-27, 27], [-42, 6], [-42, -6], [-30, -27], [30, -27]];
const D2_POLY = [[20, 27], [16, 37], [-16, 37], [-20, 27]], D3_POLY = [[12, 37], [9, 47], [-9, 47], [-12, 37]];
const HULL_ZS = [Z_PROW, -120, -200, -300, -400, -500, Z_STERN];
function occBoxV(Tw, mn, mx) {
  apTo(PL, Tw, [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]);
  if (!ORK.wIn(PL[0], PL[1], PL[2], Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2)) return;
  ORK.occBox(Tw, mn, mx);
}
/* oo: { skin (segments whose skin is built and closed: an array of booleans), hsg, hullF (the forward hull occludes),
   core (false: none), coreTo (the core only up to that z), cutK (the cutaway's core half-angle: the core outside it) } */
const CPOLY = [[0, 0], [0, 0], [0, 0], [0, 0]];
function occlude(P, st, oo) {
  const W = P.W;
  if (oo.cutK !== undefined) {
    const a0 = CUT_A + oo.cutK, sp = (TAU - 2 * oo.cutK) / 3;
    for (let i = 0; i < 3; i++) { CPOLY[0][0] = 0; CPOLY[0][1] = 0; for (let j = 0; j < 3; j++) { const a = a0 + sp * (i + j / 2); CPOLY[j + 1][0] = Math.cos(a) * CORE_R; CPOLY[j + 1][1] = Math.sin(a) * CORE_R; } occPoly(W, CPOLY, 1, REA_Z1, REA_Z0); }
  }
  else if (oo.coreTo !== undefined) { if (oo.coreTo > REA_Z0) occPrism(W, 16, CORE_R, 0, REA_Z0, oo.coreTo); }
  else if (oo.core !== false) occPrism(W, 16, SHELL_R, 0, REA_Z0, REA_Z1);
  if (oo.hsg !== false) occPrism(W, 6, HSG_R, PI / 6, HSG_Z0, HSG_Z1);
  for (let i = 0; i < HULL_ZS.length - 1; i++) { if (i === 0 && oo.hullF === false) continue; occPoly(W, HULL_POLY, kz(HULL_ZS[i]), HULL_ZS[i], HULL_ZS[i + 1]); }
  occPoly(W, D2_POLY, kz(D2.z1), D2.z1, -400); occPoly(W, D2_POLY, kz(-400), -400, Z_STERN);
  occPoly(W, D3_POLY, kz(D3.z1), D3.z1, Z_STERN);
  occBoxV(W, [-TOWER.x, TOWER.yb, TOWER.z0], [TOWER.x, TOWER.yb + TOWER.h, TOWER.z1]);
  if (oo.skin) for (let s = 0; s < NSEG; s++) if (oo.skin[s]) occPrism(P.seg[s], 6, HR, PI / 6, COL_L, LSEG - COL_L);
  if (oo.skin && oo.skin[NSEG]) for (let k = 0; k < NTEL; k++) occPrism(P.tel[k], 6, TEL_R[k], PI / 6, 0, TEL_L);
  for (let e = 0; e < NENG; e++) { const [x, y] = ENG_P[e]; occBoxV(W, [x - 12, y - 12, ENG_Z - 7.6], [x + 12, y + 12, ENG_Z]); }
}
const stats = () => { let n = 0; for (const B of bodies) n += B.L.length / 10 + B.T.length / 10 + B.P.length / 23 + B.Y.length + B.N.length / 7 + B.Rg.length / 14; return { bodies: bodies.length, prims: Math.round(n), lights: LTS.length }; };
/* the frames the fabrication insert works in */
const BAYX = X.make(R.I(), BAY_C.slice()), CHAMBERX = X.make(R.I(), [0, 0, Z_RND]);

/* ---------------- points of interest (platform frame; the camera frames them) ---------------- */
const POI = {
  prow: [0, 0, Z_PROW], stern: [0, 0, Z_STERN], hullMid: [0, 20, -320], bridge: [0, TOWER.yb + TOWER.h + 8, TOWER.z1 - 16], tower: [0, TOWER.yb + TOWER.h / 2, (TOWER.z0 + TOWER.z1) / 2],
  reactor: [0, 0, (REA_Z0 + REA_Z1) / 2], cut: [Math.cos(CUT_A) * SHELL_R, Math.sin(CUT_A) * SHELL_R, (REA_Z0 + REA_Z1) / 2], cutDir: [Math.cos(CUT_A), Math.sin(CUT_A), 0],
  fins: [0, 0, FIN_Z0 + FIN_L / 2], finTip: [SHELL_R + NFP * FPW, 0, FIN_Z0 + FIN_L / 2], pumps: PUMPS[3].slice(),
  ringA: [0, 0, RING_Z[0]], ringB: [0, 0, RING_Z[1]], rings: [0, 0, (RING_Z[0] + RING_Z[1]) / 2], ringR: RING_R, pylonHead: PYH[0].slice(), ringNode: [RING_R, 0, RING_Z[0]],
  nozzles: ENG_P.map(([x, y]) => [x, y, ENG_Z - 11 - BELL_L]), engine: [ENG_P[0][0], ENG_P[0][1], ENG_Z - 20],
  chamber: [0, 0, Z_RND], breech: [0, 0, -14.6], bay: BAY_C.slice(), switchyard: [0, SWY + 7, -162], switches: SWS.map(([x, z]) => [x, SWY + 7, z]), well: [0, WELL.y, (WELL.z0 + WELL.z1) / 2], caps: [15, SWY + 6, -162],
  hab: [HAB.x1 + 2.4, 27 * kz(HAB.z), HAB.z], crew: [HAB.x1 + 5, 27 * kz(HAB.z) + 1, HAB.z - 4.2], antennas: [0, D2.y1 * kz(-280) + 8, -280],
  laserEmit: LZ.emit.slice(), laserMid: LZ.mid.slice(), laserProw: LZ.prow.slice(), alignPost: [Math.cos(ALN[0]) * ALN_R, Math.sin(ALN[0]) * ALN_R, Z_PROW + 2],
  crDock: [0, 0, CR_DOCK], muzzle: [0, 0, Z_MZ], collar: k => [0, 0, k * LSEG], collarMast: k => [0, BEAM_Y, k * LSEG + 1.1],
};

return { bodies, root, rods: [rod], rodBody: rod, sabot, capD, pose, draw, occlude, stats, CUR, LTS, PP, POI, setGimbal, GAX, segPt,
  HR, HA, NSEG, LSEG, BAYL, NBAY, NB, BORE_R, LINER_R, NMAG, MAG_RC, MAG_R, CRING_R, NTEL, TEL_R, TEL_L, TEL_S0, TEL_S1, TEL_Z, Z_TELEND, CROWN_L, Z_MZ, COL_R, COL_L, IRIS_R,
  Z_RND, RND_L, RND_R, ROD_L, ROD_R, HSG_R, HSG_Z0, HSG_Z1, BLK_Z, LOCK_Z, BAY_C, BAY_H, SR, SZ0, SZ1, SWZ, SWX, SWY, SWS, CAPS,
  Z_PROW, Z_STERN, KS, kz, HP, C0, D2, D3, WELL, TOWER, HAB, NCRAWL,
  NRING, RING_R, RING_Z, NRN, RCH, RSEC, PYL, SHOE_R, CR_R, NCN, CR_ST, CR_CO, CR_RX, CR_DOCK, ALN, ALN_R,
  HUB_Z: (RING_Z[0] + RING_Z[1]) / 2, HUB_R: 32, NND: NRN, CHORD: RCH, HC: RCH / 2, KAPPA_S: 0, RST_R: RING_R,
  REA_Z0, REA_Z1, CORE_R, HS_R, CS_R, SHELL_R, FUEL_R, DRUM_RC, DRUM_R, DRUMS, PUMPS, CUT_A, CUT_W, NFIN, NFP, FPW, FIN_Z0, FIN_L,
  NENG, ENG_P, ENG_Z, BELL_L, BELL_R1, EXT_L, ENG_R: Math.hypot(ENG_P[0][0], ENG_P[0][1]), ENG_Z0: ENG_Z, ENG_TH: ENG_Z - 11,
  LZ, BEAM_Y, NCP, CP_ROWS, CP_Z0, CP_DZ, TANKS, TANK_RC, TANK_R,
  BAYX, CHAMBERX, xf, mulTo, rot, rotAx, tr, apTo };
};
