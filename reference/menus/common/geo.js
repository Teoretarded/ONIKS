/* Shared stylized models, built from a few primitives that both renderers
   understand: the Orbital menus draw them as facing-aware hairlines
   (GEO.draw), the Point Cloud menus sample their surfaces into dots
   (GEO.sample). Model space: metres, +Z forward, +Y up, origin on the ground. */
(function () {
  const { V, R, X } = M3;

  /* ---------- primitives ---------- */
  const hex = (p, o) => Object.assign({ t: 'hex', p }, o || {});
  const box = (a, b, o) => hex([[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]],
                               [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]], o);
  /* surface of revolution: base point a, unit axis d, stations [[s, r]...] */
  const lathe = (a, d, st, o) => Object.assign({ t: 'lathe', a, d: V.norm(d), st }, o || {});
  const cyl = (a, b, r, o) => { const d = V.sub(b, a), L = V.len(d); return lathe(a, d, [[0, r], [L, r]], o); };
  const panel = (p, o) => Object.assign({ t: 'panel', p }, o || {});
  /* open polyline (rails, guy wires, whips, blade edges); w scales its alpha */
  const line = (p, o) => Object.assign({ t: 'line', p }, o || {});
  /* n blades (fan, propeller, rotor) around axis d through c, from radius r0 to r1, turned by rot.
     o: chord (root angular width, rad), taper, pitch (twist out of the disc plane), edge, rib, hub, shroud */
  const blades = (c, d, n, r0, r1, o) => Object.assign({ t: 'blades', c, d: V.norm(d), n, r0, r1 }, o || {});

  const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const EDGES = [[0, 1, 0, 2], [1, 2, 0, 3], [2, 3, 0, 4], [3, 0, 0, 5], [4, 5, 1, 2], [5, 6, 1, 3], [6, 7, 1, 4], [7, 4, 1, 5], [0, 4, 5, 2], [1, 5, 2, 3], [2, 6, 3, 4], [3, 7, 4, 5]];

  function perp(d) {
    const a = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const U = V.norm(V.cross(a, d)); return [U, V.cross(d, U)];
  }
  function faceNormals(P) {
    const cen = P.reduce((s, p) => V.add(s, p), [0, 0, 0]).map(v => v / 8);
    return FACES.map(f => {
      const fc = V.mul(V.add(V.add(P[f[0]], P[f[1]]), V.add(P[f[2]], P[f[3]])), .25);
      let n = V.cross(V.sub(P[f[1]], P[f[0]]), V.sub(P[f[3]], P[f[0]]));
      if (V.len(n) < 1e-9) n = V.cross(V.sub(P[f[2]], P[f[1]]), V.sub(P[f[3]], P[f[1]]));
      n = V.norm(n); if (V.dot(n, V.sub(fc, cen)) < 0) n = V.mul(n, -1);
      return { n, c: fc };
    });
  }

  /* ---------- wire drawing ---------- */
  const DEF = { a: 1, back: .16, gen: .28, genBack: .06, sil: 1, ring: .8, hatch: .3 };
  function drawPrim(W, pr, T, o) {
    const eye = W.cam.eye, A = o.a * (pr.al === undefined ? 1 : pr.al);
    if (pr.t === 'hex') {
      const P = pr.p.map(p => X.ap(T, p)), F = faceNormals(P);
      const fr = F.map(f => V.dot(f.n, V.sub(eye, f.c)) > 0);
      for (const [i, j, f1, f2] of EDGES) W.seg(P[i], P[j], (fr[f1] || fr[f2] ? 1 : o.back) * A);
      if (pr.ribs) {
        const rib = (n, quad, faces) => {
          for (let k = 1; k < n; k++) {
            const t = k / n, q = quad.map(([a, b]) => V.lerp(P[a], P[b], t));
            for (let e = 0; e < 4; e++) W.seg(q[e], q[(e + 1) % 4], (fr[faces[e]] ? o.hatch * 1.4 : o.back * .6) * A);
          }
        };
        if (pr.ribs.z) rib(pr.ribs.z, [[0, 3], [1, 2], [5, 6], [4, 7]], [0, 3, 1, 5]);
        if (pr.ribs.x) rib(pr.ribs.x, [[0, 1], [3, 2], [7, 6], [4, 5]], [0, 4, 1, 2]);
        if (pr.ribs.y) rib(pr.ribs.y, [[0, 4], [1, 5], [2, 6], [3, 7]], [2, 3, 4, 5]);
      }
    } else if (pr.t === 'lathe') {
      const a = X.ap(T, pr.a), d = X.dir(T, pr.d), [U, Vv] = perp(d), st = pr.st, n = pr.n || 24;
      const ringsAt = pr.rings || st.map((_, i) => i);
      for (const i of ringsAt) { const [s, r] = st[i]; if (r > .001) W.ring(V.mad(a, d, s), U, Vv, r, n, o.ring * A, o.back * A * .8); }
      const g = pr.gen === undefined ? 10 : pr.gen;
      const mid = V.mad(a, d, st[st.length >> 1][0]);
      for (let k = 0; k < g; k++) {
        const th = (k + .5) / g * Math.PI * 2, nr = V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th)));
        const f = V.dot(nr, V.norm(V.sub(eye, mid)));
        const al = (f > 0 ? o.gen * (.35 + .65 * f) : o.genBack) * A;
        for (let i = 0; i < st.length - 1; i++) W.seg(V.mad(V.mad(a, d, st[i][0]), nr, st[i][1]), V.mad(V.mad(a, d, st[i + 1][0]), nr, st[i + 1][1]), al);
      }
      if (pr.sil !== false) {
        let w = V.sub(eye, mid); w = V.sub(w, V.mul(d, V.dot(w, d)));
        const sd = V.norm(V.cross(d, w));
        for (const sg of [1, -1]) for (let i = 0; i < st.length - 1; i++)
          W.seg(V.mad(V.mad(a, d, st[i][0]), sd, sg * st[i][1]), V.mad(V.mad(a, d, st[i + 1][0]), sd, sg * st[i + 1][1]), o.sil * A);
      }
    } else if (pr.t === 'panel') {
      const P = pr.p.map(p => X.ap(T, p));
      W.poly(P, A * (pr.edge || 1), true);
      if (pr.hatch && P.length === 4) {
        for (let k = 1; k < pr.hatch; k++) { const t = k / pr.hatch; W.seg(V.lerp(P[0], P[3], t), V.lerp(P[1], P[2], t), o.hatch * A); }
        const h2 = pr.hatch2 || 0;
        for (let k = 1; k < h2; k++) { const t = k / h2; W.seg(V.lerp(P[0], P[1], t), V.lerp(P[3], P[2], t), o.hatch * A); }
      }
    } else if (pr.t === 'hull') drawHull(W, pr, T, o, A);
    else if (pr.t === 'line') W.poly(pr.p.map(p => X.ap(T, p)), A * (pr.w === undefined ? 1 : pr.w), !!pr.closed);
    else if (pr.t === 'blades') {
      for (const q of bladeQuads(pr)) {
        const P = q.map(p => X.ap(T, p));
        W.poly(P, A * (pr.edge || .9), true);
        if (pr.rib) W.seg(V.lerp(P[0], P[1], .5), V.lerp(P[3], P[2], .5), o.hatch * A);
      }
      if (pr.hub) { const c = X.ap(T, pr.c), d = X.dir(T, pr.d), [U, Vv] = perp(d); W.ring(c, U, Vv, pr.r0, 14, A * .8); if (pr.shroud) W.ring(c, U, Vv, pr.r1 * 1.04, 36, A * .7); }
    }
  }
  /* flat pitched quads in the disc plane, so a spinning fan reads as a fan and not a wheel */
  function bladeQuads(pr) {
    const d = V.norm(pr.d), [U, Vv] = perp(d), out = [], n = pr.n, ch = pr.chord || .35, tp = pr.taper === undefined ? .7 : pr.taper, pit = pr.pitch || 0;
    for (let k = 0; k < n; k++) {
      const a = (pr.rot || 0) + k / n * Math.PI * 2;
      const dirAt = ang => V.add(V.mul(U, Math.cos(ang)), V.mul(Vv, Math.sin(ang)));
      const pt = (r, da, side) => V.add(V.mad(pr.c, dirAt(a + da), r), V.mul(d, side * pit * r * Math.abs(da) * 2));
      const w0 = ch / 2, w1 = ch * tp / 2 * pr.r0 / pr.r1 * 1.6;
      out.push([pt(pr.r0, -w0, -1), pt(pr.r0, w0, 1), pt(pr.r1, w1, 1), pt(pr.r1, -w1, -1)]);
    }
    return out;
  }
  /* a part's primitives: static, or rebuilt from state by part.dyn(st) (fans, rams, folding wings) */
  const primsOf = (part, st) => part.dyn ? part.dyn(st || {}) : part.prims;
  function partXf(world, part, st) { return part.xf ? X.mul(world, part.xf(st || {})) : world; }
  /* opt.fine === false skips prims flagged fine (small detail for distant shots) */
  function draw(W, model, world, st, opt) {
    const o = Object.assign({}, DEF, opt || {});
    for (const part of model.parts) {
      if (part.show && !part.show(st || {})) continue;
      const T = partXf(world, part, st), po = part.alpha ? Object.assign({}, o, { a: o.a * part.alpha }) : o;
      for (const pr of primsOf(part, st)) if (!(pr.fine && o.fine === false)) drawPrim(W, pr, T, po);
    }
  }

  /* ---------- surface sampling (points) ---------- */
  function samplePrim(pr, s, r, out) {
    const push = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    const jit = () => (r() - .5) * .6;
    const quad = (a, b, c, d, n) => {
      const nu = Math.max(1, Math.round(V.dist(a, b) / s)), nv = Math.max(1, Math.round(V.dist(a, d) / s));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const u = (i + .5 + jit()) / nu, v = (j + .5 + jit()) / nv;
        const p = V.lerp(V.lerp(a, b, u), V.lerp(d, c, u), v);
        push(p, n);
      }
    };
    if (pr.t === 'hex') {
      const P = pr.p, F = faceNormals(P);
      FACES.forEach((f, k) => { if (k === 0 && pr.bottom !== true) return; if (pr.skip && pr.skip.includes(k)) return; quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], F[k].n); });
    } else if (pr.t === 'lathe') {
      const [U, Vv] = perp(pr.d), st = pr.st;
      for (let i = 0; i < st.length - 1; i++) {
        const [s0, r0] = st[i], [s1, r1] = st[i + 1];
        const L = Math.hypot(s1 - s0, r1 - r0), na = Math.max(1, Math.round(L / s)), rm = Math.max(r0, r1);
        const nt = Math.max(6, Math.round(2 * Math.PI * rm / s));
        for (let a = 0; a < na; a++) for (let t = 0; t < nt; t++) {
          const u = (a + .5 + jit()) / na, th = (t + .5 + jit()) / nt * Math.PI * 2;
          const sr = s0 + (s1 - s0) * u, rr = r0 + (r1 - r0) * u, nr = V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th)));
          push(V.mad(V.mad(pr.a, pr.d, sr), nr, rr), nr);
        }
      }
      if (pr.caps) for (const i of [0, st.length - 1]) {
        const [sc, rc] = st[i]; if (rc < .01) continue;
        const nr = Math.max(1, Math.round(rc / s)), c = V.mad(pr.a, pr.d, sc), nn = V.mul(pr.d, i ? 1 : -1);
        for (let k = 0; k < nr; k++) { const rr = (k + .5) / nr * rc, nt = Math.max(5, Math.round(2 * Math.PI * rr / s));
          for (let t = 0; t < nt; t++) { const th = (t + .5 + jit()) / nt * Math.PI * 2; push(V.add(c, V.add(V.mul(U, Math.cos(th) * rr), V.mul(Vv, Math.sin(th) * rr))), nn); } }
      }
    } else if (pr.t === 'panel') {
      const P = pr.p;
      if (P.length === 4) quad(P[0], P[1], P[2], P[3], [0, 0, 0]);
    } else if (pr.t === 'hull') sampleHull(pr, s, r, out);
    else if (pr.t === 'blades') for (const q of bladeQuads(pr)) quad(q[0], q[1], q[2], q[3], [0, 0, 0]);
    else if (pr.t === 'line') {
      const P = pr.closed ? pr.p.concat([pr.p[0]]) : pr.p;
      for (let i = 0; i < P.length - 1; i++) {
        const n = Math.max(1, Math.round(V.dist(P[i], P[i + 1]) / s));
        for (let k = 0; k < n; k++) push(V.lerp(P[i], P[i + 1], (k + .5 + jit()) / n), [0, 0, 0]);
      }
    }
  }
  /* -> [{name, label, part, pts: Float32Array stride 6 (xyz, normal; zero normal = two-sided)}]
     dynamic parts are sampled at state st (default: their rest pose); opt.fine === false skips prims flagged fine */
  function sample(model, s, seed, st, opt) {
    const r = M3.rng(seed || 7), skipFine = opt && opt.fine === false;
    return model.parts.map(part => {
      const out = [];
      for (const pr of primsOf(part, st)) if (pr.pts !== false && !(skipFine && pr.fine)) samplePrim(pr, (pr.ds || 1) * s, r, out);
      return { name: part.name, label: part.label, part, pts: new Float32Array(out) };
    });
  }
  /* part-space AABB of a model part (for identification boxes) */
  function bounds(part) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const add = p => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } };
    for (const pr of primsOf(part, {})) {
      if (pr.t === 'hex' || pr.t === 'panel' || pr.t === 'line') pr.p.forEach(add);
      else if (pr.t === 'blades') for (const q of bladeQuads(pr)) q.forEach(add);
      else if (pr.t === 'lathe') { const rm = Math.max(...pr.st.map(q => q[1])); for (const q of pr.st) { const c = V.mad(pr.a, pr.d, q[0]); add(V.add(c, [rm, rm, rm])); add(V.sub(c, [rm, rm, rm])); } }
      else if (pr.t === 'hull') { add([-pr.B / 2, 0, -pr.L / 2]); add([pr.B / 2, pr.D + 4, pr.L / 2]); }
    }
    return [mn, mx];
  }

  /* ---------- ship hull (destroyer-like) ---------- */
  function hullB(pr, s) {            // s in [-1 stern, 1 bow] -> half breadth at deck
    const B = pr.B / 2;
    if (s > .3) return B * Math.max(0, 1 - Math.pow((s - .3) / .7, 1.75));
    if (s < -.82) return B * (.84 + .16 * (1 - (-.82 - s) / .18));
    return B;
  }
  const hullD = (pr, s) => pr.D + 3.6 * Math.pow(Math.max(0, (s - .25) / .75), 2);
  function drawHull(W, pr, T, o, A) {
    const N = 60, eye = W.cam.eye, L = pr.L;
    const pt = (s, side, y) => { const b = hullB(pr, s) * (y > 0 ? 1 : .9); return X.ap(T, [side * b, y, s * L / 2]); };
    const sideFront = side => { const n = X.dir(T, [side, 0, 0]); return V.dot(n, V.sub(eye, X.ap(T, [side * pr.B / 2, pr.D / 2, 0]))) > 0; };
    for (const side of [-1, 1]) {
      const f = sideFront(side) ? 1 : o.back;
      const deck = [], wl = [];
      for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N; deck.push(pt(s, side, hullD(pr, s))); wl.push(pt(s, side, 0)); }
      W.poly(deck, A, false); W.poly(wl, A * f * .85, false);
      for (let i = 1; i < 20; i++) { const s = -1 + 2 * i / 20; if (hullB(pr, s) < .3) continue; W.seg(pt(s, side, hullD(pr, s)), pt(s, side, 0), A * f * o.hatch * 1.2); }
      /* strakes */
      for (const yy of [.33, .66]) { const q = []; for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N; q.push(pt(s, side, hullD(pr, s) * yy)); } W.poly(q, A * f * o.hatch * .8, false); }
    }
    W.seg(pt(1, 1, hullD(pr, 1)), pt(1, 1, 0), A);                     // stem
    W.seg(pt(-1, -1, hullD(pr, -1)), pt(-1, 1, hullD(pr, -1)), A);     // transom
    W.seg(pt(-1, -1, 0), pt(-1, 1, 0), A * .6);
    W.seg(pt(-1, -1, 0), pt(-1, -1, hullD(pr, -1)), A); W.seg(pt(-1, 1, 0), pt(-1, 1, hullD(pr, -1)), A);
    for (let i = 1; i < 16; i++) { const s = -1 + 2 * i / 16; W.seg(pt(s, -1, hullD(pr, s)), pt(s, 1, hullD(pr, s)), A * o.hatch * .5); }
  }
  function sampleHull(pr, s, r, out) {
    const L = pr.L, push = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    const ns = Math.round(L / s);
    for (let i = 0; i < ns; i++) {
      const sx = -1 + 2 * (i + .5 + (r() - .5) * .6) / ns, d = hullD(pr, sx), bD = hullB(pr, sx);
      const nh = Math.max(1, Math.round(d / s));
      for (const side of [-1, 1]) for (let j = 0; j < nh; j++) {
        const y = (j + .5 + (r() - .5) * .6) / nh * d, b = bD * (.9 + .1 * y / d);
        push([side * b, y, sx * L / 2], [side, 0, sx > .3 ? (sx - .3) : 0]);
      }
      const nb = Math.max(1, Math.round(2 * bD / s));
      for (let j = 0; j < nb; j++) push([(-1 + 2 * (j + .5 + (r() - .5) * .6) / nb) * bD, d, sx * L / 2], [0, 1, 0]);
    }
  }

  /* ---------- models ---------- */
  function chassis(P, len0, len1) {
    P.push(box([-1.2, .95, len0], [1.2, 1.45, len1], { ribs: { z: 8 } }));
    for (const z of [4.45, 2.85, -3.05, -4.65]) for (const sx of [-1, 1]) {
      P.push(cyl([sx * 1.06, .74, z], [sx * 1.54, .74, z], .74, { n: 18, gen: 8, caps: true }));
      P.push(cyl([sx * 1.54, .74, z], [sx * 1.58, .74, z], .32, { n: 10, gen: 0, sil: false, pts: false }));
    }
  }
  function cab(P) {
    P.push(hex([[-1.45, 1.3, 4.05], [1.45, 1.3, 4.05], [1.45, 1.3, 6.25], [-1.45, 1.3, 6.25], [-1.35, 3.3, 4.3], [1.35, 3.3, 4.3], [1.35, 3.3, 5.6], [-1.35, 3.3, 5.6]]));
    P.push(panel([[-1.28, 2.32, 5.93], [1.28, 2.32, 5.93], [1.22, 3.12, 5.67], [-1.22, 3.12, 5.67]], { hatch: 0, pts: false }));
    P.push(box([-1.35, 1.45, 2.9], [1.35, 2.9, 3.95]));
  }
  /* Bastion-P TEL. state: elev (rad, 0 = stowed, pi/2 = vertical), dep (0..1 jacks), cap (bool front cap on) */
  function tel() {
    const C = [], K = [], L = [], J = [];
    chassis(C, -6.7, 5.7); cab(K);
    L.push(box([-1.45, 1.55, -6.7], [1.45, 3.45, 2.75], { ribs: { z: 7 }, al: .85 }));
    for (const sx of [-1, 1]) L.push(cyl([sx * .66, 2.5, -6.6], [sx * .66, 2.5, 2.65], .5, { n: 20, gen: 6, rings: [0, 1], al: .55, pts: false }));
    for (const x of [-1.62, 1.62]) for (const z of [-6.2, 2.3]) {
      J.push(cyl([x, .15, z], [x, 1.2, z], .11, { n: 8, gen: 0 }));
      J.push(box([x - .32, .06, z - .32], [x + .32, .15, z + .32]));
    }
    const PIV = [0, 1.55, -6.7];
    return {
      PIV, TUBE: [.66, 2.5, -6.6], TUBE_LEN: 9.25,
      parts: [
        { name: 'chassis', label: 'Chassis 8×8 · MZKT-7930', prims: C },
        { name: 'cab', label: 'Cab', prims: K },
        { name: 'launcher', label: 'Transport-launch container ×2', prims: L, xf: st => X.pivotX(PIV, -(st.elev || 0)) },
        { name: 'jacks', label: 'Outrigger jacks ×4', prims: J, xf: st => X.make(R.I(), [0, 1.05 * (1 - (st.dep === undefined ? 1 : st.dep)), 0]) },
      ],
    };
  }
  /* launch tube mouth + axis in model space for a TEL state */
  function tubeFrame(m, st, side) {
    const T = X.pivotX(m.PIV, -(st.elev || 0)), x = (side || 1) * m.TUBE[0];
    const base = X.ap(T, [x, m.TUBE[1], m.TUBE[2]]), mouth = X.ap(T, [x, m.TUBE[1], m.TUBE[2] + m.TUBE_LEN]);
    return { base, mouth, dir: V.norm(V.sub(mouth, base)) };
  }
  /* coastal radar truck with a rotating array. state: ant (rad) */
  function radarTruck() {
    const C = [], K = [], B = [], A = [];
    chassis(C, -6.7, 5.7); cab(K);
    B.push(box([-1.4, 1.5, -6.4], [1.4, 3.4, 2.75], { ribs: { z: 6 } }));
    B.push(cyl([0, 3.4, -5.1], [0, 10.6, -5.1], .17, { n: 10, gen: 4 }));
    const tilt = 14 * Math.PI / 180, w = 2.5, h = .85;
    const P = (x, y) => [x, 11.2 + y * Math.cos(tilt), -5.1 - y * Math.sin(tilt) - .2];
    A.push(panel([P(-w, -h), P(w, -h), P(w, h), P(-w, h)], { hatch: 10, hatch2: 4 }));
    A.push(box([-.25, 10.5, -5.35], [.25, 10.95, -4.85]));
    return {
      parts: [
        { name: 'chassis', label: 'Chassis 8×8', prims: C },
        { name: 'cab', label: 'Cab', prims: K },
        { name: 'body', label: 'Radar shelter', prims: B },
        { name: 'array', label: 'Search array', prims: A, xf: st => { const Rm = R.y(st.ant || 0), o = [0, 0, -5.1], ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], 0, o[2] - ro[2]]); } },
      ],
    };
  }
  /* P-800 Oniks, origin at its middle, nose +Z. wings: false for tube-stowed */
  function oniks(o) {
    o = o || {};
    const P = [];
    const st = [[0, .3], [.2, .34], [.6, .36], [1.4, .36], [2.2, .36], [3.0, .36], [3.8, .36], [4.6, .36], [5.4, .36], [6.2, .36], [7.0, .36], [7.8, .357], [8.5, .35], [8.95, .345]];
    P.push(lathe([0, 0, -4.5], [0, 0, 1], st, { n: o.n || 32, gen: o.gen === undefined ? 14 : o.gen, rings: o.rings || [0, 2, 5, 8, 11, 13] }));
    P.push(lathe([0, 0, 4.2], [0, 0, 1], [[0, .21], [.75, .015]], { n: 16, gen: 10 }));
    P.push(lathe([0, 0, 4.3], [0, 0, 1], [[0, .29], [.12, .3]], { n: 24, gen: 0, sil: false }));
    if (o.wings !== false) for (const sx of [-1, 1])
      P.push(panel([[sx * .36, 0, .95], [sx * .88, 0, -.15], [sx * .88, 0, -.62], [sx * .36, 0, -.62]], { hatch: 6, hatch2: 4 }));
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), at = (r, z) => [c * r, s * r, z];
      P.push(panel([at(.36, -3.55), at(.82, -4.05), at(.82, -4.42), at(.36, -4.42)], { hatch: 3 }));
    }
    return { parts: [{ name: 'missile', label: 'P-800 Oniks', prims: P }] };
  }
  /* SM-6 style interceptor (thin, long), origin middle, nose +Z */
  function interceptor() {
    const P = [lathe([0, 0, -3.3], [0, 0, 1], [[0, .27], [3.6, .27], [3.7, .17], [5.9, .17], [6.6, .0]], { n: 14, gen: 6, rings: [0, 1, 2, 3] })];
    for (const deg of [0, 90, 180, 270]) {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), at = (r, z) => [c * r, s * r, z];
      P.push(panel([at(.17, 1.4), at(.42, .9), at(.42, .6), at(.17, .6)]));
      P.push(panel([at(.27, -2.6), at(.62, -3.1), at(.62, -3.3), at(.27, -3.3)]));
    }
    return { parts: [{ name: 'sm6', label: 'SM-6', prims: P }] };
  }
  /* destroyer-like warship, 154 m, origin at midships on the waterline */
  function destroyer() {
    const H = [{ t: 'hull', L: 154, B: 20, D: 7 }], S = [], M = [], A = [];
    const d = 7.05;
    S.push(hex([[-7, d, 8], [7, d, 8], [7, d, 38], [-7, d, 38], [-5.4, 17, 12], [5.4, 17, 12], [5.4, 17, 33], [-5.4, 17, 33]], { ribs: { y: 3 } }));
    S.push(hex([[-5.6, 17, 25], [5.6, 17, 25], [5.6, 17, 33.5], [-5.6, 17, 33.5], [-4.8, 20.5, 26.5], [4.8, 20.5, 26.5], [4.8, 20.5, 32.2], [-4.8, 20.5, 32.2]]));
    S.push(box([-6, d, -30], [6, 13, 8], { ribs: { z: 5 } }));
    for (const z0 of [-2, -26]) S.push(hex([[-3, 13, z0], [3, 13, z0], [3, 13, z0 + 8], [-3, 13, z0 + 8], [-2.3, 22.5, z0 + 1.2], [2.3, 22.5, z0 + 1.2], [2.3, 22.5, z0 + 6.2], [-2.3, 22.5, z0 + 6.2]], { ribs: { y: 3 } }));
    S.push(box([-8, d, -52], [8, 14.5, -36], { ribs: { z: 3 } }));
    // SPY-style octagonal arrays on the forward deckhouse
    const up = V.norm([0, 9.95, -4]), cF = [0, 12.4, 35.2];
    const oct = (c, ax, ay) => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * Math.PI * 2; p.push(V.add(c, V.add(V.mul(ax, Math.cos(a) * 2.7), V.mul(ay, Math.sin(a) * 2.7)))); } return p; };
    const octs = [oct(cF, [1, 0, 0], up)];
    for (const sx of [-1, 1]) octs.push(oct([sx * 6.35, 12.4, 22], [0, 0, 1], V.norm([-sx * 1.6, 9.95, 0])));
    for (const p of octs) { S.push({ t: 'panel', p, pts: false }); }
    // tripod mast + yard
    const apex = [0, 44, 21];
    for (const b of [[-3.2, 20.5, 27], [3.2, 20.5, 27], [0, 20.5, 31.5]]) M.push(cyl(b, apex, .32, { n: 6, gen: 0, pts: true }));
    M.push(cyl([-5.5, 36, 23], [5.5, 36, 23], .18, { n: 6, gen: 0 }));
    M.push(cyl([0, 44, 21], [0, 50, 21], .12, { n: 6, gen: 0 }));
    // gun + barrel, bow VLS
    const dB = 7 + 3.6 * Math.pow((52 / 77 - .25) / .75, 2);
    A.push(lathe([0, dB, 52], [0, 1, 0], [[0, 2.2], [1.6, 1.8], [2.2, .9]], { n: 14, gen: 6 }));
    A.push(cyl([0, dB + 1.2, 53], [0, dB + 1.7, 60.5], .16, { n: 6, gen: 0 }));
    A.push(box([-3.2, dB - .1, 38.5], [3.2, dB + .35, 47], { ribs: { x: 4, z: 5 } }));
    A.push(box([-3.2, d, -64], [3.2, d + .35, -55], { ribs: { x: 4, z: 5 } }));
    return {
      parts: [
        { name: 'hull', label: 'Hull', prims: H },
        { name: 'super', label: 'Superstructure', prims: S },
        { name: 'mast', label: 'Mast', prims: M },
        { name: 'arms', label: 'Gun / VLS', prims: A },
      ],
    };
  }

  window.GEO = { hex, box, lathe, cyl, panel, line, blades, bladeQuads, primsOf, draw, drawPrim, sample, bounds, partXf, tel, tubeFrame, radarTruck, oniks, interceptor, destroyer, perp };
})();
