/* Analysis of a plan grid (the ~250 m grid every generator builds first): land mask, distances to the
   coast, shelter, capes, peaks; site search; and the road network (A* over slope). DOM-free. */
import { distance, Heap, bilinear } from './grid.js';
import { hash2 } from './noise.js';

export function analyze(P) {
  const { cols, rows, data } = P, n = cols * rows;
  const land = new Uint8Array(n), sea = new Uint8Array(n);
  for (let k = 0; k < n; k++) { if (data[k] > 0) land[k] = 1; else sea[k] = 1; }
  const dSea = distance(sea, cols, rows);    // for land nodes: cells to the nearest water
  const dLand = distance(land, cols, rows);  // for water nodes: cells to the nearest land
  const A = { P, land, dSea, dLand };
  A.h = (x, z) => bilinear(data, cols, rows, (x - P.x0) / P.cell, (z - P.z0) / P.cell);
  A.idx = (x, z) => {
    const i = Math.max(0, Math.min(cols - 1, Math.round((x - P.x0) / P.cell)));
    const j = Math.max(0, Math.min(rows - 1, Math.round((z - P.z0) / P.cell)));
    return j * cols + i;
  };
  A.xz = k => [P.x0 + (k % cols) * P.cell, P.z0 + ((k / cols) | 0) * P.cell];
  A.isLand = (x, z) => A.h(x, z) > 0;
  A.coastDist = (x, z) => dSea[A.idx(x, z)] * P.cell;     // metres to water (0 at sea)
  A.shoreDist = (x, z) => dLand[A.idx(x, z)] * P.cell;    // metres to land (0 on land)
  A.slope = (x, z) => {
    const c = P.cell, dx = (A.h(x + c, z) - A.h(x - c, z)) / (2 * c), dz = (A.h(x, z + c) - A.h(x, z - c)) / (2 * c);
    return Math.hypot(dx, dz);
  };
  /* fraction of 24 rays from (x, z) that reach land within R metres (1 = enclosed) */
  A.shelter = (x, z, R) => {
    let hit = 0; const st = P.cell;
    for (let a = 0; a < 24; a++) {
      const dx = Math.sin(a / 24 * Math.PI * 2), dz = Math.cos(a / 24 * Math.PI * 2);
      for (let r = st; r <= R; r += st) { if (A.h(x + dx * r, z + dz * r) > 0) { hit++; break; } }
    }
    return hit / 24;
  };
  /* fraction of water on a ring of radius R (a cape scores high) */
  A.seaFrac = (x, z, R) => {
    let s = 0;
    for (let a = 0; a < 24; a++) if (A.h(x + Math.sin(a / 24 * 6.2832) * R, z + Math.cos(a / 24 * 6.2832) * R) <= 0) s++;
    return s / 24;
  };
  /* highest point within R: [x, z, h] */
  A.peakNear = (x, z, R) => {
    let best = [x, z, A.h(x, z)];
    const st = P.cell;
    for (let dz = -R; dz <= R; dz += st) for (let dx = -R; dx <= R; dx += st) {
      if (dx * dx + dz * dz > R * R) continue;
      const hh = A.h(x + dx, z + dz); if (hh > best[2]) best = [x + dx, z + dz, hh];
    }
    return best;
  };
  /* direction (radians, 0 = north) to the nearest open water from a land point */
  A.seaward = (x, z) => {
    let best = 0, bd = 1e9;
    for (let a = 0; a < 32; a++) {
      const t = a / 32 * Math.PI * 2, dx = Math.sin(t), dz = Math.cos(t);
      for (let r = P.cell; r < 40000; r += P.cell) { if (A.h(x + dx * r, z + dz * r) <= -10) { if (r < bd) { bd = r; best = t; } break; } }
    }
    return best;
  };
  return A;
}

/* Scan the plan grid for the best site: score(x, z) -> number or -Infinity. Candidates on a stride,
   keeping `avoid` points at least `gap` metres away. Deterministic. */
