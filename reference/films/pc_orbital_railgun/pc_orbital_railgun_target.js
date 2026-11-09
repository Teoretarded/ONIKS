/* ORBITAL · RAILGUN target: the enemy production base the round strikes (window.ORTGT), and the visit to it before the
   shot (window.ORVISIT, an insert; the contract is in pc_orbital_railgun_film.js, "inserted sequences").

   THE FACILITY (window.ORTGT). A walled base about 1.5 x 1.4 km on the coast round the impact point W.HIT: a main plant
   (150 x 380 m, sawtooth roof) with a tank line and a jet line running down its two bays (robot arms welding, bridge
   cranes lowering turrets and wings, the vehicles indexing station to station, a lime test gate), a turret shop, an
   engine shop, a hull-block shop and a dry dock with a 210 m hull half plated under a goliath crane, an armour park
   (36 tanks), eight hangars, an apron, a taxiway and a 1.4 km runway (a jet taxiing, one taking off), a command block
   with a radar mast, two cooling towers, a turbine hall, a reactor dome and a stack, fuel tanks, three radomes, roads,
   a rail spur with a train, perimeter walls with towers, lamps and coral beacons. Everything is drawn with the film's
   lattice renderer (ORL); hostile markings are coral (K.CORAL).
   Site frame = world (metres, +X east, +Y up, +Z north / inland, the sea to the south); the layout is ground-free and
   ready at load (sites(), clear() work before build); heights come from W.ground at build.

   API
     ORTGT.sites() -> [{ id, x, z, w, d, h, yaw, kind, y }]   footprints in world metres (w along x, d along z; kind
                      'hall' | 'tower' | 'tank' | 'pad'; y the floor's height once built). Ready at load.
     ORTGT.clear(x, z) -> bool                                  inside the compound (+ a margin): keep trees off it.
     ORTGT.build(ctx)                                           idempotent. ctx: { K, L (ORL), W, FX? (for FX.arrive),
                      arrive? (d -> a) }. Called by ORVISIT.build; call it yourself if you draw before that.
                      At build it wraps W.drawVehicles so the base take draws the facility (the film calls that under
                      60 km). Set ORTGT.auto = false and call ORTGT.draw yourself to take that over.
     ORTGT.draw(ctx, opts)                                      draws everything (ctx may be null). opts: { a (strike
                      age; default: the last setStrike this frame, else the film's own aOf), t (the base's clock, s),
                      vis (0..1), near (m: skip the moving detail beyond), scan: { s, hd } (the insert's sweep) }.
     ORTGT.setStrike(a, shockR, hit)                            a: sim s since the impact (< 0 before), each frame
                      before the draw; shockR (m) and hit (world point) are kept for the record. Pieces react from
                      the shock's arrival at their own distance (FX.arrive), so render stays a pure function of a.
     ORTGT.bounds = { min, max, c, r }                          world AABB / sphere (after build).
     ORTGT.POI = { aim, plant, plantDoor, tankLine, jetLine, dock, hull, park, power, airfield, runway, command,
                      radar: [..] }                             world points (after build).
     ORTGT.emitters() -> [{ p, r, kind: 'fire' | 'smoke' | 'dust', aH, I }]   where the wreckage rests (world), its
                      size, the shock's arrival there (a) and the blast's strength 0..1: for fires, smoke and dust.
     ORTGT.movers() -> [{ parts: [{ ml }], W: { R, T }, kind }]  every vehicle where it stood at the impact (the parked
                      tanks and jets, the traffic, the vehicles on both lines at their build stage): parts are K.lodCloud
                      point clouds sampled off the lattice bodies, in the vehicle's frame; W its world transform. With
                      ORTGT.handOver (default true) the facility stops drawing each one once a > FX.arrive(d): fx.js
                      tosses / tears them from then on. Valid once the film's clocks exist (after load); cached.
     ORTGT.vehicles() -> [{ p, kind, aH, I, fire }]            the same vehicles as points (arrival, strength, burning).
   Destruction (from the shock's arrival t = a - arrive(d), strength I = 1 at the crater's edge to 0 at ~1.1 km):
     inside 1.15 x the crater's radius everything flashes white-hot and is gone in 0.35 s (the ejecta take it);
     roofs:  blown off and thrown tumbling (I > .45), else dropped into the hall tilted (I > .2), else left on;
     walls:  thrown flat (I > .55), toppled about their foot away from the blast (I > .25), else leaning;
     frames: laid down (I > .7), leaning (I > .35), else standing as bare shells;
     towers, the stack, masts topple; cooling towers crumble in bands; radomes lose their domes;
     vehicles: scorched, tossed and tumbled (turrets torn off and flung further), burning (fire glow) where I > .3.
   Everything lands and stays where it lands: the base is flattened, not erased (rubble, frames, wrecks).

   THE VISIT (window.ORVISIT, 44.4 s, spliced at TF + ORVISIT.at = TF - 12). From the base camera at the chamber the
   view turns down to the Earth and descends 446 km to the coast through a cloud layer, holds on the base from over the
   sea, dives through the main plant's south door and flies down its aisle between the tank line and the jet line
   (x1), rises out through the roof, and then the platform's targeting: a lime sweep runs over the base, the
   structures are boxed and tagged in coral one by one, a big bracket closes on the base and the aim point is set,
   target confirmed; the view pulls back up to orbit and hands the base camera back (its motion carried in and out).
   Beats (s into the visit, B_): turn 0-6.6 (the look slerps off ctx.camOld), descent 1.8-11.6 (log distance keyed
   446 km -> 50 km -> 6 km -> 2 km -> 0.8 km, the cloud puffs 2.5-5 km up), hold 11.6-13.2, dive 13.2-16, the plant
   16-26.4, rise 26.4-30.2, sweep 30.6-33.6, boxes 31.8-36.6, lock 34.6-36.4, back to orbit 36.6-42.6 (log distance),
   the splice out 36.6-44.4 (orientation slerped onto the base camera, position once the paths meet).
   ?vcam=ex,ey,ez,tx,ty,tz,fov (world) pins the visit's camera for debugging. */
(function () {
'use strict';
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const ss = E.ss, sat = E.sat, mix = E.mix;
const sm5 = x => { x = x <= 0 ? 0 : x >= 1 ? 1 : x; return x * x * x * (x * (x * 6 - 15) + 10); };
const kk = (u, a, b) => sm5((u - a) / (b - a));
const hh = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const QS = new URLSearchParams(location.search);
const X_ = [1, 0, 0], Y_ = [0, 1, 0], Z_ = [0, 0, 1];
const WH = [238, 238, 228], LIME = [198, 244, 50], CORAL = [255, 106, 61], HOT = [248, 255, 232], FIRE = [255, 176, 104], EMB = [255, 132, 70], SCO = [176, 156, 140], VAP = [236, 240, 232];
const IDT = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] };

/* =====================================================================================================
   LAYOUT (world x, z; the impact point W.HIT is at (2, 13)). w along x, d along z.
   ===================================================================================================== */
const ST = [], STI = {};
function st(id, kind, x, z, w, d, h, o) { const s = Object.assign({ id, kind, x, z, w, d, h, yaw: 0, lab: '', val: '', y: 30 }, o || {}); ST.push(s); STI[id] = s; return s; }
const PLW = 150, PLD = 380, PLH = 26;
st('plant', 'plant', -18, 93, PLW, PLD, PLH, { lab: 'TANK + JET PLANT', val: '2 LINES', tg: 1 });
st('turret', 'shed', -203, 83, 90, 220, 18, { lab: 'TURRET SHOP', val: '', tg: 1, fill: 'turret' });
st('engine', 'shed', 152, 163, 100, 180, 22, { lab: 'ENGINE SHOP', tg: 1, fill: 'engine' });
st('blocks', 'shed', 332, -407, 120, 140, 30, { fill: 'block', saw: 0 });
st('dock', 'dock', 332, -712, 80, 300, 24, { lab: 'SHIPYARD', val: 'HULL 210 M', tg: 1 });
st('park', 'park', -383, -322, 250, 130, 0, { lab: 'ARMOUR', val: '36 TANKS', tg: 1 });
st('cmd', 'office', -468, 303, 70, 40, 14, { lab: 'COMMAND', tg: 1 });
st('ctw', 'mast', -518, 303, 14, 14, 58, { radar: 1 });
st('cool1', 'cool', 577, -97, 72, 72, 84, { lab: 'POWER', val: '2 TOWERS', tg: 1 });
st('cool2', 'cool', 577, 23, 72, 72, 84);
st('turb', 'shed', 472, -37, 48, 110, 24, { saw: 0 });
st('reac', 'reactor', 667, -37, 54, 54, 46);
st('stack', 'stack', 472, 68, 12, 12, 110);
st('yard', 'pad', 652, 133, 90, 70, 0);
for (let k = 0; k < 4; k++) st('fuel' + k, 'fuel', -613 + (k % 2) * 40, -137 + (k >> 1) * 40, 26, 26, 16, k ? {} : { lab: 'FUEL', tg: 1 });
for (let k = 0; k < 8; k++) st('hg' + k, 'hangar', -558 + 115 * k, 573, 90, 64, 20, k === 3 ? { lab: 'AIRFIELD', val: '14 JETS', tg: 1 } : {});
st('apron', 'pad', -128, 643, 900, 60, 0);
st('taxi', 'pad', 2, 713, 1440, 22, 0);
st('rwy', 'pad', 2, 803, 1440, 45, 0);
st('atc', 'mast', 382, 623, 16, 16, 42, { cab: 1 });
st('rd1', 'radome', -663, 483, 30, 30, 34, { lab: 'RADAR', tg: 1 });
st('rd2', 'radome', 667, 483, 30, 30, 34, { lab: 'RADAR', tg: 1 });
st('rd3', 'radome', -108, -457, 24, 24, 26, { lab: 'RADAR', tg: 1 });
/* the compound: walls, roads, rail (world x, z) */
const WALL = { x0: -738, x1: 742, z0: -517, z1: 893 };
const RD = [[-713, -492, 717, -492], [717, -492, 717, 868], [717, 868, -713, 868], [-713, 868, -713, -492],
  [-126, -492, -126, 533], [-713, -202, 717, -202], [-713, 373, 717, 373], [252, -492, 252, 533], [79, -202, 79, 373], [332, -492, 332, -560], [-18, -202, -18, -97],
  [-558, 533, -558, 373], [-213, 533, -213, 373], [137, 533, 137, 373], [367, 533, 367, 373]];
const RAIL = [[-738, -162], [272, -162], [302, -187], [302, -548]];
const RSP = [[-59.5, -162], [-59.5, -102]];
const clearRect = { x0: WALL.x0 - 30, x1: WALL.x1 + 30, z0: -620, z1: WALL.z1 + 30 };
const KIND = { plant: 'hall', shed: 'hall', hangar: 'hall', office: 'hall', dock: 'hall', mast: 'tower', stack: 'tower', cool: 'tower', reactor: 'tower', radome: 'tower', fuel: 'tank', park: 'pad', pad: 'pad' };

/* =====================================================================================================
   STATE
   ===================================================================================================== */
let K = null, L = null, W = null, FX = null, BUILT = false, arriveF = null, RV = 230, HIT = [2, 29, 13], SUN = [-.59, .65, -.47];
const PCS = [];            // destructible pieces
const MOV = [];            // moving things (traffic, lines, cranes)
const LTA = [], LTK = [];  // lights: the shock's arrival there, kind
let LMP = null, BCN = null;
const STR = { a: -1, R: 0, hit: null, ft: -1e9 };
const CUR = { alive: 1, lime6: 0, hot: 0 };
let A_ = -1, F_ = 0, FT_ = 0;                // this frame's strike age, facility clock, film time
const DOP = { L: SUN, a: 1, col: WH.slice(), lime: 0, fx: null, keep: 1, lc: [255, 255, 255] };
const DOL = { L: SUN, a: 1, col: WH, fx: null, lc: [255, 236, 214] }, DOB = { L: SUN, a: 1, col: WH, fx: null, lc: CORAL };

function fxF(ch, q) {
  switch (ch) {
    case 1: return CUR.alive ? 20.85 : 20.2;                        // coral markings
    case 3: {                                                        // lights
      if (A_ >= LTA[q]) return 0;
      const k = LTK[q];
      if (k === 1) return ((FT_ * .62 + q * .137) % 1) < .22 ? 1.4 : .05;   // beacons
      if (k === 2) return .62;                                        // runway, taxiway
      if (k === 3) return .95;                                        // hall lamps
      if (k === 5) return .5 + .5 * (((FT_ * 1.7 + q * .31) % 1) < .5);   // the test gate's strobes
      return .82;
    }
    case 5: return CUR.alive ? 10.32 : -.65;                        // glazing, windows (warm, dark after)
    case 6: return CUR.lime6;                                        // the test gate / scan
    case 7: return CUR.hot;                                          // hot seams
  }
  return 0;
}
DOP.fx = fxF; DOL.fx = fxF; DOB.fx = fxF;

/* ---------------- small math ---------------- */
function rotAA(ax, a, o) {
  const x = ax[0], y = ax[1], z = ax[2], c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  o[0] = t * x * x + c; o[1] = t * x * y - s * z; o[2] = t * x * z + s * y;
  o[3] = t * x * y + s * z; o[4] = t * y * y + c; o[5] = t * y * z - s * x;
  o[6] = t * x * z - s * y; o[7] = t * y * z + s * x; o[8] = t * z * z + c;
  return o;
}
const mul3 = (A, B, o) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; };
const ap3 = (M, v, o) => { const a = v[0], b = v[1], c = v[2]; o[0] = M[0] * a + M[1] * b + M[2] * c; o[1] = M[3] * a + M[4] * b + M[5] * c; o[2] = M[6] * a + M[7] * b + M[8] * c; return o; };
/* out = (rotate by M about pivot P, then shift by D) after base Tb */
const TV = [0, 0, 0];
function desX(M, P, D, Tb, out) {
  mul3(M, Tb.R, out.R);
  TV[0] = Tb.T[0] - P[0]; TV[1] = Tb.T[1] - P[1]; TV[2] = Tb.T[2] - P[2]; ap3(M, TV, TV);
  out.T[0] = TV[0] + P[0] + D[0]; out.T[1] = TV[1] + P[1] + D[1]; out.T[2] = TV[2] + P[2] + D[2];
  return out;
}
const cpX = (s, o) => { for (let i = 0; i < 9; i++) o.R[i] = s.R[i]; o.T[0] = s.T[0]; o.T[1] = s.T[1]; o.T[2] = s.T[2]; return o; };
const mkX = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] });
const yawR = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };        // +Z turns toward +X for a > 0
const yawX = (a, T) => ({ R: yawR(a), T: T.slice() });

/* the ground (world y, the curve's drop included; the sea at 0); gyF: a cached 8 m grid over the compound (effects) */
const gy = (x, z) => { const g = W.ground(x, z); return (g < 0 ? 0 : g) - W.drop(x, z); };
let GYG = null; const GYC = 8, GX0 = -800, GZ0 = -950, GNX = 201, GNZ = 241;
function gyF(x, z) {
  if (!GYG) { GYG = new Float32Array(GNX * GNZ); for (let j = 0; j < GNZ; j++) for (let i = 0; i < GNX; i++) GYG[j * GNX + i] = gy(GX0 + i * GYC, GZ0 + j * GYC); }
  const fx = (x - GX0) / GYC, fz = (z - GZ0) / GYC; if (fx < 0 || fz < 0 || fx >= GNX - 1 || fz >= GNZ - 1) return gy(x, z);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = j * GNX + i;
  return (GYG[o] * (1 - u) + GYG[o + 1] * u) * (1 - v) + (GYG[o + GNX] * (1 - u) + GYG[o + GNX + 1] * u) * v;
}

/* =====================================================================================================
   MODELS (ORL bodies)
   ===================================================================================================== */
