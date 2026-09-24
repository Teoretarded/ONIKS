/* OE "Ring" world: the destroyer and its sister ships on one track, sea, wakes, SPY pulses, stack shimmer, the far
   island, and the three raids as data: rounds, interceptor paths, Phalanx / gun / cell states, the decoy and gun
   schedules, the hit and the fire's smoke. Everything is a pure function of film time T (paths integrated once at
   load into tables). World: metres, X east, Y up, Z north; the ships steam north at VK.
   Loads after geo.js + hd_land.js + hd_sea_air.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, G = 9.81, RE = 6.371e6;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OE = window.OE = {};
  const D = OE.D = 165, VK = OE.VK = 8;          // loop length, ship speed (8 m/s = 15.6 kn)
  const fr = x => x - Math.floor(x);
  const hash = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const modp = (a, m) => ((a % m) + m) % m;
  const angD = (a, b) => { let d = modp(b - a + PI, TAU) - PI; return d; };      // shortest a -> b
  Object.assign(OE, { PI, TAU, D2R, G, RE, hash, modp, angD });

  const DA = OE.DA = HD.destroyer.A;
  const hD = DA.deckY;

  /* ---------------- the ships ----------------
     A is the hero. B and C follow on A's track, VK*D and 2*VK*D astern, running the same film D and 2D later
     (they are calm: their film has not started). At T = D, B stands where A stood at T = 0 and C where B stood,
     so the take loops by arriving on B. Anything further astern is faded out by distance before it matters. */
  const SHIPS = OE.SHIPS = [0, 1, 2].map(n => ({ id: 'ABC'[n], n, kind: 'ddg', tau: n * D, L: 155.2, B: 20 }));
  const [SA, SB] = SHIPS;
  OE.A = SA; OE.B = SB;
  OE.shipPos = (S, T) => [0, 0, VK * (T - S.tau)];
  function shipMot(S, T) {
    const t = T - S.tau;
    return {
      roll: 1.1 * D2R * (.8 * Math.sin(.7 * t) + .2 * Math.sin(1.23 * t + 2.1)),
      pitch: .35 * D2R * Math.sin(.9 * t + 1),
      heave: .3 * Math.sin(.8 * t + .4),
    };
  }
  OE.shipMot = shipMot;
  OE.shipXf = (S, T) => { const m = shipMot(S, T), p = OE.shipPos(S, T); return X.make(R.mul(R.z(m.roll), R.x(m.pitch)), [p[0], m.heave, p[2]]); };
  OE.shipFrame = (S, T) => X.make(R.I(), OE.shipPos(S, T));
  const halfB = (S, z) => { const u = z / (S.L / 2), B = S.B / 2; if (u > .3) return B * Math.max(0, 1 - Math.pow((u - .3) / .7, 1.75)); if (u < -.85) return B * .86; return B; };
  OE.halfB = halfB;
  // world vector -> A's (rolling) ship frame
  const toShip = (Xs, w) => { const M = Xs.R; return [M[0] * w[0] + M[3] * w[1] + M[6] * w[2], M[1] * w[0] + M[4] * w[1] + M[7] * w[2], M[2] * w[0] + M[5] * w[1] + M[8] * w[2]]; };
  OE.toShip = toShip;

  /* ---------------- sea (as Underway: gravity-wave swell, frequencies rounded so it repeats every D s) ---------------- */
  const WAVES = [
    { A: 1.15, L: 150, d: .25, ph: 0 }, { A: .68, L: 84, d: -.7, ph: 1.7 }, { A: .38, L: 46, d: 1.1, ph: 4.1 },
    { A: .2, L: 29, d: -.3, ph: 2.2 }, { A: .1, L: 17, d: .62, ph: 5.3 },
  ].map(w => { const k = TAU / w.L, n = Math.max(1, Math.round(Math.sqrt(G * k) * D / TAU)); return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: n * TAU / D, ph: w.ph }; });
  function swell(x, z, T) { let h = 0; for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * x + w.kz * z - w.w * T + w.ph); } return h; }
  OE.swell = swell;

  /* sea rows: straight lines across the view on the water, spaced in power-of-two levels; their offset along the
     view follows the camera's own travel (phase integrals from the camera path), so rows stream past a moving
     lens as water does. Heights from the swell at their world positions; curvature drop to a true horizon. */
  const SEA = { C: 15, S0: 1, base: .2 };
  OE.drawSea = function (W, cam, T, ph, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(.6, e[1]);
    let fx = cam.f[0] + cam.u[0] * .8, fz = cam.f[2] + cam.u[2] * .8;
    const fl = Math.hypot(fx, fz); if (fl < 1e-6) { fx = 0; fz = 1; } else { fx /= fl; fz /= fl; }
    const rx = fz, rz = -fx;
    const dHor = Math.sqrt(2 * RE * h), rhoMax = Math.min(dHor, 16000 + 9 * h);
    const tH = Math.tan(cam.fov / 2), tW = tH * cam.W / cam.H;
    let dMin = 1e9, dMax = -1e9, wMax = 0;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) {
      const r = V.add(cam.f, V.add(V.mul(cam.r, sx * tW), V.mul(cam.u, sy * tH)));
      let px, pz;
      if (r[1] < -1e-4) { const k = Math.min(-h / r[1], dHor * 1.2); px = r[0] * k; pz = r[2] * k; }
      else { const hl = Math.hypot(r[0], r[2]) || 1; px = r[0] / hl * dHor; pz = r[2] / hl * dHor; }
      const dd = px * fx + pz * fz, uu = px * rx + pz * rz;
      dMin = Math.min(dMin, dd); dMax = Math.max(dMax, dd); wMax = Math.max(wMax, Math.abs(uu));
    }
    dMax = Math.min(dMax, rhoMax); dMin = Math.max(dMin, -rhoMax);
    const ships = o.ships || [], spd = o.speed || 0, A0 = SEA.base * (o.alpha === undefined ? 1 : o.alpha);
    const cutAt = (x, z) => {
      for (let k = 0; k < ships.length; k++) {
        const s = ships[k], dx = x - s.x, dz = z - s.z;
        if (dx * dx + dz * dz > s.r2) continue;
        if (Math.abs(dz) < s.L / 2 + 1.5 && Math.abs(dx) < halfB(s.S, dz) + 1.2) return true;
      }
      return false;
    };
    const phF = ph[0], phR = ph[1];
    for (let lvl = 0; lvl < 18; lvl++) {
      const s = SEA.S0 * Math.pow(2, lvl), rhoEnd = SEA.C * Math.sqrt(s * h), top = rhoEnd >= rhoMax || s >= 1024;
      if (rhoEnd < h * 1.02 && !top) continue;
      const dEnd = Math.sqrt(Math.max(0, rhoEnd * rhoEnd - h * h));
      const off = modp(phF, s), q = Math.floor(modp(phF, 2 * s) / s);
      const lo = Math.max(dMin, -dEnd), hi = Math.min(dMax, top ? rhoMax : dEnd);
      const m0 = Math.ceil((lo + off) / s), m1 = Math.floor((hi + off) / s);
      const strobe = 1 - ss(.22, .5, spd / 60 / s);
      if (strobe <= .01 && !top) continue;
      for (let m = m0; m <= m1; m++) {
        if (!top && modp(m - q, 2) === 0) continue;
        const d = m * s - off, rho = Math.hypot(d, h);
        let a = A0 * Math.pow(1 - Math.min(1, rho / rhoMax), 1.7) * strobe;
        if (!top) a *= 1 - ss(rhoEnd * .5, rhoEnd, rho);
        a *= ss(1.5, 6, rho);
        if (a < .006) continue;
        const half = Math.min(wMax * 1.05 + 20, (Math.abs(d) + h) * tW * 1.25 + 30);
        const du = Math.min(1024, Math.pow(2, Math.max(0, Math.ceil(Math.log2(half / 26)))));
        const uoff = modp(phR, du), i0 = Math.floor((-half + uoff) / du), i1 = Math.ceil((half + uoff) / du);
        const amp = Math.min(1, 220 / rho + .12);
        let prev = null;
        for (let i = i0; i <= i1; i++) {
          const u = i * du - uoff;
          const x = e[0] + fx * d + rx * u, z = e[2] + fz * d + rz * u, r2 = d * d + u * u;
          if (r2 > dHor * dHor || (ships.length && cutAt(x, z))) { prev = null; continue; }
          const p = [x, amp * swell(x, z, T) - r2 / (2 * RE), z];
          if (prev) W.seg(prev, p, a);
          prev = p;
        }
      }
      if (top) break;
    }
    const hb = [];
    const psi0 = Math.atan2(fx, fz), span = Math.min(PI, Math.atan(tW) * 1.3 + .2);
    for (let k = 0; k <= 48; k++) { const b = psi0 - span + 2 * span * k / 48; hb.push([e[0] + Math.sin(b) * dHor, -h, e[2] + Math.cos(b) * dHor]); }
    for (let k = 0; k < hb.length - 1; k++) W.seg(hb[k], hb[k + 1], .3 * (o.horizon === undefined ? 1 : o.horizon));
    return { dHor, fx, fz };
  };

  /* whitecaps: seeded world cells; foam where the swell crest is high */
  OE.drawCaps = function (W, cam, T, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(1, e[1]);
    const c = 9 * Math.pow(2, Math.max(0, Math.round(Math.log2(h / 30)))), N = 24;
    let fx = cam.f[0], fz = cam.f[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const cx = e[0] + fx * c * N * .8, cz = e[2] + fz * c * N * .8;
    const i0 = Math.floor(cx / c) - N, j0 = Math.floor(cz / c) - N, ships = o.ships || [];
    const A0 = .4 * (o.alpha === undefined ? 1 : o.alpha), Lk = c / 9;
    for (let i = i0; i < i0 + 2 * N; i++) for (let j = j0; j < j0 + 2 * N; j++) {
      const hh = hash(i, j); if (hh > .22) continue;
      const x = (i + hash(j, i + 7)) * c, z = (j + hash(i + 3, j - 5)) * c;
      let cut = false;
      for (const s of ships) { const dx = x - s.x, dz = z - s.z; if (Math.abs(dz) < s.L / 2 + 6 && Math.abs(dx) < halfB(s.S, dz) + 5) { cut = true; break; } }
      if (cut) continue;
      const sw = swell(x, z, T), crest = sat((sw - .35) / 1.1);
      if (crest <= 0) continue;
      const dist = Math.hypot(x - e[0], z - e[2], h);
      const a = A0 * crest * Math.pow(1 - Math.min(1, dist / (c * N * 1.6)), 1.5) * (.55 + .45 * Math.sin(TAU * 3 * T / D + hh * 40));
      if (a < .01) continue;
      const len = Lk * (1.2 + 2.6 * hash(i + 11, j)), y = sw * Math.min(1, 220 / dist + .12) + .05;
      W.seg([x, y, z - len * .5], [x + .3 * Lk, y, z + len * .5], a);
    }
  };

  /* Kelvin wake + bow wave + churned centreline in the ship's heading frame; foam drifts aft at the ship's speed */
  const LAM = TAU * VK * VK / G, KEL = 19.47 * D2R, TK = Math.tan(KEL);
  OE.drawWake = function (W, S, T, o) {
    o = o || {};
    const Fr = OE.shipFrame(S, T), P = (x, z, y) => X.ap(Fr, [x, y === undefined ? .12 : y, z]);
    const L = S.L, zb = L / 2, zs = -L / 2, bw = S.B / 2, tau = T - S.tau, A = o.alpha === undefined ? 1 : o.alpha;
    const Lw = 900;
    for (const sg of [-1, 1]) {
      let pv = P(sg * bw * .35, zb - 4);
      for (let i = 1; i <= 26; i++) {
        const l = i / 26 * Lw, z = zb - 4 - l, x = sg * (bw * .35 + l * TK) + 1.1 * Math.sin(i * 1.7 + tau * 1.3);
        const q = P(x, z);
        W.seg(pv, q, A * .32 * Math.pow(1 - i / 27, 1.2));
        pv = q;
      }
      for (let k = 0; k < 34; k++) {
        const l = 10 + k * LAM * .5, z = zb - 4 - l, x = sg * (bw * .35 + l * TK);
        const len = 4 + l * .06, a = A * .2 * Math.pow(1 - l / Lw, 1.4);
        if (a < .01) continue;
        const dx = -sg * Math.sin(35 * D2R) * len, dz = Math.cos(35 * D2R) * len;
        W.seg(P(x, z), P(x + dx, z + dz * .6), a);
      }
      const b0 = P(sg * .3, zb - 1.5, .25), b1 = P(sg * (bw * .72 + 1.2), zb - L * .2, .2), b2 = P(sg * (bw + 3.5), zb - L * .42, .12);
      W.seg(b0, b1, A * .55); W.seg(b1, b2, A * .3);
      for (let k = 0; k < 7; k++) {
        const f = fr(tau * .9 + k * .37), zz = zb - 2 - k * 2.2;
        W.seg(P(sg * (.4 + k * .9), zz, .3 + .6 * (1 - f)), P(sg * (1.2 + k * 1.1), zz - 1.6, .15), A * .28 * (1 - f));
      }
      for (let k = 0; k < 10; k++) { const z = zb - 20 - k * 12; const x = sg * (halfB(S, z) + 1.6 + .8 * Math.sin(k * 2.3 + tau * 1.7)); W.seg(P(x, z), P(x + sg * .6, z - 8), A * .2); }
    }
    for (let k = 1; k <= 14; k++) {
      const z = zs - k * LAM + 8, l = zb - 4 - z, xm = bw * .35 + l * TK, a = A * .16 * Math.pow(1 - k / 15, 1.5);
      let pv = null;
      for (let i = 0; i <= 12; i++) {
        const u = -1 + 2 * i / 12, q = P(u * xm * .82, z + Math.pow(Math.abs(u), 2) * LAM * .38);
        if (pv) W.seg(pv, q, a * (1 - .6 * Math.abs(u)));
        pv = q;
      }
    }
    const sp = 12, cyc = Math.floor((tau * VK) / sp);
    for (let i = 0; i < 52; i++) {
      const z0 = zs - 2 - i * sp - modp(tau * VK, sp), wide = bw * .42 + (zs - z0) * .028, fade = Math.pow(1 - i / 53, 1.2);
      for (let j = 0; j < 5; j++) {
        const hh = hash(i * 5 + j, cyc - i), x0 = wide * (hh * 2 - 1) * .92, len = 3 + 5 * hash(cyc - i, j + 11);
        W.seg(P(x0, z0 - j * 2.1), P(x0 + .4 * (hh - .5), z0 - j * 2.1 - len), A * .3 * fade * (1 - .5 * Math.abs(hh * 2 - 1)));
      }
    }
    for (const sg of [-1, 1]) {
      let pv = null;
      for (let i = 0; i <= 40; i++) {
        const d = i * 16, z = zs - 1 - d, w = bw * .42 + d * .028 + .9 * Math.sin(i * 1.9 + sg + (tau * VK - d) * .07);
        const q = P(sg * w, z);
        if (pv) W.seg(pv, q, A * .3 * Math.pow(1 - i / 41, 1.3));
        pv = q;
      }
    }
    for (let k = 0; k < 6; k++) { const f = fr(tau * .7 + k / 6); W.seg(P(-bw * .6 * (1 - f), zs - 1 - f * 10), P(bw * .6 * (1 - f), zs - 1 - f * 10), A * .2 * (1 - f)); }
  };

  /* ---------------- heat shimmer over the uptakes (column leans aft in the relative wind) ---------------- */
  OE.drawShimmer = function (W, mouth, up, aft, side, tau, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, n = o.n || 9, Lp = o.len || 15;
    const out = V.norm(V.cross(up, aft));
    for (let i = 0; i < n; i++) {
      const ph = i * 2.39, lat = ((i + .5) / n - .5) * (o.w || 2.6);
      let pv = null;
      for (let k = 0; k <= 22; k++) {
        const s = k / 22 * Lp, rise = s * .74, lean = s * .68 + .016 * s * s;
        const amp = .05 + s * .03;
        const wob = amp * (Math.sin(2.3 * s - 9.5 * tau + ph) + .6 * Math.sin(4.1 * s - 15.7 * tau + ph * 1.7));
        const q = V.add(V.add(V.mad(V.mad(mouth, up, rise), aft, lean), V.mul(side, lat * (1 + s * .05) + wob)), V.mul(out, amp * .8 * Math.sin(3.1 * s - 11.3 * tau + ph)));
        if (pv) W.seg(pv, q, A * .17 * Math.pow(1 - s / Lp, 1.2) * ss(0, 1.5, s));
        pv = q;
      }
    }
  };

  /* ---------------- the far island (seed-1337 theatre contours), ~34 km SW ---------------- */
  const W0 = [158.5, 288.9];
  const ISL = {
    0: [[136.7, 275.53], [143.71, 275.53], [144.71, 274.56], [145.83, 274.53], [148.71, 272.58], [149.71, 272.53], [152.72, 269.52], [152.75, 268.52], [154.72, 265.52], [154.81, 263.51], [155.72, 262.51], [155.72, 257.5], [154.8, 256.5], [154.72, 254.5], [152.75, 251.49], [152.72, 250.49], [149.71, 247.49], [148.71, 247.41], [146.71, 245.48], [144.71, 245.46], [143.71, 244.48], [136.69, 244.48], [135.69, 245.4], [133.69, 245.48], [132.69, 246.47], [131.69, 246.49], [126.68, 251.49], [125.66, 254.5], [124.68, 255.5], [124.68, 264.52], [125.66, 265.52], [126.68, 268.52], [131.69, 273.53], [132.69, 273.54], [133.69, 274.53], [135.69, 274.6], [136.7, 275.53]],
    60: [[138.56, 269.52], [142.7, 269.48], [144.64, 268.52], [148.29, 264.52], [149.41, 261.51], [148.22, 255.5], [146.63, 252.5], [145.71, 251.51], [141.7, 250.21], [137.7, 250.52], [134.56, 252.5], [131.69, 254.54], [130.0, 258.51], [130.15, 260.51], [131.83, 265.52], [134.69, 268.22], [138.56, 269.52]],
    140: [[138.01, 266.52], [140.7, 266.65], [143.71, 265.69], [146.71, 260.89], [144.07, 254.5], [140.7, 252.81], [137.7, 253.43], [135.69, 254.5], [133.33, 256.5], [132.5, 258.51], [132.53, 260.51], [134.94, 264.52], [138.01, 266.52]],
    220: [[137.47, 263.51], [138.7, 264.29], [141.7, 263.2], [142.7, 262.7], [144.27, 260.51], [141.7, 257.4], [136.7, 257.25], [134.57, 258.51], [134.59, 260.51], [137.47, 263.51]],
  };
  const ISLW = Object.entries(ISL).map(([lv, pts]) => ({ lv: +lv, p: pts.map(q => [(q[0] - W0[0]) * 1000, +lv, (q[1] - W0[1]) * 1000]) }));
  OE.drawIsland = function (W, cam, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(.6, e[1]), dh = Math.sqrt(2 * RE * h), A = o.alpha === undefined ? 1 : o.alpha;
    for (const c of ISLW) {
      const lim = dh + Math.sqrt(2 * RE * Math.max(1, c.lv)), al = A * (c.lv === 0 ? .2 : .13);
      let pv = null;
      for (let i = 0; i < c.p.length; i++) {
        const a = c.p[i], b = c.p[(i + 1) % c.p.length];
        for (let k = 0; k < 3; k++) {
          const q = V.lerp(a, b, k / 3), d = Math.hypot(q[0] - e[0], q[2] - e[2]);
          if (d > lim) { pv = null; continue; }
          const p = [q[0], q[1] - d * d / (2 * RE), q[2]];
          if (pv) W.seg(pv, p, al);
          pv = p;
        }
      }
    }
  };

  /* =====================================================================================================
     THE RAIDS
     Three raids of P-800 Oniks (3M55) rounds, each bigger. A round clears the horizon R0 out, flies ~Mach 2
     (VR) at sea-skimming height straight at its aim point on the ship, weaving a little on the way. Every
     outcome is fixed data (who stops which round, when): the film shows spectacle, not tactics.
     ===================================================================================================== */
  const VR = OE.VR = 680, R0 = OE.R0 = 26000;
  const HIT_P = [-8.9, 6.3, -64];                  // port quarter, flight-deck level (ship frame)
  // brg: bearing the round comes from (deg true); t0: clears the horizon; lat: start offset across its line (m);
  // y: cruise height; wv: weave [amp m, period s, phase]; end: 'int' (interceptor, time from its meet),
  // 'ciws' (Phalanx kill at d m out), 'hit' (reaches HIT_P)
  const RDEF = [
    // raid 1: two from fine on the starboard bow, both stopped far out
    { id: 'T1', raid: 1, brg: 15, t0: 12.4, lat: -260, y: 12, wv: [16, 5.4, .3], end: 'int' },
    { id: 'T2', raid: 1, brg: 15, t0: 13.3, lat: 230, y: 10.5, wv: [14, 6.1, 2.2], end: 'int' },
    // raid 2: four from the WNW; the fourth weaves past its interceptor, the gun fires on it, the aft Phalanx stops it
    { id: 'T3', raid: 2, brg: 285, t0: 46.2, lat: -420, y: 12, wv: [15, 5.2, 1.1], end: 'int' },
    { id: 'T4', raid: 2, brg: 285, t0: 46.9, lat: 180, y: 11, wv: [18, 5.8, 4.0], end: 'int' },
    { id: 'T5', raid: 2, brg: 285, t0: 47.5, lat: 460, y: 13, wv: [12, 6.3, 2.7], end: 'int' },
    { id: 'T6', raid: 2, brg: 285, t0: 48.4, lat: -90, y: 10, wv: [62, 3.3, .6], end: 'ciws', d: 480, aim: [0, 9, -30] },
    // raid 3: six from two bearings, east and south-west
    { id: 'T7', raid: 3, brg: 80, t0: 91.6, lat: -380, y: 12, wv: [15, 5.5, .9], end: 'int' },
    { id: 'T8', raid: 3, brg: 80, t0: 92.3, lat: 300, y: 11, wv: [17, 6.0, 3.3], end: 'int' },
    { id: 'T9', raid: 3, brg: 80, t0: 83.4, lat: 40, y: 10, wv: [30, 4.1, 1.9], end: 'ciws', d: 470, aim: [0, 9, 20], mount: 0 },
    { id: 'T10', raid: 3, brg: 220, t0: 90.5, lat: -300, y: 11, wv: [20, 4.6, 2.4], end: 'ciws', d: 490, aim: [0, 8, -50], mount: 1 },
    { id: 'T11', raid: 3, brg: 220, t0: 92.4, lat: 120, y: 10, wv: [24, 4.2, 5.1], end: 'hit' },
    { id: 'T12', raid: 3, brg: 220, t0: 109.5, lat: 380, y: 12, wv: [15, 5.1, .2], end: 'int' },
  ];
  const ROUNDS = OE.ROUNDS = RDEF.map((d, i) => {
    const r = Object.assign({ i, aim: [0, 9, 0] }, d);
    if (r.end === 'hit') r.aim = HIT_P;
    const b = r.brg * D2R;
    r.u = [Math.sin(b), 0, Math.cos(b)];                         // from the ship toward where it comes from
    r.n = [Math.cos(b), 0, -Math.sin(b)];
    r.tArr = r.t0 + R0 / VR;                                     // would reach its aim point
    r.aimW = V.add(OE.shipPos(SA, r.tArr), r.aim);
    if (r.end === 'ciws') r.tEnd = r.tArr - r.d / VR;
    if (r.end === 'hit') r.tEnd = r.tArr;
    return r;
  });
  const RID = OE.RID = {}; ROUNDS.forEach(r => RID[r.id] = r);
  /* position of round r at T (world). s = distance still to fly to the aim point. */
  function roundAt(r, T) {
    const s = VR * (r.tArr - T), taper = s / R0;
    const wv = r.wv[0] * Math.sin(TAU * (T - r.t0) / r.wv[1] + r.wv[2]) * ss(1100, 3800, s);
    const lat = r.lat * taper + wv;
    let y = r.y + .8 * Math.sin(.9 * T + r.i);
    if (r.end === 'hit') y = mix(r.aim[1], y, ss(0, 900, s));
    else y = mix(Math.max(6, r.aim[1] * .6), y, ss(0, 700, s));
    const a = r.aimW;
    return [a[0] + r.u[0] * s + r.n[0] * lat, y, a[2] + r.u[2] * s + r.n[2] * lat];
  }
  OE.roundAt = roundAt;
  OE.roundDir = (r, T) => V.norm(V.sub(roundAt(r, T + .02), roundAt(r, T - .02)));
  OE.roundDist = (r, T) => { const p = roundAt(r, T), c = OE.shipPos(SA, T); return Math.hypot(p[0] - c[0], p[2] - c[2]); };
  /* 0..1 how much of round r is there at T (clears the horizon, is stopped: stage B paints the stop) */
  OE.roundVis = (r, T) => ss(r.t0, r.t0 + 1.2, T) * (1 - ss(r.tEnd - .06, r.tEnd, T));
  OE.roundLive = (r, T) => T >= r.t0 && T < r.tEnd;

  /* ---------------- interceptors (RIM-174 SM-6 out of the Mk 41 cells) ----------------
     cell: 0..31 forward launcher, 32..95 aft; tL launch; r: the round it meets at tI (miss: passes it by that
     many metres and flies on until it self-destructs). The path is a lofted curve from the cell: straight up out
     of the cell, pitch-over, down onto the meeting point; flown with a boost-then-coast speed law. */
  const IDEF = [
    { cell: 12, tL: 23.9, r: 'T1', tI: 34.6 },
    { cell: 19, tL: 25.1, r: 'T2', tI: 36.9 },
    { cell: 58, tL: 57.4, r: 'T3', tI: 69.2 },
    { cell: 65, tL: 58.2, r: 'T4', tI: 70.5 },
    { cell: 45, tL: 59.0, r: 'T5', tI: 71.6 },
    { cell: 9, tL: 59.9, r: 'T6', tI: 73.4, miss: 32 },
    { cell: 3, tL: 101.4, r: 'T7', tI: 112.8 },
    { cell: 26, tL: 102.3, r: 'T8', tI: 114.1 },
    { cell: 71, tL: 132.9, r: 'T12', tI: 141.2 },
  ];
  const HZ = 60, KB = 5.5, CV0 = .03;
  const INTS = OE.INTS = IDEF.map((d, i) => {
    const I = Object.assign({ i }, d), r = RID[I.r];
    I.round = r;
    r.int = I;
    if (r.end === 'int' && !I.miss) r.tEnd = I.tI;
    const P0 = X.ap(OE.shipXf(SA, I.tL), DA.vls(I.cell));
    let PI_ = roundAt(r, I.tI);
    if (I.miss) PI_ = V.add(PI_, V.add(V.mul(r.n, I.miss), [0, 9, 0]));
    const hv = [PI_[0] - P0[0], 0, PI_[2] - P0[2]], dist = Math.hypot(hv[0], hv[2]), uh = V.mul(hv, 1 / dist);
    // straight up out of the cell and clear of the superstructure, then a lofted curve down onto the meeting point
    const PV = V.add(P0, [0, 55, 0]);
    const P1 = V.add(PV, [0, clamp(.022 * dist, 80, 280), 0]);
    const P2 = V.add(V.mad(PI_, uh, -.34 * dist), [0, clamp(.021 * dist, 50, 250), 0]);
    const bez = u => { const a = 1 - u; return [0, 1, 2].map(c => a * a * a * PV[c] + 3 * a * a * u * P1[c] + 3 * a * u * u * P2[c] + u * u * u * PI_[c]); };
    const NV = 40, NB = 840, cum = new Float64Array(NB + 1), pts = [];
    for (let k = 0; k <= NB; k++) { pts.push(k <= NV ? V.lerp(P0, PV, k / NV) : bez((k - NV) / (NB - NV))); if (k) cum[k] = cum[k - 1] + V.dist(pts[k], pts[k - 1]); }
    const L = cum[NB], Tf = I.tI - I.tL;
    // speed law: out of the cell at ~40 m/s, the booster ramps it up over KB s (~30 g at most), then it holds
    const g = t => CV0 + (1 - CV0) * ss(0, KB, t), FN = Math.ceil(Tf * 240), FT = new Float64Array(FN + 1);
    for (let k = 1; k <= FN; k++) { const a = (k - 1) / 240, b = k / 240; FT[k] = FT[k - 1] + (g(a) + g(b)) * .5 / 240; }
    const F = t => { const x = clamp(t * 240, 0, FN - 1e-6), k = Math.floor(x); return FT[k] + (FT[k + 1] - FT[k]) * (x - k); };
    const vEnd = L * g(Tf) / F(Tf);
    const tail = I.miss ? 1.6 : 0, N = Math.ceil((Tf + tail) * HZ) + 1, P = new Float64Array(N * 3);
    let k = 0;
    const endDir = V.norm(V.sub(pts[NB], pts[NB - 4]));
    for (let j = 0; j < N; j++) {
      const t = j / HZ;
      let q;
      if (t <= Tf) {
        const s = L * F(t) / F(Tf);
        while (k < NB - 1 && cum[k + 1] < s) k++;
        const f = clamp((s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), 0, 1);
        q = V.lerp(pts[k], pts[k + 1], f);
      } else q = V.mad(PI_, endDir, vEnd * (t - Tf));
      P[j * 3] = q[0]; P[j * 3 + 1] = q[1]; P[j * 3 + 2] = q[2];
    }
    Object.assign(I, { P0, PI: PI_, P, N, L, vEnd, tEnd: I.tI + tail });
    return I;
  });
  /* interceptor position at T (world); null before launch / after its end */
  function intAt(I, T) {
    const x = (T - I.tL) * HZ;
    if (x < 0 || T > I.tEnd) return null;
    const j = Math.min(I.N - 2, Math.floor(x)), f = Math.min(1, x - j), P = I.P, a = j * 3;
    return [P[a] + (P[a + 3] - P[a]) * f, P[a + 1] + (P[a + 4] - P[a + 1]) * f, P[a + 2] + (P[a + 5] - P[a + 2]) * f];
  }
  OE.intAt = intAt;
  OE.intDir = (I, T) => { const a = intAt(I, Math.max(I.tL, T - .03)), b = intAt(I, Math.min(I.tEnd, T + .03)); return a && b ? V.norm(V.sub(b, a)) : [0, 1, 0]; };
  /* the path flown so far (world points, every `step` samples) up to T */
  OE.intTrace = (I, T, step) => {
    const out = [], jN = Math.min(I.N - 1, Math.floor((Math.min(T, I.tEnd) - I.tL) * HZ));
    for (let j = 0; j <= jN; j += step || 3) out.push([I.P[j * 3], I.P[j * 3 + 1], I.P[j * 3 + 2]]);
    const h = intAt(I, Math.min(T, I.tEnd)); if (h) out.push(h);
    return out;
  };

  /* Mk 41 hatches: open ~1.4 s before the launch, close ~3 s after */
  OE.vlsOpen = function (S, T) {
    if (S.n !== 0) return null;
    const out = [];
    for (const I of INTS) { const f = ss(I.tL - 1.5, I.tL - .7, T) * (1 - ss(I.tL + 2.6, I.tL + 3.6, T)); if (f > .001) out.push([I.cell, f]); }
    return out.length ? out : null;
  };

  /* ---------------- Phalanx 1B mounts (0 forward, 1 aft) ----------------
     Each engagement slews onto its round (leading it by the tracer's time of flight), fires a burst, and the
     mount goes back to rest after its last one. Burst times are data for stage B (tracer, brass, smoke). */
  const CIWS_REST = [[0, .35], [PI, .35]];
  const CIWS_ENG = OE.CIWS_ENG = [
    { m: 1, r: 'T6', tS: 81.6, b: 2.6 },           // b: burst length before the kill
    { m: 0, r: 'T9', tS: 115.2, b: 2.4 },
    { m: 1, r: 'T10', tS: 122.4, b: 2.3 },
    { m: 1, r: 'T11', tS: 128.1, b: 1.7, late: 1 },   // swings onto the last one and fires until it hits
  ];
  for (const e of CIWS_ENG) {
    e.round = RID[e.r];
    e.t1 = e.round.tEnd - (e.late ? .05 : 0);
    e.t0 = e.t1 - e.b;
  }
  // aim from the muzzles at rest: within ~2 m of the trunnions, a fraction of a degree at the ranges that matter
  const CIWS_P = OE.CIWS_P = [DA.ciws({}, 0), DA.ciws({}, 1)];
  function aimAngles(from, w, Xs) {
    const d = toShip(Xs, V.sub(w, X.ap(Xs, from)));
    return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))];
  }
  function ciwsAim(e, T, Xs) {
    const r = e.round, tt = Math.min(T, r.tEnd - .02);
    let p = roundAt(r, tt);
    for (let k = 0; k < 2; k++) p = roundAt(r, tt + V.dist(p, X.ap(Xs, CIWS_P[e.m])) / 1030);
    return aimAngles(CIWS_P[e.m], p, Xs);
  }
  OE.ciwsState = function (S, T) {
    const yaw = [CIWS_REST[0][0], CIWS_REST[1][0]], pit = [CIWS_REST[0][1], CIWS_REST[1][1]];
    if (S.n !== 0) return { yaw, pitch: pit };
    const Xs = OE.shipXf(S, T);
    for (let m = 0; m < 2; m++) {
      let y = CIWS_REST[m][0], p = CIWS_REST[m][1], last = null;
      for (const e of CIWS_ENG) {
        if (e.m !== m || T < e.tS) continue;
        const [ay, ap] = ciwsAim(e, T, Xs), w = ss(e.tS, e.tS + 1.1, T);
        y = y + angD(y, ay) * w; p = mix(p, ap, w); last = e;
      }
      if (last) { const w = ss(last.t1 + 1.6, last.t1 + 4.2, T); y = y + angD(y, CIWS_REST[m][0]) * w; p = mix(p, CIWS_REST[m][1], w); }
      yaw[m] = y; pit[m] = p;
    }
    return { yaw, pitch: pit };
  };
  // gatling spin: 4 500 rds/min over six barrels = 12.5 rev/s; spun up just before a burst, run down after
  const SPIN_HZ = 240, SPIN_N = Math.ceil(D * SPIN_HZ) + 2, SPIN = [new Float64Array(SPIN_N), new Float64Array(SPIN_N)];
  const spinRate = (m, T) => { let w = 0; for (const e of CIWS_ENG) if (e.m === m) w = Math.max(w, ss(e.t0 - .45, e.t0 - .05, T) * (1 - ss(e.t1 + .1, e.t1 + 1.3, T))); return w * 12.5 * TAU; };
  for (let m = 0; m < 2; m++) for (let i = 1; i < SPIN_N; i++) SPIN[m][i] = SPIN[m][i - 1] + (spinRate(m, (i - 1) / SPIN_HZ) + spinRate(m, i / SPIN_HZ)) * .5 / SPIN_HZ;
  OE.ciwsSpin = (S, m, T) => { if (S.n !== 0) return 0; const x = clamp(T * SPIN_HZ, 0, SPIN_N - 1.001), i = Math.floor(x); return SPIN[m][i] + (SPIN[m][i + 1] - SPIN[m][i]) * (x - i); };
  OE.ciwsFiring = (m, T) => CIWS_ENG.some(e => e.m === m && T >= e.t0 && T <= e.t1);

  /* ---------------- Mk 45 5"/62 ----------------
     Trains onto its round (leading by the shell's time of flight, superelevated for range), fires on the shot
     times (data for stage B: flash, recoil, shell, burst), then trains back to rest. */
  const GUN_ENG = OE.GUN_ENG = [
    { r: 'T6', tS: 72.6, shots: [74.4, 77.6, 80.8] },
    { r: 'T9', tS: 101.8, shots: [104.0, 107.2, 110.4, 113.6] },
  ];
  for (const e of GUN_ENG) e.round = RID[e.r];
  const GUN_PIV = [0, hD(48.6) + 1.28, 48.6 + .95];
  function gunAim(e, T, Xs) {
    const r = e.round, tt = Math.min(T, r.tEnd - .05), piv = X.ap(Xs, GUN_PIV);
    let p = roundAt(r, tt);
    for (let k = 0; k < 2; k++) p = roundAt(r, tt + V.dist(p, piv) / 790);
    const [y, pit] = aimAngles(GUN_PIV, p, Xs), d = V.dist(p, piv);
    return [y, pit + .5 * Math.asin(clamp(G * d / (820 * 820), 0, 1))];
  }
  OE.gunAim = gunAim;
  OE.gunState = function (S, T) {
    if (S.n !== 0) return { yaw: 0, pitch: 0 };
    const Xs = OE.shipXf(S, T);
    let y = 0, p = 0, last = null;
    for (const e of GUN_ENG) {
      if (T < e.tS) continue;
      const [ay, ap] = gunAim(e, T, Xs), w = ss(e.tS, e.tS + 1.9, T);
      y = y + angD(y, ay) * w; p = mix(p, ap, w); last = e;
      const tEnd = e.shots[e.shots.length - 1];
      const back = ss(tEnd + 2, tEnd + 5, T); y = y + angD(y, 0) * back; p = mix(p, 0, back);
    }
    void last;
    return { yaw: y, pitch: p };
  };

  /* ---------------- decoys (Mk 36 SRBOC, 01 level abreast the stacks, tubes fixed abeam) ----------------
     Data for stage B: each rocket leaves launcher (side, z) at t, climbing out on its tube's line (el), and
     blooms into a chaff cloud ~bloom s later. The starboard launchers fire toward raid 3's eastern axis. */
  const DECOYS = OE.DECOYS = [
    { t: 116.0, side: 1, z: 2.2, el: 45, az: 88 },
    { t: 116.35, side: 1, z: -17, el: 60, az: 92 },
    { t: 116.75, side: 1, z: 2.2, el: 60, az: 90 },
    { t: 117.1, side: 1, z: -17, el: 45, az: 94 },
  ].map(d => {
    const el = d.el * D2R, az = d.az * D2R;
    return Object.assign(d, { mouth: [d.side * 5.5, 11.2, d.z], dir: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], bloom: 2.2 });
  });

  /* ---------------- the hit ---------------- */
  const HIT = OE.HIT = { t: RID.T11.tEnd, r: 'T11', at: HIT_P, fire: [-7.6, 7.4, -63] };

  /* ---------------- events (time-sorted, for the log, sounds and stage B) ---------------- */
  const EV = OE.EVENTS = [];
  for (const I of INTS) {
    EV.push({ t: I.tL, kind: 'launch', I });
    EV.push({ t: I.tI, kind: I.miss ? 'miss' : 'intercept', I, r: I.round, p: I.PI });
  }
  for (const e of CIWS_ENG) EV.push({ t: e.t0, kind: 'ciws', e }), e.late || EV.push({ t: e.round.tEnd, kind: 'ciwsKill', e, r: e.round, p: roundAt(e.round, e.round.tEnd) });
  for (const e of GUN_ENG) for (const t of e.shots) EV.push({ t, kind: 'gun', e });
  for (const d of DECOYS) EV.push({ t: d.t, kind: 'decoy', d });
  EV.push({ t: HIT.t, kind: 'hit', p: roundAt(RID.T11, HIT.t) });
  EV.sort((a, b) => a.t - b.t);

  /* bearings (deg) of the raids in the air at T, for the SPY pulses */
  OE.threatBrgs = T => { const s = new Set(); for (const r of ROUNDS) if (T >= r.t0 - 2 && T < r.tEnd) s.add(r.brg); return [...s]; };

  /* ---------------- SPY-1D search pulses ----------------
     Patches of expanding spherical shell from the face that looks their way. While a raid is in the air every
     other pulse goes down the threat bearing. Only the hero pulses, never across the seam. */
  const PER = .7, LIFE = 2.4, GAP = LIFE + .1;
  const SHELL = [[0, .5], [9, .85], [18, 1], [29, .6], [42, .28]].map(q => [q[0] * D2R, q[1]]);
  const pulseR = age => 14 + 240 * age + 380 * age * age;
  OE.pulseBearing = k => {
    const Tk = .31 + k * PER, th = OE.threatBrgs(Tk);
    if (th.length && k % 2 === 0) return (th[(k >> 1) % th.length] + 6 * Math.sin(k * 1.7)) * D2R;
    return (modp(k * 137 + (k >> 2) * 61, 360) + 7 * Math.sin(k)) * D2R;
  };
  OE.drawPulses = function (W, S, T, facesW, o) {
    o = o || {};
    if (S.n !== 0) return [];
    const A = o.alpha === undefined ? 1 : o.alpha, t0 = .31;
    const kNow = Math.floor((T - t0) / PER), fired = [];
    for (let k = kNow; k >= kNow - Math.ceil(LIFE / PER); k--) {
      const Tk = t0 + k * PER, age = T - Tk;
      if (age < 0 || age > LIFE || Tk < 0 || Tk > D - GAP) continue;
      const cb = OE.pulseBearing(k);
      let best = 0, bd = -2;
      for (let f = 0; f < facesW.length; f++) { const n = facesW[f].n, dd = n[0] * Math.sin(cb) + n[2] * Math.cos(cb); if (dd > bd) { bd = dd; best = f; } }
      const F = facesW[best], c = F.c, rad = pulseR(age);
      const al = A * .74 * Math.pow(1 - age / LIFE, 1.4) * ss(0, .06, age);
      const b0 = cb - 32 * D2R, b1 = cb + 32 * D2R, n = 36;
      for (const [el, w] of SHELL) {
        const ce = Math.cos(el), se = Math.sin(el);
        for (const [dr, wk] of [[0, 1], [-(4 + rad * .02), .32]]) {
          const rr = rad + dr;
          let pv = null;
          for (let i = 0; i <= n; i++) {
            const b = b0 + (b1 - b0) * i / n;
            const q = [c[0] + Math.sin(b) * ce * rr, c[1] + se * rr - rr * rr / (2 * RE), c[2] + Math.cos(b) * ce * rr];
            if (pv) W.seg(pv, q, al * w * wk * Math.pow(Math.sin(PI * (i - .5) / n), .8));
            pv = q;
          }
        }
      }
      if (age < .3) fired.push({ f: best, k: 1 - age / .3 });
    }
    return fired;
  };

  /* ---------------- the fire's smoke ----------------
     After the hit the fire aft feeds a smoke stream. Parcels leave the fire, rise on its heat and drift with the
     true wind (from the NNW, ~6 m/s); against the ship's 8 m/s they stream aft over the wake, low, a little to
     starboard. The stream is what drifts across the lens before the loop, so it lives here with the seam. */
  const WIND = OE.WIND = [2.3, 0, -5.5];
  const SM_DT = .32;
  function smokeParcel(k) {
    const te = HIT.t + .25 + k * SM_DT;
    return { te, src: X.ap(OE.shipXf(SA, te), HIT.fire), h1: hash(k, 7), h2: hash(k, 13), h3: hash(k, 29) };
  }
  const SM_N = Math.ceil((D + 30 - HIT.t) / SM_DT), PARCELS = [];
  for (let k = 0; k < SM_N; k++) PARCELS.push(smokeParcel(k));
  OE.PARCELS = PARCELS;
  const smRise = a => 16 * (1 - Math.exp(-a / 2.6)) + 1.4 * a;
  const smRad = a => 2.2 + 3.2 * Math.sqrt(a) + .45 * a;
  // strength of the fire as it emits (flares, then settles into a steady working fire)
  const fireK = te => ss(HIT.t, HIT.t + 1.2, te) * (1 - .35 * ss(HIT.t + 14, HIT.t + 30, te));
  OE.fireK = fireK;
  OE.smokeAt = function (p, T) {
    const a = T - p.te; if (a < 0) return null;
    const s = p.src, g = 1 + .35 * (p.h1 - .5);
    return {
      c: [s[0] + WIND[0] * a + (p.h2 - .5) * (2 + a * 1.2), s[1] + smRise(a) * g, s[2] + WIND[2] * a + (p.h3 - .5) * (2 + a * .8)],
      r: smRad(a) * (.8 + .4 * p.h2), a,
      k: fireK(p.te) * ss(0, .4, a) * Math.exp(-a / 22),
    };
  };
  OE.smokeLife = 34;

  Object.assign(OE, { SMOKE_DT: SM_DT, HIT_P });
})();
