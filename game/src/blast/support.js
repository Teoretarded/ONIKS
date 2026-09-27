/* What stands on the plating a hit tore, and the loose pieces (game side, render only).

   - modelDots(ent): the model's own dots (the renderer's CPU clouds, ~0.3 m apart, every part at rest) in the model
     frame, hashed by 1 m columns; and heightfield(ent): the top surface (decks, roofs) the loose pieces land on.
   - classify(B, x, y, z, nx, ny, nz): what engine/models.js blastAt does with a model dot at that point (the same test on
     the CPU copy of the patch's skin texels): untouched, plating, column kept or dropped, pocket kept or dropped.
   - createBodies(): rigid clumps of dots (the model's dots over plating that tore or lost its support, as pieces of
     their part) and single dots (the solver's loose plating): gravity, drag, landing on the top surface or on the deck
     under a hole, walls, sinking at sea. Nothing hovers: a body is falling, or at rest on a surface, or gone.

   The floor a body meets is the unit's floorAt(x, y, z) (system.js): the deck under a hole where the patch's plating is
   dead, else the heightfield where it is not a wall (more than 0.6 m over the body), else the sea. */

const COL = 1;                                   // column hash (m)
const HF = .5;                                   // heightfield cell (m)
const DOTS = new Map();                          // model key -> dots

/* the model's dots at rest: x y z nx ny nz part (7 floats), columns (x, z) of COL m */
export function modelDots(ent) {
  let M = DOTS.get(ent.key);
  if (M && M.n) return M.ins ? growInside(ent, M) : M;
  const use = [];
  let n = 0;
  ent.parts.forEach((P, pi) => {
    // (the interior parts are added as they are first drawn: growInside)
    if (P.part.inside) return;
    const c = cloudOf(P); if (!c) return;
    let X = null; try { X = P.part.xf ? P.part.xf({}) : null; } catch (e) { X = null; }
    // (a moving part whose rest transform cannot be had is left out: its dots would sit at the model's origin)
    if (X && !(X.R.every(Number.isFinite) && X.T.every(Number.isFinite))) return;
    if (P.dyn && P.part.xf && !X) return;
    let shown = true; try { shown = !P.part.show || !!P.part.show({}); } catch (e) { shown = true; }
    if (!shown) return;
    use.push([c, X, pi]); n += c.n;
  });
  if (!n) return { n: 0 };
  const D = new Float32Array(n * 7), col = new Map();
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const m = fill(D, 0, use, col, lo, hi);
  const colI = new Map(); for (const [k, l] of col) colI.set(k, Int32Array.from(l));
  M = { n: m, D, col: colI, lo, hi, parts: ent.parts.map(P => P.name), ins: new Uint8Array(ent.parts.length), seen: 0 };
  ent.parts.forEach((P, pi) => { if (P.part.inside) M.ins[pi] = 1; });
  // the top surface: the highest up-facing dot a cell (the dyn parts too: a gun's roof is a surface)
  const nx = Math.ceil((hi[0] - lo[0]) / HF) + 1, nz = Math.ceil((hi[2] - lo[2]) / HF) + 1, top = new Float32Array(nx * nz).fill(-1e9);
  for (let i = 0; i < m; i++) { const o = i * 7; if (D[o + 4] < .5) continue; const ix = Math.floor((D[o] - lo[0]) / HF), iz = Math.floor((D[o + 2] - lo[2]) / HF), k = iz * nx + ix; if (D[o + 1] > top[k]) top[k] = D[o + 1]; }
  // (small gaps closed: a cell with no up-facing dot between two that have one takes the lower)
  const t2 = top.slice();
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const k = iz * nx + ix; if (top[k] > -1e8) continue;
    let a = -1e9, b = -1e9; for (let d = 1; d <= 3; d++) { if (ix - d >= 0 && top[k - d] > -1e8 && a < -1e8) a = top[k - d]; if (ix + d < nx && top[k + d] > -1e8 && b < -1e8) b = top[k + d]; }
    if (a > -1e8 && b > -1e8) t2[k] = Math.min(a, b); }
  M.hf = { lo, nx, nz, top: t2 };
  DOTS.set(ent.key, M);
  return growInside(ent, M);
}
/* the cloud nearest 0.3 m a part has (not finer than 0.18 m: a fine level can be millions of dots) */
function cloudOf(P) {
  const cands = [];
  for (const c of P.clouds || []) if (c && c.pts && c.n) cands.push(c);
  if (P.lru) for (const m of P.lru) if (m) for (const c of m.values()) if (c && c.pts && c.n) { cands.push(c); break; }
  let best = null;
  for (const c of cands) { const k = c.sp < .18 ? 1e3 + (1 / c.sp) : Math.abs(Math.log((c.sp || .3) / .3)); if (!best || k < best.k) best = { c, k }; }
  return best && best.c;
}
function fill(D, m, use, col, lo, hi) {
  for (const [cl, X, pi] of use) {
    const f = cl.pts, by = new Int8Array(f.buffer, f.byteOffset, cl.n * 16);
    for (let i = 0; i < cl.n; i++, m++) {
      let x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2], nx = by[i * 16 + 12] / 127, ny = by[i * 16 + 13] / 127, nz = by[i * 16 + 14] / 127;
      if (X) {
        const R = X.R, T = X.T;
        const x2 = R[0] * x + R[1] * y + R[2] * z + T[0], y2 = R[3] * x + R[4] * y + R[5] * z + T[1], z2 = R[6] * x + R[7] * y + R[8] * z + T[2];
        const a = R[0] * nx + R[1] * ny + R[2] * nz, b = R[3] * nx + R[4] * ny + R[5] * nz, c = R[6] * nx + R[7] * ny + R[8] * nz;
        x = x2; y = y2; z = z2; nx = a; ny = b; nz = c;
      }
      const o = m * 7; D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = nx; D[o + 4] = ny; D[o + 5] = nz; D[o + 6] = pi;
      if (lo) { if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z; }
      const k = Math.floor(x / COL) * 65536 + Math.floor(z / COL); let l = col.get(k); if (!l) col.set(k, l = []); l.push(m);
    }
  }
  return m;
}
/* the interior parts (data/models_interior.js, part.inside): sampled only once shown (round a hole), so added to the
   dots as their clouds appear, after the others (the indices already handed out keep their dots; M.n grows) */
