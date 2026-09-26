/* Blast test: a charge, a magazine or a fuel tank going off in a 24 m section of a destroyer, standalone
   (not part of the game).

   Load, in time as it happens (nothing is decided up front):
   - shock: Kinney-Graham free-air overpressure and impulse, Rankine-Hugoniot reflection, oblique incidence
     by cos^2, triangular pulse, arrival time from the shock Mach number, Hopkinson cube-root scaling. A plate
     only feels it where the charge can see it: rays stop at intact plating and pass through holes as they tear.
   - gas: four compartments and the outside as lumped volumes. A detonation or burning contents raise the
     quasi-static pressure of their compartment (~2.25 MPa (W/V)^0.72); the gas flows through whatever has torn
     open (orifice flow of hot products) into the next compartment or out, and pushes on both faces of every plate.
   - contents: warhead fill as TNT-eq; rocket propellant burns (not detonates) and counts ~0.25 TNT-eq for gas;
     fuel vapour burns as a deflagration capped near 0.8 MPa for a stoichiometric closed volume.
   Structure: plating as a 0.25 m lattice calibrated from the plate (k = E A / L, yield sy A, fracture at a
   mesh-scale strain), elastic-perfectly-plastic, compression capped low (thin plate buckles), plastic bending
   (umbrella operator capped at the plastic moment), frames and longitudinals as extra section plus ties.
   A patch tears out when the shock's impulse beats its tearing work (1/2 rho h v^2 > k sy ef h); cracks then run
   from the first hole at ~600 m/s through plating that is being pulled open (petals). Plates can't pass through
   each other (contact with momentum exchange). Explicit steps at the plate's stable step, mass-scaled x16 once
   only the slow gas load is left. Checked against the Nurick-Martin fit for blast-loaded plates (on screen). */

const { createGPU } = await import('./gpu.js?v=' + Date.now());
const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { antialias: false, alpha: false });
const $ = id => document.getElementById(id);

/* ------------------------------------------------------------------ constants */
let S = 0.25; const P0 = 101325, G = 9.81;
const XA = -12, XZ = 12, YB = -2, YI = 3.5, YD = 7, ZI = -6, XBH = 6;
let FRAME = 10, LONG = 3;                   // in cells: frames every 2.5 m, longitudinals every 0.75 m
let TEAR_K = .06, EF_MESH = .6;
const V_CRACK = 600;                        // m/s, a running crack in ship steel (well under the ~3 km/s limit)             // tuning: share of the tearing work, mesh-scale fracture strain factor
const MATS = {
  hsla: { rho: 7850, E: 207e9, sy: 550e6, ef: .16 },
  mild: { rho: 7850, E: 200e9, sy: 235e6, ef: .20 },
  alu:  { rho: 2660, E: 70e9,  sy: 228e6, ef: .10 },
};
// explosive fill as TNT equivalent (approximate public figures)
const ROUNDS = [
  ['30 mm HE', .05], ['76 mm HE', .75], ['127 mm HE', 3.2], ['Hellfire', 5], ['SM-6 · blast-frag', 30],
  ['Kh-35', 65], ['Harpoon', 100], ['P-800 Oniks', 120], ['Kalibr · Tomahawk', 200], ['Mk 84 bomb', 500],
];

const st = { diff: .5, msc: 64, grid: .125, solver: 'gpu', hs: 100, iters: 1, patch: false, spd: 0, src: 'charge', round: 7, kg: 120, fuze: 'contact', standoff: 3, mat: 'hsla', h: 10, view: 0, post: 1,
  aim: [0, 2.2, 0], aimN: [0, 0, 1] };

/* ------------------------------------------------------------------ small rng */
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/* ------------------------------------------------------------------ structure */
let UB, UN, UNB, KB, KBC, KBY, SC, RH, IMP, VC, NADJ, ADJ, DISC, N, X, V, F, M, R0, AREA, NRM, SURF, FIX, TK, TFY, TAN, LINKS, FREE, TBRK, SOOT, EPS, FRM;
let NS, SA, SB, SL0, SLP, SK, SFY, SEF, SBRK, SCELL;
let CBOND, NC, CN, CSURF, CTORN, CU, CV2, DOTS_PER, NSP, NSN, CSP, CSN, LOSF;
const PL = [], GP = new Float64Array(5), OPEN = new Float64Array(25);
// compartments: 0 lower fwd, 1 lower aft (past the bulkhead), 2 upper fwd, 3 upper aft, 4 outside
const comp = (x, y, z) => (z > 0 || y > YD || y < YB || z < ZI || x < XA || x > XZ) ? 4 : (y < YI ? 0 : 2) + (x > XBH ? 1 : 0);
const GV = [(XBH - XA) * (YI - YB) * -ZI, (XZ - XBH) * (YI - YB) * -ZI, (XBH - XA) * (YD - YI) * -ZI, (XZ - XBH) * (YD - YI) * -ZI, Infinity];
let dt = 2e-5;

