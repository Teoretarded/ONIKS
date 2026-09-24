/* Compiled hairline drawing for the HD models (local to OF "Task Force"). GEO.draw re-derives every
   primitive each frame (face normals, rings, allocations); here each part's primitives are flattened
   once into typed arrays of segments with their facing data, and a frame costs one local->camera
   transform per part and a facing test per segment. Alphas reproduce GEO.drawPrim exactly:
   hex edges (front if either face faces the eye, else back), ribs, lathe rings / generators /
   silhouettes, panels + hatching, lines, blades. Output goes straight into the Wire's buckets. */
(function () {
  'use strict';
  const { V, X } = M3;
  const DEF = { a: 1, back: .16, gen: .28, genBack: .06, sil: 1, ring: .8, hatch: .3 };
  const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const EDGES = [[0, 1, 0, 2], [1, 2, 0, 3], [2, 3, 0, 4], [3, 0, 0, 5], [4, 5, 1, 2], [5, 6, 1, 3], [6, 7, 1, 4], [7, 4, 1, 5], [0, 4, 5, 2], [1, 5, 2, 3], [2, 6, 3, 4], [3, 7, 4, 5]];

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

  /* compile one part's prims (already in part space) */
  function compilePrims(prims, fine) {
    const S = [], F = [], G = [], L = [], live = [];
    // S: ax ay az bx by bz alF alB f1 f2   (f = face index or -1 = no facing: always alF)
    const face = (n, c) => { F.push(n[0], n[1], n[2], c[0], c[1], c[2]); return F.length / 6 - 1; };
    const seg = (a, b, alF, alB, f1, f2) => {
      if (alF <= .004 && alB <= .004) return;
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-7) return;
      S.push(a[0], a[1], a[2], b[0], b[1], b[2], alF, alB, f1, f2 === undefined ? -1 : f2);
    };
    const poly = (P, al, closed) => { for (let i = 0; i < P.length - 1; i++) seg(P[i], P[i + 1], al, al, -1); if (closed && P.length > 2) seg(P[P.length - 1], P[0], al, al, -1); };
    for (const pr of prims) {
      if (pr.fine && fine === false) continue;
      const A = pr.al === undefined ? 1 : pr.al;
      if (A <= .004) continue;
      if (pr.t === 'hex') {
        const P = pr.p, Fn = faceNormals(P), fi = Fn.map(f => face(f.n, f.c));
        const seen = new Set();
        for (const [i, j, f1, f2] of EDGES) {
          const k = Math.min(i, j) * 8 + Math.max(i, j); if (seen.has(k)) continue; seen.add(k);
          seg(P[i], P[j], A, DEF.back * A, fi[f1], fi[f2]);
        }
        if (pr.ribs) {
          const rib = (n, quad, faces) => {
            for (let k = 1; k < n; k++) {
              const t = k / n, q = quad.map(([a, b]) => V.lerp(P[a], P[b], t));
              for (let e = 0; e < 4; e++) seg(q[e], q[(e + 1) % 4], DEF.hatch * 1.4 * A, DEF.back * .6 * A, fi[faces[e]]);
            }
          };
          if (pr.ribs.z) rib(pr.ribs.z, [[0, 3], [1, 2], [5, 6], [4, 7]], [0, 3, 1, 5]);
          if (pr.ribs.x) rib(pr.ribs.x, [[0, 1], [3, 2], [7, 6], [4, 5]], [0, 4, 1, 2]);
          if (pr.ribs.y) rib(pr.ribs.y, [[0, 4], [1, 5], [2, 6], [3, 7]], [2, 3, 4, 5]);
        }
      } else if (pr.t === 'lathe') {
        const a = pr.a, d = V.norm(pr.d), [U, Vv] = GEO.perp(d), st = pr.st, n = pr.n || 24;
        const ringsAt = pr.rings || st.map((_, i) => i);
        for (const i of ringsAt) {
          const [s, r] = st[i]; if (!(r > .001)) continue;
          const c = V.mad(a, d, s);
          let pv = V.add(c, V.mul(U, r));
          for (let k = 1; k <= n; k++) {
            const an = k / n * Math.PI * 2, q = V.add(c, V.add(V.mul(U, Math.cos(an) * r), V.mul(Vv, Math.sin(an) * r)));
            const am = (k - .5) / n * Math.PI * 2, nr = V.add(V.mul(U, Math.cos(am)), V.mul(Vv, Math.sin(am)));
            seg(pv, q, DEF.ring * A, DEF.back * A * .8, face(nr, V.mad(c, nr, r)));
            pv = q;
          }
        }
        const g = pr.gen === undefined ? 10 : pr.gen, mid = V.mad(a, d, st[st.length >> 1][0]);
        for (let k = 0; k < g; k++) {
          const th = (k + .5) / g * Math.PI * 2, nr = V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th)));
          for (let i = 0; i < st.length - 1; i++) {
            const p0 = V.mad(V.mad(a, d, st[i][0]), nr, st[i][1]), p1 = V.mad(V.mad(a, d, st[i + 1][0]), nr, st[i + 1][1]);
            if (V.dist(p0, p1) < 1e-7) continue;
            G.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], nr[0], nr[1], nr[2], mid[0], mid[1], mid[2], A);
          }
        }
        if (pr.sil !== false) L.push({ a, d, st, mid, A });
      } else if (pr.t === 'panel') {
        const P = pr.p;
        poly(P, A * (pr.edge || 1), true);
        if (pr.hatch && P.length === 4) {
          for (let k = 1; k < pr.hatch; k++) { const t = k / pr.hatch; seg(V.lerp(P[0], P[3], t), V.lerp(P[1], P[2], t), DEF.hatch * A, DEF.hatch * A, -1); }
          const h2 = pr.hatch2 || 0;
          for (let k = 1; k < h2; k++) { const t = k / h2; seg(V.lerp(P[0], P[1], t), V.lerp(P[3], P[2], t), DEF.hatch * A, DEF.hatch * A, -1); }
        }
      } else if (pr.t === 'line') poly(pr.p, A * (pr.w === undefined ? 1 : pr.w), !!pr.closed);
      else if (pr.t === 'blades') {
        for (const q of GEO.bladeQuads(pr)) {
          poly(q, A * (pr.edge || .9), true);
          if (pr.rib) seg(V.lerp(q[0], q[1], .5), V.lerp(q[3], q[2], .5), DEF.hatch * A, DEF.hatch * A, -1);
        }
        if (pr.hub) {
          const c = pr.c, d = V.norm(pr.d), [U, Vv] = GEO.perp(d);
          const ring = (r, n, al) => { let pv = V.add(c, V.mul(U, r)); for (let k = 1; k <= n; k++) { const an = k / n * Math.PI * 2, q = V.add(c, V.add(V.mul(U, Math.cos(an) * r), V.mul(Vv, Math.sin(an) * r))); seg(pv, q, al, al, -1); pv = q; } };
          ring(pr.r0, 14, A * .8); if (pr.shroud) ring(pr.r1 * 1.04, 36, A * .7);
        }
      } else live.push(pr);
    }
    // bounding sphere
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const add = (x, y, z) => { if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z; if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z; };
    for (let i = 0; i < S.length; i += 10) { add(S[i], S[i + 1], S[i + 2]); add(S[i + 3], S[i + 4], S[i + 5]); }
    for (let i = 0; i < G.length; i += 13) add(G[i], G[i + 1], G[i + 2]);
    for (const l of L) for (const q of l.st) { const c = V.mad(l.a, l.d, q[0]); add(c[0] - q[1], c[1] - q[1], c[2] - q[1]); add(c[0] + q[1], c[1] + q[1], c[2] + q[1]); }
    const cen = mn[0] < 1e8 ? V.lerp(mn, mx, .5) : [0, 0, 0], rad = mn[0] < 1e8 ? V.dist(mn, mx) / 2 : 0;
    return { S: new Float64Array(S), F: new Float64Array(F), FF: new Uint8Array(F.length / 6), G: new Float64Array(G), L, live, cen, rad };
  }

  /* model -> compiled parts. Dynamic parts are compiled at state st (fixed-pose parts) unless listed in
     o.dyn, which are drawn through GEO each frame (or through a caller-provided cache). */
  function compile(model, o) {
    o = o || {};
    const st = o.st || {}, fine = o.fine;
    const parts = model.parts.map(p => {
      if (o.skip && o.skip.includes(p.name)) return null;
      if (p.dyn && o.dyn && o.dyn.includes(p.name)) return { part: p, dynamic: true };
      const prims = p.dyn ? p.dyn(st) : p.prims;
      return Object.assign({ part: p }, compilePrims(prims, fine));
    }).filter(Boolean);
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const c of parts) if (c.rad) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], c.cen[k] - c.rad); mx[k] = Math.max(mx[k], c.cen[k] + c.rad); }
    return { parts, cen: V.lerp(mn, mx, .5), rad: V.dist(mn, mx) / 2 };
  }

  /* ---------- emission ---------- */
  let NB = 18;
  function emitter(W) {
    const c = W.cam, near = c.near, fl = c.fl, cx = c.cx + c.shake[0], cy = c.cy + c.shake[1], m = W.cull, Wd = c.W, Hd = c.H;
    const [f0, f1] = W.fog, b = W.cur.b; NB = b.length;
    return function (ax, ay, az, bx, by, bz, al) {
      if (az < near && bz < near) return;
      if (az < near) { const t = (near - az) / (bz - az); ax += (bx - ax) * t; ay += (by - ay) * t; az = near; }
      else if (bz < near) { const t = (near - bz) / (az - bz); bx += (ax - bx) * t; by += (ay - by) * t; bz = near; }
      const zm = (az + bz) * .5; al *= zm <= f0 ? 1 : zm >= f1 ? 0 : 1 - (zm - f0) / (f1 - f0);
      if (al <= .004) return;
      const pax = cx + fl * ax / az, pay = cy - fl * ay / az, pbx = cx + fl * bx / bz, pby = cy - fl * by / bz;
      if ((pax < -m && pbx < -m) || (pax > Wd + m && pbx > Wd + m) || (pay < -m && pby < -m) || (pay > Hd + m && pby > Hd + m)) return;
      const k = Math.min(NB - 1, Math.floor(Math.sqrt(al < 1 ? al : 1) * NB));
      b[k].push(pax, pay, pbx, pby);
    };
  }

  /* is a world-space sphere (centre, radius) inside the view (+ margin)? */
  function visible(cam, c, r) {
    const dx = c[0] - cam.eye[0], dy = c[1] - cam.eye[1], dz = c[2] - cam.eye[2];
    const z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    if (z < -r) return false;
    const x = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2], y = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
    const th = Math.tan(cam.fov / 2), tw = th * cam.W / cam.H, zz = Math.max(z, 1e-3);
    // distance to the side planes (normalised)
    if (x - tw * zz > r * Math.hypot(1, tw)) return false;
    if (-x - tw * zz > r * Math.hypot(1, tw)) return false;
    if (y - th * zz > r * Math.hypot(1, th)) return false;
    if (-y - th * zz > r * Math.hypot(1, th)) return false;
    return true;
  }

  function drawPart(W, C, Tw, A, emit) {
    const cam = W.cam, e = cam.eye, R = Tw.R, T = Tw.T;
    // local eye
    const ex = e[0] - T[0], ey = e[1] - T[1], ez = e[2] - T[2];
    const lx = R[0] * ex + R[3] * ey + R[6] * ez, ly = R[1] * ex + R[4] * ey + R[7] * ez, lz = R[2] * ex + R[5] * ey + R[8] * ez;
    // local -> camera rows
    const r = cam.r, u = cam.u, f = cam.f;
    const r0 = R[0] * r[0] + R[3] * r[1] + R[6] * r[2], r1 = R[1] * r[0] + R[4] * r[1] + R[7] * r[2], r2 = R[2] * r[0] + R[5] * r[1] + R[8] * r[2];
    const u0 = R[0] * u[0] + R[3] * u[1] + R[6] * u[2], u1 = R[1] * u[0] + R[4] * u[1] + R[7] * u[2], u2 = R[2] * u[0] + R[5] * u[1] + R[8] * u[2];
    const f0 = R[0] * f[0] + R[3] * f[1] + R[6] * f[2], f1 = R[1] * f[0] + R[4] * f[1] + R[7] * f[2], f2 = R[2] * f[0] + R[5] * f[1] + R[8] * f[2];
    const tx = -ex, ty = -ey, tz = -ez;
    const ox = tx * r[0] + ty * r[1] + tz * r[2], oy = tx * u[0] + ty * u[1] + tz * u[2], oz = tx * f[0] + ty * f[1] + tz * f[2];
    const Fa = C.F, FF = C.FF;
    for (let i = 0, j = 0; i < Fa.length; i += 6, j++) FF[j] = (Fa[i] * (lx - Fa[i + 3]) + Fa[i + 1] * (ly - Fa[i + 4]) + Fa[i + 2] * (lz - Fa[i + 5])) > 0 ? 1 : 0;
    const S = C.S;
    for (let i = 0; i < S.length; i += 10) {
      const g1 = S[i + 8], g2 = S[i + 9];
      const al = (g1 < 0 || FF[g1] || (g2 >= 0 && FF[g2])) ? S[i + 6] : S[i + 7];
      if (al * A <= .004) continue;
      const ax = S[i], ay = S[i + 1], az = S[i + 2], bx = S[i + 3], by = S[i + 4], bz = S[i + 5];
      emit(r0 * ax + r1 * ay + r2 * az + ox, u0 * ax + u1 * ay + u2 * az + oy, f0 * ax + f1 * ay + f2 * az + oz,
        r0 * bx + r1 * by + r2 * bz + ox, u0 * bx + u1 * by + u2 * bz + oy, f0 * bx + f1 * by + f2 * bz + oz, al * A);
    }
    const G = C.G;
    for (let i = 0; i < G.length; i += 13) {
      const wx = lx - G[i + 9], wy = ly - G[i + 10], wz = lz - G[i + 11], wl = Math.hypot(wx, wy, wz) || 1;
      const fc = (G[i + 6] * wx + G[i + 7] * wy + G[i + 8] * wz) / wl;
      const al = (fc > 0 ? DEF.gen * (.35 + .65 * fc) : DEF.genBack) * G[i + 12] * A;
      if (al <= .004) continue;
      const ax = G[i], ay = G[i + 1], az = G[i + 2], bx = G[i + 3], by = G[i + 4], bz = G[i + 5];
      emit(r0 * ax + r1 * ay + r2 * az + ox, u0 * ax + u1 * ay + u2 * az + oy, f0 * ax + f1 * ay + f2 * az + oz,
        r0 * bx + r1 * by + r2 * bz + ox, u0 * bx + u1 * by + u2 * bz + oy, f0 * bx + f1 * by + f2 * bz + oz, al);
    }
    for (const l of C.L) {
      const d = l.d, st = l.st;
      let wx = lx - l.mid[0], wy = ly - l.mid[1], wz = lz - l.mid[2];
      const dd = wx * d[0] + wy * d[1] + wz * d[2]; wx -= d[0] * dd; wy -= d[1] * dd; wz -= d[2] * dd;
      let sx = d[1] * wz - d[2] * wy, sy = d[2] * wx - d[0] * wz, sz = d[0] * wy - d[1] * wx;
      const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      const al = DEF.sil * l.A * A;
      for (const sg of [1, -1]) for (let i = 0; i < st.length - 1; i++) {
        const ax = l.a[0] + d[0] * st[i][0] + sx * sg * st[i][1], ay = l.a[1] + d[1] * st[i][0] + sy * sg * st[i][1], az = l.a[2] + d[2] * st[i][0] + sz * sg * st[i][1];
        const bx = l.a[0] + d[0] * st[i + 1][0] + sx * sg * st[i + 1][1], by = l.a[1] + d[1] * st[i + 1][0] + sy * sg * st[i + 1][1], bz = l.a[2] + d[2] * st[i + 1][0] + sz * sg * st[i + 1][1];
        emit(r0 * ax + r1 * ay + r2 * az + ox, u0 * ax + u1 * ay + u2 * az + oy, f0 * ax + f1 * ay + f2 * az + oz,
          r0 * bx + r1 * by + r2 * bz + ox, u0 * bx + u1 * by + u2 * bz + oy, f0 * bx + f1 * by + f2 * bz + oz, al);
      }
    }
    if (C.live.length) { const o = Object.assign({}, DEF, { a: A }); for (const pr of C.live) GEO.drawPrim(W, pr, Tw, o); }
  }

  /* draw a compiled model at world transform `world`, state st (for part xf / show / dynamic parts) */
  function draw(W, CM, world, st, o) {
    o = o || {};
    const A = o.a === undefined ? 1 : o.a;
    st = st || {};
    if (!o.noCull && CM.rad && !visible(W.cam, X.ap(world, CM.cen), CM.rad)) return false;
    const emit = emitter(W);
    for (const C of CM.parts) {
      const p = C.part;
      if (p.show && !p.show(st)) continue;
      const Tw = p.xf ? X.mul(world, p.xf(st)) : world;
      if (!C.dynamic && !o.noCull && C.rad && !visible(W.cam, X.ap(Tw, C.cen), C.rad)) continue;
      if (C.dynamic) {
        const cached = o.dynCache && o.dynCache(p.name, st);
        if (cached) { drawPart(W, cached, Tw, A * (p.alpha || 1), emit); continue; }
        const oo = Object.assign({}, DEF, { a: A * (p.alpha || 1), fine: o.fine });
        for (const pr of p.dyn(st)) if (!(pr.fine && o.fine === false)) GEO.drawPrim(W, pr, Tw, oo);
        continue;
      }
      drawPart(W, C, Tw, A * (p.alpha || 1), emit);
    }
    return true;
  }
  window.FAST = { compile, compilePrims, draw, drawPart, emitter, visible };
})();
