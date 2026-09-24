/* OH "Storm" world: a destroyer column steaming north into a storm at night. The storm's envelope (sea state, rain,
   wind, gusts), the swell and how each ship rides it (heave, pitch, roll from the sea under its hull), the bow
   slams that throw spray, sea rows / whitecaps / wakes, and the raid as data: four rounds, three interceptor paths
   lofted into the cloud, the Phalanx mounts, the hit forward. Everything is a pure function of film time T; the
   ship motion and the spray events are integrated once at load into tables over the ships' own time.
   World: metres, X east, Y up, Z north. Loads after geo.js + hd_land.js + hd_sea_air.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, G = 9.81, RE = 6.371e6;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OH = window.OH = {};
  const D = OH.D = 165, VK = OH.VK = 7;          // loop length, ship speed (7 m/s = 13.6 kn, heading into the sea)
  const fr = x => x - Math.floor(x);
  const hash = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const modp = (a, m) => ((a % m) + m) % m;
  const angD = (a, b) => modp(b - a + PI, TAU) - PI;
  Object.assign(OH, { PI, TAU, D2R, G, RE, hash, modp, angD, fr });

  const DA = OH.DA = HD.destroyer.A;
  const hD = DA.deckY;
  // hull half-breadth at the deck edge and at the waterline (hd_sea_air's ddSec)
  const ZB = 77.6;
  const hB = z => { const u = z / ZB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); if (u < -.55) return 10 * (1 - .14 * Math.pow((-.55 - u) / .45, 1.5)); return 10; };
  const hW = z => { if (z >= 70.6) return 0; const u = z / ZB, ue = 70.6 / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
  OH.hB = hB; OH.hW = hW;

  /* ---------------- the storm's envelope (global, periodic in D) ----------------
     The loop opens in the calm before: long swell, a few drops, a light wind. The squall line arrives (~15-35 s),
     blows through the raid, and rolls on (~122-156 s), leaving the calm before again at the seam. */
  function env(keys) {
    return T => {
      T = modp(T, D);
      let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= T) i++;
      const a = keys[i], b = keys[i + 1];
      return mix(a[1], b[1], ss(a[0], b[0], T));
    };
  }
  const stormK = OH.stormK = env([[0, 0], [14, 0], [36, 1], [122, 1], [156, 0], [165, 0]]);
  const seaK = OH.seaK = env([[0, 0], [8, 0], [44, 1], [126, 1], [161, 0], [165, 0]]);
  const rainK = OH.rainK = env([[0, .05], [15, .05], [31, 1], [124, 1], [148, .16], [157, .05], [165, .05]]);
  // gusts: sines with whole cycles per loop (periodic, irregular-looking)
  const gust = OH.gust = T => 1 + .22 * Math.sin(TAU * 23 * T / D + 1.3) + .13 * Math.sin(TAU * 58 * T / D + .4) + .07 * Math.sin(TAU * 131 * T / D + 2.2);
  const WFROM = 40 * D2R;
  const WTO = OH.WTO = [-Math.sin(WFROM), 0, -Math.cos(WFROM)];          // the wind blows from 040 toward 220
  OH.windSpd = T => mix(6, 22, stormK(T)) * mix(1, gust(T), .35 + .65 * stormK(T));
  OH.windAt = T => V.mul(WTO, OH.windSpd(T));
  // visibility (m) in the rain at night; lightning opens it up
  OH.visRange = (T, L) => mix(mix(9000, 2600, stormK(T)), 30000, L || 0);
  OH.CB = 430;                                                            // cloud base (m)

  /* ---------------- the sea ----------------
     Gravity waves, frequencies rounded so the sea repeats every D s. d = direction of travel (deg): the swell comes
     out of the NNE, the short wind sea off the wind. Amplitudes rise with the storm (the short waves most). */
  const WAVES = OH.WAVES = [
    { A: 1.75, L: 140, d: 196, ph: 0, c: .66 }, { A: .95, L: 86, d: 214, ph: 1.7, c: .5 }, { A: .55, L: 52, d: 178, ph: 4.1, c: .34 },
    { A: .3, L: 31, d: 226, ph: 2.2, c: .24 }, { A: .16, L: 18, d: 204, ph: 5.3, c: .2 }, { A: .08, L: 11, d: 190, ph: .9, c: .18 },
  ].map(w => {
    const k = TAU / w.L, d = w.d * D2R, n = Math.max(1, Math.round(Math.sqrt(G * k) * D / TAU));
    return { A0: w.A, c: w.c, kx: k * Math.sin(d), kz: k * Math.cos(d), w: n * TAU / D, ph: w.ph, L: w.L, per: D / n };
  });
  const NW = WAVES.length, NLONG = 3;
  const AMP = new Float64Array(NW);
  function setSea(T) { const k = seaK(T); for (let i = 0; i < NW; i++) AMP[i] = WAVES[i].A0 * mix(WAVES[i].c, 1, k); }
  OH.setSea = setSea;
  /* sea surface height with the amplitudes of the last setSea(T) */
  function swell(x, z, T) { let h = 0; for (let i = 0; i < NW; i++) { const w = WAVES[i]; h += AMP[i] * Math.sin(w.kx * x + w.kz * z - w.w * T + w.ph); } return h; }
  function swellLong(x, z, T) { let h = 0; for (let i = 0; i < NLONG; i++) { const w = WAVES[i]; h += AMP[i] * Math.sin(w.kx * x + w.kz * z - w.w * T + w.ph); } return h; }
  OH.swell = swell;
  OH.swellAt = (x, z, T) => { setSea(T); return swell(x, z, T); };

  /* ---------------- the ships ----------------
     A is the hero. B and C follow on A's track VK*D and 2*VK*D astern, running the same film D and 2D later (they
     are calm: their film has not started). At T = D, B stands where A stood at T = 0 (same world point, same sea), so
     the take loops by arriving on B. Each ship's motion depends on its own time tau = T - n*D only (through its
     position on the track and the time-periodic sea), so one table over tau in [-2D, D] serves all three. */
  const SHIPS = OH.SHIPS = [0, 1, 2].map(n => ({ id: 'ABC'[n], n, kind: 'ddg', tau: n * D, L: 155.2, B: 20 }));
  const [SA, SB] = SHIPS;
  OH.A = SA; OH.B = SB;
  OH.shipPos = (S, T) => [0, 0, VK * (T - S.tau)];
  OH.shipFrame = (S, T) => X.make(R.I(), OH.shipPos(S, T));

  /* ship motion: heave and pitch follow the long waves under the keel (least-squares plane through the surface
     sampled along the hull), roll is the beam sea's slope plus the hull's own roll (~11 s), yaw a slow sheer.
     Smoothed over ~0.4 s for the hull's inertia. The bow's clearance over the local sea drives the spray. */
  const MHZ = 30, M0 = -2 * D - 8, M1 = D + 8, MN = Math.ceil((M1 - M0) * MHZ) + 1;
  const MH = new Float32Array(MN), MP = new Float32Array(MN), MR = new Float32Array(MN), MY = new Float32Array(MN), MB = new Float32Array(MN);
  {
    // heave from the surface over the middle body, pitch from its slope over the fore and aft bodies (a hull-length
    // average of a hull-length swell would cancel it)
    const ZH = [-24, -12, 0, 12, 24], ZK = [-44, -22, 0, 22, 44], SZZ = ZK.reduce((s, z) => s + z * z, 0);
    const rh = new Float32Array(MN), rp = new Float32Array(MN), rr = new Float32Array(MN);
    for (let i = 0; i < MN; i++) {
      const tau = M0 + i / MHZ, T = modp(tau, D), z0 = VK * tau;
      setSea(T);
      let sh = 0, sz = 0;
      for (const zk of ZH) sh += swellLong(0, z0 + zk, T);
      for (const zk of ZK) sz += swellLong(0, z0 + zk, T) * zk;
      rh[i] = sh / ZH.length * .85;
      rp[i] = Math.atan(sz / SZZ) * .9;
      const beam = (swellLong(8.5, z0 + 8, T) - swellLong(-8.5, z0 + 8, T)) / 17;
      const k = mix(.4, 1, seaK(T));
      rr[i] = Math.atan(beam) * .7 + k * (3.6 * Math.sin(TAU * 15 * T / D + .7) + 1.3 * Math.sin(TAU * 37 * T / D + 2.1)) * D2R;
      MY[i] = k * (.9 * Math.sin(TAU * 11 * T / D + 1.9) + .4 * Math.sin(TAU * 29 * T / D + .3)) * D2R;
    }
    // Gaussian smoothing (sigma ~0.35 s)
    const sg = .35 * MHZ, kr = Math.ceil(sg * 3), wk = [];
    for (let j = -kr; j <= kr; j++) wk.push(Math.exp(-j * j / (2 * sg * sg)));
    const blur = (src, dst) => { for (let i = 0; i < MN; i++) { let s = 0, w = 0; for (let j = -kr; j <= kr; j++) { const q = i + j; if (q < 0 || q >= MN) continue; s += src[q] * wk[j + kr]; w += wk[j + kr]; } dst[i] = s / w; } };
    blur(rh, MH); blur(rp, MP); blur(rr, MR);
    // bow clearance: the stem's flare (z 68, 1.6 m up) over the full sea surface there
    for (let i = 0; i < MN; i++) {
      const tau = M0 + i / MHZ, T = modp(tau, D), z0 = VK * tau;
      setSea(T);
      MB[i] = MH[i] + 68 * Math.sin(MP[i]) + 1.6 - swell(0, z0 + 68, T);
    }
  }
  const mIdx = tau => { const x = clamp((tau - M0) * MHZ, 0, MN - 1.001), i = Math.floor(x); return [i, x - i]; };
  const mGet = (A, i, f) => A[i] + (A[i + 1] - A[i]) * f;
  function shipMot(S, T) {
    const [i, f] = mIdx(T - S.tau);
    return { heave: mGet(MH, i, f), pitch: mGet(MP, i, f), roll: mGet(MR, i, f), yaw: mGet(MY, i, f) };
  }
  OH.shipMot = shipMot;
  OH.bowClear = (S, T) => { const [i, f] = mIdx(T - S.tau); return mGet(MB, i, f); };
  /* the ship's transform: pitch + is bow up (R.x(-pitch)), roll + is starboard up */
  OH.shipXf = (S, T) => {
    const m = shipMot(S, T), p = OH.shipPos(S, T);
    return X.make(R.mul(R.y(m.yaw), R.mul(R.z(m.roll), R.x(-m.pitch))), [p[0], m.heave, p[2]]);
  };
  const toShip = (Xs, w) => { const M = Xs.R; return [M[0] * w[0] + M[3] * w[1] + M[6] * w[2], M[1] * w[0] + M[4] * w[1] + M[7] * w[2], M[2] * w[0] + M[5] * w[1] + M[8] * w[2]]; };
  OH.toShip = toShip;

  /* bow slams: local minima of the bow's clearance where the flare buries into a crest. Each throws a sheet of
     spray (drawn in oh_storm_sky.js from its time, strength and seed). Times are in the ships' own tau. */
  const SLAMS = OH.SLAMS = [];
  {
    for (let i = 8; i < MN - 8; i++) {
      const c = MB[i];
      if (!(c < MB[i - 1] && c <= MB[i + 1])) continue;
      let lo = true; for (let j = -8; j <= 8; j++) if (MB[i + j] < c) { lo = false; break; }
      if (!lo) continue;
      let top = c; for (let j = Math.max(0, i - 75); j < i; j++) top = Math.max(top, MB[j]);
      const drop = top - c;                                              // how far it came down onto the sea
      const s = sat((1.6 - c) / 3) * sat((drop - 1.5) / 3.5);
      const tau = M0 + i / MHZ, sk = s * mix(.22, 1, seaK(modp(tau, D)));
      if (sk < .06) continue;
      SLAMS.push({ tau, s: sk, seed: SLAMS.length * 7.31 + 1.7, side: hash(i, 3) < .5 ? -1 : 1 });
    }
  }
  /* slams of ship S alive at T (age < life) */
  OH.slamsAt = (S, T, life) => {
    const tau = T - S.tau, out = [];
    for (const sl of SLAMS) { const a = tau - sl.tau; if (a >= 0 && a < life) out.push({ sl, age: a }); }
    return out;
  };

  /* ---------------- sea rows (as Ring, heights from the storm sea, faded by visibility) ---------------- */
  const SEA = { C: 15, S0: 1, base: .2 };
  OH.drawSea = function (W, cam, T, ph, o) {
    o = o || {};
    setSea(T);
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
    const vis = o.vis || 1e9, L = o.L || 0;
    const cutAt = (x, z) => {
      for (let k = 0; k < ships.length; k++) {
        const s = ships[k], dx = x - s.x, dz = z - s.z;
        if (dx * dx + dz * dz > s.r2) continue;
        if (Math.abs(dz) < s.L / 2 + 1.5 && Math.abs(dx) < hB(dz) + 1.2) return true;
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
        // the rain's murk: rows fade into the dark beyond the visibility (lightning opens it up)
        a *= mix(Math.exp(-Math.pow(rho / vis, 1.3)), 1, L * .85);
        if (a < .006) continue;
        const half = Math.min(wMax * 1.05 + 20, (Math.abs(d) + h) * tW * 1.25 + 30);
        const du = Math.min(1024, Math.pow(2, Math.max(0, Math.ceil(Math.log2(half / 30)))));
        const uoff = modp(phR, du), i0 = Math.floor((-half + uoff) / du), i1 = Math.ceil((half + uoff) / du);
        const amp = Math.min(1, 260 / rho + .14);
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
    const ha = .3 * (o.horizon === undefined ? 1 : o.horizon);
    for (let k = 0; k < hb.length - 1; k++) W.seg(hb[k], hb[k + 1], ha);
    return { dHor, fx, fz };
  };

  /* whitecaps and wind streaks: seeded world cells; foam where a crest breaks, streaked down the wind. The storm
     breaks more crests and lays longer streaks. */
  OH.drawCaps = function (W, cam, T, o) {
    o = o || {};
    setSea(T);
    const e = cam.eye, h = Math.max(1, e[1]);
    const c = 9 * Math.pow(2, Math.max(0, Math.round(Math.log2(h / 30)))), N = 24;
    let fx = cam.f[0], fz = cam.f[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const cx = e[0] + fx * c * N * .8, cz = e[2] + fz * c * N * .8;
    const i0 = Math.floor(cx / c) - N, j0 = Math.floor(cz / c) - N, ships = o.ships || [];
    const sk = stormK(T), A0 = .42 * (o.alpha === undefined ? 1 : o.alpha), Lk = c / 9;
    const thr = mix(.16, .5, sk), crest0 = mix(.55, .15, sk), vis = o.vis || 1e9, L = o.L || 0;
    const wx = WTO[0], wz = WTO[2];
    for (let i = i0; i < i0 + 2 * N; i++) for (let j = j0; j < j0 + 2 * N; j++) {
      const hh = hash(i, j); if (hh > thr) continue;
      const x = (i + hash(j, i + 7)) * c, z = (j + hash(i + 3, j - 5)) * c;
      let cut = false;
      for (const s of ships) { const dx = x - s.x, dz = z - s.z; if (Math.abs(dz) < s.L / 2 + 6 && Math.abs(dx) < hB(dz) + 5) { cut = true; break; } }
      if (cut) continue;
      const sw = swell(x, z, T), crest = sat((sw - crest0) / 1.4);
      if (crest <= 0) continue;
      const dist = Math.hypot(x - e[0], z - e[2], h);
      let a = A0 * crest * Math.pow(1 - Math.min(1, dist / (c * N * 1.6)), 1.5) * (.55 + .45 * Math.sin(TAU * 3 * T / D + hh * 40));
      a *= mix(Math.exp(-Math.pow(dist / vis, 1.3)), 1, L * .85);
      if (a < .01) continue;
      const len = Lk * (1.4 + (2.4 + 4 * sk) * hash(i + 11, j)), y = sw * Math.min(1, 260 / dist + .14) + .06;
      const ox = -wz * Lk * .5 * (hash(i, j + 9) - .5), oz = wx * Lk * .5 * (hash(i, j + 9) - .5);
      W.seg([x - wx * len * .3, y, z - wz * len * .3], [x + wx * len * .7, y, z + wz * len * .7], a);
      if (sk > .3 && hh < thr * .45) W.seg([x + ox - wx * len * .1, y, z + oz - wz * len * .1], [x + ox + wx * len * 1.1, y, z + oz + wz * len * 1.1], a * .5 * sk);
    }
  };

  /* Kelvin wake + bow wave + churned centreline in the ship's heading frame, laid on the heaving sea */
  const LAM = TAU * VK * VK / G, KEL = 19.47 * D2R, TK = Math.tan(KEL);
  OH.drawWake = function (W, S, T, o) {
    o = o || {};
    setSea(T);
    const Fr = OH.shipFrame(S, T), amp = .92;
    const P = (x, z, y) => { const q = X.ap(Fr, [x, 0, z]); q[1] = (y === undefined ? .12 : y) + amp * swell(q[0], q[2], T); return q; };
    const L = S.L, zb = L / 2, zs = -L / 2, bw = S.B / 2, tau = T - S.tau, A = o.alpha === undefined ? 1 : o.alpha;
    const Lw = 700;
    for (const sg of [-1, 1]) {
      let pv = P(sg * bw * .35, zb - 4);
      for (let i = 1; i <= 22; i++) {
        const l = i / 22 * Lw, z = zb - 4 - l, x = sg * (bw * .35 + l * TK) + 1.6 * Math.sin(i * 1.7 + tau * 1.3);
        const q = P(x, z);
        W.seg(pv, q, A * .26 * Math.pow(1 - i / 23, 1.3));
        pv = q;
      }
      const b0 = P(sg * .3, zb - 1.5, .25), b1 = P(sg * (bw * .72 + 1.2), zb - L * .2, .2), b2 = P(sg * (bw + 3.5), zb - L * .42, .12);
      W.seg(b0, b1, A * .5); W.seg(b1, b2, A * .28);
      for (let k = 0; k < 7; k++) {
        const f = fr(tau * .9 + k * .37), zz = zb - 2 - k * 2.2;
        W.seg(P(sg * (.4 + k * .9), zz, .3 + .6 * (1 - f)), P(sg * (1.2 + k * 1.1), zz - 1.6, .15), A * .28 * (1 - f));
      }
      for (let k = 0; k < 10; k++) { const z = zb - 20 - k * 12; const x = sg * (hB(z) + 1.6 + .8 * Math.sin(k * 2.3 + tau * 1.7)); W.seg(P(x, z), P(x + sg * .6, z - 8), A * .22); }
    }
    for (let k = 1; k <= 10; k++) {
      const z = zs - k * LAM + 8, l = zb - 4 - z, xm = bw * .35 + l * TK, a = A * .13 * Math.pow(1 - k / 11, 1.5);
      let pv = null;
      for (let i = 0; i <= 10; i++) {
        const u = -1 + 2 * i / 10, q = P(u * xm * .82, z + Math.pow(Math.abs(u), 2) * LAM * .38);
        if (pv) W.seg(pv, q, a * (1 - .6 * Math.abs(u)));
        pv = q;
      }
    }
    const sp = 12, cyc = Math.floor((tau * VK) / sp);
    for (let i = 0; i < 40; i++) {
      const z0 = zs - 2 - i * sp - modp(tau * VK, sp), wide = bw * .42 + (zs - z0) * .03, fade = Math.pow(1 - i / 41, 1.2);
      for (let j = 0; j < 5; j++) {
        const hh = hash(i * 5 + j, cyc - i), x0 = wide * (hh * 2 - 1) * .92, len = 3 + 5 * hash(cyc - i, j + 11);
        W.seg(P(x0, z0 - j * 2.1), P(x0 + .4 * (hh - .5), z0 - j * 2.1 - len), A * .28 * fade * (1 - .5 * Math.abs(hh * 2 - 1)));
      }
    }
    for (const sg of [-1, 1]) {
      let pv = null;
      for (let i = 0; i <= 32; i++) {
        const d = i * 16, z = zs - 1 - d, w = bw * .42 + d * .03 + 1.2 * Math.sin(i * 1.9 + sg + (tau * VK - d) * .07);
        const q = P(sg * w, z);
        if (pv) W.seg(pv, q, A * .28 * Math.pow(1 - i / 33, 1.3));
        pv = q;
      }
    }
  };

  /* heat shimmer over the uptakes, torn aft-to-port by the relative wind */
  OH.drawShimmer = function (W, mouth, up, aft, side, tau, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, n = o.n || 8, Lp = o.len || 12, lean0 = o.lean || 1.1;
    const out = V.norm(V.cross(up, aft));
    for (let i = 0; i < n; i++) {
      const ph = i * 2.39, lat = ((i + .5) / n - .5) * (o.w || 2.6);
      let pv = null;
      for (let k = 0; k <= 18; k++) {
        const s = k / 18 * Lp, rise = s * .5, lean = s * lean0 + .02 * s * s;
        const amp = .05 + s * .04;
        const wob = amp * (Math.sin(2.3 * s - 12.5 * tau + ph) + .6 * Math.sin(4.1 * s - 19.7 * tau + ph * 1.7));
        const q = V.add(V.add(V.mad(V.mad(mouth, up, rise), aft, lean), V.mul(side, lat * (1 + s * .05) + wob - s * .25)), V.mul(out, amp * .8 * Math.sin(3.1 * s - 13.3 * tau + ph)));
        if (pv) W.seg(pv, q, A * .15 * Math.pow(1 - s / Lp, 1.2) * ss(0, 1.5, s));
        pv = q;
      }
    }
  };

  /* =====================================================================================================
     THE RAID
     Four P-800 Oniks (3M55) rounds come in low through the rain from the NE, ~Mach 2 (VR). R1 and R2 are stopped far
     out by interceptors that climb into the cloud and come down onto them; R4 weaves past its interceptor; the
     forward Phalanx stops R3 at ~520 m and swings onto R4 too late: R4 hits the starboard bow. Outcomes are fixed
     data: the film shows spectacle, not tactics.
     ===================================================================================================== */
  const VR = OH.VR = 680, R0 = OH.R0 = 24000;
  const HIT_P = OH.HIT_P = [5.2, 8.3, 51];          // starboard bow, the forecastle deck edge abreast the gun (ship frame)
  const RDEF = [
    { id: 'R1', brg: 35, t0: 64.4, lat: -330, y: 14, wv: [15, 5.4, .3], end: 'int' },
    { id: 'R2', brg: 44, t0: 65.6, lat: 280, y: 12.5, wv: [14, 6.1, 2.2], end: 'int' },
    { id: 'R3', brg: 40, t0: 73.2, lat: -90, y: 12, wv: [26, 4.4, 1.1], end: 'ciws', d: 520, aim: [0, 10, 26], mount: 0 },
    { id: 'R4', brg: 47, t0: 76.2, lat: 170, y: 11, wv: [58, 3.4, .6], end: 'hit' },
  ];
  const ROUNDS = OH.ROUNDS = RDEF.map((d, i) => {
    const r = Object.assign({ i, aim: [0, 10, 0] }, d);
    if (r.end === 'hit') r.aim = HIT_P;
    const b = r.brg * D2R;
    r.u = [Math.sin(b), 0, Math.cos(b)];                         // from the ship toward where it comes from
    r.n = [Math.cos(b), 0, -Math.sin(b)];
    r.tArr = r.t0 + R0 / VR;
    r.aimW = r.end === 'hit' ? X.ap(OH.shipXf(SA, r.tArr), HIT_P) : V.add(OH.shipPos(SA, r.tArr), r.aim);
    if (r.end === 'ciws') r.tEnd = r.tArr - r.d / VR;
    if (r.end === 'hit') r.tEnd = r.tArr;
    return r;
  });
  const RID = OH.RID = {}; ROUNDS.forEach(r => RID[r.id] = r);
  function roundAt(r, T) {
    const s = VR * (r.tArr - T), taper = s / R0;
    const wv = r.wv[0] * Math.sin(TAU * (T - r.t0) / r.wv[1] + r.wv[2]) * ss(900, 3600, s);
    const lat = r.lat * taper + wv;
    let y = r.y + 1.1 * Math.sin(.9 * T + r.i);
    if (r.end === 'hit') y = mix(r.aimW[1], y, ss(0, 700, s));
    else y = mix(Math.max(7, r.aim[1] * .7), y, ss(0, 700, s));
    const a = r.aimW;
    return [a[0] + r.u[0] * s + r.n[0] * lat, y, a[2] + r.u[2] * s + r.n[2] * lat];
  }
  OH.roundAt = roundAt;
  OH.roundDir = (r, T) => V.norm(V.sub(roundAt(r, T + .02), roundAt(r, T - .02)));
  OH.roundDist = (r, T) => { const p = roundAt(r, T), c = OH.shipPos(SA, T); return Math.hypot(p[0] - c[0], p[2] - c[2]); };
  OH.roundVis = (r, T) => ss(r.t0, r.t0 + 1.2, T) * (1 - ss(r.tEnd - .06, r.tEnd, T));
  OH.roundLive = (r, T) => T >= r.t0 && T < r.tEnd;

  /* ---------------- interceptors (RIM-174 SM-6 out of the forward Mk 41) ----------------
     A tall straight column out of the cell that bends over slowly into one long round arc (the rainbow trail), high
     into the cloud (base OH.CB), and down out of it onto the meeting point at tI: a single Bezier whose first control
     points stand straight over the cell, so the bend eases in from zero. Speed builds from rest. The missile keeps
     the ship's way while it clears the cell (blended out along the flight, so the meeting point stays exact).
     miss: passes the round by that many metres and flies on. */
  const IDEF = [
    { cell: 13, tL: 69.6, r: 'R1', tI: 81.6 },
    { cell: 18, tL: 70.9, r: 'R2', tI: 83.3 },
    { cell: 6, tL: 85.8, r: 'R4', tI: 97.6, miss: 38 },
  ];
  const HZ = 60, KB = 7, CV0 = .02;
  const INTS = OH.INTS = IDEF.map((d, i) => {
    const I = Object.assign({ i }, d), r = RID[I.r];
    I.round = r; r.int = I;
    if (r.end === 'int' && !I.miss) r.tEnd = I.tI;
    const P0 = X.ap(OH.shipXf(SA, I.tL), DA.vls(I.cell));
    let PI_ = roundAt(r, I.tI);
    if (I.miss) PI_ = V.add(PI_, V.add(V.mul(r.n, I.miss), [0, 11, 0]));
    const hv = [PI_[0] - P0[0], 0, PI_[2] - P0[2]], dist = Math.hypot(hv[0], hv[2]), uh = V.mul(hv, 1 / dist);
    const up = h => V.add(P0, [0, h, 0]);
    const CP = [P0, up(.1 * dist), up(.2 * dist), V.add(V.mad(PI_, uh, -.45 * dist), [0, .12 * dist, 0]), V.add(V.mad(PI_, uh, -.2 * dist), [0, .015 * dist, 0]), PI_];
    const bez = u => {
      const q = CP.map(p => p.slice());
      for (let n = q.length - 1; n > 0; n--) for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) q[k][c] += (q[k + 1][c] - q[k][c]) * u;
      return q[0];
    };
    const NB = 1600, cum = new Float64Array(NB + 1), pts = [];
    for (let k = 0; k <= NB; k++) { pts.push(bez(k / NB)); if (k) cum[k] = cum[k - 1] + V.dist(pts[k], pts[k - 1]); }
    const L = cum[NB], Tf = I.tI - I.tL;
    const g = t => CV0 + (1 - CV0) * ss(0, KB, t), FN = Math.ceil(Tf * 240), FT = new Float64Array(FN + 1);
    for (let k = 1; k <= FN; k++) { const a = (k - 1) / 240, b = k / 240; FT[k] = FT[k - 1] + (g(a) + g(b)) * .5 / 240; }
    const F = t => { const x = clamp(t * 240, 0, FN - 1e-6), k = Math.floor(x); return FT[k] + (FT[k + 1] - FT[k]) * (x - k); };
    const vEnd = L * g(Tf) / F(Tf);
    const tail = I.miss ? 1.8 : 0, N = Math.ceil((Tf + tail) * HZ) + 1, P = new Float64Array(N * 3);
    let k = 0;
    const endDir = V.norm(V.sub(pts[NB], pts[NB - 4]));
    let yMax = 0, tIn = null, tOut = null;
    for (let j = 0; j < N; j++) {
      const t = j / HZ;
      let q;
      if (t <= Tf) {
        const s = L * F(t) / F(Tf);
        while (k < NB - 1 && cum[k + 1] < s) k++;
        const f = clamp((s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), 0, 1);
        q = V.lerp(pts[k], pts[k + 1], f);
        q[2] += VK * t * Math.pow(1 - s / L, 2);
      } else q = V.mad(PI_, endDir, vEnd * (t - Tf));
      P[j * 3] = q[0]; P[j * 3 + 1] = q[1]; P[j * 3 + 2] = q[2];
      yMax = Math.max(yMax, q[1]);
      if (tIn === null && q[1] > OH.CB) tIn = I.tL + t;
      if (tIn !== null && tOut === null && q[1] < OH.CB) tOut = I.tL + t;
    }
    // tCloud: [in, out] of the cloud base (film time), for the glow inside the cloud (stage B)
    Object.assign(I, { P0, PI: PI_, P, N, L, vEnd, tEnd: I.tI + tail, yMax, tCloud: [tIn, tOut] });
    return I;
  });
  function intAt(I, T) {
    const x = (T - I.tL) * HZ;
    if (x < 0 || T > I.tEnd) return null;
    const j = Math.min(I.N - 2, Math.floor(x)), f = Math.min(1, x - j), P = I.P, a = j * 3;
    return [P[a] + (P[a + 3] - P[a]) * f, P[a + 1] + (P[a + 4] - P[a + 1]) * f, P[a + 2] + (P[a + 5] - P[a + 2]) * f];
  }
  OH.intAt = intAt;
  OH.intDir = (I, T) => { const a = intAt(I, Math.max(I.tL, T - .03)), b = intAt(I, Math.min(I.tEnd, T + .03)); return a && b ? V.norm(V.sub(b, a)) : [0, 1, 0]; };
  OH.intTrace = (I, T, step) => {
    const out = [], jN = Math.min(I.N - 1, Math.floor((Math.min(T, I.tEnd) - I.tL) * HZ));
    for (let j = 0; j <= jN; j += step || 3) out.push([I.P[j * 3], I.P[j * 3 + 1], I.P[j * 3 + 2]]);
    const h = intAt(I, Math.min(T, I.tEnd)); if (h) out.push(h);
    return out;
  };

  /* Mk 41 hatches: open ~1.4 s before the launch, close ~3 s after */
  OH.vlsOpen = function (S, T) {
    if (S.n !== 0) return null;
    const out = [];
    for (const I of INTS) { const f = ss(I.tL - 1.5, I.tL - .7, T) * (1 - ss(I.tL + 2.6, I.tL + 3.6, T)); if (f > .001) out.push([I.cell, f]); }
    return out.length ? out : null;
  };

  /* ---------------- Phalanx 1B mounts (0 forward, 1 aft) ----------------
     The forward mount slews onto R3 (leading it by the tracer's flight), fires, kills it, swings onto R4 and fires
     until it hits. The aft mount, masked forward by the superstructure, slews and tracks R4 without firing.
     b: burst length (s) before the kill / the hit; 0 = tracking only. */
  const CIWS_REST = [[0, .35], [PI, .35]];
  const CIWS_ENG = OH.CIWS_ENG = [
    { m: 0, r: 'R3', tS: 102.9, b: 2.3 },
    { m: 0, r: 'R4', tS: 108.2, b: 1.45, late: 1 },
    { m: 1, r: 'R4', tS: 104.6, b: 0, late: 1 },
  ];
  for (const e of CIWS_ENG) {
    e.round = RID[e.r];
    e.t1 = e.round.tEnd - (e.late ? .05 : 0);
    e.t0 = e.t1 - e.b;
  }
  const CIWS_P = OH.CIWS_P = [DA.ciws({}, 0), DA.ciws({}, 1)];
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
  OH.ciwsState = function (S, T) {
    const yaw = [CIWS_REST[0][0], CIWS_REST[1][0]], pit = [CIWS_REST[0][1], CIWS_REST[1][1]];
    if (S.n !== 0) return { yaw, pitch: pit };
    const Xs = OH.shipXf(S, T);
    for (let m = 0; m < 2; m++) {
      let y = CIWS_REST[m][0], p = CIWS_REST[m][1], last = null;
      for (const e of CIWS_ENG) {
        if (e.m !== m || T < e.tS) continue;
        const [ay, ap] = ciwsAim(e, T, Xs), w = ss(e.tS, e.tS + 1.1, T);
        y = y + angD(y, ay) * w; p = mix(p, ap, w); last = e;
      }
      if (last) { const w = ss(last.t1 + 2.5, last.t1 + 6, T); y = y + angD(y, CIWS_REST[m][0]) * w; p = mix(p, CIWS_REST[m][1], w); }
      yaw[m] = y; pit[m] = p;
    }
    return { yaw, pitch: pit };
  };
  // gatling spin: 4 500 rds/min over six barrels = 12.5 rev/s; spun up just before a burst, run down after
  const SPIN_HZ = 240, SPIN_N = Math.ceil(D * SPIN_HZ) + 2, SPIN = [new Float64Array(SPIN_N), new Float64Array(SPIN_N)];
  const spinRate = (m, T) => { let w = 0; for (const e of CIWS_ENG) if (e.m === m && e.b > 0) w = Math.max(w, ss(e.t0 - .45, e.t0 - .05, T) * (1 - ss(e.t1 + .1, e.t1 + 1.3, T))); return w * 12.5 * TAU; };
  for (let m = 0; m < 2; m++) for (let i = 1; i < SPIN_N; i++) SPIN[m][i] = SPIN[m][i - 1] + (spinRate(m, (i - 1) / SPIN_HZ) + spinRate(m, i / SPIN_HZ)) * .5 / SPIN_HZ;
  OH.ciwsSpin = (S, m, T) => { if (S.n !== 0) return 0; const x = clamp(T * SPIN_HZ, 0, SPIN_N - 1.001), i = Math.floor(x); return SPIN[m][i] + (SPIN[m][i + 1] - SPIN[m][i]) * (x - i); };
  OH.ciwsFiring = (m, T) => CIWS_ENG.some(e => e.m === m && e.b > 0 && T >= e.t0 && T <= e.t1);

  /* ---------------- the hit ---------------- */
  const HIT = OH.HIT = { t: RID.R4.tEnd, r: 'R4', at: HIT_P, fire: [4.2, 8.6, 51.5] };

  /* ---------------- events (time-sorted, for the log, sounds and stage B) ---------------- */
  const EV = OH.EVENTS = [];
  for (const I of INTS) {
    EV.push({ t: I.tL, kind: 'launch', I });
    EV.push({ t: I.tI, kind: I.miss ? 'miss' : 'intercept', I, r: I.round, p: I.PI });
  }
  for (const e of CIWS_ENG) {
    if (e.b > 0) EV.push({ t: e.t0, kind: 'ciws', e });
    if (e.b > 0 && !e.late) EV.push({ t: e.round.tEnd, kind: 'ciwsKill', e, r: e.round, p: roundAt(e.round, e.round.tEnd) });
  }
  EV.push({ t: HIT.t, kind: 'hit', p: roundAt(RID.R4, HIT.t) });
  EV.sort((a, b) => a.t - b.t);

  OH.threatBrgs = T => { const s = new Set(); for (const r of ROUNDS) if (T >= r.t0 - 2 && T < r.tEnd) s.add(r.brg); return [...s]; };

  Object.assign(OH, { SEA, LAM });
})();
