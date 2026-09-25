/* Height grids: node grids (value at each node), row 0 = south, col 0 = west.
   Sampling (bilinear, Catmull-Rom), blur, distance to a mask, depression filling and flow accumulation
   for the carved (eroded-looking) valleys. DOM-free. */

export function makeGrid(W, H, cell) {
  const cols = Math.round(W / cell) + 1, rows = Math.round(H / cell) + 1;
  return { W, H, cell, cols, rows, x0: -W / 2, z0: -H / 2, data: new Float32Array(cols * rows) };
}

/* fill every node with f(x, z, i, j) */
export function fillGrid(g, f) {
  const { cols, rows, cell, x0, z0, data } = g;
  for (let j = 0; j < rows; j++) {
    const z = z0 + j * cell, o = j * cols;
    for (let i = 0; i < cols; i++) data[o + i] = f(x0 + i * cell, z, i, j);
  }
  return g;
}

export function bilinear(data, cols, rows, fx, fz) {
  if (fx < 0) fx = 0; else if (fx > cols - 1) fx = cols - 1;
  if (fz < 0) fz = 0; else if (fz > rows - 1) fz = rows - 1;
  let i = fx | 0, j = fz | 0;
  if (i >= cols - 1) i = cols - 2;
  if (j >= rows - 1) j = rows - 2;
  const u = fx - i, v = fz - j, o = j * cols + i;
  const a = data[o], b = data[o + 1], c = data[o + cols], d = data[o + cols + 1];
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/* Catmull-Rom (passes through the nodes: the large shapes stay exactly the source's) */
export function cubic(data, cols, rows, fx, fz) {
  if (fx < 0) fx = 0; else if (fx > cols - 1) fx = cols - 1;
  if (fz < 0) fz = 0; else if (fz > rows - 1) fz = rows - 1;
  let i = fx | 0, j = fz | 0;
  if (i >= cols - 1) i = cols - 2;
  if (j >= rows - 1) j = rows - 2;
  const u = fx - i, v = fz - j;
  const u2 = u * u, u3 = u2 * u, v2 = v * v, v3 = v2 * v;
  const a0 = -0.5 * u3 + u2 - 0.5 * u, a1 = 1.5 * u3 - 2.5 * u2 + 1, a2 = -1.5 * u3 + 2 * u2 + 0.5 * u, a3 = 0.5 * u3 - 0.5 * u2;
  const b0 = -0.5 * v3 + v2 - 0.5 * v, b1 = 1.5 * v3 - 2.5 * v2 + 1, b2 = -1.5 * v3 + 2 * v2 + 0.5 * v, b3 = 0.5 * v3 - 0.5 * v2;
  const im = i > 0 ? i - 1 : 0, ip = i + 1, ipp = i + 2 < cols ? i + 2 : cols - 1;
  const jm = j > 0 ? j - 1 : 0, jp = j + 1, jpp = j + 2 < rows ? j + 2 : rows - 1;
  const r = (jj) => { const o = jj * cols; return a0 * data[o + im] + a1 * data[o + i] + a2 * data[o + ip] + a3 * data[o + ipp]; };
  return b0 * r(jm) + b1 * r(j) + b2 * r(jp) + b3 * r(jpp);
}

/* separable box blur, n passes (approximates a gaussian) */
export function blur(data, cols, rows, rad, passes) {
  if (rad < 1) return data;
  const tmp = new Float32Array(data.length);
  const w = 1 / (2 * rad + 1);
  for (let p = 0; p < (passes || 2); p++) {
    for (let j = 0; j < rows; j++) {
      const o = j * cols;
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += data[o + Math.min(cols - 1, Math.max(0, k))];
      for (let i = 0; i < cols; i++) {
        tmp[o + i] = s * w;
        s += data[o + Math.min(cols - 1, i + rad + 1)] - data[o + Math.max(0, i - rad)];
      }
    }
    for (let i = 0; i < cols; i++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += tmp[Math.min(rows - 1, Math.max(0, k)) * cols + i];
      for (let j = 0; j < rows; j++) {
        data[j * cols + i] = s * w;
        s += tmp[Math.min(rows - 1, j + rad + 1) * cols + i] - tmp[Math.max(0, j - rad) * cols + i];
      }
    }
  }
  return data;
}

/* chamfer distance (in cells) from nodes where mask[i] != 0; 1 / 1.414 weights, two passes */
export function distance(mask, cols, rows) {
  const INF = 1e9, d = new Float32Array(cols * rows), D = 1.41421;
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 0 : INF;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i; let v = d[k];
    if (v === 0) continue;
    if (i > 0 && d[k - 1] + 1 < v) v = d[k - 1] + 1;
    if (j > 0) {
      if (d[k - cols] + 1 < v) v = d[k - cols] + 1;
      if (i > 0 && d[k - cols - 1] + D < v) v = d[k - cols - 1] + D;
      if (i < cols - 1 && d[k - cols + 1] + D < v) v = d[k - cols + 1] + D;
    }
    d[k] = v;
  }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
    const k = j * cols + i; let v = d[k];
    if (v === 0) continue;
    if (i < cols - 1 && d[k + 1] + 1 < v) v = d[k + 1] + 1;
    if (j < rows - 1) {
      if (d[k + cols] + 1 < v) v = d[k + cols] + 1;
      if (i < cols - 1 && d[k + cols + 1] + D < v) v = d[k + cols + 1] + D;
      if (i > 0 && d[k + cols - 1] + D < v) v = d[k + cols - 1] + D;
    }
    d[k] = v;
  }
  return d;
}

