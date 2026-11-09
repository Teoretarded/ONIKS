/* ONIKS · amphibious small craft and vehicles, in the GEO / HD part format (see models.js; reference/films/_brief/models.txt).
   Public-reference level only: external shapes, designations, true sizes. The Kornet round is a closed shell.

   Exports
     lcac() lcacCut()       LCAC-1 class landing craft air cushion (keys 'lcac', 'lcac_cut')
     acv() acvCut()         ACV-1.1 amphibious combat vehicle 8×8 (keys 'acv', 'acv_cut')
     kornet() kornetCut()   Kornet-EM combat vehicle on the GAZ-233014 Tigr-M 4×4 (keys 'kornet', 'kornet_cut')
     kornetMsl()            9M133 Kornet round, closed shell (key 'kornet_msl')
     LCAC ACV KORNET        anchors (vehicle frame: metres, origin on the ground / water surface under the centre,
                            +Z forward, +Y up, +X right / starboard)
     AMPHIB_INFO AMPHIB_STATES AMPHIB_ANATOMY   entries merged into MODEL_INFO / MODEL_STATES / ANATOMY
   states: lcac   prop (rad, both propellers) fan (rad, the four lift fans) cushion (0 resting on its pads, skirt slack ..
                  1 on cushion: the craft raised LCAC.LIFT, skirt inflated; MODEL_STATES default 1, undefined reads 0)
                  rampB rampS (0 up .. 1 lowered to the ground; the bow ramp's extension unfolds on the way down)
                  rudder (rad, the four rudders) thrust (rad, the bow thrusters' swivel; 0 = nozzles aft)
           acv    wheel (rad) yaw pitch (RWS, rad) ramp (0 shut .. 1 down) prop (rad, the two water propellers)
           kornet wheel (rad) up (0 stowed, roof flush .. 1 both launch units raised) yaw pitch (rad, both units; they
                  turn and elevate only once raised)
           kornet_msl fin (0 folded round the body .. 1 open)
   The Kornet-EM carries TWO launch units side by side (as built on the Tigr-M): each a sighting / guidance unit under a
   pack of four 9M133 containers (2 × 2) and a flat cover plate that closes the roof opening when the unit is lowered.
   Parts are rigid (xf) where they move rigidly; dyn only for the LCAC skirt, the wheels and the Kornet fins. */
const M3 = window.M3, GEO = window.GEO, HD = window.HD;
const { V, R, X } = M3;
const { hex, box, lathe, cyl, panel, line, blades } = GEO;
const SA = HD.seaAir;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const FX = [1, 0, 0], FY = [0, 1, 0], FZ = [0, 0, 1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const T3 = p => X.make(R.I(), p);
const memo = f => { let c = null; return () => c || (c = f()); };
const tp = HD.tp, tps = (T, L) => L.map(pr => tp(T, pr));
const about = HD.about, ringW = HD.ring, circle = HD.circle;
const avg = P => V.mul(P.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / P.length);
const hidden = { inside: true, show: st => !!st.xray };

/* ---------------------------------------------------------------- helpers */
const bx8 = (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
/* point on face f of an 8-point hex at (u, v): u runs corner 0 -> 1 of the face, v corner 0 -> 3 */
function fpt(P, f, u, v) { const [a, b, c, d] = FACES[f].map(i => P[i]); return V.lerp(V.lerp(a, b, u), V.lerp(d, c, u), v); }
function fnorm(P, f) {
  const [a, b, c, d] = FACES[f].map(i => P[i]);
  let n = V.cross(V.sub(b, a), V.sub(d, a)); if (V.len(n) < 1e-9) n = V.cross(V.sub(c, b), V.sub(d, b));
  n = V.norm(n); if (V.dot(n, V.sub(avg([a, b, c, d]), avg(P))) < 0) n = V.mul(n, -1); return n;
}
/* outline on a hex face (windows, doors, hatches): facing-aware in wire, not sampled */
function fwin(P, f, u0, u1, v0, v1, o) {
  const n = fnorm(P, f), lift = (o && o.lift) || .012;
  return SA.fquad([[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => V.mad(fpt(P, f, u, v), n, lift)), n, o);
}
/* a hex face sampled round holes (glazing, intakes, outlets: the lidar sees into them): dot plates round the holes,
   the hole outlines in wire. holes [[u0, u1, v0, v1, opts?]]. Skip face f in the hex itself. */
function holed(P, f, holes, o) {
  const us = [0, 1], vs = [0, 1];
  for (const h of holes) { us.push(h[0], h[1]); vs.push(h[2], h[3]); }
  const U = [...new Set(us)].sort((a, b) => a - b), W = [...new Set(vs)].sort((a, b) => a - b), n = fnorm(P, f), out = [];
  for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < W.length - 1; j++) {
    if (U[i + 1] - U[i] < 1e-4 || W[j + 1] - W[j] < 1e-4) continue;
    const um = (U[i] + U[i + 1]) / 2, vm = (W[j] + W[j + 1]) / 2;
    if (holes.some(h => um > h[0] && um < h[1] && vm > h[2] && vm < h[3])) continue;
    out.push(SA.plate([fpt(P, f, U[i], W[j]), fpt(P, f, U[i + 1], W[j]), fpt(P, f, U[i + 1], W[j + 1]), fpt(P, f, U[i], W[j + 1])], n, o));
  }
  for (const h of holes) out.push(fwin(P, f, h[0], h[1], h[2], h[3], O({ al: .9 }, h[4] || {})));
  return out;
}
/* a hex with some faces replaced by holed plates: faces { f: holes } */
function hexHoled(P, faces, o) {
  const skip = Object.keys(faces).map(Number), out = [hex(P, O(o, { skip: (o && o.skip || []).concat(skip) }))];
  for (const f of skip) out.push(...holed(P, f, faces[f], o && o.fine ? { fine: true } : undefined));
  return out;
}
/* facing-aware polyline with a fixed (or per-segment) normal */
function fpath(P, n, o, closed) {
  const out = [], m = closed ? P.length : P.length - 1;
  for (let i = 0; i < m; i++) { const a = P[i], b = P[(i + 1) % P.length]; out.push(SA.fl(a, b, typeof n === 'function' ? n(i, a, b) : n, o)); }
  return out;
}
/* loft between cross-sections S[i] (same point count, open profiles): dot plates with the given outward direction
   per profile segment (nrm[j] for segment j -> j + 1), facing-aware hairlines along chosen profile points (lines) and
   round chosen sections (rings) */
function loftN(S, nrm, o) {
  o = o || {};
  const out = [], ns = S.length, N = S[0].length;
  for (let i = 0; i < ns - 1; i++) for (let j = 0; j < N - 1; j++) {
    const q = [S[i][j], S[i][j + 1], S[i + 1][j + 1], S[i + 1][j]];
    if (V.dist(q[0], q[1]) < 2e-3 && V.dist(q[2], q[3]) < 2e-3) continue;
    if (V.dist(q[0], q[3]) < 2e-3 && V.dist(q[1], q[2]) < 2e-3) continue;
    out.push(SA.plate(q, nrm[j], { ds: o.ds }));
  }
  const nAt = j => V.norm(V.add(nrm[Math.max(0, j - 1)], nrm[Math.min(N - 2, j)]));
  for (const j of o.lines || []) for (let i = 0; i < ns - 1; i++) if (V.dist(S[i][j], S[i + 1][j]) > 1e-3) out.push(SA.fl(S[i][j], S[i + 1][j], nAt(j), { al: o.al === undefined ? 1 : o.al, fine: o.fineLines }));
  for (const i of o.rings || []) for (let j = 0; j < N - 1; j++) if (V.dist(S[i][j], S[i][j + 1]) > 1e-3) out.push(SA.fl(S[i][j], S[i][j + 1], nrm[j], { al: o.ral === undefined ? .6 : o.ral, fine: o.fineRings }));
  return out;
}
/* radial strut (box) in a plane z0..z1 around an axis point c (axis Z), at angle a, from radius r0 to r1, half width t */
function radial(c, a, r0, r1, z0, z1, t, o) {
  const u = [Math.cos(a), Math.sin(a), 0], w = [-Math.sin(a), Math.cos(a), 0];
  const p = (r, s, z) => [c[0] + u[0] * r + w[0] * s, c[1] + u[1] * r + w[1] * s, z];
  return hex([p(r0, -t, z0), p(r1, -t, z0), p(r1, -t, z1), p(r0, -t, z1), p(r0, t, z0), p(r1, t, z0), p(r1, t, z1), p(r0, t, z1)], o);
}
/* thin slab from a planar quad, both faces sampled */
function slab(q, th, o) {
  const n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]))), t = Array.isArray(th) ? th : [th, th, th, th];
  return hex([...q.map((p, i) => V.mad(p, n, -t[i] / 2)), ...q.map((p, i) => V.mad(p, n, t[i] / 2))], O({ skip: [2, 3, 4, 5], bottom: true }, o));
}
const wheelSide = (axles, side, rot, o) => { const P = []; for (const z of axles) HD.wheel(P, z, side, O(o, { rot })); return P; };

/* ================================================================ LCAC · landing craft air cushion (LCAC-1 class)
   26.8 × 14.3 m on cushion (24.7 × 13.1 m resting), 7.1 m tall on cushion. A buoyancy box with a bag-and-finger skirt
   all round (1.5 m); the cargo deck (20.4 × 8.2 m, 168 m²) runs through between two side structures that house the four
   TF40B gas turbines, the four lift fans and the propeller drives; the operator's control cab on the starboard side
   structure forward, the port cabin (deck crew, troops) opposite; two swivelling bow thrusters; two 4-blade reversible-
   pitch propellers (Ø 3.58 m) in shrouds aft, each with twin rudders; bow ramp 8.8 m wide (folding extension), stern
   ramp 4.6 m. Craft frame: origin on the surface under the centre, bow +Z; the hull parts ride up LIFT with the cushion. */
const LC = {
  LIFT: 1.2, HX: 6.0, HZ: 11.6, CB: 1.6, CS: .7, YB: .2, YD: 1.1, YS: 3.6,
  XI: 4.1, XO: 6.0, ZA: -11.0, ZP: -8.9, ZE: 10.0, ZF: 10.3, YP: 2.0,
  DX: 5.0, DY: 4.0, DZ0: -11.35, DZ1: -9.4, PZ: -10.45, RO: 1.9, RI: 1.82, RP: 1.79,
  RUD: { dx: .9, zh: -11.62, z0: -11.44, z1: -12.36, y0: 2.47, y1: 5.53 },
  FANS: [.9, -4.5], XC: 5.05, FAN_Y: 3.18, THZ: 4.4, EXH: [-7.75, -2.05],
  CAB: [6.4, 10.0, 1.8], PCAB: [6.9, 10.0, 1.3],
  RB: { z: 11.6, hw: 4.4, L1: 1.9, L2: 1.8, th: .2 }, RS: { z: -11.6, hw: 2.3, L: 2.8, th: .18 },
};
const lcC = st => sat((st && st.cushion) || 0);
const lcY = st => LC.LIFT * lcC(st);
const lcLift = st => T3([0, lcY(st), 0]);
const lcRampB = st => { const h = LC.YD + lcY(st); return { up: PI / 2, down: -Math.asin(Math.min(1, h / (LC.RB.L1 + LC.RB.L2))), k: sat(st && st.rampB || 0) }; };
const lcRampS = st => { const h = LC.YD + lcY(st); return { up: 96 * DEG, down: -Math.asin(Math.min(1, h / LC.RS.L)), k: sat(st && st.rampS || 0) }; };
/* main bow ramp: flat pose along +Z from the hinge, turned up by th (rad) about the hinge line */
const lcRampBXf = st => { const r = lcRampB(st), th = mix(r.up, r.down, r.k); return X.mul(lcLift(st), X.pivotX([0, LC.YD, LC.RB.z], -th)); };
/* the extension: folded 180° back onto the main ramp's driving face when up, straight when down */
const lcFlapXf = st => { const r = lcRampB(st), f = mix(PI, 0, ss(0, .75, r.k)); return X.mul(lcRampBXf(st), X.pivotX([0, LC.YD, LC.RB.z + LC.RB.L1], -f)); };
const lcRampSXf = st => { const r = lcRampS(st), th = mix(r.up, r.down, r.k); return X.mul(lcLift(st), X.pivotX([0, LC.YD, LC.RS.z], th)); };
/* the ramp lip (craft frame) for a state: which 'b' bow (the extension's lip) or 's' stern */
function lcLip(st, which) {
  st = st || {};
  if (which === 's') return X.ap(lcRampSXf(st), [0, LC.YD, LC.RS.z - LC.RS.L]);
  return X.ap(lcFlapXf(st), [0, LC.YD, LC.RB.z + LC.RB.L1 + LC.RB.L2]);
}
export const LCAC = {
  L: 26.8, B: 14.3, H: 7.1, LIFT: LC.LIFT,
  // cargo deck height (craft frame) for a cushion state 0..1 (cushion undefined = 0, resting)
  deckY: st => LC.YD + lcY(st),
  // vehicle stowage on the cargo deck: [x, z] of each vehicle's origin (bow first; an ACV is 8.9 m long)
  SLOTS: [[0, 4.85], [0, -4.85]],
  // propeller hub centres on cushion (port, starboard)
  PROPS: [[-LC.DX, LC.DY + LC.LIFT, LC.PZ], [LC.DX, LC.DY + LC.LIFT, LC.PZ]],
  // z of the bow ramp's lip lowered to the ground off cushion, and of the stern ramp's lip lowered (off cushion)
  BOW: 15.13, STERN: -14.18,
  // the lip of a ramp for any state: lip(st, 'b' | 's') -> [x, y, z]
  lip: lcLip,
  // cargo deck: half width, z extent between the ramps' hinges; the ramps' hinge lines (z) and widths
  DECK: { hw: 4.1, z0: -11.6, z1: 11.6 }, RAMP_B: { z: LC.RB.z, w: 8.8, L: LC.RB.L1 + LC.RB.L2 }, RAMP_S: { z: LC.RS.z, w: 4.6, L: LC.RS.L },
};

