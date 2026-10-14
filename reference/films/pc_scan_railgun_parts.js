/* SCAN · RAILGUN parts: the electromagnetic railgun mount in the Mk 45's seat on the Burke's foredeck, its loader and
   the power room under it.
   The mount: a gunhouse of two cheeks (access panels, louvres, a crew door) round the barrel slot; in the starboard
   cheek the hydraulic power unit (motor, pump, reservoir, three accumulators, valve manifold), in the port cheek two
   helium compressors and the fire-control cabinet; two hydraulic train drives whose pinions walk round a fixed ring
   gear; on the roof an electro-optical / infrared director (yaw, pitch) and an X-band fire-control radar (yaw); the
   cradle on its trunnions with two hydraulic elevation rams, two recoil buffers, the muzzle velocity radar on a
   bridge over the barrel and the loader frame behind the breech. The barrel (12.85 m): a sliding breech block, a
   feed section with the two current injection blocks, copper rails top and bottom with insulating sidewalls in a
   composite containment, preload clamps at 13 bands (wedge jaws that drive home), and between them 12 stations of
   superconducting augmenting coils (a racetrack pair either side, the field across the bore) each in its cryostat
   with a pulse-tube cryocooler, current leads and helium lines to two headers; the rails' coolant manifold under
   the barrel; the muzzle block with the arc shunt and a two-leaf muzzle cover.
   The loader for the 2 m long-rod round: a 12-cell magazine drum round the power column in the power room, a hoist
   in the rotating trunk, a tray that takes the round standing and swings it into line behind the breech, a chain
   rammer (2.4 m stroke).
   The power room: four pulsed alternators with exciters (one comes apart on guide rods), two coolant pumps (brushless
   DC motors: finned housing, drive inverter, a stator of twelve wound teeth, a permanent-magnet rotor, the pump's
   impeller in its volute), the valve header, the coolant lines down to the keel (the heat sink's ports, RGP.SINK),
   four capacitor racks (80 modules, film capacitor cans), five power conditioning cabinets, bus bars, cable trays,
   fans; the X-ray point pass (a slice opens a window in the hull, the room shows only where it is open).
   Surfaces are sampled on regular lattices with their edges drawn as hairlines at twice the density (the Aegis face
   look); convex occluders write a 4 px depth-tile buffer so solid blocks hide what is behind them.
   Frames: ship (HD.destroyer: +Z fwd, +X stbd, origin midships waterline); M (mount base on the deck, not
   training); T (turret, trains about Y); C (cradle, elevates about the trunnion, +Z along the bore); B (the barrel,
   slides in C on recoil); E (= B: the muzzle frame, kept for the shot module). Loaded after scan_kit.js; exposes
   window.RGP. */
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
const TRN = [0, 2.1, 1.2];                              // trunnion in T
const EL_LOAD = 50 * DEG;                               // the loading elevation (the firing elevation)
/* the barrel (B z): rails from the breech to the muzzle block; 12 coil stations between 13 clamp bands */
const RZ0 = -2.3, RZ1 = 9.5;                            // rails' breech end, the end of the coil section
const SLV0 = 9.5, SLV1 = 10.4, EXT = 0;                 // the muzzle block (it does not run out: EXT 0)
const MZ_E = [0, 0, SLV1 + .06];                        // bore mouth (E = B)
const NST = 12, ZS0 = -1.7, DZS = (RZ1 - ZS0) / NST;    // coil stations
const STN = Array.from({ length: NST }, (_, k) => ZS0 + (k + .5) * DZS);
const BANDS = Array.from({ length: NST + 1 }, (_, k) => +(ZS0 + k * DZS - .05).toFixed(3));   // clamp bands [z, z + .1]
const RW = .13, RY0 = .14, RY1 = .24;                   // rails: half width, inner face, outer face (y)
const IX0 = .14, IX1 = .2;                              // insulating sidewalls (x)
const CX = .36, CY = .36;                               // containment half widths
const KX0 = .40, KX1 = .62, KY = .40, KZ = .415;        // cryostats (x span each side, half height, half length)
const CXC = .51;                                        // the coils' plane (x)
/* the round and the loader */
const RND_H = 1.0;                                      // the round's half length (the 2 m rod)
const SEAT_Z = -1.15, RAM_L = 2.4, TRAY_Z = SEAT_Z - RAM_L;   // seated round centre, the rammer's stroke, the tray (C z)
const HZ = TRN[2] + TRAY_Z * Math.cos(EL_LOAD), HY1 = TRN[1] + TRAY_Z * Math.sin(EL_LOAD);   // hoist axis (T z), its top (T y)
const DRUM_R = -HZ, DRUM_Y = FL + .05, RND_Y0 = FL + 1.25;  // magazine cells: radius, drum base, round centre (ship y)
const HY0 = RND_Y0 - GY;                                // the round's centre in the drum (T y)
const NCELL = 12;
/* sensors (T) and the elevation rams */
const EO_P = [-1.78, 3.1, -.9], EO_H = .42;             // EO/IR director: pedestal foot, the elevation axis above it
const FC_P = [1.82, 3.1, -3.0], FC_H = .72;             // fire-control radar: mast foot, its head
const MV_P = [0, 1.0, 2.72];                            // muzzle velocity radar (C)
const RAM_E = s => [[s * .9, .35, 2.9], [s * .9, -.4, 1.2]];   // elevation ram: [base in T, pin in C]
const TD_P = [-1, 1].map(s => [s * 2.3 * Math.sin(60 * DEG), .3, 2.3 * Math.cos(60 * DEG)]);   // train drives (T): motor foot
const RING_R = 2.45, PIN_R = .15;                        // the ring gear's pitch radius (internal), the pinions'

/* ================= lattice sampling =================
   faces on regular grids (no jitter) at spacing s, edges as hairlines at s/2 with a zero normal (drawn at the
   edge brightness, both sides). prim options: ds (spacing scale), noEdge, edgeOnly, fine (skipped when coarse). */
const HF = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const HE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function perp(d) { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const u = V.norm(V.cross(d, a)); return [u, V.cross(d, u)]; }
function quadL(o, a, b, c, d, n, s) {
  const nu = Math.max(1, Math.round(V.dist(a, b) / s)), nv = Math.max(1, Math.round(V.dist(a, d) / s));
  for (let i = 0; i < nu; i++) { const u = (i + .5) / nu;
    const p0 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], p1 = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u, d[2] + (c[2] - d[2]) * u];
    for (let j = 0; j < nv; j++) { const v = (j + .5) / nv; o.push(p0[0] + (p1[0] - p0[0]) * v, p0[1] + (p1[1] - p0[1]) * v, p0[2] + (p1[2] - p0[2]) * v, n[0], n[1], n[2]); }
  }
}
function lineL(o, a, b, s) {
  const n = Math.max(1, Math.round(V.dist(a, b) / s));
  for (let k = 0; k < n; k++) { const u = (k + .5) / n; o.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 0, 0, 0); }
}
function ringL(o, c, U, W, r, s) {
  const n = Math.max(10, Math.round(TAU * r / s));
  for (let k = 0; k < n; k++) { const t = (k + .5) / n * TAU, cs = Math.cos(t) * r, sn = Math.sin(t) * r; o.push(c[0] + U[0] * cs + W[0] * sn, c[1] + U[1] * cs + W[1] * sn, c[2] + U[2] * cs + W[2] * sn, 0, 0, 0); }
}
const Z3 = [0, 0, 0];
function sampleLat(prims, s0, coarse) {
  const o = [];
  for (const pr of prims) {
    if (coarse && pr.fine) continue;
    const s = s0 * (pr.ds || 1), es = s0 * .6 * Math.min(2, pr.ds || 1), eo = pr.edgeOnly, ne = pr.noEdge;
    if (pr.t === 'hex') {
      const P = pr.p, c = [0, 0, 0]; for (const p of P) { c[0] += p[0] / 8; c[1] += p[1] / 8; c[2] += p[2] / 8; }
      if (!eo) HF.forEach((f, k) => {
        if (k === 0 && pr.bottom !== true) return; if (pr.skip && pr.skip.includes(k)) return;
        const a = P[f[0]], b = P[f[1]], cc = P[f[2]], d = P[f[3]];
        let n = V.cross(V.sub(b, a), V.sub(d, a)); if (V.len(n) < 1e-9) n = V.cross(V.sub(cc, b), V.sub(a, b)); n = V.norm(n);
        const fc = [(a[0] + b[0] + cc[0] + d[0]) / 4, (a[1] + b[1] + cc[1] + d[1]) / 4, (a[2] + b[2] + cc[2] + d[2]) / 4];
        if (V.dot(n, V.sub(fc, c)) < 0) n = V.mul(n, -1);
        quadL(o, a, b, cc, d, n, s);
      });
      if (!ne) for (const [i, j] of HE) lineL(o, P[i], P[j], es);
    } else if (pr.t === 'lathe') {
      const [U, W] = perp(pr.d), st = pr.st, ax = pr.d;
      if (!eo) for (let i = 0; i < st.length - 1; i++) {
        const [s0_, r0] = st[i], [s1, r1] = st[i + 1], dsg = s1 - s0_, dr = r1 - r0;
        const L = Math.hypot(dsg, dr), na = Math.max(1, Math.round(L / s)), rm = Math.max(r0, r1), nt = Math.max(8, Math.round(TAU * rm / s));
        const nl = Math.hypot(dsg, dr) || 1, ka = -dr / nl, kr = dsg / nl;
        for (let a = 0; a < na; a++) { const u = (a + .5) / na, sr = s0_ + dsg * u, rr = r0 + dr * u;
          const nti = Math.max(6, Math.round(nt * Math.max(.15, rr / (rm || 1))));
          for (let t = 0; t < nti; t++) { const th = (t + .5) / nti * TAU + (a & 1) * .5 / nti * TAU, cs = Math.cos(th), sn = Math.sin(th);
            const rx = U[0] * cs + W[0] * sn, ry = U[1] * cs + W[1] * sn, rz = U[2] * cs + W[2] * sn;
            o.push(pr.a[0] + ax[0] * sr + rx * rr, pr.a[1] + ax[1] * sr + ry * rr, pr.a[2] + ax[2] * sr + rz * rr, rx * kr + ax[0] * ka, ry * kr + ax[1] * ka, rz * kr + ax[2] * ka); }
        }
      }
      if (!ne) for (const [sv, rv] of st) if (rv > .005) ringL(o, V.mad(pr.a, ax, sv), U, W, rv, es);
      if (pr.caps && !eo) for (const i of [0, st.length - 1]) {
        const [sc, rc] = st[i]; if (rc < .01) continue;
        const nr = Math.max(1, Math.round(rc / s)), c = V.mad(pr.a, ax, sc), nn = V.mul(ax, i ? 1 : -1);
        for (let k = 0; k < nr; k++) { const rr = (k + .5) / nr * rc, nt = Math.max(5, Math.round(TAU * rr / s));
          for (let t = 0; t < nt; t++) { const th = (t + .5) / nt * TAU, cs = Math.cos(th) * rr, sn = Math.sin(th) * rr; o.push(c[0] + U[0] * cs + W[0] * sn, c[1] + U[1] * cs + W[1] * sn, c[2] + U[2] * cs + W[2] * sn, nn[0], nn[1], nn[2]); } }
      }
    } else if (pr.t === 'panel') {
      const P = pr.p;
      if (pr.fill) quadL(o, P[0], P[1], P[2], P[3], Z3, s);
      for (let i = 0; i < 4; i++) lineL(o, P[i], P[(i + 1) % 4], es);
    } else if (pr.t === 'line') {
      const P = pr.closed ? pr.p.concat([pr.p[0]]) : pr.p;
      for (let i = 0; i < P.length - 1; i++) lineL(o, P[i], P[i + 1], es);
    } else if (pr.t === 'blades') {
      const d = pr.d, [U, W] = perp(d), n = pr.n, ch = pr.chord || .35, tp = pr.taper === undefined ? .7 : pr.taper, pit = pr.pitch || 0;
      for (let k = 0; k < n; k++) {
        const a = (pr.rot || 0) + k / n * TAU, dirAt = ang => V.add(V.mul(U, Math.cos(ang)), V.mul(W, Math.sin(ang)));
        const pt = (r, da, side) => V.add(V.mad(pr.c, dirAt(a + da), r), V.mul(d, side * pit * r * Math.abs(da) * 2));
        const w0 = ch / 2, w1 = ch * tp / 2 * pr.r0 / pr.r1 * 1.6, q = [pt(pr.r0, -w0, -1), pt(pr.r0, w0, 1), pt(pr.r1, w1, 1), pt(pr.r1, -w1, -1)];
        quadL(o, q[0], q[1], q[2], q[3], Z3, s);
        for (let i = 0; i < 4; i++) lineL(o, q[i], q[(i + 1) % 4], es);
      }
    }
  }
  return o;
}
/* levels: LV standard, LB big structures, LF fine (small parts seen close) */
const LV = [.016, .032, .064, .128, .256, .512], LB = [.024, .048, .096, .192, .384], LF = [.008, .016, .032, .064, .128, .256], LM = [.011, .022, .044, .088, .176, .352];
const lod = (P, cs, L) => K.lodCloud((L || LV).map((sp, li) => ({ sp, pts: new Float32Array(sampleLat(P, sp, li >= 3)) })), cs || .7);

