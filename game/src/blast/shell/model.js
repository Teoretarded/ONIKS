/* The blast bench's shell model (game/concepts/blast/blast.js at commit ca26a00), ported for the game: the same
   physics, from a scene built out of a patch spec (blast/spec.js) instead of the bench's test box. No DOM, no GL.

   Structure: every quad cell is 4 crossed CST membranes (corotational, plane-stress J2 + linear hardening + Cowper-
   Symonds with strain-dependent constants), dihedral hinges on every shared edge (plate bending, elastic-plastic,
   membrane interaction), stiffeners as axial members with their bending as a line-angle term on their own nodes, GL
   mesh-regularised ductile erosion, elastic-plastic anchors with Lysmer-Kuhlemeyer dashpots where the ship continues,
   water backing below the waterline; nodal stable step with bounded selective mass scaling. Loads: air shock (Kinney-
   Graham, reflection, cos^2, arrival), near-field products impulse, hole and image secondary sources (openings cannot
   focus: capped by the feeding source), compartment gas with venting, products let in through outside openings,
   casing fragments. See the bench's header and BENCH.md for the references.

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
/* the bench's rectPiece, with the stiffener lines at the ship's frame phase (spacing `every` from `phase`) */
function rectPiece(P, S) {
  const Lu = len(sub(P.p10, P.p00)), Lv = len(sub(P.p01, P.p00));
  const nu = Math.max(1, Math.round(Lu / S)), nv = Math.max(1, Math.round(Lv / S));
  const Gd = new Float64Array(3 * (nu + 1) * (nv + 1));
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, o = 3 * (j * (nu + 1) + i);
    for (let q = 0; q < 3; q++) Gd[o + q] = P.p00[q] * (1 - u) * (1 - v) + P.p10[q] * u * (1 - v) + P.p01[q] * (1 - u) * v + P.p11[q] * u * v;
  }
  const lines = [];
  for (const s of P.stiff || []) {
    const Lx = s.along === 'u' ? Lv : Lu, nn = s.along === 'u' ? nv : nu;
    const ph = ((s.phase || 0) % s.every + s.every) % s.every;
    for (let x = ph; x < Lx - 1e-6; x += s.every) { const g = Math.round(x / Lx * nn); if (g > 0 && g < nn && !lines.some(l => l.along === s.along && l.g === g)) lines.push({ along: s.along, g, sec: s.sec, spacing: s.every }); }
  }
  return { name: P.name, kind: P.kind, nu, nv, G: Gd, mask: null, h: P.h, mat: P.mat, n: nrm(cross(sub(P.p10, P.p00), sub(P.p01, P.p00))), sides: null, wet: null,
    lines, open: P.open || [0, 0, 0, 0], planar: true, imperfSign: P.imperfSign, skin: P.skin, ax: P.ax, val: P.val, u0: P.u0, v0: P.v0 };
}
/* spec -> { pieces, spaces, OUT, spaceAt, up, waterline }; each piece keeps its plate's grid order (i along u, j along v)
   so the skins map one to one */
