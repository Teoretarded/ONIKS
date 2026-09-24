/* OD "Salvo", chapters 4 and 5: round 4 goes into the destroyer's starboard side amidships (in slow motion) and
   the burning ship after it. The flash and a restrained bloom, the fireball's rings, the blast front crossing the
   water, debris on ballistic arcs, a yellow breach mark on the hull, fires on deck and a heavy smoke column that
   rises, billows and leans downwind. Pure functions of sim time s (a = s - S_HIT, the age of the hit): tables and
   seeded constants are built once here, every particle is analytic in its age. Loads after od_salvo_world.js. */
(function () {
  'use strict';
  const { V, X, E } = M3;
  const { TAU, G, hash, fr, S_HIT, HIT_L, WIND, DEF, SID } = OD;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const swell = OD.swell, flung = DEF.flung, billow = DEF.billow, wring = DEF.wring, spout = DEF.spout;
  const A = SID.A, HI = '#F4D23C', WHC = '#F6F5F2', HOT = '#FFFFFF';
  const nz = M3.noise, UP = [0, 1, 0];
  const HIT = OD.HIT = {};
  const shipVel = s => { const ps = OD.shipPsi(A, s), v = A.v(s); return [Math.sin(ps) * v, 0, Math.cos(ps) * v]; };

  /* the moment of impact: the hull frame, the point of impact, its outward normal, the round's line */
  const X0 = OD.shipXf(A, S_HIT);
  const H0 = HIT.H0 = X.ap(X0, HIT_L);
  const OUT = X.dir(X0, [1, 0, 0]), FWD = X.dir(X0, [0, 0, 1]);
  const RF = OD.round(3, S_HIT - .02).f;
  const VS0 = shipVel(S_HIT);
  const L2W = l => X.ap(X0, l);
  const nrm = v => V.norm(v);
  const comb = (...t) => { const o = [0, 0, 0]; for (let i = 0; i < t.length; i += 2) { o[0] += t[i][0] * t[i + 1]; o[1] += t[i][1] * t[i + 1]; o[2] += t[i][2] * t[i + 1]; } return o; };

  // the smoke's buoyant rise (m) by age, and its radius by age and height
  const RISE = a => 380 * (1 - Math.exp(-a / 16)) + 3.5 * a + 5 * (1 - Math.exp(-a / .5));
  const RAD = (a, h) => 3 + .2 * h + .6 * a;

  /* ---------------- the fireball: lobes bursting out of the hole and up through the side deck ----------------
     each lobe's centre is thrown out along d (decelerating), then rises as it turns to smoke; its radius swells
     fast (tr) then grows slowly; hot while young (rings in pure white), then a lumpy smoke cloud */
  const LOBES = [
    { b: [10.2, 4.2, -8], d: nrm(comb(OUT, 1, RF, -.45, UP, .3)), D: 7, td: .09, R: 8.5, tr: .055, a0: .003, rise: 3, g: 2.6 },
    { b: [8.2, 6.6, -9.5], d: nrm(comb(UP, 1, OUT, .3)), D: 13, td: .16, R: 11, tr: .085, a0: .014, rise: 5, g: 3 },
    { b: [8.8, 6.7, -4], d: nrm(comb(UP, .55, OUT, .6, FWD, .45)), D: 9, td: .12, R: 7, tr: .065, a0: .02, rise: 4, g: 2.4 },
    { b: [10, 3, -11.5], d: nrm(comb(OUT, 1, UP, .05, FWD, -.35)), D: 6, td: .08, R: 5.5, tr: .05, a0: .008, rise: 2.5, g: 2 },
    { b: [6.8, 9.5, -12], d: nrm(comb(UP, 1, OUT, .5, FWD, -.2)), D: 10, td: .2, R: 8, tr: .12, a0: .07, rise: 6, g: 3 },
  ].map((L, i) => Object.assign(L, { bw: L2W(L.b), sd: 11 + i * 7.3 }));
  const lobeC = (L, t) => {
    const k = L.D * (1 - Math.exp(-t / L.td)), h = RISE(t) * .95, up = L.rise * t * Math.exp(-t / 3) + h * ss(.05, .9, t);
    const w = t * (.72 + .5 * sat(h / 260)) * ss(.1, 1.2, t);
    return [L.bw[0] + L.d[0] * k + VS0[0] * .1 * t + WIND[0] * w, L.bw[1] + L.d[1] * k + up, L.bw[2] + L.d[2] * k + VS0[2] * .1 * t + WIND[2] * w];
  };
  const lobeR = (L, t) => Math.max(L.R * (1 - Math.exp(-t / L.tr)) + L.g * Math.sqrt(t) + .9 * t, .72 * RAD(t, RISE(t)));

  /* ---------------- sparks out of the entry hole (the first half-second) ---------------- */
  const SPK = [];
  for (let k = 0; k < 44; k++) {
    const h = j => hash(k + j * 17.3, 301);
    const d = nrm(comb(RF, -(.4 + .8 * h(1)), OUT, .5 + .7 * h(2), UP, (h(3) - .3) * 1.1, FWD, (h(4) - .5) * 1.3));
    SPK.push({ v0: V.add(V.mul(d, mix(120, 420, h(5))), VS0), tau: mix(.05, .22, h(6)), life: mix(.18, .6, h(7)), a0: .002 + .012 * h(8) });
  }

  /* ---------------- debris: plates and chunks thrown out of the side and up through the deck ----------------
     flung with linear drag under gravity; each piece tumbles, bright while hot, trailing smoke if burning;
     its splash in the swell is found once here */
  const FR = [];
  for (let k = 0; k < 72; k++) {
    const h = j => hash(k + j * 13.1, 211), deck = k >= 46;
    const d = deck ? nrm(comb(UP, 1, OUT, .15 + .5 * h(1), FWD, (h(2) - .5) * 1.2, [1, 0, 0], (h(3) - .5) * .3))
      : nrm(comb(OUT, .8 + .4 * h(1), RF, -(.1 + .55 * h(2)), UP, .1 + 1.1 * h(3), FWD, (h(4) - .5) * 1.1));
    const sp = deck ? mix(40, 135, h(5)) : mix(30, 160, h(5) * h(5));
    const size = mix(.18, 1.25, h(6) * h(6)), tau = mix(.45, 3.4, h(7) * .6 + size / 1.25 * .4);
    const p0 = deck ? L2W([8.3 + h(8) * 1.4, 6.6, -9.5 + (h(9) - .5) * 5]) : L2W([10.1, 4.2 + (h(8) - .5) * 2, -8 + (h(9) - .5) * 3.5]);
    const F = { p0, v0: V.add(V.mul(d, sp), VS0), tau, size, a0: .004 + .02 * h(10) + (deck ? .012 : 0), burn: h(11) < .2, hot: h(12) < .7,
      ax: nrm([h(13) - .5, h(14) - .5, h(15) - .5]), w: mix(4, 22, h(16)) * (h(17) < .5 ? -1 : 1), nv: 3 + Math.floor(h(18) * 3), sd: k * 3.7 + 211 };
    F.e1 = nrm(V.cross(F.ax, [.3, 1, .2])); F.e2 = V.cross(F.ax, F.e1);
    F.tw = 14;
    for (let a = 1 / 120; a < 14; a += 1 / 120) { const q = V.add(p0, flung(F.v0, tau, a)); if (q[1] <= swell(q[0], q[2], S_HIT + F.a0 + a)) { F.tw = a; break; } }
    F.pw = V.add(p0, flung(F.v0, tau, F.tw));
    F.H = mix(2, 9, size / 1.25) * (.6 + .4 * h(19));
    FR.push(F);
  }
  const fragAt = (F, t) => V.add(F.p0, flung(F.v0, F.tau, t));

  /* ---------------- the breach: a ragged hole in the side plating, torn plates bent outward ---------------- */
  const BREACH = [], PETALS = [], DECKHOLE = [], SCORCH = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22 * TAU, j = i % 22, rj = .86 + .26 * hash(j, 41) - .1 * (j % 2), c = Math.cos(t), sn = Math.sin(t);
    BREACH.push([9.9 + .1 * hash(j, 42), clamp(4.2 + 1.45 * rj * sn, 1.2, 6.2), -8 + 2.5 * rj * c]);
    const rs = 1.75 + .35 * hash(j, 43);
    SCORCH.push([9.88, clamp(4.4 + 1.45 * rs * sn, .9, 6.35), -8.3 + 2.6 * rs * c]);
  }
  for (let i = 0; i < 9; i++) {
    const q = BREACH[Math.floor(i * 22 / 9)], dy = q[1] - 4.2, dz = q[2] + 8, l = .5 + .7 * hash(i, 44);
    PETALS.push([[q[0], q[1] - dy * .12, q[2] - dz * .12], [q[0] + .55 * l, q[1] + dy * .3 * l, q[2] + dz * .35 * l], [q[0] + .9 * l, q[1] + dy * .55 * l + .15, q[2] + dz * .6 * l]]);
  }
  for (let i = 0; i <= 18; i++) {
    const t = i / 18 * TAU, j = i % 18, rj = .7 + .5 * hash(j, 45);
    DECKHOLE.push([clamp(8.2 + 1.5 * rj * Math.cos(t), 6.6, 9.85), 6.47, -9.4 + 2.8 * rj * Math.sin(t)]);
  }
  // soot streaks up the side from the hole to the deck edge
  const SOOT = [];
  for (let i = 0; i < 9; i++) { const z = -10.2 + i * .55 + .3 * hash(i, 46), y0 = 5 + .6 * hash(i, 47); SOOT.push([[9.9, y0, z], [9.92, 6.35, z - .8 - .8 * hash(i, 48)]]); }

  /* ---------------- fires (ship-local): flames spread along t, rising off the surface (normal n) ---------------- */
  const FIRES = [
    { p: [9.98, 4.3, -8], n: [1, 0, 0], t: [0, 0, 1], w: 3.4, ai: .12, k: 1.3 },     // out of the breach
    { p: [8.3, 6.5, -9.3], n: [0, 1, 0], t: [0, 0, 1], w: 4.4, ai: .28, k: 1.25 },   // the torn side deck
    { p: [9.5, 6.55, -5.2], n: [0, 1, 0], t: [0, 0, 1], w: 2.1, ai: .6, k: .85 },    // deck edge, forward
    { p: [6.3, 7.9, -11.2], n: [1, 0, 0], t: [0, 0, 1], w: 2.4, ai: 1.4, k: .8 },    // the deckhouse side, the door
    { p: [9.3, 6.55, -14.2], n: [0, 1, 0], t: [0, 0, 1], w: 2.2, ai: 4.5, k: .75 },  // spreading aft
    { p: [9.99, 2.5, -10], n: [1, 0, 0], t: [0, 0, 1], w: 1.5, ai: .7, k: .6 },      // the lower edge of the hole
  ].map((F, i) => Object.assign(F, { sd: i * 5.1 + 3, o: 1 - Math.abs(F.n[1]), nT: Math.max(1, Math.round(1 + 2.2 * F.k)) }));
  const fireK = (F, a) => ss(F.ai, F.ai + 1.4, a) * F.k * (1 - .25 * ss(30, 44, a));

  /* ---------------- the smoke column ----------------
     parcels leave the fires at fixed emission times (dense at first), rise on a buoyant curve, swell with height
     and ride the wind (stronger aloft); the ship steams on from under them, so the column leans away aft */
  const ROOTS = [[8.3, 8.4, -9.3], [9.8, 6.2, -8], [9.3, 8, -5.4], [6.6, 9.6, -11.4], [9.2, 8, -14.2]];
  const PK = [];
  for (let k = 0; ; k++) {
    const e = .3 + .2 * k + .0042 * k * k;
    if (e > OD.DS - S_HIT + 1) break;
    let ri = [0, 1, 0, 2, 0, 1, 3, 0, 4, 2][k % 10];
    if (e < FIRES[[1, 0, 2, 3, 4][ri]].ai + .6) ri = e < .45 ? 1 : 0;
    const te = S_HIT + e, Xe = OD.shipXf(A, te);
    PK.push({ k, te, root: X.ap(Xe, ROOTS[ri]), h1: hash(k, 61), h2: hash(k, 62), h3: hash(k, 63) });
  }
  const parcel = (P, s, out) => {
    const a = s - P.te, h = RISE(a), r = RAD(a, h), wk = (.72 + .5 * sat(h / 260)) * a, q = P.k * .43;
    out.a = a; out.r = r;
    out.p[0] = P.root[0] + WIND[0] * wk + r * .42 * nz(q, a * .09, 1.1);
    out.p[1] = P.root[1] + h + r * .18 * nz(q, a * .09, 4.4);
    out.p[2] = P.root[2] + WIND[2] * wk + r * .42 * nz(q, a * .09, 7.7);
    return out;
  };
  const PBUF = PK.map(() => ({ p: [0, 0, 0], a: 0, r: 0 }));
  // a point up the column (frac 0 = the root, 1 = its top), for the camera's aim in the pull-back
  // (a smooth virtual parcel off the main root: no noise, so the lens never jitters)
  HIT.colPoint = (s, frac) => {
    const a = s - S_HIT, ag = Math.max(0, (a - .3) * frac), te = s - ag;
    const root = X.ap(OD.shipXf(A, te), ROOTS[0]), h = RISE(ag), wk = (.72 + .5 * sat(h / 260)) * ag;
    return [root[0] + WIND[0] * wk, root[1] + h, root[2] + WIND[2] * wk];
  };
  HIT.RISE = RISE;

  /* ---------------- drawing ---------------- */
  let RATE = 1;
  // a lumpy contour facing the lens: cauliflower bumps (|noise|) over a slow wobble; hot fire or cooling smoke
  function lumpy(W, cam, c, r, al, sd, tt, bump, n) {
    const e = cam.eye, d = Math.max(.5, Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2])), rpx = r * cam.fl / d;
    if (al < .006 || rpx < 1) return;
    n = n || clamp(Math.round(rpx / 1.5), 12, 72);
    const U = cam.r, Vv = cam.u;
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const rr = r * (1 - bump * .45 + bump * Math.abs(nz(ca * 2.3 + sd, sa * 2.3, tt)) + .12 * nz(ca * .9 + sd, sa * .9, tt * .5));
      const qx = c[0] + (U[0] * ca + Vv[0] * sa) * rr, qy = c[1] + (U[1] * ca + Vv[1] * sa) * rr, qz = c[2] + (U[2] * ca + Vv[2] * sa) * rr;
      if (i) W.seg([px, py, pz], [qx, qy, qz], al);
      px = qx; py = qy; pz = qz;
    }
  }
  // a smoke cloud: lumps clustered about c (the union of their outlines reads as a cumulus edge)
  function cloud(W, cam, c, r, al, sd, tt, nl) {
    const rpx = r * cam.fl / Math.max(.5, V.dist(c, cam.eye));
    al *= 1 - ss(260, 700, rpx);
    if (al < .006 || rpx < 1.2) return;
    nl = rpx < 6 ? 1 : nl;
    for (let k = 0; k < nl; k++) {
      const h1 = hash(k, sd), h2 = hash(k + 5, sd), h3 = hash(k + 9, sd);
      const th = h1 * TAU + tt * .15, rad = k ? r * (.3 + .32 * h2) : 0, lr = k ? r * (.38 + .22 * h3) : r * .72;
      const o = [cam.r[0] * Math.cos(th) * rad + cam.u[0] * Math.sin(th) * rad * .8, cam.r[1] * Math.cos(th) * rad + cam.u[1] * Math.sin(th) * rad * .8, cam.r[2] * Math.cos(th) * rad + cam.u[2] * Math.sin(th) * rad * .8];
      lumpy(W, cam, [c[0] + o[0], c[1] + o[1], c[2] + o[2]], lr, al * (k ? .8 : 1), sd + k * 3.1, tt, .3, 0);
    }
  }
  function drawLobes(W, cam, a) {
    for (const L of LOBES) {
      const t = a - L.a0; if (t <= 0) continue;
      const c = lobeC(L, t), r = lobeR(L, t);
      const heat = 1 - ss(.12, .75, t), smoke = ss(.12, .7, t) * (1 - ss(16, 26, t));
      if (heat > .01) {
        W.style(HOT, 1);
        // the fireball: a boiling cauliflower edge, curls churning inside it
        const al0 = heat * ss(0, .004, t);
        lumpy(W, cam, c, r, .92 * al0, L.sd, t * 2.4, .42, 0);
        for (let j = 1; j < 4; j++) {
          const th = hash(j, L.sd) * TAU + t * (2 + j), o = r * .28 * j / 3;
          lumpy(W, cam, [c[0] + (cam.r[0] * Math.cos(th) + cam.u[0] * Math.sin(th)) * o, c[1] + (cam.r[1] * Math.cos(th) + cam.u[1] * Math.sin(th)) * o, c[2] + (cam.r[2] * Math.cos(th) + cam.u[2] * Math.sin(th)) * o],
            r * (.62 - .12 * j), .5 * al0, L.sd + j * 4.7, t * 3.3 + j, .55, 0);
        }
        W.style(WHC, 1);
      }
      if (smoke > .01) cloud(W, cam, c, r * 1.05, .34 * smoke * (1 - .5 * ss(3, 20, t)), L.sd * 3, t * .4, 6);
    }
  }
  // the blast front: its silhouette on the sphere (a ring that swells until it sweeps over the lens) and its trace on the water
  function drawBlast(W, cam, a) {
    if (a <= 0 || a > 1.6) return;
    const e = cam.eye, dv = V.sub(e, H0), d = V.len(dv), n = V.mul(dv, 1 / d), [U, Vv] = GEO.perp(n);
    // the front and, a little behind it, the fainter edge of the hot air it drives out
    for (const [R, k] of [[340 * a, 1], [340 * a * .9 - 1, .35]]) {
      const al = .32 * k * Math.exp(-a / .55) * ss(0, .006, a);
      if (R <= 0 || R >= d * .995 || al <= .01) continue;
      const c = V.mad(H0, n, R * R / d), rho = R * Math.sqrt(1 - (R * R) / (d * d));
      let pv = null;
      for (let i = 0; i <= 72; i++) {
        const t = i / 72 * TAU, q = V.add(c, V.add(V.mul(U, Math.cos(t) * rho), V.mul(Vv, Math.sin(t) * rho)));
        if (q[1] < -.5) { pv = null; continue; }
        if (pv) W.seg(pv, q, al);
        pv = q;
      }
    }
    const R = 340 * a;
    // on the water: the front's footprint racing out, and the slower surge ring of disturbed water
    const wa = .42 * Math.exp(-a / .5) * ss(0, .01, a);
    if (wa > .01) W.ring([H0[0], .35, H0[2]], [1, 0, 0], [0, 0, 1], Math.sqrt(Math.max(1, R * R - H0[1] * H0[1])), 96, wa);
    const sa = .3 * Math.exp(-a / 1.4);
    if (sa > .01) { const rs = 6 + 26 * (1 - Math.exp(-a / .45)) + 3 * a; wring(W, [H0[0], .3, H0[2]], [1, 0, 0], [0, 0, 1], rs, 44, sa, sa, 71, a, .12, null); }
  }
  function drawSparks(W, cam, a) {
    if (a > .7) return;
    W.style(HOT, 1);
    const tl = clamp(RATE / 60 * 1.2, .0025, .02);
    for (const S of SPK) {
      const t = a - S.a0; if (t <= 0 || t > S.life) continue;
      const p = V.add(H0, flung(S.v0, S.tau, t)), q = V.add(H0, flung(S.v0, S.tau, Math.max(0, t - tl - .004)));
      W.seg(q, p, .95 * Math.pow(1 - t / S.life, 1.2));
    }
    // the first instants: rays across the lens
    if (a < .07) for (let k = 0; k < 9; k++) {
      const th = (k + .7 * hash(k, 88)) / 9 * TAU, l = (6 + 18 * hash(k + 3, 88)) * (1 - a / .07), l0 = 2 + 2 * hash(k, 89);
      const dd = V.add(V.mul(cam.r, Math.cos(th)), V.mul(cam.u, Math.sin(th)));
      W.seg(V.mad(H0, dd, l0), V.mad(H0, dd, l0 + l), .75 * (1 - a / .07));
    }
    W.style(WHC, 1);
  }
  function drawDebris(W, cam, a, s) {
    const e = cam.eye, tl = clamp(RATE / 60, .0025, .02);
    for (const F of FR) {
      const t = a - F.a0; if (t <= 0) continue;
      if (t >= F.tw) { spout(W, F.pw, t - F.tw, F.H, F.sd, .75, s); continue; }
      const p = fragAt(F, t), d = V.dist(p, e), rpx = F.size * cam.fl / Math.max(1, d);
      const glow = F.hot ? Math.exp(-t / 1.1) : 0;
      // the arc it has flown: a fading hairline (bright while the piece is still hot)
      W.style(glow > .15 ? HOT : WHC, 1);
      let pv = p;
      const arcL = Math.min(t * .6, .03 + .06 * glow + .12 * ss(.5, 3, t));
      for (let k = 1; k <= 6; k++) {
        const tq = t - arcL * k / 6; if (tq < 0) break;
        const q = fragAt(F, tq);
        W.seg(pv, q, (.3 + .55 * glow) * (1 - k / 7));
        pv = q;
      }
      // motion smear over one frame
      W.seg(fragAt(F, Math.max(0, t - tl)), p, .9);
      W.style(WHC, 1);
      // the piece itself: a tumbling plate
      if (rpx > 1.6) {
        const th = F.w * t, c = Math.cos(th), sn = Math.sin(th);
        const u = V.add(V.mul(F.e1, c), V.mul(F.ax, sn)), v = F.e2;
        let q0 = null, qf = null;
        for (let i = 0; i <= F.nv; i++) {
          const an = i / F.nv * TAU + F.sd, rr = F.size * (.55 + .45 * hash(i % F.nv, F.sd));
          const q = V.add(p, V.add(V.mul(u, Math.cos(an) * rr), V.mul(v, Math.sin(an) * rr * .7)));
          if (q0) W.seg(q0, q, .85); else qf = q;
          q0 = q;
        }
      }
      // burning pieces lay a smoke thread that drifts off downwind
      if (F.burn) {
        let pw = p;
        const st = clamp(t / 9, .012, .16);
        for (let k = 1; k <= 9; k++) {
          const dt = k * st, tq = t - dt; if (tq < 0) break;
          const lay = fragAt(F, tq), wb = .35 * dt * nz(k * .7 + F.sd, t * .5, 3.3);
          const w = [lay[0] + WIND[0] * dt + wb, lay[1] + .9 * dt, lay[2] + WIND[2] * dt - wb];
          W.seg(pw, w, .26 * (1 - k / 10) * ss(0, .15, t));
          pw = w;
        }
      }
    }
  }
  // spray sheets off the waterline under the hole
  const SPRAY = [-13, -10.5, -8, -5.5, -3].map((z, i) => ({ z, H: 5 + 5 * hash(i, 91), a0: .006 + .01 * hash(i, 92), sd: 90 + i * 3.3 }));
  function drawSpray(W, a, s) {
    for (const P of SPRAY) {
      const t = a - P.a0; if (t <= 0 || t > 6) continue;
      const b = L2W([10.6, 0, P.z]); b[1] = swell(b[0], b[2], s) + .2;
      spout(W, b, t, P.H, P.sd, .7, s);
    }
  }
  function drawBreach(W, Xs, a, T) {
    const k = ss(.004, .06, a);
    if (k <= 0) return;
    const hi = 1 - ss(20, 28, a);                     // the accent hands over to the next salvo late in the loop
    const poly = (pts, al, closed) => { let pv = X.ap(Xs, pts[0]); for (let i = 1; i < pts.length; i++) { const q = X.ap(Xs, pts[i]); W.seg(pv, q, al); pv = q; } if (closed) W.seg(pv, X.ap(Xs, pts[0]), al); };
    if (hi > .01) { W.style(HI, 1.4); poly(BREACH, .95 * k * hi, false); }
    W.style(WHC, 1);
    if (hi < .99) poly(BREACH, .8 * k * (1 - hi), false);
    for (const P of PETALS) poly(P, .6 * k, false);
    const sc = ss(.3, 2.5, a);
    if (sc > .01) {
      for (let i = 0; i < SCORCH.length - 1; i += 2) W.seg(X.ap(Xs, SCORCH[i]), X.ap(Xs, SCORCH[i + 1]), .35 * sc);
      for (const S of SOOT) W.seg(X.ap(Xs, S[0]), X.ap(Xs, S[1]), .28 * sc);
      poly(DECKHOLE, .55 * sc, false);
    }
  }
  function drawFires(W, cam, Xs, a, s) {
    const vs = shipVel(s), rw = [WIND[0] - vs[0], 0, WIND[2] - vs[2]], rl = Math.hypot(rw[0], rw[2]) || 1;
    const lean = Math.min(.6, rl / 22), ld = [rw[0] / rl, 0, rw[2] / rl], side = [-ld[2], 0, ld[0]];
    const e = cam.eye;
    for (const F of FIRES) {
      const g = fireK(F, a); if (g < .02) continue;
      const c0 = X.ap(Xs, F.p); if (V.dist(c0, e) > 4500) continue;
      const nW = X.dir(Xs, F.n), tW = X.dir(Xs, F.t);
      W.style(HOT, 1);
      for (let i = 0; i < F.nT; i++) {
        const u0 = F.nT > 1 ? i / (F.nT - 1) - .5 : 0, hh = hash(i, F.sd);
        const b = V.mad(c0, tW, u0 * F.w * .8 + (hash(i + 5, F.sd) - .5) * .6);
        // each tongue licks: its height breathes, its body sways, a lick runs up its edges
        const fl = .62 + .38 * nz(s * 2.1 + i * 1.7, F.sd * 3.1, .5);
        const h = g * (6 + 7.5 * hh) * fl * (1 - .3 * Math.abs(u0) * 2), wb = h * (.22 + .08 * hash(i + 9, F.sd));
        for (const [hs, ws, al0] of [[1, 1, .85], [.62, .48, .55]]) {
          let L0 = null, R0 = null;
          for (let j = 0; j <= 7; j++) {
            const u = j / 7, hk = h * hs, wob = .22 * hk * u * nz(s * 3.1 + i * 2.9 + u * 1.3, F.sd + 7.3, 2.5);
            const cx = b[0] + nW[0] * hk * .4 * F.o * Math.sqrt(u) + ld[0] * lean * hk * u * u + side[0] * wob;
            const cy = b[1] + nW[1] * hk * .4 * F.o * Math.sqrt(u) + hk * Math.pow(u, 1 + .4 * F.o);
            const cz = b[2] + nW[2] * hk * .4 * F.o * Math.sqrt(u) + ld[2] * lean * hk * u * u + side[2] * wob;
            // across the tongue as the lens sees it
            const tx = ld[0] * lean * 2 * u, tz = ld[2] * lean * 2 * u, ex = cx - e[0], ey = cy - e[1], ez = cz - e[2];
            let sx = ez - tz * ey, sy = tz * ex - tx * ez, sz = tx * ey - ex; const sl = Math.hypot(sx, sy, sz) || 1;
            const lick = .22 * Math.sin(u * 7 - s * 9 + i * 2.1);
            const w = wb * ws * Math.pow(1 - u, .75) * (.8 + 1.2 * u) / sl;
            const Lq = [cx - sx * w * (1 + lick), cy - sy * w * (1 + lick), cz - sz * w * (1 + lick)], Rq = [cx + sx * w * (1 - lick), cy + sy * w * (1 - lick), cz + sz * w * (1 - lick)];
            const al = al0 * Math.pow(1 - u * .7, 1.1) * Math.min(1, g * 1.4);
            if (L0) { W.seg(L0, Lq, al); W.seg(R0, Rq, al); } else W.seg(Lq, Rq, al * .5);
            L0 = Lq; R0 = Rq;
          }
        }
      }
      // embers riding up out of the flames
      if (a > F.ai + .5) for (let j = 0; j < 6; j++) {
        const P = 2.4, ph = fr(s / P + hash(j, F.sd + 1)), t = ph * P;
        const b = V.mad(c0, tW, (hash(j, F.sd + 2) - .5) * F.w);
        const q = [b[0] + (ld[0] * lean * 2.5 + (hash(j, F.sd + 3) - .5)) * t, b[1] + 3.6 * t + .5 * t * t, b[2] + (ld[2] * lean * 2.5 + (hash(j, F.sd + 4) - .5)) * t];
        const dq = [ld[0] * lean * 2.5, 3.6 + t, ld[2] * lean * 2.5];
        W.seg(q, V.mad(q, dq, -.05), .7 * (1 - ph) * g);
      }
      W.style(WHC, 1);
    }
  }
  function drawColumn(W, cam, a, s) {
    const e = cam.eye, n = PK.length;
    let m = 0;
    while (m < n && PK[m].te < s) { parcel(PK[m], s, PBUF[m]); m++; }
    if (!m) return;
    const far = V.dist(e, H0), fk = 1 - ss(100000, 130000, far);
    if (fk <= .01) return;
    const dens = a2 => ss(0, .5, a2) * (1 - .5 * ss(6, 44, a2)) * (1 - ss(46, 60, a2));
    // billows: two lumps per parcel, the column's churning surface
    for (let i = 0; i < m; i++) {
      const P = PBUF[i], Q = PK[i], dd = dens(P.a) * fk;
      if (dd < .01) continue;
      const lx = (Q.h1 - .5) * .55, ly = (Q.h2 - .5) * .3;
      cloud(W, cam, [P.p[0] + cam.r[0] * P.r * lx, P.p[1] + P.r * ly, P.p[2] + cam.r[2] * P.r * lx], P.r, .3 * dd, Q.k * 1.9, P.a * .3, 4);
    }
    // flow lines along the column: its two edges as the lens sees them, and a few inside
    for (const sg of [-1, 1, -.55, -.1, .4, .78]) {
      const edge = Math.abs(sg) === 1;
      let pv = null, pa = 0;
      for (let i = m - 1; i >= 0; i--) {
        const P = PBUF[i], i0 = Math.min(m - 1, i + 1), i1 = Math.max(0, i - 1);
        const tg = V.sub(PBUF[i1].p, PBUF[i0].p), toE = V.sub(e, P.p);
        let sd = V.cross(tg, toE); const sl = V.len(sd); if (sl < 1e-6) continue; sd = V.mul(sd, 1 / sl);
        const rr = P.r * (edge ? .92 + .16 * nz(PK[i].k * .31, P.a * .2, sg * 3 + 1) : 1 + .3 * nz(PK[i].k * .23 + sg * 5, P.a * .15, 2.2));
        const q = V.mad(P.p, sd, sg * rr), al = (edge ? .34 : .16) * dens(P.a) * fk;
        if (pv) W.seg(pv, q, (al + pa) * .5);
        pv = q; pa = al;
      }
    }
  }

  HIT.draw = function (W, cam, T, s) {
    const a = s - S_HIT;
    if (a < 0) return;
    RATE = OD.SIM.rate(T);
    W.fog = [1e8, 2e8];
    const Xs = OD.shipXf(A, s);
    drawBreach(W, Xs, a, T);
    if (a < 30) drawLobes(W, cam, a);
    drawBlast(W, cam, a);
    drawSparks(W, cam, a);
    if (a < 16) drawDebris(W, cam, a, s);
    if (a < 8) drawSpray(W, a, s);
    drawFires(W, cam, Xs, a, s);
    drawColumn(W, cam, a, s);
    W.style(WHC, 1);
  };
  /* additive glows {p, a, m, px, max}: the flash (restrained), the fireball's heat */
  HIT.glows = function (T, s) {
    const a = s - S_HIT, G2 = [];
    if (a < 0 || a > 3) return G2;
    G2.push({ p: V.mad(H0, OUT, 1.5), a: .95 * Math.exp(-a / .03) + .28 * Math.exp(-a / .3), m: 16, px: 16, max: 280 });
    const L = LOBES[1], t = a - L.a0;
    if (t > 0) G2.push({ p: lobeC(L, t), a: .2 * Math.exp(-t / .45) * ss(0, .02, t), m: 14, px: 8, max: 200 });
    return G2;
  };
  HIT.fireGlows = function (s, eye, out) {
    const a = s - S_HIT; if (a < .3) return;
    const Xs = OD.shipXf(A, s);
    for (let i = 0; i < 2; i++) {
      const F = FIRES[i], g = fireK(F, a), p = X.ap(Xs, V.add(F.p, [0, 2.5, 0])), d = V.dist(p, eye);
      if (g < .05 || d > 2500) continue;
      out.push({ p, a: .13 * g * (.7 + .3 * nz(s * 5.3, i * 4.1, .7)) * ss(2500, 900, d), m: 3.5, px: 4, max: 40 });
    }
  };
  /* lens shake (px) at the eye: a flinch at the flash, the blast front arriving */
  HIT.shake = function (s, eye) {
    const a = s - S_HIT; if (a < 0 || a > 4) return 0;
    const aw = a - V.dist(eye, H0) / 340;
    return 1.6 * Math.exp(-a / .06) + (aw > 0 ? 11 * Math.exp(-aw / .32) * ss(0, .02, aw) : 0);
  };
  HIT.blastAt = eye => S_HIT + V.dist(eye, H0) / 340;
  HIT.breach = s => X.ap(OD.shipXf(A, s), [10.3, 4.4, -8]);
  HIT.top = s => { const a = s - S_HIT; if (a <= .4) return H0; const q = parcel(PK[0], s, { p: [0, 0, 0] }); return [q.p[0], q.p[1] + .7 * q.r, q.p[2]]; };
})();