/* small geometry helpers */
function bar(a, b, w, h, up, o) {
  const d = V.norm(V.sub(b, a));
  let n = up || [0, 1, 0]; if (Math.abs(V.dot(n, d)) > .9) n = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 0, 1];
  const s = V.norm(V.cross(d, n)), u = V.cross(s, d), hw = w / 2, hh = h / 2;
  const q = (p, i, j) => V.add(p, V.add(V.mul(s, i * hw), V.mul(u, j * hh)));
  return G.hex([q(a, -1, -1), q(a, 1, -1), q(b, 1, -1), q(b, -1, -1), q(a, -1, 1), q(a, 1, 1), q(b, 1, 1), q(b, -1, 1)], o);
}
const bars = (P, w, h, up, o) => { const out = []; for (let i = 0; i < P.length - 1; i++) if (V.dist(P[i], P[i + 1]) > 1e-4) out.push(bar(P[i], P[i + 1], w, h, up, o)); return out; };
/* a run of pipe with a flange at each bend */
const pipes = (P, r, o) => {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) out.push(G.cyl(P[i], P[i + 1], r, o));
  for (let i = 1; i < P.length - 1; i++) { const d = V.norm(V.sub(P[i + 1], P[i])); out.push(G.cyl(V.mad(P[i], d, -r * .4), V.mad(P[i], d, r * .4), r * 1.4, Object.assign({}, o, { noEdge: false }))); }
  return out;
};
/* a flexible line: sampled curve as fine pipe segments */
const flex = (P, r, o) => { const out = []; for (let i = 0; i < P.length - 1; i++) out.push(G.cyl(P[i], P[i + 1], r, o || F())); return out; };
const circ = (c, ax, r, o) => { const [U, W] = perp(V.norm(ax)), P = []; const n = 48; for (let k = 0; k < n; k++) { const t = k / n * TAU; P.push(V.add(c, V.add(V.mul(U, Math.cos(t) * r), V.mul(W, Math.sin(t) * r)))); } return G.line(P, Object.assign({ closed: true }, o)); };
/* a box rotated about Y by a (for radial fins, teeth): centre c, half extents h */
function boxY(c, h, a, o) {
  const cs = Math.cos(a), sn = Math.sin(a), P = [];
  for (const [i, j, k] of [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
    const x = i * h[0], y = j * h[1], z = k * h[2]; P.push([c[0] + cs * x + sn * z, c[1] + y, c[2] - sn * x + cs * z]);
  }
  return G.hex(P, o);
}
/* the same about Z (fins on a Z-axis machine) */
function boxZ(c, h, a, o) {
  const cs = Math.cos(a), sn = Math.sin(a), P = [];
  for (const [i, j, k] of [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
    const x = i * h[0], y = j * h[1], z = k * h[2]; P.push([c[0] + cs * x - sn * y, c[1] + sn * x + cs * y, c[2] + z]);
  }
  return G.hex(P, o);
}
/* prims moved by a rigid transform */
function xfPrims(P, Tf) {
  return P.map(pr => {
    const q = Object.assign({}, pr);
    if (pr.p) q.p = pr.p.map(p => X.ap(Tf, p));
    if (pr.t === 'lathe') { q.a = X.ap(Tf, pr.a); q.d = X.dir(Tf, pr.d); }
    if (pr.t === 'blades') { q.c = X.ap(Tf, pr.c); q.d = X.dir(Tf, pr.d); }
    return q;
  });
}
/* a bilinear map over a quad face (a b the bottom edge, d c the top), pushed off along n */
const quadMap = (a, b, c, d, n, off) => (u, v) => V.mad(V.lerp(V.lerp(a, b, u), V.lerp(d, c, u), v), n, off || 0);
/* an access panel on a mapped face: its outline, an inset line, four quarter-turn latches and two hinge knuckles */
function panelOn(fm, u0, v0, u1, v1, o, hinge) {
  const P = [], L = pts => G.line(pts.concat([pts[0]]), o);
  P.push(L([fm(u0, v0), fm(u1, v0), fm(u1, v1), fm(u0, v1)]));
  const du = (u1 - u0) * .05, dv = (v1 - v0) * .05;
  P.push(L([fm(u0 + du, v0 + dv), fm(u1 - du, v0 + dv), fm(u1 - du, v1 - dv), fm(u0 + du, v1 - dv)]));
  for (const [u, v] of [[u0 + du * 2, v0 + dv * 2], [u1 - du * 2, v0 + dv * 2], [u1 - du * 2, v1 - dv * 2], [u0 + du * 2, v1 - dv * 2]]) {
    const e = .006; P.push(G.line([fm(u - e, v - e * 2), fm(u + e, v - e * 2), fm(u + e, v + e * 2), fm(u - e, v + e * 2), fm(u - e, v - e * 2)], F()));
  }
  if (hinge) for (const v of [v0 + (v1 - v0) * .2, v0 + (v1 - v0) * .8]) P.push(G.line([fm(u0 - .004, v - .03), fm(u0 - .004, v + .03)], o));
  return P;
}
/* a racetrack loop in the plane x = xc: legs along z at y ±ry (straight half length hz), semicircular ends */
function racetrack(xc, ry, hz, n) {
  const P = [[xc, ry, -hz]];
  for (let k = 0; k <= n; k++) { const a = k / n * PI; P.push([xc, ry * Math.cos(a), hz + ry * Math.sin(a)]); }
  for (let k = 0; k <= n; k++) { const a = k / n * PI; P.push([xc, -ry * Math.cos(a), -hz - ry * Math.sin(a)]); }
  P.pop(); P.push([xc, ry, -hz]);
  return P;
}
/* a quadratic hose from a to b through a control point c, n segments */
function quad3(a, c, b, n) { const P = []; for (let k = 0; k <= n; k++) { const u = k / n, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; P.push([w0 * a[0] + w1 * c[0] + w2 * b[0], w0 * a[1] + w1 * c[1] + w2 * b[1], w0 * a[2] + w1 * c[2] + w2 * b[2]]); } return P; }

/* ================= the mount above deck ================= */
/* M: the barbette ring on the deck, the fixed ring gear the train pinions walk round (internal teeth) */
function baseAbove() {
  const P = [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, 3.05], [.08, 3.05], [.08, 2.98]], {}),
    circ([0, .01, 0], [0, 1, 0], 3.45), circ([0, .01, 0], [0, 1, 0], 3.3, F()),
    ...Array.from({ length: 32 }, (_, k) => { const a = k / 32 * TAU; return G.cyl([Math.sin(a) * 3.15, 0, Math.cos(a) * 3.15], [Math.sin(a) * 3.15, .04, Math.cos(a) * 3.15], .028, F()); }),
  ];
  return P;
}
function ringGear() {
  const P = [G.lathe([0, .05, 0], [0, 1, 0], [[0, 2.62], [.15, 2.62], [.15, 2.5], [0, 2.5]], {})];
  const n = 112;
  for (let k = 0; k < n; k++) { const a = (k + .5) / n * TAU; P.push(boxY([Math.sin(a) * (RING_R + .02), .125, Math.cos(a) * (RING_R + .02)], [.026, .065, .03], a, F({ noEdge: true }))); }
  P.push(circ([0, .2, 0], [0, 1, 0], RING_R + .05, F()), circ([0, .05, 0], [0, 1, 0], RING_R + .05, F()));
  return P;
}
/* T: a cheek of the gunhouse (s: +1 starboard) with its access panels, crew door, louvres and seams */
const CHK = s => ({ xi: s * 1.1, xo: s * 2.75, xt: s * 2.42, yb: .3, yt: 3.1, z0: -4.5, z1: 3.0, t0: -4.3, t1: 1.4 });
function cheek(s) {
  const P = [], c = CHK(s), { xi, xo, xt, yb, yt, z0, z1, t0, t1 } = c;
  P.push(G.hex([[xi, yb, z0], [xo, yb, z0], [xo, yb, z1], [xi, yb, z1], [xi, yt, t0], [xt, yt, t0], [xt, yt, t1], [xi, yt, t1]], { ds: 1.6 }));
  const nO = V.norm([s * 2.8, .33, 0]);
  const fo = quadMap([xo, yb, z0], [xo, yb, z1], [xt, yt, t1], [xt, yt, t0], nO, .012);
  P.push(...panelOn(fo, .05, .17, .27, .76, {}, true), ...panelOn(fo, .3, .17, .52, .76, {}, true));
  P.push(...panelOn(fo, .57, .04, .68, .8, {}, true));                                        // crew door
  P.push(G.line([fo(.655, .38), fo(.655, .46)]));                                              // its handle
  for (let k = 0; k < 9; k++) P.push(G.line([fo(.73, .42 + k * .045), fo(.88, .42 + k * .045)], F()));   // louvres
  P.push(G.line([fo(.72, .4), fo(.89, .4), fo(.89, .82), fo(.72, .82), fo(.72, .4)]));
  P.push(G.line([fo(0, .86), fo(1, .86)]), G.line([fo(.285, 0), fo(.285, .86)], F()), G.line([fo(.545, 0), fo(.545, .86)], F()), G.line([fo(.7, 0), fo(.7, .86)], F()));
  // the roof: a hatch, walkway strips; the front slope: an inspection panel; the rear: a vent grille
  const fr = quadMap([xi, yt, t0], [xt, yt, t0], [xt, yt, t1], [xi, yt, t1], [0, 1, 0], .01);
  P.push(...panelOn(fr, .25, .12, .75, .3, F()));
  for (let k = 0; k < 6; k++) P.push(G.line([fr(.08, .4 + k * .1), fr(.92, .4 + k * .1)], F()));
  const ff = quadMap([xo, yb, z1], [xi, yb, z1], [xi, yt, t1], [xt, yt, t1], V.norm([0, 1.6, 2.8]), .012);
  P.push(...panelOn(ff, .2, .25, .8, .62, F()));
  const fb = quadMap([xi, yb, z0], [xo, yb, z0], [xt, yt, t0], [xi, yt, t0], [0, -.07, -1], .012);
  P.push(...panelOn(fb, .2, .15, .55, .7, F()));
  const gc = fb(.75, .55); P.push(circ(gc, [0, 0, 1], .28, F()), circ(gc, [0, 0, 1], .2, F()), circ(gc, [0, 0, 1], .1, F()));
  // the inner wall (the slot side): a service panel forward of the bearing
  const fi = quadMap([xi, yb, z1], [xi, yb, z0], [xi, yt, t0], [xi, yt, t1], [-s, 0, 0], .012);
  P.push(...panelOn(fi, .55, .1, .72, .6, F()));
  return P;
}
/* the cheeks as convex occluders (T frame corners, inset) */
const TUR_OCC = [-1, 1].map(s => { const c = CHK(s), i = .03 * s;
  return [[c.xi + i, c.yb + .03, c.z0 + .03], [c.xo - i, c.yb + .03, c.z0 + .03], [c.xo - i, c.yb + .03, c.z1 - .03], [c.xi + i, c.yb + .03, c.z1 - .03],
          [c.xi + i, c.yt - .03, c.t0 + .03], [c.xt - i, c.yt - .03, c.t0 + .03], [c.xt - i, c.yt - .03, c.t1 - .03], [c.xi + i, c.yt - .03, c.t1 - .03]]; });
/* T: the training structure: base skirt, floors, the rear bridge, trunnion bearings, the ram bases */
function gunBody() {
  const P = [];
  P.push(G.lathe([0, 0, 0], [0, 1, 0], [[0, 2.92], [.06, 2.92], [.06, 2.84], [.3, 2.84]], {}));
  for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; P.push(G.cyl([Math.sin(a) * 2.9, .14, Math.cos(a) * 2.9], [Math.sin(a) * 2.95, .14, Math.cos(a) * 2.95], .02, F())); }
  for (const s of [-1, 1]) P.push(G.box([s * 1.1, .26, -4.5], [s * 2.75, .3, 3.0], { skip: [2, 3, 4, 5], ds: 2.4 }));
  P.push(G.box([-1.1, .26, 1.62], [1.1, .3, 3.0], { skip: [2, 3, 4, 5], ds: 2 }));
  P.push(G.box([-1.1, 2.95, -4.3], [1.1, 3.1, -1.75], { ds: 1.6 }));
  P.push(G.box([-1.1, .3, -4.5], [1.1, 2.95, -4.36], { ds: 1.6 }));
  P.push(G.line([[-.5, .5, -4.51], [.5, .5, -4.51], [.5, 2.1, -4.51], [-.5, 2.1, -4.51], [-.5, .5, -4.51]], F()));
  for (const s of [-1, 1]) {
    P.push(G.lathe([s * 1.08, TRN[1], TRN[2]], [s, 0, 0], [[0, .42], [.3, .42]], { caps: true }));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, y = TRN[1] + Math.cos(a) * .35, z = TRN[2] + Math.sin(a) * .35; P.push(G.cyl([s * 1.08, y, z], [s * 1.03, y, z], .028, F())); }
    const b = RAM_E(s)[0]; P.push(G.box([b[0] - .14, .3, b[2] - .13], [b[0] + .14, .46, b[2] + .13]), G.cyl([b[0] - .16, .4, b[2]], [b[0] + .16, .4, b[2]], .04, F()));
  }
  return P;
}
/* T: inside the cheeks: the hydraulic power unit, accumulators and valve manifold (starboard), the helium
   compressors and the fire-control cabinet (port), the two train drive motors */
/* fluid lines in T: hydraulics (the valve manifold to the elevation rams and the train motors), helium (the compressors
   to the port trunnion's rotary union), coolant (the power column's rotary joint up to the starboard trunnion's) */