const mkB = (name, fn) => { const B = new L.Body(name); fn(B); return B.done(); };
const quad = (B, a, b, c, d, cell, o) => B.trap(a, V.sub(b, a), V.sub(c, d), V.sub(d, a), cell, o);
const tri = (B, a, b, c, cell, o) => B.trap(a, V.sub(b, a), [0, 0, 0], V.sub(c, a), cell, o);
const VB = {};      // vehicle bodies
function buildVehicleBodies() {
  const o = { br: .82, edge: .82, two: true };
  /* ---- the tank (10 m; origin on the ground under its centre, +Z forward) ---- */
  VB.tFrame = mkB('tFrame', B => {
    for (let z = -4.3; z <= 4.31; z += 1.07) { B.line([-1.7, .5, z], [1.7, .5, z], .6); B.line([-1.7, .5, z], [-1.7, 1.75, z], .75); B.line([1.7, .5, z], [1.7, 1.75, z], .75); B.line([-1.7, 1.75, z], [1.7, 1.75, z], .5); B.line([-1.7, .5, z], [-1.2, 1.75, z], .4); B.line([1.7, .5, z], [1.2, 1.75, z], .4); }
    for (const s of [-1, 1]) for (let z = -3.6; z <= 3.7; z += 1.2) B.ringP([s * 2.0, .5, z], [0, 1, 0], [0, 0, 1], .4, .45);
    for (const x of [-1.7, -.6, .6, 1.7]) { B.line([x, .5, -4.3], [x, .5, 4.4], .55); B.line([x, 1.75, -4.3], [x, 1.75, 2.6], .45); }
    B.line([-1.7, 1.75, 2.6], [-1.4, 1.0, 4.7], .5); B.line([1.7, 1.75, 2.6], [1.4, 1.0, 4.7], .5); B.line([-1.4, 1.0, 4.7], [1.4, 1.0, 4.7], .5);
    for (const x of [-1.7, 1.7]) for (const z of [-4.3, 0, 2.6]) B.knot([x, 1.75, z], .16, .8);
  });
  VB.tLower = mkB('tLower', B => {
    B.obox([0, 1.0, 0], X_, Y_, Z_, [1.32, .44, 4.3], .1, { br: .5, edge: .7 });
    for (const s of [-1, 1]) {
      B.obox([s * 1.66, .66, 0], X_, Y_, Z_, [.32, .5, 4.45], .1, { br: .48, edge: .75 });
      for (let k = 0; k < 7; k++) B.ringP([s * 2.0, .5, -3.5 + k * 1.17], Y_, Z_, .4, .8);
      B.ringP([s * 2.0, .78, 4.15], Y_, Z_, .48, .85); B.ringP([s * 2.0, .78, -4.15], Y_, Z_, .45, .85);
      for (let k = 0; k < 18; k++) B.line([s * 2.0, 1.17, -4.1 + k * .48], [s * 2.0, 1.17, -3.9 + k * .48], .5);
    }
  });
  VB.tUpper = mkB('tUpper', B => {
    B.panel([-1.75, 1.78, -4.3], [3.5, 0, 0], [0, 0, 6.9], .1, Object.assign({ n: Y_ }, o));
    quad(B, [-1.75, 1.78, 2.6], [1.75, 1.78, 2.6], [1.4, 1.0, 4.75], [-1.4, 1.0, 4.75], .1, o);
    quad(B, [-1.4, 1.0, 4.75], [1.4, 1.0, 4.75], [1.3, .56, 4.32], [-1.3, .56, 4.32], .1, o);
    for (const s of [-1, 1]) { quad(B, [s * 1.75, 1.78, -4.3], [s * 1.75, 1.78, 2.6], [s * 2.06, 1.24, 2.6], [s * 2.06, 1.24, -4.3], .1, o); tri(B, [s * 1.75, 1.78, 2.6], [s * 1.4, 1.0, 4.75], [s * 2.06, 1.24, 2.6], .1, o); }
    quad(B, [-1.75, 1.78, -4.3], [1.75, 1.78, -4.3], [1.75, .6, -4.5], [-1.75, .6, -4.5], .1, o);
    for (let k = 0; k < 7; k++) B.line([-1.2, 1.8, -4.0 + k * .28], [1.2, 1.8, -4.0 + k * .28], .45);
    for (const s of [-1, 1]) B.knot([s * 1.1, 1.05, 4.72], .14, .9, 3, 0);
  });
  VB.tSkirt = mkB('tSkirt', B => { for (const s of [-1, 1]) quad(B, [s * 2.12, 1.26, -4.4], [s * 2.12, 1.26, 3.95], [s * 2.22, .46, 3.65], [s * 2.22, .46, -4.2], .1, { br: .7, edge: .85, two: true, seams: [9, 0], sbr: .35 }); });
  VB.tTurret = mkB('tTurret', B => {
    const bs = [[-1.45, -2.0], [1.45, -2.0], [1.72, .3], [.75, 2.3], [-.75, 2.3], [-1.72, .3]], tp = bs.map(([x, z]) => [x * .8, z * .84 - .1]), y1 = .95;
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; quad(B, [bs[i][0], 0, bs[i][1]], [bs[j][0], 0, bs[j][1]], [tp[j][0], y1, tp[j][1]], [tp[i][0], y1, tp[i][1]], .08, o); }
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; tri(B, [0, y1, -.1], [tp[i][0], y1, tp[i][1]], [tp[j][0], y1, tp[j][1]], .08, { br: .78, edge: false, two: true }); }
    // coral stripes on the rear side faces (out a hair)
    for (const [i, j] of [[1, 2], [5, 0]]) {
      const P = (k, f) => { const b = k ? bs[j] : bs[i], t = k ? tp[j] : tp[i]; return [mix(b[0], t[0], f) * 1.03, f * y1, mix(b[1], t[1], f) * 1.01]; };
      quad(B, P(0, .3), P(1, .3), P(1, .62), P(0, .62), .06, { ch: 1, br: 1, edge: false, two: true });
    }
    B.obox([0, .5, 2.42], X_, Y_, Z_, [.42, .32, .3], .06, { br: .9, edge: .9 });
    B.tube([0, .5, 2.7], [0, .5, 9.4], .14, .85);
    B.obox([0, .5, 9.5], X_, Y_, Z_, [.22, .22, .3], .05, { br: .9, edge: .9 });
    B.obox([.78, 1.2, -.5], X_, Y_, Z_, [.28, .25, .38], .06, { br: .9, edge: .9 });
    B.lathe([-.6, y1, -.7], Y_, [[0, 0], [0, .38], [.12, .38], [.12, 0]], { cell: .06, br: .8 });
    B.line([-1.0, y1, -1.5], [-1.05, y1 + 2.3, -1.65], .7);
  });
  /* ---- the jet (18 m, span 12.6 m; origin on the ground, +Z the nose) ---- */
  const FP = [[0, 0], [.8, .32], [2.2, .62], [4.0, .85], [6.5, 1.0], [12.5, 1.0], [15.5, .95], [17.2, .82], [17.8, .8]];
  VB.jFrame = mkB('jFrame', B => {
    for (let i = 1; i < FP.length; i++) B.ringP([0, 2.3, 9 - FP[i][0]], X_, Y_, FP[i][1], .55);
    for (let k = 0; k < 8; k++) { const t = k / 8 * TAU, c = Math.cos(t), s = Math.sin(t); for (let i = 1; i < FP.length; i++) B.line([c * FP[i - 1][1], 2.3 + s * FP[i - 1][1], 9 - FP[i - 1][0]], [c * FP[i][1], 2.3 + s * FP[i][1], 9 - FP[i][0]], .4); }
    for (const s of [-1, 1]) { B.line([s * .9, 2.15, 3.2], [s * 6.3, 2.0, -7.8], .35); B.line([s * .9, 2.15, -8.6], [s * 6.3, 2.0, -7.8], .35); for (let k = 0; k < 5; k++) B.line([s * .9, 2.15, 2 - k * 2.2], [s * (1.6 + k * .95), 2.1, -7.9], .3); }
  });
  VB.jFus = mkB('jFus', B => {
    B.lathe([0, 2.3, 9.0], [0, 0, -1], FP, { cell: .12, br: .82, rings: true, rbr: .45, seams: 6, sbr: .3 });
    B.obox([0, 3.2, -2.2], X_, Y_, Z_, [.42, .14, 5.3], .1, { br: .7, edge: .7 });
    for (const s of [-1, 1]) {
      B.obox([s * 1.25, 2.05, 1.6], X_, Y_, Z_, [.38, .46, 1.7], .08, { br: .75, edge: .85 });
      B.lathe([s * .55, 2.3, -8.75], [0, 0, -1], [[0, .5], [.75, .56], [.75, .4]], { cell: .08, br: .9, two: true });
    }
  });
  VB.jWing = mkB('jWing', B => {
    for (const s of [-1, 1]) {
      tri(B, [s * .9, 2.15, 3.2], [s * .9, 2.15, -8.6], [s * 6.3, 2.0, -7.8], .14, { br: .78, edge: .85, two: true });
      tri(B, [s * .9, 2.62, 6.0], [s * .9, 2.62, 4.5], [s * 2.7, 2.62, 4.6], .08, { br: .8, edge: .85, two: true });
      B.line([s * 1.2, 2.14, -8.1], [s * 5.9, 2.01, -7.75], .65);
      tri(B, [s * 5.0, 2.03, -6.6], [s * 6.3, 2.01, -7.8], [s * 5.0, 2.03, -7.75], .06, { ch: 1, br: 1, edge: false, two: true });
    }
  });
  VB.jTail = mkB('jTail', B => { for (const s of [-1, 1]) { tri(B, [s * 1.0, 3.1, -4.6], [s * 1.0, 3.1, -8.7], [s * 2.35, 6.1, -8.9], .12, { br: .8, edge: .85, two: true }); tri(B, [s * 1.66, 4.55, -7.0], [s * 1.62, 4.47, -8.75], [s * 2.15, 5.65, -8.85], .06, { ch: 1, br: 1, edge: false, two: true }); } });
  VB.jCanopy = mkB('jCanopy', B => { B.lathe([0, 3.05, 6.9], [0, 0, -1], [[0, 0], [.5, .3], [1.6, .48], [2.8, .4], [3.6, 0]], { cell: .07, br: .55, rings: true, rbr: .7 }); B.knot([0, 3.2, 8.6], .12, .9, 3, 0); });
  VB.jGear = mkB('jGear', B => {
    B.tube([0, 1.6, 6.0], [0, .42, 6.0], .07, .8); B.ringP([0, .4, 6.0], Y_, Z_, .36, .8);
    for (const s of [-1, 1]) { B.tube([s * 1.5, 1.9, -1.4], [s * 1.7, .5, -1.4], .09, .8); B.ringP([s * 1.75, .48, -1.4], Y_, Z_, .46, .85); }
  });
  /* ---- a truck (9 m), the train's locomotive (18 m) and flat car (14 m) ---- */
  VB.truck = mkB('truck', B => {
    B.obox([0, 1.9, 3.1], X_, Y_, Z_, [1.25, 1.1, 1.1], .1, { br: .8, edge: .85 }); B.panel([-1.2, 2.1, 4.22], [2.4, 0, 0], [0, .8, 0], .08, { n: Z_, br: .35, ch: 5, edge: false });
    B.obox([0, 2.2, -1.4], X_, Y_, Z_, [1.25, 1.4, 3.1], .12, { br: .62, edge: .8 }); B.obox([0, .75, .6], X_, Y_, Z_, [1.0, .25, 4.2], .1, { br: .5, edge: .6 });
    for (const z of [3.0, -.6, -2.8]) for (const s of [-1, 1]) B.ringP([s * 1.15, .5, z], Y_, Z_, .5, .8);
    for (const s of [-1, 1]) B.knot([s * .8, 1.3, 4.2], .14, .9, 3, 0);
  });
  VB.loco = mkB('loco', B => {
    B.obox([0, 2.6, 0], X_, Y_, Z_, [1.5, 1.9, 9], .14, { br: .7, edge: .85 }); B.obox([0, 4.8, 6.8], X_, Y_, Z_, [1.4, .4, 2.0], .12, { br: .75, edge: .8 });
    for (const z of [-6, -4.6, 4.6, 6]) for (const s of [-1, 1]) B.ringP([s * 1.0, .5, z], Y_, Z_, .5, .75);
    B.knot([0, 3.6, 9.05], .2, .9, 3, 0);
  });
  VB.car = mkB('car', B => { B.obox([0, 1.2, 0], X_, Y_, Z_, [1.45, .3, 7], .12, { br: .6, edge: .8 }); for (const z of [-5.4, -4.2, 4.2, 5.4]) for (const s of [-1, 1]) B.ringP([s * 1.0, .5, z], Y_, Z_, .5, .75); });
  VB.block = mkB('block', B => { B.obox([0, 4, 0], X_, Y_, Z_, [6, 4, 5], .3, { br: .6, edge: .8, seams: [0, 0] }); for (let k = 1; k < 5; k++) B.line([-6, 0, -5 + k * 2], [-6, 8, -5 + k * 2], .45); B.line([-6, 4, -5], [6, 4, -5], .45); });
  VB.nacelle = mkB('nacelle', B => { B.lathe([0, 1.6, 2.6], [0, 0, -1], [[0, .55], [.4, .9], [4.4, .95], [5.2, .7], [5.2, .5]], { cell: .1, br: .8, rings: true, seams: 8 }); B.obox([0, .5, 0], X_, Y_, Z_, [.8, .5, 2.2], .1, { br: .5, edge: .7 }); });
  /* ---- a robot arm (base, two links, the tool) and a bridge crane's parts ---- */
  VB.armBase = mkB('armBase', B => { B.lathe([0, 0, 0], Y_, [[0, 0], [0, .75], [.35, .75], [.35, .55], [1.2, .5], [1.2, 0]], { cell: .06, br: .8 }); B.obox([0, 1.3, 0], X_, Y_, Z_, [.42, .2, .42], .05, { br: .85, edge: .85 }); });
  VB.arm1 = mkB('arm1', B => { B.obox([0, 0, 1.6], X_, Y_, Z_, [.26, .3, 1.75], .06, { br: .85, edge: .85 }); B.obox([0, 0, .9], X_, Y_, Z_, [.3, .16, .3], .05, { br: .6, edge: .7 }); B.lathe([-.34, 0, 0], X_, [[0, 0], [0, .36], [.68, .36], [.68, 0]], { cell: .05, br: .8 }); B.line([.27, .3, .4], [.27, .3, 3.0], .5); });
  VB.arm2 = mkB('arm2', B => { B.obox([0, 0, 1.4], X_, Y_, Z_, [.2, .22, 1.45], .05, { br: .85, edge: .85 }); B.lathe([-.27, 0, 0], X_, [[0, 0], [0, .28], [.54, .28], [.54, 0]], { cell: .05, br: .8 }); B.lathe([0, 0, 2.8], Z_, [[0, .16], [.35, .16], [.35, .09], [.7, .03]], { cell: .03, br: .9 }); B.knot([0, 0, 2.86], .09, .9, 7, 0); });
  VB.trolley = mkB('trolley', B => { B.obox([0, 0, 0], X_, Y_, Z_, [2.2, 1.0, 3.6], .14, { br: .75, edge: .85 }); B.knot([0, -1.0, 0], .3, .9); });
  VB.hook = mkB('hook', B => { B.obox([0, 0, 0], X_, Y_, Z_, [1.0, .55, .6], .08, { br: .85, edge: .9 }); B.line([0, -.55, 0], [0, -1.3, 0], .8); B.ring([0, -1.6, 0], X_, Y_, .3, 10, .8); });
}
/* a bridge crane's girder for a span (m) */
const girderB = span => mkB('girder', B => {
  const h = span / 2;
  for (const z of [-1.6, 1.6]) { B.obox([0, 0, z], X_, Y_, Z_, [h, 1.2, .35], .2, { br: .62, edge: .8 }); }
  for (let k = 0; k <= Math.round(span / 4); k++) { const x = -h + k * span / Math.round(span / 4); B.line([x, 1.2, -1.6], [x, 1.2, 1.6], .4); }
  for (const s of [-1, 1]) B.obox([s * h, -.4, 0], X_, Y_, Z_, [.9, 1.0, 3.4], .15, { br: .7, edge: .85 });
  B.knot([0, 1.4, 0], .2, .9, 3, 0);
});

/* =====================================================================================================
   PIECES: a body (or several) under a base transform, with what the shock does to it
   ===================================================================================================== */
/* kinds: 'roof' 'wall' 'frame' 'floor' 'mast' (topples) 'band' (crumbles) 'dome' 'veh' 'tur' 'misc' */
function piece(Bs, kind, Tb, c, pv, n, sz, o) {
  const p = Object.assign({ Bs: Array.isArray(Bs) ? Bs : [Bs], kind, Tb, c, pv: pv || c, n: n || null, sz: sz || 10, Tw: mkX(), sid: CURSID }, o || {});
  PCS.push(p); return p;
}
/* per piece, at build: its distance, the shock's arrival, the blast strength and its random fate */
let CURSID = null;
const R_I0 = 230, R_I1 = 1130;
function fate(p) {
  const dx = p.c[0] - HIT[0], dz = p.c[2] - HIT[2], d = Math.max(1, Math.hypot(dx, dz));
  p.d = d; p.u = [dx / d, 0, dz / d]; p.ta = arriveF(d); p.I = sat(1 - (d - R_I0) / (R_I1 - R_I0));
  const sd = Math.round(p.c[0] * 7.13 + p.c[2] * 3.71 + p.c[1] * 11.3) + PCS.indexOf(p);
  p.h1 = hh(sd, 1); p.h2 = hh(sd, 2); p.h3 = hh(sd, 3); p.h4 = hh(sd, 4);
  p.vap = d < RV;
  const I = p.I, k = p.kind;
  // the axis it tips about: horizontal, across the blast (tops go away from the impact for a positive angle)
  p.ax = V.norm([-p.u[2] + (p.h3 - .5) * .5, 0, p.u[0] + (p.h4 - .5) * .5]);
  p.mode = 'stand';
  if (k === 'roof') p.mode = I > .62 ? 'throw' : I > .18 ? 'drop' : 'stand';
  else if (k === 'wall') p.mode = I > .72 ? 'throw' : I > .25 ? 'topple' : 'lean';
  else if (k === 'frame') p.mode = I > .86 ? 'down' : I > .3 ? 'lean' : 'stand';
  else if (k === 'mast') p.mode = I > .22 ? 'topple' : 'lean';
  else if (k === 'band') p.mode = I > .55 ? 'throw' : I > .2 ? 'drop' : 'stand';
  else if (k === 'dome') p.mode = I > .3 ? 'throw' : 'lean';
  else if (k === 'veh' || k === 'tur') p.mode = I > .25 || k === 'tur' && I > .12 ? 'throw' : 'slide';
  else if (k === 'misc') p.mode = I > .4 ? 'throw' : I > .15 ? 'slide' : 'stand';
  else if (k === 'floor') p.mode = 'floor';
  if (k === 'wall' && p.n) { const nd = p.n[0] * p.u[0] + p.n[2] * p.u[2]; p.ax = V.norm(V.cross(Y_, nd >= 0 ? p.n : V.mul(p.n, -1))); }
  // a throw: launch speed out and up, drag, tumble to a resting angle; the landing solved here
  const gy0 = gy(p.c[0], p.c[2]);
  if (p.mode === 'throw') {
    const tk = k === 'tur' ? 1.5 : k === 'veh' ? .55 : k === 'band' ? .6 : 1;
    p.v0 = (14 + 62 * I) * (.55 + .8 * p.h1) * tk; p.vy = (6 + 24 * I) * (.45 + .9 * p.h2) * (k === 'veh' ? .7 : 1); p.kd = .55 + .5 * p.h3;
    const rest = k === 'veh' || k === 'tur' ? 1.2 : k === 'wall' ? .6 : k === 'band' ? 2 : .5;
    let yl = gy0 + rest, tl = 1;
    for (let it = 0; it < 3; it++) {
      tl = (p.vy + Math.sqrt(p.vy * p.vy + 19.62 * Math.max(0, p.c[1] - yl))) / 9.81;
      const s = p.v0 * (1 - Math.exp(-p.kd * tl)) / p.kd; yl = gy(p.c[0] + p.u[0] * s, p.c[2] + p.u[2] * s) + rest;
    }
    p.tl = Math.max(.3, tl); p.yl = yl; p.sL = p.v0 * (1 - Math.exp(-p.kd * p.tl)) / p.kd;
    const flat = k === 'wall' || k === 'veh' && p.h4 < .5 ? PI / 2 : 0;
    p.thf = (k === 'veh' ? (p.h4 < .5 ? PI / 2 : PI) : flat + PI * (1 + Math.floor(p.h4 * 2))) + (p.h1 - .5) * .7;
    if (p.h2 < .5) p.thf = -p.thf;
  }
  if (p.mode === 'drop') { p.dy = Math.max(0, p.c[1] - gy0 - (1.5 + 4 * p.h1)); p.tf = Math.sqrt(2 * p.dy / 9.81) + .05; p.thf = (.15 + .4 * p.h2) * (p.h3 < .5 ? -1 : 1); p.ds = 3 + 9 * I * p.h4; }
  if (p.mode === 'topple' || p.mode === 'down') { p.tf = (k === 'mast' ? .55 * Math.sqrt(p.sz) : 1.1 + 1.4 * p.h1); p.thf = (k === 'frame' && p.mode === 'down' ? PI / 2 - .12 * p.h2 : k === 'wall' && I < .35 ? .25 + .6 * p.h2 : PI / 2 - .04) ; p.ds = (k === 'frame' ? 4 + 12 * I : 2) * p.h3; }
  if (p.mode === 'lean') { p.tf = 1 + p.h1; p.thf = k === 'frame' ? .12 + .9 * sat((I - .3) / .56) * (.5 + .5 * p.h2) : k === 'mast' ? .1 + .3 * I : .04 + .12 * I * p.h2; }
  if (p.mode === 'slide') { p.ds = (2 + 14 * I) * (.5 + p.h1); p.tf = .8 + .6 * p.h2; p.thf = (p.h3 - .5) * .5 * I; }
  p.fire = (k === 'veh' && I > .18 && p.h4 < .8) || ((k === 'roof' || k === 'misc') && p.mode !== 'stand' && p.h4 < .14);
  return p;
}
/* the pose at strike age a: sets p.Tw, returns the opacity (0: gone) and the look (DS) */
const DS = { sc: 0, hot: 0 }, ROT = [1, 0, 0, 0, 1, 0, 0, 0, 1], DD = [0, 0, 0], PV = [0, 0, 0];
function pose(p, a) {
  DS.sc = 0; DS.hot = 0;
  const t = a - p.ta;
  if (a < 0 || t < 0) { cpX(p.Tb, p.Tw); return 1; }
  DS.sc = Math.min(1, t * 3) * (.35 + .65 * p.I);
  DS.hot = p.I > .3 ? Math.max(0, 1 - t / .5) * p.I : 0;
  DD[0] = DD[1] = DD[2] = 0;
  if (p.vap) {
    const g = 1 - t / .35; if (g <= 0) return 0;
    DS.hot = 1; const s = 90 * t + 260 * t * t; DD[0] = p.u[0] * s; DD[2] = p.u[2] * s; DD[1] = 40 * t;
    rotAA(p.ax, 2.5 * t * (p.h1 + .3), ROT); desX(ROT, p.c, DD, p.Tb, p.Tw); return g;
  }
  let th = 0, P = p.pv;
  switch (p.mode) {
    case 'throw': {
      const tau = Math.min(t, p.tl), s = p.v0 * (1 - Math.exp(-p.kd * tau)) / p.kd;
      DD[0] = p.u[0] * s; DD[2] = p.u[2] * s; DD[1] = t < p.tl ? p.vy * tau - 4.905 * tau * tau : p.yl - p.c[1];
      th = p.thf * Math.min(1, t / p.tl); P = p.c; break;
    }
    case 'drop': { const tau = Math.min(t, p.tf); DD[1] = -Math.min(p.dy, 4.905 * tau * tau); th = p.thf * Math.min(1, t / p.tf); const s = p.ds * sat(t / p.tf); DD[0] = p.u[0] * s; DD[2] = p.u[2] * s; P = p.c; break; }
    case 'topple': case 'down': { const q = sat(t / p.tf); th = p.thf * q * q; const s = p.ds * q; DD[0] = p.u[0] * s; DD[2] = p.u[2] * s; break; }
    case 'lean': { const q = sat(t / p.tf); th = p.thf * (1 - (1 - q) * (1 - q)); break; }
    case 'slide': { const q = sat(t / p.tf), e = 1 - (1 - q) * (1 - q); const s = p.ds * e; DD[0] = p.u[0] * s; DD[2] = p.u[2] * s; th = p.thf * e; break; }
    case 'floor': case 'stand': default: cpX(p.Tb, p.Tw); return 1;
  }
  rotAA(p.ax, th, ROT); desX(ROT, P, DD, p.Tb, p.Tw);
  return 1;
}
/* where a piece ends up (for the emitters) */
function restOf(p) { const big = 1e4; pose(p, p.ta + big); return [p.Tw.T[0] + (p.c[0] - p.Tb.T[0]), p.mode === 'throw' ? p.yl : p.c[1] - (p.dy || 0), p.Tw.T[2] + (p.c[2] - p.Tb.T[2])]; }

/* =====================================================================================================
   BUILDINGS
   ===================================================================================================== */
