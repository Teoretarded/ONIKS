/* Coarse navigation grids (land / sea) and A* with a path cache. Pure logic, no DOM.

   Land cells: every sample on land, slope under the limit (or a road). Roads cost less (trucks drive faster).
   Sea cells: every sample deeper than SEA_DEPTH; 'sub' cells (submarines): deeper than SUB_DEPTH. 'hover' cells (the
   LCAC): every sample water, or flat low ground (under HOVER_H, slope under HOVER_SLOPE) within HOVER_SHORE of the
   water: the beaches a hovercraft runs up onto. Connected
   components let unreachable goals be snapped to the nearest reachable cell without a failed search. */

export const SEA_DEPTH = 16;          // m: deepest draught (CVN 11.3 m) plus margin
export const SUB_DEPTH = 36;          // m: boats keep to deep water (room to dive under a ship's keel)
const LAND_SLOPE = .42;               // tan: steepest off-road cell
export const HOVER_H = 14, HOVER_SLOPE = .14, HOVER_SHORE = 1500;   // m, tan, m: the beaches of the 'hover' grid
const ROAD_COST = .5, SHORE_COST = 1.6;

class Heap {
  constructor(n) { this.k = new Int32Array(n); this.f = new Float64Array(n); this.n = 0; }
  push(k, f) {
    let i = this.n++; const K = this.k, F = this.f;
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; K[i] = K[p]; F[i] = F[p]; i = p; }
    K[i] = k; F[i] = f;
  }
  pop() {
    const K = this.k, F = this.f, top = K[0], n = --this.n;
    if (n > 0) {
      const k = K[n], f = F[n]; let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= f) break;
        K[i] = K[c]; F[i] = F[c]; i = c;
      }
      K[i] = k; F[i] = f;
    }
    return top;
  }
}

