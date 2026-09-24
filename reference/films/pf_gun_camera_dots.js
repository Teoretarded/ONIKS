/* GUN CAMERA: the dot world. A max-blend dot raster (pb_survey's packed put), the sky and the sea in two
   forms: a banded world lattice (pd_engagement) for the wide lenses, and an angular lattice about the forward
   mount for the gun camera's long lens, where a world lattice would be kilometres of empty water between dots.
   The destroyer is one baked multi-level cloud (pc_anatomy's cells: each cell picks its own detail), the
   two Phalanx mounts are clouds of their own (train, elevating mass, the spinning barrel cluster), the rounds
   are sampled HD.oniks with a coral silhouette. Effect stages draw through the same helpers (PF.DW). */
(function () {
  const { V, R, X, E, rng } = M3;
  const PF = window.PF, DEG = PF.DEG, TAU = PF.TAU, hsh = PF.hsh, LIME = PF.LIME, WH = PF.WH, CORAL = PF.CORAL, W = PF.W;
  const DW = PF.DW = {};
  const ss = E.ss;

  /* ---------- raster: the current camera + buffer ---------- */
  let E0 = 0, E1 = 0, E2 = 0, F0 = 0, F1 = 0, F2 = 1, R0 = 1, R1 = 0, R2 = 0, U0 = 0, U1 = 1, U2 = 0, FL = 1000, CX = 960, CY = 540, NEAR = .1;
  let PU = null, PW = 1920, PH = 1080, BUF = null, BD = null, CAM = null;
  const q = DW.q = { x: 0, y: 0, z: 0 };
  const U32 = new Map();
  const u32of = b => { let u = U32.get(b); if (!u) { u = new Uint32Array(b.img.data.buffer); U32.set(b, u); } return u; };
  DW.sync = function (c, buf) {
    PU = u32of(buf); PW = buf.W; PH = buf.H; BUF = buf; BD = buf.d; CAM = c;
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
  function dset(x, y, s, c, a) {
    const d = BD; const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * PW + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  }
  function dline3(a, b, step, s, c, al) {
    const n = Math.max(1, Math.ceil(V.dist(a, b) / step));
    for (let k = 0; k <= n; k++) { const t = k / n; if (P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) put(q.x, q.y, s, c[0], c[1], c[2], al); }
  }
  /* soft additive disc, (1 - d²/R²)² falloff (glows, flashes) */
  function glow(x, y, Rr, r, g, b, a) {
    if (a <= .002) return;
    const d = BD, W_ = PW, x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W_ - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(PH - 1, Math.ceil(y + Rr)), iR2 = 1 / (Rr * Rr);
    for (let j = y0; j <= y1; j++) { const dy = j - y; for (let i = x0; i <= x1; i++) { const dx = i - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue; const w = u * u * a, k = (j * W_ + i) * 4; d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w; } }
  }
  Object.assign(DW, { put, P3, add, dset, dline3, glow });
  DW.cam = () => CAM;

  /* ---------- multi-level clouds (pc_anatomy) ----------
     stride-6 points (xyz, normal) bucketed on one grid of cells; each visible cell draws the coarsest level whose
     spacing lands within LODPX on screen, so near metal is fine and far metal coarse */
  function lodCloud(levels, cs) {
    cs = cs || 1.1;
    const nl = levels.length, cells = new Map();
    levels.forEach((L, li) => {
      const P = L.pts, n = P.length / 6;
      for (let i = 0; i < n; i++) {
        const k = (Math.floor(P[i * 6] / cs) + 512) * 1048576 + (Math.floor(P[i * 6 + 1] / cs) + 512) * 1024 + (Math.floor(P[i * 6 + 2] / cs) + 512);
        let c = cells.get(k); if (!c) { c = levels.map(() => []); cells.set(k, c); } c[li].push(i);
      }
    });
    const lv = levels.map(L => new Float32Array(L.pts.length)), SD = 4 + 2 * nl, CH = new Float32Array(cells.size * SD), o = new Array(nl).fill(0);
    let c = 0;
    for (const cell of cells.values()) {
      let mx = 0, my = 0, mz = 0, m = 0;
      cell.forEach((idx, li) => { const P = levels[li].pts; for (const i of idx) { mx += P[i * 6]; my += P[i * 6 + 1]; mz += P[i * 6 + 2]; m++; } });
      mx /= m; my /= m; mz /= m;
      let rr = 0;
      cell.forEach((idx, li) => {
        const P = levels[li].pts, Dd = lv[li], i0 = o[li];
        for (const i of idx) { for (let qq = 0; qq < 6; qq++) Dd[o[li] * 6 + qq] = P[i * 6 + qq]; rr = Math.max(rr, Math.hypot(P[i * 6] - mx, P[i * 6 + 1] - my, P[i * 6 + 2] - mz)); o[li]++; }
        CH[c * SD + 4 + li * 2] = i0; CH[c * SD + 5 + li * 2] = o[li];
      });
      CH[c * SD] = mx; CH[c * SD + 1] = my; CH[c * SD + 2] = mz; CH[c * SD + 3] = rr + .01;
      c++;
    }
    let n = 0; for (const L of levels) n += L.pts.length / 6;
    return { lv, sp: levels.map(L => L.sp), ch: CH, nch: c, sd: SD, nl, n };
  }
  DW.lodCloud = lodCloud;

  /* camera-space transform of a cloud: pc = A p + b; light and eye in the cloud's own frame; frustum planes */
  const LK = V.norm([.46, .6, .66]);              // low sun ahead on the starboard bow: the gun looks into its glare, the mount's face is lit
  DW.LK = LK;
  const XF = new Float64Array(26);
  function prep(T) {
    const M = T.R, t = T.T, x = XF;
    const tx = t[0] - E0, ty = t[1] - E1, tz = t[2] - E2;
    for (let c = 0; c < 3; c++) { x[c] = R0 * M[c] + R1 * M[3 + c] + R2 * M[6 + c]; x[3 + c] = U0 * M[c] + U1 * M[3 + c] + U2 * M[6 + c]; x[6 + c] = F0 * M[c] + F1 * M[3 + c] + F2 * M[6 + c]; }
    x[9] = R0 * tx + R1 * ty + R2 * tz; x[10] = U0 * tx + U1 * ty + U2 * tz; x[11] = F0 * tx + F1 * ty + F2 * tz;
    for (let c = 0; c < 3; c++) { x[12 + c] = M[c] * LK[0] + M[3 + c] * LK[1] + M[6 + c] * LK[2]; x[15 + c] = -(M[c] * tx + M[3 + c] * ty + M[6 + c] * tz); }
    const xr = (PW - CX) / FL, xl = CX / FL, yt = CY / FL, yb = (PH - CY) / FL;
    x[18] = xr; x[19] = 1 / Math.sqrt(1 + xr * xr); x[20] = xl; x[21] = 1 / Math.sqrt(1 + xl * xl); x[22] = yt; x[23] = 1 / Math.sqrt(1 + yt * yt); x[24] = yb; x[25] = 1 / Math.sqrt(1 + yb * yb);
    return x;
  }
  function sphereIn(x, cx_, cy_, cz_, rad) {
    const zc = x[6] * cx_ + x[7] * cy_ + x[8] * cz_ + x[11];
    if (zc < NEAR - rad) return false;
    const xc = x[0] * cx_ + x[1] * cy_ + x[2] * cz_ + x[9], yc = x[3] * cx_ + x[4] * cy_ + x[5] * cz_ + x[10];
    if ((xc - x[18] * zc) * x[19] > rad) return false;
    if ((-xc - x[20] * zc) * x[21] > rad) return false;
    if ((yc - x[22] * zc) * x[23] > rad) return false;
    if ((-yc - x[24] * zc) * x[25] > rad) return false;
    return true;
  }
  /* screen bounds of what a cloud actually drew (for boxes on true bounds) */
  const BB = DW.bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, n: 0 };
  DW.bbReset = () => { BB.x0 = 1e9; BB.y0 = 1e9; BB.x1 = -1e9; BB.y1 = -1e9; BB.n = 0; };
  let TRACKBB = false;
  /* the per-point pass: project, light (sun + facing + rim), depth fade, dot. a: alpha, tint: [r,g,b] or null, tk: tint strength */
  function runPts(pts, i0, i1, spm, x, a, fadeD, tint, tk, foc) {
    const F = FL, cx = CX, cy = CY, near = NEAR, Wd = PW, Hd = PH, d = BD, invF = 1 / F;
    const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
    const l0 = x[12], l1 = x[13], l2 = x[14], el0 = x[15], el1 = x[16], el2 = x[17];
    const kf = .5 * a / fadeD, kfar = .5 * a;
    let cr = WH[0], cg = WH[1], cb = WH[2];
    if (tint) { cr += (tint[0] - cr) * tk; cg += (tint[1] - cg) * tk; cb += (tint[2] - cb) * tk; }
    const tb = TRACKBB, fc = foc !== null, f0 = fc ? foc[0] : 0, f1 = fc ? foc[1] : 0, f2 = fc ? foc[2] : 0, fr0 = fc ? foc[3] : 0, fk = fc ? foc[4] : 0, ffl = fc ? foc[5] : 1;
    for (let i = i0, j = i * 6; i < i1; i++, j += 6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const zc = a20 * px + a21 * py + a22 * pz + b2;
      if (zc < near) continue;
      let fo = 1;
      if (fc) { const ddx = px - f0, ddy = py - f1, ddz = pz - f2, dq = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) - fr0; if (dq > 0) { fo = 1 - dq * fk; if (fo < ffl) fo = ffl; } }
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b, iz;
      if (nx === 0 && ny === 0 && nz === 0) { b = .42; iz = F / zc; }
      else {
        const dn = nx * (px - el0) + ny * (py - el1) + nz * (pz - el2);
        if (dn > 0) { if (i % 3) continue; b = .08; iz = F / zc; }
        else {
          iz = F / zc;
          let fac = -dn * iz * invF; if (fac > 1) fac = 1;
          const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
          b = .07 + .72 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
        }
      }
      const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz, sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz;
      if (sx < 0 || sy < 0 || sx >= Wd || sy >= Hd) continue;
      b *= (zc < fadeD ? a - kf * zc : kfar) * fo;
      // metal right at the lens dissolves instead of smearing into huge dots
      if (zc < .9) b *= zc < .3 ? 0 : (zc - .3) / .6;
      if (b < .02) continue;
      if (b > 1) b = 1;
      if (tb) { if (sx < BB.x0) BB.x0 = sx; if (sx > BB.x1) BB.x1 = sx; if (sy < BB.y0) BB.y0 = sy; if (sy > BB.y1) BB.y1 = sy; BB.n++; }
      const pxs = spm * iz, R_ = cr * b, G_ = cg * b, B_ = cb * b;
      // big dots only where the focus is: the dimmed background stays a fine grain
      if (pxs <= 3.4 || fo < .55) {
        const qq = ((sy | 0) * Wd + (sx | 0)) << 2;
        if (d[qq] < R_) d[qq] = R_; if (d[qq + 1] < G_) d[qq + 1] = G_; if (d[qq + 2] < B_) d[qq + 2] = B_;
      } else {
        const s = pxs > 7 ? 3 : 2, x0 = (sx - s * .5 + .5) | 0, y0 = (sy - s * .5 + .5) | 0;
        if (x0 < 0 || y0 < 0 || x0 + s > Wd || y0 + s > Hd) continue;
        let k = (y0 * Wd + x0) << 2; const step = (Wd - s) << 2;
        for (let m = 0; m < s; m++, k += step) for (let n = 0; n < s; n++, k += 4) { if (d[k] < R_) d[k] = R_; if (d[k + 1] < G_) d[k + 1] = G_; if (d[k + 2] < B_) d[k + 2] = B_; }
      }
    }
  }
  const LODPX = 3.6;
  let NPTS = 0;
  /* o: {a, fade (m), tint, tk, lodpx, bb, focus: {p (world), r0, r1, floor}: dots dim with distance from p} */
  const FOC = new Float64Array(6);
  function drawLod(ml, T, o) {
    const x = prep(T), CH = ml.ch, SD = ml.sd, nl = ml.nl, F = FL, ex = x[15], ey = x[16], ez = x[17];
    const a = o && o.a !== undefined ? o.a : 1, fade = (o && o.fade) || 900, tint = (o && o.tint) || null, tk = (o && o.tk) || 0, PX = (o && o.lodpx) || LODPX;
    let foc = null;
    if (o && o.focus) {
      const M = T.R, d = [o.focus.p[0] - T.T[0], o.focus.p[1] - T.T[1], o.focus.p[2] - T.T[2]];
      FOC[0] = M[0] * d[0] + M[3] * d[1] + M[6] * d[2]; FOC[1] = M[1] * d[0] + M[4] * d[1] + M[7] * d[2]; FOC[2] = M[2] * d[0] + M[5] * d[1] + M[8] * d[2];
      FOC[3] = o.focus.r0; FOC[4] = 1 / (o.focus.r1 - o.focus.r0); FOC[5] = o.focus.floor; foc = FOC;
    }
    TRACKBB = !!(o && o.bb);
    for (let c = 0; c < ml.nch; c++) {
      const qq = c * SD, mx = CH[qq], my = CH[qq + 1], mz = CH[qq + 2], rad = CH[qq + 3];
      if (!sphereIn(x, mx, my, mz, rad)) continue;
      const dx = mx - ex, dy = my - ey, dz = mz - ez, dd = Math.max(.15, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
      // a cell the focus dims can be coarser
      let px = PX;
      if (foc) { const fx = mx - foc[0], fy = my - foc[1], fz = mz - foc[2], fq = Math.sqrt(fx * fx + fy * fy + fz * fz) - rad - foc[3]; if (fq > 0) px = PX / Math.max(foc[5], .45, 1 - fq * foc[4]); }
      // the coarsest level fine enough here; a level empty in this cell (fine levels cover only the near deck) falls back coarser
      let li = nl - 1; while (li > 0 && ml.sp[li] * F / dd > px) li--;
      while (li < nl - 1 && CH[qq + 5 + li * 2] <= CH[qq + 4 + li * 2]) li++;
      const i0 = CH[qq + 4 + li * 2], i1 = CH[qq + 5 + li * 2];
      if (i1 > i0) { runPts(ml.lv[li], i0, i1, ml.sp[li], x, a, fade, tint, tk, foc); NPTS += i1 - i0; }
    }
    TRACKBB = false;
  }
  DW.drawLod = drawLod;
  DW.npts = () => { const n = NPTS; NPTS = 0; return n; };

  /* ---------- the destroyer, baked ---------- */
  const DDM = HD.destroyer();
  const partOf = n => DDM.parts.find(p => p.name === n);
  const ST0 = { sps: 0, gunYaw: 0, gunPitch: 0, vlsOpen: [], ciwsYaw: [0, Math.PI], ciwsPitch: [0, 0], ciwsSpin: 0 };
  const boxHit = (b, B) => b[0][0] <= B[1][0] && b[1][0] >= B[0][0] && b[0][1] <= B[1][1] && b[1][1] >= B[0][1] && b[0][2] <= B[1][2] && b[1][2] >= B[0][2];
  const inBox = (x, y, z, B) => x >= B[0][0] && x < B[1][0] && y >= B[0][1] && y < B[1][1] && z >= B[0][2] && z < B[1][2];
  /* static parts at rest in ship coordinates; levels finer than .1 m only inside their box (around the forward mount) */
  const SHIP_SKIP = { sps: 1, ciwsF: 1, ciwsA: 1 };
  const BOX_F1 = [[-6.4, 6.4, 25.6], [6.4, 19.2, 41.6]], BOX_F2 = [[-12.8, 0, 12.8], [12.8, 28.8, 57.6]];
  function bakeLevel(sp, seed, box, fineOff) {
    const out = [];
    DDM.parts.forEach((part, pi) => {
      if (SHIP_SKIP[part.name]) return;
      let prims = GEO.primsOf(part, ST0);
      if (box && !part.xf) prims = prims.filter(pr => { try { return boxHit(GEO.bounds({ prims: [pr] }), box); } catch (e) { return true; } });
      if (!prims.length) return;
      const s = GEO.sample({ parts: [{ name: part.name, prims }] }, sp, seed + pi * 13, ST0, fineOff ? { fine: false } : undefined)[0];
      const Tf = part.xf ? part.xf(ST0) : null, P = s.pts;
      for (let i = 0; i < P.length; i += 6) {
        let x = P[i], y = P[i + 1], z = P[i + 2], nx = P[i + 3], ny = P[i + 4], nz = P[i + 5];
        if (Tf) { const p = X.ap(Tf, [x, y, z]), n = X.dir(Tf, [nx, ny, nz]); x = p[0]; y = p[1]; z = p[2]; nx = n[0]; ny = n[1]; nz = n[2]; }
        if (box && !inBox(x, y, z, box)) continue;
        out.push(x, y, z, nx, ny, nz);
      }
    });
    return { sp, pts: new Float32Array(out) };
  }
  const t0 = performance.now();
  const SHIP_ML = lodCloud([
    bakeLevel(.045, 101, BOX_F1), bakeLevel(.09, 102, BOX_F2), bakeLevel(.18, 103, null), bakeLevel(.36, 104, null, true), bakeLevel(.75, 105, null, true), bakeLevel(1.5, 106, null, true),
  ], 3.2);
  const spsPart = partOf('sps');
  const SPS_ML = lodCloud([.05, .12, .3].map((sp, k) => ({ sp, pts: GEO.sample({ parts: [{ name: 'sps', prims: GEO.primsOf(spsPart, {}) }] }, sp, 120 + k, {})[0].pts })), 2);
  DW.bakeMs = Math.round(performance.now() - t0);
  DW.SHIP_ML = SHIP_ML;

  /* ---------- the Phalanx mount: train base, elevating mass, barrel cluster ----------
     The model's ciws part at elevation 0 gives the base (shared prims) and the elevating mass in its own frame;
     points on the six barrels and their clamps (within .2 m of the bore axis, forward of the breech housing)
     turn with the cluster. */
  const cp = partOf('ciwsF');
  const pr0 = cp.dyn({ ciwsYaw: [0, 0], ciwsPitch: [0, 0], ciwsSpin: 0 }), pr1 = cp.dyn({ ciwsYaw: [0, 0], ciwsPitch: [0, 0], ciwsSpin: 1 });
  const basePr = pr0.filter(p => pr1.includes(p)), elevPr = pr0.filter(p => !pr1.includes(p));
  const MZ = PF.CIWS_MZ, TR = PF.CIWS_TR;
  function splitSpin(pts) {
    const a = [], b = [];
    for (let i = 0; i < pts.length; i += 6) {
      const x = pts[i], y = pts[i + 1] - MZ[1], z = pts[i + 2], dst = Math.hypot(x, y) < .205 && z > .6 ? b : a;
      // spin group in the barrel frame: origin on the bore axis
      if (dst === b) b.push(pts[i], pts[i + 1] - MZ[1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
      else for (let k = 0; k < 6; k++) a.push(pts[i + k]);
    }
    return [new Float32Array(a), new Float32Array(b)];
  }
  const LV_M = [.02, .04, .08, .16, .3];
  const mb = [], me = [], mbar = [];
  LV_M.forEach((sp, k) => {
    mb.push({ sp, pts: GEO.sample({ parts: [{ name: 'b', prims: basePr }] }, sp, 140 + k, {})[0].pts });
    const [e, br] = splitSpin(GEO.sample({ parts: [{ name: 'e', prims: elevPr }] }, sp, 150 + k, {})[0].pts);
    me.push({ sp, pts: e }); mbar.push({ sp, pts: br });
  });
  const MNT = { base: lodCloud(mb, .45), elev: lodCloud(me, .45), bar: lodCloud(mbar, .5) };
  DW.MNT = MNT;
  /* mount i world transforms for a train/elevation/spin: [train, elevating, barrels] */
  DW.mountXf = function (Xs, i, m) {
    const Xt = X.mul(Xs, PF.trainX(i, m.yaw)), Xe = X.mul(Xs, PF.elevX(i, m.yaw, m.pitch));
    const Xb = X.mul(Xe, X.make(R.z(m.spin), [0, MZ[1], 0]));
    return [Xt, Xe, Xb];
  };
  /* o.bb: record screen bounds */
  DW.drawMount = function (Xs, i, m, a, o) {
    const [Xt, Xe, Xb] = DW.mountXf(Xs, i, m), oo = Object.assign({ a, fade: 1400, lodpx: 5.5 }, o || {});
    drawLod(MNT.base, Xt, oo); drawLod(MNT.elev, Xe, oo); drawLod(MNT.bar, Xb, oo);
  };
  DW.drawShip = function (T, a, st, focus) {
    if (a <= .01) return;
    const Xs = PF.shipX(T);
    drawLod(SHIP_ML, Xs, { a, fade: 2600, focus, lodpx: 8.5 });
    drawLod(SPS_ML, X.mul(Xs, spsPart.xf(st)), { a, fade: 2600, focus, lodpx: 6 });
    DW.drawMount(Xs, 0, { yaw: st.ciwsYaw[0], pitch: st.ciwsPitch[0], spin: st.ciwsSpin }, a);
    DW.drawMount(Xs, 1, { yaw: st.ciwsYaw[1], pitch: st.ciwsPitch[1], spin: st.ciwsSpinA }, a);
  };

  /* wake: the Kelvin arms and the churned centre line, flowing aft; bow wave along both sides */
  DW.drawWake = function (T, a) {
    const Tm = PF.shipX(T), L = 155, h = L / 2, flow = (T * PF.VS) % 6, fl6 = Math.floor(T * PF.VS / 6);
    const pt = (x, y, z) => P3(Tm.R[0] * x + Tm.R[2] * z + Tm.T[0], y, Tm.R[6] * x + Tm.R[8] * z + Tm.T[2]);
    for (let d = 0; d < 1400; d += 6) {
      const dd = d + flow, fa = a * Math.pow(1 - dd / 1400, 1.5);
      for (const sd of [-1, 1]) if (pt(sd * (9 + dd * Math.tan(19.5 * DEG)), .3, -h - dd + 4)) put(q.x, q.y, q.z < 300 ? 2 : 1, WH[0], WH[1], WH[2], fa * .5);
      for (let m = 0; m < 4; m++) { const r = hsh(d * 4 + m, fl6 - (d / 6 | 0)), lat = (r - .5) * (13 + dd * .06); if (pt(lat, .25, -h - dd + 4)) put(q.x, q.y, q.z < 300 ? 2 : 1, WH[0], WH[1], WH[2], fa * .5 * (.5 + .5 * hsh(m, d))); }
    }
    for (let k = 0; k < 150; k++) {
      const sd = k & 1 ? 1 : -1, zz = 70 - (k >> 1) * 1.6, b = 7.2 + (70 - zz) * .05 + (zz < 55 ? 2.2 : 0);
      const fz = ((zz - T * PF.VS * .5) % 3 + 3) % 3;
      if (pt(sd * b, .45 + .35 * Math.sin(k * 1.7 + W(96) * T), zz - fz)) put(q.x, q.y, q.z < 200 ? 2 : 1, WH[0], WH[1], WH[2], a * .55 * (1 - (70 - zz) / 130));
    }
  };

  /* ---------- sea and sky: angular lattices ----------
     Constant density on screen at any lens. Sea: columns at bearings j dθ from the forward mount, rows at
     u = H0 / range = i du. Sky: directions from the eye, columns j dθ, rows at elevations i de. Each level halves
     the steps of the one above; a frame draws the two column levels x two row levels that bracket the target
     spacing, cross-faded, so zooms and climbs only bring dots in and out, never slide them. The sea rows follow
     the eye height. Sea nodes drift aft with the water (each on its own LF m cycle, faded at the wrap); the
     wide lens reads the swell, the long lens streaks of crests. Per-node randoms: a table hashed on (i, j, levels). */
  const SKYC = [206, 216, 196];
  const SIN = new Float32Array(4096); for (let i = 0; i < 4096; i++) SIN[i] = Math.sin(i / 4096 * TAU);
  const sinT = ph => SIN[((ph * 651.8986469) | 0) & 4095];     // 4096 / TAU
  const RT = (() => { const r = rng(4242), a = new Float32Array(65536); for (let i = 0; i < 65536; i++) a[i] = r(); return a; })();
  const DTH0 = TAU / 262144, H0 = 13.2, PXS = 8, PXK = 11, LF = 12;
  const MC0 = PF.CIWS_P[0][0], MC1 = PF.CIWS_P[0][2];
  const SUN_AZ = Math.atan2(LK[0], LK[2]);
  const CS = new Float64Array(16384), CC = new Float64Array(16384);
  let SEAN = 0;
  DW.seaN = () => SEAN;
  /* bearings (unwrapped about the view) and elevations of the frame's edge rays */
  const LB = { b0: 0, b1: 0, e0: 0, e1: 0 };
  function lensBounds() {
    const yaw = Math.atan2(F0, F2);
    let b0 = 1e9, b1 = -1e9, e0 = 1e9, e1 = -1e9;
    const xa = -34 - CX, xb = PW + 34 - CX, ya = -34 - CY, yb = PH + 34 - CY;
    for (let q2 = 0; q2 < 8; q2++) {
      const px = q2 < 3 ? xa : q2 < 6 ? xb : 0, py = q2 === 6 ? ya : q2 === 7 ? yb : [ya, 0, yb][q2 % 3];
      const dx = F0 + (R0 * px - U0 * py) / FL, dy = F1 + (R1 * px - U1 * py) / FL, dz = F2 + (R2 * px - U2 * py) / FL, L = Math.hypot(dx, dy, dz);
      let b = Math.atan2(dx, dz) - yaw; b -= TAU * Math.round(b / TAU);
      const e = Math.asin(dy / L);
      if (b < b0) b0 = b; if (b > b1) b1 = b; if (e < e0) e0 = e; if (e > e1) e1 = e;
    }
    LB.b0 = yaw + b0; LB.b1 = yaw + b1; LB.e0 = e0; LB.e1 = e1;
    return LB;
  }
  function columns(j0, j1, dth) { for (let j = j0; j <= j1; j++) { const th = j * dth; CS[j - j0] = Math.sin(th); CC[j - j0] = Math.cos(th); } }
  const lvW = x => { const L = Math.floor(x), f = x - L; return [L, 1 - f, f]; };
  /* the sea: one nested lattice about the forward mount, at any lens and from any eye near the ship.
     Rows at u = H0 / range = i DU0, columns at bearings j DTH0. A row (column) whose index has t trailing zero bits
     belongs to every level up to t, so each row keeps its dots at every distance and lens: per row the level
     needed for ~PXS px on screen is worked out from the eye's real distance to it, rows (columns) below that level
     are skipped, the ones just at it fade (mipmapping). Jitter scales with a node's own level. */
  const DU0 = DTH0 * .92;
  const tzOf = n => n === 0 ? 24 : Math.min(24, 31 - Math.clz32(n & -n));
  DW.drawSea = function (T, k, pxs) {
    SEAN = 0;
    if (k <= .01) return;
    const PXS = pxs || 8;
    const he = Math.max(1.5, E1), rHor = Math.sqrt(2 * PF.RE * he), uHor = H0 / rHor, i2R = 1 / (2 * PF.RE);
    const B = lensBounds();
    if (B.e0 >= -Math.sqrt(2 * he / PF.RE)) return;
    const de = Math.hypot(E0 - MC0, E2 - MC1), dLow = he / Math.tan(Math.min(1.45, -B.e0));
    const rMin = Math.max(9, dLow - de - 4), uMax = Math.min(1.4, H0 / rMin);
    const kT = ss(9000, 26000, FL);
    const flowPh = T * PF.VS / LF, crT = T * 66 / PF.D, w1 = W(28) * T, w2 = W(43) * T, wS = W(37) * T;
    const he2 = he * he, lDU = Math.log2(DU0), lDT = Math.log2(DTH0), lP = Math.log2(PXS / FL);
    // row level wanted at range rr (continuous)
    const rowLv = rr => { const g = Math.max(0, rr - de), D2 = he2 + g * g; return lP + Math.log2(H0 * D2 / (rr * rr * he)) - lDU; };
    let Lmin = 99;
    for (let s = 0; s <= 24; s++) { const rr = rMin * Math.pow(rHor / rMin, s / 24); Lmin = Math.min(Lmin, rowLv(rr)); }
    Lmin = Math.max(0, Math.floor(Lmin));
    const stepI = 1 << Lmin, iA = Math.ceil(uHor / DU0 / stepI) * stepI, iB = Math.floor(uMax / DU0);
    if ((iB - iA) / stepI > 4000) return;
    // widest bearing span any row needs, precomputed at the finest column level of the frame
    let cMin = 99;
    for (let s = 0; s <= 24; s++) { const rr = rMin * Math.pow(rHor / rMin, s / 24), g = Math.max(0, rr - de); cMin = Math.min(cMin, lP + .5 * Math.log2(he2 + g * g) - Math.log2(rr) - lDT); }
    const Lc0 = Math.max(0, Math.floor(cMin)), dth0 = DTH0 * (1 << Lc0);
    const mgMax = Math.asin(Math.min(1, de / rMin)) + .01;
    let J0 = Math.floor((B.b0 - mgMax) / dth0) - 1, J1 = Math.ceil((B.b1 + mgMax) / dth0) + 1;
    if (J1 - J0 > 16000) { J0 = Math.floor((B.b0 - Math.PI) / dth0); J1 = J0 + Math.min(15999, Math.ceil(TAU / dth0)); }
    columns(J0, J1, dth0);
    for (let i = iA; i <= iB; i += stepI) {
      const tzi = tzOf(i), u0 = i * DU0, rr = H0 / u0, mr = rowLv(rr), Lr = Math.floor(mr);
      if (tzi < Lr) continue;
      const rowA = tzi > Lr ? 1 : 1 - (mr - Lr);
      if (rowA < .03) continue;
      const g = Math.max(0, rr - de), mc = lP + .5 * Math.log2(he2 + g * g) - Math.log2(rr) - lDT, Lc = Math.max(Lc0, Math.floor(mc)), fc = mc - Lc;
      const sj = 1 << (Lc - Lc0), m = Math.asin(Math.min(1, de / rr)) + .01;
      const jA = Math.max(J0, Math.floor((B.b0 - m) / dth0)), jB = Math.min(J1, Math.ceil((B.b1 + m) / dth0));
      const rs = Math.imul(i, 73856093), ju = DU0 * .8 * Math.pow(2, Math.min(tzi, 9)), strU = u0 * 10472;
      const kr = k * rowA;
      for (let jj0 = Math.ceil(jA / sj) * sj; jj0 <= jB; jj0 += sj) {
        const tzj = tzOf(jj0) + Lc0, colA = tzj > Lc ? 1 : 1 - fc;
        if (colA < .03) continue;
        const h = Math.imul(jj0 << Lc0, 19349663) ^ rs;
        const u = u0 + (RT[h & 65535] - .5) * ju; if (u < uHor) continue;
        const r = H0 / u, e = (RT[(h >>> 16) & 65535] - .5) * .8 * DTH0 * Math.pow(2, Math.min(tzj, 10)), q2 = jj0 - J0, sn = CS[q2] + CC[q2] * e, cs = CC[q2] - CS[q2] * e;
        let fp = flowPh + RT[(h >>> 8) & 65535]; fp -= Math.floor(fp);
        const x = MC0 + r * sn, z0 = MC1 + r * cs, z = z0 - fp * LF;
        if (r < 90 && z > -80 && z < 80 && x > -10.7 && x < 10.7 && (z < 36 || Math.abs(x) < 10.7 * (1 - Math.pow(Math.max(0, (z - 17) / 61), 1.85)))) continue;
        const sw = sinT(x * .0437 + z0 * .0291 + w1) * .6 + sinT(x * .0213 - z0 * .061 - w2) * .4;
        const dx = x - E0, dz = z - E2;
        const dy = .55 * sw - (dx * dx + dz * dz) * i2R - E1, zc = dx * F0 + dy * F1 + dz * F2;
        if (zc < NEAR) continue;
        const iz = FL / zc, sx = CX + (dx * R0 + dy * R1 + dz * R2) * iz; if (sx < 0 || sx >= PW) continue;
        const sy = CY - (dx * U0 + dy * U1 + dz * U2) * iz; if (sy < 0 || sy >= PH) continue;
        SEAN++;
        let cr = RT[(h >>> 4) & 65535] + crT; cr -= Math.floor(cr); cr = cr < .5 ? cr * 2 : 2 - cr * 2;
        const tri = fp < .5 ? fp * 2 : 2 - fp * 2, wrap = tri < .25 ? tri * 4 : 1;
        let str = 0;
        if (kT > .01) { const s = sinT(strU + wS + 1.3 * sinT(jj0 * dth0 * 2094 + u0 * 3100)); str = s > 0 ? s * s * s : 0; }
        const far = r > rHor * .5 ? .24 * (r / rHor - .5) * 2 : 0;
        const b0 = kr * colA * wrap * (.25 - .07 * kT + (1 - kT) * .34 * (sw * .5 + .5) + kT * .72 * str + .16 * cr + far);
        if (b0 < .02) continue;
        const b = b0 > 1 ? 1 : b0, qq = (sy | 0) * PW + (sx | 0), p = PU[qq], Rr = (WH[0] * b) | 0;
        const v = 0xff000000 | (((WH[2] * b) | 0) << 16) | (((WH[1] * b) | 0) << 8) | Rr;
        if (Rr > (p & 255)) PU[qq] = v;
        // on the long lens a node is a glint drawn along the crest: 2-3 px wide
        const gw = kT > .5 ? (str > .35 ? 3 : 2) : zc < 500 ? 2 : 1;
        for (let g = 1; g < gw; g++) if ((sx | 0) + g < PW && Rr > (PU[qq + g] & 255)) PU[qq + g] = v;
        // water close under the lens: 2 px
        if (zc < 45 && sx + 1 < PW && sy + 1 < PH) { const v = PU[qq]; if (Rr > (PU[qq + 1] & 255)) PU[qq + 1] = v; if (Rr > (PU[qq + PW] & 255)) PU[qq + PW] = v; if (Rr > (PU[qq + PW + 1] & 255)) PU[qq + PW + 1] = v; }
      }
    }
  };
  /* the flown shots' sea: a nested world lattice flowing aft with the water. Rows j at z = j S0 - VS T (so each
     row is a line of water and keeps its identity as it flows), columns i at x = i S0. Like the sight's lattice, an
     index with t trailing zero bits belongs to every level up to t; walking out from the eye, each row (and each
     column along a row) steps to the next index of the level its on-screen spacing asks for, and indices just at
     that level fade. Only used away from the seam, so the flow never wraps on screen. */
  const S0 = .09;
  let SEAWN = 0;
  DW.seaWN = () => SEAWN;
  DW.drawSeaW = function (T, k, pxs) {
    SEAWN = 0;
    if (k <= .01) return;
    const PX = pxs || 8, he = Math.max(1.5, E1), he2 = he * he, rHor = Math.sqrt(2 * PF.RE * he), i2R = 1 / (2 * PF.RE);
    // past RW the sea is a pixel or two above the drawn horizon line; iRh folds the earth's curve into the row gaps
    const RW = Math.min(4500, rHor * .6), iRh = 1 / (2 * PF.RE * he);
    const B = lensBounds();
    if (B.e0 >= -Math.sqrt(2 * he / PF.RE)) return;
    const flow = PF.VS * T, crT = T * 66 / PF.D, ph1 = W(28) * T, ph2 = -W(43) * T;
    const kmin = -40 - CX, kmax = PW + 40 - CX, kb = PH + 30 - CY, kt = CY + 30;
    const lS = Math.log2(PX / (FL * S0));
    /* levels a node at (x, zr) on the water needs: columns from the screen length of a step along x, rows from the
       gap between neighbouring rows' projected lines, |ds/dx x ds/dz| / |ds/dx| */
    let mcO = 0, mrO = 0, zcO = 0;
    const levels = (x, zr) => {
      const px = x - E0, py = -E1, pz = zr - E2, zc = px * F0 + py * F1 + pz * F2;
      if (zc < .5) { zcO = zc; mcO = mrO = 99; return; }
      const xs = (px * R0 + py * R1 + pz * R2) / zc, ys = (px * U0 + py * U1 + pz * U2) / zc;
      const ax = R0 - xs * F0, ay = U0 - ys * F0, bx = R2 - xs * F2, by = U2 - ys * F2;
      const ja = Math.sqrt(ax * ax + ay * ay) + 1e-9, cr = Math.abs(ax * by - ay * bx) * Math.max(.06, 1 - (px * px + pz * pz) * iRh) + 1e-9;
      zcO = zc; mcO = lS + Math.log2(zc / ja); mrO = lS + Math.log2(zc * ja / cr);
    };
    // z-range of the sea the frame can see: its edge rays on the water, or out to RW
    let zA = 1e9, zB = -1e9;
    for (let q2 = 0; q2 < 9; q2++) {
      const px = [-CX, 0, PW - CX][q2 % 3], py = [-CY, 0, PH - CY][(q2 / 3) | 0];
      const dx = F0 + (R0 * px - U0 * py) / FL, dy = F1 + (R1 * px - U1 * py) / FL, dz = F2 + (R2 * px - U2 * py) / FL;
      const hl = Math.hypot(dx, dz) || 1e-9, t = dy < -1e-4 ? Math.min(RW, he / -dy * hl) : RW;
      const z = E2 + dz / hl * t; if (z < zA) zA = z; if (z > zB) zB = z;
    }
    zA = Math.max(zA, E2 - RW) - 2; zB = Math.min(zB, E2 + RW) + 2;
    let lo = 0, hi = 0;
    const lin = (c0, c1) => { if (c1 > -1e-12 && c1 < 1e-12) { if (c0 < 0) { lo = 1; hi = 0; } return; } const r = -c0 / c1; if (c1 > 0) { if (r > lo) lo = r; } else if (r < hi) hi = r; };
    const GO = [.6, 1.5, 3, 6, 12, 24, 48, 96, 192, 384, 768, 1536, 3072, 6144], SX = new Float64Array(40), SMR = new Float64Array(40), SMC = new Float64Array(40);
    const jE = Math.round((E2 + flow) / S0);
    for (let dir = -1; dir <= 1; dir += 2) {
      let j = dir > 0 ? jE : jE - 1, sr = 1;
      for (let guard = 0; guard < 9000; guard++) {
        const zr = j * S0 - flow;
        if (dir > 0 ? zr > zB : zr < zA) break;
        const dzE = zr - E2, dz2r = dzE * dzE;
        if (dz2r > RW * RW) break;
        // this row's visible x-interval: the frame's side planes on the line z = zr, y = 0
        const bx = -E0, by = -E1, bz = zr - E2;
        const xa = bx * R0 + by * R1 + bz * R2, ya = bx * U0 + by * U1 + bz * U2, za = bx * F0 + by * F1 + bz * F2;
        const xr = Math.sqrt(RW * RW - dz2r);
        lo = E0 - xr; hi = E0 + xr;
        lin(za - .5, F0); lin(FL * xa - kmin * za, FL * R0 - kmin * F0); lin(kmax * za - FL * xa, kmax * F0 - FL * R0);
        lin(FL * ya + kb * za, FL * U0 + kb * F0); lin(kt * za - FL * ya, kt * F0 - FL * U0);
        if (lo < hi) {
          // the levels along the row, sampled outward from its point nearest the eye at doubling offsets (they go
          // roughly as the log of the distance, so interpolating between these is close); the finest it needs anywhere
          const xn = E0 < lo ? lo : E0 > hi ? hi : E0;
          let ns = 0;
          SX[ns++] = lo;
          for (let g = GO.length - 1; g >= 0; g--) { const x = xn - GO[g]; if (x > lo + .01) SX[ns++] = x; }
          if (xn > lo + .01 && xn < hi - .01) SX[ns++] = xn;
          for (let g = 0; g < GO.length; g++) { const x = xn + GO[g]; if (x < hi - .01) SX[ns++] = x; }
          SX[ns++] = hi;
          let mMin = 99;
          for (let q2 = 0; q2 < ns; q2++) { levels(SX[q2], zr); SMR[q2] = mrO; SMC[q2] = mcO; if (mrO < mMin) mMin = mrO; }
          const Lmin = Math.max(0, Math.floor(mMin));
          sr = 1 << Math.min(20, Lmin);
          const t = tzOf(j);
          if (t >= Lmin) {
            const rs = Math.imul(j, 73856093) ^ 0x51ED27, zjA = .8 * S0 * Math.pow(2, Math.min(t, 9));
            // walk the stretches of the row where it is wanted (mr < t + 1), a sample of margin each side
            let q2 = 0;
            while (q2 < ns) {
              while (q2 < ns && SMR[q2] >= t + 1) q2++;
              if (q2 >= ns) break;
              const qa = q2; while (q2 < ns && SMR[q2] < t + 1) q2++;
              const xa0 = SX[Math.max(0, qa - 1)], xb0 = SX[Math.min(ns - 1, q2)];
              let i = Math.floor(xa0 / S0), p = Math.max(0, qa - 1);
              const iEnd = Math.ceil(xb0 / S0);
              for (let g2 = 0; i <= iEnd && g2 < 8000; g2++) {
                const x0 = i * S0;
                // levels here, interpolated between the bracketing samples
                while (p < ns - 2 && SX[p + 1] <= x0) p++;
                let qf = (x0 - SX[p]) / (SX[p + 1] - SX[p] || 1); qf = qf < 0 ? 0 : qf > 1 ? 1 : qf;
                const mc = SMC[p] + (SMC[p + 1] - SMC[p]) * qf, mr = SMR[p] + (SMR[p + 1] - SMR[p]) * qf;
                const Lc = mc < 0 ? 0 : mc > 20 ? 20 : Math.floor(mc), sc = 1 << Lc;
                if (i % sc !== 0) { i = (Math.floor(i / sc) + 1) * sc; continue; }
                const tzi = tzOf(i), ii = i;
                i += sc;
                const colA = tzi > Lc ? 1 : 1 - (mc - Lc);
                if (colA < .03) continue;
                const rowA = mr < t ? 1 : 1 - (mr - t);
                if (rowA < .03) continue;
                const h = Math.imul(ii, 19349663) ^ rs;
                const x = x0 + (RT[h & 65535] - .5) * .8 * S0 * Math.pow(2, Math.min(tzi, 9));
                // each node its own jitter across the row too, so rows never read as lines
                const zj = (RT[(h >>> 16) & 65535] - .5) * zjA, rw = zr + zj, zw = j * S0 + zj, dz = rw - E2, dz2 = dz * dz;
                if (rw > -80 && rw < 80 && x > -10.7 && x < 10.7 && (rw < 36 || Math.abs(x) < 10.7 * (1 - Math.pow(Math.max(0, (rw - 17) / 61), 1.85)))) continue;
                const sw = sinT(TAU * (zw / 144 + x / 432) + ph1) * .6 + sinT(TAU * (zw / 96 - x / 216) + ph2) * .4;
                const dx = x - E0, dq = dx * dx + dz2;
                const dy = .55 * sw - dq * i2R - E1, zc = dx * F0 + dy * F1 + dz * F2;
                if (zc < NEAR) continue;
                const iz = FL / zc, sx = CX + (dx * R0 + dy * R1 + dz * R2) * iz; if (sx < 0 || sx >= PW) continue;
                const sy = CY - (dx * U0 + dy * U1 + dz * U2) * iz; if (sy < 0 || sy >= PH) continue;
                SEAWN++;
                let cr = RT[(h >>> 4) & 65535] + crT; cr -= Math.floor(cr); cr = cr < .5 ? cr * 2 : 2 - cr * 2;
                const far = dq > 4e6 ? .2 * Math.min(1, (Math.sqrt(dq) - 2000) / 2500) : 0;
                const b0 = k * rowA * colA * (.25 + .34 * (sw * .5 + .5) + .16 * cr + far);
                if (b0 < .02) continue;
                const b = b0 > 1 ? 1 : b0, qq = (sy | 0) * PW + (sx | 0), Rr = (WH[0] * b) | 0;
                const v = 0xff000000 | (((WH[2] * b) | 0) << 16) | (((WH[1] * b) | 0) << 8) | Rr;
                if (Rr > (PU[qq] & 255)) PU[qq] = v;
                if (zc < 500 && (sx | 0) + 1 < PW && Rr > (PU[qq + 1] & 255)) PU[qq + 1] = v;
                if (zc < 45 && sy + 1 < PH) { if (Rr > (PU[qq + PW] & 255)) PU[qq + PW] = v; if (sx + 1 < PW && Rr > (PU[qq + PW + 1] & 255)) PU[qq + PW + 1] = v; }
              }
            }
          }
        }
        // next row of the level wanted here (walking away from the eye)
        if (dir > 0) j = (Math.floor(j / sr) + 1) * sr; else j = (Math.ceil(j / sr) - 1) * sr;
      }
    }
  };
  /* the sky: dots at infinity, dense in the haze low over the horizon, thinning upward, warmer toward the sun;
     on a wide lens the horizon itself is drawn as a line of dots */
  DW.drawSky = function (T, k) {
    if (k <= .01) return;
    const he = Math.max(1.5, E1), dip = Math.sqrt(2 * he / PF.RE);
    const B = lensBounds();
    const kH = k * (1 - .45 * ss(4000, 14000, FL));
    if (kH > .01 && B.e0 < -dip && B.e1 > -dip) {
      const n = Math.min(5000, Math.ceil((B.b1 - B.b0) * FL / 2.4)), c = Math.cos(dip);
      for (let m = 0; m <= n; m++) {
        const th = B.b0 + (B.b1 - B.b0) * m / n, dx = Math.sin(th) * c, dz = Math.cos(th) * c, dy = -dip;
        const zc = dx * F0 + dy * F1 + dz * F2; if (zc < .05) continue;
        const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
        if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
        const sun = .5 + .5 * Math.cos(th - SUN_AZ);
        put(sx, sy, 1, WH[0], WH[1], WH[2], kH * (.26 + .22 * sun * sun + .1 * RT[(m * 7919) & 65535]));
      }
    }
    const eTop = Math.min(1.2, B.e1), eBot = Math.max(-dip, B.e0);
    if (eTop <= -dip) return;
    const [Lc, wc0, wc1] = lvW(Math.max(0, Math.log2(PXK / (FL * DTH0))));
    for (let pc = 0; pc < 2; pc++) {
      const wgt = pc ? wc1 : wc0;
      if (wgt < .03) continue;
      const L = Lc + pc, dth = DTH0 * Math.pow(2, L), de = dth;
      const J0 = Math.floor(B.b0 / dth) - 1, J1 = Math.ceil(B.b1 / dth) + 1, i0 = Math.floor(eBot / de) - 1, i1 = Math.ceil(eTop / de) + 1;
      if (J1 - J0 > 16000 || i1 - i0 > 3000) continue;
      columns(J0, J1, dth);
      const kk = k * wgt, seedL = Math.imul(L + 7, 0x2545F491);
      for (let i = i0; i <= i1; i++) {
        const rs = Math.imul(i, 83492791) ^ seedL, eRow = i * de, ea = Math.max(0, eRow + dip);
        const dens = .012 + .25 * Math.exp(-ea / .06) + .74 * Math.exp(-ea / .0034), ce0 = Math.cos(eRow);
        for (let j = J0; j <= J1; j++) {
          const h = Math.imul(j, 19349663) ^ rs;
          if (RT[(h >>> 8) & 65535] > dens) continue;
          const e = eRow + (RT[h & 65535] - .5) * de; if (e < -dip) continue;
          const ej = (RT[(h >>> 16) & 65535] - .5) * dth, jj = j - J0;
          const dx = (CS[jj] + CC[jj] * ej) * ce0, dy = e, dz = (CC[jj] - CS[jj] * ej) * ce0, zc = dx * F0 + dy * F1 + dz * F2;
          if (zc < .05) continue;
          const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc; if (sx < 0 || sx >= PW) continue;
          const sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc; if (sy < 0 || sy >= PH) continue;
          const hz = (e + dip), sun = .5 + .5 * Math.cos(j * dth - SUN_AZ), sun3 = sun * sun * sun;
          const b0 = kk * (.1 + .3 * Math.exp(-hz / .05) + .36 * Math.exp(-hz / .0028)) * (.55 + .45 * sun3) * (.7 + .3 * RT[(h >>> 4) & 65535]);
          const b = b0 > 1 ? 1 : b0, qq = (sy | 0) * PW + (sx | 0), p = PU[qq], Rr = (SKYC[0] * b) | 0;
          if (Rr > (p & 255)) PU[qq] = 0xff000000 | (((SKYC[2] * b) | 0) << 16) | (((SKYC[1] * b) | 0) << 8) | Rr;
        }
      }
    }
  };

  /* ---------- rounds ---------- */
  const OM = HD.oniks();
  const RND_LV = [.018, .045, .11, .26].map((sp, k) => ({ sp, parts: GEO.sample(OM, sp, 60 + k, { wing: 1, fin: 1, booster: false, cover: false }).filter(s => s.pts.length && s.name !== 'booster' && s.name !== 'cover') }));
  DW.RND_LV = RND_LV;
  const NOZ = HD.oniks.NOZZLE;
  DW.roundX = RO => X.make(R.look(RO.dir, [0, 1, 0]), RO.p);
  const CR0 = CORAL[0] - WH[0], CG0 = CORAL[1] - WH[1], CB0 = CORAL[2] - WH[2];
  /* lit dots, coral along the silhouette: how far a dot lies from the body's axis on screen against the body's
     radius there (the sampled normals of a lathe are radial, so a nose-on view would read all rim); wings and fins
     standing clear of the body are edge too. Records the screen bounds. */
  const RIM = { ax: 0, ay: 0, bx: 0, by: 0, r: 1 };
  function drawRoundPts(pts, T, a, big) {
    const M = T.R, t = T.T, L0 = LK[0], L1 = LK[1], L2 = LK[2];
    const abx = RIM.bx - RIM.ax, aby = RIM.by - RIM.ay, abq = abx * abx + aby * aby + 1e-6, rr = RIM.r;
    for (let j = 0, n = pts.length; j < n; j += 6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .5;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz), fac = -(wx * dx + wy * dy + wz * dz) * il;
        if (fac < -.35) continue;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = .3 + .66 * lit;
      }
      let u = ((sx - RIM.ax) * abx + (sy - RIM.ay) * aby) / abq; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = sx - RIM.ax - abx * u, ey = sy - RIM.ay - aby * u, dd = Math.sqrt(ex * ex + ey * ey) / rr;
      const rim = dd > 1.08 ? .85 : dd > .62 ? (dd - .62) / .46 : 0;
      if (sx < BB.x0) BB.x0 = sx; if (sx > BB.x1) BB.x1 = sx; if (sy < BB.y0) BB.y0 = sy; if (sy > BB.y1) BB.y1 = sy; BB.n++;
      const cr = WH[0] + CR0 * rim, cg = WH[1] + CG0 * rim, cb = WH[2] + CB0 * rim;
      b = Math.max(b, rim * .95) * a;
      put(sx, sy, zc < big ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
  /* the round k as seen now; returns its screen bounds {x0,y0,x1,y1} (true: from the dots drawn) or null */
  DW.drawRound = function (k, T, RO, a) {
    if (a <= .01) return null;
    const Xf = DW.roundX(RO), c = RO.p;
    const dist = Math.max(.5, Math.hypot(c[0] - E0, c[1] - E1, c[2] - E2) - 4.5);
    DW.bbReset();
    if (1.8 * FL / dist < 2.5) {
      if (P3(c[0], c[1], c[2])) {
        put(q.x, q.y, 2, CORAL[0], CORAL[1], CORAL[2], a * .9); put(q.x, q.y, 1, 255, 248, 236, a);
        BB.x0 = q.x - 1; BB.x1 = q.x + 1; BB.y0 = q.y - 1; BB.y1 = q.y + 1; BB.n = 1;
      }
    } else {
      let L = RND_LV[RND_LV.length - 1];
      for (let j = RND_LV.length - 1; j >= 0; j--) { L = RND_LV[j]; if (RND_LV[j].sp * FL / dist < 2.2) break; }
      // the body's axis on screen (nose to nozzle) and its radius, for the silhouette
      const pa = X.ap(Xf, [0, 0, 4.2]), pz = X.ap(Xf, [0, 0, -4.4]);
      if (P3(pa[0], pa[1], pa[2])) { RIM.ax = q.x; RIM.ay = q.y; const zA = q.z; if (P3(pz[0], pz[1], pz[2])) { RIM.bx = q.x; RIM.by = q.y; } else { RIM.bx = RIM.ax; RIM.by = RIM.ay; } RIM.r = Math.max(1, .355 * FL / zA); }
      for (const s of L.parts) drawRoundPts(s.pts, s.part.xf ? X.mul(Xf, s.part.xf({ wing: 1, fin: 1 })) : Xf, a, L.sp * FL / 2.6);
    }
    const bb = BB.n ? { x0: BB.x0, y0: BB.y0, x1: BB.x1, y1: BB.y1, z: dist } : null;
    drawPlume(k, T, Xf, a, dist);
    return bb;
  };
  /* ramjet plume: a hot core leaving the nozzle, shock diamonds for ~4 m, a paling jet */
  function drawPlume(k, T, Xf, a, dist) {
    const fr = Math.floor(T * 90), M = Xf.R, n0 = X.ap(Xf, NOZ), ax = [-M[2], -M[5], -M[8]];
    const ux = [M[0], M[3], M[6]], uy = [M[1], M[4], M[7]];
    const px = FL / Math.max(1, dist);
    if (px * 8 < 2) { if (P3(n0[0], n0[1], n0[2])) put(q.x, q.y, 1, 255, 250, 225, a * .8); return; }
    // the body's disc on screen: jet dots behind it (seen from ahead) stay hidden
    let ocx = -1e9, ocy = 0, ocr = 0, ocz = 0;
    if (P3(Xf.T[0], Xf.T[1], Xf.T[2])) { ocx = q.x; ocy = q.y; ocz = q.z; ocr = .38 * FL / q.z; }
    const N = Math.min(900, Math.round(90 + px * 110));
    for (let i = 0; i < N; i++) {
      const u = hsh(i + k * 977, fr), v = hsh(i + 131, fr + k * 3), w = hsh(i + 71, 5 + k);
      const s = 16 * Math.pow(u, 1.8), rad = (.1 + .03 * s) * Math.sqrt(v) * (s < .3 ? 1.6 : 1), th = TAU * w + fr * .7;
      const cx = Math.cos(th) * rad, cy = Math.sin(th) * rad;
      const x = n0[0] + ax[0] * s + ux[0] * cx + uy[0] * cy, y = n0[1] + ax[1] * s + ux[1] * cx + uy[1] * cy, z = n0[2] + ax[2] * s + ux[2] * cx + uy[2] * cy;
      if (!P3(x, y, z)) continue;
      if (q.z > ocz && (q.x - ocx) * (q.x - ocx) + (q.y - ocy) * (q.y - ocy) < ocr * ocr) continue;
      const dia = s < 5 ? Math.pow(.5 + .5 * Math.cos(TAU * s / .75), 6) * (1 - s / 5) : 0;
      const hot = Math.exp(-s / 1.6), b = a * Math.min(1, .3 + 1.1 * hot + 1.1 * dia) * (1 - s / 16.5);
      put(q.x, q.y, q.z < 80 ? 2 : 1, 255, 236 + 19 * hot, 200 + 50 * hot, b);
    }
    if (P3(n0[0], n0[1], n0[2])) {
      const hid = q.z > ocz && Math.hypot(q.x - ocx, q.y - ocy) < ocr;
      glow(q.x, q.y, Math.min(60, 4 + px * 1.9), 255, 226, 196, (hid ? .12 : .26) * a);
      if (!hid) glow(q.x, q.y, Math.min(16, 2 + px * .4), 255, 255, 245, .5 * a);
    }
  }
  /* the sea-skimmer's wake: its shock wave lifts a sheet of spray off the water under its track, highest right
     behind it, spreading into a V and settling over a couple of seconds */
  DW.drawSkim = function (k, T, a) {
    const r = PF.ROUNDS[k], RO = { p: [0, 0, 0], dir: [0, 0, 1] };
    const tEnd = Math.min(T, r.tStop), ph = (T * 83) % 1;
    for (let m = 0; m < 300; m++) {
      const age = (m + ph) * .008, tp = tEnd - age;
      if (tp < r.t0) break;
      PF.round(k, tp, RO);
      if (RO.a <= 0) continue;
      const base = RO.p, fall = Math.exp(-age * 1.3), lift = Math.min(1, age * 9);
      for (let n = 0; n < 6; n++) {
        const id = Math.floor(tp * 125) * 6 + n, side = n & 1 ? 1 : -1;
        const lat = side * (.4 + age * 7 * (.35 + .65 * hsh(id, 5))) + PF.gH(id, 3) * .5;
        const up = (.15 + 3.2 * hsh(id, 9) * hsh(id, 11)) * lift * fall + .1;
        const x = base[0] + RO.dir[2] * lat, z = base[2] - RO.dir[0] * lat;
        if (!P3(x, up, z)) continue;
        const al = a * RO.a * fall * (.55 + .45 * hsh(id, 13));
        put(q.x, q.y, q.z < 700 ? 2 : 1, WH[0], WH[1], WH[2], al > 1 ? 1 : al);
      }
    }
  };
})();