const LAMPS = [], BEACS = [];
const lamp = (p, k) => { LAMPS.push([p[0], p[1], p[2], k || 0]); };
const beacon = p => { BEACS.push([p[0], p[1], p[2], 1]); };
/* base transform of a structure (its floor at y) */
function baseOf(s) {
  if (s.kind === 'dock') return .6;
  let m = -1e9; for (const [fx, fz] of [[0, 0], [-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) m = Math.max(m, gy(s.x + fx * s.w, s.z + fz * s.d));
  return m;
}
/* a hall: sawtooth roof (or flat), walls with doors and ribbon windows, portal frames, a floor with a plinth */
function hallB(s, O) {
  O = O || {};
  const w = s.w, d = s.d, h = s.h, hw = w / 2, hd = d / 2, cell = .75, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] };
  const wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  const saw = O.saw !== 0;
  const nT = saw ? Math.max(2, Math.round(d / 14)) : Math.max(2, Math.round(d / 24)), tz = d / nT, hs = saw ? Math.min(5, h * .2) : 0;
  const nX = Math.max(1, Math.ceil(w / 52)), xs = w / nX;
  for (let k = 0; k < nT; k++) for (let j = 0; j < nX; j++) {
    const x0 = -hw + j * xs, z0 = -hd + k * tz;
    const B = mkB('roof', B => {
      if (saw) {
        B.panel([x0, h, z0], [xs, 0, 0], [0, hs, tz], cell, { n: V.norm([0, tz, -hs]), two: true, br: .4, edge: .55, seams: [Math.round(13 / cell), 0], sbr: .26 });
        B.panel([x0, h, z0 + tz], [xs, 0, 0], [0, hs, 0], .6, { n: Z_, two: true, br: .3, ch: 5, edge: .5, seams: [Math.round(5.2 / .6), 0], sbr: .4 });
        if (j === 0) tri(B, [x0, h, z0], [x0, h, z0 + tz], [x0, h + hs, z0 + tz], cell, { br: .36, edge: .5, two: true });
        if (j === nX - 1) tri(B, [x0 + xs, h, z0], [x0 + xs, h, z0 + tz], [x0 + xs, h + hs, z0 + tz], cell, { br: .36, edge: .5, two: true });
      } else B.panel([x0, h, z0], [xs, 0, 0], [0, 0, tz], cell, { n: Y_, two: true, br: .4, edge: .55, seams: [Math.round(6.5 / cell), Math.round(4 / cell)], sbr: .26 });
    });
    piece(B, 'roof', Tb, wp(x0 + xs / 2, h + hs / 2, z0 + tz / 2), null, null, Math.max(xs, tz));
  }
  // walls
  const wallSeg = (o, u, v, n) => {
    const L_ = V.len(u), nS = Math.max(1, Math.round(L_ / 34)), uu = V.mul(u, 1 / nS);
    for (let i = 0; i < nS; i++) {
      const a = V.mad(o, u, i / nS);
      const B = mkB('wall', B => {
        B.panel(a, uu, v, cell, { n, two: true, br: .34, edge: .6, seams: [Math.round(7.5 / cell), 0], sbr: .24 });
        if (O.win !== 0 && v[1] > 9) B.panel(V.add(V.add(a, [0, v[1] * .7, 0]), V.mul(n, .1)), uu, [0, 1.8, 0], .45, { n, two: true, br: .5, ch: 5, edge: false });
      });
      const c = V.add(V.mad(a, uu, .5), V.mul(v, .5));
      piece(B, 'wall', Tb, wp(c[0], c[1], c[2]), wp(a[0] + uu[0] / 2, a[1], a[2] + uu[2] / 2), n, Math.max(V.len(uu), v[1]));
    }
  };
  wallSeg([-hw, 0, -hd], [0, 0, d], [0, h, 0], [-1, 0, 0]); wallSeg([hw, 0, -hd], [0, 0, d], [0, h, 0], X_);
  for (const sd of [-1, 1]) {
    const z = sd * hd, n = [0, 0, sd], doors = ((sd < 0 ? O.doorsS : O.doorsN) || []).slice().sort((a, b) => a.x - b.x);
    let x = -hw;
    for (const dr of doors) {
      const xa = dr.x - dr.w / 2;
      if (xa > x + .5) wallSeg([x, 0, z], [xa - x, 0, 0], [0, h, 0], n);
      wallSeg([xa, dr.h, z], [dr.w, 0, 0], [0, h - dr.h, 0], n);
      x = dr.x + dr.w / 2;
      lamp(wp(dr.x - dr.w / 2 - 1.2, dr.h - 1, z + sd * .8), 0); lamp(wp(dr.x + dr.w / 2 + 1.2, dr.h - 1, z + sd * .8), 0);
    }
    if (hw > x + .5) wallSeg([x, 0, z], [hw - x, 0, 0], [0, h, 0], n);
  }
  // portal frames
  const nF = Math.max(2, Math.round(d / 19)), fz = d / nF, cols = O.cols || (w > 70 ? [-hw, 0, hw] : [-hw, hw]);
  for (let k = 0; k <= nF; k++) {
    const z = -hd + k * fz;
    const B = mkB('frame', B => {
      for (const x of cols) { B.tube([x, 0, z], [x, h, z], .42, .55); B.knot([x, h, z], .9, .7); }
      B.line([-hw, h, z], [hw, h, z], .55); B.line([-hw, h - 2.4, z], [hw, h - 2.4, z], .45);
      const nd = Math.round(w / 4.5); for (let i = 0; i < nd; i++) { const xa = -hw + i * w / nd; B.line([xa, h - 2.4, z], [xa + w / nd, h, z], .32); }
      if (O.crane && k < nF) for (const x of cols) if (Math.abs(x) < hw + 1) B.line([x, h - 6.5, z], [x, h - 6.5, z + fz], .6);
    });
    piece(B, 'frame', Tb, wp(0, h / 2, z), wp(0, 0, z), null, h);
  }
  // the floor (stays; gone in the crater) in strips, with a plinth
  const nFl = Math.max(1, Math.round(d / 48)), fd = d / nFl;
  for (let k = 0; k < nFl; k++) {
    const z0 = -hd + k * fd;
    const B = mkB('floor', B => {
      B.panel([-hw, .05, z0], [w, 0, 0], [0, 0, fd], 1.1, { n: Y_, br: .2, edge: false, seams: [Math.round(19 / 1.1), Math.round(19 / 1.1)], sbr: .14 });
      B.panel([-hw - .3, -2.6, z0], [0, 0, fd], [0, 2.6, 0], .8, { n: [-1, 0, 0], br: .3, edge: .5 }); B.panel([hw + .3, -2.6, z0], [0, 0, fd], [0, 2.6, 0], .8, { n: X_, br: .3, edge: .5 });
      if (k === 0) B.panel([-hw, -2.6, -hd - .3], [w, 0, 0], [0, 2.6, 0], .8, { n: [0, 0, -1], br: .3, edge: .5 });
      if (k === nFl - 1) B.panel([-hw, -2.6, hd + .3], [w, 0, 0], [0, 2.6, 0], .8, { n: Z_, br: .3, edge: .5 });
    });
    piece(B, 'floor', Tb, wp(0, 0, z0 + fd / 2), null, null, fd);
  }
  // lamps under the roof, beacons on the corners
  const lx = Math.max(1, Math.round(w / 22)), lz = Math.max(1, Math.round(d / 19));
  for (let i = 0; i < lx; i++) for (let k = 0; k < lz; k++) lamp(wp(-hw + (i + .5) * w / lx, h - 1.6, -hd + (k + .5) * d / lz), 3);
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) beacon(wp(x, h + hs + .8, z));
  return Tb;
}
/* an arched hangar: ribs and curved roof facets, a back wall, the door open (+Z) */
function hangarB(s) {
  const w = s.w, d = s.d, h = s.h, hw = w / 2, hd = d / 2, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  const NA = 8, arc = i => { const t = PI * i / NA; return [-Math.cos(t) * hw, Math.sin(t) * h]; };
  const nR = 5, rz = d / nR;
  for (let k = 0; k < nR; k++) for (let i = 0; i < NA; i += 2) {
    const z0 = -hd + k * rz;
    const B = mkB('hroof', B => { for (let q = i; q < i + 2; q++) { const [x0, y0] = arc(q), [x1, y1] = arc(q + 1); B.panel([x0, y0, z0], [x1 - x0, y1 - y0, 0], [0, 0, rz], .7, { two: true, br: .4, edge: .5, seams: [0, Math.round(4 / .7)], sbr: .25 }); } });
    const [xa, ya] = arc(i + 1);
    piece(B, 'roof', Tb, wp(xa, ya, z0 + rz / 2), null, null, rz);
  }
  for (let k = 0; k <= nR; k++) { const z = -hd + k * rz; const B = mkB('rib', B => { for (let i = 0; i < NA; i++) { const [x0, y0] = arc(i), [x1, y1] = arc(i + 1); B.tube([x0, y0, z], [x1, y1, z], .35, .55); } }); piece(B, 'frame', Tb, wp(0, h / 2, z), wp(0, 0, z), null, h); }
  const back = mkB('hback', B => { for (let i = 0; i < NA; i++) { const [x0, y0] = arc(i), [x1, y1] = arc(i + 1); B.trap([x0, 0, -hd], [x1 - x0, 0, 0], [0, 0, 0], [0, 0, 0], .7, { edge: false }); quad(B, [x0, 0, -hd], [x1, 0, -hd], [x1, y1, -hd], [x0, y0, -hd], .7, { two: true, br: .32, edge: .55 }); } });
  piece(back, 'wall', Tb, wp(0, h / 2, -hd), wp(0, 0, -hd), [0, 0, -1], w);
  const fl = mkB('hfloor', B => { B.panel([-hw, .05, -hd], [w, 0, 0], [0, 0, d], 1.1, { n: Y_, br: .2, edge: .4 }); B.line([0, .1, hd], [0, .1, hd + 40], .5); });
  piece(fl, 'floor', Tb, wp(0, 0, 0), null, null, d);
  for (let k = 0; k < 3; k++) lamp(wp(0, h - 2, -hd + (k + .5) * d / 3), 3);
  lamp(wp(-hw + 2, 8, hd + 1), 0); lamp(wp(hw - 2, 8, hd + 1), 0); beacon(wp(0, h + .8, 0));
}
/* the dry dock: walls, a gate, keel blocks, the hull half plated, a goliath crane on rails (moving: MOV) */
let DOCK = null;
function dockB(s) {
  const w = s.w, d = s.d, h = 24, hw = w / 2, hd = d / 2, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  // walls (thick: inner and outer faces, a coping), in 40 m pieces; the gate at the sea end
  for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) {
    const z0 = -hd + k * d / 8, L_ = d / 8;
    const B = mkB('dwall', B => {
      B.panel([sx * hw, 0, z0], [0, 0, L_], [0, h, 0], .8, { n: [-sx, 0, 0], two: true, br: .34, edge: .55, seams: [Math.round(5 / .8), Math.round(3 / .8)], sbr: .2 });
      B.panel([sx * (hw + 6), 0, z0], [0, 0, L_], [0, h, 0], .8, { n: [sx, 0, 0], br: .3, edge: .55 });
      B.panel([sx * hw, h, z0], [sx * 6, 0, 0], [0, 0, L_], .8, { n: Y_, two: true, br: .36, edge: .5 });
      for (let i = 0; i < 5; i++) B.line([sx * (hw + 1.5), .3 + i * 5, z0], [sx * (hw + 1.5), .3 + i * 5, z0 + L_], .3);
    });
    piece(B, 'wall', Tb, wp(sx * (hw + 3), h / 2, z0 + L_ / 2), wp(sx * (hw + 3), 0, z0 + L_ / 2), [sx, 0, 0], L_);
    lamp(wp(sx * (hw + 3), h + 6, z0 + L_ / 2), 0);
  }
  const gate = mkB('gate', B => { B.panel([-hw, 0, -hd - 3], [w, 0, 0], [0, h - 2, 0], .8, { n: [0, 0, -1], two: true, br: .4, edge: .6, seams: [Math.round(6 / .8), Math.round(4 / .8)] }); B.obox([0, h - 1, -hd - 3], X_, Y_, Z_, [hw + 6, 1, 3], .6, { br: .45, edge: .6 }); });
  piece(gate, 'wall', Tb, wp(0, h / 2, -hd - 3), wp(0, 0, -hd - 3), [0, 0, -1], w);
  const fl = mkB('dfloor', B => { B.panel([-hw, 0, -hd], [w, 0, 0], [0, 0, d], 1.2, { n: Y_, br: .18, edge: .4, seams: [Math.round(8 / 1.2), Math.round(8 / 1.2)], sbr: .12 }); for (let z = -hd + 12; z < hd - 10; z += 6) B.obox([0, 1.2, z], X_, Y_, Z_, [1.2, 1.2, .9], .3, { br: .5, edge: .65 }); });
  piece(fl, 'floor', Tb, wp(0, 0, 0), null, null, d);
  // the hull: bow toward the gate (-Z), 210 m, beam 26, keel at 2.4, deck at 24.5; plated aft of FR_P, ribs ahead
  const HL = 210, Z0 = 95, KY = 2.4, DY = 24.5, NS = 36;
  const half = (f, y) => { const b = 13 * Math.pow(sat((1 - f) / .3), .55) * (.82 + .18 * sat(f / .08)); const v = sat((y - KY) / 5); return b * (y > KY + 5 ? 1 - .06 * (y - KY - 5) / (DY - KY - 5) : Math.sqrt(v) * .85 + .15 * v); };
  const sec = f => { const P = []; for (const y of [KY, KY + 1, KY + 2.5, KY + 5, 12, 18, DY]) P.push([half(f, y), y]); return P; };
  const zOf = f => Z0 - f * HL;
  const FR_P = .62;
  for (let g = 0; g < NS; g += 3) {
    const f0 = g / NS, f1 = Math.min(1, (g + 3) / NS);
    const B = mkB('hull', B => {
      for (let i = g; i <= g + 3 && i <= NS; i++) { const f = i / NS, S = sec(f), z = zOf(f); for (let k = 0; k < S.length - 1; k++) for (const sx of [-1, 1]) B.line([sx * S[k][0], S[k][1], z], [sx * S[k + 1][0], S[k + 1][1], z], .5); B.line([-S[0][0], KY, z], [S[0][0], KY, z], .4); }
      for (let i = g; i < g + 3 && i < NS; i++) {
        const fa = i / NS, fb = (i + 1) / NS, Sa = sec(fa), Sb = sec(fb), za = zOf(fa), zb = zOf(fb);
        const plated = fb < FR_P || (fb < FR_P + .12 && hh(i, 7) < .5);
        for (let k = 0; k < Sa.length - 1; k++) for (const sx of [-1, 1]) {
          if (plated) quad(B, [sx * Sa[k][0], Sa[k][1], za], [sx * Sb[k][0], Sb[k][1], zb], [sx * Sb[k + 1][0], Sb[k + 1][1], zb], [sx * Sa[k + 1][0], Sa[k + 1][1], za], .45, { two: true, br: .5, edge: .35 });
          else if (k === 0 || k === Sa.length - 2) B.line([sx * Sa[k + 1][0], Sa[k + 1][1], za], [sx * Sb[k + 1][0], Sb[k + 1][1], zb], .45);
        }
        if (plated && fa < .55) quad(B, [-Sa[6][0], DY, za], [Sa[6][0], DY, za], [Sb[6][0], DY, zb], [-Sb[6][0], DY, zb], .5, { two: true, br: .42, edge: .35 });
      }
    });
    const fm = (f0 + f1) / 2;
    piece(B, 'misc', Tb, wp(0, 13, zOf(fm)), wp(0, 2, zOf(fm)), null, 20);
  }
  // the superstructure (angular, one block) and a mast
  const SZ = zOf(.35);
  const sup = mkB('super', B => {
    const y0 = DY, y1 = DY + 11, a = 9, b = 6.5, L0 = 18, L1 = 13;
    quad(B, [-a, y0, SZ - L0], [a, y0, SZ - L0], [b, y1, SZ - L1], [-b, y1, SZ - L1], .3, { two: true, br: .6, edge: .8 });
    quad(B, [-a, y0, SZ + L0], [a, y0, SZ + L0], [b, y1, SZ + L1], [-b, y1, SZ + L1], .3, { two: true, br: .6, edge: .8 });
    for (const sx of [-1, 1]) quad(B, [sx * a, y0, SZ - L0], [sx * a, y0, SZ + L0], [sx * b, y1, SZ + L1], [sx * b, y1, SZ - L1], .3, { two: true, br: .55, edge: .8 });
    B.panel([-b, y1, SZ - L1], [2 * b, 0, 0], [0, 0, 2 * L1], .3, { n: Y_, two: true, br: .5, edge: .7 });
    B.panel([-b * .9, y1 - 3, SZ - L1 - .6], [2 * b * .9, 0, 0], [0, 1.2, 0], .2, { n: [0, 0, -1], two: true, br: .5, ch: 5, edge: false });
    B.tube([0, y1, SZ - 2], [0, y1 + 16, SZ - 2], .5, .6); B.line([0, y1 + 10, SZ - 2], [0, y1 + 10, SZ - 9], .5);
    quad(B, [-1.5, y1 + 5, SZ - 6], [1.5, y1 + 5, SZ - 6], [1.5, y1 + 9, SZ - 6], [-1.5, y1 + 9, SZ - 6], .2, { ch: 1, two: true, br: 1, edge: false });
  });
  piece(sup, 'dome', Tb, wp(0, DY + 6, SZ), wp(0, DY, SZ), null, 30);
  beacon(wp(0, DY + 28, SZ - 2));
  // the goliath crane: legs on rails on the walls, a 112 m girder at 76 m, a trolley; moves along the dock
  const GH = 76, GS = hw + 10;
  const gir = mkB('ggirder', B => {
    for (const z of [-3, 3]) B.obox([0, GH, z], X_, Y_, Z_, [GS + 6, 3, .8], .4, { br: .55, edge: .8 });
    for (let k = 0; k <= 28; k++) { const x = -GS - 6 + k * (2 * GS + 12) / 28; B.line([x, GH + 3, -3], [x, GH + 3, 3], .4); B.line([x, GH - 3, -3], [x, GH + 3, -3], .3); }
    for (const sx of [-1, 1]) for (const z of [-9, 9]) B.tube([sx * GS, h, z], [sx * GS, GH - 3, z * .35], 1.1, .6);
    for (const sx of [-1, 1]) { B.obox([sx * GS, h + 2, 0], X_, Y_, Z_, [2.4, 2, 12], .4, { br: .6, edge: .8 }); B.line([sx * GS, h + 18, -6], [sx * GS, h + 40, 6], .4); B.line([sx * GS, h + 18, 6], [sx * GS, h + 40, -6], .4); }
    quad(B, [-GS + 10, GH + 3.05, -3], [-GS + 22, GH + 3.05, -3], [-GS + 22, GH + 3.05, 3], [-GS + 10, GH + 3.05, 3], .3, { ch: 1, two: true, br: 1, edge: false });
  });
  const gtr = mkB('gtrolley', B => { B.obox([0, 0, 0], X_, Y_, Z_, [5, 2.2, 6], .3, { br: .7, edge: .85 }); });
  DOCK = { Tb, s, GH, GS, gir, gtr, hd, HL, Z0, wp, KY, DY, half, zOf, SZ };
  // rails on the copings
  const rl = mkB('drail', B => { for (const sx of [-1, 1]) B.line([sx * GS, h + .2, -hd + 2], [sx * GS, h + .2, hd + 60], .55); });
  piece(rl, 'floor', Tb, wp(0, h, 0), null, null, d);
}
/* a cooling tower in crumbling bands (hyperboloid), a vapour plume (drawn) */
function coolB(s) {
  const H = s.h, r0 = s.w / 2, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  const rOf = y => { const u = y / H; return r0 * (1 - .42 * Math.sin(Math.min(1, u / .78) * PI / 2)) + (u > .78 ? r0 * .14 * (u - .78) / .22 : 0); };
  const NB = 4, NQ = 4;
  for (let b = 0; b < NB; b++) for (let q = 0; q < NQ; q++) {
    const y0 = b * H / NB, y1 = (b + 1) * H / NB, a0 = q * TAU / NQ, a1 = (q + 1) * TAU / NQ, n = 10;
    const B = mkB('cool', B => {
      for (let i = 0; i < n; i++) {
        const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
        for (let j = 0; j < 4; j++) {
          const ya = y0 + (y1 - y0) * j / 4, yb = y0 + (y1 - y0) * (j + 1) / 4, ra = rOf(ya), rb = rOf(yb);
          quad(B, [Math.cos(t0) * ra, ya, Math.sin(t0) * ra], [Math.cos(t1) * ra, ya, Math.sin(t1) * ra], [Math.cos(t1) * rb, yb, Math.sin(t1) * rb], [Math.cos(t0) * rb, yb, Math.sin(t0) * rb], .9, { two: true, br: .36, edge: false });
        }
        if (i % 2 === 0) B.line([Math.cos(t0) * rOf(y0), y0, Math.sin(t0) * rOf(y0)], [Math.cos(t0) * rOf(y1), y1, Math.sin(t0) * rOf(y1)], .3);
      }
      for (const y of [y0, y1]) B.ring([0, y, 0], X_, Z_, rOf(y), 24, .45, 0, 0, a0, a1);
    });
    const tm = (a0 + a1) / 2, ym = (y0 + y1) / 2;
    piece(B, b === 0 ? 'misc' : 'band', Tb, wp(Math.cos(tm) * rOf(ym), ym, Math.sin(tm) * rOf(ym)), wp(Math.cos(tm) * rOf(y0), y0, Math.sin(tm) * rOf(y0)), null, H / NB);
  }
  for (let q = 0; q < 3; q++) beacon(wp(Math.cos(q * TAU / 3) * rOf(H), H + .6, Math.sin(q * TAU / 3) * rOf(H)));
  s.plume = wp(0, H, 0); s.pr = rOf(H);
}
/* a tower: shaft, a cabin (an ATC or the command mast), a radar (rotating, drawn) */
function mastB(s) {
  const H = s.h, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z], r = s.w / 2;
  const B = mkB('mast', B => {
    if (s.cab) {
      B.lathe([0, 0, 0], Y_, [[0, r * .55], [H - 8, r * .4], [H - 8, r], [H - 3, r * 1.08], [H, r * .8], [H, 0]], { cell: .4, br: .55, rings: true, rbr: .5, seams: 8 });
      B.lathe([0, H - 7.6, 0], Y_, [[0, r * 1.01], [4, r * 1.09]], { cell: .3, br: .5, ch: 5, rings: false });
      B.line([0, H, 0], [0, H + 9, 0], .6);
    } else {
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.tube([x * r, 0, z * r], [x * r * .4, H, z * r * .4], .35, .55);
      for (let k = 0; k < 8; k++) { const y0 = k * H / 8, y1 = (k + 1) * H / 8, f0 = 1 - .6 * y0 / H, f1 = 1 - .6 * y1 / H; B.line([-r * f0, y0, -r * f0], [r * f1, y1, -r * f1], .3); B.line([r * f0, y0, r * f0], [-r * f1, y1, r * f1], .3); B.line([-r * f0, y0, r * f0], [r * f1, y1, r * f1], .3); B.line([r * f0, y0, -r * f0], [-r * f1, y1, -r * f1], .3); }
      B.obox([0, H + 1.5, 0], X_, Y_, Z_, [r * .55, 1.5, r * .55], .3, { br: .6, edge: .8 });
    }
  });
  piece(B, 'mast', Tb, wp(0, H / 2, 0), wp(0, 0, 0), null, H);
  beacon(wp(0, H + (s.cab ? 9.2 : 3.3), 0));
  if (s.radar) s.rad = wp(0, H + 3.2, 0);
}
function stackB(s) {
  const H = s.h, r = s.w / 2, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  for (let k = 0; k < 2; k++) {
    const y0 = k * H / 2, y1 = (k + 1) * H / 2, B = mkB('stack', B => { B.lathe([0, y0, 0], Y_, [[0, r * (1 - .3 * y0 / H)], [y1 - y0, r * (1 - .3 * y1 / H)]], { cell: .5, br: .5, rings: true, rbr: .5, seams: 6 }); if (k) { B.ring([0, H - 6, 0], X_, Z_, r * .8, 16, .9, 1, 0); B.ring([0, H - 8, 0], X_, Z_, r * .8, 16, .9, 1, 0); } });
    piece(B, k ? 'mast' : 'misc', Tb, wp(0, (y0 + y1) / 2, 0), wp(0, y0, 0), null, y1 - y0);
  }
  beacon(wp(0, H + .5, 0)); beacon(wp(0, H * .6, r * .9));
  s.plume = wp(0, H, 0); s.pr = r * .7;
}
function reactorB(s) {
  const H = s.h, r = s.w / 2, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  const base = mkB('rbase', B => { B.lathe([0, 0, 0], Y_, [[0, r], [H * .5, r]], { cell: .7, br: .45, rings: true, rbr: .45, seams: 12, two: true }); for (let k = 0; k < 6; k++) B.ring([0, 4 + k * 3.4, 0], X_, Z_, r + .1, 48, .25); });
  piece(base, 'misc', Tb, wp(0, H * .25, 0), wp(0, 0, 0), null, H * .5);
  const dome = mkB('rdome', B => { const st = []; for (let k = 0; k <= 10; k++) { const t = k / 10 * PI / 2; st.push([Math.sin(t) * r * .9, Math.cos(t) * r + 1e-3]); } B.lathe([0, H * .5, 0], Y_, st, { cell: .7, br: .5, rings: true, rbr: .4, seams: 12, two: true }); B.ring([0, H * .5 + r * .45, 0], X_, Z_, r * .9, 40, .9, 1, 0); });
  piece(dome, 'dome', Tb, wp(0, H * .5 + r * .45, 0), wp(0, H * .5, 0), null, r);
  beacon(wp(0, H * .5 + r * .9 + .5, 0));
}
function radomeB(s) {
  const r = s.w / 2, H = s.h, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z], yb = H - r * 1.6;
  const base = mkB('rdb', B => { B.obox([0, yb / 2, 0], X_, Y_, Z_, [r * .7, yb / 2, r * .7], .5, { br: .45, edge: .6 }); });
  piece(base, 'misc', Tb, wp(0, yb / 2, 0), wp(0, 0, 0), null, yb);
  const dome = mkB('rdd', B => { const st = []; for (let k = 0; k <= 14; k++) { const t = k / 14 * PI * .82; st.push([r * (1 - Math.cos(t)), r * Math.sin(t) + 1e-3]); } B.lathe([0, yb - r * .2, 0], Y_, st, { cell: .5, br: .55, rings: true, rbr: .3, seams: 10, two: true }); });
  piece(dome, 'dome', Tb, wp(0, yb + r * .8, 0), wp(0, yb, 0), null, r * 2);
  beacon(wp(0, yb + r * 1.62, 0));
}
function fuelB(s) {
  const r = s.w / 2, H = s.h, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  const B = mkB('fuel', B => { B.lathe([0, 0, 0], Y_, [[0, r], [H, r], [H + 2, r * .55], [H + 2.4, 0]], { cell: .45, br: .5, rings: true, rbr: .45, seams: 10, two: true }); B.ring([0, H * .55, 0], X_, Z_, r + .05, 36, 1, 1, 0); for (let k = 0; k < 10; k++) { const t = k / 10 * TAU; B.line([Math.cos(t) * (r + .4), 0, Math.sin(t) * (r + .4)], [Math.cos(t + .4) * (r + .4), H, Math.sin(t + .4) * (r + .4)], .25); } });
  piece(B, 'dome', Tb, wp(0, H / 2, 0), wp(0, 0, 0), null, H);
}
function officeB(s) {
  const w = s.w, d = s.d, h = s.h, Tb = { R: IDT.R.slice(), T: [s.x, s.y, s.z] }, wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  const nf = Math.round(h / 3.5);
  for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const n = [sx, 0, sz], L_ = sx ? d : w, o = sx ? [sx * w / 2, 0, -d / 2] : [-w / 2, 0, sz * d / 2], u = sx ? [0, 0, d] : [w, 0, 0];
    const B = mkB('ofw', B => { B.panel(o, u, [0, h, 0], .5, { n, two: true, br: .36, edge: .65, seams: [Math.round(3 / .5), 0], sbr: .2 }); for (let f = 0; f < nf; f++) B.panel(V.add(V.add(o, [0, f * 3.5 + 1.2, 0]), V.mul(n, .08)), u, [0, 1.3, 0], .4, { n, two: true, br: .5, ch: 5, edge: false }); });
    piece(B, 'wall', Tb, wp(o[0] + u[0] / 2, h / 2, o[2] + u[2] / 2), wp(o[0] + u[0] / 2, 0, o[2] + u[2] / 2), n, L_);
  }
  const rf = mkB('ofr', B => { B.panel([-w / 2, h, -d / 2], [w, 0, 0], [0, 0, d], .6, { n: Y_, two: true, br: .4, edge: .6 }); B.obox([w * .2, h + 1.5, 0], X_, Y_, Z_, [6, 1.5, 4], .4, { br: .5, edge: .7 }); for (let k = 0; k < 4; k++) B.line([-w / 2 + 6 + k * 3, h, -d / 2 + 5], [-w / 2 + 6 + k * 3, h + 8 + k * 2, -d / 2 + 5], .5); });
  piece(rf, 'roof', Tb, wp(0, h, 0), null, null, w);
  beacon(wp(-w / 2, h + .5, -d / 2)); beacon(wp(w / 2, h + .5, d / 2));
  lamp(wp(0, 4, d / 2 + 1.5), 0); lamp(wp(-w / 2 - 1.5, 4, 0), 0);
}
/* the perimeter wall in 40 m pieces with towers */
function wallsB() {
  const segs = [[WALL.x0, WALL.z0, WALL.x0, WALL.z1], [WALL.x0, WALL.z1, WALL.x1, WALL.z1], [WALL.x1, WALL.z1, WALL.x1, WALL.z0], [WALL.x1, WALL.z0, 372, WALL.z0], [292, WALL.z0, WALL.x0, WALL.z0]];
  for (const [x0, z0, x1, z1] of segs) {
    const L_ = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L_ / 40)), ux = (x1 - x0) / L_, uz = (z1 - z0) / L_;
    for (let k = 0; k < n; k++) {
      const xa = x0 + (x1 - x0) * k / n, za = z0 + (z1 - z0) * k / n, xb = x0 + (x1 - x0) * (k + 1) / n, zb = z0 + (z1 - z0) * (k + 1) / n;
      const ya = gy(xa, za), yb = gy(xb, zb), xm = (xa + xb) / 2, zm = (za + zb) / 2, ym = Math.min(ya, yb);
      const Tb = { R: IDT.R.slice(), T: [xm, ym, zm] }, lx = xa - xm, lz = za - zm;
      const B = mkB('pwall', B => { quad(B, [lx, ya - ym - 1, lz], [-lx, yb - ym - 1, -lz], [-lx, yb - ym + 5, -lz], [lx, ya - ym + 5, lz], .6, { two: true, br: .34, edge: .6, seams: [Math.round(5 / .6), 0], sbr: .22 }); B.line([lx, ya - ym + 5.6, lz], [-lx, yb - ym + 5.6, -lz], .5); });
      piece(B, 'wall', Tb, [xm, ym + 2.5, zm], [xm, ym, zm], [uz, 0, -ux], L_ / n);
      if (k % 6 === 0) {
        const T2 = { R: IDT.R.slice(), T: [xa, ya, za] };
        const tw = mkB('ptower', B => { for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) B.tube([x, 0, z], [x * .8, 14, z * .8], .2, .55); B.obox([0, 15.5, 0], X_, Y_, Z_, [2.6, 1.5, 2.6], .25, { br: .55, edge: .8 }); B.panel([-2.4, 15, 2.65], [4.8, 0, 0], [0, 1, 0], .2, { n: Z_, two: true, br: .5, ch: 5, edge: false }); });
        piece(tw, 'mast', T2, [xa, ya + 8, za], [xa, ya, za], null, 17);
        beacon([xa, ya + 17.5, za]); lamp([xa, ya + 14, za], 0);
      }
    }
  }
}
/* the ground's markings: roads, the rail, aprons, the runway (static lattice hairlines; lamps on the roads) */
let GND = null;
function groundB() {
  GND = mkB('gnd', B => {
    const seg = (x0, z0, x1, z1, wd, br, dash, lights, lk) => {
      const L_ = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L_, uz = (z1 - z0) / L_, vx = -uz, vz = ux, n = Math.max(1, Math.ceil(L_ / 30));
      B.chunk('r');
      for (let k = 0; k < n; k++) {
        const fa = k / n, fb = (k + 1) / n, xa = x0 + (x1 - x0) * fa, za = z0 + (z1 - z0) * fa, xb = x0 + (x1 - x0) * fb, zb = z0 + (z1 - z0) * fb;
        for (const s of [-1, 1]) B.line([xa + vx * s * wd / 2, gy(xa + vx * s * wd / 2, za + vz * s * wd / 2) + .15, za + vz * s * wd / 2], [xb + vx * s * wd / 2, gy(xb + vx * s * wd / 2, zb + vz * s * wd / 2) + .15, zb + vz * s * wd / 2], br);
        if (dash) B.line([xa, gy(xa, za) + .16, za], [xa + ux * 9, gy(xa + ux * 9, za + uz * 9) + .16, za + uz * 9], br * .8);
        if (lights && k % 2 === 0) { const s = (k / 2) % 2 ? 1 : -1, px = xa + vx * s * (wd / 2 + 2), pz = za + vz * s * (wd / 2 + 2); if (lk === 0) { B.line([px, gy(px, pz), pz], [px, gy(px, pz) + 9, pz], .35); } lamp([px, gy(px, pz) + (lk === 0 ? 9 : .5), pz], lk); }
      }
    };
    for (const r of RD) seg(r[0], r[1], r[2], r[3], 12, .32, true, true, 0);
    const rail = (P) => { for (let i = 0; i < P.length - 1; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1]; B.chunk('rl'); const L_ = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L_, uz = (z1 - z0) / L_, vx = -uz, vz = ux, n = Math.max(1, Math.ceil(L_ / 30)); for (let k = 0; k < n; k++) { const fa = k / n, fb = (k + 1) / n; for (const s of [-.75, .75]) { const xa = x0 + (x1 - x0) * fa + vx * s, za = z0 + (z1 - z0) * fa + vz * s, xb = x0 + (x1 - x0) * fb + vx * s, zb = z0 + (z1 - z0) * fb + vz * s; B.line([xa, gy(xa, za) + .3, za], [xb, gy(xb, zb) + .3, zb], .55); } for (let q = 0; q < 30; q += 3) { const x = x0 + (x1 - x0) * fa + ux * q, z = z0 + (z1 - z0) * fa + uz * q; B.line([x - vx * 1.3, gy(x, z) + .2, z - vz * 1.3], [x + vx * 1.3, gy(x, z) + .2, z + vz * 1.3], .25); } } } };
    rail(RAIL); rail(RSP);
    // the runway: edges, the centre line, threshold bars, numbers' blocks; the taxiway; the apron's stands
    const R_ = STI.rwy, x0 = R_.x - R_.w / 2, x1 = R_.x + R_.w / 2, z = R_.z;
    seg(x0, z, x1, z, R_.d, .5, false, false);
    for (let x = x0 + 30; x < x1 - 30; x += 60) { B.chunk('rc'); B.line([x, gy(x, z) + .15, z], [x + 30, gy(x + 30, z) + .15, z], .5); lamp([x, gy(x, z - R_.d / 2 - 1) + .4, z - R_.d / 2 - 1], 2); lamp([x, gy(x, z + R_.d / 2 + 1) + .4, z + R_.d / 2 + 1], 2); }
    for (const xe of [x0 + 8, x1 - 38]) for (let k = 0; k < 8; k++) { const zz = z - R_.d / 2 + 4 + k * 5; B.line([xe, gy(xe, zz) + .15, zz], [xe + 30, gy(xe + 30, zz) + .15, zz], .55); }
    const T_ = STI.taxi; seg(T_.x - T_.w / 2, T_.z, T_.x + T_.w / 2, T_.z, T_.d, .38, true, false);
    for (let x = T_.x - T_.w / 2 + 20; x < T_.x + T_.w / 2; x += 40) lamp([x, gy(x, T_.z) + .3, T_.z], 2);
    for (const xc of [-600, -150, 300, 650]) seg(xc, T_.z + T_.d / 2, xc, R_.z - R_.d / 2, 22, .38, true, false);
    const A = STI.apron; seg(A.x - A.w / 2, A.z, A.x + A.w / 2, A.z, A.d, .3, false, false);
    for (let k = 0; k < 8; k++) { const x = -558 + 115 * k; seg(x, 593, x, A.z - A.d / 2, 30, .3, true, false); }
    // the armour park's bays, the switchyard's frames
    const P_ = STI.park; seg(P_.x - P_.w / 2, P_.z, P_.x + P_.w / 2, P_.z, P_.d, .32, false, false);
    B.chunk('pk'); for (let k = 0; k <= 12; k++) { const x = P_.x - P_.w / 2 + 10 + k * (P_.w - 20) / 12; B.line([x, gy(x, P_.z - 50) + .15, P_.z - 50], [x, gy(x, P_.z + 50) + .15, P_.z + 50], .25); }
    const Y = STI.yard; B.chunk('yd');
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { const x = Y.x - 33 + i * 22, zz = Y.z - 20 + k * 20, y0 = gy(x, zz); B.obox([x, y0 + 2.5, zz], X_, Y_, Z_, [2.5, 2.5, 1.8], .3, { br: .5, edge: .7 }); B.line([x, y0 + 5, zz], [x, y0 + 14, zz], .45); B.line([x - 3, y0 + 13, zz], [x + 3, y0 + 13, zz], .45); }
    for (let i = 0; i < 4; i++) { const x = Y.x - 33 + i * 22; B.line([x, gy(x, Y.z - 20) + 13, Y.z - 20], [x, gy(x, Y.z + 20) + 13, Y.z + 20], .4); }
  });
}

