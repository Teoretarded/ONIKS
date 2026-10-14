/* SCAN · RAILGUN parts: the railgun mount that takes the Mk 45's seat on the Burke's foredeck, its loader (a
   magazine drum round the power column, a hoist, a pivoting tray and a rammer behind a vertical sliding-block
   breech, rail clamps), and the power room under it: four pulsed alternators with exciters, coolant pumps, a valve
   manifold and fans, four capacitor racks, power conditioning cabinets, cable trays, bus bars; the X-ray point
   pass (a slice opens a window in the hull, the room shows only where it is open).
   Surfaces are sampled on regular lattices with their edges drawn as hairlines at twice the density (the Aegis
   face look); convex occluders write a 4 px depth-tile buffer so solid blocks hide what is behind them.
   Frames: ship (HD.destroyer: +Z fwd, +X stbd, origin midships waterline); M (mount base on the deck, not
   training); T (turret, trains about Y); B (barrel, elevates about the trunnion, +Z along the bore);
   E (the muzzle sleeve, slides along B's Z). Loaded after scan_kit.js; exposes window.RGP. */
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
const TRN = [0, 1.95, .9];                              // trunnion in T
const SLV0 = 1.4, SLV1 = 5.66, EXT = 4.0;               // sleeve span in E at ext 0, and its travel
const MZ_E = [0, 0, SLV1 + .06];                        // bore mouth in E
const EL_LOAD = 50 * DEG;                               // the loading elevation (the firing elevation)
const TRAY_Z = -2.78, SEAT_Z = -1.62, RND_H = .33;      // tray centre and seated round centre (B z), round half length
const HZ = TRN[2] - 2.78 * Math.cos(EL_LOAD), HY1 = TRN[1] - 2.78 * Math.sin(EL_LOAD);   // hoist axis (T z) and its top (T y)
const DRUM_R = .89, DRUM_Y = FL + .1, RND_Y0 = FL + .55;  // magazine cells: radius, drum base, round centre (ship y)
const BANDS = []; for (let z = -1.55; z <= 5.21; z += .675) BANDS.push(+z.toFixed(3));

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
const LV = [.016, .032, .064, .128, .256, .512], LB = [.024, .048, .096, .192, .384];
const lod = (P, cs, L) => K.lodCloud((L || LV).map((sp, li) => ({ sp, pts: new Float32Array(sampleLat(P, sp, li >= 3)) })), cs || .7);

/* small geometry helpers */
function bar(a, b, w, h, up, o) {
  const d = V.norm(V.sub(b, a));
  let n = up || [0, 1, 0]; if (Math.abs(V.dot(n, d)) > .9) n = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 0, 1];
  const s = V.norm(V.cross(d, n)), u = V.cross(s, d), hw = w / 2, hh = h / 2;
  const q = (p, i, j) => V.add(p, V.add(V.mul(s, i * hw), V.mul(u, j * hh)));
  return G.hex([q(a, -1, -1), q(a, 1, -1), q(b, 1, -1), q(b, -1, -1), q(a, -1, 1), q(a, 1, 1), q(b, 1, 1), q(b, -1, 1)], o);
}
const bars = (P, w, h, up, o) => { const out = []; for (let i = 0; i < P.length - 1; i++) out.push(bar(P[i], P[i + 1], w, h, up, o)); return out; };
const pipes = (P, r, o) => { const out = []; for (let i = 0; i < P.length - 1; i++) out.push(G.cyl(P[i], P[i + 1], r, o)); for (let i = 1; i < P.length - 1; i++) out.push(G.cyl(V.mad(P[i], [0, 1, 0], -r * 1.3), V.mad(P[i], [0, 1, 0], r * 1.3), r * 1.35, { noEdge: false })); return out; };
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

/* ================= the mount ================= */
/* M: static above deck (barbette ring) */
function baseAbove() {
  return [
    G.lathe([0, 0, 0], [0, 1, 0], [[0, 3.05], [.28, 3.05], [.28, 2.8]], {}),
    circ([0, .01, 0], [0, 1, 0], 3.45),
    ...Array.from({ length: 24 }, (_, k) => { const a = k / 24 * TAU; return G.cyl([Math.sin(a) * 2.93, .26, Math.cos(a) * 2.93], [Math.sin(a) * 2.93, .3, Math.cos(a) * 2.93], .03, F()); }),
  ];
}
/* M: static below deck (seen only in the X-ray): roller path, slip rings, the power column, coolant risers */
const yF = FL - GY;
const RISERS = s => [[[s * 1.5, 2.6 - GY, -.6], [s * 1.5, -1.35, -.6], [s * 4.2, -1.35, -.6], [s * 4.2, -1.2, -.6]],
                     [[s * 4.2, -1.2, .6], [s * 4.2, -1.35, .6], [s * 1.5, -1.35, .6], [s * 1.5, 2.6 - GY, .6]]];