const HYD = [
  [[1.82, .5, -2.2], [1.3, .36, -1.8], [1.3, .36, 2.45], [.9, .38, 2.45], [.9, .44, 2.9]],
  [[1.82, .45, -2.0], [1.24, .33, -1.6], [1.24, .33, 2.75], [-.9, .33, 2.75], [-.9, .44, 2.9]],
  [[1.82, .58, -2.45], [1.36, .42, -1.95], [1.36, .42, 1.15], [1.7, .55, 1.15]],
  [[1.82, .62, -2.6], [1.42, .45, -2.1], [1.42, .45, 2.65], [-1.42, .45, 2.65], [-1.42, .45, 1.15], [-1.7, .55, 1.15]],
];
const HE_T = [-4.1 + .375, -3.2 + .375].map((z, i) => [[-1.7 - .05 * i, 1.32, z], [-1.7 - .05 * i, 1.8 + .06 * i, z], [-1.45 - .05 * i, 1.8 + .06 * i, -1.6], [-1.45 - .05 * i, 1.8 + .06 * i, .6], [-1.38, TRN[1] + .05 - .1 * i, TRN[2]]]);
const COOL_T = s => [[s * .2, -2.85, 0], [s * .2, -.2, 0], [1.25 + .1 * s, -.2, .3], [1.25 + .1 * s, .3, .4], [1.25 + .1 * s, 1.6, .5], [1.38, TRN[1] - .1 * s, TRN[2]]];
const HPU = { mot: [1.85, 1.38, -4.15], man: [1.6, .9, -2.2], acc: [-2.75, -2.35, -1.95].map(z => [2.32, .3, z]) };
const HEC = [-4.1, -3.2].map(z => [-1.88, 1.2, z + .375]);
function gunIn(g) {
  const P = [];
  if (g === 'h') {
  P.push(G.box([1.35, .3, -4.25], [2.35, 1.0, -3.05], { ds: 1.2 }));
  P.push(G.line([[2.36, .42, -3.4], [2.36, .92, -3.4]]), G.line([[2.36, .42, -3.36], [2.36, .92, -3.36]], F()), G.cyl([1.6, 1.0, -3.3], [1.6, 1.08, -3.3], .06, F()));
  P.push(G.lathe(HPU.mot, [0, 0, 1], [[0, .19], [.06, .21], [.55, .21], [.6, .17]], { caps: true }));
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, c = Math.cos(a), n = Math.sin(a), m = HPU.mot; P.push(G.line([[m[0] + c * .21, m[1] + n * .21, m[2] + .1], [m[0] + c * .245, m[1] + n * .245, m[2] + .12], [m[0] + c * .245, m[1] + n * .245, m[2] + .52], [m[0] + c * .21, m[1] + n * .21, m[2] + .54]], F())); }
  P.push(G.lathe([HPU.mot[0], HPU.mot[1], -3.55], [0, 0, 1], [[0, .1], [.12, .14], [.42, .14], [.46, .1]], { caps: true }));
  P.push(G.box([1.7, 1.0, -4.05], [2.0, 1.18, -3.2], F()));
  P.push(G.lathe([2.15, 1.0, -3.4], [0, 1, 0], [[0, .07], [.28, .07]], { caps: true }));
  for (const a of HPU.acc) {
    P.push(G.lathe(a, [0, 1, 0], [[0, .07], [.06, .12], [.14, .15], [1.0, .15], [1.12, .1], [1.2, .04]], { caps: true }));
    P.push(G.cyl([a[0], 1.5, a[2]], [a[0], 1.58, a[2]], .025, F()), G.box([a[0] - .15, .3, a[2] - .09], [a[0] + .15, .42, a[2] + .09], F()));
  }
  P.push(G.box([1.38, .3, -2.65], [1.82, .9, -1.75], { ds: 1.1 }));
  for (let k = 0; k < 4; k++) { const z = -2.55 + k * .24; P.push(G.cyl([1.82, .72, z], [1.98, .72, z], .05, F()), G.box([1.98, .66, z - .06], [2.08, .78, z + .06], F())); }
  for (let k = 0; k < 2; k++) P.push(circ([1.37, .62, -2.42 + k * .42], [1, 0, 0], .06, F()), circ([1.37, .62, -2.42 + k * .42], [1, 0, 0], .045, F()));
  for (const pl of HYD) P.push(...flex(pl, .018, F({ ds: .8 })));
  return P;
  }
  for (const c of HEC) {
    P.push(G.box([-2.35, .3, c[2] - .375], [-1.42, 1.2, c[2] + .375], { ds: 1.2 }));
    const g = [-2.36, .78, c[2]]; P.push(circ(g, [1, 0, 0], .25, F()), circ(g, [1, 0, 0], .17, F()), circ(g, [1, 0, 0], .08, F()));
    for (const dz of [-.12, .12]) P.push(G.cyl([-1.7, 1.2, c[2] + dz], [-1.7, 1.32, c[2] + dz], .035, F()));
  }
  P.push(G.box([-2.3, .3, -2.1], [-1.42, 1.95, -1.0], { ds: 1.2 }));
  P.push(G.panel([[-1.415, .5, -2.0], [-1.415, .5, -1.1], [-1.415, 1.85, -1.1], [-1.415, 1.85, -2.0]], F()));
  for (let k = 0; k < 6; k++) P.push(G.line([[-1.414, 1.55 - k * .1, -1.95], [-1.414, 1.55 - k * .1, -1.6]], F()));
  for (const p of TD_P) { P.push(G.lathe(p, [0, 1, 0], [[0, .2], [.05, .2], [.05, .14], [.45, .14], [.52, .1]], { caps: true })); P.push(G.cyl([p[0], p[1] + .3, p[2]], [p[0] - Math.sign(p[0]) * .22, p[1] + .3, p[2]], .03, F())); }
  for (const pl of HE_T) P.push(...pipes(pl, .024, F()));
  for (const s of [-1, 1]) P.push(...pipes(COOL_T(s).slice(3), .045));
  for (const s of [-1, 1]) P.push(G.lathe([s * 1.38, TRN[1], TRN[2]], [s, 0, 0], [[0, .09], [.14, .09]], { caps: true }));
  return P;
}
/* the sensors: the EO/IR director (pedestal T; yoke: the yaw frame at the pedestal top; head: the pitch frame) */
function eoBase() {
  const P = [G.lathe(EO_P, [0, 1, 0], [[0, .24], [.04, .24], [.04, .15], [.3, .15], [.3, .19], [.34, .19]], { caps: true })];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.cyl([EO_P[0] + Math.cos(a) * .21, EO_P[1], EO_P[2] + Math.sin(a) * .21], [EO_P[0] + Math.cos(a) * .21, EO_P[1] + .06, EO_P[2] + Math.sin(a) * .21], .015, F())); }
  return P;
}
function eoYoke() {
  const P = [G.lathe([0, 0, 0], [0, 1, 0], [[0, .18], [.05, .18]], { caps: true })];
  for (const s of [-1, 1]) P.push(G.box([s * .205, .04, -.08], [s * .245, EO_H - .34 + .08, .08]), G.cyl([s * .2, EO_H - .34, 0], [s * .27, EO_H - .34, 0], .055, F()));
  return P;
}
function eoHead() {
  const P = [G.box([-.18, -.14, -.16], [.18, .14, .18], { ds: 1.1 })];
  const win = [[-.085, .045, .058, 'TV'], [.085, .045, .066, 'IR'], [0, -.075, .032, 'LRF']];
  for (const [x, y, r] of win) P.push(G.lathe([x, y, .18], [0, 0, 1], [[0, r], [.05, r]], {}), circ([x, y, .232], [0, 0, 1], r * .78, F()), circ([x, y, .232], [0, 0, 1], r * .4, F()));
  P.push(G.box([-.2, .14, -.1], [.2, .165, .26], F()));
  P.push(G.line([[-.15, -.12, -.161], [.15, -.12, -.161]], F()), G.line([[-.15, -.06, -.161], [.15, -.06, -.161]], F()));
  return P;
}
const EO_WIN = [[-.085, .045, .232], [.085, .045, .232], [0, -.075, .232]];
/* the fire-control radar: mast (T), head (yaw frame at the mast top): drive, a tilted planar array */
function fcrBase() {
  const P = [G.box([FC_P[0] - .24, FC_P[1], FC_P[2] - .24], [FC_P[0] + .24, FC_P[1] + .05, FC_P[2] + .24]), G.lathe(FC_P, [0, 1, 0], [[0, .1], [.08, .1], [.08, .08], [FC_H, .08]], {})];
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; P.push(G.cyl([FC_P[0] + Math.cos(a) * .2, FC_P[1] + .05, FC_P[2] + Math.sin(a) * .2], [FC_P[0] + Math.cos(a) * .07, FC_P[1] + .4, FC_P[2] + Math.sin(a) * .07], .015, F())); }
  return P;
}
const FC_TILT = 12 * DEG, FC_A = X.make(R.x(-FC_TILT), [0, .36, .1]);   // the array plane in the head frame
function fcrHead() {
  const P = [G.lathe([0, 0, 0], [0, 1, 0], [[0, .15], [.14, .15], [.14, .1], [.2, .1]], { caps: true })];
  const A = [G.box([-.36, -.27, -.2], [.36, .27, 0], { ds: 1.2 })];
  for (let i = 0; i <= 12; i++) A.push(G.line([[-.33 + i * .055, -.24, .004], [-.33 + i * .055, .24, .004]], F()));
  for (let j = 0; j <= 9; j++) A.push(G.line([[-.33, -.24 + j * .0533, .004], [.33, -.24 + j * .0533, .004]], F()));
  A.push(G.line([[-.35, -.26, .006], [.35, -.26, .006], [.35, .26, .006], [-.35, .26, .006], [-.35, -.26, .006]]));
  A.push(G.box([-.1, -.12, -.36], [.1, .12, -.2], F()));
  P.push(...xfPrims(A, FC_A));
  P.push(G.box([-.06, .2, -.16], [.06, .3, -.04], F()));
  return P;
}
/* C: the cradle: trunnion pins, side frames, trough, recoil buffers, elevation ram lugs, the loader frame behind the
   breech (tray bosses, the chain rammer's housing and motor), the muzzle velocity radar's bridge and the radar */
function cradle() {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(G.cyl([s * .7, 0, 0], [s * 1.36, 0, 0], .2, { caps: true }));
    P.push(G.box([s * .64, -.62, -2.1], [s * .72, .46, 2.7], { ds: 2.6 }));
    for (const z of [-1.7, -.9, .9, 1.7, 2.5]) P.push(G.box([s * .72, -.6, z], [s * .78, .44, z + .07], F()));
    P.push(G.lathe([s * .72, 0, 0], [s, 0, 0], [[0, .36], [.06, .36]], {}));
    const p = RAM_E(s)[1]; P.push(G.box([p[0] - .13, p[1] - .12, p[2] - .1], [p[0] - .1, p[1] + .12, p[2] + .1]), G.box([p[0] + .1, p[1] - .12, p[2] - .1], [p[0] + .13, p[1] + .12, p[2] + .1]), G.box([s * .72, p[1] - .06, p[2] - .1], [p[0] - .13, p[1] + .06, p[2] + .1]));
    P.push(G.lathe([s * .5, -.5, -1.6], [0, 0, 1], [[0, .08], [.06, .08], [.06, .07], [1.85, .07], [1.9, .08]], { caps: true }));
    P.push(G.box([s * .64, -.58, -1.7], [s * .58, -.42, -1.55], F()));
    P.push(G.box([s * .32, -.12, -5.2], [s * .38, .12, -2.98], { ds: 1.4 }), G.cyl([s * .38, 0, TRAY_Z], [s * .48, 0, TRAY_Z], .075, F()));
    P.push(G.box([s * .38, -.1, -3.1], [s * .46, .1, -2.98], F()));
  }
  P.push(G.box([-.72, -.68, -2.1], [.72, -.62, 2.7], { ds: 2.2 }));
  P.push(G.box([-.38, -.12, -5.3], [.38, .12, -5.2]));
  P.push(G.box([-.17, -.22, -5.2], [.17, .16, -4.74], { ds: 1.1 }));
  P.push(G.lathe([.17, -.03, -4.97], [1, 0, 0], [[0, .11], [.04, .13], [.3, .13], [.34, .1]], { caps: true }));
  P.push(G.box([-.06, -.2, -4.75], [.06, .14, -4.7], F()));
  for (const s of [-1, 1]) P.push(G.box([s * .66, .46, 2.64], [s * .71, .92, 2.8]));
  P.push(G.box([-.71, .92, 2.62], [.71, .98, 2.82]));
  P.push(G.box([-.12, .98, 2.58], [.12, 1.14, 2.86], { ds: 1.1 }));
  P.push(G.panel([[-.1, 1.0, 2.865], [.1, 1.0, 2.865], [.1, 1.12, 2.865], [-.1, 1.12, 2.865]], F({ fill: true, ds: .7 })));
  P.push(circ([0, 1.06, 2.87], [0, 0, 1], .045, F()));
  P.push(...flex(quad3([.12, 1.06, 2.62], [.5, 1.1, 2.3], [.71, .95, 2.0], 8), .012));
  // the coolant (starboard trunnion -> the breech) and the helium (port trunnion -> the headers) along the cradle
  for (const d of [-.06, .06]) P.push(...pipes([[.72, -.2 + d, 0], [.6, -.58, -.4 + d], [.6, -.58, -2.0], [.6, -.52, -2.5 + d]], .03, F()));
  for (const d of [-.04, .04]) P.push(...pipes([[-.72, .2 + d, 0], [-.62, .55, -.3 + d], [-.62, .55, -1.85], [-.2, .5 + d, -2.02]], .02, F()));
  return P;
}
/* B: the barrel: breech guides and the feed section with its two current injection blocks, the containment, the
   preload clamp collars and tie bolts, the cryostats with their current lead towers and pump-out ports, the helium
   headers and the coolant manifold with a stub at each station, the recoil rods, the muzzle block and arc shunt */
