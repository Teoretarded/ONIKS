/* AEGIS: the raster and the ship's own radar picture. A packed max-blend dot raster (pb_survey's put), then the
   360° SPY scope centred on the ship: a lattice of range x azimuth resolution cells whose sea clutter (R^-3 inside
   the horizon, R^-7 beyond, wind rows, spikes) rises and glows as the four face beams paint it; range rings and
   bearing ticks; the group's returns; the tracks: surface (rings), air (altitude stalks), the raid (coral: an
   uncertainty cloud that condenses look by look into a track with a trail) and the interceptors (plain lime lines).
   Every paint is keyed on (cell, paint index mod NS), so the scope at T = D is the scope at T = 0. */
(function () {
  const { V, R, X, E, rng, fbm } = M3;
  const PE = window.PE, DEG = PE.DEG, TAU = PE.TAU, hsh = PE.hsh, gH = PE.gH, LIME = PE.LIME, WH = PE.WH, CORAL = PE.CORAL;
  const DW = PE.DW = {};

  /* ---------- raster: the current camera + buffer ---------- */
  let E0 = 0, E1 = 0, E2 = 0, F0 = 0, F1 = 0, F2 = 1, R0 = 1, R1 = 0, R2 = 0, U0 = 0, U1 = 1, U2 = 0, FL = 1000, CX = 960, CY = 540, NEAR = .3;
  let PU = null, PW = 1920, PH = 1080, BUF = null;
  const q = DW.q = { x: 0, y: 0, z: 0 };
  const U32 = new Map();
  const u32of = b => { let u = U32.get(b); if (!u) { u = new Uint32Array(b.img.data.buffer); U32.set(b, u); } return u; };
  DW.sync = function (c, buf) {
    PU = u32of(buf); PW = buf.W; PH = buf.H; BUF = buf;
    E0 = c.eye[0]; E1 = c.eye[1]; E2 = c.eye[2]; F0 = c.f[0]; F1 = c.f[1]; F2 = c.f[2];
    R0 = c.r[0]; R1 = c.r[1]; R2 = c.r[2]; U0 = c.u[0]; U1 = c.u[1]; U2 = c.u[2];
    FL = c.fl; CX = c.cx + c.shake[0]; CY = c.cy + c.shake[1]; NEAR = c.near;
    DW.cam = c;
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
  const P3v = p => P3(p[0], p[1], p[2]);
  /* overlay dot that replaces what is under it, so lime / coral read over bright dots */
  function dset(x, y, s, c, a) {
    const d = BUF.d; const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * PW + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  }
  /* dotted 3D line, one dot every `step` metres */
  function dline3(a, b, step, s, c, al) {
    const n = Math.max(1, Math.ceil(V.dist(a, b) / step));
    for (let k = 0; k <= n; k++) { const t = k / n; if (P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) put(q.x, q.y, s, c[0], c[1], c[2], al); }
  }
  /* dotted 3D line with a constant on-screen spacing (px) */
  function sline3(a, b, px, s, c, al, set) {
    if (!P3v(a)) { if (!P3v(b)) return; }
    const pa = P3v(a) ? [q.x, q.y] : null, pb = P3v(b) ? [q.x, q.y] : null;
    let n = 24;
    if (pa && pb) n = Math.max(1, Math.min(900, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / px)));
    for (let k = 0; k <= n; k++) { const t = k / n; if (P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) { if (set) dset(q.x, q.y, s, c, al); else put(q.x, q.y, s, c[0], c[1], c[2], al); } }
  }
  /* soft additive disc, (1 - d²/R²)² falloff (glows and flashes) */
  function glow(x, y, Rr, r, g, b, a) {
    if (a <= .002) return;
    const d = BUF.d, W = PW, x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(PH - 1, Math.ceil(y + Rr)), iR2 = 1 / (Rr * Rr);
    for (let j = y0; j <= y1; j++) { const dy = j - y; for (let i = x0; i <= x1; i++) { const dx = i - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue; const w = u * u * a, k = (j * W + i) * 4; d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w; } }
  }
  const add = (x, y, s, r, g, b, a) => BUF.add(x, y, s, r, g, b, a);
  /* lit dot cloud: stride-6 part-local points (xyz, normal) under rigid transform Tm */
  const LM = V.norm([.45, .8, .38]);
  function drawPts(pts, Tm, a, big, col, lime, stride, from, to) {
    const M = Tm.R, t = Tm.T, L0 = LM[0], L1 = LM[1], L2 = LM[2];
    let cr = col ? col[0] : WH[0], cg = col ? col[1] : WH[1], cb = col ? col[2] : WH[2];
    if (lime) { cr += (LIME[0] - cr) * lime; cg += (LIME[1] - cg) * lime; cb += (LIME[2] - cb) * lime; }
    const st6 = 6 * (stride || 1), j1 = to === undefined ? pts.length : to;
    const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8], t0 = t[0], t1 = t[1], t2 = t[2];
    for (let j = from || 0; j < j1; j += st6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = m0 * px + m1 * py + m2 * pz + t0, y = m3 * px + m4 * py + m5 * pz + t1, z = m6 * px + m7 * py + m8 * pz + t2;
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      if (occOn && occ(sx, sy, zc)) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .55;
      if (nx || ny || nz) {
        const wx = m0 * nx + m1 * ny + m2 * nz, wy = m3 * nx + m4 * ny + m5 * nz, wz = m6 * nx + m7 * ny + m8 * nz;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = wx * dx + wy * dy + wz * dz > 0 ? .12 + .16 * lit : .3 + .66 * lit;
      }
      b *= a; if (lime) b = Math.max(b, lime * a);
      put(sx, sy, zc < big ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
  /* coarse occlusion: the own ship's dots mark 4x4 px tiles with their nearest depth; the sea, the sky, the scope
     and the far hulls skip dots that fall behind them, so the ship reads solid */
  const OT = 4, OW = 480, OH = 270, OZ = new Float32Array(OW * OH), OC = new Uint8Array(OW * OH);
  let occOn = false;
  DW.occReset = () => { OZ.fill(1e9); OC.fill(0); occOn = false; };
  function occ(x, y, z) {
    if (!occOn) return false;
    const t = ((y | 0) >> 2) * OW + ((x | 0) >> 2);
    return t >= 0 && t < OW * OH && OC[t] > 0 && z > OZ[t] * 1.02 + .3;
  }
  /* drawPts that also writes the occlusion tiles; s = the sampling spacing (m), for the dot's footprint */
  function drawPtsOcc(pts, Tm, a, big, s, stride) {
    occOn = true;
    const M = Tm.R, t = Tm.T, L0 = LM[0], L1 = LM[1], L2 = LM[2];
    const st6 = 6 * (stride || 1);
    const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8], t0 = t[0], t1 = t[1], t2 = t[2];
    for (let j = 0, n = pts.length; j < n; j += st6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = m0 * px + m1 * py + m2 * pz + t0, y = m3 * px + m4 * py + m5 * pz + t1, z = m6 * px + m7 * py + m8 * pz + t2;
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      const k = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2);
      if (OC[k] === 4 && zc > OZ[k] * 1.02 + .12) continue;
      if (zc < OZ[k]) OZ[k] = zc; if (OC[k] !== 4) OC[k] = 1;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .55;
      if (nx || ny || nz) {
        const wx = m0 * nx + m1 * ny + m2 * nz, wy = m3 * nx + m4 * ny + m5 * nz, wz = m6 * nx + m7 * ny + m8 * nz;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = wx * dx + wy * dy + wz * dz > 0 ? .1 + .12 * lit : .26 + .5 * lit;
      }
      b *= a;
      put(sx, sy, zc < big ? 2 : 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
    }
  }
  /* close the gaps between the ship's dots: an empty tile between two covered ones (left-right or up-down) is
     covered too (twice, so gaps two tiles wide close); no dilation past the silhouette */
  DW.occClose = function () {
    if (!occOn) return;
    let x0 = OW, x1 = 0, y0 = OH, y1 = 0;
    for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x += 4) if (OC[r + x] | OC[r + x + 1] | OC[r + x + 2] | OC[r + x + 3]) { if (x < x0) x0 = x; if (x + 3 > x1) x1 = x + 3; if (y < y0) y0 = y; y1 = y; } }
    x0 = Math.max(1, x0); x1 = Math.min(OW - 2, x1); y0 = Math.max(1, y0); y1 = Math.min(OH - 2, y1);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const k = y * OW + x; if (OC[k]) continue;
        const l = OC[k - 1], r = OC[k + 1], u = OC[k - OW], d = OC[k + OW];
        if (l && r) { OC[k] = 2; OZ[k] = Math.max(OZ[k - 1], OZ[k + 1]); }
        else if (u && d) { OC[k] = 2; OZ[k] = Math.max(OZ[k - OW], OZ[k + OW]); }
      }
    }
  };
  /* an exact convex occluder (planes [nx, ny, nz, d], inside = n.p <= d): every tile whose centre ray enters it
     gets the entry depth, marked 4 (the own ship's points test against these too) */
  DW.occHouse = function (planes, corners) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) { if (!P3v(c)) { x0 = 0; y0 = 0; x1 = PW - 1; y1 = PH - 1; break; } x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const tx0 = Math.max(0, Math.floor(x0 / OT)), tx1 = Math.min(OW - 1, Math.floor(x1 / OT)), ty0 = Math.max(0, Math.floor(y0 / OT)), ty1 = Math.min(OH - 1, Math.floor(y1 / OT));
    if (tx1 < tx0 || ty1 < ty0) return;
    occOn = true;
    const np = planes.length, PN = planes;
    const ne = new Float64Array(np), nf = new Float64Array(np), nr = new Float64Array(np), nu = new Float64Array(np);
    for (let i = 0; i < np; i++) { const p = PN[i]; ne[i] = p[3] - (p[0] * E0 + p[1] * E1 + p[2] * E2); nf[i] = p[0] * F0 + p[1] * F1 + p[2] * F2; nr[i] = p[0] * R0 + p[1] * R1 + p[2] * R2; nu[i] = p[0] * U0 + p[1] * U1 + p[2] * U2; }
    // 8 px blocks (2 x 2 tiles), each tested once at its centre
    for (let ty = ty0 & ~1; ty <= ty1; ty += 2) {
      const b = ((ty + 1) * OT - CY) / FL;
      for (let tx = tx0 & ~1; tx <= tx1; tx += 2) {
        const a = ((tx + 1) * OT - CX) / FL;
        // ray e + t (f + a r - b u): t is the view depth
        let tin = 0, tout = 1e9;
        for (let i = 0; i < np; i++) {
          const den = nf[i] + a * nr[i] - b * nu[i], num = ne[i];
          if (den < -1e-9) { const t = num / den; if (t > tin) tin = t; }
          else if (den > 1e-9) { const t = num / den; if (t < tout) tout = t; }
          else if (num < 0) { tin = 1e9; break; }
          if (tin >= tout) break;
        }
        if (tin >= tout || tout <= NEAR) continue;
        for (let v = 0; v < 2; v++) for (let w = 0; w < 2; w++) { const yy = ty + v, xx = tx + w; if (yy >= OH || xx >= OW) continue; const k = yy * OW + xx; if (tin < OZ[k]) OZ[k] = tin; OC[k] = 4; }
      }
    }
  };
  /* mark a tile as covered (surfaces drawn outside drawPtsOcc, e.g. the array face) */
  DW.occMark = (x, y, z) => { if (x < 0 || y < 0 || x >= PW || y >= PH) return; occOn = true; const k = ((y | 0) >> 2) * OW + ((x | 0) >> 2); if (z < OZ[k]) OZ[k] = z; OC[k] = 1; };
  /* put, unless hidden behind the own ship */
  const putO = (x, y, s, r, g, b, a) => { if (!occ(x, y, q.z)) put(x, y, s, r, g, b, a); };
  Object.assign(DW, { put, putO, occ, P3, P3v, dset, dline3, sline3, glow, add, drawPts, drawPtsOcc, LM });
  Object.defineProperty(DW, 'eye', { get: () => [E0, E1, E2] });

  /* ---------- the sea lattice (km internally, radar at the origin) ---------- */
  const RMAX = PE.RMAX = 36, RMIN = .2, WIND = 206 * DEG, RHOR = 15, ALPHA = 8.2;
  const r0 = rng(4411);
  /* mean clutter after the receiver's sensitivity-time control: the near sea is held down to a gentle slope
     (it would otherwise saturate), then the R^-7 fall past the horizon */
  function clutMean(r, az) {
    const g = r < RHOR ? Math.pow(RHOR / Math.max(r, 2.2), 2.2) : Math.pow(RHOR / r, 7);
    return 3.4 * g * (.3 + .7 * Math.pow(.5 + .5 * Math.cos(az - WIND), 2));
  }
  const DAZ = 1 * DEG, NAZ = 360;
  const rstep = r => .075 + r * .022;
  const L = { x: [], z: [], a: [], r: [], c: [], k: [], o: [], p: [], rs: [] }, BIN = [];
  for (let k = 0; k < NAZ; k++) {
    const azc = (k + .5) * DAZ, i0 = L.x.length;
    for (let r = RMIN; r < RMAX; r += rstep(r)) {
      const az = azc + (r0() - .5) * DAZ * .7, rr = r + (r0() - .5) * rstep(r) * .6;
      const x = Math.sin(az) * rr, z = Math.cos(az) * rr;
      const u = x * Math.sin(WIND) + z * Math.cos(WIND), v = x * Math.cos(WIND) - z * Math.sin(WIND);
      const tex = Math.exp(1.4 * fbm(u * .14, v * .7, 3.7, 3) - .25);
      const c = clutMean(rr, az) * tex;
      L.x.push(x * 1000); L.z.push(z * 1000); L.a.push(az); L.r.push(rr); L.c.push(c); L.rs.push(rstep(rr));
      L.k.push(TAU * u / 2.2); L.o.push(Math.floor(r0() * 3)); L.p.push(.00009 * Math.min(1, c / 20));
    }
    BIN.push([i0, L.x.length]);
  }
  const NL = L.x.length;
  const LX = new Float64Array(L.x), LZ = new Float64Array(L.z), LA = new Float32Array(L.a), LR = new Float32Array(L.r), LC = new Float32Array(L.c), LRS = new Float32Array(L.rs);
  const LK = new Float32Array(L.k), LO = new Int8Array(L.o), LP = new Float32Array(L.p);
  const LS = new Int32Array(NL).fill(-999999), LB = new Float32Array(NL), LY = new Float32Array(NL), LD = new Uint8Array(NL);
  const NS = PE.NS;
  /* one cell's return in paint s (s taken mod NS so the pattern repeats with the film) */
  function paintCell(i, s) {
    const sm = ((s % NS) + NS) % NS;
    const c = LC[i] * (1 + .45 * Math.sin(LK[i] + sm * TAU * 5 / NS));
    const spike = hsh(i, (Math.floor((sm + LO[i]) / 3) % 22) * 7 + 3) < LP[i] ? 14 : 1;
    const P = -Math.log(hsh(i, sm * 2 + 1)) + c * spike * -Math.log(hsh(i, sm * 2 + 2));
    const det = P / (1 + c) > ALPHA;
    LS[i] = s; LB[i] = E.clamp((4.343 * Math.log(P) + 9) / 40, .08, 1); LY[i] = Math.max(0, 4.343 * Math.log(P) - 2) + (det ? 12 : 0); LD[i] = det ? 1 : 0;
  }
  /* lattice neighbours for the near-field surface: next cell out in range, nearest cell in the next bin (360°: wraps) */
  const NRi = new Int32Array(NL).fill(-1), NAi = new Int32Array(NL).fill(-1);
  for (let k = 0; k < NAZ; k++) {
    const [i0, i1] = BIN[k], nb = BIN[(k + 1) % NAZ];
    for (let i = i0; i < i1; i++) {
      if (i + 1 < i1 && LR[i + 1] - LR[i] < LRS[i] * 1.8) NRi[i] = i + 1;
      let lo = nb[0], hi = nb[1] - 1; if (hi < lo) continue;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LR[m] < LR[i]) lo = m; else hi = m; }
      const j = Math.abs(LR[lo] - LR[i]) < Math.abs(LR[hi] - LR[i]) ? lo : hi;
      if (Math.abs(LR[j] - LR[i]) < LRS[i] * .8) NAi[i] = j;
    }
  }
  const CYa = new Float32Array(NL), CBa = new Float32Array(NL), CKa = new Float32Array(NL), CPX = new Float32Array(NL), SXa = new Float32Array(NL), SYa = new Float32Array(NL);
  /* lookups for the hot loops: the paint's decay by seconds since the paint, and sub-cell jitter */
  const NLUT = 512, GLW = new Float32Array(NLUT + 1), RISE = new Float32Array(NLUT + 1), LIM = new Float32Array(NLUT + 1);
  for (let k = 0; k <= NLUT; k++) { const d = k / NLUT * PE.PS; GLW[k] = Math.exp(-d * 1.05); RISE[k] = d < .3 ? 1 - Math.exp(-d * 22) : 1; LIM[k] = d < .4 ? Math.exp(-d * 10) : 0; }
  const JU = new Float32Array(64 * 64), JV = new Float32Array(64 * 64), JB = new Float32Array(64 * 64);
  for (let a = 0; a < 64; a++) for (let qd = 0; qd < 64; qd++) { JU[a * 64 + qd] = (hsh(a, qd) - .5) * .8; JV[a * 64 + qd] = (hsh(a + 5171, qd) - .5) * .8; JB[a * 64 + qd] = .95 + .55 * hsh(qd, a + 99); }

  /* ---------- rings, ticks, own heading (a dot every ~60 m, so they read as lines from any height) ---------- */
  const MAP = [];
  for (const rr of [10, 20, 30]) for (let a = 0; a < TAU; a += .06 / rr) MAP.push(Math.sin(a) * rr * 1000, Math.cos(a) * rr * 1000, 1);
  for (let a = 0; a < TAU; a += .05 / RMAX) MAP.push(Math.sin(a) * RMAX * 1000, Math.cos(a) * RMAX * 1000, 2);
  for (let a = 0; a < 360; a += 10) for (let d = .06; d < (a % 30 ? 1.1 : 2.2); d += .06) MAP.push(Math.sin(a * DEG) * (RMAX + d) * 1000, Math.cos(a * DEG) * (RMAX + d) * 1000, 3);
  for (let rr = 2; rr < 10; rr += 2) for (let a = 0; a < TAU; a += .045 / rr) MAP.push(Math.sin(a) * rr * 1000, Math.cos(a) * rr * 1000, 5);
  for (let d = .3; d < RMAX; d += .05 + d * .004) MAP.push(0, d * 1000, 4);                  // own heading
  const MP = new Float64Array(MAP), NMP = MP.length / 3;
  PE.RINGS = [10, 20, 30];

  /* ---------- the group's returns: a cluster of dots over the hull each paint ---------- */
  const retCache = new Map();
  function shipRet(g, gi, s) {
    const key = gi * 1000 + (((s % NS) + NS) % NS);
    let r = retCache.get(key); if (r) return r;
    const rr = rng(911 * (gi + 1) + key * 17), n = Math.round(10 + g.rcs * .5), out = [];
    for (let k = 0; k < n; k++) {
      const al = (rr() - .5) * g.L, cr = (rr() - .5) * g.B * 1.4, P = Math.pow(10, g.rcs / 10 * (.55 + .45 * rr())) * -Math.log(rr() + 1e-9);
      out.push(cr, al, Math.max(3, 4.343 * Math.log(P + 1) - 6), .45 + .55 * rr());
    }
    r = new Float32Array(out); retCache.set(key, r);
    return r;
  }

  /* ---------- render ----------
     o: { a: scope alpha, hk: display metres per dB, map, beam, sea (clutter alpha), tracks, raid, air, shots,
          near: skip cells closer than this to the eye, tagA, tagOnly, raidTags, persist } */
  const HIST = [], TP = [0, 0, 0], SP = [0, 0, 0];
  PE.scope = function (pb, cam, T, o) {
    cam = cam || DW.cam;
    const tags = [];
    const a0 = o.a;
    const arm = PE.arm(T), k4 = 4 / TAU, PS = PE.PS;
    const near = o.near || 1;
    const LR0 = LIME[0] - WH[0], LG0 = LIME[1] - WH[1], LB0 = LIME[2] - WH[2];
    if (a0 > .003 && o.sea > .003) {
      const hk = o.hk, sa = o.sea * a0, far2 = o.big || 30000;
      // pass 1: every cell's paint, height, brightness, lime and screen position
      for (let i = 0; i < NL; i++) {
        const qq = (arm - LA[i]) * k4, s = Math.floor(qq), li = ((qq - s) * NLUT) | 0;
        if (LS[i] !== s) paintCell(i, s);
        const glw = GLW[li], rise = RISE[li];
        const nb = LR[i] < .45 ? E.ss(.2, .45, LR[i]) : 1;
        const y = LY[i] * hk * rise * (.45 + .55 * glw) * nb;
        let b = LB[i] * (.4 + .9 * glw) * nb;
        const kk = LIM[li];
        if (kk) b = Math.max(b, kk * .72);
        if (LD[i]) b = Math.max(b, .5 + .5 * glw);
        CYa[i] = y; CBa[i] = b; CKa[i] = kk; CPX[i] = -1;
        const x = LX[i], z = LZ[i], dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
        if (zc < near) continue;
        SXa[i] = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc; SYa[i] = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc; CPX[i] = zc;
      }
      // pass 2: far cells as single dots, near cells as a continuous surface, bilinear between neighbours,
      // subdivided by the quad's projected size
      for (let i = 0; i < NL; i++) {
        const zc = CPX[i]; if (zc < 0) continue;
        const sx = SXa[i], sy = SYa[i], k = CKa[i], b = CBa[i];
        let m = 1;
        const i1 = NRi[i], i2 = NAi[i];
        if (i1 >= 0 && i2 >= 0 && CPX[i1] > 0 && CPX[i2] > 0 && sx > -300 && sx < 2220 && sy > -300 && sy < 1380) {
          const ax = SXa[i1] - sx, ay = SYa[i1] - sy, bx2 = SXa[i2] - sx, by2 = SYa[i2] - sy, area = Math.abs(ax * by2 - ay * bx2);
          m = Math.min(7, Math.round(Math.sqrt(area) / 7));
        }
        if (m >= 2) {
          const i3 = NRi[i2] >= 0 && CPX[NRi[i2]] > 0 ? NRi[i2] : i2;
          const x0 = LX[i], z0 = LZ[i], x1 = LX[i1], z1 = LZ[i1], x2 = LX[i2], z2 = LZ[i2], x3 = LX[i3], z3 = LZ[i3];
          const y0 = CYa[i], y1 = CYa[i1], y2 = CYa[i2], y3 = CYa[i3], b1 = CBa[i1], b2 = CBa[i2], b3 = CBa[i3], k1 = CKa[i1], k2 = CKa[i2], k3 = CKa[i3];
          for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) {
            const qd = a * m + c, jk = (i & 63) * 64 + qd, u = (a + .5 + JU[jk]) / m, v = (c + .5 + JV[jk]) / m;
            const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = (1 - u) * v, w3 = u * v;
            const X_ = x0 * w0 + x1 * w1 + x2 * w2 + x3 * w3, Z_ = z0 * w0 + z1 * w1 + z2 * w2 + z3 * w3, Y_ = y0 * w0 + y1 * w1 + y2 * w2 + y3 * w3;
            const dx = X_ - E0, dy = Y_ - E1, dz = Z_ - E2, z2c = dx * F0 + dy * F1 + dz * F2;
            if (z2c < near) continue;
            const px = CX + FL * (dx * R0 + dy * R1 + dz * R2) / z2c, py = CY - FL * (dx * U0 + dy * U1 + dz * U2) / z2c;
            if (px < 0 || py < 0 || px >= PW || py >= PH) continue;
            if (occOn && occ(px, py, z2c)) continue;
            const kq = k * w0 + k1 * w1 + k2 * w2 + k3 * w3, bb = (b * w0 + b1 * w1 + b2 * w2 + b3 * w3) * JB[jk] * sa;
            put(px, py, z2c < 1800 ? 2 : 1, WH[0] + LR0 * kq, WH[1] + LG0 * kq, WH[2] + LB0 * kq, bb > 1 ? 1 : bb);
          }
          if (!LD[i]) continue;
        }
        if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
        if (occOn && occ(sx, sy, zc)) continue;
        const cr = WH[0] + LR0 * k, cg = WH[1] + LG0 * k, cb = WH[2] + LB0 * k;
        if (LD[i]) {
          // over the detection threshold: a stalk from the sea surface
          const dx = LX[i] - E0, dz = LZ[i] - E2, zb = dx * F0 - E1 * F1 + dz * F2;
          if (zb > near) BUF.dline(CX + FL * (dx * R0 - E1 * R1 + dz * R2) / zb, CY - FL * (dx * U0 - E1 * U1 + dz * U2) / zb, sx, sy, 2.5, 1, cr, cg, cb, b * .5 * sa);
          put(sx, sy, 2, cr, cg, cb, Math.min(1, b * 1.1 * sa));
          continue;
        }
        put(sx, sy, zc < far2 ? 2 : 1, cr, cg, cb, Math.min(1, b * sa));
      }
    }
    // rings, ticks, heading line
    const ma = o.map * a0;
    if (ma > .01) for (let i = 0; i < NMP; i++) {
      const kind = MP[i * 3 + 2];
      if (kind === 5 && o.fine < .02) continue;
      if (!P3(MP[i * 3], 2, MP[i * 3 + 1])) continue;
      if (occOn && occ(q.x, q.y, q.z)) continue;
      const al = kind === 2 ? .5 : kind === 3 ? .42 : kind === 4 ? .3 : kind === 5 ? .26 * o.fine : .4;
      put(q.x, q.y, q.z < 2500 ? 2 : 1, WH[0], WH[1], WH[2], al * ma);
    }
    // the group's returns (pillars), painted by the beams
    const ga = o.ships * a0;
    if (ga > .01) PE.GROUP.forEach((g, gi) => {
      const p = g.at(T), az = Math.atan2(p[0], p[2]);
      const qq = (arm - az) * k4, s = Math.floor(qq), d = (qq - s) * PS;
      const r = shipRet(g, gi, s), glw = Math.exp(-d * 1.05), rise = d < .3 ? 1 - Math.exp(-d * 22) : 1, kk = d < .4 ? Math.exp(-d * 10) : 0;
      const ch = Math.cos(g.hdg), sh = Math.sin(g.hdg);
      for (let j = 0; j < r.length; j += 4) {
        const lx = r[j], lz = r[j + 1], y = r[j + 2] * o.hk * rise * (.45 + .55 * glw);
        const x = p[0] + ch * lx + sh * lz, z = p[2] - sh * lx + ch * lz;
        if (!P3(x, y, z)) continue;
        const b = Math.min(1, r[j + 3] * (.5 + .6 * glw) + kk * .5);
        putO(q.x, q.y, 2, WH[0] + (LIME[0] - WH[0]) * kk, WH[1] + (LIME[1] - WH[1]) * kk, WH[2] + (LIME[2] - WH[2]) * kk, b * ga);
      }
    });
    // the four face beams: a lime edge on the sea and a thin sheet of light above it
    const ba = o.beam * a0;
    if (ba > .01) for (let f = 0; f < 4; f++) {
      const ph = arm + f * TAU / 4, bx = Math.sin(ph), bz = Math.cos(ph);
      for (let r = 250; r < RMAX * 1000;) {
        const x = bx * r, z = bz * r, dx = x - E0, dy = 2 - E1, dz = z - E2, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const step = Math.max(10, Math.min(260, dist * .011 + r * .004));
        const fa = ba * (1 - .45 * r / (RMAX * 1000)) * (.25 + .75 * E.ss(120, 1400, dist));
        if (P3(x, 2, z) && !occ(q.x, q.y, q.z)) { put(q.x, q.y, 2, LIME[0], LIME[1], LIME[2], fa); add(q.x, q.y, 7, LIME[0], LIME[1], LIME[2], .016 * fa); }
        if (r > 1200) {
          const H = 120 * Math.pow(r / 10000, .6) * 5 * (o.beamTop || 1), nh = Math.max(3, Math.min(34, Math.round(H / Math.max(20, dist * .01))));
          for (let j = 1; j <= nh; j++) {
            const fj = j / nh; if (hsh((r / 7) | 0, j + f * 97) > .58 - fj * .38) continue;
            if (P3(x, fj * H, z)) putO(q.x, q.y, 1, LIME[0], LIME[1], LIME[2], ba * .5 * (1 - fj * .85) * (1 - .5 * r / (RMAX * 1000)));
          }
        }
        r += step;
      }
    }

    /* ----- tracks ----- */
    const ta = o.tracks * a0;
    if (ta > .01) {
      // surface: a dotted ring round the return, lime for the group, white for the rest
      PE.GROUP.forEach((g, gi) => {
        const p = g.at(T), col = g.own ? LIME : WH;
        const cp = cam.project([p[0], 0, p[2]]); if (!cp) return;
        const rad = Math.max(g.L * .75, cp[2] * .012), n = Math.round(E.clamp(TAU * rad * FL / cp[2] / 5, 16, 90));
        let tx = -1e9, ty = 0;
        for (let k = 0; k < n; k++) {
          const th = k / n * TAU;
          if (P3(p[0] + Math.sin(th) * rad, 20, p[2] + Math.cos(th) * rad)) { putO(q.x, q.y, 2, col[0], col[1], col[2], ta * .9); if (q.x - q.y * .3 > tx) { tx = q.x - q.y * .3; ty = q.y; SP[0] = q.x; SP[1] = q.y; } }
        }
        if (tx > -1e8 && o.tagA > .01 && (!o.tagOnly || o.tagOnly.includes(g.key))) tags.push({ key: 'g_' + g.key, id: 'TRK ' + g.id, txt: g.label, cls: g.own ? 'lime' : 'sm', ax: SP[0], ay: SP[1], x: SP[0] + 16, y: SP[1] - 30, a: ta * o.tagA, pri: g.own ? 3 : 1, dist: cp[2] });
      });
      // air: the aircraft at altitude, a dotted stalk to the sea, a short trail of paints
      const aa = o.air * ta;
      if (aa > .01) PE.AIR.forEach((ac, ai) => {
        if (ac.key === 'helo' && o.heloTrack === 0) return;
        const p = ac.at(T), col = LIME;
        if (!P3v(p)) return;
        const hx = q.x, hy = q.y, hz = q.z;
        put(hx, hy, 3, col[0], col[1], col[2], aa);
        sline3([p[0], p[1], p[2]], [p[0], 0, p[2]], 4, 1, col, aa * .55);
        // cross on the sea under it
        for (let k = -3; k <= 3; k++) { if (P3(p[0] + k * hz * .0018, 0, p[2])) put(q.x, q.y, 1, col[0], col[1], col[2], aa * .6); if (P3(p[0], 0, p[2] + k * hz * .0018)) put(q.x, q.y, 1, col[0], col[1], col[2], aa * .6); }
        for (let k = 1; k <= 7; k++) { const tp = ac.at(T - k * PS); if (P3v(tp)) put(q.x, q.y, 2, col[0], col[1], col[2], aa * (.7 - k * .08)); }
        if (o.tagA > .01 && (!o.tagOnly || o.tagOnly.includes(ac.key))) tags.push({ key: 'a_' + ac.key, id: 'TRK ' + ac.id, txt: ac.label, v: `${Math.round(p[1] * 3.281 / 100) * 100 / 1000}k ft`, cls: 'lime', ax: hx, ay: hy, x: hx + 14, y: hy - 30, a: aa * o.tagA, pri: 2, dist: hz });
      });
      // the raid
      const ra = o.raid * ta;
      if (ra > .01) for (let k = 0; k < PE.RAID.length; k++) drawRaidTrack(k, T, ra, o, tags);
    }
    // interceptors: plain lime lines from the cell to the missile, persisting as the picture of the fight
    const sa2 = o.shots * a0;
    if (sa2 > .01) for (const s of PE.SHOTS) {
      if (T < s.tL) continue;
      const fade = o.keep === undefined ? 1 : o.keep;
      if (fade <= .01) continue;
      const sl = Math.min(PE.shotSl(s, T), PE.shotSl(s, s.tEnd));
      const al = sa2 * fade;
      // dotted at a constant screen spacing: walk the arc in chunks
      let prevOk = false, px = 0, py = 0;
      const nSeg = 180;
      for (let k = 0; k <= nSeg; k++) {
        const l = sl * k / nSeg; PE.shotPath(s, l, TP);
        if (!P3v(TP)) { prevOk = false; continue; }
        const zz = q.z, big = zz < 9000 ? 2 : 1;
        if (prevOk) {
          // samples closer than a dot step on screen are skipped (not dropped): the step is measured from the last dot laid
          const L2 = Math.hypot(q.x - px, q.y - py); if (L2 < 3 && k < nSeg) continue;
          const n = Math.min(400, Math.max(1, Math.floor(L2 / 3)));
          for (let m = 1; m <= n; m++) { const u = m / n, x = px + (q.x - px) * u, y = py + (q.y - py) * u; if (!occ(x, y, zz)) put(x, y, big, LIME[0], LIME[1], LIME[2], al * (.55 + .45 * k / nSeg)); }
        }
        px = q.x; py = q.y; prevOk = true;
      }
      if (T <= s.tEnd && P3v(PE.shotAt(s, T, TP))) { put(q.x, q.y, 3, LIME[0], LIME[1], LIME[2], sa2); add(q.x, q.y, 9, LIME[0], LIME[1], LIME[2], .08 * sa2); }
    }
    return { tags };
  };

  /* ---------- a raid track: coral uncertainty cloud condensing look by look, then a track with a trail ---------- */
  const NCL = 420;
  function drawRaidTrack(k, T, a, o, tags) {
    const qd = PE.RAID[k], cam = DW.cam;
    const tr = PE.track(k, T);
    // the trail of estimates stays behind as the picture of the fight, until the film lets it go (o.keep)
    const keep = o.keep === undefined ? 1 : o.keep;
    if (T >= qd.tDet && keep > .01) {
      PE.trackHist(k, Math.min(T, qd.tStop), HIST);
      const fade = keep;
      let prev = null;
      for (let n = 0; n < HIST.length; n++) {
        const h = HIST[n], al = a * fade * (.3 + .55 * n / Math.max(1, HIST.length)) * E.sat((qd.looks.length > 3 ? 1 : .5));
        if (!P3(h[0], 20, h[2])) { prev = null; continue; }
        const x = q.x, y = q.y;
        put(x, y, 3, CORAL[0], CORAL[1], CORAL[2], al);
        if (prev) BUF.dline(prev[0], prev[1], x, y, 3, q.z < 9000 ? 2 : 1, CORAL[0], CORAL[1], CORAL[2], al * .6);
        prev = [x, y];
      }
    }
    if (!tr) return;
    const endA = tr.stopped ? 1 - E.sat((T - qd.tStop) / 1.2) : 1;
    const born = E.sat(tr.age / .5);
    const al = a * born * endA;
    const L = qd.los, C = qd.crs;
    // the uncertainty cloud: points redrawn each look from the current sigma, eased from the last draw
    const n = tr.n, u = E.outCubic(E.sat(tr.since / .42));
    const sgA = PE.sigOf(n, tr.range), sgB = PE.sigOf(Math.max(0, n - 1), tr.range);
    const cloudA = al * E.sat((sgA[1] - 14) / 60 + .15) * (tr.stopped ? 0 : 1);
    if (cloudA > .01) {
      const base = qd.id * 7919;
      for (let i = 0; i < NCL; i++) {
        const kA = n * 64 + 5, kB = (n - 1) * 64 + 5;
        const ga = gH(base + i, kA), gc = gH(base + i, kA + 2), gh = gH(base + i, kA + 4);
        const gb = n > 0 ? gH(base + i, kB) : ga * 2.2, gcb = n > 0 ? gH(base + i, kB + 2) : gc * 2.2, ghb = n > 0 ? gH(base + i, kB + 4) : gh * 2.2;
        const ar = gb * sgB[0] + (ga * sgA[0] - gb * sgB[0]) * u, ac = gcb * sgB[1] + (gc * sgA[1] - gcb * sgB[1]) * u, ah = Math.abs(ghb * sgB[2] + (gh * sgA[2] - ghb * sgB[2]) * u);
        if (!P3(tr.p[0] + L[0] * ar + C[0] * ac, 12 + ah, tr.p[2] + L[2] * ar + C[2] * ac)) continue;
        const fl = tr.since < .5 ? Math.exp(-tr.since * 6) : 0;
        putO(q.x, q.y, 1 + (i & 1), CORAL[0], CORAL[1] + (255 - CORAL[1]) * fl * .4, CORAL[2] + (200 - CORAL[2]) * fl * .3, cloudA * (.45 + .4 * hsh(i, n)) * (1 + fl * .6));
      }
      // 2-sigma ellipse on the sea, shrinking with the looks
      const sr = (sgB[0] + (sgA[0] - sgB[0]) * u) * 2, sc = (sgB[1] + (sgA[1] - sgB[1]) * u) * 2;
      const cp = cam.project([tr.p[0], 10, tr.p[2]]);
      if (cp) {
        const m = Math.round(E.clamp(TAU * sc * FL / cp[2] / 5, 24, 160));
        for (let j = 0; j < m; j++) { const th = j / m * TAU; if (P3(tr.p[0] + L[0] * Math.cos(th) * sr + C[0] * Math.sin(th) * sc, 10, tr.p[2] + L[2] * Math.cos(th) * sr + C[2] * Math.sin(th) * sc)) putO(q.x, q.y, 1, CORAL[0], CORAL[1], CORAL[2], cloudA * .8); }
      }
    }
    // the track: estimate, velocity leader (4 s), the tag
    if (!P3(tr.p[0], 20, tr.p[2])) return;
    const x = q.x, y = q.y, z = q.z;
    const conf = E.sat((n - 1.5) / 2);
    put(x, y, 3, CORAL[0], CORAL[1], CORAL[2], al * (.5 + .5 * conf));
    if (conf > .01 && !tr.stopped) {
      const v = PE.roundVel(k);
      sline3([tr.p[0], 20, tr.p[2]], [tr.p[0] + v[0] * 4, 20, tr.p[2] + v[2] * 4], 3, 1, CORAL, al * conf * .7);
    }
    // once stopped, the fight's own tag (pe_aegis_fx) takes over at the burst
    if (o.tagA > .01 && !tr.stopped && (!o.raidTags || o.raidTags.includes(qd.id))) {
      const txt = n < 2 ? 'Unknown' : 'Vampire';
      const v = `${(tr.range / 1000).toFixed(1)} km`;
      tags.push({ key: 'r_' + qd.id, id: 'TRK ' + qd.id, txt, v, cls: n < 2 ? 'sm' : 'coral', ax: x, ay: y, x: x + 16, y: y - 32, a: al * o.tagA, pri: 5 + (qd.id === 45 ? 2 : 0), dist: z, leadCol: 'rgba(255,106,61,.75)' });
    }
  }
  PE.scopeInfo = { NL, NMP };
})();
