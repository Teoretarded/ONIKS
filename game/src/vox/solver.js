/* Voxel ships (prototype): a hit solved on the voxel lattice (vox/build.js). No DOM, no GL: runs in the worker.

   One structure for everything: every cell is a node (its plating's mass), joined to the cells round it by bonds
   (membrane: elastic-plastic, they tear past the steel's failure strain) and, along a plate, by bending triplets (a
   plastic hinge: a dent or a petal keeps its shape). Nothing is ever deleted: a node is attached to the ship, part of a
   loose piece (a body: falls, lands, sinks) or a single fragment; so plating cannot vanish, a piece cannot hang in the
   air, and a load reaches only what it can see.

   The hit (hit(o)):
     region     the cells within R = clamp(3 + 1.6 W^1/3, 4, 14) m of the charge are free; those just outside are anchors
                (the rest of the ship holds them)
     the round  its body punches through what it passes before the fuze (a hole of its own diameter)
     shock      Kinney-Graham at each free node that the charge can see (a ray through the lattice: plating in between
                shields it), reflected by the angle, at its arrival time, as an impulse on the node's plating
     gas        a charge inside the hull fills its space (data/ship_layouts.js) with the quasi-static pressure: every wall
                node of that space pushed outward until the pressure vents through what tore
     fragments  the casing as rays: the first plating each meets is pocked
   Phase A (the structure, ~30-60 ms): explicit steps of ~25-35 us (selective mass scaling bounded to keep the step);
   phase B (the pieces, to tEnd): what is not joined to an anchor any more flies as rigid bodies (gravity, drag, landing
   on the decks under it, sinking) and single fragments as points; the ship's own plating stands as phase A left it.

   Frames go out as they are made (onFrame): phase A every node of the region, phase B the moving ones. */
import { cellAt, cellOf, zRun, MATS } from './build.js';
import { runPhaseA } from './gpu.js';
import { kinneyIs, kinneyPs, reflect, arrival, qsp, fireR } from '../blast/phys.js';

const G = 9.81, RHO_W = 1025;
/* the 26 neighbours: offsets and their class (1 face, 2 edge, 3 corner) */
const OFF = []; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) OFF.push([dx, dy, dz, Math.abs(dx) + Math.abs(dy) + Math.abs(dz)]);
const HALF = OFF.filter(([dx, dy, dz]) => dz > 0 || (dz === 0 && (dy > 0 || (dy === 0 && dx > 0))));
const KCLS = [0, .5, .25, .12];
/* casings (kg) and typical fragment (kg) (blast/shell/model.js CASING) and the round's diameter (m) */
const CASING = { oniks: [130, .03], kalibr: [250, .04], tlam: [250, .04], slam: [250, .04], uran: [80, .03], mk84: [500, .05], hellfire: [4, .005], kornet: [4, .005], shell: [28, .015], shell130: [30, .015], shell57: [2.5, .006], gun5: [28, .015], sm6: [34, .01], pdms: [20, .008], sam: [12, .006], sam48: [110, .02], ram: [6, .005], aam: [10, .006] };
export const DIA = { oniks: .7, kalibr: .53, tlam: .52, slam: .34, uran: .42, mk84: .46, hellfire: .18, kornet: .15, shell: .127, shell130: .13, shell57: .057, gun5: .127, sm6: .34, pdms: .2, sam: .2, sam48: .5, ram: .13, aam: .18 };

