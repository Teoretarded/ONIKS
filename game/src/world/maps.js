/* ONIKS maps: the public API (see game/ARCHITECTURE.md, "Map contract", and README.md here).

   import { MAPS, loadMap } from './world/maps.js'
   const map = await loadMap('krasnaya_kosa')

   Generation is deterministic and runs in a module Worker (falls back to the main thread). Maps are
   cached per page (loading the same id twice returns the same object) and in IndexedDB keyed by
   GEN_VERSION (defs.js), so a later visit skips generation. Bump GEN_VERSION whenever a change to
   world/ changes the output. */
import { DEFS, DEF, GEN_VERSION } from './defs.js';
import { generate } from './gen.js';

export const MAPS = DEFS.map(d => ({ id: d.id, name: d.name, blurb: d.blurb, size: d.size.slice() }));

const cache = new Map();
const GENS = {};
async function genFor(name) { return GENS[name] || (GENS[name] = (await import(`./gens/${name}.js`)).default); }

/* opts.cell: override the output cell (e.g. 400 for a quick low-res map). opts.worker: false to stay on
   the main thread. opts.cache: false to skip the IndexedDB cache. */
export function loadMap(id, opts) {
  opts = opts || {};
  const def = DEF[id];
  if (!def) return Promise.reject(new Error(`loadMap: unknown map '${id}' (have ${DEFS.map(d => d.id).join(', ')})`));
  const key = `${id}@${opts.cell || def.cell}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const t0 = performance.now();
    const store = opts.cache === false ? null : await dbKey(key);
    let r = store ? await dbGet(store) : null;
    const fromCache = !!r;
    if (!r && opts.worker !== false && typeof Worker !== 'undefined') {
      try { r = await viaWorker(id, { cell: opts.cell }); } catch (e) { console.warn('loadMap: worker failed, generating on the main thread', e); r = null; }
    }
    if (!r) r = await generate(def, await genFor(def.gen), { cell: opts.cell });
    if (store && !fromCache) dbPut(store, key, r);
    const map = buildMap(r, performance.now() - t0);
    map.cached = fromCache;
    return map;
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

/* ---------- persistent cache (IndexedDB), keyed by GEN_VERSION (defs.js): bump it when output changes ---------- */
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise(res => {
    try {
      const rq = indexedDB.open('oniks-maps', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('maps');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
async function dbKey(key) { return typeof indexedDB === 'undefined' ? null : `${key}#${GEN_VERSION}`; }
async function dbGet(k) {
  const d = await db(); if (!d) return null;
  return new Promise(res => {
    try { const rq = d.transaction('maps').objectStore('maps').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }
    catch (e) { res(null); }
  });
}
async function dbPut(k, key, r) {
  const d = await db(); if (!d) return;
  try {
    const st = d.transaction('maps', 'readwrite').objectStore('maps');
    // drop older versions of this map, then store this one
    const rq = st.getAllKeys();
    rq.onsuccess = () => { for (const old of rq.result) if (String(old).startsWith(key + '#') && old !== k) st.delete(old); st.put(r, k); };
  } catch (e) { /* storage full or unavailable: generate next time */ }
}

/* ---------- worker pool (one worker per concurrent request, up to 3) ---------- */
const pool = []; let reqN = 0;
const WORKER_URL = new URL('./worker.js', import.meta.url);
function viaWorker(id, opts) {
  return new Promise((resolve, reject) => {
    let w = pool.find(p => !p.busy);
    if (!w) {
      if (pool.length < 3) { w = { worker: new Worker(WORKER_URL, { type: 'module' }), busy: false, q: [] }; pool.push(w); }
      else w = pool.reduce((a, b) => (a.q.length <= b.q.length ? a : b));
    }
    const req = ++reqN;
    const run = () => {
      w.busy = true;
      const onMsg = (e) => {
        if (e.data.req !== req) return;
        w.worker.removeEventListener('message', onMsg); w.worker.removeEventListener('error', onErr);
        w.busy = false; const next = w.q.shift(); if (next) next();
        e.data.ok ? resolve(e.data.r) : reject(new Error(e.data.err));
      };
      const onErr = (e) => { w.worker.removeEventListener('message', onMsg); w.worker.removeEventListener('error', onErr); w.busy = false; const next = w.q.shift(); if (next) next(); reject(e.error || new Error(e.message || 'worker error')); };
      w.worker.addEventListener('message', onMsg); w.worker.addEventListener('error', onErr);
      w.worker.postMessage({ req, id, opts });
    };
    w.busy ? w.q.push(run) : run();
  });
}

/* ---------- the Map object ---------- */
function buildMap(r, ms) {
  const { W, H, cell, cols, rows, heights } = r;
  const x0 = -W / 2, z0 = -H / 2, inv = 1 / cell, cm = cols - 1, rm = rows - 1;
  function h(x, z) {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    if (fx < 0) fx = 0; else if (fx > cm) fx = cm;
    if (fz < 0) fz = 0; else if (fz > rm) fz = rm;
    let i = fx | 0, j = fz | 0;
    if (i >= cm) i = cm - 1;
    if (j >= rm) j = rm - 1;
    const u = fx - i, v = fz - j, o = j * cols + i;
    const a = heights[o], b = heights[o + 1], c = heights[o + cols], d = heights[o + cols + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  function water(x, z) { return h(x, z) < 0; }
  /* tan of the ground slope, capped at 1 (45 degrees): 0 flat .. 1 cliff */
  function slope(x, z) {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    if (fx < 0) fx = 0; else if (fx > cm) fx = cm;
    if (fz < 0) fz = 0; else if (fz > rm) fz = rm;
    let i = fx | 0, j = fz | 0;
    if (i >= cm) i = cm - 1;
    if (j >= rm) j = rm - 1;
    const u = fx - i, v = fz - j, o = j * cols + i;
    const a = heights[o], b = heights[o + 1], c = heights[o + cols], d = heights[o + cols + 1];
    const gx = ((b - a) * (1 - v) + (d - c) * v) * inv, gz = ((c - a) * (1 - u) + (d - b) * u) * inv;
    const s = Math.sqrt(gx * gx + gz * gz);
    return s > 1 ? 1 : s;
  }
  return {
    id: r.id, name: r.name, W, H, cell, cols, rows, heights, h, water, slope,
    places: r.places, objectives: r.objectives, spawns: r.spawns, replenish: r.replenish, roads: r.roads,
    weather: r.weather, time: r.time,
    genMs: Math.round(ms), timing: r.timing, cached: false,
  };
}
