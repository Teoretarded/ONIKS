/* Blast test bench: steel ship structure under air-blast loading (standalone, not part of the game).

   Structure (a shell finite-element model on a structured quad mesh of panels):
   - Membrane: every quad cell is 4 crossed constant-strain triangles (two diagonal splits, h/2 each: no hourglass
     modes, near-isotropic), corotational (polar decomposition), plane-stress J2 plasticity with linear hardening and
     Cowper-Symonds rate hardening (Simo & Taylor 1986 plane-stress return map; Cowper & Symonds 1957; Jones,
     Structural Impact 2012). Lumped mass.
   - Bending: dihedral-angle hinges on every cell edge shared by two cells (discrete shells: Grinspun et al. 2003,
     gradients from Bridson et al. 2003 / Tamstorf & Grinspun 2013), stiffness D |e| / d, elastic-plastic with the
     plastic moment sy h^2/4 per unit length reduced by the membrane utilisation (M/Mp + (N/Np)^2 = 1, Jones 2012).
     Plate junctions (deck/side, bulkhead/deck) are hinges too, so welded joints carry moment.
   - Stiffeners (frames, longitudinals, deck beams, bulkhead stiffeners): their own axial elements (truss, area of the
     stiffener) plus their bending (composite tee with attached plating, Timoshenko-reduced for short elements) added
     to the hinges they cross; they fail at the GL strain of their web.
   - Fracture: a cell is removed (erosion) when its accumulated equivalent plastic strain in non-compressive states
     (triaxiality > -1/3, Bao & Wierzbicki 2004 cut-off) plus the plastic bending strain reaches the mesh-regularised
     GL failure strain eps_f = 0.056 + 0.54 t / l_e (Germanischer Lloyd; Scharrer, Zhang & Egge 2002; Zhang et al.
     2004). Discing/plugging under near-contact loads is tensile tearing at the rim of the loaded area (Nurick &
     Radford 1997), which this criterion produces; a separate transverse-shear (mode III) band is thinner than the
     plate (~h) and cannot be resolved by cells of 6-25 h, so it is not modelled separately. Petals, cracks and
     plugs are whatever that produces; nothing is scripted.
   - Boundaries where the ship continues: elastic-plastic anchors (continuation stiffness E h b / Lc, yield sy h b)
     with Lysmer-Kuhlemeyer (1969) dashpots rho c h b so waves leave instead of reflecting.
   - Plating below the waterline is water-backed: acoustic radiation pressure rho_w c_w v_n, limited in suction by
     cavitation (Taylor 1941 plate theory).

   Loads (in time, nothing decided up front):
   - Air shock: Kinney-Graham free-air overpressure and impulse (Hopkinson scaling), Rankine-Hugoniot normal
     reflection, obliquity by cos^2, triangular pulse, arrival from the shock speed.
   - Near field: the detonation products carry the charge's momentum W U (U = mean product speed of a homologous
     Gurney sphere, TNT E_G = 2.98 MJ/kg, Cooper 1996); a plate element receives W U cos^2 a / (4 pi R^2) (fully
     stagnating products), arriving as the products' velocity spread (front R / u_max, pulse ~ t^-5). The larger of
     this and the air shock is applied. This replaces the old Z >= 0.053 cap on contact loading.
   - Holes: a torn opening is a secondary source on the far side (the aperture re-radiates what passed through it,
     Lambert-distributed): energy and momentum through a cell = the source's share by solid angle, times the part of
     its pulse that arrives after the cell opened. Openings in outside plating also let the detonation products into
     the compartment (their quasi-static pressure).
   - Confined reflections: first-order image sources across each wall of the compartment (weakened by the torn share
     of that wall); outside, the sea surface reflects.
   - Gas: every compartment is a lumped volume; detonations inside (and products coming in) give the quasi-static
     pressure 2.25 MPa (W/V)^0.72 (UFC 3-340-02 fit); gas vents through the torn area (orifice flow of hot products).
   - Casing fragments: Gurney velocity, Fisher/Fano blast reduction for cased charges, deterministic spray, ray-traced
     through the structure; each impact perforates (Recht-Ipson plugging) or embeds, passes its momentum, holes the
     plate (net-section damage).
   Explicit central-difference time steps at the stable step. The GPU solver (gpu.js) runs the same model. */

const { createGPU } = await import('./gpu.js?v=' + Date.now());
// WebGPU compute backend (gpu_wgpu.js) when the browser has it; WebGL2 (gpu.js) otherwise and for blocking (headless) runs
let WG = null, createWGPU = null;
try { if (navigator.gpu) { const m = await import('./gpu_wgpu.js?v=' + Date.now()); WG = await m.initWebGPU(); createWGPU = m.createWGPU; } } catch (e) { console.warn('WebGPU unavailable', e); WG = null; }
const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { antialias: false, alpha: false });
const $ = id => document.getElementById(id);

/* ------------------------------------------------------------------ constants and data */
const P0 = 101325, G = 9.81, RHO_W = 1025, C_W = 1500;
const E_G = 2.98e6;                                  // TNT Gurney energy, J/kg (sqrt(2 E_G) = 2.44 km/s)
const U_MAX = Math.sqrt(10 * E_G / 3), U_MEAN = .75 * U_MAX;   // homologous product sphere: front speed, mean |u|
const RHO_TNT = 1600, K_SHEAR = 1.0, LC_BOUND = 2.0;
// materials: E, yield, linear hardening H, Cowper-Symonds D (1/s) and q, GL failure-strain constants
const MATS = [
  { key: 'hsla', name: 'HSLA-80', rho: 7850, E: 207e9, nu: .3, sy: 550e6, H: 1.0e9, D: 3200, q: 5, Du: 3200, qu: 5, eu: .15, eg: .056, ee: .54 },
  { key: 'hts', name: 'HTS', rho: 7850, E: 204e9, nu: .3, sy: 324e6, H: .9e9, D: 40.4, q: 5, Du: 6844, qu: 3.91, eu: .2, eg: .056, ee: .54 },
  { key: 'mild', name: 'mild steel', rho: 7850, E: 200e9, nu: .3, sy: 235e6, H: .9e9, D: 40.4, q: 5, Du: 6844, qu: 3.91, eu: .2, eg: .056, ee: .54 },
  { key: 'alu', name: 'Al 5456', rho: 2660, E: 70e9, nu: .33, sy: 228e6, H: .5e9, D: 6500, q: 4, Du: 6500, qu: 4, eu: .1, eg: .034, ee: .32 },
];
const MATI = Object.fromEntries(MATS.map((m, i) => [m.key, i]));
// Cowper-Symonds rate factor with the constants moving from their initial-yield values to their large-strain values
// as plastic strain grows (Jones 1989, Structural Impact 2012 sec. 8.4: mild steel D 40.4 -> 6844 /s, q 5 -> 3.91)
const csf = (m, ed, ep) => { if (st.noRate) return 1; const f = Math.min(1, ep / m.eu), D = m.D + (m.Du - m.D) * f, q = m.q + (m.qu - m.q) * f; return 1 + Math.pow(Math.min(ed, 1e4) / D, 1 / q); };
// warheads: fill as TNT equivalent, casing mass, typical fragment mass (approximate public figures)
const ROUNDS = [
  ['30 mm HE', .05, .3, .002], ['76 mm HE', .75, 5.5, .008], ['127 mm HE', 3.2, 28, .015], ['Hellfire', 5, 4, .005],
  ['SM-6 · blast-frag', 30, 34, .01], ['Kh-35', 65, 80, .03], ['Harpoon', 100, 120, .03], ['P-800 Oniks', 120, 130, .03],
  ['Kalibr · Tomahawk', 200, 250, .04], ['Mk 84 bomb', 460, 500, .05],
];
// stiffener sections (tee: web height/thickness, flange breadth/thickness, m), approximate destroyer scantlings
const SEC = {
  sideLong: { hw: .18, tw: .006, bf: .09, tf: .008 }, sideFrame: { hw: .4, tw: .008, bf: .15, tf: .012 },
  deckLong: { hw: .15, tw: .006, bf: .075, tf: .008 }, deckBeam: { hw: .3, tw: .007, bf: .12, tf: .01 },
  d2Long: { hw: .125, tw: .005, bf: .06, tf: .006 }, d2Beam: { hw: .25, tw: .006, bf: .1, tf: .008 },
  bhdStiff: { hw: .15, tw: .006, bf: .075, tf: .008 },
};

const st = { backend: 'auto', wgBatch: 200, wgDepth: 3, relaxAt: 0, patchL: 0, beamM: 0, fineR: 0, uniformGrid: false, plate: null, scene: 'box', grid: .125, solver: 'gpu', spd: 0, src: 'charge', round: 7, kg: 120, casing: 130, fuze: 'contact',
  standoff: 3, mat: 'hsla', h: 10, view: 0, msc: 1, frags: true, aim: [0, 2.2, 0], aimN: [0, 0, 1] };

/* ------------------------------------------------------------------ small helpers */
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => mul(a, 1 / (len(a) || 1));
const glf = (m, t, le) => m.eg + m.ee * Math.min(.2, t / le);          // GL failure strain (valid for le/t >= 5)
// compressive knock-down of a plating cell's membrane yield (1 = none): cells too coarse to fold stand in for the
// folds they cannot form (see BENCH.md, grid convergence); st.kComp forces a value
// Calibrated on the side-push case (120 kg at 5 m on the section: the deck edge folds at the side seam, which
// needs cells ~ fold length / 10 to resolve): the knock-down that makes each grid give the 0.0156 m grid's side and
// seam displacements, tabled against S / H, H = 0.9 (b^2 t)^(1/3) the fold length (b = 1 m); band 0.6 m from a seam.
// Failure is judged on the damage averaged over a square round the cell (area-weighted over the cells it overlaps,
// same piece), side LREG = 0.2 m or two cells, whichever is longer, with the GL failure strain for that length: no cell
// fails on its own peak, so the tear front stops depending on how many cells cross it (st.lReg; 0: each cell on its
// own). 120 kg contact, reduced section, torn at 30 ms: 2.56 / 2.13 / 2.51 / 2.47 m² at 0.25 / 0.125 / 0.0625 /
// 0.031 m (each cell on its own: 4.4 / 2.2 / 2.5 / 2.5)
const LREG = () => st.lReg === undefined || st.lReg === null ? .2 : st.lReg;
const lrOf = lc => LREG() > 0 ? Math.max(LREG(), 2 * lc) : 0;
// Cells that reached failure can be made to erode only every Nth step (st.erodeEvery; default 1: at once). A window
// of 5-25 steps lets mirror cells at failure within round-off go together, but the batched release worsens the
// contact momentum balance (|r x F| 6.6 / 7.3 / 10.3 kN m at 1 / 2 / 5 steps, limit 7.4; mirror asymmetry 7.3 / 6.1 / 6.2 %, 2.8 % at 25), so it is off by default.
let ERODE = true;
const erodeNow = n => { const e = st.erodeEvery || 1; return e <= 1 || n % e === 0; };
const JMIN = () => st.jmin === undefined ? .25 : st.jmin;            // a cell squashed to this area ratio erodes
const KC_EPS = () => st.kEps === undefined || st.kEps === null ? .004 : st.kEps;
const KC_TAB = [[.093, 1], [.186, .4], [.372, .15], [.744, .12], [1.49, .03]];
function kcLaw(S_, t) {
  const x = S_ / (.9 * Math.cbrt(t || .0065)), T = KC_TAB;
  if (x <= T[0][0]) return 1; if (x >= T[T.length - 1][0]) return T[T.length - 1][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const f = Math.log(x / T[i - 1][0]) / Math.log(T[i][0] / T[i - 1][0]); return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * f; }
  return 1;
}
const compKnock = (m, t, le, ds) => { const band = st.kBand || .6; if (!(ds <= Math.max(le * .5, band))) return 1;
  if (st.kComp) return st.kComp; return st.kLaw !== false ? kcLaw(S, t) : 1; };

// tee stiffener with attached plating: stiffener area, composite I and plastic modulus, extreme fibre, web area
function tee(s, be, tp) {
  const R = [[be, -tp, 0], [s.tw, 0, s.hw], [s.bf, s.hw, s.hw + s.tf]];   // [width, y0, y1]
  let A = 0, Ay = 0; for (const [b, y0, y1] of R) { A += b * (y1 - y0); Ay += b * (y1 - y0) * (y0 + y1) / 2; }
  const na = Ay / A; let I = 0;
  for (const [b, y0, y1] of R) { const t = y1 - y0, yc = (y0 + y1) / 2; I += b * t * t * t / 12 + b * t * (yc - na) ** 2; }
  let lo = -tp, hi = s.hw + s.tf;                                       // plastic neutral axis: equal areas
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; let below = 0; for (const [b, y0, y1] of R) below += b * Math.max(0, Math.min(y1, m) - y0);
    if (below < A / 2) lo = m; else hi = m; }
  const yp = (lo + hi) / 2; let Zp = 0;
  for (const [b, y0, y1] of R) {
    if (yp <= y0) Zp += b * ((y1 - yp) ** 2 - (y0 - yp) ** 2) / 2; else if (yp >= y1) Zp += b * ((yp - y0) ** 2 - (yp - y1) ** 2) / 2;
    else Zp += b * ((yp - y0) ** 2 + (y1 - yp) ** 2) / 2;
  }
  return { A: s.tw * s.hw + s.bf * s.tf, I, Zp, c: Math.max(na + tp, s.hw + s.tf - na), Aw: s.tw * s.hw, d: s.hw + s.tf, tw: s.tw };
}

/* ------------------------------------------------------------------ scenes */
// A scene gives pieces: structured grids of cells cut from its plating (a rectangle, a curved shell strip, a polygon
// on a grid), each with thickness, material, stiffener lines (grid rows/columns), open edges (where the ship continues
// past the model), and the compartments on each side. build() joins them into one mesh.
function rectPiece(P) {
  const Lu = len(sub(P.p10, P.p00)), Lv = len(sub(P.p01, P.p00));
  const nu = Math.max(1, Math.round(Lu / S)), nv = Math.max(1, Math.round(Lv / S));
  const G = new Float64Array(3 * (nu + 1) * (nv + 1));
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, o = 3 * (j * (nu + 1) + i);
    for (let q = 0; q < 3; q++) G[o + q] = P.p00[q] * (1 - u) * (1 - v) + P.p10[q] * u * (1 - v) + P.p01[q] * (1 - u) * v + P.p11[q] * u * v;
  }
  const lines = [];
  for (const s of P.stiff || []) {
    const Lx = s.along === 'u' ? Lv : Lu, nn = s.along === 'u' ? nv : nu;
    for (let q = 1; q * s.every < Lx - 1e-6; q++) { const g = Math.round(q * s.every / Lx * nn); if (g > 0 && g < nn) lines.push({ along: s.along, g, sec: s.sec, spacing: s.every }); }
  }
  return { name: P.name, kind: P.kind, nu, nv, G, mask: null, h: P.h, mat: P.mat, n: nrm(cross(sub(P.p10, P.p00), sub(P.p01, P.p00))), sides: null, wet: null,
    lines, open: P.open || [0, 0, 0, 0], planar: true };
}
function sceneBox() {
  // st.boxX / st.boxZ shrink the section (half-length along x, deck width) for grid studies; default 15 / 10 m
  const bx = st.boxX || 15, XA = -bx, XZ = bx, YB = -2, YI = 3.5, YD = 7, ZC = -(st.boxZ || 10), XB = [-10, 5], ZF = -20;
  // st.plates: per-plate overrides by name, { 'second deck': { h: .009, mat: 'hsla' } } (thickness m, material key)
  const P = (name, kind, o, U, V, h, mat, stiff, open) => { const q = st.plates && st.plates[name];
    return { name, kind, p00: o, p10: add(o, U), p01: add(o, V), p11: add(add(o, U), V), h: q && q.h ? q.h : h, mat: q && q.mat ? MATI[q.mat] : mat, stiff, open }; };
  const sm = MATI[st.mat], mild = MATI.mild;
  const panels = [
    P('side', 0, [XA, YB, 0], [XZ - XA, 0, 0], [0, YD - YB, 0], st.h / 1000, sm,
      [{ along: 'u', every: .75, sec: SEC.sideLong }, { along: 'v', every: 2.5, sec: SEC.sideFrame }], [1, 1, 1, 0]),
    P('weather deck', 1, [XA, YD, 0], [XZ - XA, 0, 0], [0, 0, ZC], .0095, mild,
      [{ along: 'u', every: 1, sec: SEC.deckLong }, { along: 'v', every: 2.5, sec: SEC.deckBeam }], [1, 1, 0, 1]),
    P('second deck', 2, [XA, YI, 0], [XZ - XA, 0, 0], [0, 0, ZC], .0065, mild,
      [{ along: 'u', every: 1, sec: SEC.d2Long }, { along: 'v', every: 2.5, sec: SEC.d2Beam }], [1, 1, 0, 1]),
    P('platform deck', 2, [XA, YB, 0], [XZ - XA, 0, 0], [0, 0, ZC], .008, mild,
      [{ along: 'u', every: 1, sec: SEC.d2Long }, { along: 'v', every: 2.5, sec: SEC.d2Beam }], [1, 1, 0, 1]),
    ...XB.filter(x => Math.abs(x) < bx).map(x => P('bulkhead x=' + x, 3, [x, YB, 0], [0, 0, ZC], [0, YD - YB, 0], .0065, mild,
      [{ along: 'v', every: .75, sec: SEC.bhdStiff }], [0, 1, 1, 0])),
  ];
  // frame brackets: at every frame station where a deck meets the side, a square of the frame's web plate (legs
  // ~ the frame's depth, on grid lines) joins the frame and the deck beam, above and below the deck. The frame's end
  // reaction goes into the deck over the bracket's leg instead of at the one seam node (a point load into the deck,
  // which crushes more on every finer grid: AUDIT A1/A1b)
  if (st.brackets !== false) {
    const fr = SEC.sideFrame, Lb = S * Math.max(1, Math.round((fr.hw + fr.tf) / S));
    for (let x = XA + 2.5; x < XZ - 1e-6; x += 2.5) for (const [y, dirs] of [[YB, [1]], [YI, [-1, 1]], [YD, [-1]]]) for (const dy of dirs)
      panels.push(P('bracket', 3, [x, y, 0], [0, 0, -Lb], [0, dy * Lb, 0], fr.tw, sm, [], [0, 0, 0, 0]));
  }
  const xb = [-25, XB[0], XB[1], 20], yb = [YB - 5, YB, YI, YD], names = ['hold', 'lower', 'upper'], fa = ['fwd', 'mid', 'aft'];
  const spaces = [];
  for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 3; ix++) {
    const box = [xb[ix], yb[iy], ZF, xb[ix + 1], yb[iy + 1], 0];
    spaces.push({ name: names[iy] + ' ' + fa[ix], box, V: (box[3] - box[0]) * (box[4] - box[1]) * (box[5] - box[2]) });
  }
  spaces.push({ name: 'outside', box: null, V: Infinity });
  const OUT = spaces.length - 1;
  const spaceAt = p => {
    if (p[2] > 0 || p[1] > YD || p[2] < ZF) return OUT;
    const ix = p[0] < XB[0] ? 0 : p[0] < XB[1] ? 1 : 2, iy = p[1] < YB ? 0 : p[1] < YI ? 1 : 2;
    return iy * 3 + ix;
  };
  return { name: 'box', pieces: panels.map(rectPiece), spaces, OUT, spaceAt, waterline: 0, aimDefault: [0, 2.2, 0], aimNDefault: [0, 0, 1],
    cam: { tgt: [0, 2.5, -.5], dist: 26 }, aimOK: p => p[1] > .3, snap: false, vents: [], isCut: null, brackets: st.brackets !== false };
}

/* ---- a single clamped plate (2.5 x 0.75 m, the panel between frames and longitudinals) for the Nurick-Martin check */
function scenePlate() {
  const [a, b] = st.plate || [2.5, .75], w = 2 * S;
  const pc = rectPiece({ name: 'plate', kind: 0, p00: [-a / 2 - w, -b / 2 - w, 0], p10: [a / 2 + w, -b / 2 - w, 0], p01: [-a / 2 - w, b / 2 + w, 0], p11: [a / 2 + w, b / 2 + w, 0],
    h: st.h / 1000, mat: MATI[st.mat], stiff: [], open: [0, 0, 0, 0] });
  pc.sides = [0, 1]; pc.wet = false;
  return { name: 'plate', pieces: [pc], spaces: [{ name: 'front', box: null, V: Infinity }, { name: 'back', box: null, V: Infinity }], OUT: 0,
    spaceAt: p => p[2] > 0 ? 0 : 1, waterline: -100, snap: false, vents: [], isCut: null, dims: [a, b],
    fixed: p => Math.abs(p[0]) > a / 2 - 1e-6 || Math.abs(p[1]) > b / 2 - 1e-6,          // clamped: the edge and a rigid border
    aimDefault: [0, 0, 0], aimNDefault: [0, 0, 1], cam: { tgt: [0, 0, 0], dist: 5 }, aimOK: () => true };
}

/* ---- the Arleigh Burke (burke_structure.js): a patch of the whole ship around the aim point */
let BURKE = null;
async function loadBurke() { if (!BURKE) BURKE = await import('./burke_structure.js'); }
const BMAT = { hsla: 'hsla', hts: 'hts', mild: 'mild' };
function burkeSec(name) {
  const q = BURKE.SECS[name]; if (!q) return null;
  return q.type === 'FB' ? { hw: q.h / 1000, tw: q.tw / 1000, bf: 0, tf: 0 } : { hw: (q.h - q.tf) / 1000, tw: q.tw / 1000, bf: q.bf / 1000, tf: q.tf / 1000 };
}
function sceneBurke() {
  const B = BURKE.default, C = B.COMPS, frameAt = BURKE.frameAt;
  const AIR = C.findIndex(c => c.id === 'AIR');
  const outside = k => C[k].kind === 'outside' || C[k].kind === 'flooded';
  const spc = k => outside(k) ? AIR : k, wetK = k => C[k].id === 'SEA' || C[k].kind === 'flooded';
  const spaces = C.map(c => ({ name: c.name, box: c.box ? [c.box.x[0], c.box.y[0], c.box.z[0], c.box.x[1], c.box.y[1], c.box.z[1]] : null,
    V: c.kind === 'outside' || c.kind === 'flooded' ? Infinity : c.vol }));
  // the patch: a box around the charge (half-size L from its size) joined with the compartment the blast works in
  // (the one holding the charge, or the one behind the struck plating: its walls take the gas and the reflections);
  // where the box cuts plating, the ship continues (anchored edges)
  const fill = CONTENTS[st.src] ? 400 : st.kg, L = st.patchL || Math.min(14, Math.max(3, 3 + 1.5 * Math.cbrt(fill)));
  const ST = B.STATIONS, am = st.aim, an = st.aimN, inside = st.fuze === 'inside' || !!CONTENTS[st.src];
  const probe = inside ? [am[0] - an[0] * 1.6, am[1] - an[1] * 1.6, am[2] - an[2] * 1.6] : [am[0] - an[0] * .4, am[1] - an[1] * .4, am[2] - an[2] * .4];
  const ci = spc(BURKE.compAt(probe[0], probe[1], probe[2]));
  const box = [am[0] - L, am[1] - L, am[2] - L, am[0] + L, am[1] + L, am[2] + L];
  if (ci !== AIR && C[ci].box && !st.patchL) { const b = C[ci].box; box[0] = Math.min(box[0], b.x[0] - .3); box[1] = Math.min(box[1], b.y[0] - .3); box[2] = Math.min(box[2], b.z[0] - .3);
    box[3] = Math.max(box[3], b.x[1] + .3); box[4] = Math.max(box[4], b.y[1] + .3); box[5] = Math.max(box[5], b.z[1] + .3); }
  const x0 = ST.filter(x => x <= box[0]).pop() ?? ST[0], x1 = ST.find(x => x >= box[3]) ?? ST[ST.length - 1];
  const outBox = p => p[1] < box[1] || p[1] > box[4] || p[2] < box[2] || p[2] > box[5];
  // cells whose centre leaves the box (in y or z) are cut away; their edges with kept cells are open
  const cutCells = (G, nu, nv, mask) => { const cut = new Uint8Array(nu * nv); let kept = 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = j * nu + i; if (mask && !mask[k]) continue;
      const c = [0, 1, 2].map(q => .25 * (G[3 * (j * (nu + 1) + i) + q] + G[3 * (j * (nu + 1) + i + 1) + q] + G[3 * ((j + 1) * (nu + 1) + i) + q] + G[3 * ((j + 1) * (nu + 1) + i + 1) + q]));
      if (outBox(c)) cut[k] = 1; else kept++; }
    return [cut, kept]; };
  // x lines: every bay between stations subdivided evenly (so all pieces share them)
  // graded grid: the chosen size S in a band of half-width Rf round the hit along each axis, 2 S outside it (the
  // coarse lines are every other fine line, so pieces that share an axis still share their lines)
  const Hp = st.aim, Rf = st.fineR || Math.min(6, Math.max(2, 1.5 + .6 * Math.cbrt(fill))), Sc = st.uniformGrid ? S : 2 * S;
  const inBand = (lo, hi, h) => hi > h - Rf && lo < h + Rf;
  const xLines = (a, b) => { const br = [a, ...ST.filter(x => x > a + 1e-6 && x < b - 1e-6), b], out = [a];
    for (let k = 0; k + 1 < br.length; k++) { const sp = inBand(br[k], br[k + 1], Hp[0]) ? S : Sc, n = Math.max(1, Math.round((br[k + 1] - br[k]) / sp));
      for (let q = 1; q <= n; q++) out.push(br[k] + (br[k + 1] - br[k]) * q / n); }
    return out; };
  const gLines = (lo, hi, h) => { const out = []; for (let k = Math.floor(lo / S) - 1; k * S <= hi + Sc; k++) { const v = k * S; if (Math.abs(v - h) <= Rf || Math.abs(v / Sc - Math.round(v / Sc)) < 1e-6) out.push(v); }
    return out; };
  const nearest = (arr, v) => { let b = 0; for (let k = 1; k < arr.length; k++) if (Math.abs(arr[k] - v) < Math.abs(arr[b] - v)) b = k; return b; };
  const isFrame = x => Math.abs(frameAt(x) - Math.round(frameAt(x))) < .01;
  const pieces = [], vents = [];
  const kindOf = pn => pn.kind === 'shell' || pn.kind === 'appendage' || pn.kind === 'dome' ? 0 : pn.kind === 'deck' ? (/Main deck/.test(pn.part) ? 1 : 2) : pn.kind === 'house' ? 4 : 3;
  const clipX = poly => { let P = poly;
    for (const [lim, sg] of [[x0, 1], [x1, -1]]) { const out = [];
      for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length], ia = (a[0] - lim) * sg >= -1e-9, ib = (b[0] - lim) * sg >= -1e-9;
        if (ia) out.push(a); if (ia !== ib) { const t = (lim - a[0]) / (b[0] - a[0]); out.push([lim, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); } }
      P = out; if (P.length < 3) return null; }
    return P; };
  for (const pn of B.PANELS) {
    const mm = B.MATS[pn.mat], key = mm && BMAT[mm.bench];
    const xs = pn.strip ? [pn.strip[0][0][0], pn.strip[1][0][0]] : pn.poly.map(p => p[0]);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    if (xmax < x0 + 1e-6 || xmin > x1 - 1e-6) continue;
    if (pn.open) { const f = Math.max(0, Math.min(x1, xmax) - Math.max(x0, xmin)) / Math.max(1e-6, xmax - xmin); vents.push([spc(pn.sides[0]), spc(pn.sides[1]), pn.area * f]); continue; }
    if (!key) continue;
    const base = { name: pn.part, kind: kindOf(pn), h: pn.t / 1000, mat: MATI[key], n: pn.n, sides: [spc(pn.sides[0]), spc(pn.sides[1])],
      wet: wetK(pn.sides[0]) || wetK(pn.sides[1]), lines: [], open: [0, 0, 0, 0] };
    const secS = pn.stiff ? burkeSec(pn.stiff.sec) : null, secF = pn.frame ? burkeSec(pn.frame.sec) : null;
    if (pn.strip) {
      let [A, Bp] = pn.strip; if (A[0][0] > Bp[0][0]) [A, Bp] = [Bp, A];
      const xa = A[0][0], xb = Bp[0][0]; if (xb - xa < .02) continue;
      const xl = xLines(xa, xb), nu = xl.length - 1;
      const seg = [];
      for (let k = 0; k + 1 < A.length; k++) { const la = len(sub(A[k + 1], A[k])), lb = len(sub(Bp[k + 1], Bp[k])); seg.push(Math.max(1, Math.round(Math.max(la, lb) / S))); }
      const nv = seg.reduce((a, b) => a + b, 0);
      const G = new Float64Array(3 * (nu + 1) * (nv + 1)), gir = new Float64Array(nv + 1);
      let j = 0, prev = null;
      for (let k = 0; k < seg.length; k++) for (let q = (k === 0 ? 0 : 1); q <= seg[k]; q++, j++) {
        const f = q / seg[k], pa = add(mul(A[k], 1 - f), mul(A[k + 1], f)), pb = add(mul(Bp[k], 1 - f), mul(Bp[k + 1], f));
        const mid = mul(add(pa, pb), .5); if (prev) gir[j] = gir[j - 1] + len(sub(mid, prev)); prev = mid;
        for (let i = 0; i <= nu; i++) { const u = (xl[i] - xa) / (xb - xa); G.set(add(mul(pa, 1 - u), mul(pb, u)), 3 * (j * (nu + 1) + i)); }
      }
      const [cut, kept] = cutCells(G, nu, nv, null); if (!kept) continue;
      const pc = { ...base, nu, nv, G, mask: cut.map(v => 1 - v), cut, planar: false };
      if (secS && Math.abs(pn.stiff.dir[0]) > .7) for (let q = 1; q * pn.stiff.s < gir[nv] - pn.stiff.s * .3; q++) {
        let best = -1, bd = 1e9; for (let jj = 1; jj < nv; jj++) { const d = Math.abs(gir[jj] - q * pn.stiff.s); if (d < bd) { bd = d; best = jj; } }
        if (best > 0 && !pc.lines.some(l => l.along === 'u' && l.g === best)) pc.lines.push({ along: 'u', g: best, sec: secS, spacing: pn.stiff.s });
      }
      if (secF && isFrame(xa)) pc.lines.push({ along: 'v', g: 0, sec: secF, spacing: pn.frame.s });
      pieces.push(pc);
      continue;
    }
    // planar polygon on a grid
    const poly = clipX(pn.poly); if (!poly) continue;
    const n = pn.n, trans = Math.abs(n[0]) >= .7;
    const uh = trans ? nrm(sub([0, 0, 1], mul(n, n[2]))) : nrm(sub([1, 0, 0], mul(n, n[0]))), vh = nrm(cross(n, uh));
    const P0 = poly[0];
    const pv = poly.map(p => dot(p, vh)), pu = poly.map(p => trans ? dot(p, uh) : p[0]);
    const umin = Math.min(...pu), umax = Math.max(...pu), vmin = Math.min(...pv), vmax = Math.max(...pv);
    if (umax - umin < S * .5 || vmax - vmin < S * .5) continue;
    const ul = trans ? gLines(umin, umax, dot(Hp, uh)) : xLines(Math.max(x0, umin), Math.min(x1, umax));
    const vl = gLines(vmin, vmax, dot(Hp, vh));
    const nu = ul.length - 1, nv = vl.length - 1;
    if (nu < 1 || nv < 1) continue;
    const G = new Float64Array(3 * (nu + 1) * (nv + 1));
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const beta = vl[j] - dot(P0, vh);
      let p;
      if (trans) p = add(add(P0, mul(uh, ul[i] - dot(P0, uh))), mul(vh, beta));
      else { const alpha = (ul[i] - P0[0] - beta * vh[0]) / uh[0]; p = add(add(P0, mul(uh, alpha)), mul(vh, beta)); }
      G.set(p, 3 * (j * (nu + 1) + i));
    }
    const mask = new Uint8Array(nu * nv); let cnt = 0;
    const inside = (x, y) => { let c = false; for (let k = 0, m = pu.length - 1; k < pu.length; m = k++) { if ((pv[k] > y) !== (pv[m] > y) && x < (pu[m] - pu[k]) * (y - pv[k]) / (pv[m] - pv[k]) + pu[k]) c = !c; } return c; };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (inside((ul[i] + ul[i + 1]) / 2, (vl[j] + vl[j + 1]) / 2)) { mask[j * nu + i] = 1; cnt++; }
    if (!cnt) continue;
    const [cut, kept] = cutCells(G, nu, nv, mask); if (!kept) continue;
    for (let k = 0; k < nu * nv; k++) if (cut[k]) mask[k] = 0;
    const pc = { ...base, nu, nv, G, mask, cut, planar: true };
    for (const [spec, sec] of [[pn.stiff, secS], [pn.frame, secF]]) {
      if (!spec || !sec) continue;
      const alongU = Math.abs(dot(spec.dir, uh)) >= Math.abs(dot(spec.dir, vh));
      if (alongU) { for (let k = Math.ceil(vmin / spec.s); k * spec.s < vmax; k++) { const g = nearest(vl, k * spec.s); if (g > 0 && g < nv) pc.lines.push({ along: 'u', g, sec, spacing: spec.s }); } }
      else if (!trans && Math.abs(spec.s - B.FRAMES.spacing) < .1) { for (let i = 0; i < nu; i++) if (isFrame(ul[i])) pc.lines.push({ along: 'v', g: i, sec, spacing: spec.s }); }
      else { for (let k = Math.ceil(umin / spec.s); k * spec.s < umax; k++) { const g = nearest(ul, k * spec.s);
        if (g > 0 && g < nu) pc.lines.push({ along: 'v', g, sec, spacing: spec.s }); } }
    }
    pieces.push(pc);
  }
  const spaceAt = p => spc(BURKE.compAt(p[0], p[1], p[2]));
  return { name: 'burke', pieces, spaces, OUT: AIR, spaceAt, waterline: 0, snap: true, vents, patch: [x0, x1], box: [x0, box[1], box[2], x1, box[4], box[5]], L,
    isCut: p => Math.abs(p[0] - x0) < 1e-3 || Math.abs(p[0] - x1) < 1e-3,
    aimDefault: [0, 2.5, BURKE.halfBreadth(0, 2.5)], aimNDefault: [0, 0, 1], cam: { tgt: [st.aim[0], 3, 0], dist: 45 }, aimOK: p => p[1] > .3 };
}

