/* ANATOMY · BATTERY (Point Cloud C): the world around the battery, as point sets.
   World frame: metres, origin on the battery pad (seed-1337 base_km), X east, Y up (0 = pad level),
   Z north. The real DEM with the Anatomy film's bluff and ravine shaping at true vertical scale.
   The coast is kept as a polar lattice about the pad (cells growing with range), so the search
   radar's beam can redraw it bearing by bearing. */
(function () {
  const { V, E, rng, fbm, noise } = M3;
  const T = THEATRE;
  const BX = T.base_km[0] * 1000, BZ = T.base_km[1] * 1000;

  /* ---------- terrain (the Anatomy film's DEM shaping, VE 1) ---------- */
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
  const H_PAD = PADS[0].h, SEA_Y = -H_PAD;
  const groundY = (x, z) => Math.max(0, hDem(x + BX, z + BZ)) - H_PAD;
  const L = V.norm([-.55, .5, .66]);                        // low moon

  /* ---------- the coast as a polar lattice about the pad ----------
     CO: x, y, z, brightness, kind (0 land, 1 sea, 2 waterline), jitter */
  const R0 = 104, R1 = 3300;
  const COa = [];
  const hW = (x, z) => hDem(x + BX, z + BZ);
  { const r0 = rng(1337);
    for (let r = R0; r < R1; ) {
      const dr = 5.2 + r * .0105, n = Math.floor(2 * Math.PI * r / dr), ph = r0() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = ph + i / n * 6.283, rr = r + (r0() - .5) * dr * .7, aa = a + (r0() - .5) / n * 4;
        const x = Math.sin(aa) * rr, z = Math.cos(aa) * rr, h = hW(x, z);
        if (h > 0) {
          const e = Math.max(3, dr * .5), gx = (Math.max(0, hW(x + e, z)) - h) / e, gz = (Math.max(0, hW(x, z + e)) - h) / e;
          const nn = V.norm([-gx, 1, -gz]), sh = Math.max(0, V.dot(nn, L)), steep = 1 - nn[1];
          const hv = h / 10, band = hv - Math.floor(hv) < .1 ? .14 : 0;
          COa.push(x, h - H_PAD, z, Math.min(1.15, .12 + .8 * Math.pow(sh, 1.4) + band + .5 * steep), 0, r0());
        } else if (r0() < .3) COa.push(x, SEA_Y, z, .22 + .2 * r0(), 1, r0());
      }
      r += dr;
    }
    // the waterline, marched out along fixed bearings and refined where the height changes sign
    for (let k = 0; k < 1500; k++) {
      const a = k / 1500 * 6.283, s = Math.sin(a), c = Math.cos(a);
      let hp = hW(s * R0, c * R0), rp = R0;
      for (let r = R0 + 10; r < R1; r += 10) {
        const h = hW(s * r, c * r);
        if ((h > 0) !== (hp > 0)) {
          let lo = rp, hi = r, hl = hp;
          for (let it = 0; it < 5; it++) { const m = (lo + hi) / 2, hm = hW(s * m, c * m); if ((hm > 0) === (hl > 0)) { lo = m; hl = hm; } else hi = m; }
          const q = (lo + hi) / 2; COa.push(s * q, SEA_Y + .8, c * q, 1, 2, r0());
        }
        hp = h; rp = r;
      }
    }
  }
  const CO = new Float32Array(COa), NCO = CO.length / 6;

  /* the battery's own ring scan (the Strike menu's ground): rings about the pad centre, plus scatter */
  const RGa = [];
  { const rr = rng(77);
    for (let r = 3.2; r < 100; r *= 1.085) {
      const step = Math.min(1.2, .16 + r * .011), n = Math.floor(2 * Math.PI * r / step), ph = rr() * 6.28;
      for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, q = r + (rr() - .5) * .05 * r * .1; RGa.push(Math.sin(a) * q, Math.cos(a) * q, q, rr()); }
    }
    for (let i = 0; i < 16000; i++) { const q = 5 + Math.pow(rr(), 1.5) * 95, a = rr() * 6.283; RGa.push(Math.sin(a) * q, Math.cos(a) * q, q, rr()); }
  }
  const RG = new Float32Array(RGa), NRG = RG.length / 4;

  /* the chart we already had: the game map's own coast and isobaths, dotted, out to the horizon */
  const PRa = [];
  for (const [lv, al, step] of [['0', .9, 40], ['-40', .35, 90], ['-100', .2, 160], ['60', .3, 90], ['140', .25, 120]]) {
    const y = +lv > 0 ? shape(+lv) - H_PAD : SEA_Y;
    for (const poly of T.contours[lv]) for (let k = 0; k < poly.length - 1; k++) {
      const a = poly[k], b = poly[k + 1];
      if (a[0] < -60 || a[0] > 90 || a[1] < -20 || a[1] > 90) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000; if (len > 6000) continue;
      const n = Math.max(1, Math.round(len / step));
      for (let m = 0; m < n; m++) {
        const x = (a[0] + (b[0] - a[0]) * m / n) * 1000 - BX, z = (a[1] + (b[1] - a[1]) * m / n) * 1000 - BZ;
        if (Math.hypot(x, z) < R1 + 150) continue;                // inside the lattice the beam draws it
        PRa.push(x, y, z, al);
      }
    }
  }
  const PR = new Float32Array(PRa), NPR = PR.length / 4;

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

  window.WORLD = { H_PAD, SEA_Y, groundY, hDem, L, CO, NCO, R0, R1, RG, NRG, PR, NPR, ST, NST };
})();
