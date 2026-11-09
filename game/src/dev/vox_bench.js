/* Voxel solver bench (dev): one hit on a class's lattice, headless, on the page's own GPU (no lab clock), and the
   result in numbers. In the game or lab page console:
     const B = await import('/game/src/dev/vox_bench.js');
     await B.run({ type: 'ddg', at: [9.9, 4.8, 0.2], from: [1, .05, 0], W: 120, fuze: 'in', kind: 'oniks' })
   -> { metrics, decay: [[r m, cells, median displacement m, p90], ...] (attached cells at the end of phase A),
        loose, ms }. The lattice is built once a class and kept (window.__voxB). */
import { voxelize, hullDots } from '../vox/build.js';
import { createSolver } from '../vox/solver.js';
import { createGpu } from '../vox/gpu.js';
import { layoutOf } from '../data/ship_layouts.js';
import { modelDots, dotsReady } from '../blast/support.js';

export async function run(o = {}) {
  const type = o.type || 'ddg', g = window.ONIKS && ONIKS.game, R = g.R, key = g.UNITS[type].model;
  const cache = window.__voxB || (window.__voxB = {});
  let E = cache[key];
  if (!E) {
    const ent = R.models.get(key); R.models.warm(key, [0]);
    for (let i = 0; i < 400 && !dotsReady(ent); i++) await new Promise(r => setTimeout(r, 25));
    const M = modelDots(ent), L = layoutOf(type);
    const V = voxelize(M.D, M.n, M.parts, Array.from(M.ins), { extra: hullDots(L, M.parts.indexOf('hull')) });
    E = cache[key] = { V, L, S: createSolver(V, L) };
  }
  if (!cache.gpu && o.gpu !== false) cache.gpu = await createGpu();
  const from = norm(o.from || [1, .05, 0]), dir = from.map(v => -v), at = o.at || [9.9, 4.8, 0.2], fz = o.fuze || 'in';
  const back = fz === 'in' ? -(o.delay || 1.6) : (o.standoff || .35);
  const C = at.map((v, k) => v - dir[k] * back);
  let meta = null, last = null, endA = null;
  const t0 = performance.now();
  const res = await E.S.hit({ C, entry: at, dir, W: o.W || 120, fuze: fz, kind: o.kind || 'oniks', speed: o.speed || 750, seed: o.seed || 7, tEnd: o.tEnd || .5, gpu: o.gpu === false ? null : cache.gpu, tA: o.tA, dt: o.dt }, m => {
    if (m.op === 'meta') meta = m; else if (m.op === 'fa') last = m; else if (m.op === 'endA') endA = m;
  });
  const ms = performance.now() - t0;
  // the decay of the displacement with distance from the charge: attached cells at the end of phase A
  const V = E.V, bins = new Map();
  for (let a = 0; a < meta.nFree; a++) {
    if (endA.flags[a] & 2) continue;
    const gi = meta.act[a], x = V.P[3 * gi], y = V.P[3 * gi + 1], z = V.P[3 * gi + 2];
    const m = Math.hypot(last.pos[3 * a] - x, last.pos[3 * a + 1] - y, last.pos[3 * a + 2] - z), r = Math.floor(Math.hypot(x - C[0], y - C[1], z - C[2]));
    let b = bins.get(r); if (!b) bins.set(r, b = []); b.push(m);
  }
  const decay = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([r, l]) => { l.sort((a, b) => a - b); return [r, l.length, +l[l.length >> 1].toFixed(3), +l[Math.floor(l.length * .9)].toFixed(3)]; });
  return { metrics: res.metrics, decay, ms: Math.round(ms), C };
}
function norm(a) { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }
