/* A structural patch: the bench's plate model (game/concepts/blast/blast.js build + detonate) for any set of
   axis-aligned plates in a local frame. No DOM, no GL.

   buildPatch(spec) -> P   the lattice: nodes, bonds, cells, frames and ties, plastic bending, tear-out speeds, which
                           gas space lies on each side of every node and cell, fixed edges
   loadPatch(P, ch)        the charge (or the burning contents): shock pressure, impulse duration, arrival and direction
                           per node, line of sight, soot, the gas sources, the time to run, the predicted crack starts
   gasStep(P, h)           orifice flow between the spaces through what has torn open

   spec = {
     S,                                  grid (m; 0.125)
     plates: [{ ax, val, u0, u1, v0, v1, h (m), mat ('hsla'|'mild'|'alu'), fu, pu, fv, pv (frame / stiffener spacing and
               phase along u / v, m; 0: none), heavy, light (their extra section, m^2), tie (x the bench's tie
               stiffness), skin (a surface of the model: its dots follow this plate) }]
                                         ax: 0 x, 1 y, 2 z (the plate's normal, +); in-plane axes (u, v): ax 2 -> (x, y),
                                         ax 1 -> (x, z), ax 0 -> (z, y). Coordinates are snapped to the grid.
     box: [x0, y0, z0, x1, y1, z1],      the patch; its faces are fixed to the rest of the ship unless a plate lies in one
     comps: [{ b: [x0, y0, z0, x1, y1, z1], V }]   the gas spaces (local boxes, V m^3); anything else is outside
   }
   Plate p's grid node (i, j) sits at u = u0 + i S, v = v0 + j S. Up to 6 plates, 7 spaces. */
import { MATS, MAT_I, MAT_L, TEAR_K, EF_MESH, V_CRACK, kinneyPs, kinneyIs, reflect, arrival, qsp, fireR, chargeR } from './phys.js';

export const MAXPL = 6, MAXC = 7;
export const AXES = [[2, 1], [0, 2], [0, 1]];     // ax -> [ua, va]

