/* THE PICTURE · RAID: the Confidence chapter's fight. Once TRK 21 is identified its destroyer
   starts shooting at the sky: a VLS cell flashes, the interceptor climbs out of its own smoke on a
   coral streak, pitches over toward the coast and bursts high up; the smoke of every shot hangs
   over the deck and along the climb and drifts downwind with the squall.
   Flights are integrated once at load into tables; every particle is analytic in its age. */
(function () {
  const { X, E, rng } = M3;
  const PA = window.PA, DEG = PA.DEG, TAU = PA.TAU, hsh = PA.hsh, WH = PA.WH, CORAL = PA.CORAL;
  const A = window.HD && HD.destroyer && HD.destroyer.A;
  const vls = i => A && A.vls ? A.vls(i) : [(i % 2 ? 1 : -1) * 3.9, i < 32 ? 7.3 : 6.1, i < 32 ? 38 : -29];
  const gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
  const WIND = [Math.sin(152 * DEG) * 5.5, Math.cos(152 * DEG) * 5.5];

  /* pairs, fore and aft: launch time, cell, bearing and climb angle after the pitch-over, burst age */
  const SH = [
    { t: 75.2, cell: 9, az: 174, gam: 22, tb: 6.9 },
    { t: 75.75, cell: 61, az: 188, gam: 26, tb: 7.4 },
    { t: 77.4, cell: 18, az: 164, gam: 20, tb: 6.3 },
    { t: 77.95, cell: 44, az: 195, gam: 27, tb: 7.2 },
    { t: 79.5, cell: 3, az: 180, gam: 23, tb: 5.4 },
    { t: 80.0, cell: 83, az: 170, gam: 21, tb: 5.0 },
    { t: 81.4, cell: 26, az: 192, gam: 22, tb: 4.6 },
    { t: 81.9, cell: 70, az: 183, gam: 25, tb: 4.5 },
  ];
  PA.SALVO = SH;
  const HZ = 60;
  SH.forEach((s, i) => {
    const c = PA.shipCentre(s.t), Tw = X.make(PA.DDGB.RSH, c), p0 = X.ap(Tw, vls(s.cell));
    s.P0 = [p0[0], p0[1] + .6, p0[2]]; s.Tw = Tw; s.i = i;
    // out of the cell vertically, pitch over onto the climb bearing, boost then sustain
    const az = s.az * DEG, th1 = (90 - s.gam) * DEG, n = Math.ceil(s.tb * HZ), P = new Float32Array((n + 1) * 3);
    let x = 0, y = 0, z = 0, v = 0, t = 0, k = 0;
    const dt = 1 / (HZ * 4);
    P[0] = s.P0[0]; P[1] = s.P0[1]; P[2] = s.P0[2];
    for (let step = 1; step <= n * 4; step++) {
      t = step * dt;
      const acc = t < .9 ? 140 : t < 4.4 ? 190 : 14;
      v += acc * dt;
      const th = t < .9 ? 0 : th1 * (1 - Math.exp(-(t - .9) / .55));
      const hz = Math.sin(th), vy = Math.cos(th);
      x += v * hz * Math.sin(az) * dt; z += v * hz * Math.cos(az) * dt; y += v * vy * dt;
      if (step % 4 === 0) { k = step / 4; P[k * 3] = s.P0[0] + x; P[k * 3 + 1] = s.P0[1] + y; P[k * 3 + 2] = s.P0[2] + z; }
    }
    s.P = P; s.n = n; s.T1 = s.t + s.tb;
    s.B = [P[n * 3], P[n * 3 + 1], P[n * 3 + 2]];
  });
  /* burst templates */
  const NF = 300, FR = { x: new Float32Array(NF), y: new Float32Array(NF), z: new Float32Array(NF), sp: new Float32Array(NF), k: new Float32Array(NF), life: new Float32Array(NF), hot: new Uint8Array(NF) };
  { const rr = rng(5511); for (let i = 0; i < NF; i++) { const u = rr() * 2 - 1, a = rr() * TAU, h = Math.sqrt(1 - u * u); FR.x[i] = Math.cos(a) * h; FR.y[i] = u; FR.z[i] = Math.sin(a) * h; FR.sp[i] = 90 + 420 * Math.pow(rr(), 1.4); FR.k[i] = 1.4 + 1.4 * rr(); FR.life[i] = 1.1 + 1.9 * rr(); FR.hot[i] = rr() < .3 ? 1 : 0; } }
  const NQ = 170, SMK = { x: new Float32Array(NQ), y: new Float32Array(NQ), z: new Float32Array(NQ), r: new Float32Array(NQ), br: new Float32Array(NQ) };
  { const rr = rng(5517); for (let i = 0; i < NQ; i++) { const u = rr() * 2 - 1, a = rr() * TAU, h = Math.sqrt(1 - u * u), q = Math.cbrt(rr()); SMK.x[i] = Math.cos(a) * h * q; SMK.y[i] = u * q * .75; SMK.z[i] = Math.sin(a) * h * q; SMK.r[i] = 45 + 70 * rr(); SMK.br[i] = .45 + .55 * rr(); } }
  /* the cloud a hot launch leaves on deck: puffs out of the cell and the uptake, rising and spreading */
  const ND = 190, DK = { t: new Float32Array(ND), vx: new Float32Array(ND), vy: new Float32Array(ND), vz: new Float32Array(ND), life: new Float32Array(ND), br: new Float32Array(ND) };
  { const rr = rng(5521); for (let i = 0; i < ND; i++) { const a = rr() * TAU, sp = 2 + 9 * rr(); DK.t[i] = 1.3 * Math.pow(rr(), 1.8); DK.vx[i] = Math.cos(a) * sp; DK.vz[i] = Math.sin(a) * sp; DK.vy[i] = 3 + 9 * rr(); DK.life[i] = 4 + 6 * rr(); DK.br[i] = .5 + .5 * rr(); } }

  let qx = 0, qy = 0, qz = 0;
  const prj = (cam, x, y, z) => {
    const e = cam.eye, f = cam.f, dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc < cam.near) return false;
    const r = cam.r, u = cam.u;
    qx = cam.cx + cam.fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; qy = cam.cy - cam.fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; qz = zc;
    return qx > -80 && qy > -80 && qx < 2000 && qy < 1160;
  };

  function drawShot(pb, cam, T, s, a, out) {
    const age = T - s.t; if (age < 0) return;
    const glow = PA.glow, P = s.P, fl = cam.fl;
    const kNow = Math.min(s.n, Math.floor(age * HZ)), flying = age < s.tb;
    // launch flash on the deck
    if (age < .6 && prj(cam, s.P0[0], s.P0[1] + 1, s.P0[2])) {
      const I = Math.exp(-age * 6) * a, sc = E.clamp(fl / qz * 1.2, .6, 2);
      glow(pb, qx, qy, 10 * sc, 255, 250, 238, .85 * I); glow(pb, qx, qy, 36 * sc, CORAL[0], CORAL[1], CORAL[2], .15 * I); glow(pb, qx, qy, 100 * sc, 255, 220, 190, .035 * I);
    }
    // deck smoke
    if (age < 11) for (let i = 0; i < ND; i++) {
      const b = age - DK.t[i]; if (b < 0 || b > DK.life[i]) continue;
      const dd = (1 - Math.exp(-b * .9)) / .9;
      if (!prj(cam, s.P0[0] + DK.vx[i] * dd + WIND[0] * b, s.P0[1] + DK.vy[i] * dd + 1.2 * b, s.P0[2] + DK.vz[i] * dd + WIND[1] * b)) continue;
      const hot = Math.exp(-b * 5), al = DK.br[i] * (1 - b / DK.life[i]) * (.3 + .5 * hot) * a;
      pb.dot(qx, qy, qz < 900 ? 2 : 1, WH[0] + (255 - WH[0]) * hot, WH[1] + (CORAL[1] + 60 - WH[1]) * hot, WH[2] + (CORAL[2] - WH[2]) * hot, Math.min(1, al));
    }
    // the trail: every sample is laid at its instant. The streak (white-hot, then coral) stays on the
    // flight line; the smoke it leaves spreads and drifts, and outlives it
    let px = 0, py = 0, pOK = false, mx = 0, my = 0, mOK = false;
    for (let k = 0; k <= kNow; k++) {
      const b = age - k / HZ; if (b > 12) { pOK = mOK = false; continue; }
      const j = k * 3, dx = WIND[0] * b, dy = 1.2 * b, dz = WIND[1] * b;
      if (b < 1.1) {
        if (prj(cam, P[j] + dx * .3, P[j + 1] + dy * .3, P[j + 2] + dz * .3)) {
          const sx = qx, sy = qy, near = qz < 1400, hot = Math.exp(-b * 9), c = 1 - E.sat(b / 1.1);
          const cr = CORAL[0] + (255 - CORAL[0]) * hot, cg = CORAL[1] + (245 - CORAL[1]) * hot, cb = CORAL[2] + (230 - CORAL[2]) * hot, al = (.4 + .6 * c) * a, sz = near || hot > .3 ? 2 : 1;
          if (pOK && Math.abs(sx - px) + Math.abs(sy - py) < 400) pb.dline(px, py, sx, sy, 1.5, sz, cr, cg, cb, al * .85);
          pb.dot(sx, sy, sz, cr, cg, cb, al);
          px = sx; py = sy; pOK = true;
        } else pOK = false;
      }
      if (b > .2) {
        const spread = 1 + 4.5 * Math.pow(b - .2, .6);
        if (!prj(cam, P[j] + gH(k, s.i * 7 + 1) * spread + dx, P[j + 1] + gH(k, s.i * 7 + 3) * spread * .8 + dy, P[j + 2] + gH(k, s.i * 7 + 5) * spread + dz)) { mOK = false; continue; }
        const sx = qx, sy = qy, near = qz < 1400;
        const al = .46 * E.sat((b - .2) / .8) * Math.exp(-Math.max(0, b - 1.1) / 4.2) * (.6 + .4 * hsh(k, s.i + 90)) * a;
        if (al > .02) {
          pb.dot(sx, sy, near ? 2 : 1, WH[0], WH[1], WH[2], al);
          // fill the gaps the fast part of the climb leaves between samples
          if (mOK) { const gap = Math.abs(sx - mx) + Math.abs(sy - my); if (gap > 5 && gap < 400) { const m = Math.min(5, Math.floor(gap / 5)); for (let q = 1; q <= m; q++) { const u = q / (m + 1), jx = (hsh(k * 8 + q, s.i + 11) - .5) * 3, jy = (hsh(k * 8 + q, s.i + 13) - .5) * 3; pb.dot(mx + (sx - mx) * u + jx, my + (sy - my) * u + jy, 1, WH[0], WH[1], WH[2], al * .8); } } }
        }
        mx = sx; my = sy; mOK = true;
      }
    }
    // the head
    if (flying) {
      const j = kNow * 3, f = age * HZ - kNow, k2 = Math.min(s.n, kNow + 1) * 3;
      if (prj(cam, P[j] + (P[k2] - P[j]) * f, P[j + 1] + (P[k2 + 1] - P[j + 1]) * f, P[j + 2] + (P[k2 + 2] - P[j + 2]) * f)) {
        const sc = E.clamp(fl / qz * 6, .6, 2.4);
        glow(pb, qx, qy, 6 * sc, 255, 250, 240, .8 * a); glow(pb, qx, qy, 18 * sc, CORAL[0], CORAL[1], CORAL[2], .2 * a);
        pb.dot(qx, qy, 3, 255, 236, 220, a);
        if (s.i % 2 === 0 && age > .5 && age < 4) out.tags.push({ key: 'sam' + s.i, id: 'SAM', txt: 'TRK 21', cls: 'coral sm', ax: qx + 5, ay: qy - 5, x: qx + 16, y: qy - 30, a: a * E.sat((age - .5) / .3) * (1 - E.sat((age - 3.5) / .5)), pri: 3 });
      }
      return;
    }
    // the burst high up: flash, fragments, a smoke ball that hangs
    const ab = age - s.tb, B = s.B;
    if (ab < 1 && prj(cam, B[0], B[1], B[2])) {
      const I = Math.exp(-ab * 5) * a, sc = E.clamp(fl / qz * 5, .7, 2.6);
      glow(pb, qx, qy, 12 * sc, 255, 255, 250, .9 * I); glow(pb, qx, qy, 38 * sc, 255, 228, 205, .22 * I); glow(pb, qx, qy, 100 * sc, CORAL[0], CORAL[1], CORAL[2], .07 * I);
    }
    if (ab < 3.2) {
      const rot = s.i * 2.1, cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i < NF; i++) {
        const L = FR.life[i]; if (ab > L) continue;
        const k = FR.k[i], dd = (1 - Math.exp(-k * ab)) / k * FR.sp[i];
        if (!prj(cam, B[0] + (FR.x[i] * cr - FR.z[i] * sr) * dd, B[1] + FR.y[i] * dd - 4.9 * ab * ab, B[2] + (FR.x[i] * sr + FR.z[i] * cr) * dd)) continue;
        const hot = FR.hot[i] ? E.sat(1 - ab / 1.6) : 0, al = (1 - ab / L) * a * (.7 + .5 * hot);
        pb.dot(qx, qy, ab < .6 || hot > .3 ? 2 : 1, 255 + (CORAL[0] - 255) * hot, 250 + (CORAL[1] - 250) * hot, 245 + (CORAL[2] - 245) * hot, Math.min(1, al));
      }
    }
    if (ab < 9) {
      const f = (1 - ab / 9) * a * .5;
      for (let i = 0; i < NQ; i++) {
        const g2 = SMK.r[i] * (.35 + .65 * (1 - Math.exp(-ab * 1.4))) + 6 * ab;
        if (!prj(cam, B[0] + SMK.x[i] * g2 + WIND[0] * ab, B[1] + SMK.y[i] * g2 - 2 * ab, B[2] + SMK.z[i] * g2 + WIND[1] * ab)) continue;
        pb.dot(qx, qy, 1, WH[0], WH[1], WH[2], f * SMK.br[i]);
      }
    }
  }

  /* a: layer alpha. Returns the tags and how many rounds are up */
  PA.salvo = function (pb, cam, T, a) {
    const out = { tags: [], up: 0 };
    if (a <= .01 || T < SH[0].t || T > 96) return out;
    for (const s of SH) { if (T >= s.t) out.up++; drawShot(pb, cam, T, s, a, out); }
    return out;
  };
})();