function growInside(ent, M) {
  const k = ent.parts.length; if (!M.have) M.have = new Uint8Array(k);
  if (M.seen && ++M.seen % 30) return M;                    // (looked at every 30th call)
  M.seen = 1;
  const use = []; let n = 0;
  ent.parts.forEach((P, pi) => { if (!M.ins[pi] || M.have[pi]) return; const c = cloudOf(P); if (!c) return; M.have[pi] = 1; use.push([c, null, pi]); n += c.n; });
  if (!n) return M;
  const D = new Float32Array((M.n + n) * 7); D.set(M.D.subarray(0, M.n * 7));
  const col = new Map();
  const m = fill(D, M.n, use, col, null, null);
  for (const [key, l] of col) { const a = M.col.get(key); if (!a) M.col.set(key, Int32Array.from(l)); else { const b = new Int32Array(a.length + l.length); b.set(a); b.set(l, a.length); M.col.set(key, b); } }
  M.D = D; M.n = m; M.gen = (M.gen || 0) + 1;
  return M;
}
/* the top surface at (x, z) (model frame), -1e9 off the model */
export function topAt(M, x, z) {
  const H = M.hf; if (!H) return -1e9;
  const ix = Math.floor((x - H.lo[0]) / HF), iz = Math.floor((z - H.lo[2]) / HF);
  if (ix < 0 || iz < 0 || ix >= H.nx || iz >= H.nz) return -1e9;
  return H.top[iz * H.nx + ix];
}
export function eachInColumns(M, x0, z0, x1, z1, cb) {
  for (let i = Math.floor(x0 / COL); i <= Math.floor(x1 / COL); i++) for (let j = Math.floor(z0 / COL); j <= Math.floor(z1 / COL); j++) {
    const l = M.col.get(i * 65536 + j); if (l) for (let q = 0; q < l.length; q++) cb(l[q]);
  }
}

/* ---------------------------------------------------------------- the shader's test on the CPU (engine/models.js blastAt) */
/* B: a patch with its rects (r.cpu: the skin texels, (nu+1) x (nv+1) x 4), B.band, spec.frame (model frame), depth.
   -> 0 untouched, 1 plating (intact), 2 plating (torn: a petal or gone), 3 column kept, 4 column dropped,
   5 behind, kept, 6 behind, dropped */