let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export function buildPatch(spec) {
  const S = spec.S, SL = S / .25;
  const sn = v => Math.round(v / S) * S;
  const pos = [], mass = [], area = [], nrm = [], surf = [], tk = [], tfy = [], frm = [], rh = [], vc = [], nmat = [];
  const key = new Map();
  const sa = [], sb = [], sk = [], sfy = [], sef = [], sl = [], skey = new Map();
  const cells = [], csurf = [], cellSprings = [];
  const PL = [];
  const node = (x, y, z, sid, n, mi) => {
    const k = ((Math.round(x / S) + 4096) * 8192 + (Math.round(y / S) + 4096)) * 8192 + (Math.round(z / S) + 4096);
    let i = key.get(k);
    if (i === undefined) {
      i = pos.length / 3; key.set(k, i);
      pos.push(x, y, z); mass.push(0); area.push(0); nrm.push(n[0], n[1], n[2]); surf.push(sid); tk.push(0); tfy.push(0); frm.push(0); rh.push(0); vc.push(0); nmat.push(mi);
    }
    return i;
  };
  const spring = (a, b, A, m) => {
    const k2 = a < b ? a * 1048576 + b : b * 1048576 + a;
    const L = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
    let s = skey.get(k2);
    if (s !== undefined) { sk[s] += m.E * A / L; sfy[s] += m.sy * A; return s; }   // a welded seam: both plates add up
    s = sa.length; skey.set(k2, s);
    sa.push(a); sb.push(b); sl.push(L); sk.push(m.E * A / L); sfy.push(m.sy * A); sef.push(m.ef * EF_MESH);
    return s;
  };
  const bk = (a, b) => skey.get(a < b ? a * 1048576 + b : b * 1048576 + a);
  const onLine = (c, f, ph) => f > 0 && Math.abs((c - ph) / f - Math.round((c - ph) / f)) * f < S * .5;
  spec.plates.slice(0, MAXPL).forEach((pl, sid) => {
    const ax = pl.ax, [ua, va] = AXES[ax], m = MATS[pl.mat] || MATS.mild, mi = MAT_I[pl.mat] !== undefined ? MAT_I[pl.mat] : 1;
    const val = sn(pl.val), u0 = sn(pl.u0), v0 = sn(pl.v0), nu = Math.max(1, Math.round((sn(pl.u1) - u0) / S)), nv = Math.max(1, Math.round((sn(pl.v1) - v0) / S));
    const n = [0, 0, 0]; n[ax] = 1;
    const h = pl.h, heavy = pl.heavy || 0, light = pl.light || 0, tie = pl.tie || 1;
    const at = [];
    PL[sid] = { ax, val, ua, va, u0, v0, nu, nv, off: csurf.length, at, skin: !!pl.skin, h, mat: pl.mat };
    const fuL = [], fvL = [];
    for (let i = 0; i <= nu; i++) fuL.push(onLine(u0 + i * S, pl.fu || 0, pl.pu || 0));
    for (let j = 0; j <= nv; j++) fvL.push(onLine(v0 + j * S, pl.fv || 0, pl.pv || 0));
    const c = [0, 0, 0];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      c[ax] = val; c[ua] = u0 + i * S; c[va] = v0 + j * S;
      const id = node(c[0], c[1], c[2], sid, n, mi);
      at.push(id); mass[id] += m.rho * h * S * S; area[id] += S * S;
      if (m.rho * h > rh[id]) { rh[id] = m.rho * h; vc[id] = Math.sqrt(2 * TEAR_K * m.sy * m.ef / m.rho); }
      if (fuL[i]) { mass[id] += 7850 * heavy * S; tk[id] = Math.max(tk[id], 6e7 * SL * tie); tfy[id] = Math.max(tfy[id], 16e3 * SL * tie); frm[id] = 2; }
      else if (fvL[j]) { mass[id] += 7850 * light * S; tk[id] = Math.max(tk[id], 3e7 * SL * tie); tfy[id] = Math.max(tfy[id], 5e3 * SL * tie); frm[id] = Math.max(frm[id], 1); }
    }
    const I = (i, j) => at[j * (nu + 1) + i];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      if (i < nu) spring(I(i, j), I(i + 1, j), h * S * .75 + (fvL[j] ? light : 0), m);
      if (j < nv) spring(I(i, j), I(i, j + 1), h * S * .75 + (fuL[i] ? heavy : 0), m);
      if (i < nu && j < nv) {
        const a = I(i, j), b = I(i + 1, j), cc = I(i + 1, j + 1), d = I(i, j + 1);
        const s1 = spring(a, cc, h * S * .35, m), s2 = spring(b, d, h * S * .35, m);
        cells.push(a, b, cc, d); csurf.push(sid);
        cellSprings.push([bk(a, b), bk(b, cc), bk(cc, d), bk(a, d), s1, s2]);
      }
    }
  });
  const nP = PL.length, N = pos.length / 3;
  const P = { S, PL, nP, N, spec };
  P.X = new Float64Array(pos); P.R0 = new Float64Array(pos); P.V = new Float64Array(3 * N); P.IMP = new Float64Array(N);
  P.M = new Float64Array(mass); P.AREA = new Float64Array(area); P.NRM = new Float32Array(nrm); P.SURF = new Int8Array(surf);
  P.TK = new Float64Array(tk); P.TFY = new Float64Array(tfy); P.TAN = new Float64Array(pos); P.FRM = new Uint8Array(frm);
  P.NMAT = new Uint8Array(nmat);
  P.FIX = new Uint8Array(N); P.LINKS = new Int16Array(N); P.FREE = new Uint8Array(N); P.TBRK = new Float32Array(N).fill(-1);
  P.SOOT = new Float32Array(N); P.DISC = new Uint8Array(N);
  // fixed: nodes on a face of the box no plate lies in (the edges held by the rest of the ship)
  const B = spec.box, e = S * .25;
  const faceFree = [0, 1, 2, 3, 4, 5].map(f => PL.some(p => p.ax === f % 3 && Math.abs(p.val - B[f]) < e));
  const X = P.X;
  for (let i = 0; i < N; i++) for (let f = 0; f < 6; f++) {
    if (faceFree[f]) continue;
    const c = X[3 * i + f % 3];
    if (f < 3 ? c <= B[f] + e : c >= B[f] - e) { P.FIX[i] = 1; break; }
  }
  const NS = P.NS = sa.length;
  P.SA = new Int32Array(sa); P.SB = new Int32Array(sb); P.SL0 = new Float64Array(sl); P.SLP = new Float64Array(sl);
  P.SK = new Float64Array(sk); P.SFY = new Float64Array(sfy); P.SEF = new Float64Array(sef); P.SC = new Float64Array(NS); P.SBRK = new Uint8Array(NS);
  const { SA, SB, SK, SL0, M, LINKS } = P;
  for (let s = 0; s < NS; s++) { LINKS[SA[s]]++; LINKS[SB[s]]++; }
  for (let s = 0; s < NS; s++) P.SC[s] = .12 * 2 * Math.sqrt(SK[s] * Math.min(M[SA[s]], M[SB[s]]));   // bond damping, 12 % of critical
  const NADJ = P.NADJ = new Int32Array(N + 1); for (let i = 0; i < N; i++) NADJ[i + 1] = NADJ[i] + LINKS[i];
  const ADJ = P.ADJ = new Int32Array(NADJ[N]); const fill = Int32Array.from(NADJ.subarray(0, N));
  for (let s = 0; s < NS; s++) { ADJ[fill[SA[s]]++] = s; ADJ[fill[SB[s]]++] = s; }
  P.RH = new Float64Array(rh);
  // plate bending (umbrella operator on the in-plane neighbours of the same plate), capped at the plastic moment
  const UNB = P.UNB = new Int32Array(N + 1), un = [];
  for (let i = 0; i < N; i++) {
    for (let k = NADJ[i]; k < NADJ[i + 1]; k++) { const q = ADJ[k]; if (Math.abs(SL0[q] - S) > 1e-6) continue;
      const j = SA[q] === i ? SB[q] : SA[q]; if (P.SURF[j] === P.SURF[i]) un.push(q); }
    UNB[i + 1] = un.length;
  }
  P.UN = new Int32Array(un); P.UB = new Float64Array(3 * N); P.KB = new Float64Array(N); P.KBC = new Float64Array(N); P.KBY = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const n = UNB[i + 1] - UNB[i]; if (n < 2 || P.FIX[i]) continue;
    let mx = 0, my = 0, mz = 0;
    for (let k = UNB[i]; k < UNB[i + 1]; k++) { const q = P.UN[k], j = SA[q] === i ? SB[q] : SA[q]; mx += X[3 * j]; my += X[3 * j + 1]; mz += X[3 * j + 2]; }
    P.UB[3 * i] = mx / n - X[3 * i]; P.UB[3 * i + 1] = my / n - X[3 * i + 1]; P.UB[3 * i + 2] = mz / n - X[3 * i + 2];
    const m = MAT_L[P.NMAT[i]], hh = P.RH[i] / m.rho;
    const D = m.E * hh * hh * hh / 10.9;
    P.KB[i] = 48 * D / (S * S); P.KBY[i] = 4 * m.sy * hh * hh; P.KBC[i] = .5 * Math.sqrt(P.KB[i] * M[i]);
  }
  P.VC = new Float64Array(vc);
  for (let i = 0; i < N; i++) if (P.FRM[i] === 2) P.VC[i] *= 1.8; else if (P.FRM[i] === 1) P.VC[i] *= 1.25;   // stiffened lines hold longer
  P.CBOND = Int32Array.from(cellSprings.flat());
  const NC = P.NC = csurf.length; P.CN = new Int32Array(cells); P.CSURF = new Int8Array(csurf); P.CTORN = new Uint8Array(NC);
  // the gas spaces
  const comps = (spec.comps || []).slice(0, MAXC), nC = P.nC = comps.length;
  P.comps = comps;
  P.GV = new Float64Array(nC + 1); comps.forEach((c, k) => { P.GV[k] = c.V; }); P.GV[nC] = Infinity;
  const comp = P.comp = (x, y, z) => { for (let k = 0; k < nC; k++) { const b = comps[k].b; if (x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5]) return k; } return nC; };
  P.NSP = new Int8Array(N); P.NSN = new Int8Array(N); P.LOSF = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const ee = .02, x = X[3 * i], y = X[3 * i + 1], z = X[3 * i + 2], nx = P.NRM[3 * i] * ee, ny = P.NRM[3 * i + 1] * ee, nz = P.NRM[3 * i + 2] * ee;
    P.NSP[i] = comp(x + nx, y + ny, z + nz); P.NSN[i] = comp(x - nx, y - ny, z - nz); }
  P.CSP = new Int8Array(NC); P.CSN = new Int8Array(NC);
  for (let c = 0; c < NC; c++) { const a = P.CN[4 * c], cc = P.CN[4 * c + 2], ee = .02;
    const x = (X[3 * a] + X[3 * cc]) / 2, y = (X[3 * a + 1] + X[3 * cc + 1]) / 2, z = (X[3 * a + 2] + X[3 * cc + 2]) / 2;
    const nx = P.NRM[3 * a] * ee, ny = P.NRM[3 * a + 1] * ee, nz = P.NRM[3 * a + 2] * ee;
    P.CSP[c] = comp(x + nx, y + ny, z + nz); P.CSN[c] = comp(x - nx, y - ny, z - nz); }
  P.SCELL = new Int32Array(NS * 4).fill(-1);
  cellSprings.forEach((list, c) => list.forEach(s => { for (let q = 0; q < 4; q++) if (P.SCELL[4 * s + q] < 0) { P.SCELL[4 * s + q] = c; break; } }));
  // stable explicit step: the stiffest spring against the lighter of its nodes
  let w2 = 0;
  for (let s = 0; s < NS; s++) w2 = Math.max(w2, 4 * SK[s] / Math.min(M[SA[s]], M[SB[s]]));
  P.dt = .9 / Math.sqrt(w2);
  let K = 0; for (let i = 0; i < N; i++) K = Math.max(K, NADJ[i + 1] - NADJ[i]);
  P.K = K;
  P.GP = new Float64Array(nC + 1); P.OPEN = new Float64Array((nC + 1) * (nC + 1));
  P.WINV = new Float64Array(N); for (let i = 0; i < N; i++) if (!P.FIX[i]) P.WINV[i] = 1 / M[i];
  return P;
}

