/* The blast bench's shell model (game/concepts/blast/blast.js at commit 03813d8, its petals option left out), ported for the game: the same
   physics, from a scene built out of a patch spec (blast/spec.js) instead of the bench's test box. No DOM, no GL.

   Structure: every quad cell is 4 crossed CST membranes (corotational, plane-stress J2 + linear hardening + Cowper-
   Symonds with strain-dependent constants), dihedral hinges on every shared edge (plate bending, elastic-plastic,
   membrane interaction), stiffeners as shear-limited (Timoshenko-type) beams on their own line (bending over chords m
   cells either side, segment shear), web-end ties where a member runs into a perpendicular plate, GL mesh-regularised
   ductile erosion, a compressive knock-down of plating and members within 0.6 m of a plate junction (the fold a coarse
   grid cannot make: the side dish grid-converged, AUDIT A1), frame brackets where the side's frames meet a deck, elastic-plastic anchors with Lysmer-Kuhlemeyer dashpots where the ship continues,
   water backing below the waterline; nodal stable step with bounded selective mass scaling. Loads: air shock (Kinney-
   Graham, reflection, cos^2, arrival), near-field products impulse, hole and image secondary sources (openings cannot
   focus: capped by the feeding source), water shock of a burst at the waterline (Cole) on the wet plating, compartment
   gas with venting, products let in through outside openings, casing fragments; the end of a run looks only at what is
   still joined to the ship (debris does not hold it open). See the bench's header and BENCH.md for the references.

   Differences from the bench: the scene comes from the spec (plates -> rectangular pieces, gas spaces, open edges on
   the fixed faces of the patch box, stiffener lines at the ship's frame phase); "up" is an axis of the local frame (side
   patches y, deck patches z) for the waterline, the sea image and gravity; the energy ledger and the CPU reference
   passes are left out (the GPU runs the passes). */

export const P0 = 101325, G = 9.81, RHO_W = 1025, C_W = 1500;
export const E_G = 2.98e6;
export const U_MAX = Math.sqrt(10 * E_G / 3), U_MEAN = .75 * U_MAX;
const RHO_TNT = 1600, K_SHEAR = 1.0, LC_BOUND = 2.0;
export const MATS = [
  { key: 'hsla', name: 'HSLA-80', rho: 7850, E: 207e9, nu: .3, sy: 550e6, H: 1.0e9, D: 3200, q: 5, Du: 3200, qu: 5, eu: .15, eg: .056, ee: .54 },
  { key: 'hts', name: 'HTS', rho: 7850, E: 204e9, nu: .3, sy: 324e6, H: .9e9, D: 40.4, q: 5, Du: 6844, qu: 3.91, eu: .2, eg: .056, ee: .54 },
  { key: 'mild', name: 'mild steel', rho: 7850, E: 200e9, nu: .3, sy: 235e6, H: .9e9, D: 40.4, q: 5, Du: 6844, qu: 3.91, eu: .2, eg: .056, ee: .54 },
  { key: 'alu', name: 'Al 5456', rho: 2660, E: 70e9, nu: .33, sy: 228e6, H: .5e9, D: 6500, q: 4, Du: 6500, qu: 4, eu: .1, eg: .034, ee: .32 },
];
export const MATI = Object.fromEntries(MATS.map((m, i) => [m.key, i]));
export const csf = (m, ed, ep) => { const f = Math.min(1, ep / m.eu), D = m.D + (m.Du - m.D) * f, q = m.q + (m.qu - m.q) * f; return 1 + Math.pow(Math.min(ed, 1e4) / D, 1 / q); };
/* the compressive knock-down near plate junctions (bench cb79b1f): tabled against S / fold length, ramped in over 0.4 %
   plastic strain; a cell squashed to a quarter of its area erodes */
const JMIN = .25, KC_EPS = .004, KBAND = .6;
/* failure judged on the damage averaged over a square round the cell, side max(0.2 m, 2 cells), with the GL strain for
   that length (bench ae3abf6: grid-converged holes) */
const LREG = .2, lrOf = lc => Math.max(LREG, 2 * lc);
const KC_TAB = [[.093, 1], [.186, .4], [.372, .15], [.744, .12], [1.49, .03]];
function kcLaw(S_, t) {
  const x = S_ / (.9 * Math.cbrt(t || .0065)), T = KC_TAB;
  if (x <= T[0][0]) return 1; if (x >= T[T.length - 1][0]) return T[T.length - 1][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const f = Math.log(x / T[i - 1][0]) / Math.log(T[i][0] / T[i - 1][0]); return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * f; }
  return 1;
}
const compKnock = (S_, t, le, ds) => ds <= Math.max(le * .5, KBAND) ? kcLaw(S_, t) : 1;
/* stiffener sections (tee: web height/thickness, flange breadth/thickness, m), approximate destroyer scantlings (bench) */
export const SEC = {
  sideLong: { hw: .18, tw: .006, bf: .09, tf: .008 }, sideFrame: { hw: .4, tw: .008, bf: .15, tf: .012 },
  deckLong: { hw: .15, tw: .006, bf: .075, tf: .008 }, deckBeam: { hw: .3, tw: .007, bf: .12, tf: .01 },
  d2Long: { hw: .125, tw: .005, bf: .06, tf: .006 }, d2Beam: { hw: .25, tw: .006, bf: .1, tf: .008 },
  bhdStiff: { hw: .15, tw: .006, bf: .075, tf: .008 },
};
/* casings (kg) and typical fragment mass (kg) of the game's rounds (approximate public figures; bench ROUNDS) */
export const CASING = {
  oniks: [130, .03], kalibr: [250, .04], tlam: [250, .04], slam: [250, .04], uran: [80, .03], mk84: [500, .05],
  hellfire: [4, .005], kornet: [4, .005], shell: [28, .015], shell130: [30, .015], shell57: [2.5, .006], gun5: [28, .015],
  sm6: [34, .01], pdms: [20, .008], sam: [12, .006], sam48: [110, .02], ram: [6, .005], aam: [10, .006], gun30: [.3, .002],
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => mul(a, 1 / (len(a) || 1));
const glf = (m, t, le) => m.eg + m.ee * Math.min(.2, t / le);
const TRI = [[0, 1, 2], [0, 2, 3], [0, 1, 3], [1, 2, 3]];
const EK = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;

export function tee(s, be, tp) {
  const R = [[be, -tp, 0], [s.tw, 0, s.hw], [s.bf, s.hw, s.hw + s.tf]];
  let A = 0, Ay = 0; for (const [b, y0, y1] of R) { A += b * (y1 - y0); Ay += b * (y1 - y0) * (y0 + y1) / 2; }
  const na = Ay / A; let I = 0;
  for (const [b, y0, y1] of R) { const t = y1 - y0, yc = (y0 + y1) / 2; I += b * t * t * t / 12 + b * t * (yc - na) ** 2; }
  let lo = -tp, hi = s.hw + s.tf;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; let below = 0; for (const [b, y0, y1] of R) below += b * Math.max(0, Math.min(y1, m) - y0);
    if (below < A / 2) lo = m; else hi = m; }
  const yp = (lo + hi) / 2; let Zp = 0;
  for (const [b, y0, y1] of R) {
    if (yp <= y0) Zp += b * ((y1 - yp) ** 2 - (y0 - yp) ** 2) / 2; else if (yp >= y1) Zp += b * ((yp - y0) ** 2 - (yp - y1) ** 2) / 2;
    else Zp += b * ((yp - y0) ** 2 + (y1 - yp) ** 2) / 2;
  }
  return { A: s.tw * s.hw + s.bf * s.tf, I, Zp, c: Math.max(na + tp, s.hw + s.tf - na), Aw: s.tw * s.hw, d: s.hw + s.tf, tw: s.tw };
}

/* ------------------------------------------------------------ the scene from a patch spec */
const AXES = [[2, 1], [0, 2], [0, 1]];          // ax -> [ua, va] (as blast/patch.js)
/* the bench's rectPiece on given grid lines (ul along u, vl along v: absolute local coordinates; a graded grid shares its
   lines between the pieces), with the stiffener lines at the ship's frame phase (spacing `every` from `phase`) */
function rectPiece(P, ul, vl) {
  const [ua, va] = AXES[P.ax], nu = ul.length - 1, nv = vl.length - 1;
  const Gd = new Float64Array(3 * (nu + 1) * (nv + 1));
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const o = 3 * (j * (nu + 1) + i); Gd[o + P.ax] = P.val; Gd[o + ua] = ul[i]; Gd[o + va] = vl[j]; }
  const near = (L, x) => { let b = 0; for (let k = 1; k < L.length; k++) if (Math.abs(L[k] - x) < Math.abs(L[b] - x)) b = k; return b; };
  const lines = [];
  for (const s of P.stiff || []) {
    const L = s.along === 'u' ? vl : ul, Lx = L[L.length - 1] - L[0], nn = L.length - 1;
    const ph = ((s.phase || 0) % s.every + s.every) % s.every;
    for (let x = ph; x < Lx - 1e-6; x += s.every) { const g = near(L, L[0] + x); if (g > 0 && g < nn && !lines.some(l => l.along === s.along && l.g === g)) lines.push({ along: s.along, g, sec: s.sec, spacing: s.every }); }
  }
  const p00 = [0, 0, 0], p10 = [0, 0, 0], p01 = [0, 0, 0]; p00[P.ax] = p10[P.ax] = p01[P.ax] = P.val;
  p00[ua] = p01[ua] = ul[0]; p10[ua] = ul[nu]; p00[va] = p10[va] = vl[0]; p01[va] = vl[nv];
  return { name: P.name, kind: P.kind, nu, nv, G: Gd, mask: null, h: P.h, mat: P.mat, n: nrm(cross(sub(p10, p00), sub(p01, p00))), sides: null, wet: null,
    lines, open: P.open || [0, 0, 0, 0], planar: true, imperfSign: P.imperfSign, skin: P.skin, ax: P.ax, val: P.val, u0: ul[0], v0: vl[0], ul: Float64Array.from(ul), vl: Float64Array.from(vl) };
}
/* the grid lines of one local axis over [lo, hi]: every S within the fine band (spec.grade, the bench's graded grid:
   S within 1.5 + 0.6 W^(1/3) m of the hit), every 2 S beyond; lo and hi themselves */