/* the hull's plan: an octagon (chamfered bow and stern corners), CCW seen from above */
const LC_OCT = [[LC.HX, -LC.HZ + LC.CS], [LC.HX, LC.HZ - LC.CB], [LC.HX - LC.CB, LC.HZ], [-LC.HX + LC.CB, LC.HZ], [-LC.HX, LC.HZ - LC.CB], [-LC.HX, -LC.HZ + LC.CS], [-LC.HX + LC.CS, -LC.HZ], [LC.HX - LC.CS, -LC.HZ]];
/* periphery samples (spacing ~ds) with smoothed outward normals and the 'end-ness' (0 sides .. 1 bow / stern) */
const LC_RIM = memo(() => {
  const P = [], N = [], ds = .5;
  for (let k = 0; k < 8; k++) {
    const a = LC_OCT[k], b = LC_OCT[(k + 1) % 8], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / ds));
    const nr = [(b[1] - a[1]) / L, 0, -(b[0] - a[0]) / L];
    for (let i = 0; i < n; i++) { const t = i / n; P.push([mix(a[0], b[0], t), mix(a[1], b[1], t)]); N.push(nr); }
  }
  const M = P.length, NS = [], S = [0];
  for (let i = 0; i < M; i++) { let s = [0, 0, 0]; for (let k = -3; k <= 3; k++) s = V.add(s, V.mul(N[(i + k + M) % M], 1 - Math.abs(k) / 4)); NS.push(V.norm(s)); }
  for (let i = 1; i <= M; i++) S.push(S[i - 1] + Math.hypot(P[i % M][0] - P[i - 1][0], P[i % M][1] - P[i - 1][1]));
  return { P, N: NS, S, M, E: NS.map(n => Math.pow(Math.abs(n[2]), 1.5)) };
});
/* bag profiles relative to the gunwale attachment [out, dy]: inflated (on cushion) and slack (resting) */
const BAG_ON = [[0, 0], [.46, -.08], [.86, -.33], [1.1, -.7], [1.15, -1.08], [1.05, -1.4]];
const BAG_OFF = [[0, 0], [.22, -.06], [.38, -.24], [.47, -.46], [.52, -.66], [.5, -.8]];
function lcSkirt(st) {
  const c = lcC(st), k = ss(0, 1, c), g = LC.YD - .1 + LC.LIFT * c, rim = LC_RIM(), out = [];
  const endS = mix(1.4, 1.56, k);
  const prof = i => {
    const p = rim.P[i % rim.M], n = rim.N[i % rim.M], e = rim.E[i % rim.M], sc = mix(1, endS, e), s = rim.S[i];
    return BAG_ON.map((q, j) => {
      const w = (1 - k) * (.045 * Math.sin(s * 2.7 + j * .9) + .025 * Math.sin(s * 6.1)) * (j / 5);
      const o = (mix(BAG_OFF[j][0], q[0], k) + w) * sc, y = g + mix(BAG_OFF[j][1], q[1], k) + (1 - k) * .02 * Math.sin(s * 3.3) * j / 5;
      return [p[0] + n[0] * o, y, p[1] + n[2] * o];
    });
  };
  const S = [];
  for (let i = 0; i <= rim.M; i++) S.push(prof(i));
  // the bag: outward normals per profile segment are taken per quad from the section geometry (plate flips to `out`)
  const nrmAt = (i, j) => { const n = rim.N[i % rim.M]; return V.norm([n[0], [.9, .6, .2, -.2, -.6][j], n[2]]); };
  const bo = { ds: 1.25 };
  for (let i = 0; i < rim.M; i++) for (let j = 0; j < 5; j++) out.push(SA.plate([S[i][j], S[i][j + 1], S[i + 1][j + 1], S[i + 1][j]], nrmAt(i, j), bo));
  // hairlines (facing-aware, two segments per stroke): the attachment, the bag's widest line, its lower edge; segment
  // seams every ~1.5 m (every other one fine)
  const K = SA.skin(S, true);
  const seams = [], seamsF = [];
  for (let i = 0; i < rim.M; i += 3) (i % 6 ? seamsF : seams).push(i);
  out.push(...SA.loft(K, { lines: [0, 3, 5], rings: seams, al: .9, ral: .4, pts: false }));
  out.push(...SA.loft(K, { rings: seamsF, ral: .32, fineRings: true, pts: false }));
  // fingers: one per section interval, slightly pleated, from the bag's lower edge to the ground (spread when slack)
  const fo = mix(.62, .72, k), fy = mix(.02, .03, k), G = [];
  for (let i = 0; i <= rim.M; i++) {
    const n0 = rim.N[i % rim.M], p0 = rim.P[i % rim.M], sc = mix(1, endS, rim.E[i % rim.M]), pl = (i & 1 ? .05 : -.03) * (.4 + .6 * k);
    G.push([p0[0] + n0[0] * (fo * sc + pl), fy, p0[1] + n0[2] * (fo * sc + pl)]);
  }
  for (let i = 0; i < rim.M; i++) {
    const a = S[i][5], b = S[i + 1][5], n0 = rim.N[i % rim.M];
    out.push(SA.plate([V.lerp(a, b, .04), V.lerp(a, b, .96), V.lerp(G[i], G[i + 1], .96), V.lerp(G[i], G[i + 1], .04)], V.norm([n0[0], -.25, n0[2]]), bo));
  }
  // the fingers' hairlines on a three-point section (slightly bowed out, so the skin's normals face out)
  const KF = SA.skin(S.map((sec, i) => { const n0 = rim.N[i % rim.M]; return [sec[5], V.add(V.lerp(sec[5], G[i], .5), [n0[0] * .06, 0, n0[2] * .06]), G[i]]; }), true), fe = [], feF = [];
  for (let i = 0; i < rim.M; i += 2) (i % 4 ? feF : fe).push(i);
  out.push(...SA.loft(KF, { lines: [2], rings: fe, al: .7, ral: .45, pts: false }));
  out.push(...SA.loft(KF, { rings: feF, ral: .4, fineRings: true, pts: false }));
  return out;
}
const LC_GEO = memo(() => {
  const { YB, YD, YS, XI, XO, ZA, ZP, ZE, ZF, YP, DX, DY, RO, RI } = LC;
  const HU = [], SS = [], SP = [], KS = [], KP = [], DS = [], DP = [];
  /* ---- buoyancy box: cargo deck, bottom, gunwale, hinge knuckles, tie-downs, landing pads */
  const up = [0, 1, 0], dn = [0, -1, 0];
  HU.push(SA.plate([[-XI, YD, ZA], [XI, YD, ZA], [XI, YD, ZF], [-XI, YD, ZF]], up, { ds: 1.35 }));
  HU.push(SA.plate([[-XO + (ZF - ZE), YD, ZF], [XO - (ZF - ZE), YD, ZF], [LC.HX - LC.CB, YD, LC.HZ], [-LC.HX + LC.CB, YD, LC.HZ]], up));
  HU.push(SA.plate([[-LC.HX + LC.CS, YD, -LC.HZ], [LC.HX - LC.CS, YD, -LC.HZ], [XO - .1, YD, ZA], [-XO + .1, YD, ZA]], up));
  // the bottom (seen only from below; sparse, so it does not haze the deck seen from above)
  const bo = { ds: 2.6 };
  HU.push(SA.plate([[-LC.HX, YB, -LC.HZ + LC.CS], [LC.HX, YB, -LC.HZ + LC.CS], [LC.HX, YB, LC.HZ - LC.CB], [-LC.HX, YB, LC.HZ - LC.CB]], dn, bo));
  HU.push(SA.plate([[-LC.HX, YB, LC.HZ - LC.CB], [LC.HX, YB, LC.HZ - LC.CB], [LC.HX - LC.CB, YB, LC.HZ], [-LC.HX + LC.CB, YB, LC.HZ]], dn, bo));
  HU.push(SA.plate([[-LC.HX + LC.CS, YB, -LC.HZ], [LC.HX - LC.CS, YB, -LC.HZ], [LC.HX, YB, -LC.HZ + LC.CS], [-LC.HX, YB, -LC.HZ + LC.CS]], dn, bo));
  const oct = y => LC_OCT.map(p => [p[0], y, p[1]]);
  HU.push(...fpath(oct(YD), (i, a, b) => V.norm([b[2] - a[2], .8, -(b[0] - a[0])]), { al: 1 }, true));
  HU.push(...fpath(oct(YB), (i, a, b) => V.norm([b[2] - a[2], -1, -(b[0] - a[0])]), fn({ al: .5 }), true));
  // deck edge where the deck meets the side structures (drawn by their hexes) and the centre line of the tie-down grid
  for (let x = -3.3; x <= 3.31; x += 1.65) for (let z = -10.4; z <= 9.7; z += 1.55) HU.push(circle([x, YD + .01, z], FY, .07, 8, fn({ w: .45, pts: false })));
  for (const x of [-2.475, -.825, .825, 2.475]) HU.push(line([[x, YD + .005, ZA + .3], [x, YD + .005, ZF - .3]], fn({ w: .22, pts: false })));
  for (const z of [LC.RB.z, LC.RS.z]) {
    const hw = z > 0 ? LC.RB.hw : LC.RS.hw;
    for (let x = -hw + .3; x < hw - .2; x += 1.1) HU.push(cyl([x, YD - .08, z], [x + .5, YD - .08, z], .08, fn({ n: 8, gen: 0 })));
  }
  for (const x of [-3.6, 3.6]) for (const z of [-7.5, 0, 7.5]) HU.push(box([x - .45, 0, z - .9], [x + .45, YB, z + .9], fn({ bottom: true })));

  /* ---- side structures (sx: 1 starboard, -1 port), each from its aft platform to the bow */
  for (const sx of [1, -1]) {
    const P_ = sx > 0 ? SS : SP, S = p => [sx * p[0], p[1], p[2]], SH = Q => Q.map(S);
    const A = SH(bx8([XI, YD, ZA], [XO, YP, ZP]));                                  // aft platform under the shroud
    const C = SH(bx8([XI, YD, ZP], [XO, YS, ZE]));                                  // engine / fan rooms
    const F = SH([[XI, YD, ZE], [XO, YD, ZE], [XO - (ZF - ZE), YD, ZF], [XI, YD, ZF], [XI, YS, ZE], [XO, YS, ZE], [XO - (ZF - ZE), YS, ZF], [XI, YS, ZF]]);
    P_.push(hex(A, { skip: [4] }));
    // engine room: the top with the two lift-fan intakes, doors in the inner wall, louvres on the outer wall
    const uX = x => (x - XI) / (XO - XI), vZ = z => (z - ZP) / (ZE - ZP);
    const u0 = sx > 0 ? uX(4.42) : uX(4.42), u1 = uX(5.68);
    const intakes = LC.FANS.map(zc => [Math.min(u0, u1), Math.max(u0, u1), vZ(zc - 1.0), vZ(zc + 1.0)]);
    const cz = sx > 0 ? LC.CAB : LC.PCAB;
    intakes.push([uX(4.14), uX(5.96), vZ(cz[0] + .02), 1, { al: 0 }]);
    P_.push(hex(C, { skip: [1, 2, 4] }));
    P_.push(...holed(C, 1, intakes));
    P_.push(SA.plate([[sx * XI, YP, ZP], [sx * XO, YP, ZP], [sx * XO, YS, ZP], [sx * XI, YS, ZP]], [0, 0, -1]));
    P_.push(hex(F, { skip: [2] }));
    for (const zc of LC.FANS) {
      // intake coaming, the well down to the fan, a grille of bars over it
      const x0 = sx * 4.42, x1 = sx * 5.68, z0 = zc - 1.0, z1 = zc + 1.0, yw = LC.FAN_Y - .12;
      P_.push(box([Math.min(x0, x1) - .06, YS, z0 - .06], [Math.max(x0, x1) + .06, YS + .22, z0]));
      P_.push(box([Math.min(x0, x1) - .06, YS, z1], [Math.max(x0, x1) + .06, YS + .22, z1 + .06]));
      P_.push(box([Math.min(x0, x1) - .06, YS, z0], [Math.min(x0, x1), YS + .22, z1]));
      P_.push(box([Math.max(x0, x1), YS, z0], [Math.max(x0, x1) + .06, YS + .22, z1]));
      P_.push(SA.plate([[x0, yw, z0], [x1, yw, z0], [x1, YS, z0], [x0, YS, z0]], [0, 0, 1]));
      P_.push(SA.plate([[x0, yw, z1], [x1, yw, z1], [x1, YS, z1], [x0, YS, z1]], [0, 0, -1]));
      P_.push(SA.plate([[x0, yw, z0], [x0, yw, z1], [x0, YS, z1], [x0, YS, z0]], [sx, 0, 0]));
      P_.push(SA.plate([[x1, yw, z0], [x1, yw, z1], [x1, YS, z1], [x1, YS, z0]], [-sx, 0, 0]));
      for (let k = 1; k < 7; k++) { const x = mix(x0, x1, k / 7); P_.push(line([[x, YS + .2, z0], [x, YS + .2, z1]], { w: .5 })); }
      P_.push(line([[x0, YS + .2, zc], [x1, YS + .2, zc]], fn({ w: .5 })));
    }
    // turbine exhaust stacks: raked boxes with the outlet on the aft face
    for (const ze of LC.EXH) {
      const xa = sx * 5.1, xb = sx * 5.86, E = [[xa, YS, ze - .5], [xb, YS, ze - .5], [xb, YS, ze + .5], [xa, YS, ze + .5], [xa, YS + .62, ze - .42], [xb, YS + .62, ze - .42], [xb, YS + .86, ze + .5], [xa, YS + .86, ze + .5]];
      P_.push(...hexHoled(E, { 2: [[.12, .88, .12, .9]] }));
      P_.push(SA.plate([[xa, YS + .08, ze - .38], [xb, YS + .08, ze - .38], [xb, YS + .56, ze - .38], [xa, YS + .56, ze - .38]].map(p => [p[0] * .999, p[1], p[2]]), [0, 0, 1], { ds: 1.5 }));
    }
    // turbine and fan-room air intake louvres on the outer wall, the inner wall's watertight doors, a rubbing strake
    for (const [za, zb] of [[-7.1, -5.3], [-1.6, .1], [2.6, 3.8]]) P_.push(panel([[sx * (XO + .01), YS - .95, za], [sx * (XO + .01), YS - .95, zb], [sx * (XO + .01), YS - .2, zb], [sx * (XO + .01), YS - .2, za]], fn({ hatch: 7, edge: .6, pts: false })));
    for (const zd of [-6.2, -1.0, 4.9]) P_.push(SA.fquad([[sx * (XI - .012), YD + .1, zd - .4], [sx * (XI - .012), YD + .1, zd + .4], [sx * (XI - .012), YD + 1.95, zd + .4], [sx * (XI - .012), YD + 1.95, zd - .4]], [-sx, 0, 0], fn({ al: .75 })));
    P_.push(line([[sx * (XO + .02), YD + .35, ZA + .2], [sx * (XO + .02), YD + .35, ZE]], fn({ w: .5 })));
    // walkway handrail along the outboard edge of the top (stanchions, two rails)
    const rx = sx * (XO - .08);
    for (let z = ZP + .3; z < LC.CAB[0] - .2; z += 1.6) P_.push(line([[rx, YS, z], [rx, YS + 1.0, z]], fn({ w: .45 })));
    for (const yy of [.5, 1.0]) P_.push(line([[rx, YS + yy, ZP + .3], [rx, YS + yy, LC.CAB[0] - .3]], fn({ w: .45 })));
    // mooring bitts, the bow thruster's base ring, nav light
    for (const [x, y, z] of [[5.6, YS, -8.5], [5.6, YP, -10.8], [5.35, YS, 10.15]]) P_.push(lathe([sx * x, y, z], FY, [[0, .12], [.28, .12], [.3, .16], [.34, .16]], fn({ n: 10, gen: 2, rings: [2, 3], caps: true })));
    P_.push(lathe([sx * LC.XC, YS, LC.THZ], FY, [[0, .88], [.1, .88], [.12, .8]], { n: 28, gen: 0, rings: [0, 1] }));

    /* ---- the shroud: ring duct, front guard, nacelle on struts, pylon and braces, rudder brackets */
    const D_ = sx > 0 ? DS : DP, dc = [sx * DX, DY, 0];
    D_.push(lathe([dc[0], DY, LC.DZ0], FZ, [[0, RO - .05], [.14, RO], [1.72, RO], [1.86, RO - .02], [1.95, RO - .07]], { n: 64, gen: 12, rings: [0, 2, 4] }));
    D_.push(lathe([dc[0], DY, LC.DZ0], FZ, [[0, RI + .02], [1.95, RI]], { n: 64, gen: 0, sil: false, rings: [] }));
    D_.push(lathe([dc[0], DY, LC.DZ0 + .7], FZ, [[0, RO + .02], [.09, RO + .02]], fn({ n: 48, gen: 0, rings: [0, 1], sil: false })));
    const zg = LC.DZ1 + .03;
    for (const r of [.62, 1.1, 1.55]) D_.push(circle([dc[0], DY, zg], FZ, r, 40, { w: .55, fine: r < 1 }));
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; D_.push(line([[dc[0] + Math.cos(a) * .42, DY + Math.sin(a) * .42, zg], [dc[0] + Math.cos(a) * (RI - .02), DY + Math.sin(a) * (RI - .02), zg]], { w: .5, fine: !!(k & 1) })); }
    D_.push(lathe([dc[0], DY, LC.PZ + .12], FZ, [[0, .42], [.5, .42], [.72, .34], [.86, .2], [.93, 0]], { n: 20, gen: 6, rings: [0, 1, 3] }));
    for (const a of [PI / 2, 210 * DEG, 330 * DEG]) D_.push(radial([dc[0], DY], a, .4, RI + .01, -10.12, -9.78, .045));
    D_.push(radial([dc[0], DY], -PI / 2, .4, RI + .01, -10.5, -9.62, .1));
    D_.push(hex([[dc[0] - .28, YP, -11.15], [dc[0] + .28, YP, -11.15], [dc[0] + .28, YP, -9.6], [dc[0] - .28, YP, -9.6], [dc[0] - .2, DY - RO + .06, -11.05], [dc[0] + .2, DY - RO + .06, -11.05], [dc[0] + .2, DY - RO + .06, -9.7], [dc[0] - .2, DY - RO + .06, -9.7]]));
    for (const s of [-1, 1]) {
      const a = (s > 0 ? -28 : 208) * DEG, q = [dc[0] + Math.cos(a) * (RO - .02), DY + Math.sin(a) * (RO - .02)];
      D_.push(cyl([dc[0] + s * .85, YP, -10.4], [q[0], q[1], -10.4], .07, { n: 8, gen: 0 }));
      D_.push(cyl([dc[0] + s * .95, DY - 1.62, LC.DZ1 + .08], [dc[0] + s * .95, DY - 1.62, ZP], .06, fn({ n: 8, gen: 0 })));
    }
    for (const s of [-1, 1]) {
      const xr = dc[0] + s * LC.RUD.dx, yh = Math.sqrt(RI * RI - LC.RUD.dx * LC.RUD.dx);
      for (const [ya, yb] of [[DY + yh - .04, DY + yh + .04], [DY - yh - .04, DY - yh + .04]]) D_.push(box([xr - .05, ya, LC.RUD.zh - .1], [xr + .05, yb, LC.DZ0 + .05]));
    }
  }

  /* ---- control cab (starboard, forward): windows all round, mast with the navigation radar, lights, whips */
  const [kz0, kz1, kh] = LC.CAB, K = [[4.12, YS, kz0], [5.98, YS, kz0], [5.98, YS, kz1], [4.12, YS, kz1], [4.22, YS + kh, kz0 + .1], [5.88, YS + kh, kz0 + .1], [5.88, YS + kh, kz1 - .16], [4.22, YS + kh, kz1 - .16]];
  const wv = [.5, .84];
  KS.push(...hexHoled(K, {
    4: [[.05, .33, ...wv], [.36, .64, ...wv], [.67, .95, ...wv]],
    3: [[.04, .22, ...wv], [.24, .42, ...wv], [.44, .62, ...wv], [.64, .8, ...wv], [.82, .96, ...wv]],
    5: [[.04, .18, ...wv], [.2, .38, ...wv], [.4, .58, ...wv], [.6, .78, ...wv], [.8, .96, ...wv]],
    2: [[.1, .45, ...wv], [.55, .9, ...wv]],
  }));
  KS.push(fwin(K, 5, .62, .9, .04, .44, fn({ al: .6 })));                                      // door onto the side-structure top
  const my = YS + kh, mx = 5.2, mz = 8.1;
  KS.push(cyl([mx, my, mz], [mx, my + 1.25, mz], .07, { n: 8, gen: 0 }));
  KS.push(box([mx - .08, my + 1.25, mz - .55], [mx + .08, my + 1.37, mz + .55]));             // navigation radar array
  KS.push(box([mx - .06, my + 1.13, mz - .08], [mx + .06, my + 1.25, mz + .08], fn()));
  KS.push(cyl([mx - .25, my + .75, mz], [mx + .25, my + .75, mz], .03, fn({ n: 6, gen: 0 })));
  for (const s of [-1, 1]) KS.push(lathe([mx + s * .25, my + .75, mz], FY, [[0, .04], [.08, .04]], fn({ n: 8, gen: 0, caps: true })));
  KS.push(line([[4.5, my, 7.0], [4.49, my + 1.6, 6.95], [4.47, my + 2.3, 6.9]], { w: .55 }));
  KS.push(line([[5.7, my, 6.8], [5.71, my + 1.4, 6.78]], fn({ w: .5 })));
  KS.push(lathe([4.55, my, 9.55], FY, [[0, .1], [.12, .1], [.2, .16], [.3, .16]], fn({ n: 12, gen: 2, rings: [1, 3], caps: true })));    // searchlight
  for (const [x, z] of [[4.2, kz1 - .2], [5.9, kz1 - .2]]) KS.push(box([x - .05, my, z - .08], [x + .05, my + .12, z + .02], fn()));
  for (const x of [4.3, 5.8]) KS.push(line([[x, my, kz0 + .2], [x, my + .45, kz0 + .2], [x, my + .45, kz1 - .3], [x, my, kz1 - .3]], fn({ w: .4 })));
  /* ---- port cabin: lower, a few windows */
  const [pz0, pz1, ph] = LC.PCAB, KQ = [[-5.98, YS, pz0], [-4.12, YS, pz0], [-4.12, YS, pz1], [-5.98, YS, pz1], [-5.9, YS + ph, pz0 + .1], [-4.22, YS + ph, pz0 + .1], [-4.22, YS + ph, pz1 - .12], [-5.9, YS + ph, pz1 - .12]];
  const pv = [.42, .78];
  KP.push(...hexHoled(KQ, { 4: [[.1, .42, ...pv], [.58, .9, ...pv]], 5: [[.1, .24, ...pv], [.34, .48, ...pv], [.58, .72, ...pv]], 3: [[.62, .76, ...pv]], 2: [[.3, .7, ...pv]] }));
  KP.push(fwin(KQ, 3, .1, .45, .03, .86, fn({ al: .65 })));
  KP.push(box([-5.4, YS + ph, 8.0], [-4.7, YS + ph + .35, 9.0]));                          // air conditioning unit
  KP.push(line([[-5.7, YS + ph, 9.6], [-5.69, YS + ph + 1.5, 9.55]], { w: .5 }));
  for (const x of [-5.8, -4.3]) KP.push(line([[x, YS + ph, pz0 + .2], [x, YS + ph + .4, pz0 + .2], [x, YS + ph + .4, pz1 - .3], [x, YS + ph, pz1 - .3]], fn({ w: .4 })));
  return { HU, SS, SP, KS, KP, DS, DP };
});
/* propeller (dyn-free: turns with its part's xf): 4 blades, hub, aft spinner */
const LC_PROP = memo(() => [1, -1].map(sx => {
  const c = [sx * LC.DX, LC.DY, LC.PZ], P = [];
  P.push(blades(c, [0, 0, -1], 4, .42, LC.RP, { chord: .7, taper: .58, pitch: .3 * sx, edge: .9, rib: true }));
  P.push(lathe([c[0], LC.DY, LC.PZ - .18], FZ, [[0, .43], [.36, .43]], { n: 18, gen: 4, rings: [0, 1], caps: true }));
  P.push(lathe([c[0], LC.DY, LC.PZ - .18], [0, 0, -1], [[0, .43], [.28, .38], [.5, .25], [.62, .1], [.65, 0]], { n: 18, gen: 4, rings: [1] }));
  return P;
}));
const lcPropXf = sx => st => X.mul(lcLift(st), about(R.z(sx * (st.prop || 0)), [sx * LC.DX, LC.DY, LC.PZ]));
/* rudder k (0 inboard, 1 outboard) of side sx */
const lcRudX = (sx, k) => sx * LC.DX + sx * (k ? 1 : -1) * LC.RUD.dx;
const LC_RUDDER = memo(() => {
  const out = {};
  for (const sx of [1, -1]) for (const k of [0, 1]) {
    const x = lcRudX(sx, k), { z0, z1, y0, y1, zh } = LC.RUD, t0 = .075, t1 = .016;
    out[sx + ':' + k] = [
      hex([[x - t0, y0, z0], [x + t0, y0, z0], [x + t1, y0, z1], [x - t1, y0, z1], [x - t0, y1, z0], [x + t0, y1, z0], [x + t1, y1, z1], [x - t1, y1, z1]], { bottom: true }),
      line([[x, y0 - .06, zh], [x, y1 + .06, zh]], fn({ w: .6 })),
    ];
  }
  return out;
});
const lcRudXf = (sx, k) => st => X.mul(lcLift(st), about(R.y(st.rudder || 0), [lcRudX(sx, k), 0, LC.RUD.zh]));
/* bow thruster (turns about its vertical axis): domed drum with a rectangular nozzle, aft at thrust 0 */
const LC_THR = memo(() => [1, -1].map(sx => {
  const x = sx * LC.XC, y = LC.YS + .12, z = LC.THZ, P = [];
  P.push(lathe([x, y, z], FY, [[0, .76], [1.12, .76], [1.34, .66], [1.5, .46], [1.6, .22], [1.63, 0]], { n: 32, gen: 8, rings: [0, 1, 3] }));
  const N = bx8([x - .36, y + .25, z - 1.16], [x + .36, y + .98, z - .6]);
  P.push(...hexHoled(N, { 2: [[.08, .92, .1, .9]] }));
  for (let k = 1; k < 4; k++) P.push(line([[x - .32, y + .25 + k * .18, z - 1.17], [x + .32, y + .25 + k * .18, z - 1.17]], fn({ w: .5 })));
  P.push(lathe([x, y + 1.63, z], FY, [[0, .05], [.18, .03]], fn({ n: 8, gen: 0, rings: [0] })));
  return P;
}));
const lcThrXf = sx => st => X.mul(lcLift(st), about(R.y(st.thrust || 0), [sx * LC.XC, 0, LC.THZ]));
/* lift fan impeller seen in its intake (turns about Y) */
const LC_FAN = memo(() => {
  const out = {};
  for (const sx of [1, -1]) LC.FANS.forEach((zc, k) => {
    const c = [sx * LC.XC, LC.FAN_Y, zc];
    out[sx + ':' + k] = [blades(c, FY, 12, .2, .6, { chord: .42, taper: .7, pitch: .25 * sx, edge: .8 }), lathe([c[0], LC.FAN_Y - .05, zc], FY, [[0, .22], [.12, .16], [.18, 0]], { n: 14, gen: 3, rings: [0] })];
  });
  return out;
});
const lcFanXf = (sx, k) => st => X.mul(lcLift(st), about(R.y(sx * (st.fan || 0)), [sx * LC.XC, 0, LC.FANS[k]]));
/* ramps, in their flat pose (hinge line at the deck edge, the ramp along ±Z) */
const LC_RAMPS = memo(() => {
  const { YD } = LC, B = [], FL = [], S = [];
  const { z, hw, L1, L2, th } = LC.RB;
  B.push(hex([[-hw, YD - th, z], [hw, YD - th, z], [hw, YD - .1, z + L1], [-hw, YD - .1, z + L1], [-hw, YD, z], [hw, YD, z], [hw, YD, z + L1], [-hw, YD, z + L1]], { bottom: true }));
  B.push(panel([[-hw + .35, YD + .01, z + .15], [hw - .35, YD + .01, z + .15], [hw - .35, YD + .01, z + L1 - .1], [-hw + .35, YD + .01, z + L1 - .1]], fn({ hatch: 7, edge: .4, pts: false })));
  for (const s of [-1, 1]) {
    B.push(box([s * hw - (s > 0 ? .22 : 0), YD, z + .05], [s * hw + (s > 0 ? 0 : .22), YD + .1, z + L1 - .05]));
    for (let k = 0; k < 5; k++) B.push(line([[s * (hw - .22), YD + .1, z + .2 + k * .35], [s * (hw - .02), YD + .1, z + .2 + k * .35]], fn({ w: .45 })));
  }
  for (let x = -hw + .5; x < hw - .3; x += 1.3) B.push(cyl([x, YD - .1, z + L1], [x + .6, YD - .1, z + L1], .06, fn({ n: 8, gen: 0 })));
  const zf = z + L1;
  FL.push(hex([[-hw, YD - .1, zf], [hw, YD - .1, zf], [hw, YD - .03, zf + L2], [-hw, YD - .03, zf + L2], [-hw, YD, zf], [hw, YD, zf], [hw, YD, zf + L2], [-hw, YD, zf + L2]], { bottom: true }));
  FL.push(panel([[-hw + .35, YD + .01, zf + .1], [hw - .35, YD + .01, zf + .1], [hw - .35, YD + .01, zf + L2 - .15], [-hw + .35, YD + .01, zf + L2 - .15]], fn({ hatch: 7, edge: .4, pts: false })));
  for (const s of [-1, 1]) FL.push(box([s * hw - (s > 0 ? .22 : 0), YD, zf + .05], [s * hw + (s > 0 ? 0 : .22), YD + .08, zf + L2 - .1]));
  FL.push(line([[-hw + .1, YD + .01, zf + L2 - .05], [hw - .1, YD + .01, zf + L2 - .05]], fn({ w: .6 })));
  const s0 = LC.RS.z, sw = LC.RS.hw, sL = LC.RS.L, st = LC.RS.th;
  S.push(hex([[-sw, YD - st, s0], [sw, YD - st, s0], [sw, YD - .06, s0 - sL], [-sw, YD - .06, s0 - sL], [-sw, YD, s0], [sw, YD, s0], [sw, YD, s0 - sL], [-sw, YD, s0 - sL]], { bottom: true }));
  S.push(panel([[-sw + .3, YD + .01, s0 - .15], [sw - .3, YD + .01, s0 - .15], [sw - .3, YD + .01, s0 - sL + .15], [-sw + .3, YD + .01, s0 - sL + .15]], fn({ hatch: 9, edge: .4, pts: false })));
  for (const s of [-1, 1]) S.push(box([s * sw - (s > 0 ? .18 : 0), YD, s0 - sL + .05], [s * sw + (s > 0 ? 0 : .18), YD + .1, s0 - .05]));
  return { B, FL, S };
});
function lcac() {
  const g = LC_GEO(), pr = LC_PROP(), ru = LC_RUDDER(), th = LC_THR(), fa = LC_FAN(), rp = LC_RAMPS();
  const parts = [
    { name: 'hull', label: 'Buoyancy box · cargo deck 20.4 × 8.2 m', prims: g.HU, xf: lcLift },
    { name: 'skirt', label: 'Skirt · bag and finger · 1.5 m', prims: lcSkirt({}), dyn: lcSkirt },
    { name: 'sideS', label: 'Side structure · stbd · TF40B ×2 · lift fans ×2', prims: g.SS, xf: lcLift },
    { name: 'sideP', label: 'Side structure · port · TF40B ×2 · lift fans ×2', prims: g.SP, xf: lcLift },
    { name: 'cabS', label: 'Control cab · craftmaster · engineer · navigator', prims: g.KS, xf: lcLift },
    { name: 'cabP', label: 'Port cabin · loadmaster · deck engineer · troops', prims: g.KP, xf: lcLift },
    { name: 'thrusterS', label: 'Bow thruster · swivelling · stbd', prims: th[0], xf: lcThrXf(1) },
    { name: 'thrusterP', label: 'Bow thruster · swivelling · port', prims: th[1], xf: lcThrXf(-1) },
    { name: 'ductS', label: 'Propeller shroud · stbd', prims: g.DS, xf: lcLift },
    { name: 'ductP', label: 'Propeller shroud · port', prims: g.DP, xf: lcLift },
    { name: 'propS', label: 'Propeller · 4 blades · Ø 3.58 m · stbd', prims: pr[0], xf: lcPropXf(1) },
    { name: 'propP', label: 'Propeller · 4 blades · Ø 3.58 m · port', prims: pr[1], xf: lcPropXf(-1) },
  ];
  for (const [sx, nm] of [[1, 'S'], [-1, 'P']]) for (const k of [0, 1]) parts.push({ name: 'rudder' + nm + (k + 1), label: 'Rudder · ' + (sx > 0 ? 'stbd' : 'port') + ' · ' + (k ? 'outboard' : 'inboard'), prims: ru[sx + ':' + k], xf: lcRudXf(sx, k) });
  for (const [sx, nm] of [[1, 'S'], [-1, 'P']]) for (const k of [0, 1]) parts.push({ name: 'fan' + nm + (k + 1), label: 'Lift fan · ' + (sx > 0 ? 'stbd' : 'port') + ' · ' + (k ? 'aft' : 'fwd'), prims: fa[sx + ':' + k], xf: lcFanXf(sx, k) });
  parts.push({ name: 'rampB', label: 'Bow ramp · 8.8 m wide', prims: rp.B, xf: lcRampBXf });
  parts.push({ name: 'flapB', label: 'Bow ramp extension · folding', prims: rp.FL, xf: lcFlapXf });
  parts.push({ name: 'rampS', label: 'Stern ramp · 4.6 m wide', prims: rp.S, xf: lcRampSXf });
  return { name: 'lcac', L: LCAC.L, B: LCAC.B, A: LCAC, parts };
}
/* cutaway: + the four TF40B gas turbines, the lift fans' volutes, the drive trains, the fuel tanks, the crew stations */
function lcacCut() {
  const M = lcac(), TU = [], PL = [], DR = [], TK = [], CS = [];
  const { YD, YS, XC, FANS } = LC;
  for (const sx of [1, -1]) {
    const x = sx * XC;
    // propulsion turbine (aft) and lift turbine (between the fans), gearboxes, the inclined shaft up to the shroud nacelle
    for (const [z0, dir] of [[-6.3, -1], [-.6, -1]]) {
      const a = [x, 2.25, z0];
      TU.push(lathe(a, [0, 0, dir], [[0, .26], [.12, .34], [.45, .32], [.6, .38], [.95, .38], [1.15, .32], [1.45, .3]], { n: 20, gen: 6, rings: [1, 3, 4, 6], caps: true }));
      TU.push(box([x - .42, 1.75, z0 - dir * .6], [x + .42, 2.75, z0 - dir * .05]));
      TU.push(cyl([x, 2.25, z0 + dir * 1.45], [x, YS + .1, z0 + dir * 1.5], .26, { n: 14, gen: 3 }));
    }
    DR.push(box([x - .42, 1.2, -8.75], [x + .42, 1.9, -8.05]));
    DR.push(cyl([x, 1.55, -6.2], [x, 1.55, -8.05], .07, { n: 8, gen: 0 }));
    DR.push(cyl([x, 1.7, -8.4], [sx * LC.DX, LC.DY - .3, LC.PZ + .4], .09, { n: 10, gen: 2, caps: true }));
    DR.push(cyl([x, 1.55, -2.1], [x, 1.55, FANS[1] + .1], .07, { n: 8, gen: 0 }));
    DR.push(cyl([x, 1.55, -.6], [x, 1.55, FANS[0] - .1], .07, { n: 8, gen: 0 }));
    for (const zc of FANS) {
      // double-entry centrifugal fan (Ø 1.6 m) in its volute; the plenum feeds the cushion through the deck
      PL.push(lathe([x, 1.45, zc], FY, [[0, .5], [.08, .9], [.2, .93], [1.3, .93], [1.45, .88], [1.55, .62]], { n: 30, gen: 8, rings: [1, 2, 3, 4], caps: true }));
      PL.push(blades([x, 2.0, zc], FY, 12, .3, .78, { chord: .36, taper: .8, pitch: .2, edge: .7 }));
      PL.push(box([x - .5, YD - .02, zc - .35], [x + .5, 1.45, zc + .35], fn()));
    }
    // fuel tanks in the buoyancy box
    for (const z of [-6.5, 1.5]) TK.push(box([sx * 1.2, .35, z - 3.2], [sx * 3.6, .95, z + 3.2], { bottom: true }));
  }
  // control cab: three seats and the consoles; port cabin: troop seats
  for (const x of [4.55, 5.05, 5.55]) { CS.push(box([x - .2, YS, 8.3], [x + .2, YS + .5, 8.7])); CS.push(box([x - .2, YS + .5, 8.25], [x + .2, YS + 1.1, 8.35], fn())); }
  CS.push(box([4.25, YS, 9.3], [5.85, YS + .95, 9.8]));
  CS.push(box([4.3, YS + .95, 9.55], [5.8, YS + 1.2, 9.8], fn()));
  for (let z = 7.2; z < 9.7; z += .55) CS.push(box([-5.85, YS, z], [-5.45, YS + .45, z + .45]));
  for (let z = 7.2; z < 9.2; z += .55) CS.push(box([-4.65, YS, z], [-4.25, YS + .45, z + .45]));
  const lift = { xf: lcLift };
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'turbines', label: 'TF40B gas turbines ×4 · 2 lift · 2 propulsion', prims: TU }, lift, hidden));
  parts.push(O({ name: 'fans', label: 'Lift fans ×4 · Ø 1.6 m · double-entry · volutes', prims: PL }, lift, hidden));
  parts.push(O({ name: 'drive', label: 'Propeller gearboxes · inclined shafts · fan shafts', prims: DR }, lift, hidden));
  parts.push(O({ name: 'tanks', label: 'Fuel tanks ×4 · in the buoyancy box', prims: TK }, lift, hidden));
  parts.push(O({ name: 'stations', label: 'Crew stations · control consoles · troop seats', prims: CS }, lift, hidden));
  return O(M, { name: 'lcac_cut', parts });
}

