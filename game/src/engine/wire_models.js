/* Wire models: the Orbital films' GEO.draw (reference/menus/common/geo.js) as static GPU segment batches.
   Every primitive of a model part becomes segments that carry what GEO.draw decides per frame on the CPU:
     hex      the 12 edges with their two faces (front when either face turns to the lens, else back .16), ribs
     lathe    rings (facing by their radial normal), generators (gen * (.35 + .65 f) front, genBack behind), and the
              exact silhouette (computed per frame in the vertex shader from the lathe axis and the eye)
     panel    outline and hatch; line: the polyline; blades: the pitched quads, rib, hub and shroud rings
     hull     deck edges, waterline, frames and strakes facing by their side, stem, transom, deck beams
   Parts keep their transforms (part.xf), visibility (show), dyn parts are rebuilt at quantized states (the model
   library's quantisation, a small LRU per part), two levels: full and without the `fine` detail.

   const WM = new WireModels(R);                    // R: the renderer (its wire and model library)
   WM.draw(d, frame)                                 // queue an instance (the renderer's draw() record) in R.wire */

const TAU = Math.PI * 2;
const DEF = { a: 1, back: .16, gen: .28, genBack: .06, sil: 1, ring: .8, hatch: .3 };
const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const EDGES = [[0, 1, 0, 2], [1, 2, 0, 3], [2, 3, 0, 4], [3, 0, 0, 5], [4, 5, 1, 2], [5, 6, 1, 3], [6, 7, 1, 4], [7, 4, 1, 5], [0, 4, 5, 2], [1, 5, 2, 3], [2, 6, 3, 4], [3, 7, 4, 5]];
const LRU = 24;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const mad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function perp(d) { const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0]; const U = norm(cross(a, d)); return [U, cross(d, U)]; }
function faceNormals(P) {
  const cen = P.reduce((s, p) => add(s, p), [0, 0, 0]).map(v => v / 8);
  return FACES.map(f => {
    const fc = mul(add(add(P[f[0]], P[f[1]]), add(P[f[2]], P[f[3]])), .25);
    let n = cross(sub(P[f[1]], P[f[0]]), sub(P[f[3]], P[f[0]]));
    if (len(n) < 1e-9) n = cross(sub(P[f[2]], P[f[1]]), sub(P[f[3]], P[f[1]]));
    n = norm(n); if (dot(n, sub(fc, cen)) < 0) n = mul(n, -1);
    return n;
  });
}
/* the destroyer-like hull of geo.js (half breadth at deck, deck height along s in [-1 stern, 1 bow]) */
function hullB(pr, s) {
  const B = pr.B / 2;
  if (s > .3) return B * Math.max(0, 1 - Math.pow((s - .3) / .7, 1.75));
  if (s < -.82) return B * (.84 + .16 * (1 - (-.82 - s) / .18));
  return B;
}
const hullD = (pr, s) => pr.D + 3.6 * Math.pow(Math.max(0, (s - .25) / .75), 2);

/* segment writer: a, b, n1, weight, n2, mode (+ back ratio in the fraction) */
class Out {
  constructor() { this.d = []; }
  seg(a, b, n1, w, n2, mode) {
    if (w <= .003) return;
    const n = n2 || n1 || Z3;
    const m = n1 || Z3;
    this.d.push(a[0], a[1], a[2], b[0], b[1], b[2], m[0], m[1], m[2], w, n[0], n[1], n[2], mode || 0);
  }
  plain(a, b, w) { this.seg(a, b, null, w, null, 0); }
  poly(P, w, closed) { for (let i = 0; i < P.length - 1; i++) this.plain(P[i], P[i + 1], w); if (closed && P.length > 2) this.plain(P[P.length - 1], P[0], w); }
}
const Z3 = [0, 0, 0];