export const K = { NONE: 0, PLATE: 1, TORN: 2, COL: 3, COLDROP: 4, BEHIND: 5, BEHINDDROP: 6, HIDDEN: 7 };   // (7: an interior dot near a patch on none of its plates: not drawn, as the shader)
export function classify(B, x, y, z, nx, ny, nz, info, ins) {
  const F = B.spec.frame, S = B.spec.gridS || .125, band = B.band || 1, D = B.depth || 4;
  const dx = x - F.O[0], dy = y - F.O[1], dz = z - F.O[2];
  const l = [dx * F.X[0] + dy * F.X[1] + dz * F.X[2], dx * F.Y[0] + dy * F.Y[1] + dz * F.Y[2], dx * F.Z[0] + dy * F.Z[1] + dz * F.Z[2]];
  const two = nx * nx + ny * ny + nz * nz < .01;
  let k = 0, inRect = false;
  for (const r of B.rects) {
    if (!r.cpu || k > 2) continue;
    k++;
    const ax = r.ax, A = ax === 0 ? F.X : ax === 1 ? F.Y : F.Z;
    const off = l[ax] - r.val, u = (ax === 0 ? l[2] : l[0]) - r.u0, v = (ax === 1 ? l[2] : l[1]) - r.v0;
    const fi = u / S, fj = v / S;
    if (fi < 0 || fj < 0 || fi > r.nu || fj > r.nv) {
      // (as the shader: structure standing up to a ragged ~3 m past a deck plate's edge where the plating inside the edge
      // went: it goes too, flown as pieces (QA D23))
      if (A[1] > .7 && !ins && off > .05 && off < 30) {
        const ex = Math.max(-fi, fi - r.nu, -fj, fj - r.nv) * S, rg = .8 + 2.2 * wreckHash(Math.floor(l[0]) * .25 + .13, Math.floor(l[1]) * .25 + .13, Math.floor(l[2]) * .25 + .13);
        if (ex < rg) {
          const T = r.cpu, W = r.nu + 1, ei = Math.min(r.nu, Math.max(0, Math.floor(fi))), ej = Math.min(r.nv, Math.max(0, Math.floor(fj))), si = fi < 0 ? 1 : fi > r.nu ? -1 : 0, sj = fj < 0 ? 1 : fj > r.nv ? -1 : 0;
          for (let a = 0; a < 3; a++) { const ii = Math.min(r.nu, Math.max(0, ei + si * a)), jj = Math.min(r.nv, Math.max(0, ej + sj * a)), t = 4 * (jj * W + ii);
            if (((T[t + 3] | 0) & 11) || T[t] ** 2 + T[t + 1] ** 2 + T[t + 2] ** 2 > .64) { if (info) { info.r = r; info.off = off; info.i = ii; info.j = jj; info.up = true; } return K.COLDROP; } }
        }
      }
      continue;
    }
    inRect = true;
    const face = two || Math.abs(nx * A[0] + ny * A[1] + nz * A[2]) > .5;
    const i0 = Math.min(Math.floor(fi), r.nu - 1), j0 = Math.min(Math.floor(fj), r.nv - 1), fx = fi - i0, fy = fj - j0, W = r.nu + 1;
    const T = r.cpu, t = (i, j) => T[4 * (j * W + i) + 3] | 0;
    const f00 = t(i0, j0), fN = fx < .5 ? (fy < .5 ? f00 : t(i0, j0 + 1)) : (fy < .5 ? t(i0 + 1, j0) : t(i0 + 1, j0 + 1));
    if (info) { info.r = r; info.off = off; info.i = Math.round(fi); info.j = Math.round(fj); info.up = A[1] > .7; }
    if (Math.abs(off) > band || !face || ins) {
      // (the shader's torn test: the cells' torn flags interpolated at the point against its ragged threshold)
      const torn = tornAt(T, W, r.nu, r.nv, fi, fj, u, v, l);
      if (!ins && off > -.05 && off < (A[1] > .7 ? 30 : 3)) {
        // (the plating under its foot thrown more than 1.5 m: what stood on it does not ride along as a clean block, it
        // tears off and falls as a piece: QA D23; as the shader)
        const D2 = k2 => { const q = c => T[4 * c + k2]; const c00 = j0 * W + i0; return (q(c00) * (1 - fx) + q(c00 + 1) * fx) * (1 - fy) + (q(c00 + W) * (1 - fx) + q(c00 + W + 1) * fx) * fy; };
        const big = D2(0) ** 2 + D2(1) ** 2 + D2(2) ** 2 > .64;
        // (as the shader: the deck under its foot bent steeper than ~25 deg: torn off)
        const q2 = (i, j) => T[4 * (Math.min(r.nv, j) * W + Math.min(r.nu, i)) + ax];
        const su = ((q2(i0 + 1, j0) - q2(i0, j0)) * (1 - fy) + (q2(i0 + 1, j0 + 1) - q2(i0, j0 + 1)) * fy) / S, sv = ((q2(i0, j0 + 1) - q2(i0, j0)) * (1 - fx) + (q2(i0 + 1, j0 + 1) - q2(i0 + 1, j0)) * fx) / S;
        return torn || big || (fN & 10) || Math.hypot(su, sv) > .47 ? K.COLDROP : K.COL; }
      if (ins && off < (A[1] > .7 ? 30 : .5) && off > -D - 8) {
        // an interior part: wrecked where the plating over it tore (most of its dots gone, the same hash as the shader's)
        const wd = Math.min(1, Math.max(0, 1 + off / (D + .4)));
        return (torn || (fN & 2)) && wreckHash(l[0] * 3, l[1] * 3, l[2] * 3) < .7 * wd + .2 ? K.BEHINDDROP : K.BEHIND;
      }
      if (off <= -.05 && off > -D - .4) return !B.spec.farWall && face && Math.min(fi, r.nu - fi, fj, r.nv - fj) * S > .6 && (torn || (fN & 10)) ? K.BEHINDDROP : K.BEHIND;   // (no interior drawn: the far side stays, charred)
      continue;
    }
    if ((f00 & 1) && two) return K.COLDROP;                       // (a line over the hole goes with its plating)
    // (as the shader (engine/models.js, 4d84aaa): plating stretched past ~2.2-3x across its cell tore there: its dots fly
    // as pieces, they do not just vanish)
    { const q = (i, j, c) => T[4 * (Math.min(r.nv, j) * W + Math.min(r.nu, i)) + c];
      const gu = ((q(i0 + 1, j0, ax) - q(i0, j0, ax)) * (1 - fy) + (q(i0 + 1, j0 + 1, ax) - q(i0, j0 + 1, ax)) * fy) / S;
      const gv = ((q(i0, j0 + 1, ax) - q(i0, j0, ax)) * (1 - fx) + (q(i0 + 1, j0 + 1, ax) - q(i0 + 1, j0, ax)) * fx) / S;
      const lim = 2.2 + .8 * wreckHash(Math.floor(l[0] * 2) * .25 + .37, Math.floor(l[1] * 2) * .25 + .37, Math.floor(l[2] * 2) * .25 + .37);
      if (!((f00 & 1) || (fN & 2)) && (Math.hypot(gu, gv) > lim || (two && Math.hypot(gu, gv) > .58))) return K.COLDROP; }
    return (f00 & 1) || (fN & 2) ? K.TORN : K.PLATE;
  }
  return ins && !inRect && (l[0] * l[0] + l[1] * l[1] + l[2] * l[2] < 256 || y < .2) ? K.HIDDEN : K.NONE;   // (under the water too: QA D18)
}