function mulberry(seed) { let a = (seed >>> 0) || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash01 = (a, b) => { let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

export function createSolver(V, layout) {
  const S = V.S, [NX, NY] = V.dim;
  const loc = new Int32Array(V.n).fill(-1);
  const idxAt = (x, y, z) => cellAt(V, Math.floor((x - V.lo[0]) / S), Math.floor((y - V.lo[1]) / S), Math.floor((z - V.lo[2]) / S));

  /* the framing (warship: blast/spec.js HULL.warship): transverse frames every 2.4 m along the hull, longitudinals every
     0.75 m (up the side, across the decks), on the hull and the decks */
  const FR = 2.4, LG = .75;
  const near = (v, sp) => { const r = ((v % sp) + sp) % sp; return Math.min(r, sp - r) < S * .55; };
  const plated = g => { if (V.ins[g]) return 0; const pn = V.parts[V.part[g]] || ''; return pn === 'hull' ? 1 : pn === 'deck' ? 2 : 0; };
  function ribOf(g, h, dx, dy, dz) {
    const kg = plated(g); if (!kg || plated(h) !== kg) return 1;
    const zg = V.P[3 * g + 2], zh = V.P[3 * h + 2];
    // a frame: both ends on one frame line, the bond across the hull (no step along it)
    if (dz === 0 && near(zg, FR) && near(zh, FR)) return 5;
    // a longitudinal: along the hull, both ends on its line (the side: by height; a deck: by its breadth)
    if (dx === 0 && dy === 0) { const a = kg === 1 ? V.P[3 * g + 1] : V.P[3 * g], b = kg === 1 ? V.P[3 * h + 1] : V.P[3 * h]; if (near(a, LG) && near(b, LG)) return 2.5; }
    return 1;
  }
  function ribBend(g, dx, dy, dz) {
    const kg = plated(g); if (!kg) return 1;
    if (dz === 0 && near(V.P[3 * g + 2], FR)) return 25;                 // (a frame's deep web)
    if (dx === 0 && dy === 0 && near(kg === 1 ? V.P[3 * g + 1] : V.P[3 * g], LG)) return 6;
    return 1;
  }

  async function hit(o, onFrame) {
    const tw0 = Date.now();
    const W = Math.max(.05, o.W), W3 = Math.cbrt(W), C = o.C.slice(), seed = o.seed >>> 0 || 1, rnd = mulberry(seed);
    const R = o.rAct || Math.min(14, Math.max(4, 3 + 1.6 * W3));
    const tEnd = o.tEnd || 3;
    /* ---------------------------------------------------------- the region */
    const gl = [];                      // local -> global
    const add = g => { if (loc[g] < 0) { loc[g] = gl.length; gl.push(g); } return loc[g]; };
    // (and the whole space the charge is in, its walls with a margin: the gas pushes on all of them, so the region ends
    // at the structure that holds them (bulkheads, decks, the far side), never in the middle of a plate)
    const sp0 = layout && o.fuze !== 'out' ? layout.at(C[0], C[1], C[2]) : -2;
    let bx = null;
    if (sp0 >= 0 && layout.box) { const b = layout.box, m = .6; bx = [b[6 * sp0] - m, b[6 * sp0 + 1] - m, b[6 * sp0 + 2] - m, b[6 * sp0 + 3] + m, b[6 * sp0 + 4] + m, b[6 * sp0 + 5] + m];
      // (a space longer than 40 m is kept to the 40 m round the charge)
      bx[2] = Math.max(bx[2], C[2] - 20); bx[5] = Math.min(bx[5], C[2] + 20); }
    const zi0 = Math.floor((Math.min(C[2] - R, bx ? bx[2] : 1e9) - V.lo[2]) / S), zi1 = Math.floor((Math.max(C[2] + R, bx ? bx[5] : -1e9) - V.lo[2]) / S);
    const free = [];
    for (let g = 0; g < V.n; g++) {
      const iz = Math.floor(V.key[g] / (NX * NY)); if (iz < zi0 || iz > zi1) continue;
      const px = V.P[3 * g], py = V.P[3 * g + 1], pz = V.P[3 * g + 2], dx = px - C[0], dy = py - C[1], dz = pz - C[2];
      if (dx * dx + dy * dy + dz * dz < R * R || (bx && px > bx[0] && px < bx[3] && py > bx[1] && py < bx[4] && pz > bx[2] && pz < bx[5])) free.push(add(g));
    }
    const nFree = gl.length;
    // (the region's reach from the charge: the occupancy cube the GPU keeps covers it)
    let Rreg = R; for (let a = 0; a < nFree; a++) { const g = gl[a]; Rreg = Math.max(Rreg, Math.hypot(V.P[3 * g] - C[0], V.P[3 * g + 1] - C[1], V.P[3 * g + 2] - C[2])); }
    // bonds (to the anchors too: the cells just outside, added as fixed nodes)
    const bI = [], bJ = [], bL = [], bK = [], bEy = [], bEf = [], bC = [];
    const adj = new Map();                 // (a local * 2^20 + b local) -> bond
    for (let a = 0; a < nFree; a++) {
      const g = gl[a], [ix, iy, iz] = cellOf(V, g);
      for (const [dx, dy, dz, c] of OFF) {
        const h = cellAt(V, ix + dx, iy + dy, iz + dz); if (h < 0) continue;
        const b0 = loc[h];
        if (b0 >= 0 && b0 < nFree && b0 < a) continue;       // (each pair once)
        const b = add(h);
        const L = Math.hypot(V.P[3 * h] - V.P[3 * g], V.P[3 * h + 1] - V.P[3 * g + 1], V.P[3 * h + 2] - V.P[3 * g + 2]);
        if (L < 1e-3 || L > S * 2.2) continue;
        const ma = MATS[V.mat[g]], mb = MATS[V.mat[h]], t = Math.min(V.t[g], V.t[h]);
        const mw = ma.sy / ma.E < mb.sy / mb.E ? ma : mb, E = Math.min(ma.E, mb.E);
        // (the ship's framing as ribs in the plating: a bond along a frame line (every 2.4 m along the hull) or a
        // longitudinal (every 0.75 m) is the stiffener's web and flange too: stiffer and tougher)
        const rib = ribOf(g, h, dx, dy, dz);
        const k = E * t * KCLS[c] * (S / L) * rib;
        const ef = (mw.eg + mw.ee * Math.min(.2, t / S)) * (1 + .3 * (hash01(Math.min(g, h), Math.max(g, h) ^ seed) - .5)) * (rib > 1 ? 1.3 : 1);
        bI.push(a); bJ.push(b); bL.push(L); bK.push(k); bEy.push(mw.sy / mw.E); bEf.push(ef);
        adj.set(Math.min(a, b) * 1048576 + Math.max(a, b), bI.length - 1);
      }
    }
    const nl = gl.length, nb = bI.length;
    const BI = Int32Array.from(bI), BJ = Int32Array.from(bJ), L0 = Float32Array.from(bL), LR = Float32Array.from(bL), BK = Float32Array.from(bK),
      EY = Float32Array.from(bEy), EF = Float32Array.from(bEf), ALIVE = new Uint8Array(nb).fill(1);
    // nodes
    const x = new Float64Array(nl * 3), v = new Float64Array(nl * 3), F = new Float64Array(nl * 3), x0 = new Float32Array(nl * 3);
    const mass = new Float64Array(nl), w = new Float64Array(nl), deg = new Uint8Array(nl), deg0 = new Uint8Array(nl), kSum = new Float64Array(nl);
    for (let a = 0; a < nl; a++) { const g = gl[a]; for (let k = 0; k < 3; k++) x[3 * a + k] = x0[3 * a + k] = V.P[3 * g + k]; mass[a] = V.m[g]; }
    // (the outer plating under the water carries the water behind it: added mass)
    for (let a = 0; a < nFree; a++) { const g = gl[a]; if (!V.ins[g] && V.P[3 * g + 1] < -.15 && V.P[3 * g + 4] < .6) mass[a] += RHO_W * S * S * .6; }
    for (let q = 0; q < nb; q++) { deg[BI[q]]++; deg[BJ[q]]++; kSum[BI[q]] += BK[q]; kSum[BJ[q]] += BK[q]; }
    deg0.set(deg);
    // the step, and the bounded mass scaling that keeps it (a light alu node beside heavy steel)
    // (the graphics card affords a finer step: fewer nodes mass-scaled, no bond softened, the framing as stiff as built)
    const DT = o.dt || (o.gpu ? 1.5e-5 : 3e-5);
    let scaled = 0;
    for (let a = 0; a < nl; a++) {
      if (a >= nFree) { w[a] = 0; continue; }
      const need = kSum[a] * DT * DT / .64;
      if (need > mass[a]) { if (need > mass[a] * 4) scaled++; mass[a] = Math.min(need, mass[a] * 4); }
      w[a] = 1 / mass[a];
    }
    // (still too stiff for the step after the bounded scaling: that node's bonds softened)
    const soft = new Float64Array(nl).fill(1);
    for (let a = 0; a < nFree; a++) { const r = kSum[a] * DT * DT / (.64 * mass[a]); if (r > 1) soft[a] = 1 / r; }
    for (let q = 0; q < nb; q++) BK[q] *= Math.min(soft[BI[q]], soft[BJ[q]]);
    // damping per bond (a little: the plating rings then settles)
    const BC = new Float32Array(nb); for (let q = 0; q < nb; q++) { const a = BI[q], b = BJ[q], mu = 1 / ((w[a] || 0) + (w[b] || 0) || 1e-9); BC[q] = 2 * .06 * Math.sqrt(BK[q] * mu); }
    // bending triplets along each plate (a node with a normal; up to 4)
    const tA = [], tI = [], tB = [], tQa = [], tQb = [], tKb = [], tEy = [];
    for (let a = 0; a < nFree; a++) {
      const g = gl[a], nx = V.N[3 * g], ny = V.N[3 * g + 1], nz = V.N[3 * g + 2]; if (nx * nx + ny * ny + nz * nz < .5) continue;
      const [ix, iy, iz] = cellOf(V, g); let c = 0;
      for (const [dx, dy, dz, cls] of HALF) {
        if (c >= 4) break;
        const ol = Math.hypot(dx, dy, dz); if (Math.abs((dx * nx + dy * ny + dz * nz) / ol) > .4) continue;
        const hp = cellAt(V, ix + dx, iy + dy, iz + dz), hm = cellAt(V, ix - dx, iy - dy, iz - dz); if (hp < 0 || hm < 0) continue;
        const p = loc[hp], m = loc[hm]; if (p < 0 || m < 0) continue;
        const qa = adj.get(Math.min(a, m) * 1048576 + Math.max(a, m)), qb = adj.get(Math.min(a, p) * 1048576 + Math.max(a, p)); if (qa === undefined || qb === undefined) continue;
        // (plating with its stiffeners: frames, longitudinals, beams bend as a plate ~4x as thick; topside and kit ~2x)
        const pn = V.parts[V.part[g]] || '', stf = V.ins[g] ? (/^ixS/.test(pn) ? 3 : 1.5) : /^(hull|deck)$/.test(pn) ? 4 : 2;
        const mt = MATS[V.mat[g]], t = V.t[g] * stf, Ls = ol * S;
        const rb = ribBend(g, dx, dy, dz);
        const kb0 = mt.E * t * t * t / (2 * Ls * Ls), kb = kb0 * rb;
        tA.push(m); tI.push(a); tB.push(p); tQa.push(qa); tQb.push(qb); tKb.push(kb); tEy.push((mt.sy * t * t / 2) / kb0); c++;   // (a frame's deeper section yields at the same deflection: rb x the moment)
      }
    }
    const nt = tI.length;
    const TA = Int32Array.from(tA), TI = Int32Array.from(tI), TB = Int32Array.from(tB), TQA = Int32Array.from(tQa), TQB = Int32Array.from(tQb), TKB = Float32Array.from(tKb), TEY = Float32Array.from(tEy);
    const TD = new Float64Array(nt * 3);
    for (let q = 0; q < nt; q++) for (let k = 0; k < 3; k++) TD[3 * q + k] = x[3 * TI[q] + k] - .5 * (x[3 * TA[q] + k] + x[3 * TB[q] + k]);
    // per node state for the picture
    const edgeT = new Float32Array(nl).fill(1e9), soot = new Float32Array(nl), sootS = new Int8Array(nl), pock = new Float32Array(nl), loose = new Uint8Array(nl);
    const nrm = new Float32Array(nl * 3); for (let a = 0; a < nl; a++) for (let k = 0; k < 3; k++) nrm[3 * a + k] = V.N[3 * gl[a] + k];
    const gone = new Uint8Array(V.n);    // (cells no longer in the way of a ray: punched)
    const breakBond = (q, t) => { if (!ALIVE[q]) return; ALIVE[q] = 0; const a = BI[q], b = BJ[q]; deg[a]--; deg[b]--; if (t < edgeT[a]) edgeT[a] = t; if (t < edgeT[b]) edgeT[b] = t; };
    // node -> its bonds (for shattering fast)
    const nbOf = Array.from({ length: nl }, () => []); for (let q = 0; q < nb; q++) { nbOf[BI[q]].push(q); nbOf[BJ[q]].push(q); }
    const shatterF = (a, t) => { for (const q of nbOf[a]) breakBond(q, t); gone[gl[a]] = 1; loose[a] = 1; };

    /* ---------------------------------------------------------- the round's own way in */
    const dir = o.dir ? norm(o.dir) : [0, 0, 1], dia = o.dia || DIA[o.kind] || .3;
    let punched = 0;
    if (o.entry && o.fuze === 'in') {
      const E0 = [o.entry[0] - dir[0] * .6, o.entry[1] - dir[1] * .6, o.entry[2] - dir[2] * .6], sp = o.speed || 300, rr = dia * .5 + S * .35;
      const segL = Math.hypot(C[0] - E0[0], C[1] - E0[1], C[2] - E0[2]);
      for (let a = 0; a < nFree; a++) {
        const px = x[3 * a] - E0[0], py = x[3 * a + 1] - E0[1], pz = x[3 * a + 2] - E0[2], s = Math.max(0, Math.min(segL, px * dir[0] + py * dir[1] + pz * dir[2]));
        const qx = px - dir[0] * s, qy = py - dir[1] * s, qz = pz - dir[2] * s;
        if (qx * qx + qy * qy + qz * qz < rr * rr) {
          shatterF(a, 0); punched++;
          // (the plating it went through goes in with it, slowed: fragments ahead of the charge)
          const k = (.25 + .3 * rnd()) * sp; v[3 * a] = dir[0] * k + (rnd() - .5) * 40; v[3 * a + 1] = dir[1] * k + (rnd() - .5) * 40; v[3 * a + 2] = dir[2] * k + (rnd() - .5) * 40;
        }
      }
    }
    /* ---------------------------------------------------------- the loads */
    // line of sight from the charge through the lattice (the cells near the end of the ray are the node's own plate)
    function seen(a) {
      const g = gl[a], P = [V.P[3 * g], V.P[3 * g + 1], V.P[3 * g + 2]];
      const d = [P[0] - C[0], P[1] - C[1], P[2] - C[2]], L = Math.hypot(d[0], d[1], d[2]); if (L < S * 2.6) return true;
      const st = S * .5, n = Math.floor((L - S * 2.5) / st);
      let last = -1;
      for (let i = 1; i <= n; i++) {
        const f = i * st / L, h = idxAt(C[0] + d[0] * f, C[1] + d[1] * f, C[2] + d[2] * f);
        if (h < 0 || h === last) continue; last = h;
        if (h === g || gone[h]) continue;
        // (the cell the charge sits in is not in the way)
        if (i * st < S * 1.2) continue;
        return false;
      }
      return true;
    }
    // the impulses, sorted by arrival
    const imp = [];
    let shockN = 0, Wmax = 0;
    const vFrag = o.vFrag || 650;
    for (let a = 0; a < nFree; a++) {
      if (loose[a]) continue;
      const g = gl[a], px = V.P[3 * g] - C[0], py = V.P[3 * g + 1] - C[1], pz = V.P[3 * g + 2] - C[2], Rn = Math.max(.08, Math.hypot(px, py, pz));
      if (!seen(a)) continue;
      const Z = Math.max(.053, Rn / W3), Is = kinneyIs(Z, W), Ps = kinneyPs(Z), rf = reflect(Ps) / Ps;
      const dx = px / Rn, dy = py / Rn, dz = pz / Rn;
      let nx = nrm[3 * a], ny = nrm[3 * a + 1], nz = nrm[3 * a + 2]; if (nx * nx + ny * ny + nz * nz < .5) { nx = dx; ny = dy; nz = dz; }
      let c = dx * nx + dy * ny + dz * nz; if (c < 0) { nx = -nx; ny = -ny; nz = -nz; c = -c; }
      // (close in, the detonation products' own momentum (Kinney-Graham is a far-field fit): the charge's mass at ~2.4 km/s
      // spread over the sphere, doubled on a face turned to it, fading over ~1.2 W^1/3)
      const Ip = 2 * W * 2400 / (4 * Math.PI * Rn * Rn) * Math.exp(-((Rn / (1.2 * W3)) ** 2)) * c;
      const I = Is * (1 + (rf - 1) * c * c) + Ip;
      const dv = Math.min(2500, I * S * S / mass[a]);
      imp.push([arrival(Rn, W), a, nx * dv, ny * dv, nz * dv]);
      { const sv = Math.min(1, 1.25 - Rn / (fireR(W) * 1.5)); if (sv > soot[a]) { soot[a] = sv; const g0 = gl[a]; sootS[a] = V.N[3 * g0] * px + V.N[3 * g0 + 1] * py + V.N[3 * g0 + 2] * pz < 0 ? 1 : -1; } }
      shockN++; Wmax = Math.max(Wmax, dv);
    }
    imp.sort((p, q) => p[0] - q[0]);
    // the gas: a charge inside a space of the hull
    let gas = null;
    const sp = layout ? layout.at(C[0], C[1], C[2]) : -2;
    if (sp >= 0 && o.fuze !== 'out') {
      const Vc = layout.vol[sp], P0g = qsp(W, Vc), wall = [];
      for (let a = 0; a < nFree; a++) {
        if (loose[a]) continue;
        const g = gl[a], nx = V.N[3 * g], ny = V.N[3 * g + 1], nz = V.N[3 * g + 2]; if (nx * nx + ny * ny + nz * nz < .5) continue;
        const px = V.P[3 * g], py = V.P[3 * g + 1], pz = V.P[3 * g + 2];
        const s1 = layout.at(px + nx * .35, py + ny * .35, pz + nz * .35), s2 = layout.at(px - nx * .35, py - ny * .35, pz - nz * .35);
        if (s1 === sp && s2 !== sp) wall.push(a, -1); else if (s2 === sp && s1 !== sp) wall.push(a, 1);
      }
      gas = { sp, id: layout.ids[sp], V: Vc, P: P0g, P0: P0g, wall: Int32Array.from(wall), vent: 0, t0: arrival(1, W) };
      // (the inside face of the space's walls: the side the gas is on, -sign of the push)
      for (let q = 0; q < gas.wall.length; q += 2) { const a = gas.wall[q]; if (soot[a] < .55) { soot[a] = .55; sootS[a] = -gas.wall[q + 1]; } }
    }
    // fragments: the first plating each meets is pocked
    const cas = CASING[o.kind] || [W * .8, .02], nFr = Math.max(1, Math.round(cas[0] / cas[1])), NR = Math.min(900, nFr), per = nFr / NR;
    let pocked = 0;
    for (let r = 0; r < NR; r++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = [s * Math.cos(th), u, s * Math.sin(th)];
      for (let l = .4; l < 30; l += S * .5) {
        const h = idxAt(C[0] + d[0] * l, C[1] + d[1] * l, C[2] + d[2] * l);
        if (h < 0 || gone[h]) continue;
        const a = loc[h]; if (a >= 0 && a < nFree) { pock[a] += per; pocked++; }
        break;
      }
    }
    // a node blown to pieces: its impulse far past what its plating holds together at, or riddled
    const blow = [];
    for (const [t, a, ax, ay, az] of imp) if (Math.hypot(ax, ay, az) > vFrag) blow.push([t, a]);
    for (let a = 0; a < nFree; a++) if (pock[a] > 25 * (V.t[gl[a]] / .01)) blow.push([0, a]);

    /* ---------------------------------------------------------- phase A */
    const inside = !!gas, tA_end = o.tA || (o.gpu ? (inside ? .12 : .06) : (inside ? .06 : .035));
    const FT = [0, .00025, .0005, .00075, .001, .0015, .002, .003, .004, .005, .006, .008, .01, .0125, .015, .0175, .02, .025, .03, .035, .04, .045, .05, .055, .06, .07, .08, .09, .1, .11, .12, .135, .15].filter(t => t <= tA_end + 1e-9);
    if (FT[FT.length - 1] < tA_end - 1e-9) FT.push(tA_end);
    let t = 0, ip = 0, fk = 0, steps = 0, ib = 0;
    blow.sort((p, q) => p[0] - q[0]);
    const nrmTmp = new Float32Array(nl * 3); nrmTmp.set(nrm);
    function normals() {
      // each node's normal from its bending triplets (the two most crossed), kept on the side it faced
      const nA = new Int32Array(nl).fill(-1), nB = new Int32Array(nl).fill(-1);
      for (let q = 0; q < nt; q++) { if (!ALIVE[TQA[q]] || !ALIVE[TQB[q]]) continue; const i = TI[q]; if (nA[i] < 0) nA[i] = q; else if (nB[i] < 0) {
        const ax = x[3 * TB[nA[i]]] - x[3 * TA[nA[i]]], ay = x[3 * TB[nA[i]] + 1] - x[3 * TA[nA[i]] + 1], az = x[3 * TB[nA[i]] + 2] - x[3 * TA[nA[i]] + 2];
        const bx = x[3 * TB[q]] - x[3 * TA[q]], by = x[3 * TB[q] + 1] - x[3 * TA[q] + 1], bz = x[3 * TB[q] + 2] - x[3 * TA[q] + 2];
        const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx, l = Math.hypot(cx, cy, cz);
        const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
        if (l > .3 * la * lb) nB[i] = q; } }
      for (let i = 0; i < nFree; i++) {
        if (nB[i] < 0) continue;
        const qa = nA[i], qb = nB[i];
        const ax = x[3 * TB[qa]] - x[3 * TA[qa]], ay = x[3 * TB[qa] + 1] - x[3 * TA[qa] + 1], az = x[3 * TB[qa] + 2] - x[3 * TA[qa] + 2];
        const bx = x[3 * TB[qb]] - x[3 * TA[qb]], by = x[3 * TB[qb] + 1] - x[3 * TA[qb] + 1], bz = x[3 * TB[qb] + 2] - x[3 * TA[qb] + 2];
        let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; const l = Math.hypot(cx, cy, cz) || 1; cx /= l; cy /= l; cz /= l;
        if (cx * nrmTmp[3 * i] + cy * nrmTmp[3 * i + 1] + cz * nrmTmp[3 * i + 2] < 0) { cx = -cx; cy = -cy; cz = -cz; }
        nrmTmp[3 * i] = cx; nrmTmp[3 * i + 1] = cy; nrmTmp[3 * i + 2] = cz;
      }
      // (smoothed over the intact bonds to neighbours on the same face: a dent shades as one surface, not cell by cell)
      const acc = new Float32Array(nl * 3); acc.set(nrmTmp);
      for (let q = 0; q < nb; q++) {
        if (!ALIVE[q]) continue;
        const a = BI[q], b = BJ[q], d = nrmTmp[3 * a] * nrmTmp[3 * b] + nrmTmp[3 * a + 1] * nrmTmp[3 * b + 1] + nrmTmp[3 * a + 2] * nrmTmp[3 * b + 2];
        if (d < .55) continue;
        for (let k = 0; k < 3; k++) { acc[3 * a + k] += nrmTmp[3 * b + k]; acc[3 * b + k] += nrmTmp[3 * a + k]; }
      }
      for (let i = 0; i < nFree; i++) { const l = Math.hypot(acc[3 * i], acc[3 * i + 1], acc[3 * i + 2]); if (l > 1e-6) for (let k = 0; k < 3; k++) nrmTmp[3 * i + k] = acc[3 * i + k] / l; }
    }
    function frameA(tk) {
      normals();
      const pos = new Float32Array(nFree * 3), nn = new Int8Array(nFree * 3), fl = new Uint8Array(nFree);
      for (let a = 0; a < nFree; a++) {
        for (let k = 0; k < 3; k++) { pos[3 * a + k] = x[3 * a + k]; nn[3 * a + k] = Math.round(nrmTmp[3 * a + k] * 127); }
        fl[a] = (edgeT[a] <= tk ? 1 : 0) | (deg[a] === 0 || loose[a] ? 2 : 0) | (pock[a] > 0 ? 8 : 0);
      }
      onFrame({ op: 'fa', t: tk, pos, nrm: nn, flg: fl }, [pos.buffer, nn.buffer, fl.buffer]);
    }
    const sootM = new Uint8Array(nFree); for (let a = 0; a < nFree; a++) sootM[a] = Math.round(Math.min(1, Math.max(0, soot[a])) * 127) + (sootS[a] >= 0 ? 128 : 0);
    onFrame({ op: 'meta', soot: sootM, act: Int32Array.from(gl.slice(0, nFree)), nFree, nAnchor: nl - nFree, bonds: nb, triplets: nt, R, C, gas: gas && { id: gas.id, V: gas.V, P0: gas.P0, walls: gas.wall.length / 2 }, shockN, pocked, punched, dt: DT, scaled, tA: tA_end });
    const vmax2 = 1500 * 1500, brk = new Int32Array(nb);
    const tSetup = Date.now() - tw0;
    let gpuUsed = false;
    if (o.gpu && !o.gpu.lost) {
      // phase A on the graphics card (vox/gpu.js): the same model, the frames read back at their times
      const gasSign = new Float32Array(nl); if (gas) for (let q = 0; q < gas.wall.length; q += 2) gasSign[gas.wall[q]] = gas.wall[q + 1];
      let gT = 0, gP = gas ? gas.P : 0, gk = gas ? 1 / .35 : 0;
      const gasAt = gas ? (tt, dg) => {
        gP *= Math.exp(-(tt - gT) * gk); gT = tt;
        if (dg) { let torn = 0; for (let q = 0; q < gas.wall.length; q += 2) { const a = gas.wall[q]; if (dg[a] < deg0[a] * .5) torn++; } gas.vent = torn * S * S; }
        gk = 1 / (gas.V / (Math.max(.05, gas.vent) * 220)) + 1 / .35; gas.P = gP;
        return { P: gP, k: gk };
      } : null;
      const take = R => { for (let a = 0; a < nl; a++) { for (let k = 0; k < 3; k++) { x[3 * a + k] = R.P[8 * a + k]; v[3 * a + k] = R.P[8 * a + 4 + k]; } if (a < nFree) { deg[a] = R.deg[a]; if (R.edgeT[a] < edgeT[a]) edgeT[a] = R.edgeT[a]; if (deg[a] === 0) loose[a] = 1; } } };
      try {
        // (the rest of the ship in the occupancy cube round the region: what a loose cell can strike)
        const occ = []; { const hw = Math.min(20, Rreg + 2.5), [i0, i1] = zRun(V, C[2] - hw, C[2] + hw); for (let g = i0; g < i1; g++) { if (loc[g] >= 0) continue; const px = V.P[3 * g], py = V.P[3 * g + 1]; if (Math.abs(px - C[0]) < hw && Math.abs(py - C[1]) < hw) occ.push(px, py, V.P[3 * g + 2]); } }
        const M = { nl, nFree, nb, nt, S, R: Rreg, C, occ, x, v, w, nrm, gasSign, imp, blow, deg, BI, BJ, BK, BC, L0, LR, EY, EF, ALIVE, TA, TI, TB, TQA, TQB, TKB, TEY, TD };
        const r = await runPhaseA(o.gpu, M, { DT, FT, tEnd: tA_end, gasAt, frame: (tk, R) => { take(R); frameA(tk); } });
        take(r); ALIVE.set(r.alive); L0.set(r.L0); steps = r.steps; t = tA_end; fk = FT.length; gpuUsed = true;
      } catch (e) { console.warn('vox: the GPU solve failed, on the CPU instead', e); }
    }
    if (!gpuUsed) {
      let tornArea = 0, lastVent = -1;
      for (;;) {
        if (fk < FT.length && t >= FT[fk] - 1e-9) { frameA(FT[fk]); fk++; }
        if (t >= tA_end - 1e-9) break;
        const h = DT;
        // impulses arriving
        while (ip < imp.length && imp[ip][0] <= t) { const [, a, ax, ay, az] = imp[ip++]; v[3 * a] += ax; v[3 * a + 1] += ay; v[3 * a + 2] += az; }
        while (ib < blow.length && blow[ib][0] <= t) { shatterF(blow[ib][1], t); ib++; }
        F.fill(0);
        // gas on the walls of its space, venting through what tore
        if (gas && t >= gas.t0) {
          if (steps - lastVent >= 20) {
            lastVent = steps; let torn = 0;
            for (let q = 0; q < gas.wall.length; q += 2) { const a = gas.wall[q]; if (deg[a] < deg0[a] * .5) torn++; }
            tornArea = torn * S * S; gas.vent = tornArea;
          }
          const tau = gas.V / (Math.max(.05, gas.vent) * 220);
          gas.P *= Math.exp(-h / tau - h / .35);
          const f0 = gas.P * S * S;
          for (let q = 0; q < gas.wall.length; q += 2) {
            const a = gas.wall[q], sg = gas.wall[q + 1]; if (loose[a] || deg[a] === 0) continue;
            F[3 * a] += sg * nrm[3 * a] * f0; F[3 * a + 1] += sg * nrm[3 * a + 1] * f0; F[3 * a + 2] += sg * nrm[3 * a + 2] * f0;
          }
        }
        const nbk = bondsStep(nb, ALIVE, BI, BJ, x, v, F, L0, LR, EY, EF, BK, BC, brk);
        for (let k = 0; k < nbk; k++) breakBond(brk[k], t);
        bendStep(nt, ALIVE, TQA, TQB, TI, TA, TB, TD, TEY, TKB, x, F);
        integrate(nFree, w, v, x, F, deg, loose, h, Math.exp(-h / .05), vmax2);
        t += h; steps++;
      }
    }
    const wallA = Date.now() - tw0;

    /* ---------------------------------------------------------- the pieces: what is not joined to an anchor */
    const par = new Int32Array(nl); for (let a = 0; a < nl; a++) par[a] = a;
    const fd = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let q = 0; q < nb; q++) if (ALIVE[q]) { const ra = fd(BI[q]), rb = fd(BJ[q]); if (ra !== rb) par[ra] = rb; }
    const anch = new Uint8Array(nl); for (let a = nFree; a < nl; a++) anch[fd(a)] = 1;
    const groups = new Map();
    for (let a = 0; a < nFree; a++) { const r = fd(a); if (anch[r]) continue; let gq = groups.get(r); if (!gq) groups.set(r, gq = []); gq.push(a); }
    const bodies = [], parts = [];
    for (const gq of groups.values()) { if (gq.length >= 4) bodies.push(mkBody(gq)); else for (const a of gq) parts.push(a); }
    function mkBody(gq) {
      let M = 0; const c = [0, 0, 0], p = [0, 0, 0];
      for (const a of gq) { const m = V.m[gl[a]]; M += m; for (let k = 0; k < 3; k++) { c[k] += x[3 * a + k] * m; p[k] += v[3 * a + k] * m; } }
      for (let k = 0; k < 3; k++) { c[k] /= M; p[k] /= M; }
      // spin from the nodes' velocities about the centre
      const I = [0, 0, 0, 0, 0, 0, 0, 0, 0], Lm = [0, 0, 0];
      const r = new Float32Array(gq.length * 3);
      gq.forEach((a, k) => { const m = V.m[gl[a]], rx = x[3 * a] - c[0], ry = x[3 * a + 1] - c[1], rz = x[3 * a + 2] - c[2]; r[3 * k] = rx; r[3 * k + 1] = ry; r[3 * k + 2] = rz;
        const ux = v[3 * a] - p[0], uy = v[3 * a + 1] - p[1], uz = v[3 * a + 2] - p[2];
        Lm[0] += m * (ry * uz - rz * uy); Lm[1] += m * (rz * ux - rx * uz); Lm[2] += m * (rx * uy - ry * ux);
        const rr = rx * rx + ry * ry + rz * rz; I[0] += m * (rr - rx * rx); I[4] += m * (rr - ry * ry); I[8] += m * (rr - rz * rz); I[1] -= m * rx * ry; I[2] -= m * rx * rz; I[5] -= m * ry * rz; });
      I[3] = I[1]; I[6] = I[2]; I[7] = I[5]; for (const k of [0, 4, 8]) I[k] += M * S * S * .2;
      const Ii = inv3(I), wv = [Ii[0] * Lm[0] + Ii[1] * Lm[1] + Ii[2] * Lm[2], Ii[3] * Lm[0] + Ii[4] * Lm[1] + Ii[5] * Lm[2], Ii[6] * Lm[0] + Ii[7] * Lm[1] + Ii[8] * Lm[2]];
      const wl = Math.hypot(wv[0], wv[1], wv[2]); if (wl > 40) for (let k = 0; k < 3; k++) wv[k] *= 40 / wl;
      // contact points: the extremes and a spread of the rest (at most 24)
      const pick = new Set(); for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) { let b = 0; for (let k = 1; k < gq.length; k++) if (sg * r[3 * k + ax] > sg * r[3 * b + ax]) b = k; pick.add(b); }
      for (let k = 0; pick.size < Math.min(24, gq.length) && k < gq.length; k += Math.max(1, Math.floor(gq.length / 18))) pick.add(k);
      const n0 = new Float32Array(gq.length * 3); gq.forEach((a, k) => { for (let j = 0; j < 3; j++) n0[3 * k + j] = nrmTmp[3 * a + j]; });
      return { nodes: gq, M, c, v: p, w: wv, q: [1, 0, 0, 0], r, n0, cp: Int32Array.from(pick), rest: 0, sea: false, area: gq.length * S * S };
    }
    // the floor under a point: the up-facing plating still attached, per 0.5 m column, several levels
    const floorAt = buildFloors();
    function buildFloors() {
      const HF = .5, lox = C[0] - 60, loz = C[2] - 60, n = 240, lv = 6, H = new Float32Array(n * n * lv).fill(-1e9), ship = new Uint8Array(n * n);
      const put = (px, py, pz, up) => { const ix = Math.floor((px - lox) / HF), iz = Math.floor((pz - loz) / HF); if (ix < 0 || iz < 0 || ix >= n || iz >= n) return; ship[iz * n + ix] = 1; if (!up) return; const o = (iz * n + ix) * lv;
        for (let k = 0; k < lv; k++) { if (Math.abs(H[o + k] - py) < .4) { H[o + k] = Math.max(H[o + k], py); return; } if (H[o + k] < -1e8) { H[o + k] = py; return; } } };
      // (the attached nodes of the region where phase A left them, the rest of the ship at rest)
      for (let g = 0; g < V.n; g++) {
        const a = loc[g], up = V.N[3 * g + 1] > .55;
        if (a >= 0 && a < nFree) { if (!anch[fd(a)]) continue; put(x[3 * a], x[3 * a + 1], x[3 * a + 2], up); }
        else { const px = V.P[3 * g], pz = V.P[3 * g + 2]; if (Math.abs(px - C[0]) < 60 && Math.abs(pz - C[2]) < 60) put(px, V.P[3 * g + 1], pz, up); }
      }
      /* the highest floor at or under a point; open water: the sea (0, floorAt.sea true); inside the hull with nothing
         under it: none (-1e9) */
      const f = (px, py, pz) => { const ix = Math.floor((px - lox) / HF), iz = Math.floor((pz - loz) / HF);
        if (ix < 0 || iz < 0 || ix >= n || iz >= n || !ship[iz * n + ix]) { f.sea = true; return 0; }
        const o = (iz * n + ix) * lv; let best = -1e9;
        for (let k = 0; k < lv; k++) { const hgt = H[o + k]; if (hgt > -1e8 && hgt <= py + .3 && hgt > best) best = hgt; }
        f.sea = false; return best; };
      return f;
    }
    // the ship's standing plating (for what flies in phase B): a cell of the lattice outside the region, or inside it and
    // still attached (at its rest cell: phase A moved it a little)
    const solidAt = (px, py, pz) => { const g = idxAt(px, py, pz); if (g < 0) return false; const a = loc[g]; return a < 0 || a >= nFree || !!anch[fd(a)]; };
    // the moving nodes and their bodies (for the frames)
    const mov = [], bodyOf = [];
    bodies.forEach((B, bi) => { for (const a of B.nodes) { mov.push(a); bodyOf.push(bi); } });
    for (const a of parts) { mov.push(a); bodyOf.push(-1); }
    const pv = new Float64Array(parts.length * 3), pp = new Float64Array(parts.length * 3), pst = new Uint8Array(parts.length);
    parts.forEach((a, k) => { for (let j = 0; j < 3; j++) { pp[3 * k + j] = x[3 * a + j]; pv[3 * k + j] = v[3 * a + j]; } });
    // the picture's static state at the end of phase A
    const flags = new Uint8Array(nFree); for (let a = 0; a < nFree; a++) flags[a] = (edgeT[a] < 1e8 ? 1 : 0) | (anch[fd(a)] ? 0 : 2) | (pock[a] > 0 ? 8 : 0);
    const sootQ = new Uint8Array(nFree); for (let a = 0; a < nFree; a++) sootQ[a] = Math.round(Math.min(1, Math.max(0, soot[a])) * 127) + (sootS[a] >= 0 ? 128 : 0);
    const edgeF = new Float32Array(nFree); for (let a = 0; a < nFree; a++) edgeF[a] = edgeT[a];
    const metricsA = summary();
    onFrame({ op: 'endA', t: tA_end, flags, edgeT: edgeF, soot: sootQ, mov: Int32Array.from(mov), bodyOf: Int32Array.from(bodyOf), nBodies: bodies.length, nParts: parts.length, metrics: metricsA },
      [flags.buffer, edgeF.buffer, sootQ.buffer]);

    /* ---------------------------------------------------------- phase B */
    const hB = 1 / 240, FB = 1 / 60;
    let tNow = tA_end, nextF = tA_end + FB;
    const Rm = new Float64Array(9);
    const out = () => {
      const pos = new Float32Array(mov.length * 3), nn = new Int8Array(mov.length * 3), st = new Uint8Array(mov.length);
      let k = 0;
      bodies.forEach(B => { qm(B.q, Rm); for (let j = 0; j < B.nodes.length; j++, k++) {
        const rx = B.r[3 * j], ry = B.r[3 * j + 1], rz = B.r[3 * j + 2];
        pos[3 * k] = B.c[0] + Rm[0] * rx + Rm[1] * ry + Rm[2] * rz; pos[3 * k + 1] = B.c[1] + Rm[3] * rx + Rm[4] * ry + Rm[5] * rz; pos[3 * k + 2] = B.c[2] + Rm[6] * rx + Rm[7] * ry + Rm[8] * rz;
        const ax = B.n0[3 * j], ay = B.n0[3 * j + 1], az = B.n0[3 * j + 2];
        nn[3 * k] = Math.round((Rm[0] * ax + Rm[1] * ay + Rm[2] * az) * 127); nn[3 * k + 1] = Math.round((Rm[3] * ax + Rm[4] * ay + Rm[5] * az) * 127); nn[3 * k + 2] = Math.round((Rm[6] * ax + Rm[7] * ay + Rm[8] * az) * 127);
        st[k] = (B.sea ? 16 : 0) | (B.rest > .3 ? 32 : 0) | (tNow - (B.touch || -1) < .25 ? 64 : 0); } });
      for (let j = 0; j < parts.length; j++, k++) { for (let q = 0; q < 3; q++) { pos[3 * k + q] = pp[3 * j + q]; nn[3 * k + q] = Math.round(nrmTmp[3 * parts[j] + q] * 127); } st[k] = 4 | (pst[j] & 1 ? 16 : 0) | (pst[j] & 2 ? 32 : 0) | (pst[j] & 4 ? 64 : 0); }
      return { pos, nn, st };
    };
    while (tNow < tEnd - 1e-9) {
      // bodies
      for (const B of bodies) stepBody(B, hB);
      // single fragments
      for (let j = 0; j < parts.length; j++) {
        if (pst[j] & 2) continue;
        const o3 = 3 * j; let vx = pv[o3], vy = pv[o3 + 1], vz = pv[o3 + 2];
        const sp2 = Math.hypot(vx, vy, vz), kd = (pst[j] & 1) ? Math.exp(-4 * hB) : Math.exp(-hB * .012 * sp2);
        vx *= kd; vy *= kd; vz *= kd; vy -= G * hB * ((pst[j] & 1) ? .15 : 1);
        let px = pp[o3] + vx * hB, py = pp[o3 + 1] + vy * hB, pz = pp[o3 + 2] + vz * hB;
        // (into standing plating: it stops there, embedded)
        if (!(pst[j] & 1) && solidAt(px, py, pz) && !solidAt(pp[o3], pp[o3 + 1], pp[o3 + 2])) { px = pp[o3]; py = pp[o3 + 1]; pz = pp[o3 + 2]; vx = vy = vz = 0; pst[j] |= 2 | 4; }
        if (!(pst[j] & 1)) {
          const fl = floorAt(px, pp[o3 + 1], pz), sea = floorAt.sea;
          if (sea && py < 0) { pst[j] |= 1; vy = Math.max(vy * .1, -2); }   // (into the sea)
          else if (py < fl) { pst[j] |= 4; py = fl; if (vy < -2) { vy = -vy * .2; vx *= .5; vz *= .5; } else { vy = 0; vx *= .7; vz *= .7; if (Math.hypot(vx, vz) < .3) pst[j] |= 2; } }
        } else if (py < -6) { py = -6; pst[j] |= 2; }
        pp[o3] = px; pp[o3 + 1] = py; pp[o3 + 2] = pz; pv[o3] = vx; pv[o3 + 1] = vy; pv[o3 + 2] = vz;
      }
      tNow += hB;
      if (tNow >= nextF - 1e-9 || tNow >= tEnd - 1e-9) { const f = out(); onFrame({ op: 'fb', t: tNow, pos: f.pos, nrm: f.nn, st: f.st }, [f.pos.buffer, f.nn.buffer, f.st.buffer]); nextF += FB; }
    }
    function stepBody(B, h) {
      if (B.rest > .6) return;
      const v3 = B.v, w3 = B.w;
      if (B.sea) { const k = Math.exp(-3 * h); for (let k2 = 0; k2 < 3; k2++) { v3[k2] *= k; w3[k2] *= k; } v3[1] = Math.max(v3[1] - G * .15 * h, -1.5); if (B.c[1] < -8) { B.rest = 1; return; } }
      else {
        const sp2 = Math.hypot(v3[0], v3[1], v3[2]), kd = Math.exp(-h * .6 * 1.2 * B.area * .5 * sp2 / Math.max(1, B.M));
        for (let k = 0; k < 3; k++) v3[k] *= kd;
        v3[1] -= G * h;
        const kw = Math.exp(-.4 * h); for (let k = 0; k < 3; k++) w3[k] *= kw;
      }
      for (let k = 0; k < 3; k++) B.c[k] += v3[k] * h;
      qInt(B.q, w3, h);
      // contacts: the lowest contact point under its floor pushes the body up (a bounce, friction), the sea takes it
      qm(B.q, Rm);
      let deep = 0, at = -1, sea0 = false;
      for (const k of B.cp) {
        const rx = B.r[3 * k], ry = B.r[3 * k + 1], rz = B.r[3 * k + 2];
        const px = B.c[0] + Rm[0] * rx + Rm[1] * ry + Rm[2] * rz, py = B.c[1] + Rm[3] * rx + Rm[4] * ry + Rm[5] * rz, pz = B.c[2] + Rm[6] * rx + Rm[7] * ry + Rm[8] * rz;
        const fl = floorAt(px, py, pz), sea = floorAt.sea;
        if (py < fl && fl - py > deep) { deep = fl - py; at = k; sea0 = sea; }
      }
      // (a contact point driven into standing plating: the body is put back where it was and bounces off, slowed)
      if (!B.sea) { let hitW = false; for (const k of B.cp) { const rx = B.r[3 * k], ry = B.r[3 * k + 1], rz = B.r[3 * k + 2];
          const px = B.c[0] + Rm[0] * rx + Rm[1] * ry + Rm[2] * rz, py = B.c[1] + Rm[3] * rx + Rm[4] * ry + Rm[5] * rz, pz = B.c[2] + Rm[6] * rx + Rm[7] * ry + Rm[8] * rz;
          if (solidAt(px, py, pz) && !solidAt(px - v3[0] * h, py - v3[1] * h, pz - v3[2] * h)) { hitW = true; break; } }
        if (hitW) { for (let k = 0; k < 3; k++) { B.c[k] -= v3[k] * h; v3[k] *= -.2; w3[k] *= .5; } B.touch = tNow; } }
      if (at >= 0 && !B.sea) {
        B.touch = tNow;
        if (sea0) { B.sea = true; return; }
        B.c[1] += deep;
        if (v3[1] < 0) v3[1] = v3[1] < -2 ? -v3[1] * .2 : 0;
        v3[0] *= .8; v3[2] *= .8; for (let k = 0; k < 3; k++) w3[k] *= .75;
        if (Math.hypot(v3[0], v3[1], v3[2]) < .4) B.rest += h; else B.rest = 0;
      } else if (!B.sea) B.rest = 0;
    }
    function summary() {
      let openShell = 0, torn = 0, tornShell = 0, moved = 0, far = 0, farMoved = 0, broken = 0, holeA = 0, holeOut = 0;
      for (let q = 0; q < nb; q++) if (!ALIVE[q]) broken++;
      const side = Math.sign(C[0]) || 1;
      for (let a = 0; a < nFree; a++) {
        const g = gl[a], d = Math.hypot(x[3 * a] - x0[3 * a], x[3 * a + 1] - x0[3 * a + 1], x[3 * a + 2] - x0[3 * a + 2]);
        if (edgeT[a] < 1e8) { torn++; if (!V.ins[g]) tornShell++; }
        if (d > .05) moved++;
        const detached = !anch[fd(a)];
        if (detached) { holeA += S * S; if (!V.ins[g]) holeOut += S * S; }
        if (!V.ins[g] && (detached || d > .4)) openShell += S * S;
        if (Math.abs(x0[3 * a]) > 2.2 && Math.sign(x0[3 * a]) !== side) { far++; if (d > .05 || detached) farMoved++; }
      }
      return { gpu: gpuUsed, setupMs: tSetup, nFree, nAnchor: nl - nFree, bonds: nb, broken, triplets: nt, steps, dt: DT, scaled, wallA, torn, tornShell, moved, detachedM2: +holeA.toFixed(2), openedOutsideM2: +holeOut.toFixed(2), shellOpenedM2: +openShell.toFixed(2),
        farSideNodes: far, farSideMoved: farMoved, bodies: bodies.length, fragments: parts.length, gasKPa: gas ? Math.round(gas.P0 / 1000) : 0, gasLeftKPa: gas ? Math.round(gas.P / 1000) : 0,
        vMaxShock: Math.round(Wmax), punched, pocked, shockN };
    }
    // (the region's indices back to free for the next hit)
    for (const g of gl) loc[g] = -1;
    const end = { op: 'done', wallMs: Date.now() - tw0, wallA, metrics: Object.assign(metricsA, { wallMs: Date.now() - tw0, restBodies: bodies.filter(B => B.rest > .3).length, seaBodies: bodies.filter(B => B.sea).length }) };
    onFrame(end);
    return end;
  }
  return { V, hit };
}