/* ------------------------------------------------------------ geometry queries */
/* distance to the first intact cell a ray from A along unit D meets within len (any plate but skip); Infinity if none */
export function firstHit(P, Ax, Ay, Az, Dx, Dy, Dz, len, skip) {
  let best = Infinity; const S = P.S;
  for (let p = 0; p < P.nP; p++) {
    if (p === skip) continue;
    const L = P.PL[p], a = (L.ax === 0 ? Ax : L.ax === 1 ? Ay : Az) - L.val, d = L.ax === 0 ? Dx : L.ax === 1 ? Dy : Dz;
    if (d > -1e-9 && d < 1e-9) continue;
    const t = -a / d; if (t <= 1e-4 || t >= len || t >= best) continue;
    const u = (L.ua === 0 ? Ax + Dx * t : L.ua === 1 ? Ay + Dy * t : Az + Dz * t) - L.u0;
    const v = (L.va === 0 ? Ax + Dx * t : L.va === 1 ? Ay + Dy * t : Az + Dz * t) - L.v0;
    const i = Math.floor(u / S), j = Math.floor(v / S);
    if (i < 0 || j < 0 || i >= L.nu || j >= L.nv) continue;
    if (!P.CTORN[L.off + j * L.nu + i]) best = t;
  }
  return best;
}
function visible(P, i, C) {
  const X = P.X, dx = X[3 * i] - C[0], dy = X[3 * i + 1] - C[1], dz = X[3 * i + 2] - C[2], R = Math.hypot(dx, dy, dz);
  if (R < 1e-6) return true;
  return firstHit(P, C[0], C[1], C[2], dx / R, dy / R, dz / R, R - .03, P.SURF[i]) === Infinity;
}