/* =====================================================================================================
   MOVING THINGS and the LINES
   ===================================================================================================== */
const PT = 16, PMV = 4.2, PTJ = 19, PMJ = 4.6;              // the lines' periods and index moves (s)
const TANK_N = 14, TANK_SP = 24, TANK_Z0 = -172, JET_N = 12, JET_SP = 27, JET_Z0 = -165, LX = 41.5;
const TK_ADD = { lower: 1, upper: 2, skirt: 3, turret: 4, mark: 5, test: 6 };
const JT_ADD = { fus: 1, wing: 2, tail: 3, canopy: 4, gear: 3, test: 6 };
let PLX = null;                                             // the plant's base transform
const lineIdx = (F, P, M) => { const k = Math.floor(F / P), r = F - k * P; return { k, mv: kk(r, P - M, P), dw: r < P - M ? r : -1 }; };
/* the plant's frame -> world */
const plw = (x, y, z, o) => { o = o || [0, 0, 0]; o[0] = PLX.T[0] + x; o[1] = PLX.T[1] + y; o[2] = PLX.T[2] + z; return o; };
/* a two-link arm reaching for a point (plant frame): base at b (floor), returns the joints (world) */
const L1 = 3.5, L2 = 2.9, SH = 1.45;
function armIK(bx, bz, tx, ty, tz, J) {
  const sx = bx, sy = SH, sz = bz, dx = tx - sx, dy = ty - sy, dz = tz - sz, r = Math.hypot(dx, dz), D = Math.min(L1 + L2 - .05, Math.max(.6, Math.hypot(r, dy)));
  const ca = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), a = Math.acos(E.clamp(ca, -1, 1)), el = Math.atan2(dy, r) + a, hx = dx / (r || 1), hz = dz / (r || 1);
  const ex = sx + hx * Math.cos(el) * L1, ey = sy + Math.sin(el) * L1, ez = sz + hz * Math.cos(el) * L1;
  const k = D / Math.hypot(r, dy);
  J.s = plw(sx, sy, sz); J.e = plw(ex, ey, ez); J.t = plw(sx + dx * Math.min(1, k), sy + dy * Math.min(1, k), sz + dz * Math.min(1, k)); J.h = [hx, 0, hz];
  return J;
}
const ARMS = [];       // { line: 't'|'j', st (station), side, bz, phase, tgt(F) }
function linesB() {
  for (const [ln, stations] of [['t', [1, 2, 3, 5]], ['j', [1, 3, 4, 5]]]) for (const k of stations) for (const sd of [-1, 1]) for (const dz of [-2.6, 2.6]) {
    if (ln === 'j' && k === 4 && dz > 0) continue;
    const cx = (ln === 't' ? -LX : LX), z = (ln === 't' ? TANK_Z0 + k * TANK_SP : JET_Z0 + k * JET_SP) + dz * (ln === 'j' ? 1.6 : 1);
    ARMS.push({ ln, k, sd, bx: cx + sd * (ln === 't' ? 5.6 : 8.2), bz: z, ph: hh(k * 7 + sd, dz) * TAU });
  }
  // the static line furniture: rails, jigs, the test gates, cabinets, floor marks (in the plant's frame)
  const fur = mkB('lines', B => {
    for (const [cx, N, sp, z0, wd] of [[-LX, TANK_N, TANK_SP, TANK_Z0, 5.2], [LX, JET_N, JET_SP, JET_Z0, 7.2]]) {
      B.chunk('rail');
      for (const s of [-1, 1]) B.line([cx + s * 1.5, .15, -188], [cx + s * 1.5, .15, 188], .55);
      for (const s of [-1, 1]) for (let z = -186; z < 186; z += 6) B.line([cx + s * wd, .1, z], [cx + s * wd, .1, z + 3], .35);
      for (let k = 0; k < N; k++) {
        const z = z0 + k * sp; B.chunk('st');
        for (const s of [-1, 1]) { B.obox([cx + s * (wd + 3.2), .8, z - sp * .32], X_, Y_, Z_, [.8, .8, .5], .12, { br: .55, edge: .75 }); B.panel([cx + s * (wd + 2.39), 1.1, z - sp * .32 - .35], [0, 0, .7], [0, .4, 0], .06, { n: [-s, 0, 0], two: true, br: .6, ch: 6, edge: false }); }
        B.line([cx - wd, .12, z - sp / 2], [cx + wd, .12, z - sp / 2], .5);
        if (k === 6) {
          // the test gate: a portal with laser heads (lime fans drawn)
          for (const s of [-1, 1]) { B.tube([cx + s * (wd + 1.2), 0, z], [cx + s * (wd + 1.2), 9, z], .35, .7); for (let q = 0; q < 5; q++) B.knot([cx + s * (wd + .8), 1.2 + q * 1.8, z], .18, .9, 3, 9000 + q); }
          B.tube([cx - wd - 1.2, 9, z], [cx + wd + 1.2, 9, z], .35, .7);
        }
      }
    }
    // the aisle: the camera's lane, a rail for the parts trains, dashes
    B.chunk('aisle'); for (let z = -186; z < 186; z += 8) B.line([0, .12, z], [0, .12, z + 4], .5);
    for (const s of [-1, 1]) B.line([s * 7.2, .12, -188], [s * 7.2, .12, 188], .4);
    // the turret stand (tank bay) and the wing rack (jet bay) beside their stations
    B.chunk('stand'); { const z = TANK_Z0 + TK_ADD.turret * TANK_SP; B.obox([-LX - 21, .7, z], X_, Y_, Z_, [3, .7, 3], .15, { br: .55, edge: .8 }); B.obox([-LX - 21, .7, z + 9], X_, Y_, Z_, [3, .7, 3], .15, { br: .55, edge: .8 }); }
    { const z = JET_Z0 + JT_ADD.wing * JET_SP; for (const dz of [-6, 6]) B.obox([LX + 24, 1.2, z + dz], X_, Y_, Z_, [2, 1.2, 4.5], .15, { br: .55, edge: .8 }); }
  });
  piece(fur, 'misc', PLX, plw(0, 1, 0), plw(0, 0, 0), null, 380, { noThrow: 1 });
}
/* traffic: polylines (world x, z) driven at a speed, looping; the train shuttles; jets taxi and take off */
const ROUTES = [];
function route(P, v, o) { const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); const r = Object.assign({ P, S, Ltot: S[S.length - 1], v }, o || {}); ROUTES.push(r); return r; }
function along(r, s, o) {
  s = ((s % r.Ltot) + r.Ltot) % r.Ltot; let i = 1; while (i < r.S.length - 1 && r.S[i] < s) i++;
  const f = (s - r.S[i - 1]) / Math.max(1e-6, r.S[i] - r.S[i - 1]), a = r.P[i - 1], b = r.P[i];
  o.x = a[0] + (b[0] - a[0]) * f; o.z = a[1] + (b[1] - a[1]) * f; o.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); return o;
}
function trafficB() {
  const loop = [[-713, -202], [717, -202], [717, 373], [-713, 373]];
  const ring = [[-713, -492], [717, -492], [717, 868], [-713, 868]];
  const spine = [[-126, -492], [-126, 533], [-120, 533], [-120, -492]];
  for (let k = 0; k < 4; k++) MOV.push({ kind: 'truck', r: route(loop.map(p => [p[0] + 3, p[1] + 3]), 11), s0: k * 900, lane: 3 });
  for (let k = 0; k < 2; k++) MOV.push({ kind: 'truck', r: route(ring.map(p => [p[0] + 3, p[1] + 3]), 13), s0: k * 2400, lane: 3 });
  MOV.push({ kind: 'truck', r: route(spine, 9), s0: 300 });
  // a column of three new tanks from the plant's north door round to the park
  const col = [[-59.5, 290], [-59.5, 373], [-126, 373], [-126, -202], [-383, -202], [-383, -265]];
  for (let k = 0; k < 3; k++) MOV.push({ kind: 'tank', r: route(col, 5.5, { once: 1 }), s0: -k * 18, per: 220 });
  // the train: shuttles the spur with a stop at each end
  MOV.push({ kind: 'train', r: route(RAIL, 1), per: 150 });
  // a jet taxiing east along the taxiway, one taking off west -> east
  MOV.push({ kind: 'taxi', per: 90 });
  MOV.push({ kind: 'takeoff', per: 70 });
}
const TRAIN_N = 5;
/* the facility's clock F -> the moving things' transforms (world); filled into m.X (and the parts) */
function moverAt(m, F, out) {
  if (m.kind === 'truck' || m.kind === 'tank') {
    let s;
    if (m.r.once) { const ph = ((F - m.s0 / m.r.v) % m.per + m.per) % m.per; s = Math.min(m.r.Ltot, ph * m.r.v); if (ph * m.r.v > m.r.Ltot + 60) return false; }
    else s = m.s0 + F * m.r.v;
    along(m.r, s, OUT); const x = OUT.x, z = OUT.z;
    out.R = yawR(OUT.yaw); out.T[0] = x; out.T[1] = gyF(x, z) + .05; out.T[2] = z; return true;
  }
  return false;
}
const OUT = { x: 0, z: 0, yaw: 0 };