/* ================================================================ ACV-1.1 · amphibious combat vehicle (BAE Systems / Iveco)
   8.9 × 3.1 m, 2.8 m to the hull roof; 8×8 on 1.24 m tyres, a V-shaped boat hull with a long raked bow and a trim vane,
   Iveco Cursor 16 diesel (690 hp) front right beside the driver, crew 3 + 13 marines entering by the rear ramp; two
   shrouded water propellers under the stern; a Kongsberg Protector RS4 remote weapon station with an M2HB .50 cal.
   Vehicle frame: origin on the ground under the centre, bow +Z. */
const AV = {
  AX: [1.65, .15, -1.5, -3.0], WR: .62, WW: .44, WX: 1.1, ROOF: 2.62,
  RWS: [.45, 2.7, 1.3], PIV: [0, .42, 0], MUZ: [0, .42, 1.34],
  RAMP: { y: .9, z: -4.45, hw: .9, top: 2.42, th: .12 },
  PROPS: [[-.78, .6, -4.18], [.78, .6, -4.18]], PR: .27,
};
const avYawXf = st => X.make(R.y(st.yaw || 0), AV.RWS);
const avGunXf = st => X.mul(avYawXf(st), about(R.x(-(st.pitch || 0)), AV.PIV));
export const ACV = {
  L: 8.9, B: 3.1, H: 2.8, AXLES: AV.AX, TYRE_R: AV.WR,
  // the RWS: mount centre on the roof (yaw axis at its base), the elevation pivot in the mount frame
  RWS: AV.RWS, PIV: V.add(AV.RWS, AV.PIV),
  // the M2HB's muzzle in the vehicle frame for a state (yaw, pitch)
  muzzle: st => X.ap(avGunXf(st || {}), AV.MUZ),
  yawXf: avYawXf, gunXf: avGunXf,
  // the rear ramp's hinge line and its lip for a state
  RAMP: AV.RAMP, rampLip: st => X.ap(avRampXf(st || {}), [0, AV.RAMP.top, AV.RAMP.z]),
  PROPS: AV.PROPS,
};
/* hull sections: [z, roof, roof edge x, belt x, belt y, lower side x, chine y, keel y] (bow sections form the V wedge) */
const AV_SEC = [
  [-4.45, 2.56, 1.1, 1.5, 1.42, 1.49, 1.02, .8],
  [-4.33, 2.62, 1.15, 1.54, 1.42, 1.53, .96, .74],
  [-3.72, 2.62, 1.16, 1.55, 1.42, 1.545, .86, .6],
  [-3.62, 2.62, 1.16, 1.55, 1.42, 1.03, .84, .57],
  [-3.0, 2.62, 1.16, 1.55, 1.42, 1.03, .78, .45],
  [2.3, 2.62, 1.16, 1.55, 1.42, 1.03, .78, .45],
  [2.38, 2.62, 1.16, 1.55, 1.42, 1.03, .8, .5],
  [2.48, 2.62, 1.16, 1.55, 1.42, 1.545, .84, .56],
  [3.3, 2.62, 1.14, 1.53, 1.5, 1.52, 1.22, 1.08],
  [3.9, 2.25, 1.12, 1.46, 1.66, 1.45, 1.52, 1.46],
  [4.45, 1.92, 1.06, 1.38, 1.86, 1.37, 1.84, 1.8],
];
const avUpper = s => { const [z, t, xr, xw, yb] = s; return [[-xw, yb, z], [-xr, t, z], [0, t, z], [xr, t, z], [xw, yb, z]]; };
const avLower = s => { const [z, , , xw, yb, xl, yc, k] = s; return [[xw, yb, z], [xl, yb, z], [xl, yc, z], [0, k, z], [-xl, yc, z], [-xl, yb, z], [-xw, yb, z]]; };
const avRampXf = st => about(R.x(-(90 * DEG + Math.asin(AV.RAMP.y / (AV.RAMP.top - AV.RAMP.y))) * sat(st.ramp || 0)), [0, AV.RAMP.y, AV.RAMP.z]);
const AV_GEO = memo(() => {
  const UH = [], LH = [], TV = [], FIT = [], RW = [], GN = [], RP = [], HT = [];
  const US = AV_SEC.map(avUpper), LS = AV_SEC.map(avLower);
  UH.push(...loftN(US, [[-1, .2, 0], [-.1, 1, 0], [.1, 1, 0], [1, .2, 0]], { lines: [0, 1, 3, 4], rings: [0, 8, 10], al: .95 }));
  LH.push(...loftN(LS, [[0, -1, 0], [1, 0, 0], [.4, -1, 0], [-.4, -1, 0], [-1, 0, 0], [0, -1, 0]], { lines: [1, 2, 3, 4, 5], rings: [0, 3, 7], al: .8, ral: .5 }));
  // the nose edge and the stern face round the ramp opening
  const n0 = AV_SEC[AV_SEC.length - 1];
  UH.push(SA.plate([[-n0[3], n0[4], n0[0]], [n0[3], n0[4], n0[0]], [n0[2], n0[1], n0[0]], [-n0[2], n0[1], n0[0]]], [0, .3, 1]));
  const s0 = AV_SEC[0], zr = s0[0], back = [0, 0, -1], { hw, top, y: ry } = AV.RAMP;
  UH.push(SA.plate([[-s0[2], s0[1], zr], [s0[2], s0[1], zr], [hw, top, zr], [-hw, top, zr]], back));
  for (const sx of [-1, 1]) {
    UH.push(SA.plate([[sx * hw, top, zr], [sx * s0[2], s0[1], zr], [sx * s0[3], s0[4], zr], [sx * hw, s0[4], zr]], back));
    LH.push(SA.plate([[sx * hw, s0[4], zr], [sx * s0[5], s0[4], zr], [sx * s0[5], s0[6], zr], [sx * hw, ry, zr]], back));
    LH.push(SA.plate([[sx * hw, ry, zr], [sx * s0[5] * .6, s0[6] - .12, zr], [0, s0[7], zr], [0, ry, zr]], back));
  }
  // trim vane: a broad plate folded up against the upper glacis, its top edge standing proud of the roof line
  const gz = z => mix(2.62, 1.92, (z - 3.3) / 1.15);
  const TVq = [[-1.42, gz(4.3) + .07, 4.3], [1.42, gz(4.3) + .07, 4.3], [1.36, 2.84, 3.12], [-1.36, 2.84, 3.12]];
  TV.push(slab(TVq, .06));
  TV.push(line([[-1.3, 2.7, 3.24], [1.3, 2.7, 3.24]], fn({ w: .5 })));
  for (const s of [-1, 1]) { TV.push(cyl([s * 1.2, gz(4.3), 4.34], [s * .8, gz(4.3), 4.34], .06, fn({ n: 8, gen: 0 }))); TV.push(cyl([s * 1.1, 2.3, 3.4], [s * 1.1, 2.55, 3.28], .05, fn({ n: 6, gen: 0 }))); }
  // roof: driver's hatch (front left) with periscopes, commander's hatch, troop hatches, engine deck grilles, RWS ring
  const R0 = AV.ROOF;
  const hatch = (x, z, r, P, per) => {
    P.push(lathe([x, R0, z], FY, [[0, r + .08], [.1, r + .08], [.12, r + .02]], { n: 22, gen: 0, rings: [0, 1], caps: true }));
    P.push(lathe([x, R0 + .12, z], FY, [[0, r], [.05, r * .92], [.08, 0]], { n: 22, gen: 2, rings: [0] }));
    P.push(box([x - .05, R0 + .19, z - r * .5], [x + .05, R0 + .23, z + r * .5], fn()));
    for (const a of per) { const c = [x + Math.sin(a) * (r + .2), R0, z + Math.cos(a) * (r + .2)]; P.push(obox(c, a, .09, .06, .14)); }
  };
  hatch(-.62, 2.72, .3, HT, [-.5, 0, .5]);
  hatch(-.55, 1.35, .32, HT, [-.9, -.3, .3, .9, 1.6, -1.6]);
  for (const x0 of [-1.0, .1]) { HT.push(box([x0, R0, -3.7], [x0 + .9, R0 + .06, -2.45])); HT.push(fwin(bx8([x0, R0, -3.7], [x0 + .9, R0 + .06, -2.45]), 1, .08, .92, .08, .92, fn({ al: .6 }))); }
  FIT.push(box([.18, R0, 2.0], [1.12, R0 + .07, 3.15]));
  FIT.push(panel([[.24, R0 + .075, 2.06], [1.06, R0 + .075, 2.06], [1.06, R0 + .075, 3.09], [.24, R0 + .075, 3.09]], { hatch: 9, edge: .6, pts: false }));
  const sideX = y => 1.55 - (y - 1.42) * (1.55 - 1.16) / 1.2 + .012;                                         // the upper hull's side
  FIT.push(panel([[sideX(1.8), 1.8, 1.55], [sideX(1.8), 1.8, 2.45], [sideX(2.3), 2.3, 2.45], [sideX(2.3), 2.3, 1.55]], { hatch: 5, edge: .6, pts: false }));
  FIT.push(box([1.46, 1.6, 1.15], [1.6, 1.78, 1.45]));                                                      // exhaust outlet
  FIT.push(lathe([AV.RWS[0], R0, AV.RWS[2]], FY, [[0, .42], [.08, .42], [.08, .36]], { n: 24, gen: 0, rings: [0, 1], caps: true }));
  // headlights and marker lamps on the upper bow corners, tow eyes, tail lights, stowage bins, whip antennas
  for (const s of [-1, 1]) {
    FIT.push(box([s * 1.08, 2.02, 3.5], [s * 1.36, 2.16, 3.62]));
    FIT.push(circle([s * 1.22, 2.09, 3.63], FZ, .055, 10, fn({ w: .8, pts: false })));
    FIT.push(box([s * .5 - .1, 1.62, 4.35], [s * .5 + .1, 1.7, 4.5], fn()));
    FIT.push(box([s * 1.3 - .08, 2.1, -4.47], [s * 1.3 + .08, 2.26, -4.45], fn()));
    FIT.push(box([s * .6 - .09, .78, -4.52], [s * .6 + .09, .88, -4.44], fn()));
    for (const [z0, z1] of [[-3.6, -1.9], [-1.6, -.2]]) {
      const xi = y => 1.55 - (y - 1.42) * (1.55 - 1.16) / 1.2, S2 = (x, y, z) => [s * x, y, z];
      FIT.push(hex([S2(xi(1.62), 1.62, z0), S2(1.55, 1.62, z0), S2(1.55, 1.62, z1), S2(xi(1.62), 1.62, z1), S2(xi(2.2), 2.2, z0), S2(1.55, 2.2, z0), S2(1.55, 2.2, z1), S2(xi(2.2), 2.2, z1)], fn({ bottom: true, skip: [5] })));
    }
    const wx = s * 1.08;
    for (const z of [3.05, -4.1]) { FIT.push(lathe([wx, R0, z], FY, [[0, .06], [.1, .045]], fn({ n: 8, gen: 0, rings: [0] }))); FIT.push(line([[wx, R0 + .1, z], [wx, R0 + 1.3, z - .02], [wx, R0 + 2.3, z - .08]], { w: .55 })); }
  }
  // RWS (mount frame: yaw axis at the origin): turntable, the yoke housing on the left, a rear electronics box
  RW.push(lathe([0, 0, 0], FY, [[0, .33], [.1, .33], [.12, .28]], { n: 22, gen: 4, rings: [0, 1], caps: true }));
  RW.push(box([-.44, .1, -.3], [-.22, .66, .24]));
  RW.push(box([-.22, .1, -.36], [.22, .26, -.06]));
  RW.push(cyl([-.22, AV.PIV[1], 0], [-.14, AV.PIV[1], 0], .09, { n: 12, gen: 0, caps: true }));
  RW.push(box([-.46, .3, .24], [-.36, .5, .28], fn()));
  // gun cradle (pitch): M2HB receiver and barrel, the sight head on the yoke side, the ammunition box on the right
  const py = AV.PIV[1];
  GN.push(box([-.1, py - .1, -.58], [.1, py + .12, .14]));
  GN.push(box([-.14, py - .16, -.34], [.14, py - .1, .1]));
  GN.push(box([-.07, py - .06, -.7], [.07, py + .08, -.58], fn()));
  for (const s of [-1, 1]) GN.push(cyl([s * .05, py, -.7], [s * .05, py - .02, -.8], .018, fn({ n: 6, gen: 0 })));
  GN.push(lathe([0, py, .14], FZ, [[0, .05], [.22, .05], [.23, .03], [1.1, .027], [1.12, .036], [1.2, .036]], { n: 12, gen: 3, rings: [0, 1, 4], caps: true }));
  GN.push(box([-.44, py + .24, -.16], [-.14, py + .5, .24]));
  GN.push(box([-.42, py + .16, -.05], [-.16, py + .24, .12], fn()));
  const SH = bx8([-.44, py + .24, -.16], [-.14, py + .5, .24]);
  for (const [u, v, r] of [[.3, .6, .065], [.72, .62, .045], [.72, .3, .035]]) GN.push(circle(V.add(fpt(SH, 4, 1 - u, v), [0, 0, .012]), FZ, r, 14, { w: .8, pts: false }));
  GN.push(box([.12, py - .2, -.44], [.36, py + .08, -.08]));
  GN.push(line([[.12, py + .02, -.2], [.1, py + .08, -.1]], fn({ w: .6 })));
  // rear ramp (shut pose, hinged at its foot): door in it, vision block, handles
  const RQ = bx8([-hw, ry, zr - .02], [hw, top, zr + AV.RAMP.th]);
  RP.push(hex(RQ, { bottom: true }));
  RP.push(fwin(RQ, 2, .2, .8, .08, .92, { al: .7 }));
  RP.push(box([-.08, 1.95, zr - .06], [.08, 2.08, zr - .02], fn()));
  for (const s of [-1, 1]) RP.push(line([[s * .45, 1.5, zr - .04], [s * .45, 1.3, zr - .04]], fn({ w: .6 })));
  for (const s of [-1, 1]) RP.push(cyl([s * .85, ry, zr - .02], [s * .55, ry, zr - .02], .05, fn({ n: 8, gen: 0 })));
  return { UH, LH, TV, FIT, RW, GN, RP, HT };
});
/* obox on the roof: centre c, rotated by a about Y, half sizes (periscope heads) */
function obox(c, a, hx, hy, hz) {
  const ca = Math.cos(a), sa = Math.sin(a), q = (x, y, z) => [c[0] + ca * x + sa * z, c[1] + y, c[2] - sa * x + ca * z];
  return hex([q(-hx, 0, -hz), q(hx, 0, -hz), q(hx, 0, hz), q(-hx, 0, hz), q(-hx, 2 * hy, -hz), q(hx, 2 * hy, -hz), q(hx, 2 * hy, hz), q(-hx, 2 * hy, hz)], fn());
}
/* water propeller in its shroud: shroud static (in the hull part), blades turn with prop */
const AV_PROP = memo(() => AV.PROPS.map((c, i) => {
  const sx = i ? 1 : -1;
  return [blades(c, [0, 0, -1], 4, .07, AV.PR - .02, { chord: .9, taper: .7, pitch: .35 * sx, edge: .85 }), lathe([c[0], c[1], c[2] + .05], [0, 0, -1], [[0, .07], [.12, .05], [.16, 0]], { n: 10, gen: 2, rings: [0] })];
}));
const AV_SHROUD = memo(() => {
  const P = [];
  for (const c of AV.PROPS) {
    P.push(lathe([c[0], c[1], c[2] + .24], [0, 0, -1], [[0, AV.PR + .07], [.06, AV.PR + .09], [.5, AV.PR + .09], [.52, AV.PR + .06]], { n: 24, gen: 6, rings: [0, 2, 3] }));
    P.push(lathe([c[0], c[1], c[2] + .24], [0, 0, -1], [[0, AV.PR + .01], [.52, AV.PR + .01]], { n: 24, gen: 0, sil: false, rings: [] }));
    P.push(box([c[0] - .05, c[1] + AV.PR + .08, c[2] - .15], [c[0] + .05, .86, c[2] + .2]));
    P.push(cyl([c[0], c[1], c[2] + .24], [c[0], c[1], c[2] + .5], .06, fn({ n: 8, gen: 0 })));
  }
  return P;
});
const avPropXf = i => st => about(R.z((i ? 1 : -1) * (st.prop || 0)), AV.PROPS[i]);
function acv() {
  const g = AV_GEO(), pr = AV_PROP();
  const whL = st => wheelSide(AV.AX, -1, st.wheel || 0, { r: AV.WR, w: AV.WW, x: AV.WX, y: AV.WR, lugs: 15, n: 24 });
  const whR = st => wheelSide(AV.AX, 1, st.wheel || 0, { r: AV.WR, w: AV.WW, x: AV.WX, y: AV.WR, lugs: 15, n: 24 });
  return {
    name: 'acv', L: ACV.L, B: ACV.B, A: ACV,
    parts: [
      { name: 'hull', label: 'Upper hull · ACV-1.1', prims: g.UH },
      { name: 'lower', label: 'Lower hull · V-shaped · boat bow', prims: g.LH.concat(AV_SHROUD()) },
      { name: 'vane', label: 'Trim vane · folded', prims: g.TV },
      { name: 'hatches', label: 'Hatches · driver · commander · troop ×2', prims: g.HT },
      { name: 'fittings', label: 'Engine deck grilles · lights · stowage · antennas', prims: g.FIT },
      { name: 'wheelsL', label: 'Wheels ×4 · Ø 1.24 m · L', prims: whL({}), dyn: whL },
      { name: 'wheelsR', label: 'Wheels ×4 · Ø 1.24 m · R', prims: whR({}), dyn: whR },
      { name: 'rws', label: 'Protector RS4 · remote weapon station', prims: g.RW, xf: avYawXf },
      { name: 'gun', label: 'M2HB .50 cal · sight head · ammunition box', prims: g.GN, xf: avGunXf },
      { name: 'ramp', label: 'Rear ramp · door', prims: g.RP, xf: avRampXf },
      { name: 'propL', label: 'Water propeller · shrouded · L', prims: pr[0], xf: avPropXf(0) },
      { name: 'propR', label: 'Water propeller · shrouded · R', prims: pr[1], xf: avPropXf(1) },
    ],
  };
}
/* cutaway: + the Cursor 16 power pack and its cooling, the transmission and driveline, the troop compartment's benches,
   the driver's station, fuel cells */