function axisLines(lo, hi, S, fine) {
  const out = [], S2 = fine ? 2 * S : S, e = S * .3;
  for (let k = Math.ceil((lo - 1e-6) / S); k * S <= hi + 1e-6; k++) {
    const x = k * S, inF = !fine || (x >= fine[0] - 1e-6 && x <= fine[1] + 1e-6);
    if (inF || Math.abs(x / S2 - Math.round(x / S2)) < 1e-6) out.push(x);
  }
  if (!out.length || out[0] - lo > e) out.unshift(lo); else out[0] = lo;
  if (hi - out[out.length - 1] > e) out.push(hi); else out[out.length - 1] = hi;
  return out;
}
/* spec -> { pieces, spaces, OUT, spaceAt, up, waterline }; each piece keeps its plate's grid order (i along u, j along v)
   so the skins map one to one (a graded piece's lines are in its ul / vl) */
export function sceneOf(spec, S) {
  const B = spec.box, e = S * .25, g = spec.grade;
  const LN = [0, 1, 2].map(k => axisLines(Math.round(B[k] / S) * S, Math.round(B[k + 3] / S) * S, S, g && g.fine[k]));
  const sn = (k, v) => { const L = LN[k]; let b = L[0]; for (const x of L) if (Math.abs(x - v) < Math.abs(b - v)) b = x; return b; };
  const Bs = [0, 1, 2, 3, 4, 5].map(f => sn(f % 3, B[f]));
  const plates = spec.plates.slice(0, 10);
  const faceFree = [0, 1, 2, 3, 4, 5].map(f => plates.some(p => p.ax === f % 3 && Math.abs(sn(p.ax, p.val) - Bs[f]) < e));
  const onFixed = (axis, v) => (Math.abs(v - Bs[axis]) < e && !faceFree[axis]) || (Math.abs(v - Bs[axis + 3]) < e && !faceFree[axis + 3]);
  const deckPatch = spec.kind === 'deck';
  const pieces = plates.map((pl, pi) => {
    const ax = pl.ax, [ua, va] = AXES[ax];
    const val = sn(ax, pl.val), u0 = sn(ua, pl.u0), u1 = sn(ua, pl.u1), v0 = sn(va, pl.v0), v1 = sn(va, pl.v1);
    const ul = LN[ua].filter(x => x >= u0 - 1e-6 && x <= u1 + 1e-6), vl = LN[va].filter(x => x >= v0 - 1e-6 && x <= v1 + 1e-6);
    if (ul.length < 2 || vl.length < 2) return null;
    const mat = MATI[pl.mat] !== undefined ? MATI[pl.mat] : MATI.mild;
    // stiffeners: along u at the longitudinal spacing (lines of constant v), along v at the frame spacing (constant u),
    // sections by kind (side 0, weather deck 1, inner deck 2, bulkhead 3) scaled by the class's tie factor
    const kind = pl.skin && pi === 0 ? (deckPatch ? 1 : 0) : pl.skin ? 1 : ax === 0 ? 3 : 2;
    const secU = kind === 0 ? SEC.sideLong : kind === 1 ? SEC.deckLong : kind === 3 ? SEC.bhdStiff : SEC.d2Long;
    const secV = kind === 0 ? SEC.sideFrame : kind === 1 ? SEC.deckBeam : kind === 3 ? SEC.bhdStiff : SEC.d2Beam;
    const scale = s => { const k = Math.sqrt(pl.tie || 1); return k === 1 ? s : { hw: s.hw * k, tw: s.tw * k, bf: s.bf * k, tf: s.tf * k }; };
    const stiff = [];
    if (pl.fv > 0) stiff.push({ along: 'u', every: pl.fv, phase: (pl.pv || 0) - v0, sec: scale(secU) });
    if (pl.fu > 0) stiff.push({ along: 'v', every: pl.fu, phase: (pl.pu || 0) - u0, sec: scale(secV) });
    const open = pl.open || [onFixed(ua, u0), onFixed(ua, u1), onFixed(va, v0), onFixed(va, v1)].map(b => b ? 1 : 0);
    // (the bench's decks and bulkheads face the other way: their imperfection dimples as the bench's do)
    return rectPiece({ imperfSign: ax === 2 ? 1 : -1, name: 'plate ' + pi, kind: pl.kind !== undefined ? pl.kind : kind, ax, val, h: pl.h, mat, stiff, open, skin: !!pl.skin }, ul, vl);
  });
  // frame brackets (bench cb79b1f): where the side's frames meet a deck, a square of the frame's web plate (legs ~ the
  // frame's depth) takes the frame's end reaction into the deck over its leg (side patches; the web-end ties otherwise)
  let brackets = false;
  const P0 = pieces[0];
  if (!deckPatch && P0 && P0.ax === 2) {
    const fr = SEC.sideFrame, k = Math.sqrt(plates[0].tie || 1), Lb = S * Math.max(1, Math.round((fr.hw + fr.tf) * k / S)), tw = fr.tw * k;
    const vlo = P0.vl[0], vhi = P0.vl[P0.vl.length - 1];
    const decks = pieces.filter(p => p && p.ax === 1 && p.val > vlo - 1e-6 && p.val < vhi + 1e-6);
    for (const ln of P0.lines) {
      if (ln.along !== 'v' || ln.sec !== P0.lines.find(l => l.along === 'v').sec) continue;
      const x = P0.ul[ln.g];
      for (const d of decks) for (const dy of (d.val <= vlo + 1e-6 ? [1] : d.val >= vhi - 1e-6 ? [-1] : [-1, 1])) {
        const z0 = sn(2, -Lb), y1 = sn(1, d.val + dy * Lb);
        const ul = LN[2].filter(z => z >= z0 - 1e-6 && z <= 1e-6), vl = LN[1].filter(y => y >= Math.min(d.val, y1) - 1e-6 && y <= Math.max(d.val, y1) + 1e-6);
        if (ul.length < 2 || vl.length < 2) continue;
        const pc = rectPiece({ imperfSign: -1, name: 'bracket', kind: 3, ax: 0, val: x, h: tw, mat: P0.mat, stiff: [], open: [0, 0, 0, 0], skin: false }, ul, vl);
        pc.bracket = true; pieces.push(pc); brackets = true;
      }
    }
  }
  const comps = (spec.comps || []).slice(0, 16), OUT = comps.length;
  const spaces = comps.map((c, k) => ({ name: 'space ' + k, box: c.img || c.b, V: c.V }));
  spaces.push({ name: 'outside', box: null, V: Infinity });
  const spaceAt = p => { for (let k = 0; k < comps.length; k++) { const b = comps[k].b; if (p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5]) return k; } return OUT; };
  const up = deckPatch ? 2 : 1;
  // (a plate too small for the grid is left out: pieces keeps the spec's plate numbering, null where none)
  return { brackets, scatter: spec.scatter || 0, seed: spec.seed || 1, pieces: pieces.filter(Boolean), plateOf: pieces.map((p, i) => p ? (p.bracket ? -1 : i) : -2).filter(i => i > -2), spaces, OUT, spaceAt, up, waterline: spec.wlLocal !== undefined ? spec.wlLocal : -1e9, snap: false, vents: (spec.vents || []).map(([a, b, A, pf]) => [a < 0 ? OUT : a, b < 0 ? OUT : b, A, pf || 0]).filter(v => v[0] <= OUT && v[1] <= OUT), isCut: null };
}