/* ------------------------------------------------------------------ the model (arrays) */
let S = .125, scene = null, dt = 1e-5, BETA = 1e-6;
// nodes
let N = 0, X, V, R0, M, WINV, FREE, ANC, AK, AF, AC, NKIND, NFRM, NCON, TBRK, NCC;
// cells: nodes, piece, thickness, material, failure strain, spaces, wet depth, rest triangle frames, state
let NC = 0, CN, CPAN, CH, CMAT, CEF, CSP, CSN, CWET, CAR, CTR, CHG, CDB, CVIS, CEP, CER, CTE, CDM, CUT, CFD, CRC, CNR, CMAP;
// hinges: 6 nodes, 2 cells, plate stiffness/moment, stiffener stiffness/moment, rest angle, lever, trusses, state
let NH = 0, HEL, HLN, HTL0, HTPS, HN, HC, HKP, HMP, HKS, HMS, HT0, HDB, HTR, HHP, HMAT, HTP, HTH, HSAME;
// trusses (stiffener axial members)
let CKC = null, CSD = null, NLH = null, NLE = null, CRAT = null, CRATP = null, CERS = null, TKC = null, seamDist = () => Infinity, NT = 0, TA, TB, TL0, TAR, TMAT, TEF, TFIB, THG, TLP, TFL, TEB, TKIND, TBA, TBB, TSC, TCL, TCL2, TQN, TPRV, TNXT, TKB, TQB, TB0, TKS, TQS, TS0, TBP, TSP, TMM, emapRef = null;
// pieces (contact maps)
let PAN = [];
const TRI = [[0, 1, 2], [0, 2, 3], [0, 1, 3], [1, 2, 3]];
const EK = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;

function build() {
  if (gpu) { gpu.dispose(); gpu = null; }
  S = st.grid;
  scene = st.scene === 'burke' && BURKE ? sceneBurke() : st.scene === 'plate' ? scenePlate() : sceneBox();
  const pieces = scene.pieces;
  // ---- 1. grid nodes, merged where they coincide
  let pos = []; const key = new Map(), npc = [];
  const gid = pieces.map(pc => {
    const ids = new Int32Array((pc.nu + 1) * (pc.nv + 1)).fill(-1);
    const used = (i, j) => { if (!pc.mask) return true; for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < pc.nu && b < pc.nv && pc.mask[b * pc.nu + a]) return true; return false; };
    for (let j = 0; j <= pc.nv; j++) for (let i = 0; i <= pc.nu; i++) {
      if (!used(i, j)) continue;
      const o = 3 * (j * (pc.nu + 1) + i), x = pc.G[o], y = pc.G[o + 1], z = pc.G[o + 2];
      if (!Number.isFinite(x + y + z)) continue;
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
      let id = key.get(k); if (id === undefined) { id = pos.length / 3; key.set(k, id); pos.push(x, y, z); npc.push([]); }
      ids[j * (pc.nu + 1) + i] = id;
    }
    return ids;
  });
  pieces.forEach((pc, pi) => { for (const id of gid[pi]) if (id >= 0 && !npc[id].includes(pi)) npc[id].push(pi); });
  // ---- 2. snap the free edges of each piece onto the nearest node of another piece (within 0.55 S): joins the
  // plating where separately gridded pieces meet (deck to shell, bulkhead to deck)
  const nn0 = pos.length / 3, rep = new Int32Array(nn0); for (let i = 0; i < nn0; i++) rep[i] = i;
  const fr = i => { while (rep[i] !== i) { rep[i] = rep[rep[i]]; i = rep[i]; } return i; };
  let snapped = 0, unsnapped = 0;
  if (scene.snap) {
    const H = new Map(), hk = (a, b, c) => a + ',' + b + ',' + c;
    for (let i = 0; i < nn0; i++) { const k = hk(Math.floor(pos[3 * i] / S), Math.floor(pos[3 * i + 1] / S), Math.floor(pos[3 * i + 2] / S)); let l = H.get(k); if (!l) H.set(k, l = []); l.push(i); }
    const cls = new Map();
    const setOf = r => { let q = cls.get(r); if (!q) cls.set(r, q = new Set(npc[r])); return q; };
    pieces.forEach((pc, pi) => {
      const ids = gid[pi], cc = (i, j) => (i < 0 || j < 0 || i >= pc.nu || j >= pc.nv) ? 0 : pc.mask ? pc.mask[j * pc.nu + i] : 1;
      for (let j = 0; j <= pc.nv; j++) for (let i = 0; i <= pc.nu; i++) {
        const a = ids[j * (pc.nu + 1) + i]; if (a < 0) continue;
        if (cc(i - 1, j - 1) + cc(i, j - 1) + cc(i - 1, j) + cc(i, j) === 4) continue;      // interior of its piece
        if (npc[a].length > 1) continue;                                                   // already joined
        if (scene.isCut && scene.isCut([pos[3 * a], pos[3 * a + 1], pos[3 * a + 2]])) continue;
        const gx = Math.floor(pos[3 * a] / S), gy = Math.floor(pos[3 * a + 1] / S), gz = Math.floor(pos[3 * a + 2] / S);
        let best = -1, bd = .55 * S;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const b of H.get(hk(gx + dx, gy + dy, gz + dz)) || []) {
          if (npc[b].includes(pi)) continue;
          const d = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]); if (d < bd) { bd = d; best = b; }
        }
        if (best < 0) { unsnapped++; continue; }
        const ra = fr(a), rb = fr(best); if (ra === rb) continue;
        const sa = setOf(ra), sb = setOf(rb); let clash = false; for (const q of sa) if (sb.has(q)) { clash = true; break; }
        if (clash) { unsnapped++; continue; }
        rep[ra] = rb; for (const q of sa) sb.add(q); snapped++;
      }
    });
  }
  // compact the node numbering
  const newId = new Int32Array(nn0).fill(-1); let N0 = 0;
  for (let i = 0; i < nn0; i++) if (fr(i) === i) newId[i] = N0++;
  const nid = i => i < 0 ? -1 : newId[fr(i)];
  const P2 = new Float64Array(3 * N0), npc2 = Array.from({ length: N0 }, () => []);
  for (let i = 0; i < nn0; i++) { const k = nid(i); if (fr(i) === i) { P2[3 * k] = pos[3 * i]; P2[3 * k + 1] = pos[3 * i + 1]; P2[3 * k + 2] = pos[3 * i + 2]; } for (const q of npc[i]) if (!npc2[k].includes(q)) npc2[k].push(q); }
  pos = P2;
  const mass = new Float64Array(N0), kind = new Uint8Array(N0).fill(255), frm = new Uint8Array(N0);
  // ---- 3. imperfection between stiffeners (hungry horse) on nodes that belong to one piece only:
  // w0 = min(0.1 beta^2 t, b / 200) (Smith et al. 1988 "average" level)
  pieces.forEach((pc, pi) => {
    const m = MATS[pc.mat], rows = [0, pc.nv, ...pc.lines.filter(l => l.along === 'u').map(l => l.g)].sort((a, b) => a - b), cols = [0, pc.nu, ...pc.lines.filter(l => l.along === 'v').map(l => l.g)].sort((a, b) => a - b);
    const brk = (arr, x) => { for (let k = 1; k < arr.length; k++) if (x <= arr[k]) return [arr[k - 1], arr[k]]; return [arr[0], arr[1]]; };
    const g3 = k => [pc.G[3 * k], pc.G[3 * k + 1], pc.G[3 * k + 2]];
    const du = len(sub(g3(pc.nu), g3(0))) / pc.nu, dv = len(sub(g3(pc.nv * (pc.nu + 1)), g3(0))) / pc.nv;
    for (let j = 0; j <= pc.nv; j++) for (let i = 0; i <= pc.nu; i++) {
      const k = nid(gid[pi][j * (pc.nu + 1) + i]); if (k < 0 || npc2[k].length !== 1) continue;
      const [ua, ub] = brk(cols, i), [va, vb] = brk(rows, j);
      const b = Math.max(S, Math.min((ub - ua) * du, (vb - va) * dv)), beta = b / pc.h * Math.sqrt(m.sy / m.E), w0 = Math.min(.1 * beta * beta * pc.h, b / 200);
      const w = -w0 * Math.sin(Math.PI * (i - ua) / Math.max(1, ub - ua)) * Math.sin(Math.PI * (j - va) / Math.max(1, vb - va));
      for (let q = 0; q < 3; q++) pos[3 * k + q] += pc.n[q] * w;
    }
  });
  // ---- 4. cells
  const cn = [], cpan = [], ch = [], cmat = [], csp = [], csn = [], cwet = [], cmap = []; let dropped = 0;
  PAN = [];
  pieces.forEach((pc, pi) => {
    const m = MATS[pc.mat], off = cmap.length, ids = gid[pi];
    for (let k = 0; k < pc.nu * pc.nv; k++) cmap.push(-1);
    for (let j = 0; j < pc.nv; j++) for (let i = 0; i < pc.nu; i++) {
      if (pc.mask && !pc.mask[j * pc.nu + i]) continue;
      const I = (a, b) => nid(ids[b * (pc.nu + 1) + a]);
      let q = [I(i, j), I(i + 1, j), I(i + 1, j + 1), I(i, j + 1)];
      if (q.includes(-1) || new Set(q).size < 4) continue;
      const P = q.map(k => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]]);
      const av = cross(sub(P[2], P[0]), sub(P[3], P[1]));
      // degenerate after joining (a corner pulled onto another edge): drop it, it would carry no sensible strain
      let emin = Infinity; for (let z = 0; z < 4; z++) emin = Math.min(emin, len(sub(P[(z + 1) % 4], P[z])));
      let tmin = Infinity; for (const [a, b, c] of TRI) tmin = Math.min(tmin, .5 * len(cross(sub(P[b], P[a]), sub(P[c], P[a]))));
      if (len(av) < .2 * S * S || emin < .2 * S || len(sub(P[2], P[0])) < .3 * S || len(sub(P[3], P[1])) < .3 * S || tmin < .05 * S * S) { dropped++; continue; }
      if (dot(av, pc.n) < 0) q = [q[0], q[3], q[2], q[1]];
      const c = cpan.length; cmap[off + j * pc.nu + i] = c;
      cn.push(...q); cpan.push(pi); ch.push(pc.h); cmat.push(pc.mat);
      const ctr = mul(add(add(P[0], P[1]), add(P[2], P[3])), .25);
      const sP = pc.sides ? pc.sides[0] : scene.spaceAt(add(ctr, mul(pc.n, .05))), sN = pc.sides ? pc.sides[1] : scene.spaceAt(sub(ctr, mul(pc.n, .05)));
      csp.push(sP); csn.push(sN);
      const wet = pc.wet !== null ? pc.wet : (sP === scene.OUT || sN === scene.OUT);
      cwet.push(wet && ctr[1] < scene.waterline ? scene.waterline - ctr[1] : -1);
      const A = .5 * len(av);
      for (const k of q) { mass[k] += m.rho * pc.h * A / 4; if (kind[k] === 255) kind[k] = pc.kind; }
    }
    const g3 = k => [pc.G[3 * k], pc.G[3 * k + 1], pc.G[3 * k + 2]], o = g3(0), Ue = sub(g3(pc.nu), o), Ve = sub(g3(pc.nv * (pc.nu + 1)), o);
    PAN.push({ o, U: nrm(Ue), V: nrm(Ve), Lu: len(Ue), Lv: len(Ve), n: pc.n, nu: pc.nu, nv: pc.nv, off, kind: pc.kind, name: pc.name, planar: pc.planar });
  });
  CMAP = Int32Array.from(cmap);
  const CMAPtmp = (pi, i, j) => cmap[PAN[pi].off + j * PAN[pi].nu + i];
  // ---- 5. anchors on open edges (flagged sides of a piece, or the scene's cut planes)
  const anchors = [];
  const openEdge = (a, b, c) => {
    const L = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]), m = MATS[cmat[c]], h = ch[c];
    const cL = Math.sqrt(m.E / (m.rho * (1 - m.nu * m.nu)));
    for (const q of [a, b]) anchors.push([q, m.E * h * (L / 2) / LC_BOUND, m.sy * h * L / 2, m.rho * cL * h * L / 2]);
  };
  const emap = new Map(); emapRef = emap;
  for (let c = 0; c < cpan.length; c++) for (let e = 0; e < 4; e++) {
    const k = EK(cn[4 * c + e], cn[4 * c + (e + 1) % 4]);
    let l = emap.get(k); if (!l) emap.set(k, l = []); l.push([c, e]);
  }
  pieces.forEach((pc, pi) => { const op = pc.open, ids = gid[pi];
    const edge = (i1, j1, i2, j2) => { const a = nid(ids[j1 * (pc.nu + 1) + i1]), b = nid(ids[j2 * (pc.nu + 1) + i2]); if (a < 0 || b < 0) return;
      const l = emap.get(EK(a, b)); if (l) openEdge(a, b, l[0][0]); };
    if (op[0]) for (let j = 0; j < pc.nv; j++) edge(0, j, 0, j + 1);
    if (op[1]) for (let j = 0; j < pc.nv; j++) edge(pc.nu, j, pc.nu, j + 1);
    if (op[2]) for (let i = 0; i < pc.nu; i++) edge(i, 0, i + 1, 0);
    if (op[3]) for (let i = 0; i < pc.nu; i++) edge(i, pc.nv, i + 1, pc.nv); });
  pieces.forEach((pc, pi) => { if (!pc.cut) return; const ids = gid[pi], nu = pc.nu, nv = pc.nv;
    const node = (i, j) => nid(ids[j * (nu + 1) + i]);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const c = CMAPtmp(pi, i, j); if (c < 0) continue;
      const nb = [[i - 1, j, i, j, i, j + 1], [i + 1, j, i + 1, j, i + 1, j + 1], [i, j - 1, i, j, i + 1, j], [i, j + 1, i, j + 1, i + 1, j + 1]];
      for (const [ni, nj, ai, aj, bi, bj] of nb) if (ni >= 0 && nj >= 0 && ni < nu && nj < nv && pc.cut[nj * nu + ni]) { const a = node(ai, aj), b = node(bi, bj); if (a >= 0 && b >= 0 && emap.has(EK(a, b))) openEdge(a, b, c); } } });
  if (scene.isCut) for (const [k, l] of emap) if (l.length === 1) { const a = Math.floor(k / 4194304), b = k % 4194304;
    if (scene.isCut([pos[3 * a], pos[3 * a + 1], pos[3 * a + 2]]) && scene.isCut([pos[3 * b], pos[3 * b + 1], pos[3 * b + 2]])) openEdge(a, b, l[0][0]); }
  // ---- 6. stiffener lines: members (axial) along the grid line
  const ta = [], tb = [], tar = [], tmat = [], tsec = [], tkind = [], lineRec = [], tkey = new Set();
  pieces.forEach((pc, pi) => {
    const ids = gid[pi], m = MATS[pc.mat];
    for (const ln of pc.lines) {
      const nn = ln.along === 'u' ? pc.nu : pc.nv, sec = tee(ln.sec, ln.spacing, pc.h), heavy = sec.d > .25 ? 2 : 1;
      let run = [], trs = [];
      const flush = () => { if (trs.length) lineRec.push({ nodes: run, trusses: trs, sec, mat: m, h: pc.h, spacing: ln.spacing, n: pc.n, pi }); run = []; trs = []; };
      for (let k = 0; k < nn; k++) {
        const [i1, j1, i2, j2] = ln.along === 'u' ? [k, ln.g, k + 1, ln.g] : [ln.g, k, ln.g, k + 1];
        const a = nid(ids[j1 * (pc.nu + 1) + i1]), b = nid(ids[j2 * (pc.nu + 1) + i2]);
        if (a < 0 || b < 0 || a === b) { flush(); continue; }
        const ek = EK(a, b);
        if (!emap.has(ek) || tkey.has(ek)) { flush(); continue; }
        tkey.add(ek);
        const L = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
        if (!run.length) run.push(a); run.push(b); trs.push(ta.length);
        ta.push(a); tb.push(b); tar.push(sec.A); tmat.push(pc.mat); tsec.push([sec, L]); tkind.push(heavy);
        mass[a] += m.rho * sec.A * L / 2; mass[b] += m.rho * sec.A * L / 2; frm[a] = Math.max(frm[a], heavy); frm[b] = Math.max(frm[b], heavy);
      }
      flush();
    }
  });
  // web ends: where a member runs into a perpendicular plate (a frame at a deck, a deck beam or a longitudinal at a
  // bulkhead), its web is welded to that plate along the web's depth d, in the member's plane. The member's end
  // reaction therefore enters the plate as a line load over d, not at the one seam node: a chain of in-plane ties
  // (the web end, area A_w) from the seam node d into the plate carries it (the deck beam there, if any, runs in
  // parallel). Without it a far hit crushed the deck at every frame's seam node (AUDIT A1b).
  if (!st.noWebEnds && !scene.brackets) {
    const ncell = Array.from({ length: N0 }, () => []); for (let c = 0; c < cpan.length; c++) for (let z = 0; z < 4; z++) ncell[cn[4 * c + z]].push(c);
    const cnorm = c => { const q = [0, 1, 2, 3].map(z => cn[4 * c + z]), P = k => [pos[3 * q[k]], pos[3 * q[k] + 1], pos[3 * q[k] + 2]];
      return nrm(cross(sub(P(2), P(0)), sub(P(3), P(1)))); };
    const ccen = c => { const o = [0, 0, 0]; for (let z = 0; z < 4; z++) for (let q = 0; q < 3; q++) o[q] += pos[3 * cn[4 * c + z] + q] / 4; return o; };
    const P3 = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], wkey = new Set();
    for (const lr of lineRec) {
      const nd = lr.nodes, sec = lr.sec, m = lr.mat; if (nd.length < 2) continue;
      for (let j = 0; j < nd.length; j++) {
        const J = nd[j], own = ncell[J].filter(c => cpan[c] === lr.pi);
        if (!own.length) continue;
        const n1 = cnorm(own[0]), t = nrm(sub(P3(nd[Math.min(j + 1, nd.length - 1)]), P3(nd[Math.max(j - 1, 0)])));
        // cells of another plate at this node: perpendicular to the member's plating, and the member runs into it
        const other = ncell[J].filter(c => !own.includes(c) && Math.abs(dot(cnorm(c), n1)) < .3 && Math.abs(dot(cnorm(c), t)) > .7);
        if (!other.length) continue;
        // in the other plate, in the member's plane (across the seam), toward the other plate's cells
        const pc2 = cpan[other[0]], n2 = cnorm(other[0]); let dv = nrm(cross(n2, nrm(cross(n1, n2))));
        if (dot(sub(ccen(other[0]), P3(J)), dv) < 0) dv = [-dv[0], -dv[1], -dv[2]];
        // walk the other plate's grid from the seam node, a node at a time, along dv, out to the web's depth
        let cur = J, dist = 0;
        for (let it = 0; it < 12 && dist < sec.d - 1e-3; it++) {
          let best = -1, bs = -1;
          for (const c of ncell[cur]) { if (cpan[c] !== pc2) continue;
            for (let z = 0; z < 4; z++) { const q = cn[4 * c + z]; if (q === cur) continue; const e = sub(P3(q), P3(cur)), el = len(e), al = dot(e, dv) / (el || 1);
              if (al > .95 && el > 1e-3 && al * el > bs) { bs = al * el; best = q; } } }
          if (best < 0) break;
          const key = EK(cur, best);
          if (!wkey.has(key)) { wkey.add(key); const L = len(sub(P3(best), P3(cur))), A = sec.Aw * (st.webEndK || 1);
            ta.push(cur); tb.push(best); tar.push(A); tmat.push(pieces[lr.pi].mat); tsec.push([sec, L]); tkind.push(1);
            mass[cur] += m.rho * A * L / 2; mass[best] += m.rho * A * L / 2; }
          dist += bs; cur = best;
        }
      }
    }
  }
  // members crossing an open edge continue there
  const onOpen = new Uint8Array(N0); for (const [q] of anchors) onOpen[q] = 1;
  for (const lr of lineRec) for (const [end, t] of [[lr.nodes[0], lr.trusses[0]], [lr.nodes[lr.nodes.length - 1], lr.trusses[lr.trusses.length - 1]]]) {
    if (!onOpen[end]) continue; const m = lr.mat, A = tar[t], cL = Math.sqrt(m.E / m.rho);
    anchors.push([end, m.E * A / LC_BOUND, m.sy * A, m.rho * cL * A]);
  }

  // ---- arrays
  N = N0; X = new Float64Array(pos); R0 = new Float64Array(pos); V = new Float64Array(3 * N); M = mass;
  WINV = new Float64Array(N); for (let i = 0; i < N; i++) WINV[i] = M[i] > 0 ? 1 / M[i] : 0;
  if (scene.fixed) for (let i = 0; i < N; i++) if (scene.fixed([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]])) WINV[i] = 0;
  FREE = new Uint8Array(N); ANC = new Float64Array(pos); AK = new Float64Array(N); AF = new Float64Array(N); AC = new Float64Array(N);
  for (const [q, k, f, c] of anchors) { AK[q] += k; AF[q] += f; AC[q] += c; }
  for (let i = 0; i < N0; i++) if (kind[i] === 255) kind[i] = 0;
  NKIND = kind; NFRM = frm; NCON = new Int32Array(N); TBRK = new Float32Array(N).fill(-1);
  NC = cpan.length; CN = new Int32Array(cn); CPAN = new Int32Array(cpan); CH = new Float64Array(ch); CMAT = new Uint8Array(cmat);
  CSP = new Int32Array(csp); CSN = new Int32Array(csn); CWET = new Float64Array(cwet);
  CAR = new Float64Array(NC); CEF = new Float64Array(NC); CTR = new Float64Array(12 * NC); CHG = new Int32Array(4 * NC).fill(-1); CDB = new Float64Array(NC);
  CVIS = new Uint32Array(NC); CKC = new Float64Array(NC).fill(1); CEP = new Float64Array(16 * NC); CER = new Uint8Array(NC); CKN = new Uint8Array(NC); CTE = new Float64Array(NC).fill(-1);
  CDM = new Float64Array(NC); CUT = new Float64Array(NC); CFD = new Float64Array(NC); CRC = new Float64Array(3 * NC); CNR = new Float64Array(3 * NC);
  for (let c = 0; c < NC; c++) {
    const q = [0, 1, 2, 3].map(k => CN[4 * c + k]), P = q.map(i => [R0[3 * i], R0[3 * i + 1], R0[3 * i + 2]]);
    for (let t = 0; t < 4; t++) {
      const [p1, p2, p3] = TRI[t].map(k => P[k]), e = sub(p2, p1), L12 = len(e), e1 = mul(e, 1 / L12);
      const nn = nrm(cross(e, sub(p3, p1))), e2 = cross(nn, e1), d3 = sub(p3, p1);
      CTR[12 * c + 3 * t] = L12; CTR[12 * c + 3 * t + 1] = dot(d3, e1); CTR[12 * c + 3 * t + 2] = Math.max(1e-4, dot(d3, e2));
    }
    const av = mul(cross(sub(P[2], P[0]), sub(P[3], P[1])), .5);
    CAR[c] = len(av); CNR.set(nrm(av), 3 * c);
    CRC.set(mul(add(add(P[0], P[1]), add(P[2], P[3])), .25), 3 * c);
    CEF[c] = glf(MATS[CMAT[c]], CH[c], Math.max(Math.sqrt(CAR[c]), lrOf(Math.sqrt(CAR[c])))) * (st.efScale || 1);
    CDB[c] = Math.sqrt(CAR[c]);
    for (const i of q) NCON[i]++;
  }
  // non-local failure: each cell's neighbours (same piece) inside the square of side lrOf(cell) round it, with the area
  // of their overlap as weight (the cell's own weight in NLH[4c+2])
  {
    let reach = .25; for (let c = 0; c < NC; c++) { const lc = Math.sqrt(CAR[c]); reach = Math.max(reach, lrOf(lc) / 2 + lc); }
    const hb = new Map(), HB = reach, key = (x, y, z) => Math.floor(x / HB) + ',' + Math.floor(y / HB) + ',' + Math.floor(z / HB);
    for (let c = 0; c < NC; c++) { const k = key(CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]); (hb.get(k) || hb.set(k, []).get(k)).push(c); }
    NLH = new Float32Array(4 * NC); const ids = [], ws = [];
    for (let c = 0; c < NC; c++) {
      const lc = Math.sqrt(CAR[c]), Lr = lrOf(lc); NLH[4 * c] = ids.length; NLH[4 * c + 2] = Lr > 0 ? Math.min(lc, Lr) ** 2 : lc * lc;
      if (!(Lr > lc)) continue;
      const q0 = CN[4 * c], q1 = CN[4 * c + 1], ex = nrm(sub([R0[3 * q1], R0[3 * q1 + 1], R0[3 * q1 + 2]], [R0[3 * q0], R0[3 * q0 + 1], R0[3 * q0 + 2]])),
        nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]], ey = cross(nn, ex), x0 = CRC[3 * c], y0 = CRC[3 * c + 1], z0 = CRC[3 * c + 2];
      for (let a1 = -1; a1 <= 1; a1++) for (let b1 = -1; b1 <= 1; b1++) for (let e1 = -1; e1 <= 1; e1++) {
        const l = hb.get((Math.floor(x0 / HB) + a1) + ',' + (Math.floor(y0 / HB) + b1) + ',' + (Math.floor(z0 / HB) + e1)); if (!l) continue;
        for (const j of l) { if (j === c || CPAN[j] !== CPAN[c]) continue;
          const d = [CRC[3 * j] - x0, CRC[3 * j + 1] - y0, CRC[3 * j + 2] - z0], lj = Math.sqrt(CAR[j]);
          if (Math.abs(dot(d, nn)) > lc) continue;
          const x = dot(d, ex), y = dot(d, ey);
          const ox = Math.min(x + lj / 2, Lr / 2) - Math.max(x - lj / 2, -Lr / 2), oy = Math.min(y + lj / 2, Lr / 2) - Math.max(y - lj / 2, -Lr / 2);
          if (ox > 1e-6 && oy > 1e-6) { ids.push(j); ws.push(ox * oy); } } }
      NLH[4 * c + 1] = ids.length - NLH[4 * c];
    }
    NLE = new Float32Array(2 * ids.length); for (let k = 0; k < ids.length; k++) { NLE[2 * k] = ids[k]; NLE[2 * k + 1] = ws[k]; }
    CRAT = new Float64Array(NC); CRATP = new Float64Array(NC); CERS = new Uint8Array(NC);
  }
  // seam band: cells within the fold length of a junction with a plate at an angle (where in-plane load enters a
  // plate and a compressed plate folds first); their compressive yield is knocked down on grids too coarse to fold
  {
    const ncl = Array.from({ length: N }, () => []); for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) ncl[CN[4 * c + k]].push(c);
    const seam = []; for (let i = 0; i < N; i++) { const l = ncl[i]; let ok = false;
      for (let a = 0; a < l.length && !ok; a++) for (let b = a + 1; b < l.length; b++) { const x = l[a], y = l[b];
        if (Math.abs(CNR[3 * x] * CNR[3 * y] + CNR[3 * x + 1] * CNR[3 * y + 1] + CNR[3 * x + 2] * CNR[3 * y + 2]) < .7) { ok = true; break; } }
      if (ok) seam.push(i); }
    const hb = new Map(), HB = .5, hk = (x, y, z) => Math.floor(x / HB) + ',' + Math.floor(y / HB) + ',' + Math.floor(z / HB);
    for (const i of seam) { const k = hk(R0[3 * i], R0[3 * i + 1], R0[3 * i + 2]); (hb.get(k) || hb.set(k, []).get(k)).push(i); }
    CSD = new Float64Array(NC).fill(Infinity);
    for (let c = 0; c < NC; c++) { const x = CRC[3 * c], y = CRC[3 * c + 1], z = CRC[3 * c + 2]; let d = Infinity;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const l = hb.get((Math.floor(x / HB) + a) + ',' + (Math.floor(y / HB) + b) + ',' + (Math.floor(z / HB) + e)); if (!l) continue;
        for (const i of l) d = Math.min(d, Math.hypot(R0[3 * i] - x, R0[3 * i + 1] - y, R0[3 * i + 2] - z)); }
      CSD[c] = d; CKC[c] = compKnock(MATS[CMAT[c]], CH[c], Math.sqrt(CAR[c]), d); }
    seamDist = (x, y, z) => { let d = Infinity; for (let p = -1; p <= 1; p++) for (let q = -1; q <= 1; q++) for (let e = -1; e <= 1; e++) { const l = hb.get((Math.floor(x / HB) + p) + ',' + (Math.floor(y / HB) + q) + ',' + (Math.floor(z / HB) + e)); if (!l) continue;
      for (const i of l) d = Math.min(d, Math.hypot(R0[3 * i] - x, R0[3 * i + 1] - y, R0[3 * i + 2] - z)); } return d; };
  }
  // ---- 7. hinges: every edge shared by two or more cells, one hinge per pair of cells
  const hn = [], hc = [], hkp = [], hmp = [], ht0 = [], hdb = [], hhp = [], hmat = [], hsame = [], hOfEdge = new Map();
  const Dp = c => { const m = MATS[CMAT[c]]; return m.E * CH[c] ** 3 / (12 * (1 - m.nu * m.nu)); };
  for (const [ek, l] of emap) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
    const [c1, e1] = l[x], [c2, e2] = l[y];
    const x3 = CN[4 * c1 + e1], x4 = CN[4 * c1 + (e1 + 1) % 4];
    const f1a = CN[4 * c1 + (e1 + 2) % 4], f1b = CN[4 * c1 + (e1 + 3) % 4], f2a = CN[4 * c2 + (e2 + 2) % 4], f2b = CN[4 * c2 + (e2 + 3) % 4];
    const g = hingeGeom(R0, x3, x4, f1a, f1b, f2a, f2b);
    if (!g) continue;
    const h = hn.length / 6;
    hn.push(x3, x4, f1a, f1b, f2a, f2b); hc.push(c1, c2);
    const m1 = MATS[CMAT[c1]], m2 = MATS[CMAT[c2]];
    hkp.push(g.lE / (g.h1 / (2 * Dp(c1)) + g.h2 / (2 * Dp(c2))));
    const mp1 = m1.sy * CH[c1] ** 2 / 4, mp2 = m2.sy * CH[c2] ** 2 / 4, w = mp1 <= mp2 ? c1 : c2;
    hmp.push(Math.min(mp1, mp2) * g.lE); hmat.push(CMAT[w]); hhp.push(CH[w]);
    ht0.push(g.th); hdb.push((g.h1 + g.h2) / 2); hsame.push(CPAN[c1] === CPAN[c2] ? 1 : 0);
    let lh = hOfEdge.get(ek); if (!lh) hOfEdge.set(ek, lh = []); lh.push(h);
    if (CPAN[c1] === CPAN[c2]) { CHG[4 * c1 + e1] = h; CHG[4 * c2 + e2] = h; }
  }
  NH = hc.length / 2;
  HN = new Int32Array(hn); HC = new Int32Array(hc); HKP = new Float64Array(hkp); HMP = new Float64Array(hmp); HT0 = new Float64Array(ht0);
  HDB = new Float64Array(hdb); HHP = new Float64Array(hhp); HMAT = new Uint8Array(hmat); HSAME = new Uint8Array(hsame);
  HKS = new Float64Array(NH); HMS = new Float64Array(NH); HTR = new Int32Array(2 * NH).fill(-1);
  HTP = new Float64Array(NH); HTH = new Float64Array(NH); HEL = new Float64Array(NH); HLN = new Int32Array(NH).fill(-1); HTL0 = new Float64Array(NH); HTPS = new Float64Array(NH);
  // ---- 8. members, and the stiffeners' bending added to the hinges their line crosses
  NT = ta.length; TA = new Int32Array(ta); TB = new Int32Array(tb); TAR = new Float64Array(tar); TMAT = new Uint8Array(tmat); TKIND = new Uint8Array(tkind);
  TL0 = new Float64Array(NT); TEF = new Float64Array(NT); TFIB = new Float64Array(NT); THG = new Int32Array(4 * NT).fill(-1);
  TLP = new Float64Array(NT); TFL = new Uint8Array(NT); TEB = new Float64Array(NT);
  for (let t = 0; t < NT; t++) {
    const a = TA[t], b = TB[t]; TL0[t] = Math.hypot(R0[3 * a] - R0[3 * b], R0[3 * a + 1] - R0[3 * b + 1], R0[3 * a + 2] - R0[3 * b + 2]); TLP[t] = TL0[t];
    const [sec, L] = tsec[t], m = MATS[TMAT[t]];
    TEF[t] = glf(m, sec.tw, L); TFIB[t] = sec.c / Math.max(L, sec.d);
  }
  // members in the seam band: their compressive (axial) yield too
  TKC = new Float64Array(NT).fill(1);
  for (let k = 0; k < NT; k++) { const a = TA[k], b = TB[k]; TKC[k] = compKnock(null, 0, TL0[k], seamDist(.5 * (R0[3 * a] + R0[3 * b]), .5 * (R0[3 * a + 1] + R0[3 * b + 1]), .5 * (R0[3 * a + 2] + R0[3 * b + 2]))); }
  // Stiffener bending as a shear-limited (Timoshenko-type) beam on the member's own line: bending measured as the
  // angle between the chords to the nodes m cells either side (base 2 m S ~ the section depth: a deep member cannot
  // bend over less than its depth), and transverse shear of each segment against the chord around it (G A_w), which
  // carries the short-wave modes the base does not see. Smooth curvature: exact bending, no shear; m = 1: Euler-Bernoulli.
  TBA = new Int32Array(NT).fill(-1); TBB = new Int32Array(NT).fill(-1); TSC = new Int32Array(NT).fill(-1); TCL = new Int32Array(NT).fill(-1); TCL2 = new Int32Array(NT).fill(-1); TQN = new Int32Array(4 * NT).fill(-1); TPRV = new Int32Array(NT).fill(-1); TNXT = new Int32Array(NT).fill(-1);
  TKB = new Float64Array(NT); TQB = new Float64Array(NT); TB0 = new Float64Array(NT); TKS = new Float64Array(NT); TQS = new Float64Array(NT); TS0 = new Float64Array(NT);
  TBP = new Float64Array(NT); TSP = new Float64Array(NT); TMM = new Uint8Array(NT).fill(1);
  for (const lr of lineRec) {
    const { sec, mat: m, h, spacing } = lr, L = lr.trusses.length, nd = lr.nodes;
    const D = m.E * h ** 3 / (12 * (1 - m.nu * m.nu)), Gm = m.E / (2 * (1 + m.nu));
    // the stiffener's own share: composite tee minus the attached plating's bending (already in the plate hinges)
    const EIs = Math.max(0, m.E * sec.I - D * spacing), Mps = Math.max(0, m.sy * sec.Zp - m.sy * h * h / 4 * spacing);
    let Sb = 0; for (const t of lr.trusses) Sb += TL0[t]; Sb /= L;
    const mm = Math.max(1, Math.min(st.beamM === 1 ? 1 : Math.round(.75 * sec.d / Sb), Math.floor(L / 2)));   // base 2 m S ~ 1.5 depth
    for (let j = 0; j < L; j++) {
      const t = lr.trusses[j]; TMM[t] = mm; TPRV[t] = j > 0 ? lr.trusses[j - 1] : -1; TNXT[t] = j + 1 < L ? lr.trusses[j + 1] : -1; TFIB[t] = sec.c / (mm * Sb);
      const l = emapRef.get(EK(nd[j], nd[j + 1])) || [];
      // the plating on both sides of the member (one at an edge): the axis across the member is taken between the
      // outer corners of the two cells, so neither side is preferred (mirror-symmetric)
      const cs = l.map(([c]) => c).filter(c => Math.abs(dot([CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]], lr.n)) > .9);
      if (!cs.length && l.length) cs.push(l[0][0]);
      if (!cs.length) continue;
      const outer = c => { const o = []; for (let z = 0; z < 4; z++) { const q = CN[4 * c + z]; if (q !== nd[j] && q !== nd[j + 1]) o.push(q); } if (o.length !== 2) return null;
        const da = q => Math.hypot(R0[3 * q] - R0[3 * nd[j]], R0[3 * q + 1] - R0[3 * nd[j] + 1], R0[3 * q + 2] - R0[3 * nd[j] + 2]); return da(o[0]) <= da(o[1]) ? o : [o[1], o[0]]; };
      const o1 = outer(cs[0]), o2 = cs.length > 1 ? outer(cs[1]) : null;
      if (!o1) continue;
      TCL[t] = cs[0]; TCL2[t] = o2 ? cs[1] : -1;
      TQN.set([o1[0], o1[1], o2 ? o2[0] : nd[j], o2 ? o2[1] : nd[j + 1]], 4 * t);
      if (j - mm >= 0 && j + mm <= L && EIs > 0) { TBA[t] = nd[j - mm]; TBB[t] = nd[j + mm]; TKB[t] = EIs / (mm * mm * Sb); TQB[t] = Mps / mm; }
      if (mm >= 2 && j + 1 - mm >= 0 && j + mm <= L) { TSC[t] = nd[j + 1 - mm]; TBB[t] = nd[j + mm]; TKS[t] = Gm * sec.Aw * Sb; TQS[t] = Sb * m.sy / Math.sqrt(3) * sec.Aw; }
      const g = memberAngles(t, R0); TB0[t] = g[0]; TS0[t] = g[1];
    }
  }
  for (let h = 0; h < NH; h++) HTP[h] = 0;
  // ---- stable step: dilatational wave across the smallest triangle altitude; stiffness-proportional damping
  // stable step, node by node (Gershgorin bound): the stiffness a node sees over its mass, dt_i = 1 / sqrt(k_i / m_i).
  // The few nodes far stiffer than the rest (short cells where pieces were joined, tiny trims) get extra mass so they
  // don't set the step for the whole model (selective mass scaling; the added mass is reported).
  const kn = new Float64Array(N);
  for (let c = 0; c < NC; c++) { const m = MATS[CMAT[c]], Ep = m.E / (1 - m.nu * m.nu);
    for (let t = 0; t < 4; t++) { const L12 = CTR[12 * c + 3 * t], px = CTR[12 * c + 3 * t + 1], py = CTR[12 * c + 3 * t + 2], A = .5 * L12 * py;
      const amin = 2 * A / Math.max(L12, Math.hypot(px, py), Math.hypot(px - L12, py)), k = Ep * CH[c] / 2 * A / (amin * amin);
      for (const z of TRI[t]) kn[CN[4 * c + z]] += k; } }
  for (let t = 0; t < NT; t++) { const k = MATS[TMAT[t]].E * TAR[t] / TL0[t]; kn[TA[t]] += k; kn[TB[t]] += k; }
  for (let k = 0; k < NH; k++) { const kk = HKP[k] / (HDB[k] * HDB[k]); for (let z = 0; z < 6; z++) kn[HN[6 * k + z]] += z < 2 ? kk : kk / 4;   // |du/dx|: 1/d on the hinge line, 1/(2d) at a flap node
  }
  for (let t = 0; t < NT; t++) { const Lm = TMM[t] * TL0[t];
    if (TBA[t] >= 0) { const kb = TKB[t] / (Lm * Lm); kn[TA[t]] += 4 * kb; kn[TBA[t]] += kb; kn[TBB[t]] += kb; }
    if (TSC[t] >= 0) { const ks = TKS[t] / (TL0[t] * TL0[t]), kc = TKS[t] / ((2 * TMM[t] - 1) * TL0[t]) ** 2; kn[TA[t]] += ks; kn[TB[t]] += ks; kn[TSC[t]] += kc; kn[TBB[t]] += kc; } }
  for (let i = 0; i < N; i++) kn[i] += AK[i];
  { let wi = 0, wr = 0; for (let i = 0; i < N; i++) if (WINV[i] > 0 && kn[i] / M[i] > wr) { wr = kn[i] / M[i]; wi = i; }
    const kc = new Float64Array(3);
    for (let c = 0; c < NC; c++) for (let t = 0; t < 4; t++) for (const z of TRI[t]) if (CN[4 * c + z] === wi) { const m = MATS[CMAT[c]], Ep = m.E / (1 - m.nu * m.nu), L12 = CTR[12 * c + 3 * t], px = CTR[12 * c + 3 * t + 1], py = CTR[12 * c + 3 * t + 2], A = .5 * L12 * py, amin = 2 * A / Math.max(L12, Math.hypot(px, py), Math.hypot(px - L12, py)); kc[0] += Ep * CH[c] / 2 * A / (amin * amin); }
    for (let t = 0; t < NT; t++) { if (TA[t] === wi || TB[t] === wi) kc[1] += MATS[TMAT[t]].E * TAR[t] / TL0[t];
      const Lm = TMM[t] * TL0[t]; if (TBA[t] >= 0) { const kb = TKB[t] / (Lm * Lm); if (TA[t] === wi) kc[1] += 4 * kb; if (TBA[t] === wi || TBB[t] === wi) kc[1] += kb; } }
    for (let k = 0; k < NH; k++) for (let z = 0; z < 6; z++) if (HN[6 * k + z] === wi) kc[2] += HKP[k] / (HDB[k] * HDB[k]) * (z < 2 ? 1 : .25);
    scene.dtWorst = { node: wi, pos: [R0[3 * wi], R0[3 * wi + 1], R0[3 * wi + 2]], m: M[wi], frm: NFRM[wi], cells: kc[0], members: kc[1], hinges: kc[2], anchor: AK[wi], dt: Math.sqrt(M[wi] / kn[wi]) }; }
  const dti = []; for (let i = 0; i < N; i++) if (kn[i] > 0 && M[i] > 0 && WINV[i] > 0) dti.push(Math.sqrt(M[i] / kn[i]));
  dti.sort((a, b) => a - b);
  const dtT = dti[Math.min(dti.length - 1, Math.floor(dti.length * .002))];
  let added = 0, total = 0;
  for (let i = 0; i < N; i++) { total += M[i]; const need = kn[i] * dtT * dtT; if (M[i] > 0 && WINV[i] > 0 && need > M[i]) { added += need - M[i]; M[i] = need; WINV[i] = 1 / need; } }
  scene.massAdded = added / total;
  // 1.4 x the Gershgorin bound: its row sums overstate the membranes' top frequency ~2x; the members' (frames) are near
  // exact, and go unstable at 2 x (boundary dashpots, explicit, went at 1.5 x: now implicit). Was 0.75 x.
  dt = (st.dtK || 1.4) * dtT; BETA = (st.betaK ?? .033) * .75 * dtT;   // the stiffness damping as before (not tied to the step)
  // ---- contact candidates: planar pieces whose plane passes within 1.5 m of the node (not its own)
  NCC = new Int32Array(4 * N).fill(-1);
  const bucket = new Map(), BK = 3;
  PAN.forEach((P, q) => { if (!P.planar) return; const c = [P.o, add(P.o, mul(P.U, P.Lu)), add(P.o, mul(P.V, P.Lv)), add(add(P.o, mul(P.U, P.Lu)), mul(P.V, P.Lv))];
    const lo = [0, 1, 2].map(k => Math.floor((Math.min(...c.map(p => p[k])) - 1.5) / BK)), hi = [0, 1, 2].map(k => Math.floor((Math.max(...c.map(p => p[k])) + 1.5) / BK));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = x + ',' + y + ',' + z; let l = bucket.get(k); if (!l) bucket.set(k, l = []); l.push(q); } });
  for (let i = 0; i < N; i++) {
    let k = 0; const p = [R0[3 * i], R0[3 * i + 1], R0[3 * i + 2]];
    for (const q of bucket.get(Math.floor(p[0] / BK) + ',' + Math.floor(p[1] / BK) + ',' + Math.floor(p[2] / BK)) || []) {
      if (k >= 4) break;
      const P = PAN[q], d = sub(p, P.o), dn = dot(d, P.n);
      if (Math.abs(dn) < .05 || Math.abs(dn) > 1.5) continue;           // closer than 5 cm at rest: a junction, not a contact
      const u = dot(d, P.U), v = dot(d, P.V);
      if (u < -1 || v < -1 || u > P.Lu + 1 || v > P.Lv + 1) continue;
      NCC[4 * i + k++] = q;
    }
  }
  buildTwins();
  scene.snapped = snapped; scene.unsnapped = unsnapped; scene.dropped = dropped; scene.key = patchKey();
  buildGrid();
  DOTS_PER = [18, 10, 8, 8, 8].map(d => Math.max(2, Math.round(d * (S / .25) ** 2)));
  sim = null; gpu = null; EN = null; CU = null;
}