function build() {
  S = st.grid; FRAME = Math.round(2.5 / S); LONG = Math.round(.75 / S); const DK = Math.round(1 / S), SL = S / .25;
  const mt = MATS[st.mat];
  const pos = [], mass = [], area = [], nrm = [], surf = [], tk = [], tfy = [], frm = [], rh = [], vc = [];
  const key = new Map();
  const sa = [], sb = [], sk = [], sfy = [], sef = [], sl = [], skey = new Map();
  const cells = [], csurf = [], cellSprings = [];
  const node = (x, y, z, sid, n) => {
    const k = Math.round(x * 100) + ',' + Math.round(y * 100) + ',' + Math.round(z * 100);
    let i = key.get(k);
    if (i === undefined) {
      i = pos.length / 3; key.set(k, i);
      pos.push(x, y, z); mass.push(0); area.push(0); nrm.push(n[0], n[1], n[2]); surf.push(sid); tk.push(0); tfy.push(0); frm.push(0); rh.push(0); vc.push(0);
    }
    return i;
  };
  const spring = (a, b, A, m) => {
    const k2 = a < b ? a + '_' + b : b + '_' + a;
    const L = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
    let s = skey.get(k2);
    if (s !== undefined) { sk[s] += m.E * A / L; sfy[s] += m.sy * A; return s; }   // a welded seam: both plates add up
    s = sa.length; skey.set(k2, s);
    sa.push(a); sb.push(b); sl.push(L); sk.push(m.E * A / L); sfy.push(m.sy * A); sef.push(m.ef * EF_MESH);
    return s;
  };
  // a plate: origin o, unit steps u (i) and v (j), nu x nv cells, thickness h; frames on i % fu, stiffeners on j % fv
  const plate = (sid, o, u, v, nu, nv, h, n, m, fu, fv, heavy, light) => {
    const ax = n[0] ? 0 : n[1] ? 1 : 2, ua = u[0] ? 0 : u[1] ? 1 : 2, va = v[0] ? 0 : v[1] ? 1 : 2;
    const at = [];
    PL[sid] = { ax, val: o[ax], ua, va, u0: o[ua], v0: o[va], nu, nv, off: csurf.length, at };
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const x = o[0] + (u[0] * i + v[0] * j) * S, y = o[1] + (u[1] * i + v[1] * j) * S, z = o[2] + (u[2] * i + v[2] * j) * S;
      const id = node(x, y, z, sid, n);
      at.push(id); mass[id] += m.rho * h * S * S; area[id] += S * S;
      if (m.rho * h > rh[id]) { rh[id] = m.rho * h; vc[id] = Math.sqrt(2 * TEAR_K * m.sy * m.ef / m.rho); }
      if (fu && i % fu === 0) { mass[id] += 7850 * heavy * S; tk[id] = Math.max(tk[id], 6e7 * SL); tfy[id] = Math.max(tfy[id], 16e3 * SL); frm[id] = 2; }
      else if (fv && j % fv === 0) { mass[id] += 7850 * light * S; tk[id] = Math.max(tk[id], 3e7 * SL); tfy[id] = Math.max(tfy[id], 5e3 * SL); frm[id] = Math.max(frm[id], 1); }
    }
    const I = (i, j) => at[j * (nu + 1) + i];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      if (i < nu) spring(I(i, j), I(i + 1, j), h * S * .75 + (fv && j % fv === 0 ? light : 0), m);
      if (j < nv) spring(I(i, j), I(i, j + 1), h * S * .75 + (fu && i % fu === 0 ? heavy : 0), m);
      if (i < nu && j < nv) {
        const a = I(i, j), b = I(i + 1, j), c = I(i + 1, j + 1), d = I(i, j + 1);
        const s1 = spring(a, c, h * S * .35, m), s2 = spring(b, d, h * S * .35, m);
        cells.push(a, b, c, d); csurf.push(sid);
        cellSprings.push([skey.get(a < b ? a + '_' + b : b + '_' + a), skey.get(b < c ? b + '_' + c : c + '_' + b),
          skey.get(c < d ? c + '_' + d : d + '_' + c), skey.get(a < d ? a + '_' + d : d + '_' + a), s1, s2]);
      }
    }
  };
  const side = { ...mt }, inner = MATS.mild;
  const hs = st.h / 1000;
  // 0 hull side (z = 0, outward +z), 1 weather deck (y = 7), 2 second deck (y = 3.5), 3 transverse bulkhead (x = 6)
  plate(0, [XA, YB, 0], [1, 0, 0], [0, 1, 0], (XZ - XA) / S, (YD - YB) / S, hs, [0, 0, 1], side, FRAME, LONG, 30e-4, 12e-4);
  plate(1, [XA, YD, ZI], [1, 0, 0], [0, 0, 1], (XZ - XA) / S, -ZI / S, .0095, [0, 1, 0], inner, FRAME, DK, 30e-4, 10e-4);
  plate(2, [XA, YI, ZI], [1, 0, 0], [0, 0, 1], (XZ - XA) / S, -ZI / S, .0065, [0, 1, 0], inner, FRAME, DK, 20e-4, 8e-4);
  plate(3, [XBH, YB, ZI], [0, 0, 1], [0, 1, 0], -ZI / S, (YD - YB) / S, .0065, [1, 0, 0], inner, 0, DK, 0, 8e-4);

  N = pos.length / 3;
  X = new Float64Array(pos); R0 = new Float64Array(pos); V = new Float64Array(3 * N); F = new Float64Array(3 * N); IMP = new Float64Array(N);
  M = new Float64Array(mass); AREA = new Float64Array(area); NRM = new Float32Array(nrm); SURF = new Int8Array(surf);
  TK = new Float64Array(tk); TFY = new Float64Array(tfy); TAN = new Float64Array(pos); FRM = new Uint8Array(frm);
  FIX = new Uint8Array(N); LINKS = new Int16Array(N); FREE = new Uint8Array(N); TBRK = new Float32Array(N).fill(-1);
  SOOT = new Float32Array(N); EPS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = X[3 * i], y = X[3 * i + 1], z = X[3 * i + 2];
    if (x <= XA + 1e-3 || x >= XZ - 1e-3 || y <= YB + 1e-3 || z <= ZI + 1e-3) FIX[i] = 1;
  }
  NS = sa.length;
  SA = new Int32Array(sa); SB = new Int32Array(sb); SL0 = new Float64Array(sl); SLP = new Float64Array(sl);
  SK = new Float64Array(sk); SFY = new Float64Array(sfy); SEF = new Float64Array(sef); SC = new Float64Array(sa.length); SBRK = new Uint8Array(NS);
  for (let s = 0; s < NS; s++) { LINKS[SA[s]]++; LINKS[SB[s]]++; }
  for (let s = 0; s < NS; s++) SC[s] = .12 * 2 * Math.sqrt(SK[s] * Math.min(mass[SA[s]], mass[SB[s]]));   // bond damping, 12 % of critical
  NADJ = new Int32Array(N + 1); for (let i = 0; i < N; i++) NADJ[i + 1] = NADJ[i] + LINKS[i];
  ADJ = new Int32Array(NADJ[N]); const fill = Int32Array.from(NADJ.subarray(0, N));
  for (let s = 0; s < NS; s++) { ADJ[fill[SA[s]]++] = s; ADJ[fill[SB[s]]++] = s; }
  DISC = new Uint8Array(N); RH = new Float64Array(rh);
  // plate bending (umbrella operator on the in-plane neighbours of the same plate): stiffness ~ 16 D / S^2 with
  // D = E h^3 / 12 (1 - nu^2), capped at the plastic moment (a hinge forms and keeps its set); it stops the
  // checkerboard modes a membrane lattice has no stiffness against
  UNB = new Int32Array(N + 1); const un = [];
  for (let i = 0; i < N; i++) {
    for (let k = NADJ[i]; k < NADJ[i + 1]; k++) { const q = ADJ[k]; if (Math.abs(SL0[q] - S) > 1e-6) continue;
      const j = SA[q] === i ? SB[q] : SA[q]; if (SURF[j] === SURF[i]) un.push(q); }
    UNB[i + 1] = un.length;
  }
  UN = new Int32Array(un); UB = new Float64Array(3 * N); KB = new Float64Array(N); KBC = new Float64Array(N); KBY = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const n = UNB[i + 1] - UNB[i]; if (n < 2 || FIX[i]) continue;
    let mx = 0, my = 0, mz = 0;
    for (let k = UNB[i]; k < UNB[i + 1]; k++) { const q = UN[k], j = SA[q] === i ? SB[q] : SA[q]; mx += X[3 * j]; my += X[3 * j + 1]; mz += X[3 * j + 2]; }
    UB[3 * i] = mx / n - X[3 * i]; UB[3 * i + 1] = my / n - X[3 * i + 1]; UB[3 * i + 2] = mz / n - X[3 * i + 2];
    const hh = RH[i] / (SURF[i] === 0 ? MATS[st.mat].rho : 7850), m = SURF[i] === 0 ? MATS[st.mat] : MATS.mild;
    const D = m.E * hh * hh * hh / 10.9;
    KB[i] = 48 * D / (S * S); KBY[i] = 4 * m.sy * hh * hh; KBC[i] = .5 * Math.sqrt(KB[i] * M[i]);
  }
  // local rupture ("discing"): a patch driven past the speed at which its kinetic energy exceeds the plate's
  // tearing work, 1/2 rho h v^2 > k sy ef h, tears out of the plate; v_c = sqrt(2 k sy ef / rho)
  VC = new Float64Array(vc);
  for (let i = 0; i < N; i++) if (FRM[i] === 2) VC[i] *= 1.8; else if (FRM[i] === 1) VC[i] *= 1.25;   // stiffened lines hold longer
  CBOND = Int32Array.from(cellSprings.flat());
  NC = csurf.length; CN = new Int32Array(cells); CSURF = new Int8Array(csurf); CTORN = new Uint8Array(NC);
  // which space lies on each side of every node and cell (+normal side, -normal side)
  NSP = new Int8Array(N); NSN = new Int8Array(N); LOSF = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const e = .02, x = X[3 * i], y = X[3 * i + 1], z = X[3 * i + 2], nx = NRM[3 * i] * e, ny = NRM[3 * i + 1] * e, nz = NRM[3 * i + 2] * e;
    NSP[i] = comp(x + nx, y + ny, z + nz); NSN[i] = comp(x - nx, y - ny, z - nz); }
  CSP = new Int8Array(NC); CSN = new Int8Array(NC);
  for (let c = 0; c < NC; c++) { const a = CN[4 * c], cc = CN[4 * c + 2], e = .02;
    const x = (X[3 * a] + X[3 * cc]) / 2, y = (X[3 * a + 1] + X[3 * cc + 1]) / 2, z = (X[3 * a + 2] + X[3 * cc + 2]) / 2;
    const nx = NRM[3 * a] * e, ny = NRM[3 * a + 1] * e, nz = NRM[3 * a + 2] * e;
    CSP[c] = comp(x + nx, y + ny, z + nz); CSN[c] = comp(x - nx, y - ny, z - nz); }
  SCELL = new Int32Array(NS * 4).fill(-1);
  cellSprings.forEach((list, c) => list.forEach(s => { for (let q = 0; q < 4; q++) if (SCELL[4 * s + q] < 0) { SCELL[4 * s + q] = c; break; } }));
  // stable explicit step: the stiffest spring against the lighter of its nodes
  let w2 = 0;
  for (let s = 0; s < NS; s++) w2 = Math.max(w2, 4 * SK[s] / Math.min(M[SA[s]], M[SB[s]]));
  dt = .9 / Math.sqrt(w2);
  // render dots: a fixed pattern per cell (u, v in 0..1), density by surface
  DOTS_PER = [18, 12, 8, 8].map(d => Math.max(2, Math.round(d * (S / .25) ** 2)));
  let nd = 0; for (let c = 0; c < NC; c++) nd += DOTS_PER[CSURF[c]];
  CU = new Float32Array(nd); CV2 = new Float32Array(nd);
  seed = 7; for (let k = 0; k < nd; k++) { CU[k] = rnd(); CV2[k] = rnd(); }
  sim = null; bufDirty = true; gpu = null;
}

/* ------------------------------------------------------------------ blast load */
const kinneyPs = Z => { const a = Z / 4.5, b = Z / .048, c = Z / .32, d = Z / 1.35;
  return P0 * 808 * (1 + a * a) / Math.sqrt((1 + b * b) * (1 + c * c) * (1 + d * d)); };
const kinneyIs = (Z, W) => .067 * Math.sqrt(1 + Math.pow(Z / .23, 4)) / (Z * Z * Math.cbrt(1 + Math.pow(Z / 1.55, 3))) * 100 * Math.cbrt(W);   // Pa s
const reflect = Ps => 2 * Ps * (7 * P0 + 4 * Ps) / (7 * P0 + Ps);
// shock arrival for 1 kg: integrate dR / U(R), U = c0 sqrt(1 + 6 Ps / 7 P0)
const TA1 = new Float32Array(2001);            // Z from 0 to 40 in steps of .02
(() => { let t = 0; for (let k = 1; k <= 2000; k++) { const Z = k * .02; const U = 340 * Math.sqrt(1 + 6 * kinneyPs(Math.max(Z, .053)) / (7 * P0)); t += .02 / U; TA1[k] = t; } })();
const arrival = (R, W) => { const Z = R / Math.cbrt(W), k = Math.min(1999, Z / .02); const i = Math.floor(k); return Math.cbrt(W) * (TA1[i] + (TA1[i + 1] - TA1[i]) * (k - i)); };
// quasi-static gas pressure of a charge (or its TNT equivalent) in a closed volume
const qsp = (W, V) => 2.25e6 * Math.pow(W / V, .72);

/* ------------------------------------------------------------------ geometry queries */
// distance to the first intact cell a ray from A along unit D meets within len (any plate but skip); Infinity if none
function firstHit(Ax, Ay, Az, Dx, Dy, Dz, len, skip) {
  let best = Infinity;
  for (let p = 0; p < 4; p++) {
    if (p === skip) continue;
    const P = PL[p], a = (P.ax === 0 ? Ax : P.ax === 1 ? Ay : Az) - P.val, d = P.ax === 0 ? Dx : P.ax === 1 ? Dy : Dz;
    if (d > -1e-9 && d < 1e-9) continue;
    const t = -a / d; if (t <= 1e-4 || t >= len || t >= best) continue;
    const u = (P.ua === 0 ? Ax + Dx * t : P.ua === 1 ? Ay + Dy * t : Az + Dz * t) - P.u0;
    const v = (P.va === 0 ? Ax + Dx * t : P.va === 1 ? Ay + Dy * t : Az + Dz * t) - P.v0;
    const i = Math.floor(u / S), j = Math.floor(v / S);
    if (i < 0 || j < 0 || i >= P.nu || j >= P.nv) continue;
    if (!CTORN[P.off + j * P.nu + i]) best = t;
  }
  return best;
}
function visible(i, C) {
  const dx = X[3 * i] - C[0], dy = X[3 * i + 1] - C[1], dz = X[3 * i + 2] - C[2], R = Math.hypot(dx, dy, dz);
  if (R < 1e-6) return true;
  return firstHit(C[0], C[1], C[2], dx / R, dy / R, dz / R, R - .03, SURF[i]) === Infinity;
}

/* ------------------------------------------------------------------ sources */
// explosive fill as TNT equivalent; rocket propellant that burns (does not detonate) counts ~0.25 TNT-eq for the
// gas it makes; fuel vapour burns as a deflagration capped at ~0.8 MPa for a stoichiometric closed volume
const CONTENTS = {
  charge: null,
  vls_burn: { label: 'Missile cells ×8 · motors burn', cells: 8, he: 60, prop: 450, det: false },
  vls_det: { label: 'Missile cells ×8 · mass detonation', cells: 8, he: 60, prop: 450, det: true },
  fuel: { label: 'Aviation fuel tank · JP-5', fuel: 15000, vapour: 15 },
};

