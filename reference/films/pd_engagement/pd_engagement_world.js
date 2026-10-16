/* ENGAGEMENT (Point Cloud D): the world, its clocks, the strike group and the raid.
   Metres; X east, Y up, Z north. The Monolith-B stands on the coast at the origin and its scope
   (pd_engagement_scope.js) covers the sea out to 64 km. The strike group steams NNE ~38 km out;
   four Oniks come in from the east, low over the sea, at Mach 2.

   Clocks (film time T in [0, D)):
     S(T)    sim time: real time, slow motion around the hit (FILM.warp); continuous over the film.
     tau(T)  the picture's clock: S(T) before TJ, S(T) - S(D) after it. tau(D-) = tau(0) = 0, so the
             scope at the end of the film is the scope at the start, and the next raid (tau < 0) comes
             in over the scope's edge exactly as it does at frame 0.
   TJ lies in the dot world, while everything on screen is drawn in TRK 21's translating frame
   (PD.ship(0, tau) + an offset; the rounds, the camera and the sea already are), so the jump of the
   world by S(D) * 7.7 m is invisible.
   RULE for the effect stages: anything alive across T = TJ must be placed as PD.ship(0, PD.tau(T)) +
   a ship-relative offset (fires, smoke, debris of the hit), and periodic motion (flicker, spin, waves)
   is driven by S(T). Before TJ world positions are fine (the interceptor bursts, round 3's debris). */