// ---- petals (st.petals): a tear runs along cell edges instead of eroding cells. Every node inside a plate (not on a
// junction, not anchored) gets a twin, idle until a crack reaches it; a cell at its failure limit asks for a crack along
// one of its edges (the pair across its larger stretch; the one that continues a crack, else the one nearer the
// charge); at the next step each node of that edge splits: the cells on the far side of the crack line move to the
// twin (with their share of the mass), hinges across the line stop, the others follow their cells. A cracked cell that
// goes on to 1.5 x its limit erodes (as does one whose edges can split no further). Members stay on the parent node.
let TWIN = null, PARENT = null, SPL = null, MEMN = null, HOFF = null, CCR = null, NCL = null, HNL = null, CN0 = null, HN0 = null, M0 = null, N0T = 0;
const PCR = [];
const PKEEP = () => st.petalKeep !== false, PETK = () => st.petalK || 1.5, PRAD = () => st.petalRadial !== false;
function buildTwins() {
  TWIN = PARENT = SPL = NCL = HNL = CN0 = HN0 = M0 = null; HOFF = new Uint8Array(NH); CCR = new Uint8Array(NC); PCR.length = 0; N0T = N;
  if (!st.petals) return;
  const N0 = N, pan = new Int32Array(N0).fill(-2), ncell = new Int32Array(N0);
  for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) { const i = CN[4 * c + k]; ncell[i]++; pan[i] = pan[i] === -2 ? CPAN[c] : pan[i] === CPAN[c] ? pan[i] : -1; }
  for (let h = 0; h < NH; h++) if (!HSAME[h]) { pan[HN[6 * h]] = -1; pan[HN[6 * h + 1]] = -1; }   // junctions stay whole
  const tw = new Int32Array(N0).fill(-1); let nt = 0;
  for (let i = 0; i < N0; i++) if (pan[i] >= 0 && ncell[i] >= 2 && AK[i] === 0 && WINV[i] > 0) tw[i] = N0 + nt++;
  if (!nt) return;
  const N1 = N0 + nt, grow = (A, k, fill) => { const B = new A.constructor(k * N1); B.set(A); if (fill !== undefined) B.fill(fill, k * N0); return B; };
  X = grow(X, 3); R0 = grow(R0, 3); V = grow(V, 3); ANC = grow(ANC, 3); M = grow(M, 1); WINV = grow(WINV, 1); FREE = grow(FREE, 1); AK = grow(AK, 1); AF = grow(AF, 1); AC = grow(AC, 1);
  NKIND = grow(NKIND, 1); NFRM = grow(NFRM, 1); NCON = grow(NCON, 1); TBRK = grow(TBRK, 1, -1); NCC = grow(NCC, 4, -1);
  PARENT = new Int32Array(N1).fill(-1);
  for (let i = 0; i < N0; i++) if (tw[i] >= 0) { const T = tw[i]; PARENT[T] = i; for (let q = 0; q < 3; q++) X[3 * T + q] = R0[3 * T + q] = ANC[3 * T + q] = R0[3 * i + q];
    NKIND[T] = NKIND[i]; NFRM[T] = NFRM[i]; for (let q = 0; q < 4; q++) NCC[4 * T + q] = NCC[4 * i + q]; }
  NCL = Array.from({ length: N0 }, () => []); for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) NCL[CN[4 * c + k]].push(4 * c + k);
  HNL = Array.from({ length: N0 }, () => []); for (let h = 0; h < NH; h++) for (let z = 0; z < 6; z++) HNL[HN[6 * h + z]].push(6 * h + z);
  MEMN = new Uint8Array(N0);
  for (let t = 0; t < NT; t++) { for (const i of [TA[t], TB[t], TBA[t], TBB[t], TSC[t]]) if (i >= 0) MEMN[i] = 1;
    if (TCL[t] >= 0 && (TBA[t] >= 0 || TSC[t] >= 0)) for (let z = 0; z < 4; z++) if (TQN[4 * t + z] >= 0) MEMN[TQN[4 * t + z]] = 1; }
  TWIN = tw; SPL = new Uint8Array(N0); CN0 = CN.slice(); HN0 = HN.slice(); M0 = M.slice(); N = N1;
}
// back to the unsplit mesh (a new run on the same build)
function resetTwins() {
  if (!TWIN) return;
  CN.set(CN0); HN.set(HN0); M.set(M0); SPL.fill(0); HOFF.fill(0); CCR.fill(0); PCR.length = 0;
  for (let i = 0; i < N0T; i++) if (M[i] > 0 && WINV[i] > 0) WINV[i] = 1 / M[i];
  for (let i = N0T; i < N; i++) { for (let q = 0; q < 3; q++) { X[3 * i + q] = R0[3 * i + q]; V[3 * i + q] = 0; } FREE[i] = 0; M[i] = 0; WINV[i] = 0; }
}
const orig = q => PARENT && PARENT[q] >= 0 ? PARENT[q] : q;
// a cell at its limit: the edge to crack (0..3: corners k, k+1), or -1
function crackEdge(c) {
  const q = [0, 1, 2, 3].map(k => CN[4 * c + k]), L = (a, b, P) => Math.hypot(P[3 * q[b]] - P[3 * q[a]], P[3 * q[b] + 1] - P[3 * q[a] + 1], P[3 * q[b] + 2] - P[3 * q[a] + 2]);
  const s1 = (L(0, 1, X) + L(3, 2, X)) / (L(0, 1, R0) + L(3, 2, R0)), s3 = (L(0, 3, X) + L(1, 2, X)) / (L(0, 3, R0) + L(1, 2, R0));
  let cand = s3 > s1 + 1e-4 ? [0, 2] : [3, 1];              // stretched along 0-1: the crack runs along 0-3 / 1-2 (a tie: that too)
  if (PRAD()) {                                              // radial: the crack runs along the edges nearer the charge's radius
    const o = orig(q[0]), a = orig(q[1]), b = orig(q[3]), C = sim.C, r = [CRC[3 * c] - C[0], CRC[3 * c + 1] - C[1], CRC[3 * c + 2] - C[2]];
    const e1 = [R0[3 * a] - R0[3 * o], R0[3 * a + 1] - R0[3 * o + 1], R0[3 * a + 2] - R0[3 * o + 2]], e3 = [R0[3 * b] - R0[3 * o], R0[3 * b + 1] - R0[3 * o + 1], R0[3 * b + 2] - R0[3 * o + 2]];
    const a1 = Math.abs(dot(r, e1)) / len(e1), a3 = Math.abs(dot(r, e3)) / len(e3);
    if (Math.abs(a1 - a3) > 1e-3 * len(r)) cand = a1 > a3 ? [0, 2] : [3, 1]; }     // (on a diagonal: the stretch decides)
  const free = k => { let f = 0, sp = 0; for (const z of [k, (k + 1) % 4]) { const o = orig(q[z]); if (TWIN[o] >= 0 && !SPL[o]) f++; else if (SPL[o]) sp++; } return [f, sp]; };
  const C = sim.C, dC = k => { const a = orig(q[k]), b = orig(q[(k + 1) % 4]); return Math.hypot((R0[3 * a] + R0[3 * b]) / 2 - C[0], (R0[3 * a + 1] + R0[3 * b + 1]) / 2 - C[1], (R0[3 * a + 2] + R0[3 * b + 2]) / 2 - C[2]); };
  const [fa, sa] = free(cand[0]), [fb, sb] = free(cand[1]);
  if (!fa && !fb) return -1;
  if (fa && !fb) return cand[0];
  if (fb && !fa) return cand[1];
  if (sa !== sb) return sa > sb ? cand[0] : cand[1];
  const da = dC(cand[0]), db = dC(cand[1]);
  return Math.abs(da - db) < 1e-5 ? Math.min(cand[0], cand[1]) : da < db ? cand[0] : cand[1];
}
// the requests of the last step: each node on a requested edge takes the request of the largest failure ratio (then
// the lowest cell index) and splits along that edge (as the GPU: node by node)
function applyCracks() {
  if (!PCR.length) return;
  const best = new Map();
  for (let k = 0; k < PCR.length; k += 3) { const c = PCR[k], e = PCR[k + 1], r = PCR[k + 2];
    for (const z of [e, (e + 1) % 4]) { const p = orig(CN[4 * c + z]); if (TWIN[p] < 0 || SPL[p]) continue;
      const o = best.get(p); if (!o || r > o[2] || (r === o[2] && c < o[0])) best.set(p, [c, e, r]); } }
  PCR.length = 0;
  const todo = [...best.entries()].sort((a, b) => a[0] - b[0]);
  const nrmOf = new Map(); for (const [p, [c, e]] of todo) { const a = orig(CN0[4 * c + e]), b = orig(CN0[4 * c + (e + 1) % 4]);
    const n = nrm(cross([R0[3 * b] - R0[3 * a], R0[3 * b + 1] - R0[3 * a + 1], R0[3 * b + 2] - R0[3 * a + 2]], cellN0(c)));
    nrmOf.set(p, n[0] + 1.37 * n[1] + 1.91 * n[2] < 0 ? mul(n, -1) : n); }      // one orientation: the twin takes the same side whichever cell asked
  for (const [p] of todo) splitNode(p, nrmOf.get(p));
}
// a cell's rest normal from its original corners
function cellN0(c) { const q0 = CN0[4 * c], q1 = CN0[4 * c + 1], q3 = CN0[4 * c + 3];
  return nrm(cross([R0[3 * q1] - R0[3 * q0], R0[3 * q1 + 1] - R0[3 * q0 + 1], R0[3 * q1 + 2] - R0[3 * q0 + 2]], [R0[3 * q3] - R0[3 * q0], R0[3 * q3 + 1] - R0[3 * q0 + 1], R0[3 * q3 + 2] - R0[3 * q0 + 2]])); }
// a GPU run's splits (its crack normals, read back at the end): the same corner and hinge rewrite on the CPU's mesh
function applyGpuSplits(CRK) {
  for (let p = 0; p < N0T; p++) if (TWIN[p] >= 0 && !SPL[p] && CRK[4 * p + 3] > 0) splitNode(p, [CRK[4 * p], CRK[4 * p + 1], CRK[4 * p + 2]], true);
}
function splitNode(p, n, meshOnly = false) {
  const T = TWIN[p], side = c => (CRC[3 * c] - R0[3 * p]) * n[0] + (CRC[3 * c + 1] - R0[3 * p + 1]) * n[1] + (CRC[3 * c + 2] - R0[3 * p + 2]) * n[2] > 0;
  let mB = 0, nB = 0, nA = 0;
  for (const e of NCL[p]) { const c = e >> 2; if (side(c)) { nB++; mB += MATS[CMAT[c]].rho * CH[c] * CAR[c] / 4; } else nA++; }
  if (!nA || !nB) return;                                   // the line misses the node's cells: nothing to split
  SPL[p] = 1;
  for (const e of NCL[p]) { const c = e >> 2; if (side(c)) CN[e] = T; }
  for (const e of HNL[p]) { const h = (e / 6) | 0, z = e - 6 * h, c1 = HC[2 * h], c2 = HC[2 * h + 1];
    if (z < 2) { if (side(c1) !== side(c2)) HOFF[h] = 1; else if (side(c1)) HN[e] = T; }
    else if (side(z < 4 ? c1 : c2)) HN[e] = T; }
  if (meshOnly) return;
  // mass: the far side's cells take their share; a node carrying members keeps its own (their stiffness stays there)
  M[T] = mB; WINV[T] = 1 / mB; if (!MEMN[p]) { M[p] = Math.max(M[p] - mB, 1e-3 * M[p]); WINV[p] = 1 / M[p]; }
  for (let q = 0; q < 3; q++) { X[3 * T + q] = X[3 * p + q]; V[3 * T + q] = V[3 * p + q]; }
  FREE[T] = 0; TBRK[T] = TBRK[p];
}

// dihedral angle geometry of a hinge (edge x3-x4, flaps = midpoints of the far edges)
function hingeGeom(P, x3, x4, f1a, f1b, f2a, f2b) {
  const g = i => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  const a3 = g(x3), a4 = g(x4), p1 = mul(add(g(f1a), g(f1b)), .5), p2 = mul(add(g(f2a), g(f2b)), .5);
  const E = sub(a4, a3), lE = len(E); if (lE < 1e-9) return null;
  const N1 = cross(sub(p1, a3), sub(p1, a4)), N2 = cross(sub(p2, a4), sub(p2, a3));
  const l1 = len(N1), l2 = len(N2); if (l1 < 1e-12 || l2 < 1e-12) return null;
  const n1 = mul(N1, 1 / l1), n2 = mul(N2, 1 / l2), Eh = mul(E, 1 / lE);
  return { th: Math.atan2(dot(cross(n2, n1), Eh), dot(n1, n2)), lE, h1: l1 / lE, h2: l2 / lE };
}