let sim = null;
function detonate() {
  if (sim) build();
  const src = CONTENTS[st.src];
  const inside = st.fuze === 'inside' || !!src;
  const a = st.aim, n = st.aimN;
  const W = src ? (src.he && src.det ? src.cells * src.he * 1.2 : 0) : st.kg;
  const Wgas = src && src.prop ? src.cells * src.prop * .25 : 0;
  const W3 = Math.cbrt(Math.max(W, .01));
  const rc = Math.cbrt(3 * Math.max(W, .01) / (4 * Math.PI * 1600));
  let C;
  if (inside) C = [a[0] - n[0] * 1.6, a[1] - n[1] * 1.6, a[2] - n[2] * 1.6];
  else { const d = st.fuze === 'contact' ? rc + .05 : st.standoff; C = [a[0] + n[0] * d, a[1] + n[1] * d, a[2] + n[2] * d]; }
  const cc = comp(C[0], C[1], C[2]);
  const PR = new Float32Array(N), TA = new Float32Array(N), TD = new Float32Array(N), DIR = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    if (FIX[i]) continue;
    const dx = X[3 * i] - C[0], dy = X[3 * i + 1] - C[1], dz = X[3 * i + 2] - C[2], R = Math.max(Math.hypot(dx, dy, dz), rc);
    const nx = NRM[3 * i], ny = NRM[3 * i + 1], nz = NRM[3 * i + 2], dot = nx * dx + ny * dy + nz * dz, sg = dot >= 0 ? 1 : -1;
    DIR[3 * i] = nx * sg; DIR[3 * i + 1] = ny * sg; DIR[3 * i + 2] = nz * sg;       // pushed away from the charge
    SOOT[i] = W > 0 ? Math.max(0, 1 - R / (1.25 * fireR(W))) : Math.max(0, 1 - R / 7);
    if (W <= 0) continue;
    const Z = Math.max(R / W3, .053);
    const Ps = kinneyPs(Z), Pr = reflect(Ps), is = kinneyIs(Z, W), ir = is * Math.pow(Pr / Ps, .75);
    const c = Math.abs(dot) / R, c2 = c * c;
    const P = Ps + (Pr - Ps) * c2, I = is + (ir - is) * c2;
    PR[i] = P; TD[i] = 2 * I / P; TA[i] = arrival(R, W);
  }
  // gas sources in the struck compartment
  const srcs = [];
  if (cc < 4) {
    if (W > 0) srcs.push({ c: cc, Pq: qsp(W, GV[cc]), kind: 'det', tau: .002, F: 0 });
    if (Wgas > 0) srcs.push({ c: cc, Pq: qsp(Wgas, GV[cc]), kind: 'burn', tau: .12, F: 0 });
    if (src && src.fuel) srcs.push({ c: cc, Pq: .8e6 * Math.min(1, src.vapour / (GV[cc] * 1.2 / 15)), kind: 'burn', tau: .06, F: 0 });
  }
  const slow = srcs.length > 0;                                  // gas inside: run on (quasi-static) until it has vented
  sim = { t: 0, phase: 1, W, Wgas, src, C, cc, rc, inside, PR, TA, TD, DIR, srcs, slow,
    T1: slow ? .4 : .03 + .012 * W3, tFast: .02 + .006 * W3, msc: 1, post: 0, torn: 0, hullTorn: 0, cellsTorn: 0,
    frags: makeFrags(C, W), maxDef: 0, rate: 0, n: 0, tLoad: W > 0 ? .004 + .004 * W3 : 0, cracks: [null, null, null, null] };
  GP.fill(0); OPEN.fill(0);
  for (let i = 0; i < N; i++) LOSF[i] = !FIX[i] && W > 0 && visible(i, C) ? 1 : 0;
  // the fire lights only what it can see (or the walls of its own compartment)
  for (let i = 0; i < N; i++) if (!LOSF[i] && !(cc < 4 && (NSP[i] === cc || NSN[i] === cc))) SOOT[i] *= .15;
  let tl = 0; for (let i = 0; i < N; i++) if (LOSF[i]) tl = Math.max(tl, TA[i] + TD[i]);
  sim.tLoad = Math.max(sim.tLoad, Math.min(tl, .02 + .004 * W3));
  sim.solver = st.solver; sim.hs = st.hs * 1e-6; sim.iters = st.iters;
  prepareActive();
  if (sim.solver === 'gpu') gpuStart();
}

const fireR = W => .5 * 3.86 * Math.pow(Math.max(W, .01), .32);   // fireball radius, m

function strike(x, y, z, dx, dy, dz, t) {
  let best = -1, bd = 1e9;
  for (let p = 0; p < 4; p++) { const P = PL[p]; const c0 = [x, y, z];
    const ci = Math.floor((c0[P.ua] - P.u0) / S), cj = Math.floor((c0[P.va] - P.v0) / S);
    if (ci < 0 || cj < 0 || ci >= P.nu || cj >= P.nv || Math.abs(c0[P.ax] - P.val) > .3) continue;
    const i = CN[4 * (P.off + cj * P.nu + ci)], d = Math.hypot(X[3 * i] - x, X[3 * i + 1] - y, X[3 * i + 2] - z);
    if (d < bd) { bd = d; best = i; } }
  if (best < 0 || FIX[best]) return;
  const J = .02 * 1700 / M[best];                  // a ~20 g fragment at ~1.7 km/s
  V[3 * best] += dx * J; V[3 * best + 1] += dy * J; V[3 * best + 2] += dz * J;
  if (TBRK[best] < 0) TBRK[best] = t;
}

function makeFrags(C, W) {
  if (W < .5) return null;
  const n = 260, D = new Float32Array(n * 3), SP = new Float32Array(n), STOP = new Float32Array(n).fill(-1);
  seed = 99;
  for (let k = 0; k < n; k++) {
    const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u);
    D[3 * k] = r * Math.cos(th); D[3 * k + 1] = u; D[3 * k + 2] = r * Math.sin(th);
    SP[k] = 1500 + 500 * rnd();
  }
  return { n, D, SP, STOP };
}

/* ------------------------------------------------------------------ integration */
function breakBond(q, t) {
  const s = sim, a = SA[q], b = SB[q];
  SBRK[q] = 1; s.torn++;
  if (--LINKS[a] <= 0 && !FIX[a]) FREE[a] = 1;
  if (--LINKS[b] <= 0 && !FIX[b]) FREE[b] = 1;
  if (TBRK[a] < 0) TBRK[a] = t; if (TBRK[b] < 0) TBRK[b] = t;
  for (let k = 0; k < 4; k++) { const c = SCELL[4 * q + k]; if (c >= 0 && !CTORN[c]) {
    CTORN[c] = 1; if (CSURF[c] === 0) s.hullTorn++; s.cellsTorn++;
    const p = CSP[c], m = CSN[c]; OPEN[p * 5 + m] += S * S; OPEN[m * 5 + p] += S * S; } }
}
// a patch torn out by the blast: every bond of the node goes, and cracks start to run from the first hole in a plate
function disc(i, t) {
  DISC[i] = 1;
  for (let k = NADJ[i]; k < NADJ[i + 1]; k++) if (!SBRK[ADJ[k]]) breakBond(ADJ[k], t);
  crackStart(i, t);
}
function crackStart(i, t) {
  const p = SURF[i], P = PL[p], s = sim;
  let cr = s.cracks[p];
  const u = R0[3 * i + P.ua], v = R0[3 * i + P.va];
  if (!cr) {
    // 4-7 radial cracks from the first hole; candidates are the bonds that lie across each crack line
    seed = 11 + p * 7 + Math.round(s.W * 3);
    const nCr = 4 + Math.floor(rnd() * 4), th0 = rnd() * 6.28, lines = [];
    for (let c = 0; c < nCr; c++) lines.push({ th: th0 + c * 6.2832 / nCr + (rnd() - .5) * .5, lf: 1.4 + rnd() * .9 });
    const cand = [];
    for (let q = 0; q < NS; q++) {
      const ia = SA[q], ib = SB[q]; if (SURF[ia] !== p || SURF[ib] !== p) continue;
      if (Math.abs(R0[3 * ia + P.ax] - P.val) > 1e-3 || Math.abs(R0[3 * ib + P.ax] - P.val) > 1e-3) continue;
      const du = (R0[3 * ia + P.ua] + R0[3 * ib + P.ua]) / 2 - u, dv = (R0[3 * ia + P.va] + R0[3 * ib + P.va]) / 2 - v;
      const r = Math.hypot(du, dv); if (r > 6) continue;
      const th = Math.atan2(dv, du);
      for (const L of lines) { let d = th - L.th; d -= Math.round(d / 6.2832) * 6.2832; if (Math.abs(d) * r < S * .6) { cand.push(q, r, L.lf); break; } }
    }
    cr = s.cracks[p] = { p, u, v, t0: t, rb: 0, lines, cand: Float64Array.from(cand) };
  }
  cr.rb = Math.max(cr.rb, Math.hypot(u - cr.u, v - cr.v) + S * .5);
}
function runCracks(t) {
  for (let p = 0; p < 4; p++) {
    const cr = sim.cracks[p]; if (!cr) continue;
    const c = cr.cand;
    for (let k = 0; k < c.length; k += 3) {
      const q = c[k]; if (SBRK[q]) continue;
      const lim = Math.min(cr.rb * c[k + 2], cr.rb + (t - cr.t0) * V_CRACK);
      if (c[k + 1] > lim) continue;
      const a = SA[q], b = SB[q];
      const L = Math.hypot(X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]);
      if (L > SL0[q] * 1.004) breakBond(q, t);      // a crack only runs through plating that is being pulled open
    }
  }
}
// gas: each compartment a lumped volume; flow through the torn area between two spaces is orifice flow of hot gas
function gasStep(h) {
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 5; b++) {
    const A = OPEN[a * 5 + b]; if (A <= 0) continue;
    const dp = GP[a] - GP[b]; if (dp > -1 && dp < 1) continue;
    const hi = dp > 0 ? a : b, lo = dp > 0 ? b : a, ad = Math.abs(dp);
    const Pabs = GP[hi] + P0, rho = 1.2 * Pabs / P0 * .2;            // hot products, ~1500 K
    const Q = .6 * A * Math.sqrt(2 * ad / rho);                        // m3/s at the source state
    let dP = Pabs * Q * h / GV[hi];                                     // isothermal loss of the source
    const cap = lo < 4 ? ad * GV[lo] / (GV[hi] + GV[lo]) : ad;          // never past equal pressure
    if (dP > cap) dP = cap;
    GP[hi] -= dP; if (lo < 4) GP[lo] += dP * GV[hi] / GV[lo];
  }
}
// the parts of the model a solver works on: nodes that can move and bonds with at least one of them
let ANODES = new Int32Array(0), ASPR = new Int32Array(0), WINV = null, XP = null;
function prepareActive() {
  const s = sim; WINV = new Float64Array(N); XP = new Float64Array(3 * N);
  const act = new Uint8Array(N);
  if (st.patch && !s.srcs.length && s.W > 0) {
    // local patch: every node the shock moves faster than 2 m/s, plus a 1.5 m margin; the rest stays put
    let rp = 0;
    for (let i = 0; i < N; i++) if (LOSF[i] && s.PR[i] * s.TD[i] / 2 / RH[i] > 2) rp = Math.max(rp, Math.hypot(X[3 * i] - s.C[0], X[3 * i + 1] - s.C[1], X[3 * i + 2] - s.C[2]));
    rp += 1.5; s.patchR = rp;
    for (let i = 0; i < N; i++) if (Math.hypot(X[3 * i] - s.C[0], X[3 * i + 1] - s.C[1], X[3 * i + 2] - s.C[2]) < rp) act[i] = 1;
  } else { act.fill(1); s.patchR = 0; }
  const an = [];
  for (let i = 0; i < N; i++) if (act[i] && !FIX[i]) { an.push(i); WINV[i] = 1 / M[i]; }
  const as = [];
  for (let q = 0; q < NS; q++) if (WINV[SA[q]] + WINV[SB[q]] > 0) as.push(q);
  ANODES = Int32Array.from(an); ASPR = Int32Array.from(as);
}

