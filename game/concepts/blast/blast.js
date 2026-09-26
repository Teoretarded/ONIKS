/* Blast test: a charge against a 24 m section of a destroyer's side, standalone (not part of the game).

   Load: Kinney-Graham free-air blast (peak overpressure, impulse), Rankine-Hugoniot normal reflection,
   oblique incidence by cos^2, triangular pressure pulse, shock arrival integrated from the shock Mach
   number, Hopkinson cube-root scaling. Inside a compartment the gas also builds a quasi-static pressure
   (~2.25 MPa (W/V)^0.72) that vents through the holes it tears.
   Structure: plating as a 0.25 m mass-spring lattice calibrated from the plate (k = E A / L, yield force
   sy A, fracture at a mesh-scale strain), elastic-perfectly-plastic springs (permanent set), compression
   capped low (thin plate buckles), frames and longitudinals as extra section area on their lines plus
   elastic-plastic ties to the rest of the ship. Explicit integration at the plate's stable step.
   The panel result is checked against the Nurick-Martin fit for blast-loaded plates (shown on screen). */

const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { antialias: false, alpha: false });
const $ = id => document.getElementById(id);

/* ------------------------------------------------------------------ constants */
const S = 0.25, P0 = 101325, G = 9.81;
const XA = -12, XZ = 12, YB = -2, YI = 3.5, YD = 7, ZI = -6, XBH = 6;
const FRAME = 10, LONG = 3;
let TEAR_K = .06, EF_MESH = .6;             // tuning: share of the tearing work, mesh-scale fracture strain factor
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

const st = { round: 7, kg: 120, fuze: 'contact', standoff: 3, mat: 'hsla', h: 10, view: 0, post: 1,
  aim: [0, 2.2, 0], aimN: [0, 0, 1] };

/* ------------------------------------------------------------------ small rng */
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/* ------------------------------------------------------------------ structure */
let UB, UN, UNB, KB, KBC, KBY, SC, RH, IMP, VC, NADJ, ADJ, DISC, N, X, V, F, M, R0, AREA, NRM, SURF, FIX, TK, TFY, TAN, LINKS, FREE, TBRK, SOOT, EPS, FRM;
let NS, SA, SB, SL0, SLP, SK, SFY, SEF, SBRK, SCELL;
let NC, CN, CSURF, CTORN, CU, CV2, DOTS_PER;
let dt = 2e-5;