function barrel() {
  const P = [];
  for (const s of [-1, 1]) P.push(G.box([s * .46, -1.34, -2.98], [s * .56, .58, -2.42], { ds: 1.3 }));
  P.push(G.box([-.56, .5, -2.98], [.56, .58, -2.42], { ds: 1.3 }), G.box([-.56, -1.4, -2.98], [.56, -1.34, -2.42], { ds: 1.3 }));
  P.push(G.box([-.52, -.52, -2.42], [.52, .52, -1.72], { ds: 1.3 }));
  for (const s of [-1, 1]) {
    P.push(G.box([s * .52, -.32, -2.34], [s * .72, .32, -1.8], { ds: 1.1 }));
    for (const y of [-.2, 0, .2]) for (const z of [-2.2, -1.94]) P.push(G.cyl([s * .72, y, z], [s * .79, y, z], .032, F()), G.cyl([s * .79, y, z], [s * .81, y, z], .05, F()));
  }
  // containment (a tube of four plates), its seams
  P.push(G.box([-CX, -CY, -1.72], [CX, CY, RZ1], { skip: [2, 4], ds: 2.2 }));
  for (const z of STN) for (const s of [-1, 1]) P.push(G.line([[s * (CX + .002), -CY, z], [s * (CX + .002), CY, z]], F()));
  // the clamp bands: half-collars top and bottom, tie bolts each side, their nuts
  for (const zb of BANDS) {
    const z0 = zb, z1 = zb + .1, zm = zb + .05;
    P.push(G.box([-.56, CY, z0], [.56, .46, z1], { ds: 1.5 }), G.box([-.56, -.46, z0], [.56, -CY, z1], { ds: 1.5 }));
    for (const s of [-1, 1]) {
      P.push(G.cyl([s * .53, -.5, zm], [s * .53, .5, zm], .022, F()));
      for (const y of [-1, 1]) P.push(G.lathe([s * .53, y * .46, zm], [0, y, 0], [[0, .042], [.05, .042]], F({ caps: true })));
    }
  }
  // cryostats (sparse shells: the coils show through), current lead towers, pump-out ports, the flanges
  for (const zc of STN) for (const s of [-1, 1]) {
    P.push(G.box([s * KX0, -KY, zc - KZ], [s * KX1, KY, zc + KZ], { ds: 2.0 }));
    for (const z of [zc - KZ + .03, zc + KZ - .03]) P.push(G.line([[s * KX1 + s * .004, -KY, z], [s * KX1 + s * .004, KY, z]], F()), G.line([[s * KX0, KY + .004, z], [s * KX1, KY + .004, z]], F()));
    P.push(G.lathe([s * .45, KY, zc + .22], [0, 1, 0], [[0, .04], [.16, .04], [.2, .028]], { caps: true }));
    P.push(G.cyl([s * KX1, -.18, zc + .2], [s * (KX1 + .06), -.18, zc + .2], .03, F()), G.cyl([s * (KX1 + .06), -.18, zc + .2], [s * (KX1 + .08), -.18, zc + .2], .045, F()));
  }
  // helium headers along the top, a flex line from each cold head down to them
  for (const s of [-1, 1]) {
    P.push(G.cyl([s * .17, .48, -2.0], [s * .17, .48, RZ1 - .2], .026, {}));
    for (const zc of STN) { const z = zc - .14; P.push(...flex(quad3([s * .5, KY + .3, z], [s * .32, KY + .34, z], [s * .17, .5, z], 6), .012)); }
  }
  // the rails' coolant manifold: supply and return under the barrel, a stub up into the containment at each station
  for (const s of [-1, 1]) {
    P.push(G.cyl([s * .12, -.52, -2.25], [s * .12, -.52, RZ1 - .1], .04, {}));
    for (const zc of STN) P.push(G.cyl([s * .12, -.48, zc], [s * .12, -.36, zc], .022, F()), G.lathe([s * .12, -.52, zc], [0, 1, 0], [[-.055, .052], [.055, .052]], F()));
    P.push(...flex(quad3([s * .12, -.52, -2.25], [s * .3, -.75, -2.5], [s * .6, -.5, -2.6], 8), .035));
  }
  // recoil rods (into the cradle's buffers) and their lugs on the band at the third station
  const zl = BANDS[3];
  for (const s of [-1, 1]) P.push(G.cyl([s * .5, -.5, .1], [s * .5, -.5, zl], .035, {}), G.box([s * .44, -.6, zl], [s * .56, -.46, zl + .1]));
  // the muzzle block: the arc shunt's vents, the front face round the bore, the cover's hinge knuckles
  P.push(G.box([-.5, -.5, SLV0], [.5, .5, SLV1], { skip: [4], ds: 1.3 }));
  for (const [a, b, c, d] of [[[-.5, -.5], [.5, -.5], [.14, -.14], [-.14, -.14]], [[.5, -.5], [.5, .5], [.14, .14], [.14, -.14]], [[.5, .5], [-.5, .5], [-.14, .14], [.14, .14]], [[-.5, .5], [-.5, -.5], [-.14, -.14], [-.14, .14]]])
    P.push(G.panel([[a[0], a[1], SLV1], [b[0], b[1], SLV1], [c[0], c[1], SLV1], [d[0], d[1], SLV1]], { fill: true, ds: 1.2 }));
  P.push(G.line([[-.14, -.14, SLV1 + .002], [.14, -.14, SLV1 + .002], [.14, .14, SLV1 + .002], [-.14, .14, SLV1 + .002], [-.14, -.14, SLV1 + .002]]));
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z = SLV0 + .12 + k * .12; P.push(G.line([[s * .505, -.32, z], [s * .505, .32, z]], F()), G.line([[s * .505, -.32, z + .05], [s * .505, .32, z + .05]], F())); }
  for (const s of [-1, 1]) for (const x of [-.4, -.05, .3]) P.push(G.cyl([x, s * .5, SLV1 + .02], [x + .12, s * .5, SLV1 + .02], .025, F()));
  return P;
}
/* B: the rails (copper), the insulating sidewalls (their own cloud: lit apart) */
const railPrims = () => [G.box([-RW, RY0, RZ0], [RW, RY1, SLV1 - .01], { ds: .9 }), G.box([-RW, -RY1, RZ0], [RW, -RY0, SLV1 - .01], { ds: .9 })];
const insPrims = () => [-1, 1].map(s => G.box([s * IX0, -RY0, RZ0], [s * IX1, RY0, SLV1 - .01], { ds: 1.2 }));
/* station frame (B, centred on a station): the two racetrack coils' winding packs, their turns, the formers */
function coilPrims() {
  const P = [];
  for (const s of [-1, 1]) {
    const path = racetrack(s * CXC, .25, .14, 12);
    for (let i = 0; i < path.length - 1; i++) if (V.dist(path[i], path[i + 1]) > 1e-4) P.push(bar(path[i], path[i + 1], .034, .075, [1, 0, 0], { ds: 1.2 }));
    for (const dx of [-.024, 0, .024]) P.push(G.line(racetrack(s * CXC + dx, .268, .14, 18), F()));
    for (const dr of [-.008, .008]) P.push(G.line(racetrack(s * (CXC + .039), .25 + dr, .14, 18), F()));
    P.push(G.box([s * (CXC - .02), -.19, -.14], [s * (CXC + .02), .19, .14], F({ ds: 1.4 })));
  }
  return P;
}
/* B: the cryocoolers (a pulse-tube cold head on each cryostat: flange, regenerator, cold head, the motor and rotary
   valve on top with its cooling fins) */
const COLD = []; for (const zc of STN) for (const s of [-1, 1]) COLD.push([s * .5, KY, zc - .14]);
function cryoPrims() {
  const P = [];
  for (const c of COLD) {
    P.push(G.lathe(c, [0, 1, 0], [[0, .09], [.03, .09]], { caps: true }));
    P.push(G.lathe([c[0], c[1] + .03, c[2]], [0, 1, 0], [[0, .045], [.2, .045], [.2, .07], [.34, .07], [.36, .05]], { caps: true }));
    for (let k = 0; k < 5; k++) P.push(circ([c[0], c[1] + .24 + k * .022, c[2]], [0, 1, 0], .082, F()));
    P.push(G.cyl([c[0], c[1] + .1, c[2]], [c[0] - Math.sign(c[0]) * .085, c[1] + .1, c[2]], .012, F()));
  }
  return P;
}
const FROST = { pts: null };
/* frost: seeded points on the cold heads, their flex lines and the helium headers (drawn with keep = the frost) */
function frostCloud() {
  const r = M3.rng(7741), A = [];
  const push = (x, y, z) => A.push(x, y, z, 0, 0, 0);
  for (const c of COLD) {
    for (let i = 0; i < 320; i++) { const a = r() * TAU, y = .035 + .2 * Math.pow(r(), 1.5), rr = .052 + .032 * r() * r(); push(c[0] + Math.cos(a) * rr, c[1] + y, c[2] + Math.sin(a) * rr); }
    for (let i = 0; i < 90; i++) { const a = r() * TAU, rr = .03 + .065 * Math.sqrt(r()); push(c[0] + Math.cos(a) * rr, c[1] + .032 + .006 * r(), c[2] + Math.sin(a) * rr); }
    const P = quad3([c[0], KY + .3, c[2]], [c[0] * .64, KY + .34, c[2]], [Math.sign(c[0]) * .17, .5, c[2]], 24);
    for (let i = 0; i < 80; i++) { const k = Math.floor(r() * 24), u = r(), a = r() * TAU, p = V.lerp(P[k], P[k + 1], u), rr = .016 + .014 * r(); push(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr, p[2] + (r() - .5) * .01); }
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3200; i++) { const z = -2.0 + r() * (RZ1 - 1.8), a = r() * TAU, rr = .029 + .02 * r() * r(); push(s * .17 + Math.cos(a) * rr, .48 + Math.sin(a) * rr, z); }
  const pts = new Float32Array(A); FROST.pts = pts;
  return K.lodCloud([.006, .012, .024, .048, .096].map((sp, li) => { const st = 1 << li, o = []; for (let i = 0; i < pts.length / 6; i += st) for (let q = 0; q < 6; q++) o.push(pts[i * 6 + q]); return { sp, pts: new Float32Array(o) }; }), .8);
}
/* B: a preload clamp's wedge jaw at a band (s side; slides out s * 0.05 when unlocked) */
const jaw = s => [G.box([s * .362, -.3, .012], [s * .45, .3, .088]), G.box([s * .45, -.07, .02], [s * .49, .07, .08], F()), G.line([[s * .451, -.25, .05], [s * .451, .25, .05]], F())];
/* B: the sliding breech block (drops down its guides, B -y), its obturator ring and lifting lug */
function breechBlock() {
  return [G.box([-.44, -.44, -2.96], [.44, .44, -2.44], { ds: 1.2 }), circ([0, 0, -2.435], [0, 0, 1], .2, F()), circ([0, 0, -2.435], [0, 0, 1], .17, F()),
          G.line([[-.3, .3, -2.965], [.3, .3, -2.965], [.3, -.3, -2.965], [-.3, -.3, -2.965], [-.3, .3, -2.965]], F()), G.box([-.08, -.5, -2.8], [.08, -.44, -2.6], F())];
}
/* B: the muzzle cover's leaves (top +1 / bottom -1), hinged on the outer edge of the muzzle face */
const PETAL_HINGE = s => [0, s * .5, SLV1 + .02];
function petal(s) {
  const y0 = s > 0 ? 0 : -.5, y1 = s > 0 ? .5 : 0;
  return [G.box([-.5, y0, SLV1], [.5, y1, SLV1 + .05], { ds: 1.2 }), G.line([[-.42, s * .25, SLV1 + .052], [.42, s * .25, SLV1 + .052]], F()),
          ...[-.25, .1, .45].map(x => G.cyl([x - .1, s * .5, SLV1 + .02], [x, s * .5, SLV1 + .02], .025, F()))];
}
/* C (the tray's pivot = the round's centre, the round along +Z): a trough for the 2 m round, its grip latches and
   the stub pins it swings on */
function tray() {
  const P = [G.box([-.18, -.2, -1.12], [.18, -.16, 1.12], { ds: 1.1 })];
  for (const s of [-1, 1]) P.push(G.box([s * .16, -.16, -1.12], [s * .19, .02, 1.12], { ds: 1.1 }), G.cyl([s * .19, 0, 0], [s * .32, 0, 0], .05, {}), G.box([s * .19, -.1, -.12], [s * .25, .1, .12], F()));
  for (const z of [-.8, 0, .8]) for (const s of [-1, 1]) P.push(G.box([s * .16, .02, z - .05], [s * .18, .1, z + .05], F()), G.box([s * .05, .1, z - .05], [s * .18, .13, z + .05], F()));
  for (let k = 0; k < 11; k++) P.push(G.line([[-.15, -.159, -1.0 + k * .2], [.15, -.159, -1.0 + k * .2]], F()));
  return P;
}
/* C: the rammer's head (local: its face at z 0, pushing +Z) */
const rammerHead = () => [G.lathe([0, 0, -.12], [0, 0, 1], [[0, .1], [.1, .12], [.12, .12]], { caps: true }), G.box([-.07, -.17, -.2], [.07, -.08, -.04], F())];
/* a hydraulic ram (local: the base at the origin, +Z toward the pin): the cylinder; the rod (local: the pin end
   at the origin, +Z away from the base, the rod running back down -Z into the cylinder) */
const ramCyl = () => [G.lathe([0, 0, -.1], [0, 0, 1], [[0, .06], [.1, .06], [.1, .115], [.18, .115], [.18, .1], [1.2, .1], [1.25, .118], [1.33, .118], [1.33, .07]], { caps: true }), G.box([-.05, -.09, -.16], [.05, .09, -.06], F()),
                      G.cyl([.1, 0, .25], [.16, 0, .25], .025, F()), G.cyl([.1, 0, 1.15], [.16, 0, 1.15], .025, F())];
const ramRod = () => [G.cyl([0, 0, -1.5], [0, 0, -.08], .055, {}), G.lathe([0, 0, -.08], [0, 0, 1], [[0, .07], [.1, .07]], { caps: true }), G.cyl([-.08, 0, 0], [.08, 0, 0], .065, { caps: true })];
/* a train drive's pinion (local: centre, axis Y) */
function trainPinion() {
  const P = [G.lathe([0, -.07, 0], [0, 1, 0], [[0, PIN_R - .02], [.14, PIN_R - .02]], { caps: true }), G.cyl([0, .07, 0], [0, .3, 0], .045, {})];
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; P.push(boxY([Math.sin(a) * PIN_R, 0, Math.cos(a) * PIN_R], [.022, .065, .028], a, F({ noEdge: true }))); }
  P.push(G.line([[0, .072, 0], [0, .072, PIN_R - .03]], F()));
  return P;
}

/* ================= the round (the film's own: drawn until the round module's RGR.draw is there) =================
   local: the rod's middle at the origin, +Z the nose (pc_scan_railgun_round.js) */
