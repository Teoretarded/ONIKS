/* STRIKE · the sea half (window.STRIKE_SEA): the rod's fall from 32 km onto the Arleigh Burke on the night sea, its
   passage through her, the magazine chain, the dive after the rod, the aftermath. Drawn with the orbital kit (ORK:
   the dot raster, the camera, the tags) so the hand-over from the orbital film is seamless; effects in
   strike_sea_fx.js. In the Duel the destroyer is the act-1 ship and mount (the host's SHIPH, its point pass runXB in
   pc_duel_parts.js reading this file's break tab: the hole, the vents, the peeled foredeck, the cutaway).

   World: metres, +Y up, the sea level y 0, the ship at the origin heading +Z (HD.destroyer's frame: +X starboard,
   origin midships at the waterline). The rod falls along DIR (36 deg off the vertical, the orbital film's fall, from
   high on the bow side, heading aft) onto HIT (the main deck amidships, z 5) and cuts down through the decks and out
   of the bottom 8.6 m further aft (W_ENTRY).
   Local time v (s, the sea half's film time; 0 at the hand-over, the cross-fade -0.7 .. 0.7). The sim clock tau (s,
   0 at the impact) runs at RATE(v), shown on screen (V_I = 9.8):
     0       x1        the rod 32 km up, the lens riding beside it with the altitude ladder; plasma, the trail
     V_I-6.6           the lens drops into a chase behind and beside the rod, the ship far below (the user's sketch)
     V_I-2.6 -> x1/2000  the rod's last kilometre; the lens closes on the hit, the near side of the hull cut away
     V_I     impact (tau 0)  the flash; the rod cuts the main deck, 2nd and 3rd decks, the inner bottom and the keel
                       (3.1 ms): each plate flashing, its fragments spraying on down the path, white-hot plasma
                       swelling round it, incandescent ejecta thrown back up, the hole blown open behind it
     V_I+6   -> x1/400   out to 95 m off the starboard beam: the fireball in the hull runs forward to the railgun
                       magazine and it goes up in a chain toward the bow (3.6 km/s, nine blasts, tau 2.6 .. 18 ms),
                       the vents blown open in the deck and the sides, the mount thrown (6.4 s)
     V_I+12.6          the dive after the rod (5 s, turns <= 25 deg/s): ablating, slowing; held beside its end,
                       the last of it flashing to vapour 64 m down (tau 35.9 ms)
     V_END   -> x1/20  the cavity collapses and pinches off (tau 0.25 s) into a cloud of bubbles
     V_CAV   -> x1     up through the cloud and the surface (V_LENS[1]) and back 300 m: the hull parted round the hole
                       (tau 0.28 s), the halves folding, fireballs rolling up off the chain's vents, the mount
                       tumbling down into the sea, the spray dome and the column (240 m), the base surge
     V_BOIL  -> x4     the bubble cloud reaching the surface as boiling white water; a cook-off
     V_SINK  -> x30    the halves settle; the bow stands up and slides under, the stern after it (air bursts, foam
                       rings), the lens pushing in from 200 to 120 m
     V_SLICK -> x4     the hold on the burning slick where she was (to LEN)
   Render is a pure function of v. */
(function () {
'use strict';
const { V, R, X, E, rng, noise } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const ss = E.ss, sm = u => { u = E.sat(u); return u * u * u * (u * (u * 6 - 15) + 10); };
const K = ORK, C = K.C, BW = K.BW, BH = K.BH, S = K.S, HQ = K.HQ;
const LIME = K.LIME, HOT = K.HOT, WH = K.WH, CORAL = K.CORAL;
const D = STAGE.dbg();
const LOG = []; const t0 = performance.now(); const lap = s => LOG.push(`${s} ${(performance.now() - t0).toFixed(0)} ms`);

/* ---------------- time ---------------- */
/* the beats (v): the impact V_I (the fall at x1 long enough that the rod is where the orbital film hands it over:
   32.2 km up on a 36 deg path); the passage through the ship at x1/2000 (V_I .. V_PASS); the magazine chain held wide
   at x1/400 (.. V_DIVE); the dive after the rod; its end held (.. V_END); the cavity (x1/20); up (x1) ... */
const V_I = 9.8, V_PASS = V_I + 6.0, V_CHAIN = V_I + 7.2, V_HOLD = V_I + 5.4, V_DIVE = V_I + 12.6, V_DEEP = V_I + 17.6, V_END = V_I + 20.4;
const V_CAV = V_END + 6.1, V_UP = V_END + 8.7, V_WIDE = V_END + 15.7, V_BOIL = V_END + 18.1, V_SINK = V_END + 24.1, V_SLICK = V_END + 35.5, LEN = V_END + 42.7;
const RK = [[-1.5, 1], [V_I - 2.6, 1], [V_I - .5, 1 / 2000], [V_PASS, 1 / 2000], [V_CHAIN, 1 / 400], [V_END, 1 / 400], [V_END + 1.7, 1 / 20], [V_CAV, 1 / 20], [V_CAV + 4, 1],
  [V_BOIL, 1], [V_BOIL + 1.6, 4], [V_SINK, 4], [V_SINK + 2, 30], [V_SLICK, 30], [V_SLICK + 2, 4], [LEN + 1, 4]];
/* the secondaries seen from the wide (tau s): the aft VLS; a cook-off in the bow section later */
const T_SEC = [], T_COOK_ = 16;
const rateRaw = v => { let i = 0; while (i < RK.length - 2 && RK[i + 1][0] <= v) i++; const a = RK[i], b = RK[i + 1]; if (v <= a[0]) return a[1]; if (v >= b[0]) return b[1]; const u = sm((v - a[0]) / (b[0] - a[0])); return Math.exp(Math.log(a[1]) + (Math.log(b[1]) - Math.log(a[1])) * u); };
const TV0 = RK[0][0], TV1 = RK[RK.length - 1][0], NTV = Math.ceil((TV1 - TV0) * 400), TACC = new Float64Array(NTV + 1);
for (let k = 1; k <= NTV; k++) { const a = TV0 + (k - 1) / 400, b = TV0 + k / 400; TACC[k] = TACC[k - 1] + (rateRaw(a) + 4 * rateRaw((a + b) / 2) + rateRaw(b)) / 6 / 400; }
const tauRaw = v => { const x = E.clamp((v - TV0) * 400, 0, NTV), k = Math.min(NTV - 1, Math.floor(x)); return TACC[k] + (TACC[k + 1] - TACC[k]) * (x - k); };
const TAU_I = tauRaw(V_I);
const tauOf = v => tauRaw(v) - TAU_I;
const rateOf = v => rateRaw(v);
const vOfTau = tau => { let lo = TV0, hi = TV1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (tauOf(m) < tau) lo = m; else hi = m; } return (lo + hi) / 2; };

/* ---------------- geometry of the strike ---------------- */
const HSGN = 1;                                                      // (the side the rod's heading leans to: +1 starboard)
/* (round 1, the user's sketch: the rod comes in from high on the bow side at 54 deg (36 off the vertical, as the
   orbital film's fall), heading aft, into the main deck amidships; it cuts down through the decks and out of the
   bottom 8.6 m further aft) */
const TILT = 36 * DEG, HD_ = V.norm([HSGN * .16, 0, -1]);
const DIR = [HD_[0] * Math.sin(TILT), -Math.cos(TILT), HD_[2] * Math.sin(TILT)];
const HIT = [0, HD.destroyer.A.deckY(5), 5];
const SPATH = 1 / Math.cos(TILT);                                   // path metres per metre of height
/* the rod: 18 m tungsten, 0.30 m across (a closed shell, solid); 24.6 t */
const ROD_L = 18, ROD_R = .15;
/* before the impact: the distance still to go along the path, s(tau) (tau < 0); speed 5.47 km/s at 40 km easing to
   4.87 km/s at the deck (the air's drag) */
const vAtS = s => 4870 + 600 * Math.min(1, s / 40000);
const NS = 20000, SDS = 5, TS = new Float64Array(NS + 1);
for (let i = 1; i <= NS; i++) TS[i] = TS[i - 1] - SDS / vAtS((i - .5) * SDS);
function sOfTau(tau) { if (tau >= 0) return 0; let lo = 0, hi = NS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TS[m] > tau) lo = m; else hi = m; } return (lo + (TS[lo] - tau) / (TS[lo] - TS[hi])) * SDS; }
/* after it: through the ship (deck 6.5 to the keel's underside -5.6, 12.4 m of path at 4.85 km/s, 17.4 m of rod
   left), then the water: the nose's depth along the path d(tau') = DMAX (1 - (1 - tau'/TW)^2) (a steady
   deceleration from 4.8 km/s), its length eroding to nothing as it stops (hydrodynamic: ~4.4 rod lengths) */
const Y_KEEL = -5.6, S_SHIP = (HIT[1] - Y_KEEL) * SPATH, V_SHIP = 4850, TAU_K = S_SHIP / V_SHIP;
const DMAX = 79, VW0 = 4800, TW = 2 * DMAX / VW0, L_KEEL = 17.4;
const wDepth = tw => tw <= 0 ? 0 : tw >= TW ? DMAX : DMAX * (1 - Math.pow(1 - tw / TW, 2));
const wSpeed = tw => tw <= 0 ? VW0 : tw >= TW ? 0 : VW0 * (1 - tw / TW);
/* the path coordinate of the nose (metres past HIT; negative before the impact) */
function noseS(tau) { if (tau < 0) return -sOfTau(tau); if (tau < TAU_K) return V_SHIP * tau; return S_SHIP + wDepth(tau - TAU_K); }
function rodLen(tau) { if (tau < 0) return ROD_L; if (tau < TAU_K) return ROD_L - (ROD_L - L_KEEL) * tau / TAU_K; const tw = tau - TAU_K; return tw >= TW ? 0 : L_KEEL * Math.pow(1 - tw / TW, .8); }
function rodSpeed(tau) { if (tau < 0) return vAtS(sOfTau(tau)); if (tau < TAU_K) return V_SHIP; return wSpeed(tau - TAU_K); }
const ptS = (s, o) => { o = o || [0, 0, 0]; o[0] = HIT[0] + DIR[0] * s; o[1] = HIT[1] + DIR[1] * s; o[2] = HIT[2] + DIR[2] * s; return o; };
const W_ENTRY = ptS(S_SHIP);                                       // where the rod leaves the keel into the sea
/* the rod's frame: DIR and two perpendiculars (U2 chosen at the hand-over so the lens's sense of up carries over) */
let U2 = V.norm(V.cross(DIR, [0, 0, 1])), W2 = V.cross(DIR, U2);

