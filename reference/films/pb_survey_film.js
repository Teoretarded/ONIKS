/* SURVEY (Point Cloud B) · the film. A chase camera rides an Orlan-10-class survey drone for one
   whole sortie: catapult, LiDAR survey of the coast, radar swath over the sea, a ship identified
   from a standoff orbit, a rain squall, parachute recovery beside the next drone on the rail.
   render(T) is a pure function of film time T; everything moving is looked up from PBS. */
(() => {
  'use strict';
  const W = PBS, { V, R, X, E, Cam, rng } = M3;
  const { DUR, DEG, TAU } = W;
  STAGE.fit();
  const SFX = STAGE.SFX; SFX.kind = 'pc';
  const LIME = [198, 244, 50], WH = [238, 238, 228], CORAL = [255, 106, 61], SKYC = [206, 224, 176];
  const sat = E.sat, ss = E.ss, mix = E.mix;
  const wrapA = a => a - TAU * Math.round(a / TAU);
  const fmod = (a, m) => ((a % m) + m) % m;
  function hsh(a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  }
  const gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
  const unwrapT = T => T > DUR - 25 ? T - DUR : T;      // time around the loop seam

  /* ---------- menu ---------- */
  const menuEl = document.getElementById('menu');
  menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
  const veil = document.getElementById('veil');
  STAGE.menu({
    el: menuEl, blurb: document.getElementById('blurb'),
    onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; },
  });

  /* ---------- canvases + projection state ---------- */
  const cv = document.getElementById('c'), ov = document.getElementById('o'), octx = ov.getContext('2d');
  const pb = new PointBuf(cv, [11, 12, 10], { vignette: .5 });
  const cam = new Cam(); cam.near = .12;
  const ic = document.createElement('canvas'); ic.width = 544; ic.height = 306; ic.className = 'px';
  const insetEl = document.getElementById('inset'); insetEl.appendChild(ic);
  const pb2 = new PointBuf(ic, [11, 12, 10], { vignette: .3 });
  const cam2 = new Cam(544, 306); cam2.near = 5;
  let BUF = pb, VW = 1920, VH = 1080;
  let E0 = 0, E1 = 0, E2 = 0, F0 = 0, F1 = 0, F2 = 1, R0 = 1, R1 = 0, R2 = 0, U0 = 0, U1 = 1, U2 = 0, FL = 1000, CX = 960, CY = 540, PX = 0, PY = 0, PZ = 0;
  /* packed max-blend dot (the kit's PointBuf.dot semantics, ~1.5x faster): colour * alpha, per-channel max */
  const U32 = new Map();
  let PU = null, PW = 1920, PH = 1080;
  const u32of = b => { let u = U32.get(b); if (!u) { u = new Uint32Array(b.img.data.buffer); U32.set(b, u); } return u; };
  function put(x, y, s, r, g, b, a) {
    const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PH) return;
    const R = (r * a) | 0, G = (g * a) | 0, B = (b * a) | 0;
    for (let j = 0; j < s; j++) {
      let i = (y0 + j) * PW + x0;
      for (let k = 0; k < s; k++, i++) {
        const q = PU[i], qr = q & 255, qg = (q >>> 8) & 255, qb = (q >>> 16) & 255;
        if (R > qr || G > qg || B > qb) PU[i] = 0xff000000 | ((B > qb ? B : qb) << 16) | ((G > qg ? G : qg) << 8) | (R > qr ? R : qr);
      }
    }
  }
  function sync(c, buf) {
    PU = u32of(buf); PW = buf.W; PH = buf.H;
    E0 = c.eye[0]; E1 = c.eye[1]; E2 = c.eye[2]; F0 = c.f[0]; F1 = c.f[1]; F2 = c.f[2];
    R0 = c.r[0]; R1 = c.r[1]; R2 = c.r[2]; U0 = c.u[0]; U1 = c.u[1]; U2 = c.u[2];
    FL = c.fl; CX = c.cx + c.shake[0]; CY = c.cy + c.shake[1]; BUF = buf; VW = c.W; VH = c.H;
  }
  function P3(x, y, z) {
    const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < .12) return false;
    PX = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc; PY = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc; PZ = zc;
    return PX > -40 && PY > -40 && PX < VW + 40 && PY < VH + 40;
  }
  const P3v = p => P3(p[0], p[1], p[2]);
  /* overlay dot that replaces what is under it, so lime reads over bright terrain */
  function dset(x, y, s, c, a) {
    const d = BUF.d, W_ = BUF.W; let x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > W_ || y0 + s > BUF.H) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * W_ + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  }
  function dline3(a, b, step, s, c, al) {
    const n = Math.max(1, Math.ceil(V.dist(a, b) / step));
    for (let k = 0; k <= n; k++) { const t = k / n; if (P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) put(PX, PY, s, c[0], c[1], c[2], al); }
  }

  /* ---------- models: lit dot clouds ---------- */
  const LM = V.norm([.5, .78, .34]);
  function drawPts(pts, T, a, big, col, lime, stride) {
    const M = T.R, t = T.T, L0 = LM[0], L1 = LM[1], L2 = LM[2];
    let cr = col ? col[0] : WH[0], cg = col ? col[1] : WH[1], cb = col ? col[2] : WH[2];
    if (lime) { cr += (LIME[0] - cr) * lime; cg += (LIME[1] - cg) * lime; cb += (LIME[2] - cb) * lime; }
    const st6 = 6 * (stride || 1);
    for (let j = 0, n = pts.length; j < n; j += st6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < .12) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .55;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = wx * dx + wy * dy + wz * dz > 0 ? .13 + .16 * lit : .32 + .66 * lit;
      }
      b *= a; if (lime) b = Math.max(b, lime * a);
      put(sx, sy, zc < big ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
  const partX = (Wx, part, st) => part.xf ? X.mul(Wx, part.xf(st)) : Wx;

  /* ---------- time ---------- */
  const simOf = W.simOf, rateOf = W.rateOf, EV = W.EV, route = W.route;
  const T_LAUNCH = W.S_LAUNCH, T_STRIKE = 12.7, T_PING = W.T_PING;
  const T_CHUTE = W.filmOf(EV.chute), T_TOUCH = W.filmOf(EV.touch);
  const T_LIDAR = 15.2, T_LIDAR_OFF = W.filmOf(W.S_LIDAR_OFF), T_LIDAR2 = W.filmOf(W.S_LIDAR2_ON), T_LIDAR2_OFF = W.filmOf(W.S_LIDAR2_OFF);
  const T_RADAR = [[58.5, 89.6], [118.2, 139.5]];
  const radarOn = T => { for (const [a, b] of T_RADAR) if (T > a && T < b) return ss(a, a + 1.2, T) * (1 - ss(b - 1.5, b, T)); return 0; };
  // the strike on TRK 01: CIWS opens up, the hit, the EO lets go of the smoke column, the column is gone
  const T_HIT = 110, T_FIRE0 = T_HIT - 2.6, T_FIRE1 = T_HIT - .05, T_EO_OFF = 138.6, T_SMK_OFF = 139.6;
  const railLoaded = T => T < T_LAUNCH || T > 64;      // a fresh drone waits on the rail while we are away
  const landedPrev = T => T < 42;                        // the previous sortie's drone lies on its airbag until collected

  /* engine: starter, catch, idle, run-up, launch; windmill to a stop under the canopy */
  const REV = u => u < -1.6 ? 0 : u < -.3 ? 11 * ss(-1.6, -.9, u) : u < 1.1 ? mix(11, 46, ss(-.3, 1.1, u)) : u < 5.2 ? 46 : mix(46, 116, ss(5.2, 7.4, u));
  const TH_RAIL = (() => { const n = 1200, a = new Float64Array(n + 1); for (let i = 1; i <= n; i++) { const u0 = -2 + (i - 1) * .01, u1 = u0 + .01; a[i] = a[i - 1] + (REV(u0) + REV(u1)) * .5 * .01 * TAU; } return a; })();
  const thRail = u => { const x = E.clamp((u + 2) / .01, 0, 1199.999), i = x | 0; return TH_RAIL[i] + (TH_RAIL[i + 1] - TH_RAIL[i]) * (x - i); };
  const TH_FLY = (() => { const a = new Float64Array(route.n); for (let i = 1; i < route.n; i++) a[i] = a[i - 1] + 116 * TAU * (route.eng[i - 1] + route.eng[i]) * .5 * route.dt; return a; })();
  const thFly = s => { const x = E.clamp(s / route.dt, 0, route.n - 1.001), i = x | 0; return thRail(T_LAUNCH) + TH_FLY[i] + (TH_FLY[i + 1] - TH_FLY[i]) * (x - i); };

  /* ---------- drones ---------- */
  const DRN = W.drone, DP = DRN.parts, PROP_C = HD.drone.PROP, GIM_C = HD.drone.GIMBAL;
  const propPts = DP.prop.pts, propHub = [], propBl = [];
  for (let k = 0; k < propPts.length; k += 6) { const r = Math.hypot(propPts[k] - PROP_C[0], propPts[k + 1] - PROP_C[1]); (r < .055 ? propHub : propBl).push(...propPts.slice(k, k + 6)); }
  const PHUB = new Float32Array(propHub), PBL = new Float32Array(propBl);
  const DISC = (() => { const r = rng(88), a = []; for (let i = 0; i < 1500; i++) { const rr = Math.sqrt(mix(.04 * .04, .226 * .226, r())); a.push(rr, r() * TAU); } return new Float32Array(a); })();
  const bladeW = rr => (rr < .05 ? .022 : .036 - .02 * (rr - .05) / .175) / 2 / rr;
  // drone rotation: heading, flight path pitch (+ a little alpha), bank
  function droneM(psi, pitch, phi) { return R.mul(R.mul(R.y(psi), R.x(-pitch)), R.z(-phi)); }
  const rotX = (y, z, a, yh, zh) => { const c = Math.cos(a), s = Math.sin(a), dy = y - yh, dz = z - zh; return [yh + dy * c - dz * s, zh + dy * s + dz * c]; };
  let DST = 1, DBIG = 5;
  function drawDrone(D) {
    const M = D.M, t = D.p, Tm = X.make(M, t);
    const dcam = Math.hypot(t[0] - E0, t[1] - E1, t[2] - E2) * 1100 / FL;
    DST = Math.max(1, Math.min(8, Math.floor(dcam / 6))); DBIG = 4.5;
    // fuselage, antennas: plain
    drawPts(DP.fuselage.pts, Tm, 1, DBIG, null, 0, DST);
    drawPts(DP.antennas.pts, Tm, 1, DBIG, null, 0, 1);
    // wing + tail with control surfaces rotated about their hinges
    surfPts(DP.wing.pts, DRN.ail, Tm, (x, y, z, f) => { const d = f === 1 ? D.ail : -D.ail; const q = rotX(y, z, d, .135 + .052 * Math.abs(x), DRN.hingeW(x)); return q; });
    surfPts(DP.tail.pts, DRN.elev, Tm, (x, y, z) => rotX(y, z, D.elev, .05, -.875), DRN.rud, D.rud);
    // gimbal: yaw about its mount, pitch about the ball centre
    const gy = D.gimYaw, gp = D.gimPitch, cyw = Math.cos(gy), syw = Math.sin(gy), cp = Math.cos(gp), sp = Math.sin(gp);
    const g = DP.gimbal.pts, tmp = GIMBUF;
    for (let k = 0; k < g.length; k += 6) {
      let x = g[k], y = g[k + 1], z = g[k + 2], nx = g[k + 3], ny = g[k + 4], nz = g[k + 5];
      const mount = y > .044 && Math.abs(ny) < .3 && Math.hypot(x, z) < .032;
      if (!mount) { const y2 = y * cp - z * sp, z2 = y * sp + z * cp; y = y2; z = z2; const ny2 = ny * cp - nz * sp, nz2 = ny * sp + nz * cp; ny = ny2; nz = nz2; }
      tmp[k] = cyw * x + syw * z + GIM_C[0]; tmp[k + 1] = y + GIM_C[1]; tmp[k + 2] = -syw * x + cyw * z + GIM_C[2];
      tmp[k + 3] = cyw * nx + syw * nz; tmp[k + 4] = ny; tmp[k + 5] = -syw * nx + cyw * nz;
    }
    drawPts(tmp.subarray(0, g.length), Tm, 1, DBIG, null, 0, Math.min(3, DST));
    // lens: the ball's window, lime while the EO is live
    const ld = [syw * cp, -sp, cyw * cp], lp = X.ap(Tm, [GIM_C[0] + ld[0] * .066, GIM_C[1] + ld[1] * .066, GIM_C[2] + ld[2] * .066]);
    if (P3v(lp) && D.eo > 0) { dset(PX, PY, PZ < 6 ? 3 : 2, LIME, .9 * D.eo); }
    // propeller: blades when slow, a dot disc when the exposure smears them
    const th = D.prop, omega = D.omega, dl = Math.min(Math.PI, omega / 120);
    drawPts(PHUB, Tm, 1, DBIG, null, 0, Math.min(3, DST));
    if (dl < .09) {
      const Rp = R.z(th), tmpb = PROPBUF;
      for (let k = 0; k < PBL.length; k += 6) {
        const x = PBL[k] - PROP_C[0], y = PBL[k + 1] - PROP_C[1];
        tmpb[k] = Rp[0] * x + Rp[1] * y + PROP_C[0]; tmpb[k + 1] = Rp[3] * x + Rp[4] * y + PROP_C[1]; tmpb[k + 2] = PBL[k + 2];
        tmpb[k + 3] = Rp[0] * PBL[k + 3] + Rp[1] * PBL[k + 4]; tmpb[k + 4] = Rp[3] * PBL[k + 3] + Rp[4] * PBL[k + 4]; tmpb[k + 5] = PBL[k + 5];
      }
      drawPts(tmpb.subarray(0, PBL.length), Tm, 1, DBIG, null, 0, 1);
    }
    if (dl > .03) {
      const vis = ss(.03, .2, dl);
      for (let k = 0; k < DISC.length; k += 2) {
        const rr = DISC[k], al = DISC[k + 1], w = bladeW(rr);
        const e = fmod(th - al, Math.PI);
        if (!(e < dl + w || e > Math.PI - w)) continue;
        const lum = Math.min(1, 2 * w / Math.max(dl, 2 * w));
        const q = X.ap(Tm, [PROP_C[0] + Math.cos(al) * rr, PROP_C[1] + Math.sin(al) * rr, PROP_C[2]]);
        if (!P3v(q)) continue;
        const tip = rr > .205 ? .25 : 0;
        if (DST > 1 && (k >> 1) % DST) continue;
        put(PX, PY, PZ < 4 ? 2 : 1, 232, 236, 224, vis * Math.min(1, .2 + lum * .9 + tip));
      }
    }
    // airbag + canopy
    if (D.bag > .01) drawBag(Tm, D.bag);
    if (D.inf > .005 || D.chuteOut) drawChute(D);
  }
  const GIMBUF = new Float32Array(DP.gimbal.pts.length), PROPBUF = new Float32Array(PBL.length), SURFBUF = new Float32Array(Math.max(DP.wing.pts.length, DP.tail.pts.length));
  function surfPts(pts, mask, Tm, fn, mask2, rud) {
    const tmp = SURFBUF;
    for (let k = 0, i = 0; k < pts.length; k += 6, i++) {
      let x = pts[k], y = pts[k + 1], z = pts[k + 2];
      if (mask[i]) { const q = fn(x, y, z, mask[i]); y = q[0]; z = q[1]; }
      else if (mask2 && mask2[i]) { const c = Math.cos(rud), s = Math.sin(rud), dx = x, dz = z + .94; x = dx * c + dz * s; z = -dx * s + dz * c - .94; }
      tmp[k] = x; tmp[k + 1] = y; tmp[k + 2] = z; tmp[k + 3] = pts[k + 3]; tmp[k + 4] = pts[k + 4]; tmp[k + 5] = pts[k + 5];
    }
    drawPts(tmp.subarray(0, pts.length), Tm, 1, DBIG, null, 0, DST);
  }
  /* airbag: an inflating cushion under the fuselage */
  const BAG = (() => { const r = rng(5), a = []; for (let i = 0; i < 900; i++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u); a.push(s * Math.cos(th), u, s * Math.sin(th)); } return new Float32Array(a); })();
  function drawBag(Tm, k) {
    const rx = .2 * k, ry = .13 * k, rz = .52 * k;
    for (let i = 0; i < BAG.length; i += 3) {
      const nx = BAG[i], ny = BAG[i + 1], nz = BAG[i + 2]; if (ny > .6) continue;
      const q = X.ap(Tm, [nx * rx, -.12 - ry + ny * ry, -.05 + nz * rz]);
      if (!P3v(q)) continue;
      const lit = Math.max(0, X.dir(Tm, [nx, ny, nz])[1]) * .5 + .3;
      put(PX, PY, PZ < 6 ? 2 : 1, 238, 238, 228, lit);
    }
  }
  /* canopy: 16 gores, seams brighter, suspension lines to the riser; collapses downwind on the ground */
  const GORES = 16, CAN_R = 2.05, LINE_L = 4.2;
  const CAN = (() => { const r = rng(9), a = []; for (let i = 0; i < 1700; i++) { a.push(r(), r() * TAU); } return new Float32Array(a); })();
  function drawChute(D) {
    const ax = V.norm(D.ca), inf = D.inf, gnd = D.chuteOut;
    const att = X.ap(X.make(D.M, D.p), [0, .16, -.1]);
    const [u1, u2] = GEO.perp(ax);
    // canopy shape: inflating dome; on the ground it lies flat and trails downwind
    const rad = CAN_R * (.25 + .75 * inf), depth = CAN_R * .75 * (.3 + .7 * inf);
    let base = V.mad(att, ax, LINE_L * (.55 + .45 * inf));
    let flat = 0;
    if (gnd) { flat = gnd; base = V.lerp(base, V.add(att, [D.wd[0] * 3.2, -.1, D.wd[1] * 3.2]), flat); }
    const col = WH;
    for (let i = 0; i < CAN.length; i += 2) {
      const v = CAN[i], th = CAN[i + 1];
      const seam = Math.abs(fmod(th / TAU * GORES, 1) - .5) > .44;
      const bil = 1 + .06 * Math.sin(th * GORES) * inf;           // gores bulge between the seams
      const rr = rad * Math.sin(v * Math.PI / 2) * bil, hh = depth * Math.cos(v * Math.PI / 2);
      let q = V.add(V.add(V.mad(base, ax, hh), V.mul(u1, Math.cos(th) * rr)), V.mul(u2, Math.sin(th) * rr));
      if (flat > 0) { const g = [q[0], D.gy + .05 + .12 * Math.abs(Math.sin(th * 3 + v * 5)) * (1 - flat), q[2]]; q = V.lerp(q, [mix(q[0], base[0], .2) + (D.wd[0]) * v * 2.2, g[1], mix(q[2], base[2], .2) + D.wd[1] * v * 2.2], flat); }
      if (!P3v(q)) continue;
      put(PX, PY, PZ < 10 ? 2 : 1, col[0], col[1], col[2], (seam ? .85 : .42 + .25 * v) * (.5 + .5 * inf));
    }
    // suspension lines skirt -> confluence -> riser
    if (!gnd || gnd < .8) {
      const conf = V.mad(att, ax, .5), la = (1 - (gnd || 0));
      for (let g = 0; g < GORES; g++) {
        const th = g / GORES * TAU, sk = V.add(V.add(V.mad(base, ax, 0), V.mul(u1, Math.cos(th) * rad)), V.mul(u2, Math.sin(th) * rad));
        dline3(conf, sk, .09, 1, WH, .5 * la);
      }
      dline3(att, conf, .05, 1, WH, .7 * la);
    }
  }

  /* hero drone pose at film time T (one reused object) */
  const HERO = { p: [0, 0, 0], M: R.I(), psi: 0, pitch: 0, phi: 0, s: 0, prop: 0, omega: 0, gimYaw: 0, gimPitch: 0, ail: 0, elev: 0, rud: 0, eo: 1, bag: 0, inf: 0, ca: [0, 1, 0], chuteOut: 0, gy: 0, wd: [0, 0], v: 0 };
  const RS2 = { p: [0, 0, 0], ca: [0, 0, 0] }, RS3 = { p: [0, 0, 0], ca: [0, 0, 0] };
  const WD = V.norm([W.WIND[0], 0, W.WIND[1]]);
  function heroAt(T, o) {
    o = o || HERO;
    const s = simOf(T), q = W.routeAt(s, RS2);
    o.s = s; o.p[0] = q.p[0]; o.p[1] = q.p[1]; o.p[2] = q.p[2];
    o.psi = q.psi; o.phi = q.phi; o.pitch = q.gam + (s > T_LAUNCH + .4 && q.eng > .5 ? 2.2 * DEG : 0);
    o.M = droneM(o.psi, o.pitch, o.phi);
    o.v = q.v; o.inf = q.inf; o.bag = q.bag; o.ca[0] = q.ca[0]; o.ca[1] = q.ca[1]; o.ca[2] = q.ca[2];
    o.chuteOut = EV.touch && s > EV.touch ? ss(0, 3.2, s - EV.touch) : 0;
    o.gy = W.yAt(o.p[0], o.p[2]); o.wd[0] = WD[0]; o.wd[1] = WD[2];
    o.prop = T < T_LAUNCH ? thRail(unwrapT(T)) : thFly(s);
    o.omega = (T < T_LAUNCH ? REV(unwrapT(T)) : 116 * q.eng) * TAU * (T < T_LAUNCH ? 1 : rateOf(T));
    controls(T, o, s);
    gimbal(T, o);
    return o;
  }
  /* the next drone on the rail (and the hero before launch) */
  const RAILD = Object.assign({}, HERO, { p: [0, 0, 0], ca: [0, 1, 0], wd: [0, 0] });
  function railDrone(T) {
    const o = RAILD, u = unwrapT(T), p = W.railW(0);
    o.p[0] = p[0]; o.p[1] = p[1]; o.p[2] = p[2]; o.psi = W.CAT.hdg; o.pitch = HD.catapult.RAIL.pitch; o.phi = 0;
    o.M = droneM(o.psi, o.pitch, 0); o.inf = 0; o.bag = 0; o.chuteOut = 0;
    o.prop = u > -2 ? thRail(u) : .6; o.omega = (u > -2 ? REV(u) : 0) * TAU;
    controls(u, o, u); gimbal(u < 0 ? u : T, o);
    return o;
  }
  /* the previous sortie's drone, down on its airbag with the canopy collapsed beside it */
  const PREV = Object.assign({}, HERO, { p: [0, 0, 0], ca: [0, 1, 0], wd: [0, 0] });
  function prevDrone() {
    const o = PREV, q = W.routeAt(route.end, RS3);
    o.p[0] = q.p[0]; o.p[1] = q.p[1]; o.p[2] = q.p[2]; o.psi = q.psi; o.pitch = q.gam; o.phi = q.phi; o.M = droneM(o.psi, o.pitch, o.phi);
    o.inf = q.inf; o.bag = 1; o.ca[0] = q.ca[0]; o.ca[1] = q.ca[1]; o.ca[2] = q.ca[2]; o.chuteOut = 1; o.gy = W.yAt(o.p[0], o.p[2]); o.wd[0] = WD[0]; o.wd[1] = WD[2];
    o.prop = 1.1; o.omega = 0; o.gimYaw = Math.PI; o.gimPitch = 0; o.ail = 0; o.elev = 0; o.rud = 0; o.eo = 0;
    return o;
  }
  /* control surfaces: pre-flight check on the rail, then the autopilot's roll/pitch activity */
  function controls(T, o, s) {
    const u = unwrapT(T);
    if (u < T_LAUNCH && u > -3) {
      const ck = (a, b, t) => Math.sin(TAU * sat((t - a) / (b - a))) * (t > a && t < b ? 1 : 0);
      o.ail = 18 * DEG * ck(2.2, 3.4, u); o.elev = 16 * DEG * ck(3.6, 4.6, u); o.rud = 20 * DEG * ck(4.8, 5.8, u);
      return;
    }
    const s1 = simOf(Math.min(DUR, T + .25)), s0 = simOf(Math.max(0, T - .25));
    const q1 = W.routeAt(s1, RS3), phi1 = q1.phi, g1 = q1.gam, q0 = W.routeAt(s0, RS3), phi0 = q0.phi, g0 = q0.gam;
    const dphi = (phi1 - phi0) / Math.max(.05, s1 - s0), dg = (g1 - g0) / Math.max(.05, s1 - s0);
    const gust = M3.noise(T * .9, 3.3) * 2.5 * DEG;
    o.ail = E.clamp(dphi * 1.6 + gust, -22 * DEG, 22 * DEG);
    o.elev = E.clamp(-dg * 4 - 1.5 * DEG + M3.noise(T * .7, 8.1) * 1.5 * DEG, -20 * DEG, 20 * DEG);
    o.rud = E.clamp(dphi * .4 + M3.noise(T * .6, 1.9) * 1.5 * DEG, -15 * DEG, 15 * DEG);
    if (o.inf > .01) { o.ail *= .2; o.elev = -12 * DEG; o.rud *= .2; }
  }

  /* ---------- the EO ball: what the drone looks at ---------- */
  const SHIPY = 14;
  const LOOK = [   // [T0, T1, target(T) -> world point | null (nadir-forward)]
    [9.4, 15.8, () => V.add([W.TELS[0].x, W.TELS[0].y, W.TELS[0].z], [0, 2, 0])],
    [15.8, 21.5, () => [W.PZ.x, W.PZ.y + 2, W.PZ.z]],
    // after the hit the ball stays on the burning ship, over the tail, through the squall
    [74, T_EO_OFF, T => eoAim(T, simOf(T), false)],
    [140, 146.5, () => [W.EV.chute ? route.x[Math.round(EV.chute / route.dt)] : 0, W.padY, route.z[Math.round(EV.chute / route.dt)] - 220]],
  ];
  function gimbal(T, o) {
    const u = unwrapT(T);
    if (u < T_LAUNCH) {
      // self-test pan before launch, then look ahead along the rail
      o.gimYaw = 70 * DEG * Math.sin(TAU * (u - 1) / 5.5) * (1 - ss(6.2, 7.6, u)) * ss(-.5, 1, u);
      o.gimPitch = (12 + 14 * Math.sin(u * .9)) * DEG * (1 - ss(6.5, 7.8, u)) + 6 * DEG;
      o.eo = ss(-.5, .8, u); return;
    }
    if (o.inf > .01) { o.gimYaw = mix(o.gimYaw, Math.PI, ss(0, 1, o.inf)); o.gimPitch = mix(o.gimPitch, 0, o.inf); o.eo = 1 - o.inf; return; }
    // body-frame direction to each candidate; blend by window weights
    let dx = 0, dy = -.93, dz = .37, wsum = 0;          // default: down and ahead (survey)
    if (T > 56 && T < 75) { dx = 0; dy = -.2; dz = 1; }
    if (T > 117 && T < 140) { dx = 0; dy = -.25; dz = 1; }
    const acc = [dx, dy, dz];
    for (const [a, b, fn] of LOOK) {
      const w = ss(a - .9, a, T) * (1 - ss(b, b + .9, T)); if (w <= 0) continue;
      const tg = fn(T), d = V.sub(tg, o.p), l = [o.M[0] * d[0] + o.M[3] * d[1] + o.M[6] * d[2], o.M[1] * d[0] + o.M[4] * d[1] + o.M[7] * d[2], o.M[2] * d[0] + o.M[5] * d[1] + o.M[8] * d[2]];
      const n = V.norm(l); acc[0] = mix(acc[0], n[0], w); acc[1] = mix(acc[1], n[1], w); acc[2] = mix(acc[2], n[2], w); wsum += w;
    }
    // slow scan while surveying
    const d = V.norm(acc);
    o.gimYaw = Math.atan2(d[0], d[2]) + (T > 21 && T < 52 ? .25 * Math.sin(T * .7) : 0);
    o.gimPitch = Math.atan2(-d[1], Math.hypot(d[0], d[2]));
    o.eo = 1;
  }

  /* ---------- camera ---------- */
  // smoothed heading in film time (the chase frame must not whip through compressed turns)
  const HS = (() => {
    const n = Math.round(DUR * 30), raw = new Float64Array(n + 1), out = new Float64Array(n + 1), q = { p: [0, 0, 0], ca: [0, 0, 0] };
    let prev = null;
    for (let i = 0; i <= n; i++) { const T = i / 30, a = T < T_LAUNCH ? W.CAT.hdg : W.routeAt(simOf(T), q).psi; raw[i] = prev === null ? a : prev + wrapA(a - prev); prev = raw[i]; }
    const sg = 18, K = []; let ks = 0; for (let k = -3 * sg; k <= 3 * sg; k++) { const w = Math.exp(-k * k / (2 * sg * sg)); K.push(w); ks += w; }
    for (let i = 0; i <= n; i++) { let a = 0; for (let k = -3 * sg; k <= 3 * sg; k++) a += raw[E.clamp(i + k, 0, n)] * K[k + 3 * sg]; out[i] = a / ks; }
    return out;
  })();
  const psiS = T => { const x = E.clamp(T * 30, 0, HS.length - 1.001), i = x | 0; return HS[i] + (HS[i + 1] - HS[i]) * (x - i); };
  const loc = (p, psi, o) => { const c = Math.cos(psi), s = Math.sin(psi); return [p[0] + o[0] * c + o[2] * s, p[1] + o[1], p[2] - o[0] * s + o[2] * c]; };
  // chase rig: eye / target offsets in the drone's heading frame [right, up, forward]
  // chase rig: eye offset in the drone's heading frame [right, up, forward] and WHERE THE DRONE SITS ON SCREEN
  // ([px right, px down] from the composition centre); the look direction is solved from that every frame
  const CHASE = FILM.path([
    { t: 0, eye: [-1.4, .72, -3.6], target: [100, 128, 0], fov: 44 },
    { t: 8.5, eye: [-1.4, .72, -3.6], target: [100, 128, 0], fov: 44 },
    { t: 9.3, eye: [-1.8, .9, -5], target: [70, 95, 0], fov: 46 },
    { t: 10.8, eye: [-3.4, 3.2, -9], target: [60, 40, 0], fov: 46 },
    { t: 12.6, eye: [-3, 4, -16], target: [250, -40, 0], fov: 44 },
    { t: 14.2, eye: [-3, 4.5, -16], target: [240, -60, 0], fov: 44 },
    { t: 16.5, eye: [-5, 5.5, -11], target: [-40, -180, 0], fov: 52 },
    { t: 18.8, eye: [-3, 10, -12], target: [-60, -330, 0], fov: 56 },
    { t: 21.2, eye: [-2, 11, -9], target: [-40, -330, 0], fov: 56 },
    { t: 25, eye: [11, 4, 10], target: [-170, -270, 0], fov: 56 },
    { t: 31, eye: [11, 4.5, 12], target: [-150, -300, 0], fov: 56 },
    { t: 35.5, eye: [4, 5, 15], target: [-90, -330, 0], fov: 56 },
    { t: 44, eye: [3, 5, 14], target: [-80, -330, 0], fov: 56 },
    { t: 48.5, eye: [6, 24, 44], target: [-110, -300, 0], fov: 56 },
    { t: 52.6, eye: [2, 32, 52], target: [-120, -250, 0], fov: 58 },
    { t: 55.8, eye: [-40, 66, -58], target: [-170, 340, 0], fov: 58 },
    { t: 59, eye: [-14, 14, -28], target: [-120, 220, 0], fov: 50 },
    { t: 62, eye: [6, 13, -24], target: [-150, 250, 0], fov: 48 },
    { t: 68.5, eye: [14, 42, -62], target: [-240, 300, 0], fov: 52 },
    { t: 77, eye: [16, 46, -66], target: [-260, 310, 0], fov: 52 },
    { t: 84, eye: [12, 26, -46], target: [-230, 260, 0], fov: 48 },
    { t: 86, eye: [8, 16, -34], target: [-200, 220, 0], fov: 46 },
    { t: 118, eye: [5, 5, -16], target: [-120, 120, 0], fov: 46 },
    { t: 131, eye: [-6, 5, -15], target: [-60, 110, 0], fov: 46 },
    { t: 135.5, eye: [-7, 8, -22], target: [-70, 150, 0], fov: 46 },
    { t: 138, eye: [-6, 10, -26], target: [-60, 170, 0], fov: 46 },
    { t: 139.8, eye: [24, 14, 4], target: [-40, 150, 0], fov: 46 },
    { t: 141.5, eye: [10, 11, 30], target: [-60, 160, 0], fov: 46 },
    { t: 143.5, eye: [6, 6, 22], target: [-60, 120, 0], fov: 46 },
    { t: 146, eye: [6, 6, 22], target: [-60, 120, 0], fov: 46 },
    { t: DUR, eye: [6, 6, 22], target: [-60, 120, 0], fov: 46 },
  ]);
  /* look target that puts world point P at screen offset (sx, sy) from centre, seen from eye with this fov */
  function aimAt(eye, P, sx, sy, fovDeg) {
    const fl = 540 / Math.tan(fovDeg * DEG / 2), d = V.norm(V.sub(P, eye));
    let f = d;
    for (let it = 0; it < 4; it++) {
      let r = V.cross([0, 1, 0], f); const rl = V.len(r); r = rl > 1e-6 ? V.mul(r, 1 / rl) : [1, 0, 0];
      const u = V.cross(f, r);
      f = V.norm(V.add(V.add(d, V.mul(r, -sx / fl)), V.mul(u, sy / fl)));
    }
    return V.add(eye, V.mul(f, 100));
  }
  function chaseShot(T, D) {
    const k = CHASE(T), ps = psiS(T), fov = k.fov / DEG;
    const dr = FILM.drift(T, T > 10 ? .35 : .04, 3);
    const eye = V.add(loc(D.p, ps, k.eye), dr);
    return { eye, target: aimAt(eye, D.p, k.target[0], k.target[1], fov), fov, roll: -D.phi * .32 };
  }
  /* framing probe: screen positions of the drone and the things a shot is about */
  function probe(T) {
    const D = heroAt(T), sh = cameraAt(T, D);
    cam.eye = sh.eye; cam.target = sh.target; cam.fov = sh.fov * DEG; cam.roll = sh.roll; cam.cx = 850; cam.cy = 540; cam.shake = [0, 0]; cam.update();
    const pr = p => { const q = cam.project(p); return q ? [Math.round(q[0]), Math.round(q[1])] : null; };
    const c = W.SHIP.at(D.s);
    return { drone: pr(D.p), tel1: pr([W.TELS[0].x, W.TELS[0].y + 2, W.TELS[0].z]), pz: pr([W.PZ.x, W.PZ.y + 2, W.PZ.z]), ship: pr([c[0], 10, c[1]]), dist: +V.dist(sh.eye, D.p).toFixed(1) };
  }
  // over-the-shoulder long lens: the drone in the foreground, the ship beyond
  function contactShot(T, D) {
    const c = W.SHIP.at(D.s), sp = [c[0], SHIPY, c[1]];
    // on the line of sight from the ship through the drone, nudged so the drone sits lower-left of the ship
    const a = V.norm(V.sub(D.p, sp)), f = V.mul(a, -1), r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r);
    const eye = V.add(V.add(D.p, V.mul(a, 48)), V.add(V.mul(r, 3.1), V.mul(u, 1.9)));
    return { eye, target: aimAt(eye, sp, 110, -40, 8.2), fov: 8.2, roll: 0 };
  }
  // recovery + the drift to the rail, in world coordinates, keyed on u (film time around the seam)
  const UC = T_CHUTE - DUR, UT = T_TOUCH - DUR;
  // recovery + the drift to the rail: world eye path keyed on u (film time around the seam); the view is
  // anchored on the hero drone (target = its screen spot), then hands over to the next drone on the rail
  const REC = (() => {
    const Dc = heroAt(T_CHUTE - 1, Object.assign({}, HERO, { p: [0, 0, 0], ca: [0, 0, 0], wd: [0, 0] }));
    const ch = CHASE(T_CHUTE - 1), cEye = loc(Dc.p, psiS(T_CHUTE - 1), ch.eye);
    const land = W.routeAt(route.end, { p: [0, 0, 0], ca: [0, 0, 0] }).p.slice();
    const railP = W.railW(0), hd = W.CAT.hdg, rl = o => loc(railP, hd, o);
    const toRail = V.norm([railP[0] - land[0], 0, railP[2] - land[2]]);
    const keys = [
      { t: UC - 1, eye: cEye, target: [ch.target[0], ch.target[1], 0], fov: ch.fov / DEG },
      { t: UC + 1.4, eye: loc(Dc.p, Dc.psi, [8, 4, 78]), target: [-60, 140, 0], fov: 48 },
      { t: UC + 4.5, eye: V.add(land, [-34, 30, 26]), target: [-160, -120, 0], fov: 46 },
      { t: UT - 2.5, eye: V.add(land, [-19, 13, 17]), target: [-110, -40, 0], fov: 44 },
      { t: UT + .8, eye: V.add(land, [-8, 7, 17]), target: [-120, 90, 0], fov: 44 },
      { t: UT + 3.6, eye: V.add(land, [-6, 7.5, -7]), target: [20, 110, 0], fov: 34 },
      { t: -1.3, eye: rl([-3.7, .8, -5.8]), target: [60, 100, 0], fov: 44 },
      { t: 0, eye: rl([-2.7, .52, -4.3]), target: [0, 0, 1], fov: 44 },
      { t: 3.4, eye: rl([-2.25, .55, -3.95]), target: [0, 0, 1], fov: 44 },
      { t: 5.6, eye: rl([-1.8, .65, -3.8]), target: [0, 0, 1], fov: 44 },
      { t: 7.2, eye: rl([-1.4, .72, -3.6]), target: [0, 0, 1], fov: 44 },
      { t: 10, eye: rl([-1.4, .72, -3.6]), target: [0, 0, 1], fov: 44 },
    ];
    // frame 0 onward: aim at fixed rail-frame points (continuity with the chase hand-off at 7.3-8.35)
    const RT = FILM.path([
      { t: -1.3, target: rl([1.9, .8, 9]), eye: [0, 0, 0] }, { t: 0, target: rl([1.8, .85, 9]), eye: [0, 0, 0] },
      { t: 3.4, target: rl([1.4, .7, 7]), eye: [0, 0, 0] }, { t: 5.6, target: rl([.8, .45, 4]), eye: [0, 0, 0] }, { t: 7.2, target: rl([.3, .2, 2]), eye: [0, 0, 0] }, { t: 10, target: rl([.3, .2, 2]), eye: [0, 0, 0] },
    ]);
    return { path: FILM.path(keys), RT, railP };
  })();
  const PREVP = { p: [0, 0, 0] };
  function recShot(T) {
    const u = unwrapT(T), k = REC.path(u), fov = k.fov * 180 / Math.PI;
    if (u >= -1.3) { const q = REC.RT(u); return { eye: k.eye, target: q.target, fov, roll: 0 }; }
    // anchor: the falling drone, sliding over to the rail drone while the camera drifts across
    const hp = u < UT + 1 ? heroAt(T, RECD).p : W.routeAt(route.end, RS3).p;
    // the anchor must reach the rail before the eye walks past the landed drone (else it swings behind the eye)
    const w = ss(UT + 1.4, UT + 3.8, u), anchor = V.lerp(hp, W.railW(0), w);
    const tgt = aimAt(k.eye, anchor, k.target[0], k.target[1], fov);
    if (w > 0) { const q = REC.RT(-1.3); return { eye: k.eye, target: V.lerp(tgt, q.target, ss(0, 1, w) * ss(-4.5, -1.3, u)), fov, roll: 0 }; }
    return { eye: k.eye, target: tgt, fov, roll: 0 };
  }
  const RECD = Object.assign({}, HERO, { p: [0, 0, 0], ca: [0, 0, 0], wd: [0, 0] });
  function cameraAt(T, D) {
    const u = unwrapT(T);
    const wRec = u < 0 ? ss(UC - 1.4, UC + .4, u) : 1 - ss(7.3, 8.35, u);
    const wCon = ss(87, 92.5, T) * (1 - ss(113.5, 119, T));
    let shots = [], ws = [];
    if (wRec > 0) { shots.push(recShot(T)); ws.push(wRec); }
    if (wCon > 0) { shots.push(contactShot(T, D)); ws.push(wCon); }
    const wCh = Math.max(0, 1 - wRec - wCon);
    if (wCh > 0) { shots.push(chaseShot(T, D)); ws.push(wCh); }
    const tot = ws.reduce((a, b) => a + b, 0);
    const o = { eye: [0, 0, 0], target: [0, 0, 0], fov: 0, roll: 0 };
    shots.forEach((sh, i) => { const w = ws[i] / tot; o.eye = V.mad(o.eye, sh.eye, w); o.target = V.mad(o.target, sh.target, w); o.fov += sh.fov * w; o.roll += sh.roll * w; });
    return o;
  }

  /* ---------- world layers ---------- */
  const A1 = 68, A2 = 94;                                        // swath persistence (film s)
  const ageOf = (T, t0) => { let a = T - t0; if (a < 0) a += DUR; return a; };
  const fade = a => a < A1 ? 1 : 1 - ss(A1, A2, a);
  /* sky: the dawn band, dots at infinity */
  const SKYP = (() => {
    const r = rng(303), a = [];
    for (let i = 0; i < 9000; i++) {
      const az = r() * TAU, above = r() < .72, el = above ? Math.pow(r(), 2.6) * 11 * DEG : -Math.pow(r(), 1.6) * 1.4 * DEG;
      const sun = Math.pow(Math.max(0, Math.cos(az - 72 * DEG)), 3);
      const b = (above ? Math.exp(-el / (2.2 * DEG)) : Math.exp(el / (.5 * DEG))) * (.32 + .68 * sun) * (.6 + .4 * r());
      a.push(az, el, b);
    }
    return new Float32Array(a);
  })();
  const SKYV = (() => { const n = SKYP.length / 3, v = new Float32Array(n * 5); for (let i = 0; i < n; i++) { const az = SKYP[i * 3], el = SKYP[i * 3 + 1]; v[i * 5] = Math.sin(az); v[i * 5 + 1] = Math.cos(az); v[i * 5 + 2] = Math.sin(el); v[i * 5 + 3] = Math.cos(el); v[i * 5 + 4] = SKYP[i * 3 + 2]; } return v; })();
  function drawSky(dip, k) {
    for (let i = 0, n = SKYV.length; i < n; i += 5) {
      // el - dip, small-angle
      const se = SKYV[i + 2] - dip * SKYV[i + 3], ce = SKYV[i + 3] + dip * SKYV[i + 2];
      const dx = SKYV[i] * ce, dy = se, dz = SKYV[i + 1] * ce, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < .05) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      put(sx, sy, 1, SKYC[0], SKYC[1], SKYC[2], Math.min(1, SKYV[i + 4] * .85 * k));
    }
  }
  /* chart contours + open-water speckle: always there, dim */
  function drawChart(T) {
    const CH = W.CH, a0 = 1.05;
    for (let k = 0; k < CH.length; k += 4) {
      const x = CH[k], y = CH[k + 1], z = CH[k + 2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < 200) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      put(sx, sy, 1, WH[0], WH[1], WH[2], a0 * CH[k + 3] * (zc < 60000 ? 1 - zc / 90000 : .33));
    }
    const SF = W.SF, w = TAU * 38 / DUR;
    for (let k = 0; k < SF.length; k += 4) {
      const x = SF[k], z = SF[k + 1];
      const dx = x - E0, dy = -E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < 200) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      put(sx, sy, 1, WH[0], WH[1], WH[2], .3 * SF[k + 2] * (.65 + .35 * Math.sin(SF[k + 3] + T * w)));
    }
  }
  /* near-field sea: a world-fixed jittered lattice around the camera, so the water has texture and parallax */
  function drawSeaNear(T, span, step, al) {
    const gx0 = Math.floor((E0 - span) / step), gx1 = Math.floor((E0 + span) / step), gz0 = Math.floor((E2 - span) / step), gz1 = Math.floor((E2 + span) / step);
    const w = TAU * 60 / DUR;
    for (let i = gx0; i <= gx1; i++) for (let j = gz0; j <= gz1; j++) {
      const h1 = hsh(i * 7 + 3, j * 13 + 5), h2 = hsh(i * 11 + 1, j * 3 + 9);
      const x = (i + h1) * step, z = (j + h2) * step;
      if (z < 1500 && W.hAt(x, z) > -1) continue;
      const y = .9 * Math.sin(x * .031 + z * .017 + T * w) ;
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < 20) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      const d = Math.hypot(dx, dz), f = 1 - d / span; if (f <= 0) continue;
      put(sx, sy, 1, WH[0], WH[1], WH[2], al * f * (.5 + .5 * Math.sin(h1 * 40 + T * w * 1.7)));
    }
  }
  /* ---------- terrain: a procedural lattice at constant on-screen density ----------
     World-fixed jittered lattices, one per LOD step; each serves a distance band and is thinned
     with (d0/d)^2 inside it, so the dot spacing on screen stays ~TPX px from 200 m to the horizon.
     A point shows only where a sensor has swept it: swath maps, the ping, or the home pad. */
  const HG = W.HG, HG2 = W.HG2, M1 = W.SW1.map, M2 = W.SW2.map, CO = W.COAST;
  const HOME = { x: -40, z: -560, r: 820 }, RING_C = [-40.5, -575.5], RING_R = 205, TPX = 6.6, TANF = Math.tan(W.FAN);
  let BMASK = new Uint8Array(1 << 16);
  const LAY = []; for (let s = .9, k = 0; k < 11; k++, s *= 2) LAY.push(s);
  const fadeC = a => a < 44 ? 1 : 1 - ss(44, 70, a);
  let terrainK = 1;                                           // picture quality (rain drops returns)
  const HULL = new Float64Array(160), FPP = new Float64Array(160), FPI = new Int32Array(80), HLO = new Int32Array(80), HUP = new Int32Array(80);
  let HN = 0;
  /* convex hull (monotone chain) of FPP[0..n) -> HULL (x, z pairs), HN vertices */
  function hull2(n) {
    for (let i = 0; i < n; i++) FPI[i] = i;
    const idx = Array.prototype.slice.call(FPI, 0, n).sort((a, b) => FPP[a * 2] - FPP[b * 2] || FPP[a * 2 + 1] - FPP[b * 2 + 1]);
    const cr = (o, a, b) => (FPP[a * 2] - FPP[o * 2]) * (FPP[b * 2 + 1] - FPP[o * 2 + 1]) - (FPP[a * 2 + 1] - FPP[o * 2 + 1]) * (FPP[b * 2] - FPP[o * 2]);
    let nl = 0, nu = 0;
    for (let k = 0; k < n; k++) { const i = idx[k]; while (nl >= 2 && cr(HLO[nl - 2], HLO[nl - 1], i) <= 0) nl--; HLO[nl++] = i; }
    for (let k = n - 1; k >= 0; k--) { const i = idx[k]; while (nu >= 2 && cr(HUP[nu - 2], HUP[nu - 1], i) <= 0) nu--; HUP[nu++] = i; }
    HN = 0;
    for (let k = 0; k < nl - 1; k++) { HULL[HN * 2] = FPP[HLO[k] * 2]; HULL[HN * 2 + 1] = FPP[HLO[k] * 2 + 1]; HN++; }
    for (let k = 0; k < nu - 1; k++) { HULL[HN * 2] = FPP[HUP[k] * 2]; HULL[HN * 2 + 1] = FPP[HUP[k] * 2 + 1]; HN++; }
  }
  function footprint(maxD) {
    let n = 0;
    for (let pl = 0; pl < 2; pl++) {
      const yp = pl ? 330 : 0;
      for (let k = 0; k < 32; k++) {
        const q = k >> 3, f = (k & 7) / 8;
        const sx = q === 0 ? f * VW : q === 1 ? VW : q === 2 ? VW - f * VW : 0, sy = q === 0 ? 0 : q === 1 ? f * VH : q === 2 ? VH : VH - f * VH;
        const a = (sx - CX) / FL, b = -(sy - CY) / FL;
        const dx = F0 + R0 * a + U0 * b, dy = F1 + R1 * a + U1 * b, dz = F2 + R2 * a + U2 * b, hl = Math.hypot(dx, dz) || 1e-9;
        let t = dy < -1e-5 ? (yp - E1) / dy : 1e12; if (t < 0) t = 1e12;
        if (t * hl > maxD) { FPP[n * 2] = E0 + dx / hl * maxD; FPP[n * 2 + 1] = E2 + dz / hl * maxD; }
        else { FPP[n * 2] = E0 + dx * t; FPP[n * 2 + 1] = E2 + dz * t; }
        n++;
      }
    }
    FPP[n * 2] = E0; FPP[n * 2 + 1] = E2; n++;
    hull2(n);
  }
  let SP0 = 0, SP1 = 0;
  function hullSpan(z) {
    let x0 = 1e12, x1 = -1e12;
    for (let k = 0; k < HN; k++) {
      const k2 = (k + 1) % HN, ax = HULL[k * 2], az = HULL[k * 2 + 1], bx = HULL[k2 * 2], bz = HULL[k2 * 2 + 1];
      if ((az <= z && bz >= z) || (bz <= z && az >= z)) {
        let xa, xb;
        if (az === bz) { xa = Math.min(ax, bx); xb = Math.max(ax, bx); } else { xa = xb = ax + (bx - ax) * (z - az) / (bz - az); }
        if (xa < x0) x0 = xa; if (xb > x1) x1 = xb;
      }
    }
    SP0 = x0; SP1 = x1; return x1 >= x0;
  }
  /* is anything in this 96 m block showing now? Reads only constants and per-frame slots (no object fields) */
  const BKc = +W.BK.c, BKx0 = +W.BK.x0, BKz0 = +W.BK.z0, BKnx = W.BK.nx | 0, BKnz = W.BK.nz | 0;
  const BT1L = W.BK.t1lo, BT1H = W.BK.t1hi, BT2L = W.BK.t2lo, BT2H = W.BK.t2hi;
  const HOMEX = +HOME.x, HOMEZ = +HOME.z, HOMER2 = (HOME.r + 70) * (HOME.r + 70);
  const COX0 = CO.x0 - 70, COX1 = CO.x1 + 70, COZ0 = CO.z0 - 70, COZ1 = CO.z1 + 70, PGX = +W.pingAt[0], PGZ = +W.pingAt[2];
  let bsT = 0, bsTw = 0, bsA1 = false, bsA2 = false, bsAC = false, bsPr = -1, bsPr0 = 0;
  // per block: can the ping light it (land or shallows at the block centre), precomputed once
  const BKL = (() => { const a = new Uint8Array(BKnx * BKnz); for (let j = 0; j < BKnz; j++) for (let i = 0; i < BKnx; i++) a[j * BKnx + i] = W.hAt(BKx0 + (i + .5) * BKc, BKz0 + (j + .5) * BKc) > -25 ? 1 : 0; return a; })();
  function blockOn(bi, bj) {
    if (bi < 0 || bj < 0 || bi >= BKnx || bj >= BKnz) return false;
    const k = bj * BKnx + bi, xc = BKx0 + (bi + .5) * BKc, zc = BKz0 + (bj + .5) * BKc;
    const hx = xc - HOMEX, hz = zc - HOMEZ; if (hx * hx + hz * hz < HOMER2) return true;
    const T = bsT, Tw = bsTw;
    if (bsA1) { const a = BT1L[k], b = BT1H[k]; if (a < 1e8 && ((a <= T && b >= T - A2) || (a <= Tw && b >= Tw - A2))) return true; }
    if (bsA2) { const a = BT2L[k], b = BT2H[k]; if (a < 1e8 && ((a <= T && b >= T - A2) || (a <= Tw && b >= Tw - A2))) return true; }
    if (bsAC && BKL[k] === 1 && xc > COX0 && xc < COX1 && zc > COZ0 && zc < COZ1) { const ex = xc - PGX, ez = zc - PGZ, d = Math.sqrt(ex * ex + ez * ez); if (d < bsPr + 70 && d > bsPr0 - 70) return true; }
    return false;
  }
  function drawTerrain(T) {
    // every object field the hot loop needs is copied into a local once per frame: object shapes elsewhere in
    // the page may change (field representations generalise) and the loop must not depend on them
    const act1 = ageOf(T, 15) < A2 + 40, act2 = ageOf(T, W.SW2.lt[0]) < A2 + 12, actC = T > T_PING && T < T_PING + 58;
    const hX = +HOME.x, hZ = +HOME.z, hR = +HOME.r;
    let bx0 = hX - hR, bx1 = hX + hR, bz0 = hZ - hR, bz1 = hZ + hR;
    const m1x0 = +M1.x0, m1z0 = +M1.z0, m1x1 = +M1.x1, m1z1 = +M1.z1, m1nx = M1.nx | 0, m1nz = M1.nz | 0, m1t = M1.t, m1i = 1 / M1.c;
    const m2x0 = +M2.x0, m2z0 = +M2.z0, m2x1 = +M2.x1, m2z1 = +M2.z1, m2nx = M2.nx | 0, m2nz = M2.nz | 0, m2t = M2.t, m2i = 1 / M2.c;
    const cox0 = +CO.x0, cox1 = +CO.x1, coz0 = +CO.z0, coz1 = +CO.z1;
    if (act1) { bx0 = Math.min(bx0, m1x0); bx1 = Math.max(bx1, m1x1); bz0 = Math.min(bz0, m1z0); bz1 = Math.max(bz1, m1z1); }
    if (act2) { bx0 = Math.min(bx0, m2x0); bx1 = Math.max(bx1, m2x1); bz0 = Math.min(bz0, m2z0); bz1 = Math.max(bz1, m2z1); }
    if (actC) { bx0 = Math.min(bx0, cox0); bx1 = Math.max(bx1, cox1); bz0 = Math.min(bz0, coz0); bz1 = Math.max(bz1, coz1); }
    footprint(48000);
    const pcx = +W.pingAt[0], pcz = +W.pingAt[2], pspd = +W.PSPD, ve = +W.VE;
    const ringCx = +RING_C[0], ringCz = +RING_C[1], wl = TAU * 50 / DUR;
    const MM = W.MM, mmx0 = +MM.x0, mmz0 = +MM.z0, mmc = +MM.c, mmnx = MM.nx | 0, mmnz = MM.nz | 0, mmMn = MM.mn, mmMx = MM.mx;
    const BK = W.BK, BC = +BK.c, bkx0 = +BK.x0, bkz0 = +BK.z0, bknx = BK.nx | 0, bknz = BK.nz | 0;
    const g1x0 = +HG.x0, g1z0 = +HG.z0, g1nx = HG.nx | 0, g1nz = HG.nz | 0, g1h = HG.h, g1s = HG.s, hgi = 1 / HG.d;
    const g2x0 = +HG2.x0, g2z0 = +HG2.z0, g2nx = HG2.nx | 0, g2nz = HG2.nz | 0, g2h = HG2.h, g2s = HG2.s, hg2i = 1 / HG2.d;
    bsT = T; bsTw = T + DUR; bsA1 = act1; bsA2 = act2; bsAC = actC; bsPr = actC ? (T - T_PING) * pspd : -1; bsPr0 = actC ? Math.max(0, (T - T_PING - 57) * pspd) : 0;
    const rtK = Math.max(1, rateOf(T)), hr2 = hR * hR, hin = hR * .6, hin2 = hin * hin, hinv = 1 / (hR - hin), RR2 = RING_R * RING_R, AFI = 1 / (A2 - A1), tK = terrainK;
    const e0 = E0, e1 = E1, e2 = E2, f0 = F0, f1 = F1, f2 = F2, r0 = R0, r1 = R1, r2 = R2, u0 = U0, u1 = U1, u2 = U2, fl = FL, cx = CX, cy = CY, vw = VW, vh = VH;
    // active 96 m blocks over (regions ∩ footprint), computed once per frame
    let fx0 = 1e12, fx1 = -1e12, fz0 = 1e12, fz1 = -1e12;
    for (let k = 0; k < HN; k++) { const qx = HULL[k * 2], qz = HULL[k * 2 + 1]; if (qx < fx0) fx0 = qx; if (qx > fx1) fx1 = qx; if (qz < fz0) fz0 = qz; if (qz > fz1) fz1 = qz; }
    const mi0 = Math.max(-1, Math.floor((Math.max(bx0, fx0) - bkx0) / BC)) | 0, mi1 = Math.min(bknx, Math.floor((Math.min(bx1, fx1) - bkx0) / BC)) | 0;
    const mj0 = Math.max(-1, Math.floor((Math.max(bz0, fz0) - bkz0) / BC)) | 0, mj1 = Math.min(bknz, Math.floor((Math.min(bz1, fz1) - bkz0) / BC)) | 0;
    const mnx = Math.max(0, mi1 - mi0 + 1) | 0, mnz = Math.max(0, mj1 - mj0 + 1) | 0;
    if (mnx * mnz > BMASK.length) BMASK = new Uint8Array(mnx * mnz * 1.3 | 0);
    const BM = BMASK;
    for (let bj = 0; bj < mnz; bj++) for (let bi = 0; bi < mnx; bi++) {
      if (!blockOn(mi0 + bi, mj0 + bj)) { BM[bj * mnx + bi] = 0; continue; }
      const xc = bkx0 + (mi0 + bi + .5) * BC, zc = bkz0 + (mj0 + bj + .5) * BC, mi = Math.floor((xc - mmx0) / mmc), mj = Math.floor((zc - mmz0) / mmc);
      BM[bj * mnx + bi] = mi >= 0 && mj >= 0 && mi < mmnx && mj < mmnz && mmMx[mj * mmnx + mi] <= .05 ? 2 : 1;
    }
    // the swing over the ping-lit coast sees the most ground of the film: a slightly coarser lattice there
    const tpx = TPX * (1 + .24 * ss(53.8, 55, T) * (1 - ss(61, 64, T)));
    let drawn = 0; const its = [];
    for (let L = 0; L < LAY.length; L++) {
      let IT = 0;
      const s = +LAY[L], d0 = fl * s / (L >= 3 ? tpx * 1.25 : tpx), lo = L === 0 ? 0 : d0, hi = 2 * d0, d02 = d0 * d0, lo2 = lo * lo, hi2 = hi * hi, local = hi < 2600, jit = .8 * s / 256;
      const j0 = Math.ceil(Math.max(bz0, e2 - hi) / s) | 0, j1 = Math.floor(Math.min(bz1, e2 + hi) / s) | 0;
      for (let j = j0; j <= j1; j = (j + 1) | 0) {
        const zr = j * s, dz = zr - e2;
        // the ground's height range along this row bounds where the band shell can meet it
        let yLo = 0, yHi = 340;
        if (local) {
          const mj = Math.floor((zr - mmz0) / mmc);
          if (mj >= 0 && mj < mmnz) {
            yLo = 1e9; yHi = -1e9;
            const ma = Math.max(0, Math.floor((e0 - hi - mmx0) / mmc)), mb = Math.min(mmnx - 1, Math.floor((e0 + hi - mmx0) / mmc));
            for (let m = ma; m <= mb; m++) { const k = mj * mmnx + m; if (mmMn[k] < yLo) yLo = mmMn[k]; if (mmMx[k] > yHi) yHi = mmMx[k]; }
            if (yHi < yLo) { yLo = 0; yHi = 340; }
          }
        }
        const gMin = Math.max(0, e1 - yHi), gMax = Math.max(0, e1 - yLo), gMid = (gMin + gMax) * .5;
        if (gMin >= hi) continue;
        const hr = Math.sqrt(Math.max(0, hi2 - gMin * gMin));
        if (Math.abs(dz) > hr + s) continue;
        if (!hullSpan(zr)) continue;
        const ro = Math.sqrt(Math.max(0, hr * hr - dz * dz)) + s;
        const xa = Math.max(SP0 - s, bx0, e0 - ro), xb = Math.min(SP1 + s, bx1, e0 + ro);
        if (xb < xa) continue;
        const loH = Math.sqrt(Math.max(0, lo2 - gMax * gMax)), ri = loH > Math.abs(dz) + s ? Math.sqrt(loH * loH - dz * dz) - s : -1;
        const bj = Math.floor((zr - bkz0) / BC) | 0, jz = (j + L * 7919) | 0;
        const gMin2 = gMin * gMin, gMax2 = gMax * gMax, gMid2 = gMid * gMid;
        // walk the row block by block, only through blocks that can show something
        if (bj < mj0 || bj > mj1) continue;
        const mrow = (bj - mj0) * mnx;
        let bi = Math.max(mi0, Math.floor((xa - bkx0) / BC)) | 0;
        const biEnd = Math.min(mi1, Math.floor((xb - bkx0) / BC)) | 0;
        for (; bi <= biEnd; bi = (bi + 1) | 0) {
          const bm = BM[mrow + bi - mi0]; if (bm === 0) continue; const seaBlk = bm === 2;
          let ia = Math.max(xa, bkx0 + bi * BC), ib = Math.min(xb, bkx0 + (bi + 1) * BC);
          if (ri > 0) { const h0 = e0 - ri, h1 = e0 + ri; if (ia >= h0 && ib <= h1) continue; if (ia < h1 && ia >= h0) ia = h1; if (ib > h0 && ib <= h1) ib = h0; }
          if (!(ib > ia)) continue;
          const i0 = Math.ceil(ia / s) | 0, i1 = (Math.ceil(ib / s) - 1) | 0;
          IT += Math.max(0, i1 - i0 + 1);
          for (let i = i0; i <= i1; i = (i + 1) | 0) {
            let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(jz, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13;
            if (seaBlk && ((h >>> 16) & 255) > 100) continue;
            const x = i * s + ((h & 255) - 128) * jit, z = zr + (((h >>> 8) & 255) - 128) * jit;
            const dx = x - e0, dzz = z - e2, dh2 = dx * dx + dzz * dzz;
            if (dh2 + gMin2 >= hi2 || dh2 + gMax2 < lo2) continue;
            // thin with distance (d0/d)^2 and with grazing (foreshortened ground packs dots on screen)
            const u = ((h >>> 24) & 255) * .00390625, dm = dh2 + gMid2, gz = Math.min(1, Math.max(.12, 3.2 * gMid2 / dm));
            if (u * dm > 1.3 * d02 * gz) continue;
            // what has seen this ground, and how long ago
            let bb = 0, fr = 1e9;
            const hx = x - hX, hz = z - hZ, hd2 = hx * hx + hz * hz;
            if (hd2 < hr2) {
              const rx = x - ringCx, rz = z - ringCz; if (rx * rx + rz * rz < RR2) continue;
              if (((h >>> 20) & 3) === 0) bb = 0; else if (hd2 < hin2) bb = .62; else { const q = (Math.sqrt(hd2) - hin) * hinv; bb = .62 * (1 - q * q * (3 - 2 * q)); }
            }
            if (act1) {
              const ci = ((x - m1x0) * m1i) | 0, cj = ((z - m1z0) * m1i) | 0;
              if (ci >= 0 && cj >= 0 && ci < m1nx && cj < m1nz && x >= m1x0 && z >= m1z0) {
                const t = m1t[cj * m1nx + ci];
                if (t < 1e8) { let a = T - t; if (a < 0) a += DUR; if (a < A2) { const f = a < A1 ? 1 : 1 - (a - A1) * AFI; if (f > bb) bb = f; if (a < fr) fr = a; } }
              }
            }
            if (act2) {
              const ci = ((x - m2x0) * m2i) | 0, cj = ((z - m2z0) * m2i) | 0;
              if (ci >= 0 && cj >= 0 && ci < m2nx && cj < m2nz && x >= m2x0 && z >= m2z0) {
                const t = m2t[cj * m2nx + ci];
                if (t < 1e8) { let a = T - t; if (a < 0) a += DUR; if (a < A2) { const f = a < A1 ? 1 : 1 - (a - A1) * AFI; if (f > bb) bb = f; if (a < fr) fr = a; } }
              }
            }
            if (actC && !seaBlk && x >= cox0 && x < cox1 && z >= coz0 && z < coz1) {
              const a = T - T_PING - Math.sqrt((x - pcx) * (x - pcx) + (z - pcz) * (z - pcz)) / pspd;
              if (a >= 0) { const f = (a < 38 ? 1 : a > 57 ? 0 : 1 - (a - 38) / 19) * .92; if (f > bb) bb = f; if (a < fr) fr = a; }
            }
            if (bb <= 0) continue;
            // true height (m) from the fine grid, else the coarse one
            let ht = 0, sh = 0;
            {
              let fi = (x - g1x0) * hgi, fj = (z - g1z0) * hgi;
              if (fi >= 0 && fj >= 0 && fi < g1nx - 1 && fj < g1nz - 1) {
                const ii = fi | 0, jj = fj | 0, a = fi - ii, b = fj - jj, k = jj * g1nx + ii;
                ht = (g1h[k] * (1 - a) + g1h[k + 1] * a) * (1 - b) + (g1h[k + g1nx] * (1 - a) + g1h[k + g1nx + 1] * a) * b;
                sh = g1s[k + (a > .5 ? 1 : 0) + (b > .5 ? g1nx : 0)];
              } else {
                fi = (x - g2x0) * hg2i; fj = (z - g2z0) * hg2i;
                if (!(fi >= 0 && fj >= 0 && fi < g2nx - 1 && fj < g2nz - 1)) continue;
                const ii = fi | 0, jj = fj | 0, a = fi - ii, b = fj - jj, k = jj * g2nx + ii;
                ht = (g2h[k] * (1 - a) + g2h[k + 1] * a) * (1 - b) + (g2h[k + g2nx] * (1 - a) + g2h[k + g2nx + 1] * a) * b;
                sh = g2s[k + (a > .5 ? 1 : 0) + (b > .5 ? g2nx : 0)];
              }
            }
            const sea = ht <= 0, wline = ht > -3 && ht < 3;
            if (sea && !wline && ((h >>> 16) & 255) > 100) continue;
            const y = sea ? .8 * Math.sin(x * .031 + z * .017 + T * wl) : ht * ve, dy = y - e1, d2 = dh2 + dy * dy;
            if (d2 < lo2 || d2 >= hi2) continue;
            if (u * d2 > d02 * Math.min(1, Math.max(wline ? .5 : .12, 3.2 * dy * dy / d2))) continue;
            const zc = dx * f0 + dy * f1 + dzz * f2;
            if (zc < 2) continue;
            const sx = cx + fl * (dx * r0 + dy * r1 + dzz * r2) / zc, sy = cy - fl * (dx * u0 + dy * u1 + dzz * u2) / zc;
            if (sx < 0 || sy < 0 || sx >= vw || sy >= vh) continue;
            let br;
            if (sea) br = .36 + .2 * ((h >>> 5) & 7) / 7;
            else {
              const hv = ht * .04; br = sh + (hv - Math.floor(hv) < .1 ? .2 : 0) + .05 * ((h >>> 3) & 3);
            }
            if (wline) br = 1.25;                                // the waterline
            br *= 1.35 * bb * tK * (zc < 2500 ? 1.05 - zc / 25000 : Math.max(.38, 1.15 - zc / 12000));
            let cr = 238, cg = 238, cb = 228;
            if (fr * rtK < 1.6) { const kf = Math.exp(-fr * rtK * 2.6); cr += (198 - cr) * kf; cg += (244 - cg) * kf; cb += (50 - cb) * kf; if (br < kf) br = kf; }
            put(sx, sy, zc < 900 ? 2 : 1, cr, cg, cb, br > 1 ? 1 : br);
            drawn++;
          }
        }
      }
      its.push(IT);
    }
    TSTAT.it = its; TSTAT.mask = mnx * mnz;
    return drawn;
  }
  const TSTAT = {};
  const LZP = W.routeAt(W.route.end, { p: [0, 0, 0], ca: [0, 0, 0] }).p.slice();
  const revealAt = (M, x, z) => { const i = Math.floor((x - M.x0) / M.c), j = Math.floor((z - M.z0) / M.c); return i >= 0 && j >= 0 && i < M.nx && j < M.nz ? M.t[j * M.nx + i] : 1e9; };
  /* the scan line now: a lit profile on the ground and the fan of rays from the scanner */
  function lineAt(SW, T) { let lo = 0, hi = SW.nl - 1; if (T < SW.lt[0] || T > SW.lt[hi] + .3) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SW.lt[m] <= T) lo = m; else hi = m - 1; } return lo; }
  function drawScan(SW, T, D, k) {
    const i = lineAt(SW, T); if (i < 0) return;
    const scn = X.ap(X.make(D.M, D.p), [0, -.13, -.18]);
    const cx = SW.lx[i], cz = SW.lz[i], rx = SW.ldz[i], rz = -SW.ldx[i], H = SW.lh[i], alt = D.p[1];
    const mirror = .5 + .5 * Math.sin(T * TAU * 1.3);           // the rotating mirror's beam, sweeping the fan
    const prof = [];
    for (let u = -H; u <= H; u += 2.2) {
      const x = cx + rx * u, z = cz + rz * u, y = W.yAt(x, z);
      if (Math.abs(u) > (alt - y) * TANF) continue;
      prof.push(x, y, z, u);
      if (!P3(x, y + 1, z)) continue;
      if (PX < 0 || PY < 0 || PX >= VW || PY >= VH) continue;
      dset(PX, PY, PZ < 900 ? 2 : 1, [226, 255, 150], .95 * k);
      BUF.add(PX, PY, 7, LIME[0], LIME[1], LIME[2], .035 * k);
    }
    // light sheet: sparse rays from the scanner, thinning toward the ground; one hot ray = the mirror's beam now
    const n = prof.length / 4; if (!n) return;
    for (let r = 0; r <= 30; r++) {
      const q = Math.min(n - 1, Math.round(r / 30 * (n - 1))) * 4, g = [prof[q], prof[q + 1], prof[q + 2]];
      const hot = Math.exp(-Math.pow((r / 30 - mirror) * 8, 2));
      const L = V.dist(scn, g), steps = Math.min(120, Math.ceil(L / 5));
      for (let st = 1; st < steps; st++) {
        const t = st / steps; if (hsh(r * 131 + st, i) > .45 + .5 * hot) continue;
        if (!P3(scn[0] + (g[0] - scn[0]) * t, scn[1] + (g[1] - scn[1]) * t, scn[2] + (g[2] - scn[2]) * t)) continue;
        put(PX, PY, 1, LIME[0], LIME[1], LIME[2], k * (.16 + .62 * hot) * (1 - .55 * t));
      }
    }
  }
  const gridH = (g, x, z) => { const fi = (x - g.x0) / g.d, fj = (z - g.z0) / g.d; if (fi < 0 || fj < 0 || fi >= g.nx - 1 || fj >= g.nz - 1) return NaN; const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j, k = j * g.nx + i, H = g.h; return (H[k] * (1 - a) + H[k + 1] * a) * (1 - b) + (H[k + g.nx] * (1 - a) + H[k + g.nx + 1] * a) * b; };
  const yGrid = (x, z) => { let h = gridH(HG, x, z); if (h !== h) h = gridH(HG2, x, z); return h > 0 ? h * W.VE : 0; };
  function drawPingRing(T) {
    const pa = T - T_PING; if (pa < 0 || pa > 12) return;
    const pr = pa * W.PSPD, al = 1 - ss(7, 12, pa), c = W.pingAt;
    for (const [rad, a, sz] of [[pr, 1, 2], [pr - 500, .3, 1], [pr - 1200, .12, 1]]) {
      if (rad <= 0) continue;
      const n = Math.min(a === 1 ? 4000 : 1800, Math.max(80, Math.round(rad * TAU / (a === 1 ? 40 : 80))));
      for (let k = 0; k < n; k++) {
        const th = k / n * TAU, x = c[0] + Math.sin(th) * rad, z = c[2] + Math.cos(th) * rad;
        if (!P3(x, yGrid(x, z) + 6, z)) continue;
        if (PX < 0 || PY < 0 || PX >= VW || PY >= VH) continue;
        dset(PX, PY, sz, LIME, a * al);
      }
    }
    const fl = Math.max(0, 1 - pa / .3); if (fl > 0) flash = Math.max(flash, 14 * fl);
  }

  /* ---------- the battery ---------- */
  const TELW = W.TELS.map(t => t.W), CATW = W.CAT.W;
  const STAT = (() => {
    // world-space static clouds: both TELs, the catapult (without its carriage); each point knows its object
    const P = [], N = [], O = [], B = [];
    const add = (sp, Wx, st, oi, skip) => { for (const s of sp) { if (skip && skip.includes(s.name)) continue; const T = partX(Wx, s.part, st); for (let k = 0; k < s.pts.length; k += 6) { const w = X.ap(T, [s.pts[k], s.pts[k + 1], s.pts[k + 2]]), nn = (s.pts[k + 3] || s.pts[k + 4] || s.pts[k + 5]) ? X.dir(T, [s.pts[k + 3], s.pts[k + 4], s.pts[k + 5]]) : [0, 0, 0]; P.push(...w); N.push(...nn); O.push(oi); B.push(nn[0] || nn[1] || nn[2] ? .3 + .6 * Math.max(0, V.dot(nn, LM)) : .55); } } };
    add(W.telParts, TELW[0], { elev: 0, dep: 1 }, 0);
    add(W.telParts, TELW[1], { elev: 0, dep: 1 }, 1);
    add(W.catParts, CATW, { carriage: 0 }, 2, ['carriage']);
    return { p: new Float32Array(P), n: new Float32Array(N), o: new Int8Array(O), b: new Float32Array(B), N: O.length };
  })();
  /* home ground: rings of returns around the pad (known ground, always shown) */
  const GRD = (() => {
    const r = rng(77), a = [], c = RING_C;
    for (let rr = 1.2, k = 0; rr < 222; rr += Math.max(rr * .02, .32), k++) {
      const step = Math.min(3.6, .38 + rr * .022), n = Math.floor(TAU * rr / step), ph = r() * TAU;
      for (let i = 0; i < n; i++) {
        const th = ph + i / n * TAU, x = c[0] + Math.sin(th) * rr, z = c[1] + Math.cos(th) * rr;
        let under = false;
        for (const Tw of TELW) { const lx = (x - Tw.T[0]) * Tw.R[0] + (z - Tw.T[2]) * Tw.R[6], lz = (x - Tw.T[0]) * Tw.R[2] + (z - Tw.T[2]) * Tw.R[8]; if (Math.abs(lx) < 1.6 && Math.abs(lz) < 6.5) under = true; }
        if (under) continue;
        const y = W.yAt(x, z) + .05 * M3.noise(x * .2, z * .2);
        a.push(x, y, z, (.24 + .14 * Math.exp(-rr / 60) + .08 * r()) * (1 - .45 * ss(170, 222, rr)) * (.3 + .7 * ss(1, 24, rr)));
      }
    }
    // the recovery spot: a tighter ring pattern around where the drones come down
    const L = W.routeAt(W.route.end, { p: [0, 0, 0], ca: [0, 0, 0] }).p;
    for (let rr = .8; rr < 48; rr *= 1.035) {
      const step = .7 + rr * .09, n = Math.floor(TAU * rr / step), ph = r() * TAU;
      for (let i = 0; i < n; i++) { const th = ph + i / n * TAU, x = L[0] + Math.sin(th) * rr, z = L[2] + Math.cos(th) * rr; a.push(x, W.yAt(x, z) + .03, z, (.16 + .16 * Math.exp(-rr / 14) + .06 * r()) * (1 - ss(30, 48, rr))); }
    }
    return new Float32Array(a);
  })();
  function drawGround(T, lift) {
    for (let k = 0; k < GRD.length; k += 4) {
      const x = GRD[k], y = GRD[k + 1], z = GRD[k + 2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < .3) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      let b = GRD[k + 3] * Math.max(.5, 1 - zc / 1200), cr = WH[0], cg = WH[1], cb = WH[2];
      const rt = STRIKE.groundT ? STRIKE.groundT[k >> 2] : 1e9, age = T - T_STRIKE - rt;
      if (age > 0 && age < 1.2) { const kf = Math.exp(-age * 5); b = Math.max(b, kf * .9); cr += (LIME[0] - cr) * kf; cg += (LIME[1] - cg) * kf; cb += (LIME[2] - cb) * kf; }
      put(sx, sy, zc < 12 ? 2 : 1, cr, cg, cb, Math.min(1, b * lift));
    }
  }
  /* the strike: the drone's first LiDAR frame hits TEL 1; the returns branch through the battery (p1) */
  const STRIKE = (() => {
    const H = .32, o = { rt: new Float32Array(STAT.N).fill(1e9), groundT: null, links: [], hit: null, bolt: null };
    const D = heroAt(T_STRIKE, Object.assign({}, HERO, { p: [0, 0, 0], ca: [0, 0, 0], wd: [0, 0] }));
    const Tw = TELW[0]; o.hit = X.ap(Tw, [.4, 3.55, -1.5]);
    const nodesOf = oi => {
      const map = new Map(), nodes = [];
      for (let i = 0; i < STAT.N; i++) {
        if (STAT.o[i] !== oi) continue;
        const ix = Math.floor(STAT.p[i * 3] / H), iy = Math.floor(STAT.p[i * 3 + 1] / H), iz = Math.floor(STAT.p[i * 3 + 2] / H), key = ix + ',' + iy + ',' + iz;
        let nd = map.get(key); if (!nd) { nd = { ix, iy, iz, p: [0, 0, 0], m: [] }; map.set(key, nd); nodes.push(nd); }
        nd.m.push(i); nd.p[0] += STAT.p[i * 3]; nd.p[1] += STAT.p[i * 3 + 1]; nd.p[2] += STAT.p[i * 3 + 2];
      }
      nodes.forEach((nd, i) => { nd.id = i; nd.p = nd.p.map(v => v / nd.m.length); });
      for (const nd of nodes) { nd.nb = []; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) { if (!a && !b && !c) continue; const q = map.get((nd.ix + a) + ',' + (nd.iy + b) + ',' + (nd.iz + c)); if (q) nd.nb.push(q.id); } }
      return nodes;
    };
    function dijkstra(nodes, seeds, seed) {
      const rr = rng(seed), t = new Float64Array(nodes.length).fill(1e9), par = new Int32Array(nodes.length).fill(-1), heap = [];
      const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      for (const [i, d] of seeds) if (d < t[i]) { t[i] = d; push(d, i); }
      const cost = new Float32Array(nodes.length); for (let i = 0; i < nodes.length; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
      while (heap.length) { const [d, i] = pop(); if (d > t[i]) continue; const a = nodes[i]; for (const j of a.nb) { const nd = d + V.dist(a.p, nodes[j].p) * cost[j] / 17; if (nd < t[j]) { t[j] = nd; par[j] = i; push(nd, j); } } }
      return { t, par };
    }
    const G0 = nodesOf(0), G1 = nodesOf(1), G2 = nodesOf(2);
    let best = 0, bd = 1e9; G0.forEach((nd, i) => { const d = V.dist(nd.p, o.hit); if (d < bd) { bd = d; best = i; } });
    const lead = .3, r0 = dijkstra(G0, [[best, lead]], 7);
    let tC = 1e9; G0.forEach((nd, i) => { if (nd.p[1] - W.TELS[0].y < .5) tC = Math.min(tC, r0.t[i]); });
    const c0 = [Tw.T[0], Tw.T[2]];
    const groundT = (x, z) => { const dx = x - c0[0], dz = z - c0[1], d = Math.hypot(dx, dz), a = Math.atan2(dx, dz); return tC + d / 46 * (.5 + 1.9 * Math.pow(.5 + .5 * M3.fbm(Math.cos(a) * 1.8 + 3, Math.sin(a) * 1.8, d * .025, 4), 2.2)); };
    const seedFrom = (G, base) => { const s = []; G.forEach((nd, i) => { if (nd.p[1] - base < .7) s.push([i, groundT(nd.p[0], nd.p[2])]); }); return s; };
    const r1 = dijkstra(G1, seedFrom(G1, W.TELS[1].y), 31), r2 = dijkstra(G2, seedFrom(G2, W.CAT.y), 32);
    const rj = rng(4);
    [[G0, r0], [G1, r1], [G2, r2]].forEach(([Gn, rs]) => Gn.forEach((nd, i) => { for (const m of nd.m) o.rt[m] = rs.t[i] + rj() * .05; if (rs.par[i] >= 0) o.links.push([nd.p, Gn[rs.par[i]].p, rs.t[i]]); }));
    o.groundT = new Float32Array(GRD.length / 4); for (let k = 0; k < GRD.length; k += 4) o.groundT[k >> 2] = groundT(GRD[k], GRD[k + 2]) + rj() * .04;
    // bolt: a jagged channel from the drone's scanner down to the launcher
    const rr = rng(21), top = X.ap(X.make(D.M, D.p), [0, -.13, -.18]);
    const disp = (a, b, depth, rough) => { let pts = [a, b]; for (let d = 0; d < depth; d++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = V.dist(p, q), m = V.lerp(p, q, .5); out.push([m[0] + (rr() - .5) * l * rough, m[1] + (rr() - .5) * l * rough * .4, m[2] + (rr() - .5) * l * rough], q); } pts = out; } return pts; };
    o.bolt = { main: disp(top, o.hit, 7, .13), br: [], top };
    for (let k = 0; k < 5; k++) { const m = o.bolt.main, i = 40 + Math.floor(rr() * (m.length - 50)), s = m[i]; const dir = V.norm([(rr() - .5) * 2, -rr() - .3, (rr() - .5) * 2]); o.bolt.br.push({ at: i / m.length, pts: disp(s, V.mad(s, dir, 1.2 + rr() * 2.5), 4, .4) }); }
    // identification boxes (object + parts), in the vehicle frame
    const bx = (oi, Wx, sp, st, names) => {
      const all = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]], parts = [];
      for (const s of sp) {
        if (names.skip && names.skip.includes(s.name)) continue;
        const Tm = s.part.xf ? s.part.xf(st) : X.make(), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (let k = 0; k < s.pts.length; k += 6) { const q = X.ap(Tm, [s.pts[k], s.pts[k + 1], s.pts[k + 2]]); for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], q[c]); mx[c] = Math.max(mx[c], q[c]); all[0][c] = Math.min(all[0][c], q[c]); all[1][c] = Math.max(all[1][c], q[c]); } }
        if (names[s.name]) parts.push({ mn, mx, lab: names[s.name] });
      }
      return { oi, W: Wx, mn: all[0].map(v => v - .2), mx: all[1].map(v => v + .2), parts };
    };
    o.boxes = [
      bx(0, TELW[0], W.telParts, { elev: 0, dep: 1 }, { launcher: ['01.1', 'TLC ×2 · 3M55 Oniks'], cab: ['01.2', 'Cab · crew 3'], ram: ['01.3', 'Erector ram'] }),
      bx(1, TELW[1], W.telParts, { elev: 0, dep: 1 }, {}),
      bx(2, CATW, W.catParts, { carriage: 0 }, { skip: ['carriage'] }),
    ];
    o.boxes[0].tag = ['OBJ 01', 'TEL · Bastion-P']; o.boxes[1].tag = ['OBJ 02', 'TEL · Bastion-P']; o.boxes[2].tag = ['OBJ 05', 'Launch rail · Orlan-10'];
    for (const b of o.boxes) {
      const ts = []; for (let i = 0; i < STAT.N; i++) if (STAT.o[i] === b.oi) ts.push(o.rt[i]); ts.sort((a, c) => a - c);
      b.tIn = ts[Math.floor(ts.length * .85)] + .25;
      b.parts.forEach((p, k) => p.tIn = b.tIn - .3 + k * .22);
    }
    return o;
  })();
  const BEDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  function boxCorners(Wx, mn, mx, grow) {
    const c = V.mul(V.add(mn, mx), .5), h = V.mul(V.sub(mx, mn), .5 * grow), cs = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) cs.push(X.ap(Wx, [c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]));
    return cs;
  }
  function dotBox(cs, col, a, step) {
    for (const [i, j] of BEDGES) {
      const n = Math.max(2, Math.ceil(V.dist(cs[i], cs[j]) / step));
      for (let k = 0; k <= n; k++) { const t = k / n; if (P3(cs[i][0] + (cs[j][0] - cs[i][0]) * t, cs[i][1] + (cs[j][1] - cs[i][1]) * t, cs[i][2] + (cs[j][2] - cs[i][2]) * t)) put(PX, PY, 2, col[0], col[1], col[2], a * (k === 0 || k === n ? 1 : .75)); }
    }
  }
  function drawBattery(T, D) {
    const c = T - T_STRIKE, lift = 1;
    // statics
    const P = STAT.p, Nn = STAT.n;
    for (let i = 0; i < STAT.N; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < .2) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      let b = STAT.b[i];
      const nx = Nn[i * 3], ny = Nn[i * 3 + 1], nz = Nn[i * 3 + 2];
      if ((nx || ny || nz) && nx * dx + ny * dy + nz * dz > 0) b *= .3;
      b *= Math.max(.3, 1 - zc / 1500) * .82;
      let cr = WH[0], cg = WH[1], cb = WH[2];
      const age = c - STRIKE.rt[i];
      if (age > 0 && age < 1.2) { const kf = Math.exp(-age * 7); b = Math.max(b, kf * 1.1); cr += (LIME[0] - cr) * kf; cg += (LIME[1] - cg) * kf; cb += (LIME[2] - cb) * kf; }
      put(sx, sy, zc < 30 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
    // carriage (moves with the stroke, then returns for the next drone while we are away)
    const cp = T < T_LAUNCH ? 0 : T < T_LAUNCH + W.T_STROKE ? .5 * W.A_RAIL * (T - T_LAUNCH) ** 2 / W.railLen : T < 64 ? 1 : 0;
    for (const s of W.catParts) if (s.name === 'carriage') drawPts(s.pts, partX(CATW, s.part, { carriage: Math.min(1, cp) }), .9, 30, null, 0);
  }
  function drawStrikeFx(T) {
    const c = T - T_STRIKE; if (c < -.1 || c > 9) return;
    const b = STRIKE.bolt, tHit = .3;
    if (c < tHit + .7) {
      const lead = c < tHit, reach = lead ? sat(c / tHit) : 1, tr = c - tHit;
      const I = lead ? .55 : Math.max(0, Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2)));
      const path = (pts, upto, inten) => { for (let i = 0; i < Math.min(pts.length - 1, upto); i++) { const a = pts[i], q = pts[i + 1], n = Math.max(1, Math.ceil(V.dist(a, q) / .05)); for (let k = 0; k < n; k++) { if (!P3(a[0] + (q[0] - a[0]) * k / n, a[1] + (q[1] - a[1]) * k / n, a[2] + (q[2] - a[2]) * k / n)) continue; put(PX, PY, 2, 248, 255, 232, Math.min(1, inten)); if (k % 8 === 0) BUF.add(PX, PY, 7, LIME[0], LIME[1], LIME[2], .06 * inten); } } };
      // the channel stays attached to the drone's scanner as it flies on
      const scn = X.ap(X.make(HERO.M, HERO.p), [0, -.13, -.18]), n = b.main.length, sh = V.sub(scn, b.top);
      const moved = (pts, t0, t1) => pts.map((q, i) => { const t = t0 + (t1 - t0) * i / Math.max(1, pts.length - 1), w = 1 - t; return [q[0] + sh[0] * w, q[1] + sh[1] * w, q[2] + sh[2] * w]; });
      const main = moved(b.main, 0, 1), vis = reach * n;
      path(main, vis, I * 1.1);
      for (const br of b.br) { const s0 = br.at * n; if (vis > s0) path(moved(br.pts, br.at, br.at), (vis - s0) / (n * .25) * br.pts.length, I * .6); }
      if (!lead) flash = Math.max(flash, 9 * Math.min(1, I));
    }
    // live branches: parent -> child links whose child just lit
    for (const [p, q, t] of STRIKE.links) { if (c < t || c > t + .16) continue; if (!P3v(p)) continue; const x0 = PX, y0 = PY; if (!P3v(q)) continue; BUF.dline(x0, y0, PX, PY, 1.6, 1, 210, 255, 120, .85); }
  }
  function strikeBoxes(T, tags) {
    const c = T - T_STRIKE, out = 6.5;
    for (const bx of STRIKE.boxes) {
      const a = sat((c - bx.tIn) / .25) * (1 - sat((c - out) / .6));
      if (a <= 0) continue;
      const g = 1 + .3 * (1 - E.outExpo(sat((c - bx.tIn) / .45)));
      const cs = boxCorners(bx.W, bx.mn, bx.mx, g);
      dotBox(cs, WH, a * .9, .18);
      let best = null; for (const q of cs) if (P3v(q) && (!best || PY < best[1])) best = [PX, PY];
      if (best) tags.push({ key: 'st' + bx.oi, cls: '', a: bx.tag[0], b: bx.tag[1], x: best[0] + 8, y: best[1] - 30, al: a, pri: 2 });
      for (const p of bx.parts) {
        const pa = sat((c - p.tIn) / .25) * (1 - sat((c - out + .8) / .5)); if (pa <= 0) continue;
        const pc = boxCorners(bx.W, p.mn, p.mx, 1 + .3 * (1 - E.outExpo(sat((c - p.tIn) / .45))));
        dotBox(pc, LIME, pa, .14);
        let bp = null; for (const q of pc) if (P3v(q) && (!bp || PX > bp[0])) bp = [PX, PY];
        if (bp) tags.push({ key: 'sp' + p.lab[0], cls: 'lime sm', a: p.lab[0], b: p.lab[1], x: bp[0] + 8, y: bp[1] - 10, al: pa, pri: 1 });
      }
    }
  }
  /* Pantsir: revealed by the swath it stands in */
  const PZW = W.PZ.W;
  const PZAGE = (() => { let best = 1e9, t = 0; for (let i = 0; i < W.SW1.nl; i++) { const d = Math.hypot(W.SW1.lx[i] - W.PZ.x, W.SW1.lz[i] - W.PZ.z); if (d < best) { best = d; t = W.SW1.lt[i]; } } return t; })();
  function drawPantsir(T, tags) {
    const age = ageOf(T, PZAGE); if (age > A2) return;
    const fd = fade(age), fresh = age < .9 ? .5 * Math.exp(-age * 5) : 0;
    const st = { yaw: .4 * Math.sin(T * .1), pitch: 0, sAnt: simOf(T) * 2.1 };
    for (const s of W.pzParts) drawPts(s.pts, partX(PZW, s.part, st), fd * .9, 60, null, fresh);
    const a = sat((age - .4) / .3) * (1 - sat((age - 7) / .8));
    if (a > 0) {
      const cs = boxCorners(PZW, [-1.7, 0, -5.4], [1.7, 5.3, 5.2], 1);
      dotBox(cs, LIME, a * .9, .5);
      let best = null; for (const q of cs) if (P3v(q) && (!best || PY < best[1])) best = [PX, PY];
      if (best) tags.push({ key: 'pz', cls: 'lime', a: 'OBJ 03', b: 'Pantsir-S1', v: 'search radar turning', x: best[0] + 8, y: best[1] - 30, al: a, pri: 2 });
    }
  }

  /* ---------- radar: sector scan over the sea, painted as a height field (p2 seen from above) ---------- */
  const RAD = { az: 50 * DEG, rate: 12 * DEG, rMin: 600, rMax: 10500, HK: 3.4, ALPHA: 8.2 };
  RAD.P = 2 * (2 * RAD.az) / RAD.rate;
  const beamRel = s => { const u = fmod(s / RAD.P, 1), tri = u < .5 ? u * 2 : 2 - u * 2; return -RAD.az + 2 * RAD.az * tri; };
  function lastPaint(b, s) {
    const P = RAD.P, half = P / 2, u = (b + RAD.az) / (2 * RAD.az), k = Math.floor(s / P), base = k * P;
    let best = -1e9;
    const c = [base + u * half, base + P - u * half, base - P + u * half, base - u * half];
    for (let i = 0; i < 4; i++) if (c[i] <= s && c[i] > best) best = c[i];
    return best;
  }
  // wind-row texture on a world grid over the sea we fly (cheap lookup per cell per frame)
  const TEX = (() => {
    const x0 = -4000, z0 = -500, d = 60, nx = 460, nz = 420, a = new Float32Array(nx * nz), wind = -35 * DEG;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = (x0 + i * d) / 1000, z = (z0 + j * d) / 1000, u = x * Math.sin(wind) + z * Math.cos(wind), v = x * Math.cos(wind) - z * Math.sin(wind);
      a[j * nx + i] = Math.exp(2.3 * M3.fbm(u * .9, v * 3.4, 3.7, 3) - .5);
    }
    return { x0, z0, d, nx, nz, a };
  })();
  const texAt = (x, z) => { const i = E.clamp(Math.round((x - TEX.x0) / TEX.d), 0, TEX.nx - 1), j = E.clamp(Math.round((z - TEX.z0) / TEX.d), 0, TEX.nz - 1); return TEX.a[j * TEX.nx + i]; };
  function rainAt(x, z, s) {
    const c = W.SQ.at(s), d = Math.hypot(x - c[0], z - c[1]) / W.SQ.r; if (d > 1.25) return 0;
    return 26 * Math.pow(Math.max(0, 1 - d * d / 1.5), 1.5) * (.6 + .5 * texAt(x * .7 + 3000, z * .7));
  }
  const clutMean = r => { const q = 2800 / r; return r < 2800 ? 11 * q * q : 11 * q * q * q * q * Math.sqrt(q); };
  const cellAmp = (id, key, c, spike) => { const P = -Math.log(hsh(id, key * 2 + 1)) + c * spike * -Math.log(hsh(id, key * 2 + 2)); return P; };
  const EXPL = (() => { const a = new Float32Array(4096); for (let i = 0; i < 4096; i++) a[i] = -Math.log((i + .5) / 4096); return a; })();
  let radarFA = [];
  function drawRadar(T, D, k, rainK) {
    // the painted sector as a camera-adaptive lattice (constant dot spacing on screen, like the terrain),
    // each cell's amplitude drawn from sea clutter statistics at the moment the beam last crossed it
    const s = D.s, rate = Math.max(1, rateOf(T)), px = D.p[0], pz = D.p[2], psi = D.psi, ba = beamRel(s), az = RAD.az;
    const beam = psi + ba, rMin = RAD.rMin, rMax = RAD.rMax, rMin2 = rMin * rMin, rMax2 = rMax * rMax, HK = RAD.HK, ALPHA = RAD.ALPHA;
    const e0 = E0, e1 = E1, e2 = E2, f0 = F0, f1 = F1, f2 = F2, r0 = R0, r1 = R1, r2 = R2, u0 = U0, u1 = U1, u2 = U2, fl = FL, cx = CX, cy = CY, vw = VW, vh = VH;
    const P = RAD.P, half = P / 2, sq = W.SQ.at(s), sqx = sq[0], sqz = sq[1], sqr = W.SQ.r, rainNear = rainK > 0 && Math.hypot(sqx - px, sqz - pz) < rMax + sqr * 1.3;
    const MM = W.MM, mmx0 = +MM.x0, mmz0 = +MM.z0, mmi = 1 / MM.c, mmnx = MM.nx | 0, mmnz = MM.nz | 0, mmMx = MM.mx;
    const tA = TEX.a, tx0 = +TEX.x0, tz0 = +TEX.z0, tdi = 1 / TEX.d, tnx = TEX.nx | 0, tnz = TEX.nz | 0, sqi2 = 1 / (sqr * sqr);
    radarFA.length = 0;
    // sector bounding box
    let sx0 = 1e12, sx1 = -1e12, sz0 = 1e12, sz1 = -1e12;
    const ext = (a, rr) => { const x = px + Math.sin(a) * rr, z = pz + Math.cos(a) * rr; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (z < sz0) sz0 = z; if (z > sz1) sz1 = z; };
    ext(psi - az, rMin); ext(psi + az, rMin); ext(psi - az, rMax); ext(psi + az, rMax); ext(psi, rMin);
    for (let q = -4; q <= 4; q++) { const a = q * Math.PI / 2; if (Math.abs(wrapA(a - psi)) < az) ext(a, rMax); }
    footprint(rMax + 2000);
    // lattice density follows the lens only down to ~42 deg: the long-lens contact shot would otherwise ask for metre cells kilometres out
    const flr = Math.min(fl, 1400);
    let cells = 0;
    for (let L = 0; L < 9; L++) {
      const st = 1.6 * (1 << L), d0 = flr * st / 8.8, lo = L === 0 ? 0 : d0, hi = 2 * d0, d02 = d0 * d0, lo2 = lo * lo, hi2 = hi * hi;
      const g = Math.max(0, e1), g2 = g * g;
      if (g >= hi) continue;
      const hr = Math.sqrt(hi2 - g2);
      const j0 = Math.ceil(Math.max(sz0, e2 - hr) / st) | 0, j1 = Math.floor(Math.min(sz1, e2 + hr) / st) | 0;
      for (let j = j0; j <= j1; j = (j + 1) | 0) {
        const zr = j * st, dz = zr - e2;
        if (Math.abs(dz) > hr) continue;
        if (!hullSpan(zr)) continue;
        const ro = Math.sqrt(Math.max(0, hr * hr - dz * dz));
        const xa = Math.max(SP0, sx0, e0 - ro), xb = Math.min(SP1, sx1, e0 + ro);
        if (!(xb > xa)) continue;
        const i0 = Math.ceil(xa / st) | 0, i1 = Math.floor(xb / st) | 0, jz = (j * 7 + L * 104729) | 0;
        for (let i = i0; i <= i1; i = (i + 1) | 0) {
          let h = Math.imul(i, 0x2c1b3c6d) ^ Math.imul(jz, 0x297a2d39); h = Math.imul(h ^ (h >>> 15), 0x85ebca77); h ^= h >>> 13;
          const x = i * st + ((h & 255) - 128) * st * .0031, z = zr + (((h >>> 8) & 255) - 128) * st * .0031;
          const dx = x - px, dz2 = z - pz, rr2 = dx * dx + dz2 * dz2;
          if (rr2 < rMin2 || rr2 >= rMax2) continue;
          const ex = x - e0, ez = z - e2, d2 = ex * ex + ez * ez + g2;
          if (d2 < lo2 || d2 >= hi2) continue;
          const u = ((h >>> 24) & 255) * .00390625;
          if (u * d2 > d02 * Math.min(1, Math.max(.07, 2.5 * g2 / d2))) continue;
          const b = wrapA(Math.atan2(dx, dz2) - psi); if (b < -az || b > az) continue;
          // land test only where the 250 m max-height grid says there can be land
          let htL = -99;
          if (z < 3200) { const mi = ((x - mmx0) * mmi) | 0, mj = ((z - mmz0) * mmi) | 0; if (mi >= 0 && mj >= 0 && mi < mmnx && mj < mmnz && mmMx[mj * mmnx + mi] > .05) htL = W.hAt(x, z); }
          const land = htL > -2;
          // last crossing of the bidirectional sector scan over this bearing
          const q = (b + az) / (2 * az), kP = Math.floor(s / P) * P, c1 = kP + q * half, c2 = kP + P - q * half;
          let tp = kP - q * half; if (c1 <= s) tp = c1; if (c2 <= s) tp = c2;
          const ageF = (s - tp) / rate, key = Math.round(tp * 20) | 0, r = Math.sqrt(rr2);
          let rain = 0;
          if (rainNear) {
            const qx = x - sqx, qz = z - sqz, dq2 = (qx * qx + qz * qz) * sqi2;
            if (dq2 < 1.5625) {
              const f = 1 - dq2 / 1.5;
              if (f > 0) { let ri = Math.round((x * .7 + 3000 - tx0) * tdi), rj = Math.round((z * .7 - tz0) * tdi); ri = ri < 0 ? 0 : ri >= tnx ? tnx - 1 : ri; rj = rj < 0 ? 0 : rj >= tnz ? tnz - 1 : rj; rain = 26 * f * Math.sqrt(f) * (.6 + .5 * tA[rj * tnx + ri]) * rainK; }
            }
          }
          let ti = Math.round((x - tx0) * tdi), tj = Math.round((z - tz0) * tdi); ti = ti < 0 ? 0 : ti >= tnx ? tnx - 1 : ti; tj = tj < 0 ? 0 : tj >= tnz ? tnz - 1 : tj;
          let cm; if (r < 2800) { const q = 2800 / r; cm = 11 * q * q; } else { const q = 2800 / r, q2 = q * q; cm = 11 * q2 * q2 * Math.sqrt(q); }
          const tx = tA[tj * tnx + ti], c = land ? 60 + 140 * tx : cm * tx + rain;
          // per-look speckle: two uniform draws and a slow spike draw from one integer mix of (cell, look)
          let m = Math.imul(h ^ Math.imul(key, 0x9E3779B1), 0x85EBCA77); m ^= m >>> 13; m = Math.imul(m, 0xC2B2AE35); m ^= m >>> 16;
          let n = Math.imul(h ^ Math.imul((key / 3) | 0, 0x27D4EB2F), 0x165667B1); n ^= n >>> 15;
          const spike = ((n >>> 8) & 0xffff) < 59 ? 14 : 1;
          const Pw = EXPL[m & 4095] + c * spike * EXPL[(m >>> 16) & 4095], det = !land && Pw / (1 + c) > ALPHA && rain < 1;
          const db = 4.343 * Math.log(Pw);
          const y = land ? Math.max(0, htL) * W.VE + 2 : HK * Math.max(0, db - 1) * (ageF < .35 ? 1 - Math.exp(-ageF * 14) : 1);
          const glow = Math.exp(-ageF * .9);
          const dxe = x - e0, dye = y - e1, dze = z - e2, zc = dxe * f0 + dye * f1 + dze * f2;
          if (zc < 20) continue;
          const sx = cx + fl * (dxe * r0 + dye * r1 + dze * r2) / zc, sy = cy - fl * (dxe * u0 + dye * u1 + dze * u2) / zc;
          if (sx < 0 || sy < 0 || sx >= vw || sy >= vh) continue;
          let bb = 1.3 * Math.min(1, Math.max(.12, (db + 12) / 34)) * (.22 + 1.05 * glow) * k * (1 - .35 * r / rMax);
          let cr = 238, cg = 238, cb = 228;
          if (ageF < 1.1) { const w = Math.exp(-ageF * 3.2); cr += (198 - cr) * w; cg += (244 - cg) * w; cb += (50 - cb) * w; if (bb < w * .7 * k) bb = w * .7 * k; }
          if (det) {
            if (bb < (.5 + .5 * glow) * k) bb = (.5 + .5 * glow) * k;
            const zb = dxe * f0 - e1 * f1 + dze * f2;
            if (zb > 20) BUF.dline(sx, sy, cx + fl * (dxe * r0 - e1 * r1 + dze * r2) / zb, cy - fl * (dxe * u0 - e1 * u1 + dze * u2) / zb, 2.5, 1, cr, cg, cb, bb * .5);
            if (ageF < 1.4 && radarFA.length < 40) radarFA.push([x, y, z, ageF, h]);
          }
          put(sx, sy, zc < 1600 ? 2 : 1, cr, cg, cb, bb > 1 ? 1 : bb);
          cells++;
        }
      }
    }
    // the beam: a lime leading edge on the sea and a thin sheet above it
    for (let r = 25; r < rMax; r += 10 + r * .007) {
      const x = px + Math.sin(beam) * r, z = pz + Math.cos(beam) * r;
      if (!P3(x, 1, z)) continue;
      if (PX < 0 || PY < 0 || PX >= VW || PY >= VH) continue;
      const fa = k * (1 - .45 * r / rMax);
      put(PX, PY, 2, LIME[0], LIME[1], LIME[2], fa);
      BUF.add(PX, PY, 7, LIME[0], LIME[1], LIME[2], .025 * fa);
      if (r > 300) for (let j = 1; j <= 8; j++) { if (hsh((r * 3) | 0, j) > .62 - j * .05) continue; if (P3(x, j * 18 * Math.pow(r / 2000, .5), z)) put(PX, PY, 1, LIME[0], LIME[1], LIME[2], k * .6 * (1 - j / 9)); }
    }
    // sector edges and range rings, faint
    for (const e of [-az, az]) for (let r = 25; r < rMax; r += 20 + r * .01) { if (P3(px + Math.sin(psi + e) * r, 0, pz + Math.cos(psi + e) * r)) put(PX, PY, 1, WH[0], WH[1], WH[2], .45 * k); }
    for (const rr of [2500, 5000, 7500, 10000]) for (let a = -az; a <= az; a += .004) { if (P3(px + Math.sin(psi + a) * rr, 0, pz + Math.cos(psi + a) * rr)) put(PX, PY, 1, WH[0], WH[1], WH[2], .22 * k); }
    return cells;
  }
  /* the ship as the radar sees it: a tight cluster of strong returns, painted when the beam passes */
  const SHIPRET = [];
  function shipBearing(D, s) { const c = W.SHIP.at(s); return { c, r: Math.hypot(c[0] - D.p[0], c[1] - D.p[2]), b: wrapA(Math.atan2(c[0] - D.p[0], c[1] - D.p[2]) - D.psi) }; }
  function drawShipReturn(T, D, k) {
    const sb = shipBearing(D, D.s); if (sb.r > RAD.rMax + 1500 || Math.abs(sb.b) > RAD.az) return null;
    const tp = lastPaint(sb.b, D.s), ageF = (D.s - tp) / Math.max(1, rateOf(T)), key = Math.round(tp * 20);
    const c = W.SHIP.at(tp), glow = Math.exp(-ageF * .9), rr = rng(9000 + key);
    const ux = Math.sin(D.psi + sb.b), uz = Math.cos(D.psi + sb.b), cross = sb.r * 1.8 * DEG / 2.4;
    const inRange = sb.r < RAD.rMax + 400 ? 1 : sat((RAD.rMax + 1500 - sb.r) / 1100) * .6;
    for (let q = 0; q < 34; q++) {
      const al = (rr() - .5) * 155 * 2.2, cr = M3.gauss(rr) * cross, rg = M3.gauss(rr) * 18;
      const x = c[0] + W.SHIP.d[0] * al + uz * cr + ux * rg, z = c[1] + W.SHIP.d[1] * al - ux * cr + uz * rg;
      const P = 60 * Math.exp(-.5 * (cr / cross) ** 2) * -Math.log(rr()) + 1, db = 4.343 * Math.log(P);
      const y = RAD.HK * Math.max(0, db - 2) + 14;
      if (!P3(x, y, z)) continue;
      const bb = (.55 + .45 * glow) * k * inRange;
      const col = ageF < .6 ? LIME : WH;
      if (P3(x, 0, z)) { const x0 = PX, y0 = PY; if (P3(x, y, z)) BUF.dline(x0, y0, PX, PY, 2.5, 1, col[0], col[1], col[2], bb * .55); }
      put(PX, PY, 2, col[0], col[1], col[2], Math.min(1, bb));
    }
    return { c, ageF, r: sb.r, inRange };
  }

  /* ---------- the contact: an uncertainty cloud that settles onto the hull (p5) ---------- */
  const DDM = W.ddMain;
  const CLOUD = (() => {
    let n = 0; for (const s of DDM) n += s.pts.length / 6;
    const pm = new Float32Array(n * 3), pn = new Float32Array(n * 3), part = new Uint8Array(n), rho = new Float32Array(n);
    let i = 0; DDM.forEach((s, pi) => { const T = s.part.xf ? s.part.xf({ sps: 0 }) : X.make(); for (let k = 0; k < s.pts.length; k += 6, i++) { const q = X.ap(T, [s.pts[k], s.pts[k + 1], s.pts[k + 2]]); pm[i * 3] = q[0]; pm[i * 3 + 1] = q[1]; pm[i * 3 + 2] = q[2]; const nn = X.dir(T, [s.pts[k + 3], s.pts[k + 4], s.pts[k + 5]]); pn[i * 3] = nn[0]; pn[i * 3 + 1] = nn[1]; pn[i * 3 + 2] = nn[2]; part[i] = pi; rho[i] = s.name === 'hull' ? 1 : s.name === 'mast' || s.name === 'sps' ? .6 : .78; } });
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], pm[k * 3 + c]); mx[c] = Math.max(mx[c], pm[k * 3 + c]); }
    return { n, pm, pn, part, rho, mn, mx };
  })();
  const T_C0 = 90.5, PULSE = .85, NPULSE = 15;
  const sigOf = n => 70 * Math.exp(-.36 * n) + .05;
  const pulseT = k => T_C0 + k * PULSE;
  /* one point's belief offset after pulse kk (kk < 0: the prior, before any return) */
  const OFF = [0, 0, 0];
  function cloudOff(i, kk, los, crs) {
    const sgm = (kk < 0 ? 70 : sigOf(kk + 1)) * CLOUD.rho[i], key = kk < 0 ? 7 + ((i + kk * 3) % 5 + 5) % 5 * 2 : 50 + kk * 11;
    const a = gH(i, key) * sgm * .42, b = gH(i, key + 2) * sgm, h = gH(i, key + 4) * sgm * .38;
    OFF[0] = los[0] * a + crs[0] * b; OFF[1] = h; OFF[2] = los[2] * a + crs[2] * b;
  }
  function shipXf(s) { const c = W.SHIP.at(s); return X.make(R.y(W.SHIP.hdg), [c[0], 0, c[1]]); }
  function drawCloud(T, D, k) {
    const s = D.s, Tm = shipXf(s), M = Tm.R, t = Tm.T;
    const los = V.norm([t[0] - D.p[0], 0, t[2] - D.p[2]]), crs = [los[2], 0, -los[0]];
    const kp = Math.floor((T - T_C0) / PULSE), nEv = E.clamp(kp + 1, 0, NPULSE);
    const off0 = V.add(V.mul(los, 60), V.mul(crs, -85)), dOff = V.mul(off0, Math.exp(-.42 * nEv) * (T < T_C0 ? 1 : 1));
    const cen = [t[0] + dOff[0], t[1] + dOff[1], t[2] + dOff[2]];
    const L0 = LM[0], L1 = LM[1], L2 = LM[2];
    const VWF = 700;                                   // visual wavefront speed along the line of sight (m/s)
    const res = sat((nEv - 9) / 5);                    // how resolved the surface reads
    for (let i = 0; i < CLOUD.n; i++) {
      const px = CLOUD.pm[i * 3], py = CLOUD.pm[i * 3 + 1], pz = CLOUD.pm[i * 3 + 2];
      let x = M[0] * px + M[1] * py + M[2] * pz, y = py, z = M[6] * px + M[7] * py + M[8] * pz;
      const lam = x * los[0] + z * los[2];
      // the pulse that last reached this point, and the one before it
      const tk = T - T_C0 - (lam + 90) / VWF;
      const kk = Math.min(NPULSE - 1, Math.floor(tk / PULSE));
      const since = tk - Math.max(0, kk) * PULSE, e = kk < 0 ? 1 : sat(since / .38), ee = 1 - (1 - e) ** 3;
      let ox, oy, oz;
      if (kk < 0) { const w = Math.floor((T - 80) / .25); cloudOff(i, -1 - (w % 3), los, crs); ox = OFF[0]; oy = OFF[1]; oz = OFF[2]; }
      else {
        cloudOff(i, kk - 1, los, crs); const ax = OFF[0], ay = OFF[1], az = OFF[2];
        cloudOff(i, kk, los, crs); ox = ax + (OFF[0] - ax) * ee; oy = ay + (OFF[1] - ay) * ee; oz = az + (OFF[2] - az) * ee;
      }
      x += cen[0] + ox; y += cen[1] + oy; z += cen[2] + oz;
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < 5) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      const sgn = Math.min(1, (kk < 0 ? 70 : sigOf(kk + 1)) * CLOUD.rho[i] / 18);
      const nx = CLOUD.pn[i * 3], ny = CLOUD.pn[i * 3 + 1], nz = CLOUD.pn[i * 3 + 2];
      let lit = .6;
      if (nx || ny || nz) { const wx = M[0] * nx + M[2] * nz, wz = M[6] * nx + M[8] * nz; lit = (wx * dx + ny * dy + wz * dz > 0 ? .22 : .42) + .55 * Math.max(0, wx * L0 + ny * L1 + wz * L2); }
      let bb = (lit + (.6 - lit) * sgn) * (1 - .25 * sgn) * (y < 0 ? .4 : 1) * k;
      let cr = WH[0], cg = WH[1], cb = WH[2];
      if (kk >= 0 && since < .5) { const w = Math.exp(-since * 7); cr += (LIME[0] - cr) * w; cg += (LIME[1] - cg) * w; cb += (LIME[2] - cb) * w; bb = Math.max(bb, .9 * w * k); }
      put(sx, sy, 1, cr, cg, cb, bb > 1 ? 1 : bb);
    }
    return { cen, nEv, sig: sigOf(nEv), los, crs };
  }
  /* the resolved ship: a lit surface, SPS turning, wake, helo on the deck */
  const HELOW = X.make(R.I(), HD.destroyer.A.heloSpot);
  // true bounds of the parked MH-60R (rotor at rest included), from its own dots
  const HELOB = (() => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const sp of W.heloParts) { const T = sp.part.xf ? sp.part.xf({ rotor: .3, droop: 1 }) : X.make(); for (let k = 0; k < sp.pts.length; k += 6) { const q = X.ap(T, [sp.pts[k], sp.pts[k + 1], sp.pts[k + 2]]); for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], q[c]); mx[c] = Math.max(mx[c], q[c]); } } } return [mn, mx]; })();
  function drawShip(T, D, k, fine, stride) {
    const s = D.s, Tm = shipXf(s), st = { sps: s * TAU / 4, ciwsYaw: [ciwsYawAt(T), Math.PI] };
    const parts = fine ? W.ddFine : W.ddMain;
    for (const sp of parts) drawPts(sp.pts, partX(Tm, sp.part, st), k, fine ? 400 : 300, null, 0, stride);
    const hw = X.mul(Tm, HELOW);
    for (const sp of W.heloParts) drawPts(sp.pts, partX(hw, sp.part, { rotor: .3, droop: 1 }), k, 300, null, 0);
    drawWake(T, Tm, k, s);
  }
  function drawWake(T, Tm, k, s) {
    const flow = (s * W.SHIP.v) % 6;
    for (let d = 0; d < 900; d += 6) {
      const dd = d + flow, fa = k * Math.pow(1 - dd / 900, 1.5);
      for (const sd of [-1, 1]) { const lat = sd * (7 + dd * Math.tan(19.5 * DEG)); if (P3v(X.ap(Tm, [lat, .4, -78 - dd]))) put(PX, PY, 1, WH[0], WH[1], WH[2], fa * .55); }
      for (let m = 0; m < 3; m++) { const r = hsh(d * 3 + m, Math.floor(s * W.SHIP.v / 6) - (d / 6 | 0)), lat = (r - .5) * (14 + dd * .07); if (P3v(X.ap(Tm, [lat, .3, -78 - dd]))) put(PX, PY, 1, WH[0], WH[1], WH[2], fa * .45); }
    }
    for (let q = 0; q < 70; q++) { const sd = q & 1 ? 1 : -1, zz = 60 - (q >> 1) * 1.5, b = 10.5 + (60 - zz) * .06; if (P3v(X.ap(Tm, [sd * b, .5 + .4 * Math.sin(q + T * 3), zz]))) put(PX, PY, 1, WH[0], WH[1], WH[2], k * .5); }
  }
  /* the sea around the contact: a dot grid in the ship's frame, flowing aft (p5) */
  const SSJ = (() => { const r = rng(77), a = new Float32Array(110 * 110 * 2); for (let i = 0; i < a.length; i++) a[i] = (r() - .5) * 12 * .7; return a; })();
  function drawShipSea(T, s, k, step) {
    const c = W.SHIP.at(s), hs = W.SHIP.hdg, fw = [Math.sin(hs), Math.cos(hs)], rt = [Math.cos(hs), -Math.sin(hs)], flow = (s * W.SHIP.v) % 12, wl = TAU * 30 / DUR, st = step || 1;
    for (let a = 0; a < 110; a += st) for (let b = 0; b < 110; b += st) {
      const q = (a * 110 + b) * 2, lx = (a - 55) * 12 + SSJ[q], lz = (b - 55) * 12 - flow + SSJ[q + 1];
      const x = c[0] + rt[0] * lx + fw[0] * lz, z = c[1] + rt[1] * lx + fw[1] * lz;
      const y = 1.1 * Math.sin(x * .021 + T * wl) + .6 * Math.sin((lz + s * W.SHIP.v) * .034 + lx * .012);
      if (!P3(x, y, z)) continue;
      if (PX < 0 || PY < 0 || PX >= VW || PY >= VH) continue;
      const dd = Math.hypot(lx, lz), fd = Math.max(0, 1 - dd / 640);
      put(PX, PY, PZ < 2500 ? 2 : 1, 238, 238, 228, k * (.36 + .26 * (y + 1.7) / 3.4) * fd);
    }
  }
  function shipBounds2D(Tm, mn, mx) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = false;
    for (const sx of [mn[0], mx[0]]) for (const sy of [mn[1], mx[1]]) for (const sz of [mn[2], mx[2]]) { if (!P3v(X.ap(Tm, [sx, sy, sz]))) continue; ok = true; x0 = Math.min(x0, PX); x1 = Math.max(x1, PX); y0 = Math.min(y0, PY); y1 = Math.max(y1, PY); }
    return ok ? [x0, y0, x1, y1] : null;
  }
  const PARTB = {};
  for (const sp of W.ddFine) { const b = GEO.bounds(sp.part); PARTB[sp.name] = b; }
  function bracket(ctx, b, col, a, pad, len) {
    const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad, c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
    ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); }
    ctx.stroke(); ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.globalAlpha = a * .45; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]); ctx.globalAlpha = 1;
    return [x0, y0, x1, y1];
  }

  /* ---------- the squall: a low cloud base, rain shafts under it, streaks around the lens inside ---------- */
  const SHAFTS = (() => { const r = rng(61), a = []; for (let k = 0; k < 9; k++) { const rr = Math.sqrt(r()) * W.SQ.r * .8, th = r() * TAU; a.push([Math.sin(th) * rr, Math.cos(th) * rr, 220 + 380 * r()]); } return a; })();
  const RAINP = (() => { const r = rng(62), a = []; for (let i = 0; i < 6000; i++) { const sh = SHAFTS[i % SHAFTS.length], rr = Math.sqrt(r()) * sh[2], th = r() * TAU; a.push(sh[0] + Math.sin(th) * rr, r(), sh[1] + Math.cos(th) * rr, r()); } return new Float32Array(a); })();
  const CLOUDP = (() => { const r = rng(63), a = []; for (let i = 0; i < 5000; i++) { const rr = Math.sqrt(r()) * W.SQ.r * 1.15, th = r() * TAU; a.push(Math.sin(th) * rr, (r() - .5) * 40 + 30 * M3.noise(th * 3, rr * .004), Math.cos(th) * rr, r()); } return new Float32Array(a); })();
  const CLOUD_Y = 720;
  function drawRainFar(T, s, k) {
    const c = W.SQ.at(s), wl = TAU * 40 / DUR;
    // rain shafts: long streaks falling out of the base, densest in the core
    for (let i = 0; i < RAINP.length; i += 4) {
      const x = c[0] + RAINP[i], z = c[1] + RAINP[i + 2], y = CLOUD_Y * fmod(RAINP[i + 1] - T * 3.2 * 6 / CLOUD_Y, 1);
      if (!P3(x, y, z)) continue;
      const x0 = PX, y0 = PY, z0 = PZ;
      if (z0 < 60) continue;
      if (!P3(x + 4, y + 55, z)) continue;
      BUF.dline(x0, y0, PX, PY, 3, 1, 214, 220, 210, k * (.2 + .25 * RAINP[i + 3]) * Math.min(1, y / 80) * Math.min(1, z0 / 400));
    }
    // the base of the cell: a dotted ceiling
    for (let i = 0; i < CLOUDP.length; i += 4) {
      if (!P3(c[0] + CLOUDP[i], CLOUD_Y + CLOUDP[i + 1], c[1] + CLOUDP[i + 2])) continue;
      if (PX < 0 || PY < 0 || PX >= VW || PY >= VH) continue;
      put(PX, PY, 1, 200, 206, 196, k * (.22 + .2 * CLOUDP[i + 3]) * (.7 + .3 * Math.sin(CLOUDP[i + 3] * 20 + T * wl)));
    }
  }
  function drawRainNear(T, D, k) {
    // streaks in a box that moves with the camera, world-anchored so they slide past; the streak is the
    // drops' motion relative to the lens over a short exposure (fall + the drone's own speed)
    const H = 60, vf = [W.SQ.w[0], -9, W.SQ.w[1]], dv = V.sub(vf, droneVel(T)), ex = V.mul(dv, .045);
    const el = V.len(ex), cl = el > 4 ? 4 / el : 1;
    ex[0] *= cl; ex[1] *= cl; ex[2] *= cl;
    for (let i = 0; i < 2600; i++) {
      const bx = hsh(i, 1) * H, by = hsh(i, 2) * H, bz = hsh(i, 3) * H;
      const x = E0 + fmod(bx + vf[0] * T - E0, H) - H / 2, y = E1 + fmod(by + vf[1] * T * 3 - E1, H) - H / 2, z = E2 + fmod(bz + vf[2] * T - E2, H) - H / 2;
      if (!P3(x, y, z)) continue;
      const x0 = PX, y0 = PY, z0 = PZ;
      if (!P3(x - ex[0], y - ex[1], z - ex[2])) continue;
      BUF.dline(x0, y0, PX, PY, 2, 1, 225, 230, 220, k * .6 * Math.min(1, 9 / z0));
    }
  }
  function droneVel(T) { const s0 = simOf(T), q0 = W.routeAt(s0, RS3), p0 = q0.p.slice(), q1 = W.routeAt(s0 + .2, RS3); return V.mul(V.sub(q1.p, p0), 5); }
  function drawRainLidar(T, D, k) {
    // backscatter from drops inside the fan, flickering frame to frame
    const f = Math.floor(T * 60), Tm = X.make(D.M, D.p);
    for (let i = 0; i < 260; i++) {
      const u = (hsh(i, f) - .5) * 2 * Math.tan(W.FAN), rr = 8 + 160 * Math.pow(hsh(i + 7, f), 1.6);
      const q = X.ap(Tm, [u * rr * .9, -rr, rr * W.LEAD]);
      if (!P3v(q)) continue;
      put(PX, PY, 1, LIME[0], LIME[1], LIME[2], k * (.35 + .5 * hsh(i, f + 1)));
    }
  }

  /* ---------- the strike on TRK 01 (spectacle, not a weapons model) ----------
     A lime sea-skimmer comes in low from the coast, the forward CIWS hoses coral tracers at it, a bloom on the
     port bow, debris into the sea, a smoke column leaning downwind. Bloom, debris and smoke ride the ship's
     translation (a moving source must not smear the column along the track at the squall's x14 time rate);
     everything is analytic in film time and gone by T_SMK_OFF, so the loop seam is untouched. */
  const DDA = HD.destroyer.A, HIT_L = [-9.4, 4.6, 9], CIWS_ST = { ciwsYaw: [0, Math.PI] };
  const HDG = W.SHIP.hdg, SFWD = [Math.sin(HDG), 0, Math.cos(HDG)], SRT = [Math.cos(HDG), 0, -Math.sin(HDG)], PORT = [-SRT[0], 0, -SRT[2]];
  const WDIR = [WD[0], 0, WD[2]];
  const hitW = s => X.ap(shipXf(s), HIT_L);
  const MSL = (() => {
    const I = hitW(simOf(T_HIT)), brg = 210 * DEG, L = 3400, VM = 360;
    const S = [I[0] + Math.sin(brg) * L, 0, I[2] + Math.cos(brg) * L], sd = [Math.cos(brg), 0, -Math.sin(brg)];
    const C = [(S[0] + I[0]) / 2 - sd[0] * 300, 0, (S[2] + I[2]) / 2 - sd[2] * 300];
    const N = 800, P = new Float64Array((N + 1) * 3), A = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      P[i * 3] = a * S[0] + b * C[0] + c * I[0]; P[i * 3 + 1] = mix(11, I[1], ss(.9, 1, u)); P[i * 3 + 2] = a * S[2] + b * C[2] + c * I[2];
      if (i) A[i] = A[i - 1] + Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
    }
    return { I, P, A, N, len: A[N], VM };
  })();
  const MP = [0, 0, 0];
  function mslAt(d) {
    const A = MSL.A, P = MSL.P; d = E.clamp(d, 0, MSL.len);
    let lo = 0, hi = MSL.N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= d) lo = m; else hi = m; }
    const u = (d - A[lo]) / Math.max(1e-9, A[hi] - A[lo]);
    MP[0] = P[lo * 3] + (P[hi * 3] - P[lo * 3]) * u; MP[1] = P[lo * 3 + 1] + (P[hi * 3 + 1] - P[lo * 3 + 1]) * u; MP[2] = P[lo * 3 + 2] + (P[hi * 3 + 2] - P[lo * 3 + 2]) * u;
    return MP;
  }
  const mslArc = T => MSL.len - MSL.VM * (T_HIT - T);
  /* forward CIWS: slews onto the incoming streak, then holds */
  function ciwsYawAt(T) {
    if (T < T_FIRE0 - 1.8 || T > T_SMK_OFF + 1) return 0;
    const t = Math.min(T, T_HIT - .02), o = X.ap(shipXf(simOf(t)), [0, 11, 32.9]), m = mslAt(mslArc(t + .15));
    const dx = m[0] - o[0], dz = m[2] - o[2];
    return ss(T_FIRE0 - 1.8, T_FIRE0 - .25, T) * Math.atan2(dx * SRT[0] + dz * SRT[2], dx * SFWD[0] + dz * SFWD[2]);
  }
  function muzzleAt(t) { CIWS_ST.ciwsYaw[0] = ciwsYawAt(t); return X.ap(shipXf(simOf(t)), DDA.ciws(CIWS_ST, 0)); }
  const TR_DT = 1 / 60, TR_V = 1050, TR_L = 1.2;
  function drawTracers(T, k) {
    if (T < T_FIRE0 || T > T_FIRE1 + TR_L) return;
    const q0 = Math.max(0, Math.ceil((T - TR_L - T_FIRE0) / TR_DT)), q1 = Math.floor((Math.min(T, T_FIRE1) - T_FIRE0) / TR_DT);
    for (let q = q0; q <= q1; q++) {
      const tk = T_FIRE0 + q * TR_DT, a = T - tk; if (a < 0) continue;
      const mz = muzzleAt(tk), tg = mslAt(mslArc(tk + .12));
      let dx = tg[0] - mz[0] + gH(q, 3) * 6, dy = tg[1] - mz[1] + gH(q, 5) * 3 + 2, dz = tg[2] - mz[2] + gH(q, 7) * 6;
      const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
      const r = TR_V * a; if (r > L + 300) continue;
      const x = mz[0] + dx * r, y = mz[1] + dy * r - 4.9 * a * a, z = mz[2] + dz * r, al = k * (1 - a / TR_L);
      for (let m = 0; m < 4; m++) if (P3(x - dx * m * 2.4, y - dy * m * 2.4, z - dz * m * 2.4)) put(PX, PY, m === 0 && PZ < 6000 ? 2 : 1, CORAL[0], CORAL[1], CORAL[2], al * (1 - m * .22));
    }
    if (T >= T_FIRE0 && T <= T_FIRE1) {
      const f = Math.floor(T * 60), mz = muzzleAt(T);
      if (P3v(mz)) { put(PX, PY, 2, 255, 222, 196, k * (.55 + .45 * hsh(f, 3))); BUF.add(PX, PY, 5, CORAL[0], CORAL[1], CORAL[2], k * .1); }
    }
  }
  /* the streak: head, lime trail left in the air, spray kicked off the water under it */
  function drawMissile(T, k) {
    const head = mslArc(T); if (head < 0 || T > T_HIT + 1.6) return;
    const VM = MSL.VM, h = Math.min(head, MSL.len), step = 1.5;
    for (let arc = Math.floor(h / step) * step; arc > 0 && arc > h - 700; arc -= step) {
      const age = T - (T_HIT - (MSL.len - arc) / VM), al = k * (.75 * Math.exp(-age * 6) + .3 * Math.exp(-age * 1.4));
      if (al < .025) break;
      const p = mslAt(arc), n = Math.round(arc / step);
      if (P3(p[0], p[1] + age * 1.5, p[2])) put(PX, PY, age < .12 ? 2 : 1, LIME[0], LIME[1], LIME[2], al > 1 ? 1 : al);
      if (hsh(n, 5) < .55 && p[1] > 6) { const sp = 1.5 + age * 10; if (P3(p[0] + gH(n, 1) * sp, .3 + hsh(n, 9) * 3 * Math.min(1, age * 4), p[2] + gH(n, 3) * sp)) put(PX, PY, 1, WH[0], WH[1], WH[2], al * .5); }
    }
    if (T < T_HIT) {
      const p = mslAt(head);
      if (P3v(p)) { put(PX, PY, 3, 240, 255, 196, k); BUF.add(PX, PY, 9, LIME[0], LIME[1], LIME[2], .16 * k); BUF.add(PX, PY, 17, LIME[0], LIME[1], LIME[2], .05 * k); }
    }
  }
  /* the bloom: a lumpy shell of dots venting off the port side, white-hot, warming, cooling to smoke */
  const BLM = (() => {
    const r = rng(1108), n = 2600, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u);
      a[i * 5] = s * Math.cos(th); a[i * 5 + 1] = u; a[i * 5 + 2] = s * Math.sin(th);
      a[i * 5 + 3] = 1 - .65 * Math.pow(r(), 2.2);
      a[i * 5 + 4] = .72 + .56 * sat(.5 + M3.noise(a[i * 5] * 1.9 + 3, a[i * 5 + 1] * 1.9, a[i * 5 + 2] * 1.9));
    }
    return { n, a };
  })();
  function drawBloom(T, base, k) {
    const a = T - T_HIT; if (a < 0 || a > 3.6) return;
    const R = 30 * (1 - Math.exp(-a * 7)) + 5 * a, I = Math.exp(-a * 1.5), vent = 9 * (1 - Math.exp(-a * 4));
    const cx = base[0] + PORT[0] * vent, cy = base[1] + 2 + 10 * a, cz = base[2] + PORT[2] * vent;
    const B = BLM.a, warm = sat(a * 1.8), grey = sat((a - .9) / 1.5), big = a < .55 ? 2 : 1;
    for (let i = 0; i < BLM.n; i++) {
      const q = i * 5, rr = R * B[q + 3] * B[q + 4];
      const x = cx + B[q] * rr, y = cy + B[q + 1] * rr * .85, z = cz + B[q + 2] * rr;
      if (y < .3 || !P3(x, y, z)) continue;
      const core = 1 - B[q + 3], wr = warm * (1 - grey) * (.25 + .5 * core);
      let cr = 255, cg = mix(252, 222, wr), cb = mix(244, 196, wr);
      cr = mix(cr, 206, grey); cg = mix(cg, 210, grey); cb = mix(cb, 202, grey);
      const al = k * (.16 + 1.05 * I * (.7 + core)) * (1 - ss(2.6, 3.6, a));
      put(PX, PY, PZ < 6000 && (big > 1 || core > .45) ? 2 : 1, cr, cg, cb, al > 1 ? 1 : al);
    }
    // the first instant: a white core, and a ring racing out over the water
    if (a < .25 && P3(cx, cy, cz)) { const w = 1 - a / .25; put(PX, PY, 5, 255, 255, 248, k * w); BUF.add(PX, PY, 13, 255, 250, 236, .3 * k * w); }
    if (a < 1.6) {
      const rr = 12 + 230 * (1 - Math.exp(-a * 2.2)), al = k * .55 * (1 - a / 1.6);
      for (let j = 0; j < 180; j++) { const th = j / 180 * TAU + hsh(j, 41) * .03, rj = rr * (.97 + .06 * hsh(j, 43)); if (P3(base[0] + Math.sin(th) * rj, .4, base[2] + Math.cos(th) * rj)) put(PX, PY, 1, WH[0], WH[1], WH[2], al); }
    }
  }
  /* debris: fragments thrown off the port side, a few burning brands trailing dots, small splashes */
  const DEB = (() => {
    const r = rng(1107), n = 420, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      const out = .2 + r() * .9, up = .45 + r() * 1.4, fw = (r() - .5) * 1.5, sp = 14 + 46 * Math.pow(r(), 1.4);
      const vx = PORT[0] * out + SFWD[0] * fw, vy = up, vz = PORT[2] * out + SFWD[2] * fw, L = Math.hypot(vx, vy, vz);
      a[i * 5] = vx / L * sp; a[i * 5 + 1] = vy / L * sp; a[i * 5 + 2] = vz / L * sp; a[i * 5 + 3] = r(); a[i * 5 + 4] = i % 9 === 0 ? 1 : 0;
    }
    return { n, a };
  })();
  function drawDebris(T, base, k) {
    const a = T - T_HIT; if (a < 0 || a > 6.5) return;
    const D_ = DEB.a, c = .4, g2 = 4.905;
    for (let i = 0; i < DEB.n; i++) {
      const q = i * 5, vx = D_[q], vy = D_[q + 1], vz = D_[q + 2];
      const tl = (vy + Math.sqrt(vy * vy + 4 * g2 * base[1])) / (2 * g2);
      if (a < tl) {
        const hh = (1 - Math.exp(-c * a)) / c, x = base[0] + vx * hh, y = base[1] + vy * a - g2 * a * a, z = base[2] + vz * hh;
        const al = k * (.9 - .4 * a / tl);
        if (D_[q + 4]) {
          for (let m = 1; m < 22; m++) { const t = a - m * .05; if (t < 0) break; const h2 = (1 - Math.exp(-c * t)) / c; if (P3(base[0] + vx * h2, base[1] + vy * t - g2 * t * t + m * .3, base[2] + vz * h2)) put(PX, PY, m < 5 && PZ < 6000 ? 2 : 1, 214, 218, 208, al * .6 * (1 - m / 22)); }
          if (P3(x, y, z)) put(PX, PY, PZ < 6000 ? 3 : 2, 255, 238, 214, al);
        } else if (P3(x, y, z)) put(PX, PY, PZ < 6000 && D_[q + 3] > .6 ? 2 : 1, WH[0], WH[1], WH[2], al * (.5 + .5 * D_[q + 3]));
      } else if (a < tl + .8) {
        const w = a - tl, hh = (1 - Math.exp(-c * tl)) / c, x = base[0] + vx * hh, z = base[2] + vz * hh;
        for (let m = 0; m < 3; m++) { const vs = 3.5 + m * 2.4 + D_[q + 3] * 2, yy = vs * w - g2 * w * w; if (yy < 0) continue; if (P3(x + (m - 1) * .7, yy, z)) put(PX, PY, 1, WH[0], WH[1], WH[2], k * .6 * (1 - w / .8)); }
      }
    }
  }
  /* smoke: a continuous column of puffs from the hole, buoyant rise, spreading, bending over downwind */
  // emission rate: a thick burst out of the fireball, settling to a steady feed; birth times by inverting the count
  const SMK = (() => {
    const T0 = T_HIT + .15, cnt = t => 170 * t + 1300 * (1 - Math.exp(-t / 1.3)), span = T_SMK_OFF - T0, n = Math.floor(cnt(span));
    const b = new Float64Array(n), o = new Float32Array(n * 4);
    for (let i = 0, t = 0; i < n; i++) { while (cnt(t) < i) t += .0005; b[i] = T0 + t; }
    for (let i = 0; i < n; i++) {
      const pf = i >> 4;
      o[i * 4] = gH(pf, 3) * .55 + gH(i, 13) * .28; o[i * 4 + 1] = gH(pf, 11) * .25 + gH(i, 19) * .24; o[i * 4 + 2] = gH(pf, 7) * .55 + gH(i, 17) * .28; o[i * 4 + 3] = hsh(i, 23);
    }
    return { T0, n, b, o, L: 24 };
  })();
  const smkIdx = t => { const B = SMK.b; let lo = 0, hi = SMK.n; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < t) lo = m + 1; else hi = m; } return lo; };
  const smkH = a => 150 * (1 - Math.exp(-a / 3)) + 12.5 * a, smkR = a => 6 + 4.2 * a, smkLean = a => .85 * Math.pow(a, 1.8);
  const smkFade = T => 1 - ss(T_SMK_OFF - 5, T_SMK_OFF, T);
  function drawSmoke(T, base, k) {
    const G = k * smkFade(T); if (G <= 0 || T < SMK.T0) return;
    const O = SMK.o, SB = SMK.b, i0 = smkIdx(T - SMK.L), i1 = smkIdx(T);
    const L0 = W.LIGHT[0], L2 = W.LIGHT[2];
    for (let i = i0; i < i1; i++) {
      const a = T - SB[i], h = smkH(a), r = smkR(a), lean = smkLean(a), q = i * 4;
      const ox = O[q] * r, oy = O[q + 1] * r, oz = O[q + 2] * r;
      const y = base[1] + h + oy; if (y < .5) continue;
      if (!P3(base[0] + WDIR[0] * lean + ox, y, base[2] + WDIR[2] * lean + oz)) continue;
      const side = E.clamp((ox * L0 + oz * L2) / r, -1, 1);
      let b = (.34 + .16 * side + .14 * O[q + 3]) * sat(a / .5) * (1 - ss(SMK.L - 8, SMK.L, a)) * G / (1 + a * .03);
      let cr = 212, cg = 216, cb = 206;
      if (a < 1.6) { const w = Math.exp(-a * 2.6) * .7; cr += (CORAL[0] - cr) * w; cg += (CORAL[1] - cg) * w; cb += (CORAL[2] - cb) * w; b = Math.max(b, w * .8 * G); }
      put(PX, PY, PZ < 4600 && a < 9 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
  /* the fire in the hole: a few flickering points, the only lasting coral */
  function drawFire(T, base, k) {
    const a = T - T_HIT; if (a < .25) return;
    const G = k * sat((a - .25) / .6) * smkFade(T), f = Math.floor(T * 24);
    if (G <= 0) return;
    for (let j = 0; j < 40; j++) {
      const u = hsh(j, f), v = hsh(j + 97, f), w = hsh(j + 7, 3);
      const al = SFWD[0] * (w - .5) * 14, x = base[0] + PORT[0] * 1.2 + al + (u - .5) * 2.4, y = base[1] - 1.8 + v * v * 8, z = base[2] + PORT[2] * 1.2 + SFWD[2] * (w - .5) * 14 + (u - .5) * 2.4;
      if (P3(x, y, z)) put(PX, PY, PZ < 2500 ? 2 : 1, 255, 150 + 90 * (1 - v), 110 + 60 * (1 - v), G * (.95 - .6 * v));
    }
  }
  /* everything of the strike into the synced view; returns the hit point's screen spot (or null) */
  function drawStrike(T, s, k) {
    if (T < T_HIT - 9 || T > T_SMK_OFF) return null;
    drawMissile(T, k); drawTracers(T, k);
    if (T < T_HIT) return null;
    const base = hitW(s);
    drawSmoke(T, base, k); drawDebris(T, base, k); drawBloom(T, base, k); drawFire(T, base, k);
    return P3v(base) ? [PX, PY, PZ] : null;
  }
  /* bloom glow on an overlay context: flash, then a warm afterglow */
  function strikeGlow(ctx, p, T, sc) {
    const a = T - T_HIT; if (!p || a < 0 || a > 3) return;
    const A = .75 * Math.exp(-a * 5) + .2 * Math.exp(-a * 1.1), r = (60 + 120 * sat(a * 3)) * sc;
    const g = ctx.createRadialGradient(p[0], p[1] - 8 * sc, 0, p[0], p[1] - 8 * sc, r);
    g.addColorStop(0, `rgba(255,246,226,${A.toFixed(3)})`); g.addColorStop(.3, `rgba(255,180,140,${(A * .35).toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,110,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - 8 * sc - r, 2 * r, 2 * r); ctx.globalCompositeOperation = 'source-over';
  }
  /* what the EO frames: the ship, then the ship with its smoke column (cam: the inset's exact target) */
  function eoAim(T, s, cam) {
    const c = W.SHIP.at(s), u = ss(T_HIT + .6, T_HIT + 7, T);
    if (u <= 0) return cam ? [c[0] + 4, 12, c[1]] : [c[0], SHIPY, c[1]];
    const lean = smkLean(Math.min(12, Math.max(0, T - T_HIT))) * .45, hw = hitW(s);
    return [mix(c[0] + 4, hw[0] + WDIR[0] * lean, u), mix(12, 150, u), mix(c[1], hw[2] + WDIR[2] * lean, u)];
  }
  const eoExt = T => mix(95, 280, ss(T_HIT + .6, T_HIT + 7, T));
  /* rain between the lens and the ship: streaks and speckle across the inset */
  function drawInsetRain(T, k) {
    const f = Math.floor(T * 60);
    for (let i = 0; i < 260; i++) {
      const x = hsh(i, f) * 544, y = hsh(i + 400, f) * 306, l = 6 + 14 * hsh(i + 800, f);
      BUF.dline(x, y, x - l * .18, y + l, 2, 1, 214, 220, 210, k * (.12 + .2 * hsh(i + 1200, f)));
    }
  }

  /* ---------- tags (DOM) ---------- */
  const ui = document.getElementById('ui');
  const TAGS = new Map();
  function putTags(list) {
    for (const t of TAGS.values()) t.used = false;
    list.sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.y - b.y);
    const placed = [];
    for (const tg of list) {
      let t = TAGS.get(tg.key);
      if (!t) { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = '<b></b><i></i><span class="v"></span>'; ui.insertBefore(el, document.getElementById('menu')); t = { el, txt: '' }; TAGS.set(tg.key, t); }
      t.used = true;
      const txt = tg.cls + '|' + tg.a + '|' + tg.b + '|' + (tg.v || '');
      if (t.txt !== txt) { t.txt = txt; t.el.className = 'tag ' + tg.cls; t.el.children[0].textContent = tg.a; t.el.children[1].textContent = tg.b; t.el.children[2].textContent = tg.v || ''; t.el.children[2].style.display = tg.v ? '' : 'none'; }
      const w = t.el.offsetWidth || 180;
      let x = Math.min(tg.x, 1380 - w), y = Math.max(150, tg.y);
      for (let g = 0; g < 10; g++) { const hit = placed.find(p => x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < 24); if (!hit) break; y = hit.y + 25; }
      placed.push({ x, y, w });
      t.el.style.opacity = tg.al.toFixed(2);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (tg.lead) { octx.strokeStyle = 'rgba(238,238,228,.6)'; octx.setLineDash([2, 3]); octx.globalAlpha = tg.al; octx.beginPath(); octx.moveTo(tg.lead[0], tg.lead[1]); octx.lineTo(x, y + 20); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
    }
    for (const t of TAGS.values()) if (!t.used) t.el.style.opacity = 0;
  }

  /* ---------- readouts ---------- */
  const kickEl = document.getElementById('kick'), rtxt = document.getElementById('rtxt'), rsub = document.getElementById('rsub'), rbar = document.getElementById('rbar');
  const insl = document.getElementById('insl'), insr = document.getElementById('insr'), barsEl = document.getElementById('bars');
  const NAMES = ['Unknown', 'Frigate', 'DDG', 'Cruiser'];
  barsEl.innerHTML = NAMES.map((n, c) => `<span class="l" id="bl${c}">${n}</span><span class="b" id="bb${c}"><i id="bi${c}"></i></span><span class="v" id="bv${c}">0.00</span>`).join('');
  const BI = [0, 1, 2, 3].map(c => document.getElementById('bi' + c)), BV = [0, 1, 2, 3].map(c => document.getElementById('bv' + c)), BL = [0, 1, 2, 3].map(c => [document.getElementById('bl' + c), document.getElementById('bb' + c), document.getElementById('bv' + c)]);
  const PATH = [[0, [.64, .12, .12, .12]], [.3, [.40, .30, .18, .12]], [.55, [.18, .44, .28, .10]], [.8, [.08, .22, .62, .08]], [1, [.03, .04, .89, .04]]];
  const probsAt = e => { for (let i = 1; i < PATH.length; i++) if (e <= PATH[i][0]) { const u = ss(0, 1, (e - PATH[i - 1][0]) / (PATH[i][0] - PATH[i - 1][0])); return PATH[i - 1][1].map((v, c) => v + (PATH[i][1][c] - v) * u); } return PATH[PATH.length - 1][1]; };
  let uiKey = '';
  const clock = s => { const t = Math.max(0, s - T_LAUNCH), m = Math.floor(t / 60), ss_ = Math.floor(t % 60); return `T+${String(m).padStart(2, '0')}:${String(ss_).padStart(2, '0')}`; };
  const rateTxt = T => { const r = rateOf(T); return r < 1.15 ? '×1' : r < 3 ? '×' + r.toFixed(1) : '×' + Math.round(r); };
  function readout(T, D, info) {
    let txt = '', sub = '', bar = 0;
    const rate = `<span class="rate">${rateTxt(T)}</span>`, agl = Math.max(0, D.p[1] - W.yAt(D.p[0], D.p[2]));
    const uu = unwrapT(T);
    if (T < T_LAUNCH || T > 161.5) { txt = `Engine <b>${Math.round(REV(uu) * 60)}</b> rpm · rail <b>${W.railLen.toFixed(1)} m</b> · ${rate}`; sub = 'UAV · Orlan-10 · pneumatic catapult'; bar = sat(REV(uu) / 116); }
    else if (T < T_LIDAR) { txt = `Climb <b>${Math.round(agl)}</b> m AGL · <b>${Math.round(D.v * 3.6)}</b> km/h · ${rate}`; sub = clock(D.s); bar = sat((T - T_LAUNCH) / 7); }
    else if (T < T_PING + 1) { const p = sat((T - T_LIDAR) / (T_LIDAR_OFF - T_LIDAR)); txt = `Survey <b>${Math.round(p * 100)} %</b> · <b>${(info.km2 || 0).toFixed(1)}</b> km² · <b>${((info.pts || 0) / 1e6).toFixed(1)} M</b> pts · ${rate}`; sub = `${clock(D.s)} · ${Math.round(agl)} m AGL · relief ×${W.VE}`; bar = p; }
    else if (T < 59) { txt = `Ping · 360° · <b>${Math.round(Math.min(64, (T - T_PING) * W.PSPD / 1000))}</b> km · ${rate}`; sub = `${clock(D.s)} · turning seaward`; bar = sat((T - T_PING) / 5); }
    else if (T < 90) { txt = `Radar · sweep <b>${Math.floor(D.s / (RAD.P / 2)) % 1000}</b> · <b>${info.fa || 0}</b> rejected · <b>${info.trk ? 1 : 0}</b> track · ${rate}`; sub = `${clock(D.s)} · sector ±50° · ${(RAD.rMax / 1000).toFixed(1)} km`; bar = sat((T - 59) / 30); }
    else if (T < 117) { txt = `TRK 01 · <b>${(info.range / 1000).toFixed(1)}</b> km · σ <b>${info.sig.toFixed(1)}</b> m · <b>${info.nEv}</b> returns · ${rate}`; sub = `${clock(D.s)} · standoff orbit ${W.R_ORB / 1000} km`; bar = sat(info.nEv / NPULSE); }
    else if (T < 141) { txt = `Returns <b>${Math.round(info.ret * 100)} %</b> · rain <b>${Math.round(info.rain)}</b> mm/h · ${rate}`; sub = `${clock(D.s)} · RTB · ${(Math.hypot(D.p[0] - W.CAT.x, D.p[2] - W.CAT.z) / 1000).toFixed(1)} km`; bar = info.ret; }
    else { txt = D.inf > .05 ? `Chute · <b>${Math.round(agl)}</b> m · <b>${Math.max(0, -info.vy).toFixed(1)}</b> m/s · ${rate}` : `Recovery · <b>${Math.round(agl)}</b> m AGL · ${rate}`; sub = T > T_TOUCH ? `down · ${clock(W.EV.touch)} sortie · airbag` : clock(D.s); bar = sat((T - 141) / (T_TOUCH - 141)); }
    const key = txt + sub + Math.round(bar * 44);
    if (key !== uiKey) { uiKey = key; rtxt.innerHTML = txt; rsub.textContent = sub; rbar.style.width = (Math.round(bar * 44) * 6) + 'px'; }
  }
  const KICKS = [[0, 'Orlan-10 / Catapult launch'], [15, 'LiDAR survey / Krasnaya Kosa coast'], [52.5, 'Radar · 360° ping / Coast'], [58.5, 'Maritime radar / Sea search'], [88, 'Contact / Standoff orbit'], [116.5, 'Rain squall / Return to base'], [141, 'Recovery / Parachute · airbag'], [161.5, 'Orlan-10 / Catapult launch']];

  /* ---------- render ---------- */
  let lastKick = '', flash = 0;
  const info = {};
  const PROF = {}; let pt0 = 0;
  const tick = k => { const n = performance.now(); PROF[k] = +((PROF[k] || 0) * .9 + (n - pt0) * .1).toFixed(2); pt0 = n; };
  function render(T) {
    pt0 = performance.now();
    const D = heroAt(T), u = unwrapT(T);
    const sh = cameraAt(T, D);
    cam.eye = sh.eye; cam.target = sh.target; cam.fov = sh.fov * DEG; cam.roll = sh.roll;
    // launch jolt + a little buffeting in the rain
    const jolt = T > T_LAUNCH && T < T_LAUNCH + 1.2 ? (1 - (T - T_LAUNCH) / 1.2) * 5 : 0, rainB = ss(121, 124, T) * (1 - ss(133, 136, T)) * 2.2;
    cam.shake = FILM.shake(T, jolt + rainB, 16);
    cam.cx = 960 - 110; cam.cy = 540; cam.update();
    sync(cam, pb);
    pb.clear(); flash = 0;
    const dip = Math.sqrt(2 * Math.max(1, cam.eye[1]) / 6.371e6);
    const DBG = window.__dbg || {};
    if (!DBG.sky) drawSky(dip, 1);
    if (!DBG.chart) drawChart(T);
    const seaNear = cam.eye[1] < 2000 ? 1 : 0;
    if (seaNear && !DBG.sea && radarOn(T) < .5) drawSeaNear(T, 1900, 52, .32);
    terrainK = 1 - .5 * ss(121, 124, T) * (1 - ss(131, 134, T));
    tick('pre');
    const pts = drawTerrain(T);
    tick('terrain');
    const tags = [];
    // battery area
    const nearBase = Math.hypot(cam.eye[0] - W.CAT.x, cam.eye[2] - W.CAT.z) < 1800;
    if (nearBase) { drawGround(T, 1); drawBattery(T, D); }
    tick('base');
    if (!DBG.pz) drawPantsir(T, tags);
    if (!DBG.strike && T > T_STRIKE - .2 && T < T_STRIKE + 10) { drawStrikeFx(T); strikeBoxes(T, tags); }
    // LiDAR scan line + fan
    if (!DBG.scan && T > T_LIDAR && T < T_LIDAR_OFF + .5) drawScan(W.SW1, T, D, ss(T_LIDAR, T_LIDAR + .6, T) * (1 - ss(T_LIDAR_OFF - .5, T_LIDAR_OFF + .4, T)));
    if (T > T_LIDAR2 && T < T_LIDAR2_OFF + .5) drawScan(W.SW2, T, D, ss(T_LIDAR2, T_LIDAR2 + .6, T) * (1 - ss(T_LIDAR2_OFF - .5, T_LIDAR2_OFF + .4, T)) * (1 - .6 * ss(121, 123, T) * (1 - ss(131, 134, T))));
    drawPingRing(T);
    tick('scan');
    // radar
    const rk = radarOn(T), rainK = 1;
    info.fa = 0; info.trk = false;
    if (rk > 0) {
      drawRadar(T, D, rk, rainK);
      const sr = drawShipReturn(T, D, rk);
      info.fa = radarFA.length;
      if (sr && T > 74) info.trk = true;
      // false alarms: the tracker drops them
      radarFA.sort((a, b) => a[3] - b[3]);
      for (let q = 0; q < Math.min(2, radarFA.length); q++) { const fa = radarFA[q]; if (fa[3] > .9) continue; if (!P3(fa[0], fa[1] + 20, fa[2])) continue; if (PX > 1300) continue; tags.push({ key: 'fa' + q, cls: 'drop sm', a: 'CFAR', b: 'rejected · sea spike', x: PX + 10, y: PY - 24, al: rk * (1 - sat((fa[3] - .5) / .4)), pri: 0, lead: [PX, PY] }); }
      if (sr && sr.inRange > .3 && T < 90) {
        const c = W.SHIP.at(D.s);
        if (P3(c[0], 60, c[1])) { const n = Math.max(0, Math.floor((T - 71) / (RAD.P / 2 / Math.max(1, rateOf(T))))); const p = Math.min(.97, 1 - Math.pow(.72, n + 1)); tags.push({ key: 'trk', cls: p > .8 ? 'lime' : 'sm', a: 'TRK 01', b: p > .8 ? 'surface · confirmed' : 'tentative', v: 'p ' + p.toFixed(2), x: PX + 14, y: PY - 34, al: rk, pri: 3, lead: [PX, PY] }); }
      }
      // the squall in the swath: a clutter patch that never becomes a track
      if (T < 90) { const q = W.SQ.at(D.s); if (P3(q[0], 40, q[1]) && PX < 1300 && PX > 0 && PY > 0 && PY < 1080) tags.push({ key: 'rain', cls: 'drop sm', a: 'RAIN', b: 'clutter · no track', x: PX, y: PY - 40, al: rk * .9, pri: 0 }); }
    }
    tick('radar');
    // contact
    let cl = null;
    if (T > 86 && T < 120) {
      const k = ss(86, 89, T) * (1 - ss(117, 120, T));
      const res = sat((T - (T_C0 + 10.5)) / 1.5);
      drawShipSea(T, D.s, k);
      if (res < 1) cl = drawCloud(T, D, k * (1 - res));
      if (res > 0) drawShip(T, D, k * res, false);
      else drawWake(T, shipXf(D.s), k * .5, D.s);
      info.sig = cl ? cl.sig : sigOf(NPULSE); info.nEv = cl ? cl.nEv : NPULSE;
      const c = W.SHIP.at(D.s); info.range = Math.hypot(c[0] - D.p[0], c[1] - D.p[2]);
    }
    // from the squall on the chase camera faces away from the ship: only the EO inset sees the column
    const hitP = DBG.hit || T > 118.5 ? null : drawStrike(T, D.s, 1);
    if (T > T_HIT && T < T_HIT + 1) flash = Math.max(flash, 9 * Math.exp(-(T - T_HIT) * 7));
    tick('contact');
    // squall
    const sq = W.SQ.at(D.s), sqd = Math.hypot(D.p[0] - sq[0], D.p[2] - sq[1]);
    if (T > 60 && T < 146) drawRainFar(T, D.s, .9 * (T < 116 ? 1 : 1 - .6 * ss(121, 124, T) * (1 - ss(130, 134, T))));
    const inRain = T > 116 && T < 146 ? sat((W.SQ.r * 1.05 - sqd) / 500) : 0;
    if (inRain > 0) { drawRainNear(T, D, inRain); if (T > T_LIDAR2 - 20) drawRainLidar(T, D, inRain); }
    info.ret = 1 - .59 * inRain; info.rain = inRain * 38;
    tick('mid');
    // drones
    if (railLoaded(T) && !(T < T_LAUNCH)) drawDrone(railDrone(T));
    if (T < T_LAUNCH) drawDrone(railDrone(T));
    else if (!DBG.drone) drawDrone(D);
    if (landedPrev(T)) drawDrone(prevDrone());
    tick('drones');
    pb.blit();
    tick('blit');

    // overlay
    octx.clearRect(0, 0, 1920, 1080);
    // full-frame flash (strike, ping): a translucent wash on the overlay instead of touching every pixel
    if (flash > 0) { octx.fillStyle = `rgba(255,255,255,${(flash / 255).toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
    if (!FILM.uiHidden) {
      const lg = octx.createLinearGradient(1920, 0, 1180, 0); lg.addColorStop(0, 'rgba(11,12,10,.82)'); lg.addColorStop(.5, 'rgba(11,12,10,.46)'); lg.addColorStop(1, 'rgba(11,12,10,0)');
      octx.fillStyle = lg; octx.fillRect(1180, 0, 740, 1080);
    }
    // contact: identification + EO tracker
    let showInset = false, showBars = false;
    if (T > 88 && T < 118.5) {
      const k = ss(88, 90, T) * (1 - ss(117, 118.5, T));
      const Tm = shipXf(D.s);
      const ev = cl ? 1 - Math.exp(-cl.nEv / 4.2) : 1, probs = probsAt(T < T_C0 ? 0 : ev);
      const best = [1, 2, 3].reduce((a, c) => probs[c] > probs[a] ? c : a, 1), pbest = probs[best];
      const idd = pbest > .75 && T > T_C0 + 10;
      let anc = null;
      if (cl && !idd) { const r = cl.sig * 2; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (P3(cl.cen[0] + cl.crs[0] * r * dx + cl.los[0] * r * .4 * dz, 30 + cl.sig * .8, cl.cen[2] + cl.crs[2] * r * dx + cl.los[2] * r * .4 * dz) && (!anc || PX - PY * .3 > anc[0] - anc[1] * .3)) anc = [PX, PY]; }
      const b2 = shipBounds2D(Tm, CLOUD.mn, CLOUD.mx);
      if (idd && b2) { bracket(octx, b2, '#C6F432', k, 5, 10); anc = [b2[2] + 5, b2[1] - 5]; }
      if (anc) {
        const label = pbest < .3 ? 'Unknown' : pbest < .75 ? NAMES[best] + '?' : 'DDG · Arleigh Burke';
        tags.push({ key: 'ship', cls: idd ? 'lime' : '', a: 'TRK 01', b: label, v: pbest.toFixed(2), x: anc[0] + 60, y: anc[1] - 140, al: k, pri: 4, lead: anc });
        barsEl.style.transform = `translate(${Math.min(1380 - 230, anc[0] + 60).toFixed(0)}px, ${Math.max(150, anc[1] - 112).toFixed(0)}px)`;
        showBars = T > T_C0 - 1 && T < 110;
        for (let c = 0; c < 4; c++) { BI[c].style.width = (probs[c] * 100).toFixed(1) + '%'; BV[c].textContent = probs[c].toFixed(2); const on = c === best && c > 0; for (const el of BL[c]) el.classList.toggle('top', on); }
      }
    }
    // the strike in the main view: flash, glow, the Hit chip
    strikeGlow(octx, hitP, T, 1);
    if (hitP && T > T_HIT + .15 && hitP[0] < 1300) {
      const al = sat((T - T_HIT - .15) / .25) * (1 - ss(115.4, 116.4, T)) * (1 - ss(1120, 1300, hitP[0]));
      if (al > 0) tags.push({ key: 'hit', cls: 'warn', a: 'Hit', b: 'DDG', x: hitP[0] + 110, y: hitP[1] + 74, al, pri: 5, lead: [hitP[0] + 4, hitP[1] + 4] });
    }
    // EO: the ball slews onto the ship; the NFOV inset shows its detail, the strike, then the column over the tail
    if (T > 102.8 && T < (DBG.hit ? 118 : T_EO_OFF)) {
      showInset = true;
      const Tm = shipXf(D.s);
      const gw = X.ap(X.make(D.M, D.p), GIM_C), c = W.SHIP.at(D.s);
      cam2.eye = gw; cam2.target = eoAim(T, D.s, true); cam2.fov = 2 * Math.atan(eoExt(T) / Math.max(1000, V.dist(gw, cam2.target))); cam2.update();
      // over the tail in the squall the ship is small: coarser sea grid and hull cloud keep the frame in budget
      const rng_ = V.dist(gw, cam2.target), dim = 1 - .45 * inRain, far = T > 117;
      sync(cam2, pb2); pb2.clear();
      drawShipSea(T, D.s, dim * (far ? 1.35 : 1), far ? 2 : 1);
      drawShip(T, D, dim, !far, rng_ > 6500 ? 2 : 1);
      const hi = DBG.hit ? null : drawStrike(T, D.s, dim);
      if (inRain > 0) drawInsetRain(T, inRain);
      pb2.blit();
      const ictx = pb2.ctx;
      strikeGlow(ictx, hi, T, .7);
      const bb = shipBounds2D(Tm, CLOUD.mn, CLOUD.mx);
      if (bb) bracket(ictx, bb, '#C6F432', 1, 4, 10);
      // part boxes on true bounds: SPS, helo, gun (until the hit)
      const pa = .75 * (1 - sat((T - T_HIT - .1) / .4));
      if (pa > 0) {
        const st = { sps: D.s * TAU / 4 };
        const pbx = (name, lab) => { const sp = W.ddFine.find(q => q.name === name); if (!sp) return; const b = PARTB[name], Tp = partX(Tm, sp.part, st), r2 = shipBounds2D(Tp, b[0], b[1]); if (r2) { ictx.strokeStyle = '#fff'; ictx.globalAlpha = pa; ictx.setLineDash([2, 3]); ictx.strokeRect(r2[0] - 2, r2[1] - 2, r2[2] - r2[0] + 4, r2[3] - r2[1] + 4); ictx.setLineDash([]); ictx.globalAlpha = pa / .75; ictx.font = '500 10px "Geist Mono", monospace'; ictx.fillStyle = '#C6F432'; ictx.fillText(lab, r2[0], r2[1] - 6); ictx.globalAlpha = 1; } };
        pbx('sps', 'SPS-67 · TURNING'); pbx('gun', 'MK 45 5"');
        { const hw = X.mul(Tm, HELOW), hb = shipBounds2D(hw, HELOB[0], HELOB[1]); if (hb) { ictx.strokeStyle = '#fff'; ictx.globalAlpha = pa; ictx.setLineDash([2, 3]); ictx.strokeRect(hb[0] - 2, hb[1] - 2, hb[2] - hb[0] + 4, hb[3] - hb[1] + 4); ictx.setLineDash([]); ictx.globalAlpha = pa / .75; ictx.fillStyle = '#C6F432'; ictx.fillText('MH-60R · ON DECK', hb[0], hb[3] + 14); ictx.globalAlpha = 1; } }
      }
      sync(cam, pb);
      const fovD = cam2.fov / DEG;
      insl.textContent = `EO · ${fovD > 4 ? 'WFOV' : 'NFOV'} ${fovD.toFixed(2)}° · TRK 01${T > T_HIT + .3 ? ' · HIT' : ''}`;
      insr.textContent = `${(rng_ / 1000).toFixed(2)} km · ${Math.round(W.SHIP.v * 1.944)} kn`;
      // lag line: gimbal on screen to the ship in the main view
      if (P3v(gw)) { const gx = PX, gy = PY; if (P3(c[0], 20, c[1])) { octx.strokeStyle = '#C6F432'; octx.globalAlpha = .5; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(gx, gy); octx.lineTo(PX, PY); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; } }
    }
    tick('eo');
    insetEl.classList.toggle('off', !showInset);
    barsEl.classList.toggle('off', !showBars);
    // landmarks along the survey: tagged as the scan line passes
    for (const mk of W.MARKS) {
      const i = lineAt(W.SW1, T); if (T < T_LIDAR || T > 56) break;
      const lt = revealAt(M1, mk.x, mk.z); if (lt > 1e8) continue;
      const age = T - lt; if (age < 0 || age > 9) continue;
      const y = W.yAt(mk.x, mk.z);
      if (!P3(mk.x, y + 4, mk.z) || PX > 1320) continue;
      tags.push({ key: 'mk' + mk.x, cls: 'sm', a: 'RVN', b: 'ravine · ' + mk.depth + ' m deep', x: PX + 10, y: PY - 40, al: sat(age / .4) * (1 - sat((age - 7.5) / 1)), pri: 0, lead: [PX, PY] });
    }
    // ping: the far positions it reaches
    if (T > T_PING && T < T_PING + 16) {
      const far = [['pb', 'OBJ 01', 'Battery · Krasnaya Kosa', [W.BASE[0], W.BASE[1]]], ['pr', 'OBJ 04', 'Radar · Monolith-B', [W.RADAR[0], W.RADAR[1]]]];
      for (const [key, a, b, p] of far) {
        const d = Math.hypot(p[0] - W.pingAt[0], p[1] - W.pingAt[2]), age = T - T_PING - d / W.PSPD; if (age < 0) continue;
        const y = W.yAt(p[0], p[1]); if (!P3(p[0], y, p[1])) continue;
        const al = sat(age / .3) * (1 - sat((age - 6) / 1));
        const gx = PX, gy = PY, stem = 70 * E.outCubic(sat(age / .45));
        for (let yy = 4; yy < stem; yy += 3) dset(gx, gy - yy, 1, LIME, al);
        tags.push({ key, cls: 'lime', a, b, v: (d / 1000).toFixed(0) + ' km', x: gx, y: gy - stem - 22, al, pri: 2 });
      }
    }
    // approach: the recovery point and the next airframe waiting on the rail
    if (T > 137.5 && T < 145.5) {
      const al = sat((T - 137.5) / .6) * (1 - sat((T - 144.8) / .7)), on = () => PX > 0 && PX < 1320 && PY > 0 && PY < 1080;
      if (P3(LZP[0], LZP[1] + 1, LZP[2]) && on()) tags.push({ key: 'lz', cls: 'lime sm', a: 'LZ', b: 'airbag recovery', v: Math.round(Math.hypot(D.p[0] - LZP[0], D.p[2] - LZP[2])) + ' m', x: PX + 12, y: PY - 46, al, pri: 2, lead: [PX, PY] });
      const rp = W.railW(0);
      if (P3(rp[0], rp[1] + 1.5, rp[2]) && on()) tags.push({ key: 'rail2', cls: 'sm', a: 'OBJ 05', b: 'Rail · next airframe', x: PX + 12, y: PY - 46, al, pri: 1, lead: [PX, PY] });
    }
    if (!DBG.tags) putTags(tags);
    // readouts
    // swept area: scan lines every 6 m along track, mean swath ~1.2 km; a light UAV LiDAR at 300 m AGL lands ~4 returns per m²
    info.km2 = (() => { const i = lineAt(W.SW1, T); const n = i < 0 ? (T > T_LIDAR_OFF ? W.SW1.nl : 0) : i; return n * 6 * 1200 / 1e6; })();
    info.pts = info.km2 * 4e6;
    info.vy = T > T_CHUTE ? (W.routeAt(simOf(T) + .1, RS3).p[1] - D.p[1]) / .1 : 0;
    readout(T, D, info);
    let kk = KICKS[0][1]; for (const [t, k] of KICKS) if (T >= t) kk = k;
    if (kk !== lastKick) { lastKick = kk; kickEl.textContent = kk; }
    tick('ui');
    STAGE.dbg = { T: +T.toFixed(2), s: +D.s.toFixed(1), rate: +rateOf(T).toFixed(2), p: D.p.map(v => Math.round(v)), pts, prof: PROF };
  }

  /* ---------- sound ---------- */
  const cues = [];
  const cue = (t, fn) => cues.push([t, fn]);
  cue(163.4, () => { SFX.tone(180, 420, 1.3, 'sawtooth', .02); SFX.noise(1.2, 900, .7, .03, .2); });
  cue(.2, () => { SFX.noise(.25, 300, 1, .08, .005); SFX.tone(70, 110, 1.4, 'sawtooth', .035); });
  cue(1.2, () => SFX.tone(95, 95, 3.8, 'sawtooth', .018));
  cue(2.2, () => SFX.tone(1400, 1400, .02, 'square', .01));
  cue(5.3, () => SFX.tone(95, 235, 2.4, 'sawtooth', .03));
  cue(7.6, () => SFX.tone(235, 235, 1.2, 'sawtooth', .02));
  cue(T_LAUNCH, () => { SFX.noise(.5, 2600, .5, .14, .003); SFX.noise(1.4, 240, 1, .18, .01); SFX.tone(420, 180, .12, 'square', .03, .38); });
  cue(T_STRIKE + .3, () => SFX.crack());
  cue(T_LIDAR, () => { SFX.tone(1900, 1900, .05, 'square', .012); SFX.tone(2400, 2400, .05, 'square', .01, .08); });
  cue(19.8, () => SFX.tone(1500, 1500, .03, 'square', .012));
  for (const mk of W.MARKS) { const t = revealAt(M1, mk.x, mk.z); if (t < 1e8) cue(t, () => SFX.tone(1500, 1500, .018, 'square', .012)); }
  cue(T_PING, () => { SFX.tone(160, 90, 1.4, 'sine', .09); SFX.tone(1900, 1900, .05, 'square', .012); SFX.noise(1.2, 260, .8, .05, .02); });
  cue(58.6, () => SFX.tone(2100, 2100, .03, 'square', .012));
  for (let t = 60; t < 90; t += 1.3) cue(t, () => SFX.tone(2100, 2100, .012, 'square', .007));
  cue(80, () => SFX.tone(1250, 1250, .05, 'square', .012));
  for (let k = 0; k < NPULSE; k++) cue(pulseT(k), () => SFX.tone(1650, 1650, .012, 'square', .007));
  cue(T_C0 + 11, () => { SFX.tone(990, 990, .07, 'square', .016); SFX.tone(1480, 1480, .1, 'square', .014, .08); });
  cue(103, () => { SFX.tone(700, 1400, .18, 'sine', .03); });
  cue(T_FIRE0, () => { SFX.noise(T_FIRE1 - T_FIRE0, 2600, .8, .035, .02); SFX.noise(T_FIRE1 - T_FIRE0, 380, .7, .03, .02); });
  cue(T_HIT, () => { SFX.noise(.35, 3200, .5, .08, .002); SFX.tone(110, 38, 1.6, 'sine', .09); SFX.noise(2.8, 200, .8, .1, .01); });
  cue(118.3, () => SFX.tone(2100, 2100, .03, 'square', .012));
  cue(120.5, () => SFX.noise(9, 1400, .5, .045, 2.5));
  cue(124, () => SFX.noise(6, 700, .6, .05, 1.5));
  cue(T_CHUTE, () => { SFX.noise(.18, 3000, .6, .1, .002); SFX.tone(220, 70, .5, 'sine', .06); SFX.noise(2.5, 500, .7, .05, .2); });
  cue(T_CHUTE + 2.6, () => SFX.noise(1.6, 1800, .5, .05, .1));
  cue(T_TOUCH, () => { SFX.noise(.35, 180, 1, .2, .005); SFX.tone(90, 50, .3, 'sine', .08); });

  FILM.run({
    duration: DUR,
    chapters: [
      { t: 0, title: 'Catapult' }, { t: 15, title: 'Coastline' }, { t: 52.5, title: 'Ping' }, { t: 58.5, title: 'Over water' },
      { t: 88, title: 'Contact' }, { t: 116.5, title: 'Squall' }, { t: 141, title: 'Home' },
    ],
    cues,
    render,
  });
  STAGE.W = W;
  STAGE.PB = { probe, STRIKE: () => STRIKE, TSTAT, cam, cam2, heroAt, railDrone, cameraAt, simOf, rateOf, EV, T_CHUTE, T_TOUCH, RAD, lastPaint, MSL, mslAt, mslArc, hitW, eoAim, T_HIT };
})();