function baseBelow() {
  const P = [];
  P.push(G.cyl([0, yF + 1.1, 0], [0, -.25, 0], .5, { ds: 2.2 }));                                      // power column
  for (const y of [yF + 1.35, yF + 2.9, yF + 4.4]) P.push(G.lathe([0, y, 0], [0, 1, 0], [[0, .66], [.14, .66]], {}));
  P.push(G.lathe([0, -2.05, 0], [0, 1, 0], [[0, .66], [.8, .66]], { ds: 1.6 }));            // slip-ring housing
  for (const y of [-1.9, -1.75, -1.6, -1.45, -1.3]) P.push(circ([0, y, 0], [0, 1, 0], .69, F()));
  P.push(G.lathe([0, 6.2 - GY, 0], [0, 1, 0], [[0, .72], [.16, .72], [.16, .5]], {}));          // collector ring
  for (const s of [-1, 1]) for (const pl of RISERS(s)) P.push(...pipes(pl, .075));
  return P;
}
function rollerPath() {
  const P = [G.lathe([0, -.95, 0], [0, 1, 0], [[0, 2.7], [.62, 2.7], [.62, 2.3]], { ds: 1.4 }), circ([0, -.95, 0], [0, 1, 0], 2.3)];
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, c = Math.cos(a), s = Math.sin(a); P.push(G.cyl([c * 2.34, -.64, s * 2.34], [c * 2.66, -.64, s * 2.66], .08, F())); }
  return P;
}
/* M: heat exchangers under the vent hatches (fins show when the hatch opens) */
function exchanger(s) {
  const P = [G.box([s * 3.55, -1.2, -1.2], [s * 4.85, -.14, 1.2], { skip: [1] })];
  for (let z = -1.08; z <= 1.09; z += .12) P.push(G.box([s * 3.62, -.4, z - .01], [s * 4.78, -.06, z + .01], { skip: [0, 2, 3, 4, 5], noEdge: false }));
  P.push(G.box([s * 3.5, -.02, -1.3], [s * 4.9, .08, -1.22]), G.box([s * 3.5, -.02, 1.22], [s * 4.9, .08, 1.3]));
  for (const z of [-.8, .8]) P.push(G.box([s * 4.1, -.5, z - .06], [s * 4.3, -.1, z + .06], F()));   // ram brackets
  return P;
}
/* M: vent hatch lid, hinge on the outboard edge; knuckles alternate lid / coaming */
const HATCH_HINGE = s => [s * 4.9, .08, 0];
const RAM_H = s => [[[s * 4.2, -.1, -.8], [s * 4.25, .1, -.8]], [[s * 4.2, -.1, .8], [s * 4.25, .1, .8]]];   // [base in M, pin on the lid]
function hatchLid(s) {
  const P = [G.box([s * 3.5, 0, -1.26], [s * 4.9, .1, 1.26], { ds: 1.6 })];
  for (let z = -1.0; z <= 1.01; z += .25) P.push(G.line([[s * 3.6, .105, z], [s * 4.8, .105, z]], F()));
  for (const z of [-1.0, -.2, .6]) P.push(G.cyl([s * 4.9, .08, z], [s * 4.9, .08, z + .35], .06, {}));
  for (const z of [-.8, .8]) P.push(G.box([s * 4.18, -.04, z - .05], [s * 4.32, 0, z + .05], F()));
  return P;
}
function hatchCoaming(s) {
  const P = [];
  for (const z of [-.6, .2, 1.0]) P.push(G.cyl([s * 4.9, .08, z - .2], [s * 4.9, .08, z], .055, {}));
  return P;
}
/* T: the gunhouse, split by the barrel slot */
function turret() {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(G.hex([[s * .64, .3, -3.6], [s * 2.62, .3, -3.6], [s * 2.3, .3, 2.45], [s * .64, .3, 2.45], [s * .64, 2.78, -3.2], [s * 1.92, 2.78, -3.2], [s * 1.5, 2.78, .95], [s * .64, 2.78, .95]], { ds: 1.8 }));
    // louvres, panel seams, the side door
    for (let k = 0; k < 7; k++) { const z = -2.8 + k * .26; P.push(G.line([[s * 2.53, .95, z], [s * 2.2, 2.1, z + .07]], F())); }
    for (const u of [.3, .55, .8]) { const z0 = -3.6 + 6.05 * u; P.push(G.line([[s * (2.62 - .32 * u), .3, z0], [s * (1.92 - .42 * u), 2.78, -3.2 + 4.15 * u]], F())); }
    P.push(G.line([[s * 2.6, 1.5, -3.55], [s * 2.33, 1.5, 2.4]], F()));
    P.push(G.cyl([s * .64, TRN[1], TRN[2]], [s * .98, TRN[1], TRN[2]], .32, { caps: true }));
    P.push(G.line([[s * 1.72, 2.8, -2.9], [s * 1.72, 3.05, -2.9], [s * 1.4, 3.05, .5], [s * 1.4, 2.8, .5]], F()));
    // cheek plates along the slot
    P.push(G.box([s * .6, .3, -1.1], [s * .64, 2.6, 2.3], { edgeOnly: true }));
  }
  P.push(G.box([-.64, 2.58, -3.2], [.64, 2.78, -1.3], { ds: 1.8 }));
  P.push(G.box([-.64, .3, -3.6], [.64, 2.58, -3.34], { ds: 1.8 }));
  P.push(G.lathe([0, 0, 0], [0, 1, 0], [[0, 2.72], [.32, 2.64]], {}));
  P.push(G.box([.9, 2.78, -2.7], [1.45, 3.2, -2.05]), G.cyl([1.18, 3.2, -2.38], [1.18, 3.55, -2.38], .06, F()));
  P.push(G.panel([[-1.4, .7, -3.62], [-.8, .7, -3.62], [-.8, 2.2, -3.62], [-1.4, 2.2, -3.62]]));
  P.push(G.panel([[.9, 2.79, -1.9], [1.5, 2.79, -1.9], [1.35, 2.79, -.6], [.9, 2.79, -.6]]));
  return P;
}
/* the gunhouse as two convex occluders (T frame corners) */
const TUR_OCC = [-1, 1].map(s => [[s * .66, .32, -3.58], [s * 2.6, .32, -3.58], [s * 2.28, .32, 2.43], [s * .66, .32, 2.43], [s * .66, 2.76, -3.18], [s * 1.9, 2.76, -3.18], [s * 1.48, 2.76, .93], [s * .66, 2.76, .93]]);
/* B: rail housing (rear section), bands, spacers, tracks, the breech ring, the tray brackets and the rammer,
   the sleeve's drive screw, the covers' fixed knuckles and ram brackets */