function build() {
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
    const at = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const x = o[0] + (u[0] * i + v[0] * j) * S, y = o[1] + (u[1] * i + v[1] * j) * S, z = o[2] + (u[2] * i + v[2] * j) * S;
      const id = node(x, y, z, sid, n);
      at.push(id); mass[id] += m.rho * h * S * S; area[id] += S * S;
      if (m.rho * h > rh[id]) { rh[id] = m.rho * h; vc[id] = Math.sqrt(2 * TEAR_K * m.sy * m.ef / m.rho); }
      if (fu && i % fu === 0) { mass[id] += 7850 * heavy * S; tk[id] = Math.max(tk[id], 6e7); tfy[id] = Math.max(tfy[id], 16e3); frm[id] = 2; }
      else if (fv && j % fv === 0) { mass[id] += 7850 * light * S; tk[id] = Math.max(tk[id], 3e7); tfy[id] = Math.max(tfy[id], 5e3); frm[id] = Math.max(frm[id], 1); }
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
  plate(1, [XA, YD, ZI], [1, 0, 0], [0, 0, 1], (XZ - XA) / S, -ZI / S, .0095, [0, 1, 0], inner, FRAME, 4, 30e-4, 10e-4);
  plate(2, [XA, YI, ZI], [1, 0, 0], [0, 0, 1], (XZ - XA) / S, -ZI / S, .0065, [0, 1, 0], inner, FRAME, 4, 20e-4, 8e-4);
  plate(3, [XBH, YB, ZI], [0, 0, 1], [0, 1, 0], -ZI / S, (YD - YB) / S, .0065, [1, 0, 0], inner, 0, 4, 0, 8e-4);

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
  NC = csurf.length; CN = new Int32Array(cells); CSURF = new Int8Array(csurf); CTORN = new Uint8Array(NC);
  SCELL = new Int32Array(NS * 4).fill(-1);
  cellSprings.forEach((list, c) => list.forEach(s => { for (let q = 0; q < 4; q++) if (SCELL[4 * s + q] < 0) { SCELL[4 * s + q] = c; break; } }));
  // stable explicit step: the stiffest spring against the lighter of its nodes
  let w2 = 0;
  for (let s = 0; s < NS; s++) w2 = Math.max(w2, 4 * SK[s] / Math.min(M[SA[s]], M[SB[s]]));
  dt = .9 / Math.sqrt(w2);
  // render dots: a fixed pattern per cell (u, v in 0..1), density by surface
  DOTS_PER = [18, 12, 8, 8];
  let nd = 0; for (let c = 0; c < NC; c++) nd += DOTS_PER[CSURF[c]];
  CU = new Float32Array(nd); CV2 = new Float32Array(nd);
  seed = 7; for (let k = 0; k < nd; k++) { CU[k] = rnd(); CV2[k] = rnd(); }
  sim = null; bufDirty = true;
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

let sim = null;
function detonate() {
  if (sim) build();
  const W = st.kg, W3 = Math.cbrt(W);
  const rc = Math.cbrt(3 * W / (4 * Math.PI * 1600));          // charge radius (TNT ~1600 kg/m3)
  const a = st.aim, n = st.aimN;
  let C;
  if (st.fuze === 'inside') C = [a[0] - n[0] * 1.6, a[1] - n[1] * 1.6, a[2] - n[2] * 1.6];
  else { const d = st.fuze === 'contact' ? rc + .05 : st.standoff; C = [a[0] + n[0] * d, a[1] + n[1] * d, a[2] + n[2] * d]; }
  const inside = st.fuze === 'inside';
  const box = inside ? [C[0] < XBH ? XA : XBH, C[0] < XBH ? XBH : XZ, C[1] < YI ? YB : YI, C[1] < YI ? YI : YD, ZI, 0] : null;
  const PR = new Float32Array(N), TA = new Float32Array(N), TD = new Float32Array(N), DIR = new Float32Array(3 * N);
  const direct = [], shadow = [];
  for (let i = 0; i < N; i++) {
    if (FIX[i]) continue;
    const x = X[3 * i], y = X[3 * i + 1], z = X[3 * i + 2];
    const dx = x - C[0], dy = y - C[1], dz = z - C[2], R = Math.max(Math.hypot(dx, dy, dz), rc);
    const Z = Math.max(R / W3, .053);
    const Ps = kinneyPs(Z), Pr = reflect(Ps), is = kinneyIs(Z, W), ir = is * Math.pow(Pr / Ps, .75);
    let nx = NRM[3 * i], ny = NRM[3 * i + 1], nz = NRM[3 * i + 2];
    const c = Math.abs(nx * dx + ny * dy + nz * dz) / R, c2 = c * c;
    const P = Ps + (Pr - Ps) * c2, I = is + (ir - is) * c2;
    PR[i] = P; TD[i] = 2 * I / P; TA[i] = arrival(R, W);
    let load = 0;
    if (inside) {
      const e = 1e-3;
      if (Math.abs(x - box[0]) < e) { load = 1; nx = -1; ny = 0; nz = 0; }
      else if (Math.abs(x - box[1]) < e) { load = 1; nx = 1; ny = 0; nz = 0; }
      else if (Math.abs(y - box[2]) < e) { load = 1; nx = 0; ny = -1; nz = 0; }
      else if (Math.abs(y - box[3]) < e) { load = 1; nx = 0; ny = 1; nz = 0; }
      else if (Math.abs(z - box[5]) < e) { load = 1; nx = 0; ny = 0; nz = 1; }
      if (load && (x < box[0] - e || x > box[1] + e || y < box[2] - e || y > box[3] + e)) load = 0;
    } else {
      if (SURF[i] === 0 && Math.abs(z) < 1e-3 && C[2] > 0) { load = 1; nx = 0; ny = 0; nz = -1; }
      else if (Math.abs(y - YD) < 1e-3 && C[1] > YD) { load = 1; nx = 0; ny = -1; nz = 0; }
      else if (C[2] > 0 && z < -1e-3) load = 2;          // interior: only through a hole in the side
      if (load === 2) { const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1, sz = Math.sign(dz) || 1;
        nx = NRM[3 * i] * sx; ny = NRM[3 * i + 1] * sy; nz = NRM[3 * i + 2] * sz; }
    }
    DIR[3 * i] = nx; DIR[3 * i + 1] = ny; DIR[3 * i + 2] = nz;
    if (load === 1) direct.push(i); else if (load === 2) shadow.push(i);
    SOOT[i] = Math.max(0, 1 - R / (1.25 * fireR(W)));
  }
  const V0 = box ? (box[1] - box[0]) * (box[3] - box[2]) * (box[5] - box[4]) : 0;
  sim = { t: 0, phase: 1, W, C, rc, inside, box, PR, TA, TD, DIR, direct: Int32Array.from(direct), shadow: Int32Array.from(shadow),
    qs: inside ? 2.25e6 * Math.pow(W / V0, .72) : 0, V0, vent: 0, T1: .03 + .012 * W3, post: 0, torn: 0, hullTorn: 0,
    frags: makeFrags(C, W), maxDef: 0, rate: 0, n: 0, tLoad: 0, cellsTorn: 0 };
  // breach: plating whose specific impulse exceeds rho h v_c tears out; radial cracks run on from the rim (petals)
  const SPEC = new Float64Array(N);
  const loaded = inside ? direct : direct;
  let rb = 0;
  for (const i of loaded) { SPEC[i] = PR[i] * TD[i] / 2; if (SPEC[i] / RH[i] > VC[i]) { DISC[i] = 1; if (SURF[i] === (st.aimN[2] ? 0 : 1)) rb = Math.max(rb, Math.hypot(X[3 * i] - a[0], X[3 * i + 1] - a[1], X[3 * i + 2] - a[2])); } }
  for (const i of loaded) if (DISC[i]) for (let k = NADJ[i]; k < NADJ[i + 1]; k++) if (!SBRK[ADJ[k]]) breakBond(ADJ[k], 0);
  if (rb > 0) {
    seed = 1 + Math.round(W * 13);
    const nCr = 4 + Math.floor(rnd() * 4), th0 = rnd() * 6.28, crack = [];
    for (let c = 0; c < nCr; c++) crack.push({ th: th0 + c * 6.2832 / nCr + (rnd() - .5) * .5, len: rb * (1.4 + rnd() * .9) });
    for (let q = 0; q < NS; q++) {
      if (SBRK[q]) continue;
      const ia = SA[q], ib = SB[q]; if (!(SURF[ia] === SURF[ib])) continue;
      const mx = (X[3 * ia] + X[3 * ib]) / 2 - a[0], my = (X[3 * ia + 1] + X[3 * ib + 1]) / 2 - a[1], mz = (X[3 * ia + 2] + X[3 * ib + 2]) / 2 - a[2];
      // in-plane coordinates of the struck face
      const u = st.aimN[2] ? mx : mx, v = st.aimN[2] ? my : mz, r = Math.hypot(u, v);
      if (Math.abs(st.aimN[2] ? mz : my) > .05 || r < rb * .8) continue;
      const th = Math.atan2(v, u);
      for (const c of crack) { let d = th - c.th; d -= Math.round(d / 6.2832) * 6.2832;
        if (r < c.len && Math.abs(d) * r < S * .6) { breakBond(q, 0); break; } }
    }
  }
  sim.breach = rb;
  let tl = 0; for (const i of direct) tl = Math.max(tl, TA[i] + TD[i]); sim.tLoad = inside ? .03 + .01 * W3 : Math.min(tl, .02 + .004 * W3);
}

const fireR = W => .5 * 3.86 * Math.pow(W, .32);                // fireball radius, m

function makeFrags(C, W) {
  if (W < .5) return null;
  const n = 260, P = new Float32Array(n * 3), D = new Float32Array(n * 3), SP = new Float32Array(n), HIT = new Float32Array(n).fill(-1);
  seed = 99;
  for (let k = 0; k < n; k++) {
    const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u);
    D[3 * k] = r * Math.cos(th); D[3 * k + 1] = u; D[3 * k + 2] = r * Math.sin(th);
    SP[k] = 1500 + 500 * rnd();
    P[3 * k] = C[0]; P[3 * k + 1] = C[1]; P[3 * k + 2] = C[2];
  }
  return { n, P, D, SP, HIT };
}