/* ---------------- the hand-over: the orbital film's lens, relative to its rod ---------------- */
const A = window.STRIKE_ORBIT, T_H = A ? A.baseT(A.len) : 195.3;
const FALL = D.FALL, FD = FALL.DIR, FU = FALL.U, FWv = FALL.W;
{
  // their local up at the rod, perpendicular to the rod, as an angle in (U, W); ours made to match
  const p = D.rodAt(T_H), up = V.norm(V.sub(p, D.W.CE)), pu = V.norm(V.sub(up, V.mul(FD, V.dot(up, FD)))), ph = Math.atan2(V.dot(pu, FWv), V.dot(pu, FU));
  const yu = [0, 1, 0], pm = V.norm(V.sub(yu, V.mul(DIR, V.dot(yu, DIR)))), e2 = V.cross(DIR, pm), a = -ph;
  U2 = V.add(V.mul(pm, Math.cos(a)), V.mul(e2, Math.sin(a))); W2 = V.cross(DIR, U2);
}
const CAMT = new M3.Cam(BW, BH);
/* their camera at base time T relative to their rod: eye, forward, up in (U, W, DIR) */
function theirRel(T) {
  const s = D.cam(T); CAMT.eye = s.eye.slice(); CAMT.target = s.target.slice(); CAMT.fov = s.fov; CAMT.roll = s.roll || 0; CAMT.up = [0, 1, 0]; CAMT.update();
  const p = D.rodAt(T), q = V.sub(CAMT.eye, p), rel = v => [V.dot(v, FU), V.dot(v, FWv), V.dot(v, FD)];
  return { e: rel(q), f: rel(CAMT.f), u: rel(CAMT.u), fov: s.fov };
}
const REL_H = theirRel(T_H + .7);

/* ---------------- the sea ---------------- */
const SEA = (() => {
  const Apts = [], r = rng(2402);
  for (let rad = 1.5; rad < 9000; ) {
    const ds = .55 + rad * .011, n = Math.floor(TAU * rad / ds), ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * TAU, rr = rad + (r() - .5) * ds * .8, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      const tex = Math.exp(1.2 * M3.fbm(x * .0021, z * .0009, 3.7, 3) - .2);
      Apts.push(x, z, Math.min(1, .13 + .1 * tex + .05 * r()), r() * TAU);
    }
    rad += ds;
  }
  return K.tiled(new Float32Array(Apts), 4, 160, true);
})();
lap(`sea ${SEA.F.length / 4} pts`);
const STARS = D.W && D.W.STARS ? D.W.STARS : K.stars(2600, 31);              // (the orbital world's sky: one sky for the whole take)
/* the sea's height: a long swell, a cross swell, chop; the strike's ring waves and the crater (tau s) */
const PER = p => p;
function seaY(x, z, T, tau) {
  let y = .45 * Math.sin(T * .52 + z * .011 + x * .004) + .25 * Math.sin(T * .83 - x * .019 + z * .006 + 1.3) + .08 * Math.sin(T * 2.1 + x * .21 + z * .17);
  if (tau > 0) {
    const dx = x - W_ENTRY[0], dz = z - W_ENTRY[2], r = Math.sqrt(dx * dx + dz * dz);
    // the crater over the entry (opens in tens of ms, fills in ~2 s) and the ring waves running out
    const cr = 9 * Math.exp(-r * r / (14 * 14)) * Math.min(1, tau / .05) * Math.exp(-tau / 1.4);
    y -= cr;
    if (tau > .3) { const c = 9 + 2.2 * Math.sqrt(tau), ro = c * tau, w = r - ro, A_ = 3.2 * Math.exp(-tau / 25) / Math.sqrt(1 + r / 40); y += A_ * Math.exp(-w * w / (18 * 18)) * Math.cos(w * .2); }
  }
  return y;
}

/* ---------------- the ship: sampled, cut in two along a torn break, the middle thrown out as debris ---------------- */
const SHIPM = HD.destroyer();
const SHIP_LV = HQ ? [.09, .18, .36, .72, 1.44] : [.12, .24, .48, .96, 1.92];
/* the rod's path through the hull: its x and z at height y */
const zPath = y => HIT[2] + DIR[2] * (y - HIT[1]) / DIR[1], xPath = y => HIT[0] + DIR[0] * (y - HIT[1]) / DIR[1];
/* the hole it leaves (and the fireball inside blows open): radius at height y, 8.2 m at the deck, 4.6 m at the keel;
   measured across the path at the same height */
const holeR = y => 4.6 + 3.6 * E.sat((y + 2) / 8.5);
const holeD = (x, y, z) => Math.hypot(x - xPath(y), z - zPath(y));
/* the break (later, round the hole): the bow keeps z > zbB(x, y), the stern z < zbS(x, y): torn surfaces; between
   them the hull is blown out (debris). Until the hull breaks both halves meet on zSp (the path's z, a little jagged) */
const R_FACE = 5.5;
const zSp = (x, y) => zPath(y) + .6 * noise(x * .4 + 2.1, y * .4 + 5.3);
const zbB = (x, y) => zPath(y) + R_FACE + 2.4 * noise(x * .32 + 1.3, y * .32 + 4.1) + 1.1 * noise(x * 1.3 + 7, y * 1.3) + .4 * noise(x * 4, y * 4 + 2);
const zbS = (x, y) => zPath(y) - R_FACE - 2.4 * noise(x * .32 + 8.3, y * .32 + 1.7) - 1.1 * noise(x * 1.3 + 3, y * 1.3 + 9) - .4 * noise(x * 4 + 5, y * 4);
const T_BRK = .28;                                                    // (tau: the hull parts round the hole)
const brkG = tau => E.sat((tau - T_BRK) / .5);                        // the blown-out middle widening (0 .. 1)
/* the superstructure over the hole blown away */
const blownSup = (x, y, z) => { const zc = zPath(7); return y > 7.4 && Math.abs(z - zc) < 12 + 3 * noise(x * .2, y * .2, 3.3) && Math.hypot(x, (z - zc) * .7) < 13; };
/* the magazine chain: the fireball the rod leaves in the hull reaches the railgun magazine low along the keel (from
   the hole forward under the mount) and it goes up in a chain rippling toward the bow at 3.6 km/s: nine blasts, each
   venting up through the decks and out of a side (the one under the mount the biggest: it throws the mount) */
const MAG_Z0 = zPath(-3) + 3, MAG_Z1 = 56, MAG_V = 3600, T_MAG = .0026;
const BLASTS = [], VENTS = [];
const hullHW = (() => {                                               // the hull's half-width at (z, y) (from a coarse sample)
  const T = new Float32Array(170 * 30);
  for (const part of SHIPM.parts) {
    if (part.name !== 'hull') continue;
    const Tf = GEO.partXf(X.make(), part, {}), Sx = GEO.sample({ parts: [part] }, .5, 5, {}, { fine: false })[0].pts;
    for (let i = 0; i < Sx.length; i += 6) { const q = X.ap(Tf, [Sx[i], Sx[i + 1], Sx[i + 2]]), zi = Math.round(q[2] + 85), yi = Math.round(q[1] + 8); if (zi >= 0 && zi < 170 && yi >= 0 && yi < 30) T[zi * 30 + yi] = Math.max(T[zi * 30 + yi], Math.abs(q[0])); }
  }
  return (z, y) => { const zi = E.clamp(Math.round(z + 85), 0, 169), yi = E.clamp(Math.round(y + 8), 0, 29); let w = T[zi * 30 + yi]; for (let k = 1; k < 5 && !w; k++) w = Math.max(T[Math.min(169, zi + k) * 30 + yi], T[Math.max(0, zi - k) * 30 + yi]); return w || 6; };
})();
{
  const r = rng(5858), n = 9;
  for (let k = 0; k < n; k++) {
    const z = MAG_Z0 + (MAG_Z1 - MAG_Z0) * k / (n - 1) + (k && k < n - 1 ? (r() - .5) * 1.4 : 0);
    const s = k === n - 2 ? 1.6 : k === 0 ? 1.25 : .8 + .4 * r(), side = k % 2 ? 1 : -1;
    const B = { k, c: [(r() - .5) * 2.4, -3 + r() * 1.2, z], t: T_MAG + (z - MAG_Z0) / MAG_V + .0004 * r(), s, side, ph: r() * 9 };
    BLASTS.push(B);
    const dy = HD.destroyer.A.deckY(z);
    VENTS.push({ b: k, p: [B.c[0] * .5, dy, z + (r() - .5) * 2], r: 3.0 + 1.7 * s, t0: B.t + .0012, up: 1 });
    VENTS.push({ b: k, p: [side * hullHW(z, 1.5), 1.5 + r(), z + (r() - .5) * 2], r: 2.0 + 1.2 * s, t0: B.t + .0016, up: 0 });
    if (s > 1.1) VENTS.push({ b: k, p: [-side * hullHW(z, 1), 1 + r(), z + (r() - .5) * 2], r: 1.8 + 1.1 * s, t0: B.t + .0019, up: 0 });
  }
}
const MOUNT_B = BLASTS[7], MOUNT_T = MOUNT_B.t + .0015;            // (the mount thrown by the blast under it)
const ventR = (vt, tau) => tau <= vt.t0 ? 0 : vt.r * Math.pow(E.sat((tau - vt.t0) / .006), .5);
/* which piece of the ship a point is (0 bow, 1 stern, 2 debris) */
function classify(x, y, z) {
  if (y < 9.5 && y > Y_KEEL - .5 && holeD(x, y, z) < holeR(y)) return 2;
  if (blownSup(x, y, z)) return 2;
  for (const vt of VENTS) { const dx = x - vt.p[0], dy = y - vt.p[1], dz = z - vt.p[2]; if (dx * dx + dy * dy + dz * dz < vt.r * vt.r) return 2; }
  const zb = zbB(x, y), zs = zbS(x, y);
  return z > zb ? 0 : z < zs ? 1 : 2;
}
/* point attributes: stride 10 (x y z nx ny nz dx dy dz flag); flag: 0 plain, 1 torn edge, 2 near the break */
const DEFZ = 9;
function shipLevels() {
  const out = SHIP_LV.map(() => ({ g: [[], [], []], ch: [] }));
  SHIP_LV.forEach((sp, li) => {
    for (const part of SHIPM.parts) {
      if (part.name === 'gun') continue;
      const Tf = GEO.partXf(X.make(), part, {});
      const Sx = GEO.sample({ parts: [part] }, sp, 101 + li * 13 + part.name.length * 7, {}, li >= 2 ? { fine: false } : undefined)[0].pts;
      for (let i = 0; i < Sx.length; i += 6) {
        const q = X.ap(Tf, [Sx[i], Sx[i + 1], Sx[i + 2]]), n = X.dir(Tf, [Sx[i + 3], Sx[i + 4], Sx[i + 5]]);
        const x = q[0], y = q[1], z = q[2], g = classify(x, y, z);
        // the deformation near the break: plating flared out, decks buckled, the torn lip curled
        let dx = 0, dy = 0, dz = 0, flag = 0;
        if (g !== 2) {
          const zb = zbB(x, y), zs = zbS(x, y), db = g === 0 ? z - zb : zs - z, sd = g === 0 ? 1 : -1;
          if (db < DEFZ) {
            const k = Math.pow(1 - db / DEFZ, 2.2), nz = noise(x * .7 + g * 9, y * .7, z * .2);
            dx = Math.sign(x || 1) * k * (.9 + 1.1 * nz) * (Math.abs(x) > 4 ? 1 : .4);
            dy = (y > 4 ? .8 : -.6) * k * (.6 + .8 * noise(x * .5, z * .5 + g)) - .9 * k * k;
            dz = -sd * k * .6 * (1 + nz);
            flag = db < .55 ? 1 : 2;
          }
        }
        out[li].g[g].push(x, y, z, n[0], n[1], n[2], dx, dy, dz, flag);
      }
    }
  });
  return out;
}
const SL = shipLevels();
/* feature edges: a point whose neighbours (within 1.7 spacings) turn by more than ~50 deg lies on an edge of the
   model (plating knuckles, deck edges, house corners, frames): drawn brighter, as the lattice draws its edges */