const RZ0 = -1.9, RZ1 = 5.4;
function barrelRear() {
  const P = [];
  P.push(G.box([-.4, .22, RZ0], [.4, .5, RZ1], { ds: 1.8 }), G.box([-.4, -.5, RZ0], [.4, -.22, RZ1], { ds: 1.8 }));
  for (let z = RZ0 + .35; z < RZ1 - .1; z += .36) for (const s of [-1, 1]) P.push(G.box([s * .13 - .035, -.2, z], [s * .13 + .035, .2, z + .11], F({ edgeOnly: true })));
  for (const z of BANDS) P.push(G.box([-.46, .5, z], [.46, .56, z + .1]), G.box([-.46, -.56, z], [.46, -.5, z + .1]));
  for (const s of [-1, 1]) for (const y of [1, -1]) P.push(G.box([s * .3, y > 0 ? .56 : -.6, .9], [s * .4, y > 0 ? .6 : -.56, 5.3], F()));
  // breech ring: side guides the block slides down in, a top bar and a bottom stop
  for (const s of [-1, 1]) P.push(G.box([s * .56, -2.05, -2.44], [s * .62, .72, -1.86], { ds: 1.5 }));
  P.push(G.box([-.62, .64, -2.44], [.62, .72, -1.86], { ds: 1.5 }), G.box([-.62, -2.12, -2.44], [.62, -2.04, -1.86], { ds: 1.5 }));
  P.push(G.box([-.5, -.62, -.38], [.5, .62, .38], { ds: 1.6 }));                                  // trunnion block
  P.push(G.cyl([-.64, 0, 0], [.64, 0, 0], .18, {}));
  // tray brackets, tie bar, rammer housing
  for (const s of [-1, 1]) P.push(G.box([s * .3 - .03, -.06, -3.5], [s * .3 + .03, .06, -2.44]));
  P.push(G.box([-.33, -.05, -3.52], [.33, .05, -3.44]), G.box([-.14, -.14, -3.62], [.14, .14, -3.36]));
  // the sleeve's drive screw along the underside, its motor and supports
  P.push(G.cyl([0, -.8, -.7], [0, -.8, 5.25], .035, {}), G.cyl([0, -.8, -1.25], [0, -.8, -.7], .1, { caps: true }));
  for (const z of [.2, 2.4, 4.6]) P.push(G.box([-.06, -.8, z], [.06, -.56, z + .08], F()));
  // covers: fixed knuckles on the hinge line, ram brackets
  for (const s of [-1, 1]) {
    for (const z of [-1.4, .0, 1.4, 2.8, 4.2]) P.push(G.cyl([s * .52, .56, z], [s * .52, .56, z + .22], .035, F()));
    for (const z of [.4, 3.8]) P.push(G.box([s * .46, -.4, z - .05], [s * .5, -.26, z + .05], F()));
  }
  return P;
}
const BR_OCC = [[-.39, .23, RZ0 + .02], [.39, .23, RZ0 + .02], [.39, .23, RZ1 - .02], [-.39, .23, RZ1 - .02], [-.39, .49, RZ0 + .02], [.39, .49, RZ0 + .02], [.39, .49, RZ1 - .02], [-.39, .49, RZ1 - .02]];
const barrelRails = z1 => [G.box([-.1, .14, RZ0], [.1, .22, z1]), G.box([-.1, -.22, RZ0], [.1, -.14, z1])];
/* B: the sliding breech block (moves down its guides in B -y) */
function breechBlock() {
  return [G.box([-.54, -.64, -2.4], [.54, .64, -1.9], { ds: 1.4 }), G.line([[-.4, .5, -2.405], [.4, .5, -2.405], [.4, -.5, -2.405], [-.4, -.5, -2.405], [-.4, .5, -2.405]]),
          G.cyl([0, 0, -2.42], [0, 0, -2.5], .1, F())];
}
/* B: a rail clamp jaw at a band (s side), slides out s * 0.07 when unlocked */
function jaw(s) {
  return [G.box([s * .4, -.48, -.01], [s * .46, .48, .11]), G.box([s * .46, -.14, .0], [s * .51, .14, .1], F()),
          G.cyl([s * .43, .48, .05], [s * .43, .55, .05], .025, F())];
}
/* B: side cover, hinge on the top outer edge */
const COVER_HINGE = s => [s * .52, .56, 0];
const RAM_C = s => [[[s * .48, -.33, .4], [s * .5, -.1, .4]], [[s * .48, -.33, 3.8], [s * .5, -.1, 3.8]]];   // [bracket in B, pin on the cover]
function cover(s) {
  const P = [G.box([s * .47, -.56, -1.45], [s * .52, .56, 5.2], { ds: 1.7 })];
  for (let z = -.9; z < 5.2; z += 1.2) P.push(G.line([[s * .525, -.46, z], [s * .525, .46, z]], F()));
  for (const z of [-1.18, .22, 1.62, 3.02, 4.42]) P.push(G.cyl([s * .52, .56, z], [s * .52, .56, z + .22], .035, F()));
  for (const z of [.4, 3.8]) P.push(G.box([s * .49, -.14, z - .04], [s * .52, -.06, z + .04], F()));
  return P;
}
/* E: the muzzle sleeve (rides over the front of the rear section on shoes, runs out EXT on the drive screw) */
function sleeve() {
  const P = [];
  P.push(G.box([-.64, .62, SLV0], [.64, .74, SLV1], { ds: 1.6 }), G.box([-.64, -.74, SLV0], [.64, -.62, SLV1], { ds: 1.6 }));
  for (const s of [-1, 1]) P.push(G.box([s * .58, -.62, SLV0], [s * .64, .62, SLV1], { ds: 1.6 }));
  for (let z = SLV0 + .3; z < SLV1 - .4; z += .7) P.push(G.box([-.68, -.78, z], [.68, .78, z + .09], { skip: [2, 4] }));
  P.push(G.box([-.72, -.82, SLV1 - .26], [.72, .82, SLV1], { skip: [5] }));
  P.push(G.lathe([0, 0, SLV1], [0, 0, 1], [[0, .34], [.06, .34]], {}));
  P.push(G.lathe([0, 0, SLV1 - .26], [0, 0, 1], [[0, .95], [.26, .95]], F()));
  for (const s of [-1, 1]) P.push(G.box([s * .28, .6, SLV0], [s * .42, .62, SLV0 + .3], F()), G.box([s * .28, -.62, SLV0], [s * .42, -.6, SLV0 + .3], F()));
  P.push(G.box([-.1, -.86, SLV0], [.1, -.74, SLV0 + .24]));                                   // screw nut bracket
  for (const s of [-1, 1]) P.push(G.box([s * .64, -.12, SLV0 + .05], [s * .7, .12, SLV0 + .25], F()));   // lock pin housings
  // petal hinge knuckles on the muzzle face
  for (const s of [-1, 1]) for (const x of [-.6, -.1, .4]) P.push(G.cyl([x, s * .82, SLV1 + .03], [x + .2, s * .82, SLV1 + .03], .03, F()));
  return P;
}
const sleeveRails = () => [G.box([-.1, .14, SLV0], [.1, .22, SLV1 - .02]), G.box([-.1, -.22, SLV0], [.1, -.14, SLV1 - .02])];
/* E: muzzle cover petals (top +1 / bottom -1), hinged on the outer edge of the muzzle face */
const PETAL_HINGE = s => [0, s * .82, SLV1 + .03];
function petal(s) {
  const y0 = s > 0 ? 0 : -.82, y1 = s > 0 ? .82 : 0;
  const P = [G.box([-.72, y0, SLV1], [.72, y1, SLV1 + .06])];
  P.push(G.line([[-.55, s * .41, SLV1 + .065], [.55, s * .41, SLV1 + .065]], F()));
  for (const x of [-.35, .15, .6]) P.push(G.cyl([x - .1, s * .82, SLV1 + .03], [x + .05, s * .82, SLV1 + .03], .03, F()));
  return P;
}