/* ------------------------------------------------------------------ integration */
function breakBond(q, t) {
  const s = sim, a = SA[q], b = SB[q];
  SBRK[q] = 1; s.torn++;
  if (--LINKS[a] <= 0 && !FIX[a]) FREE[a] = 1;
  if (--LINKS[b] <= 0 && !FIX[b]) FREE[b] = 1;
  if (TBRK[a] < 0) TBRK[a] = t; if (TBRK[b] < 0) TBRK[b] = t;
  for (let k = 0; k < 4; k++) { const c = SCELL[4 * q + k]; if (c >= 0 && !CTORN[c]) { CTORN[c] = 1; if (CSURF[c] === 0) s.hullTorn++; s.cellsTorn++; } }
}
function step() {
  const s = sim, t = s.t, h = dt;
  F.fill(0);
  for (let q = 0; q < NS; q++) {
    if (SBRK[q]) continue;
    const a = SA[q], b = SB[q];
    const dx = X[3 * b] - X[3 * a], dy = X[3 * b + 1] - X[3 * a + 1], dz = X[3 * b + 2] - X[3 * a + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz), L0 = SL0[q];
    if (L - L0 > SEF[q] * L0) { breakBond(q, t); continue; }   // fracture
    const k = SK[q], fy = SFY[q];
    let f = k * (L - SLP[q]);
    if (f > fy) { SLP[q] = L - fy / k; f = fy; }
    else if (f < -.12 * fy) { SLP[q] = L + .12 * fy / k; f = -.12 * fy; }      // thin plate buckles early in compression
    f += SC[q] * ((V[3 * b] - V[3 * a]) * dx + (V[3 * b + 1] - V[3 * a + 1]) * dy + (V[3 * b + 2] - V[3 * a + 2]) * dz) / L;
    const inv = f / L;
    F[3 * a] += dx * inv; F[3 * a + 1] += dy * inv; F[3 * a + 2] += dz * inv;
    F[3 * b] -= dx * inv; F[3 * b + 1] -= dy * inv; F[3 * b + 2] -= dz * inv;
  }
  // frames and longitudinals: elastic-plastic ties to the rest of the ship
  for (let i = 0; i < N; i++) {
    const k = TK[i]; if (!k || FREE[i]) continue;
    const dx = X[3 * i] - TAN[3 * i], dy = X[3 * i + 1] - TAN[3 * i + 1], dz = X[3 * i + 2] - TAN[3 * i + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < 1e-9) continue;
    let f = k * d; const fy = TFY[i];
    if (f > fy) { const back = fy / k / d; TAN[3 * i] = X[3 * i] - dx * back; TAN[3 * i + 1] = X[3 * i + 1] - dy * back; TAN[3 * i + 2] = X[3 * i + 2] - dz * back; f = fy; }
    const inv = f / d;
    F[3 * i] -= dx * inv; F[3 * i + 1] -= dy * inv; F[3 * i + 2] -= dz * inv;
  }
  // blast: triangular pulse after arrival, plus the confined gas pressure inside
  const qs = s.qs ? s.qs * Math.min(1, t / .003) * Math.exp(-s.vent) : 0;
  const push = i => {
    let p = 0; const tl = t - s.TA[i];
    if (tl > 0 && tl < s.TD[i]) p = s.PR[i] * (1 - tl / s.TD[i]);
    if (qs && tl > 0) p += qs;
    if (p <= 0) return;
    const f = p * AREA[i];
    F[3 * i] += s.DIR[3 * i] * f; F[3 * i + 1] += s.DIR[3 * i + 1] * f; F[3 * i + 2] += s.DIR[3 * i + 2] * f;
  };
  for (let k = 0; k < s.direct.length; k++) push(s.direct[k]);
  if (s.hullTorn) {                                // interior surfaces seen through the torn side
    const C = s.C, nu = (XZ - XA) / S;
    for (let k = 0; k < s.shadow.length; k++) {
      const i = s.shadow[k], nz = X[3 * i + 2];
      const u = C[2] / (C[2] - nz), ix = C[0] + u * (X[3 * i] - C[0]), iy = C[1] + u * (X[3 * i + 1] - C[1]);
      const ci = Math.floor((ix - XA) / S), cj = Math.floor((iy - YB) / S);
      if (ci < 0 || ci >= nu || cj < 0 || cj >= (YD - YB) / S) continue;
      if (CTORN[cj * nu + ci]) push(i);
    }
  }
  if (s.qs) s.vent += s.cellsTorn * S * S * 900 / s.V0 * h;     // gas escaping through every tear
  // symplectic Euler with light damping
  // bending
  for (let i = 0; i < N; i++) {
    const kb = KB[i]; if (!kb || FREE[i]) continue;
    let mx = 0, my = 0, mz = 0, vx = 0, vy = 0, vz = 0, n = 0;
    for (let k = UNB[i]; k < UNB[i + 1]; k++) { const q = UN[k]; if (SBRK[q]) continue; const j = SA[q] === i ? SB[q] : SA[q];
      mx += X[3 * j]; my += X[3 * j + 1]; mz += X[3 * j + 2]; vx += V[3 * j]; vy += V[3 * j + 1]; vz += V[3 * j + 2]; n++; }
    if (n < UNB[i + 1] - UNB[i]) continue;          // an edge of a tear bends freely
    const ex = mx / n - X[3 * i] - UB[3 * i], ey = my / n - X[3 * i + 1] - UB[3 * i + 1], ez = mz / n - X[3 * i + 2] - UB[3 * i + 2];
    const e = Math.sqrt(ex * ex + ey * ey + ez * ez); let f = kb * e;
    if (f > KBY[i]) { const back = (f - KBY[i]) / kb / e; UB[3 * i] += ex * back; UB[3 * i + 1] += ey * back; UB[3 * i + 2] += ez * back; f = KBY[i]; }
    const g = e > 1e-12 ? f / e : 0, c = KBC[i];
    F[3 * i] += ex * g + c * (vx / n - V[3 * i]); F[3 * i + 1] += ey * g + c * (vy / n - V[3 * i + 1]); F[3 * i + 2] += ez * g + c * (vz / n - V[3 * i + 2]);
  }
  const damp = 1 - (t > s.tLoad ? 250 : 30) * h;
  for (let i = 0; i < N; i++) {
    if (FIX[i]) continue;
    const im = h / M[i];
    let vx = (V[3 * i] + F[3 * i] * im) * damp, vy = (V[3 * i + 1] + (F[3 * i + 1] * im) - (FREE[i] ? G * h : 0)) * damp, vz = (V[3 * i + 2] + F[3 * i + 2] * im) * damp;
    V[3 * i] = vx; V[3 * i + 1] = vy; V[3 * i + 2] = vz;
    X[3 * i] += vx * h; X[3 * i + 1] += vy * h; X[3 * i + 2] += vz * h;
  }
  s.t += h;
  if (++s.n % 200 === 0 && s.t > s.tLoad) {
    let v2 = 0; for (let i = 0; i < N; i++) if (!FREE[i] && !FIX[i]) { const q = V[3 * i] * V[3 * i] + V[3 * i + 1] * V[3 * i + 1] + V[3 * i + 2] * V[3 * i + 2]; if (q > v2) v2 = q; }
    if (v2 < 1) s.T1 = s.t;                       // settled early
  }
}

