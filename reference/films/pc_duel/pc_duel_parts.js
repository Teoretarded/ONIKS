/* SCAN · RAILGUN parts: the electromagnetic railgun mount in the Mk 45's seat on the Burke's foredeck, its loader and
   the power room under it.
   The mount: a gunhouse of two cheeks (access panels, louvres, a crew door) round the barrel slot; in the starboard
   cheek the hydraulic power unit (the tank with its sight glass, filler and clean-out cover; the finned motor, the bell
   housing, an axial piston pump with a nine-piston block and swash plate (drawn apart: they turn and tilt), its
   compensator; the pressure filter; the manifold and a stack of four directional valves; three piston accumulators
   (their pistons drawn apart); the gauge panel; braided hoses), in the port cheek two helium compressors and the
   fire-control cabinet; two train drives (planetary gearbox, brake, radial-piston hydraulic motor) whose pinions walk
   round a fixed ring gear; on the roof an electro-optical / infrared director (yaw, pitch) and an X-band fire-control radar (yaw); the
   cradle on its trunnions with two hydraulic elevation rams, two recoil buffers, the muzzle velocity radar on a
   bridge over the barrel and the loader frame behind the breech. The barrel (12.85 m): a sliding breech block, a
   feed section with the two current injection blocks, copper rails top and bottom with insulating sidewalls in a
   composite containment, preload clamps at 13 bands (wedge jaws that drive home), and between them 12 stations of
   superconducting augmenting coils (a racetrack pair either side, the field across the bore) each in its cryostat
   with a pulse-tube cryocooler (valve body, motor, regenerator, pulse tube, buffer and inertance tube; inside, the two
   stages and the thermal strap), current leads fed from a coil bus along the top and helium lines to two headers;
   the rails' coolant manifold under the barrel; the muzzle block with the arc shunt and a two-leaf muzzle cover.
   The loader for the 2 m long-rod round: a 12-cell magazine drum round the power column in the power room, a hoist
   in the rotating trunk, a tray that takes the round standing and swings it into line behind the breech, a chain
   rammer (2.4 m stroke).
   The power room: four pulsed alternators with exciters (one comes apart on guide rods), two coolant pumps (brushless
   DC motors: finned housing, drive inverter, a stator of twelve wound teeth, a permanent-magnet rotor, the pump's
   shrouded six-vane impeller in a spiral volute), the valve header, the coolant lines down to the keel (the heat sink's ports, RGP.SINK),
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
const EO_P = [-1.78, 3.1, -.9], EO_H = .58;             // EO/IR director: pedestal foot, the elevation axis above it
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
/* the hydraulic power unit (T, in the starboard cheek, aft): the tank; on it the electric motor (axis +Z), the bell
   housing and the axial piston pump (swash plate, a nine-piston cylinder block, the valve plate, the compensator); the
   pressure filter; the manifold with its four-spool valve stack; three piston accumulators; the gauge panel facing
   outboard */
const HPU = { mot: [1.86, 1.33, -4.36], pump: [1.86, 1.33, -3.48], man: [1.6, .9, -2.2], acc: [-2.75, -2.35, -1.95].map(z => [2.32, .3, z]),
  gauge: [2.535, 1.5, -3.56], gauge2: [2.535, 1.34, -3.38], filt: [1.5, .62, -2.85], spool: [-2.52, -2.3, -2.08, -1.86],
  PST: .05, PR: .046, PN: 9, CB0: -3.36, CB1: -3.2, SW: -3.42, AYB: .44, AYT: 1.38 };