/* ================= the loader ================= */
/* a round: a closed shell, driving band, sabot seams (local: centre, axis +Z nose) */
function round_() {
  const P = [G.lathe([0, 0, -RND_H], [0, 0, 1], [[0, .1], [.45, .1], [.58, .08], [.66, .045]], { caps: true })];
  P.push(G.lathe([0, 0, -.12], [0, 0, 1], [[0, .104], [.05, .104]], {}));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .3; P.push(G.line([[Math.cos(a) * .101, Math.sin(a) * .101, -RND_H + .02], [Math.cos(a) * .101, Math.sin(a) * .101, .2]], F())); }
  return P;
}
/* a sabot petal (one of three round the round, local: the round's frame, the petal centred on +X): a 116° shell
   slice from the base to the scoop, its lip flared to catch the air at the muzzle */
const SAB_A = 58 * DEG;
function sabotPetal() {
  const P = [], n = 6, z0 = -RND_H - .02, z1 = .2, z2 = .27;
  const at = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
  for (let k = 0; k < n; k++) {
    const a0 = -SAB_A + 2 * SAB_A * k / n, a1 = -SAB_A + 2 * SAB_A * (k + 1) / n;
    P.push(G.hex([at(a0, .103, z0), at(a1, .103, z0), at(a1, .103, z1), at(a0, .103, z1), at(a0, .132, z0), at(a1, .132, z0), at(a1, .132, z1), at(a0, .132, z1)], { ds: .7 }));
    P.push(G.hex([at(a0, .106, z1), at(a1, .106, z1), at(a1, .12, z2), at(a0, .12, z2), at(a0, .132, z1), at(a1, .132, z1), at(a1, .158, z2), at(a0, .158, z2)], F({ ds: .7 })));
  }
  for (const z of [z0 + .08, -.1, .1]) { const L = []; for (let k = 0; k <= 12; k++) L.push(at(-SAB_A + 2 * SAB_A * k / 12, .134, z)); P.push(G.line(L, F())); }
  return P;
}
/* the armature behind the round (local: the round's frame): a C block whose legs ride the rails (top and bottom),
   its back plate the face the current drives */
