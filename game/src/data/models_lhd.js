/* ONIKS · LHD-1 Wasp class amphibious assault ship (film quality), in the GEO / HD part format (see models.js).
   257.3 m overall, beam 31.8 m, draught 8.1 m, about 40 500 t full load, 22+ kn. LHD-1..7: two boilers, two
   geared steam turbines, 70 000 shp on two shafts with 5-blade propellers; two rudders.
   Origin midships on the waterline, bow +Z, +X starboard, +Y up (metres).
   Hull: long parallel midbody with near-vertical sides up to the flight deck, the raked stem with the heavy flare
   carrying the tapered forward end of the flight deck, the flat wide transom with the stern gate, a counter over
   the propellers, a modest bulbous bow; below the waterline two shafts on struts, 5-blade propellers, two rudders.
   Flight deck 18.3 m over the waterline: nine landing spots along the port side (lineup line, spot circles and
   numbers), the hull number at the bow, the island's foul line, catwalks; two deck-edge elevators outboard of the
   deck edge (port amidships, starboard aft of the island) in front of the hangar openings.
   Island (starboard): three lower levels, the flag and navigation bridges with their window rows and wings, the two
   uptakes, Primary Flight Control aft with its sloped glazing; the main mast (AN/SPS-48E on its pedestal ahead of
   it, AN/SPN-43, URN-25 TACAN on the pole, SATCOM domes) and the aft mast with AN/SPS-49.
   Self-defence: Mk 29 (NSSM) ×2, Mk 49 RAM ×2, Phalanx ×2 (island front, stern sponson); boats in side pockets,
   liferaft racks, two bow anchors. Stern well deck 81 × 15.2 m for three LCACs behind a bottom-hinged gate.
   Public-reference level: external shapes, public designations, sizes. The cutaway (lhd_cut) adds, as closed
   volumes, the hangar, the vehicle decks, troop berthing and the machinery rooms, and opens the well deck.

   Exports
     lhd()        unit model (key 'lhd')          lhdCut()    Inspect cutaway (key 'lhd_cut')
     LHD          anchors (ship frame: origin midships on the waterline, bow +Z, +X starboard): DECK_Y, WELL, GATE,
                  SLOTS (LCACs), SPOTS (helicopters), ELEV, HANGAR, VEHICLE, ISLAND, SPS48, SPS49, mastTop, bridge,
                  priFly, weapons, PROPS, HELO_IN / ACV_IN (X-ray), deckHalf(z), gateXf(st), gateTip(st)
     LHD_INFO     MODEL_INFO entries              LHD_STATES  MODEL_STATES entries
     LHD_ANATOMY  { lhd: anatomy entry } (merged into data/anatomy.js ANATOMY)
   state: well (0 stern gate closed .. 1 lowered to ~7° below horizontal, its top edge at the water: parts gate and
          gateIn turn about LHD.GATE.hinge by xf; gateIn (the ramp face) and well (the well deck's interior) show only
          while the gate is open or under the X-ray, since dots are not occluded), radar (rad, SPS-48E / SPS-49
          turning by xf about their vertical axes), elevP, elevS (0 at the flight deck .. 1 down at the hangar deck) */
