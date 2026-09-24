/* DAMAGE SCAN · the combat effects, drawn into the hooks ph_damage_scan_film.js calls every frame (after the sea,
   the ship, the rounds are in the dot buffer and before the blit), then overlay() after the film's own overlays,
   and the fight's sounds (cues).

   Launches (SM-6 1 fwd 27.4, SM-6 2 fwd 41.2, ESSM aft 57.8): the cell flashes, the exhaust rolls over the deck,
   the round climbs out on a white-hot head with a lime streak, and its smoke hangs along the climb and streams aft
   with the air. Far bursts where the SM-6s stop TRK 41 (44.7, 16 km) and TRK 42 (53.2, 10.5 km). The ESSM goes past
   the weaving TRK 44 (64.6) and self-destructs (65.6). The aft Phalanx slews onto TRK 43 and stops it 520 m out
   (66.9): tracer dots, a burst, debris into the sea; it swings onto TRK 44 and its last stream whips past in the
   slow motion. TRK 44 reaches the port face of the hangar block (70.0): a star, a fireball rolling out of the face
   and venting through the roof, fragments and sparks, the hole (breach), fires round it and a smoke column streaming
   aft. Through the scan and the exploded view the fires ride the hangar block and the damage is tagged; the fires
   die down, the smoke thins, the hole closes out of sight (140.5) and nothing of the fight is left by PH.T_CLEAN.

   Everything is analytic in sim time (PH.S, so the slow motion slows it too) since its event + a seeded index.
   Particles behind her steel are dropped against the occlusion grid the ship writes: the hit is on her far side
   from the lens, so its flash is held back where she stands in front of it (occ, mglow). */
