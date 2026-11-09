/* AEGIS: the dot world. The own ship (HD.destroyer sampled at three densities plus a dense patch round the
   starboard-forward SPY face, chunked for culling), the face's 4 350 radiating elements carrying the phase fronts
   of the steered beam, the sea as world-fixed jittered lattices flowing aft (periodic in D), the wakes, the sky at
   infinity, the group's hulls, the helicopter, and the raid's rounds (sampled HD.oniks) when the lens is near.
   Draws through PE.DW (synced to the current camera). */
(function () {
  const { V, R, X, E, rng } = M3;
  const PE = window.PE, DW = PE.DW, DEG = PE.DEG, TAU = PE.TAU, D = PE.D, hsh = PE.hsh, LIME = PE.LIME, WH = PE.WH, CORAL = PE.CORAL;
  const q = DW.q, put = DW.put, P3 = DW.P3;
  const partX = (Wx, part, st) => part.xf ? X.mul(Wx, part.xf(st)) : Wx;
  const I = X.make(R.I(), [0, 0, 0]);

  /* ---------- chunks: static points split into 7 m cells, each with a bounding sphere (culled per frame) ---------- */
  function chunk(parts) {
    const out = [];
    for (const sp of parts) {
      if (sp.part.xf) { out.push({ sp, rigid: true, pts: sp.pts }); continue; }
      const P = sp.pts, bins = new Map();
      for (let j = 0; j < P.length; j += 6) { const b = Math.floor(P[j] / 7) * 1e6 + Math.floor(P[j + 1] / 7) * 1e3 + Math.floor(P[j + 2] / 7); let a = bins.get(b); if (!a) { a = []; bins.set(b, a); } for (let c = 0; c < 6; c++) a.push(P[j + c]); }
      for (const [, a] of bins) {
        const pts = new Float32Array(a); let cx = 0, cy = 0, cz = 0; const n = pts.length / 6;
        for (let j = 0; j < pts.length; j += 6) { cx += pts[j]; cy += pts[j + 1]; cz += pts[j + 2]; }
        cx /= n; cy /= n; cz /= n; let r = 0;
        for (let j = 0; j < pts.length; j += 6) r = Math.max(r, Math.hypot(pts[j] - cx, pts[j + 1] - cy, pts[j + 2] - cz));
        out.push({ sp, pts, c: [cx, cy, cz], r });
      }
    }
    return out;
  }
  const DDC = { coarse: chunk(PE.dd.coarse), mid: chunk(PE.dd.mid), fine: chunk(PE.dd.fine), near: chunk(PE.dd.near), wall: chunk(PE.dd.wall), nearWall: chunk(PE.dd.nearWall) };
  PE.DDC = DDC;
  /* is a sphere (world) possibly on screen */
  function sphereVis(cam, c, r) {
    const dx = c[0] - cam.eye[0], dy = c[1] - cam.eye[1], dz = c[2] - cam.eye[2];
    const zc = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2]; if (zc < -r) return false;
    if (zc < r * 1.5) return true;
    const xc = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2], yc = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
    const sx = cam.cx + cam.fl * xc / zc, sy = cam.cy - cam.fl * yc / zc, rp = cam.fl * r / (zc - r) + 40;
    return sx + rp > 0 && sx - rp < cam.W && sy + rp > 0 && sy - rp < cam.H;
  }
  function drawChunks(cam, CH, Wx, st, a, big, stride, occS) {
    for (const ck of CH) {
      if (ck.rigid) { if (occS) DW.drawPtsOcc(ck.pts, partX(Wx, ck.sp.part, st), a, big, occS, stride); else DW.drawPts(ck.pts, partX(Wx, ck.sp.part, st), a, big, null, 0, stride); continue; }
      if (!sphereVis(cam, X.ap(Wx, ck.c), ck.r)) continue;
      if (occS) DW.drawPtsOcc(ck.pts, Wx, a, big, occS, stride); else DW.drawPts(ck.pts, Wx, a, big, null, 0, stride);
    }
  }

  /* the own ship state (stage B may add to it through PE.shipStateFx) */
  PE.shipState = function (T) {
    return { sps: T * TAU * 38 / D, ciwsYaw: [0, Math.PI], ciwsPitch: [.35, .35], ciwsSpin: 0, gunYaw: 0, gunPitch: 0, vlsOpen: [] };
  };
  /* the own ship: the finest sampling whose dots land >= ~2 px apart at the ship's distance (a point cloud,
     never a solid), crossfaded; the dense patch round the face for the close-up. It writes the occlusion tiles,
     so draw it before everything it hides. */
  PE.drawOwn = function (cam, T, st, a) {
    const e = cam.eye, zc = E.clamp(e[2], -77, 77), dS = Math.max(4, Math.hypot(e[0], e[1] - 10, e[2] - zc) - 8), dF = Math.max(.5, V.dist(e, PE.FACE0.c));
    const px = (s, d) => cam.fl * s / d;
    // one LOD at a time, crossfaded over a narrow band (max-blended dots: a faint layer costs as much as a full one)
    const wNear = E.ss(2.3, 3.2, px(.065, dF)), wFine = E.ss(2.1, 2.6, px(.3, dS)), wMid = E.ss(1.9, 2.4, px(.42, dS)) * (1 - wFine);
    const wCoarse = 1 - wFine - wMid;
    // dots grow to 2 px only where their spacing on screen leaves room (> ~4.5 px)
    const big = sp => cam.fl * sp / 4.5;
    // the dense deckhouse walls only once their dots land >= ~2.5 px apart; the patch's own wall dots until then
    const wWall = E.ss(2.4, 3.8, px(.033, dF)) * wNear;
    if (wWall > .03) drawChunks(cam, DDC.wall, I, st, a * wWall, big(.033), 1, .033);
    if (wNear > .03) { drawChunks(cam, DDC.near, I, st, a * wNear, big(.065), 1, .065); if (wWall < .97) drawChunks(cam, DDC.nearWall, I, st, a * (wNear - wWall), big(.065), 1, .065); }
    // in the close-up the dense face patch carries the detail: the rest of the ship at a third of the density
    if (wFine > .03) drawChunks(cam, DDC.fine, I, st, a * wFine, big(.3), wNear > .3 ? 4 : 1, .3);
    if (wMid > .03) drawChunks(cam, DDC.mid, I, st, a * wMid, big(.42), 1, .42);
    if (wCoarse > .03) drawChunks(cam, DDC.coarse, I, st, a * wCoarse, big(.85), 1, .85);
  };

  /* ---------- the SPY face: 4 350 elements, phase fronts of the steered beam crossing them ---------- */
    PE.drawFace = function (cam, T, a, fi) {
    const F = PE.FACES[fi || 0], el = PE.ELEM, n = el.length / 2;
    const dF = V.dist(cam.eye, F.c), pxm = cam.fl / Math.max(.5, dF);          // px per metre at the face
    const spacing = PE.ELEM_D * pxm;
    // beam steering: azimuth off the face normal from the sweep, a few elevation bars
    // the steering eases through the flyback and between elevation bars (0.3 s), so the fronts never snap
    const qf = (PE.arm(T) - F.brg + TAU / 8) / (TAU / 4), kq = Math.floor(qf), uq = qf - kq, fb = E.ss(.88, 1, uq), bar = ((kq % 3) + 3) % 3;
    const thA = -TAU / 8 + uq * TAU / 4, th = thA + (-TAU / 8 - thA) * fb;
    const ev = (1.5 + 4 * (bar + fb * (bar === 2 ? -2 : 1))) * DEG;
    // the phase fronts are drawn stretched (x ~0.1) and slowed right down (RF is 3 GHz): their tilt across the
    // face still follows the steering, 4 fronts across the face at the 45° limit
    const kv = TAU * 4 / 3.6 / Math.sin(TAU / 8);
    const kh = kv * Math.sin(th) * Math.cos(ev), ku = kv * Math.sin(ev) + 3.2;
    const w = TAU * 1.2, mod = E.ss(1.5, 4, spacing);
    const cx = F.c[0] + F.n[0] * .03, cy = F.c[1] + F.n[1] * .03, cz = F.c[2] + F.n[2] * .03, h = F.h, u = F.u;
    const cross = spacing > 11, sz = spacing > 7 ? 3 : spacing > 4 ? 2 : 1;
    // a transmit burst every quarter second lights the face from the phase centre outwards
    const cb4 = .5 + .5 * Math.cos(TAU * 4 * T), cb8 = cb4 * cb4 * cb4 * cb4, burst = cb8 * cb8 * cb8;
    for (let i = 0; i < n; i++) {
      const x = el[i * 2], y = el[i * 2 + 1];
      if (!P3(cx + h[0] * x + u[0] * y, cy + h[1] * x + u[1] * y, cz + h[2] * x + u[2] * y)) continue;
      const ph = kh * x + ku * y - w * T, c = .5 + .5 * Math.cos(ph);
      const c4 = c * c, k = mod * c4 * c4 + (1 - mod) * .18 * (1 + Math.cos(w * T)) + burst * (.2 + .3 * mod) * Math.exp(-Math.hypot(x, y) * 1.1);
      const kl = Math.min(1, k * 1.6), b = (.2 + 1.1 * k) * a;
      const cr = WH[0] + (LIME[0] - WH[0]) * kl, cg = WH[1] + (LIME[1] - WH[1]) * kl, cb = WH[2] + (LIME[2] - WH[2]) * kl;
      put(q.x, q.y, sz, cr, cg, cb, Math.min(1, b));
      if (cross) {
        const s = Math.min(6, spacing * .24), bb = Math.min(1, b * .5);
        put(q.x - s, q.y, 1, cr, cg, cb, bb); put(q.x + s, q.y, 1, cr, cg, cb, bb);
        put(q.x, q.y - s, 1, cr, cg, cb, bb); put(q.x, q.y + s, 1, cr, cg, cb, bb);
      }
    }
    // the octagon rim
    const rr = 1.95, m = Math.round(E.clamp(rr * 8 * pxm / 3, 48, 900));
    for (let j = 0; j < m; j++) {
      const t = j / m * 8, s = Math.floor(t), f = t - s;
      const a0 = (s + .5) / 8 * TAU, a1 = (s + 1.5) / 8 * TAU;
      const x = rr * (Math.cos(a0) * (1 - f) + Math.cos(a1) * f), y = rr * (Math.sin(a0) * (1 - f) + Math.sin(a1) * f);
      if (P3(cx + h[0] * x + u[0] * y, cy + h[1] * x + u[1] * y, cz + h[2] * x + u[2] * y)) put(q.x, q.y, 2, WH[0], WH[1], WH[2], .8 * a);
    }
    return { spacing, th };
  };

  /* ---------- sea: world-fixed jittered lattices in the sea frame, flowing aft past the ship ----------
     Nested annuli round the eye's ground point, each a lattice whose cell divides VS * D (1 320 m, so the flow
     loops exactly: the jitter is keyed on the cell index mod the cells per film). Inside an annulus every dot is
     kept with probability (cell / wanted spacing)^2, so the density on screen is continuous across the rings. */
  const VS = PE.VS;
  const WSW = TAU * 11 / D, WSW2 = TAU * 17 / D;        // swell phases: whole cycles per film
  // the along-track wave numbers fit a whole number of waves into VS * D, so the swell repeats with the flow
  const KZ1 = TAU * 2 / (VS * D), KZ2 = TAU * 7 / (VS * D);
  const seaY = (xs, zs, T) => 1.1 * Math.sin(xs * .019 + zs * KZ1 + T * WSW) + .55 * Math.sin(zs * KZ2 - xs * .011 - T * WSW2);
  PE.seaY = seaY;
  const SEA_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 44, 55, 66, 88, 110, 120];
  const pickStep = w => { for (const s of SEA_STEPS) if (s >= w) return s; return 120; };
  function seaRing(cam, T, gx, gz, rIn, rOut, spx, al, box) {
    const fl = cam.fl, flow = VS * T, wantIn = Math.max(1, rIn * spx / fl);
    // the lattice: fine enough for the ring's inner edge, coarse enough to stay within ~14 000 cells
    const area = (box[1] - box[0]) * (box[3] - box[2]);
    const step = pickStep(Math.max(wantIn * .8, Math.sqrt(area / 14000)));
    const per = Math.round(VS * D / step);
    const i0 = Math.floor(box[0] / step), i1 = Math.floor(box[1] / step), j0 = Math.floor((box[2] + flow) / step), j1 = Math.floor((box[3] + flow) / step);
    const rI2 = rIn * rIn, rO2 = rOut * rOut, k2 = step * step * fl * fl / (spx * spx);
    // cell-centre pre-test (the jitter moves a dot by < one cell)
    const m = step * .75, rIc = Math.max(0, rIn - m), rOc = rOut + m, rIc2 = rIc * rIc, rOc2 = rOc * rOc;
    for (let i = i0; i <= i1; i++) {
      const xc = (i + .5) * step - gx, xc2 = xc * xc;
      if (xc2 > rOc2) continue;
      for (let j = j0; j <= j1; j++) {
        const zc = (j + .5) * step - flow - gz, dc2 = xc2 + zc * zc;
        if (dc2 > rOc2 || dc2 < rIc2) continue;
        // keep with probability (step / wanted)^2, wanted = d * spx / fl
        const jm = ((j % per) + per) % per;
        if (k2 < dc2 && hsh(i * 5 + 1, jm * 17 + 2) * dc2 > k2) continue;
        const h1 = hsh(i * 7 + 3, jm * 13 + 5), h2 = hsh(i * 11 + 1, jm * 3 + 9);
        const xs = (i + h1) * step, zs = (j + h2) * step, z = zs - flow;
        const dx = xs - gx, dz = z - gz, d2 = dx * dx + dz * dz;
        if (d2 < rI2 || d2 >= rO2) continue;
        const y = seaY(xs, zs, T);
        if (!P3(xs, y, z)) continue;
        if (q.x < 0 || q.y < 0 || q.x >= 1920 || q.y >= 1080 || DW.occ(q.x, q.y, q.z)) continue;
        // the swell's crests catch more returns: brightness follows the height
        const cr = (y + 1.65) / 3.3, b = al * (.2 + .62 * cr * cr + .12 * Math.sin(h1 * 40 + T * WSW * 3));
        put(q.x, q.y, q.z < 1400 ? 2 : 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
      }
    }
  }
  PE.drawSea = function (cam, T, a) {
    const e = cam.eye, h = Math.max(3, e[1]);
    a *= E.ss(2600, 1100, h) * (1 - .72 * E.ss(110, 900, h));
    if (a <= .01) return;
    const gx = e[0], gz = e[2], f = cam.f, fh = Math.hypot(f[0], f[2]);
    const pitch = Math.atan2(-f[1], fh);
    // the ground the lens can see: from below the bottom edge of the frame out to the top edge (or the ring's end)
    const pBot = pitch + Math.atan((cam.H - cam.cy) / cam.fl), pTop = pitch - Math.atan(cam.cy / cam.fl);
    if (pBot <= 0) return;
    const rMax = Math.min(3200, 700 + h * 16, pTop > .002 ? h / Math.tan(pTop) * 1.15 : 1e9);
    const dmin = pBot >= Math.PI / 2 - .01 ? 0 : h / Math.tan(pBot) * .9;
    // horizontal half-angle of the view, with a margin for the off-centre projection
    const hw = Math.atan(Math.max(cam.cx, cam.W - cam.cx) / cam.fl) + .12;
    const spx = 7.2;
    let rIn = dmin, rOut = Math.max(rIn * 2.4, rIn + 40, h * 1.5);
    while (rIn < rMax) {
      rOut = Math.min(rOut, rMax);
      // bounding box of the part of the ring the lens can see
      let box;
      if (pBot > 1.35 || fh < .25) box = [gx - rOut, gx + rOut, gz - rOut, gz + rOut];
      else {
        const b0 = Math.atan2(f[0], f[2]); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (const da of [-hw, -hw / 2, 0, hw / 2, hw]) for (const r of [rIn, rOut]) { const x = gx + Math.sin(b0 + da) * r, z = gz + Math.cos(b0 + da) * r; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        box = [x0, x1, z0, z1];
      }
      seaRing(cam, T, gx, gz, rIn, rOut, spx, a, box);
      rIn = rOut; rOut *= 2.4;
    }
  };

  /* wake: Kelvin arms, the churned centre line, the bow wave; the sea frame flows at VS */
  PE.drawWake = function (cam, T, Wx, a, L, B, v) {
    if (a <= .01) return;
    v = v || VS; const hl = L / 2, flow = v * T, per = Math.round(v * D / 6);
    const Tm = Wx;
    for (let d = 0; d < 900; d += 6) {
      const dd = d + (flow % 6), fa = a * Math.pow(1 - dd / 900, 1.5);
      for (const sd of [-1, 1]) { const lat = sd * (B * .35 + dd * Math.tan(19.5 * DEG)); if (DW.P3v(X.ap(Tm, [lat, .4, -hl - dd]))) DW.putO(q.x, q.y, 1, WH[0], WH[1], WH[2], fa * .6); }
      for (let m = 0; m < 3; m++) {
        const key = ((Math.floor(flow / 6) - (d / 6 | 0)) % per + per) % per, r = hsh(d * 3 + m, key);
        const lat = (r - .5) * (B * .7 + dd * .07); if (DW.P3v(X.ap(Tm, [lat, .3, -hl - dd]))) DW.putO(q.x, q.y, 1, WH[0], WH[1], WH[2], fa * .5);
      }
    }
    for (let k = 0; k < 90; k++) { const sd = k & 1 ? 1 : -1, zz = hl * .78 - (k >> 1) * 1.6, b = B * .52 + (hl * .78 - zz) * .06; if (DW.P3v(X.ap(Tm, [sd * b, .5 + .4 * Math.sin(k + T * TAU * 79 / D), zz]))) DW.putO(q.x, q.y, 1, WH[0], WH[1], WH[2], a * .55); }
  };

  /* ---------- sky: dots at infinity, a band over the horizon ---------- */
  const SKYV = (() => {
    const r = rng(303), a = [];
    for (let i = 0; i < 7000; i++) {
      const az = r() * TAU, above = r() < .8, el = above ? Math.pow(r(), 2.6) * 10 * DEG : -Math.pow(r(), 1.6) * .8 * DEG;
      const b = (above ? Math.exp(-el / (2.1 * DEG)) : Math.exp(el / (.4 * DEG))) * (.3 + .7 * Math.pow(Math.max(0, Math.cos(az - 250 * DEG)), 2)) * (.55 + .45 * r());
      a.push(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), b);
    }
    return new Float32Array(a);
  })();
  PE.drawSky = function (cam, a) {
    if (a <= .01) return;
    const f = cam.f, r = cam.r, u = cam.u, fl = cam.fl, cx = cam.cx, cy = cam.cy;
    for (let i = 0; i < SKYV.length; i += 4) {
      const dx = SKYV[i], dy = SKYV[i + 1], dz = SKYV[i + 2], zc = dx * f[0] + dy * f[1] + dz * f[2];
      if (zc < .05) continue;
      const sx = cx + fl * (dx * r[0] + dy * r[1] + dz * r[2]) / zc, sy = cy - fl * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
      if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080 || DW.occ(sx, sy, 1e9)) continue;
      put(sx, sy, 1, 206, 224, 186, Math.min(1, SKYV[i + 3] * .7 * a));
    }
  };

  /* ---------- the group's hulls ---------- */
  const CVC = chunk(PE.cv);
  PE.drawGroup = function (cam, T, a) {
    if (a <= .01) return;
    for (const g of PE.GROUP) {
      if (!g.model) continue;
      const p = g.at(T), d = V.dist(cam.eye, p);
      const fa = a * E.ss(16000, 9000, d); if (fa <= .01) continue;
      const Wx = X.make(R.y(g.hdg), p);
      if (g.model === 'carrier') drawChunks(cam, CVC, Wx, {}, fa, 900, d > 2500 ? 2 : 1);
      else drawChunks(cam, DDC.coarse, Wx, { sps: T * TAU * 35 / D + 1 }, fa, 900, 1);
      PE.drawWake(cam, T, Wx, fa * .8, g.L, g.B);
    }
  };

  /* ---------- the helicopter: MH-60R on its orbit, rotors turning ---------- */
  PE.heloX = function (T) {
    const ac = PE.AIR[0], p = ac.at(T), v = ac.vel(T), hdg = Math.atan2(v[0], v[2]);
    const bank = Math.atan(ac.speed * ac.speed / ac.r / 9.81) * (ac.c ? 1 : 1);
    return X.make(R.mul(R.y(hdg), R.mul(R.z(bank), R.x(4 * DEG))), p);
  };
  PE.drawHelo = function (cam, T, a) {
    if (a <= .01) return;
    const Wx = PE.heloX(T), d = V.dist(cam.eye, Wx.T); if (d > 6000) return;
    // whole quarter turns per film (4 blades each), so the rotors match across the loop
    const st = { rotor: T * (TAU / 4) * 2836 / D, trotor: T * (TAU / 4) * 13088 / D, droop: 0 };
    for (const sp of PE.helo) DW.drawPts(sp.pts, partX(Wx, sp.part, st), a * E.ss(6000, 3000, d), 220, null, 0, d > 1500 ? 2 : 1);
  };

  /* ---------- the rounds, when the lens is near enough to see them ---------- */
  const TR = [0, 0, 0];
  PE.drawRounds = function (cam, T, a) {
    if (a <= .01) return;
    for (let k = 0; k < PE.RAID.length; k++) {
      const qd = PE.RAID[k]; if (T >= qd.tStop || T < qd.TA - 60) continue;
      PE.roundTruth(k, T, TR);
      const d = V.dist(cam.eye, TR); if (d > 5000) continue;
      const T2 = PE.roundTruth(k, T + .05, [0, 0, 0]), fwd = V.norm(V.sub(T2, TR));
      const Wx = X.make(R.look(fwd, [0, 1, 0]), TR.slice());
      for (const sp of PE.oniks) DW.drawPts(sp.pts, partX(Wx, sp.part, {}), a * E.ss(5000, 2500, d), 120, null, 0, d > 1200 ? 2 : 1);
    }
  };
})();