function armature() {
  const z0 = -RND_H - .13, z1 = -RND_H - .085, z2 = -RND_H - .01, P = [];
  P.push(G.box([-.09, -.137, z0], [.09, .137, z1], { ds: .7 }));
  for (const s of [-1, 1]) {
    P.push(G.box([-.09, s > 0 ? .085 : -.137, z1], [.09, s > 0 ? .137 : -.085, z2], { ds: .7 }));
    for (const x of [-.06, 0, .06]) P.push(G.line([[x, s * .138, z0 + .01], [x, s * .138, z2 - .005]], F()));
  }
  P.push(G.line([[-.07, -.06, z0 - .002], [.07, -.06, z0 - .002], [.07, .06, z0 - .002], [-.07, .06, z0 - .002], [-.07, -.06, z0 - .002]], F()));
  return P;
}
/* ship: the magazine drum (local: column axis, base at y 0) rotates; its base ring and the drive motor stay */
function drum() {
  const P = [G.lathe([0, 0, 0], [0, 1, 0], [[0, 1.25], [.9, 1.25], [.9, .62], [0, .62]], {})];
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU, x = Math.sin(a) * DRUM_R, z = Math.cos(a) * DRUM_R;
    P.push(G.cyl([x, .04, z], [x, .9, z], .125, { ds: 1.4 }), circ([x, .905, z], [0, 1, 0], .14, F()));
  }
  for (let k = 0; k < 72; k++) P.push(boxY([Math.sin(k / 72 * TAU) * 1.28, .1, Math.cos(k / 72 * TAU) * 1.28], [.022, .05, .03], k / 72 * TAU, F({ noEdge: true })));
  for (let k = 0; k < 24; k++) { const a = (k + .5) / 24 * TAU; P.push(G.line([[Math.sin(a) * .66, .9, Math.cos(a) * .66], [Math.sin(a) * 1.21, .9, Math.cos(a) * 1.21]], F())); }
  return P;
}
const PIN_P = [0, FL + .1, GZ - 1.49];                    // the drum's drive pinion (aft of the drum, ship)
function pinion() {
  const P = [G.lathe([0, 0, 0], [0, 1, 0], [[0, .16], [.14, .16]], { caps: true })];
  for (let k = 0; k < 12; k++) P.push(boxY([Math.sin(k / 12 * TAU) * .18, .07, Math.cos(k / 12 * TAU) * .18], [.02, .07, .03], k / 12 * TAU, F({ noEdge: true })));
  P.push(G.line([[0, .145, 0], [0, .145, .14]]));
  return P;
}
/* T: the hoist (vertical at HZ under the tray's receiving position), its crossheads */
const HY0 = FL + 1.02 - GY;                               // hoist foot (T y), just over the drum
function hoist() {
  const P = [];
  for (const s of [-1, 1]) P.push(G.box([s * .2 - .02, HY0, HZ - .02], [s * .2 + .02, HY1 - .5, HZ + .02]));
  P.push(G.box([-.26, HY0, HZ - .06], [.26, HY0 + .08, HZ + .06]), G.box([-.26, HY1 - .56, HZ - .06], [.26, HY1 - .48, HZ + .06]));
  for (let y = HY0 + .6; y < HY1 - .6; y += .8) P.push(G.box([-.22, y, HZ + .1], [.22, y + .04, HZ + .14], F()));
  P.push(G.line([[-.2, HY0, HZ + .12], [-.2, HY1 - .5, HZ + .12]], F()), G.line([[.2, HY0, HZ + .12], [.2, HY1 - .5, HZ + .12]], F()));
  return P;
}
/* T: the hoist carriage (local: round centre, the round vertical) */
function carriage() {
  return [G.box([-.24, -.1, -.04], [-.17, .1, .04]), G.box([.17, -.1, -.04], [.24, .1, .04]), G.box([-.24, -.26, .12], [.24, -.2, .16]),
          G.box([-.13, -.26, -.03], [-.1, .1, .03]), G.box([.1, -.26, -.03], [.13, .1, .03])];
}
/* B: the loading tray (local: its pivot = round centre, the round along +Z); pivots about X */
function tray() {
  return [G.box([-.16, -.12, -.42], [-.13, .08, .42]), G.box([.13, -.12, -.42], [.16, .08, .42]), G.box([-.16, -.15, -.42], [.16, -.12, .42]),
          G.cyl([-.3, 0, 0], [.3, 0, 0], .035, {}), G.box([-.16, -.15, -.46], [.16, .08, -.42], F())];
}

