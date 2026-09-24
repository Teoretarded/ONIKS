/* HD sea / air models for the extended menu cutscenes: DDG-51 Flight IIA, MH-60R,
   F/A-18E, Orlan-10 + launch trailer, Kondor-class SAR satellite, Nimitz-class carrier.
   Contract: _brief/models.txt (SEA / AIR). Built only from GEO primitives, so GEO.draw
   (Orbital hairlines) and GEO.sample (Point Cloud dots) both understand every part.
   Metres, +Z forward, +Y up, +X starboard. Prims flagged fine: true are close-up detail.

   Two private building blocks keep both renderers clean:
     fl(A, B, n)   facing-aware hairline. A zero-volume hex whose only non-degenerate face has
                   normal n, so GEO.draw gives the segment full alpha when that surface faces the
                   eye and back-edge alpha when it does not (hulls and fuselages stop showing
                   their far side through themselves). Its duplicate edges share one stroke bucket.
     plate(q, out) dots-only skin patch: a thin hex drawn at al 0 that samples only its outer
                   face, with a true outward normal (lit correctly in the Point Cloud films).
   Curved skins are lofted from cross-sections: fl feature lines for wire, plates for dots. */
window.HD = window.HD || {};
(function () {
  'use strict';
  const HD = window.HD;
  const { V, R, X } = M3;
  const { hex, box, lathe, cyl, panel, line, blades } = GEO;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180;
  const mix = (a, b, t) => a + (b - a) * t;
  const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const O = (...a) => Object.assign({}, ...a);
  const F = o => O({ fine: true }, o);

  /* ================= helpers ================= */
  function Rax(ax, a) {
    const [x, y, z] = V.norm(ax), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  function tp(T, pr) {
    const q = Object.assign({}, pr);
    if (pr.p) q.p = pr.p.map(p => X.ap(T, p));
    if (pr.t === 'lathe') { q.a = X.ap(T, pr.a); q.d = X.dir(T, pr.d); }
    if (pr.t === 'blades') { q.c = X.ap(T, pr.c); q.d = X.dir(T, pr.d); }
    return q;
  }
  const tps = (T, L) => L.map(pr => tp(T, pr));
  const mirX = p => [-p[0], p[1], p[2]];
  const ring = (c, d, r, o) => lathe(c, d, [[0, r], [.001, r]], O({ gen: 0, sil: false, rings: [0], n: 20, pts: false }, o));
  function sphere(c, r, o) {
    const st = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI; st.push([r * (1 - Math.cos(a)), r * Math.sin(a) + 1e-4]); }
    return lathe(V.add(c, [0, -r, 0]), [0, 1, 0], st, O({ n: 16, gen: 4, rings: [2, 4, 6] }, o));
  }

  function fl(A, B, n, o) {
    const ab = V.sub(B, A); let e = V.cross(n, ab); const le = V.len(e);
    if (le < 1e-9 || V.len(ab) < 1e-6) return line([A, B], O({ pts: false }, o, { w: o && o.al !== undefined ? o.al : 1 }));
    e = V.mul(e, 1e-4 / le);
    const A2 = V.add(A, e), B2 = V.add(B, e);
    return hex([A, B, B2, A2, A, B, B2, A2], O({ pts: false }, o));
  }
  /* facing-aware closed quad outline (4 real edges per hex): windows, doors, panels on curved skins */
  function fquad(q, n, o) {
    const c = V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]));
    const Q = V.dot(c, n) < 0 ? [q[0], q[3], q[2], q[1]] : q;
    return hex([...Q, ...Q], O({ pts: false }, o));
  }
  /* facing-aware polyline; N: normal vector or (i, a, b) -> normal; o: options or i -> options */
  /* two consecutive facing-aware segments A-B-C in one hex: quad [A, B, C, B+eps] whose closing
     edges retrace the two segments, so every drawn edge is real and the cost per segment halves */
  function fl2(A, B, C, n, o) {
    const ab = V.sub(B, A); let e = V.cross(n, ab); const le = V.len(e);
    if (le < 1e-9 || V.len(ab) < 1e-6 || V.dist(B, C) < 1e-6) return null;
    const B2 = V.mad(B, e, 1e-4 / le), q = [A, B, C, B2];
    return hex([...q, ...q], O({ pts: false }, o));
  }
  function fpoly(P, N, o, closed) {
    const out = [], Q = closed ? P.concat([P[0]]) : P, m = Q.length - 1;
    const nAt = i => typeof N === 'function' ? N(i, Q[i], Q[i + 1]) : N, oAt = i => typeof o === 'function' ? o(i) : o;
    for (let i = 0; i < m; i += 2) {
      if (i + 1 < m) {
        const h = fl2(Q[i], Q[i + 1], Q[i + 2], V.norm(V.add(nAt(i), nAt(i + 1))), oAt(i));
        if (h) { out.push(h); continue; }
        out.push(fl(Q[i], Q[i + 1], nAt(i), oAt(i)), fl(Q[i + 1], Q[i + 2], nAt(i + 1), oAt(i + 1)));
      } else out.push(fl(Q[i], Q[i + 1], nAt(i), oAt(i)));
    }
    return out;
  }
  function plate(q, out, o) {
    let n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0])));
    if (V.len(n) < .5) n = V.norm(V.cross(V.sub(q[2], q[1]), V.sub(q[3], q[1])));
    if (V.len(n) < .5) n = V.norm(V.cross(V.sub(q[2], q[0]), V.sub(q[3], q[1])));
    if (out && V.dot(n, out) < 0) n = V.mul(n, -1);
    const inn = q.map(p => V.mad(p, n, -.025));
    return hex([...inn, ...q], O({ al: 0, skip: [2, 3, 4, 5], dot: true }, o));
  }
  /* outward horizontal normal of a side line a->b on side s, tilted up by `up` */
  function sideN(a, b, s, up) {
    const t = V.sub(b, a); let n = [t[2], 0, -t[0]];
    if (n[0] * s < 0) n = V.mul(n, -1);
    n = V.norm(n); return V.norm([n[0], up || 0, n[2]]);
  }
  /* inward offset of a convex [x, z] polygon */
  function insetPoly(P, d) {
    const n = P.length; let A = 0;
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
    const sg = A > 0 ? 1 : -1, L = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      L.push([a[0] - dz / l * sg * d, a[1] + dx / l * sg * d, dx, dz]);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const l1 = L[(i + n - 1) % n], l2 = L[i], den = l1[2] * l2[3] - l1[3] * l2[2];
      if (Math.abs(den) < 1e-9) { out.push([l2[0], l2[1]]); continue; }
      const t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / den;
      out.push([l1[0] + l1[2] * t, l1[1] + l1[3] * t]);
    }
    return out;
  }

  /* ---------- lofted skins ---------- */
  function sec(z, w, yb, yt, e, N, xc) {
    const out = [], yc = (yt + yb) / 2, h = (yt - yb) / 2, k = 2 / e; xc = xc || 0;
    for (let j = 0; j < N; j++) {
      const th = j / N * TAU, s = Math.sin(th), c = Math.cos(th);
      out.push([xc + w * Math.sign(s) * Math.pow(Math.abs(s), k), yc + h * Math.sign(c) * Math.pow(Math.abs(c), k), z]);
    }
    return out;
  }
  /* pear section: half-width wt at the top blending to wb at the bottom */
  function sec2(z, wt, wb, yb, yt, e, N) {
    const out = [], yc = (yt + yb) / 2, h = (yt - yb) / 2, k = 2 / e;
    for (let j = 0; j < N; j++) {
      const th = j / N * TAU, s = Math.sin(th), c = Math.cos(th), w = mix(wb, wt, (1 + c) / 2);
      out.push([w * Math.sign(s) * Math.pow(Math.abs(s), k), yc + h * Math.sign(c) * Math.pow(Math.abs(c), k), z]);
    }
    return out;
  }
  function arc(z, w, yb, yt, e, N, xc) {
    const out = [], k = 2 / e; xc = xc || 0;
    for (let j = 0; j < N; j++) {
      const ph = j / (N - 1) * PI, c = Math.cos(ph), s = Math.sin(ph);
      out.push([xc + w * Math.sign(c) * Math.pow(Math.abs(c), k), yb + (yt - yb) * Math.pow(Math.max(0, s), k), z]);
    }
    return out;
  }
  function skin(S, open, inward) {
    return { S, open: !!open, inward: !!inward, ns: S.length, N: S[0].length, C: S.map(s => V.mul(s.reduce((a, p) => V.add(a, p), [0, 0, 0]), 1 / s.length)) };
  }
  function skAt(k, u, v) {
    const i = Math.max(0, Math.min(k.ns - 2, Math.floor(u))), fu = Math.max(0, Math.min(1, u - i));
    let j, j2, fv;
    if (k.open) { const vv = Math.max(0, Math.min(k.N - 1, v)); j = Math.min(k.N - 2, Math.floor(vv)); fv = vv - j; j2 = j + 1; }
    else { const vv = ((v % k.N) + k.N) % k.N; j = Math.floor(vv) % k.N; fv = vv - Math.floor(vv); j2 = (j + 1) % k.N; }
    return V.lerp(V.lerp(k.S[i][j], k.S[i][j2], fv), V.lerp(k.S[i + 1][j], k.S[i + 1][j2], fv), fu);
  }
  const skC = (k, u) => { const i = Math.max(0, Math.min(k.ns - 2, Math.floor(u))); return V.lerp(k.C[i], k.C[i + 1], Math.max(0, Math.min(1, u - i))); };
  function skN(k, u, v) {
    const e = .08, du = V.sub(skAt(k, Math.min(k.ns - 1, u + e), v), skAt(k, Math.max(0, u - e), v));
    const dv = V.sub(skAt(k, u, v + e), skAt(k, u, v - e));
    const p = skAt(k, u, v), c = skC(k, u);
    let n = V.norm(V.cross(dv, du));
    if (V.len(n) < .5) n = V.norm(V.sub(p, c));
    if (V.len(n) < .5) n = V.norm(u < k.ns / 2 ? V.sub(k.C[0], k.C[1]) : V.sub(k.C[k.ns - 1], k.C[k.ns - 2]));
    if (V.dot(n, V.sub(p, c)) < -1e-9) n = V.mul(n, -1);
    return k.inward ? V.mul(n, -1) : n;
  }
  function loft(k, o) {
    o = o || {};
    const { S, ns, N, open } = k, out = [], nA = open ? N - 1 : N, al = o.al === undefined ? 1 : o.al;
    for (const j of o.lines || []) {
      const fine = o.fineLines || (o.fineJ && o.fineJ.includes(j));
      out.push(...fpoly(S.map(sec => sec[j]), i => V.norm(V.add(skN(k, i, j), skN(k, i + 1, j))), i => ({ al: typeof al === 'function' ? al(i, j) : al, fine })));
    }
    for (const i of o.rings || []) {
      const R_ = open ? S[i] : S[i], ro = { al: o.ral === undefined ? al * .5 : o.ral, fine: o.fineRings };
      out.push(...fpoly(R_, jj => V.norm(V.add(skN(k, i, jj), skN(k, i, (jj + 1) % N))), ro, !open));
    }
    if (o.pts !== false) for (let i = 0; i < ns - 1; i++) for (let j = 0; j < nA; j++) {
      const j2 = (j + 1) % N, q = [S[i][j], S[i][j2], S[i + 1][j2], S[i + 1][j]];
      const c = V.mul(V.add(V.add(q[0], q[1]), V.add(q[2], q[3])), .25);
      let out_ = V.sub(c, V.lerp(k.C[i], k.C[i + 1], .5)); if (k.inward) out_ = V.mul(out_, -1);
      out.push(plate(q, out_, { ds: o.ds, fine: o.finePts }));
    }
    return out;
  }
  /* facing-aware polyline drawn on a skin through (u, v) corners, subdivided along the surface */
  function sline(k, uv, closed, o) {
    const out = [], m = closed ? uv.length : uv.length - 1, K = (o && o.sub) || 3, lift = (o && o.lift) || .012;
    for (let i = 0; i < m; i++) {
      const a = uv[i], b = uv[(i + 1) % uv.length];
      for (let q = 0; q < K; q++) {
        const u0 = mix(a[0], b[0], q / K), v0 = mix(a[1], b[1], q / K), u1 = mix(a[0], b[0], (q + 1) / K), v1 = mix(a[1], b[1], (q + 1) / K);
        const n0 = skN(k, u0, v0), n1 = skN(k, u1, v1);
        out.push(fl(V.mad(skAt(k, u0, v0), n0, lift), V.mad(skAt(k, u1, v1), n1, lift), V.norm(V.add(n0, n1)), o));
      }
    }
    return out;
  }
  /* quad on a skin through 4 (u, v) corners, lifted along the surface normal */
  function squad(k, uv, o) {
    const n = V.norm(uv.reduce((acc, [u, v]) => V.add(acc, skN(k, u, v)), [0, 0, 0]));
    return fquad(uv.map(([u, v]) => V.mad(skAt(k, u, v), skN(k, u, v), (o && o.lift) || .015)), n, o);
  }
  /* thin slab from a planar quad (wings, fins): hex with top/bottom offset along the quad normal */
  function slab(q, th, o) {
    const n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0])));
    const t = Array.isArray(th) ? th : [th, th, th, th];
    return hex([...q.map((p, i) => V.mad(p, n, -t[i] / 2)), ...q.map((p, i) => V.mad(p, n, t[i] / 2))], O({ skip: [2, 3, 4, 5] }, o));
  }

  /* ======================================================================
     DDG-51 Arleigh Burke Flight IIA · 155.3 m · origin midships waterline
     ====================================================================== */
  const ZB = 77.6, ZS = -77.6, ZST = 70.6;
  const hD = z => { const u = z / ZB; return 6.5 + 1.1 * u + 2.7 * Math.pow(Math.max(0, (u - .3) / .7), 2); };
  const hB = z => { const u = z / ZB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); if (u < -.55) return 10 * (1 - .14 * Math.pow((-.55 - u) / .45, 1.5)); return 10; };
  const hW = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
  const hK0 = z => z <= ZST ? 0 : hD(ZB) * Math.pow(Math.min(1, (z - ZST) / (ZB - ZST)), 1 / 1.35);
  function ddSec(z) {
    const d = hD(z), b = hB(z), y0 = hK0(z), w = hW(z), yk = d - Math.min(1.6, (d - y0) * .3);
    return { w: [w, y0], k: [w + (b - w) * .9, yk], d: [b, d] };
  }
  const D01 = 10.3;                     // 01-level roof
  const VF_Z = 38.9, VA_Z = -29.4, VP = .85;
  const GUN_P = [0, hD(48.6), 48.6];
  const CIWS_P = [[0, 11.0, 32.9], [0, 13.9, -47.5]];
  const STACK_Z = [2.2, -17.0];
  const PS = [0, 28.2, 21.6];            // SPS-67 pivot
  const HELO_Z = -65.5;
  const DD_HOLES = [[VF_Z - 1.72, VF_Z + 1.72, 4.25], [1.5, 35.5, 8.0], [-23.5, 1.5, 6.25], [VA_Z - 3.42, VA_Z + 3.42, 4.25], [-53, -34, 8.6]];
  const DD_Z = (() => {
    const hb = []; DD_HOLES.forEach(h => hb.push(h[0], h[1]));
    const base = [ZS, -72, -66, -60, -45, -26, -15, -4, 7, 16, 24, 31, 42, 47, 51, 55, 58.5, 62, 65, 67.5, 69.3, ZST, 72, 73.5, 74.8, 75.9, 76.8, ZB];
    return base.filter(v => !hb.some(b => Math.abs(b - v) < .8)).concat(hb).sort((a, b) => a - b);
  })();
  const SPY_HOUSE = [[-3.9, 31.0], [3.9, 31.0], [8.0, 26.9], [8.0, 12.2], [3.9, 8.1], [-3.9, 8.1], [-8.0, 12.2], [-8.0, 26.9]];
  const SPY_Y = [D01, 19.4], SPY_IN = 1.3, SPY_V = (13.9 - D01) / (19.4 - D01);
  const SPY_FACES = (() => {
    const top = insetPoly(SPY_HOUSE, SPY_IN), out = [];
    const B = SPY_HOUSE.map(p => [p[0], SPY_Y[0], p[1]]), T = top.map(p => [p[0], SPY_Y[1], p[1]]);
    for (const [a, b] of [[1, 2], [7, 0], [3, 4], [5, 6]]) {       // stbd-fwd, port-fwd, stbd-aft, port-aft
      const mb = V.lerp(B[a], B[b], .5), mt = V.lerp(T[a], T[b], .5);
      const h = V.norm(V.sub(B[b], B[a])), u = V.norm(V.sub(mt, mb));
      let n = V.norm(V.cross(h, u)); const c0 = V.lerp(mb, mt, SPY_V);
      if (V.dot(n, V.sub(c0, [0, c0[1], 19.4])) < 0) n = V.mul(n, -1);
      out.push({ c: V.mad(c0, n, .1), h, u, n });
    }
    return out;
  })();
  function vlsCell(i) {
    const fwd = i < 32, k = fwd ? i : i - 32, r = Math.floor(k / 8), c = k % 8, rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z;
    const m = c >> 1, j = c & 1, xm = (-3 + 2 * m) * 1.05, z = zc + ((rows - 1) / 2 - r) * VP;
    return { x: xm + (j ? .72 : -.72), z, y: hD(zc) + .06, hs: j ? 1 : -1 };
  }
  const ciwsDef = [0, PI], ciwsPDef = [.35, .35];
  const cY = (st, i) => (st.ciwsYaw && st.ciwsYaw[i] !== undefined) ? st.ciwsYaw[i] : ciwsDef[i];
  const cP = (st, i) => (st.ciwsPitch && st.ciwsPitch[i] !== undefined) ? st.ciwsPitch[i] : ciwsPDef[i];
  const CIWS_TR = [0, 1.55, 0], CIWS_MZ = [0, 1.36, 2.12];
  const ciwsXf = (st, i) => X.make(R.y(cY(st, i)), CIWS_P[i]);
  const ciwsElev = (st, i) => piv(R.x(-cP(st, i)), CIWS_TR);
  const GUN_TR = [0, 1.28, .95], GUN_MZ = [0, 1.28, 8.15];
  const gunXf = st => X.make(R.y(st.gunYaw || 0), GUN_P);
  const gunElev = st => piv(R.x(-(st.gunPitch || 0)), GUN_TR);

  function ddHull() {
    const P = [], Z = DD_Z, S = Z.map(ddSec);
    const pt = (i, key, s) => [s * S[i][key][0], S[i][key][1], Z[i]];
    for (const s of [-1, 1]) {
      P.push(...fpoly(Z.map((z, i) => pt(i, 'd', s)), (i, a, b) => sideN(a, b, s, 1.1), { al: 1 }));
      const kn = []; Z.forEach((z, i) => { if (z >= 14 && z < ZB) kn.push(pt(i, 'k', s)); });
      P.push(...fpoly(kn, (i, a, b) => sideN(a, b, s, .2), i => ({ al: .6 * sat((kn[i][2] - 14) / 26) })));
      const wl = []; Z.forEach((z, i) => { if (z <= ZST) wl.push(pt(i, 'w', s)); });
      P.push(...fpoly(wl, (i, a, b) => sideN(a, b, s, 0), { al: .8 }));
      for (const zf of [-66, -45, -26, -4, 16, 37, 55, 66]) {
        const q = ddSec(zf), pts = [[s * q.w[0], q.w[1], zf], [s * q.k[0], q.k[1], zf], [s * q.d[0], q.d[1], zf]];
        P.push(...fpoly(pts, V.norm([s, 0, zf > 40 ? (zf - 40) / 40 : 0]), F({ al: .22 })));
      }
      // hawse pipe + anchor
      const zh = 66.5, xh = hB(zh) - .05, yh = hD(zh) - 1.25;
      P.push(ring([s * xh, yh, zh], [s, .15, .5], .42, F({ n: 14 })));
      P.push(hex([[s * (xh + .02), yh - .55, zh - .5], [s * (xh + .02), yh - .55, zh + .5], [s * (xh - .1), yh - 1.7, zh + .3], [s * (xh - .1), yh - 1.7, zh - .3],
                  [s * (xh + .2), yh - .55, zh - .5], [s * (xh + .2), yh - .55, zh + .5], [s * (xh + .08), yh - 1.7, zh + .3], [s * (xh + .08), yh - 1.7, zh - .3]], F({ al: .6, pts: false })));
    }
    const stem = []; for (let k = 0; k <= 10; k++) { const z = ZST + (ZB - ZST) * k / 10; stem.push([0, hK0(z), z]); }
    P.push(line(stem, { w: 1, pts: false }));
    const t0 = ddSec(ZS);
    P.push(fl([-t0.d[0], t0.d[1], ZS], [t0.d[0], t0.d[1], ZS], V.norm([0, 1, -1]), { al: 1 }));
    P.push(fl([-t0.w[0], 0, ZS], [t0.w[0], 0, ZS], [0, 0, -1], { al: .8 }));
    for (const s of [-1, 1]) P.push(...fpoly([[s * t0.w[0], 0, ZS], [s * t0.k[0], t0.k[1], ZS], [s * t0.d[0], t0.d[1], ZS]], V.norm([s * .4, 0, -1]), { al: 1 }));
    // dots skin
    for (let i = 0; i < Z.length - 1; i++) {
      for (const s of [-1, 1]) {
        P.push(plate([pt(i, 'w', s), pt(i + 1, 'w', s), pt(i + 1, 'k', s), pt(i, 'k', s)], [s, 0, 0]));
        P.push(plate([pt(i, 'k', s), pt(i + 1, 'k', s), pt(i + 1, 'd', s), pt(i, 'd', s)], [s, 0, 0]));
      }
      const zm = (Z[i] + Z[i + 1]) / 2; let hw = 0;
      for (const h of DD_HOLES) if (zm > h[0] && zm < h[1]) hw = Math.max(hw, h[2]);
      const b0 = S[i].d[0], b1 = S[i + 1].d[0], y0 = S[i].d[1], y1 = S[i + 1].d[1];
      if (hw <= 0) P.push(plate([[-b0, y0, Z[i]], [b0, y0, Z[i]], [b1, y1, Z[i + 1]], [-b1, y1, Z[i + 1]]], [0, 1, 0]));
      else for (const s of [-1, 1]) if (Math.min(b0, b1) > hw + .05) P.push(plate([[s * hw, y0, Z[i]], [s * b0, y0, Z[i]], [s * b1, y1, Z[i + 1]], [s * hw, y1, Z[i + 1]]], [0, 1, 0]));
    }
    P.push(plate([[-t0.w[0], 0, ZS], [t0.w[0], 0, ZS], [t0.k[0], t0.k[1], ZS], [-t0.k[0], t0.k[1], ZS]], [0, 0, -1]));
    P.push(plate([[-t0.k[0], t0.k[1], ZS], [t0.k[0], t0.k[1], ZS], [t0.d[0], t0.d[1], ZS], [-t0.d[0], t0.d[1], ZS]], [0, 0, -1]));
    return P;
  }

  /* symmetric sloped block: base x +-xb over z [zb0, zb1] at heights (ya aft, yf fwd); top x +-xt over [zt0, zt1] at y1 */
  const sblock = (xb, zb0, zb1, ya, yf, xt, zt0, zt1, y1, o) => hex([[-xb, ya, zb0], [xb, ya, zb0], [xb, yf, zb1], [-xb, yf, zb1], [-xt, y1, zt0], [xt, y1, zt0], [xt, y1, zt1], [-xt, y1, zt1]], o);
  /* octagonal-plan house with sloped walls, as three hexes (front / middle / aft) */
  function octHouse(poly, y0, y1, inset, o) {
    const top = insetPoly(poly, inset);
    const B = poly.map(p => [p[0], y0, p[1]]), T = top.map(p => [p[0], y1, p[1]]);
    const idx = [[7, 2, 1, 0], [6, 3, 2, 7], [5, 4, 3, 6]], sk = [[2], [2, 4], [4]];
    return { prims: idx.map((q, k) => hex([...q.map(i => B[i]), ...q.map(i => T[i])], O({ skip: sk[k] }, o))), B, T };
  }
  /* point on a wall between bottom edge (b0, b1) and top edge (t0, t1) */
  const wallPt = (b0, b1, t0, t1, u, v, n, off) => V.mad(V.lerp(V.lerp(b0, b1, u), V.lerp(t0, t1, u), v), n || [0, 0, 0], off || 0);
  function wallN(b0, b1, t0, t1, cen) {
    let n = V.norm(V.cross(V.sub(b1, b0), V.sub(V.lerp(t0, t1, .5), V.lerp(b0, b1, .5))));
    const c = V.lerp(b0, b1, .5); if (V.dot(n, V.sub(c, cen)) < 0) n = V.mul(n, -1); return n;
  }
  function windows(b0, b1, t0, t1, cen, u0, u1, n, v0, v1, o) {
    const out = [], nn = wallN(b0, b1, t0, t1, cen), gap = .08 / Math.max(1, V.dist(b0, b1));
    for (let k = 0; k < n; k++) {
      const a = mix(u0, u1, k / n) + gap, b = mix(u0, u1, (k + 1) / n) - gap;
      out.push(panel([wallPt(b0, b1, t0, t1, a, v0, nn, .03), wallPt(b0, b1, t0, t1, b, v0, nn, .03), wallPt(b0, b1, t0, t1, b, v1, nn, .03), wallPt(b0, b1, t0, t1, a, v1, nn, .03)], O({ pts: false, fine: true, al: .6 }, o)));
    }
    return out;
  }
  function spg62(base, dir, o) {
    const out = [cyl(base, V.add(base, [0, 1.1, 0]), .42, O({ n: 12, gen: 0 }, o))];
    const c = V.add(base, [0, 1.75, 0]), d = V.norm(dir);
    out.push(lathe(V.mad(c, d, -.25), d, [[0, .1], [.12, .6], [.3, .98], [.48, 1.2]], O({ n: 22, gen: 8, rings: [1, 2, 3] }, o)));
    out.push(cyl(V.mad(c, d, -.25), V.mad(c, d, .9), .05, F({ n: 6, gen: 0 })));
    out.push(box(V.add(base, [-.55, 1.1, -.4]), V.add(base, [.55, 1.45, .4]), o));
    return out;
  }
  function ddSuper() {
    const P = [];
    P.push(sblock(8.25, 1.5, 35.5, hD(1.5) - .05, hD(35.5) - .05, 8.05, 1.8, 34.9, D01, { skip: [1] }));
    // 01-level roof only where it is exposed (not under the SPY house)
    P.push(plate([[-8.05, D01, 31.0], [8.05, D01, 31.0], [8.05, D01, 34.9], [-8.05, D01, 34.9]], [0, 1, 0]), plate([[-8.05, D01, 1.8], [8.05, D01, 1.8], [8.05, D01, 8.1], [-8.05, D01, 8.1]], [0, 1, 0]));
    for (const s of [-1, 1]) P.push(plate([[s * 8.0, D01, 8.1], [s * 8.05, D01, 8.1], [s * 8.05, D01, 31.0], [s * 8.0, D01, 31.0]], [0, 1, 0]));
    P.push(box([-1.7, D01, 31.4], [1.7, 11.0, 34.5]));
    const br = octHouse(SPY_HOUSE, SPY_Y[0], SPY_Y[1], SPY_IN);
    P.push(...br.prims);
    const cen = [0, 15, 19.5];
    // bridge windows along the top of the front wall, both front chamfers and the fwd sides
    P.push(...windows(br.B[0], br.B[1], br.T[0], br.T[1], cen, .04, .96, 6, .82, .95));
    P.push(...windows(br.B[1], br.B[2], br.T[1], br.T[2], cen, .06, .94, 3, .82, .95));
    P.push(...windows(br.B[7], br.B[0], br.T[7], br.T[0], cen, .06, .94, 3, .82, .95));
    P.push(...windows(br.B[2], br.B[3], br.T[2], br.T[3], cen, .02, .2, 3, .82, .95));
    P.push(...windows(br.B[6], br.B[7], br.T[6], br.T[7], cen, .8, .98, 3, .82, .95));
    // deck-level seams of the 02 / 03 levels
    for (const v of [.3, .62]) P.push(line([0, 1, 2, 3, 4, 5, 6, 7].map(i => V.lerp(br.B[i], br.T[i], v)).map(p => V.mad(p, V.norm([p[0], 0, p[2] - 19.5]), .02)), F({ closed: true, w: .28, pts: false })));
    for (const s of [-1, 1]) {
      P.push(box([s > 0 ? 6.5 : -9.8, 17.3, 24.0], [s > 0 ? 9.8 : -6.5, 18.5, 26.6]));
      P.push(line([[s * 9.8, 18.5, 24.0], [s * 9.8, 17.3, 24.6]], F({ w: .4, pts: false })));
      P.push(box([s > 0 ? 7.35 : -8.45, 11.6, 16.4], [s > 0 ? 8.45 : -7.35, 13.9, 21.2], F()));                    // SLQ-32 / SEWIP
      for (const [x, z, h] of [[5.95, -4.5, 7], [5.95, -15.5, 6], [7.9, 3.0, 5.5]]) P.push(line([[s * x, D01, z], [s * (x + .6), D01 + h, z]], F({ w: .5, pts: false })));
      P.push(box([s > 0 ? 7.4 : -8.4, D01, 3.2], [s > 0 ? 8.4 : -7.4, 12.2, 5.6], F({ al: .7 })));               // 01-level lockers
      // doors on the 01 level sides
      for (const z of [6.5, 14.5, -9.5, -19]) P.push(panel([[s * (z > 0 ? 8.03 : 6.28), hD(z) + .1, z - .45], [s * (z > 0 ? 8.03 : 6.28), hD(z) + .1, z + .45], [s * (z > 0 ? 7.95 : 6.2), hD(z) + 2.05, z + .45], [s * (z > 0 ? 7.95 : 6.2), hD(z) + 2.05, z - .45]], F({ pts: false, al: .5 })));
    }
    P.push(box([-2.3, 19.4, 16.8], [2.3, 20.6, 23.6]));
    P.push(...spg62([0, 19.4, 27.2], [0, 0, 1]));
    P.push(sblock(6.25, -23.5, 1.5, hD(-23.5) - .05, hD(1.5) - .05, 6.0, -23.2, 1.5, D01));
    P.push(sblock(8.6, -53, -34, hD(-53) - .05, hD(-34) - .05, 8.25, -52.8, -34.3, 13.2));
    P.push(box([-3.4, 13.2, -40.2], [3.4, 15.3, -34.6]));
    for (const s of [-1, 1]) P.push(...spg62([s * 1.8, 15.3, -37.4], [s * .707, 0, -.707]));
    P.push(box([-1.7, 13.2, -49.3], [1.7, 13.9, -45.7]));
    for (const s of [-1, 1]) {
      P.push(cyl([s * 6.4, 13.2, -37.6], [s * 6.4, 13.9, -37.6], .25, { n: 8, gen: 0 }));
      P.push(lathe([s * 6.4, 13.9, -37.6], [0, 1, 0], [[0, .95], [.35, .9], [.65, .7], [.88, .38], [.98, 0]], { n: 18, gen: 6, rings: [0, 2] }));
    }
    return P;
  }
  function ddSpy() {
    const P = [], rr = 1.95, c225 = Math.cos(PI / 8);
    for (const f of SPY_FACES) {
      const ptA = (a, r) => V.add(f.c, V.add(V.mul(f.h, Math.cos(a) * r), V.mul(f.u, Math.sin(a) * r)));
      const oct = r => { const p = []; for (let i = 0; i < 8; i++) p.push(ptA((i + .5) / 8 * TAU, r)); return p; };
      P.push(panel(oct(rr), { pts: false }));
      P.push(panel(oct(rr * .9), F({ pts: false, al: .45 })));
      const ap = rr * c225, s8 = rr * Math.sin(PI / 8);
      for (const y of [-.66, -.33, 0, .33, .66]) {
        const yy = y * ap, hw = Math.abs(yy) <= s8 ? ap : ap + s8 - Math.abs(yy);
        const q = V.add(f.c, V.mul(f.u, yy));
        P.push(line([V.mad(q, f.h, -hw * .88), V.mad(q, f.h, hw * .88)], F({ w: .18, pts: false })));
      }
      // dots: octagon as three plates, proud of the wall
      const H = (x, y) => V.add(f.c, V.add(V.mul(f.h, x), V.mul(f.u, y)));
      P.push(plate([H(-s8, -ap), H(s8, -ap), H(ap, -s8), H(-ap, -s8)], f.n, { ds: .55 }));
      P.push(plate([H(-ap, -s8), H(ap, -s8), H(ap, s8), H(-ap, s8)], f.n, { ds: .55 }));
      P.push(plate([H(-ap, s8), H(ap, s8), H(s8, ap), H(-s8, ap)], f.n, { ds: .55 }));
    }
    return P;
  }
  const MB = 20.6, MT = 38.0;
  const LEGS = [[[-1.7, MB, 22.9], [-.55, MT, 17.6]], [[1.7, MB, 22.9], [.55, MT, 17.6]], [[1.7, MB, 17.4], [.55, MT, 15.4]], [[-1.7, MB, 17.4], [-.55, MT, 15.4]]];
  const legAt = (k, y) => V.lerp(LEGS[k][0], LEGS[k][1], (y - MB) / (MT - MB));
  function ddMast() {
    const P = [];
    for (const [a, b] of LEGS) P.push(cyl(a, b, .2, { n: 8, gen: 0 }));
    const lv = [MB, 24.4, 28.2, 32.0, 35.2, MT];
    for (const y of lv.slice(1)) P.push(line([0, 1, 2, 3].map(k => legAt(k, y)), { closed: true, w: .7, pts: false }));
    for (let l = 0; l < lv.length - 1; l++) for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      P.push(line([legAt(k, lv[l]), legAt(k2, lv[l + 1])], F({ w: .32, pts: false })), line([legAt(k2, lv[l]), legAt(k, lv[l + 1])], F({ w: .32, pts: false })));
    }
    // SPS-67 platform
    P.push(box([-1.45, 28.0, 19.3], [1.45, 28.2, 22.8]));
    P.push(line([[-1.45, 29.1, 22.8], [1.45, 29.1, 22.8], [1.45, 29.1, 19.3]], F({ w: .4, pts: false })), line([[-1.45, 29.1, 22.8], [-1.45, 29.1, 19.3]], F({ w: .4, pts: false })));
    // yards, dipoles, lights
    const zy = V.lerp(legAt(0, 32), legAt(3, 32), .5)[2];
    P.push(cyl([-6.6, 32.0, zy], [6.6, 32.0, zy], .1, { n: 6, gen: 0 }));
    for (const s of [-1, 1]) {
      P.push(line([[s * 6.6, 32.0, zy], legAt(s > 0 ? 1 : 0, 28.2)], F({ w: .35 })), line([[s * 4.2, 32.0, zy], legAt(s > 0 ? 2 : 3, 28.2)], F({ w: .3 })));
      for (const x of [2.4, 3.9, 5.3, 6.4]) P.push(line([[s * x, 32.0, zy], [s * x, 30.5, zy]], F({ w: .5, pts: false })), line([[s * x - .18, 30.6, zy], [s * x + .18, 30.6, zy]], F({ w: .4, pts: false })));
      P.push(sphere([s * 6.75, 32.0, zy], .14, F({ pts: false })));
    }
    const zy2 = V.lerp(legAt(0, 35.2), legAt(3, 35.2), .5)[2];
    P.push(cyl([-3.4, 35.2, zy2], [3.4, 35.2, zy2], .07, { n: 6, gen: 0 }));
    for (const x of [-3.2, -1.9, 1.9, 3.2]) P.push(line([[x, 35.2, zy2], [x, 34.2, zy2]], F({ w: .45, pts: false })));
    // SPS-73 navigation radar (fixed here), top platform, TACAN, pole, whip
    const zf = legAt(0, 35.2)[2];
    P.push(box([-.3, 35.2, zf], [.3, 35.35, zf + .9]));
    P.push(cyl([0, 35.35, zf + .6], [0, 35.75, zf + .6], .12, F({ n: 8, gen: 0 })));
    P.push(box([-1.0, 35.75, zf + .52], [1.0, 35.98, zf + .68]));
    P.push(box([-1.0, MT, 14.9], [1.0, MT + .2, 18.1]));
    P.push(lathe([0, MT + .2, 16.5], [0, 1, 0], [[0, .5], [.3, .5], [.35, .42], [1.3, .42], [1.4, .3], [1.55, .02]], { n: 16, gen: 6, rings: [0, 1, 3, 4] }));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.push(line([[Math.cos(a) * .43, MT + .7, 16.5 + Math.sin(a) * .43], [Math.cos(a) * .43, MT + 1.45, 16.5 + Math.sin(a) * .43]], F({ w: .35, pts: false }))); }
    P.push(cyl([0, MT + 1.55, 16.5], [0, MT + 6.8, 16.5], .07, { n: 6, gen: 0 }));
    P.push(line([[0, MT + 6.8, 16.5], [0, MT + 9.4, 16.5]], { w: .8 }));
    P.push(line([[-.7, MT + 4.2, 16.5], [.7, MT + 4.2, 16.5]], F({ w: .6 })), line([[0, MT + 4.2, 15.8], [0, MT + 4.2, 17.2]], F({ w: .6 })));
    P.push(sphere([0, MT + 5.5, 16.5], .16, F({ pts: false })));
    // mast house whips
    for (const s of [-1, 1]) P.push(line([[s * 2.0, 20.6, 17.2], [s * 2.3, 27.5, 16.4]], F({ w: .45 })));
    return P;
  }
  function ddSps() {
    const P = [], c = PS;
    P.push(cyl(c, V.add(c, [0, .7, 0]), .22, { n: 10, gen: 0 }));
    P.push(cyl(V.add(c, [0, .7, 0]), V.add(c, [0, .95, 0]), .34, { n: 12, gen: 0 }));
    const y0 = c[1] + .98, y1 = c[1] + 1.8, zr = c[2] - .15, xs = [-1.35, -.8, -.27, .27, .8, 1.35];
    const zz = x => zr - x * x / (4 * 1.7);
    for (let k = 0; k < xs.length - 1; k++) {
      const a = xs[k], b = xs[k + 1];
      P.push(panel([[a, y0, zz(a)], [b, y0, zz(b)], [b, y1, zz(b)], [a, y1, zz(a)]], { hatch: 3 }));
    }
    const fz = zr + 1.25, fy = (y0 + y1) / 2;
    P.push(box([-.18, fy - .12, fz - .1], [.18, fy + .12, fz + .12]));
    P.push(line([[-.9, y0 + .05, zz(-.9)], [0, fy, fz]], F({ w: .5 })), line([[.9, y0 + .05, zz(.9)], [0, fy, fz]], F({ w: .5 })), line([[0, y1, zr], [0, fy + .1, fz]], F({ w: .5 })));
    P.push(line([[-1.35, y0, zz(-1.35) - .25], [1.35, y0, zz(1.35) - .25]], F({ w: .35, pts: false })));
    return P;
  }
  function ddStacks() {
    const P = [];
    for (const zc of STACK_Z) {
      const y0 = D01, y1 = 21.6;
      const b = [[-2.6, y0, zc - 4.2], [2.6, y0, zc - 4.2], [2.6, y0, zc + 4.2], [-2.6, y0, zc + 4.2]];
      const t = [[-2.05, y1, zc - 4.5], [2.05, y1, zc - 4.5], [2.05, y1, zc + 2.2], [-2.05, y1, zc + 2.2]];
      P.push(hex([...b, ...t]));
      P.push(box([-2.15, y1, zc - 4.6], [2.15, y1 + .6, zc + 2.3]));
      P.push(panel([[-1.9, y1 + .62, zc - .6], [1.9, y1 + .62, zc - .6], [1.9, y1 + .62, zc + 2.1], [-1.9, y1 + .62, zc + 2.1]], F({ hatch: 7, pts: false, al: .6 })));
      for (const s of [-1, 1]) {
        P.push(lathe([s * .95, y1 + .3, zc - 2.9], [0, 1, 0], [[0, .62], [1.25, .62], [1.55, .68]], { n: 18, gen: 4, rings: [1, 2] }));
        P.push(ring([s * .95, y1 + 1.5, zc - 2.9], [0, 1, 0], .5, F({ n: 16, al: .5 })));
        P.push(lathe([s * 1.05, y1 + .3, zc + .95], [0, 1, 0], [[0, .34], [.85, .34], [1.0, .38]], { n: 14, gen: 0, rings: [1, 2] }));
        // side louvres (combustion-air intakes) + uptake grilles near the top
        const bs = s > 0 ? [b[1], b[2], t[1], t[2]] : [b[0], b[3], t[0], t[3]];
        const n = [s, .1, 0];
        P.push(panel([wallPt(...bs, .12, .5, n, .03), wallPt(...bs, .7, .5, n, .03), wallPt(...bs, .7, .88, n, .03), wallPt(...bs, .12, .88, n, .03)], { pts: false, al: .8 }));
        P.push(panel([wallPt(...bs, .12, .5, n, .035), wallPt(...bs, .7, .5, n, .035), wallPt(...bs, .7, .88, n, .035), wallPt(...bs, .12, .88, n, .035)], F({ hatch: 7, pts: false, al: .45 })));
        P.push(panel([wallPt(...bs, .12, .12, n, .03), wallPt(...bs, .45, .12, n, .03), wallPt(...bs, .45, .4, n, .03), wallPt(...bs, .12, .4, n, .03)], F({ hatch: 5, pts: false, al: .55 })));
      }
      const fb = [b[3], b[2], t[3], t[2]], fn = [0, .2, 1];
      P.push(panel([wallPt(...fb, .2, .55, fn, .03), wallPt(...fb, .8, .55, fn, .03), wallPt(...fb, .8, .85, fn, .03), wallPt(...fb, .2, .85, fn, .03)], F({ hatch: 6, pts: false, al: .6 })));
    }
    return P;
  }
  /* Mk 45 Mod 4 in its own frame: origin at the mount centre on deck, barrel +Z */
  const GUN_HOUSE = [
    lathe([0, 0, 0], [0, 1, 0], [[0, 2.05], [.3, 1.95]], { n: 28, gen: 0 }),
    hex([[-1.6, .3, -2.45], [1.6, .3, -2.45], [1.35, .3, 1.35], [-1.35, .3, 1.35], [-1.25, 2.3, -2.2], [1.25, 2.3, -2.2], [.8, 2.3, .2], [-.8, 2.3, .2]]),
    hex([[-1.35, .3, 1.35], [1.35, .3, 1.35], [.5, .3, 2.15], [-.5, .3, 2.15], [-.8, 2.3, .2], [.8, 2.3, .2], [.28, 1.55, 1.95], [-.28, 1.55, 1.95]], { skip: [2] }),
    panel([[-.2, .7, 2.14], [.2, .7, 2.14], [.2, 1.62, 1.9], [-.2, 1.62, 1.9]], F({ pts: false, al: .6 })),
    line([[-1.25, 2.3, -1.2], [1.25, 2.3, -1.2]], F({ w: .4, pts: false })),
    box([-.5, 2.3, -1.9], [.5, 2.45, -1.2], F()),
    panel([[1.61, .6, -1.9], [1.61, .6, -.5], [1.4, 1.9, -.5], [1.4, 1.9, -1.9]], F({ pts: false, al: .45 })),
  ];
  function gunBarrel() {
    return [
      lathe([0, GUN_TR[1], GUN_TR[2] - .8], [0, 0, 1], [[0, .22], [1.2, .22], [1.45, .14], [7.2, .105], [8.0, .1]], { n: 12, gen: 0, rings: [0, 1, 2, 4] }),
      lathe([0, GUN_TR[1], GUN_TR[2] + .55], [0, 0, 1], [[0, .5], [.55, .24]], { n: 14, gen: 4 }),
      ring(GUN_MZ, [0, 0, 1], .07, F({ n: 8 })),
    ];
  }
  /* Phalanx 1B in its own frame: origin on the mount base, gun +Z at yaw 0 */
  const CIWS_BASE = [
    lathe([0, 0, 0], [0, 1, 0], [[0, .82], [.12, .82], [.18, .74], [.52, .72]], { n: 22, gen: 6 }),
    box([-.8, .52, -.38], [-.6, 1.8, .38]), box([.6, .52, -.38], [.8, 1.8, .38]),
    lathe([0, .52, 0], [0, 1, 0], [[0, .56], [.3, .5]], { n: 16, gen: 0, pts: false }),
    box([.82, .55, -.6], [1.12, 1.25, .1], F()),
  ];
  function ciwsElevating(spin) {
    const P = [];
    P.push(lathe([0, 1.9, -.28], [0, 1, 0], [[0, .6], [.55, .62], [1.05, .56], [1.42, .38], [1.62, .14], [1.68, 0]], { n: 22, gen: 8, rings: [0, 2, 3, 4] }));
    P.push(box([-.56, 1.5, -.92], [.56, 1.92, .42]));
    P.push(lathe([0, 1.18, -1.05], [0, 0, 1], [[0, .38], [1.35, .38]], { n: 18, gen: 6 }));
    P.push(lathe([0, CIWS_MZ[1], .1], [0, 0, 1], [[0, .22], [.55, .2], [.62, .14]], { n: 14, gen: 4 }));
    for (let k = 0; k < 6; k++) {
      const a = spin + k / 6 * TAU, x = Math.cos(a) * .115, y = Math.sin(a) * .115 + CIWS_MZ[1];
      P.push(cyl([x, y, .62], [x, y, CIWS_MZ[2]], .027, { n: 5, gen: 0 }));
    }
    for (const z of [1.25, 2.02]) P.push(lathe([0, CIWS_MZ[1], z], [0, 0, 1], [[0, .165], [.08, .165]], { n: 14, gen: 0 }));
    P.push(box([-1.02, 2.02, -.25], [-.66, 2.46, .3], F()));
    P.push(ring([-.84, 2.24, .31], [0, 0, 1], .12, F({ n: 10 })));
    P.push(box([-.3, 3.08, -.55], [.3, 3.25, -.1], F()));
    return P;
  }
  function ddCiws(i) {
    return st => [...CIWS_BASE, ...tps(ciwsElev(st, i), ciwsElevating(st.ciwsSpin || 0))];
  }
  /* Mk 41 VLS: module frames + per-cell hatches (hinged outboard) */
  function vlsStatic(fwd) {
    const P = [], rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z, y = hD(zc) + .06, mods = rows / 4;
    for (let m = 0; m < 4; m++) for (let r = 0; r < mods; r++) {
      const xm = (-3 + 2 * m) * 1.05, zm = zc + (mods === 1 ? 0 : (r ? -1.7 : 1.7));
      P.push(box([xm - 1.02, y - .3, zm - 1.68], [xm + 1.02, y, zm + 1.68], { pts: false }));
      P.push(panel([[xm - .19, y + .01, zm - 1.55], [xm + .19, y + .01, zm - 1.55], [xm + .19, y + .01, zm + 1.55], [xm - .19, y + .01, zm + 1.55]], F({ pts: false, al: .7, hatch: 6 })));
      P.push(plate([[xm - 1.02, y, zm - 1.68], [xm + 1.02, y, zm - 1.68], [xm + 1.02, y, zm + 1.68], [xm - 1.02, y, zm + 1.68]], [0, 1, 0], { ds: 2.6 }));
    }
    return P;
  }
  const VLS_ST = [null, null];
  function openMap(st) {
    const m = new Map(); const v = st.vlsOpen;
    if (v) for (const e of v) { if (Array.isArray(e)) m.set(e[0], sat(e[1])); else m.set(e, 1); }
    return m;
  }
  function vlsHatches(fwd, st) {
    const P = [], om = openMap(st), i0 = fwd ? 0 : 32, n = fwd ? 32 : 64, h = .3;
    for (let i = i0; i < i0 + n; i++) {
      const c = vlsCell(i), f = om.get(i) || 0, y = c.y + .02;
      const q = [[c.x - h, y, c.z - h], [c.x + h, y, c.z - h], [c.x + h, y, c.z + h], [c.x - h, y, c.z + h]];
      if (f <= 0) { P.push(panel(q, F({ pts: false })), plate(q.map(p => [p[0], p[1] + .02, p[2]]), [0, 1, 0], F()), panel(q.map(p => [c.x + (p[0] - c.x) * .72, p[1] + .005, c.z + (p[2] - c.z) * .72]), F({ pts: false, al: .35 }))); continue; }
      const hinge = [c.x + c.hs * h, y, c.z], T = piv(R.z(-c.hs * f * 105 * D2R), hinge);
      P.push(panel(q.map(p => X.ap(T, p)), F()));
      P.push(panel([[c.x - h, y - .01, c.z - h], [c.x + h, y - .01, c.z - h], [c.x + h, y - .01, c.z + h], [c.x - h, y - .01, c.z + h]], F({ pts: false, al: .8 })));
      P.push(panel([[c.x - .25, y - .4, c.z - .25], [c.x + .25, y - .4, c.z - .25], [c.x + .25, y - .4, c.z + .25], [c.x - .25, y - .4, c.z + .25]], F({ al: .55 })));
    }
    return P;
  }
  /* Mk 137 SRBOC launcher (6 tubes, 45 / 60 deg) and Mk 53 Nulka, outboard = +x */
  function srboc() {
    const P = [box([-.35, 0, -.5], [.35, .38, .5])];
    for (const [row, el] of [[0, 45], [1, 60]]) for (const z of [-.3, 0, .3]) {
      const d = [Math.cos(el * D2R), Math.sin(el * D2R), 0], b = [-.12 + row * .2, .4 + row * .12, z];
      P.push(cyl(b, V.mad(b, d, 1.0), .065, { n: 8, gen: 0 }));
    }
    return P;
  }
  function nulka() {
    const P = [box([-.45, 0, -.45], [.45, .3, .45])];
    for (const x of [-.2, .2]) for (const z of [-.2, .2]) P.push(box([x - .16, .3, z - .16], [x + .16, 1.85, z + .16]));
    return P;
  }
  function rhib() {
    const P = [];
    for (const s of [-1, 1]) {
      P.push(cyl([s * 1.05, .5, -3.3], [s * 1.05, .5, 1.6], .26, { n: 10, gen: 3 }));
      P.push(cyl([s * 1.05, .5, 1.6], [s * .1, .72, 3.45], .26, { n: 10, gen: 3 }));
    }
    P.push(hex([[-.25, 0, -3.3], [.25, 0, -3.3], [.05, .25, 3.2], [-.05, .25, 3.2], [-.95, .48, -3.3], [.95, .48, -3.3], [.2, .6, 3.2], [-.2, .6, 3.2]], { al: .7 }));
    P.push(box([-.35, .5, -.3], [.35, 1.35, .45], F()));
    P.push(line([[-.35, 1.35, .45], [-.3, 1.75, .6], [.3, 1.75, .6], [.35, 1.35, .45]], F({ w: .5 })));
    P.push(box([-.5, .5, -2.9], [.5, .95, -2.2], F()));
    P.push(line([[-.8, .8, -3.1], [-.8, 1.9, -2.6], [.8, 1.9, -2.6], [.8, .8, -3.1]], F({ w: .4, pts: false })));
    return P;
  }
  function ddDecoys() {
    const P = [];
    for (const s of [-1, 1]) for (const z of STACK_Z) P.push(...tps(X.make(s > 0 ? R.I() : R.y(PI), [s * 4.9, D01, z]), srboc()));
    for (const s of [-1, 1]) P.push(...tps(X.make(R.I(), [s * 4.2, D01, -7.4]), nulka()));
    return P;
  }
  function ddBoats() {
    const P = [];
    for (const s of [-1, 1]) {
      const zc = -10.2, yb = hD(zc) + .45;
      P.push(...tps(X.make(R.I(), [s * 8.0, yb, zc]), rhib()));
      for (const dz of [-2.2, 1.8]) P.push(box([s * 7.4, hD(zc), zc + dz - .25], [s * 8.6, yb + .1, zc + dz + .25], F()));
      P.push(cyl([s * 5.95, D01, zc], [s * 5.95, 13.0, zc], .16, { n: 8, gen: 0 }));
      P.push(cyl([s * 5.95, 13.0, zc], [s * 8.0, 13.55, zc], .12, { n: 8, gen: 0 }));
      P.push(line([[s * 8.0, 13.5, zc], [s * 8.0, yb + 1.9, zc]], F({ w: .5, pts: false })));
    }
    return P;
  }
  function ddArms() {
    const P = [];
    for (const s of [-1, 1]) {
      const b = [s * 4.6, D01, -22.4];
      P.push(cyl(b, V.add(b, [0, .7, 0]), .45, { n: 12, gen: 0 }));
      P.push(box(V.add(b, [-.3, .7, -.5]), V.add(b, [.3, 1.2, .5])));
      P.push(cyl(V.add(b, [0, .95, .5]), V.add(b, [s * .5, 1.05, 2.4]), .05, { n: 6, gen: 0 }));
      // Mk 32 SVTT beside the aft launcher
      const t = [s * 7.3, hD(VA_Z) + .05, VA_Z + 1.0], d = V.norm([s * .8, 0, .6]);
      P.push(cyl(t, V.add(t, [0, .75, 0]), .22, { n: 10, gen: 0 }));
      for (const [dx, dy] of [[-.22, .98], [.22, .98], [0, 1.36]]) {
        const side = V.norm([d[2], 0, -d[0]]), c0 = V.add(V.mad(t, side, dx), [0, dy, 0]);
        P.push(cyl(V.mad(c0, d, -1.1), V.mad(c0, d, 1.9), .19, { n: 10, gen: 0 }));
      }
    }
    P.push(line([[0, hD(77.2), 77.2], [0, hD(77.2) + 3.4, 77.1]], { w: .8 }));
    P.push(line([[0, hD(ZS) + .1, ZS + .3], [0, hD(ZS) + 4.2, ZS + .4]], F({ w: .6 })));
    for (const s of [-1, 1]) P.push(lathe([s * 1.4, hD(68.5), 68.5], [0, 1, 0], [[0, .42], [.2, .36], [.5, .36], [.58, .44]], { n: 14, gen: 4, rings: [0, 3] }));
    P.push(box([-.9, hD(71.5), 70.8], [.9, hD(71.5) + .6, 72.2], F()));
    for (const s of [-1, 1]) P.push(line([[s * 1.4, hD(68.5) + .3, 68.5], [s * .5, hD(66) + .1, 66], [s * .4, hD(60) + .05, 60]], F({ w: .45, pts: false })));
    return P;
  }
  function ddHangarStatic() {
    const P = [], z = -53.05, y0 = hD(-53) + .02, y1 = y0 + 5.5;
    for (const s of [-1, 1]) P.push(panel([[s * .55, y0, z], [s * 7.0, y0, z], [s * 7.0, y1 + .12, z], [s * .55, y1 + .12, z]], { pts: false, al: .8 }));
    P.push(line([[-8.4, y1 + .9, z - .02], [8.4, y1 + .9, z - .02]], F({ w: .4, pts: false })));
    return P;
  }
  function ddHangarDoors(st) {
    const P = [], z = -53.1, y0 = hD(-53) + .02, y1 = y0 + 5.5, op = sat(st.hangar || 0), yb = mix(y0, y1 - .3, op);
    for (const s of [-1, 1]) {
      const xa = s * .7, xb = s * 6.85;
      P.push(panel([[xa, yb, z], [xb, yb, z], [xb, y1, z], [xa, y1, z]], { al: .9 }));
      const n = Math.max(1, Math.round((y1 - yb) / .55));
      for (let k = 1; k < n; k++) { const y = mix(yb, y1, k / n); P.push(line([[xa, y, z], [xb, y, z]], F({ w: .3, pts: false }))); }
    }
    return P;
  }
  function ddDeck() {
    const P = [], yz = z => hD(z) + .03, c = [0, 0, HELO_Z], r = 3.1, circ = [];
    for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; circ.push([Math.cos(a) * r, yz(HELO_Z + Math.sin(a) * r), HELO_Z + Math.sin(a) * r]); }
    P.push(line(circ, { closed: true, w: .75, pts: false }));
    const cl = []; for (let z = -77.2; z <= -53.4; z += 2) cl.push([0, yz(z), z]);
    P.push(line(cl, { w: .55, pts: false }));
    P.push(line([[-7, yz(HELO_Z), HELO_Z], [7, yz(HELO_Z), HELO_Z]], { w: .45, pts: false }));
    for (const x of [-.35, .35]) P.push(line([[x, yz(-60), -60], [x, yz(-53.4), -53.4]], F({ w: .45, pts: false })));
    for (const s of [-1, 1]) {
      const ed = []; for (let z = -77.2; z <= -53.4; z += 2) ed.push([s * (hB(z) - .6), yz(z), z]);
      P.push(line(ed, F({ w: .4, pts: false })));
      // deck-edge safety nets
      const net = []; for (let z = -77.0; z <= -53.6; z += 2.34) net.push([s * (hB(z) + 1.4), hD(z) - .35, z]);
      P.push(line(net, F({ w: .45, pts: false })));
      for (const p of net) P.push(line([[s * (hB(p[2]) - .02), hD(p[2]), p[2]], p], F({ w: .3, pts: false })));
    }
    for (const z of [-75, -70, -60, -56]) for (const s of [-1, 1]) P.push(sphere([s * (hB(z) - .9), yz(z) + .05, z], .09, F({ pts: false, n: 8 })));
    return P;
  }
  function ddRails() {
    const P = [];
    for (const s of [-1, 1]) {
      const comb = [], mid = [];
      for (let z = -52.6; z <= 75.8; z += 3.0) {
        const x = s * (hB(z) - .15), y = hD(z);
        comb.push([x, y + 1.0, z], [x, y, z], [x, y + 1.0, z]); mid.push([x, y + .5, z]);
      }
      P.push(line(comb, F({ w: .34 })), line(mid, F({ w: .2, pts: false })));
    }
    const bow = []; for (let z = 72; z <= 77.2; z += .6) bow.push([-(hB(z) - .15), hD(z) + 1.0, z]);
    for (let z = 77.2; z >= 72; z -= .6) bow.push([hB(z) - .15, hD(z) + 1.0, z]);
    P.push(line(bow, F({ w: .45 })));
    return P;
  }

  let DD_CACHE = null;
  function ddBuild() {
    if (DD_CACHE) return DD_CACHE;
    const vF = vlsStatic(true), vA = vlsStatic(false), hs = ddHangarStatic();
    DD_CACHE = {
      hull: ddHull(), super: ddSuper(), mast: ddMast(), arms: ddArms(), spy: ddSpy(), stacks: ddStacks(), sps: ddSps(),
      decoys: ddDecoys(), boats: ddBoats(), deck: ddDeck(), rails: ddRails(), vF, vA, hs,
      gunHouse: GUN_HOUSE,
    };
    return DD_CACHE;
  }
  HD.destroyer = function destroyer() {
    const C = ddBuild();
    return {
      name: 'destroyer', L: 155.2, B: 20, D: 6.5,
      parts: [
        { name: 'hull', label: 'Hull · DDG-51 Arleigh Burke Flight IIA', prims: C.hull },
        { name: 'super', label: 'Superstructure · bridge', prims: C.super },
        { name: 'mast', label: 'Raked mast · yardarms · URN-25 TACAN', prims: C.mast },
        { name: 'arms', label: 'Mk 38 25 mm · Mk 32 SVTT', prims: C.arms },
        { name: 'spy', label: 'AN/SPY-1D(V) arrays ×4', prims: C.spy },
        { name: 'stacks', label: 'Uptakes ×2 · LM2500', prims: C.stacks },
        { name: 'sps', label: 'AN/SPS-67(V)3 surface search', prims: C.sps, xf: st => piv(R.y(st.sps || 0), PS) },
        { name: 'gun', label: 'Mk 45 Mod 4 5"/62', prims: [], dyn: st => [...C.gunHouse, ...tps(gunElev(st), gunBarrel())], xf: gunXf },
        { name: 'vlsF', label: 'Mk 41 VLS · 32 cells', prims: [], dyn: st => [...C.vF, ...vlsHatches(true, st)] },
        { name: 'vlsA', label: 'Mk 41 VLS · 64 cells', prims: [], dyn: st => [...C.vA, ...vlsHatches(false, st)] },
        { name: 'ciwsF', label: 'Phalanx CIWS Block 1B', prims: [], dyn: ddCiws(0), xf: st => ciwsXf(st, 0) },
        { name: 'ciwsA', label: 'Phalanx CIWS Block 1B', prims: [], dyn: ddCiws(1), xf: st => ciwsXf(st, 1) },
        { name: 'decoys', label: 'Mk 36 SRBOC · Mk 53 Nulka', prims: C.decoys },
        { name: 'boats', label: '7 m RHIB ×2 · davits', prims: C.boats },
        { name: 'hangar', label: 'Twin hangar', prims: [], dyn: st => [...C.hs, ...ddHangarDoors(st)] },
        { name: 'deck', label: 'Flight deck', prims: C.deck },
        { name: 'rails', label: 'Lifelines', prims: C.rails },
      ],
    };
  };
  HD.destroyer.A = {
    stacks: STACK_Z.map(zc => [0, 23.15, zc - 2.9]),
    vls: i => { const c = vlsCell(i); return [c.x, c.y, c.z]; },
    ciws: (st, i) => X.ap(ciwsXf(st || {}, i), X.ap(ciwsElev(st || {}, i), CIWS_MZ)),
    ciwsDir: (st, i) => X.dir(ciwsXf(st || {}, i), X.dir(ciwsElev(st || {}, i), [0, 0, 1])),
    gun: st => X.ap(gunXf(st || {}), X.ap(gunElev(st || {}), GUN_MZ)),
    gunDir: st => X.dir(gunXf(st || {}), X.dir(gunElev(st || {}), [0, 0, 1])),
    spy: SPY_FACES.map(f => f.c.slice()),
    spyN: SPY_FACES.map(f => f.n.slice()),
    heloSpot: [0, hD(HELO_Z) + .03, HELO_Z],
    stern: [0, hD(ZS), ZS], bow: [0, hD(ZB), ZB],
    sps: [PS[0], PS[1] + 1.4, PS[2]], mastTop: [0, MT + 9.4, 16.5], bridge: [0, 18.4, 29.9],
    hangar: [0, hD(-53) + 2.8, -53.1], deckY: hD,
  };

  /* ======================================================================
     MH-60R Seahawk · origin on the ground under the rotor mast, nose +Z
     ====================================================================== */
  const HELO_HC = [0, 3.95, 0], HELO_TR = [.3, 3.64, -9.95], HELO_TRA = V.norm([1, Math.tan(20 * D2R), 0]);
  const HELO_R = 8.18;
  let HELO_CACHE = null;
  function heloBuild() {
    if (HELO_CACHE) return HELO_CACHE;
    const N = 16, FU = [], TL = [], G = [], SN = [], PY = [];
    const ST = [[5.5, .1, 1.18, 1.4, 2], [5.3, .5, .92, 1.8, 2.3], [4.7, .86, .7, 2.14, 2.7], [3.7, 1.1, .58, 2.46, 3.3], [2.35, 1.18, .55, 2.58, 3.8], [0, 1.2, .55, 2.62, 4], [-1.9, 1.16, .6, 2.6, 3.8], [-3.1, .98, .92, 2.58, 3.2], [-4.3, .68, 1.42, 2.55, 2.7], [-6.6, .48, 1.78, 2.56, 2.4], [-8.9, .32, 2.02, 2.6, 2.2]];
    const K = skin(ST.map(q => sec(q[0], q[1], q[2], q[3], q[4], N)));
    FU.push(...loft(K, { lines: [0, 2, 4, 6, 8, 10, 12, 14], fineJ: [2, 6, 10, 14], rings: [2, 4, 7], al: .85, ral: .4 }));
    const SL = (uv, closed, al) => FU.push(...(uv.length === 4 && closed ? [squad(K, uv, F({ al }))] : sline(K, uv, closed, F({ al }))));
    for (const m of [1, -1]) {
      const vv = v => m > 0 ? v : N - v;
      SL([[1.35, vv(.2)], [1.35, vv(2.7)], [2.75, vv(3.1)], [2.95, vv(.2)]], true, .75);
      SL([[3.0, vv(2.7)], [3.0, vv(4.3)], [3.85, vv(4.4)], [3.85, vv(2.7)]], true, .55);
      SL([[1.45, vv(5.2)], [1.6, vv(7.0)], [2.45, vv(7.0)], [2.35, vv(5.0)]], true, .45);
      SL([[2.92, vv(2.5)], [2.92, vv(6.9)], [4.02, vv(6.9)], [4.02, vv(2.5)]], true, .35);
    }
    SL([[4.35, 2.9], [4.35, 6.8], [5.55, 6.8], [5.55, 2.9]], true, .5);
    SL([[4.55, 3.2], [4.55, 4.5], [5.1, 4.5], [5.1, 3.2]], true, .4);
    SL([[4.4, N - 3.2], [4.4, N - 4.5], [5.0, N - 4.5], [5.0, N - 3.2]], true, .4);
    SL([[5.2, N - 3.3], [5.2, N - 4.4], [5.7, N - 4.4], [5.7, N - 3.3]], true, .35);
    const HS = [[2.55, .42, 2.52, 2.72, 3], [1.9, .6, 2.52, 3.3, 3.4], [-.9, .62, 2.52, 3.38, 3.4], [-2.6, .5, 2.5, 3.12, 3], [-3.9, .28, 2.48, 2.64, 2.5]];
    const KH = skin(HS.map(q => arc(q[0], q[1], q[2], q[3], q[4], 9)), true);
    FU.push(...loft(KH, { lines: [0, 2, 4, 6, 8], rings: [1, 3], al: .75, ral: .45 }));
    for (const s of [-1, 1]) {
      // T700 engine nacelles either side of the transmission fairing, IR-suppressed exhausts angled outboard
      FU.push(lathe([s * .78, 2.98, -1.75], [0, 0, 1], [[0, .2], [.35, .34], [2.7, .36], [3.25, .3], [3.35, .27]], { n: 16, gen: 4, rings: [1, 3] }));
      FU.push(ring([s * .78, 2.98, 1.6], [0, 0, 1], .2, F({ n: 12 })));
      FU.push(lathe([s * .78, 2.98, 1.2], [0, 0, 1], [[0, .1], [.35, .16]], F({ n: 10, gen: 4 })));
      FU.push(cyl([s * .95, 2.98, -1.6], [s * 1.34, 3.02, -2.35], .2, { n: 10, gen: 3 }));
      FU.push(ring([s * 1.34, 3.02, -2.35], V.norm([s * .39, .04, -.75]), .23, F({ n: 12 })));
      FU.push(line([[s * .78, 3.34, .9], [s * .78, 3.36, -1.2]], F({ w: .4, pts: false })));
      FU.push(box([s * 1.14, 1.25, 4.1], [s * 1.2, 1.6, 4.5], F()));             // ESM
    }
    FU.push(cyl([0, 3.3, 0], [0, 3.82, 0], .16, { n: 10, gen: 0 }));
    FU.push(line([[0, 2.6, -5.5], [0, 3.05, -5.9]], F({ w: .6 })), line([[0, 2.55, -3.8], [0, 2.95, -4.1]], F({ w: .5 })));
    FU.push(box([-1.26, 1.05, -2.3], [-1.18, 1.95, -1.1], F()));          // sonobuoy launcher
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) FU.push(ring([-1.27, 1.25 + a * .28, -2.05 + b * .38], [-1, 0, 0], .09, F({ n: 8 })));
    // tail pylon + stabilator
    TL.push(hex([[-.2, 2.1, -9.1], [.2, 2.1, -9.1], [.2, 2.1, -7.75], [-.2, 2.1, -7.75], [-.12, 4.5, -10.55], [.12, 4.5, -10.55], [.12, 4.5, -9.6], [-.12, 4.5, -9.6]]));
    TL.push(line([[-.13, 2.4, -8.1], [-.1, 4.4, -9.75]], F({ w: .35, pts: false })), line([[.13, 2.4, -8.1], [.1, 4.4, -9.75]], F({ w: .35, pts: false })));
    TL.push(slab([[-2.2, 2.32, -9.72], [2.2, 2.32, -9.72], [2.2, 2.32, -8.86], [-2.2, 2.32, -8.86]], .09));
    for (const s of [-1, 1]) TL.push(line([[s * 2.2, 2.3, -9.72], [s * 2.2, 2.62, -9.5]], F({ w: .5 })));
    TL.push(lathe(V.mad(HELO_TR, HELO_TRA, -.34), HELO_TRA, [[0, .2], [.22, .18], [.3, .1]], { n: 12, gen: 4 }));
    TL.push(line([[0, 4.5, -10.3], [0, 4.52, -11.0]], F({ w: .5 })), sphere([0, 4.53, -10.1], .06, F({ pts: false, n: 8 })));
    // gear
    for (const s of [-1, 1]) {
      G.push(lathe([s * 1.28, .37, 2.4], [s, 0, 0], [[0, .2], [.025, .37], [.18, .37], [.205, .2]], { n: 16, gen: 6, caps: true }));
      G.push(cyl([s * 1.08, 1.05, 2.8], [s * 1.36, .37, 2.4], .07, { n: 8, gen: 0 }));
      G.push(cyl([s * 1.06, .95, 1.75], [s * 1.36, .45, 2.35], .05, { n: 6, gen: 0 }));
      G.push(box([s * 1.08, .8, 2.2], [s * 1.28, 1.2, 3.1], F()));
      G.push(lathe([s * .07, .25, -4.35], [s, 0, 0], [[0, .13], [.02, .25], [.12, .25], [.14, .13]], { n: 12, gen: 4, caps: true }));
    }
    G.push(cyl([0, 1.3, -3.95], [0, .25, -4.35], .06, { n: 8, gen: 0 }), cyl([0, 1.2, -3.4], [0, .5, -4.3], .04, F({ n: 6, gen: 0 })));
    // sensors
    SN.push(cyl([0, .8, 4.95], [0, .72, 4.95], .09, F({ n: 8, gen: 0 })));
    SN.push(sphere([0, .5, 4.95], .24));
    SN.push(ring([0, .5, 5.19], [0, -.35, 1], .11, F({ n: 12 })));
    SN.push(lathe([0, .55, .6], [0, -1, 0], [[0, .7], [.1, .68], [.2, .45], [.24, 0]], { n: 20, gen: 6 }));
    // pylons + stores
    for (const s of [-1, 1]) {
      PY.push(slab([[s * 1.12, 1.9, -1.55], [s * 2.2, 1.9, -1.55], [s * 2.2, 1.9, -.55], [s * 1.12, 1.9, -.55]], .12));
      PY.push(box([s * 1.95, 1.55, -1.7], [s * 2.1, 1.84, -.4]));
    }
    PY.push(lathe([-2.03, 1.33, -2.45], [0, 0, 1], [[0, .08], [.2, .16], [2.35, .16], [2.62, .08], [2.7, 0]], F({ n: 12, gen: 4, rings: [1, 2] })));
    for (const y of [1.3, 1.08]) PY.push(lathe([2.03, y, -1.9], [0, 0, 1], [[0, .09], [1.45, .09], [1.62, 0]], F({ n: 10, gen: 0, rings: [0] })));
    HELO_CACHE = { FU, TL, G, SN, PY };
    return HELO_CACHE;
  }
  function heloRotor(st) {
    const P = [], dr = st.droop !== undefined ? sat(st.droop) : 0, cone = .05 * (1 - dr), HC = HELO_HC;
    const rs = [.8, 1.6, 3.2, 4.8, 6.4, 7.55, HELO_R];
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * PI / 2, u = [Math.sin(a), 0, Math.cos(a)], le = [-Math.cos(a), 0, Math.sin(a)];
      const yAt = r => HC[1] + .14 + cone * r - dr * .95 * Math.pow(r / HELO_R, 2.2);
      const edge = (r, side) => {
        const tip = Math.max(0, r - 7.55), ch = .53 - tip / (HELO_R - 7.55) * .15, sw = tip * Math.tan(20 * D2R);
        const off = side > 0 ? ch * .25 - sw : -ch * .75 - sw * .6;
        return [u[0] * r + le[0] * off, yAt(r) + (side > 0 ? .012 : -.012), u[2] * r + le[2] * off];
      };
      const L = rs.map(r => edge(r, 1)), T = rs.map(r => edge(r, -1));
      P.push(line([...L, ...T.slice().reverse()], { closed: true, w: .85, pts: false }));
      for (let i = 0; i < rs.length - 1; i++) P.push(panel([L[i], L[i + 1], T[i + 1], T[i]], { al: 0, dot: true }));
      P.push(line([edge(7.55, 1), edge(7.55, -1)], F({ w: .35, pts: false })));
      // grip, damper, pitch horn + link, bifilar arm
      P.push(cyl(V.mad([0, HC[1] + .06, 0], u, .22), V.mad([0, HC[1] + .12, 0], u, .82), .12, F({ n: 8, gen: 0 })));
      P.push(cyl(V.add(V.mad([0, HC[1] + .05, 0], u, .32), V.mul(le, .2)), V.add(V.mad([0, HC[1] + .1, 0], u, .72), V.mul(le, .14)), .045, F({ n: 6, gen: 0, sil: false, al: .7 })));
      P.push(line([V.add(V.mad([0, HC[1] - .02, 0], u, .52), V.mul(le, -.22)), V.add(V.mad([0, 3.55, 0], u, .42), V.mul(le, -.2))], F({ w: .6 })));
      const ab = a + PI / 4, ub = [Math.sin(ab), 0, Math.cos(ab)];
      P.push(cyl([0, HC[1] + .36, 0], V.mad([0, HC[1] + .36, 0], ub, .5), .035, F({ n: 6, gen: 0 })));
      P.push(cyl(V.mad([0, HC[1] + .3, 0], ub, .52), V.mad([0, HC[1] + .42, 0], ub, .52), .07, F({ n: 8, gen: 0, al: .8 })));
    }
    P.push(lathe([0, HC[1] - .12, 0], [0, 1, 0], [[0, .34], [.1, .42], [.22, .42], [.3, .3], [.34, .05]], { n: 16, gen: 4, rings: [1, 3] }));
    P.push(lathe([0, 3.51, 0], [0, 1, 0], [[0, .45], [.08, .45]], F({ n: 18, gen: 0, al: .6 })));
    P.push(lathe([0, HC[1] + .34, 0], [0, 1, 0], [[0, .12], [.12, .1], [.18, 0]], F({ n: 10, gen: 0 })));
    return P;
  }
  function heloTail() {
    const P = [], e1 = V.norm(V.cross(HELO_TRA, [0, 0, 1])), e2 = V.cross(HELO_TRA, e1), c = HELO_TR;
    for (let k = 0; k < 4; k++) {
      const a = k * PI / 2, d = V.add(V.mul(e1, Math.cos(a)), V.mul(e2, Math.sin(a))), cd = V.add(V.mul(e1, -Math.sin(a)), V.mul(e2, Math.cos(a)));
      const q = [V.add(V.mad(c, d, .18), V.mul(cd, .13)), V.add(V.mad(c, d, 1.675), V.mul(cd, .11)), V.add(V.mad(c, d, 1.675), V.mul(cd, -.13)), V.add(V.mad(c, d, .18), V.mul(cd, -.13))];
      P.push(panel(q.map((p, i) => V.mad(p, HELO_TRA, i === 1 || i === 2 ? .04 : 0)), { edge: .85 }));
    }
    P.push(lathe(V.mad(c, HELO_TRA, -.05), HELO_TRA, [[0, .16], [.18, .12], [.26, 0]], { n: 12, gen: 4 }));
    return P;
  }
  HD.helo = function helo() {
    const C = heloBuild(), TP = heloTail();
    return {
      name: 'helo', L: 19.76,
      parts: [
        { name: 'fuselage', label: 'MH-60R Seahawk', prims: C.FU },
        { name: 'rotor', label: 'Main rotor · 4 blades · 16.36 m', prims: [], dyn: heloRotor, xf: st => piv(R.y(-(st.rotor || 0)), HELO_HC) },
        { name: 'tailrotor', label: 'Tail rotor · canted 20°', prims: TP, xf: st => piv(Rax(HELO_TRA, st.trotor || 0), HELO_TR) },
        { name: 'tail', label: 'Tail pylon · stabilator', prims: C.TL },
        { name: 'gear', label: 'Landing gear', prims: C.G },
        { name: 'sensors', label: 'MTS FLIR · AN/APS-153 radome', prims: C.SN },
        { name: 'pylons', label: 'Weapon pylons · Mk 54 · AGM-114', prims: C.PY },
      ],
    };
  };
  HD.helo.HUB = HELO_HC.slice(); HD.helo.TAIL_HUB = HELO_TR.slice(); HD.helo.TAIL_AXIS = HELO_TRA.slice(); HD.helo.R = HELO_R;

  /* ======================================================================
     F/A-18E Super Hornet · origin mid-body, nose +Z, gear up
     ====================================================================== */
  const FT_NZ = [[.62, -.12, -9.0], [-.62, -.12, -9.0]];
  const FT_FAN = [[.98, -.36, -.1], [-.98, -.36, -.1]];
  const FT_MOUTH = [[.9, .04, 2.5], [1.66, .04, 2.12], [1.56, -.8, 1.7], [.9, -.8, 2.08]];
  let FT_CACHE = null;
  function ftBuild() {
    if (FT_CACHE) return FT_CACHE;
    const N = 16, FU = [], LX = [], WG = [], TL = [], SB = [], CN = [], IN = [], PY = [];
    // z, top half-width, bottom half-width, bottom, top, exponent
    const ST = [[9.15, .03, .03, -.03, .03, 2], [8.75, .2, .2, -.2, .2, 2], [8.1, .36, .36, -.34, .36, 2], [7.2, .47, .5, -.46, .48, 2.2], [6.1, .55, .62, -.58, .6, 2.5], [5.0, .6, .72, -.68, .66, 2.8], [3.8, .64, .8, -.76, .7, 3],
                [2.55, .68, .92, -.84, .7, 3.2], [2.0, .7, 1.58, -.86, .7, 3.6], [.6, .74, 1.68, -.86, .68, 3.8], [-1.5, .82, 1.66, -.82, .66, 3.8], [-3.6, .98, 1.5, -.74, .62, 3.6], [-5.8, 1.08, 1.3, -.66, .56, 3.4], [-7.8, 1.1, 1.2, -.58, .5, 3.2]];
    const K = skin(ST.map(q => sec2(q[0], q[1], q[2], q[3], q[4], q[5], N)));
    FU.push(...loft(K, { lines: [0, 2, 4, 6, 8, 10, 12, 14], fineJ: [2, 6, 10, 14], rings: [4, 12], al: .8, ral: .45 }));
    FU.push(...sline(K, [[4.1, 0], [4.1, 4], [4.1, 8], [4.1, 12]], true, F({ al: .35 })));           // radome joint
    for (let a = 0; a < 3; a++) FU.push(ring(V.add(skAt(K, 2.1, 0), [.09 * (a - 1), .02, 0]), [0, .3, 1], .03, F({ n: 6 })));
    // gear doors, refuelling-probe door, access panels (close-up detail)
    FU.push(squad(K, [[3.6, 7.3], [3.6, 8.7], [4.7, 8.7], [4.7, 7.3]], F({ al: .45 })));
    for (const m of [1, -1]) {
      const vv = v => m > 0 ? v : N - v;
      FU.push(squad(K, [[9.3, vv(6.2)], [9.3, vv(7.5)], [10.6, vv(7.5)], [10.6, vv(6.2)]], F({ al: .4 })));
      FU.push(squad(K, [[5.4, vv(2.2)], [5.4, vv(3.4)], [6.6, vv(3.4)], [6.6, vv(2.2)]], F({ al: .3 })));
      FU.push(squad(K, [[11.2, vv(1.2)], [11.2, vv(2.6)], [12.4, vv(2.6)], [12.4, vv(1.2)]], F({ al: .3 })));
      const lx = x => m * x;
      FU.push(fquad([[lx(1.02), .17, 3.6], [lx(1.3), .15, 3.6], [lx(1.34), .15, 2.7], [lx(1.06), .17, 2.7]], [0, 1, 0], F({ al: .45 })));
    }
    FU.push(squad(K, [[3.2, 1.6], [3.2, 2.4], [4.3, 2.4], [4.3, 1.6]], F({ al: .4 })));
    FU.push(line([[0, .68, -1.2], [0, .95, -1.6], [0, .66, -1.9]], F({ w: .5 })));
    FU.push(line([[0, -.8, -.5], [0, -1.05, -.9], [0, -.8, -1.2]], F({ w: .5 })));
    // LEX (outline wire, plates dots)
    for (const s of [1, -1]) {
      const pts = [[.58, .22, 6.2], [.95, .18, 4.4], [1.45, .14, 2.9], [1.9, .1, 1.6], [2.08, .08, .5]].map(p => [s * p[0], p[1], p[2]]);
      LX.push(line(pts, { w: .95, pts: false }));
      const inner = [[.58, .22, 6.2], [.7, .2, 4.4], [.86, .16, 2.9], [.98, .12, 1.6], [1.06, .1, .88]].map(p => [s * p[0], p[1], p[2]]);
      for (let i = 0; i < pts.length - 1; i++) LX.push(plate([inner[i], pts[i], pts[i + 1], inner[i + 1]], [0, 1, 0]));
      LX.push(...sline(K, [[5.6, s > 0 ? 3.3 : N - 3.3], [8.3, s > 0 ? 3.55 : N - 3.55]], false, F({ al: .3 })));
    }
    // wings (inner + outer panel, dogtooth at the fold), rails, control-surface lines
    const wLE = x => .9 - (x - 1.05) * Math.tan(20 * D2R), wTE = x => -4.5 + (x - 1.05) * (1.6 / 5.2), wY = x => .08 - (x - 1.05) * .03;
    for (const s of [1, -1]) {
      const S = p => [s * p[0], p[1], p[2]];
      const inner = [[1.05, wY(1.05), wLE(1.05)], [3.9, wY(3.9), wLE(3.9)], [3.9, wY(3.9), wTE(3.9)], [1.05, wY(1.05), wTE(1.05)]].map(S);
      const outer = [[3.9, wY(3.9), wLE(3.9) + .15], [6.25, wY(6.25), wLE(6.25)], [6.25, wY(6.25), wTE(6.25)], [3.9, wY(3.9), wTE(3.9)]].map(S);
      WG.push(slab(inner, [.2, .12, .12, .2]));
      WG.push(slab(outer, [.12, .07, .07, .12]));
      WG.push(box([Math.min(s * 6.22, s * 6.36), wY(6.25) - .06, wTE(6.25) - .1], [Math.max(s * 6.22, s * 6.36), wY(6.25) + .05, wLE(6.25) + .15]));
      const hl = (x0, x1, f, w) => line([S([x0, wY(x0) + .07, mix(wLE(x0), wTE(x0), f)]), S([x1, wY(x1) + .05, mix(wLE(x1), wTE(x1), f)])], F({ w: w || .35, pts: false }));
      WG.push(hl(1.2, 3.85, .72), hl(3.95, 6.1, .74), hl(1.2, 6.1, .13, .3));
      WG.push(line([S([3.9, wY(3.9) + .07, wLE(3.9)]), S([3.9, wY(3.9) + .07, wTE(3.9)])], F({ w: .4, pts: false })));
      // vertical tail, canted 20 deg outboard
      const cd = [s * Math.sin(20 * D2R), Math.cos(20 * D2R), 0], r0 = [s * 1.0, .55, 0];
      const tq = [V.add(r0, [0, 0, -7.6]), V.add(r0, [0, 0, -3.5]), V.add(V.mad(r0, cd, 3.0), [0, 0, -5.85]), V.add(V.mad(r0, cd, 3.0), [0, 0, -7.4])];
      TL.push(slab(tq, [.16, .16, .07, .07]));
      TL.push(line([V.add(V.mad(r0, cd, .3), [0, 0, -6.7]), V.add(V.mad(r0, cd, 2.8), [0, 0, -6.95])], F({ w: .35, pts: false })));
      // stabilator
      const sq = [S([1.3, -.1, -5.8]), S([3.55, -.25, -7.0]), S([3.55, -.25, -8.3]), S([1.3, -.1, -8.55])];
      SB.push(slab(sq, [.14, .06, .06, .14]));
    }
    // canopy
    const CS = [[6.05, .3, .56, .66, 2], [5.45, .42, .56, .98, 2.2], [4.5, .47, .6, 1.14, 2.4], [3.5, .46, .62, 1.12, 2.4], [2.6, .36, .64, .94, 2.2], [2.0, .2, .66, .74, 2]];
    const KC = skin(CS.map(q => arc(q[0], q[1], q[2], q[3], q[4], 11)), true);
    CN.push(...loft(KC, { lines: [0, 3, 5, 7, 10], rings: [1], al: .8, ral: .75 }));
    CN.push(...sline(KC, [[1.8, 0], [1.8, 10]], false, F({ al: .45 })));
    // intakes: caret mouths, ducts, fans (dyn), nacelle fairings
    for (const s of [1, -1]) {
      const S = p => [s * p[0], p[1], p[2]], mouth = FT_MOUTH.map(S), fan = FT_FAN[s > 0 ? 0 : 1];
      IN.push(line(mouth, { closed: true, w: 1, pts: false }));
      const per = []; for (let e = 0; e < 4; e++) for (let q = 0; q < 3; q++) per.push(V.lerp(mouth[e], mouth[(e + 1) % 4], q / 3));
      const circ = []; for (let m = 0; m < 12; m++) { const th = (135 - m * 30) * D2R; circ.push([fan[0] + s * Math.cos(th) * .42, fan[1] + Math.sin(th) * .42, fan[2] + .02]); }
      const sections = [0, .3, .65, 1].map(t => { const e = t * t * (3 - 2 * t); return per.map((p, m) => V.lerp(p, circ[m], e)); });
      const KD = skin(sections, false, true);
      IN.push(...loft(KD, { lines: [0, 3, 6, 9], al: .5, ds: 1.4 }));
      IN.push(ring(fan, [0, 0, 1], .42, { n: 24 }));
    }
    // pylons: 2 per wing + centreline
    for (const s of [1, -1]) for (const [x, z0, z1] of [[2.55, -.6, -2.7], [4.1, -1.1, -2.9]]) {
      const S = p => [s * p[0], p[1], p[2]], y = wY(x);
      PY.push(hex([S([x - .06, y - .52, z1 + .15]), S([x + .06, y - .52, z1 + .15]), S([x + .06, y - .52, z0 - .25]), S([x - .06, y - .52, z0 - .25]), S([x - .06, y - .02, z1]), S([x + .06, y - .02, z1]), S([x + .06, y - .02, z0]), S([x - .06, y - .02, z0])]));
    }
    PY.push(box([-.07, -1.2, -2.2], [.07, -.78, .3]));
    FT_CACHE = { FU, LX, WG, TL, SB, CN, IN, PY, K };
    return FT_CACHE;
  }
  function ftFans(st) {
    const P = [], rot = st.fan || 0;
    for (let s = 0; s < 2; s++) {
      const c = FT_FAN[s];
      P.push(blades(c, [0, 0, 1], 22, .15, .39, { rot: (s ? -rot : rot) + s * .07, chord: .23, taper: 1.4, pitch: .45, edge: .75 }));
      P.push(lathe(c, [0, 0, 1], [[0, .15], [.12, .12], [.26, .04], [.29, 0]], { n: 14, gen: 4 }));
      P.push(ring(c, [0, 0, 1], .39, F({ n: 24, al: .6 })));
    }
    return P;
  }
  function ftNozzles(st) {
    const P = [], op = sat(Math.max(st.nozzle || 0, st.ab || 0)), re = mix(.33, .45, op), n = 12;
    for (const c of FT_NZ) {
      const z0 = -7.95, z1 = c[2], rb = .47, cx = c[0], cy = c[1];
      P.push(lathe([cx, cy, -7.35], [0, 0, -1], [[0, .52], [.6, .49]], { n: 20, gen: 0, rings: [1] }));
      P.push(lathe([cx, cy, z0], [0, 0, -1], [[0, rb], [z0 - z1, re]], { n: 24, gen: 0, rings: [1] }));
      for (let k = 0; k < n; k++) {
        const a0 = (k + .06) / n * TAU, a1 = (k + .94) / n * TAU;
        const P4 = [[cx + Math.cos(a0) * rb, cy + Math.sin(a0) * rb, z0], [cx + Math.cos(a1) * rb, cy + Math.sin(a1) * rb, z0], [cx + Math.cos(a1) * re, cy + Math.sin(a1) * re, z1], [cx + Math.cos(a0) * re, cy + Math.sin(a0) * re, z1]];
        P.push(panel(P4, F({ edge: .55 })));
      }
      P.push(ring([cx, cy, -7.65], [0, 0, 1], .33, F({ n: 20, al: .7 })));
      P.push(ring([cx, cy, -7.65], [0, 0, 1], .2, F({ n: 14, al: .6 })));
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push(line([[cx + Math.cos(a) * .2, cy + Math.sin(a) * .2, -7.65], [cx + Math.cos(a) * .33, cy + Math.sin(a) * .33, -7.65]], F({ w: .45, pts: false }))); }
      P.push(lathe([cx, cy, -7.35], [0, 0, -1], [[0, .16], [.35, 0]], F({ n: 10, gen: 3 })));
    }
    return P;
  }
  function ftStores() {
    const P = [], wY = x => .08 - (x - 1.05) * .03;
    const msl = (c, L, r, fins) => {
      const out = [lathe([c[0], c[1], c[2] - L / 2], [0, 0, 1], [[0, r * .8], [L * .8, r], [L * .93, r * .8], [L, .01]], { n: 10, gen: 3 })];
      for (const a of [PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4]) out.push(panel([[c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] - L / 2 + .05], [c[0] + Math.cos(a) * (r + fins), c[1] + Math.sin(a) * (r + fins), c[2] - L / 2 + .05], [c[0] + Math.cos(a) * (r + fins), c[1] + Math.sin(a) * (r + fins), c[2] - L / 2 + .3], [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] - L / 2 + .45]], F({ edge: .6 })));
      return out;
    };
    for (const s of [1, -1]) {
      P.push(...msl([s * 6.45, wY(6.25) - .12, -1.6], 3.0, .064, .14));
      P.push(...msl([s * 4.1, wY(4.1) - .72, -1.8], 3.66, .09, .16));
      P.push(lathe([s * 2.55, wY(2.55) - .92, -4.0], [0, 0, 1], [[0, .05], [.5, .3], [1.4, .36], [3.3, .36], [4.2, .2], [4.6, .02]], { n: 16, gen: 6, rings: [1, 2, 3, 4] }));
    }
    return P;
  }
  HD.fighter = function fighter(o) {
    o = o || {};
    const C = ftBuild(), parts = [
      { name: 'fuselage', label: 'F/A-18E Super Hornet', prims: C.FU },
      { name: 'lex', label: 'Leading-edge extensions', prims: C.LX },
      { name: 'wings', label: 'Wing · 13.62 m span', prims: C.WG },
      { name: 'tails', label: 'Vertical tails ×2 · 20° cant', prims: C.TL },
      { name: 'stabs', label: 'Stabilators', prims: C.SB },
      { name: 'canopy', label: 'Canopy', prims: C.CN },
      { name: 'intakes', label: 'Caret intakes · F414 fan', prims: C.IN, dyn: st => [...C.IN, ...ftFans(st)] },
      { name: 'nozzles', label: 'F414-GE-400 nozzles', prims: [], dyn: ftNozzles },
      { name: 'pylons', label: 'Pylons', prims: C.PY },
    ];
    if (o.stores) parts.push({ name: 'stores', label: 'AIM-9X · AIM-120 · 480 gal tanks', prims: ftStores() });
    return { name: 'fighter', L: 18.31, parts };
  };
  HD.fighter.NOZZLES = FT_NZ.map(p => p.slice());
  HD.fighter.INTAKES = [FT_MOUTH, FT_MOUTH.map(mirX)].map(q => V.mul(q.reduce((a, p) => V.add(a, p), [0, 0, 0]), .25));
  HD.fighter.FANS = FT_FAN.map(p => p.slice());

  /* ======================================================================
     Orlan-10-class UAV · 3.1 m span · origin mid-body, nose +Z, tractor prop
     ====================================================================== */
  const DR_PROP = [0, .005, .93], DR_GIM = [0, -.2, .36];
  let DR_CACHE = null;
  function drBuild() {
    if (DR_CACHE) return DR_CACHE;
    const N = 12, FU = [], WG = [], TL = [], AN = [];
    const ST = [[.86, .055, -.05, .06, 2], [.78, .085, -.085, .09, 2.2], [.6, .105, -.11, .115, 2.6], [.3, .11, -.12, .125, 2.8], [0, .108, -.115, .125, 2.8], [-.28, .085, -.09, .11, 2.4], [-.5, .05, -.045, .075, 2.2], [-.9, .03, -.02, .045, 2]];
    const K = skin(ST.map(q => sec(q[0], q[1], q[2], q[3], q[4], N)));
    FU.push(...loft(K, { lines: [0, 3, 6, 9], rings: [2, 5], al: .85, ral: .4 }));
    FU.push(...sline(K, [[1.2, 1.5], [1.2, 10.5], [2.6, 10.5], [2.6, 1.5]], true, F({ al: .35 })));
    FU.push(...sline(K, [[3.4, 4.2], [3.4, 7.8], [4.4, 7.8], [4.4, 4.2]], true, F({ al: .3 })));
    FU.push(cyl([.045, -.07, .7], [.07, -.1, .45], .012, F({ n: 6, gen: 0 })));
    const y = .135, dih = Math.tan(3 * D2R);
    for (const s of [1, -1]) {
      const S = p => [s * p[0], p[1], p[2]];
      const q = [S([.08, y, .16]), S([1.55, y + 1.47 * dih, .14]), S([1.55, y + 1.47 * dih, -.08]), S([.08, y, -.12])];
      WG.push(slab(s > 0 ? q : [q[1], q[0], q[3], q[2]], [.03, .018, .018, .03]));
      WG.push(line([S([.9, y + .82 * dih + .012, -.06]), S([1.5, y + 1.42 * dih + .012, -.045])], F({ w: .4, pts: false })));
      WG.push(line([S([1.55, y + 1.47 * dih, .14]), S([1.58, y + 1.47 * dih + .06, .1]), S([1.58, y + 1.47 * dih + .06, -.06])], F({ w: .6 })));
    }
    WG.push(hex([[-.09, .11, .18], [.09, .11, .18], [.09, .11, -.14], [-.09, .11, -.14], [-.09, y, .17], [.09, y, .17], [.09, y, -.13], [-.09, y, -.13]], F({ skip: [0] })));
    const hq = [[-.42, .05, -.95], [.42, .05, -.95], [.36, .05, -.8], [-.36, .05, -.8]];
    TL.push(slab(hq, .016));
    TL.push(hex([[-.008, .06, -.97], [.008, .06, -.97], [.008, .06, -.74], [-.008, .06, -.74], [-.006, .32, -1.0], [.006, .32, -1.0], [.006, .32, -.88], [-.006, .32, -.88]]));
    TL.push(hex([[-.006, -.02, -.95], [.006, -.02, -.95], [.006, -.02, -.8], [-.006, -.02, -.8], [-.005, -.12, -.97], [.005, -.12, -.97], [.005, -.12, -.9], [-.005, -.12, -.9]], F()));
    AN.push(lathe([0, .125, .22], [0, 1, 0], [[0, .035], [.012, .03], [.016, 0]], { n: 10, gen: 0 }));
    AN.push(hex([[-.004, .12, -.15], [.004, .12, -.15], [.004, .12, -.05], [-.004, .12, -.05], [-.003, .2, -.19], [.003, .2, -.19], [.003, .2, -.14], [-.003, .2, -.14]], F()));
    for (const x of [-.05, .05]) AN.push(line([[x, -.1, -.1], [x * 1.2, -.3, -.16]], F({ w: .7 })));
    AN.push(line([[0, -.08, -.4], [0, -.2, -.45]], F({ w: .6 })));
    DR_CACHE = { FU, WG, TL, AN };
    return DR_CACHE;
  }
  function drProp() {
    const P = [], c = DR_PROP;
    P.push(lathe([c[0], c[1], c[2] - .07], [0, 0, 1], [[0, .052], [.05, .05], [.1, .03], [.135, 0]], { n: 12, gen: 4 }));
    for (const s of [1, -1]) {
      const rs = [.035, .08, .14, .19, .225], pts = [], back = [];
      for (const r of rs) {
        const tw = (38 - 22 * r / .225) * D2R, ch = r < .05 ? .022 : .036 - .02 * (r - .05) / .175;
        const cx = c[0] + s * r, dz = Math.sin(tw) * ch / 2, dy = Math.cos(tw) * ch / 2;
        pts.push([cx, c[1] + s * dy, c[2] + dz]); back.push([cx, c[1] - s * dy, c[2] - dz]);
      }
      P.push(line([...pts, ...back.slice().reverse()], { closed: true, w: .9, pts: false }));
      for (let i = 0; i < rs.length - 1; i++) P.push(panel([pts[i], pts[i + 1], back[i + 1], back[i]], { al: 0, dot: true }));
    }
    return P;
  }
  function drGimbal(st) {
    const P = [], T = piv(R.x(st.gimPitch || 0), [0, 0, 0]);
    P.push(cyl([0, .085, 0], [0, .045, 0], .03, { n: 8, gen: 0 }));
    const B = [sphere([0, 0, 0], .065, { n: 14, gen: 3 }), ring([0, 0, .058], [0, 0, 1], .032, { n: 12 }), ring([0, 0, .06], [0, 0, 1], .016, F({ n: 8 })), ring([0, 0, 0], [1, 0, 0], .066, F({ n: 16, al: .5 }))];
    P.push(...tps(T, B));
    return P;
  }
  HD.drone = function drone() {
    const C = drBuild(), PR = drProp();
    return {
      name: 'drone', L: 1.8,
      parts: [
        { name: 'fuselage', label: 'Orlan-10 UAV', prims: C.FU },
        { name: 'wing', label: 'Wing · 3.1 m span', prims: C.WG },
        { name: 'tail', label: 'Tail', prims: C.TL },
        { name: 'prop', label: 'Propeller · 2 blades', prims: PR, xf: st => piv(R.z(st.prop || 0), DR_PROP) },
        { name: 'gimbal', label: 'EO/IR gimbal', prims: [], dyn: drGimbal, xf: st => X.make(R.y(st.gimYaw || 0), DR_GIM) },
        { name: 'antennas', label: 'GNSS · datalink antennas', prims: C.AN },
      ],
    };
  };
  HD.drone.PROP = DR_PROP.slice(); HD.drone.GIMBAL = DR_GIM.slice(); HD.drone.SPAN = 3.1;

  /* ---------- pneumatic launch rail on a two-wheel trailer ---------- */
  const CAT_R0 = [0, 1.02, -2.05], CAT_R1 = [0, 2.08, 2.75];
  const CAT_DIR = V.norm(V.sub(CAT_R1, CAT_R0)), CAT_LEN = V.dist(CAT_R0, CAT_R1), CAT_PITCH = Math.asin(CAT_DIR[1]);
  const CAT_UP = V.norm(V.cross(CAT_DIR, [1, 0, 0]));
  const CAT_S0 = .35, CAT_S1 = CAT_LEN - .55;
  const catMount = s => V.mad(V.mad(CAT_R0, CAT_DIR, s), CAT_UP, .27);
  let CAT_CACHE = null;
  function catBuild() {
    if (CAT_CACHE) return CAT_CACHE;
    const TR = [], RL = [], CA = [];
    for (const s of [-1, 1]) {
      TR.push(box([s * .5 - .05, .42, -1.6], [s * .5 + .05, .54, 1.3]));
      TR.push(lathe([s * .72, .31, -.15], [s, 0, 0], [[0, .17], [.02, .31], [.16, .31], [.18, .17]], { n: 16, gen: 6, caps: true }));
      TR.push(hex([[s * .66, .56, -.6], [s * .9, .56, -.6], [s * .9, .56, .3], [s * .66, .56, .3], [s * .66, .66, -.5], [s * .9, .66, -.5], [s * .9, .66, .2], [s * .66, .66, .2]], { al: .8 }));
      TR.push(cyl([s * .5, .5, 1.3], [0, .46, 2.35], .04, { n: 6, gen: 0 }));
      TR.push(cyl([s * .45, .5, -1.5], [s * .55, .05, -1.55], .04, F({ n: 6, gen: 0 })));
      TR.push(box([s * .55 - .1, 0, -1.65], [s * .55 + .1, .03, -1.45], F()));
    }
    for (const z of [-1.5, -.6, .3, 1.2]) TR.push(line([[-.5, .5, z], [.5, .5, z]], F({ w: .5 })));
    TR.push(cyl([-.7, .31, -.15], [.7, .31, -.15], .04, F({ n: 6, gen: 0 })));
    TR.push(ring([0, .46, 2.42], [0, 1, 0], .07, F({ n: 10 })));
    TR.push(cyl([0, .46, 2.0], [0, .12, 2.0], .03, F({ n: 6, gen: 0 })));
    TR.push(lathe([0, .75, -.9], [0, 0, 1], [[0, .05], [.08, .19], [.82, .19], [.9, .05]], { n: 14, gen: 4 }));
    TR.push(box([-.35, .54, .35], [.35, .95, .95]));
    // rail beam, twin guide tubes, cylinder, supports
    const side = [1, 0, 0], rp = s => V.mad(CAT_R0, CAT_DIR, s);
    const bq = [V.mad(V.mad(rp(0), side, -.09), CAT_UP, -.22), V.mad(V.mad(rp(0), side, .09), CAT_UP, -.22), V.mad(V.mad(rp(CAT_LEN), side, .09), CAT_UP, -.22), V.mad(V.mad(rp(CAT_LEN), side, -.09), CAT_UP, -.22)];
    RL.push(hex([...bq, ...bq.map(p => V.mad(p, CAT_UP, .16))]));
    for (const x of [-.11, .11]) RL.push(cyl(V.mad(V.mad(rp(0), side, x), CAT_UP, -.02), V.mad(V.mad(rp(CAT_LEN), side, x), CAT_UP, -.02), .028, { n: 6, gen: 0 }));
    RL.push(cyl(V.mad(rp(.1), CAT_UP, -.34), V.mad(rp(CAT_LEN - .4), CAT_UP, -.34), .07, { n: 10, gen: 3 }));
    RL.push(lathe(V.mad(rp(CAT_LEN - .2), CAT_UP, -.02), CAT_DIR, [[0, .05], [.2, .1], [.25, .1]], F({ n: 8, gen: 0 })));
    for (const s of [-1, 1]) {
      RL.push(cyl([s * .45, .54, -1.55], V.mad(V.mad(rp(.25), side, s * .08), CAT_UP, -.24), .04, { n: 6, gen: 0 }));
      RL.push(cyl([s * .45, .54, 1.05], V.mad(V.mad(rp(3.2), side, s * .08), CAT_UP, -.24), .04, { n: 6, gen: 0 }));
      RL.push(cyl([s * .45, .54, .1], V.mad(V.mad(rp(3.2), side, s * .08), CAT_UP, -.24), .03, F({ n: 6, gen: 0 })));
    }
    RL.push(line([[0, .75, -.1], [0, .9, .3], V.mad(rp(.3), CAT_UP, -.34)], F({ w: .5 })));
    // carriage at s = 0 (moves along CAT_DIR)
    const cp = rp(0), cq = [V.mad(V.mad(cp, side, -.14), CAT_DIR, -.2), V.mad(V.mad(cp, side, .14), CAT_DIR, -.2), V.mad(V.mad(cp, side, .14), CAT_DIR, .3), V.mad(V.mad(cp, side, -.14), CAT_DIR, .3)];
    CA.push(hex([...cq.map(p => V.mad(p, CAT_UP, .01)), ...cq.map(p => V.mad(p, CAT_UP, .1))]));
    for (const ds of [-.1, .22]) for (const s of [-1, 1]) CA.push(line([V.mad(V.mad(cp, CAT_DIR, ds), CAT_UP, .1), V.mad(V.mad(V.mad(cp, CAT_DIR, ds), side, s * .11), CAT_UP, .22)], { w: .8 }));
    CAT_CACHE = { TR, RL, CA };
    return CAT_CACHE;
  }
  HD.catapult = function catapult() {
    const C = catBuild();
    return {
      name: 'catapult', L: 4.9,
      parts: [
        { name: 'trailer', label: 'Launch trailer', prims: C.TR },
        { name: 'rail', label: 'Pneumatic launch rail', prims: C.RL },
        { name: 'carriage', label: 'Carriage', prims: C.CA, xf: st => X.make(R.I(), V.mul(CAT_DIR, CAT_S0 + sat(st.carriage || 0) * (CAT_S1 - CAT_S0))) },
      ],
    };
  };
  {
    const RAIL = [catMount(CAT_S0), catMount(CAT_S1)];
    RAIL.start = RAIL[0]; RAIL.end = RAIL[1]; RAIL.dir = CAT_DIR.slice(); RAIL.pitch = CAT_PITCH;
    RAIL.at = t => catMount(CAT_S0 + sat(t) * (CAT_S1 - CAT_S0));
    HD.catapult.RAIL = RAIL;
  }

  /* ======================================================================
     Kondor-class SAR / Lotos-class spacecraft · origin bus centre, +Z velocity, -Y nadir
     ====================================================================== */
  const SAT_AX = V.norm([Math.sin(35 * D2R), -Math.cos(35 * D2R), 0]);   // reflector boresight, side-looking
  const SAT_V0 = [-.35, -2.35, .3], SAT_F = 2.6, SAT_RR = 3.0;
  let SAT_CACHE = null;
  function satBuild() {
    if (SAT_CACHE) return SAT_CACHE;
    const BU = [], SO = [], RF = [], SE = [], TH = [];
    BU.push(box([-.8, -.8, -1.3], [.8, .8, 1.3]));
    for (const z of [-.65, 0, .65]) BU.push(line([[-.81, -.8, z], [-.81, .8, z], [.81, .8, z], [.81, -.8, z]], F({ w: .3, pts: false })));
    for (const s of [-1, 1]) BU.push(line([[s * .81, -.4, -1.3], [s * .81, -.4, 1.3]], F({ w: .25, pts: false })), line([[-.8, s * .4, 1.31], [.8, s * .4, 1.31]], F({ w: .25, pts: false })));
    BU.push(box([-.6, .8, -1.1], [.6, .88, 1.1], F({ al: .6 })));
    BU.push(box([-.95, -.35, -.3], [-.8, .35, .3], F()));
    // reflector: ribs, rim hoop, mesh rings, hub, feed boom, deployment arm
    const U = V.norm(V.cross(SAT_AX, [0, 0, 1])), W = V.cross(SAT_AX, U), nr = 18;
    const dish = (r, a) => V.add(V.mad(SAT_V0, SAT_AX, r * r / (4 * SAT_F)), V.add(V.mul(U, Math.cos(a) * r), V.mul(W, Math.sin(a) * r)));
    const rs = [.35, .9, 1.5, 2.1, 2.6, 3.0];
    for (let k = 0; k < nr; k++) { const a = k / nr * TAU; RF.push(line(rs.map(r => dish(r, a)), { w: .75, pts: false })); }
    const hoop = []; for (let k = 0; k < 72; k++) hoop.push(dish(SAT_RR, k / 72 * TAU));
    RF.push(line(hoop, { closed: true, w: 1 }));
    for (const r of [1.5, 2.3]) { const rg = []; for (let k = 0; k < 54; k++) rg.push(dish(r, k / 54 * TAU)); RF.push(line(rg, F({ closed: true, w: .28, pts: false }))); }
    for (let k = 0; k < nr; k++) for (let i = 0; i < rs.length - 1; i++) {
      const a0 = k / nr * TAU, a1 = (k + 1) / nr * TAU;
      RF.push(panel([dish(rs[i], a0), dish(rs[i], a1), dish(rs[i + 1], a1), dish(rs[i + 1], a0)], { al: 0, ds: 1.25, dot: true }));
    }
    RF.push(ring(V.mad(SAT_V0, SAT_AX, .03), SAT_AX, .35, { n: 16, pts: true }));
    const Fp = V.mad(SAT_V0, SAT_AX, SAT_F);
    RF.push(cyl(SAT_V0, V.mad(Fp, SAT_AX, -.3), .04, { n: 6, gen: 0 }));
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .3; RF.push(line([dish(2.2, a), V.mad(Fp, SAT_AX, -.25)], F({ w: .4, pts: false }))); }
    RF.push(lathe(V.mad(Fp, SAT_AX, -.3), V.mul(SAT_AX, -1), [[0, .1], [.25, .22], [.32, .24]], { n: 12, gen: 4 }));
    RF.push(cyl([.2, -.8, .3], SAT_V0, .07, { n: 8, gen: 0 }), cyl([-.4, -.8, .6], V.add(SAT_V0, [0, 0, .25]), .05, { n: 6, gen: 0 }));
    RF.push(box(V.add(SAT_V0, [-.18, -.12, -.18]), V.add(SAT_V0, [.18, .12, .18])));
    // solar wings along +-X: yoke + 3 panels, cells as hatch
    for (const s of [-1, 1]) {
      SO.push(cyl([s * .8, 0, -.25], [s * 1.55, 0, -.25], .05, { n: 6, gen: 0 }), cyl([s * .8, 0, .25], [s * 1.55, 0, -.25], .03, F({ n: 6, gen: 0 })));
      for (let k = 0; k < 3; k++) {
        const x0 = s * (1.6 + k * 1.72), x1 = s * (1.6 + k * 1.72 + 1.66);
        const q = [[x0, 0, -.9], [x1, 0, -.9], [x1, 0, .4], [x0, 0, .4]];
        SO.push(panel(q, { hatch: 0 }));
        SO.push(panel(q.map(p => [p[0], p[1] + .004, p[2]]), F({ hatch: 6, hatch2: 8, pts: false, al: .35 })));
        if (k < 2) for (const z of [-.6, .1]) SO.push(cyl([x1, 0, z], [x1 + s * .06, 0, z], .03, F({ n: 6, gen: 0 })));
      }
    }
    // sensors: star trackers, antennas, ELINT spirals, GNSS
    for (const s of [-1, 1]) {
      const b = [s * .4, .88, -.8], d = V.norm([0, 1, -.55]);
      SE.push(cyl(b, V.mad(b, d, .2), .08, { n: 10, gen: 0 }));
      SE.push(lathe(V.mad(b, d, .2), d, [[0, .08], [.28, .16]], { n: 12, gen: 4 }));
    }
    for (const [x, z] of [[-.5, .9], [.5, .9], [-.5, -.1], [.5, -.1]]) SE.push(lathe([x, -.8, z], [0, -1, 0], [[0, .14], [.22, .02]], F({ n: 10, gen: 3 })));
    for (const x of [-.45, .45]) { const hx = []; for (let k = 0; k <= 40; k++) { const a = k / 40 * 6 * TAU; hx.push([x + Math.cos(a) * .07, .8 + k / 40 * .5, 1.05 + Math.sin(a) * .07]); } SE.push(line(hx, F({ w: .5, pts: false }))); SE.push(line([[x, .8, 1.05], [x, 1.32, 1.05]], { w: .6 })); }
    SE.push(cyl([0, .8, .4], [0, .95, .4], .1, F({ n: 10, gen: 0 })));
    SE.push(line([[.8, .6, 1.2], [1.9, 1.1, 1.8]], F({ w: .5 })), box([1.86, 1.06, 1.76], [1.96, 1.16, 1.86], F()));
    SE.push(cyl([0, 0, 1.3], [0, 0, 1.55], .22, { n: 14, gen: 0 }), ring([0, 0, 1.56], [0, 0, 1], .16, F({ n: 12 })));
    // thrusters
    TH.push(lathe([0, 0, -1.3], [0, 0, -1], [[0, .12], [.12, .1], [.38, .2]], { n: 14, gen: 4 }));
    for (const x of [-.65, .65]) for (const y of [-.65, .65]) {
      TH.push(box([x - .07, y - .07, -1.36], [x + .07, y + .07, -1.3], F()));
      for (const d of [[Math.sign(x), 0, 0], [0, Math.sign(y), 0], [0, 0, -1]]) TH.push(lathe([x + d[0] * .07, y + d[1] * .07, -1.33 + d[2] * .03], d, [[0, .02], [.07, .04]], F({ n: 8, gen: 0 })));
    }
    SAT_CACHE = { BU, SO, RF, SE, TH };
    return SAT_CACHE;
  }
  HD.satellite = function satellite() {
    const C = satBuild();
    return {
      name: 'satellite', L: 2.6,
      parts: [
        { name: 'bus', label: 'Kondor-class bus', prims: C.BU },
        { name: 'solar', label: 'Solar arrays ×2', prims: C.SO, xf: st => X.make(R.x(st.solar || 0), [0, 0, 0]) },
        { name: 'reflector', label: 'Deployable mesh reflector · 6 m · SAR', prims: C.RF },
        { name: 'sensors', label: 'Star trackers · ELINT spirals · antennas', prims: C.SE },
        { name: 'thrusters', label: 'Propulsion · RCS', prims: C.TH },
      ],
    };
  };
  HD.satellite.BORESIGHT = SAT_AX.slice(); HD.satellite.REFLECTOR = V.mad(SAT_V0, SAT_AX, SAT_RR * SAT_RR / (4 * SAT_F)); HD.satellite.FEED = V.mad(SAT_V0, SAT_AX, SAT_F);

  /* ======================================================================
     Nimitz-class carrier (lower detail) · 332.8 m · origin midships waterline, bow +Z
     ====================================================================== */
  const CV_DECK = 19.5, CV_ZB = 166.4, CV_ZS = -166.4;
  const CV_OUT = [[-13, 166.4], [13, 166.4], [22, 150], [29, 120], [33, 90], [35, 60], [36.4, 30], [36.6, -10], [36.6, -100], [35.4, -140], [32, -160], [27, -166.4], [-24, -166.4], [-30, -156], [-33, -125], [-36.5, -80], [-39.5, -30], [-40.5, 10], [-39.5, 42], [-33, 58], [-26, 80], [-22, 110], [-19, 140], [-15, 160]];
  const CV_ANG = { a: [4, -166.4], d: V.norm([-Math.sin(9 * D2R), 0, Math.cos(9 * D2R)]) };
  function jetLow(T, o) {
    o = o || {};
    const y = 0, half = [[0, 9.15], [.45, 7.6], [.62, 6.0], [1.0, 4.2], [1.9, 1.4], [2.05, .55]];
    const fold = o.fold, wtip = fold ? [[3.9, -.15], [3.9, -3.65]] : [[6.25, -1.0], [6.25, -2.8], [3.9, -3.65]];
    const rest = [[1.3, -4.5], [1.3, -5.8], [3.55, -7.0], [3.55, -8.3], [1.3, -8.55], [1.1, -9.0], [0, -8.8]];
    const hp = [...half, ...wtip, ...rest], full = [...hp.map(p => [p[0], y, p[1]]), ...hp.slice(0, -1).reverse().map(p => [-p[0], y, p[1]])];
    const P = [line(full, { closed: true, w: .9, pts: false })];
    for (const s of [-1, 1]) {
      P.push(line([[s * 1.0, .55, -3.5], [s * 2.05, 3.4, -5.85], [s * 2.05, 3.4, -7.4], [s * 1.0, .55, -7.6]], { w: .8, pts: false }));
      if (fold) P.push(line([[s * 3.9, 0, -.15], [s * 3.8, 2.3, -1.2], [s * 3.8, 2.3, -2.6], [s * 3.9, 0, -3.65]], { w: .7, pts: false }));
      P.push(plate([[s * .1, y, 1.3], [s * (fold ? 3.9 : 6.25), y, fold ? -.15 : -1.0], [s * (fold ? 3.9 : 6.25), y, fold ? -3.65 : -2.8], [s * .1, y, -4.5]], [0, 1, 0]));
      P.push(plate([[s * .1, y, -5.8], [s * 3.55, y, -7.0], [s * 3.55, y, -8.3], [s * .1, y, -8.55]], [0, 1, 0]));
    }
    P.push(plate([[-.8, .6, 8], [.8, .6, 8], [1.1, .6, -8.8], [-1.1, .6, -8.8]], [0, 1, 0]));
    P.push(line([[0, .9, 6.5], [0, 1.1, 4.5], [0, .7, 2.8]], { w: .7, pts: false }));
    return tps(T, P);
  }
  let CV_CACHE = null;
  function cvBuild() {
    if (CV_CACHE) return CV_CACHE;
    const HU = [], DK = [], IS = [], CT = [], EL = [], AIR = [];
    const cvW = z => { const u = z / CV_ZB; if (u > .45) return 20.4 * Math.max(0, 1 - Math.pow((u - .45) / .52, 1.8)); if (u < -.8) return 20.4 * (1 - .25 * Math.pow((-.8 - u) / .2, 1.2)); return 20.4; };
    const cvK = z => { const u = z / CV_ZB; if (u > .5) return 23.5 * Math.max(0, 1 - Math.pow((u - .5) / .5, 1.6)); return 23.5; };
    const Z = []; for (let k = 0; k <= 30; k++) Z.push(mix(CV_ZS, 161.4, k / 30));
    const yk = 12, ytop = 16.8;
    for (const s of [-1, 1]) {
      const wl = Z.map(z => [s * cvW(z), 0, z]), kn = Z.map(z => [s * cvK(z), yk, z]), tp_ = Z.map(z => [s * cvK(z), ytop, z]);
      HU.push(...fpoly(wl, (i, a, b) => sideN(a, b, s, 0), { al: .8 }));
      HU.push(...fpoly(kn, (i, a, b) => sideN(a, b, s, .1), { al: .55 }));
      HU.push(...fpoly(tp_, (i, a, b) => sideN(a, b, s, .1), { al: .45 }));
      for (let i = 0; i < Z.length - 1; i++) {
        HU.push(plate([wl[i], wl[i + 1], kn[i + 1], kn[i]], [s, 0, 0]), plate([kn[i], kn[i + 1], tp_[i + 1], tp_[i]], [s, 0, 0]));
      }
      for (const z of [-140, -100, -60, -20, 20, 60, 100, 130]) HU.push(...fpoly([[s * cvW(z), 0, z], [s * cvK(z), yk, z], [s * cvK(z), ytop, z]], [s, 0, 0], F({ al: .2 })));
    }
    const bowT = [[0, 0, 161.4], [0, yk, 164], [0, CV_DECK, CV_ZB]];
    HU.push(line(bowT, { w: .9, pts: false }));
    HU.push(fl([-cvW(CV_ZS), 0, CV_ZS], [cvW(CV_ZS), 0, CV_ZS], [0, 0, -1], { al: .7 }));
    for (const s of [-1, 1]) HU.push(fl([s * cvW(CV_ZS), 0, CV_ZS], [s * 24, CV_DECK - 1.8, CV_ZS], V.norm([s, 0, -1]), { al: .7 }));
    // flight deck slab: top outline + faint underside, gallery supports
    const top = CV_OUT.map(p => [p[0], CV_DECK, p[1]]), bot = CV_OUT.map(p => [p[0], CV_DECK - 1.8, p[1]]);
    const cen = [0, 0, 0];
    DK.push(...fpoly(top, (i, a, b) => { const n = sideN(a, b, 1, 0); const m = V.lerp(a, b, .5); return V.norm(V.add(V.dot(n, [m[0], 0, m[2]]) < 0 ? V.mul(n, -1) : n, [0, 1.3, 0])); }, { al: 1 }, true));
    DK.push(...fpoly(bot, (i, a, b) => { const n = sideN(a, b, 1, 0); const m = V.lerp(a, b, .5); return V.dot(n, [m[0], 0, m[2]]) < 0 ? V.mul(n, -1) : n; }, { al: .4 }, true));
    for (let i = 0; i < CV_OUT.length; i += 2) DK.push(line([top[i], bot[i]], F({ w: .35, pts: false })));
    // deck surface plates (fan from the centreline strip)
    for (let z = CV_ZS; z < CV_ZB - 1; z += 12) {
      const z1 = Math.min(CV_ZB, z + 12), xr = zz => { let best = 0; for (let i = 0; i < CV_OUT.length; i++) { const a = CV_OUT[i], b = CV_OUT[(i + 1) % CV_OUT.length]; if ((a[1] - zz) * (b[1] - zz) <= 0 && a[1] !== b[1]) { const x = mix(a[0], b[0], (zz - a[1]) / (b[1] - a[1])); if (x > best) best = x; } } return best; };
      const xl = zz => { let best = 0; for (let i = 0; i < CV_OUT.length; i++) { const a = CV_OUT[i], b = CV_OUT[(i + 1) % CV_OUT.length]; if ((a[1] - zz) * (b[1] - zz) <= 0 && a[1] !== b[1]) { const x = mix(a[0], b[0], (zz - a[1]) / (b[1] - a[1])); if (x < best) best = x; } } return best; };
      const za = z + .01, zb = z1 - .01;
      DK.push(plate([[xl(za), CV_DECK, za], [xr(za), CV_DECK, za], [xr(zb), CV_DECK, zb], [xl(zb), CV_DECK, zb]], [0, 1, 0], { ds: 1.3 }));
    }
    // angled deck landing area, centreline, foul line, wires
    const A = (t, off) => V.add([CV_ANG.a[0], CV_DECK + .05, CV_ANG.a[1]], V.add(V.mul(CV_ANG.d, t), V.mul([CV_ANG.d[2], 0, -CV_ANG.d[0]], off)));
    DK.push(line([A(8, -12.5), A(222, -12.5)], { w: .5, pts: false }), line([A(8, 12.5), A(215, 12.5)], { w: .5, pts: false }));
    for (let t = 10; t < 222; t += 9) DK.push(line([A(t, 0), A(t + 4.5, 0)], F({ w: .45, pts: false })));
    for (const t of [42, 54, 66, 78]) DK.push(line([A(t, -13), A(t, 13)], { w: .55, pts: false }));
    DK.push(line([[4, CV_DECK + .05, 150], [4, CV_DECK + .05, -150]], F({ w: .3, pts: false })));
    for (const s of [-1, 1]) DK.push(line([[s * 1.5, CV_DECK + .05, 166], [s * 1.5, CV_DECK + .05, 60]], F({ w: .25, pts: false })));
    // catapults: bow pair + waist pair, JBDs
    const cat = (a, b) => {
      const d = V.norm(V.sub(b, a)), sd = [d[2], 0, -d[0]], out = [];
      for (const o2 of [-.25, .25]) out.push(line([V.mad(a, sd, o2), V.mad(b, sd, o2)], { w: .7, pts: false }));
      out.push(box(V.add(V.mad(a, d, 2), [-.5, 0, -.8]), V.add(V.mad(a, d, 2), [.5, .5, .8]), F()));
      const j0 = V.mad(a, d, -6), q = [V.mad(j0, sd, -6), V.mad(j0, sd, 6), V.add(V.mad(V.mad(j0, sd, 6), d, -1.6), [0, 3.4, 0]), V.add(V.mad(V.mad(j0, sd, -6), d, -1.6), [0, 3.4, 0])];
      out.push(panel(q, { hatch: 3, al: .7 }));
      return out;
    };
    const y = CV_DECK + .05;
    CT.push(...cat([6, y, 70], [6, y, 163]), ...cat([-6, y, 72], [-6, y, 163]));
    CT.push(...cat([-12, y, -30], [-24, y, 62]), ...cat([-23, y, -26], [-34, y, 55]));
    // elevators
    for (const [x0, x1, z0, z1] of [[22, 36.6, 45, 66], [22, 36.6, 8, 29], [22, 36.6, -80, -59], [-38.6, -24, -128, -107]]) {
      EL.push(panel([[x0, CV_DECK + .06, z0], [x1, CV_DECK + .06, z0], [x1, CV_DECK + .06, z1], [x0, CV_DECK + .06, z1]], { pts: false, al: .8 }));
      EL.push(line([[x0 + .8, CV_DECK + .06, z0 + .8], [x1 - .8, CV_DECK + .06, z1 - .8]], F({ w: .3, pts: false })), line([[x1 - .8, CV_DECK + .06, z0 + .8], [x0 + .8, CV_DECK + .06, z1 - .8]], F({ w: .3, pts: false })));
    }
    // hangar-deck openings behind the elevators, corner sponsons with CIWS / RAM / NSSM
    for (const [s, z0, z1] of [[1, 47, 64], [1, 10, 27], [1, -78, -61], [-1, -126, -109]]) {
      const x = s * (cvK((z0 + z1) / 2) + .05);
      HU.push(fquad([[x, yk + .4, z0], [x, yk + .4, z1], [x, ytop - .3, z1], [x, ytop - .3, z0]], [s, 0, 0], { al: .6 }));
    }
    for (const [x, z, a] of [[25, 128, .5], [-26, 122, -.6], [30, -150, 2.4], [-29, -146, -2.3]]) {
      const s = Math.sign(x), b = [x, CV_DECK - 3.6, z];
      HU.push(box([Math.min(x, x + s * 6), b[1] - 2.4, z - 4], [Math.max(x, x + s * 6), b[1], z + 4]));
      HU.push(...tps(X.make(R.y(a), V.add(b, [s * 3, 0, 0])), [cyl([0, 0, 0], [0, .9, 0], .8, { n: 12, gen: 0 }), lathe([0, .9, -.2], [0, 1, 0], [[0, .6], [.9, .55], [1.3, .3], [1.45, 0]], { n: 14, gen: 4 }), cyl([0, .75, .45], [0, 1.1, 2.3], .12, F({ n: 6, gen: 0 }))]));
    }
    // island (starboard), bridge levels, lattice mast, radars
    const isl =(x0, x1, z0, z1, y0, y1, o) => box([x0, y0, z0], [x1, y1, z1], o);
    IS.push(isl(27.5, 35.8, -46, -14, CV_DECK, CV_DECK + 11.5));
    IS.push(isl(28, 35.2, -42, -18, CV_DECK + 11.5, CV_DECK + 17));
    IS.push(isl(28.6, 34.6, -36, -21, CV_DECK + 17, CV_DECK + 20.5));
    for (const [yy, z0, z1] of [[CV_DECK + 15.2, -41.6, -18.4], [CV_DECK + 19.3, -35.6, -21.4]]) IS.push(line([[27.9, yy, z1], [35.3, yy, z1]], F({ w: .5, pts: false })), line([[27.9, yy, z0], [27.9, yy, z1]], F({ w: .5, pts: false })));
    for (const z of [-40, -31, -22]) IS.push(line([[27.45, CV_DECK + 3, z], [27.45, CV_DECK + 10, z]], F({ w: .3, pts: false })));
    const mb = [31.6, CV_DECK + 20.5, -28.5];
    for (const [dx, dz] of [[-1.6, -2.5], [1.6, -2.5], [0, 2.5]]) IS.push(cyl(V.add(mb, [dx, 0, dz]), V.add(mb, [0, 14, 0]), .22, { n: 6, gen: 0 }));
    IS.push(cyl(V.add(mb, [0, 14, 0]), V.add(mb, [0, 22, 0]), .12, { n: 6, gen: 0 }));
    IS.push(cyl(V.add(mb, [-4, 11, 0]), V.add(mb, [4, 11, 0]), .1, { n: 6, gen: 0 }));
    IS.push(box(V.add(mb, [-1.4, 13.8, -1.4]), V.add(mb, [1.4, 14.2, 1.4])));
    // aircraft on deck
    const jets = [[20, 150, -120], [20, 138, -120], [20, 126, -120], [23, 112, -115], [-28, -100, 30], [-26, -88, 30], [26, -120, -95], [26, -134, -95], [-12, 100, 180], [29, 55, -90]];
    for (const [x, z, h] of jets) AIR.push(...jetLow(X.make(R.y(h * D2R), [x, CV_DECK + 1.3, z]), { fold: true }));
    CV_CACHE = { HU, DK, IS, CT, EL, AIR, mb };
    return CV_CACHE;
  }
  function cvRadars(st) {
    const C = cvBuild(), mb = C.mb, P = [];
    const c48 = V.add(mb, [0, 15.4, 0]), T48 = piv(R.y(st.radar || 0), c48);
    P.push(...tps(T48, [panel([[c48[0] - 2.6, c48[1], c48[2] + .6], [c48[0] + 2.6, c48[1], c48[2] + .6], [c48[0] + 2.6, c48[1] + 4.6, c48[2] + 1.2], [c48[0] - 2.6, c48[1] + 4.6, c48[2] + 1.2]], { hatch: 6 }), box(V.add(c48, [-.4, -.2, -.4]), V.add(c48, [.4, .4, .4]))]));
    const c49 = [31.6, CV_DECK + 21.5, -9.0], T49 = piv(R.y(-(st.radar || 0) * .7 + 1.1), c49);
    const xs = [-3.6, -2.2, -.8, .8, 2.2, 3.6], zz = x => -x * x / 12;
    const S49 = [];
    for (let k = 0; k < xs.length - 1; k++) S49.push(panel([[c49[0] + xs[k], c49[1] + .4, c49[2] + zz(xs[k])], [c49[0] + xs[k + 1], c49[1] + .4, c49[2] + zz(xs[k + 1])], [c49[0] + xs[k + 1], c49[1] + 4.6, c49[2] + zz(xs[k + 1])], [c49[0] + xs[k], c49[1] + 4.6, c49[2] + zz(xs[k])]], { hatch: 4 }));
    P.push(...tps(T49, S49));
    P.push(cyl([31.6, CV_DECK + 11.5, -9.0], c49, .3, { n: 8, gen: 0 }));
    return P;
  }
  HD.carrier = function carrier() {
    const C = cvBuild();
    return {
      name: 'carrier', L: 332.8,
      parts: [
        { name: 'hull', label: 'Hull · CVN Nimitz class', prims: C.HU },
        { name: 'deck', label: 'Flight deck · 9° angled deck', prims: C.DK },
        { name: 'island', label: 'Island', prims: C.IS },
        { name: 'radars', label: 'AN/SPS-48E · AN/SPS-49', prims: [], dyn: cvRadars },
        { name: 'cats', label: 'C-13 catapults ×4', prims: C.CT },
        { name: 'elevators', label: 'Aircraft elevators ×4', prims: C.EL },
        { name: 'air', label: 'Air wing · F/A-18E', prims: C.AIR },
      ],
    };
  };
  HD.carrier.DECK_Y = CV_DECK;
  HD.carrier.ANGLED = { origin: [CV_ANG.a[0], CV_DECK, CV_ANG.a[1]], dir: CV_ANG.d.slice() };
  HD.carrier.CATS = [[[6, CV_DECK, 70], [6, CV_DECK, 163]], [[-6, CV_DECK, 72], [-6, CV_DECK, 163]], [[-12, CV_DECK, -30], [-24, CV_DECK, 62]], [[-23, CV_DECK, -26], [-34, CV_DECK, 55]]];

  /* wire-only copy of a model: drops the dots-only skin (plates, blade / mesh fills) that GEO.draw
     would otherwise process at al 0. For Orbital films; Point Cloud films sample the full model. */
  HD.wire = function wire(m) {
    return Object.assign({}, m, { parts: m.parts.map(p => {
      const q = Object.assign({}, p);
      if (p.prims) q.prims = p.prims.filter(pr => !pr.dot);
      if (p.dyn) { const d = p.dyn; q.dyn = st => d(st).filter(pr => !pr.dot); }
      return q;
    }) });
  };
  HD.seaAir = { fl, fquad, plate, loft, skin, sec, sec2, arc, tp, piv, Rax, jetLow };
  HD.READY_SEA_AIR = true;
})();