/* the oil's ways (T): pump -> pressure filter -> manifold; manifold -> each accumulator; return -> the tank's filter */
const HYD_P = [
  [[1.74, 1.33, -3.1], [1.6, 1.36, -3.02], [1.52, 1.34, -2.95], [1.5, 1.26, -2.93]],
  [[1.5, 1.22, -2.77], [1.5, 1.1, -2.7], [1.5, .92, -2.6]],
  ...[-2.75, -2.35, -1.95].map(z => [[1.82, .5, z + .05], [2.06, .5, z + .05], [2.2, .38, z], [2.32, .34, z]]),
  [[1.38, .62, -2.5], [1.3, .9, -2.8], [1.3, 1.1, -3.1], [1.42, 1.18, -3.2]],
];
const HEC = [-4.1, -3.2].map(z => [-1.88, 1.2, z + .375]);
function gunIn(g) {
  const P = [];
  if (g === 'h') return hpuPrims();
  for (const c of HEC) {
    P.push(G.box([-2.35, .3, c[2] - .375], [-1.42, 1.2, c[2] + .375], { ds: 1.2 }));
    const g = [-2.36, .78, c[2]]; P.push(circ(g, [1, 0, 0], .25, F()), circ(g, [1, 0, 0], .17, F()), circ(g, [1, 0, 0], .08, F()));
    for (const dz of [-.12, .12]) P.push(G.cyl([-1.7, 1.2, c[2] + dz], [-1.7, 1.32, c[2] + dz], .035, F()));
  }
  P.push(G.box([-2.3, .3, -2.1], [-1.42, 1.95, -1.0], { ds: 1.2 }));
  P.push(G.panel([[-1.415, .5, -2.0], [-1.415, .5, -1.1], [-1.415, 1.85, -1.1], [-1.415, 1.85, -2.0]], F()));
  for (let k = 0; k < 6; k++) P.push(G.line([[-1.414, 1.55 - k * .1, -1.95], [-1.414, 1.55 - k * .1, -1.6]], F()));
  // the train drives: a planetary gearbox (ribbed) on its flange, a spring-applied brake, the radial-piston hydraulic
  // motor (five cylinders round it) with its port block and two hose fittings, the shaft down to the pinion
  for (const p of TD_P) {
    const [x, y, z] = p, so = -Math.sign(x);
    P.push(G.lathe([x, y, z], [0, 1, 0], [[0, .17], [.02, .19], [.2, .19], [.22, .16]], { caps: true, ds: 1.1 }));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(G.panel([[x + Math.cos(a) * .19, y + .03, z + Math.sin(a) * .19], [x + Math.cos(a) * .215, y + .05, z + Math.sin(a) * .215], [x + Math.cos(a) * .215, y + .19, z + Math.sin(a) * .215], [x + Math.cos(a) * .19, y + .2, z + Math.sin(a) * .19]], F({ fill: true }))); }
    P.push(G.lathe([x, y + .2, z], [0, 1, 0], [[0, .25], [.03, .25]], F({ caps: true })));
    for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * TAU; P.push(G.cyl([x + Math.cos(a) * .225, y + .23, z + Math.sin(a) * .225], [x + Math.cos(a) * .225, y + .25, z + Math.sin(a) * .225], .01, F())); }
    P.push(G.lathe([x, y + .23, z], [0, 1, 0], [[0, .15], [.12, .15]], { caps: true }), G.box([x + so * .14, y + .26, z - .05], [x + so * .22, y + .33, z + .05], F()));
    P.push(G.lathe([x, y + .35, z], [0, 1, 0], [[0, .14], [.02, .17], [.16, .17], [.18, .12]], { caps: true, ds: 1.2 }));
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + .3; P.push(G.lathe([x + Math.cos(a) * .16, y + .44, z + Math.sin(a) * .16], [Math.cos(a), 0, Math.sin(a)], [[0, .05], [.08, .05], [.09, .035]], F({ caps: true }))); }
    P.push(G.box([x - .07, y + .53, z - .07], [x + .07, y + .62, z + .07]), G.cyl([x, y + .58, z + .07], [x, y + .58, z + .13], .02, F()), G.cyl([x, y + .58, z - .07], [x, y + .58, z - .13], .02, F()));
  }
  for (const pl of HE_T) P.push(...pipes(pl, .024, F()));
  for (const s of [-1, 1]) P.push(...pipes(COOL_T(s).slice(3), .045));
  for (const s of [-1, 1]) P.push(G.lathe([s * 1.38, TRN[1], TRN[2]], [s, 0, 0], [[0, .09], [.14, .09]], { caps: true }));
  return P;
}
/* a braided hose: the line through P, crimped ferrules at both ends */
function hose(P, r, o) {
  const out = flex(P, r, o || F({ ds: .8 }));
  for (const [a, b] of [[P[0], P[1]], [P[P.length - 1], P[P.length - 2]]]) { const d = V.norm(V.sub(b, a)); out.push(G.cyl(a, V.mad(a, d, .05), r * 1.55, F()), G.lathe(V.mad(a, d, .05), d, [[0, r * 1.25], [.025, r * 1.25]], F())); }
  return out;
}
function hpuPrims() {
  const P = [], m = HPU.mot, x = m[0], y = m[1];
  // the tank: shell, lid with its bolted clean-out cover, the filler-breather, the sight glass, the drain, lifting eyes
  P.push(G.box([1.32, .3, -4.38], [2.46, .98, -2.98], { ds: 1.2 }));
  P.push(G.box([1.3, .98, -4.4], [2.48, 1.0, -2.96], F({ ds: 1.4 })));
  P.push(G.line([[1.4, 1.002, -2.9 - .08], [1.4, 1.002, -3.06]], F()));
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(G.cyl([1.6 + Math.cos(a) * .12, 1.0, -4.05 + Math.sin(a) * .12], [1.6 + Math.cos(a) * .12, 1.02, -4.05 + Math.sin(a) * .12], .008, F())); }
  P.push(circ([1.6, 1.003, -4.05], [0, 1, 0], .15, F()), circ([1.6, 1.003, -4.05], [0, 1, 0], .135, F()));
  P.push(G.lathe([2.25, 1.0, -3.2], [0, 1, 0], [[0, .03], [.06, .03], [.06, .055], [.12, .055], [.13, .03]], F({ caps: true })));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.line([[2.25 + Math.cos(a) * .056, 1.07, -3.2 + Math.sin(a) * .056], [2.25 + Math.cos(a) * .056, 1.11, -3.2 + Math.sin(a) * .056]], F())); }
  P.push(G.box([2.46, .4, -3.36], [2.48, .9, -3.3], F()), G.lathe([2.5, .44, -3.33], [0, 1, 0], [[0, .018], [.42, .018]], F()), G.box([2.48, .4, -3.36], [2.53, .44, -3.3], F()), G.box([2.48, .86, -3.36], [2.53, .9, -3.3], F()));
  for (let k = 0; k < 5; k++) P.push(G.line([[2.522, .5 + k * .08, -3.345], [2.53, .5 + k * .08, -3.345]], F()));
  P.push(G.cyl([2.0, .34, -4.38], [2.0, .34, -4.48], .025, F()), G.box([1.97, .31, -4.52], [2.03, .37, -4.48], F()));
  for (const [ex, ez] of [[1.36, -4.34], [2.42, -4.34], [1.36, -3.02], [2.42, -3.02]]) P.push(G.lathe([ex, 1.0, ez], [0, 1, 0], [[0, .02], [.05, .02]], F()), circ([ex, 1.07, ez], [1, 0, 1], .025, F()));
  // the electric motor: finned frame, fan cowl and grille, terminal box, feet; the D-end flange
  P.push(G.lathe(m, [0, 0, 1], [[0, .12], [.1, .2], [.12, .2], [.6, .2], [.64, .18], [.7, .18], [.72, .13]], { caps: true, ds: 1.3 }));
  for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, c = Math.cos(a), n = Math.sin(a); if (n < -.55) continue; P.push(G.panel([[x + c * .2, y + n * .2, m[2] + .16], [x + c * .245, y + n * .245, m[2] + .18], [x + c * .245, y + n * .245, m[2] + .6], [x + c * .2, y + n * .2, m[2] + .62]], F({ fill: true, ds: .9 }))); }
  for (const r of [.05, .1, .15]) P.push(circ([x, y, m[2] - .002], [0, 0, 1], r, F()));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.line([[x + Math.cos(a) * .03, y + Math.sin(a) * .03, m[2] - .003], [x + Math.cos(a) * .18, y + Math.sin(a) * .18, m[2] - .003]], F())); }
  P.push(G.box([x - .1, y + .2, m[2] + .22], [x + .1, y + .33, m[2] + .46]), G.cyl([x + .1, y + .26, m[2] + .34], [x + .2, y + .26, m[2] + .34], .022, F()));
  P.push(G.box([x - .2, .98, m[2] + .1], [x + .2, y - .14, m[2] + .2], F()), G.box([x - .2, .98, m[2] + .52], [x + .2, y - .14, m[2] + .62], F()));
  // the bell housing (its windows show the jaw coupling), the pump: housing, shaft, port cover, the compensator
  const pz = HPU.pump[2];
  P.push(G.lathe([x, y, m[2] + .72], [0, 0, 1], [[0, .17], [.04, .17], [.06, .14], [.16, .13], [.18, .15], [.2, .15]], { ds: 2.4 }));
  for (const s of [-1, 1]) P.push(G.line([[x + s * .14, y - .06, m[2] + .78], [x + s * .14, y + .06, m[2] + .78], [x + s * .135, y + .06, m[2] + .86], [x + s * .135, y - .06, m[2] + .86], [x + s * .14, y - .06, m[2] + .78]], F()));
  P.push(G.lathe([x, y, m[2] + .74], [0, 0, 1], [[0, .055], [.06, .055]], F({ caps: true })), G.lathe([x, y, m[2] + .82], [0, 0, 1], [[0, .055], [.06, .055]], F({ caps: true })));
  P.push(G.lathe([x, y, pz], [0, 0, 1], [[0, .13], [.03, .13], [.05, .12], [.3, .12], [.32, .125], [.36, .125], [.44, .12], [.46, .1]], { ds: 2.6 }));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + .3; P.push(G.cyl([x + Math.cos(a) * .115, y + Math.sin(a) * .115, pz + .3], [x + Math.cos(a) * .115, y + Math.sin(a) * .115, pz + .37], .012, F())); }
  P.push(G.box([x - .07, y + .12, pz + .1], [x + .07, y + .2, pz + .26]), G.cyl([x + .07, y + .16, pz + .18], [x + .16, y + .16, pz + .18], .014, F()), G.lathe([x + .12, y + .16, pz + .18], [1, 0, 0], [[0, .022], [.02, .022]], F({ caps: true })));
  P.push(G.box([x - .045, y - .23, pz + .36], [x + .045, y - .12, pz + .44], F()));
  // the pressure filter on its bracket: bowl, head, clogging indicator
  const f = HPU.filt;
  P.push(G.lathe(f, [0, 1, 0], [[0, .03], [.04, .055], [.56, .055], [.6, .045]], { caps: true, ds: 1.3 }));
  P.push(G.box([f[0] - .08, f[1] + .58, f[2] - .08], [f[0] + .08, f[1] + .7, f[2] + .08]), G.lathe([f[0] + .08, f[1] + .64, f[2]], [1, 0, 0], [[0, .02], [.03, .02], [.03, .012], [.045, .012]], F({ caps: true })));
  P.push(G.box([f[0] - .02, .3, f[2] - .06], [f[0] + .02, f[1] + .1, f[2] + .06], F()));
  // the manifold block, its ports and plugs; the stack of four directional valves on it, solenoids both ends
  P.push(G.box([1.38, .3, -2.65], [1.82, .9, -1.75], { ds: 1.1 }));
  for (let k = 0; k < 6; k++) for (let j = 0; j < 2; j++) P.push(circ([1.823, .45 + j * .25, -2.55 + k * .15], [1, 0, 0], .022, F()));
  for (const z of HPU.spool) {
    P.push(G.box([1.5, .9, z - .085], [1.7, 1.02, z + .085]));
    for (const s of [-1, 1]) { const x0 = s > 0 ? 1.7 : 1.5; P.push(G.lathe([x0, .96, z], [s, 0, 0], [[0, .036], [.13, .036], [.14, .028]], F({ caps: true })), G.box([x0 + s * .14 - .02, .95, z - .025], [x0 + s * .14 + .02, 1.0, z + .025], F())); }
    P.push(G.line([[1.5, 1.021, z - .06], [1.7, 1.021, z - .06]], F()), G.line([[1.5, 1.021, z + .06], [1.7, 1.021, z + .06]], F()));
  }
  P.push(G.lathe([1.6, .9, -1.72], [0, 0, 1], [[0, .03], [.12, .03], [.13, .022]], F({ caps: true })), G.lathe([1.45, .9, -2.66], [0, 0, -1], [[0, .028], [.1, .028]], F({ caps: true })));
  // the accumulators: shell, oil end and port, gas end with its charging valve and guard
  for (const a of HPU.acc) {
    P.push(G.lathe(a, [0, 1, 0], [[0, .07], [.04, .12], [.1, .15], [.14, .15], [1.04, .15], [1.1, .13], [1.18, .07], [1.22, .04]], { caps: true, ds: 1.8 }));
    for (const yy of [.15, 1.06]) P.push(circ([a[0], a[1] + yy, a[2]], [0, 1, 0], .152, F()));
    P.push(G.cyl([a[0], a[1] + 1.22, a[2]], [a[0], a[1] + 1.3, a[2]], .018, F()), G.box([a[0] - .05, a[1] + 1.22, a[2] - .05], [a[0] + .05, a[1] + 1.34, a[2] + .05], F({ edgeOnly: true })));
    P.push(G.box([a[0] - .16, .3, a[2] - .1], [a[0] + .16, .36, a[2] + .1], F()), G.box([a[0] - .17, .62, a[2] - .17], [a[0] + .17, .66, a[2] + .17], F({ edgeOnly: true })));
  }
  // the gauge panel (facing outboard): the system pressure gauge (0..25 MPa) and the precharge gauge
  P.push(G.box([2.5, 1.22, -3.78], [2.52, 1.7, -3.26], F()), G.box([2.42, 1.3, -3.7], [2.5, 1.34, -3.66], F()));
  for (const [g, r] of [[HPU.gauge, .085], [HPU.gauge2, .05]]) {
    P.push(G.lathe([g[0] - .02, g[1], g[2]], [1, 0, 0], [[0, r + .01], [.025, r + .01]], { caps: true }), circ([g[0] + .006, g[1], g[2]], [1, 0, 0], r, F()), circ([g[0] + .006, g[1], g[2]], [1, 0, 0], r * .2, F()));
    const n = r > .06 ? 26 : 11;
    for (let k = 0; k < n; k++) { const a = (-135 + 270 * k / (n - 1)) * DEG, L = k % 5 ? .1 : .2, ca = Math.sin(a), sa = Math.cos(a);
      P.push(G.line([[g[0] + .007, g[1] + sa * r * .92, g[2] - ca * r * .92], [g[0] + .007, g[1] + sa * r * (.92 - L), g[2] - ca * r * (.92 - L)]], F())); }
  }
  P.push(...flex(quad3([2.42, 1.32, -3.68], [2.0, 1.1, -3.0], [1.82, .8, -2.62], 10), .006));
  // the oil lines: braided hoses (pump -> filter), rigid tubes, the return; the lines out to the rams and train motors
  P.push(...hose(HYD_P[0], .026));
  for (let i = 1; i < HYD_P.length; i++) P.push(...pipes(HYD_P[i], .02, F()));
  for (const pl of HYD) P.push(...hose(pl, .018));
  P.push(...hose([[1.86, 1.11, -3.1], [1.86, 1.05, -3.1], [1.86, 1.0, -3.1]], .034));
  return P;
}
/* the pump's moving parts (local: the pump's axis Z from its back face): the cylinder block (nine bores, turning), the
   swash plate (tilted by the stroke) */
