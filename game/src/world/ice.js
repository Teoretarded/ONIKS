/* Sea ice: one analytic model shared by the generator (the sim's class grid), the map preview and the renderer's
   dots (game/landmarks.js). DOM-free, deterministic, no Math.random.

   const ice = makeIce(spec, hRaw)         // spec: map.iceSpec (from the generator), hRaw(x, z): the true DEM
   ice.at(x, z, s, o)                      // the ice at a point, detail filtered to a sample spacing s (m):
                                           //   o.ice 0|1, o.y surface (m above the sea), o.b brightness 0..1,
                                           //   o.k kind (K below), o.cls sim class (C below)

   The ice, from the shore out (distances from land, zones on a 1 km grid that breathe along the coast):
     fast ice      land-fast, continuous, snow on it; tide cracks, hummocks toward its edge; the edge is broken along
                   floe boundaries. Walkable for vehicles within `walk` m of the shore (the sim: C.WALK)
     flaw lead     open water between the fast ice and the pack (the shore polynya), young ice in patches
     pack          a mosaic of floes (Voronoi at two scales: big floes ~2 km split into floes ~0.45 km), cracks and
                   leads between them, pressure ridges on the closed seams, broken rims on the open edges
     marginal zone floes breaking up into cakes, brash and pancake ice, thinning out to the open sea
   and over it all: the major leads (polylines, 0.9-2 km wide: the ships' way through the pack) and the icebreaker
   channel (a band of broken ice with the fresh track in the middle). Sim classes: ships sail open water and thin
   ice (brash, the marginal zone, the channel); pack and fast ice stop them; vehicles cross the walkable fast ice. */

export const C = { OPEN: 0, THIN: 1, PACK: 2, FAST: 3, WALK: 4 };
export const K = { WATER: 0, FLOE: 1, RIDGE: 2, RIM: 3, BRASH: 4, PANCAKE: 5, NILAS: 6, FAST: 7, CAKE: 8 };

/* integer hash -> [0, 1) */
function h2(i, j, s) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae3d); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* value noise (smooth, cheap), about [-1, 1] */
function vn(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi;
  const a = h2(xi, zi, s), b = h2(xi + 1, zi, s), c = h2(xi, zi + 1, s), d = h2(xi + 1, zi + 1, s);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return ((a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv) * 2 - 1;
}

/* Voronoi on a jittered grid of cell S: the nearest seed (id, position) and the distance to the nearest cell edge
   (the exact bisector with the 8 neighbours). Writes into V: { i, j, sx, sz, e, ni, nj } (n: the neighbour across
   that edge) */
function voronoi(x, z, S, seed, V) {
  const fx = x / S, fz = z / S, ci = Math.floor(fx), cj = Math.floor(fz);
  let bi = 0, bj = 0, bx = 0, bz = 0, bd = 1e30;
  const PX = VX, PZ = VZ, PI_ = VI, PJ = VJ;
  let n = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj;
    const px = (i + .5 + .86 * (h2(i, j, seed) - .5)) * S, pz = (j + .5 + .86 * (h2(i, j, seed + 101) - .5)) * S;
    PX[n] = px; PZ[n] = pz; PI_[n] = i; PJ[n] = j;
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bd) { bd = d; bi = i; bj = j; bx = px; bz = pz; }
    n++;
  }
  let e = 1e30, ni = bi, nj = bj;
  for (let k = 0; k < 9; k++) {
    if (PI_[k] === bi && PJ[k] === bj) continue;
    const qx = PX[k], qz = PZ[k], dx = qx - bx, dz = qz - bz, L = Math.sqrt(dx * dx + dz * dz);
    // distance from (x, z) to the bisector of the nearest seed and this one
    const dq = (qx - x) * (qx - x) + (qz - z) * (qz - z);
    const ed = (dq - bd) / (2 * L);
    if (ed < e) { e = ed; ni = PI_[k]; nj = PJ[k]; }
  }
  V.i = bi; V.j = bj; V.sx = bx; V.sz = bz; V.e = e; V.ni = ni; V.nj = nj;
  return V;
}
const VX = new Float64Array(9), VZ = new Float64Array(9), VI = new Int32Array(9), VJ = new Int32Array(9);
/* a stable hash of the edge between two cells (the same from either side) */
function edgeHash(ai, aj, bi, bj, s) {
  if (ai > bi || (ai === bi && aj > bj)) { const t = ai; ai = bi; bi = t; const u = aj; aj = bj; bj = u; }
  return h2(ai * 7919 + bi, aj * 104729 + bj, s);
}