(function () {
  'use strict';
  const { V, R, X, E, rng } = M3;
  const { DEG, TAU, LIME, WH, CORAL, hsh, gH } = PH;
  const DW = PH.DW, SHIP = PH.SHIP, DA = HD.destroyer.A;
  const sat = E.sat, ss = E.ss, mix = E.mix, G2 = 4.905;
  const q = DW.q, P3 = DW.P3, put = DW.put, glow = DW.glow, dset = DW.dset;
  const AIR = PH.AIR, VW = [0, 0, -PH.VS];
  const AIRL = Math.hypot(AIR[0], AIR[2]), AIRN = [AIR[0] / AIRL, 0, AIR[2] / AIRL];
  const GREY = [212, 216, 206], HOTC = [255, 246, 228], MIDC = [255, 150, 96], BG = [10, 11, 9];
  const T_HIT = PH.T_HIT, S_HIT = PH.S_HIT, T_CLEAN = PH.T_CLEAN, SIM = PH.S;
  const win = (T, a, b, c, d) => ss(a, b, T) * (1 - ss(c, d, T));
  const ICP = PH.ICP, RND = PH.RND;
  const T_STRIKE = 80.2;

  /* gaussian offsets, tabled so the hot loops index instead of calling log / cos */
  const GN = 8192, GM = GN - 1, GT = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GT[i] = gH(i, 7331);

  /* behind her steel: the ship wrote the depth of her dots into an 8 px grid */
  const OCCF = DW.OCCF, OW = DW.OW;
  const occ = (x, y, z) => x >= 0 && y >= 0 && x < 1920 && y < 1080 && z > OCCF[((y | 0) >> 3) * OW + ((x | 0) >> 3)] + 2;
  /* a soft additive disc (as DW.glow), held back where her steel stands in front of it; the grid's cells are
     blended bilinearly so the silhouette's edge stays soft */
  const VIS = new Float32Array(66 * 66);
  function mglow(x, y, Rr, r, g, b, a, z) {
    if (a <= .002 || Rr < 1) return;
    const buf = DW.buf, d = buf.d, W = buf.W, H = buf.H;
    const x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(H - 1, Math.ceil(y + Rr));
    if (x0 > x1 || y0 > y1) return;
    const cx0 = x0 >> 3, cy0 = y0 >> 3, cw = (x1 >> 3) - cx0 + 2, ch = (y1 >> 3) - cy0 + 2;
    if (cw > 66 || ch > 66) { glow(x, y, Rr, r, g, b, a); return; }
    let hid = 0;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const cx = Math.min(OW - 1, cx0 + i), cy = Math.min(134, cy0 + j), v = z > OCCF[cy * OW + cx] + 2 ? .08 : 1;
      VIS[j * 66 + i] = v; if (v < 1) hid++;
    }
    if (!hid && Rr <= 60) { glow(x, y, Rr, r, g, b, a); return; }
    const iR2 = 1 / (Rr * Rr);
    if (Rr > 60) {
      // a wide soft light: one weight per 2x2 block
      for (let py = y0; py < y1; py += 2) {
        const dy = py + .5 - y, fy = (py - 3) / 8 - cy0;
        let jy = Math.floor(fy), ty = fy - jy; if (jy < 0) { jy = 0; ty = 0; } else if (jy > ch - 2) { jy = ch - 2; ty = 1; }
        const r0 = jy * 66, r1 = r0 + 66, k0 = py * W;
        for (let px = x0; px < x1; px += 2) {
          const dx = px + .5 - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue;
          const fx = (px - 3) / 8 - cx0;
          let ix = Math.floor(fx), tx = fx - ix; if (ix < 0) { ix = 0; tx = 0; } else if (ix > cw - 2) { ix = cw - 2; tx = 1; }
          const v0 = VIS[r0 + ix] + (VIS[r0 + ix + 1] - VIS[r0 + ix]) * tx, v1 = VIS[r1 + ix] + (VIS[r1 + ix + 1] - VIS[r1 + ix]) * tx;
          const w = u * u * a * (v0 + (v1 - v0) * ty), wr = r * w, wg = g * w, wb = b * w;
          if (wr + wg + wb < 1.5) continue;
          let k = (k0 + px) * 4;
          d[k] += wr; d[k + 1] += wg; d[k + 2] += wb; d[k + 4] += wr; d[k + 5] += wg; d[k + 6] += wb;
          k += W * 4;
          d[k] += wr; d[k + 1] += wg; d[k + 2] += wb; d[k + 4] += wr; d[k + 5] += wg; d[k + 6] += wb;
        }
      }
      return;
    }
    for (let py = y0; py <= y1; py++) {
      const dy = py - y, fy = (py - 3.5) / 8 - cy0;
      let jy = Math.floor(fy), ty = fy - jy; if (jy < 0) { jy = 0; ty = 0; } else if (jy > ch - 2) { jy = ch - 2; ty = 1; }
      const r0 = jy * 66, r1 = r0 + 66;
      for (let px = x0; px <= x1; px++) {
        const dx = px - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue;
        const fx = (px - 3.5) / 8 - cx0;
        let ix = Math.floor(fx), tx = fx - ix; if (ix < 0) { ix = 0; tx = 0; } else if (ix > cw - 2) { ix = cw - 2; tx = 1; }
        const v0 = VIS[r0 + ix] + (VIS[r0 + ix + 1] - VIS[r0 + ix]) * tx, v1 = VIS[r1 + ix] + (VIS[r1 + ix + 1] - VIS[r1 + ix]) * tx;
        const w = u * u * a * (v0 + (v1 - v0) * ty), k = (py * W + px) * 4;
        d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w;
      }
    }
  }

  /* ================= the launches ================= */
  /* smoke puffs laid every DS metres of the flight, each with the moment the head passed it (stage A's arc-length
     inverse), so a puff's age is exact at any T */
  const DS = 7;
  const TR = ICP.map(m => {
    const n = Math.floor(m.L / DS), PX = new Float32Array(n), PY = new Float32Array(n), PZ = new Float32Array(n), PB = new Float32Array(n), tmp = [0, 0, 0];
    for (let j = 0; j < n; j++) { const a = (j + 1) * DS; PH.icPos(m, a, tmp); PX[j] = tmp[0]; PY[j] = tmp[1]; PZ[j] = tmp[2]; PB[j] = PH.icBorn(m, a); }
    const essm = m.id === 'ESSM';
    // motor phases (s after launch): the thick booster column, the sustainer, the glide
    return { m, n, PX, PY, PZ, PB, seed: m.cell * 131 + 7, tB: essm ? 3.4 : 6, tS: essm ? 7.4 : 11, col: essm ? 80 : 190, essm };
  });
  /* the trail: white-hot right behind the head, lime for a moment (the streak), then smoke that spreads, rises a
     little and streams aft (she steams out of it) */
  function drawTrail(tr, S, k) {
    const m = tr.m, t = S - m.sL; if (t < 0) return;
    const PB = tr.PB, PX = tr.PX, PY = tr.PY, PZ = tr.PZ, sd = tr.seed, cam = DW.cam;
    const e0 = cam.eye[0], e1 = cam.eye[1], e2 = cam.eye[2], f0 = cam.f[0], f1 = cam.f[1], f2 = cam.f[2], r0 = cam.r[0], r1 = cam.r[1], r2 = cam.r[2], u0 = cam.u[0], u1 = cam.u[1], u2 = cam.u[2];
    const fl = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], near = cam.near;
    let lo = 0, hi = tr.n; while (lo < hi) { const md = (lo + hi) >> 1; if (PB[md] <= t) lo = md + 1; else hi = md; }
    for (let j = lo - 1; j >= 0; j--) {
      const bt = PB[j], age = t - bt; if (age > 33) break;
      let np, B, tauS, end, spr, dens;
      if (bt < tr.tB) { const col = j < tr.col; np = col ? (age < 10 ? 10 : 6) : 3; B = col ? 1 : .6; tauS = col ? 26 : 20; end = col ? 32 : 24; spr = (col ? 2.6 : 1.6) + 2 * sat(1 - j / 5); dens = col ? 1 : .5; }
      else if (bt < tr.tS) { np = 2; B = .34; tauS = 9; end = 17; spr = 1.1; dens = .22; }
      else { np = 1; B = .2; tauS = 4.5; end = 8.5; spr = .7; dens = .08; }
      if (age > end) continue;
      const env = k * B * Math.exp(-age / tauS) * (1 - ss(end * .6, end, age));
      if (env < .012) continue;
      const r = spr * (.25 + 1.1 * Math.sqrt(age) + .12 * age);
      const bx = PX[j] + AIR[0] * age, by = PY[j] + .5 * age, bz = PZ[j] + AIR[2] * age;
      const dx = bx - e0, dy = by - e1, dz = bz - e2, zc = dx * f0 + dy * f1 + dz * f2;
      if (zc < near + 3 * r) continue;
      // far out the 7 m puffs land < 2 px apart: every other one (every fourth past 9 km) carries the trail
      const thin = age < 1.2 ? 0 : zc > 9000 ? 3 : zc > 4500 ? 1 : 0;
      if (j & thin) continue;
      const s0 = fl / zc, sx = cx + (dx * r0 + dy * r1 + dz * r2) * s0, sy = cy - (dx * u0 + dy * u1 + dz * u2) * s0, rp = 3 * r * s0 + 2;
      if (sx < -rp || sy < -rp || sx > 1920 + rp || sy > 1080 + rp) continue;
      if (zc > 2600) np = Math.max(1, Math.round(np * 2600 / zc));
      else {
        // near the lens a puff is a patch of haze: enough dots to fill its share of the column (one per ~22 px²)
        const dsp = DS * s0, dia = 2 * r * s0;
        np = Math.max(np, Math.min(90, Math.round(dens * dia * Math.min(dsp, dia) / 22)));
      }
      const w = age < .3 ? Math.exp(-age * 16) : 0, l = age < 1.5 ? (1 - w) * Math.exp(-age * 3.4) : 0, g = 1 - w - l;
      const cr = 255 * w + LIME[0] * l + GREY[0] * g, cg = 250 * w + LIME[1] * l + GREY[1] * g, cb = 236 * w + LIME[2] * l + GREY[2] * g;
      const rs = r * s0, sz = zc < 1300 || (w + l > .3 && zc < 9000) ? 2 : 1;
      // smoke drifting right past the lens is a thin haze, not a scatter of bright specks
      const bb = env * (1 + 2.4 * (w + l)) * (rs > 45 ? Math.sqrt(45 / rs) : 1) * (thin ? 1.25 : 1);
      if (bb < .02) continue;
      for (let mm = 0; mm < np; mm++) {
        const g0 = (sd + j * 5 + mm * 1733) & GM, ox = GT[g0], oy = GT[(g0 + 1) & GM] * .8, oz = GT[(g0 + 2) & GM];
        if (by + oy * r < .5) continue;
        const px = sx + (ox * r0 + oy * r1 + oz * r2) * rs, py = sy - (ox * u0 + oy * u1 + oz * u2) * rs;
        // each dot at its own depth in the puff, so smoke hanging over her deck shows its near half
        if (occ(px, py, zc + (ox * f0 + oy * f1 + oz * f2) * r)) continue;
        const b = bb * (.6 + .8 * ((g0 * .618034) % 1));
        put(px, py, sz, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
  }
  /* the head: a white-hot point in a lime halo, the motor's flame behind it (long on the boost, short on the
     sustainer, none in the glide) */
  function drawHead(tr, S, k) {
    const m = tr.m, h = PH.icHead(m, S); if (!h || !h.live) return;
    const t = h.t, HP = h.p, dx = h.dir[0], dy = h.dir[1], dz = h.dir[2];
    const burn = t < tr.tB ? 1 : t < tr.tS ? .55 : .15, Lf = (t < tr.tB ? 24 : t < tr.tS ? 10 : 3) * (tr.essm ? .7 : 1), fr = Math.floor(S * 60);
    for (let j = 0; j < 56; j++) {
      const sg = Lf * Math.pow(hsh(j + 31 * m.cell, fr), 1.7), rad = (.22 + .07 * sg) * .6;
      if (!P3(HP[0] - dx * sg + GT[(j * 3 + fr) & GM] * rad, HP[1] - dy * sg + GT[(j * 3 + fr + 1) & GM] * rad, HP[2] - dz * sg + GT[(j * 3 + fr + 2) & GM] * rad) || occ(q.x, q.y, q.z)) continue;
      const hh = 1 - sg / Lf, b = k * burn * (.35 + .9 * hh);
      put(q.x, q.y, q.z < 800 ? 2 : 1, 255, 205 + 50 * hh, 150 + 100 * hh * hh, b > 1 ? 1 : b);
    }
    if (P3(HP[0], HP[1], HP[2]) && !occ(q.x, q.y, q.z)) {
      const z = q.z, sx = q.x, sy = q.y;
      glow(sx, sy, Math.min(56, 4 + 6000 * (.35 + burn) / z), LIME[0], LIME[1], LIME[2], .26 * k * (.45 + burn));
      glow(sx, sy, Math.min(16, 2 + 1300 / z), 255, 250, 232, .75 * k);
      put(sx, sy, z < 3500 ? 3 : 2, 255, 253, 242, k);
    }
  }
  /* the exhaust a hot launch throws over the deck: puffs out of the cell rolling out, rising, streaming aft */
  const ND = 380, DK = { t: new Float32Array(ND), vx: new Float32Array(ND), vy: new Float32Array(ND), vz: new Float32Array(ND), kd: new Float32Array(ND), life: new Float32Array(ND), br: new Float32Array(ND) };
  { const r = rng(6101); for (let i = 0; i < ND; i++) { const a = r() * TAU, sp = 3 + 22 * Math.pow(r(), 1.4); DK.t[i] = 1.6 * Math.pow(r(), 1.8); DK.vx[i] = Math.cos(a) * sp; DK.vz[i] = Math.sin(a) * sp * .8; DK.vy[i] = 2 + 16 * r(); DK.kd[i] = .45 + .8 * r(); DK.life[i] = 6 + 13 * r(); DK.br[i] = .55 + .45 * r(); } }
  function drawLaunch(tr, S, k) {
    const m = tr.m, a = S - m.sL; if (a < 0 || a > 19) return;
    const P0 = m.P0;
    if (a < 1.3 && P3(P0[0], P0[1] + 1.2, P0[2])) {
      const w = 1 - a / 1.3, z = q.z;
      mglow(q.x, q.y, E.clamp(22 * DW.cam.fl / z, 7, 120) * (.55 + .45 * w), 255, 214, 172, .8 * k * w * w, z);
      if (!occ(q.x, q.y, z)) put(q.x, q.y, z < 1500 ? 4 : 3, 255, 250, 238, k * Math.min(1, w * 1.5));
    }
    for (let i = 0; i < ND; i++) {
      const b = a - DK.t[i]; if (b < 0 || b > DK.life[i]) continue;
      const kd = DK.kd[i], dd = (1 - Math.exp(-kd * b)) / kd;
      if (!P3(P0[0] + DK.vx[i] * dd + AIR[0] * b, P0[1] + DK.vy[i] * dd + 1.4 * b, P0[2] + DK.vz[i] * dd + AIR[2] * b) || occ(q.x, q.y, q.z)) continue;
      const hot = Math.exp(-b * 3), life = 1 - b / DK.life[i], al = DK.br[i] * life * Math.sqrt(life) * (.5 + .7 * hot) * k;
      put(q.x, q.y, q.z < 2600 ? 2 : 1, GREY[0] + (255 - GREY[0]) * hot, GREY[1] + (228 - GREY[1]) * hot, GREY[2] + (184 - GREY[2]) * hot, al > 1 ? 1 : al);
    }
  }

  /* ================= bursts: the SM-6 kills, the ESSM's self-destruct, TRK 43 ================= */
  /* debris: fragments thrown out of the burst carrying part of the momentum (mom, m/s), dragged toward the air's
     velocity (she steams past, so it all streams aft) and falling; each knows when it reaches the sea */
  function mkBurst(o) {
    const r = rng(o.seed), n = o.nF, F = new Float32Array(n * 6), AW = new Float32Array(n), sc = o.sc, p = o.p;
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), f = .08 + .55 * r(), sp = (30 + 330 * Math.pow(r(), 1.4)) * sc;
      const heavy = o.heavy && i % 7 === 0;
      const vx = o.mom[0] * f + c * Math.cos(th) * sp, vy = o.mom[1] * f + u * sp * .75 + 16 * sc, vz = o.mom[2] * f + c * Math.sin(th) * sp;
      const kd = heavy ? .45 + .35 * r() : 1.2 + 2.6 * r();
      F[i * 6] = vx; F[i * 6 + 1] = vy; F[i * 6 + 2] = vz; F[i * 6 + 3] = kd; F[i * 6 + 4] = r(); F[i * 6 + 5] = i % 6 === 0 ? 1 : 0;
      const yAt = a => p[1] + vy * (1 - Math.exp(-kd * a)) / kd - G2 * a * a;
      let lo = 0, hi = 14; for (let it = 0; it < 40; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
      AW[i] = lo;
    }
    const ns = o.ns, SP = new Float32Array(ns * 5);
    for (let i = 0; i < ns; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), sp = (160 + 320 * r()) * (o.ssc || sc);
      SP[i * 5] = c * Math.cos(th) * sp + o.mom[0] * .3; SP[i * 5 + 1] = u * sp * .8 + 25 * sc + o.mom[1] * .3; SP[i * 5 + 2] = c * Math.sin(th) * sp + o.mom[2] * .3;
      SP[i * 5 + 3] = 1.6 + 1.8 * r(); SP[i * 5 + 4] = .4 + .7 * r();
    }
    return Object.assign({ F, AW, SP, n, ns, rot: R.mul(R.y(o.seed * .37), R.x(o.seed * .11)), tf: PH.filmOf(o.t0) }, o);
  }
  /* the fireball: a cluster of lobes (not a ball), dots filling each toward its skin */
  const SHELL = (() => {
    const r = rng(4401), n = 1800, NL = 7, a = new Float32Array(n * 5), LB = [];
    for (let l = 0; l < NL; l++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = l ? .38 + .32 * r() : 0; LB.push([s * Math.cos(th) * d, u * d * .75, s * Math.sin(th) * d, l ? .42 + .3 * r() : .72]); }
    for (let i = 0; i < n; i++) {
      const L = LB[i % NL], u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = Math.pow(r(), .4);
      a[i * 5] = L[0] + s * Math.cos(th) * rr * L[3]; a[i * 5 + 1] = L[1] + u * rr * L[3]; a[i * 5 + 2] = L[2] + s * Math.sin(th) * rr * L[3];
      a[i * 5 + 3] = Math.min(1, rr * (i % NL ? .8 : 1) + .25 * Math.hypot(L[0], L[1], L[2])); a[i * 5 + 4] = r();
    }
    return { n, a };
  })();
  /* the smoke ball a burst leaves: it grows, drifts and thins */
  const NQ = 220, SMB = new Float32Array(NQ * 5);
  { const r = rng(5517); for (let i = 0; i < NQ; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u), qq = Math.cbrt(r()); SMB[i * 5] = Math.cos(a) * h * qq; SMB[i * 5 + 1] = u * qq * .7; SMB[i * 5 + 2] = Math.sin(a) * h * qq; SMB[i * 5 + 3] = .55 + .45 * r(); SMB[i * 5 + 4] = .45 + .55 * r(); } }

  const BURSTS = [];
  for (const m of ICP) {
    if (m.miss) continue;
    const k = m.k, t0 = RND[k].sStop, RO = PH.round(k, t0), hd = PH.icHead(m, m.sL + m.Tf - .002);
    const mom = V.add(V.mul(RO.dir, PH.VR * .5), V.mul(hd.dir, m.vmax * .45));
    BURSTS.push(mkBurst({ kind: 'kill', k, t0, p: RO.p.slice(), mom, sc: 1.6, ssc: 3.2, nF: 260, ns: 170, seed: 900 + k * 17, heavy: false, fire: 1.7, smoke: 60, life: 9 }));
  }
  const ESSM = ICP.find(m => m.miss);
  const ED = (() => {
    const pE = PH.icPos(ESSM, ESSM.L), dE = V.norm(V.sub(pE, PH.icPos(ESSM, ESSM.L - 20)));
    return mkBurst({ kind: 'destruct', k: ESSM.k, t0: ESSM.sL + ESSM.tEnd, p: pE, mom: V.mul(dE, ESSM.vmax * .35), sc: .8, nF: 150, ns: 80, seed: 977, heavy: false, fire: 1.0, smoke: 34, life: 7 });
  })();
  BURSTS.push(ED);
  /* TRK 43, stopped by the aft Phalanx 520 m out: its own momentum carries the debris on toward her */
  const S43 = RND[2].sStop, R43 = PH.round(2, S43);
  const B43 = mkBurst({ kind: 'ciws', k: 2, t0: S43, p: R43.p.slice(), mom: V.mul(R43.dir, 680), sc: 1.1, nF: 360, ns: 150, seed: 4545, heavy: true, fire: 1.3, smoke: 34, life: 10, big: true });
  BURSTS.push(B43);

  const BC = [0, 0, 0];
  /* the fireball's centre runs on with the momentum a little, then drifts with the air and rises */
  function burstC(B, a, out) {
    const m = Math.hypot(B.mom[0], B.mom[1], B.mom[2]) || 1, d = m / 3.4 * (1 - Math.exp(-3.4 * a)) * (B.big ? .12 : .05);
    out[0] = B.p[0] + B.mom[0] / m * d + AIR[0] * a; out[1] = Math.max(B.p[1] * .6, B.p[1] + B.mom[1] / m * d) + 1.4 * a; out[2] = B.p[2] + B.mom[2] / m * d + AIR[2] * a;
    return out;
  }
  function drawBurst(B, S, k) {
    const a = S - B.t0; if (a < 0 || a > B.life) return;
    const c = burstC(B, a, BC), cx = c[0], cy = c[1], cz = c[2], M = B.rot, sc = B.fire;
    // the first instant: a white core
    if (a < .22 && P3(B.p[0], B.p[1], B.p[2])) {
      const w = 1 - a / .22;
      put(q.x, q.y, B.big ? 7 : 5, 255, 255, 250, k * w);
      glow(q.x, q.y, Math.min(B.big ? 190 : 120, 8 + 26000 * sc / q.z) * (.6 + .4 * w), 255, 236, 214, .9 * k * w);
      if (q.z > 5000) glow(q.x, q.y, 22 * (.5 + .5 * w), 255, 214, 170, .5 * k * w);
    }
    // the fireball: white-hot lobes with warm skins, cooling from the outside in, then a thinning grey puff
    const Rb = sc * (13 * (1 - Math.exp(-a * 7)) + 3.6 * a), fade = 1 - ss(B.life * .35, B.life * .6, a), SA = SHELL.a, thin = .45 * ss(1, 3, a);
    if (fade > 0 && P3(cx, cy, cz)) {
      const pxm = DW.cam.fl / q.z, stp = Rb * pxm > 70 ? 1 : Rb * pxm > 30 ? 2 : 3;
      if (Rb * pxm > 1.5) for (let i = 0; i < SHELL.n; i += stp) {
        const o = i * 5, rr = SA[o + 3], rn = SA[o + 4];
        if (rn < thin) continue;
        const ux = SA[o], uy = SA[o + 1], uz = SA[o + 2];
        const y = cy + (M[3] * ux + M[4] * uy + M[5] * uz) * Rb; if (y < .3) continue;
        if (!P3(cx + (M[0] * ux + M[1] * uy + M[2] * uz) * Rb, y, cz + (M[6] * ux + M[7] * uy + M[8] * uz) * Rb) || occ(q.x, q.y, q.z)) continue;
        const heat = Math.exp(-a * (.8 + 1.5 * rr) * (.65 + .7 * ((rn * 7.31) % 1)));
        let cr, cg, cb, al;
        if (heat > .5) { const u = (heat - .5) / .5, uu = u * u; cr = 255; cg = MIDC[1] + (HOTC[1] - MIDC[1]) * uu; cb = MIDC[2] + (HOTC[2] - MIDC[2]) * uu; al = .75 + .6 * u; }
        else if (heat > .16) { const u = (heat - .16) / .34; cr = GREY[0] + (MIDC[0] - GREY[0]) * u; cg = GREY[1] + (MIDC[1] - GREY[1]) * u; cb = GREY[2] + (MIDC[2] - GREY[2]) * u; al = .34 + .5 * u; }
        else { cr = GREY[0]; cg = GREY[1]; cb = GREY[2]; al = .34 * (.6 + .6 * rn); }
        const b = k * fade * al * (.35 + 1.1 * rn * rn);
        put(q.x, q.y, q.z < 80 ? 3 : q.z < 1600 && (heat > .45 || rn > .7) ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
      }
    }
    // the smoke ball it leaves
    if (a > .4) {
      const g = B.smoke * (.3 + .7 * (1 - Math.exp(-a * .9))) + 1.5 * a, f = k * .5 * sat((a - .4) / 1.2) * (1 - ss(B.life * .45, B.life, a));
      if (f > .01) for (let i = 0; i < NQ; i++) {
        const o = i * 5, y = cy + SMB[o + 1] * g * SMB[o + 3]; if (y < .5) continue;
        if (!P3(cx + SMB[o] * g * SMB[o + 3], y, cz + SMB[o + 2] * g * SMB[o + 3]) || occ(q.x, q.y, q.z)) continue;
        put(q.x, q.y, q.z < 700 ? 2 : 1, GREY[0], GREY[1], GREY[2], f * SMB[o + 4]);
      }
    }
    // sparks: white streaks going amber as they slow
    if (a < 1.2) for (let i = 0; i < B.ns; i++) {
      const o = i * 5, life = B.SP[o + 4]; if (a > life) continue;
      const kd = B.SP[o + 3], vx = B.SP[o], vy = B.SP[o + 1], vz = B.SP[o + 2], p = B.p, w = 1 - a / life;
      for (let mm = 0; mm < 5; mm++) {
        const t2 = Math.max(0, a - mm * .014), h = (1 - Math.exp(-kd * t2)) / kd, y = p[1] + vy * h - G2 * t2 * t2; if (y < 0) break;
        if (!P3(p[0] + vx * h, y, p[2] + vz * h) || occ(q.x, q.y, q.z)) continue;
        const hw = Math.min(1, 1.3 * w) * (1 - mm * .17);
        put(q.x, q.y, q.z < 1500 && mm < 2 ? 2 : 1, 255, 160 + 90 * w, 100 + 130 * w * w, k * hw);
      }
    }
    // fragments in the air: bright specks, the brands trailing dots
    const F = B.F, AW = B.AW, p = B.p;
    for (let i = 0; i < B.n; i++) {
      const aw = AW[i]; if (a >= aw) continue;
      const o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], rn = F[o + 4], brand = F[o + 5];
      const h = (1 - Math.exp(-kd * a)) / kd;
      if (brand) for (let mm = 1; mm < 10; mm++) {
        const t2 = a - mm * .035; if (t2 < 0) break;
        const h2 = (1 - Math.exp(-kd * t2)) / kd, u = mm / 10;
        if (P3(p[0] + AIR[0] * t2 + (vx - AIR[0]) * h2, p[1] + vy * h2 - G2 * t2 * t2 + mm * .12, p[2] + AIR[2] * t2 + (vz - AIR[2]) * h2) && !occ(q.x, q.y, q.z)) put(q.x, q.y, 1, 255 - 60 * u, 150 + 50 * u, 100 + 100 * u, k * .8 * (1 - u) * (1 - .5 * a / aw));
      }
      if (!P3(p[0] + AIR[0] * a + (vx - AIR[0]) * h, p[1] + vy * h - G2 * a * a, p[2] + AIR[2] * a + (vz - AIR[2]) * h) || occ(q.x, q.y, q.z)) continue;
      const hot = Math.exp(-a * 1.3), b = k * (brand ? 1 : .55 + .4 * rn) * (.55 + .45 * hot);
      put(q.x, q.y, q.z < 1000 && (brand || rn > .6) ? 2 : 1, 255, brand ? 200 : 236 + 19 * hot, brand ? 150 : 226 + 29 * hot, b > 1 ? 1 : b);
    }
  }
  /* where the debris meets the sea: a white column and a ring per fragment, a heave of spray under a low burst;
     the water streams aft past her */
  function drawSplashes(B, S, k) {
    const a = S - B.t0; if (a < 0 || a > B.life) return;
    const F = B.F, AW = B.AW, p = B.p, hs = B.big ? 1.6 : 1;
    const far = !P3(p[0], p[1], p[2]) || DW.cam.fl / q.z < .3, nm = far ? 1 : 5;
    for (let i = 0; i < B.n; i++) {
      const w = a - AW[i]; if (w < 0 || w > 1.5) continue;
      const o = i * 6, kd = F[o + 3], rn = F[o + 4], aw = AW[i], h = (1 - Math.exp(-kd * aw)) / kd;
      const x = p[0] + AIR[0] * aw + (F[o] - AIR[0]) * h + VW[0] * w, z = p[2] + AIR[2] * aw + (F[o + 2] - AIR[2]) * h + VW[2] * w, al = k * .85 * (1 - w / 1.5);
      const heavy = kd < .9 ? 2.2 : 1;
      for (let mm = far ? 2 : 0; mm < nm + (far ? 2 : 0); mm++) {
        const vs = (3 + mm * 2.4 + rn * 3) * hs * heavy, yy = vs * w - G2 * w * w; if (yy < 0) continue;
        if (P3(x + (mm - 2) * .35 * (1 + w) * heavy, yy, z + GT[(i * 5 + mm) & GM] * .5) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 900 ? 2 : 1, WH[0], WH[1], WH[2], al);
      }
      if (!far && w < .7) for (let mm = 0; mm < 8; mm++) { const th = mm / 8 * TAU + rn * 3, rr = (1 + 7 * w) * heavy; if (P3(x + Math.cos(th) * rr, .2, z + Math.sin(th) * rr) && !occ(q.x, q.y, q.z)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], al * .6); }
    }
    if (p[1] < 40 && a < 3) {
      const R0 = (B.big ? 26 : 34) * B.sc, al = k * .75 * (1 - a / 3);
      for (let i = 0, n = far ? 70 : 160; i < n; i++) {
        const th = hsh(i, B.seed) * TAU, rr = R0 * Math.sqrt(hsh(i, B.seed + 1)) * (.4 + .6 * sat(a * 2)), vs = (8 + 22 * hsh(i, B.seed + 2)) * (B.big ? 1.2 : 1.5);
        const yy = vs * a - G2 * a * a; if (yy < 0) continue;
        if (P3(p[0] + Math.cos(th) * rr + VW[0] * a, yy, p[2] + Math.sin(th) * rr + VW[2] * a) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 900 ? 2 : 1, WH[0], WH[1], WH[2], al * (.5 + .5 * hsh(i, B.seed + 3)));
      }
    }
  }

  /* ================= the aft Phalanx ================= */
  const MI = 1, REST_Y = Math.PI, REST_P = .35, S44 = S_HIT;
  /* sim times: slew onto TRK 43, spin up, the burst that stops it; swing onto TRK 44, the stream that chases it in
     the slow motion; spin down; back to rest once she has been hit */
  const CT = { slew0: 63.3, slew1: 64.8, spin0: 64.4, spin1: 65.1, fire0: 65.3, fire1: S43 + .02, swing0: S43 + .12, swing1: S43 + .7, fire2: S43 + .78, fire3: S44 - .3, spinE: S44 + 1.6, back0: S44 + 3.6, back1: S44 + 6.6 };
  const CW = { rate: 75, v0: 1100, kd: .3 }, TRL = CW.v0 / CW.kd, LAG44 = .07;
  const tof = r => { const x = CW.kd * r / CW.v0; return x < .97 ? -Math.log(1 - x) / CW.kd : 12; };
  const STA = { ciwsYaw: [0, REST_Y], ciwsPitch: [REST_P, REST_P] }, RT = [0, 0, 0];
  function tgtAt(k, s, lag, out) { const r = RND[k]; PH.relPos(k, Math.min(s - lag, k === 3 ? r.sArr : r.sStop + .01), out); return out; }
  /* the lead on round k for a round leaving at tk: time of flight by bisection (the round closes at 680 m/s) */
  function aimAt(tk, k, lag) {
    let yaw = -1.2, pitch = 0, M = null, D = [0, 0, 1], tf = 1;
    for (let it = 0; it < 3; it++) {
      STA.ciwsYaw[MI] = yaw; STA.ciwsPitch[MI] = pitch; M = DA.ciws(STA, MI);
      let lo = 0, hi = 9;
      for (let b = 0; b < 26; b++) { const md = (lo + hi) / 2; tgtAt(k, tk + md, lag, RT); if (tof(Math.hypot(RT[0] - M[0], RT[1] - M[1], RT[2] - M[2])) > md) lo = md; else hi = md; }
      tf = (lo + hi) / 2; tgtAt(k, tk + tf, lag, RT);
      D = V.norm([RT[0] - M[0], RT[1] - M[1] + G2 * tf * tf, RT[2] - M[2]]);
      yaw = Math.atan2(D[0], D[2]); pitch = Math.asin(E.clamp(D[1], -1, 1));
    }
    return { M, D, yaw, pitch, tf };
  }
  const wrapPi = x => x - TAU * Math.round(x / TAU);
  let csS = -1;
  const CS = { yaw: REST_Y, pitch: REST_P, fire: false, burst: 0 };
  function ciwsState(S) {
    if (S === csS) return CS; csS = S;
    CS.fire = false; CS.burst = 0;
    if (S < CT.slew0 || S > CT.back1) { CS.yaw = REST_Y; CS.pitch = REST_P; return CS; }
    const A3 = aimAt(Math.min(S, CT.fire1), 2, 0);
    let yaw = A3.yaw, pitch = A3.pitch;
    if (S > CT.swing0) {
      const A4 = aimAt(E.clamp(S, CT.fire2 - .2, CT.fire3), 3, LAG44), u = ss(CT.swing0, CT.swing1, S);
      yaw = A3.yaw + wrapPi(A4.yaw - A3.yaw) * u; pitch = mix(A3.pitch, A4.pitch, u);
    }
    const w = ss(CT.slew0, CT.slew1, S) * (1 - ss(CT.back0, CT.back1, S));
    CS.yaw = REST_Y + wrapPi(yaw - REST_Y) * w; CS.pitch = mix(REST_P, pitch, w);
    if (S >= CT.fire0 && S <= CT.fire1) { CS.fire = true; CS.burst = 1; }
    else if (S >= CT.fire2 && S <= CT.fire3) { CS.fire = true; CS.burst = 2; }
    return CS;
  }
  /* every round of both bursts: fire time, muzzle, direction (the stream walks onto the round from short and
     wanders a little round it; on TRK 44 it trails the weaving round), when its tracer ends */
  const TRC = (() => {
    const out = [];
    for (const [s0, s1, k, lag, sprd] of [[CT.fire0, CT.fire1, 2, 0, .0022], [CT.fire2, CT.fire3, 3, LAG44, .0034]]) {
      const n = Math.floor((s1 - s0) * CW.rate);
      for (let j = 0; j <= n; j++) {
        const tk = s0 + j / CW.rate, Am = aimAt(tk, k, lag), jj = j + k * 1000;
        const walk = .005 * Math.exp(-(tk - s0) / .5), wx = .0012 * M3.noise(tk * 1.7, 3.3 + k), wy = .0012 * M3.noise(tk * 1.9, 8.1 + k);
        const u = V.norm(V.cross(Am.D, [0, 1, 0])), vv = V.cross(u, Am.D);
        const ex = gH(jj, 41) * sprd + wx, ey = gH(jj, 43) * sprd + wy - walk;
        const D = V.norm([Am.D[0] + u[0] * ex + vv[0] * ey, Am.D[1] + u[1] * ex + vv[1] * ey, Am.D[2] + u[2] * ex + vv[2] * ey]);
        const M = X.ap(PH.shipX(tk), Am.M);
        const yAt = a => M[1] + D[1] * TRL * (1 - Math.exp(-CW.kd * a)) - G2 * a * a;
        let lo = 0, hi = 9; for (let it = 0; it < 36; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
        // about half the rounds that reach TRK 43 end there (strikes); the rest fly on into the sea
        const hitA = k === 2 && tk + Am.tf <= S43 + .05 && hsh(jj, 9) < .5 ? Am.tf : 99;
        out.push({ tk, M, D, aw: Math.min(lo, 7), end: Math.min(lo, hitA), wet: hitA > lo, rn: hsh(jj, 5) });
      }
    }
    return out;
  })();
  function drawTracers(S, k, rate) {
    if (S < CT.fire0 || S > CT.fire3 + 8) return;
    const tl = .0038 * E.clamp(rate, .14, 1);
    for (let i = 0; i < TRC.length; i++) {
      const r = TRC[i], a = S - r.tk; if (a < 0) break;
      if (a < r.end) {
        const ex = Math.exp(-CW.kd * a), h = TRL * (1 - ex), v = CW.v0 * ex;
        const x = r.M[0] + r.D[0] * h, y = r.M[1] + r.D[1] * h - G2 * a * a, z = r.M[2] + r.D[2] * h;
        // the tracer burns out after ~3 s; the round flies on unseen
        const vx = r.D[0] * v, vy = r.D[1] * v - 9.81 * a, vz = r.D[2] * v, al = k * (.8 + .2 * r.rn) * (1 - ss(r.end - .25, r.end, a) * (r.wet ? 0 : .7)) * (1 - ss(2.2, 3.1, a));
        if (al < .01) continue;
        const hot = a < .06 ? 1 - a / .06 : 0;
        if (P3(x, y, z) && !occ(q.x, q.y, q.z)) {
          put(q.x, q.y, q.z < 1500 ? 2 : 1, 236 + 19 * hot, 255, 190 + 60 * hot, al);
          if (q.z < 1200) DW.add(q.x, q.y, 4, LIME[0], LIME[1], LIME[2], .07 * al);
        }
        for (let m = 1; m <= 6; m++) { const d = tl * m; if (P3(x - vx * d, y - vy * d, z - vz * d) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 1500 ? 2 : 1, LIME[0], LIME[1], LIME[2], al * (1 - m * .13)); }
      } else if (r.wet && a < r.aw + .9) {
        const w = a - r.aw, h = TRL * (1 - Math.exp(-CW.kd * r.aw)), x = r.M[0] + r.D[0] * h + VW[0] * w, z = r.M[2] + r.D[2] * h + VW[2] * w, al = k * .7 * (1 - w / .9);
        for (let m = 0; m < 3; m++) { const vs = 2.5 + m * 2 + r.rn * 2, yy = vs * w - G2 * w * w; if (yy > 0 && P3(x + (m - 1) * .3, yy, z) && !occ(q.x, q.y, q.z)) put(q.x, q.y, 1, WH[0], WH[1], WH[2], al); }
      }
    }
  }
  /* the muzzle: a flickering white point and a short flame while it fires; gun smoke streaming aft */
  const STN = { ciwsYaw: [0, REST_Y], ciwsPitch: [REST_P, REST_P] };
  function drawMuzzle(S, SW, k) {
    const c = ciwsState(S); STN.ciwsYaw[MI] = c.yaw; STN.ciwsPitch[MI] = c.pitch;
    const Mz = X.ap(SW, DA.ciws(STN, MI)), Dz = DA.ciwsDir(STN, MI);
    if (c.fire) {
      const fr = Math.floor(S * 75), f = hsh(fr, 3);
      for (let j = 0; j < 16; j++) {
        const s = 2.2 * Math.pow(hsh(j, fr + 7), 1.5), rr = .18 * s;
        if (P3(Mz[0] + Dz[0] * s + GT[(j * 3 + fr) & GM] * rr, Mz[1] + Dz[1] * s + GT[(j * 3 + fr + 1) & GM] * rr, Mz[2] + Dz[2] * s + GT[(j * 3 + fr + 2) & GM] * rr) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 300 ? 2 : 1, 255, 236, 196, k * (1 - s / 2.4));
      }
      if (P3(Mz[0], Mz[1], Mz[2])) {
        put(q.x, q.y, q.z < 800 ? 3 : 2, 255, 244, 222, k * (.65 + .35 * f));
        mglow(q.x, q.y, Math.min(46, 3 + 3600 / q.z), 255, 196, 140, .5 * k * (.55 + .45 * f), q.z);
      }
    }
    for (let j = 0; j < 110; j++) {
      const tb = Math.floor(S * 30) / 30 - j / 30; if (tb < CT.fire0 || tb > CT.fire3 || (tb > CT.fire1 && tb < CT.fire2)) continue;
      const a = S - tb, r = .3 + 1.3 * Math.sqrt(a), g0 = (j * 3 + Math.floor(tb * 30) * 7) & GM;
      if (P3(Mz[0] + Dz[0] * 1.2 + AIR[0] * a + GT[g0] * r, Mz[1] + .7 * a + GT[(g0 + 1) & GM] * r * .5, Mz[2] + Dz[2] * 1.2 + AIR[2] * a + GT[(g0 + 2) & GM] * r) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 500 ? 2 : 1, GREY[0], GREY[1], GREY[2], k * .38 * (1 - a / 3.4));
    }
  }

  /* ================= the hit: TRK 44 on the port face of the hangar block ================= */
  const HL = PH.HIT_L, HR = PH.HIT_W, OUT = [-1, 0, 0], FWD = [0, 0, 1];
  const xFace = y => -8.45 + .0473 * (y - 9);                   // the face leans in 2.7° (tumblehome)
  const heatCol = (() => {
    const HOT = [255, 255, 248], LW = [222, 246, 150], FIRE = [255, 196, 138];
    const CC = [0, 0, 0];
    const f = (heat, skin) => {
      if (heat > .52) {
        const u = (heat - .52) / .48, l = skin * skin * .9 * (.35 + .65 * u);
        CC[0] = HOT[0] + (LW[0] - HOT[0]) * l; CC[1] = HOT[1] + (LW[1] - HOT[1]) * l; CC[2] = HOT[2] + (LW[2] - HOT[2]) * l;
        if (u < .45) { const w = (1 - u / .45) * .7; CC[0] += (FIRE[0] - CC[0]) * w; CC[1] += (FIRE[1] - CC[1]) * w; CC[2] += (FIRE[2] - CC[2]) * w; }
        return .9 + .5 * u;
      }
      if (heat > .16) { const u = (heat - .16) / .36; CC[0] = GREY[0] + (FIRE[0] - GREY[0]) * u; CC[1] = GREY[1] + (FIRE[1] - GREY[1]) * u; CC[2] = GREY[2] + (FIRE[2] - GREY[2]) * u; return .34 + .56 * u; }
      CC[0] = GREY[0]; CC[1] = GREY[1]; CC[2] = GREY[2]; return .2 + .2 * (heat / .16);
    };
    f.C = CC; return f;
  })();
  const HCC = heatCol.C;
  /* the fireball: lobes rolling out of the face (never into her), in random order so a frame draws a prefix sized
     to its screen area */
  const BL = (() => {
    const r = rng(9501), n = 12000, NLB = 11, a = new Float32Array(n * 5), LB = [];
    for (let l = 0; l < NLB; l++) {
      const th = (r() - .5) * 2.8, el = r() * 1.35 - .25, d = l ? .3 + .4 * r() : 0;
      LB.push([Math.cos(el) * Math.cos(th) * d + .14, Math.sin(el) * d * .9 + .06, Math.cos(el) * Math.sin(th) * d * 1.25, l ? .36 + .3 * r() : .64]);
    }
    for (let i = 0; i < n; i++) {
      const L = LB[i % NLB], u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = Math.pow(r(), .38);
      let x = L[0] + s * Math.cos(th) * rr * L[3];
      const y = L[1] + u * rr * L[3] * .85, z = L[2] + s * Math.sin(th) * rr * L[3];
      if (x < 0) x = -x * .4;
      a[i * 5] = x; a[i * 5 + 1] = y; a[i * 5 + 2] = z; a[i * 5 + 3] = Math.min(1, rr * .8 + .32 * Math.hypot(L[0], L[1], L[2])); a[i * 5 + 4] = r();
    }
    return { n, a };
  })();
  /* the blast venting up through the hangar roof: a narrow jet rolling over at the top */
  const JT = (() => {
    const r = rng(9507), n = 3600, a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = Math.pow(r(), .75); a[i * 4 + 1] = gH(i, 71); a[i * 4 + 2] = gH(i, 73); a[i * 4 + 3] = r(); }
    return { n, a };
  })();
  const VENT_L = [-5.4, 13.3, -42.2], VENT = V.add(HR, V.sub(VENT_L, HL));
  const BCC = [0, 0, 0];
  function bloomC(t) {
    const vent = 7 * (1 - Math.exp(-t * 5)), up = 5.5 * t + 4 * (1 - Math.exp(-t * 3)), dr = t - .8 * (1 - Math.exp(-t / .8));
    BCC[0] = HR[0] + OUT[0] * vent + AIR[0] * dr; BCC[1] = HR[1] + up; BCC[2] = HR[2] + AIR[2] * dr;
    return 22 * (1 - Math.exp(-t * 7)) + 3.5 * t;
  }
  const HITV = { ok: false, x: 0, y: 0, r: 0, t: 0, vis: 1, jx: 0, jy: 0, jok: false };
  const VDIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [.6, .6, .5], [-.6, .6, -.5], [.6, .6, -.5], [-.6, .6, .5], [0, .3, 0], [0, 0, 0]];
  function drawBloom(a, G) {
    const t = a - .006; if (t < 0 || t > 5.4) return;
    const Rb = bloomC(t), cx = BCC[0], cy = BCC[1], cz = BCC[2], cam = DW.cam;
    const zc = (cx - cam.eye[0]) * cam.f[0] + (cy - cam.eye[1]) * cam.f[1] + (cz - cam.eye[2]) * cam.f[2]; if (zc < -Rb) return;
    const Rpx = Math.min(2000, Rb * cam.fl / Math.max(1, zc)), N = Math.min(BL.n, Math.max(2400, Math.round(Math.PI * Rpx * Rpx / 15)));
    const fade = G * (1 - ss(3, 5.4, t)), thin = .4 * ss(1.4, 4, t), B = BL.a;
    for (let i = 0; i < N; i++) {
      const o = i * 5, rn = B[o + 4]; if (rn < thin) continue;
      const lx = B[o], ly = B[o + 1], lz = B[o + 2], rr = B[o + 3];
      const y = cy + ly * Rb; if (y < .2) continue;
      if (!P3(cx + (OUT[0] * lx + FWD[0] * lz) * Rb, y, cz + (OUT[2] * lx + FWD[2] * lz) * Rb) || occ(q.x, q.y, q.z)) continue;
      const heat = Math.exp(-t * (.34 + 1.15 * rr) * (.7 + .6 * ((rn * 7.31) % 1)));
      const al = heatCol(heat, rr), b = fade * al * (heat > .52 ? .6 + .7 * rn : .3 + 1 * rn * rn);
      put(q.x, q.y, q.z < 60 ? 3 : q.z < 1600 && (heat > .4 || rn > .7) ? 2 : 1, HCC[0], HCC[1], HCC[2], b > 1 ? 1 : b);
    }
    // the jet up through the roof: fast, narrow, rolling over at the top and laid aft by the air
    const H = 30 * (1 - Math.exp(-t * 2.4)) + 2 * t, J = JT.a, NJ = Math.min(JT.n, Math.max(1100, Math.round(N * .35)));
    const d2 = t - .6 * (1 - Math.exp(-t / .6)), jf = G * (1 - ss(2, 4.2, t)) * sat((t - .01) / .03);
    if (jf > .01) for (let i = 0; i < NJ; i++) {
      const o = i * 4, s = J[o], rn = J[o + 3]; if (rn < thin) continue;
      const hs = s * H, rad = .7 + 5.5 * s * s * (1 - Math.exp(-t * 2.5)) + 1.1 * t;
      const y = VENT[1] + hs + J[o + 2] * rad * .35;
      if (!P3(VENT[0] + J[o + 1] * rad + AIR[0] * d2 * s, y, VENT[2] + J[o + 2] * rad * .8 + AIR[2] * d2 * s) || occ(q.x, q.y, q.z)) continue;
      const heat = Math.exp(-t * (.8 + 1.8 * s) * (.75 + .5 * rn));
      const al = heatCol(heat, s * .85), b = jf * al * (heat > .52 ? .55 + .7 * rn : .3 + .9 * rn * rn);
      put(q.x, q.y, q.z < 60 ? 3 : q.z < 1600 && heat > .4 ? 2 : 1, HCC[0], HCC[1], HCC[2], b > 1 ? 1 : b);
    }
    // the hot heart of it, held back where she stands in front; how much of it the lens can see
    HITV.ok = false;
    if (P3(cx, cy, cz)) {
      const x = q.x, y = q.y, z = q.z;
      let vis = 0;
      for (const d of VDIR) { if (P3(cx + d[0] * Rb * .6, cy + d[1] * Rb * .6, cz + d[2] * Rb * .6) && !occ(q.x, q.y, q.z)) vis++; }
      HITV.vis = vis / VDIR.length;
      mglow(x, y, Math.min(170, .55 * Rpx + 10), 255, 246, 226, .6 * Math.exp(-t * 3.2) * G, z);
      // its light on the air round her: wide and soft, held back where she stands in front
      const lw = (.16 * Math.exp(-t * 1.5) + .2 * Math.exp(-t * 10)) * (1 - ss(1, 2, t)) * G;
      if (lw > .02) mglow(x, y, Math.min(230, 1.3 * Rpx + 50), 255, 206, 160, lw, z);
      HITV.ok = true; HITV.x = x; HITV.y = y; HITV.r = Rpx; HITV.t = t;
    }
    HITV.jok = false;
    if (t < 1.5 && P3(VENT[0], VENT[1] + H * .45, VENT[2]) && !occ(q.x, q.y, q.z)) { HITV.jok = true; HITV.jx = q.x; HITV.jy = q.y; }
  }
  /* the impact itself, before the bloom: a lime-white star on the plating */
  function drawImpact(a, G) {
    if (a < 0 || a > .14) return;
    if (!P3(HR[0], HR[1], HR[2])) return;
    const z = q.z, x = q.x, y = q.y, sc = E.clamp(260 / z, .35, 3);
    // the flash lights the air round her for an instant; she stands dark against it
    mglow(x, y, Math.min(250, (80 + 1500 * a) * sc), 236, 255, 206, .5 * Math.exp(-a * 26) * G, z);
    if (a > .014) return;
    const w = 1 - a / .014;
    if (!occ(x, y, z)) put(x, y, 5, 255, 255, 250, G);
    mglow(x, y, Math.min(150, 10 + 11000 / z), LIME[0], LIME[1], LIME[2], .45 * G * w, z);
    mglow(x, y, Math.min(60, 4 + 3600 / z), 255, 255, 240, .95 * G, z);
  }
  /* fragments: specks and burning brands out of the face, splashes where they land; sparks */
  const DEB = (() => {
    const r = rng(9503), n = 640, a = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      // most go out to port; a quarter are thrown high over her
      let dx = .3 + r(), dy = -.2 + 1.3 * r(), dz = (r() - .5) * 1.7;
      if (i % 4 === 0) { dx = .15 + .4 * r(); dy = 1 + r(); }
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const sp = 12 + 150 * Math.pow(r(), 2.8), k = .3 + 1.4 * r();
      const vx = OUT[0] * dx * sp, vy = dy * sp, vz = dz * sp;
      const yAt = t => HR[1] + vy * (1 - Math.exp(-k * t)) / k - G2 * t * t;
      let lo = .01, hi = 14; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > 0) lo = m; else hi = m; }
      a.set([vx, vy, vz, k, r(), i % 4 === 1 ? 1 : 0, lo], i * 7);
    }
    return { n, a };
  })();
  const SPK = (() => {
    const r = rng(9504), n = 240, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      let dx = .15 + r(), dy = -.3 + 1.6 * r(), dz = (r() - .5) * 2.2; const l = Math.hypot(dx, dy, dz), sp = 70 + 190 * r();
      a.set([OUT[0] * dx / l * sp, dy / l * sp, dz / l * sp, 2.5 + 2.5 * r(), .2 + .5 * r()], i * 5);
    }
    return { n, a };
  })();
  const FP = [0, 0, 0];
  function frag(vx, vy, vz, k, t, o) {
    const e = (1 - Math.exp(-k * t)) / k;
    FP[0] = o[0] + AIR[0] * t + (vx - AIR[0]) * e; FP[1] = o[1] + vy * e - G2 * t * t; FP[2] = o[2] + AIR[2] * t + (vz - AIR[2]) * e;
    return FP;
  }
  function drawDebris(a, G) {
    const t = a - .008; if (t < 0 || t > 10) return;
    const D = DEB.a;
    for (let i = 0; i < DEB.n; i++) {
      const o = i * 7, vx = D[o], vy = D[o + 1], vz = D[o + 2], k = D[o + 3], rn = D[o + 4], brand = D[o + 5], tl = D[o + 6];
      if (t < tl) {
        const hot = Math.exp(-t * 1.6);
        if (brand) for (let m = 1; m < 14; m++) {
          const t2 = t - m * .03; if (t2 < 0) break;
          const p = frag(vx, vy, vz, k, t2, HR), u = m / 14;
          if (P3(p[0], p[1] + m * .12, p[2]) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 400 && m < 5 ? 2 : 1, 255 - 50 * u, 196 + 18 * u, 140 + 66 * u, G * .85 * (1 - u) * (1 - .5 * t / tl));
        }
        const p = frag(vx, vy, vz, k, t, HR);
        if (!P3(p[0], p[1], p[2]) || occ(q.x, q.y, q.z)) continue;
        const b = G * (brand ? 1 : .5 + .45 * rn) * (.55 + .45 * hot);
        put(q.x, q.y, q.z < 900 && (brand || rn > .6) ? 2 : 1, 255, brand ? 214 : 236 + 19 * hot, brand ? 160 : 222 + 30 * hot, b > 1 ? 1 : b);
      } else if (t < tl + 1.2) {
        const w = t - tl, p = frag(vx, vy, vz, k, tl, HR), x = p[0] + VW[0] * w, z = p[2] + VW[2] * w, al = G * .75 * (1 - w / 1.2);
        // pieces that come down on her own deck don't splash
        if (Math.abs(x) < PH.hW(z) + .5) continue;
        for (let m = 0; m < 4; m++) {
          const vs = 3 + m * 2.3 + rn * 3, yy = vs * w - G2 * w * w; if (yy < 0) continue;
          if (P3(x + GT[(i * 4 + m) & GM] * .5 * (1 + w), yy, z + GT[(i * 4 + m + 1) & GM] * .5 * (1 + w)) && !occ(q.x, q.y, q.z)) put(q.x, q.y, q.z < 700 ? 2 : 1, WH[0], WH[1], WH[2], al);
        }
      }
    }
    if (t < 1.1) {
      const S_ = SPK.a;
      for (let i = 0; i < SPK.n; i++) {
        const o = i * 5, life = S_[o + 4]; if (t > life) continue;
        const k = S_[o + 3], w = 1 - t / life;
        for (let m = 0; m < 5; m++) {
          const t2 = Math.max(0, t - m * .01), p = frag(S_[o], S_[o + 1], S_[o + 2], k, t2, HR);
          if (!P3(p[0], p[1], p[2]) || occ(q.x, q.y, q.z)) continue;
          const hw = Math.min(1, 1.4 * w) * (1 - m * .17);
          put(q.x, q.y, q.z < 600 && m < 2 ? 2 : 1, 255, 190 + 65 * w, 130 + 110 * w * w, G * hw);
        }
      }
    }
  }

  /* ================= the damage: the hole, fires, smoke ================= */
  const HC = [xFace(HL[1]) - .15, HL[1], HL[2]], HOLE_R = 2.3, T_SHUT = 140.5;
  const holeR = S => HOLE_R * sat((S - S_HIT) / .016);
  /* the burnt fringe round the hole and the scorch on the face, from the hangar block's own dots */
  const HOLE = (() => {
    const cl = SHIP.ASM.hangarBlk.cl, P0 = cl.lv[0], P1 = cl.lv[1], rim = [], sc = [];
    for (let i = 0; i < P0.length; i += 6) {
      if (P0[i + 3] > -.8) continue;
      const dy = P0[i + 1] - HC[1], dz = P0[i + 2] - HC[2], d = Math.hypot(dy, dz), th = Math.atan2(dy, dz);
      const w = .25 + .45 * (.5 + .5 * M3.noise(Math.cos(th) * 1.6 + 3, Math.sin(th) * 1.6, 1.3));
      if (d > HOLE_R && d < HOLE_R + w) rim.push(P0[i], P0[i + 1], P0[i + 2], hsh(i, 61), (d - HOLE_R) / w);
    }
    for (let i = 0; i < P1.length; i += 6) {
      if (P1[i + 3] > -.8) continue;
      const dy = P1[i + 1] - HC[1], dz = P1[i + 2] - HC[2], d = Math.hypot(dy, dz), th = Math.atan2(dy, dz);
      const reach = 2.9 * (1 + .3 * M3.noise(Math.cos(th) * 1.4 + 7, Math.sin(th) * 1.4, 2.1));
      let w = d > HOLE_R && d < HOLE_R + reach ? Math.pow(1 - (d - HOLE_R) / reach, 1.4) : 0;
      // soot streaked up the face and aft (the air lays the smoke along her)
      if (dy > 0) { const lz = dz + dy * .55, half = 1.6 + .35 * dy; if (Math.abs(lz) < half) w = Math.max(w, .6 * (1 - Math.abs(lz) / half) * (1 - dy / 5)); }
      if (w > .05 && d > HOLE_R) sc.push(P1[i], P1[i + 1], P1[i + 2], w);
    }
    return { rim: new Float32Array(rim), sc: new Float32Array(sc), sp: cl.sp[1] };
  })();
  /* fire sites in the hangar block's frame: [x, y, z, ignition (s after the hit), strength, kind] (kind 1: on the
     face, flames spread outboard; 2: inside the hangar, seen only through the hole; 0: on a deck or the roof) */
  const FS = (() => {
    const r = rng(9505), s = [];
    // licking out of the hole's upper edge
    for (let k = 0; k < 5; k++) { const th = (.18 + .64 * k / 4 + (r() - .5) * .1) * Math.PI, y = HC[1] + 2.05 * Math.sin(th), z = HC[2] + 2.05 * Math.cos(th); s.push([xFace(y) - .12, y, z, .04 + .3 * r(), 1.05 + .45 * r(), 1]); }
    // burning inside the hangar
    for (let k = 0; k < 4; k++) s.push([-7.6 + 1.3 * r(), 7.8 + 1.1 * r(), HC[2] + (r() - .5) * 2.6, .1 + .3 * r(), 1.25, 2]);
    // low on the sides of the hole and down the face
    for (let k = 0; k < 2; k++) { const th = (1.12 + .76 * k + (r() - .5) * .16) * Math.PI, y = HC[1] + 2.1 * Math.sin(th), z = HC[2] + 2.1 * Math.cos(th); s.push([xFace(y) - .12, y, z, .3 + .5 * r(), .55, 1]); }
    for (let k = 0; k < 3; k++) { const y = 6.3 + 1.1 * r(), z = HC[2] + (r() - .5) * 9; s.push([xFace(y) - .12, y, z, 1 + 2.5 * r(), .45 + .3 * r(), 1]); }
    // spilt fuel burning on the side deck
    for (let k = 0; k < 3; k++) s.push([-8.8 - .2 * r(), 5.98, HC[2] + (r() - .6) * 8, 1.5 + 3 * r(), .45 + .3 * r(), 0]);
    // through the roof where the blast vented
    for (let k = 0; k < 4; k++) s.push([VENT_L[0] + (r() - .5) * 2.4, 13.25, VENT_L[2] + (r() - .5) * 3.4, .5 + 1.6 * r(), .7 + .4 * r(), 0]);
    return s;
  })();
  const NMAIN = 9;
  /* one soft light per burning zone (the hole, the roof, the side deck): [x, y, z, strength] */
  const FCL = [[HC[0] - .6, HC[1] + .9, HC[2], 1], [VENT_L[0], 14.2, VENT_L[2], .7], [-8.9, 6.8, HC[2] - 1, .45]];
  /* the fire's strength over the film: it takes hold, burns through the scan and the exploded view, dies down as
     she steams on */
  const fireEnv = T => 1 - ss(111, 133, T);
  const HR2 = (HOLE_R - .15) * (HOLE_R - .15);
  function drawFires(T, S, a, W, G) {
    const env = G * fireEnv(T); if (env <= .01 || a < .03) return;
    const M = W.R, t0 = W.T, fr = Math.floor(S * 22);
    for (let i = 0; i < FS.length; i++) {
      const f = FS[i], I = env * sat((a - f[3]) / 1.2) * (.8 + .2 * Math.sin(S * 1.7 + i));
      if (I <= .02) continue;
      const st = f[4], kind = f[5], hmax = (1.5 + 4 * st) * (.55 + .45 * env), wd = .5 + .7 * st, n = st > .9 ? 18 : 10;
      for (let m = 0; m < n; m++) {
        const u = hsh(i * 11 + m, fr + i * 31), v = hsh(i * 11 + m + 101, fr), w = hsh(i * 13 + m, fr + 7);
        // a tongue: narrowing as it rises, laid aft by the air she steams through
        const vv = Math.pow(v, 1.5), hy = vv * hmax, lean = hy * (.5 + .6 * vv), nar = 1 - .65 * vv;
        const lx = f[0] + (kind === 1 ? -(.06 + .5 * u * nar) : (u - .5) * (kind === 2 ? .6 : wd * nar)), ly = f[1] + hy, lz = f[2] + (w - .5) * wd * nar + AIRN[2] * lean;
        if (kind === 2) { const dy = ly - HC[1], dz = lz - HC[2]; if (dy * dy + dz * dz > HR2) continue; }
        const px = lx + AIRN[0] * lean;
        if (!P3(M[0] * px + M[1] * ly + M[2] * lz + t0[0], M[3] * px + M[4] * ly + M[5] * lz + t0[1], M[6] * px + M[7] * ly + M[8] * lz + t0[2]) || occ(q.x, q.y, q.z)) continue;
        // white-yellow at the root, orange, a coral tip
        let cg, cb;
        if (vv < .35) { const k = vv / .35; cg = 246 - 70 * k; cb = 214 - 120 * k; } else { const k = (vv - .35) / .65; cg = 176 - 70 * k; cb = 94 - 33 * k; }
        const b = I * Math.min(1.2, st) * (1.25 - .75 * vv) * (.75 + .3 * u);
        put(q.x, q.y, q.z < 1800 && vv < .6 ? 2 : 1, 255, cg, cb, b > 1 ? 1 : b);
      }
    }
    for (let c = 0; c < FCL.length; c++) {
      const L = FCL[c];
      if (!P3(M[0] * L[0] + M[1] * L[1] + M[2] * L[2] + t0[0], M[3] * L[0] + M[4] * L[1] + M[5] * L[2] + t0[1], M[6] * L[0] + M[7] * L[1] + M[8] * L[2] + t0[2])) continue;
      const fl = .8 + .2 * hsh(fr, c * 97 + 5);
      mglow(q.x, q.y, Math.min(44, 3 + 2600 * L[3] / q.z), 255, 160, 96, .15 * env * L[3] * fl * sat(a / 1.5), q.z);
    }
    // embers: rising from the main fires, carried off aft
    for (let j = 0; j < 110; j++) {
      const f = FS[j % NMAIN], P = 1.1 + 1.4 * hsh(j, 3), ph = hsh(j, 5) * P, c = Math.floor((a + ph) / P), tt = a + ph - c * P;
      if (a - tt < f[3] + .5) continue;
      const u = hsh(j, c), up = (3 + 5 * u) * tt, dr = tt * .7;
      const fx = M[0] * f[0] + M[1] * f[1] + M[2] * f[2] + t0[0], fy = M[3] * f[0] + M[4] * f[1] + M[5] * f[2] + t0[1], fz = M[6] * f[0] + M[7] * f[1] + M[8] * f[2] + t0[2];
      if (!P3(fx - .5 + GT[(j * 3 + c) & GM] * .6 + AIR[0] * dr, fy + 1 + up, fz + GT[(j * 3 + c + 1) & GM] * .8 + AIR[2] * dr) || occ(q.x, q.y, q.z)) continue;
      const b = env * f[4] * (1 - tt / P) * .9;
      put(q.x, q.y, 1, 255, 206, 150, b > 1 ? 1 : b);
    }
  }
  /* the hole: a burning fringe (embers, cooling to a dull coral) and the scorch round it (the face's dots dimmed
     toward the dark); in the scan the damaged steel reads coral */
  function drawHole(T, S, a, W, xr) {
    if (a < .01 || T >= T_SHUT) return;
    const cam = DW.cam, x = SHIP.prep(W), F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
    const fr = Math.floor(S * 20), glowK = Math.exp(-a / 14) * .7 + .3 * fireEnv(T), cool = 1 - ss(132, 139.5, T);
    // the scorch
    const SC = HOLE.sc, grow = sat(a / 1.5) * cool;
    for (let i = 0; i < SC.length; i += 4) {
      const px = SC[i], py = SC[i + 1], pz = SC[i + 2], zc = x[6] * px + x[7] * py + x[8] * pz + x[11]; if (zc < 1) continue;
      const sx = cx + F * (x[0] * px + x[1] * py + x[2] * pz + x[9]) / zc, sy = cy - F * (x[3] * px + x[4] * py + x[5] * pz + x[10]) / zc;
      if (sx < 2 || sy < 2 || sx > 1916 || sy > 1076 || occ(sx, sy, zc)) continue;
      const w = SC[i + 3], s = HOLE.sp * F / zc, sz = s < 1.6 ? 1 : s < 2.6 ? 2 : 3;
      if (xr > 0 && hsh(i, 77) < w * .8) put(sx, sy, sz > 2 ? 2 : sz, CORAL[0], CORAL[1], CORAL[2], xr * (.35 + .45 * w));
      dset(sx, sy, sz, BG, grow * Math.min(.85, w * 1.1) * (1 - xr * .6));
    }
    // the fringe
    const RM = HOLE.rim;
    for (let i = 0; i < RM.length; i += 5) {
      const px = RM[i], py = RM[i + 1], pz = RM[i + 2], zc = x[6] * px + x[7] * py + x[8] * pz + x[11]; if (zc < 1) continue;
      const sx = cx + F * (x[0] * px + x[1] * py + x[2] * pz + x[9]) / zc, sy = cy - F * (x[3] * px + x[4] * py + x[5] * pz + x[10]) / zc;
      if (sx < 2 || sy < 2 || sx > 1916 || sy > 1076 || occ(sx, sy, zc)) continue;
      const f = hsh(i, fr), ed = RM[i + 4], hot = glowK * (1 - .6 * ed) * (.55 + .45 * f);
      const sz = zc < 160 ? 2 : 1;
      const b = cool * Math.max(.18 + .2 * RM[i + 3], hot);
      put(sx, sy, sz, 255, 120 + 90 * hot, 70 + 50 * hot, b > 1 ? 1 : b);
      if (xr > 0 && RM[i + 3] < .6 - .5 * ed) put(sx, sy, 1, CORAL[0], CORAL[1], CORAL[2], xr * (.5 + .4 * f));
    }
  }
  /* the smoke column: dots born at the hole and at the roof vent (following the hangar block when it leaves in the
     exploded view), rising, spreading and laid aft by the air she steams through; heavy at first, thinning as the
     fires die, every dot gone by PH.T_CLEAN */
  const SMK = (() => {
    const G_END = SIM(T_CLEAN) - S_HIT - .6, envS = g => sat(g / 1.2) * (1 - ss(41, 62, g));
    const rate = g => 1500 * Math.exp(-g / 1.1) + 260 * envS(g);
    const births = []; let acc = 0, g = 0;
    const dg = .002; while (g < 64) { acc += rate(g) * dg; while (acc >= 1) { births.push(g + dg * (1 - acc)); acc -= 1; } g += dg; }
    const n = births.length, b = new Float32Array(n), o = new Float32Array(n * 5), src = new Float32Array(n * 3), life = new Float32Array(n);
    const offs = SHIP.ASM.hangarBlk.off, w0 = SHIP.ASM.hangarBlk.w0, dTS = PH.filmOf(S_HIT + 10) - (S_HIT + 10);
    const SRC = [[HC[0] - 1.4, HC[1] + .8, HC[2]], [VENT_L[0], VENT_L[1] + .4, VENT_L[2]]];
    for (let i = 0; i < n; i++) {
      b[i] = births[i];
      const pf = i >> 4, sb = S_HIT + b[i], Tb = b[i] < 4 ? PH.filmOf(sb) : sb + dTS, xk = SHIP.explodeK(w0, Tb), which = hsh(pf, 29) < .62 ? 0 : 1, sp = SRC[which];
      src[i * 3] = sp[0] + offs[0] * xk; src[i * 3 + 1] = sp[1] + offs[1] * xk; src[i * 3 + 2] = sp[2] + offs[2] * xk;
      o[i * 5] = GT[(pf * 3) & GM] * .6 + GT[(i * 3 + 11) & GM] * .3; o[i * 5 + 1] = GT[(pf * 3 + 1) & GM] * .3 + GT[(i * 3 + 12) & GM] * .25;
      o[i * 5 + 2] = GT[(pf * 3 + 2) & GM] * .6 + GT[(i * 3 + 13) & GM] * .3; o[i * 5 + 3] = hsh(i, 23); o[i * 5 + 4] = hsh(pf, 31);
      life[i] = Math.min(24, G_END - b[i]);
    }
    return { n, b, o, src, life, L: 24 };
  })();
  const smIdx = g => { const B = SMK.b; let lo = 0, hi = SMK.n; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < g) lo = m + 1; else hi = m; } return lo; };
  const smH = g => 18 * (1 - Math.exp(-g / 2.6)) + 1.1 * g, smR = g => 1.8 + 1.55 * g, smD = g => g - 1.2 * (1 - Math.exp(-g / 1.2));
  const LMs = DW.LM, FIREC = [255, 190, 130];
  function drawSmoke(a, G) {
    if (a < .1 || G <= .01) return;
    const Ob = SMK.o, B = SMK.b, SR = SMK.src, LF = SMK.life, i0 = smIdx(a - SMK.L), i1 = smIdx(a);
    for (let i = i0; i < i1; i++) {
      const g = a - B[i], lf = LF[i]; if (g > lf) continue;
      const o = i * 5, h = smH(g), r = smR(g) + (B[i] < 2 ? 5 * (1 - Math.exp(-g * 2)) : 0), d = smD(g);
      const ox = Ob[o] * r, oy = Ob[o + 1] * r, oz = Ob[o + 2] * r;
      const y = SR[i * 3 + 1] + h + oy; if (y < .5) continue;
      if (!P3(SR[i * 3] + AIR[0] * d + ox, y, SR[i * 3 + 2] + AIR[2] * d + oz) || occ(q.x, q.y, q.z)) continue;
      const side = E.clamp((ox * LMs[0] + oz * LMs[2]) / r, -1, 1);
      let b = (.3 + .14 * side + .16 * Ob[o + 3]) * sat(g / .5) * (1 - ss(lf - 8, lf, g)) / (1 + g * .045) * G;
      let cr = GREY[0], cg = GREY[1], cb = GREY[2];
      // the low part of the column is lit from under by the fires
      const w = (Math.exp(-g * 1.2) * .8 + .35 * Math.exp(-h / 14)) * (B[i] < 50 ? 1 : .5);
      cr += (FIREC[0] - cr) * w; cg += (FIREC[1] - cg) * w; cb += (FIREC[2] - cb) * w;
      if (g < 1.6 && B[i] < 3) b = Math.max(b, .55 * (1 - g / 1.6) * G);
      if (b < .015) continue;
      put(q.x, q.y, q.z < 1800 && g < 12 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }

  /* ================= hooks ================= */
  let LAST_T = -1;
  PH.fx = {
    launchFx(T, ctx) {
      LAST_T = T;
      if (T < 26 || T > 100) return;
      const S = ctx.S;
      for (const tr of TR) {
        if (S < tr.m.sL - .1) continue;
        drawLaunch(tr, S, 1); drawTrail(tr, S, 1); drawHead(tr, S, 1);
      }
    },
    interceptFx(T, ctx) {
      if (T < 44 || T > 80) return;
      const S = ctx.S;
      for (const B of BURSTS) if (B !== B43) { drawBurst(B, S, 1); drawSplashes(B, S, 1); }
    },
    ciwsFx(T, ctx) {
      const S = ctx.S; if (S < CT.fire0 - .5 || S > CT.fire3 + 12) return;
      drawMuzzle(S, ctx.SW, 1); drawTracers(S, 1, ctx.rate);
      drawBurst(B43, S, 1); drawSplashes(B43, S, 1);
    },
    hitFx(T, ctx) {
      HITV.ok = false; HITV.jok = false;
      const a = ctx.S - S_HIT; if (a < 0 || a > 11) return;
      drawDebris(a, 1); drawBloom(a, 1); drawImpact(a, 1);
    },
    damageFx(T, ctx) {
      const S = ctx.S, a = S - S_HIT; if (a < 0 || T >= T_CLEAN) return;
      const W = SHIP.asmXf(SHIP.ASM.hangarBlk, T, ctx.SW), gh = win(T, 80.4, 85, 119, 124.5);
      // the scan's coral: once the fronts have reached the hangar block, while the X-ray has her
      const xr = SHIP.XS.on ? ss(0, .6, T - T_STRIKE - RT_HGR) * (1 - ss(121, 124, T)) : 0;
      drawHole(T, S, a, W, xr);
      drawFires(T, S, a, W, 1);
      drawSmoke(a, 1 - .4 * gh);
    },
    shipStateFx(st, T) {
      const S = PH.S(T); if (S < CT.slew0 || S > CT.back1) return st;
      const c = ciwsState(S);
      st.ciwsYaw = [st.ciwsYaw[0], c.yaw]; st.ciwsPitch = [st.ciwsPitch[0], c.pitch];
      return st;
    },
    breach(T) {
      if (T < T_HIT - .01 || T >= T_SHUT) return null;
      const r = holeR(PH.S(T)); return r > .02 ? [HC[0], HC[1], HC[2], r] : null;
    },
    shake(T) {
      let s = 0;
      for (const m of ICP) { const a = T - m.tLf; if (a > 0 && a < 2.5) s += 1.6 * Math.exp(-a / .7) * sat(a / .1); }
      // the jolt of the hit, held down while the clock is slowed (the lens shakes in film time)
      const a = T - T_HIT; if (a > 0 && a < 8) s += 7 * Math.exp(-Math.max(0, T - 71.2) / 1.5) * sat(a / .12) * (.25 + .75 * sat((PH.rate(T) - .14) / .6));
      return s;
    },
    overlay(T, octx, ctx) { overlay(T, octx, ctx); },
    cues: [],
  };
  const RT_HGR = SHIP.XR.rtAt(HC[0] + .4, HC[1], HC[2]);

  /* ================= overlay: bloom on the flashes, short tags ================= */
  function bloom(octx, x, y, r, al, warm) {
    if (al <= .005 || x < -r || y < -r || x > 1920 + r || y > 1080 + r) return;
    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,248,232,${Math.min(1, al).toFixed(3)})`);
    g.addColorStop(.3, warm ? `rgba(255,176,128,${(al * .35).toFixed(3)})` : `rgba(210,244,120,${(al * .3).toFixed(3)})`);
    g.addColorStop(1, warm ? 'rgba(255,150,110,0)' : 'rgba(198,244,50,0)');
    octx.globalCompositeOperation = 'lighter'; octx.fillStyle = g; octx.fillRect(x - r, y - r, 2 * r, 2 * r); octx.globalCompositeOperation = 'source-over';
  }
  const TP = [0, 0, 0];
  function overlay(T, octx, ctx) {
    const cam = ctx.cam, S = ctx.S, tag = ctx.tag, MY = ctx.MENU_Y || 800;
    if (T > 26 && T < 70) for (const m of ICP) {
      const a = S - m.sL;
      if (a >= 0 && a < 1.4) {
        const p = cam.project([m.P0[0], m.P0[1] + 1.5, m.P0[2]]);
        if (p) bloom(octx, p[0], p[1], E.clamp(60 * cam.fl / p[2], 50, 220), (.5 * Math.exp(-a * 5) + .1 * Math.exp(-a * 1.4)), true);
      }
    }
    for (const B of BURSTS) {
      const a = S - B.t0; if (a < 0 || a > 3) continue;
      const p = cam.project(B.p); if (!p) continue;
      const big = B.big ? 1.6 : B.kind === 'destruct' ? .6 : 1;
      bloom(octx, p[0], p[1], Math.min(460, (70 + 120 * sat(a * 3)) * big * E.clamp(1100 / p[2], .55, 2.6)), (.75 * Math.exp(-a * 6) + .16 * Math.exp(-a * 1.3)) * (B.kind === 'destruct' ? .7 : 1), true);
      if (a < .5 && B.kind !== 'destruct') bloom(octx, p[0], p[1], B.big ? 520 : 300, .13 * (1 - a / .5) * (1 - a / .5), true);
      if (B.kind === 'destruct' && tag && a > .15 && a < 1.3 && p[1] < MY && p[0] > 640) {
        // gone before TRK 43's own tag comes up in the same patch of sky
        const al = sat((a - .15) / .2) * (1 - ss(1, 1.3, a));
        // below the burst: the raid's own tags stack above it
        ctx.leader(p[0], p[1], p[0] + 22, p[1] + 26, 'rgba(238,238,228,.7)', al * .7);
        tag('fxsd', 'ESSM', 'self-destruct', '', 'sm drop', p[0] + 24, p[1] + 24, al);
      }
    }
    // the Phalanx: its tag while it is on the rounds, the muzzle's flicker
    if (S > CT.slew0 + .6 && S < CT.fire3 + 1.2) {
      const c = ciwsState(S); STN.ciwsYaw[MI] = c.yaw; STN.ciwsPitch[MI] = c.pitch;
      const m = cam.project(X.ap(ctx.SW, DA.ciws(STN, MI))), p = cam.project(X.ap(ctx.SW, V.add(SHIP_CIWS, [0, 3.2, 0])));
      const al = ss(CT.slew0 + .6, CT.slew0 + 1, S) * (1 - ss(CT.fire3 + .3, CT.fire3 + 1.2, S));
      if (p && tag && p[1] < MY && p[0] > 640 && al > .02) {
        ctx.leader(p[0], p[1], p[0] - 30, p[1] - 44, 'rgba(198,244,50,.8)', .8 * al);
        const t = tag('fxciws', 'CIWS', 'Phalanx 1B · aft', c.fire ? '20 mm' : '', 'sm lime', p[0] - 30, p[1] - 64, al);
        if (t && ctx.place) ctx.place(t, p[0] - 30 - ctx.tagW(t), p[1] - 64);
      }
      if (m && c.fire) bloom(octx, m[0], m[1], E.clamp(9000 / m[2], 16, 60), .22 + .12 * hsh(Math.floor(S * 75), 9), true);
    }
    // the hit: the flash through and over her, the fireball's light
    const a = S - S_HIT;
    if (a >= 0 && a < 3) {
      // the flash itself is on her far side (its light is in the dot buffer, masked by her); only the part of the
      // fireball the lens can see blooms over the frame
      if (HITV.ok && HITV.t < 2.4) bloom(octx, HITV.x, HITV.y, Math.min(360, 1.1 * HITV.r + 40), (.16 * Math.exp(-HITV.t * 1.5) + .12 * Math.exp(-HITV.t * 10)) * (1 - ss(1.4, 2.4, HITV.t)) * HITV.vis * HITV.vis, true);
      if (HITV.jok) bloom(octx, HITV.jx, HITV.jy, 90, .18 * Math.exp(-a * 1.6), true);
    }
    // the damage: tags on the hangar block once the scan has found it, riding it through the exploded view
    if (tag && T > T_STRIKE + RT_HGR && T < 121.5) {
      const al = ss(T_STRIKE + RT_HGR + .3, T_STRIKE + RT_HGR + .8, T) * (1 - ss(120, 121.5, T)), cond = sat((T - T_STRIKE - RT_HGR - .3) / 1);
      const W = SHIP.asmXf(SHIP.ASM.hangarBlk, T, ctx.SW);
      const ph = cam.project(X.ap(W, [HC[0], HC[1] - HOLE_R - .2, HC[2]])), pf = cam.project(X.ap(W, [HC[0], HC[1] + 3.1, HC[2] - 3]));
      if (ph && al > .02 && ph[1] < MY - 60 && ph[0] > 660 && ph[0] < 1760) {
        const tx = ph[0] + 34, ty = ph[1] + 46;
        ctx.ring(ph[0], ph[1] - 8, 5, '#FF6A3D', al);
        ctx.leader(ph[0] + 4, ph[1] - 4, tx - 2, ty + 2, 'rgba(255,106,61,.85)', .85 * al);
        tag('fxdmg', 'HGR', 'damaged · port face', '', 'sm coral', tx, ty, al, cond, T);
      }
      if (pf && al > .02 && pf[1] > 120 && pf[1] < MY - 60 && pf[0] > 660 && pf[0] < 1760) {
        const tx = pf[0] - 46, ty = pf[1] - 62, fa = al * fireEnv(T);
        if (fa > .02) {
          ctx.leader(pf[0], pf[1], tx + 10, ty + 20, 'rgba(255,106,61,.85)', .85 * fa);
          const t = tag('fxfire', 'FIRE', 'hangar block', '', 'sm coral', tx, ty, fa, cond, T);
          if (t && ctx.place) ctx.place(t, tx - ctx.tagW(t) + 22, ty);
        }
      }
    }
  }
  const SHIP_CIWS = [0, 13.9, -47.5];

  /* ================= sound: fired only while playing forward in real time ================= */
  const SFX = STAGE.SFX, cues = PH.fx.cues;
  const hatch = () => { SFX.tone(170, 95, .14, 'square', .018); SFX.noise(.25, 700, .6, .02, .005); };
  const launch = () => { SFX.noise(4.8, 230, .8, .075, .12); SFX.noise(1.7, 1300, .5, .026, .04); SFX.tone(56, 36, 3.2, 'sine', .05); };
  const farBoom = () => { SFX.noise(2.2, 150, .9, .06, .03); SFX.tone(70, 34, 1.2, 'sine', .035); };
  const stopBlip = () => { SFX.tone(1240, 1240, .045, 'square', .01); SFX.tone(930, 930, .06, 'square', .008, .07); };
  const pop = () => { SFX.noise(1.1, 420, .7, .04, .01); SFX.tone(90, 50, .6, 'sine', .02); };
  const brrt = (dur, f) => { SFX.tone(75 * f, 72 * f, dur, 'sawtooth', .026); SFX.tone(150 * f, 146 * f, dur, 'square', .008); SFX.noise(dur, 2300 * f, .7, .034, .02); };
  const bigBoom = () => { SFX.noise(.3, 4200, .5, .12, .002); SFX.noise(5.5, 120, .95, .24, .02); SFX.tone(62, 22, 5, 'sine', .16); SFX.noise(4, 700, .6, .05, .5, .6); };
  const F = s => PH.filmOf(s);
  for (const m of ICP) cues.push([m.tLf - .6, hatch], [m.tLf, launch]);
  for (const B of BURSTS) if (B.kind === 'kill') cues.push([B.tf + .05, stopBlip], [B.tf + .3, farBoom]);
  cues.push([ED.tf + .12, pop]);
  cues.push([F(CT.slew0), () => SFX.tone(380, 520, 1.3, 'square', .006)]);
  cues.push([F(CT.spin0), () => { SFX.tone(160, 1500, .85, 'sawtooth', .009); SFX.tone(1500, 1450, 3.9, 'sine', .004, .85); }]);
  cues.push([F(CT.fire0), () => brrt(CT.fire1 - CT.fire0, 1)]);
  cues.push([B43.tf, () => { SFX.noise(.22, 4600, .5, .1, .002); SFX.noise(2.6, 170, .9, .16, .01); SFX.tone(110, 36, 1.4, 'sine', .08); }], [B43.tf + .05, stopBlip]);
  cues.push([F(CT.fire2), () => brrt(F(68.4) - F(CT.fire2), 1)], [68.4, () => brrt(Math.max(.1, F(CT.fire3) - 68.4), .55)]);
  cues.push([T_HIT - .35, () => SFX.tone(420, 60, .5, 'sine', .03)]);
  cues.push([T_HIT, bigBoom], [T_HIT + 2.6, () => SFX.noise(9, 1500, .4, .03, 1.5)], [T_HIT + 6, () => SFX.noise(14, 800, .5, .02, 3)]);
})();