const RGRS = window.RGR || { ROD_R: .0125, SAB_R: .14, SAB_Z0: -.62, SAB_Z1: .48 };
function round_() {
  const r = RGRS.ROD_R || .0125;
  const P = [G.lathe([0, 0, -1.0], [0, 0, 1], [[0, r * .8], [.02, r], [1.86, r], [1.92, r * .7], [2.0, .002]], { caps: true, ds: .5 })];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(G.panel([[Math.cos(a) * r, Math.sin(a) * r, -.98], [Math.cos(a) * .035, Math.sin(a) * .035, -.98], [Math.cos(a) * .035, Math.sin(a) * .035, -.9], [Math.cos(a) * r, Math.sin(a) * r, -.82]], { fill: true, ds: .4 })); }
  return P;
}
/* a round stowed in a cell (cheap: one sparse cloud): the sabot's shell and seams, the armature, the rod's ends */
function roundStowed() {
  const P = [G.lathe([0, 0, -.7], [0, 0, 1], [[0, .12], [.08, .14], [1.18, .14], [1.18, .016], [1.88, .0125], [1.94, .009], [2.0, .002]], { caps: true, ds: 1.6 })];
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + PI / 2; P.push(G.line([[Math.cos(a) * .141, Math.sin(a) * .141, -.62], [Math.cos(a) * .141, Math.sin(a) * .141, .48]], F())); }
  P.push(G.lathe([0, 0, -1.0], [0, 0, 1], [[0, .0125], [.3, .0125]], {}));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(G.line([[Math.cos(a) * .0125, Math.sin(a) * .0125, -.98], [Math.cos(a) * .035, Math.sin(a) * .035, -.95], [Math.cos(a) * .0125, Math.sin(a) * .0125, -.84]], F())); }
  return P;
}
/* a sabot segment (one of three round the rod, centred on +X): a 120° shell from the bore wall in to the rod */
const SAB_A = 60 * DEG;
function sabotPetal() {
  const P = [], n = 6, z0 = RGRS.SAB_Z0 || -.62, z1 = RGRS.SAB_Z1 || .48, R1 = RGRS.SAB_R || .14, R0 = .016;
  const at = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  for (let k = 0; k < n; k++) {
    const a0 = -SAB_A + 2 * SAB_A * k / n + .02, a1 = -SAB_A + 2 * SAB_A * (k + 1) / n - .02;
    P.push(G.hex([at(a0, R1 - .02, z0), at(a1, R1 - .02, z0), at(a1, R1 - .02, z1), at(a0, R1 - .02, z1), at(a0, R1, z0), at(a1, R1, z0), at(a1, R1, z1), at(a0, R1, z1)], { ds: .6 }));
  }
  for (const z of [z0, z1]) P.push(G.panel([at(-SAB_A, R0, z), at(SAB_A, R0, z), at(SAB_A, R1, z), at(-SAB_A, R1, z)], { fill: true, ds: .6 }));
  for (const z of [z0 + .12, -.1, .25]) { const L = []; for (let k = 0; k <= 12; k++) L.push(at(-SAB_A + 2 * SAB_A * k / 12, R1 + .002, z)); P.push(G.line(L, F())); }
  return P;
}
/* the armature on the sabot's rear face: a block whose pads bear on the rails (top and bottom) */
function armature() {
  const z0 = (RGRS.SAB_Z0 || -.62) - .08, z1 = (RGRS.SAB_Z0 || -.62), P = [];
  P.push(G.box([-.12, -.1, z0], [.12, .1, z1], { ds: .6 }));
  for (const s of [-1, 1]) { P.push(G.box([-.12, s > 0 ? .1 : -.138, z0 - .02], [.12, s > 0 ? .138 : -.1, z1], { ds: .6 })); for (const x of [-.08, 0, .08]) P.push(G.line([[x, s * .139, z0 - .015], [x, s * .139, z1 - .005]], F())); }
  return P;
}

/* ================= under the deck ================= */
/* M (fixed): the power column with the coolant pipes in it, the slip rings' brush housing, the coolant rotary joint */
const yF = FL - GY;
function baseBelow() {
  const P = [];
  P.push(G.cyl([0, yF, 0], [0, -2.4, 0], .45, { ds: 2.6 }));
  for (const y of [yF + .2, yF + 1.3, yF + 2.6, yF + 3.6]) P.push(G.lathe([0, y, 0], [0, 1, 0], [[0, .5], [.08, .5]], {}));
  for (const s of [-1, 1]) P.push(G.cyl([s * .2, yF - .25, 0], [s * .2, -2.85, 0], .06, {}));
  P.push(G.lathe([0, -2.95, 0], [0, 1, 0], [[0, .3], [.08, .38], [.3, .38], [.38, .3]], { caps: true }));     // coolant rotary joint
  P.push(G.lathe([0, -2.4, 0], [0, 1, 0], [[0, .66], [.7, .66]], { ds: 1.4 }));                               // brush housing
  for (const y of [-2.32, -2.18, -2.04, -1.9, -1.76]) P.push(circ([0, y, 0], [0, 1, 0], .68, F()));
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P.push(G.box([Math.sin(a) * .66 - .03, -2.36, Math.cos(a) * .66 - .03], [Math.sin(a) * .66 + .03, -1.72, Math.cos(a) * .66 + .03], F())); }
  return P;
}
function rollerPath() {
  const P = [G.lathe([0, -.95, 0], [0, 1, 0], [[0, 2.7], [.62, 2.7], [.62, 2.3]], { ds: 1.4 }), circ([0, -.95, 0], [0, 1, 0], 2.3)];
  for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, c = Math.cos(a), s = Math.sin(a); P.push(G.cyl([c * 2.34, -.64, s * 2.34], [c * 2.66, -.64, s * 2.66], .08, F())); }
  return P;
}
/* T (training, under the deck): the collector rings and the two bus trunks up to the gunhouse, the hoist trunk (guides,
   chain, sprockets), the rotating coolant pipes up to the starboard trunnion */
const BUS_ANCH = [-1, 1].map(s => [s * 1.0, .42, -.6]);          // the flexible straps' fixed ends (T)
const FEED_B = [-1, 1].map(s => [s * .81, 0, -2.07]);            // ... and their ends on the injection blocks (B)
function trunkT() {
  const P = [];
  P.push(G.lathe([0, -1.62, 0], [0, 1, 0], [[0, .72], [.24, .72]], { ds: 1.2 }));
  for (const y of [-1.58, -1.5, -1.42]) P.push(circ([0, y, 0], [0, 1, 0], .735, F()));
  for (const s of [-1, 1]) P.push(...bars([[s * .6, -1.45, 0], [s * .8, -1.2, -.2], [s * .95, .1, -.55], [s * 1.0, .38, -.6]], .16, .06, [0, 0, 1], { ds: 1.1 }));
  // the hoist trunk: two guides, crossheads, the chain sprockets top and bottom, the drive motor
  const y0 = HY0 - 1.15, y1 = HY1 + 1.2, z = HZ;
  for (const s of [-1, 1]) P.push(G.box([s * .2 - .025, y0, z - .025], [s * .2 + .025, y1, z + .025]), G.box([s * .2 - .01, y0, z + .025], [s * .2 + .01, y1, z + .06], F()));
  for (let y = y0 + .4; y < y1 - .2; y += .7) P.push(G.box([-.24, y, z + .06], [.24, y + .04, z + .1], F()), G.box([-.24, y, z - .1], [-.18, y + .04, z + .06], F()), G.box([.18, y, z - .1], [.24, y + .04, z + .06], F()));
  for (const y of [y0 + .05, y1 - .05]) P.push(G.lathe([-.06, y, z + .17], [1, 0, 0], [[0, .1], [.12, .1]], { caps: true }));
  P.push(G.lathe([.06, y1 - .05, z + .17], [1, 0, 0], [[0, .08], [.25, .08]], { caps: true }));
  P.push(G.line([[0, y0 + .05, z + .27], [0, y1 - .05, z + .27]], F()), G.line([[0, y0 + .05, z + .07], [0, y1 - .05, z + .07]], F()));
  // the coolant rising through the training structure to the starboard trunnion's rotary union
  for (const s of [-1, 1]) P.push(...pipes(COOL_T(s).slice(0, 4), .045));
  return P;
}
/* T: the hoist's carriage (local: the round's centre, the round standing): two grippers round the sabot, the cup
   under the tail, the shoes in the guides */
function carriage() {
  const P = [];
  for (const y of [-.35, .32]) for (const s of [-1, 1]) { const L = []; for (let k = 0; k <= 8; k++) { const a = (k / 8 - .5) * 2.2 + (s > 0 ? 0 : PI); L.push([Math.cos(a) * .16, y, Math.sin(a) * .16]); } P.push(...bars(L, .04, .06, [0, 1, 0], F())); }
  P.push(G.lathe([0, -1.04, 0], [0, 1, 0], [[0, .12], [.08, .12]], { caps: true }));
  for (const s of [-1, 1]) P.push(G.box([s * .17, -1.05, -.04], [s * .23, .4, .04]), G.box([s * .14, -1.05, -.03], [s * .17, -.97, .03], F()));
  P.push(G.box([-.23, .36, .03], [.23, .42, .1]), G.box([-.23, -1.1, .03], [.23, -1.04, .1]));
  return P;
}
/* ship (local: the column's axis, the drum's base at y 0): the magazine drum: base, cells (open cages: the rounds
   show), top ring, its ring gear; it indexes one cell at a time */
function drum() {
  const P = [G.lathe([0, 0, 0], [0, 1, 0], [[0, 1.32], [.08, 1.32], [.08, .62], [0, .62]], { ds: 2.6 }), G.lathe([0, 2.35, 0], [0, 1, 0], [[0, 1.32], [.06, 1.32], [.06, .62], [0, .62]], { edgeOnly: true })];
  for (let k = 0; k < NCELL; k++) { const a = (k + .5) / NCELL * TAU; P.push(boxY([Math.sin(a) * .97, 2.38, Math.cos(a) * .97], [.025, .03, .35], a, F()), boxY([Math.sin(a) * .97, .04, Math.cos(a) * .97], [.025, .04, .35], a, F())); }
  P.push(G.cyl([0, .08, 0], [0, 2.35, 0], .62, { ds: 2.8 }));
  for (let k = 0; k < NCELL; k++) {
    const a = k / NCELL * TAU, x = Math.sin(a) * DRUM_R, z = Math.cos(a) * DRUM_R, c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < 4; j++) { const b = a + (j + .5) / 4 * TAU; P.push(G.line([[x + Math.sin(b) * .17, .08, z + Math.cos(b) * .17], [x + Math.sin(b) * .17, 2.35, z + Math.cos(b) * .17]])); }
    for (const y of [.1, .7, 1.4, 2.1, 2.33]) P.push(circ([x, y, z], [0, 1, 0], .17, y > .2 && y < 2.3 ? F() : {}));
    P.push(G.lathe([x, .08, z], [0, 1, 0], [[0, .14], [.05, .14]], { caps: true }));
    P.push(G.box([x * .7 - c * .02, .08, z * .7 + s * .02], [x * .7 + c * .02, 2.35, z * .7 - s * .02], F()));
  }
  for (let k = 0; k < 96; k++) P.push(boxY([Math.sin(k / 96 * TAU) * 1.35, .04, Math.cos(k / 96 * TAU) * 1.35], [.022, .04, .03], k / 96 * TAU, F({ noEdge: true })));
  return P;
}
const PIN_P = [-1.0, FL + .09, GZ - 1.12];                    // the drum's drive pinion (ship)
function pinion() {
  const P = [G.lathe([0, -.04, 0], [0, 1, 0], [[0, .16], [.08, .16]], { caps: true }), G.lathe([0, .04, 0], [0, 1, 0], [[0, .12], [.5, .12], [.55, .09]], { caps: true })];
  for (let k = 0; k < 12; k++) P.push(boxY([Math.sin(k / 12 * TAU) * .18, 0, Math.cos(k / 12 * TAU) * .18], [.02, .04, .03], k / 12 * TAU, F({ noEdge: true })));
  P.push(G.line([[0, .045, 0], [0, .045, .14]]));
  return P;
}

/* ================= the power room (ship frame) ================= */
const ALT = [[2.3, 2.45, 42.2], [-2.3, 2.45, 42.2], [2.3, 2.45, 45.0], [-2.3, 2.45, 45.0]];
const ALT_FLIP = [true, true, false, false];              // aft units face aft (the exciter on the outer end)
const XALT = 2;                                           // the unit that comes apart
/* a pulsed alternator (A frame: centre, axis +Z toward the exciter end): skid, pedestals, stator (core, 24 coil
   sides, their end turns), the inner end bell, terminal box and its three leads */
