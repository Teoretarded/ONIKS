/* THERMAL: the imager's raster. Every dot carries a temperature, heat h (0 the clear night sky, ~.17 the sea,
   ~.36 the hull, 1 a gas turbine's exhaust mouth), mapped through the sensor's palette: white-hot (hot = bright)
   or black-hot (the dot intensities invert against a mid-grey dot field: hot things go dark; the page stays
   graphite). Max-blend square dots into a packed raster. Coarse 4x4 px occlusion tiles are written by the hero and
   by small hot things, so the sea and the sky never show through the hull, and hot points carry the imager's dark
   halo (it is what makes them read in black-hot).
   The hero: HD.destroyer sampled at .24 m, with dense .11 m patches amidships and aft; each 6 m cell's points are
   shuffled so any prefix is an even subsample, and each frame draws the prefix that keeps ~2.5 px between dots,
   so the density holds through every zoom. Its exhaust, its wake. The sea and the sky as hierarchical lattices
   (a point once born persists as the lens closes in; nothing pops during a zoom). The rounds, their warm trails,
   the interceptors' flight paths as plain lines, the sensor's grain. */
(function () {
  const { V, R, X, E, rng } = M3;
  const PG = window.PG, DEG = PG.DEG, TAU = PG.TAU, D = PG.D, hsh = PG.hsh;
  const DW = PG.DW = {};
  const IRE2 = 1 / (2 * PG.RE);

  /* ---------- raster: the current camera + buffer ---------- */
  let E0 = 0, E1 = 0, E2 = 0, F0 = 0, F1 = 0, F2 = 1, R0 = 1, R1 = 0, R2 = 0, U0 = 0, U1 = 1, U2 = 0, FL = 1000, CX = 960, CY = 540, NEAR = 1;
  let PU = null, D8 = null, PW = 1920, PH = 1080;
  const q = DW.q = { x: 0, y: 0, z: 0 };
  const U32 = new Map();
  const u32of = b => { let u = U32.get(b); if (!u) { u = new Uint32Array(b.img.data.buffer); U32.set(b, u); } return u; };
  DW.sync = function (c, buf) {
    PU = u32of(buf); D8 = buf.d; PW = buf.W; PH = buf.H;
    E0 = c.eye[0]; E1 = c.eye[1]; E2 = c.eye[2]; F0 = c.f[0]; F1 = c.f[1]; F2 = c.f[2];
    R0 = c.r[0]; R1 = c.r[1]; R2 = c.r[2]; U0 = c.u[0]; U1 = c.u[1]; U2 = c.u[2];
    FL = c.fl; CX = c.cx + c.shake[0]; CY = c.cy + c.shake[1]; NEAR = c.near;
    DW.cam = c;
  };

  /* ---------- the sensor: palette (with AGC level/span), polarity and its wipe, noise ---------- */
  const NPAL = 1024, HMAX = 1.3, HK = (NPAL - 1) / HMAX;
  const PALW = new Float32Array(NPAL), PALB = new Float32Array(NPAL);
  let PALN = PALW, PALO = PALW, WIPEY = 1e9;
  /* pol / from: 0 white-hot, 1 black-hot; wipe: 0..1 while switching (rows above the wipe show `pol`), else -1.
     lo, hi: the AGC window in heat; floor: the white-hot level of the coldest dot; grey: the black-hot field */
  const S = DW.sensor = { pol: 0, from: 0, wipe: -1, lo: .05, hi: .92, gamma: .85, floor: .12, grey: .56, bgam: 1.7, noise: .06, glare: 0 };
  DW.palette = function () {
    const lo = S.lo, sp = Math.max(.02, S.hi - S.lo);
    for (let i = 0; i < NPAL; i++) {
      const h = i / HK, u = E.sat((h - lo) / sp);
      PALW[i] = S.floor + (1 - S.floor) * Math.pow(u, S.gamma);
      // black-hot: the coldest dots sit at a mid grey and warm things fall away steeply, so a hull a little warmer
      // than the sea already reads as a dark shape
      PALB[i] = S.grey * Math.pow(1 - u, S.bgam);
    }
    const pn = S.pol ? PALB : PALW, po = S.from ? PALB : PALW;
    if (S.wipe >= 0 && S.wipe < 1) { PALN = pn; PALO = po; WIPEY = S.wipe * PH; } else { PALN = PALO = pn; WIPEY = 1e9; }
  };
  /* display value of heat h under polarity pol (for the spot meter and stage B) */
  DW.lum = (h, pol) => { let i = (h * HK) | 0; i = i < 0 ? 0 : i >= NPAL ? NPAL - 1 : i; return pol ? PALB[i] : PALW[i]; };
  /* per-dot temporal noise: a fixed gaussian table walked from a per-frame offset (30 Hz) */
  const GN = 8192, GM = GN - 1, GT = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GT[i] = PG.gH(i, 7331);
  const GH = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GH[i] = hsh(i, 9);
  DW.GT = GT; DW.GM = GM;
  const NZ = new Float32Array(4096); let nzi = 0, nzAmp = -1;
  DW.frame = function (fr) {
    if (S.noise !== nzAmp) { nzAmp = S.noise; for (let i = 0; i < 4096; i++) NZ[i] = Math.max(0, 1 + nzAmp * GT[(i * 5 + 17) & GM]); }
    nzi = (fr * 1237) & 4095;
  };
  /* the spot meter: the hottest dot drawn within r px of the boresight */
  let SPX = 960, SPY = 540, SPR = 7;
  const SPOT = DW.spot = { x: 960, y: 540, r: 7, h: -1 };
  DW.spotAt = (x, y, r) => { SPOT.x = SPX = x; SPOT.y = SPY = y; SPOT.r = SPR = r; SPOT.h = -1; };

  /* heat dot: palette, noise, max blend (every heat dot is grey, so the green channel decides) */
  function hput(x, y, s, h, a) {
    const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    if (h > SPOT.h && a > .45 && x - SPOT.x < SPOT.r && SPOT.x - x < SPOT.r && y - SPOT.y < SPOT.r && SPOT.y - y < SPOT.r) SPOT.h = h;
    let i = (h * HK) | 0; if (i < 0) i = 0; else if (i >= NPAL) i = NPAL - 1;
    let v = (y < WIPEY ? PALN[i] : PALO[i]) * a * NZ[nzi = (nzi + 1) & 4095];
    if (v > 1) v = 1;
    const G = (238 * v) | 0;
    if (G < 2) return;
    const col = 0xff000000 | (((228 * v) | 0) << 16) | (G << 8) | G;
    for (let j = 0; j < s; j++) { let k = (y0 + j) * PW + x0; for (let m = 0; m < s; m++, k++) if (G > ((PU[k] >>> 8) & 255)) PU[k] = col; }
  }
  /* coloured max-blend dot (overlays) */
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
  /* overlay dot that replaces what is under it (lime / coral over bright dots) */
  function dset(x, y, s, c, a) {
    const d = D8, x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * PW + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  }
  /* project a world point, with the earth's drop: q.x, q.y (px), q.z (depth); false behind the lens or far off */
  function P3(x, y, z) {
    const dx = x - E0, dz = z - E2, dy = y - (dx * dx + dz * dz) * IRE2 - E1, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < NEAR) return false;
    q.x = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc; q.y = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc; q.z = zc;
    return q.x > -40 && q.y > -40 && q.x < PW + 40 && q.y < PH + 40;
  }
  const P3v = p => P3(p[0], p[1], p[2]);
  /* a soft bloom of heat h: white-hot adds light, black-hot darkens the field under it; (1 - d²/R²)² falloff */
  function hglow(x, y, Rr, h, a) {
    if (a <= .002 || Rr < .5) return;
    let i = (h * HK) | 0; i = i < 0 ? 0 : i >= NPAL ? NPAL - 1 : i;
    const lw = PALW[i] * a, kb = a * (1 - PALB[i] / Math.max(.05, S.grey));
    const d = D8, W = PW, x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(PH - 1, Math.ceil(y + Rr)), iR2 = 1 / (Rr * Rr);
    for (let j = y0; j <= y1; j++) {
      const dy = j - y, bh = (j < WIPEY ? S.pol : S.from) === 1;
      for (let m = x0; m <= x1; m++) {
        const dx = m - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue;
        const w = u * u, k = (j * W + m) * 4;
        if (bh) { const f = 1 - w * kb; d[k] *= f; d[k + 1] *= f; d[k + 2] *= f; }
        else { const v = w * lw; d[k] += 238 * v; d[k + 1] += 238 * v; d[k + 2] += 228 * v; }
      }
    }
  }

  /* ---------- occlusion tiles (4x4 px): nearest depth + kind (1 hero dot, 2 closed gap, 3 hot-thing halo) ---------- */
  const OW = 480, OH = 270, OZ = new Float32Array(OW * OH), OC = new Uint8Array(OW * OH), OTOL = 3;
  let occOn = false;
  const BKW = 60, BKH = 34, BF = new Uint8Array(BKW * BKH), BZ = new Float32Array(BKW * BKH);
  let BON = 0;
  DW.occReset = () => { OZ.fill(1e9); OC.fill(0); occOn = false; BF.fill(0); BON = 0; };
  /* is the screen rect (clamped to the frame) wholly behind the hero's covered blocks, at depths beyond zmin */
  function hidden(x0, y0, x1, y1, zmin) {
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > PW - 1) x1 = PW - 1; if (y1 > PH - 1) y1 = PH - 1;
    if (x0 > x1 || y0 > y1) return true;
    const a0 = (x0 | 0) >> 5, a1 = (x1 | 0) >> 5, b0 = (y0 | 0) >> 5, b1 = (y1 | 0) >> 5;
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const k = b * BKW + a; if (!BF[k] || zmin < BZ[k] + OTOL) return false; }
    return true;
  }
  function occ(x, y, z) {
    if (!occOn) return false;
    const t = ((y | 0) >> 2) * OW + ((x | 0) >> 2);
    return t >= 0 && t < OW * OH && OC[t] > 0 && z > OZ[t] + OTOL;
  }
  /* mark the tile under (x, y) and pad tiles round it as covered at depth z */
  function occMark(x, y, z, pad) {
    if (x < -8 || y < -8 || x >= PW + 8 || y >= PH + 8) return;
    const tx = (x | 0) >> 2, ty = (y | 0) >> 2; pad = pad | 0;
    for (let b = ty - pad; b <= ty + pad; b++) {
      if (b < 0 || b >= OH) continue;
      for (let a = tx - pad; a <= tx + pad; a++) { if (a < 0 || a >= OW) continue; const k = b * OW + a; if (z < OZ[k]) OZ[k] = z; if (!OC[k]) OC[k] = 3; }
    }
    occOn = true;
  }
  /* close the gaps between the hero's dots: an empty tile between two covered ones is covered too (twice) */
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
    // 32 px blocks wholly covered by the hero, with their farthest depth: the sea and the sky skip what lies behind
    BON = 0;
    for (let by = y0 >> 3; by <= y1 >> 3; by++) for (let bx = x0 >> 3; bx <= x1 >> 3; bx++) {
      const k = by * BKW + bx; let full = 1, zm = 0;
      for (let ty = by * 8, te = Math.min(OH, ty + 8); ty < te && full; ty++) for (let tx = bx * 8, r = ty * OW; tx < bx * 8 + 8; tx++) { const t = r + tx; if (!OC[t]) { full = 0; break; } if (OZ[t] > zm) zm = OZ[t]; }
      BF[k] = full; BZ[k] = zm; if (full) BON = 1;
    }
  };
  Object.assign(DW, { hput, put, dset, P3, P3v, hglow, occ, occMark });
  Object.defineProperty(DW, 'eye', { get: () => [E0, E1, E2] });

  /* ================= the hero ================= */
  const DDM = HD.destroyer();
  DW.DDM = DDM;
  const PN = DDM.parts.map(p => p.name), PID = {};
  PN.forEach((n, i) => { PID[n] = i; });
  DW.PID = PID;
  /* heat added to a whole part this frame (stage B: barrel heat, a hot hull section): DW.partHeat[DW.PID.ciwsA] */
  const PADD = DW.partHeat = new Float32Array(PN.length + 2);
  /* surface temperatures at night: steel near the air's temperature, warmer where machinery sits behind the plating,
     the uptakes and their mouths white-hot; surfaces open to the sky radiate and run cooler */
  const PH0 = { hull: .355, super: .375, mast: .28, arms: .3, spy: .44, stacks: .5, sps: .29, gun: .31, vlsF: .3, vlsA: .3, ciwsF: .3, ciwsA: .3, decoys: .29, boats: .27, hangar: .37, deck: .3, rails: .25 };
  const STZ = [2.2, -17.0];
  DW.STZ = STZ;
  /* ventilation exhausts on the superstructure's sides (z, y): small warm patches */
  const VENTS = [[12.5, 13.2], [20.5, 16.8], [4.4, 12.2], [-24.8, 12.4], [-31.5, 11.6], [-38.5, 11.8], [-43.5, 12.6]];
  const line = (v, per, w) => { const f = v / per - Math.floor(v / per), d = (f < .5 ? f : 1 - f) * per; return d < w ? 1 - d / w : 0; };
  function heatAt(name, x, y, z, nx, ny, nz, i) {
    let h = PH0[name] !== undefined ? PH0[name] : .33;
    const side = nx > .6 || nx < -.6;
    if (name === 'stacks') {
      const u = E.ss(10.5, 21.6, y);
      h = .5 + .5 * Math.pow(u, 1.3);
      // the combustion-air louvres high on the casing's sides draw in cold air
      if (side && y > 15.7 && y < 20.4) for (const zc of STZ) { const v = (z - (zc - 4.2)) / 8.4; if (v > .12 && v < .7) h -= .19; }
      if (y > 21.5) {
        h = .82;
        for (const zc of STZ) for (let s = -1; s <= 1; s += 2) {
          const dm = Math.hypot(x - s * .95, z - (zc - 2.9)); if (dm < .8) h = Math.max(h, y > 23.3 ? 1.16 : .98 + .12 * E.ss(22, 23.3, y));
          const dg = Math.hypot(x - s * 1.05, z - (zc + .95)); if (dg < .46) h = Math.max(h, y > 22.8 ? 1.04 : .9);
        }
      }
      return h + (hsh(i, 77) - .5) * .025;
    }
    // the two main engine rooms (two LM2500 each) under the uptakes warm the plating from inside
    const em = Math.min(1, Math.exp(-(((z - STZ[0] + 1.5) / 8.5) ** 2)) + Math.exp(-(((z - STZ[1] + 1.5) / 8.5) ** 2)));
    if (name === 'hull') {
      if (y > .9 && y < 7.2) h += .14 * em * E.ss(.9, 2.4, y);
      if (y < .9) h -= .04;
      // the transverse frames behind the plating (every 2.4 m) and the decks show as a faint grid
      if (side) h += .022 * line(z, 2.4, .2) + .018 * line(y - 2.8, 2.6, .16);
    } else if (name === 'super' || name === 'hangar') {
      if (y > 9) h += .07 * em * Math.exp(-((x / 6.5) ** 2));
      for (const zc of STZ) if (Math.abs(z - zc + 1) < 6 && Math.abs(x) < 4.2 && y < 14) h += .05 * E.ss(14, 10.5, y);
      if (side) {
        h += .016 * line(z, 2.4, .18) + .02 * line(y - 10.3, 2.8, .18);
        for (const v of VENTS) { const d = Math.hypot(z - v[0], y - v[1]); if (d < .6) h += .2 * (1 - d / .6); }
      }
      // the exhaust washes down over the roofs just aft of each stack
      if (ny > .7) for (const zc of STZ) if (z < zc - 3.5 && z > zc - 15 && Math.abs(x) < 5) h += .05 * (1 - (zc - 3.5 - z) / 11.5);
      // the bridge windows: glass mirrors the cold sky
      if (name === 'super' && y > 17.25 && y < 18.95 && z > 25.5 && ny < .5 && ny > -.5) h -= .13;
      // the hangar's doors are thin and uninsulated
      if (name === 'hangar' && nz < -.8) h -= .04;
    }
    h -= .055 * Math.max(0, ny);
    h += .015 * Math.max(0, -ny);
    return h + (hsh(i, 77) - .5) * .022;
  }
  const CELL = 6, SP_B = .24, SP_P = .11, SP_R = .045;
  let TG = 2.5;
  /* dense patches, cell-aligned: amidships (the stacks, the uptakes, the hull over the engine rooms, the hit) and aft
     (the hangar roof and the aft Phalanx) */
  const PATCH = [[-12, 0, -36, 12, 30, 12], [-12, 6, -60, 12, 30, -36]];
  const inPatch = (x, y, z) => { for (const b of PATCH) if (x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5]) return true; return false; };
  function primBox(pr) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const add = (p, r) => { for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[c] - r); mx[c] = Math.max(mx[c], p[c] + r); } };
    if (pr.p) pr.p.forEach(p => add(p, 0));
    else if (pr.t === 'lathe') { const rm = Math.max(...pr.st.map(s => s[1])); for (const s of pr.st) add(V.mad(pr.a, pr.d, s[0]), rm); }
    else if (pr.t === 'blades' && pr.c) add(pr.c, pr.r1 || 2);
    else return null;
    return [mn, mx];
  }
  const primNear = pr => {
    const b = primBox(pr); if (!b) return true;
    for (const P of PATCH) if (b[0][0] <= P[3] && b[1][0] >= P[0] && b[0][1] <= P[4] && b[1][1] >= P[1] && b[0][2] <= P[5] && b[1][2] >= P[2]) return true;
    return false;
  };
  function shuffle(A, seed) {
    const r = rng((seed >>> 0) || 1), n = A.length / 8;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1)); if (j === i) continue;
      const a = i * 8, b = j * 8;
      for (let c = 0; c < 8; c++) { const t = A[a + c]; A[a + c] = A[b + c]; A[b + c] = t; }
    }
    return A;
  }
  /* part-space points (stride 6) -> shuffled records (x y z nx ny nz heat part) */
  function recs(P, pid, seed) {
    const out = new Float32Array(P.length / 6 * 8);
    for (let j = 0, o = 0; j < P.length; j += 6, o += 8) {
      out[o] = P[j]; out[o + 1] = P[j + 1]; out[o + 2] = P[j + 2]; out[o + 3] = P[j + 3]; out[o + 4] = P[j + 4]; out[o + 5] = P[j + 5];
      out[o + 6] = heatAt(PN[pid], P[j], P[j + 1], P[j + 2], P[j + 3], P[j + 4], P[j + 5], j + seed); out[o + 7] = pid;
    }
    return shuffle(out, seed);
  }
  const bakeT0 = performance.now();
  const bins = new Map();
  function bin(lv, pid, P, seed, patchOnly) {
    for (let j = 0; j < P.length; j += 6) {
      const x = P[j], y = P[j + 1], z = P[j + 2];
      if (patchOnly && !inPatch(x, y, z)) continue;
      const key = (Math.floor(x / CELL) + 64) * 1e6 + (Math.floor(y / CELL) + 64) * 1e3 + (Math.floor(z / CELL) + 64);
      let b = bins.get(key); if (!b) { b = [[], []]; bins.set(key, b); }
      b[lv].push(x, y, z, P[j + 3], P[j + 4], P[j + 5], heatAt(PN[pid], x, y, z, P[j + 3], P[j + 4], P[j + 5], j + seed), pid);
    }
  }
  const RIGID = [];
  DDM.parts.forEach((part, pi) => {
    if (part.xf) return;
    bin(0, pi, GEO.sample({ parts: [part] }, SP_B, 21 + pi, {})[0].pts, pi * 7919);
    const prims = GEO.primsOf(part, {}).filter(pr => pr.pts !== false && primNear(pr));
    if (prims.length) bin(1, pi, GEO.sample({ parts: [{ name: part.name, label: part.label, prims }] }, SP_P, 91 + pi, {})[0].pts, pi * 104729 + 3, true);
  });
  const CELLS = [];
  for (const [key, b] of bins) {
    if (!b[0].length) continue;
    const L = b.map((a, lv) => a.length ? shuffle(new Float32Array(a), key * 3 + lv) : null);
    const P = L[0], n = P.length / 8;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < P.length; j += 8) { cx += P[j]; cy += P[j + 1]; cz += P[j + 2]; }
    cx /= n; cy /= n; cz /= n;
    let r = 0;
    for (const A of L) if (A) for (let j = 0; j < A.length; j += 8) r = Math.max(r, Math.hypot(A[j] - cx, A[j + 1] - cy, A[j + 2] - cz));
    CELLS.push({ c: [cx, cy, cz], r: r + .3, L, n: L.map(A => A ? A.length / 8 : 0) });
  }
  /* the rigid parts, in their own frames: the SPS-67, the gun, the two Phalanx mounts (split into the train base and
     the elevating mass, so the elevation can move without resampling) */
  DDM.parts.forEach((part, pi) => {
    if (!part.xf) return;
    const two = (prims, seed) => [SP_B, SP_R].map((sp, lv) => recs(GEO.sample({ parts: [{ name: part.name, prims }] }, sp, seed + lv, {})[0].pts, pi, seed * 31 + lv));
    if (part.name === 'ciwsA' || part.name === 'ciwsF') {
      const idx = part.name === 'ciwsA' ? 1 : 0;
      const pa = part.dyn({ ciwsPitch: [0, 0], ciwsSpin: 0 }), pb = part.dyn({ ciwsPitch: [.6, .6], ciwsSpin: 0 });
      let nb = 0; while (nb < pa.length && pa[nb] === pb[nb]) nb++;
      RIGID.push({ part, pid: pi, ciws: idx, base: two(pa.slice(0, nb), 300 + pi * 5), elev: two(pa.slice(nb), 400 + pi * 5) });
    } else RIGID.push({ part, pid: pi, lv: two(GEO.primsOf(part, {}), 500 + pi * 5) });
  });
  /* the Phalanx's elevation: about its trunnion, 1.55 m over the train base */
  const CIWS_TR = [0, 1.55, 0];
  DW.elevX = p => { const Rm = R.x(-p), ro = R.ap(Rm, CIWS_TR); return X.make(Rm, [CIWS_TR[0] - ro[0], CIWS_TR[1] - ro[1], CIWS_TR[2] - ro[2]]); };
  {
    // the split must reproduce the model's own muzzle
    const st = { ciwsYaw: [0, 1.1], ciwsPitch: [.35, .2] }, P = RIGID.find(r => r.ciws === 1);
    if (P) { const m = X.ap(X.mul(P.part.xf(st), DW.elevX(.2)), [0, 1.36, 2.12]), a = HD.destroyer.A.ciws(st, 1); if (V.dist(m, a) > .01) console.warn('pg_thermal: Phalanx elevation pivot differs from the model', m, a); }
  }
  DW.bakeMs = Math.round(performance.now() - bakeT0);
  DW.nPts = CELLS.reduce((s, c) => s + c.n[0] + c.n[1], 0);
  /* the hero's true bounds from its dots (for the identification box) */
  DW.BOUNDS = (() => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const c of CELLS) { const P = c.L[0]; for (let j = 0; j < P.length; j += 64) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[j + k]); mx[k] = Math.max(mx[k], P[j + k]); } } mn[1] = 0; return [mn, mx]; })();

  /* hot spots this frame (stage B, ship coords): [{p, r, h}] -> packed x y z r² 1/r² h */
  const HOT = new Float64Array(6 * 24); let NHOT = 0;
  const CHS = new Float64Array(6 * 24);
  DW.setHot = function (list) {
    NHOT = 0;
    for (const s of list || []) { if (NHOT >= 24) break; const o = NHOT * 6, r2 = Math.max(.01, s.r * s.r); HOT[o] = s.p[0]; HOT[o + 1] = s.p[1]; HOT[o + 2] = s.p[2]; HOT[o + 3] = r2; HOT[o + 4] = 1 / r2; HOT[o + 5] = s.h; NHOT++; }
  };
  let SDROP = 0, TAU_S = 1, PATH_S = 0, BX0 = 0, BX1 = 0, BY0 = 0, BY1 = 0;
  /* n records of P (optionally under the rigid transform M, t); writes the occlusion tiles */
  function drawRun(P, n, M, t, s, a, nh) {
    const e8 = n * 8;
    for (let j = 0; j < e8; j += 8) {
      let x = P[j], y = P[j + 1], z = P[j + 2], nx = P[j + 3], ny = P[j + 4], nz = P[j + 5];
      if (M) {
        const xx = M[0] * x + M[1] * y + M[2] * z + t[0], yy = M[3] * x + M[4] * y + M[5] * z + t[1], zz = M[6] * x + M[7] * y + M[8] * z + t[2];
        const a0 = M[0] * nx + M[1] * ny + M[2] * nz, a1 = M[3] * nx + M[4] * ny + M[5] * nz, a2 = M[6] * nx + M[7] * ny + M[8] * nz;
        x = xx; y = yy; z = zz; nx = a0; ny = a1; nz = a2;
      }
      const fac = nx * F0 + ny * F1 + nz * F2;
      if (fac > .2) continue;                                // the far side of a closed surface
      const dx = x - E0, dy = y - SDROP - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) continue;
      const k = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (zc < OZ[k]) OZ[k] = zc; OC[k] = 1;
      if (sx < BX0) BX0 = sx; if (sx > BX1) BX1 = sx; if (sy < BY0) BY0 = sy; if (sy > BY1) BY1 = sy;
      let h = P[j + 6] + PADD[P[j + 7]];
      for (let m = 0; m < nh; m += 6) { const ex = x - CHS[m], ey = y - CHS[m + 1], ez = z - CHS[m + 2], d2 = ex * ex + ey * ey + ez * ez; if (d2 < CHS[m + 3]) { const u = 1 - d2 * CHS[m + 4]; h += CHS[m + 5] * u * u; } }
      // seen edge-on a surface reflects more of the cold sky and reads cooler
      const g = (nx === 0 && ny === 0 && nz === 0) ? .5 : 1 - (fac < 0 ? -fac : fac);
      h -= (h - .09) * .36 * g * g * g;
      if (s === 1) dot1(sx, sy, h * TAU_S + PATH_S, a); else hput(sx, sy, s, h * TAU_S + PATH_S, a);
    }
  }
  const hotFor = (c, r) => {
    let nh = 0;
    for (let m = 0; m < NHOT; m++) {
      const o = m * 6, ex = c[0] - HOT[o], ey = c[1] - HOT[o + 1], ez = c[2] - HOT[o + 2], rr = Math.sqrt(HOT[o + 3]) + r;
      if (ex * ex + ey * ey + ez * ez < rr * rr) { for (let k = 0; k < 6; k++) CHS[nh + k] = HOT[o + k]; nh += 6; }
    }
    return nh;
  };
  /* is a sphere possibly on screen; returns its depth (or -1) */
  function sphereZ(c, r, drop) {
    const dx = c[0] - E0, dy = c[1] - drop - E1, dz = c[2] - E2, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < -r) return -1;
    if (zc > r * 1.5) {
      const xs = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, ys = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc, rp = FL * r / (zc - r) + 4;
      if (xs + rp < 0 || xs - rp > PW || ys + rp < 0 || ys - rp > PH) return -1;
    }
    return Math.max(1, zc);
  }
  DW.shipN = 0;
  const CZ = new Float64Array(CELLS.length);
  /* the dots drawShip would draw at the current TG (the cells' depths in CZ) */
  function shipEst() {
    let n = 0;
    for (let ci = 0; ci < CELLS.length; ci++) {
      const c = CELLS[ci], zc = CZ[ci]; if (zc < 0) continue;
      const pxm = FL / zc, spB = SP_B * pxm;
      if (c.L[1] && spB > TG * .8) {
        const w = E.ss(TG * .8, TG * 1.25, spB), spP = SP_P * pxm;
        n += c.n[0] * Math.min(1, (spB / TG) ** 2) * (1 - w) + c.n[1] * Math.min(1, (spP / TG) ** 2) * w;
      } else n += c.n[0] * Math.min(1, (spB / TG) ** 2);
    }
    return n;
  }
  /* the hero at state st, alpha a. Draw it first: it writes the occlusion the sea and the sky test. */
  DW.drawShip = function (T, st, a) {
    occOn = true;
    // in black-hot the hull is a dark shape: fewer, dimmer dots carry it
    TG = 2.5 * ((S.wipe >= 0 ? (S.wipe > .5 ? S.pol : S.from) : S.pol) ? DW.field.kShip : DW.field.wShip);
    const cd = Math.hypot(E0, E2);
    SDROP = cd * cd * IRE2;
    TAU_S = Math.exp(-cd / 28000); PATH_S = .25 * (1 - TAU_S);
    BX0 = BY0 = 1e9; BX1 = BY1 = -1e9;
    // a budget of dots for the hull: past it the spacing opens up evenly (the prefixes keep this continuous)
    for (let ci = 0; ci < CELLS.length; ci++) CZ[ci] = sphereZ(CELLS[ci].c, CELLS[ci].r, SDROP);
    for (let it = 0; it < 2; it++) { const n = shipEst(); if (n > DW.field.shipBudget) TG *= Math.sqrt(n / DW.field.shipBudget); }
    let cnt = 0;
    for (let ci = 0; ci < CELLS.length; ci++) {
      const c = CELLS[ci], zc = CZ[ci]; if (zc < 0) continue;
      const pxm = FL / zc, spB = SP_B * pxm, nh = hotFor(c.c, c.r);
      if (c.L[1] && spB > TG * .8) {
        const w = E.ss(TG * .8, TG * 1.25, spB), spP = SP_P * pxm;
        const fb = Math.min(1, (spB / TG) ** 2) * (1 - w), fp = Math.min(1, (spP / TG) ** 2) * w;
        const nb = Math.round(c.n[0] * fb), np = Math.round(c.n[1] * fp);
        if (nb) drawRun(c.L[0], nb, null, null, 1, a, nh);
        drawRun(c.L[1], np, null, null, spP > 4.2 ? 2 : 1, a, nh);
        cnt += nb + np;
      } else {
        const nb = Math.round(c.n[0] * Math.min(1, (spB / TG) ** 2));
        drawRun(c.L[0], nb, null, null, spB > 4.2 ? 2 : 1, a, nh);
        cnt += nb;
      }
    }
    for (const rg of RIGID) {
      const Xp = rg.part.xf(st), zc = sphereZ(Xp.T, 4, SDROP); if (zc < 0) continue;
      const pxm = FL / zc, spB = SP_B * pxm, spR = SP_R * pxm, w = E.ss(TG * .8, TG * 1.25, spB), nh = hotFor(Xp.T, 5);
      const lv = (C, M, t) => {
        const fb = Math.min(1, (spB / TG) ** 2) * (1 - w), fr = Math.min(1, (spR / TG) ** 2) * w;
        if (fb > .002) drawRun(C[0], Math.round(C[0].length / 8 * fb), M, t, 1, a, nh);
        if (fr > .002) drawRun(C[1], Math.round(C[1].length / 8 * fr), M, t, spR > 4.2 ? 2 : 1, a, nh);
      };
      if (rg.ciws !== undefined) {
        lv(rg.base, Xp.R, Xp.T);
        const Xe = X.mul(Xp, DW.elevX((st.ciwsPitch && st.ciwsPitch[rg.ciws] !== undefined) ? st.ciwsPitch[rg.ciws] : .35));
        lv(rg.elev, Xe.R, Xe.T);
      } else lv(rg.lv, Xp.R, Xp.T);
    }
    DW.shipN = cnt;
    DW.shipBox = BX1 > BX0 ? { x0: BX0, y0: BY0, x1: BX1, y1: BY1 } : null;
  };

  /* ---------- the exhaust: hot gas from the eight mouths (two LM2500 + a generator per side, per stack), rising on
     its own momentum, taken aft by the air past the ship and cooling as it mixes. Particles are keyed on their
     spawn index (rates are whole per film), so the plume is periodic in D. ---------- */
  const MOUTHS = [];
  for (const zc of STZ) for (let s = -1; s <= 1; s += 2) { MOUTHS.push([s * .95, 23.5, zc - 2.9, .6, 200, 1.15]); MOUTHS.push([s * 1.05, 22.95, zc + .95, .32, 70, 1.0]); }
  DW.MOUTHS = MOUTHS;
  const WREL = [-2.4, 0, -12.4];                     // the air past the ship: its own 16 kn and a breeze off the bow
  DW.WREL = WREL;
  const PLIFE = 8;
  /* the plume's functions of age, tabled (linear between entries): rise, drift, spread, the two cooling terms, fade */
  const XN = 2048, XK = XN / PLIFE, XR = new Float32Array(XN + 2), XW = new Float32Array(XN + 2), XS = new Float32Array(XN + 2), XE1 = new Float32Array(XN + 2), XE2 = new Float32Array(XN + 2), XF = new Float32Array(XN + 2);
  for (let i = 0; i <= XN + 1; i++) {
    const age = Math.min(PLIFE, i / XK);
    // the gas leaves the mouth at ~20 m/s, is bent over by the wind within a second, keeps rising on its heat
    XR[i] = 4.6 * (1 - Math.exp(-age / .5)) + 1.5 * age; XW[i] = age - .55 * (1 - Math.exp(-age / .55)); XS[i] = .72 * Math.pow(age, .85);
    XE1[i] = Math.exp(-age / .55); XE2[i] = .15 * Math.exp(-age / 2.5); XF[i] = Math.pow(1 - age / PLIFE, 1.3);
  }
  DW.drawExhaust = function (T, a) {
    if (a <= .01) return;
    const cd = Math.hypot(E0, E2), pxm = FL / Math.max(1, cd);
    const dot2 = pxm > 7 ? 2 : 1;
    for (let m = 0; m < MOUTHS.length; m++) {
      const M = MOUTHS[m], rate = M[4], N = rate * D;
      const k1 = Math.floor(T * rate), k0 = Math.ceil((T - PLIFE) * rate);
      for (let k = k0; k <= k1; k++) {
        const age = T - k / rate; if (age < 0 || age >= PLIFE) continue;
        const id = ((k % N) + N) % N, sd = m * 100003 + id * 3;
        const ax = age * XK, ai = ax | 0, af = ax - ai;
        const rise = XR[ai] + (XR[ai + 1] - XR[ai]) * af, wk = XW[ai] + (XW[ai + 1] - XW[ai]) * af;
        const sig = M[3] * .6 + XS[ai] + (XS[ai + 1] - XS[ai]) * af;
        const x = M[0] + WREL[0] * wk + GT[sd & GM] * sig, y = M[1] + rise + GT[(sd + 1) & GM] * sig * .7, z = M[2] + WREL[2] * wk + GT[(sd + 2) & GM] * sig;
        if (!P3(x, y, z)) continue;
        const h = .28 + (M[5] - .28) * (XE1[ai] + (XE1[ai + 1] - XE1[ai]) * af) + XE2[ai] + (XE2[ai + 1] - XE2[ai]) * af;
        const al = a * (XF[ai] + (XF[ai + 1] - XF[ai]) * af) * (.55 + .45 * GH[sd & GM]);
        // hot gas hides what is behind it; in black-hot this is what draws the plume dark against the field
        if (h > ((q.y < WIPEY ? S.pol : S.from) ? .31 : .42)) occMark(q.x, q.y, q.z, 0);
        hput(q.x, q.y, age < .9 ? dot2 : 1, h * TAU_S + PATH_S, al);
      }
      // the mouth: a white-hot disc, and the imager's bloom round it
      if (P3(M[0], M[1] + .2, M[2])) hglow(q.x, q.y, E.clamp(pxm * (m % 2 ? .8 : 1.3), 1.5, 26), 1.15, (m % 2 ? .2 : .34) * a);
    }
  };

  /* ---------- the wake: the Kelvin arms, the churned centre line, the bow wave (warmer water brought up) ---------- */
  DW.drawWake = function (T, a) {
    if (a <= .01) return;
    const flow = PG.VS * T, cd = Math.hypot(E0, E2), pxm = FL / Math.max(1, cd);
    // a fixed 1.5 m lattice riding the water (1 320 m per film: 880 rows), thinned by rank to ~2.4 px along the wake,
    // so zooming only ever adds dots
    const step = 1.5, per = 880, hl = 77.6, keep = Math.min(1, step * pxm * .86 / 2.4), keepC = Math.min(1, keep * 1.6);
    const off = flow % step, base = Math.floor(flow / step), TW = Math.tan(19.5 * DEG);
    for (let n = 0; n < 734; n++) {
      const dd = n * step + off, key = ((base - n) % per + per) % per;
      // churned water breaks up into warmer and cooler patches that stay with the water (whole waves per 1 320 m)
      const wph = TAU * key / per, patch = .62 + .38 * Math.sin(wph * 7 + 1.3) * Math.sin(wph * 17 + .4);
      const fa = a * Math.pow(1 - dd / 1100, 2.4) * patch;
      for (let sd = -1; sd <= 1; sd += 2) {
        if (hsh(key, sd + 11) >= keep) continue;
        const lat = sd * (7 + dd * TW) + (hsh(key, sd + 5) - .5) * 2.4;
        if (P3(lat, .3, -hl - dd) && !occ(q.x, q.y, q.z)) hput(q.x, q.y, 1, .24 + .11 * fa, fa * .85);
      }
      for (let m = 0; m < 4; m++) {
        if (hsh(key * 4 + m, 47) >= keepC) continue;
        const r = hsh(key * 4 + m, 41), lat = (r - .5) * (13 + dd * .06) * (.6 + .4 * hsh(key * 4 + m, 53));
        if (P3(lat, .3, -hl - dd) && !occ(q.x, q.y, q.z)) hput(q.x, q.y, 1, .29 + .14 * fa * (1 - 2 * Math.abs(r - .5)), fa * .85);
      }
    }
    for (let k = 0; k < 120; k++) { const sd = k & 1 ? 1 : -1, zz = 60 - (k >> 1) * 2.2, b = 10.2 + (60 - zz) * .01; if (P3(sd * b, .5 + .35 * Math.sin(k + T * TAU * 79 / D), zz) && !occ(q.x, q.y, q.z)) hput(q.x, q.y, 1, .27, a * .6); }
  };

  /* ================= the sea: a hierarchical lattice in the water's frame =================
     Root cells of S0 = 165 m (1 320 / 8: every level's cells divide the flow per film, and the hashes are keyed on the
     row index mod the rows per 1 320 m, so the sea at T = D is the sea at T = 0). A cell's point is kept by the child
     that contains it; the other three children bring new points. A cell whose area on screen holds q target spacings
     refines while q >= 4, fades its children's new points in over 1 < q < 4 and thins to q < 1 by rank: the density
     on screen is even (denser towards the horizon, where the far sea piles up into a bright band) and continuous
     through any zoom. */
  const S0 = 165, KMAX = 13;
  let FLOW = 0, TS = 0, RH = 20000, RH2 = 4e8, SEA_A = 1, SN = 0;
  DW.seaN = 0;
  /* the swell: three trains, whole cycles per film in time and whole waves per 1 320 m along the flow; sines tabled */
  const SLN = 4096, SLM = SLN - 1, SLQ = SLN / 4, SL = new Float32Array(SLN + SLQ + 1);
  for (let i = 0; i < SL.length; i++) SL[i] = Math.sin(i / SLN * TAU);
  const PK = SLN / TAU;
  const A1 = .72, KX1 = TAU / 470, KZ1 = TAU * 9 / 1320, W1 = TAU * 13 / D;
  const A2 = .38, KX2 = -TAU / 260, KZ2 = TAU * 14 / 1320, W2 = -TAU * 19 / D;
  const A3 = .15, KX3 = TAU / 95, KZ3 = TAU * 30 / 1320, W3 = TAU * 31 / D;
  const KX1P = KX1 * PK, KZ1P = KZ1 * PK, KX2P = KX2 * PK, KZ2P = KZ2 * PK, KX3P = KX3 * PK, KZ3P = KZ3 * PK;
  let PH1 = 0, PH2 = 0, PH3 = 0;
  /* the sea surface at hero-frame (x, z), film time T (for stage B: splashes, debris on the water) */
  DW.seaY = (x, z, T) => { const zs = z + PG.VS * T; return A1 * Math.sin(KX1 * x + KZ1 * zs + W1 * T) + A2 * Math.sin(KX2 * x + KZ2 * zs + W2 * T + 1.7) + A3 * Math.sin(KX3 * x + KZ3 * zs + W3 * T + 4.1); };
  /* transmission of the night air by range, 100 m steps */
  const TRL = new Float32Array(400); for (let i = 0; i < 400; i++) TRL[i] = Math.exp(-i * 100 / 28000);
  /* palette + noise + max blend of a 1 px heat dot at an on-screen (x, y); the spot meter. A white-hot dot near
     saturation spreads into its neighbours (the detector's blur round anything very hot) */
  function dot1(sx, sy, h, a) {
    if (h > SPOT.h && sx - SPX < SPR && SPX - sx < SPR && sy - SPY < SPR && SPY - sy < SPR && a > .45) SPOT.h = h;
    let i = (h * HK) | 0; if (i < 0) i = 0; else if (i >= NPAL) i = NPAL - 1;
    let v = (sy < WIPEY ? PALN[i] : PALO[i]) * a * NZ[nzi = (nzi + 1) & 4095];
    if (v > 1) v = 1;
    const G = (238 * v) | 0;
    if (G < 2) return;
    const k = (sy | 0) * PW + (sx | 0), col = 0xff000000 | (((228 * v) | 0) << 16) | (G << 8) | G;
    if (G > ((PU[k] >>> 8) & 255)) PU[k] = col;
    if (G > 205 && sx >= 1 && sy >= 1 && sx < PW - 1 && sy < PH - 1) {
      const g2 = ((G - 150) * 1.6) | 0, c2 = 0xff000000 | ((g2 * .96) << 16) | (g2 << 8) | g2;
      if (g2 > ((PU[k + 1] >>> 8) & 255)) PU[k + 1] = c2; if (g2 > ((PU[k - 1] >>> 8) & 255)) PU[k - 1] = c2;
      if (g2 > ((PU[k + PW] >>> 8) & 255)) PU[k + PW] = c2; if (g2 > ((PU[k - PW] >>> 8) & 255)) PU[k - PW] = c2;
    }
  }
  DW.dot1 = dot1;
  /* a dot of the sea / sky field: 1 px in white-hot; in black-hot a 2 px dot, so the cold field reads as a grey
     ground the warm shapes stand out of */
  let FS = 1, CLIP0 = 0, CLIP1 = 1080;
  function dotF(sx, sy, h, a) {
    if (FS === 1) { dot1(sx, sy, h, a); return; }
    let i = (h * HK) | 0; if (i < 0) i = 0; else if (i >= NPAL) i = NPAL - 1;
    let v = (sy < WIPEY ? PALN[i] : PALO[i]) * a * NZ[nzi = (nzi + 1) & 4095];
    if (v > 1) v = 1;
    const G = (238 * v) | 0;
    if (G < 2) return;
    const x = sx | 0, y = sy | 0;
    if (x >= PW - 1 || y >= PH - 1) return;
    const k = y * PW + x, col = 0xff000000 | (((228 * v) | 0) << 16) | (G << 8) | G;
    if (G > ((PU[k] >>> 8) & 255)) PU[k] = col; if (G > ((PU[k + 1] >>> 8) & 255)) PU[k + 1] = col;
    if (G > ((PU[k + PW] >>> 8) & 255)) PU[k + PW] = col; if (G > ((PU[k + PW + 1] >>> 8) & 255)) PU[k + PW + 1] = col;
  }
  /* the field's density and dot per polarity: black-hot packs the cold field closer (target spacing x FK) */
  DW.field = { kSea: 1, kSky: .6, kShip: 1.25, wSea: 1.12, wSky: 1.1, wShip: 1, shipBudget: 112000 };
  /* runs pass(y0, y1, mode) over the rows each polarity holds this frame (two bands while a wipe runs) */
  function byPolarity(pass) {
    if (WIPEY >= PH) pass(0, PH, S.pol);
    else if (WIPEY <= 0) pass(0, PH, S.from);
    else { pass(0, WIPEY, S.pol); pass(WIPEY, PH, S.from); }
    FS = 1; CLIP0 = 0; CLIP1 = PH;
  }
  const PT = new Float64Array(2);
  /* one sea dot at PT (sea frame), hash hv */
  function seaPoint(hv) {
    const xs = PT[0], zs = PT[1], z = zs - FLOW, dx = xs - E0, dz = z - E2, r2 = dx * dx + dz * dz;
    if (r2 > RH2) return;
    const ia = ((KX1P * xs + KZ1P * zs + PH1) | 0) & SLM, ib = ((KX2P * xs + KZ2P * zs + PH2) | 0) & SLM, ic = ((KX3P * xs + KZ3P * zs + PH3) | 0) & SLM;
    const dy = A1 * SL[ia] + A2 * SL[ib] + A3 * SL[ic] - r2 * IRE2 - E1, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < NEAR) return;
    const iz = FL / zc, sx = CX + (dx * R0 + dy * R1 + dz * R2) * iz, sy = CY - (dx * U0 + dy * U1 + dz * U2) * iz;
    if (sx < 0 || sy < CLIP0 || sx >= PW || sy >= CLIP1) return;
    if (occOn) { const t = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (OC[t] && zc > OZ[t] + OTOL) return; }
    const r = Math.sqrt(r2), ir = 1 / r;
    // the slope along the line of sight: a face rising away from the lens faces it (more emissive, warmer); at grazing
    // angles the backs of the waves hide behind the crests in front, and the faces streak the far sea
    const ca = A1 * SL[ia + SLQ], cb = A2 * SL[ib + SLQ], cc = A3 * SL[ic + SLQ];
    let ratio = ((ca * KX1 + cb * KX2 + cc * KX3) * dx + (ca * KZ1 + cb * KZ2 + cc * KZ3) * dz) * ir / (E1 * ir + .0032);
    if (ratio < -1.3) return;
    if (ratio > 1.7) ratio = 1.7;
    let h = .205 + .07 * (r > 1500 ? (r > 17000 ? 1 : (r - 1500) / 15500) : 0) + .05 * ratio + ((Math.imul(hv, 0x9E3779B1) >>> 24) / 256 - .5) * .045;
    // the hero's wake: warmer water churned up from below
    if (z < -60 && z > -1250) { const wd = -60 - z, hw = 13 + wd * .085, ax = xs < 0 ? -xs : xs; if (ax < hw) h += .13 * (1 - wd / 1190) * (1 - ax / hw); }
    const tr = TRL[(r * .01) | 0]; h = h * tr + .29 * (1 - tr);
    SN++;
    dotF(sx, sy, h, SEA_A);
  }
  /* the point born in sea cell (k, i, j): CPF = its position (sea frame); returns its 30-bit hash (x jitter in bits
     0-10, z jitter 11-21, rank 22-29). Only small integers cross the recursion (no boxed doubles). */
  const CPF = new Float64Array(2), SZ = new Float64Array(24);
  for (let k = 0; k < 24; k++) SZ[k] = S0 / Math.pow(2, k);
  function cellPt(k, i, j) {
    const jm = j & ((8 << k) - 1);
    let h = Math.imul(i ^ Math.imul(k + 1, 0x27d4eb2d), 0x9E3779B1) ^ Math.imul(jm + Math.imul(k, 0x165667b1), 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    h = h >>> 2;
    const s = SZ[k];
    CPF[0] = (i + ((h & 2047) + .5) / 2048) * s; CPF[1] = (j + (((h >>> 11) & 2047) + .5) / 2048) * s;
    return h;
  }
  /* a sea cell (corner x0, z0 in the hero frame, side s) on screen: 0 off, 1 partly, 2 wholly inside. Its corners
     are affine in camera space (the earth's drop taken at the cell's centre), so four divisions settle it. */
  function cellClass(x0, z0, s) {
    const dx = x0 - E0, dz = z0 - E2, hc = s * .5, dy = -((dx + hc) * (dx + hc) + (dz + hc) * (dz + hc)) * IRE2 - E1;
    const cx0 = dx * R0 + dy * R1 + dz * R2, cy0 = dx * U0 + dy * U1 + dz * U2, cz0 = dx * F0 + dy * F1 + dz * F2;
    const ax = s * R0, ay = s * U0, az = s * F0, bx = s * R2, by = s * U2, bz = s * F2;
    let l = 0, rr = 0, t = 0, b = 0, n = 0, ins = 0;
    for (let c = 0; c < 4; c++) {
      const u = c & 1, v = c >> 1, zc = cz0 + u * az + v * bz;
      if (zc < NEAR) { n++; continue; }
      const iz = FL / zc, sx = CX + (cx0 + u * ax + v * bx) * iz, sy = CY - (cy0 + u * ay + v * by) * iz;
      if (sx < -36) l++; else if (sx > PW + 36) rr++;
      if (sy < CLIP0 - 36) t++; else if (sy > CLIP1 + 36) b++;
      if (sx >= 8 && sx < PW - 8 && sy >= CLIP0 + 8 && sy < CLIP1 - 8) ins++;
    }
    if (n === 4) return 0;
    if (n > 0) return 1;
    if (l === 4 || rr === 4 || t === 4 || b === 4) return 0;
    return ins === 4 ? 2 : 1;
  }
  let TGN = 5.4, TGD = 2.7, RHA = 9000, RHB = 19000;
  /* sea cell (k, i, j) whose point was born in cell (kb, ib, jb); inside: the cell is wholly on screen */
  function seaVisit(k, i, j, kb, ib, jb, inside) {
    const s = SZ[k], x0 = i * s, z0 = j * s - FLOW;
    const cx = x0 + s * .5 - E0, cz = z0 + s * .5 - E2, rc = Math.sqrt(cx * cx + cz * cz);
    if (rc - s * .71 > RH) return;
    if (!inside || BON) {
      // first the cell's bounding sphere (swell included) on screen: one division settles most cells; only those
      // across the frame's edge take the exact corner test
      const r = s * .71 + 1.5, dy = -rc * rc * IRE2 - E1, zc = cx * F0 + dy * F1 + cz * F2;
      let done = 0;
      if (zc - r > NEAR) {
        const iz = FL / zc, sx = CX + (cx * R0 + dy * R1 + cz * R2) * iz, sy = CY - (cx * U0 + dy * U1 + cz * U2) * iz, rp = r * FL / (zc - r) + 2;
        // wholly behind the hero
        if (BON && hidden(sx - rp, sy - rp, sx + rp, sy + rp, zc - r)) return;
        if (inside) done = 1;
        else if (sx + rp < -36 || sx - rp > PW + 36 || sy + rp < CLIP0 - 36 || sy - rp > CLIP1 + 36) return;
        else if (sx - rp >= 8 && sx + rp < PW - 8 && sy - rp >= CLIP0 + 8 && sy + rp < CLIP1 - 8) { inside = 1; done = 1; }
      }
      if (!done) { const c = cellClass(x0, z0, s); if (c === 0) return; inside = c === 2 ? 1 : 0; }
    }
    const rr = rc > s * .5 ? rc : s * .5, g = E1 / rr - rr * IRE2;
    let u = (rc - RHA) / (RHB - RHA); u = u < 0 ? 0 : u > 1 ? 1 : u;
    const tg = TGN - TGD * u * u * (3 - 2 * u);
    const q = g > 0 ? FL * FL * s * s * g / (rr * rr * tg * tg) : 0;
    const hv = cellPt(kb, ib, jb), px = CPF[0], pz = CPF[1];
    const hs = s * .5, ci = px >= x0 + hs ? 1 : 0, cj = pz >= j * s + hs ? 1 : 0;
    if (q >= 4 && k < KMAX) {
      for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
        const ii = i * 2 + a, jj = j * 2 + b;
        if (a === ci && b === cj) seaVisit(k + 1, ii, jj, kb, ib, jb, inside);
        else seaVisit(k + 1, ii, jj, k + 1, ii, jj, inside);
      }
      return;
    }
    if (q > 1) {
      PT[0] = px; PT[1] = pz; seaPoint(hv);
      if (k >= KMAX) return;
      const w = (q - 1) / 3 * 256;
      for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
        if (a === ci && b === cj) continue;
        const hc = cellPt(k + 1, i * 2 + a, j * 2 + b);
        if ((hc >>> 22) < w) { PT[0] = CPF[0]; PT[1] = CPF[1]; seaPoint(hc); }
      }
      return;
    }
    if ((hv >>> 22) < q * 256) { PT[0] = px; PT[1] = pz; seaPoint(hv); }
  }
  DW._dbg = { cellClass, seaVisit, cellPt, seaPoint };
  DW.drawSea = function (T, a) {
    if (a <= .01) return;
    TS = T; FLOW = PG.VS * T; SEA_A = a; RH = Math.sqrt(2 * PG.RE * Math.max(1, E1)); RH2 = RH * RH;
    RHA = RH * .42; RHB = RH * .985;
    PH1 = W1 * T * PK; PH2 = (W2 * T + 1.7) * PK; PH3 = (W3 * T + 4.1) * PK;
    SN = 0;
    byPolarity(seaPass);
    DW.seaN = SN;
  };
  function seaPass(ya, yb, mode) {
    CLIP0 = ya; CLIP1 = yb; FS = mode ? 2 : 1;
    const kf = mode ? DW.field.kSea : DW.field.wSea; TGN = 5.4 * kf; TGD = 2.7 * kf;
    // the patch of sea the band can see: rays through its border, clamped at the horizon
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let m = 0; m < 32; m++) {
      const e = m >> 3, u = (m & 7) / 7, sx = e === 0 ? u * PW : e === 1 ? PW : e === 2 ? (1 - u) * PW : 0, sy = e === 0 ? yb : e === 1 ? yb + (ya - yb) * u : e === 2 ? ya : ya + (yb - ya) * u;
      const ax = (sx - CX) / FL, ay = (sy - CY) / FL;
      const dx = F0 + ax * R0 - ay * U0, dy = F1 + ax * R1 - ay * U1, dz = F2 + ax * R2 - ay * U2, hz = Math.hypot(dx, dz);
      if (hz < 1e-6) continue;
      let r = dy < 0 ? E1 / -dy * hz : RH; if (r > RH) r = RH;
      const px = E0 + dx / hz * r, pz = E2 + dz / hz * r;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
    }
    if (x0 > x1) return;
    const i0 = Math.floor(x0 / S0) - 1, i1 = Math.floor(x1 / S0) + 1, j0 = Math.floor((z0 + FLOW) / S0) - 1, j1 = Math.floor((z1 + FLOW) / S0) + 1;
    // blocks of 8 x 8 roots are culled whole first: a narrow lens on the horizon sees a thin wedge of a large box
    const SB = S0 * 8;
    for (let jb = Math.floor(j0 / 8); jb <= Math.floor(j1 / 8); jb++) for (let ib = Math.floor(i0 / 8); ib <= Math.floor(i1 / 8); ib++) {
      const bx = ib * SB, bz = jb * SB - FLOW, bcx = bx + SB * .5 - E0, bcz = bz + SB * .5 - E2;
      if (Math.sqrt(bcx * bcx + bcz * bcz) - SB * .71 > RH) continue;
      const c = cellClass(bx, bz, SB); if (c === 0) continue;
      const ja = Math.max(j0, jb * 8), jz = Math.min(j1, jb * 8 + 7), ia = Math.max(i0, ib * 8), iz = Math.min(i1, ib * 8 + 7);
      for (let j = ja; j <= jz; j++) for (let i = ia; i <= iz; i++) seaVisit(0, i, j, 0, i, j, c === 2 ? 1 : 0);
    }
  }

  /* ================= the sky: a hierarchical lattice in azimuth x elevation (dots at infinity) =================
     Cold and dark at elevation, a warm band over the horizon (denser there too), low cloud a little warmer than the
     clear sky and denser in dots, so its texture reads in either polarity. */
  const SK0 = TAU / 128;
  let AZ0 = 0, AZ1 = 0, EL0 = 0, EL1 = 0, DIP = 0, SKY_A = 1, SKN = 0, BANDK = 2.2;
  DW.skyN = 0;
  /* the cloud deck: 3D value noise on a circle in azimuth (periodic), stretched into rows */
  const CLW = 1024, CLH = 96, CLE0 = -.02, CLE1 = .42, CLOUD = new Float32Array(CLW * CLH);
  for (let jj = 0; jj < CLH; jj++) for (let ii = 0; ii < CLW; ii++) {
    const az = ii / CLW * TAU, el = CLE0 + (CLE1 - CLE0) * jj / (CLH - 1);
    // a broken stratocumulus deck: cells ~1-2° across, flattened by the grazing view into streets along the horizon
    const f = M3.fbm(Math.cos(az) * 5.2, Math.sin(az) * 5.2, el * 34 + 3.3, 3) * .55 + M3.fbm(Math.cos(az) * 26, Math.sin(az) * 26, el * 95 + 7.1, 4) + .4 * M3.fbm(Math.cos(az) * 70, Math.sin(az) * 70, el * 240 + 1.9, 2);
    CLOUD[jj * CLW + ii] = E.ss(-.06, .38, f) * E.ss(-.02, .012, el);
  }
  function cloudAt(az, el) {
    let u = az / TAU * CLW; u -= Math.floor(u / CLW) * CLW;
    let v = (el - CLE0) / (CLE1 - CLE0) * (CLH - 1); v = v < 0 ? 0 : v > CLH - 1.001 ? CLH - 1.001 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, i2 = (i + 1) % CLW;
    const a = CLOUD[j * CLW + i], b = CLOUD[j * CLW + i2], c = CLOUD[(j + 1) * CLW + i], d = CLOUD[(j + 1) * CLW + i2];
    return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
  }
  DW.cloudAt = cloudAt;
  /* elevation profiles (above the horizon, rad), tabled: the warm air mass low down, the horizon glow, the band */
  const EXN = 4096, EXE = .6, EXK = (EXN - 1) / EXE, EX1 = new Float32Array(EXN), EX2 = new Float32Array(EXN), EXB = new Float32Array(EXN);
  for (let i = 0; i < EXN; i++) { const e = i / EXK; EX1[i] = Math.exp(-e / .05); EX2[i] = Math.exp(-e / .006); EXB[i] = Math.exp(-e / .02); }
  /* a node's frame (NF: az, el, sin az, cos az, sin el, cos el of its centre): its few points take a first-order
     direction from it (error < 0.01 px). Positions travel in typed scratch, hashes as 30-bit integers. */
  const NF = new Float64Array(7), SPF = new Float64Array(2), SKZ = new Float64Array(26);
  for (let k = 0; k < 26; k++) SKZ[k] = SK0 / Math.pow(2, k);
  function skyDot(hv) {
    const az = SPF[0], el = SPF[1];
    if (el < -DIP) return;
    let ex = (el + DIP) * EXK; if (ex > EXN - 2) ex = EXN - 2;
    const ei = ex | 0, ef = ex - ei, band = EXB[ei] + (EXB[ei + 1] - EXB[ei]) * ef, cl = NF[6];
    const da = az - NF[0], de = el - NF[1], NSA = NF[2], NCA = NF[3], NSE = NF[4], NCE = NF[5];
    const sa = NSA + NCA * da, ca = NCA - NSA * da, se = NSE + NCE * de, ce = NCE - NSE * de;
    const dx = sa * ce, dy = se, dz = ca * ce, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < .05) return;
    const iz = FL / zc, sx = CX + (dx * R0 + dy * R1 + dz * R2) * iz, sy = CY - (dx * U0 + dy * U1 + dz * U2) * iz;
    if (sx < 0 || sy < CLIP0 || sx >= PW || sy >= CLIP1) return;
    if (occOn) { const t = ((sy | 0) >> 2) * OW + ((sx | 0) >> 2); if (OC[t]) return; }
    const h = .03 + .21 * (EX1[ei] + (EX1[ei + 1] - EX1[ei]) * ef) + .06 * (EX2[ei] + (EX2[ei + 1] - EX2[ei]) * ef) + .19 * cl * (1 - .6 * band) + ((Math.imul(hv, 0x9E3779B1) >>> 24) / 256 - .5) * .025;
    SKN++;
    dotF(sx, sy, h, SKY_A);
  }
  /* the point born in sky cell (k, i, j): SPF = (az, el); returns its 30-bit hash */
  function skyPt(k, i, j) {
    const im = i & ((128 << k) - 1);
    let h = Math.imul(im ^ Math.imul(k + 7, 0x27d4eb2d), 0x85EBCA77) ^ Math.imul(j + Math.imul(k, 0x165667b1) + 0x5bd1e995, 0x9E3779B1);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    h = h >>> 2;
    const s = SKZ[k];
    SPF[0] = (i + ((h & 2047) + .5) / 2048) * s; SPF[1] = (j + (((h >>> 11) & 2047) + .5) / 2048) * s;
    return h;
  }
  /* sine by table, linear between entries (error ~1e-7 rad, far under a pixel at the longest focal length) */
  const TSN = 16384, TSK = TSN / TAU, TST = new Float64Array(TSN + 1), HPI = Math.PI / 2;
  for (let i = 0; i <= TSN; i++) TST[i] = Math.sin(i / TSK);
  const tsin = a => { let x = a * TSK; x -= Math.floor(x / TSN) * TSN; const i = x | 0; return TST[i] + (TST[i + 1] - TST[i]) * (x - i); };
  function skyVisit(k, i, j, kb, ib, jb) {
    const s = SKZ[k];
    if ((i + 1) * s < AZ0 || i * s > AZ1 || (j + 1) * s < EL0 || j * s > EL1) return;
    if (BON) {
      // a node wholly behind the hero (the sky is at infinity: any covered block hides it)
      const ca = (i + .5) * s, ce = (j + .5) * s, sa = tsin(ca), co = tsin(ca + HPI), se = tsin(ce), cc = tsin(ce + HPI);
      const dx = sa * cc, dy = se, dz = co * cc, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc > .5) {
        const iz = FL / zc, sx = CX + (dx * R0 + dy * R1 + dz * R2) * iz, sy = CY - (dx * U0 + dy * U1 + dz * U2) * iz, hw = s * .58 * iz + 3;
        if (hidden(sx - hw, sy - hw, sx + hw, sy + hw, 1e9)) return;
      }
    }
    // the wanted spacing: sparse in the clear sky, closer in cloud, close in the band over the horizon
    const e = (j + .5) * s + DIP, cl = cloudAt((i + .5) * s, (j + .5) * s);
    let ex = (e > 0 ? e : 0) * EXK * BANDK; if (ex > EXN - 1) ex = EXN - 1;
    const tv = (12 - (FS === 2 ? 2.5 : 6.8) * cl) * SKK, tg = tv - (tv - 2.9) * EXB[ex | 0], q = (s * FL / tg) * (s * FL / tg);
    const hv = skyPt(kb, ib, jb), pa = SPF[0], pe = SPF[1];
    const hs = s * .5, ci = pa >= i * s + hs ? 1 : 0, cj = pe >= j * s + hs ? 1 : 0;
    if (q >= 4 && k < 22) {
      for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
        const ii = i * 2 + a, jj = j * 2 + b;
        if (a === ci && b === cj) skyVisit(k + 1, ii, jj, kb, ib, jb);
        else skyVisit(k + 1, ii, jj, k + 1, ii, jj);
      }
      return;
    }
    const az = (i + .5) * s, el = (j + .5) * s;
    NF[0] = az; NF[1] = el; NF[2] = tsin(az); NF[3] = tsin(az + HPI); NF[4] = tsin(el); NF[5] = tsin(el + HPI);
    NF[6] = cl;
    if (q <= 1) { if ((hv >>> 22) < q * 256) { SPF[0] = pa; SPF[1] = pe; skyDot(hv); } return; }
    SPF[0] = pa; SPF[1] = pe; skyDot(hv);
    const w = (q - 1) / 3 * 256;
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
      if (a === ci && b === cj) continue;
      const hc = skyPt(k + 1, i * 2 + a, j * 2 + b);
      if ((hc >>> 22) < w) skyDot(hc);
    }
  }
  DW.drawSky = function (a) {
    if (a <= .01) return;
    SKY_A = a; SKN = 0;
    // the dense band over the horizon: ~.009 rad in a wide lens, never more than ~46 px deep
    BANDK = .02 / Math.min(.009, 46 / FL);
    DIP = Math.sqrt(2 * Math.max(1, E1) / PG.RE);
    byPolarity(skyPass);
    DW.skyN = SKN;
  };
  let SKK = 1;
  function skyPass(ya, yb, mode) {
    CLIP0 = ya; CLIP1 = yb; FS = mode ? 2 : 1; SKK = mode ? DW.field.kSky : DW.field.wSky;
    const yaw = Math.atan2(F0, F2), pitch = Math.asin(E.clamp(F1, -1, 1));
    const aL = Math.atan(CX / FL), aR = Math.atan((PW - CX) / FL), eU = Math.atan((CY - ya) / FL), eD = Math.atan((yb - CY) / FL);
    // rows map to elevations exactly only on the vertical through the boresight: pad the band
    const pad = .004 + .03 * (aL + aR) * Math.abs(Math.sin(pitch));
    EL0 = Math.max(-DIP, pitch - eD * 1.04 - pad); EL1 = pitch + eU * 1.04 + pad;
    if (EL1 <= EL0) return;
    const cm = Math.cos(Math.min(1.2, Math.max(Math.abs(EL0), Math.abs(EL1))));
    AZ0 = yaw - (aL * 1.06 + .002) / cm; AZ1 = yaw + (aR * 1.06 + .002) / cm;
    const i0 = Math.floor(AZ0 / SK0), i1 = Math.floor(AZ1 / SK0), j0 = Math.floor(EL0 / SK0), j1 = Math.floor(EL1 / SK0);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) skyVisit(0, i, j, 0, i, j);
  }

  /* ================= the rounds ================= */
  const OM = HD.oniks(), ONST = { wing: 1, fin: 1, booster: false, cover: false }, OSKIP = { booster: 1, cover: 1 };
  /* at Mach 2 the skin runs ~200 °C, the nose and the leading edges hotter, the ramjet's nozzle white-hot */
  const ONH = { body: .7, intake: .9, wings: .74, fins: .74, nozzle: 1.1 };
  const RLV = [.03, .08, .2, .5].map((sp, lv) => {
    const out = [];
    for (const s of GEO.sample(OM, sp, 60 + lv, ONST)) {
      if (!s.pts.length || OSKIP[s.name]) continue;
      const Tp = s.part.xf ? s.part.xf(ONST) : null, P = s.pts;
      for (let j = 0; j < P.length; j += 6) {
        let p = [P[j], P[j + 1], P[j + 2]], n = [P[j + 3], P[j + 4], P[j + 5]];
        if (Tp) { p = X.ap(Tp, p); n = X.dir(Tp, n); }
        const h = (ONH[s.name] || .72) + (s.name === 'body' ? .12 * E.ss(1.5, 4.3, p[2]) + .2 * E.ss(-3.6, -4.4, p[2]) : 0);
        out.push(p[0], p[1], p[2], n[0], n[1], n[2], h);
      }
    }
    return { sp, pts: new Float32Array(out) };
  });
  const NOZ = (HD.oniks && HD.oniks.NOZZLE) || [0, 0, -4.45];
  const hiddenAt = rH => rH > RH ? (rH - RH) * (rH - RH) * IRE2 : -1e9;       // height hidden by the sea's bulge
  DW.hiddenAt = (x, z) => { const rH = Math.hypot(x - E0, z - E2), rh = Math.sqrt(2 * PG.RE * Math.max(1, E1)); return rH > rh ? (rH - rh) * (rH - rh) * IRE2 : -1e9; };
  let HID = 0;
  function drawRoundPts(P, M, t, a, s, tr, pr) {
    for (let j = 0, n = P.length; j < n; j += 7) {
      const px = P[j], py = P[j + 1], pz = P[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      if (y < HID) continue;
      const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5];
      const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
      const fac = wx * F0 + wy * F1 + wz * F2;
      if (fac > .25) continue;
      if (!P3(x, y, z)) continue;
      occMark(q.x, q.y, q.z, 0);
      hput(q.x, q.y, s, P[j + 6] * tr + pr, a);
    }
  }
  /* round k (RO from PG.round): the body, the ramjet plume; returns {x0, y0, x1, y1} on screen or null */
  DW.drawRound = function (k, T, RO, a) {
    if (a <= .01) return null;
    const c = RO.p, rH = Math.hypot(c[0] - E0, c[2] - E2), dist = Math.hypot(rH, c[1] - E1);
    RH = Math.sqrt(2 * PG.RE * Math.max(1, E1));
    HID = hiddenAt(rH);
    if (c[1] + 1 < HID) return null;
    const tr = Math.exp(-dist / 28000), pr = .25 * (1 - tr), pxm = FL / Math.max(1, dist);
    const Xf = X.make(R.look(RO.dir, [0, 1, 0]), c);
    let box = null;
    if (8.9 * pxm < 4) {
      if (P3(c[0], c[1], c[2])) {
        occMark(q.x, q.y, q.z, 1);
        hput(q.x, q.y, 2, 1.12 * tr + pr, a);
        hglow(q.x, q.y, 6.5, 1.1 * tr + pr, .5 * a);
        box = { x0: q.x - 2, y0: q.y - 2, x1: q.x + 2, y1: q.y + 2 };
      }
    } else {
      let L = RLV[RLV.length - 1];
      for (let j = RLV.length - 1; j >= 0; j--) { L = RLV[j]; if (RLV[j].sp * pxm < 2.2) break; }
      const sp = L.sp * pxm;
      drawRoundPts(L.pts, Xf.R, Xf.T, a, sp > 3.2 ? 2 : 1, tr, pr);
      const b = boxOf(Xf, [-.9, -.75, -4.45], [.9, .75, 4.45]);
      if (b) box = { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
    }
    drawPlume(k, T, Xf, a, pxm, tr, pr);
    return box;
  };
  function boxOf(Xf, mn, mx) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let c = 0; c < 8; c++) { const p = X.ap(Xf, [c & 1 ? mx[0] : mn[0], c & 2 ? mx[1] : mn[1], c & 4 ? mx[2] : mn[2]]); if (!P3(p[0], p[1], p[2])) return null; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return [x0, y0, x1, y1];
  }
  DW.boxOf = boxOf;
  /* the ramjet's jet: a white-hot core leaving the nozzle, shock diamonds for ~4 m, cooling over ~16 m */
  function drawPlume(k, T, Xf, a, pxm, tr, pr) {
    const fr = Math.floor(T * 60), M = Xf.R, n0 = X.ap(Xf, NOZ), ax = [-M[2], -M[5], -M[8]], ux = [M[0], M[3], M[6]], uy = [M[1], M[4], M[7]];
    if (n0[1] < HID) return;
    if (pxm * 8 < 2) { if (P3(n0[0], n0[1], n0[2])) { occMark(q.x, q.y, q.z, 1); hput(q.x, q.y, 2, 1.2 * tr + pr, a); hglow(q.x, q.y, 6.5, 1.15 * tr + pr, .45 * a); } return; }
    const N = Math.min(700, Math.round(60 + pxm * 60));
    for (let i = 0; i < N; i++) {
      const u = hsh(i + k * 977, fr), v = hsh(i + 131, fr + k * 3), w = hsh(i + 71, 5 + k);
      const s = 16 * Math.pow(u, 1.8), rad = (.1 + .035 * s) * Math.sqrt(v) * (s < .3 ? 1.6 : 1), th = TAU * w + fr * .7;
      const cx = Math.cos(th) * rad, cy = Math.sin(th) * rad;
      const x = n0[0] + ax[0] * s + ux[0] * cx + uy[0] * cy, y = n0[1] + ax[1] * s + ux[1] * cx + uy[1] * cy, z = n0[2] + ax[2] * s + ux[2] * cx + uy[2] * cy;
      if (y < HID || !P3(x, y, z)) continue;
      const dia = s < 5 ? Math.pow(.5 + .5 * Math.cos(TAU * s / .75), 6) * (1 - s / 5) : 0;
      const hot = Math.exp(-s / 1.7), h = .45 + .75 * hot + .3 * dia;
      if (h > .6) occMark(q.x, q.y, q.z, 0);
      hput(q.x, q.y, pxm > 40 ? 2 : 1, h * tr + pr, a * Math.min(1, 1.15 - s / 16));
    }
    if (P3(n0[0], n0[1], n0[2])) hglow(q.x, q.y, Math.min(40, 3 + pxm * 1.1), 1.15 * tr + pr, .3 * a);
  }
  /* the warm trail: the jet's gas cooling and spreading behind the round over ~0.7 s (~500 m) */
  const TP = [0, 0, 0], TRO = {};
  DW.drawTrail = function (k, T, a) {
    if (a <= .01) return;
    const tS = PG.tStop[k], t1 = Math.min(T, tS);
    PG.round(k, t1, TRO);
    const c = TRO.p, dist = Math.max(50, Math.hypot(c[0] - E0, c[1] - E1, c[2] - E2)), pxm = FL / dist;
    RH = Math.sqrt(2 * PG.RE * Math.max(1, E1));
    const dur = .75, N = E.clamp(Math.round(dur * PG.VR * pxm / 3), 16, 320);
    const tr = Math.exp(-dist / 28000), pr = .25 * (1 - tr);
    for (let j = 1; j <= N; j++) {
      const tp = t1 - j * dur / N, age = T - tp;
      if (age > dur + .6) break;
      PG.relPos(k, tp, TP);
      const sd = (k * 7919 + Math.round(tp * 400) * 3) & GM, sig = .35 + 2.4 * Math.sqrt(age);
      const x = TP[0] + GT[sd] * sig, y = TP[1] + GT[(sd + 1) & GM] * sig * .6 + .8 * age, z = TP[2] + GT[(sd + 2) & GM] * sig;
      const rH = Math.hypot(x - E0, z - E2);
      if (y < hiddenAt(rH) || !P3(x, y, z)) continue;
      const h = .3 + .5 * Math.exp(-age / .16) + .12 * Math.exp(-age / .7);
      const al = a * Math.pow(Math.max(0, 1 - age / (dur + .6)), 1.4);
      if (h > ((q.y < WIPEY ? S.pol : S.from) ? .31 : .4)) occMark(q.x, q.y, q.z, 0);
      hput(q.x, q.y, 1, h * tr + pr, al);
    }
  };

  /* ---------- the interceptors' flight paths: plain dotted lines, flown portion only, in the own-force lime (an
     overlay, not through the palette, so they read in either polarity); stage B flies the missiles on them. */
  const SP = [0, 0, 0];
  DW.drawShotPath = function (s, T, a) {
    if (T < s.tL || a <= .01) return;
    const fade = T > s.tEnd ? 1 - E.sat((T - s.tEnd) / 9) : 1; if (fade <= 0) return;
    const sl = PG.shotSl(s, Math.min(T, s.tEnd)), L = s.L + 1200, al = .8 * a * fade, GAP = 5;
    // a fixed grid along the path, fine at the cell (the vertical is ~1% of the length), a dot every GAP px of
    // screen distance counted from the cell, so the dots stay put as the flown portion grows
    let acc = GAP, px = 0, py = 0, ok = false;
    for (let k = 0; k <= 200; k++) {
      let u = k / 200, at = L * u * u, last = false;
      if (at >= sl) { at = sl; last = true; }
      PG.shotPath(s, at, SP);
      if (!P3(SP[0], SP[1], SP[2])) { ok = false; if (last) break; continue; }
      const x = q.x, y = q.y;
      if (ok) {
        const dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
        let t = GAP - acc;
        for (; t <= d; t += GAP) { const f = t / d; dset(px + dx * f, py + dy * f, 2, PG.LIME, al); }
        acc = d - (t - GAP);
      } else dset(x, y, 2, PG.LIME, al);
      px = x; py = y; ok = true;
      if (last) break;
    }
  };

  /* ---------- the sensor's grain, and a veil for the glare of something very hot (stage B) ---------- */
  DW.drawGrain = function (fr, k) {
    if (k <= .01) return;
    for (let i = 0; i < 2600; i++) {
      const x = (hsh(i, fr) * PW) | 0, y = (hsh(i + 50000, fr) * PH) | 0, v = (.025 + .045 * hsh(i + 90000, fr)) * k;
      const G = (238 * v) | 0, k2 = y * PW + x;
      if (G > ((PU[k2] >>> 8) & 255)) PU[k2] = 0xff000000 | (((228 * v) | 0) << 16) | (G << 8) | G;
    }
  };
  DW.drawGlare = function (g) {
    if (g <= .003) return;
    const d = D8, n = PW * PH;
    for (let j = 0; j < PH; j++) {
      const bh = (j < WIPEY ? S.pol : S.from) === 1, r0 = j * PW * 4, r1 = r0 + PW * 4;
      if (bh) { const f = 1 - g; for (let k = r0; k < r1; k += 4) { d[k] *= f; d[k + 1] *= f; d[k + 2] *= f; } }
      else { const v = 238 * g; for (let k = r0; k < r1; k += 4) { d[k] += v; d[k + 1] += v; d[k + 2] += v * .96; } }
    }
    return n;
  };

  /* the first moment a round shows over the imager's horizon */
  {
    const EY = [0, 0, 0], RO = {};
    let t = 30;
    for (; t < 70; t += .05) {
      PG.eye(t, EY); const rh = Math.sqrt(2 * PG.RE * EY[1]);
      let seen = false;
      for (let k = 0; k < 4; k++) { PG.round(k, t, RO); const rH = Math.hypot(RO.p[0] - EY[0], RO.p[2] - EY[2]); if (RO.p[1] > (rH > rh ? (rH - rh) * (rH - rh) * IRE2 : -1)) seen = true; }
      if (seen) break;
    }
    PG.EV.detect = +t.toFixed(2);
  }
})();
