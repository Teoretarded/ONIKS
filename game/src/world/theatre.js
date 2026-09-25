/* Loads the real seed-1337 DEM (reference/menus/common/theatre.js) without running it as a script:
   works in a Worker and never touches window. Reuses window.THEATRE if a page already loaded it.
   Returns { rows, cols, ext: [x0, x1, z0, z1] km, hs: Float32Array metres with row 0 = SOUTH, raw }. */

const URL_THEATRE = new URL('../../../reference/menus/common/theatre.js', import.meta.url).href;
let cached = null;

export function loadTheatre() {
  if (cached) return cached;
  cached = (async () => {
    let T = (typeof self !== 'undefined' && self.THEATRE) || null, q;
    if (T && T.hq) q = T.hq;
    else {
      const src = await (await fetch(URL_THEATRE)).text();
      const i = src.indexOf('{', src.indexOf('window.THEATRE'));
      const j = src.lastIndexOf('};', src.indexOf('(function', i));
      T = JSON.parse(src.slice(i, j + 1));
      const bin = atob(T.height_b64);
      q = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) q[k] = bin.charCodeAt(k);
    }
    const R = T.rows, C = T.cols, k = (T.h_hi - T.h_lo) / 255;
    const hs = new Float32Array(R * C);
    for (let r = 0; r < R; r++) {
      const src = r * C, dst = (R - 1 - r) * C;     // theatre row 0 = north; ours row 0 = south
      for (let c = 0; c < C; c++) hs[dst + c] = T.h_lo + q[src + c] * k;
    }
    return { rows: R, cols: C, ext: T.extent_km, hs, base_km: T.base_km, radars_km: T.player_radars_km, pantsirs_km: T.pantsirs_km };
  })();
  return cached;
}