/* ================= the power room (ship frame) ================= */
const ALT = [[2.3, 2.45, 42.2], [-2.3, 2.45, 42.2], [2.3, 2.45, 45.0], [-2.3, 2.45, 45.0]];
const ALT_FLIP = [true, true, false, false];              // aft units face aft (the exciter on the outer end)
const XALT = 2;                                           // the unit that comes apart
/* alternator (A frame: centre, axis +Z toward the exciter end) */
function altBody() {
  const P = [];
  P.push(G.box([-1.0, -1.15, -1.25], [1.0, -1.0, 1.25], { skip: [2, 3, 4, 5] }));              // skid
  for (const z of [-.9, .9]) P.push(G.box([-.28, -1.0, z - .1], [.28, -.2, z + .1]));           // bearing pedestals
  for (const s of [-1, 1]) P.push(G.box([s * .7, -1.0, -.62], [s * .9, -.6, .62]));             // stator feet
  P.push(G.lathe([0, 0, -.7], [0, 0, 1], [[0, .85], [1.4, .85]], { ds: 2.2 }));                 // stator core (sparse: the rotor shows)
  for (let k = 0; k < 16; k++) { const a = (k + .5) / 16 * TAU, c = Math.cos(a), sn = Math.sin(a); P.push(G.line([[c * .97, sn * .97, -.68], [c * .97, sn * .97, .68], [c * .86, sn * .86, .68]]), G.line([[c * .86, sn * .86, -.68], [c * .97, sn * .97, -.68]], F())); }
  for (const z of [-.62, 0, .62]) P.push(G.lathe([0, 0, z - .035], [0, 0, 1], [[0, .99], [.07, .99]], {}));
  P.push(G.box([-.32, .9, -.28], [.32, 1.28, .28]));                                           // terminal box
  for (const x of [-.18, 0, .18]) P.push(G.cyl([x, 1.28, 0], [x, 1.36, 0], .035, F()));
  P.push(G.lathe([0, 0, -.7], [0, 0, -1], [[0, .95], [.08, .93], [.26, .5], [.34, .2]], { caps: true, ds: 1.4 }));   // inner bell (stays)
  P.push(G.cyl([0, 0, -1.04], [0, 0, -1.14], .18, {}));
  return P;
}
function altBell() {
  const P = [G.lathe([0, 0, .7], [0, 0, 1], [[0, .95], [.08, .93], [.26, .5], [.34, .2]], { caps: true }), G.cyl([0, 0, 1.04], [0, 0, 1.14], .18, {})];
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P.push(G.cyl([Math.cos(a) * .9, Math.sin(a) * .9, .7], [Math.cos(a) * .9, Math.sin(a) * .9, .77], .025, F())); }
  return P;
}
function altExciter() {
  const P = [G.lathe([0, 0, 1.14], [0, 0, 1], [[0, .46], [.36, .46]], {}), G.lathe([0, 0, 1.5], [0, 0, 1], [[0, .48], [.14, .48]], {})];
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(G.line([[Math.cos(a) * .47, Math.sin(a) * .47, 1.16], [Math.cos(a) * .47, Math.sin(a) * .47, 1.48]], F())); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; P.push(G.line([[Math.cos(a) * .12, Math.sin(a) * .12, 1.64], [Math.cos(a) * .48, Math.sin(a) * .48, 1.64]], F())); }
  return P;
}
const altFan = () => [G.blades([0, 0, 1.58], [0, 0, 1], 7, .09, .43, { chord: .55, pitch: .25 }), G.lathe([0, 0, 1.54], [0, 0, 1], [[0, .09], [.1, .09]], { caps: true })];
function altRotor() {
  const P = [G.lathe([0, 0, -.64], [0, 0, 1], [[0, .76], [1.28, .76]], { ds: 1.3 })];
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, c = Math.cos(a), sn = Math.sin(a); P.push(G.line([[c * .79, sn * .79, -.62], [c * .79, sn * .79, .62]]), G.line([[c * .8, sn * .8 + .02, -.62], [c * .8, sn * .8 + .02, .62]], F())); }
  for (const z of [-.66, .6]) P.push(G.lathe([0, 0, z], [0, 0, 1], [[0, .81], [.06, .81]], {}));
  P.push(G.cyl([0, 0, -1.2], [0, 0, 1.52], .09, {}));
  P.push(G.lathe([0, 0, 1.2], [0, 0, 1], [[0, .3], [.24, .3]], { caps: true }));                // exciter armature
  return P;
}
/* capacitor racks: two a side, the modules' faces on the aisle */
const RACKS = [];
for (const s of [1, -1]) for (const [j, z0, z1] of [[0, 47.9, 51.3], [1, 51.6, 55.0]]) RACKS.push({ s, j, z0, z1, zm: (z0 + z1) / 2 });
const MOD = [];                    // module centres, charge order: rack by rack, bottom shelf up
RACKS.forEach((rk, r) => { for (let k = 0; k < 4; k++) for (let q = 0; q < 5; q++) MOD.push({ r, s: rk.s, p: [rk.s * 2.36, FL + .43 + k * 1.12, rk.z0 + .38 + q * .64] }); });
/* capacitor module (local: centre; the terminal face is -X, the aisle for the starboard racks) */
function module_() {
  const P = [G.box([-.4, -.26, -.26], [.4, .26, .26], { skip: [2, 3, 4], ds: 1.3 })];
  P.push(G.panel([[-.405, -.21, -.21], [-.405, .21, -.21], [-.405, .21, .21], [-.405, -.21, .21]], F()));
  P.push(G.cyl([-.4, .15, -.12], [-.47, .15, -.12], .03, F()), G.cyl([-.4, .15, .12], [-.47, .15, .12], .03, F()));
  for (let k = 0; k < 4; k++) { const x = -.27 + k * .18; P.push(G.line([[x, .262, -.22], [x, .262, .22]], F())); }
  for (let k = 0; k < 3; k++) P.push(G.line([[-.407, -.18 + k * .04, -.17], [-.407, -.18 + k * .04, .17]], F()));
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
    P.push(bar([s * 1.83, FL + .12, rk.z0 + .04], [s * 1.83, FL + 4.66, rk.z0 + .04], .14, .04, [1, 0, 0]));     // riser bus
    for (let k = 0; k < 4; k++) { const y = FL + .12 + k * 1.12 + .63; P.push(bar([s * 1.86, y, rk.z0 + .04], [s * 1.86, y, rk.z1 - .1], .05, .025, [1, 0, 0], F())); }
  }
  return P;
}
/* the rack module blocks as occluders (inset) */
const RACK_OCC = RACKS.map(rk => { const s = rk.s, x0 = s * 1.98, x1 = s * 2.74, y0 = FL + .2, y1 = FL + .12 + 3 * 1.12 + .6, z0 = rk.z0 + .14, z1 = rk.z1 - .14;
  return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]; });