/* =====================================================================================================
   BUILD
   ===================================================================================================== */
const VEH = [];             // parked vehicles (pieces) and their records for vehicles()
function build(ctx) {
  if (BUILT) return; BUILT = true;
  const t0 = performance.now();
  K = ctx.K || window.ORK; L = ctx.L || window.ORL; W = ctx.W; FX = ctx.FX || null;
  HIT = W.HIT.slice(); if (W.SUN) SUN = W.SUN; DOP.L = SUN; DOL.L = SUN; DOB.L = SUN;
  RV = 1.15 * ((W.CRA && W.CRA.R) || 200);
  arriveF = ctx.arrive || (FX && FX.arrive) || (d => { let lo = 0, hi = 20; const sR = a => 340 * a + 420 * (1 - Math.exp(-a * 3.2)); for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sR(m) < d) lo = m; else hi = m; } return hi; });
  buildVehicleBodies();
  for (const s of ST) s.y = baseOf(s);
  for (const s of ST) {
    CURSID = s.id;
    switch (s.kind) {
      case 'plant': PLX = hallB(s, { cols: [-PLW / 2, -8, 8, PLW / 2], crane: 1, doorsS: [{ x: -LX, w: 34, h: 18 }, { x: 0, w: 14, h: 17 }, { x: LX, w: 40, h: 18 }], doorsN: [{ x: -LX, w: 34, h: 18 }, { x: LX, w: 40, h: 18 }] }); break;
      case 'shed': { const Tb = hallB(s, { saw: s.saw, doorsS: [{ x: 0, w: Math.min(30, s.w * .4), h: Math.min(15, s.h * .7) }], doorsN: s.w > 60 ? [{ x: s.w * .2, w: 20, h: 12 }] : [] }); fillShed(s, Tb); break; }
      case 'hangar': hangarB(s); break;
      case 'dock': dockB(s); break;
      case 'cool': coolB(s); break;
      case 'mast': mastB(s); break;
      case 'stack': stackB(s); break;
      case 'reactor': reactorB(s); break;
      case 'radome': radomeB(s); break;
      case 'fuel': fuelB(s); break;
      case 'office': officeB(s); break;
    }
  }
  CURSID = null; wallsB(); groundB(); CURSID = 'plant'; linesB(); CURSID = null; parkedB(); trafficB();
  // turbine hall's switch lines to the yard; pipes from the reactor
  for (const p of PCS) fate(p);
  // lights: one body each for the lamps and the beacons, in spatial chunks; the arrival at each
  const mkLights = (list, nm) => {
    const idx = list.map((p, i) => i).sort((i, j) => (Math.floor(list[i][0] / 160) * 64 + Math.floor(list[i][2] / 160)) - (Math.floor(list[j][0] / 160) * 64 + Math.floor(list[j][2] / 160)));
    return mkB(nm, B => { let key = null; for (const i of idx) { const p = list[i], k = Math.floor(p[0] / 160) * 64 + Math.floor(p[2] / 160); if (k !== key) { B.chunk('l'); key = k; } const q = LTA.length; LTA.push(arriveF(Math.hypot(p[0] - HIT[0], p[2] - HIT[2]))); LTK.push(p[3]); B.knot([p[0], p[1], p[2]], .3, .9, 3, q); } });
  };
  LMP = mkLights(LAMPS, 'lamps'); BCN = mkLights(BEACS, 'beacons');
  // bounds, POI
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const s of ST) { const y0 = s.kind === 'dock' ? 0 : s.y; mn[0] = Math.min(mn[0], s.x - s.w / 2); mx[0] = Math.max(mx[0], s.x + s.w / 2); mn[2] = Math.min(mn[2], s.z - s.d / 2); mx[2] = Math.max(mx[2], s.z + s.d / 2); mn[1] = Math.min(mn[1], y0); mx[1] = Math.max(mx[1], y0 + s.h); }
  const c = V.mul(V.add(mn, mx), .5);
  ORTGT.bounds = { min: mn, max: mx, c, r: V.dist(mn, mx) / 2 };
  const P_ = STI.plant, at = (s, dy) => [s.x, s.y + (dy || 0), s.z];
  ORTGT.POI = { aim: HIT.slice(), plant: at(P_, 13), plantDoor: [P_.x, P_.y + 9, P_.z - PLD / 2], tankLine: plw(-LX, 2, TANK_Z0 + 2 * TANK_SP), jetLine: plw(LX, 2, JET_Z0 + 2 * JET_SP),
    dock: at(STI.dock, 12), hull: DOCK ? DOCK.wp(0, 14, DOCK.zOf(.4)) : at(STI.dock, 12), park: at(STI.park, 2), power: at(STI.cool1, 40), airfield: at(STI.hg3, 10), runway: [STI.rwy.x, STI.rwy.y, STI.rwy.z], command: at(STI.cmd, 8), radar: ['rd1', 'rd2', 'rd3'].map(k => at(STI[k], STI[k].h)) };
  // hook the base take's ground pass
  if (W && !W.__tgtHook && ORTGT.auto) {
    const f0 = W.drawVehicles;
    W.drawVehicles = function (gone) { const r = f0 ? f0.call(this, gone) : 0; if (ORTGT.auto) draw(null, { hook: 1 }); return r; };
    W.__tgtHook = 1;
  }
  if (window.ORW_LOG) window.ORW_LOG.push(`facility: ${PCS.length} pieces, ${LAMPS.length} lamps, ${BEACS.length} beacons, ${MOV.length} movers (${(performance.now() - t0).toFixed(0)} ms)`);
}
/* sheds' contents */
function fillShed(s, Tb) {
  const wp = (x, y, z) => [s.x + x, s.y + y, s.z + z];
  if (s.fill === 'turret') { for (let i = 0; i < 2; i++) for (let k = 0; k < 9; k++) { const p = wp(-20 + i * 40, 1.2, -90 + k * 22), T = yawX(PI * .5 * (i ? 1 : -1), p); piece([VB.tTurret], 'misc', T, [p[0], p[1] + .5, p[2]], p, null, 5); } }
  if (s.fill === 'engine') { for (let i = 0; i < 3; i++) for (let k = 0; k < 7; k++) { const p = wp(-30 + i * 30, 0, -70 + k * 22); piece([VB.nacelle], 'misc', yawX(0, p), [p[0], p[1] + 1.6, p[2]], p, null, 6); } }
  if (s.fill === 'block') { for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) { const p = wp(-26 + i * 52, 0, -48 + k * 30); piece([VB.block], 'misc', yawX(hh(i, k) * .3, p), [p[0], p[1] + 4, p[2]], p, null, 12); } }
}
/* parked vehicles: the armour park, the apron, the hangars, the line's finished tanks at the north door */
function parkedB() {
  const P_ = STI.park;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 12; k++) {
    const x = P_.x - P_.w / 2 + 16 + k * (P_.w - 32) / 11 + (k >= 6 ? 6 : -6), z = P_.z - 42 + r * 38, y = gy(x, z), T = yawX(r === 1 ? PI : 0, [x, y, z]);
    addTank(T);
  }
  for (let k = 0; k < 8; k++) { const x = -558 + 115 * k + 10, z = 628, T = yawX(PI * (k % 2 ? .97 : 1.03), [x, gy(x, z), z]); addJet(T); }
  for (const k of [0, 2, 3, 5, 6]) { const x = -558 + 115 * k, z = 568, T = yawX(PI, [x, STI['hg' + k].y, z]); addJet(T); }
}
function addTank(T) {
  const c = [T.T[0], T.T[1] + 1.2, T.T[2]];
  const p = piece([VB.tLower, VB.tUpper, VB.tSkirt], 'veh', T, c, null, null, 10);
  const tt = { R: T.R.slice(), T: X.ap(T, [0, 1.78, -.4]) };
  const q = piece([VB.tTurret], 'tur', tt, [tt.T[0], tt.T[1] + .6, tt.T[2]], null, null, 4);
  VEH.push({ p, kind: 'tank' }); q.parent = p;
}
function addJet(T) { const p = piece([VB.jFus, VB.jWing, VB.jTail, VB.jCanopy, VB.jGear], 'veh', T, [T.T[0], T.T[1] + 2.4, T.T[2]], null, null, 16); VEH.push({ p, kind: 'jet' }); }

/* =====================================================================================================
   DRAW
   ===================================================================================================== */