SL.forEach((L, li) => {
  const sp = SHIP_LV[li] * 1.7, inv = 1 / sp;
  for (let g = 0; g < 3; g++) {
    const A_ = L.g[g], n = A_.length / 10, grid = new Map();
    const key = (x, y, z) => ((Math.floor(x * inv) + 2048) * 4096 + (Math.floor(y * inv) + 2048)) * 4096 + (Math.floor(z * inv) + 2048);
    for (let i = 0; i < n; i++) { const k = key(A_[i * 10], A_[i * 10 + 1], A_[i * 10 + 2]); let c = grid.get(k); if (!c) { c = []; grid.set(k, c); } c.push(i); }
    const r2 = sp * sp;
    for (let i = 0; i < n; i++) {
      const j = i * 10, nx = A_[j + 3], ny = A_[j + 4], nz = A_[j + 5]; if (!nx && !ny && !nz) continue;
      const cx = Math.floor(A_[j] * inv), cy = Math.floor(A_[j + 1] * inv), cz = Math.floor(A_[j + 2] * inv);
      let edge = false;
      for (let a = -1; a <= 1 && !edge; a++) for (let b = -1; b <= 1 && !edge; b++) for (let c = -1; c <= 1 && !edge; c++) {
        const cl = grid.get(((cx + a + 2048) * 4096 + (cy + b + 2048)) * 4096 + (cz + c + 2048)); if (!cl) continue;
        for (const q of cl) { if (q === i) continue; const o = q * 10, dx = A_[o] - A_[j], dy = A_[o + 1] - A_[j + 1], dz = A_[o + 2] - A_[j + 2]; if (dx * dx + dy * dy + dz * dz > r2) continue; const d = nx * A_[o + 3] + ny * A_[o + 4] + nz * A_[o + 5]; if (d < .64 && (A_[o + 3] || A_[o + 4] || A_[o + 5])) { edge = true; break; } }
      }
      if (edge) A_[j + 9] += 8;
    }
  }
});
lap('ship edges');
lap(`ship sampled ${SL.map(l => (l.g[0].length + l.g[1].length + l.g[2].length) / 10).join('/')}`);
/* debris chunks: the blown points grouped in 2.4 m cells (level 1's cells; other levels follow the same cells) */
const CHS = 2.4, CHK = new Map(), CHUNKS = [];
const cellKey = (x, y, z) => ((Math.floor(x / CHS) + 64) * 128 + (Math.floor(y / CHS) + 64)) * 256 + (Math.floor(z / CHS) + 128);
{
  const rc = rng(9191), P1 = SL[1].g[2];
  for (let i = 0; i < P1.length; i += 10) {
    const k = cellKey(P1[i], P1[i + 1], P1[i + 2]); let c = CHK.get(k);
    if (!c) { c = { id: CHUNKS.length, c: [0, 0, 0], n: 0 }; CHK.set(k, c); CHUNKS.push(c); }
    c.c[0] += P1[i]; c.c[1] += P1[i + 1]; c.c[2] += P1[i + 2]; c.n++;
  }
  for (const c of CHUNKS) {
    c.c = V.mul(c.c, 1 / c.n);
    const x = c.c[0], y = c.c[1], z = c.c[2];
    // where it was thrown from: the hole (out from the path and up out of the entry, or down with the rod), a vent
    // of the chain (out from the blast), the superstructure over the hole, or the torn middle when the hull parts
    let src = -3, best = 1e9;
    if (y < 9.5 && holeD(x, y, z) < holeR(y) + 1) src = -1;
    else if (blownSup(x, y, z)) src = -2;
    else for (let i = 0; i < VENTS.length; i++) { const vt = VENTS[i], d = Math.hypot(x - vt.p[0], y - vt.p[1], z - vt.p[2]); if (d < vt.r + 1.2 && d < best) { best = d; src = i; } }
    c.src = src;
    let o, sp, t0, hot;
    if (src === -1) {
      const s_ = (y - HIT[1]) / DIR[1], px = xPath(y), pz = zPath(y), rx = x - px, rz = z - pz, rh = Math.hypot(rx, rz) || 1;
      const upw = y > 1 ? 1 : -.4;                                   // (above the waterline thrown up out of the hole)
      o = V.norm([rx / rh * (.6 + .5 * rc()), upw * (.5 + .9 * rc()), rz / rh * (.6 + .5 * rc())]); sp = 60 + 260 * Math.pow(rc(), .7); t0 = s_ / 4850 + .0008 + .0015 * rc(); hot = .7 + .3 * rc();
    } else if (src === -2) {
      const zc = zPath(7); o = V.norm([x + (rc() - .5) * 6, 6 + 6 * rc(), (z - zc) + (rc() - .5) * 6]); sp = 40 + 160 * rc(); t0 = .0015 + Math.hypot(x, y - 7, z - zc) / 3000; hot = .5 + .4 * rc();
    } else if (src >= 0) {
      const vt = VENTS[src]; o = V.norm([x - vt.p[0] + (rc() - .5) * 2, (vt.up ? 3 : .8) + 2 * rc() + (y - vt.p[1]), z - vt.p[2] + (rc() - .5) * 2]); sp = (35 + 190 * Math.pow(rc(), .8)) * BLASTS[vt.b].s; t0 = vt.t0 + .0008 * rc(); hot = .6 + .4 * rc();
    } else {
      o = V.norm([(rc() - .5) * 2, .3 + rc(), (rc() - .5) * 2]); sp = 4 + 30 * rc(); t0 = T_BRK + .2 * rc(); hot = .25 * rc();
    }
    c.v = V.mul(o, sp);
    c.k = .25 + 1.2 * rc() * (1 - Math.min(1, c.n / 300));                 // drag rate (1/s)
    c.ax = V.norm([rc() - .5, rc() - .5, rc() - .5]); c.w = (rc() - .5) * 14;
    c.t0 = t0; c.hot = hot;
    // its splash: solve y(tau) = 0 (ballistic with linear drag)
    c.ts = 1e9; for (let t = c.t0 + .004; t < 90; t += .02) { if (chunkY(c, t) < -.5) { c.ts = t; break; } }
  }
}
function chunkY(c, tau) { const t = Math.max(0, tau - c.t0), k = c.k, g = 9.81, e = 1 - Math.exp(-k * t); return c.c[1] + (c.v[1] + g / k) * e / k - g * t / k; }
function chunkPos(c, tau, o) {
  if (tau > c.ts) { chunkPos(c, c.ts, o); const a = tau - c.ts; o[0] += c.v[0] * Math.exp(-c.k * c.ts) * .02 * (1 - Math.exp(-a)); o[2] += c.v[2] * Math.exp(-c.k * c.ts) * .02 * (1 - Math.exp(-a)); o[1] = -.5 - 2.2 * a * (1 - Math.exp(-a * 2)) / (1 + .02 * a); return o; }
  const t = Math.max(0, tau - c.t0), k = c.k, g = 9.81, e = 1 - Math.exp(-k * t);
  o[0] = c.c[0] + c.v[0] * e / k; o[2] = c.c[2] + c.v[2] * e / k; o[1] = c.c[1] + (c.v[1] + g / k) * e / k - g * t / k; return o;
}
/* group the levels' points by group and cell (for culling and LOD), stride 10 kept */
function cells(arr, cs) {
  const n = arr.length / 10, m = new Map();
  for (let i = 0; i < n; i++) { const k = cellKey(arr[i * 10], arr[i * 10 + 1], arr[i * 10 + 2]) * 1 + (cs === CHS ? 0 : 0); let g = m.get(k); if (!g) { g = []; m.set(k, g); } g.push(i); }
  const O = new Float32Array(arr.length), TL = []; let o = 0;
  for (const [key, g] of m) {
    const i0 = o; let sx = 0, sy = 0, sz = 0;
    for (const i of g) { for (let q = 0; q < 10; q++) O[o * 10 + q] = arr[i * 10 + q]; sx += arr[i * 10]; sy += arr[i * 10 + 1]; sz += arr[i * 10 + 2]; o++; }
    sx /= g.length; sy /= g.length; sz /= g.length;
    let rr = 0; for (let k = i0; k < o; k++) rr = Math.max(rr, Math.hypot(O[k * 10] - sx, O[k * 10 + 1] - sy, O[k * 10 + 2] - sz));
    TL.push({ i0, i1: o, c: [sx, sy, sz], r: rr + 1.5, key });
  }
  return { P: O, TL };
}
const SHIP = [0, 1, 2].map(g => SL.map(l => cells(l.g[g], CHS)));
// the debris cells' chunk ids (same 2.4 m grid on every level)
for (const lvl of SHIP[2]) for (const t of lvl.TL) { const c = CHK.get(t.key); t.chunk = c ? c : null; }
lap(`ship cells; ${CHUNKS.length} debris chunks`);
/* the ship's bounds (for its box) */
const SB = (() => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let g = 0; g < 3; g++) { const P = SHIP[g][3].P; for (let i = 0; i < P.length; i += 10) for (let k = 0; k < 3; k++) { if (P[i + k] < mn[k]) mn[k] = P[i + k]; if (P[i + k] > mx[k]) mx[k] = P[i + k]; } } return { mn, mx }; })();