// shared: sources and gas flow, the shock coming into view through new holes
function sourcesAndGas(t, h) {
  const s = sim;
  for (const q of s.srcs) {
    const Fn = q.kind === 'det' ? Math.min(1, t / q.tau) : 1 - Math.exp(-t / q.tau);
    GP[q.c] += q.Pq * (Fn - q.F); q.F = Fn;
  }
  gasStep(h);
  if ((s.n & 7) === 0 && s.W > 0 && t < s.tLoad) {
    for (let k = 0; k < ANODES.length; k++) { const i = ANODES[k];
      if (!LOSF[i] && t > s.TA[i] - 5e-4 && t < s.TA[i] + s.TD[i] && visible(i, s.C)) LOSF[i] = 1; }
  }
}
// the shock's impulse per unit area on node i between t0 and t1 (triangular pulse, exact integral)
function shockImp(i, t0, t1) {
  const s = sim, TD = s.TD[i]; let a = t0 - s.TA[i], b = t1 - s.TA[i];
  if (b <= 0 || a >= TD) return 0;
  if (a < 0) a = 0; if (b > TD) b = TD;
  return s.PR[i] * ((b - b * b / (2 * TD)) - (a - a * a / (2 * TD)));
}

/* ---- solver 1: explicit mass-spring (reference). Forces from elastic-plastic bonds, symplectic Euler at the
   stable step of the stiffest bond (~23 us). Mass-scaled x16 once only the slow gas load is left. */
const PROF = { bonds: 0, nodes: 0, loads: 0, integ: 0, coll: 0, n: 0 };
function stepExplicit() {
  const s = sim, t = s.t; let T0 = performance.now(), T1;
  if (s.slow && s.msc === 1 && t > s.tFast) s.msc = st.msc;
  const h = dt * Math.sqrt(s.msc), mi = 1 / s.msc;
  for (let k = 0; k < ANODES.length; k++) { const i = ANODES[k]; F[3 * i] = F[3 * i + 1] = F[3 * i + 2] = 0; }
  for (let k2 = 0; k2 < ASPR.length; k2++) {
    const q = ASPR[k2]; if (SBRK[q]) continue;
    const a = SA[q], b = SB[q];
    const dx = X[3 * b] - X[3 * a], dy = X[3 * b + 1] - X[3 * a + 1], dz = X[3 * b + 2] - X[3 * a + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz), L0 = SL0[q];
    if (L - L0 > SEF[q] * L0) { breakBond(q, t); continue; }
    const k = SK[q], fy = SFY[q];
    let f = k * (L - SLP[q]);
    if (f > fy) { SLP[q] = L - fy / k; f = fy; }
    else if (f < -.12 * fy) { SLP[q] = L + .12 * fy / k; f = -.12 * fy; }
    f += SC[q] * ((V[3 * b] - V[3 * a]) * dx + (V[3 * b + 1] - V[3 * a + 1]) * dy + (V[3 * b + 2] - V[3 * a + 2]) * dz) / L;
    const inv = f / L;
    F[3 * a] += dx * inv; F[3 * a + 1] += dy * inv; F[3 * a + 2] += dz * inv;
    F[3 * b] -= dx * inv; F[3 * b + 1] -= dy * inv; F[3 * b + 2] -= dz * inv;
  }
  T1 = performance.now(); PROF.bonds += T1 - T0; T0 = T1;
  for (let k2 = 0; k2 < ANODES.length; k2++) {
    const i = ANODES[k2];
    const k = TK[i];
    if (k && !FREE[i]) {                             // frames and longitudinals: elastic-plastic ties
      const dx = X[3 * i] - TAN[3 * i], dy = X[3 * i + 1] - TAN[3 * i + 1], dz = X[3 * i + 2] - TAN[3 * i + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-9) {
        let f = k * d; const fy = TFY[i];
        if (f > fy) { const back = fy / k / d; TAN[3 * i] = X[3 * i] - dx * back; TAN[3 * i + 1] = X[3 * i + 1] - dy * back; TAN[3 * i + 2] = X[3 * i + 2] - dz * back; f = fy; }
        const inv = f / d; F[3 * i] -= dx * inv; F[3 * i + 1] -= dy * inv; F[3 * i + 2] -= dz * inv;
      }
    }
    const kb = KB[i];
    if (kb && !FREE[i]) {                            // plastic bending
      let mx = 0, my = 0, mz = 0, vx = 0, vy = 0, vz = 0, n = 0;
      for (let kk = UNB[i]; kk < UNB[i + 1]; kk++) { const q = UN[kk]; if (SBRK[q]) continue; const j = SA[q] === i ? SB[q] : SA[q];
        mx += X[3 * j]; my += X[3 * j + 1]; mz += X[3 * j + 2]; vx += V[3 * j]; vy += V[3 * j + 1]; vz += V[3 * j + 2]; n++; }
      if (n === UNB[i + 1] - UNB[i]) {
        const ex = mx / n - X[3 * i] - UB[3 * i], ey = my / n - X[3 * i + 1] - UB[3 * i + 1], ez = mz / n - X[3 * i + 2] - UB[3 * i + 2];
        const e = Math.sqrt(ex * ex + ey * ey + ez * ez); let f = kb * e;
        if (f > KBY[i]) { const back = (f - KBY[i]) / kb / e; UB[3 * i] += ex * back; UB[3 * i + 1] += ey * back; UB[3 * i + 2] += ez * back; f = KBY[i]; }
        const g = e > 1e-12 ? f / e : 0, c = KBC[i];
        F[3 * i] += ex * g + c * (vx / n - V[3 * i]); F[3 * i + 1] += ey * g + c * (vy / n - V[3 * i + 1]); F[3 * i + 2] += ez * g + c * (vz / n - V[3 * i + 2]);
      }
    }
  }
  T1 = performance.now(); PROF.nodes += T1 - T0; T0 = T1;
  sourcesAndGas(t, h);
  for (let k = 0; k < ANODES.length; k++) {
    const i = ANODES[k];
    const dp = GP[NSN[i]] - GP[NSP[i]];
    if (dp !== 0 && !FREE[i]) { const f = dp * AREA[i]; F[3 * i] += NRM[3 * i] * f; F[3 * i + 1] += NRM[3 * i + 1] * f; F[3 * i + 2] += NRM[3 * i + 2] * f; }
    if (LOSF[i]) {
      const I = shockImp(i, t, t + h);
      if (I > 0) { const f = I / h * AREA[i]; F[3 * i] += s.DIR[3 * i] * f; F[3 * i + 1] += s.DIR[3 * i + 1] * f; F[3 * i + 2] += s.DIR[3 * i + 2] * f;
        if (!DISC[i] && (IMP[i] += I) / RH[i] > VC[i]) disc(i, t); }
    }
  }
  if ((s.n & 3) === 0) runCracks(t);
  T1 = performance.now(); PROF.loads += T1 - T0; T0 = T1;
  const damp = 1 - (t > s.tLoad && !s.slow ? 250 : 30) * h;
  for (let k = 0; k < ANODES.length; k++) {
    const i = ANODES[k], im = h / M[i] * mi;
    const vx = (V[3 * i] + F[3 * i] * im) * damp, vy = (V[3 * i + 1] + F[3 * i + 1] * im - (FREE[i] ? G * h : 0)) * damp, vz = (V[3 * i + 2] + F[3 * i + 2] * im) * damp;
    V[3 * i] = vx; V[3 * i + 1] = vy; V[3 * i + 2] = vz;
    X[3 * i] += vx * h; X[3 * i + 1] += vy * h; X[3 * i + 2] += vz * h;
  }
  T1 = performance.now(); PROF.integ += T1 - T0; T0 = T1;
  collide(false);
  PROF.coll += performance.now() - T0; PROF.n++;
  s.t += h; s.n++;
}

/* ---- solver 2: XPBD with small steps (Macklin et al. 2016/2019). Loads as impulses over each substep, then one
   pass of compliant constraints: bonds with compliance 1/k whose elastic stretch can't pass yield (the rest length
   flows) and whose correction can't carry more than the yield force over the substep; ties the same; bending as a
   capped soft pull; contacts as positions. Velocities from positions. Stable at any step; the step sets accuracy. */