function altBody() {
  const P = [];
  P.push(G.box([-1.0, -1.15, -1.25], [1.0, -1.0, 1.25], { skip: [2, 3, 4, 5] }));
  for (const z of [-.9, .9]) P.push(G.box([-.28, -1.0, z - .1], [.28, -.2, z + .1]), G.lathe([0, -.2, z - .1], [0, 0, 1], [[0, .16], [.2, .16]], F()));
  for (const s of [-1, 1]) P.push(G.box([s * .7, -1.0, -.62], [s * .9, -.6, .62]), ...[-.45, 0, .45].map(z => G.cyl([s * .8, -.6, z], [s * .8, -.55, z], .03, F())));
  P.push(G.lathe([0, 0, -.7], [0, 0, 1], [[0, .99], [1.4, .99]], { ds: 2.6 }));
  for (let k = 0; k < 24; k++) {
    const a = (k + .5) / 24 * TAU, c = Math.cos(a), sn = Math.sin(a);
    P.push(G.line([[c * .89, sn * .89, -.68], [c * .89, sn * .89, .68]]), G.line([[c * .93, sn * .93, -.68], [c * .93, sn * .93, .68]], F()));
    for (const e of [-1, 1]) { const L = []; for (let j = 0; j <= 8; j++) { const u = j / 8, b = a + u * 3 / 24 * TAU; L.push([Math.cos(b) * .91, Math.sin(b) * .91, e * (.68 + .12 * Math.sin(u * PI))]); } P.push(G.line(L, F())); }
  }
  for (const z of [-.62, 0, .62]) P.push(G.lathe([0, 0, z - .035], [0, 0, 1], [[0, .99], [.07, .99]], {}));
  P.push(G.box([-.32, .9, -.28], [.32, 1.28, .28]), G.panel([[-.25, 1.0, .285], [.25, 1.0, .285], [.25, 1.2, .285], [-.25, 1.2, .285]], F()));
  for (const x of [-.18, 0, .18]) P.push(G.cyl([x, 1.28, 0], [x, 1.42, 0], .04, F()), G.lathe([x, 1.42, 0], [0, 1, 0], [[0, .055], [.04, .055]], F({ caps: true })));
  P.push(G.lathe([0, 0, -.7], [0, 0, -1], [[0, .95], [.08, .93], [.26, .5], [.34, .2]], { caps: true, ds: 2.6 }));
  P.push(G.cyl([0, 0, -1.04], [0, 0, -1.14], .18, {}));
  return P;
}
function altBell() {
  const P = [G.lathe([0, 0, .7], [0, 0, 1], [[0, .95], [.08, .93], [.26, .5], [.34, .2]], { caps: true, ds: 1.6 }), G.cyl([0, 0, 1.04], [0, 0, 1.14], .18, {})];
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P.push(G.cyl([Math.cos(a) * .9, Math.sin(a) * .9, .7], [Math.cos(a) * .9, Math.sin(a) * .9, .77], .025, F())); }
  for (let k = 0; k < 6; k++) { const a = (k + .5) / 6 * TAU; P.push(G.line([[Math.cos(a) * .35, Math.sin(a) * .35, .99], [Math.cos(a) * .85, Math.sin(a) * .85, .8]], F())); }
  return P;
}
function altExciter() {
  const P = [G.lathe([0, 0, 1.14], [0, 0, 1], [[0, .46], [.36, .46]], {}), G.lathe([0, 0, 1.5], [0, 0, 1], [[0, .48], [.14, .48]], {})];
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(G.line([[Math.cos(a) * .47, Math.sin(a) * .47, 1.16], [Math.cos(a) * .47, Math.sin(a) * .47, 1.48]], F())); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; P.push(G.line([[Math.cos(a) * .12, Math.sin(a) * .12, 1.64], [Math.cos(a) * .48, Math.sin(a) * .48, 1.64]], F())); }
  return P;
}
const altFan = () => [G.blades([0, 0, 1.58], [0, 0, 1], 7, .09, .43, { chord: .55, pitch: .25 }), G.lathe([0, 0, 1.54], [0, 0, 1], [[0, .09], [.1, .09]], { caps: true })];
/* the rotor: the core, four salient poles with their field coils, the shaft, the exciter's armature */
function altRotor() {
  const P = [G.lathe([0, 0, -.64], [0, 0, 1], [[0, .62], [1.28, .62]], { ds: 2.6 })];
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU;
    P.push(boxZ([Math.cos(a) * .76, Math.sin(a) * .76, 0], [.05, .3, .62], a, { ds: 1.6 }));
    P.push(boxZ([Math.cos(a) * .67, Math.sin(a) * .67, 0], [.05, .17, .58], a, F()));
    for (const d of [-.2, -.1, 0, .1, .2]) { const b = a + d * .5; P.push(G.line([[Math.cos(b) * .8, Math.sin(b) * .8, -.62], [Math.cos(b) * .8, Math.sin(b) * .8, .62]], F())); }
  }
  for (const z of [-.66, .6]) P.push(G.lathe([0, 0, z], [0, 0, 1], [[0, .81], [.06, .81]], {}));
  P.push(G.cyl([0, 0, -1.2], [0, 0, 1.52], .09, {}));
  P.push(G.lathe([0, 0, 1.2], [0, 0, 1], [[0, .3], [.24, .3]], { caps: true }));
  return P;
}
/* capacitor racks: two a side, the modules' faces on the aisle */
const RACKS = [];
for (const s of [1, -1]) for (const [j, z0, z1] of [[0, 47.9, 51.3], [1, 51.6, 55.0]]) RACKS.push({ s, j, z0, z1, zm: (z0 + z1) / 2 });
const MOD = [];                    // module centres, charge order: rack by rack, bottom shelf up
RACKS.forEach((rk, r) => { for (let k = 0; k < 4; k++) for (let q = 0; q < 5; q++) MOD.push({ r, s: rk.s, p: [rk.s * 2.36, FL + .43 + k * 1.12, rk.z0 + .38 + q * .64] }); });
/* capacitor module (local: centre; the terminal face is -X, the aisle for the starboard racks): a sparse case over
   four film capacitor cans, the terminal face with its studs, rating plate and LED window */
function module_() {
  const P = [G.box([-.4, -.26, -.26], [.4, .26, .26], { ds: 2.4 })];
  for (const y of [-.125, .125]) for (const z of [-.125, .125]) {
    P.push(G.lathe([-.36, y, z], [1, 0, 0], [[0, .105], [.7, .105]], { caps: true, ds: 1.8 }));
    P.push(circ([-.3, y, z], [1, 0, 0], .107, F()), G.cyl([-.39, y, z], [-.36, y, z], .025, F()));
  }
  P.push(G.panel([[-.405, -.22, -.22], [-.405, .22, -.22], [-.405, .22, .22], [-.405, -.22, .22]]));
  P.push(G.cyl([-.4, .15, -.12], [-.47, .15, -.12], .03, {}), G.cyl([-.4, .15, .12], [-.47, .15, .12], .03, {}));
  P.push(G.panel([[-.407, -.04, -.18], [-.407, -.04, .05], [-.407, .06, .05], [-.407, .06, -.18]], F()));
  P.push(G.line([[-.407, -.12, -.17], [-.407, -.12, .1]], F()));
  return P;
}
function racks() {
  const P = [];
  for (const rk of RACKS) {
    const s = rk.s, xi = s * 1.9, xo = s * 3.3;
    for (const x of [xi, xo]) for (const z of [rk.z0, rk.z1]) P.push(G.box([x - .035, FL, z - .035], [x + .035, FL + 4.72, z + .035], { edgeOnly: true }));
    for (let k = 0; k <= 4; k++) { const y = FL + .12 + k * 1.12;
      for (const x of [s * 1.94, s * 2.72]) P.push(G.box([x - .03, y, rk.z0], [x + .03, y + .05, rk.z1], { skip: [2, 3, 4, 5] })); }
    P.push(G.box([Math.min(xi, xo), FL + 4.66, rk.z0], [Math.max(xi, xo), FL + 4.72, rk.z1], { edgeOnly: true }));
    for (let y = FL + .68; y < FL + 4.6; y += 1.12) P.push(G.line([[xo, y, rk.z0], [xo, y, rk.z1]], F()));
    P.push(G.line([[xo, FL + .1, rk.z0], [xo, FL + 4.6, rk.z1]], F()), G.line([[xo, FL + .1, rk.z1], [xo, FL + 4.6, rk.z0]], F()));
    P.push(bar([s * 1.83, FL + .12, rk.z0 + .04], [s * 1.83, FL + 4.66, rk.z0 + .04], .14, .04, [1, 0, 0]));
    for (let k = 0; k < 4; k++) { const y = FL + .12 + k * 1.12 + .63; P.push(bar([s * 1.86, y, rk.z0 + .04], [s * 1.86, y, rk.z1 - .1], .05, .025, [1, 0, 0], F()));
      for (let q = 0; q < 5; q++) P.push(G.cyl([s * 1.87, y, rk.z0 + .38 + q * .64 - .12], [s * 1.95, y + .12, rk.z0 + .38 + q * .64 - .12], .012, F())); }
  }
  return P;
}
const RACK_OCC = RACKS.map(rk => { const s = rk.s, x0 = s * 1.98, x1 = s * 2.74, y0 = FL + .2, y1 = FL + .12 + 3 * 1.12 + .6, z0 = rk.z0 + .14, z1 = rk.z1 - .14;
  return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]; });
/* power conditioning cabinets on the forward bulkhead, faces aft: doors, a display, the meter window, vents, the
   breaker's escutcheon, handles, cable glands on top */
const CAB_X = [-1.84, -.92, 0, .92, 1.84], CAB_Z = 55.3, CAB_H = 2.5;
function cabinets() {
  const P = [];
  for (const xc of CAB_X) {
    const x0 = xc - .43, x1 = xc + .43, z = CAB_Z - .005;
    P.push(G.box([x0, FL, CAB_Z], [x1, FL + CAB_H, 56.2], { ds: 1.3 }));
    P.push(G.panel([[x0 + .05, FL + .08, z], [x1 - .05, FL + .08, z], [x1 - .05, FL + CAB_H - .08, z], [x0 + .05, FL + CAB_H - .08, z]]));
    P.push(G.panel([[xc - .34, FL + 2.02, z], [xc + .34, FL + 2.02, z], [xc + .34, FL + 2.3, z], [xc - .34, FL + 2.3, z]], F()));
    P.push(G.panel([[xc - .3, FL + 1.35, z], [xc + .05, FL + 1.35, z], [xc + .05, FL + 1.75, z], [xc - .3, FL + 1.75, z]], F()));
    for (let k = 0; k < 4; k++) P.push(G.line([[xc - .28, FL + 1.42 + k * .09, z - .002], [xc + .03, FL + 1.42 + k * .09, z - .002]], F()));
    for (let k = 0; k < 7; k++) P.push(G.line([[xc - .32, FL + .25 + k * .07, z], [xc + .32, FL + .25 + k * .07, z]], F()));
    P.push(G.box([x1 - .12, FL + 1.1, z - .04], [x1 - .09, FL + 1.4, z], F()));
    for (const y of [FL + .4, FL + 2.1]) P.push(G.cyl([x0 + .02, y, z], [x0 + .02, y + .16, z], .02, F()));
    for (const dx of [-.2, .2]) P.push(G.cyl([xc + dx, FL + CAB_H, 55.8], [xc + dx, FL + CAB_H + .12, 55.8], .07, F()));
    P.push(G.box([xc + .12, FL + 1.44, z - .03], [xc + .3, FL + 1.66, z], F()));
  }
  return P;
}
const CAB_OCC = [[-2.25, FL + .02, CAB_Z + .03], [2.25, FL + .02, CAB_Z + .03], [2.25, FL + .02, 56.18], [-2.25, FL + .02, 56.18], [-2.25, FL + CAB_H - .02, CAB_Z + .03], [2.25, FL + CAB_H - .02, CAB_Z + .03], [2.25, FL + CAB_H - .02, 56.18], [-2.25, FL + CAB_H - .02, CAB_Z + .03]];
const breaker = () => [G.box([-.025, 0, -.025], [.025, .2, .025]), G.box([-.05, .18, -.04], [.05, .24, .04])];
const BRK = RACKS.map(rk => [rk.s * (rk.j ? 1.84 : .92) + .21, FL + 1.55, CAB_Z - .03]);    // one per rack
/* coolant: two pumps (brushless DC motors), the valve header, the lines to the mount through the power column, the
   hot line down to the keel and the cold line back (the heat sink's ports), the expansion tank */
const PUMPS = [[.62, 1.75, 40.75], [-.62, 1.75, 40.75]];   // each pump's frame: the motor's aft end on its axis, +Z forward
const VALVES = [-.9, -.3, .3, .9].map(x => [x, 2.64, 43.6]);
const SINK = { hot: [0, -2.0, 40.95], cold: [0, -2.0, 42.55], d: [0, -1, 0] };
const COOL_SUP = [[1.15, 2.2, 43.6], [1.15, 1.05, 43.6], [.2, 1.05, 44.2], [.2, 1.05, GZ], [.2, FL + .2, GZ]];
const COOL_RET = [[-.2, FL + .2, GZ], [-.2, 1.05, GZ], [-.2, 1.05, 41.5], [0, 1.05, 41.1], [0, 1.05, 40.95], SINK.hot];
const COOL_COLD = s => [SINK.cold, [0, 1.75, 42.55], [s * .62, 1.75, 42.55], [s * .62, 1.75, 42.3]];
const COOL_P = x => [[x, 2.05, 41.99], [x, 2.2, 41.99], [x, 2.2, 43.6]];
const COOL_COL = s => [[s * .2, FL + .2, GZ], [s * .2, GY - 2.85, GZ]];
function coolStatic() {
  const P = [];
  P.push(G.cyl([-1.15, 2.2, 43.6], [1.15, 2.2, 43.6], .09, { caps: true }));
  for (const [x] of VALVES) { P.push(G.box([x - .09, 2.08, 43.5], [x + .09, 2.36, 43.7]), G.cyl([x, 2.36, 43.6], [x, 2.62, 43.6], .022, F())); }
  P.push(...pipes(COOL_SUP, .07), ...pipes(COOL_RET, .07));
  for (const s of [-1, 1]) P.push(...pipes(COOL_COLD(s), .07));
  for (const [x] of PUMPS) P.push(...pipes(COOL_P(x), .06));
  // hull penetrations (the sea chest valves) where the lines leave for the heat sink
  for (const p of [SINK.hot, SINK.cold]) P.push(G.lathe([p[0], -1.2, p[2]], [0, 1, 0], [[0, .13], [.1, .13]], { caps: true }), G.box([p[0] - .05, -1.1, p[2] - .2], [p[0] + .05, -1.0, p[2] + .2], F()), G.lathe([p[0], -.7, p[2]], [0, 1, 0], [[0, .11], [.04, .11]], F()));
  // the expansion tank overhead, its line down to the cold riser
  P.push(G.lathe([-.55, 4.7, 42.55], [1, 0, 0], [[0, .12], [.06, .2], [1.04, .2], [1.1, .12]], { caps: true }), G.cyl([0, 1.82, 42.55], [0, 4.5, 42.55], .035, {}));
  for (const x of [-.4, .4]) P.push(G.cyl([x, 4.9, 42.55], [x, hD(42.55) - .25, 42.55], .015, F()));
  return P;
}
/* a pump (local: the motor's aft end on the axis, +Z forward): plinth, motor housing (sparse: the stator and rotor
   show) and its cooling fins, the drive inverter on top, the coupling guard, the lantern, the volute and its
   nozzles */