/* ---------------- the halves: folding into a V, settling, sinking (tau s) ---------------- */
/* each half turns about a pivot on its keel at the break (its far end rising), rolls a little, settles; the gap
   opens. First (tau < 0.8 s) the hog: the cavity under the keel lifts the break ends (the halves a shallow inverted
   V), then they sag into the V. Later each flooding half stands up on its broken end and slides under: its far end
   rising to htop above the sea (t0 .. t1, the fold going to ang), then going down (t1 .. t2) */
const PIV = [[0, Y_KEEL + .4, zPath(Y_KEEL) + R_FACE], [0, Y_KEEL + .4, zPath(Y_KEEL) - R_FACE]];
const PL = [{ t0: 150, t1: 214, t2: 262, ang: 80, htop: 34, h0: 0 }, { t0: 192, t1: 252, t2: 306, ang: 66, htop: 26, h0: 0 }];
const FAR = [[0, 2, 75], [0, 2, -76]];                                // the far ends (half-local)
const bump = (t, a, b) => t <= a || t >= b ? 0 : Math.sin(PI * (t - a) / (b - a));
/* (round 1: the halves hold together until the hull parts round the hole, T_BRK; before that the whole ship heaves
   up on the cavity and the blasts) */
const foldV = (g, tp) => { const b = Math.max(0, tp - T_BRK), w = sm(b / .5); return w * ((g === 0 ? 24 : 19) * (1 - Math.exp(-b / 2.4)) + (g === 0 ? .085 : .07) * Math.min(b, 150) + 1.2) - 5 * Math.pow(bump(tp, T_BRK, T_BRK + 1), 1.5); };
const sinkV = tp => 2.6 * (1 - Math.exp(-tp / 1.8)) + .06 * tp - 2.6 * Math.pow(bump(tp, .01, .9), 1.3) - 2 * Math.pow(bump(tp, T_BRK, T_BRK + 1), 1.5);
function poseAt(g, tp, fold, M, T) {
  const th = fold * DEG * (g === 0 ? -1 : 1);                       // about X: the bow's end up (y' = c y - s z: z > 0 rises for s < 0)
  const tb = Math.max(0, tp - T_BRK), roll = (g === 0 ? -7 : 5) * DEG * (1 - Math.exp(-tb / 7)) + (g === 0 ? -.02 : .015) * DEG * Math.min(tb, 150);
  const b = Math.max(0, tp - T_BRK), gap = (g === 0 ? 1 : -1) * (5 * (1 - Math.exp(-b / 1.5)) + .03 * Math.min(b, 200));
  const heave = .15 * Math.sin(tp * 1.1 + g * 2 * E.sat(b / .5));
  // R = Rz(roll) * Rx(th)
  const cx = Math.cos(th), sx = Math.sin(th), cz = Math.cos(roll), sz = Math.sin(roll);
  M[0] = cz; M[1] = -sz * cx; M[2] = sz * sx;
  M[3] = sz; M[4] = cz * cx; M[5] = -cz * sx;
  M[6] = 0; M[7] = sx; M[8] = cx;
  const p = PIV[g];
  T[0] = p[0] - (M[0] * p[0] + M[1] * p[1] + M[2] * p[2]); T[1] = p[1] - (M[3] * p[0] + M[4] * p[1] + M[5] * p[2]) + heave; T[2] = p[2] - (M[6] * p[0] + M[7] * p[1] + M[8] * p[2]) + gap;
  const f = FAR[g]; return M[3] * f[0] + M[4] * f[1] + M[5] * f[2] + T[1];      // the far end's height (before sinking)
}
{ const M = new Float64Array(9), T = new Float64Array(3); for (let g = 0; g < 2; g++) { const P = PL[g]; P.h0 = poseAt(g, P.t0, foldV(g, P.t0), M, T) - sinkV(P.t0); } }
/* (sk: the half's far end height above the sea, out) */
const HP = { far: [0, 0] };
/* the gap between the two break faces (m): the 12 m blown out amidships, plus the halves drifting apart */
const halfGap = tau => { const b = Math.max(0, tau - T_BRK); return 2 * R_FACE * brkG(tau) + 2 * (5 * (1 - Math.exp(-b / 1.5)) + .03 * Math.min(b, 200)); };
function halfPose(g, tau, M, T) {
  const tp = Math.max(0, tau), P = PL[g];
  let fold = foldV(g, tp);
  const u1 = sm((tp - P.t0) / (P.t1 - P.t0));
  if (u1 > 0) fold += (P.ang - fold) * u1;
  const yF = poseAt(g, tp, fold, M, T);
  let sink;
  if (tp <= P.t0) sink = sinkV(tp);
  else {
    const u2 = (tp - P.t1) / (P.t2 - P.t1);
    const hF = P.h0 + (P.htop - P.h0) * u1 - (u2 > 0 ? (P.htop + 36) * Math.pow(Math.min(1, u2), 1.7) + 2 * Math.max(0, tp - P.t2) : 0);
    sink = yF - hF;
  }
  T[1] -= sink; HP.far[g] = yF - sink;
}
/* when each half's far end goes under (tau) */
const T_UNDER = PL.map((P, g) => { let lo = P.t1, hi = P.t2; const M = new Float64Array(9), T = new Float64Array(3); for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; halfPose(g, m, M, T); if (HP.far[g] > 0) lo = m; else hi = m; } return (lo + hi) / 2; });
/* the ship before the strike: on station, gentle motion */
function shipPose(T, M, Tt) {
  const roll = .6 * DEG * Math.sin(T * .55), pitch = .25 * DEG * Math.sin(T * .8 + 1.1), heave = .12 * Math.sin(T * 1.04);
  const cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  M[0] = cz; M[1] = -sz * cx; M[2] = sz * sx; M[3] = sz; M[4] = cz * cx; M[5] = -cz * sx; M[6] = 0; M[7] = sx; M[8] = cx;
  Tt[0] = 0; Tt[1] = heave; Tt[2] = 0;
}

/* ---------------- the raster: camera cache, dots ---------------- */
let U32 = null, ex = 0, ey = 0, ez = 0, f0 = 0, f1 = 0, f2 = 0, r0 = 0, r1 = 0, r2 = 0, u0 = 0, u1 = 0, u2 = 0, FL = 1, CX = 0, CY = 0, NR = .1, DD = null;
function cam() { const e = C.eye, f = C.f, r = C.r, u = C.u; ex = e[0]; ey = e[1]; ez = e[2]; f0 = f[0]; f1 = f[1]; f2 = f[2]; r0 = r[0]; r1 = r[1]; r2 = r[2]; u0 = u[0]; u1 = u[1]; u2 = u[2]; FL = C.fl; CX = C.cx + C.shake[0]; CY = C.cy + C.shake[1]; NR = C.near; DD = K.pb.d; if (!U32 || U32.buffer !== DD.buffer) U32 = new Uint32Array(DD.buffer); }
/* one dot, max blend, colour (0..255) x a */
function dotC(x, y, z, s, cr, cg, cb, a) {
  if (a < .012) return;
  const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < NR) return;
  const iz = FL / zc, sx = CX + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) return;
  const sy = CY - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) return;
  if (a > 1) a = 1;
  if (s <= 1) { const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = cr * a, G_ = cg * a, B_ = cb * a; if (DD[q] < R_) DD[q] = R_; if (DD[q + 1] < G_) DD[q + 1] = G_; if (DD[q + 2] < B_) DD[q + 2] = B_; }
  else K.pb.dot(sx, sy, s, cr, cg, cb, a);
}
const dotW = (x, y, z, s, c, a) => dotC(x, y, z, s, c[0], c[1], c[2], a);