function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function inv3(m) {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc || 1e-9;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function qm(q, m) {
  const w = q[0], x = q[1], y = q[2], z = q[3];
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
}
function qInt(q, w, h) {
  const ax = w[0] * h * .5, ay = w[1] * h * .5, az = w[2] * h * .5;
  const q0 = q[0], q1 = q[1], q2 = q[2], q3 = q[3];
  q[0] = q0 - ax * q1 - ay * q2 - az * q3; q[1] = q1 + ax * q0 + ay * q3 - az * q2; q[2] = q2 - ax * q3 + ay * q0 + az * q1; q[3] = q3 + ax * q2 - ay * q1 + az * q0;
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; for (let k = 0; k < 4; k++) q[k] /= l;
}

/* phase A's hot loops, apart (small functions the JIT keeps optimised) */
function bondsStep(nb, ALIVE, BI, BJ, x, v, F, L0, LR, EY, EF, BK, BC, brk) {
  let nbk = 0;
  for (let q = 0; q < nb; q++) {
    if (ALIVE[q] === 0) continue;
    const a3 = 3 * BI[q], b3 = 3 * BJ[q];
    const dx = x[b3] - x[a3], dy = x[b3 + 1] - x[a3 + 1], dz = x[b3 + 2] - x[a3 + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-12, lr = LR[q], ey = EY[q] * lr;
    let l0 = L0[q];
    if (L - l0 > ey) l0 = L - ey; else if (l0 - L > ey) l0 = L + ey;
    L0[q] = l0;
    if (l0 - lr > EF[q] * lr) { brk[nbk++] = q; continue; }
    const iL = 1 / L, ux = dx * iL, uy = dy * iL, uz = dz * iL;
    const rv = (v[b3] - v[a3]) * ux + (v[b3 + 1] - v[a3 + 1]) * uy + (v[b3 + 2] - v[a3 + 2]) * uz;
    const f = BK[q] * (L - l0) + BC[q] * rv, fx = f * ux, fy = f * uy, fz = f * uz;
    F[a3] += fx; F[a3 + 1] += fy; F[a3 + 2] += fz;
    F[b3] -= fx; F[b3 + 1] -= fy; F[b3 + 2] -= fz;
  }
  return nbk;
}
function bendStep(nt, ALIVE, TQA, TQB, TI, TA, TB, TD, TEY, TKB, x, F) {
  for (let q = 0; q < nt; q++) {
    if (ALIVE[TQA[q]] === 0 || ALIVE[TQB[q]] === 0) continue;
    const i3 = 3 * TI[q], a3 = 3 * TA[q], b3 = 3 * TB[q], q3 = 3 * q;
    let ex = x[i3] - .5 * (x[a3] + x[b3]) - TD[q3], ey = x[i3 + 1] - .5 * (x[a3 + 1] + x[b3 + 1]) - TD[q3 + 1], ez = x[i3 + 2] - .5 * (x[a3 + 2] + x[b3 + 2]) - TD[q3 + 2];
    const e2 = ex * ex + ey * ey + ez * ez, lim = TEY[q];
    if (e2 > lim * lim) { const e = Math.sqrt(e2), k = 1 - lim / e; TD[q3] += ex * k; TD[q3 + 1] += ey * k; TD[q3 + 2] += ez * k; ex *= 1 - k; ey *= 1 - k; ez *= 1 - k; }
    const kb = TKB[q], hx = .5 * kb * ex, hy = .5 * kb * ey, hz = .5 * kb * ez;
    F[i3] -= 2 * hx; F[i3 + 1] -= 2 * hy; F[i3 + 2] -= 2 * hz;
    F[a3] += hx; F[a3 + 1] += hy; F[a3 + 2] += hz;
    F[b3] += hx; F[b3 + 1] += hy; F[b3 + 2] += hz;
  }
}
function integrate(n, w, v, x, F, deg, loose, h, kd, vmax2) {
  for (let a = 0; a < n; a++) {
    const a3 = 3 * a, wh = w[a] * h;
    let vx = v[a3] + F[a3] * wh, vy = v[a3 + 1] + F[a3 + 1] * wh, vz = v[a3 + 2] + F[a3 + 2] * wh;
    if (deg[a] >= 3) { vx *= kd; vy *= kd; vz *= kd; }
    else if (deg[a] === 0 && x[a3 + 1] < 0) { const kw = Math.exp(-h * 150); vx *= kw; vy *= kw; vz *= kw; }
    const s2 = vx * vx + vy * vy + vz * vz; if (s2 > vmax2) { const k = Math.sqrt(vmax2 / s2); vx *= k; vy *= k; vz *= k; }
    v[a3] = vx; v[a3 + 1] = vy; v[a3 + 2] = vz;
    x[a3] += vx * h; x[a3 + 1] += vy * h; x[a3 + 2] += vz * h;
    if (deg[a] === 0) loose[a] = 1;
  }
}