/* ------------------------------------------------------------------ ray grid (rest geometry): picking, line of sight, fragments */
let RG = null;
function buildGrid() {
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < N; i++) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], R0[3 * i + q]); hi[q] = Math.max(hi[q], R0[3 * i + q]); }
  lo = lo.map(v => v - .6); hi = hi.map(v => v + .6);
  const G = .5, dim = [0, 1, 2].map(q => Math.max(1, Math.ceil((hi[q] - lo[q]) / G)));
  const cnt = new Int32Array(dim[0] * dim[1] * dim[2] + 1);
  const vox = (c, f) => {
    let b0 = [1e9, 1e9, 1e9], b1 = [-1e9, -1e9, -1e9];
    for (let k = 0; k < 4; k++) { const i = CN[4 * c + k]; for (let q = 0; q < 3; q++) { b0[q] = Math.min(b0[q], R0[3 * i + q]); b1[q] = Math.max(b1[q], R0[3 * i + q]); } }
    const i0 = b0.map((v, q) => Math.max(0, Math.floor((v - .01 - lo[q]) / G))), i1 = b1.map((v, q) => Math.min(dim[q] - 1, Math.floor((v + .01 - lo[q]) / G)));
    for (let z = i0[2]; z <= i1[2]; z++) for (let y = i0[1]; y <= i1[1]; y++) for (let x = i0[0]; x <= i1[0]; x++) f((z * dim[1] + y) * dim[0] + x);
  };
  for (let c = 0; c < NC; c++) vox(c, v => cnt[v + 1]++);
  for (let v = 0; v < cnt.length - 1; v++) cnt[v + 1] += cnt[v];
  const list = new Int32Array(cnt[cnt.length - 1]), fill = cnt.slice();
  for (let c = 0; c < NC; c++) vox(c, v => { list[fill[v]++] = c; });
  RG = { lo, G, dim, cnt, list, mark: new Int32Array(NC), stamp: 0 };
}
// ray-quad (two triangles on the rest positions); returns t or -1
function rayCell(c, o, d) {
  const q = [0, 1, 2, 3].map(k => CN[4 * c + k]);
  let best = -1;
  for (const [a, b, e] of [[0, 1, 2], [0, 2, 3]]) {
    const A = 3 * q[a], B = 3 * q[b], C = 3 * q[e];
    const e1 = [R0[B] - R0[A], R0[B + 1] - R0[A + 1], R0[B + 2] - R0[A + 2]], e2 = [R0[C] - R0[A], R0[C + 1] - R0[A + 1], R0[C + 2] - R0[A + 2]];
    const p = cross(d, e2), det = dot(e1, p); if (Math.abs(det) < 1e-12) continue;
    const s = [o[0] - R0[A], o[1] - R0[A + 1], o[2] - R0[A + 2]], u = dot(s, p) / det; if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qq = cross(s, e1), v = dot(d, qq) / det; if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const t = dot(e2, qq) / det; if (t > 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}
// first cell a ray meets within tmax (skip eroded if asked, skip one cell); returns [t, cell] or null
function firstHit(o, d, tmax, skipEroded, skipCell = -1, skipFn = null) {
  const g = RG, stamp = ++g.stamp;
  let p = [(o[0] - g.lo[0]) / g.G, (o[1] - g.lo[1]) / g.G, (o[2] - g.lo[2]) / g.G];
  // clip the ray into the grid box
  let t0 = 0, t1 = tmax;
  for (let q = 0; q < 3; q++) {
    if (Math.abs(d[q]) < 1e-12) { if (p[q] < 0 || p[q] > g.dim[q]) return null; continue; }
    let a = (0 - p[q]) * g.G / d[q], b = (g.dim[q] - p[q]) * g.G / d[q]; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1) return null;
  const s = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
  let ix = [0, 1, 2].map(q => Math.min(g.dim[q] - 1, Math.max(0, Math.floor((s[q] - g.lo[q]) / g.G))));
  const step = d.map(v => v > 0 ? 1 : -1);
  const tMax = [0, 1, 2].map(q => Math.abs(d[q]) < 1e-12 ? Infinity : ((g.lo[q] + (ix[q] + (d[q] > 0 ? 1 : 0)) * g.G) - o[q]) / d[q]);
  const tD = [0, 1, 2].map(q => Math.abs(d[q]) < 1e-12 ? Infinity : g.G / Math.abs(d[q]));
  let best = Infinity, bc = -1;
  for (let it = 0; it < 4000; it++) {
    const v = (ix[2] * g.dim[1] + ix[1]) * g.dim[0] + ix[0];
    for (let k = g.cnt[v]; k < g.cnt[v + 1]; k++) {
      const c = g.list[k]; if (g.mark[c] === stamp) continue; g.mark[c] = stamp;
      if (c === skipCell || (skipEroded && CKN[c] === 1) || (skipFn && skipFn(c))) continue;
      const t = rayCell(c, o, d); if (t > 1e-5 && t < best && t <= tmax) { best = t; bc = c; }
    }
    const q = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    if (best <= tMax[q] || tMax[q] > t1) break;
    ix[q] += step[q]; if (ix[q] < 0 || ix[q] >= g.dim[q]) break; tMax[q] += tD[q];
  }
  return bc >= 0 ? [best, bc] : null;
}

/* ------------------------------------------------------------------ blast relations */
const kinneyPs = Z => { const a = Z / 4.5, b = Z / .048, c = Z / .32, d = Z / 1.35; return P0 * 808 * (1 + a * a) / Math.sqrt((1 + b * b) * (1 + c * c) * (1 + d * d)); };
const kinneyIs1 = Z => 6.7 * Math.sqrt(1 + Math.pow(Z / .23, 4)) / (Z * Z * Math.cbrt(1 + Math.pow(Z / 1.55, 3)));   // Pa s per kg^1/3
const reflect = Ps => 2 * Ps * (7 * P0 + 4 * Ps) / (7 * P0 + Ps);
const TA1 = new Float32Array(2048);                 // shock arrival for 1 kg, Z = 0 .. 40.94 in steps of .02
(() => { let t = 0; for (let k = 1; k < 2048; k++) { const Z = k * .02; t += .02 / (340 * Math.sqrt(1 + 6 * kinneyPs(Math.max(Z, .053)) / (7 * P0))); TA1[k] = t; } })();
const arrival1 = Z => { const k = Math.min(2046, Z / .02), i = Math.floor(k); return TA1[i] + (TA1[i + 1] - TA1[i]) * (k - i); };
const qsp = (W, Vv) => W > 0 ? 2.25e6 * Math.pow(W / Vv, .72) : 0;
const fireR = W => .5 * 3.86 * Math.pow(Math.max(W, .01), .32);

// the pulse a source gives a surface element at xc with unit normal n (area-independent): air shock (P, TD, TA) and
// the extra products impulse (Ix, front tau0 after t0). Returns null if the source doesn't reach it.
const PUL = { P: 0, I: 0, TD: 0, TA: 0, Ix: 0, tf: 0, t0: 0, g: 1, tc: 0 };
// water shock of a burst at the waterline (kind 3, wet plating only, depth dc): Cole's similitude, Pm = 52.4 MPa
// (W^1/3/R)^1.13, decay theta = 0.084 ms W^1/3 (W^1/3/R)^-0.23, cut off when the free surface's relief (the negative
// image of the source, depth ds) arrives; on the plating (1 + cos) x the incident wave (rigid-wall doubling head on),
// the water's radiation term (cell pass) takes back what the moving plate doesn't feel
const C_WS = 1500;
function waterPulse(s, R, ca, dc) {
  R = Math.max(R, s.rc); const W3 = Math.cbrt(s.W), X = W3 / R;
  PUL.P = (1 + ca) * 52.4e6 * Math.pow(X, 1.13); PUL.TD = .084e-3 * W3 * Math.pow(X, -.23);
  PUL.TA = s.t0 + R / C_WS; PUL.tc = Math.min((Math.sqrt(R * R + 4 * s.ax[0] * Math.max(dc, 0)) - R) / C_WS, 10 * PUL.TD);
  PUL.I = PUL.P * PUL.TD * (1 - Math.exp(-PUL.tc / PUL.TD)); PUL.Ix = 0; PUL.g = s.gain; PUL.t0 = s.t0;
  return PUL;
}
function pulse(s, xc, n, dc = -1) {
  let dx = xc[0] - s.pos[0], dy = xc[1] - s.pos[1], dz = xc[2] - s.pos[2];
  let R = Math.hypot(dx, dy, dz); if (R < 1e-6) R = 1e-6;
  const ca = Math.abs(dx * n[0] + dy * n[1] + dz * n[2]) / R, c2 = ca * ca;
  PUL.tc = 0;
  if (s.kind === 3) return dc >= 0 ? waterPulse(s, R, ca, dc) : null;
  let co = 1;
  if (s.kind === 1) { co = (dx * s.ax[0] + dy * s.ax[1] + dz * s.ax[2]) / R; if (co < 0) return null; co = Math.max(co, .02); }
  R = Math.max(R, s.rc);
  const Weq = s.kind === 1 ? 4 * s.W * co : s.W;
  PUL.P = 0; PUL.I = 0; PUL.Ix = 0; PUL.g = s.gain; PUL.t0 = s.t0;
  if (Weq > 1e-6) {
    const W3 = Math.cbrt(Weq), Z = Math.max(R / W3, .053);
    const Ps = kinneyPs(Z), Pr = reflect(Ps), is = kinneyIs1(Z) * W3, ir = is * Math.pow(Pr / Ps, .75);
    PUL.P = Ps + (Pr - Ps) * c2; PUL.I = is + (ir - is) * c2; PUL.TD = 2 * PUL.I / PUL.P; PUL.TA = s.t0 + W3 * arrival1(Z);
  }
  // a wave that came through an opening is never stronger than the unobstructed wave of the source that fed it at the
  // same path length (the aperture re-radiates, it cannot focus): cap by the feeding source over Df + R
  const capped = s.Wf > 0, Rd = capped ? s.Df + R : 0;
  if (capped && PUL.P > 0) {
    const W3 = Math.cbrt(s.Wf), Z = Math.max(Rd / W3, .053), Ps = kinneyPs(Z), Pr = reflect(Ps), is = kinneyIs1(Z) * W3, ir = is * Math.pow(Pr / Ps, .75);
    const Pd = Ps + (Pr - Ps) * c2, Id = is + (ir - is) * c2;
    if (Id < PUL.I) PUL.I = Id; if (Pd < PUL.P) PUL.P = Pd; PUL.TD = 2 * PUL.I / PUL.P;
  }
  if (s.Pm > 0) {
    let ip = s.Pm * (s.kind === 1 ? co / Math.PI : 1 / (4 * Math.PI)) * c2 / (R * R);
    if (capped) ip = Math.min(ip, s.Pmf * c2 / (4 * Math.PI * Rd * Rd));
    PUL.Ix = Math.max(0, ip - PUL.I); PUL.tf = R / U_MAX;
  }
  return PUL;
}
// impulse per unit area between t and t + h
function pulseImp(p, t, h, cu = false) {           // cu: the source is new this step: everything it owed so far
  let I = 0;
  if (p.tc > 0) { const a = cu ? 0 : Math.min(Math.max(t - p.TA, 0), p.tc), b = Math.min(Math.max(t + h - p.TA, 0), p.tc); return p.P * p.TD * (Math.exp(-a / p.TD) - Math.exp(-b / p.TD)) * p.g; }
  if (p.P > 0) { let a = cu ? -1e9 : t - p.TA, b = t - p.TA + h; const TD = p.TD;
    if (b > 0 && a < TD) { if (a < 0) a = 0; if (b > TD) b = TD; I += p.P * ((b - b * b / (2 * TD)) - (a - a * a / (2 * TD))); } }
  if (p.Ix > 0) { const F = x => x <= p.tf ? 0 : 1 - Math.pow(p.tf / x, 4); I += p.Ix * (F(t + h - p.t0) - (cu ? 0 : F(t - p.t0))); }
  return I * p.g;
}
// share of the air and products impulse that arrives after time te
function pulseAfter(p, te) {
  let fa = 0, fp = 0;
  if (p.P > 0) { const a = Math.min(Math.max(te - p.TA, 0), p.TD); fa = 1 - (a - a * a / (2 * p.TD)) / (p.TD / 2); }
  if (p.Ix > 0) { const x = te - p.t0; fp = x <= p.tf ? 1 : Math.pow(p.tf / x, 4); }
  return [fa, fp];
}

/* ------------------------------------------------------------------ detonation */
const CONTENTS = {
  charge: null,
  vls_burn: { label: 'Missile cells ×8 · motors burn', cells: 8, he: 60, prop: 450, det: false },
  vls_det: { label: 'Missile cells ×8 · mass detonation', cells: 8, he: 60, prop: 450, det: true },
  fuel: { label: 'Aviation fuel tank · JP-5', fuel: 15000, vapour: 15 },
};
let sim = null, gpu = null, EN = null;
const SHUT = [], VLOG = [];
// shut openings between compartments (boxes sharing a face): a hatch between decks (1 m^2, 50 kPa) or a watertight
// door in a bulkhead (1.3 m^2, 100 kPa); to the outside a ventilation trunk (up to 1.2 m^2, 30 kPa) and, from a
// space under the weather deck, a weather door (1.5 m^2, 70 kPa). Public damage-control figures, coarse.
function shutVents(sc) {
  const V = [], S = sc.spaces, ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  const ok = s => s.box && s.V < Infinity; let top = -Infinity; for (const s of S) if (ok(s)) top = Math.max(top, s.box[4]);
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { if (!ok(S[i]) || !ok(S[j])) continue; const a = S[i].box, b = S[j].box;
    for (let k = 0; k < 3; k++) {
      if (!(Math.abs(a[k + 3] - b[k]) < .05 || Math.abs(b[k + 3] - a[k]) < .05)) continue;
      const o1 = (k + 1) % 3, o2 = (k + 2) % 3;
      if (ov(a[o1], a[o1 + 3], b[o1], b[o1 + 3]) < .5 || ov(a[o2], a[o2 + 3], b[o2], b[o2 + 3]) < .5) continue;
      V.push(k === 1 ? [i, j, 1.0, 50e3] : [i, j, 1.3, 100e3]);
    } }
  for (let i = 0; i < S.length; i++) { if (!ok(S[i])) continue;
    V.push([i, sc.OUT, Math.max(.1, Math.min(1.2, S[i].V / 400)), 30e3]);
    if (Math.abs(S[i].box[4] - top) < .3) V.push([i, sc.OUT, 1.5, 70e3]); }
  return V;
}
const GP = [], OPEN = new Map();
let GV = [];

const patchKey = () => JSON.stringify([st.aim, st.aimN, st.kg, st.fuze, st.src, st.patchL, st.grid, st.fineR, st.uniformGrid]);
function detonate() {
  const fillNow = CONTENTS[st.src] ? 400 : st.kg;
  if (sim || (scene.name === 'burke' && scene.key !== patchKey())) build();
  const src = CONTENTS[st.src];
  const inside = st.fuze === 'inside' || !!src;
  const a = st.aim, n = st.aimN;
  const fill = src ? (src.he && src.det ? src.cells * src.he * 1.2 : 0) : st.kg;
  const Mc = src ? 0 : Math.max(0, st.casing || 0);
  // cased charge: Gurney velocity of the casing, Fisher/Fano reduction of the blast
  const W = fill > 0 ? fill * (Mc > 0 ? .2 + .8 / (1 + Mc / fill) : 1) : 0;
  const Wgas = src && src.prop ? src.cells * src.prop * .25 : 0;
  const rc = Math.cbrt(3 * Math.max(fill, .01) / (4 * Math.PI * RHO_TNT));
  let C;
  const dIn = st.inDepth || 1.6;                                        // inside: this far in from the aim point
  if (inside) C = [a[0] - n[0] * dIn, a[1] - n[1] * dIn, a[2] - n[2] * dIn];
  else { const d = st.fuze === 'contact' ? rc : Math.max(st.standoff, rc); C = [a[0] + n[0] * d, a[1] + n[1] * d, a[2] + n[2] * d]; }
  const cc = scene.spaceAt(C);
  GV = scene.spaces.map(s => s.V); GP.length = 0; for (let k = 0; k < GV.length; k++) GP.push(0); OPEN.clear();
  // openings: the scene's own are open; hatches, doors and ventilation closures are shut until the pressure across
  // them reaches their failure pressure (condition Zebra; as the game: game/src/blast/spec.js ventsOf)
  SHUT.length = 0; VLOG.length = 0;
  for (const [a, b, A, pf] of [...(scene.vents || []), ...(st.shutVents === false ? [] : shutVents(scene))]) if (a !== b) {
    if (pf > 0) SHUT.push([a, b, A, pf]); else { const k = (Math.min(a, b) << 8) | Math.max(a, b); OPEN.set(k, (OPEN.get(k) || 0) + A); } }
  const prim = { pos: C, W, Pm: W * U_MEAN, t0: 0, space: cc, kind: 0, ax: [0, 0, 0], gain: 1, rc, vis: cc === scene.OUT ? 0 : -1, plane: null, gen: 0, Wsrc: W, key: 'P' };
  const srcs = [];
  if (cc !== scene.OUT && GV[cc] < Infinity) {                           // a closed compartment (the Burke has OUT = 0)
    if (W > 0) srcs.push({ c: cc, Pq: qsp(W, GV[cc]), kind: 'det', tau: .002, F: 0 });
    if (Wgas > 0) srcs.push({ c: cc, Pq: qsp(Wgas, GV[cc]), kind: 'burn', tau: .12, F: 0 });
    if (src && src.fuel) srcs.push({ c: cc, Pq: .8e6 * Math.min(1, src.vapour / (GV[cc] * 1.2 / 15)), kind: 'burn', tau: .06, F: 0 });
    if (st.gasRamp) srcs.push({ c: cc, Pq: st.gasRamp.P, kind: 'burn', tau: st.gasRamp.tau || .1, F: 0 });   // a test: gas alone, rising as 1 - e^(-t/tau)
  }
  const W3 = Math.cbrt(Math.max(W, 1));
  sim = { t: 0, n: 0, phase: 1, W, fill, Mc, Wgas, src, C, cc, rc, inside, prim, SRC: [], holes: [], srcs, WIN: new Float64Array(GV.length),
    T1: srcs.length ? .4 : .25, tMin: .01 + .006 * W3, relax: false, post: 0, maxDef: 0, frags: null, solver: st.solver,
    alpha: 0, cellsTorn: 0, hullTorn: 0, lastSrc: 0, sync: false };
  // line of sight from an inside charge to the walls of its compartment (machinery flats, enclosure walls, other
  // decks' edges shadow what lies behind them): rays on the rest geometry, bit 3
  if (cc !== scene.OUT && W > 0 && st.insideLOS !== false) {
    for (let c = 0; c < NC; c++) {
      if (CSP[c] !== cc && CSN[c] !== cc) continue;
      const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], d = sub(xc, C), L = len(d);
      if (L < 1e-6 || !firstHit(C, mul(d, 1 / L), L - 1e-3, false, c)) CVIS[c] |= 8;
    }
    prim.vis = 3;
  }
  // line of sight from outside sources (the hull is not convex everywhere): rays on the rest geometry
  if (cc === scene.OUT && W > 0) {
    const Cimg = [C[0], 2 * scene.waterline - C[1], C[2]];
    for (let c = 0; c < NC; c++) {
      if (CSP[c] !== scene.OUT && CSN[c] !== scene.OUT) continue;
      if (CWET[c] >= 0) continue;                                       // under water: the air shock doesn't reach it
      const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
      const outN = CSP[c] === scene.OUT ? nn : mul(nn, -1);
      if (dot(sub(C, xc), outN) > 0) { const d = sub(xc, C), L = len(d); if (!firstHit(C, mul(d, 1 / L), L - 1e-3, false, c)) CVIS[c] |= 1; }
      if (C[1] > scene.waterline && dot(sub(Cimg, xc), outN) > 0) {
        const d = sub(xc, Cimg), L = len(d), dd = mul(d, 1 / L);
        const tw = (scene.waterline - Cimg[1]) / dd[1], pw = add(Cimg, mul(dd, tw));
        if (tw > 0 && tw < L && scene.spaceAt([pw[0], pw[1] + .01, pw[2]]) === scene.OUT &&
          !firstHit(pw, dd, L - tw - 1e-3, false, c) && !firstHit(C, nrm(sub(pw, C)), len(sub(pw, C)), false)) CVIS[c] |= 2;
      }
    }
  }
  // a burst at the waterline also drives a shock into the water: the charge's share below (or within 2 charge radii
  // above) the surface, as an equivalent charge just under it; it loads the wet plating it sees through the water
  sim.water = null;
  if (cc === scene.OUT && W > 0 && scene.waterline !== undefined && !st.noWater) {
    const hgt = C[1] - scene.waterline, f = Math.min(1, Math.max(0, .5 - .5 * hgt / (2 * rc)));
    if (f > .01) {
      const Ww = W * f, rw = Math.cbrt(3 * Ww / (4 * Math.PI * RHO_TNT)), ds = Math.max(0, -hgt) + rw, Cw = [C[0], scene.waterline - ds, C[2]];
      for (let c = 0; c < NC; c++) {
        if (CWET[c] < 0 || (CSP[c] !== scene.OUT && CSN[c] !== scene.OUT)) continue;
        const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
        const outN = CSP[c] === scene.OUT ? nn : mul(nn, -1);
        if (dot(sub(Cw, xc), outN) <= 0) continue;
        const d = sub(xc, Cw), L = len(d); if (!firstHit(Cw, mul(d, 1 / L), L - 1e-3, false, c)) CVIS[c] |= 4;
      }
      sim.water = { pos: Cw, W: Ww, Wsrc: Ww, Pm: 0, t0: 0, space: scene.OUT, kind: 3, ax: [ds, 0, 0], gain: 1, rc: rw, vis: 2, plane: null, gen: 0, key: 'W', frac: f };
    }
  }
  sim.frags = Mc > 0 && st.frags && fill > 0 ? makeFrags(C, fill, Mc) : null;
  EN = { ext: 0, kin: 0, el: 0, plM: 0, plH: 0, plT: 0, plA: 0, damp: 0, relax: 0, rad: 0, frac: 0, contact: 0, frag: 0, water: 0,
    // plastic work: the mean of last step's and this step's (returned) force over the plastic increment (trapezoid, as
    // the kinetic energy): the split no longer counts the explicit step's overshoot as dissipation (AUDIT A2)
    pvh: new Float64Array(NH), pvc: new Float64Array(12 * NC), pvf: new Float64Array(NT), pvb: new Float64Array(NT), pvs: new Float64Array(NT) };
  rebuildSources(0);
  // the GPU backend is made here (scripts and harnesses read it right after): WebGPU for runs that read back
  // asynchronously (interactive, runCaseAsync: asyncRun), WebGL2 for blocking ones and without WebGPU
  LAT = SYNC * Math.max(2, Math.round((st.latMs || 1) * 1e-3 / (SYNC * dt)));
  PENDC.clear(); PENDN.clear();
  if (sim.solver === 'gpu') { sim.gpuInit = false; sim.headless = !asyncRun; initGPU(); sim.headless = false; }
}
let asyncRun = false;
// the GPU backend for this run: WebGPU unless asked for WebGL2, or the run reads back blocking (headless / sync)
function initGPU() {
  const s = sim, want = WG && (st.backend === 'webgpu' || (st.backend === 'auto' && !s.headless && !s.sync)) ? 'webgpu' : 'webgl';
  if (s.gpuInit && gpu && (gpu.kind || 'webgl') === want) return;
  if (gpu && ((gpu.kind || 'webgl') !== want || (want === 'webgpu' && gpu.batch !== Math.min(st.wgBatch, Math.max(SYNC, LAT / 2))))) { gpu.dispose(); gpu = null; }
  if (!gpu) gpu = want === 'webgpu' ? createWGPU(WG, gpuModel(), { batch: Math.min(st.wgBatch, Math.max(SYNC, LAT / 2)), depth: st.wgDepth }) : createGPU(gl, gpuModel());
  gpu.upload(); gpu.setSources(s.SRC); gpu.setGas(GP); s.gpuInit = true; s.backend = want;
}
const isWG = () => gpu && gpu.kind === 'webgpu';

// fragments: Gurney velocity (cylinder), fixed typical mass, deterministic even spray, traced through the rest geometry
function makeFrags(C, fill, Mc) {
  const r = ROUNDS[st.round], mf = r ? r[3] : .03;
  const V0 = Math.sqrt(2 * E_G) / Math.sqrt(Mc / fill + .5);
  const nReal = Mc / mf, n = Math.min(4000, Math.max(50, Math.round(nReal))), rep = nReal / n;
  const D = new Float32Array(3 * n), hits = [];
  const gold = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < n; k++) {
    const y = 1 - 2 * (k + .5) / n, rr = Math.sqrt(1 - y * y), th = gold * k;
    const d = [rr * Math.cos(th), y, rr * Math.sin(th)]; D.set(d, 3 * k);
    // all cells along the ray (up to 8), in order
    const list = []; let o = C, tAcc = 0;
    for (let q = 0; q < 8; q++) { const h = firstHit(o, d, 80 - tAcc, false, list.length ? list[list.length - 1][1] : -1); if (!h) break;
      tAcc += h[0]; list.push([tAcc, h[1]]); o = add(C, mul(d, tAcc + 1e-4)); }
    hits.push(list);
  }
  const Af = .0045 * Math.pow(mf, 2 / 3);                                 // presented area (Mott shape factor)
  return { n, D, hits, V0, mf, rep, Af, kd: 1.2 * 1.2 * Af / (2 * mf), v: new Float64Array(n).fill(V0), next: new Int32Array(n), stop: new Float32Array(n).fill(-1),
    tk: new Float64Array(n), dk: new Float64Array(n), df: Math.cbrt(mf / 7850) };
}

/* ------------------------------------------------------------------ sources: primary, holes, images */
function rebuildSources(t) {
  const s = sim, list = [];
  if (s.W > 0) list.push(s.prim);
  if (s.water) list.push(s.water);
  // holes: eroded cells between a space that has a source and another space
  const holes = new Map();
  let gen = [s.prim].filter(q => q.W > 0);
  const win = new Float64Array(GV.length);
  for (let g = 1; g <= 2 && gen.length; g++) {
    const next = [];
    for (let c = 0; c < NC; c++) {
      if (CKN[c] !== 1) continue;
      const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
      for (const q of gen) {
        let far;
        if (CSN[c] === q.space) far = CSP[c]; else if (CSP[c] === q.space) far = CSN[c]; else continue;
        if (q.vis >= 0 && !(CVIS[c] & (1 << q.vis))) continue;
        if (q.kind === 1 && q.hole && q.hole.has(c)) continue;
        const p = pulse(q, xc, nn); if (!p) continue;
        const d = sub(xc, q.pos), R = Math.max(len(d), q.rc || .05), ca = Math.abs(dot(d, nn)) / len(d);
        const Om = CAR[c] * ca / (R * R);
        const fE = q.kind === 1 ? Math.max(0, dot(d, q.ax) / len(d)) * Om / Math.PI : Om / (4 * Math.PI);
        const [fa, fp] = pulseAfter(p, CTE[c]);
        if (fa + fp <= 0) continue;
        // cluster: same far space, within 3 m
        const kbase = q.key + '>' + far; let hk = null;
        for (const [k, hh] of holes) if (k.startsWith(kbase + '#') && len(sub(mul(hh.cw, 1 / hh.w), xc)) < 3) { hk = k; break; }
        if (!hk) { hk = kbase + '#' + holes.size; holes.set(hk, { space: far, from: q, W: 0, Pm: 0, cw: [0, 0, 0], w: 0, ax: [0, 0, 0], tw: 0, cells: new Set(), gen: g }); }
        const H = holes.get(hk), wt = fE * (fa + fp + 1e-9);
        H.dw = (H.dw || 0) + wt * R; H.Wf = q.kind === 1 ? 4 * q.W : q.W; H.Pmf = q.kind === 1 ? 4 * q.Pm : q.Pm; H.Df0 = q.Df || 0;
        H.W += q.Wsrc * fE * fa; H.Pm += q.Pm * fE * fp; H.w += wt; H.cw = add(H.cw, mul(xc, wt));
        H.ax = add(H.ax, mul(CSN[c] === q.space ? nn : mul(nn, -1), wt)); H.tw += wt * Math.max(CTE[c], p.TA || 0); H.cells.add(c);
        if (q.kind === 0 && q.space === scene.OUT && far !== scene.OUT) win[far] += q.W * fE * fp;
      }
    }
    for (const [k, H] of holes) if (H.gen === g && H.w > 0) {
      const src = { pos: mul(H.cw, 1 / H.w), W: H.W, Wsrc: H.W, Pm: H.Pm, t0: H.tw / H.w, space: H.space, kind: 1, ax: nrm(H.ax), gain: 1, rc: .05,
        Wf: H.Wf, Pmf: H.Pmf, Df: H.dw / H.w,
        vis: -1, plane: null, gen: g, key: k, hole: H.cells };
      if (src.W > 1e-4 || src.Pm > 1) next.push(src);
    }
    next.sort((a, b) => b.W - a.W); next.length = Math.min(next.length, 10);
    list.push(...next);
    gen = next;
  }
  // products let in through outside openings: their quasi-static pressure in the compartment
  for (let k = 0; k < GV.length; k++) if (win[k] > s.WIN[k] && GV[k] < Infinity) { GP[k] += qsp(win[k], GV[k]) - qsp(s.WIN[k], GV[k]); s.WIN[k] = win[k]; }
  // images: walls of the compartment a source is in (first order), the sea surface outside
  const imgs = [];
  for (const q of list.slice()) {
    if (!(q.W > 0)) continue;
    if (q.space === scene.OUT) {
      if (q.kind === 0 && q.pos[1] > scene.waterline) imgs.push({ ...q, pos: [q.pos[0], 2 * scene.waterline - q.pos[1], q.pos[2]], kind: 2, Pm: 0, vis: 1, plane: [0, 1, 0, scene.waterline], ax: [0, 0, 0], key: q.key + 'sea' });
      continue;
    }
    const sp = scene.spaces[q.space]; if (!sp.box) continue;
    const b = sp.box;
    for (let f = 0; f < 6; f++) {
      const ax = f % 3, pv = b[f], nrmv = [0, 0, 0]; nrmv[ax] = 1;
      if (Math.abs(q.pos[ax] - pv) < .3) continue;                        // a hole source on this wall
      const pos = q.pos.slice(); pos[ax] = 2 * pv - pos[ax];
      const gain = 1 - wallTorn(q.space, ax, pv);
      if (gain <= .02) continue;
      imgs.push({ ...q, pos, W: q.kind === 1 ? 2 * q.W : q.W, kind: 2, Pm: 0, gain, vis: -1, plane: [...nrmv, pv], key: q.key + 'i' + f });
    }
  }
  imgs.sort((x, y) => y.W * y.gain - x.W * x.gain);
  for (const q of imgs) if (list.length < 32) list.push(q);
  // sources that are new (not in the last list) remember when they came: their first step delivers what they owed
  const seen = s.srcSeen || (s.srcSeen = new Set());
  for (const q of list) { if (!seen.has(q.key)) { q.tAdd = t; seen.add(q.key); if (st.endLog && t > 0) (s.newSrc || (s.newSrc = [])).push([+(t * 1e3).toFixed(1), q.key, q.kind, +(q.t0 * 1e3).toFixed(1), +q.W.toFixed(3), Math.round(q.Pm)]); } else q.tAdd = 0; }
  s.SRC = list; s.holes = [...holes.values()];
}
// the torn share of a compartment wall (cells of that compartment lying on the plane)
function wallTorn(sp, ax, pv) {
  const k = sp + '_' + ax + '_' + pv; let w = WALLS.get(k);
  if (!w) {
    const cells = [];
    for (let c = 0; c < NC; c++) if ((CSP[c] === sp || CSN[c] === sp) && Math.abs(CRC[3 * c + ax] - pv) < .25 * S + .02 && Math.abs(CNR[3 * c + ax]) > .9) cells.push(c);
    const b = scene.spaces[sp].box, o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    w = { cells, area: (b[o1 + 3] - b[o1]) * (b[o2 + 3] - b[o2]) }; WALLS.set(k, w);
  }
  let torn = 0; for (const c of w.cells) if (CKN[c] === 1) torn += CAR[c];
  return Math.min(1, torn / w.area);
}
const WALLS = new Map();