export function sceneOf(spec, S) {
  const B = spec.box, e = S * .25, sn = v => Math.round(v / S) * S;
  const plates = spec.plates.slice(0, 6);
  const faceFree = [0, 1, 2, 3, 4, 5].map(f => plates.some(p => p.ax === f % 3 && Math.abs(sn(p.val) - B[f]) < e));
  const onFixed = (axis, v) => (Math.abs(v - B[axis]) < e && !faceFree[axis]) || (Math.abs(v - B[axis + 3]) < e && !faceFree[axis + 3]);
  const deckPatch = spec.kind === 'deck';
  const pieces = plates.map((pl, pi) => {
    const ax = pl.ax, [ua, va] = AXES[ax];
    const o = [0, 0, 0]; o[ax] = sn(pl.val); o[ua] = sn(pl.u0); o[va] = sn(pl.v0);
    const U = [0, 0, 0], V = [0, 0, 0]; U[ua] = sn(pl.u1) - sn(pl.u0); V[va] = sn(pl.v1) - sn(pl.v0);
    const mat = MATI[pl.mat] !== undefined ? MATI[pl.mat] : MATI.mild;
    // stiffeners: along u at the longitudinal spacing (lines of constant v), along v at the frame spacing (constant u),
    // sections by kind (side 0, weather deck 1, inner deck 2, bulkhead 3) scaled by the class's tie factor
    const kind = pl.skin && pi === 0 ? (deckPatch ? 1 : 0) : pl.skin ? 1 : ax === 0 ? 3 : 2;
    const secU = kind === 0 ? SEC.sideLong : kind === 1 ? SEC.deckLong : kind === 3 ? SEC.bhdStiff : SEC.d2Long;
    const secV = kind === 0 ? SEC.sideFrame : kind === 1 ? SEC.deckBeam : kind === 3 ? SEC.bhdStiff : SEC.d2Beam;
    const scale = s => { const k = Math.sqrt(pl.tie || 1); return k === 1 ? s : { hw: s.hw * k, tw: s.tw * k, bf: s.bf * k, tf: s.tf * k }; };
    const stiff = [];
    if (pl.fv > 0) stiff.push({ along: 'u', every: pl.fv, phase: sn(pl.pv || 0) - o[va], sec: scale(secU) });
    if (pl.fu > 0) stiff.push({ along: 'v', every: pl.fu, phase: sn(pl.pu || 0) - o[ua], sec: scale(secV) });
    const open = pl.open || [onFixed(ua, o[ua]), onFixed(ua, o[ua] + U[ua]), onFixed(va, o[va]), onFixed(va, o[va] + V[va])].map(b => b ? 1 : 0);
    // (the bench's decks and bulkheads face the other way: their imperfection dimples as the bench's do)
    return rectPiece({ imperfSign: ax === 2 ? 1 : -1, name: 'plate ' + pi, kind: pl.kind !== undefined ? pl.kind : kind, p00: o, p10: add(o, U), p01: add(o, V), p11: add(add(o, U), V),
      h: pl.h, mat, stiff, open, skin: !!pl.skin, ax, val: o[ax], u0: o[ua], v0: o[va] }, S);
  });
  const comps = (spec.comps || []).slice(0, 16), OUT = comps.length;
  const spaces = comps.map((c, k) => ({ name: 'space ' + k, box: c.img || c.b, V: c.V }));
  spaces.push({ name: 'outside', box: null, V: Infinity });
  const spaceAt = p => { for (let k = 0; k < comps.length; k++) { const b = comps[k].b; if (p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5]) return k; } return OUT; };
  const up = deckPatch ? 2 : 1;
  return { pieces, spaces, OUT, spaceAt, up, waterline: spec.wlLocal !== undefined ? spec.wlLocal : -1e9, snap: false, vents: spec.vents || [], isCut: null };
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
      const b = Math.max(S, Math.min((ub - ua) * du, (vb - va) * dv)), beta = b / pc.h * Math.sqrt(m.sy / m.E), w0 = Math.min(.1 * beta * beta * pc.h, b / 200);
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
      at: Int32Array.from(ids, i => nid(i)), skin: pc.skin, ax: pc.ax, val: pc.val, u0: pc.u0, v0: pc.v0, h: pc.h, mat: pc.mat });
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
      const flush = () => { if (trs.length) lineRec.push({ nodes: run, trusses: trs, sec, mat: m, h: pc.h, spacing: ln.spacing, n: pc.n }); run = []; trs = []; };
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
  M.CVIS = new Uint32Array(NC); M.CEP = new Float64Array(16 * NC); M.CER = new Uint8Array(NC); M.CTE = new Float64Array(NC).fill(-1);
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
    CEF[c] = glf(MATS[CMAT[c]], CH[c], Math.sqrt(CAR[c]));
    CDB[c] = Math.sqrt(CAR[c]);
    for (const i of q) M.NCON[i]++;
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
  const nodeEdges = new Map();
  for (const ek of hOfEdge.keys()) { const a = Math.floor(ek / 4194304), b = ek % 4194304; for (const q of [a, b]) { let l = nodeEdges.get(q); if (!l) nodeEdges.set(q, l = []); l.push(ek); } }
  const tH = new Map();
  for (const lr of lineRec) {
    const { sec, mat: m, h, spacing } = lr;
    const D = m.E * h ** 3 / (12 * (1 - m.nu * m.nu));
    const EIs = Math.max(0, m.E * sec.I - D * spacing), Mps = Math.max(0, m.sy * sec.Zp - m.sy * h * h / 4 * spacing);
    for (let k = 1; k + 1 < lr.nodes.length; k++) {
      const p = lr.nodes[k], a = lr.nodes[k - 1], b = lr.nodes[k + 1];
      const t = nrm([R0[3 * b] - R0[3 * a], R0[3 * b + 1] - R0[3 * a + 1], R0[3 * b + 2] - R0[3 * a + 2]]);
      const hs = [];
      for (const ek of nodeEdges.get(p) || []) {
        const e0 = Math.floor(ek / 4194304), e1 = ek % 4194304, q = e0 === p ? e1 : e0;
        const ed = nrm([R0[3 * q] - R0[3 * p], R0[3 * q + 1] - R0[3 * p + 1], R0[3 * q + 2] - R0[3 * p + 2]]);
        if (Math.abs(dot(ed, t)) > .3) continue;
        for (const hi of hOfEdge.get(ek)) { const c1 = HC[2 * hi], c2 = HC[2 * hi + 1];
          if (Math.abs(HT0[hi]) < .35 && Math.abs(dot([CNR[3 * c1], CNR[3 * c1 + 1], CNR[3 * c1 + 2]], lr.n)) > .9 && Math.abs(dot([CNR[3 * c2], CNR[3 * c2 + 1], CNR[3 * c2 + 2]], lr.n)) > .9) hs.push(hi); }
      }
      for (const hi of hs) {
        const share = 1 / hs.length;
        const nodes = [0, 1, 2, 3, 4, 5].map(z => HN[6 * hi + z]), rp = nodes.indexOf(p), ra = nodes.indexOf(a), rb = nodes.indexOf(b);
        if (rp < 0 || ra < 0 || rb < 0 || HLN[hi] >= 0) continue;
        HKS[hi] = share * EIs / (.5 * (TL0[lr.trusses[k - 1]] + TL0[lr.trusses[k]])); HMS[hi] = share * Mps;
        HTR[2 * hi] = lr.trusses[k - 1]; HTR[2 * hi + 1] = lr.trusses[k]; HLN[hi] = rp + 6 * ra + 36 * rb;
        { const E = sub([R0[3 * HN[6 * hi + 1]], R0[3 * HN[6 * hi + 1] + 1], R0[3 * HN[6 * hi + 1] + 2]], [R0[3 * HN[6 * hi]], R0[3 * HN[6 * hi] + 1], R0[3 * HN[6 * hi] + 2]]), eh = nrm(E);
          const P = z => [R0[3 * z], R0[3 * z + 1], R0[3 * z + 2]], pr = v => sub(v, mul(eh, dot(v, eh)));
          const e1 = pr(sub(P(p), P(a))), e2 = pr(sub(P(b), P(p))); HTL0[hi] = Math.atan2(dot(cross(e1, e2), eh), dot(e1, e2)); }
        for (const tt of [lr.trusses[k - 1], lr.trusses[k]]) { let l = tH.get(tt); if (!l) tH.set(tt, l = []); if (!l.includes(hi)) l.push(hi); }
      }
    }
  }
  for (const [t, l] of tH) for (let k = 0; k < Math.min(4, l.length); k++) THG[4 * t + k] = l[k];
  // ---- stable step, node by node (Gershgorin bound); the few far stiffer nodes get extra mass (bounded selective
  // mass scaling: the added share is reported)
  const kn = new Float64Array(N), Mm = M.M;
  for (let c = 0; c < NC; c++) { const m = MATS[CMAT[c]], Ep = m.E / (1 - m.nu * m.nu);
    for (let t = 0; t < 4; t++) { const L12 = CTR[12 * c + 3 * t], px = CTR[12 * c + 3 * t + 1], py = CTR[12 * c + 3 * t + 2], A = .5 * L12 * py;
      const amin = 2 * A / Math.max(L12, Math.hypot(px, py), Math.hypot(px - L12, py)), k = Ep * CH[c] / 2 * A / (amin * amin);
      for (const z of TRI[t]) kn[CN[4 * c + z]] += k; } }
  for (let t = 0; t < NT; t++) { const k = MATS[TMAT[t]].E * TAR[t] / TL0[t]; kn[TA[t]] += k; kn[TB[t]] += k; }
  for (let k = 0; k < NH; k++) { const kk = HKP[k] / (HDB[k] * HDB[k]); for (let z = 0; z < 6; z++) kn[HN[6 * k + z]] += z < 2 ? kk : kk / 4;
    if (HLN[k] >= 0) { const L = TL0[HTR[2 * k]], ks = HKS[k] / (L * L), nodes = [0, 1, 2, 3, 4, 5].map(z => HN[6 * k + z]);
      kn[nodes[HLN[k] % 6]] += 4 * ks; kn[nodes[Math.floor(HLN[k] / 6) % 6]] += ks; kn[nodes[Math.floor(HLN[k] / 36)]] += ks; } }
  for (let i = 0; i < N; i++) kn[i] += M.AK[i];
  const dti = []; for (let i = 0; i < N; i++) if (kn[i] > 0 && Mm[i] > 0 && WINV[i] > 0) dti.push(Math.sqrt(Mm[i] / kn[i]));
  dti.sort((a, b) => a - b);
  const dtT = dti[Math.min(dti.length - 1, Math.floor(dti.length * .002))];
  let added = 0, total = 0;
  for (let i = 0; i < N; i++) { total += Mm[i]; const need = kn[i] * dtT * dtT; if (Mm[i] > 0 && WINV[i] > 0 && need > Mm[i]) { added += need - Mm[i]; Mm[i] = need; WINV[i] = 1 / need; } }
  M.massAdded = added / total;
  M.dt = .75 * dtT; M.BETA = .033 * M.dt;
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
      if (c === skipCell || (skipEroded && M.CER[c])) continue;
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
const PUL = { P: 0, I: 0, TD: 0, TA: 0, Ix: 0, tf: 0, t0: 0, g: 1 };
function pulse(s, xc, n) {
  const dx = xc[0] - s.pos[0], dy = xc[1] - s.pos[1], dz = xc[2] - s.pos[2];
  let R = Math.hypot(dx, dy, dz); if (R < 1e-6) R = 1e-6;
  const ca = Math.abs(dx * n[0] + dy * n[1] + dz * n[2]) / R, c2 = ca * ca;
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
  for (const [a, b, A] of sc.vents || []) if (a !== b) { const k = (Math.min(a, b) << 8) | Math.max(a, b); M.OPEN.set(k, (M.OPEN.get(k) || 0) + A); }
  const prim = { pos: C, W, Pm: W * U_MEAN, t0: 0, space: cc, kind: 0, ax: [0, 0, 0], gain: 1, rc, vis: cc === sc.OUT ? 0 : -1, plane: null, gen: 0, Wsrc: W, key: 'P' };
  const srcs = [];
  if (cc < sc.OUT) {
    if (W > 0) srcs.push({ c: cc, Pq: qsp(W, M.GV[cc]), kind: 'det', tau: .002, F: 0 });
    if (Wgas > 0) srcs.push({ c: cc, Pq: qsp(Wgas, M.GV[cc]), kind: 'burn', tau: .12, F: 0 });
    if (ch.vapour > 0) srcs.push({ c: cc, Pq: .8e6 * Math.min(1, ch.vapour / (M.GV[cc] * 1.2 / 15)), kind: 'burn', tau: .06, F: 0 });
  }
  const W3 = Math.cbrt(Math.max(W, 1));
  const s = M.sim = { t: 0, n: 0, W, fill, Mc, Wgas, C, cc, rc, inside: cc < sc.OUT, prim, SRC: [], holes: [], srcs, WIN: new Float64Array(M.GV.length),
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
  const holes = new Map();
  let gen = [s.prim].filter(q => q.W > 0);
  const win = new Float64Array(GV.length);
  for (let g = 1; g <= 2 && gen.length; g++) {
    const next = [];
    for (let c = 0; c < NC; c++) {
      if (!CER[c]) continue;
      const xc = [CRC[3 * c], CRC[3 * c + 1], CRC[3 * c + 2]], nn = [CNR[3 * c], CNR[3 * c + 1], CNR[3 * c + 2]];
      for (const q of gen) {
        let far;
        if (CSN[c] === q.space) far = CSP[c]; else if (CSP[c] === q.space) far = CSN[c]; else continue;
        if (q.vis >= 0 && !(CVIS[c] & 1)) continue;
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
  let torn = 0; for (const c of w.cells) if (M.CER[c]) torn += M.CAR[c];
  return Math.min(1, torn / w.area);
}

/* ------------------------------------------------------------ gas, openings, fragments, the end (bench) */
export function gasStep(M, h) {
  const { GP, GV } = M;
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
  if (M.CER[c] === 2) return; M.CER[c] = 2;
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
      if (M.CER[c]) continue;
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
/* the loads over and the structure's kinetic energy down to 5 % of its peak: settle the remaining elastic ringing with
   strong damping (dynamic relaxation) to read the permanent set (bench checkEnd; X, V read back by the caller) */
export function checkEnd(M) {
  const s = M.sim;
  let v2 = 0, ke = 0; for (let i = 0; i < M.N; i++) { if (M.FREE[i]) continue; const q = M.V[3 * i] ** 2 + M.V[3 * i + 1] ** 2 + M.V[3 * i + 2] ** 2; ke += .5 * M.M[i] * q; if (q > v2) v2 = q; }
  let gas = 0; for (let k = 0; k < M.GV.length; k++) if (M.GV[k] < Infinity) gas = Math.max(gas, Math.abs(M.GP[k]));
  const quiet = s.srcs.every(q => q.F > .98) && s.t - s.lastSrc > .005;
  s.kepeak = Math.max(s.kepeak || 0, ke);
  if (!s.relax && quiet && gas < 2e4 && s.t > s.tMin && (ke < .05 * s.kepeak || s.t > s.tMin + .1)) { s.relax = true; s.tRelax = s.t; }
  if (s.relax && (v2 < .25 || s.t - s.tRelax > .025)) s.T1 = s.t;
  s.vmax = Math.sqrt(v2);
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
    HN: M.HN, HC: M.HC, HKP: M.HKP, HMP: M.HMP, HKS: M.HKS, HMS: M.HMS, HT0: M.HT0, HDB: M.HDB, HTR: M.HTR, HHP: M.HHP, HMAT: M.HMAT, HLN: M.HLN, HTL0: M.HTL0,
    TA: M.TA, TB: M.TB, TL0: M.TL0, TAR: M.TAR, TMAT: M.TMAT, TEF: M.TEF, TFIB: M.TFIB, THG: M.THG, NCC: M.NCC, PAN: M.PAN, CMAP: M.CMAP, MATS, TA1, S: M.S,
    OUT: () => M.scene.OUT, csf, nspace: () => M.GV.length, BETA: () => M.BETA, U_MAX, RHO_W, C_W, P0, G, K_SHEAR, UP: M.up };
}
