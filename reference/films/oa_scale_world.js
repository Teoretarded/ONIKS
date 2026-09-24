/* Orbital A "Scale": one world frame from orbit down to the bluff. Metres; X east, Y up, Z north.
   The origin sits on the sea surface at the battery site (TEL 1), the Earth's centre at [0, -RE, 0].
   The real seed-1337 map is laid on the sphere gnomonically about the site. The coastline gains
   fractal detail continuously as the camera comes down (each octave fades in once its wavelength
   spans a few pixels), so the map's coast, the bluff edge and the waterline are one curve at every
   scale, and the swell rows are its offsets smoothed in proportion to their distance from shore. */
window.OA = (function () {
  'use strict';
  const { V, E } = M3;
  const D2R = Math.PI / 180;
  const TH = window.THEATRE;
  const RE = 6371e3, C = [0, -RE, 0];
  const GH = 24;                           // bluff top above the sea at the site (sub-cell relief)

  /* ---------- projection core: camera basis cached once per frame ---------- */
  let cam = null, WR = null;
  let ex = 0, ey = 0, ez = 0, fx = 0, fy = 0, fz = 1, rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0, FL = 1, CX = 960, CY = 540, NEAR = .05;
  let EX = 0, EY = RE, EZ = 0, EL = RE;
  const S = { hc: 0 };
  function bind(c, w) { cam = c; WR = w; }
  function sync() {
    [ex, ey, ez] = cam.eye; [fx, fy, fz] = cam.f; [rx, ry, rz] = cam.r; [ux, uy, uz] = cam.u;
    FL = cam.fl; CX = cam.cx + cam.shake[0]; CY = cam.cy + cam.shake[1]; NEAR = cam.near;
    EX = ex - C[0]; EY = ey - C[1]; EZ = ez - C[2]; EL = Math.hypot(EX, EY, EZ); S.hc = EL - RE;
  }
  function segW(ax, ay, az, bx, by, bz, al) {
    if (al <= .004) return;
    let dx = ax - ex, dy = ay - ey, dz = az - ez;
    let Az = dx * fx + dy * fy + dz * fz, Ax = dx * rx + dy * ry + dz * rz, Ay = dx * ux + dy * uy + dz * uz;
    dx = bx - ex; dy = by - ey; dz = bz - ez;
    let Bz = dx * fx + dy * fy + dz * fz, Bx = dx * rx + dy * ry + dz * rz, By = dx * ux + dy * uy + dz * uz;
    if (Az < NEAR && Bz < NEAR) return;
    if (Az < NEAR) { const t = (NEAR - Az) / (Bz - Az); Ax += (Bx - Ax) * t; Ay += (By - Ay) * t; Az = NEAR; }
    else if (Bz < NEAR) { const t = (NEAR - Bz) / (Az - Bz); Bx += (Ax - Bx) * t; By += (Ay - By) * t; Bz = NEAR; }
    const x0 = CX + FL * Ax / Az, y0 = CY - FL * Ay / Az, x1 = CX + FL * Bx / Bz, y1 = CY - FL * By / Bz;
    if ((x0 < -40 && x1 < -40) || (x0 > 1960 && x1 > 1960) || (y0 < -40 && y1 < -40) || (y0 > 1120 && y1 > 1120)) return;
    WR.seg2(x0, y0, x1, y1, al);
  }
  const depth = (x, y, z) => (x - ex) * fx + (y - ey) * fy + (z - ez) * fz;
  /* horizon coordinate of a sea-level point: 1 at the nadir, 0 on the horizon, < 0 hidden */
  const kvOf = (x, y, z) => (((x - C[0]) * EX + (y - C[1]) * EY + (z - C[2]) * EZ) / RE - RE) / (EL - RE);
  /* the line of sight from the eye to an elevated point clears the Earth */
  function clear(p) {
    const dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez, a = dx * dx + dy * dy + dz * dz;
    const b = dx * EX + dy * EY + dz * EZ, c = EX * EX + EY * EY + EZ * EZ - RE * RE, disc = b * b - a * c;
    if (disc < 0) return true;
    const t = (-b - Math.sqrt(disc)) / a;
    return !(t > 0 && t < 1);
  }
  const eye = () => [ex, ey, ez];

  /* ---------- geodesy ---------- */
  const LAT0 = 45.21 * D2R, LON0 = 36.6, cL = Math.cos(LAT0), sL = Math.sin(LAT0);
  const dirLL = (la, dl) => { const c = Math.cos(la); return [c * Math.sin(dl), c * Math.cos(dl) * cL + Math.sin(la) * sL, -c * Math.cos(dl) * sL + Math.sin(la) * cL]; };
  const llOf = d => [Math.asin(E.clamp(d[1] * sL + d[2] * cL, -1, 1)), Math.atan2(d[0], d[1] * cL - d[2] * sL)];
  const SUN = dirLL(9 * D2R, -74 * D2R);
  let SX = 0, SZ = 0;                      // map km of the site (set once the coast is built)
  function mapTo(out, xk, zk, alt) { const x = (xk - SX) * 1000, z = (zk - SZ) * 1000, l = Math.sqrt(x * x + RE * RE + z * z), r = (RE + (alt || 0)) / l; out[0] = x * r; out[1] = RE * r - RE; out[2] = z * r; return out; }
  const mapP = (xk, zk, alt) => mapTo([0, 0, 0], xk, zk, alt);
  function mapInv(p) { const dx = p[0] - C[0], dy = p[1] - C[1], dz = p[2] - C[2], t = RE / dy; return [dx * t / 1000 + SX, dz * t / 1000 + SZ]; }
  const altOf = p => Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) - RE;
  const upAt = p => V.norm([p[0] - C[0], p[1] - C[1], p[2] - C[2]]);
  /* sea level below a local point, exact sphere without cancellation */
  const seaY = (x, z) => { const q = x * x + z * z; return -q / (RE + Math.sqrt(RE * RE - q)); };

  /* ---------- map polylines ---------- */
  const SQ = [-300, 300, -40, 560];
  function clipSeg(a, b) {
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - SQ[0]], [dx, SQ[1] - a[0]], [-dz, a[1] - SQ[2]], [dz, SQ[3] - a[1]]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [t0, t1];
  }
  function clipPoly(poly) {
    const out = []; let run = null;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1], c = clipSeg(a, b);
      if (!c) { if (run && run.length > 1) out.push(run); run = null; continue; }
      const p = [a[0] + (b[0] - a[0]) * c[0], a[1] + (b[1] - a[1]) * c[0]], q = [a[0] + (b[0] - a[0]) * c[1], a[1] + (b[1] - a[1]) * c[1]];
      if (!run || c[0] > 0) { if (run && run.length > 1) out.push(run); run = [p]; }
      run.push(q);
      if (c[1] < 1) { out.push(run); run = null; }
    }
    if (run && run.length > 1) out.push(run);
    return out;
  }
  function chaikin(p, it) { for (let k = 0; k < it; k++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } o.push(p[p.length - 1]); p = o; } return p; }
  const decim = (poly, k) => poly.filter((_, i) => i % k === 0 || i === poly.length - 1);
  function flat(list) { let n = 0; for (const l of list) n += l.length; const P = new Float64Array(n * 3), runs = []; let o = 0; for (const l of list) { runs.push(o, o + l.length); for (const p of l) { P[o * 3] = p[0]; P[o * 3 + 1] = p[1]; P[o * 3 + 2] = p[2]; o++; } } return { P, runs }; }

  /* ---------- the fractal coast ---------- */
  // octaves from 1.6 km down to 0.8 m; amplitude proportional to wavelength (a self-similar shore)
  const OCT = []; for (let k = 0; k < 12; k++) { const lam = 1.6 / Math.pow(2, k); OCT.push([lam, .11 * lam, k * 7.31 + 1.7]); }
  function detail(x, z, px, minLam) {
    let d = 0;
    for (let k = 0; k < 12; k++) {
      const o = OCT[k], lam = o[0];
      if (lam < minLam) break;
      const w = px > 0 ? E.ss(4, 9, lam / px) : 1;
      if (w <= 0) break;
      d += w * o[1] * M3.noise(x / lam, z / lam, o[2]);
    }
    return d;
  }
  // the contour's vertices can be 50 km apart; resample so culling, normals and swell rows stay local
  function resample(run, maxL) {
    const out = [run[0]];
    for (let i = 0; i < run.length - 1; i++) {
      const a = run[i], b = run[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / maxL));
      for (let j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    return out;
  }
  const COAST = [];
  for (const poly of TH.contours['0']) for (const run0 of clipPoly(chaikin(poly, 2))) {
    const run = resample(run0, .4);
    const n = run.length; if (n < 2) continue;
    const P = new Float64Array(n * 2), N = new Float64Array(n * 2), L = new Float64Array(n), A = new Float64Array(n);
    run.forEach((p, i) => { P[2 * i] = p[0]; P[2 * i + 1] = p[1]; });
    for (let i = 0; i < n; i++) {
      const a = run[Math.max(0, i - 1)], b = run[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      N[2 * i] = -tz; N[2 * i + 1] = tx;
      if (i < n - 1) L[i] = Math.hypot(run[i + 1][0] - run[i][0], run[i + 1][1] - run[i][1]);
      if (i) A[i] = A[i - 1] + L[i - 1];
    }
    // seaward normals, by the DEM
    let s = 0; for (let i = 0; i < n; i++) { const x = P[2 * i], z = P[2 * i + 1], nx = N[2 * i], nz = N[2 * i + 1]; s += TH.h(x - nx * .7, z - nz * .7) - TH.h(x + nx * .7, z + nz * .7); }
    if (s < 0) for (let i = 0; i < 2 * n; i++) N[i] = -N[i];
    COAST.push({ P, N, L, A, n, W: new Float64Array(n * 3) });
  }
  const CQ = new Float64Array(4);
  function coastPoint(run, i, u, px, minLam, off) {
    const P = run.P, N = run.N, j = 2 * i;
    const x = P[j] + (P[j + 2] - P[j]) * u, z = P[j + 1] + (P[j + 3] - P[j + 1]) * u;
    let nx = N[j] + (N[j + 2] - N[j]) * u, nz = N[j + 1] + (N[j + 3] - N[j + 1]) * u; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const d = detail(x, z, px, minLam) + (off || 0);
    CQ[0] = x + nx * d; CQ[1] = z + nz * d; CQ[2] = nx; CQ[3] = nz;
  }
  // the site: 48 m inland of the full-detail waterline where the coast crosses the site meridian
  let SITE_RUN = null, SITE_I = 0;
  {
    let best = 1e9;
    for (const run of COAST) for (let i = 0; i < run.n - 1; i++) {
      const x0 = run.P[2 * i], x1 = run.P[2 * i + 2], z0 = run.P[2 * i + 1];
      if ((x0 - .0) * (x1 - .0) <= 0 && Math.abs(z0 - 1) < best) { best = Math.abs(z0 - 1); SITE_RUN = run; SITE_I = i; }
    }
    const P = SITE_RUN.P, i = SITE_I, u = (0 - P[2 * i]) / (P[2 * i + 2] - P[2 * i]);
    coastPoint(SITE_RUN, i, u, 0, 0, 0);
    SX = CQ[0] - CQ[2] * .048; SZ = CQ[1] - CQ[3] * .048;
  }

  /* ---------- static map layers ---------- */
  const toW = (runs, alt) => flat(runs.map(r => r.map(p => mapP(p[0], p[1], alt || 0))));
  const lay = (lvl, dk, it) => TH.contours[lvl].map(p => chaikin(dk ? decim(p, dk) : p, it || 0)).flatMap(clipPoly);
  const B40 = toW(lay('-40', 0, 2)), B100 = toW(lay('-100', 2, 1));
  const T60 = toW(lay('60', 0, 2)), T140 = toW(lay('140', 2, 2)), T220 = toW(lay('220', 0, 2));
  const sqLine = (a, b, st) => { const l = [], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / st); for (let i = 0; i <= n; i++) l.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return l; };
  const SQP = [[SQ[0], SQ[2]], [SQ[1], SQ[2]], [SQ[1], SQ[3]], [SQ[0], SQ[3]]];
  const SQUARE = toW([0, 1, 2, 3].map(i => sqLine(SQP[i], SQP[(i + 1) % 4], 5)));
  const GRID50 = toW([...[-250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250].map(x => sqLine([x, SQ[2]], [x, SQ[3]], 5)),
    ...[0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550].map(z => sqLine([SQ[0], z], [SQ[1], z], 5))]);
  const g10 = []; for (let x = -150; x <= 150; x += 10) if (x % 50) g10.push(sqLine([x, -40], [x, 200], 4));
  for (let z = 10; z <= 200; z += 10) if (z % 50) g10.push(sqLine([-150, z], [150, z], 4));
  const GRID10 = toW(g10);
  const grat = [];
  const LON0r = LON0;
  for (let la = -80; la <= 80; la += 10) { const l = []; for (let lo = 0; lo <= 360; lo += 2.5) { const d = dirLL(la * D2R, (lo - LON0r) * D2R); l.push([C[0] + d[0] * RE, C[1] + d[1] * RE, C[2] + d[2] * RE]); } grat.push(l); }
  for (let lo = 0; lo < 360; lo += 10) { const l = []; for (let la = -90; la <= 90; la += 2.5) { const d = dirLL(la * D2R, (lo - LON0r) * D2R); l.push([C[0] + d[0] * RE, C[1] + d[1] * RE, C[2] + d[2] * RE]); } grat.push(l); }
  const GRAT = flat(grat);
  const TERM = (() => { const U = V.norm(V.cross(SUN, [0, 1, 0])), Vv = V.cross(SUN, U), l = []; for (let i = 0; i <= 240; i++) { const a = i / 240 * Math.PI * 2; l.push(V.add(C, V.mul(V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a))), RE))); } return flat([l]); })();

  /* surface polyline stored flat; hidden past the horizon, faded toward it */
  function surfPath(P, i0, i1, al, fw, back, night) {
    let px = 0, py = 0, pz = 0, pk = 0;
    for (let i = i0; i < i1; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], k = kvOf(x, y, z);
      if (i > i0) {
        let a = 0;
        if (pk > 0 && k > 0) a = al * E.ss(0, fw, Math.min(pk, k));
        else if (pk > 0 || k > 0) {
          const t = pk / (pk - k), hx = px + (x - px) * t, hy = py + (y - py) * t, hz = pz + (z - pz) * t;
          if (pk > 0) segW(px, py, pz, hx, hy, hz, al * E.ss(0, fw, pk * .5)); else segW(hx, hy, hz, x, y, z, al * E.ss(0, fw, k * .5));
          if (back) { if (pk > 0) segW(hx, hy, hz, x, y, z, back); else segW(px, py, pz, hx, hy, hz, back); }
        } else if (back) segW(px, py, pz, x, y, z, back);
        if (a > 0) {
          if (night) { const d = ((px + x) * .5 - C[0]) * SUN[0] + ((py + y) * .5 - C[1]) * SUN[1] + ((pz + z) * .5 - C[2]) * SUN[2]; if (d < 0) a *= .3; }
          segW(px, py, pz, x, y, z, a);
        }
      }
      px = x; py = y; pz = z; pk = k;
    }
  }
  function runs(L, al, fw) { if (al <= .004) return; for (let r = 0; r < L.runs.length; r += 2) surfPath(L.P, L.runs[r], L.runs[r + 1], al, fw); }
  function ringW(c, U, Vv, r, n, al) {
    let px = c[0] + U[0] * r, py = c[1] + U[1] * r, pz = c[2] + U[2] * r;
    for (let i = 1; i <= n; i++) { const a = i / n * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r; const qx = c[0] + U[0] * ca + Vv[0] * sa, qy = c[1] + U[1] * ca + Vv[1] * sa, qz = c[2] + U[2] * ca + Vv[2] * sa; segW(px, py, pz, qx, qy, qz, al); px = qx; py = qy; pz = qz; }
  }

  /* globe: limb, Karman shell, graticule (day/night), terminator */
  function globe(lg) {
    const hiA = E.ss(5.4, 6.3, lg), fw = .1 + .08 * hiA;
    const eh = [EX / EL, EY / EL, EZ / EL], [U, Vv] = GEO.perp(eh);
    const limbA = .85 * E.ss(3.6, 4.6, lg);
    if (limbA > 0) { const rs = RE * Math.sqrt(1 - (RE / EL) ** 2), c = V.add(C, V.mul(eh, RE * RE / EL)); ringW(c, U, Vv, rs, 480, limbA); }
    const kA = .18 * E.ss(4.9, 5.6, lg);
    if (kA > 0) { const RA = RE + 100e3; if (EL > RA) { const rs = RA * Math.sqrt(1 - (RA / EL) ** 2), c = V.add(C, V.mul(eh, RA * RA / EL)); ringW(c, U, Vv, rs, 360, kA); } }
    const gA = .17 * (.4 + .6 * hiA) * E.ss(4.5, 5.4, lg);
    if (gA > .004) for (let r = 0; r < GRAT.runs.length; r += 2) surfPath(GRAT.P, GRAT.runs[r], GRAT.runs[r + 1], gA, fw, .03 * hiA, true);
    const tA = .3 * E.ss(5, 5.8, lg);
    if (tA > .004) for (let i = 0; i < TERM.P.length / 3 - 1; i += 2) surfPath(TERM.P, i, i + 2, tA, fw);
    return fw;
  }
  /* map layers by altitude; the coast is drawn separately (adaptive). kc scales the contours and soundings */
  function mapLayers(lg, fw, sqA, kc) {
    kc = kc || 1;
    const mid = kc * E.ss(3.3, 3.9, lg) * (1 - .6 * E.ss(5.8, 6.3, lg)), low = kc * E.ss(3.25, 3.75, lg) * (1 - E.ss(5.5, 6.1, lg));
    runs(B40, .15 * mid, fw); runs(B100, .075 * mid, fw);
    runs(T60, .14 * low, fw); runs(T140, .09 * low, fw); runs(T220, .22 * low, fw);
    runs(GRID50, .05 * E.ss(4.2, 4.8, lg) * (1 - E.ss(6.1, 6.5, lg)), fw);
    runs(GRID10, .06 * E.ss(3.5, 4.1, lg) * (1 - E.ss(5, 5.5, lg)), fw);
    if (sqA > .004) {
      for (let r = 0; r < SQUARE.runs.length; r += 2) surfPath(SQUARE.P, SQUARE.runs[r], SQUARE.runs[r + 1], sqA, .12);
      const bk = 22, g = 10;
      [[SQ[0] - g, SQ[2] - g, 1, 1], [SQ[1] + g, SQ[2] - g, -1, 1], [SQ[1] + g, SQ[3] + g, -1, -1], [SQ[0] - g, SQ[3] + g, 1, -1]].forEach(([x, z, sx, sz]) => {
        const a = mapP(x, z), b = mapP(x + sx * bk, z), c = mapP(x, z + sz * bk);
        if (kvOf(...a) > 0) { segW(...a, ...b, sqA * .9); segW(...a, ...c, sqA * .9); }
      });
    }
  }

  /* ---------- adaptive coast: waterline + bluff (top edge, face hatching) ----------
     The DEM's 1 km cells put the 20 m contour ~230 m inland; the real shore is a 24 m bluff. As the
     camera comes down that contour slides to the cliff edge and rises to its true height: at map scale
     it is a contour line, at the battery it is the top of the bluff. */
  const tA = [0, 0, 0], tB = [0, 0, 0];
  const C20 = .23;
  function coast(o) {
    const al = o.al, lift = o.lift || 0, bl = o.bluff || 0, fw = o.fw || .1, step = o.step || 2.4;
    const inl = C20 + (.006 - C20) * lift, hTop = GH * lift, hA = o.hatch || 0;
    for (const run of COAST) {
      const P = run.P, n = run.n, Wc = run.W;
      for (let i = 0; i < n; i++) { mapTo(tA, P[2 * i], P[2 * i + 1], 0); Wc[3 * i] = tA[0]; Wc[3 * i + 1] = tA[1]; Wc[3 * i + 2] = tA[2]; }
      for (let i = 0; i < n - 1; i++) {
        const ax = Wc[3 * i], ay = Wc[3 * i + 1], az = Wc[3 * i + 2], bx = Wc[3 * i + 3], by = Wc[3 * i + 4], bz = Wc[3 * i + 5];
        const ka = kvOf(ax, ay, az), kb = kvOf(bx, by, bz);
        if (ka < -.04 && kb < -.04) continue;
        const Lm = run.L[i] * 1000, da = depth(ax, ay, az), db = depth(bx, by, bz);
        if (da < -700 && db < -700) continue;
        if (da > 1 && db > 1) {
          const xa = CX + FL * ((ax - ex) * rx + (ay - ey) * ry + (az - ez) * rz) / da, ya = CY - FL * ((ax - ex) * ux + (ay - ey) * uy + (az - ez) * uz) / da;
          const xb = CX + FL * ((bx - ex) * rx + (by - ey) * ry + (bz - ez) * rz) / db, yb = CY - FL * ((bx - ex) * ux + (by - ey) * uy + (bz - ez) * uz) / db;
          const m = 60 + 500 * FL / Math.min(da, db);
          if ((xa < -m && xb < -m) || (xa > 1920 + m && xb > 1920 + m) || (ya < -m && yb < -m) || (ya > 1080 + m && yb > 1080 + m)) continue;
        }
        let u = 0, first = true, pwx = 0, pwy = 0, pwz = 0, pk = 0, ptx = 0, pty = 0, ptz = 0, pd = 0;
        for (;;) {
          const wx = ax + (bx - ax) * u, wy = ay + (by - ay) * u, wz = az + (bz - az) * u;
          const dist = Math.hypot(wx - ex, wy - ey, wz - ez) + 1e-3, pxm = dist / FL;
          coastPoint(run, i, u, pxm / 1000, 0, 0);
          mapTo(tA, CQ[0], CQ[1], 0);
          const k = kvOf(tA[0], tA[1], tA[2]);
          const near = bl > .004 && k > 0;
          if (near) mapTo(tB, CQ[0] - CQ[2] * inl, CQ[1] - CQ[3] * inl, hTop);
          if (!first) {
            if (pk > 0 && k > 0) segW(pwx, pwy, pwz, tA[0], tA[1], tA[2], al * E.ss(0, fw, Math.min(pk, k)));
            if (near && pd < 1e9) segW(ptx, pty, ptz, tB[0], tB[1], tB[2], bl * E.ss(0, fw, Math.min(pk, k)));
          }
          first = false; pwx = tA[0]; pwy = tA[1]; pwz = tA[2]; pk = k; pd = near ? dist : 1e9;
          if (near) { ptx = tB[0]; pty = tB[1]; ptz = tB[2]; }
          if (u >= 1) break;
          u = Math.min(1, u + Math.max(.4, step * pxm) / Lm);
        }
        // bluff face: hatches every 12 m, world-fixed so they never swim
        if (hA > .004) {
          const dmin = Math.min(Math.hypot(ax - ex, ay - ey, az - ez), Math.hypot(bx - ex, by - ey, bz - ez));
          if (dmin < 1400 + Lm) {
            const s0 = run.A[i] * 1000, s1 = s0 + Lm, DH = 12;
            for (let s = Math.ceil(s0 / DH) * DH; s < s1; s += DH) {
              const u2 = (s - s0) / Lm, wx = ax + (bx - ax) * u2, wy = ay + (by - ay) * u2, wz = az + (bz - az) * u2;
              const dist = Math.hypot(wx - ex, wy - ey, wz - ez) + 1e-3, spx = DH * FL / dist;
              if (spx < 3) continue;
              coastPoint(run, i, u2, dist / FL / 1000, 0, 0);
              mapTo(tA, CQ[0], CQ[1], 0); mapTo(tB, CQ[0] - CQ[2] * inl, CQ[1] - CQ[3] * inl, hTop);
              segW(tB[0], tB[1], tB[2], tA[0], tA[1], tA[2], hA * E.ss(3, 9, spx));
            }
          }
        }
      }
    }
  }

  /* ---------- swell rows: offsets of the coast, smoothed in proportion to their distance ---------- */
  const SWELL = []; for (let k = 0; k < 15; k++) SWELL.push(18 + Math.pow(k, 2.1) * 12);
  const DMAX = new Float64Array(SWELL.length);
  function swell(o) {
    const al = o.al, t = o.t || 0, R2 = (o.radius || 6000) ** 2;
    if (al <= .004) return;
    const hgt0 = Math.max(1, S.hc);
    // past DMAX[k] row k is under 1.5 px from its neighbour everywhere, so it is never sampled
    for (let k = 0; k < SWELL.length; k++) { const dO = k ? SWELL[k] - SWELL[k - 1] : 18; DMAX[k] = Math.sqrt(dO * FL * hgt0 / 1.5) + SWELL[k]; }
    for (const run of COAST) {
      const P = run.P, n = run.n, Wc = run.W;           // world cache filled by coast()
      for (let i = 0; i < n - 1; i++) {
        const ax = Wc[3 * i], ay = Wc[3 * i + 1], az = Wc[3 * i + 2], bx = Wc[3 * i + 3], by = Wc[3 * i + 4], bz = Wc[3 * i + 5];
        const hx = (ax + bx) * .5 - ex, hz = (az + bz) * .5 - ez;
        if (hx * hx + hz * hz > R2) continue;
        if (depth(ax, ay, az) < -3500 && depth(bx, by, bz) < -3500) continue;
        const Lm = run.L[i] * 1000, s0 = run.A[i] * 1000;
        const dlo = Math.max(0, Math.min(Math.hypot(ax - ex, ay - ey, az - ez), Math.hypot(bx - ex, by - ey, bz - ez)) - Lm);
        for (let k = 0; k < SWELL.length; k++) {
          if (dlo > DMAX[k]) continue;
          const off = SWELL[k], dO = k ? off - SWELL[k - 1] : 18, ak = al * .3 * (1 - k / 18);
          let u = 0, first = true, px = 0, py = 0, pz = 0, pa = 0;
          for (;;) {
            const wx = ax + (bx - ax) * u, wy = ay + (by - ay) * u, wz = az + (bz - az) * u;
            const dist = Math.hypot(wx - ex, wy - ey, wz - ez) + 1e-3, pxm = dist / FL;
            const s = s0 + Lm * u;
            coastPoint(run, i, u, pxm / 1000, 3 * off / 1000, (off + 1.4 * Math.sin(s * .05 + t * .7 + k)) / 1000);
            mapTo(tA, CQ[0], CQ[1], 0);
            // rows merge at grazing angles: fade by their projected spacing
            const hgt = Math.max(1, S.hc), sp = dO * FL * hgt / (dist * dist);
            const a = ak * E.ss(1.5, 5, sp) * (1 - E.ss(R2 * .5, R2, (wx - ex) ** 2 + (wz - ez) ** 2)) * E.ss(0, .08, kvOf(tA[0], tA[1], tA[2]));
            if (!first && (a > .004 || pa > .004)) segW(px, py, pz, tA[0], tA[1], tA[2], (a + pa) * .5);
            first = false; px = tA[0]; py = tA[1]; pz = tA[2]; pa = a;
            if (u >= 1) break;
            // a row is smoothed down to wavelengths of 3 * its offset: sampling finer than off / 2 adds nothing
            u = Math.min(1, u + Math.max(2, 3.2 * pxm, off * .45) / Lm);
          }
        }
      }
    }
  }

  /* full-detail waterline near the site: z of the shore at local x (m), for placing things inland */
  const SHORE = (() => {
    const out = [], run = SITE_RUN;
    for (let i = Math.max(0, SITE_I - 12); i < Math.min(run.n - 1, SITE_I + 12); i++) {
      const Lm = run.L[i] * 1000, n = Math.ceil(Lm);
      for (let k = 0; k < n; k++) { coastPoint(run, i, k / n, 0, 0, 0); const p = mapP(CQ[0], CQ[1], 0); out.push([p[0], p[2]]); }
    }
    out.sort((a, b) => a[0] - b[0]);
    return out;
  })();
  function shoreZ(x) {
    let lo = 0, hi = SHORE.length - 1;
    if (x <= SHORE[0][0]) return SHORE[0][1]; if (x >= SHORE[hi][0]) return SHORE[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SHORE[m][0] < x) lo = m; else hi = m; }
    const a = SHORE[lo], b = SHORE[hi], u = (x - a[0]) / (b[0] - a[0] || 1);
    return a[1] + (b[1] - a[1]) * u;
  }

  return {
    RE, C, GH, D2R, SQ, SUN, LON0, dirLL, llOf, mapP, mapTo, mapInv, altOf, upAt, seaY, S,
    get SX() { return SX; }, get SZ() { return SZ; },
    bind, sync, segW, depth, kvOf, clear, eye, surfPath, runs, ringW, globe, mapLayers, coast, swell, shoreZ, detail,
    SQUARE, COAST,
  };
})();