function stepXPBD() {
  const s = sim, t = s.t;
  const h = s.hs * (s.slow && t > s.tFast ? 4 : 1);
  sourcesAndGas(t, h);
  for (let k = 0; k < ANODES.length; k++) {
    const i = ANODES[k], w = WINV[i];
    let jx = 0, jy = 0, jz = 0;
    const dp = GP[NSN[i]] - GP[NSP[i]];
    if (dp !== 0 && !FREE[i]) { const f = dp * AREA[i] * h; jx += NRM[3 * i] * f; jy += NRM[3 * i + 1] * f; jz += NRM[3 * i + 2] * f; }
    if (LOSF[i]) {
      const I = shockImp(i, t, t + h);
      if (I > 0) { const f = I * AREA[i]; jx += s.DIR[3 * i] * f; jy += s.DIR[3 * i + 1] * f; jz += s.DIR[3 * i + 2] * f;
        if (!DISC[i] && (IMP[i] += I) / RH[i] > VC[i]) disc(i, t); }
    }
    V[3 * i] += jx * w; V[3 * i + 1] += jy * w - (FREE[i] ? G * h : 0); V[3 * i + 2] += jz * w;
    XP[3 * i] = X[3 * i]; XP[3 * i + 1] = X[3 * i + 1]; XP[3 * i + 2] = X[3 * i + 2];
    X[3 * i] += V[3 * i] * h; X[3 * i + 1] += V[3 * i + 1] * h; X[3 * i + 2] += V[3 * i + 2] * h;
  }
  const h2 = h * h;
  for (let it = 0; it < s.iters; it++) {
    for (let k2 = 0; k2 < ASPR.length; k2++) {
      const q = ASPR[k2]; if (SBRK[q]) continue;
      const a = SA[q], b = SB[q], wa = WINV[a], wb = WINV[b];
      const dx = X[3 * b] - X[3 * a], dy = X[3 * b + 1] - X[3 * a + 1], dz = X[3 * b + 2] - X[3 * a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz), L0 = SL0[q];
      if (L - L0 > SEF[q] * L0) { breakBond(q, t); continue; }
      const k = SK[q], fy = SFY[q], ey = fy / k, ec = .12 * ey;
      let C = L - SLP[q];
      if (C > ey) { SLP[q] = L - ey; C = ey; } else if (C < -ec) { SLP[q] = L + ec; C = -ec; }
      let dl = -C / (wa + wb + 1 / (k * h2));
      const cap = fy * h2; if (dl < -cap) dl = -cap; else if (dl > .12 * cap) dl = .12 * cap;
      const g = dl / L;
      X[3 * a] -= wa * g * dx; X[3 * a + 1] -= wa * g * dy; X[3 * a + 2] -= wa * g * dz;
      X[3 * b] += wb * g * dx; X[3 * b + 1] += wb * g * dy; X[3 * b + 2] += wb * g * dz;
    }
  }
  for (let k2 = 0; k2 < ANODES.length; k2++) {
    const i = ANODES[k2], w = WINV[i];
    const k = TK[i];
    if (k && !FREE[i]) {
      const dx = X[3 * i] - TAN[3 * i], dy = X[3 * i + 1] - TAN[3 * i + 1], dz = X[3 * i + 2] - TAN[3 * i + 2];
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-9) {
        const ey = TFY[i] / k;
        if (d > ey) { const back = ey / d; TAN[3 * i] = X[3 * i] - dx * back; TAN[3 * i + 1] = X[3 * i + 1] - dy * back; TAN[3 * i + 2] = X[3 * i + 2] - dz * back; }
        const C = Math.min(d, ey); let dl = -C / (w + 1 / (k * h2)); const cap = TFY[i] * h2; if (dl < -cap) dl = -cap;
        const g = dl / d * w; X[3 * i] += dx * g; X[3 * i + 1] += dy * g; X[3 * i + 2] += dz * g;
      }
    }
    const kb = KB[i];
    if (kb && !FREE[i]) {
      let mx = 0, my = 0, mz = 0, n = 0;
      for (let kk = UNB[i]; kk < UNB[i + 1]; kk++) { const q = UN[kk]; if (SBRK[q]) continue; const j = SA[q] === i ? SB[q] : SA[q];
        mx += X[3 * j]; my += X[3 * j + 1]; mz += X[3 * j + 2]; n++; }
      if (n === UNB[i + 1] - UNB[i]) {
        let ex = mx / n - X[3 * i] - UB[3 * i], ey = my / n - X[3 * i + 1] - UB[3 * i + 1], ez = mz / n - X[3 * i + 2] - UB[3 * i + 2];
        const e = Math.sqrt(ex * ex + ey * ey + ez * ez), f = kb * e;
        if (f > KBY[i]) { const r = 1 - KBY[i] / f; UB[3 * i] += ex * r; UB[3 * i + 1] += ey * r; UB[3 * i + 2] += ez * r; ex *= 1 - r; ey *= 1 - r; ez *= 1 - r; }
        const c = kb * h2 * w, sfac = c / (1 + c);
        X[3 * i] += ex * sfac; X[3 * i + 1] += ey * sfac; X[3 * i + 2] += ez * sfac;
      }
    }
  }
  collide(true);
  if ((s.n & 3) === 0) runCracks(t);
  const damp = Math.max(0, 1 - (t > s.tLoad && !s.slow ? 250 : 30) * h), ih = 1 / h;
  for (let k = 0; k < ANODES.length; k++) {
    const i = ANODES[k];
    V[3 * i] = (X[3 * i] - XP[3 * i]) * ih * damp; V[3 * i + 1] = (X[3 * i + 1] - XP[3 * i + 1]) * ih * damp; V[3 * i + 2] = (X[3 * i + 2] - XP[3 * i + 2]) * ih * damp;
  }
  s.t += h; s.n++;
}

/* ---- solver 3: the explicit model on the GPU (gpu.js); the CPU keeps gas, line of sight and cracks, synced */
let gpu = null; const SYNC = 25;
function gpuModel() {
  return { N, NS, NC, SA, SB, NADJ, SL0, SK, SFY, SEF, SC, AREA, SURF, NSP, NSN, RH, VC, R0, NRM, TK, TFY, KB, KBY, KBC, UNB, UN, PL,
    X, V, DISC, IMP, TAN, FREE, UB, SLP, SBRK, CTORN, LOSF, GP, S, V_CRACK,
    winv: i => WINV[i], dirSign: i => { const s = sim; return s.DIR[3 * i] * NRM[3 * i] + s.DIR[3 * i + 1] * NRM[3 * i + 1] + s.DIR[3 * i + 2] * NRM[3 * i + 2] < 0 ? -1 : 1; },
    PR: i => sim.PR[i], TA: i => sim.TA[i], TD: i => sim.TD[i], C: () => sim.C, diff: () => st.diff,
    crackPlate: q => { const a = SA[q], b = SB[q], p = SURF[a]; if (SURF[b] !== p) return -1; const P = PL[p];
      return Math.abs(R0[3 * a + P.ax] - P.val) < 1e-3 && Math.abs(R0[3 * b + P.ax] - P.val) < 1e-3 ? p : -1; },
    slotMid: q => { const a = SA[q], b = SB[q], P = PL[SURF[a]]; return [(R0[3 * a + P.ua] + R0[3 * b + P.ua]) / 2, (R0[3 * a + P.va] + R0[3 * b + P.va]) / 2]; },
    cellBonds: c => CBOND.subarray(6 * c, 6 * c + 6), plateNode: (p, i, j) => PL[p].at[j * (PL[p].nu + 1) + i] };
}
function gpuStart() {
  if (!gpu) gpu = createGPU(gl, gpuModel()); gpu.upload();
  // tear-outs on plates the charge sees directly happen within the pulse: when the running impulse
  // PR (tau - tau^2 / 2 TD) reaches rho h v_c. The first one starts that plate's cracks; the rim is the farthest.
  const s = sim; if (!(s.W > 0)) return;
  const first = [-1, -1, -1, -1], ft = [1e9, 1e9, 1e9, 1e9];
  const dt0 = new Float64Array(N).fill(-1);
  for (let k = 0; k < ANODES.length; k++) { const i = ANODES[k]; if (!LOSF[i]) continue;
    const thr = RH[i] * VC[i], full = s.PR[i] * s.TD[i] / 2; if (full <= thr) continue;
    const tau = s.TD[i] * (1 - Math.sqrt(Math.max(0, 1 - 2 * thr / (s.PR[i] * s.TD[i])))), ti = s.TA[i] + tau;
    dt0[i] = ti; const p = SURF[i]; if (ti < ft[p]) { ft[p] = ti; first[p] = i; } }
  for (let p = 0; p < 4; p++) if (first[p] >= 0) {
    crackStart(first[p], ft[p]);
    for (let i = 0; i < N; i++) if (dt0[i] >= 0 && SURF[i] === p) crackStart(i, dt0[i]);   // grows the rim to the last predicted tear-out
  }
  gpu.cracks(s.cracks.filter(Boolean));
}
function stepGPU() {
  const s = sim, t = s.t;
  if (s.slow && s.msc === 1 && t > s.tFast) s.msc = st.msc;
  const h = dt * Math.sqrt(s.msc);
  gpu.step(t, h, s.msc, 1 - (t > s.tLoad && !s.slow ? 250 : 30) * h);
  s.t += h; s.n++;
  if (s.n % SYNC === 0) gpuSync(h * SYNC);
}
function gpuSync(hs) {
  const s = sim, t = s.t;
  for (const q of s.srcs) { const Fn = q.kind === 'det' ? Math.min(1, t / q.tau) : 1 - Math.exp(-t / q.tau); GP[q.c] += q.Pq * (Fn - q.F); q.F = Fn; }
  // torn cells matter to the CPU only for the gas (vents): read without stalling; at the end, read for real
  // (the browser only completes a fence between tasks: in a synchronous run, read blocking every 2nd sync)
  const cl = hs === 0 ? gpu.readCells() : !s.srcs.length ? null : s.sync ? ((s.n / SYNC) % 2 ? null : gpu.readCells()) : gpu.readCellsAsync();
  if (cl) for (let c = 0; c < NC; c++) if (cl[4 * c] > .5 && !CTORN[c]) {
    CTORN[c] = 1; if (CSURF[c] === 0) s.hullTorn++; s.cellsTorn++;
    const pp = CSP[c], m = CSN[c]; OPEN[pp * 5 + m] += S * S; OPEN[m * 5 + pp] += S * S;
    for (let k = 0; k < 4; k++) { const i = CN[4 * c + k]; if (TBRK[i] < 0) TBRK[i] = t; }
  }
  gasStep(hs);
  if (s.n % 400 === 0 && t > s.tLoad && s.srcs.every(q => q.F > .98) && GP[0] + GP[1] + GP[2] + GP[3] < 2e4) {
    gpu.readNodes(true); let v2 = 0;
    for (let k = 0; k < ANODES.length; k++) { const i = ANODES[k]; if (FREE[i]) continue; const q = V[3 * i] ** 2 + V[3 * i + 1] ** 2 + V[3 * i + 2] ** 2; if (q > v2) v2 = q; }
    if (v2 < 1) s.T1 = t;
  }
}
function gpuFinish() { gpu.readNodes(true); gpu.readBonds(); gpuSync(0); }

function step() {
  const s = sim;
  if (s.solver === 'gpu') { stepGPU(); return; }
  if (s.solver === 'xpbd') stepXPBD(); else stepExplicit();
  if (s.n % 200 === 0 && s.t > s.tLoad && s.srcs.every(q => q.F > .98) && GP[0] + GP[1] + GP[2] + GP[3] < 2e4) {
    let v2 = 0; for (let k = 0; k < ANODES.length; k++) { const i = ANODES[k]; if (FREE[i]) continue;
      const q = V[3 * i] * V[3 * i] + V[3 * i + 1] * V[3 * i + 1] + V[3 * i + 2] * V[3 * i + 2]; if (q > v2) v2 = q; }
    if (v2 < 1) s.T1 = s.t;                       // settled early
  }
}