function acvCut() {
  const M = acv(), PP = [], DL = [], TR = [], DV = [];
  // power pack (front right): the engine block, the cooling pack above, the transmission behind
  PP.push(box([.12, .82, 1.9], [1.0, 1.72, 2.85]));
  PP.push(box([.2, 1.72, 2.1], [.95, 2.05, 2.95]));
  for (let k = 0; k < 6; k++) PP.push(cyl([.3 + k * .12, 1.72, 2.2], [.3 + k * .12, 1.88, 2.2], .045, fn({ n: 8, gen: 0 })));
  PP.push(box([.15, 1.72, 3.0], [1.05, 2.4, 3.2]));
  PP.push(blades([.6, 2.06, 3.0], [0, 0, -1], 7, .08, .3, fn({ chord: .5, taper: .8, pitch: .3, hub: true, edge: .6, pts: false })));
  PP.push(box([.2, .72, 1.35], [.9, 1.3, 1.95]));
  // driveline: transfer case and shafts to the four axles, the axle differentials
  DL.push(box([-.25, .6, .8], [.25, .9, 1.3]));
  DL.push(cyl([0, .7, .8], [0, .6, AV.AX[3] + .2], .06, { n: 10, gen: 0 }));
  DL.push(cyl([0, .7, 1.3], [0, .62, AV.AX[0] - .2], .06, { n: 10, gen: 0 }));
  for (const z of AV.AX) { DL.push(box([-.22, .5, z - .2], [.22, .75, z + .2])); DL.push(cyl([-.95, .62, z], [.95, .62, z], .05, fn({ n: 8, gen: 0 }))); }
  // independent suspension: wishbones and struts at each wheel
  for (const z of AV.AX) for (const s of [-1, 1]) {
    DL.push(box([s * .72, .5, z - .12], [s * 1.08, .58, z + .12], fn()));
    DL.push(box([s * .72, .92, z - .1], [s * 1.04, .98, z + .1], fn()));
    DL.push(cyl([s * .85, .7, z - .2], [s * .92, 1.3, z - .28], .05, fn({ n: 6, gen: 0 })));
  }
  // troop compartment: two bench rows facing inward, seat backs, the centre aisle to the ramp; the driver's station
  for (const s of [-1, 1]) {
    TR.push(box([s * .55, .98, -4.2], [s * .98, 1.4, -.4]));
    TR.push(box([s * .96, 1.4, -4.2], [s * 1.0, 2.25, -.4], fn()));
    for (let z = -4.0; z < -.5; z += .55) TR.push(line([[s * .55, 1.42, z], [s * .97, 1.42, z]], fn({ w: .5 })));
  }
  TR.push(box([-1.0, .93, -4.3], [1.0, .98, -.2], fn()));
  DV.push(box([-.95, .95, 2.35], [-.35, 1.45, 2.85]));
  DV.push(box([-.92, 1.45, 2.3], [-.38, 2.05, 2.4], fn()));
  DV.push(box([-1.0, 1.3, 2.95], [-.3, 1.7, 3.2]));
  DV.push(box([-.85, .95, 1.1], [-.3, 1.45, 1.6]));
  DV.push(box([-1.0, .95, -.2], [-.3, 1.8, .6]));
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'powerpack', label: 'Iveco Cursor 16 · diesel · cooling pack', prims: PP }, hidden));
  parts.push(O({ name: 'driveline', label: 'Allison transmission · 8×8 driveline · suspension', prims: DL }, hidden));
  parts.push(O({ name: 'troops', label: 'Troop compartment · 13 marines · benches ×2', prims: TR }, hidden));
  parts.push(O({ name: 'crew', label: 'Driver · commander · gunner stations', prims: DV }, hidden));
  return O(M, { name: 'acv_cut', parts });
}

