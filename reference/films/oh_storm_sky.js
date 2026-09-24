/* OH "Storm" weather: the low cloud (hairline strata on the cloud base, drifting on the wind), rain shafts hanging
   under the dense cells, near rain as slanted motion-blurred streaks (world lattice, depth-faded, gusting), the
   lightning (flicker envelope, branching bolts, the global lift of every hairline at flush) and the bow spray.
   All pure in film time T: the cloud and the rain drift by whole tiles per loop, so the seam is exact. */
(function () {
  'use strict';
  const { V, X, E } = M3;
  const { PI, TAU, D2R, RE, hash, modp, D, VK, WTO, CB } = OH;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OHS = window.OHS = {};
  const modI = (i, n) => ((i % n) + n) % n;

  /* ---------------- camera-space projection (no allocations) ---------------- */
  const PJ = [0, 0, 0];
  function pj(cam, x, y, z) {
    const e = cam.eye, f = cam.f, dx = x - e[0], dy = y - e[1], dz = z - e[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < cam.near) return false;
    const r = cam.r, u = cam.u;
    PJ[0] = cam.cx + cam.shake[0] + cam.fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc;
    PJ[1] = cam.cy + cam.shake[1] - cam.fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
    PJ[2] = zc;
    return true;
  }
  /* world segment, near-clipped, straight into the Wire's buckets */
  function segW(W, cam, ax, ay, az, bx, by, bz, al) {
    if (al <= .004) return;
    const e = cam.eye, f = cam.f, r = cam.r, u = cam.u, n = cam.near;
    const x0 = ax - e[0], y0 = ay - e[1], z0 = az - e[2], x1 = bx - e[0], y1 = by - e[1], z1 = bz - e[2];
    let A0 = x0 * r[0] + y0 * r[1] + z0 * r[2], B0 = x0 * u[0] + y0 * u[1] + z0 * u[2], C0 = x0 * f[0] + y0 * f[1] + z0 * f[2];
    let A1 = x1 * r[0] + y1 * r[1] + z1 * r[2], B1 = x1 * u[0] + y1 * u[1] + z1 * u[2], C1 = x1 * f[0] + y1 * f[1] + z1 * f[2];
    if (C0 < n && C1 < n) return;
    if (C0 < n) { const t = (n - C0) / (C1 - C0); A0 += (A1 - A0) * t; B0 += (B1 - B0) * t; C0 = n; }
    else if (C1 < n) { const t = (n - C1) / (C0 - C1); A1 += (A0 - A1) * t; B1 += (B0 - B1) * t; C1 = n; }
    const cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], fl = cam.fl;
    const px0 = cx + fl * A0 / C0, py0 = cy - fl * B0 / C0, px1 = cx + fl * A1 / C1, py1 = cy - fl * B1 / C1;
    const m = 40, Wd = cam.W, Hd = cam.H;
    if ((px0 < -m && px1 < -m) || (px0 > Wd + m && px1 > Wd + m) || (py0 < -m && py1 < -m) || (py0 > Hd + m && py1 > Hd + m)) return;
    W.seg2(px0, py0, px1, py1, al);
  }
  OHS.pj = pj; OHS.segW = segW; OHS.PJ = PJ;

  /* ================= lightning ================= */
  /* t: film time; cg: a bolt to the sea `dist` m out at `rel` deg right of the lens axis at t (placed from the camera
     path by OHS.buildBolts); ic: a flash inside the cloud (no bolt, lights the cloud around it). s: strength. */
  const FLASHES = OHS.FLASHES = [
    { t: 26.4, kind: 'cg', dist: 8200, rel: 12, s: .8 },
    { t: 43.3, kind: 'cg', dist: 2300, rel: 11, s: 1 },
    { t: 53.0, kind: 'ic', dist: 5200, rel: -14, s: .38 },
    { t: 91.2, kind: 'cg', dist: 4800, rel: 17, s: .9 },
    { t: 119.6, kind: 'cg', dist: 1500, rel: 13, s: 1 },
    { t: 138.4, kind: 'cg', dist: 10500, rel: 21, s: .55 },
    { t: 144.9, kind: 'ic', dist: 3600, rel: 2, s: .5 },
  ];
  for (const F of FLASHES) {
    const h = k => hash(F.t * 13.7, k);
    // a flash holds near full for dur s, flickering (dips between the return strokes), then goes out
    F.dur = F.kind === 'ic' ? .22 + .1 * h(1) : .14 + .05 * h(1);
    F.dips = F.kind === 'ic'
      ? [[.04 + .02 * h(2), .6], [.09 + .03 * h(3), .45], [.15 + .03 * h(4), .65], [.21 + .02 * h(5), .4]]
      : [[.032 + .01 * h(2), .55], [.074 + .015 * h(3), .35 + .2 * h(4)], [.112 + .015 * h(5), .6]];
  }
  /* flicker of one flash at age a: a plateau with dips, a fast fall, a faint afterglow */
  function flick(F, a) {
    if (a < 0 || a > 1.6) return 0;
    let v = ss(0, .006, a) * (1 - ss(F.dur, F.dur + .06, a));
    for (const [o, dep] of F.dips) { const b = (a - o) / .011; v *= 1 - dep * Math.exp(-b * b); }
    return Math.max(v, .1 * Math.exp(-Math.max(0, a - F.dur) / .35) * ss(0, .01, a)) * F.s;
  }
  OHS.flick = flick;
  // an in-cloud flash lights its own patch of cloud strongly and the rest of the scene only a little
  OHS.lift = T => { let v = 0; for (const F of FLASHES) { const a = T - F.t; if (a >= 0 && a < 1.6) v = Math.max(v, flick(F, a) * (F.kind === 'ic' ? .55 : 1)); } return Math.min(1, v); };

  /* bolts: a jagged channel from inside the cloud down to the sea (midpoint displacement), with branches forking
     down and out of its upper two thirds. Placed from the lens at each flash so every one is seen. */
  function frac(a, b, lv, k, r) {
    let pts = [a, b];
    for (let l = 0; l < lv; l++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], L = V.dist(p, q);
        out.push([(p[0] + q[0]) / 2 + (r() - .5) * 2 * k * L, (p[1] + q[1]) / 2 + (r() - .5) * k * L * .6, (p[2] + q[2]) / 2 + (r() - .5) * 2 * k * L], q);
      }
      pts = out;
    }
    return pts;
  }
  OHS.buildBolts = function (shotAt) {
    for (const F of FLASHES) {
      const s = shotAt(F.t), d = V.sub(s.target, s.eye), az = Math.atan2(d[0], d[2]) + F.rel * D2R, e = s.eye;
      const r = M3.rng(Math.floor(F.t * 1000) + 17);
      F.G0 = [e[0] + Math.sin(az) * F.dist, 0, e[2] + Math.cos(az) * F.dist];
      F.top = [F.G0[0] + (r() - .5) * 360, CB + 90, F.G0[2] + (r() - .5) * 360];
      F.lines = [];
      if (F.kind !== 'cg') { F.top[1] = CB + 60; continue; }
      const main = frac(F.top, F.G0, 7, .2, r);
      F.lines.push({ p: main, w: 1 });
      const nb = 4 + Math.floor(r() * 4);
      for (let k = 0; k < nb; k++) {
        const i0 = Math.floor(main.length * (.08 + .6 * r())), p0 = main[i0], dn = V.norm(V.sub(main[Math.min(main.length - 1, i0 + 6)], p0));
        const out = V.norm([dn[0] + (r() - .5) * 1.6, -.4 - .5 * r(), dn[2] + (r() - .5) * 1.6]);
        const len = 70 + 190 * r(), p1 = V.mad(p0, out, len);
        if (p1[1] < 4) p1[1] = 4;
        const br = frac(p0, p1, 5, .24, r);
        F.lines.push({ p: br, w: .5 + .2 * r() });
        if (r() < .5) { const j = Math.floor(br.length * (.3 + .4 * r())), q0 = br[j]; F.lines.push({ p: frac(q0, V.add(q0, [(r() - .5) * 80, -30 - 60 * r(), (r() - .5) * 80]), 4, .25, r), w: .3 }); }
      }
      // a few strokes inside the cloud base, spreading out from the channel's top
      for (let k = 0; k < 3; k++) { const a = r() * TAU, l = 250 + 400 * r(); F.lines.push({ p: frac(F.top, [F.top[0] + Math.cos(a) * l, CB + 30 + 60 * r(), F.top[2] + Math.sin(a) * l], 5, .18, r), w: .35, cloud: true }); }
    }
  };
  OHS.drawBolts = function (W, cam, T) {
    for (const F of FLASHES) {
      const a = T - F.t; if (a < 0 || a > F.dur + .45 || !F.lines.length) continue;
      const k = flick(F, a) / F.s, lin = Math.max(k, .18 * (1 - ss(F.dur, F.dur + .45, a)));
      for (const l of F.lines) {
        const al = lin * l.w * (l.cloud ? .7 : 1); if (al <= .004) continue;
        const p = l.p;
        for (let i = 0; i < p.length - 1; i++) segW(W, cam, p[i][0], p[i][1], p[i][2], p[i + 1][0], p[i + 1][1], p[i + 1][2], al);
        if (l.w < 1) continue;
        // the main channel twice, a pixel apart, so it carries over everything the flash lifts
        const sh0 = cam.shake[0]; cam.shake[0] += .9;
        for (let i = 0; i < p.length - 1; i++) segW(W, cam, p[i][0], p[i][1], p[i][2], p[i + 1][0], p[i + 1][1], p[i + 1][2], al * .8);
        cam.shake[0] = sh0;
      }
    }
  };
  /* cloud lit locally around the flashes: 0.. per world point */
  function cloudLit(x, z, T) {
    let v = 0;
    for (const F of FLASHES) {
      const a = T - F.t; if (a < 0 || a > 1.4) continue;
      const dx = x - F.top[0], dz = z - F.top[2], r = F.kind === 'ic' ? 2200 : 1900;
      v += flick(F, a) * Math.exp(-(dx * dx + dz * dz) / (2 * r * r));
    }
    return v;
  }

  /* the lifted flush: the Wire's buckets, every alpha raised toward full strength while the lightning is up */
  OHS.flush = function (W, ctx, lift) {
    ctx.lineCap = 'round';
    const ex = 1 - .74 * clamp(lift, 0, 1);
    for (const s of W.styles.values()) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      const NB = s.b.length;
      for (let k = 0; k < NB; k++) {
        const b = s.b[k]; if (!b.length) continue;
        const a = (k + .5) / NB; ctx.globalAlpha = lift > 0 ? Math.pow(a * a, ex) : a * a;
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 4) { ctx.moveTo(b[i], b[i + 1]); ctx.lineTo(b[i + 2], b[i + 3]); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  /* ================= the cloud ================= */
  /* periodic value noise on an Nu x Nv lattice: the cloud tile repeats every CT metres and drifts one tile per loop */
  function pnoise(Nu, Nv, seed) {
    const r = M3.rng(seed), T = new Float32Array(Nu * Nv);
    for (let i = 0; i < T.length; i++) T[i] = r();
    return (u, v) => {
      const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      const a = modI(iu, Nu), b = modI(iu + 1, Nu), c = modI(iv, Nv) * Nu, d = modI(iv + 1, Nv) * Nu;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      const x0 = T[c + a] + (T[c + b] - T[c + a]) * su, x1 = T[d + a] + (T[d + b] - T[d + a]) * su;
      return x0 + (x1 - x0) * sv;
    };
  }
  const CT = OHS.CT = 3000;
  const N1 = pnoise(6, 14, 11), N2 = pnoise(12, 28, 12), N3 = pnoise(24, 56, 13);
  const U1 = pnoise(5, 11, 21), U2 = pnoise(10, 22, 22);
  const WA = WTO[0], WB = WTO[2];
  const drift = T => modp(T, D) / D * CT;
  OHS.drift = drift;
  /* cloud-base density 0..1 at a world point (s along the wind, n across it; the tile drifts downwind) */
  function dens(x, z, dr) {
    const u = (x * WA + z * WB - dr) / CT, v = (x * WB - z * WA) / CT;
    const d = .55 * N1(u * 6, v * 14) + .3 * N2(u * 12, v * 28) + .15 * N3(u * 24, v * 56);
    return sat((d - .28) / .5);
  }
  function densHi(x, z, dr) {
    const u = (x * WA + z * WB - dr) / CT + .37, v = (x * WB - z * WA) / CT + .21;
    return sat((.65 * U1(u * 5, v * 11) + .35 * U2(u * 10, v * 22) - .3) / .45);
  }
  OHS.dens = (x, z, T) => dens(x, z, drift(T));

  /* the cloud base as rows across the view on the ceiling, one every DTH of elevation (even on screen whether the
     lens looks at the horizon or straight up); heights and alphas from the density, a higher stratum above */
  const DTH = .62 * D2R;
  OHS.drawClouds = function (W, cam, T, o) {
    o = o || {};
    const e = cam.eye, sk = OH.stormK(T), L = o.L || 0, A0 = (o.alpha === undefined ? 1 : o.alpha);
    let fx = cam.f[0], fz = cam.f[2];
    { const up = cam.u; if (Math.hypot(fx, fz) < .15) { fx = -up[0]; fz = -up[2]; } }
    const fh = Math.hypot(fx, fz) || 1; fx /= fh; fz /= fh;
    const rx = fz, rz = -fx;
    const tH = Math.tan(cam.fov / 2), tW = tH * cam.W / cam.H;
    // elevation range of the view in the lens's vertical plane
    let th0 = PI, th1 = 0;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const r = V.add(cam.f, V.add(V.mul(cam.r, sx * tW), V.mul(cam.u, sy * tH)));
      const th = Math.atan2(r[1], r[0] * fx + r[2] * fz);
      th0 = Math.min(th0, th); th1 = Math.max(th1, th);
    }
    th0 = Math.max(th0 - .02, .25 * D2R); th1 = Math.min(th1 + .02, PI - .25 * D2R);
    if (th1 <= th0) return;
    const dr = drift(T), vis = o.vis || 8000;
    const k0 = Math.ceil(th0 / DTH), k1 = Math.floor(th1 / DTH);
    for (const layer of [0, 1]) {
      const hc = (layer ? CB + 170 : CB) - e[1], la = layer ? .5 : 1;
      if (layer && sk < .02 && L < .02) continue;
      for (let k = k0; k <= k1; k++) {
        const th = k * DTH, st = Math.sin(th), ct = Math.cos(th), rho = hc / st, d = hc * ct / st;
        const hz = Math.abs(d);
        // far rows crowd into the cloud's own horizon: fade them, and fade into the murk (the flash opens it)
        let a = .36 * A0 * la * (1 - ss(20000, 60000, hz)) * mix(Math.exp(-Math.pow(rho / (vis * 3), 1.1)), 1, L * .8);
        a *= mix(.78, 1, sk);
        if (a < .004 && L < .02) continue;
        const half = Math.min(rho * tW * 1.35 + 60, 40000);
        const n = 40, du = 2 * half / n;
        const capY = Math.min(70, 1.3 * DTH * rho / Math.max(.25, Math.abs(ct)));
        let px = 0, py = 0, pv = false;
        for (let i = 0; i <= n; i++) {
          const u = -half + i * du;
          const x = e[0] + fx * d + rx * u, z = e[2] + fz * d + rz * u;
          const dn = layer ? densHi(x, z, dr) : dens(x, z, dr);
          const y = e[1] + hc - capY * dn - (d * d + u * u) / (2 * RE);
          if (!pj(cam, x, y, z)) { pv = false; continue; }
          const qx = PJ[0], qy = PJ[1];
          if (pv) {
            const lit = L > .01 || sk > 0 ? cloudLit(x, z, T) : 0;
            const al = a * (.1 + .9 * dn * Math.sqrt(dn)) * (1 + 2.5 * lit) + 1.1 * lit * (.25 + dn) * la;
            if (al > .004) W.seg2(px, py, qx, qy, al);
          }
          px = qx; py = qy; pv = true;
        }
      }
    }
  };

  /* ================= scud: ragged fragments under the base (fractus), strung along the wind ================= */
  const FG = 300, FN = CT / FG;
  OHS.drawScud = function (W, cam, T, o) {
    o = o || {};
    const sk = OH.stormK(T), L = o.L || 0; if (sk < .05 && L < .05) return;
    const e = cam.eye, dr = drift(T), vis = o.vis || 8000, Rm = 3600;
    const s0 = e[0] * WA + e[2] * WB - dr, n0 = e[0] * WB - e[2] * WA;
    const i0 = Math.floor((s0 - Rm) / FG), i1 = Math.floor((s0 + Rm) / FG), j0 = Math.floor((n0 - Rm) / FG), j1 = Math.floor((n0 + Rm) / FG);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const im = modI(i, FN), h = hash(im * 2.3 + 9.1, modI(j, 64) * 1.7 + 3.3);
      if (h > .55 * sk + .05) continue;                              // more fragments as the storm fills in
      const s = (i + .15 + .7 * hash(im, j + 11)) * FG + dr, n = (j + .15 + .7 * hash(j + 5, im)) * FG;
      const x = s * WA + n * WB, z = s * WB - n * WA;
      const dx = x - e[0], dz = z - e[2], dist = Math.hypot(dx, dz);
      if (dist > Rm) continue;
      const y0 = 190 + 110 * hash(im + 3, j), len = 90 + 160 * hash(im, j + 21), nl = 3 + Math.floor(3 * hash(j, im + 2));
      if (!pj(cam, x, y0, z) && dx * cam.f[0] + dz * cam.f[2] < 0) continue;
      const a = .13 * sat(sk * 1.4) * mix(Math.exp(-Math.pow(Math.hypot(dist, y0 - e[1]) / (vis * 1.6), 1.2)), 1, L * .8);
      if (a < .004) continue;
      for (let q = 0; q < nl; q++) {
        const hq = hash(i * 13 + q, j), yq = y0 + (q - nl / 2) * (7 + 6 * hq), lq = len * (.5 + .5 * hq), off = (hq - .5) * len * .4;
        const ax = WA, az = WB, px = -WB, pz = WA;                 // along / across the wind
        let pv = false, qx0 = 0, qy0 = 0, qz0 = 0;
        for (let k = 0; k <= 6; k++) {
          const u = -lq / 2 + lq * k / 6 + off, w = 6 * Math.sin(k * 1.9 + hq * 7 + q), dy = 3 * Math.sin(k * 2.7 + hq * 11);
          const X1 = x + ax * u + px * w, Y1 = yq + dy, Z1 = z + az * u + pz * w;
          if (pv) segW(W, cam, qx0, qy0, qz0, X1, Y1, Z1, a * Math.sin(PI * (k - .5) / 6) * (.6 + .4 * hq));
          qx0 = X1; qy0 = Y1; qz0 = Z1; pv = true;
        }
      }
    }
  };

  /* ================= rain shafts under the dense cells (world grid drifting with the cloud) ================= */
  const SG = 250, SN = CT / SG;
  OHS.drawShafts = function (W, cam, T, o) {
    o = o || {};
    const rk = OH.rainK(T), L = o.L || 0; if (rk < .12 && L < .05) return;
    const e = cam.eye, dr = drift(T), vis = o.vis || 8000, Rm = 5200, slant = .32 + .18 * OH.gust(T);
    const s0 = e[0] * WA + e[2] * WB - dr, n0 = e[0] * WB - e[2] * WA;
    const i0 = Math.floor((s0 - Rm) / SG), i1 = Math.floor((s0 + Rm) / SG), j0 = Math.floor((n0 - Rm) / SG), j1 = Math.floor((n0 + Rm) / SG);
    const A0 = .32 * sat((rk - .1) / .5) * (o.alpha === undefined ? 1 : o.alpha);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const h = hash(modI(i, SN) * 3.1 + 1.7, modI(j, 64) * 5.3 + .9); if (h > .62) continue;
      const s = (i + .2 + .6 * hash(modI(i, SN), j + 3)) * SG + dr, n = (j + .2 + .6 * hash(j, modI(i, SN) + 7)) * SG;
      const x = s * WA + n * WB, z = s * WB - n * WA;
      const dx = x - e[0], dz = z - e[2], dist = Math.hypot(dx, dz);
      if (dist < 230 || dist > Rm) continue;
      if (dx * cam.f[0] + dz * cam.f[2] < -300) continue;
      const dn = dens(x, z, dr); if (dn < .5) continue;
      const a = A0 * (dn - .4) * mix(Math.exp(-Math.pow(dist / (vis * 1.3), 1.2)), 1, L * .8) * ss(230, 600, dist);
      if (a < .003) continue;
      const top = CB - 60 * dn, nl = 3 + Math.floor(h * 8);
      for (let q = 0; q < nl; q++) {
        const w = (q / Math.max(1, nl - 1) - .5) * 70 * (1 + dn), hq = hash(i * 7 + q, j), ox = WB * w + (hq - .5) * 30 * WA, oz = -WA * w + (hq - .5) * 30 * WB;
        const tx = x + ox, tz = z + oz, sl = top * slant;
        // top (in the cloud) to the sea, blown downwind; faint at the top, strongest mid-fall
        const bx = tx + WA * sl, bz = tz + WB * sl;
        const mx = (tx + bx) / 2, mz = (tz + bz) / 2;
        segW(W, cam, tx, top, tz, mx, top * .5, mz, a * .6 * (.6 + .4 * hq));
        segW(W, cam, mx, top * .5, mz, bx, 0, bz, a * (.6 + .4 * hq));
      }
    }
  };

  /* ================= near rain: world lattice of drops, streaked by their motion relative to the lens ================= */
  const VF = 8.6, RHZ = 60, RN = D * RHZ, RDX = new Float64Array(RN + 1), RDY = new Float64Array(RN + 1), RDZ = new Float64Array(RN + 1);
  const rainVel = T => { const w = OH.windSpd(T) * .92; return [WA * w, -VF, WB * w]; };
  OHS.rainVel = rainVel;
  {
    for (let i = 1; i <= RN; i++) {
      const a = rainVel((i - 1) / RHZ), b = rainVel(i / RHZ);
      RDX[i] = RDX[i - 1] + (a[0] + b[0]) * .5 / RHZ; RDY[i] = RDY[i - 1] + (a[1] + b[1]) * .5 / RHZ; RDZ[i] = RDZ[i - 1] + (a[2] + b[2]) * .5 / RHZ;
    }
    // whole lattice periods per loop, so the drops at T = D stand where they stood at T = 0
    const res = v => modp(v + 32, 64) - 32;
    const rx = res(RDX[RN]), ry = res(RDY[RN]), rz = res(RDZ[RN]);
    for (let i = 0; i <= RN; i++) { RDX[i] -= rx * i / RN; RDY[i] -= ry * i / RN; RDZ[i] -= rz * i / RN; }
  }
  const OFF = new Float32Array(4096 * 3); { const r = M3.rng(4242); for (let i = 0; i < OFF.length; i++) OFF[i] = r(); }
  const RL = OHS.RL = [
    { c: 4, z0: .8, z1: 8, k: 22, a: .2, ex: .028 },
    { c: 8, z0: 8, z1: 24, k: 30, a: .19, ex: .034 },
    { c: 16, z0: 24, z1: 64, k: 38, a: .16, ex: .04 },
    { c: 32, z0: 64, z1: 150, k: 46, a: .11, ex: .045 },
  ];
  OHS.drawRain = function (W, cam, T, vcam, o) {
    o = o || {};
    const L = o.L || 0, g = OH.gust(T);
    const rk = OH.rainK(T) * mix(1, .7 + .3 * g, OH.stormK(T)) * (o.alpha === undefined ? 1 : o.alpha);
    if (rk < .01) return;
    const x = clamp(T * RHZ, 0, RN - .001), i = Math.floor(x), f = x - i;
    const dX = RDX[i] + (RDX[i + 1] - RDX[i]) * f, dY = RDY[i] + (RDY[i + 1] - RDY[i]) * f, dZ = RDZ[i] + (RDZ[i + 1] - RDZ[i]) * f;
    const v = rainVel(T), vx = v[0] - vcam[0], vy = v[1] - vcam[1], vz = v[2] - vcam[2];
    const e = cam.eye, cf = cam.f, cr = cam.r, cu = cam.u, fl = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const tH = Math.tan(cam.fov / 2), tW = tH * cam.W / cam.H, near = cam.near;
    for (const ly of RL) {
      const c = ly.c, K = Math.round(ly.k * rk); if (K < 1) continue;
      // the lightning freezes the drops: a short exposure
      const ex = mix(ly.ex, .006, L), sx = vx * ex, sy = vy * ex, sz = vz * ex;
      // cells overlapping the frustum slice [z0, z1]
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (const zz of [ly.z0, ly.z1]) for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const px = e[0] + cf[0] * zz + cr[0] * a * tW * zz + cu[0] * b * tH * zz, py = e[1] + cf[1] * zz + cr[1] * a * tW * zz + cu[1] * b * tH * zz, pz = e[2] + cf[2] * zz + cr[2] * a * tW * zz + cu[2] * b * tH * zz;
        if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py; if (pz < mnz) mnz = pz; if (pz > mxz) mxz = pz;
      }
      const i0 = Math.floor(mnx / c), i1 = Math.floor(mxx / c), j0 = Math.floor(Math.max(mny, -2) / c), j1 = Math.floor(mxy / c), k0 = Math.floor(mnz / c), k1 = Math.floor(mxz / c);
      const ox = modp(dX, c), oy = modp(dY, c), oz = modp(dZ, c), span = ly.z1 - ly.z0;
      for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) for (let ck = k0; ck <= k1; ck++) {
        const hc = (Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ Math.imul(ck, 83492791)) >>> 0;
        const bx = ci * c, by = cj * c, bz = ck * c;
        for (let m = 0; m < K; m++) {
          const q = ((hc + m * 1031) & 4095) * 3;
          let px = OFF[q] * c + ox, py = OFF[q + 1] * c + oy, pz = OFF[q + 2] * c + oz;
          if (px >= c) px -= c; if (py >= c) py -= c; if (pz >= c) pz -= c;
          px += bx - e[0]; py += by - e[1]; pz += bz - e[2];
          if (py + e[1] < 0) continue;                                     // under the sea surface
          const zc = px * cf[0] + py * cf[1] + pz * cf[2];
          if (zc < ly.z0 || zc > ly.z1) continue;
          const xc = px * cr[0] + py * cr[1] + pz * cr[2], yc = px * cu[0] + py * cu[1] + pz * cu[2];
          if (xc > zc * tW * 1.08 || -xc > zc * tW * 1.08 || yc > zc * tH * 1.1 || -yc > zc * tH * 1.1) continue;
          const tx = px - sx, ty = py - sy, tz = pz - sz;
          const zt = tx * cf[0] + ty * cf[1] + tz * cf[2];
          if (zt < near) continue;
          const xt = tx * cr[0] + ty * cr[1] + tz * cr[2], yt = tx * cu[0] + ty * cu[1] + tz * cu[2];
          const u = (zc - ly.z0) / span;
          const al = ly.a * (1 - .45 * u) * ss(ly.z0 * .95, ly.z0 * 1.4 + .6, zc) * (.55 + .45 * OFF[q + 1]);
          W.seg2(cx + fl * xc / zc, cy - fl * yc / zc, cx + fl * xt / zt, cy - fl * yt / zt, al);
        }
      }
    }
  };

  /* ================= bow spray ================= */
  /* each slam throws droplets off both flares (more to the side that buried), up and outboard; linear drag toward
     the relative wind carries them aft and to port across the forecastle while they fall. A sheet edge for the
     first half second, foam rings on the water at the stem. */
  const SPRAY_LIFE = 3.4;
  OHS.drawSpray = function (W, cam, S, T, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha;
    const list = OH.slamsAt(S, T, SPRAY_LIFE); if (!list.length) return;
    const wv = OH.windAt(T), G = 9.81;
    for (const { sl, age } of list) {
      const Xe = OH.shipXf(S, S.tau + sl.tau), n = Math.round(80 + 260 * sl.s), sd = sl.seed;
      const vShip = [0, 0, VK];
      // water runs up the flare and tears off at the knuckle and deck edge over a few tenths of a second
      const drop = (j, a) => {
        const h1 = hash(j, sd), h2 = hash(j, sd + 1.3), h3 = hash(j, sd + 2.9), h4 = hash(j, sd + 4.1), h5 = hash(j, sd + 5.7), h6 = hash(j, sd + 7.3);
        const side = h6 < (sl.side > 0 ? .7 : .3) ? 1 : -1;
        const z = 54 + 21 * h1, y = OH.DA.deckY(z) - 2.4 * h2 * h2, x = side * (OH.hB(z) * (.93 + .06 * h2) + .15);
        const p0 = X.ap(Xe, [x, y, z]);
        const up = (6 + 15 * h4) * (.5 + .5 * sl.s), out = (3 + 10 * h3 * h3) * (.6 + .4 * sl.s);
        const v0 = V.add(X.dir(Xe, [side * out, up, 2 + 4 * h5]), vShip);
        const td = .45 + 1.1 * h5;
        const vinf = [wv[0], wv[1] - G * td, wv[2]], k = td * (1 - Math.exp(-a / td));
        return [p0[0] + vinf[0] * a + (v0[0] - vinf[0]) * k, p0[1] + vinf[1] * a + (v0[1] - vinf[1]) * k, p0[2] + vinf[2] * a + (v0[2] - vinf[2]) * k];
      };
      const fade = 1 - ss(SPRAY_LIFE * .45, SPRAY_LIFE, age);
      for (let j = 0; j < n; j++) {
        const aj = age - .32 * hash(j, sd + 11.7);                      // when this bit tears off
        const lj = 1 + 2.2 * hash(j, sd + 9.1);                         // and how long it lives
        if (aj <= 0 || aj > lj) continue;
        const p = drop(j, aj), q = drop(j, Math.max(0, aj - .09));
        if (p[1] < -1.5) continue;
        const al = A * sl.s * .7 * fade * (1 - .7 * aj / lj) * ss(0, .05, aj);
        segW(W, cam, q[0], q[1], q[2], p[0], p[1], p[2], al);
      }
      // the sheet's edge: a fan along each flare in the first half second
      if (age < .8) {
        for (const side of [-1, 1]) {
          const w = side === sl.side ? 1 : .55;
          let pv = null;
          for (let k = 0; k <= 10; k++) {
            const z = 60 + k * 1.5, x = side * (OH.hW(z) + .3), p0 = X.ap(Xe, [x, .8, z]);
            const v0 = V.add(X.dir(Xe, [side * (5 + 6 * Math.sin(k / 10 * PI)), (10 + 12 * Math.sin(k / 10 * PI)) * (.55 + .45 * sl.s), 2]), vShip);
            const td = 1, vinf = [wv[0], wv[1] - G * td, wv[2]], kk = td * (1 - Math.exp(-age / td));
            const p = [p0[0] + vinf[0] * age + (v0[0] - vinf[0]) * kk, p0[1] + vinf[1] * age + (v0[1] - vinf[1]) * kk, p0[2] + vinf[2] * age + (v0[2] - vinf[2]) * kk];
            if (pv) segW(W, cam, pv[0], pv[1], pv[2], p[0], p[1], p[2], A * .45 * sl.s * w * (1 - age / .8));
            pv = p;
          }
        }
      }
      // foam rings spreading on the water from the stem
      const Fr = OH.shipFrame(S, S.tau + sl.tau);
      for (let q = 0; q < 3; q++) {
        const aq = age - q * .25; if (aq < 0 || aq > 2.6) continue;
        const rr = 4 + 7 * aq + q * 2, al = A * .3 * sl.s * (1 - aq / 2.6);
        const c = X.ap(Fr, [0, 0, 64 - VK * aq]);
        let pv = null;
        for (let i = 0; i <= 14; i++) {
          const th = -PI * .95 + i / 14 * PI * 1.9, x = c[0] + Math.sin(th) * rr * 1.3, z = c[2] + Math.cos(th) * rr;
          const y = OH.swellAt(x, z, T) * .95 + .15;
          if (pv && Math.abs(Math.sin(th)) > .25) segW(W, cam, pv[0], pv[1], pv[2], x, y, z, al);
          pv = [x, y, z];
        }
      }
    }
  };
})();
