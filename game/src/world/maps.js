/* ONIKS maps: the public API (see game/ARCHITECTURE.md, "Map contract", and README.md here).

   import { MAPS, loadMap } from './world/maps.js'
   const map = await loadMap('krasnaya_kosa')

   Generation is deterministic and runs in a module Worker (falls back to the main thread). Maps are
   cached per page (loading the same id twice returns the same object) and in IndexedDB keyed by
   GEN_VERSION (defs.js), so a later visit skips generation. Bump GEN_VERSION whenever a change to
   world/ changes the output. */
import { DEFS, DEF, GEN_VERSION } from './defs.js';
import { generate } from './gen.js';
import { makeIce, C as ICE_C } from './ice.js';

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
    // the cache must be quicker than generating: a read held up (other pages writing big maps to the same store) is
    // given up after 2.5 s, and that map is not written back (it is there already)
    let r = store ? await dbGet(store) : null, slow = false;
    if (r === SLOW) { r = null; slow = true; }
    const fromCache = !!r;
    if (!r && opts.worker !== false && typeof Worker !== 'undefined') {
      try { r = await viaWorker(id, { cell: opts.cell }); } catch (e) { console.warn('loadMap: worker failed, generating on the main thread', e); r = null; }
    }
    if (!r) r = await generate(def, await genFor(def.gen), { cell: opts.cell });
    if (store && !fromCache && !slow) dbPut(store, key, r);
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
    // an open waits behind another page's delete or upgrade: never let that stall a map (no cache instead), and close
    // our connection when someone else needs the database changed
    const t = setTimeout(() => res(null), 1500);
    try {
      const rq = indexedDB.open('oniks-maps', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('maps');
      rq.onsuccess = () => { clearTimeout(t); const d = rq.result; d.onversionchange = () => { try { d.close(); } catch (e) { /* closed */ } dbp = null; }; res(d); };
      rq.onerror = () => { clearTimeout(t); res(null); };
      rq.onblocked = () => { clearTimeout(t); res(null); };
    } catch (e) { clearTimeout(t); res(null); }
  });
  return dbp;
}
async function dbKey(key) { return typeof indexedDB === 'undefined' ? null : `${key}#${GEN_VERSION}`; }
const SLOW = {};
async function dbGet(k) {
  const d = await db(); if (!d) return null;
  return new Promise(res => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(SLOW); } }, 2500);
    const fin = v => { if (done) return; done = true; clearTimeout(t); res(v); };
    try { const rq = d.transaction('maps').objectStore('maps').get(k); rq.onsuccess = () => fin(rq.result || null); rq.onerror = () => fin(null); }
    catch (e) { fin(null); }
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
/* the Map over a generation result (gen.js generate()), for callers that generate themselves (balance.js's variants):
   the same object loadMap returns, the sea ice included */
export function mapFromResult(r) { return buildMap(r, 0); }
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
  const map = {
    id: r.id, name: r.name, W, H, cell, cols, rows, heights, h, water, slope,
    places: r.places, objectives: r.objectives, spawns: r.spawns, replenish: r.replenish, roads: r.roads,
    weather: r.weather, time: r.time,
    genMs: Math.round(ms), timing: r.timing, cached: false,
    hRaw: h, extra: r.extra || null, iceSpec: null, ice: null, iceModel: null,
  };
  if (r.iceCls && r.ice) withIce(map, r, h, slope);
  return map;
}

/* Sea ice (the Arctic map). map.ice(x, z) is the sim's class (world/ice.js C: 0 open, 1 thin, 2 pack, 3 fast,
   4 walkable fast ice) on a 200 m grid, and map.h / map.slope carry it, so everything that reads the ground (the nav
   grids, the movement rules, the order checks, the AI's sites) sees the ice without knowing about it: pack and fast
   ice read as shoal water 6 m deep (ships and boats keep out, the torpedo still runs), the walkable fast ice as flat
   ground 0.6 m above the sea (vehicles drive on it). map.heights and map.hRaw stay the true DEM (the terrain draws
   the seabed and the waterline from them). map.iceModel() is the analytic model for the dots (lazy). */
function withIce(map, r, hRaw, slopeRaw) {
  const g = r.iceCls, D = g.data, gi = 1 / g.cell, cm = g.cols - 1, rm = g.rows - 1;
  const cls = (x, z) => {
    let i = Math.round((x - g.x0) * gi), j = Math.round((z - g.z0) * gi);
    if (i < 0) i = 0; else if (i > cm) i = cm;
    if (j < 0) j = 0; else if (j > rm) j = rm;
    return D[j * g.cols + i];
  };
  map.h = (x, z) => {
    const v = hRaw(x, z);
    if (v >= 0) return v;
    const c = cls(x, z);
    return c === ICE_C.WALK ? .6 : c >= ICE_C.PACK ? (v < -6 ? -6 : v) : v;
  };
  map.water = (x, z) => map.h(x, z) < 0;
  map.slope = (x, z) => (cls(x, z) === ICE_C.WALK && hRaw(x, z) < 0 ? 0 : slopeRaw(x, z));
  map.ice = cls;
  map.iceSpec = r.ice;
  let M = null;
  map.iceModel = () => M || (M = makeIce(r.ice, hRaw));
}
