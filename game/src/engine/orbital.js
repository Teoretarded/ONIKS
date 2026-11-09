/* The ORBITAL map: the static hairline picture of a map in the Orbital films' language (oa_scale, o3_orbit),
   built once at load and drawn through R.wire.
     coast      the 0 m contour of map.heights (exactly the waterline the point terrain draws), bright (.82)
     contours   land contours at a nice interval (index contours brighter), depth contours (soundings) fainter
     grid       10 km graticule over the map, the map frame with corner brackets (the films' theatre square)
   Contours come from contours.js (marching squares, chained, simplified) in a worker; the grid and the frame are
   there at once. Land contours sit at their true height, depth contours on the sea surface.

   const OM = new OrbitalMap(R, map);        // starts the extraction
   OM.ready                                  // contours in
   OM.draw(k, o)                             // queue the layers in R.wire; k 0..1 (the layers come in staggered)
   OM.levels                                 // [{ level, a, kind: 'coast' | 'land' | 'sea' }] */
import { extractContours } from './contours.js';

const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/* the contour levels of a map: a nice land interval (4..7 contours), soundings at chart depths */
export function chooseLevels(map) {
  const H = map.heights, land = [], sea = [];
  for (let i = 0; i < H.length; i += 13) { const v = H[i]; if (v > 0) land.push(v); else if (v < 0) sea.push(v); }
  land.sort((a, b) => a - b); sea.sort((a, b) => a - b);
  // a level on a plateau (a large flat area at that height) would wander round every bump: move it off the plateau
  const flatAt = L => { let lo = 0, hi = land.length; const a = L - 2, b = L + 2; while (lo < hi) { const m = (lo + hi) >> 1; if (land[m] < a) lo = m + 1; else hi = m; } let n = 0; for (let i = lo; i < land.length && land[i] <= b; i++) n++; return n / Math.max(1, land.length); };
  const offPlateau = (L, I) => { if (flatAt(L) < .02) return L; let best = L, bf = flatAt(L); for (const d of [.2, -.2, .35, -.35]) { const f = flatAt(L + d * I); if (f < bf) { bf = f; best = L + d * I; } } return Math.round(best); };
  const hMax = land.length ? land[Math.floor(land.length * .995)] : 0;
  const dMin = sea.length ? sea[Math.floor(sea.length * .01)] : 0;
  const out = [{ level: 0, a: .82, kind: 'coast' }];
  out.hMax = hMax; out.interval = 0; out.flatAt = flatAt;
  if (hMax > 8) {
    const I = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(v => hMax / v <= 6.5) || 1000;
    out.interval = I;
    // every second contour a little brighter (index contours), as the films' 60 / 140 / 220 m lines vary
    for (let h = I, k = 1; h < hMax && k <= 9; h += I, k++) out.push({ level: offPlateau(h, I), a: k % 2 === 0 ? .19 : .11, kind: 'land' });
  }
  const SEA = [[-10, .12], [-20, .14], [-50, .1], [-100, .075], [-200, .06], [-500, .05], [-1000, .05]];
  // the shallowest sounding only on a shelf wide enough to carry it (else it doubles the coast)
  for (const [d, a] of SEA) if (d > dMin * .9) out.push({ level: d, a, kind: 'sea' });
  // two soundings that crowd the coast: keep -20 over -10 when both are there
  if (out.some(l => l.level === -10) && out.some(l => l.level === -20)) out.splice(out.findIndex(l => l.level === -10), 1);
  return out;
}

/* the close-range contours between the main ones (a fifth of the interval), off the plateaus */
export function fineLevels(levels) {
  const I = levels.interval, hMax = levels.hMax;
  if (!I) return [];
  const st = Math.max(2, I / 5), main = levels.filter(l => l.kind === 'land').map(l => l.level), out = [];
  for (let h = st; h < hMax && out.length < 40; h += st) {
    if (main.some(m => Math.abs(m - h) < st * .6)) continue;
    if (levels.flatAt(h) > .02) continue;
    out.push(h);
  }
  return out;
}

