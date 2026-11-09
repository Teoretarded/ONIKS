/* Labels that decode letter by letter out of glyph noise (the films' condense(), p1 / pc_anatomy): the resolved
   head reads left to right, two or three "hot" characters at the edge cycle through letters and digits, the tail is
   faint glyph noise of the true length. Pure in (text, progress, time, seed): stills and scrubbing agree.
   Also the number that counts up (? 0.31 -> 0.97) and a flicker helper for the X-ray. */

const GLY = '·:+×/\\|-=';
const HOT = 'ABCDEFGHKMNPRSTVXYZ0123456789/·-';

/* s: the true text; k 0..1: how much has resolved; t: seconds (drives the noise at 24 Hz); seed: per label */
export function decode(s, k, t, seed) {
  if (k >= 1) return s;
  const n = s.length;
  if (k <= 0 && n === 0) return '';
  const keep = Math.floor(n * Math.max(0, k)), fr = Math.floor(t * 24);
  let o = s.slice(0, keep);
  for (let i = keep; i < n; i++) {
    const c = s[i];
    if (c === ' ' || c === '·') { o += c; continue; }
    const h = ((i * 7 + fr * 13 + seed * 5) % 11 + 11) % 11;
    if (i < keep + 3) o += HOT[((i * 5 + fr * 3 + seed) % HOT.length + HOT.length) % HOT.length];
    else o += h < 3 + 7 * k ? GLY[((i * 3 + fr + seed) % GLY.length + GLY.length) % GLY.length] : ' ';
  }
  return o;
}

/* the X-ray's flicker: on at t0 in two stutters, steady, off at t1 in two stutters -> 0..1 */
export function flicker(a, t0, t1) {
  if (a < t0 || a > t1 + .3) return 0;
  const u = a - t0, v = t1 - a;
  if (u < .06) return 1;
  if (u < .11) return .15;
  if (u < .17) return 1;
  if (u < .2) return .35;
  if (v > 0) return 1;
  const w = -v;
  if (w < .06) return .2;
  if (w < .12) return .9;
  if (w < .16) return .1;
  if (w < .22) return .6;
  return 0;
}

/* per-label seed from a string */
export function seedOf(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0) % 997; }