let SIMC = null, AOF = null, MAPIN = null, FSTRIKE = null;
function clocks() {
  if (SIMC) return true;
  try { const d = window.STAGE && STAGE.dbg && STAGE.dbg(); if (d && d.simClock && d.aOf && d.mapIn) { SIMC = d.simClock; AOF = d.aOf; MAPIN = d.mapIn; FSTRIKE = d.simClock(d.TI - 1e-3); return true; } } catch (e) { /* (during the load) */ }
  return false;
}
const TWv = mkX(), TWt = mkX(), TWa = mkX(), TWb = mkX(), TWc = mkX(), TWd = mkX(), P3 = [0, 0, 0], P3b = [0, 0, 0];
const J = {};
const TPROF = {}, KEEP = { roof: .5, floor: .45, wall: .7, band: .7 };
let EYEIN = null, NEAR = 1e9, EYE = [0, 0, 0], VIS = 1;
function setLook(al) {
  const sc = DS.sc, ht = DS.hot;
  DOP.col[0] = WH[0] + (SCO[0] - WH[0]) * sc; DOP.col[1] = WH[1] + (SCO[1] - WH[1]) * sc; DOP.col[2] = WH[2] + (SCO[2] - WH[2]) * sc;
  if (ht > 0) { DOP.col[0] += (VAP[0] - DOP.col[0]) * ht; DOP.col[1] += (VAP[1] - DOP.col[1]) * ht; DOP.col[2] += (VAP[2] - DOP.col[2]) * ht; }
  DOP.a = al * VIS * (1 + .8 * ht); DOP.lime = 0;
}
function drawPiece(p, Tw, al) {
  for (const B of p.Bs) { if (p.lime !== undefined) B.lime.fill(p.lime); L.draw(B, Tw, DOP); if (p.lime !== undefined) B.lime.fill(0); }
}
function draw(ctx, opts) {
  if (!BUILT) { if (ctx && ctx.W) build(ctx); else return; }
  opts = opts || {};
  const film = window.FILM ? FILM.T : 0; FT_ = film;
  if (opts.hook && VD.ft === film) opts = { a: -1, t: VD.t, scan: VD.scan, near: 3000 };      // (the visit is playing)
  // the strike's age and the clock
  let a = opts.a;
  if (a === undefined) { if (STR.ft === film) a = STR.a; else if (clocks()) { const T = MAPIN(film).T; a = AOF(T); } else a = -1; }
  A_ = a;
  let F = opts.t;
  if (F === undefined) F = clocks() ? SIMC(MAPIN(film).T) : film;
  if (a >= 0 && FSTRIKE !== null) F = FSTRIKE;
  F_ = F; VIS = opts.vis === undefined ? 1 : opts.vis;
  const C = K.C; EYE = C.eye;
  const dE = Math.hypot(EYE[0] - HIT[0], EYE[1] - HIT[1], EYE[2] - HIT[2]);
  if (dE > 140000) return;
  NEAR = opts.near || 6000;
  const scan = opts.scan || null;
  EYEIN = null; for (const s of ST) if ((s.kind === 'plant' || s.kind === 'shed' || s.kind === 'hangar') && Math.abs(EYE[0] - s.x) < s.w / 2 + 2 && Math.abs(EYE[2] - s.z) < s.d / 2 + 2 && EYE[1] < s.y + s.h + 8) EYEIN = s.id;
  // pieces
  let tp = performance.now(); const pf = (k) => { const n = performance.now(); TPROF[k] = (TPROF[k] || 0) + n - tp; tp = n; };
  for (let i = 0; i < PCS.length; i++) {
    const p = PCS[i];
    if (p.parent && a >= 0 && p.parent.vap && a > p.ta + .35) continue;
    if (ORTGT.handOver && (p.kind === 'veh' || p.kind === 'tur') && a >= p.ta) continue;
    const al = pose(p, a); if (al <= 0) continue;
    CUR.alive = a < p.ta ? 1 : 0; CUR.hot = DS.hot > .05 ? 1 + DS.hot : 0;
    setLook(al);
    // the big shells on a sparser lattice (and sparser still round the lens inside a hall)
    DOP.keep = KEEP[p.kind] || 1;
    if (p.sid && p.sid === EYEIN && (p.kind === 'roof' || p.kind === 'wall' || p.kind === 'frame')) { DOP.a *= p.kind === 'frame' ? .5 : .32; DOP.keep = p.kind === 'frame' ? .7 : .34; }
    if (scan) { const sp = (p.c[0] - HIT[0]) * scan.hd[0] + (p.c[2] - HIT[2]) * scan.hd[2], g = scan.s - sp; p.lime = g > 0 ? Math.max(scan.k * Math.exp(-g / 140), scan.hold || 0) : 0; } else p.lime = undefined;
    if (TPROF.on) { const t1 = performance.now(), d0 = L.G.dots; drawPiece(p, p.Tw, al); const k = p.kind; TPROF['ms_' + k] = (TPROF['ms_' + k] || 0) + performance.now() - t1; TPROF['n_' + k] = (TPROF['n_' + k] || 0) + L.G.dots - d0; TPROF['c_' + k] = (TPROF['c_' + k] || 0) + 1; }
    else drawPiece(p, p.Tw, al);
  }
  pf('pieces'); DOP.keep = 1;
  DOP.a = VIS; DOP.col[0] = WH[0]; DOP.col[1] = WH[1]; DOP.col[2] = WH[2]; CUR.alive = a < 0 ? 1 : 0; CUR.hot = 0;
  // the ground's markings and the lights
  if (dE < 30000) { DOP.a = VIS * (a > 0 ? 1 - .5 * sat(a / 2) : 1); L.draw(GND, IDT, DOP); DOP.a = VIS; }
  pf('gnd');
  DOL.a = VIS; L.draw(LMP, IDT, DOL); DOB.a = VIS; L.draw(BCN, IDT, DOB);
  pf('lights');
  if (dE < NEAR) { drawLines(F, a); pf('lines'); drawMovers(F, a); pf('movers'); drawDock(F, a); pf('dock'); }
  drawPlumes(F, a, dE); pf('plumes');
  if (a >= 0) drawFires(a);
}
/* ---- the lines in the plant ---- */
const PARTS_T = [['tFrame', 0, 2], ['tLower', 1, 99], ['tUpper', 2, 99], ['tSkirt', 3, 99]], PARTS_J = [['jFrame', 0, 2], ['jFus', 1, 99], ['jWing', 2, 99], ['jTail', 3, 99], ['jGear', 3, 99], ['jCanopy', 4, 99]];
function lineGone(z) { const w = plw(0, 0, z, P3); const d = Math.hypot(w[0] - HIT[0], w[2] - HIT[2]); return A_ >= 0 && A_ > arriveF(d) + .35 && d < RV; }
function drawLines(F, a) {
  const pd = Math.hypot(EYE[0] - PLX.T[0], EYE[1] - PLX.T[1], EYE[2] - PLX.T[2]); if (pd > 2600) return;
  const ti = lineIdx(F, PT, PMV), ji = lineIdx(F, PTJ, PMJ);
  for (const [ln, N, sp, z0, LI, parts, period, mvD] of [['t', TANK_N, TANK_SP, TANK_Z0, ti, PARTS_T, PT, PMV], ['j', JET_N, JET_SP, JET_Z0, ji, PARTS_J, PTJ, PMJ]]) {
    const cx = ln === 't' ? -LX : LX;
    for (let k = -1; k < N; k++) {
      const z = z0 + (k + LI.mv) * sp; if (z < -200 || z > 196) continue;
      if (lineGone(z)) continue;
      // a piece-like fate for the vehicle on the line (from where it was at the strike)
      const st = k, dw = LI.dw, add = ln === 't' ? TK_ADD : JT_ADD;
      const T = TWv; T.R[0] = 1; T.R[1] = 0; T.R[2] = 0; T.R[3] = 0; T.R[4] = 1; T.R[5] = 0; T.R[6] = 0; T.R[7] = 0; T.R[8] = 1;
      plw(cx, ln === 'j' ? .9 : .25, z, T.T);
      const al = lineFate(T, ln, k, a);
      if (al <= 0) continue;
      const fade = (sA) => st > sA ? 1 : st < sA ? 0 : dw < 0 ? 1 : ss(1.5, period - mvD - 2.5, dw);
      for (const [nm, sA, sB] of parts) {
        let w = fade(sA); if (sB < 99) w *= st < sB ? 1 : st > sB ? 0 : dw < 0 ? 0 : 1 - ss(1.5, period - mvD - 2.5, dw);
        if (w < .01) continue;
        DOP.a = al * VIS * w; CUR.hot = w < .98 && w > .02 ? 1.2 : 0; L.draw(VB[nm], T, DOP);
      }
      CUR.hot = 0;
      if (ln === 't') {
        // the turret: on the crane until it is set down at its station, then on the hull
        const tk = add.turret, set = st > tk || (st === tk && dw >= 0 && dw > 7.8);
        if (set) { TWt.R = T.R; X.ap(T, [0, 1.78, -.4]).forEach((v, i) => TWt.T[i] = v); DOP.a = al * VIS; L.draw(VB.tTurret, TWt, DOP); }
        if (st >= TK_ADD.mark) { /* markings already in the turret */ }
        if (st === TK_ADD.test && a < 0) testGate(cx, z, dw, period - mvD, 5.2);
      } else if (st === JT_ADD.test && a < 0) testGate(cx, z, dw, period - mvD, 7.2);
      DOP.a = VIS;
    }
    // the crane in this bay (turret / wings)
    if (a < 0 || !lineGone(ln === 't' ? z0 + TK_ADD.turret * sp : z0 + JT_ADD.wing * sp)) craneBay(ln, cx, LI, period, mvD, a);
  }
  // the robot arms
  if (a < 0) for (const A of ARMS) arm(A, A.ln === 't' ? ti : ji, A.ln === 't' ? PT - PMV : PTJ - PMJ, F);
}
function lineFate(T, ln, k, a) {
  if (a < 0) return 1;
  const d = Math.hypot(T.T[0] - HIT[0], T.T[2] - HIT[2]), ta = arriveF(d), t = a - ta; if (t < 0) return 1;
  if (ORTGT.handOver) return 0;                     // (from the arrival on the strike tosses it: ORTGT.movers())
  const I = sat(1 - (d - R_I0) / (R_I1 - R_I0)), h1 = hh(k, ln === 't' ? 3 : 5), h2 = hh(k, 9);
  const v0 = (10 + 40 * I) * (.6 + .8 * h1), vy = (4 + 12 * I) * (.5 + h2), tl = Math.max(.3, 2 * vy / 9.81), tau = Math.min(t, tl), s = v0 * (1 - Math.exp(-.7 * tau)) / .7;
  const ux = (T.T[0] - HIT[0]) / d, uz = (T.T[2] - HIT[2]) / d;
  DD[0] = ux * s; DD[2] = uz * s; DD[1] = t < tl ? vy * tau - 4.905 * tau * tau : 0;
  rotAA(V.norm([-uz, 0, ux]), (h2 < .5 ? 1 : -1) * (PI / 2 + h1) * Math.min(1, t / tl), ROT);
  P3b[0] = T.T[0]; P3b[1] = T.T[1] + 1.2; P3b[2] = T.T[2];
  cpX(T, TWd); desX(ROT, P3b, DD, TWd, T);
  DS.sc = Math.min(1, t * 3); DS.hot = Math.max(0, 1 - t / .5) * I; setLook(1);
  return 1;
}
/* the test gate: lime laser fans sweeping the vehicle on the station (the scan's look) */
function testGate(cx, z, dw, dwell, wd) {
  if (dw < 0) return;
  const on = ss(.6, 1.4, dw) * (1 - ss(dwell - 1.6, dwell - .6, dw)); if (on < .02) return;
  const sweep = Math.sin((dw - .6) / (dwell - 1.6) * PI * 3) * (ln => 5.2)(0);
  for (const s of [-1, 1]) for (let q = 0; q < 5; q++) {
    const y = 1.2 + q * 1.8, a0 = plw(cx + s * (wd + .8), y, z, [0, 0, 0]);
    for (let r = 0; r < 7; r++) { const zz = z + sweep + (r - 3) * .9, b = plw(cx - s * .2, .6 + q * .65, zz, [0, 0, 0]); K.lineW(a0[0], a0[1], a0[2], b[0], b[1], b[2], 2.2 * K.S, 1, LIME, .45 * on); }
  }
  const p = plw(cx, 2.4, z + sweep, [0, 0, 0]); K.glowW(p[0], p[1], p[2], 20, LIME, .25 * on);
}
/* a bridge crane in a bay: the turret (tank bay) or the wings (jet bay) carried from the stand and set down */
function craneBay(ln, cx, LI, period, mvD, a) {
  const tk = ln === 't' ? TANK_Z0 + TK_ADD.turret * TANK_SP : JET_Z0 + JT_ADD.wing * JET_SP;
  const dw = LI.dw, dwell = period - mvD;
  // trolley x: from the stand (outboard) to the line and back; hook height
  const xs = ln === 't' ? cx - 21 : cx + 24, H = PLH;
  let tx, hy, carry;
  if (dw < 0) { const m = LI.mv; tx = mix(cx, xs, m); hy = H - 10; carry = false; }
  else {
    const u = dw / dwell;
    if (u < .14) { tx = xs; hy = mix(H - 10, 3.6, kk(u, 0, .14)); carry = false; }
    else if (u < .26) { tx = xs; hy = mix(3.6, H - 11, kk(u, .14, .26)); carry = true; }
    else if (u < .5) { tx = mix(xs, cx, kk(u, .26, .5)); hy = H - 11; carry = true; }
    else if (u < .65) { tx = cx; hy = mix(H - 11, ln === 't' ? 3.4 : 4.9, kk(u, .5, .65)); carry = true; }
    else { tx = cx; hy = mix(ln === 't' ? 3.4 : 4.9, H - 10, kk(u, .72, .95)); carry = u < .7; }
  }
  if (a >= 0) { carry = false; }
  const gz = tk, bayC = cx;
  const G = ln === 't' ? GIRT : GIRJ;
  TWa.R = IDT.R; plw(bayC, H - 6.5, gz, TWa.T); DOP.a = VIS; L.draw(G, TWa, DOP);
  TWb.R = IDT.R; plw(tx, H - 5.2, gz, TWb.T); L.draw(VB.trolley, TWb, DOP);
  TWc.R = IDT.R; plw(tx, hy + 1.2, gz, TWc.T); L.draw(VB.hook, TWc, DOP);
  const p1 = plw(tx - .5, H - 6.2, gz, [0, 0, 0]), p2 = plw(tx - .5, hy + 1.7, gz, [0, 0, 0]); L.lineW(p1, p2, .7, 0, 0, DOP); p1[0] += 1; p2[0] += 1; L.lineW(p1, p2, .7, 0, 0, DOP);
  if (carry) {
    if (ln === 't') { TWd.R = IDT.R; plw(tx, hy - 1.6, gz - .4 + .4, TWd.T); L.draw(VB.tTurret, TWd, DOP); }
    else { TWd.R = IDT.R; plw(tx, hy - 3.6, gz, TWd.T); TWd.T[1] -= 2.15 - .9; L.draw(VB.jWing, TWd, DOP); }
  }
}
let GIRT = null, GIRJ = null;
/* a robot arm: reaching for a seam on the vehicle at its station, welding while it dwells (sparks) */
function arm(A, LI, dwell, F) {
  const work = LI.dw >= 0 ? ss(.8, 1.8, LI.dw) * (1 - ss(dwell - 1.6, dwell - .6, LI.dw)) : 0;
  const cx = A.ln === 't' ? -LX : LX, sz = A.bz;
  const ph = F * (A.ln === 't' ? .9 : .7) + A.ph;
  // the seam: along the vehicle's side, sweeping slowly fore and aft
  const tx = mix(A.bx - A.sd * 1.4, cx + A.sd * (A.ln === 't' ? 2.0 : 2.4 + 1.5 * Math.sin(ph * .5)), work), ty = mix(3.4, A.ln === 't' ? 1.5 + .5 * Math.sin(ph * 1.3) : 2.4 + .3 * Math.sin(ph * 1.3), work), tz = sz + work * 1.6 * Math.sin(ph * .8);
  armIK(A.bx, A.bz, tx, ty, tz, J);
  const B0 = plw(A.bx, 0, A.bz, [0, 0, 0]);
  TWa.R = R.look(J.h, Y_); TWa.T = B0; DOP.a = VIS; L.draw(VB.armBase, TWa, DOP);
  TWb.R = R.look(V.sub(J.e, J.s), Y_); TWb.T = J.s; L.draw(VB.arm1, TWb, DOP);
  TWc.R = R.look(V.sub(J.t, J.e), Y_); TWc.T = J.e; CUR.hot = work > .3 ? 1.6 : 0; L.draw(VB.arm2, TWc, DOP); CUR.hot = 0;
  if (work > .3) sparks(J.t, F, A.ph * 100, work);
}
/* welding sparks: short ballistic streaks from the tip, a flickering glow */
function sparks(p, F, seed, k) {
  const d = Math.hypot(p[0] - EYE[0], p[1] - EYE[1], p[2] - EYE[2]); if (d > 500) return;
  const fl = .6 + .4 * hh(seed, Math.floor(F * 30));
  K.glowW(p[0], p[1], p[2], 34, HOT, .5 * k * fl); K.glowW(p[0], p[1], p[2], 8, [210, 228, 255], k);
  const n = d < 80 ? 60 : 20, s2 = d < 40 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const b = Math.floor(F * 4 + i / n), ag = F * 4 + i / n - b, tau = ag * .55, h1 = hh(seed + i, b), h2 = hh(seed + i * 3, b + 1), h3 = hh(seed + i * 7, b + 2);
    const vx = (h1 - .5) * 9, vy = .5 + 4.5 * h2, vz = (h3 - .5) * 9;
    const x = p[0] + vx * tau, y = p[1] + vy * tau - 4.9 * tau * tau, z = p[2] + vz * tau;
    if (y < PLX.T[1] + .05) continue;
    const wv = Math.max(.3, 1 - ag);
    K.lineW(x, y, z, x - vx * .03, y - (vy - 9.8 * tau) * .03, z - vz * .03, 1.2 * K.S, s2, ag < .35 ? HOT : FIRE, k * wv);
  }
}
/* ---- traffic, the train, the jets ---- */
function drawMovers(F, a) {
  for (const m of MOV) {
    if (m.kind === 'train') { train(m, F, a); continue; }
    if (m.kind === 'taxi') { taxiJet(F, a); continue; }
    if (m.kind === 'takeoff') { takeoff(F, a); continue; }
    if (!moverAt(m, F, TWv)) continue;
    if (Math.hypot(TWv.T[0] - EYE[0], TWv.T[2] - EYE[2]) > NEAR) continue;
    const al = vehFate(TWv, m.kind === 'tank' ? 9 : 5, a, m); if (al <= 0) continue;
    if (m.kind === 'truck') L.draw(VB.truck, TWv, DOP);
    else { L.draw(VB.tLower, TWv, DOP); L.draw(VB.tUpper, TWv, DOP); L.draw(VB.tSkirt, TWv, DOP); TWt.R = TWv.R; X.ap(TWv, [0, 1.78, -.4]).forEach((v, i) => TWt.T[i] = v); L.draw(VB.tTurret, TWt, DOP); }
    DOP.a = VIS; setLookReset();
  }
}
function setLookReset() { DOP.col[0] = WH[0]; DOP.col[1] = WH[1]; DOP.col[2] = WH[2]; DOP.a = VIS; CUR.alive = A_ < 0 ? 1 : 0; }
/* a moving vehicle's fate at the strike (frozen where it was): tossed, tumbling, scorched */
function vehFate(T, ht, a, m) {
  if (a < 0) { setLookReset(); CUR.alive = 1; return 1; }
  const d = Math.hypot(T.T[0] - HIT[0], T.T[2] - HIT[2]), ta = arriveF(d), t = a - ta;
  if (t < 0) { setLookReset(); CUR.alive = 1; return 1; }
  CUR.alive = 0;
  if (ORTGT.handOver) return 0;
  if (d < RV) { if (t > .35) return 0; DS.sc = 0; DS.hot = 1; setLook(1 - t / .35); return 1; }
  const I = sat(1 - (d - R_I0) / (R_I1 - R_I0)), sd = (m && m.s0 || 0) + T.T[0] * 3.1, h1 = hh(sd, 1), h2 = hh(sd, 2);
  const v0 = (8 + 45 * I) * (.6 + .8 * h1), vy = (3 + 16 * I) * (.5 + h2), tl = Math.max(.3, 2 * vy / 9.81), tau = Math.min(t, tl), s = v0 * (1 - Math.exp(-.7 * tau)) / .7;
  const ux = (T.T[0] - HIT[0]) / d, uz = (T.T[2] - HIT[2]) / d;
  DD[0] = ux * s; DD[2] = uz * s; DD[1] = t < tl ? vy * tau - 4.905 * tau * tau : 0;
  rotAA(V.norm([-uz, 0, ux]), (h2 < .5 ? 1 : -1) * (I > .3 ? PI * (h1 < .5 ? .5 : 1) : .4 * I) * Math.min(1, t / tl), ROT);
  P3b[0] = T.T[0]; P3b[1] = T.T[1] + 1.2; P3b[2] = T.T[2];
  cpX(T, TWd); desX(ROT, P3b, DD, TWd, T);
  DS.sc = Math.min(1, t * 3); DS.hot = Math.max(0, 1 - t / .5) * I; setLook(1);
  return 1;
}
function train(m, F, a) {
  const r = m.r, per = m.per, ph = ((F % per) + per) % per, half = per / 2, L_ = r.Ltot - 120;
  const s = 30 + L_ * (ph < half ? kk(ph, 12, half - 12) : 1 - kk(ph, half + 12, per - 12));
  for (let k = 0; k <= TRAIN_N; k++) {
    along(r, s - k * 16.5, OUT); const x = OUT.x, z = OUT.z;
    TWv.R = yawR(OUT.yaw); TWv.T[0] = x; TWv.T[1] = gyF(x, z) + .3; TWv.T[2] = z;
    if (Math.hypot(x - EYE[0], z - EYE[2]) > NEAR) continue;
    const al = vehFate(TWv, 4, a, { s0: k * 31 }); if (al <= 0) continue;
    L.draw(k ? VB.car : VB.loco, TWv, DOP);
    if (k) { const load = k % 2 ? VB.block : VB.tTurret; TWt.R = TWv.R; X.ap(TWv, [0, 1.5, 0]).forEach((v, i) => TWt.T[i] = v); if (k % 2) { TWt.R = R.mul(TWv.R, [.5, 0, 0, 0, .3, 0, 0, 0, .55]); } L.draw(load, TWt, DOP); }
    setLookReset();
  }
}
/* the taxiway: a jet rolls east at 8 m/s, turns, holds; the takeoff: idle, roll (3 m/s^2), rotate, climb at 11 deg */
function taxiJet(F, a) {
  const T_ = STI.taxi, per = 90, ph = ((F % per) + per) % per, x = -620 + 8 * Math.min(ph, 150), z = T_.z;
  TWv.R = yawR(PI / 2); TWv.T[0] = x; TWv.T[1] = gyF(x, z); TWv.T[2] = z;
  if (Math.hypot(x - EYE[0], z - EYE[2]) > NEAR) return;
  if (vehFate(TWv, 4, a, { s0: 77 }) <= 0) return;
  for (const nm of ['jFus', 'jWing', 'jTail', 'jCanopy', 'jGear']) L.draw(VB[nm], TWv, DOP);
  if (a < 0) { const p = X.ap(TWv, [0, 2.3, -9.6]); K.glowW(p[0], p[1], p[2], 8, FIRE, .35); }
  setLookReset();
}
function takeoff(F, a) {
  const R_ = STI.rwy, per = 70, ph = ((F % per) + per) % per, t = ph - 18; if (t > 34) return;
  const x0 = R_.x - R_.w / 2 + 60, z = R_.z;
  let s = 0, y = 0, pitch = 0;
  if (t > 0) { const vr = 82, tr = vr / 3.1; if (t < tr) s = 1.55 * t * t; else { const sr = 1.55 * tr * tr, tt = t - tr; s = sr + vr * tt + 1.2 * tt * tt; pitch = Math.min(.19, tt * .09); y = Math.max(0, (vr * tt) * Math.sin(Math.min(.19, tt * .06)) * Math.min(1, tt / 3)); } }
  const x = x0 + s;
  TWv.R = R.mul(yawR(PI / 2), R.x(-pitch)); TWv.T[0] = x; TWv.T[1] = gyF(x, z) + y; TWv.T[2] = z;
  if (Math.hypot(x - EYE[0], z - EYE[2]) > NEAR * 1.5) return;
  if (vehFate(TWv, 4, a, { s0: 99 }) <= 0) return;
  for (const nm of ['jFus', 'jWing', 'jTail', 'jCanopy']) L.draw(VB[nm], TWv, DOP);
  if (y < 30) L.draw(VB.jGear, TWv, DOP);
  if (a < 0) { const ab = t > 0 ? 1 : .25; for (const sx of [-.55, .55]) { const p = X.ap(TWv, [sx, 2.3, -9.8]), q = X.ap(TWv, [sx, 2.3, -9.8 - 6 * ab]); K.glowW(p[0], p[1], p[2], 14 * ab + 4, FIRE, .7 * ab); K.lineW(p[0], p[1], p[2], q[0], q[1], q[2], 1.5 * K.S, 1, FIRE, .6 * ab, FIRE, .12, .05); } }
  setLookReset();
}
/* the dock's goliath crane (moving along the dock, its trolley across, a hull block on the hook) and the weld flashes */
function drawDock(F, a) {
  const D = DOCK; if (!D) return;
  const s = D.s; if (Math.hypot(s.x - EYE[0], s.z - EYE[2]) > NEAR) return;
  const per = 110, ph = ((F % per) + per) % per, gz = -D.hd + 40 + 200 * (ph < per / 2 ? kk(ph, 8, per / 2 - 8) : 1 - kk(ph, per / 2 + 8, per - 8));
  const tp = ((F % 46) + 46) % 46, tx = -D.GS * .7 + D.GS * 1.4 * (tp < 23 ? kk(tp, 3, 20) : 1 - kk(tp, 26, 43));
  const Tg = TWa; Tg.R = IDT.R; Tg.T = D.wp(0, 0, gz);
  const al = a >= 0 ? pieceLike(Tg, 'crane', a, 60) : 1; if (al <= 0) return;
  L.draw(D.gir, Tg, DOP);
  TWb.R = Tg.R; TWb.T = X.ap(Tg, [tx, D.GH - 4.5, 0]); L.draw(D.gtr, TWb, DOP);
  if (a < 0) {
    const hy = D.GH - 30 - 14 * Math.sin(F * .11), p1 = X.ap(Tg, [tx, D.GH - 6.5, 0]), p2 = X.ap(Tg, [tx, hy + 9, 0]);
    L.lineW(p1, p2, .7, 0, 0, DOP);
    TWc.R = IDT.R; TWc.T = X.ap(Tg, [tx, hy, 0]); L.draw(VB.block, TWc, DOP);
    // weld flashes along the unplated bow frames
    for (let k = 0; k < 5; k++) { const f = .66 + k * .055, zz = D.zOf(f), side = k % 2 ? 1 : -1, yy = 6 + 14 * hh(k, 3), p = D.wp(side * D.half(f, yy), yy, zz); if (hh(k, Math.floor(F * 3)) < .55) sparks(p, F, 500 + k * 37, .8); }
  }
  setLookReset();
}
function pieceLike(T, kind, a, h) {
  const d = Math.hypot(T.T[0] - HIT[0], T.T[2] - HIT[2]), ta = arriveF(d), t = a - ta; if (t < 0) return 1;
  const I = sat(1 - (d - R_I0) / (R_I1 - R_I0)), q = sat(t / 3.2);
  const ux = (T.T[0] - HIT[0]) / d, uz = (T.T[2] - HIT[2]) / d;
  rotAA(V.norm([-uz, 0, ux]), (I > .3 ? 1.35 : .4 * I) * q * q, ROT); DD[0] = ux * 8 * I * q; DD[1] = 0; DD[2] = uz * 8 * I * q;
  cpX(T, TWd); T.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; desX(ROT, TWd.T, DD, TWd, T);
  DS.sc = Math.min(1, t * 3); DS.hot = Math.max(0, 1 - t / .5) * I; setLook(1);
  return 1;
}
/* vapour plumes off the cooling towers and the stack (before the strike) */
function drawPlumes(F, a, dE) {
  if (dE > 60000) return;
  const k0 = a < 0 ? 1 : Math.max(0, 1 - a / 1.5);
  if (k0 <= 0) return;
  for (const id of ['cool1', 'cool2', 'stack']) {
    const s = STI[id]; if (!s.plume) continue;
    const n = id === 'stack' ? 160 : 520, R0 = s.pr;
    for (let i = 0; i < n; i++) {
      const h1 = hh(i, 11 + s.x), h2 = hh(i, 13), h3 = hh(i, 17), ph = ((F * (.05 + .03 * h3) + h1) % 1), rise = ph * (id === 'stack' ? 90 : 160), sp = R0 * (.7 + .9 * ph) + 6 * ph;
      const th = h2 * TAU + F * .05, x = s.plume[0] + Math.cos(th) * sp * Math.sqrt(h3) + 26 * ph * ph, z = s.plume[2] + Math.sin(th) * sp * Math.sqrt(h3) + 10 * ph * ph, y = s.plume[1] + rise;
      K.dotW(x, y, z, 1, WH, k0 * VIS * .32 * (1 - ph) * (.5 + .5 * h3));
    }
  }
}
/* fires in the wreckage: wrecked vehicles burning, some roofs smouldering */
function drawFires(a) {
  const fr = Math.floor(FT_ * 24);
  for (const p of PCS) {
    if (!p.fire) continue; const t = a - p.ta; if (t < .5 || t > 140 || p.vap) continue;
    const q = p.Tw; const x = q.T[0] + (p.c[0] - p.Tb.T[0]), y = (p.mode === 'throw' && t > p.tl ? p.yl : q.T[1] + (p.c[1] - p.Tb.T[1])), z = q.T[2] + (p.c[2] - p.Tb.T[2]);
    if (Math.hypot(x - EYE[0], z - EYE[2]) > 9000) continue;
    const g = ss(.5, 1.5, t) * (1 - ss(90, 140, t)) * VIS, fl = .6 + .4 * hh(p.h1 * 100, fr);
    K.glowW(x, y + 1, z, Math.round(10 + p.sz * .8), FIRE, .45 * g * fl);
    for (let i = 0; i < 16; i++) { const h1 = hh(p.h2 * 50 + i, 1), h2 = hh(p.h3 * 50 + i, 2), life = .5 + .6 * h2, ph = ((FT_ * 1.4 + h1 * 7) % life) / life; K.dotW(x + (h1 - .5) * p.sz * .4 * (1 - ph), y + ph * (3 + 4 * h2), z + (h2 - .5) * p.sz * .4 * (1 - ph), 1, ph < .35 ? HOT : ph < .7 ? FIRE : EMB, g * (1 - ph) * .9); }
  }
}

