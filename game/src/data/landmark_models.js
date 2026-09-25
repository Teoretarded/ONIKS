/* ONIKS · landmark and ambient-life models, in the GEO / HD part format (reference/menus/common/geo.js).
   window.M3, window.GEO and window.HD are classic scripts loaded before this module.

   Metres, +Z forward, +Y up, +X right-hand side. Ships: origin midships on the waterline. Marks and buildings:
   origin on the ground (or the water) at their centre. World-anchored builds (settlements, bridges, lines):
   origin at an anchor point at sea level, prims at absolute heights. Every part carries a true label and real
   dimensions; small detail is flagged fine (skipped at the coarse levels of detail).

   Exports
     LM_MODELS        key -> factory() for the fixed models (civilian ships, buoys, marks, buildings, platform, wrecks)
     LM_INFO          key -> { name, size [L (z), W (x), H (y)] m, s: dot spacings [near, mid, far], lights: [...] }
                      lights: model-space lamps { p, col: 'w'|'g'|'r', arc: 'mast'|'stbd'|'port'|'stern'|'all', ch }
     buildLandmark(spec, ground) -> { parts }   the parametric builds (spec from world/landmarks.js), by spec.kind:
                      settlement, bridge_cs, bridge_susp, bridge_beam, powerline, penstock, jetty, quay, stacks, reeds,
                      road, pipeline
     settlementBase(S, ground), settlementLights(S, ground)   a settlement's ground heights, its windows and lamps
     mergeParts(parts, n)   the far version of a build (a few parts: few draw calls)
     spacingFor(spec) -> [s0, s1, s2, s3]   levels of detail for a parametric build
     chunkParts(prims, cell, label) -> parts   split a big world-anchored build into compact parts (per-part LOD) */
const M3 = window.M3, GEO = window.GEO, HD = window.HD;
if (!M3 || !GEO || !HD) throw new Error('landmark_models.js needs m3.js, geo.js and the HD models loaded first');
const { V, R, X } = M3;
const { hex, lathe, cyl, panel, line } = GEO;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const FY = [0, 1, 0], FX = [1, 0, 0], FZ = [0, 0, 1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const mix = (a, b, t) => a + (b - a) * t;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const tp = HD.tp, tps = (T, L) => L.map(pr => tp(T, pr));
const T3 = p => X.make(R.I(), p);
const Ty = (yaw, p) => X.make(R.y(yaw), p);

/* seeded stream (mulberry32, as M3.rng) */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const BUILDERS = {};                 // parametric builds by spec.kind (buildLandmark)

/* ================================================================ helpers */
/* thin plate from a planar quad: dots on the face toward `out` only */
function sheet(q, out, o) {
  let n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0])));
  if (V.len(n) < .5) n = V.norm(V.cross(V.sub(q[2], q[0]), V.sub(q[3], q[1])));
  if (V.len(n) < .5) n = V.norm(V.cross(V.sub(q[2], q[1]), V.sub(q[3], q[1])));
  if (out && V.dot(n, out) < 0) n = V.mul(n, -1);
  const th = (o && o.th) || .05;
  return hex([...q.map(p => V.mad(p, n, -th)), ...q], O({ skip: [2, 3, 4, 5] }, o));
}
/* box, axis-aligned in its own frame, turned by yaw about Y around (cx, cz); y0..y1 */
function ybox(cx, cz, yaw, hx, hz, y0, y1, o) {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (x, y, z) => [cx + c * x + s * z, y, cz - s * x + c * z];
  return hex([P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), P(-hx, y1, -hz), P(hx, y1, -hz), P(hx, y1, hz), P(-hx, y1, hz)], o);
}
const bx = (a, b, o) => GEO.box(a, b, o);
/* tapered block: bottom half sizes (hx, hz) at y0, top (tx, tz) at y1, centred on (cx, cz) */
function taper(cx, cz, hx, hz, y0, tx, tz, y1, o) {
  return hex([[cx - hx, y0, cz - hz], [cx + hx, y0, cz - hz], [cx + hx, y0, cz + hz], [cx - hx, y0, cz + hz],
    [cx - tx, y1, cz - tz], [cx + tx, y1, cz - tz], [cx + tx, y1, cz + tz], [cx - tx, y1, cz + tz]], o);
}
/* square beam between two points (width w, depth d), local up from `up` */
function beam(a, b, w, d, o, up) {
  const f = V.norm(V.sub(b, a));
  let u = up || (Math.abs(f[1]) > .95 ? FX : FY);
  let s = V.cross(u, f); if (V.len(s) < 1e-6) s = V.cross(FX, f);
  s = V.norm(s); u = V.norm(V.cross(f, s));
  const q = (p, x, y) => V.add(p, V.add(V.mul(s, x * w / 2), V.mul(u, y * d / 2)));
  return hex([q(a, -1, -1), q(a, 1, -1), q(b, 1, -1), q(b, -1, -1), q(a, -1, 1), q(a, 1, 1), q(b, 1, 1), q(b, -1, 1)], O({ bottom: true }, o));
}
/* hanging cable a -> b with sag (m) at mid-span, n points */
function catenary(a, b, sag, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const t = i / n; p.push([mix(a[0], b[0], t), mix(a[1], b[1], t) - 4 * sag * t * (1 - t), mix(a[2], b[2], t)]); }
  return p;
}
/* lattice between four corner lines (a tower or a boom): legs + K bracing, levels at `lv` fractions */
function lattice(C0, C1, n, o) {
  // C0, C1: arrays of 4 corners at the two ends; n panels
  const P = [], w = (o && o.w) || .6, r = (o && o.r) || .12;
  for (let k = 0; k < 4; k++) P.push(cyl(C0[k], C1[k], r, { n: 6, gen: 0 }));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    for (let k = 0; k < 4; k++) {
      const a0 = V.lerp(C0[k], C1[k], t0), b0 = V.lerp(C0[(k + 1) % 4], C1[(k + 1) % 4], t0);
      const a1 = V.lerp(C0[k], C1[k], t1), b1 = V.lerp(C0[(k + 1) % 4], C1[(k + 1) % 4], t1);
      P.push(line([a0, b1], { w }), line([b0, a1], fn({ w })));
      if (i) P.push(line([a0, b0], { w: w * .8 }));
    }
  }
  return P;
}
/* ring of line (a handrail, a lantern band) */
function hoop(c, r, n, o) {
  const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; p.push([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r]); }
  return line(p, O({ closed: true }, o));
}
/* spherical cap / dome on a lathe: centre base c, radius r, from angle 0 (equator) to 90 */
function dome(c, r, o) {
  const st = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI / 2; st.push([r * Math.sin(a), r * Math.cos(a) + 1e-4]); }
  return lathe(c, FY, st, O({ n: 24, gen: 6 }, o));
}
function sphereAt(c, r, o) {
  const st = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * PI; st.push([r * (1 - Math.cos(a)), r * Math.sin(a) + 1e-4]); }
  return lathe(V.add(c, [0, -r, 0]), FY, st, O({ n: 24, gen: 6 }, o));
}
/* gable house: walls w (x) by d (z), eave height e, ridge height r above base y0, overhang ov, turned by yaw */
function house(cx, cz, yaw, w, d, y0, e, r, o) {
  o = o || {};
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (x, y, z) => [cx + c * x + s * z, y, cz - s * x + c * z];
  const hx = w / 2, hz = d / 2, ov = o.ov === undefined ? .5 : o.ov, yb = y0 - (o.found || 1.2);
  const out = [];
  out.push(hex([P(-hx, yb, -hz), P(hx, yb, -hz), P(hx, yb, hz), P(-hx, yb, hz), P(-hx, y0 + e, -hz), P(hx, y0 + e, -hz), P(hx, y0 + e, hz), P(-hx, y0 + e, hz)], { skip: [1] }));
  if (r > e + .2) {
    // ridge along the long side
    const alongZ = d >= w;
    const lx = hx + ov, lz = hz + ov;
    const ye = y0 + e - ov * .35, yr = y0 + r;
    const b = [P(-hx - ov, ye, -hz - ov), P(hx + ov, ye, -hz - ov), P(hx + ov, ye, hz + ov), P(-hx - ov, ye, hz + ov)];
    const t = alongZ ? [P(0, yr, -lz), P(0, yr, -lz), P(0, yr, lz), P(0, yr, lz)] : [P(-lx, yr, 0), P(lx, yr, 0), P(lx, yr, 0), P(-lx, yr, 0)];
    out.push(hex([...b, ...t], { ds: o.roofDs || 1 }));
  } else out.push(hex([P(-hx - .2, y0 + e - .1, -hz - .2), P(hx + .2, y0 + e - .1, -hz - .2), P(hx + .2, y0 + e - .1, hz + .2), P(-hx - .2, y0 + e - .1, hz + .2),
    P(-hx - .2, y0 + e + .5, -hz - .2), P(hx + .2, y0 + e + .5, -hz - .2), P(hx + .2, y0 + e + .5, hz + .2), P(-hx - .2, y0 + e + .5, hz + .2)], { skip: [0], ds: o.roofDs || 1 }));
  if (o.chimney) out.push(ybox(cx + c * w * .22, cz - s * w * .22, yaw, .35, .35, y0 + e, y0 + r + .8, fn()));
  return out;
}

/* ================================================================ ship hulls
   Stations along z (stern -L/2 .. bow +L/2): half breadth at the deck, flare to the waterline, sheer.
   o: bow (u where the entrance starts), transom (stern half breadth fraction), sheerF / sheerA (m),
   double (a double-ended ferry), blunt (end half breadth fraction for double-enders), y0 (bottom of the sides). */
function hull(L, B, F, o) {
  o = o || {};
  const ub = o.bow === undefined ? .45 : o.bow, tr = o.transom === undefined ? .8 : o.transom;
  const sF = o.sheerF === undefined ? 1.5 : o.sheerF, sA = o.sheerA === undefined ? .4 : o.sheerA, N = o.n || 26, y0 = o.y0 === undefined ? -.8 : o.y0;
  const hb = u => {
    if (o.double) { const a = Math.abs(u); return a > ub ? 1 - (1 - (o.blunt || .45)) * Math.pow((a - ub) / (1 - ub), 1.6) : 1; }
    if (u > ub) return Math.pow(Math.max(0, 1 - Math.pow((u - ub) / (1 - ub), 1.8)), .6);
    if (u < -.78) return 1 - (1 - tr) * Math.pow((-.78 - u) / .22, 1.3);
    return 1;
  };
  const dk = u => F + sF * Math.pow(Math.max(0, (u - .35) / .65), 2) + sA * Math.pow(Math.max(0, (-.55 - u) / .45), 2) + (o.double ? sF * Math.pow(Math.max(0, (-u - .35) / .65), 2) : 0);
  const st = [];
  for (let i = 0; i <= N; i++) { const u = -1 + 2 * i / N; st.push({ u, z: u * L / 2, b: Math.max(.02, B / 2 * hb(u)), y: dk(u) }); }
  const P = [], fl = o.flare === undefined ? .93 : o.flare;
  for (let i = 0; i < N; i++) {
    const a = st[i], c = st[i + 1];
    for (const sx of [-1, 1]) P.push(sheet([[sx * a.b * fl, y0, a.z], [sx * c.b * fl, y0, c.z], [sx * c.b, c.y, c.z], [sx * a.b, a.y, a.z]], [sx, 0, 0]));
    P.push(sheet([[-a.b, a.y, a.z], [a.b, a.y, a.z], [c.b, c.y, c.z], [-c.b, c.y, c.z]], FY, { ds: o.deckDs || 1.4 }));
  }
  const s0 = st[0], s1 = st[N];
  P.push(sheet([[-s0.b * fl, y0, s0.z], [s0.b * fl, y0, s0.z], [s0.b, s0.y, s0.z], [-s0.b, s0.y, s0.z]], [0, 0, -1]));
  if (o.double) P.push(sheet([[-s1.b * fl, y0, s1.z], [s1.b * fl, y0, s1.z], [s1.b, s1.y, s1.z], [-s1.b, s1.y, s1.z]], [0, 0, 1]));
  if (o.rail !== false) {
    const rh = o.rail || 1;
    for (const sx of [-1, 1]) P.push(line(st.map(s => [sx * s.b, s.y + rh, s.z]), fn({ w: .6 })));
  }
  const at = z => { const u = Math.max(-1, Math.min(1, z / (L / 2))); return { b: B / 2 * hb(u), y: dk(u) }; };
  return { P, at };
}

