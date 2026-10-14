/* Model dot density (Settings > Graphics > Model dot density): the films' lattice look for the models.

   import { setModelDots, MODEL_DOTS } from './engine/lattice.js'
   setModelDots(R, 'standard' | 'high' | 'ultra')      live: call it again whenever the setting changes

   Standard is the engine as it is (engine/models.js: jittered grids, its own knobs). High and Ultra draw the models the
   way reference/films/pc_scan_railgun_parts.js (sampleLat, drawX) does:
   - surfaces sampled on regular lattices, no jitter (faces, lathes in staggered rows with their true cone normals, caps,
     panels, blades), so a hull reads as rows and files of returns, never speckle;
   - edges as dotted hairlines at ~0.6 of the face spacing, two-sided: a box's twelve edges, a lathe's stations as
     rings, a panel's and a blade's outline, and the models' own feature lines (the wire-only prims the Orbital
     hairlines draw: hull sections, deck edges, windows, doors, rings), so the forms are drawn as well as filled;
   - levels of detail a factor ~2 apart from the same finest to the same coarsest spacing (Standard: x2.4, x2.5): the
     drawn level always sits close under the target spacing on screen, so the per-pixel cap has little to thin at
     random;
   - close up the sub-dots fill each lattice cell with a regular sub-lattice (no jitter; each cell its own local steps,
     so they tile across a tapering plate) to a finer spacing, 1 px dots; little random thinning (the per-pixel cap and
     the grazing floor relaxed).
   High: the lattice at about the films' density (the dots ~3 px apart close up). Ultra: denser (~2.4 px, the films' own
   stills), finer levels at mid range. At play range both cost what Standard does (no edges on the coarsest level);
   close up Ultra draws ~2x Standard's sub-dots. Applied live: the clouds of the models it covers are dropped, their
   coarsest level re-sampled at once (~60 ms for a battle's 70 models, once) and the finer ones within the frame budget.

   Covered: every model but the ground's and the towns' merged blocks (gnd_*, lmb_*) and the sea-ice tiles (lm_ice_*):
   units, rounds, cutaways, wrecks, landmark ships and buildings. The ground and the sea: Settings > Dot density.

   Engine hooks (engine/models.js): ModelLib.samplerFor(e) -> a sampler replacing samplePrims for entry e (or null),
   called by _sample and _advance. This module also wraps the library's get() so a new entry gets the lattice's level
   ladder while it is on. */

const TAU = Math.PI * 2;

/* the presets. lat: lattice sampling and edges; the rest are engine/models.js knobs (Standard: the engine's own) */
export const MODEL_DOTS = {
  standard: { lat: false },
  high: { lat: true, lodPx: 2.8, subPx: 3.0, subCap: 2.4, subJitter: 0, dotSpacing: 1.4, grazing: .6, rowPx: 0 },
  ultra: { lat: true, lodPx: 2.5, subPx: 2.4, subCap: 2.1, subJitter: 0, dotSpacing: 1.25, grazing: .65, rowPx: 0 },
};
const KNOBS = ['lodPx', 'subPx', 'subCap', 'subJitter', 'dotSpacing', 'grazing', 'rowPx'];
/* models left as the engine samples them: the ground's and the towns' merged blocks (big, many), injected clouds */
const SKIP = /^(gnd_|lmb_|lm_ice_)/;
export const latticeCovers = key => !SKIP.test(key);

/* ---------- sampling straight into the engine's GPU layout (models.js PtBuf: W.need(k), W.put(...), W.addGeo) ----------
   put(x, y, z, nx, ny, nz, ux, uy, uz, su, vx, vy, vz, sv, ju, jv, sp): position, normal (0: two-sided), the sample's
   cell (U axis + size, V axis + size; sv 0 for a line), where it sits in the cell (0, 0: the centre, a lattice), the
   level spacing */