export class OrbitalMap {
  constructor(R, map, o) {
    o = o || {};
    this.R = R; this.map = map; this.ready = false;
    this.levels = chooseLevels(map);
    this.layers = [];          // [{ level, a, kind, B }]
    this.ms = 0;
    this._grid();
    const t0 = performance.now();
    this.promise = this._extract(o.worker !== false).then(r => { this._build(r); this.ready = true; this.ms = performance.now() - t0; return this; })
      .catch(e => { console.warn('orbital: contours failed', e); });
  }
  _job() {
    const m = this.map;
    return { heights: m.heights, cols: m.cols, rows: m.rows, cell: m.cell, x0: -m.W / 2, z0: -m.H / 2,
      levels: this.levels.map(l => l.level), tol: m.cell * .3, tolCoast: m.cell * .25, blur: 2, blurCoast: 1, smooth: 2,
      minLen: m.cell * 8, minLenCoast: m.cell * 1.2 };
  }
  /* the close-range contours (the full Orbital style asks for them): one batch, extracted on first request */
  fine() {
    if (this._fineAsked) return this.fineB || null;
    this._fineAsked = true;
    const lv = fineLevels(this.levels);
    if (!lv.length) return null;
    const m = this.map;
    const job = { heights: m.heights, cols: m.cols, rows: m.rows, cell: m.cell, x0: -m.W / 2, z0: -m.H / 2,
      levels: lv, tol: m.cell * .25, blur: 1, smooth: 1, minLen: m.cell * 6 };
    this._extract(true, job).then(r => {
      let n = 0;
      for (const L of r) for (const l of L.lines) n += (l.length >> 1) - 1;
      if (!n) return;
      const segs = new Float32Array(n * 6);
      let o = 0;
      for (const L of r) for (const l of L.lines) for (let i = 2; i < l.length; i += 2) {
        segs[o++] = l[i - 2]; segs[o++] = L.level; segs[o++] = l[i - 1];
        segs[o++] = l[i]; segs[o++] = L.level; segs[o++] = l[i + 1];
      }
      this.fineB = this.R.wire.batch(segs);
      this.fineN = n;
    }).catch(e => console.warn('orbital: fine contours failed', e));
    return null;
  }
  _extract(worker, jobIn) {
    const job = jobIn || this._job();
    if (worker && typeof Worker !== 'undefined') {
      return new Promise((res, rej) => {
        let w;
        try { w = new Worker(new URL('./contours_worker.js', import.meta.url), { type: 'module' }); }
        catch (e) { res(extractContours(job)); return; }
        const t = setTimeout(() => { w.terminate(); res(extractContours(job)); }, 20000);
        w.onmessage = e => { clearTimeout(t); w.terminate(); if (e.data.error) { console.warn('orbital: worker', e.data.error); res(extractContours(job)); } else { if (!jobIn) this.workerMs = e.data.ms; res(e.data.r); } };
        w.onerror = e => { clearTimeout(t); w.terminate(); console.warn('orbital: worker error', e.message); res(extractContours(job)); };
        // the heights are copied (the terrain keeps its own)
        w.postMessage(Object.assign({ id: 1 }, job, { heights: new Float32Array(job.heights) }));
      });
    }
    return Promise.resolve(extractContours(job));
  }
  _build(r) {
    const W = this.R.wire;
    this.nSegs = 0;
    for (const L of r) {
      const spec = this.levels.find(l => l.level === L.level);
      if (!spec) continue;
      const y = spec.kind === 'land' ? L.level : spec.kind === 'coast' ? .3 : 0;
      let n = 0;
      for (const l of L.lines) n += (l.length >> 1) - 1;
      if (!n) continue;
      const segs = new Float32Array(n * 6);
      let o = 0;
      for (const l of L.lines) for (let i = 2; i < l.length; i += 2) {
        segs[o++] = l[i - 2]; segs[o++] = y; segs[o++] = l[i - 1];
        segs[o++] = l[i]; segs[o++] = y; segs[o++] = l[i + 1];
      }
      this.layers.push(Object.assign({}, spec, { B: W.batch(segs), n, lines: spec.kind === 'coast' ? L.lines : null }));
      this.nSegs += n;
    }
    this.layers.sort((a, b) => a.level - b.level);
    this.coast = this.layers.find(l => l.kind === 'coast') || null;
  }
  /* the 10 km graticule over the map and the map frame with its corner brackets */
  _grid() {
    const m = this.map, W = this.R.wire, x0 = -m.W / 2, x1 = m.W / 2, z0 = -m.H / 2, z1 = m.H / 2, st = 2500;
    const g = [], fr = [], br = [];
    const line = (out, ax, az, bx, bz) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / st));
      for (let i = 0; i < n; i++) out.push(ax + (bx - ax) * i / n, 0, az + (bz - az) * i / n, ax + (bx - ax) * (i + 1) / n, 0, az + (bz - az) * (i + 1) / n);
    };
    const G = 10000;
    for (let x = Math.ceil(x0 / G) * G; x <= x1; x += G) if (x > x0 + 1 && x < x1 - 1) line(g, x, z0, x, z1);
    for (let z = Math.ceil(z0 / G) * G; z <= z1; z += G) if (z > z0 + 1 && z < z1 - 1) line(g, x0, z, x1, z);
    line(fr, x0, z0, x1, z0); line(fr, x1, z0, x1, z1); line(fr, x1, z1, x0, z1); line(fr, x0, z1, x0, z0);
    // corner brackets just outside the frame (the films' theatre square)
    const gp = Math.max(m.W, m.H) * .014, bk = Math.max(m.W, m.H) * .036;
    for (const [x, z, sx, sz] of [[x0 - gp, z0 - gp, 1, 1], [x1 + gp, z0 - gp, -1, 1], [x1 + gp, z1 + gp, -1, -1], [x0 - gp, z1 + gp, 1, -1]]) {
      line(br, x, z, x + sx * bk, z); line(br, x, z, x, z + sz * bk);
    }
    this.gridB = W.batch(new Float32Array(g));
    this.frameB = W.batch(new Float32Array(fr));
    this.bracketB = W.batch(new Float32Array(br));
    this.frame = { x0, x1, z0, z1, gp, bk };
  }
  /* queue the layers for this frame. k: the strategic blend 0..1; o: { a (overall), rgb, depth, scan, lights,
     grid (0..1, default 1) } */
  draw(k, o) {
    o = o || {};
    const W = this.R.wire, A = o.a === undefined ? 1 : o.a, rgb = o.rgb, dp = !!o.depth, sc = !!o.scan, li = !!o.lights;
    if (k <= 0) return;
    const kc = ss(0, .5, k), kl = ss(.25, .8, k), kg = ss(.45, 1, k) * (o.grid === undefined ? 1 : o.grid);
    W.add(this.gridB, { a: .06 * kg * A, rgb, depth: dp });
    W.add(this.frameB, { a: .3 * kg * A, rgb, depth: dp });
    W.add(this.bracketB, { a: .8 * kg * A, rgb, depth: dp });
    for (const L of this.layers) {
      const a = L.kind === 'coast' ? L.a * kc : L.a * kl;
      W.add(L.B, { a: a * A, rgb, depth: dp, scan: sc, lights: li });
    }
  }
}
