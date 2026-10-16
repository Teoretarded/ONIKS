/* THE PICTURE: the coast (from the Coastline menu). The chart we already had (the game map's own
   contours, dotted) until a LiDAR scan line sweeps south across the real seed-1337 coast ahead of
   the camera and materialises it: bluff faces, ravines, the waterline in lime, the battery pad. */
(function () {
  const { V, E, rng } = M3;
  const PA = window.PA, hsh = PA.hsh, TH = THEATRE;
  const { GX0, GZ0, GS, GNX, GNZ, HG } = PA;
  const VE = PA.VE;
  PA.SCAN = { t0: 83.6, t1: 96.8, zA: 2560, zB: -4200 };
  const SC = PA.SCAN;
  const frontZ = T => SC.zA - (SC.zA - SC.zB) * E.clamp((T - SC.t0) / (SC.t1 - SC.t0), 0, 1);
  PA.frontZ = frontZ;
  const I0 = Math.round((-9400 - GX0) / GS), I1 = Math.round((9400 - GX0) / GS);
  const Yg = (i, j) => { i = i < 0 ? 0 : i >= GNX ? GNX - 1 : i; j = j < 0 ? 0 : j >= GNZ ? GNZ - 1 : j; const h = HG[j * GNX + i]; return h > 0 ? h * VE : 0; };
  const L = V.norm([.3, .62, .72]);
  const shade = (i, j) => {
    const y = Yg(i, j), gx = (Yg(i + 1, j) - Yg(i - 1, j)) / (2 * GS), gz = (Yg(i, j + 1) - Yg(i, j - 1)) / (2 * GS);
    const n = V.norm([-gx, 1, -gz]), sh = Math.max(0, V.dot(n, L));
    const lap = (Yg(i - 1, j) + Yg(i + 1, j) - 2 * y) / (GS * GS) + (Yg(i, j + 1) + Yg(i, j - 1) - 2 * y) / (GS * GS);
    const hv = y / VE / 20, band = hv - Math.floor(hv) < .12 ? .2 : 0;
    return .05 + .8 * Math.pow(sh, 2.2) + .12 * Math.min(1, y / 400) + E.clamp(-lap * 500, 0, .35) + band;
  };
  /* rows of constant z (the scan line is E-W), nearest-first order is not needed: rows are cheap to skip */
  const r0 = rng(1337);
  const PX = [], PY = [], PZ = [], PB = [], PSea = [], PJ = [], RS = new Int32Array(GNZ + 1);
  for (let j = GNZ - 1, n = 0; j >= 0; j--) {
    RS[GNZ - 1 - j] = PX.length;
    const z = GZ0 + j * GS;
    for (let i = I0; i < I1; i++) {
      const h = HG[j * GNX + i], x = GX0 + i * GS, jx = (r0() - .5) * GS * .6, jz = (r0() - .5) * GS * .5;
      if (h > 0) {
        const y = h * VE, b = shade(i, j) + .05 * r0();
        PX.push(x + jx); PY.push(y); PZ.push(z + jz); PB.push(Math.min(1.1, b)); PSea.push(0); PJ.push(r0());
        // steep step to the next row: hang returns down the face so the bluff reads as a wall
        const y2 = Yg(i, j + 1), dy = y - y2;
        if (Math.abs(dy) > 22) {
          const m = Math.min(14, Math.floor(Math.abs(dy) / 9)), fn = dy > 0 ? 1 : -1, lit = Math.max(0, fn * L[2]) * .95 + .12;
          for (let k = 1; k <= m; k++) { const f = k / (m + 1); PX.push(x + (r0() - .5) * GS * .7); PY.push(y + (y2 - y) * f); PZ.push(z + GS * f); PB.push(Math.min(1.1, lit + .15 * r0())); PSea.push(0); PJ.push(r0()); }
        }
      } else if (r0() < .2) { PX.push(x + (r0() - .5) * GS); PY.push(0); PZ.push(z + (r0() - .5) * GS); PB.push(.28 + .22 * r0()); PSea.push(1); PJ.push(r0()); }
    }
  }
  RS[GNZ] = PX.length;
  const NP = PX.length;
  const Px = new Float64Array(PX), Py = new Float32Array(PY), Pz = new Float64Array(PZ), Pb = new Float32Array(PB), Ps = new Uint8Array(PSea), Pj = new Float32Array(PJ);
  const rowZ = k => GZ0 + (GNZ - 1 - k) * GS;
  const rowT = k => { const z = rowZ(k); return z > SC.zA ? SC.t0 : z < SC.zB ? 1e9 : SC.t0 + (SC.zA - z) / (SC.zA - SC.zB) * (SC.t1 - SC.t0); };

  /* waterline: sign changes along each row, stitched to the next row */
  const cross = [];
  for (let j = 0; j < GNZ; j++) {
    const cs = [];
    for (let i = I0; i < I1 - 1; i++) { const a = HG[j * GNX + i], b = HG[j * GNX + i + 1]; if ((a > 0) !== (b > 0)) cs.push(GX0 + (i + a / (a - b)) * GS); }
    cross.push(cs);
  }
  const CXa = [], CZa = [], CTa = [];
  for (let j = GNZ - 1; j > 0; j--) {
    const z0 = GZ0 + j * GS, z1 = z0 - GS;
    for (const xa of cross[j]) {
      let best = null; for (const xb of cross[j - 1]) if (Math.abs(xb - xa) < 160 && (best === null || Math.abs(xb - xa) < Math.abs(best - xa))) best = xb;
      if (best === null) continue;
      const n = Math.max(2, Math.round(Math.hypot(GS, best - xa) / 14));
      for (let k = 0; k < n; k++) { const zz = z0 + (z1 - z0) * k / n; CXa.push(xa + (best - xa) * k / n); CZa.push(zz); }
    }
  }
  const Cx = new Float64Array(CXa), Cz = new Float64Array(CZa);

  /* the chart: the game map's contours, dotted, out to the horizon */
  const PRa = [];
  const shapeL = h => h <= 0 ? h : 56 * (1 - Math.exp(-h / 4.5)) + .62 * h;
  for (const [lv, al, step] of [['0', .8, 70], ['60', .5, 90], ['140', .5, 90], ['220', .4, 110], ['-40', .3, 110], ['-100', .16, 160]]) {
    const y = +lv > 0 ? shapeL(+lv) * VE : 0;
    for (const poly of TH.contours[lv]) for (let k = 0; k < poly.length - 1; k++) {
      const a = poly[k], b = poly[k + 1];
      if (a[0] < -40 || a[0] > 40 || a[1] < -30 || a[1] > 40) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000, n = Math.max(1, Math.round(len / step));
      if (len > 6000) continue;
      for (let m = 0; m < n; m++) PRa.push((a[0] + (b[0] - a[0]) * m / n) * 1000, y, (a[1] + (b[1] - a[1]) * m / n) * 1000, al);
    }
  }
  const PR = new Float64Array(PRa);
  /* open water beyond the survey: faint speckle riding the swell */
  const SFa = [];
  { const rs = rng(4242); for (let k = 0; k < 9000; k++) { const x = -30000 + rs() * 60000, z = 1200 + Math.pow(rs(), .8) * 30000; if (TH.h(x / 1000, z / 1000) > -8) continue; SFa.push(x, z, .5 + .5 * rs()); } }
  const SF = new Float64Array(SFa);

  const SITE = PA.SITE, BASE = { x: SITE.x, z: SITE.z, gy: PA.PADY, r: 420 };
  BASE.ring = []; { const n = Math.round(BASE.r * 6.2832 / 12); for (let k = 0; k < n; k++) { const a = k / n * 6.2832, x = BASE.x + Math.sin(a) * BASE.r, z = BASE.z + Math.cos(a) * BASE.r; BASE.ring.push([x, PA.gy(x, z) + 3, z]); } }
  BASE.lt = SC.t0 + (SC.zA - BASE.z) / (SC.zA - SC.zB) * (SC.t1 - SC.t0);

  /* o: { a (all), chart, scanOn } */
  PA.coast = function (pb, cam, T, o) {
    const out = { tags: [], shown: 0 };
    const a = o.a; if (a <= .003) return out;
    const e = cam.eye, f = cam.f, rr = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const e0 = e[0], e1 = e[1], e2 = e[2], f0 = f[0], f1 = f[1], f2 = f[2], r0x = rr[0], r1 = rr[1], r2 = rr[2], u0 = u[0], u1 = u[1], u2 = u[2];
    const fz = frontZ(T), scanning = T >= SC.t0 && T <= SC.t1, started = T >= SC.t0;
    const sw = T * .9, near = o.near || 30, LIME = PA.LIME;
    // chart where the survey has not replaced it yet
    const pa = a * o.chart * .95;
    if (pa > .003) for (let k = 0; k < PR.length; k += 4) {
      const x = PR[k], z = PR[k + 2];
      if (started && z > fz && x > -9400 && x < 9400 && z > GZ0 && z < SC.zA + 200) continue;
      const dx = x - e0, dy = PR[k + 1] - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < 200) continue;
      const sx = cx + F * (dx * r0x + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      pb.dot(sx, sy, 1, 238, 238, 228, pa * PR[k + 3] * (zc < 40000 ? 1 - zc / 60000 : .33));
    }
    const sfa = a * o.chart * .3;
    if (sfa > .003) for (let k = 0; k < SF.length; k += 3) {
      const x = SF[k], z = SF[k + 1];
      if (started && z < SC.zA && x > -9400 && x < 9400) continue;
      const y = 6 * (Math.sin(x * .0021 + z * .0013 + sw) * .6 + Math.sin(x * .0009 - z * .0031 + sw * .7) * .4);
      const dx = x - e0, dy = y - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < 200) continue;
      const sx = cx + F * (dx * r0x + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      pb.dot(sx, sy, 1, 238, 238, 228, sfa * SF[k + 2] * (.7 + .5 * Math.sin(x * .004 + z * .002 - sw * 1.7)));
    }
    // survey rows; distant rows thinned
    let shown = 0;
    if (started) for (let k = 0; k < GNZ; k++) {
      const rt = rowT(k); if (T < rt) continue;
      const z = rowZ(k), dzr = Math.abs(z - e2), dist = Math.hypot(dzr, e1);
      const s = dist < 4500 ? 1 : dist < 9000 ? 2 : dist < 15000 ? 3 : 4;
      if (k % s) continue;
      const age0 = T - rt, bs = s > 1 ? 1.12 : 1;
      for (let q = RS[k], q1 = RS[k + 1]; q < q1; q += s) {
        const age = age0 - Pj[q] * .05; if (age < 0) continue;
        const x = Px[q], zz = Pz[q], sea = Ps[q] === 1;
        const y = sea ? 5 * (Math.sin(x * .0021 + zz * .0013 + sw) * .6 + Math.sin(x * .0009 - zz * .0031 + sw * .7) * .4) : Py[q];
        const dx = x - e0, dy = y - e1, dz = zz - e2, zc = dx * f0 + dy * f1 + dz * f2;
        if (zc < near) continue;
        const sx = cx + F * (dx * r0x + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
        if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
        let b = Pb[q] * bs * 1.45 * (zc < 6000 ? 1.1 - zc / 60000 : 1.2 - zc / 12000 < .35 ? .35 : 1.2 - zc / 12000);
        if (sea) b *= .5 + .3 * Math.sin(x * .004 + zz * .002 - sw * 1.7);
        b *= a;
        const big = zc < 3800;
        if (age < 1.8) {
          const kf = Math.exp(-age * 2); if (b < kf * a) b = kf * a;
          pb.dot(sx, sy, big || age < .06 ? 2 : 1, 238 - 40 * kf, 238 + 6 * kf, 228 - 178 * kf, b > 1 ? 1 : b);
        } else pb.dot(sx, sy, big ? 2 : 1, 238, 238, 228, b > 1 ? 1 : b);
        shown++;
      }
    }
    // waterline
    if (started) for (let k = 0; k < Cx.length; k++) {
      const z = Cz[k]; if (z < fz) continue;
      const age = T - (SC.t0 + (SC.zA - z) / (SC.zA - SC.zB) * (SC.t1 - SC.t0));
      const dx = Cx[k] - e0, dy = 2 - e1, dz = z - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near) continue;
      const sx = cx + F * (dx * r0x + dy * r1 + dz * r2) / zc, sy = cy - F * (dx * u0 + dy * u1 + dz * u2) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
      const kf = age < 2 ? Math.exp(-age * 2) : 0, lime = .35 + .65 * kf;
      pb.dot(sx, sy, zc < 9000 ? 2 : 1, 245 + (198 - 245) * lime, 245 + (244 - 245) * lime, 236 + (50 - 236) * lime, a * (zc < 20000 ? 1 - zc / 30000 : .33));
    }
    // the scan line: a lit profile and a light sheet standing on it
    if (scanning) {
      const sA = a * E.ss(SC.t0, SC.t0 + .4, T) * (1 - E.ss(SC.t1 - .4, SC.t1, T));
      const j = (fz - GZ0) / GS;
      for (let x = -9400; x <= 9400; x += 16) {
        const y = PA.gy(x, fz), g = cam.project([x, y + 3, fz]); if (!g || g[0] < 0 || g[1] < 0 || g[0] >= 1920 || g[1] >= 1080) continue;
        PA.dset(pb, g[0], g[1], 2, 226, 255, 150, sA);
        pb.add(g[0], g[1], 7, LIME[0], LIME[1], LIME[2], .045 * sA);
        if (((x + 9400) / 16 | 0) % 8 === 0) for (let hh = 30; hh < 900; hh += 30) { const q = cam.project([x, y + hh, fz]); if (q) pb.dot(q[0], q[1], 1, LIME[0], LIME[1], LIME[2], sA * .5 * Math.pow(1 - hh / 900, 2)); }
      }
    }
    // the battery: footprint and tag once the scan has passed it
    const tIn = T - BASE.lt - .25, ba = tIn < 0 ? 0 : E.sat(tIn / .3) * a * o.site;
    if (ba > .01) {
      const g = cam.project([BASE.x, BASE.gy, BASE.z]);
      const grow = E.outCubic(E.sat(tIn / .6)), nR = BASE.ring.length, shR = Math.floor(nR * grow);
      for (let k = 0; k < shR; k++) { const q = cam.project(BASE.ring[k]); if (q) PA.dset(pb, q[0], q[1], 2, LIME[0], LIME[1], LIME[2], ba); }
      if (g) {
        const hStem = 110 * E.outCubic(E.sat(tIn / .45));
        for (let yy = 6; yy <= hStem; yy += 3) { PA.dset(pb, g[0], g[1] - yy, 3, 11, 12, 10, ba * .7); PA.dset(pb, g[0], g[1] - yy, 1, LIME[0], LIME[1], LIME[2], ba); }
        if (tIn > .3) out.tags.push({ key: 'base', id: 'OBJ 01', txt: 'Battery · Krasnaya Kosa', v: `+${Math.round(PA.hTrue(BASE.x, BASE.z))} m`, cls: 'lime', x: g[0] - 1, y: g[1] - hStem - 21, a: ba, pri: 4, lead: false });
      }
    }
    out.shown = shown;
    return out;
  };
  PA.coastInfo = { NP, NC: Cx.length, NPR: PR.length / 4 };
  /* LiDAR returns logged so far (rows the scan line has crossed) */
  PA.coastCount = T => { let n = 0; for (let k = 0; k < GNZ; k++) if (T >= rowT(k)) n += RS[k + 1] - RS[k]; return n; };
})();