/* ---------------- the ship's dots ---------------- */
const MX = new Float64Array(9), TX = new Float64Array(3), CC3 = [0, 0, 0];
const MOON = V.norm([-.35, .55, -.75]);
const FIRE = [255, 196, 138], EMB = [255, 142, 84], DEEP = [150, 176, 190];
/* lights for this frame: [x y z intensity radius r g b] (fires, the flash, the rod's glow) */
const LT = new Float64Array(8 * 12); let NLT = 0;
function light(x, y, z, I, rad, col) { if (NLT >= 12 || I < .01) return; const j = NLT++ * 8; LT[j] = x; LT[j + 1] = y; LT[j + 2] = z; LT[j + 3] = I; LT[j + 4] = rad; LT[j + 5] = col[0]; LT[j + 6] = col[1]; LT[j + 7] = col[2]; }
let UNDER = false, EDGEH = 0, KD = 0, AMB = 1, DEBH = 0;
/* draw a set of a group's cells under (M, T): LOD by projected spacing (HQ: crossfaded levels) */
const PXT = HQ ? 2.3 : 2.5, LSP0 = Math.log2(SHIP_LV[0]);
function drawGroup(gi, M, T, a0, sel, chunkTau) {
  const lv = SHIP[gi], nl = lv.length;
  for (let li = 0; li < nl; li++) {
    const L = lv[li], P = L.P;
    for (const cl of L.TL) {
      if (sel && !sel(cl)) continue;
      let Mx = M, Tx = T;
      if (chunkTau !== undefined) { const ch = cl.chunk; if (!ch || !chunkXf(ch, chunkTau)) continue; Mx = CMX; Tx = CTX; }
      const c = cl.c, wx = Mx[0] * c[0] + Mx[1] * c[1] + Mx[2] * c[2] + Tx[0], wy = Mx[3] * c[0] + Mx[4] * c[1] + Mx[5] * c[2] + Tx[1], wz = Mx[6] * c[0] + Mx[7] * c[1] + Mx[8] * c[2] + Tx[2];
      if (!K.wIn(wx, wy, wz, cl.r)) continue;
      const d = Math.max(.5, Math.hypot(wx - ex, wy - ey, wz - ez) - cl.r * .5);
      // the ideal level (0: level 0's spacing lands on PXT px); the two round it, crossfaded in HQ
      const lam = Math.log2(PXT * d / FL) - LSP0;
      let w;
      if (lam <= 0) w = li === 0 ? 1 : 0;
      else if (lam >= nl - 1) w = li === nl - 1 ? 1 : 0;
      else {
        const la = Math.floor(lam), fr = lam - la;
        if (HQ) { const wb = ss(.45, 1, fr); w = li === la ? 1 - wb : li === la + 1 ? wb : 0; }
        else w = li === la ? 1 : 0;
      }
      if (w <= .002) continue;
      runCell(P, cl.i0, cl.i1, Mx, Tx, a0, w, d);
    }
  }
}
/* the debris chunk's transform at tau (false: not out yet / under the sea) */
const CMX = new Float64Array(9), CTX = new Float64Array(3);
function chunkXf(ch, tau) {
  if (tau < ch.t0 || tau > ch.ts + 30) return false;
  DEBH = ch.hot * Math.exp(-(tau - ch.t0) / 1.4);
  const t = tau - ch.t0, ang = ch.w * t, ax = ch.ax, c = Math.cos(ang), s = Math.sin(ang), k = 1 - c, x = ax[0], y = ax[1], z = ax[2];
  CMX[0] = c + x * x * k; CMX[1] = x * y * k - z * s; CMX[2] = x * z * k + y * s; CMX[3] = y * x * k + z * s; CMX[4] = c + y * y * k; CMX[5] = y * z * k - x * s; CMX[6] = z * x * k - y * s; CMX[7] = z * y * k + x * s; CMX[8] = c + z * z * k;
  chunkPos(ch, tau, CC3); const cc = ch.c;
  CTX[0] = CC3[0] - (CMX[0] * cc[0] + CMX[1] * cc[1] + CMX[2] * cc[2]); CTX[1] = CC3[1] - (CMX[3] * cc[0] + CMX[4] * cc[1] + CMX[5] * cc[2]); CTX[2] = CC3[2] - (CMX[6] * cc[0] + CMX[7] * cc[1] + CMX[8] * cc[2]);
  CUR_CH = ch; return true;
}
let CUR_CH = null;
function runCell(P, i0, i1, M, T, a0, w, d) {
  const kd = KD, eh = EDGEH, under = UNDER, nl = NLT;
  const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8], t0_ = T[0], t1_ = T[1], t2_ = T[2];
  const fade = d < 2500 ? 1 : .6 + .4 * Math.exp(-(d - 2500) / 3000);
  for (let i = i0; i < i1; i++) {
    if (w < 1 && ((i * .6180339887) % 1) > w) continue;
    const j = i * 10, fl0 = P[j + 9], fe = fl0 >= 8, fl = fe ? fl0 - 8 : fl0;
    let px = P[j], py = P[j + 1], pz = P[j + 2];
    if (fl > 0 && kd > 0) { px += P[j + 6] * kd; py += P[j + 7] * kd; pz += P[j + 8] * kd; }
    const x = m0 * px + m1 * py + m2 * pz + t0_, y = m3 * px + m4 * py + m5 * pz + t1_, z = m6 * px + m7 * py + m8 * pz + t2_;
    const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < NR) continue;
    const iz = FL / zc, sx = CX + (dx * r0 + dy * r1 + dz * r2) * iz; if (sx < 0 || sx >= BW) continue;
    const sy = CY - (dx * u0 + dy * u1 + dz * u2) * iz; if (sy < 0 || sy >= BH) continue;
    // lighting: the moon, ambient, the lights (fires, the flash)
    const nx0 = P[j + 3], ny0 = P[j + 4], nz0 = P[j + 5];
    let b, cr = 236, cg = 238, cb = 230;
    if (nx0 === 0 && ny0 === 0 && nz0 === 0) b = .34;
    else {
      const nx = m0 * nx0 + m1 * ny0 + m2 * nz0, ny = m3 * nx0 + m4 * ny0 + m5 * nz0, nz = m6 * nx0 + m7 * ny0 + m8 * nz0;
      const facing = nx * dx + ny * dy + nz * dz;
      if (facing > 0) { if (i % 3) continue; b = .08; }
      else { const lm = nx * MOON[0] + ny * MOON[1] + nz * MOON[2]; b = .12 + .34 * (lm > 0 ? lm : 0) + .1 * Math.min(1, -facing / zc); }
    }
    if (fe) b = b * 1.55 + .1;
    b *= AMB;
    if (nl) {
      let wr = 0, wg = 0, wb = 0;
      for (let k = 0; k < nl; k++) { const q = k * 8, lx = LT[q] - x, ly = LT[q + 1] - y, lz = LT[q + 2] - z, r2_ = LT[q + 4] * LT[q + 4], I = LT[q + 3] * r2_ / (r2_ + lx * lx + ly * ly + lz * lz); wr += I * LT[q + 5]; wg += I * LT[q + 6]; wb += I * LT[q + 7]; }
      const wl = (wr + wg + wb) / (3 * 255);
      if (wl > .002) { b += .6 * wl; const kk = Math.min(.35, wl * .9 / (b + .15)); cr = cr + (wr / (wl * 3) - cr) * kk; cg = cg + (wg / (wl * 3) - cg) * kk; cb = cb + (wb / (wl * 3) - cb) * kk; }
    }
    if (DEBH > .02) { const h = DEBH; b = Math.max(b, .45 * h + .15); cr += (255 - cr) * h; cg += (160 + 70 * h - cg) * h; cb += (96 + 120 * h * h - cb) * h; }
    if (fl === 1 && eh > 0) { const h = eh; b = Math.max(b, .55 * h + .2); cr += (255 - cr) * h; cg += (150 + 90 * h * h - cg) * h; cb += (84 + 140 * h * h - cb) * h; }
    // the sea: what is under the surface fades with its depth (seen from above), or with the distance (from below)
    if (y < 0) { b *= under ? Math.exp(-zc / 38) * 1.4 : Math.exp(y / 2.8) * .9; cr *= .8; cg *= .92; }
    else if (under) b *= .25;
    b *= a0 * fade;
    if (b < .02) continue;
    if (b > 1) b = 1;
    const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = cr * b, G_ = cg * b, B_ = cb * b;
    if (DD[q] < R_) DD[q] = R_; if (DD[q + 1] < G_) DD[q + 1] = G_; if (DD[q + 2] < B_) DD[q + 2] = B_;
  }
}

/* ---------------- the sea's dots ---------------- */
const SEAL = new Float64Array(3);
function drawSea(T, tau, fx) {
  const Fs = SEA.F, TL = SEA.TL, F_ = FL, under = UNDER;
  const nl = Math.min(NLT, 3);                                         // (the first five lights: the strongest of the moment)
  for (let t = 0; t < SEA.nt; t++) {
    const q = t * 6; if (!K.wIn(TL[q + 2], 0, TL[q + 4], TL[q + 5] + 10)) continue;
    const zt = Math.max(1, K.WZ[0]), dsp = 160 / Math.sqrt(TL[q + 1] - TL[q]) * F_ / zt;
    const s0 = 2.2 / Math.sqrt(K.DQ), sr = dsp >= s0 ? 1 : Math.min(60, s0 * s0 / (dsp * dsp)), kf = 1 / sr, lift = 1 + .3 * E.sat(sr - 1);
    const rf = 1 - E.ss(5000, 8800, Math.hypot(TL[q + 2], TL[q + 4]));
    for (let k = TL[q], k1 = TL[q + 1]; k < k1; k++) {
      if (kf < 1 && (k * .6180339887) % 1 > kf) continue;
      const j = k * 4, x = Fs[j], z = Fs[j + 1];
      const y = seaY(x, z, T + Fs[j + 3] * .02, tau) + .12 * Math.sin(Fs[j + 3] + T * 1.7);
      const dx = x - ex, dy = y - ey, dz = z - ez, zc = dx * f0 + dy * f1 + dz * f2; if (zc < 1) continue;
      const sx = CX + F_ * (dx * r0 + dy * r1 + dz * r2) / zc; if (sx < 0 || sx >= BW) continue;
      const sy = CY - F_ * (dx * u0 + dy * u1 + dz * u2) / zc; if (sy < 0 || sy >= BH) continue;
      let b = 1.6 * Fs[j + 2] * (zc < 3000 ? 1 - zc / 6500 : .54 + .5 * E.ss(3000, 9000, zc)) * rf * lift;
      let cr = 228, cg = 234, cb = 232;
      // foam / spray / burning from the effects (fx(x, z) -> adds), the lights
      if (fx) { const f = fx(x, z, y); if (f) { b += f[0]; if (f[1] > 0) { const kk = f[1]; cr += (255 - cr) * kk; cg += (170 - cg) * kk; cb += (110 - cb) * kk; } } }
      if (nl) {
        let wl = 0, wr = 0, wg = 0, wb = 0;
        for (let m = 0; m < nl; m++) { const o = m * 8, lx = LT[o] - x, ly = LT[o + 1] - y, lz = LT[o + 2] - z, r2_ = LT[o + 4] * LT[o + 4], I = LT[o + 3] * r2_ / (r2_ + lx * lx + ly * ly + lz * lz); wl += I; wr += I * LT[o + 5]; wg += I * LT[o + 6]; wb += I * LT[o + 7]; }
        if (wl > .003) { b += .55 * wl; const kk = Math.min(1, wl * 2); cr += (wr / wl - cr) * kk; cg += (wg / wl - cg) * kk; cb += (wb / wl - cb) * kk; }
      }
      if (under) b *= .45 * Math.exp(-zc / 60) + .08;
      b *= AMB;
      if (b < .02) continue; if (b > 1) b = 1;
      const qq = ((sy | 0) * BW + (sx | 0)) << 2, R_ = cr * b, G_ = cg * b, B_ = cb * b;
      if (DD[qq] < R_) DD[qq] = R_; if (DD[qq + 1] < G_) DD[qq + 1] = G_; if (DD[qq + 2] < B_) DD[qq + 2] = B_;
    }
  }
}