/* ------------------------------------------------------------ the model (bench build(), into an object) */
export function buildShell(scene, S) {
  const M = { S, scene, up: scene.up };
  const pieces = scene.pieces, upx = scene.up;
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
  // ---- 2. (the bench's snapping of separately gridded pieces: not needed, the spec's plates share the grid)
  const nn0 = pos.length / 3, N0 = nn0;
  const nid = i => i;
  const npc2 = npc;
  pos = new Float64Array(pos);
  const mass = new Float64Array(N0), kind = new Uint8Array(N0).fill(255), frm = new Uint8Array(N0);
  // ---- 3. imperfection between stiffeners (hungry horse) on nodes that belong to one piece only
  pieces.forEach((pc, pi) => {
    const m = MATS[pc.mat], rows = [0, pc.nv, ...pc.lines.filter(l => l.along === 'u').map(l => l.g)].sort((a, b) => a - b), cols = [0, pc.nu, ...pc.lines.filter(l => l.along === 'v').map(l => l.g)].sort((a, b) => a - b);
    const brk = (arr, x) => { for (let k = 1; k < arr.length; k++) if (x <= arr[k]) return [arr[k - 1], arr[k]]; return [arr[0], arr[1]]; };
    const g3 = k => [pc.G[3 * k], pc.G[3 * k + 1], pc.G[3 * k + 2]];
    const du = len(sub(g3(pc.nu), g3(0))) / pc.nu, dv = len(sub(g3(pc.nv * (pc.nu + 1)), g3(0))) / pc.nv;
    for (let j = 0; j <= pc.nv; j++) for (let i = 0; i <= pc.nu; i++) {
      const k = nid(gid[pi][j * (pc.nu + 1) + i]); if (k < 0 || npc2[k].length !== 1) continue;
      const [ua, ub] = brk(cols, i), [va, vb] = brk(rows, j);
      const b = Math.max(S, pc.ul ? Math.min(pc.ul[ub] - pc.ul[ua], pc.vl[vb] - pc.vl[va]) : Math.min((ub - ua) * du, (vb - va) * dv)), beta = b / pc.h * Math.sqrt(m.sy / m.E), w0 = Math.min(.1 * beta * beta * pc.h, b / 200);
      const w = -(pc.imperfSign || 1) * w0 * Math.sin(Math.PI * (i - ua) / Math.max(1, ub - ua)) * Math.sin(Math.PI * (j - va) / Math.max(1, vb - va));
      for (let q = 0; q < 3; q++) pos[3 * k + q] += pc.n[q] * w;
    }
  });
  // ---- 4. cells
  const cn = [], cpan = [], ch = [], cmat = [], csp = [], csn = [], cwet = [], cmap = []; let dropped = 0;
  const PAN = [];
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
      cwet.push(wet && ctr[upx] < scene.waterline ? scene.waterline - ctr[upx] : -1);
      const A = .5 * len(av);
      for (const k of q) { mass[k] += m.rho * pc.h * A / 4; if (kind[k] === 255) kind[k] = pc.kind; }
    }
    const g3 = k => [pc.G[3 * k], pc.G[3 * k + 1], pc.G[3 * k + 2]], o = g3(0), Ue = sub(g3(pc.nu), o), Ve = sub(g3(pc.nv * (pc.nu + 1)), o);
    PAN.push({ o, U: nrm(Ue), V: nrm(Ve), Lu: len(Ue), Lv: len(Ve), n: pc.n, nu: pc.nu, nv: pc.nv, off, kind: pc.kind, name: pc.name, planar: pc.planar,
      at: Int32Array.from(ids, i => nid(i)), skin: pc.skin, ax: pc.ax, val: pc.val, u0: pc.u0, v0: pc.v0, h: pc.h, mat: pc.mat, ul: pc.ul, vl: pc.vl, open: pc.open, plate: scene.plateOf ? scene.plateOf[pi] : pi });
  });
  const CMAP = M.CMAP = Int32Array.from(cmap);
  // ---- 5. anchors on open edges (flagged sides of a piece)
  const anchors = [];
  const openEdge = (a, b, c) => {
    const L = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]), m = MATS[cmat[c]], h = ch[c];
    const cL = Math.sqrt(m.E / (m.rho * (1 - m.nu * m.nu)));
    for (const q of [a, b]) anchors.push([q, m.E * h * (L / 2) / LC_BOUND, m.sy * h * L / 2, m.rho * cL * h * L / 2]);
  };
  const emap = new Map();
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
  // ---- 6. stiffener lines: members (axial) along the grid line
  const ta = [], tb = [], tar = [], tmat = [], tsec = [], tkind = [], tline = [], tpan = [], lineRec = [], tkey = new Set();
  pieces.forEach((pc, pi) => {
    const ids = gid[pi], m = MATS[pc.mat];
    for (const ln of pc.lines) {
      const nn = ln.along === 'u' ? pc.nu : pc.nv, sec = tee(ln.sec, ln.spacing, pc.h), heavy = sec.d > .25 ? 2 : 1, line = lineRec.length;
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
        ta.push(a); tb.push(b); tar.push(sec.A); tmat.push(pc.mat); tsec.push([sec, L]); tkind.push(heavy); tline.push(line); tpan.push(pi);
        mass[a] += m.rho * sec.A * L / 2; mass[b] += m.rho * sec.A * L / 2; frm[a] = Math.max(frm[a], heavy); frm[b] = Math.max(frm[b], heavy);
      }
      flush();
    }
  });
  // web ends (bench, AUDIT A1b): where a member runs into a perpendicular plate its web end carries the end reaction
  // into that plate over the web's depth: a chain of in-plane ties (area A_w) from the seam node into the plate (not where
  // the scene has frame brackets, bench cb79b1f)
  if (!scene.brackets) {
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
        const other = ncell[J].filter(c => !own.includes(c) && Math.abs(dot(cnorm(c), n1)) < .3 && Math.abs(dot(cnorm(c), t)) > .7);
        if (!other.length) continue;
        const pc2 = cpan[other[0]], n2 = cnorm(other[0]); let dv = nrm(cross(n2, nrm(cross(n1, n2))));
        if (dot(sub(ccen(other[0]), P3(J)), dv) < 0) dv = [-dv[0], -dv[1], -dv[2]];
        let cur = J, dist = 0;
        for (let it = 0; it < 12 && dist < sec.d - 1e-3; it++) {
          let best = -1, bs = -1;
          for (const c of ncell[cur]) { if (cpan[c] !== pc2) continue;
            for (let z = 0; z < 4; z++) { const q = cn[4 * c + z]; if (q === cur) continue; const e = sub(P3(q), P3(cur)), el = len(e), al = dot(e, dv) / (el || 1);
              if (al > .95 && el > 1e-3 && al * el > bs) { bs = al * el; best = q; } } }
          if (best < 0) break;
          const key = EK(cur, best);
          if (!wkey.has(key)) { wkey.add(key); const L = len(sub(P3(best), P3(cur))), A = sec.Aw;
            ta.push(cur); tb.push(best); tar.push(A); tmat.push(pieces[lr.pi].mat); tsec.push([sec, L]); tkind.push(1); tline.push(-1); tpan.push(pc2);
            mass[cur] += m.rho * A * L / 2; mass[best] += m.rho * A * L / 2; }
          dist += bs; cur = best;
        }
      }
    }
  }
  const onOpen = new Uint8Array(N0); for (const [q] of anchors) onOpen[q] = 1;
  for (const lr of lineRec) for (const [end, t] of [[lr.nodes[0], lr.trusses[0]], [lr.nodes[lr.nodes.length - 1], lr.trusses[lr.trusses.length - 1]]]) {
    if (!onOpen[end]) continue; const m = lr.mat, A = tar[t], cL = Math.sqrt(m.E / m.rho);
    anchors.push([end, m.E * A / LC_BOUND, m.sy * A, m.rho * cL * A]);
  }
  // ---- arrays
  const N = M.N = N0;
  M.X = new Float64Array(pos); M.R0 = new Float64Array(pos); M.V = new Float64Array(3 * N); M.M = mass;
  const WINV = M.WINV = new Float64Array(N); for (let i = 0; i < N; i++) WINV[i] = mass[i] > 0 ? 1 / mass[i] : 0;
  M.FREE = new Uint8Array(N); M.AK = new Float64Array(N); M.AF = new Float64Array(N); M.AC = new Float64Array(N);
  for (const [q, k, f, c] of anchors) { M.AK[q] += k; M.AF[q] += f; M.AC[q] += c; }
  for (let i = 0; i < N0; i++) if (kind[i] === 255) kind[i] = 0;
  M.NKIND = kind; M.NFRM = frm; M.NCON = new Int32Array(N); M.TBRK = new Float32Array(N).fill(-1);
  const NC = M.NC = cpan.length;
  const R0 = M.R0, CN = M.CN = new Int32Array(cn); M.CPAN = new Int32Array(cpan); const CH = M.CH = new Float64Array(ch), CMAT = M.CMAT = new Uint8Array(cmat);
  M.CSP = new Int32Array(csp); M.CSN = new Int32Array(csn); M.CWET = new Float64Array(cwet);
  const CAR = M.CAR = new Float64Array(NC), CEF = M.CEF = new Float64Array(NC), CTR = M.CTR = new Float64Array(12 * NC), CHG = M.CHG = new Int32Array(4 * NC).fill(-1), CDB = M.CDB = new Float64Array(NC);
  M.CVIS = new Uint32Array(NC); M.CKC = new Float64Array(NC).fill(1); M.CEP = new Float64Array(16 * NC); M.CER = new Uint8Array(NC); M.CKN = new Uint8Array(NC); M.CTE = new Float64Array(NC).fill(-1);
  M.CDM = new Float64Array(NC); M.CUT = new Float64Array(NC); M.CFD = new Float64Array(NC); const CRC = M.CRC = new Float64Array(3 * NC), CNR = M.CNR = new Float64Array(3 * NC);
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
    CEF[c] = glf(MATS[CMAT[c]], CH[c], Math.max(Math.sqrt(CAR[c]), lrOf(Math.sqrt(CAR[c]))));
    // (the game's patches: the steel's scatter, seeded per cell: tears start at the weaker spots and run, rather than a
    // whole panel letting go along its perfect edges at once; the bench's check box runs without it)
    if (scene.scatter) { let h = Math.imul(c + 1, 0x9E3779B1) ^ (scene.seed | 0); h = Math.imul(h ^ (h >>> 15), 0x85EBCA77); h ^= h >>> 13; CEF[c] *= 1 + scene.scatter * (((h >>> 0) / 4294967296) * 2 - 1); }
    CDB[c] = Math.sqrt(CAR[c]);
    for (const i of q) M.NCON[i]++;
  }
  // the distance of each cell from the nearest plate junction (a node whose cells meet at more than ~45 deg), and the
  // knock-down it gets (bench cb79b1f)
  let seamDist = () => Infinity;
  {
    const ncl = Array.from({ length: N }, () => []); for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) ncl[CN[4 * c + k]].push(c);
    const seam = []; for (let i = 0; i < N; i++) { const l = ncl[i]; let ok = false;
      for (let a = 0; a < l.length && !ok; a++) for (let b = a + 1; b < l.length; b++) { const x = l[a], y = l[b];
        if (Math.abs(CNR[3 * x] * CNR[3 * y] + CNR[3 * x + 1] * CNR[3 * y + 1] + CNR[3 * x + 2] * CNR[3 * y + 2]) < .7) { ok = true; break; } }
      if (ok) seam.push(i); }
    const hb = new Map(), HB = .5, hk = (x, y, z) => Math.floor(x / HB) + ',' + Math.floor(y / HB) + ',' + Math.floor(z / HB);
    for (const i of seam) { const k = hk(R0[3 * i], R0[3 * i + 1], R0[3 * i + 2]); (hb.get(k) || hb.set(k, []).get(k)).push(i); }
    seamDist = (x, y, z) => { let d = Infinity; for (let p = -1; p <= 1; p++) for (let q = -1; q <= 1; q++) for (let e = -1; e <= 1; e++) { const l = hb.get((Math.floor(x / HB) + p) + ',' + (Math.floor(y / HB) + q) + ',' + (Math.floor(z / HB) + e)); if (!l) continue;
      for (const i of l) d = Math.min(d, Math.hypot(R0[3 * i] - x, R0[3 * i + 1] - y, R0[3 * i + 2] - z)); } return d; };
    for (let c = 0; c < NC; c++) M.CKC[c] = compKnock(S, CH[c], Math.sqrt(CAR[c]), seamDist(CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]));
  }
  // non-local failure (bench ae3abf6): each cell's neighbours (same piece) inside the square of side lrOf(cell) round it,
  // the area of their overlap as weight (the cell's own weight in NLH[4c+2])
  {
    let reach = .25; for (let c = 0; c < NC; c++) { const lc = Math.sqrt(CAR[c]); reach = Math.max(reach, lrOf(lc) / 2 + lc); }
    const hb = new Map(), HB = reach, key = (x, y, z) => Math.floor(x / HB) + ',' + Math.floor(y / HB) + ',' + Math.floor(z / HB);
    for (let c = 0; c < NC; c++) { const k = key(CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]); (hb.get(k) || hb.set(k, []).get(k)).push(c); }
    const NLH = M.NLH = new Float32Array(4 * NC), ids = [], ws = [];
    for (let c = 0; c < NC; c++) {
      const lc = Math.sqrt(CAR[c]), Lr = lrOf(lc); NLH[4 * c] = ids.length; NLH[4 * c + 2] = Lr > 0 ? Math.min(lc, Lr) ** 2 : lc * lc;
      if (!(Lr > lc)) continue;
      const q0 = CN[4 * c], q1 = CN[4 * c + 1], ex = nrm(sub([R0[3 * q1], R0[3 * q1 + 1], R0[3 * q1 + 2]], [R0[3 * q0], R0[3 * q0 + 1], R0[3 * q0 + 2]])),
        nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]], ey = cross(nn, ex), x0 = CRC[3 * c], y0 = CRC[3 * c + 1], z0 = CRC[3 * c + 2];
      for (let a1 = -1; a1 <= 1; a1++) for (let b1 = -1; b1 <= 1; b1++) for (let e1 = -1; e1 <= 1; e1++) {
        const l = hb.get((Math.floor(x0 / HB) + a1) + ',' + (Math.floor(y0 / HB) + b1) + ',' + (Math.floor(z0 / HB) + e1)); if (!l) continue;
        for (const j of l) { if (j === c || M.CPAN[j] !== M.CPAN[c]) continue;
          const d = [CRC[3 * j] - x0, CRC[3 * j + 1] - y0, CRC[3 * j + 2] - z0], lj = Math.sqrt(CAR[j]);
          if (Math.abs(dot(d, nn)) > lc) continue;
          const x = dot(d, ex), y = dot(d, ey);
          const ox = Math.min(x + lj / 2, Lr / 2) - Math.max(x - lj / 2, -Lr / 2), oy = Math.min(y + lj / 2, Lr / 2) - Math.max(y - lj / 2, -Lr / 2);
          if (ox > 1e-6 && oy > 1e-6) { ids.push(j); ws.push(ox * oy); } } }
      NLH[4 * c + 1] = ids.length - NLH[4 * c];
    }
    const NLE = M.NLE = new Float32Array(2 * ids.length); for (let k = 0; k < ids.length; k++) { NLE[2 * k] = ids[k]; NLE[2 * k + 1] = ws[k]; }
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
    ht0.push(g.th); hdb.push((g.h1 + g.h2) / 2); hsame.push(M.CPAN[c1] === M.CPAN[c2] ? 1 : 0);
    let lh = hOfEdge.get(ek); if (!lh) hOfEdge.set(ek, lh = []); lh.push(h);
    if (M.CPAN[c1] === M.CPAN[c2]) { CHG[4 * c1 + e1] = h; CHG[4 * c2 + e2] = h; }
  }
  const NH = M.NH = hc.length / 2;
  const HN = M.HN = new Int32Array(hn), HC = M.HC = new Int32Array(hc), HKP = M.HKP = new Float64Array(hkp); M.HMP = new Float64Array(hmp); const HT0 = M.HT0 = new Float64Array(ht0);
  const HDB = M.HDB = new Float64Array(hdb); M.HHP = new Float64Array(hhp); M.HMAT = new Uint8Array(hmat); M.HSAME = new Uint8Array(hsame);
  const HKS = M.HKS = new Float64Array(NH), HMS = M.HMS = new Float64Array(NH), HTR = M.HTR = new Int32Array(2 * NH).fill(-1);
  M.HTP = new Float64Array(NH); M.HTH = new Float64Array(NH); M.HEL = new Float64Array(NH); const HLN = M.HLN = new Int32Array(NH).fill(-1), HTL0 = M.HTL0 = new Float64Array(NH); M.HTPS = new Float64Array(NH);
  // ---- 8. members, and the stiffeners' bending as a line-angle term on the member's own nodes
  const NT = M.NT = ta.length;
  const TA = M.TA = new Int32Array(ta), TB = M.TB = new Int32Array(tb), TAR = M.TAR = new Float64Array(tar), TMAT = M.TMAT = new Uint8Array(tmat); M.TKIND = new Uint8Array(tkind);
  M.TLINE = new Int32Array(tline); M.TPAN = new Int32Array(tpan);
  const TL0 = M.TL0 = new Float64Array(NT), TEF = M.TEF = new Float64Array(NT), TFIB = M.TFIB = new Float64Array(NT), THG = M.THG = new Int32Array(4 * NT).fill(-1);
  M.TLP = new Float64Array(NT); M.TFL = new Uint8Array(NT); M.TEB = new Float64Array(NT);
  for (let t = 0; t < NT; t++) {
    const a = TA[t], b = TB[t]; TL0[t] = Math.hypot(R0[3 * a] - R0[3 * b], R0[3 * a + 1] - R0[3 * b + 1], R0[3 * a + 2] - R0[3 * b + 2]); M.TLP[t] = TL0[t];
    const [sec, L] = tsec[t], m = MATS[TMAT[t]];
    TEF[t] = glf(m, sec.tw, L); TFIB[t] = sec.c / Math.max(L, sec.d);
  }
  M.TKC = new Float64Array(NT).fill(1);
  for (let k = 0; k < NT; k++) { const a = TA[k], b = TB[k]; M.TKC[k] = compKnock(S, 0, TL0[k], seamDist(.5 * (R0[3 * a] + R0[3 * b]), .5 * (R0[3 * a + 1] + R0[3 * b + 1]), .5 * (R0[3 * a + 2] + R0[3 * b + 2]))); }
  // stiffener bending as a shear-limited (Timoshenko-type) beam on the member's own line (bench a6baec4 / e00312c):
  // bending as the angle between the chords to the nodes m cells either side (base ~1.5 x depth), transverse shear of
  // each segment against the chord around it (G A_w); mirror-symmetric axes across the member in its plating
  const TBA = M.TBA = new Int32Array(NT).fill(-1), TBB = M.TBB = new Int32Array(NT).fill(-1), TSC = M.TSC = new Int32Array(NT).fill(-1), TCL = M.TCL = new Int32Array(NT).fill(-1);
  const TCL2 = M.TCL2 = new Int32Array(NT).fill(-1), TQN = M.TQN = new Int32Array(4 * NT).fill(-1), TPRV = M.TPRV = new Int32Array(NT).fill(-1), TNXT = M.TNXT = new Int32Array(NT).fill(-1);
  const TKB = M.TKB = new Float64Array(NT), TQB = M.TQB = new Float64Array(NT), TB0 = M.TB0 = new Float64Array(NT), TKS = M.TKS = new Float64Array(NT), TQS = M.TQS = new Float64Array(NT), TS0 = M.TS0 = new Float64Array(NT);
  M.TBP = new Float64Array(NT); M.TSP = new Float64Array(NT); const TMM = M.TMM = new Uint8Array(NT).fill(1);
  for (const lr of lineRec) {
    const { sec, mat: m, h, spacing } = lr, L = lr.trusses.length, nd = lr.nodes;
    const D = m.E * h ** 3 / (12 * (1 - m.nu * m.nu)), Gm = m.E / (2 * (1 + m.nu));
    const EIs = Math.max(0, m.E * sec.I - D * spacing), Mps = Math.max(0, m.sy * sec.Zp - m.sy * h * h / 4 * spacing);
    let Sb = 0; for (const t of lr.trusses) Sb += TL0[t]; Sb /= L;
    const mm = Math.max(1, Math.min(Math.round(.75 * sec.d / Sb), Math.floor(L / 2)));
    for (let j = 0; j < L; j++) {
      const t = lr.trusses[j]; TMM[t] = mm; TPRV[t] = j > 0 ? lr.trusses[j - 1] : -1; TNXT[t] = j + 1 < L ? lr.trusses[j + 1] : -1; TFIB[t] = sec.c / (mm * Sb);
      const l = emap.get(EK(nd[j], nd[j + 1])) || [];
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
      const g = memberAngles(M, t, R0); TB0[t] = g[0]; TS0[t] = g[1];
    }
  }
  // ---- stable step, node by node (Gershgorin bound); the few far stiffer nodes get extra mass (bounded selective
  // mass scaling: the added share is reported)
  const kn = new Float64Array(N), Mm = M.M;
  for (let c = 0; c < NC; c++) { const m = MATS[CMAT[c]], Ep = m.E / (1 - m.nu * m.nu);
    for (let t = 0; t < 4; t++) { const L12 = CTR[12 * c + 3 * t], px = CTR[12 * c + 3 * t + 1], py = CTR[12 * c + 3 * t + 2], A = .5 * L12 * py;
      const amin = 2 * A / Math.max(L12, Math.hypot(px, py), Math.hypot(px - L12, py)), k = Ep * CH[c] / 2 * A / (amin * amin);
      for (const z of TRI[t]) kn[CN[4 * c + z]] += k; } }
  for (let t = 0; t < NT; t++) { const k = MATS[TMAT[t]].E * TAR[t] / TL0[t]; kn[TA[t]] += k; kn[TB[t]] += k; }
  for (let k = 0; k < NH; k++) { const kk = HKP[k] / (HDB[k] * HDB[k]); for (let z = 0; z < 6; z++) kn[HN[6 * k + z]] += z < 2 ? kk : kk / 4; }
  for (let t = 0; t < NT; t++) { const Lm = TMM[t] * TL0[t];
    if (TBA[t] >= 0) { const kb = TKB[t] / (Lm * Lm); kn[TA[t]] += 4 * kb; kn[TBA[t]] += kb; kn[TBB[t]] += kb; }
    if (TSC[t] >= 0) { const ks = TKS[t] / (TL0[t] * TL0[t]), kc = TKS[t] / ((2 * TMM[t] - 1) * TL0[t]) ** 2; kn[TA[t]] += ks; kn[TB[t]] += ks; kn[TSC[t]] += kc; kn[TBB[t]] += kc; } }
  for (let i = 0; i < N; i++) kn[i] += M.AK[i];
  const dti = []; for (let i = 0; i < N; i++) if (kn[i] > 0 && Mm[i] > 0 && WINV[i] > 0) dti.push(Math.sqrt(Mm[i] / kn[i]));
  dti.sort((a, b) => a - b);
  const dtT = dti[Math.min(dti.length - 1, Math.floor(dti.length * .002))];
  let added = 0, total = 0;
  for (let i = 0; i < N; i++) { total += Mm[i]; const need = kn[i] * dtT * dtT; if (Mm[i] > 0 && WINV[i] > 0 && need > Mm[i]) { added += need - Mm[i]; Mm[i] = need; WINV[i] = 1 / need; } }
  M.massAdded = added / total;
  // (bench 882692c: 1.4x the Gershgorin bound, the boundary dashpots implicit; the stiffness damping as before)
  M.dt = 1.4 * dtT; M.BETA = .033 * .75 * dtT;
  // ---- contact candidates: planar pieces whose plane passes within 1.5 m of the node (not its own; closer than 5 cm
  // at rest is a junction)
  const NCC = M.NCC = new Int32Array(4 * N).fill(-1);
  const bucket = new Map(), BK = 3;
  PAN.forEach((P, q) => { if (!P.planar) return; const c = [P.o, add(P.o, mul(P.U, P.Lu)), add(P.o, mul(P.V, P.Lv)), add(add(P.o, mul(P.U, P.Lu)), mul(P.V, P.Lv))];
    const lo = [0, 1, 2].map(k => Math.floor((Math.min(...c.map(p => p[k])) - 1.5) / BK)), hi = [0, 1, 2].map(k => Math.floor((Math.max(...c.map(p => p[k])) + 1.5) / BK));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = x + ',' + y + ',' + z; let l = bucket.get(k); if (!l) bucket.set(k, l = []); l.push(q); } });
  for (let i = 0; i < N; i++) {
    let k = 0; const p = [R0[3 * i], R0[3 * i + 1], R0[3 * i + 2]];
    for (const q of bucket.get(Math.floor(p[0] / BK) + ',' + Math.floor(p[1] / BK) + ',' + Math.floor(p[2] / BK)) || []) {
      if (k >= 4) break;
      const P = PAN[q], d = sub(p, P.o), dn = dot(d, P.n);
      if (Math.abs(dn) < .05 || Math.abs(dn) > 1.5) continue;
      const u = dot(d, P.U), v = dot(d, P.V);
      if (u < -1 || v < -1 || u > P.Lu + 1 || v > P.Lv + 1) continue;
      NCC[4 * i + k++] = q;
    }
  }
  M.dropped = dropped;
  M.PAN = PAN; M.MATS = MATS;
  buildGrid(M);
  return M;
}

