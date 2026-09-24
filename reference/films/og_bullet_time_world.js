/* OG "Bullet Time" world: the last ~20 s of a destroyer's defence as data, every quantity a pure function of SIM
   time S (the film maps film time T -> S with a variable clock; og_bullet_time_film.js). The sea, the ship's
   motion, the wake, the rounds, the interceptors, the hatches, the Phalanx mounts and their spin all read S, so
   when the clock runs at x0.02 the whole scene hangs, and when it runs backwards everything flies back.
   S = 0 is the calm first frame; S < 0 is the same calm (the rewind dips a little below 0 and plays forward
   into the loop). World: metres, X east, Y up, Z north; the ship steams north at VK.
   Loads after geo.js + hd_land.js + hd_sea_air.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, G = 9.81, RE = 6.371e6;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OG = window.OG = {};
  const VK = OG.VK = 8;                              // 8 m/s = 15.6 kn
  const fr = x => x - Math.floor(x);
  const hash = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const modp = (a, m) => ((a % m) + m) % m;
  const angD = (a, b) => modp(b - a + PI, TAU) - PI;
  Object.assign(OG, { PI, TAU, D2R, G, RE, hash, modp, angD });

  const DA = OG.DA = HD.destroyer.A;
  const hD = DA.deckY;

  /* ---------------- the ship ---------------- */
  const SHIP = OG.SHIP = { L: 155.2, B: 20 };
  OG.shipPos = S => [0, 0, VK * S];
  function shipMot(S) {
    return {
      roll: 1.1 * D2R * (.8 * Math.sin(.7 * S + .6) + .2 * Math.sin(1.23 * S + 2.1)),
      pitch: .35 * D2R * Math.sin(.9 * S + 1),
      heave: .3 * Math.sin(.8 * S + .4),
    };
  }
  OG.shipMot = shipMot;
  OG.shipXf = S => { const m = shipMot(S); return X.make(R.mul(R.z(m.roll), R.x(m.pitch)), [0, m.heave, VK * S]); };
  OG.shipFrame = S => X.make(R.I(), OG.shipPos(S));
  const halfB = z => { const u = z / (SHIP.L / 2), B = SHIP.B / 2; if (u > .3) return B * Math.max(0, 1 - Math.pow((u - .3) / .7, 1.75)); if (u < -.85) return B * .86; return B; };
  OG.halfB = halfB;
  const toShip = (Xs, w) => { const M = Xs.R; return [M[0] * w[0] + M[3] * w[1] + M[6] * w[2], M[1] * w[0] + M[4] * w[1] + M[7] * w[2], M[2] * w[0] + M[5] * w[1] + M[8] * w[2]]; };
  OG.toShip = toShip;

  /* ---------------- sea: gravity-wave swell in S (frozen when the clock is slow) ---------------- */
  const WAVES = [
    { A: 1.15, L: 150, d: .25, ph: 0 }, { A: .68, L: 84, d: -.7, ph: 1.7 }, { A: .38, L: 46, d: 1.1, ph: 4.1 },
    { A: .2, L: 29, d: -.3, ph: 2.2 }, { A: .1, L: 17, d: .62, ph: 5.3 },
  ].map(w => { const k = TAU / w.L; return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: Math.sqrt(G * k), ph: w.ph }; });
  function swell(x, z, S) { let h = 0; for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * x + w.kz * z - w.w * S + w.ph); } return h; }
  OG.swell = swell;

  /* sea rows (as Ring): lines across the view, power-of-two spacing levels, streamed by the camera's own travel
     (phase integrals from the film's camera path); heights from the swell at S; curvature drop to the horizon */
  const SEA = { C: 15, S0: 1, base: .2 };
  OG.drawSea = function (W, cam, S, ph, o) {
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
        if (Math.abs(dz) < SHIP.L / 2 + 1.5 && Math.abs(dx) < halfB(dz) + 1.2) return true;
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
          const p = [x, amp * swell(x, z, S) - r2 / (2 * RE), z];
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

  /* whitecaps: seeded world cells, foam where the swell crest is high; their shimmer runs on S too */
  OG.drawCaps = function (W, cam, S, o) {
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
      for (const s of ships) { const dx = x - s.x, dz = z - s.z; if (Math.abs(dz) < SHIP.L / 2 + 6 && Math.abs(dx) < halfB(dz) + 5) { cut = true; break; } }
      if (cut) continue;
      const sw = swell(x, z, S), crest = sat((sw - .35) / 1.1);
      if (crest <= 0) continue;
      const dist = Math.hypot(x - e[0], z - e[2], h);
      const a = A0 * crest * Math.pow(1 - Math.min(1, dist / (c * N * 1.6)), 1.5) * (.55 + .45 * Math.sin(.9 * S + hh * 40));
      if (a < .01) continue;
      const len = Lk * (1.2 + 2.6 * hash(i + 11, j)), y = sw * Math.min(1, 220 / dist + .12) + .05;
      W.seg([x, y, z - len * .5], [x + .3 * Lk, y, z + len * .5], a);
    }
  };

  /* Kelvin wake + bow wave + churned centreline in the ship's heading frame; foam drifts aft with S */
  const LAM = TAU * VK * VK / G, KEL = 19.47 * D2R, TK = Math.tan(KEL);
  OG.drawWake = function (W, S, o) {
    o = o || {};
    const Fr = OG.shipFrame(S), P = (x, z, y) => X.ap(Fr, [x, y === undefined ? .12 : y, z]);
    const L = SHIP.L, zb = L / 2, zs = -L / 2, bw = SHIP.B / 2, tau = S, A = o.alpha === undefined ? 1 : o.alpha;
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
      for (let k = 0; k < 10; k++) { const z = zb - 20 - k * 12; const x = sg * (halfB(z) + 1.6 + .8 * Math.sin(k * 2.3 + tau * 1.7)); W.seg(P(x, z), P(x + sg * .6, z - 8), A * .2); }
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

  /* heat shimmer over the uptakes (frozen with the clock) */
  OG.drawShimmer = function (W, mouth, up, aft, side, tau, o) {
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

  /* =====================================================================================================
     THE FIGHT (sim time S)
     Four P-800 Oniks (3M55) rounds at ~Mach 2 (VR), sea-skimming, from the ENE (the starboard bow). Two
     SM-6 leave the Mk 41 cells and stop R1 and R2 ~5 km out; the forward Phalanx stops R3 at 450 m; both
     mounts fire on R4, which is stopped DK4 m short of the starboard side, and its wreck strikes the hull.
     Every outcome is fixed data: the film shows spectacle, not tactics.
     ===================================================================================================== */
  const VR = OG.VR = 680;
  const TI1 = 10.4, TI2 = 10.93, DK1 = 5200, DK2 = 4600;      // interceptor meeting times, ranges
  const DK3 = 450, DK4 = 7;                                   // Phalanx kill ranges (R4: metres short of its aim on the hull)
  // brg: bearing the round comes from (deg true); tArr: reaches its aim; lat: offset across its line far out;
  // y: cruise height; wv: weave [amp m, period s, phase]; aim: ship-frame point (at tArr)
  const RDEF = [
    { id: 'R1', brg: 68.5, tArr: TI1 + DK1 / VR, lat: -330, y: 11.5, wv: [14, 5.6, .4], end: 'int' },
    { id: 'R2', brg: 70.5, tArr: TI2 + DK2 / VR, lat: 250, y: 12.5, wv: [12, 6.2, 2.1], end: 'int' },
    { id: 'R3', brg: 70.5, tArr: 19.61, lat: 0, y: 10, wv: [16, 4.8, 1.3], end: 'ciws', d: DK3, aim: [0, 9, 34] },
    { id: 'R4', brg: 72.5, tArr: 19.50, lat: -30, y: 9, wv: [22, 4.2, 2.8], end: 'hull', d: DK4, aim: [9.95, 6.2, 20] },
  ];
  const ROUNDS = OG.ROUNDS = RDEF.map((d, i) => {
    const r = Object.assign({ i, aim: [0, 9, 0] }, d);
    const b = r.brg * D2R;
    r.u = [Math.sin(b), 0, Math.cos(b)];                  // from the aim toward where it comes from
    r.n = [Math.cos(b), 0, -Math.sin(b)];
    r.aimW = X.ap(OG.shipXf(r.tArr), r.aim);
    r.tEnd = r.end === 'int' ? null : r.tArr - r.d / VR;    // interceptor kills are set below
    return r;
  });
  const RID = OG.RID = {}; ROUNDS.forEach(r => RID[r.id] = r);
  /* position of round r at S (world). s = distance still to fly to its aim point. */
  function roundAt(r, S) {
    const s = VR * (r.tArr - S), taper = Math.pow(clamp(s / 9000, 0, 1), .8);
    const wv = r.wv[0] * Math.sin(TAU * (S - r.i * 1.7) / r.wv[1] + r.wv[2]) * ss(1100, 3800, s);
    const lat = r.lat * taper + wv;
    let y = r.y + .8 * Math.sin(.9 * S + r.i);
    if (r.end === 'hull') y = mix(r.aim[1], y, ss(0, 900, s));
    else y = mix(Math.max(6, r.aim[1] * .6), y, ss(0, 700, s));
    const a = r.aimW;
    return [a[0] + r.u[0] * s + r.n[0] * lat, y, a[2] + r.u[2] * s + r.n[2] * lat];
  }
  OG.roundAt = roundAt;
  OG.roundDir = (r, S) => V.norm(V.sub(roundAt(r, S + .02), roundAt(r, S - .02)));
  OG.roundDist = (r, S) => { const p = roundAt(r, S), c = OG.shipPos(S); return Math.hypot(p[0] - c[0], p[2] - c[2]); };
  /* distance from R4 to the ship's starboard side (m), for the readout */
  OG.hullGap = (r, S) => { const q = toShip(OG.shipXf(S), V.sub(roundAt(r, S), OG.shipXf(S).T)); return Math.max(0, Math.abs(q[0]) - halfB(q[2])); };
  /* 0..1 how much of round r is there at S (stage B paints the stop) */
  OG.roundVis = (r, S) => 1 - ss(r.tEnd - .004, r.tEnd, S);
  OG.roundLive = (r, S) => S < r.tEnd;

  /* ---------------- interceptors (RIM-174 SM-6 out of the Mk 41 cells) ----------------
     Straight up out of the cell, pitch-over, a lofted curve down onto the meeting point; flown with a
     boost-then-coast speed law (the Mk 72 brings it up to speed over KB s). Tables at HZ per sim second. */
  const IDEF = [
    { id: 'I1', cell: 12, tL: 3.6, r: 'R1', tI: TI1 },
    { id: 'I2', cell: 52, tL: 4.55, r: 'R2', tI: TI2 },
  ];
  const HZ = 120, KB = 4.0, CV0 = .035;
  OG.SEP = 6;                                         // Mk 72 burnout and separation, s after launch
  const INTS = OG.INTS = IDEF.map((d, i) => {
    const I = Object.assign({ i }, d), r = RID[I.r];
    I.round = r; r.int = I; r.tEnd = I.tI;
    const P0 = X.ap(OG.shipXf(I.tL), DA.vls(I.cell));
    const PI_ = roundAt(r, I.tI);
    const hv = [PI_[0] - P0[0], 0, PI_[2] - P0[2]], dist = Math.hypot(hv[0], hv[2]), uh = V.mul(hv, 1 / dist);
    const PV = V.add(P0, [0, 55, 0]);
    const P1 = V.add(PV, [0, clamp(.022 * dist, 80, 280), 0]);
    const P2 = V.add(V.mad(PI_, uh, -.34 * dist), [0, clamp(.021 * dist, 50, 250), 0]);
    const bez = u => { const a = 1 - u; return [0, 1, 2].map(c => a * a * a * PV[c] + 3 * a * a * u * P1[c] + 3 * a * u * u * P2[c] + u * u * u * PI_[c]); };
    const NV = 40, NB = 1200, cum = new Float64Array(NB + 1), pts = [];
    for (let k = 0; k <= NB; k++) { pts.push(k <= NV ? V.lerp(P0, PV, k / NV) : bez((k - NV) / (NB - NV))); if (k) cum[k] = cum[k - 1] + V.dist(pts[k], pts[k - 1]); }
    const L = cum[NB], Tf = I.tI - I.tL;
    const g = t => CV0 + (1 - CV0) * ss(0, KB, t), FN = Math.ceil(Tf * 480), FT = new Float64Array(FN + 1);
    for (let k = 1; k <= FN; k++) { const a = (k - 1) / 480, b = k / 480; FT[k] = FT[k - 1] + (g(a) + g(b)) * .5 / 480; }
    const F = t => { const x = clamp(t * 480, 0, FN - 1e-6), k = Math.floor(x); return FT[k] + (FT[k + 1] - FT[k]) * (x - k); };
    const vK = L / F(Tf), N = Math.ceil(Tf * HZ) + 2, P = new Float64Array(N * 3), SP = new Float64Array(N);
    let k = 0;
    for (let j = 0; j < N; j++) {
      const t = Math.min(Tf, j / HZ), s = L * F(t) / F(Tf);
      while (k < NB - 1 && cum[k + 1] < s) k++;
      const f = clamp((s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), 0, 1), q = V.lerp(pts[k], pts[k + 1], f);
      P[j * 3] = q[0]; P[j * 3 + 1] = q[1]; P[j * 3 + 2] = q[2]; SP[j] = vK * g(t);
    }
    Object.assign(I, { P0, PI: PI_, P, N, L, vEnd: vK * g(Tf), SP, tEnd: I.tI, dist });
    return I;
  });
  const IID = OG.IID = {}; INTS.forEach(I => IID[I.id] = I);
  /* interceptor head (nose) at S (world); null before launch / after the meeting */
  function intAt(I, S) {
    const x = (S - I.tL) * HZ;
    if (x < 0 || S > I.tEnd) return null;
    const j = Math.min(I.N - 2, Math.floor(x)), f = Math.min(1, x - j), P = I.P, a = j * 3;
    return [P[a] + (P[a + 3] - P[a]) * f, P[a + 1] + (P[a + 4] - P[a + 1]) * f, P[a + 2] + (P[a + 5] - P[a + 2]) * f];
  }
  OG.intAt = intAt;
  /* clamped: the cell mouth before launch, the meeting point after (for cameras and labels) */
  OG.intAtC = (I, S) => intAt(I, clamp(S, I.tL, I.tEnd));
  OG.intDir = (I, S) => { const a = intAt(I, clamp(S - .02, I.tL, I.tEnd)), b = intAt(I, clamp(S + .02, I.tL, I.tEnd)); return a && b && V.dist(a, b) > 1e-6 ? V.norm(V.sub(b, a)) : [0, 1, 0]; };
  OG.intSpeed = (I, S) => { const x = clamp((S - I.tL) * HZ, 0, I.N - 1.001), j = Math.floor(x); return I.SP[j] + (I.SP[j + 1] - I.SP[j]) * (x - j); };
  /* the path flown so far (world points, every `step` samples) up to S */
  OG.intTrace = (I, S, step) => {
    const out = [], jN = Math.min(I.N - 1, Math.floor((Math.min(S, I.tEnd) - I.tL) * HZ));
    for (let j = 0; j <= jN; j += step || 6) out.push([I.P[j * 3], I.P[j * 3 + 1], I.P[j * 3 + 2]]);
    const h = intAt(I, Math.min(S, I.tEnd)); if (h) out.push(h);
    return out;
  };

  /* Mk 41 hatches: open ~1.4 s before a launch, close ~3 s after */
  OG.vlsOpen = function (S) {
    const out = [];
    for (const I of INTS) { const f = ss(I.tL - 1.5, I.tL - .7, S) * (1 - ss(I.tL + 2.6, I.tL + 3.6, S)); if (f > .001) out.push([I.cell, f]); }
    return out.length ? out : null;
  };

  /* ---------------- Phalanx 1B mounts (0 forward, 1 aft) ----------------
     Each engagement slews its mount onto its round over sl s from tS (leading it by the tracer's time of flight),
     fires from t0 to t1 (t1 = the kill), and the mount goes back to rest after its last one. Stage B draws the
     tracer from this data (muzzle + direction per round fired: OG.ciwsMuzzle). */
  const CIWS_REST = [[0, .35], [PI, .35]];
  const CIWS_ENG = OG.CIWS_ENG = [
    { m: 0, r: 'R3', tS: 16.3, sl: 1.0, t0: 17.35 },
    { m: 1, r: 'R4', tS: 17.5, sl: 1.0, t0: 18.55 },
    { m: 0, r: 'R4', tS: RID.R3.tEnd + .03, sl: .2, t0: 19.18 },
  ];
  for (const e of CIWS_ENG) { e.round = RID[e.r]; e.t1 = e.round.tEnd; }
  const CIWS_P = OG.CIWS_P = [DA.ciws({}, 0), DA.ciws({}, 1)];
  const TV = OG.TRACER_V = 1030;                       // mean 20 mm speed over the ranges that matter
  function aimAngles(from, w, Xs) {
    const d = toShip(Xs, V.sub(w, X.ap(Xs, from)));
    return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))];
  }
  function ciwsAim(e, S, Xs) {
    const r = e.round, tt = Math.min(S, r.tEnd - .004);
    let p = roundAt(r, tt);
    for (let k = 0; k < 3; k++) p = roundAt(r, Math.min(r.tEnd, tt + V.dist(p, X.ap(Xs, CIWS_P[e.m])) / TV));
    return aimAngles(CIWS_P[e.m], p, Xs);
  }
  OG.ciwsState = function (S) {
    const yaw = [CIWS_REST[0][0], CIWS_REST[1][0]], pit = [CIWS_REST[0][1], CIWS_REST[1][1]];
    const Xs = OG.shipXf(S);
    for (let m = 0; m < 2; m++) {
      let y = CIWS_REST[m][0], p = CIWS_REST[m][1], last = null;
      for (const e of CIWS_ENG) {
        if (e.m !== m || S < e.tS) continue;
        const [ay, ap] = ciwsAim(e, S, Xs), w = ss(e.tS, e.tS + e.sl, S);
        y = y + angD(y, ay) * w; p = mix(p, ap, w); last = e;
      }
      if (last) { const w = ss(last.t1 + 1.6, last.t1 + 4.2, S); y = y + angD(y, CIWS_REST[m][0]) * w; p = mix(p, CIWS_REST[m][1], w); }
      yaw[m] = y; pit[m] = p;
    }
    return { yaw, pitch: pit };
  };
  // gatling spin: 4 500 rds/min over six barrels = 12.5 rev/s, spun up just before a burst, run down after.
  // Integrated once over S so the barrels turn with the sim clock (a quarter turn a second of film at x0.02).
  const SP_HZ = 480, SP_S0 = -3, SP_S1 = 26, SP_N = Math.ceil((SP_S1 - SP_S0) * SP_HZ) + 2, SPIN = [new Float64Array(SP_N), new Float64Array(SP_N)];
  const spinRate = (m, S) => { let w = 0; for (const e of CIWS_ENG) if (e.m === m) w = Math.max(w, ss(e.t0 - .45, e.t0 - .05, S) * (1 - ss(e.t1 + .15, e.t1 + 1.4, S))); return w * 12.5 * TAU; };
  OG.spinRate = spinRate;
  for (let m = 0; m < 2; m++) for (let i = 1; i < SP_N; i++) { const a = SP_S0 + (i - 1) / SP_HZ, b = SP_S0 + i / SP_HZ; SPIN[m][i] = SPIN[m][i - 1] + (spinRate(m, a) + spinRate(m, b)) * .5 / SP_HZ; }
  OG.ciwsSpin = (m, S) => { const x = clamp((S - SP_S0) * SP_HZ, 0, SP_N - 1.001), i = Math.floor(x); return SPIN[m][i] + (SPIN[m][i + 1] - SPIN[m][i]) * (x - i); };
  OG.ciwsFiring = (m, S) => CIWS_ENG.some(e => e.m === m && S >= e.t0 && S <= e.t1);
  /* muzzle + bore direction of mount m at S (world), from the mount state at S */
  OG.ciwsMuzzle = function (m, S) {
    const st = OG.ciwsState(S), Xs = OG.shipXf(S), sst = { ciwsYaw: st.yaw, ciwsPitch: st.pitch };
    return { p: X.ap(Xs, DA.ciws(sst, m)), d: X.dir(Xs, DA.ciwsDir(sst, m)) };
  };

  /* ---------------- Mk 45: trains onto the raid's bearing after the launches (it does not fire here) ---------------- */
  OG.gunState = S => ({ yaw: 70 * D2R * ss(4.5, 9, S), pitch: 3 * D2R * ss(5, 9, S) });

  /* ---------------- the hit: R4 is stopped DK4 m short of the starboard side, its wreck strikes the hull ---------------- */
  const R4 = RID.R4;
  const HIT = OG.HIT = { S: R4.tEnd + DK4 * .9 / VR, r: 'R4', at: R4.aim.slice(), p: R4.aimW.slice(), kill: roundAt(R4, R4.tEnd) };

  /* ---------------- events (sim-time sorted: the log, sounds and stage B) ---------------- */
  const EV = OG.EVENTS = [];
  for (const I of INTS) {
    EV.push({ S: I.tL, kind: 'launch', I });
    EV.push({ S: I.tI, kind: 'intercept', I, r: I.round, p: I.PI });
  }
  for (const e of CIWS_ENG) EV.push({ S: e.t0, kind: 'ciws', e });
  EV.push({ S: RID.R3.tEnd, kind: 'ciwsKill', r: RID.R3, p: roundAt(RID.R3, RID.R3.tEnd), m: 0 });
  EV.push({ S: R4.tEnd, kind: 'ciwsKill', r: R4, p: HIT.kill, m: 1 });
  EV.push({ S: HIT.S, kind: 'hit', p: HIT.p });
  EV.sort((a, b) => a.S - b.S);

  Object.assign(OG, { RDEF, HZ, KB });

  /* =====================================================================================================
     THE CLOCK: film time T -> sim time S = OGC.S(T), rate = OGC.rate(T) (sim s per film s), eased between keys.
     x1 at the start (the calm, the first launch), easing to x0.02 for three long freezes (the launch, the rounds
     over the water, the close-in fight), faster transits between them, x1 again for the last seconds (the kill,
     the flash), then the rewind: the rate runs negative, S back past 0 to S_DIP, stops, and plays forward at
     x1 into S = 0 at T = D, which is frame 0 with the same rate: the seam is exact in S and in dS/dT.
     The transit peaks (a, b) and the rewind speed (c) are solved at load so the freezes open on their marks.
     ===================================================================================================== */
  const D = OG.D = 160, F = .02, SB0 = 15.3, SC0 = 18.79, S_DIP = -1.25;
  const CK = (a, b, c) => [
    [0, 1], [2.6, 1], [7.2, F], [34, F],                  // calm, launch; freeze A
    [45, a], [56, F],                                      // transit 1 (out to the water)
    [86, F], [95, b], [104, F],                            // freeze B; transit 2 (in with R4)
    [138, F], [141, 1], [143, 1],                          // freeze C; real time
    [145.5, -c], [151.5, -c], [155.5, -.35], [157.5, 0],   // rewind
    [D, 1],                                                // back up to x1 into frame 0
  ];
  function mkWarp(keys) {
    const T1 = keys[keys.length - 1][0], N = Math.ceil(T1 * 400), acc = new Float64Array(N + 1);
    const rate = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const a = keys[i], b = keys[i + 1]; return mix(a[1], b[1], ss(a[0], b[0], t)); };
    for (let k = 1; k <= N; k++) { const t0 = (k - 1) / N * T1, t1 = k / N * T1; acc[k] = acc[k - 1] + (rate(t0) + rate(t1)) * .5 * (t1 - t0); }
    const f = t => { const x = clamp(t / T1, 0, 1) * N, k = Math.min(N - 1, Math.floor(x)); return acc[k] + (acc[k + 1] - acc[k]) * (x - k); };
    f.rate = rate; return f;
  }
  const bis = (fn, lo, hi, target) => { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (fn(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
  const A_ = bis(a => mkWarp(CK(a, 0, 0))(56), F, 4, SB0);
  const B_ = bis(b => mkWarp(CK(A_, b, 0))(104), F, 4, SC0);
  const C_ = bis(c => -mkWarp(CK(A_, B_, c))(D), 0, 12, 0);
  const SW = mkWarp(CK(A_, B_, C_));
  const T_FWD = 143;
  const tOfS = S => { let lo = 0, hi = T_FWD; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (SW(m) < S) lo = m; else hi = m; } return (lo + hi) / 2; };
  window.OGC = {
    D, S: t => SW(((t % D) + D) % D), rate: t => SW.rate(((t % D) + D) % D), tOfS,
    peaks: { a: A_, b: B_, c: C_ }, marks: { SB0, SC0, S_DIP, F, T_FWD },
  };
})();
