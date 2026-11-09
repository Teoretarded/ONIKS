/* App vs browser bench (dev): the same measurements in the ONIKS app (app/, WebView2) and in a browser tab, at the same
   window size. On the lab page (game/lab.html?style=pointcloud&blast=fast):
     const B = await import('/game/src/dev/app_bench.js'); await B.run()      (also left in window.BENCH)
   -> { host, size, dpr, hits: [hit_bench x3], live: { hz, frames, p50, p95, max, late } }
     hits  three Oniks side hits on a DDG through dev/hit_bench.js (frames back to back, GPU-synced: the cost)
     live  the page's own requestAnimationFrame loop for 5 s round a live hit: the intervals between presented frames
           (what the player sees: a late frame is one over 1.5 refresh intervals) */
import { run as hitBench } from './hit_bench.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const r1 = v => +v.toFixed(1);

export async function run(o = {}) {
  window.BENCH = { running: true };
  for (let i = 0; i < 600 && !(window.ONIKS && window.LAB && window.LAB.core.ready()); i++) await wait(50);
  const LAB = window.LAB, g = window.ONIKS.game;
  await wait(o.settle === undefined ? 3000 : o.settle);
  const out = { host: window.__TAURI_INTERNALS__ ? 'app' : 'browser', ua: navigator.userAgent, size: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio, hits: [] };
  for (let i = 0; i < (o.hits || 3); i++) {
    const h = await hitBench({ fresh: i === 0, secs: 3 });
    out.hits.push({ p50: h.ms.p50, p95: h.ms.p95, max: h.ms.max, over16: h.over16, over33: h.over33 });
  }
  // the live loop: rAF intervals, a hit half a second in
  LAB.core.fire({ preroll: .5 });
  g.paused = false; g.timeRate = 1;
  const t = [];
  await new Promise(done => { const f = now => { t.push(now); if (now - t[0] < (o.liveMs || 5000)) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b), med = d[d.length >> 1];
  out.live = { hz: Math.round(1000 / med), frames: d.length, p50: r1(med), p95: r1(d[Math.floor(d.length * .95)]), max: r1(d[d.length - 1]), late: d.filter(v => v > med * 1.5).length };
  window.BENCH = out;
  return out;
}
