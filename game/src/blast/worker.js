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

let runner = null, gl = null, fence = null, shell = null, shellP = null;
const owner = new Map(), pendingShell = new Set();   // (a shell patch dropped before its runner came up is never started)                // patch id -> the runner solving it
/* the shell solver (bench e00312c), loaded when a patch asks for it: on WebGPU where the worker has it (its own queue,
   many steps a command buffer, read backs that never stall), else on this WebGL2 context */
async function shellRunner() {
  if (shell) return shell;
  if (!shellP) shellP = (async () => {
    let wg = null;
    if (cfg.webgpu !== false && self.navigator && navigator.gpu) {
      try { const w = await import('./shell/gpu_wgpu.js'); wg = await w.initWebGPU(); } catch (e) { wg = null; perf.wgErr = String(e && e.message || e); }
    }
    const m = await import('./shell/runner.js');
    shell = m.createShellRunner(gl, { wg, batch: 200, depth: cfg.wgDepth || 8 });
    return shell;
  })();
  return shellP;
}
const cfg = { us0: 8, usNode: .00125, minSteps: 8, maxSteps: 400, calibrate: false, fixedSteps: 0, shUs0: 50, shUsNode: .002, shMax: 400, wgUs0: 10, wgUsNode: .003, wgMax: 1200 };
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
function slice(ms, msShell) {
  // the shell solver on WebGPU: its own queue, paced by what it has in flight (one command buffer: a slice a frame); a
  // step ~10 us + 3 ns a node of GPU (the bench's timer queries: 97 us on its 31k-cell patch, GPU-bound)
  if (shell && shell.busy && shell.stats.backend === 'webgpu') {
    let nodes = 0; for (const R of shell.pats.values()) if (R.state === 'run') nodes += R.M.N;
    const st = Math.max(8, Math.min(cfg.wgMax, Math.round((msShell || ms) * 1000 / (cfg.wgUs0 + cfg.wgUsNode * nodes))));
    const t0 = performance.now();
    try { for (const m of shell.pump(st)) post(m); } catch (e) { post({ type: 'error', err: String(e && e.stack || e) }); }
    perf.shSteps = shell.stats.steps; perf.shMs = performance.now() - t0; perf.shBudget = msShell || ms;
  }
  if (fence) {
    if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) { perf.skipped++; if (cfg.calibrate) kcal = Math.min(12, kcal * 1.05); return; }
    gl.deleteSync(fence); fence = null;
  }
  // the shell solver takes its share of the frame first. A step at 0.25 m: ~0.05 ms of GPU for 20k nodes (the bench's
  // timer queries) plus ~0.07 ms of WebGL calls, which Chrome's GPU process runs beside the game's frame: ~50 us + 2 ns
  // a node keeps the game's frame whole (more steps a slice stalled it: p50 5 -> 49 ms at 400 steps)
  if (shell && shell.busy && shell.stats.backend !== 'webgpu') {
    let nodes = 0; for (const R of shell.pats.values()) if (R.state === 'run') nodes += R.M.N;
    const share = runner.busy ? ms * .5 : (msShell || ms), st = Math.max(4, Math.min(cfg.shMax, Math.round(share * 1000 / (cfg.shUs0 + cfg.shUsNode * nodes))));
    const t0 = performance.now();
    try { for (const m of shell.pump(st)) post(m); } catch (e) { post({ type: 'error', err: String(e && e.stack || e) }); }
    perf.shSteps = shell.stats.steps; perf.shMs = performance.now() - t0;
    if (!runner.busy) { fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); return; }
    ms *= .5;
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
      case 'tick': slice(m.ms || 3, m.msShell); break;
      case 'hit':
        if (m.spec.solver === 'shell') { pendingShell.add(m.id); shellRunner().then(R => { if (!pendingShell.delete(m.id)) return; try { const info = R.submit(m.id, m.spec); owner.set(m.id, R); post({ type: 'built', id: m.id, info }); } catch (e) { post({ type: 'fail', id: m.id, err: String(e && e.stack || e) }); } }); break; }
        { const info = runner.submit(m.id, m.spec); owner.set(m.id, runner); post({ type: 'built', id: m.id, info }); break; }
      case 'targets': for (const k in m.t) { const v = m.t[k], R = owner.get(+k) || runner; if (Array.isArray(v)) R.target(+k, v[0], v[1]); else R.target(+k, v); } break;
      case 'drop': { if (pendingShell.delete(m.id)) break; const R = owner.get(m.id) || runner; R.drop(m.id); owner.delete(m.id); break; }
      case 'cfg': Object.assign(cfg, m.cfg || {}); break;
      case 'stats': post({ type: 'stats', cfg, perf, stats: runner.stats, shell: shell && shell.stats, backend: shell && shell.stats.backend,
        pats: [...runner.pats.values()].map(R => ({ id: R.id, state: R.state, t: R.P.sim.t, T1: R.P.sim.T1, N: R.P.N, steps: R.steps, runMs: R.runMs }))
          .concat(shell ? [...shell.pats.values()].map(R => ({ id: R.id, solver: 'shell', state: R.state, t: R.M.sim.t, T1: R.M.sim.T1, N: R.M.N, steps: R.steps, runMs: R.runMs, watch: R.watch, target: R.target, snapT: R.lastSnapT, ke: R.M.sim.keLast, kp: R.M.sim.kepeak, gas: R.M.sim.gasLast, quiet: R.M.sim.quietLast, relax: R.M.sim.relax, F: R.M.sim.srcs.map(q => q.F) })) : []) }); break;
    }
  } catch (e) { post({ type: 'fail', id: m.id, err: String(e && e.stack || e) }); }
};