/* ------------------------------------------------------------------ gas */
function gasStep(h) {
  for (let i = SHUT.length - 1; i >= 0; i--) { const [a, b, A, pf] = SHUT[i];
    if (Math.abs(GP[a] - GP[b]) >= pf) { const k = (Math.min(a, b) << 8) | Math.max(a, b); OPEN.set(k, (OPEN.get(k) || 0) + A); SHUT.splice(i, 1); VLOG.push([a, b, A, +(sim.t * 1e3).toFixed(2)]); } }
  for (const [k, A] of OPEN) {
    const a = k >> 8, b = k & 255;
    const dp = GP[a] - GP[b]; if (dp > -1 && dp < 1) continue;
    const hi = dp > 0 ? a : b, lo = dp > 0 ? b : a, ad = Math.abs(dp);
    if (GV[hi] === Infinity) continue;
    const Pabs = GP[hi] + P0, rho = 1.2 * Pabs / P0 * .2;                 // hot products, ~1500 K
    const Q = .6 * A * Math.sqrt(2 * ad / rho);
    let dP = Pabs * Q * h / GV[hi];
    const cap = GV[lo] < Infinity ? ad * GV[lo] / (GV[hi] + GV[lo]) : ad;
    if (dP > cap) dP = cap;
    GP[hi] -= dP; if (GV[lo] < Infinity) GP[lo] += dP * GV[hi] / GV[lo];
  }
}
function openCell(c, t) {
  if (CKN[c] === 1) return; CKN[c] = 1; if (!CER[c]) CER[c] = 2;   // known (1)
  if (CTE[c] < 0) CTE[c] = t;
  const a = Math.min(CSP[c], CSN[c]), b = Math.max(CSP[c], CSN[c]), k = (a << 8) | b;
  if (a !== b) OPEN.set(k, (OPEN.get(k) || 0) + CAR[c]);
  sim.cellsTorn++; if (PAN[CPAN[c]].kind === 0) sim.hullTorn++;
  for (let k2 = 0; k2 < 4; k2++) { const i = CN[4 * c + k2]; if (TBRK[i] < 0) TBRK[i] = t; }
}