/* ---------------- the camera ---------------- */
const lookS = (e, g, fov, up) => ({ eye: e, target: g, fov: fov * DEG, up: up || [0, 1, 0] });
/* (duel: blended by eye position, look direction and log distance: a near and a far look do not swing the view) */
const slerpD = (a, b, w) => { const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), th = Math.acos(c); if (th < 1e-4) return V.norm(V.lerp(a, b, w)); if (th > Math.PI - 1e-3) return V.norm(V.lerp(a, b, w)); const s = Math.sin(th), ka = Math.sin((1 - w) * th) / s, kb = Math.sin(w * th) / s; return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]; };   // (the look turned at an even rate)
function mixS(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const eye = V.lerp(a.eye, b.eye, w), da = V.sub(a.target, a.eye), db = V.sub(b.target, b.eye), la = Math.max(1e-3, V.len(da)), lb = Math.max(1e-3, V.len(db));
  const d = slerpD(V.mul(da, 1 / la), V.mul(db, 1 / lb), w), L = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * w);
  return { eye, target: V.mad(eye, d, L), fov: a.fov + (b.fov - a.fov) * w, up: V.norm(V.lerp(a.up || [0, 1, 0], b.up || [0, 1, 0], w)) };
}
const rodNose = v => ptS(noseS(tauOf(v)));
/* the lens riding with the rod (rod frame offset), up = the world's */
function relShot(rel, v) {
  const p = V.sub(rodNose(v), V.mul(DIR, 9)), fromRel = q => V.add(V.add(V.mul(U2, q[0]), V.mul(W2, q[1])), V.mul(DIR, q[2]));
  const e = V.add(p, fromRel(rel.e)), f = fromRel(rel.f), u = fromRel(rel.u);
  return { eye: e, target: V.add(e, V.mul(f, 60)), fov: rel.fov, up: u };
}
const rodC = v => V.sub(rodNose(v), V.mul(DIR, 9));                 // the rod's centre
/* the side the orbital film's lens rides on at the hand-over (horizontal, from the rod) */
const HSIDE = (() => { const s = relShot(REL_H, .7), q = V.sub(s.eye, rodC(.7)); return V.norm([q[0], 0, q[2]]); })();
const CSIDE = 1;
function rideShot(v) {
  // level with the rod, 58 m off its track: the rod upright in the frame, the ladder beside it, the sea far below
  const p = rodC(v), dr = sm((v - .5) / 4);
  const e = V.add(p, V.add(V.mul(HSIDE, 58 - 6 * dr), [0, 1, 0])), g = V.add(p, [0, -1 - 2 * dr, 0]);
  return lookS(e, g, 40);
}
/* the rod's last seconds are watched from off the ship's starboard bow (the rod coming in from high on the bow side,
   the sketch's view: the bow on the right); then close on the hit for the passage, then the strike wide off the
   starboard beam for the magazine chain */
const E_I = [CSIDE * 150, 30, 46], G_I = [0, 22, 30];
const tipW = v => ptS(noseS(tauOf(v)));
function camShot(v) {
  if (v < .7) return relShot(theirRel(T_H + v), v);                 // (their lens, relative to their rod, carried onto ours)
  let s = relShot(REL_H, v);
  {
    // from their pose to the ride round the rod's axis (radius, angle, height interpolated: never through the rod)
    const w = sm((v - .7) / 3.4), r = rideShot(v), c = rodC(v);
    const split = e => { const q = V.sub(e, c), ax = V.dot(q, DIR), pr = V.sub(q, V.mul(DIR, ax)); return { ax, rad: V.len(pr), a: Math.atan2(V.dot(pr, W2), V.dot(pr, U2)) }; };
    const A_ = split(s.eye), B_ = split(r.eye); let da = B_.a - A_.a; da -= TAU * Math.round(da / TAU);
    const a = A_.a + da * w, rad = A_.rad + (B_.rad - A_.rad) * w, ax = A_.ax + (B_.ax - A_.ax) * w;
    const eye = V.add(c, V.add(V.mul(DIR, ax), V.add(V.mul(U2, Math.cos(a) * rad), V.mul(W2, Math.sin(a) * rad))));
    s = { eye, target: V.lerp(s.target, r.target, w), fov: s.fov + (r.fov - s.fov) * w, up: V.norm(V.lerp(s.up, r.up, w)) };
  }
  // the descent: the lens drops back from the ride into a chase behind and beside the rod (its pose relative to the
  // rod, so no whip while the rod is fast), the rod running ahead toward the ship below
  if (v > V_I - 6.6) s = mixS(s, chaseShot(v), ss(V_I - 6.6, V_I - 2.6, v));
  if (v > V_I - 2.4) s = mixS(s, passShot(v), ss(V_I - 2.4, V_I + .6, v));            // close on the hit: the passage
  if (v > V_PASS - .6) s = mixS(s, holdShot(v), ss(V_PASS - .6, V_CHAIN + 1.6, v));    // out to the strike wide: the chain
  if (v > V_DIVE) s = mixS(s, deepShot(v), ss(V_DIVE, V_DEEP, v));                     // the dive (5 s, eased both ends)
  if (v > V_END) s = mixS(s, cavShot(v), ss(V_END, V_END + 4.2, v));                  // back to the cavity
  if (v > V_CAV) s = mixS(s, riseShot(v), ss(V_CAV, V_UP + .4, v));                   // up through the cloud and the surface
  if (v > V_UP) s = mixS(s, wideShot(v), ss(V_UP, V_WIDE, v));                        // back and up: the column wide
  if (v > V_BOIL) s = mixS(s, boilShot(v), ss(V_BOIL, V_SINK, v));                    // in a little, lower: the boiling sea
  if (v > V_SINK - 1) s = mixS(s, sinkShot(v), ss(V_SINK - 1, V_SINK + 1.5, v));       // the push in on the sinking halves, the slick
  return s;
}
/* the chase: behind the rod along its path, out to the starboard side and above; looking ahead of it, down its path
   to the ship */
const CH_S = (() => { const q = V.norm(V.cross(DIR, [0, 1, 0])); return q[0] * CSIDE > 0 ? q : V.mul(q, -1); })();
const chaseShot = v => { const c = rodC(v), w = ss(V_I - 4, V_I - 1, v); return lookS(V.add(c, V.add(V.add(V.mul(DIR, -(46 - 10 * w)), V.mul(CH_S, 44 + 8 * w)), [0, 8, 0])), V.add(c, V.mul(DIR, 40 + 30 * w)), 44); };
/* the passage: 36 m off the starboard bow quarter, above the deck, looking down the rod's path into the hull (its
   near side cut away): the rod enters the deck, cuts down through the decks and out of the bottom */
const P_MID = ptS(S_SHIP * .45);
const passShot = v => { const u = ss(V_I - .3, V_PASS, v); return lookS(V.add(P_MID, [CSIDE * (30 + 3 * u), 15 - 1.5 * u, 9 - 2 * u]), V.add(P_MID, [0, .6 - 1.5 * u, -1.5 - 1 * u]), 44); };
/* the strike wide: 150 m off the starboard beam, the chain rippling toward the bow (a slow push) */
const holdShot = v => { const u = sm((v - V_CHAIN) / (V_DIVE - V_CHAIN + 1)); return lookS([CSIDE * (96 - 8 * u), 20 - 2 * u, 22 + 4 * u], [0, 5, 22 + 2 * u], 46); };
/* beside the rod under the sea, level with a point a little above its nose, the nose in the lower third; it tracks
   the nose (slowing), held where it ends */
const TIP_END = ptS(S_SHIP + DMAX);
function deepShot(v) {
  const tip = tipW(Math.max(v, V_I)), d = ss(V_DEEP, V_END, v);
  return lookS(V.add(tip, [CSIDE * (31 + 3 * d), 6, 8 + 2 * d]), V.add(tip, [0, 6 + .5 * d, 0]), 52);
}
/* back from the cavity's middle, the whole of it in view as it collapses and pinches off */
const CAV_MID = ptS(S_SHIP + DMAX * .5);
const cavShot = v => { const u = sm((v - V_END) / 6); return lookS(V.add(CAV_MID, [CSIDE * (64 + 10 * u), 2 + 2 * u, 12 + 4 * u]), CAV_MID, 52 + 10 * sm((v - V_END) / 2.4)); };
/* rising through the bubble cloud to the surface beside the wreck, looking at the column's foot */
const riseShot = v => { const u = ss(V_CAV, V_UP + .4, v); return lookS([CSIDE * (84 + 22 * u), -38 + 46 * u, -24], [0, -26 + 42 * u, -2], 62 - 8 * u); };
/* the column wide: 300 m off the starboard beam, low; then a slow drift as the column falls back */
const wideShot = v => { const u = sm((v - V_WIDE) / 5); return lookS([CSIDE * (292 - 12 * u), 30 - 2 * u, 20 - 6 * u], [0, 84 - 34 * u, 6], 50); };
/* the boiling sea: in to 210 m, lower */
const boilShot = v => { const u = sm((v - V_BOIL) / 6); return lookS([CSIDE * (206 - 6 * u), 22, 26], [0, 12 - 2 * u, 4], 46); };
/* the sinking: a slow push from 200 to 120 m off the beam, the bow standing up and sliding under, the stern after
   it; then the hold on the burning slick where she was */
const sinkShot = v => { const u = sm((v - V_SINK) / (V_SLICK + 1.4 - V_SINK)), h = sm((v - V_SLICK - 1) / 6); return lookS([CSIDE * (198 - 82 * u - 4 * h), 22 - 6 * u, 22 - 10 * u - 3 * h], [0, 10 - 5 * u - 3 * h, 2 - 6 * h], 46 - 2 * u); };
function applyCam(s) { C.eye = s.eye.slice(); C.target = s.target.slice(); C.fov = s.fov; C.roll = 0; C.up = s.up || [0, 1, 0]; C.shake = [0, 0]; C.near = .1; C.update(); C.up = [0, 1, 0]; }

/* ---------------- the frame ---------------- */
let FX = null;
const ro = document.getElementById('ro');
let roTxt = '';
const fmtRate = r => { if (r >= .95) { const v = r >= 20 ? Math.round(r / 10) * 10 : r >= 3 ? Math.round(r) : Math.round(r * 10) / 10; return 'x' + v; } const d = 1 / r, n = d > 60 ? Math.round(d / 10) * 10 : d > 12 ? Math.round(d / 2) * 2 : Math.round(d); return 'x1/' + n; };
const fmtClock = s => { const sg = s < 0 ? '−' : '+', a = Math.abs(s), a10 = Math.round(a * 10); return `T${sg}${String(Math.floor(a10 / 600)).padStart(2, '0')}:${((a10 % 600) / 10).toFixed(1).padStart(4, '0')}`; };
const CLK0 = D.simClock(T_H) - tauOf(0);                            // the shot's clock at the impact
const ctx = { K, C, V, R, X, E, rng, noise, ss, sm, HIT, DIR, TILT, SPATH, W_ENTRY, ROD_L, ROD_R, DMAX, TW, TAU_K, S_SHIP, Y_KEEL, L_KEEL,
  noseS, rodLen, rodSpeed, ptS, tauOf, rateOf, vOfTau, seaY, halfPose, shipPose, CHUNKS, chunkPos, SHIP, SB, U2: () => U2, W2: () => W2,
  dotC, dotW, cam, light, FIRE, EMB, HOT, WH, LIME, CORAL, DEEP, isUnder: () => UNDER, PIV, zbB, zbS, LOG, HP, PL, T_UNDER, halfGap, tabCut: () => TAB ? TAB.cut : 0, T_SEC, T_COOK_, zPath, xPath, holeR, R_FACE, BLASTS, VENTS, MOUNT_B, MOUNT_T, T_MAG, MAG_Z0, MAG_V, hullHW, T_BRK, brkG, CSIDE, V_PASS, V_CHAIN, V_I, V_HOLD, V_DIVE, V_DEEP, V_END, V_CAV, V_UP, V_WIDE, V_BOIL, V_SINK, V_SLICK, LEN };

