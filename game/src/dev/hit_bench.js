/* Hit stutter bench (dev): a hit on a target in the lab (game/lab.html), the frames around it rendered back to back
   at 1/60 s of real time and x1, each waited for on the GPU (as ONIKS.benchSync), the event loop let run between them
   (the blast worker's messages), and every frame's CPU time split by system and phase (game.profRaw). What shows a
   micro-stutter: the frames over 16.7 ms and where their time went.
     const H = await import('/game/src/dev/hit_bench.js');
     await H.run({ type: 'ddg', kind: 'oniks', aim: 'side', model: 'dots', clean: false, preroll: .5, secs: 3 })
   -> { frames, sync: { p50, p95, max }, over16, over33, worst: [{ tau, sync, cpu, task, top: [[key, ms]...] }], cold } */
import { yieldNow } from './lab/core.js';

export async function run(o = {}) {
  const LAB = window.LAB, O = window.ONIKS, g = O.game, gl = O.R.gl, px = new Uint8Array(4);
  if (!LAB) throw new Error('hit bench: the lab page (game/lab.html)');
  await LAB.model(o.model || 'dots');
  LAB.clean(!!o.clean);
  if (o.fresh !== false) await LAB.target(o.type || 'ddg');
  LAB.munition(o.kind || 'oniks', o.ov || null); LAB.aim(o.aim || 'side');
  const pre = o.preroll === undefined ? .5 : o.preroll, secs = o.secs || 3, n = Math.round((pre + secs) * 60);
  LAB.core.fire({ preroll: pre });
  g.paused = false; g.timeRate = 1; g.profile = true;
  const frames = [];
  for (let i = 0; i < n; i++) {
    g.profRaw = {};
    const a = performance.now();
    g.paused = false; g.timeRate = 1;
    O.advance(1 / 60, 1);
    const cpu = performance.now() - a;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sync = performance.now() - a;
    // (what the page does between frames: the workers' messages, timers)
    const b = performance.now(); await yieldNow(); await yieldNow(); const task = performance.now() - b;
    frames.push({ i, tau: LAB.tau(), sync, cpu, task, prof: g.profRaw });
  }
  g.profile = false; g.profRaw = null; g.paused = true;
  const s = frames.map(f => f.sync + f.task).sort((x, y) => x - y), q = k => +s[Math.min(s.length - 1, Math.floor(s.length * k))].toFixed(1);
  const worst = frames.slice().sort((x, y) => (y.sync + y.task) - (x.sync + x.task)).slice(0, o.worst || 8).map(f => ({ tau: +f.tau.toFixed(3), total: +(f.sync + f.task).toFixed(1), sync: +f.sync.toFixed(1), cpu: +f.cpu.toFixed(1), task: +f.task.toFixed(1),
    top: Object.entries(f.prof).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => [k, +v.toFixed(1)]) }));
  const before = frames.filter(f => f.tau !== null && f.tau < 0).map(f => f.sync + f.task), after = frames.filter(f => f.tau !== null && f.tau >= 0 && f.tau < .5).map(f => f.sync + f.task);
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
  return { model: o.model || 'dots', frames: frames.length, ms: { p50: q(.5), p95: q(.95), p99: q(.99), max: q(1) }, over16: s.filter(v => v > 16.7).length, over33: s.filter(v => v > 33.3).length,
    avgBefore: avg(before), avgFirstHalfSecond: avg(after), worst };
}