function hingeGeom(P, x3, x4, f1a, f1b, f2a, f2b) {
  const g = i => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  const a3 = g(x3), a4 = g(x4), p1 = mul(add(g(f1a), g(f1b)), .5), p2 = mul(add(g(f2a), g(f2b)), .5);
  const E = sub(a4, a3), lE = len(E); if (lE < 1e-9) return null;
  const N1 = cross(sub(p1, a3), sub(p1, a4)), N2 = cross(sub(p2, a4), sub(p2, a3));
  const l1 = len(N1), l2 = len(N2); if (l1 < 1e-12 || l2 < 1e-12) return null;
  const n1 = mul(N1, 1 / l1), n2 = mul(N2, 1 / l2), Eh = mul(E, 1 / lE);
  return { th: Math.atan2(dot(cross(n2, n1), Eh), dot(n1, n2)), lE, h1: l1 / lE, h2: l2 / lE };
}

/* the member's bending angle (chords to the nodes m either side, about the in-plate axis across the member) and the
   shear angle of its segment against the chord around it (bench memberAngles; rest values subtracted by the GPU) */
const MB = { e: [0, 0, 0], D: [0, 0, 0], t: [0, 0, 0], pl: 0, dd: 0, Dd: 0, bad: true }, MSx = { e: [0, 0, 0], D: [0, 0, 0], t: [0, 0, 0], pl: 0, dd: 0, Dd: 0, bad: true };
function setAxis(o, Dx, Dy, Dz, tx, ty, tz) {
  const dd = tx * tx + ty * ty + tz * tz, Dd = Dx * tx + Dy * ty + Dz * tz, px = Dx - tx * Dd / dd, py = Dy - ty * Dd / dd, pz = Dz - tz * Dd / dd;
  const pl = Math.hypot(px, py, pz) || 1e-30;
  o.bad = pl < .3 * Math.hypot(Dx, Dy, Dz);
  o.e[0] = -px / pl; o.e[1] = -py / pl; o.e[2] = -pz / pl; o.pl = pl; o.dd = dd; o.Dd = Dd;
  o.D[0] = Dx; o.D[1] = Dy; o.D[2] = Dz; o.t[0] = tx; o.t[1] = ty; o.t[2] = tz;
}
function angAbout(e, ux, uy, uz, vx, vy, vz) { const ex = e[0], ey = e[1], ez = e[2];
  let q = ux * ex + uy * ey + uz * ez; ux -= q * ex; uy -= q * ey; uz -= q * ez; q = vx * ex + vy * ey + vz * ez; vx -= q * ex; vy -= q * ey; vz -= q * ez;
  return Math.atan2((uy * vz - uz * vy) * ex + (uz * vx - ux * vz) * ey + (ux * vy - uy * vx) * ez, ux * vx + uy * vy + uz * vz); }