function hpuBlock() {
  const P = [G.lathe([0, 0, HPU.CB0 - HPU.pump[2]], [0, 0, 1], [[0, .075], [.02, .08], [HPU.CB1 - HPU.CB0, .08]], { caps: true, ds: 1.6 })];
  for (let k = 0; k < HPU.PN; k++) { const a = k / HPU.PN * TAU; P.push(circ([Math.cos(a) * HPU.PR, Math.sin(a) * HPU.PR, HPU.CB1 - HPU.pump[2] + .002], [0, 0, 1], .013, F())); }
  P.push(G.cyl([0, 0, -.05], [0, 0, .46], .016, {}));
  return P;
}
const hpuSwash = () => [G.lathe([0, 0, -.012], [0, 0, 1], [[0, .085], [.024, .085]], { caps: true, ds: 1.2 }), G.box([-.1, -.03, -.03], [-.085, .03, .012], F()), G.line([[0, .086, .013], [0, -.086, .013]], F())];
/* an accumulator's piston (local: its centre) */
const accPiston = () => [G.lathe([0, -.035, 0], [0, 1, 0], [[0, .142], [.07, .142]], { caps: true, ds: 1.1 }), circ([0, -.015, 0], [0, 1, 0], .146, F()), circ([0, .02, 0], [0, 1, 0], .146, F())];

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
/* the head: a stabilised ball turret (r 0.19 between the yoke's arms) turning on the pitch axis, its front flat with
   the TV, IR and laser rangefinder windows in a bezel, a seam round its equator, the access panels' lines */
const EO_R = .19, EO_ZF = .16;
function eoHead() {
  const prof = []; for (let k = 0; k <= 16; k++) { const z = -EO_R + (EO_ZF + EO_R) * k / 16; prof.push([z + EO_R, Math.sqrt(Math.max(0, EO_R * EO_R - z * z))]); }
  const P = [G.lathe([0, 0, -EO_R], [0, 0, 1], prof, { caps: true, ds: .7 })];
  const rf = Math.sqrt(EO_R * EO_R - EO_ZF * EO_ZF);
  P.push(circ([0, 0, EO_ZF + .002], [0, 0, 1], rf, F()), circ([0, 0, EO_ZF + .002], [0, 0, 1], rf - .012, F()));
  for (const a of [0, PI / 2]) { const L = []; for (let k = 0; k <= 48; k++) { const b = -PI / 2 + PI * k / 48, z = Math.sin(b) * EO_R * 1.004, r = Math.cos(b) * EO_R * 1.004; if (z > EO_ZF) break; L.push(a ? [0, r, z] : [r, 0, z]); } P.push(G.line(L, F())); }
  P.push(circ([0, 0, 0], [0, 0, 1], EO_R * 1.005, F()), circ([0, 0, -.1], [0, 0, 1], Math.sqrt(EO_R * EO_R - .01) * 1.005, F()));
  const win = [[-.07, .04, .045, 'TV'], [.07, .04, .05, 'IR'], [0, -.07, .026, 'LRF']];
  for (const [x, y, r] of win) P.push(G.lathe([x, y, EO_ZF - .01], [0, 0, 1], [[0, r * 1.15], [.02, r * 1.15], [.02, r]], F({ caps: true })), circ([x, y, EO_ZF + .012], [0, 0, 1], r * .78, F()), circ([x, y, EO_ZF + .012], [0, 0, 1], r * .4, F()));
  for (const s of [-1, 1]) P.push(G.lathe([s * .17, 0, 0], [s, 0, 0], [[0, .05], [.05, .05]], F({ caps: true })));
  return P;
}
const EO_WIN = [[-.07, .04, EO_ZF + .014], [.07, .04, EO_ZF + .014], [0, -.07, EO_ZF + .014]];
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
    for (const zc of STN) for (const dz of [-.035, .035]) { const z = zc - .14 + dz; P.push(...flex(quad3([s * .365, KY + .245, z], [s * .27, KY + .31, z], [s * .17, .505, z - dz * .4], 7), .011)); }
  }
  // the coils' current bus along the top: a pair of conductors on standoffs over the bands, a drop to each station's
  // current leads
  for (const s of [-1, 1]) {
    P.push(bar([s * .32, .575, -2.3], [s * .32, .575, RZ1 - .3], .05, .016, [0, 1, 0], { ds: 1.2 }));
    for (const zb of BANDS) P.push(G.cyl([s * .32, .46, zb + .05], [s * .32, .567, zb + .05], .011, F()));
    for (const zc of STN) P.push(...bars([[s * .32, .575, zc + .22], [s * .4, .6, zc + .22], [s * .45, KY + .2, zc + .22]], .03, .012, [0, 0, 1], F()));
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
function coilPrims(side) {
  const P = [];
  for (const s of side ? [side] : [-1, 1]) {
    // the winding pack: two pancakes of REBCO tape, the turns drawn as nested racetracks; the stainless former it is
    // wound on; the clamp plates either side with their bolts; the terminal block and the joint to the leads
    const path = racetrack(s * CXC, .25, .14, 14);
    for (let i = 0; i < path.length - 1; i++) if (V.dist(path[i], path[i + 1]) > 1e-4) P.push(bar(path[i], path[i + 1], .034, .075, [1, 0, 0], { ds: 1.2 }));
    for (const dx of [-.026, -.009, .009, .026]) for (const dr of [-.03, -.012, .006, .024]) P.push(G.line(racetrack(s * CXC + dx, .25 + dr, .14, 20), F()));
    P.push(G.box([s * (CXC - .02), -.19, -.14], [s * (CXC + .02), .19, .14], F({ ds: 1.4 })));
    for (const dx of [-.045, .045]) {
      P.push(G.line(racetrack(s * CXC + dx, .3, .14, 20), F()), G.line(racetrack(s * CXC + dx, .2, .14, 20), F()));
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, y = Math.cos(a) * .3, z = Math.sin(a) > 0 ? .14 + Math.sin(a) * .3 : -.14 + Math.sin(a) * .3;
        P.push(G.cyl([s * CXC + dx * 1.15, y * .82, z * .9], [s * CXC + dx * .9, y * .82, z * .9], .007, F())); }
    }
    P.push(G.box([s * (CXC - .03), .27, .1], [s * (CXC + .03), .33, .22], F()), G.cyl([s * CXC, .33, .16], [s * CXC, .38, .2], .01, F()));
    // the cold-mass supports (G10 struts from the cryostat's walls) and the thermal shield's frame
    for (const [y, z] of [[.36, -.3], [.36, .3], [-.36, -.3], [-.36, .3]]) P.push(G.cyl([s * CXC, y * .75, z], [s * (KX1 - .015), y, z * 1.15], .008, F()));
    P.push(G.line([[s * (KX0 + .02), -.37, -.39], [s * (KX1 - .02), -.37, -.39], [s * (KX1 - .02), .37, -.39], [s * (KX0 + .02), .37, -.39], [s * (KX0 + .02), -.37, -.39]], F()));
    P.push(G.line([[s * (KX0 + .02), -.37, .39], [s * (KX1 - .02), -.37, .39], [s * (KX1 - .02), .37, .39], [s * (KX0 + .02), .37, .39], [s * (KX0 + .02), -.37, .39]], F()));
    for (const y of [-.37, .37]) for (const x of [KX0 + .02, KX1 - .02]) P.push(G.line([[s * x, y, -.39], [s * x, y, .39]], F()));
  }
  return P;
}
/* B: the cryocoolers: a pulse-tube cold head on each cryostat. Outside: the mounting flange and its bolts, the rotary
   valve body with the helium supply and return couplings, its finned motor on top, the regenerator and the pulse tube
   side by side, the buffer volume with the inertance tube wound round it. Inside (seen through the cryostat's shell):
   the two tubes down to the first stage (40 K) and the second (20 K), copper discs, the braided thermal strap from
   the second stage to the coil */
