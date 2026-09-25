/* The generation pipeline shared by every map. DOM-free: runs in a Worker or on the main thread.

   1. plan:   the map's large shapes on a coarse grid (PLAN_CELL), raw heights (everything with a
              wavelength over ~1 km: coastlines, ranges, carved valleys, bathymetry).
   2. layout: places, objectives, spawns, the replenish point and roads, decided on the plan grid
              (so they never depend on the output resolution).
   3. fine:   the heightfield at the map's cell: Catmull-Rom of the plan + the map's detail (sub-km
              relief, cliffs, beaches, gullies), then levelled pads under objectives and spawns.

   A generator (gens/*.js) exports { plan(ctx) -> Float32Array, fine(ctx, x, z, raw, i, j) -> h,
   layout(ctx, A) -> {...}, shape?(ctx, x, z, raw) -> h }. */
import { makeGrid, cubic, bilinear } from './grid.js';
import { makeNoise, rng, ss } from './noise.js';
import { analyze, roadNetwork } from './analyze.js';

export const PLAN_CELL = 250;

export async function generate(def, gen, opts) {
  opts = opts || {};
  const t0 = now();
  const W = def.size[0], H = def.size[1];
  const ctx = { def, W, H, seed: def.seed, noise: makeNoise(def.seed), noise2: makeNoise(def.seed * 7 + 3), rng: rng(def.seed), opts };
  // 1. plan (raw)
  const P = makeGrid(W, H, PLAN_CELL);
  ctx.P = P;
  // sample any plan-sized array (aux fields the generator keeps for its fine pass)
  const pinv = 1 / P.cell;
  ctx.sampleP = (arr, x, z) => bilinear(arr, P.cols, P.rows, (x - P.x0) * pinv, (z - P.z0) * pinv);
  ctx.cubicP = (arr, x, z) => cubic(arr, P.cols, P.rows, (x - P.x0) * pinv, (z - P.z0) * pinv);
  await gen.plan(ctx, P);
  const t1 = now();
  // plan in final form (the map's shaping without sub-km detail) for analysis and roads
  const PF = { ...P, data: new Float32Array(P.data) };
  if (gen.shape) {
    const d = PF.data;
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) { const k = j * P.cols + i; d[k] = gen.shape(ctx, P.x0 + i * P.cell, P.z0 + j * P.cell, d[k]); }
  }
  ctx.PF = PF;
  const A = analyze(PF);
  ctx.A = A;
  // 2. layout
  const L = gen.layout(ctx, A);
  const pads = L.pads || [];
  if (!L.roads) {
    const nodes = [...L.places.filter(p => p.road !== false && A.isLand(p.x, p.z)), ...L.objectives.filter(o => A.isLand(o.x, o.z))];
    if (A.isLand(L.spawns.coast.x, L.spawns.coast.z)) nodes.push({ name: '_coast', x: L.spawns.coast.x, z: L.spawns.coast.z });
    L.roads = roadNetwork(A, nodes, L.roadOpts || {});
  }
  const t2 = now();
  // 3. fine
  const cell = opts.cell || def.cell;
  const F = makeGrid(W, H, cell);
  const src = P.data, pc = P.cols, pr = P.rows, inv = 1 / P.cell;
  const out = F.data, fcols = F.cols;
  for (let j = 0; j < F.rows; j++) {
    const z = F.z0 + j * cell, fz = (z - P.z0) * inv;
    for (let i = 0; i < fcols; i++) {
      const x = F.x0 + i * cell;
      const raw = cubic(src, pc, pr, (x - P.x0) * inv, fz);
      out[j * fcols + i] = gen.fine(ctx, x, z, raw, cell);
    }
  }
  // levelled pads: flat ground under launch sites, depots, radar hills (as the films grade their sites)
  for (const p of pads) {
    const r1 = p.r1 || p.r * 2, r0 = p.r;
    const target = p.h != null ? p.h : Math.max(p.min == null ? 2 : p.min, A.h(p.x, p.z) > 0 ? sampleF(F, p.x, p.z) : 2);
    const i0 = Math.max(0, Math.floor((p.x - r1 - F.x0) / cell)), i1 = Math.min(F.cols - 1, Math.ceil((p.x + r1 - F.x0) / cell));
    const j0 = Math.max(0, Math.floor((p.z - r1 - F.z0) / cell)), j1 = Math.min(F.rows - 1, Math.ceil((p.z + r1 - F.z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = F.x0 + i * cell, z = F.z0 + j * cell, d = Math.hypot(x - p.x, z - p.z);
      if (d >= r1) continue;
      const k = j * fcols + i, w = 1 - ss(r0, r1, d);
      if (out[k] <= 0 && !p.quay) continue;
      if (p.quay && out[k] <= 0 && d > r0) continue;      // a quay: the pad itself is filled, the sea around stays
      out[k] += (target - out[k]) * w;
    }
  }
  // every objective and the coast spawn stand on dry ground: fill a small quay where the fine relief
  // left the point awash
  for (const o of [...L.objectives, L.spawns.coast]) {
    if (sampleF(F, o.x, o.z) >= 1.5) continue;
    const r0 = 150, r1 = 380;
    const i0 = Math.max(0, Math.floor((o.x - r1 - F.x0) / cell)), i1 = Math.min(F.cols - 1, Math.ceil((o.x + r1 - F.x0) / cell));
    const j0 = Math.max(0, Math.floor((o.z - r1 - F.z0) / cell)), j1 = Math.min(F.rows - 1, Math.ceil((o.z + r1 - F.z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(F.x0 + i * cell - o.x, F.z0 + j * cell - o.z), k = j * fcols + i;
      if (d < r0) out[k] = Math.max(out[k], 2.5);
      else if (d < r1 && out[k] > 0) out[k] = Math.max(out[k], 2.5 * (1 - ss(r0, r1, d)));
    }
  }
  // road beds: along each road the ground is eased to a smoothed profile (cuts and embankments), so
  // roads read as clean lines and trucks do not ride the fine relief; bridges leave the water alone
  for (const pl of L.roads || []) {
    const S = [];
    for (let i = 0; i < pl.length - 1; i++) {
      const [ax, az] = pl[i], [bx, bz] = pl[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (cell * 0.7)));
      for (let s = 0; s < n; s++) { const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; S.push([x, z, sampleF(F, x, z)]); }
    }
    const R = Math.max(2, Math.round(600 / (cell * 0.7)));
    for (let i = 0; i < S.length; i++) {
      if (S[i][2] <= 0.5) continue;
      let sum = 0, n = 0;
      for (let k = Math.max(0, i - R); k <= Math.min(S.length - 1, i + R); k++) if (S[k][2] > 0.5) { sum += S[k][2]; n++; }
      const target = sum / n, [x, z] = S[i];
      const ci = Math.round((x - F.x0) / cell), cj = Math.round((z - F.z0) / cell);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= F.cols || jj >= F.rows) continue;
        const k = jj * fcols + ii; if (out[k] <= 0) continue;
        const d = Math.hypot(F.x0 + ii * cell - x, F.z0 + jj * cell - z), w = 0.75 * (1 - ss(cell * 0.4, cell * 1.3, d));
        if (w > 0) out[k] += (Math.max(0.6, target) - out[k]) * w;
      }
    }
  }
  if (gen.post) gen.post(ctx, F, L);
  // sea ice (the Arctic map): the analytic model's spec and the sim's class grid (world/ice.js)
  const ice = gen.ice ? gen.ice(ctx, F, L) : null;
  const t3 = now();
  const r = {
    id: def.id, name: def.name, W, H, cell, cols: F.cols, rows: F.rows, heights: out,
    places: L.places.map(clean), objectives: L.objectives.map(clean), spawns: L.spawns, replenish: L.replenish,
    roads: L.roads, weather: def.weather, time: def.time,
    timing: { plan: t1 - t0, layout: t2 - t1, fine: t3 - t2, total: t3 - t0 },
  };
  if (ice) { r.ice = ice.spec; r.iceCls = ice.cls; }
  // generator-specific plan data for the landmarks (structured-clone safe), e.g. the harbour city's districts
  if (L.extra) r.extra = L.extra;
  return r;
}

function clean(p) { const o = {}; for (const k in p) if (k[0] !== '_' && k !== 'road') o[k] = p[k]; return o; }
function sampleF(F, x, z) { return bilinear(F.data, F.cols, F.rows, (x - F.x0) / F.cell, (z - F.z0) / F.cell); }
function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