const M3 = window.M3, GEO = window.GEO, HD = window.HD;
const { V, R, X } = M3;
const { hex, box, lathe, cyl, panel, line, blades } = GEO;
const PI = Math.PI, DEG = PI / 180;
const FX = [1, 0, 0], FY = [0, 1, 0], FZ = [0, 0, 1], BZ = [0, 0, -1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const ssE = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const SA = HD.seaAir, tp = HD.tp, tps = (T, L) => L.map(pr => tp(T, pr));
const about = HD.about, ringW = HD.ring, circle = HD.circle;
const T3 = p => X.make(R.I(), p);
const memo = f => { let c = null; return () => c || (c = f()); };
const avg = P => V.mul(P.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / P.length);
const hidden = { inside: true, show: st => !!st.xray };

/* ---------------------------------------------------------------- dimensions */
const ZS = -128.65, ZB = 128.65, DECK = 18.3;
const H = {
  GAL: 17.2,                              // underside of the flight deck at its edge (the fascia is 1.1 m deep)
  BWL: 15.9, BTR: 14.7, BTT: 15.4,         // half breadth: midbody, transom on the waterline, transom under the deck
  ZSTEM: 108.5, ZTOP: 124.8,               // stem on the waterline; stem head under the flight deck's forward edge
  T: 8.1, TRY: -1.0,                       // draught; the counter / transom's lower edge
  W: 16.15, WB: 6.4, ZT: 70,               // flight deck half width, half width of its forward edge, start of its taper
  HGR: 11.0, HTOP: 17.2,                   // hangar deck, hangar overhead
  WY: 1.0, WHW: 7.6, WTOP: 10.2,           // well deck floor, half width, overhead
  GH: 8.8, GT: .8, GOPEN: 97 * DEG,        // stern gate: height, thickness, lowered angle
  ISL: { x0: 9.2, x1: 16.15, z0: -40, z1: 14 },
  ELEV: [[-1, -3.0, 12.2], [1, -60.0, -44.8]], EL_OUT: 10.4,     // [side, aft end, forward end], out past the deck edge
  POCK: [[-1, -84, -72], [1, -30, -18]],                          // boat pockets in the hull sides
  P48: [12.85, 37.6, 5.0], P49: [14.0, 43.0, -35.4], MAST: [12.85, 33.9, -4.3],
  PROP: { x: 7.4, y: -4.9, z: -98, R: 3.2 }, SHAFT_OUT: -70, RUD_Z: -104.5,
  LV: [0, .32, .64, .82, 1],               // hull side levels (fractions stem .. gallery): 2 = the hangar deck
  SPON_Y: 15.7,
};
const WZ0 = ZS + H.GT, WZ1 = WZ0 + 81;

/* anchors (ship frame). The game parks helicopters on SPOTS and LCACs in SLOTS. */
export const LHD = {
  L: 257.3, B: 31.8, T: 8.1, DECK_Y: DECK, ZS, ZB,
  // well deck: floor height (ship frame), half width, aft end (the gate's hinge line) and forward end
  WELL: { y: H.WY, hw: H.WHW, z0: WZ0, z1: WZ1, top: H.WTOP },
  // stern gate: hinged along its bottom edge (the inner face's lower edge, on the sill in the transom); w wide, h tall,
  // open = the lowered angle (rad past vertical)
  GATE: { hinge: [0, H.WY, WZ0], w: 15.1, h: H.GH, t: H.GT, open: H.GOPEN },
  // LCAC stowage in the well (x, y, z of each craft's origin, bow +Z), aft first: the first to leave is SLOTS[0]
  SLOTS: [[0, H.WY, WZ0 + 13.6], [0, H.WY, WZ0 + 40.5], [0, H.WY, WZ0 + 67.4]],
  // the nine landing spots, bow first (spot 1 .. 9): [x, z, yaw] (the render parks MH-60Rs here, nose to yaw)
  SPOTS: [[-4.4, 97, 0], [-6, 72, 0], [-6, 47, 0], [-6, 22, 0], [-6, -3, 0], [-6, -28, 0], [-6, -53, 0], [-6, -78, 0], [-6, -104, 0]],
};

/* ---------------------------------------------------------------- hull form */
/* flight deck half width at z (the outline is symmetric: full width aft, the tapered forward end) */
function deckHalf(z) {
  if (z > ZB + 1e-6 || z < ZS - 1e-6) return 0;
  if (z > H.ZT) return H.W - (H.W - H.WB) * Math.pow((z - H.ZT) / (ZB - H.ZT), 1.35);
  if (z < ZS + .9) return H.W - .6 * (1 - (z - ZS) / .9);
  return H.W;
}
/* waterline half breadth */
function wl(z) {
  if (z >= H.ZSTEM || z < ZS) return 0;
  if (z > 40) { const u = (z - 40) / (H.ZSTEM - 40); return H.BWL * Math.pow(Math.max(0, 1 - u * u), .7); }
  if (z < -70) { const u = (-70 - z) / (-70 - ZS); return H.BWL - (H.BWL - H.BTR) * Math.pow(u, 1.6); }
  return H.BWL;
}
const stemY = z => z <= H.ZSTEM ? 0 : H.GAL * Math.pow(Math.min(1, (z - H.ZSTEM) / (H.ZTOP - H.ZSTEM)), 1 / 1.6);
/* half width of the hull's top edge under the flight deck */
function topW(z) {
  if (z < ZS || z > H.ZTOP) return 0;
  let w = Math.min(H.BWL, deckHalf(z) - .25);
  if (z < -100) w = Math.min(w, H.BWL - (H.BWL - H.BTT) * Math.pow((-100 - z) / (-100 - ZS), 2));
  if (z > H.ZTOP - 7) w *= Math.sqrt(Math.max(0, 1 - Math.pow((z - H.ZTOP + 7) / 7, 2)));
  return Math.max(0, w);
}
/* half width at height y (above the waterline): the flare concentrates high up at the bow */
function hw(z, y) {
  const ys = stemY(z); if (y < ys - 1e-6) return 0;
  const t = (y - ys) / Math.max(.01, H.GAL - ys), b = wl(z), w1 = topW(z);
  const p = z > 40 ? mix(1, 2.0, sat((z - 40) / 70)) : 1;
  return b + (w1 - b) * Math.pow(sat(t), p);
}
const levels = z => { const ys = stemY(z); return H.LV.map(f => { const y = ys + (H.GAL - ys) * f; return [hw(z, y), y]; }); };
/* keel line: flat, the forefoot rounding up to the stem, the run rising aft to the counter over the propellers */
function keel(z) {
  if (z < -40) return -H.T + (H.T + H.TRY) * ssE(-40, -98, z);
  if (z > 90) { const t = sat((z - 90) / (H.ZSTEM - 90)); return -H.T * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))); }
  return -H.T;
}
const secE = z => z > 30 ? mix(7, 2.6, sat((z - 30) / 78)) : z < -60 ? mix(7, 5, sat((-60 - z) / 68)) : 7;
function secPt(z, th) { const b = wl(z), k = keel(z), e = secE(z), s = Math.max(0, Math.sin(th)), c = Math.max(0, Math.cos(th)); return [b * Math.pow(s, 2 / e), k * Math.pow(c, 2 / e)]; }
function bottomY(z, x) {
  const b = wl(z), ax = Math.abs(x); if (ax >= b) return 0;
  const e = secE(z), s = Math.pow(ax / b, e / 2), c = Math.sqrt(Math.max(0, 1 - s * s));
  return keel(z) * Math.pow(c, 2 / e);
}
const OPEN = H.ELEV.map(e => [e[0], e[1], e[2], 'elev']).concat(H.POCK.map(e => [e[0], e[1], e[2], 'boat']));
const openAt = (s, z) => OPEN.some(([es, z0, z1]) => es === s && z > z0 && z < z1);
/* flight deck outline (x, z): starboard from the bow aft, across the stern, port forward */
const DK_Z = (() => { const Z = [ZB]; for (let z = ZB - 4; z > H.ZT + .5; z -= 4) Z.push(z); Z.push(H.ZT, ZS + .9, ZS); return Z; })();
const DECK_OUT = DK_Z.map(z => [deckHalf(z), z]).concat(DK_Z.slice().reverse().map(z => [-deckHalf(z), z]));
const DK_AREA = (() => { let a = 0; for (let i = 0, n = DECK_OUT.length; i < n; i++) { const p = DECK_OUT[i], q = DECK_OUT[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; })();
/* hull stations above the waterline: every 6 m, finer at the bow, the openings' ends, the deck taper's corners */
const ZH = (() => {
  const Z = [ZS, H.ZTOP];
  for (let z = -126; z < 102; z += 6) Z.push(z);
  for (let z = 102; z < H.ZTOP; z += 1.2) Z.push(z);
  for (const [, z0, z1] of OPEN) Z.push(z0, z1);
  for (const z of DK_Z) Z.push(z);
  const S = Z.filter(z => z >= ZS && z <= H.ZTOP).sort((a, b) => a - b), keep = new Set(OPEN.flatMap(e => [e[1], e[2]])), out = [];
  for (const z of S) { if (out.length && z - out[out.length - 1] < .4) { if (keep.has(z)) out[out.length - 1] = z; continue; } out.push(z); }
  return out;
})();

/* ---------------------------------------------------------------- building blocks (the carrier's kit in models.js) */
function bboxC(pr) {
  let P;
  if (pr.p) P = pr.p; else if (pr.t === 'lathe') P = pr.st.map(q => V.mad(pr.a, pr.d, q[0])); else if (pr.t === 'blades') P = [pr.c]; else P = [[0, 0, 0]];
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const q of P) for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
  return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
}
/* facing-aware polyline, two segments per hex; N a normal or (i, a, b) -> normal */
function fl2(A, B, C, n, o) {
  const ab = V.sub(B, A), e = V.cross(n, ab), le = V.len(e);
  if (le < 1e-9 || V.len(ab) < 1e-6 || V.dist(B, C) < 1e-6) return null;
  const B2 = V.mad(B, e, 1e-4 / le), q = [A, B, C, B2];
  return hex([...q, ...q], O({ pts: false }, o));
}
function poly(P, N, o, closed) {
  const out = [], Q = closed ? P.concat([P[0]]) : P, m = Q.length - 1, nAt = i => typeof N === 'function' ? N(i, Q[i], Q[i + 1]) : N;
  for (let i = 0; i < m; i += 2) {
    if (i + 1 < m) {
      const h = fl2(Q[i], Q[i + 1], Q[i + 2], V.norm(V.add(nAt(i), nAt(i + 1))), o);
      if (h) { out.push(h); continue; }
      out.push(SA.fl(Q[i], Q[i + 1], nAt(i), o), SA.fl(Q[i + 1], Q[i + 2], nAt(i + 1), o));
    } else out.push(SA.fl(Q[i], Q[i + 1], nAt(i), o));
  }
  return out;
}
const sideN = (a, b, s, up) => { let n = [b[2] - a[2], 0, -(b[0] - a[0])]; if (n[0] * s < 0) n = V.mul(n, -1); n = V.norm(n); return V.norm([n[0], up || 0, n[2]]); };
/* a flat wall b0-b1 (bottom edge) to t0-t1 (top edge) in dots, window rows left open (dark glass):
   bands [[v0, v1, u0, u1, n]] (v up the wall, u along it, n panes outlined in wire) */
function wallW(b0, b1, t1, t0, out, bands, P, o) {
  const at = (u, v) => V.lerp(V.lerp(b0, b1, u), V.lerp(t0, t1, u), v), B = bands || [];
  const vs = [...new Set([0, 1, ...B.flatMap(b => [b[0], b[1]])])].sort((a, b) => a - b);
  for (let i = 0; i < vs.length - 1; i++) {
    const v0 = vs[i], v1 = vs[i + 1], vm = (v0 + v1) / 2, band = B.find(b => vm > b[0] && vm < b[1]);
    for (const [u0, u1] of band ? [[0, band[2]], [band[3], 1]] : [[0, 1]]) if (u1 - u0 > .004) P.push(SA.plate([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], out, o));
  }
  const nn = V.norm(out), lift = p => V.mad(p, nn, .04);
  for (const [v0, v1, u0, u1, n] of B) {
    const du = (u1 - u0) / n, g = Math.min(.08, du * .1);
    for (let k = 0; k < n; k++) P.push(panel([at(u0 + k * du + g, v0), at(u0 + (k + 1) * du - g, v0), at(u0 + (k + 1) * du - g, v1), at(u0 + k * du + g, v1)].map(lift), fn({ pts: false, al: .55 })));
    P.push(line([at(u0, v0), at(u1, v0)].map(lift), { pts: false, w: .6 }), line([at(u0, v1), at(u1, v1)].map(lift), { pts: false, w: .6 }));
  }
}
/* an axis-aligned block: wire edges, dots on the walls listed ('f' +z, 'a' -z, 'p' -x, 's' +x, 't' top) */
function block(a, b, faces, P, bands, o) {
  P.push(box(a, b, O({ pts: false }, o)));
  const [x0, y0, z0] = a, [x1, y1, z1] = b, W = bands || {};
  if (faces.includes('f')) wallW([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], FZ, W.f, P, o);
  if (faces.includes('a')) wallW([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], BZ, W.a, P, o);
  if (faces.includes('p')) wallW([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], W.p, P, o);
  if (faces.includes('s')) wallW([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], FX, W.s, P, o);
  if (faces.includes('t')) P.push(SA.plate([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], FY, o));
}
const roof = (x0, x1, z0, z1, y, P, o) => { if (x1 - x0 > .1 && z1 - z0 > .1) P.push(SA.plate([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], FY, o)); };
const rail = (P, pts, y, o) => P.push(line(pts.map(p => [p[0], y, p[1]]), fn(O({ w: .3 }, o))));
/* a painted stripe from a to b, w wide: a dense strip of dots and a hairline */
function stripe(a, b, w, o) {
  o = o || {};
  const d = V.norm(V.sub(b, a)), n = [d[2] * w / 2, 0, -d[0] * w / 2];
  return [line([a, b], { pts: false, w: o.w === undefined ? .55 : o.w, fine: o.fine }),
    SA.plate([V.sub(a, n), V.add(a, n), V.add(b, n), V.sub(b, n)], FY, { ds: o.ds || .4, fine: o.fine })];
}
/* seven-segment numerals centred at c: ux the reading direction, uy up the digit, h tall, painted on the surface
   whose outward normal is o.n */
const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
function digits(str, c, ux, uy, h, o) {
  const w = h * .55, gap = h * .24, n = str.length, tot = n * w + (n - 1) * gap, P = [], sw = o.sw || 1, hs = sw / 2, nn = o.n || FY;
  const at = (x, y) => V.mad(V.add(c, V.add(V.mul(ux, x), V.mul(uy, y))), nn, .04);
  str.split('').forEach((ch, i) => {
    const x0 = -tot / 2 + i * (w + gap) - (n === 1 && ch === '1' ? w / 2 : 0), x1 = x0 + w, y0 = -h / 2, y1 = h / 2;
    const S = { a: [x0, x1, y1 - hs, y1 + hs], b: [x1 - hs, x1 + hs, 0, y1], c: [x1 - hs, x1 + hs, y0, 0], d: [x0, x1, y0 - hs, y0 + hs], e: [x0 - hs, x0 + hs, y0, 0], f: [x0 - hs, x0 + hs, 0, y1], g: [x0, x1, -hs, hs] };
    for (const key of SEG[ch]) {
      const [a0, a1, b0, b1] = S[key], q = [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)];
      P.push(SA.plate(q, nn, { ds: o.ds || .45, fine: o.fine }), line(q.concat([q[0]]), { pts: false, w: o.w || .45, fine: o.fine }));
    }
  });
  return P;
}
/* thin slab from a planar quad: both faces sampled, edges in wire */
function slab2(q, th, o) {
  const n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]))), t = Array.isArray(th) ? th : [th, th, th, th];
  return hex([...q.map((p, i) => V.mad(p, n, -t[i] / 2)), ...q.map((p, i) => V.mad(p, n, t[i] / 2))], O({ skip: [2, 3, 4, 5], bottom: true }, o));
}
function strutLeg(a, b) {
  const d = V.norm(V.sub(b, a)), side = V.norm(V.cross(d, FZ)), t = .16, c = .6;
  const q = (p, u, v) => V.add(p, V.add(V.mul(side, u), [0, 0, v]));
  return hex([q(a, -t, -c), q(a, t, -c), q(a, t, c), q(a, -t, c), q(b, -t, -c), q(b, t, -c), q(b, t, c), q(b, -t, c)], { skip: [0, 1] });
}
/* a closed volume: sparse dots on its faces, its twelve edges in dense dots (reads as a LiDAR box, not a slab) */
function volume(a, b, P, ds) {
  P.push(box(a, b, { bottom: true, ds: ds || 2.6 }));
  const c = (i, j, k) => [i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]];
  for (const [p, q] of [[c(0, 0, 0), c(1, 0, 0)], [c(0, 1, 0), c(1, 1, 0)], [c(0, 0, 1), c(1, 0, 1)], [c(0, 1, 1), c(1, 1, 1)],
    [c(0, 0, 0), c(0, 1, 0)], [c(1, 0, 0), c(1, 1, 0)], [c(0, 0, 1), c(0, 1, 1)], [c(1, 0, 1), c(1, 1, 1)],
    [c(0, 0, 0), c(0, 0, 1)], [c(1, 0, 0), c(1, 0, 1)], [c(0, 1, 0), c(0, 1, 1)], [c(1, 1, 0), c(1, 1, 1)]]) P.push(line([p, q], { pts: true, w: 0, ds: .45 }));
}