const HF = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const HE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const dist3 = (a, b) => Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
const _hn = new Float32Array(18);
/* a hex's outward face normals into _hn (GEO's faceNormals) */
function hexNormals(P) {
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 8; k++) { cx += P[k][0]; cy += P[k][1]; cz += P[k][2]; }
  cx /= 8; cy /= 8; cz /= 8;
  for (let k = 0; k < 6; k++) {
    const F = HF[k], a = P[F[0]], b = P[F[1]], c = P[F[2]], d = P[F[3]];
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.sqrt(nx * nx + ny * ny + nz * nz) < 1e-9) {
      ux = c[0] - b[0]; uy = c[1] - b[1]; uz = c[2] - b[2]; vx = d[0] - b[0]; vy = d[1] - b[1]; vz = d[2] - b[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
    }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const fx = (a[0] + b[0] + c[0] + d[0]) / 4 - cx, fy = (a[1] + b[1] + c[1] + d[1]) / 4 - cy, fz = (a[2] + b[2] + c[2] + d[2]) / 4 - cz;
    if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    _hn[k * 3] = nx; _hn[k * 3 + 1] = ny; _hn[k * 3 + 2] = nz;
  }
}
/* a quad a b c d on a regular grid at spacing s (bilinear). Each sample's cell is its own: the local steps of the grid
   (the bilinear map's derivatives over a step), so on a tapering plate (a lofted hull, a deck narrowing to the bow) the
   sub-dots of neighbouring cells still tile into one even lattice */
function quadL(a, b, c, d, nx, ny, nz, s, W, sp) {
  const nu = Math.max(1, Math.round(Math.max(dist3(a, b), dist3(d, c)) / s)), nv = Math.max(1, Math.round(Math.max(dist3(a, d), dist3(b, c)) / s));
  W.need(nu * nv);
  for (let i = 0; i < nu; i++) {
    const u = (i + .5) / nu, iu = 1 - u;
    const p0x = a[0] * iu + b[0] * u, p0y = a[1] * iu + b[1] * u, p0z = a[2] * iu + b[2] * u;
    const p1x = d[0] * iu + c[0] * u, p1y = d[1] * iu + c[1] * u, p1z = d[2] * iu + c[2] * u;
    // the step across v at this u: p0 -> p1 over nv
    let vx = (p1x - p0x) / nv, vy = (p1y - p0y) / nv, vz = (p1z - p0z) / nv;
    const sv = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-6; vx /= sv; vy /= sv; vz /= sv;
    for (let j = 0; j < nv; j++) {
      const v = (j + .5) / nv, iv = 1 - v;
      // the step across u at this v: (b - a) iv + (c - d) v over nu
      let ux = ((b[0] - a[0]) * iv + (c[0] - d[0]) * v) / nu, uy = ((b[1] - a[1]) * iv + (c[1] - d[1]) * v) / nu, uz = ((b[2] - a[2]) * iv + (c[2] - d[2]) * v) / nu;
      const su = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-6; ux /= su; uy /= su; uz /= su;
      W.put(p0x + (p1x - p0x) * v, p0y + (p1y - p0y) * v, p0z + (p1z - p0z) * v, nx, ny, nz, ux, uy, uz, su, vx, vy, vz, sv, 0, 0, sp);
    }
  }
}
/* a hairline a -> b at spacing es: two-sided returns, a one-dimensional cell along it (sub-dots fill it lengthwise).
   An edge much shorter than the spacing is left to the faces round it */
function lineL(ax, ay, az, bx, by, bz, es, W, sp) {
  const L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az));
  let n = Math.round(L / es);
  if (n < 1) { if (L < es * .35) return; n = 1; }
  W.need(n);
  const ux = (bx - ax) / L, uy = (by - ay) / L, uz = (bz - az) / L, su = L / n;
  for (let k = 0; k < n; k++) { const t = (k + .5) / n; W.put(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, 0, 0, 0, ux, uy, uz, su, 0, 0, 0, 0, 0, 0, sp); }
}
/* a ring of radius r round centre c in the plane U, V at spacing es (two-sided) */
function ringL(cx, cy, cz, U, V, r, es, W, sp) {
  const n = Math.max(10, Math.round(TAU * r / es)), su = TAU * r / n;
  W.need(n);
  for (let k = 0; k < n; k++) {
    const t = (k + .5) / n * TAU, c = Math.cos(t), s = Math.sin(t);
    W.put(cx + (U[0] * c + V[0] * s) * r, cy + (U[1] * c + V[1] * s) * r, cz + (U[2] * c + V[2] * s) * r, 0, 0, 0,
      -U[0] * s + V[0] * c, -U[1] * s + V[1] * c, -U[2] * s + V[2] * c, su, 0, 0, 0, 0, 0, 0, sp);
  }
}
/* a hex's distinct edges (a wire-only hex is a feature line: GEO.draw's fl / fl2 / fquad, its top face the bottom's
   twin and its sides 0.1 mm wide): zero-length and repeated segments dropped */
