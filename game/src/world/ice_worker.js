/* Module Worker: builds the sea-ice renderer's tiles (world/ice.js iceTile) off the main thread.
   { init: { spec, W, H, cell, cols, rows, heights, N, S0, LMAX } }  then  { key, tile: [L, ti, tj] }
   -> { key, bytes, counts } (bytes transferred) or { key, empty: true } */
import { makeIce, iceTile } from './ice.js';

let ice = null, P = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.init) {
    const { W, H, cell, cols, rows, heights } = m.init, x0 = -W / 2, z0 = -H / 2, cm = cols - 1, rm = rows - 1;
    const hRaw = (x, z) => {
      let fx = (x - x0) / cell, fz = (z - z0) / cell;
      if (fx < 0) fx = 0; else if (fx > cm) fx = cm;
      if (fz < 0) fz = 0; else if (fz > rm) fz = rm;
      let i = fx | 0, j = fz | 0; if (i >= cm) i = cm - 1; if (j >= rm) j = rm - 1;
      const u = fx - i, v = fz - j, o = j * cols + i;
      return (heights[o] * (1 - u) + heights[o + 1] * u) * (1 - v) + (heights[o + cols] * (1 - u) + heights[o + cols + 1] * u) * v;
    };
    ice = makeIce(m.init.spec, hRaw);
    P = m.init;
    return;
  }
  if (m.tile && ice) {
    let r = null;
    try { r = iceTile(ice, m.tile[0], m.tile[1], m.tile[2], P.N, P.S0, P.LMAX); } catch (err) { self.postMessage({ key: m.key, empty: true, err: String(err) }); return; }
    if (!r) { self.postMessage({ key: m.key, empty: true }); return; }
    self.postMessage({ key: m.key, bytes: r.bytes, counts: r.counts }, [r.bytes.buffer]);
  }
};