function pumpStatic() {
  const P = [];
  P.push(G.box([-.36, -.45, -.05], [.36, -.35, 1.52], { ds: 1.3 }));
  for (const s of [-1, 1]) P.push(G.box([s * .16, -.35, .1], [s * .3, -.2, .62], F()), G.box([s * .1, -.35, 1.08], [s * .22, -.17, 1.38], F()));
  P.push(G.lathe([0, 0, .05], [0, 0, 1], [[0, .2], [.04, .25], [.66, .25], [.7, .2]], { edgeOnly: true }));
  for (let k = 0; k < 20; k++) { const a = (k + .5) / 20 * TAU; if (Math.sin(a) > .78) continue; const c = Math.cos(a), n = Math.sin(a); P.push(G.line([[c * .25, n * .25, .12], [c * .285, n * .285, .14], [c * .285, n * .285, .6], [c * .25, n * .25, .62]], F())); }
  for (const z of [.07, .68]) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.cyl([Math.cos(a) * .215, Math.sin(a) * .215, z - .01], [Math.cos(a) * .215, Math.sin(a) * .215, z + .01], .012, F())); }
  P.push(G.box([-.14, .25, .14], [.14, .4, .6], { ds: 1.1 }));
  for (let k = 0; k < 7; k++) P.push(G.box([-.13 + k * .043, .4, .16], [-.12 + k * .043, .47, .58], F({ noEdge: true })));
  P.push(G.cyl([0, .32, .6], [0, .32, .7], .03, F()), G.panel([[.141, .28, .2], [.141, .28, .34], [.141, .36, .34], [.141, .36, .2]], F()));
  P.push(G.line([[-.2, -.2, .72], [-.2, .2, .72], [-.2, .2, .98], [-.2, -.2, .98], [-.2, -.2, .72]], F()), G.line([[.2, -.2, .72], [.2, .2, .72], [.2, .2, .98], [.2, -.2, .98], [.2, -.2, .72]], F()));
  for (let k = 0; k < 4; k++) P.push(G.line([[-.2, .2 - k * .13, .85], [.2, .2 - k * .13, .85]], F()));
  P.push(G.lathe([0, 0, .98], [0, 0, 1], [[0, .15], [.08, .15]], {}));
  P.push(G.lathe([0, 0, 1.06], [0, 0, 1], [[0, .17], [.05, .34], [.3, .34], [.37, .17]], { caps: true, ds: 2.2 }));
  P.push(G.cyl([0, .28, 1.24], [0, .55, 1.24], .075, {}), G.lathe([0, .5, 1.24], [0, 1, 0], [[0, .12], [.04, .12]], F({ caps: true })));
  P.push(G.cyl([0, 0, 1.43], [0, 0, 1.55], .1, {}), G.lathe([0, 0, 1.5], [0, 0, 1], [[0, .15], [.04, .15]], F({ caps: true })));
  return P;
}
/* the stator (local, the pump's frame): its core ring and twelve teeth, each wound with a coil */
const PST = 12;
const stCoil = k => { const a = (k + .5) / PST * TAU, c = Math.cos(a), s = Math.sin(a), t = [-s, c, 0], r = [c, s, 0], L = [];
  for (const [tu, z] of [[-1, .13], [1, .13], [1, .59], [-1, .59], [-1, .13]]) L.push([r[0] * .19 + t[0] * tu * .032, r[1] * .19 + t[1] * tu * .032, z]); return L; };
function pumpStator() {
  const P = [circ([0, 0, .14], [0, 0, 1], .232), circ([0, 0, .58], [0, 0, 1], .232), circ([0, 0, .14], [0, 0, 1], .2, F()), circ([0, 0, .58], [0, 0, 1], .2, F())];
  for (let k = 0; k < PST; k++) {
    const a = (k + .5) / PST * TAU;
    P.push(boxZ([Math.cos(a) * .19, Math.sin(a) * .19, .36], [.035, .012, .22], a, F({ edgeOnly: true })));
  }
  return P;
}
/* one of the stator's coils (k 0; the others are it turned k x 30 deg about Z): drawn apart so each lights as the
   inverter switches it */
const pumpCoil = () => { const a = .5 / PST * TAU; return bars(stCoil(0), .016, .024, [Math.cos(a), Math.sin(a), 0], { ds: .7 }); };
/* the rotor (local, spinning about Z): shaft, the permanent-magnet rotor (eight magnets), the coupling, the impeller */
function pumpRotor() {
  const P = [G.cyl([0, 0, -.02], [0, 0, 1.4], .028, {}), G.lathe([0, 0, .16], [0, 0, 1], [[0, .118], [.4, .118]], { caps: true, ds: 3.2 })];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(boxZ([Math.cos(a) * .132, Math.sin(a) * .132, .36], [.012, .042, .19], a, { ds: 1.6 })); }
  P.push(G.lathe([0, 0, .78], [0, 0, 1], [[0, .11], [.07, .11]], { caps: true }), G.lathe([0, 0, .88], [0, 0, 1], [[0, .11], [.07, .11]], { caps: true }));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(G.box([Math.cos(a) * .07 - .015, Math.sin(a) * .07 - .015, .85], [Math.cos(a) * .07 + .015, Math.sin(a) * .07 + .015, .88], F())); }
  P.push(G.lathe([0, 0, 1.15], [0, 0, 1], [[0, .05], [.16, .05]], { caps: true }), G.lathe([0, 0, 1.15], [0, 0, 1], [[0, .29], [.012, .29]], { caps: true, ds: 1.2 }));
  for (let k = 0; k < 6; k++) { const L = []; for (let j = 0; j <= 5; j++) { const u = j / 5, a = k / 6 * TAU + u * 1.1, r = .06 + .22 * u; L.push([Math.cos(a) * r, Math.sin(a) * r, 1.2]); } P.push(...bars(L, .01, .07, [0, 0, 1], F())); }
  return P;
}
const handwheel = () => [circ([0, 0, 0], [0, 1, 0], .16), circ([0, 0, 0], [0, 1, 0], .14, F()), ...[0, 1, 2, 3].map(k => { const a = k / 4 * TAU + .3; return G.line([[0, 0, 0], [Math.sin(a) * .15, 0, Math.cos(a) * .15]]); }), G.cyl([0, -.02, 0], [0, .03, 0], .035, F())];
/* overhead: cable trays, hangers, cables, ventilation fans, deck beams */
const FANS = [[0, 6.2, 41.8], [0, 6.2, 54.2]];
function overhead() {
  const P = [];
  for (const s of [-1, 1]) {
    for (const x of [s * 1.5, s * 2.1]) P.push(G.line([[x, 6.27, 40.9], [x, 6.27, 55.2]]), G.line([[x, 6.37, 40.9], [x, 6.37, 55.2]]));
    for (let z = 41.0; z < 55.2; z += .3) P.push(G.line([[s * 1.5, 6.28, z], [s * 2.1, 6.28, z]], F()));
    for (let z = 41.4; z < 55.2; z += 1.5) P.push(G.cyl([s * 1.53, 6.37, z], [s * 1.53, hD(z) - .25, z], .015, F()), G.cyl([s * 2.07, 6.37, z], [s * 2.07, hD(z) - .25, z], .015, F()));
    for (let k = 0; k < 2; k++) { const x = s * (1.9 - k * .16); P.push(G.line([[x, 6.33, 41.0], [x, 6.33, 55.1]], F())); }
  }
  for (const [x, y, z] of FANS) {
    P.push(G.lathe([x, y, z - .3], [0, 0, 1], [[0, .42], [.6, .42]], {}));
    for (const s of [-1, 1]) P.push(G.box([x + s * .42, y - .02, z - .1], [x + s * .9, y + .02, z + .1], F()), G.cyl([x + s * .9, y, z], [x + s * .9, hD(z) - .25, z], .02, F()));
    P.push(G.cyl([x, y, z + .05], [x, y, z + .25], .11, { caps: true }));
    for (const s of [-1, 1]) P.push(G.line([[x, y, z + .15], [x + s * .41, y, z + .15]], F()));
  }
  for (let z = 41.2; z < 56.5; z += 1.2) { const y = hD(z) - .24, hw = sec(z).d[0] - .4; P.push(G.line([[-hw, y - .22, z], [hw, y - .22, z]], F()), G.line([[-hw, y - .22, z + .1], [hw, y - .22, z + .1]], F())); }
  return P;
}
const fanBlades = () => [G.blades([0, 0, 0], [0, 0, 1], 6, .12, .39, { chord: .6, pitch: .3 })];
/* the floor grating (the hull's breadth at the floor, less a margin) */
function floor() {
  const P = [];
  for (let z = 40.8; z <= 56.8; z += .25) { const hw = hullAt(z, FL) - .35; P.push(G.line([[-hw, FL, z], [hw, FL, z]], F())); }
  for (let x = -3.5; x <= 3.51; x += .5) { const L = []; for (let z = 40.8; z <= 56.81; z += .5) { if (hullAt(z, FL) - .35 > Math.abs(x)) L.push([x, FL, z]); } if (L.length > 1) P.push(G.line(L)); }
  return P;
}
/* bus bar routes (ship frame): alternators -> cabinets (overhead), cabinets -> racks (on the floor), racks -> the
   power column (under the floor grating, into the column's foot) */
const BUS_A = ALT.map(([x, y, z], k) => { const s = Math.sign(x), j = k >> 1, xi = s * (1.66 + .16 * j); return [[x, 3.81, z], [x, 5.9, z], [xi, 6.36, z], [xi, 6.36, 55.62], [xi, FL + CAB_H, 55.62]]; });
const BUS_B = RACKS.map(rk => { const s = rk.s, j = rk.j, xl = s * (1.36 + .14 * j), xc = s * (.8 + .24 * j); return [[xc, FL + .12, CAB_Z], [xc, FL + .12, 55.1], [xl, FL + .12, 54.9], [xl, FL + .12, rk.z0 + .04], [s * 1.83, FL + .12, rk.z0 + .04]]; });
const BUS_C = RACKS.map(rk => { const s = rk.s, j = rk.j, y = FL - .3 - .09 * j, xm = s * (.24 + .1 * j); return [[s * 1.83, FL + .12, rk.z0 + .04], [s * 1.83, y, rk.z0 + .04], [xm, y, rk.z0 + .04], [xm, y, GZ], [xm, FL + .25, GZ]]; });
const JOINTS = [];
for (const set of [BUS_A, BUS_B, BUS_C]) for (const pl of set) for (let i = 1; i < pl.length - 1; i++) JOINTS.push(pl[i]);
function busPrims() {
  const P = [];
  for (const p of BUS_A) P.push(...bars(p, .14, .05, [0, 0, 1]));
  for (const p of BUS_B) P.push(...bars(p, .14, .04, [0, 1, 0]));
  for (const p of BUS_C) P.push(...bars(p, .14, .04, [0, 1, 0]));
  for (const j of JOINTS) P.push(G.box([j[0] - .1, j[1] - .08, j[2] - .1], [j[0] + .1, j[1] + .08, j[2] + .1], F()));
  // insulator standoffs under the floor runs
  for (const p of BUS_C) for (let z = Math.min(p[2][2], p[3][2]) + .3; z < Math.max(p[2][2], p[3][2]); z += .7) P.push(G.cyl([p[2][0], p[2][1] - .02, z], [p[2][0], FL - .02, z], .03, F()));
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
function hB(z) { const u = z / ZB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); return 10; }
function hW(z) { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); return 9; }
function sec(z) { const d = hD(z), b = hB(z), w = hW(z), yk = d - Math.min(1.6, d * .3); return { w: [w, 0], k: [w + (b - w) * .9, yk], d: [b, d] }; }
function hullAt(z, y) { const s = sec(z); return y < s.k[1] ? s.w[0] + (s.k[0] - s.w[0]) * y / s.k[1] : s.k[0] + (s.d[0] - s.k[0]) * (y - s.k[1]) / (s.d[1] - s.k[1]); }
function hullPatch() {
  const P = [], Z = []; for (let z = CUT[0]; z < CUT[1] + .01; z += .5) Z.push(z);
  const sk = (q, n) => ({ t: 'quad', q, n });
  for (let i = 0; i < Z.length - 1; i++) {
    const z0 = Z[i], z1 = Z[i + 1], a = sec(z0), b = sec(z1);
    for (const s of [-1, 1]) {
      const p = (q, z) => [s * q[0], q[1], z];
      P.push(sk([p(a.w, z0), p(b.w, z1), p(b.k, z1), p(a.k, z0)], [s, 0, 0]));
      P.push(sk([p(a.k, z0), p(b.k, z1), p(b.d, z1), p(a.d, z0)], [s, 0, 0]));
    }
    const xs = [[-a.d[0], a.d[0]]];
    for (const [x0, x1] of xs) {
      const f = x => x === -a.d[0] ? -b.d[0] : x === a.d[0] ? b.d[0] : x;
      P.push(sk([[x0, a.d[1], z0], [x1, a.d[1], z0], [f(x1), b.d[1], z1], [f(x0), b.d[1], z1]], [0, 1, 0]));
    }
  }
  const L = [];
  for (const s of [-1, 1]) for (const key of ['k', 'd']) L.push(Z.map(z => { const q = sec(z)[key]; return [s * q[0], q[1] + .01, z]; }));
  return { quads: P, lines: L };
}
function hullCloud() {
  const H = hullPatch();
  const lv = [.035, .07, .14, .28, .56].map(sp => {
    const o = [];
    for (const q of H.quads) { const [a, b, c, d] = q.q; quadL(o, a, b, c, d, q.n, sp); }
    for (const Lp of H.lines) for (let i = 0; i < Lp.length - 1; i++) lineL(o, Lp[i], Lp[i + 1], sp * .5);
    return { sp, pts: new Float32Array(o) };
  });
  return K.lodCloud(lv, 1.4);
}