/* ------------------------------------------------------------ the charge */
/* ch = { C: [x, y, z] local, W (kg TNT that detonates), Wgas (kg TNT-eq of burning propellant / fill), vapour (kg of fuel
   vapour that deflagrates), inside } */
export function loadPatch(P, ch) {
  const N = P.N, X = P.X, NRM = P.NRM, FIX = P.FIX;
  const W = Math.max(0, ch.W || 0), Wgas = Math.max(0, ch.Wgas || 0), W3 = Math.cbrt(Math.max(W, .01)), rc = chargeR(W), C = ch.C;
  const cc = P.comp(C[0], C[1], C[2]);
  const PR = new Float32Array(N), TA = new Float32Array(N), TD = new Float32Array(N), DIR = new Float32Array(3 * N);
  const fr = W > 0 ? fireR(W) : fireR(Math.max(Wgas, 1)) * .8;
  for (let i = 0; i < N; i++) {
    if (FIX[i]) continue;
    const dx = X[3 * i] - C[0], dy = X[3 * i + 1] - C[1], dz = X[3 * i + 2] - C[2], R = Math.max(Math.hypot(dx, dy, dz), rc);
    const nx = NRM[3 * i], ny = NRM[3 * i + 1], nz = NRM[3 * i + 2], dot = nx * dx + ny * dy + nz * dz, sg = dot >= 0 ? 1 : -1;
    DIR[3 * i] = nx * sg; DIR[3 * i + 1] = ny * sg; DIR[3 * i + 2] = nz * sg;       // pushed away from the charge
    P.SOOT[i] = Math.max(P.SOOT[i], Math.max(0, 1 - R / (1.25 * fr)));
    if (W <= 0) continue;
    const Z = Math.max(R / W3, .053);
    const Ps = kinneyPs(Z), Pr = reflect(Ps), is = kinneyIs(Z, W), ir = is * Math.pow(Pr / Ps, .75);
    const c = Math.abs(dot) / R, c2 = c * c;
    const Pp = Ps + (Pr - Ps) * c2, I = is + (ir - is) * c2;
    PR[i] = Pp; TD[i] = 2 * I / Pp; TA[i] = arrival(R, W);
  }
  // gas sources in the struck space
  const srcs = [];
  if (cc < P.nC) {
    const V = P.GV[cc];
    if (W > 0) srcs.push({ c: cc, Pq: qsp(W, V), kind: 'det', tau: .002, F: 0 });
    if (Wgas > 0) srcs.push({ c: cc, Pq: qsp(Wgas, V), kind: 'burn', tau: .12, F: 0 });
    if (ch.vapour > 0) srcs.push({ c: cc, Pq: .8e6 * Math.min(1, ch.vapour / (V * 1.2 / 15)), kind: 'burn', tau: .06, F: 0 });
  }
  const slow = srcs.length > 0;
  const s = { t: 0, n: 0, W, Wgas, C, cc, rc, PR, TA, TD, DIR, srcs, slow, msc: 1,
    T1: slow ? .4 : .03 + .012 * W3, tFast: .02 + .006 * W3, tLoad: W > 0 ? .004 + .004 * W3 : 0, cracks: new Array(P.nP).fill(null), fr };
  P.sim = s;
  P.GP.fill(0);
  for (let i = 0; i < N; i++) P.LOSF[i] = !FIX[i] && W > 0 && visible(P, i, C) ? 1 : 0;
  // the fire lights only what it can see (or the walls of its own space)
  for (let i = 0; i < N; i++) if (!P.LOSF[i] && !(cc < P.nC && (P.NSP[i] === cc || P.NSN[i] === cc))) P.SOOT[i] *= .15;
  let tl = 0; for (let i = 0; i < N; i++) if (P.LOSF[i]) tl = Math.max(tl, TA[i] + TD[i]);
  s.tLoad = Math.max(s.tLoad, Math.min(tl, .02 + .004 * W3));
  // tear-outs on plates the charge sees directly happen within the pulse: when the running impulse
  // PR (tau - tau^2 / 2 TD) reaches rho h v_c. The first one starts that plate's cracks; the rim is the farthest.
  if (W > 0) {
    const first = new Array(P.nP).fill(-1), ft = new Array(P.nP).fill(1e9);
    const dt0 = new Float64Array(N).fill(-1);
    for (let i = 0; i < N; i++) { if (!P.LOSF[i]) continue;
      const thr = P.RH[i] * P.VC[i], full = PR[i] * TD[i] / 2; if (full <= thr) continue;
      const tau = TD[i] * (1 - Math.sqrt(Math.max(0, 1 - 2 * thr / (PR[i] * TD[i])))), ti = TA[i] + tau;
      dt0[i] = ti; const p = P.SURF[i]; if (ti < ft[p]) { ft[p] = ti; first[p] = i; } }
    for (let p = 0; p < P.nP; p++) if (first[p] >= 0) {
      crackStart(P, first[p], ft[p]);
      for (let i = 0; i < N; i++) if (dt0[i] >= 0 && P.SURF[i] === p) crackStart(P, i, dt0[i]);
    }
  }
  return s;
}