const _seg = [];
function hexEdges(P, es, W, sp) {
  _seg.length = 0;
  for (const [i, j] of HE) {
    const a = P[i], b = P[j];
    if (dist3(a, b) < 1e-3) continue;
    let dup = false;
    for (let k = 0; k < _seg.length && !dup; k += 2) {
      const c = _seg[k], d = _seg[k + 1];
      dup = (dist3(a, c) < 2e-3 && dist3(b, d) < 2e-3) || (dist3(a, d) < 2e-3 && dist3(b, c) < 2e-3);
    }
    if (dup) continue;
    _seg.push(a, b);
    lineL(a[0], a[1], a[2], b[0], b[1], b[2], es, W, sp);
  }
}
/* GEO's perp(d): two unit vectors across the axis d (the engine's lathes use the same frame) */
function perp(d) {
  const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  let ux = a[1] * d[2] - a[2] * d[1], uy = a[2] * d[0] - a[0] * d[2], uz = a[0] * d[1] - a[1] * d[0];
  const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
  return [[ux, uy, uz], [d[1] * uz - d[2] * uy, d[2] * ux - d[0] * uz, d[0] * uy - d[1] * ux]];
}
/* a surface of revolution: rows along the generator, each row as many returns as its own circumference holds, odd
   rows turned half a step (the films' staggered rows); normals off the cone's slope; caps as rings of returns */