// plates can't pass through each other: a node that crosses another plate's intact cell is put back on its side
// (and, in the explicit solver, shares its momentum with that cell: an inelastic contact)
function collide(posOnly) {
  for (let k = 0; k < ANODES.length; k++) {
    const i = ANODES[k], own = SURF[i];
    for (let p = 0; p < 4; p++) {
      if (p === own) continue;
      const P = PL[p], ax = P.ax, rest = R0[3 * i + ax] - P.val;
      if (rest > -1e-3 && rest < 1e-3) continue;
      const cur = X[3 * i + ax] - P.val;
      if (cur * rest > 0 && (cur > 1.5 || cur < -1.5)) continue;
      const ci = Math.floor((X[3 * i + P.ua] - P.u0) / S), cj = Math.floor((X[3 * i + P.va] - P.v0) / S);
      if (ci < 0 || cj < 0 || ci >= P.nu || cj >= P.nv) continue;
      const c = P.off + cj * P.nu + ci; if (CTORN[c]) continue;
      const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3];
      const plane = (X[3 * a + ax] + X[3 * b + ax] + X[3 * cc + ax] + X[3 * d + ax]) / 4;
      const sd = rest > 0 ? 1 : -1, gap = (X[3 * i + ax] - plane) * sd;
      if (gap > .015) continue;
      if (posOnly) {                                 // split the overlap by inverse mass
        const w4 = (WINV[a] + WINV[b] + WINV[cc] + WINV[d]) / 4, wi = WINV[i], pen = .015 - gap, tot = wi + w4 || 1;
        X[3 * i + ax] += sd * pen * wi / tot;
        const m = -sd * pen * w4 / tot / (w4 || 1);
        if (WINV[a]) X[3 * a + ax] += m * WINV[a]; if (WINV[b]) X[3 * b + ax] += m * WINV[b];
        if (WINV[cc]) X[3 * cc + ax] += m * WINV[cc]; if (WINV[d]) X[3 * d + ax] += m * WINV[d];
        continue;
      }
      X[3 * i + ax] = plane + .015 * sd;
      const vc = (V[3 * a + ax] + V[3 * b + ax] + V[3 * cc + ax] + V[3 * d + ax]) / 4, rel = (V[3 * i + ax] - vc) * sd;
      if (rel < 0) {
        const J = rel * sd * M[i];
        V[3 * i + ax] -= rel * sd;
        const m4 = M[a] + M[b] + M[cc] + M[d];
        if (WINV[a]) V[3 * a + ax] += J / m4; if (WINV[b]) V[3 * b + ax] += J / m4;
        if (WINV[cc]) V[3 * cc + ax] += J / m4; if (WINV[d]) V[3 * d + ax] += J / m4;
      }
    }
  }
}

function settle() {                                // end of the structural response: the plate keeps its set
  if (sim.solver === 'gpu') gpuFinish();
  for (let i = 0; i < N; i++) if (!FREE[i]) { V[3 * i] = V[3 * i + 1] = V[3 * i + 2] = 0; }
  let md = 0;
  for (let i = 0; i < N; i++) if (SURF[i] === 0 && !FREE[i]) md = Math.max(md, Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]));
  sim.maxDef = md;
  for (let q = 0; q < NS; q++) { const e = Math.abs(SLP[q] - SL0[q]) / SL0[q]; if (e > EPS[SA[q]]) EPS[SA[q]] = e; if (e > EPS[SB[q]]) EPS[SB[q]] = e; }
}

function ballistic(h) {                            // after the response: loose plate flies, falls, drops into the sea
  for (let i = 0; i < N; i++) {
    if (!FREE[i]) continue;
    const d = Math.exp(-.6 * h);
    V[3 * i] *= d; V[3 * i + 2] *= d; V[3 * i + 1] = V[3 * i + 1] * d - G * h;
    X[3 * i] += V[3 * i] * h; X[3 * i + 1] += V[3 * i + 1] * h; X[3 * i + 2] += V[3 * i + 2] * h;
    if (X[3 * i + 1] < -.2 && X[3 * i + 2] > 0) { V[3 * i] = V[3 * i + 1] = V[3 * i + 2] = 0; X[3 * i + 1] = -50; }
  }
}

/* ------------------------------------------------------------------ renderer */
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP; layout(location=1) in vec4 aC;
uniform mat4 uVP; uniform float uK; out vec4 vC;
void main(){ vec4 c = uVP * vec4(aP, 1.0); gl_Position = c;
  gl_PointSize = clamp(uK * aC.a / max(c.w, .1), 1.0, 3.2); vC = vec4(aC.rgb, 1.0); }`;
const FS = `#version 300 es
precision mediump float; in vec4 vC; out vec4 o; void main(){ o = vC; }`;
const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
const uVP = gl.getUniformLocation(prog, 'uVP'), uK = gl.getUniformLocation(prog, 'uK');
const vao = gl.createVertexArray(), bP = gl.createBuffer(), bC = gl.createBuffer();
const VS2 = `#version 300 es
layout(location=0) in vec3 aP; uniform mat4 uVP; void main(){ gl_Position = uVP * vec4(aP, 1.0); }`;
const FS2 = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(0.0); }`;
const prog2 = gl.createProgram(); gl.attachShader(prog2, sh(gl.VERTEX_SHADER, VS2)); gl.attachShader(prog2, sh(gl.FRAGMENT_SHADER, FS2)); gl.linkProgram(prog2);
const uVP2 = gl.getUniformLocation(prog2, 'uVP');
const vao2 = gl.createVertexArray(), bN = gl.createBuffer(), bI = gl.createBuffer();
let NF32 = null, IDX = null;
let cap = 0, PB, CB, bufDirty = true;

const cam = { yaw: .42, pitch: .12, dist: 24, tgt: [0, 2.5, -.5] };
let VP = new Float32Array(16), eye = [0, 0, 0], fovK = 1;
function mats() {
  const w = cv.width, h = cv.height, f = 1 / Math.tan(.42);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  eye = [cam.tgt[0] + cam.dist * cp * Math.sin(cam.yaw), cam.tgt[1] + cam.dist * sp, cam.tgt[2] + cam.dist * cp * Math.cos(cam.yaw)];
  let zx = eye[0] - cam.tgt[0], zy = eye[1] - cam.tgt[1], zz = eye[2] - cam.tgt[2]; const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xy = 0, xz = -zx; const xl = Math.hypot(xx, xz); xx /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const a = h / w, n = .1, fa = 2000;
  const P = [f * a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
  const Vw = [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + r] * Vw[c * 4 + k]; VP[c * 4 + r] = s; }
  fovK = f * h * .5;
  return { right: [xx, xy, xz], up: [yx, yy, yz], fwd: [-zx, -zy, -zz], f, a };
}