/* power conditioning cabinets on the forward bulkhead, faces aft */
const CAB_X = [-1.84, -.92, 0, .92, 1.84], CAB_Z = 55.3, CAB_H = 2.5;
function cabinets() {
  const P = [];
  for (const xc of CAB_X) {
    const x0 = xc - .43, x1 = xc + .43, z = CAB_Z - .005;
    P.push(G.box([x0, FL, CAB_Z], [x1, FL + CAB_H, 56.2]));
    P.push(G.panel([[x0 + .05, FL + .08, z], [x1 - .05, FL + .08, z], [x1 - .05, FL + CAB_H - .08, z], [x0 + .05, FL + CAB_H - .08, z]]));
    P.push(G.panel([[xc - .34, FL + 2.02, z], [xc + .34, FL + 2.02, z], [xc + .34, FL + 2.3, z], [xc - .34, FL + 2.02 + .28, z]], F()));
    P.push(G.panel([[xc - .3, FL + 1.35, z], [xc + .05, FL + 1.35, z], [xc + .05, FL + 1.75, z], [xc - .3, FL + 1.75, z]], F()));
    for (let k = 0; k < 7; k++) P.push(G.line([[xc - .32, FL + .25 + k * .07, z], [xc + .32, FL + .25 + k * .07, z]], F()));
    P.push(G.box([x1 - .12, FL + 1.1, z - .04], [x1 - .09, FL + 1.4, z], F()));
    for (const y of [FL + .4, FL + 2.1]) P.push(G.cyl([x0 + .02, y, z], [x0 + .02, y + .16, z], .02, F()));
    for (const dx of [-.2, .2]) P.push(G.cyl([xc + dx, FL + CAB_H, 55.8], [xc + dx, FL + CAB_H + .12, 55.8], .07, F()));
    P.push(G.box([xc + .12, FL + 1.44, z - .03], [xc + .3, FL + 1.66, z], F()));                // breaker escutcheon
  }
  return P;
}
const CAB_OCC = [[-2.25, FL + .02, CAB_Z + .03], [2.25, FL + .02, CAB_Z + .03], [2.25, FL + .02, 56.18], [-2.25, FL + .02, 56.18], [-2.25, FL + CAB_H - .02, CAB_Z + .03], [2.25, FL + CAB_H - .02, CAB_Z + .03], [2.25, FL + CAB_H - .02, 56.18], [-2.25, FL + CAB_H - .02, CAB_Z + .03]];
/* a breaker handle (local: pivot, the lever up +Y; it throws about X) */
const breaker = () => [G.box([-.025, 0, -.025], [.025, .2, .025]), G.box([-.05, .18, -.04], [.05, .24, .04])];
const BRK = RACKS.map(rk => [rk.s * (rk.j ? 1.84 : .92) + .21, FL + 1.55, CAB_Z - .03]);    // one per rack
/* coolant: two pumps, a surge tank, the valve header, supply and return lines */
const PUMPS = [[.62, 1.75, 40.75], [-.62, 1.75, 40.75]];
const VALVES = [-.9, -.3, .3, .9].map(x => [x, 2.64, 43.6]);
const COOL_S = s => [[s * 1.15, 2.2, 43.6], [s * 1.15, 1.55, 43.6], [s * 1.15, 1.55, 47.0], [s * 1.5, 1.55, 47.3], [s * 1.5, 1.55, 48.0], [s * 1.5, 2.6, 48.0]];
const COOL_R = s => [[s * 1.5, 2.6, 49.2], [s * 1.5, 1.9, 49.2], [s * 1.5, 1.9, 47.3], [s * 1.15, 1.9, 47.0], [s * 1.15, 1.9, 41.15], [s * 1.15, 2.3, 41.15], [s * .22, 2.3, 41.15]];
const COOL_P = x => [[x, 2.1, 41.95], [x, 2.2, 41.95], [x, 2.2, 43.6]];
function coolStatic() {
  const P = [];
  for (const [x, y, z] of PUMPS) {
    P.push(G.box([x - .36, FL, z - .05], [x + .36, 1.4, z + 1.45]));                          // plinth
    P.push(G.lathe([x, y, z], [0, 0, 1], [[0, .27], [.7, .27]], { caps: true }));              // motor
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(G.line([[x + Math.cos(a) * .285, y + Math.sin(a) * .285, z + .05], [x + Math.cos(a) * .285, y + Math.sin(a) * .285, z + .65]], F())); }
    P.push(G.box([x - .1, y + .26, z + .2], [x + .1, y + .38, z + .45], F()));
    P.push(G.line([[x - .2, y - .2, z + .7], [x - .2, y + .2, z + .7], [x - .2, y + .2, z + .95], [x - .2, y - .2, z + .95], [x - .2, y - .2, z + .7]], F()));   // coupling guard
    P.push(G.line([[x + .2, y - .2, z + .7], [x + .2, y + .2, z + .7], [x + .2, y + .2, z + .95], [x + .2, y - .2, z + .95], [x + .2, y - .2, z + .7]], F()));
    P.push(G.lathe([x, y, z + .95], [0, 0, 1], [[0, .2], [.05, .36], [.35, .36], [.4, .2]], { caps: true }));   // volute
    P.push(G.cyl([x, y + .36, z + 1.2], [x, 2.1, z + 1.2], .07, {}));
  }
  P.push(G.lathe([0, FL, 41.05], [0, 1, 0], [[0, .22], [1.3, .22]], { caps: true }));             // surge tank
  for (const s of [-1, 1]) P.push(G.cyl([s * .2, 1.5, 41.05], [s * .3, 1.5, 41.05], .05, F()));
  P.push(G.cyl([-1.15, 2.2, 43.6], [1.15, 2.2, 43.6], .09, { caps: true }));                   // header
  for (const [x] of VALVES) { P.push(G.box([x - .09, 2.08, 43.5], [x + .09, 2.36, 43.7]), G.cyl([x, 2.36, 43.6], [x, 2.62, 43.6], .022, F())); }
  for (const s of [-1, 1]) { P.push(...pipes(COOL_S(s), .07), ...pipes(COOL_R(s), .07)); }
  for (const [x] of PUMPS) P.push(...pipes(COOL_P(x), .06));
  return P;
}
const coupling = () => [G.lathe([0, 0, .74], [0, 0, 1], [[0, .13], [.16, .13]], {}), ...[0, 1, 2, 3].map(k => { const a = k / 4 * TAU; return G.line([[0, 0, .82], [Math.cos(a) * .13, Math.sin(a) * .13, .82]]); })];
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
/* bus bar routes (ship frame) */
const BUS_A = ALT.map(([x, y, z], k) => { const s = Math.sign(x), j = k >> 1, xi = s * (1.66 + .16 * j); return [[x, 3.81, z], [x, 5.9, z], [xi, 6.36, z], [xi, 6.36, 55.62], [xi, FL + CAB_H, 55.62]]; });
const BUS_B = RACKS.map(rk => { const s = rk.s, j = rk.j, xl = s * (1.36 + .14 * j), xc = s * (.8 + .24 * j); return [[xc, FL + .12, CAB_Z], [xc, FL + .12, 55.1], [xl, FL + .12, 54.9], [xl, FL + .12, rk.z0 + .04], [s * 1.83, FL + .12, rk.z0 + .04]]; });
const BUS_C = RACKS.map(rk => { const s = rk.s, j = rk.j, xm = s * (1.0 + .12 * j), zc = GZ + .18 * (2 * j - 1); return [[s * 1.83, FL + 4.66, rk.z0 + .04], [s * 1.83, 6.08, rk.z0 + .04], [xm, 6.08, rk.z0 + .04], [xm, 6.08, zc], [s * .74, 6.28, zc]]; });
const JOINTS = [];
for (const set of [BUS_A, BUS_B, BUS_C]) for (const pl of set) for (let i = 1; i < pl.length - 1; i++) JOINTS.push(pl[i]);
function busPrims() {
  const P = [];
  for (const p of BUS_A) P.push(...bars(p, .14, .05, [0, 0, 1]));
  for (const p of BUS_B) P.push(...bars(p, .14, .04, [0, 1, 0]));
  for (const p of BUS_C) P.push(...bars(p, .14, .04, [0, 1, 0]));
  for (const j of JOINTS) P.push(G.box([j[0] - .1, j[1] - .08, j[2] - .1], [j[0] + .1, j[1] + .08, j[2] + .1], F()));
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
  const HX = [3.5, 4.9], HZ = [GZ - 1.26, GZ + 1.26];
  const sk = (q, n) => { const [a, b, c, d] = q; const o = { t: 'quad', q, n }; return o; };
  for (let i = 0; i < Z.length - 1; i++) {
    const z0 = Z[i], z1 = Z[i + 1], a = sec(z0), b = sec(z1);
    for (const s of [-1, 1]) {
      const p = (q, z) => [s * q[0], q[1], z];
      P.push(sk([p(a.w, z0), p(b.w, z1), p(b.k, z1), p(a.k, z0)], [s, 0, 0]));
      P.push(sk([p(a.k, z0), p(b.k, z1), p(b.d, z1), p(a.d, z0)], [s, 0, 0]));
    }
    const zm = (z0 + z1) / 2, hole = zm > HZ[0] && zm < HZ[1];
    const xs = hole ? [[-a.d[0], -HX[1]], [-HX[0], HX[0]], [HX[1], a.d[0]]] : [[-a.d[0], a.d[0]]];
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
const XO = { a: 1, fade: 900, back: .1, lime: 0, keep: 1, md: 0, zfix: undefined, size: 1, S: null, tint: null, tk: 0, cut: null, px: 3.2, edge: .62, occ: true, bk: .33, lmin: 0, px0: 99, foc: 0 };
const XOO = Object.assign({}, XO);
function xopt(o) { for (const k in XO) XOO[k] = o && o[k] !== undefined ? o[k] : XO[k]; return XOO; }
function runX(P, i0, i1, sp, o, md, step) {
  const x = XMR, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, BW = 1920, BH = 1080;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a, fade = o.fade, kf = .55 * A / fade, kfar = .45 * A, back = o.back, keep = o.keep, big = o.size, omd = o.md, allThin = md === 2, eb = o.edge;
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
        b = .06 + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
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
    const pxe = foc > 0 && d > foc ? PX * Math.pow(Math.min(2.4, d / foc), 1.3) : PX;
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

/* ================= build ================= */
function build() {
  const t0 = performance.now();
  const CL = {
    baseAbove: lod(baseAbove(), .9), baseBelow: lod(baseBelow(), .9, LB), roller: lod(rollerPath(), .9, LB),
    exS: lod(exchanger(1)), exP: lod(exchanger(-1)), hatchS: lod(hatchLid(1)), hatchP: lod(hatchLid(-1)), coamS: lod(hatchCoaming(1)), coamP: lod(hatchCoaming(-1)),
    turret: lod(turret(), .8, LB), rear: lod(barrelRear(), .8), breech: lod(breechBlock()), jawS: lod(jaw(1), .5), jawP: lod(jaw(-1), .5),
    railsR: lod(barrelRails(RZ1)), coverS: lod(cover(1)), coverP: lod(cover(-1)),
    sleeve: lod(sleeve(), .8), railsE: lod(sleeveRails()), petalT: lod(petal(1)), petalB: lod(petal(-1)),
    round: lod(round_(), .5), sabot: lod(sabotPetal(), .4), arm: lod(armature(), .4), drum: lod(drum(), .8), pinion: lod(pinion(), .5), hoist: lod(hoist(), .8), carriage: lod(carriage(), .5), tray: lod(tray(), .5),
    body: lod(altBody(), .8), bell: lod(altBell(), .8), exc: lod(altExciter(), .8), fan: lod(altFan(), .6), rotor: lod(altRotor(), .8),
    module: lod(module_(), .5), racks: lod(racks(), .9, LB), cab: lod(cabinets(), .9, LB), breaker: lod(breaker(), .5),
    cool: lod(coolStatic(), .9, LB), coupling: lod(coupling(), .5), wheel: lod(handwheel(), .5),
    over: lod(overhead(), 1.1, LB), fanB: lod(fanBlades(), .6), floor: lod(floor(), 1.2, LB), bus: lod(busPrims(), .9, LB),
    hullP: hullCloud(),
  };
  CL.ms = performance.now() - t0;
  if (window.RGP) window.RGP.CL = CL;
  let n = 0; for (const k in CL) if (CL[k].lv) n += CL[k].lv[0].length / 6; CL.n0 = n;
  return CL;
}

window.RGP = {
  GZ, GY, M0, FL, CUT, TRN, SLV0, SLV1, EXT, MZ_E, RZ0, RZ1, ALT, ALT_FLIP, XALT, RACKS, MOD, BANDS, EL_LOAD,
  TRAY_Z, SEAT_Z, RND_H, HZ, HY0, HY1, DRUM_R, DRUM_Y, RND_Y0, PIN_P, PUMPS, VALVES, FANS, CAB_X, CAB_Z, CAB_H, BRK, JOINTS,
  HATCH_HINGE, COVER_HINGE, PETAL_HINGE, RAM_H, RAM_C, TUR_OCC, BR_OCC, RACK_OCC, CAB_OCC, RISERS,
  BUS_A: BUS_A.map(poly), BUS_B: BUS_B.map(poly), BUS_C: BUS_C.map(poly),
  COOL: [1, -1].flatMap(s => [COOL_S(s), COOL_R(s)]).concat(PUMPS.map(p => COOL_P(p[0]))).map(poly),
  sampleLat, lod, LV, LB, quadL, lineL, ringL, perp, bar, bars, pipes, circ, boxY, boxZ, hullAt, sec, hD,
  poly, polyAt, XS, drawX, build, occReset, occHex, occd, odot, oglow, np: () => { const n = NP; NP = 0; return n; },
};
})();
