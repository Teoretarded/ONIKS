/* GUN CAMERA: the combat effects, drawn into the synced dot world after the rounds (pf_gun_camera_film.js calls the
   hooks every frame):

   PF.tracerFx(T, ctx)   20 mm tracer, every round a dot (75 a second at 1100 m/s, linear drag, gravity), flown
                         analytically from its firing time; motion streaks a shutter long; splashes where rounds reach
                         the sea; muzzle flash and gun smoke on the mounts (not on the forward one while the eye sits
                         at its own FLIR window); barrel heat after a burst.
   PF.burstFx(T, ctx)    rounds 1-5: strikes flickering on the body in the last half second, then a dot fireball
                         (lobes popping out, white-hot, cooling through a warm skin to grey smoke), fingers of fire,
                         sparks, fragments with burning brands, splashes where they land; the sea-skimmer's burst also
                         lifts a column of water and a surge ring.
   PF.hitFx(T, ctx)      TRK 06 into the hangar's port wall: a flash, a fireball rolling out of the wall, a jet up
                         through the hangar roof, fragments into the sea and onto the deck edge, the hole going dark
                         with a burning rim, fires, a smoke column carried aft. All gone by ~154.6.
   PF.overlayFx(...)     the flicker of the gun's own muzzle in the sight, bloom on bursts and the hit, tags.
   PF.shakeFx(T)         the mount's vibration while it fires, the blast waves arriving.
   PF.fxCues             sound, fired by the film's cue list.

   Spectacle only: each stream is aimed at where its round will be, with a walk-on and dispersion, not a fire-control
   model. Everything is a pure function of T (tables built once at load, particles analytic in their age). */
