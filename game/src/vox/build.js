/* Voxel ships (prototype): a model's own dots turned into a lattice of 0.25 m plating cells, the one structure both the
   solver (vox/solver.js) and the picture (vox/render.js) use. No DOM, no GL: runs in the worker.

   voxelize(D, n, parts, ins, o) -> V
     D       the model's dots (blast/support.js modelDots: x y z nx ny nz part, model frame, ~0.3 m apart)
     parts   part names; ins: 1 for an interior part (decks, bulkheads, the spaces' contents)
   Each dot is splatted over its own patch of surface (a 3 x 3 cross on its tangent plane, +-0.12 m) into the cells of a
   grid of S = 0.25 m, so a hull sampled at ~0.3 m comes out without gaps; a cell's point is the mean of the samples in it
   (on the surface, no staircase), its normal the mean of theirs, its part the commonest. The cells are sorted along the
   hull (+Z), so the cells round any hit are one run of indices (the picture uploads only that run).

   V = { S, n, P (Float32 3n, rest point), N (Float32 3n, unit normal; 0 0 0 two-sided), part (Uint16), ins (Uint8),
         mat (Uint8: MATS index), t (Float32, plating m), m (Float32, kg), lo (grid origin, m), dim [nx, ny, nz],
         key (Int32: cell key ix + nx (iy + ny iz)), hash (open addressing: key -> index), zRun(z0, z1) -> [i0, i1) } */

export const S_VOX = .25;

/* materials (as blast/shell/model.js MATS; coarse public figures): E, yield, density, the failure strain's two terms
   (the bench's mesh regularisation: ef = eg + ee min(0.2, t / le)) */
export const MATS = [
  { key: 'hsla', E: 207e9, sy: 550e6, rho: 7850, eg: .056, ee: .54 },
  { key: 'mild', E: 200e9, sy: 235e6, rho: 7850, eg: .056, ee: .54 },
  { key: 'alu', E: 70e9, sy: 228e6, rho: 2660, eg: .034, ee: .32 },
  { key: 'kit', E: 200e9, sy: 300e6, rho: 7850, eg: .05, ee: .4 },     // equipment: mounts, launchers, machinery (heavy, stiff)
];
export const MAT_I = { hsla: 0, mild: 1, alu: 2, kit: 3 };

/* plating by part (warship: blast/spec.js HULL.warship, mm) */
function plating(name, ins, y) {
  if (ins) return /^ixS/.test(name) ? ['mild', 8, 1] : ['mild', 5, 1];
  if (name === 'hull') return ['hsla', y < 1.4 && y > -1.6 ? 12 : 10, 1];
  if (name === 'deck') return ['hsla', 9, 1];
  if (/^(super|hangar|spy|mast|arms|stacks|sps|decoys|island|house|bridge)/.test(name)) return ['alu', 6, 1];
  if (/^(gun|vls|ciws|mach|boats|rails|tube|mount|launcher|crane)/.test(name)) return ['kit', 10, 2.5];
  return ['mild', 6, 1];
}

/* the hull under the waterline the models lack (they stop near the waterline): dots on the layout's hull form
   (data/ship_layouts.js hb(z, y), keel(z)), both sides and the bottom, from the keel up to `top` m, ~0.2 m apart; the
   model's own hull dots take over above it. Returns { D, n } in modelDots' layout (part = the index of 'hull') */
export function hullDots(L, partI, o = {}) {
  if (!L || !L.hb || !L.keel || !L.hydro) return { D: new Float32Array(0), n: 0 };
  const sp = o.sp || .2, top = o.top === undefined ? .8 : o.top, half = (L.hydro.L || 150) * .5 + 6, out = [];
  for (let z = -half; z <= half; z += sp) {
    const kz = L.keel(z); if (!Number.isFinite(kz) || kz > top) continue;
    for (let y = kz; y <= top; y += sp) {
      const h = L.hb(z, y); if (!(h > .05)) continue;
      // the side's normal from the hull form's slopes
      const dy = (Math.max(0, L.hb(z, y + .3)) - Math.max(0, L.hb(z, y - .3))) / .6, dz = (Math.max(0, L.hb(z + .3, y)) - Math.max(0, L.hb(z - .3, y))) / .6;
      for (const sg of [1, -1]) { const l = Math.hypot(1, dy, dz); out.push(sg * h, y, z, sg / l, -dy / l, -dz / l, partI); }
    }
    // the bottom, across at the keel
    const hk = Math.max(0, L.hb(z, kz + .15));
    for (let x = -hk + sp * .5; x < hk; x += sp) out.push(x, kz, z, 0, -1, 0, partI);
  }
  return { D: Float32Array.from(out), n: out.length / 7 };
}

