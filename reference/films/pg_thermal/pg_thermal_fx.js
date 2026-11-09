/* THERMAL: the fighting (stage B). Stage A calls these hooks every frame.

   Order of a frame (pg_thermal_film.js render):
     1. camera; the sensor defaults for this shot (ctx.sensor: polarity + wipe, AGC lo/hi, noise, glare 0)
     2. PG.heatFx(T, ctx)       heat on the hero and the sensor's response, BEFORE anything is drawn:
                                ctx.hot.push({ p: [x, y, z] ship coords, r: m, h: heat added at the centre })
                                  (the hull glowing round the breach, the Phalanx's barrels, a hatch's cell);
                                ctx.partHeat[ctx.PID.ciwsA] += h  (a whole part warmer);
                                ctx.sensor.lo / .hi (AGC: raise hi and the scene darkens round a very hot source),
                                ctx.sensor.glare (0..1: a veil over the frame, white in white-hot, dark in black-hot),
                                ctx.sensor.noise (per-dot noise amplitude)
     3. the palette is built from ctx.sensor
     4. the hero (writes the occlusion tiles), its exhaust, the rounds with their trails, the interceptor paths
     5. PG.launchFx, PG.interceptFx, PG.ciwsFx, PG.hitFx (T, ctx): draw here. Anything small and hot should
        ctx.occMark(x, y, depth, pad) its tiles so the sea / sky behind it is cut away (the halo that makes hot
        things read as dark in black-hot); the sea and the sky are drawn after the hooks.
     6. the sky, the sea, the wake, the grain; ctx.sensor.glare; blit
     7. PG.fxOverlay(T, octx, tags, ctx): vector overlays and DOM tags (lime = own, coral = hostile only)
   PG.shipStateFx(st, T) edits the hero's state before it is drawn (vlsOpen, ciwsSpin; ciwsYaw/Pitch are stage A's
   PG.ciwsAim; the elevating mass is drawn with DW.elevX(pitch)). PG.shakeFx(T) -> px of camera shake.
   PG.fxCues: [[filmT, fn]] sounds (STAGE.SFX), fired only while playing forward.

   ctx: { T, cam, pb, DW, st (hero state), sensor, hot, partHeat, PID, pol (0 white-hot / 1 black-hot, this frame),
          hput(x, y, size, heat, alpha)   a heat dot at screen x, y through the palette (max blend)
          hglow(x, y, R, heat, alpha)     a soft bloom (adds light in white-hot, darkens the field in black-hot)
          P3(x, y, z) -> bool, q {x, y, z}  project a world point (earth drop included)
          occMark(x, y, z, pad), put / dset (coloured overlay dots), lum(heat, pol) }
   Heat scale: ~.03 clear sky, .15-.25 sea, .36 hull, .47 over the engine rooms, .7 stack casings, 1.0-1.15 exhaust
   mouths and ramjet jets; the palette saturates at ctx.sensor.hi (per shot, .64-1.08), so a burst at 1.3 is white.

   Stage A's timeline (film seconds; world facts in pg_thermal_world.js, PG.EV):
     polarity      white-hot to 45.0, black-hot 45.0-90.5, white-hot from 90.5 (PG.POL; each switch a 0.34 s
                   top-down wipe, ctx.sensor.wipe 0..1). The launches and the far intercepts are in black-hot,
                   the Phalanx and the hit in white-hot.
     detect        the first round shows over the horizon (PG.EV.detect)
     launches      I1 66.0 (cell 6, fwd Mk 41), I2 67.6 (cell 44, aft), I3 75.6 (cell 13, fwd): PG.EV.launches.
     intercepts    I1 x round 41 at 80.0 (15.7 km out), I2 x round 42 at 83.2 (13.8 km): PG.EV.intercepts
     the miss      I3 passes ~50 m over the weaving round 44 at 89.3 (9.9 km), ends at 90.9 (PG.SHOTS[2].tEnd)
     Phalanx       aft mount trains 93.9-95.5 onto round 43; opens fire 99.1; 43 stopped ~480 m out at 101.31;
                   swings onto 44 101.42-101.78; back to stow 127.5-131.5 (the lens is close on it then)
     the hit       round 44 into the starboard quarter at PG.HIT_L = [9.45, 4.4, -57] at T_HIT = 103.4
     the lens      wide on the hero for the launches 66-74.4; the meeting points 78.6-84.6; with I3 onto the miss
                   87-91; the aft Phalanx close 93.6-97; wide, ship left, rounds from the right 99.6-103.4; closing
                   on the breach 106-118; the aft half 123; the aft Phalanx stowing 127-132; up the exhaust 137; the
                   ship leaves the frame at 141; night sky 142-150; the seam; the calm hero again from 1.0.

   What this file draws, all as heat through the imager (hot reads white in white-hot, dark in black-hot):
     launches   the cell blooms and saturates the frame (the AGC pumps), exhaust rolls over the deck and the deck
                round the cell stays warm; the head climbs on a hot point and a motor flame; puffs laid along the
                flown path are the hot plume behind the head, cooling into a warm column that drifts aft and fades
     intercepts a far bloom, a fireball of lobes cooling from the outside in, sparks, fragments that cool as they
                fall into the sea (a wisp of steam where they land), a smoke ball
     the miss   I3 flies on and ends in a small pop
     Phalanx    muzzle flash at 75 rounds/s, a stream of tracer dots (leading the round, walking onto it), gun gas,
                the barrels heating while it fires and cooling over the next half minute; round 43 bursts ~480 m out
                and its fragments rain into the sea short of the ship
     the hit    a saturating flash, a fireball rolling out of the hole and a jet of fire up past the hangar, fragments
                and sparks, fires on the flight deck and at the hangar door, the plating round the breach white-hot
                and spreading, a warm smoke column carried aft; the blast reaches the imager's ship 11.5 s later
                (a small shake); everything cools through the close-ups and is gone before the seam
   Tags: lime for own interceptors ("launch", "miss"), coral for the incoming ("stopped", "hit").
   Everything is analytic in film time and a seeded particle index: render(T) stays a pure function of T. */