/* ---------------------------------------------------------------- hull above the waterline (split starboard / port) */
function hullAbove() {
  const S = [], P = [], Z = ZH, LV = Z.map(levels);
  for (const s of [1, -1]) {
    const Hh = s > 0 ? S : P;
    for (let i = 0; i < Z.length - 1; i++) {
      const za = Z[i], zb = Z[i + 1], A = LV[i], B = LV[i + 1], zm = (za + zb) / 2, open = openAt(s, zm);
      const out = [s, 0, zm > 95 ? .6 : 0];
      for (let k = 0; k < 3; k++) {
        if (open && k >= 2) continue;
        if (Math.max(A[k][0], A[k + 1][0], B[k][0], B[k + 1][0]) < .05) continue;
        Hh.push(SA.plate([[s * A[k][0], A[k][1], za], [s * B[k][0], B[k][1], zb], [s * B[k + 1][0], B[k + 1][1], zb], [s * A[k + 1][0], A[k + 1][1], za]], out, { ds: .85 }));
      }
      if (open) continue;
      // the top of the side and the flight deck's small overhang: from level 3 out to the deck edge
      const ea = deckHalf(za + 1e-3), eb = deckHalf(zb - 1e-3);
      Hh.push(SA.plate([[s * A[3][0], A[3][1], za], [s * B[3][0], B[3][1], zb], [s * eb, H.GAL, zb], [s * ea, H.GAL, za]], [s, -.6, zm > 95 ? .4 : 0], { ds: .85 }));
    }
    // openings: the hangar's side openings behind the elevators, the boat pockets
    for (const [es, z0, z1, kind] of OPEN) {
      if (es !== s) continue;
      const zm = (z0 + z1) / 2, xh = s * hw(zm, 14), d = kind === 'boat' ? 3.4 : 1.2, xi = xh - s * d, yb = H.HGR, yt = H.GAL, xe = s * deckHalf(zm);
      Hh.push(SA.fquad([[xh + s * .03, yb, z0], [xh + s * .03, yb, z1], [xh + s * .03, yt - .05, z1], [xh + s * .03, yt - .05, z0]], [s, 0, 0], { al: .85 }));
      for (const [z, nz] of [[z0, 1], [z1, -1]]) Hh.push(SA.plate([[xi, yb, z], [xh, yb, z], [xh, yt, z], [xi, yt, z]], [0, 0, nz], { ds: .9 }));
      Hh.push(SA.plate([[xi, yt, z0], [xe, yt, z0], [xe, yt, z1], [xi, yt, z1]], [0, -1, 0], { ds: 1.1 }));
      if (kind === 'boat') {
        Hh.push(SA.plate([[xi, yb, z0], [xi, yb, z1], [xi, yt, z1], [xi, yt, z0]], [s, 0, 0], { ds: 1.0 }));
        Hh.push(SA.plate([[xi, yb, z0], [xh, yb, z0], [xh, yb, z1], [xi, yb, z1]], FY, { ds: 1.0 }));
      } else {
        // the elevator's guide rails either side of the opening, the hangar deck's sill
        for (const z of [z0 + .5, z1 - .5]) Hh.push(line([[xh + s * .15, yb, z], [xh + s * .15, DECK - .1, z]], { w: .6, ds: .6 }));
        Hh.push(line([[xh, yb + .02, z0 + .3], [xh, yb + .02, z1 - .3]], fn({ w: .5, ds: .7 })));
      }
    }
    // transom above the waterline: the gate's opening left open (x ±7.6, well floor to the lintel)
    const tw = y => hw(ZS, y), L0 = LV[0], ys = [0, H.WY, H.WY + H.GH, L0[2][1], L0[3][1]];
    for (let r = 0; r < ys.length - 1; r++) {
      const y0 = ys[r], y1 = ys[r + 1], xin = r === 1 ? H.WHW : 0;
      Hh.push(SA.plate([[s * xin, y0, ZS], [s * tw(y0), y0, ZS], [s * tw(y1), y1, ZS], [s * xin, y1, ZS]], BZ, { ds: .85 }));
    }
    const y3 = L0[3][1], eT = deckHalf(ZS + 1e-3);
    Hh.push(SA.plate([[0, y3, ZS], [s * tw(y3), y3, ZS], [s * eT, H.GAL, ZS], [0, H.GAL, ZS]], BZ, { ds: .85 }));
    Hh.push(...poly([[s * tw(0), 0, ZS], [s * tw(y3), y3, ZS], [s * eT, H.GAL, ZS]], BZ, { al: .85 }));
    // lines: waterline, the top of the side (level 3), the hangar-deck level, frames
    const wlp = [], k3 = [], k2 = [];
    Z.forEach((z, i) => {
      if (z <= H.ZSTEM) wlp.push([s * wl(z), 0, z]);
      if (!openAt(s, z)) k3.push([s * LV[i][3][0], LV[i][3][1], z]); else if (k3.length) Hh.push(...poly(k3.splice(0), (j, a, b) => sideN(a, b, s, -.3), { al: .45 }));
      if (!openAt(s, z)) k2.push([s * LV[i][2][0], LV[i][2][1], z]); else if (k2.length) Hh.push(...poly(k2.splice(0), (j, a, b) => sideN(a, b, s, 0), fn({ al: .28 })));
    });
    wlp.push([0, 0, H.ZSTEM]);
    if (k3.length > 1) Hh.push(...poly(k3, (j, a, b) => sideN(a, b, s, -.3), { al: .45 }));
    if (k2.length > 1) Hh.push(...poly(k2, (j, a, b) => sideN(a, b, s, 0), fn({ al: .28 })));
    Hh.push(...poly(wlp, (j, a, b) => sideN(a, b, s, 0), { al: .85 }));
    for (let z = -120; z < 118; z += 24) { const L = levels(z); Hh.push(...poly(L.slice(0, openAt(s, z) ? 3 : 4).map(q => [s * q[0], q[1], z]), [s, 0, z > 90 ? .5 : 0], fn({ al: .2 }))); }
    // the hull number on the bow, painted on the flare
    { const z = 90, y = 10.4, x = hw(z, y), d = hw(z, y + .5) - hw(z, y - .5), n = V.norm([s, -d, 0]), up = V.norm([s * d, 1, 0]);
      Hh.push(...digits('1', [s * (x + .02), y, z], [0, 0, s], up, 6.4, { sw: 1.0, n, fine: true })); }
    // mooring openings on the bow under the flight deck
    for (const z of [104, 113]) {
      const y0 = 12.6, y1 = 15.0, xa = s * (hw(z - 2, (y0 + y1) / 2) + .03), xb = s * (hw(z + 2, (y0 + y1) / 2) + .03);
      Hh.push(SA.fquad([[xa, y0, z - 2], [xb, y0, z + 2], [xb, y1, z + 2], [xa, y1, z - 2]], [s, 0, .4], fn({ al: .7 })));
    }
  }
  // stem; the gate's opening in the transom, the well control station's windows over it
  const stem = []; for (let k = 0; k <= 12; k++) { const y = H.GAL * k / 12; stem.push([0, y, H.ZSTEM + (H.ZTOP - H.ZSTEM) * Math.pow(y / H.GAL, 1.6)]); }
  S.push(line(stem, { w: 1, pts: false }));
  S.push(SA.fquad([[-H.WHW, H.WY, ZS - .03], [H.WHW, H.WY, ZS - .03], [H.WHW, H.WY + H.GH, ZS - .03], [-H.WHW, H.WY + H.GH, ZS - .03]], BZ, { al: .95 }));
  for (let k = 0; k < 6; k++) { const x = -3.9 + k * 1.56; S.push(SA.fquad([[x - .5, 12.5, ZS - .03], [x + .5, 12.5, ZS - .03], [x + .5, 13.5, ZS - .03], [x - .5, 13.5, ZS - .03]], BZ, fn({ al: .6 }))); }
  S.push(line([[0, DECK, ZS - .2], [0, DECK + 5.5, ZS - .6]], fn({ w: .5, pts: false })));     // ensign staff
  return { S, P };
}

/* ---------------------------------------------------------------- below the waterline, bulbous bow */
function hullBelow() {
  const S = [], P = [], NQ = 9, Z = [ZS];
  for (let z = -126; z < 84; z += 6) Z.push(z);
  for (let z = 84; z < H.ZSTEM - .05; z += 3) Z.push(z);
  Z.push(H.ZSTEM - .02);
  for (let i = 0; i < Z.length - 1; i++) {
    const za = Z[i], zb = Z[i + 1], km = keel((za + zb) / 2);
    for (let j = 0; j < NQ; j++) {
      const t0 = j / NQ * PI / 2, t1 = (j + 1) / NQ * PI / 2;
      const a0 = secPt(za, t0), a1 = secPt(za, t1), b0 = secPt(zb, t0), b1 = secPt(zb, t1);
      if (Math.max(a1[0], b1[0]) < .08) continue;
      for (const s of [1, -1]) {
        const q = [[s * a0[0], a0[1], za], [s * a1[0], a1[1], za], [s * b1[0], b1[1], zb], [s * b0[0], b0[1], zb]], c = avg(q);
        (s > 0 ? S : P).push(SA.plate(q, [c[0], c[1] - km * .5, 0], { ds: 1.35 }));
      }
    }
  }
  for (const s of [1, -1]) {
    const Hh = s > 0 ? S : P;
    // the transom's immersed strip, down to the counter
    for (let j = 0; j < NQ; j++) {
      const a = secPt(ZS, j / NQ * PI / 2), b = secPt(ZS, (j + 1) / NQ * PI / 2);
      if (Math.max(a[0], b[0]) > .05) Hh.push(SA.plate([[0, a[1], ZS], [s * a[0], a[1], ZS], [s * b[0], b[1], ZS], [0, b[1], ZS]], BZ, { ds: 1.35 }));
    }
    for (const th of [.55, 1.1]) Hh.push(line(Z.map(z => { const p = secPt(z, th); return [s * p[0], p[1], z]; }), fn({ w: .3, pts: false })));
    const tr = []; for (let j = 0; j <= NQ; j++) { const p = secPt(ZS, j / NQ * PI / 2); tr.push([s * p[0], p[1], ZS]); }
    Hh.push(line(tr, { w: .6, pts: false }));
    // the bilge keel
    Hh.push(line([-40, 30].map(z => { const p = secPt(z, PI / 4); return [s * (p[0] + .3), p[1] - .3, z]; }), fn({ w: .45, ds: .8 })));
  }
  S.push(line(Z.map(z => [0, keel(z), z]), { w: .6, pts: false }));
  const BULB = [lathe([0, -5.1, 97.5], FZ, [[0, .6], [3, 1.65], [6.5, 2.1], [9.5, 2.05], [11.8, 1.7], [13.4, 1.1], [14.4, .5], [14.8, 0]], { n: 24, gen: 8, rings: [3, 5], ds: 1.3 })];
  return { S, P, BULB };
}

