/* GUN CAMERA (Point Cloud, defence P3): the world, its clock and the choreography data.
   Frame: the destroyer's translating frame. Origin midships on the waterline, +Z the ship's head, +X starboard,
   +Y up; the ship steams at VS through it (the sea flows aft), rolls, pitches and heaves on the swell.
   Everything that moves is periodic in D (or dead by D), so render(D - e) meets render(0 + e).

   The forward Phalanx (ciwsF) is the hero: its FLIR is the gun camera. Five threats come in low from the horizon:
     TRK 01 single · TRK 02 + 03 pair · TRK 04 very low · TRK 05 weaving · TRK 06 on the far side (hits aft).
   PF.round(k, T) gives each round's position and heading; stage A fades rounds 1-5 at their stop point (tStop). */
(function () {
  const { V, R, X, E } = M3;
  const PF = window.PF = {};
  const DEG = Math.PI / 180, TAU = Math.PI * 2, D = 160;
  Object.assign(PF, { D, DEG, TAU, LIME: [198, 244, 50], WH: [238, 238, 228], CORAL: [255, 106, 61] });

  PF.hsh = function (a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  };
  PF.gH = (i, k) => Math.sqrt(-2 * Math.log(PF.hsh(i, k))) * Math.cos(TAU * PF.hsh(i, k + 1));
  const ss = E.ss, mix = E.mix, sat = E.sat;
  /* angular frequency with n whole cycles per film loop */
  const W = n => TAU * n / D;
  PF.W = W;

  /* ---------- the ship ---------- */
  PF.VS = 9;                                        // 17.5 kn; VS * D = 1440 m, a whole number of every sea period
  PF.RE = 6.371e6;
  /* roll (about +Z), pitch (about +X, bow up +), heave: a long swell on the port bow */
  PF.motion = T => ({
    roll: (1.05 * Math.sin(W(18) * T + .7) + .32 * Math.sin(W(29) * T + 2.1)) * DEG,
    pitch: (.3 * Math.sin(W(25) * T + 1.3) + .1 * Math.sin(W(41) * T + .2)) * DEG,
    heave: .28 * Math.sin(W(21) * T + .4),
  });
  PF.shipX = T => {
    const m = PF.motion(T);
    return X.make(R.mul(R.z(-m.roll), R.x(-m.pitch)), [0, m.heave, 0]);
  };

  /* ---------- the Phalanx mounts (HD.destroyer ciwsF / ciwsA) ---------- */
  const A = HD.destroyer.A;
  const CIWS_TR = [0, 1.55, 0], CIWS_MZ = [0, 1.36, 2.12];
  /* mount bases from the model's own muzzle anchor at train 0, elevation 0 */
  const P0 = [0, 1].map(i => V.sub(A.ciws({ ciwsYaw: [0, 0], ciwsPitch: [0, 0] }, i), CIWS_MZ));
  const FLIR_AP = [-.84, 2.24, .46];               // the thermal imager's window on the elevating mass (eye just in front of it)
  Object.assign(PF, { CIWS_P: P0, CIWS_TR, CIWS_MZ, FLIR_AP });
  const pivX = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  /* ship-frame transforms of mount i: train frame, elevating frame */
  PF.trainX = (i, yaw) => X.make(R.y(yaw), P0[i]);
  PF.elevX = (i, yaw, pitch) => X.mul(PF.trainX(i, yaw), pivX(R.x(-pitch), CIWS_TR));
  PF.pivotShip = i => V.add(P0[i], CIWS_TR);

  /* ---------- rounds ----------
     Each comes in along a straight ground track from `brg` (deg off the bow, + starboard) toward `aim`, at VM,
     at `alt` over the sea; lat0 offsets it sideways, weave {A, P} gives S-turns (skid, nose on the velocity). */
  const VM = 680;                                   // Mach 2 at sea level
  PF.VM = VM;
  const MOUNT_W = V.add(PF.pivotShip(0), [0, 0, 0]);
  const HIT_L = [-8.66, 9.4, -41.2];                // TRK 06: port side of the hangar, below the aft mount
  const T_HIT = 140.0;
  Object.assign(PF, { HIT_L, T_HIT });
  const ROUNDS = [
    { id: 'TRK 01', brg: 13, alt: 11, aim: [2, 9, 22], tStop: 22.6, rStop: 780 },
    { id: 'TRK 02', brg: 43, alt: 12, aim: [6, 9, 16], tStop: 53.6, rStop: 900 },
    { id: 'TRK 03', brg: 43, alt: 8.5, aim: [6, 9, 16], lat0: -52, tStop: 55.2, rStop: 560 },
    { id: 'TRK 04', brg: -34, alt: 3.1, aim: [-4, 6, 24], tStop: 88.2, rStop: 430, low: true },
    { id: 'TRK 05', brg: 9, alt: 13, aim: [1, 9, 20], tStop: 121.8, rStop: 640, weave: { A: 46, P: 3.6 } },
    { id: 'TRK 06', brg: -146, alt: 7.5, aim: null, tStop: T_HIT, hit: true },
  ];
  PF.ROUNDS = ROUNDS;
  const S_MAX = 26000;
  function setup(r) {
    const b = r.brg * DEG, src = [Math.sin(b), 0, Math.cos(b)];
    r.u = [-src[0], 0, -src[2]];                    // horizontal heading of the approach
    r.n = [r.u[2], 0, -r.u[0]];                     // its left-hand normal
    r.aimW = r.hit ? X.ap(PF.shipX(T_HIT), HIT_L) : r.aim;
  }
  /* position at distance-to-go s along the approach axis */
  function posAt(r, s, out) {
    const w = r.weave, lat = (r.lat0 || 0) * ss(0, 2500, s) + (w ? w.A * Math.sin(TAU * s / (VM * w.P)) * ss(1200, 2600, s) * (1 - ss(7000, 9500, s)) : 0)
      + 3.2 * M3.noise(s / 900, r.brg, 1.3) * ss(300, 1500, s);
    let y = r.alt + .6 * M3.noise(s / 700, 4.1, r.brg);
    if (r.hit) y = mix(r.aimW[1], y, ss(0, 900, s));
    if (r.low) y = r.alt + .35 * M3.noise(s / 300, 2.2, 7);
    out[0] = r.aimW[0] - r.u[0] * s + r.n[0] * lat; out[1] = y; out[2] = r.aimW[2] - r.u[2] * s + r.n[2] * lat;
    return out;
  }
  const TMP = [0, 0, 0];
  for (const r of ROUNDS) {
    setup(r);
    if (r.hit) { r.tImp = T_HIT; r.sStop = 0; }
    else {
      // distance to go at which the round is rStop from the mount
      let lo = 0, hi = 20000;
      for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (V.dist(posAt(r, m, TMP), MOUNT_W) < r.rStop) lo = m; else hi = m; }
      r.sStop = (lo + hi) / 2; r.tImp = r.tStop + r.sStop / VM;
    }
    r.t0 = r.tImp - S_MAX / VM;
    r.pStop = posAt(r, r.sStop, [0, 0, 0]);
  }
  /* PF.round(k, T, out?) -> {p, dir, s, range, alive, a}: a = stage-A visibility (haze, fade at the stop) */
  PF.round = function (k, T, out) {
    const r = ROUNDS[k]; out = out || { p: [0, 0, 0], dir: [0, 0, 1] };
    const s = VM * (r.tImp - T);
    posAt(r, s, out.p);
    posAt(r, s + 6, TMP);
    const dx = out.p[0] - TMP[0], dy = out.p[1] - TMP[1], dz = out.p[2] - TMP[2], L = Math.hypot(dx, dy, dz);
    out.dir = [dx / L, dy / L, dz / L];
    out.s = s;
    out.range = V.dist(out.p, MOUNT_W);
    out.alive = T >= r.t0 && T < r.tStop;
    // haze: specks condense out of the murk past ~12 km
    out.a = out.alive ? (1 - ss(10500, 14500, out.range)) : 0;
    return out;
  };

  /* ---------- fire windows (the gun's bursts; stage B draws them) ---------- */
  PF.FIRE = [
    { mount: 0, k: 0, t0: 21.0, t1: 22.6 },
    { mount: 0, k: 1, t0: 52.1, t1: 53.6 },
    { mount: 0, k: 2, t0: 54.05, t1: 55.2 },
    { mount: 0, k: 3, t0: 86.3, t1: 88.2 },
    { mount: 0, k: 4, t0: 119.4, t1: 121.8 },
    { mount: 1, k: 5, t0: 137.7, t1: 139.85 },
  ];
  PF.firing = (T, mount) => { for (const f of PF.FIRE) if (f.mount === mount && T >= f.t0 && T < f.t1) return f; return null; };

  /* barrel cluster: 750 rpm (4 500 rounds/min) while firing, spun up ~0.35 s before, coasting down after */
  const OMEGA = 750 / 60 * TAU;
  function omegaAt(T, mount) {
    let w = 0;
    for (const f of PF.FIRE) {
      if (f.mount !== mount) continue;
      const up = ss(f.t0 - .45, f.t0 - .05, T), down = T > f.t1 ? Math.max(0, (Math.exp(-(T - f.t1) / 5.5) - .03) / .97) : 1;
      w = Math.max(w, OMEGA * up * down);
    }
    return w;
  }
  const NSP = Math.round(D * 240);
  const SPIN = [0, 1].map(m => {
    const a = new Float64Array(NSP + 1);
    for (let i = 1; i <= NSP; i++) { const t0 = (i - 1) / NSP * D, t1 = i / NSP * D; a[i] = a[i - 1] + (omegaAt(t0, m) + omegaAt(t1, m)) * .5 * (t1 - t0); }
    // trim the whole to a multiple of 60° (six barrels) so the loop closes on the same picture
    const tot = a[NSP], P6 = TAU / 6, trim = tot - Math.floor(tot / P6) * P6;
    for (let i = 0; i <= NSP; i++) a[i] -= trim * i / NSP;
    return a;
  });
  PF.spin = (T, mount) => { const x = ((T % D) + D) % D / D * NSP, i = Math.min(NSP - 1, Math.floor(x)), A_ = SPIN[mount]; return A_[i] + (A_[i + 1] - A_[i]) * (x - i); };
  PF.omega = omegaAt;
  PF.OMEGA = OMEGA;

  /* ---------- where the forward gun looks ----------
     A list of states, each blended in from the previous one over `b` seconds:
       search {yc}: world-stabilised slow pan about bearing yc (deg), a hair under the horizon
       track {k}:   the round, seen with the servo's lag
       hold {k}:    frozen on the round's stop point
       park {yaw, pit}: a train/elevation in the ship's frame (deg) */
  const LAG = .11;
  const AIMS = [
    { t: 0, kind: 'search', yc: 6 },
    { t: 7.4, b: 1.1, kind: 'track', k: 0 },
    { t: 22.6, b: 0, kind: 'hold', k: 0 },
    { t: 25.6, b: 3.4, kind: 'park', yaw: 37, pit: .6 },
    { t: 39.4, b: 1.6, kind: 'search', yc: 40 },
    { t: 42.4, b: 1.0, kind: 'track', k: 1 },
    { t: 53.6, b: .42, kind: 'track', k: 2 },
    { t: 55.2, b: 0, kind: 'hold', k: 2 },
    { t: 57.8, b: 3.6, kind: 'park', yaw: -28, pit: .5 },
    { t: 72.6, b: 1.6, kind: 'search', yc: -31 },
    { t: 79.4, b: .8, kind: 'track', k: 3 },
    { t: 88.2, b: 0, kind: 'hold', k: 3 },
    { t: 90.6, b: 3.4, kind: 'park', yaw: 6, pit: .8 },
    { t: 104.6, b: 1.6, kind: 'search', yc: 8 },
    { t: 107.6, b: 1.1, kind: 'track', k: 4 },
    { t: 121.8, b: 0, kind: 'hold', k: 4 },
    { t: 127.8, b: 2.6, kind: 'park', yaw: -100, pit: 1.5 },     // the far side: it trains to the end of its arc and can only wait
    { t: 143.4, b: 4.2, kind: 'park', yaw: 2, pit: .4 },
    { t: 155.4, b: 1.6, kind: 'search', yc: 6 },
  ];
  PF.AIMS = AIMS;
  const RO = { p: [0, 0, 0], dir: [0, 0, 1] };
  const searchYaw = (T, yc) => (yc + 3.4 * Math.sin(W(8) * T + .9)) * DEG;
  const dirYP = (yaw, pit) => [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)];
  /* world direction of state s at time T (the pivot's world position is p) */
  function stateDir(s, T, p) {
    if (s.kind === 'search') return dirYP(searchYaw(T, s.yc), -.2 * DEG);
    if (s.kind === 'park') return X.dir(PF.shipX(T), dirYP(s.yaw * DEG, s.pit * DEG));
    const t = s.kind === 'hold' ? ROUNDS[s.k].tStop - 1e-3 : T - LAG;
    PF.round(s.k, t, RO);
    const d = V.norm(V.sub(RO.p, p));
    // servo hunting: a few hundredths of a milliradian
    if (s.kind === 'track') { const n = 5e-5; d[0] += n * M3.noise(T * 3.1, 1.7, s.k); d[1] += n * .6 * M3.noise(T * 2.7, 5.3, s.k); }
    return d;
  }
  function slerpDir(a, b, u) {
    const c = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(c);
    if (th < 1e-6) return b.slice();
    const s = Math.sin(th), ka = Math.sin((1 - u) * th) / s, kb = Math.sin(u * th) / s;
    return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
  }
  function stateIndex(T) { let i = 0; while (i < AIMS.length - 1 && AIMS[i + 1].t <= T) i++; return i; }
  /* forward gun's world boresight at T, and which state drives it */
  PF.aim = function (T) {
    T = ((T % D) + D) % D;
    // aim from the FLIR window (its offset trained with the first estimate), so a tracked round sits on the reticle
    const Xs = PF.shipX(T), piv = X.ap(Xs, PF.pivotShip(0)), d0 = aimFrom(T, piv).dir, ds = X.dir({ R: [Xs.R[0], Xs.R[3], Xs.R[6], Xs.R[1], Xs.R[4], Xs.R[7], Xs.R[2], Xs.R[5], Xs.R[8]], T: [0, 0, 0] }, d0);
    const yaw0 = Math.atan2(ds[0], ds[2]), p = X.ap(Xs, X.ap(PF.trainX(0, yaw0), [FLIR_AP[0], CIWS_TR[1] + .69, FLIR_AP[2]]));
    return aimFrom(T, p);
  };
  function aimFrom(T, p) {
    const i = stateIndex(T), s = AIMS[i];
    let d = stateDir(s, T, p);
    if (s.b && T < s.t + s.b) {
      // blend from what the previous states were doing (recursively, so fast re-cues stay smooth)
      const prev = aimBefore(i, T, p);
      d = slerpDir(prev, d, E.inOut(sat((T - s.t) / s.b)));
    }
    return { dir: V.norm(d), state: s, i };
  };
  function aimBefore(i, T, p) {
    if (i === 0) return stateDir(AIMS[AIMS.length - 1], T, p);
    const s = AIMS[i - 1]; let d = stateDir(s, T, p);
    if (s.b && T < s.t + s.b) d = slerpDir(aimBefore(i - 1, T, p), d, E.inOut(sat((T - s.t) / s.b)));
    return d;
  }
  /* the forward mount's train / elevation (ship frame, rad) */
  PF.mountF = function (T) {
    const a = PF.aim(T), Rs = PF.shipX(T).R;
    const d = [Rs[0] * a.dir[0] + Rs[3] * a.dir[1] + Rs[6] * a.dir[2], Rs[1] * a.dir[0] + Rs[4] * a.dir[1] + Rs[7] * a.dir[2], Rs[2] * a.dir[0] + Rs[5] * a.dir[1] + Rs[8] * a.dir[2]];
    return { yaw: Math.atan2(d[0], d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])), spin: PF.spin(T, 0), omega: omegaAt(T, 0), aim: a };
  };
  /* the aft mount: parked astern; slews onto TRK 06 as it comes round the quarter */
  const A_PARK = [Math.PI, .12];
  PF.mountA = function (T) {
    T = ((T % D) + D) % D;
    const Xs = PF.shipX(T), p = X.ap(Xs, PF.pivotShip(1));
    let yaw = A_PARK[0], pit = A_PARK[1];
    const w = ss(133.4, 135.6, T) * (1 - ss(143.5, 148.5, T));
    if (w > 0) {
      PF.round(5, Math.min(T, T_HIT - .02) - LAG, RO);
      const d = V.norm(V.sub(RO.p, p)), Rs = Xs.R;
      const ds = [Rs[0] * d[0] + Rs[3] * d[1] + Rs[6] * d[2], Rs[1] * d[0] + Rs[4] * d[1] + Rs[7] * d[2], Rs[2] * d[0] + Rs[5] * d[1] + Rs[8] * d[2]];
      let ty = Math.atan2(ds[0], ds[2]); if (ty < 0) ty += TAU;         // train through the stern, not the bow
      yaw = mix(A_PARK[0], ty, w); pit = mix(A_PARK[1], Math.atan2(ds[1], Math.hypot(ds[0], ds[2])), w);
    }
    return { yaw, pitch: pit, spin: PF.spin(T, 1), omega: omegaAt(T, 1) };
  };
  /* HD.destroyer state for the frame */
  PF.shipState = function (T) {
    const f = PF.mountF(T), a = PF.mountA(T);
    return { sps: W(40) * T, ciwsYaw: [f.yaw, a.yaw], ciwsPitch: [f.pitch, a.pitch], ciwsSpin: f.spin, ciwsSpinA: a.spin, gunYaw: 0, gunPitch: 0 };
  };
  /* world muzzle and bore direction of mount i at T */
  PF.muzzle = function (T, i) {
    const m = i ? PF.mountA(T) : PF.mountF(T), Xe = X.mul(PF.shipX(T), PF.elevX(i || 0, m.yaw, m.pitch));
    return { p: X.ap(Xe, CIWS_MZ), dir: X.dir(Xe, [0, 0, 1]), X: Xe, m };
  };
  /* the gun camera's eye (the FLIR window) and its frame, world */
  PF.flir = function (T) {
    const m = PF.mountF(T), Xe = X.mul(PF.shipX(T), PF.elevX(0, m.yaw, m.pitch));
    return { eye: X.ap(Xe, FLIR_AP), f: X.dir(Xe, [0, 0, 1]), up: X.dir(Xe, [0, 1, 0]), m, X: Xe };
  };
})();