function frame(v, opt) {
  v = E.clamp(v, -1, LEN);
  const tau = tauOf(v), T = 2000 + tau;                         // (the sea's own clock: whole sim seconds)
  K.beginTags();
  applyCam(window.STRIKE_SEADBG ? lookS(window.STRIKE_SEADBG.e, window.STRIKE_SEADBG.g, window.STRIKE_SEADBG.fov || 40) : camShot(v));
  K.pb.clear(); K.occReset(); cam();
  UNDER = C.eye[1] < seaY(C.eye[0], C.eye[2], T, tau) - .05;
  NLT = 0; AMB = 1;
  ORL.frame({ zref: Math.max(60, V.dist(C.eye, C.target)), PXF: 3.8, PXL: 1.6 }); ORL.G.occ = false;
  if (!FX && window.STRIKE_SEA_FX) FX = window.STRIKE_SEA_FX(ctx);
  // the lights this frame (the fx module adds the flash, fires, the rod's glow)
  if (FX) FX.lights(v, tau);
  // under the sea: the water's own faint light (the surface above, Snell's window lit by the fires)
  if (UNDER && FX) FX.wash(v, tau);
  // sky
  if (!UNDER) K.drawStars(STARS, .9, T, -.05);
  // the sea
  let pt = performance.now(); const tk = k => { if (!window.SSP) return; const t = performance.now(); PRF[k] = (PRF[k] || 0) + t - pt; pt = t; };
  drawSea(T, tau, FX ? FX.seaFx(v, tau) : null); tk('sea');
  // the ship: whole before the strike, then two halves and the debris (in the Duel the halves are the act-1 ship, drawn
  // by the host in its own look: SHIPH.draw)
  if (SHIPH) {
    NSH = 0;
    if (TAB) tabFrame(TAB, v, tau);
    if (v < V_I - 1.5 || !TAB) { shipPose(T, MX, TX); pushShip(MX, TX, 0, 0, 0); }
    else {
      // (from the cutaway on: the two halves, meeting on the path's plane until the hull parts round the hole)
      const kd = brkG(tau), eh = FX ? FX.edgeHeat(tau) : 0;
      if (tau < T_BRK) { if (tau < 0) shipPose(T, MX, TX); else halfPose(0, tau, MX, TX); pushShip(MX, TX, 2, 0, eh); }   // (one piece until it parts)
      else for (let g = 0; g < 2; g++) { halfPose(g, tau, MX, TX); pushShip(MX, TX, g ? -1 : 1, kd, eh); }
    }
    // (the act-1 ship as dense as in act 1's wides: the host's dot density raised for this pass; restored after)
    const SKK = window.SK, dq0 = SKK ? SKK.DQ : 0;
    { const de = Math.hypot(C.eye[0], C.eye[1] - 3, C.eye[2]); if (SKK) SKK.DQ = dq0 * (1 + (DQ_SHIP - 1) * ss(70, 100, de) * (1 - ss(150, 180, de))); }
    try { SHIPH.draw(SHL, NSH, { under: UNDER, lt: LT, nl: Math.min(NLT, 4), amb: AMB, tau }); } finally { if (SKK) SKK.DQ = dq0; } tk('ship');
    if (tau >= .0004) { if (FX) FX.chunkLook(tau); drawGroup(2, MX, TX, 1, null, tau); DEBH = 0; }
    tk('debris'); if (FX && tau > MOUNT_T) FX.mountThrown(tau); tk('mount');
  } else if (tau < .0004) {
    shipPose(T, MX, TX); KD = 0; EDGEH = 0;
    for (let g = 0; g < 3; g++) drawGroup(g, MX, TX, 1);
  } else {
    KD = Math.min(1, tau / .006); EDGEH = FX ? FX.edgeHeat(tau) : 0;
    for (let g = 0; g < 2; g++) { halfPose(g, tau, MX, TX); drawGroup(g, MX, TX, 1); }
    EDGEH = 0; KD = 0;
    if (FX) FX.chunkLook(tau);
    drawGroup(2, MX, TX, 1, null, tau); DEBH = 0;
  }
  if (FX) FX.draw(v, tau, T); tk('fx');
  // the overlay
  const octx = K.octx; octx.clearRect(0, 0, BW, BH);
  // (the flash: a light on everything and a bloom at the hit (the fx), the frame itself only lifted a little)
  const fl = FX ? Math.min(.14, .17 * FX.flashA(tau)) : 0;
  if (fl > .004) { octx.fillStyle = `rgba(244,246,236,${fl.toFixed(3)})`; octx.fillRect(0, 0, BW, BH); }
  if (FX) FX.tags(v, tau);
  readout(v, tau);
  if (opt && opt.mix) opt.mix(K.pb.d);
  K.pb.blit();
  K.endTags();
}
const PLATE_Y = [HIT[1], 2.2, -1.2, -4.4, Y_KEEL], PLATE_N = ['main deck', '2nd deck', '3rd deck', 'inner bottom', 'keel'];
/* (build 2) when the column's readout turns to 'falling back': once, when it has dropped 2 m below its peak */
let COLF = null;
function colFall() {
  if (COLF !== null || !FX) return COLF === null ? 1e9 : COLF;
  let hm = 0, tm = .7; for (let t = .7; t < 11; t += .01) { const h = FX.columnH(t); if (h > hm) { hm = h; tm = t; } }
  COLF = 11; for (let t = tm; t < 11; t += .005) if (FX.columnH(t) < hm - 2) { COLF = t; break; }
  return COLF;
}
function readout(v, tau) {
  let l1, l2;
  if (tau < 0) { const s = -noseS(tau), h = HIT[1] + s / SPATH; l1 = `Rod · altitude <b>${h > 9950 ? (h / 1000).toFixed(1) + ' km' : h > 995 ? (h / 1000).toFixed(2) + ' km' : Math.round(h) + ' m'}</b>`; l2 = `<b>${(rodSpeed(tau) / 1000).toFixed(2)} km/s</b> · ${h > 2000 ? 'entry' : 'terminal'}`; }
  else if (tau < TAU_K) { const n = ptS(noseS(tau)), k = PLATE_Y.reduce((m, y, i) => n[1] <= y + .01 ? i : m, 0); l1 = `Rod · <b>${(HIT[1] - n[1]).toFixed(1)} m</b> into the hull · <b>${(rodSpeed(tau) / 1000).toFixed(2)} km/s</b>`; l2 = `Cut · <b>${PLATE_N[k]}</b> · ${k + 1} of 5 plates`; }
  else if (tau < BLASTS[BLASTS.length - 1].t + .002 && v < V_DIVE + .5) { const k = BLASTS.reduce((m, B) => tau >= B.t ? m + 1 : m, 0), tw = tau - TAU_K; l1 = `Magazine · <b>${k} of ${BLASTS.length}</b> gone up`; l2 = `Rod · <b>${(wDepth(tw) / SPATH).toFixed(1)} m</b> down · <b>${(wSpeed(tw) / 1000).toFixed(2)} km/s</b>`; }
  else if (tau < TAU_K + TW + .002) { const tw = tau - TAU_K, d = wDepth(tw) / SPATH; l1 = `Rod · depth <b>${d.toFixed(1)} m</b> · <b>${(wSpeed(tw) / 1000).toFixed(2)} km/s</b>`; l2 = `Ablating · <b>${rodLen(tau).toFixed(1)} m</b> of 18 left`; }
  else if (tau < .25) { l1 = `Rod · <b>gone</b> at <b>${(DMAX / SPATH).toFixed(0)} m</b>`; l2 = 'Steam cavity · <b>collapsing</b>'; }
  else if (tau < .7) { l1 = `Cavity · <b>pinched off</b> at <b>${FX ? FX.pinchD().toFixed(0) : 32} m</b>`; l2 = 'Bubble cloud · <b>forming</b>'; }
  else if (tau < 11) { const h = FX ? FX.columnH(tau) : 0; l1 = `Column · <b>${h.toFixed(0)} m</b> · ${tau < colFall() ? 'rising' : 'falling back'}`; l2 = `Hull · <b>broken in two</b> · gap <b>${halfGap(tau).toFixed(0)} m</b>`; }
  else if (tau < 34 && FX && FX.cloudY(tau) < -1) { const c = FX.cloudY(tau); l1 = `Bubble cloud · centre <b>${(-c).toFixed(0)} m</b> down`; l2 = `Rising · <b>${FX.cloudV(tau).toFixed(1)} m/s</b> · surfacing`; }
  else {
    const M = MX, Tt = TX; halfPose(0, tau, M, Tt); const pb = Math.asin(M[7]) / DEG, fb = HP.far[0]; halfPose(1, tau, M, Tt); const ps = Math.asin(M[7]) / DEG, fs_ = HP.far[1];
    const st = (p, f, g) => f < -1 ? '<b>under</b>' : `<b>${Math.abs(p).toFixed(0)}°</b>`;
    l1 = `Bow section · ${st(pb, fb, 0)} · stern ${st(ps, fs_, 1)}`;
    l2 = fb < -1 && fs_ < -1 ? `Sunk · <b>${Math.floor(T_UNDER[1] / 60)} min ${String(Math.round(T_UNDER[1] % 60)).padStart(2, '0')} s</b> after the hit` : fb > 0 && tau > PL[0].t0 ? `Bow · <b>${fb.toFixed(0)} m</b> out of the water` : tau > PL[1].t0 && fs_ > 0 ? `Stern · <b>${fs_.toFixed(0)} m</b> out of the water` : `Flooding · settling <b>${(Y_KEEL + .4 - (TX[1] + MX[4] * PIV[1][1] + MX[5] * PIV[1][2])).toFixed(0)} m</b>`;
  }
  RO.l1 = l1; RO.l2 = l2; RO.clock = CLK0 + tau; RO.rate = rateOf(v);
  const l3 = `${fmtClock(CLK0 + tau)} · ${fmtRate(rateOf(v))}`;
  const h = `${l1}<br>${l2}<br>${l3}`;
  if (h !== roTxt) { roTxt = h; ro.innerHTML = h; }
}
lap('sea half built');
const RO = { l1: '', l2: '', clock: 0, rate: 1 };
/* the host's destroyer (the Duel: the act-1 ship and mount in their own look): SHIPH.draw(list, n, o), list[i] =
   { M, T (the half's pose), side (0 whole, 1 bow, -1 stern), kd (the lip flared), eh (the edge's heat) }; the break's
   torn surfaces and the blown-out superstructure handed over tabulated (SHIPH.tab) */
