/* The fast damage model (prototype): a ship hit worked out by rules on a 0.25 m texel grid, in a few milliseconds of
   CPU, instead of solving the plating as a shell FE model on the GPU (../shell). No time stepping: every texel's final
   state and its timing are computed once, then any moment is a pure function of the time since the hit (runner.js).

   The rules (game approximations of public figures; tuned by eye and against the shell solver's torn areas):
     load      the charge's reflected impulse at each texel (Kinney-Graham, ../phys.js) and, for a charge inside, the
               quasi-static gas pressure of its space; a plate nearer the charge stands in the way (intact: 3 % gets
               through, torn: half)
     dish      d = KD * i * LC / (h * sqrt(rho * sy)) (the Nurick-Martin form) for the shock, plus the gas taken as a
               membrane between frames, GKD * p * LC^2 / (8 sy h); smoothed over ~0.5 m, eased to nothing at the patch's
               edges. Drawn VIS x deeper, peaked (PK: the dish as (d / max)^PK) and buckled into folds (FOLD, FOLDL): the picture only
     tear      stretched: d past LT * sqrt(3 ef / 8) (the membrane strain of a dish over the span reaching the steel's
               failure strain); punched: plating thrown faster than VCRIT (the shock's impulse / (rho h)); both
               modulated round the hit (petals: 4-6 lobes) and by a seeded 1 m noise (weak spots)
     gone      a texel punched past GONE x VCRIT is thrown off as debris; the rest of a tear are flaps
               hinged at the tear's outer edge, bent the blast's way (more for more load, curling at the tips)
     fragments a seeded fan of casing fragments: rays with a penetration budget (mm of steel) that falls with distance;
               each plate they cross takes a pock (a hole when they get through, a dent when not)

   Input (flat, so the Rust port in rs/ is a transcription): P = Float64Array(nP * PN) plates, each
     [ax, val, u0, u1, v0, v1, h (m), sy (Pa), rho, ef, skin (0/1), _]   (axis-aligned in the patch frame; ax -> ua, va)
   and C = [cx, cy, cz, W (kg TNT), Wgas, V (m^3 of its space), seed, S (grid m)].
   Output: per plate (nodes (nu + 1) x (nv + 1), node (i, j) at u0 + i S, v0 + j S):
     D   Float32Array(3 n)  final displacement (patch frame; dish + flap)    TA  arrival (s)     TR  rise (s)
     Q   Float32Array(n)    load over the tear threshold (>= 1 torn)         FL  Uint8 1 torn, 2 gone, 16 pock
     SO  Float32Array(n)    soot 0..1                                        V   debris speed (m/s, gone texels)
     FA  Float32Array(n)    flap angle (rad)  FLn flap length (m)            HX  hinge radius (m) */
import { kinneyIs, kinneyPs, reflect, arrival, qsp, fireR } from '../phys.js';

export const PN = 12;
export const AX = [[2, 1], [0, 2], [0, 1]];
export const K = { KD: .8, LC: 2.4, GKD: .5, LT: 3, VCRIT: 150, GONE: 2.2, GAS_REACH: 2, SHIELD: .03, HOLE: .5, PETAL: .22, NOISE: .16, BLUR: 2, NFRAG: 160, PEN0: 22, PEN_L: 30, VIS: 4.5, FOLD: .35, FOLDL: 1.3, KB: 3, BUCKL: 1.6, BUCKE: 4, PK: 2 };

