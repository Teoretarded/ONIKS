/* THE PICTURE: at the track (from the Confidence menu). Each point of the destroyer's hull is a
   belief: it is redrawn from the current uncertainty (range error small, cross-range error large,
   some height error) every time the Monolith-B beam comes round (every 4 s) and a burst of
   pulses crosses it. The cloud condenses onto the hull look by look; the class bars follow.
   The second contact (TRK 22) comes out of the squall and condenses into a transport.
   Pure: every point's update times are fixed at load; render(T) interpolates. */
(function () {
  const { V, R, X, E, rng } = M3;
  const PA = window.PA, DEG = PA.DEG, TAU = PA.TAU, hsh = PA.hsh;
  const gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
  const VW = 700, S0 = 330;                          // visual speed and start of the pulse slab
  const sigOf = n => 68 * Math.exp(-.55 * n) + .06;
  const TB0 = 47;                                    // the classification dwell starts (film time)

  /* beam passes over a truth j between film times a and b (tau = T in this part of the film) */
  function passes(j, a, b) {
    const out = [];
    for (let s = Math.floor((PA.phase(a) - 7) / TAU); ; s++) {
      const p = PA.shipKm(j, a), az = Math.atan2(p[0], p[1]);
      const t = (az + s * TAU - PA.PH0) / PA.OMEGA;
      if (t > b) break; if (t >= a) out.push(t);
    }
    return out;
  }

  function makeBelief(model, spacing, seed, j, t0, props, maxLooks, rhoDef) {
    const samp = GEO.sample(model, spacing, seed);
    let n = 0; samp.forEach(s => n += s.pts.length / 6);
    const PM = new Float32Array(n * 3), PN = new Float32Array(n * 3), RHO = new Float32Array(n), PDU = new Float32Array(n), PART = new Uint8Array(n);
    let i = 0;
    samp.forEach((s, pi) => {
      const [rho, pd] = props[s.name] || rhoDef;
      for (let k = 0; k < s.pts.length; k += 6, i++) {
        PM[i * 3] = s.pts[k]; PM[i * 3 + 1] = s.pts[k + 1]; PM[i * 3 + 2] = s.pts[k + 2];
        PN[i * 3] = s.pts[k + 3]; PN[i * 3 + 1] = s.pts[k + 4]; PN[i * 3 + 2] = s.pts[k + 5];
        RHO[i] = rho; PDU[i] = pd; PART[i] = pi;
      }
    });
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let q = 0; q < n; q++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], PM[q * 3 + c]); mx[c] = Math.max(mx[c], PM[q * 3 + c]); }
    const looks = passes(j, t0, t0 + 60).slice(0, maxLooks);
    const K = looks.length;
    // per point: the time each look's pulse slab crosses it (Infinity if that look missed it)
    const sh = PA.SHIPS[j], hdg = Math.atan2(sh.d[0], sh.d[1]), RSH = R.y(hdg);
    const p0 = PA.shipKm(j, t0 + 20), los = V.norm([p0[0], 0, p0[1]]), crs = [los[2], 0, -los[0]];
    const UT = new Float32Array(n * K);
    for (let q = 0; q < n; q++) {
      const lam = V.dot(R.ap(RSH, [PM[q * 3], PM[q * 3 + 1], PM[q * 3 + 2]]), los);
      for (let k = 0; k < K; k++) {
        const skip = k < 3 && hsh(q, Math.round(looks[k] * 100)) > PDU[q];
        UT[q * K + k] = skip ? Infinity : looks[k] + (lam + S0) / VW;
      }
    }
    // memo of each point's last two draws; they only change at its update instants
    const CA = new Float32Array(n * 3), CB = new Float32Array(n * 3), CK = new Int32Array(n).fill(-2147483648), CS = new Float32Array(n), CT = new Float32Array(n);
    return { model, samp, n, PM, PN, RHO, PDU, PART, mn, mx, looks, K, UT, RSH, hdg, los, crs, j, t0, CA, CB, CK, CS, CT };
  }

  const DDG = makeBelief(PA_MOD.destroyer(), .9, 21, 0, TB0, { hull: [1, .5], super: [.75, .72], mast: [.6, .85], arms: [.85, .62] }, 9, [.8, .65]);
  // TRK 22 forms mid-film as the transport leaves the squall
  const tr22 = PA.TRACKS.find(t => t.id === 22 && t.t0 > 20 && t.t0 < 80);
  const T22 = tr22 ? tr22.t0 : 52;
  const AK = makeBelief(PA_MOD.transport(), 1.5, 22, 1, T22 + 1, { hull: [1, .55], super: [.8, .7], cargo: [.9, .6] }, 8, [.8, .65]);
  PA.T22 = T22;

  /* the belief's centre: the tracker's estimate, pulled onto the truth look by look */
  function centreOf(B, T) {
    const tp = PA.shipKm(B.j, T), tw = PA.kmW(tp[0], tp[1]);
    const tr = PA.tracksAt(T).find(q => q.ship === B.j);
    let off = [0, 0];
    if (tr) { const ew = PA.kmW(tr.pr.x[0], tr.pr.x[1]); off = [ew[0] - tw[0], ew[1] - tw[1]]; }
    let nl = 0; for (const l of B.looks) if (T > l + .4) nl++;
    const k = Math.exp(-.55 * nl);
    return { c: [tw[0] + off[0] * k, 0, tw[1] + off[1] * k], nl, truth: [tw[0], 0, tw[1]] };
  }
  const easeK = u => u >= 1 ? 1 : u <= 0 ? 0 : 1 - (1 - u) * (1 - u) * (1 - u);
  /* displayed offset of point q at time T -> writes OX/OY/OZ, returns [sigma, flashAge] */
  let OX = 0, OY = 0, OZ = 0;
  function draw3(B, q, key, sig, out, o) {
    const L = B.los, C = B.crs, a = gH(q, key) * sig * .42, b = gH(q, key + 2) * sig, h = gH(q, key + 4) * sig * .38;
    out[o] = L[0] * a + C[0] * b; out[o + 1] = h; out[o + 2] = L[2] * a + C[2] * b;
  }
  function offsetAt(B, q, T, kTop) {
    const K = B.K, base = q * K, o = q * 3;
    let k1 = -1, k0 = -1;
    for (let k = kTop; k >= 0; k--) if (B.UT[base + k] <= T) { if (k1 < 0) k1 = k; else { k0 = k; break; } }
    let key, t1, dur;
    if (k1 < 0) {
      // before the first look the cloud only wanders inside its prior
      const ph = hsh(q, 3) * 2.5, w = Math.floor((T + ph) / 2.5);
      key = -1000 - w; t1 = w * 2.5 - ph; dur = .6;
      if (B.CK[q] !== key) { B.CK[q] = key; draw3(B, q, 20000 + w * 23, 68, B.CA, o); draw3(B, q, 20000 + (w - 1) * 23, 68, B.CB, o); B.CS[q] = 68; B.CT[q] = t1; }
      PA._flash = 99;
    } else {
      key = k1 * 64 + (k0 + 1);
      if (B.CK[q] !== key) {
        B.CK[q] = key; const rho = B.RHO[q];
        draw3(B, q, Math.round(B.looks[k1] * 1000) + 11, sigOf(k1 + 1) * rho, B.CA, o);
        if (k0 < 0) { const ph = hsh(q, 3) * 2.5; draw3(B, q, 20000 + Math.floor((B.UT[base + k1] + ph) / 2.5) * 23, 68, B.CB, o); }
        else draw3(B, q, Math.round(B.looks[k0] * 1000) + 11, sigOf(k0 + 1) * rho, B.CB, o);
        B.CS[q] = sigOf(k1 + 1) * rho; B.CT[q] = B.UT[base + k1];
      }
      dur = .38; PA._flash = T - B.CT[q];
    }
    const u = easeK((T - B.CT[q]) / dur), A = B.CA, Bb = B.CB;
    OX = Bb[o] + (A[o] - Bb[o]) * u; OY = Bb[o + 1] + (A[o + 1] - Bb[o + 1]) * u; OZ = Bb[o + 2] + (A[o + 2] - Bb[o + 2]) * u;
    return B.CS[q];
  }

  /* class hypotheses [unknown, frigate, ddg, cruiser] against evidence e in [0, 1] */
  const PATH = [[0, [.46, .16, .26, .12]], [.3, [.34, .30, .26, .10]], [.5, [.16, .44, .30, .10]], [.7, [.12, .40, .40, .08]], [.86, [.06, .15, .74, .05]], [1, [.03, .04, .89, .04]]];
  function probsAt(e) {
    for (let i = 1; i < PATH.length; i++) if (e <= PATH[i][0]) { const u = E.ss(0, 1, (e - PATH[i - 1][0]) / (PATH[i][0] - PATH[i - 1][0])); return PATH[i - 1][1].map((v, c) => v + (PATH[i][1][c] - v) * u); }
    return PATH[PATH.length - 1][1];
  }
  PA.NAMES = ['Unknown', 'Frigate', 'DDG', 'Cruiser'];

  const LI = V.norm([-.45, .8, -.35]);
  const BEDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const hullB = s => s > .3 ? 10 * Math.max(0, 1 - Math.pow((s - .3) / .7, 1.75)) : s < -.82 ? 10 * (.84 + .16 * (1 - (-.82 - s) / .18)) : 10;

  function drawBelief(pb, cam, B, T, a, o) {
    const { c, nl } = centreOf(B, T), M = B.RSH;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const e0 = e[0], e1 = e[1], e2 = e[2], f0 = f[0], f1 = f[1], f2 = f[2], r0 = ru[0], r1 = ru[1], r2 = ru[2], u0 = u[0], u1 = u[1], u2 = u[2];
    const LIME = PA.LIME, WH = PA.WH, tx = c[0], tz = c[2];
    let sigSum = 0, nS = 0;
    const big = o.big || 330;
    // the last look whose slab can have reached any point yet
    let kTop = -1; for (let k = 0; k < B.K; k++) if (B.looks[k] - .5 <= T) kTop = k;
    for (let q = 0; q < B.n; q++) {
      const sg = offsetAt(B, q, T, kTop);
      const j = q * 3, px = B.PM[j], py = B.PM[j + 1], pz = B.PM[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + tx + OX, y = M[3] * px + M[4] * py + M[5] * pz + OY, z = M[6] * px + M[7] * py + M[8] * pz + tz + OZ;
      if ((q & 63) === 0) { sigSum += sg; nS++; }
      const dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < 5) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      const sgn = Math.min(1, sg / 18);
      const nx = B.PN[j], ny = B.PN[j + 1], nz = B.PN[j + 2];
      let lit = .62;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        lit = (wx * dx + wy * dy + wz * dz > 0 ? .28 : .45) + .55 * Math.max(0, wx * LI[0] + wy * LI[1] + wz * LI[2]);
      }
      let bb = lit + (.66 - lit) * sgn;
      bb *= (1 - .1 * sgn) * (y < 0 ? .45 : 1);
      let cr = WH[0], cg = WH[1], cb = WH[2];
      const fk = PA._flash;
      if (fk < .5 && fk >= 0) { const w = Math.exp(-fk * 7); cr += (LIME[0] - cr) * w; cg += (LIME[1] - cg) * w; cb += (LIME[2] - cb) * w; bb = Math.max(bb, .9 * w); }
      pb.dot(sx, sy, zc < big && (sgn < .5 || (q & 3) === 0) ? 2 : 1, cr, cg, cb, Math.min(1, bb) * a);
    }
    return { c, nl, sig: nS ? sigSum / nS : 68 };
  }

  /* ---------- sea: a world-fixed jittered grid around the ship, gentle swell ---------- */
  const SEA_SP = 12, SEA_N = 132;
  function drawSea(pb, cam, ctr, T, a) {
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const e0 = e[0], e1 = e[1], e2 = e[2], f0 = f[0], f1 = f[1], f2 = f[2], r0 = ru[0], r1 = ru[1], r2 = ru[2], u0 = u[0], u1 = u[1], u2 = u[2];
    const gi0 = Math.floor(ctr[0] / SEA_SP) - SEA_N / 2, gj0 = Math.floor(ctr[2] / SEA_SP) - SEA_N / 2, span = SEA_SP * SEA_N * .5;
    for (let a2 = 0; a2 < SEA_N; a2++) for (let b2 = 0; b2 < SEA_N; b2++) {
      const gi = gi0 + a2, gj = gj0 + b2;
      const x = gi * SEA_SP + (hsh(gi, gj * 7 + 1) - .5) * SEA_SP * .7, z = gj * SEA_SP + (hsh(gj, gi * 5 + 3) - .5) * SEA_SP * .7;
      const y = 1.3 * Math.sin(x * .021 + T * .9) + .7 * Math.sin(z * .034 - T * 1.3 + x * .012);
      const dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < 5) continue;
      const sx = cx + F * (dx * r0 + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      const dd = Math.hypot(x - ctr[0], z - ctr[2]), fade = Math.max(0, 1 - dd / span);
      pb.dot(sx, sy, zc < 340 ? 2 : 1, 238, 238, 228, (.3 + .22 * (y + 2) / 4) * fade * a);
    }
  }

  /* ---------- rain: the squall as falling returns that flare when the beam paints them ---------- */
  /* drops ride with the cell, so each one's rain rate is fixed (the field's own evolution is slow) */
  const NR = 12000, RX = new Float32Array(NR), RZ = new Float32Array(NR), RO = new Float32Array(NR), RQ = new Float32Array(NR);
  { const r = rng(808), c = PA.SQ.at(60);
    // rain falls in shafts: a persistent patchiness in plan, so the curtain has structure
    for (let i = 0, k = 0; k < NR && i < NR * 4; i++) { const x = (r() - .5) * 9000, z = (r() - .5) * 9000, o = r(); const q = PA.rain(c[0] + x / 1000, c[1] + z / 1000, 60); if (q < .08) continue;
      const sh = E.sat(.5 + 1.4 * M3.fbm(x * .0022 + 4.1, z * .0022 - 2.3, 1.7, 3)); if (r() > .25 + .75 * sh) continue;
      RX[k] = x; RZ[k] = z; RO[k] = o; RQ[k] = q * (.55 + .45 * sh); k++; } }
  function drawRain(pb, cam, T, ctr, a) {
    const tau = PA.tau(T), sq = PA.SQ.at(tau), sw = PA.kmW(sq[0], sq[1]);
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx, cy = cam.cy;
    const ph = PA.phase(tau), H = 1400;
    for (let i = 0; i < NR; i++) {
      const q = RQ[i]; if (q < .08) continue;
      const x = sw[0] + RX[i], z = sw[1] + RZ[i];
      const y = H * (1 - ((T * .0065 + RO[i]) % 1)) * (.35 + .65 * q);
      const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 20) continue;
      const sx = cx + F * (dx * ru[0] + dy * ru[1] + dz * ru[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      let d = ph - Math.atan2(x - PA.SITE.x, z - PA.SITE.z); d -= Math.floor(d / TAU) * TAU;
      const k = d < .5 ? Math.exp(-d * 8) : 0;
      const b = Math.min(1, (.3 + .5 * q) * (1 + 1.5 * k) * a * (1 - .55 * y / H));
      // a falling drop: a short streak of returns
      const st = F * 9 / zc;
      for (let j = 0; j < 3; j++) pb.dot(sx, sy - j * st, 1, 238 - 40 * k, 238 + 6 * k, 228 - 178 * k, b * (1 - j * .3));
    }
  }

  /* ---------- the chapter ---------- */
  PA.shipLayer = function (pb, cam, T, A) {
    const out = { tags: [], bars: null };
    if (A.a <= .003) return out;
    const LIME = PA.LIME, WH = PA.WH;
    const d0 = centreOf(DDG, T);
    if (A.sea > .01) drawSea(pb, cam, d0.c, T, A.sea * A.a);
    if (A.rain > .01) drawRain(pb, cam, T, d0.c, A.rain * A.a);
    const r = drawBelief(pb, cam, DDG, T, A.a, {});
    // second contact: condenses once its track exists
    let rk = null;
    const ak = E.ss(T22 - 1, T22 + 3, T) * A.a;
    if (ak > .01) rk = drawBelief(pb, cam, AK, T, ak, { big: 200 });

    const sig = r.sig, ev = E.sat(r.nl / 8);
    const probs = probsAt(T < DDG.looks[0] ? 0 : ev);
    const best = [1, 2, 3].reduce((a, c) => probs[c] > probs[a] ? c : a, 1), pbest = probs[best];
    const conf = E.ss(.7, .86, pbest);
    // uncertainty ellipsoid (2 sigma), shrinking with the looks
    const T0 = DDG.T0 || 0;
    const ea = E.sat((sig - 4) / 10) * A.a;
    const Ax = [DDG.los, DDG.crs, [0, 1, 0]], rad = [sig * .42 * 2, sig * 2, sig * .38 * 2];
    const ctr = V.add(r.c, [0, 8, 0]);
    if (ea > .01) {
      const pxm = cam.fl / Math.max(50, cam.depth(ctr));
      const ring = (i1, i2, off, sc) => {
        const n = Math.round(E.clamp(TAU * Math.max(rad[i1], rad[i2]) * sc * pxm / 6, 40, 420));
        for (let q = 0; q < n; q++) {
          const th = q / n * TAU, p = V.add(V.add(V.add(ctr, V.mul(Ax[i1], Math.cos(th) * rad[i1] * sc)), V.mul(Ax[i2], Math.sin(th) * rad[i2] * sc)), off);
          const pp = cam.project(p); if (pp) pb.dot(pp[0], pp[1], q % 2 ? 1 : 2, WH[0], WH[1], WH[2], ea * (p[1] < 0 ? .3 : .9));
        }
      };
      ring(0, 1, [0, 0, 0], 1); ring(1, 2, [0, 0, 0], 1); ring(0, 2, [0, 0, 0], 1);
      for (const h of [-.55, .55]) ring(0, 1, V.mul([0, 1, 0], h * rad[2]), Math.sqrt(1 - h * h));
    }
    // the burst of pulses of each beam pass, crossing the ship along the line of sight
    for (const tp of DDG.looks) {
      const w = (T - tp) * VW - S0; if (w < -S0 || w > S0 + 60) continue;
      const al = E.sat((w + S0) / 80) * (1 - E.sat((w - S0 + 40) / 100)) * A.a;
      for (const [lag, la] of [[0, 1], [-5, .5], [-11, .25]]) {
        const base = V.add(d0.truth, V.mul(DDG.los, w + lag));
        for (let c2 = -300; c2 <= 300; c2 += 6) for (let h = 0; h <= 70; h += 7) {
          if (h > 0 && hsh((c2 + 300) * 11 + h + lag * 7, Math.round(tp * 10)) > .62 - h / 160) continue;
          const p = cam.project(V.add(base, V.add(V.mul(DDG.crs, c2), [0, h, 0]))); if (!p) continue;
          const edge = 1 - Math.pow(Math.abs(c2) / 305, 2);
          pb.dot(p[0], p[1], h && lag ? 1 : 2, LIME[0], LIME[1], LIME[2], al * la * edge * (h ? .5 * (1 - h / 90) : .95));
        }
      }
    }
    // identified: lime waterline, Kelvin wake, a box that fits the hull
    const Tw = X.make(DDG.RSH, r.c);
    const idA = conf * E.sat((10 - sig) / 4) * A.a;
    if (idA > .01) {
      for (let q = 0; q <= 180; q++) {
        const sN = -1 + 2 * q / 180, b = hullB(sN) + 2.5;
        for (const sd of [-1, 1]) { const p = cam.project(X.ap(Tw, [sd * b, .3, sN * 79])); if (p) pb.dot(p[0], p[1], 2, LIME[0], LIME[1], LIME[2], idA * .95); }
      }
      for (let d = 0; d < 560; d += 7) {
        const dd = d + (T * 7.7) % 7, fa = idA * Math.pow(1 - dd / 560, 1.6);
        for (const sd of [-1, 1]) { const p = cam.project(X.ap(Tw, [sd * (6 + dd * Math.tan(19.5 * DEG)), .4, -78 - dd])); if (p) pb.dot(p[0], p[1], 2, LIME[0], LIME[1], LIME[2], fa * .8); }
      }
      const cs = [];
      for (const sx of [DDG.mn[0] - 1.5, DDG.mx[0] + 1.5]) for (const sy of [DDG.mn[1], DDG.mx[1] + 1.5]) for (const sz of [DDG.mn[2] - 1.5, DDG.mx[2] + 1.5]) cs.push(X.ap(Tw, [sx, sy, sz]));
      for (const [i1, i2] of BEDGES) {
        const n = Math.max(2, Math.ceil(V.dist(cs[i1], cs[i2]) / 2.2));
        for (let q = 0; q <= n; q++) { const p = cam.project(V.lerp(cs[i1], cs[i2], q / n)); if (p) pb.dot(p[0], p[1], 2, WH[0], WH[1], WH[2], idA * (q === 0 || q === n ? 1 : .7)); }
      }
    }
    // tag anchor: the top corner of the box once identified, of the ellipsoid before
    let anc = null;
    if (idA > .3) {
      for (const sx of [DDG.mn[0] - 1.5, DDG.mx[0] + 1.5]) for (const sz of [DDG.mn[2] - 1.5, DDG.mx[2] + 1.5]) { const p = cam.project(X.ap(Tw, [sx, DDG.mx[1] + 1.5, sz])); if (p && (!anc || p[0] - p[1] * .3 > anc[0] - anc[1] * .3)) anc = p; }
    } else {
      for (let q = 0; q < 48; q++) {
        const th = q / 48 * TAU;
        for (const [a1, a2] of [[1, 2], [0, 2], [0, 1]]) {
          const p = cam.project(V.add(V.add(ctr, V.mul(Ax[a1], Math.cos(th) * Math.max(rad[a1], a1 === 1 ? 80 : 0))), V.mul(Ax[a2], Math.sin(th) * Math.max(rad[a2], a2 === 2 ? 45 : 0))));
          if (p && (!anc || p[0] - p[1] * .3 > anc[0] - anc[1] * .3)) anc = p;
        }
      }
    }
    let label;
    if (pbest < .3) label = 'Unknown'; else if (pbest < .75) label = PA.NAMES[best] + '?'; else label = best === 2 ? 'DDG · Arleigh Burke' : PA.NAMES[best];
    if (anc) out.bars = { probs, top: probs.indexOf(Math.max(...probs)), x: Math.min(1920 - 300, anc[0] + 26), y: Math.max(160, anc[1] - 44), ax: anc[0], ay: anc[1], a: A.a * A.tag, label: `${label} · ${pbest.toFixed(2)}`, conf: conf > .5 };
    out.sig = sig; out.looks = r.nl;
    // TRK 22 tag
    if (rk && ak > .2) {
      const ev2 = 1 - Math.exp(-rk.nl / 3.5), p2 = .3 + .55 * ev2;
      const p = cam.project(V.add(rk.c, [0, 45, 0]));
      if (p) out.tags.push({ key: 'ship22', id: 'TRK 22', txt: `${p2 < .75 ? 'AK?' : 'AK · Transport'} · ${p2.toFixed(2)}`, cls: p2 >= .75 ? 'lime' : 'sm', ax: p[0], ay: p[1], x: p[0] + 14, y: p[1] - 34, a: ak * A.tag, pri: 3 });
    }
    return out;
  };
  PA.DDGB = DDG; PA.AKB = AK;
  PA.shipCentre = T => centreOf(DDG, T).c;
})();
