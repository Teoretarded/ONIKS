/* Point samples of the unit models, taken from the engine's own model caches (the coarse levels the renderer
   already holds), flattened once per model key:
     rest   model-space points at the rest pose (contact clouds, the scan's tendrils)   Float32Array 3n
     nrm    model-space normals                                                        Float32Array 3n
     loc    part-local points (per-part boxes follow part.xf(st))                      Float32Array 3n
     part   part index of each point                                                   Uint16Array n
   plus the voxel graph the lightning reveal runs over (random-weighted shortest paths = branching fronts). */
import { rng, clamp } from './core.js';

const cache = new Map();

export function sampleOf(R, key, want) {
  want = want || 2200;
  const k = key + '|' + want;
  let s = cache.get(k);
  if (s) return s;
  if (!R.models.has(key)) return null;
  const e = R.models.get(key);

  // pick the level whose total is closest to what we want (never much over it)
  let lod = e.lods.length - 1;
  const counts = [];
  // (never the finest level: it can be millions of points)
  for (let l = e.lods.length - 1; l >= Math.min(1, e.lods.length - 1); l--) {
    let n = 0;
    for (const P of e.parts) {
      if (P.part.show && !safe(() => P.part.show({}))) continue;
      const c = R.models.cloud(e, P, l, {}, true);
      n += c && c.n ? c.n : 0;
    }
    counts[l] = n;
    lod = l;
    if (n >= want * .7) break;
  }
  const total = counts[lod] || 1, stride = Math.max(1, Math.round(total / want));
  const rest = [], nrm = [], loc = [], part = [], parts = [];
  e.parts.forEach((P, pi) => {
    parts.push({ name: P.name, part: P.part, i0: 0, i1: 0 });
    if (P.part.show && !safe(() => P.part.show({}))) return;
    const c = R.models.cloud(e, P, lod, {}, true);
    if (!c || !c.n || !c.pts) return;
    const X = P.part.xf ? safe(() => P.part.xf({})) : null;
    const f = c.pts, b = new Int8Array(f.buffer, f.byteOffset, f.byteLength);
    parts[pi].i0 = part.length;
    // small parts keep at least a few points so their boxes exist
    const st = Math.max(1, Math.min(stride, Math.floor(c.n / 6)));
    for (let i = 0; i < c.n; i += st) {
      const x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2];
      const nx = b[i * 16 + 12] / 127, ny = b[i * 16 + 13] / 127, nz = b[i * 16 + 14] / 127;
      loc.push(x, y, z);
      if (X) {
        const M = X.R, T = X.T;
        rest.push(M[0] * x + M[1] * y + M[2] * z + T[0], M[3] * x + M[4] * y + M[5] * z + T[1], M[6] * x + M[7] * y + M[8] * z + T[2]);
        nrm.push(M[0] * nx + M[1] * ny + M[2] * nz, M[3] * nx + M[4] * ny + M[5] * nz, M[6] * nx + M[7] * ny + M[8] * nz);
      } else { rest.push(x, y, z); nrm.push(nx, ny, nz); }
      part.push(pi);
    }
    parts[pi].i1 = part.length;
  });
  const n = part.length;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = rest[i * 3 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
  s = {
    key, n, lod, parts,
    rest: new Float32Array(rest), nrm: new Float32Array(nrm), loc: new Float32Array(loc), part: new Uint16Array(part),
    mn, mx, L: Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1), center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
    radius: e.radius, graph: null,
  };
  cache.set(k, s);
  return s;
}
function safe(f) { try { return f(); } catch (e) { return null; } }

/* voxel graph over the rest points: nodes { p (centroid), m (point indices), nb (neighbour ids) }. A dense grid
   of cell -> node ids (the model's box is ~34 cells a side), so building it is a few ms at most. */
