/* Contour lines of a height grid: marching squares on the node grid (the crossings interpolated linearly along the
   cell edges, so the 0 m line is exactly the waterline the point terrain draws), saddles resolved by the cell
   centre, the segments chained into polylines and simplified (Douglas-Peucker). Pure: no DOM, no GL, so it runs
   on the main thread or in contours_worker.js.

   extractContours({ heights, cols, rows, cell, x0, z0, levels: [m, ...], tol: m, minLen: m, minLenCoast: m,
                     blur: nodes (box blur radius of the grid for every level but 0: cartographic generalisation),
                     blurCoast: nodes (the same for the 0 m line; small, so it stays on the dotted waterline),
                     smooth: Chaikin passes after the simplification, tolCoast: m (the 0 m line's tolerance) })
     -> [{ level, lines: [Float32Array [x, z, x, z, ...], ...], closed: [bool, ...] }]
   Grid: row 0 = south (z0), col 0 = west (x0), node (i, j) at (x0 + i * cell, z0 + j * cell). */

const BS = 16;                     // block side (cells) for the min / max skip

export function extractContours(o) {
  const H0 = o.heights, cols = o.cols, rows = o.rows, cell = o.cell, x0 = o.x0, z0 = o.z0;
  const HB = o.blur > 0 ? boxBlur(H0, cols, rows, o.blur | 0) : H0;
  const HC = o.blurCoast > 0 ? (o.blurCoast === o.blur ? HB : boxBlur(H0, cols, rows, o.blurCoast | 0)) : H0;
  let H = H0;
  const cc = cols - 1, cr = rows - 1;
  // min / max per block of cells (nodes inclusive), to skip blocks the level does not cross
  const bc = Math.ceil(cc / BS), br = Math.ceil(cr / BS);
  const blocks = G => {
    const bmin = new Float32Array(bc * br), bmax = new Float32Array(bc * br);
    for (let bj = 0; bj < br; bj++) for (let bi = 0; bi < bc; bi++) {
      let lo = Infinity, hi = -Infinity;
      const i1 = Math.min(cols - 1, (bi + 1) * BS), j1 = Math.min(rows - 1, (bj + 1) * BS);
      for (let j = bj * BS; j <= j1; j++) { const r = j * cols; for (let i = bi * BS; i <= i1; i++) { const v = G[r + i]; if (v < lo) lo = v; if (v > hi) hi = v; } }
      bmin[bj * bc + bi] = lo; bmax[bj * bc + bi] = hi;
    }
    return [bmin, bmax];
  };
  const B0 = blocks(HC), BB = HB === HC ? B0 : blocks(HB);
  const out = [];
  let segA = new Int32Array(1 << 16), segB = new Int32Array(1 << 16);
  for (const L of o.levels) {
    H = L === 0 ? HC : HB;
    const [bmin, bmax] = L === 0 ? B0 : BB;
    const tol = L === 0 ? (o.tolCoast === undefined ? cell * .12 : o.tolCoast) : (o.tol === undefined ? cell * .12 : o.tol);
    let ns = 0;
    const push = (a, b) => {
      if (ns >= segA.length) { const A = new Int32Array(segA.length * 2), Bq = new Int32Array(segA.length * 2); A.set(segA); Bq.set(segB); segA = A; segB = Bq; }
      segA[ns] = a; segB[ns] = b; ns++;
    };
    for (let bj = 0; bj < br; bj++) for (let bi = 0; bi < bc; bi++) {
      const k = bj * bc + bi;
      if (!(bmin[k] < L && bmax[k] >= L)) continue;
      const i1 = Math.min(cc, (bi + 1) * BS), j1 = Math.min(cr, (bj + 1) * BS);
      for (let j = bj * BS; j < j1; j++) {
        const r0 = j * cols, r1 = r0 + cols;
        for (let i = bi * BS; i < i1; i++) {
          const a = H[r0 + i], b = H[r0 + i + 1], c = H[r1 + i + 1], d = H[r1 + i];
          const cs = (a >= L ? 1 : 0) | (b >= L ? 2 : 0) | (c >= L ? 4 : 0) | (d >= L ? 8 : 0);
          if (cs === 0 || cs === 15) continue;
          // edge ids: S (a-b) = 2 n, W (a-d) = 2 n + 1, E (b-c) = 2 (n + 1) + 1, N (d-c) = 2 (n + cols)
          const n = r0 + i, S = n << 1, W = S + 1, E = ((n + 1) << 1) + 1, N = (n + cols) << 1;
          switch (cs) {
            case 1: case 14: push(S, W); break;
            case 2: case 13: push(S, E); break;
            case 3: case 12: push(W, E); break;
            case 4: case 11: push(E, N); break;
            case 6: case 9: push(S, N); break;
            case 7: case 8: push(W, N); break;
            case 5: if ((a + b + c + d) * .25 >= L) { push(S, E); push(W, N); } else { push(S, W); push(E, N); } break;
            case 10: if ((a + b + c + d) * .25 >= L) { push(S, W); push(E, N); } else { push(S, E); push(W, N); } break;
          }
        }
      }
    }
    // chain: every crossing edge joins at most two segments
    const first = new Map(), second = new Map();
    for (let s = 0; s < ns; s++) {
      for (const e of [segA[s], segB[s]]) { if (first.has(e)) second.set(e, s); else first.set(e, s); }
    }
    const other = (e, s) => { const f = first.get(e); if (f !== s) return f; const g = second.get(e); return g === undefined ? -1 : g; };
    const used = new Uint8Array(ns);
    const pos = (e, outp) => {
      const nd = e >> 1, vert = e & 1, i = nd % cols, j = (nd - i) / cols;
      const h0 = H[nd], h1 = vert ? H[nd + cols] : H[nd + 1];
      const t = h1 === h0 ? .5 : (L - h0) / (h1 - h0);
      outp.push(x0 + (i + (vert ? 0 : t)) * cell, z0 + (j + (vert ? t : 0)) * cell);
    };
    const lines = [], closed = [];
    const fwd = [], back = [];
    for (let s0 = 0; s0 < ns; s0++) {
      if (used[s0]) continue;
      used[s0] = 1;
      // forward from segB, backward from segA
      fwd.length = 0; back.length = 0;
      let isClosed = false;
      let s = s0, e = segB[s0];
      for (;;) {
        const t = other(e, s);
        if (t < 0) break;
        if (t === s0) { isClosed = true; break; }
        if (used[t]) break;
        used[t] = 1;
        fwd.push(e);
        e = segA[t] === e ? segB[t] : segA[t];
        s = t;
      }
      const endF = e;
      let startB = segA[s0];
      if (!isClosed) {
        s = s0; e = segA[s0];
        for (;;) {
          const t = other(e, s);
          if (t < 0 || used[t]) break;
          used[t] = 1;
          back.push(e);
          e = segA[t] === e ? segB[t] : segA[t];
          s = t;
        }
        startB = e;
      }
      // assemble the edge ids in order: startB, back reversed, segA[s0]?, ... fwd, endF
      const ids = [];
      if (!isClosed) {
        ids.push(startB);
        for (let k = back.length - 1; k >= 0; k--) ids.push(back[k]);
      }
      ids.push(segA[s0]);
      for (let k = 0; k < fwd.length; k++) ids.push(fwd[k]);
      ids.push(endF);
      if (isClosed && ids[ids.length - 1] === ids[0]) ids.pop();
      const P = [];
      for (const id of ids) pos(id, P);
      if (isClosed) P.push(P[0], P[1]);
      const len = polyLen(P);
      const minL = L === 0 ? (o.minLenCoast || 0) : (o.minLen || 0);
      if (len < minL) continue;
      let S = simplify(P, tol);
      for (let k = 0; k < (o.smooth || 0); k++) S = chaikin(S, isClosed);
      lines.push(S);
      closed.push(isClosed);
    }
    out.push({ level: L, lines, closed });
  }
  return out;
}