const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
function hash(a, b, s) { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
/* a seeded stream for the fragments */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function solveCore(P, C, k = K) {
  const nP = P.length / PN, S = C[7], W = Math.max(.01, C[3]), W13 = Math.cbrt(W), seed = C[6] | 0;
  const cx = C[0], cy = C[1], cz = C[2], Cv = [cx, cy, cz];
  const Wg = W + C[4], pq = C[4] > 0 || cz < 0 ? qsp(Wg, Math.max(20, C[5] || 200)) : 0;   // gas: a charge inside (z < 0)
  const fr = fireR(Wg), rc = Math.cbrt(3 * W / (4 * Math.PI * 1600));
  const out = [];
  // the plates nearest the charge first (a plate stands in the way of those behind it only once it is worked out)
  const order = [];
  for (let p = 0; p < nP; p++) {
    const o = p * PN, ax = P[o], [ua, va] = AX[ax];
    const du = Math.max(0, P[o + 2] - Cv[ua], Cv[ua] - P[o + 3]), dv = Math.max(0, P[o + 4] - Cv[va], Cv[va] - P[o + 5]), dn = P[o + 1] - Cv[ax];
    order.push([Math.hypot(du, dv, dn), p]);
  }
  order.sort((a, b) => a[0] - b[0]);
  const plates = new Array(nP);
  const torn = (L, q) => {   // is plate L torn at the patch-frame point q (its nearest node)?
    const i = Math.round((q[L.ua] - L.u0) / S), j = Math.round((q[L.va] - L.v0) / S);
    if (i < 0 || j < 0 || i > L.nu || j > L.nv) return -1;
    return L.FL[j * (L.nu + 1) + i] & 3 ? 1 : 0;
  };
  const p3 = [0, 0, 0], q3 = [0, 0, 0];
  for (const [, p] of order) {
    const o = p * PN, ax = P[o], val = P[o + 1], [ua, va] = AX[ax], h = Math.max(.002, P[o + 6]), sy = P[o + 7], rho = P[o + 8], ef = P[o + 9];
    const u0 = Math.round(P[o + 2] / S) * S, v0 = Math.round(P[o + 4] / S) * S;
    const nu = Math.max(1, Math.round((P[o + 3] - u0) / S)), nv = Math.max(1, Math.round((P[o + 5] - v0) / S)), W1 = nu + 1, n = W1 * (nv + 1);
    const L = { p, ax, val, ua, va, u0, v0, nu, nv, h, S, skin: P[o + 10] > .5, D: new Float32Array(3 * n), TA: new Float32Array(n), TR: new Float32Array(n), Q: new Float32Array(n),
      FL: new Uint8Array(n), SO: new Float32Array(n), V: new Float32Array(n), FA: new Float32Array(n), FLn: new Float32Array(n), HX: new Float32Array(n), DN: new Float32Array(n), sgn: 0, cu: 0, cv: 0 };
    plates[p] = L;
    const sgn = val >= Cv[ax] ? 1 : -1, imp = Math.sqrt(rho * sy), dTear = k.LT * Math.sqrt(3 * ef / 8), vTear = k.VCRIT * (ef / .2), gasR = k.GAS_REACH * Math.cbrt(Wg);
    L.sgn = sgn; L.cu = Cv[ua]; L.cv = Cv[va];
    const cu = Cv[ua], cv = Cv[va], NPET = 4 + (seed >>> 3) % 3, ph = hash(p, 7, seed) * 6.283;
    const dI = new Float32Array(n), vI = new Float32Array(n);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const m = j * W1 + i;
      p3[ax] = val; p3[ua] = u0 + i * S; p3[va] = v0 + j * S;
      const dx = p3[0] - cx, dy = p3[1] - cy, dz = p3[2] - cz, R = Math.max(rc + .05, Math.hypot(dx, dy, dz)), cth = Math.abs(p3[ax] - Cv[ax]) / R;
      // what stands between: the plates already worked out
      let f = 1;
      for (let q = 0; q < nP; q++) {
        const B = plates[q]; if (!B || B === L) continue;
        const a = B.ax, den = p3[a] - Cv[a]; if (Math.abs(den) < 1e-6) continue;
        const t = (B.val - Cv[a]) / den; if (t <= .02 || t >= .98) continue;
        q3[0] = cx + dx * t; q3[1] = cy + dy * t; q3[2] = cz + dz * t;
        const tr = torn(B, q3); if (tr < 0) continue;
        f *= tr ? k.HOLE : k.SHIELD;
      }
      const Z = Math.max(.06, R / W13), Ps = kinneyPs(Z), rr = Ps > 1 ? reflect(Ps) / Ps : 2;
      const ir = kinneyIs(Z, W) * (1 + (Math.pow(rr, .7) - 1) * cth * cth) * f;
      // the gas of its space (not behind intact steel): a quasi-static pressure the plating takes as a membrane between
      // its frames, d = p LC^2 / (8 sy h)
      const ig = pq > 0 && f > .2 ? pq * sat(1.3 - R / gasR) : 0;
      dI[m] = k.KD * ir * k.LC / (h * imp) + k.GKD * ig * k.LC * k.LC / (8 * sy * h);
      vI[m] = ir / (rho * h);
      L.TA[m] = arrival(R, W);
      L.TR[m] = .004 + .012 * Math.min(3, dI[m] / dTear) + (ig > 0 ? .015 : 0);
      L.SO[m] = f > .2 ? .95 * Math.pow(sat(1 - R / fr), .7) : 0;
    }
    blur(dI, W1, nv + 1, k.BLUR); blur(dI, W1, nv + 1, k.BLUR);
    // tear: the load over the threshold, with the petals round the hit and the steel's weak spots
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const m = j * W1 + i, u = u0 + i * S - cu, v = v0 + j * S - cv, th = Math.atan2(v, u);
      const mod = 1 + k.PETAL * Math.cos(NPET * th + ph) * sat(Math.hypot(u, v) / 1.5) + k.NOISE * (vnoise(u * 1.1 + 31 * p, v * 1.1, seed) * 2 - 1);
      // stretched past its failure strain (a dish deeper than dTear over the frame span), or punched (plating thrown
      // faster than vTear: the charge close in)
      const qm = dI[m] / dTear, qv = vI[m] / vTear, q = Math.max(qm, qv) / mod;
      L.Q[m] = q;
      if (q >= 1) L.FL[m] = qv / mod >= k.GONE ? 2 | 1 : 1;
    }
    // flaps: hinged at the tear's outer edge, in 64 bins round the hit
    const NB = 64, RE = new Float32Array(NB);
    for (let m = 0; m < n; m++) if (L.FL[m] & 1) { const i = m % W1, j = (m / W1) | 0, u = u0 + i * S - cu, v = v0 + j * S - cv, b = ((Math.atan2(v, u) / 6.2832 + 1) * NB | 0) % NB, r = Math.hypot(u, v); if (r > RE[b]) RE[b] = r; }
    let Lmax = 1e-3; for (let b = 0; b < NB; b++) Lmax = Math.max(Lmax, RE[b]);
    // edges eased: the patch's border is held by the hull beyond it
    const E = 1.5;
    let dMax = 1e-6; for (let m = 0; m < n; m++) if (dI[m] > dMax) dMax = dI[m];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const m = j * W1 + i, u = u0 + i * S - cu, v = v0 + j * S - cv, r = Math.hypot(u, v), ux = r > 1e-4 ? u / r : 0, vx = r > 1e-4 ? v / r : 0;
      const eb = ease(i * S / E) * ease((nu - i) * S / E) * ease(j * S / E) * ease((nv - j) * S / E);
      // (drawn: the dish VIS x deeper than the tear rule's, buckled into folds across the plate: the picture, not the tear)
      const d0 = Math.min(2.5, k.VIS * dMax * Math.pow(dI[m] / dMax, k.PK)) * eb, fo = 1 + k.FOLD * sat(d0 / .15) * Math.sin(6.2832 * (u + .35 * v) / k.FOLDL + 3 * vnoise(u * .4, v * .4, seed + 11));
      const dn = Math.min(2.5, d0 * fo);
      const o3 = 3 * m;
      L.DN[m] = dn;
      L.D[o3 + ax] = sgn * dn;
      L.D[o3 + ua] = -ux * dn * .12; L.D[o3 + va] = -vx * dn * .12;   // the plating drawn in toward the dish
      if ((L.FL[m] & 3) === 1) {
        const b = ((Math.atan2(v, u) / 6.2832 + 1) * NB | 0) % NB, Lf = Math.max(0, RE[b] - r);
        const a = Math.min(2.4, (.35 + .55 * Math.log(Math.max(1, L.Q[m]))) * (1 + .7 * Lf / Lmax));
        L.FA[m] = a; L.FLn[m] = Lf; L.HX[m] = RE[b];
        L.D[o3 + ax] = sgn * (Lf * Math.sin(a) + dn * .3);
        L.D[o3 + ua] = ux * Lf * (1 - Math.cos(a)); L.D[o3 + va] = vx * Lf * (1 - Math.cos(a));
      }
      if (L.FL[m] & 2) L.V[m] = Math.min(150, 20 + .5 * vI[m]);
    }
    out.push(L);
  }
  buckle(plates, k, seed);
  frags(plates, P, Cv, W, seed, S, k);
  return { plates, W, Wg, pq, fr };
}

function ease(x) { x = sat(x); return x * x * (3 - 2 * x); }
/* the plates that meet the struck one (a deck over a side, a bulkhead behind it): where its plating bulges, their edge goes
   with it and they buckle in waves along the joint, dying away over BUCKE m (the picture: not the tear rule) */
function buckle(plates, k, seed) {
  const A = plates[0]; if (!A) return;
  const WA = A.nu + 1, q = [0, 0, 0];
  for (const B of plates) {
    if (!B || B === A || B.ax === A.ax) continue;
    const ea = A.ax === B.ua ? 0 : A.ax === B.va ? 1 : -1; if (ea < 0) continue;   // (B's axis across the joint)
    const along = B.ua === A.ax ? B.va : B.ua, W1 = B.nu + 1, ph = hash(B.p, 13, seed) * 6.283;
    for (let j = 0; j <= B.nv; j++) for (let i = 0; i <= B.nu; i++) {
      const m = j * W1 + i;
      if (B.FL[m] & 1) continue;
      q[B.ax] = B.val; q[B.ua] = B.u0 + i * B.S; q[B.va] = B.v0 + j * B.S;
      const e = Math.abs(q[A.ax] - A.val); if (e > 3 * k.BUCKE) continue;
      // (A's plating where B meets it, read 1.5 m in from A's border: the border itself is eased to nothing)
      let ia = Math.round((q[A.ua] - A.u0) / A.S), ja = Math.round((q[A.va] - A.v0) / A.S);
      if (ia < -2 || ja < -2 || ia > A.nu + 2 || ja > A.nv + 2) continue;
      const eg = Math.round(1.5 / A.S); ia = Math.max(eg, Math.min(A.nu - eg, ia)); ja = Math.max(eg, Math.min(A.nv - eg, ja));
      const ma = ja * WA + ia, dA = A.DN[ma]; if (!(dA > .02)) continue;
      const w = Math.exp(-e / k.BUCKE), b = k.KB * dA * w * Math.sin(6.2832 * q[along] / k.BUCKL + ph + 2 * vnoise(q[along] * .3, e * .3, seed + 29));
      const o3 = 3 * m;
      B.D[o3 + B.ax] += b; B.D[o3 + A.ax] += A.sgn * dA * Math.exp(-e / 1.2);
      B.DN[m] = Math.min(2.5, B.DN[m] + Math.abs(b));
      if (A.TA[ma] < B.TA[m]) { B.TA[m] = A.TA[ma]; B.TR[m] = Math.max(B.TR[m], A.TR[ma]); }
    }
  }
}
function blur(A, w, h, r) {
  const T = new Float32Array(A.length);
  for (let j = 0; j < h; j++) { let s = 0, c = 0; const o = j * w;
    for (let i = -r; i < w + r; i++) { if (i + r < w) { s += A[o + i + r]; c++; } if (i - r - 1 >= 0) { s -= A[o + i - r - 1]; c--; } if (i >= 0 && i < w) T[o + i] = s / c; } }
  for (let i = 0; i < w; i++) { let s = 0, c = 0;
    for (let j = -r; j < h + r; j++) { if (j + r < h) { s += T[(j + r) * w + i]; c++; } if (j - r - 1 >= 0) { s -= T[(j - r - 1) * w + i]; c--; } if (j >= 0 && j < h) A[j * w + i] = s / c; } }
}