const COLD = []; for (const zc of STN) for (const s of [-1, 1]) COLD.push([s * .5, KY, zc - .14]);
const COLD_HERO = 9;
const XST = 6;                                          // (the station drawn apart in round 3: its cold heads are COLD 12 (port), 13)                                    // (station 4, starboard: the cold head the lens watches frost over, finer)
function cryoPrims(only) {
  const P = [];
  const sel = only === undefined ? COLD : Array.isArray(only) ? only.map(i => COLD[i]) : typeof only === 'object' ? COLD.filter((c, i) => !only.not.includes(i)) : [COLD[only]];
  for (const c of sel) {
    const s = Math.sign(c[0]), [x, y, z] = c, ix = -s;                   // (ix: toward the bore)
    P.push(G.lathe(c, [0, 1, 0], [[0, .095], [.022, .095]], { caps: true, ds: .8 }));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.lathe([x + Math.cos(a) * .08, y + .022, z + Math.sin(a) * .08], [0, 1, 0], [[0, .007], [.01, .007]], F({ caps: true }))); }
    // the valve body, its couplings, the motor
    P.push(G.lathe([x, y + .2, z], [0, 1, 0], [[0, .05], [.012, .058], [.07, .058], [.08, .05]], { caps: true, ds: .9 }));
    for (const dz of [-.035, .035]) P.push(G.lathe([x + ix * .055, y + .245, z + dz], [ix, 0, 0], [[0, .013], [.04, .013], [.045, .019], [.075, .019], [.08, .012]], F({ caps: true })));
    P.push(G.lathe([x, y + .28, z], [0, 1, 0], [[0, .06], [.012, .07], [.1, .07], [.11, .05], [.12, .02]], { caps: true, ds: 1.1 }));
    for (let k = 0; k < 7; k++) P.push(circ([x, y + .3 + k * .012, z], [0, 1, 0], .082, F()));
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P.push(G.line([[x + Math.cos(a) * .072, y + .292, z + Math.sin(a) * .072], [x + Math.cos(a) * .082, y + .292, z + Math.sin(a) * .082], [x + Math.cos(a) * .082, y + .378, z + Math.sin(a) * .082]], F())); }
    P.push(G.box([x - .02, y + .4, z - .03], [x + .02, y + .43, z + .03], F()));
    // the regenerator and the pulse tube between the flange and the valve body
    P.push(G.lathe([x + ix * .022, y + .022, z], [0, 1, 0], [[0, .026], [.178, .026]], { ds: .7 }), G.lathe([x - ix * .03, y + .022, z], [0, 1, 0], [[0, .016], [.178, .016]], { ds: .7 }));
    for (const yy of [.07, .13]) P.push(circ([x + ix * .022, y + yy, z], [0, 1, 0], .028, F()), circ([x - ix * .03, y + yy, z], [0, 1, 0], .018, F()));
    // the buffer volume and its inertance tube (a helix round it)
    const bz = z + .11;
    P.push(G.lathe([x, y + .03, bz], [0, 1, 0], [[0, .02], [.01, .032], [.15, .032], [.16, .02]], { caps: true, ds: .8 }));
    const hx = []; for (let k = 0; k <= 70; k++) { const a = k / 70 * 5 * TAU; hx.push([x + Math.cos(a) * .042, y + .05 + .11 * k / 70, bz + Math.sin(a) * .042]); }
    P.push(G.line(hx, F()), ...flex([[x, y + .2, z + .05], [x, y + .21, bz - .02], [x, y + .17, bz - .04]], .006));
    // inside the cryostat: the tubes down to the stages, the stages, the thermal strap to the coil
    P.push(G.lathe([x + ix * .022, y - .3, z], [0, 1, 0], [[0, .02], [.3, .02]], F({ ds: .9 })), G.lathe([x - ix * .03, y - .3, z], [0, 1, 0], [[0, .013], [.3, .013]], F({ ds: .9 })));
    P.push(G.lathe([x, y - .14, z], [0, 1, 0], [[0, .06], [.02, .06]], F({ caps: true })), G.lathe([x, y - .32, z], [0, 1, 0], [[0, .045], [.025, .045]], F({ caps: true })));
    const st = quad3([x, y - .32, z], [x + ix * .02, y - .4, z + .1], [s * CXC, .27, z + .14 + .02], 10);
    for (const d of [-.008, 0, .008]) P.push(G.line(st.map(p => [p[0] + d, p[1], p[2] + d]), F()));
  }
  return P;
}
const FROST = { pts: null, n: 0, rng: null };            // (rng: [first, end) point per cold head (COLD order), then the headers)
/* frost: seeded points [x, y, z (B), kind, station, order]; kind 0 a cold head (growing from its cold flange up),
   1 its flex line, 2 the helium headers (z: where the cold front reaches them), 3 a cryostat's top and its lead
   tower (as the station's coils reach 20 K). order (0..1): when, within its part's frosting, the point appears */
function frostCloud() {
  const r = M3.rng(7741), A = [];
  const push = (x, y, z, kind, k, h) => A.push(x, y, z, kind, k, h);
  const RG = [];
  COLD.forEach((c, i) => {
    RG.push(A.length / 6); const k = i >> 1, ix = -Math.sign(c[0]), bz = c[2] + .11, mul = i === COLD_HERO ? 5 : 1;
    // crystals: clusters of three or four dots, on the tubes and the flange (from the flange up), the buffer, the
    // valve body's couplings
    const crystal = (px, py, pz, kind, h) => { const n = 2 + Math.floor(r() * 3); for (let q = 0; q < n; q++) push(px + (r() - .5) * .007, py + (r() - .5) * .007, pz + (r() - .5) * .007, kind, k, Math.min(.999, h + .02 * r())); };
    for (let j = 0; j < 260 * mul; j++) { const a = r() * TAU, u = Math.pow(r(), 1.2), rr = .029 + .012 * r() * r(); crystal(c[0] + ix * .022 + Math.cos(a) * rr, c[1] + .022 + .178 * u, c[2] + Math.sin(a) * rr, 0, .6 * u + .4 * r()); }
    for (let j = 0; j < 160 * mul; j++) { const a = r() * TAU, u = Math.pow(r(), 1.2), rr = .019 + .01 * r() * r(); crystal(c[0] - ix * .03 + Math.cos(a) * rr, c[1] + .022 + .178 * u, c[2] + Math.sin(a) * rr, 0, .6 * u + .4 * r()); }
    for (let j = 0; j < 150 * mul; j++) { const a = r() * TAU, rr = .03 + .065 * Math.sqrt(r()); crystal(c[0] + Math.cos(a) * rr, c[1] + .022 + .006 * r(), c[2] + Math.sin(a) * rr, 0, .45 * r()); }
    for (let j = 0; j < 120 * mul; j++) { const a = r() * TAU, u = r(), rr = .034 + .01 * r(); crystal(c[0] + Math.cos(a) * rr, c[1] + .04 + .15 * u, bz + Math.sin(a) * rr, 0, .25 + .5 * u + .25 * r()); }
    for (let j = 0; j < 50 * mul; j++) { const dz = r() < .5 ? -.035 : .035, u = r(), a = r() * TAU; crystal(c[0] + ix * (.06 + .07 * u), c[1] + .245 + Math.cos(a) * .022, c[2] + dz + Math.sin(a) * .022, 0, .55 + .45 * r()); }
    const sg = Math.sign(c[0]), P = quad3([sg * .365, KY + .245, c[2] + .035], [sg * .27, KY + .31, c[2] + .035], [sg * .17, .505, c[2] + .021], 24);
    for (let j = 0; j < 110; j++) { const q = Math.floor(r() * 24), u = r(), a = r() * TAU, p = V.lerp(P[q], P[q + 1], u), rr = .014 + .014 * r(); push(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr, p[2] + (r() - .5) * .01, 1, k, (q + u) / 24 * .6 + .4 * r()); }
    // the cryostat's top over the station, its lead tower
    const zc = STN[k], s = Math.sign(c[0]);
    for (let j = 0; j < 160; j++) { const x = s * (KX0 + (KX1 - KX0) * r()), z = zc - KZ + 2 * KZ * r(); push(x, KY + .004 + .006 * r(), z, 3, k, r()); }
    for (let j = 0; j < 60; j++) { const a = r() * TAU, y = KY + .16 * r(); push(s * .45 + Math.cos(a) * .043, y, zc + .22 + Math.sin(a) * .043, 3, k, .3 + .7 * r()); }
  });
  RG.push(A.length / 6);
  for (const s of [-1, 1]) for (let i = 0; i < 4200; i++) { const z = -2.0 + r() * (RZ1 - 1.8), a = r() * TAU, rr = .028 + .022 * r() * r(); push(s * .17 + Math.cos(a) * rr, .48 + Math.sin(a) * rr, z, 2, -1, r()); }
  RG.push(A.length / 6);
  FROST.pts = new Float32Array(A); FROST.n = A.length / 6; FROST.rng = RG;
  return null;
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
/* the elevation ram's cylinder (local: the base pin at the origin, +Z toward the rod's end): the base clevis and pin,
   the cap end, the barrel, the gland and its nut; the oil ports at both ends with their fittings; the position
   transducer along it */
function ramCyl() {
  const P = [G.lathe([0, 0, -.1], [0, 0, 1], [[0, .06], [.1, .06], [.1, .118], [.2, .118], [.2, .1], [1.18, .1], [1.2, .112], [1.26, .122], [1.33, .122], [1.33, .07]], { caps: true, ds: 1.1 })];
  for (const s of [-1, 1]) P.push(G.box([s * .05, -.09, -.2], [s * .085, .09, -.05]));
  P.push(G.cyl([-.11, 0, -.14], [.11, 0, -.14], .028, F()));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(G.line([[Math.cos(a) * .123, Math.sin(a) * .123, 1.26], [Math.cos(a) * .123, Math.sin(a) * .123, 1.33]], F())); }
  for (const z of [.12, 1.08]) P.push(G.box([.095, -.05, z - .05], [.15, .05, z + .05]), G.cyl([.15, 0, z], [.19, 0, z], .022, F()), G.lathe([.19, 0, z], [1, 0, 0], [[0, .03], [.035, .03]], F({ caps: true })));
  P.push(G.cyl([-.01, .125, .2], [-.01, .125, 1.24], .011, F()), G.box([-.04, .1, .18], [.02, .16, .26], F()));
  for (const z of [.4, .7, 1.0]) P.push(circ([0, 0, z], [0, 0, 1], .102, F()));
  return P;
}
/* the ram's rod (local: the rod's eye at the origin, the rod running back down -Z into the cylinder): the chromed rod,
   the rod end with its spherical bearing and pin */