function crackStart(P, i, t) {
  const p = P.SURF[i], L = P.PL[p], s = P.sim, R0 = P.R0;
  let cr = s.cracks[p];
  const u = R0[3 * i + L.ua], v = R0[3 * i + L.va];
  if (!cr) {
    // 4-7 radial cracks from the first hole
    seed = 11 + p * 7 + Math.round(s.W * 3);
    const nCr = 4 + Math.floor(rnd() * 4), th0 = rnd() * 6.28, lines = [];
    for (let c = 0; c < nCr; c++) lines.push({ th: th0 + c * 6.2832 / nCr + (rnd() - .5) * .5, lf: 1.4 + rnd() * .9 });
    cr = s.cracks[p] = { p, u, v, t0: t, rb: 0, lines };
  }
  cr.rb = Math.max(cr.rb, Math.hypot(u - cr.u, v - cr.v) + P.S * .5);
}

/* the gas: each space a lumped volume; the flow through the torn area between two is orifice flow of hot gas */
export function gasStep(P, h) {
  const n = P.nC + 1, OPEN = P.OPEN, GP = P.GP, GV = P.GV, P0 = 101325;
  for (let a = 0; a < n - 1; a++) for (let b = a + 1; b < n; b++) {
    const A = OPEN[a * n + b]; if (A <= 0) continue;
    const dp = GP[a] - GP[b]; if (dp > -1 && dp < 1) continue;
    const hi = dp > 0 ? a : b, lo = dp > 0 ? b : a, ad = Math.abs(dp);
    const Pabs = GP[hi] + P0, rho = 1.2 * Pabs / P0 * .2;
    const Q = .6 * A * Math.sqrt(2 * ad / rho);
    let dP = Pabs * Q * h / GV[hi];
    const cap = lo < n - 1 ? ad * GV[lo] / (GV[hi] + GV[lo]) : ad;
    if (dP > cap) dP = cap;
    GP[hi] -= dP; if (lo < n - 1) GP[lo] += dP * GV[hi] / GV[lo];
  }
}
/* sources at time t: their pressure added so far */
export function sources(P, t) {
  for (const q of P.sim.srcs) {
    const Fn = q.kind === 'det' ? Math.min(1, t / q.tau) : 1 - Math.exp(-t / q.tau);
    P.GP[q.c] += q.Pq * (Fn - q.F); q.F = Fn;
  }
}
/* cells newly found torn (from the GPU): vents between the spaces either side */
export function tearCells(P, cl, t) {
  const n = P.nC + 1, S2 = P.S * P.S;
  let any = 0;
  for (let c = 0; c < P.NC; c++) if (cl[c] && !P.CTORN[c]) {
    P.CTORN[c] = 1; any++;
    const pp = P.CSP[c], m = P.CSN[c]; P.OPEN[pp * n + m] += S2; P.OPEN[m * n + pp] += S2;
    for (let k = 0; k < 4; k++) { const i = P.CN[4 * c + k]; if (P.TBRK[i] < 0) P.TBRK[i] = t; }
  }
  return any;
}
export { V_CRACK };