/* bilinear on a grid { cell, cols, rows, x0, z0 } */
function bil(g, a, x, z) {
  let fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
  const cm = g.cols - 1, rm = g.rows - 1;
  if (fx < 0) fx = 0; else if (fx > cm) fx = cm;
  if (fz < 0) fz = 0; else if (fz > rm) fz = rm;
  let i = fx | 0, j = fz | 0; if (i >= cm) i = cm - 1; if (j >= rm) j = rm - 1;
  const u = fx - i, v = fz - j, o = j * g.cols + i;
  return (a[o] + (a[o + 1] - a[o]) * u) * (1 - v) + (a[o + g.cols] + (a[o + g.cols + 1] - a[o + g.cols]) * u) * v;
}

export function makeIce(spec, hRaw) {
  const G = spec.g, Z = spec.zg, sd = spec.seed | 0;
  const S1 = spec.S[0], S2 = spec.S[1], S3 = spec.S[2], S4 = spec.S[3];
  const walk = spec.walk || 1500, chW = spec.chW || 450;
  const ch = spec.channel || [], chN = ch.length;
  // channel segments' bounding box (a cheap reject before the exact distance)
  let cx0 = 1e30, cz0 = 1e30, cx1 = -1e30, cz1 = -1e30;
  for (const p of ch) { cx0 = Math.min(cx0, p[0]); cz0 = Math.min(cz0, p[1]); cx1 = Math.max(cx1, p[0]); cz1 = Math.max(cz1, p[1]); }
  const chPad = chW + 400;
  const V1 = {}, V2 = {}, V3 = {}, V4 = {};
  // the channel's segments bucketed on a 500 m grid (each cell lists the segments within chPad of it)
  const BK = 500, bx0 = cx0 - chPad, bz0 = cz0 - chPad, bcols = chN > 1 ? Math.ceil((cx1 - cx0 + 2 * chPad) / BK) + 1 : 0, brows = chN > 1 ? Math.ceil((cz1 - cz0 + 2 * chPad) / BK) + 1 : 0;
  const bucket = [];
  for (let k = 0; k < bcols * brows; k++) bucket.push([]);
  for (let k = 0; k < chN - 1; k++) {
    const a = ch[k], b = ch[k + 1];
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - chPad - bx0) / BK)), i1 = Math.min(bcols - 1, Math.floor((Math.max(a[0], b[0]) + chPad - bx0) / BK));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - chPad - bz0) / BK)), j1 = Math.min(brows - 1, Math.floor((Math.max(a[1], b[1]) + chPad - bz0) / BK));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bucket[j * bcols + i].push(k);
  }
  /* distance to the channel's centre line (exact, m) within chPad of it, else 1e9 */
  function chDist(x, z) {
    if (chN < 2 || x < cx0 - chPad || x > cx1 + chPad || z < cz0 - chPad || z > cz1 + chPad) return 1e9;
    const i = Math.floor((x - bx0) / BK), j = Math.floor((z - bz0) / BK);
    if (i < 0 || j < 0 || i >= bcols || j >= brows) return 1e9;
    const list = bucket[j * bcols + i];
    let best = 1e18;
    for (let q = 0; q < list.length; q++) {
      const k = list[q], a = ch[k], b = ch[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      let u = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qx = a[0] + dx * u - x, qz = a[1] + dz * u - z, d = qx * qx + qz * qz;
      if (d < best) best = d;
    }
    return best < 1e17 ? Math.sqrt(best) : 1e9;
  }
  const zones = { ef: 0, fl: 0, ep: 0, em: 0 };
  function zoneAt(x, z) { zones.ef = bil(Z, spec.ef, x, z); zones.fl = bil(Z, spec.fl, x, z); zones.ep = bil(Z, spec.ep, x, z); zones.em = bil(Z, spec.em, x, z); return zones; }

  /* the floe across the nearest edge of the current S2 cell (V2): is it fast ice? is it open water (the flaw lead, a
     lead, a missing floe)? (the broken rims along open edges) */
  function nbSeed() {
    const ni = V2.ni, nj = V2.nj;
    NB.x = (ni + .5 + .86 * (h2(ni, nj, sd + 31) - .5)) * S2; NB.z = (nj + .5 + .86 * (h2(ni, nj, sd + 132) - .5)) * S2;
    NB.m = bil(G, spec.dm, NB.x, NB.z); NB.s = bil(G, spec.ds, NB.x, NB.z); NB.ef = bil(Z, spec.ef, NB.x, NB.z);
    return NB;
  }
  function nbFast() { const n = nbSeed(); return n.m < n.ef || n.s < n.ef * .42; }
  function nbOpen() {
    const n = nbSeed();
    if (n.m < n.ef || n.s < n.ef * .42) return false;
    if (n.m < bil(Z, spec.fl, n.x, n.z)) return true;
    if (bil(G, spec.ld, n.x, n.z) < -60) return true;
    return h2(V2.ni, V2.nj, sd + 61) > .985 - .15 * Math.max(0, Math.min(1, (n.m - bil(Z, spec.fl, n.x, n.z)) / Math.max(1, bil(Z, spec.ep, n.x, n.z) - bil(Z, spec.fl, n.x, n.z))));
  }
  const NB = { x: 0, z: 0, m: 0, s: 0, ef: 0 };
  /* young ice / open water in a lead: sparse faint returns (nilas, frost flowers) */
  function water(x, z, s, o, nil) {
    o.ice = 0; o.y = 0; o.b = 0; o.k = K.WATER;
    if (nil > 0 && s < 40) {
      const q = vn(x / 90, z / 90, sd + 7) * .5 + .5;
      if (q > 1 - nil && h2(Math.floor(x / Math.max(.6, s)), Math.floor(z / Math.max(.6, s)), sd + 9) < .5) { o.ice = 1; o.y = .03; o.b = .16 + .1 * q; o.k = K.NILAS; }
    }
    return o;
  }
  /* the surface of a floe: snow with sastrugi (wind stripes), a floe's own shade, a rim of broken blocks at an open
     edge, rubble on a pressure ridge */
  function surface(x, z, s, o, base, edgeOpen, ridge, fid) {
    o.ice = 1; o.k = K.FLOE;
    let y = .28 + .08 * vn(x / 23, z / 23, sd + 3), b = base;
    // drifts: the snow's shade breathes over tens of metres
    if (s < 30) b *= .9 + .12 * vn(x / 48, z / 48, sd + 4) + .06 * vn(x / 170, z / 170, sd + 6);
    if (s < 3) {
      // sastrugi: ripples across the prevailing wind (from the south-west here)
      const u = (x * .62 + z * .78) / 3.1 + 1.7 * vn(x / 40, z / 40, sd + 5);
      const st = Math.sin(u * 6.2832) * .5 + .5;
      b *= .86 + .2 * st * st; y += .05 * st;
    }
    if (edgeOpen >= 0 && edgeOpen < 4.5) {
      // the broken rim: blocks tilted up along an open edge
      const bl = s < 1.5 ? voronoi(x, z, 1.6, sd + 11 + fid, V4) : null;
      const k = 1 - edgeOpen / 4.5;
      y += (bl ? h2(bl.i, bl.j, sd + 13) : .5) * .8 * k; b = Math.min(1, b + .22 * k); o.k = K.RIM;
      if (bl && bl.e < .12) b *= .55;                 // the gaps between blocks
    }
    if (ridge > 0) {
      const bl = s < 2.5 ? voronoi(x, z, 2.2, sd + 17, V4) : null;
      const r0 = bl ? h2(bl.i, bl.j, sd + 19) : .6;
      y += ridge * (.6 + 1.9 * r0); b = Math.min(1, b + .25 * ridge); o.k = K.RIDGE;
      if (bl && bl.e < .18) b *= .6;
    }
    o.y = y; o.b = b;
    return o;
  }

  /* o: { ice, y, b, k, cls } */
  function at(x, z, s, o) {
    o.cls = C.OPEN; o.ice = 0; o.y = 0; o.b = 0; o.k = K.WATER;
    const hr = hRaw(x, z);
    if (hr >= 0) return o;
    if (bil(G, spec.dm, x, z) > spec.far) return o;
    const d = bil(G, spec.ds, x, z);                          // distance to land (m)
    // the icebreaker channel: broken ice, the fresh track in the middle (open water with a few floating cakes)
    // the base's harbour basin: kept open by the tugs and the icebreaker, brash drifting in it
    for (const B of spec.basins || []) {
      let db = Math.hypot(x - B[0], z - B[1]);
      if (db > B[2] + 45) continue;
      db += 40 * vn(x / 90, z / 90, sd + 21);
      if (db < B[2]) { o.cls = C.THIN; return db < B[2] * .7 ? water(x, z, s, o, .1) : brash(x, z, s, o, .5, .9); }
    }
    const dc = chDist(x, z);
    if (dc < chW + 60) {
      const jag = 35 * vn(x / 70, z / 70, sd + 23) + 12 * vn(x / 17, z / 17, sd + 24);
      if (dc + jag < chW) {
        o.cls = C.THIN;
        const track = 26 + 10 * vn(x / 120, z / 120, sd + 25);
        if (dc < track) { water(x, z, s, o, .15); o.cls = C.THIN; return o; }
        return brash(x, z, s, o, .62 + .25 * (dc / chW), .95);
      }
    }
    // the fast ice: whole floes (S2 cells) whose seed lies inside the fast-ice extent
    voronoi(x, z, S2, sd + 31, V2);
    const dS = bil(G, spec.ds, V2.sx, V2.sz), dMS = bil(G, spec.dm, V2.sx, V2.sz), zS = zoneAt(V2.sx, V2.sz);
    const ef = zS.ef;
    // (an island holds a narrower ring of fast ice than the mainland's shore: islets near the coast sit inside the
    // mainland's, a far island keeps its own ring with the pack grinding on it)
    if (dMS < ef || dS < ef * .42 || d < ef * .3) {
      o.cls = d < walk ? C.WALK : C.FAST;
      // tide cracks near the shore (open a metre or two, parallel to it), hummocks near the fast-ice edge
      let ridge = 0;
      if (s < 25) {
        const ed = V2.e, hk = h2(V2.i, V2.j, sd + 33);
        const eh = edgeHash(V2.i, V2.j, V2.ni, V2.nj, sd + 35);
        if (dMS > ef - 1400 && ed < 9 && eh < .55) ridge = 1 - ed / 9;
        else if (ed < 3.5 && eh < .16) ridge = .4 * (1 - ed / 3.5);          // old cracks, refrozen, a low ridge of slabs
        if (d < 260 && s < 4) {
          const tc = Math.abs(((d + 18 * vn(x / 60, z / 60, sd + 37)) % 70) - 35);
          if (tc < 1.1) return water(x, z, s, o, 0), (o.cls = d < walk ? C.WALK : C.FAST), o;
        }
        surface(x, z, s, o, .7 + .06 * hk, V2.e < 5 && s < 6 && !nbFast() ? V2.e : -1, ridge * .8, 0);
      } else { o.ice = 1; o.y = .3; o.b = .72; }
      o.k = o.k === K.FLOE ? K.FAST : o.k;
      return o;
    }
    // the flaw lead (shore polynya): open water with patches of young ice
    if (dMS < zS.fl) return water(x, z, s, o, .35);
    // major leads through the pack: open water (they keep young ice in their calmer bays); their edges follow the
    // floes (a floe whose middle is in the lead is gone) and break raggedly across the rest
    const lp = bil(G, spec.ld, x, z);
    if (dMS < zS.em && (bil(G, spec.ld, V2.sx, V2.sz) < -60 || (lp < 160 && lp + 70 * vn(x / 260, z / 260, sd + 41) + 22 * vn(x / 55, z / 55, sd + 42) < 0))) return water(x, z, s, o, .22);
    if (dMS < zS.ep) {
      // the pack. Big floes (S1) mostly present, closer to the flaw lead the denser
      voronoi(x, z, S1, sd + 51, V1);
      const t = Math.max(0, Math.min(1, (dMS - zS.fl) / Math.max(1, zS.ep - zS.fl)));
      const c1 = .985 - .12 * t;
      if (h2(V1.i, V1.j, sd + 53) > c1) return water(x, z, s, o, .3);
      // the seam between big floes: most closed and ridged, some open cracks, a few open leads 80-250 m
      const eh = edgeHash(V1.i, V1.j, V1.ni, V1.nj, sd + 55);
      const g1 = eh < .55 ? 0 : eh < .88 ? 10 + 50 * (eh - .55) / .33 : 80 + 170 * (eh - .88) / .12;
      if (V1.e < g1 * .5 + (g1 > 0 ? 6 * vn(x / 40, z / 40, sd + 57) : 0)) return water(x, z, s, o, g1 > 60 ? .2 : 0);
      // floes (S2) inside the big floe: frozen seams, some open cracks; a few floes missing
      if (h2(V2.i, V2.j, sd + 61) > .985 - .15 * t) return water(x, z, s, o, .25);
      const eh2 = edgeHash(V2.i, V2.j, V2.ni, V2.nj, sd + 63);
      const g2 = eh2 < .78 ? 0 : 2 + 16 * (eh2 - .78) / .22;
      if (g2 > 0 && V2.e < g2 * .5 && s < g2 * 2) return water(x, z, s, o, 0);
      o.cls = C.PACK;
      if (s >= 25) { o.ice = 1; o.y = .3; o.b = .64 + .12 * h2(V2.i, V2.j, sd + 65); o.k = K.FLOE; return o; }
      // open edges: distance to the nearest open water of the seams
      let edge = -1;
      if (g1 > 0) edge = V1.e - g1 * .5;
      if (g2 > 0) edge = edge < 0 ? V2.e - g2 * .5 : Math.min(edge, V2.e - g2 * .5);
      if (V2.e < 5 && nbOpen()) edge = edge < 0 ? V2.e : Math.min(edge, V2.e);
      const ridge = g1 === 0 && V1.e < 10 ? 1 - V1.e / 10 : (eh2 < .2 && V2.e < 5 ? .45 * (1 - V2.e / 5) : 0);
      return surface(x, z, s, o, .6 + .16 * h2(V2.i, V2.j, sd + 65), edge, ridge, V2.i & 7);
    }
    if (dMS < zS.em) {
      // the marginal zone: floes breaking into cakes and brash, thinning out; ships push through
      const t = Math.max(0, Math.min(1, (dMS - zS.ep) / Math.max(1, zS.em - zS.ep)));
      o.cls = C.THIN;
      if (h2(V2.i, V2.j, sd + 71) < .55 * (1 - t) * (1 - t)) {
        // a floe, eroded into its own cakes at the edge
        voronoi(x, z, S3, sd + 73, V3);
        if (V3.e < 6 + 10 * t) return brash(x, z, s, o, .55, .6 * (1 - t));
        return surface(x, z, s, o, .58 + .1 * h2(V3.i, V3.j, sd + 75), V3.e - 6 - 10 * t, 0, 3);
      }
      voronoi(x, z, S3, sd + 73, V3);
      if (h2(V3.i, V3.j, sd + 77) < .45 * (1 - t)) {
        if (V3.e < 5) return brash(x, z, s, o, .5, .5 * (1 - t));
        const r = surface(x, z, s, o, .55, V3.e - 5, 0, 5); r.k = K.CAKE; return r;
      }
      // pancake ice and brash toward the open sea
      const pk = (1 - t) * .8 * (.5 + .5 * vn(x / 900, z / 900, sd + 79));
      if (pk > .15) return pancake(x, z, s, o, pk);
      return o;
    }
    return o;
  }
  /* brash: broken ice, blocks 0.5-2.5 m, some awash; density p (0..1) */
  function brash(x, z, s, o, p, b0) {
    o.cls = o.cls || C.THIN;
    if (s > 6) { if (h2(Math.floor(x / s), Math.floor(z / s), sd + 81) < p * .8) { o.ice = 1; o.y = .15; o.b = .42 * (b0 || 1); o.k = K.BRASH; } return o; }
    const v = voronoi(x, z, 1.4, sd + 83, V4);
    if (h2(v.i, v.j, sd + 85) > p || v.e < .1) return o;
    const r = h2(v.i, v.j, sd + 87);
    o.ice = 1; o.y = .04 + .45 * r * r; o.b = (.35 + .45 * r) * (b0 || 1); o.k = K.BRASH;
    return o;
  }
  /* pancake ice: round cakes 0.5-3 m with upturned rims */
  function pancake(x, z, s, o, p) {
    if (s > 5) { if (h2(Math.floor(x / s), Math.floor(z / s), sd + 91) < p * .6) { o.ice = 1; o.y = .08; o.b = .3; o.k = K.PANCAKE; } return o; }
    const S = 2.4, fx = x / S, fz = z / S, ci = Math.floor(fx), cj = Math.floor(fz);
    if (h2(ci, cj, sd + 93) > p) return o;
    const cx = (ci + .5 + .3 * (h2(ci, cj, sd + 95) - .5)) * S, cz = (cj + .5 + .3 * (h2(ci, cj, sd + 97) - .5)) * S;
    const R = S * (.22 + .22 * h2(ci, cj, sd + 99)), dd = Math.hypot(x - cx, z - cz);
    if (dd > R) return o;
    const rim = dd > R * .78;
    o.ice = 1; o.y = rim ? .12 : .06; o.b = rim ? .55 : .3; o.k = K.PANCAKE;
    return o;
  }
  /* the sim's class at a point (the generator's grid holds it at 100 m; this is the same function at s = 100) */
  const O = {};
  function cls(x, z) { at(x, z, 100, O); return O.cls; }
  return { at, cls, spec, chDist, zoneAt };
}