function latheL(pr, s, W, sp, surf) {
  const dl = Math.hypot(pr.d[0], pr.d[1], pr.d[2]) || 1, d = [pr.d[0] / dl, pr.d[1] / dl, pr.d[2] / dl], A = pr.a, st = pr.st, [U, Vv] = perp(d);
  if (!surf) return d;
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i][0], r0 = st[i][1], s1 = st[i + 1][0], r1 = st[i + 1][1], ds = s1 - s0, dr = r1 - r0;
    const L = Math.hypot(ds, dr), na = Math.max(1, Math.round(L / s)), rm = Math.max(r0, r1);
    if (L < 1e-6 || rm < 1e-5) continue;
    const ka = -dr / L, kr = ds / L, ga = ds / L, gr = dr / L;     // the normal's axial and radial shares; the generator's
    for (let a = 0; a < na; a++) {
      const u = (a + .5) / na, sr = s0 + ds * u, rr = r0 + dr * u;
      const nt = Math.max(6, Math.round(TAU * Math.max(rr, rm * .15) / s)), off = (a & 1) * .5;
      W.need(nt);
      for (let t = 0; t < nt; t++) {
        const th = (t + .5 + off) / nt * TAU, c = Math.cos(th), sn = Math.sin(th);
        const rx = U[0] * c + Vv[0] * sn, ry = U[1] * c + Vv[1] * sn, rz = U[2] * c + Vv[2] * sn;
        W.put(A[0] + d[0] * sr + rx * rr, A[1] + d[1] * sr + ry * rr, A[2] + d[2] * sr + rz * rr,
          rx * kr + d[0] * ka, ry * kr + d[1] * ka, rz * kr + d[2] * ka,
          d[0] * ga + rx * gr, d[1] * ga + ry * gr, d[2] * ga + rz * gr, L / na,
          -U[0] * sn + Vv[0] * c, -U[1] * sn + Vv[1] * c, -U[2] * sn + Vv[2] * c, TAU * Math.max(rr, 1e-4) / nt, 0, 0, sp);
      }
    }
  }
  if (pr.caps) for (const i of [0, st.length - 1]) {
    const sc = st[i][0], rc = st[i][1]; if (rc < .01) continue;
    const nr = Math.max(1, Math.round(rc / s)), cx = A[0] + d[0] * sc, cy = A[1] + d[1] * sc, cz = A[2] + d[2] * sc, sg = i ? 1 : -1;
    for (let k = 0; k < nr; k++) {
      const rr = (k + .5) / nr * rc, nt = Math.max(5, Math.round(TAU * rr / s));
      W.need(nt);
      for (let t = 0; t < nt; t++) {
        const th = (t + .5) / nt * TAU, c = Math.cos(th), sn = Math.sin(th);
        const rx = U[0] * c + Vv[0] * sn, ry = U[1] * c + Vv[1] * sn, rz = U[2] * c + Vv[2] * sn;
        W.put(cx + rx * rr, cy + ry * rr, cz + rz * rr, d[0] * sg, d[1] * sg, d[2] * sg, rx, ry, rz, rc / nr,
          -U[0] * sn + Vv[0] * c, -U[1] * sn + Vv[1] * c, -U[2] * sn + Vv[2] * c, TAU * rr / nt, 0, 0, sp);
      }
    }
  }
  return d;
}
/* a lathe's rings: at its listed stations (the wire's rings), else at every station; repeated stations once */
function latheRings(pr, d, es, W, sp) {
  const A = pr.a, st = pr.st, [U, Vv] = perp(d), at = pr.rings || st.map((_, i) => i);
  let ls = NaN, lr = NaN;
  for (const i of at) {
    const q = st[i]; if (!q) continue;
    const sv = q[0], rv = q[1];
    if (rv <= .005 || (Math.abs(sv - ls) < .005 && Math.abs(rv - lr) < .005)) continue;
    ls = sv; lr = rv;
    ringL(A[0] + d[0] * sv, A[1] + d[1] * sv, A[2] + d[2] * sv, U, Vv, rv, es, W, sp);
  }
}
/* GEO's destroyer-like hull (hullB, hullD) on a lattice, the deck edges as hairlines */
function hullB(pr, s) {
  const B = pr.B / 2;
  if (s > .3) return B * Math.max(0, 1 - Math.pow((s - .3) / .7, 1.75));
  if (s < -.82) return B * (.84 + .16 * (1 - (-.82 - s) / .18));
  return B;
}
const hullD = (pr, s) => pr.D + 3.6 * Math.pow(Math.max(0, (s - .25) / .75), 2);
function hullL(pr, s, es, W, sp) {
  const L = pr.L, ns = Math.max(1, Math.round(L / s)), su = L / ns;
  for (let i = 0; i < ns; i++) {
    const sx = -1 + 2 * (i + .5) / ns, d = hullD(pr, sx), bD = hullB(pr, sx);
    const nh = Math.max(1, Math.round(d / s)), nz = sx > .3 ? sx - .3 : 0, nl = Math.hypot(1, nz), nb = Math.max(1, Math.round(2 * bD / s));
    W.need(nh * 2 + nb);
    for (const side of [-1, 1]) for (let j = 0; j < nh; j++) {
      const y = (j + .5) / nh * d, b = bD * (.9 + .1 * y / d);
      W.put(side * b, y, sx * L / 2, side / nl, 0, nz / nl, 0, 0, 1, su, 0, 1, 0, d / nh, 0, 0, sp);
    }
    for (let j = 0; j < nb; j++) W.put((-1 + 2 * (j + .5) / nb) * bD, d, sx * L / 2, 0, 1, 0, 0, 0, 1, su, 1, 0, 0, 2 * bD / nb, 0, 0, sp);
  }
  const ne = Math.max(2, Math.round(L / es));
  for (const side of [-1, 1]) for (let i = 0; i < ne; i++) {
    const a = -1 + 2 * i / ne, b = -1 + 2 * (i + 1) / ne;
    lineL(side * hullB(pr, a), hullD(pr, a), a * L / 2, side * hullB(pr, b), hullD(pr, b), b * L / 2, es, W, sp);
  }
}
const _one = { name: '', prims: [null] }, _oneM = { parts: [_one] };
/* prims[i0..] at level spacing sp into W, the films' lattice, until the end or until performance.now() passes tEnd;
   returns the next index (models.js samplePrims' contract). skipFine: leave out the prims flagged fine; ek: the edges'
   spacing as a share of the face spacing (the films' 0.6 close up; sparser on the far levels, so a unit at play range
   stays a cloud with its structure, not a solid blob of outlines) */
