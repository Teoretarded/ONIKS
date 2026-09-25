/* The shell's view of the maps and units. Uses game/src/world/maps.js (MAPS, loadMap), world/preview.js
   (renderPreview) and data/units.js (UNITS) when they are there and load; until then it builds against a stub
   list and a stub preview, and checks again every time a screen asks. */

const STUB = [
  { id: 'krasnaya_kosa', name: 'Krasnaya Kosa', blurb: 'The real coast · bluff battery', size: [140000, 150000], weather: 'calm', time: 'night' },
  { id: 'fjord', name: 'Dolgaya Guba', blurb: 'Fjord · cliffs · deep channels', size: [120000, 120000], weather: 'haze', time: 'dusk' },
  { id: 'strait', name: 'Proliv Uzky', blurb: 'Strait · two coasts · island', size: [120000, 140000], weather: 'rain', time: 'day' },
  { id: 'archipelago', name: 'Belye Shkhery', blurb: 'Archipelago · skerries · radar shadow', size: [140000, 140000], weather: 'calm', time: 'day' },
  { id: 'delta', name: 'Ust-Solyonaya', blurb: 'Delta · channels · shallow shelf', size: [130000, 110000], weather: 'haze', time: 'dusk' },
  { id: 'caldera', name: 'Chyortova Past', blurb: 'Caldera · one gap · lagoon', size: [100000, 100000], weather: 'storm', time: 'night' },
  { id: 'arctic', name: 'Guba Ledyanaya', blurb: 'Sea ice · leads · naval base', size: [120000, 120000], weather: 'haze', time: 'night' },
  { id: 'harbour', name: 'Bukhta Svetlaya', blurb: 'Harbour city · bridges', size: [120000, 120000], weather: 'calm', time: 'night' },
];

/* short display names (true designations) for force lists; units.js labels for anything else */
const UNIT_NAMES = {
  hq: 'K380R command post', tel: 'K340P TEL', radar: 'Monolith-B radar', pantsir: 'Pantsir-S1', catapult: 'Orlan-10 catapult',
  drone: 'Orlan-10 UAV', transloader: 'K342P transloader',
  ddg: 'Arleigh Burke · DDG', carrier: 'Nimitz · CVN', helo: 'MH-60R Seahawk', fighter: 'F/A-18E Super Hornet',
};

let maps = null, prev = null, units = null, lastTry = 0;
const loaded = new Map();      // id -> Promise<Map>

async function exists(url) { try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (e) { return false; } }

/* (re)try the real modules; cheap when they are already in */
export async function refresh() {
  if (maps && prev && units) return;
  const now = performance.now();
  if (now - lastTry < 4000) return;
  lastTry = now;
  if (!maps) maps = await tryImport('world/maps.js', m => Array.isArray(m.MAPS) && m.MAPS.length && m.loadMap);
  if (!prev) prev = await tryImport('world/preview.js', m => m.renderPreview);
  if (!units) { const m = await tryImport('data/units.js', m => m.UNITS); units = m && m.UNITS; }
}
/* a failed module import is cached by URL, so a retry after a half-written file uses a fresh query */
const fails = {};
async function tryImport(path, ok) {
  const url = new URL('../../' + path, import.meta.url).href;
  if (!await exists(url)) return null;
  try { const m = await import(url + (fails[path] ? '?r=' + fails[path] : '')); if (ok(m)) return m; fails[path] = (fails[path] || 0) + 1; return null; }
  catch (e) { fails[path] = (fails[path] || 0) + 1; console.warn('shell: ' + path + ' not usable yet:', e.message); return null; }
}

export const live = () => !!maps;
export function list() {
  if (!maps) return STUB;
  return maps.MAPS.map(m => ({ ...(STUB.find(s => s.id === m.id) || {}), ...m }));
}
export const byId = id => list().find(m => m.id === id) || list()[0];

export function unitName(type) {
  const u = units && units[type];
  return UNIT_NAMES[type] || (u && (u.label || u.name)) || type.toUpperCase();
}
export function unitShort(type) {
  const u = units && units[type];
  return (u && (u.name || u.label)) || (UNIT_NAMES[type] || type).split(' · ').pop();
}

export function loadMap(id) {
  if (!maps) return Promise.resolve(null);
  if (!loaded.has(id)) loaded.set(id, Promise.resolve().then(() => maps.loadMap(id)).catch(e => { console.warn('shell: loadMap', id, e); loaded.delete(id); return null; }));
  return loaded.get(id);
}

/* load maps ahead of need, one at a time, so cycling through previews is instant */
let warmQ = [], warming = false;
export function warm(ids) {
  if (!maps) return;
  for (const id of ids) if (id && !loaded.has(id) && !warmQ.includes(id)) warmQ.push(id);
  if (warming) return;
  warming = true;
  (async () => { while (warmQ.length) { const id = warmQ.shift(); await loadMap(id); } warming = false; })();
}