/* ================= occlusion: 4 px depth tiles written by convex occluders ================= */
const OT = 4, OW = 480, OHt = 270, OZ = new Float32Array(OW * OHt);
let occOn = false;
function occReset() { if (occOn) OZ.fill(1e9); occOn = false; }
/* a convex hex (8 corners, world) : each tile whose centre ray enters it gets the entry depth (a little deeper) */
function occHex(C8) {
  const C = K.C, e = C.eye, f = C.f, r = C.r, u = C.u, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  if (!occOn) { OZ.fill(1e9); occOn = true; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of C8) { if (!K.pj(p[0], p[1], p[2])) { x0 = 0; y0 = 0; x1 = 1919; y1 = 1079; break; } const px = K.PJ[0], py = K.PJ[1]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  const tx0 = Math.max(0, Math.floor(x0 / OT)), tx1 = Math.min(OW - 1, Math.floor(x1 / OT)), ty0 = Math.max(0, Math.floor(y0 / OT)), ty1 = Math.min(OHt - 1, Math.floor(y1 / OT));
  if (tx1 < tx0 || ty1 < ty0) return;
  const cen = [0, 0, 0]; for (const p of C8) { cen[0] += p[0] / 8; cen[1] += p[1] / 8; cen[2] += p[2] / 8; }
  const ne = [], nf = [], nr = [], nu = [];
  let inside = true;
  for (const fc of HF) {
    const a = C8[fc[0]], b = C8[fc[1]], d = C8[fc[3]];
    let n = V.norm(V.cross(V.sub(b, a), V.sub(d, a)));
    const m = [(a[0] + C8[fc[2]][0]) / 2, (a[1] + C8[fc[2]][1]) / 2, (a[2] + C8[fc[2]][2]) / 2];
    if (V.dot(n, V.sub(m, cen)) < 0) n = V.mul(n, -1);
    const dd = V.dot(n, a);
    ne.push(dd - (n[0] * e[0] + n[1] * e[1] + n[2] * e[2])); nf.push(V.dot(n, f)); nr.push(V.dot(n, r)); nu.push(V.dot(n, u));
    if (ne[ne.length - 1] < -.4) inside = false;
  }
  if (inside) return;                     // the lens is in (or at) the block: it hides nothing
  // 8 px blocks (2 x 2 tiles), each tested once at its centre
  for (let ty = ty0 & ~1; ty <= ty1; ty += 2) {
    const b = ((ty + 1) * OT - cy) / Fl;
    for (let tx = tx0 & ~1; tx <= tx1; tx += 2) {
      const a = ((tx + 1) * OT - cx) / Fl;
      let tin = C.near, tout = 1e9;
      for (let i = 0; i < 6; i++) {
        const den = nf[i] + a * nr[i] - b * nu[i], num = ne[i];
        if (den < -1e-9) { const t = num / den; if (t > tin) tin = t; }
        else if (den > 1e-9) { const t = num / den; if (t < tout) tout = t; }
        else if (num < 0) { tin = 1e9; break; }
        if (tin >= tout) break;
      }
      if (tin >= tout) continue;
      const zz = tin * 1.008 + .08;
      for (let v = 0; v < 2; v++) { if (ty + v >= OHt) break; const k = (ty + v) * OW + tx; if (zz < OZ[k]) OZ[k] = zz; if (tx + 1 < OW && zz < OZ[k + 1]) OZ[k + 1] = zz; }
    }
  }
}
/* a point hidden behind an occluder (screen x, y, depth) */
const occd = (x, y, z) => occOn && x >= 0 && y >= 0 && x < 1920 && y < 1080 && z > OZ[((y | 0) >> 2) * OW + ((x | 0) >> 2)];

/* ================= the X-ray point pass =================
   XS.zo / zs: the opening and shutting slices (ship z, both sweep bow -> stern); open where zo < z < zs inside
   the box. md 0 plain · 1 shell (thinned where open, lime at the slices) · 3 hidden (seen only where open).
   S: model -> ship transform for clouds not in the ship frame (or null); zfix: test this ship z instead. */
const XS = { zo: 99, zs: 99, ko: 1, ks: 1, box: [-11, 11, -1.5, 10.5, 40.4, 57.6], dim: 1 };
const LIME = K.LIME, WH = K.WH;
const XO = { a: 1, fade: 900, back: .1, lime: 0, keep: 1, md: 0, zfix: undefined, size: 1, S: null, tint: null, tk: 0, cut: null, px: 3.2, edge: .62, occ: true, bk: .33, lmin: 0, px0: 99, foc: 0, amb: 0 };
const XOO = Object.assign({}, XO);
function xopt(o) { for (const k in XO) XOO[k] = o && o[k] !== undefined ? o[k] : XO[k]; return XOO; }
function runX(P, i0, i1, sp, o, md, step) {
  const x = XMR, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, BW = 1920, BH = 1080;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, big = o.size, omd = o.md, allThin = md === 2, eb = o.edge, amb = o.amb;
  const lm = o.lime, useOcc = occOn && o.occ, bkeep = o.bk;
  let cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
  if (o.tint) { const tk = o.tk; cr += (o.tint[0] - cr) * tk; cg += (o.tint[1] - cg) * tk; cb += (o.tint[2] - cb) * tk; }
  const zo = XS.zo, zs = XS.zs, ko = XS.ko, ks = XS.ks, bx = XS.box, S = o.S, zfix = o.zfix, dim = XS.dim, cut = o.cut, c0 = cut ? cut[0] : 0, c1 = cut ? cut[1] : 0;
  const anyOpen = zo < 90;
  for (let i = i0, j = i0 * 6; i < i1; i += step, j += 6 * step) {
    const hs = (i * .6180339887) % 1;
    if (keep < 1 && hs > keep) continue;
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    if (cut && pz > c0 && pz < c1) continue;
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5], two = nx === 0 && ny === 0 && nz === 0;
    let dn = 0;
    if (!two) { dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez); if (dn > 0 && (bkeep === 0 || ((i * .7548776662) % 1) > bkeep)) continue; }
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
    if (useOcc && zc > OZ[((sy | 0) >> 2) * OW + ((sx | 0) >> 2)]) continue;
    let b, bk = false;
    if (two) b = eb;
    else {
      if (dn > 0) { b = back; bk = true; }
      else {
        let fac = -dn / zc; if (fac > 1) fac = 1;
        const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
        b = .06 + amb + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
      }
    }
    b *= zc < fade ? A - kf * zc : kfar;
    if (thin) b = (bk ? .035 : .035 + .16 * b) * dim;
    let r = cr, g = cg, bl = cb;
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const pxs = sp * iz * big;
    // 1 px dots (a 2 px dot only where the dots land far apart): fine, never blobby
    const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
    if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    if (pxs > 6.5 && sx < BW - 1 && sy < BH - 1) {
      const R2 = R_ * .7, G2 = G_ * .7, B2 = B_ * .7;
      let q2 = q + 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
      q2 = q + BW * 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
    }
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
/* LOD per cell: the coarsest level whose dots land at most px apart on screen (1 px dots) */
function drawX(ml, Tw, o) {
  XMR = K.prep(Tw);
  const CH = ml.ch, SD = ml.sd, nl = ml.nl, Fl = K.C.fl, oo = xopt(o), PX = oo.px / Math.sqrt(Math.max(.05, oo.keep)), kp = oo.keep;
  oo.keep = 1;
  const foc = oo.foc;
  const x = XMR, ex = x[12], ey = x[13], ez = x[14];
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(mx, my, mz, rad)) continue;
    const md = cellMode(oo, mx, my, mz, rad); if (md < 0) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.05, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    const pxe = foc > 0 && d > foc ? PX * Math.pow(Math.min(1.7, d / foc), 1.2) : PX;
    let li = nl - 1; while (li > oo.lmin && ml.sp[li] * Fl / d > pxe * 1.3) li--;
    if (li === oo.lmin && li > 0 && ml.sp[li] * Fl / d > oo.px0) li--;
    const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
    if (i1 > i0) { const st = md === 2 ? 3 : 1; runX(ml.lv[li], i0, i1, ml.sp[li], oo, md, st); NP += (i1 - i0) / st; }
  }
  oo.keep = kp;
}
/* an FX dot at a world point that respects the occluders */
function odot(x, y, z, s, c, a) { if (K.pj(x, y, z) && !occd(K.PJ[0], K.PJ[1], K.PJ[2])) K.dot(K.PJ[0], K.PJ[1], s, c[0], c[1], c[2], a); }
function oglow(x, y, z, px, c, a) { if (K.pj(x, y, z) && !occd(K.PJ[0], K.PJ[1], K.PJ[2])) K.glowW(x, y, z, px, c, a); }

/* the barrel's containment as an occluder (B frame corners, inset): the rails inside and the far coils hide */
const BR_OCC = [[-.34, -.34, -1.7], [.34, -.34, -1.7], [.34, -.34, RZ1 - .02], [-.34, -.34, RZ1 - .02], [-.34, .34, -1.7], [.34, .34, -1.7], [.34, .34, RZ1 - .02], [-.34, .34, RZ1 - .02]];
/* the magazine cell the loader takes next (ship frame): under the hoist at the mount's firing train (the film's PSI) */
const AZ0 = Math.atan2(7200, 15600);
const MAG_CELL = { p: [Math.sin(AZ0) * HZ, RND_Y0, GZ + Math.cos(AZ0) * HZ], ax: [0, 1, 0] };

/* ================= build ================= */
function build() {
  const t0 = performance.now();
  const CL = {
    baseAbove: lod(baseAbove(), .9), ring: lod(ringGear(), .9),
    cheekS: lod(cheek(1), 1.0), cheekP: lod(cheek(-1), 1.0), gbody: lod(gunBody(), 1.0), ginH: lod(gunIn('h'), .6), ginC: lod(gunIn('c'), .8),
    eoBase: lod(eoBase(), .4, LF), eoYoke: lod(eoYoke(), .4, LF), eoHead: lod(eoHead(), .4, LF), fcBase: lod(fcrBase(), .5, LF), fcHead: lod(fcrHead(), .5, LF),
    cradle: lod(cradle(), .8), barrel: lod(barrel(), .7, LM), rails: lod(railPrims(), .8), ins: lod(insPrims(), .8),
    coil: lod(coilPrims(), .45, LF), cryo: lod(cryoPrims(), .6, LF), frost: frostCloud(),
    jawS: lod(jaw(1), .5, LF), jawP: lod(jaw(-1), .5, LF), breech: lod(breechBlock(), .6), petalT: lod(petal(1)), petalB: lod(petal(-1)),
    tray: lod(tray(), .6, LF), rhead: lod(rammerHead(), .4, LF), ramCyl: lod(ramCyl(), .5, LF), ramRod: lod(ramRod(), .5, LF), tpin: lod(trainPinion(), .4, LF),
    round: lod(round_(), .3, LF), rstow: lod(roundStowed(), .5), sabot: lod(sabotPetal(), .3, LF), arm: lod(armature(), .3, LF),
    baseBelow: lod(baseBelow(), .9), roller: lod(rollerPath(), .9, LB), trunk: lod(trunkT(), .9), carriage: lod(carriage(), .5, LF), drum: lod(drum(), .8), pinion: lod(pinion(), .5, LF),
    body: lod(altBody(), .8), bell: lod(altBell(), .8), exc: lod(altExciter(), .8), fan: lod(altFan(), .6), rotor: lod(altRotor(), .8),
    module: lod(module_(), .5), racks: lod(racks(), .9, LB), cab: lod(cabinets(), .9), breaker: lod(breaker(), .5),
    cool: lod(coolStatic(), .9), pump: lod(pumpStatic(), .5, LF), pstat: lod(pumpStator(), .4, LF), pcoil: lod(pumpCoil(), .3, LF), prot: lod(pumpRotor(), .4, LF), wheel: lod(handwheel(), .5),
    over: lod(overhead(), 1.1, LB), fanB: lod(fanBlades(), .6), floor: lod(floor(), 1.2, LB), bus: lod(busPrims(), .9),
    hullP: hullCloud(),
  };
  CL.ms = performance.now() - t0;
  if (window.RGP) window.RGP.CL = CL;
  let n = 0; for (const k in CL) if (CL[k].lv) n += CL[k].lv[0].length / 6; CL.n0 = n;
  return CL;
}

window.RGP = {
  GZ, GY, M0, FL, CUT, TRN, SLV0, SLV1, EXT, MZ_E, RZ0, RZ1, ALT, ALT_FLIP, XALT, RACKS, MOD, BANDS, EL_LOAD,
  TRAY_Z, SEAT_Z, RND_H, RAM_L, HZ, HY0, HY1, DRUM_R, DRUM_Y, RND_Y0, NCELL, PIN_P, PUMPS, VALVES, FANS, CAB_X, CAB_Z, CAB_H, BRK, JOINTS,
  FROST, PETAL_HINGE, TUR_OCC, BR_OCC, RACK_OCC, CAB_OCC, MAG_CELL, SINK,
  NST, STN, DZS, COLD, CXC, KX0, KX1, KY, KZ, CX, CY, RW, RY0, RY1, IX0, IX1,
  HYD: HYD.map(poly), HE_T: HE_T.map(poly), COOL_T: [-1, 1].map(s => poly(COOL_T(s))),
  EO_P, EO_H, EO_WIN, FC_P, FC_H, FC_A, MV_P, RAM_E, TD_P, RING_R, PIN_R, HPU, HEC, BUS_ANCH, FEED_B, PST, stCoil,
  BUS_A: BUS_A.map(poly), BUS_B: BUS_B.map(poly), BUS_C: BUS_C.map(poly),
  COOL: [COOL_SUP, COOL_RET, ...[-1, 1].map(COOL_COLD), ...PUMPS.map(p => COOL_P(p[0]))].map(poly),
  COOL_SUP: poly(COOL_SUP), COOL_RET: poly(COOL_RET), COOL_COLD: [-1, 1].map(s => poly(COOL_COLD(s))), COOL_PD: PUMPS.map(p => poly(COOL_P(p[0]))), COOL_COL: [-1, 1].map(s => poly(COOL_COL(s))),
  sampleLat, lod, LV, LB, LF, LM, quadL, lineL, ringL, perp, bar, bars, pipes, circ, boxY, boxZ, xfPrims, quad3, racetrack, hullAt, sec, hD,
  poly, polyAt, XS, drawX, build, occReset, occHex, occd, odot, oglow, np: () => { const n = NP; NP = 0; return n; },
};
})();