/* engine/models.js blastAt's torn test: the cells' torn flags (bit 1) bilinear at the point (through the cell centres,
   clamped to the plate's cells) against 0.5, moved in between by value noise (~0.36 m) and a fine grain (1/16 m) */
function tornAt(T, W, nu, nv, fi, fj, u, v, l) {
  const gx = fi - .5, gy = fj - .5, ci = Math.floor(gx), cj = Math.floor(gy), ax = gx - ci, ay = gy - cj;
  const tc = (a, c) => (T[4 * (Math.min(Math.max(c, 0), nv - 1) * W + Math.min(Math.max(a, 0), nu - 1)) + 3] | 0) & 1;
  const mk = (tc(ci, cj) * (1 - ax) + tc(ci + 1, cj) * ax) * (1 - ay) + (tc(ci, cj + 1) * (1 - ax) + tc(ci + 1, cj + 1) * ax) * ay;
  if (mk > .999) return true;
  if (!(mk > .001)) return false;
  const qx = u * 2.8, qy = v * 2.8, ix = Math.floor(qx), iy = Math.floor(qy), fx = qx - ix, fy = qy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n = (a, b) => wreckHash(a * .25 + .01, b * .25 + .01, 3 * .25 + .01);
  const nz = ((n(ix, iy) * (1 - sx) + n(ix + 1, iy) * sx) * (1 - sy) + (n(ix, iy + 1) * (1 - sx) + n(ix + 1, iy + 1) * sx) * sy) * .7
    + wreckHash(Math.floor(l[0] * 16) * .25 + .01, Math.floor(l[1] * 16) * .25 + .01, Math.floor(l[2] * 16) * .25 + .01) * .3;
  return mk > .5 + (nz - .5) * .8;
}

/* engine/models.js wreckHash: an integer hash of the 0.25 m cell (exact on both sides) */
export function wreckHash(x, y, z) {
  const a = (Math.floor(x * 4) + 65536) >>> 0, b = (Math.floor(y * 4) + 65536) >>> 0, c = (Math.floor(z * 4) + 65536) >>> 0;
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return (h >>> 8) / 16777216;
}