(function () {
  'use strict';
  const PG = window.PG, DW = PG.DW;
  const { V, X, E } = M3;
  const { TAU, hsh, gH } = PG;
  const sat = E.sat, ss = E.ss, clamp = E.clamp, G2 = 4.905;
  const q = DW.q, P3 = DW.P3, hput = DW.hput, hglow = DW.hglow, occ = DW.occ, occMark = DW.occMark;
  const GT = DW.GT, GM = DW.GM, S = DW.sensor, WR = DW.WREL;
  const SH = PG.SHOTS, T_HIT = PG.T_HIT, HL = PG.HIT_L;
  const rng = M3.rng;

  /* ================= per-frame state ================= */
  let WY = 1e9, FL = 1000;
  /* the polarity a screen row shows this frame (two bands while a wipe runs) */
  const bhY = y => (y < WY ? S.pol : S.from) === 1;
  /* a hot particle at a world point: hidden behind the hero; hot enough, it cuts the sea and the sky away behind it
     (marked a little deeper than itself, so an effect's own dots never hide each other); a heat dot */
  function hdot(x, y, z, s, h, a, pad, rn) {
    if (!P3(x, y, z) || occ(q.x, q.y, q.z)) return false;
    // rn (0..1, per particle) dithers the threshold, so a cooling cloud lets the field back in gradually
    if (h > (bhY(q.y) ? .3 : .42) + (rn === undefined ? 0 : (rn - .5) * .08)) occMark(q.x, q.y, q.z + 60, pad);
    hput(q.x, q.y, s, h, a);
    return true;
  }
  /* is a world sphere possibly on screen (for culling whole effects before their particles) */
  function onScreen(x, y, z, rad) {
    const c = DW.cam, e = c.eye, dx = x - e[0], dz = z - e[2], dy = y - e[1] - (dx * dx + dz * dz) / (2 * PG.RE);
    const zc = dx * c.f[0] + dy * c.f[1] + dz * c.f[2];
    if (zc < -rad) return false;
    if (zc < rad * 1.5) return true;
    const sx = c.cx + c.fl * (dx * c.r[0] + dy * c.r[1] + dz * c.r[2]) / zc, sy = c.cy - c.fl * (dx * c.u[0] + dy * c.u[1] + dz * c.u[2]) / zc, rp = c.fl * rad / (zc - rad) + 8;
    return sx + rp > 0 && sx - rp < 1920 && sy + rp > 0 && sy - rp < 1080;
  }
  const pxmAt = (x, y, z) => { const c = DW.cam, e = c.eye; return FL / Math.max(1, (x - e[0]) * c.f[0] + (y - e[1]) * c.f[1] + (z - e[2]) * c.f[2]); };
  /* the saturated core of a bloom: the field behind it cut away over a disc of R px, solid in the middle and
     dithered out to the rim (a fixed screen-space dither, so it reads as the detector's noise) */
  function markDisc(x, y, z, R, fill) {
    if (R < 2 || fill <= .01) return;
    const a0 = Math.max(0, ((x - R) | 0) >> 2), a1 = Math.min(479, ((x + R) | 0) >> 2), b0 = Math.max(0, ((y - R) | 0) >> 2), b1 = Math.min(269, ((y + R) | 0) >> 2), iR2 = 1 / (R * R);
    for (let b = b0; b <= b1; b++) {
      const dy = b * 4 + 2 - y;
      for (let a = a0; a <= a1; a++) {
        const dx = a * 4 + 2 - x, d2 = (dx * dx + dy * dy) * iR2; if (d2 >= 1) continue;
        if (hsh(a, b + 7919) < fill * (1 - d2 * d2)) occMark(a * 4 + 2, b * 4 + 2, z, 0);
      }
    }
  }

  /* blooms for the overlay (x, y, r px, strength, black-hot) and the veil of the brightest source this frame */
  const NBL = 24, BLM = new Float32Array(NBL * 5); let nbl = 0;
  function bloom(x, y, r, a) {
    if (a < .004 || nbl >= NBL || x < -r || y < -r || x > 1920 + r || y > 1080 + r) return;
    const o = nbl++ * 5; BLM[o] = x; BLM[o + 1] = y; BLM[o + 2] = r; BLM[o + 3] = a; BLM[o + 4] = bhY(y) ? 1 : 0;
  }
  let VEIL = 0, VX = 960, VY = 540;
  const veil = (x, y, g) => { if (g > VEIL) { VEIL = g; VX = x; VY = y; } };

  /* hot spots on the hero (ship coords), reused every frame */
  const HOTS = []; for (let i = 0; i < 16; i++) HOTS.push({ p: [0, 0, 0], r: 1, h: 0 });
  let nhot = 0;
  function hotAt(ctx, x, y, z, r, h) {
    if (h < .005 || nhot >= HOTS.length) return;
    const o = HOTS[nhot++]; o.p[0] = x; o.p[1] = y; o.p[2] = z; o.r = r; o.h = h; ctx.hot.push(o);
  }

  /* ================= the launches ================= */
  /* puffs laid every DS m of the flown path, each with the moment the head passed it */
  const DS = 6;
  for (const s of SH) {
    const Lend = PG.shotSl(s, s.tEnd), n = Math.floor(Lend / DS);
    const PX = new Float32Array(n), PY = new Float32Array(n), PZ = new Float32Array(n), PB = new Float64Array(n), TP = [0, 0, 0];
    let j = 0;
    for (let t = s.tL; j < n && t <= s.tEnd + 1e-6; t += .002) {
      const sl = PG.shotSl(s, t);
      while (j < n && (j + 1) * DS <= sl) { PB[j] = t; PG.shotPath(s, (j + 1) * DS, TP); PX[j] = TP[0]; PY[j] = TP[1]; PZ[j] = TP[2]; j++; }
    }
    s.fx = { n: j, PX, PY, PZ, PB, seed: s.cell * 131 + 7 };
  }
  /* the plume and the column: fresh gas white-hot behind the head, cooling within a second or two into a warm
     column that spreads, rises a little and is carried aft by the air past the ship. The booster's column (the
     first 6 s) is the thick one, and the first tens of metres out of the cell are blasted wide. */
  function drawColumn(s, T) {
    const F = s.fx, PB = F.PB, PX = F.PX, PY = F.PY, PZ = F.PZ;
    for (let j = 0; j < F.n; j++) {
      const born = PB[j]; if (born > T) break;
      const age = T - born, bt = born - s.tL;
      let np, spr, end, h;
      if (bt < 6) { np = j < 25 ? 5 : 4; spr = (j < 25 ? 3.2 : 2.3) + 4 * sat(1 - j / 12); end = 26; h = .26 + .9 * Math.exp(-age / .5) + .2 * Math.exp(-age / 9); }
      else if (bt < 11) { np = 3; spr = 1.5; end = 16; h = .26 + .85 * Math.exp(-age / .35) + .14 * Math.exp(-age / 6); }
      else { np = 2; spr = 1; end = 8; h = .26 + .65 * Math.exp(-age / .25) + .08 * Math.exp(-age / 3); }
      if (age > end) continue;
      const env = Math.exp(-age / (end * .6)) * (1 - ss(end * .6, end, age));
      if (env < .02) continue;
      const r = spr * (.35 + 1.05 * Math.sqrt(age) + .1 * age);
      if (!P3(PX[j] + WR[0] * age, PY[j] + .6 * age, PZ[j] + WR[2] * age)) continue;
      const zc = q.z, cx = q.x, cy = q.y, rs = r * FL / zc;
      // far out the 6 m puffs land a pixel apart: every other (every fourth) one carries the old column
      const thin = age < 1.2 ? 0 : zc > 9000 ? 3 : zc > 4500 ? 1 : 0;
      if (j & thin) continue;
      if (zc > 2600) np = Math.max(1, Math.round(np * 2600 / zc * (1 + thin)));
      if (rs > 4) np = Math.round(np * Math.min(4, rs / 4));
      // in black-hot the column is the field cut away: solid while hot, thinning out as it cools to the air
      const bh = bhY(cy), mp = bh ? sat((h - .265) / .09) * sat(1.3 - age / end) : h > .42 ? 1 : 0, pad = bh && h > .6 && rs < 12 ? 1 : 0;
      const sz = rs > 14 && h < .6 ? 2 : 1;
      for (let m = 0; m < np; m++) {
        const g0 = (F.seed + j * 5 + m * 1733) & GM, fr = (g0 * .618034) % 1;
        const px = cx + GT[g0] * rs, py = cy + GT[(g0 + 1) & GM] * rs * .9;
        if (occ(px, py, zc)) continue;
        if (fr < mp) occMark(px, py, zc + 60, pad);
        hput(px, py, sz, h * (.93 + .14 * fr), env * (.55 + .6 * fr));
      }
    }
  }
  /* the head: a white-hot point and the motor's flame (long on the booster, short on the sustainer, none in the
     glide, where only the skin is hot) */
  const HP = [0, 0, 0], HQ = [0, 0, 0];
  function drawHead(s, T) {
    if (T < s.tL || T > s.tEnd) return;
    const t = T - s.tL;
    PG.shotAt(s, T, HP); PG.shotAt(s, Math.max(s.tL, T - .02), HQ);
    let dx = HP[0] - HQ[0], dy = HP[1] - HQ[1], dz = HP[2] - HQ[2]; const dl = Math.hypot(dx, dy, dz);
    if (dl < 1e-4) { dx = 0; dy = 1; dz = 0; } else { dx /= dl; dy /= dl; dz /= dl; }
    if (!P3(HP[0], HP[1], HP[2])) return;
    const hx = q.x, hy = q.y, zc = q.z, pxm = FL / zc;
    const burn = t < 6 ? 1 : t < 11 ? .55 : .1, Lf = t < 6 ? 34 : t < 11 ? 12 : 2.5, fr = Math.floor(T * 60);
    const nf = Math.round(clamp(Lf * pxm / 1.3, 6, 64));
    for (let j = 0; j < nf; j++) {
      const u = Math.pow(hsh(j + 31 * s.cell, fr), 1.7), sg = Lf * u, rad = .3 + .07 * sg, g0 = (j * 3 + fr * 7) & GM;
      hdot(HP[0] - dx * sg + GT[g0] * rad, HP[1] - dy * sg + GT[(g0 + 1) & GM] * rad, HP[2] - dz * sg + GT[(g0 + 2) & GM] * rad, pxm > 5 ? 2 : 1, 1.3 - .5 * u, (.45 + .55 * burn) * (1 - .55 * u), 0);
    }
    if (occ(hx, hy, zc)) return;
    occMark(hx, hy, zc + 40, pxm > 2.5 ? 2 : 1);
    // in the glide the skin is still a few hundred degrees: the head keeps a smaller bloom of its own
    markDisc(hx, hy, zc + 40, clamp(5 + 4 * pxm, 7, 22) * (.7 + .3 * burn), 1);
    hput(hx, hy, pxm > 3 ? 3 : 2, 1.3, 1);
    hglow(hx, hy, clamp(3 + 5 * pxm, 4, 24), 1.25, .5 * (.4 + .6 * burn));
    bloom(hx, hy, clamp(22 + 16 * pxm, 26, 80) * (.7 + .3 * burn), .45 * burn + .38);
  }
  /* the cell: the flash, and the exhaust thrown up out of the cell and its uptake, rolling over the deck, rising
     and left astern */
  const ND = 300, DKT = new Float32Array(ND), DKV = new Float32Array(ND * 3), DKK = new Float32Array(ND), DKL = new Float32Array(ND), DKB = new Float32Array(ND);
  { const r = rng(6101); for (let i = 0; i < ND; i++) { const a = r() * TAU, sp = 3 + 24 * Math.pow(r(), 1.4); DKT[i] = 1.4 * Math.pow(r(), 1.8); DKV[i * 3] = Math.cos(a) * sp; DKV[i * 3 + 1] = 2 + 18 * r(); DKV[i * 3 + 2] = Math.sin(a) * sp * .8; DKK[i] = .45 + .8 * r(); DKL[i] = 5 + 12 * r(); DKB[i] = .55 + .45 * r(); } }
  function drawCell(s, T) {
    const a = T - s.tL; if (a < 0 || a > 18) return;
    const P0 = s.P0;
    if (!onScreen(P0[0], P0[1] + 20, P0[2], 120)) return;
    const pxm = pxmAt(P0[0], P0[1], P0[2]), sz = pxm > 3 ? 2 : 1;
    for (let i = 0; i < ND; i++) {
      const b = a - DKT[i]; if (b < 0 || b > DKL[i]) continue;
      const kd = DKK[i], dd = (1 - Math.exp(-kd * b)) / kd, life = 1 - b / DKL[i], h = .27 + 1.0 * Math.exp(-b * 2.2) + .12 * Math.exp(-b / 5);
      hdot(P0[0] + DKV[i * 3] * dd + WR[0] * b, P0[1] + DKV[i * 3 + 1] * dd + 1.2 * b, P0[2] + DKV[i * 3 + 2] * dd + WR[2] * b, sz, h, DKB[i] * life * Math.sqrt(life), h > .55 ? 1 : 0);
    }
    if (a < 2.5 && P3(P0[0], P0[1] + 1.5, P0[2])) {
      const w = Math.exp(-a * 2.4), k = clamp(pxm / 1.7, .7, 1.8), x = q.x, y = q.y, z = q.z;
      markDisc(x, y - 6 * k, z - 8, (18 + 70 * w) * k, Math.min(1, 1.6 * w + .2));
      hput(x, y, 4, 1.3, Math.min(1, 1.8 * w));
      hglow(x, y, clamp(pxm * 14, 8, 50) * (.6 + .4 * w), 1.3, .8 * w);
      bloom(x, y, (70 + 260 * w) * k, 1.1 * w * w + .3 * Math.exp(-a * .8));
      veil(x, y, .35 * Math.exp(-a * 10));
    }
  }

  /* ================= bursts: the two kills, I3's pop, round 43 ================= */
  /* fragments carry part of the momentum (mom, m/s) under drag and gravity, each knows when it reaches the sea;
     every fifth one is a burning brand; sparks are fast and short-lived */
  function mkBurst(o) {
    const r = rng(o.seed), n = o.nF, F = new Float32Array(n * 6), AW = new Float32Array(n), sc = o.sc, p = o.p;
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), f = .08 + .55 * r(), sp = (30 + 320 * Math.pow(r(), 1.4)) * sc;
      const heavy = o.heavy && i % 7 === 0;
      const vx = o.mom[0] * f + c * Math.cos(th) * sp, vy = o.mom[1] * f + u * sp * .75 + 16 * sc, vz = o.mom[2] * f + c * Math.sin(th) * sp;
      const kd = heavy ? .5 + .35 * r() : 1.2 + 2.6 * r();
      F[i * 6] = vx; F[i * 6 + 1] = vy; F[i * 6 + 2] = vz; F[i * 6 + 3] = kd; F[i * 6 + 4] = r(); F[i * 6 + 5] = i % 5 === 0 ? 1 : 0;
      const yAt = t => p[1] + vy * (1 - Math.exp(-kd * t)) / kd - G2 * t * t;
      let lo = 0, hi = 14; for (let it = 0; it < 40; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
      AW[i] = lo;
    }
    const ns = o.ns, SP = new Float32Array(ns * 5);
    for (let i = 0; i < ns; i++) {
      const u = r() * 2 - 1, th = r() * TAU, c = Math.sqrt(1 - u * u), sp = (160 + 320 * r()) * sc;
      SP[i * 5] = c * Math.cos(th) * sp + o.mom[0] * .3; SP[i * 5 + 1] = u * sp * .8 + 25 * sc + o.mom[1] * .3; SP[i * 5 + 2] = c * Math.sin(th) * sp + o.mom[2] * .3;
      SP[i * 5 + 3] = 1.6 + 1.8 * r(); SP[i * 5 + 4] = .35 + .6 * r();
    }
    const ml = Math.hypot(o.mom[0], o.mom[1], o.mom[2]) || 1;
    return Object.assign({ F, AW, SP, n, ns, dir: [o.mom[0] / ml, o.mom[1] / ml, o.mom[2] / ml], run: Math.min(1, ml / 680) }, o);
  }
  /* the fireball: a cluster of lobes (not a ball), dots filling each toward its skin; drawn as a prefix sized to
     its area on screen */
  const SHELL = (() => {
    const r = rng(4401), n = 2400, NL = 7, a = new Float32Array(n * 5), LB = [];
    for (let l = 0; l < NL; l++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = l ? .38 + .32 * r() : 0; LB.push([s * Math.cos(th) * d, u * d * .75, s * Math.sin(th) * d, l ? .42 + .3 * r() : .72]); }
    for (let i = 0; i < n; i++) {
      const L = LB[i % NL], u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = Math.pow(r(), .4);
      a[i * 5] = L[0] + s * Math.cos(th) * rr * L[3]; a[i * 5 + 1] = L[1] + u * rr * L[3]; a[i * 5 + 2] = L[2] + s * Math.sin(th) * rr * L[3];
      a[i * 5 + 3] = Math.min(1, rr * (i % NL ? .8 : 1) + .25 * Math.hypot(L[0], L[1], L[2])); a[i * 5 + 4] = r();
    }
    return { n, a };
  })();
  /* the smoke ball a burst leaves */
  const NQ = 260, SMB = new Float32Array(NQ * 4);
  { const r = rng(5517); for (let i = 0; i < NQ; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u), qq = Math.cbrt(r()); SMB[i * 4] = Math.cos(a) * h * qq; SMB[i * 4 + 1] = u * qq * .7; SMB[i * 4 + 2] = Math.sin(a) * h * qq; SMB[i * 4 + 3] = r(); } }

  const BURSTS = [];
  const RO = {};
  const roundDir = (k, t) => PG.round(k, t, RO).dir.slice();
  for (const s of SH) {
    if (s.miss) continue;
    const mom = V.add(V.mul(roundDir(s.rnd, s.tI - .05), 700 * .5), V.mul(s.tan, s.vEnd * .45));
    BURSTS.push(mkBurst({ kind: 'kill', k: s.rnd, t0: s.tI, p: s.P3.slice(), mom, sc: 1.25, nF: 240, ns: 90, seed: 900 + s.rnd * 17, fs: 1, life: 12, pump: .6 }));
  }
  const S3 = SH.find(s => s.miss);
  const tPop = S3.tEnd - .002, pPop = PG.shotAt(S3, tPop), dPop = V.norm(V.sub(pPop, PG.shotAt(S3, tPop - .05)));
  const POP = mkBurst({ kind: 'pop', k: -1, t0: tPop, p: pPop, mom: V.mul(dPop, S3.vEnd * .35), sc: .7, nF: 90, ns: 50, seed: 977, fs: .5, life: 8, pump: .25 });
  BURSTS.push(POP);
  const T43 = PG.tStop[2];
  const B43 = mkBurst({ kind: 'ciws', k: 2, t0: T43, p: PG.EV.stops[2].p.slice(), mom: V.mul(roundDir(2, T43 - .05), 680), sc: 1.1, nF: 360, ns: 140, seed: 4545, heavy: true, fs: 1.1, life: 11, pump: .8 });
  BURSTS.push(B43);

  const BC = [0, 0, 0];
  /* the fireball's centre runs on with the momentum a little, then drifts with the air and rises */
  function burstC(B, a) {
    const d = 680 / 3.4 * (1 - Math.exp(-3.4 * a)) * .45 * B.run;
    BC[0] = B.p[0] + B.dir[0] * d + WR[0] * a; BC[1] = B.p[1] + B.dir[1] * d + 1.6 * a; BC[2] = B.p[2] + B.dir[2] * d + WR[2] * a;
    return BC;
  }
  function drawBurst(B, T) {
    const a = T - B.t0; if (a < 0 || a > B.life) return;
    const p = B.p, ext = 60 + 260 * B.sc;
    if (!onScreen(p[0], p[1], p[2], ext)) return;
    const c = burstC(B, a), cx = c[0], cy = c[1], cz = c[2], pxm = pxmAt(cx, cy, cz);
    // the fireball: white-hot lobes cooling from the skin in, then warm gas
    const Rb = B.fs * (13 * (1 - Math.exp(-a * 7)) + 3.8 * a);
    if (a < 5) {
      const Rpx = Rb * pxm, N = Math.round(clamp(Rpx * Rpx * .9, 150, SHELL.n)), SA = SHELL.a, fade = 1 - ss(2.2, 5, a), thin = .45 * ss(1, 3.5, a), D0 = B.dir, run = .6 * (1 - Math.exp(-a * 3)) * B.run;
      const sz = Rpx > 60 ? 2 : 1;
      for (let i = 0; i < N; i++) {
        const o = i * 5, rr = SA[o + 3], rn = SA[o + 4]; if (rn < thin) continue;
        const sm = Rb * run * (((rn * 3.7) % 1) - .3);
        const y = cy + SA[o + 1] * Rb + D0[1] * sm; if (y < .3) continue;
        const heat = Math.exp(-a * (.9 + 1.6 * rr) * (.65 + .7 * ((rn * 7.31) % 1)));
        hdot(cx + SA[o] * Rb + D0[0] * sm, y, cz + SA[o + 2] * Rb + D0[2] * sm, sz, .27 + 1.05 * heat, fade * (.4 + .9 * rn * rn + .4 * heat), 0);
      }
    }
    // the first instant: a white-hot core
    if (a < .25 && P3(p[0], p[1], p[2])) {
      const w = 1 - a / .25;
      occMark(q.x, q.y, q.z - 20, 2 + Math.round(3 * w * B.sc));
      hput(q.x, q.y, 5, 1.3, 1);
      hglow(q.x, q.y, clamp(pxm * 22 * B.sc, 8, 60), 1.3, .8 * w);
    }
    // the smoke ball: warm, spreading, drifting, gone after the life
    if (a > .4) {
      const Rs = B.fs * (10 + 6 * Math.sqrt(a) + 1.2 * a), hs = .27 + .14 * Math.exp(-(a - .4) / 4) + .05 * Math.exp(-a / 8), fa = sat((a - .4) / .8) * (1 - ss(B.life * .55, B.life, a));
      const n = Math.round(clamp(Rs * pxm * Rs * pxm * .12, 60, NQ)), sz = Rs * pxm > 80 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const o = i * 4, y = cy + SMB[o + 1] * Rs + 2 * a; if (y < .4) continue;
        hdot(cx + SMB[o] * Rs, y, cz + SMB[o + 2] * Rs, sz, hs * (.95 + .1 * SMB[o + 3]), fa * (.35 + .5 * SMB[o + 3]), 0, SMB[o + 3]);
      }
    }
    // sparks: short white-hot streaks
    if (a < 1.1) for (let i = 0; i < B.ns; i++) {
      const o = i * 5, life = B.SP[o + 4]; if (a > life) continue;
      const kd = B.SP[o + 3], w = 1 - a / life;
      for (let m = 0; m < 4; m++) {
        const t2 = Math.max(0, a - m * .012), h = (1 - Math.exp(-kd * t2)) / kd;
        hdot(p[0] + B.SP[o] * h, p[1] + B.SP[o + 1] * h - G2 * t2 * t2, p[2] + B.SP[o + 2] * h, 1, 1.3 - .12 * m, Math.min(1, 1.4 * w) * (1 - m * .2), 0);
      }
    }
    // fragments: hot specks cooling as they fall, brands trailing heat; a wisp of steam where each meets the sea
    const F = B.F, AW = B.AW, big = pxm > 3, far = pxm < 2;
    for (let i = 0; i < B.n; i++) {
      const o = i * 6, vx = F[o], vy = F[o + 1], vz = F[o + 2], kd = F[o + 3], rn = F[o + 4], brand = F[o + 5], aw = AW[i];
      if (a < aw) {
        const cool = Math.exp(-a * (brand ? .45 : 1.3)), h = .3 + (brand ? 1 : .95) * cool;
        // far out a speck is under a pixel: the hot ones bloom to a few (and cut the field away as they do)
        const nt = brand ? 9 : 3, pad = far && h > .75 && (brand || rn > .5) ? 1 : 0;
        for (let m = 0; m < nt; m++) {
          const t2 = a - m * (brand ? .035 : .014); if (t2 < 0) break;
          const e = (1 - Math.exp(-kd * t2)) / kd;
          hdot(p[0] + vx * e, p[1] + vy * e - G2 * t2 * t2 + (brand ? m * .1 : 0), p[2] + vz * e, !m && big && (brand || rn > .6) ? 2 : 1, h - m * (brand ? .05 : .1), (brand ? 1 : .6 + .4 * rn) * (1 - m / (nt + 1)), m < 3 ? pad : 0, rn);
        }
      } else if (a < aw + 1.4) {
        const w = a - aw, e = (1 - Math.exp(-kd * aw)) / kd, x = p[0] + vx * e + WR[0] * w, z = p[2] + vz * e + WR[2] * w, al = (1 - w / 1.4) * (.5 + .5 * rn);
        for (let m = 0; m < 3; m++) hdot(x + GT[(i * 3 + m) & GM] * (.4 + w), .3 + (1.2 + m) * w, z + GT[(i * 3 + m + 1) & GM] * (.4 + w), 1, .3 + .12 * Math.exp(-w * 2), al, 0);
      }
    }
    // the bloom (its saturated core cuts the field away) and the veil
    if (a < 3 && P3(c[0], c[1], c[2])) {
      const k = clamp(pxm * .7, .75, 1.2) * B.sc, x = q.x, y = q.y;
      markDisc(x, y, q.z - 20, Rb * pxm * (1.1 - .3 * sat(a / 3)) + (10 + 44 * Math.exp(-a * 3) + 22 * Math.exp(-a * .9)) * k, sat(1.5 - a / 2.4));
      bloom(x, y, (60 + 120 * sat(a * 3)) * k, .95 * Math.exp(-a * 6) + .25 * Math.exp(-a * 1.3));
      veil(x, y, .2 * B.pump * Math.exp(-a * 10));
    }
  }

  /* ================= the aft Phalanx ================= */
  const CI = PG.CIWS, MI = 1;
  /* it fires on round 43 until the kill, then on round 44 once it has swung onto it, until just before the hit */
  const FIRE = [[CI.tOpen, T43 + .02, 2], [CI.tSwap1 + .12, T_HIT - .15, 3]];
  const CW = { rate: 75, v0: 1100, kd: .3 }, TRL = CW.v0 / CW.kd;
  const tof = r => { const x = CW.kd * r / CW.v0; return x < .97 ? -Math.log(1 - x) / CW.kd : 12; };
  const CPART = DW.DDM.parts.find(p => p.name === 'ciwsA');
  const MZ = [0, 1.36, 2.12], BAR = [0, 1.36, 1.0], BAR2 = [0, 1.36, 1.75];
  const mountX = st => X.mul(CPART.xf(st), DW.elevX(st.ciwsPitch[MI]));
  const capOf = k => k === 2 ? T43 : T_HIT - .3;
  /* every round of both bursts: fire time, muzzle, direction (the stream walks onto the round from short, then
     wanders a little round it), where it ends (about half the rounds that reach round 43 strike it) */
  const TRC = (() => {
    const out = [], RT = {};
    for (let w = 0; w < FIRE.length; w++) {
      const [f0, f1, k] = FIRE[w], n = Math.floor((f1 - f0) * CW.rate);
      for (let j = 0; j <= n; j++) {
        const tk = f0 + j / CW.rate, st = PG.shipState(tk), M = X.ap(mountX(st), MZ);
        let tf = 1, P = null;
        for (let it = 0; it < 4; it++) { P = PG.round(k, Math.min(tk + tf, capOf(k)), RT).p; tf = tof(V.dist(P, M)); }
        const D0 = V.norm([P[0] - M[0], P[1] - M[1] + G2 * tf * tf, P[2] - M[2]]);
        const walk = .005 * Math.exp(-(tk - f0) / .45), wx = .0011 * M3.noise(tk * 1.7, 3.3), wy = .0011 * M3.noise(tk * 1.9, 8.1);
        const u = V.norm(V.cross(D0, [0, 1, 0])), vv = V.cross(u, D0), id = w * 1000 + j;
        const ex = gH(id, 41) * .002 + wx, ey = gH(id, 43) * .002 + wy - walk;
        const D = V.norm([D0[0] + u[0] * ex + vv[0] * ey, D0[1] + u[1] * ex + vv[1] * ey, D0[2] + u[2] * ex + vv[2] * ey]);
        const yAt = a => M[1] + D[1] * TRL * (1 - Math.exp(-CW.kd * a)) - G2 * a * a;
        let lo = 0, hi = 9; for (let it = 0; it < 36; it++) { const md = (lo + hi) / 2; if (yAt(md) > 0) lo = md; else hi = md; }
        const strike = k === 2 && tk + tf <= T43 + .04 && hsh(j, 9) < .5;
        out.push({ tk, M, D, aw: lo, end: strike ? tf : Math.min(lo, 3.2), rn: hsh(id, 5) });
      }
    }
    return out;
  })();
  const firing = T => { for (const f of FIRE) if (T >= f[0] && T <= f[1]) return true; return false; };
  /* barrel heat: builds while it fires, cools over the next half minute, gone well before the seam */
  function barrelH(T) {
    let h = 0;
    for (const f of FIRE) { if (T <= f[0]) continue; h += .6 * (1 - Math.exp(-(Math.min(T, f[1]) - f[0]) / 1.5)) * Math.exp(-Math.max(0, T - f[1]) / 25); }
    return h * (1 - ss(134, 148, T));
  }
  let MST = null, MSTT = -1;
  function mount(T) {
    if (T !== MSTT) { MSTT = T; MST = mountX(PG.shipState(T)); }
    return MST;
  }
  function drawTracers(T) {
    if (T < FIRE[0][0] || T > FIRE[1][1] + 3.3) return;
    // a streak about a frame long along the velocity
    for (let i = 0; i < TRC.length; i++) {
      const r = TRC[i], a = T - r.tk; if (a < 0) break;
      if (a >= r.end) continue;
      const ex = Math.exp(-CW.kd * a), h = TRL * (1 - ex), v = CW.v0 * ex;
      const x = r.M[0] + r.D[0] * h, y = r.M[1] + r.D[1] * h - G2 * a * a, z = r.M[2] + r.D[2] * h;
      const vx = r.D[0] * v, vy = r.D[1] * v - 9.81 * a, vz = r.D[2] * v;
      // the tracer burns out after ~3 s
      const al = (.75 + .25 * r.rn) * (1 - ss(2.4, 3.2, a)), hot = 1.2 + (a < .05 ? .1 : 0);
      if (!hdot(x, y, z, a < .3 ? 2 : 1, hot, al, 0)) continue;
      const big = FL / q.z > 3.5;
      hglow(q.x, q.y, big ? 5 : 3.5, 1.2, .3 * al);
      for (let m = 1; m <= 6; m++) { const d = .0028 * m; hdot(x - vx * d, y - vy * d, z - vz * d, big && m < 3 ? 2 : 1, hot - .07 * m, al * (1 - m * .12), 0); }
    }
  }
  /* the muzzle: a flickering white-hot point and a short flame while it fires; gun gas drifting aft */
  function drawMuzzle(T) {
    const Mx = mount(T), Mz = X.ap(Mx, MZ), Dz = X.dir(Mx, [0, 0, 1]);
    if (!onScreen(Mz[0], Mz[1], Mz[2], 40)) return;
    const pxm = pxmAt(Mz[0], Mz[1], Mz[2]);
    if (firing(T)) {
      const fr = Math.floor(T * 75), f = hsh(fr, 3);
      for (let j = 0; j < 18; j++) {
        const s = 2.4 * Math.pow(hsh(j, fr + 7), 1.5), rr = .16 * s, g0 = (j * 3 + fr) & GM;
        hdot(Mz[0] + Dz[0] * s + GT[g0] * rr, Mz[1] + Dz[1] * s + GT[(g0 + 1) & GM] * rr, Mz[2] + Dz[2] * s + GT[(g0 + 2) & GM] * rr, pxm > 6 ? 2 : 1, 1.3 - .2 * s, 1 - s / 2.8, 0);
      }
      if (P3(Mz[0], Mz[1], Mz[2])) {
        occMark(q.x, q.y, q.z - 2, pxm > 6 ? 2 : 1);
        hput(q.x, q.y, pxm > 6 ? 4 : 3, 1.3, .7 + .3 * f);
        hglow(q.x, q.y, clamp(2.2 * pxm, 5, 34), 1.3, .45 * (.55 + .45 * f));
        bloom(q.x, q.y, clamp(5 * pxm, 18, 70), .16 + .12 * f);
      }
    }
    // gun gas: puffs at 30 Hz while it fires, warm, rising and carried aft
    const f30 = Math.floor(T * 30);
    for (let j = 0; j < 100; j++) {
      const tb = (f30 - j) / 30; if (!firing(tb)) continue;
      const a = T - tb, r = .3 + 1.3 * Math.sqrt(a), g0 = ((f30 - j) * 7 + 3) & GM, hh = .28 + .3 * Math.exp(-a / .4);
      hdot(Mz[0] + Dz[0] * 1.4 + WR[0] * a + GT[g0] * r, Mz[1] + .7 * a + GT[(g0 + 1) & GM] * r * .5, Mz[2] + Dz[2] * 1.4 + WR[2] * a + GT[(g0 + 2) & GM] * r, pxm > 8 ? 2 : 1, hh, .7 * (1 - a / 3.4), 0);
    }
  }

  /* ================= the hit ================= */
  const OUT = [1, 0, 0];
  /* the fireball: lobes rolling out of the hole (never into the hull) and up over the deck */
  const BLT = (() => {
    const r = rng(9501), n = 9000, NLB = 11, a = new Float32Array(n * 5), LB = [];
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
  /* the jet of fire up through the deck just aft of the hangar */
  const JT = (() => { const r = rng(9507), n = 3200, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = Math.pow(r(), .75); a[i * 4 + 1] = gH(i, 71); a[i * 4 + 2] = gH(i, 73); a[i * 4 + 3] = r(); } return { n, a }; })();
  const VENT = [6.2, 6.0, -56.2];
  const FB = [0, 0, 0];
  function fireballC(t) {
    // a buoyant fireball: it rolls out of the hole, climbs, and the air past the ship lays it back over the stern
    const vent = 6 * (1 - Math.exp(-t * 5)), up = 4.8 * t + 4 * (1 - Math.exp(-t * 3)), dr = .75 * (t - .8 * (1 - Math.exp(-t / .8)));
    FB[0] = HL[0] + OUT[0] * vent + WR[0] * dr; FB[1] = HL[1] + up; FB[2] = HL[2] + WR[2] * dr;
    return 21 * (1 - Math.exp(-t * 6)) + 2.6 * t;
  }
  function drawFireball(a) {
    if (a > 5.5) return;
    const Rb = fireballC(a), cx = FB[0], cy = FB[1], cz = FB[2];
    if (!onScreen(cx, cy, cz, Rb * 1.6 + 50)) return;
    const pxm = pxmAt(cx, cy, cz), Rpx = Rb * pxm;
    const N = Math.min(BLT.n, Math.max(1500, Math.round(Rpx * Rpx * .45))), fade = 1 - ss(3, 5.5, a), thin = .45 * ss(1.4, 4.2, a), B = BLT.a, sz = Rpx > 90 ? 2 : 1;
    for (let i = 0; i < N; i++) {
      const o = i * 5, rn = B[o + 4]; if (rn < thin) continue;
      const y = cy + B[o + 1] * Rb; if (y < .3) continue;
      // the core burns on while the skin cools
      const rr = B[o + 3], heat = Math.exp(-a * (.16 + 1.2 * rr * rr) * (.7 + .6 * ((rn * 7.31) % 1)));
      hdot(cx + (B[o] * OUT[0]) * Rb, y, cz + B[o + 2] * Rb, sz, .28 + 1.05 * heat, fade * (.45 + .8 * rn * rn + .3 * heat), 0, rn);
    }
    // the detector's blur round the white-hot heart of it
    if (a < 3.5 && P3(cx, cy + Rb * .1, cz) && !occ(q.x, q.y, q.z)) hglow(q.x, q.y, Math.min(140, .55 * Rpx + 8), 1.25, .42 * Math.exp(-a / 1.3) * fade);
    // the jet: fast, narrow, rolling over at the top and leaning aft with the air
    const jf = 1 - ss(2, 4.2, a); if (jf <= .01) return;
    const H = 42 * (1 - Math.exp(-a * 2.2)) + 3 * a, J = JT.a, NJ = Math.min(JT.n, Math.max(900, Math.round(N * .35))), d2 = a - .6 * (1 - Math.exp(-a / .6));
    for (let i = 0; i < NJ; i++) {
      const o = i * 4, s = J[o], rn = J[o + 3]; if (rn < thin) continue;
      const hs = s * H, rad = .8 + 6 * s * s * (1 - Math.exp(-a * 2.5)) + 1.2 * a;
      const heat = Math.exp(-a * (.8 + 1.8 * s) * (.75 + .5 * rn));
      hdot(VENT[0] + J[o + 1] * rad + WR[0] * d2 * s, VENT[1] + hs + J[o + 2] * rad * .35, VENT[2] + J[o + 2] * rad * .8 + WR[2] * d2 * s, sz, .3 + 1.0 * heat, jf * (.45 + .7 * rn), 0);
    }
  }
  /* fragments and sparks out of the hole: outboard and up, some across the deck */
  const DEB = (() => {
    const r = rng(9503), n = 560, a = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      let dx = -.5 + 1.8 * r(), dy = -.1 + 1.3 * r(), dz = (r() - .5) * 1.8; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const sp = 14 + 150 * Math.pow(r(), 2.6), k = .3 + 1.4 * r(), vx = dx * sp, vy = dy * sp, vz = dz * sp;
      const yAt = t => HL[1] + vy * (1 - Math.exp(-k * t)) / k - G2 * t * t;
      let lo = .01, hi = 14; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > 0) lo = m; else hi = m; }
      a.set([vx, vy, vz, k, r(), i % 4 === 0 ? 1 : 0, lo], i * 7);
    }
    return { n, a };
  })();
  const SPK = (() => {
    const r = rng(9504), n = 200, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      let dx = -.3 + 1.4 * r(), dy = -.2 + 1.5 * r(), dz = (r() - .5) * 2.2; const l = Math.hypot(dx, dy, dz), sp = 70 + 190 * r();
      a.set([dx / l * sp, dy / l * sp, dz / l * sp, 2.5 + 2.5 * r(), .2 + .5 * r()], i * 5);
    }
    return { n, a };
  })();
  /* ship-relative position of a dragged fragment after t: the air it flies through moves aft past the ship */
  const FP = [0, 0, 0];
  function frag(vx, vy, vz, k, t) {
    const e = (1 - Math.exp(-k * t)) / k;
    FP[0] = HL[0] + WR[0] * t + (vx - WR[0]) * e; FP[1] = HL[1] + vy * e - G2 * t * t; FP[2] = HL[2] + WR[2] * t + (vz - WR[2]) * e;
    return FP;
  }
  function drawDebris(a) {
    const t = a - .008; if (t < 0 || t > 12) return;
    if (!onScreen(HL[0], HL[1] + 30, HL[2], 260)) return;
    const D = DEB.a, big = pxmAt(HL[0], HL[1], HL[2]) > 4;
    for (let i = 0; i < DEB.n; i++) {
      const o = i * 7, vx = D[o], vy = D[o + 1], vz = D[o + 2], k = D[o + 3], rn = D[o + 4], brand = D[o + 5], tl = D[o + 6];
      if (t >= tl) continue;
      const cool = Math.exp(-t * (brand ? .35 : 1.2)), h = .3 + (brand ? 1 : .95) * cool, nt = brand ? 12 : 3;
      for (let m = 0; m < nt; m++) {
        const t2 = t - m * (brand ? .03 : .012); if (t2 < 0) break;
        const p = frag(vx, vy, vz, k, t2);
        hdot(p[0], p[1] + (brand ? m * .12 : 0), p[2], !m && big && (brand || rn > .6) ? 2 : 1, h - m * (brand ? .045 : .1), (brand ? 1 : .6 + .4 * rn) * (1 - m / (nt + 1)), 0);
      }
    }
    if (t < 1.1) {
      const S_ = SPK.a;
      for (let i = 0; i < SPK.n; i++) {
        const o = i * 5, life = S_[o + 4]; if (t > life) continue;
        const k = S_[o + 3], w = 1 - t / life;
        for (let m = 0; m < 5; m++) { const p = frag(S_[o], S_[o + 1], S_[o + 2], k, Math.max(0, t - m * .01)); hdot(p[0], p[1], p[2], big && m < 2 ? 2 : 1, 1.3 - .1 * m, Math.min(1, 1.4 * w) * (1 - m * .17), 0); }
      }
    }
  }
  /* fire sites: [x, y, z, ignition age s, strength]: the hole, the flight deck's starboard side, the hangar door,
     later the hangar roof as it burns inside */
  const hD = HD.destroyer.A.deckY;
  const FS = (() => {
    const r = rng(9505), s = [];
    s.push([9.9, HL[1] + .4, HL[2], .05, 1.6]);
    for (let k = 0; k < 8; k++) { const z = HL[2] + (r() - .45) * 12; s.push([9.8, 2.2 + 3.2 * r(), z, .3 + Math.abs(z - HL[2]) * .3, .5 + .6 * r()]); }
    for (let k = 0; k < 16; k++) { const z = -54.2 - 11 * Math.pow(r(), 1.3), x = 3 + 5.6 * r(); s.push([x, hD(z) + .05, z, .4 + (9 - x) * .35 + Math.abs(z - HL[2]) * .25 * r(), .55 + .7 * r()]); }
    for (let k = 0; k < 6; k++) s.push([1.4 + 5 * r(), hD(-53) + .1 + 2.2 * r(), -53.3, 1.5 + 4 * r(), .5 + .5 * r()]);
    for (let k = 0; k < 5; k++) s.push([1 + 5.5 * r(), 11.6, -44 - 8 * r(), 6 + 7 * r(), .45 + .35 * r()]);
    return s;
  })();
  /* the fires' intensity over the hit's age: taking hold, burning, dying back well before the seam */
  const fireK = a => (.8 + .35 * Math.exp(-a / 3)) * (1 - ss(14, 36, a));
  const WN = Math.hypot(WR[0], WR[2]), WX = WR[0] / WN, WZ = WR[2] / WN;
  function drawFires(a, T) {
    if (a < .05 || a > 40) return;
    if (!onScreen(4, 9, -56, 40)) return;
    const pxm = pxmAt(4, 8, -56), K = fireK(a), fr = Math.floor(T * 22), nk = clamp(pxm / 2.7, 1, 3.2), sz = pxm > 5 ? 2 : 1;
    for (let i = 0; i < FS.length; i++) {
      const f = FS[i], I = K * Math.min(1.3, f[4] * 1.2) * sat((a - f[3]) / 1.5) * (.82 + .18 * Math.sin(T * 1.7 + i));
      if (I <= .03) continue;
      // a tongue: wide and white-hot at the root, narrowing and cooling to the flickering tip, laid aft by the air
      const Ic = Math.min(1, I), hmax = (2 + 7 * f[4]) * (.35 + .65 * Ic), wd = .7 + .9 * f[4], n = Math.round((i < 9 ? 18 : 12) * nk * (.5 + .5 * Ic));
      for (let m = 0; m < n; m++) {
        const u = hsh(i * 37 + m, fr + i * 31), v = hsh(i * 37 + m + 101, fr), w = hsh(i * 41 + m, fr + 7);
        const vv = Math.pow(v, 1.6), hy = vv * hmax, lean = hy * .7, wid = wd * (1 - .75 * vv);
        hdot(f[0] + (u - .5) * wid + WX * lean, f[1] + hy, f[2] + (w - .5) * wid * 1.4 + WZ * lean, sz, (1.3 - .55 * vv) * (.78 + .22 * Ic), Ic * (1.15 - .55 * vv), 0);
      }
      if ((i < 9 || f[4] > .8) && P3(f[0], f[1] + 1.5, f[2]) && !occ(q.x, q.y, q.z)) hglow(q.x, q.y, clamp(3 * pxm * f[4], 4, 44), 1.2, .18 * Ic * (.75 + .25 * hsh(i, fr)));
    }
    // embers riding up out of the fires and away with the air
    for (let j = 0; j < 120; j++) {
      const f = FS[9 + (j % 22)], P = 1.1 + 1.4 * hsh(j, 3), ph = hsh(j, 5) * P, c = Math.floor((a + ph) / P), tt = a + ph - c * P;
      if (a - tt < f[3] + .5) continue;
      const up = (3 + 5 * hsh(j, c)) * tt, g0 = (j * 3 + c) & GM;
      hdot(f[0] + GT[g0] * .6 + WR[0] * tt * .7, f[1] + 1 + up, f[2] + GT[(g0 + 1) & GM] * .8 + WR[2] * tt * .7, 1, 1.1 - .25 * tt / P, K * f[4] * (1 - tt / P), 0);
    }
  }
  /* the smoke: a plume of warm gas off the hole, the flight deck and (once it burns inside) the hangar roof. Each
     particle is one dot, born at a rate that eases off as the fires die (birth ages tabled, none after ~33 s); it
     rises on its heat, spreads, and is carried aft by the air past the ship, cooling as it climbs. */
  const SMK = (() => {
    const L = 18, rate = t => 420 * Math.exp(-t / 2.2) + 175 * (1 - ss(18, 32, t)), bs = [];
    for (let t = 0, acc = 0; t < 33; t += .0005) { acc += rate(t) * .0005; while (acc >= 1) { acc -= 1; bs.push(.08 + t); } }
    const n = bs.length, b = Float32Array.from(bs), o = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) { o[i * 5] = gH(i, 11); o[i * 5 + 1] = gH(i, 13) * .6; o[i * 5 + 2] = gH(i, 17); o[i * 5 + 3] = hsh(i, 23); o[i * 5 + 4] = hsh(i, 29) < .45 ? 0 : hsh(i, 31) < .6 ? 1 : 2; }
    return { n, b, o, L };
  })();
  const SRC = [[HL[0] + 1.5, HL[1] + 2, HL[2]], [6, 6.5, -58], [3.5, 12, -48]];
  const smIdx = t => { const B = SMK.b; let lo = 0, hi = SMK.n; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < t) lo = m + 1; else hi = m; } return lo; };
  function drawSmoke(a) {
    if (a < .08 || a > 55) return;
    const Ob = SMK.o, B = SMK.b, i0 = smIdx(a - SMK.L), i1 = smIdx(a), big = pxmAt(4, 20, -60) > 6 ? 2 : 1;
    for (let i = i0; i < i1; i++) {
      const g = a - B[i], o = i * 5, s = Ob[o + 4];
      if (s === 2 && B[i] < 5) continue;
      const src = SRC[s], hgt = 55 * (1 - Math.exp(-g / 3.5)) + 2.2 * g, sig = .8 + 1.6 * Math.pow(g, .85), d = g - 1.2 * (1 - Math.exp(-g / 1.2)), rn = Ob[o + 3];
      // warm low down (lit from under by the fires while they burn), cooling as it climbs and spreads
      const h = .25 + .38 * Math.exp(-g / 1.1) + .12 * Math.exp(-g / 6) * (.4 + .6 * fireK(B[i]));
      hdot(src[0] + WR[0] * d + Ob[o] * sig, src[1] + hgt + Ob[o + 1] * sig, src[2] + WR[2] * d + Ob[o + 2] * sig, g < 6 ? big : 1, h,
        (.4 + .5 * rn) * sat(g / .25) * (1 - ss(SMK.L - 6, SMK.L, g)), 0, rn);
    }
  }
  function drawHit(T) {
    const a = T - T_HIT; if (a < 0 || a > 55) return;
    drawSmoke(a);
    drawFires(a, T);
    drawDebris(a);
    drawFireball(a);
    // the flash
    if (a < .6 && P3(HL[0], HL[1], HL[2])) {
      const w = Math.exp(-a * 7), pxm = FL / q.z;
      markDisc(q.x, q.y - 10, q.z - 30, clamp(pxm * 16, 20, 80) * (.5 + .5 * w), 1);
      hput(q.x, q.y, 6, 1.3, 1);
      hglow(q.x, q.y, clamp(pxm * 18, 10, 90) * (.5 + .5 * w), 1.3, .9 * w);
    }
    // the light of it: a saturating flash for a few frames, then the fireball's glow while it is young
    if (a < 4 && P3(HL[0], HL[1] + 8 * sat(a), HL[2])) {
      const sc = clamp(FL / q.z / 2.8, .8, 3);
      bloom(q.x, q.y, (110 + 380 * sat(a / .15)) * sc, 1.05 * Math.exp(-a * 15));
      bloom(q.x, q.y - 20 * sc * sat(a), (90 + 80 * sat(a)) * sc, .4 * Math.exp(-a * .9));
      veil(q.x, q.y, .32 * Math.exp(-a * 17));
    }
  }
  /* the plating round the breach: white-hot at the hole, the heat spreading over the flight deck, the hangar door
     and (as it burns inside) the hangar's roof; cooling slowly, gone before the seam */
  function hitHeat(ctx, T) {
    const a = T - T_HIT; if (a < 0 || a > 60) return;
    const k = 1 - ss(132, 152, T);
    hotAt(ctx, HL[0], HL[1], HL[2], 2.5 + 5.5 * (1 - Math.exp(-a / 6)), k * (1.1 * Math.exp(-a / 2.5) + .55 * Math.exp(-a / 18)));
    hotAt(ctx, 5, 8, -54.2, 3 + 6 * (1 - Math.exp(-a / 9)), k * .8 * sat(a / 1.2) * Math.exp(-a / 26));
    hotAt(ctx, 6, 5.8, -61, 3 + 5 * (1 - Math.exp(-a / 8)), k * .6 * sat(a / 2) * Math.exp(-a / 22));
    hotAt(ctx, 3, 11.8, -48, 7, k * .38 * ss(4, 16, a) * Math.exp(-a / 30));
  }

  /* ================= the hooks ================= */
  function pumpAt(T) {
    let p = 0;
    for (const s of SH) { const a = T - s.tL; if (a >= 0 && a < 8) p += .8 * Math.exp(-a * 3) + .12 * Math.exp(-a * .7); }
    for (const B of BURSTS) { const a = T - B.t0; if (a >= 0 && a < 6) p += B.pump * (Math.exp(-a * 3.5) + .15 * Math.exp(-a * .8)); }
    const a = T - T_HIT; if (a >= 0 && a < 30) p += 1.5 * Math.exp(-a * 2.4) + .3 * Math.exp(-a / 4);
    return p;
  }
  PG.shipStateFx = (st, T) => st;
  const GREY0 = S.grey;
  PG.heatFx = function (T, ctx) {
    nhot = 0; nbl = 0; VEIL = 0;
    WY = S.wipe >= 0 && S.wipe < 1 ? S.wipe * 1080 : 1e9;
    // the AGC: a very hot source widens the window; white-hot darkens round it, black-hot washes the cold field
    // out towards light grey while the source goes black
    const p = pumpAt(T);
    if (p > .002) S.hi = S.lo + (S.hi - S.lo) * (1 + p);
    S.grey = Math.min(.9, GREY0 * (1 + .6 * Math.min(1.2, p)));
    // the deck round a cell stays warm after a launch
    for (const s of SH) { const a = T - s.tL; if (a >= 0 && a < 30) hotAt(ctx, s.P0[0], s.P0[1] + .3, s.P0[2], 3 + 5 * sat(a / .5), (.8 * Math.exp(-a / .7) + .28 * Math.exp(-a / 10)) * (1 - ss(20, 30, a))); }
    // the Phalanx: the barrels and the muzzle heat while it fires
    const bh = barrelH(T);
    if (bh > .005 || firing(T)) {
      const Mx = mount(T), b = X.ap(Mx, BAR), b2 = X.ap(Mx, BAR2), m = X.ap(Mx, MZ);
      hotAt(ctx, b[0], b[1], b[2], .9, bh);
      hotAt(ctx, b2[0], b2[1], b2[2], .8, .85 * bh);
      if (firing(T)) hotAt(ctx, m[0], m[1], m[2], .5, .5 + .6 * bh);
      ctx.partHeat[ctx.PID.ciwsA] += .07 * bh;
    }
    hitHeat(ctx, T);
  };
  PG.launchFx = function (T, ctx) {
    FL = ctx.cam.fl;
    if (T < 65 || T > 104) return;
    for (const s of SH) {
      if (T < s.tL) continue;
      drawCell(s, T);
      drawColumn(s, T);
      drawHead(s, T);
    }
  };
  PG.interceptFx = function (T, ctx) {
    if (T < 79.9 || T > 115) return;
    for (const B of BURSTS) if (B !== B43) drawBurst(B, T);
  };
  PG.ciwsFx = function (T, ctx) {
    if (T < FIRE[0][0] - .1 || T > 116) return;
    drawMuzzle(T);
    drawTracers(T);
    drawBurst(B43, T);
  };
  PG.hitFx = function (T, ctx) { drawHit(T); };
  /* a small shake as the blast reaches the imager's own ship */
  const T_BLAST = T_HIT + 3950 / 343;
  PG.shakeFx = T => T > T_BLAST && T < T_BLAST + 3 ? 2.6 * Math.exp(-(T - T_BLAST) / .55) * sat((T - T_BLAST) / .06) : 0;

  /* ================= overlay: blooms, the veil, tags ================= */
  const TP = [0, 0, 0];
  const proj = (cam, x, y, z) => { TP[0] = x; TP[1] = y; TP[2] = z; return cam.project(TP); };
  PG.fxOverlay = function (T, octx, tags, ctx) {
    // blooms: light in white-hot, a dark stain in black-hot
    for (let i = 0; i < nbl; i++) {
      const o = i * 5, x = BLM[o], y = BLM[o + 1], r = BLM[o + 2], al = Math.min(1, BLM[o + 3]), g = octx.createRadialGradient(x, y, 0, x, y, r);
      if (BLM[o + 4]) {
        // the imager's edge enhancement rings a black-hot source with a light halo
        const hr = r * 1.3, h = octx.createRadialGradient(x, y, 0, x, y, hr);
        h.addColorStop(0, 'rgba(226,228,218,0)'); h.addColorStop(.38, 'rgba(226,228,218,0)'); h.addColorStop(.6, `rgba(226,228,218,${(al * .11).toFixed(3)})`); h.addColorStop(1, 'rgba(226,228,218,0)');
        octx.globalCompositeOperation = 'lighter'; octx.fillStyle = h; octx.fillRect(x - hr, y - hr, 2 * hr, 2 * hr);
        g.addColorStop(0, `rgba(2,3,2,${(al * .96).toFixed(3)})`); g.addColorStop(.3, `rgba(2,3,2,${(al * .6).toFixed(3)})`); g.addColorStop(.55, `rgba(2,3,2,${(al * .12).toFixed(3)})`); g.addColorStop(1, 'rgba(2,3,2,0)');
        octx.globalCompositeOperation = 'source-over';
      } else {
        g.addColorStop(0, `rgba(252,252,244,${al.toFixed(3)})`); g.addColorStop(.25, `rgba(238,238,228,${(al * .34).toFixed(3)})`); g.addColorStop(1, 'rgba(238,238,228,0)');
        octx.globalCompositeOperation = 'lighter';
      }
      octx.fillStyle = g; octx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // the veil: the detector flooded for a moment, strongest round the source
    if (VEIL > .004) {
      const bh = bhY(VY), g = octx.createRadialGradient(VX, VY, 0, VX, VY, 1400), c = bh ? '2,3,2' : '238,238,228';
      g.addColorStop(0, `rgba(${c},${Math.min(.9, VEIL).toFixed(3)})`); g.addColorStop(.45, `rgba(${c},${(VEIL * .45).toFixed(3)})`); g.addColorStop(1, `rgba(${c},0)`);
      octx.globalCompositeOperation = bh ? 'source-over' : 'lighter'; octx.fillStyle = g; octx.fillRect(0, 0, 1920, 1080);
    }
    octx.globalCompositeOperation = 'source-over';
    const cam = ctx.cam;
    // the interceptors: "launch" on the new bird, "miss" as I3 passes over the weaving round
    for (const s of SH) {
      const a = T - s.tL;
      if (a > .35 && a < 3.4) {
        const p = cam.project(PG.shotAt(s, T, HP));
        if (p) tags.push({ key: 'sm' + s.id, id: 'SM-6', txt: 'launch', cls: 'lime sm', ax: p[0], ay: p[1], x: p[0] + 26, y: p[1] - 46, a: sat((a - .35) / .3) * (1 - ss(2.8, 3.4, a)), pri: 7 });
      }
      if (s.miss && T > s.tI - .1 && T < s.tEnd) {
        const p = cam.project(PG.shotAt(s, T, HP));
        if (p) tags.push({ key: 'miss', id: 'SM-6', txt: 'miss', cls: 'lime sm', ax: p[0], ay: p[1], x: p[0] + 24, y: p[1] - 44, a: sat((T - s.tI + .1) / .25) * (1 - ss(s.tEnd - .35, s.tEnd, T)), pri: 7 });
      }
    }
    // the incoming: "stopped" where each died, "hit" on the ship
    for (const B of BURSTS) {
      if (B.k < 0) continue;
      const a = T - B.t0; if (a < .05 || a > 3.6) continue;
      const p = proj(cam, B.p[0], B.p[1], B.p[2]); if (!p) continue;
      tags.push({ key: 'stop' + B.k, id: 'TRK ' + PG.RND[B.k].id, txt: 'stopped', cls: 'coral sm', ax: p[0], ay: p[1], x: p[0] + 30, y: p[1] - 60, a: sat((a - .05) / .15) * (1 - ss(2.9, 3.6, a)), pri: 8 });
    }
    const ah = T - T_HIT;
    if (ah > .05 && ah < 7.5) {
      const p = proj(cam, HL[0], HL[1] + 4, HL[2]);
      if (p) tags.push({ key: 'hit', id: 'TRK ' + PG.RND[3].id, txt: 'hit', cls: 'coral', ax: p[0], ay: p[1], x: p[0] + 90, y: p[1] - 150, a: sat((ah - .05) / .15) * (1 - ss(6.2, 7.5, ah)), pri: 9 });
    }
  };

  /* ================= sound ================= */
  const SFX = STAGE.SFX;
  const hatch = () => { SFX.tone(170, 95, .14, 'square', .016); SFX.noise(.25, 700, .6, .018, .005); };
  const launch = () => { SFX.noise(4.8, 230, .8, .075, .12); SFX.noise(1.7, 1300, .5, .026, .04); SFX.tone(56, 36, 3.2, 'sine', .05); };
  const farBoom = () => { SFX.noise(2.4, 150, .9, .07, .03); SFX.tone(70, 32, 1.4, 'sine', .04); };
  const blip = () => { SFX.tone(1240, 1240, .045, 'square', .01); SFX.tone(930, 930, .06, 'square', .008, .07); };
  const pop = () => { SFX.noise(1.1, 420, .7, .04, .01); SFX.tone(90, 50, .6, 'sine', .02); };
  const brrt = d => { SFX.tone(75, 72, d, 'sawtooth', .026); SFX.tone(150, 146, d, 'square', .008); SFX.noise(d, 2300, .7, .034, .02); };
  const bigBoom = () => { SFX.noise(.22, 4600, .5, .12, .002); SFX.noise(3.2, 170, .9, .2, .01); SFX.tone(110, 36, 1.6, 'sine', .1); SFX.noise(3, 900, .6, .04, .4, .35); };
  const cues = [];
  for (const s of SH) cues.push([s.tL - .5, hatch], [s.tL, launch]);
  for (const s of SH) if (!s.miss) cues.push([s.tI, farBoom], [s.tI + .06, blip]);
  cues.push([POP.t0, pop]);
  cues.push([CI.t0, () => SFX.tone(380, 520, 1.4, 'square', .006)]);
  cues.push([CI.tOpen - .9, () => { SFX.tone(160, 1500, .85, 'sawtooth', .008); SFX.tone(1500, 1450, 4, 'sine', .004, .85); }]);
  for (const f of FIRE) cues.push([f[0], () => brrt(f[1] - f[0])]);
  cues.push([T43, bigBoom], [T43 + .06, blip]);
  cues.push([T_HIT, () => { SFX.noise(.35, 5200, .5, .14, .002); SFX.tone(70, 24, 4.5, 'sine', .16); SFX.noise(5, 120, 1, .22, .05); SFX.noise(3.5, 700, .6, .05, .3); }]);
  cues.push([T_HIT + 1.5, () => SFX.noise(12, 1800, .4, .02, 2)]);
  cues.push([T_BLAST, () => { SFX.noise(3.5, 110, 1, .12, .08); SFX.tone(48, 30, 2.5, 'sine', .07); }]);
  cues.push([CI.tBack0, () => SFX.tone(520, 380, 1.6, 'square', .005)]);
  PG.fxCues = cues;
})();
