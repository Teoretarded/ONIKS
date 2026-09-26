/* The blast worker: its own WebGL2 context on an OffscreenCanvas (the game's GL state is never touched), the runner
   (runner.js) stepping every hit in flight together, throttled by a GPU fence so no more than one slice of work is
   ever queued ahead of the game's frames.

   in:  { type: 'hit', id, spec } · { type: 'targets', t: { id: seconds } } · { type: 'drop', id } · { type: 'cfg', steps }
   out: { type: 'ready', ok, err } · { type: 'state', ... } (runner snapshots and finals) · { type: 'fail', id, err } */
import { createRunner } from './runner.js';

let runner = null, steps = 40, fence = null, busy = false, idle = true;
const cfg = { steps: 40, auto: true, sliceMs: 5 };
function post(m) { const tr = m.transfer || []; delete m.transfer; self.postMessage(m, tr); }

try {
  const cv = new OffscreenCanvas(1, 1);
  const gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('no WebGL2 in the worker');
  runner = createRunner(gl);
  self.gl = gl;
  post({ type: 'ready', ok: true });
} catch (e) {
  post({ type: 'ready', ok: false, err: String(e && e.message || e) });
}

function loop() {
  busy = false;
  if (!runner) return;
  const gl = self.gl;
  // the previous slice still on the GPU: come back shortly
  if (fence) {
    const st = gl.clientWaitSync(fence, 0, 0);
    if (st === gl.TIMEOUT_EXPIRED) { schedule(1); return; }
    gl.deleteSync(fence); fence = null;
    if (cfg.auto && sliceT0) {
      // hold a slice near its time on the GPU (sliceMs): more steps when they come back quickly
      const ms = performance.now() - sliceT0;
      if (ms < cfg.sliceMs * .7) steps = Math.min(160, Math.round(steps * 1.15 + 1));
      else if (ms > cfg.sliceMs * 1.4) steps = Math.max(8, Math.round(steps * .8));
    }
  }
  if (!runner.busy) { idle = true; return; }
  sliceT0 = performance.now();
  let out = [];
  try { out = runner.pump(steps); } catch (e) { post({ type: 'error', err: String(e && e.stack || e) }); }
  for (const m of out) post(m);
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  schedule(0);
}
let sliceT0 = 0;
function schedule(ms) { if (busy) return; busy = true; idle = false; setTimeout(loop, ms); }

self.onmessage = ev => {
  const m = ev.data;
  if (!runner) return;
  try {
    switch (m.type) {
      case 'hit': { const info = runner.submit(m.id, m.spec); post({ type: 'built', id: m.id, info }); break; }
      case 'targets': for (const k in m.t) runner.target(+k, m.t[k]); break;
      case 'drop': runner.drop(m.id); break;
      case 'cfg': Object.assign(cfg, m.cfg || {}); if (m.cfg && m.cfg.steps) steps = m.cfg.steps; break;
      case 'stats': post({ type: 'stats', stats: Object.assign({ stepsPerSlice: steps }, runner.stats), pats: [...runner.pats.values()].map(R => ({ id: R.id, state: R.state, t: R.P.sim.t, T1: R.P.sim.T1, N: R.P.N })) }); break;
    }
  } catch (e) { post({ type: 'fail', id: m.id, err: String(e && e.stack || e) }); }
  schedule(0);
};