/* ================================================================ Kornet-EM combat vehicle · GAZ-233014 Tigr-M
   Tigr-M: 5.7 × 2.4 × 2.4 m, 3.3 m wheelbase, 4×4, an angular armoured body: bonnet, four-door crew cab and the rear body
   under one roof. The Kornet-EM combat module: two launch units side by side in the rear body, each a sighting /
   guidance unit (thermal and TV channels, laser beam) under a pack of four 9M133 containers and a cover plate; both
   rise through the roof on lifting columns to fire and retract flush for the road (8 rounds ready, 8 in reserve).
   Vehicle frame: origin on the ground under the centre, bow +Z. */
const TG = {
  AX: [1.65, -1.65], WR: .52, WW: .34, WX: .83, ROOF: 2.32, BELT: 1.55,
  UX: .52, UZ: -1.75, PY: 2.95, TRAVEL: 1.1,
  TUBE: { r: .09, rr: .1, z0: -.56, z1: .66, xs: [-.105, .105], ys: [.13, .33] },
};
const tgUp = st => sat(st && st.up !== undefined ? st.up : 1);
const tgLift = st => ss(0, .82, tgUp(st));
const tgAim = st => ss(.82, 1, tgUp(st));
/* launch unit u (-1 left, 1 right): lift, then yaw about its column, then pitch about its trunnion */
const tgPiv = u => [u * TG.UX, TG.PY, TG.UZ];
const tgColXf = u => st => T3([0, -(1 - tgLift(st)) * TG.TRAVEL, 0]);
const tgYawXf = u => st => X.mul(tgColXf(u)(st), about(R.y((st.yaw || 0) * tgAim(st)), tgPiv(u)));
const tgUnitXf = u => st => X.mul(tgColXf(u)(st), about(R.mul(R.y((st.yaw || 0) * tgAim(st)), R.x(-(st.pitch || 0) * tgAim(st))), tgPiv(u)));
/* container order: left unit then right, top row outboard first (the firing order) */
const TG_ORDER = [];
for (const u of [-1, 1]) for (const [r, c] of [[1, 1], [1, 0], [0, 1], [0, 0]]) TG_ORDER.push([u, c ? u * TG.TUBE.xs[1] : u * TG.TUBE.xs[0], TG.TUBE.ys[r]]);
/* container k mid-point / mouth in the vehicle frame for a state */
const tgTube = (k, st, z) => { const [u, dx, dy] = TG_ORDER[k]; return X.ap(tgUnitXf(u)(st || {}), [u * TG.UX + dx, TG.PY + dy, TG.UZ + z]); };
export const KORNET = {
  L: 5.7, B: 2.4, H: 2.4, AXLES: TG.AX, TYRE_R: TG.WR,
  // the launch units' common pivot line when raised (centre between the two units) and each unit's pivot
  MAST: [0, TG.PY, TG.UZ], UNITS: [tgPiv(-1), tgPiv(1)], TRAVEL: TG.TRAVEL,
  // the eight container mouths [x, y, z] (vehicle frame) for a state, in the firing order; their axes
  muzzles: st => TG_ORDER.map((_, k) => tgTube(k, st, TG.TUBE.z1 + .01)),
  tubes: st => TG_ORDER.map((_, k) => { const a = tgTube(k, st, TG.TUBE.z0), b = tgTube(k, st, TG.TUBE.z1 + .01); return { base: a, mouth: b, dir: V.norm(V.sub(b, a)) }; }),
  unitXf: (u, st) => tgUnitXf(u)(st || {}),
};
const TG_GEO = memo(() => {
  const CH = [], BD = [], BN = [], CB = [], SP = [];
  const { ROOF } = TG;
  // chassis: belly pan between the wheels, suspension arms, axle housings
  CH.push(box([-.78, .42, -2.5], [.78, 1.06, 2.5], { bottom: true, skip: [1, 2, 4], ds: 1.5 }));
  for (const z of TG.AX) for (const s of [-1, 1]) {
    CH.push(box([s * .5, .44, z - .1], [s * .86, .52, z + .1], fn()));
    CH.push(box([s * .5, .78, z - .08], [s * .84, .84, z + .08], fn()));
    CH.push(cyl([s * .6, .56, z + .22], [s * .7, 1.08, z + .3], .05, fn({ n: 6, gen: 0 })));
  }
  for (const z of TG.AX) CH.push(box([-.3, .44, z - .2], [.3, .7, z + .2]));
  // lower body over the wheels, sills between the arches, nose and tail blocks, the arch flares
  const YB = TG.BELT;
  BD.push(hex([[-1.1, 1.05, -2.85], [1.1, 1.05, -2.85], [1.1, 1.05, .98], [-1.1, 1.05, .98], [-1.12, YB, -2.85], [1.12, YB, -2.85], [1.12, YB, .98], [-1.12, YB, .98]], { skip: [1, 4] }));
  for (const s of [-1, 1]) {
    BD.push(box([s > 0 ? .78 : -1.1, .58, -1.05], [s > 0 ? 1.1 : -.78, 1.05, 1.05], { bottom: true, skip: [1] }));
    // arch flares: a band round each wheel opening
    for (const z of TG.AX) {
      const r0 = .64, N = 8, P = [];
      for (let k = 0; k <= N; k++) { const a = mix(8, 172, k / N) * DEG; P.push([z + Math.cos(a) * r0, .56 + Math.sin(a) * r0]); }
      for (let k = 0; k < N; k++) {
        const [za, ya] = P[k], [zb, yb] = P[k + 1];
        BD.push(hex([[s * 1.07, ya, za], [s * 1.2, ya, za], [s * 1.2, yb, zb], [s * 1.07, yb, zb], [s * 1.07, ya + .1, za], [s * 1.2, ya + .1, za], [s * 1.2, yb + .1, zb], [s * 1.07, yb + .1, zb]], { skip: [5] }));
      }
    }
    for (const z of [.98, -.1, -1.2]) BD.push(line([[s * 1.125, .62, z], [s * 1.125, YB - .02, z]], fn({ w: .5 })));
    for (const z of [.45, -.65]) BD.push(box([s * 1.08, .6, z - .3], [s * 1.2, .66, z + .3], fn()));                    // steps
  }
  BD.push(box([-1.1, .55, 2.2], [1.1, 1.05, 2.8], { bottom: true, skip: [1] }));
  BD.push(box([-1.1, .55, -2.85], [1.1, 1.05, -2.2], { bottom: true, skip: [1] }));
  // front bumper, winch, bull bar (tubular guard round the grille and lamps), tow hooks; rear bumper, hitch, tail lamps
  BD.push(box([-1.15, .52, 2.8], [1.15, .76, 2.97]));
  BD.push(box([-.3, .56, 2.97], [.3, .72, 3.02], fn()));
  const bb = (a, b) => BD.push(cyl(a, b, .045, { n: 8, gen: 0 }));
  for (const s of [-1, 1]) { bb([s * .45, .76, 2.95], [s * .45, 1.5, 2.95]); bb([s * 1.02, .76, 2.94], [s * 1.02, 1.3, 2.93]); bb([s * .45, 1.5, 2.95], [s * .98, 1.35, 2.93]); }
  bb([-.45, 1.5, 2.95], [.45, 1.5, 2.95]);
  bb([-1.02, 1.08, 2.94], [1.02, 1.08, 2.94]);
  for (const s of [-1, 1]) BD.push(box([s * .7 - .06, .6, 2.97], [s * .7 + .06, .66, 3.06], fn()));
  BD.push(box([-1.15, .55, -3.0], [1.15, .78, -2.85]));
  BD.push(box([-.1, .58, -3.12], [.1, .7, -3.0], fn()));
  for (const s of [-1, 1]) BD.push(box([s * .95 - .1, 1.3, -2.87], [s * .95 + .1, 1.55, -2.85], fn()));
  // bonnet: raked front with the grille and round headlamps, a scoop on top
  const BNq = [[-1.1, 1.05, .98], [1.1, 1.05, .98], [1.1, 1.05, 2.8], [-1.1, 1.05, 2.8], [-1.04, 1.58, .98], [1.04, 1.58, .98], [1.02, 1.49, 2.73], [-1.02, 1.49, 2.73]];
  BN.push(hex(BNq, { skip: [2] }));
  BN.push(fwin(BNq, 4, .28, .72, .12, .85, { al: .8 }));
  BN.push(panel([fpt(BNq, 4, .3, .15), fpt(BNq, 4, .7, .15), fpt(BNq, 4, .7, .82), fpt(BNq, 4, .3, .82)].map(p => V.add(p, [0, 0, .015])), { hatch: 7, hatch2: 5, edge: .5, pts: false }));
  for (const s of [-1, 1]) {
    BN.push(circle([s * .78, 1.34, 2.79], FZ, .11, 16, { w: .85, pts: false }));
    BN.push(circle([s * .78, 1.34, 2.795], FZ, .06, 12, fn({ w: .5, pts: false })));
    BN.push(box([s * .95 - .05, 1.12, 2.78], [s * .95 + .05, 1.2, 2.8], fn()));
  }
  BN.push(hex([[-.3, 1.56, 1.35], [.3, 1.56, 1.35], [.3, 1.52, 2.1], [-.3, 1.52, 2.1], [-.26, 1.63, 1.4], [.26, 1.63, 1.4], [.26, 1.57, 2.05], [-.26, 1.57, 2.05]], fn()));
  // crew cab and rear body (the greenhouse): windscreen, door windows, doors, roof with the two launcher openings
  const G = [[-1.12, YB, -2.85], [1.12, YB, -2.85], [1.12, YB, .98], [-1.12, YB, .98], [-.98, ROOF, -2.8], [.98, ROOF, -2.8], [.98, ROOF, .6], [-.98, ROOF, .6]];
  const uz = z => (z + 2.8) / 3.4, ux = x => (x + .98) / 1.96;
  const rh = [TG.UZ - .62, TG.UZ + .67];
  const wv = [.16, .86];
  CB.push(...hexHoled(G, {
    4: [[.05, .47, .08, .9], [.53, .95, .08, .9]],
    3: [[.74, .91, ...wv], [.5, .67, ...wv]],
    5: [[.09, .26, ...wv], [.33, .5, ...wv]],
    1: [[ux(-TG.UX - .32), ux(-TG.UX + .32), uz(rh[0]), uz(rh[1])], [ux(TG.UX - .32), ux(TG.UX + .32), uz(rh[0]), uz(rh[1])]],
  }));
  for (const s of [-1, 1]) {
    const f = s > 0 ? 3 : 5, fz = s > 0 ? (u => u) : (u => 1 - u);
    CB.push(fwin(G, f, fz(.7), fz(.935), .02, .96, fn({ al: .55 })));
    CB.push(fwin(G, f, fz(.46), fz(.69), .02, .96, fn({ al: .55 })));
    CB.push(line([[s * 1.1, 1.66, .1], [s * 1.1, 1.66, -.1]], fn({ w: .7 })));
    // mirror on its arm
    CB.push(line([[s * 1.06, 1.9, .9], [s * 1.36, 2.0, .95], [s * 1.36, 1.72, .95]], { w: .7, pts: false }));
    CB.push(box([s * 1.3, 1.68, .91], [s * 1.42, 2.04, .97], fn()));
    // roof rails, rear whip antennas
    CB.push(line([[s * .9, ROOF + .08, .4], [s * .9, ROOF + .08, -2.7]], fn({ w: .5 })));
    for (const z of [.35, -1.0, -2.65]) CB.push(line([[s * .9, ROOF, z], [s * .9, ROOF + .08, z]], fn({ w: .5 })));
    CB.push(lathe([s * .88, ROOF, -2.62], FY, [[0, .05], [.08, .04]], fn({ n: 8, gen: 0, rings: [0] })));
    CB.push(line([[s * .88, ROOF + .08, -2.62], [s * .87, ROOF + 1.2, -2.64], [s * .85, ROOF + 2.1, -2.7]], { w: .55 }));
  }
  // snorkel air intake up the right A-pillar
  CB.push(cyl([1.1, 1.25, .95], [1.1, 2.2, .72], .07, { n: 10, gen: 2 }));
  CB.push(box([1.02, 2.2, .6], [1.2, 2.34, .82]));
  // windscreen wipers, rear door with the spare wheel carrier
  for (const s of [-1, 1]) CB.push(line([V.add(fpt(G, 4, s > 0 ? .1 : .6, .12), [0, .01, .02]), V.add(fpt(G, 4, s > 0 ? .4 : .9, .6), [0, .01, .02])], fn({ w: .45, pts: false })));
  CB.push(fwin(G, 2, .1, .62, .02, .95, fn({ al: .6 })));
  // spare wheel on the rear door (axis along Z)
  const sp = [];
  HD.wheel(sp, 0, 1, { r: TG.WR, w: TG.WW, x: 0, y: 0, lugs: 13, n: 22, valve: false });
  const Tsp = X.make(R.y(PI / 2), [-.3, 1.52, -2.86]);
  SP.push(...tps(Tsp, sp));
  SP.push(box([-.42, 1.4, -2.95], [-.18, 1.64, -2.86], fn()));
  return { CH, BD, BN, CB, SP };
});
/* a launch unit, in the vehicle frame at the raised pose (up 1, yaw 0, pitch 0): column (lifts), yoke (turns),
   sighting unit + container pack + cover plate (turn and elevate) */