/* =====================================================================================================
   THE PUBLIC FACE
   ===================================================================================================== */
function sites() {
  return ST.map(s => ({ id: s.id, x: s.x, z: s.z, w: s.w, d: s.d, h: s.kind === 'cool' ? s.h : s.kind === 'radome' ? s.h : s.h, yaw: s.yaw, kind: KIND[s.kind] || 'hall', y: BUILT ? s.y : undefined }));
}
const clear = (x, z) => x > clearRect.x0 && x < clearRect.x1 && z > clearRect.z0 && z < clearRect.z1;
function emitters() {
  if (!BUILT) return [];
  if (EMIT) return EMIT;
  const out = [];
  for (const p of PCS) {
    if (p.vap || p.mode === 'stand' || p.kind === 'floor') continue;
    const r = restOf(p); out.push({ p: r, r: p.sz, kind: p.fire ? 'fire' : p.kind === 'roof' || p.kind === 'wall' ? 'dust' : 'smoke', aH: p.ta, I: p.I });
  }
  return (EMIT = out);
}
let EMIT = null;
function vehicles() {
  if (!BUILT) return [];
  const out = VEH.map(v => ({ p: v.p.c.slice(), kind: v.kind, aH: v.p.ta, I: v.p.I, fire: !!v.p.fire }));
  if (clocks()) {
    for (const m of MOV) if ((m.kind === 'truck' || m.kind === 'tank') && moverAt(m, FSTRIKE, TWv)) { const d = Math.hypot(TWv.T[0] - HIT[0], TWv.T[2] - HIT[2]); out.push({ p: TWv.T.slice(), kind: m.kind, aH: arriveF(d), I: sat(1 - (d - R_I0) / (R_I1 - R_I0)), fire: true }); }
  }
  return out;
}
/* ---- the movers for the strike's tossing (FX: ORTGT.movers() -> [{ parts: [{ ml }], W }]): every vehicle where it
   was at the impact, its parts as LOD point clouds sampled off the lattice bodies (in the vehicle's frame) ---- */
const LODS = [.07, .14, .28, .56, 1.12], MLC = {};
function bodyPts(B, Tf, sp, out) {
  const push = (p, n) => { const q = Tf ? X.ap(Tf, p) : p, m = n ? (Tf ? X.dir(Tf, n) : n) : [0, 0, 0]; out.push(q[0], q[1], q[2], m[0], m[1], m[2]); };
  const Ln = B.L; for (let j = 0; j < Ln.length; j += 10) { const a = [Ln[j], Ln[j + 1], Ln[j + 2]], b = [Ln[j + 3], Ln[j + 4], Ln[j + 5]], n = Math.max(1, Math.ceil(V.dist(a, b) / sp)); for (let i = 0; i <= n; i++) push(V.lerp(a, b, i / n)); }
  const T = B.T; for (let j = 0; j < T.length; j += 10) { const a = [T[j], T[j + 1], T[j + 2]], b = [T[j + 3], T[j + 4], T[j + 5]], r = T[j + 6], d = V.sub(b, a), Lt = V.len(d), [U, W_] = L.perp(V.norm(d)), n = Math.max(1, Math.ceil(Lt / sp)), m = Math.max(4, Math.ceil(TAU * r / sp)); for (let i = 0; i <= n; i++) for (let k = 0; k < m; k++) { const t = k / m * TAU, rn = V.add(V.mul(U, Math.cos(t)), V.mul(W_, Math.sin(t))); push(V.add(V.mad(a, d, i / n), V.mul(rn, r)), rn); } }
  const P = B.P; for (let j = 0; j < P.length; j += 23) {
    const o = [P[j], P[j + 1], P[j + 2]], du = [P[j + 3], P[j + 4], P[j + 5]], dv = [P[j + 6], P[j + 7], P[j + 8]], nu = P[j + 9], nv = P[j + 10], n = [P[j + 11], P[j + 12], P[j + 13]], two = P[j + 15], lu = P[j + 18], lv = P[j + 19], w = [P[j + 20], P[j + 21], P[j + 22]];
    const ds = Math.min(nu, sp / lu), dt = Math.min(nv, sp / lv);
    for (let t = 0; t <= nv + 1e-6; t += dt) for (let s = 0; s <= nu + 1e-6; s += ds) push([o[0] + du[0] * s + dv[0] * t + w[0] * s * t, o[1] + du[1] * s + dv[1] * t + w[1] * s * t, o[2] + du[2] * s + dv[2] * t + w[2] * s * t], two ? null : n);
  }
  for (const Y of B.Y) for (const b of Y.bands) { const n = Math.max(1, Math.ceil(Math.hypot(b.s1 - b.s0, b.r1 - b.r0) / sp)); for (let i = 0; i <= n; i++) { const f = i / n, s = b.s0 + (b.s1 - b.s0) * f, r = b.r0 + (b.r1 - b.r0) * f, m = Math.max(4, Math.ceil(TAU * r / sp)), c = V.mad(Y.a, Y.d, s); for (let k = 0; k < m; k++) { const t = k / m * TAU, rn = V.add(V.mul(Y.U, Math.cos(t)), V.mul(Y.W, Math.sin(t))); push(V.add(c, V.mul(rn, r)), V.norm(V.add(V.mul(rn, b.kr !== undefined ? b.kr : 1), V.mul(Y.d, b.ka || 0)))); } } }
  const Rg = B.Rg; for (let j = 0; j < Rg.length; j += 14) { const c = [Rg[j], Rg[j + 1], Rg[j + 2]], U = [Rg[j + 3], Rg[j + 4], Rg[j + 5]], W_ = [Rg[j + 6], Rg[j + 7], Rg[j + 8]], r = Rg[j + 9], m = Math.max(6, Math.ceil(TAU * r / sp)); for (let k = 0; k < m; k++) { const t = k / m * TAU; push(V.add(c, V.add(V.mul(U, Math.cos(t) * r), V.mul(W_, Math.sin(t) * r)))); } }
}
/* one LOD cloud for a list of [body name, offset transform or null] */
function cloudOf(key, list) {
  if (MLC[key]) return MLC[key];
  const lv = LODS.map(sp => { const o = []; for (const [nm, Tf] of list) bodyPts(VB[nm], Tf, sp, o); return { sp, pts: new Float32Array(o) }; });
  return (MLC[key] = K.lodCloud(lv, 1.6));
}
const TURX = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 1.78, -.4] };
const tankParts = (lv) => { const P = []; if (lv >= 1) P.push({ ml: cloudOf('tl', [['tLower', null]]) }); else P.push({ ml: cloudOf('tf', [['tFrame', null]]) }); if (lv >= 2) P.push({ ml: cloudOf('tu', [['tUpper', null]]) }); if (lv >= 3) P.push({ ml: cloudOf('ts', [['tSkirt', null]]) }); if (lv >= 4) P.push({ ml: cloudOf('tt', [['tTurret', TURX]]) }); return P; };
const jetParts = (lv) => { const P = []; if (lv >= 1) P.push({ ml: cloudOf('jf', [['jFus', null]]) }); else P.push({ ml: cloudOf('jfr', [['jFrame', null]]) }); if (lv >= 2) P.push({ ml: cloudOf('jw', [['jWing', null]]) }); if (lv >= 3) P.push({ ml: cloudOf('jt', [['jTail', null], ['jGear', null]]) }); if (lv >= 4) P.push({ ml: cloudOf('jc', [['jCanopy', null]]) }); return P; };
let MOVERS = null;
function movers() {
  if (!BUILT) return [];
  if (MOVERS) return MOVERS;
  const out = [], cp = T => ({ R: T.R.slice(), T: T.T.slice() });
  for (const v of VEH) out.push({ parts: v.kind === 'tank' ? tankParts(9) : jetParts(9), W: cp(v.p.Tb), kind: v.kind });
  const ok = clocks(), F = ok ? FSTRIKE : 0;
  if (ok) {
    for (const m of MOV) {
      if ((m.kind === 'truck' || m.kind === 'tank') && moverAt(m, F, TWv)) out.push({ parts: m.kind === 'truck' ? [{ ml: cloudOf('tr', [['truck', null]]) }] : tankParts(9), W: cp(TWv), kind: m.kind });
    }
    // the lines, as they stood
    for (const [ln, N, sp, z0, LI] of [['t', TANK_N, TANK_SP, TANK_Z0, lineIdx(F, PT, PMV)], ['j', JET_N, JET_SP, JET_Z0, lineIdx(F, PTJ, PMJ)]]) for (let k = 0; k < N; k++) {
      const z = z0 + (k + LI.mv) * sp; if (z < -200 || z > 196) continue;
      const T = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: plw(ln === 't' ? -LX : LX, ln === 'j' ? .9 : .25, z) };
      out.push({ parts: ln === 't' ? tankParts(Math.min(4, k)) : jetParts(Math.min(4, k)), W: T, kind: ln === 't' ? 'tank' : 'jet', line: 1 });
    }
  }
  if (ok) MOVERS = out;
  return out;
}
window.ORTGT = { sites, clear, build, draw, emitters, vehicles, movers, auto: true, handOver: true, bounds: null, POI: null,
  setStrike(a, shockR, hit) { STR.a = a; STR.R = shockR; STR.hit = hit; STR.ft = window.FILM ? FILM.T : 0; },
  prof: TPROF, dbg: () => ({ PCS, MOV, ST, STI, LAMPS, BEACS, DOCK, PLX, A: A_, F: F_, HIT, RV }) };

/* =====================================================================================================
   THE VISIT (window.ORVISIT): orbit -> clouds -> the coast -> into the plant -> up -> the targeting -> back to orbit
   ===================================================================================================== */
const VD = { ft: -1, t: 0, scan: null };     // (the visit's frame: the hooked base pass draws the facility on its clock, with the sweep)
const LEN = 44.4;
const B_ = { turn: [0, 6.6], desc: [1.8, 11.6], hold: [11.6, 13.2], dive: [13.2, 16.0], hall: [16.0, 26.4], rise: [26.4, 30.2], scan: [30.6, 33.6], cls: [31.8, 36.6], lock: [34.6, 36.4], back: [36.6, 42.6], bl: [36.6, 44.4] };
let VC = null, CXT = null;
const upV = p => V.norm([p[0], p[1] + 6371000, p[2]]);
const qOf = (f, up) => K.Q.fromR(R.look(f, up));
function basisOf(s) { const f = V.norm(V.sub(s.target, s.eye)), r0 = V.norm(V.cross(Y_, f)), u0 = V.cross(f, r0), c = Math.cos(s.roll || 0), sn = Math.sin(s.roll || 0); return { eye: s.eye.slice(), f, up: V.sub(V.mul(u0, c), V.mul(r0, sn)), fov: s.fov, d: V.dist(s.eye, s.target) }; }
function shotOf(b) { let f = b.f; if (Math.abs(f[1]) > .999999) f = V.norm([f[0] + 1e-5, f[1], f[2] + 1e-5]); const r0 = V.norm(V.cross(Y_, f)), u0 = V.cross(f, r0); let up = V.sub(b.up, V.mul(f, V.dot(f, b.up))); up = V.len(up) < 1e-6 ? u0 : V.norm(up); return { eye: b.eye, target: V.mad(b.eye, f, b.d), fov: b.fov, roll: Math.atan2(-V.dot(up, r0), V.dot(up, u0)) }; }
function slerpV(a, b, t) { const d = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(d); if (th < 1e-6) return b.slice(); const s = Math.sin(th); return V.norm(V.add(V.mul(a, Math.sin((1 - t) * th) / s), V.mul(b, Math.sin(t * th) / s))); }
/* Hermite through keys {u, e (eye), g (look point), fov}, at rest at the ends and at keys marked stop */
function KP(keys) {
  const n = keys.length, tan = (i, f) => { if (i === 0 || i === n - 1 || keys[i].stop) return f === 'fov' ? 0 : [0, 0, 0]; const a = keys[i - 1], b = keys[i + 1], dt = b.u - a.u; return f === 'fov' ? (b.fov - a.fov) / dt : V.mul(V.sub(b[f], a[f]), 1 / dt); };
  const M = keys.map((k, i) => ({ e: tan(i, 'e'), g: tan(i, 'g'), fov: tan(i, 'fov') }));
  const H = (p0, p1, m0, m1, t, dt) => { const t2 = t * t, t3 = t2 * t; return p0 * (2 * t3 - 3 * t2 + 1) + m0 * dt * (t3 - 2 * t2 + t) + p1 * (-2 * t3 + 3 * t2) + m1 * dt * (t3 - t2); };
  return u => { let i = 0; while (i < n - 2 && keys[i + 1].u <= u) i++; const a = keys[i], b = keys[i + 1], dt = b.u - a.u, t = E.clamp((u - a.u) / dt, 0, 1);
    const v3 = f => [0, 1, 2].map(c => H(a[f][c], b[f][c], M[i][f][c], M[i + 1][f][c], t, dt)); return { e: v3('e'), g: v3('g'), fov: H(a.fov, b.fov, M[i].fov, M[i + 1].fov, t, dt) }; };
}
function setupCam(ctx) {
  const old = ctx.camOld, at = ORVISIT.at0;
  const b0 = basisOf(old), b1 = basisOf(ctx.camAt && at !== undefined ? ctx.camAt(at + .05) : old);
  const ctr = HIT.slice(), E0 = b0.eye, v0 = V.sub(E0, ctr), D0 = V.len(v0), dir0 = V.mul(v0, 1 / D0);
  const P_ = STI.plant, door = [P_.x, P_.y, P_.z - PLD / 2];
  const site = (x, y, z) => [x, y, z];
  // the hold over the sea (SSW of the plant, 300 m up): the descent's end
  const ER = site(door[0] - 330, door[1] + 290, door[2] - 640), LR = site(-30, P_.y + 10, 20);
  const dirR = V.norm(V.sub(ER, ctr)), DR = V.dist(ER, ctr);
  // the near path (world): the hold, the dive to the door, the aisle, the rise, the targeting's slow orbit
  const y0 = P_.y;
  const orb = (az, el, D) => { const h = [Math.sin(az), 0, Math.cos(az)]; return [ctr[0] - h[0] * Math.cos(el) * D, ctr[1] + Math.sin(el) * D, ctr[2] - h[2] * Math.cos(el) * D]; };
  const NK = KP([
    { u: B_.hold[0], e: ER, g: LR, fov: 40, stop: 1 },
    { u: B_.hold[1], e: V.lerp(ER, [door[0] - 60, y0 + 120, door[2] - 300], .3), g: V.lerp(LR, [door[0], y0 + 8, door[2] + 40], .5), fov: 42 },
    { u: 15.0, e: [door[0] - 4, y0 + 24, door[2] - 160], g: [door[0] - 16, y0 + 3, door[2] + 50], fov: 50 },
    { u: B_.dive[1], e: [door[0] - 2, y0 + 10, door[2] - 30], g: [door[0] - 24, y0 - 2, door[2] + 80], fov: 54 },
    { u: 18.4, e: [door[0] - 27, y0 + 8.5, door[2] + 22], g: [door[0] - 44, y0 - 3.5, door[2] + 100], fov: 54 },
    { u: 21.2, e: [door[0] - 26, y0 + 9, door[2] + 68], g: [door[0] - 42, y0 - 1.5, door[2] + 112], fov: 54 },
    { u: 23.8, e: [door[0] + 10, y0 + 10, door[2] + 96], g: [door[0] + 40, y0 - 3, door[2] + 140], fov: 54 },
    { u: B_.hall[1], e: [door[0] + 22, y0 + 11, door[2] + 140], g: [door[0] + 50, y0 - 6, door[2] + 240], fov: 54, stop: 1 },
    { u: 28.2, e: [door[0] + 4, y0 + 110, door[2] + 40], g: [door[0] + 30, y0, door[2] + 330], fov: 52 },
    { u: B_.rise[1], e: orb(.42, .7, 1300), g: [ctr[0] - 20, ctr[1] + 10, ctr[2] - 120], fov: 50 },
    { u: 33.6, e: orb(.56, .78, 1500), g: [ctr[0], ctr[1] + 10, ctr[2] - 250], fov: 52 },
    { u: B_.back[0], e: orb(.7, .8, 1560), g: [ctr[0], ctr[1] + 10, ctr[2] - 270], fov: 52 },
  ]);
  const EB = NK(B_.back[0]).e, GB = NK(B_.back[0]).g, dirB = V.norm(V.sub(EB, ctr)), DB = V.dist(EB, ctr);
  const LDB = logKeys([[B_.back[0], Math.log(DB)], [38.2, Math.log(4000)], [39.8, Math.log(40000)], [B_.back[1], Math.log(D0)]]);
  // the descent's log distance: fast from orbit, slow through the cloud layer (7 -> 2 km), easing into the hold
  const LD = logKeys([[B_.desc[0], Math.log(D0)], [4.8, Math.log(50000)], [7.2, Math.log(6000)], [9.8, Math.log(2000)], [B_.desc[1], Math.log(DR)]]);
  VC = { LD, LDB, b0, b1, SPL: { v: V.mul(V.sub(b1.eye, b0.eye), 20), w: V.mul(V.sub(b1.f, b0.f), 20) }, ctr, E0, D0, dir0, ER, LR, dirR, DR, NK, EB, GB, dirB, DB, door };
  cloudsB();
}
/* a Hermite through [u, ln D] keys (at rest at the ends): km-scale moves in log distance */
function logKeys(LK) {
  const n = LK.length, m = j => j === 0 || j === n - 1 ? 0 : (LK[j + 1][1] - LK[j - 1][1]) / (LK[j + 1][0] - LK[j - 1][0]);
  return u => { if (u <= LK[0][0]) return LK[0][1]; if (u >= LK[n - 1][0]) return LK[n - 1][1]; let i = 0; while (u > LK[i + 1][0]) i++;
    const a = LK[i], b = LK[i + 1], dt = b[0] - a[0], t = (u - a[0]) / dt, t2 = t * t, t3 = t2 * t;
    return a[1] * (2 * t3 - 3 * t2 + 1) + m(i) * dt * (t3 - 2 * t2 + t) + b[1] * (-2 * t3 + 3 * t2) + m(i + 1) * dt * (t3 - t2); };
}
const TAUX = .9;
function baseCarry(t) {
  const k = t >= 0 ? TAUX * (1 - Math.exp(-t / TAUX)) : -TAUX * (1 - Math.exp(t / TAUX)), b = VC.b0;
  return { eye: V.add(b.eye, V.mul(VC.SPL.v, k)), f: V.norm(V.add(b.f, V.mul(VC.SPL.w, k))), up: b.up, fov: b.fov, d: b.d };
}
/* the path without the splices: {eye, f, up, fov, d} */
function pathAt(u) {
  const C = VC;
  if (u < B_.hold[0]) {
    // the descent: direction and log distance eased from the platform to the hold over the sea
    const s = sat((u - B_.desc[0]) / (B_.desc[1] - B_.desc[0])), e1 = sm5(s);
    const dir = slerpV(C.dir0, C.dirR, e1), D = Math.exp(C.LD(u));
    const eye = V.mad(C.ctr, dir, D), g = V.lerp(C.ctr, C.LR, e1), f = V.norm(V.sub(g, eye));
    return { eye, f, up: upV(eye), fov: (34 + 6 * e1) * DEG, d: V.dist(eye, g) };
  }
  if (u < B_.back[0]) { const k = C.NK(u), f = V.norm(V.sub(k.g, k.e)); return { eye: k.e, f, up: upV(k.e), fov: k.fov * DEG, d: V.dist(k.e, k.g) }; }
  // back up to the platform: the reverse of the descent
  const s = sat((u - B_.back[0]) / (B_.back[1] - B_.back[0])), e1 = sm5(s);
  const dir = slerpV(C.dirB, C.dir0, e1), D = Math.exp(C.LDB(u));
  const eye = V.mad(C.ctr, dir, D), g = V.lerp(C.GB, C.ctr, sm5(s * 2)), f = V.norm(V.sub(g, eye));
  return { eye, f, up: upV(eye), fov: (50 - 16 * e1) * DEG, d: V.dist(eye, g) };
}
function blendO(A, B, w, wp) {
  const M = K.Q.toR(K.Q.slerp(qOf(A.f, A.up), qOf(B.f, B.up), w));
  return { eye: V.lerp(A.eye, B.eye, wp === undefined ? w : wp), f: [M[2], M[5], M[8]], up: [M[1], M[4], M[7]], fov: A.fov + (B.fov - A.fov) * w, d: Math.exp(Math.log(A.d) + (Math.log(B.d) - Math.log(A.d)) * w) };
}
const VCAM = QS.get('vcam') ? QS.get('vcam').split(',').map(Number) : null;
let FRAME = 0;
function vcam(u, ctx) {
  FRAME++;
  CXT = ctx;
  if (!BUILT) build(ctx);
  if (!VC) setupCam(ctx);
  if (VCAM) return { eye: VCAM.slice(0, 3), target: VCAM.slice(3, 6), fov: (VCAM[6] || 50) * DEG, roll: 0 };
  VD.ft = window.FILM ? FILM.T : 0; VD.t = (clocks() ? SIMC(ctx.Tb) : 0) + u;
  SW.hd = V.norm([-VC.dir0[0], 0, -VC.dir0[2]]); SW.s = u < B_.scan[0] ? -1e9 : sweepS(u); SW.k = 1.1; SW.hold = u > B_.scan[0] ? .12 * (1 - ss(B_.lock[1], B_.back[0], u)) : 0;
  VD.scan = u > B_.scan[0] - .2 && u < B_.back[0] + 2 ? SW : null;
  let s = pathAt(u);
  if (u < B_.turn[1]) s = blendO(baseCarry(u), s, sm5(u / B_.turn[1]), sm5(u / B_.turn[1] * 1.35));
  if (u > B_.bl[0]) { const w = sm5((u - B_.bl[0]) / (B_.bl[1] - B_.bl[0])); s = blendO(s, baseCarry(u - LEN), w, sm5((u - B_.back[1]) / (LEN - B_.back[1]))); }
  return shotOf(s);
}