const NFB = 7000, NSH = 3000, SEA_W = 110, SEA_D = 60;
function ensure(n) {
  if (n <= cap) return;
  cap = n; PB = new Float32Array(cap * 3); CB = new Float32Array(cap * 4);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferData(gl.ARRAY_BUFFER, PB.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, CB.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
}

const NCOL = () => new Float32Array(N * 3);
let nodeCol = null, NN = null;
const LIT = (() => { const v = [-.45, .75, .5], l = Math.hypot(...v); return v.map(x => x / l); })();
function nodeColours(tv) {
  if (!nodeCol || nodeCol.length !== N * 3) { nodeCol = NCOL(); NN = new Float32Array(3 * N); }
  // shading from the current shape: normals from the cells, so dents, bulges and petals read
  NN.fill(0);
  for (let c = 0; c < NC; c++) {
    const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3];
    const ux = X[3 * cc] - X[3 * a], uy = X[3 * cc + 1] - X[3 * a + 1], uz = X[3 * cc + 2] - X[3 * a + 2];
    const vx = X[3 * d] - X[3 * b], vy = X[3 * d + 1] - X[3 * b + 1], vz = X[3 * d + 2] - X[3 * b + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const r0 = NRM, i0 = 3 * a; if (nx * r0[i0] + ny * r0[i0 + 1] + nz * r0[i0 + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (const i of [a, b, cc, d]) { NN[3 * i] += nx; NN[3 * i + 1] += ny; NN[3 * i + 2] += nz; }
  }
  const base = [.86, .62, .5, .5], strain = st.view === 1;
  const fireA = sim ? fireball(tv).glow : 0;
  for (let i = 0; i < N; i++) {
    const nl = Math.hypot(NN[3 * i], NN[3 * i + 1], NN[3 * i + 2]) || 1;
    const lam = Math.abs(NN[3 * i] * LIT[0] + NN[3 * i + 1] * LIT[1] + NN[3 * i + 2] * LIT[2]) / nl;
    let b = base[SURF[i]] * (FRM[i] === 2 ? 1.12 : FRM[i] === 1 ? 1.05 : 1) * (.38 + 1.1 * lam * lam);
    let r = b, g = b, bl = b * .96;
    if (sim && sim.post > 0) { const so = SOOT[i] * Math.min(1, sim.post * 2); r *= 1 - .7 * so; g *= 1 - .72 * so; bl *= 1 - .74 * so; }
    if (strain) { const e = Math.min(1, EPS[i] * 12); r = r * (1 - e) + .78 * e; g = g * (1 - e) + .96 * e; bl = bl * (1 - e) + .2 * e; }
    if (TBRK[i] >= 0) {                           // torn edges glow hot, then cool
      const age = (sim.phase === 1 ? 0 : sim.post), heat = Math.exp(-age / 7);
      r += 1.0 * heat; g += .52 * heat; bl += .16 * heat;
    }
    if (fireA > 0) { const k = fireA * SOOT[i]; r += k; g += .6 * k; bl += .25 * k; }
    nodeCol[3 * i] = r; nodeCol[3 * i + 1] = g; nodeCol[3 * i + 2] = bl;
  }
}

function fireball(tv) {
  const burn = sim.W <= 0, W = burn ? (sim.Wgas || 40) : sim.W, Rm = fireR(W) * (burn ? .8 : 1), W3 = Math.cbrt(W);
  const tau = burn ? .08 : .006 * W3, life = burn ? 6 : .35 * W3 + .4;
  const R = Rm * (1 - Math.exp(-tv / tau));
  const glow = tv < life ? Math.max(0, 1 - tv / life) * (tv < tau ? tv / tau : 1) * 1.4 : 0;
  return { R, tau, life, glow, Rm, W };
}

let frameT = performance.now(), lastRate = 0;
const SPEEDS = [0, 1, .1, .01, .001], SPEED_NAMES = ['max', '×1', '×0.1', '×0.01', '×0.001'];
function draw(now) {
  const rdt = Math.min(.05, (now - frameT) / 1000); frameT = now;
  // --- advance
  // speed: 0 = as fast as the solver goes (budget 12 ms a frame), else a fixed time rate (x1 ... x0.001)
  const spd = SPEEDS[st.spd];
  if (sim && sim.phase === 1) {
    const t0 = performance.now(), ts = sim.t, goal = spd ? ts + rdt * spd : Infinity;
    while (performance.now() - t0 < 12 && sim.t < sim.T1 && sim.t < goal) for (let k = 0; k < 10 && sim.t < sim.T1 && sim.t < goal; k++) step();
    lastRate = rdt > 0 ? (sim.t - ts) / rdt : 0;
    if (sim.solver === 'gpu' && sim.t < sim.T1) gpu.readNodes(false);
    if (sim.t >= sim.T1) { sim.phase = 2; settle(); }
  } else if (sim && sim.phase === 2) {
    const r = spd ? Math.max(spd, .05) : 1, h = rdt * r; sim.post += h; ballistic(h); lastRate = r;
  }
  const tv = sim ? (sim.phase === 1 ? sim.t : sim.T1 + sim.post) : 0;
  // --- geometry
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  const basis = mats();
  let nd = 0; for (let c = 0; c < NC; c++) nd += DOTS_PER[CSURF[c]];
  ensure(nd + NFB + NSH + 1600 + SEA_W * SEA_D + 400);
  nodeColours(tv);
  let o = 0;
  const put = (x, y, z, r, g, b, s) => { PB[3 * o] = x; PB[3 * o + 1] = y; PB[3 * o + 2] = z; CB[4 * o] = r; CB[4 * o + 1] = g; CB[4 * o + 2] = b; CB[4 * o + 3] = s; o++; };
  let k = 0;
  for (let c = 0; c < NC; c++) {
    const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3], n = DOTS_PER[CSURF[c]], torn = CTORN[c];
    const sz = CSURF[c] === 0 ? .045 : .04;
    for (let q = 0; q < n; q++, k++) {
      const u = CU[k], v = CV2[k];
      let x, y, z, w0, w1, w2, w3;
      if (!torn) {
        w0 = (1 - u) * (1 - v); w1 = u * (1 - v); w2 = u * v; w3 = (1 - u) * v;
        x = X[3 * a] * w0 + X[3 * b] * w1 + X[3 * cc] * w2 + X[3 * d] * w3;
        y = X[3 * a + 1] * w0 + X[3 * b + 1] * w1 + X[3 * cc + 1] * w2 + X[3 * d + 1] * w3;
        z = X[3 * a + 2] * w0 + X[3 * b + 2] * w1 + X[3 * cc + 2] * w2 + X[3 * d + 2] * w3;
      } else {                                    // torn: each quarter of the cell rides its own corner (jagged petals)
        const m = u < .5 ? (v < .5 ? a : d) : (v < .5 ? b : cc);
        w0 = (1 - u) * (1 - v); w1 = u * (1 - v); w2 = u * v; w3 = (1 - u) * v;
        const rx = R0[3 * a] * w0 + R0[3 * b] * w1 + R0[3 * cc] * w2 + R0[3 * d] * w3;
        const ry = R0[3 * a + 1] * w0 + R0[3 * b + 1] * w1 + R0[3 * cc + 1] * w2 + R0[3 * d + 1] * w3;
        const rz = R0[3 * a + 2] * w0 + R0[3 * b + 2] * w1 + R0[3 * cc + 2] * w2 + R0[3 * d + 2] * w3;
        x = X[3 * m] + (rx - R0[3 * m]) * .8; y = X[3 * m + 1] + (ry - R0[3 * m + 1]) * .8; z = X[3 * m + 2] + (rz - R0[3 * m + 2]) * .8;
      }
      if (y < -40) continue;
      const cr = nodeCol[3 * a] * w0 + nodeCol[3 * b] * w1 + nodeCol[3 * cc] * w2 + nodeCol[3 * d] * w3;
      const cg = nodeCol[3 * a + 1] * w0 + nodeCol[3 * b + 1] * w1 + nodeCol[3 * cc + 1] * w2 + nodeCol[3 * d + 1] * w3;
      const cb = nodeCol[3 * a + 2] * w0 + nodeCol[3 * b + 2] * w1 + nodeCol[3 * cc + 2] * w2 + nodeCol[3 * d + 2] * w3;
      put(x, y, z, cr, cg, cb, sz);
    }
  }
  // sea (outside the hull only), a slow swell
  const T = now / 1000;
  for (let j = 0; j < SEA_D; j++) for (let i = 0; i < SEA_W; i++) {
    const x = -55 + i + ((j * 7) % 3) * .33, z = .6 + j * .8 + ((i * 5) % 4) * .2;
    const y = .08 * Math.sin(x * .35 + T * 1.1) + .06 * Math.sin(z * .5 - T * .8);
    const f = Math.max(0, 1 - z / 48);
    put(x, y, z, .34 * f, .4 * f, .44 * f, .06);
  }
  if (sim) {
    const C = sim.C, fb = fireball(tv), W = sim.W;
    // shock front: a thin shell while it is still close; it stops at intact plating and passes through holes
    if (W > 0 && tv < .06 * Math.cbrt(W)) {
      let Rs = 0; for (let r = .1; r < 80; r *= 1.04) { if (arrival(r, W) > tv) break; Rs = r; }
      const fade = 1 - tv / (.06 * Math.cbrt(W));
      seed = 3;
      for (let q = 0; q < NSH; q++) {
        const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u), dx = r * Math.cos(th), dy = u, dz = r * Math.sin(th);
        if (firstHit(C[0], C[1], C[2], dx, dy, dz, Rs, -1) < Rs) continue;
        put(C[0] + Rs * dx, C[1] + Rs * dy, C[2] + Rs * dz, .78 * fade, .96 * fade, .2 * fade, .05);
      }
    }
    // fireball (or the burning of the contents), filling the spaces it can reach and venting through the holes,
    // then smoke drifting up
    seed = 11;
    const rise = Math.max(0, tv - fb.tau * 4) * 2.2 * Math.cbrt(fb.W) * .4;
    for (let q = 0; q < NFB; q++) {
      const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u), rr = Math.cbrt(rnd());
      const age = tv / fb.life, grow = 1 + Math.max(0, tv - fb.life) * .25, R = fb.R * grow * rr;
      let x = r * Math.cos(th) * R + rise * .35, y = u * R + rise, z = r * Math.sin(th) * R;
      const d = Math.hypot(x, y, z) || 1e-6, hit = firstHit(C[0], C[1], C[2], x / d, y / d, z / d, d, -1);
      if (hit < d) { if (rnd() < .6) continue; const k = (hit - .1) / d; x *= k; y *= k; z *= k; }   // piles against the plating
      let cr, cg, cb;
      if (age < 1) { const hot = Math.max(0, 1 - age * 1.4) * (1 - rr * .5);
        cr = .95 + .05 * hot; cg = .45 + .5 * hot; cb = .12 + .7 * hot * hot;
        const dim = .35 + .65 * (1 - age); cr *= dim; cg *= dim; cb *= dim; }
      else { const s = Math.max(0, .34 - (age - 1) * .02) * (.6 + .4 * rnd()); cr = s; cg = s * .97; cb = s * .92; }
      if (cr + cg + cb < .03) continue;
      put(C[0] + x, C[1] + y, C[2] + z, cr, cg, cb, .08);
    }
    // casing fragments: short streaks that stop at the first intact plating and knock it
    const fr = sim.frags;
    if (fr && tv < .06) {
      for (let q = 0; q < fr.n; q++) {
        const dx = fr.D[3 * q], dy = fr.D[3 * q + 1], dz = fr.D[3 * q + 2];
        let dmax = fr.SP[q] * tv;
        if (fr.STOP[q] < 0) {
          const hit = firstHit(C[0], C[1], C[2], dx, dy, dz, dmax, -1);
          if (hit < dmax) { fr.STOP[q] = hit; strike(C[0] + dx * hit, C[1] + dy * hit, C[2] + dz * hit, dx, dy, dz, tv); }
        }
        if (fr.STOP[q] >= 0) dmax = Math.min(dmax, fr.STOP[q]);
        for (let s = 0; s < 5; s++) {
          const dd = dmax - s * fr.SP[q] * .00025; if (dd <= 0) break;
          put(C[0] + dx * dd, C[1] + dy * dd, C[2] + dz * dd, 1, .8 - s * .1, .45 - s * .08, .05);
        }
      }
    }
  }
  // aim marker
  if (!sim || sim.phase === 2) {
    const a = st.aim, n = st.aimN;
    const ux = n[2] !== 0 ? [1, 0, 0] : [1, 0, 0], vy = n[2] !== 0 ? [0, 1, 0] : [0, 0, 1];
    for (let q = 0; q < 72; q++) { const t = q / 72 * 6.2832; const r = .9;
      put(a[0] + (ux[0] * Math.cos(t) + vy[0] * Math.sin(t)) * r + n[0] * .05, a[1] + (ux[1] * Math.cos(t) + vy[1] * Math.sin(t)) * r + n[1] * .05,
        a[2] + (ux[2] * Math.cos(t) + vy[2] * Math.sin(t)) * r + n[2] * .05, .78, .96, .2, .06); }
  }
  // --- draw
  gl.viewport(0, 0, cv.width, cv.height);
  gl.clearColor(.043, .047, .039, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  // occluders: the intact cells, pushed back a little
  if (!NF32 || NF32.length !== 3 * N) { NF32 = new Float32Array(3 * N); IDX = new Uint32Array(NC * 6);
    gl.bindVertexArray(vao2); gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferData(gl.ARRAY_BUFFER, NF32.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IDX.byteLength, gl.DYNAMIC_DRAW); }
  for (let i = 0; i < 3 * N; i++) NF32[i] = X[i];
  let ni = 0;
  for (let c = 0; c < NC; c++) { if (CTORN[c]) continue; const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3];
    IDX[ni++] = a; IDX[ni++] = b; IDX[ni++] = cc; IDX[ni++] = a; IDX[ni++] = cc; IDX[ni++] = d; }
  gl.useProgram(prog2); gl.bindVertexArray(vao2);
  gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferSubData(gl.ARRAY_BUFFER, 0, NF32);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, IDX, 0, ni);
  gl.uniformMatrix4fv(uVP2, false, VP);
  gl.colorMask(false, false, false, false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(4, 8);
  gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_INT, 0);
  gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true);
  gl.useProgram(prog); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferSubData(gl.ARRAY_BUFFER, 0, PB, 0, o * 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferSubData(gl.ARRAY_BUFFER, 0, CB, 0, o * 4);
  gl.uniformMatrix4fv(uVP, false, VP); gl.uniform1f(uK, fovK * 1.0);
  gl.drawArrays(gl.POINTS, 0, o);
  readout(tv);
  requestAnimationFrame(draw);
}

