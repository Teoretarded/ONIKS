/* OG "Bullet Time" combat effects (stage B). Stage A (og_bullet_time_film.js) calls each hook every frame, after the
   scene's hairlines and before the flush, as hook(T, S, K):
     T film time; S sim time (OG clock x1 .. x0.02, negative rate in the rewind); K.W the Wire; K.cam; K.glow(p, a,
     m, px, max) restrained additive bloom; K.hero {X, ciws, spin, gun} at S; K.rate clock rate; K.dim visibility.
   Every element is analytic in (S - its own event time) plus seeded hashes, over tables built once at load
   (interceptor smoke nodes, per-round tracer muzzles and leads, fragment impacts), so a slow clock holds it still,
   the rewind plays it backwards and nothing exists before the first launch (S < 3.56): the calm frame and the loop
   seam stay clean. Streaks (tracer dashes, fragment and spark tails) are a small floor plus the distance covered in
   one 1/30 s film exposure at the current clock rate: at x0.02 tracer streams stand as dashed lines and fragments
   hang with short tails, at x1 they smear into lines. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const { PI, TAU, hash, DA, VK } = OG;
  const HZ = OG.HZ, SEP = OG.SEP;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp, noise = M3.noise;
  const HI = '#F4D23C', WH = '#F6F5F2';
  const fr = x => x - Math.floor(x);
  const WIND = [1.8, 0, -3.6];
  const XP = r => Math.abs(r) / 30;          // sim seconds one 1/30 s film exposure spans at clock rate r

  /* ================= drawing primitives (screen space after one projection) ================= */
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
  const seg = (W, cam, a, b, al) => segW(W, cam, a[0], a[1], a[2], b[0], b[1], b[2], al);
  const offscreen = (cam, sx, sy, Rr) => sx + Rr < -30 || sx - Rr > cam.W + 30 || sy + Rr < -30 || sy - Rr > cam.H + 30;
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /* smoke billow: camera-facing scalloped outline with folds inside, lobes turning slowly with age; faded out when
     the lens is inside it */
  function billow(W, cam, x, y, z, r, al, seed, age, folds, nearMul) {
    if (al <= .004 || r <= 0 || !pj(cam, x, y, z)) return;
    const nm = nearMul || 1, zc = PJ[2], near = ss(r * .8 * nm, r * 2.6 * nm, zc);
    if (near <= 0) return;
    const Rp = r * cam.fl / zc;
    if (Rp < .7) return;
    const sx = PJ[0], sy = PJ[1];
    if (offscreen(cam, sx, sy, Rp)) return;
    al *= near * (1 - ss(700, 1600, Rp));
    if (al <= .004) return;
    const nl = 5 + Math.floor(fr(seed * 7.31) * 4), per = clamp(Math.round(Rp / (nl * 2.4)), 2, 7), n = Math.max(12, nl * per);
    const dep = .2 * ss(5, 16, Rp), f0 = 1 - dep;
    const sg = fr(seed * 3.7) < .5 ? 1 : -1, ph = seed * TAU + sg * age * .09, hs = seed * 131.7;
    let px = 0, py = 0;
    for (let i = 0; i <= n; i++) {
      const th = ph + i / n * TAU, li = i / n * nl, j = Math.floor(li) % nl;
      const f = f0 + dep * Math.abs(Math.sin(PI * li)) * (.65 + .7 * hash(j, hs));
      const qx = sx + Math.cos(th) * Rp * f, qy = sy - Math.sin(th) * Rp * f;
      if (i) W.seg2(px, py, qx, qy, al);
      px = qx; py = qy;
    }
    if (!folds || Rp < 5) return;
    const fa = al * .55, m = clamp(Math.round(Rp / 9), 3, 9);
    for (let k = 0; k < folds; k++) {
      const a0 = ph * 1.3 + k * 2.55 + seed * 4.1, ox = sx + Math.cos(a0) * Rp * .4, oy = sy - Math.sin(a0) * Rp * .4, rr = Rp * (.34 + .08 * hash(k, hs + 3));
      let qx0 = 0, qy0 = 0;
      for (let i = 0; i <= m; i++) {
        const th = a0 - 1.15 + 2.3 * i / m, qx = ox + Math.cos(th) * rr, qy = oy - Math.sin(th) * rr;
        if (i) W.seg2(qx0, qy0, qx, qy, fa);
        qx0 = qx; qy0 = qy;
      }
    }
  }
  function discS(W, cam, p, r, al, nMax) {
    if (al <= .004 || !pj(cam, p[0], p[1], p[2])) return;
    const zc = PJ[2]; if (zc < r * 1.1) return;
    const Rp = r * cam.fl / zc; if (Rp < .7) return;
    const sx = PJ[0], sy = PJ[1]; if (offscreen(cam, sx, sy, Rp)) return;
    const n = clamp(Math.round(Rp / 3.5), 16, Math.max(16, nMax || 40));
    let px = sx + Rp, py = sy;
    for (let i = 1; i <= n; i++) { const th = i / n * TAU, qx = sx + Math.cos(th) * Rp, qy = sy - Math.sin(th) * Rp; W.seg2(px, py, qx, qy, al); px = qx; py = qy; }
  }
  /* ring in a world plane (unit axes U, V): affine projection while small against its depth, the Wire's own when
     close; the half facing the lens at alF, the far half at alB; wob bends it into an irregular loop */
  function ringA(W, cam, c, U, Vv, r, alF, alB, nMax, wob, wph) {
    if (alF <= .004 || !pj(cam, c[0], c[1], c[2])) return;
    const zc = PJ[2];
    if (zc < r * 5) { if (zc > r * 1.2) W.ring(c, U, Vv, r, clamp(Math.round(nMax || 24), 8, 48), alF, alB); return; }
    const sx = PJ[0], sy = PJ[1], Rp = r * cam.fl / zc;
    if (Rp < .6 || offscreen(cam, sx, sy, Rp)) return;
    pj(cam, c[0] + U[0] * r, c[1] + U[1] * r, c[2] + U[2] * r); const ax = PJ[0] - sx, ay = PJ[1] - sy;
    pj(cam, c[0] + Vv[0] * r, c[1] + Vv[1] * r, c[2] + Vv[2] * r); const bx = PJ[0] - sx, by = PJ[1] - sy;
    const e = cam.eye, ex = e[0] - c[0], ey = e[1] - c[1], ez = e[2] - c[2];
    const du = U[0] * ex + U[1] * ey + U[2] * ez, dv = Vv[0] * ex + Vv[1] * ey + Vv[2] * ez;
    const n = clamp(Math.round(Rp / 3), 8, nMax || 32);
    wob = wob || 0; wph = wph || 0;
    let w = 1 + wob * Math.sin(wph), px = sx + ax * w, py = sy + ay * w;
    for (let i = 1; i <= n; i++) {
      const th = i / n * TAU, cs = Math.cos(th), sn = Math.sin(th);
      w = 1 + wob * Math.sin(3 * th + wph);
      const qx = sx + (ax * cs + bx * sn) * w, qy = sy + (ay * cs + by * sn) * w;
      const tm = (i - .5) / n * TAU;
      W.seg2(px, py, qx, qy, du * Math.cos(tm) + dv * Math.sin(tm) > 0 ? alF : alB);
      px = qx; py = qy;
    }
  }
  const UX = [1, 0, 0], UZ = [0, 0, 1];
  const ringH = (W, cam, c, r, al, n) => ringA(W, cam, c, UX, UZ, r, al, al * .7, n);
  function star(W, cam, p, L, minPx, al, seed, n, maxPx) {
    if (al <= .004 || !pj(cam, p[0], p[1], p[2])) return;
    const sx = PJ[0], sy = PJ[1], Lp = Math.min(maxPx || 1e4, Math.max(minPx, L * cam.fl / PJ[2]));
    if (offscreen(cam, sx, sy, Lp)) return;
    for (let k = 0; k < n; k++) {
      const th = (k + .5 * hash(k, seed)) / n * TAU + seed, long = k % 2 === 0, l = Lp * (long ? .7 + .3 * hash(k + 5, seed) : .25 + .2 * hash(k + 5, seed)), l0 = l * .1;
      W.seg2(sx + Math.cos(th) * l0, sy - Math.sin(th) * l0, sx + Math.cos(th) * l, sy - Math.sin(th) * l, al * (long ? 1 : .6));
    }
  }
  function perp(d) {
    let U = V.cross(d, Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0]); U = V.norm(U);
    return [U, V.cross(d, U)];
  }
  /* a hairline sphere (a blast front, a fireball shell): latitude rings and meridians about a seeded axis, the far
     half fainter; wob makes it lumpy, spin turns it slowly with its age */
  function shell(W, cam, c, r, al, seed, nLat, nLon, wob, spin) {
    if (al <= .004 || r <= 0 || !pj(cam, c[0], c[1], c[2])) return;
    const zc = PJ[2]; if (zc < r * 1.3) return;
    const Rp = r * cam.fl / zc; if (Rp < 1 || offscreen(cam, PJ[0], PJ[1], Rp)) return;
    if (Rp < 8) { discS(W, cam, c, r, al, 16); return; }
    al *= 1 - ss(r * 1.3, r * 2.2, -zc + r * 3.5);   // fade as the lens closes on the surface
    const a1 = hash(1, seed) * TAU + (spin || 0), cz = hash(2, seed) * 1.6 - .8, sz = Math.sqrt(1 - cz * cz);
    const N = [sz * Math.cos(a1), cz, sz * Math.sin(a1)], [U, Vv] = perp(N);
    const n = clamp(Math.round(Rp / 4), 14, 44);
    for (let i = 0; i < nLat; i++) {
      const ph = -PI / 2 + PI * (i + 1) / (nLat + 1), sp = Math.sin(ph) * r, cp = Math.cos(ph) * r;
      ringA(W, cam, [c[0] + N[0] * sp, c[1] + N[1] * sp, c[2] + N[2] * sp], U, Vv, cp, al, al * .3, n, wob, seed * 3 + i);
    }
    for (let j = 0; j < nLon; j++) {
      const th = j / nLon * PI + seed, ct = Math.cos(th), st = Math.sin(th);
      ringA(W, cam, c, [U[0] * ct + Vv[0] * st, U[1] * ct + Vv[1] * st, U[2] * ct + Vv[2] * st], N, r, al * .75, al * .22, n, wob, seed * 5 + j);
    }
  }

  /* ================= exhaust: a hanging cone ================= */
  /* The flame's meridians pinch at each shock diamond (the Mach disks drawn as rings), a longer faint mixing layer
     wraps it; flicker and turbulence run on S, so a slow clock holds the shape still. Far off: a stroke and a glow. */
  const PLM = {
    boost: { R0: .3, Rm: .8, lam: 1.5, Lc: 11, Lo: 26, M: 10, Mo: 7, nr: 5, al: .95, gm: 7, ga: .5, gmax: 110 },
    sust: { R0: .12, Rm: .3, lam: .7, Lc: 4.2, Lo: 10, M: 7, Mo: 5, nr: 4, al: .62, gm: 2.5, ga: .26, gmax: 55 },
    ram: { R0: .29, Rm: .38, lam: .82, Lc: 5.6, Lo: 13, M: 8, Mo: 5, nr: 5, al: .62, gm: 2.2, ga: .3, gmax: 60 },
  };
  function plumeCone(W, cam, K, nz, dir, P, S, A, seed, Lmax) {
    if (A <= .004) return;
    const fk = .5 + .5 * noise(S * 31 + seed, 1.7);
    let Lc = P.Lc * (.88 + .24 * fk), Lo = P.Lo * (.85 + .3 * fk);
    if (Lmax !== undefined) { Lc = Math.min(Lc, Lmax); Lo = Math.min(Lo, Lmax * 1.15); }
    const ax0 = -dir[0], ax1 = -dir[1], ax2 = -dir[2];
    if (Lc < .05) { K.glow(nz, A * P.ga * .6, P.gm * .5, 4, P.gmax); return; }
    K.glow([nz[0] + ax0 * Lc * .18, nz[1] + ax1 * Lc * .18, nz[2] + ax2 * Lc * .18], A * P.ga * (.8 + .2 * fk), P.gm, 4, P.gmax);
    const d = dist3(nz, cam.eye), Lpx = Lo * cam.fl / Math.max(1, d);
    if (Lpx < 34) { segW(W, cam, nz[0], nz[1], nz[2], nz[0] + ax0 * Math.max(Lc * .8, d * .004), nz[1] + ax1 * Math.max(Lc * .8, d * .004), nz[2] + ax2 * Math.max(Lc * .8, d * .004), A * P.al); return; }
    const [U, Vv] = perp(dir), lam = P.lam, ns = clamp(Math.round(Lpx / 12), 8, 30);
    const rad = x => {
      const env = P.R0 + (P.Rm - P.R0) * (1 - Math.exp(-x / (lam * 1.1)));
      const taper = 1 - Math.pow(Math.min(1, x / Lc), 2.4);
      const b = Math.pow(Math.abs(Math.cos(PI * (x - .72 * lam) / lam)), 4);
      return env * taper * (1 - .44 * (1 - .55 * x / Lc) * b);
    };
    // core: meridians swelling and pinching through the diamonds
    for (let k = 0; k < P.M; k++) {
      const ph = k / P.M * TAU + seed, c = Math.cos(ph), sn = Math.sin(ph);
      const ox = U[0] * c + Vv[0] * sn, oy = U[1] * c + Vv[1] * sn, oz = U[2] * c + Vv[2] * sn;
      let px = nz[0] + ox * P.R0, py = nz[1] + oy * P.R0, pz = nz[2] + oz * P.R0;
      for (let q = 1; q <= ns; q++) {
        const x = Lc * q / ns, rr = rad(x) * (1 + .07 * noise(S * 23 + k * 2.3, x * .9 + seed));
        const qx = nz[0] + ax0 * x + ox * rr, qy = nz[1] + ax1 * x + oy * rr, qz = nz[2] + ax2 * x + oz * rr;
        segW(W, cam, px, py, pz, qx, qy, qz, A * P.al * .7 * (1 - .65 * x / Lc));
        px = qx; py = qy; pz = qz;
      }
    }
    // the Mach disks: a ring at each pinch and the disk itself inside it
    for (let i = 0; i < P.nr; i++) {
      const x = (i + .72) * lam * (1 + .05 * i); if (x > Lc * .9) break;
      const rr = rad(x), al = A * P.al * Math.pow(1 - i / P.nr, 1.1), c = [nz[0] + ax0 * x, nz[1] + ax1 * x, nz[2] + ax2 * x];
      ringA(W, cam, c, U, Vv, rr * 1.04, al * .75, al * .4, 30);
      ringA(W, cam, c, U, Vv, rr * .46, al, al * .7, 20);
    }
    // mixing layer: longer, wider, turbulent, faint
    for (let k = 0; k < P.Mo; k++) {
      const ph = (k + .5) / P.Mo * TAU + seed * 1.7, c = Math.cos(ph), sn = Math.sin(ph);
      const ox = U[0] * c + Vv[0] * sn, oy = U[1] * c + Vv[1] * sn, oz = U[2] * c + Vv[2] * sn;
      let px = nz[0] + ox * P.R0 * 1.15, py = nz[1] + oy * P.R0 * 1.15, pz = nz[2] + oz * P.R0 * 1.15;
      for (let q = 1; q <= ns; q++) {
        const x = Lo * q / ns, u = Math.min(1, q / ns);
        const env = P.Rm * (1.3 + 1.1 * u) * (1 - u * u * u) * (1 - .7 * Math.exp(-x / (lam * .7)));
        const rr = env * (1 + .3 * noise(S * 6 + k * 1.9, x * .35 + seed)), sw = env * .25 * noise(S * 5 + k, x * .3 + 9.1);
        const qx = nz[0] + ax0 * x + ox * rr + U[0] * sw, qy = nz[1] + ax1 * x + oy * rr + U[1] * sw, qz = nz[2] + ax2 * x + oz * rr + U[2] * sw;
        segW(W, cam, px, py, pz, qx, qy, qz, A * P.al * .3 * Math.pow(1 - u, 1.2));
        px = qx; py = qy; pz = qz;
      }
    }
  }

  /* ================= debris ================= */
  // sparks: ballistic, short-lived; n (optional) reflects them out of a surface
  function mkSparks(n, seed, v0, v1, up, nrm) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.4, 1.25, hash(k + 3, seed)) + (up || 0), v = mix(v0, v1, hash(k + 9, seed));
      let q = [Math.cos(az) * Math.cos(el) * v, Math.sin(el) * v, Math.sin(az) * Math.cos(el) * v];
      if (nrm) { const dn = V.dot(q, nrm); if (dn < 0) q = V.mad(q, nrm, -2 * dn); }
      o.push([q[0], q[1], q[2], .7 + 1.3 * hash(k + 5, seed)]);
    }
    return o;
  }
  function drawSparks(W, cam, c, Sp, age, al, xp) {
    const tail = .0035 + xp * .8;
    for (const s of Sp) {
      if (age > s[3]) continue;
      const a0 = Math.max(0, age - tail);
      segW(W, cam, c[0] + s[0] * a0, c[1] + s[1] * a0 - 4.9 * a0 * a0, c[2] + s[2] * a0, c[0] + s[0] * age, c[1] + s[1] * age - 4.9 * age * age, c[2] + s[2] * age, al * Math.pow(1 - age / s[3], 1.3));
    }
  }
  function fragAt(F, a) {
    const k = F.tau * (1 - Math.exp(-a / F.tau)), p = F.p, v = F.v;
    return [p[0] + v[0] * k, p[1] + v[1] * k - 4.9 * a * a, p[2] + v[2] * k];
  }
  // inside the hull at the hit (ship frame of Xs)?
  function inHull(Xs, q) {
    const l = OG.toShip(Xs, V.sub(q, Xs.T));
    return Math.abs(l[2]) < 77 && l[1] > -1 && l[1] < DA.deckY(l[2]) + .3 && Math.abs(l[0]) < OG.halfB(l[2]) + .05;
  }
  // fragments with momentum v0 (m/s), spread, drag time tau; each ends in the sea (a splash) or, with hullX, on the hull
  function mkFrags(p, v0, n, seed, k0, k1, spread, tau, upBias, hullX) {
    const o = [];
    for (let k = 0; k < n; k++) {
      const az = hash(k, seed) * TAU, el = mix(-.5, 1.1, hash(k + 1, seed)) + (upBias || 0), sp = spread * (.3 + .7 * hash(k + 2, seed));
      const kk = mix(k0, k1, hash(k + 4, seed));
      const v = [v0[0] * kk + Math.cos(az) * Math.cos(el) * sp, v0[1] * kk + Math.sin(el) * sp, v0[2] * kk + Math.sin(az) * Math.cos(el) * sp];
      const F = { v, tau, p, big: hash(k + 6, seed), tImp: 8, imp: null, hull: false, h: hash(k + 8, seed) };
      for (let a = .002; a < 8; a += a < .2 ? .002 : .006) {
        const q = fragAt(F, a);
        if (hullX && a > .004 && inHull(hullX, q)) { F.tImp = a; F.imp = q; F.hull = true; break; }
        if (q[1] <= 0) { F.tImp = a; F.imp = [q[0], 0, q[2]]; break; }
      }
      o.push(F);
    }
    return o;
  }
  function splash(W, cam, x, z, a, sz, al, seed, S) {
    if (a < 0 || a > 2.6 || al <= .004) return;
    const y0 = OG.swell(x, z, S) * .9;
    if (a < 1.5) for (let k = 0; k < 4; k++) {
      const dur = 1.1 + .4 * hash(k, seed + 1), u = a / dur; if (u >= 1) continue;
      const hk = sz * (.55 + .7 * hash(k, seed)) * Math.sin(PI * u), lean = (hash(k, seed + 2) - .5) * .6 * sz, ang = hash(k, seed + 3) * TAU;
      segW(W, cam, x + Math.cos(ang) * lean * .2, y0, z + Math.sin(ang) * lean * .2, x + Math.cos(ang) * lean, y0 + hk, z + Math.sin(ang) * lean, al * (1 - u * .6));
    }
    ringH(W, cam, [x, y0 + .05, z], .3 * sz + 1.6 * sz * Math.pow(a, .6), al * .5 * (1 - a / 2.6), 18);
  }
  // a fragment's own shape: a small tumbling sliver
  function chip(W, cam, p, s, h, a, al) {
    const th = h * 40 + a * (5 + 11 * h), ph = h * 17 + a * (3 + 7 * h);
    const u0 = Math.cos(th), u1 = Math.sin(ph) * .6, u2 = Math.sin(th);
    const v0 = -Math.sin(th) * Math.cos(ph), v1 = Math.cos(ph) * .8 + .2, v2 = Math.cos(th) * Math.cos(ph);
    let px = 0, py = 0, pz = 0, fx = 0, fy = 0, fz = 0;
    for (let i = 0; i <= 3; i++) {
      const t = (i % 3) / 3 * TAU + h * 5, rr = s * (i % 3 === 1 ? .55 : 1);
      const qx = p[0] + (u0 * Math.cos(t) + v0 * Math.sin(t)) * rr, qy = p[1] + (u1 * Math.cos(t) + v1 * Math.sin(t)) * rr, qz = p[2] + (u2 * Math.cos(t) + v2 * Math.sin(t)) * rr;
      if (i) segW(W, cam, px, py, pz, qx, qy, qz, al); else { fx = qx; fy = qy; fz = qz; }
      px = qx; py = qy; pz = qz;
    }
  }
  function drawFrags(W, cam, Fs, a, al, S, splashSz, xp, chips) {
    const dt = .006 + xp * .9;
    for (const F of Fs) {
      if (a < F.tImp) {
        const q0 = fragAt(F, Math.max(0, a - dt)), q1 = fragAt(F, a);
        const w = al * (.45 + .55 * F.big) * (1 - .4 * a / F.tImp);
        seg(W, cam, q0, q1, w * .75);
        if (chips && F.big > .4) chip(W, cam, q1, chips * (.35 + (F.big - .4) * 1.4), F.h, a, w);
      } else if (F.hull) {
        const b = a - F.tImp; if (b < .25) star(W, cam, F.imp, .6, 3, al * (1 - b / .25), F.h * 50, 6, 40);
      } else if (F.imp && splashSz && F.big > .35) splash(W, cam, F.imp[0], F.imp[2], a - F.tImp, splashSz * (.5 + F.big), al * .8, F.h * 97, S);
    }
  }
  // the round's broken body: tumbling tube sections with torn ends
  function mkChunks(p, v0, n, seed, k0, k1, spread, tau) {
    const out = [], LEN = [2.4, 2.1, 1.6, 1.1, .8];
    const Fs = mkFrags(p, v0, n, seed, k0, k1, spread, tau, -.35);
    Fs.forEach((F, k) => {
      const d0 = V.norm(V.add(V.norm(v0), [(hash(k, seed + 20) - .5) * .5, (hash(k, seed + 21) - .5) * .4, (hash(k, seed + 22) - .5) * .5]));
      const [U] = perp(d0), ang = hash(k, seed + 23) * TAU, ax = V.norm(V.add(V.mul(U, Math.cos(ang)), V.mul(V.cross(d0, U), Math.sin(ang))));
      out.push(Object.assign(F, { d0, ax, w: (3 + 7 * hash(k, seed + 24)) * (hash(k, seed + 25) < .5 ? -1 : 1), L: LEN[k % LEN.length], r: .35 }));
    });
    return out;
  }
  function drawChunks(W, cam, Cs, a, al, S, xp) {
    for (const C of Cs) {
      if (a >= C.tImp) { if (C.imp) splash(W, cam, C.imp[0], C.imp[2], a - C.tImp, 7, al * .8, C.h * 71, S); continue; }
      const c = fragAt(C, a), th = C.w * a, cs = Math.cos(th), sn = Math.sin(th), d0 = C.d0, k = C.ax;
      const kx = V.cross(k, d0), axis = [d0[0] * cs + kx[0] * sn, d0[1] * cs + kx[1] * sn, d0[2] * cs + kx[2] * sn];
      const U = k, Vv = V.cross(axis, k), L = C.L * .5, fa = al * (1 - .3 * a / C.tImp);
      const n = 8, P0 = [], P1 = [];
      for (let i = 0; i < n; i++) {
        const t = i / n * TAU, ct = Math.cos(t), st = Math.sin(t);
        const j0 = L * (1 - .22 * hash(i, C.h * 31)), j1 = L * (1 - .22 * hash(i + 11, C.h * 31)), rr = C.r * (.9 + .2 * hash(i + 5, C.h * 13));
        const o = [(U[0] * ct + Vv[0] * st) * rr, (U[1] * ct + Vv[1] * st) * rr, (U[2] * ct + Vv[2] * st) * rr];
        P0.push([c[0] - axis[0] * j0 + o[0], c[1] - axis[1] * j0 + o[1], c[2] - axis[2] * j0 + o[2]]);
        P1.push([c[0] + axis[0] * j1 + o[0], c[1] + axis[1] * j1 + o[1], c[2] + axis[2] * j1 + o[2]]);
      }
      for (let i = 0; i < n; i++) {
        seg(W, cam, P0[i], P0[(i + 1) % n], fa * .8); seg(W, cam, P1[i], P1[(i + 1) % n], fa * .8);
        if (i === 0 || i === 3 || i === 5) seg(W, cam, P0[i], P1[i], fa * .55);
      }
      // its tail of smoke and sparks
      const q0 = fragAt(C, Math.max(0, a - .006 - xp * .9));
      seg(W, cam, q0, c, fa * .5);
    }
  }
  /* a burst cloud: billows around c, grown and drifting, optionally carried on along push [vx, vy, vz, tau] */
  function puffs(W, cam, c, a, n, r0, rg, spread, al, seed, sink, push) {
    for (let k = 0; k < n; k++) {
      const ak = a - k * .05; if (ak <= 0) continue;
      const h1 = hash(k, seed), h2 = hash(k + 1, seed), h3 = hash(k + 2, seed);
      let x = c[0] + (h1 - .5) * spread + WIND[0] * ak, y = c[1] + (h2 - .5) * spread * .6 - (sink || 0) * ak, z = c[2] + (h3 - .5) * spread + WIND[2] * ak;
      if (push) { const kk = push[3] * (1 - Math.exp(-ak / push[3])); x += push[0] * kk; y += push[1] * kk; z += push[2] * kk; }
      billow(W, cam, x, y, z, (r0 + rg * Math.sqrt(ak)) * (.7 + .6 * hash(k + 3, seed)), al * ss(0, .35, ak), seed + k * 1.618, ak, k % 2 ? 1 : 2);
    }
  }

  /* ================= SM-6: launch, plumes, trails, separation ================= */
  const MK72 = FAST.compile(HD.mk72(), { fine: false });
  const SM6N = HD.sm6.NOZZLES, SM6_NOSE = 3.275, NZB = 6.72, NZS = 4.96;
  const RISE = a => 1.4 * (1 - Math.exp(-a / 3)) + .14 * a;
  const JSTEP = [4, 6, 10];
  for (const I of OG.INTS) {
    const P = I.P, N = I.N, cum = new Float64Array(N);
    for (let j = 1; j < N; j++) cum[j] = cum[j - 1] + Math.hypot(P[j * 3] - P[j * 3 - 3], P[j * 3 + 1] - P[j * 3 - 2], P[j * 3 + 2] - P[j * 3 - 1]);
    I.cum = cum; I.seed = 11.3 + I.i * 7.77; I.jSep = Math.round(SEP * HZ);
    const sm = j => [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]];
    const tan = j => V.norm(V.sub(sm(Math.min(N - 1, j + 1)), sm(Math.max(0, j - 1))));
    // smoke is laid at the nozzle (the Mk 72 cluster, then the Mk 104), a few metres behind the head
    const TN = new Float64Array(N * 3);
    for (let j = 0; j < N; j++) { const t = tan(j), o = j < I.jSep ? NZB : NZS; TN[j * 3] = P[j * 3] - t[0] * o; TN[j * 3 + 1] = P[j * 3 + 1] - t[1] * o; TN[j * 3 + 2] = P[j * 3 + 2] - t[2] * o; }
    I.TN = TN;
    const tn = j => [TN[j * 3], TN[j * 3 + 1], TN[j * 3 + 2]];
    // until the nozzle clears the cell its smoke goes down the plenum and out of the uptake: the trail starts there
    let j0 = 0; while (j0 < N - 1 && cum[j0] < 7) j0++;
    I.j0 = j0;
    const nodes = []; let d = 9, j = 0;
    const jFly = Math.min(N - 2, Math.floor((I.tI - I.tL) * HZ));
    for (;;) {
      while (j < N - 1 && cum[j] < d) j++;
      if (j >= jFly) break;
      const t = tan(j), [U, Vv] = perp(t), boost = j < I.jSep;
      nodes.push({ j, s: I.tL + j / HZ, p: tn(j), U, V: Vv, h: hash(nodes.length, I.i + 17), boost });
      d += boost ? 4.6 + .055 * d : Math.max(45, .07 * d);
    }
    I.nodes = nodes;
    const c = DA.vls(I.cell), xm = [-3.15, -1.05, 1.05, 3.15].reduce((b, q) => Math.abs(q - c[0]) < Math.abs(b - c[0]) ? q : b, 99);
    I.upL = [xm, c[1] + .05, c[2]]; I.cellL = c;
    I.upW = X.ap(OG.shipXf(I.tL), I.upL);
    const ts = I.tL + SEP, hs = OG.intAt(I, ts), dir = OG.intDir(I, ts);
    const v = V.mul(V.sub(OG.intAt(I, ts + .02), OG.intAt(I, ts - .02)), 1 / .04);
    I.bst = { p: V.mad(hs, dir, -5.7), v: V.mul(v, .92), dir, ax: perp(dir)[0], w: 3.2 + 2 * hash(I.i, 3) };
  }
  const bstAt = (b, a) => { const k = 1.6 * (1 - Math.exp(-a / 1.6)); return [b.p[0] + b.v[0] * k, b.p[1] + b.v[1] * k - 4.9 * a * a, b.p[2] + b.v[2] * k]; };

  const NBUF = 2048, BX = new Float64Array(NBUF), BY = new Float64Array(NBUF), BW = new Float64Array(NBUF), BA = new Float64Array(NBUF), BG = new Float64Array(NBUF);
  const NX = new Float64Array(NBUF), BOK = new Uint8Array(NBUF);
  function meander(I, j, age, o) {
    const amp = .3 + 1.15 * Math.pow(age, .8), u = j * .02 + I.seed, v = age * .07;
    o[0] = amp * noise(u, v, 1.7); o[1] = amp * .6 * noise(u, v, 5.3); o[2] = amp * noise(u, v, 8.9);
    return o;
  }
  const MQ = [0, 0, 0];
  const trailW = (age, boost) => boost ? .8 + 2.5 * Math.sqrt(age) : .4 + 1.4 * Math.sqrt(age);
  /* the laid trail: broken wispy edges of the column, a hot core near the motor, billows riding it and fresh smoke
     rings shed across the booster's stretch; all of it hangs when the clock stops */
  function drawTrail(W, cam, I, S, A) {
    const s1 = Math.min(S, I.tEnd) - I.tL; if (s1 <= 0) return;
    const P = I.TN, jN = Math.min(I.N - 1, Math.floor(s1 * HZ)), fl = cam.fl, sd = I.seed;
    if (jN <= I.j0) return;
    let n = 0;
    const put = (x, y, z, age, boost, j) => {
      if (pj(cam, x, y, z)) {
        BX[n] = PJ[0]; BY[n] = PJ[1]; BW[n] = Math.min(900, trailW(age, boost) * fl / PJ[2]); BOK[n] = 1; BG[n] = age; NX[n] = j;
        BA[n] = (boost ? .3 * (.4 + .6 * Math.exp(-age / 1.8)) * Math.exp(-age / 22) : .2 * (.4 + .6 * Math.exp(-age / 1.2)) * Math.exp(-age / 14))
          * ss(0, .06, age) * (1 - ss(260, 700, BW[n]));
      } else BOK[n] = 0;
      n++;
    };
    for (let j = I.j0; n < NBUF - 2;) {
      const age = S - (I.tL + j / HZ);
      meander(I, j, age, MQ);
      put(P[j * 3] + WIND[0] * age + MQ[0], P[j * 3 + 1] + RISE(age) + MQ[1], P[j * 3 + 2] + WIND[2] * age + MQ[2], age, j < I.jSep, j);
      if (j === jN) break;
      j = Math.min(jN, j + JSTEP[j < I.jSep ? 0 : j < I.jSep + 480 ? 1 : 2]);
    }
    if (S < I.tEnd) { const h = OG.intAt(I, S), dr = OG.intDir(I, S), o = S - I.tL < SEP ? NZB : NZS; if (h) put(h[0] - dr[0] * o, h[1] - dr[1] * o, h[2] - dr[2] * o, 0, S - I.tL < SEP, jN + 1); }
    let pxL = 0, pyL = 0, pxR = 0, pyR = 0, prev = false;
    for (let i = 0; i < n; i++) {
      if (!BOK[i]) { prev = false; continue; }
      const a = i > 0 && BOK[i - 1] ? i - 1 : i, b = i < n - 1 && BOK[i + 1] ? i + 1 : i;
      const tx = BX[b] - BX[a], ty = BY[b] - BY[a], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
      const j = NX[i], g = BG[i], w = BW[i], u = j * .045 + sd, v = g * .22;
      const wl = w * (1 + .32 * noise(u, v, 2.1)), wr = w * (1 + .32 * noise(u, v, 6.7));
      const qxL = BX[i] + nx * wl, qyL = BY[i] + ny * wl, qxR = BX[i] - nx * wr, qyR = BY[i] - ny * wr;
      if (prev) {
        const al = (BA[i] + BA[i - 1]) * .5 * A;
        if (w < 1.1) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], al * 1.5);
        else {
          const bL = sat(.55 + 1.3 * noise(u * .8, v, 9.2)), bR = sat(.55 + 1.3 * noise(u * .8, v, 13.4));
          W.seg2(pxL, pyL, qxL, qyL, al * bL); W.seg2(pxR, pyR, qxR, qyR, al * bR);
        }
        if (g < 1.2) W.seg2(BX[i - 1], BY[i - 1], BX[i], BY[i], A * .5 * (1 - g / 1.2));
      }
      pxL = qxL; pyL = qyL; pxR = qxR; pyR = qyR; prev = true;
    }
    for (const nd of I.nodes) {
      if (nd.s > S) break;
      const age = S - nd.s;
      meander(I, nd.j, age, MQ);
      const x = nd.p[0] + WIND[0] * age + MQ[0], y = nd.p[1] + RISE(age) + MQ[1], z = nd.p[2] + WIND[2] * age + MQ[2];
      const w = trailW(age, nd.boost);
      const ab = A * (nd.boost ? .2 * (.35 + .65 * Math.exp(-age / 2.2)) * Math.exp(-age / 20) : .13 * (.4 + .6 * Math.exp(-age / 1.5)) * Math.exp(-age / 12)) * ss(.05, .5, age);
      billow(W, cam, x, y, z, w * (1.1 + .3 * nd.h), ab, sd + nd.h * 57, age, nd.boost && nd.h > .4 ? 1 : 0);
      if (nd.boost && age < 3) {
        const ar = A * .36 * Math.pow(1 - age / 3, 1.5) * ss(0, .06, age);
        ringA(W, cam, [x, y, z], nd.U, nd.V, w, ar, ar * .4, 28, .08 + .1 * sat(age / 2), nd.h * 20 + age * .5);
      }
    }
  }
  /* the launch cloud: exhaust out of the cell and the uptake, billowing over the deck, left behind in the air */
  function drawCloud(W, cam, I, S, A) {
    const s = S - I.tL, P0 = I.P0, up = I.upW;
    for (let k = 0; k < 12; k++) {
      const a = s - k * .08; if (a <= 0 || a > 40) continue;
      const h1 = hash(k, I.i + 31), h2 = hash(k + 1, I.i + 31), h3 = hash(k + 2, I.i + 31);
      const src = k % 2 ? up : P0, ph = h1 * TAU, el = .25 + .7 * h2;
      const dl = Math.hypot(Math.cos(ph), el, Math.sin(ph)), v0 = (5 + 9 * h3) / dl, kk = .9 * (1 - Math.exp(-a / .9));
      const x = src[0] + Math.cos(ph) * v0 * kk + WIND[0] * a, y = src[1] + el * v0 * kk + 1.9 * Math.pow(a, .7), z = src[2] + Math.sin(ph) * v0 * kk + WIND[2] * a;
      const r = (1.2 + 3.8 * Math.sqrt(a)) * (.75 + .5 * h3);
      billow(W, cam, x, y, z, r, A * .48 * ss(0, .1, a) * Math.exp(-a / 8) * (k < 4 ? 1 : .8), I.seed + k * 1.7, a, 2);
    }
  }
  /* the vent: flame out of the uptake and the cell as the booster lights in it (moves with the ship) */
  function drawVent(W, cam, K, I, S, A) {
    const a = S - I.tL; if (a < -.04 || a > 1.4) return;
    const Xh = K.hero.X, up = X.ap(Xh, I.upL), cell = X.ap(Xh, I.cellL), k = Math.exp(-Math.max(0, a) / .32);
    for (let q = 0; q < 7; q++) {
      const src = q < 4 ? up : cell, h = (4 + 8 * hash(q, I.i + 3)) * (.6 + .4 * noise(S * 22 + q, I.i)) * (a < 0 ? .3 : 1);
      const lx = (hash(q, I.i + 5) - .5) * 1.2, lz = (hash(q, I.i + 6) - .5) * 1.6;
      segW(W, cam, src[0] + lx * .3, src[1], src[2] + lz * .3, src[0] + lx + WIND[0] * .08 * h, src[1] + h, src[2] + lz - 1.2 * h * .1, A * .8 * k);
    }
    K.glow(up, A * (.65 * k + .1), 6, 6, 120);
  }
  /* booster, then sustainer exhaust: the hanging cone, the four Mk 72 jets merging into it close up */
  function drawMotor(W, cam, K, I, S, A) {
    const h = OG.intAt(I, S); if (!h) return;
    const s = S - I.tL, dir = OG.intDir(I, S), boost = s < SEP;
    if (!boost && s < SEP + .12) return;                        // separation: the sustainer lights a moment later
    const nz = V.mad(h, dir, boost ? -NZB : -NZS);
    let Lmax = boost ? PLM.boost.Lc * 1.3 * (.3 + .7 * ss(0, .15, s)) : PLM.sust.Lc * 1.3 * ss(SEP + .12, SEP + .3, s);
    if (s < 3) {
      // in the cell or just out of it the flame stops at the deck (the rest goes down the plenum and out the uptake)
      const Xh = K.hero.X, c = X.ap(Xh, I.cellL), up = X.dir(Xh, [0, 1, 0]);
      const hN = (nz[0] - c[0]) * up[0] + (nz[1] - c[1]) * up[1] + (nz[2] - c[2]) * up[2], dn = Math.max(.05, V.dot(dir, up));
      Lmax = Math.min(Lmax, Math.max(0, hN + .5) / dn);
    }
    plumeCone(W, cam, K, nz, dir, boost ? PLM.boost : PLM.sust, S, A, I.seed, Lmax);
    if (boost && Lmax > 1.2 && dist3(nz, cam.eye) < 70) {
      // the four Mk 72 jets, each its own little cone, swelling into the one flame a metre and a half down
      const Xm = X.make(R.look(dir, [0, 1, 0]), V.mad(h, dir, -SM6_NOSE)), ax = V.mul(dir, -1), x1 = 1.4;
      const [U, Vv] = perp(dir), mer = V.mad(nz, ax, x1);
      for (const nzl of SM6N) {
        const q = X.ap(Xm, nzl), rd = V.sub(q, V.mad(nz, dir, V.dot(V.sub(q, nz), dir)));
        const rl = V.len(rd) || 1, ro = V.mul(rd, 1 / rl), [Uq, Vq] = [ro, V.cross(dir, ro)];
        ringA(W, cam, q, U, Vv, .08, A * .6, A * .4, 12);
        for (let k = 0; k < 5; k++) {
          const t = k / 5 * TAU + .4, c = Math.cos(t), sn = Math.sin(t);
          const o0 = V.add(V.mul(Uq, c * .08), V.mul(Vq, sn * .08)), o1 = V.add(V.mul(Uq, (c + 1.1) * .3), V.mul(Vq, sn * .3));
          seg(W, cam, V.add(q, o0), V.add(mer, o1), A * .42);
        }
      }
    }
  }
  function drawSpent(W, cam, K, I, S, A) {
    const a = S - I.tL - SEP; if (a < 0 || a > 6) return;
    const b = I.bst, p = bstAt(b, a), d = dist3(p, cam.eye);
    const th = b.w * a * a / (a + .6), c = Math.cos(th), sn = Math.sin(th), u = b.ax, f = b.dir;
    const w = V.cross(u, f), ax = [f[0] * c + w[0] * sn, f[1] * c + w[1] * sn, f[2] * c + w[2] * sn];
    const fade = A * (1 - ss(4.5, 6, a));
    if (d < 700) FAST.draw(W, MK72, X.make(R.look(ax, u), p), {}, { fine: false, a: fade * .85 });
    else { const L = Math.max(.9, d * .0011); seg(W, cam, V.mad(p, ax, -L), V.mad(p, ax, L), fade * .7); }
    const q0 = bstAt(b, Math.max(0, a - .35));
    seg(W, cam, q0, p, fade * .22);
    if (a < 5) billow(W, cam, b.p[0] + WIND[0] * a, b.p[1] + RISE(a), b.p[2] + WIND[2] * a, 1.5 + 4 * Math.sqrt(a), A * .3 * Math.exp(-a / 2.5) * ss(0, .1, a), I.seed * 3.1, a, 1);
    if (a < .5) K.glow(OG.intAt(I, S) || p, A * .35 * Math.exp(-a / .12), 4, 4, 60);
  }
  /* the rounds' ramjets: the same hanging cone, smaller and tighter, diamonds packed close */
  function drawRamjet(W, cam, K, r, S, A) {
    const vis = OG.roundVis(r, S); if (vis <= .01 || S < -.5) return;
    const p = OG.roundAt(r, S), dir = OG.roundDir(r, S);
    plumeCone(W, cam, K, V.mad(p, dir, -4.5), dir, PLM.ram, S, A * vis, 1 + r.i * 2.7);
  }

  /* Mach 2: the nose's shock cone (half-angle asin(1/2) = 30 deg) as a few faint rings, and its footprint on the
     sea: the V where the cone meets the water, stirred into small spray the longer ago the shock passed */
  const TMU = Math.tan(PI / 6), SHQ = [0, 0, 0];
  function drawShock(W, cam, r, S, A) {
    const vis = OG.roundVis(r, S); if (vis <= .01 || S < 0) return;
    const p = OG.roundAt(r, S), d = dist3(p, cam.eye); if (d > 420) return;
    const fade = A * vis * (1 - ss(250, 420, d)), dir = OG.roundDir(r, S), tip = V.mad(p, dir, 4.45), [U, Vv] = perp(dir);
    for (const [x, al] of [[2.4, .17], [4.8, .13], [7.8, .09], [11.4, .06]]) {
      const c = V.mad(tip, dir, -x), rr = x * TMU, n = 36;
      let pv = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n * TAU, q = [c[0] + (U[0] * Math.cos(t) + Vv[0] * Math.sin(t)) * rr, c[1] + (U[1] * Math.cos(t) + Vv[1] * Math.sin(t)) * rr, c[2] + (U[2] * Math.cos(t) + Vv[2] * Math.sin(t)) * rr];
        if (q[1] < .2) { pv = null; continue; }
        if (pv) seg(W, cam, pv, q, fade * al);
        pv = q;
      }
    }
    for (let k = 0; k < 8; k++) {
      const t = k / 8 * TAU + .3, o = [U[0] * Math.cos(t) + Vv[0] * Math.sin(t), U[1] * Math.cos(t) + Vv[1] * Math.sin(t), U[2] * Math.cos(t) + Vv[2] * Math.sin(t)];
      let L = 15;
      const dy = -dir[1] + o[1] * TMU; if (dy < 0) L = Math.min(L, (tip[1] - .2) / -dy);
      seg(W, cam, tip, [tip[0] + (-dir[0] + o[0] * TMU) * L, tip[1] + dy * L, tip[2] + (-dir[2] + o[2] * TMU) * L], fade * .09);
    }
    // the footprint: sampled back along the path it flew (the shock passed each point x / VR ago)
    const h = Math.max(1, p[1]), x0 = h / TMU, nrm = [dir[2], 0, -dir[0]], nl = Math.hypot(nrm[0], nrm[2]) || 1;
    for (const sg of [-1, 1]) {
      let px = 0, py = 0, pz = 0, has = false;
      for (let x = x0 + 1; x < 180; x += 4) {
        const tau = x / OG.VR, q = OG.roundAt(r, S - tau), w = Math.sqrt(Math.max(0, x * x * TMU * TMU - q[1] * q[1]));
        const qx = q[0] + nrm[0] / nl * w * sg, qz = q[2] + nrm[2] / nl * w * sg, qy = OG.swell(qx, qz, S) * .9 + .05;
        const al = fade * .34 * (1 - x / 180) * ss(x0, x0 + 10, x);
        if (has) segW(W, cam, px, py, pz, qx, qy, qz, al);
        // spray thrown up where it passed, still rising: a small fan of jets
        const ix = Math.floor(x / 4), jh = (.25 + 1.3 * sat(tau / .3)) * (.6 + .8 * hash(ix, r.i * 7 + sg));
        for (let j = -1; j <= 1; j++) {
          const lx = nrm[0] / nl * sg * (.3 + .25 * j) + dir[0] * .25 * j, lz = nrm[2] / nl * sg * (.3 + .25 * j) + dir[2] * .25 * j;
          segW(W, cam, qx, qy, qz, qx + lx * jh, qy + jh * (1 - .25 * Math.abs(j)), qz + lz * jh, al * (j ? .9 : 1.3));
        }
        px = qx; py = qy; pz = qz; has = true;
      }
    }
  }

  /* ================= far kills: each SM-6 meets its round ~5 km out ================= */
  const KILLS = OG.INTS.map(I => {
    const r = I.round, rd = OG.roundDir(r, I.tI - .02);
    return { I, t: I.tI, p: I.PI, seed: 3.1 + I.i * 5.3, sparks: mkSparks(26, 40 + I.i, 45, 170), frags: mkFrags(I.PI, V.mul(rd, 680), 16, 70 + I.i, .3, .75, 60, 1.1) };
  });
  function farBurst(W, cam, K, k, S, A) {
    const a = S - k.t; if (a < 0 || a > 40) return;
    const p = k.p;
    if (a < 3) {
      K.glow(p, A * (1 * Math.exp(-a / .12) + .25 * Math.exp(-a / .9)), 200, 12, 170);
      K.glow(p, A * .16 * Math.exp(-a / .5), 1400, 50, 280);
    }
    if (a < .2) star(W, cam, p, 70, 30, A * .9 * (1 - a / .2), k.seed, 12, 120);
    if (a < 1.4) shell(W, cam, p, 18 + 170 * (1 - Math.exp(-a / .38)), A * .5 * Math.pow(1 - a / 1.4, 1.6), k.seed, 2, 3, .02, 0);
    if (a < 1) discS(W, cam, p, 8 + 80 * (1 - Math.exp(-a / .25)), A * .45 * Math.pow(1 - a, 2), 36);
    if (a < 2.2) ringH(W, cam, [p[0], .2, p[2]], 30 + 300 * (1 - Math.exp(-a / .5)), A * .3 * Math.pow(1 - a / 2.2, 1.5), 56);
    puffs(W, cam, p, a, 8, 20, 34, 80, A * .36 * Math.exp(-a / 14), k.seed, .3);
    if (a < 6) billow(W, cam, p[0] + WIND[0] * a, p[1] + 3 * a, p[2] + WIND[2] * a, 10 + 45 * (1 - Math.exp(-a / .6)), A * .5 * Math.exp(-a / 1.6) * ss(0, .08, a), k.seed * 1.3, a, 2);
  }
  function farDebris(W, cam, K, k, S, rate, A) {
    const a = S - k.t; if (a < 0 || a > 12) return;
    if (a < 2.4) drawSparks(W, cam, k.p, k.sparks, a, A * .85, XP(rate) + .1);
    drawFrags(W, cam, k.frags, a, A * .7, S, 8, XP(rate) + .03, 0);
  }

  /* ================= Phalanx: every round flown from its own firing time ================= */
  const ROF = 75, V0 = 1130, TD = 2.4, TR_LIFE = 2.2, DISP = .0022;
  const trS = a => V0 * TD * (1 - Math.exp(-a / TD));
  const tof = s => { const q = s / (V0 * TD); return q >= .98 ? 9 : -TD * Math.log(1 - q); };
  for (const e of OG.CIWS_ENG) {
    const r = e.round, n = Math.floor((e.t1 - e.t0) * ROF) + 1, sd = e.m * 7 + r.i * 3 + 1;
    const M = new Float64Array(n * 3), Dd = new Float64Array(n * 3), TI = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const tk = e.t0 + k / ROF, m = OG.ciwsMuzzle(e.m, tk).p;
      // each shot leads the round with its own flight (drag, drop, the ship's own way on it)
      let tf = V.dist(m, OG.roundAt(r, tk)) / 1030, aim = null;
      for (let it = 0; it < 6; it++) { const p = OG.roundAt(r, tk + tf); aim = [p[0], p[1] + 4.9 * tf * tf, p[2] - VK * tf]; tf = tof(V.dist(aim, m)); }
      const d0 = V.norm(V.sub(aim, m)), [U, Vv] = perp(d0);
      // ~2 mrad triangular dispersion and the stream's slow wander
      const g1 = (hash(k, sd + 1) + hash(k + 3, sd + 2) - 1) * DISP + .0011 * noise(k * .06 + sd, 1.3);
      const g2 = (hash(k + 5, sd + 3) + hash(k + 7, sd + 4) - 1) * DISP + .0011 * noise(k * .06 + sd, 4.7);
      const d = V.norm([d0[0] + U[0] * g1 + Vv[0] * g2, d0[1] + U[1] * g1 + Vv[1] * g2, d0[2] + U[2] * g1 + Vv[2] * g2]);
      M[k * 3] = m[0]; M[k * 3 + 1] = m[1]; M[k * 3 + 2] = m[2]; Dd[k * 3] = d[0]; Dd[k * 3 + 1] = d[1]; Dd[k * 3 + 2] = d[2];
      let ti = TR_LIFE;
      for (let a = .05; a < TR_LIFE; a += .005) if (m[1] + d[1] * trS(a) - 4.9 * a * a <= 0) { ti = a; break; }
      TI[k] = ti;
    }
    Object.assign(e, { n, M, Dd, TI, sd });
  }
  function tracerAt(e, k, a, o) {
    const s = trS(a), j = k * 3;
    o[0] = e.M[j] + e.Dd[j] * s; o[1] = e.M[j + 1] + e.Dd[j + 1] * s - 4.9 * a * a; o[2] = e.M[j + 2] + e.Dd[j + 2] * s + VK * a;
    return o;
  }
  const TQ0 = [0, 0, 0], TQ1 = [0, 0, 0];
  function drawStream(W, cam, K, e, S, rate, A, glows) {
    if (S < e.t0 || S > e.t1 + TR_LIFE + .1) return glows;
    const xp = XP(rate), eye = cam.eye;
    const k1 = Math.min(e.n - 1, Math.floor((S - e.t0) * ROF)), k0 = Math.max(0, Math.ceil((S - TR_LIFE - e.t0) * ROF));
    for (let k = k1; k >= k0; k--) {
      const a = S - (e.t0 + k / ROF); if (a <= 0) continue;
      const tr = k % 3 === 0;
      if (a > e.TI[k]) {
        // the misses drop into the sea past the target: small frozen splashes
        if (tr && a - e.TI[k] < 1.2) { tracerAt(e, k, e.TI[k], TQ1); splash(W, cam, TQ1[0], TQ1[2], a - e.TI[k], 1.3, A * .5, k * .37 + e.sd, S); }
        continue;
      }
      const dt = (tr ? .0085 : .0058) + xp * .9;
      tracerAt(e, k, Math.max(0, a - dt), TQ0); tracerAt(e, k, a, TQ1);
      const al = A * (tr ? 1 : .55) * ss(0, .002, a) * (1 - ss(TR_LIFE - .5, TR_LIFE, a));
      segW(W, cam, TQ0[0], TQ0[1], TQ0[2], TQ1[0], TQ1[1], TQ1[2], al);
      // each round's head (a bright diamond that still reads end-on) and the thin line it lays back to the muzzle:
      // together the stream reads as one bundle of hairlines from the mount to the round it is reaching for
      if (pj(cam, TQ1[0], TQ1[1], TQ1[2])) {
        const r = Math.max(tr ? 1.3 : .9, Math.min(tr ? 5 : 3, (tr ? .1 : .06) * cam.fl / PJ[2])), sx = PJ[0], sy = PJ[1], ha = al * .9;
        W.seg2(sx - r, sy, sx, sy - r, ha); W.seg2(sx, sy - r, sx + r, sy, ha); W.seg2(sx + r, sy, sx, sy + r, ha); W.seg2(sx, sy + r, sx - r, sy, ha);
        if (tr && glows < 12 && PJ[2] < 60) { K.glow([TQ1[0], TQ1[1], TQ1[2]], A * .4, .3, 2.5, 22); glows++; }
      }
      const j = k * 3, h = a * .5;
      tracerAt(e, k, h, TQ0);
      const sm = A * (tr ? .2 * Math.exp(-a / 1.4) : .09 * Math.exp(-a / .3)) * ss(0, .01, a);
      if (sm <= .006) continue;
      segW(W, cam, e.M[j] + WIND[0] * a, e.M[j + 1], e.M[j + 2] + WIND[2] * a, TQ0[0] + WIND[0] * h, TQ0[1], TQ0[2] + WIND[2] * h, sm * .7);
      segW(W, cam, TQ0[0] + WIND[0] * h, TQ0[1], TQ0[2] + WIND[2] * h, TQ1[0], TQ1[1], TQ1[2], sm);
    }
    return glows;
  }
  /* muzzle fire: each shot's flash grows and dies inside its 13 ms cycle, so a stopped clock holds one flash
     mid-bloom (petals, the blast ring shed off the muzzle) */
  function drawMuzzle(W, cam, K, e, S, A) {
    if (S < e.t0 || S > e.t1 + 1 / ROF) return;
    const Xh = K.hero.X, cs = K.hero.ciws, sst = { ciwsYaw: cs.yaw, ciwsPitch: cs.pitch };
    const m = X.ap(Xh, DA.ciws(sst, e.m)), d = X.dir(Xh, DA.ciwsDir(sst, e.m)), [U, Vv] = perp(d);
    const k = Math.floor((S - e.t0) * ROF), af = S - (e.t0 + k / ROF), u = af / .0095;
    if (u >= 1) return;
    const g = Math.sqrt(u), f1 = hash(k, e.m + 3), f2 = hash(k + 1, e.m + 5), fa = A * Math.pow(1 - u, .7);
    for (let q = 0; q < 9; q++) {
      const ph = q / 9 * TAU + f2 * 3, sp = .12 + .26 * hash(q, k % 97), L = (1.2 + 2.2 * f1 * (.6 + .4 * hash(q + 2, k % 89))) * (.3 + .7 * g);
      const c = Math.cos(ph) * sp * L, s = Math.sin(ph) * sp * L;
      segW(W, cam, m[0], m[1], m[2], m[0] + d[0] * L + U[0] * c + Vv[0] * s, m[1] + d[1] * L + U[1] * c + Vv[1] * s, m[2] + d[2] * L + U[2] * c + Vv[2] * s, fa * .9);
    }
    for (let q = 0; q < 5; q++) {
      const ph = q / 5 * TAU + f1 * 2, l = (.25 + .5 * f2) * (.4 + .6 * g), b = V.mad(m, d, .12);
      segW(W, cam, b[0], b[1], b[2], b[0] + (U[0] * Math.cos(ph) + Vv[0] * Math.sin(ph)) * l, b[1] + (U[1] * Math.cos(ph) + Vv[1] * Math.sin(ph)) * l, b[2] + (U[2] * Math.cos(ph) + Vv[2] * Math.sin(ph)) * l, fa * .6);
    }
    ringA(W, cam, V.mad(m, d, .15 + 1.1 * g), U, Vv, .12 + .95 * g, A * .6 * Math.pow(1 - u, 1.5), A * .3 * Math.pow(1 - u, 1.5), 24);
    K.glow(V.mad(m, d, .6), A * (.3 + .3 * f1) * (1 - .6 * u), 1.6, 4, 50);
  }
  /* gun smoke: puffs thrown off the muzzle and left in the air as the ship steams on */
  function drawGunSmoke(W, cam, e, S, A) {
    if (S < e.t0) return;
    const tEnd = Math.min(S, e.t1);
    for (let q = Math.max(0, Math.floor((S - 5 - e.t0) * 8)); e.t0 + q / 8 <= tEnd; q++) {
      const te = e.t0 + q / 8, a = S - te, k = Math.min(e.n - 1, Math.round((te - e.t0) * ROF)), j = k * 3, h = hash(q, e.m + 61);
      const kk = (3 + 5 * h) * (1 - Math.exp(-a / .2));
      billow(W, cam, e.M[j] + e.Dd[j] * kk + WIND[0] * a, e.M[j + 1] + e.Dd[j + 1] * kk + .5 * a, e.M[j + 2] + e.Dd[j + 2] * kk + WIND[2] * a,
        (.4 + 1.5 * Math.sqrt(a)) * (.6 + .8 * h), A * .14 * Math.exp(-a / 2.2) * ss(0, .05, a), e.m * 5.1 + q * 1.37, a, q % 3 === 0 ? 1 : 0);
    }
  }

  /* ================= close kills: R3 at ~450 m (the hero freeze), R4 seven metres off the side ================= */
  const HIT = OG.HIT, HX = OG.shipXf(HIT.S), HP = X.ap(HX, HIT.at);
  const CK = (() => {
    const R3 = OG.RID.R3, R4 = OG.RID.R4, out = [];
    const k3 = OG.roundAt(R3, R3.tEnd), d3 = OG.roundDir(R3, R3.tEnd - .02);
    out.push({ r: R3, t: R3.tEnd, kp: k3, kd: d3, sc: 1, seed: 7.7 + R3.i * 3.9,
      frags: mkFrags(k3, V.mul(d3, 680), 72, 93, .08, .45, 150, .65, .1),
      sparks: mkSparks(40, 123, 40, 170),
      chunks: mkChunks(k3, V.mul(d3, 680), 4, 131, .3, .5, 18, 1), billows: 6 });
    const k4 = HIT.kill, d4 = OG.roundDir(R4, R4.tEnd - .02);
    out.push({ r: R4, t: R4.tEnd, kp: k4, kd: d4, sc: .6, seed: 7.7 + R4.i * 3.9,
      frags: mkFrags(k4, V.mul(d4, 680), 30, 97, .2, .55, 70, .65, .1, HX),
      sparks: mkSparks(30, 127, 40, 150), chunks: [], billows: 0 });
    return out;
  })();
  function closeBurst(W, cam, K, c, S, A) {
    const a = S - c.t; if (a < 0 || a > 30) return;
    const p = c.kp, sc = c.sc, pk = .3 * (1 - Math.exp(-a / .3));
    // the fireball is carried on along the round's line; the blast front stays where it formed
    const fc = [p[0] + c.kd[0] * 60 * pk, p[1] + c.kd[1] * 60 * pk + 1.5 * a, p[2] + c.kd[2] * 60 * pk];
    if (a < 3) K.glow(p, A * (1.1 * Math.exp(-a / .1) + .25 * Math.exp(-a / .7)) * sc, 22 * sc, 8, 150);
    if (a < .16) star(W, cam, p, 3 * sc, 16, A * (1 - a / .16), c.seed, 14, 150 * sc);
    // nested shells: blast front, fireball, core
    if (a < 1.3) shell(W, cam, p, (2 + 42 * (1 - Math.exp(-a / .22))) * sc, A * .5 * Math.pow(1 - a / 1.3, 1.6), c.seed, 3, 4, .015, 0);
    if (a < 2.5) shell(W, cam, fc, (.8 + 8 * (1 - Math.exp(-a / .1)) + 1.6 * a) * sc, A * .6 * Math.exp(-a / .5), c.seed + 1.3, 4, 5, .14, a * .6);
    if (a < 1) shell(W, cam, fc, (.4 + 3.4 * (1 - Math.exp(-a / .05))) * sc, A * .85 * Math.exp(-a / .16), c.seed + 2.6, 2, 3, .08, a);
    // fireball billows turning into the smoke
    if (a < 8 && c.billows) for (let k = 0; k < c.billows; k++) {
      const h1 = hash(k, c.seed + 71), h2 = hash(k + 1, c.seed + 71), h3 = hash(k + 2, c.seed + 71), g = 1 - Math.exp(-a / .12);
      billow(W, cam, fc[0] + (h1 - .5) * 7 * g * sc + WIND[0] * a, fc[1] + (h2 - .4) * 5 * g * sc + 1.2 * a, fc[2] + (h3 - .5) * 7 * g * sc + WIND[2] * a,
        (1 + 4.5 * g + 1.1 * a) * (.7 + .5 * h2) * sc, A * .5 * Math.exp(-a / 1.1) * ss(.03, .16, a), c.seed + k * 1.9, a, 2);
    }
    if (a < 1.6) ringH(W, cam, [p[0], OG.swell(p[0], p[2], S) * .9 + .1, p[2]], (4 + 60 * (1 - Math.exp(-a / .35))) * sc, A * .35 * (1 - a / 1.6), 48);
    if (c.billows) puffs(W, cam, fc, a - .1, 5, 2.5 * sc, 7.5 * sc, 9 * sc, A * .32 * Math.exp(-a / 8), c.seed, .15, [c.kd[0] * 30, c.kd[1] * 30, c.kd[2] * 30, .45]);
  }
  function closeDebris(W, cam, K, c, S, rate, A) {
    const a = S - c.t; if (a < 0 || a > 12) return;
    const xp = XP(rate);
    if (a < 2) drawSparks(W, cam, c.kp, c.sparks, a, A * .85, xp);
    drawFrags(W, cam, c.frags, a, A * .8, S, 4.5, xp, .22 * c.sc);
    drawChunks(W, cam, c.chunks, a, A * .9, S, xp);
  }

  /* ================= R4's wreck strikes the starboard side ================= */
  const H_OUT = X.dir(HX, [1, 0, 0]), H_UP = X.dir(HX, [0, 1, 0]), H_FWD = X.dir(HX, [0, 0, 1]);
  const HIT_DEB = mkFrags(HP, V.mul(V.norm(V.add(V.add(V.mul(H_OUT, .85), V.mul(H_UP, .7)), V.mul(H_FWD, -.15))), 24), 46, 311, .35, 1.3, 16, 1.4, 0);
  const HIT_SPK = mkSparks(36, 333, 20, 75, .3, H_OUT);
  const SEC = [{ a: 1.75, sc: .8, seed: 41.3 }, { a: 2.7, sc: .5, seed: 47.9 }].map((c, i) => Object.assign(c, {
    p: X.ap(OG.shipXf(HIT.S + c.a), [HIT.at[0] + 1.2, Math.min(HIT.at[1], DA.deckY(HIT.at[2]) - 1.15) + .4, HIT.at[2] + (i ? -1.2 : .8)]),
    sparks: mkSparks(22, 351 + i, 15, 55, .4, H_OUT) }));
  const BR = (() => {
    const c = HIT.at, x0 = c[0] + .09, yb = Math.min(c[1], DA.deckY(c[2]) - 1.15), zb = c[2], out = [], cracks = [], scorch = [];
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const th = k / n * TAU, rr = (.62 + .55 * hash(k % n, 51)) * (k % 3 === 1 ? .76 : 1);
      out.push([x0, yb + Math.sin(th) * rr * .72, zb + Math.cos(th) * rr * 1.15]);
    }
    for (let k = 0; k < 7; k++) {
      const th = (k + .3 * hash(k, 52)) / 7 * TAU, r0 = 1.1, r1 = 1.9 + 1.7 * hash(k, 53), kink = (hash(k, 54) - .5) * .6;
      cracks.push([[x0, yb + Math.sin(th) * r0 * .72, zb + Math.cos(th) * r0 * 1.15],
        [x0, yb + Math.sin(th + kink) * (r0 + r1) * .5 * .72, zb + Math.cos(th + kink) * (r0 + r1) * .5 * 1.15],
        [x0, yb + Math.sin(th) * r1 * .72, zb + Math.cos(th) * r1 * 1.15]]);
    }
    for (const R0 of [2.4, 3.4]) {
      const ring = [];
      for (let k = 0; k <= 20; k++) { const th = k / 20 * TAU, rr = R0 * (.8 + .4 * hash(k % 20, 55 + R0)); ring.push([x0 - .02, yb + Math.sin(th) * rr * .55, zb + Math.cos(th) * rr * 1.25]); }
      scorch.push(ring);
    }
    return { out, cracks, scorch, c: [x0, yb, zb] };
  })();
  function drawHit(W, cam, K, S, rate, A) {
    const a = S - HIT.S; if (a < 0 || a > 40) return;
    const Xh = K.hero.X, xp = XP(rate);
    if (a < 3) K.glow(HP, A * (1.2 * Math.exp(-a / .09) + .35 * Math.exp(-a / .7)), 30, 14, 260);
    if (a < .18) star(W, cam, HP, 5, 30, A * (1 - a / .18), 4.4, 16, 230);
    // the blast front, its print on the water
    if (a < .8) shell(W, cam, V.mad(HP, H_OUT, 1.5), 3 + 26 * (1 - Math.exp(-a / .18)), A * .4 * Math.pow(1 - a / .8, 2), 5.5, 3, 3, .02, 0);
    if (a < 1.6) ringH(W, cam, [HP[0], .15, HP[2]], 5 + 70 * (1 - Math.exp(-a / .4)), A * .4 * Math.pow(1 - a / 1.6, 1.4), 64);
    // fireball shells blown out of the side, then billows rising into the smoke
    const g = 1 - Math.exp(-a / .3);
    const fc = [HP[0] + H_OUT[0] * (1.5 + 7 * g) + H_UP[0] * (1 + 2.5 * g + 1.8 * a) + WIND[0] * a, HP[1] + H_OUT[1] * (1.5 + 7 * g) + H_UP[1] * (1 + 2.5 * g + 1.8 * a), HP[2] + H_OUT[2] * (1.5 + 7 * g) + H_UP[2] * (1 + 2.5 * g + 1.8 * a) + WIND[2] * a];
    if (a < 3.5) shell(W, cam, fc, 1.5 + 9 * g + 1.4 * a, A * .6 * Math.exp(-a / .9), 9.3, 3, 4, .16, a * .4);
    if (a < 1.2) shell(W, cam, fc, .6 + 4 * (1 - Math.exp(-a / .07)), A * .85 * Math.exp(-a / .2), 12.1, 2, 3, .1, a);
    if (a < 14) for (let k = 0; k < 7; k++) {
      const h1 = hash(k, 71), h2 = hash(k + 1, 71), h3 = hash(k + 2, 71), gg = 1 - Math.exp(-a / .5);
      const o = (h1 + .1) * 10 * gg, s2 = (h3 - .5) * 12 * gg, u2 = 1 + 7 * gg * (.4 + h2) + 2.6 * a;
      billow(W, cam, HP[0] + H_OUT[0] * o + H_FWD[0] * s2 + WIND[0] * a, HP[1] + u2, HP[2] + H_OUT[2] * o + H_FWD[2] * s2 + WIND[2] * a,
        (2.5 + 8 * gg + 1.6 * a) * (.7 + .5 * h2), A * .62 * Math.exp(-a / 3.2) * ss(.12, .6, a), 9.1 + k * 1.9, a, 2);
    }
    if (a < 2) drawSparks(W, cam, HP, HIT_SPK, a, A * .9, xp);
    drawFrags(W, cam, HIT_DEB, a, A * .85, S, 2, xp, .3);
    // the breach (yellow) and the scorch round it, on the plating: they ride with the ship
    const bk = A * ss(.002, .05, a);
    if (bk > .005) {
      W.style(HI, 1);
      if (a < .7) ringA(W, cam, X.ap(Xh, BR.c), X.dir(Xh, [0, 1, 0]), X.dir(Xh, [0, 0, 1]), .8 + 9 * (1 - Math.exp(-a / .16)), A * .9 * Math.pow(1 - a / .7, 1.4), A * .5 * Math.pow(1 - a / .7, 1.4), 40);
      const P = BR.out.map(p => X.ap(Xh, p));
      for (let k = 0; k < P.length - 1; k++) seg(W, cam, P[k], P[k + 1], bk * .95);
      for (const c of BR.cracks) { const q = c.map(p => X.ap(Xh, p)); seg(W, cam, q[0], q[1], bk * .65); seg(W, cam, q[1], q[2], bk * .45); }
      W.style(WH, 1);
      for (const ring of BR.scorch) { const Q = ring.map(p => X.ap(Xh, p)); for (let k = 0; k < Q.length - 1; k++) seg(W, cam, Q[k], Q[k + 1], bk * .22); }
    }
    // the wreck's fuel going up in two more bursts on the plating, seconds later
    for (const c of SEC) {
      const b = a - c.a; if (b < 0 || b > 12) continue;
      const p = c.p, g2 = 1 - Math.exp(-b / .25);
      if (b < 2) K.glow(p, A * (.9 * Math.exp(-b / .08) + .25 * Math.exp(-b / .6)) * c.sc, 14 * c.sc, 10, 200);
      if (b < 1) shell(W, cam, [p[0] + H_OUT[0] * 2 * g2, p[1] + 1.5 * g2, p[2] + H_OUT[2] * 2 * g2], (.5 + 4 * (1 - Math.exp(-b / .06))) * c.sc, A * .85 * Math.exp(-b / .2), c.seed, 2, 3, .1, b);
      if (b < 2.5) shell(W, cam, [p[0] + H_OUT[0] * 3 * g2, p[1] + 3 * g2 + 1.5 * b, p[2] + H_OUT[2] * 3 * g2], (1 + 6 * g2 + b) * c.sc, A * .55 * Math.exp(-b / .7), c.seed + 1, 3, 3, .16, b * .5);
      if (b < 1.4) drawSparks(W, cam, p, c.sparks, b, A * .85, xp);
      for (let k = 0; k < 4; k++) {
        const h1 = hash(k, c.seed), h2 = hash(k + 1, c.seed), gg = 1 - Math.exp(-b / .4);
        billow(W, cam, p[0] + H_OUT[0] * (2 + 5 * h1) * gg + WIND[0] * b, p[1] + (2 + 4 * h2) * gg + 2.4 * b, p[2] + H_OUT[2] * (2 + 5 * h1) * gg + (h2 - .5) * 6 * gg + WIND[2] * b,
          (1.8 + 5 * gg + 1.3 * b) * (.7 + .5 * h2) * c.sc, A * .55 * Math.exp(-b / 3) * ss(.1, .5, b), c.seed + k * 2.3, b, 2);
      }
    }
    // fire in the breach: tongues licking out and up, bent aft by the ship's own wind; a smoke column pouring aft
    const fk = A * ss(.05, 1, a);
    if (fk > .01) {
      const F0 = X.ap(Xh, [BR.c[0] + .3, BR.c[1] - .2, BR.c[2]]), out = X.dir(Xh, [1, 0, 0]), aft = X.dir(Xh, [0, 0, -1]), up = X.dir(Xh, [0, 1, 0]), fwd = X.dir(Xh, [0, 0, 1]);
      const ax = V.norm([up[0] + out[0] * .45, up[1] + out[1] * .45, up[2] + out[2] * .45]), e = cam.eye;
      const cs = V.norm(V.cross(ax, [e[0] - F0[0], e[1] - F0[1], e[2] - F0[2]]));
      for (let k = 0; k < 8; k++) {
        const Pk = .4 + .32 * hash(k, 83), ph = S / Pk + hash(k, 84), u = fr(ph), cyc = Math.floor(ph), inner = k >= 5;
        const H = (1.6 + 3.2 * hash(k, cyc * 1.7 + 85)) * (inner ? .55 : 1), ht = H * (.3 + .7 * Math.pow(Math.sin(PI * Math.min(1, u * 1.2)), .7));
        const bz = ((k % 5) - 2) * .5 + (hash(k, 86) - .5) * .4, w0 = (.45 + .45 * hash(k, 87)) * (inner ? .5 : 1);
        const bx = F0[0] + fwd[0] * bz, by = F0[1] + fwd[1] * bz, bzz = F0[2] + fwd[2] * bz;
        let lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0;
        const al = fk * (inner ? .75 : .6);
        for (let q = 0; q <= 7; q++) {
          const t = q / 7, y = ht * t, wd = w0 * Math.pow(Math.sin(PI * Math.min(1, (t + .12) / 1.12)), .75);
          const bend = .1 * y * y, wob = .35 * t * noise(S * 6.5 + k * 1.9, t * 2.2 + k);
          const cx = bx + ax[0] * y + aft[0] * bend + cs[0] * wob, cy = by + ax[1] * y + aft[1] * bend + cs[1] * wob, cz = bzz + ax[2] * y + aft[2] * bend + cs[2] * wob;
          const Lx = cx - cs[0] * wd, Ly = cy - cs[1] * wd, Lz = cz - cs[2] * wd, Rx = cx + cs[0] * wd, Ry = cy + cs[1] * wd, Rz = cz + cs[2] * wd;
          if (q) { segW(W, cam, lx, ly, lz, Lx, Ly, Lz, al * (1 - t * .35)); segW(W, cam, rx, ry, rz, Rx, Ry, Rz, al * (1 - t * .35)); }
          lx = Lx; ly = Ly; lz = Lz; rx = Rx; ry = Ry; rz = Rz;
        }
      }
      K.glow(V.mad(F0, ax, 1.2), fk * .24 * (.75 + .25 * noise(S * 7, 3.3)), 5, 5, 100);
      for (let q = Math.max(0, Math.floor((a - 9) * 5)); q <= a * 5; q++) {
        const te = q / 5, b = a - te; if (b < .05) continue;
        const src = X.ap(OG.shipXf(HIT.S + te), [BR.c[0] + 1.5, BR.c[1] + 1, BR.c[2]]), h = hash(q, 211);
        billow(W, cam, src[0] + WIND[0] * b + (h - .5) * 2 + H_OUT[0] * 2 * b, src[1] + 2.8 * b + 1.5 * Math.sqrt(b), src[2] + WIND[2] * b + (hash(q, 212) - .5) * 2,
          (1.8 + 3.2 * Math.sqrt(b)) * (.7 + .5 * h), A * .5 * ss(.05, .4, b) * Math.exp(-b / 5) * ss(.1, .6, te), 30 + q * 1.37, b, q % 2 ? 1 : 2);
      }
    }
  }

  /* ================= hooks ================= */
  const OGFX = window.OGFX = {
    plumeFx(T, S, K) {
      const A = K.dim; if (A <= .003 || S < 3.5) return;
      for (const I of OG.INTS) {
        const s = S - I.tL; if (s < -.05) continue;
        if (s >= 0) { drawTrail(K.W, K.cam, I, S, A); drawCloud(K.W, K.cam, I, S, A); }
        drawVent(K.W, K.cam, K, I, S, A);
        if (s >= 0 && S <= I.tEnd) drawMotor(K.W, K.cam, K, I, S, A);
        drawSpent(K.W, K.cam, K, I, S, A);
      }
      for (const r of OG.ROUNDS) { drawRamjet(K.W, K.cam, K, r, S, A); drawShock(K.W, K.cam, r, S, A); }
    },
    tracerFx(T, S, K) {
      const A = K.dim; if (A <= .003 || S < 17) return;
      let gl = 0;
      for (const e of OG.CIWS_ENG) {
        gl = drawStream(K.W, K.cam, K, e, S, K.rate, A, gl);
        drawMuzzle(K.W, K.cam, K, e, S, A);
        drawGunSmoke(K.W, K.cam, e, S, A);
      }
    },
    burstFx(T, S, K) {
      const A = K.dim; if (A <= .003 || S < 10) return;
      for (const k of KILLS) farBurst(K.W, K.cam, K, k, S, A);
      for (const c of CK) closeBurst(K.W, K.cam, K, c, S, A);
    },
    fragmentsFx(T, S, K) {
      const A = K.dim; if (A <= .003 || S < 10) return;
      for (const k of KILLS) farDebris(K.W, K.cam, K, k, S, K.rate, A);
      for (const c of CK) closeDebris(K.W, K.cam, K, c, S, K.rate, A);
    },
    hitFx(T, S, K) { if (S >= HIT.S) drawHit(K.W, K.cam, K, S, K.rate, K.dim); },
    /* camera shake only near real speed (never in the freezes or the rewind) */
    shake(T, S) {
      const k = ss(.3, .95, OGC.rate(T)); if (k <= 0) return null;
      let amp = 0;
      const h = S - HIT.S; if (h >= 0 && h < 8) amp += 16 * Math.exp(-h / .35) + 2.4 * Math.exp(-h / 1.6);
      for (const c of CK) { const a = S - c.t; if (a >= 0 && a < 1.5) amp += 6 * c.sc * Math.exp(-a / .22); }
      for (const c of SEC) { const b = h - c.a; if (b >= 0 && b < 1.5) amp += 8 * c.sc * Math.exp(-b / .25); }
      for (const e of OG.CIWS_ENG) if (S >= e.t0 && S <= e.t1) amp += 1.1;
      for (const I of OG.INTS) { const a = S - I.tL; if (a >= 0 && a < 3) amp += 2.2 * ss(0, .1, a) * Math.exp(-a / .9); }
      amp *= k;
      return amp > .05 ? FILM.shake(T, amp, 21) : null;
    },
    cues: [],
  };

  /* ================= sound (fired only while playing forward in real time) ================= */
  const Sf = STAGE.SFX, CU = OGFX.cues, at = s => OGC.tOfS(s);
  for (const I of OG.INTS) CU.push([at(I.tL + SEP), () => { Sf.noise(.3, 1100, .6, .025, .004); Sf.tone(180, 90, .25, 'sine', .015); }]);
  // the Phalanx: each round a slow heavy thump while the clock is nearly stopped, a growl while it runs
  for (const e of OG.CIWS_ENG) {
    let last = -9;
    for (let k = 0; k < e.n; k++) {
      const t = at(e.t0 + k / ROF), r = OGC.rate(t);
      if (r < .08) CU.push([t, () => { Sf.tone(e.m ? 62 : 74, 30, .34, 'sine', .045); Sf.noise(.12, 900, .7, .012, .002); }]);
      else if (t - last > .45) { last = t; CU.push([t, () => { Sf.noise(.5, 120 + 900 * Math.min(1, r), 2.5, .05, .02); Sf.tone(18 + 57 * Math.min(1, r), 16 + 50 * Math.min(1, r), .5, 'sawtooth', .018); }]); }
    }
  }
  // R3 stretched: a boom that keeps sinking; R4 and the hull at the tail of the freeze
  CU.push([at(CK[0].t) + .05, () => { Sf.tone(30, 17, 6, 'sine', .12); Sf.noise(7, 110, .8, .05, 1.2); }]);
  CU.push([at(HIT.S) + .15, () => Sf.noise(1.4, 3000, .5, .04, .01)]);
  CU.push([at(HIT.S) + .9, () => Sf.noise(3.5, 380, .7, .07, .3)]);
  for (const c of SEC) CU.push([at(HIT.S + c.a), () => { Sf.crack(); Sf.tone(58, 30, 1.1, 'sine', .12 * c.sc); Sf.noise(2.2, 260, .8, .07 * c.sc, .02); }]);
  for (const F of HIT_DEB) {
    const s = HIT.S + F.tImp;
    if (!F.hull && F.imp && F.big > .6 && s < 22.8) CU.push([at(s), () => Sf.noise(.35, 700 + 900 * F.h, .6, .018, .005)]);
  }
})();