function memberAngles(M, k, P) {
  const { TA, TB, TQN, TBA, TBB, TSC } = M;
  const a = TA[k], b = TB[k], r1 = TQN[4 * k], r2 = TQN[4 * k + 1], l1 = TQN[4 * k + 2], l2 = TQN[4 * k + 3];
  const tx = P[3 * b] - P[3 * a], ty = P[3 * b + 1] - P[3 * a + 1], tz = P[3 * b + 2] - P[3 * a + 2];
  let th = 0, ga = 0; MB.bad = MSx.bad = true;
  if (TBA[k] >= 0) { const A = TBA[k], B = TBB[k];
    setAxis(MB, P[3 * r1] - P[3 * l1], P[3 * r1 + 1] - P[3 * l1 + 1], P[3 * r1 + 2] - P[3 * l1 + 2], P[3 * B] - P[3 * A], P[3 * B + 1] - P[3 * A + 1], P[3 * B + 2] - P[3 * A + 2]);
    th = angAbout(MB.e, P[3 * a] - P[3 * A], P[3 * a + 1] - P[3 * A + 1], P[3 * a + 2] - P[3 * A + 2], P[3 * B] - P[3 * a], P[3 * B + 1] - P[3 * a + 1], P[3 * B + 2] - P[3 * a + 2]); }
  if (TSC[k] >= 0) { const C0 = TSC[k], C1 = TBB[k];
    setAxis(MSx, .5 * (P[3 * r1] + P[3 * r2] - P[3 * l1] - P[3 * l2]), .5 * (P[3 * r1 + 1] + P[3 * r2 + 1] - P[3 * l1 + 1] - P[3 * l2 + 1]), .5 * (P[3 * r1 + 2] + P[3 * r2 + 2] - P[3 * l1 + 2] - P[3 * l2 + 2]), tx, ty, tz);
    ga = angAbout(MSx.e, P[3 * C1] - P[3 * C0], P[3 * C1 + 1] - P[3 * C0 + 1], P[3 * C1 + 2] - P[3 * C0 + 2], tx, ty, tz); }
  return [th, ga];
}

