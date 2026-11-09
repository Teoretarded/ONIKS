/* Voxel ships (prototype): the worker. Builds a class's lattice from its model's dots and solves hits on it, off the
   main thread (no frame of the game waits on it). Messages:
     { op: 'build', key, type, D, n, parts, ins }       -> { op: 'built', key, ...the lattice for the picture }
     { op: 'hit', key, shot, o }                        -> 'meta', 'fa' (phase A frames), 'endA', 'fb' (phase B frames), 'done'
   Every reply carries its key and shot. */
import { voxelize, hullDots } from './build.js';
import { createSolver } from './solver.js';
import { createGpu } from './gpu.js';

let GPU = null;
import { layoutOf } from '../data/ship_layouts.js';

const SOL = new Map();

self.onmessage = e => {
  const m = e.data;
  try {
    if (m.op === 'build') {
      const t0 = Date.now();
      let L = null; try { L = layoutOf(m.type); } catch (err) { L = null; }
      const hi = Math.max(0, m.parts.indexOf('hull'));
      const V = voxelize(m.D, m.n, m.parts, m.ins, Object.assign({ extra: hullDots(L, hi) }, m.opts || {}));
      SOL.set(m.key, createSolver(V, L));
      const P = V.P.slice(), N = new Int8Array(V.n * 3), info = new Uint8Array(V.n * 4);
      for (let i = 0; i < V.n * 3; i++) N[i] = Math.round(V.N[i] * 127);
      for (let i = 0; i < V.n; i++) { info[4 * i] = V.ins[i]; info[4 * i + 1] = V.mat[i]; info[4 * i + 2] = V.N[3 * i] === 0 && V.N[3 * i + 1] === 0 && V.N[3 * i + 2] === 0 ? 1 : 0; info[4 * i + 3] = V.part[i] & 255; }
      const part = V.part.slice(), mass = V.m.slice(), key = V.key.slice();
      self.postMessage({ op: 'built', key: m.key, n: V.n, S: V.S, lo: V.lo, dim: V.dim, P, N, info, part, mass, cells: key, ms: Date.now() - t0, layout: !!L },
        [P.buffer, N.buffer, info.buffer, part.buffer, mass.buffer, key.buffer]);
    } else if (m.op === 'hit') {
      const S = SOL.get(m.key); if (!S) throw new Error('vox: not built ' + m.key);
      const post = (msg, tr) => { msg.key = m.key; msg.shot = m.shot; self.postMessage(msg, tr || []); };
      (async () => {
        // (the graphics card when the worker has WebGPU and the shot does not ask for the CPU)
        let G = null; if (!m.o.cpu) { if (!GPU) GPU = createGpu(); G = await GPU; }
        await S.hit(Object.assign({}, m.o, { gpu: G }), post);
      })().catch(err => self.postMessage({ op: 'error', key: m.key, shot: m.shot, err: String(err && err.stack || err) }));
    }
  } catch (err) {
    self.postMessage({ op: 'error', key: m.key, shot: m.shot, err: String(err && err.stack || err) });
  }
};