/* ================================================================ civilian ships (neutral, dim) */
/* general cargo ship, 120 m: forecastle, three hatch covers, two deck cranes, aft accommodation, funnel */
function cargoShip() {
  const L = 120, B = 17, F = 5.4, H = hull(L, B, F, { bow: .5, transom: .82, sheerF: 2.2 });
  const dk = z => H.at(z).y;
  const S = [], C = [], M = [];
  // forecastle
  { const z0 = 45, z1 = 60, b0 = H.at(z0).b, b1 = H.at(z1).b * .9; S.push(hex([[-b0, dk(z0), z0], [b0, dk(z0), z0], [b1, dk(z1), z1], [-b1, dk(z1), z1], [-b0, dk(z0) + 2.4, z0], [b0, dk(z0) + 2.4, z0], [b1, dk(z1) + 2.4, z1], [-b1, dk(z1) + 2.4, z1]])); }
  // hatch covers
  for (const zc of [30, 7, -16]) S.push(bx([-6.3, dk(zc), zc - 9.6], [6.3, dk(zc) + 1.7, zc + 9.6], { ribs: { z: 6 }, ds: 1.2 }));
  // deck cranes on the centreline between the hatches, jibs stowed fore and aft
  for (const [zc, dir] of [[18.5, 1], [-4.5, -1]]) {
    const y = dk(zc);
    C.push(cyl([0, y, zc], [0, y + 7.5, zc], 1.2, { n: 16, gen: 4, caps: true }));
    C.push(bx([-1.6, y + 7.5, zc - 1.8], [1.6, y + 10.3, zc + 1.8]));
    C.push(beam([0, y + 9.5, zc + dir * 1.2], [0, y + 12.5, zc + dir * 22], .9, .9));
  }
  // accommodation: four tiers, bridge wings, wheelhouse
  const za = -50, zb = -38, y0 = dk(-44);
  S.push(bx([-7.5, y0, za], [7.5, y0 + 2.8, zb]));
  S.push(bx([-7, y0 + 2.8, za + .5], [7, y0 + 5.6, zb - .3]));
  S.push(bx([-6.5, y0 + 5.6, za + 1], [6.5, y0 + 8.4, zb - .6]));
  S.push(bx([-6, y0 + 8.4, za + 2.5], [6, y0 + 11, zb - 1]));
  S.push(bx([-8.5, y0 + 10.4, zb - 3], [8.5, y0 + 10.8, zb - 1], fn()));
  // funnel and radar mast
  S.push(taper(0, -54, 1.8, 2.4, y0 + 2, 1.5, 2, y0 + 15));
  M.push(cyl([0, y0 + 11, -41], [0, y0 + 17, -41], .18, { n: 6, gen: 0 }));
  M.push(line([[-2.5, y0 + 15.5, -41], [2.5, y0 + 15.5, -41]], { w: .7 }));
  M.push(cyl([0, dk(52) + 2.4, 52], [0, dk(52) + 13, 52], .22, { n: 6, gen: 0 }));
  return {
    name: 'lm_cargo', L, B,
    parts: [
      { name: 'hull', label: 'Hull · general cargo · 120 × 17 m', prims: H.P },
      { name: 'super', label: 'Accommodation · hatch covers', prims: S },
      { name: 'cranes', label: 'Deck cranes · 2 × 25 t', prims: C },
      { name: 'masts', label: 'Masts', prims: M },
    ],
  };
}
/* product tanker, 144 m: low deck with pipe rack and catwalk, manifold crane, aft superstructure */
function tanker() {
  const L = 144, B = 23, F = 5.8, H = hull(L, B, F, { bow: .55, transom: .85, sheerF: 1.8 });
  const dk = z => H.at(z).y;
  const S = [], P = [], M = [];
  { const z0 = 58, z1 = 71, b0 = H.at(z0).b, b1 = H.at(z1).b * .9; S.push(hex([[-b0, dk(z0), z0], [b0, dk(z0), z0], [b1, dk(z1), z1], [-b1, dk(z1), z1], [-b0, dk(z0) + 2.4, z0], [b0, dk(z0) + 2.4, z0], [b1, dk(z1) + 2.4, z1], [-b1, dk(z1) + 2.4, z1]])); }
  // pipe rack and catwalk down the middle
  for (const x of [-1.6, -.8, .8, 1.6]) P.push(cyl([x, dk(0) + .9, -50], [x, dk(0) + .9, 57], .22, { n: 8, gen: 0 }));
  P.push(bx([-.7, dk(0) + 2.2, -50], [.7, dk(0) + 2.35, 57], { ds: 1.2 }));
  for (let z = -48; z < 57; z += 6) P.push(bx([-.08, dk(z), z - .08], [.08, dk(z) + 2.2, z + .08], fn()));
  // manifold and hose crane
  for (const sx of [-1, 1]) P.push(bx([sx * 3 - 2, dk(0), -4], [sx * 3 + 2, dk(0) + 1.6, 4]));
  P.push(cyl([4.5, dk(0), 6], [4.5, dk(0) + 6, 6], .5, { n: 10, gen: 2 }), beam([4.5, dk(0) + 5.6, 6], [8.5, dk(0) + 9, -6], .5, .5));
  // aft superstructure, five tiers
  const za = -69, zb = -54, y0 = dk(-60);
  for (let k = 0; k < 5; k++) S.push(bx([-9.5 + k * .5, y0 + k * 2.8, za + k * .4], [9.5 - k * .5, y0 + (k + 1) * 2.8, zb - k * .5]));
  S.push(bx([-11.3, y0 + 13.6, zb - 3.5], [11.3, y0 + 14, zb - 2], fn()));
  S.push(taper(0, -71, 2.1, 2.8, y0 + 4, 1.8, 2.4, y0 + 20.5));
  M.push(cyl([0, y0 + 14, -58], [0, y0 + 21, -58], .2, { n: 6, gen: 0 }), line([[-3, y0 + 19.5, -58], [3, y0 + 19.5, -58]], { w: .7 }));
  M.push(cyl([0, dk(66) + 2.4, 66], [0, dk(66) + 14, 66], .22, { n: 6, gen: 0 }));
  return {
    name: 'lm_tanker', L, B,
    parts: [
      { name: 'hull', label: 'Hull · product tanker · 144 × 23 m', prims: H.P },
      { name: 'super', label: 'Superstructure · 5 tiers', prims: S },
      { name: 'deck', label: 'Pipe rack · catwalk · manifold', prims: P },
      { name: 'masts', label: 'Masts', prims: M },
    ],
  };
}
/* stern trawler, 54 m: forward superstructure, funnel, gantry and trawl drum aft */
function trawler() {
  const L = 54, B = 10.5, F = 3.1, H = hull(L, B, F, { bow: .4, transom: .9, sheerF: 2.6, sheerA: .2 });
  const dk = z => H.at(z).y;
  const S = [], G = [], M = [];
  S.push(bx([-4.6, dk(12), 5], [4.6, dk(12) + 2.6, 19]));
  S.push(bx([-3.6, dk(12) + 2.6, 9], [3.6, dk(12) + 5.1, 17]));
  S.push(taper(0, 2.8, 1.1, 1.3, dk(3), .9, 1.1, dk(3) + 8.6));
  // trawl gantry (A-frame) at the stern, net drum, winches
  const yg = dk(-22);
  for (const sx of [-1, 1]) G.push(beam([sx * 4.4, yg, -23], [sx * 3.8, yg + 9, -22.3], .5, .6));
  G.push(beam([-3.8, yg + 9, -22.3], [3.8, yg + 9, -22.3], .6, .6));
  G.push(cyl([-2.8, yg + 1.6, -15], [2.8, yg + 1.6, -15], 1.4, { n: 16, gen: 4, caps: true }));
  for (const sx of [-1, 1]) G.push(bx([sx * 2.5 - 1, dk(-4), -6], [sx * 2.5 + 1, dk(-4) + 1.6, -3]));
  M.push(cyl([0, dk(13) + 5.1, 13], [0, dk(13) + 12.5, 13], .15, { n: 6, gen: 0 }), line([[-2, dk(13) + 11, 13], [2, dk(13) + 11, 13]], { w: .6 }));
  M.push(cyl([0, dk(23), 23], [0, dk(23) + 10, 23], .15, { n: 6, gen: 0 }));
  M.push(line([[0, dk(23) + 10, 23], [0, dk(13) + 12.5, 13]], fn({ w: .5 })));
  return {
    name: 'lm_trawler', L, B,
    parts: [
      { name: 'hull', label: 'Hull · stern trawler · 54 × 10.5 m', prims: H.P },
      { name: 'super', label: 'Wheelhouse · accommodation · funnel', prims: S },
      { name: 'gear', label: 'Trawl gantry · net drum · winches', prims: G },
      { name: 'masts', label: 'Masts', prims: M },
    ],
  };
}
/* inshore fishing boat, 12 m: wheelhouse aft of midships, mast and boom */
function fishingBoat() {
  const L = 12, B = 3.9, F = 1.15, H = hull(L, B, F, { bow: .3, transom: .85, sheerF: .6, sheerA: .1, n: 16, y0: -.4, rail: .5 });
  const dk = z => H.at(z).y;
  const S = [];
  S.push(bx([-1.1, dk(-1), -2.2], [1.1, dk(-1) + 2.1, .6]));
  S.push(bx([-1.2, dk(-1) + 2.1, -2.3], [1.2, dk(-1) + 2.25, .7], fn()));
  S.push(cyl([0, dk(2), 2], [0, dk(2) + 5.2, 2], .07, { n: 6, gen: 0 }), line([[0, dk(2) + 1.4, 2], [0, dk(2) + 2.4, -3.8]], { w: .6 }));
  S.push(bx([-1.3, dk(-4.5), -5.2], [1.3, dk(-4.5) + .5, -3.8], fn()));
  return {
    name: 'lm_boat', L, B,
    parts: [
      { name: 'hull', label: 'Fishing boat · 12 m', prims: H.P },
      { name: 'house', label: 'Wheelhouse · mast · boom', prims: S },
    ],
  };
}
/* double-ended ro-ro ferry, 86 m: open car deck between side casings, passenger deck and wheelhouse on top */
function ferry() {
  const L = 86, B = 17, F = 2.8, H = hull(L, B, F, { double: true, bow: .62, blunt: .52, sheerF: .5, rail: false });
  const S = [], R2 = [];
  const y = F;
  for (const sx of [-1, 1]) {
    S.push(bx([sx > 0 ? 5.2 : -8.2, y, -31], [sx > 0 ? 8.2 : -5.2, y + 5.2, 31]));
    S.push(taper(sx * 6.7, sx * 9, .9, 1.2, y + 5.2, .8, 1, y + 12.2));
  }
  S.push(bx([-8.4, y + 5.2, -15], [8.4, y + 8.1, 15]));
  S.push(bx([-6, y + 8.1, -4.5], [6, y + 10.6, 4.5]));
  S.push(bx([-6.3, y + 10.6, -4.8], [6.3, y + 10.8, 4.8], fn()));
  S.push(cyl([0, y + 10.8, 0], [0, y + 16, 0], .15, { n: 6, gen: 0 }));
  // end ramps (raised) and the car-deck bulwarks
  for (const sz of [-1, 1]) {
    R2.push(sheet([[-4, y, sz * 41.5], [4, y, sz * 41.5], [4, y + 3.6, sz * 43], [-4, y + 3.6, sz * 43]], [0, .3, sz]));
    for (const sx of [-1, 1]) R2.push(bx([sx * 5.4 - .1, y, sz * 31], [sx * 5.4 + .1, y + 1.1, sz * 40.5], fn()));
  }
  return {
    name: 'lm_ferry', L, B,
    parts: [
      { name: 'hull', label: 'Hull · double-ended ferry · 86 × 17 m', prims: H.P },
      { name: 'super', label: 'Side casings · passenger deck · wheelhouse', prims: S },
      { name: 'ramps', label: 'Car ramps · 2 ends', prims: R2 },
    ],
  };
}
/* river barge, 80 m, low freeboard, blunt raked ends, two hatch coamings */
function riverBarge() {
  const L = 80, B = 11.4, F = 1.9, S = [];
  S.push(hex([[-5.7, -.8, -38], [5.7, -.8, -38], [5.7, -.8, 36], [-5.7, -.8, 36], [-5.7, F, -40], [5.7, F, -40], [5.7, F, 40], [-5.7, F, 40]], { ds: 1.3 }));
  for (const zc of [-19, 17]) S.push(bx([-4.8, F, zc - 16], [4.8, F + 1.1, zc + 16], { ribs: { z: 8 }, ds: 1.3 }));
  return { name: 'lm_barge', L, B, parts: [{ name: 'hull', label: 'River barge · 80 × 11.4 m', prims: S }] };
}

/* platform supply vessel, 70 m: high bow, the superstructure forward, the long open cargo deck aft with its
   bulwarks, twin funnels abreast the bridge */
function supplyVessel() {
  const L = 70, B = 16, F = 3.2, H = hull(L, B, F, { bow: .5, transom: .96, sheerF: 3.2, sheerA: 0, rail: false });
  const dk = z => H.at(z).y;
  const S = [], D = [];
  S.push(bx([-7.4, dk(22), 12], [7.4, dk(22) + 2.8, 27]));
  S.push(bx([-7, dk(22) + 2.8, 14], [7, dk(22) + 5.6, 26.5]));
  S.push(bx([-6.2, dk(22) + 5.6, 17], [6.2, dk(22) + 8.2, 25.5]));
  S.push(bx([-8, dk(22) + 7.8, 17.5], [8, dk(22) + 8.2, 19], fn()));
  for (const sx of [-1, 1]) S.push(taper(sx * 5.6, 13.5, .9, 1.4, dk(13) + 2.8, .8, 1.2, dk(13) + 10.5));
  S.push(cyl([0, dk(22) + 8.2, 22], [0, dk(22) + 14.5, 22], .15, { n: 6, gen: 0 }), line([[-2.4, dk(22) + 13, 22], [2.4, dk(22) + 13, 22]], { w: .6 }));
  // the cargo deck: bulwarks, crash rail posts, a few containers and pipes lashed down
  for (const sx of [-1, 1]) D.push(bx([sx * 7.8 - .15, dk(-10), -34], [sx * 7.8 + .15, dk(-10) + 1.8, 11]));
  for (let z = -32; z < 10; z += 6) for (const sx of [-1, 1]) D.push(bx([sx * 6.9 - .1, dk(z), z - .1], [sx * 6.9 + .1, dk(z) + 2.6, z + .1], fn()));
  D.push(bx([-5, dk(-6), -12], [-2.6, dk(-6) + 2.6, -6]), bx([-2.3, dk(-6), -12], [.1, dk(-6) + 2.6, -6]));
  for (let k = 0; k < 5; k++) D.push(cyl([2 + k * .6, dk(-20) + .3 + (k & 1) * .5, -30], [2 + k * .6, dk(-20) + .3 + (k & 1) * .5, -16], .28, fn({ n: 8, gen: 0 })));
  return {
    name: 'lm_psv', L, B,
    parts: [
      { name: 'hull', label: 'Hull · platform supply vessel · 70 × 16 m', prims: H.P },
      { name: 'super', label: 'Bridge · accommodation · twin funnels', prims: S },
      { name: 'deck', label: 'Cargo deck · 600 m² · bulwarks', prims: D },
    ],
  };
}
/* ================================================================ buoys and marks (IALA region A) */
/* float + tower + topmark; lantern at LAMP. kind: 'can' (port), 'cone' (starboard), 'n' 'e' 's' 'w' (cardinal),
   'safe' (safe water), 'danger' (isolated danger) */
function buoy(kind) {
  const F = [], T = [];
  const pillar = kind !== 'can' && kind !== 'cone';
  F.push(lathe([0, -.9, 0], FY, [[0, .6], [.4, 1.1], [1.1, 1.2], [1.6, 1.1], [1.8, .6]], { n: 20, gen: 5, caps: true }));
  // tower: four legs of a small lattice to the lantern platform
  const top = pillar ? 3.4 : 2.6;
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; T.push(cyl([Math.cos(a) * .75, .9, Math.sin(a) * .75], [Math.cos(a) * .32, top, Math.sin(a) * .32], .05, { n: 5, gen: 0 })); }
  T.push(hoop([0, 2.1, 0], .55, 12, fn({ w: .6 })));
  T.push(lathe([0, top, 0], FY, [[0, .45], [.1, .45]], { n: 14, gen: 0, caps: true }));
  T.push(cyl([0, top + .1, 0], [0, top + .55, 0], .14, { n: 10, gen: 2, caps: true }));
  // topmark above the lantern
  const y = top + .75;
  const cone = (up, yb) => lathe([0, yb, 0], FY, up ? [[0, .32], [.55, .001]] : [[0, .001], [.55, .32]], { n: 12, gen: 3, caps: true });
  T.push(cyl([0, top + .55, 0], [0, y + (pillar ? 1.35 : .7), 0], .03, { n: 4, gen: 0 }));
  if (kind === 'can') T.push(cyl([0, y, 0], [0, y + .6, 0], .3, { n: 12, gen: 3, caps: true }));
  else if (kind === 'cone') T.push(cone(true, y));
  else if (kind === 'n') T.push(cone(true, y), cone(true, y + .7));
  else if (kind === 's') T.push(cone(false, y), cone(false, y + .7));
  else if (kind === 'e') T.push(cone(false, y), cone(true, y + .62));
  else if (kind === 'w') T.push(cone(true, y), cone(false, y + .62));
  else if (kind === 'safe') T.push(sphereAt([0, y + .35, 0], .3));
  else if (kind === 'danger') T.push(sphereAt([0, y + .3, 0], .26), sphereAt([0, y + .95, 0], .26));
  const NAMES = { can: 'Port-hand lateral buoy · can', cone: 'Starboard-hand lateral buoy · cone', n: 'North cardinal buoy', e: 'East cardinal buoy', s: 'South cardinal buoy', w: 'West cardinal buoy', safe: 'Safe-water buoy', danger: 'Isolated-danger buoy' };
  return { name: 'lm_buoy_' + kind, LAMP: [0, top + .35, 0], parts: [
    { name: 'float', label: 'Float · Ø 2.4 m', prims: F },
    { name: 'tower', label: NAMES[kind] + ' · lantern ' + (top + .35).toFixed(1) + ' m', prims: T },
  ] };
}
/* skerry light: a 12 m cast-iron tower on a concrete base, gallery, lantern and dome */
function skerryLight() {
  const B = [], TW = [], LA = [];
  B.push(lathe([0, -1.5, 0], FY, [[0, 3.4], [2.3, 3.2], [2.5, 2.6]], { n: 24, gen: 6, caps: true }));
  TW.push(lathe([0, 1, 0], FY, [[0, 1.55], [8.2, 1.05]], { n: 22, gen: 8, rings: [0, 1] }));
  for (const y of [3.5, 6]) TW.push(hoop([0, y, 0], mix(1.55, 1.05, (y - 1) / 8.2) + .02, 22, fn({ w: .5 })));
  TW.push(lathe([0, 9.2, 0], FY, [[0, 1.7], [.2, 1.7]], { n: 24, gen: 0, caps: true }));
  TW.push(hoop([0, 10.2, 0], 1.65, 20, { w: .6 }));
  LA.push(lathe([0, 9.4, 0], FY, [[0, .95], [.6, .95], [.6, .9], [2.1, .9]], { n: 18, gen: 6, rings: [0, 1, 3], ds: 1.8 }));
  LA.push(lathe([0, 11.5, 0], FY, [[0, 1.05], [.5, .7], [.85, .15], [.9, 0]], { n: 18, gen: 6 }));
  LA.push(cyl([0, 12.4, 0], [0, 13.2, 0], .04, { n: 4, gen: 0 }));
  return { name: 'lm_skerry_light', LAMP: [0, 10.6, 0], parts: [
    { name: 'base', label: 'Concrete base', prims: B },
    { name: 'tower', label: 'Iron tower · 12 m', prims: TW },
    { name: 'lantern', label: 'Lantern · dome', prims: LA },
  ] };
}
/* Pomor cross: an 8 m wooden navigation cross with its little roof, the lower bar slanted */
function pomorCross() {
  const P = [];
  P.push(bx([-.18, -.5, -.18], [.18, 8, .18]));
  P.push(bx([-1.3, 5.8, -.12], [1.3, 6.15, .12]));
  P.push(bx([-.6, 6.9, -.1], [.6, 7.15, .1]));
  P.push(beam([-.9, 2.2, 0], [.9, 3, 0], .22, .24));
  P.push(sheet([[-.5, 7.6, -.35], [.5, 7.6, -.35], [0, 8.35, -.35], [0, 8.35, -.35]], [0, 0, -1]), sheet([[-.5, 7.6, .35], [.5, 7.6, .35], [0, 8.35, .35], [0, 8.35, .35]], [0, 0, 1]));
  P.push(lathe([0, -.4, 0], FY, [[0, 1.2], [.6, .9], [.9, .3]], { n: 12, gen: 3, caps: true }));
  return { name: 'lm_cross', parts: [{ name: 'cross', label: 'Pomor cross · 8 m · navigation mark', prims: P }] };
}
/* stone cairn (gurii): a 3.2 m pile of boulders, a navigation mark on the skerries */
function cairn() {
  const r = rng(77), P = [];
  for (let k = 0; k < 16; k++) {
    const y = r() * 2.6, rad = mix(1.7, .4, y / 2.6), a = r() * TAU, d = r() * rad * .6, s = .35 + .35 * r() * (1 - y / 3.2);
    P.push(sphereAt([Math.cos(a) * d, y + s, Math.sin(a) * d], s, { n: 10, gen: 0 }));
  }
  P.push(lathe([0, -.3, 0], FY, [[0, 1.8], [1.6, 1.1], [2.8, .4], [3.2, .05]], { n: 16, gen: 4 }));
  return { name: 'lm_cairn', parts: [{ name: 'cairn', label: 'Stone cairn · 3.2 m · navigation mark', prims: P }] };
}
/* guyed lattice TV mast, 180 m, three guy levels to three anchors at 110 m; equipment building */
function tvMast() {
  const H = 180, M = [], G = [], B = [];
  const tri = y => [0, 1, 2].map(k => { const a = k / 3 * TAU; return [Math.cos(a) * 1.15, y, Math.sin(a) * 1.15]; });
  const segs = 30;
  for (let i = 0; i < segs; i++) {
    const y0 = i * H / segs, y1 = (i + 1) * H / segs, A = tri(y0), Bq = tri(y1);
    for (let k = 0; k < 3; k++) { M.push(line([A[k], Bq[k]], { w: .8 })); M.push(line([A[k], Bq[(k + 1) % 3]], fn({ w: .5 }))); }
  }
  M.push(cyl([0, H, 0], [0, H + 12, 0], .45, { n: 8, gen: 2 }));
  for (const gy of [60, 120, 176]) for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + PI / 6, an = [Math.cos(a) * 110, 1, Math.sin(a) * 110];
    G.push(line(catenary([Math.cos(a) * 1.2, gy, Math.sin(a) * 1.2], an, 1.5, 24), { w: .5 }));
  }
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + PI / 6; G.push(bx([Math.cos(a) * 110 - 1.5, -.5, Math.sin(a) * 110 - 1.5], [Math.cos(a) * 110 + 1.5, 1.2, Math.sin(a) * 110 + 1.5])); }
  B.push(bx([6, -1, -4], [18, 4, 4]));
  return { name: 'lm_mast', LAMPS: [[0, 60, 0], [0, 120, 0], [0, H + 12, 0]], parts: [
    { name: 'mast', label: 'TV mast · guyed lattice · 192 m', prims: M },
    { name: 'guys', label: 'Guy wires · 3 levels · anchors at 110 m', prims: G },
    { name: 'building', label: 'Transmitter building', prims: B },
  ] };
}
/* village church: nave with a gable roof, apse, drum and onion dome, bell tower with a tent spire */
function church() {
  const N = [], D = [], BT = [];
  N.push(...house(0, 0, 0, 10, 16, 0, 8, 12.5, { ov: .4, found: 1 }));
  N.push(lathe([0, -1, 8], FY, [[0, 3.4], [8.2, 3.4]], { n: 16, gen: 4 }));
  N.push(lathe([0, 7.2, 8], FY, [[0, 3.6], [2.4, .2]], { n: 16, gen: 4 }));
  // drum and onion dome
  D.push(lathe([0, 11.8, 1], FY, [[0, 2.4], [4.2, 2.4], [4.4, 2.6]], { n: 20, gen: 8, rings: [0, 1] }));
  D.push(lathe([0, 16.2, 1], FY, [[0, 2.6], [.8, 3.2], [2, 3.3], [3.2, 2.5], [4.2, 1.1], [4.9, .3], [5.3, .12]], { n: 22, gen: 8, rings: [2, 4] }));
  D.push(line([[0, 21.5, 1], [0, 24.3, 1]], { w: 1 }), line([[-.7, 23.5, 1], [.7, 23.5, 1]], { w: 1 }), line([[-.45, 22.6, 1], [.45, 22.9, 1]], fn({ w: .8 })));
  // bell tower at the west end
  BT.push(bx([-2.8, -1, -13.6], [2.8, 15, -8]));
  BT.push(bx([-2.4, 15, -13.2], [2.4, 19, -8.4], { ds: 1.4 }));
  BT.push(hex([[-2.6, 19, -13.4], [2.6, 19, -13.4], [2.6, 19, -8.2], [-2.6, 19, -8.2], [0, 27, -10.8], [0, 27, -10.8], [0, 27, -10.8], [0, 27, -10.8]]));
  BT.push(lathe([0, 27, -10.8], FY, [[0, .5], [.5, .6], [1.1, .15]], { n: 12, gen: 3 }), line([[0, 28, -10.8], [0, 29.8, -10.8]], { w: 1 }), line([[-.5, 29.2, -10.8], [.5, 29.2, -10.8]], { w: 1 }));
  return { name: 'lm_church', parts: [
    { name: 'nave', label: 'Church · nave and apse · 16 m', prims: N },
    { name: 'dome', label: 'Drum and onion dome · 24 m', prims: D },
    { name: 'belfry', label: 'Bell tower · tent spire · 30 m', prims: BT },
  ] };
}
/* water tower (Rozhnovsky type): a 26 m steel shaft, 6 m tank with a conical roof */
function waterTower() {
  const P = [];
  P.push(lathe([0, -1, 0], FY, [[0, 1.8], [1.2, 1.6], [26, 1.4]], { n: 16, gen: 6, rings: [1, 2] }));
  P.push(lathe([0, 25, 0], FY, [[0, 1.4], [1.4, 3.1], [6.2, 3.1], [6.3, 3.3], [8.2, .3]], { n: 22, gen: 8, rings: [1, 2, 3] }));
  P.push(hoop([0, 31.3, 0], 3.35, 22, fn({ w: .5 })));
  return { name: 'lm_water_tower', parts: [{ name: 'tower', label: 'Water tower · 33 m · tank 150 m³', prims: P }] };
}

/* ================================================================ offshore
   Gas production platform on the shallow shelf: a four-leg jacket (battered 1:8), cellar deck +14 m, main deck
   +20 m with the process and compressor modules and the quarters, a helideck (22 m) cantilevered over one corner,
   a pedestal crane, and the flare boom (45 m at 40 degrees) out over the sea from the opposite corner.
   Origin: centre, on the sea surface; the flare points along +X+Z. */