/* ------------------------------------------------------------ ray grid (rest geometry) */
function buildGrid(M) {
  const { N, NC, R0, CN } = M;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < N; i++) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], R0[3 * i + q]); hi[q] = Math.max(hi[q], R0[3 * i + q]); }
  lo = lo.map(v => v - .6); hi = hi.map(v => v + .6);
  const G = .5, dim = [0, 1, 2].map(q => Math.max(1, Math.ceil((hi[q] - lo[q]) / G)));
  const cnt = new Int32Array(dim[0] * dim[1] * dim[2] + 1);
  const vox = (c, f) => {
    const b0 = [1e9, 1e9, 1e9], b1 = [-1e9, -1e9, -1e9];
    for (let k = 0; k < 4; k++) { const i = CN[4 * c + k]; for (let q = 0; q < 3; q++) { b0[q] = Math.min(b0[q], R0[3 * i + q]); b1[q] = Math.max(b1[q], R0[3 * i + q]); } }
    const i0 = b0.map((v, q) => Math.max(0, Math.floor((v - .01 - lo[q]) / G))), i1 = b1.map((v, q) => Math.min(dim[q] - 1, Math.floor((v + .01 - lo[q]) / G)));
    for (let z = i0[2]; z <= i1[2]; z++) for (let y = i0[1]; y <= i1[1]; y++) for (let x = i0[0]; x <= i1[0]; x++) f((z * dim[1] + y) * dim[0] + x);
  };
  for (let c = 0; c < NC; c++) vox(c, v => cnt[v + 1]++);
  for (let v = 0; v < cnt.length - 1; v++) cnt[v + 1] += cnt[v];
  const list = new Int32Array(cnt[cnt.length - 1]), fill = cnt.slice();
  for (let c = 0; c < NC; c++) vox(c, v => { list[fill[v]++] = c; });
  M.RG = { lo, G, dim, cnt, list, mark: new Int32Array(NC), stamp: 0 };
}
function rayCell(M, c, o, d) {
  const R0 = M.R0, q = [M.CN[4 * c], M.CN[4 * c + 1], M.CN[4 * c + 2], M.CN[4 * c + 3]];
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
export function firstHit(M, o, d, tmax, skipEroded, skipCell = -1) {
  const g = M.RG, stamp = ++g.stamp;
  const p = [(o[0] - g.lo[0]) / g.G, (o[1] - g.lo[1]) / g.G, (o[2] - g.lo[2]) / g.G];
  let t0 = 0, t1 = tmax;
  for (let q = 0; q < 3; q++) {
    if (Math.abs(d[q]) < 1e-12) { if (p[q] < 0 || p[q] > g.dim[q]) return null; continue; }
    let a = (0 - p[q]) * g.G / d[q], b = (g.dim[q] - p[q]) * g.G / d[q]; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1) return null;
  const s = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
  const ix = [0, 1, 2].map(q => Math.min(g.dim[q] - 1, Math.max(0, Math.floor((s[q] - g.lo[q]) / g.G))));
  const step = d.map(v => v > 0 ? 1 : -1);
  const tMax = [0, 1, 2].map(q => Math.abs(d[q]) < 1e-12 ? Infinity : ((g.lo[q] + (ix[q] + (d[q] > 0 ? 1 : 0)) * g.G) - o[q]) / d[q]);
  const tD = [0, 1, 2].map(q => Math.abs(d[q]) < 1e-12 ? Infinity : g.G / Math.abs(d[q]));
  let best = Infinity, bc = -1;
  for (let it = 0; it < 4000; it++) {
    const v = (ix[2] * g.dim[1] + ix[1]) * g.dim[0] + ix[0];
    for (let k = g.cnt[v]; k < g.cnt[v + 1]; k++) {
      const c = g.list[k]; if (g.mark[c] === stamp) continue; g.mark[c] = stamp;
      if (c === skipCell || (skipEroded && M.CKN[c] === 1)) continue;
      const t = rayCell(M, c, o, d); if (t > 1e-5 && t < best && t <= tmax) { best = t; bc = c; }
    }
    const q = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    if (best <= tMax[q] || tMax[q] > t1) break;
    ix[q] += step[q]; if (ix[q] < 0 || ix[q] >= g.dim[q]) break; tMax[q] += tD[q];
  }
  return bc >= 0 ? [best, bc] : null;
}

/* ------------------------------------------------------------ blast relations */
export const kinneyPs = Z => { const a = Z / 4.5, b = Z / .048, c = Z / .32, d = Z / 1.35; return P0 * 808 * (1 + a * a) / Math.sqrt((1 + b * b) * (1 + c * c) * (1 + d * d)); };
const kinneyIs1 = Z => 6.7 * Math.sqrt(1 + Math.pow(Z / .23, 4)) / (Z * Z * Math.cbrt(1 + Math.pow(Z / 1.55, 3)));
const reflect = Ps => 2 * Ps * (7 * P0 + 4 * Ps) / (7 * P0 + Ps);
export const TA1 = new Float32Array(2048);
(() => { let t = 0; for (let k = 1; k < 2048; k++) { const Z = k * .02; t += .02 / (340 * Math.sqrt(1 + 6 * kinneyPs(Math.max(Z, .053)) / (7 * P0))); TA1[k] = t; } })();
const arrival1 = Z => { const k = Math.min(2046, Z / .02), i = Math.floor(k); return TA1[i] + (TA1[i + 1] - TA1[i]) * (k - i); };
const qsp = (W, Vv) => W > 0 ? 2.25e6 * Math.pow(W / Vv, .72) : 0;
const PUL = { P: 0, I: 0, TD: 0, TA: 0, Ix: 0, tf: 0, t0: 0, g: 1, tc: 0 };
/* water shock of a burst at the waterline (kind 3, wet plating only, depth dc): Cole's similitude, cut off when the
   free surface's relief arrives (bench waterPulse; the GPU applies it) */
const C_WS = 1500;
function waterPulse(s, R, ca, dc) {
  R = Math.max(R, s.rc); const W3 = Math.cbrt(s.W), X = W3 / R;
  PUL.P = (1 + ca) * 52.4e6 * Math.pow(X, 1.13); PUL.TD = .084e-3 * W3 * Math.pow(X, -.23);
  PUL.TA = s.t0 + R / C_WS; PUL.tc = Math.min((Math.sqrt(R * R + 4 * s.ax[0] * Math.max(dc, 0)) - R) / C_WS, 10 * PUL.TD);
  PUL.I = PUL.P * PUL.TD * (1 - Math.exp(-PUL.tc / PUL.TD)); PUL.Ix = 0; PUL.g = s.gain; PUL.t0 = s.t0;
  return PUL;
}
function pulse(s, xc, n, dc = -1) {
  const dx = xc[0] - s.pos[0], dy = xc[1] - s.pos[1], dz = xc[2] - s.pos[2];
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
function pulseAfter(p, te) {
  let fa = 0, fp = 0;
  if (p.P > 0) { const a = Math.min(Math.max(te - p.TA, 0), p.TD); fa = 1 - (a - a * a / (2 * p.TD)) / (p.TD / 2); }
  if (p.Ix > 0) { const x = te - p.t0; fp = x <= p.tf ? 1 : Math.pow(p.tf / x, 4); }
  return [fa, fp];
}

/* ------------------------------------------------------------ the charge (bench detonate) */
/* ch = { C (local), fill (kg TNT-eq of the fill that detonates), Mc (casing kg), mf (fragment kg), Wgas, vapour, frags } */
export function loadShell(M, ch) {
  const sc = M.scene, up = sc.up;
  const fill = Math.max(0, ch.fill || 0), Mc = Math.max(0, ch.Mc || 0);
  const W = fill > 0 ? fill * (Mc > 0 ? .2 + .8 / (1 + Mc / fill) : 1) : 0;
  const Wgas = Math.max(0, ch.Wgas || 0);
  const rc = Math.cbrt(3 * Math.max(fill, .01) / (4 * Math.PI * RHO_TNT));
  const C = ch.C.slice(), cc = sc.spaceAt(C);
  M.GV = sc.spaces.map(s => s.V); M.GP = M.GV.map(() => 0); M.OPEN = new Map(); M.WALLS = new Map();
  // openings: open from the start (no failure pressure), or shut until the pressure across them passes it (M.SHUT)
  M.SHUT = [];
  for (const [a, b, A, pf] of sc.vents || []) if (a !== b) { if (pf > 0) M.SHUT.push([a, b, A, pf]); else { const k = (Math.min(a, b) << 8) | Math.max(a, b); M.OPEN.set(k, (M.OPEN.get(k) || 0) + A); } }
  const prim = { pos: C, W, Pm: W * U_MEAN, t0: 0, space: cc, kind: 0, ax: [0, 0, 0], gain: 1, rc, vis: cc === sc.OUT ? 0 : -1, plane: null, gen: 0, Wsrc: W, key: 'P' };
  const srcs = [];
  if (cc !== sc.OUT && M.GV[cc] < Infinity) {                   // a closed compartment (whatever the spaces' order)
    if (W > 0) srcs.push({ c: cc, Pq: qsp(W, M.GV[cc]), kind: 'det', tau: .002, F: 0 });
    if (Wgas > 0) srcs.push({ c: cc, Pq: qsp(Wgas, M.GV[cc]), kind: 'burn', tau: .12, F: 0 });
    if (ch.vapour > 0) srcs.push({ c: cc, Pq: .8e6 * Math.min(1, ch.vapour / (M.GV[cc] * 1.2 / 15)), kind: 'burn', tau: .06, F: 0 });
  }
  const W3 = Math.cbrt(Math.max(W, 1));
  const s = M.sim = { t: 0, n: 0, W, fill, Mc, Wgas, C, cc, rc, inside: cc !== sc.OUT, prim, SRC: [], holes: [], srcs, WIN: new Float64Array(M.GV.length),
    T1: srcs.length ? .4 : .25, tMin: .01 + .006 * W3, relax: false, alpha: 0, lastSrc: 0, IMPN: [] };
  // line of sight from outside sources: rays on the rest geometry (and the sea image, above the water)
  const { NC, CSP, CSN, CWET, CRC, CNR } = M;
  if (cc === sc.OUT && W > 0) {
    const Cimg = C.slice(); Cimg[up] = 2 * sc.waterline - C[up];
    for (let c = 0; c < NC; c++) {
      if (CSP[c] !== sc.OUT && CSN[c] !== sc.OUT) continue;
      if (CWET[c] >= 0) continue;
      const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
      const outN = CSP[c] === sc.OUT ? nn : mul(nn, -1);
      if (dot(sub(C, xc), outN) > 0) { const d = sub(xc, C), L = len(d); if (!firstHit(M, C, mul(d, 1 / L), L - 1e-3, false, c)) M.CVIS[c] |= 1; }
      if (C[up] > sc.waterline && dot(sub(Cimg, xc), outN) > 0) {
        const d = sub(xc, Cimg), L = len(d), dd = mul(d, 1 / L);
        const tw = (sc.waterline - Cimg[up]) / dd[up], pw = add(Cimg, mul(dd, tw));
        const pw2 = pw.slice(); pw2[up] += .01;
        if (tw > 0 && tw < L && sc.spaceAt(pw2) === sc.OUT && !firstHit(M, pw, dd, L - tw - 1e-3, false, c) && !firstHit(M, C, nrm(sub(pw, C)), len(sub(pw, C)), false)) M.CVIS[c] |= 2;
      }
    }
  }
  // a burst at the waterline also drives a shock into the water: the charge's share below (or within 2 charge radii
  // above) the surface, as an equivalent charge just under it; it loads the wet plating it sees through the water
  // line of sight from an inside charge to its compartment's walls (bench aafedce, AUDIT A7)
  if (cc !== sc.OUT && W > 0) {
    for (let c = 0; c < NC; c++) {
      if (CSP[c] !== cc && CSN[c] !== cc) continue;
      const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], d = sub(xc, C), L = len(d);
      if (L < 1e-6 || !firstHit(M, C, mul(d, 1 / L), L - 1e-3, false, c)) M.CVIS[c] |= 8;
    }
    prim.vis = 3;
  }
  s.water = null;
  if (cc === sc.OUT && W > 0 && sc.waterline > -1e8) {
    const hgt = C[up] - sc.waterline, f = Math.min(1, Math.max(0, .5 - .5 * hgt / (2 * rc)));
    if (f > .01) {
      const Ww = W * f, rw = Math.cbrt(3 * Ww / (4 * Math.PI * RHO_TNT)), ds = Math.max(0, -hgt) + rw, Cw = C.slice(); Cw[up] = sc.waterline - ds;
      for (let c = 0; c < NC; c++) {
        if (CWET[c] < 0 || (CSP[c] !== sc.OUT && CSN[c] !== sc.OUT)) continue;
        const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
        const outN = CSP[c] === sc.OUT ? nn : mul(nn, -1);
        if (dot(sub(Cw, xc), outN) <= 0) continue;
        const d = sub(xc, Cw), L = len(d); if (!firstHit(M, Cw, mul(d, 1 / L), L - 1e-3, false, c)) M.CVIS[c] |= 4;
      }
      s.water = { pos: Cw, W: Ww, Wsrc: Ww, Pm: 0, t0: 0, space: sc.OUT, kind: 3, ax: [ds, 0, 0], gain: 1, rc: rw, vis: 2, plane: null, gen: 0, key: 'W', frac: f };
    }
  }
  s.frags = Mc > 0 && ch.frags !== false && fill > 0 ? makeFrags(M, C, fill, Mc, ch.mf || .03) : null;
  // the scorch the game draws: the fire's reach from the charge, lit where it sees (as the lattice's soot)
  M.SOOT = new Float32Array(M.N);
  const fr = W > 0 ? .5 * 3.86 * Math.pow(W, .32) : .5 * 3.86 * Math.pow(Math.max(Wgas, 1), .32) * .8;
  for (let i = 0; i < M.N; i++) { const R = Math.hypot(M.R0[3 * i] - C[0], M.R0[3 * i + 1] - C[1], M.R0[3 * i + 2] - C[2]); M.SOOT[i] = Math.max(0, 1 - R / (1.25 * fr)); }
  rebuildSources(M, 0);
  return s;
}

function makeFrags(M, C, fill, Mc, mf) {
  const V0 = Math.sqrt(2 * E_G) / Math.sqrt(Mc / fill + .5);
  const nReal = Mc / mf, n = Math.min(4000, Math.max(50, Math.round(nReal))), rep = nReal / n;
  const D = new Float32Array(3 * n), hits = [];
  const gold = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < n; k++) {
    const y = 1 - 2 * (k + .5) / n, rr = Math.sqrt(1 - y * y), th = gold * k;
    const d = [rr * Math.cos(th), y, rr * Math.sin(th)]; D.set(d, 3 * k);
    const list = []; let o = C, tAcc = 0;
    for (let q = 0; q < 8; q++) { const h = firstHit(M, o, d, 80 - tAcc, false, list.length ? list[list.length - 1][1] : -1); if (!h) break;
      tAcc += h[0]; list.push([tAcc, h[1]]); o = add(C, mul(d, tAcc + 1e-4)); }
    hits.push(list);
  }
  const Af = .0045 * Math.pow(mf, 2 / 3);
  return { n, D, hits, V0, mf, rep, Af, kd: 1.2 * 1.2 * Af / (2 * mf), v: new Float64Array(n).fill(V0), next: new Int32Array(n), stop: new Float32Array(n).fill(-1),
    tk: new Float64Array(n), dk: new Float64Array(n), df: Math.cbrt(mf / 7850) };
}