/* binary min-heap on (key, value) pairs in typed arrays */
export class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) { const k = new Float64Array(this.k.length * 2); k.set(this.k); this.k = k; const v = new Int32Array(this.v.length * 2); v.set(this.v); this.v = v; }
    let i = this.n++; const K = this.k, V = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  }
  pop() {
    const K = this.k, V = this.v, top = V[0];
    this.topKey = K[0];
    const n = --this.n; if (n <= 0) return top;
    const key = K[n], val = V[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= n) break;
      if (c + 1 < n && K[c + 1] < K[c]) c++;
      if (K[c] >= key) break;
      K[i] = K[c]; V[i] = V[c]; i = c;
    }
    K[i] = key; V[i] = val;
    return top;
  }
}

const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];

/* Flow on a land height grid: fills depressions (priority flood from the sea and the map edge), then
   routes every land node to its steepest filled neighbour and accumulates the drained area (cells).
   Returns { acc: Float32Array, down: Int32Array (-1 = outlet), filled: Float32Array }. */
export function flow(data, cols, rows) {
  const n = cols * rows, filled = new Float32Array(data), done = new Uint8Array(n);
  const heap = new Heap(n >> 2);
  const order = new Int32Array(n); let on = 0;
  for (let k = 0; k < n; k++) {
    const i = k % cols, j = (k / cols) | 0;
    if (data[k] <= 0 || i === 0 || j === 0 || i === cols - 1 || j === rows - 1) { done[k] = 1; heap.push(filled[k], k); }
  }
  // priority flood with a tiny epsilon so flats drain
  while (heap.n) {
    const k = heap.pop(); order[on++] = k;
    const i = k % cols, j = (k / cols) | 0, hk = filled[k];
    for (let d = 0; d < 8; d++) {
      const ii = i + DI[d], jj = j + DJ[d];
      if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
      const q = jj * cols + ii; if (done[q]) continue;
      done[q] = 1;
      if (filled[q] <= hk + 1e-3) filled[q] = hk + 1e-3;
      heap.push(filled[q], q);
    }
  }
  // downstream: the lowest filled neighbour (steepest by distance)
  const down = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    if (data[k] <= 0) continue;
    const i = k % cols, j = (k / cols) | 0, hk = filled[k];
    let best = -1, bs = 0;
    for (let d = 0; d < 8; d++) {
      const ii = i + DI[d], jj = j + DJ[d];
      if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
      const q = jj * cols + ii, s = (hk - filled[q]) / (d < 4 ? 1 : 1.41421);
      if (s > bs) { bs = s; best = q; }
    }
    down[k] = best;
  }
  // accumulate in reverse flood order (highest first)
  const acc = new Float32Array(n).fill(1);
  for (let o = on - 1; o >= 0; o--) { const k = order[o], q = down[k]; if (q >= 0) acc[q] += acc[k]; }
  return { acc, down, filled };
}

/* Carve valleys along the drainage of a height grid (in place on land, h > 0). The cut is
   min(cap, k * acc^e) scaled by fade(h), zero across filled depressions (their flats would drain in
   straight grid lines), blurred for width. Returns the cut grid. */
export function carve(data, cols, rows, k, e, cap, fade, jitter) {
  const n = cols * rows;
  // route over a slightly roughened copy so flats drain along natural, not grid-aligned, paths
  const src = new Float32Array(data);
  if (jitter) for (let q = 0; q < n; q++) if (src[q] > 0) src[q] += jitter(q % cols, (q / cols) | 0);
  const { acc, filled } = flow(src, cols, rows);
  const cut = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    if (data[q] <= 0) continue;
    const pond = filled[q] - src[q];
    const c = Math.min(cap, k * Math.pow(acc[q], e)) * (fade ? fade(data[q]) : 1) * (pond > 0.4 ? Math.max(0, 1 - (pond - 0.4) / 2) : 1);
    cut[q] = c;
  }
  blur(cut, cols, rows, 1, 1);
  for (let q = 0; q < n; q++) if (data[q] > 0 && cut[q] > 0) data[q] = Math.max(data[q] - cut[q], Math.min(data[q], 0.6 + data[q] * 0.12));
  return cut;
}
