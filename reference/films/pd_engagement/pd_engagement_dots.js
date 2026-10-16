/* ENGAGEMENT: the dot world low over the sea. A packed max-blend dot raster (pb_survey's put), the sky
   at infinity, the sea as world-fixed jittered lattices in TRK 21's frame (one band per distance, each
   periodic under the group's motion so the picture-clock jump at TJ never shows), the three ships as
   sampled HD models, and the four rounds (dot-sampled HD.oniks, lime at the silhouette) with their
   ramjet plumes and trails. Effect stages draw through the same helpers (PD.DW). */
(function () {
  const { V, R, X, E, rng } = M3;
  const PD = window.PD, DEG = PD.DEG, TAU = PD.TAU, hsh = PD.hsh, LIME = PD.LIME, WH = PD.WH;
  const DW = PD.DW = {};

  /* ---------- raster: the current camera + buffer ---------- */
  let E0 = 0, E1 = 0, E2 = 0, F0 = 0, F1 = 0, F2 = 1, R0 = 1, R1 = 0, R2 = 0, U0 = 0, U1 = 1, U2 = 0, FL = 1000, CX = 960, CY = 540, NEAR = .3;
  let PU = null, PW = 1920, PH = 1080, BUF = null, CAM = null;
  const q = DW.q = { x: 0, y: 0, z: 0 };
  const U32 = new Map();
  const u32of = b => { let u = U32.get(b); if (!u) { u = new Uint32Array(b.img.data.buffer); U32.set(b, u); } return u; };
  DW.sync = function (c, buf) {
    PU = u32of(buf); PW = buf.W; PH = buf.H; BUF = buf; CAM = c;
    E0 = c.eye[0]; E1 = c.eye[1]; E2 = c.eye[2]; F0 = c.f[0]; F1 = c.f[1]; F2 = c.f[2];
    R0 = c.r[0]; R1 = c.r[1]; R2 = c.r[2]; U0 = c.u[0]; U1 = c.u[1]; U2 = c.u[2];
    FL = c.fl; CX = c.cx + c.shake[0]; CY = c.cy + c.shake[1]; NEAR = c.near;
  };
  /* max-blend square dot (PointBuf.dot semantics) into the synced buffer */
  function put(x, y, s, r, g, b, a) {
    const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    const Rr = (r * a) | 0, G = (g * a) | 0, B = (b * a) | 0;
    for (let j = 0; j < s; j++) {
      let i = (y0 + j) * PW + x0;
      for (let k = 0; k < s; k++, i++) {
        const p = PU[i], pr = p & 255, pg = (p >>> 8) & 255, pb_ = (p >>> 16) & 255;
        if (Rr > pr || G > pg || B > pb_) PU[i] = 0xff000000 | ((B > pb_ ? B : pb_) << 16) | ((G > pg ? G : pg) << 8) | (Rr > pr ? Rr : pr);
      }
    }
  }
  /* project a world point: writes q.x, q.y (px), q.z (depth); false behind the near plane or far off screen */
  function P3(x, y, z) {
    const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < NEAR) return false;
    q.x = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc; q.y = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc; q.z = zc;
    return q.x > -40 && q.y > -40 && q.x < PW + 40 && q.y < PH + 40;
  }
  const add = (x, y, s, r, g, b, a) => BUF.add(x, y, s, r, g, b, a);
  /* overlay dot that replaces what is under it, so lime reads over bright dots */
  function dset(x, y, s, c, a) {
    const d = BUF.d; const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * PW + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  }
  function dline3(a, b, step, s, c, al) {
    const n = Math.max(1, Math.ceil(V.dist(a, b) / step));
    for (let k = 0; k <= n; k++) { const t = k / n; if (P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) put(q.x, q.y, s, c[0], c[1], c[2], al); }
  }
  /* soft additive disc, (1 - d²/R²)² falloff (for glows and flashes) */
  function glow(x, y, Rr, r, g, b, a) {
    if (a <= .002) return;
    const d = BUF.d, W = PW, x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(PH - 1, Math.ceil(y + Rr)), iR2 = 1 / (Rr * Rr);
    for (let j = y0; j <= y1; j++) { const dy = j - y; for (let i = x0; i <= x1; i++) { const dx = i - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue; const w = u * u * a, k = (j * W + i) * 4; d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w; } }
  }
  Object.assign(DW, { put, P3, add, dset, dline3, glow });

  /* ---------- lit dot clouds (sampled GEO / HD parts) ---------- */
  const LM = V.norm([.55, .72, -.42]);           // key light high in the south-east: the starboard sides the raid sees are lit
  DW.LM = LM;
  /* pts: part-space stride 6; T: rigid transform; a: alpha; big: depth under which dots are 2 px; lime: 0..1 tint */
  function drawPts(pts, T, a, big, lime, stride) {
    const M = T.R, t = T.T, L0 = LM[0], L1 = LM[1], L2 = LM[2];
    let cr = WH[0], cg = WH[1], cb = WH[2];
    if (lime) { cr += (LIME[0] - cr) * lime; cg += (LIME[1] - cg) * lime; cb += (LIME[2] - cb) * lime; }
    const st6 = 6 * (stride || 1);
    for (let j = 0, n = pts.length; j < n; j += st6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .55;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = wx * dx + wy * dy + wz * dz > 0 ? .12 + .14 * lit : .3 + .68 * lit;
      }
      b *= a; if (y < 0) b *= .35;
      if (lime) b = Math.max(b, lime * a * .85);
      put(sx, sy, zc < big ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
  DW.drawPts = drawPts;
  const partX = (Wx, part, st) => part.xf ? X.mul(Wx, part.xf(st)) : Wx;
  DW.partX = partX;

  /* ---------- sky: dots at infinity, a dusk band low in the west ---------- */
  const SKYV = (() => {
    const r = rng(303), a = [];
    for (let i = 0; i < 26000; i++) {
      const az = r() * TAU, above = r() < .82, el = above ? Math.pow(r(), 2.4) * 20 * DEG : -Math.pow(r(), 1.6) * 1.2 * DEG;
      const dusk = Math.pow(Math.max(0, Math.cos(az - 288 * DEG)), 3);
      const b = (above ? .16 + .6 * Math.exp(-el / (3.4 * DEG)) : .7 * Math.exp(el / (.45 * DEG))) * (.34 + .66 * dusk) * (.75 + .25 * r());
      a.push(Math.sin(az), Math.cos(az), Math.sin(el), Math.cos(el), b);
    }
    return new Float32Array(a);
  })();
  const SKYC = [206, 216, 196];
  DW.drawSky = function (k) {
    // the horizon dips with height (small angle)
    const dip = Math.sqrt(2 * Math.max(1, E1) / 6.371e6);
    for (let i = 0, n = SKYV.length; i < n; i += 5) {
      const se = SKYV[i + 2] - dip * SKYV[i + 3], ce = SKYV[i + 3] + dip * SKYV[i + 2];
      const dx = SKYV[i] * ce, dy = se, dz = SKYV[i + 1] * ce, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < .05) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      const b = SKYV[i + 4] * 1.1 * k;
      put(sx, sy, 1, SKYC[0], SKYC[1], SKYC[2], b > 1 ? 1 : b);
    }
  };

  /* ---------- sea: jittered lattices in TRK 21's frame ----------
     A point (i, j) of a band sits at ship + STB * (i st + jit) + FWD * (j st + jit - flow), flow = (VS S) mod PER.
     Before TJ that is world-fixed (the ship moves with tau = S); the jitter is periodic in j mod PER/st and the
     swell's wavelengths divide PER, so wrapping the flow and the jump at TJ change nothing on screen. */
  const PER = 1728;
  /* each band cross-fades with the next over [next.r0, this.r1] */
  const BANDS = [
    { st: 2.4, r0: 0, r1: 230, big: 60 },
    { st: 8, r0: 180, r1: 700, big: 260 },
    { st: 24, r0: 560, r1: 2600, big: 0 },
    { st: 72, r0: 2200, r1: 8200, big: 0 },
    { st: 216, r0: 7200, r1: 24000, big: 0 },
  ];
  BANDS.forEach((b, i) => {
    b.P = Math.round(PER / b.st); b.fin = i ? BANDS[i - 1].r1 : 0; b.fout = i < BANDS.length - 1 ? BANDS[i + 1].r0 : b.r1 - 4000;
    // per node (i mod 64, j mod P): jitter across and along, and a flicker phase
    const n = 64 * b.P; b.JL = new Float32Array(n); b.JW = new Float32Array(n); b.CP = new Float32Array(n);
    for (let jm = 0; jm < b.P; jm++) for (let im = 0; im < 64; im++) { const q = jm * 64 + im, h1 = hsh(im * 7 + 3 + i * 101, jm * 13 + 5), h2 = hsh(im * 11 + 1, jm * 3 + 9 + i * 57); b.JL[q] = (h1 - .5) * .7 * b.st; b.JW[q] = (h2 - .5) * .7 * b.st; b.CP[q] = hsh(im + 900 * i, jm + 77); }
  });
  /* the swell (m) at lattice coordinates (lateral l, along-heading w), sim time s */
  const swell = (l, w, s) => .85 * Math.sin(TAU * (w / 144 + l / 432) + 1.1 * s) + .45 * Math.sin(TAU * (w / 96 - l / 216) - 1.7 * s) + .25 * Math.sin(TAU * (w / 48 + l / 72) + 2.9 * s);
  DW.swell = swell;
  const SEAN = DW.seaN = new Int32Array(BANDS.length);         // lattice nodes visited per band (last frame)
  /* k: alpha; vcam: camera velocity (m per film second) for speed streaks on the near bands */
  DW.drawSea = function (T, k, vcam) {
    const Sn = PD.S(T), tau = PD.tau(T), O = PD.ship(0, tau), f = PD.FWD, rt = PD.STB;
    const ph = PD.phase(tau), LR = LIME[0] - WH[0], LG = LIME[1] - WH[1], LB = LIME[2] - WH[2];
    const ex = E0 - O[0], ez = E2 - O[2], le = ex * rt[0] + ez * rt[2], we = ex * f[0] + ez * f[2];
    const hgt = Math.max(2, E1);
    const vx = vcam ? vcam[0] / 45 : 0, vy = vcam ? vcam[1] / 45 : 0, vz = vcam ? vcam[2] / 45 : 0;
    const streak = vcam && Math.hypot(vx, vz) > .6;
    const kmin = -60 - CX, kmax = PW + 60 - CX, kb = PH + 40 - CY, kt = CY + 40;
    let lo = 0, hi = 0;
    const lin = (c0, c1) => { if (c1 > -1e-12 && c1 < 1e-12) { if (c0 < 0) { lo = 1; hi = 0; } return; } const r = -c0 / c1; if (c1 > 0) { if (r > lo) lo = r; } else if (r < hi) hi = r; };
    const flk = Sn * .37;
    SEAN.fill(0);
    const r0x = rt[0], r2x = rt[2], f0x = f[0], f2x = f[2];
    for (let bi = 0; bi < BANDS.length; bi++) {
      const B = BANDS[bi], st = B.st, P = B.P, flow = (PD.VS * Sn) % PER, JL = B.JL, JW = B.JW, CPh = B.CP, wav = bi < 3;
      if (B.r1 < hgt * .6) continue;
      const r1 = B.r1, rr0 = B.r0, fadeIn = B.fin, rr1 = B.fout, r1q = r1 * r1, r0q = rr0 * rr0, fiq = fadeIn * fadeIn, foq = rr1 * rr1;
      const j0 = Math.floor((we + flow - r1) / st), j1 = Math.ceil((we + flow + r1) / st);
      const xb = r0x * R0 + r2x * R2, yb = r0x * U0 + r2x * U2, zb = r0x * F0 + r2x * F2;
      // swell along a row by rotation recurrences (nodes' lattice coordinates; the jitter is below its scale)
      const d1 = TAU * st / 432, d2 = -TAU * st / 216, d3 = TAU * st / 72;
      const c1 = Math.cos(d1), n1 = Math.sin(d1), c2 = Math.cos(d2), n2 = Math.sin(d2), c3 = Math.cos(d3), n3 = Math.sin(d3);
      for (let j = j0; j <= j1; j++) {
        const jm = ((j % P) + P) % P, wz0 = j * st - flow, row = jm * 64;
        // this row's l-interval on screen and in front of the lens (camera coords are linear in l along a row)
        const bx = O[0] + f0x * wz0 - E0, by = -E1, bz = O[2] + f2x * wz0 - E2;
        const xa = bx * R0 + by * R1 + bz * R2, ya = bx * U0 + by * U1 + bz * U2, za = bx * F0 + by * F1 + bz * F2;
        lo = le - r1; hi = le + r1;
        lin(za - 1, zb); lin(FL * xa - kmin * za, FL * xb - kmin * zb); lin(kmax * za - FL * xa, kmax * zb - FL * xb);
        lin(FL * ya + kb * za, FL * yb + kb * zb); lin(kt * za - FL * ya, kt * zb - FL * yb);
        if (lo > hi) continue;
        const i0 = Math.floor(lo / st) - 1, i1 = Math.ceil(hi / st) + 1;
        SEAN[bi] += i1 - i0 + 1;
        let s1 = 0, k1 = 0, s2 = 0, k2 = 0, s3 = 0, k3 = 0;
        if (wav) {
          const qz = j * st, ql = i0 * st;
          let a = TAU * (qz / 144 + ql / 432) + 1.1 * Sn; s1 = Math.sin(a); k1 = Math.cos(a);
          a = TAU * (qz / 96 - ql / 216) - 1.7 * Sn; s2 = Math.sin(a); k2 = Math.cos(a);
          a = TAU * (qz / 48 + ql / 72) + 2.9 * Sn; s3 = Math.sin(a); k3 = Math.cos(a);
        }
        let thc = 0, dth = 0, ic = i0;
        for (let i = i0; i <= i1; i++) {
          let y = 0;
          if (wav) {
            y = .85 * s1 + .45 * s2 + .25 * s3;
            let t = s1 * c1 + k1 * n1; k1 = k1 * c1 - s1 * n1; s1 = t;
            t = s2 * c2 + k2 * n2; k2 = k2 * c2 - s2 * n2; s2 = t;
            t = s3 * c3 + k3 * n3; k3 = k3 * c3 - s3 * n3; s3 = t;
          }
          if (((i - i0) & 15) === 0) {
            // the node's bearing from the radar, linear over the next 16 nodes
            const xn = O[0] + r0x * i * st + f0x * wz0, zn = O[2] + r2x * i * st + f2x * wz0;
            thc = Math.atan2(xn, zn); dth = st * (r0x * zn - r2x * xn) / (xn * xn + zn * zn); ic = i;
          }
          const nq = row + (i & 63);
          const l = i * st + JL[nq], w = wz0 + JW[nq];
          const dl = l - le, dw = w - we, dq = dl * dl + dw * dw;
          if (dq < r0q || dq > r1q) continue;
          const x = O[0] + r0x * l + f0x * w, z = O[2] + r2x * l + f2x * w;
          const dx = x - E0, dz = z - E2;
          const zc0 = dx * F0 + dz * F2 - E1 * F1;
          if (zc0 < 1) continue;
          const dy = y - E1, zc = zc0 + y * F1;
          if (zc < NEAR) continue;
          const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
          if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
          let fa = 1;
          if (dq < fiq && rr0 > 0) fa = (Math.sqrt(dq) - rr0) / (fadeIn - rr0);
          if (dq > foq) fa *= (r1 - Math.sqrt(dq)) / (r1 - rr1);
          let crest = CPh[nq] + flk; crest -= Math.floor(crest); crest = crest < .5 ? crest * 2 : 2 - crest * 2;
          // the Monolith-B's beam sweeping the sea: a thin lime edge, then the afterglow of the paint
          let db = ph - thc - (i - ic) * dth; db -= Math.floor(db / TAU) * TAU;
          const edge = db < .14 ? Math.exp(-db * 34) : 0, ag = 1 / (1 + db * (.9 + db * (.4 + db * .15)));
          const sw = (y + 1.55) / 3.1;
          let b = k * fa * (.3 + .42 * sw * sw + .16 * crest) * (zc < 20000 ? 1 - zc / 30000 : .33) * (.66 + .62 * ag);
          if (edge > .03) { const eb = k * fa * edge; if (b < eb) b = eb; put(sx, sy, zc < 900 ? 2 : 1, WH[0] + LR * edge, WH[1] + LG * edge, WH[2] + LB * edge, b > 1 ? 1 : b); continue; }
          if (b < .01) continue;
          if (streak && bi < 2 && zc < 700) {
            // speed: the point's track across the lens over ~1/45 s
            const x2 = x + vx, y2 = y + vy, z2 = z + vz, ex2 = x2 - E0, ey2 = y2 - E1, ez2 = z2 - E2, zc2 = ex2 * F0 + ey2 * F1 + ez2 * F2;
            if (zc2 > NEAR) {
              const sx2 = CX + FL * (ex2 * R0 + ey2 * R1 + ez2 * R2) / zc2, sy2 = CY - FL * (ex2 * U0 + ey2 * U1 + ez2 * U2) / zc2;
              const L = Math.hypot(sx2 - sx, sy2 - sy);
              if (L > 2.5) {
                const n = Math.min(9, Math.ceil(L / 2.6)), bl = b * Math.min(1, 3.4 / Math.sqrt(L));
                put(sx, sy, zc < 400 ? 2 : 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
                for (let m = 1; m <= n; m++) { const t = m / n; put(sx + (sx2 - sx) * t, sy + (sy2 - sy) * t, 1, WH[0], WH[1], WH[2], bl * (1 - .6 * t)); }
                continue;
              }
            }
          }
          put(sx, sy, zc < B.big ? 2 : 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
        }
      }
    }
  };
  BANDS[0].big = 400; BANDS[1].big = 400;

  /* ---------- ships ---------- */
  const has = k => !!(window.HD && typeof HD[k] === 'function');
  const DDM = has('destroyer') ? HD.destroyer() : GEO.destroyer();
  const CVM = has('carrier') ? HD.carrier() : GEO.destroyer();
  const t0 = performance.now();
  /* levels: finest first; each {sp, parts: [{part, pts}]} */
  const bake = (m, levels, seed, fineFrom) => levels.map((sp, k) => ({ sp, parts: GEO.sample(m, sp, seed + k * 7, {}, k >= fineFrom ? { fine: false } : undefined).filter(s => s.pts.length) }));
  const DDG_LV = bake(DDM, [.36, .8, 2.0, 4.5], 21, 1);
  const CVN_LV = bake(CVM, [1.2, 3, 7], 14, 0);
  DW.DDM = DDM; DW.DDG_LV = DDG_LV; DW.CVN_LV = CVN_LV;
  DW.bakeMs = Math.round(performance.now() - t0);
  /* state of TRK 21 (sps turning; the defence stage adds vlsOpen, ciwsYaw...) */
  DW.shipState = (j, T) => ({ sps: PD.S(T) * TAU / 4 });
  DW.drawShip = function (j, T, a) {
    if (a <= .01) return;
    const tau = PD.tau(T), Xf = PD.shipX(j, tau), c = Xf.T, sh = PD.SHIPS[j];
    const dist = Math.max(10, Math.hypot(c[0] - E0, c[1] - E1, c[2] - E2) - sh.L * 400);
    const LV = sh.kind === 'cvn' ? CVN_LV : DDG_LV;
    // the coarsest level whose spacing is still under ~2.6 px
    let L = LV[LV.length - 1];
    for (let k = LV.length - 1; k >= 0; k--) { L = LV[k]; if (LV[k].sp * FL / dist < 2.6) break; }
    const st = PD.shipStateFx ? PD.shipStateFx(DW.shipState(j, T), T) : DW.shipState(j, T);
    // painted by the Monolith-B: a lime flash as the beam crosses the ship
    let db = PD.phase(tau) - Math.atan2(c[0], c[2]); db -= Math.floor(db / TAU) * TAU;
    const paint = db < .12 ? .8 * Math.exp(-db * 30) * (PD.paintK ? PD.paintK(j, T) : 1) : 0;
    for (const s of L.parts) {
      if (s.part.show && !s.part.show(st)) continue;
      // 2 px dots only where their spacing on screen leaves room (a surface of separate dots, never a solid fill)
      drawPts(s.pts, partX(Xf, s.part, st), a, L.sp * FL / 3.2, paint);
    }
    DW.drawWake(j, T, a);
  };
  /* wake: the Kelvin arms and the turbulent centre line, flowing aft (sim time) */
  DW.drawWake = function (j, T, a) {
    const Sn = PD.S(T), Tm = PD.shipX(j, PD.tau(T)), L = PD.SHIPS[j].L * 1000, h = L / 2;
    const flow = (Sn * PD.VS) % 6;
    const pt = (x, y, z) => P3(Tm.R[0] * x + Tm.R[1] * y + Tm.R[2] * z + Tm.T[0], Tm.R[3] * x + Tm.R[4] * y + Tm.R[5] * z + Tm.T[1], Tm.R[6] * x + Tm.R[7] * y + Tm.R[8] * z + Tm.T[2]);
    for (let d = 0; d < 1100; d += 6) {
      const dd = d + flow, fa = a * Math.pow(1 - dd / 1100, 1.5);
      for (const sd of [-1, 1]) if (pt(sd * (L / 22 + dd * Math.tan(19.5 * DEG)), .4, -h - dd)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], fa * .55);
      for (let m = 0; m < 3; m++) { const r = hsh(d * 3 + m + j * 5000, Math.floor(Sn * PD.VS / 6) - (d / 6 | 0)), lat = (r - .5) * (L / 11 + dd * .07); if (pt(lat, .3, -h - dd)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], fa * .45); }
    }
    for (let k = 0; k < 90; k++) { const sd = k & 1 ? 1 : -1, zz = h * .78 - (k >> 1) * L / 90, b = L / 15 + (h * .78 - zz) * .06; if (pt(sd * b, .5 + .4 * Math.sin(k + Sn * 3), zz)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], a * .5); }
  };

  /* ---------- rounds ---------- */
  const OM = has('oniks') ? HD.oniks() : GEO.oniks();
  const RSKIP = { booster: 1, cover: 1 };
  const RND_LV = [.035, .1, .26].map((sp, k) => ({ sp, parts: GEO.sample(OM, sp, 60 + k, { wing: 1, fin: 1, booster: false, cover: false }).filter(s => s.pts.length && !RSKIP[s.name]) }));
  DW.RND_LV = RND_LV;
  const NOZ = (window.HD && HD.oniks && HD.oniks.NOZZLE) || [0, 0, -4.5];
  /* round orientation: nose along its velocity, a small roll as it weaves */
  DW.roundX = (k, RO) => X.make(R.look(RO.dir, [0, 1, 0]), RO.p);
  /* the round: lit dots, lime where the surface turns away (the silhouette), a white-hot plume with shock diamonds */
  const LR0 = LIME[0] - WH[0], LG0 = LIME[1] - WH[1], LB0 = LIME[2] - WH[2];
  function drawRoundPts(pts, T, a, big) {
    const M = T.R, t = T.T, L0 = LM[0], L1 = LM[1], L2 = LM[2];
    for (let j = 0, n = pts.length; j < n; j += 6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .5, rim = .6;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz), fac = -(wx * dx + wy * dy + wz * dz) * il;
        if (fac < -.15) continue;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = .22 + .72 * lit;
        rim = fac < .3 ? 1 - Math.max(0, fac) / .3 : 0;
      }
      const cr = WH[0] + LR0 * rim, cg = WH[1] + LG0 * rim, cb = WH[2] + LB0 * rim;
      b = Math.max(b, rim * .95) * a;
      put(sx, sy, zc < big ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
  DW.drawRound = function (k, T, RO, a) {
    if (a <= .01) return null;
    const Xf = DW.roundX(k, RO), c = RO.p;
    const dist = Math.max(.5, Math.hypot(c[0] - E0, c[1] - E1, c[2] - E2) - 4.5);
    if (dist > 60000) return null;
    let L = RND_LV[RND_LV.length - 1];
    for (let j = RND_LV.length - 1; j >= 0; j--) { L = RND_LV[j]; if (RND_LV[j].sp * FL / dist < 2.2) break; }
    if (8.9 * FL / dist < 3) {
      // a speck: one lime point
      if (P3(c[0], c[1], c[2])) { put(q.x, q.y, 2, LIME[0], LIME[1], LIME[2], a); put(q.x, q.y, 1, 255, 255, 240, a); }
    } else for (const s of L.parts) drawRoundPts(s.pts, s.part.xf ? X.mul(Xf, s.part.xf({ wing: 1, fin: 1 })) : Xf, a, L.sp * FL / 2.6);
    drawPlume(k, T, Xf, a, dist);
    return Xf;
  };
  /* ramjet plume: a hot core leaving the nozzle, shock diamonds for ~4 m, a paling trail */
  function drawPlume(k, T, Xf, a, dist) {
    const Sn = PD.S(T), fr = Math.floor(Sn * 90), M = Xf.R, n0 = X.ap(Xf, NOZ), ax = [-M[2], -M[5], -M[8]];
    const ux = [M[0], M[3], M[6]], uy = [M[1], M[4], M[7]];
    const px = FL / Math.max(1, dist);
    if (px * 8 < 2) { if (P3(n0[0], n0[1], n0[2])) put(q.x, q.y, 2, 255, 250, 225, a); return; }
    const N = Math.min(700, Math.round(90 + px * 90));
    for (let i = 0; i < N; i++) {
      const u = hsh(i + k * 977, fr), v = hsh(i + 131, fr + k * 3), w = hsh(i + 71, 5 + k);
      const s = 16 * Math.pow(u, 1.8), rad = (.1 + .03 * s) * Math.sqrt(v) * (s < .3 ? 1.6 : 1), th = TAU * w + fr * .7;
      const cx = Math.cos(th) * rad, cy = Math.sin(th) * rad;
      const x = n0[0] + ax[0] * s + ux[0] * cx + uy[0] * cy, y = n0[1] + ax[1] * s + ux[1] * cx + uy[1] * cy, z = n0[2] + ax[2] * s + ux[2] * cx + uy[2] * cy;
      if (!P3(x, y, z)) continue;
      // shock diamonds: bright nodes every ~0.75 m for the first ~5 m of the jet
      const dia = s < 5 ? Math.pow(.5 + .5 * Math.cos(TAU * s / .75), 6) * (1 - s / 5) : 0;
      const hot = Math.exp(-s / 1.6), b = a * Math.min(1, .3 + 1.1 * hot + 1.1 * dia) * (1 - s / 16.5);
      put(q.x, q.y, q.z < 80 ? 2 : 1, 255, 236 + 19 * hot, 200 + 50 * hot, b);
    }
    if (P3(n0[0], n0[1], n0[2])) { glow(q.x, q.y, Math.min(46, 4 + px * 1.3), 255, 242, 210, .4 * a); glow(q.x, q.y, Math.min(14, 2 + px * .35), 255, 255, 245, .7 * a); }
  }
  /* the air the round has flown through: a lime dotted trail, fading over ~1 km */
  DW.drawTrail = function (k, T, a) {
    if (a <= .01) return;
    const tau = PD.tau(T), RO = {}, tS = PD.tauStop(k), t1 = Math.min(tau, tS);
    for (let j = 1; j <= 110; j++) {
      const tp = t1 - j * .014; PD.round(k, tp, RO);
      if (!P3(RO.p[0], RO.p[1], RO.p[2])) continue;
      const age = tau - tp, al = a * .8 * Math.exp(-age / .6) * (1 - j / 111);
      if (al < .02) break;
      put(q.x, q.y, q.z < 250 ? 2 : 1, LIME[0], LIME[1], LIME[2], al);
    }
  };
})();
