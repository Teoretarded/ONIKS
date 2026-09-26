/* The blast worker: its own WebGL2 context on an OffscreenCanvas (the game's GL state is never touched), the runner
   (runner.js) stepping every hit in flight together.

   Paced by the game's frames: the game sends a tick each frame with the GPU time it can spare (ms); the worker runs at
   most one slice of steps per tick, sized from the step's cost (a model per node on the GPU: ~8 us + 1.25 ns a node,
   36k nodes ~ 53 us; the GPU is shared with the game, so its own timing cannot be read in isolation), and never while
   the previous slice is still on the GPU. A hidden tab (no frames) pauses it.

   in:  { type: 'hit', id, spec } · { type: 'tick', ms } · { type: 'targets', t: { id: [seconds, watch] } } ·
        { type: 'drop', id } · { type: 'cfg', cfg } · { type: 'stats' }
   out: { type: 'ready', ok, err } · { type: 'built', id, info } · { type: 'state', ... } (snapshots, finals) ·
        { type: 'fail', id, err } · { type: 'stats', ... } */
import { createRunner } from './runner.js';

let runner = null, gl = null, fence = null;
const cfg = { us0: 8, usNode: .00125, minSteps: 8, maxSteps: 400, calibrate: false, fixedSteps: 0 };
const perf = { slices: 0, skipped: 0, steps: 0, lastMs: 0 };
function post(m) { const tr = m.transfer || []; delete m.transfer; self.postMessage(m, tr); }

try {
  const cv = new OffscreenCanvas(1, 1);
  gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('no WebGL2 in the worker');
  runner = createRunner(gl);
  post({ type: 'ready', ok: true });
} catch (e) {
  post({ type: 'ready', ok: false, err: String(e && e.message || e) });
}

/* (cfg.calibrate, off: a slice's fence polled every millisecond, its time from issue to done against the model's; in
   Chrome that is mostly latency: the GPU process runs this context's work between the game's frames, so a slice is
   done about a frame later whatever its size. The per-node model holds on the GPU: 36k nodes ~ 52 us a step) */
let kcal = 1, sent = null, polling = false;
function watchFence() {
  polling = false;
  if (!sent) return;
  if (gl.clientWaitSync(sent.f, 0, 0) === gl.TIMEOUT_EXPIRED) { if (performance.now() - sent.t0 < 250) { polling = true; setTimeout(watchFence, 1); } return; }
  const ms = performance.now() - sent.t0;
  if (cfg.calibrate && sent.pred > .5) { const r = Math.max(.3, Math.min(10, ms / sent.pred)); kcal = kcal * .75 + .25 * r * kcal; kcal = Math.max(.3, Math.min(12, kcal)); }
  perf.gpuMs = ms; perf.kcal = kcal;
  sent.done = true;
}
function slice(ms) {
  if (fence) {
    if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) { perf.skipped++; if (cfg.calibrate) kcal = Math.min(12, kcal * 1.05); return; }
    gl.deleteSync(fence); fence = null;
  }
  if (!runner.busy) return;
  let nodes = 0; for (const R of runner.pats.values()) if (R.state === 'run') nodes += R.P.N;
  const us = (cfg.us0 + cfg.usNode * nodes) * kcal;
  const steps = cfg.fixedSteps || Math.max(cfg.minSteps, Math.min(cfg.maxSteps, Math.round(ms * 1000 / us)));
  const t0 = performance.now();
  let out = [];
  try { out = runner.pump(steps); } catch (e) { post({ type: 'error', err: String(e && e.stack || e) }); }
  for (const m of out) post(m);
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  // its own fence for the calibration (the model's time for the steps actually run: a finished patch stops early)
  const n = runner.stats.steps;
  if (sent && sent.f && !sent.done) gl.deleteSync(sent.f);
  sent = { f: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0: t0 + (runner.stats.snapMs || 0) * (out.length ? 1 : 0), pred: n * us / 1000, done: false };
  gl.flush();
  if (!polling) { polling = true; setTimeout(watchFence, 1); }
  perf.slices++; perf.steps = steps; perf.lastMs = performance.now() - t0;
}

self.onmessage = ev => {
  const m = ev.data;
  if (!runner) return;
  try {
    switch (m.type) {
      case 'tick': slice(m.ms || 3); break;
      case 'hit': { const info = runner.submit(m.id, m.spec); post({ type: 'built', id: m.id, info }); break; }
      case 'targets': for (const k in m.t) { const v = m.t[k]; if (Array.isArray(v)) runner.target(+k, v[0], v[1]); else runner.target(+k, v); } break;
      case 'drop': runner.drop(m.id); break;
      case 'cfg': Object.assign(cfg, m.cfg || {}); break;
      case 'stats': post({ type: 'stats', cfg, perf, stats: runner.stats, pats: [...runner.pats.values()].map(R => ({ id: R.id, state: R.state, t: R.P.sim.t, T1: R.P.sim.T1, N: R.P.N, steps: R.steps, runMs: R.runMs })) }); break;
    }
  } catch (e) { post({ type: 'fail', id: m.id, err: String(e && e.stack || e) }); }
};