const PLAT = { DECK: 20, FLARE: [37.4, 48.9, 37.4] };
function gasPlatform() {
  const J = [], D = [], M = [], H = [], C = [], F = [];
  const leg = (sx, sz, y) => { const k = 12 + (20 - y) / 8 * .5; return [sx * k, y, sz * k]; };
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sz] of corners) J.push(cyl(leg(sx, sz, -6), leg(sx, sz, 20), .8, { n: 14, gen: 4 }));
  for (const [y0, y1] of [[-6, 3], [3, 13]]) for (let k = 0; k < 4; k++) {
    const a = corners[k], b = corners[(k + 1) % 4];
    J.push(cyl(leg(a[0], a[1], y0), leg(b[0], b[1], y1), .35, { n: 8, gen: 0 }), cyl(leg(b[0], b[1], y0), leg(a[0], a[1], y1), .35, { n: 8, gen: 0 }));
    J.push(cyl(leg(a[0], a[1], y1), leg(b[0], b[1], y1), .4, { n: 8, gen: 0 }));
  }
  J.push(bx([11.5, -.5, 11], [15, 1.2, 15], fn()));                                        // boat landing
  // decks
  D.push(bx([-14, 13.4, -14], [14, 14.2, 14], { bottom: true, ds: 1.4 }));
  D.push(bx([-15, 19.2, -15], [15, 20, 15], { bottom: true, ds: 1.4 }));
  for (const [sx, sz] of corners) D.push(cyl([sx * 12.2, 14.2, sz * 12.2], [sx * 12.2, 19.2, sz * 12.2], .7, { n: 10, gen: 2 }));
  for (const y of [15.2, 21.1]) D.push(line([[-15, y, -15], [15, y, -15], [15, y, 15], [-15, y, 15], [-15, y, -15]], fn({ w: .5 })));
  // modules on the main deck and the cellar deck
  M.push(bx([-13, 20, -3], [1, 26, 9]));                                                   // process
  M.push(bx([3, 20, -13], [13, 27, -4]));                                                  // compressors
  M.push(bx([-12, 14.2, -12], [0, 18.6, -2], { ds: 1.2 }));                                // separators, cellar
  for (const x of [-9, -5]) M.push(cyl([x, 14.2, 6], [x, 14.2, 12], 1.6, { n: 14, gen: 3, caps: true }));
  M.push(bx([-14, 20, -14], [-2, 29, -5]));                                                // quarters, 3 tiers
  M.push(cyl([-8, 29, -9.5], [-8, 38, -9.5], .12, { n: 5, gen: 0 }), line([[-9.5, 36.5, -9.5], [-6.5, 36.5, -9.5]], fn({ w: .6 })));
  M.push(cyl([6, 27, -8], [6, 33, -8], .6, { n: 10, gen: 2 }));                             // exhaust stack
  // helideck over the quarters' corner
  const hc = [-11, 30.5, -11];
  H.push(lathe([hc[0], hc[1] - .6, hc[2]], FY, [[0, 11], [.6, 11]], { n: 8, gen: 8, caps: true, ds: 1.3 }));
  H.push(hoop([hc[0], hc[1] + .9, hc[2]], 11.6, 24, fn({ w: .5 })));
  for (const a of [.3, 1.9, 3.5, 5.1]) H.push(cyl([hc[0] + Math.cos(a) * 9, hc[1] - .6, hc[2] + Math.sin(a) * 9], [-8 + Math.cos(a) * 3, 29, -9.5 + Math.sin(a) * 3], .25, { n: 6, gen: 0 }));
  H.push(line([[hc[0] - 2.5, hc[1] + .05, hc[2] - 3], [hc[0] - 2.5, hc[1] + .05, hc[2] + 3]], fn({ w: .7 })), line([[hc[0] + 2.5, hc[1] + .05, hc[2] - 3], [hc[0] + 2.5, hc[1] + .05, hc[2] + 3]], fn({ w: .7 })), line([[hc[0] - 2.5, hc[1] + .05, hc[2]], [hc[0] + 2.5, hc[1] + .05, hc[2]]], fn({ w: .7 })));
  // pedestal crane
  C.push(cyl([10, 20, 8], [10, 30, 8], 1.3, { n: 14, gen: 4, caps: true }));
  C.push(bx([8, 30, 6], [12.5, 33, 10.5]));
  C.push(beam([10, 31, 10], [-6, 43, 24], 1, 1));
  C.push(line([[-6, 43, 24], [-6, 26, 24]], fn({ w: .5 })));
  // flare boom: a triangular lattice from the deck corner, the flare tip at its end
  const b0 = [13.5, 20, 13.5], tip = PLAT.FLARE, ax = V.norm(V.sub(tip, b0));
  const side = V.norm(V.cross(ax, FY)), up = V.norm(V.cross(side, ax));
  const tri = (p, w) => [V.add(p, V.mul(up, w)), V.add(p, V.add(V.mul(side, w * .87), V.mul(up, -w * .5))), V.add(p, V.add(V.mul(side, -w * .87), V.mul(up, -w * .5)))];
  const T0 = tri(b0, 1.6), T1 = tri(tip, .6);
  for (let k = 0; k < 3; k++) F.push(line([T0[k], T1[k]], { w: .9 }));
  for (let i = 0; i < 12; i++) { const u0 = i / 12, u1 = (i + 1) / 12; for (let k = 0; k < 3; k++) F.push(line([V.lerp(T0[k], T1[k], u0), V.lerp(T0[(k + 1) % 3], T1[(k + 1) % 3], u1)], fn({ w: .5 }))); }
  F.push(cyl(tip, V.add(tip, [0, 3, 0]), .45, { n: 10, gen: 2, caps: true }));
  return {
    name: 'lm_platform', FLARE: V.add(tip, [0, 3.2, 0]), HELI: hc,
    parts: [
      { name: 'jacket', label: 'Jacket · 4 legs · battered 1:8', prims: J },
      { name: 'decks', label: 'Cellar deck +14 m · main deck +20 m · 30 × 30 m', prims: D },
      { name: 'modules', label: 'Process · compression · quarters', prims: M },
      { name: 'helideck', label: 'Helideck · Ø 22 m', prims: H },
      { name: 'crane', label: 'Pedestal crane · 25 t', prims: C },
      { name: 'flare', label: 'Flare boom · 45 m', prims: F },
    ],
  };
}
/* unmanned wellhead platform: a tripod, a 12 m deck at +14 m, the wellheads, a small crane, a light */
function wellhead() {
  const P = [], W = [];
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; P.push(cyl([Math.cos(a) * 7, -6, Math.sin(a) * 7], [Math.cos(a) * 4.5, 14, Math.sin(a) * 4.5], .6, { n: 12, gen: 3 })); }
  P.push(cyl([0, -6, 0], [0, 14, 0], 1.1, { n: 14, gen: 3 }));
  P.push(bx([-6, 13.4, -6], [6, 14.2, 6], { bottom: true }));
  for (const [x, z] of [[-2.5, -2], [0, -2], [2.5, -2]]) W.push(cyl([x, 14.2, z], [x, 16.4, z], .35, { n: 8, gen: 2, caps: true }));
  W.push(bx([1, 14.2, 1.5], [5, 17.2, 5]));
  W.push(cyl([-4.5, 14.2, 4], [-4.5, 21, 4], .5, { n: 8, gen: 2 }), beam([-4.5, 20.5, 4], [4, 24, 4], .5, .5));
  W.push(cyl([4.8, 17.2, 4.8], [4.8, 22, 4.8], .1, { n: 5, gen: 0 }));
  return { name: 'lm_wellhead', LAMP: [4.8, 22.4, 4.8], parts: [
    { name: 'tripod', label: 'Wellhead platform · tripod · deck +14 m', prims: P },
    { name: 'topside', label: 'Wellheads · crane · navigation light', prims: W },
  ] };
}

/* ================================================================ wrecks
   A coaster broken in two on a reef: the bow reared up and heeled, the stern with its bridge listing the other
   way and deeper; plates gone. A trawler on its side. Origin on the waterline; the sea hides what is under. */
function holes(prims, frac, seed) { const r = rng(seed); return prims.filter(pr => pr.t !== 'hex' || r() > frac); }
function wreckCargo() {
  const L = 88, B = 13.5, F = 4.6, H = hull(L, B, F, { bow: .5, transom: .84, sheerF: 2 });
  const dk = z => H.at(z).y;
  const S = [];
  S.push(bx([-6, dk(-32), -40], [6, dk(-32) + 2.6, -29]), bx([-5.5, dk(-32) + 2.6, -39.5], [5.5, dk(-32) + 5.2, -30]), bx([-5, dk(-32) + 5.2, -38.5], [5, dk(-32) + 7.6, -31]));
  S.push(taper(0, -41.5, 1.4, 1.8, dk(-40) + 2, 1.2, 1.5, dk(-40) + 11));
  S.push(beam([0, dk(-20), -20], [2.5, dk(-20) + 13, -24], .35, .35));                  // the mainmast, bent aft
  for (const zc of [-12, 14]) S.push(bx([-5, dk(zc), zc - 8], [5, dk(zc) + 1.2, zc + 8], { ds: 1.4 }));
  const bow = holes(H.P.filter(pr => primCentre(pr)[2] > 2), .14, 5).concat(S.filter(pr => primCentre(pr)[2] > 2));
  const stern = holes(H.P.filter(pr => primCentre(pr)[2] < -3), .12, 6).concat(S.filter(pr => primCentre(pr)[2] < -3));
  const Tb = X.mul(X.make(R.mul(R.z(.3), R.x(-.16)), [1.5, -2.4, 3]), T3([0, 0, 0]));
  const Ts = X.make(R.mul(R.y(.2), R.mul(R.z(-.44), R.x(.05))), [-3, -3.6, -7]);
  return { name: 'lm_wreck_cargo', parts: [
    { name: 'bow', label: 'Wreck · coaster · 88 m · bow section', prims: tps(Tb, bow) },
    { name: 'stern', label: 'Wreck · stern section · bridge · funnel', prims: tps(Ts, stern) },
  ] };
}
function wreckTrawler() {
  const m = trawler(), T = X.make(R.mul(R.y(.3), R.mul(R.z(1.15), R.x(.12))), [0, -3.2, 0]);
  return { name: 'lm_wreck_trawler', parts: m.parts.map(p => ({ name: p.name, label: 'Wreck · trawler · 54 m · on her side · ' + p.label.split(' · ')[0].toLowerCase(), prims: tps(T, holes(p.prims, .15, p.name.length)) })) };
}

/* ================================================================ stations
   Weather station on a skerry summit: the radar tower with its radome, the station house, the instrument
   enclosure (screens, rain gauge, 10 m wind mast), a guyed radio mast. */
function weatherStation() {
  const RT = [], BU = [], MS = [], RM = [];
  RT.push(lathe([0, -1, 0], FY, [[0, 3], [19.5, 2.6]], { n: 22, gen: 6, rings: [0, 1] }));
  RT.push(lathe([0, 18.5, 0], FY, [[0, 4.6], [.6, 4.6]], { n: 24, gen: 0, caps: true }));
  RT.push(hoop([0, 20.2, 0], 4.5, 24, fn({ w: .5 })));
  RT.push(sphereAt([0, 23.2, 0], 3.3, { n: 26, gen: 8 }));
  BU.push(ybox(12, 0, 0, 5, 10, -1, 4.2), ybox(12, 0, 0, 5.2, 10.2, 4.2, 4.6, fn()));
  BU.push(...house(12, -18, 0, 7, 9, 0, 3, 5.6, { chimney: true }));
  // instrument enclosure 26 x 26 m with a fence
  const ex = -22, ez = 0;
  MS.push(line([[ex - 13, 1.2, ez - 13], [ex + 13, 1.2, ez - 13], [ex + 13, 1.2, ez + 13], [ex - 13, 1.2, ez + 13], [ex - 13, 1.2, ez - 13]], { w: .5 }));
  for (const [x, z] of [[-6, -6], [-6, 0], [-6, 6]]) { MS.push(bx([ex + x - .5, 1.3, ez + z - .5], [ex + x + .5, 2.4, ez + z + .5])); for (const q of [[-.4, -.4], [.4, .4], [-.4, .4], [.4, -.4]]) MS.push(line([[ex + x + q[0], 0, ez + z + q[1]], [ex + x + q[0], 1.3, ez + z + q[1]]], fn({ w: .5 }))); }
  MS.push(cyl([ex + 5, 0, ez - 5], [ex + 5, 1.1, ez - 5], .2, { n: 10, gen: 2, caps: true }));
  MS.push(cyl([ex + 6, 0, ez + 6], [ex + 6, 10, ez + 6], .08, { n: 5, gen: 0 }), line([[ex + 5, 10, ez + 6], [ex + 7, 10, ez + 6]], { w: .6 }), line([[ex + 6, 10.3, ez + 5.4], [ex + 6, 10.3, ez + 6.8]], fn({ w: .6 })));
  // guyed radio mast, 36 m
  const mp = [8, 0, 22];
  RM.push(cyl(mp, V.add(mp, [0, 36, 0]), .25, { n: 6, gen: 0 }));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .4; for (const gy of [18, 34]) RM.push(line(catenary(V.add(mp, [0, gy, 0]), V.add(mp, [Math.cos(a) * 20, 0, Math.sin(a) * 20]), .4, 10), fn({ w: .5 }))); }
  return { name: 'lm_weather', LAMP: [8, 36.4, 22], parts: [
    { name: 'radar', label: 'Weather radar · DMRL-C · radome Ø 6.6 m · 26 m', prims: RT },
    { name: 'house', label: 'Station house · staff house', prims: BU },
    { name: 'site', label: 'Instrument enclosure · screens · rain gauge · wind mast 10 m', prims: MS },
    { name: 'mast', label: 'Radio mast · guyed · 36 m', prims: RM },
  ] };
}
/* volcano observatory on the caldera rim: laboratory with a dome, seismic vault, guyed mast with a dish, a
   solar array, a gas-sampling post, two staff houses */
function observatory() {
  const B = [], D = [], MS = [], SO = [];
  B.push(ybox(0, 0, 0, 12, 6, -1.2, 7), ybox(0, 0, 0, 12.3, 6.3, 7, 7.5, fn()));
  B.push(ybox(-6, 0, 0, 2.5, 2.5, 7.5, 8.6));
  D.push(dome([-6, 8.6, 0], 2.6, { n: 24, gen: 8 }));
  D.push(line([[-6 - 2.5, 9.8, -.3], [-6 + 2.5, 11, -.3]], fn({ w: .6 })));
  B.push(ybox(22, -6, .3, 3, 2, -1.2, 1.4));                                                  // seismic vault
  B.push(...house(-20, 14, .2, 7, 10, 0, 3, 5.5, { chimney: true }), ...house(-8, 18, .2, 7, 10, 0, 3, 5.5, { chimney: true }));
  const mp = [10, 0, 14];
  MS.push(...lattice([[-.6, 0, -.6], [.6, 0, -.6], [.6, 0, .6], [-.6, 0, .6]].map(p => V.add(mp, p)), [[-.4, 30, -.4], [.4, 30, -.4], [.4, 30, .4], [-.4, 30, .4]].map(p => V.add(mp, p)), 12, { w: .5, r: .06 }));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 1; MS.push(line(catenary(V.add(mp, [0, 28, 0]), V.add(mp, [Math.cos(a) * 18, 0, Math.sin(a) * 18]), .3, 10), fn({ w: .5 }))); }
  const dp = V.add(mp, [0, 22, 0]), dax = V.norm([-1, .35, .2]), dd = []; for (let k = 0; k <= 5; k++) { const rr = 1.2 * k / 5; dd.push([rr * rr / 3, rr]); }
  MS.push(lathe(V.add(dp, V.mul(dax, .8)), dax, dd, { n: 20, gen: 6 }));
  for (let k = 0; k < 3; k++) { const z = -14 - k * 4; SO.push(sheet([[-12, .6, z], [2, .6, z], [2, 2.2, z + 1.8], [-12, 2.2, z + 1.8]], [0, .8, .5], { ds: 1.3 })); SO.push(line([[-12, 0, z + .3], [-12, .8, z + .3]], fn({ w: .5 })), line([[2, 0, z + .3], [2, .8, z + .3]], fn({ w: .5 }))); }
  SO.push(cyl([24, 0, 10], [24, 3, 10], .08, { n: 5, gen: 0 }), bx([23.6, 2.2, 9.6], [24.4, 3, 10.4]));
  return { name: 'lm_observatory', parts: [
    { name: 'lab', label: 'Volcano observatory · laboratory · 24 × 12 m', prims: B },
    { name: 'dome', label: 'Camera dome · Ø 5.2 m', prims: D },
    { name: 'mast', label: 'Telemetry mast · 30 m · dish Ø 2.4 m', prims: MS },
    { name: 'solar', label: 'Solar array · gas-sampling post', prims: SO },
  ] };
}

/* ================================================================ harbour pieces
   Ferry berth: the linkspan (22 x 9 m) hinged at the shore and lowered to the ferry's deck, its lifting gantry,
   two mooring dolphins, the waiting room. Origin at the hinge on the shore, +Z out over the water. */
