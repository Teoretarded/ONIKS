/* Seeded noise for the map generators. DOM-free (runs in a Worker too).
   rng: the same mulberry32 stream as M3.rng, so seeds mean the same thing everywhere.
   Noise: 2D gradient noise with a 1024 period, quintic fade, output about [-1, 1].
   Every octave is rotated and offset so the lattice never lines up across octaves. */

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* stable integer hash -> [0, 1) */
export function hash2(i, j, s) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 2147483647) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const mix = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

const N = 1024, M = N - 1;

export function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Uint16Array(N * 2);
  const p = new Uint16Array(N);
  for (let i = 0; i < N; i++) p[i] = i;
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < N * 2; i++) perm[i] = p[i & M];
  const gx = new Float32Array(N), gy = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }

  function n2(x, y) {
    const xf0 = Math.floor(x), yf0 = Math.floor(y);
    const xf = x - xf0, yf = y - yf0;
    const X = xf0 & M, Y = yf0 & M;
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const i00 = perm[a], i01 = perm[a + 1], i10 = perm[b], i11 = perm[b + 1];
    const d00 = gx[i00] * xf + gy[i00] * yf;
    const d10 = gx[i10] * (xf - 1) + gy[i10] * yf;
    const d01 = gx[i01] * xf + gy[i01] * (yf - 1);
    const d11 = gx[i11] * (xf - 1) + gy[i11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const l0 = d00 + (d10 - d00) * u, l1 = d01 + (d11 - d01) * u;
    return (l0 + (l1 - l0) * v) * 1.41;
  }

  // per-octave rotation (about 37 degrees) and offsets
  const CR = Math.cos(0.65), SR = Math.sin(0.65);

  /* fractal sum, about [-1, 1] */
  function fbm(x, y, oct, lac, gain) {
    lac = lac || 2.02; gain = gain || 0.5;
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n2(x + i * 17.31, y - i * 9.73); n += a;
      const tx = x * CR - y * SR, ty = x * SR + y * CR; x = tx * lac; y = ty * lac;
      a *= gain;
    }
    return s / n;
  }

  /* ridged multifractal, 0..1 (sharp crests at 1) */
  function ridged(x, y, oct, lac, gain) {
    lac = lac || 2.03; gain = gain || 0.5;
    let s = 0, a = 0.5, w = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n2(x + i * 31.7, y + i * 11.1));
      v *= v; v *= w; w = v * 1.6; if (w > 1) w = 1;
      s += a * v; n += a;
      const tx = x * CR - y * SR, ty = x * SR + y * CR; x = tx * lac; y = ty * lac;
      a *= gain;
    }
    return s / n;
  }

  /* billowed: |noise| summed, 0..1 (rounded hills, sharp creases) */
  function billow(x, y, oct) {
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * Math.abs(n2(x + i * 5.3, y + i * 7.9)); n += a;
      const tx = x * CR - y * SR, ty = x * SR + y * CR; x = tx * 2.01; y = ty * 2.01;
      a *= 0.5;
    }
    return s / n;
  }

  return { n2, fbm, ridged, billow };
}
