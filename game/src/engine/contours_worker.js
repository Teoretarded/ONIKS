/* Worker wrapper for contours.js: extracts the map's contour lines off the main thread (engine/orbital.js). */
import { extractContours } from './contours.js';

self.onmessage = e => {
  const t0 = performance.now();
  try {
    const r = extractContours(e.data);
    const tr = [];
    for (const L of r) for (const l of L.lines) tr.push(l.buffer);
    self.postMessage({ id: e.data.id, r, ms: performance.now() - t0 }, tr);
  } catch (err) { self.postMessage({ id: e.data.id, error: String(err && err.message || err) }); }
};