/* ------------------------------------------------------------------ fragments at run time */
const IMPN = [];                     // pending impulses [node, jx, jy, jz]
function fragStep(t) {
  const f = sim.frags; if (!f) return false;
  let dmg = false;
  for (let k = 0; k < f.n; k++) {
    if (f.stop[k] >= 0) continue;
    const L = f.hits[k];
    while (f.next[k] < L.length) {
      const [dist, c] = L[f.next[k]], ds = dist - f.dk[k], v0 = f.v[k];
      // flight with drag: v(s) = v0 exp(-kd s)  ->  t(s) = (exp(kd s) - 1) / (kd v0)
      const ta = f.tk[k] + (Math.exp(f.kd * ds) - 1) / (f.kd * v0);
      if (ta > t) break;
      const v = v0 * Math.exp(-f.kd * ds);
      f.tk[k] = ta; f.dk[k] = dist; f.next[k]++; f.v[k] = v;
      if (CKN[c] === 1) continue;                                     // through an opening
      // impact: perforation by plugging (Recht & Ipson 1963), dynamic shear strength taken as 2x static
      const d = [f.D[3 * k], f.D[3 * k + 1], f.D[3 * k + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
      const cob = Math.max(.1, Math.abs(dot(d, nn))), h = CH[c] / cob, m = MATS[CMAT[c]];
      const mp = m.rho * f.df * f.df * h, Wp = 2 * m.sy / Math.sqrt(3) * 4 * f.df * h * h / 2;
      const vbl = Math.sqrt(2 * Wp * (f.mf + mp)) / f.mf;
      const vr = v > vbl ? f.mf / (f.mf + mp) * Math.sqrt(v * v - vbl * vbl) : 0;
      const J = (f.mf * v - (f.mf + mp) * vr) * f.rep;
      for (let z = 0; z < 4; z++) IMPN.push(CN[4 * c + z], d[0] * J / 4, d[1] * J / 4, d[2] * J / 4);
      if (vr > 0) { CFD[c] = Math.min(1, CFD[c] + 2 * f.rep * (1.1 * f.df) ** 2 / CAR[c]); dmg = true; f.v[k] = vr; }
      else { f.stop[k] = dist; break; }
    }
    if (f.next[k] >= L.length && f.stop[k] < 0) f.stop[k] = 1e9;
  }
  return dmg;
}

/* ------------------------------------------------------------------ CPU solver (reference): the same passes as gpu.js */
let F = null, FL = null, XO = null, VO = null, CPB = [];
const SYNC = 25;
function hingePass(t, h) {
  let eel = 0;
  for (let k = 0; k < NH; k++) {
    const c1 = HC[2 * k], c2 = HC[2 * k + 1];
    if (CER[c1] || CER[c2] || HOFF[k]) { HTH[k] = 0; if (EN && HEL[k]) { EN.frac += HEL[k]; HEL[k] = 0; } continue; }
    const i3 = HN[6 * k], i4 = HN[6 * k + 1], a1 = HN[6 * k + 2], b1 = HN[6 * k + 3], a2 = HN[6 * k + 4], b2 = HN[6 * k + 5];
    const x3x = X[3 * i3], x3y = X[3 * i3 + 1], x3z = X[3 * i3 + 2];
    const Ex = X[3 * i4] - x3x, Ey = X[3 * i4 + 1] - x3y, Ez = X[3 * i4 + 2] - x3z, lE = Math.hypot(Ex, Ey, Ez);
    const ex = Ex / lE, ey = Ey / lE, ez = Ez / lE;
    const p1x = (X[3 * a1] + X[3 * b1]) / 2 - x3x, p1y = (X[3 * a1 + 1] + X[3 * b1 + 1]) / 2 - x3y, p1z = (X[3 * a1 + 2] + X[3 * b1 + 2]) / 2 - x3z;
    const p2x = (X[3 * a2] + X[3 * b2]) / 2 - x3x, p2y = (X[3 * a2 + 1] + X[3 * b2 + 1]) / 2 - x3y, p2z = (X[3 * a2 + 2] + X[3 * b2 + 2]) / 2 - x3z;
    // N1 = (x1 - x3) x (x1 - x4), N2 = (x2 - x4) x (x2 - x3), all relative to x3
    const q1x = p1x - Ex, q1y = p1y - Ey, q1z = p1z - Ez, q2x = p2x - Ex, q2y = p2y - Ey, q2z = p2z - Ez;
    const N1x = p1y * q1z - p1z * q1y, N1y = p1z * q1x - p1x * q1z, N1z = p1x * q1y - p1y * q1x;
    const N2x = q2y * p2z - q2z * p2y, N2y = q2z * p2x - q2x * p2z, N2z = q2x * p2y - q2y * p2x;
    const l1 = N1x * N1x + N1y * N1y + N1z * N1z, l2 = N2x * N2x + N2y * N2y + N2z * N2z;
    const r1 = Math.sqrt(l1), r2 = Math.sqrt(l2), hmin = .2 * HDB[k] * lE;
    if (r1 < hmin || r2 < hmin) { HTH[k] = 0; continue; }       // a flap folded onto the hinge line: no lever left
    const n1x = N1x / r1, n1y = N1y / r1, n1z = N1z / r1, n2x = N2x / r2, n2y = N2y / r2, n2z = N2z / r2;
    const sn = (n2y * n1z - n2z * n1y) * ex + (n2z * n1x - n2x * n1z) * ey + (n2x * n1y - n2y * n1x) * ez, cs = n1x * n2x + n1y * n2y + n1z * n2z;
    let d = Math.atan2(sn, cs) - HT0[k]; d -= Math.round(d / 6.283185307) * 6.283185307;
    // gradients u1..u4 (Bridson et al. 2003)
    const g1 = lE / l1, g2 = lE / l2;
    const s13 = (p1x - Ex) * ex + (p1y - Ey) * ey + (p1z - Ez) * ez, s23 = (p2x - Ex) * ex + (p2y - Ey) * ey + (p2z - Ez) * ez;   // (x1 - x4).E^, (x2 - x4).E^
    const s14 = p1x * ex + p1y * ey + p1z * ez, s24 = p2x * ex + p2y * ey + p2z * ez;                                        // (x1 - x3).E^, (x2 - x3).E^
    const u1x = g1 * N1x, u1y = g1 * N1y, u1z = g1 * N1z, u2x = g2 * N2x, u2y = g2 * N2y, u2z = g2 * N2z;
    const u3x = s13 * N1x / l1 + s23 * N2x / l2, u3y = s13 * N1y / l1 + s23 * N2y / l2, u3z = s13 * N1z / l1 + s23 * N2z / l2;
    const u4x = -s14 * N1x / l1 - s24 * N2x / l2, u4y = -s14 * N1y / l1 - s24 * N2y / l2, u4z = -s14 * N1z / l1 - s24 * N2z / l2;
    const v1x = (V[3 * a1] + V[3 * b1]) / 2, v1y = (V[3 * a1 + 1] + V[3 * b1 + 1]) / 2, v1z = (V[3 * a1 + 2] + V[3 * b1 + 2]) / 2;
    const v2x = (V[3 * a2] + V[3 * b2]) / 2, v2y = (V[3 * a2 + 1] + V[3 * b2 + 1]) / 2, v2z = (V[3 * a2 + 2] + V[3 * b2 + 2]) / 2;
    const thd = u1x * v1x + u1y * v1y + u1z * v1z + u2x * v2x + u2y * v2y + u2z * v2z
      + u3x * V[3 * i3] + u3y * V[3 * i3 + 1] + u3z * V[3 * i3 + 2] + u4x * V[3 * i4] + u4y * V[3 * i4 + 1] + u4z * V[3 * i4 + 2];
    const m = MATS[HMAT[k]], edot = Math.min(1e4, Math.abs(thd) * HHP[k] / (2 * HDB[k])), rf = csf(m, edot, Math.abs(HTP[k]) * HHP[k] / (2 * HDB[k]));
    const ut = Math.min(1, .5 * (CUT[c1] + CUT[c2]));
    const kk = HKP[k], cap = HMP[k] * rf * (1 - ut * ut);
    let Mt = kk * (d - HTP[k]);
    if (Mt > cap) { const np = d - cap / kk; if (EN) EN.plH += .5 * (EN.pvh[k] + cap) * (np - HTP[k]); HTP[k] = np; Mt = cap; }
    else if (Mt < -cap) { const np = d + cap / kk; if (EN) EN.plH += .5 * (EN.pvh[k] - cap) * (np - HTP[k]); HTP[k] = np; Mt = -cap; }
    if (EN) EN.pvh[k] = Mt;
    HTH[k] = d;
    eel += .5 * Mt * Mt / kk; HEL[k] = .5 * Mt * Mt / kk;
    const Md = BETA * kk * thd, Mm = Mt + Md;
    if (EN) EN.damp += Md * thd * h;
    // F_i = -M u_i
    F[3 * a1] -= .5 * Mm * u1x; F[3 * a1 + 1] -= .5 * Mm * u1y; F[3 * a1 + 2] -= .5 * Mm * u1z;
    F[3 * b1] -= .5 * Mm * u1x; F[3 * b1 + 1] -= .5 * Mm * u1y; F[3 * b1 + 2] -= .5 * Mm * u1z;
    F[3 * a2] -= .5 * Mm * u2x; F[3 * a2 + 1] -= .5 * Mm * u2y; F[3 * a2 + 2] -= .5 * Mm * u2z;
    F[3 * b2] -= .5 * Mm * u2x; F[3 * b2 + 1] -= .5 * Mm * u2y; F[3 * b2 + 2] -= .5 * Mm * u2z;
    F[3 * i3] -= Mm * u3x; F[3 * i3 + 1] -= Mm * u3y; F[3 * i3 + 2] -= Mm * u3z;
    F[3 * i4] -= Mm * u4x; F[3 * i4 + 1] -= Mm * u4y; F[3 * i4 + 2] -= Mm * u4z;
  }
  return eel;
}

// plane-stress J2 return map (Simo & Taylor 1986): in: trial stress s[0..2] (s12 tensor), eps-bar, material, rate
// factor; out: s updated, returns [dgamma, fbar]
const RM = [0, 0];
function returnMap(s, eb, m, rf) {
  const E = m.E, nu = m.nu, Gm = E / (2 * (1 + nu)), c1 = E / (3 * (1 - nu)), c2 = 2 * Gm;
  const s1 = (s[0] + s[1]) / Math.SQRT2, s2 = (s[1] - s[0]) / Math.SQRT2, s3 = s[2];
  const A1 = s1 * s1 / 3, A2 = s2 * s2 + 2 * s3 * s3;
  const sY0 = (m.sy + m.H * eb) * rf;
  if (1.5 * (A1 + A2) <= sY0 * sY0) { RM[0] = 0; RM[1] = Math.sqrt(A1 + A2); return false; }
  let g = 0;
  for (let it = 0; it < 12; it++) {
    const d1 = 1 + c1 * g, d2 = 1 + c2 * g, fb2 = A1 / (d1 * d1) + A2 / (d2 * d2), fb = Math.sqrt(fb2);
    const e = eb + Math.SQRT2 / Math.sqrt(3) * g * fb, sY = (m.sy + m.H * e) * rf;
    const phi = .5 * fb2 - sY * sY / 3;
    const dfb2 = -2 * A1 * c1 / (d1 * d1 * d1) - 2 * A2 * c2 / (d2 * d2 * d2), dfb = dfb2 / (2 * fb);
    const de = Math.SQRT2 / Math.sqrt(3) * (fb + g * dfb), dphi = .5 * dfb2 - 2 / 3 * sY * m.H * rf * de;
    const ng = g - phi / dphi; g = ng > 0 ? ng : g * .5;
    if (Math.abs(phi) < 1e-10 * sY * sY) break;
  }
  const d1 = 1 + c1 * g, d2 = 1 + c2 * g, t1 = s1 / d1, t2 = s2 / d2, t3 = s3 / d2;
  s[0] = (t1 - t2) / Math.SQRT2; s[1] = (t1 + t2) / Math.SQRT2; s[2] = t3;
  RM[0] = g; RM[1] = Math.sqrt(t1 * t1 / 3 + t2 * t2 + 2 * t3 * t3);
  return true;
}

const SIG = [0, 0, 0];
function cellPass(t, h) {
  let eel = 0;
  CRATP.set(CRAT); CERS.set(CER);                    // neighbours' failure ratios and erosion as the step began
  const OUT = scene.OUT, SRC = sim.SRC, nsrc = SRC.length;
  for (let c = 0; c < NC; c++) {
    if (CER[c]) continue;
    const m = MATS[CMAT[c]], hh = CH[c] / 2, fd = 1 - CFD[c];
    const E = m.E, nu = m.nu, Ep = E / (1 - nu * nu), Gm = E / (2 * (1 + nu));
    const q0 = CN[4 * c], q1 = CN[4 * c + 1], q2 = CN[4 * c + 2], q3 = CN[4 * c + 3], q = [q0, q1, q2, q3];
    const fx = [0, 0, 0, 0], fy = [0, 0, 0, 0], fz = [0, 0, 0, 0];
    let util = 0, dDam = 0, jmin = 9; const eel0 = eel;
    for (let tr = 0; tr < 4; tr++) {
      const T = TRI[tr], i1 = q[T[0]], i2 = q[T[1]], i3 = q[T[2]];
      const L12 = CTR[12 * c + 3 * tr], P3x = CTR[12 * c + 3 * tr + 1], P3y = CTR[12 * c + 3 * tr + 2], A0 = .5 * L12 * P3y;
      const ax = X[3 * i2] - X[3 * i1], ay = X[3 * i2 + 1] - X[3 * i1 + 1], az = X[3 * i2 + 2] - X[3 * i1 + 2];
      const bx = X[3 * i3] - X[3 * i1], by = X[3 * i3 + 1] - X[3 * i1 + 1], bz = X[3 * i3 + 2] - X[3 * i1 + 2];
      const l12 = Math.hypot(ax, ay, az), e1x = ax / l12, e1y = ay / l12, e1z = az / l12;
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const nl = Math.hypot(nx, ny, nz) || 1e-30; nx /= nl; ny /= nl; nz /= nl;
      const e2x = ny * e1z - nz * e1y, e2y = nz * e1x - nx * e1z, e2z = nx * e1y - ny * e1x;
      const p3x = bx * e1x + by * e1y + bz * e1z, p3y = bx * e2x + by * e2y + bz * e2z;
      // F = Ds Dm^-1 (both frames aligned with edge 1-2: upper triangular)
      const F11 = l12 / L12, F12 = (p3x - l12 * P3x / L12) / P3y, F22 = Math.max(p3y / P3y, .05);
      jmin = Math.min(jmin, F11 * F22);
      const th = Math.atan2(-F12, F11 + F22), co = Math.cos(th), si = Math.sin(th);
      const U11 = co * F11, U22 = -si * F12 + co * F22, U12 = .5 * ((co * F12 + si * F22) + (-si * F11));
      const o = 16 * c + 4 * tr;
      const ep11 = CEP[o], ep22 = CEP[o + 1], ep12 = CEP[o + 2], eb = CEP[o + 3];
      const ee11 = U11 - 1 - ep11, ee22 = U22 - 1 - ep22, ee12 = U12 - ep12;
      SIG[0] = Ep * (ee11 + nu * ee22); SIG[1] = Ep * (ee22 + nu * ee11); SIG[2] = 2 * Gm * ee12;
      const st11 = SIG[0], st22 = SIG[1], st12 = SIG[2];
      // rate: velocity gradient in the current frame, rotated back to the rest frame
      const w2x = (V[3 * i2] - V[3 * i1]) * e1x + (V[3 * i2 + 1] - V[3 * i1 + 1]) * e1y + (V[3 * i2 + 2] - V[3 * i1 + 2]) * e1z;
      const w2y = (V[3 * i2] - V[3 * i1]) * e2x + (V[3 * i2 + 1] - V[3 * i1 + 1]) * e2y + (V[3 * i2 + 2] - V[3 * i1 + 2]) * e2z;
      const w3x = (V[3 * i3] - V[3 * i1]) * e1x + (V[3 * i3 + 1] - V[3 * i1 + 1]) * e1y + (V[3 * i3 + 2] - V[3 * i1 + 2]) * e1z;
      const w3y = (V[3 * i3] - V[3 * i1]) * e2x + (V[3 * i3 + 1] - V[3 * i1 + 1]) * e2y + (V[3 * i3 + 2] - V[3 * i1 + 2]) * e2z;
      const Fd11 = w2x / L12, Fd21 = w2y / L12, Fd12 = -w2x * P3x / (L12 * P3y) + w3x / P3y, Fd22 = -w2y * P3x / (L12 * P3y) + w3y / P3y;
      const i11 = 1 / F11, i12 = -F12 / (F11 * F22), i22 = 1 / F22;       // F^-1 (upper triangular)
      const L11 = Fd11 * i11, L12r = Fd11 * i12 + Fd12 * i22, L21 = Fd21 * i11, L22 = Fd21 * i12 + Fd22 * i22;
      const D11 = L11, D22 = L22, D12 = .5 * (L12r + L21);
      const edot = Math.sqrt(2 / 3 * (D11 * D11 + D22 * D22 + (D11 + D22) ** 2 + 2 * D12 * D12));
      // compression the cell cannot fold in: its yield is knocked down by the cell's factor (trial triaxiality weight)
      const vt = Math.sqrt(st11 * st11 + st22 * st22 - st11 * st22 + 3 * st12 * st12), wc = vt > 0 ? Math.min(1, Math.max(0, -(st11 + st22) / vt)) : 0;
      const e0 = KC_EPS(), rmp = e0 > 0 ? Math.min(1, eb / e0) : 1;             // softening after the fold starts (plastic strain e0)
      const rf = csf(m, edot, eb) * (1 - (1 - CKC[c]) * wc * rmp);
      const pl = returnMap(SIG, eb, m, rf);
      const s11 = SIG[0], s22 = SIG[1], s12 = SIG[2];
      const vol = A0 * hh * fd;
      if (pl) {
        const g = RM[0], de11 = g * (2 * s11 - s22) / 3, de22 = g * (2 * s22 - s11) / 3, de12 = g * s12, deb = Math.SQRT2 / Math.sqrt(3) * g * RM[1];
        CEP[o] = ep11 + de11; CEP[o + 1] = ep22 + de22; CEP[o + 2] = ep12 + de12; CEP[o + 3] = eb + deb;
        if (EN) { const q = EN.pvc, j = 12 * c + 3 * tr; EN.plM += .5 * vol * ((s11 + q[j]) * de11 + (s22 + q[j + 1]) * de22 + 2 * (s12 + q[j + 2]) * de12); }
        const vm = Math.sqrt(s11 * s11 + s22 * s22 - s11 * s22 + 3 * s12 * s12);
        if ((s11 + s22) / (3 * vm + 1e-9) > -1 / 3) dDam = Math.max(dDam, deb);
      }
      if (EN) { const j = 12 * c + 3 * tr; EN.pvc[j] = s11; EN.pvc[j + 1] = s22; EN.pvc[j + 2] = s12; }
      const vm = Math.sqrt(s11 * s11 + s22 * s22 - s11 * s22 + 3 * s12 * s12);
      util = Math.max(util, vm / ((m.sy + m.H * CEP[o + 3]) * rf));
      const xe11 = U11 - 1 - CEP[o], xe22 = U22 - 1 - CEP[o + 1], xe12 = U12 - CEP[o + 2];
      eel += .5 * vol * (s11 * xe11 + s22 * xe22 + 2 * s12 * xe12);
      // stiffness-proportional viscous stress (rest frame)
      const Dr11 = co * co * D11 + 2 * co * si * D12 + si * si * D22, Dr22 = si * si * D11 - 2 * co * si * D12 + co * co * D22, Dr12 = (co * co - si * si) * D12 + co * si * (D22 - D11);
      const v11 = BETA * Ep * (Dr11 + nu * Dr22), v22 = BETA * Ep * (Dr22 + nu * Dr11), v12 = BETA * 2 * Gm * Dr12;
      if (EN) EN.damp += vol * h * (v11 * Dr11 + v22 * Dr22 + 2 * v12 * Dr12);
      const S11 = s11 + v11, S22 = s22 + v22, S12 = s12 + v12;
      // P = R S; H = -vol P Dm^-T
      // exact first Piola stress of W(U), F = R U: P = R (S - k J), k = (U12 (S22 - S11) + S12 (U11 - U22)) / tr U (J the
      // quarter turn); P = R S alone left a net moment wherever S and U are not coaxial (plastic flow, shear)
      const kq = (U12 * (S22 - S11) + S12 * (U11 - U22)) / (U11 + U22);
      const P11 = co * S11 - si * (S12 - kq), P12 = co * (S12 + kq) - si * S22, P21 = si * S11 + co * (S12 - kq), P22 = si * (S12 + kq) + co * S22;
      const k1 = 1 / L12, k2 = -P3x / (L12 * P3y), k3 = 1 / P3y;
      const f2x = -vol * (P11 * k1 + P12 * k2), f2y = -vol * (P21 * k1 + P22 * k2), f3x = -vol * P12 * k3, f3y = -vol * P22 * k3;
      const T0 = T[0], T1 = T[1], T2 = T[2];
      fx[T1] += f2x * e1x + f2y * e2x; fy[T1] += f2x * e1y + f2y * e2y; fz[T1] += f2x * e1z + f2y * e2z;
      fx[T2] += f3x * e1x + f3y * e2x; fy[T2] += f3x * e1y + f3y * e2y; fz[T2] += f3x * e1z + f3y * e2z;
      fx[T0] -= (f2x + f3x) * e1x + (f2y + f3y) * e2x; fy[T0] -= (f2x + f3x) * e1y + (f2y + f3y) * e2y; fz[T0] -= (f2x + f3x) * e1z + (f2y + f3y) * e2z;
    }
    CUT[c] = Math.min(1, util); CDM[c] += dDam;
    // loads on the cell: current centre, area vector
    const Ax = .5 * ((X[3 * q2 + 1] - X[3 * q0 + 1]) * (X[3 * q3 + 2] - X[3 * q1 + 2]) - (X[3 * q2 + 2] - X[3 * q0 + 2]) * (X[3 * q3 + 1] - X[3 * q1 + 1]));
    const Ay = .5 * ((X[3 * q2 + 2] - X[3 * q0 + 2]) * (X[3 * q3] - X[3 * q1]) - (X[3 * q2] - X[3 * q0]) * (X[3 * q3 + 2] - X[3 * q1 + 2]));
    const Az = .5 * ((X[3 * q2] - X[3 * q0]) * (X[3 * q3 + 1] - X[3 * q1 + 1]) - (X[3 * q2 + 1] - X[3 * q0 + 1]) * (X[3 * q3] - X[3 * q1]));
    const A = Math.hypot(Ax, Ay, Az) || 1e-12, nx = Ax / A, ny = Ay / A, nz = Az / A;
    let Lx = 0, Ly = 0, Lz = 0;
    const dp = CVIS[c] & 16 ? 0 : GP[CSN[c]] - GP[CSP[c]];               // bit 4: blown loose, out of the wall
    if (dp !== 0) { Lx += dp * Ax; Ly += dp * Ay; Lz += dp * Az; }
    if (CWET[c] >= 0) {                                   // water behind: radiation pressure, cavitation limit
      const so = CSP[c] === OUT ? 1 : -1;
      const vn = ((V[3 * q0] + V[3 * q1] + V[3 * q2] + V[3 * q3]) * nx + (V[3 * q0 + 1] + V[3 * q1 + 1] + V[3 * q2 + 1] + V[3 * q3 + 1]) * ny + (V[3 * q0 + 2] + V[3 * q1 + 2] + V[3 * q2 + 2] + V[3 * q3 + 2]) * nz) / 4 * so;
      let p = RHO_W * C_W * vn; const pmin = -(P0 + RHO_W * G * CWET[c]); if (p < pmin) p = pmin;
      Lx -= p * A * nx * so; Ly -= p * A * ny * so; Lz -= p * A * nz * so;
      if (EN) EN.water += p * A * vn * h;
    }
    if (nsrc) {
      const xc = [(X[3 * q0] + X[3 * q1] + X[3 * q2] + X[3 * q3]) / 4, (X[3 * q0 + 1] + X[3 * q1 + 1] + X[3 * q2 + 1] + X[3 * q3 + 1]) / 4, (X[3 * q0 + 2] + X[3 * q1 + 2] + X[3 * q2 + 2] + X[3 * q3 + 2]) / 4];
      const nn = [nx, ny, nz];
      for (let k = 0; k < nsrc; k++) {
        const s = SRC[k];
        let sg;
        if (CSN[c] === s.space) sg = 1; else if (CSP[c] === s.space) sg = -1; else continue;
        if (s.vis >= 0 && !(CVIS[c] & (1 << s.vis))) continue;
        if (s.plane && Math.abs(CRC[3 * c] * s.plane[0] + CRC[3 * c + 1] * s.plane[1] + CRC[3 * c + 2] * s.plane[2] - s.plane[3]) < .3 * S + .02) continue;
        const p = pulse(s, xc, nn, CWET[c]); if (!p) continue;
        const I = pulseImp(p, t, h, s.tAdd > 0 && s.tAdd >= t && s.tAdd < t + h); if (I <= 0) continue;
        const f = I / h * A * sg; Lx += f * nx; Ly += f * ny; Lz += f * nz;
      }
    }
    for (let k = 0; k < 4; k++) {
      const i = q[k];
      F[3 * i] += fx[k] + Lx / 4; F[3 * i + 1] += fy[k] + Ly / 4; F[3 * i + 2] += fz[k] + Lz / 4;
      FL[3 * i] += Lx / 4; FL[3 * i + 1] += Ly / 4; FL[3 * i + 2] += Lz / 4;
    }
    // fracture: ductile (GL: non-compressive plastic strain + plastic bending strain of the outer fibre)
    let eb = 0; const hs = [CHG[4 * c], CHG[4 * c + 1], CHG[4 * c + 2], CHG[4 * c + 3]];
    for (const k of hs) if (k >= 0) eb = Math.max(eb, Math.abs(HTP[k]) * CH[c] / (2 * HDB[k]));
    const rat = (CDM[c] + eb) / CEF[c]; CRAT[c] = rat;
    let ws = NLH[4 * c + 2], acc = ws * rat;
    for (let k = NLH[4 * c], e = k + NLH[4 * c + 1]; k < e; k++) { const j = NLE[2 * k]; if (!CERS[j]) { acc += NLE[2 * k + 1] * CRATP[j]; ws += NLE[2 * k + 1]; } }
    let fail = ERODE && (acc >= ws || CFD[c] >= 1 || jmin < JMIN());
    if (fail && TWIN && CFD[c] < 1 && jmin >= JMIN()) {                  // petals: crack an edge first (once)
      if (!CCR[c]) { const e = crackEdge(c); if (e >= 0) { CCR[c] = 1; PCR.push(c, e, rat); fail = false; } else if (PKEEP()) { CCR[c] = 1; fail = false; } }
      else if (acc < PETK() * ws) fail = false;
    }
    if (fail) { CER[c] = 1; CTE[c] = t; if (EN) EN.frac += eel - eel0; }
  }
  return eel;
}

// the member's bending angle (chords to the nodes m either side, about the in-plate axis across the member) and the
// shear angle of its segment against the chord around it; rest values are subtracted by the caller
// Axes across the member in its plating (the angles are measured about them): e = -P/|P|, P = D - t (D.t)/(t.t),
// D across the member, t along it. Bending at node a: D between the plating nodes across a on either side, t = B - A;
// shear of segment a-b: D between the far corners of the cells on either side (half each), t = b - a. Both are
// mirror-symmetric about their element, and their dependence on the nodes enters the gradient (no net moment).
const MB = { e: [0, 0, 0], D: [0, 0, 0], t: [0, 0, 0], pl: 0, dd: 0, Dd: 0, bad: true }, MS = { e: [0, 0, 0], D: [0, 0, 0], t: [0, 0, 0], pl: 0, dd: 0, Dd: 0, bad: true };
function setAxis(o, Dx, Dy, Dz, tx, ty, tz) {
  const dd = tx * tx + ty * ty + tz * tz, Dd = Dx * tx + Dy * ty + Dz * tz, px = Dx - tx * Dd / dd, py = Dy - ty * Dd / dd, pz = Dz - tz * Dd / dd;
  const pl = Math.hypot(px, py, pz) || 1e-30;
  o.bad = pl < .3 * Math.hypot(Dx, Dy, Dz);                                        // the plating folded onto the member's line
  o.e[0] = -px / pl; o.e[1] = -py / pl; o.e[2] = -pz / pl; o.pl = pl; o.dd = dd; o.Dd = Dd;
  o.D[0] = Dx; o.D[1] = Dy; o.D[2] = Dz; o.t[0] = tx; o.t[1] = ty; o.t[2] = tz;
}
// angle from u to v about e (both projected off e)
function angAbout(e, ux, uy, uz, vx, vy, vz) { const ex = e[0], ey = e[1], ez = e[2];
  let q = ux * ex + uy * ey + uz * ez; ux -= q * ex; uy -= q * ey; uz -= q * ez; q = vx * ex + vy * ey + vz * ez; vx -= q * ex; vy -= q * ey; vz -= q * ez;
  return Math.atan2((uy * vz - uz * vy) * ex + (uz * vx - ux * vz) * ey + (ux * vy - uy * vx) * ez, ux * vx + uy * vy + uz * vz); }
function memberAngles(k, P) {
  const a = TA[k], b = TB[k], r1 = TQN[4 * k], r2 = TQN[4 * k + 1], l1 = TQN[4 * k + 2], l2 = TQN[4 * k + 3];
  const tx = P[3 * b] - P[3 * a], ty = P[3 * b + 1] - P[3 * a + 1], tz = P[3 * b + 2] - P[3 * a + 2];
  let th = 0, ga = 0; MB.bad = MS.bad = true;
  if (TBA[k] >= 0) { const A = TBA[k], B = TBB[k];
    setAxis(MB, P[3 * r1] - P[3 * l1], P[3 * r1 + 1] - P[3 * l1 + 1], P[3 * r1 + 2] - P[3 * l1 + 2], P[3 * B] - P[3 * A], P[3 * B + 1] - P[3 * A + 1], P[3 * B + 2] - P[3 * A + 2]);
    th = angAbout(MB.e, P[3 * a] - P[3 * A], P[3 * a + 1] - P[3 * A + 1], P[3 * a + 2] - P[3 * A + 2], P[3 * B] - P[3 * a], P[3 * B + 1] - P[3 * a + 1], P[3 * B + 2] - P[3 * a + 2]); }
  if (TSC[k] >= 0) { const C0 = TSC[k], C1 = TBB[k];
    setAxis(MS, .5 * (P[3 * r1] + P[3 * r2] - P[3 * l1] - P[3 * l2]), .5 * (P[3 * r1 + 1] + P[3 * r2 + 1] - P[3 * l1 + 1] - P[3 * l2 + 1]), .5 * (P[3 * r1 + 2] + P[3 * r2 + 2] - P[3 * l1 + 2] - P[3 * l2 + 2]), tx, ty, tz);
    ga = angAbout(MS.e, P[3 * C1] - P[3 * C0], P[3 * C1 + 1] - P[3 * C0 + 1], P[3 * C1 + 2] - P[3 * C0 + 2], tx, ty, tz); }
  return [th, ga];
}
let TFLS = null, TBPS = null;                         // member failures and bending sets at the start of the step
function trussPass(t, h) {
  let eel = 0;
  if (!TFLS || TFLS.length !== NT) { TFLS = new Uint8Array(NT); TBPS = new Float64Array(NT); } TFLS.set(TFL); TBPS.set(TBP);
  const addF = (i, s, gx, gy, gz) => { F[3 * i] += s * gx; F[3 * i + 1] += s * gy; F[3 * i + 2] += s * gz; };
  for (let k = 0; k < NT; k++) {
    if (TFL[k]) continue;
    const a = TA[k], b = TB[k], m = MATS[TMAT[k]];
    const dx = X[3 * b] - X[3 * a], dy = X[3 * b + 1] - X[3 * a + 1], dz = X[3 * b + 2] - X[3 * a + 2], L = Math.hypot(dx, dy, dz);
    const ux = dx / L, uy = dy / L, uz = dz / L, L0 = TL0[k];
    const vr = (V[3 * b] - V[3 * a]) * ux + (V[3 * b + 1] - V[3 * a + 1]) * uy + (V[3 * b + 2] - V[3 * a + 2]) * uz;
    const rf = csf(m, Math.abs(vr) / L0, TEB[k]);
    const kk = m.E * TAR[k] / L0, fy = (m.sy + m.H * TEB[k]) * rf * TAR[k];
    let f = kk * (L - TLP[k]);
    if (f > fy) { const np = L - fy / kk; TEB[k] += Math.abs(np - TLP[k]) / L0; if (EN) EN.plT += .5 * (EN.pvf[k] + fy) * (np - TLP[k]); TLP[k] = np; f = fy; }
    else if (f < -fy * TKC[k]) { const fc = fy * TKC[k], np = L + fc / kk; TEB[k] += Math.abs(np - TLP[k]) / L0; if (EN) EN.plT += .5 * (EN.pvf[k] - fc) * (np - TLP[k]); TLP[k] = np; f = -fc; }
    if (EN) EN.pvf[k] = f;
    eel += .5 * f * f / kk;
    const fd = BETA * kk * vr; if (EN) EN.damp += fd * vr * h;
    const fa = f; f += fd;
    F[3 * a] += f * ux; F[3 * a + 1] += f * uy; F[3 * a + 2] += f * uz; F[3 * b] -= f * ux; F[3 * b + 1] -= f * uy; F[3 * b + 2] -= f * uz;
    let ebend = 0;
    if (TCL[k] >= 0 && !CER[TCL[k]] && (TCL2[k] < 0 || !CER[TCL2[k]]) && (TBA[k] >= 0 || TSC[k] >= 0)) {       // bending needs its plating (the reference plane) in place
      const g = memberAngles(k, X);
      // d(angle from u to v about e)/d(head of v) = (e x v)/|v|^2, d/d(tail of v) = -that; for u the signs flip
      const gr = (e, x, y, z) => { const ex = e[0], ey = e[1], ez = e[2], q = x * ex + y * ey + z * ez; x -= q * ex; y -= q * ey; z -= q * ez; const l2 = x * x + y * y + z * z || 1e-30;
        return [(ey * z - ez * y) / l2, (ez * x - ex * z) / l2, (ex * y - ey * x) / l2]; };
      const vdot = (gv, i, j) => gv[0] * (V[3 * i] - V[3 * j]) + gv[1] * (V[3 * i + 1] - V[3 * j + 1]) + gv[2] * (V[3 * i + 2] - V[3 * j + 2]);
      // Q dAngle/de, then through e = -P/|P| to D (weights wD on the across nodes: +r, -l) and t (+head, -tail)
      const axisForces = (ax, Q, ux, uy, uz, vx, vy, vz, rr, ll, wD, th, tt) => {
        const e = ax.e, ex = e[0], ey = e[1], ez = e[2], cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const s = ex * cx + ey * cy + ez * cz, ue = ux * ex + uy * ey + uz * ez, ve = vx * ex + vy * ey + vz * ez, c = ux * vx + uy * vy + uz * vz - ue * ve, dn = s * s + c * c || 1e-30;
        const Gx = Q * (c * cx + s * (ve * ux + ue * vx)) / dn, Gy = Q * (c * cy + s * (ve * uy + ue * vy)) / dn, Gz = Q * (c * cz + s * (ve * uz + ue * vz)) / dn;
        const q = Gx * ex + Gy * ey + Gz * ez, gx = -(Gx - q * ex) / ax.pl, gy = -(Gy - q * ey) / ax.pl, gz = -(Gz - q * ez) / ax.pl;
        const t = ax.t, D = ax.D, dd = ax.dd, Dd = ax.Dd, dg = t[0] * gx + t[1] * gy + t[2] * gz;
        const gDx = gx - t[0] * dg / dd, gDy = gy - t[1] * dg / dd, gDz = gz - t[2] * dg / dd;
        const c1 = -Dd / dd, c2 = -dg / dd, c3 = 2 * Dd * dg / (dd * dd);
        const gtx = c1 * gx + c2 * D[0] + c3 * t[0], gty = c1 * gy + c2 * D[1] + c3 * t[1], gtz = c1 * gz + c2 * D[2] + c3 * t[2];
        addF(th, -1, gtx, gty, gtz); addF(tt, 1, gtx, gty, gtz);
        for (const i of rr) addF(i, -wD, gDx, gDy, gDz); for (const i of ll) addF(i, wD, gDx, gDy, gDz); };
      if (TBA[k] >= 0 && !MB.bad && (TPRV[k] < 0 || !TFLS[TPRV[k]])) {   // the bending at node a needs both segments there
        const A = TBA[k], B = TBB[k], e = MB.e;
        const ux = X[3 * a] - X[3 * A], uy = X[3 * a + 1] - X[3 * A + 1], uz = X[3 * a + 2] - X[3 * A + 2], vx = X[3 * B] - X[3 * a], vy = X[3 * B + 1] - X[3 * a + 1], vz = X[3 * B + 2] - X[3 * a + 2];
        const g1 = gr(e, ux, uy, uz), g2 = gr(e, vx, vy, vz);
        // theta = angle(u = a - A, v = B - a): d/dB = g2, d/dA = g1, d/da = -(g1 + g2)
        const thd = vdot(g2, B, a) - vdot(g1, a, A);
        let d = g[0] - TB0[k]; d -= Math.round(d / 6.283185307) * 6.283185307;
        const rfb = csf(m, Math.abs(thd) * TFIB[k], Math.abs(TBP[k]) * TFIB[k]), cap = TQB[k] * rfb, kb = TKB[k];
        let Q = kb * (d - TBP[k]);
        if (Q > cap) { const np = d - cap / kb; if (EN) EN.plT += .5 * (EN.pvb[k] + cap) * (np - TBP[k]); TBP[k] = np; Q = cap; }
        else if (Q < -cap) { const np = d + cap / kb; if (EN) EN.plT += .5 * (EN.pvb[k] - cap) * (np - TBP[k]); TBP[k] = np; Q = -cap; }
        if (EN) EN.pvb[k] = Q;
        eel += .5 * Q * Q / kb; ebend = .5 * Q * Q / kb;
        const Qd = BETA * kb * thd; if (EN) EN.damp += Qd * thd * h; Q += Qd;
        addF(B, -Q, g2[0], g2[1], g2[2]); addF(A, -Q, g1[0], g1[1], g1[2]); addF(a, Q, g1[0] + g2[0], g1[1] + g2[1], g1[2] + g2[2]);
        axisForces(MB, Q, ux, uy, uz, vx, vy, vz, [TQN[4 * k]], [TQN[4 * k + 2]], 1, B, A);
      }
      if (TSC[k] >= 0 && !MS.bad) {
        const C0 = TSC[k], C1 = TBB[k], e = MS.e;
        const cx = X[3 * C1] - X[3 * C0], cy = X[3 * C1 + 1] - X[3 * C0 + 1], cz = X[3 * C1 + 2] - X[3 * C0 + 2];
        const gc = gr(e, cx, cy, cz), gs = gr(e, dx, dy, dz);
        // gamma = angle(u = chord C1 - C0, v = segment b - a): d/db = gs, d/da = -gs, d/dC1 = -gc, d/dC0 = gc
        const gd = vdot(gs, b, a) - vdot(gc, C1, C0);
        let d = g[1] - TS0[k]; d -= Math.round(d / 6.283185307) * 6.283185307;
        const cap = TQS[k] * rf, ks = TKS[k];
        let Q = ks * (d - TSP[k]);
        if (Q > cap) { const np = d - cap / ks; if (EN) EN.plT += .5 * (EN.pvs[k] + cap) * (np - TSP[k]); TSP[k] = np; Q = cap; }
        else if (Q < -cap) { const np = d + cap / ks; if (EN) EN.plT += .5 * (EN.pvs[k] - cap) * (np - TSP[k]); TSP[k] = np; Q = -cap; }
        if (EN) EN.pvs[k] = Q;
        eel += .5 * Q * Q / ks; ebend += .5 * Q * Q / ks;
        const Qd = BETA * ks * gd; if (EN) EN.damp += Qd * gd * h; Q += Qd;
        addF(b, -Q, gs[0], gs[1], gs[2]); addF(a, Q, gs[0], gs[1], gs[2]); addF(C1, Q, gc[0], gc[1], gc[2]); addF(C0, -Q, gc[0], gc[1], gc[2]);
        axisForces(MS, Q, cx, cy, cz, dx, dy, dz, [TQN[4 * k], TQN[4 * k + 1]], [TQN[4 * k + 2], TQN[4 * k + 3]], .5, b, a);
      }
    }
    // a segment fails on its stretch plus the larger plastic bending strain at its two nodes (either end alike, both
    // taken at the start of the step, so neither end is ahead)
    // or is stripped: an end node with no intact cell left (a bare stiffener has no plating to bend about: it would hang
    // as a frictionless pin) lets the member go
    const strip = !st.noStrip && CELLN && (CELLN[a] === 0 || CELLN[b] === 0);
    if (strip || Math.max(0, Math.log(TLP[k] / L0)) + Math.max(Math.abs(TBPS[k]), TNXT[k] >= 0 ? Math.abs(TBPS[TNXT[k]]) : 0) * TFIB[k] >= TEF[k]) { TFL[k] = 1; if (EN) EN.frac += .5 * fa * fa / kk + ebend; }
  }
  return eel;
}

function nodePass(t, h) {
  const s = sim, al = s.relax ? 250 : s.alpha;
  let eel = 0, ek = 0;
  // contact push-back from the previous step
  // (on the corners by the bilinear weights of the point hit, along the cell's rest normal: the push-back acts where the
  // node stopped, so contact adds no moment beyond the gap)
  for (let k = 0; k < CPB.length; k += 4) { const c = CPB[k], J = CPB[k + 1], a = CPB[k + 2], b = CPB[k + 3], nc = cellN(c);
    const w = [(1 - a) * (1 - b), a * (1 - b), a * b, (1 - a) * b];
    for (let q = 0; q < 4; q++) { const i = CN[4 * c + q], f = J * w[q] / h; F[3 * i] += f * nc[0]; F[3 * i + 1] += f * nc[1]; F[3 * i + 2] += f * nc[2]; } }
  CPB.length = 0;
  for (let k = 0; k < IMPN.length; k += 4) { const i = IMPN[k]; F[3 * i] += IMPN[k + 1] / h; F[3 * i + 1] += IMPN[k + 2] / h; F[3 * i + 2] += IMPN[k + 3] / h;
    FL[3 * i] += IMPN[k + 1] / h; FL[3 * i + 1] += IMPN[k + 2] / h; FL[3 * i + 2] += IMPN[k + 3] / h; }
  IMPN.length = 0;
  XO.set(X); VO.set(V);
  for (let i = 0; i < N; i++) {
    if (PARENT && PARENT[i] >= 0 && !SPL[PARENT[i]]) continue;       // an idle twin
    let fx = F[3 * i], fy = F[3 * i + 1], fz = F[3 * i + 2];
    const vx0 = V[3 * i], vy0 = V[3 * i + 1], vz0 = V[3 * i + 2];
    if (AK[i] > 0) {
      const dx = X[3 * i] - ANC[3 * i], dy = X[3 * i + 1] - ANC[3 * i + 1], dz = X[3 * i + 2] - ANC[3 * i + 2], d = Math.hypot(dx, dy, dz);
      if (d > 1e-12) { let f = AK[i] * d;
        if (f > AF[i]) { const back = AF[i] / AK[i] / d; const nax = X[3 * i] - dx * back, nay = X[3 * i + 1] - dy * back, naz = X[3 * i + 2] - dz * back;
          if (EN) EN.plA += .5 * (f + AF[i]) * Math.hypot(nax - ANC[3 * i], nay - ANC[3 * i + 1], naz - ANC[3 * i + 2]);
          ANC[3 * i] = nax; ANC[3 * i + 1] = nay; ANC[3 * i + 2] = naz; f = AF[i]; }
        fx -= dx / d * f; fy -= dy / d * f; fz -= dz / d * f; eel += .5 * f * f / AK[i]; }
    }
    const w = WINV[i];
    let vx = vx0 + fx * h * w, vy = vy0 + fy * h * w - (FREE[i] ? G * h : 0), vz = vz0 + fz * h * w;
    // the boundary dashpot, implicit (at the new velocity): stable at any step (explicit, it capped dt at 2 m / c)
    if (AK[i] > 0 && AC[i] > 0) { const r = 1 / (1 + h * w * AC[i]); vx *= r; vy *= r; vz *= r;
      if (EN) EN.rad += AC[i] * (vx * (vx0 + vx) + vy * (vy0 + vy) + vz * (vz0 + vz)) * .5 * h; }
    if (!FREE[i]) { const dm = 1 - al * h; if (EN) EN[sim.relax ? 'relax' : 'damp'] += .5 * M[i] * (vx * vx + vy * vy + vz * vz) * (1 - dm * dm); vx *= dm; vy *= dm; vz *= dm; }
    if (EN) EN.ext += (FL[3 * i] * (vx0 + vx) + FL[3 * i + 1] * (vy0 + vy) + FL[3 * i + 2] * (vz0 + vz)) * .5 * h;
    V[3 * i] = vx; V[3 * i + 1] = vy; V[3 * i + 2] = vz;
    X[3 * i] += vx * h; X[3 * i + 1] += vy * h; X[3 * i + 2] += vz * h;
    contact(i, h);
    ek += .5 * M[i] * (V[3 * i] * vx0 + V[3 * i + 1] * vy0 + V[3 * i + 2] * vz0);   // leapfrog kinetic energy at the step (v- . v+)
  }
  return [eel, ek];
}
// a cell's rest normal (corner 0 -> 1 x corner 0 -> 3)
function cellN(c) { const q0 = CN[4 * c], q1 = CN[4 * c + 1], q3 = CN[4 * c + 3];
  return nrm(cross([R0[3 * q1] - R0[3 * q0], R0[3 * q1 + 1] - R0[3 * q0 + 1], R0[3 * q1 + 2] - R0[3 * q0 + 2]], [R0[3 * q3] - R0[3 * q0], R0[3 * q3 + 1] - R0[3 * q0 + 1], R0[3 * q3 + 2] - R0[3 * q0 + 2]])); }
// a node that reaches another panel's intact cell stops there (inelastic) and pushes the cell back next step
function contact(i, h) {
  for (let k = 0; k < 4; k++) {
    const pq = NCC[4 * i + k]; if (pq < 0) break;
    const P = PAN[pq];
    const rx = R0[3 * i] - P.o[0], ry = R0[3 * i + 1] - P.o[1], rz = R0[3 * i + 2] - P.o[2], rest = rx * P.n[0] + ry * P.n[1] + rz * P.n[2];
    const sd = rest > 0 ? 1 : -1;
    const dx = X[3 * i] - P.o[0], dy = X[3 * i + 1] - P.o[1], dz = X[3 * i + 2] - P.o[2];
    const cur = dx * P.n[0] + dy * P.n[1] + dz * P.n[2]; if (cur * sd > 1.5) continue;
    const u = dx * P.U[0] + dy * P.U[1] + dz * P.U[2], v = dx * P.V[0] + dy * P.V[1] + dz * P.V[2];
    const ci = Math.floor(u / P.Lu * P.nu), cj = Math.floor(v / P.Lv * P.nv);
    if (ci < 0 || cj < 0 || ci >= P.nu || cj >= P.nv) continue;
    const c = CMAP[P.off + cj * P.nu + ci]; if (c < 0 || CER[c]) continue;
    let pl = 0, vc = 0;
    for (let q = 0; q < 4; q++) { const j = CN[4 * c + q];
      pl += (XO[3 * j] - P.o[0]) * P.n[0] + (XO[3 * j + 1] - P.o[1]) * P.n[1] + (XO[3 * j + 2] - P.o[2]) * P.n[2];
      vc += VO[3 * j] * P.n[0] + VO[3 * j + 1] * P.n[1] + VO[3 * j + 2] * P.n[2]; }
    pl /= 4; vc /= 4;
    const gap = (cur - pl) * sd; if (gap > .015) continue;
    const push = (.015 - gap) * sd; X[3 * i] += P.n[0] * push; X[3 * i + 1] += P.n[1] * push; X[3 * i + 2] += P.n[2] * push;
    const vn = V[3 * i] * P.n[0] + V[3 * i + 1] * P.n[1] + V[3 * i + 2] * P.n[2], rel = (vn - vc) * sd;
    if (rel < 0) {
      const dv = -rel * sd; V[3 * i] += P.n[0] * dv; V[3 * i + 1] += P.n[1] * dv; V[3 * i + 2] += P.n[2] * dv;
      const nc = cellN(c), q0 = CN[4 * c], q1 = CN[4 * c + 1], q3 = CN[4 * c + 3];
      const r1 = [R0[3 * q1] - R0[3 * q0], R0[3 * q1 + 1] - R0[3 * q0 + 1], R0[3 * q1 + 2] - R0[3 * q0 + 2]], r3 = [R0[3 * q3] - R0[3 * q0], R0[3 * q3 + 1] - R0[3 * q0 + 1], R0[3 * q3 + 2] - R0[3 * q0 + 2]];
      const xr = [X[3 * i] - R0[3 * q0], X[3 * i + 1] - R0[3 * q0 + 1], X[3 * i + 2] - R0[3 * q0 + 2]], cl = x => Math.min(1, Math.max(0, x));
      CPB.push(c, -dv * M[i] * dot(P.n, nc), cl(dot(xr, r1) / dot(r1, r1)), cl(dot(xr, r3) / dot(r3, r3)));
      if (EN) EN.contact += .5 * M[i] * rel * rel;
    }
    break;
  }
}

function stepCPU() {
  const s = sim, t = s.t, h = dt;
  F.fill(0); FL.fill(0);
  ERODE = erodeNow(s.n + 1);
  if (TWIN) applyCracks();
  const e1 = hingePass(t, h), e2 = cellPass(t, h), e3 = trussPass(t, h);
  markFree();                                          // free pieces: nodes no intact element holds
  const [e4, ek] = nodePass(t, h);
  if (EN) { EN.el = e1 + e2 + e3 + e4; EN.kin = ek; }
  s.t += h; s.n++;
  if (s.n % SYNC === 0) syncStep();
}
let CNT = null, CELLN = null;
function markFree() {
  if (!CNT || CNT.length !== N) CNT = new Int32Array(N);
  if (!CELLN || CELLN.length !== N) CELLN = new Int32Array(N);
  const cnt = CNT; cnt.fill(0);
  for (let c = 0; c < NC; c++) if (!CER[c]) for (let k = 0; k < 4; k++) cnt[CN[4 * c + k]]++;
  CELLN.set(cnt);
  for (let k = 0; k < NT; k++) if (!TFL[k]) { cnt[TA[k]]++; cnt[TB[k]]++; }
  for (let i = 0; i < N; i++) if (!cnt[i] && !FREE[i] && AK[i] === 0 && !(PARENT && PARENT[i] >= 0 && !SPL[PARENT[i]])) FREE[i] = 1;
}
// nodes still joined (through intact cells and members) to the fixed structure; flying debris is not. The end-of-run
// test and the "quiet" clock look at these only (debris that keeps eroding or tumbling does not hold the run open)
let ATT = null;
// Read-backs are used a fixed LAT steps after the step they describe (torn cells at every sync, the structure's
// motion every 200 steps), on the CPU, on WebGL2 (blocking or not) and on WebGPU alike: a run's course and its end
// don't depend on when a GPU copy happens to complete (deterministic). CKN: torn cells the loads/vents/fragments know.
let CKN = null, LAT = 50; const PENDC = new Map(), PENDN = new Map();
// nodes still joined to the ship (anchors) through intact cells and members; U (displacements, from a GPU run's read
// back, where member failures are only read at the end): a member stretched past 1.5 x its length counts as broken
function attachedNodes(U) {
  const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const fd = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, un = (a, b) => { a = fd(a); b = fd(b); if (a !== b) par[a] = b; };
  for (let c = 0; c < NC; c++) if (CKN[c] !== 1) { const a = CN[4 * c]; for (let k = 1; k < 4; k++) un(a, CN[4 * c + k]); }
  for (let k = 0; k < NT; k++) { if (TFL[k]) continue; const a = TA[k], b = TB[k];
    if (U) { const d = Math.hypot(R0[3 * a] + U[3 * a] - R0[3 * b] - U[3 * b], R0[3 * a + 1] + U[3 * a + 1] - R0[3 * b + 1] - U[3 * b + 1], R0[3 * a + 2] + U[3 * a + 2] - R0[3 * b + 2] - U[3 * b + 2]); if (d > 1.5 * TL0[k]) continue; }
    un(a, b); }
  const root = new Uint8Array(N); for (let i = 0; i < N; i++) if (AK[i] > 0 || (WINV[i] === 0 && !(PARENT && PARENT[i] >= 0))) root[fd(i)] = 1;
  const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = root[fd(i)];
  return a;
}
const attachedCell = c => !ATT || ATT[CN[4 * c]] || ATT[CN[4 * c + 1]] || ATT[CN[4 * c + 2]] || ATT[CN[4 * c + 3]];
// every sync: note this step's torn cells, act on those noted LAT steps ago
function syncStep() {
  const s = sim, n = s.n, m = n - LAT, gpuRun = s.solver === 'gpu';
  if (gpuRun) gpu.requestCells(n);
  else { const l = []; for (let c = 0; c < NC; c++) if (CER[c] && !CKN[c]) { CKN[c] = 2; l.push(c); } PENDC.set(n, l); }
  let torn = false;
  if (m > 0 && m % SYNC === 0) {
    const tq = performance.now();
    if (gpuRun) { const cl = gpu.cellsOf(m);
      if (cl) for (let c = 0; c < NC; c++) if (cl[4 * c] > .5 && CKN[c] !== 1) { CTE[c] = cl[4 * c + 1]; openCell(c, CTE[c]); if (attachedCell(c)) torn = true; } }
    else { for (const c of PENDC.get(m) || []) { openCell(c, CTE[c]); if (attachedCell(c)) torn = true; } PENDC.delete(m); }
    PROF.read += performance.now() - tq;
  }
  const t2 = performance.now(); commonSync(s.t, torn); PROF.sync += performance.now() - t2;
}
// the structure's motion for the end-of-run test: noted every 200 steps, used LAT steps later
function noteNodes() {
  const s = sim; if (s.solver === 'gpu') gpu.requestNodes(s.n); else { const U = new Float64Array(3 * N); for (let i = 0; i < 3 * N; i++) U[i] = X[i] - R0[i]; PENDN.set(s.n, { V: V.slice(), FREE: FREE.slice(), U }); }
}
// a GPU run that reads back asynchronously (WebGPU) waits here before a step that needs a copy not yet mapped
function gpuWait() {
  if (!sim || sim.solver !== 'gpu' || !isWG()) return null;
  const n = sim.n + 1, m = n - LAT, need = [];
  if (n % SYNC === 0 && m > 0 && m % SYNC === 0 && !gpu.has('c', m)) need.push(gpu.waitFor('c', m));
  if (m > 0 && m % 200 === 0 && !gpu.has('n', m)) need.push(gpu.waitFor('n', m));
  return need.length ? Promise.all(need) : null;
}
// shared by both solvers: gas sources, venting, hole sources, fragments, end of run
function commonSync(t, torn) {
  const s = sim;
  for (const q of s.srcs) { const Fn = q.kind === 'det' ? Math.min(1, t / q.tau) : 1 - Math.exp(-t / q.tau); GP[q.c] += q.Pq * (Fn - q.F); q.F = Fn; }
  if (torn && s.W > 0) { const t3 = performance.now(); rebuildSources(t); s.lastSrc = t; PROF.src += performance.now() - t3; }
  gasStep(SYNC * dt);
  const dmg = fragStep(t);
  if (s.solver === 'gpu') { gpu.setSources(s.SRC); gpu.setGas(GP); if (IMPN.length) { gpu.setImpulses(IMPN); IMPN.length = 0; } if (dmg) gpu.setDamage(CFD); }
}

/* ------------------------------------------------------------------ GPU solver glue */
function gpuModel() {
  return { N, NC, NH, NT, R0, M, WINV, AK, AF, AC, CN, CH, CMAT, CEF, CKC, KCE: KC_EPS(), JMN: JMIN(), NLH, NLE, CSP, CSN, CWET, CAR, CTR, CHG, CDB, CRC, CVIS: () => CVIS,
    HN, HC, HKP, HMP, HKS, HMS, HT0, HDB, HTR, HHP, HMAT, HLN, HTL0, TBA, TBB, TSC, TCL, TCL2, TQN, TPRV, TNXT, TKC, TKB, TQB, TB0, TKS, TQS, TS0, TMM, TA, TB, TL0, TAR, TMAT, TEF, TFIB, THG, NCC, PAN, CMAP, MATS: st.noRate ? MATS.map(m => ({ ...m, D: 1e30, Du: 1e30 })) : MATS, TA1, S,
    OUT: () => scene.OUT, csf, nspace: () => GV.length, BETA: () => BETA, U_MAX, RHO_W, C_W, P0, G, K_SHEAR,
    PAR: TWIN ? PARENT : null, TWIN, C: sim ? sim.C : null, PETK: PETK(), PRAD: PRAD(), PKEEP: PKEEP() };
}
let gpuT = 0;
function stepGPU() { gpuAdvance(); if (sim.n % SYNC === 0) syncStep(); }
function gpuAdvance() {
  if (!sim.gpuInit) initGPU();
  const s = sim, t = s.t, h = dt;
  gpu.step(t, h, s.relax ? 250 : s.alpha, erodeNow(s.n + 1));
  s.t += h; s.n++;
}
const PROF = { read: 0, sync: 0, src: 0, frag: 0 };

function step() {
  const s = sim;
  if (s.solver === 'gpu') stepGPU(); else stepCPU();
  if (s.n % 200 === 0) noteNodes();
  const m = s.n - LAT; if (m > 0 && m % 200 === 0) checkEnd(m);
}
const VEND = { V: null, FREE: null };
// pieces of plating that hang on by corner nodes only (no intact edge to the rest): a node shared by cells that meet
// only at a corner is a frictionless pin of zero width, and the piece swings on it (at ~100 m/s for as long as the run
// lasts) and tears whatever it hits. Such pieces are let go (their cells erode, as a piece torn off would), so a tear
// that isolates a piece does not keep feeding itself. Pieces joined by an edge (a hinge) to the anchored structure stay.
let PINUF = null;
function detachPinned() {
  if (sim.pinAt === sim.cellsTorn) return;                 // nothing torn since the last look
  sim.pinAt = sim.cellsTorn;
  if (!PINUF || PINUF.length !== NC) PINUF = new Int32Array(NC);
  const par = PINUF; for (let c = 0; c < NC; c++) par[c] = c;
  const fd = c => { while (par[c] !== c) { par[c] = par[par[c]]; c = par[c]; } return c; };
  const ok = c => CKN[c] !== 1 && !CER[c] && CFD[c] < 1;
  for (let h = 0; h < NH; h++) { const a = HC[2 * h], b = HC[2 * h + 1]; if (!HOFF[h] && ok(a) && ok(b)) { const ra = fd(a), rb = fd(b); if (ra !== rb) par[ra] = rb; } }
  // pieces reachable from the anchored ones through shared nodes only (pins); loose debris is left alone
  const root = new Uint8Array(NC), comps = new Map();
  for (let c = 0; c < NC; c++) { if (!ok(c)) continue; const r = fd(c);
    for (let k = 0; k < 4; k++) { const i = CN[4 * c + k]; if (AK[i] > 0 || (WINV[i] === 0 && !(PARENT && PARENT[i] >= 0))) root[r] = 1;
      let l = comps.get(i); if (!l) comps.set(i, l = []); if (!l.includes(r)) l.push(r); } }
  const adj = new Map(); for (const l of comps.values()) if (l.length > 1) for (const x of l) for (const y of l) if (x !== y) { let a = adj.get(x); if (!a) adj.set(x, a = new Set()); a.add(y); }
  const pinned = new Uint8Array(NC), seen = new Uint8Array(NC), q = [];
  for (const [x] of adj) if (root[x]) { seen[x] = 1; q.push(x); }
  while (q.length) { const x = q.pop(); for (const y of adj.get(x) || []) if (!seen[y]) { seen[y] = 1; if (!root[y]) pinned[y] = 1; q.push(y); } }
  let n = 0; for (let c = 0; c < NC; c++) if (ok(c) && pinned[fd(c)]) { CFD[c] = 1; n++; }
  if (n) { sim.detached = (sim.detached || 0) + n; if (sim.solver === 'gpu') gpu.setDamage(CFD); }
}
// plating blown loose (no longer joined to the structure) leaves its compartment's wall: its area opens between the
// two spaces (a vent, as a torn cell) and the compartment's gas no longer pushes it (it kept accelerating the piece,
// a piston with no gap behind it, and the gas kept its pressure). From the attached-node read (every 200 steps)
function looseCells() {
  if (!ATT || sim.looseAt === ATT) return; sim.looseAt = ATT;
  const l = [];
  for (let c = 0; c < NC; c++) { if (CVIS[c] & 16 || CKN[c] === 1) continue;
    if (ATT[CN[4 * c]] || ATT[CN[4 * c + 1]] || ATT[CN[4 * c + 2]] || ATT[CN[4 * c + 3]]) continue;
    CVIS[c] |= 16; l.push(c);
    const a = Math.min(CSP[c], CSN[c]), b = Math.max(CSP[c], CSN[c]); if (a !== b) OPEN.set((a << 8) | b, (OPEN.get((a << 8) | b) || 0) + CAR[c]); }
  if (l.length) { sim.loose = (sim.loose || 0) + l.length; if (sim.solver === 'gpu') gpu.gasOff(l, CVIS); }
}
function checkEnd(m) {
  const s = sim; let Vd, Fd, Ud;
  if (s.solver === 'gpu') { if (!VEND.V || VEND.V.length !== 3 * N) { VEND.V = new Float64Array(3 * N); VEND.FREE = new Uint8Array(N); VEND.U = new Float64Array(3 * N); } if (!gpu.nodesOf(m, VEND.V, VEND.FREE, VEND.U)) return; Vd = VEND.V; Fd = VEND.FREE; Ud = VEND.U; }
  else { const d = PENDN.get(m); PENDN.delete(m); if (!d) return; Vd = d.V; Fd = d.FREE; Ud = d.U; }
  if (!ATT || m % 1000 === 0) ATT = attachedNodes(Ud);
  if (st.detachPins !== false) detachPinned();
  if (st.looseVent !== false) looseCells();
  let v2 = 0, ke = 0; for (let i = 0; i < N; i++) { if (Fd[i] || !ATT[i]) continue; const q = Vd[3 * i] ** 2 + Vd[3 * i + 1] ** 2 + Vd[3 * i + 2] ** 2; ke += .5 * M[i] * q; if (q > v2) v2 = q; }
  let gas = 0; for (let k = 0; k < GV.length; k++) if (GV[k] < Infinity) gas = Math.max(gas, Math.abs(GP[k]));
  let quiet = s.srcs.every(q => q.F > .98) && s.t - s.lastSrc > .005; const vm = Math.sqrt(v2);
  s.kepeak = Math.max(s.kepeak || 0, ke);
  // the gas no longer rising (over the last 10 ms, compartment by compartment) and tearing down to a trickle (under 3 %
  // of the torn cells in that time: pieces hanging by a corner node spin on it as frictionless pins and nibble at the
  // plating for as long as the run lasts): the structure has taken what it will take (st.endGas: the old rule, gas
  // below 20 kPa)
  if (!s.gref || s.t - s.gref.t >= .01) { const g = GP.slice(), tc = s.cellsTorn;
    s.steady = !!s.gref && tc - s.gref.tc <= .03 * tc && g.every((v, k) => !(GV[k] < Infinity) || v <= s.gref.g[k] * 1.02 + 2e3); s.gref = { t: s.t, g, tc }; }
  const gasDone = gas < 2e4 || (!st.endGas && s.steady);
  if (!st.endGas && s.steady && s.srcs.every(q => q.F > .98)) quiet = true;   // late holes' sources carry next to nothing
  if (st.endLog) (s.endLog || (s.endLog = [])).push([+(s.t * 1e3).toFixed(1), +(ke / s.kepeak).toFixed(4), Math.round(vm), Math.round(gas / 1e3), s.cellsTorn, s.steady ? 1 : 0, quiet ? 1 : 0]);
  // loads over and the structure's kinetic energy down to 5 % of its peak: settle the remaining elastic ringing with
  // strong damping (dynamic relaxation) to read the permanent set
  if (!s.relax && (st.relaxAt ? s.t >= st.relaxAt : quiet && (st.relaxGas || gasDone) && s.t > s.tMin && (ke < .05 * s.kepeak || s.t > s.tMin + .1))) { s.relax = true; s.tRelax = s.t; }
  if (s.relax && (v2 < .25 || s.t - s.tRelax > .025)) s.T1 = s.t;
  s.vmax = vm;
}

// WebGPU end of run: wait for the queue, then everything settle() reads (it reads the backend's copies)
// yield to the browser (a message, not a timer: not throttled in a hidden tab)
const tick0 = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => q.shift()(); return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); }); })();
async function finishWG() { const o = { CEP, CDM, TFL, HTP, HTH, HTPS, TBP }; await gpu.readStateAsync(o); gpu.readNodes(true, X, V, FREE); if (TWIN && o.CRK) applyGpuSplits(o.CRK); }
// a GPU step whose sync reads see this very step (the WebGL2 path's sync mode), for WebGPU: waits at every sync
async function stepExact() { const w = gpuWait(); if (w) { gpu.submit(); await w; } step(); }
function settle() {
  const s = sim;
  if (s.solver === 'gpu') { gpu.readNodes(true, X, V, FREE); const cl = gpu.readCells(); for (let c = 0; c < NC; c++) if (cl[4 * c] > .5 && !CER[c]) { CER[c] = 1; CTE[c] = cl[4 * c + 1]; openCell(c, CTE[c]); }
    gpu.readState({ CEP, CDM, TFL, HTP, HTPS, TBP }); }
  // pieces no longer connected (through intact cells and members) to the rest of the ship are debris
  const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const fd = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, un = (a, b) => { a = fd(a); b = fd(b); if (a !== b) par[a] = b; };
  for (let c = 0; c < NC; c++) if (!CER[c]) { const a = CN[4 * c]; for (let k = 1; k < 4; k++) un(a, CN[4 * c + k]); }
  for (let k = 0; k < NT; k++) if (!TFL[k]) un(TA[k], TB[k]);
  const root = new Uint8Array(N); for (let i = 0; i < N; i++) if (AK[i] > 0) root[fd(i)] = 1;
  let debris = 0; for (let i = 0; i < N; i++) if (!root[fd(i)] && !FREE[i] && !(PARENT && PARENT[i] >= 0 && !SPL[PARENT[i]])) { FREE[i] = 1; debris++; }
  s.debris = debris;
  for (let i = 0; i < N; i++) if (!FREE[i]) V[3 * i] = V[3 * i + 1] = V[3 * i + 2] = 0;
  let md = 0;
  for (let i = 0; i < N; i++) if (NKIND[i] === 0 && !FREE[i]) md = Math.max(md, Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]));
  s.maxDef = md;
}
function ballistic(h) {
  for (let i = 0; i < N; i++) {
    if (!FREE[i]) continue;
    const d = Math.exp(-.6 * h);
    V[3 * i] *= d; V[3 * i + 2] *= d; V[3 * i + 1] = V[3 * i + 1] * d - G * h;
    X[3 * i] += V[3 * i] * h; X[3 * i + 1] += V[3 * i + 1] * h; X[3 * i + 2] += V[3 * i + 2] * h;
    if (X[3 * i + 1] < scene.waterline - .2 && scene.spaceAt([X[3 * i], X[3 * i + 1] + .3, X[3 * i + 2]]) === scene.OUT) { V[3 * i] = V[3 * i + 1] = V[3 * i + 2] = 0; X[3 * i + 1] = -60; }
  }
}
function startRun() { resetTwins(); ATT = null; CELLN = null; PENDC.clear(); PENDN.clear(); VEND.V = null; F = new Float64Array(3 * N); FL = new Float64Array(3 * N); XO = new Float64Array(3 * N); VO = new Float64Array(3 * N); CPB.length = 0; IMPN.length = 0; }

