/* The game's side of the blast solver: a Web Worker with its own WebGL2 context on an OffscreenCanvas (worker.js), or,
   where a worker cannot have one, the same runner on the main thread with its own offscreen context (pumped from the
   game's frame, a few steps at a time), or nothing (float render targets missing: the caller keeps the analytic marks).

   const C = await createClient();   C.mode: 'worker' | 'main' | null
   C.submit(id, spec) · C.targets({ id: [t, watch] }) · C.drop(id) · C.on(fn) (messages: 'built', 'state', 'fail')
   C.tick(ms) once a frame while hits are being solved: the GPU time (ms) the solver may take this frame · C.stats() */
export async function createClient(o = {}) {
  const fns = [];
  const emit = m => { for (const f of fns) try { f(m); } catch (e) { console.error('blast: listener', e); } };
  const base = { mode: null, err: null, on(f) { fns.push(f); }, submit() {}, targets() {}, drop() {}, tick() {}, stats: async () => null, cfg() {} };
  // 1. a worker with its own context
  if (!o.noWorker && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'oniks-blast' });
      const ok = await new Promise(res => {
        const to = setTimeout(() => res({ ok: false, err: 'timeout' }), 6000);
        w.onmessage = ev => { if (ev.data && ev.data.type === 'ready') { clearTimeout(to); res(ev.data); } };
        w.onerror = ev => { clearTimeout(to); res({ ok: false, err: ev.message || 'worker error' }); };
      });
      if (ok.ok) {
        let statsRes = null;
        // (the WebGPU device and every pipeline a hit can use brought up now, in the background: no first-hit stutter)
        if (!o.noWarm) w.postMessage({ type: 'warm' });
        w.onmessage = ev => { const m = ev.data; if (m.type === 'stats' && statsRes) { statsRes(m); statsRes = null; return; } emit(m); };
        w.onerror = ev => { console.error('blast: worker', ev.message); emit({ type: 'dead', err: ev.message }); };
        return Object.assign(base, {
          mode: 'worker', w,
          submit(id, spec) { w.postMessage({ type: 'hit', id, spec }); },
          targets(t) { w.postMessage({ type: 'targets', t }); },
          tick(ms, msShell) { w.postMessage({ type: 'tick', ms, msShell }); },
          drop(id) { w.postMessage({ type: 'drop', id }); },
          cfg(c) { w.postMessage({ type: 'cfg', cfg: c }); },
          stats() { return new Promise(r => { statsRes = r; w.postMessage({ type: 'stats' }); setTimeout(() => r(null), 1000); }); },
        });
      }
      w.terminate();
      base.err = 'worker: ' + ok.err;
    } catch (e) { base.err = 'worker: ' + (e && e.message || e); }
  }
  // 2. the main thread, its own offscreen context
  try {
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
    const gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false });
    if (!gl) throw new Error('no WebGL2');
    const { createRunner } = await import('./runner.js');
    const Rn = createRunner(gl, { pool: { rows: 400 } });
    const us0 = 8, usNode = .00125;
    return Object.assign(base, {
      mode: 'main', runner: Rn,
      submit(id, spec) { try { const info = Rn.submit(id, spec); emit({ type: 'built', id, info }); } catch (e) { emit({ type: 'fail', id, err: String(e && e.message || e) }); } },
      targets(t) { for (const k in t) Rn.target(+k, t[k][0], t[k][1]); },
      drop(id) { Rn.drop(id); },
      cfg() {},
      tick(ms) {
        if (!Rn.busy) return;
        let nodes = 0; for (const R of Rn.pats.values()) if (R.state === 'run') nodes += R.P.N;
        const steps = Math.max(4, Math.min(200, Math.round(ms * 1000 / (us0 + usNode * nodes))));
        let out = []; try { out = Rn.pump(steps); } catch (e) { console.error('blast: pump', e); }
        for (const m of out) { delete m.transfer; emit(m); }
      },
      stats: async () => ({ stats: Rn.stats }),
    });
  } catch (e) { base.err = (base.err ? base.err + '; ' : '') + 'main: ' + (e && e.message || e); }
  return base;
}