export function voxelize(D, n, parts, ins, o = {}) {
  const S = o.S || S_VOX;
  if (o.extra && o.extra.n) {
    // (extra dots: the hull under the waterline)
    const E = o.extra, D2 = new Float32Array((n + E.n) * 7); D2.set(D.subarray(0, n * 7)); D2.set(E.D, n * 7); D = D2; n += E.n;
  }
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = D[7 * i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  for (let k = 0; k < 3; k++) { lo[k] = (Math.floor(lo[k] / S) - 3) * S; hi[k] = (Math.ceil(hi[k] / S) + 3) * S; }
  const nx = Math.round((hi[0] - lo[0]) / S), ny = Math.round((hi[1] - lo[1]) / S), nz = Math.round((hi[2] - lo[2]) / S);
  // accumulators in an open-addressing table (cells are a few per dot)
  let cap = 1 << 20; while (cap < n * 3) cap <<= 1;
  const hk = new Int32Array(cap).fill(-1), hv = new Int32Array(cap);
  const acc = { x: new Float32Array(n * 2), y: new Float32Array(n * 2), z: new Float32Array(n * 2), nx: new Float32Array(n * 2), ny: new Float32Array(n * 2), nz: new Float32Array(n * 2),
    c: new Float32Array(n * 2), part: new Int32Array(n * 2), key: new Int32Array(n * 2), two: new Uint8Array(n * 2) };
  let m = 0;
  const grow = () => { for (const k in acc) { const a = acc[k], b = new a.constructor(a.length * 2); b.set(a); acc[k] = b; } };
  const slot = key => { let h = (Math.imul(key, 0x9E3779B1) >>> 0) & (cap - 1); for (;;) { const q = hk[h]; if (q === key || q === -1) return h; h = (h + 1) & (cap - 1); } };
  const add = (x, y, z, ax, ay, az, pi, w, two) => {
    const ix = Math.floor((x - lo[0]) / S), iy = Math.floor((y - lo[1]) / S), iz = Math.floor((z - lo[2]) / S);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    const key = ix + nx * (iy + ny * iz), h = slot(key);
    let j;
    if (hk[h] === -1) { if (m >= acc.c.length) grow(); hk[h] = key; hv[h] = j = m++; acc.key[j] = key; acc.part[j] = pi; acc.two[j] = 1; }
    else j = hv[h];
    // (normals of a thin plate seen from both faces: aligned with what the cell holds before they are summed)
    let s = 1; if (acc.nx[j] * ax + acc.ny[j] * ay + acc.nz[j] * az < 0) s = -1;
    acc.x[j] += x * w; acc.y[j] += y * w; acc.z[j] += z * w; acc.c[j] += w;
    acc.nx[j] += ax * s * w; acc.ny[j] += ay * s * w; acc.nz[j] += az * s * w;
    if (!two) acc.two[j] = 0;
    // (the commonest part: the outside beats the inside, then the first)
    if (ins[acc.part[j]] && !ins[pi]) acc.part[j] = pi;
  };
  const sp = o.splat === undefined ? .12 : o.splat;
  for (let i = 0; i < n; i++) {
    const q = 7 * i, x = D[q], y = D[q + 1], z = D[q + 2], ax = D[q + 3], ay = D[q + 4], az = D[q + 5], pi = D[q + 6];
    const l = Math.hypot(ax, ay, az);
    if (l < .2) { add(x, y, z, 0, 0, 0, pi, 1, true); continue; }
    const a = ax / l, b = ay / l, c = az / l;
    // tangent basis (Frisvad)
    let t1, t2;
    if (c < -.9999999) { t1 = [0, -1, 0]; t2 = [-1, 0, 0]; }
    else { const k = 1 / (1 + c), r = -a * b * k; t1 = [1 - a * a * k, r, -a]; t2 = [r, 1 - b * b * k, -b]; }
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
      if (u && v) continue;   // (a cross: the dot's own patch, not its corners)
      add(x + (t1[0] * u + t2[0] * v) * sp, y + (t1[1] * u + t2[1] * v) * sp, z + (t1[2] * u + t2[2] * v) * sp, a, b, c, pi, u || v ? .5 : 1, false);
    }
  }
  // the cells, sorted along the hull
  const ord = new Int32Array(m); for (let j = 0; j < m; j++) ord[j] = j;
  const zk = j => Math.floor(acc.key[j] / (nx * ny));
  ord.sort((a, b) => (zk(a) - zk(b)) || (acc.key[a] - acc.key[b]));
  const V = { S, n: m, lo, dim: [nx, ny, nz], P: new Float32Array(m * 3), N: new Float32Array(m * 3), part: new Uint16Array(m), ins: new Uint8Array(m),
    mat: new Uint8Array(m), t: new Float32Array(m), m: new Float32Array(m), key: new Int32Array(m), parts };
  for (let i = 0; i < m; i++) {
    const j = ord[i], w = acc.c[j];
    let x = acc.x[j] / w, y = acc.y[j] / w, z = acc.z[j] / w;
    // (the mean of a cell's samples kept inside the cell: a fold's two faces cannot drag it into the next one)
    const key = acc.key[j], ix = key % nx, iy = Math.floor(key / nx) % ny, iz = Math.floor(key / (nx * ny));
    const cx = lo[0] + (ix + .5) * S, cy = lo[1] + (iy + .5) * S, cz = lo[2] + (iz + .5) * S, hS = S * .5;
    x = Math.min(cx + hS, Math.max(cx - hS, x)); y = Math.min(cy + hS, Math.max(cy - hS, y)); z = Math.min(cz + hS, Math.max(cz - hS, z));
    V.P[3 * i] = x; V.P[3 * i + 1] = y; V.P[3 * i + 2] = z;
    const a = acc.nx[j], b = acc.ny[j], c = acc.nz[j], l = Math.hypot(a, b, c);
    if (!acc.two[j] && l > .3 * w) { V.N[3 * i] = a / l; V.N[3 * i + 1] = b / l; V.N[3 * i + 2] = c / l; }
    const pi = acc.part[j], name = parts[pi] || '';
    V.part[i] = pi; V.ins[i] = ins[pi] ? 1 : 0; V.key[i] = key;
    const [mk, mm, kmass] = plating(name, ins[pi], y);
    const M = MAT_I[mk], t = mm / 1000;
    V.mat[i] = M; V.t[i] = t; V.m[i] = MATS[M].rho * t * S * S * kmass;
  }
  // key -> index
  let hc = 1 << 18;
  /* (below: the index first, then the normals smoothed over each cell's own surface and the points put on the cells'
     footprints: the cells of a plate tile it exactly, so the picture's sub-dots join without seams or a mosaic) */ while (hc < m * 2) hc <<= 1;
  const HK = new Int32Array(hc).fill(-1), HV = new Int32Array(hc);
  for (let i = 0; i < m; i++) { const key = V.key[i]; let h = (Math.imul(key, 0x9E3779B1) >>> 0) & (hc - 1); while (HK[h] !== -1) h = (h + 1) & (hc - 1); HK[h] = key; HV[h] = i; }
  V.hash = { K: HK, V: HV, mask: hc - 1 };
  outsideGaps(V);
  orientNormals(V, 3);
  smoothNormals(V, 2);
  onFootprints(V);
  return V;
}