/* ---------------------------------------------------------------- loose pieces */
const G = 9.81;
export function createBodies() {
  const list = [];
  const sys = { list, dots: 0 };
  /* a rigid clump: pts (x y z brightness nx ny nz, model frame, at detach), v0, spin */
  sys.clump = (uid, B, pts, v0, hot) => {
    const n = pts.length / 7; if (!n) return null;
    let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += pts[7 * i]; cy += pts[7 * i + 1]; cz += pts[7 * i + 2]; }
    cx /= n; cy /= n; cz /= n;
    const rel = new Float32Array(n * 4), nrm = new Int8Array(n * 3); let lowY = 1e9;
    for (let i = 0; i < n; i++) { rel[4 * i] = pts[7 * i] - cx; rel[4 * i + 1] = pts[7 * i + 1] - cy; rel[4 * i + 2] = pts[7 * i + 2] - cz; rel[4 * i + 3] = pts[7 * i + 3]; if (rel[4 * i + 1] < lowY) lowY = rel[4 * i + 1];
      nrm[3 * i] = Math.round(pts[7 * i + 4] * 127); nrm[3 * i + 1] = Math.round(pts[7 * i + 5] * 127); nrm[3 * i + 2] = Math.round(pts[7 * i + 6] * 127); }
    // the contact points: the lowest dots and the extremes (at most 24)
    const idx = [...Array(n).keys()];
    const pick = new Set();
    idx.sort((a, b) => rel[4 * a + 1] - rel[4 * b + 1]); for (let q = 0; q < Math.min(12, n); q++) pick.add(idx[Math.floor(q * Math.min(n, Math.max(12, n * .15)) / 12)]);
    for (const [ax, sg] of [[0, 1], [0, -1], [2, 1], [2, -1], [1, 1], [1, -1]]) { let b = 0; for (let i = 1; i < n; i++) if (sg * rel[4 * i + ax] > sg * rel[4 * b + ax]) b = i; pick.add(b); }
    const s = (n * 7919 + uid * 131) % 997 / 997;
    // crumpled: a piece that tore away is bent and dented (folds ~1 m, up to 0.45 m deep, along its own faces); near
    // its foot (where it tore free of the plating: the lowest metre) its edge is bitten ragged, curled outward and
    // scorched, the scorch fading up the piece (QA D23: no clean cardboard panels)
    { let ex = 0; for (let i = 0; i < n; i++) ex = Math.max(ex, Math.abs(rel[4 * i]), Math.abs(rel[4 * i + 1]), Math.abs(rel[4 * i + 2]));
      const A = Math.min(.45, .1 + .07 * ex);
      let hiY = -1e9; for (let i = 0; i < n; i++) hiY = Math.max(hiY, rel[4 * i + 1]); const tall = hiY - lowY > 1.5;   // (a piece that stood: a stack, a wall)
      const hsh = (i, k) => (Math.imul(i * 2654435761 + k * 40503 + (s * 1e6 | 0), 0x85EBCA77) >>> 0) / 4294967296;
      for (let i = 0; i < n; i++) { const x = rel[4 * i], y = rel[4 * i + 1], z = rel[4 * i + 2];
        const w = A * (Math.sin(x * 2.1 + s * 6.3) * Math.sin(z * 1.7 + y * 1.3 + s * 3.1) + .5 * Math.sin((x + z) * 4.3 + s * 9.7) + .35 * Math.sin(x * 7.9 - z * 6.1 + y * 5.3));
        const a = nrm[3 * i] / 127, c = nrm[3 * i + 1] / 127, d = nrm[3 * i + 2] / 127, two = a * a + c * c + d * d <= .01;
        const hf = y - lowY;                                           // height above the foot
        const e = Math.max(0, 1 - hf / 1.2);                           // near the torn edge
        // the edge: ragged (bitten away ever more toward the foot, with a wavy line)
        const edgeLine = .35 + .3 * Math.sin(x * 3.7 + z * 2.9 + s * 11) + .15 * hsh(i, 1);
        if (tall && hf < edgeLine) { rel[4 * i + 3] = -1; continue; }
        const curl = e * e * (.35 + .4 * hsh(i, 2));                     // curled outward, as a petal
        if (!two) { rel[4 * i] += a * (w + curl); rel[4 * i + 1] += c * (w + curl) - curl * .3; rel[4 * i + 2] += d * (w + curl); } else { rel[4 * i + 1] += w; }
        rel[4 * i + 3] *= .45 + .55 * Math.min(1, hf / 2.5);             // scorched near the tear, fading up
        // (crumpled faces: each ~0.5 m facet leans its own way, so the light breaks up over the piece instead of one flat
        // sheen; and no brighter than the ship it came from)
        if (!two) { const fx = Math.floor(x * 2), fy = Math.floor(y * 2), fz = Math.floor(z * 2), h1 = hsh(fx * 73 + fy * 19 + fz * 7, 3) - .5, h2 = hsh(fx * 31 + fy * 57 + fz * 13, 4) - .5, h3 = hsh(fx * 11 + fy * 5 + fz * 89, 5) - .5;
          let na = a + .9 * h1, nb = c + .9 * h2, nc = d + .9 * h3; const nl = Math.hypot(na, nb, nc) || 1;
          nrm[3 * i] = Math.round(na / nl * 127); nrm[3 * i + 1] = Math.round(nb / nl * 127); nrm[3 * i + 2] = Math.round(nc / nl * 127); }
        rel[4 * i + 3] *= .72;
      } }
    const b = { kind: 'clump', uid, B, p: [cx, cy, cz], v: v0.slice(), w: [(s - .5) * 1.2, (s * 7 % 1 - .5) * .6, (s * 13 % 1 - .5) * 1.2], R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      rel, nrm, n, low: Int32Array.from(pick), rest: false, gone: false, t: 0, hot: hot || 0, fade: 1, sea: false, still: 0 };
    list.push(b); return b;
  };
  /* single dots (the solver's loose plating): arrays x y z vx vy vz brightness, flags */
  sys.dotsOf = (uid, B, a, hot) => {
    const n = a.length / 8; if (!n) return null;
    const P = new Float32Array(n * 7), st = new Uint8Array(n);
    for (let i = 0; i < n; i++) { for (let q = 0; q < 6; q++) P[7 * i + q] = a[8 * i + q]; P[7 * i + 6] = a[8 * i + 6]; }
    const b = { kind: 'dots', uid, B, P, st, n, t: 0, hot: hot === undefined ? 1 : hot, gone: false, rest: false };
    list.push(b); return b;
  };
  /* one step of every body; floorAt(uid, x, y, z) -> the surface under a point (-1e9: open sea) */
  sys.step = (h, floorAt) => {
    if (!(h > 0)) return;
    h = Math.min(h, 1 / 20);
    for (let bi = list.length - 1; bi >= 0; bi--) {
      const b = list[bi];
      if (b.gone) { list.splice(bi, 1); continue; }
      b.t += h;
      if (b.kind === 'dots') stepDots(b, h, floorAt); else stepClump(b, h, floorAt);
    }
  };
  function stepDots(b, h, floorAt) {
    const P = b.P, st = b.st, kd = Math.exp(-.6 * h);
    // (what rests is looked at again now and then: the surface under it may have gone since)
    b.chk = (b.chk || 0) + h; const recheck = b.chk > .4; if (recheck) b.chk = 0;
    let live = 0;
    for (let i = 0; i < b.n; i++) {
      if (st[i] === 2) continue;
      const o = 7 * i;
      if (st[i] === 1) {                                           // at rest on a surface
        live++;
        if (recheck) { const f = floorAt(b.uid, P[o], P[o + 1] + .05, P[o + 2]); if (!f.wall && P[o + 1] - f.y > .25) st[i] = 0; }
        continue;
      }
      live++;
      const px = P[o], py = P[o + 1], pz = P[o + 2];
      let vx = P[o + 3] * kd, vy = P[o + 4] * kd - G * h, vz = P[o + 5] * kd;
      let x = px + vx * h, y = py + vy * h, z = pz + vz * h;
      const f = floorAt(b.uid, x, py, z);
      if (f.wall) { x = px; z = pz; vx *= -.2; vz *= -.2; }
      const fl = f.wall ? floorAt(b.uid, px, py, pz).y : f.y;
      if (fl < -1e8) {                                             // the sea: it sinks
        if (y < -.2) { vy = Math.max(vy, -2); vx *= .9; vz *= .9; if (y < -2.5) { st[i] = 2; continue; } }
      } else if (y <= fl + .02) {
        y = fl + .02;
        if (vy < -1.5) { vy = -vy * .15; vx *= .5; vz *= .5; } else { vx = vy = vz = 0; st[i] = 1; }
      }
      P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = vx; P[o + 4] = vy; P[o + 5] = vz;
    }
    if (!live) b.gone = true;
  }
  const tmp = [0, 0, 0];
  const rot = (R, x, y, z, o) => { o[0] = R[0] * x + R[1] * y + R[2] * z; o[1] = R[3] * x + R[4] * y + R[5] * z; o[2] = R[6] * x + R[7] * y + R[8] * z; return o; };
  // the gap under a piece: its lowest points against the surface under each (as blast/qa.js measures it)
  function restGap(b, floorAt) {
    let gap = 1e9;
    for (let q = 0; q < b.low.length; q++) { const i = b.low[q]; rot(b.R, b.rel[4 * i], b.rel[4 * i + 1], b.rel[4 * i + 2], tmp);
      const f = floorAt(b.uid, b.p[0] + tmp[0], b.p[1] + tmp[1] + .05, b.p[2] + tmp[2]); if (!f.wall && f.y > -1e8) gap = Math.min(gap, b.p[1] + tmp[1] - f.y); }
    return gap === 1e9 ? 0 : gap;
  }
  /* at rest only where it sits on something: a piece held up on a thin edge, a rail or a wall's top (its lowest points
     over the deck below, not on what caught it) slides and tips off toward its free side; one still caught after a
     second and a half breaks up (a small one: gone, as debris would be) or, a large one, drops onto what is under it */
  function tryRest(b, h, floorAt, cx, cz) {
    const gap = restGap(b, floorAt);
    if (gap <= .25) { b.rest = true; b.air = 0; b.v = [0, 0, 0]; b.w = [0, 0, 0]; return; }
    b.air = (b.air || 0) + h; b.idle = 0;
    if (b.air > 1.5) {
      if (b.n < 400) { b.gone = true; return; }
      b.p[1] -= gap - .02; b.rest = true; b.air = 0; b.v = [0, 0, 0]; b.w = [0, 0, 0]; return;   // (settled onto the surface under it)
    }
    const dx = b.p[0] - cx, dz = b.p[2] - cz, l = Math.hypot(dx, dz);
    const ux = l > .05 ? dx / l : Math.cos(b.n * 2.4), uz = l > .05 ? dz / l : Math.sin(b.n * 2.4);
    b.v[0] += ux * 1.5; b.v[2] += uz * 1.5; b.p[1] += .03;
    b.w[0] += uz * 1.2; b.w[2] -= ux * 1.2;   // (tips over the edge it caught)
  }
  function stepClump(b, h, floorAt) {
    if (b.rest) {
      b.still += h;
      if (b.still > .4) { b.still = 0; let gap = 1e9;
        for (let q = 0; q < b.low.length; q++) { const i = b.low[q]; rot(b.R, b.rel[4 * i], b.rel[4 * i + 1], b.rel[4 * i + 2], tmp);
          const f = floorAt(b.uid, b.p[0] + tmp[0], b.p[1] + tmp[1] + .05, b.p[2] + tmp[2]); if (!f.wall && f.y > -1e8) gap = Math.min(gap, b.p[1] + tmp[1] - f.y); }
        if (gap > .25) b.rest = false; }
      return;
    }
    const kd = Math.exp(-.3 * h);
    const p0 = b.p.slice();
    b.v[0] *= kd; b.v[2] *= kd; b.v[1] = b.v[1] * kd - G * h;
    b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.p[2] += b.v[2] * h;
    // spin: R <- exp(w h) R
    const wx = b.w[0] * h, wy = b.w[1] * h, wz = b.w[2] * h, th = Math.hypot(wx, wy, wz);
    if (th > 1e-6) {
      const kx = wx / th, ky = wy / th, kz = wz / th, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
      const Q = [c + kx * kx * C, kx * ky * C - kz * s, kx * kz * C + ky * s, ky * kx * C + kz * s, c + ky * ky * C, ky * kz * C - kx * s, kz * kx * C - ky * s, kz * ky * C + kx * s, c + kz * kz * C];
      const R = b.R, N = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) N[3 * i + j] = Q[3 * i] * R[j] + Q[3 * i + 1] * R[3 + j] + Q[3 * i + 2] * R[6 + j];
      b.R = N;
    }
    // contacts: the lowest point against the surface under it (walls: back where it was, the push reflected)
    let pen = -1e9, sea = true, wall = false, cx = 0, cz = 0;
    for (let q = 0; q < b.low.length; q++) {
      const i = b.low[q]; rot(b.R, b.rel[4 * i], b.rel[4 * i + 1], b.rel[4 * i + 2], tmp);
      const x = b.p[0] + tmp[0], y = b.p[1] + tmp[1], z = b.p[2] + tmp[2];
      const f = floorAt(b.uid, x, y - b.v[1] * h, z);
      if (f.wall) { wall = true; continue; }
      if (f.y > -1e8) { sea = false; if (f.y - y > pen) { pen = f.y - y; cx = x; cz = z; } }
    }
    if (wall) { b.p[0] = p0[0]; b.p[2] = p0[2]; b.v[0] *= -.25; b.v[2] *= -.25; }
    if (sea) {
      if (b.p[1] < -.3) { b.sea = true; b.v[1] = Math.max(b.v[1], -1.5); b.v[0] *= .95; b.v[2] *= .95; b.w = b.w.map(x => x * .95); b.fade = Math.max(0, 1 + (b.p[1] + .3) / 3); if (b.fade <= 0) b.gone = true; }
    } else if (pen > 0) {
      b.p[1] += pen;
      if (b.v[1] < -2) {
        // a hard landing crushes it: its lower part squashed and splayed, harder the faster it came down (once)
        if (!b.sagged) { b.sagged = true; const k = Math.min(.45, -b.v[1] * .04); let lo = 1e9, hi = -1e9;
          for (let i = 0; i < b.n; i++) { const y = b.rel[4 * i + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
          const H = Math.max(.5, hi - lo);
          for (let i = 0; i < b.n; i++) { const f = Math.max(0, 1 - (b.rel[4 * i + 1] - lo) / Math.min(H, 2)); if (f <= 0) continue;
            b.rel[4 * i + 1] -= (b.rel[4 * i + 1] - lo) * k * f; b.rel[4 * i] *= 1 + .25 * k * f; b.rel[4 * i + 2] *= 1 + .25 * k * f; } }
        b.v[1] = -b.v[1] * .12; b.v[0] *= .5; b.v[2] *= .5; b.w = b.w.map(x => x * .5); }
      else { b.v[1] = Math.max(0, b.v[1]); b.v[0] *= .6; b.v[2] *= .6; b.w = b.w.map(x => x * .5); }
      // at rest only if its middle is over a surface near its foot (else it tips off the edge it caught)
      const fc = floorAt(b.uid, b.p[0], b.p[1], b.p[2]), foot = b.p[1] - pen;
      const over = !fc.wall && fc.y > -1e8 && fc.y > foot - 1.2;
      if (!over && (b.stuck = (b.stuck || 0) + h) < .8) { const dx = b.p[0] - cx, dz = b.p[2] - cz, l = Math.hypot(dx, dz) || 1; b.v[0] += dx / l * 3 * h * 10; b.v[2] += dz / l * 3 * h * 10; }
      else if (!over && b.n < 200 && b.stuck < 3) { const dx = b.p[0] - cx, dz = b.p[2] - cz, l = Math.hypot(dx, dz) || 1; b.v[0] += dx / l * 6 * h * 10; b.v[2] += dz / l * 6 * h * 10; b.p[1] += .02; }   // (a small piece on an edge: pushed off harder)
      else if (!over && b.n < 200) b.gone = true;                                        // (still caught: it breaks up, not left hanging over the edge)
      else if (!over) tryRest(b, h, floorAt, cx, cz);                                  // (wedged: it rests on what it caught, if it truly sits on it)
      else if (Math.hypot(b.v[0], b.v[1], b.v[2]) < .35 && Math.hypot(...b.w) < .25) tryRest(b, h, floorAt, cx, cz);
    }
    // (held where it is for half a second, by a surface or a wall it caught: at rest there)
    if (!b.rest && !b.sea) { const mv = Math.hypot(b.p[0] - p0[0], b.p[1] - p0[1], b.p[2] - p0[2]); b.idle = mv < .01 * h + 1e-4 ? (b.idle || 0) + h : 0;
      if (b.idle > .5) tryRest(b, h, floorAt, cx, cz); }
  }
  /* each dot of every body in the model frame: cb(uid, B, x, y, z, brightness, heat, fade, i); L: the light in the model
     frame (a clump's dots are lit by their own face as it turns) */
  sys.each = (cb, strideIn = 1, L = null) => {
    for (const b of list) {
      if (b.gone) continue;
      const stride = typeof strideIn === 'function' ? strideIn(b) : strideIn; if (!(stride > 0)) continue;
      const heat = b.hot * Math.exp(-b.t / 1.6);
      if (b.kind === 'dots') { for (let i = 0; i < b.n; i += stride) { if (b.st[i] === 2) continue; const o = 7 * i; cb(b.uid, b.B, b.P[o], b.P[o + 1], b.P[o + 2], b.P[o + 6], heat, 1, i); } continue; }
      const R = b.R, rel = b.rel;
      const N = b.nrm;
      for (let i = 0; i < b.n; i += stride) {
        if (rel[4 * i + 3] < 0) continue;                                     // (bitten off the torn edge)
        const x = rel[4 * i], y = rel[4 * i + 1], z = rel[4 * i + 2];
        let lit = 1;
        if (L && N) { const a = N[3 * i] / 127, c = N[3 * i + 1] / 127, d = N[3 * i + 2] / 127;
          if (a * a + c * c + d * d > .01) { const lx = R[0] * a + R[1] * c + R[2] * d, ly = R[3] * a + R[4] * c + R[5] * d, lz = R[6] * a + R[7] * c + R[8] * d;
            lit = .22 + .78 * Math.abs(lx * L[0] + ly * L[1] + lz * L[2]); } }
        cb(b.uid, b.B, b.p[0] + R[0] * x + R[1] * y + R[2] * z, b.p[1] + R[3] * x + R[4] * y + R[5] * z, b.p[2] + R[6] * x + R[7] * y + R[8] * z, rel[4 * i + 3] * lit, heat, b.fade, i);
      }
    }
  };
  sys.count = () => { let n = 0; for (const b of list) if (!b.gone) n += b.kind === 'dots' ? b.n : b.n; return n; };
  sys.dropUnit = uid => { for (const b of list) if (b.uid === uid) b.gone = true; };
  return sys;
}

