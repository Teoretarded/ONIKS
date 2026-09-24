/* ENGAGEMENT: the hit and the picture. Chapter 4 (T 90-108): round 4 reaches TRK 21's starboard side amidships at
   PD.T_HIT = 95, deep in the x0.1 slow motion (94.2-98.6): a lime-white bloom of dots rolls out of the hole and a
   jet of fire punches up through the deck, spray climbs off the water, fragments and sparks streak outward, the
   hole goes dark with a burning rim, fires take hold along the side and the deck, a dot smoke column rises and is
   carried off by the air the ship steams through (PD.WIND, seen from the ship: mostly aft), and the ship settles
   into a slight starboard list. Chapter 5 (108-152): on the scope TRK 21's returns flare (taller, brighter, a
   smear of returns down the smoke's track), then thin, and are back to normal by ~149.5 so the seam is exact.
   Spectacle only. Everything alive across PD.TJ = 104.5 is placed as PD.ship(0, PD.tau(T)) + a ship-relative
   offset and aged in sim time PD.S(T) - PD.TAU_HIT (continuous); particles are analytic in their birth time and a
   seeded index. PD.shipX(0, .) carries the list, which eases away again while the dot world is gone (T ~126-132).
   Hooks for the other files: PD.hitFx / hitOverlay / scopeContact / scopeTag (stage A), plus PD.hitScope (extra
   returns drawn after the scope), PD.scopeTagA (TRK 21's scope tag fades out and back in while 'hit' becomes 'DDG'),
   PD.hitShake (px, the film's camera), PD.paintK (dots.js: the beam's lime paint held off the hull in the slow
   motion). PD.CIWS.fire[1] is extended to fire until just before the round is in. */