/* ------------------------------------------------------------------ the whole ship (Burke): picking and context */
let SHIP = null;
function shipGeometry() {
  if (SHIP) return;
  const tris = [], nrms = [], dots = [];
  seed = 5;
  for (const pn of BURKE.default.PANELS) {
    const quads = pn.strip ? pn.strip[0].slice(0, -1).map((_, k) => [pn.strip[0][k], pn.strip[0][k + 1], pn.strip[1][k + 1], pn.strip[1][k]]) : [pn.poly];
    for (const Q of quads) for (let k = 1; k + 1 < Q.length; k++) {
      const a = Q[0], b = Q[k], c = Q[k + 1]; tris.push(...a, ...b, ...c); nrms.push(...pn.n);
      const A = .5 * len(cross(sub(b, a), sub(c, a))), n = Math.round(A / .35) + (rnd() < (A / .35) % 1 ? 1 : 0);
      for (let q = 0; q < n; q++) { let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } dots.push(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v); }
    }
  }
  SHIP = { tris: Float32Array.from(tris), nrms: Float32Array.from(nrms), dots: Float32Array.from(dots) };
}
function shipHit(o, d) {
  const T = SHIP.tris; let best = Infinity, bn = null;
  for (let k = 0; k < T.length; k += 9) {
    const e1 = [T[k + 3] - T[k], T[k + 4] - T[k + 1], T[k + 5] - T[k + 2]], e2 = [T[k + 6] - T[k], T[k + 7] - T[k + 1], T[k + 8] - T[k + 2]];
    const p = cross(d, e2), det = dot(e1, p); if (Math.abs(det) < 1e-12) continue;
    const s0 = [o[0] - T[k], o[1] - T[k + 1], o[2] - T[k + 2]], u = dot(s0, p) / det; if (u < 0 || u > 1) continue;
    const q = cross(s0, e1), v = dot(d, q) / det; if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) / det; if (t > 0 && t < best) { best = t; bn = [SHIP.nrms[k / 3], SHIP.nrms[k / 3 + 1], SHIP.nrms[k / 3 + 2]]; }
  }
  return bn ? [best, bn] : null;
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
let NF32 = null, IDX = null, DOTS_PER = [8, 8, 8, 8], CU = null, CV2 = null;
let cap = 0, PB, CB;
const cam = { yaw: .42, pitch: .12, dist: 26, tgt: [0, 2.5, -.5] };
let VP = new Float32Array(16), eye = [0, 0, 0], fovK = 1;
function mats() {
  const w = cv.width, h = cv.height, f = 1 / Math.tan(.42);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  eye = [cam.tgt[0] + cam.dist * cp * Math.sin(cam.yaw), cam.tgt[1] + cam.dist * sp, cam.tgt[2] + cam.dist * cp * Math.cos(cam.yaw)];
  let zx = eye[0] - cam.tgt[0], zy = eye[1] - cam.tgt[1], zz = eye[2] - cam.tgt[2]; const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xy = 0, xz = -zx; const xl = Math.hypot(xx, xz); xx /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const a = h / w, n = .1, fa = 3000;
  const P = [f * a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
  const Vw = [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + r] * Vw[c * 4 + k]; VP[c * 4 + r] = s; }
  fovK = f * h * .5;
  return { right: [xx, xy, xz], up: [yx, yy, yz], fwd: [-zx, -zy, -zz], f, a };
}
const NFB = 3000, NSH = 1500, SEA_W = 110, SEA_D = 60;
function ensure(n) {
  if (n <= cap) return;
  cap = n; PB = new Float32Array(cap * 3); CB = new Float32Array(cap * 4);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferData(gl.ARRAY_BUFFER, PB.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, CB.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
}
let nodeCol = null, NN = null;
const LIT = (() => { const v = [-.45, .75, .5], l = Math.hypot(...v); return v.map(x => x / l); })();
const SOOT = { C: null, R: 0 };
function nodeColours(tv) {
  if (!nodeCol || nodeCol.length !== N * 3) { nodeCol = new Float32Array(N * 3); NN = new Float32Array(3 * N); }
  NN.fill(0);
  for (let c = 0; c < NC; c++) {
    const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3];
    const ux = X[3 * cc] - X[3 * a], uy = X[3 * cc + 1] - X[3 * a + 1], uz = X[3 * cc + 2] - X[3 * a + 2];
    const vx = X[3 * d] - X[3 * b], vy = X[3 * d + 1] - X[3 * b + 1], vz = X[3 * d + 2] - X[3 * b + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const i of [a, b, cc, d]) { NN[3 * i] += nx; NN[3 * i + 1] += ny; NN[3 * i + 2] += nz; }
  }
  const base = [.86, .62, .5, .5, .55, .55], strain = st.view === 1;
  const fireA = sim ? fireball(tv).glow : 0, C = sim ? sim.C : null, fr = sim ? 1.25 * fireR(Math.max(sim.W, 1)) : 1;
  const epsN = strain ? nodeStrain() : null;
  for (let i = 0; i < N; i++) {
    const nl = Math.hypot(NN[3 * i], NN[3 * i + 1], NN[3 * i + 2]) || 1;
    const lam = Math.abs(NN[3 * i] * LIT[0] + NN[3 * i + 1] * LIT[1] + NN[3 * i + 2] * LIT[2]) / nl;
    let b = base[NKIND[i]] * (NFRM[i] === 2 ? 1.12 : NFRM[i] === 1 ? 1.05 : 1) * (.38 + 1.1 * lam * lam);
    let r = b, g = b, bl = b * .96;
    let so = 0;
    if (C) { const R = Math.hypot(R0[3 * i] - C[0], R0[3 * i + 1] - C[1], R0[3 * i + 2] - C[2]); so = Math.max(0, 1 - R / fr); }
    if (sim && sim.post > 0) { const k = so * Math.min(1, sim.post * 2); r *= 1 - .7 * k; g *= 1 - .72 * k; bl *= 1 - .74 * k; }
    if (strain) { const e = Math.min(1, epsN[i]); r = r * (1 - e) + .78 * e; g = g * (1 - e) + .96 * e; bl = bl * (1 - e) + .2 * e; }
    if (TBRK[i] >= 0) { const age = sim.phase === 1 ? 0 : sim.post, heat = Math.exp(-age / 7); r += 1.0 * heat; g += .52 * heat; bl += .16 * heat; }
    if (fireA > 0) { const k = fireA * so; r += k; g += .6 * k; bl += .25 * k; }
    nodeCol[3 * i] = r; nodeCol[3 * i + 1] = g; nodeCol[3 * i + 2] = bl;
  }
}
// strain view: the share of the failure strain used (damage + bending), per node (max of its cells)
function nodeStrain() {
  const e = new Float32Array(N);
  for (let c = 0; c < NC; c++) { const v = Math.min(1, CDM[c] / CEF[c]); for (let k = 0; k < 4; k++) { const i = CN[4 * c + k]; if (v > e[i]) e[i] = v; } }
  return e;
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
  if (sim && sim.external && sim.phase === 1) { requestAnimationFrame(draw); return; }   // a scripted run owns the solver
  const spd = SPEEDS[st.spd];
  if (sim && sim.phase === 1 && !sim.external && !sim.settling) {
    const t0 = performance.now(), ts = sim.t, goal = spd ? ts + rdt * spd : Infinity;
    // WebGPU: no more than two command buffers queued (the GPU sets the pace, the page stays responsive)
    while (performance.now() - t0 < 12 && sim.t < sim.T1 && sim.t < goal && !(isWG() && gpu.busy())) for (let k = 0; k < 10 && sim.t < sim.T1 && sim.t < goal; k++) { if (gpuWait()) { gpu.submit(); break; } step(); }
    if (isWG()) gpu.submit();
    lastRate = rdt > 0 ? (sim.t - ts) / rdt : 0;
    if (sim.solver === 'gpu' && sim.t < sim.T1 && gpu) gpu.readNodes(false, X, V, FREE);
    if (sim.t >= sim.T1) { if (isWG()) { sim.settling = true; finishWG().then(() => { sim.phase = 2; settle(); }); } else { sim.phase = 2; settle(); } }
  } else if (sim && sim.phase === 2) {
    const r = spd ? Math.max(spd, .05) : 1, h = rdt * r; sim.post += h; ballistic(h); lastRate = r;
  }
  const tv = sim ? (sim.phase === 1 ? sim.t : sim.T1 + sim.post) : 0;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  mats();
  if (!CU || CU.nc !== NC) { let nd = 0; for (let c = 0; c < NC; c++) nd += DOTS_PER[Math.min(3, PAN[CPAN[c]].kind)]; CU = new Float32Array(nd); CV2 = new Float32Array(nd); CU.nc = NC; CU.nd = nd;
    seed = 7; for (let k = 0; k < nd; k++) { CU[k] = rnd(); CV2[k] = rnd(); } }
  ensure(CU.nd + NFB + NSH + 4000 * 5 + SEA_W * SEA_D + 400 + (SHIP && scene.name === 'burke' ? SHIP.dots.length / 3 : 0));
  nodeColours(tv);
  let o = 0;
  const put = (x, y, z, r, g, b, s) => { PB[3 * o] = x; PB[3 * o + 1] = y; PB[3 * o + 2] = z; CB[4 * o] = r; CB[4 * o + 1] = g; CB[4 * o + 2] = b; CB[4 * o + 3] = s; o++; };
  let k = 0;
  for (let c = 0; c < NC; c++) {
    const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3], kd = Math.min(3, PAN[CPAN[c]].kind), n = DOTS_PER[kd], torn = CER[c];
    const sz = kd === 0 ? .045 : .04;
    for (let q = 0; q < n; q++, k++) {
      const u = CU[k], v = CV2[k];
      const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = u * v, w3 = (1 - u) * v;
      let x, y, z;
      if (!torn) {
        x = X[3 * a] * w0 + X[3 * b] * w1 + X[3 * cc] * w2 + X[3 * d] * w3;
        y = X[3 * a + 1] * w0 + X[3 * b + 1] * w1 + X[3 * cc + 1] * w2 + X[3 * d + 1] * w3;
        z = X[3 * a + 2] * w0 + X[3 * b + 2] * w1 + X[3 * cc + 2] * w2 + X[3 * d + 2] * w3;
      } else {                                    // eroded: each quarter rides its own corner (jagged edges)
        const m = u < .5 ? (v < .5 ? a : d) : (v < .5 ? b : cc);
        if (FREE[m] && X[3 * m + 1] < -40) continue;
        const rx = R0[3 * a] * w0 + R0[3 * b] * w1 + R0[3 * cc] * w2 + R0[3 * d] * w3;
        const ry = R0[3 * a + 1] * w0 + R0[3 * b + 1] * w1 + R0[3 * cc + 1] * w2 + R0[3 * d + 1] * w3;
        const rz = R0[3 * a + 2] * w0 + R0[3 * b + 2] * w1 + R0[3 * cc + 2] * w2 + R0[3 * d + 2] * w3;
        const sh2 = .45;
        x = X[3 * m] + (rx - R0[3 * m]) * sh2; y = X[3 * m + 1] + (ry - R0[3 * m + 1]) * sh2; z = X[3 * m + 2] + (rz - R0[3 * m + 2]) * sh2;
      }
      if (y < -40) continue;
      const cr = nodeCol[3 * a] * w0 + nodeCol[3 * b] * w1 + nodeCol[3 * cc] * w2 + nodeCol[3 * d] * w3;
      const cg = nodeCol[3 * a + 1] * w0 + nodeCol[3 * b + 1] * w1 + nodeCol[3 * cc + 1] * w2 + nodeCol[3 * d + 1] * w3;
      const cb = nodeCol[3 * a + 2] * w0 + nodeCol[3 * b + 2] * w1 + nodeCol[3 * cc + 2] * w2 + nodeCol[3 * d + 2] * w3;
      put(x, y, z, cr, cg, cb, sz);
    }
  }
  if (scene.name === 'burke' && SHIP) {
    const D = SHIP.dots, b = scene.box;
    for (let k = 0; k < D.length; k += 3) { const x = D[k], y = D[k + 1], z = D[k + 2]; if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) continue; put(x, y, z, .3, .3, .29, .035); }
  }
  const T = now / 1000, wl = scene.waterline;
  for (let j = 0; j < SEA_D; j++) for (let i = 0; i < SEA_W; i++) {
    const x = -55 + i + ((j * 7) % 3) * .33, z = .6 + j * .8 + ((i * 5) % 4) * .2;
    const y = wl + .08 * Math.sin(x * .35 + T * 1.1) + .06 * Math.sin(z * .5 - T * .8);
    const f = Math.max(0, 1 - z / 48);
    put(x, y, z, .34 * f, .4 * f, .44 * f, .06);
  }
  if (sim) {
    const C = sim.C, fb = fireball(tv), W = sim.W;
    if (W > 0 && tv < .06 * Math.cbrt(W)) {
      let Rs = 0; for (let r = .1; r < 80; r *= 1.04) { if (Math.cbrt(W) * arrival1(r / Math.cbrt(W)) > tv) break; Rs = r; }
      const fade = 1 - tv / (.06 * Math.cbrt(W));
      seed = 3;
      for (let q = 0; q < NSH; q++) {
        const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u), d = [r * Math.cos(th), u, r * Math.sin(th)];
        if (firstHit(C, d, Rs, true)) continue;
        put(C[0] + Rs * d[0], C[1] + Rs * d[1], C[2] + Rs * d[2], .78 * fade, .96 * fade, .2 * fade, .05);
      }
    }
    seed = 11;
    const rise = Math.max(0, tv - fb.tau * 4) * 2.2 * Math.cbrt(fb.W) * .4;
    for (let q = 0; q < NFB; q++) {
      const u = rnd() * 2 - 1, th = rnd() * 6.2832, r = Math.sqrt(1 - u * u), rr = Math.cbrt(rnd());
      const age = tv / fb.life, grow = 1 + Math.max(0, tv - fb.life) * .25, R = fb.R * grow * rr;
      let x = r * Math.cos(th) * R + rise * .35, y = u * R + rise, z = r * Math.sin(th) * R;
      const d = Math.hypot(x, y, z) || 1e-6, hit = firstHit(C, [x / d, y / d, z / d], d, true);
      if (hit) { if (rnd() < .6) continue; const kk = (hit[0] - .1) / d; x *= kk; y *= kk; z *= kk; }
      let cr, cg, cb;
      if (age < 1) { const hot = Math.max(0, 1 - age * 1.4) * (1 - rr * .5); cr = .95 + .05 * hot; cg = .45 + .5 * hot; cb = .12 + .7 * hot * hot;
        const dim = .35 + .65 * (1 - age); cr *= dim; cg *= dim; cb *= dim; }
      else { const s = Math.max(0, .34 - (age - 1) * .02) * (.6 + .4 * rnd()); cr = s; cg = s * .97; cb = s * .92; }
      if (cr + cg + cb < .03) continue;
      put(C[0] + x, C[1] + y, C[2] + z, cr, cg, cb, .08);
    }
    const f = sim.frags;
    if (f && tv < .05) {
      for (let q = 0; q < f.n; q += 1) {
        const d = [f.D[3 * q], f.D[3 * q + 1], f.D[3 * q + 2]];
        let dm = f.V0 * tv; const L = f.hits[q];
        const stop = f.stop[q] >= 0 && f.stop[q] < 1e8 ? f.stop[q] : 1e9; dm = Math.min(dm, stop, 60);
        for (let s2 = 0; s2 < 4; s2++) { const dd = dm - s2 * f.V0 * .00025; if (dd <= 0) break;
          put(C[0] + d[0] * dd, C[1] + d[1] * dd, C[2] + d[2] * dd, 1, .8 - s2 * .1, .45 - s2 * .08, .05); }
        void L;
      }
    }
  }
  if (!sim || sim.phase === 2) {
    const a = st.aim, n = st.aimN, t1 = Math.abs(n[1]) > .9 ? [1, 0, 0] : nrm(cross(n, [0, 1, 0])), t2 = cross(n, t1);
    for (let q = 0; q < 72; q++) { const t = q / 72 * 6.2832, r = .9;
      put(a[0] + (t1[0] * Math.cos(t) + t2[0] * Math.sin(t)) * r + n[0] * .05, a[1] + (t1[1] * Math.cos(t) + t2[1] * Math.sin(t)) * r + n[1] * .05,
        a[2] + (t1[2] * Math.cos(t) + t2[2] * Math.sin(t)) * r + n[2] * .05, .78, .96, .2, .06); }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cv.width, cv.height);
  gl.clearColor(.043, .047, .039, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  if (!NF32 || NF32.length !== 3 * N) { NF32 = new Float32Array(3 * N); IDX = new Uint32Array(NC * 6);
    gl.bindVertexArray(vao2); gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferData(gl.ARRAY_BUFFER, NF32.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IDX.byteLength, gl.DYNAMIC_DRAW); }
  for (let i = 0; i < 3 * N; i++) NF32[i] = X[i];
  let ni = 0;
  for (let c = 0; c < NC; c++) { if (CER[c]) continue; const a = CN[4 * c], b = CN[4 * c + 1], cc = CN[4 * c + 2], d = CN[4 * c + 3];
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
  const now = performance.now(); if (now - rdT < 150) return; rdT = now;
  const fmtP = p => p > 1e6 ? (p / 1e6).toFixed(1) + ' MPa' : (p / 1e3).toFixed(0) + ' kPa';
  const L1 = [];
  const fill = st.kg, Mc = st.casing || 0, W = fill * (Mc > 0 ? .2 + .8 / (1 + Mc / fill) : 1);
  const rc = Math.cbrt(3 * fill / (4 * Math.PI * RHO_TNT)), d = st.fuze === 'contact' ? rc : st.fuze === 'inside' ? 1.6 : st.standoff;
  const W3 = Math.cbrt(W), Z = Math.max(d / W3, .053), Ps = kinneyPs(Z), Pr = reflect(Ps), ir = kinneyIs1(Z) * W3 * Math.pow(Pr / Ps, .75);
  const ip = W * U_MEAN / (4 * Math.PI * Math.max(d, rc) ** 2);
  L1.push(`<div>Blast <b>${W.toFixed(W < 10 ? 2 : 0)}</b> kg TNT${Mc > 0 ? ` (fill ${fill}, casing ${Mc} kg)` : ''}</div>`);
  L1.push(`<div>Z <b>${Z.toFixed(2)}</b> m/kg<sup>⅓</sup> · ${d.toFixed(2)} m</div>`);
  L1.push(`<div>Reflected <b>${fmtP(Pr)}</b> · impulse air <b>${(ir / 1000).toFixed(1)}</b> · products <b>${(ip / 1000).toFixed(1)}</b> kPa·s</div>`);
  if (sim) {
    L1.push('<hr style="border:0;border-top:1px solid rgba(233,233,226,.13)">');
    L1.push(`<div class="lime">t <b>${tv < 1 ? (tv * 1000).toFixed(1) + ' ms' : tv.toFixed(2) + ' s'}</b> · rate <b>×${lastRate < .01 ? lastRate.toFixed(4) : lastRate.toFixed(2)}</b>${sim.relax ? ' · settling' : ''}</div>`);
    if (sim.src) L1.push(`<div>${sim.src.label}</div>`);
    for (let c = 0; c < GV.length; c++) if (GV[c] < Infinity && (GP[c] > 500 || c === sim.cc)) {
      let vent = 0; for (const [k, A] of OPEN) if ((k >> 8) === c || (k & 255) === c) vent += A;
      L1.push(`<div>${scene.spaces[c].name} <b>${fmtP(Math.max(0, GP[c]))}</b> · open <b>${vent.toFixed(1)}</b> m²</div>`); }
    const area = tornByPanel();
    L1.push(`<div class="${area.hull > 0 ? 'hot' : ''}">Hull torn <b>${area.hull.toFixed(2)}</b> m² · decks <b>${area.deck.toFixed(2)}</b> · bulkheads <b>${area.bhd.toFixed(2)}</b></div>`);
    let free = 0; for (let i = 0; i < N; i++) free += FREE[i];
    L1.push(`<div>Sources <b>${sim.SRC.length}</b> · holes <b>${sim.holes.length}</b> · loose nodes <b>${free}</b></div>`);
    if (sim.phase === 2) L1.push(`<div>Max displacement, hull <b>${(sim.maxDef * 1000).toFixed(0)}</b> mm</div>`);
    if (EN && sim.solver === 'cpu') { const e = energy(); L1.push(`<div>Energy in <b>${(e.input / 1e3).toFixed(0)}</b> kJ · plastic ${(100 * e.pl / e.input).toFixed(0)}% · kinetic ${(100 * e.kin / e.input).toFixed(0)}% · error ${(100 * e.err / e.input).toFixed(1)}%</div>`); }
  }
  L1.push(`<div style="margin-top:8px">${N} nodes · ${NC} cells · ${NH} hinges · ${NT} members · dt ${(dt * 1e6).toFixed(1)} µs</div>`);
  if (sim) L1.push(`<div>${sim.solver === 'gpu' ? 'GPU' : 'CPU reference'}${sim.cpu ? ' · ' + sim.cpu.toFixed(0) + ' ms' : ''}</div>`);
  $('rd').innerHTML = L1.join('');
}
function tornByPanel() {
  const r = { hull: 0, deck: 0, bhd: 0 };
  for (let c = 0; c < NC; c++) if (CER[c]) { const k = PAN[CPAN[c]].kind; if (k === 0) r.hull += CAR[c]; else if (k === 3) r.bhd += CAR[c]; else r.deck += CAR[c]; }
  return r;
}
function energy() {
  const e = EN, input = e.ext + e.frag * 0, pl = e.plM + e.plH + e.plT + e.plA;
  const out = e.kin + e.el + pl + e.damp + e.relax + e.rad + e.contact + e.frac;   // relax: the end-of-run relaxation (its own line)
  return { input: Math.max(1e-9, input), pl, kin: e.kin, el: e.el, damp: e.damp, relax: e.relax, contact: e.contact, err: input - out, parts: { ...e } };
}

/* ------------------------------------------------------------------ input */
const sel = $('round');
ROUNDS.forEach(([n, kg], i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${n} · ${kg} kg`; sel.appendChild(o); });
const sync = () => { $('grid').value = st.grid; $('solver').value = st.solver; $('slow').innerHTML = `<b>S</b>${SPEED_NAMES[st.spd]}`; $('src').value = st.src; sel.value = st.round;
  $('kg').value = st.kg; $('casing').value = st.casing; $('fuze').value = st.fuze; $('standoff').value = st.standoff; $('mat').value = st.mat; $('h').value = st.h; $('scene').value = st.scene; $('frags').checked = st.frags; };
sel.onchange = () => { st.round = +sel.value; st.kg = ROUNDS[st.round][1]; st.casing = ROUNDS[st.round][2]; sync(); };
$('kg').onchange = () => { st.kg = Math.max(.01, +$('kg').value || .01); };
$('casing').onchange = () => { st.casing = Math.max(0, +$('casing').value || 0); };
$('fuze').onchange = () => { st.fuze = $('fuze').value; };
$('src').onchange = () => { st.src = $('src').value; };
$('standoff').oninput = () => { st.standoff = +$('standoff').value; };
$('mat').onchange = () => { st.mat = $('mat').value; build(); };
$('h').oninput = () => { st.h = +$('h').value; build(); };
$('frags').onchange = () => { st.frags = $('frags').checked; };
$('scene').onchange = async () => {
  st.scene = $('scene').value;
  if (st.scene === 'burke') { await loadBurke(); shipGeometry(); st.aim = [0, 2.5, BURKE.halfBreadth(0, 2.5)]; st.aimN = [0, 0, 1]; }
  else { st.aim = [0, 2.2, 0]; st.aimN = [0, 0, 1]; }
  build(); Object.assign(cam, { tgt: [...scene.cam.tgt], dist: scene.cam.dist });
};
$('go').onclick = () => { asyncRun = true; detonate(); startRun(); };
$('reset').onclick = () => build();
$('view').onclick = () => { st.view ^= 1; };
$('slow').onclick = () => { st.spd = (st.spd + 1) % SPEEDS.length; $('slow').innerHTML = `<b>S</b>${SPEED_NAMES[st.spd]}`; };
$('solver').onchange = () => { st.solver = $('solver').value; };
$('grid').onchange = () => { st.grid = +$('grid').value; build(); };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); asyncRun = true; detonate(); startRun(); }
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
  if (drag.b === 2) { const b = mats(), k = cam.dist * .0016; for (let q = 0; q < 3; q++) cam.tgt[q] += (-b.right[q] * dx + b.up[q] * dy) * k; }
  else { cam.yaw -= dx * .005; cam.pitch = Math.max(-.5, Math.min(1.45, cam.pitch + dy * .005)); }
});
cv.addEventListener('pointerup', e => { if (drag && drag.moved < 4 && drag.b === 0) pick(e.clientX, e.clientY); drag = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(3, Math.min(400, cam.dist * Math.exp(e.deltaY * .001))); }, { passive: false });
function pick(mx, my) {
  const b = mats(), dpr = cv.width / innerWidth;
  const nx = (mx * dpr / cv.width) * 2 - 1, ny = 1 - (my * dpr / cv.height) * 2;
  const d = nrm([0, 1, 2].map(q => b.fwd[q] + b.right[q] * nx / (b.f * b.a) + b.up[q] * ny / b.f));
  if (scene.name === 'burke' && SHIP) {
    const r = shipHit(eye, d); if (!r) return;
    const p = add(eye, mul(d, r[0])); let n = r[1]; if (dot(n, d) > 0) n = mul(n, -1);
    if (!scene.aimOK(p, n)) return;
    st.aim = p; st.aimN = n;
    build();
    return;
  }
  const h = firstHit(eye, d, 1000, false); if (!h) return;
  const c = h[1], p = add(eye, mul(d, h[0])); let n = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
  if (dot(n, d) > 0) n = mul(n, -1);                                   // the side the camera sees
  if (scene.aimOK && !scene.aimOK(p, n)) return;
  st.aim = p; st.aimN = n;
}

sync(); build();
requestAnimationFrame(draw);

/* ------------------------------------------------------------------ bench API */
// put the settings back as they were before a scripted run (keys the run added are removed)
function restoreSt(keep, extra = {}) { for (const k of Object.keys(st)) if (!(k in keep)) delete st[k]; Object.assign(st, keep, extra); }
function runCase(cfg) {
  const keep = { ...st };
  Object.assign(st, cfg);
  if (cfg.scene && !cfg.aim) { st.aim = cfg.scene === 'plate' ? [0, 0, 0] : cfg.scene === 'burke' && BURKE ? [0, 2.5, BURKE.halfBreadth(0, 2.5)] : [0, 2.2, 0]; st.aimN = [0, 0, 1]; }
  build(); asyncRun = false; detonate(); startRun(); sim.sync = !!cfg.sync; sim.headless = true;
  const t0 = performance.now(); let steps = 0;
  while (sim.t < sim.T1) { step(); steps++; }
  const cpu = performance.now() - t0; sim.cpu = cpu; sim.phase = 2; settle();
  const areas = [0, 0, 0, 0]; for (let c = 0; c < NC; c++) if (CER[c]) areas[Math.min(3, PAN[CPAN[c]].kind)] += CAR[c];
  let free = 0; for (let i = 0; i < N; i++) free += FREE[i];
  const shape = new Float32Array(N);
  for (let i = 0; i < N; i++) shape[i] = FREE[i] ? NaN : Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]);
  const res = { areas: areas.map(a => +a.toFixed(2)), byPanel: PAN.map(P => { let a = 0, dmax = 0; for (let k = P.off; k < P.off + P.nu * P.nv; k++) { const c = CMAP[k]; if (c < 0) continue; if (CER[c]) a += CAR[c];
      for (let q = 0; q < 4; q++) { const i = CN[4 * c + q]; if (shape[i] === shape[i] && shape[i] > dmax) dmax = shape[i]; } }
      return { name: P.name, torn: +a.toFixed(2), maxDisp: +dmax.toFixed(3) }; }),
    ms: Math.round(cpu), steps, simMs: +(sim.t * 1000).toFixed(1), setMm: Math.round(sim.maxDef * 1000), free, shape, cellsTorn: Uint8Array.from(CER, v => v ? 1 : 0),
    energy: EN && sim.solver === 'cpu' ? energy() : null, ventLog: VLOG.slice(), gas: GV.map((v, k) => v < Infinity ? Math.round(GP[k]) : 0), sources: sim.SRC.length, holes: sim.holes.length };
  if (scene.name === 'plate') {                      // Nurick-Martin: delta/h = 0.480 phi + 0.277, phi = I / (2 h^2 sqrt(B L rho sy))
    const [a, b] = scene.dims, m = MATS[MATI[st.mat]], h = st.h / 1000; let I = 0;
    for (let c = 0; c < NC; c++) { const x = CRC[3 * c], y = CRC[3 * c + 1]; if (Math.abs(x) > a / 2 || Math.abs(y) > b / 2) continue;
      for (const s of sim.SRC) { if (s.kind === 2) continue; const p = pulse(s, [x, y, 0], [0, 0, 1]); if (p) I += (p.I + p.Ix) * p.g * CAR[c]; } }
    const phi = I / (2 * h * h * Math.sqrt(a * b * m.rho * m.sy)); let ci = 0, bd = 1e9;
    for (let i = 0; i < N; i++) { const d = Math.hypot(R0[3 * i], R0[3 * i + 1]); if (d < bd) { bd = d; ci = i; } }
    res.nm = { I: Math.round(I), phi: +phi.toFixed(2), dNM: +(1000 * h * (.48 * phi + .277)).toFixed(1), dSim: +(1000 * Math.abs(X[3 * ci + 2] - R0[3 * ci + 2])).toFixed(1) };
  }
  restoreSt(keep, { grid: cfg.grid ?? keep.grid });
  return res;
}
// the same run, yielding to the browser between syncs so the GPU read backs never stall (the fast way to run a case)
async function runCaseAsync(cfg) {
  const keep = { ...st };
  Object.assign(st, cfg);
  if (cfg.scene && !cfg.aim) { st.aim = cfg.scene === 'plate' ? [0, 0, 0] : cfg.scene === 'burke' && BURKE ? [0, 2.5, BURKE.halfBreadth(0, 2.5)] : [0, 2.2, 0]; st.aimN = [0, 0, 1]; }
  build(); asyncRun = true; detonate(); startRun(); sim.headless = false; sim.external = true;
  const ch = new MessageChannel(), tick = () => new Promise(r => { ch.port1.onmessage = r; ch.port2.postMessage(0); });
  const t0 = performance.now(); let steps = 0;
  while (sim.t < sim.T1) {
    const nb = isWG() ? st.wgBatch : SYNC;
    for (let k = 0; k < nb && sim.t < sim.T1; k++) { const w = gpuWait(); if (w) { gpu.submit(); await w; } step(); steps++; }
    if (isWG()) { gpu.submit(); await gpu.pace(); }
    await tick();
  }
  if (isWG()) await finishWG();
  const ms = performance.now() - t0; sim.cpu = ms; sim.phase = 2; settle();
  const res = { ms: Math.round(ms), steps, simMs: +(sim.t * 1000).toFixed(1), setMm: Math.round(sim.maxDef * 1000), ventLog: VLOG.slice(), gas: GV.map((v, k) => v < Infinity ? Math.round(GP[k]) : 0),
    byPanel: PAN.map(P => { let a = 0, dmax = 0; for (let c = P.off; c < P.off + P.nu * P.nv; c++) { const cc = CMAP[c]; if (cc < 0) continue; if (CER[cc]) a += CAR[cc];
      for (let q = 0; q < 4; q++) { const i = CN[4 * cc + q]; if (!FREE[i]) dmax = Math.max(dmax, Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2])); } }
      return { name: P.name, torn: +a.toFixed(2), maxDisp: +dmax.toFixed(3) }; }) };
  restoreSt(keep, { grid: cfg.grid ?? keep.grid });
  return res;
}
function compare(a, r) {
  let s = 0, n = 0; for (let i = 0; i < a.shape.length; i++) { const x = a.shape[i], y = r.shape[i]; if (x === x && y === y) { s += Math.abs(x - y); n++; } }
  let diff = 0, both = 0; for (let c = 0; c < a.cellsTorn.length; c++) { if (a.cellsTorn[c] !== r.cellsTorn[c]) diff++; else if (a.cellsTorn[c]) both++; }
  return { dispErrMm: +(s / n * 1000).toFixed(2), tornDiffCells: diff, tornBothCells: both };
}
window.BLAST = { ver: 33, get backend() { return gpu ? gpu.kind || 'webgl' : null; }, webgpu: () => !!WG, PROF, st, runCase, runCaseAsync, compare, cam, build, detonate: () => { asyncRun = false; detonate(); startRun(); }, get sim() { return sim; }, energy, draw,
  stepN(n) { sim.headless = true; for (let k = 0; k < n && sim.t < sim.T1; k++) step(); return sim.t; },
  model: () => ({ N, NC, NH, NT, S, dt, X, V, R0, M, FREE, F, FL, TWIN, PARENT, SPL, HOFF, CCR, CPB, PCR, CRAT, CRATP, NLH, NLE, gpu: () => gpu, CN, CPAN, CH, CMAT, CEF, CSP, CSN, CER, CTE, CDM, CEP, CUT, CFD, CAR, CRC, CNR,
    HN, HC, HKP, HMP, HKS, HMS, HT0, HTP, HTH, HDB, HLN, HTL0, HTPS, HTR, TBA, TBB, TSC, TCL, TCL2, TQN, TPRV, TNXT, TKC, CKC, CSD, TKB, TQB, TB0, TKS, TQS, TS0, TBP, TSP, TMM, TFIB, TA, TB, TL0, TLP, TFL, TAR, AK, AF, AC, PAN, GP, GV, OPEN, scene, MATS, EN }),
  pulse, kinneyPs, kinneyIs1, reflect, U_MEAN, U_MAX, tee, SEC,
  rawSteps(n) { const t0 = performance.now(); for (let k = 0; k < n; k++) gpu.step(sim.t, dt, 0); const t1 = performance.now(); gl.finish(); return [t1 - t0, performance.now() - t0]; },
  gpuProfile(n) { gpu.profile(true); for (let k = 0; k < n; k++) gpu.step(sim.t, dt, 0); gl.finish(); return new Promise(r => setTimeout(() => r(gpu.profile(false)), 300)); },
  snapshot() { if (sim && sim.solver === 'gpu') { gpu.readNodes(true, X, V, FREE); const cl = gpu.readCellsFull(); for (let c = 0; c < NC; c++) { CER[c] = cl[4 * c] > .5 ? 1 : 0; CTE[c] = cl[4 * c] > .5 ? cl[4 * c + 1] : -1; CUT[c] = cl[4 * c + 3]; } gpu.readState({ CEP, CDM, TFL, HTP, HTH, HTPS, TBP }); } },
  // CPU vs GPU after the same number of steps: displacement field and eroded cells
  parity(cfg, steps) {
    const keep = { ...st }, res = {};
    const pair = cfg.pair || ['cpu', 'gpu'];
    for (const [ix, sv0] of pair.entries()) { const sv = ix === 0 ? 'cpu' : 'gpu', solver = sv0.replace('+', '');
      Object.assign(st, cfg, { solver }); build(); asyncRun = false; detonate(); startRun(); sim.sync = true;
      if (sv0.endsWith('+')) { for (let i = 0; i < N; i++) X[3 * i + 2] += 1e-7 * Math.sin(i); }
      const t0 = performance.now(); for (let k = 0; k < steps; k++) step();
      if (solver === 'gpu') { gpu.readNodes(true, X, V, FREE); const cl = gpu.readCells(); for (let c = 0; c < NC; c++) CER[c] = cl[4 * c] > .5 ? 1 : 0; }
      if (solver === 'gpu') gpu.readState({ CEP, CDM, TFL, HTP, HTH, HTPS, TBP });
      const d = new Float64Array(3 * N); for (let i = 0; i < 3 * N; i++) d[i] = X[i] - R0[i];
      let ebS = 0, hpS = 0, hthS = 0, cdS = 0; for (let k = 0; k < 4 * NC; k++) ebS += CEP[4 * k + 3]; for (let k = 0; k < NH; k++) { hpS += Math.abs(HTP[k]); hthS += Math.abs(HTH[k]); } for (let c = 0; c < NC; c++) cdS += CDM[c];
      (res.states || (res.states = {}))[sv] = { ebS, hpS, hthS, cdS };
      res[sv] = { d, er: Uint8Array.from(CER, v => v ? 1 : 0), ms: performance.now() - t0 };
    }
    restoreSt(keep);
    let s1 = 0, s2 = 0, mx = 0; for (let i = 0; i < 3 * N; i++) { const a = res.cpu.d[i], b = res.gpu.d[i]; s1 += (a - b) ** 2; s2 += a * a; mx = Math.max(mx, Math.abs(a)); }
    let diff = 0, both = 0; for (let c = 0; c < NC; c++) { if (res.cpu.er[c] !== res.gpu.er[c]) diff++; else if (res.cpu.er[c]) both++; }
    const byKind = {}; for (let i = 0; i < N; i++) { const k = NKIND[i]; const e = byKind[k] || (byKind[k] = [0, 0]); for (let q = 0; q < 3; q++) { e[0] += (res.cpu.d[3 * i + q] - res.gpu.d[3 * i + q]) ** 2; e[1] += res.cpu.d[3 * i + q] ** 2; } }
    let wi = 0, wd = 0; for (let i = 0; i < N; i++) { const d = Math.hypot(res.cpu.d[3 * i] - res.gpu.d[3 * i], res.cpu.d[3 * i + 1] - res.gpu.d[3 * i + 1], res.cpu.d[3 * i + 2] - res.gpu.d[3 * i + 2]); if (d > wd) { wd = d; wi = i; } }
    window.__par = res;
    return { states: res.states, relL2: Math.sqrt(s1 / s2), maxDispMm: mx * 1000, erodedBoth: both, erodedDiff: diff, cpuMs: Math.round(res.cpu.ms), gpuMs: Math.round(res.gpu.ms),
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, e]) => [k, +Math.sqrt(e[0] / e[1]).toFixed(3)])), worst: { mm: wd * 1000, at: [R0[3 * wi], R0[3 * wi + 1], R0[3 * wi + 2]], cpu: [0, 1, 2].map(q => res.cpu.d[3 * wi + q] * 1000), gpu: [0, 1, 2].map(q => res.gpu.d[3 * wi + q] * 1000) } };
  },
  // the same, any pair of 'cpu', 'gpu' (WebGL2), 'webgpu'; sync reads at every sync on all of them
  async parityA(cfg, steps) {
    const keep = { ...st }, res = {}, pair = cfg.pair || ['cpu', 'webgpu'];
    for (const [ix, sv] of pair.entries()) { const key = ix === 0 ? 'a' : 'b';
      Object.assign(st, cfg, { solver: sv === 'cpu' ? 'cpu' : 'gpu', backend: sv === 'webgpu' ? 'webgpu' : 'webgl' }); build(); asyncRun = false; detonate(); startRun(); sim.sync = true; sim.headless = true; sim.external = true;
      const t0 = performance.now(); for (let k = 0; k < steps; k++) { await stepExact(); if (k % 400 === 399) await tick0(); }
      if (sv !== 'cpu') { if (isWG()) await finishWG(); gpu.readNodes(true, X, V, FREE); const cl = gpu.readCells(); for (let c = 0; c < NC; c++) CER[c] = cl[4 * c] > .5 ? 1 : 0; gpu.readState({ CEP, CDM, TFL, HTP, HTH, HTPS, TBP }); }
      const d = new Float64Array(3 * N); for (let i = 0; i < 3 * N; i++) d[i] = X[i] - R0[i];
      let ebS = 0, hpS = 0, cdS = 0, tf = 0; for (let k = 0; k < 4 * NC; k++) ebS += CEP[4 * k + 3]; for (let k = 0; k < NH; k++) hpS += Math.abs(HTP[k]); for (let c = 0; c < NC; c++) cdS += CDM[c]; for (let k = 0; k < NT; k++) tf += TFL[k];
      let spl = null;
      if (TWIN) { if (sv === 'cpu') { spl = []; for (let p = 0; p < N0T; p++) if (SPL[p]) spl.push(p); }
        else { const o = { CEP: CEP.slice(), CDM: CDM.slice(), TFL: TFL.slice(), HTP: HTP.slice() }; await gpu.readStateAsync(o); spl = []; if (o.CRK) for (let p = 0; p < N0T; p++) if (o.CRK[4 * p + 3] > 0) spl.push(p); } }
      res[key] = { sv, d, er: Uint8Array.from(CER, v => v ? 1 : 0), ms: performance.now() - t0, st: { ebS, hpS, cdS, tf }, spl };
    }
    restoreSt(keep);
    let s1 = 0, s2 = 0, mx = 0; for (let i = 0; i < 3 * N; i++) { const a = res.a.d[i], b = res.b.d[i]; s1 += (a - b) ** 2; s2 += a * a; mx = Math.max(mx, Math.abs(a)); }
    let diff = 0, both = 0; for (let c = 0; c < NC; c++) { if (res.a.er[c] !== res.b.er[c]) diff++; else if (res.a.er[c]) both++; }
    let splits = null; if (res.a.spl && res.b.spl) { const A = new Set(res.a.spl), Bs = new Set(res.b.spl); splits = { a: A.size, b: Bs.size, onlyA: res.a.spl.filter(p => !Bs.has(p)).slice(0, 8), onlyB: res.b.spl.filter(p => !A.has(p)).slice(0, 8) }; }
    window.__parA = res;
    let wi = 0, wd = 0; for (let i = 0; i < N; i++) { const d = Math.hypot(res.a.d[3 * i] - res.b.d[3 * i], res.a.d[3 * i + 1] - res.b.d[3 * i + 1], res.a.d[3 * i + 2] - res.b.d[3 * i + 2]); if (d > wd) { wd = d; wi = i; } }
    return { pair, relL2: Math.sqrt(s1 / s2), maxDispMm: mx * 1000, erodedBoth: both, erodedDiff: diff, ms: [Math.round(res.a.ms), Math.round(res.b.ms)], states: [res.a.st, res.b.st], splits,
      worst: { i: wi, mm: +(wd * 1000).toFixed(2), a: [0, 1, 2].map(q => +(res.a.d[3 * wi + q] * 1000).toFixed(1)), b: [0, 1, 2].map(q => +(res.b.d[3 * wi + q] * 1000).toFixed(1)), par: PARENT ? PARENT[wi] : -1, twin: TWIN && wi < N0T ? TWIN[wi] : -1 } };
  },
  // steps/s of a backend on the current model: n steps, timed to the end of the GPU work
  async bench(n, backend) {
    const keep = st.backend; st.backend = backend; build(); asyncRun = backend === 'webgpu'; detonate(); startRun(); sim.headless = backend !== 'webgpu'; sim.external = true;
    stepGPU(); if (isWG()) await gpu.flush(); else gl.finish();
    const t0 = performance.now();
    if (isWG()) { for (let k = 0; k < n; k++) { gpu.step(sim.t, dt, 0); if (gpu.busy()) await gpu.pace(); } await gpu.flush(); }
    else { for (let k = 0; k < n; k++) gpu.step(sim.t, dt, 0); gpu.readNodes(false, X, V, FREE); }
    const ms = performance.now() - t0; st.backend = keep; sim.external = false;
    return { backend: gpu.kind || 'webgl', N, NC, steps: n, ms: Math.round(ms), stepsPerS: Math.round(n / ms * 1000), usPerStep: +(ms / n * 1000).toFixed(1), errors: gpu.errors || [] };
  },
  // displacements (mm, along -aimN) at the nodes nearest `pts` at the given times, then at the run's end; headless
  // (reproducible); cfg as runCase; also members failed and cells torn at the end
  async probe(cfg, times = [], pts = [], stopAt = Infinity) {
    const keep = { ...st }; Object.assign(st, { relaxAt: 0, beamM: 0, efScale: 1, webEndK: 1, boxX: 0, boxZ: 0, brackets: true, kComp: 0, kBand: 0, kEps: null, kLaw: true, backend: 'webgl' }, cfg);
    const wg = st.backend === 'webgpu' && !!WG;                // WebGPU: torn cells read asynchronously (fast, not bit-reproducible)
    build(); asyncRun = wg; detonate(); startRun(); const s = sim; s.headless = !wg; s.external = true;
    const n = cfg.probeDir || st.aimN, near = p => { let bi = 0, bd = 1e18; for (let i = 0; i < N; i++) { const d = (R0[3 * i] - p[0]) ** 2 + (R0[3 * i + 1] - p[1]) ** 2 + (R0[3 * i + 2] - p[2]) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
    const ids = pts.map(near), rec = [];
    const read = async lab => { if (s.solver === 'gpu') { if (wg) await gpu.flush(); gpu.readNodes(false, X, V, FREE); } rec.push([lab, ...ids.map(i => +(-((X[3 * i] - R0[3 * i]) * n[0] + (X[3 * i + 1] - R0[3 * i + 1]) * n[1] + (X[3 * i + 2] - R0[3 * i + 2]) * n[2]) * 1000).toFixed(1))]); };
    const t0 = performance.now();
    for (const T of [...times, stopAt]) {
      while (s.t < Math.min(T, s.T1)) { for (let k = 0; k < 100 && s.t < Math.min(T, s.T1); k++) { const w = gpuWait(); if (w) { gpu.submit(); await w; } step(); } if (wg) { gpu.submit(); await gpu.pace(); } await tick0(); }
      await read(T === Infinity ? 'end ' + (s.t * 1e3).toFixed(0) : +(s.t * 1e3).toFixed(1));
    }
    if (wg) await finishWG();
    s.phase = 2; settle();
    let tf = 0; for (let k = 0; k < NT; k++) tf += TFL[k]; let torn = 0; for (let c = 0; c < NC; c++) if (CER[c]) torn += CAR[c];
    const res = { grid: st.grid, NC, dt: +(dt * 1e6).toFixed(2), rec, membersFailed: tf, tornM2: +torn.toFixed(2), ms: Math.round(performance.now() - t0) };
    restoreSt(keep); return res;
  },
  // a heavy WebGL scene rendering alongside (worker + OffscreenCanvas, 1920x1080, `iters` per pixel, ~60 Hz): the
  // GPU process busy as when the game renders (`draws` small draw calls a frame load its command decoding); stress(0) stops it. Returns the worker's frame times.
  stress(iters = 400, draws = 1) {
    if (window.__stress) { window.__stress.terminate(); window.__stress = null; }
    if (!iters) return;
    const src = `let gl, n = 0, t0 = 0, ft = [];
      onmessage = e => { const cv = e.data.cv, it = e.data.it, nd = e.data.nd; gl = cv.getContext('webgl2');
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; }, p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\\nvoid main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\\nprecision highp float; uniform float T; out vec4 o; void main(){ vec2 q = gl_FragCoord.xy * 0.001; float a = T; for (int i = 0; i < ' + it + '; i++) { a = sin(a + q.x * 1.3) * cos(a - q.y * 0.7) + 0.1 * a; } o = vec4(a, a * 0.5, 0.2, 1.0); }'));
        gl.linkProgram(p); gl.useProgram(p); const u = gl.getUniformLocation(p, 'T');
        const frame = () => { const t = performance.now(); gl.uniform1f(u, t * 1e-3); gl.drawArrays(gl.TRIANGLES, 0, 3);
          for (let k = 1; k < nd; k++) { gl.viewport(k % 64, (k >> 6) % 64, 8, 8); gl.uniform1f(u, k); gl.drawArrays(gl.TRIANGLES, 0, 3); } gl.viewport(0, 0, 1920, 1080); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          ft.push(performance.now() - t); if (ft.length > 120) ft.shift(); postMessage(ft.reduce((a, b) => a + b, 0) / ft.length); setTimeout(frame, 16); };
        frame(); };`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))), cv = new OffscreenCanvas(1920, 1080);
    w.postMessage({ cv, it: iters, nd: draws }, [cv]); w.onmessage = e => { w.ms = e.data; }; window.__stress = w; return w;
  },
  // finite-difference check of the element forces against their energies (debug)
  // each pass's force on node i (debug; state restored)
  forceAt(i) {
    const saveEN = EN; EN = null; const keep = [HTP.slice(), CEP.slice(), CDM.slice(), CUT.slice(), TLP.slice(), TEB.slice(), CER.slice()];
    const hps = HTPS.slice(), tbp = TBP.slice(), tsp = TSP.slice(); const restore = () => { TBP.set(tbp); TSP.set(tsp); HTPS.set(hps); HTP.set(keep[0]); CEP.set(keep[1]); CDM.set(keep[2]); CUT.set(keep[3]); TLP.set(keep[4]); TEB.set(keep[5]); CER.set(keep[6]); };
    const Fs = F.slice(), FLs = FL.slice(), pcr = PCR.slice(), ccr = CCR ? CCR.slice() : null, out = {};
    for (const [k, P] of Object.entries({ hinge: hingePass, cell: cellPass, truss: trussPass })) { F.fill(0); FL.fill(0); P(sim.t, dt); restore(); out[k] = [F[3 * i], F[3 * i + 1], F[3 * i + 2]].map(v => +v.toFixed(0)); }
    F.set(Fs); FL.set(FLs); PCR.length = 0; PCR.push(...pcr); if (ccr) CCR.set(ccr); EN = saveEN; return out;
  },
  // net moment of each pass's internal forces about the charge (debug; state restored), with and without velocities
  torqueBy() {
    const saveEN = EN; EN = null; const keep = [HTP.slice(), CEP.slice(), CDM.slice(), CUT.slice(), TLP.slice(), TEB.slice(), CER.slice()];
    const hps = HTPS.slice(), tbp = TBP.slice(), tsp = TSP.slice(); const restore = () => { TBP.set(tbp); TSP.set(tsp); HTPS.set(hps); HTP.set(keep[0]); CEP.set(keep[1]); CDM.set(keep[2]); CUT.set(keep[3]); TLP.set(keep[4]); TEB.set(keep[5]); CER.set(keep[6]); };
    const Fs = F.slice(), FLs = FL.slice(), SRC = sim.SRC, Vs = V.slice(), C = sim.C, out = {};
    for (const vz of [false, true]) { if (vz) V.fill(0);
      for (const [k, P] of Object.entries({ hinge: hingePass, cell: cellPass, truss: trussPass })) { sim.SRC = []; F.fill(0); FL.fill(0); P(sim.t, dt); restore();
        let mx = 0, my = 0, mz = 0, fs = 0; for (let i = 0; i < N; i++) { const ix = F[3 * i] - FL[3 * i], iy = F[3 * i + 1] - FL[3 * i + 1], iz = F[3 * i + 2] - FL[3 * i + 2], rx = X[3 * i] - C[0], ry = X[3 * i + 1] - C[1], rz = X[3 * i + 2] - C[2];
          mx += ry * iz - rz * iy; my += rz * ix - rx * iz; mz += rx * iy - ry * ix; fs += Math.abs(ix) + Math.abs(iy) + Math.abs(iz); }
        out[k + (vz ? '0' : '')] = [Math.round(Math.hypot(mx, my, mz)), fs.toExponential(2)]; } }
    V.set(Vs); F.set(Fs); FL.set(FLs); sim.SRC = SRC; EN = saveEN; return out;
  },
  fdCheck(node, pass, eps = 1e-6) {
    const P = { hinge: hingePass, cell: cellPass, truss: trussPass }[pass];
    const saveEN = EN; EN = null; const keep = [HTP.slice(), CEP.slice(), CDM.slice(), CUT.slice(), TLP.slice(), TEB.slice(), CER.slice()];
    const hps = HTPS.slice(), tbp = TBP.slice(), tsp = TSP.slice(); const restore = () => { TBP.set(tbp); TSP.set(tsp); HTPS.set(hps); HTP.set(keep[0]); CEP.set(keep[1]); CDM.set(keep[2]); CUT.set(keep[3]); TLP.set(keep[4]); TEB.set(keep[5]); CER.set(keep[6]); };
    const Vs = V.slice(); V.fill(0); const Fs = F.slice(), SRC = sim.SRC; sim.SRC = [];
    F.fill(0); const e0 = P(0, 1e-9); restore(); const f = [F[3 * node], F[3 * node + 1], F[3 * node + 2]]; const out = [];
    for (let q = 0; q < 3; q++) { X[3 * node + q] += eps; F.fill(0); const e1 = P(0, 1e-9); restore(); X[3 * node + q] -= 2 * eps; F.fill(0); const e2 = P(0, 1e-9); restore(); X[3 * node + q] += eps;
      out.push([f[q], -(e1 - e2) / (2 * eps)]); }
    V.set(Vs); F.set(Fs); sim.SRC = SRC; EN = saveEN; return out;
  } };