/* sources: the primary, holes (generations 1-2), images across the compartment walls and the sea surface */
export function rebuildSources(M, t) {
  const s = M.sim, sc = M.scene, up = sc.up, list = [];
  const { NC, CER, CSP, CSN, CRC, CNR, CAR, CTE, CVIS, GV, GP } = M;
  if (s.W > 0) list.push(s.prim);
  if (s.water) list.push(s.water);
  const holes = new Map();
  let gen = [s.prim].filter(q => q.W > 0);
  const win = new Float64Array(GV.length);
  for (let g = 1; g <= 2 && gen.length; g++) {
    const next = [];
    for (let c = 0; c < NC; c++) {
      if (M.CKN[c] !== 1) continue;
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
        const kbase = q.key + '>' + far; let hk = null;
        for (const [k, hh] of holes) if (k.startsWith(kbase + '#') && len(sub(mul(hh.cw, 1 / hh.w), xc)) < 3) { hk = k; break; }
        if (!hk) { hk = kbase + '#' + holes.size; holes.set(hk, { space: far, from: q, W: 0, Pm: 0, cw: [0, 0, 0], w: 0, ax: [0, 0, 0], tw: 0, cells: new Set(), gen: g }); }
        const H = holes.get(hk), wt = fE * (fa + fp + 1e-9);
        H.dw = (H.dw || 0) + wt * R; H.Wf = q.kind === 1 ? 4 * q.W : q.W; H.Pmf = q.kind === 1 ? 4 * q.Pm : q.Pm; H.Df0 = q.Df || 0;
        H.W += q.Wsrc * fE * fa; H.Pm += q.Pm * fE * fp; H.w += wt; H.cw = add(H.cw, mul(xc, wt));
        H.ax = add(H.ax, mul(CSN[c] === q.space ? nn : mul(nn, -1), wt)); H.tw += wt * Math.max(CTE[c], p.TA || 0); H.cells.add(c);
        if (q.kind === 0 && q.space === sc.OUT && far !== sc.OUT) win[far] += q.W * fE * fp;
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
  for (let k = 0; k < GV.length; k++) if (win[k] > s.WIN[k] && GV[k] < Infinity) { GP[k] += qsp(win[k], GV[k]) - qsp(s.WIN[k], GV[k]); s.WIN[k] = win[k]; }
  const imgs = [];
  for (const q of list.slice()) {
    if (!(q.W > 0)) continue;
    if (q.space === sc.OUT) {
      if (q.kind === 0 && q.pos[up] > sc.waterline) { const pos = q.pos.slice(); pos[up] = 2 * sc.waterline - q.pos[up]; const pl = [0, 0, 0, sc.waterline]; pl[up] = 1;
        imgs.push({ ...q, pos, kind: 2, Pm: 0, vis: 1, plane: pl, ax: [0, 0, 0], key: q.key + 'sea' }); }
      continue;
    }
    const sp = sc.spaces[q.space]; if (!sp.box) continue;
    const b = sp.box;
    for (let f = 0; f < 6; f++) {
      const ax = f % 3, pv = b[f], nrmv = [0, 0, 0]; nrmv[ax] = 1;
      if (!(Math.abs(pv) < 500)) continue;                               // (an open side of the space: no wall)
      if (Math.abs(q.pos[ax] - pv) < .3) continue;
      const pos = q.pos.slice(); pos[ax] = 2 * pv - pos[ax];
      const gain = 1 - wallTorn(M, q.space, ax, pv);
      if (gain <= .02) continue;
      imgs.push({ ...q, pos, W: q.kind === 1 ? 2 * q.W : q.W, kind: 2, Pm: 0, gain, vis: -1, plane: [...nrmv, pv], key: q.key + 'i' + f });
    }
  }
  imgs.sort((x, y) => y.W * y.gain - x.W * x.gain);
  for (const q of imgs) if (list.length < 32) list.push(q);
  // a source new this sync delivers on its first step the impulse it owed so far (bench 88e784a)
  const seen = s.srcSeen || (s.srcSeen = new Set());
  for (const q of list) { if (!seen.has(q.key)) { q.tAdd = t; seen.add(q.key); } else q.tAdd = 0; }
  s.SRC = list; s.holes = [...holes.values()];
}
function wallTorn(M, sp, ax, pv) {
  const k = sp + '_' + ax + '_' + pv; let w = M.WALLS.get(k);
  if (!w) {
    const cells = [];
    for (let c = 0; c < M.NC; c++) if ((M.CSP[c] === sp || M.CSN[c] === sp) && Math.abs(M.CRC[3 * c + ax] - pv) < .25 * M.S + .02 && Math.abs(M.CNR[3 * c + ax]) > .9) cells.push(c);
    const b = M.scene.spaces[sp].box, o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    w = { cells, area: Math.max(1, (b[o1 + 3] - b[o1]) * (b[o2 + 3] - b[o2])) }; M.WALLS.set(k, w);
  }
  let torn = 0; for (const c of w.cells) if (M.CKN[c] === 1) torn += M.CAR[c];
  return Math.min(1, torn / w.area);
}

/* ------------------------------------------------------------ gas, openings, fragments, the end (bench) */
export function gasStep(M, h) {
  const { GP, GV } = M;
  // a shut opening that the pressure across it has passed: it lets go (game side; the bench's vents are always open)
  if (M.SHUT && M.SHUT.length) for (let i = M.SHUT.length - 1; i >= 0; i--) {
    const [a, b, A, pf] = M.SHUT[i];
    if (Math.abs(GP[a] - GP[b]) >= pf) { const k = (Math.min(a, b) << 8) | Math.max(a, b); M.OPEN.set(k, (M.OPEN.get(k) || 0) + A); M.SHUT.splice(i, 1); (M.ventLog || (M.ventLog = [])).push([a, b, A, +(M.sim.t * 1000).toFixed(2)]); }
  }
  for (const [k, A] of M.OPEN) {
    const a = k >> 8, b = k & 255;
    const dp = GP[a] - GP[b]; if (dp > -1 && dp < 1) continue;
    const hi = dp > 0 ? a : b, lo = dp > 0 ? b : a, ad = Math.abs(dp);
    if (GV[hi] === Infinity) continue;
    const Pabs = GP[hi] + P0, rho = 1.2 * Pabs / P0 * .2;
    const Q = .6 * A * Math.sqrt(2 * ad / rho);
    let dP = Pabs * Q * h / GV[hi];
    const cap = GV[lo] < Infinity ? ad * GV[lo] / (GV[hi] + GV[lo]) : ad;
    if (dP > cap) dP = cap;
    GP[hi] -= dP; if (GV[lo] < Infinity) GP[lo] += dP * GV[hi] / GV[lo];
  }
}
export function openCell(M, c, t) {
  if (M.CKN[c] === 1) return; M.CKN[c] = 1; if (!M.CER[c]) M.CER[c] = 2; M.sim.cellsTorn = (M.sim.cellsTorn || 0) + 1;
  if (M.CTE[c] < 0) M.CTE[c] = t;
  const a = Math.min(M.CSP[c], M.CSN[c]), b = Math.max(M.CSP[c], M.CSN[c]), k = (a << 8) | b;
  if (a !== b) M.OPEN.set(k, (M.OPEN.get(k) || 0) + M.CAR[c]);
  for (let k2 = 0; k2 < 4; k2++) { const i = M.CN[4 * c + k2]; if (M.TBRK[i] < 0) M.TBRK[i] = t; }
}
export function fragStep(M, t) {
  const f = M.sim.frags; if (!f) return false;
  const IMPN = M.sim.IMPN;
  let dmg = false;
  for (let k = 0; k < f.n; k++) {
    if (f.stop[k] >= 0) continue;
    const L = f.hits[k];
    while (f.next[k] < L.length) {
      const [dist, c] = L[f.next[k]], ds = dist - f.dk[k], v0 = f.v[k];
      const ta = f.tk[k] + (Math.exp(f.kd * ds) - 1) / (f.kd * v0);
      if (ta > t) break;
      const v = v0 * Math.exp(-f.kd * ds);
      f.tk[k] = ta; f.dk[k] = dist; f.next[k]++; f.v[k] = v;
      if (M.CKN[c] === 1) continue;
      const d = [f.D[3 * k], f.D[3 * k + 1], f.D[3 * k + 2]], nn = [M.CNR[3 * c], M.CNR[3 * c + 1], M.CNR[3 * c + 2]];
      const cob = Math.max(.1, Math.abs(dot(d, nn))), h = M.CH[c] / cob, m = MATS[M.CMAT[c]];
      const mp = m.rho * f.df * f.df * h, Wp = 2 * m.sy / Math.sqrt(3) * 4 * f.df * h * h / 2;
      const vbl = Math.sqrt(2 * Wp * (f.mf + mp)) / f.mf;
      const vr = v > vbl ? f.mf / (f.mf + mp) * Math.sqrt(v * v - vbl * vbl) : 0;
      const J = (f.mf * v - (f.mf + mp) * vr) * f.rep;
      for (let z = 0; z < 4; z++) IMPN.push(M.CN[4 * c + z], d[0] * J / 4, d[1] * J / 4, d[2] * J / 4);
      if (vr > 0) { M.CFD[c] = Math.min(1, M.CFD[c] + 2 * f.rep * (1.1 * f.df) ** 2 / M.CAR[c]); dmg = true; f.v[k] = vr; }
      else { f.stop[k] = dist; break; }
    }
    if (f.next[k] >= L.length && f.stop[k] < 0) f.stop[k] = 1e9;
  }
  return dmg;
}
/* sources ramping, venting, holes rebuilt when cells opened, fragments; -> { dmg } */
export function commonSync(M, t, torn, hs) {
  const s = M.sim;
  for (const q of s.srcs) { const Fn = q.kind === 'det' ? Math.min(1, t / q.tau) : 1 - Math.exp(-t / q.tau); M.GP[q.c] += q.Pq * (Fn - q.F); q.F = Fn; }
  if (torn && s.W > 0) { rebuildSources(M, t); s.lastSrc = t; }
  gasStep(M, hs);
  return fragStep(M, t);
}
/* nodes still joined (through intact cells and members) to the fixed structure; flying debris is not. The end-of-run
   test and the "quiet" clock look at these only (bench attachedNodes) */
export function attachedNodes(M, U) {
  const N = M.N, par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const fd = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, un = (a, b) => { a = fd(a); b = fd(b); if (a !== b) par[a] = b; };
  for (let c = 0; c < M.NC; c++) if (M.CKN[c] !== 1) { const a = M.CN[4 * c]; for (let k = 1; k < 4; k++) un(a, M.CN[4 * c + k]); }
  // (bench 882692c: a member stretched past 1.5 its length no longer holds, U the displacements read back)
  const R0 = M.R0;
  for (let k = 0; k < M.NT; k++) { if (M.TFL[k]) continue; const a = M.TA[k], b = M.TB[k];
    if (U) { const d = Math.hypot(R0[3 * a] + U[3 * a] - R0[3 * b] - U[3 * b], R0[3 * a + 1] + U[3 * a + 1] - R0[3 * b + 1] - U[3 * b + 1], R0[3 * a + 2] + U[3 * a + 2] - R0[3 * b + 2] - U[3 * b + 2]); if (d > 1.5 * M.TL0[k]) continue; }
    un(a, b); }
  const root = new Uint8Array(N); for (let i = 0; i < N; i++) if (M.AK[i] > 0 || M.WINV[i] === 0) root[fd(i)] = 1;
  const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = root[fd(i)];
  return a;
}
export const attachedCell = (M, c) => { const A = M.ATT; return !A || A[M.CN[4 * c]] || A[M.CN[4 * c + 1]] || A[M.CN[4 * c + 2]] || A[M.CN[4 * c + 3]]; };
/* the loads over and the structure's kinetic energy down to 5 % of its peak: settle the remaining elastic ringing with
   strong damping (dynamic relaxation) to read the permanent set (bench checkEnd; X, V read back by the caller) */
export function checkEnd(M) {
  const s = M.sim;
  if (!M.ATT || s.n - (M.attN || 0) >= 1000) { M.ATT = attachedNodes(M, M.U); M.attN = s.n; }
  const ATT = M.ATT;
  let v2 = 0, ke = 0; for (let i = 0; i < M.N; i++) { if (M.FREE[i] || !ATT[i]) continue; const q = M.V[3 * i] ** 2 + M.V[3 * i + 1] ** 2 + M.V[3 * i + 2] ** 2; ke += .5 * M.M[i] * q; if (q > v2) v2 = q; }
  let gas = 0; for (let k = 0; k < M.GV.length; k++) if (M.GV[k] < Infinity) gas = Math.max(gas, Math.abs(M.GP[k]));
  let quiet = s.srcs.every(q => q.F > .98) && s.t - s.lastSrc > .005;
  // (bench 882692c: the run ends once the gas stops rising and tearing is down to a trickle: the structure has taken
  // what it will take)
  if (!s.gref || s.t - s.gref.t >= .01) { const g = M.GP.slice(), tc = s.cellsTorn || 0;
    s.steady = !!s.gref && tc - s.gref.tc <= .03 * tc && g.every((v, k) => !(M.GV[k] < Infinity) || v <= s.gref.g[k] * 1.02 + 2e3); s.gref = { t: s.t, g, tc }; }
  const gasDone = gas < 2e4 || s.steady;
  if (s.steady && s.srcs.every(q => q.F > .98)) quiet = true;
  s.kepeak = Math.max(s.kepeak || 0, ke); s.keLast = ke; s.gasLast = gas; s.quietLast = quiet;
  if (!s.relax && quiet && gasDone && s.t > s.tMin && (ke < .05 * s.kepeak || s.t > s.tMin + .1)) { s.relax = true; s.tRelax = s.t; }
  // (the game's shorter horizon, spec.fastEnd: once the gas is out and the burning nearly done (and not before 0.12 s),
  // relax: what still tears after that is plating going on eroding at the fringes of what already went; the bench waits
  // for its kinetic-energy criterion, which a patch with loose plating rarely meets before 0.4 s)
  if (!s.relax && M.fastEnd && gas < 2e4 && s.t > Math.max(s.tMin + .05, .12) && s.srcs.every(q => q.F > .85)) { s.relax = true; s.tRelax = s.t; }
  if (s.relax && (v2 < .25 || s.t - s.tRelax > .025)) s.T1 = s.t;
  s.vmax = Math.sqrt(v2);
}
/* (bench 03813d8) plating hanging on by corner nodes only (cells meeting another piece at a corner: a pin of zero width
   it swings on, tearing what it hits) is let go: its cells erode as a piece torn off would. -> cells released (CFD = 1) */
export function detachPinned(M) {
  const s = M.sim; if (s.pinAt === s.cellsTorn) return 0; s.pinAt = s.cellsTorn;
  const NC = M.NC, par = M.PINUF && M.PINUF.length === NC ? M.PINUF : (M.PINUF = new Int32Array(NC));
  for (let c = 0; c < NC; c++) par[c] = c;
  const fd = c => { while (par[c] !== c) { par[c] = par[par[c]]; c = par[c]; } return c; };
  const ok = c => M.CKN[c] !== 1 && !M.CER[c] && M.CFD[c] < 1;
  for (let h = 0; h < M.NH; h++) { const a = M.HC[2 * h], b = M.HC[2 * h + 1]; if (ok(a) && ok(b)) { const ra = fd(a), rb = fd(b); if (ra !== rb) par[ra] = rb; } }
  const root = new Uint8Array(NC), comps = new Map();
  for (let c = 0; c < NC; c++) { if (!ok(c)) continue; const r = fd(c);
    for (let k = 0; k < 4; k++) { const i = M.CN[4 * c + k]; if (M.AK[i] > 0 || M.WINV[i] === 0) root[r] = 1;
      let l = comps.get(i); if (!l) comps.set(i, l = []); if (!l.includes(r)) l.push(r); } }
  const adj = new Map(); for (const l of comps.values()) if (l.length > 1) for (const x of l) for (const y of l) if (x !== y) { let a = adj.get(x); if (!a) adj.set(x, a = new Set()); a.add(y); }
  const pinned = new Uint8Array(NC), seen = new Uint8Array(NC), q = [];
  for (const [x] of adj) if (root[x]) { seen[x] = 1; q.push(x); }
  while (q.length) { const x = q.pop(); for (const y of adj.get(x) || []) if (!seen[y]) { seen[y] = 1; if (!root[y]) pinned[y] = 1; q.push(y); } }
  let n = 0; for (let c = 0; c < NC; c++) if (ok(c) && pinned[fd(c)]) { M.CFD[c] = 1; n++; }
  if (n) s.detached = (s.detached || 0) + n;
  return n;
}
/* (bench 03813d8) plating blown loose (no node joined to the structure) leaves its compartment's wall: its area opens
   between the two spaces as a vent and the gas no longer pushes it (CVIS bit 16). -> the cells newly loose */
export function looseCells(M) {
  const s = M.sim, A = M.ATT; if (!A || s.looseAt === A) return []; s.looseAt = A;
  const l = [];
  for (let c = 0; c < M.NC; c++) { if (M.CVIS[c] & 16 || M.CKN[c] === 1) continue;
    if (A[M.CN[4 * c]] || A[M.CN[4 * c + 1]] || A[M.CN[4 * c + 2]] || A[M.CN[4 * c + 3]]) continue;
    M.CVIS[c] |= 16; l.push(c);
    const a = Math.min(M.CSP[c], M.CSN[c]), b = Math.max(M.CSP[c], M.CSN[c]); if (a !== b) M.OPEN.set((a << 8) | b, (M.OPEN.get((a << 8) | b) || 0) + M.CAR[c]); }
  if (l.length) s.loose = (s.loose || 0) + l.length;
  return l;
}
/* pieces no longer connected to the rest of the ship are debris (bench settle) */
export function markDebris(M) {
  const N = M.N, par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const fd = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, un = (a, b) => { a = fd(a); b = fd(b); if (a !== b) par[a] = b; };
  for (let c = 0; c < M.NC; c++) if (!M.CER[c]) { const a = M.CN[4 * c]; for (let k = 1; k < 4; k++) un(a, M.CN[4 * c + k]); }
  for (let k = 0; k < M.NT; k++) if (!M.TFL[k]) un(M.TA[k], M.TB[k]);
  const root = new Uint8Array(N); for (let i = 0; i < N; i++) if (M.AK[i] > 0) root[fd(i)] = 1;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!root[fd(i)]) out[i] = 1;
  return out;
}
/* the GPU solver's view of the model (bench gpuModel) */
export function gpuModel(M) {
  return { N: M.N, NC: M.NC, NH: M.NH, NT: M.NT, R0: M.R0, M: M.M, WINV: M.WINV, AK: M.AK, AF: M.AF, AC: M.AC, CN: M.CN, CH: M.CH, CMAT: M.CMAT, CEF: M.CEF,
    CSP: M.CSP, CSN: M.CSN, CWET: M.CWET, CAR: M.CAR, CTR: M.CTR, CHG: M.CHG, CDB: M.CDB, CRC: M.CRC, CVIS: () => M.CVIS,
    HN: M.HN, HC: M.HC, HKP: M.HKP, HMP: M.HMP, HKS: M.HKS, HMS: M.HMS, HT0: M.HT0, HDB: M.HDB, HTR: M.HTR, HHP: M.HHP, HMAT: M.HMAT, HLN: M.HLN, HTL0: M.HTL0, TBA: M.TBA, TBB: M.TBB, TSC: M.TSC, TCL: M.TCL, TCL2: M.TCL2, TQN: M.TQN, TPRV: M.TPRV, TNXT: M.TNXT,
    TKB: M.TKB, TQB: M.TQB, TB0: M.TB0, TKS: M.TKS, TQS: M.TQS, TS0: M.TS0, TMM: M.TMM, TKC: M.TKC, CKC: M.CKC, KCE: KC_EPS, JMN: JMIN, NLH: M.NLH, NLE: M.NLE,
    TA: M.TA, TB: M.TB, TL0: M.TL0, TAR: M.TAR, TMAT: M.TMAT, TEF: M.TEF, TFIB: M.TFIB, THG: M.THG, NCC: M.NCC, PAN: M.PAN, CMAP: M.CMAP, MATS, TA1, S: M.S,
    OUT: () => M.scene.OUT, csf, nspace: () => M.GV.length, BETA: () => M.BETA, U_MAX, RHO_W, C_W, P0, G, K_SHEAR, UP: M.up };
}