/* ---- the cloud layer the descent passes through (2.6 - 4.4 km up, round where the path crosses it) ---- */
let CLD = null, CLDN = 0;
function cloudsB() {
  // where the descent crosses 3.5 km
  let uc = B_.desc[0]; for (let u = B_.desc[0]; u < B_.hold[0]; u += .02) { const e = pathAt(u).eye; if (e[1] < 3500) { uc = u; break; } }
  const ec = pathAt(uc).eye, cxz = [ec[0], ec[2]];
  // cumulus: flat-bottomed puffs scattered round the crossing (clear over the base), three on the path itself
  const r = rng(4242), BL = [];
  // puffs strung along the path while it is 2.5 - 5 km up, set a little to either side (the lens grazes and pierces them)
  let NP = 0;
  for (let u = B_.desc[0]; u < B_.hold[0]; u += .12) { const e = pathAt(u).eye; if (e[1] < 2500 || e[1] > 5200) continue; const sd = (NP % 2 ? 1 : -1) * (120 + 260 * r()); BL.push([e[0] + sd, e[1] - 250 + 200 * r(), e[2] - sd * .5, 380 + 260 * r()]); NP++; }
  while (BL.length < 70) { const x = cxz[0] + (r() - .5) * 18000, z = cxz[1] + (r() - .5) * 18000; if (Math.hypot(x - HIT[0], z - HIT[2]) < 3500) continue; BL.push([x, 3000 + 900 * r(), z, 400 + 900 * r()]); }
  const N = 150000, A = new Float32Array(N * 4); let n = 0;
  for (let bi = 0; bi < BL.length; bi++) {
    const [bx, by, bz, br] = BL[bi], m = bi < NP ? Math.round(60000 / Math.max(1, NP)) : 600;
    for (let i = 0; i < m && n < N; i++) {
      // a few sub-puffs per blob, gaussian round each
      const k = Math.floor(r() * 5), ox = (hh(bx + k, 1) - .5) * br * 1.4, oz = (hh(bz + k, 2) - .5) * br * 1.4, oy = hh(by + k, 3) * br * .5, rr = br * (.45 + .3 * hh(bx, k));
      const g = () => (r() + r() + r() - 1.5) * .9;
      const x = bx + ox + g() * rr, y = by + oy + Math.abs(g()) * rr * .7 - rr * .15, z = bz + oz + g() * rr;
      if (y < by - rr * .25) continue;
      A[n * 4] = x; A[n * 4 + 1] = y; A[n * 4 + 2] = z; A[n * 4 + 3] = .35 + .65 * sat((y - by + rr * .25) / (rr * 1.2)); n++;
    }
  }
  CLD = A; CLDN = n;
}
function drawClouds(u) {
  const vis = ss(5.0, 6.5, u) * (1 - ss(9.6, 10.6, u)); if (vis < .01 || !CLD) return;
  const C = K.C, e = C.eye;
  for (let i = 0; i < CLDN; i++) {
    const o = i * 4, x = CLD[o], y = CLD[o + 1], z = CLD[o + 2], d = Math.hypot(x - e[0], y - e[1], z - e[2]);
    if (d < 25) continue;
    const a = vis * .85 * CLD[o + 3] * ss(25, 220, d) * (1 - ss(9000, 18000, d));
    if (a < .01) continue;
    if (d < 900) K.addW(x, y, z, Math.max(2, Math.min(14, Math.round(2400 / d))), WH, a * .05);
    K.dotW(x, y, z, d < 1500 ? 2 : 1, WH, a);
  }
}

/* ---- the targeting: the sweep, the boxes, the lock ---- */
const TGS = () => ST.filter(s => s.tg);
let TGL = null;
function tgList() {
  if (TGL) return TGL;
  const hd = VC ? V.norm([-VC.dir0[0], 0, -VC.dir0[2]]) : [0, 0, 1];
  TGL = TGS().map(s => {
    let mn, mx;
    if (s.id === 'hg3') { mn = [-620, s.y, 528]; mx = [740, s.y + 22, 830]; }
    else if (s.id === 'cool1') { mn = [425, s.y, -140]; mx = [700, s.y + 110, 70]; }
    else if (s.id === 'dock') { mn = [s.x - 60, 0, -875]; mx = [s.x + 60, 80, -340]; }
    else if (s.id === 'cmd') { mn = [s.x - 60, s.y, s.z - 22]; mx = [s.x + 36, s.y + 62, s.z + 22]; }
    else if (s.id === 'fuel0') { mn = [-630, s.y, -153]; mx = [-560, s.y + 20, -84]; }
    else { const hs = s.kind === 'radome' ? s.h : s.kind === 'park' ? 4 : s.h + 5; mn = [s.x - s.w / 2, s.y, s.z - s.d / 2]; mx = [s.x + s.w / 2, s.y + hs, s.z + s.d / 2]; }
    const c = V.mul(V.add(mn, mx), .5), sp = (c[0] - HIT[0]) * hd[0] + (c[2] - HIT[2]) * hd[2];
    return { s, mn, mx, c, sp, tg: null };
  }).sort((a, b) => a.sp - b.sp);
  return TGL;
}
const SW = { s: -1e9, hd: [0, 0, 1], k: 1, hold: 0 };
const sweepS = u => mix(-1000, 1100, sat((u - B_.scan[0]) / (B_.scan[1] - B_.scan[0])));
function drawSweep(u) {
  if (u < B_.scan[0] - .2 || u > B_.scan[1] + .6) return;
  const s = sweepS(u), hd = SW.hd, vx = -hd[2], vz = hd[0], fade = 1 - ss(B_.scan[1], B_.scan[1] + .6, u);
  // the front: a lime line across the ground with a jagged crest, two fainter echoes behind, sparks of lime on the ground
  for (let k = 0; k < 3; k++) {
    const sk = s - k * 26, al = fade * (k ? .35 / k : 1);
    for (let i = -110; i <= 110; i++) {
      const l = i * 9, j = (hh(i, Math.floor(u * 20) + k) - .5) * 5, x = HIT[0] + hd[0] * (sk + j) + vx * l, z = HIT[2] + hd[2] * (sk + j) + vz * l;
      if (!clear(x, z) && Math.abs(l) > 820) continue;
      const y = gyF(x, z) + .8;
      K.dotW(x, y, z, k ? 1 : 2, LIME, al * .9);
      if (!k && i % 3 === 0) K.dotW(x, y + 3 + 6 * hh(i, Math.floor(u * 30)), z, 1, LIME, al * .5);
    }
  }
  // the lit band behind the front: a lattice of lime ground dots fading
  for (let r = 1; r < 30; r++) {
    const sk = s - r * 14, al = fade * .45 * Math.exp(-r / 7); if (al < .02) break;
    for (let i = -60; i <= 60; i++) { const l = i * 16 + (r % 2) * 8, x = HIT[0] + hd[0] * sk + vx * l, z = HIT[2] + hd[2] * sk + vz * l; if (!clear(x, z)) continue; K.dotW(x, gyF(x, z) + .5, z, 1, LIME, al); }
  }
}
const TGP = {};
const tgOf = k => TGP[k] || (TGP[k] = K.mkTag());
function cTag(key, lab, val, p, a, age, side, lift) {
  if (a < .01 || !K.pj(p[0], p[1], p[2])) return;
  const S = K.S, sx = K.PJ[0], sy = K.PJ[1]; if (sx < -100 * S || sx > K.BW + 100 * S || sy < -100 * S || sy > K.BH + 100 * S) return;
  const tg = tgOf(key), w = K.tagW(tg);
  let s = side || (sx > 1100 * S ? -1 : 1); if (s > 0 && sx / S + 58 + w > 1880) s = -1; else if (s < 0 && sx / S - 58 - w < 40) s = 1;
  const dx = 54 * s * S, lx = sx + dx, ly = sy - 50 * S - (lift || 0) * S;
  K.leader(sx, sy, lx, ly, '#FF6A3D', .8 * a); K.dot(sx, sy, Math.round(3 * S), CORAL[0], CORAL[1], CORAL[2], a);
  K.setTag(tg, '', K.decode(lab, sat(age / .6), FT_, key.length), val, 'coral sm', dx > 0 ? lx + 4 * S : lx - 4 * S - w * S, ly - 12 * S, a);
}
function boxTag(key, lab, val, mn, mx, a, age, col) {
  if (a < .01) return;
  const b = K.boxOf(mn, mx, IDT, 6 * K.S); if (!b) return;
  if (b[2] < 0 || b[0] > K.BW || b[3] < 0 || b[1] > 800 * K.S) return;          // (clear of the menu)
  K.bracket(b, col || '#FF6A3D', .85 * a, 10, 1.3);
  const tg = tgOf('bx' + key);
  K.setTag(tg, '', K.decode(lab, sat(age / .6), FT_, key.length), val, 'coral sm', b[2] + 6 * K.S, b[1] - 2 * K.S, a);
}
const tw = (u, a, b) => sat((u - a) / .25) * (1 - sat((u - b + .3) / .3));
function tags(u, ctx) {
  if (!VC) return;
  FT_ = window.FILM ? FILM.T : 0;
  // inside the plant
  const P_ = STI.plant;
  if (u > B_.dive[1] - .6 && u < B_.hall[1] + .4) {
    const w0 = B_.dive[1] - .4;
    cTag('tl', 'TANK LINE · 14 STATIONS', `${PT} S / STATION`, plw(-LX, 5.5, TANK_Z0 + 3 * TANK_SP), tw(u, w0 + .3, 22.6), u - w0 - .3, -1);
    cTag('jl', 'JET LINE · 12 STATIONS', 'DELTA WING', plw(LX, 7.2, JET_Z0 + 3 * JET_SP), tw(u, 22.4, B_.hall[1]), u - 22.4, 1);
    cTag('cr', 'TURRET · CRANE 60 T', '', plw(-LX - 6, PLH - 6, TANK_Z0 + TK_ADD.turret * TANK_SP), tw(u, 20.4, 23.6), u - 20.4, -1, 30);
    cTag('wr', 'WELD ROBOTS · 6 AXES', '', plw(-LX + 5.6, 4.5, TANK_Z0 + TANK_SP + 2.6), tw(u, 17.2, 20.6), u - 17.2, 1, 50);
    cTag('wg', 'WINGS · ON THE CRANE', '', plw(LX, PLH - 9, JET_Z0 + JT_ADD.wing * JET_SP), tw(u, 23.2, 26.2), u - 23.2, 1, 30);
    cTag('tg', 'TEST GATE · LIDAR', '', plw(LX, 9, JET_Z0 + JT_ADD.test * JET_SP), tw(u, 24.6, B_.hall[1] + .3), u - 24.6, -1, 20);
  }
  // the targeting
  if (u > B_.cls[0] - .2 && u < B_.back[0] + 1.2) {
    const L_ = tgList(), wEnd = B_.back[0] + .8;
    for (let i = 0; i < L_.length; i++) {
      const q = L_[i], tf = B_.scan[0] + (B_.scan[1] - B_.scan[0]) * sat((q.sp + 1000) / 2100) + .25;
      if (u < tf) continue;
      const a = tw(u, tf, wEnd) * (1 - .55 * ss(B_.lock[0], B_.lock[1], u)), s = q.s;
      boxTag(s.id, s.lab, s.val, q.mn, q.mx, a, u - tf);
    }
  }
  // the lock: a bracket closing on the base, the aim point's reticle (ours: lime)
  if (u > B_.lock[0] && u < B_.bl[0] + 3.5) {
    const k = kk(u, B_.lock[0], B_.lock[1]), b = ORTGT.bounds, mn = [-560, b.min[1], -420], mx = [580, b.min[1] + 40, 640];
    const bb = K.boxOf(mn, mx, IDT, 0);
    if (bb) {
      const S = K.S, cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, gw = (bb[2] - bb[0]) / 2 * (1.5 - .5 * k), gh = (bb[3] - bb[1]) / 2 * (1.5 - .5 * k);
      const fl = u < B_.lock[1] ? (Math.floor(u * 14) % 2 ? 1 : .55) : 1, a = fl * (1 - ss(B_.bl[0] + 1.5, B_.bl[0] + 3.4, u));
      // (kept on screen, clear of the readout and the menu)
      const x0 = Math.max(80 * S, cx - gw), x1 = Math.min(K.BW - 80 * S, cx + gw), y0 = Math.max(260 * S, cy - gh), y1 = Math.min(800 * S, cy + gh);
      if (x1 - x0 > 60 * S && y1 - y0 > 60 * S) {
        K.bracket([x0, y0, x1, y1], '#FF6A3D', a, 34, 2.2);
        if (u > B_.lock[1] - .1) { const tg = tgOf('lock'); K.setTag(tg, '', K.decode('TARGET · PRODUCTION BASE', sat((u - B_.lock[1] + .1) / .6), FT_, 7), 'CONFIRMED', 'coral', x0, y1 + 12 * S, a); }
      }
    }
  }
}
function drawReticle(u) {
  if (u < B_.lock[0] || u > B_.bl[0] + 4) return;
  const k = kk(u, B_.lock[0] - .2, B_.lock[1] + .4), a = k * (1 - ss(B_.bl[0] + 2, B_.bl[0] + 4, u)), y = HIT[1] + 1.5;
  for (const [r, n] of [[260 - 180 * k, 160], [90, 90], [30, 48]]) K.ringW([HIT[0], y, HIT[2]], X_, Z_, r, n, 2, LIME, .8 * a, u * .2);
  for (let q = 0; q < 4; q++) { const t = q * PI / 2 + u * .3, c = Math.cos(t), s = Math.sin(t); K.lineW(HIT[0] + c * 40, y, HIT[2] + s * 40, HIT[0] + c * 140, y, HIT[2] + s * 140, 2.4 * K.S, 2, LIME, .85 * a); }
  K.glowW(HIT[0], y, HIT[2], 24, LIME, .35 * a);
}
function vdraw(u, ctx) {
  if (!VC) return;
  FT_ = window.FILM ? FILM.T : 0;
  // the facility (unless the base's ground pass drew it this frame: under 60 km), its clock running from the splice
  const alt = Math.hypot(K.C.eye[0], K.C.eye[1] + 6371000, K.C.eye[2]) - 6371000;
  if (alt >= 60000 || !ORTGT.auto) draw(ctx, { a: -1, t: VD.t, scan: VD.scan, near: 3000 });
  drawClouds(u); drawSweep(u); drawReticle(u);
}
function readout(u, ctx) {
  if (!VC) return { l1: '', l2: '', rate: 1 };
  const e = K.C.eye, alt = Math.hypot(e[0], e[1] + 6371000, e[2]) - 6371000, rg = V.dist(e, HIT);
  const km = x => x >= 10000 ? `${Math.round(x / 1000)} km` : x >= 1000 ? `${(x / 1000).toFixed(1)} km` : `${Math.round(x)} m`;
  if (u < B_.desc[0] + 1.2) return { l1: `Target · <b>${km(VC.D0)}</b> down-range`, l2: 'Sensors · <b>slewing to the coast</b>', rate: 1 };
  if (u < B_.hold[0]) return { l1: `Range · <b>${km(rg)}</b>`, l2: `Altitude · <b>${km(alt)}</b>${alt < 4600 && alt > 2400 ? ' · cloud' : ''}`, rate: 1 };
  if (u < B_.dive[1]) return { l1: 'Coastal base · <b>1.5 × 1.4 km</b>', l2: `Plant · halls · airfield · dock · <b>${km(rg)}</b>`, rate: 1 };
  if (u < B_.hall[1]) { const nT = TANK_N, nJ = JET_N; return { l1: 'Main plant · <b>2 lines</b> · 380 m', l2: `Tanks <b>${nT}</b> · jets <b>${nJ}</b> on the lines`, rate: 1 }; }
  if (u < B_.scan[0]) return { l1: 'Coastal base · <b>1.5 × 1.4 km</b>', l2: 'Sensors · <b>lidar sweep</b>', rate: 1 };
  if (u < B_.lock[0]) { const L_ = tgList(); let n = 0; for (const q of L_) if (u > B_.scan[0] + (B_.scan[1] - B_.scan[0]) * sat((q.sp + 1000) / 2100) + .25) n++; return { l1: `Sweep · <b>${Math.round(100 * sat((u - B_.scan[0]) / (B_.scan[1] - B_.scan[0])))} %</b>`, l2: `Classified · <b>${n}/${L_.length}</b> · hostile`, rate: 1 }; }
  if (u < B_.back[0] + 1) return { l1: u < B_.lock[1] ? 'Target · <b>locking</b>' : 'Target · <b>confirmed</b>', l2: 'Aim point · <b>main plant</b> · ±2 m', rate: 1 };
  return { l1: `Target · <b>locked</b> · ${km(rg)}`, l2: `Back to the platform · fire in <b>${(-ORVISIT.at).toFixed(1)} s</b>`, rate: 1 };
}
const SFX = () => window.STAGE && STAGE.SFX;
const sfx = fn => () => { const S = SFX(); if (S) fn(S); };
const cues = [
  [.4, sfx(S => S.tone(900, 300, 1.6, 'sine', .01))], [B_.desc[0] + .5, sfx(S => S.noise(9, 600, .6, .02, 3))], [7.6, sfx(S => S.noise(3.5, 2600, .4, .03, 1))],
  [B_.hold[0], sfx(S => S.tone(330, 660, .8, 'sine', .01))], [B_.dive[0] + .4, sfx(S => S.noise(2.6, 900, .7, .03, .8))],
  [16.2, sfx(S => S.tone(70, 90, 9.5, 'sawtooth', .008))], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(k => [16.6 + k * .8, sfx(S => S.noise(.08, 3000, .6, .03, .003))]), [21.0, sfx(S => { S.tone(110, 60, .25, 'square', .02); S.noise(.2, 500, 1, .03, .005); })],
  [B_.rise[0] + .2, sfx(S => S.noise(2.8, 700, .6, .025, 1))],
  [B_.scan[0], sfx(S => S.tone(400, 2400, B_.scan[1] - B_.scan[0], 'sine', .012))], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => [32.2 + k * .38, sfx(S => S.tone(1700 + 60 * k, 1700 + 60 * k, .05, 'square', .008))]),
  [B_.lock[0], sfx(S => S.tone(1200, 1200, .08, 'square', .012))], [B_.lock[0] + .35, sfx(S => S.tone(1200, 1200, .08, 'square', .012))], [B_.lock[1], sfx(S => S.tone(880, 1760, .6, 'sine', .016))],
  [B_.back[0] + .3, sfx(S => S.noise(6.5, 500, .6, .02, 2.5))],
];
window.ORVISIT = {
  len: LEN, at: -12,
  chapters: [{ t: 0, title: 'Target' }, { t: B_.dive[0], title: 'Plant' }, { t: B_.scan[0] - .4, title: 'Identify' }],
  cues, cam: vcam, draw: vdraw, readout, tags,
  build(ctx) { ORVISIT.at0 = ctx.Tb !== undefined && ctx.Tb ? ctx.Tb : undefined; build(ctx); GIRT = girderB(PLW / 2 - 8 + 2); GIRJ = GIRT; },
  dbg: () => ({ VC, B: B_, pathAt, tgList, CLDN }),
};
Object.defineProperty(window.ORVISIT, 'hideBase', { get: () => false, configurable: true });
})();