/* one primitive -> segments (part space) */
export function wirePrim(pr, O, o) {
  const A = o.a * (pr.al === undefined ? 1 : pr.al);
  if (pr.t === 'hex') {
    const P = pr.p, F = faceNormals(P);
    for (const [i, j, f1, f2] of EDGES) O.seg(P[i], P[j], F[f1], A, F[f2], 1);
    if (pr.ribs) {
      const bw = Math.min(.99, (o.back * .6) / (o.hatch * 1.4));
      const rib = (n, quad, faces) => {
        for (let k = 1; k < n; k++) {
          const t = k / n, q = quad.map(([a, b]) => lerp(P[a], P[b], t));
          for (let e = 0; e < 4; e++) O.seg(q[e], q[(e + 1) % 4], F[faces[e]], o.hatch * 1.4 * A, F[faces[e]], 1 + bw);
        }
      };
      if (pr.ribs.z) rib(pr.ribs.z, [[0, 3], [1, 2], [5, 6], [4, 7]], [0, 3, 1, 5]);
      if (pr.ribs.x) rib(pr.ribs.x, [[0, 1], [3, 2], [7, 6], [4, 5]], [0, 4, 1, 2]);
      if (pr.ribs.y) rib(pr.ribs.y, [[0, 4], [1, 5], [2, 6], [3, 7]], [2, 3, 4, 5]);
    }
  } else if (pr.t === 'lathe') {
    const a = pr.a, d = norm(pr.d), [U, Vv] = perp(d), st = pr.st, n = pr.n || 24;
    const ringsAt = pr.rings || st.map((_, i) => i);
    for (const i of ringsAt) {
      const s = st[i]; if (!s) continue;
      const r = s[1]; if (r <= .001) continue;
      const c = mad(a, d, s[0]);
      let p = add(c, mul(U, r));
      for (let k = 1; k <= n; k++) {
        const ang = k / n * TAU, q = add(c, add(mul(U, Math.cos(ang) * r), mul(Vv, Math.sin(ang) * r)));
        const am = (k - .5) / n * TAU, nr = add(mul(U, Math.cos(am)), mul(Vv, Math.sin(am)));
        O.seg(p, q, nr, o.ring * A, nr, 1 + Math.min(.99, o.back * .8 / o.ring));
        p = q;
      }
    }
    const g = pr.gen === undefined ? 10 : pr.gen;
    for (let k = 0; k < g; k++) {
      const th = (k + .5) / g * TAU, nr = add(mul(U, Math.cos(th)), mul(Vv, Math.sin(th)));
      for (let i = 0; i < st.length - 1; i++) O.seg(mad(mad(a, d, st[i][0]), nr, st[i][1]), mad(mad(a, d, st[i + 1][0]), nr, st[i + 1][1]), nr, A, nr, 2);
    }
    // the exact silhouette: axis points in a / b, the axis in n1, the radii and the side in n2 (mode 4)
    if (pr.sil !== false) for (const sg of [1, -1]) for (let i = 0; i < st.length - 1; i++) {
      if (st[i][1] < .001 && st[i + 1][1] < .001) continue;
      O.seg(mad(a, d, st[i][0]), mad(a, d, st[i + 1][0]), d, o.sil * A, [st[i][1], st[i + 1][1], sg], 4);
    }
  } else if (pr.t === 'panel') {
    const P = pr.p;
    O.poly(P, A * (pr.edge || 1), true);
    if (pr.hatch && P.length === 4) {
      for (let k = 1; k < pr.hatch; k++) { const t = k / pr.hatch; O.plain(lerp(P[0], P[3], t), lerp(P[1], P[2], t), o.hatch * A); }
      const h2 = pr.hatch2 || 0;
      for (let k = 1; k < h2; k++) { const t = k / h2; O.plain(lerp(P[0], P[1], t), lerp(P[3], P[2], t), o.hatch * A); }
    }
  } else if (pr.t === 'line') O.poly(pr.p, A * (pr.w === undefined ? 1 : pr.w), !!pr.closed);
  else if (pr.t === 'blades') {
    const quads = GEO.bladeQuads(pr);
    for (const q of quads) {
      O.poly(q, A * (pr.edge || .9), true);
      if (pr.rib) O.plain(lerp(q[0], q[1], .5), lerp(q[3], q[2], .5), o.hatch * A);
    }
    if (pr.hub) {
      const d = norm(pr.d), [U, Vv] = perp(d);
      const circ = (r, n, w) => { let p = add(pr.c, mul(U, r)); for (let k = 1; k <= n; k++) { const ang = k / n * TAU, q = add(pr.c, add(mul(U, Math.cos(ang) * r), mul(Vv, Math.sin(ang) * r))); O.plain(p, q, w); p = q; } };
      circ(pr.r0, 14, A * .8);
      if (pr.shroud) circ(pr.r1 * 1.04, 36, A * .7);
    }
  } else if (pr.t === 'hull') {
    const N = 60, L = pr.L;
    const pt = (s, side, y) => { const b = hullB(pr, s) * (y > 0 ? 1 : .9); return [side * b, y, s * L / 2]; };
    for (const side of [-1, 1]) {
      const nS = [side, 0, 0];
      const deck = [], wl = [];
      for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N; deck.push(pt(s, side, hullD(pr, s))); wl.push(pt(s, side, 0)); }
      O.poly(deck, A, false);
      for (let i = 0; i < N; i++) O.seg(wl[i], wl[i + 1], nS, A * .85, nS, 1);
      for (let i = 1; i < 20; i++) { const s = -1 + 2 * i / 20; if (hullB(pr, s) < .3) continue; O.seg(pt(s, side, hullD(pr, s)), pt(s, side, 0), nS, A * o.hatch * 1.2, nS, 1); }
      for (const yy of [.33, .66]) { let p = null; for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N, q = pt(s, side, hullD(pr, s) * yy); if (p) O.seg(p, q, nS, A * o.hatch * .8, nS, 1); p = q; } }
    }
    O.plain(pt(1, 1, hullD(pr, 1)), pt(1, 1, 0), A);
    O.plain(pt(-1, -1, hullD(pr, -1)), pt(-1, 1, hullD(pr, -1)), A);
    O.plain(pt(-1, -1, 0), pt(-1, 1, 0), A * .6);
    O.plain(pt(-1, -1, 0), pt(-1, -1, hullD(pr, -1)), A); O.plain(pt(-1, 1, 0), pt(-1, 1, hullD(pr, -1)), A);
    for (let i = 1; i < 16; i++) { const s = -1 + 2 * i / 16; O.plain(pt(s, -1, hullD(pr, s)), pt(s, 1, hullD(pr, s)), A * o.hatch * .5); }
  }
}