/* ---------------------------------------------------------------- connectivity (after a hit settles; qa.js) */
/* the model's dots round the unit's patches (their boxes and 4 m more) as the shader draws them: which are dropped, and
   the clusters of kept dots (joined within 0.6 m) that touch nothing that holds them: no untouched dot of the model, no
   plating, nothing standing within 0.8 m of its plating. -> { dropped: [idx], orphan: [idx] (dropped, not flying),
   floating: [[idx...]], n } */
const ck3 = (a, b, c) => ((a + 2048) * 4096 + (b + 2048)) * 4096 + (c + 2048);
export function connectivity(Md, patches, T) {
  if (!Md || !Md.n || !patches.length) return { dropped: [], orphan: [], floating: [], n: 0 };
  const D = Md.D;
  let lo = [1e9, 1e9], hi = [-1e9, -1e9];
  for (const B of patches) {
    const F = B.spec.frame, b = B.spec.box;
    for (const cx of [b[0], b[3]]) for (const cy of [b[1], b[4]]) for (const cz of [b[2], b[5]]) {
      const x = F.O[0] + F.X[0] * cx + F.Y[0] * cy + F.Z[0] * cz, z = F.O[2] + F.X[2] * cx + F.Y[2] * cy + F.Z[2] * cz;
      lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], z); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], z);
    }
  }
  const idx = [], cls = [], over = [], info = {};
  eachInColumns(Md, lo[0] - 4, lo[1] - 4, hi[0] + 4, hi[1] + 4, i => {
    const o = 7 * i; let c = K.NONE, anch = false, dead = 0;
    const ins = Md.ins && Md.ins[D[o + 6]];
    for (const B of patches) { c = classify(B, D[o], D[o + 1], D[o + 2], D[o + 3], D[o + 4], D[o + 5], info, ins); if (c !== K.NONE) { anch = (c === K.COL || c === K.BEHIND) && (Math.abs(info.off) < .8 || (ins && c === K.BEHIND));
      if (info.up && (c === K.COL || c === K.BEHIND)) { const r = info.r, t = Math.max(0, Math.min(r.nv, info.j)) * (r.nu + 1) + Math.max(0, Math.min(r.nu, info.i)); dead = (r.cpu[4 * t + 3] | 0) & 3 ? 1 : 0; } break; } }
    if (c === K.HIDDEN) return;
    idx.push(i); over.push(dead); cls.push(c === K.NONE || c === K.PLATE || c === K.TORN || anch ? 1 : c === K.COLDROP || c === K.BEHINDDROP ? 2 : 0);
  });
  const n = idx.length, par = new Int32Array(n); for (let q = 0; q < n; q++) par[q] = q;
  const fd = q => { while (par[q] !== q) { par[q] = par[par[q]]; q = par[q]; } return q; };
  const cell = new Map(), CL = .6, dropped = [], orphan = [];
  for (let q = 0; q < n; q++) {
    if (cls[q] === 2) { dropped.push(idx[q]); if (T && !T[idx[q]]) orphan.push(idx[q]); continue; }
    const o = 7 * idx[q], k = ck3(Math.floor(D[o] / CL), Math.floor(D[o + 1] / CL), Math.floor(D[o + 2] / CL));
    const l = cell.get(k); if (l) { const a = fd(l), b = fd(q); if (a !== b) par[a] = b; } else cell.set(k, q);
  }
  for (const [k, q] of cell) {
    for (let dx = 0; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && (dy < 0 || (!dy && dz <= 0))) continue;
      const m = cell.get(k + dx * 16777216 + dy * 4096 + dz); if (m === undefined) continue; const ra = fd(q), rb = fd(m); if (ra !== rb) par[ra] = rb; }
  }
  const anchored = new Set(), groups = new Map(), aY = new Map(), deadN = new Map();
  for (let q = 0; q < n; q++) { if (cls[q] === 2) continue; const r = fd(q); if (cls[q] === 1) { anchored.add(r); aY.set(r, Math.min(aY.has(r) ? aY.get(r) : 1e9, D[7 * idx[q] + 1])); }
    if (over[q]) deadN.set(r, (deadN.get(r) || 0) + 1);
    let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(idx[q]); }
  const floating = [], hanging = [];
  for (const [r, g] of groups) {
    if (!anchored.has(r)) { floating.push(g); continue; }
    // anchored, but only from well above while dots of it are over dead plating (a part hanging into a hole from its top)
    const dn = deadN.get(r) || 0; if (dn < 20) continue;
    let minY = 1e9; for (const i of g) if (D[7 * i + 1] < minY) minY = D[7 * i + 1];
    if (aY.get(r) > minY + 1.5) hanging.push(g);
  }
  return { dropped, orphan, floating, hanging, n };
}