/* ------------------------------------------------------------------ readouts */
let rdT = 0;
function readout(tv) {
  const now = performance.now(); if (now - rdT < 120) return; rdT = now;
  const mt = MATS[st.mat], h = st.h / 1000, W = st.kg, W3 = Math.cbrt(W);
  const rc = Math.cbrt(3 * W / (4 * Math.PI * 1600));
  const d = st.fuze === 'contact' ? rc + .05 : st.fuze === 'inside' ? 1.6 : st.standoff;
  const Z = Math.max(d / W3, .053), Ps = kinneyPs(Z), Pr = reflect(Ps), is = kinneyIs(Z, W), ir = is * Math.pow(Pr / Ps, .75);
  // Nurick-Martin (quadrangular plates): phi = I / (2 h^2 sqrt(B L rho sy)), delta / h = 0.480 phi + 0.277 (uniform load)
  const B = FRAME * S, L = LONG * S, I = ir * B * L, phi = I / (2 * h * h * Math.sqrt(B * L * mt.rho * mt.sy)), dN = h * (.48 * phi + .277);
  const fmtP = p => p > 1e6 ? (p / 1e6).toFixed(1) + ' MPa' : (p / 1e3).toFixed(0) + ' kPa';
  const L1 = [];
  L1.push(`<div>Z <b>${Z.toFixed(2)}</b> m/kg<sup>⅓</sup> · ${d.toFixed(2)} m</div>`);
  L1.push(`<div>Peak incident <b>${fmtP(Ps)}</b> · reflected <b>${fmtP(Pr)}</b></div>`);
  L1.push(`<div>Reflected impulse <b>${(ir / 1000).toFixed(2)}</b> kPa·s</div>`);
  L1.push(`<div>Fireball Ø <b>${(2 * fireR(W)).toFixed(1)}</b> m</div>`);
  L1.push(`<div>Nurick panel ${B}×${L} m · φ ${phi.toFixed(1)} · δ <b>${phi > 28 ? 'tearing' : (dN * 1000).toFixed(0) + ' mm'}</b></div>`);
  if (sim) {
    const hull = sim.hullTorn * S * S;
    let free = 0; for (let i = 0; i < N; i++) free += FREE[i] && X[3 * i + 1] > -40;
    L1.push('<hr style="border:0;border-top:1px solid rgba(233,233,226,.13)">');
    L1.push(`<div class="lime">t <b>${tv < 1 ? (tv * 1000).toFixed(1) + ' ms' : tv.toFixed(2) + ' s'}</b> · rate <b>×${lastRate < .01 ? lastRate.toFixed(4) : lastRate.toFixed(2)}</b></div>`);
    if (sim.src) L1.push(`<div>${sim.src.label}</div><div>Blast <b>${sim.W.toFixed(0)}</b> kg TNT · gas from burning <b>${(sim.Wgas || 0).toFixed(0)}</b> kg TNT-eq</div>`);
    const nm = ['Lower fwd', 'Lower aft', 'Upper fwd', 'Upper aft'];
    for (let c = 0; c < 4; c++) if (GP[c] > 500 || c === sim.cc) L1.push(`<div>${nm[c]} gas <b>${fmtP(Math.max(0, GP[c]))}</b> · vent <b>${(OPEN[c * 5 + 4]).toFixed(1)}</b> m²</div>`);
    L1.push(`<div class="${hull > 0 ? 'hot' : ''}">Side torn <b>${hull.toFixed(2)}</b> m² · ${sim.torn} bonds</div>`);
    L1.push(`<div>Loose plate <b>${free}</b> nodes</div>`);
    if (sim.phase === 2) L1.push(`<div>Max set, side <b>${(sim.maxDef * 1000).toFixed(0)}</b> mm</div>`);
  }
  L1.push(`<div style="margin-top:8px">${N} nodes · ${NS} bonds · dt ${(dt * 1e6).toFixed(1)} µs</div>`);
  if (sim) L1.push(`<div>${sim.solver === 'xpbd' ? 'XPBD ' + (sim.hs * 1e6).toFixed(0) + ' µs' : sim.solver === 'gpu' ? 'GPU' : 'explicit'} · ${ANODES.length} live nodes${sim.patchR ? ' · patch ' + sim.patchR.toFixed(1) + ' m' : ''} · ${sim.cpu ? sim.cpu.toFixed(0) + ' ms cpu' : ''}</div>`);
  $('rd').innerHTML = L1.join('');
}

/* ------------------------------------------------------------------ input */
const sel = $('round');
ROUNDS.forEach(([n, kg], i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${n} · ${kg} kg`; sel.appendChild(o); });
const sync = () => { $('grid').value = st.grid; $('solver').value = st.solver; $('hs').value = st.hs; $('hsv').textContent = st.hs + ' µs'; $('patch').checked = st.patch; $('slow').innerHTML = `<b>S</b>${SPEED_NAMES[st.spd]}`; $('src').value = st.src; sel.value = st.round; $('kg').value = st.kg; $('fuze').value = st.fuze; $('standoff').value = st.standoff; $('mat').value = st.mat; $('h').value = st.h; };
sel.onchange = () => { st.round = +sel.value; st.kg = ROUNDS[st.round][1]; sync(); };
$('kg').onchange = () => { st.kg = Math.max(.01, +$('kg').value || .01); };
$('fuze').onchange = () => { st.fuze = $('fuze').value; };
$('src').onchange = () => { st.src = $('src').value; };
$('standoff').oninput = () => { st.standoff = +$('standoff').value; };
$('mat').onchange = () => { st.mat = $('mat').value; build(); };
$('h').oninput = () => { st.h = +$('h').value; build(); };
$('go').onclick = () => detonate();
$('reset').onclick = () => build();
$('view').onclick = () => { st.view ^= 1; };
$('slow').onclick = () => { st.spd = (st.spd + 1) % SPEEDS.length; $('slow').innerHTML = `<b>S</b>${SPEED_NAMES[st.spd]}`; };
$('solver').onchange = () => { st.solver = $('solver').value; };
$('hs').oninput = () => { st.hs = +$('hs').value; $('hsv').textContent = st.hs + ' µs'; };
$('patch').onchange = () => { st.patch = $('patch').checked; };
$('grid').onchange = () => { st.grid = +$('grid').value; build(); };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); detonate(); }
  else if (e.code === 'KeyR') build();
  else if (e.code === 'KeyV') st.view ^= 1;
  else if (e.code === 'KeyS') $('slow').click();
});
let drag = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0 }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.b === 2) { const b = mats(), k = cam.dist * .0016;
    for (let q = 0; q < 3; q++) cam.tgt[q] += (-b.right[q] * dx + b.up[q] * dy) * k; }
  else { cam.yaw -= dx * .005; cam.pitch = Math.max(-.5, Math.min(1.45, cam.pitch + dy * .005)); }
});
cv.addEventListener('pointerup', e => { if (drag && drag.moved < 4 && drag.b === 0) pick(e.clientX, e.clientY); drag = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(3, Math.min(160, cam.dist * Math.exp(e.deltaY * .001))); }, { passive: false });

function pick(mx, my) {
  const b = mats(), dpr = cv.width / innerWidth;
  const nx = (mx * dpr / cv.width) * 2 - 1, ny = 1 - (my * dpr / cv.height) * 2;
  const d = [0, 1, 2].map(q => b.fwd[q] + b.right[q] * nx / (b.f * b.a) + b.up[q] * ny / b.f);
  let best = null;
  if (d[2] < 0 && eye[2] > 0) { const t = -eye[2] / d[2], x = eye[0] + d[0] * t, y = eye[1] + d[1] * t;
    if (x > XA + .5 && x < XZ - .5 && y > YB + .3 && y < YD - .1) best = { t, p: [x, y, 0], n: [0, 0, 1] }; }
  if (d[1] < 0 && eye[1] > YD) { const t = (YD - eye[1]) / d[1], x = eye[0] + d[0] * t, z = eye[2] + d[2] * t;
    if (x > XA + .5 && x < XZ - .5 && z > ZI + .3 && z < -.1 && (!best || t < best.t)) best = { t, p: [x, YD, z], n: [0, 1, 0] }; }
  if (best) { st.aim = best.p; st.aimN = best.n; }
}

sync(); build();
requestAnimationFrame(draw);
// bench: run one case to the end and measure it; shape = every node's final displacement, to compare solvers
function runCase(cfg) {
  Object.assign(st, cfg); build(); detonate(); sim.sync = true;
  const t0 = performance.now(); let steps = 0;
  while (sim.t < sim.T1) { step(); steps++; }
  if (sim.solver === 'gpu') gpuFinish();
  const cpu = performance.now() - t0; sim.cpu = cpu; sim.phase = 2; settle();
  const by = [0, 0, 0, 0]; for (let q = 0; q < NS; q++) if (SBRK[q]) by[SURF[SA[q]]]++;
  let free = 0; for (let i = 0; i < N; i++) free += FREE[i];
  const shape = new Float32Array(N);
  for (let i = 0; i < N; i++) shape[i] = FREE[i] ? NaN : Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]);
  const areas = [0, 0, 0, 0]; for (let c = 0; c < NC; c++) if (CTORN[c]) areas[CSURF[c]] += S * S;
  return { areas: areas.map(a => +a.toFixed(2)), cpu: Math.round(cpu), steps, simMs: +(sim.t * 1000).toFixed(1), hullM2: +(sim.hullTorn * S * S).toFixed(2), torn: by, free,
    setMm: Math.round(sim.maxDef * 1000), live: ANODES.length, shape, cellsTorn: Uint8Array.from(CTORN) };
}
// compare a result with a reference: mean |difference| of the displacement field (mm) over nodes both kept,
// and how many cells are torn in one but not the other
function compare(a, r) {
  let s = 0, n = 0; for (let i = 0; i < a.shape.length; i++) { const x = a.shape[i], y = r.shape[i]; if (x === x && y === y) { s += Math.abs(x - y); n++; } }
  let diff = 0, both = 0; for (let c = 0; c < a.cellsTorn.length; c++) { if (a.cellsTorn[c] !== r.cellsTorn[c]) diff++; else if (a.cellsTorn[c]) both++; }
  return { dispErrMm: +(s / n * 1000).toFixed(1), tornDiffCells: diff, tornBothCells: both };
}
window.BLAST = { PROF, ver: 22, runCase, compare, cam, stepN(n) { for (let k = 0; k < n; k++) step(); return sim.t; }, st, detonate, build, draw, dbg: () => ({ FREE, SURF, SBRK, SA, SB, SL0, X, R0, N, NS, FIX, GP, OPEN, CTORN, CSURF }), tune(k, e) { TEAR_K = k; EF_MESH = e; }, get sim() { return sim; },
  // headless check: run the whole structural response now and report
  run() { const t0 = performance.now(); while (sim.t < sim.T1) step(); sim.phase = 2; settle();
    let free = 0; for (let i = 0; i < N; i++) free += FREE[i];
    return { ms: Math.round(performance.now() - t0), steps: Math.round(sim.T1 / dt), hullTorn_m2: sim.hullTorn * S * S, bonds: sim.torn, free, maxSet_mm: Math.round(sim.maxDef * 1000) }; } };