function ferrySlip() {
  const P = [], G = [], T = [];
  P.push(hex([[-4.5, 1.2, 0], [4.5, 1.2, 0], [4.5, 2.4, 22], [-4.5, 2.4, 22], [-4.5, 2, 0], [4.5, 2, 0], [4.5, 3.2, 22], [-4.5, 3.2, 22]], { bottom: true }));
  for (const sx of [-1, 1]) P.push(line([[sx * 4.4, 3.1, 0], [sx * 4.4, 4.3, 22]], fn({ w: .6 })));
  P.push(bx([-7, -2, -12], [7, 2.1, 0], { ds: 1.4 }));
  for (const sx of [-1, 1]) {
    G.push(bx([sx * 6 - .6, -1, 17], [sx * 6 + .6, 14, 18.4]));
    G.push(cyl([sx * 13, -3, 30], [sx * 13, 4, 30], 1.4, { n: 14, gen: 3, caps: true }));
    G.push(line([[sx * 6, 13.6, 17.7], [sx * 4.3, 3.2, 20]], fn({ w: .6 })));
  }
  G.push(bx([-6.6, 13, 17], [6.6, 14.4, 18.4]));
  T.push(...house(-14, -18, 0, 10, 16, 0, 3.4, 5.6, {}));
  T.push(ybox(10, -16, 0, 3, 6, -.5, 2.6), ybox(10, -16, 0, 3.4, 6.4, 2.6, 2.9));
  return { name: 'lm_slip', LAMP: [0, 14.8, 17.7], parts: [
    { name: 'linkspan', label: 'Ferry berth · linkspan 22 × 9 m', prims: P },
    { name: 'gantry', label: 'Lifting gantry · mooring dolphins', prims: G },
    { name: 'terminal', label: 'Waiting room · ticket office', prims: T },
  ] };
}
/* hydro power station on the fjord shore: machine hall, control annex, tailrace into the fjord, transformer yard
   with its gantry. Origin at the machine hall's centre; +Z toward the water. */
function powerhouse() {
  const H = [], TR = [], Y = [];
  H.push(ybox(0, 0, 0, 12, 26, -1, 18, { ds: 1.3 }));
  H.push(...house(0, 0, 0, 24.6, 52.6, 17.9, .1, 3.2, { ov: .3, found: .1 }));
  H.push(ybox(-18, -14, 0, 6, 10, -1, 9));
  for (let k = -2; k <= 2; k++) H.push(line([[12.05, 3, k * 10], [12.05, 15, k * 10]], fn({ w: .5 })));
  // tailrace: the outlet under the hall's seaward wall, short training walls sloping down into the ground
  for (const sx of [-1, 1]) TR.push(hex([[sx * 7 - .6, -6, 26], [sx * 7 + .6, -6, 26], [sx * 7 + .6, -6, 40], [sx * 7 - .6, -6, 40], [sx * 7 - .6, 1.5, 26], [sx * 7 + .6, 1.5, 26], [sx * 7 + .6, -4, 40], [sx * 7 - .6, -4, 40]]));
  TR.push(ybox(0, 26.5, 0, 7.6, .6, -3, 4));
  // transformer yard: three transformers, the gantry, the fence
  for (let k = 0; k < 3; k++) { const x = 22, z = -18 + k * 12; Y.push(ybox(x, z, 0, 2, 3.2, 0, 4.2)); Y.push(cyl([x, 4.2, z - 2], [x, 7, z - 2], .25, { n: 6, gen: 0 })); }
  for (const z of [-26, 10]) { Y.push(cyl([30, 0, z], [30, 20, z], .35, { n: 6, gen: 0 }), cyl([40, 0, z], [40, 20, z], .35, { n: 6, gen: 0 })); }
  Y.push(beam([30, 19, -26], [30, 19, 10], .5, .6), beam([40, 19, -26], [40, 19, 10], .5, .6));
  Y.push(line([[16, 2, -30], [46, 2, -30], [46, 2, 14], [16, 2, 14], [16, 2, -30]], fn({ w: .5 })));
  return { name: 'lm_powerhouse', GANTRY: [40, 20, -8], parts: [
    { name: 'hall', label: 'Hydro power station · machine hall · 3 × 60 MW', prims: H },
    { name: 'tailrace', label: 'Tailrace', prims: TR },
    { name: 'yard', label: 'Transformer yard · 110 kV gantry', prims: Y },
  ] };
}
/* 110 kV double-circuit steel lattice tower, 32 m: three crossarms a side and the earth-wire peak.
   ARMS: the conductor attachment points (model space). */
const PYLON_ARMS = (() => { const A = []; for (const [y, w] of [[18, 4.2], [23, 5.4], [28, 4.2]]) for (const sx of [-1, 1]) A.push([sx * w, y - 2.4, 0]); return A; })();
function pylonPrims() {
  const P = [];
  const c0 = [[-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]], c1 = [[-1, 30, -1], [1, 30, -1], [1, 30, 1], [-1, 30, 1]];
  P.push(...lattice(c0, c1, 8, { w: .55, r: .1 }));
  for (const [y, w] of [[18, 4.2], [23, 5.4], [28, 4.2]]) { P.push(line([[-w, y, 0], [w, y, 0]], { w: .7 })); P.push(line([[-w, y, 0], [-1.3, y - 1.4, 0], [1.3, y - 1.4, 0], [w, y, 0]], fn({ w: .5 }))); for (const sx of [-1, 1]) P.push(line([[sx * w, y, 0], [sx * w, y - 2.4, 0]], fn({ w: .6 }))); }
  P.push(line([[-1, 30, 0], [0, 33, 0], [1, 30, 0]], { w: .6 }));
  return P;
}

/* ================================================================ parametric pieces
   powerline: spec.towers [[x, z], ...] (world), a 110 kV line: towers turned along the line, 6 conductors and an
   earth wire in catenaries (7-9 m of sag). Origin (spec.x, 0, spec.z). */
BUILDERS.powerline = (spec, ground) => {
  const ox = spec.x, oz = spec.z, Tw = [], Cn = [], P = spec.towers;
  const frames = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + PI / 2;
    return { T: Ty(yaw, [p[0] - ox, ground(p[0], p[1]) - .5, p[1] - oz]) };
  });
  frames.forEach(f => Tw.push(...tps(f.T, pylonPrims())));
  for (let i = 0; i < P.length - 1; i++) {
    const A = frames[i].T, B = frames[i + 1].T, span = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), sag = 7 + span / 120;
    for (const q of PYLON_ARMS) Cn.push(line(catenary(X.ap(A, q), X.ap(B, q), sag, 16), { w: .45, ds: 1.6 }));
    Cn.push(line(catenary(X.ap(A, [0, 33, 0]), X.ap(B, [0, 33, 0]), sag * .8, 16), fn({ w: .4, ds: 2 })));
  }
  return { name: 'powerline', parts: chunkParts(Tw, 700, spec.name || 'Power line · 110 kV · lattice towers 33 m', 't').concat(chunkParts(Cn, 700, 'Conductors · 2 circuits · earth wire', 'w')) };
};
/* penstock: two steel pipes (2.4 m) on saddles down the valley wall, anchor blocks at the bends, the valve house
   at the top and the surge tank beside it. spec.route [[x, z], ...] top -> bottom (world). */
BUILDERS.penstock = (spec, ground) => {
  const ox = spec.x, oz = spec.z, Pp = [], An = [], R_ = spec.route;
  const pt = (x, z, lift) => [x - ox, ground(x, z) + lift, z - oz];
  // resample every 12 m
  const S = [];
  for (let i = 0; i < R_.length - 1; i++) { const a = R_[i], b = R_[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 12)); for (let k = 0; k < n; k++) S.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  S.push(R_[R_.length - 1]);
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1], d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]) || 1, n = [-d[1] / L, d[0] / L];
    for (const sd of [-1.8, 1.8]) Pp.push(cyl(pt(a[0] + n[0] * sd, a[1] + n[1] * sd, 2.2), pt(b[0] + n[0] * sd, b[1] + n[1] * sd, 2.2), 1.2, { n: 14, gen: 4 }));
    if (i % 1 === 0) { const c = pt(a[0], a[1], 0); Pp.push(ybox(c[0], c[2], Math.atan2(d[0], d[1]), 3.2, .6, c[1] - .5, c[1] + 1.1, fn())); }
  }
  for (let i = 1; i < R_.length - 1; i++) { const c = pt(R_[i][0], R_[i][1], 0); An.push(ybox(c[0], c[2], 0, 4.5, 4.5, c[1] - 2, c[1] + 4.5)); }
  const top = R_[0], t = pt(top[0], top[1], 0);
  An.push(...house(t[0], t[2], 0, 10, 14, t[1], 5, 7.5, {}));
  const st = spec.surge || [top[0] + 30, top[1] + 10], sp = pt(st[0], st[1], 0);
  An.push(lathe([sp[0], sp[1] - 1, sp[2]], FY, [[0, 5.2], [23, 5.2], [24, 4.4], [25, 0]], { n: 26, gen: 8, rings: [0, 1, 2] }));
  return { name: 'penstock', parts: chunkParts(Pp, 300, spec.name || 'Penstocks · 2 × Ø 2.4 m', 'p').concat([{ name: 'works', label: 'Valve house · surge tank Ø 10 m · anchor blocks', prims: An }]) };
};
/* the village jetty: a timber pier on piles out along +Z (spec.L m, 4 m wide) with a T head, net racks and a
   fish shed on the shore. Origin at the root of the pier on the shore (spec.x, spec.z), turned by spec.hdg. */
BUILDERS.jetty = (spec, ground) => {
  const L = spec.L || 160, P = [], S = [], sh = Math.sin(spec.hdg), ch = Math.cos(spec.hdg);
  const gl = (s, x) => ground(spec.x + sh * s + ch * x, spec.z + ch * s - sh * x);
  const y = 1.9;
  P.push(bx([-2, y - .3, 0], [2, y, L], { ds: 1.4 }), bx([-11, y - .3, L], [11, y, L + 6], { ds: 1.4 }));
  for (let s = 4; s <= L + 6; s += 5) for (const sx of [-1.8, 1.8]) P.push(cyl([sx, -2.5, s], [sx, y - .3, s], .17, { n: 6, gen: 0 }));
  for (let x = -10; x <= 10; x += 5) P.push(cyl([x, -2.5, L + 5.6], [x, y - .3, L + 5.6], .17, { n: 6, gen: 0 }));
  for (const sx of [-1, 1]) P.push(line([[sx * 2, y + 1, 0], [sx * 2, y + 1, L]], fn({ w: .5 })));
  // on the shore: the fish shed, the net racks
  const g0 = gl(-30, 0);
  S.push(...house(0, -30, 0, 10, 18, g0, 3, 5, { ov: .3 }));
  for (let k = 0; k < 3; k++) {
    const z = -14 - k * 8, xa = -22, xb = -6, ya = gl(z, xa), yb = gl(z, xb);
    for (let x = xa; x <= xb; x += 4) S.push(line([[x, gl(z, x) - .3, z], [x, gl(z, x) + 2.2, z]], { w: .6 }));
    S.push(line([[xa, ya + 2, z], [xb, yb + 2, z]], { w: .5 }), line([[xa, ya + 1.3, z], [xb, yb + 1.3, z]], fn({ w: .4 })));
  }
  return { name: 'jetty', parts: [
    { name: 'pier', label: `Timber jetty · ${Math.round(L)} m · T head 22 m`, prims: P },
    { name: 'shore', label: 'Fish shed · net racks', prims: S },
  ] };
};
/* river port: a quay wall along +X (spec.L m) with portal cranes on rails, warehouses behind. Origin at the
   middle of the quay face at the water level, +Z out over the river; turned by spec.hdg. */
function portalCrane(slew, luff) {
  const P = [], g = 5.25;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(beam([sx * g, .5, sz * 4.5], [sx * (g - 1.2), 10.5, sz * 3], .8, .8));
  P.push(bx([-g + .8, 10, -3.6], [g - .8, 11.4, 3.6]));
  const H = X.make(R.y(slew), [0, 11.4, 0]);
  const loc = [bx([-2.8, 0, -5.5], [2.8, 4.2, 2.5]), bx([-2.2, .3, -7.5], [2.2, 3.2, -5.5]), beam([0, 3, 2], [0, 3 + 26 * Math.sin(luff), 2 + 26 * Math.cos(luff)], 1, 1.1)];
  const tip = [0, 3 + 26 * Math.sin(luff), 2 + 26 * Math.cos(luff)];
  loc.push(line([tip, [tip[0], tip[1] - 16, tip[2]]], fn({ w: .5 })));
  P.push(...tps(H, loc));
  return P;
}
BUILDERS.quay = (spec, ground) => {
  const L = spec.L || 420, Q = [], C = [], W = [], r = rng(spec.seed || 3), sh = Math.sin(spec.hdg), ch = Math.cos(spec.hdg);
  const gl = (x, z) => ground(spec.x + ch * x + sh * z, spec.z - sh * x + ch * z);
  const dk = 3.2;
  Q.push(bx([-L / 2, -2.5, -34], [L / 2, dk, 0], { skip: [2], ds: 1.4 }));
  for (let x = -L / 2 + 8; x < L / 2; x += 14) Q.push(bx([x - .5, -1.2, 0], [x + .5, dk - .2, .5], fn()));
  for (const z of [-4, -14.5]) Q.push(line([[-L / 2 + 3, dk + .05, z], [L / 2 - 3, dk + .05, z]], { w: .6 }));
  const n = Math.max(3, Math.round(L / 80));
  for (let k = 0; k < n; k++) { const x = -L / 2 + L * (k + .5) / n; C.push(...tps(T3([x, dk, -9.2]), portalCrane(-PI / 2 + (r() - .5) * 1.6, .45 + r() * .5))); }
  for (let k = 0; k < 2; k++) { const x = -L / 4 + k * L / 2; W.push(...house(x, -52, PI / 2, 22, Math.min(90, L * .4), Math.max(dk, gl(x, -52)), 8, 10.5, { ov: .4 })); }
  return { name: 'quay', parts: [
    { name: 'quay', label: `River quay · ${Math.round(L)} m · crane rails`, prims: Q },
    { name: 'cranes', label: `Portal cranes · ${n} × 16 t · jib 26 m`, prims: C },
    { name: 'sheds', label: 'Warehouses', prims: W },
  ] };
};
/* reed beds on the delta's banks: stems 1.8-3.2 m with their plumes bowed downwind, in patches along the shore.
   spec.patches [{ x, z, len, wid, ang (along the shore), seed }], spec.wind [dx, dz]; stems only where the map is
   shallower than 0.6 m or dry and lower than 2.5 m (spec.h is the map's height function). */