let SHIPH = null, NSH = 0, TAB = null; const PRF = {};
const DQ_SHIP = 1;                                                    // (1: the act-1 density as it is; >1 raises it in the 70-180 m wides)                                                 // (x the host's dot density for the destroyer)
const SHL = [0, 1].map(() => ({ M: new Float64Array(9), T: new Float64Array(3), side: 0, kd: 0, eh: 0 }));
function pushShip(M, T, side, kd, eh) { const s = SHL[NSH++]; s.M.set(M); s.T.set(T); s.side = side; s.kd = kd; s.eh = eh; }
function breakTab() {
  const x0 = -12, x1 = 12, y0 = -8, y1 = 46, st = .1, nx = Math.round((x1 - x0) / st), ny = Math.round((y1 - y0) / st);
  const zsp = new Float32Array(nx * ny), jb = new Float32Array(nx * ny), js = new Float32Array(nx * ny), bl = new Float32Array(nx * ny);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const x = x0 + (ix + .5) * st, y = y0 + (iy + .5) * st, k = iy * nx + ix, z0 = zSp(x, y);
    zsp[k] = z0; jb[k] = Math.max(.3, zbB(x, y) - z0); js[k] = Math.max(.3, z0 - zbS(x, y)); bl[k] = 12 + 3 * noise(x * .2, y * .2, 3.3);
  }
  // the vents of the chain (x y z r t0, by z)
  const vs = VENTS.slice().sort((a, b) => a.p[2] - b.p[2]), VT = new Float32Array(vs.length * 5);
  vs.forEach((vt, i) => { VT.set([vt.p[0], vt.p[1], vt.p[2], vt.r, vt.t0], i * 5); });
  // (per metre of z from VZ0: the first vent whose reach gets there; runXB walks on from it while they are near)
  const VZ0 = vs[0].p[2] - 12, NVZ = Math.ceil(vs[vs.length - 1].p[2] + 12 - VZ0), VZI = new Int16Array(NVZ + 1);
  for (let j = 0, q = 0; j <= NVZ; j++) { while (q < vs.length && vs[q].p[2] + vs[q].r + 2.5 < VZ0 + j) q++; VZI[j] = q; }
  // the foredeck peeled open by the chain (0.5 m bins in z from PZ0): the deck's height, the half-width there, when the
  // chain's front passes, how far each torn strip of plating folds up and out (rad; < 0: the strip blown away)
  const PZ0 = -6, NPZ = 150, PK = new Float32Array(NPZ * 4), rp = rng(4343);
  let strip = 0, ph = 0;
  for (let i = 0; i < NPZ; i++) {
    const z = PZ0 + (i + .5) * .5, dy = HD.destroyer.A.deckY(z);
    if (i % 5 === 0) { strip = rp(); ph = .7 + 1.9 * rp(); }
    const inZone = (z > MAG_Z0 + 2 && z < 15) || (z > 38 && z < 61);
    PK[i * 4] = dy; PK[i * 4 + 1] = hullHW(z, dy - .3); PK[i * 4 + 2] = T_MAG + Math.max(0, z - MAG_Z0) / MAG_V + .002;
    PK[i * 4 + 3] = !inZone ? 0 : strip < .12 ? -1 : ph * (1 - .5 * ss(56, 61, z));
  }
  // (build 2) the blasts' push on the plating (x y z t s, the passage first: the side plating round the hole bulged out
  // by the plasma), and the cracks the chain leaves: along the keel under the magazine band and up the sides at three
  // of the blasts (z, the time its front passes)
  const BLT = new Float32Array((BLASTS.length + 1) * 5);
  BLT.set([HIT[0], 1.5, zPath(1.5), .0003, 1.35], 0);
  BLASTS.forEach((B, i) => BLT.set([B.c[0], B.c[1], B.c[2], B.t, B.s], (i + 1) * 5));
  const CRK = new Float32Array([2, 4, 7].reduce((a, k) => a.concat([BLASTS[k].c[2] + 2.2, BLASTS[k].t + .0006]), []));
  return { x0, y0, inv: 1 / st, nx, ny, zsp, jb, js, bl, zc: zPath(7), BLT, nbl: BLASTS.length + 1, BLZ0: MAG_Z0 - 20, BLZ1: MAG_Z1 + 16, CRK, MZ0: MAG_Z0 - 2, MZ1: MAG_Z1 + 4,
    hp: [HIT[0], HIT[1], HIT[2], DIR[0], DIR[1], DIR[2]], hr: [5.4, 4.2, -2, 8.5], ky: Y_KEEL,
    VT, nv: vs.length, VZ0, NVZ, VZI, PK, PZ0, NPZ,
    on: false, tau: 0, sn: 0, hg: 0, heat: 0, g: 0, cut: 0, cs: 1, mountHide: 0 };
}
/* the tab's state this frame (the host's point pass reads it) */
function tabFrame(TB, v, tau) {
  TB.on = tau >= 0; TB.tau = tau; TB.sn = noseS(tau);
  TB.hg = Math.pow(E.sat(tau / .005), .6);                            // (the hole blown open over ~5 ms behind the nose)
  TB.heat = tau < 0 ? 0 : Math.min(1, tau / .0006) * (.4 + .6 * Math.exp(-tau / 2.5));
  TB.g = brkG(tau);
  TB.cut = ss(V_I - 1.2, V_I - .3, v) * (1 - ss(V_PASS - .4, V_CHAIN + .6, v));   // (the cutaway for the passage)
  TB.cs = CSIDE;
  TB.mountHide = tau > MOUNT_T ? 1 : 0;
}
/* the moments for the sound (v) */
const cueV = () => [['rod_impact', V_I], ['deck_breach', vOfTau(.0004)], ['magazine_chain', vOfTau(T_MAG)], ['secondary_blasts', vOfTau(BLASTS[BLASTS.length - 1].t)],
  ...BLASTS.map((B, i) => ['magazine_' + (i + 1), vOfTau(B.t)]),
  ['water_entry', vOfTau(TAU_K)], ['mount_thrown', vOfTau(MOUNT_T)], ['lens_under', V_LENS[0]], ['rod_gone', vOfTau(TAU_K + TW)], ['hull_break', vOfTau(T_BRK)],
  ['cavity_collapse', vOfTau(.25)], ['lens_up', V_LENS[1]], ['surface', V_UP], ['column_rise', vOfTau(.9)], ['mount_splash', vOfTau(MOUNT_T + MOUNT_FLIGHT)],
  ['bubbles_rise', V_BOIL + .6], ['cook_off', vOfTau(T_COOK_)], ['sinking', V_SINK + .6], ['bow_under', vOfTau(T_UNDER[0])], ['stern_under', vOfTau(T_UNDER[1])]];
/* the mount's flight: launched up at 38 m/s from ~9 m, into the sea (s) */
const MOUNT_FLIGHT = (38 + Math.sqrt(38 * 38 + 4 * 4.9 * 9)) / 9.8;
/* when the lens goes under and comes up (v) */
const V_LENS = (() => { const f = v => { const s = camShot(v); return s.eye[1] - seaY(s.eye[0], s.eye[2], 2000 + tauOf(v), tauOf(v)); }; const cross = (a, b) => { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if ((f(a) > 0) === (f(m) > 0)) a = m; else b = m; } return (a + b) / 2; }; return [cross(V_DIVE, V_DEEP), cross(V_CAV, V_UP + 1)]; })();
/* the subjects for the camera log (this world's frame) */
function poi() {
  const v = CUR_V, tau = tauOf(v), out = [];
  const nose = ptS(noseS(tau)), L = rodLen(tau);
  if (L > .1) out.push({ name: 'rod', p: V.sub(nose, V.mul(DIR, L / 2)), r: Math.max(1, L / 2) });
  if (tau < .0004) out.push({ name: 'destroyer', p: [0, 6, 0], r: 78 });
  else {
    const M = new Float64Array(9), T = new Float64Array(3);
    halfPose(0, tau, M, T); out.push({ name: 'bow half', p: [M[1] * 6 + M[2] * 40 + T[0], M[4] * 6 + M[5] * 40 + T[1], M[7] * 6 + M[8] * 40 + T[2]], r: 40 });
    halfPose(1, tau, M, T); out.push({ name: 'stern half', p: [M[1] * 6 - M[2] * 40 + T[0], M[4] * 6 - M[5] * 40 + T[1], M[7] * 6 - M[8] * 40 + T[2]], r: 40 });
    if (tau > TAU_K && tau < .4) out.push({ name: 'cavity', p: V.lerp(W_ENTRY, ptS(Math.min(noseS(tau), S_SHIP + DMAX)), .5), r: 12 + 30 * Math.min(1, tau / .1) });
  }
  return out;
}
let CUR_V = 0;

window.STRIKE_SEA = {
  PRF, len: LEN, V_I, frame: (v, opt) => { CUR_V = v; return frame(v, opt); }, tauOf, rateOf, LOG, ctx, fx: () => FX, camShot: v => camShot(v), RO, cueV, poi,
  setShip(h) { SHIPH = h; TAB = breakTab(); if (h && h.init) h.init({ tab: TAB, HIT, DIR }); },
  chapters: [{ t: V_I - 3.6, title: 'Terminal' }, { t: V_I - .1, title: 'Strike' }, { t: V_DIVE, title: 'Dive' }, { t: V_END - .5, title: 'Cavity' }, { t: V_UP, title: 'Surface' }, { t: V_BOIL + .6, title: 'Bubbles' }, { t: V_SINK + .6, title: 'Sink' }],
};
})();