function ramRod() {
  const P = [G.cyl([0, 0, -1.5], [0, 0, -.1], .055, { ds: .9 }), G.lathe([0, 0, -.1], [0, 0, 1], [[0, .062], [.03, .07], [.08, .07]], { caps: true })];
  for (const a of [.6, 2.4, 4.2]) P.push(G.line([[Math.cos(a) * .056, Math.sin(a) * .056, -1.45], [Math.cos(a) * .056, Math.sin(a) * .056, -.12]], F()));
  P.push(G.lathe([-.045, 0, 0], [1, 0, 0], [[0, .075], [.09, .075]], { caps: true }), circ([.046, 0, 0], [1, 0, 0], .045, F()), G.cyl([-.1, 0, 0], [.1, 0, 0], .028, { caps: true }));
  return P;
}
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
const RACK_OCC = RACKS.map(rk => { const s = rk.s, x0 = s * 2.8, x1 = s * 3.26, y0 = FL + .2, y1 = FL + .12 + 3 * 1.12 + .6, z0 = rk.z0 + .14, z1 = rk.z1 - .14;
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
  // the volute: a spiral casing (its walls sparse, the spiral's edges drawn) widening round to the discharge at the
  // top; the cutwater; the back plate; the suction nozzle in front with its flange
  P.push(G.lathe([0, 0, 1.06], [0, 0, 1], [[0, .17], [.04, .2], [.04, .24]], F({ ds: 2.4 })));
  const vR = a => .255 + .085 * a / TAU, vP = (a, r, z) => [Math.cos(PI / 2 + a) * r, Math.sin(PI / 2 + a) * r, z];
  for (const z of [1.1, 1.38]) { const L = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * TAU; L.push(vP(a, vR(a) + .02, z)); } P.push(G.line(L)); }
  for (let k = 0; k < 64; k++) { const a0 = k / 64 * TAU, a1 = (k + 1) / 64 * TAU;
    P.push(G.panel([vP(a0, vR(a0) + .02, 1.1), vP(a1, vR(a1) + .02, 1.1), vP(a1, vR(a1) + .02, 1.38), vP(a0, vR(a0) + .02, 1.38)], F({ fill: true, ds: 2.6 }))); }
  for (const z of [1.1, 1.38]) for (let k = 0; k < 64; k++) { const a0 = k / 64 * TAU, a1 = (k + 1) / 64 * TAU;
    P.push(G.panel([vP(a0, .2, z), vP(a1, .2, z), vP(a1, vR(a1) + .02, z), vP(a0, vR(a0) + .02, z)], F({ fill: true, ds: 3.2 }))); }
  for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU; P.push(G.line([vP(a, vR(a) + .02, 1.1), vP(a, vR(a) + .02, 1.38)], F())); }
  P.push(G.line([vP(.15, .27, 1.1), vP(.0, .255, 1.24), vP(.15, .27, 1.38)]));
  P.push(G.cyl([0, .3, 1.24], [0, .55, 1.24], .075, { ds: 1.2 }), G.lathe([0, .5, 1.24], [0, 1, 0], [[0, .12], [.04, .12]], F({ caps: true })));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.cyl([Math.cos(a) * .1, .5, 1.24 + Math.sin(a) * .1], [Math.cos(a) * .1, .56, 1.24 + Math.sin(a) * .1], .008, F())); }
  P.push(G.lathe([0, 0, 1.38], [0, 0, 1], [[0, .2], [.03, .12], [.12, .1], [.17, .1]], { ds: 1.2 }), G.lathe([0, 0, 1.5], [0, 0, 1], [[0, .15], [.04, .15]], F({ caps: true })));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P.push(G.cyl([Math.cos(a) * .13, Math.sin(a) * .13, 1.5], [Math.cos(a) * .13, Math.sin(a) * .13, 1.56], .008, F())); }
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
  // the impeller: hub and nut, the back shroud, six backward-curved vanes, the front shroud with its eye, the wear ring
  P.push(G.lathe([0, 0, 1.12], [0, 0, 1], [[0, .055], [.12, .05], [.16, .03], [.18, .015]], { caps: true }));
  P.push(G.lathe([0, 0, 1.15], [0, 0, 1], [[0, .29], [.012, .29]], { caps: true, ds: 1.1 }));
  const vane = (k, r, w) => { const u = (r - .06) / .23, a = k / 6 * TAU + 1.1 * Math.sqrt(u) + w; return [Math.cos(a) * r, Math.sin(a) * r]; };
  for (let k = 0; k < 6; k++) for (let j = 0; j < 10; j++) {
    const r0 = .06 + .23 * j / 10, r1 = .06 + .23 * (j + 1) / 10, p0 = vane(k, r0, 0), p1 = vane(k, r1, 0), h0 = .07 - .025 * j / 10, h1 = .07 - .025 * (j + 1) / 10;
    P.push(G.panel([[p0[0], p0[1], 1.162], [p1[0], p1[1], 1.162], [p1[0], p1[1], 1.162 + h1], [p0[0], p0[1], 1.162 + h0]], F({ fill: true, ds: 1.6 })));
  }
  P.push(G.lathe([0, 0, 1.235], [0, 0, 1], [[0, .29], [.012, .29], [.03, .1], [.08, .1]], { ds: 1.4 }), circ([0, 0, 1.31], [0, 0, 1], .1), circ([0, 0, 1.31], [0, 0, 1], .085, F()));
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

/* ================= occlusion: 4 px depth tiles written by convex occluders =================
   An occluder of strength s < 1 (one fading in or out) writes its own depth layer: what is behind it dims by s
   (OZP / OSP; occd dithers it per pixel) instead of vanishing at a threshold */
const BW_ = K.BW, BH_ = K.BH, OT = 4, OW = Math.ceil(BW_ / OT), OHt = Math.ceil(BH_ / OT), OZ = new Float32Array(OW * OHt);
const OZP = new Float32Array(OW * OHt), OSP = new Float32Array(OW * OHt);
let occOn = false, occP = false;
function occReset() { if (occOn) OZ.fill(1e9); if (occP) { OZP.fill(1e9); OSP.fill(0); } occOn = false; occP = false; }
/* a convex hex (8 corners, world) : each tile whose centre ray enters it gets the entry depth (a little deeper);
   s: its strength (0..1, default 1) */