function settle() {                                // end of the structural response: the plate keeps its set
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
  const W = sim.W, Rm = fireR(W), W3 = Math.cbrt(W);
  const tau = .006 * W3, life = .35 * W3 + .4;
  const R = Rm * (1 - Math.exp(-tv / tau));
  const glow = tv < life ? Math.max(0, 1 - tv / life) * (tv < tau ? tv / tau : 1) * 1.4 : 0;
  return { R, tau, life, glow, Rm };
}

let frameT = performance.now(), lastRate = 0;
function draw(now) {
  const rdt = Math.min(.05, (now - frameT) / 1000); frameT = now;
  // --- advance
  if (sim && sim.phase === 1) {
    const t0 = performance.now(), ts = sim.t;
    while (performance.now() - t0 < 12 && sim.t < sim.T1) for (let k = 0; k < 25 && sim.t < sim.T1; k++) step();
    lastRate = rdt > 0 ? (sim.t - ts) / rdt : 0;
    if (sim.t >= sim.T1) { sim.phase = 2; settle(); }
  } else if (sim && sim.phase === 2) {
    const h = rdt * st.post; sim.post += h; ballistic(h); lastRate = st.post;
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
    const C = sim.C, fb = fireball(tv);
    // shock front: a thin shell while it is still close
    if (tv < .06 * Math.cbrt(sim.W)) {
      let Rs = 0; for (let r = .1; r < 80; r *= 1.04) { if (arrival(r, sim.W) > tv) break; Rs = r; }
      const fade = 1 - tv / (.06 * Math.cbrt(sim.W));
      seed = 3;
      for (let q = 0; q < NSH; q++) {
        const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u);
        const x = C[0] + Rs * r * Math.cos(th), y = C[1] + Rs * u, z = C[2] + Rs * r * Math.sin(th);
        if (!sim.inside && z < -.05) continue;
        if (sim.inside && (x < sim.box[0] || x > sim.box[1] || y < sim.box[2] || y > sim.box[3] || z < ZI || z > 0)) continue;
        put(x, y, z, .78 * fade, .96 * fade, .2 * fade, .05);
      }
    }
    // fireball, then smoke drifting up and downwind
    seed = 11;
    const rise = Math.max(0, tv - fb.tau * 4) * 2.2 * Math.cbrt(sim.W) * .4;
    for (let q = 0; q < NFB; q++) {
      const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u), rr = Math.cbrt(rnd());
      const age = tv / fb.life, grow = 1 + Math.max(0, tv - fb.life) * .25;
      let x = C[0] + fb.R * grow * rr * r * Math.cos(th) + rise * .35, y = C[1] + fb.R * grow * rr * u + rise, z = C[2] + fb.R * grow * rr * r * Math.sin(th);
      if (!sim.inside && z < 0 && y < YD) continue;
      if (sim.inside && tv < .2 && (x < sim.box[0] || x > sim.box[1] || y < sim.box[2] || y > sim.box[3] || z < ZI)) continue;
      let cr, cg, cb;
      if (age < 1) { const hot = Math.max(0, 1 - age * 1.4) * (1 - rr * .5);
        cr = .95 + .05 * hot; cg = .45 + .5 * hot; cb = .12 + .7 * hot * hot;
        const dim = .35 + .65 * (1 - age); cr *= dim; cg *= dim; cb *= dim; }
      else { const s = Math.max(0, .34 - (age - 1) * .02) * (.6 + .4 * rnd()); cr = s; cg = s * .97; cb = s * .92; }
      if (cr + cg + cb < .03) continue;
      put(x, y, z, cr, cg, cb, .08);
    }
    // casing fragments: short streaks, sparks where they strike the side
    const fr = sim.frags;
    if (fr && tv < .06) {
      for (let q = 0; q < fr.n; q++) {
        let tmax = tv;
        if (!sim.inside && fr.D[3 * q + 2] < 0 && sim.C[2] > 0) tmax = Math.min(tv, sim.C[2] / (-fr.D[3 * q + 2] * fr.SP[q]));
        for (let s = 0; s < 5; s++) {
          const tt = tmax - s * .00025; if (tt <= 0) break;
          const d = fr.SP[q] * tt;
          put(C[0] + fr.D[3 * q] * d, C[1] + fr.D[3 * q + 1] * d, C[2] + fr.D[3 * q + 2] * d, 1, .8 - s * .1, .45 - s * .08, .05);
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
    if (sim.qs) L1.push(`<div>Gas pressure <b>${fmtP(sim.qs * Math.exp(-sim.vent))}</b> venting</div>`);
    L1.push(`<div class="${hull > 0 ? 'hot' : ''}">Side torn <b>${hull.toFixed(2)}</b> m² · ${sim.torn} bonds</div>`);
    L1.push(`<div>Loose plate <b>${free}</b> nodes</div>`);
    if (sim.phase === 2) L1.push(`<div>Max set, side <b>${(sim.maxDef * 1000).toFixed(0)}</b> mm</div>`);
  }
  L1.push(`<div style="margin-top:8px">${N} nodes · ${NS} bonds · dt ${(dt * 1e6).toFixed(1)} µs</div>`);
  $('rd').innerHTML = L1.join('');
}

/* ------------------------------------------------------------------ input */
const sel = $('round');
ROUNDS.forEach(([n, kg], i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${n} · ${kg} kg`; sel.appendChild(o); });
const sync = () => { sel.value = st.round; $('kg').value = st.kg; $('fuze').value = st.fuze; $('standoff').value = st.standoff; $('mat').value = st.mat; $('h').value = st.h; };
sel.onchange = () => { st.round = +sel.value; st.kg = ROUNDS[st.round][1]; sync(); };
$('kg').onchange = () => { st.kg = Math.max(.01, +$('kg').value || .01); };
$('fuze').onchange = () => { st.fuze = $('fuze').value; };
$('standoff').oninput = () => { st.standoff = +$('standoff').value; };
$('mat').onchange = () => { st.mat = $('mat').value; build(); };
$('h').oninput = () => { st.h = +$('h').value; build(); };
$('go').onclick = () => detonate();
$('reset').onclick = () => build();
$('view').onclick = () => { st.view ^= 1; };
$('slow').onclick = () => { st.post = st.post === 1 ? .25 : st.post === .25 ? .1 : 1; $('slow').innerHTML = `<b>S</b>×${st.post}`; };
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
window.BLAST = { ver: 8, cam, stepN(n) { for (let k = 0; k < n; k++) step(); return sim.t; }, st, detonate, build, draw, dbg: () => ({ FREE, SURF, SBRK, SA, SB, SL0, X, R0, N, NS, FIX }), tune(k, e) { TEAR_K = k; EF_MESH = e; }, get sim() { return sim; },
  // headless check: run the whole structural response now and report
  run() { const t0 = performance.now(); while (sim.t < sim.T1) step(); sim.phase = 2; settle();
    let free = 0; for (let i = 0; i < N; i++) free += FREE[i];
    return { ms: Math.round(performance.now() - t0), steps: Math.round(sim.T1 / dt), hullTorn_m2: sim.hullTorn * S * S, bonds: sim.torn, free, maxSet_mm: Math.round(sim.maxDef * 1000) }; } };