/* ---------------------------------------------------------------- the renderer's tiles (static GPU point sets)
   A tile of level L is N x N points of the lattice of spacing s = S0 * 2^L, origin (ti, tj) * N * s. Each point sits on
   the world-fixed lattice, jittered by its own level (the coarsest lattice it belongs to), so a coarser tile's points
   are the same world points as a finer one's: switching tiles changes the density, never moves a dot. Points are
   ordered by how coarse they are (LOD 3 first: every 8th point both ways), so the tile's four levels of detail are
   prefixes of one buffer: counts[k] points for LOD k.
   Returns { bytes: Uint8Array (16 per point: x, y, z float32 relative to the origin, normal int8 x 3, 0), counts: [4] }
   or null (no ice). Normals carry the shade: snow faces up (tilted a little where it is darker), broken blocks tilt
   every way (the moon picks them out), young ice faces down (the renderer draws a back face sparse and dim). */
export function iceTile(ice, L, ti, tj, N, S0, LMAX) {
  const s = S0 * Math.pow(2, L), T = N * s, x0 = ti * T, z0 = tj * T, o = {};
  const tz = v => v === 0 ? 31 : 31 - Math.clz32(v & -v);
  const pts = [];
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const I = ti * N + a, J = tj * N + b;
    const l = Math.min(LMAX, L + Math.min(tz(I), tz(J))), If = I * Math.pow(2, L), Jf = J * Math.pow(2, L), sl = S0 * Math.pow(2, l);
    const x = I * s + sl * .36 * (h2(If, Jf, 991) - .5), z = J * s + sl * .36 * (h2(Jf + 7, If, 993) - .5);
    ice.at(x, z, sl, o);
    if (!o.ice) continue;
    pts.push(Math.min(3, l - L), x - x0, o.y, z - z0, o.k, o.b, h2(If, Jf, 995), h2(If, Jf, 997));
  }
  const n = pts.length / 8;
  if (!n) return null;
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) { const k = pts[i * 8]; for (let q = 0; q <= k; q++) counts[q]++; }
  const buf = new ArrayBuffer(n * 16), F = new Float32Array(buf), B8 = new Int8Array(buf);
  const start = [0, 0, 0, 0];
  // LOD 3 points first, then 2, 1, 0
  start[3] = 0; start[2] = counts[3]; start[1] = counts[2]; start[0] = counts[1];
  for (let i = 0; i < n; i++) {
    const p = i * 8, k = pts[p], w = start[k]++, kind = pts[p + 4], br = pts[p + 5], ha = pts[p + 6] * 6.2832, hb = pts[p + 7];
    F[w * 4] = pts[p + 1]; F[w * 4 + 1] = pts[p + 2]; F[w * 4 + 2] = pts[p + 3];
    let nx, ny, nz;
    if (kind === K.NILAS) { nx = 0; ny = -1; nz = 0; }
    else {
      const t = kind === K.RIDGE || kind === K.RIM || kind === K.BRASH ? .35 + .5 * hb : Math.max(0, .8 - br) * .9 * hb;
      nx = Math.cos(ha) * t; nz = Math.sin(ha) * t; ny = 1;
    }
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    B8[w * 16 + 12] = Math.round(nx / nl * 127); B8[w * 16 + 13] = Math.round(ny / nl * 127); B8[w * 16 + 14] = Math.round(nz / nl * 127); B8[w * 16 + 15] = 0;
  }
  return { bytes: new Uint8Array(buf), counts };
}