BUILDERS.reeds = (spec, ground) => {
  const out = [], W = spec.wind || [1, 0], wl = Math.hypot(W[0], W[1]) || 1, wx = W[0] / wl, wz = W[1] / wl;
  spec.patches.forEach((pt, pi) => {
    const r = rng(pt.seed || pi + 1), P = [], sa = Math.sin(pt.ang), ca = Math.cos(pt.ang);
    const n = Math.round(pt.len * pt.wid / 2.2);
    for (let k = 0; k < n; k++) {
      const u = (r() - .5) * pt.len, v = (r() - .5) * pt.wid * (1 - .5 * Math.pow(Math.abs(2 * u / pt.len), 3));
      const x = pt.x + sa * u + ca * v, z = pt.z + ca * u - sa * v, mh = spec.h ? spec.h(x, z) : 0;
      if (mh < -.6 || mh > 2.5) continue;
      const y = Math.max(0, ground(x, z)) - .2, H = 1.8 + r() * 1.4, bow = .2 + r() * .35;
      const lx = x - spec.x, lz = z - spec.z;
      P.push(line([[lx, y, lz], [lx + wx * bow * .3, y + H * .6, lz + wz * bow * .3], [lx + wx * bow, y + H, lz + wz * bow]], { w: .7, ds: 1.4 }));
    }
    if (P.length) out.push({ name: 'reeds' + pi, label: `Reed bed · Phragmites · ${Math.round(pt.len)} × ${Math.round(pt.wid)} m`, prims: P });
  });
  return { name: 'reeds', parts: out };
};
/* sea stacks: layered basalt columns standing in the sea off the cliffs. spec.stacks [{ x, z, h, r, seed }] */
BUILDERS.stacks = (spec) => {
  const out = [];
  for (const s of spec.stacks) {
    const r = rng(s.seed || 1), P = [], cx = s.x - spec.x, cz = s.z - spec.z;
    let y = -4, rad = s.r, ox = 0, oz = 0;
    const ring = (rr, a0) => { const q = []; for (let k = 0; k < 7; k++) { const a = a0 + k / 7 * TAU, j = .75 + r() * .5; q.push([Math.cos(a) * rr * j, Math.sin(a) * rr * j]); } return q; };
    let prev = ring(rad, r() * TAU);
    while (y < s.h) {
      const th = 2.5 + r() * 3.5, y1 = Math.min(s.h, y + th), shrink = y1 > s.h * .6 ? .82 + r() * .12 : .95 + r() * .07;
      const next = prev.map(p => [p[0] * shrink + (r() - .5) * .8, p[1] * shrink + (r() - .5) * .8]);
      ox += (r() - .5) * .8; oz += (r() - .5) * .8;
      for (let k = 0; k < 7; k++) {
        const a = prev[k], b = prev[(k + 1) % 7], c = next[(k + 1) % 7], d = next[k];
        P.push(sheet([[cx + a[0], y, cz + a[1]], [cx + b[0], y, cz + b[1]], [cx + c[0] + ox, y1, cz + c[1] + oz], [cx + d[0] + ox, y1, cz + d[1] + oz]], [a[0] + b[0], 0, a[1] + b[1]]));
      }
      // the ledge of each lava layer
      P.push(line(next.concat([next[0]]).map(p => [cx + p[0] + ox, y1, cz + p[1] + oz]), fn({ w: .5 })));
      prev = next; y = y1;
    }
    const top = prev.map(p => [cx + p[0] + ox, y, cz + p[1] + oz]);
    P.push(sheet([top[0], top[2], top[4], top[5]], FY));
    for (let k = 0; k < 6; k++) { const a = r() * TAU, d = s.r * (1 + r() * .6); P.push(sphereAt([cx + Math.cos(a) * d, -.4 + r() * .6, cz + Math.sin(a) * d], 1 + r() * 1.6, { n: 10, gen: 0 })); }
    out.push({ name: 'stack' + out.length, label: `Sea stack · basalt · ${Math.round(s.h)} m`, prims: P });
  }
  return { name: 'stacks', parts: out };
};

/* a mud volcano's gryphon: a 3 m cone of dried mud with its crater, a tongue of fresh mud down one side */
function gryphon() {
  const P = [];
  P.push(lathe([0, -.4, 0], FY, [[0, 5.5], [.8, 4], [2.2, 1.6], [3.1, .75], [3.2, .55]], { n: 22, gen: 6, rings: [1, 3] }));
  P.push(lathe([0, 2.3, 0], FY, [[0, .55], [.5, .3], [.9, .01]], { n: 14, gen: 0, pts: true }));
  P.push(sheet([[.4, 2.8, .5], [-.4, 2.8, .5], [-1.6, .1, 6.5], [1.8, .1, 6.8]], [0, 1, .4]));
  P.push(sheet([[-1.6, .1, 6.5], [1.8, .1, 6.8], [2.6, 0, 10], [-2.4, 0, 9.5]], FY, { ds: 1.3 }));
  return { name: 'lm_gryphon', parts: [{ name: 'gryphon', label: 'Mud volcano · gryphon · 3 m · fresh mud flow', prims: P }] };
}

/* a mountain road: a sparse strip of returns lifted off the ground, the white edge lines, marker posts every
   30 m (the black-and-white posts of a Russian mountain road), a crash barrier on the outside of the hairpins.
   spec.pts [[x, z], ...] world, resampled every ~10 m; spec.width. */
BUILDERS.road = (spec, ground) => {
  const P = spec.pts, W = spec.width || 6, ox = spec.x, oz = spec.z, S = [], E = [], M = [];
  const y = (x, z) => Math.max(0, ground(x, z)) + .12;
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * W / 2, nz = (b[0] - a[0]) / L * W / 2;
    const q = (p, s) => [p[0] + nx * s - ox, y(p[0] + nx * s, p[1] + nz * s), p[1] + nz * s - oz];
    S.push(sheet([q(a, -1), q(a, 1), q(b, 1), q(b, -1)], FY, { ds: 2.2, th: .02 }));
    for (const s of [-1, 1]) E.push(line([q(a, s * .92), q(b, s * .92)], { w: .6 }));
    acc += L;
    if (acc >= 30) {
      acc = 0;
      for (const s of [-1, 1]) { const p = q(b, s * 1.25); M.push(line([p, [p[0], p[1] + 1.1, p[2]]], fn({ w: .8 }))); }
    }
    // the outside of a tight bend: a crash barrier
    if (i > 0) {
      const c = P[i - 1], t1 = Math.atan2(a[0] - c[0], a[1] - c[1]), t2 = Math.atan2(b[0] - a[0], b[1] - a[1]), turn = Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1));
      if (Math.abs(turn) > .12) { const s = turn > 0 ? -1 : 1; M.push(line([q(a, s * 1.35), q(b, s * 1.35)].map(p => [p[0], p[1] + .75, p[2]]), { w: .7 })); }
    }
  }
  return { name: 'road', parts: chunkParts(S.concat(E), 600, spec.name || 'Road', 'r').concat(chunkParts(M, 600, 'Marker posts · crash barriers', 'm')) };
};
/* a gas pipeline above ground: a 1.2 m pipe on concrete sleepers every 12 m, following the ground; expansion
   loops every 600 m. spec.route [[x, z], ...] world. */
BUILDERS.pipeline = (spec, ground) => {
  const R_ = spec.route, ox = spec.x, oz = spec.z, P = [];
  const S = [];
  for (let i = 0; i < R_.length - 1; i++) { const a = R_[i], b = R_[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 12)); for (let k = 0; k < n; k++) S.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  S.push(R_[R_.length - 1]);
  const at = p => [p[0] - ox, Math.max(0, ground(p[0], p[1])) + 1.4, p[1] - oz];
  let acc = 0;
  for (let i = 0; i < S.length - 1; i++) {
    const a = at(S[i]), b = at(S[i + 1]);
    P.push(cyl(a, b, .6, { n: 12, gen: 3 }));
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    P.push(ybox(a[0], a[2], yaw, 1.2, .35, a[1] - 2, a[1] - .55, fn()));
    acc += 12;
    if (acc >= 600 && i < S.length - 3) {
      acc = 0;
      const d = V.norm(V.sub(b, a)), n = [d[2], 0, -d[0]], c = V.add(a, V.mul(d, 6));
      P.push(line([a, V.add(a, V.mul(n, 14)), V.add(V.add(a, V.mul(n, 14)), V.mul(d, 12)), V.add(a, V.mul(d, 12))], { w: 1 }));
      void c;
    }
  }
  return { name: 'pipeline', parts: chunkParts(P, 500, spec.name || 'Gas pipeline · Ø 1.2 m', 'p') };
};
/* the onshore gas terminal: slug catchers, separators and compressors, four condensate tanks (Ø 30 m), the
   ground flare on its lattice stack (the pilot always burning), the control building, the fence. Origin at the
   centre; the pipeline arrives along -Z. */
const TERM = { FLARE: [-95, 62, -70] };
function gasTerminal() {
  const T = [], U = [], F = [], B = [];
  for (const [x, z] of [[40, 30], [85, 30], [40, 75], [85, 75]]) {
    T.push(lathe([x, -.5, z], FY, [[0, 15.5], [15.5, 15.5], [16, 15], [17.2, 8], [17.6, 0]], { n: 44, gen: 10, rings: [1, 2, 3], ds: 1.2 }));
    T.push(line([[x + 15.5, 0, z], [x + 15.5, 15.5, z], [x + 8, 17.3, z]], fn({ w: .6 })));
    T.push(hoop([x, 16.2, z], 15.6, 40, fn({ w: .5 })));
  }
  for (const [x, z] of [[40, 52.5], [85, 52.5]]) T.push(line([[x - 18, 1, z], [x + 18, 1, z]], fn({ w: .5 })));
  // process area: slug catcher fingers, separators, compressor house, columns, pipe rack
  for (let k = 0; k < 6; k++) U.push(cyl([-70 + k * 3, 1.2, -60], [-70 + k * 3, 1.2, -10], .7, { n: 10, gen: 2 }));
  for (const [x, z] of [[-30, -40], [-22, -40], [-14, -40]]) U.push(cyl([x, 1, z - 9], [x, 1, z + 9], 1.8, { n: 14, gen: 4, caps: true }));
  U.push(ybox(-20, -5, 0, 14, 9, -.5, 11), ybox(-20, -5, 0, 14.3, 9.3, 11, 11.4, fn()));
  for (const [x, z, h] of [[5, -40, 32], [12, -40, 26], [5, -30, 22]]) U.push(cyl([x, 0, z], [x, h, z], 1.6, { n: 14, gen: 4, caps: true }), hoop([x, h * .5, z], 2.2, 16, fn({ w: .5 })), hoop([x, h * .85, z], 2.2, 16, fn({ w: .5 })));
  for (let x = -60; x < 20; x += 6) U.push(bx([x - .2, 0, -22.2], [x + .2, 6, -21.8], fn()));
  for (const y of [5, 6]) U.push(line([[-60, y, -22], [20, y, -22]], { w: .7 }));
  // flare stack: a 60 m three-legged lattice, the tip
  const fb = [TERM.FLARE[0], 0, TERM.FLARE[2]];
  const leg = (k, y) => { const a = k / 3 * TAU, w = mix(5, 1.2, y / 60); return [fb[0] + Math.cos(a) * w, y, fb[2] + Math.sin(a) * w]; };
  for (let k = 0; k < 3; k++) F.push(line([leg(k, 0), leg(k, 60)], { w: .9 }));
  for (let y = 0; y < 60; y += 6) for (let k = 0; k < 3; k++) F.push(line([leg(k, y), leg((k + 1) % 3, y + 6)], fn({ w: .5 })));
  F.push(cyl([fb[0], 0, fb[2]], [fb[0], 62, fb[2]], .6, { n: 10, gen: 2 }));
  // buildings, fence
  B.push(...house(60, -60, 0, 18, 30, 0, 7, 9, {}), ybox(95, -40, 0, 8, 12, -.5, 5));
  const fx0 = -110, fx1 = 120, fz0 = -90, fz1 = 110;
  B.push(line([[fx0, 2, fz0], [fx1, 2, fz0], [fx1, 2, fz1], [fx0, 2, fz1], [fx0, 2, fz0]], { w: .5 }));
  return { name: 'lm_terminal', FLARE: [fb[0], 63, fb[2]], parts: [
    { name: 'tanks', label: 'Condensate tanks · 4 × 10 000 m³ · Ø 31 m', prims: T },
    { name: 'process', label: 'Slug catcher · separators · compressor house · columns', prims: U },
    { name: 'flare', label: 'Flare stack · 62 m', prims: F },
    { name: 'site', label: 'Control building · fence · 230 × 200 m', prims: B },
  ] };
}
/* ================================================================ registry of the fixed models */
export const LM_MODELS = {
  lm_cargo: cargoShip, lm_tanker: tanker, lm_trawler: trawler, lm_boat: fishingBoat, lm_ferry: ferry, lm_barge: riverBarge, lm_psv: supplyVessel,
  lm_buoy_can: () => buoy('can'), lm_buoy_cone: () => buoy('cone'), lm_buoy_n: () => buoy('n'), lm_buoy_e: () => buoy('e'),
  lm_buoy_s: () => buoy('s'), lm_buoy_w: () => buoy('w'), lm_buoy_safe: () => buoy('safe'), lm_buoy_danger: () => buoy('danger'),
  lm_skerry_light: skerryLight, lm_cross: pomorCross, lm_cairn: cairn, lm_mast: tvMast, lm_church: church, lm_water_tower: waterTower,
  lm_platform: gasPlatform, lm_wellhead: wellhead, lm_wreck_cargo: wreckCargo, lm_wreck_trawler: wreckTrawler, lm_weather: weatherStation,
  lm_observatory: observatory, lm_slip: ferrySlip, lm_powerhouse: powerhouse, lm_gryphon: gryphon, lm_terminal: gasTerminal,
};
const W_ = 'w', G_ = 'g', R_ = 'r';
export const LM_INFO = {
  lm_cargo: { name: 'General cargo ship · 120 m', size: [120, 17, 26], s: [.12, .3, .8, 2], ship: true,
    lights: [{ p: [0, 20.2, 52], col: W_, arc: 'mast' }, { p: [0, 24, -41], col: W_, arc: 'mast' }, { p: [8.3, 16, -40], col: G_, arc: 'stbd' }, { p: [-8.3, 16, -40], col: R_, arc: 'port' }, { p: [0, 8.5, -59.5], col: W_, arc: 'stern' }] },
  lm_tanker: { name: 'Product tanker · 144 m', size: [144, 23, 28], s: [.14, .35, .9, 2.2], ship: true,
    lights: [{ p: [0, 22, 66], col: W_, arc: 'mast' }, { p: [0, 28, -58], col: W_, arc: 'mast' }, { p: [11.2, 21, -56], col: G_, arc: 'stbd' }, { p: [-11.2, 21, -56], col: R_, arc: 'port' }, { p: [0, 9, -71.5], col: W_, arc: 'stern' }] },
  lm_trawler: { name: 'Stern trawler · 54 m', size: [54, 10.5, 16], s: [.06, .14, .36, .9], ship: true,
    lights: [{ p: [0, 16, 13], col: W_, arc: 'mast' }, { p: [0, 15, 23], col: G_, arc: 'all' }, { p: [0, 13.6, 23], col: W_, arc: 'all' }, { p: [4.6, 8.5, 17], col: G_, arc: 'stbd' }, { p: [-4.6, 8.5, 17], col: R_, arc: 'port' }, { p: [0, 5, -26.5], col: W_, arc: 'stern' }] },
  lm_boat: { name: 'Fishing boat · 12 m', size: [12, 3.9, 6.5], s: [.03, .07, .18, .45], ship: true,
    lights: [{ p: [0, 6.4, 2], col: W_, arc: 'all' }] },
  lm_ferry: { name: 'Ro-ro ferry · 86 m · double-ended', size: [86, 17, 19], s: [.1, .25, .65, 1.6], ship: true,
    lights: [{ p: [0, 18.8, 0], col: W_, arc: 'all' }, { p: [8.4, 11, 0], col: G_, arc: 'stbd' }, { p: [-8.4, 11, 0], col: R_, arc: 'port' }] },
  lm_barge: { name: 'River barge · 80 m', size: [80, 11.4, 3], s: [.1, .25, .65, 1.6], ship: true, lights: [] },
  lm_psv: { name: 'Platform supply vessel · 70 m', size: [70, 16, 19], s: [.08, .2, .5, 1.25], ship: true,
    lights: [{ p: [0, 20.5, 22], col: W_, arc: 'mast' }, { p: [8, 13.8, 18], col: G_, arc: 'stbd' }, { p: [-8, 13.8, 18], col: R_, arc: 'port' }, { p: [0, 6, -34.5], col: W_, arc: 'stern' }] },
  lm_buoy_can: { name: 'Port-hand buoy', size: [2.4, 2.4, 4.3], s: [.035, .08, .2, .5] },
  lm_buoy_cone: { name: 'Starboard-hand buoy', size: [2.4, 2.4, 4.3], s: [.035, .08, .2, .5] },
  lm_buoy_n: { name: 'North cardinal buoy', size: [2.4, 2.4, 5.5], s: [.035, .08, .2, .5] },
  lm_buoy_e: { name: 'East cardinal buoy', size: [2.4, 2.4, 5.5], s: [.035, .08, .2, .5] },
  lm_buoy_s: { name: 'South cardinal buoy', size: [2.4, 2.4, 5.5], s: [.035, .08, .2, .5] },
  lm_buoy_w: { name: 'West cardinal buoy', size: [2.4, 2.4, 5.5], s: [.035, .08, .2, .5] },
  lm_buoy_safe: { name: 'Safe-water buoy', size: [2.4, 2.4, 5], s: [.035, .08, .2, .5] },
  lm_buoy_danger: { name: 'Isolated-danger buoy', size: [2.4, 2.4, 5.5], s: [.035, .08, .2, .5] },
  lm_skerry_light: { name: 'Skerry light · 12 m', size: [6.8, 6.8, 13.2], s: [.04, .1, .25, .6] },
  lm_cross: { name: 'Pomor cross · 8 m', size: [2.6, 2.6, 8.4], s: [.03, .07, .18, .45] },
  lm_cairn: { name: 'Stone cairn', size: [3.6, 3.6, 3.2], s: [.04, .09, .22, .55] },
  lm_mast: { name: 'TV mast · 192 m', size: [220, 220, 192], s: [.12, .3, .8, 2] },
  lm_church: { name: 'Church · 30 m', size: [30, 10, 30], s: [.08, .2, .5, 1.25] },
  lm_water_tower: { name: 'Water tower · 33 m', size: [6.6, 6.6, 33], s: [.05, .12, .3, .75] },
  lm_platform: { name: 'Gas production platform', size: [80, 80, 55], s: [.1, .25, .65, 1.6] },
  lm_wellhead: { name: 'Wellhead platform', size: [16, 16, 30], s: [.06, .15, .38, .95] },
  lm_wreck_cargo: { name: 'Wreck · coaster · 88 m', size: [95, 20, 20], s: [.1, .25, .65, 1.6] },
  lm_wreck_trawler: { name: 'Wreck · trawler · 54 m', size: [56, 16, 14], s: [.06, .14, .36, .9] },
  lm_weather: { name: 'Weather station · radar', size: [70, 50, 37], s: [.07, .17, .45, 1.1] },
  lm_observatory: { name: 'Volcano observatory', size: [60, 40, 31], s: [.07, .17, .45, 1.1] },
  lm_slip: { name: 'Ferry berth', size: [60, 40, 15], s: [.06, .15, .38, .95] },
  lm_powerhouse: { name: 'Hydro power station', size: [90, 60, 22], s: [.12, .3, .75, 1.9] },
  lm_gryphon: { name: 'Mud volcano gryphon', size: [20, 11, 3.2], s: [.04, .1, .25, .6] },
  lm_terminal: { name: 'Gas terminal', size: [230, 200, 63], s: [.2, .5, 1.25, 3.2] },
};