/* facts for the readout under a preview */
export async function facts(id) {
  const meta = byId(id), m = await loadMap(id);
  const W = (m && m.W) || (meta.size && meta.size[0]) || 0, H = (m && m.H) || (meta.size && meta.size[1]) || 0;
  return {
    name: (m && m.name) || meta.name,
    size: W && H ? `${Math.round(W / 1000)} × ${Math.round(H / 1000)} km` : '',
    weather: (m && m.weather && m.weather.kind) || meta.weather || 'calm',
    time: (m && m.time) || meta.time || '',
    objectives: m && m.objectives ? m.objectives.length : null,
    places: m && m.places ? m.places.length : null,
    map: m,
  };
}

/* the preview of map `id` as an offscreen canvas of w x h pixels; cached per id and size */
const cache = new Map();
export async function previewImage(id, w, h, opts) {
  const key = id + '@' + w + 'x' + h + (prev ? '' : ':stub');
  if (cache.has(key)) return cache.get(key);
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  let ok = false;
  if (prev && maps) {
    try { const m = await loadMap(id); if (m) { await prev.renderPreview(m, off, opts); ok = true; } }
    catch (e) { console.warn('shell: renderPreview', id, e); }
  }
  if (!ok) stubPreview(byId(id), off);
  if (ok || !maps) cache.set(key, off);
  return off;
}
/* draw it into `canvas` (sized by the caller) */
export async function preview(id, canvas, opts) {
  const img = await previewImage(id, canvas.width, canvas.height, opts);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
  return img;
}

/* reveal an image into a canvas behind a scan front: the dots it passes light up lime, then settle */
export function scanReveal(canvas, img, o = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const dx = o.x || 0, dy = o.y || 0, iw = img.width, ih = img.height;
  const tint = document.createElement('canvas'); tint.width = iw; tint.height = ih;
  const tc = tint.getContext('2d'); tc.drawImage(img, 0, 0); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = o.color || '#C6F432'; tc.fillRect(0, 0, iw, ih);
  const dur = o.dur || 700, band = Math.max(24, iw * .1), t0 = performance.now(), alpha = o.alpha == null ? 1 : o.alpha;
  let raf = 0, dead = false;
  const step = now => {
    if (dead) return;
    const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 2.2), x = e * (iw + band);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = alpha;
    const a = Math.max(0, Math.min(iw, x - band));
    if (a > 0) ctx.drawImage(img, 0, 0, a, ih, dx, dy, a, ih);
    const b = Math.min(iw, x);
    if (b > a) ctx.drawImage(tint, a, 0, b - a, ih, dx + a, dy, b - a, ih);
    if (u < 1 && x < iw) { ctx.fillStyle = o.color || '#C6F432'; ctx.globalAlpha = .85 * alpha; ctx.fillRect(dx + x, dy, Math.max(1, iw / 500), ih); }
    ctx.globalAlpha = 1;
    if (u < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

/* stand-in while world/preview.js is missing: a seeded dot coast (land dense, sea sparse contours) */
function stubPreview(meta, cv) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  let s = 0; for (const c of meta.id) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
  const G = 24, g = []; for (let i = 0; i < G * G; i++) g.push(rnd());
  const vn = (x, y) => { x = Math.max(0, Math.min(G - 1.001, x)); y = Math.max(0, Math.min(G - 1.001, y)); const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = g[j * G + i], b = g[j * G + i + 1], c = g[(j + 1) * G + i], d = g[(j + 1) * G + i + 1], u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const hgt = (x, y) => { const nx = x / W, ny = y / H; let v = vn(nx * 5, ny * 5) * .6 + vn(nx * 11, ny * 11) * .28 + vn(nx * 23, ny * 23) * .12; return v - .52 + (nx - .5) * -.5; };
  ctx.clearRect(0, 0, W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const put = (x, y, a, lime) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const k = (y * W + x) * 4; const r = lime ? 198 : 255, gg = lime ? 244 : 255, b = lime ? 50 : 255; d[k] = Math.max(d[k], r * a); d[k + 1] = Math.max(d[k + 1], gg * a); d[k + 2] = Math.max(d[k + 2], b * a); d[k + 3] = 255; };
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const v = hgt(x, y);
    if (v > 0) { if (rnd() < .55 + v * .8) put(x + rnd() * 2, y + rnd() * 2, .35 + Math.min(.6, v * 2.4)); }
    else { const c = Math.abs((v * 40) % 1); if (c < .08 && rnd() < .5) put(x, y, .22); else if (rnd() < .025) put(x, y, .12); }
  }
  ctx.putImageData(img, 0, 0);
}