export function sampleLattice(prims, i0, sp, skipFine, W, tEnd, seed, ek) {
  if (ek === undefined) ek = .6;
  let i = i0;
  for (; i < prims.length; i++) {
    const pr = prims[i];
    if (!pr || (skipFine && pr.fine)) continue;
    // (a finer prim (ds < 1: painted stripes, small detail) at most ~1.7 x the face density: a regular lattice that
    // fine reads as a solid white band, not as dots)
    const ds = pr.ds || 1, s = Math.max(.6, ds) * sp, es = ek > 0 ? sp * ek * Math.min(2, Math.max(.6, ds)) : s;
    // the hairlines follow the wire's own visibility (al 0: a dots-only skin patch; w 0: an invisible line)
    const edges = ek > 0 && pr.al !== 0 && pr.w !== 0;
    const surf = pr.pts !== false;
    const t = pr.t;
    if (t === 'hex' && pr.p && pr.p.length === 8) {
      const P = pr.p;
      if (surf) {
        hexNormals(P);
        for (let k = 0; k < 6; k++) {
          if (k === 0 && pr.bottom !== true) continue;
          if (pr.skip && pr.skip.includes(k)) continue;
          const F = HF[k];
          quadL(P[F[0]], P[F[1]], P[F[2]], P[F[3]], _hn[k * 3], _hn[k * 3 + 1], _hn[k * 3 + 2], s, W, sp);
        }
      }
      if (edges) hexEdges(P, es, W, sp);
    } else if (t === 'lathe' && pr.st && pr.st.length > 1) {
      const d = latheL(pr, s, W, sp, surf);
      if (edges) latheRings(pr, d, es, W, sp);
    } else if (t === 'panel' && pr.p && pr.p.length >= 3) {
      const P = pr.p;
      if (surf && P.length === 4) quadL(P[0], P[1], P[2], P[3], 0, 0, 0, s, W, sp);
      if (edges) for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; lineL(a[0], a[1], a[2], b[0], b[1], b[2], es, W, sp); }
    } else if (t === 'line' && pr.p && pr.p.length > 1) {
      if (edges || surf) {
        const P = pr.p, m = pr.closed ? P.length : P.length - 1;
        for (let k = 0; k < m; k++) { const a = P[k], b = P[(k + 1) % P.length]; lineL(a[0], a[1], a[2], b[0], b[1], b[2], es, W, sp); }
      }
    } else if (t === 'blades') {
      if (surf || edges) for (const q of GEO.bladeQuads(pr)) {
        if (surf) quadL(q[0], q[1], q[2], q[3], 0, 0, 0, s, W, sp);
        if (edges) for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; lineL(a[0], a[1], a[2], b[0], b[1], b[2], es, W, sp); }
      }
    } else if (t === 'hull') {
      if (surf) hullL(pr, s, es, W, sp);
    } else if (surf) {
      // anything else the engine's way (GEO.sample: jittered, no cells)
      _one.prims[0] = pr; W.addGeo(GEO.sample(_oneM, sp, seed + i * 7919, {})[0].pts);
    }
    if (performance.now() > tEnd) return i + 1;
  }
  return i;
}