function occHex(C8, s) {
  const C = K.C, e = C.eye, f = C.f, r = C.r, u = C.u, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  if (s !== undefined && s < .999) { if (s <= .001) return; } else s = 1;
  if (!occOn) { OZ.fill(1e9); occOn = true; }
  if (s < 1 && !occP) { OZP.fill(1e9); OSP.fill(0); occP = true; }
  const ZB = s < 1 ? OZP : OZ;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of C8) { if (!K.pj(p[0], p[1], p[2])) { x0 = 0; y0 = 0; x1 = BW_ - 1; y1 = BH_ - 1; break; } const px = K.PJ[0], py = K.PJ[1]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
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
      for (let v = 0; v < 2; v++) {
        if (ty + v >= OHt) break; const k = (ty + v) * OW + tx;
        if (zz < ZB[k]) ZB[k] = zz; if (tx + 1 < OW && zz < ZB[k + 1]) ZB[k + 1] = zz;
        if (s < 1) { if (s > OSP[k]) OSP[k] = s; if (tx + 1 < OW && s > OSP[k + 1]) OSP[k + 1] = s; }
      }
    }
  }
}
/* a point hidden behind an occluder (screen x, y, depth); behind a fading one, hidden on a stable per-pixel dither */
const occd = (x, y, z) => {
  if (!occOn || x < 0 || y < 0 || x >= BW_ || y >= BH_) return false;
  const t = ((y | 0) >> 2) * OW + ((x | 0) >> 2);
  if (z > OZ[t]) return true;
  return occP && z > OZP[t] && ((Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 22) / 1024 < OSP[t];
};
/* how visible a point is: 1, 0 behind an occluder, 1 - s behind a fading one */
const occv = (x, y, z) => {
  if (!occOn || x < 0 || y < 0 || x >= BW_ || y >= BH_) return 1;
  const t = ((y | 0) >> 2) * OW + ((x | 0) >> 2);
  return z > OZ[t] ? 0 : occP && z > OZP[t] ? 1 - OSP[t] : 1;
};

/* ================= the X-ray point pass =================
   XS.zo / zs: the opening and shutting slices (ship z, both sweep bow -> stern); open where zo < z < zs inside
   the box. md 0 plain · 1 shell (thinned where open, lime at the slices) · 3 hidden (seen only where open).
   S: model -> ship transform for clouds not in the ship frame (or null); zfix: test this ship z instead. */
const XS = { zo: 99, zs: 99, ko: 1, ks: 1, box: [-11, 11, -1.5, 10.5, 40.4, 57.6], dim: 1, gain: 1 };   // (gain: a fade on all drawX draws)
const LIME = K.LIME, WH = K.WH;
const XO = { a: 1, fade: 900, back: .1, lime: 0, keep: 1, md: 0, zfix: undefined, size: 1, S: null, tint: null, tk: 0, cut: null, px: 3.2, edge: .62, occ: true, bk: .33, lmin: 0, px0: 99, foc: 0, amb: 0, qc: null, brk: null, sea: null, lt: null, nl: 0 };
/* qc: a quarter cut in model coords [x0, y0, z0, z1, mode]: mode 1 drops the points with x > x0, y > y0, z0 < z < z1
   (the cutaway), -1 keeps only those (the piece cut away, drawn apart) */
const XOO = Object.assign({}, XO);
function xopt(o) { for (const k in XO) XOO[k] = o && o[k] !== undefined ? o[k] : XO[k]; return XOO; }
function runX(P, i0, i1, sp, o, md, step) {
  const x = XMR, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, BW = BW_, BH = BH_;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a * XS.gain, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, big = o.size, omd = o.md, allThin = md === 2, eb = o.edge, amb = o.amb;
  const lm = o.lime, useOcc = occOn && o.occ, bkeep = o.bk;
  let cr = WH[0] + (LIME[0] - WH[0]) * lm, cg = WH[1] + (LIME[1] - WH[1]) * lm, cb = WH[2] + (LIME[2] - WH[2]) * lm;
  if (o.tint) { const tk = o.tk; cr += (o.tint[0] - cr) * tk; cg += (o.tint[1] - cg) * tk; cb += (o.tint[2] - cb) * tk; }
  const zo = XS.zo, zs = XS.zs, ko = XS.ko, ks = XS.ks, bx = XS.box, S = o.S, zfix = o.zfix, dim = XS.dim, cut = o.cut, c0 = cut ? cut[0] : 0, c1 = cut ? cut[1] : 0;
  const anyOpen = zo < 90, qc = o.qc, qm = qc ? qc[4] : 0, qx0 = qm ? qc[0] : 0, qy0 = qm ? qc[1] : 0, qz0 = qm ? qc[2] : 0, qz1 = qm ? qc[3] : 0;
  for (let i = i0, j = i0 * 6; i < i1; i += step, j += 6 * step) {
    const hs = (i * .6180339887) % 1;
    if (keep < 1 && hs > keep) continue;
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    if (cut && pz > c0 && pz < c1) continue;
    if (qm) { const inq = px > qx0 && py > qy0 && pz > qz0 && pz < qz1; if (qm > 0 ? inq : !inq) continue; }
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
    let ov = 1;
    if (useOcc) { const t = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (zc > OZ[t]) continue; if (occP && zc > OZP[t]) ov = 1 - OSP[t]; }
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
    if (ov < 1) b *= ov;
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
/* (duel) the destroyer struck at sea (proto/strike_sea.js): runX without the X-ray, plus
   brk { side (1 the bow piece, -1 the stern piece, 2 the whole ship before it parts), kd (0..1 the hull parted round the hole), eh (0..1 the torn
         edges' heat), tab } where tab (strike_sea.js breakTab, its per-frame state set by tabFrame) holds
         - the split: until the hull parts both pieces meet on zsp(x, y); then the bow keeps z > zsp + kd jb, the stern
           z < zsp - kd js (torn surfaces, tabulated over x, y), the blown-out superstructure's half length bl round zc
         - the rod's hole: its path hp (a point, a direction), the radius hr (r0 + r1 sat((y - y0) / ys)) blown open
           (hg) behind the nose (sn: the nose's distance along the path), its rim's plating bent along the path and
           glowing (heat)
         - the chain's vents VT (x y z r t0, by z), opening as each blast goes, their rims curled out and glowing
         - the foredeck peeled open (PK: per 0.5 m of z from PZ0: the deck's height, the half-width, when the chain's
           front passes, the fold of that strip of plating (rad; < 0 blown away))
         - the near side cut away for the passage (cut 0..1 on side cs), the mount hidden once thrown (mountHide:
           the strike draws it then)
   sea { under (the lens below the surface), own (the strike's own pass) }: what is under water (world y < 0) fades
         with its depth (from above) or its distance (from below),
   lt (world lights, stride 8: x y z intensity radius r g b), nl: the fires and the flash light the plating
   (world positions from the lens's own basis: no model transform needed); lime as in runX */
const BRK_EDGE = [255, 168, 96], BRK_HOT = [255, 236, 200];
let XB_TAB = null;                                                   // (the last tab seen: the mount's pass follows the ship's)
function runXB(P, i0, i1, sp, o, step) {
  const x = XMR, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, BW = BW_, BH = BH_;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a * XS.gain, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, eb = o.edge, amb = o.amb, bkeep = o.bk;
  const cut = o.cut, c0 = cut ? cut[0] : 0, c1 = cut ? cut[1] : 0;
  const B = o.brk, side = B ? B.side : 0, kd = B ? B.kd : 0, eh = B ? B.eh : 0, TB = B ? B.tab : null;
  const SE = o.sea, under = SE ? SE.under : false, E_ = C.eye, Cr = C.r, Cu = C.u, Cf = C.f;
  if (TB) XB_TAB = TB;
  // the mount, once thrown, is the strike's to draw (its own pass: sea.own)
  if (!B && SE && !SE.own && XB_TAB && XB_TAB.on && XB_TAB.mountHide) return;
  const LT = o.lt, nl = LT ? o.nl : 0;
  const lm = o.lime || 0;
  const cr0 = WH[0] + (LIME[0] - WH[0]) * lm, cg0 = WH[1] + (LIME[1] - WH[1]) * lm, cb0 = WH[2] + (LIME[2] - WH[2]) * lm;
  const ON = !!(TB && TB.on && side);
  // the hole
  const hp = ON ? TB.hp : null, hx = ON ? hp[0] : 0, hy = ON ? hp[1] : 0, hz = ON ? hp[2] : 0, hdx = ON ? hp[3] : 0, hdy = ON ? hp[4] : -1, hdz = ON ? hp[5] : 0;
  const hr = ON ? TB.hr : null, sn = ON ? TB.sn : -1e9, hg = ON ? TB.hg : 0, hheat = ON ? TB.heat : 0, ky = ON ? TB.ky : -9, tau = ON ? TB.tau : -1;
  const VT = ON ? TB.VT : null, nv = ON ? TB.nv : 0, PK = ON ? TB.PK : null, PZ0 = ON ? TB.PZ0 : 0, NPZ = ON ? TB.NPZ : 0;
  const cutA = TB && side ? TB.cut : 0, cs = TB ? TB.cs : 1;
  const BLT = ON ? TB.BLT : null, nbl = ON && BLT ? TB.nbl : 0, BLZ0 = ON ? TB.BLZ0 : 0, BLZ1 = ON ? TB.BLZ1 : 0, CRK = ON ? TB.CRK : null;
  let lw = -1, lr = 0, lg = 0, lbb = 0;
  for (let i = i0, j = i0 * 6; i < i1; i += step, j += 6 * step) {
    const hs = (i * .6180339887) % 1;
    if (keep < 1 && hs > keep) continue;
    let px = P[j], py = P[j + 1], pz = P[j + 2];
    if (cut && pz > c0 && pz < c1) continue;
    let db = 99, hot = 0, dim = 1;
    if (side) {
      let ix = ((px - TB.x0) * TB.inv) | 0, iy = ((py - TB.y0) * TB.inv) | 0;
      if (ix < 0) ix = 0; else if (ix >= TB.nx) ix = TB.nx - 1; if (iy < 0) iy = 0; else if (iy >= TB.ny) iy = TB.ny - 1;
      const k = iy * TB.nx + ix;
      if (TB.on && TB.hg > .3 && py > 7.4) { const dz = pz - TB.zc; if ((dz < 0 ? -dz : dz) < TB.bl[k] && px * px + dz * dz * .49 < 169) continue; }     // (blown out: debris)
      db = side === 2 ? 99 : side > 0 ? pz - (TB.zsp[k] + kd * TB.jb[k]) : (TB.zsp[k] - kd * TB.js[k]) - pz;   // (2: the whole ship, not yet parted)
      if (db < 0) continue;
      if (kd > 0 && db < 9) {                                        // the plating flared out, decks buckled, the lip curled
        const kk = Math.pow(1 - db / 9, 2.2) * kd, nz = .5 + .5 * Math.sin(px * 1.7 + py * 2.3 + pz * .9 + side);
        px += (px < 0 ? -1 : 1) * kk * (.9 + 1.1 * nz) * (px > 4 || px < -4 ? 1 : .4);
        py += (py > 4 ? .8 : -.6) * kk * (.6 + .8 * nz) - .9 * kk * kk;
        pz += -side * kk * .6 * (1 + nz);
      } else if (kd <= 0) db = 99;
      if (ON) {
        // the rod's hole: blown open behind the nose, its rim bent along the path and glowing
        if (hg > 0 && py < 10 && py > ky - .6 && pz > hz - 22 && pz < hz + 12) {
          const t = (py - hy) / hdy, qx = px - (hx + hdx * t), qz = pz - (hz + hdz * t), d = Math.sqrt(qx * qx + qz * qz);
          const R = (hr[0] + hr[1] * Math.min(1, Math.max(0, (py - hr[2]) / hr[3]))) * hg * Math.min(1, Math.max(0, (sn - t) / 2.5));
          if (R > .05) {
            // (build 2: a ragged crater, its petals of plating bent down the path, curled back and out, glowing)
            const an = Math.atan2(qz, qx), Rr = R * (1 + .2 * Math.sin(5 * an + py * .9) + .12 * Math.sin(11 * an + 2.1 * py) + .07 * Math.sin(23 * an));
            if (d < Rr) continue;
            const w = d - Rr;
            if (w < 4.2) {
              const k2 = (1 - w / 4.2) * (1 - w / 4.2), id = 1 / (d || 1), wob = .6 + .8 * (.5 + .5 * Math.sin(an * 7 + py * 1.3)), cu = k2 * k2 * (1.6 + 1.2 * wob);
              px += hdx * k2 * 2.2 * wob + qx * id * cu; py += hdy * k2 * 2.2 * wob + (py > hy - 2 ? cu * .8 : 0); pz += hdz * k2 * 2.2 * wob + qz * id * cu;
              hot = Math.max(hot, k2 * hheat * 1.15);
            }
          }
        }
        // the chain's vents: blown open as each blast goes, the rims curled out and glowing
        if (nv && pz > VT[2] - 7 && pz < VT[(nv - 1) * 5 + 2] + 7) {
          let gone = false;
          const zi = (pz - TB.VZ0) | 0;
          for (let q = zi < 0 ? 0 : zi > TB.NVZ ? nv : TB.VZI[zi]; q < nv; q++) {
            const o5 = q * 5, vz = VT[o5 + 2], vr = VT[o5 + 3]; if (vz - 9 > pz) break; if (pz < vz - vr - 2.5 || pz > vz + vr + 2.5) continue;
            const a = tau - VT[o5 + 4]; if (a <= 0) continue;
            const qx = px - VT[o5], qy = py - VT[o5 + 1], qz = pz - vz, d2 = qx * qx + qy * qy + qz * qz, an = Math.atan2(qy, qz + qx * .5);
            const R = vr * Math.sqrt(Math.min(1, a / .006)) * (1 + .28 * Math.sin(3 * an + vz) + .16 * Math.sin(7 * an + 2.3 * vz) + .1 * Math.sin(13 * an + vz * 5));   // (torn, not round)
            if (d2 < R * R) { gone = true; break; }
            const d = Math.sqrt(d2), w = d - R;
            if (w < 2.2) { const k2 = (1 - w / 2.2) * (1 - w / 2.2), f = k2 * 1.3 / (d || 1); px += qx * f; py += qy * f + k2 * .5; pz += qz * f; hot = Math.max(hot, k2 * Math.exp(-a / 2.2)); }
          }
          if (gone) continue;
        }
        // (build 2) each blast's push: the side plating bulged out 2-8 m round it and torn between the frames, the deck
        // over it domed up; the plating white-hot where it tore, cooling
        if (nbl && pz > BLZ0 && pz < BLZ1 && py < 9.5) {
          const anx = P[j + 3], any = P[j + 4];
          for (let q = 0; q < nbl; q++) {
            const o5 = q * 5, dz = pz - BLT[o5 + 2]; if (dz > 16 || dz < -16) continue;
            const a = tau - BLT[o5 + 3]; if (a <= 0) continue;
            const fz = 1 - dz * dz / 256, gz = fz * fz, s5 = BLT[o5 + 4], gr = 1 - Math.exp(-a / .0035);
            if (anx > .55 || anx < -.55) {
              const dy = (py - BLT[o5 + 1] - 1.5) / 5.5, vy = Math.exp(-dy * dy), m = 6.2 * s5 * gr * gz * vy;
              if (m > .05) {
                const fr = ((pz + 40) / 1.25) % 1, tr = m > 1.8 ? Math.min(.34, (m - 1.8) * .09) : 0;
                if (fr < tr) continue;                                    // (torn open between two frames)
                px += (px < 0 ? -m : m) * (.75 + .25 * Math.sin(py * 1.9 + pz * .7)); py += .25 * m * dy;
                hot = Math.max(hot, Math.min(1, m / 4) * (fr < tr + .1 ? 1 : .55) * Math.exp(-a / .03));
              }
            } else if (any > .55 && py > 3) {
              const m = 2.6 * s5 * gr * gz * Math.exp(-px * px / 30);
              if (m > .05) { py += m; hot = Math.max(hot, Math.min(1, m / 3) * .6 * Math.exp(-a / .03)); }
            }
          }
          // the cracks: along the keel under the magazines as the front passes, and up the sides at three blasts
          if (py < -1.8) {
            const bi = ((pz - PZ0) * 2) | 0;
            if (bi >= 0 && bi < NPZ && pz > TB.MZ0 && pz < TB.MZ1) {
              const a = tau - PK[bi * 4 + 2] + .0008;
              if (a > 0) { const xc = .5 * Math.sin(pz * .9) + .25 * Math.sin(pz * 2.7 + 1), w = Math.min(1.5, a * 260), dxc = px - xc; if (dxc > -w && dxc < w) continue; const e = (dxc < 0 ? -dxc : dxc) - w; if (e < 1.6) { px += (dxc < 0 ? -1 : 1) * .5 * w * (1 - e / 1.6); hot = Math.max(hot, (1 - e / 1.6) * Math.exp(-a / .06)); } }
            }
          }
          for (let q = 0; q < CRK.length; q += 2) {
            const a = tau - CRK[q + 1]; if (a <= 0) continue;
            const top = ky + a * 2600; if (py > top) continue;
            const zc = CRK[q] + .7 * Math.sin(py * 1.3 + q) + .35 * Math.sin(py * 3.7 + q * 2), w = Math.min(1.1, a * 200) * (1 - .5 * Math.min(1, (py - ky) / 14)), dzc = pz - zc;
            if (dzc > -w && dzc < w) continue;
            const e = (dzc < 0 ? -dzc : dzc) - w; if (e < 1.4) { pz += (dzc < 0 ? -1 : 1) * .6 * w * (1 - e / 1.4); hot = Math.max(hot, (1 - e / 1.4) * Math.exp(-a / .05)); }
          }
        }
        // the foredeck peeled open behind the chain's front: strips of deck plating folded up and out over the sides
        if (side > 0 && pz > PZ0 && py > 2) {
          const bi = ((pz - PZ0) * 2) | 0;
          if (bi < NPZ) {
            const b4 = bi * 4, phm = PK[b4 + 3], dyk = PK[b4];
            if (phm !== 0 && py > dyk - 1.3 && py < dyk + .8) {
              const a = tau - PK[b4 + 2];
              if (a > 0) {
                if (phm < 0) { if (a > .002) continue; }
                else {
                  const hw = PK[b4 + 1], sg = px < 0 ? -1 : 1, r = hw - px * sg;
                  if (r > 0 && r < hw + .2) {
                    const ph = phm * (1 - Math.exp(-a / .35)), c = Math.cos(ph), s = Math.sin(ph);
                    px = sg * (hw - r * c); py = dyk + r * s + (py - dyk) * c;
                    hot = Math.max(hot, .5 * Math.exp(-a / 1.5) * Math.min(1, r / 2));
                  }
                }
              }
            }
          }
        }
      }
      // the passage: the near side's shell cut away round the path (a cutaway), the decks inside drawn by the strike
      if (cutA > 0 && px * cs > 1.4 && py < 9.4) {
        const t = (py - (ON ? hy : 6.5)) / (ON ? hdy : -1), zp = (ON ? hz + hdz * t : 0);
        const dz = pz - zp;
        if (dz > -17 && dz < 17) { const e = Math.min(1, (17 - (dz < 0 ? -dz : dz)) / 4) * cutA; if (hs > 1 - .86 * e) continue; dim = 1 - .6 * e; }
      }
    }
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5], two = nx === 0 && ny === 0 && nz === 0;
    let dn = 0;
    if (!two) { dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez); if (dn > 0 && (bkeep === 0 || ((i * .7548776662) % 1) > bkeep)) continue; }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const iz = F_ / zc, xc_ = a00 * px + a01 * py + a02 * pz + b0, yc_ = a10 * px + a11 * py + a12 * pz + b1;
    const sx = cx + xc_ * iz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - yc_ * iz; if (sy < 0 || sy >= BH) continue;
    let b;
    if (two) b = eb;
    else if (dn > 0) b = back;
    else {
      let fac = -dn / zc; if (fac > 1) fac = 1;
      const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
      b = .06 + amb + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
    }
    b *= (zc < fade ? A - kf * zc : kfar) * dim;
    let r = cr0, g = cg0, bl = cb0;
    const wy = E_[1] + Cr[1] * xc_ + Cu[1] * yc_ + Cf[1] * zc;
    if (nl) {
      // (the lights summed once per cell, at its first lit point: cells are a few metres, the lights tens)
      if (lw < 0) {
        const wx = E_[0] + Cr[0] * xc_ + Cu[0] * yc_ + Cf[0] * zc, wz = E_[2] + Cr[2] * xc_ + Cu[2] * yc_ + Cf[2] * zc;
        lr = 0; lg = 0; lbb = 0;
        for (let q = 0; q < nl; q++) { const o8 = q * 8, lx = LT[o8] - wx, ly = LT[o8 + 1] - wy, lz = LT[o8 + 2] - wz, r2 = LT[o8 + 4] * LT[o8 + 4], I = LT[o8 + 3] * r2 / (r2 + lx * lx + ly * ly + lz * lz); lr += I * LT[o8 + 5]; lg += I * LT[o8 + 6]; lbb += I * LT[o8 + 7]; }
        lw = (lr + lg + lbb) / 765;
      }
      if (lw > .002) { b += .6 * lw; const m = Math.min(.35, lw * .9 / (b + .15)); r += (lr / (lw * 3) - r) * m; g += (lg / (lw * 3) - g) * m; bl += (lbb / (lw * 3) - bl) * m; }
    }
    if (db < .55 && eh > 0) { const h = eh * (1 - db / .55); if (h > hot) hot = h; }
    if (hot > .02) { const h = hot > 1 ? 1 : hot; if (b < .55 * h + .2) b = .55 * h + .2; const c2 = h > .6 ? BRK_HOT : BRK_EDGE; r += (c2[0] - r) * h; g += (c2[1] - g) * h; bl += (c2[2] - bl) * h; }
    if (SE) {
      if (wy < 0) { b *= under ? Math.exp(-zc / 38) * 1.4 : Math.exp(wy / (2.8 + 5 * hot)) * .9; r *= .8; g *= .92; }
      else if (under) b *= .25;
    }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const pxs = sp * iz;
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
  const Fl = C.fl, xr = (BW_ - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
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
/* LOD per cell: the coarsest level whose dots land at most px apart on screen (1 px dots); smooth, each switch
   between two levels is a crossfade on a stable per-point dither (K.lodPick, K.LODB of an octave wide); keep < 1
   picks coarser levels (down to keep .05), and (smooth) below .05 thins them on the same dither, so a part fading to
   keep 0 fades out instead of holding its last level */
const LP = K.LP, SMOOTH = K.SMOOTH;
function drawX(ml, Tw, o) {
  XMR = K.prep(Tw);
  const CH = ml.ch, SD = ml.sd, nl = ml.nl, Fl = K.C.fl, oo = xopt(o), PX = oo.px / Math.sqrt(Math.max(.05, oo.keep)), kp = oo.keep;
  oo.keep = 1;
  const foc = oo.foc, band = K.LODB, fk = SMOOTH && kp < .05 ? Math.max(0, kp) / .05 : 1;
  const x = XMR, ex = x[12], ey = x[13], ez = x[14];
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereIn(mx, my, mz, rad)) continue;
    if (oo.qc && oo.qc[4] < 0) { const q = oo.qc; if (mx + rad < q[0] || my + rad < q[1] || mz + rad < q[2] || mz - rad > q[3]) continue; }
    const md = cellMode(oo, mx, my, mz, rad); if (md < 0) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.05, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
    const pxe = foc > 0 && d > foc ? PX * Math.pow(Math.min(1.7, d / foc), 1.2) : PX;
    K.lodPick(ml.sp, nl, Fl, d, pxe * 1.3, oo.lmin, band);
    if (LP.a === oo.lmin && LP.a > 0 && LP.b < 0 && ml.sp[LP.a] * Fl / d > oo.px0) LP.a--;
    const la = LP.a, lb = LP.b, wa = LP.wa * fk, wb = LP.wb * fk, st = md === 2 ? 3 : 1;
    let i0 = CH[q + 4 + la * 2], i1 = CH[q + 5 + la * 2];
    const xb = oo.brk || oo.sea || oo.nl;
    if (i1 > i0 && wa > 0) { oo.keep = wa; if (xb) runXB(ml.lv[la], i0, i1, ml.sp[la], oo, st); else runX(ml.lv[la], i0, i1, ml.sp[la], oo, md, st); NP += (i1 - i0) / st; }
    if (lb >= 0 && wb > 0) { i0 = CH[q + 4 + lb * 2]; i1 = CH[q + 5 + lb * 2]; if (i1 > i0) { oo.keep = wb; if (xb) runXB(ml.lv[lb], i0, i1, ml.sp[lb], oo, st); else runX(ml.lv[lb], i0, i1, ml.sp[lb], oo, md, st); NP += (i1 - i0) / st; } }
  }
  oo.keep = kp;
}
/* an FX dot at a world point that respects the occluders */
function odot(x, y, z, s, c, a) { if (K.pj(x, y, z)) { const v = occv(K.PJ[0], K.PJ[1], K.PJ[2]) * XS.gain; if (v > 0) K.dot(K.PJ[0], K.PJ[1], s, c[0], c[1], c[2], v < 1 ? a * v : a); } }
function oglow(x, y, z, px, c, a) { if (K.pj(x, y, z)) { const v = occv(K.PJ[0], K.PJ[1], K.PJ[2]) * XS.gain; if (v > 0) K.glowW(x, y, z, px, c, v < 1 ? a * v : a); } }

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
    coil: lod(coilPrims(), .45, LF), cryo: lod(cryoPrims(), .6, LF), frost: frostCloud(), cryoHero: lod(cryoPrims(COLD_HERO), .25, [.0025, .005, .01, .02, .04, .08]),
    coilS: lod(coilPrims(1), .45, LF), coilP: lod(coilPrims(-1), .45, LF), cryoX: lod(cryoPrims({ not: [2 * XST, 2 * XST + 1] }), .6, LF),
    cryoXP: lod(cryoPrims(2 * XST), .4, LF), cryoXS: lod(cryoPrims(2 * XST + 1), .4, LF),
    hpuBlock: lod(hpuBlock(), .3, LF), hpuSwash: lod(hpuSwash(), .3, LF), accPiston: lod(accPiston(), .3, LF),
    jawS: lod(jaw(1), .5, LF), jawP: lod(jaw(-1), .5, LF), breech: lod(breechBlock(), .6), petalT: lod(petal(1)), petalB: lod(petal(-1)),
    tray: lod(tray(), .6, LF), rhead: lod(rammerHead(), .4, LF), ramCyl: lod(ramCyl(), .5, LF), ramRod: lod(ramRod(), .5, LF), tpin: lod(trainPinion(), .4, LF),
    round: lod(round_(), .3, LF), rstow: lod(roundStowed(), .5), sabot: lod(sabotPetal(), .3, LF), arm: lod(armature(), .3, LF),
    baseBelow: lod(baseBelow(), .9), roller: lod(rollerPath(), .9, LB), trunk: lod(trunkT(), .9), carriage: lod(carriage(), .5, LF), drum: lod(drum(), .8), pinion: lod(pinion(), .5, LF),
    body: lod(altBody(), .8), bell: lod(altBell(), .8), exc: lod(altExciter(), .8), fan: lod(altFan(), .6), rotor: lod(altRotor(), .8),
    module: lod(module_(), .5), racks: lod(racks(), .9, LB), cab: lod(cabinets(), .9), breaker: lod(breaker(), .5),
    over: lod(overhead(), 1.1, LB), fanB: lod(fanBlades(), .6), floor: lod(floor(), 1.2, LB), bus: lod(busPrims(), .9),
    hullP: hullCloud(),
  };
  CL.ms = performance.now() - t0;
  if (window.RGP) window.RGP.CL = CL;
  let n = 0; for (const k in CL) if (CL[k] && CL[k].lv) n += CL[k].lv[0].length / 6; CL.n0 = n;
  return CL;
}