const TG_UNIT = memo(() => {
  const out = {};
  for (const u of [-1, 1]) {
    const [px, py, pz] = tgPiv(u), COL = [], YK = [], SG = [], PK = [], PL = [];
    COL.push(box([px - .11, py - 1.28, pz - .11], [px + .11, py - .42, pz + .11], { bottom: true }));
    COL.push(line([[px - .115, py - 1.1, pz + .05], [px - .115, py - .5, pz + .05]], fn({ w: .45 })));
    YK.push(lathe([px, py - .42, pz], FY, [[0, .17], [.08, .17], [.1, .14]], { n: 18, gen: 4, rings: [0, 1], caps: true }));
    YK.push(box([px + u * .17, py - .34, pz - .14], [px + u * .25, py + .04, pz + .14]));
    YK.push(box([px - .14, py - .34, pz - .16], [px + .14, py - .3, pz + .16], fn()));
    // sighting / guidance unit: a box under the front of the pack, optical windows on its face, a side electronics box
    const S8 = bx8([px - .16, py - .32, pz - .06], [px + .16, py - .02, pz + .4]);
    SG.push(hex(S8, { bottom: true }));
    for (const [uu, vv, rr] of [[.62, .55, .075], [.28, .74, .036], [.28, .5, .036], [.28, .26, .036], [.72, .2, .045]]) SG.push(circle(V.add(fpt(S8, 4, u > 0 ? uu : 1 - uu, vv), [0, 0, .012]), FZ, rr, 14, { w: .85, pts: false }));
    SG.push(box([px - .16, py - .06, pz + .4], [px + .16, py - .02, pz + .47], fn()));
    SG.push(box([px - u * .16 - (u > 0 ? .1 : 0), py - .28, pz], [px - u * .16 + (u > 0 ? 0 : .1), py - .08, pz + .3], fn()));
    SG.push(cyl([px + u * .12, py, pz + .1], [px + u * .25, py, pz + .1], .05, { n: 10, gen: 0, caps: true }));
    // container pack: cradle plate, four containers with end rims and a mid band, two straps
    SG.push(box([px - .23, py - .02, pz - .42], [px + .23, py + .03, pz + .5]));
    const { r, rr, z0, z1, xs, ys } = TG.TUBE;
    for (const dx of xs) for (const dy of ys) {
      const a = [px + dx, py + dy, pz];
      PK.push(lathe([a[0], a[1], pz + z0], FZ, [[0, rr], [.07, rr], [.08, r], [z1 - z0 - .08, r], [z1 - z0 - .07, rr], [z1 - z0, rr]], { n: 18, gen: 4, rings: [0, 1, 4, 5], caps: true }));
      PK.push(lathe([a[0], a[1], pz + .02], FZ, [[0, r + .006], [.05, r + .006]], fn({ n: 16, gen: 0, rings: [0, 1] })));
      PK.push(circle([a[0], a[1], pz + z1 + .004], FZ, r - .015, 14, fn({ w: .6, pts: false })));
    }
    for (const zz of [pz - .25, pz + .3]) PK.push(box([px - .22, py + .02, zz - .04], [px + .22, py + .45, zz + .04], fn({ skip: [0, 1] })));
    // cover plate over the pack (closes the roof opening when the unit is down)
    PL.push(box([px - .31, py + .44, pz - .6], [px + .31, py + .47, pz + .66], { bottom: true }));
    PL.push(fwin(bx8([px - .31, py + .44, pz - .6], [px + .31, py + .47, pz + .66]), 1, .05, .95, .04, .96, fn({ al: .45 })));
    for (const zz of [pz - .4, pz + .45]) PL.push(box([px - .02, py + .38, zz - .03], [px + .02, py + .44, zz + .03], fn()));
    out[u] = { COL, YK, SG, PK, PL };
  }
  return out;
});
function kornet() {
  const g = TG_GEO(), un = TG_UNIT();
  const wo = { r: TG.WR, w: TG.WW, x: TG.WX, y: TG.WR, lugs: 13, n: 24 };
  const whL = st => wheelSide(TG.AX, -1, st.wheel || 0, wo), whR = st => wheelSide(TG.AX, 1, st.wheel || 0, wo);
  const raised = st => tgUp(st) > .02 || !!st.xray;
  const parts = [
    { name: 'chassis', label: 'Chassis · independent suspension', prims: g.CH },
    { name: 'wheelsL', label: 'Wheels ×2 · 335/80 R20 · L', prims: whL({}), dyn: whL },
    { name: 'wheelsR', label: 'Wheels ×2 · 335/80 R20 · R', prims: whR({}), dyn: whR },
    { name: 'body', label: 'Armoured body · GAZ-233014 Tigr-M', prims: g.BD },
    { name: 'bonnet', label: 'Bonnet · grille · bull bar', prims: g.BN },
    { name: 'cab', label: 'Crew cab · rear body · roof', prims: g.CB },
    { name: 'spare', label: 'Spare wheel', prims: g.SP },
  ];
  for (const [u, nm] of [[-1, 'L'], [1, 'R']]) {
    const s = un[u], side = u < 0 ? 'L' : 'R';
    parts.push({ name: 'column' + nm, label: 'Lifting column · ' + side, prims: s.COL, xf: tgColXf(u), show: raised });
    parts.push({ name: 'yoke' + nm, label: 'Traverse yoke · ' + side, prims: s.YK, xf: tgYawXf(u), show: raised });
    parts.push({ name: 'sight' + nm, label: 'Sighting / guidance unit · thermal · laser · ' + side, prims: s.SG, xf: tgUnitXf(u), show: raised });
    parts.push({ name: 'pack' + nm, label: 'Launch pack · 4 × 9M133 · ' + side, prims: s.PK, xf: tgUnitXf(u), show: raised });
    parts.push({ name: 'plate' + nm, label: 'Cover plate · roof hatch · ' + side, prims: s.PL, xf: tgUnitXf(u) });
  }
  return { name: 'kornet', L: KORNET.L, B: KORNET.B, A: KORNET, parts };
}
/* cutaway: + the diesel under the bonnet, the crew seats and the operator's console, the reserve rounds in their racks,
   the lifting columns' guide sleeves */
