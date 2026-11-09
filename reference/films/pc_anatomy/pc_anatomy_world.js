/* ANATOMY (Point Cloud C): the world around the battery, as point sets.
   World frame: metres, origin at TEL 1 on the battery pad (seed-1337 base_km),
   X east, Y up (0 = pad level), Z north. Terrain is the real DEM with the
   Coastline menu's bluff and ravine detail at true vertical scale. */
(function () {
  const { V, E, rng, fbm, noise } = M3;
  const T = THEATRE;
  const BX = T.base_km[0] * 1000, BZ = T.base_km[1] * 1000;

  /* ---------- terrain (p3's DEM shaping, VE 1) ---------- */
  const shape = h => h <= 0 ? h : 56 * (1 - Math.exp(-h / 4.5)) + .62 * h;
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function hBase(x, z) {
    const xk = x / 1000, zk = z / 1000;
    let h = T.h(xk, zk) + 14 * fbm(xk * .5 + 11.3, zk * .5 - 3.7, .5, 3) + 4 * noise(xk * 2.1 + 5, zk * 2.1, 2.2);
    const w = xk + 1.7 * fbm(zk * .3 + 2, xk * .05, 4.2, 2), per = 4.7, q = w / per, id = Math.floor(q);
    const dxv = Math.abs(q - id - .5) * per, wid = .55 + .35 * hash(id);
    const cut = Math.max(0, 1 - dxv / wid);
    const deep = (45 + 45 * hash(id + 9)) * E.ss(-12, -1.2, zk) * (hash(id + 3) < .85 ? 1 : 0);
    const gul = Math.max(0, 1 - Math.abs(fbm(xk * 1.9 + 7, zk * .7, 5.5, 2)) * 9) * E.ss(-9, -2, zk);
    h -= (deep * cut * Math.sqrt(cut) + 22 * gul * gul) * E.ss(4, 40, h + 20);
    if (h <= 0) return h;
    const land = E.ss(0, 26, h);
    const rg = Math.max(0, 1 - Math.abs(fbm(xk * .45 + 3.1, zk * .45 + 9.4, 1.7, 3) * 2.2));
    // metre-scale roughness the 1 km DEM cannot carry: scrub, rocks, tracks
    return shape(h) + land * (30 * rg * rg * rg + 5 * fbm(xk * 3.6, zk * 3.6, 3.3, 2) + 1.3 * fbm(xk * 40, zk * 40, 1.1, 2));
  }
  const PADS = [[T.base_km[0], T.base_km[1], .56], [T.pantsirs_km[0][0], T.pantsirs_km[0][1], .24]]
    .map(([x, z, r]) => ({ x: x * 1000, z: z * 1000, r0: r * 1000, r1: r * 2100 }));
  for (const p of PADS) p.h = hBase(p.x, p.z);
  function hDem(x, z) {
    let h = hBase(x, z);
    for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r1) h += (p.h - h) * E.ss(p.r1, p.r0, d); }
    return h;
  }
  const H_PAD = PADS[0].h;
  const SEA_Y = -H_PAD;
  /* world height of the ground (sea surface = SEA_Y) */
  const groundY = (x, z) => Math.max(0, hDem(x + BX, z + BZ)) - H_PAD;

  /* ---------- flight frame: survey lines cross the launch azimuth ---------- */
  const AZ = 20 * Math.PI / 180;
  const AH = [Math.sin(AZ), 0, Math.cos(AZ)], CH = [Math.cos(AZ), 0, -Math.sin(AZ)];
  const toW = (a, c) => [AH[0] * a + CH[0] * c, 0, AH[2] * a + CH[2] * c];

  /* survey grid: line i at along-track a, points across; heights cached for Yat() */
  const SA0 = -900, SA1 = 3200, DA = 11, SC0 = -1500, SC1 = 1500, DC = 7.5;
  const NLi = Math.round((SA1 - SA0) / DA) + 1, NJ = Math.round((SC1 - SC0) / DC) + 1;
  const HG = new Float32Array(NLi * NJ);
  for (let i = 0; i < NLi; i++) for (let j = 0; j < NJ; j++) { const w = toW(SA0 + i * DA, SC0 + j * DC); HG[i * NJ + j] = hDem(w[0] + BX, w[2] + BZ); }
  const Hg = (i, j) => { i = i < 0 ? 0 : i >= NLi ? NLi - 1 : i; j = j < 0 ? 0 : j >= NJ ? NJ - 1 : j; return HG[i * NJ + j]; };
  /* ground height by bilinear lookup in the grid (fast; falls back to the DEM outside) */
  function Yat(x, z) {
    const a = x * AH[0] + z * AH[2], c = x * CH[0] + z * CH[2];
    const fi = (a - SA0) / DA, fj = (c - SC0) / DC;
    if (fi < 0 || fj < 0 || fi >= NLi - 1 || fj >= NJ - 1) return groundY(x, z);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const h = (Hg(i, j) * (1 - v) + Hg(i, j + 1) * v) * (1 - u) + (Hg(i + 1, j) * (1 - v) + Hg(i + 1, j + 1) * v) * u;
    return Math.max(0, h) - H_PAD;
  }

  /* survey points: land nodes lit by a low moon, faces hung down steep steps, sparse sea speckle.
     SV: x, y, z, brightness, along-track a, jitter, kind (0 land, 1 sea, 2 waterline) */
  const L = V.norm([-.55, .5, .66]);
  const SVa = [];
  const r0 = rng(1337);
  const shade = (i, j) => {
    const y = Math.max(0, Hg(i, j)), gx = (Math.max(0, Hg(i + 1, j)) - Math.max(0, Hg(i - 1, j))) / (2 * DA), gz = (Math.max(0, Hg(i, j + 1)) - Math.max(0, Hg(i, j - 1))) / (2 * DC);
    // gradient in (a, c) -> world normal
    const n = V.norm([-(gx * AH[0] + gz * CH[0]), 1, -(gx * AH[2] + gz * CH[2])]), sh = Math.max(0, V.dot(n, L));
    const hv = y / 10, band = hv - Math.floor(hv) < .1 ? .16 : 0;
    return .12 + .8 * Math.pow(sh, 1.4) + band;
  };
  for (let i = 0; i < NLi; i++) {
    const a = SA0 + i * DA;
    for (let j = 0; j < NJ; j++) {
      const c = SC0 + j * DC + (r0() - .5) * DC * .7, aa = a + (r0() - .5) * DA * .6, w = toW(aa, c);
      if (Math.hypot(w[0], w[2]) < 96) continue;              // the battery's own ring scan covers the pad
      const h = HG[i * NJ + j];
      if (h > 0) {
        const y = h - H_PAD;
        SVa.push(w[0], y, w[2], Math.min(1.1, shade(i, j) + .05 * r0()), aa, r0(), 0);
        const h2 = Math.max(0, Hg(i + 1, j)), dy = h - h2;
        if (Math.abs(dy) > 9) {
          const n = Math.min(10, Math.floor(Math.abs(dy) / 4)), lit = .14 + .6 * Math.max(0, (dy > 0 ? 1 : -1) * -V.dot(AH, L));
          for (let m = 1; m <= n; m++) { const f = m / (n + 1), ww = toW(aa + DA * f, c + (r0() - .5) * 4); SVa.push(ww[0], y + (h2 - h) * f, ww[2], lit + .12 * r0(), aa + DA * f, r0(), 0); }
        }
      } else if (r0() < .1) SVa.push(w[0], SEA_Y, w[2], .25 + .2 * r0(), aa, r0(), 1);
    }
    // waterline crossings along this line, stitched finely
    for (let j = 0; j < NJ - 1; j++) {
      const h0 = HG[i * NJ + j], h1 = HG[i * NJ + j + 1];
      if ((h0 > 0) !== (h1 > 0)) {
        const c = SC0 + (j + h0 / (h0 - h1)) * DC;
        for (let k = 0; k < 3; k++) { const w = toW(a + (k - 1) * DA / 3, c); SVa.push(w[0], SEA_Y + 1, w[2], 1, a, r0(), 2); }
      }
    }
  }
  const SV = new Float32Array(SVa), NSV = SV.length / 7;

  /* the battery's own ring scan (the Strike menu's ground): rings about TEL 1, plus scatter */
  const RGa = [];
  { const rr = rng(77);
    for (let r = 3.2; r < 100; r *= 1.085) {
      const step = Math.min(1.2, .16 + r * .011), n = Math.floor(2 * Math.PI * r / step), ph = rr() * 6.28;
      for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, q = r + (rr() - .5) * .05 * r * .1; RGa.push(Math.sin(a) * q, Math.cos(a) * q, q, rr()); }
    }
    for (let i = 0; i < 16000; i++) { const q = 5 + Math.pow(rr(), 1.5) * 95, a = rr() * 6.283; RGa.push(Math.sin(a) * q, Math.cos(a) * q, q, rr()); }
  }
  const RG = new Float32Array(RGa), NRG = RG.length / 4;
  const RGy = new Float32Array(NRG);
  for (let k = 0; k < NRG; k++) { const x = RG[k * 4], z = RG[k * 4 + 1]; RGy[k] = Math.min(0, Yat(x, z)) + .06 * noise(x * .3, z * .3); }

  /* the chart we already had: the game map's own coast and isobaths, dotted, out to the horizon */
  const PRa = [];
  for (const [lv, al, step] of [['0', .9, 40], ['-40', .35, 90], ['-100', .2, 160], ['60', .3, 90], ['140', .25, 120]]) {
    const y = +lv > 0 ? shape(+lv) - H_PAD : SEA_Y;
    for (const poly of T.contours[lv]) for (let k = 0; k < poly.length - 1; k++) {
      const a = poly[k], b = poly[k + 1];
      if (a[0] < -60 || a[0] > 90 || a[1] < -20 || a[1] > 90) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000; if (len > 6000) continue;
      const n = Math.max(1, Math.round(len / step));
      for (let m = 0; m < n; m++) PRa.push((a[0] + (b[0] - a[0]) * m / n) * 1000 - BX, y, (a[1] + (b[1] - a[1]) * m / n) * 1000 - BZ, al);
    }
  }
  const PR = new Float32Array(PRa), NPR = PR.length / 4;

  /* sea returns (the Clutter menu's texture seen from above): cells grow with range from the flight line.
     SE: x, z, clutter brightness, wind-row phase, bearing from the search radar */
  const RADX = T.player_radars_km[0][0] * 1000 - BX, RADZ = T.player_radars_km[0][1] * 1000 - BZ;
  const WIND = -28 * Math.PI / 180;
  const SEa = [];
  { const rs = rng(2402);
    for (let a = 1500; a < 42000; a += 9 + a * .0105) {
      const half = 700 + a * .45, step = 9 + a * .0105;
      for (let c = -half; c < half; c += step * (1 + Math.abs(c) / 9000)) {
        const aa = a + (rs() - .5) * step * .8, cc = c + (rs() - .5) * step * .8, w = toW(aa, cc);
        if (T.h((w[0] + BX) / 1000, (w[2] + BZ) / 1000) > -2) continue;
        const u = w[0] * Math.sin(WIND) + w[2] * Math.cos(WIND), v = w[0] * Math.cos(WIND) - w[2] * Math.sin(WIND);
        const tex = Math.exp(1.4 * fbm(u * .00014 * 3, v * .0007, 3.7, 3) - .25);
        SEa.push(w[0], w[2], Math.min(1.4, .22 * tex + .06 * rs()), 2 * Math.PI * u / 2200, Math.atan2(w[0] - RADX, w[2] - RADZ));
      }
    }
  }
  const SE = new Float32Array(SEa), NSE = SE.length / 5;

  /* stars */
  const STa = [];
  { const rs = rng(9);
    for (let i = 0; i < 2600; i++) {
      const u = rs(), az = rs() * Math.PI * 2, el = Math.asin(Math.pow(u, 1.4)) * .98 + .01;
      const m = Math.pow(rs(), 3.2);
      STa.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az), .12 + .75 * m, rs() * 6.28);
    }
  }
  const ST = new Float32Array(STa), NST = ST.length / 5;

  window.WORLD = { H_PAD, SEA_Y, groundY, Yat, hDem, AZ, AH, CH, toW, SV, NSV, RG, RGy, NRG, PR, NPR, SE, NSE, ST, NST, RADX, RADZ, L };
})();