/* ---------------------------------------------------------------- flight deck */
function flightDeck() {
  const P = [], y = DECK, I = H.ISL, n = DECK_OUT.length, sg = DK_AREA > 0 ? 1 : -1;
  // top: strips between the outline's corners (every 6 m), the island's footprint left out
  const zs = [ZS, ZB, I.z0, I.z1, H.ZTOP, ...DK_Z]; for (let z = -126; z < ZB; z += 6) zs.push(z);
  const Z = [...new Set(zs.map(z => +z.toFixed(3)))].sort((a, b) => a - b);
  for (let i = 0; i < Z.length - 1; i++) {
    const za = Z[i] + 1e-3, zb = Z[i + 1] - 1e-3; if (zb - za < .05) continue;
    const A = deckHalf(za), B = deckHalf(zb), zm = (za + zb) / 2, isl = zm > I.z0 && zm < I.z1;
    P.push(SA.plate([[-A, y, za], [isl ? I.x0 : A, y, za], [isl ? I.x0 : B, y, zb], [-B, y, zb]], FY, { ds: 1.55 }));
    // the overhang's underside ahead of the stem head
    if (zm > H.ZTOP) P.push(SA.plate([[-A, H.GAL, za], [A, H.GAL, za], [B, H.GAL, zb], [-B, H.GAL, zb]], [0, -1, 0], { ds: 1.6 }));
  }
  // the edge: fascia all round, outline on top and below
  const outN = i => { const a = DECK_OUT[i], b = DECK_OUT[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [sg * dz / l, 0, -sg * dx / l]; };
  for (let i = 0; i < n; i++) {
    const a = DECK_OUT[i], b = DECK_OUT[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < .01) continue;
    P.push(SA.plate([[a[0], H.GAL, a[1]], [b[0], H.GAL, b[1]], [b[0], y, b[1]], [a[0], y, a[1]]], outN(i)));
  }
  P.push(...poly(DECK_OUT.map(p => [p[0], y, p[1]]), i => V.norm(V.add(outN(i % n), [0, 1.3, 0])), { al: 1 }, true));
  P.push(...poly(DECK_OUT.map(p => [p[0], H.GAL, p[1]]), i => outN(i % n), { al: .35 }, true));
  // catwalks with safety nets just below the edge
  for (const [s, z0, z1] of [[1, -126, -62], [1, 16, 116], [-1, -126, -5], [-1, 14, 116]]) {
    const r = []; for (let z = z0; z <= z1 + 1e-6; z += 2) r.push([s * (deckHalf(z) + 1.3), 17.5, z]);
    P.push(line(r, fn({ w: .35, ds: .9 })));
    P.push(line(r.map(p => [p[0], 18.0, p[2]]), fn({ w: .25, pts: false })));
  }
  // whip antennas on the catwalks, raised and leaning outboard
  for (const [s, z] of [[1, 30], [1, 58], [1, -70], [1, -104], [-1, 34], [-1, 64], [-1, -40], [-1, -88]]) {
    const x = s * (deckHalf(z) + 1.0);
    P.push(line([[x, 17.3, z], [x + s * 2.2, 17.3 + 9.2, z]], fn({ w: .5, pts: false })), box([x - .2, 16.9, z - .25], [x + .2, 17.4, z + .25], fn()));
  }
  // markings: the lineup line through the nine spots (port side), spot circles with their numbers (readable from
  // port), the hull number at the bow, the foul line along the island
  const yM = y + .03, LU = [[-6, -118], [-6, 80], [-4.4, 97], [-3.8, 106]];
  for (let i = 0; i < LU.length - 1; i++) P.push(...stripe([LU[i][0], yM, LU[i][1]], [LU[i + 1][0], yM, LU[i + 1][1]], .5, { w: .55 }));
  LHD.SPOTS.forEach(([x, z], i) => {
    P.push(circle([x, yM, z], FY, 5.0, 40, { w: .5, ds: .5 }));
    P.push(...stripe([x - 5.0, yM, z], [x + 5.0, yM, z], .35, { w: .35, fine: true }));
    P.push(...digits(String(i + 1), [x - 7.4, yM, z], BZ, FX, 3.4, { sw: .6, w: .45, fine: true }));
  });
  P.push(...digits('1', [0, yM, 116], FX, FZ, 9, { sw: 1.3, w: .5, fine: true }));
  P.push(...stripe([I.x0 - 2.2, yM, I.z0 - 26], [I.x0 - 2.2, yM, I.z1 + 14], .45, { w: .35, fine: true }));
  for (const z of [-116, -8, 60]) P.push(...stripe([I.x0 - 2.2, yM, z], [H.W - .6, yM, z], .35, { w: .3, fine: true }));
  return P;
}
/* deck-edge elevators: platforms outboard of the deck edge, flush with it when up */
function elevator(s, z0, z1) {
  const P = [], y1 = DECK - .02, y0 = y1 - 1.5, xi = s * (H.W - .1), xo = s * (H.W + H.EL_OUT), cx = (xi + xo) / 2, cz = (z0 + z1) / 2;
  const pl = [[xi, z0], [xo, z0], [xo, z1], [xi, z1]], top = pl.map(p => [p[0], y1, p[1]]), bot = pl.map(p => [p[0], y0, p[1]]);
  const nOut = (a, b) => V.norm([(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz]);
  P.push(SA.plate(top, FY, { ds: 1.55 }), SA.plate(bot, [0, -1, 0], { ds: 1.8 }));
  for (let i = 0; i < 3; i++) P.push(SA.plate([bot[i], bot[i + 1], top[i + 1], top[i]], nOut(top[i], top[i + 1])));
  P.push(...poly(top, (i, a, b) => V.norm(V.add(nOut(a, b), [0, 1.2, 0])), { al: .9 }, true));
  P.push(line(bot.concat([bot[0]]), fn({ w: .4, pts: false })));
  // the painted border, stanchions and rail along the outboard edge
  const bd = top.map(p => [p[0] + (cx - p[0]) * .1, y1 + .03, p[2] + (cz - p[2]) * .08]);
  for (let i = 0; i < 4; i++) P.push(...stripe(bd[i], bd[(i + 1) % 4], .5, { w: .45 }));
  for (let z = z0 + .8; z < z1; z += 2.4) P.push(line([[xo, y1, z], [xo, y1 + 1.0, z]], fn({ w: .35, pts: false })));
  P.push(line([[xo, y1 + 1.0, z0 + .4], [xo, y1 + 1.0, z1 - .4]], fn({ w: .35 })));
  // lift platform's underside girders
  for (let k = 1; k < 4; k++) { const z = z0 + k * (z1 - z0) / 4; P.push(line([[xi, y0 - .02, z], [xo, y0 - .02, z]], fn({ w: .3, pts: false }))); }
  return P;
}
const elevXf = key => st => T3([0, -sat(st[key] || 0) * (DECK - H.HGR), 0]);

/* ---------------------------------------------------------------- island */
function island() {
  const A = [], B = [], C = [], D = DECK, I = H.ISL, dI = { ds: .8 }, yA = 27.1, yB = 33.9, yS = 31.2, yP = 37.1, yF = 39.2, yN = (yA + yB) / 2;
  // lower levels: three decks standing on the starboard deck edge
  block([I.x0, D, I.z0], [I.x1, yA, I.z1], 'fasp', A, {
    f: [[.68, .84, .1, .9, 5]],
    p: [[.1, .3, .38, .62, 5], [.68, .84, .72, .97, 6], [.68, .84, .06, .26, 3]],
    s: [[.68, .84, .03, .28, 6]],
    a: [[.68, .84, .3, .7, 2]] }, dI);
  roof(I.x0, I.x1, 10.5, I.z1, yA, A, dI); roof(I.x0, 9.6, -8, 10.5, yA, A, dI); roof(I.x0, 10.0, -30, -8, yA, A, dI); roof(15.8, I.x1, -30, -8, yA, A, dI);
  for (const z of [-35, -21, -3, 7]) A.push(panel([[I.x0 - .03, D, z - .65], [I.x0 - .03, D, z + .65], [I.x0 - .03, D + 2.1, z + .65], [I.x0 - .03, D + 2.1, z - .65]], fn({ pts: false, al: .6 })));
  A.push(panel([[10.9, D, I.z1 + .03], [12.2, D, I.z1 + .03], [12.2, D + 2.1, I.z1 + .03], [10.9, D + 2.1, I.z1 + .03]], fn({ pts: false, al: .6 })));
  for (const s of [1, -1]) {
    // AN/SLQ-32 arrays on either face
    const x0 = s > 0 ? I.x1 : I.x0 - 1.3, x1 = s > 0 ? I.x1 + 1.3 : I.x0, xo = s > 0 ? x1 + .03 : x0 - .03;
    A.push(box([x0, 23.2, -20], [x1, 26.2, -13]));
    A.push(panel([[xo, 23.5, -19.7], [xo, 23.5, -13.3], [xo, 25.9, -13.3], [xo, 25.9, -19.7]], fn({ pts: false, hatch: 5, hatch2: 3, al: .45 })));
  }
  for (const [x, ux, nx] of [[I.x1, FZ, FX], [I.x0, BZ, [-1, 0, 0]]]) A.push(...digits('1', [x, 22.2, -30], ux, FY, 4.6, { sw: .7, n: nx, ds: .5, fine: true }));
  for (const y of [21.2, 24.1]) A.push(line([[I.x0 - .02, y, I.z0], [I.x0 - .02, y, I.z1], [I.x1 + .02, y, I.z1], [I.x1 + .02, y, I.z0]], fn({ w: .22, pts: false })));
  rail(A, [[I.x0, 10.5], [I.x0, I.z1], [I.x1, I.z1], [I.x1, 10.5]], yA + 1.0);
  // flag bridge (lower window row) and navigation bridge (upper row), bridge wings
  const bx0 = 9.6, bx1 = I.x1, bz0 = -8, bz1 = 10.5, rows = [[.12, .36], [.58, .9]];
  block([bx0, yA, bz0], [bx1, yB, bz1], 'fps', B, {
    f: [[...rows[0], .05, .95, 6], [...rows[1], .03, .97, 7]],
    p: [[...rows[0], .72, .98, 4], [...rows[1], .66, .98, 5]],
    s: [[...rows[0], .02, .28, 4], [...rows[1], .02, .34, 5]] }, dI);
  roof(bx0, bx1, bz0, bz1, yB, B, dI);
  // its aft face where the uptakes' casing does not cover it
  for (const [x0, x1, y0, y1] of [[bx0, bx1, yS, yB], [bx0, 10.0, yA, yS], [15.8, bx1, yA, yS]]) B.push(SA.plate([[x0, y0, bz0], [x1, y0, bz0], [x1, y1, bz0], [x0, y1, bz0]], BZ, dI));
  for (const s of [1, -1]) {
    const x0 = s > 0 ? bx1 : bx0 - 2.2, x1 = s > 0 ? bx1 + 1.9 : bx0, xo = s > 0 ? x1 : x0;
    B.push(box([x0, yN - .25, 3.0], [x1, yN, 9.6], { bottom: true }));
    B.push(panel([[xo, yN, 3.0], [xo, yN, 9.6], [xo, yN + 1.1, 9.6], [xo, yN + 1.1, 3.0]], { ds: .8 }));
    B.push(panel([[xo, yN, 9.6], [xo - s * 1.9, yN, 9.6], [xo - s * 1.9, yN + 1.1, 9.6], [xo, yN + 1.1, 9.6]], fn({ ds: .8 })));
  }
  B.push(line([[bx0 - .02, yN, bz0], [bx0 - .02, yN, bz1], [bx1 + .02, yN, bz1], [bx1 + .02, yN, bz0]], fn({ w: .22, pts: false })));
  rail(B, [[bx0, bz0], [bx0, bz1], [bx1, bz1], [bx1, bz0]], yB + 1.0);
  // midships: the uptakes' casing and the two funnels
  block([10.0, yA, -30], [15.8, yS, -8], 'ps', C, null, dI);
  roof(10.0, 15.8, -30, -8, yS, C, dI);
  // each funnel tapers, its top raked down aft, a cap band below the top, exhaust pipes through a grille
  for (const [za, zf] of [[-18.0, -12.0], [-26.0, -20.0]]) {
    const yf = yF, ya = yF - .8, ti = .45, at = (x, z) => mix(ya, yf, (z - za) / (zf - za));
    const q = [[10.5, yS, za], [15.3, yS, za], [15.3, yS, zf], [10.5, yS, zf], [10.5 + ti, ya, za + ti], [15.3 - ti, ya, za + ti], [15.3 - ti, yf, zf - ti], [10.5 + ti, yf, zf - ti]];
    C.push(hex(q, { ds: .8 }));
    const band = q.slice(4).map(p => [p[0] + (p[0] < 12.9 ? -.05 : .05), p[1] - 1.1, p[2] + (p[2] < (za + zf) / 2 ? -.05 : .05)]);
    C.push(line(band.concat([band[0]]), fn({ w: .45, pts: false })));
    C.push(panel([[11.2, at(0, za + .8) + .03, za + .8], [14.6, at(0, za + .8) + .03, za + .8], [14.6, at(0, zf - .8) + .03, zf - .8], [11.2, at(0, zf - .8) + .03, zf - .8]], fn({ pts: false, hatch: 6, al: .5 })));
    for (const x of [11.8, 12.9, 14.0]) for (const z of [za + 1.8, zf - 1.8]) C.push(lathe([x, at(x, z) - .2, z], FY, [[0, .3], [1.1, .3], [1.2, .36]], fn({ n: 10, gen: 2, rings: [1, 2] })));
  }
  // aft block, Primary Flight Control on it (sloped glazing to port, aft and forward), the aft mast's platform
  block([I.x0, yA, I.z0], [I.x1, yB, -30], 'asp', C, { a: [[.3, .7, .15, .85, 4]], p: [[.3, .7, .1, .9, 4]] }, dI);
  for (const [x0, x1, y0, y1] of [[I.x0, I.x1, yS, yB], [I.x0, 10.0, yA, yS], [15.8, I.x1, yA, yS]]) C.push(SA.plate([[x0, y0, -30], [x1, y0, -30], [x1, y1, -30], [x0, y1, -30]], FZ, dI));
  roof(12.8, I.x1, I.z0, -30, yB, C, dI);
  const pf = [[8.4, yB, -40.4], [12.8, yB, -40.4], [12.8, yB, -30.6], [8.4, yB, -30.6], [7.6, yP, -41.0], [12.8, yP, -41.0], [12.8, yP, -30.6], [7.6, yP, -30.6]];
  C.push(hex(pf, { pts: false }));
  wallW(pf[0], pf[3], pf[7], pf[4], [-1, -.3, 0], [[.18, .9, .02, .98, 7]], C, dI);
  wallW(pf[1], pf[0], pf[4], pf[5], [0, -.2, -1], [[.18, .9, .03, .97, 4]], C, dI);
  wallW(pf[3], pf[2], pf[6], pf[7], FZ, [[.2, .88, .05, .9, 4]], C, dI);
  wallW(pf[2], pf[1], pf[5], pf[6], FX, null, C, dI);
  C.push(SA.plate([pf[4], pf[5], pf[6], pf[7]], FY, dI));
  C.push(SA.plate([[8.4, yB, -40.4], [I.x0, yB, -40.4], [I.x0, yB, -30.6], [8.4, yB, -30.6]], [0, -1, 0]));
  C.push(line([[7.5, yP + 1.0, -41.1], [12.9, yP + 1.0, -41.1], [12.9, yP + 1.0, -30.5], [7.5, yP + 1.0, -30.5], [7.5, yP + 1.0, -41.1]], fn({ w: .35 })));
  for (const [x, z, h] of [[8.0, -40.6, 5], [8.0, -31.0, 4.5]]) C.push(line([[x, yP, z], [x - .6, yP + h, z]], fn({ w: .45, pts: false })));
  rail(C, [[12.8, I.z0], [I.x1, I.z0], [I.x1, -30]], yB + 1.0);
  return { A, B, C };
}
/* masts (laid out on the island): the main mast (lattice, platform with AN/SPN-43, pole with yard, URN-25 TACAN, ESM),
   the SPS-48E's pedestal ahead of it, SATCOM domes; the aft mast (tripod) under the SPS-49 */
function masts() {
  const F = [], A = [], yB = H.MAST[1], c = H.MAST, yT = 46.0;
  const LEGS = [[-1, -1], [1, -1], [1, 1], [-1, 1]], at = y => { const r = mix(2.2, 1.0, (y - yB) / (yT - yB)); return LEGS.map(([sx, sz]) => [c[0] + sx * r, y, c[2] + sz * r]); };
  const b0 = at(yB), b1 = at(yT);
  for (let k = 0; k < 4; k++) F.push(cyl(b0[k], b1[k], .28, { n: 6, gen: 0 }));
  const lv = [yB, 38.0, 42.0, yT];
  for (const y of [38.0, 42.0]) F.push(line(at(y), { closed: true, w: .6, pts: false }));
  for (let l = 0; l < 3; l++) { const P0 = at(lv[l]), P1 = at(lv[l + 1]); for (let k = 0; k < 4; k++) F.push(line([P0[k], P1[(k + 1) % 4]], fn({ w: .3, pts: false })), line([P0[(k + 1) % 4], P1[k]], fn({ w: .3, pts: false }))); }
  F.push(box([c[0] - 2.4, yT - .25, c[2] - 2.4], [c[0] + 2.4, yT + .2, c[2] + 2.4], { bottom: true }));
  F.push(line([[c[0] - 2.4, yT + 1.1, c[2] - 2.4], [c[0] + 2.4, yT + 1.1, c[2] - 2.4], [c[0] + 2.4, yT + 1.1, c[2] + 2.4], [c[0] - 2.4, yT + 1.1, c[2] + 2.4], [c[0] - 2.4, yT + 1.1, c[2] - 2.4]], fn({ w: .35 })));
  // AN/SPN-43 on the platform's aft edge: a curved reflector facing aft over its feed
  const zs = c[2] - 1.6, xs = [-2.15, -1.1, 0, 1.1, 2.15], zz = x => zs + x * x * .06;
  for (let k = 0; k < xs.length - 1; k++) F.push(panel([[c[0] + xs[k], yT + .5, zz(xs[k])], [c[0] + xs[k + 1], yT + .5, zz(xs[k + 1])], [c[0] + xs[k + 1], yT + 1.75, zz(xs[k + 1])], [c[0] + xs[k], yT + 1.75, zz(xs[k])]], { hatch: 3, ds: 1.0 }));
  F.push(box([c[0] - .3, yT + .2, zs - .9], [c[0] + .3, yT + .5, zs + .4], fn()));
  // pole mast: yard with lights, URN-25 TACAN, ESM dome, whip
  F.push(lathe([c[0], yT, c[2]], FY, [[0, .45], [3.5, .38], [8, .15]], { n: 10, gen: 3, rings: [1] }));
  F.push(cyl([c[0] - 5.2, 50.5, c[2]], [c[0] + 5.2, 50.5, c[2]], .12, { n: 6, gen: 0 }));
  for (const s of [-1, 1]) { F.push(line([[c[0] + s * 5.2, 50.5, c[2]], [c[0] + s * .35, 48.1, c[2]]], fn({ w: .35 }))); for (const x of [2.0, 3.5, 4.8]) F.push(line([[c[0] + s * x, 50.5, c[2]], [c[0] + s * x, 49.3, c[2]]], fn({ w: .45, pts: false }))); }
  F.push(lathe([c[0], 54.0, c[2]], FY, [[0, .8], [1.4, .8], [1.55, .5], [1.6, 0]], { n: 16, gen: 6, rings: [0, 1] }));
  F.push(lathe([c[0], 55.9, c[2]], FY, [[0, .38], [.28, .42], [.58, .28], [.75, 0]], { n: 12, gen: 4, rings: [1] }));
  F.push(line([[c[0], 56.6, c[2]], [c[0], 59.1, c[2]]], { w: .7 }));
  F.push(line([[c[0] - .8, 52.8, c[2]], [c[0] + .8, 52.8, c[2]]], fn({ w: .5 })), line([[c[0], 52.8, c[2] - .8], [c[0], 52.8, c[2] + .8]], fn({ w: .5 })));
  // SPS-48E pedestal on the bridge roof, its platform and rail
  const p8 = H.P48;
  F.push(box([p8[0] - 1.3, yB, p8[2] - 1.3], [p8[0] + 1.3, p8[1] - .25, p8[2] + 1.3], { ds: .8 }));
  F.push(box([p8[0] - 1.9, p8[1] - .25, p8[2] - 1.9], [p8[0] + 1.9, p8[1], p8[2] + 1.9], { bottom: true }));
  F.push(line([[p8[0] - 1.9, p8[1] + .95, p8[2] - 1.9], [p8[0] + 1.9, p8[1] + .95, p8[2] - 1.9], [p8[0] + 1.9, p8[1] + .95, p8[2] + 1.9], [p8[0] - 1.9, p8[1] + .95, p8[2] + 1.9], [p8[0] - 1.9, p8[1] + .95, p8[2] - 1.9]], fn({ w: .3 })));
  // SATCOM domes on the bridge roof, between the pedestal and the mast
  for (const x of [10.95, 14.75]) { const d = [x, yB, .8]; F.push(cyl(d, V.add(d, [0, .5, 0]), .45, { n: 8, gen: 0 })); F.push(lathe(V.add(d, [0, .5, 0]), FY, [[0, 1.0], [.6, 1.15], [1.3, 1.0], [1.85, .6], [2.1, 0]], { n: 18, gen: 6, rings: [1, 3] })); }
  // aft mast: tripod from the aft block's roof, its platform
  const p9 = H.P49;
  for (const a of [0, 2.1, 4.2]) { const dx = Math.cos(a), dz = Math.sin(a); A.push(cyl([p9[0] + dx * 2.0, yB, p9[2] + dz * 2.0], [p9[0] + dx * .55, p9[1] - .3, p9[2] + dz * .55], .24, { n: 6, gen: 0 })); }
  for (const y of [37.2, 40.2]) { const r = mix(2.0, .55, (y - yB) / (p9[1] - .3 - yB)); A.push(line([0, 2.1, 4.2].map(a => [p9[0] + Math.cos(a) * r, y, p9[2] + Math.sin(a) * r]), fn({ closed: true, w: .4, pts: false }))); }
  A.push(lathe([p9[0], p9[1] - .5, p9[2]], FY, [[0, 1.2], [.2, 1.2]], { n: 14, gen: 0, caps: true }));
  A.push(ringW([p9[0], p9[1] + .6, p9[2]], FY, 1.2, fn({ n: 14 })));
  return { F, A };
}
/* AN/SPS-48E: planar array (5.3 × 5.3 m) tilted back 15° on its rotary housing (facing +Z; the part's xf turns it) */
function sps48() {
  const c = H.P48, P = [];
  P.push(cyl(c, V.add(c, [0, .9, 0]), .6, { n: 14, gen: 0 }), box(V.add(c, [-.9, .9, -.8]), V.add(c, [.9, 1.55, .8])));
  const w = 2.65, yb = c[1] + 1.75, yt = c[1] + 7.05, zb = c[2] + .7, tl = Math.tan(15 * DEG);
  const at = (x, y, dz) => [c[0] + x, y, zb - (y - yb) * tl + (dz || 0)];
  P.push(slab2([at(-w, yb), at(w, yb), at(w, yt), at(-w, yt)], .42, { ds: .75 }));
  P.push(panel([at(-w, yb, .25), at(w, yb, .25), at(w, yt, .25), at(-w, yt, .25)], fn({ pts: false, hatch: 16, al: .4 })));
  P.push(hex([at(-w - .5, yb, .2), at(-w, yb, .2), at(-w, yb, -.25), at(-w - .5, yb, -.25), at(-w - .5, yt, .2), at(-w, yt, .2), at(-w, yt, -.25), at(-w - .5, yt, -.25)]));   // serpentine feed
  for (const x of [-1.6, 1.6]) P.push(line([at(x, yt - .6, -.3), [c[0] + x * .4, c[1] + 1.55, c[2] - .6]], { w: .5 }), line([at(x, yb + .6, -.3), [c[0] + x * .4, c[1] + 1.4, c[2] - .2]], fn({ w: .4 })));
  P.push(box(at(-w + .3, yt + .05, .05), at(w - .3, yt + .4, -.2), fn()));                       // IFF strip
  return P;
}
/* AN/SPS-49: the open-mesh reflector (7.3 × 4.3 m) and its feed on a boom */
function sps49() {
  const c = H.P49, P = [], f = 2.7, y0 = c[1] + 1.2, y1 = c[1] + 5.5, zr = c[2] + .6;
  P.push(cyl(c, V.add(c, [0, 1.0, 0]), .45, { n: 12, gen: 0 }));
  const xs = [-3.65, -2.45, -1.2, 0, 1.2, 2.45, 3.65], zz = x => zr - x * x / (4 * f);
  for (let k = 0; k < xs.length - 1; k++) { const a = xs[k], b = xs[k + 1]; P.push(panel([[c[0] + a, y0, zz(a)], [c[0] + b, y0, zz(b)], [c[0] + b, y1, zz(b)], [c[0] + a, y1, zz(a)]], { hatch: 5, ds: 1.1 })); }
  P.push(cyl([c[0] - 3.6, c[1] + 1.0, zr - 1.3], [c[0] + 3.6, c[1] + 1.0, zr - 1.3], .14, { n: 6, gen: 0 }));
  const fd = [c[0], (y0 + y1) / 2, zr + f - .4];
  P.push(box(V.add(fd, [-.35, -.3, -.25]), V.add(fd, [.35, .3, .25])));
  for (const [dx, y] of [[-1.3, y0], [1.3, y0], [0, y1]]) P.push(line([[c[0] + dx, y, zz(dx) + .05], fd], { w: .5 }));
  P.push(box([c[0] - 3.3, y1 + .1, zr - .55], [c[0] + 3.3, y1 + .4, zr - .25]));
  return P;
}
const sps48Xf = st => about(R.y(st.radar || 0), H.P48);
const sps49Xf = st => about(R.y(-(st.radar || 0) * .7 + 1.1), H.P49);

/* ---------------------------------------------------------------- self-defence, boats, anchors */
/* Mk 29 launcher (NSSM / ESSM, 8 cells): origin on its sponson, launcher toward +Z */
function mk29() {
  const P = [lathe([0, 0, 0], FY, [[0, .95], [.25, .95], [.3, .75], [1.0, .7]], { n: 18, gen: 5, rings: [0, 2] })];
  P.push(box([-1.2, .95, -.4], [1.2, 1.25, .4]));
  for (const s of [-1, 1]) P.push(box([s * 1.33 - .13, .95, -.55], [s * 1.33 + .13, 2.25, .55]));
  const L = [box([-1.12, 1.2, -2.15], [1.12, 2.7, 2.15], { bottom: true })];
  for (let i = 1; i < 4; i++) L.push(line([[-1.12 + i * .56, 1.2, 2.17], [-1.12 + i * .56, 2.7, 2.17]], fn({ w: .4, pts: false })));
  L.push(line([[-1.12, 1.95, 2.17], [1.12, 1.95, 2.17]], fn({ w: .4, pts: false })));
  return P.concat(tps(about(R.x(-18 * DEG), [0, 1.95, 0]), L));
}
/* Mk 49 RAM launcher (21 rounds): origin on its sponson, launcher toward +Z */
function mk49() {
  const P = [lathe([0, 0, 0], FY, [[0, .9], [.3, .9], [.36, .72], [.9, .66]], { n: 18, gen: 5, rings: [0, 2] })];
  P.push(box([-.95, .9, -.9], [.95, 1.5, .9]));
  for (const s of [-1, 1]) P.push(box([s * 1.03 - .13, 1.1, -.45], [s * 1.03 + .13, 2.4, .5]));
  const L = [box([-.88, 1.15, -1.3], [.88, 2.95, 1.55], { bottom: true })];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) L.push(ringW([-.66 + k * .22, 1.5 + r * .55, 1.57], FZ, .085, fn({ n: 8 })));
  return P.concat(tps(about(R.x(-12 * DEG), [0, 2.0, .1]), L));
}
/* Phalanx CIWS: origin on its mount, gun toward +Z */
function phalanx() {
  return [
    lathe([0, 0, 0], FY, [[0, .95], [.15, .95], [.22, .8], [.55, .78]], { n: 20, gen: 6 }),
    box([-.8, .55, -.42], [-.6, 1.85, .42]), box([.6, .55, -.42], [.8, 1.85, .42]),
    lathe([0, 1.9, -.3], FY, [[0, .62], [.55, .64], [1.05, .57], [1.42, .39], [1.62, .15], [1.68, 0]], { n: 20, gen: 8, rings: [0, 2, 4] }),
    box([-.56, 1.45, -.95], [.56, 1.95, .45]),
    lathe([0, 1.2, -1.05], FZ, [[0, .38], [1.4, .38]], { n: 16, gen: 4 }),
    lathe([0, 1.36, .1], FZ, [[0, .22], [.6, .2], [.68, .14], [2.1, .13]], { n: 12, gen: 3 }),
    box([-1.02, 2.0, -.25], [-.66, 2.44, .3], fn()),
  ];
}
/* weapon sponsons under the deck edge: side, z range, how far out past the deck edge */
const SPONS = [{ s: 1, z0: 86, z1: 98, out: 5.0 }, { s: -1, z0: 82, z1: 94, out: 4.8 }, { s: -1, z0: -106, z1: -94, out: 5.0 }, { s: 1, z0: ZS, z1: -116, out: 4.6 }, { s: -1, z0: ZS, z1: -116, out: 4.6 }];
function sponsons() {
  const S = [], P = [];
  for (const sp of SPONS) {
    const s = sp.s, zm = (sp.z0 + sp.z1) / 2, e = deckHalf(zm), xi = s * (hw(zm, 12.4) - .4), xo = s * (e + sp.out), yt = H.SPON_Y;
    const q = [[xi, 12.2, sp.z0], [xo, 14.4, sp.z0], [xo, 14.4, sp.z1], [xi, 12.2, sp.z1], [xi, yt, sp.z0], [xo, yt, sp.z0], [xo, yt, sp.z1], [xi, yt, sp.z1]];
    const Hh = s > 0 ? S : P;
    Hh.push(hex(q, { bottom: true, skip: [5] }));
    Hh.push(line([[s * e, yt + 1.05, sp.z0], [xo, yt + 1.05, sp.z0], [xo, yt + 1.05, sp.z1], [s * e, yt + 1.05, sp.z1]], fn({ w: .35 })));
  }
  return { S, P };
}
/* [kind, sponson (or null: the island's front), yaw deg] */
const WPN = [['nssm', 0, 45], ['ram', 1, -45], ['nssm', 2, -130], ['ram', 3, 150], ['ciws', 4, -150], ['ciws', null, 15]];
const wpnAt = w => {
  if (w[1] === null) return [12.85, 27.1, 12.3];
  const sp = SPONS[w[1]], zm = (sp.z0 + sp.z1) / 2;
  return [sp.s * (deckHalf(zm) + sp.out * .55), H.SPON_Y, zm];
};
function weapons() {
  const out = { nssm: [], ram: [], ciws: [], ciwsI: [] }, G = { nssm: mk29(), ram: mk49(), ciws: phalanx() };
  for (const w of WPN) out[w[0] === 'ciws' && w[1] === null ? 'ciwsI' : w[0]].push(...tps(X.make(R.y(w[2] * DEG), wpnAt(w)), G[w[0]]));
  return out;
}
/* 11 m RHIB: origin on the keel at mid-length, bow +Z */
function rhib() {
  const P = [];
  for (const s of [-1, 1]) { P.push(cyl([s * 1.45, .75, -5.0], [s * 1.45, .75, 2.4], .36, { n: 10, gen: 3 })); P.push(cyl([s * 1.45, .75, 2.4], [s * .15, 1.05, 5.3], .36, { n: 10, gen: 3 })); }
  P.push(hex([[-.3, 0, -5], [.3, 0, -5], [.06, .35, 5.1], [-.06, .35, 5.1], [-1.3, .7, -5], [1.3, .7, -5], [.25, .9, 5.1], [-.25, .9, 5.1]], { al: .7 }));
  P.push(box([-.5, .75, -.6], [.5, 1.8, .7], fn()));
  return P;
}
function boats() {
  const P = [], R6 = rhib();
  for (const [s, z0, z1] of H.POCK) {
    const zm = (z0 + z1) / 2, x = s * (hw(zm, 14) - 1.85);
    P.push(...tps(T3([x, H.HGR + .45, zm]), R6));
    for (const dz of [-3.0, 2.6]) P.push(box([x - 1.1, H.HGR, zm + dz - .3], [x + 1.1, H.HGR + .5, zm + dz + .3], fn()));
    // the davit's arm under the pocket's top
    P.push(line([[x - s * 1.4, H.GAL - .2, zm - 2], [x, H.GAL - .9, zm - 2], [x, H.GAL - .9, zm + 2], [x - s * 1.4, H.GAL - .2, zm + 2]], fn({ w: .45 })));
  }
  // liferaft racks under the deck edge: a platform, two tiers of four canisters
  for (const [s, z] of [[1, 36], [1, -74], [1, -96], [-1, 36], [-1, -24], [-1, -58], [-1, 62]]) {
    const e = hw(z, 15.6);
    P.push(box([Math.min(s * e, s * (e + 2.0)), 14.6, z - 3.4], [Math.max(s * e, s * (e + 2.0)), 14.85, z + 3.4], { bottom: true }));
    for (const y of [15.25, 15.9]) for (const dz of [-2.4, -.8, .8, 2.4]) P.push(lathe([s * (e + .2), y, z + dz], [s, 0, 0], [[0, .31], [1.5, .31]], fn({ n: 8, gen: 0, caps: true, rings: [0, 1], al: .6 })));
  }
  return P;
}
/* stockless bow anchors in their hawse pockets on the flare */
function anchors() {
  const P = [], AN = [box([-.28, -4.2, -.28], [.28, 0, .28]),
    hex([[-.35, -4.7, -1.7], [.35, -4.7, -1.7], [.35, -4.7, 1.7], [-.35, -4.7, 1.7], [-.3, -4.1, -1.35], [.3, -4.1, -1.35], [.3, -4.1, 1.35], [-.3, -4.1, 1.35]], { bottom: true })];
  for (const s of [-1, 1]) AN.push(hex([[-.25, -4.6, s * 1.2], [.25, -4.6, s * 1.2], [.25, -4.6, s * 1.75], [-.25, -4.6, s * 1.75], [-.15, -2.5, s * .7], [.15, -2.5, s * .7], [.15, -2.5, s * 1.0], [-.15, -2.5, s * 1.0]], { bottom: true }));
  AN.push(ringW([0, .25, 0], FX, .42, { n: 12 }));
  for (const s of [-1, 1]) {
    const z = 99, y = 8.6, x = s * (hw(z, y) + .6);
    P.push(...tps(X.make(R.mul(R.y(-s * 23 * DEG), R.z(-s * 25 * DEG)), [x, y, z]), AN));
    P.push(ringW([x - s * .3, y + .1, z], [s, .35, .45], .95, { n: 16 }));
  }
  return P;
}
/* two shafts on struts, 5-blade propellers, two rudders behind them */
function props() {
  const PR = [], RU = [], p = H.PROP;
  for (const s of [-1, 1]) {
    const x = s * p.x, c = [x, p.y, p.z];
    PR.push(lathe([x, p.y, H.SHAFT_OUT], BZ, [[0, .42], [H.SHAFT_OUT - p.z - 1.0, .42]], { n: 12, gen: 3 }));
    PR.push(lathe([x, p.y, H.SHAFT_OUT + 4], BZ, [[0, .2], [2.5, .95], [5, .78], [6.2, .45]], { n: 14, gen: 4, rings: [1, 2] }));
    PR.push(blades(c, FZ, 5, .85, p.R, { chord: .95, taper: 1.05, pitch: .42, rot: s > 0 ? 0 : .6 }));
    PR.push(lathe(V.add(c, [0, 0, 1.1]), BZ, [[0, .55], [.25, .85], [1.0, .95], [1.9, .85], [2.5, .55], [2.85, .2], [2.9, 0]], { n: 20, gen: 6, rings: [2] }));
    for (const zs of [p.z + 5.5, p.z + 17]) {
      const sc = [x, p.y, zs], xo = p.x + 2.6, xi = p.x - 2.8;
      PR.push(lathe(V.add(sc, [0, 0, .8]), BZ, [[0, .72], [1.6, .72]], { n: 14, gen: 3, caps: true }));
      PR.push(strutLeg(sc, [s * xo, bottomY(zs, xo) + .25, zs]), strutLeg(sc, [s * xi, bottomY(zs, xi) + .25, zs]));
    }
  }
  for (const s of [-1, 1]) {
    const x = s * p.x, zf = H.RUD_Z + 2.3, za = H.RUD_Z - 2.3, top = keel(H.RUD_Z) + .05, bot = -7.3;
    RU.push(hex([[x - .5, top, zf], [x + .5, top, zf], [x + .14, top, za], [x - .14, top, za], [x - .38, bot, zf - .3], [x + .38, bot, zf - .3], [x + .1, bot, za + .3], [x - .1, bot, za + .3]], { bottom: true }));
    RU.push(cyl([x, top, H.RUD_Z + .6], [x, top + 2.2, H.RUD_Z + .6], .34, { n: 10, gen: 0 }));
    RU.push(line([[x, top - .5, H.RUD_Z + .6], [x, bot + .5, H.RUD_Z + .6]], fn({ w: .35, pts: false })));
  }
  return { PR, RU };
}

/* ---------------------------------------------------------------- stern gate and well deck */
/* the gate in its closed pose: the outer face flush with the transom, the inner face (the ramp when lowered)
   toward the well; hinged at the inner face's lower edge (LHD.GATE.hinge) */
function gate() {
  const P = [], IN = [], x = 7.55, y0 = H.WY, y1 = H.WY + H.GH, z0 = ZS, z1 = WZ0;
  // the slab: wire edges; dots on the outer face, the top edge and the sides (the inner face is IN: it shows only
  // once the gate opens, since dots are not occluded and it faces into the ship while the gate is shut)
  P.push(box([-x, y0, z0], [x, y1, z1], { pts: false }));
  P.push(SA.plate([[x, y0, z0], [-x, y0, z0], [-x, y1, z0], [x, y1, z0]], BZ, { ds: .9 }), SA.plate([[-x, y1, z0], [x, y1, z0], [x, y1, z1], [-x, y1, z1]], FY, { ds: .9 }));
  for (const s of [-1, 1]) P.push(SA.plate([[s * x, y0, z0], [s * x, y0, z1], [s * x, y1, z1], [s * x, y1, z0]], [s, 0, 0], { ds: .9 }));
  for (let k = 1; k < 6; k++) { const y = y0 + k * H.GH / 6; P.push(line([[-x, y, z0 - .03], [x, y, z0 - .03]], fn({ w: .4, pts: false }))); }
  for (const xs of [-4.5, -1.5, 1.5, 4.5]) P.push(line([[xs, y0, z0 - .03], [xs, y1, z0 - .03]], fn({ w: .3, pts: false })));
  // hinge knuckles on the sill
  for (const xs of [-6, -2, 2, 6]) P.push(lathe([xs - .7, y0, z1], FX, [[0, .32], [1.4, .32]], fn({ n: 10, gen: 2, caps: true })));
  // the ramp face: its traction bars and side curbs
  IN.push(SA.plate([[-x, y0, z1], [x, y0, z1], [x, y1, z1], [-x, y1, z1]], FZ, { ds: .9 }));
  for (let k = 1; k < 14; k++) { const y = y0 + k * H.GH / 14; IN.push(line([[-x + .5, y, z1 + .03], [x - .5, y, z1 + .03]], fn({ w: .35, ds: .6 }))); }
  for (const s of [-1, 1]) IN.push(box([s * x - (s > 0 ? .35 : 0), y0, z1], [s * x + (s < 0 ? .35 : 0), y1, z1 + .3], fn({ ds: .8 })));
  return { P, IN };
}
const gateXf = st => X.pivotX(LHD.GATE.hinge, -sat(st.well || 0) * H.GOPEN);
const wellShow = st => (st.well || 0) > .02 || !!st.xray;
/* the well deck: floor, wing walls with their walkways, overhead, the forward end with the ramp up to the vehicle
   decks; the sill in the transom */
function well() {
  const P = [], y0 = H.WY, y1 = H.WTOP, x = H.WHW, za = ZS, z0 = WZ0, z1 = WZ1;
  P.push(SA.plate([[-x, y0, z0], [x, y0, z0], [x, y0, z1], [-x, y0, z1]], FY, { ds: 1.1 }));
  P.push(SA.plate([[-x, y0 - .02, za], [x, y0 - .02, za], [x, y0 - .02, z0], [-x, y0 - .02, z0]], FY, { ds: .8 }));
  P.push(SA.plate([[-x, y1, za], [x, y1, za], [x, y1, z1], [-x, y1, z1]], [0, -1, 0], { ds: 1.6 }));
  for (const s of [-1, 1]) {
    P.push(SA.plate([[s * x, y0, za], [s * x, y0, z1], [s * x, y1, z1], [s * x, y1, za]], [-s, 0, 0], { ds: 1.3 }));
    // the wing wall's walkway (a ledge above the craft's deckhouses) and its rail
    const yw = 7.4, xw = s * (x - .8);
    P.push(box([Math.min(s * x, xw), yw - .25, z0 + 2], [Math.max(s * x, xw), yw, z1 - 1], { ds: .9, bottom: true }));
    P.push(line([[xw, yw + 1.0, z0 + 2], [xw, yw + 1.0, z1 - 1]], fn({ w: .35 })));
    for (let z = z0 + 9; z < z1 - 1; z += 9) P.push(line([[s * (x - .03), y0, z], [s * (x - .03), y1, z]], fn({ w: .3, pts: false })));
    P.push(...stripe([s * 6.4, y0 + .02, z0 + 1], [s * 6.4, y0 + .02, z1 - 1], .3, { w: .35, fine: true }));
    P.push(line([[s * x, y0 + .02, z0], [s * x, y0 + .02, z1]], { w: .7, pts: false }), line([[s * x, y1 - .02, za], [s * x, y1 - .02, z1]], { w: .5, pts: false }));
  }
  for (let z = z0 + 2; z < z1 - 3; z += 6) P.push(...stripe([0, y0 + .02, z], [0, y0 + .02, z + 3], .3, { w: .35, fine: true }));
  for (let z = z0 + 4.5; z < z1; z += 9) P.push(line([[-x, y1 - .03, z], [x, y1 - .03, z]], fn({ w: .3, pts: false })));
  // the forward end: the opening to the vehicle decks, the ramp rising through it
  const xr = 3.2, yr = 6.2;
  P.push(SA.plate([[-x, y0, z1], [-xr, y0, z1], [-xr, y1, z1], [-x, y1, z1]], BZ), SA.plate([[xr, y0, z1], [x, y0, z1], [x, y1, z1], [xr, y1, z1]], BZ));
  P.push(SA.plate([[-xr, yr, z1], [xr, yr, z1], [xr, y1, z1], [-xr, y1, z1]], BZ));
  P.push(SA.fquad([[-xr, y0, z1 - .03], [xr, y0, z1 - .03], [xr, yr, z1 - .03], [-xr, yr, z1 - .03]], BZ, { al: .8 }));
  P.push(SA.plate([[-xr, y0, z1], [xr, y0, z1], [xr, y0 + 4.2, z1 + 16], [-xr, y0 + 4.2, z1 + 16]], [0, 1, -.3], { ds: 1.0 }));
  P.push(line([[-x, y0 + .02, z1], [x, y0 + .02, z1]], { w: .6, pts: false }), line([[-x, y1 - .02, z1], [x, y1 - .02, z1]], { w: .5, pts: false }));
  return P;
}

/* ---------------------------------------------------------------- the interior (cutaway): closed volumes */
function interior() {
  const HG = [], VD = [], BT = [], MM = [], SH = [], hx = 14.6, h0 = H.HGR, h1 = H.HTOP - .1, hz0 = -84, hz1 = 14;
  // hangar: its deck, the walls (openings to the elevators), a fire curtain
  HG.push(box([-hx, h0 - .3, hz0], [hx, h0, hz1], { ds: 1.5 }));
  for (const s of [-1, 1]) {
    const e = H.ELEV.find(q => q[0] === s), sw = [hz0, e[1], e[2], hz1];
    for (let i = 0; i < sw.length - 1; i += 2) HG.push(SA.plate([[s * hx, h0, sw[i]], [s * hx, h0, sw[i + 1]], [s * hx, h1, sw[i + 1]], [s * hx, h1, sw[i]]], [-s, 0, 0], { ds: 2.6 }));
  }
  for (const [z, nz] of [[hz0, FZ], [hz1, BZ]]) HG.push(SA.plate([[-hx, h0, z], [hx, h0, z], [hx, h1, z], [-hx, h1, z]], nz, { ds: 2.6 }));
  HG.push(panel([[-hx, h0, -38], [hx, h0, -38], [hx, h1, -38], [-hx, h1, -38]], { hatch: 6, ds: 2.0 }));
  HG.push(line([[-hx, h1, hz0], [-hx, h1, hz1], [hx, h1, hz1], [hx, h1, hz0]], { closed: true, w: .5, ds: .5 }));
  HG.push(line([[-hx, h0 + .05, hz0], [-hx, h0 + .05, hz1], [hx, h0 + .05, hz1], [hx, h0 + .05, hz0]], { closed: true, w: .5, ds: .5 }));
  // vehicle decks: lower (the well deck's level) and upper, the ramp between them
  for (const [y0, y1] of [[H.WY, 5.6], [5.9, 10.6]]) volume([-10.5, y0, WZ1], [10.5, y1, 8], VD, 2.4);
  VD.push(SA.plate([[-2, H.WY, -22], [2, H.WY, -22], [2, 5.9, -4], [-2, 5.9, -4]], [0, 1, -.3], { ds: 1.2 }));
  for (const x of [-2, 2]) VD.push(line([[x, H.WY, -22], [x, 5.9, -4]], { w: .5, ds: .5 }));
  // troop berthing forward, two decks
  volume([-12.5, H.WY, 14], [12.5, 10.6, 64], BT, 2.6);
  BT.push(line([[-12.53, 5.8, 14], [-12.53, 5.8, 64], [12.53, 5.8, 64], [12.53, 5.8, 14]], fn({ w: .3, pts: false })));
  // main machinery: two rooms (a boiler and a geared turbine each), the shafts aft to where they leave the hull
  for (const [z0, z1] of [[-40, -19], [-17, 4]]) { volume([-12.5, -6.6, z0], [12.5, .6, z1], MM, 2.2); MM.push(line([[-12.53, -3, z0], [-12.53, -3, z1], [12.53, -3, z1], [12.53, -3, z0]], fn({ w: .3, pts: false }))); }
  for (const s of [-1, 1]) {
    const a = [s * H.PROP.x, H.PROP.y, -36], b = [s * H.PROP.x, H.PROP.y, H.SHAFT_OUT];
    SH.push(cyl(a, b, .42, { n: 12, gen: 3, ds: 1.8 }));
    SH.push(lathe(V.add(a, [0, 0, -1.5]), BZ, [[0, 1.0], [2.2, 1.0]], { n: 14, gen: 3, caps: true, ds: 1.2 }));
  }
  return { HG, VD, BT, MM, SH };
}

/* ---------------------------------------------------------------- assembly */
const LHD_GEO = memo(() => {
  const ha = hullAbove(), hb = hullBelow(), sp = sponsons(), is = island(), ms = masts(), wp = weapons(), pr = props(), gt = gate();
  return {
    HUS: ha.S.concat(sp.S), HUP: ha.P.concat(sp.P), BLS: hb.S, BLP: hb.P, BULB: hb.BULB,
    DK: flightDeck(), ELP: elevator(-1, H.ELEV[0][1], H.ELEV[0][2]), ELS: elevator(1, H.ELEV[1][1], H.ELEV[1][2]),
    ISA: is.A, ISB: is.B, ISC: is.C, MF: ms.F, MA: ms.A, R48: sps48(), R49: sps49(),
    NS: wp.nssm, RA: wp.ram, CI: wp.ciws, CII: wp.ciwsI, BO: boats(), AN: anchors(), PR: pr.PR, RU: pr.RU, GT: gt.P, GTI: gt.IN, WL: well(),
  };
});
const LHD_IN = memo(interior);

/* the rest of the anchors: elevators, hangar, island, radars, weapons, the gate's top edge for a well state */
Object.assign(LHD, {
  deckHalf, ELEV: H.ELEV.map(([s, z0, z1]) => ({ side: s, z0, z1, x0: s * H.W, x1: s * (H.W + H.EL_OUT) })),
  HANGAR: { y: H.HGR, top: H.HTOP - .1, x: 14.6, z0: -84, z1: 14 }, VEHICLE: { y: [H.WY, 5.9], x: 10.5, z0: WZ1, z1: 8 },
  ISLAND: H.ISL, SPS48: H.P48.slice(), SPS49: H.P49.slice(), mastTop: [H.MAST[0], 59.1, H.MAST[2]],
  bridge: [12.9, 32.2, 10.5], priFly: [8.0, 35.6, -35.8],
  weapons: WPN.map(w => ({ kind: w[0], at: wpnAt(w), yaw: w[2] * DEG })),
  PROPS: [-1, 1].map(s => [s * H.PROP.x, H.PROP.y, H.PROP.z]),
  // MH-60Rs in the hangar (x, z; nose +Z) and ACVs on the vehicle decks (x, y, z) for the X-ray
  HELO_IN: [[-7, 3], [7, -18], [-7, -39], [7, -60]],
  ACV_IN: [...[-40, -29, -18, -7].flatMap(z => [[-4.2, H.WY, z], [4.2, H.WY, z]]), ...[-38, -27, -16].flatMap(z => [[-4.2, 5.9, z], [4.2, 5.9, z]])],
  gateXf, gateTip: st => X.ap(gateXf(st || {}), [0, H.WY + H.GH, WZ0]),
});

function lhd() {
  const g = LHD_GEO();
  return {
    name: 'lhd', L: LHD.L, B: LHD.B, D: LHD.T, DECK_Y: DECK, A: LHD,
    parts: [
      { name: 'hull', label: 'Hull · LHD-1 Wasp class', prims: g.HUS.concat(g.HUP) },
      { name: 'below', label: 'Underwater hull · bulbous bow', prims: g.BLS.concat(g.BLP, g.BULB) },
      { name: 'props', label: 'Shafts ×2 · 5-blade propellers · rudders ×2', prims: g.PR.concat(g.RU) },
      { name: 'deck', label: 'Flight deck · 9 landing spots', prims: g.DK },
      { name: 'elevP', label: 'Deck-edge elevator · port', prims: g.ELP, xf: elevXf('elevP') },
      { name: 'elevS', label: 'Deck-edge elevator · starboard', prims: g.ELS, xf: elevXf('elevS') },
      { name: 'island', label: 'Island · bridges · Pri-Fly', prims: g.ISA.concat(g.ISB, g.ISC) },
      { name: 'mast', label: 'Masts · URN-25 TACAN · AN/SPN-43 · SATCOM', prims: g.MF.concat(g.MA) },
      { name: 'sps48', label: 'AN/SPS-48E · 3-D air search', prims: g.R48, xf: sps48Xf },
      { name: 'sps49', label: 'AN/SPS-49 · 2-D air search', prims: g.R49, xf: sps49Xf },
      { name: 'nssm', label: 'Mk 29 · NSSM ×2', prims: g.NS },
      { name: 'ram', label: 'Mk 49 RAM ×2', prims: g.RA },
      { name: 'ciws', label: 'Phalanx CIWS ×2', prims: g.CI.concat(g.CII) },
      { name: 'boats', label: 'Boats · liferaft racks', prims: g.BO },
      { name: 'anchors', label: 'Anchors ×2', prims: g.AN },
      { name: 'gate', label: 'Stern gate', prims: g.GT, xf: gateXf },
      { name: 'gateIn', label: 'Stern gate · ramp face', prims: g.GTI, xf: gateXf, show: wellShow },
      { name: 'well', label: 'Well deck · 81 × 15.2 m', prims: g.WL, show: wellShow },
    ],
  };
}
lhd.DECK_Y = DECK; lhd.A = LHD;
/* cutaway: the unit model re-partitioned for the exploded view (island by levels, radars and masts apart, the hull in
   bow, midbody and stern, the gate apart) plus the interior volumes (they show with st.xray) */
function lhdCut() {
  const g = LHD_GEO(), I = LHD_IN(), Hs = { bow: [], mid: [], stern: [] };
  for (const pr of g.HUS.concat(g.HUP, g.BLS, g.BLP)) { const z = bboxC(pr)[2]; Hs[z > 72 ? 'bow' : z < -92 ? 'stern' : 'mid'].push(pr); }
  return {
    name: 'lhd_cut', L: LHD.L, B: LHD.B, D: LHD.T, DECK_Y: DECK, A: LHD,
    parts: [
      { name: 'radar48', label: 'AN/SPS-48E · 3-D air search', prims: g.R48, xf: sps48Xf },
      { name: 'radar49', label: 'AN/SPS-49 · 2-D air search', prims: g.R49, xf: sps49Xf },
      { name: 'mastF', label: 'Main mast · URN-25 TACAN · AN/SPN-43 · SATCOM', prims: g.MF },
      { name: 'mastA', label: 'Aft mast', prims: g.MA },
      { name: 'islandAft', label: 'Primary Flight Control · uptakes ×2', prims: g.ISC },
      { name: 'islandBridge', label: 'Navigation bridge · flag bridge', prims: g.ISB },
      { name: 'islandBase', label: 'Island · lower levels', prims: g.ISA },
      { name: 'ciwsI', label: 'Phalanx CIWS · island', prims: g.CII },
      { name: 'elevS', label: 'Deck-edge elevator · starboard', prims: g.ELS, xf: elevXf('elevS') },
      { name: 'elevP', label: 'Deck-edge elevator · port', prims: g.ELP, xf: elevXf('elevP') },
      { name: 'deck', label: 'Flight deck · 9 landing spots', prims: g.DK },
      { name: 'nssm', label: 'Mk 29 · NSSM ×2', prims: g.NS },
      { name: 'ram', label: 'Mk 49 RAM ×2', prims: g.RA },
      { name: 'ciws', label: 'Phalanx CIWS · stern', prims: g.CI },
      { name: 'boats', label: 'Boats · liferaft racks', prims: g.BO },
      { name: 'gate', label: 'Stern gate', prims: g.GT, xf: gateXf },
      { name: 'gateIn', label: 'Stern gate · ramp face', prims: g.GTI, xf: gateXf, show: wellShow },
      O({ name: 'hangar', label: 'Hangar deck', prims: I.HG }, hidden),
      O({ name: 'vehicle', label: 'Vehicle decks ×2', prims: I.VD }, hidden),
      O({ name: 'well', label: 'Well deck · 81 × 15.2 m', prims: g.WL }, hidden, { show: wellShow }),
      O({ name: 'berthing', label: 'Troop berthing', prims: I.BT }, hidden),
      O({ name: 'machinery', label: 'Main machinery rooms ×2', prims: I.MM }, hidden),
      O({ name: 'shaftsIn', label: 'Shaft lines ×2 · thrust bearings', prims: I.SH }, hidden),
      { name: 'props', label: 'Shafts ×2 · 5-blade propellers', prims: g.PR },
      { name: 'rudders', label: 'Rudders ×2', prims: g.RU },
      { name: 'anchors', label: 'Anchors ×2', prims: g.AN },
      { name: 'hullBow', label: 'Bow · bulbous bow', prims: Hs.bow.concat(g.BULB) },
      { name: 'hullMid', label: 'Hull · midbody', prims: Hs.mid },
      { name: 'hullStern', label: 'Stern · transom', prims: Hs.stern },
    ],
  };
}
export { lhd, lhdCut };

export const LHD_STATES = { lhd: { well: [0, 1, 0], radar: [-PI, PI, 0], elevP: [0, 1, 0], elevS: [0, 1, 0] } };
export const LHD_INFO = { lhd: { name: 'LHD-1 Wasp class', kind: 'unit', size: [257.3, 53.1, 59.1], s: [.33, .85, 2.2] } };
const E = (id, parts, label, size, explode, w0, cls, more) => Object.assign({ id, parts, label, size: size || '', explode, w0, cls }, more || {});
export const LHD_ANATOMY = {
  lhd: {
    model: 'lhd_cut', frame: 'hull', title: 'LHD-1 · Wasp class', size: '257.3 × 31.8 m · draught 8.1 m',
    note: 'Amphibious assault ship: a full-length flight deck with nine landing spots, a hangar and vehicle decks, and a stern well deck for three LCACs behind a bottom-hinged gate; two boilers, two geared steam turbines, two shafts.',
    st: { well: 1, radar: .6 }, view: { yaw: -1.15, pitch: .28 },
    parts: [
      // the island comes apart first, the radars highest; then what stands on the deck, then the deck lifts off
      E('01', ['radar48'], 'AN/SPS-48E · 3-D air search', '', [0, 84, 8], 0, 'part', { side: 'R' }),
      E('02', ['radar49'], 'AN/SPS-49 · 2-D air search', '', [0, 80, -8], .02, 'part', { side: 'R' }),
      E('03', ['mastF'], 'Main mast · URN-25 TACAN · AN/SPN-43', '', [0, 72, 0], .05, 'part', { side: 'R' }),
      E(null, ['mastA'], 'Aft mast', '', [0, 72, 0], .06, 'part'),
      E('04', ['islandAft'], 'Primary Flight Control · uptakes ×2', '', [0, 62, 0], .09, 'shell', { side: 'L' }),
      E('05', ['islandBridge'], 'Navigation bridge · flag bridge', '', [0, 62, 0], .1, 'shell', { side: 'R' }),
      E('06', ['islandBase', 'ciwsI'], 'Island · lower levels', '', [0, 54, 0], .13, 'shell', { side: 'R' }),
      E('07', ['elevS'], 'Deck-edge elevators ×2', '', [9, 40, 0], .17, 'part', { side: 'R' }),
      E(null, ['elevP'], 'Deck-edge elevator · port', '', [-9, 40, 0], .17, 'part'),
      E('08', ['deck'], 'Flight deck · 9 landing spots', '257.3 × 32.3 m', [0, 40, 0], .2, 'shell', { side: 'L' }),
      E('09', ['nssm', 'ram'], 'Mk 29 NSSM ×2 · Mk 49 RAM ×2', '', [0, 40, 0], .23, 'part', { side: 'L' }),
      E('10', ['ciws'], 'Phalanx CIWS ×2', '20 mm', [0, 40, 0], .24, 'part', { side: 'R' }),
      E('11', ['boats'], 'Boats · liferaft racks', '', [0, 14, 0], .26, 'part', { side: 'L' }),
      E('12', ['gate', 'gateIn'], 'Stern gate · bottom-hinged', '15.2 m', [0, 0, -40], .28, 'part', { side: 'L' }),
      // the interior rises out of the hull, the hull splits last
      E('13', ['hangar'], 'Hangar deck · 2 elevators', '', [0, 28, 0], .32, 'part', { side: 'L' }),
      E('14', ['vehicle'], 'Vehicle decks ×2', '1 900 m²', [0, 16, 0], .35, 'part', { side: 'R' }),
      E('15', ['well'], 'Well deck · 3 LCAC', '81 × 15.2 m', [0, 16, -30], .36, 'part', { side: 'L' }),
      E('16', ['berthing'], 'Troop berthing', '1 687 troops', [0, 16, 30], .38, 'part', { side: 'R' }),
      E('17', ['machinery'], 'Boilers ×2 · geared steam turbines ×2', '70 000 shp', [0, 8, 0], .4, 'part', { side: 'R' }),
      E('18', ['props', 'shaftsIn'], 'Shafts ×2 · 5-blade propellers', 'Ø 6.4 m', [0, -14, -30], .45, 'part', { side: 'L' }),
      E(null, ['rudders'], 'Rudders ×2', '', [0, -10, -38], .47, 'part'),
      E('19', ['anchors'], 'Anchors ×2', '', [0, 4, 38], .49, 'part', { side: 'R' }),
      E('20', ['hullMid'], 'Hull · midbody', '31.8 m beam', [0, 0, 0], .54, 'shell', { side: 'R' }),
      E('21', ['hullBow'], 'Bow · bulbous bow', '', [0, 0, 30], .52, 'shell', { side: 'R' }),
      E('22', ['hullStern'], 'Stern · transom', '', [0, 0, -30], .52, 'shell', { side: 'L' }),
    ],
    // what the X-ray finds: three LCACs in the well, MH-60Rs in the hangar, ACVs on the vehicle decks
    xray: [
      { id: 'LC', label: 'LCAC ×3 · in the well deck', model: 'lcac', st: { cushion: 0 }, parent: 'well', inst: () => LHD.SLOTS.map(p => T3(p)) },
      { id: 'HH', label: 'MH-60R ×4 · in the hangar', model: 'helo', st: { droop: 1, fold: 1 }, parent: 'hangar', inst: () => LHD.HELO_IN.map(([x, z]) => T3([x, H.HGR, z])) },
      { id: 'AV', label: 'ACV ×14 · on the vehicle decks', model: 'acv', st: {}, parent: 'vehicle', inst: () => LHD.ACV_IN.map(p => T3(p)) },
    ],
  },
};