export class Nav {
  constructor(map, cell) {
    this.map = map;
    this.cell = cell || (Math.max(map.W, map.H) > 120000 ? 500 : 400);
    this.cols = Math.ceil(map.W / this.cell); this.rows = Math.ceil(map.H / this.cell);
    this.x0 = -map.W / 2; this.z0 = -map.H / 2;
    this.N = this.cols * this.rows;
    this.g = {};                      // dom -> { cost: Float32Array (0 = blocked), comp: Int32Array }
    this.cache = new Map();
    this.searches = 0; this.hits = 0;
    const N = this.N;
    this.gs = new Float64Array(N); this.par = new Int32Array(N); this.stamp = new Uint32Array(N); this.closed = new Uint32Array(N);
    this.sid = 0; this.heap = new Heap(N * 4);
  }
  cellOf(x, z) {
    let i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0) i = 0; else if (i >= this.cols) i = this.cols - 1;
    if (j < 0) j = 0; else if (j >= this.rows) j = this.rows - 1;
    return j * this.cols + i;
  }
  cx(k) { return this.x0 + ((k % this.cols) + .5) * this.cell; }
  cz(k) { return this.z0 + (Math.floor(k / this.cols) + .5) * this.cell; }

  grid(dom) {
    if (this.g[dom]) return this.g[dom];
    const { map, cols, rows, cell } = this, N = this.N, cost = new Float32Array(N), q = cell * .32;
    const road = this.roadMask();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, x = this.x0 + (i + .5) * cell, z = this.z0 + (j + .5) * cell;
      if (dom === 'land') {
        let ok = true;
        for (let s = 0; s < 5 && ok; s++) {
          const px = x + (s === 1 ? q : s === 2 ? -q : 0), pz = z + (s === 3 ? q : s === 4 ? -q : 0);
          if (map.h(px, pz) < .5) ok = false;
        }
        if (!ok) continue;
        const sl = map.slope(x, z);
        if (road[k]) cost[k] = ROAD_COST;
        else if (sl <= LAND_SLOPE) cost[k] = 1 + sl * 3;
      } else if (dom === 'hover') {
        let ok = true, land = 0;
        for (let s = 0; s < 9 && ok; s++) {
          const px = x + ((s % 3) - 1) * q, pz = z + (Math.floor(s / 3) - 1) * q, h = map.h(px, pz);
          if (h < 0) continue;
          land++;
          if (h > HOVER_H || map.slope(px, pz) > HOVER_SLOPE) ok = false;
        }
        if (ok && land && this.shoreDist()[k] > HOVER_SHORE) ok = false;
        if (ok) cost[k] = land ? 1.4 : 1;
      } else {
        let ok = true, shore = false;
        const D = dom === 'sub' ? SUB_DEPTH : SEA_DEPTH;
        for (let s = 0; s < 9 && ok; s++) {
          const px = x + ((s % 3) - 1) * q, pz = z + (Math.floor(s / 3) - 1) * q;
          const h = map.h(px, pz);
          if (h > -D) ok = false;
          else if (h > -D * (dom === 'sub' ? 1.8 : 3)) shore = true;
        }
        if (ok) cost[k] = shore ? SHORE_COST : 1;
      }
    }
    // components (4-connected flood fill)
    const comp = new Int32Array(N).fill(-1), st = new Int32Array(N); let nc = 0;
    for (let k0 = 0; k0 < N; k0++) {
      if (!cost[k0] || comp[k0] >= 0) continue;
      let sp = 0; st[sp++] = k0; comp[k0] = nc;
      while (sp) {
        const k = st[--sp], i = k % cols, j = (k - i) / cols;
        if (i > 0 && cost[k - 1] && comp[k - 1] < 0) { comp[k - 1] = nc; st[sp++] = k - 1; }
        if (i < cols - 1 && cost[k + 1] && comp[k + 1] < 0) { comp[k + 1] = nc; st[sp++] = k + 1; }
        if (j > 0 && cost[k - cols] && comp[k - cols] < 0) { comp[k - cols] = nc; st[sp++] = k - cols; }
        if (j < rows - 1 && cost[k + cols] && comp[k + cols] < 0) { comp[k + cols] = nc; st[sp++] = k + cols; }
      }
      nc++;
    }
    return (this.g[dom] = { cost, comp, road, nc });
  }
  roadMask() {
    if (this._road) return this._road;
    const m = new Uint8Array(this.N), roads = this.map.roads || [];
    for (const pl of roads) for (let s = 0; s + 1 < pl.length; s++) {
      const [ax, az] = pl[s], [bx, bz] = pl[s + 1], d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (this.cell / 3)));
      for (let e = 0; e <= n; e++) {
        const x = ax + (bx - ax) * e / n, z = az + (bz - az) * e / n;
        if (this.map.h(x, z) > .5) m[this.cellOf(x, z)] = 1;
      }
    }
    return (this._road = m);
  }
  isRoad(x, z) { return this.roadMask()[this.cellOf(x, z)] === 1; }
  open(dom, x, z) { return this.grid(dom).cost[this.cellOf(x, z)] > 0; }

  /* nearest open cell to k (optionally inside component c), ring search up to maxR cells */
  nearestOpen(dom, k, c, maxR) {
    const G = this.grid(dom), cols = this.cols, rows = this.rows, i0 = k % cols, j0 = (k - i0) / cols;
    const ok = kk => G.cost[kk] > 0 && (c === undefined || c < 0 || G.comp[kk] === c);
    if (ok(k)) return k;
    for (let r = 1; r <= (maxR || 60); r++) {
      let best = -1, bd = 1e18;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const kk = j * cols + i;
        if (ok(kk)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = kk; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /* path for a unit in `dom` from (sx, sz) to (gx, gz): [[x, z], ...] ending at the goal (or the nearest reachable
     point to it), or null when nothing is reachable. */
  path(dom, sx, sz, gx, gz) {
    const G = this.grid(dom);
    let s = this.cellOf(sx, sz), g = this.cellOf(gx, gz);
    if (!G.cost[s]) { s = this.nearestOpen(dom, s, -1, 8); if (s < 0) return null; }
    const c = G.comp[s];
    let exact = true;
    if (!G.cost[g] || G.comp[g] !== c) { g = this.nearestOpen(dom, g, c, 200); exact = false; if (g < 0) return null; }
    const key = dom + ':' + s + ':' + g;
    let cells = this.cache.get(key);
    if (cells) { this.hits++; this.cache.delete(key); this.cache.set(key, cells); }
    else {
      cells = this.astar(G, s, g, dom);
      if (!cells) return null;
      this.cache.set(key, cells);
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    }
    const out = [];
    for (let n = 1; n < cells.length; n++) out.push([this.cx(cells[n]), this.cz(cells[n])]);
    if (exact) { if (out.length) out[out.length - 1] = [gx, gz]; else out.push([gx, gz]); }
    else if (!out.length) out.push([this.cx(g), this.cz(g)]);
    return out;
  }

  astar(G, s, g, dom) {
    this.searches++;
    const { cols, gs, par, stamp, closed, heap } = this, cost = G.cost;
    const sid = ++this.sid; heap.n = 0;
    const gi = g % cols, gj = (g - gi) / cols, hmin = dom === 'land' ? ROAD_COST : 1;
    const H = k => { const i = k % cols, j = (k - i) / cols, dx = Math.abs(i - gi), dz = Math.abs(j - gj); return hmin * (Math.max(dx, dz) + .41421 * Math.min(dx, dz)); };
    gs[s] = 0; par[s] = -1; stamp[s] = sid; heap.push(s, H(s));
    let found = false, it = 0;
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (heap.n && it < 200000) {
      const k = heap.pop(); it++;
      if (closed[k] === sid) continue;
      closed[k] = sid;
      if (k === g) { found = true; break; }
      const i = k % cols, j = (k - i) / cols, ck = cost[k];
      for (let d = 0; d < 8; d++) {
        const ni = i + DI[d], nj = j + DJ[d];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= this.rows) continue;
        const nk = nj * cols + ni, cn = cost[nk];
        if (!cn || closed[nk] === sid) continue;
        if (d >= 4 && (!cost[j * cols + ni] || !cost[nj * cols + i])) continue;   // no corner cutting
        const step = (d >= 4 ? 1.41421 : 1) * (ck + cn) * .5, ng = gs[k] + step;
        if (stamp[nk] !== sid || ng < gs[nk]) { stamp[nk] = sid; gs[nk] = ng; par[nk] = k; heap.push(nk, ng + H(nk)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g; k >= 0; k = par[k]) cells.push(k);
    cells.reverse();
    return dom === 'land' ? this.collinear(cells) : this.pull(G, cells);
  }
  collinear(cells) {
    if (cells.length < 3) return cells;
    const out = [cells[0]], cols = this.cols;
    for (let n = 1; n < cells.length - 1; n++) {
      const a = out[out.length - 1], b = cells[n], c = cells[n + 1];
      const d1i = (b % cols) - (a % cols), d1j = Math.floor(b / cols) - Math.floor(a / cols);
      const d2i = (c % cols) - (b % cols), d2j = Math.floor(c / cols) - Math.floor(b / cols);
      if (d1i * d2j - d1j * d2i !== 0 || d1i * d2i + d1j * d2j <= 0 || Math.abs(d1i) + Math.abs(d1j) > 8) out.push(b);
    }
    out.push(cells[cells.length - 1]);
    return out;
  }
  /* string pulling: skip cells while the straight segment stays on open cells */
  pull(G, cells) {
    if (cells.length < 3) return cells;
    const out = [cells[0]]; let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.clear(G, cells[a], cells[b])) b--;
      out.push(cells[b]); a = b;
    }
    return out;
  }
  clear(G, a, b) {
    const cols = this.cols, ai = a % cols, aj = (a - ai) / cols, bi = b % cols, bj = (b - bi) / cols;
    const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2;
    for (let e = 1; e < n; e++) {
      const fi = ai + (bi - ai) * e / n, fj = aj + (bj - aj) * e / n;
      // test the 4 cells around the sample so the line never grazes a blocked corner
      for (const oi of [-.3, .3]) for (const oj of [-.3, .3]) {
        const i = Math.round(fi + oi), j = Math.round(fj + oj);
        if (!G.cost[j * cols + i]) return false;
      }
    }
    return true;
  }

  /* distance (m) from every land cell to the nearest water cell (for the AI's site choice) */
  shoreDist() {
    if (this._shore) return this._shore;
    const { cols, rows, N } = this, d = new Float32Array(N), INF = 1e9;
    for (let k = 0; k < N; k++) d[k] = this.map.h(this.cx(k), this.cz(k)) < 0 ? 0 : INF;
    const D = 1.41421;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) { v = Math.min(v, d[k - cols] + 1); if (i > 0) v = Math.min(v, d[k - cols - 1] + D); if (i < cols - 1) v = Math.min(v, d[k - cols + 1] + D); }
      d[k] = v;
    }
    for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
      const k = j * cols + i; let v = d[k];
      if (i < cols - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < rows - 1) { v = Math.min(v, d[k + cols] + 1); if (i < cols - 1) v = Math.min(v, d[k + cols + 1] + D); if (i > 0) v = Math.min(v, d[k + cols - 1] + D); }
      d[k] = v;
    }
    for (let k = 0; k < N; k++) d[k] *= this.cell;
    return (this._shore = d);
  }
}
