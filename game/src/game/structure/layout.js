/* Structure layout: how a ship's hull is built for the break-up physics (game/structure/index.js).

   From the model itself (its sampled hull dots) and the unit table (draught, displacement):
     hull      length along the model's +Z (stern z0 .. bow z1), the half-beam at the waterline per station, the deck
               (the hull's top) per station, the draught and the keel line (the forefoot rounding up to the stem, the run
               aft rising to an immersed transom), the section's fullness (U amidships, V at the ends)
     sections  4-8 equal slabs along the hull (the cut planes between them are the girder's joints), each with the
               columns its buoyancy is summed over (2 stations x 4 across: vertical columns from the keel to the deck)
     below     the underwater hull the films never drew (the models stop at the waterline): registered as its own model
               '<key>~below' (hexes skinned on the hull's outer face only, a sonar dome and twin screws, shafts and rudders
               on a destroyer or cruiser), drawn with each section's transform and slab, so a bow lifting out of the
               water shows its forefoot and dome, a stern its screws
     faces     the torn face's inside at a cut (model frame): the shell, the decks, the inner bottom, the centreline
               girder and longitudinal bulkheads, as dots on the cut's own tear (jagK, the same tear the shader cuts)
   Pure data and GEO primitives; no GL. */

const RHO = 1025;
export const hsh = (i, s) => { let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((s * 1000003) | 0, 0x165667b1)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0; return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const fract = v => v - Math.floor(v);
/* the tear across a cut (engine/models.js SLAB_GLSL jagK: keep the two identical): -1..1 */
const jagH = (cx, cy, s) => { let h = (Math.imul(cx | 0, 73856093) ^ Math.imul(cy | 0, 19349663) ^ Math.imul(s | 0, 83492791)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h >>> 8) / 16777216; };
function jagV(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = jagH(ix, iy, s) + (jagH(ix + 1, iy, s) - jagH(ix, iy, s)) * ux, b = jagH(ix, iy + 1, s) + (jagH(ix + 1, iy + 1, s) - jagH(ix, iy + 1, s)) * ux;
  return a + (b - a) * uy;
}
export function jagK(x, y, s) {
  // (QA D10: a warped, three-scale tear: a long meander across the girth (~9 m), torn tongues (~2.4 m) and a fine ragged
  // edge (~0.5 m), no single dominant frequency and hardly any clamping, so no regular teeth)
  const si = Math.floor(s * 1000), rx = x * 3 + 4096, ry = y * 3 + 4096;
  const ux = rx + (jagV(rx * .23, ry * .23, si + 29) - .5) * 4.4, uy = ry + (jagV(rx * .23, ry * .23, si + 31) - .5) * 4.4;
  const v = .5 * jagV(ux * .12, uy * .12, si) + .32 * jagV(ux * .45, uy * .45, si + 7) + .18 * jagV(ux * 1.9, uy * 1.9, si + 13);
  return Math.max(-1, Math.min(1, (v - .5) * 3));
}

const layouts = new Map();

/* the hull of model `key` (entry e from R.models) for unit def `def` */
export function layoutOf(R, key, def) {
  let H = layouts.get(key);
  if (H) return H;
  const M = R.models, e = M.get(key);
  const hullP = e.parts.find(p => p.name === 'hull') || e.parts[0];
  const hasBelow = e.parts.some(p => p.name === 'below');
  // the hull's dots: a middle level (sampled now if it is not yet: a few ms, once per type)
  const lod = Math.max(0, e.lods.length - 2);
  let cl = null;
  try { cl = M.cloud(e, hullP, lod, {}, true); } catch (err) { cl = null; }
  const f = cl && cl.pts, n = cl ? cl.n : 0;
  let z0 = 1e9, z1 = -1e9, xm = 0, ytop = -1e9;
  for (let i = 0; i < n; i++) { const z = f[i * 4 + 2]; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (!(z1 > z0)) { z0 = -def.size[0] / 2; z1 = def.size[0] / 2; }
  const L = z1 - z0, NS = 48;
  const bWL = new Float32Array(NS + 1), deck = new Float32Array(NS + 1);
  for (let i = 0; i < n; i++) {
    const x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2], k = Math.max(0, Math.min(NS, Math.round((z - z0) / L * NS)));
    if (y < 2.5 && Math.abs(x) > bWL[k]) bWL[k] = Math.abs(x);
    if (y > deck[k]) deck[k] = y;
    if (Math.abs(x) > xm) xm = Math.abs(x);
    if (y > ytop) ytop = y;
  }
  // fill the stations the coarse dots missed; smooth; taper to the stem
  const B2 = (def.mot && def.mot.beam ? def.mot.beam : def.size[1]) / 2;
  for (let k = 0; k <= NS; k++) {
    if (!(bWL[k] > .3)) { let a = k, b = k; while (a > 0 && !(bWL[a] > .3)) a--; while (b < NS && !(bWL[b] > .3)) b++; bWL[k] = Math.max(bWL[a] || 0, 0) * .5 + Math.max(bWL[b] || 0, 0) * .5; }
    if (!(deck[k] > 1)) deck[k] = Math.max(3, ytop * .6);
  }
  const sm = a => { const o = a.slice(); for (let k = 1; k < NS; k++) o[k] = (a[k - 1] + 2 * a[k] + a[k + 1]) / 4; return o; };
  let bw = sm(sm(bWL)), dk = sm(deck);
  for (let k = 0; k <= NS; k++) bw[k] = Math.min(bw[k], B2 * 1.02);
  bw[NS] = Math.min(bw[NS], .3);
  const T = def.draught || Math.max(2, def.size[2] * .12);
  // hull form: keel line (s = -1 stern .. 1 bow)
  const keelAt = s => s > .62 ? T * Math.sqrt(Math.max(0, 1 - ((s - .62) / .38) ** 2)) * .98 + T * .02 : s < -.5 ? T * (1 - .62 * ((-.5 - s) / .5) ** 1.3) : T;
  const nAt = s => 1.35 + 1.4 * Math.max(0, 1 - Math.abs(s + .05) / .75);   // section fullness exponent
  const at = (arr, z) => { const u = Math.max(0, Math.min(NS, (z - z0) / L * NS)), i = Math.min(NS - 1, Math.floor(u)), t = u - i; return arr[i] * (1 - t) + arr[i + 1] * t; };
  const sOf = z => (z - z0) / L * 2 - 1;
  H = {
    key, L, z0, z1, T, B2, NS, bw, dk, top: ytop,
    beam: z => at(bw, z), deck: z => at(dk, z), keel: z => keelAt(sOf(z)), nx: z => nAt(sOf(z)),
    /* the hull's half-breadth at depth y (<= 0) at z */
    breadth(z, y) { const b = at(bw, z), k = keelAt(sOf(z)); if (y >= 0) return b; if (-y >= k) return 0; const nn = nAt(sOf(z)); return b * Math.pow(1 - Math.pow(-y / k, nn), 1 / nn); },
    hasBelow, below: null, sonar: /destroyer|cg/.test(key), mass: (def.mot && def.mot.mass ? def.mot.mass : 0) * 1000,
  };
  if (!hasBelow) H.below = registerBelow(R, key, H);
  layouts.set(key, H);
  return H;
}

/* the underwater hull as a model: '<key>~below' */
function registerBelow(R, key, H) {
  const k2 = key + '~below';
  if (R.models.has(k2)) return k2;
  R.models.registerModel(k2, () => {
    const G = window.GEO, P = [], dome = [], aft = [];
    const NZ = Math.max(24, Math.round(H.L / 3.2)), NJ = 7, th = .35;
    // outline of a station: from the waterline (j = 0) round the bilge to the keel (j = NJ), one side
    const pt = (z, j, side, inset) => {
      const k = H.keel(z), nn = H.nx(z), b = H.beam(z), a = j / NJ * Math.PI / 2;
      // a superellipse |x/b|^nn + |y/k|^nn = 1, walked by angle
      const c = Math.cos(a), s = Math.sin(a), x = b * Math.sign(c) * Math.pow(Math.abs(c), 2 / nn), y = -k * Math.pow(Math.abs(s), 2 / nn);
      const nx = x / Math.max(.01, b), ny = -y / Math.max(.01, k), l = Math.hypot(nx, ny) || 1;
      return [side * (x - inset * nx / l), y + inset * ny / l, z];
    };
    for (let i = 0; i < NZ; i++) {
      const za = H.z0 + H.L * i / NZ, zb = H.z0 + H.L * (i + 1) / NZ;
      if (H.beam(za) < .2 && H.beam(zb) < .2) continue;
      for (const side of [-1, 1]) for (let j = 0; j < NJ; j++) {
        const o0 = pt(za, j, side, 0), o1 = pt(zb, j, side, 0), o2 = pt(zb, j + 1, side, 0), o3 = pt(za, j + 1, side, 0);
        const i0 = pt(za, j, side, th), i1 = pt(zb, j, side, th), i2 = pt(zb, j + 1, side, th), i3 = pt(za, j + 1, side, th);
        P.push(G.hex([o0, o1, o2, o3, i0, i1, i2, i3], { bottom: true, skip: [1, 2, 3, 4, 5] }));
      }
    }
    // the transom below the waterline (an immersed transom stern)
    { const z = H.z0 + .01, k = H.keel(z) * .9, b = H.beam(z) * .92;
      for (const side of [-1, 1]) P.push(G.hex([[0, 0, z], [side * b, 0, z], [side * b * .8, -k * .7, z], [0, -k, z], [0, 0, z + th], [side * b, 0, z + th], [side * b * .8, -k * .7, z + th], [0, -k, z + th]], { bottom: true, skip: [1, 2, 3, 4, 5] })); }
    if (H.sonar) {
      // the bow sonar dome under the forefoot (a teardrop, ~15 m long)
      const zc = H.z1 - H.L * .07, k = H.T;
      dome.push(G.lathe([0, -k * .86, zc - 8], [0, .02, 1], [[0, .2], [2, 1.6], [6, 2.4], [10, 2.2], [13, 1.4], [15, .2]], { n: 22 }));
      // twin screws, shafts, struts and rudders aft (DDG-51: two 5.2 m five-bladed screws)
      const zp = H.z0 + H.L * .1, yp = -H.keel(zp) + 2.9, xs = Math.min(4.6, H.beam(zp) * .5);
      for (const sx of [-1, 1]) {
        aft.push(G.blades([sx * xs, yp, zp], [0, 0, 1], 5, .55, 2.6, { chord: .7, taper: 1.1, pitch: .25, rot: sx * .4 }));
        aft.push(G.lathe([sx * xs, yp, zp - .9], [0, 0, 1], [[0, .15], [.4, .6], [1.6, .55], [2, .3]], { n: 12 }));
        aft.push(G.cyl([sx * xs, yp, zp + .9], [sx * xs * .55, yp + 2.2, zp + 26], .28, { n: 8 }));
        const zs = zp + 2.6;
        aft.push(G.box([sx * xs - .15, yp, zs - .6], [sx * xs + .15, yp + 3.2, zs + .6]));
        const zr = zp - 5.2, yr = -H.keel(zr);
        aft.push(G.box([sx * xs - .22, yr + .4, zr - 2.1], [sx * xs + .22, Math.min(-.6, yr + 5.2), zr + 2.1]));
      }
    }
    const parts = [{ name: 'keel', label: 'Hull below the waterline', prims: P }];
    if (dome.length) parts.push({ name: 'dome', label: 'Sonar dome', prims: dome });
    if (aft.length) parts.push({ name: 'screws', label: 'Screws, shafts, rudders', prims: aft });
    return { parts };
  }, { lods: R.models.get(key).lods.slice() });
  return k2;
}

/* The sections of a hull: n equal slabs (bow and stern cuts at the joints), with a joint moved onto the worst damage
   when one lies within half a section of it. -> { zc: [n + 1 cut z], sec: [{ z0, z1, zc, m, cols }], ... } */
export function sectionsOf(H, def, focus) {
  const n = Math.max(4, Math.min(8, Math.round(H.L / 26)));
  const zc = [];
  for (let i = 0; i <= n; i++) zc.push(H.z0 + H.L * i / n);
  if (focus !== null && focus !== undefined) {
    let bj = -1, bd = 1e9;
    for (let j = 1; j < n; j++) { const d = Math.abs(zc[j] - focus); if (d < bd) { bd = d; bj = j; } }
    if (bj > 0 && bd < H.L / n * .5) zc[bj] = Math.max(zc[bj - 1] + H.L / n * .45, Math.min(zc[bj + 1] - H.L / n * .45, focus));
  }
  // the columns: 2 stations a section x 4 across; each a vertical column from the keel to the deck
  const sec = [];
  let Vtot = 0;
  for (let i = 0; i < n; i++) {
    const a = zc[i], b = zc[i + 1], cols = [];
    let V = 0;
    for (let q = 0; q < 2; q++) {
      const z = a + (b - a) * (q + .5) / 2, bb = Math.max(.3, H.beam(z)), k = H.keel(z), d = Math.max(2, H.deck(z));
      for (const u of [-.75, -.25, .25, .75]) {
        const x = u * bb, bot = -k * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), H.nx(z))), 1 / H.nx(z));
        const A = (b - a) / 2 * bb / 2;
        cols.push({ x, z, yb: Math.min(-.2, bot), yt: d, A, side: u < 0 ? 0 : 1 });
        V += A * Math.max(0, -Math.min(-.2, bot));
      }
    }
    sec.push({ i, z0: a, z1: b, zc: (a + b) / 2, cols, V0: V, m: 0, len: b - a });
    Vtot += V;
  }
  // the masses: each section's share of the displacement as its buoyancy at the design draught (level trim, no
  // still-water bending), scaled to the ship's displacement
  const Mt = H.mass > 0 ? H.mass : RHO * Vtot, k = Mt / (RHO * Vtot);
  for (const s of sec) s.m = RHO * s.V0 * k;
  // the columns' own balance: the section's buoyancy must carry its mass at the design draught
  for (const s of sec) { const want = s.m / RHO, have = s.V0 || 1; for (const c of s.cols) c.A *= want / have; }
  const yG = -H.T * .18;
  return { n, zc, sec, yG, M: sec.reduce((t, s) => t + s.m, 0) };
}