/* ================================================================ parametric builds
   Split a world-anchored build into compact parts so the engine picks a level of detail per part. */
function primCentre(pr) {
  if (pr.p) { let x = 0, y = 0, z = 0; for (const q of pr.p) { x += q[0]; y += q[1]; z += q[2]; } const n = pr.p.length; return [x / n, y / n, z / n]; }
  if (pr.t === 'lathe') { const s = pr.st[pr.st.length >> 1][0]; return V.mad(pr.a, pr.d, s); }
  if (pr.t === 'blades') return pr.c;
  return [0, 0, 0];
}
export function chunkParts(prims, cell, label, name) {
  const B = new Map();
  for (const pr of prims) {
    const c = primCentre(pr), k = Math.floor(c[0] / cell) + ':' + Math.floor(c[2] / cell);
    let b = B.get(k); if (!b) B.set(k, b = []); b.push(pr);
  }
  let i = 0; const out = [];
  for (const [, L] of B) out.push({ name: (name || 'c') + (i++), label: typeof label === 'function' ? label(i) : label, prims: L });
  return out;
}
/* the same prims as a handful of parts (the far model: fewer draw calls) */
export function mergeParts(parts, n) {
  const all = []; for (const p of parts) all.push(...p.prims);
  n = Math.max(1, Math.min(n || 1, all.length));
  const out = [], per = Math.ceil(all.length / n);
  for (let i = 0; i < n; i++) out.push({ name: 'far' + i, label: parts[0] ? parts[0].label : 'far', prims: all.slice(i * per, (i + 1) * per) });
  return out.filter(p => p.prims.length);
}

/* ================================================================ settlements
   S from world/landmarks.js: buildings [{ t: 'h' house | 's' shed | 'f' flats, x, z, yaw, w, d, e (eave), r (ridge) }],
   church, tower; S.base[i] = the ground under building i (the system resolves it once). Origin (S.x, 0, S.z). */
export function settlementBase(S, ground) {
  return S.buildings.map(b => {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    let m = ground(b.x, b.z);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) m = Math.min(m, ground(b.x + c * u * b.w / 2 + s * v * b.d / 2, b.z - s * u * b.w / 2 + c * v * b.d / 2));
    return m;
  });
}
function settlementBuild(S, ground) {
  const base = S.base || settlementBase(S, ground), ox = S.x, oz = S.z, H = [], F = [], out = [];
  S.buildings.forEach((b, i) => {
    const x = b.x - ox, z = b.z - oz, y = base[i];
    if (b.t === 'f') {
      F.push(ybox(x, z, b.yaw, b.w / 2, b.d / 2, y - 1.2, y + b.e, { ribs: { y: b.floors }, ds: 1.25 }));
      F.push(ybox(x, z, b.yaw, b.w / 2 + .15, b.d / 2 + .15, y + b.e, y + b.e + .7, fn({ skip: [0] })));
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      for (let k = 0; k < Math.round(b.d / 16); k++) {
        const lz = -b.d / 2 + 8 + k * 16, lx = -b.w / 2 - 1;
        F.push(ybox(x + c * lx + s * lz, z - s * lx + c * lz, b.yaw, 1, 1.6, y, y + 2.8, fn()));
      }
    } else H.push(...house(x, z, b.yaw, b.w, b.d, y, b.e, b.r, { chimney: b.t === 'h' && (i % 3) !== 0, ov: b.t === 's' ? .25 : .5, found: 1 }));
  });
  out.push(...chunkParts(H, 240, `Houses · ${S.name}`, 'h'));
  if (F.length) out.push(...chunkParts(F, 400, `Blocks of flats · ${S.name} · 5-9 floors`, 'f'));
  if (S.church) {
    const c = S.church, y = Math.min(ground(c.x, c.z), ground(c.x + 6, c.z + 10), ground(c.x - 6, c.z - 10));
    const m = church(), T = Ty(c.yaw, [c.x - ox, y, c.z - oz]);
    out.push({ name: 'church', label: `Church · ${S.name} · 30 m`, prims: m.parts.flatMap(p => tps(T, p.prims)) });
  }
  if (S.tower) {
    const t = S.tower, y = ground(t.x, t.z), m = waterTower(), T = T3([t.x - ox, y, t.z - oz]);
    out.push({ name: 'tower', label: `Water tower · ${S.name} · 33 m`, prims: tps(T, m.parts[0].prims) });
  }
  return { name: 'settlement', parts: out };
}
/* lit windows at night and the street lights: Float32Array [x, y, z, k, nx, nz] world (k: 0..1 a per-window hash,
   n: the wall's outward normal; 0 for a lamp) */
export function settlementLights(S, ground) {
  const base = S.base || settlementBase(S, ground), W = [], r = rng(S.buildings.length * 7919 + (S.x | 0));
  S.buildings.forEach((b, i) => {
    const y = base[i], c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    // [x, y, z, k, nx, nz]: the wall's outward normal, so only the windows facing the lens are drawn
    const put = (lx, ly, lz, nx, nz) => W.push(b.x + c * lx + s * lz, y + ly, b.z - s * lx + c * lz, r(), c * nx + s * nz, -s * nx + c * nz);
    if (b.t === 'f') {
      for (let fl = 0; fl < b.floors; fl++) for (let zz = -b.d / 2 + 2; zz < b.d / 2 - 1; zz += 3.2) for (const sx of [-1, 1]) if (r() < .3) put(sx * (b.w / 2 + .12), 1.6 + fl * 2.8, zz, sx, 0);
    } else if (b.t === 'h') {
      const n = r() < .25 ? 0 : r() < .6 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        if (r() < .6) { const sx = r() < .5 ? -1 : 1; put(sx * (b.w / 2 + .12), 1.6 + (b.e > 5 && r() < .5 ? 2.9 : 0), (r() - .5) * b.d * .6, sx, 0); }
        else { const sz = r() < .5 ? -1 : 1; put((r() - .5) * b.w * .6, 1.6 + (b.e > 5 && r() < .5 ? 2.9 : 0), sz * (b.d / 2 + .12), 0, sz); }
      }
    }
  });
  const L = [];
  for (const p of S.lamps || []) L.push(p[0], ground(p[0], p[1]) + 8, p[1], r(), 0, 0);
  return { windows: new Float32Array(W), lamps: new Float32Array(L) };
}

/* ================================================================ parametric registry */
export function buildLandmark(spec, ground) {
  switch (spec.kind) {
    case 'settlement': return settlementBuild(spec, ground);
    default: {
      const f = BUILDERS[spec.kind];
      if (!f) throw new Error('buildLandmark: unknown kind ' + spec.kind);
      return f(spec, ground);
    }
  }
}
/* ================================================================ bridges
   spec (world/landmarks.js): { x, z (the A end), hdg (A -> B), L, deck: [[s, y], ...] deck top (abs), width,
   piers: [s...], pylons: [{ s, top }], ends: ['abut'|'tunnel', ...], anchorY, name }
   Model frame: origin at A on the sea level, +Z along the bridge, +X to its right; heights absolute. */