window.RGP = {
  GZ, GY, M0, FL, CUT, TRN, SLV0, SLV1, EXT, MZ_E, RZ0, RZ1, ALT, ALT_FLIP, XALT, RACKS, MOD, BANDS, EL_LOAD,
  TRAY_Z, SEAT_Z, RND_H, RAM_L, HZ, HY0, HY1, DRUM_R, DRUM_Y, RND_Y0, NCELL, PIN_P, PUMPS, VALVES, FANS, CAB_X, CAB_Z, CAB_H, BRK, JOINTS,
  FROST, PETAL_HINGE, TUR_OCC, BR_OCC, RACK_OCC, CAB_OCC, MAG_CELL, SINK,
  NST, STN, DZS, COLD, COLD_HERO, XST, CXC, KX0, KX1, KY, KZ, CX, CY, RW, RY0, RY1, IX0, IX1,
  HYD: HYD.map(poly), HE_T: HE_T.map(poly), COOL_T: [-1, 1].map(s => poly(COOL_T(s))),
  EO_P, EO_H, EO_WIN, FC_P, FC_H, FC_A, MV_P, RAM_E, TD_P, RING_R, PIN_R, HPU, HYD_P: HYD_P.map(poly), HEC, BUS_ANCH, FEED_B, PST, stCoil,
  BUS_A: BUS_A.map(poly), BUS_B: BUS_B.map(poly), BUS_C: BUS_C.map(poly),
  COOL: [COOL_SUP, COOL_RET, ...[-1, 1].map(COOL_COLD), ...PUMPS.map(p => COOL_P(p[0]))].map(poly),
  COOL_SUP: poly(COOL_SUP), COOL_RET: poly(COOL_RET), COOL_COLD: [-1, 1].map(s => poly(COOL_COLD(s))), COOL_PD: PUMPS.map(p => poly(COOL_P(p[0]))), COOL_COL: [-1, 1].map(s => poly(COOL_COL(s))),
  sampleLat, lod, LV, LB, LF, LM, quadL, lineL, ringL, perp, bar, bars, pipes, circ, boxY, boxZ, xfPrims, quad3, racetrack, hullAt, sec, hD,
  poly, polyAt, XS, drawX, build, occReset, occHex, occd, occv, odot, oglow, np: () => { const n = NP; NP = 0; return n; },
};
})();