/* the inside of a torn face at cut z (model frame points [x, y, z, kind] kind 0 shell, 1 deck, 2 frame): the shell's
   outline, the decks and platforms across it, the inner bottom, the centreline girder, the longitudinal bulkheads;
   every point on the cut's tear (amplitude A m, seed s, wavelength wv m) */
export function faceOf(H, z, A, s, wv, sp) {
  const out = [], b = Math.max(.5, H.beam(z)), k = H.keel(z), d = Math.max(2, H.deck(z));
  const put = (x, y, kind, j) => {
    if (hsh(j, s * 97 + kind) < .12) return;                                             // torn out
    const jx = (hsh(j, s * 13 + 1) - .5) * sp * .5, jy = (hsh(j, s * 13 + 2) - .5) * sp * .5;
    const zz = z + A * jagK((x + jx) / wv, (y + jy) / wv, s) + (hsh(j, s * 13 + 3) - .5) * sp;
    out.push(x + jx, y + jy, zz, kind);
  };
  let j = 0;
  // the shell: the outline from the deck edge down round the bilge to the keel, both sides
  for (const side of [-1, 1]) {
    for (let y = d; y > 0; y -= sp) put(side * b, y, 0, j++);
    for (let y = 0; y > -k; y -= sp) put(side * H.breadth(z, y), y, 0, j++);
  }
  // decks: the main deck (the hull's top), the 1st and 2nd platforms, the inner bottom
  const levels = [d, Math.min(d - 2.6, 2.6), -Math.min(k * .45, 3.2), -k + Math.min(1.4, k * .18)];
  for (const y of levels) { const w = y >= 0 ? b : H.breadth(z, y); for (let x = -w; x <= w; x += sp) put(x, y, 1, j++); }
  // extra decks up a tall hull (a carrier's hangar and galleries)
  for (let y = 5.5; y < d - 2; y += 5.5) { if (Math.abs(y - levels[1]) < 2) continue; for (let x = -b; x <= b; x += sp * 1.4) put(x, y, 1, j++); }
  // the centreline girder and longitudinal bulkheads, frames at the tank tops
  for (const xb of [0, -b * .5, b * .5]) { const y0 = xb ? levels[3] : -k; for (let y = y0; y < (xb ? levels[1] : d); y += sp) put(xb, y, 2, j++); }
  return new Float32Array(out);
}