function bridgeFrame(spec, ground) {
  const sh = Math.sin(spec.hdg), ch = Math.cos(spec.hdg);
  const gl = (s, x) => ground(spec.x + sh * s + ch * (x || 0), spec.z + ch * s - sh * (x || 0));
  const D = spec.deck;
  const deckY = s => {
    if (s <= D[0][0]) return D[0][1];
    for (let i = 1; i < D.length; i++) if (s <= D[i][0]) { const a = D[i - 1], b = D[i]; return a[1] + (b[1] - a[1]) * (s - a[0]) / ((b[0] - a[0]) || 1); }
    return D[D.length - 1][1];
  };
  return { gl, deckY };
}
/* trapezoidal box girder, top width W, depth Dp, in segments of `step` m from s0 to s1 */
function girder(L, deckY, W, Dp, step, s0, s1) {
  const P = [], b = W * .34;
  for (let s = s0; s < s1 - .01; s += step) {
    const e = Math.min(s1, s + step), y0 = deckY(s), y1 = deckY(e);
    P.push(hex([[-b, y0 - Dp, s], [b, y0 - Dp, s], [b, y1 - Dp, e], [-b, y1 - Dp, e], [-W / 2, y0 - .25, s], [W / 2, y0 - .25, s], [W / 2, y1 - .25, e], [-W / 2, y1 - .25, e]], { skip: [2, 4], bottom: true, ds: 1.35 }));
    for (const sx of [-1, 1]) P.push(line([[sx * (W / 2 - .2), y0 + .9, s], [sx * (W / 2 - .2), y1 + .9, e]], { w: .7 }));
    P.push(line([[0, y0 + .6, s], [0, y1 + .6, e]], fn({ w: .5 })));
  }
  return P;
}
/* a viaduct pier from `base` (the ground; a pile cap in the water) up to the girder's soffit at yTop */
function pierAt(s, yTop, base, W, wet) {
  const P = [], H = yTop - base;
  if (wet) P.push(bx([-W * .42, -3, s - 5.5], [W * .42, 2.2, s + 5.5], { ds: 1.4 }));
  const y0 = wet ? 2.2 : base - 1;
  if (H < 22) {
    for (const sx of [-1, 1]) P.push(cyl([sx * W * .24, y0, s], [sx * W * .24, yTop - 1.8, s], 1.1, { n: 14, gen: 4 }));
    P.push(bx([-W * .38, yTop - 1.8, s - 1.2], [W * .38, yTop - .1, s + 1.2]));
  } else {
    // a tall hollow wall pier, tapering, with a hammerhead cap
    const k = Math.min(1, H / 80);
    P.push(hex([[-3.4 - 1.6 * k, y0, s - 2.4 - k], [3.4 + 1.6 * k, y0, s - 2.4 - k], [3.4 + 1.6 * k, y0, s + 2.4 + k], [-3.4 - 1.6 * k, y0, s + 2.4 + k],
      [-3.2, yTop - 3.5, s - 2.2], [3.2, yTop - 3.5, s - 2.2], [3.2, yTop - 3.5, s + 2.2], [-3.2, yTop - 3.5, s + 2.2]], { skip: [1], ds: 1.2 }));
    P.push(hex([[-3.2, yTop - 3.5, s - 2.2], [3.2, yTop - 3.5, s - 2.2], [3.2, yTop - 3.5, s + 2.2], [-3.2, yTop - 3.5, s + 2.2],
      [-W * .4, yTop - .1, s - 2.2], [W * .4, yTop - .1, s - 2.2], [W * .4, yTop - .1, s + 2.2], [-W * .4, yTop - .1, s + 2.2]], { ds: 1.2 }));
  }
  return P;
}
function lampPosts(s0, s1, deckY, W, every) {
  const P = [];
  for (let s = s0 + every / 2, k = 0; s < s1; s += every, k++) {
    const sx = k & 1 ? 1 : -1, y = deckY(s);
    P.push(line([[sx * (W / 2 - .6), y, s], [sx * (W / 2 - .6), y + 9.5, s], [sx * (W / 2 - 2.2), y + 10, s]], fn({ w: .6 })));
  }
  return P;
}
/* the road on to the bridge: a strip on the ground with its crash barriers, `len` m beyond each end (not at a tunnel) */
function approaches(gl, L, W, len, ends) {
  const P = [];
  for (const [i, sg] of [[0, -1], [1, 1]]) {
    if (ends && ends[i] === 'tunnel') continue;
    const s0 = i ? L : 0;
    for (let d = 0; d < len; d += 12) {
      const a = s0 + sg * d, b = s0 + sg * (d + 12), ya = gl(a, 0) + .25, yb = gl(b, 0) + .25;
      P.push(sheet([[-W / 2 + 1, ya, a], [W / 2 - 1, ya, a], [W / 2 - 1, yb, b], [-W / 2 + 1, yb, b]], FY, { ds: 1.8 }));
      for (const sx of [-1, 1]) P.push(line([[sx * (W / 2 - .6), gl(a, sx * (W / 2)) + .9, a], [sx * (W / 2 - .6), gl(b, sx * (W / 2)) + .9, b]], { w: .6 }));
    }
  }
  return P;
}
/* group prims into parts by station (a level of detail per stretch of a long structure) */
function byStation(groups, seg) {
  const out = [];
  for (const g of groups) {
    const B = new Map();
    for (const pr of g.prims) { const k = Math.floor(primCentre(pr)[2] / seg); let b = B.get(k); if (!b) B.set(k, b = []); b.push(pr); }
    for (const [k, L] of B) out.push({ name: g.name + k, label: g.label, prims: L });
  }
  return out;
}

/* cable-stayed bridge: inverted-Y pylons, two planes of semi-fan stays from the single upper column to the
   deck edges, a box girder, a viaduct of wall piers on the approaches */
BUILDERS.bridge_cs = (spec, ground) => {
  const { gl, deckY } = bridgeFrame(spec, ground), W = spec.width || 28, Dp = 3.4, L = spec.L;
  const DK = girder(L, deckY, W, Dp, 24, 0, L), PI_ = [], PY = [], ST = [];
  for (const s of spec.piers) {
    const g = gl(s, 0), wet = g <= .05, base = wet ? -2 : Math.min(g, gl(s, -W / 3), gl(s, W / 3));
    PI_.push(...pierAt(s, deckY(s) - Dp, base, W, wet));
  }
  spec.pylons.forEach(p => {
    const s = p.s, g = gl(s, 0), wet = g <= .05, base = wet ? 2.5 : g - 1, yd = deckY(s), top = p.top, yj = yd + (top - yd) * .42, xb = W / 2 + 7;
    if (wet) PY.push(bx([-xb - 6, -3, s - 11], [xb + 6, 2.5, s + 11], { ds: 1.5 }));
    for (const sx of [-1, 1]) {
      PY.push(hex([[sx * xb - 3.2, base, s - 4.2], [sx * xb + 3.2, base, s - 4.2], [sx * xb + 3.2, base, s + 4.2], [sx * xb - 3.2, base, s + 4.2],
        [sx * 1.2 - 2.4, yj, s - 3.2], [sx * 1.2 + 2.4, yj, s - 3.2], [sx * 1.2 + 2.4, yj, s + 3.2], [sx * 1.2 - 2.4, yj, s + 3.2]], { skip: [0, 1], ds: 1.1 }));
    }
    PY.push(bx([-xb + 2, yd - Dp - 3.2, s - 3.5], [xb - 2, yd - Dp - .2, s + 3.5]));
    PY.push(hex([[-3.6, yj, s - 3.6], [3.6, yj, s - 3.6], [3.6, yj, s + 3.6], [-3.6, yj, s + 3.6], [-2.6, top, s - 3.1], [2.6, top, s - 3.1], [2.6, top, s + 3.1], [-2.6, top, s + 3.1]], { ds: 1.1 }));
    PY.push(bx([-2.9, top, s - 3.4], [2.9, top + 1.2, s + 3.4], fn()));
    // stays: n a side a plane, anchored down the upper column, landing along the deck edges
    const n = p.n || 18, half = p.half || 300;
    for (const dir of [-1, 1]) for (const sx of [-1, 1]) {
      for (let k = 0; k < n; k++) {
        const u = (k + 1) / n, sd = s + dir * (26 + (half - 34) * u), yA = top - 3 - (n - 1 - k) * ((top - yj - 14) / n);
        ST.push(line([[sx * 1.5, yA, s + dir * 2.4], [sx * (W / 2 - .8), deckY(sd) + .3, sd]], { w: .75, ds: 1.8 }));
      }
    }
  });
  const lamps = lampPosts(0, L, deckY, W, 50).concat(approaches(gl, L, W, 300, spec.ends));
  const name = spec.name || 'Cable-stayed bridge';
  return {
    name: 'bridge_cs',
    parts: byStation([
      { name: 'deck', label: `${name} · box girder · ${W} m wide`, prims: DK.concat(lamps) },
      { name: 'piers', label: 'Approach viaduct · wall piers', prims: PI_ },
      { name: 'pylon', label: `Pylons · inverted Y · ${Math.round(spec.pylons[0].top)} m`, prims: PY },
      { name: 'stays', label: 'Stay cables · 2 planes · semi-fan', prims: ST },
    ], 220),
  };
};

/* suspension bridge: H towers of two hollow legs and three cross beams, two main cables in a parabola, hangers
   every 20 m, a steel box girder; the backstays run to anchor blocks, or into the rock at tunnel portals */
BUILDERS.bridge_susp = (spec, ground) => {
  const { gl, deckY } = bridgeFrame(spec, ground), W = spec.width || 20.5, Dp = 3.2, L = spec.L;
  const DK = girder(L, deckY, W, Dp, 20, 0, L), TW = [], CB = [], HG = [], AN = [];
  const [t0, t1] = spec.pylons.map(p => p.s), top = spec.pylons[0].top, xc = W / 2 + 1.2;
  const sagLow = Math.min(deckY((t0 + t1) / 2) + 3.5, top - (t1 - t0) / 9.5);
  for (const p of spec.pylons) {
    const s = p.s, g = gl(s, 0), wet = g <= .05, base = wet ? -1 : Math.min(gl(s, -xc), gl(s, xc)) - 2, yd = deckY(s);
    if (wet) TW.push(bx([-xc - 6, -3, s - 7], [xc + 6, 2, s + 7], { ds: 1.5 }));
    for (const sx of [-1, 1]) TW.push(hex([[sx * (xc + 1) - 3.3, base, s - 3.4], [sx * (xc + 1) + 3.3, base, s - 3.4], [sx * (xc + 1) + 3.3, base, s + 3.4], [sx * (xc + 1) - 3.3, base, s + 3.4],
      [sx * xc - 2.3, p.top, s - 2.6], [sx * xc + 2.3, p.top, s - 2.6], [sx * xc + 2.3, p.top, s + 2.6], [sx * xc - 2.3, p.top, s + 2.6]], { skip: [0], ds: 1.1 }));
    for (const y of [yd - Dp - 2.2, (yd + p.top) / 2, p.top - 3]) TW.push(bx([-xc + 1.5, y - 2, s - 2.2], [xc - 1.5, y + 2, s + 2.2]));
    TW.push(bx([-xc - 2.8, p.top, s - 3], [xc + 2.8, p.top + 1.4, s + 3], fn()));
  }
  const cab = s => {
    if (s >= t0 && s <= t1) { const u = (s - (t0 + t1) / 2) / ((t1 - t0) / 2); return sagLow + (top - sagLow) * u * u; }
    const sa = s < t0 ? 0 : L, ya = s < t0 ? spec.anchorY[0] : spec.anchorY[1], sb = s < t0 ? t0 : t1, u = (s - sa) / (sb - sa);
    return ya + (top - ya) * u - 6 * u * (1 - u);
  };
  for (const sx of [-1, 1]) {
    const pts = []; for (let s = 0; s <= L; s += 8) pts.push([sx * xc, cab(s), s]);
    CB.push(line(pts, { w: 1 }));
    CB.push(line(pts.map(p => [p[0] + sx * .35, p[1] - .3, p[2]]), fn({ w: .8 })));
  }
  for (let s = t0 + 20; s < t1 - 5; s += 20) for (const sx of [-1, 1]) HG.push(line([[sx * xc, cab(s), s], [sx * xc, deckY(s) + .2, s]], { w: .55 }));
  spec.ends.forEach((e, i) => {
    const s = i ? L : 0, y = deckY(s), d = i ? 1 : -1;
    if (e === 'tunnel') {
      AN.push(hex([[-W / 2 - 3, y - 2, s], [W / 2 + 3, y - 2, s], [W / 2 + 3, y - 2, s + d * 14], [-W / 2 - 3, y - 2, s + d * 14], [-W / 2 - 3, y + 9, s], [W / 2 + 3, y + 9, s], [W / 2 + 3, y + 9, s + d * 14], [-W / 2 - 3, y + 9, s + d * 14]], { ds: 1.3 }));
      AN.push(sheet([[-W / 2 + 1, y, s + d * .1], [W / 2 - 1, y, s + d * .1], [W / 2 - 1, y + 7, s + d * .1], [-W / 2 + 1, y + 7, s + d * .1]], [0, 0, -d], { ds: 3 }));
    } else AN.push(bx([-W / 2 - 4, gl(s, 0) - 4, s - (i ? 30 : 0)], [W / 2 + 4, spec.anchorY[i] + 3, s + (i ? 0 : 30)], { ds: 1.4 }));
  });
  const lamps = lampPosts(0, L, deckY, W, 40).concat(approaches(gl, L, W, 260, spec.ends));
  const name = spec.name || 'Suspension bridge';
  return {
    name: 'bridge_susp',
    parts: byStation([
      { name: 'deck', label: `${name} · steel box girder · ${W} m wide`, prims: DK.concat(lamps) },
      { name: 'tower', label: `Towers · concrete H · ${Math.round(top)} m`, prims: TW },
      { name: 'cable', label: 'Main cables · 2 · sag 1:10', prims: CB },
      { name: 'hanger', label: 'Hangers · every 20 m', prims: HG },
      { name: 'anchor', label: spec.ends.includes('tunnel') ? 'Tunnel portals · rock anchorages' : 'Anchor blocks', prims: AN },
    ], 200),
  };
};

/* road bridge over a balka: prestressed beams on two-column piers every 36 m, abutments */
BUILDERS.bridge_beam = (spec, ground) => {
  const { gl, deckY } = bridgeFrame(spec, ground), W = spec.width || 12, Dp = 2.2, L = spec.L;
  const DK = girder(L, deckY, W, Dp, 12, 0, L), PI_ = [], AB = [];
  for (const s of spec.piers) { const base = Math.min(gl(s, -W / 3), gl(s, W / 3)); PI_.push(...pierAt(s, deckY(s) - Dp, base, W, false)); }
  for (const [s, d] of [[0, -1], [L, 1]]) { const y = deckY(s); AB.push(bx([-W / 2 - .6, gl(s, 0) - 3, Math.min(s, s + d * 6)], [W / 2 + .6, y - .2, Math.max(s, s + d * 6)])); }
  return { name: 'bridge_beam', parts: [
    { name: 'deck', label: `${spec.name || 'Road bridge'} · ${Math.round(L)} m · spans 36 m`, prims: DK },
    { name: 'road', label: 'Approach road · crash barriers', prims: approaches(gl, L, W, 320) },
    { name: 'piers', label: 'Piers · two columns', prims: PI_ },
    { name: 'abut', label: 'Abutments', prims: AB },
  ] };
};

export function spacingFor(spec) {
  const S = spec.lods || { settlement: [.3, .75, 1.9, 4.8], bridge_cs: [.3, .8, 2.2, 6], bridge_susp: [.25, .7, 1.9, 5], bridge_beam: [.12, .3, .8, 2], reeds: [.1, .25, .7, 1.8], road: [.2, .5, 1.3, 3.2], pipeline: [.12, .3, .8, 2], powerline: [.15, .4, 1, 2.6], penstock: [.2, .5, 1.3, 3.2], jetty: [.08, .2, .5, 1.3], quay: [.18, .45, 1.2, 3], stacks: [.25, .6, 1.5, 3.8] }[spec.kind] || [.3, .8, 2, 5];
  return S;
}

export { sheet, ybox, taper, beam, catenary, lattice, hoop, dome, sphereAt, house, hull, rng, bx, primCentre, BUILDERS, PLAT, PYLON_ARMS, TERM };