export function graphOf(s) {
  if (s.graph) return s.graph;
  const H = s.L / 34, mn = s.mn;
  const NX = Math.max(1, Math.floor((s.mx[0] - mn[0]) / H) + 1), NY = Math.max(1, Math.floor((s.mx[1] - mn[1]) / H) + 1), NZ = Math.max(1, Math.floor((s.mx[2] - mn[2]) / H) + 1);
  const grid = new Int32Array(NX * NY * NZ).fill(-1), nodes = [];
  for (let i = 0; i < s.n; i++) {
    const x = s.rest[i * 3], y = s.rest[i * 3 + 1], z = s.rest[i * 3 + 2];
    const ix = Math.min(NX - 1, Math.floor((x - mn[0]) / H)), iy = Math.min(NY - 1, Math.floor((y - mn[1]) / H)), iz = Math.min(NZ - 1, Math.floor((z - mn[2]) / H));
    const c = (ix * NY + iy) * NZ + iz;
    let id = grid[c], nd;
    if (id < 0) { id = grid[c] = nodes.length; nd = { id, ix, iy, iz, p: [0, 0, 0], m: [], nb: null }; nodes.push(nd); }
    else nd = nodes[id];
    nd.m.push(i); nd.p[0] += x; nd.p[1] += y; nd.p[2] += z;
  }
  for (const nd of nodes) { const k = nd.m.length; nd.p[0] /= k; nd.p[1] /= k; nd.p[2] /= k; }
  for (const nd of nodes) {
    nd.nb = [];
    for (let dx = -2; dx <= 2; dx++) {
      const x = nd.ix + dx; if (x < 0 || x >= NX) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const y = nd.iy + dy; if (y < 0 || y >= NY) continue;
        for (let dz = -2; dz <= 2; dz++) {
          const z = nd.iz + dz; if (z < 0 || z >= NZ || (!dx && !dy && !dz)) continue;
          const q = grid[(x * NY + y) * NZ + z];
          if (q >= 0) nd.nb.push(q);
        }
      }
    }
  }
  s.graph = { nodes, H };
  return s.graph;
}

/* branching reveal from the node nearest a model-space entry point: per point arrival (s, 0..dur) and the
   parent of each node (for the lightning links). Heavy-tailed edge costs fork the front into tendrils (p1). */
export function revealFrom(s, entry, seed, dur) {
  const g = graphOf(s), nodes = g.nodes, N = nodes.length;
  const rr = rng(seed), t = new Float32Array(N).fill(1e9), par = new Int32Array(N).fill(-1);
  let best = 0, bd = 1e18;
  for (let i = 0; i < N; i++) { const p = nodes[i].p, d = (p[0] - entry[0]) ** 2 + (p[1] - entry[1]) ** 2 + (p[2] - entry[2]) ** 2; if (d < bd) { bd = d; best = i; } }
  const cost = new Float32Array(N); for (let i = 0; i < N; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
  // binary heap of [d, i]
  const hd = [], hi = [];
  const push = (d, i) => { hd.push(d); hi.push(i); let k = hd.length - 1; while (k) { const p = (k - 1) >> 1; if (hd[p] <= hd[k]) break; [hd[p], hd[k]] = [hd[k], hd[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
  const pop = () => {
    const d = hd[0], i = hi[0], ld = hd.pop(), li = hi.pop();
    if (hd.length) { hd[0] = ld; hi[0] = li; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hd.length && hd[l] < hd[m]) m = l; if (r < hd.length && hd[r] < hd[m]) m = r; if (m === k) break; [hd[m], hd[k]] = [hd[k], hd[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; } }
    return [d, i];
  };
  t[best] = 0; push(0, best);
  while (hd.length) {
    const [d, i] = pop(); if (d > t[i]) continue;
    const a = nodes[i];
    for (const j of a.nb) {
      const b = nodes[j], L = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
      const nd = d + L * cost[j];
      if (nd < t[j]) { t[j] = nd; par[j] = i; push(nd, j); }
    }
  }
  let mx = 0; for (let i = 0; i < N; i++) if (t[i] < 1e8 && t[i] > mx) mx = t[i];
  const k = dur / Math.max(1e-6, mx);
  const nodeT = new Float32Array(N);
  for (let i = 0; i < N; i++) nodeT[i] = t[i] < 1e8 ? t[i] * k : dur;
  const pt = new Float32Array(s.n), jr = rng(seed + 7);
  for (let i = 0; i < N; i++) for (const m of nodes[i].m) pt[m] = nodeT[i] + jr() * .04;
  return { nodeT, par, pt };
}

/* model-space point of the sample nearest to a direction from the centre (the side the front arrives from) */
export function entryToward(s, dirX, dirY, dirZ) {
  const c = s.center, half = s.L * .5;
  return [c[0] + dirX * half, clamp(c[1] + dirY * half, s.mn[1], s.mx[1]), c[2] + dirZ * half];
}
