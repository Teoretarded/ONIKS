/* Polylines for the generators: winding centre lines (fjords, channels, rivers) and a distance field to
   them on a grid that also carries the nearest line's attributes (width, depth, position along it). */
import { Heap } from './grid.js';

/* resample a polyline every `step` metres and push it sideways by noise (amplitude `amp` metres,
   wavelength `wl`), keeping the ends fixed. pts: [[x, z], ...] -> [[x, z, s(0..1)], ...] */
export function wind(pts, step, amp, wl, noise, seed, meander) {
  const out = [];
  let total = 0; const segL = [];
  for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segL.push(L); total += L; }
  const n = Math.max(2, Math.ceil(total / step));
  let si = 0, acc = 0;
  for (let k = 0; k <= n; k++) {
    const s = k / n * total;
    while (si < segL.length - 1 && acc + segL[si] < s) { acc += segL[si]; si++; }
    const u = segL[si] ? (s - acc) / segL[si] : 0;
    const a = pts[si], b = pts[si + 1];
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    const tx = (b[0] - a[0]) / (segL[si] || 1), tz = (b[1] - a[1]) / (segL[si] || 1);
    const f = s / total, env = Math.sin(Math.PI * Math.min(1, f * 1.0)) ** 0.5;   // pinned ends
    // fbm drift, plus (optionally) regular meander loops whose size breathes along the line
    let off = amp * env * 2.2 * noise.fbm(s / wl + seed * 13.1, seed * 7.7, 3);
    if (meander) off += meander[0] * env * (0.6 + 0.4 * noise.n2(s / (meander[1] * 3) + seed, 3.3)) * Math.sin(s / meander[1] * Math.PI * 2 + seed * 1.7);
    out.push([x - tz * off, z + tx * off, f]);
  }
  return out;
}

/* Distance field on a node grid (cols x rows, cell, x0, z0) to a set of polylines whose vertices carry
   attributes. lines: [{ pts: [[x, z, s]...], attr(s) -> [a0, a1, a2] }]. Exact point-segment distance
   for nodes within `maxD` of a segment (segments are bucketed); elsewhere dist = maxD.
   Returns { dist: Float32Array, a0, a1, a2: Float32Array (attributes of the nearest point), id: Int16Array } */
export function lineField(G, lines, maxD) {
  const { cols, rows, cell, x0, z0 } = G, n = cols * rows;
  const dist = new Float32Array(n).fill(maxD), a0 = new Float32Array(n), a1 = new Float32Array(n), a2 = new Float32Array(n);
  const id = new Int16Array(n).fill(-1);
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li], P = L.pts;
    const AT = P.map(p => { const a = L.attr(p[2]); return [a[0], a[1], a[2] || 0]; });
    for (let s = 0; s < P.length - 1; s++) {
      const [ax, az] = P[s], [bx, bz] = P[s + 1];
      const A0 = AT[s], B0 = AT[s + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const R = maxD;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - x0) / cell)), i1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + R - x0) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - z0) / cell)), j1 = Math.min(rows - 1, Math.ceil((Math.max(az, bz) + R - z0) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = z0 + j * cell;
        for (let i = i0; i <= i1; i++) {
          const x = x0 + i * cell;
          let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
          const px = ax + dx * u - x, pz = az + dz * u - z, d = Math.sqrt(px * px + pz * pz);
          const k = j * cols + i;
          // compare in units of the local width so a wide channel wins over a thin one nearby
          const w = A0[0] + (B0[0] - A0[0]) * u;
          const dn = d / w, cur = id[k] < 0 ? Infinity : dist[k] / a0[k];
          if (dn < cur) { dist[k] = d; a0[k] = w; a1[k] = A0[1] + (B0[1] - A0[1]) * u; a2[k] = A0[2] + (B0[2] - A0[2]) * u; id[k] = li; }
        }
      }
    }
  }
  return { dist, a0, a1, a2, id };
}

/* flood-fill labels of connected land (h > 0) on a grid; returns Int32Array labels (0 = water) and sizes */
export function labelLand(data, cols, rows) {
  const lab = new Int32Array(cols * rows), sizes = [0];
  const st = new Int32Array(cols * rows);
  let L = 0;
  for (let k = 0; k < data.length; k++) {
    if (data[k] <= 0 || lab[k]) continue;
    L++; let sp = 0, cnt = 0; st[sp++] = k; lab[k] = L;
    while (sp) {
      const q = st[--sp]; cnt++;
      const i = q % cols, j = (q / cols) | 0;
      if (i > 0 && !lab[q - 1] && data[q - 1] > 0) { lab[q - 1] = L; st[sp++] = q - 1; }
      if (i < cols - 1 && !lab[q + 1] && data[q + 1] > 0) { lab[q + 1] = L; st[sp++] = q + 1; }
      if (j > 0 && !lab[q - cols] && data[q - cols] > 0) { lab[q - cols] = L; st[sp++] = q - cols; }
      if (j < rows - 1 && !lab[q + cols] && data[q + cols] > 0) { lab[q + cols] = L; st[sp++] = q + cols; }
    }
    sizes.push(cnt);
  }
  return { lab, sizes };
}

export { Heap };