/* the index of the cell (ix, iy, iz), or -1 */
export function cellAt(V, ix, iy, iz) {
  const [nx, ny, nz] = V.dim;
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
  const key = ix + nx * (iy + ny * iz), H = V.hash;
  let h = (Math.imul(key, 0x9E3779B1) >>> 0) & H.mask;
  for (;;) { const q = H.K[h]; if (q === key) return H.V[h]; if (q === -1) return -1; h = (h + 1) & H.mask; }
}
export const cellOf = (V, i) => { const [nx, ny] = V.dim, k = V.key[i]; return [k % nx, Math.floor(k / nx) % ny, Math.floor(k / (nx * ny))]; };
/* the run of indices [i0, i1) whose cells lie between z0 and z1 (model m) */
export function zRun(V, z0, z1) {
  const [nx, ny] = V.dim, S = V.S, a = Math.floor((z0 - V.lo[2]) / S), b = Math.floor((z1 - V.lo[2]) / S);
  const zi = i => Math.floor(V.key[i] / (nx * ny));
  let l = 0, h = V.n; while (l < h) { const m = (l + h) >> 1; if (zi(m) < a) l = m + 1; else h = m; }
  const i0 = l; h = V.n; while (l < h) { const m = (l + h) >> 1; if (zi(m) <= b) l = m + 1; else h = m; }
  return [i0, l];
}