export function bestSite(A, score, opt) {
  opt = opt || {};
  const P = A.P, stride = opt.stride || Math.max(1, Math.round(1000 / P.cell)), gap = opt.gap || 0, avoid = opt.avoid || [];
  const x0 = opt.box ? opt.box[0] : P.x0, x1 = opt.box ? opt.box[2] : -P.x0, z0 = opt.box ? opt.box[1] : P.z0, z1 = opt.box ? opt.box[3] : -P.z0;
  const edge = opt.edge == null ? 7000 : opt.edge;
  let best = null, bs = -Infinity;
  for (let z = Math.max(z0, P.z0 + edge); z <= Math.min(z1, -P.z0 - edge); z += stride * P.cell) {
    for (let x = Math.max(x0, P.x0 + edge); x <= Math.min(x1, -P.x0 - edge); x += stride * P.cell) {
      let ok = true;
      for (const a of avoid) { const dx = a.x - x, dz = a.z - z; if (dx * dx + dz * dz < gap * gap) { ok = false; break; } }
      if (!ok) continue;
      const s = score(x, z) + (opt.jitter ? opt.jitter * hash2(x | 0, z | 0, opt.seed || 7) : 0);
      if (s > bs) { bs = s; best = { x, z, s }; }
    }
  }
  return best;
}