const TG_RELOAD = [];
for (const s of [-1, 1]) for (const y of [1.2, 1.42, 1.64, 1.86]) TG_RELOAD.push([s * .9, y, -2.0]);   // racks against the rear body's walls
function kornetCut() {
  const M = kornet(), EN = [], ST = [], RL = [], SL = [];
  EN.push(box([-.42, .72, 1.3], [.42, 1.42, 2.25]));
  EN.push(box([-.36, 1.42, 1.4], [.36, 1.5, 2.15], fn()));
  EN.push(box([-.62, .75, 2.4], [.62, 1.45, 2.55]));
  EN.push(blades([0, 1.1, 2.35], [0, 0, -1], 7, .08, .28, fn({ chord: .5, taper: .8, pitch: .3, hub: true, edge: .6, pts: false })));
  EN.push(box([-.25, .62, .7], [.25, .98, 1.3]));
  EN.push(cyl([0, .6, .7], [0, .55, -1.45], .045, fn({ n: 8, gen: 0 })));
  for (const [x, z] of [[-.5, .15], [.5, .15], [-.5, -.95], [.5, -.95]]) { ST.push(box([x - .24, 1.0, z - .25], [x + .24, 1.18, z + .25])); ST.push(box([x - .24, 1.18, z - .3], [x + .24, 1.8, z - .22], fn())); }
  ST.push(box([-.3, 1.1, -1.35], [.3, 1.75, -1.2]));
  ST.push(box([-.25, 1.55, -1.3], [.25, 1.72, -1.24], fn()));
  const { r, rr } = TG.TUBE;
  for (const [x, y, z] of TG_RELOAD) RL.push(lathe([x, y, z - .6], FZ, [[0, rr], [.07, rr], [.08, r], [1.14, r], [1.15, rr], [1.22, rr]], { n: 14, gen: 3, rings: [0, 5], caps: true }));
  for (const s of [-1, 1]) for (const zz of [-2.5, -1.58]) RL.push(box([s * .78, 1.08, zz], [s * 1.02, 1.98, zz + .08], fn({ skip: [0, 1] })));
  for (const u of [-1, 1]) { const [px, , pz] = tgPiv(u); SL.push(box([px - .15, .75, pz - .15], [px + .15, 1.72, pz + .15])); }
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'engine', label: 'YaMZ-534 · turbodiesel · 215 hp', prims: EN }, hidden));
  parts.push(O({ name: 'seats', label: 'Crew seats ×4 · operator console', prims: ST }, hidden));
  parts.push(O({ name: 'reload', label: 'Reserve rounds ×8 · 9M133 in containers', prims: RL }, hidden));
  parts.push(O({ name: 'sleeves', label: 'Column guides · lifting drives', prims: SL }, hidden));
  return O(M, { name: 'kornet_cut', parts });
}

/* ================================================================ 9M133 Kornet · closed shell
   1.2 m, Ø 152 mm, 0.46 m across the fins: an ogive nose, two small canards behind it, four wrap-around tail fins that
   unfold after launch (st.fin 0 folded round the body .. 1 open). Origin mid-body, nose +Z. */
const KM = { r: .076, z0: -.6, z1: .6, span: .155 };
function kmFins(st) {
  const f = st.fin === undefined ? 1 : sat(st.fin), { r, z0, span } = KM, out = [];
  const K = 6, th0 = (1 - f) * PI / 2, kap = (1 - f) / (r + .006);
  for (const deg of [45, 135, 225, 315]) {
    const a0 = deg * DEG, ca = Math.cos(a0), sa = Math.sin(a0), L = [], T = [];
    // the fin's centreline in its root plane: from the root at radius r, bending round the body when folded
    let x = r + .002, y = 0, ph = th0;
    const pts = [[x, y]];
    for (let k = 0; k < K; k++) { const ds = span / K; x += Math.cos(ph) * ds; y += Math.sin(ph) * ds; ph += kap * ds; pts.push([x, y]); }
    pts.forEach(([px, py], k) => {
      const t = k / K, zl = z0 + .02 + mix(.15, .115, t) + t * -.01, zt = z0 + .012;
      const w = [ca * px - sa * py, sa * px + ca * py];
      L.push([w[0], w[1], zl]); T.push([w[0], w[1], zt]);
    });
    for (let k = 0; k < K; k++) {
      const q = [T[k], T[k + 1], L[k + 1], L[k]];
      out.push(SA.plate(q, V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0])))));
      out.push(SA.plate([q[1], q[0], q[3], q[2]], V.mul(V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]))), -1)));
    }
    out.push(line([...L, ...T.slice().reverse(), L[0]], { w: .95, pts: false }));
  }
  return out;
}
function kornetMsl() {
  const { r, z0, z1 } = KM, NS = [], BD = [], CN = [], TL = [];
  NS.push(lathe([0, 0, z1 - .2], FZ, [[0, r], [.07, r * .97], [.12, r * .86], [.155, r * .68], [.18, r * .44], [.195, r * .2], [.2, .012]], { n: 20, gen: 5, rings: [0, 3] }));
  BD.push(lathe([0, 0, z0 + .06], FZ, [[0, r], [z1 - .2 - z0 - .06, r]], { n: 20, gen: 6, rings: [0, 1] }));
  for (const z of [-.24, .1, .3]) BD.push(ringW([0, 0, z], FZ, r + .002, fn({ n: 18 })));
  for (const d of [0, 180]) {
    const a = d * DEG, c = Math.cos(a), s = Math.sin(a), at = (q, z) => [c * q, s * q, z];
    CN.push(panel([at(r, .33), at(r + .048, .325), at(r + .048, .275), at(r, .265)], { edge: 1 }));
    CN.push(SA.plate([at(r, .33), at(r + .048, .325), at(r + .048, .275), at(r, .265)], [0, 1, 0]));
  }
  TL.push(lathe([0, 0, z0], FZ, [[0, r * .72], [.015, r * .86], [.06, r]], { n: 20, gen: 4, rings: [0, 2], caps: true }));
  TL.push(circle([0, 0, z0 - .002], FZ, r * .38, 14, fn({ w: .7, pts: false })));
  return {
    name: 'kornet_msl', LEN: 1.2, R: r,
    parts: [
      { name: 'nose', label: 'Nose · 9M133', prims: NS },
      { name: 'canards', label: 'Canards ×2', prims: CN },
      { name: 'body', label: '9M133 Kornet · Ø 152 mm', prims: BD },
      { name: 'fins', label: 'Tail fins ×4 · wrap-around', prims: kmFins({}), dyn: kmFins },
      { name: 'tail', label: 'Tail · guidance receiver', prims: TL },
    ],
  };
}
export { lcac, lcacCut, acv, acvCut, kornet, kornetCut, kornetMsl };