/* each normal averaged with its neighbours' on the same surface (facing within 60 deg), `passes` times */
function smoothNormals(V, passes) {
  const [nx, ny] = V.dim, N = V.N;
  for (let p = 0; p < passes; p++) {
    const O = new Float32Array(N.length);
    for (let i = 0; i < V.n; i++) {
      const a = N[3 * i], b = N[3 * i + 1], c = N[3 * i + 2]; if (a === 0 && b === 0 && c === 0) continue;
      const k = V.key[i], ix = k % nx, iy = Math.floor(k / nx) % ny, iz = Math.floor(k / (nx * ny));
      let sx = a * 2, sy = b * 2, sz = c * 2;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        const j = cellAt(V, ix + dx, iy + dy, iz + dz); if (j < 0) continue;
        const d = a * N[3 * j] + b * N[3 * j + 1] + c * N[3 * j + 2]; if (d < .5) continue;
        sx += N[3 * j]; sy += N[3 * j + 1]; sz += N[3 * j + 2];
      }
      const l = Math.hypot(sx, sy, sz) || 1; O[3 * i] = sx / l; O[3 * i + 1] = sy / l; O[3 * i + 2] = sz / l;
    }
    N.set(O);
  }
}
/* a cell's point moved onto its footprint: its two in-plate coordinates the cell's centre, the third on its plate */
function onFootprints(V) {
  const [nx, ny] = V.dim, S = V.S, P = V.P, N = V.N, lo = V.lo;
  for (let i = 0; i < V.n; i++) {
    const n = [N[3 * i], N[3 * i + 1], N[3 * i + 2]]; if (!n[0] && !n[1] && !n[2]) continue;
    const k = V.key[i], c = [lo[0] + (k % nx + .5) * S, lo[1] + (Math.floor(k / nx) % ny + .5) * S, lo[2] + (Math.floor(k / (nx * ny)) + .5) * S];
    const d = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2, t1 = (d + 1) % 3, t2 = (d + 2) % 3;
    const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
    let pd = p[d] - (n[t1] * (c[t1] - p[t1]) + n[t2] * (c[t2] - p[t2])) / n[d];
    pd = Math.min(c[d] + S * .6, Math.max(c[d] - S * .6, pd));
    P[3 * i + t1] = c[t1]; P[3 * i + t2] = c[t2]; P[3 * i + d] = pd;
  }
}

/* a cell whose normal points against most of its neighbours' on the same surface is turned round (a thin plate's two
   faces sampled into one cell can leave it facing in: drawn as a dark square on a lit hull) */
function orientNormals(V, passes) {
  const [nx, ny] = V.dim, N = V.N;
  for (let p = 0; p < passes; p++) {
    let flips = 0;
    for (let i = 0; i < V.n; i++) {
      const a = N[3 * i], b = N[3 * i + 1], c = N[3 * i + 2]; if (a === 0 && b === 0 && c === 0) continue;
      const k = V.key[i], ix = k % nx, iy = Math.floor(k / nx) % ny, iz = Math.floor(k / (nx * ny));
      let agree = 0, against = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        const j = cellAt(V, ix + dx, iy + dy, iz + dz); if (j < 0 || V.ins[j] !== V.ins[i]) continue;
        const d = a * N[3 * j] + b * N[3 * j + 1] + c * N[3 * j + 2];
        if (d > .6) agree++; else if (d < -.6) against++;
      }
      if (against > agree + 1) { N[3 * i] = -a; N[3 * i + 1] = -b; N[3 * i + 2] = -c; flips++; }
    }
    if (!flips) break;
  }
}

/* a cell only the interior filled, in the outside plating's own surface (a gap between the hull's samples that an
   interior wall lying along it filled): it is the plating (drawn dim, as interior, it was a dark square on the hull) */
function outsideGaps(V) {
  const [nx, ny] = V.dim, N = V.N, fix = [];
  for (let i = 0; i < V.n; i++) {
    if (!V.ins[i]) continue;
    const a = N[3 * i], b = N[3 * i + 1], c = N[3 * i + 2]; if (a === 0 && b === 0 && c === 0) continue;
    const k = V.key[i], ix = k % nx, iy = Math.floor(k / nx) % ny, iz = Math.floor(k / (nx * ny));
    let out = 0, best = -1;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const j = cellAt(V, ix + dx, iy + dy, iz + dz); if (j < 0 || V.ins[j]) continue;
      if (Math.abs(a * N[3 * j] + b * N[3 * j + 1] + c * N[3 * j + 2]) > .8) { out++; best = j; }
    }
    if (out >= 3) fix.push(i, best);
  }
  for (let q = 0; q < fix.length; q += 2) { const i = fix[q], j = fix[q + 1]; V.ins[i] = 0; V.part[i] = V.part[j]; V.mat[i] = V.mat[j]; V.t[i] = V.t[j]; V.m[i] = V.m[j]; }
}