/* the casing's fragments: NFRAG seeded rays from the charge, each with PEN0 mm of steel to spend, falling off over PEN_L m;
   a plate it reaches takes a pock (through: a small hole, else a dent) */
function frags(plates, P, C, W, seed, S, k) {
  const r = rng(seed ^ 0x5bd1e995), N = Math.round(k.NFRAG * Math.min(2, Math.max(.4, Math.cbrt(W / 50))));
  for (let f = 0; f < N; f++) {
    const z = r() * 2 - 1, a = r() * 6.2832, s = Math.sqrt(1 - z * z), d = [s * Math.cos(a), s * Math.sin(a), z];
    let pen = k.PEN0 * (.6 + .8 * r()), x = C.slice(), travelled = 0;
    for (let hop = 0; hop < 5 && pen > 0; hop++) {
      let best = null, bt = 1e9;
      for (const L of plates) { if (!L) continue; const den = d[L.ax]; if (Math.abs(den) < 1e-6) continue; const t = (L.val - x[L.ax]) / den; if (t <= .01 || t >= bt) continue;
        const qu = x[L.ua] + d[L.ua] * t, qv = x[L.va] + d[L.va] * t, i = Math.round((qu - L.u0) / S), j = Math.round((qv - L.v0) / S);
        if (i < 1 || j < 1 || i >= L.nu || j >= L.nv) continue; bt = t; best = [L, i, j]; }
      if (!best) break;
      const [L, i, j] = best, m = j * (L.nu + 1) + i;
      travelled += bt; for (let q = 0; q < 3; q++) x[q] += d[q] * bt;
      if (L.FL[m] & 3) continue;                     // through a hole already there
      const left = pen * Math.exp(-travelled / k.PEN_L), hm = L.h * 1000;
      L.FL[m] |= 16; L.SO[m] = Math.max(L.SO[m], .6);
      if (left > hm) { L.FL[m] |= 1; L.Q[m] = Math.max(L.Q[m], 1); L.TA[m] = Math.min(L.TA[m], travelled / 1500); pen -= hm * 1.5; }
      else { const o3 = 3 * m; L.D[o3 + L.ax] += (L.val >= C[L.ax] ? 1 : -1) * .03; break; }
    }
  }
}