(function () {
  'use strict';
  const PF = window.PF, DW = PF.DW;
  const { V, R, X, E, rng } = M3;
  const { TAU, WH, hsh, gH } = PF;
  const ss = E.ss, sat = E.sat, G2 = 4.905;
  const q = DW.q, P3 = DW.P3, put = DW.put, glow = DW.glow, dset = DW.dset;
  const GN = 8192, GM = GN - 1, GT = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GT[i] = gH(i, 6131);
  /* the air and the water past the ship (the frame steams at VS through both; a light breeze off the starboard bow,
     so smoke off the port side leans out over the water) */
  const WIND = [-1.2, 0, -1.4];
  const VA = [WIND[0], 0, WIND[2] - PF.VS], VW = [0, 0, -PF.VS];
  const GREY = [208, 212, 202], HOT = [255, 250, 238], WARM = [255, 150, 98], FIRE = [255, 190, 130], SMW = [232, 212, 194], AMB = [255, 200, 138], HAMB = [255, 168, 96];
  const LK = DW.LK;
  let FLc = 1000, CAM = null;
  const frame = ctx => { CAM = ctx.cam; FLc = ctx.cam.fl; };
  const Q0 = { x: 0, y: 0, z: 0 };
  /* a world segment as a streak of dots: head bright, tail fading; spacing from its length on screen */
  function streak(x, y, z, xb, yb, zb, nMax, sz, c0, c1, al) {
    let n = 8;
    const hv = P3(x, y, z); Q0.x = q.x; Q0.y = q.y; Q0.z = q.z;
    if (P3(xb, yb, zb)) { if (hv) n = Math.min(nMax, Math.max(1, Math.ceil(Math.hypot(q.x - Q0.x, q.y - Q0.y) / 2.4))); }
    else if (!hv) return false;
    for (let m = 0; m <= n; m++) {
      const u = m / n;
      if (!P3(x + (xb - x) * u, y + (yb - y) * u, z + (zb - z) * u)) continue;
      put(q.x, q.y, u < .4 ? sz : 1, c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u, al * (1 - .75 * u));
    }
    return hv;
  }

  /* ---------- tracer ---------- */
  const CW = { rate: 75, v0: 1100, kd: .3, life: 3.4 };
  /* the long lens magnifies the drop of a round into an arc half the frame high at 1.5 km: the streams fly a
     flattened drop so they read as reaching for the round */
  const GT2 = G2 * .6;
  const TRL = CW.v0 / CW.kd, SHUT = 1 / 40;
  const tof = r => { const x = CW.kd * r / CW.v0; return x < .95 ? -Math.log(1 - x) / CW.kd : 10; };
  const RQ = { p: [0, 0, 0], dir: [0, 0, 1] };
  /* every round of every burst: [tk, muzzle xyz, dir xyz, end age, wet, rn, mount, window, time of flight to the round] */
  const SB = 13;
  const TB = (() => {
    const out = [];
    PF.FIRE.forEach((w, wi) => {
      const rd = PF.ROUNDS[w.k], miss = !!rd.hit;
      for (let j = 0; ; j++) {
        const tk = w.t0 + j / CW.rate; if (tk >= w.t1) break;
        const M = PF.muzzle(tk, w.mount).p;
        // lead: aim where the round will be when the shot gets there (time of flight = time to go, by bisection:
        // a closing target makes the plain fixed-point iteration oscillate), gravity drop held off
        const gAt = t => { PF.round(w.k, tk + t - (miss ? .035 : 0), RQ); return [RQ.p[0] - M[0], RQ.p[1] - M[1] + GT2 * t * t, RQ.p[2] - M[2]]; };
        let lo = 0, hi = 4;
        for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (tof(V.len(gAt(m))) > m) lo = m; else hi = m; }
        const tI = (lo + hi) / 2, g = gAt(tI);
        const A = V.norm(g), u = V.norm(V.cross(A, [0, 1, 0])), vv = V.cross(u, A), id = wi * 4096 + j, el = tk - w.t0;
        // the stream walks onto the round from short, then hunts about it (more after the weaver)
        const walk = miss ? 0 : .0035 * Math.exp(-el / .3), hunt = rd.weave ? .001 : .00035;
        let ex = gH(id, 41) * .0005 + hunt * M3.noise(tk * 1.7, 3.3 + wi), ey = gH(id, 43) * .0005 + hunt * M3.noise(tk * 1.9, 8.1 + wi) - walk;
        // the aft gun never quite catches TRK 06: the stream trails it, a little wide and high
        if (miss) { ex += .0042 + .0016 * M3.noise(tk * 2.3, 4.4); ey += .0024; }
        const Dd = V.norm([A[0] + u[0] * ex + vv[0] * ey, A[1] + u[1] * ex + vv[1] * ey, A[2] + u[2] * ex + vv[2] * ey]);
        const yAt = a => M[1] + Dd[1] * TRL * (1 - Math.exp(-CW.kd * a)) - GT2 * a * a;
        let aw = CW.life, wet = 0;
        if (yAt(CW.life) < 0) { let lo = 0, hi = CW.life; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > 0) lo = m; else hi = m; } aw = lo; wet = 1; }
        out.push(tk, M[0], M[1], M[2], Dd[0], Dd[1], Dd[2], aw, wet, hsh(id, 5), w.mount, wi, tI + (miss ? .9 : 0));
      }
    });
    return new Float64Array(out);
  })();
  const NB = TB.length / SB;
  PF.TRACERS = { n: NB, tb: TB, sb: SB };
  const firstAt = t => { let lo = 0, hi = NB; while (lo < hi) { const m = (lo + hi) >> 1; if (TB[m * SB] < t) lo = m + 1; else hi = m; } return lo; };
  const TR_H = [255, 244, 222], TR_T = [255, 150, 96];
  function drawTracers(T) {
    const big = FLc > 5000, i0 = firstAt(T - CW.life - 1);
    for (let i = i0; i < NB; i++) {
      const o = i * SB, a = T - TB[o]; if (a < 0) break;
      const aw = TB[o + 7], wet = TB[o + 8], Mx = TB[o + 1], My = TB[o + 2], Mz = TB[o + 3], Dx = TB[o + 4], Dy = TB[o + 5], Dz = TB[o + 6], rn = TB[o + 9];
      if (a < aw) {
        // the tracer burns out a little past the round it was fired at, so the stream ends in it; the round flies
        // on dark (falling away below the line, which the long lens would show as a drip under the target)
        const burn = TB[o + 12] + .04 + .14 * rn; if (a > burn + .2) continue;
        const h = TRL * (1 - Math.exp(-CW.kd * a)), x = Mx + Dx * h, y = My + Dy * h - GT2 * a * a, z = Mz + Dz * h;
        const al = (1 - ss(burn, burn + .2, a)) * (.84 + .16 * rn);
        // the streak: where the round was a shutter ago
        const ab = a > SHUT ? a - SHUT : 0, hb = TRL * (1 - Math.exp(-CW.kd * ab));
        if (streak(x, y, z, Mx + Dx * hb, My + Dy * hb - GT2 * ab * ab, Mz + Dz * hb, 70, 2, TR_H, TR_T, al * .85)) {
          // the head: a hot point with a little halo
          put(Q0.x, Q0.y, 2, 255, 250, 238, al);
          glow(Q0.x, Q0.y, big ? 4.5 : 4, 255, 196, 140, .32 * al);
        }
      } else if (wet && a < aw + .9) {
        // the splash: a little column of drops, left astern by the water
        const w = a - aw, h = TRL * (1 - Math.exp(-CW.kd * aw)), x = Mx + Dx * h + VW[0] * w, z = Mz + Dz * h + VW[2] * w;
        if (!P3(x, 1.2, z)) continue;
        const px = 3.4 * FLc / q.z, n = Math.min(26, Math.max(3, Math.round(px / 4))), al = .78 * (1 - w / .9), sz = px > 60 ? 2 : 1, sp = .22 + .55 * w;
        for (let m = 0; m < n; m++) {
          const vs = 2.2 + 6.2 * hsh(i, m + 3), yy = vs * w - G2 * w * w; if (yy < 0) continue;
          const g = (i * 7 + m * 3) & GM;
          if (P3(x + GT[g] * sp, yy, z + GT[(g + 1) & GM] * sp)) put(q.x, q.y, sz, WH[0], WH[1], WH[2], al * (.55 + .45 * hsh(i, m)));
        }
      }
    }
  }
  /* gun smoke: a puff off every other round, pushed out along the bore, then carried aft by the air */
  function drawGunSmoke(T, sight) {
    const i0 = firstAt(T - 3);
    for (let i = i0; i < NB; i++) {
      const o = i * SB, a = T - TB[o]; if (a < 0) break;
      if ((i & 1) || a > 3 || (sight && TB[o + 10] === 0)) continue;
      const push = 2.8 * (1 - Math.exp(-a * 5)), dr = a - .25 * (1 - Math.exp(-a / .25));
      const cx = TB[o + 1] + TB[o + 4] * push + VA[0] * dr, cy = TB[o + 2] + TB[o + 5] * push + .45 * a, cz = TB[o + 3] + TB[o + 6] * push + VA[2] * dr;
      const r = .16 + 1.05 * Math.sqrt(a), al = .36 * (1 - a / 3) * sat(a / .06);
      for (let m = 0; m < 3; m++) {
        const g = (i * 5 + m * 3) & GM;
        if (P3(cx + GT[g] * r, cy + GT[(g + 1) & GM] * r * .6, cz + GT[(g + 2) & GM] * r)) put(q.x, q.y, q.z < 25 ? 2 : 1, GREY[0], GREY[1], GREY[2], al * (.6 + .5 * hsh(i, m)));
      }
    }
  }
  /* barrel heat: builds with each burst, cools over ~10 s */
  function heatOf(T, mount) {
    let h = 0;
    // periodic: last loop's bursts still cooling at the start of this one
    for (const Tl of [T, T + PF.D]) for (const f of PF.FIRE) { if (f.mount !== mount || Tl < f.t0) continue; const e = Math.min(Tl, f.t1); h += (e - f.t0) * .55 * Math.exp(-(Tl - e) / 10); }
    return Math.min(1, h);
  }
  function drawMuzzle(T, i, sight) {
    const f = PF.firing(T, i), heat = heatOf(T, i);
    if (!f && heat < .04) return;
    if (i === 0 && sight) return;
    const mz = PF.muzzle(T, i), p = mz.p, d = mz.dir;
    if (heat > .04) {
      // the barrels' ends glow warm
      for (let m = 0; m < 4; m++) {
        const s = -m * .22;
        if (P3(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s)) glow(q.x, q.y, Math.min(70, 1.5 + .13 * FLc / q.z), 255, 118, 64, .3 * heat * (1 - m * .22));
      }
    }
    if (!f) return;
    const fr = Math.floor(T * CW.rate), fk = hsh(fr, 17 + i), fl = .55 + .45 * fk;
    if (P3(p[0] + d[0] * .2, p[1] + d[1] * .2, p[2] + d[2] * .2)) {
      const sx = q.x, sy = q.y, pxm = FLc / q.z;
      glow(sx, sy, Math.min(150, 3 + 1.6 * pxm * fl), 255, 190, 132, .5 * fl);
      glow(sx, sy, Math.min(46, 2 + .5 * pxm), 255, 250, 238, .95 * fl);
      put(sx, sy, Math.max(2, Math.min(6, Math.round(.22 * pxm))), 255, 252, 244, 1);
    }
    // the flash's tongue off the muzzle, a few petals round it
    for (let m = 1; m <= 12; m++) {
      const s = m * .08 * (.6 + .7 * fk), g = (m * 3 + fr * 5) & GM, sp = .025 * m;
      if (P3(p[0] + d[0] * s + GT[g] * sp, p[1] + d[1] * s + GT[(g + 1) & GM] * sp, p[2] + d[2] * s + GT[(g + 2) & GM] * sp)) put(q.x, q.y, q.z < 60 ? 2 : 1, 255, 236 - 6 * m, 200 - 9 * m, fl * (1 - m / 13));
    }
  }
  PF.tracerFx = function (T, ctx) {
    frame(ctx);
    const sight = ctx.sightK > 0;
    drawGunSmoke(T, sight);
    drawTracers(T);
    drawMuzzle(T, 0, sight); drawMuzzle(T, 1, sight);
  };

  /* ---------- fireballs ----------
     A cluster of lobes, each popping out a moment after the flash and cooling at its own rate (skins first), so the
     ball is patchy white, orange and grey rather than a noise sphere. While hot a dot is shaded by how squarely its
     lobe faces the lens (glowing gas is brightest through its middle), once smoke by the sun. Dots in random order:
     a frame draws a prefix sized to the fireball's area on screen. half: out of a wall only (local +x). */
  function mkFire(seed, n, NL, half) {
    const r = rng(seed), a = new Float32Array(n * 6), L = new Float32Array(NL * 7);
    // a core and a ring of billows standing out from it, so the silhouette is lumpy and each billow shades as a ball
    for (let l = 0; l < NL; l++) {
      const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = l ? .42 + .38 * r() : 0;
      let cx = s * Math.cos(th) * d;
      if (half) cx = Math.abs(cx) + .18;
      // [centre xyz, radius, cooling rate, delay (s), brightness]
      L.set([cx, u * d * .8, s * Math.sin(th) * d, l ? .24 + .24 * r() : .5, l ? .5 + .85 * r() : .4, l ? .06 * r() : 0, .62 + .5 * r()], l * 7);
    }
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u);
      a.set([s * Math.cos(th), u, s * Math.sin(th), Math.pow(r(), .3), r(), i % NL], i * 6);
    }
    return { n, a, L, half };
  }
  const FCv = [0, 0, 0];
  /* F template, centre c, M row-major local -> world, Rb (m), age a, G alpha, run: smear direction (with runK Rb), yMin;
     a half template stays outboard of a wall wallOff m behind the centre (local -x) */
  let WALL = 0, SX = 1, SY = 1, SZ = 1, AMc = null, DIV0 = 10;
  /* per-lobe values for this frame: growth, centre pull-in, and the heat at 16 depths into the lobe */
  const LG = new Float32Array(64), LC = new Float32Array(64), LH = new Float32Array(64 * 16);
  function drawFire(F, cx, cy, cz, M, Rb, a, G, run, runK, yMin, thin) {
    const am = AMc || AMB;
    FCv[0] = cx; FCv[1] = cy; FCv[2] = cz;
    const zc = CAM.depth(FCv); if (zc < -Rb || G <= .005) return 0;
    // fine dots even when the ball fills the lens: its form comes from the shading, never from fat squares;
    // dense while it burns, sparser once it is smoke (a thinning veil needs fewer dots)
    const Rpx = Rb * FLc / Math.max(1, zc), N = Math.min(F.n, a > .7 ? 11000 : F.n, Math.max(1600, Math.round(Math.PI * Rpx * Rpx / (DIV0 + 30 * ss(.3, 1.8, a)))));
    const bs = Rpx > 70 ? 2 : 1;
    const e = CAM.eye; let vx = e[0] - cx, vy = e[1] - cy, vz = e[2] - cz; const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
    const A = F.a, L = F.L, half = F.half, str = (1 - Math.exp(-a * 3)) * runK * Rb, lmin = -WALL / Rb, NL = L.length / 7;
    for (let l = 0; l < NL; l++) {
      const g = a - L[l * 7 + 5], gr = g > 0 ? 1 - Math.exp(-g * 7) : -1, k = a * L[l * 7 + 4];
      LG[l] = gr; LC[l] = .55 + .45 * gr;
      // each lobe cools as a whole (skins a little first): patches of fire and smoke, not a speckle
      for (let j = 0; j < 16; j++) LH[l * 16 + j] = Math.exp(-k * (.8 + .5 * j / 15));
    }
    const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
    const l0 = LK[0], l1 = LK[1], l2 = LK[2];
    for (let i = 0; i < N; i++) {
      const o = i * 6, rn = A[o + 4]; if (rn < thin) continue;
      const li_ = A[o + 5], gr = LG[li_]; if (gr < 0) continue;
      const lo = li_ * 7, ux = A[o], uy = A[o + 1], uz = A[o + 2], rr = A[o + 3], s = rr * L[lo + 3] * gr, cc = LC[li_];
      let lx = (L[lo] * cc + ux * s) * SX;
      const ly = (L[lo + 1] * cc + uy * s) * SY, lz = (L[lo + 2] * cc + uz * s) * SZ;
      if (half && lx < lmin) lx = lmin + (lmin - lx) * .5;
      // the smear along the momentum: most dots near the ball, a tail thinning ahead of it
      const sr = (rn * 3.7) % 1, rk = str * (sr * sr * 1.3 - .25);
      const y = cy + (m3 * lx + m4 * ly + m5 * lz) * Rb + run[1] * rk; if (y < yMin) continue;
      if (!P3(cx + (m0 * lx + m1 * ly + m2 * lz) * Rb + run[0] * rk, y, cz + (m6 * lx + m7 * ly + m8 * lz) * Rb + run[2] * rk)) continue;
      const nx = m0 * ux + m1 * uy + m2 * uz, ny = m3 * ux + m4 * uy + m5 * uz, nz = m6 * ux + m7 * uy + m8 * uz;
      const f = nx * vx + ny * vy + nz * vz, lb = L[lo + 6];
      const heat = LH[li_ * 16 + ((rr * 15.99) | 0)];
      let cr, cg, cb, b;
      if (heat > .5) {
        const u = (heat - .5) / .5, uu = u * (2 - u);
        cr = 255; cg = am[1] + (HOT[1] - am[1]) * uu; cb = am[2] + (HOT[2] - am[2]) * uu;
        b = lb * (.8 + .6 * u) * (f > 0 ? .3 + .7 * f : .24);
      } else {
        // smoke: lit by the sun, with a bright rim where the sun grazes it; shading, not noise, carries its form
        const lit = nx * l0 + ny * l1 + nz * l2, li = lit > 0 ? lit : 0, af = f < 0 ? -f : f, rim = li * (1 - af) * (1 - af);
        const sh = (f > -.25 ? 1 : .5) * (.28 + 1.1 * li + .6 * rim);
        if (heat > .16) {
          const u = (heat - .16) / .34;
          cr = GREY[0] + (SMW[0] - GREY[0]) * u; cg = GREY[1] + (SMW[1] - GREY[1]) * u; cb = GREY[2] + (SMW[2] - GREY[2]) * u;
          b = lb * (.42 + .3 * u) * sh;
        } else { cr = GREY[0]; cg = GREY[1]; cb = GREY[2]; b = lb * (.4 + .06 * heat / .16) * sh; }
      }
      b *= G * (.8 + .35 * rn);
      put(q.x, q.y, heat > .5 || rn > .55 ? bs : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
    return Rpx;
  }

  /* ---------- bursts ---------- */
  const FBT = mkFire(7301, 20000, 15, false);
  const NF = 22;
  const BU = [0, 1, 2, 3, 4].map(k => {
    const rd = PF.ROUNDS[k], t0 = rd.tStop, RO = PF.round(k, t0 - 1e-3), p = rd.pStop.slice(), dir = RO.dir.slice(), low = !!rd.low;
    const rr = rng(8100 + k * 31), n = low ? 300 : 250;
    const F = new Float32Array(n * 6), AW = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // the heavy pieces keep some of the round's momentum; the burning brands are thrown out and up
      const brand = i % 5 === 0, f = brand ? .04 + .12 * rr() : .06 + .34 * rr(), sp = (brand ? 60 : 25) + 190 * Math.pow(rr(), 1.4);
      const u = brand ? .15 + .85 * rr() : rr() * 2 - 1, th = rr() * TAU, c = Math.sqrt(1 - u * u);
      const vx = dir[0] * 680 * f + c * Math.cos(th) * sp, vy = dir[1] * 680 * f + u * sp * .6 + 10, vz = dir[2] * 680 * f + c * Math.sin(th) * sp;
      const kd = 1.2 + 2.6 * rr();
      F[i * 6] = vx; F[i * 6 + 1] = vy; F[i * 6 + 2] = vz; F[i * 6 + 3] = kd; F[i * 6 + 4] = rr(); F[i * 6 + 5] = brand ? 1 : 0;
      const yAt = a => p[1] + vy * (1 - Math.exp(-kd * a)) / kd - G2 * a * a;
      let lo = 0, hi = 12; for (let it = 0; it < 40; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
      AW[i] = lo;
    }
    const ns = 80, SP = new Float32Array(ns * 5);
    for (let i = 0; i < ns; i++) {
      const u = rr() * 2 - 1, th = rr() * TAU, c = Math.sqrt(1 - u * u), sp = 60 + 310 * Math.pow(rr(), 1.6);
      SP[i * 5] = c * Math.cos(th) * sp + dir[0] * 160; SP[i * 5 + 1] = u * sp * .8 + dir[1] * 160 + 20; SP[i * 5 + 2] = c * Math.sin(th) * sp + dir[2] * 160;
      SP[i * 5 + 3] = 1.6 + 1.8 * rr(); SP[i * 5 + 4] = .4 + .6 * rr();
    }
    // fingers of fire: [unit dir, length (m), rn]; thrown a little along the round's momentum
    const FG = new Float32Array(NF * 5);
    for (let i = 0; i < NF; i++) {
      const u = rr() * 2 - 1, th = rr() * TAU, c = Math.sqrt(1 - u * u);
      let d = [c * Math.cos(th) + dir[0] * .35, u * .8 + dir[1] * .35 + .1, c * Math.sin(th) + dir[2] * .35];
      if (low && d[1] < 0) d[1] = -d[1] * .3;
      d = V.norm(d);
      FG.set([d[0], d[1], d[2], 5 + 8 * Math.pow(rr(), 1.5), rr()], i * 5);
    }
    // strikes on the body in the last half second: [time before the stop, z along the body, angle round it]
    const ST = []; for (let j = 0; j < 9; j++) ST.push([.46 * Math.pow(hsh(k * 13 + j, 3), .8), -3.6 + 7.4 * hsh(k * 13 + j, 5), TAU * hsh(k * 13 + j, 7)]);
    return { k, id: rd.id, t0, p, dir, low, n, F, AW, ns, SP, FG, ST, fs: low ? 1.1 : 1, life: 7, range: RO.range, rot: R.mul(R.y(k * 2.1 + .4), R.x(k * 1.3 - .5)) };
  });
  PF.BURSTS = BU;
  const BC = [0, 0, 0];
  function burstC(B, a, out) {
    const run = 680 / 3.4 * (1 - Math.exp(-3.4 * a)) * .07;
    out[0] = B.p[0] + B.dir[0] * run + VA[0] * a * .9; out[1] = B.p[1] + B.dir[1] * run + 1.3 * a; out[2] = B.p[2] + B.dir[2] * run + VA[2] * a * .9;
    if (B.low && out[1] < 2.6 + 1.3 * a) out[1] = 2.6 + 1.3 * a;
    return out;
  }
  const burstR = (B, a) => B.fs * (5.8 * (1 - Math.exp(-a * 6.5)) + 1.4 * a);
  const SPH = [255, 250, 236], SPT = [255, 140, 80], BRH = [255, 206, 150], BRT = [150, 150, 144], FRH = [255, 240, 224], FRT = [200, 190, 176];
  const FGH = [0, 0, 0], FGT = [0, 0, 0], FC0 = [0, 0, 0], FC1 = [0, 0, 0];
  function drawBurst(B, T) {
    const a = T - B.t0; if (a < 0 || a > B.life) return;
    const c = burstC(B, a, BC), p = B.p;
    drawFire(FBT, c[0], c[1], c[2], B.rot, burstR(B, a), a, 1 - ss(B.life * .45, B.life, a), B.dir, .35, .3, .62 * ss(.45, 3.2, a));
    // the first instant: a white core
    if (a < .2 && P3(p[0], p[1], p[2])) {
      const w = 1 - a / .2;
      put(q.x, q.y, 7, 255, 255, 250, w);
      glow(q.x, q.y, Math.min(360, 10 + 3.2 * FLc / q.z) * (.6 + .4 * w), 255, 236, 214, .85 * w);
    }
    // fingers of fire thrown out of the ball, leaving grey trails
    if (a < 2.6) {
      const hot = Math.exp(-a * 4), fade = 1 - ss(1.3, 2.6, a), grow = 1 - Math.exp(-a * 7), droop = G2 * a * a * .3, dx = VA[0] * a * .6, dz = VA[2] * a * .6;
      const hk = sat(hot * 2.2);
      for (let c2 = 0; c2 < 3; c2++) { FGH[c2] = GREY[c2] + ((c2 ? HOT[c2] * hot + WARM[c2] * (1 - hot) : 255) - GREY[c2]) * hk; FGT[c2] = GREY[c2] + (WARM[c2] - GREY[c2]) * hk * .6; }
      for (let i = 0; i < NF; i++) {
        const o = i * 5, rh = B.FG[o + 3] * B.fs * grow, rt = rh * (.12 + .45 * sat(a / .7));
        streak(p[0] + B.FG[o] * rh + dx, p[1] + B.FG[o + 1] * rh - droop, p[2] + B.FG[o + 2] * rh + dz,
          p[0] + B.FG[o] * rt + dx, p[1] + B.FG[o + 1] * rt - droop * .5, p[2] + B.FG[o + 2] * rt + dz, 28, FLc > 5000 ? 2 : 1, FGH, FGT,
          fade * (.35 + .65 * hot) * (.7 + .3 * B.FG[o + 4]));
      }
    }
    // sparks: white streaks going warm as they slow
    if (a < 1.1) for (let i = 0; i < B.ns; i++) {
      const o = i * 5, life = B.SP[o + 4]; if (a > life) continue;
      const kd = B.SP[o + 3], vx = B.SP[o], vy = B.SP[o + 1], vz = B.SP[o + 2], w = 1 - a / life;
      const h = (1 - Math.exp(-kd * a)) / kd, tb = Math.max(0, a - .014), hb = (1 - Math.exp(-kd * tb)) / kd;
      streak(p[0] + vx * h, p[1] + vy * h - G2 * a * a, p[2] + vz * h, p[0] + vx * hb, p[1] + vy * hb - G2 * tb * tb, p[2] + vz * hb, 24, FLc > 5000 ? 2 : 1, SPH, SPT, Math.min(1, 1.3 * w));
    }
    // fragments: bright specks streaking out, every fifth a burning brand trailing smoke; a splash where each lands
    const F = B.F, AW = B.AW;
    for (let i = 0; i < B.n; i++) {
      const o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], rn = F[o + 4], brand = F[o + 5], aw = AW[i];
      if (a < aw) {
        const h = (1 - Math.exp(-kd * a)) / kd, tb = Math.max(0, a - (brand ? .3 : .02)), hb = (1 - Math.exp(-kd * tb)) / kd;
        const hot = Math.exp(-a * (brand ? .9 : 2.2)), b = (brand ? 1 : .5 + .35 * rn) * (.35 + .65 * hot) * (1 - .5 * a / aw);
        // specks cool from white-hot to dull grey as they fall
        const c0 = brand ? BRH : FC0, c1 = brand ? BRT : FC1;
        if (!brand) for (let c2 = 0; c2 < 3; c2++) { FC0[c2] = GREY[c2] * .8 + (FRH[c2] - GREY[c2] * .8) * hot; FC1[c2] = GREY[c2] * .7 + (FRT[c2] - GREY[c2] * .7) * hot; }
        streak(p[0] + vx * h, p[1] + vy * h - G2 * a * a, p[2] + vz * h, p[0] + vx * hb, p[1] + vy * hb - G2 * tb * tb + (brand ? .6 : 0), p[2] + vz * hb,
          brand ? 24 : 6, brand || (rn > .6 && hot > .3) ? 2 : 1, c0, c1, b > 1 ? 1 : b);
      } else if (a < aw + 1.4) {
        const w = a - aw, h = (1 - Math.exp(-kd * aw)) / kd, x = p[0] + vx * h + VW[0] * w, z = p[2] + vz * h + VW[2] * w;
        if (!P3(x, 1, z)) continue;
        const px = 4 * FLc / q.z, nn = Math.min(24, Math.max(4, Math.round(px / 4))), al = .8 * (1 - w / 1.4), sz = px > 70 ? 2 : 1, hs = B.low ? 1.4 : 1;
        for (let m = 0; m < nn; m++) {
          const vs = (2.6 + 7 * hsh(i, m + 9) + rn * 2) * hs, yy = vs * w - G2 * w * w; if (yy < 0) continue;
          const g = (i * 5 + m * 3) & GM, sp = .3 + .7 * w;
          if (P3(x + GT[g] * sp, yy, z + GT[(g + 1) & GM] * sp)) put(q.x, q.y, sz, WH[0], WH[1], WH[2], al * (.55 + .45 * hsh(i, m)));
        }
      }
    }
  }
  /* the strikes before the kill: a white-hot fleck on the body and a spit of sparks, 50 ms each */
  const RS = { p: [0, 0, 0], dir: [0, 0, 1] };
  function drawStrikes(B, T) {
    const a = B.t0 - T; if (a < 0 || a > .5) return;
    PF.round(B.k, T, RS);
    const Xf = DW.roundX(RS), Rm = Xf.R;
    for (let j = 0; j < B.ST.length; j++) {
      const s = B.ST[j], w = 1 - (s[0] - a) / .05; if (a > s[0] || w <= 0) continue;
      const lx = Math.cos(s[2]) * .36, ly = Math.sin(s[2]) * .36, lz = s[1];
      const x = Xf.T[0] + Rm[0] * lx + Rm[1] * ly + Rm[2] * lz, y = Xf.T[1] + Rm[3] * lx + Rm[4] * ly + Rm[5] * lz, z = Xf.T[2] + Rm[6] * lx + Rm[7] * ly + Rm[8] * lz;
      if (!P3(x, y, z)) continue;
      const pxm = FLc / q.z;
      put(q.x, q.y, Math.max(2, Math.min(5, Math.round(.3 * pxm))), 255, 252, 240, w);
      glow(q.x, q.y, Math.min(60, 2 + .9 * pxm), 255, 220, 180, .6 * w);
      const dt = .05 * (1 - w);
      for (let m = 0; m < 7; m++) {
        const g = (B.k * 97 + j * 13 + m * 3) & GM, v = 40 + 60 * hsh(j, m);
        if (P3(x + GT[g] * v * dt, y + GT[(g + 1) & GM] * v * dt, z + GT[(g + 2) & GM] * v * dt)) put(q.x, q.y, 1, 255, 220, 170, .9 * w);
      }
    }
  }
  /* the sea-skimmer's burst three metres over the water: a column of spray and a surge racing out across the sea */
  const WC = (() => {
    const r = rng(8207), n = 3200, a = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      const th = r() * TAU, vr = 3 + 21 * Math.pow(r(), 1.6), vu = (7 + 30 * Math.pow(r(), .8)) * (1 - .55 * (vr - 3) / 21), k = .5 + 1.2 * r();
      const yAt = t => vu * (1 - Math.exp(-k * t)) / k - G2 * t * t;
      let lo = .05, hi = 12; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > 0) lo = m; else hi = m; }
      a.set([Math.cos(th), Math.sin(th), vr, vu, k, r(), lo], i * 7);
    }
    return { n, a };
  })();
  const WCP = [0, 4, 0];
  function drawColumn(B, T) {
    const t = T - B.t0 - .02; if (t < 0 || t > 7) return;
    const bx = B.p[0] + B.dir[0] * 6, bz = B.p[2] + B.dir[2] * 6, A = WC.a;
    WCP[0] = bx; WCP[2] = bz;
    const zc = CAM.depth(WCP); if (zc < 1) return;
    const pxm = FLc / zc, sz = pxm > 45 ? 3 : pxm > 12 ? 2 : 1, e = CAM.eye;
    for (let i = 0; i < WC.n; i++) {
      const o = i * 7, tl = A[o + 6]; if (t > tl) continue;
      const k = A[o + 4], ek = (1 - Math.exp(-k * t)) / k, rr = .8 + A[o + 2] * ek, y = A[o + 3] * ek - G2 * t * t;
      if (y < 0) continue;
      const x = bx + A[o] * rr + VA[0] * .25 * t, z = bz + A[o + 1] * rr + VA[2] * .25 * t;
      if (!P3(x, y, z)) continue;
      // the sunlit side of the column brighter, its far side dim
      const s = A[o + 5], lit = .6 + .4 * (A[o] * LK[0] + A[o + 1] * LK[2]), fr = (A[o] * (e[0] - bx) + A[o + 1] * (e[2] - bz)) > 0 ? 1 : .6;
      const b = (.4 + .6 * s) * lit * fr * (1 - .6 * t / tl) * (t < .05 ? t / .05 : 1);
      put(q.x, q.y, s > .45 ? sz : Math.max(1, sz - 1), WH[0], WH[1], WH[2], b > 1 ? 1 : b);
    }
    // the surge: a ring of white water racing out
    if (t < 4) {
      const rr = 3 + 34 * (1 - Math.exp(-t * 1.15)), al = .7 * (1 - t / 4);
      for (let j = 0; j < 420; j++) {
        const th = j / 420 * TAU + hsh(j, 51) * .02, rj = rr * (.94 + .12 * hsh(j, 53)), yy = .25 + 1.1 * hsh(j, 57) * (1 - t / 4);
        if (P3(bx + Math.cos(th) * rj + VW[0] * t * .3, yy, bz + Math.sin(th) * rj + VW[2] * t * .3)) put(q.x, q.y, sz > 1 ? 2 : 1, WH[0], WH[1], WH[2], al * (.5 + .5 * hsh(j, 59)));
      }
    }
  }
  PF.burstFx = function (T, ctx) {
    frame(ctx);
    for (const B of BU) {
      if (T < B.t0 - .6 || T > B.t0 + B.life) continue;
      drawStrikes(B, T);
      if (B.low) drawColumn(B, T);
      drawBurst(B, T);
    }
  };

  /* ---------- TRK 06 into the hangar ---------- */
  const TH = PF.T_HIT;
  const XH = PF.shipX(TH);
  const HC = [-8.5, PF.HIT_L[1], PF.HIT_L[2]];                 // on the hangar's port wall (x -8.45 in the model)
  const HW = X.ap(XH, HC), OUT = X.dir(XH, [-1, 0, 0]), FWD = X.dir(XH, [0, 0, 1]), UPW = X.dir(XH, [0, 1, 0]);
  const MH = [OUT[0], UPW[0], FWD[0], OUT[1], UPW[1], FWD[1], OUT[2], UPW[2], FWD[2]];
  const VENT = X.ap(XH, [-6.9, 13.3, -41.8]);                   // the blast comes up through the hangar roof here
  /* all of it is out of shot by ~144 and gone before the take is back in the sight */
  const gateH = T => 1 - ss(150.5, 154.6, T);
  const HFT = mkFire(9601, 14000, 15, true);
  const JT = (() => { const r = rng(9607), n = 3200, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = Math.pow(r(), .75); a[i * 4 + 1] = gH(i, 71); a[i * 4 + 2] = gH(i, 73); a[i * 4 + 3] = r(); } return { n, a }; })();
  const CC = [0, 0, 0];
  function heatCol(heat, skin) {
    if (heat > .52) {
      const u = (heat - .52) / .48, l = skin * skin * .8 * (.35 + .65 * u);
      CC[0] = 255; CC[1] = HOT[1] + (FIRE[1] - HOT[1]) * l; CC[2] = HOT[2] + (FIRE[2] - HOT[2]) * l;
      if (u < .45) { const w = (1 - u / .45) * .75; CC[1] += (WARM[1] - CC[1]) * w; CC[2] += (WARM[2] - CC[2]) * w; }
      return .9 + .5 * u;
    }
    if (heat > .16) { const u = (heat - .16) / .36; CC[0] = GREY[0] + (WARM[0] - GREY[0]) * u; CC[1] = GREY[1] + (WARM[1] - GREY[1]) * u; CC[2] = GREY[2] + (WARM[2] - GREY[2]) * u; return .34 + .56 * u; }
    CC[0] = GREY[0]; CC[1] = GREY[1]; CC[2] = GREY[2]; return .2 + .2 * (heat / .16);
  }
  const HB = [0, 0, 0];
  /* the ball rolls out of the hole and up the wall, never clear of it: the half template stays outboard of the plating */
  function bloomC(t) {
    const vent = 3.4 * (1 - Math.exp(-t * 5)), up = 2.4 * t + 2.4 * (1 - Math.exp(-t * 3)), dr = (t - .8 * (1 - Math.exp(-t / .8))) * .75;
    HB[0] = HW[0] + OUT[0] * vent + VA[0] * dr; HB[1] = HW[1] + up; HB[2] = HW[2] + OUT[2] * vent + VA[2] * dr;
    return 6.8 * (1 - Math.exp(-t * 7)) + 1.3 * t;
  }
  const HBLOOM = { ok: false, x: 0, y: 0, r: 0, t: 0 }, NORUN = [0, 0, 0];
  function drawBloom(a, G) {
    if (a < .006 || a > 7) return;
    // the warhead and the fuel burn longer than a gun kill: the ball cools at half the rate
    const t = a - .006, Rb = bloomC(t);
    // flattened against the plating, spread along the hull and up it; a deeper amber than a gun kill (fuel)
    WALL = (HB[0] - HW[0]) * OUT[0] + (HB[2] - HW[2]) * OUT[2]; SX = .72; SY = 1.1; SZ = 1.3; AMc = HAMB; DIV0 = 13;
    const Rpx = drawFire(HFT, HB[0], HB[1], HB[2], MH, Rb, t * .7, G * (1 - ss(3.5, 7, t)), NORUN, 0, .3, .55 * ss(1.6, 5, t));
    WALL = 0; SX = SY = SZ = 1; AMc = null; DIV0 = 10;
    // the jet up through the roof: fast, narrow, rolling over at the top
    const H = 20 * (1 - Math.exp(-t * 2.4)) + 1.8 * t, J = JT.a, NJ = Math.min(JT.n, Math.max(1400, Math.round(Rpx * Rpx / 32)));
    const d2 = t - .6 * (1 - Math.exp(-t / .6)), jf = G * (1 - ss(2, 4.2, t)), thin = .4 * ss(1.4, 4, t);
    if (jf > .01) for (let i = 0; i < NJ; i++) {
      const o = i * 4, s = J[o], rn = J[o + 3]; if (rn < thin) continue;
      const hs = s * H, rad = .45 + 4.2 * s * s * (1 - Math.exp(-t * 2.5)) + .9 * t;
      if (!P3(VENT[0] + J[o + 1] * rad + VA[0] * d2 * s, VENT[1] + hs + J[o + 2] * rad * .35, VENT[2] + J[o + 2] * rad * .8 + VA[2] * d2 * s)) continue;
      const heat = Math.exp(-t * (.8 + 1.8 * s) * (.75 + .5 * rn));
      const al = heatCol(heat, s * .85), b = jf * al * (heat > .52 ? .55 + .7 * rn : .3 + .9 * rn * rn);
      put(q.x, q.y, q.z < 1600 && (heat > .4 || rn > .6) ? 2 : 1, CC[0], CC[1], CC[2], b > 1 ? 1 : b);
    }
    HBLOOM.ok = false;
    if (P3(HB[0], HB[1], HB[2])) {
      glow(q.x, q.y, Math.min(120, .45 * Rpx + 8), 255, 248, 232, .55 * Math.exp(-t * 3.5) * G);
      HBLOOM.ok = true; HBLOOM.x = q.x; HBLOOM.y = q.y; HBLOOM.r = Rpx; HBLOOM.t = t;
    }
  }
  function drawImpact(a, G) {
    if (a < 0 || a > .016) return;
    if (!P3(HW[0], HW[1], HW[2])) return;
    const w = 1 - a / .016;
    put(q.x, q.y, 6, 255, 255, 250, G);
    glow(q.x, q.y, Math.min(160, 10 + 12 * FLc / q.z), 255, 240, 220, .5 * G * w);
    glow(q.x, q.y, Math.min(50, 3 + 3 * FLc / q.z), 255, 255, 245, .95 * G);
  }
  /* fragments: out of the hole, into the sea or onto the deck edge (where they lie burning a moment); sparks */
  const DECK_Y = 8.05, HULL_X = -9.95;
  const DEB = (() => {
    const r = rng(9603), n = 560, a = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      let dx = .25 + r(), dy = -.25 + 1.35 * r(), dz = (r() - .5) * 1.8; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const sp = 10 + 140 * Math.pow(r(), 2.6), k = .3 + 1.4 * r();
      const vx = OUT[0] * dx + FWD[0] * dz, vz = OUT[2] * dx + FWD[2] * dz;
      const e = t => (1 - Math.exp(-k * t)) / k, yAt = t => HW[1] + dy * sp * e(t) - G2 * t * t, xAt = t => HW[0] + VA[0] * t + (vx * sp - VA[0]) * e(t);
      const root = (y0) => { let lo = .01, hi = 14; if (yAt(lo) < y0) return lo; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > y0) lo = m; else hi = m; } return lo; };
      // over the deck edge when it comes down through deck height: it lands there
      const t8 = root(DECK_Y), deck = xAt(t8) > HULL_X ? 1 : 0;
      a.set([vx * sp, dy * sp, vz * sp, k, r(), i % 4 === 0 ? 1 : 0, deck ? t8 : root(0), deck], i * 8);
    }
    return { n, a };
  })();
  const SPK = (() => {
    const r = rng(9604), n = 200, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      let dx = .15 + r(), dy = -.3 + 1.5 * r(), dz = (r() - .5) * 2.2; const l = Math.hypot(dx, dy, dz), sp = 60 + 170 * r();
      a.set([(OUT[0] * dx + FWD[0] * dz) / l * sp, dy / l * sp, (OUT[2] * dx + FWD[2] * dz) / l * sp, 2.5 + 2.5 * r(), .2 + .5 * r()], i * 5);
    }
    return { n, a };
  })();
  const FP = [0, 0, 0], FQ = [0, 0, 0];
  function frag(vx, vy, vz, k, t, out) {
    const e = (1 - Math.exp(-k * t)) / k;
    out[0] = HW[0] + VA[0] * t + (vx - VA[0]) * e; out[1] = HW[1] + vy * e - G2 * t * t; out[2] = HW[2] + VA[2] * t + (vz - VA[2]) * e;
    return out;
  }
  function drawDebris(a, G) {
    const t = a - .01; if (t < 0 || t > 12) return;
    const Dd = DEB.a;
    for (let i = 0; i < DEB.n; i++) {
      const o = i * 8, vx = Dd[o], vy = Dd[o + 1], vz = Dd[o + 2], k = Dd[o + 3], rn = Dd[o + 4], brand = Dd[o + 5], tl = Dd[o + 6], deck = Dd[o + 7];
      if (t < tl) {
        const hot = Math.exp(-t * 1.6), p = frag(vx, vy, vz, k, t, FP), pb = frag(vx, vy, vz, k, Math.max(0, t - (brand ? .35 : .025)), FQ);
        const b = G * (brand ? 1 : .5 + .45 * rn) * (.55 + .45 * hot) * (brand ? 1 - .5 * t / tl : 1);
        streak(p[0], p[1], p[2], pb[0], pb[1] + (brand ? .5 : 0), pb[2], brand ? 22 : 6, brand || rn > .6 ? 2 : 1, brand ? BRH : FRH, brand ? BRT : FRT, b > 1 ? 1 : b);
      } else if (deck) {
        // lying on the deck edge, glowing and going out
        const w = t - tl; if (w > 3.5 || !brand && w > 1.2) continue;
        const p = frag(vx, vy, vz, k, tl, FP);
        if (!P3(p[0], DECK_Y + .06, p[2])) continue;
        const f = hsh(i, Math.floor((TH + a) * 18));
        put(q.x, q.y, q.z < 300 ? 2 : 1, 255, 170 + 60 * f, 110 + 60 * f, G * (1 - w / (brand ? 3.5 : 1.2)) * (.5 + .5 * f));
      } else if (t < tl + 1.2) {
        // the splash, left astern by the water
        const w = t - tl, p = frag(vx, vy, vz, k, tl, FP), x = p[0] + VW[0] * w, z = p[2] + VW[2] * w, al = G * .75 * (1 - w / 1.2);
        for (let m = 0; m < 4; m++) {
          const vs = 3 + m * 2.3 + rn * 3, yy = vs * w - G2 * w * w; if (yy < 0) continue;
          const g = (i * 4 + m) & GM;
          if (P3(x + GT[g] * .5 * (1 + w), yy, z + GT[(g + 1) & GM] * .5 * (1 + w))) put(q.x, q.y, q.z < 500 ? 2 : 1, WH[0], WH[1], WH[2], al);
        }
      }
    }
    if (t < 1.1) {
      const S_ = SPK.a;
      for (let i = 0; i < SPK.n; i++) {
        const o = i * 5, life = S_[o + 4]; if (t > life) continue;
        const k = S_[o + 3], w = 1 - t / life, p = frag(S_[o], S_[o + 1], S_[o + 2], k, t, FP), pb = frag(S_[o], S_[o + 1], S_[o + 2], k, Math.max(0, t - .03), FQ);
        streak(p[0], p[1], p[2], pb[0], pb[1], pb[2], 16, 2, SPH, SPT, G * Math.min(1, 1.4 * w));
      }
    }
  }
  /* the hole and the fires ride the hull (ship coordinates through PF.shipX(T), as flat numbers) */
  let M0 = 1, M1 = 0, M2 = 0, M3_ = 0, M4 = 1, M5 = 0, M6 = 0, M7 = 0, M8 = 1, T0 = 0, T1 = 0, T2 = 0;
  const hullAt = T => { const Xs = PF.shipX(T), M = Xs.R; M0 = M[0]; M1 = M[1]; M2 = M[2]; M3_ = M[3]; M4 = M[4]; M5 = M[5]; M6 = M[6]; M7 = M[7]; M8 = M[8]; T0 = Xs.T[0]; T1 = Xs.T[1]; T2 = Xs.T[2]; };
  const P3m = (x, y, z) => P3(M0 * x + M1 * y + M2 * z + T0, M3_ * x + M4 * y + M5 * z + T1, M6 * x + M7 * y + M8 * z + T2);
  const HOLE = (() => {
    const inner = [], rim = [], xw = -8.45 - .06;
    for (let y = DECK_Y + .05; y <= 11.6; y += .12) for (let z = -3.2; z <= 3.2; z += .12) {
      const dy = y - HC[1], dz = z * .85, d = Math.hypot(dy, dz), th = Math.atan2(dy, dz);
      const rad = 1.75 * (1 + .26 * M3.noise(Math.cos(th) * 1.3 + 4, Math.sin(th) * 1.3, 3.1) + .12 * Math.sin(5 * th + 1));
      if (d < rad - .1) inner.push(xw, y, HC[2] + z);
      else if (d < rad + .14 && hsh(Math.round(y * 50), Math.round(z * 50) + 999) < .75) rim.push(xw - .02, y, HC[2] + z);
    }
    return { inner: new Float32Array(inner), rim: new Float32Array(rim) };
  })();
  /* fire sites (ship coords): [x, y, z, ignition age, strength] */
  const FS = (() => {
    const r = rng(9605), s = [];
    s.push([-8.6, HC[1] - .2, HC[2], .05, 1.6]);
    for (let k = 0; k < 7; k++) { const th = k / 7 * TAU + r() * .4; s.push([-8.6, Math.max(DECK_Y + .1, HC[1] + Math.sin(th) * 1.7), HC[2] + Math.cos(th) * 2, .15 + .5 * r(), .7 + .5 * r()]); }
    for (let k = 0; k < 10; k++) { const z = HC[2] + (r() - .5) * 15; s.push([-9.7 + 1.1 * r(), DECK_Y, z, .4 + Math.abs(z - HC[2]) * (.2 + .3 * r()), .5 + .6 * r()]); }
    for (let k = 0; k < 8; k++) { const z = HC[2] + (r() - .6) * 9; s.push([-8.1 + 1.8 * r(), 13.25, z, .6 + Math.abs(z - HC[2]) * (.25 + .3 * r()), .5 + .6 * r()]); }
    for (let k = 0; k < 4; k++) s.push([-9.98, 6.3 + 1.3 * r(), HC[2] + (r() - .5) * 6, 1 + 2 * r(), .4 + .4 * r()]);
    return s;
  })();
  const BG = [9, 10, 8], VAL = Math.hypot(VA[0], VA[2]), VAN = [VA[0] / VAL, 0, VA[2] / VAL];
  const gateF = T => 1 - ss(146, 151.5, T);
  function drawHole(a, G) {
    if (a < .02) return;
    const k = G * sat((a - .02) / .05), I = HOLE.inner, Rm = HOLE.rim, big = P3m(HC[0], HC[1], HC[2]) && q.z < 120;
    for (let i = 0; i < I.length; i += 3) if (P3m(I[i], I[i + 1], I[i + 2])) dset(q.x, q.y, big ? 2 : 1, BG, .9 * k);
    const fr = Math.floor((TH + a) * 20);
    for (let i = 0, j = 0; i < Rm.length; i += 3, j++) {
      if (!P3m(Rm[i], Rm[i + 1], Rm[i + 2])) continue;
      const f = hsh(j, fr), b = k * (.45 + .55 * f) * (.5 + .5 * Math.exp(-a / 6));
      put(q.x, q.y, big ? 2 : 1, 255, 150 + 70 * f, 96 + 60 * f, b > 1 ? 1 : b);
    }
  }
  function drawFires(a, G) {
    if (a < .05) return;
    const S = TH + a, fr = Math.floor(S * 22);
    for (let i = 0; i < FS.length; i++) {
      const f = FS[i], I = G * Math.min(1.25, f[4] * 1.2) * sat((a - f[3]) / 1.2) * (.8 + .2 * Math.sin(S * 1.7 + i));
      if (I <= .02) continue;
      const hmax = 1.6 + 3.4 * f[4], n = i < 8 ? 60 : 24;
      for (let m = 0; m < n; m++) {
        const u = hsh(i * 11 + m, fr + i * 31), v = hsh(i * 11 + m + 101, fr), w = hsh(i * 13 + m, fr + 7);
        const hy = v * v * hmax, lean = hy * .55;
        // the flame leans with the air going aft
        if (!P3m(f[0] - .3 * u + VAN[0] * lean, f[1] + hy, f[2] + (w - .5) * 1.4 * f[4] + VAN[2] * lean)) continue;
        const b = I * (1.25 - .6 * v) * (.75 + .3 * u);
        put(q.x, q.y, q.z < 1800 ? 2 : 1, 255, 236 - 96 * v, 200 - 130 * v, b > 1 ? 1 : b);
      }
      if (i < 8 && P3m(f[0] - .3, f[1] + .8, f[2])) glow(q.x, q.y, Math.min(44, 4 + 1.6 * f[4] * FLc / q.z), 255, 150, 86, .24 * I * (.75 + .25 * hsh(i, fr)));
    }
    // embers carried off with the air
    for (let j = 0; j < 110; j++) {
      const f = FS[j % 16], P = 1.1 + 1.4 * hsh(j, 3), ph = hsh(j, 5) * P, c = Math.floor((a + ph) / P), tt = a + ph - c * P;
      if (a - tt < f[3] + .5) continue;
      const u = hsh(j, c), up = (3 + 5 * u) * tt, dr = tt * VAL * .5;
      if (!P3m(f[0] - .4 + GT[(j * 3 + c) & GM] * .6 + VAN[0] * dr, f[1] + 1 + up, f[2] + GT[(j * 3 + c + 1) & GM] * .8 + VAN[2] * dr)) continue;
      const b = G * f[4] * (1 - tt / P) * .9;
      put(q.x, q.y, 1, 255, 206, 150, b > 1 ? 1 : b);
    }
  }
  /* smoke: puffs off the hole and the roof, rising, spreading, carried aft; sunlit on one side, lit from below by the
     fires near the source */
  const SMK = (() => {
    const L = 14, cnt = t => 160 * t + 1500 * (1 - Math.exp(-t / 1.2)), n = Math.floor(cnt(12.5));
    const b = new Float32Array(n), o = new Float32Array(n * 5);
    for (let i = 0, t = 0; i < n; i++) { while (cnt(t) < i) t += .0005; b[i] = .12 + t; }
    for (let i = 0; i < n; i++) {
      const pf = i >> 4;
      o[i * 5] = GT[(pf * 3) & GM] * .6 + GT[(i * 3 + 11) & GM] * .3; o[i * 5 + 1] = GT[(pf * 3 + 1) & GM] * .3 + GT[(i * 3 + 12) & GM] * .25;
      o[i * 5 + 2] = GT[(pf * 3 + 2) & GM] * .6 + GT[(i * 3 + 13) & GM] * .3; o[i * 5 + 3] = hsh(i, 23); o[i * 5 + 4] = hsh(pf, 29) < .6 ? 0 : 1;
    }
    return { n, b, o, L };
  })();
  const SRC = [X.ap(XH, [-9.6, HC[1] + 1, HC[2]]), X.ap(XH, [-6.9, 14.2, HC[2] - .6])];
  const smIdx = t => { const B = SMK.b; let lo = 0, hi = SMK.n; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < t) lo = m + 1; else hi = m; } return lo; };
  const smH = g => 22 * (1 - Math.exp(-g / 2.6)) + 3.2 * g, smR = g => 1 + 1.25 * g, smD = g => g - 1.6 * (1 - Math.exp(-g / 1.6));
  /* each puff is a billow: dots on a ball round its centre, bright on the sunlit side and along the rim, dark
     underneath (the column is seen from 40 m: single specks would read as a haze) */
  const NPC = 9;
  const UV = new Float32Array(GN * 3);
  for (let i = 0; i < GN; i++) { const x = GT[i], y = GT[(i + 1) & GM], z = GT[(i + 2) & GM], l = Math.hypot(x, y, z) || 1; UV[i * 3] = x / l; UV[i * 3 + 1] = y / l; UV[i * 3 + 2] = z / l; }
  function drawSmoke(a, G) {
    if (a < .12 || G <= .01) return;
    const Ob = SMK.o, B = SMK.b, i0 = smIdx(a - SMK.L), i1 = smIdx(a), e = CAM.eye, l0 = LK[0], l1 = LK[1], l2 = LK[2];
    for (let i = i0; i < i1; i++) {
      const g = a - B[i], o = i * 5, src = SRC[Ob[o + 4]], h = smH(g), r = smR(g) + (i < 1500 ? 2.5 * (1 - Math.exp(-g * 2)) : 0), d = smD(g);
      const ox = Ob[o] * r, oy = Ob[o + 1] * r, oz = Ob[o + 2] * r;
      const cx = src[0] + VA[0] * d + ox, cy = src[1] + h + oy, cz = src[2] + VA[2] * d + oz;
      if (cy < .5) continue;
      let vx = e[0] - cx, vy = e[1] - cy, vz = e[2] - cz; const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
      const base = (.62 + .2 * Ob[o + 3]) * sat(g / .5) * (1 - ss(SMK.L - 5, SMK.L, g)) / (1 + g * .05) * G;
      // young smoke and the foot of the column glow with the fire under them
      const w = Math.exp(-g * 1.4) * .8 + .5 * Math.exp(-h / 5);
      const cr = GREY[0] + (FIRE[0] - GREY[0]) * w, cg = GREY[1] + (FIRE[1] - GREY[1]) * w, cb = GREY[2] + (FIRE[2] - GREY[2]) * w;
      const sp = .34 * r, sz = g < 10 ? 2 : 1, np = g < 3 ? NPC + 3 : NPC;
      for (let m = 0; m < np; m++) {
        const k = ((i * 13 + m * 7) & GM) * 3, ux = UV[k], uy = UV[k + 1], uz = UV[k + 2];
        const f = ux * vx + uy * vy + uz * vz; if (f < -.3) continue;
        const rr = sp * (.8 + .2 * hsh(i, m));
        if (!P3(cx + ux * rr, cy + uy * rr * .8, cz + uz * rr)) continue;
        const lit = ux * l0 + uy * l1 + uz * l2, li = lit > 0 ? lit : 0, af = f < 0 ? -f : f, rim = (1 - af) * (1 - af);
        let b = base * (.22 + .85 * li + .35 * rim * (.4 + li) + .5 * w * (uy < 0 ? -uy : 0));
        if (g < 1.4) b = Math.max(b, .5 * (1 - g / 1.4) * G);
        put(q.x, q.y, q.z < 700 ? sz : 1, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
  }
  let HITP = null;
  PF.hitFx = function (T, ctx) {
    frame(ctx); HITP = null; HBLOOM.ok = false;
    if (T < TH || T > 155) return;
    const a = T - TH, G = gateH(T);
    if (G <= .005) return;
    hullAt(T);
    const GF = G * gateF(T);
    drawHole(a, G);
    drawSmoke(a, G);
    if (GF > .01) drawFires(a, GF);
    drawDebris(a, G);
    drawBloom(a, G);
    drawImpact(a, G);
    if (P3m(HC[0], HC[1], HC[2])) HITP = [q.x, q.y, q.z];
  };

  /* ---------- overlay: the muzzle's flicker in the sight, bloom, tags ---------- */
  function bloom(octx, x, y, r, A, mid) {
    if (A <= .004 || r < 2) return;
    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,250,240,${Math.min(1, A).toFixed(3)})`);
    g.addColorStop(.25, `rgba(${mid || '255,206,166'},${(A * .3).toFixed(3)})`);
    g.addColorStop(1, `rgba(${mid || '255,206,166'},0)`);
    octx.globalCompositeOperation = 'lighter'; octx.fillStyle = g; octx.fillRect(x - r, y - r, 2 * r, 2 * r); octx.globalCompositeOperation = 'source-over';
  }
  PF.overlayFx = function (T, octx, tags, ctx) {
    const cam = ctx.cam, sight = ctx.sightK > 0;
    // the gun's own muzzle, just below-right of the window: its flicker washes up into the frame at 75 Hz
    const fw = PF.firing(T, 0);
    if (sight && fw) {
      const fr = Math.floor(T * CW.rate), fk = hsh(fr, 23), on = sat((T - fw.t0) / .04) * sat((fw.t1 - T) / .04);
      bloom(octx, cam.cx + 700, 1190, 760, (.16 + .2 * fk) * on, '255,196,150');
      if (T - fw.t0 < .08) bloom(octx, cam.cx + 680, 1150, 1100, .22 * (1 - (T - fw.t0) / .08), '255,210,170');
    }
    // bursts: a white wash as the imager takes the flash, the fireball's light; the track goes to 'stopped'
    for (const B of BU) {
      const a = T - B.t0; if (a < 0 || a > 3) continue;
      const c = burstC(B, a, BC), p = cam.project(c); if (!p || p[2] < 1) continue;
      const Rpx = burstR(B, a) * cam.fl / p[2];
      if (sight && a < .2) { octx.globalCompositeOperation = 'lighter'; octx.fillStyle = `rgba(255,248,236,${(.24 * Math.exp(-a * 20)).toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); octx.globalCompositeOperation = 'source-over'; }
      bloom(octx, p[0], p[1], Math.min(640, 30 + 1.15 * Rpx), .55 * Math.exp(-a * 9) + .07 * Math.exp(-a * 2));
      const al = sat(a / .12) * (1 - ss(2.2, 3, a));
      const o = cam.project(B.p);
      if (al > .02 && o && o[0] > 60 && o[0] < 1860 && o[1] > 60 && o[1] < 1020) {
        const off = Math.max(56, Math.min(420, .78 * Rpx));
        tags.push({ key: 'r' + B.k, cls: 'sm', a: B.id, b: 'stopped', v: Math.round(B.range) + ' m', x: o[0] + off, y: o[1] - off - 30, al, pri: 6, lead: [o[0] + Math.min(off * .5, 60), o[1] - Math.min(off * .5, 60)] });
      }
    }
    // the hit: the flash, the fireball's light
    if (HITP && T >= TH && T < TH + 6) {
      const a = T - TH, [x, y, z] = HITP, sc = E.clamp(60 / z, .4, 3);
      if (a < .1) bloom(octx, x, y, (160 + 1400 * a) * sc, .85 * Math.exp(-a * 30), '255,214,176');
      if (HBLOOM.ok && HBLOOM.t < 2.4) bloom(octx, HBLOOM.x, HBLOOM.y, Math.min(600, 1.2 * HBLOOM.r + 40), (.2 * Math.exp(-HBLOOM.t * 1.5) + .26 * Math.exp(-HBLOOM.t * 10)) * (1 - ss(1.5, 2.4, HBLOOM.t)));
      const ta = sat((a - .03) / .05) * (1 - ss(3.4, 4.2, a)) * gateH(T);
      if (ta > .02 && x > 60 && x < 1860) tags.push({ key: 'r5', cls: 'coral sm', a: 'TRK 06', b: 'hit · hangar', v: '', x: x + 150, y: y - 170, al: ta, pri: 7, lead: [x + 8, y - 10] });
    }
  };

  /* ---------- camera shake: the mount's vibration while it fires, the blast waves arriving (px) ---------- */
  const WAVE = BU.map(B => B.t0 + B.range / 340);
  PF.shakeFx = function (T) {
    let s = PF.firing(T, 0) ? .9 : 0;
    for (const t of WAVE) { const d = T - t; if (d > 0 && d < 1.2) s += 2.4 * Math.exp(-d * 4.5) * sat(d / .03); }
    return s;
  };

  /* ---------- sound (the film adds these to its cue list; fired only while playing forward) ---------- */
  const SFX = STAGE.SFX;
  const brrt = (dur, g) => { SFX.tone(75, 73, dur, 'sawtooth', .032 * g); SFX.tone(150, 147, dur, 'square', .009 * g); SFX.noise(dur, 2400, .7, .045 * g, .02); SFX.noise(dur + .6, 320, .8, .05 * g, .03); };
  const boom = (g, big) => { SFX.noise(.25, 4800, .5, .12 * g, .002); SFX.noise(big ? 3.4 : 2.4, 170, .9, .18 * g, .01); SFX.tone(105, 34, big ? 1.8 : 1.2, 'sine', .09 * g); if (big) SFX.noise(2.6, 900, .6, .05 * g, .3, .25); };
  PF.fxCues = [];
  for (const f of PF.FIRE) PF.fxCues.push([f.t0, () => brrt(f.t1 - f.t0, f.mount ? .55 : 1)]);
  for (const B of BU) PF.fxCues.push([B.t0, () => boom(1, B.low)]);
  PF.fxCues.push([TH, () => { SFX.noise(.35, 5200, .5, .15, .002); SFX.tone(70, 24, 4.5, 'sine', .16); SFX.noise(5, 120, 1, .22, .05); SFX.noise(3.5, 700, .6, .05, .3); }]);
  PF.fxCues.push([TH + 1.6, () => { SFX.noise(5, 160, .9, .12, .4); SFX.noise(6, 1800, .4, .02, 1.2); }]);
})();