/* separable box blur of a grid, radius r nodes (edges clamped) */
function boxBlur(H, cols, rows, r) {
  const T = new Float32Array(H.length), O = new Float32Array(H.length), n = 2 * r + 1;
  for (let j = 0; j < rows; j++) {
    const o = j * cols;
    for (let i = 0; i < cols; i++) { let s = 0; for (let k = -r; k <= r; k++) s += H[o + Math.min(cols - 1, Math.max(0, i + k))]; T[o + i] = s / n; }
  }
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    let s = 0; for (let k = -r; k <= r; k++) s += T[Math.min(rows - 1, Math.max(0, j + k)) * cols + i]; O[j * cols + i] = s / n;
  }
  return O;
}
/* one Chaikin corner-cutting pass on a flat [x, z, ...] polyline (a closed one repeats its first point at the end) */
export function chaikin(P, closed) {
  const n = P.length >> 1;
  if (n < 3) return P;
  const out = [];
  if (!closed) out.push(P[0], P[1]);
  for (let i = 0; i < n - 1; i++) {
    const ax = P[i * 2], az = P[i * 2 + 1], bx = P[i * 2 + 2], bz = P[i * 2 + 3];
    out.push(ax * .75 + bx * .25, az * .75 + bz * .25, ax * .25 + bx * .75, az * .25 + bz * .75);
  }
  if (closed) out.push(out[0], out[1]); else out.push(P[n * 2 - 2], P[n * 2 - 1]);
  return new Float32Array(out);
}

function polyLen(P) { let s = 0; for (let i = 2; i < P.length; i += 2) s += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]); return s; }

/* Douglas-Peucker on a flat [x, z, ...] polyline -> Float32Array */
export function simplify(P, tol) {
  const n = P.length >> 1;
  if (n <= 2 || tol <= 0) return new Float32Array(P);
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [0, n - 1], t2 = tol * tol;
  while (stack.length) {
    const b = stack.pop(), a = stack.pop();
    const ax = P[a * 2], az = P[a * 2 + 1], bx = P[b * 2], bz = P[b * 2 + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let mi = -1, md = t2;
    for (let i = a + 1; i < b; i++) {
      const px = P[i * 2] - ax, pz = P[i * 2 + 1] - az;
      let d2;
      if (L2 < 1e-9) d2 = px * px + pz * pz;
      else { const u = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2)); const qx = px - u * dx, qz = pz - u * dz; d2 = qx * qx + qz * qz; }
      if (d2 > md) { md = d2; mi = i; }
    }
    if (mi >= 0) { keep[mi] = 1; stack.push(a, mi, mi, b); }
  }
  let m = 0; for (let i = 0; i < n; i++) if (keep[i]) m++;
  const out = new Float32Array(m * 2);
  let k = 0;
  for (let i = 0; i < n; i++) if (keep[i]) { out[k++] = P[i * 2]; out[k++] = P[i * 2 + 1]; }
  return out;
}
