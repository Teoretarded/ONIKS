/* THERMAL (Point Cloud, defence P4): the world. The film is one take through a Mk 20 EOSS thermal imager on the
   pilothouse top of a sister destroyer keeping station 4 km off the hero's port quarter. The hero frame is the
   world frame: the DDG-51 sits at the origin, bow +Z (north), starboard +X (east), steaming at VS through a sea
   that flows aft. Four P-800 come in low at Mach 2 from bearing 074: the imager sits 15° off the raid's
   reciprocal, so from the horizon in the raid stays within ~13° of the hero and the whole defence reads in one
   frame, past the ship. Three SM-6 fly from the Mk 41 cells (paths integrated once here); the aft Phalanx slews
   for the last two rounds; round 44 weaves past its interceptor and hits the starboard quarter (the far side;
   the fireball shows over the flight deck) at T_HIT. Everything is a pure function of film time T, and
   everything alive at the loop seam (the sea, the swell, the exhaust, the station-keeping, the radar) is periodic
   in D. The seam itself is an empty horizon: the hero is out of frame there. */
(function () {
  const { V, R, X, E } = M3;
  const PG = window.PG = {};
  const DEG = Math.PI / 180, TAU = Math.PI * 2, D = 160;
  Object.assign(PG, { D, DEG, TAU, LIME: [198, 244, 50], WH: [238, 238, 228], CORAL: [255, 106, 61] });

  PG.hsh = function (a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  };
  const hsh = PG.hsh;
  PG.gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));
  PG.win = (T, a, b, c, d) => E.ss(a, b, T) * (1 - E.ss(c, d, T));
  PG.lerpK = (T, ks) => { if (T <= ks[0][0]) return ks[0][1]; for (let i = 0; i < ks.length - 1; i++) if (T < ks[i + 1][0]) { const u = E.ss(ks[i][0], ks[i + 1][0], T); return ks[i][1] + (ks[i + 1][1] - ks[i][1]) * u; } return ks[ks.length - 1][1]; };
  const pol = (bDeg, r, y) => [Math.sin(bDeg * DEG) * r, y || 0, Math.cos(bDeg * DEG) * r];
  PG.pol = pol;

  /* the earth, with the usual 4/3 refraction: the horizon, its dip and the drop of far things */
  PG.RE = 8.5e6;
  PG.drop = r => r * r / (2 * PG.RE);

  /* ---------- the hero and the sensor ---------- */
  PG.VS = 8.25;                                      // m/s (16 kn); VS * D = 1 320 m, the sea lattice's period
  const A = HD.destroyer.A;
  PG.A = A;
  /* the imager: 24 m up on the sister ship, station-keeping on the hero's port quarter with a slow wander (whole
     cycles per film) and the residual heave the stabilised gimbal cannot take out */
  PG.SENS = { brg: 239, r: 4000, h: 24 };
  PG.eye = function (T, out) {
    out = out || [0, 0, 0];
    const w = TAU * T / D, b = (PG.SENS.brg + 1.1 * Math.sin(w + .7)) * DEG, r = PG.SENS.r + 55 * Math.sin(2 * w + 1.3);
    out[0] = Math.sin(b) * r;
    out[1] = PG.SENS.h + .22 * Math.sin(TAU * 22 * T / D) + .08 * Math.sin(TAU * 35 * T / D + 1);
    out[2] = Math.cos(b) * r;
    return out;
  };
  PG.horizon = () => Math.sqrt(2 * PG.RE * PG.SENS.h);

  /* the hero's state: the SPS-67 turning (whole turns per film), the aft Phalanx on its schedule. Stage B adds
     the VLS hatches, the barrels' spin, the gun (PG.shipStateFx). */
  PG.shipState = function (T) {
    const c = PG.ciwsAim(T);
    return { sps: T * TAU * 38 / D, ciwsYaw: [0, c.yaw], ciwsPitch: [.35, c.pitch], ciwsSpin: 0, gunYaw: 0, gunPitch: 0, vlsOpen: [] };
  };

  /* ---------- the raid: four P-800 at Mach 2 from bearing 074, low over the sea, converging on the hit ---------- */
  PG.VR = 700;
  PG.RAID_BRG = 74;
  PG.T_HIT = 103.4;
  PG.HIT_L = [9.45, 4.4, -57];                       // starboard quarter, abreast the hangar's after end (ship coords)
  const HIT = PG.HIT_L;
  const psi = (PG.RAID_BRG + 180) * DEG;             // the rounds' heading
  const U = [Math.sin(psi), 0, Math.cos(psi)], RG = [Math.cos(psi), 0, -Math.sin(psi)];
  PG.U = U; PG.RG = RG;
  /* dt: would-be arrival relative to round 44 (s); lat: place in the loose line (m, + right of the flight);
     alt: cruise height (m) */
  PG.RND = [
    { id: 41, dt: -.9, lat: -125, alt: 12.5 },
    { id: 42, dt: -.45, lat: 95, alt: 14 },
    { id: 43, dt: -1.4, lat: -45, alt: 11 },
    { id: 44, dt: 0, lat: 55, alt: 13, weave: true },
  ];
  /* round 44's weave: +-110 m, a 2.9 km wavelength, from 13.5 km in, straightening over the last 3 km */
  const W_D0 = 13500, W_LAM = 2900, W_AMP = 110;
  PG.weave = (k, d) => PG.RND[k].weave ? W_AMP * E.ss(W_D0, W_D0 - 1500, d) * E.ss(1800, 3400, d) * Math.sin(TAU * (W_D0 - d) / W_LAM) : 0;
  /* position of round k at film time T (no stop applied); returns the distance to go */
  function relPos(k, T, out, noWeave) {
    const r = PG.RND[k], d = PG.VR * (PG.T_HIT + r.dt - T);
    const lat = r.lat * E.ss(900, 9000, d) + (noWeave ? 0 : PG.weave(k, d)) + 5 * Math.sin(d / 610 + k * 2.3) * E.ss(600, 2500, d);
    const cruise = 5 + (r.alt - 5) * E.ss(1500, 9000, d) + .6 * Math.sin(d / 830 + k);
    out[0] = HIT[0] - U[0] * d + RG[0] * lat;
    out[1] = E.mix(HIT[1], cruise, E.ss(0, 220, d));
    out[2] = HIT[2] - U[2] * d + RG[2] * lat;
    return d;
  }
  PG.relPos = relPos;
  /* when each round stops, and by what: SM-6 far out for 41 and 42, the Phalanx ~480 m out for 43, the hull for 44 */
  PG.tStop = [80.0, 83.2, PG.T_HIT - 1.4 - 480 / PG.VR, PG.T_HIT];
  PG.stopBy = ['I1', 'I2', 'CIWS', 'HIT'];
  PG.tFirst = k => PG.T_HIT + PG.RND[k].dt - 60000 / PG.VR;          // 60 km out: far under the horizon
  const RA = [0, 0, 0], RB = [0, 0, 0];
  /* round k at film time T: position, unit direction, distance to go, alive */
  PG.round = function (k, T, o) {
    o = o || {};
    const tS = PG.tStop[k], tt = Math.min(T, tS);
    const d = relPos(k, tt, RA); relPos(k, tt - .01, RB);
    o.p = [RA[0], RA[1], RA[2]];
    o.dir = V.norm(V.sub(RA, RB));
    o.d = d; o.stopped = T >= tS; o.alive = T >= PG.tFirst(k) && T < tS;
    return o;
  };

  /* ---------- interceptors: three SM-6 from the Mk 41 cells ---------- */
  PG.SHOTS = [
    { id: 'I1', cell: 6, tL: 66.0, rnd: 0, tI: 80.0 },
    { id: 'I2', cell: 44, tL: 67.6, rnd: 1, tI: 83.2 },
    { id: 'I3', cell: 13, tL: 75.6, rnd: 3, tI: 89.3, miss: true },   // round 44 is at the top of its weave
  ];
  /* Shaped by eye, for the imager that watches them: straight up out of the cell for the first second of the boost,
     then a bend that eases in and runs into one long gentle arc over and down onto the meeting point. The arc is
     drawn in the imager's own angles (the eye barely moves, so it reads the same through every slew and zoom):
     elevation over azimuth progress t, eps(t) = e1 + (eEnd - e1) t^1.3 + B t^.38 (1 - t)^1.5, B set by the apex
     elevation EMAX; then carried back into the world along the vertical plane through the cell and the meeting point.
     t^.38 leaves the vertical with no kink and the curvature building from zero; (1 - t)^1.5 lays the long tail down
     flat onto the meeting point. Seen from the side it is a steep
     climb to a few hundred metres and a long shallow descent. Arc-length tabled, flown with a boost (a linear ramp to
     full speed over TB s: ~100-150 m in the first second) and coast speed law scaled to the flight time. */
  const NP = 600, TB = 5.5;
  const v0 = t => t < TB ? t / TB : 1 - .02 * (t - TB);
  const EY = [0, 0, 0];
  const angAt = (x, y, z, o) => { const dx = x - EY[0], dz = z - EY[2], r = Math.hypot(dx, dz); o[0] = Math.atan2(dx, dz); o[1] = Math.atan2(y - EY[1] - r * r / (2 * PG.RE), r); o[2] = r; return o; };
  const AG = [0, 0, 0];
  for (const s of PG.SHOTS) {
    const P0 = A.vls(s.cell); P0[1] += .6;
    const P3 = [0, 0, 0];
    if (s.miss) { relPos(s.rnd, s.tI, P3, true); P3[1] += 50; }       // where 44 would be without its weave, 50 m up
    else relPos(s.rnd, s.tI, P3);
    const hz = Math.hypot(P3[0] - P0[0], P3[2] - P0[2]), dir = [(P3[0] - P0[0]) / hz, 0, (P3[2] - P0[2]) / hz];
    const dur = s.tI - s.tL;
    const NT = 600, ST = new Float64Array(NT + 1);
    for (let i = 1; i <= NT; i++) { const t0 = (i - 1) / NT * dur, t1 = i / NT * dur; ST[i] = ST[i - 1] + (v0(t0) + v0(t1)) * .5 * (t1 - t0); }
    const f1 = ST[Math.round(NT / dur)] / ST[NT];                      // share of the path flown in the first second
    PG.eye(s.tL + 4, EY);
    const a0 = angAt(P0[0], 0, P0[2], AG)[0], aE = angAt(P3[0], P3[1], P3[2], AG)[0], eE = AG[1];
    const EMAX = (s.id === 'I1' ? 6.5 : s.id === 'I2' ? 5.6 : 4.2) * DEG;
    const pts = new Float64Array((NP + 1) * 3), S = new Float64Array(NP + 1);
    let s0 = 120;
    for (let it = 0; it < 4; it++) {
      const e1 = angAt(P0[0], P0[1] + s0, P0[2], AG)[1];
      const eps = (t, B) => e1 + (eE - e1) * Math.pow(t, 1.3) + B * Math.pow(t, .38) * Math.pow(1 - t, 1.5);
      let lo = 0, hi = 1, B = 0;
      for (let b = 0; b < 40; b++) { B = (lo + hi) / 2; let mx = -1; for (let i = 0; i <= 200; i++) mx = Math.max(mx, eps(i / 200, B)); if (mx > EMAX) hi = B; else lo = B; }
      pts[0] = P0[0]; pts[1] = P0[1]; pts[2] = P0[2];
      pts[3] = P0[0]; pts[4] = P0[1] + s0; pts[5] = P0[2];
      for (let i = 2; i <= NP; i++) {
        const h = hz * Math.pow((i - 1) / (NP - 1), 1.8), x = P0[0] + dir[0] * h, z = P0[2] + dir[2] * h;
        angAt(x, 0, z, AG);
        const t = E.sat((AG[0] - a0) / (aE - a0)), r = AG[2];
        pts[i * 3] = x; pts[i * 3 + 1] = EY[1] + r * r / (2 * PG.RE) + Math.tan(eps(t, B)) * r; pts[i * 3 + 2] = z;
      }
      for (let i = 1; i <= NP; i++) S[i] = S[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
      s0 = f1 * S[NP];
    }
    pts[NP * 3] = P3[0]; pts[NP * 3 + 1] = P3[1]; pts[NP * 3 + 2] = P3[2];
    for (let i = 1; i <= NP; i++) S[i] = S[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
    const L = S[NP];
    const k = L / ST[NT];
    Object.assign(s, { P0, P3, L, dur, pts, S, ST, NT, vmax: k, dir });
    const tx = pts[NP * 3] - pts[NP * 3 - 3], ty = pts[NP * 3 + 1] - pts[NP * 3 - 2], tz = pts[NP * 3 + 2] - pts[NP * 3 - 1], tl = Math.hypot(tx, ty, tz);
    s.tan = [tx / tl, ty / tl, tz / tl];
    s.vEnd = k * v0(dur);
    s.tEnd = s.miss ? s.tI + 1.6 : s.tI;              // a miss flies on 1.6 s past the round, then ends (stage B)
    if (s.miss) {
      // past the round it eases out of the glide at ~8 g into a shallow climb: a table every 8 m
      const hl = Math.hypot(s.tan[0], s.tan[2]), hx = s.tan[0] / hl, hzz = s.tan[2] / hl;
      const g0 = Math.atan2(s.tan[1], hl), g1 = 1.2 * DEG, Rt = s.vEnd * s.vEnd / 80, Lp = Math.max(1, (g1 - g0) * Rt);
      const n = Math.ceil(((s.tEnd - s.tI) * s.vEnd + 400) / 8), post = new Float64Array((n + 1) * 3);
      let x = P3[0], y = P3[1], z = P3[2];
      post[0] = x; post[1] = y; post[2] = z;
      for (let i = 1; i <= n; i++) {
        const w = Math.min(1, (i - .5) * 8 / Lp), g = g0 + (g1 - g0) * w * w * (3 - 2 * w);
        x += hx * Math.cos(g) * 8; y += Math.sin(g) * 8; z += hzz * Math.cos(g) * 8;
        post[i * 3] = x; post[i * 3 + 1] = y; post[i * 3 + 2] = z;
      }
      s.post = post; s.postN = n;
    }
  }
  function shotS(s, T) {
    const t = E.clamp(T - s.tL, 0, s.dur), x = t / s.dur * s.NT, i = Math.min(s.NT - 1, Math.floor(x));
    return (s.ST[i] + (s.ST[i + 1] - s.ST[i]) * (x - i)) * s.vmax;
  }
  function pathAt(s, sl, out) {
    const S = s.S; let lo = 0, hi = NP;
    if (sl >= S[NP]) {
      const x = sl - S[NP];
      if (s.post) {
        const f = Math.min(s.postN - 1e-6, x / 8), i = Math.floor(f), u = f - i, P = s.post;
        for (let j = 0; j < 3; j++) out[j] = P[i * 3 + j] + (P[i * 3 + 3 + j] - P[i * 3 + j]) * u;
        return out;
      }
      out[0] = s.pts[NP * 3] + s.tan[0] * x; out[1] = s.pts[NP * 3 + 1] + s.tan[1] * x; out[2] = s.pts[NP * 3 + 2] + s.tan[2] * x; return out;
    }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= sl) lo = m; else hi = m; }
    const u = (sl - S[lo]) / (S[hi] - S[lo] || 1);
    for (let j = 0; j < 3; j++) out[j] = s.pts[lo * 3 + j] + (s.pts[hi * 3 + j] - s.pts[lo * 3 + j]) * u;
    return out;
  }
  /* arc length flown by shot s at T, its position (null outside [tL, tEnd]), its speed */
  PG.shotSl = (s, T) => T > s.tI ? s.L + (T - s.tI) * s.vEnd : shotS(s, T);
  PG.shotPath = pathAt;
  PG.shotAt = function (s, T, out) {
    out = out || [0, 0, 0];
    if (T < s.tL || T > s.tEnd) return null;
    return pathAt(s, PG.shotSl(s, T), out);
  };
  PG.shotSpeed = (s, T) => { const d = .05; return (PG.shotSl(s, T + d) - PG.shotSl(s, T - d)) / (2 * d); };

  /* ---------- the aft Phalanx (index 1, on the hangar roof): the only mount the imager sees from the quarter.
     Stowed facing aft; at 92.4 it trains onto round 43 and tracks it until the kill, swings onto 44, holds its
     last aim after the hit and goes back to stow while the imager searches the horizon. ---------- */
  const TRN = [0, 13.9 + 1.55, -47.5];               // its trunnion (ship coords)
  PG.CIWS = { i: 1, trunnion: TRN, stow: [Math.PI, .35], t0: 93.9, t1: 95.5, tOpen: 99.1, tSwap0: 101.42, tSwap1: 101.78, tBack0: 127.5, tBack1: 131.5 };
  const aimTo = (p, o) => { const dx = p[0] - TRN[0], dy = p[1] - TRN[1], dz = p[2] - TRN[2]; o[0] = Math.atan2(dx, dz); o[1] = Math.atan2(dy, Math.hypot(dx, dz)); return o; };
  const near = (a, ref) => a + TAU * Math.round((ref - a) / TAU);
  const AM = [0, 0], AN = [0, 0], RO = {};
  PG.ciwsAim = function (T) {
    const C = PG.CIWS, s = C.stow;
    if (T < C.t0 || T > C.tBack1) return { yaw: s[0], pitch: s[1] };
    aimTo(PG.round(2, Math.min(T, PG.tStop[2] - .02), RO).p, AM);
    aimTo(PG.round(3, Math.min(T, PG.T_HIT - .3), RO).p, AN);
    const u = E.ss(C.tSwap0, C.tSwap1, T);
    let yaw = near(AM[0], s[0]), y4 = near(AN[0], yaw);
    yaw += (y4 - yaw) * u; let pitch = AM[1] + (AN[1] - AM[1]) * u;
    const inn = E.ss(C.t0, C.t1, T), back = E.ss(C.tBack0, C.tBack1, T);
    const k = inn * (1 - back);
    return { yaw: s[0] + (yaw - s[0]) * k, pitch: s[1] + (pitch - s[1]) * k };
  };

  /* ---------- the imager's polarity: white-hot, black-hot from 45.0 (on the whole ship, before the lens goes to
     the horizon), white-hot again from 90.5 (the close-in). Each switch is a 0.34 s top-down wipe. ---------- */
  PG.POL = [{ t: 45.0, to: 1 }, { t: 90.5, to: 0 }];
  PG.WIPE = .34;
  PG.polAt = function (T) {
    let cur = 0, from = 0, wipe = -1;
    for (const s of PG.POL) {
      if (T >= s.t + PG.WIPE) cur = s.to;
      else if (T >= s.t) { from = cur; cur = s.to; wipe = (T - s.t) / PG.WIPE; }
    }
    return { pol: cur, from: wipe >= 0 ? from : cur, wipe };
  };

  /* ---------- events, for stage B and the sound ---------- */
  PG.EV = {
    launches: PG.SHOTS.map(s => ({ t: s.tL, shot: s, cell: s.cell, p: A.vls(s.cell) })),
    intercepts: PG.SHOTS.map(s => ({ t: s.tI, shot: s, round: s.rnd, miss: !!s.miss, p: s.P3.slice() })),
    stops: PG.tStop.map((t, k) => ({ t, round: k, by: PG.stopBy[k], p: PG.round(k, t).p })),
    detect: 50.6,                                    // the first round shows over the imager's horizon
    ciwsOpen: PG.CIWS.tOpen, ciwsKill: PG.tStop[2], hit: PG.T_HIT, hitP: HIT.slice(),
  };
  PG.alive = T => { let n = 0; for (let k = 0; k < 4; k++) if (T >= PG.tFirst(k) && T < PG.tStop[k]) n++; return n; };
})();