/* ---------- roads: A* on a coarse grid over the final plan heights ---------- */
export function roadNetwork(A, nodes, opt) {
  opt = opt || {};
  const P = A.P, step = opt.step || Math.max(1, Math.round(400 / P.cell));
  const cols = Math.floor((P.cols - 1) / step) + 1, rows = Math.floor((P.rows - 1) / step) + 1, n = cols * rows;
  const cs = P.cell * step, hh = new Float32Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) hh[j * cols + i] = P.data[(j * step) * P.cols + i * step];
  const ford = opt.ford == null ? -2.5 : opt.ford;     // water shallower than this can be bridged
  const bridgeCost = opt.bridge || 14;
  const cellCost = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = k % cols, j = (k / cols) | 0, h = hh[k];
    if (h <= 0) { cellCost[k] = h > ford ? bridgeCost : Infinity; continue; }
    const hx = (hh[j * cols + Math.min(cols - 1, i + 1)] - hh[j * cols + Math.max(0, i - 1)]) / (2 * cs);
    const hz = (hh[Math.min(rows - 1, j + 1) * cols + i] - hh[Math.max(0, j - 1) * cols + i]) / (2 * cs);
    const s = Math.hypot(hx, hz);
    cellCost[k] = 1 + 60 * s * s + 400 * Math.max(0, s - 0.18) + (opt.costFn ? opt.costFn(P.x0 + i * cs, P.z0 + j * cs, h) : 0);
  }
  const toK = (x, z) => {
    const i = Math.max(0, Math.min(cols - 1, Math.round((x - P.x0) / cs))), j = Math.max(0, Math.min(rows - 1, Math.round((z - P.z0) / cs)));
    return j * cols + i;
  };
  // snap a node to the nearest land cell
  const snap = (x, z) => {
    let k = toK(x, z); if (cellCost[k] < 9 && hh[k] > 0) return k;
    const i0 = k % cols, j0 = (k / cols) | 0;
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
      const q = j * cols + i; if (hh[q] > 0 && cellCost[q] < 9) return q;
    }
    return -1;
  };
  const g = new Float32Array(n), from = new Int32Array(n), stamp = new Int32Array(n); let run = 0;
  const onRoad = new Uint8Array(n);
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DL = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
  function astar(a, b) {
    run++;
    const heap = new Heap(4096), bi = b % cols, bj = (b / cols) | 0;
    g[a] = 0; stamp[a] = run; from[a] = -1; heap.push(0, a);
    let guard = 0;
    while (heap.n) {
      const k = heap.pop();
      if (k === b) break;
      if (++guard > n * 2) return null;
      const i = k % cols, j = (k / cols) | 0, gk = g[k];
      for (let d = 0; d < 8; d++) {
        const ii = i + DI[d], jj = j + DJ[d];
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const q = jj * cols + ii, c = cellCost[q];
        if (c === Infinity) continue;
        // existing roads are cheap: branches join them instead of running parallel
        const ng = gk + DL[d] * (onRoad[q] ? 0.35 : c);
        if (stamp[q] !== run || ng < g[q]) {
          g[q] = ng; stamp[q] = run; from[q] = k;
          const hx = Math.abs(ii - bi), hz = Math.abs(jj - bj);
          heap.push(ng + 0.35 * (Math.max(hx, hz) + 0.4142 * Math.min(hx, hz)), q);
        }
      }
    }
    if (stamp[b] !== run) return null;
    const path = []; for (let k = b; k >= 0; k = from[k]) path.push(k);
    return path.reverse();
  }
  // reachable sets: connected passable cells (land, plus bridgeable shallows)
  const comp = new Int32Array(n); let nc = 0;
  { const st = new Int32Array(n);
    for (let k0 = 0; k0 < n; k0++) {
      if (comp[k0] || cellCost[k0] === Infinity) continue;
      nc++; let sp = 0; st[sp++] = k0; comp[k0] = nc;
      while (sp) {
        const k = st[--sp], i = k % cols, j = (k / cols) | 0;
        for (let d = 0; d < 4; d++) {
          const ii = i + DI[d], jj = j + DJ[d]; if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
          const q = jj * cols + ii; if (!comp[q] && cellCost[q] !== Infinity) { comp[q] = nc; st[sp++] = q; }
        }
      }
    } }
  // links: minimum spanning tree over straight distance within each reachable set, plus the extras
  const pts = nodes.map(p => ({ ...p, k: snap(p.x, p.z) })).filter(p => p.k >= 0);
  const links = [];
  const inTree = new Uint8Array(pts.length);
  for (let s = 0; s < pts.length; s++) {
    if (inTree[s]) continue;
    inTree[s] = 1;
    for (;;) {
      let best = null, bd = Infinity;
      for (let a = 0; a < pts.length; a++) if (inTree[a] && comp[pts[a].k] === comp[pts[s].k]) for (let b = 0; b < pts.length; b++) if (!inTree[b] && comp[pts[b].k] === comp[pts[s].k]) {
        const d = Math.hypot(pts[a].x - pts[b].x, pts[a].z - pts[b].z); if (d < bd) { bd = d; best = [a, b]; }
      }
      if (!best) break;
      inTree[best[1]] = 1; links.push(best);
    }
  }
  for (const [a, b] of (opt.extra || [])) { const ia = pts.findIndex(p => p.name === a), ib = pts.findIndex(p => p.name === b); if (ia >= 0 && ib >= 0) links.push([ia, ib]); }
  const roads = [];
  for (const [a, b] of links) {
    const path = astar(pts[a].k, pts[b].k); if (!path) continue;
    // cut the part that runs along an existing road; keep the new stretch plus one joint cell
    let s = 0, e = path.length - 1;
    while (s < e - 1 && onRoad[path[s + 1]]) s++;
    while (e > s + 1 && onRoad[path[e - 1]]) e--;
    const seg = path.slice(s, e + 1);
    if (seg.length < 2) continue;
    for (const k of seg) onRoad[k] = 1;
    let pl = seg.map(k => [P.x0 + (k % cols) * cs, P.z0 + ((k / cols) | 0) * cs]);
    pl = simplify(pl, cs * 0.6);
    pl = chaikin(pl, 2);
    roads.push(pl.map(p => [Math.round(p[0]), Math.round(p[1])]));
  }
  return roads;
}

function simplify(pl, tol) {
  if (pl.length < 3) return pl;
  const keep = new Uint8Array(pl.length); keep[0] = keep[pl.length - 1] = 1;
  const st = [[0, pl.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pl[a][0], az = pl[a][1], bx = pl[b][0], bz = pl[b][1], L = Math.hypot(bx - ax, bz - az) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - pl[i][1]) - (ax - pl[i][0]) * (bz - az)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pl.filter((_, i) => keep[i]);
}
function chaikin(pl, it) {
  for (let t = 0; t < it; t++) {
    if (pl.length < 3) return pl;
    const o = [pl[0]];
    for (let i = 0; i < pl.length - 1; i++) {
      const a = pl[i], b = pl[i + 1];
      o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    o.push(pl[pl.length - 1]); pl = o;
  }
  return pl;
}