/* ---------- levels of detail: the same finest and coarsest spacing as the engine's, a factor ~2 apart ---------- */
function ladder(lods) {
  const a = lods[0], b = lods[lods.length - 1];
  if (!(a > 0) || !(b > a)) return lods.slice();
  const n = Math.max(lods.length, Math.round(Math.log2(b / a)) + 1), k = Math.pow(b / a, 1 / (n - 1)), out = [];
  for (let i = 0; i < n; i++) out.push(i === n - 1 ? b : a * Math.pow(k, i));
  return out;
}
/* an entry's levels set to lods: its parts' caches emptied (their GPU clouds freed) and sized to match */
function relevel(M, e, lods) {
  M._free(e);
  e.lods = lods;
  for (const P of e.parts) { P.clouds = lods.map(() => null); P.lru = P.dyn ? lods.map(() => new Map()) : null; P.jobs = null; }
}

/* ---------- the switch ---------- */
const STATE = new WeakMap();    // ModelLib -> { level, std (the engine's own knob values), get0 }
export function setModelDots(R, level) {
  const M = R && R.models;
  if (!M) return;
  const C = MODEL_DOTS[level] ? level : 'standard', cfg = MODEL_DOTS[C];
  let S = STATE.get(M);
  if (!S) {
    S = { level: 'standard', std: {}, lat: false };
    for (const k of KNOBS) if (M[k] !== undefined) S.std[k] = M[k];
    // new entries get the lattice's ladder while it is on (the engine's get() builds them, this sets their levels)
    const get0 = M.get;
    M.get = function (key) {
      let e = this.entries.get(key);
      if (e) return e;
      e = get0.call(this, key);
      if (S.lat && latticeCovers(key) && !e._lods0) { e._lods0 = e.lods; relevel(this, e, ladder(e.lods)); }
      return e;
    };
    // the engine's hook: the lattice sampler for the entries it covers while it is on (one closure per entry)
    M.samplerFor = e => {
      if (!S.lat || !e._lods0) return null;
      if (!e._lat) {
        // fine prims from the levels over 4.5 x the finest left out; the edges 0.6 of the face spacing on the finest level,
        // sparser on the coarser ones, none on the coarsest (a unit a few pixels across at play range: its faces are plenty)
        const l0 = e.lods[0], lr = Math.log(e.lods[e.lods.length - 1] / l0) || 1, fine = l0 * 4.5;
        e._lat = (prims, i0, sp, rnd, skipFine, W, tEnd, seed) => {
          const t = Math.min(1, Math.max(0, Math.log(sp / l0) / lr));
          return sampleLattice(prims, i0, sp, sp > fine, W, tEnd, seed, t > .95 ? 0 : .6 + .5 * t);
        };
      }
      return e._lat;
    };
    STATE.set(M, S);
  }
  // the knobs: the preset's, else the engine's own
  for (const k of KNOBS) { const v = cfg[k] !== undefined ? cfg[k] : S.std[k]; if (v !== undefined && M[k] !== v) M[k] = v; }
  if (S.lat !== cfg.lat) {
    S.lat = cfg.lat;
    // the entries it covers re-sampled (on: the ladder; off: their own levels back), from their coarsest level up within
    // the frame budget; the cross-fade states and the queued levels of those entries forgotten
    const hit = new Set();
    for (const e of M.entries.values()) {
      if (!latticeCovers(e.key)) continue;
      if (cfg.lat && !e._lods0) { e._lods0 = e.lods; relevel(M, e, ladder(e.lods)); }
      else if (!cfg.lat && e._lods0) { const l0 = e._lods0; e._lods0 = null; e._lat = null; relevel(M, e, l0); }
      else continue;
      hit.add(e);
    }
    if (hit.size) {
      for (let i = M.pending.length - 1; i >= 0; i--) if (hit.has(M.pending[i].e)) M.pending.splice(i, 1);
      for (const [k, X] of M.xs) if (hit.has(X.e)) M.xs.delete(k);
      // their coarsest level at once (a battle's 70-odd models: ~60 ms, once, on the switch), the next one queued: no
      // part goes missing while the finer levels come in within the frame budget
      for (const e of hit) { try { M.warm(e.key); } catch (err) { /* sampled when drawn */ } }
    }
  }
  S.level = C;
  return C;
}
export const modelDotsOf = R => { const S = R && R.models && STATE.get(R.models); return S ? S.level : 'standard'; };