/* ================================================================ registry entries */
const ANG = [-PI, PI, 0];
export const AMPHIB_STATES = {
  lcac: { prop: [0, TAU, 0], fan: [0, TAU, 0], cushion: [0, 1, 1], rampB: [0, 1, 0], rampS: [0, 1, 0], rudder: [-.5, .5, 0], thrust: ANG },
  acv: { wheel: [0, TAU, 0], yaw: ANG, pitch: [-.35, 1.0, 0], ramp: [0, 1, 0], prop: [0, TAU, 0] },
  kornet: { wheel: [0, TAU, 0], up: [0, 1, 1], yaw: ANG, pitch: [-.2, .6, 0] },
  kornet_msl: { fin: [0, 1, 1] },
};
export const AMPHIB_INFO = {
  lcac: { name: 'LCAC · landing craft air cushion', kind: 'unit', size: [26.8, 14.3, 7.1], s: [.06, .14, .4] },
  acv: { name: 'ACV-1.1 · amphibious combat vehicle', kind: 'unit', size: [8.9, 3.1, 2.8], s: [.027, .065, .2] },
  kornet: { name: 'Kornet-EM · Tigr-M', kind: 'unit', size: [5.7, 2.4, 2.4], s: [.022, .055, .16] },
  kornet_msl: { name: '9M133 Kornet', kind: 'munition', size: [1.2, .46, .152], s: [.004, .01, .03] },
};
const E = (id, parts, label, size, explode, w0, cls, more) => O({ id, parts, label, size: size || '', explode, w0, cls }, more || {});
export const AMPHIB_ANATOMY = {
  lcac: {
    model: 'lcac_cut', frame: 'hull', title: 'LCAC · landing craft air cushion', size: '26.8 × 14.3 m · 7.1 m on cushion',
    note: 'Assault hovercraft of the US Navy: 60 t (75 t overload) from the well deck to the beach at 40+ knots on a 1.5 m skirt; four TF40B gas turbines, two for lift and two for the propellers.',
    st: { cushion: 1, rampB: 0, rampS: 0 }, view: { yaw: 2.3, pitch: .34 },
    parts: [
      E('01', ['propS'], 'Propellers ×2 · 4 blades · reversible pitch', 'Ø 3.58 m', [3.4, 2.2, -4.6], .04, 'part', { side: 'R' }),
      E(null, ['propP'], 'Propeller · port', '', [-3.4, 2.2, -4.6], .04, 'part'),
      E('02', ['rudderS1', 'rudderS2'], 'Rudders ×4 · twin behind each shroud', '', [3.4, 2.2, -6.6], 0, 'part', { side: 'R' }),
      E(null, ['rudderP1', 'rudderP2'], 'Rudders · port', '', [-3.4, 2.2, -6.6], 0, 'part'),
      E('03', ['ductS'], 'Propeller shrouds ×2 · front guards', '', [3.4, 2.2, -2.4], .08, 'shell', { side: 'L' }),
      E(null, ['ductP'], 'Propeller shroud · port', '', [-3.4, 2.2, -2.4], .08, 'shell'),
      E('04', ['cabS'], 'Control cab · crew 3', '', [3.4, 3.4, .6], .12, 'shell', { side: 'R' }),
      E('05', ['cabP'], 'Port cabin · deck crew · troops', '', [-3.4, 3.0, .6], .12, 'shell', { side: 'L' }),
      E('06', ['thrusterS'], 'Bow thrusters ×2 · swivelling', '', [3.4, 2.6, 0], .16, 'part', { side: 'R' }),
      E(null, ['thrusterP'], 'Bow thruster · port', '', [-3.4, 2.6, 0], .16, 'part'),
      E('07', ['stations'], 'Crew stations · consoles · troop seats', '', [2.2, 2.2, .6], .2, 'part', { side: 'L' }),
      E('08', ['rampB', 'flapB'], 'Bow ramp · folding extension', '8.8 m', [0, .8, 3.4], .22, 'part', { side: 'R' }),
      E('09', ['rampS'], 'Stern ramp', '4.6 m', [0, .8, -3.6], .22, 'part', { side: 'L' }),
      E('10', ['fanS1', 'fanS2', 'fanP1', 'fanP2'], 'Lift fan impellers', '', [0, 1.9, 0], .26, 'part', { side: 'R' }),
      E('11', ['sideS'], 'Side structures ×2 · engine rooms', '22 m', [3.4, .6, 0], .3, 'shell', { side: 'R' }),
      E(null, ['sideP'], 'Side structure · port', '', [-3.4, .6, 0], .3, 'shell'),
      E('12', ['turbines'], 'TF40B gas turbines ×4', '16 000 hp', [1.7, 1.0, 0], .36, 'part', { side: 'L' }),
      E('13', ['fans'], 'Lift fans ×4 · double-entry', 'Ø 1.6 m', [1.7, 1.5, 0], .4, 'part', { side: 'R' }),
      E('14', ['drive'], 'Gearboxes · shafts', '', [1.7, .4, 0], .42, 'part', { side: 'L' }),
      E('15', ['skirt'], 'Skirt · bag and finger', '1.5 m', [0, -1.6, 0], .46, 'shell', { side: 'L' }),
      E('16', ['tanks'], 'Fuel tanks ×4', '', [0, -.9, 0], .5, 'part', { side: 'R' }),
      E('17', ['hull'], 'Buoyancy box · cargo deck', '20.4 × 8.2 m', [0, 0, 0], .54, 'shell', { side: 'L' }),
    ],
    xray: [{ id: 'V', label: 'ACV-1.1 · on the cargo deck', model: 'acv', st: {}, parent: 'hull',
      inst: st => LCAC.SLOTS.map(([x, z]) => T3([x, LCAC.deckY(st), z])) }],
  },
  acv: {
    model: 'acv_cut', frame: 'hull', title: 'ACV-1.1 · amphibious combat vehicle', size: '8.9 × 3.1 × 2.8 m',
    note: 'BAE Systems / Iveco 8×8 for the US Marine Corps: swims ashore from an amphibious ship or rides an LCAC; crew 3 and 13 marines, Iveco Cursor 16 diesel, two water propellers.',
    st: { ramp: 0, yaw: -.35, pitch: .12 }, view: { yaw: 2.2, pitch: .26 },
    parts: [
      E('01', ['gun'], 'M2HB .50 cal · sight head', '12.7 mm', [0, 3.5, .4], 0, 'part', { side: 'R' }),
      E('02', ['rws'], 'Protector RS4 · remote weapon station', '', [0, 3.0, .4], .05, 'part', { side: 'R' }),
      E('03', ['hatches'], 'Hatches · driver · commander · troop', '', [0, 2.6, 0], .1, 'part', { side: 'L' }),
      E('04', ['fittings'], 'Engine deck · lights · stowage', '', [0, 2.35, 0], .12, 'part', { side: 'L' }),
      E('05', ['vane'], 'Trim vane', '', [0, 1.9, 1.5], .14, 'part', { side: 'R' }),
      E('06', ['ramp'], 'Rear ramp · door', '', [0, .3, -1.9], .16, 'part', { side: 'L' }),
      E('07', ['hull'], 'Upper hull', '8.9 m', [0, 2.0, 0], .22, 'shell', { side: 'L' }),
      E('08', ['powerpack'], 'Iveco Cursor 16 · diesel', '690 hp', [0, 1.05, .5], .3, 'part', { side: 'R' }),
      E('09', ['crew'], 'Driver · commander stations', '', [0, .85, .2], .32, 'part', { side: 'L' }),
      E('10', ['troops'], 'Troop compartment · 13 marines', '', [0, .7, -.3], .34, 'part', { side: 'L' }),
      E('11', ['driveline'], 'Transmission · driveline · suspension', '', [0, -.25, 0], .4, 'part', { side: 'R' }),
      E('12', ['propL'], 'Water propellers ×2 · shrouded', '', [-.45, -.2, -1.4], .42, 'part', { side: 'L' }),
      E(null, ['propR'], 'Water propeller · R', '', [.45, -.2, -1.4], .42, 'part'),
      E('13', ['wheelsR'], 'Wheels ×8 · independent suspension', 'Ø 1.24 m', [1.4, -.1, 0], .46, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.4, -.1, 0], .46, 'shell'),
      E('14', ['lower'], 'Lower hull · V-shaped', '', [0, -.55, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [],
  },
  kornet: {
    model: 'kornet_cut', frame: 'body', title: 'Kornet-EM · Tigr-M', size: '5.7 × 2.4 × 2.4 m',
    note: 'KBP long-range anti-tank system on the GAZ Tigr-M: two launch units rise from the rear body, each with its own thermal / TV sight and four 9M133 rounds ready; eight more in reserve.',
    st: { up: 1, yaw: 0, pitch: .1 }, view: { yaw: 2.2, pitch: .26 },
    parts: [
      E('01', ['plateL', 'plateR'], 'Cover plates · roof hatches', '', [0, 3.5, 0], 0, 'part', { side: 'R' }),
      E('02', ['packL'], 'Launch packs ×2 · 4 × 9M133', '1.2 m', [-.95, 2.85, 0], .03, 'shell', { side: 'L' }),
      E(null, ['packR'], 'Launch pack · R', '', [.95, 2.85, 0], .03, 'shell'),
      E('03', ['sightL'], 'Sighting units ×2 · thermal · laser', '', [-.95, 2.35, .25], .08, 'part', { side: 'L' }),
      E(null, ['sightR'], 'Sighting unit · R', '', [.95, 2.35, .25], .08, 'part'),
      E('04', ['yokeL', 'yokeR'], 'Traverse yokes', '', [0, 2.05, 0], .12, 'part', { side: 'R' }),
      E('05', ['columnL', 'columnR'], 'Lifting columns', '', [0, 1.8, 0], .16, 'part', { side: 'L' }),
      E('06', ['cab'], 'Crew cab · rear body', '', [0, 1.15, 0], .22, 'shell', { side: 'L' }),
      E('07', ['reload'], 'Reserve rounds ×8', '', [0, .65, -.45], .3, 'part', { side: 'R' }),
      E('08', ['seats'], 'Crew seats · operator console', '', [0, .5, .1], .32, 'part', { side: 'L' }),
      E(null, ['sleeves'], 'Column guides', '', [0, .6, 0], .32, 'part'),
      E('09', ['bonnet'], 'Bonnet · bull bar', '', [0, .75, 1.1], .28, 'shell', { side: 'R' }),
      E('10', ['engine'], 'YaMZ-534 · turbodiesel', '215 hp', [0, .35, .95], .36, 'part', { side: 'R' }),
      E('11', ['spare'], 'Spare wheel', '', [0, .2, -1.1], .34, 'part', { side: 'L' }),
      E('12', ['body'], 'Armoured body · Tigr-M', '5.7 m', [0, .2, 0], .42, 'shell', { side: 'L' }),
      E('13', ['wheelsR'], 'Wheels ×4 · 335/80 R20', 'Ø 1.04 m', [1.1, -.1, 0], .46, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.1, -.1, 0], .46, 'shell'),
      E('14', ['chassis'], 'Chassis · 4×4', '3.3 m wheelbase', [0, -.45, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [
      ...[-1, 1].map(u => ({
        id: u < 0 ? 'L' : 'R', label: '9M133 · in its container · ' + (u < 0 ? 'L' : 'R'), model: 'kornet_msl', st: { fin: 0 }, parent: u < 0 ? 'packL' : 'packR',
        inst: st => TG_ORDER.map((o, k) => [o, k]).filter(([o]) => o[0] === u).map(([o]) => X.mul(tgUnitXf(u)(st || {}), T3([u * TG.UX + o[1], TG.PY + o[2], TG.UZ + (TG.TUBE.z0 + TG.TUBE.z1) / 2]))),
        when: st => tgUp(st) > .02,
      })),
      { id: 'S', label: '9M133 · reserve', model: 'kornet_msl', st: { fin: 0 }, parent: 'reload', inst: () => TG_RELOAD.map(p => T3([p[0], p[1], p[2] + .01])) },
    ],
  },
  kornet_msl: {
    model: 'kornet_msl', title: '9M133 Kornet', size: '1.2 m · Ø 152 mm',
    note: 'KBP laser beam-riding anti-tank missile: two canards steer it, four wrap-around fins unfold at the tail as it leaves the container.',
    st: { fin: 1 }, view: { yaw: 1.25, pitch: .24 },
    parts: [
      E('01', ['nose'], 'Nose', '', [0, 0, .22], 0, 'part', { side: 'R' }),
      E('02', ['canards'], 'Canards ×2', '', [0, .12, .12], .12, 'part', { side: 'R' }),
      E('03', ['fins'], 'Tail fins ×4 · wrap-around', '0.46 m', [0, 0, -.2], .24, 'part', { side: 'L' }),
      E('04', ['tail'], 'Tail · guidance receiver', '', [0, 0, -.34], .32, 'part', { side: 'L' }),
      E('05', ['body'], 'Body · 9M133', '1.2 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
    ],
    xray: [],
  },
};