(function () {
  'use strict';
  const PD = window.PD, DW = PD.DW;
  const { R, E, rng } = M3;
  const { DEG, TAU, LIME, WH, hsh, gH, FWD, STB, VS } = PD;
  const sat = E.sat, ss = E.ss, G2 = 4.905;
  const q = DW.q, P3 = DW.P3, put = DW.put, glow = DW.glow, dset = DW.dset;
  const WIND = PD.WIND || [1.7, 0, -1.1];
  const TH = PD.T_HIT, SH = PD.TAU_HIT, SR = PD.shipR, HL = PD.HIT_L;
  /* sim seconds since the hit, continuous over the whole film (negative before it) */
  const ageOf = T => PD.S(T) - SH;
  const simOfTau = tau => tau < 0 ? tau + PD.SD : tau;
  /* the air and the water as the ship sees them (it steams at VS through both) */
  const VA = [WIND[0] - FWD[0] * VS, 0, WIND[2] - FWD[2] * VS], VW = [-FWD[0] * VS, 0, -FWD[2] * VS];
  const VAL = Math.hypot(VA[0], VA[2]), VAN = [VA[0] / VAL, 0, VA[2] / VAL];
  const OUT = STB;                                                    // outboard from the hit
  const ml = p => R.ap(SR, p);                                        // model offset -> ship-relative (no list)
  const HR = ml(HL);
  /* the hull's starboard side at the hit (from the HD model's own dots): x of the plating by height */
  const XS = [9.11, 9.37, 9.56, 9.68, 9.84, 9.97, 9.99];
  const xSide = y => { const u = E.clamp(y, 0, 5.99), i = Math.floor(u); return XS[i] + (XS[i + 1] - XS[i]) * (u - i); };
  const GN = 8192, GM = GN - 1, GT = new Float32Array(GN);
  for (let i = 0; i < GN; i++) GT[i] = gH(i, 9157);
  const HOT = [255, 255, 248], LW = [222, 246, 150], FIRE = [255, 196, 138], GREY = [206, 210, 200];

  /* ---------- the list: a small roll away from the blast, then settling to starboard as she floods ---------- */
  function listAt(a) {
    if (a <= 0) return null;
    const back = 1 - ss(26, 32, a);
    if (back <= 0) return null;
    const roll = (4.2 * DEG * (1 - Math.exp(-a / 7)) - 1.5 * DEG * Math.exp(-a / 2.6) * Math.sin(TAU * a / 8.4)) * back;
    return { roll, sink: .32 * (1 - Math.exp(-a / 7)) * back };
  }
  const sx0 = PD.shipX; let noList = false;
  PD.shipX = function (j, tau) {
    const Xs = sx0(j, tau);
    if (j !== 0 || noList) return Xs;
    const L = listAt(simOfTau(tau) - SH);
    if (!L) return Xs;
    return { R: R.mul(Xs.R, R.z(-L.roll)), T: [Xs.T[0], Xs.T[1] - L.sink, Xs.T[2]] };
  };
  // the wake lies on the water: it does not roll with the hull
  const wake0 = DW.drawWake;
  DW.drawWake = function (j, T, a) { noList = true; try { wake0(j, T, a); } finally { noList = false; } };

  /* the Monolith-B's paint would sit on the hull through the slow motion and tint the bloom: hold it back there */
  PD.paintK = (j, T) => j ? 1 : 1 - .9 * ss(94.3, 94.9, T) * (1 - ss(100.5, 101.6, T));

  /* ---------- the gun keeps firing until the round is in: its last stream whips past in the slow motion ---------- */
  if (PD.CIWS && PD.CIWS.fire[1]) PD.CIWS.fire[1].s1 = SH - .05;

  /* ---------- the bloom: lobes rolling out of the hole (never into the hull), a jet up through the deck ----------
     Templates in random order: a frame draws a prefix sized to the bloom's screen area, so it stays a dense
     surface of separate dots from 90 m and costs little from a kilometre. */
  const BL = (() => {
    const r = rng(9501), n = 12500, NLB = 11, a = new Float32Array(n * 5), LB = [];
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
  const JT = (() => {
    const r = rng(9507), n = 4200, a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = Math.pow(r(), .75); a[i * 4 + 1] = gH(i, 71); a[i * 4 + 2] = gH(i, 73); a[i * 4 + 3] = r(); }
    return { n, a };
  })();
  const VENT = ml([7.6, 6.7, -7.5]);
  /* heat 1 -> 0: white-hot with a lime skin, warm, grey; returns alpha, writes CC */
  const CC = [0, 0, 0];
  function heatCol(heat, skin) {
    if (heat > .52) {
      const u = (heat - .52) / .48, l = skin * skin * .9 * (.35 + .65 * u);
      CC[0] = HOT[0] + (LW[0] - HOT[0]) * l; CC[1] = HOT[1] + (LW[1] - HOT[1]) * l; CC[2] = HOT[2] + (LW[2] - HOT[2]) * l;
      if (u < .45) { const w = (1 - u / .45) * .7; CC[0] += (FIRE[0] - CC[0]) * w; CC[1] += (FIRE[1] - CC[1]) * w; CC[2] += (FIRE[2] - CC[2]) * w; }
      return .9 + .5 * u;
    }
    if (heat > .16) { const u = (heat - .16) / .36; CC[0] = GREY[0] + (FIRE[0] - GREY[0]) * u; CC[1] = GREY[1] + (FIRE[1] - GREY[1]) * u; CC[2] = GREY[2] + (FIRE[2] - GREY[2]) * u; return .34 + .56 * u; }
    CC[0] = GREY[0]; CC[1] = GREY[1]; CC[2] = GREY[2]; return .2 + .2 * (heat / .16);
  }
  /* the fireball's centre (ship-relative) and radius after t */
  const BC = [0, 0, 0];
  function bloomC(t) {
    const vent = 8 * (1 - Math.exp(-t * 5)), up = 5.5 * t + 4 * (1 - Math.exp(-t * 3)), dr = t - .8 * (1 - Math.exp(-t / .8));
    BC[0] = HR[0] + OUT[0] * vent + VA[0] * dr; BC[1] = HR[1] + up; BC[2] = HR[2] + OUT[2] * vent + VA[2] * dr;
    return 30 * (1 - Math.exp(-t * 7)) + 4 * t;
  }
  const BLOOM_T0 = .006, BLOOM = { ok: false, x: 0, y: 0, r: 0, t: 0 };
  function drawBloom(a, O, G) {
    if (a < BLOOM_T0 || a > 5.2) return;
    const t = a - BLOOM_T0, Rb = bloomC(t), cx = O[0] + BC[0], cy = BC[1], cz = O[2] + BC[2];
    const zc = CAM.depth([cx, cy, cz]); if (zc < -Rb) return;
    const Rpx = Math.min(2000, Rb * CAM.fl / Math.max(1, zc)), N = Math.min(BL.n, Math.max(2400, Math.round(Math.PI * Rpx * Rpx / 15)));
    const fade = G * (1 - ss(3, 5.2, t)), thin = .4 * ss(1.4, 4, t), B = BL.a;
    for (let i = 0; i < N; i++) {
      const o = i * 5, rn = B[o + 4]; if (rn < thin) continue;
      const lx = B[o], ly = B[o + 1], lz = B[o + 2], rr = B[o + 3];
      const y = cy + ly * Rb; if (y < .2) continue;
      if (!P3(cx + (OUT[0] * lx + FWD[0] * lz) * Rb, y, cz + (OUT[2] * lx + FWD[2] * lz) * Rb)) continue;
      const heat = Math.exp(-t * (.34 + 1.15 * rr) * (.7 + .6 * ((rn * 7.31) % 1)));
      const al = heatCol(heat, rr), b = fade * al * (heat > .52 ? .6 + .7 * rn : .3 + 1 * rn * rn);
      put(q.x, q.y, q.z < 60 ? 3 : q.z < 1600 && (heat > .4 || rn > .7) ? 2 : 1, CC[0], CC[1], CC[2], b > 1 ? 1 : b);
    }
    // the jet up through the deck: fast, narrow, rolling over at the top
    const H = 44 * (1 - Math.exp(-t * 2.2)) + 3 * t, J = JT.a, NJ = Math.min(JT.n, Math.max(1200, Math.round(N * .4)));
    const d2 = t - .6 * (1 - Math.exp(-t / .6)), jf = G * (1 - ss(2.2, 4.4, t));
    if (jf > .01) for (let i = 0; i < NJ; i++) {
      const o = i * 4, s = J[o], rn = J[o + 3]; if (rn < thin) continue;
      const hs = s * H, rad = .8 + 7 * s * s * (1 - Math.exp(-t * 2.5)) + 1.3 * t;
      const y = VENT[1] + hs + J[o + 2] * rad * .35;
      if (!P3(O[0] + VENT[0] + J[o + 1] * rad * OUT[0] + J[o + 2] * rad * FWD[0] * .8 + VA[0] * d2 * s, y, O[2] + VENT[2] + J[o + 1] * rad * OUT[2] + J[o + 2] * rad * FWD[2] * .8 + VA[2] * d2 * s)) continue;
      const heat = Math.exp(-t * (.8 + 1.8 * s) * (.75 + .5 * rn));
      const al = heatCol(heat, s * .85), b = jf * al * (heat > .52 ? .55 + .7 * rn : .3 + .9 * rn * rn);
      put(q.x, q.y, q.z < 60 ? 3 : q.z < 1600 && heat > .4 ? 2 : 1, CC[0], CC[1], CC[2], b > 1 ? 1 : b);
    }
    // the hot heart of it in the dot buffer (the wide light is a gradient on the overlay)
    BLOOM.ok = false;
    if (P3(cx, cy, cz)) {
      glow(q.x, q.y, Math.min(110, .45 * Rpx + 8), 255, 250, 236, .55 * Math.exp(-t * 3.5) * G);
      BLOOM.ok = true; BLOOM.x = q.x; BLOOM.y = q.y; BLOOM.r = Rpx; BLOOM.t = t;
    }
  }
  /* the impact itself, before the bloom: a lime-white star on the plating */
  function drawImpact(a, O, G) {
    if (a < 0 || a > .012) return;
    if (!P3(O[0] + HR[0], HR[1], O[2] + HR[2])) return;
    const w = 1 - a / .012;
    put(q.x, q.y, 5, 255, 255, 250, G);
    glow(q.x, q.y, Math.min(120, 8 + 9000 / q.z), LIME[0], LIME[1], LIME[2], .35 * G * w);
    glow(q.x, q.y, Math.min(40, 3 + 2600 / q.z), 255, 255, 240, .9 * G);
  }

  /* ---------- spray: a curtain off the water under the hit, a ring of foam ---------- */
  const SPR = (() => {
    const r = rng(9502), n = 3200, a = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const z0 = (r() - .5) * 15, x0 = .3 + 3 * r(), cen = 1 - Math.min(1, Math.abs(z0) / 8.5);
      const vo = 4 + 26 * Math.pow(r(), 1.4), vu = (10 + 46 * Math.pow(r(), .7)) * (.4 + .6 * cen), va = (r() - .5) * 10, k = .4 + 1.2 * r();
      const yAt = t => vu * (1 - Math.exp(-k * t)) / k - G2 * t * t;
      let lo = .05, hi = 12; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > 0) lo = m; else hi = m; }
      a.set([x0, z0, vo, vu, va, k, r(), lo], i * 8);
    }
    return { n, a };
  })();
  const WL = ml([9.1, 0, HL[2]]);
  function drawSpray(a, O, G) {
    const t = a - .012; if (t < 0 || t > 6) return;
    const A = SPR.a, bx = O[0] + WL[0] + VW[0] * t, bz = O[2] + WL[2] + VW[2] * t;
    for (let i = 0; i < SPR.n; i++) {
      const o = i * 8, tl = A[o + 7]; if (t > tl) continue;
      const k = A[o + 5], e = (1 - Math.exp(-k * t)) / k, out = A[o] + A[o + 2] * e, al = A[o + 1] + A[o + 4] * e;
      const y = A[o + 3] * e - G2 * t * t; if (y < 0) continue;
      if (!P3(bx + OUT[0] * out + FWD[0] * al, y, bz + OUT[2] * out + FWD[2] * al)) continue;
      const s = A[o + 6], b = G * (.4 + .6 * s) * (1 - .6 * t / tl) * (t < .04 ? t / .04 : 1);
      put(q.x, q.y, q.z < 700 && s > .4 ? 2 : 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
    }
    // foam racing out over the water, only outboard (the hull stands in the inboard half)
    if (t < 3.6) {
      const rr = 4 + 64 * (1 - Math.exp(-t * 1.25)), al = G * .7 * (1 - t / 3.6);
      for (let j = 0; j < 320; j++) {
        const th = (j / 320 - .5) * Math.PI * 1.25 + hsh(j, 41) * .02, rj = rr * (.96 + .08 * hsh(j, 43));
        const c = Math.cos(th), s = Math.sin(th);
        if (P3(bx + (OUT[0] * c + FWD[0] * s) * rj, .35, bz + (OUT[2] * c + FWD[2] * s) * rj)) put(q.x, q.y, q.z < 500 ? 2 : 1, WH[0], WH[1], WH[2], al * (.5 + .5 * hsh(j, 47)));
      }
    }
  }

  /* ---------- fragments: specks and burning brands out of the hole, splashes where they land; sparks ---------- */
  const DEB = (() => {
    const r = rng(9503), n = 700, a = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      let dx = .3 + r(), dy = -.2 + 1.3 * r(), dz = (r() - .5) * 1.7; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const sp = 12 + 150 * Math.pow(r(), 2.8), k = .3 + 1.4 * r();
      const vx = (OUT[0] * dx + FWD[0] * dz) * sp, vy = dy * sp, vz = (OUT[2] * dx + FWD[2] * dz) * sp;
      const yAt = t => HR[1] + vy * (1 - Math.exp(-k * t)) / k - G2 * t * t;
      let lo = .01, hi = 14; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (yAt(m) > 0) lo = m; else hi = m; }
      a.set([vx, vy, vz, k, r(), i % 4 === 0 ? 1 : 0, lo, 0, 0], i * 9);
    }
    return { n, a };
  })();
  const SPK = (() => {
    const r = rng(9504), n = 220, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      let dx = .15 + r(), dy = -.3 + 1.5 * r(), dz = (r() - .5) * 2.2; const l = Math.hypot(dx, dy, dz), sp = 70 + 190 * r();
      a.set([(OUT[0] * dx + FWD[0] * dz) / l * sp, dy / l * sp, (OUT[2] * dx + FWD[2] * dz) / l * sp, 2.5 + 2.5 * r(), .2 + .5 * r()], i * 5);
    }
    return { n, a };
  })();
  /* ship-relative position of a dragged fragment after t (air-relative drag, gravity) */
  const FP = [0, 0, 0];
  function frag(vx, vy, vz, k, t) {
    const e = (1 - Math.exp(-k * t)) / k;
    FP[0] = HR[0] + VA[0] * t + (vx - VA[0]) * e; FP[1] = HR[1] + vy * e - G2 * t * t; FP[2] = HR[2] + VA[2] * t + (vz - VA[2]) * e;
    return FP;
  }
  function drawDebris(a, O, G) {
    const t = a - .008; if (t < 0 || t > 10) return;
    const D = DEB.a;
    for (let i = 0; i < DEB.n; i++) {
      const o = i * 9, vx = D[o], vy = D[o + 1], vz = D[o + 2], k = D[o + 3], rn = D[o + 4], brand = D[o + 5], tl = D[o + 6];
      if (t < tl) {
        const hot = Math.exp(-t * 1.6);
        if (brand) for (let m = 1; m < 16; m++) {
          const t2 = t - m * .03; if (t2 < 0) break;
          const p = frag(vx, vy, vz, k, t2), u = m / 16;
          if (P3(O[0] + p[0], p[1] + m * .12, O[2] + p[2])) put(q.x, q.y, q.z < 400 && m < 5 ? 2 : 1, 255 - 50 * u, 196 + 18 * u, 140 + 66 * u, G * .85 * (1 - u) * (1 - .5 * t / tl));
        }
        const p = frag(vx, vy, vz, k, t);
        if (!P3(O[0] + p[0], p[1], O[2] + p[2])) continue;
        const b = G * (brand ? 1 : .5 + .45 * rn) * (.55 + .45 * hot);
        put(q.x, q.y, q.z < 900 && (brand || rn > .6) ? 2 : 1, 255, brand ? 214 : 236 + 19 * hot, brand ? 160 : 222 + 30 * hot, b > 1 ? 1 : b);
      } else if (t < tl + 1.2) {
        // the splash: a few drops thrown up, left behind by the ship
        const w = t - tl, p = frag(vx, vy, vz, k, tl), x = O[0] + p[0] + VW[0] * w, z = O[2] + p[2] + VW[2] * w, al = G * .75 * (1 - w / 1.2);
        for (let m = 0; m < 4; m++) {
          const vs = 3 + m * 2.3 + rn * 3, yy = vs * w - G2 * w * w; if (yy < 0) continue;
          if (P3(x + GT[(i * 4 + m) & GM] * .5 * (1 + w), yy, z + GT[(i * 4 + m + 1) & GM] * .5 * (1 + w))) put(q.x, q.y, q.z < 700 ? 2 : 1, WH[0], WH[1], WH[2], al);
        }
      }
    }
    // sparks: white streaks going warm as they slow
    if (t < 1.1) {
      const S_ = SPK.a;
      for (let i = 0; i < SPK.n; i++) {
        const o = i * 5, life = S_[o + 4]; if (t > life) continue;
        const k = S_[o + 3], w = 1 - t / life;
        for (let m = 0; m < 5; m++) {
          const t2 = Math.max(0, t - m * .01), p = frag(S_[o], S_[o + 1], S_[o + 2], k, t2);
          if (!P3(O[0] + p[0], p[1], O[2] + p[2])) continue;
          const hw = Math.min(1, 1.4 * w) * (1 - m * .17);
          put(q.x, q.y, q.z < 600 && m < 2 ? 2 : 1, 255, 190 + 65 * w, 130 + 110 * w * w, G * hw);
        }
      }
    }
  }

  /* ---------- the hole and the fires (on the hull: they roll with the list) ---------- */
  const HOLE = (() => {
    const inner = [], rim = [];
    for (let y = 1.5; y <= 6.45; y += .15) for (let z = -4.6; z <= 4.6; z += .15) {
      const dy = y - HL[1], dz = z * .82, d = Math.hypot(dy, dz), th = Math.atan2(dy, dz);
      const rad = 2.3 * (1 + .28 * M3.noise(Math.cos(th) * 1.3 + 4, Math.sin(th) * 1.3, 2.2) + .12 * Math.sin(5 * th + 1));
      const x = xSide(y) + .03, p = [x, y, HL[2] + z];
      if (d < rad - .12) inner.push(p[0], p[1], p[2]);
      else if (d < rad + .16 && hsh(Math.round(y * 50), Math.round(z * 50)) < .75) rim.push(p[0], p[1], p[2]);
    }
    return { inner: new Float32Array(inner), rim: new Float32Array(rim) };
  })();
  /* fire sites: [x, y, z, ignition age (s), strength, outward x] */
  const FS = (() => {
    const r = rng(9505), s = [];
    s.push([xSide(HL[1]) + .1, HL[1], HL[2], .05, 1.7]);
    for (let k = 0; k < 26; k++) {
      const z = HL[2] + (r() - .42) * 26, y = 1.4 + 5 * r(), d = Math.hypot(z - HL[2], (y - HL[1]) * 1.4);
      s.push([xSide(y) + .12, y, z, .35 + d * (.3 + .45 * r()), (.5 + .7 * r()) * Math.exp(-d / 13)]);
    }
    for (let k = 0; k < 18; k++) { const z = HL[2] + (r() - .5) * 22; s.push([7 + 2.8 * r(), 6.75, z, .5 + Math.abs(z - HL[2]) * (.25 + .4 * r()), .6 + .6 * r()]); }
    for (let k = 0; k < 9; k++) s.push([6.25, 7.6 + 2.7 * r(), HL[2] - 2 - 11 * r(), 1.2 + 4 * r(), .5 + .5 * r()]);
    for (let k = 0; k < 3; k++) s.push([8.6, 7.3, HL[2] - 1.5 - 4 * k, .6 + k * 1.3, .9]);
    return s;
  })();
  const NMAIN = 6;
  /* the listed hull transform for this frame, as flat numbers */
  let M0 = 1, M1 = 0, M2 = 0, M3_ = 0, M4 = 1, M5 = 0, M6 = 0, M7 = 0, M8 = 1, T0 = 0, T1 = 0, T2 = 0;
  const hullAt = tau => { const Xs = PD.shipX(0, tau), M = Xs.R; M0 = M[0]; M1 = M[1]; M2 = M[2]; M3_ = M[3]; M4 = M[4]; M5 = M[5]; M6 = M[6]; M7 = M[7]; M8 = M[8]; T0 = Xs.T[0]; T1 = Xs.T[1]; T2 = Xs.T[2]; };
  const P3m = (x, y, z) => P3(M0 * x + M1 * y + M2 * z + T0, M3_ * x + M4 * y + M5 * z + T1, M6 * x + M7 * y + M8 * z + T2);
  const BG = [9, 10, 8];
  function drawHole(a, G) {
    if (a < .02) return;
    const k = G * sat((a - .02) / .05), I = HOLE.inner, Rm = HOLE.rim, big = P3m(HL[0], HL[1], HL[2]) && q.z < 260;
    for (let i = 0; i < I.length; i += 3) if (P3m(I[i], I[i + 1], I[i + 2])) dset(q.x, q.y, big ? 2 : 1, BG, .9 * k);
    const fr = Math.floor((SH + a) * 20);
    for (let i = 0, j = 0; i < Rm.length; i += 3, j++) {
      if (!P3m(Rm[i], Rm[i + 1], Rm[i + 2])) continue;
      const f = hsh(j, fr), b = k * (.45 + .55 * f) * (.5 + .5 * Math.exp(-a / 6));
      put(q.x, q.y, big ? 2 : 1, 255, 150 + 70 * f, 96 + 60 * f, b > 1 ? 1 : b);
    }
  }
  function drawFires(a, G) {
    if (a < .05) return;
    const S = SH + a, fr = Math.floor(S * 22);
    for (let i = 0; i < FS.length; i++) {
      const f = FS[i], I = G * Math.min(1.25, f[4] * 1.2) * sat((a - f[3]) / 1.2) * (.8 + .2 * Math.sin(S * 1.7 + i));
      if (I <= .02) continue;
      const hmax = 2 + 4.2 * f[4], n = i < NMAIN ? 18 : 9;
      for (let m = 0; m < n; m++) {
        const u = hsh(i * 11 + m, fr + i * 31), v = hsh(i * 11 + m + 101, fr), w = hsh(i * 13 + m, fr + 7);
        const hy = v * v * hmax, lean = hy * .55;
        const mx = f[0] + .15 + .5 * u, my = f[1] + hy, mz = f[2] + (w - .5) * 1.6 * f[4];
        // the flame leans with the air going aft (a ship-relative offset, the tip only)
        if (!P3m(mx + (VAN[0] * SR[0] + VAN[2] * SR[6]) * lean, my, mz + (VAN[0] * SR[2] + VAN[2] * SR[8]) * lean)) continue;
        const b = I * (1.25 - .6 * v) * (.75 + .3 * u);
        put(q.x, q.y, q.z < 1800 ? 2 : 1, 255, 236 - 96 * v, 200 - 130 * v, b > 1 ? 1 : b);
      }
      if ((i < NMAIN || f[4] > .75) && P3m(f[0] + .4, f[1] + .6, f[2])) {
        const fl = .75 + .25 * hsh(i, fr);
        glow(q.x, q.y, Math.min(60, 4 + 4200 * f[4] / q.z), 255, 164, 100, .17 * I * fl);
      }
    }
    // embers: rising from the main fires, carried off with the air
    for (let j = 0; j < 110; j++) {
      const f = FS[j % 14], P = 1.1 + 1.4 * hsh(j, 3), ph = hsh(j, 5) * P, c = Math.floor((a + ph) / P), tt = a + ph - c * P;
      if (a - tt < f[3] + .5) continue;
      const u = hsh(j, c), up = (3 + 5 * u) * tt, dr = tt * .8;
      if (!P3m(f[0] + .5 + GT[(j * 3 + c) & GM] * .6 + (VAN[0] * SR[0] + VAN[2] * SR[6]) * VAL * dr * .6, f[1] + 1 + up, f[2] + GT[(j * 3 + c + 1) & GM] * .8 + (VAN[0] * SR[2] + VAN[2] * SR[8]) * VAL * dr * .6)) continue;
      const b = G * f[4] * (1 - tt / P) * .9;
      put(q.x, q.y, 1, 255, 206, 150, b > 1 ? 1 : b);
    }
  }

  /* ---------- smoke: puffs off the hole and the deck vent, rising, spreading, carried off by the air ---------- */
  const SMK = (() => {
    const L = 27, cnt = t => 250 * t + 2600 * (1 - Math.exp(-t / 1.5)), n = Math.floor(cnt(L));
    const b = new Float32Array(n), o = new Float32Array(n * 5);
    for (let i = 0, t = 0; i < n; i++) { while (cnt(t) < i) t += .0005; b[i] = .12 + t; }
    for (let i = 0; i < n; i++) {
      const pf = i >> 4;
      o[i * 5] = GT[(pf * 3) & GM] * .6 + GT[(i * 3 + 11) & GM] * .3; o[i * 5 + 1] = GT[(pf * 3 + 1) & GM] * .3 + GT[(i * 3 + 12) & GM] * .25;
      o[i * 5 + 2] = GT[(pf * 3 + 2) & GM] * .6 + GT[(i * 3 + 13) & GM] * .3; o[i * 5 + 3] = hsh(i, 23); o[i * 5 + 4] = hsh(pf, 29) < .62 ? 0 : 1;
    }
    return { n, b, o, L };
  })();
  const SRC = [ml([HL[0] + 2.2, HL[1] + 1.2, HL[2]]), ml([7.6, 7.2, HL[2] - 3])];
  const smIdx = t => { const B = SMK.b; let lo = 0, hi = SMK.n; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < t) lo = m + 1; else hi = m; } return lo; };
  const smH = g => 80 * (1 - Math.exp(-g / 3.4)) + 5.6 * g, smR = g => 2.5 + 2.8 * g, smD = g => g - 1.2 * (1 - Math.exp(-g / 1.2));
  const LM = DW.LM;
  function drawSmoke(a, O, G) {
    if (a < .12 || G <= .01) return;
    const Ob = SMK.o, B = SMK.b, i0 = smIdx(a - SMK.L), i1 = smIdx(a);
    for (let i = i0; i < i1; i++) {
      const g = a - B[i], o = i * 5, src = SRC[Ob[o + 4]], h = smH(g), r = smR(g) + (i < 2600 ? 6 * (1 - Math.exp(-g * 2)) : 0), d = smD(g);
      const ox = Ob[o] * r, oy = Ob[o + 1] * r, oz = Ob[o + 2] * r;
      const y = src[1] + h + oy; if (y < .5) continue;
      if (!P3(O[0] + src[0] + VA[0] * d + ox, y, O[2] + src[2] + VA[2] * d + oz)) continue;
      const side = E.clamp((ox * LM[0] + oz * LM[2]) / r, -1, 1);
      let b = (.34 + .16 * side + .18 * Ob[o + 3]) * sat(g / .5) * (1 - ss(SMK.L - 9, SMK.L, g)) / (1 + g * .035) * G;
      let cr = GREY[0], cg = GREY[1], cb = GREY[2];
      // the low part of the column is lit from under by the fires
      const w = Math.exp(-g * 1.2) * .8 + .35 * Math.exp(-h / 18);
      cr += (FIRE[0] - cr) * w; cg += (FIRE[1] - cg) * w; cb += (FIRE[2] - cb) * w;
      if (g < 1.6) b = Math.max(b, .6 * (1 - g / 1.6) * G);
      put(q.x, q.y, q.z < 1800 && g < 12 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }

  /* ---------- everything of the hit into the synced main view ---------- */
  let lastHit = null, CAM = null;
  PD.hitFx = function (T, ctx) {
    lastHit = null; CAM = ctx.cam; BLOOM.ok = false;
    if (T < TH - .5 || T > 126) return;
    const a = ageOf(T), G = ctx.dA, tau = ctx.tau, O = PD.ship(0, tau);
    // round 4's lime trail hangs in the air a moment after it has gone in
    if (a > 0 && a < 1.4 && T < PD.TJ) DW.drawTrail(3, T, G);
    if (a < 0) return;
    hullAt(tau);
    drawHole(a, G);
    drawSmoke(a, O, G);
    drawFires(a, G);
    drawSpray(a, O, G);
    drawDebris(a, O, G);
    drawBloom(a, O, G);
    drawImpact(a, O, G);
    if (P3m(HL[0], HL[1], HL[2])) lastHit = [q.x, q.y, q.z];
  };

  /* ---------- overlay: the bloom's light, the tag ---------- */
  function bloomGlow(octx, x, y, r, A, lime) {
    if (A <= .004) return;
    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    const mid = lime ? '226,248,160' : '255,214,176';
    g.addColorStop(0, `rgba(252,255,244,${A.toFixed(3)})`);
    g.addColorStop(.3, `rgba(${mid},${(A * .3).toFixed(3)})`);
    g.addColorStop(1, `rgba(${mid},0)`);
    octx.globalCompositeOperation = 'lighter'; octx.fillStyle = g; octx.fillRect(x - r, y - r, 2 * r, 2 * r); octx.globalCompositeOperation = 'source-over';
  }
  PD.hitOverlay = function (T, octx, tags, ctx) {
    if (T < TH || T > 126 || !lastHit || ctx.dA < .05) return;
    const a = ageOf(T), [x, y, z] = lastHit, sc = E.clamp(260 / z, .35, 3);
    if (a < .08) bloomGlow(octx, x, y, (120 + 900 * a) * sc, .7 * Math.exp(-a * 40) * ctx.dA, true);
    // the fireball's light: wide and soft, white with a lime cast while it is young, gone as it cools
    if (BLOOM.ok && BLOOM.t < 2.2) bloomGlow(octx, BLOOM.x, BLOOM.y, Math.min(380, 1.35 * BLOOM.r + 40), (.2 * Math.exp(-BLOOM.t * 1.5) + .25 * Math.exp(-BLOOM.t * 12)) * (1 - ss(1.4, 2.2, BLOOM.t)) * ctx.dA, BLOOM.t < .5);
    const ta = sat((a - .02) / .04) * (1 - ss(6, 8, a)) * ctx.dA;
    if (ta > .02) tags.push({ key: 'hit', id: 'Hit', txt: 'DDG', cls: 'lime', ax: x + 8 * sc, ay: y - 16 * sc, x: x + 150 * sc + 40, y: y - 170 * sc - 60, a: ta, pri: 9 });
  };
  /* a slow jolt through the lens at the impact (px) */
  PD.hitShake = T => T < TH || T > TH + 4 ? 0 : 7 * Math.exp(-(T - TH) / 1.1) * sat((T - TH) / .08);

  /* ---------- the scope: TRK 21's returns flare, then thin, and are themselves again by ~149.5 ---------- */
  const FLARE0 = 111, FLARE1 = 133, THIN0 = 130, THIN1 = 137, BACK0 = 142, BACK1 = 149.5;
  PD.scopeContact = function (T, tau) {
    if (T < FLARE0 || T >= BACK1) return null;
    const fl = 1 - ss(FLARE1 - 5, FLARE1, T), th = ss(THIN0, THIN1, T) * (1 - ss(BACK0, BACK1, T));
    return { hMul: (1 + 1.6 * fl) * (1 - .45 * th), bMul: (1 + .8 * fl) * (1 - .3 * th), keep: 1 - .68 * th };
  };
  PD.scopeTag = T => T >= TH && T < 145.5 ? 'hit' : null;
  PD.scopeTagA = T => T < 144 || T > 147.5 ? 1 : T < 145.5 ? 1 - ss(144, 145.3, T) : ss(145.7, 147.5, T);

  /* extra returns while the contact flares: the fire, the smoke and the debris down the air's track, painted by
     the beam like everything else on the scope (height in dB x the scope's display scale) */
  const XR = (() => {
    const r = rng(9506), n = 150, a = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) { const g = Math.pow(r(), 1.5); a.set([g, gH(i, 81), gH(i, 83), 10 + 22 * r() * (1 - .6 * g), r()], i * 5); }
    return { n, a };
  })();
  PD.hitScope = function (T, tau, sp, pb, cam) {
    if (T < FLARE0 || T > THIN1 + 2 || sp.a < .01) return;
    const env = sp.a * sat((T - FLARE0) / 1.5) * (1 - ss(FLARE1 - 4, THIN1 + 2, T)), a = ageOf(T);
    if (env < .01) return;
    const O = PD.ship(0, tau), ph = PD.phase(tau), hk = sp.hk, A = XR.a;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], near = sp.near || 1;
    for (let i = 0; i < XR.n; i++) {
      const o = i * 5, g = A[o] * Math.min(a, 26), d = smD(g), r = 25 + 3 * g;
      const x = O[0] + SRC[0][0] + VA[0] * d + A[o + 1] * r, z = O[2] + SRC[0][2] + VA[2] * d + A[o + 2] * r;
      let db = ph - Math.atan2(x, z); db -= Math.floor(db / TAU) * TAU;
      const gl = Math.exp(-db * .75), rise = db < .5 ? 1 - Math.exp(-db * 16) : 1, k = db < .6 ? Math.exp(-db * 7) : 0;
      const yv = A[o + 3] * hk * rise * (.45 + .55 * gl);
      const dx = x - e[0], dz = z - e[2], zc = dx * f[0] + (yv - e[1]) * f[1] + dz * f[2]; if (zc < near) continue;
      const sx = cx + F * (dx * ru[0] + (yv - e[1]) * ru[1] + dz * ru[2]) / zc, sy = cy - F * (dx * u[0] + (yv - e[1]) * u[1] + dz * u[2]) / zc;
      const zb = dx * f[0] - e[1] * f[1] + dz * f[2];
      const b = env * (.4 + .6 * gl) * (.6 + .4 * A[o + 4]);
      const cr = WH[0] + (LIME[0] - WH[0]) * k, cg = WH[1] + (LIME[1] - WH[1]) * k, cb = WH[2] + (LIME[2] - WH[2]) * k;
      if (zb > near && A[o + 3] > 18) pb.dline(cx + F * (dx * ru[0] - e[1] * ru[1] + dz * ru[2]) / zb, cy - F * (dx * u[0] - e[1] * u[1] + dz * u[2]) / zb, sx, sy, 2.5, 1, cr, cg, cb, Math.min(1, b) * .5);
      pb.dot(sx, sy, 2, cr, cg, cb, Math.min(1, b));
    }
  };

  /* ---------- sound (fired only while playing forward) ---------- */
  const SFX = STAGE.SFX;
  PD.hitCues = [
    [TH, () => { SFX.noise(.35, 5200, .5, .14, .002); SFX.tone(70, 24, 4.5, 'sine', .16); SFX.noise(5, 120, 1, .22, .05); SFX.noise(3.5, 700, .6, .05, .3); }],
    [98.8, () => { SFX.noise(4, 160, .9, .16, .4); SFX.tone(52, 30, 3.5, 'sine', .08); }],
    [101.8, () => SFX.noise(9, 1800, .4, .025, 1.5)],
    [108, () => SFX.noise(8, 900, .5, .018, 2)],
  ];
})();
