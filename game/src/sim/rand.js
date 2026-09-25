/* Seeded random streams. Uses window.M3.rng (reference/menus/common/m3.js) when it is loaded; the fallback is the
   same mulberry32 generator, so results are identical either way (and the sim also runs in a Worker). */
const G = typeof globalThis !== 'undefined' ? globalThis : {};

function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function rng(seed) { return G.M3 && G.M3.rng ? G.M3.rng(seed) : mulberry(seed); }
export function gauss(r) { let u = 0; while (!u) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
export function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