/* a part's primitives (at state st) -> Float32Array of segments */
export function wirePart(part, st, fine) {
  const O = new Out(), o = Object.assign({}, DEF);
  if (part.alpha) o.a *= part.alpha;
  const prims = part.dyn ? part.dyn(st || {}) : part.prims;
  for (const pr of prims || []) if (!(pr.fine && fine === false)) wirePrim(pr, O, o);
  return new Float32Array(O.d);
}

const mul3 = (A, B) => {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
};
const ap3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

export class WireModels {
  constructor(R) {
    this.R = R; this.W = R.wire; this.lib = R.models;
    this.cache = new Map();          // model key -> [{ batches: [full, coarse] | null, lru: [Map, Map] }]
    this.fineFrom = 6;               // px of the model's size above which the fine detail is drawn
    this.stats = { batches: 0, segs: 0 };
  }
  /* a model's rest-pose extent in plan (model space): { hl: half length (z), hb: half beam (x), cz, cx } */
  plan(key) {
    const c = this._plan || (this._plan = new Map());
    let p = c.get(key);
    if (p) return p;
    const e = this.lib.get(key), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const P of e.parts) {
      const b = P.bounds; if (!b) continue;
      const X = P.part.xf ? (() => { try { return P.part.xf({}); } catch (err) { return null; } })() : null;
      for (const cx of [b[0][0], b[1][0]]) for (const cy of [b[0][1], b[1][1]]) for (const cz of [b[0][2], b[1][2]]) {
        const q = X ? add(ap3(X.R, [cx, cy, cz]), X.T) : [cx, cy, cz];
        for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
      }
    }
    p = { hl: Math.max(1, (mx[2] - mn[2]) / 2), hb: Math.max(1, (mx[0] - mn[0]) / 2), cz: (mx[2] + mn[2]) / 2, cx: (mx[0] + mn[0]) / 2, bottom: mn[1] };
    c.set(key, p);
    return p;
  }
  _entry(key) {
    let c = this.cache.get(key);
    if (c) return c;
    const e = this.lib.get(key);
    c = e.parts.map(P => ({ P, b: [null, null], lru: P.dyn ? [new Map(), new Map()] : null }));
    this.cache.set(key, c);
    return c;
  }
  _batch(e, C, lod, st) {
    const P = C.P;
    if (!P.dyn) {
      if (!C.b[lod]) { const f = wirePart(P.part, {}, lod === 0); C.b[lod] = f.length ? this.W.modelBatch(f) : { n: 0 }; this.stats.batches++; }
      return C.b[lod];
    }
    const q = this.lib._quant(e, P, st, lod === 0 ? 1 : 2), lru = C.lru[lod];
    let B = lru.get(q.key);
    if (B) { lru.delete(q.key); lru.set(q.key, B); return B; }
    const f = wirePart(P.part, q.st, lod === 0);
    B = f.length ? this.W.modelBatch(f) : { n: 0 };
    this.stats.batches++;
    lru.set(q.key, B);
    if (lru.size > LRU) { const k0 = lru.keys().next().value; const o = lru.get(k0); if (o && o.dispose) o.dispose(); lru.delete(k0); }
    return B;
  }
  /* queue one instance (d as given to R.draw, with d.R resolved). o: { rgb, a, depth, fog } */
  draw(d, frame, o) {
    const e = this.lib.get(d.key), cam = this.R.camera, eye = cam.eye, st = d.st || {};
    const R0 = d.R, T0 = d.T;
    const cw = ap3(R0, e.center);
    const dv = [cw[0] + T0[0] - eye[0], cw[1] + T0[1] - eye[1], cw[2] + T0[2] - eye[2]];
    const dist = Math.hypot(dv[0], dv[1], dv[2]);
    const ex = d.explode || 0;
    if (!frame.sphereVisible(dv, e.radius * (1 + ex * 1.5))) return 0;
    const px = e.radius * frame.fl1080 / Math.max(1, dist);
    if (px < .6) return 0;
    const C = this._entry(d.key);
    let segs = 0;
    const rgb = o.rgb, A0 = (d.alpha === undefined ? 1 : d.alpha) * (1 - (d.dissolve || 0)) * (o.a === undefined ? 1 : o.a) * Math.min(1, px / 3);
    for (const c of C) {
      const Pt = c.P, part = Pt.part;
      if (part.show && !part.show(st)) continue;
      const pa = (d.partAlpha && d.partAlpha[Pt.name] !== undefined ? d.partAlpha[Pt.name] : 1) * A0;
      if (pa <= .004) continue;
      const X = part.xf ? part.xf(st) : null;
      let Rp = X ? mul3(R0, X.R) : R0;
      let Tp = X ? [R0[0] * X.T[0] + R0[1] * X.T[1] + R0[2] * X.T[2] + T0[0], R0[3] * X.T[0] + R0[4] * X.T[1] + R0[5] * X.T[2] + T0[1], R0[6] * X.T[0] + R0[7] * X.T[1] + R0[8] * X.T[2] + T0[2]] : T0;
      if (d.partX && d.partX[Pt.name]) { const Y = d.partX[Pt.name]; Tp = [Tp[0] + Rp[0] * Y.T[0] + Rp[1] * Y.T[1] + Rp[2] * Y.T[2], Tp[1] + Rp[3] * Y.T[0] + Rp[4] * Y.T[1] + Rp[5] * Y.T[2], Tp[2] + Rp[6] * Y.T[0] + Rp[7] * Y.T[1] + Rp[8] * Y.T[2]]; Rp = mul3(Rp, Y.R); }
      if (ex > 0) {
        const pc = X ? add(ap3(X.R, Pt.center), X.T) : Pt.center;
        const off = [(pc[0] - e.center[0]) * ex * 1.1, (pc[1] - e.center[1]) * ex * 1.1 + ex * e.L * .08 * ((Pt.name.length % 3) + 1) / 3, (pc[2] - e.center[2]) * ex * 1.1];
        const ow = ap3(R0, off); Tp = [Tp[0] + ow[0], Tp[1] + ow[1], Tp[2] + ow[2]];
      }
      const pc = ap3(Rp, Pt.center);
      if (!frame.sphereVisible([Tp[0] + pc[0] - eye[0], Tp[1] + pc[1] - eye[1], Tp[2] + pc[2] - eye[2]], Pt.rad)) continue;
      const lod = px > this.fineFrom * 10 ? 0 : 1;
      const B = this._batch(e, c, lod, st);
      if (!B || !B.n) continue;
      const dm = d.damage && d.damage[Pt.name] ? Math.min(1, d.damage[Pt.name] * 1.1) : 0;
      const col = dm > 0 ? [rgb[0] + (1 - rgb[0]) * dm, rgb[1] + (106 / 255 - rgb[1]) * dm, rgb[2] + (61 / 255 - rgb[2]) * dm] : rgb;
      this.W.model(B, { R: Rp, T: Tp, rgb: col, a: pa, depth: o.depth, fog: o.fog, width: o.width });
      segs += B.n;
    }
    return segs;
  }
}