(function () {
  const { V, R, X, E, fbm } = M3;
  const PD = window.PD = {};
  const DEG = Math.PI / 180, TAU = Math.PI * 2, D = 152;
  Object.assign(PD, { D, DEG, TAU, LIME: [198, 244, 50], WH: [238, 238, 228], CORAL: [255, 106, 61] });

  PD.hsh = function (a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  };
  const hsh = PD.hsh;
  PD.gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));

  /* ---------- clocks ---------- */
  PD.T_HIT = 95;                                   // round 4 reaches the hull (film time)
  const S = FILM.warp([{ t: 0, rate: 1 }, { t: 92.8, rate: 1 }, { t: 94.2, rate: .1 }, { t: 98.6, rate: .1 }, { t: 101.6, rate: 1 }, { t: D, rate: 1 }]);
  PD.S = S;
  PD.rate = T => S.rate(T);
  PD.SD = S.total;
  PD.TJ = 104.5;
  PD.tau = T => T < PD.TJ ? S(T) : S(T) - S.total;
  PD.TAU_HIT = S(PD.T_HIT);
  /* film time at which S reaches s (s within [0, S(TJ)]) */
  PD.filmOf = s => { let a = 0, b = PD.TJ; for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (S(m) < s) a = m; else b = m; } return (a + b) / 2; };

  /* ---------- coast ---------- */
  PD.RADAR = [0, 64, 0];
  PD.RMAX = 64000;
  /* the coastline: z (m) of the shore at x; land lies south of it. The radar stands on a cape. */
  PD.coastZ = x => { const k = x / 1000; return 1000 * (-.35 + 1.05 * Math.exp(-((k / 3.2) ** 2)) + .8 * fbm(k * .045 + 3.1, 1.7, .4, 4) - .00006 * k * k); };
  /* display height of the land (m); negative at sea */
  PD.landH = (x, z) => {
    const c = PD.coastZ(x), dIn = (c - z) / 1000; if (dIn <= 0) return -1;
    const k = x / 1000, q = z / 1000;
    return 34 * (1 - Math.exp(-dIn / .5)) + 300 * (1 - Math.exp(-dIn / 7)) * (.55 + .5 * fbm(k * .11 + 5.2, q * .11, 2.3, 4)) + 45 * Math.max(0, fbm(k * .55, q * .55, 5.1, 3));
  };

  /* ---------- the strike group: one course, one speed ---------- */
  const HDG = 15 * DEG, VS = 7.7;
  const FWD = [Math.sin(HDG), 0, Math.cos(HDG)], STB = [Math.cos(HDG), 0, -Math.sin(HDG)];
  const pol = (b, r) => [Math.sin(b * DEG) * r, Math.cos(b * DEG) * r];
  const P21 = [-4000, 38000];
  PD.SHIPS = [
    { id: 21, cls: 'DDG', name: 'Arleigh Burke', rcs: 40, L: .155, kind: 'ddg', p0: P21 },
    { id: 23, cls: 'DDG', name: 'Arleigh Burke', rcs: 39, L: .155, kind: 'ddg', p0: [P21[0] + pol(236, 6400)[0], P21[1] + pol(236, 6400)[1]] },
    { id: 14, cls: 'CVN', name: 'Nimitz', rcs: 51, L: .333, kind: 'cvn', p0: [P21[0] + pol(302, 10500)[0], P21[1] + pol(302, 10500)[1]] },
  ];
  Object.assign(PD, { HDG, VS, FWD, STB });
  PD.shipR = R.y(HDG);
  PD.ship = (j, tau) => { const s = PD.SHIPS[j]; return [s.p0[0] + FWD[0] * VS * tau, 0, s.p0[1] + FWD[2] * VS * tau]; };
  PD.shipX = (j, tau) => X.make(PD.shipR, PD.ship(j, tau));
  PD.shipKm = (j, tau) => { const p = PD.ship(j, tau); return [p[0] / 1000, p[2] / 1000]; };

  /* ---------- the raid: four rounds, paths relative to TRK 21 (they close on a moving ship) ---------- */
  const VR = 680;                                   // Mach 2 at sea level
  PD.VR = VR;
  PD.HIT_L = [9.9, 4.4, -6];                        // starboard side amidships, ship model coords
  const HIT_REL = R.ap(PD.shipR, PD.HIT_L);
  PD.HIT_REL = HIT_REL;
  const TH = PD.TAU_HIT;
  /* dt: would-be arrival at the hull relative to round 4 (s); lat: offset in the loose line (m, + right);
     stopD: distance to go where it is stopped (m): 1, 2 by interceptors, 3 bursts short, 4 hits */
  PD.RND = [
    { dt: -.8, lat: -95, stopD: 16000, fate: 'sm6' },
    { dt: -.45, lat: 70, stopD: 12000, fate: 'sm6' },
    { dt: -1.35, lat: -30, stopD: 500, fate: 'ciws' },
    { dt: 0, lat: 45, stopD: 0, fate: 'hit' },
  ];
  let U = [0, 0, -1], RG = [-1, 0, 0];
  const setU = psi => { U = [Math.sin(psi), 0, Math.cos(psi)]; RG = [Math.cos(psi), 0, -Math.sin(psi)]; };
  const altOf = d => 13 + 17 * E.ss(2500, 15000, d);
  /* ship-relative position of round k at picture time tau; d = distance to go */
  function relPos(k, tau, out) {
    const r = PD.RND[k], d = VR * (TH + r.dt - tau);
    const lat = r.lat * E.ss(900, 7000, d) + 4 * Math.sin(d / 520 + k * 1.9) * E.ss(600, 2500, d) * E.ss(14000, 6000, d);
    const y = E.mix(HIT_REL[1], altOf(d), E.ss(0, 180, d));
    out[0] = HIT_REL[0] - U[0] * d + RG[0] * lat; out[1] = y; out[2] = HIT_REL[2] - U[2] * d + RG[2] * lat;
    return d;
  }
  PD.relPos = relPos;
  /* aim so that round 4 comes over the scope's 64 km edge at tau = TE (just before frame 0) */
  PD.TE = -1.5;
  {
    const A = [0, 0, 0], rangeAt = psi => { setU(psi); relPos(3, PD.TE, A); const s = PD.ship(0, PD.TE); return Math.hypot(s[0] + A[0], s[2] + A[2]); };
    let a = 250 * DEG, b = 300 * DEG;
    for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (rangeAt(m) > PD.RMAX) a = m; else b = m; }
    setU((a + b) / 2);
  }
  PD.U = U; PD.RG = RG; PD.PSI = Math.atan2(U[0], U[2]);
  PD.tauStop = k => TH + PD.RND[k].dt - PD.RND[k].stopD / VR;
  PD.tauArrive = k => TH + PD.RND[k].dt;
  /* the stage-A fate of a round: gone where it is stopped (the effect stages dress this up) */
  PD.fate = (k, tau) => k === 3 ? (tau < PD.tauStop(3) ? 1 : 0) : 1 - E.sat((tau - PD.tauStop(k)) / .25);
  /* round k at picture time tau: world position, ship-relative position, unit direction, distance to go */
  const RA = [0, 0, 0], RB = [0, 0, 0];
  PD.round = function (k, tau, o) {
    o = o || {};
    const tS = PD.tauStop(k), tt = Math.min(tau, tS);
    const d = relPos(k, tt, RA); relPos(k, tt - .01, RB);
    const sp = PD.ship(0, tt);
    o.p = [sp[0] + RA[0], RA[1], sp[2] + RA[2]];
    o.rel = RA.slice();
    o.dir = V.norm([RA[0] - RB[0] + FWD[0] * VS * .01, RA[1] - RB[1], RA[2] - RB[2] + FWD[2] * VS * .01]);
    o.d = d; o.stopped = tau >= tS; o.a = PD.fate(k, tau);
    return o;
  };
  /* the formation's centre line (a virtual round between the four), ship-relative */
  PD.refRel = function (tau, out) {
    const d = VR * (TH - .7 - tau);
    out = out || [0, 0, 0];
    out[0] = HIT_REL[0] - U[0] * d; out[1] = E.mix(HIT_REL[1], altOf(d), E.ss(0, 180, d)); out[2] = HIT_REL[2] - U[2] * d;
    return out;
  };

  /* film times of the raid's events (all before TJ, where tau = S) */
  PD.EV = {
    stop1: PD.filmOf(PD.tauStop(0)), stop2: PD.filmOf(PD.tauStop(1)), burst3: PD.filmOf(PD.tauStop(2)), hit: PD.T_HIT,
  };
})();