/* ---------------------------------------------------------------- building the spec (the generator)
   hRaw: the fine heights' bilinear; W, H; opts: { seed, cellG (200), zone(x, z) -> { ef, fl, ep, em } (m from land),
   leads: [{ pts: [[x, z]...], w: m }], channel: [[x, z]...], chW (half width, m), walk (m), S: [S1, S2, S3, S4] }
   -> spec (typed arrays, structured-clone safe). The sim's class grid (cell 100 m) is built by classGrid(). */
export function buildIceSpec(W, H, heights, cols, rows, cell, opts) {
  const cg = opts.cellG || 200, gc = Math.round(W / cg) + 1, gr = Math.round(H / cg) + 1;
  const g = { cell: cg, cols: gc, rows: gr, x0: -W / 2, z0: -H / 2 };
  const hAt = (x, z) => bil({ cell, cols, rows, x0: -W / 2, z0: -H / 2 }, heights, x, z);
  // distance to land (m) on the ice grid: chamfer from the land nodes
  const n = gc * gr, INF = 1e9, ds = new Float32Array(n);
  for (let j = 0; j < gr; j++) for (let i = 0; i < gc; i++) ds[j * gc + i] = hAt(g.x0 + i * cg, g.z0 + j * cg) >= 0 ? 0 : INF;
  // the mainland (the largest land mass): the pack's extent is measured from it (an island holds fast ice round it
  // but does not drag the pack out to sea)
  const lab = new Int32Array(n), stk = new Int32Array(n), sizes = [0];
  for (let k0 = 0; k0 < n; k0++) {
    if (ds[k0] !== 0 || lab[k0]) continue;
    const L = sizes.length; let sp = 0, c = 0; stk[sp++] = k0; lab[k0] = L;
    while (sp) {
      const k = stk[--sp], i = k % gc, j = (k / gc) | 0; c++;
      if (i > 0 && !lab[k - 1] && ds[k - 1] === 0) { lab[k - 1] = L; stk[sp++] = k - 1; }
      if (i < gc - 1 && !lab[k + 1] && ds[k + 1] === 0) { lab[k + 1] = L; stk[sp++] = k + 1; }
      if (j > 0 && !lab[k - gc] && ds[k - gc] === 0) { lab[k - gc] = L; stk[sp++] = k - gc; }
      if (j < gr - 1 && !lab[k + gc] && ds[k + gc] === 0) { lab[k + gc] = L; stk[sp++] = k + gc; }
    }
    sizes.push(c);
  }
  let ML = 1; for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[ML]) ML = i;
  const dm = new Float32Array(n);
  for (let k = 0; k < n; k++) dm[k] = lab[k] === ML ? 0 : INF;
  chamfer(ds, gc, gr); chamfer(dm, gc, gr);
  for (let k = 0; k < n; k++) { ds[k] *= cg; dm[k] *= cg; }
  // the zones on a 1 km grid
  const zc = 1000, zcols = Math.round(W / zc) + 1, zrows = Math.round(H / zc) + 1, zg = { cell: zc, cols: zcols, rows: zrows, x0: -W / 2, z0: -H / 2 };
  const ef = new Float32Array(zcols * zrows), fl = new Float32Array(zcols * zrows), ep = new Float32Array(zcols * zrows), em = new Float32Array(zcols * zrows);
  let far = 0;
  for (let j = 0; j < zrows; j++) for (let i = 0; i < zcols; i++) {
    const k = j * zcols + i, q = opts.zone(zg.x0 + i * zc, zg.z0 + j * zc);
    ef[k] = q.ef; fl[k] = q.fl; ep[k] = q.ep; em[k] = q.em; far = Math.max(far, q.em);
  }
  // the major leads: signed distance to their edges (m; < 0 inside) on the ice grid
  const ld = new Float32Array(n).fill(1e4);
  for (const L of opts.leads || []) {
    const P = L.pts;
    for (let s = 0; s < P.length - 1; s++) {
      const a = P[s], b = P[s + 1], wa = (a[2] || L.w) / 2, wb = (b[2] || L.w) / 2, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const R = Math.max(wa, wb) + 3000;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - R - g.x0) / cg)), i1 = Math.min(gc - 1, Math.ceil((Math.max(a[0], b[0]) + R - g.x0) / cg));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - R - g.z0) / cg)), j1 = Math.min(gr - 1, Math.ceil((Math.max(a[1], b[1]) + R - g.z0) / cg));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = g.x0 + i * cg, z = g.z0 + j * cg;
        let u = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z) - (wa + (wb - wa) * u), k = j * gc + i;
        if (d < ld[k]) ld[k] = d;
      }
    }
  }
  return {
    v: 1, seed: opts.seed | 0, g, ds, dm, zg, ef, fl, ep, em, ld, far: far + 2000, basins: opts.basins || [],
    channel: (opts.channel || []).map(p => [Math.round(p[0]), Math.round(p[1])]), chW: opts.chW || 450, walk: opts.walk || 1500,
    S: opts.S || [2300, 460, 70, 2.4],
  };
}
/* the sim's class grid (100 m): the analytic ice sampled at the node */
export function classGrid(spec, hRaw, W, H, cell) {
  cell = cell || 100;
  const cols = Math.round(W / cell) + 1, rows = Math.round(H / cell) + 1, data = new Uint8Array(cols * rows);
  const ice = makeIce(spec, hRaw), o = {};
  const far = spec.far, G = spec.g;
  for (let j = 0; j < rows; j++) {
    const z = -H / 2 + j * cell;
    for (let i = 0; i < cols; i++) {
      const x = -W / 2 + i * cell;
      if (bil(G, spec.dm, x, z) > far) continue;
      ice.at(x, z, 100, o); data[j * cols + i] = o.cls;
    }
  }
  return { cell, cols, rows, x0: -W / 2, z0: -H / 2, data };
}

function chamfer(d, cols, rows) {
  const D = 1.41421;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i; let v = d[k]; if (v === 0) continue;
    if (i > 0 && d[k - 1] + 1 < v) v = d[k - 1] + 1;
    if (j > 0) { if (d[k - cols] + 1 < v) v = d[k - cols] + 1; if (i > 0 && d[k - cols - 1] + D < v) v = d[k - cols - 1] + D; if (i < cols - 1 && d[k - cols + 1] + D < v) v = d[k - cols + 1] + D; }
    d[k] = v;
  }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
    const k = j * cols + i; let v = d[k]; if (v === 0) continue;
    if (i < cols - 1 && d[k + 1] + 1 < v) v = d[k + 1] + 1;
    if (j < rows - 1) { if (d[k + cols] + 1 < v) v = d[k + cols] + 1; if (i < cols - 1 && d[k + cols + 1] + D < v) v = d[k + cols + 1] + D; if (i > 0 && d[k + cols - 1] + D < v) v = d[k + cols - 1] + D; }
    d[k] = v;
  }
}

export { h2 as iceHash, vn as iceNoise, bil as iceBil };
