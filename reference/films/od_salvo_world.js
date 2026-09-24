/* OD "Salvo" world: the clock, the salvo's paths, the task group, sea, wakes, radar pulses.
   Everything is a pure function of film time T through sim time s = OD.SIM(T); paths are integrated
   once at load into tables. World: metres, X east, Y up, Z north.
   The loop repeats the world in place: the salvo seen at T = D is the next one (local sim time s - DS),
   standing exactly where the first stood at T = 0, so the seam frame is identical by construction.
   Loads after film.js, geo.js, hd_*.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, G = 9.81, RE = 6.371e6;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OD = window.OD = {};
  const fr = x => x - Math.floor(x);
  const hash = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const modp = (a, m) => ((a % m) + m) % m;
  const wrap = a => modp(a + PI, TAU) - PI;
  Object.assign(OD, { PI, TAU, D2R, G, RE, hash, modp, wrap, fr });

  /* ---------------- clock ----------------
     Real time, except round 4's last kilometre and the hit: x0.25 as it comes in, x0.1 through the
     impact, back to real time before the aftermath. The rate is shown on screen whenever it is not 1. */
  const D = OD.D = 150;
  const SIM = OD.SIM = FILM.warp([
    { t: 0, rate: 1 }, { t: 94, rate: 1 }, { t: 96, rate: .25 }, { t: 98.2, rate: .25 }, { t: 99.2, rate: .1 },
    { t: 104, rate: .1 }, { t: 108.5, rate: 1 }, { t: D, rate: 1 },
  ]);
  const DS = OD.DS = SIM.total;                       // sim seconds per loop
  const T_HIT = OD.T_HIT = 100, S_HIT = OD.S_HIT = SIM(T_HIT);
  OD.Tof = s => { let a = 0, b = D; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (SIM(m) < s) a = m; else b = m; } return (a + b) / 2; };

  /* ---------------- models (HD, wire copies) ---------------- */
  const HW = m => (window.HD && HD.wire ? HD.wire(m) : m);
  OD.MOD = {
    ddg: () => HW(HD.destroyer()), oniks: () => HW(HD.oniks()), sm6: () => HW(HD.sm6()), cv: () => HW(HD.carrier()),
  };
  const DA = OD.DA = HD.destroyer.A;

  /* Ticonderoga-class cruiser (no HD model: built from GEO prims) */
  OD.cruiser = function cruiser() {
    const { hex, box, lathe, cyl, panel, line } = GEO;
    const L = 172.8, zb = L / 2, dY = z => 6.4 + 3.6 * Math.pow(Math.max(0, (z / zb - .25) / .75), 2);
    const F = o => Object.assign({ fine: true }, o || {});
    const H = [{ t: 'hull', L, B: 16.8, D: 6.4 }], S = [], SP = [], M = [], A = [], RL = [], DK = [];
    const tap = (x0, x1, y0, y1, z0, z1, ix, iz, o) => hex([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0 + ix, y1, z0 + iz], [x1 - ix, y1, z0 + iz], [x1 - ix, y1, z1 - iz], [x0 + ix, y1, z1 - iz]], o);
    S.push(tap(-7.4, 7.4, 6.4, 10.4, -48, 42, 0, 0, { ribs: { z: 6 } }));
    S.push(tap(-7.0, 7.0, 10.4, 16.2, 8, 41, .9, .6));
    S.push(tap(-5.6, 5.6, 16.2, 19.6, 30, 39.5, .3, .4));
    S.push(tap(-6.8, 6.8, 10.4, 15.2, -42, -8, .9, .6));
    S.push(tap(-3.2, 3.2, 10.4, 21.5, -2.5, 6.5, .5, 1.2, { ribs: { y: 3 } }));
    S.push(tap(-3.0, 3.0, 10.4, 20.5, -16.5, -8.5, .5, 1.1, { ribs: { y: 3 } }));
    S.push(line([[-5.5, 18.6, 39.6], [5.5, 18.6, 39.6]], F({ w: .6 })));
    S.push(box([-6.4, 6.4, -56], [6.4, 11.6, -48], { ribs: { z: 2 } }));
    const oct = (c, h, u, r) => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU; p.push(V.add(c, V.add(V.mul(h, Math.cos(a) * r), V.mul(u, Math.sin(a) * r)))); } return p; };
    const FACES = [
      { c: [0, 13.2, 40.55], n: V.norm([0, .2, 1]) }, { c: [6.42, 13.2, 27], n: V.norm([1, .2, 0]) },
      { c: [0, 12.6, -41.45], n: V.norm([0, .2, -1]) }, { c: [-6.22, 12.6, -25], n: V.norm([-1, .2, 0]) },
    ];
    for (const f of FACES) {
      const h = V.norm(V.cross([0, 1, 0], f.n)), u = V.cross(f.n, h);
      SP.push(panel(oct(f.c, h, u, 2.35), { pts: false }));
      SP.push(panel(oct(V.mad(f.c, f.n, .04), h, u, 1.7), F({ pts: false, al: .5 })));
    }
    const ap = [0, 38, 23];
    for (const b of [[-2.6, 16.2, 21], [2.6, 16.2, 21], [-2.6, 16.2, 27], [2.6, 16.2, 27]]) M.push(cyl(b, ap, .22, { n: 6, gen: 0 }));
    M.push(cyl(ap, [0, 46, 23], .1, { n: 6, gen: 0 }), cyl([-6, 33, 23], [6, 33, 23], .12, { n: 6, gen: 0 }));
    M.push(box([-1.8, 38, 21.6], [1.8, 38.6, 24.4], F()));
    const ap2 = [0, 31, -25];
    for (const b of [[-2.3, 15.2, -28], [2.3, 15.2, -28], [0, 15.2, -20]]) M.push(cyl(b, ap2, .2, { n: 6, gen: 0 }));
    M.push(cyl(ap2, [0, 37, -25], .09, { n: 6, gen: 0 }), cyl([-4.5, 28, -25], [4.5, 28, -25], .1, { n: 6, gen: 0 }));
    for (const [z, fwd] of [[62, true], [-78.5, false]]) {
      const y = dY(z), s = fwd ? 1 : -1;
      A.push(lathe([0, y, z], [0, 1, 0], [[0, 2.1], [1.5, 1.8], [2.2, .9]], { n: 16, gen: 6 }));
      A.push(cyl([0, y + 1.2, z + s * 1.2], [0, y + 1.5, z + s * 8.2], .16, { n: 6, gen: 0 }));
    }
    for (const [z0, z1] of [[46, 55], [-72, -63]]) { const y = dY((z0 + z1) / 2); A.push(box([-3.3, y - .1, z0], [3.3, y + .3, z1], { ribs: { x: 4, z: 5 } })); }
    for (const [x, z] of [[4.8, -36], [-4.8, 33]]) A.push(lathe([x, 15.2, z], [0, 1, 0], [[0, .9], [1.8, .8], [2.6, .5], [2.9, 0]], F({ n: 10, gen: 4 })));
    DK.push(line([[0, dY(-60) + .03, -84], [0, dY(-60) + .03, -57]], F({ w: .5, pts: false })));
    const circ = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; circ.push([Math.cos(a) * 2.8, dY(-62) + .03, -62 + Math.sin(a) * 2.8]); }
    DK.push(line(circ, { closed: true, w: .6, pts: false }));
    for (const s of [-1, 1]) {
      const rl = []; for (let z = -84; z <= 80; z += 4) { const b = z / zb > .3 ? 8.4 * Math.max(0, 1 - Math.pow((z / zb - .3) / .7, 1.75)) : z / zb < -.82 ? 8.4 * (.84 + .16 * (1 - (-.82 - z / zb) / .18)) : 8.4; rl.push([s * (b - .2), dY(z) + 1, z]); }
      RL.push(line(rl, F({ w: .4 })));
    }
    return {
      L, B: 16.8, FACES,
      parts: [
        { name: 'hull', label: 'Hull · CG-47 Ticonderoga class', prims: H },
        { name: 'super', label: 'Superstructure', prims: S },
        { name: 'spy', label: 'AN/SPY-1B arrays ×4', prims: SP },
        { name: 'mast', label: 'Masts', prims: M },
        { name: 'arms', label: 'Mk 45 ×2 · Mk 41 VLS ×2', prims: A },
        { name: 'deck', label: 'Flight deck', prims: DK },
        { name: 'rails', label: 'Lifelines', prims: RL },
      ],
    };
  };

  /* ---------------- the task group ----------------
     A = the destroyer (hero, the target), CG = the screen cruiser, CV = the carrier. All steam east at
     17.5 kn until the hit; A is anchored so it stands at the origin at the hit. After the hit A loses way
     and sags to starboard; the cruiser and the carrier come round to the north-east, away from the raid. */
  const VK = OD.VK = 9;
  const SHIPS = OD.SHIPS = [
    { id: 'A', kind: 'ddg', L: 155.2, B: 20, anchor: [0, 0], ph: 0,
      psi: s => (90 + 18 * ss(S_HIT + 4, S_HIT + 55, s)) * D2R, v: s => mix(VK, 2.5, ss(S_HIT + 1, S_HIT + 45, s)) },
    { id: 'CG', kind: 'cg', L: 172.8, B: 16.8, anchor: [1650, 3350], ph: 2.3,
      psi: s => (90 - 50 * ss(S_HIT + 6, S_HIT + 38, s)) * D2R, v: s => mix(VK, 14, ss(S_HIT + 6, S_HIT + 40, s)) },
    { id: 'CV', kind: 'cvn', L: 332.8, B: 40.8, anchor: [-2400, 7700], ph: 4.1,
      psi: s => (90 - 50 * ss(S_HIT + 10, S_HIT + 50, s)) * D2R, v: s => mix(VK, 13, ss(S_HIT + 10, S_HIT + 48, s)) },
  ];
  const SID = OD.SID = {}; SHIPS.forEach(S => SID[S.id] = S);
  // tracks at 10 Hz of sim time from well before the loop (the wakes trail ~1 km of past track)
  const TR_HZ = 10, TR_S0 = -240, TR_S1 = DS + 60;
  for (const S of SHIPS) {
    const n = Math.ceil((TR_S1 - TR_S0) * TR_HZ) + 1, P = new Float64Array(n * 2), PSI = new Float64Array(n), DIST = new Float64Array(n);
    const p0 = S.psi(TR_S0), v0 = S.v(TR_S0);
    let x = S.anchor[0] + Math.sin(p0) * v0 * (TR_S0 - S_HIT), z = S.anchor[1] + Math.cos(p0) * v0 * (TR_S0 - S_HIT), d = 0;
    for (let i = 0; i < n; i++) {
      const s = TR_S0 + i / TR_HZ, ps = S.psi(s);
      P[2 * i] = x; P[2 * i + 1] = z; PSI[i] = ps; DIST[i] = d;
      // midpoint step: before the hit this is the straight line through the anchor, exactly
      const sm = s + .5 / TR_HZ, pm = S.psi(sm), vm = S.v(sm);
      x += Math.sin(pm) * vm / TR_HZ; z += Math.cos(pm) * vm / TR_HZ; d += vm / TR_HZ;
    }
    Object.assign(S, { P, PSI, DIST, n });
  }
  const trIdx = (S, s) => { const x = clamp((s - TR_S0) * TR_HZ, 0, S.n - 1.0001), i = Math.floor(x); return [i, x - i]; };
  OD.shipPos = (S, s) => { const [i, f] = trIdx(S, s), P = S.P; return [P[2 * i] + (P[2 * i + 2] - P[2 * i]) * f, 0, P[2 * i + 1] + (P[2 * i + 3] - P[2 * i + 1]) * f]; };
  OD.shipPsi = (S, s) => { const [i, f] = trIdx(S, s); return S.PSI[i] + (S.PSI[i + 1] - S.PSI[i]) * f; };
  OD.shipDist = (S, s) => { const [i, f] = trIdx(S, s); return S.DIST[i] + (S.DIST[i + 1] - S.DIST[i]) * f; };
  OD.shipV = (S, s) => S.v(s);
  // the track point `back` metres of track behind the ship's position at s: [x, z, psi]
  OD.trackBack = (S, s, back) => {
    const d = OD.shipDist(S, s) - back, DI = S.DIST;
    if (d <= DI[0]) { const ps = S.PSI[0]; return [S.P[0] - Math.sin(ps) * (DI[0] - d), S.P[1] - Math.cos(ps) * (DI[0] - d), ps]; }
    let a = 0, b = S.n - 1; while (b - a > 1) { const m = (a + b) >> 1; if (DI[m] <= d) a = m; else b = m; }
    const f = (d - DI[a]) / Math.max(1e-9, DI[b] - DI[a]);
    return [S.P[2 * a] + (S.P[2 * b] - S.P[2 * a]) * f, S.P[2 * a + 1] + (S.P[2 * b + 1] - S.P[2 * a + 1]) * f, S.PSI[a] + (S.PSI[b] - S.PSI[a]) * f];
  };
  /* roll / pitch / heave; A takes a list to starboard after the hit (the hit is on her starboard side) */
  OD.shipMot = (S, s) => {
    const p = S.ph, k = S.kind === 'cvn' ? .22 : S.kind === 'cg' ? .9 : 1;
    const list = S.id === 'A' ? -OD.LIST * ss(S_HIT + 1.5, S_HIT + 42, s) : 0;
    // the blast shoves her to port and she rolls back through it (natural roll period ~8 s), a small jolt in heave
    const ah = S.id === 'A' ? s - S_HIT : -1, jolt = ah > 0 ? Math.exp(-ah / 5) * Math.sin(TAU * ah / 8) * (1 - Math.exp(-ah / .12)) : 0;
    const bump = ah > 0 ? Math.exp(-ah / 1.2) * Math.sin(TAU * ah / 1.6) * (1 - Math.exp(-ah / .05)) : 0;
    return {
      roll: k * 1.1 * D2R * (.8 * Math.sin(.7 * s + p) + .2 * Math.sin(1.23 * s + 2.1 + p)) + list + 2.2 * D2R * jolt,
      pitch: k * .35 * D2R * Math.sin(.9 * s + 1 + p) + .3 * D2R * bump,
      heave: k * .3 * Math.sin(.8 * s + .4 + p) + .22 * bump,
    };
  };
  OD.LIST = 3.5 * D2R;
  OD.shipXf = (S, s) => { const m = OD.shipMot(S, s), p = OD.shipPos(S, s); return X.make(R.mul(R.y(OD.shipPsi(S, s)), R.mul(R.z(m.roll), R.x(m.pitch))), [p[0], m.heave, p[2]]); };
  OD.shipFrame = (S, s) => X.make(R.y(OD.shipPsi(S, s)), OD.shipPos(S, s));   // heading frame, no roll / heave
  const halfB = (S, z) => { const u = z / (S.L / 2), B = S.B / 2; if (u > .3) return B * Math.max(0, 1 - Math.pow((u - .3) / .7, 1.75)); if (u < -.85) return B * .86; return B; };
  OD.halfB = halfB;

  /* ---------------- the salvo ----------------
     Four 3M55 at 680 m/s (Mach 2) in a loose line abreast, 12-14 m over the sea, weaving gently. The
     formation flies due north; ~30 km out the rounds split onto their own lines: 1, 2 and 3 run in from
     the SSW at the destroyer's bow, stern and starboard bow; 4 swings wide to the east and comes back in
     from the SSE onto her starboard side amidships. Each path is a designed planar curve (straight leg,
     Hermite turns, straight final run) flown at constant speed; the formation's start is solved so round 3
     is 500 m out at its stop time, and round 4's dog-leg so it reaches the hull at S_HIT.
     Rounds 1-3 are stopped at OD.STOP (sim s). */
  const VR = OD.VR = 680;
  const XF = OD.XF = -30;
  const STOP = OD.STOP = [70.6, 74.2, 89.4];            // round 1 + 2: SM-6 far out; round 3: 500 m out
  const S3_ARR = STOP[2] + 500 / VR;
  const FO = OD.FO = [
    { x: -14, y: 13.6, z: 7, wa: 3.4, wp: 11.5, wph: .3, hp: 7.3, qz: -29500, fin: 0, run: 5000 },
    { x: -42, y: 12.3, z: -12, wa: 2.8, wp: 9.8, wph: 2.1, hp: 6.1, qz: -28500, fin: 0, run: 5000 },
    { x: 13, y: 12.1, z: -6, wa: 3.1, wp: 13.1, wph: 4.0, hp: 8.9, qz: -29000, fin: 0, run: 4000 },
    { x: 38, y: 13.2, z: 10, wa: 3.6, wp: 10.4, wph: 5.3, hp: 5.7, qz: -41000, fin: -28, run: 4200 },
  ];
  const RTURN = 12000;                                  // round 4's turns: radius at Mach 2 (~3.9 g)
  const HIT_L = OD.HIT_L = [9.8, 4.2, -8];              // round 4's point of impact on A (local)
  const AIM_L = [[8.2, 6, 26], [9.6, 5, -52], [7.4, 5, 45], HIT_L];
  const AIM_S = [89, 92.5, S3_ARR, S_HIT];
  const A = SID.A;
  const AIMS = OD.AIMS = AIM_L.map((l, i) => X.ap(OD.shipXf(A, AIM_S[i]), l));
  const S_LO = -70, HZ = 60;
  // lateral weave (formation only, gone by the split) and a small height wander
  const SPLIT_W = 7;
  const weaveK = (F, s) => 1 - ss(F.split - SPLIT_W, F.split, s);
  const weave = (F, s) => F.wa * (Math.sin(TAU * s / F.wp + F.wph) + .35 * Math.sin(TAU * s / (F.wp * .43) + F.wph * 2.3)) * weaveK(F, s);
  const bob = (F, s) => .45 * Math.sin(TAU * s / F.hp + F.wph) * weaveK(F, s);
  // planar path pieces: [x, z] polylines, densely sampled
  const herm = (p0, t0, p1, t1, n, out) => {
    for (let k = 1; k <= n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out.push([p0[0] * h00 + t0[0] * h10 + p1[0] * h01 + t1[0] * h11, p0[1] * h00 + t0[1] * h10 + p1[1] * h01 + t1[1] * h11]);
    }
  };
  const dir2 = deg => [Math.sin(deg * D2R), Math.cos(deg * D2R)];
  const rn2 = deg => [Math.cos(deg * D2R), -Math.sin(deg * D2R)];   // right-hand normal of a heading
  // the curved part of round i's path, from its split point Q (heading north) to the aim.
  // Rounds 1-3: a long Hermite blend onto their final run (metres of correction). Round 4, a dog-leg of true
  // arcs: turn right through alpha, straight, turn left onto its final heading, straight final run; the two
  // straights are solved so the path ends on the aim.
  function curve(i, alpha) {
    const F = FO[i], aim = [AIMS[i][0], AIMS[i][2]], Q = [XF + F.x, F.qz], df = dir2(F.fin), out = [Q];
    let ok = true;
    if (i < 3) {
      const P = [aim[0] - df[0] * F.run, aim[1] - df[1] * F.run], ch = Math.hypot(P[0] - Q[0], P[1] - Q[1]) * .55;
      herm(Q, [0, ch], P, [df[0] * ch, df[1] * ch], 500, out);
      for (let k = 1; k <= 40; k++) out.push([P[0] + (aim[0] - P[0]) * k / 40, P[1] + (aim[1] - P[1]) * k / 40]);
    } else {
      const Rt = RTURN, b = F.fin, n0 = rn2(0), na = rn2(alpha), nb = rn2(b);
      const E1 = [Q[0] + Rt * (n0[0] - na[0]), Q[1] + Rt * (n0[1] - na[1])];
      const arc2 = [Rt * (nb[0] - na[0]), Rt * (nb[1] - na[1])];
      // Ls dir(alpha) + Lf dir(b) = aim - E1 - arc2
      const Dx = aim[0] - E1[0] - arc2[0], Dz = aim[1] - E1[1] - arc2[1], da = dir2(alpha), db = dir2(b);
      const det = da[0] * db[1] - da[1] * db[0], Ls = (Dx * db[1] - Dz * db[0]) / det, Lf = (da[0] * Dz - da[1] * Dx) / det;
      ok = Ls >= 0 && Lf >= F.run;
      for (let k = 1; k <= 200; k++) { const a = alpha * k / 200, nn = rn2(a); out.push([Q[0] + Rt * (n0[0] - nn[0]), Q[1] + Rt * (n0[1] - nn[1])]); }
      const S2 = [E1[0] + da[0] * Ls, E1[1] + da[1] * Ls];
      for (let k = 1; k <= 40; k++) out.push([E1[0] + da[0] * Ls * k / 40, E1[1] + da[1] * Ls * k / 40]);
      for (let k = 1; k <= 300; k++) { const a = alpha + (b - alpha) * k / 300, nn = rn2(a); out.push([S2[0] + Rt * (nn[0] - na[0]), S2[1] + Rt * (nn[1] - na[1])]); }
      const E2 = out[out.length - 1];
      for (let k = 1; k <= 80; k++) out.push([E2[0] + (aim[0] - E2[0]) * k / 80, E2[1] + (aim[1] - E2[1]) * k / 80]);
    }
    // run on past the aim (into the hull), so the table reaches the aim at the arrival time exactly
    const e1 = out[out.length - 1], e0 = out[out.length - 2], el = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
    let L = 0; const C = [0];
    for (let k = 1; k < out.length; k++) { L += Math.hypot(out[k][0] - out[k - 1][0], out[k][1] - out[k - 1][1]); C.push(L); }
    out.push([e1[0] + (e1[0] - e0[0]) / el * 60, e1[1] + (e1[1] - e0[1]) / el * 60]); C.push(L + 60);
    return { pts: out, cum: C, L, ok };
  }
  // round 3 fixes the formation's start: its path is (straight leg) + (curve) = VR * (S3_ARR - S_LO)
  const C3 = curve(2, 0);
  const zF = OD.ZF = FO[2].qz - FO[2].z - VR * S_LO - (VR * (S3_ARR - S_LO) - C3.L);
  // round 4's dog-leg: open it until its path reaches the hull exactly at S_HIT
  let alpha4;
  {
    const need = VR * (S_HIT - S_LO) - (FO[3].qz - (zF + FO[3].z + VR * S_LO));
    let a = 1, b = 80;
    for (let it = 0; it < 50; it++) { const m = (a + b) / 2; if (curve(3, m).L < need) a = m; else b = m; }
    alpha4 = (a + b) / 2;
  }
  OD.ALPHA4 = alpha4;
  const CURVES = [curve(0, 0), curve(1, 0), C3, curve(3, alpha4)];
  OD.CURVE_OK = CURVES[3].ok;

  /* tables: position (weave + height applied), unit forward, unit up (lift along a + g, so the rounds bank
     into their turns), speed */
  const RT = OD.RT = [];
  for (let i = 0; i < 4; i++) {
    const F = FO[i], Cv = CURVES[i], z0 = zF + F.z + VR * S_LO, lead = F.qz - z0;
    const arr = S_LO + (lead + Cv.L) / VR, n = Math.floor((arr - S_LO) * HZ) + 4;
    F.split = S_LO + lead / VR;
    const P = new Float64Array(n * 3);
    const yEnd = i === 3 ? AIMS[3][1] : 7;
    let seg = 1;
    for (let k = 0; k < n; k++) {
      const s = S_LO + k / HZ, d = VR * (s - S_LO);
      let x, z, ps;
      if (d <= lead) { x = XF + F.x; z = z0 + d; ps = 0; }
      else {
        const cum = Cv.cum, pts = Cv.pts, c = Math.min(cum[cum.length - 1], d - lead);
        while (seg < cum.length - 1 && cum[seg] < c) seg++;
        const f = (c - cum[seg - 1]) / Math.max(1e-9, cum[seg] - cum[seg - 1]), a = pts[seg - 1], b = pts[seg];
        x = a[0] + (b[0] - a[0]) * f; z = a[1] + (b[1] - a[1]) * f; ps = Math.atan2(b[0] - a[0], b[1] - a[1]);
      }
      const w = weave(F, s), yc = F.y + bob(F, s);
      P[3 * k] = x + Math.cos(ps) * w;
      P[3 * k + 1] = mix(yc, yEnd, ss(arr - 11, arr - .15, s));
      P[3 * k + 2] = z - Math.sin(ps) * w;
    }
    const FW = new Float64Array(n * 3), UP = new Float64Array(n * 3), SP = new Float64Array(n);
    const acc = new Float64Array(n * 3);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1), dtt = (b - a) / HZ;
      let vx = (P[3 * b] - P[3 * a]) / dtt, vy = (P[3 * b + 1] - P[3 * a + 1]) / dtt, vz = (P[3 * b + 2] - P[3 * a + 2]) / dtt;
      const sp = Math.hypot(vx, vy, vz) || 1; SP[k] = sp;
      FW[3 * k] = vx / sp; FW[3 * k + 1] = vy / sp; FW[3 * k + 2] = vz / sp;
      if (k > 0 && k < n - 1) for (let c = 0; c < 3; c++) acc[3 * k + c] = (P[3 * (k + 1) + c] - 2 * P[3 * k + c] + P[3 * (k - 1) + c]) * HZ * HZ;
    }
    // smooth the accelerations over +-0.4 s so the bank never twitches
    const K = 24;
    for (let k = 0; k < n; k++) {
      let sx = 0, sy = 0, sz = 0, sw = 0;
      for (let j = -K; j <= K; j += 2) { const q = clamp(k + j, 1, n - 2), g = Math.exp(-(j * j) / (2 * 12 * 12)); sx += acc[3 * q] * g; sy += acc[3 * q + 1] * g; sz += acc[3 * q + 2] * g; sw += g; }
      let ux = sx / sw, uy = sy / sw + G, uz = sz / sw;
      const f = [FW[3 * k], FW[3 * k + 1], FW[3 * k + 2]], d = ux * f[0] + uy * f[1] + uz * f[2];
      ux -= f[0] * d; uy -= f[1] * d; uz -= f[2] * d;
      const l = Math.hypot(ux, uy, uz) || 1;
      UP[3 * k] = ux / l; UP[3 * k + 1] = uy / l; UP[3 * k + 2] = uz / l;
    }
    RT.push({ P, FW, UP, SP, n, arr, F, end: i < 3 ? STOP[i] : S_HIT });
  }
  /* round i at local sim time sl (the next salvo is sl = s - DS): {p, f, u, X, spd, a (alpha), live} */
  const OUT = OD.ROUND_OUT = .28;                     // stage A: rounds 1-3 fade over this long at their stop time
  OD.round = function (i, sl) {
    const T = RT[i], x = clamp((sl - S_LO) * HZ, 0, T.n - 1.0001), k = Math.floor(x), f = x - k, j = 3 * k;
    const L = (A, c) => A[j + c] + (A[j + 3 + c] - A[j + c]) * f;
    let p;
    if (sl < S_LO) {
      // before the tables: the formation straight back along the track, weave running
      const F = T.F, w = weave(F, sl);
      p = [XF + F.x + w, F.y + bob(F, sl), zF + F.z + VR * sl];
    } else p = [L(T.P, 0), L(T.P, 1), L(T.P, 2)];
    const fw = V.norm([L(T.FW, 0), L(T.FW, 1), L(T.FW, 2)]), up = V.norm([L(T.UP, 0), L(T.UP, 1), L(T.UP, 2)]);
    const a = i < 3 ? 1 - ss(T.end - OUT, T.end, sl) : 1;
    return { p, f: fw, u: up, X: X.make(R.look(fw, up), p), spd: T.SP[k], a, live: sl < T.end, end: T.end, arr: T.arr };
  };
  // the formation's frame (translation only: centre of the line, due north at VR), local sim time sl
  OD.salvoC = sl => [XF, 0, zF + VR * sl];

  /* ---------------- sea ----------------
     Deep-water swell as gravity waves; each frequency is rounded so the sea repeats exactly every DS sim
     seconds. (The rows below are anchored to the water, so a fast lens needs no special treatment.) */
  const WAVES = OD.WAVES = [
    { A: 1.15, L: 150, d: .25, ph: 0 }, { A: .68, L: 84, d: -.7, ph: 1.7 }, { A: .38, L: 46, d: 1.1, ph: 4.1 },
    { A: .2, L: 29, d: -.3, ph: 2.2 }, { A: .1, L: 17, d: .62, ph: 5.3 },
  ].map(w => { const k = TAU / w.L, n = Math.max(1, Math.round(Math.sqrt(G * k) * DS / TAU)); return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: n * TAU / DS, ph: w.ph }; });
  function swell(x, z, s) { let h = 0; for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * x + w.kz * z - w.w * s + w.ph); } return h; }
  OD.swell = swell;

  /* sea rows: straight lines across the view on the water, spaced in power-of-two levels; their offset along
     the view follows the lens's own travel (phase integrals of the camera path), so rows stream past a moving
     lens as water does. Heights from the swell at their world positions; curvature drop to a true horizon. */
  const SEA = { C: 15, S0: 1, base: .2 };
  OD.drawSea = function (W, cam, s, ph, o) {
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
        const S = ships[k], dx = x - S.x, dz = z - S.z;
        if (dx * dx + dz * dz > S.r2) continue;
        // into the ship's own axes
        const lz = dx * S.sn + dz * S.cs, lx = dx * S.cs - dz * S.sn;
        if (Math.abs(lz) < S.L / 2 + 1.5 && Math.abs(lx) < halfB(S.S, lz) + 1.2) return true;
      }
      return false;
    };
    const phF = ph[0], phR = ph[1];
    for (let lvl = 0; lvl < 18; lvl++) {
      const sp = SEA.S0 * Math.pow(2, lvl), rhoEnd = SEA.C * Math.sqrt(sp * h), top = rhoEnd >= rhoMax || sp >= 1024;
      if (rhoEnd < h * 1.02 && !top) continue;
      const dEnd = Math.sqrt(Math.max(0, rhoEnd * rhoEnd - h * h));
      const off = modp(phF, sp), q = Math.floor(modp(phF, 2 * sp) / sp);
      const lo = Math.max(dMin, -dEnd), hi = Math.min(dMax, top ? rhoMax : dEnd);
      const m0 = Math.ceil((lo + off) / sp), m1 = Math.floor((hi + off) / sp);
      // rows that slide more than ~a third of their spacing per frame would strobe: fade them
      const strobe = 1 - ss(.22, .5, spd / 60 / sp);
      if (strobe <= .01 && !top) continue;
      for (let m = m0; m <= m1; m++) {
        if (!top && modp(m - q, 2) === 0) continue;
        const d = m * sp - off, rho = Math.hypot(d, h);
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
          const p = [x, amp * swell(x, z, s) - r2 / (2 * RE), z];
          if (prev) W.seg(prev, p, a);
          prev = p;
        }
      }
      if (top) break;
    }
    // horizon: the true geometric horizon circle (dip below the horizontal grows with height)
    const hb = [];
    const psi0 = Math.atan2(fx, fz), span = Math.min(PI, Math.atan(tW) * 1.3 + .2);
    for (let k = 0; k <= 48; k++) { const b = psi0 - span + 2 * span * k / 48; hb.push([e[0] + Math.sin(b) * dHor, -h, e[2] + Math.cos(b) * dHor]); }
    const ha = .3 * (o.horizon === undefined ? 1 : o.horizon);
    for (let k = 0; k < hb.length - 1; k++) W.seg(hb[k], hb[k + 1], ha);
    return { dHor, fx, fz };
  };

  /* whitecaps: seeded world cells, foam where the swell crest is high; each streak is smeared by one frame of
     the lens's motion (at Mach 2 the near water is all speed lines) */
  OD.drawCaps = function (W, cam, s, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(1, e[1]);
    const c = 9 * Math.pow(2, Math.max(0, Math.round(Math.log2(h / 30)))), N = 24;
    let fx = cam.f[0], fz = cam.f[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const cx = e[0] + fx * c * N * .8, cz = e[2] + fz * c * N * .8;
    const i0 = Math.floor(cx / c) - N, j0 = Math.floor(cz / c) - N, ships = o.ships || [];
    const A0 = .4 * (o.alpha === undefined ? 1 : o.alpha), Lk = c / 9, sm = o.smear || [0, 0, 0];
    const smL = Math.hypot(sm[0], sm[2]), smK = 1 / (1 + smL / (4 * Lk));
    for (let i = i0; i < i0 + 2 * N; i++) for (let j = j0; j < j0 + 2 * N; j++) {
      const hh = hash(i, j); if (hh > .22) continue;
      const x = (i + hash(j, i + 7)) * c, z = (j + hash(i + 3, j - 5)) * c;
      let cut = false;
      for (const S of ships) { const dx = x - S.x, dz = z - S.z; if (dx * dx + dz * dz < S.r2) { const lz = dx * S.sn + dz * S.cs, lx = dx * S.cs - dz * S.sn; if (Math.abs(lz) < S.L / 2 + 6 && Math.abs(lx) < halfB(S.S, lz) + 5) { cut = true; break; } } }
      if (cut) continue;
      const sw = swell(x, z, s), crest = sat((sw - .35) / 1.1);
      if (crest <= 0) continue;
      const dist = Math.hypot(x - e[0], z - e[2], h);
      const a = A0 * crest * Math.pow(1 - Math.min(1, dist / (c * N * 1.6)), 1.5) * (.55 + .45 * Math.sin(TAU * 3 * s / DS + hh * 40)) * (.35 + .65 * smK);
      if (a < .01) continue;
      const len = Lk * (1.2 + 2.6 * hash(i + 11, j)), y = sw * Math.min(1, 220 / dist + .12) + .05;
      W.seg([x, y, z - len * .5], [x + .3 * Lk + sm[0], y, z + len * .5 + sm[2]], a);
    }
  };

  /* Kelvin wake + bow wave + churned centreline laid along the ship's own past track (so a turning ship
     leaves a curving wake); foam drifts with the water. The cusp lines leave the bow at 19.47 deg;
     transverse crests are lambda = 2 pi v^2 / g apart. */
  const KEL = 19.47 * D2R, TK = Math.tan(KEL);
  OD.drawWake = function (W, S, s, o) {
    o = o || {};
    const L = S.L, zb = L / 2, zs = -L / 2, bw = S.B / 2, A = o.alpha === undefined ? 1 : o.alpha;
    const vS = S.v(s), LAM = TAU * vS * vS / G, kv = ss(1.5, 6, vS);
    const Lw = (S.kind === 'cvn' ? 1300 : 900) * mix(.45, 1, kv), dist = OD.shipDist(S, s);
    const Fr = OD.shipFrame(S, s), dy = o.dy || 0;
    // a point l metres of track behind the bow, x metres to starboard of the track, lifted y
    const P = (x, l, y) => {
      const back = l - zb, yy = (y === undefined ? .12 : y) + dy;
      if (back <= 0) return X.ap(Fr, [x, yy, zb - l]);
      const t = OD.trackBack(S, s, back), ps = t[2];
      return [t[0] + Math.cos(ps) * x, yy, t[1] - Math.sin(ps) * x];
    };
    const Pl = (x, z, y) => X.ap(Fr, [x, (y === undefined ? .12 : y) + dy, z]);
    for (const sg of [-1, 1]) {
      let pv = P(sg * bw * .35, 4);
      for (let i = 1; i <= 26; i++) {
        const l = i / 26 * Lw, x = sg * (bw * .35 + l * TK) + 1.1 * Math.sin(i * 1.7 + s * 1.3);
        const q = P(x, 4 + l);
        W.seg(pv, q, A * kv * .32 * Math.pow(1 - i / 27, 1.2));
        pv = q;
      }
      for (let k = 0; k < 34; k++) {
        const l = 10 + k * LAM * .5, x = sg * (bw * .35 + l * TK);
        const len = 4 + l * .06, a = A * kv * .2 * Math.pow(1 - l / Lw, 1.4);
        if (a < .01 || l > Lw) continue;
        const dx = -sg * Math.sin(35 * D2R) * len, dl = Math.cos(35 * D2R) * len;
        W.seg(P(x, 4 + l), P(x + dx, 4 + l - dl * .6), a);
      }
      const b0 = Pl(sg * .3, zb - 1.5, .25), b1 = Pl(sg * (bw * .72 + 1.2), zb - L * .2, .2), b2 = Pl(sg * (bw + 3.5), zb - L * .42, .12);
      W.seg(b0, b1, A * kv * .55); W.seg(b1, b2, A * kv * .3);
      for (let k = 0; k < 7; k++) {
        const f = fr(s * .9 + k * .37), zz = zb - 2 - k * 2.2;
        W.seg(Pl(sg * (.4 + k * .9), zz, .3 + .6 * (1 - f)), Pl(sg * (1.2 + k * 1.1), zz - 1.6, .15), A * kv * .28 * (1 - f));
      }
      for (let k = 0; k < 10; k++) { const z = zb - 20 - k * 12; const x = sg * (halfB(S, z) + 1.6 + .8 * Math.sin(k * 2.3 + s * 1.7)); W.seg(Pl(x, z), Pl(x + sg * .6, z - 8), A * kv * .2); }
    }
    for (let k = 1; k <= 14; k++) {
      const l = L + k * Math.max(8, LAM) - 8, xm = bw * .35 + l * TK, a = A * kv * .16 * Math.pow(1 - k / 15, 1.5);
      if (l > Lw) break;
      let pv = null;
      for (let i = 0; i <= 12; i++) {
        const u = -1 + 2 * i / 12, q = P(u * xm * .82, l - Math.pow(Math.abs(u), 2) * Math.max(8, LAM) * .38);
        if (pv) W.seg(pv, q, a * (1 - .6 * Math.abs(u)));
        pv = q;
      }
    }
    // churned centreline: foam streaks fixed in the water, inside a slowly widening band
    const sp = 12, cyc = Math.floor(dist / sp);
    for (let i = 0; i < 52; i++) {
      const l0 = L + 2 + i * sp + modp(dist, sp), wide = bw * .42 + (l0 - L) * .028, fade = Math.pow(1 - i / 53, 1.2);
      for (let j = 0; j < 5; j++) {
        const hh = hash(i * 5 + j, cyc - i), x0 = wide * (hh * 2 - 1) * .92, len = 3 + 5 * hash(cyc - i, j + 11);
        W.seg(P(x0, l0 + j * 2.1), P(x0 + .4 * (hh - .5), l0 + j * 2.1 + len), A * mix(.4, 1, kv) * .3 * fade * (1 - .5 * Math.abs(hh * 2 - 1)));
      }
    }
    for (const sg of [-1, 1]) {
      let pv = null;
      for (let i = 0; i <= 40; i++) {
        const d = i * 16, w = bw * .42 + d * .028 + .9 * Math.sin(i * 1.9 + sg + (dist - d) * .07);
        const q = P(sg * w, L + 1 + d);
        if (pv) W.seg(pv, q, A * mix(.4, 1, kv) * .3 * Math.pow(1 - i / 41, 1.3));
        pv = q;
      }
    }
    for (let k = 0; k < 6; k++) { const f = fr(s * .7 + k / 6); W.seg(Pl(-bw * .6 * (1 - f), zs - 1 - f * 10), Pl(bw * .6 * (1 - f), zs - 1 - f * 10), A * kv * .2 * (1 - f)); }
  };

  /* radar search pulses: patches of expanding spherical shell from the array face that looks their way */
  const PER = .7, LIFE = 2.4;
  const SHELL = [[0, .5], [9, .85], [18, 1], [29, .6], [42, .28]].map(q => [q[0] * D2R, q[1]]);
  const pulseR = age => 14 + 240 * age + 380 * age * age;
  OD.drawPulses = function (W, S, s, facesW, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, t0 = .31 + S.ph * .1;
    const kNow = Math.floor((s - t0) / PER), fired = [];
    for (let k = kNow; k >= kNow - Math.ceil(LIFE / PER); k--) {
      const Tk = t0 + k * PER, age = s - Tk;
      if (age < 0 || age > LIFE) continue;
      const cb = (modp(k * 137 + (k >> 2) * 61, 360) + 7 * Math.sin(k)) * D2R;
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
  // carrier: SPS-48E pencil beams along its turning antenna
  OD.drawSweep = function (W, c, s, bearing0, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, per = .45, life = 1.6, kNow = Math.floor(s / per);
    for (let k = kNow; k >= kNow - 4; k--) {
      const Tk = k * per, age = s - Tk;
      if (age < 0 || age > life) continue;
      const b = bearing0(Tk), rad = 20 + 900 * age, al = A * .3 * Math.pow(1 - age / life, 1.6), n = 10;
      for (const el of [1 * D2R, 4 * D2R, 8 * D2R]) {
        let pv = null;
        for (let i = 0; i <= n; i++) {
          const bb = b + (-5 + 10 * i / n) * D2R;
          const q = [c[0] + Math.sin(bb) * Math.cos(el) * rad, c[1] + Math.sin(el) * rad, c[2] + Math.cos(bb) * Math.cos(el) * rad];
          if (pv) W.seg(pv, q, al * Math.sin(PI * (i - .5) / n) * (1 - el * 4));
          pv = q;
        }
      }
    }
  };

  /* heat shimmer over the uptakes: the exhaust rises into the relative wind from ahead and leans aft */
  OD.drawShimmer = function (W, mouth, up, aft, side, tau, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, n = o.n || 9, Lp = o.len || 15;
    const out = V.norm(V.cross(up, aft));
    for (let i = 0; i < n; i++) {
      const ph = i * 2.39, lat = ((i + .5) / n - .5) * (o.w || 2.6);
      let pv = null;
      for (let k = 0; k <= 22; k++) {
        const sd = k / 22 * Lp, rise = sd * .74, lean = sd * .68 + .016 * sd * sd;
        const amp = .05 + sd * .03;
        const wob = amp * (Math.sin(2.3 * sd - 9.5 * tau + ph) + .6 * Math.sin(4.1 * sd - 15.7 * tau + ph * 1.7));
        const q = V.add(V.add(V.mad(V.mad(mouth, up, rise), aft, lean), V.mul(side, lat * (1 + sd * .05) + wob)), V.mul(out, amp * .8 * Math.sin(3.1 * sd - 11.3 * tau + ph)));
        if (pv) W.seg(pv, q, A * .17 * Math.pow(1 - sd / Lp, 1.2) * ss(0, 1.5, sd));
        pv = q;
      }
    }
  };

  // wind: ~8 m/s from the ENE (smoke leans WSW)
  OD.WIND = [-7.6, 0, -2.6];

  /* ================= chapter 3: the defence =================
     Two SM-6 leave the forward cells and fly designed lofts (vertical boost, pitch-over, climb, arc over, a
     shallow dive) that end on rounds 1 and 2 at those rounds' stop times; the forward Phalanx slews onto round 3,
     spins up and fires two bursts; round 3 bursts ~500 m off the starboard bow and its debris falls into the sea.
     Cinematic curves, not guidance. Tables are built here once; every particle is analytic in its age with seeded
     constants, so a frame is a pure function of sim time. */
  const DEF = OD.DEF = {};
  const WIND = OD.WIND, UPV = [0, 1, 0], GV = G, WHC = '#F6F5F2', HOT = '#FFFFFF';
  const sm5 = t => { t = sat(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const shipVel = s => { const ps = OD.shipPsi(A, s), v = A.v(s); return [Math.sin(ps) * v, 0, Math.cos(ps) * v]; };
  const invAp = DEF.invAp = (Xs, p) => { const M = Xs.R, dx = p[0] - Xs.T[0], dy = p[1] - Xs.T[1], dz = p[2] - Xs.T[2]; return [M[0] * dx + M[3] * dy + M[6] * dz, M[1] * dx + M[4] * dy + M[7] * dz, M[2] * dx + M[5] * dy + M[8] * dz]; };
  // a body flung at v0 with linear drag (time constant tau) under gravity: displacement after age a
  const flung = DEF.flung = (v0, tau, a) => { const e = tau * (1 - Math.exp(-a / tau)); return [v0[0] * e, (v0[1] + GV * tau) * e - GV * tau * a, v0[2] * e]; };
  const seaY = (p, s) => swell(p[0], p[2], s);

  /* ---- SM-6: two rounds out of the forward Mk 41 ---- */
  const SM6 = DEF.SM6 = [
    { cell: 13, tL: 57.3, tgt: 0, tOpen: 55.6, seed: 3 },
    { cell: 2, tL: 60, tgt: 1, tOpen: 56.05, seed: 7 },
  ];
  const SHZ = 120, T_SEP = DEF.T_SEP = 6;
  // Mk 72 boost (gentle for the first 0.3 s in the cell), then the sustainer
  const smAcc = (t, Ab) => Ab * (.3 + .7 * ss(0, .3, t)) * mix(1, .16, ss(T_SEP - .2, T_SEP + .2, t));
  const h3 = (pts, p0, t0, p1, t1, n) => {
    for (let k = 1; k <= n; k++) {
      const u = k / n, u2 = u * u, u3 = u2 * u, a0 = 2 * u3 - 3 * u2 + 1, a1 = u3 - 2 * u2 + u, a2 = -2 * u3 + 3 * u2, a3 = u3 - u2;
      pts.push([0, 1, 2].map(i => p0[i] * a0 + t0[i] * a1 + p1[i] * a2 + t1[i] * a3));
    }
  };
  for (const M of SM6) {
    const c = DA.vls(M.cell), X0 = OD.shipXf(A, M.tL), cp = DA.vls(M.cell ^ 1);
    M.hatchL = c;
    M.uptakeL = [(c[0] + cp[0]) / 2, c[1] + .02, (DA.vls(M.cell % 8)[2] + DA.vls(24 + M.cell % 8)[2]) / 2];
    M.hatch = X.ap(X0, c);
    M.P0 = X.ap(X0, [c[0], c[1] - 3.45, c[2]]);           // mid-stack: the nose just under the hatch
    M.tI = STOP[M.tgt]; M.Tf = M.tI - M.tL;
    M.PI = OD.round(M.tgt, M.tI).p;
    M.vS = shipVel(M.tL);                                // the ship's way, carried off the deck
    const PIr = V.mad(M.PI, M.vS, -M.Tf);
    const b = V.norm([PIr[0] - M.P0[0], 0, PIr[2] - M.P0[2]]);
    M.b = b; M.lat = V.norm(V.cross(UPV, b));
    const gc = 44 * D2R, gd = 21 * D2R;
    const dC = [b[0] * Math.cos(gc), Math.sin(gc), b[2] * Math.cos(gc)], dD = [b[0] * Math.cos(gd), -Math.sin(gd), b[2] * Math.cos(gd)];
    const W1 = V.mad(M.P0, UPV, 44), W2 = V.add(V.mad(M.P0, b, 230), [0, 320, 0]);
    const pts = [M.P0];
    for (let k = 1; k <= 16; k++) pts.push(V.lerp(M.P0, W1, k / 16));
    const c1 = V.dist(W1, W2); h3(pts, W1, V.mul(UPV, c1), W2, V.mul(dC, c1), 60);
    const c2 = V.dist(W2, PIr); h3(pts, W2, V.mul(dC, c2 * 1.05), PIr, V.mul(dD, c2 * .8), 1400);
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + V.dist(pts[k], pts[k - 1]));
    const L = cum[cum.length - 1];
    // arc length flown by flight time, on an 8x finer grid than the tables; boost level solved so the flight
    // covers the curve in exactly Tf
    const n = Math.ceil(M.Tf * SHZ) + 2, sub = 8, h = 1 / (SHZ * sub);
    const arc = (Ab, XA, VA) => {
      let v = 0, x = 0;
      for (let k = 0; k < n; k++) {
        if (XA) { XA[k] = x; VA[k] = v; }
        for (let j = 0; j < sub; j++) { const t = (k * sub + j) * h, a0 = smAcc(t, Ab), a1 = smAcc(t + h, Ab); x += v * h + (2 * a0 + a1) / 6 * h * h; v += (a0 + a1) / 2 * h; }
      }
      return { x, v };
    };
    const atTf = Ab => { let v = 0, x = 0; const N = Math.round(M.Tf * SHZ * sub); for (let i = 0; i < N; i++) { const t = i * h, a0 = smAcc(t, Ab), a1 = smAcc(t + h, Ab); x += v * h + (2 * a0 + a1) / 6 * h * h; v += (a0 + a1) / 2 * h; } return x; };
    let lo = 20, hi = 2000; for (let it = 0; it < 44; it++) { const m = (lo + hi) / 2; if (atTf(m) < L) lo = m; else hi = m; }
    M.Ab = (lo + hi) / 2;
    const XA = new Float64Array(n), VA = new Float32Array(n); arc(M.Ab, XA, VA);
    const P = new Float64Array(n * 3), FW = new Float32Array(n * 3);
    let seg = 1;
    for (let k = 0; k < n; k++) {
      const xx = Math.min(XA[k], L), t = k / SHZ;
      while (seg < cum.length - 1 && cum[seg] < xx) seg++;
      const f = (xx - cum[seg - 1]) / Math.max(1e-9, cum[seg] - cum[seg - 1]), a = pts[seg - 1], bb = pts[seg], dd = V.norm(V.sub(bb, a));
      for (let i = 0; i < 3; i++) { P[3 * k + i] = a[i] + (bb[i] - a[i]) * f + M.vS[i] * t; FW[3 * k + i] = dd[i]; }
    }
    Object.assign(M, { P, FW, SP: VA, n, L });
    // the tail clears the hatch: the exhaust leaves the uptake until then, the laid smoke starts there
    M.tClear = 0; for (let k = 0; k < n; k++) if (P[3 * k + 1] - 3.3 > M.hatch[1]) { M.tClear = k / SHZ; break; }
    M.vEnd = [(P[3 * (n - 1)] - P[3 * (n - 3)]) * SHZ / 2, (P[3 * (n - 1) + 1] - P[3 * (n - 3) + 1]) * SHZ / 2, (P[3 * (n - 1) + 2] - P[3 * (n - 3) + 2]) * SHZ / 2];
    // launch cloud: exhaust bursting out of the cell and the uptake, rolling aft over the deck
    M.puffs = [];
    for (let k = 0; k < 16; k++) {
      const az = hash(k, M.seed) * TAU, sp = 3 + 9 * hash(k + 5, M.seed), up = 1 + 6 * hash(k + 9, M.seed);
      M.puffs.push({ t0: .02 + k * .055, v: [Math.cos(az) * sp, up, Math.sin(az) * sp], r0: 1.2 + 1.6 * hash(k + 13, M.seed), sd: k * 7.3 + M.seed });
    }
  }
  const smAt = DEF.smAt = (M, t) => { const x = clamp(t * SHZ, 0, M.n - 1.001), k = Math.floor(x), f = x - k, P = M.P, j = 3 * k; return [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f]; };
  const smFw = DEF.smFw = (M, t) => { const x = clamp(t * SHZ, 0, M.n - 1.001), k = Math.floor(x), f = x - k, P = M.FW, j = 3 * k; return V.norm([P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f]); };
  const smV = (M, t) => { const x = clamp(t * SHZ, 0, M.n - 1.001), k = Math.floor(x); return M.SP[k] + (M.SP[k + 1] - M.SP[k]) * (x - k); };
  DEF.smX = (M, t) => { const fw = smFw(M, t); return X.make(R.look(fw, V.cross(fw, M.lat)), smAt(M, t)); };
  DEF.smSpeed = smV;

  /* hatches: open over ~0.9 s before the launch, shut ~4 s after it */
  DEF.vlsOpen = s => {
    const o = [];
    for (const M of SM6) { const f = ss(M.tOpen, M.tOpen + .9, s) * (1 - ss(M.tL + 4, M.tL + 5.2, s)); if (f > .001) o.push([M.cell, f]); }
    return o;
  };

  /* ---- debris sets: seeded, flung with drag; each piece's splash found once here ---- */
  function frags(n, seed, p0, s0, o) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const h1 = hash(k, seed), h2 = hash(k + 3, seed), h3v = hash(k + 7, seed), h4 = hash(k + 11, seed);
      const az = h1 * TAU, el = mix(-.5, 1.1, h2), sp = mix(o.s0, o.s1, h3v);
      const v0 = V.add(V.mul(o.fwd, mix(o.f0, o.f1, h4)), [Math.cos(az) * Math.cos(el) * sp, Math.sin(el) * sp + o.up, Math.sin(az) * Math.cos(el) * sp]);
      const tau = mix(o.t0, o.t1, hash(k + 17, seed));
      let tw = o.life;
      for (let a = 1 / 60; a < o.life; a += 1 / 60) { const q = V.add(p0, flung(v0, tau, a)); if (q[1] <= swell(q[0], q[2], s0 + a)) { tw = a; break; } }
      const pw = V.add(p0, flung(v0, tau, tw));
      out.push({ v0, tau, tw, pw, burn: hash(k + 23, seed) < o.burn, H: mix(o.h0, o.h1, hash(k + 29, seed)), sd: k * 3.7 + seed });
    }
    return out;
  }
  const fragAt = (F, p0, a) => V.add(p0, flung(F.v0, F.tau, a));

  /* ---- intercepts far out (rounds 1 and 2) ---- */
  const INT = DEF.INT = SM6.map((M, i) => {
    const r = OD.round(M.tgt, M.tI), fwd = V.mul(r.f, VR), vm = V.mul(V.norm(M.vEnd), 1);
    const I = { p: M.PI, t: M.tI, f: r.f, M, seed: 40 + i * 17 };
    I.frags = frags(22, I.seed, I.p, I.t, { fwd: V.norm(V.add(r.f, V.mul(vm, .35))), f0: 180, f1: 520, s0: 30, s1: 150, up: 25, t0: .7, t1: 2.4, life: 9, burn: .35, h0: 6, h1: 16 });
    // the round's own wreck: carried on toward the ship, down into the sea
    I.wreck = frags(1, I.seed + 5, I.p, I.t, { fwd: r.f, f0: 560, f1: 560, s0: 0, s1: 0, up: -6, t0: .6, t1: .6, life: 6, burn: 1, h0: 38, h1: 38 })[0];
    return I;
  });

  /* ---- Phalanx (forward mount) ----
     slews at ~80 s from its stow onto round 3, spins up, fires two bursts (4 500 rds/min), round 3 bursts ~500 m
     out at its stop time. Each tracer is a dash flown from its own firing time; misses plunge into the sea. */
  // round 4, from the SSE, is only picked up in its last second: the mount swings round onto it, spins up and gets
  // off a short burst that trails behind it (tracking lag, no lead) as it goes into the hull
  const R4 = { slew: [S_HIT - 1.35, S_HIT - .62], spin: [S_HIT - 1.1, S_HIT - .5, S_HIT + .5, S_HIT + 3], burst: [S_HIT - .46, S_HIT + .03], lag: .07 };
  const CW = DEF.CW = { slew: [79.4, 81.5], bursts: [[86.0, 87.35], [87.75, STOP[2] + .02], R4.burst], spin: [84.3, 85.9, STOP[2] + .25, 92.8], R4, ROF: 75, V0: 1100, DR: 4, W: 75 * TAU, life: 2.6 };
  const PIV = V.lerp(DA.ciws({ ciwsYaw: [0], ciwsPitch: [0] }, 0), DA.ciws({ ciwsYaw: [PI], ciwsPitch: [0] }, 0), .5);
  const bulletS = a => CW.V0 * CW.DR * (1 - Math.exp(-a / CW.DR));
  const tofTo = d => { const q = 1 - d / (CW.V0 * CW.DR); return q <= .05 ? 12 : -CW.DR * Math.log(q); };
  // aim (ship-local yaw / pitch) at the point where round 3 will be when a round fired at s gets there
  function aimAt(s) {
    const Xs = OD.shipXf(A, s), m = X.ap(Xs, PIV);
    let p = OD.round(2, s).p, tf = 0;
    for (let i = 0; i < 4; i++) { tf = Math.min(3.5, tofTo(V.dist(p, m))); p = OD.round(2, s + tf).p; }
    const l = V.sub(invAp(Xs, [p[0], p[1] + 4.9 * tf * tf, p[2]]), PIV);
    return { yaw: Math.atan2(l[0], l[2]), pitch: Math.atan2(l[1], Math.hypot(l[0], l[2])) };
  }
  const AIM_END = aimAt(STOP[2] - .05);
  function aim4(s) {
    const Xs = OD.shipXf(A, s), p = OD.round(3, Math.min(s, S_HIT) - R4.lag).p;
    const l = V.sub(invAp(Xs, p), PIV);
    return { yaw: Math.atan2(l[0], l[2]), pitch: Math.atan2(l[1], Math.hypot(l[0], l[2])) };
  }
  const AIM4_END = aim4(S_HIT);
  // spin: barrel speed ramps, integrated once
  const SPN = { s0: CW.spin[0] - .1, hz: 480 };
  {
    const [a, b, c, d] = CW.spin, [a4, b4, c4, d4] = R4.spin, N = Math.ceil((d4 + .2 - SPN.s0) * SPN.hz);
    SPN.tab = new Float64Array(N + 1);
    const om = s => CW.W * (ss(a, b, s) * (1 - ss(c, d, s)) + ss(a4, b4, s) * (1 - ss(c4, d4, s)));
    for (let k = 1; k <= N; k++) { const s0 = SPN.s0 + (k - 1) / SPN.hz, s1 = s0 + 1 / SPN.hz; SPN.tab[k] = SPN.tab[k - 1] + (om(s0) + om(s1)) * .5 / SPN.hz; }
    SPN.om = om; SPN.N = N;
  }
  const spinAt = s => { const x = clamp((s - SPN.s0) * SPN.hz, 0, SPN.N - .001), k = Math.floor(x); return SPN.tab[k] + (SPN.tab[k + 1] - SPN.tab[k]) * (x - k); };
  DEF.omega = s => SPN.om(s);
  DEF.ciwsAt = s => {
    const e = sm5((s - CW.slew[0]) / (CW.slew[1] - CW.slew[0])) * (1 - sm5((s - 125) / 4));
    let yaw = 0, pitch = .35;
    if (e > 0) {
      let a = s < STOP[2] - .05 ? aimAt(s) : AIM_END;
      const e4 = sm5((s - R4.slew[0]) / (R4.slew[1] - R4.slew[0]));
      if (e4 > 0) { const b = s < S_HIT ? aim4(s) : AIM4_END; a = { yaw: mix(a.yaw, b.yaw, e4), pitch: mix(a.pitch, b.pitch, e4) }; }
      yaw = mix(0, a.yaw, e); pitch = mix(.35, a.pitch, e);
    }
    return { yaw, pitch, spin: spinAt(s) };
  };
  const ciwsSt = s => { const c = DEF.ciwsAt(s); return { ciwsYaw: [c.yaw, PI], ciwsPitch: [c.pitch, .35], ciwsSpin: c.spin }; };
  DEF.ciwsSt = ciwsSt;
  DEF.firing = s => { for (const [a, b] of CW.bursts) if (s >= a && s <= b) return true; return false; };
  const RNDS = DEF.RNDS = [];
  for (let bI = 0; bI < CW.bursts.length; bI++) {
    const [b0, b1] = CW.bursts[bI];
    for (let k = 0; b0 + k / CW.ROF <= b1; k++) {
      const tk = b0 + k / CW.ROF, st = ciwsSt(tk), Xs = OD.shipXf(A, tk);
      const m = X.ap(Xs, DA.ciws(st, 0)), d0 = V.norm(X.dir(Xs, DA.ciwsDir(st, 0))), [U, Vv] = GEO.perp(d0);
      const du = (hash(k, bI + 1) - .5) * .006 + .0025 * M3.noise(tk * 2.7, 1.3), dv = (hash(k + 7, bI + 5) - .5) * .006 + .0025 * M3.noise(tk * 2.7, 6.1);
      const r = { tk, m, d: V.norm(V.add(d0, V.add(V.mul(U, du), V.mul(Vv, dv)))), vS: shipVel(tk), k };
      r.aw = CW.life + 1;
      for (let a = .02; a < CW.life + 1; a += .01) { const q = bulletAt(r, a); if (q[1] <= swell(q[0], q[2], tk + a) + .2) { r.aw = a; r.pw = q; break; } }
      RNDS.push(r);
    }
  }
  // gun smoke: a puff every 1/12 s of firing, laid at the muzzle
  CW.smoke = [];
  for (let bI = 0; bI < CW.bursts.length; bI++) {
    const [b0, b1] = CW.bursts[bI];
    for (let j = 0; b0 + j / 12 <= b1; j++) { const t0 = b0 + j / 12; CW.smoke.push({ t0, m: X.ap(OD.shipXf(A, t0), DA.ciws(ciwsSt(t0), 0)), h1: hash(j, bI) - .5, h2: hash(j + 3, bI) - .5 }); }
  }
  function bulletAt(r, a) { const sd = bulletS(a); return [r.m[0] + r.d[0] * sd + r.vS[0] * a, r.m[1] + r.d[1] * sd - 4.9 * a * a, r.m[2] + r.d[2] * sd + r.vS[2] * a]; }
  DEF.bulletAt = bulletAt;

  /* ---- round 3's burst, ~500 m off the starboard bow ---- */
  const B3 = DEF.B3 = (() => {
    const r = OD.round(2, STOP[2]), B = { p: r.p, t: STOP[2], f: r.f, seed: 91 };
    B.frags = frags(38, 91, B.p, B.t, { fwd: r.f, f0: 200, f1: 600, s0: 25, s1: 140, up: 18, t0: .35, t1: 1.6, life: 8, burn: .3, h0: 4, h1: 12 });
    B.wreck = frags(1, 97, B.p, B.t, { fwd: r.f, f0: 610, f1: 610, s0: 0, s1: 0, up: 6, t0: .42, t1: .42, life: 6, burn: 1, h0: 26, h1: 26 })[0];
    B.cen = a => V.add(B.p, V.add(V.mul(r.f, VR * .2 * (1 - Math.exp(-a / .2))), [WIND[0] * a, 1.2 * a, WIND[2] * a]));
    return B;
  })();

  /* ---------------- drawing ---------------- */
  // spray thrown up where something hits the water: sheets of droplets on ballistic arcs, a ring on the swell
  function spout(W, b, age, H, sd, al, s) {
    if (age < 0) return;
    const v0 = Math.sqrt(2 * GV * H), Tu = v0 / GV, A0 = al * Math.exp(-age / (.6 + 1.4 * Tu));
    if (A0 < .008) return;
    for (let i = 0; i < 9; i++) {
      const th = (i + hash(sd, i)) / 9 * TAU, c = .55 + .45 * hash(i, sd + 3), o = (.06 + .2 * hash(sd + i, 5)) * v0;
      const vx = Math.cos(th) * o, vz = Math.sin(th) * o, vy = v0 * c;
      const at = a => [b[0] + vx * a, b[1] + Math.max(-.3, vy * a - 4.9 * a * a), b[2] + vz * a];
      const a1 = age, a0 = Math.max(0, age - .4 * Tu - .12);
      if (vy * a0 - 4.9 * a0 * a0 < -.3) continue;
      W.seg(at(a0), at(a1), A0 * (.45 + .4 * c));
    }
    const y = swell(b[0], b[2], s) + .15, rr = .25 * H + 2 + 4.5 * age;
    W.ring([b[0], y, b[2]], [1, 0, 0], [0, 0, 1], rr, 22, .35 * A0);
    if (age > .3) W.ring([b[0], y, b[2]], [1, 0, 0], [0, 0, 1], rr * .55, 16, .2 * A0);
  }
  // a hairline fireball edge: a wobbling circle facing the lens
  function ball(W, cam, c, r, al, sd, tt) {
    if (al < .006 || r <= 0) return;
    const U = cam.r, Vv = cam.u, n = 30;
    let pv = null;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a), rr = r * (1 + .24 * M3.noise(ca * 1.6 + sd, sa * 1.6, tt));
      const q = [c[0] + (U[0] * ca + Vv[0] * sa) * rr, c[1] + (U[1] * ca + Vv[1] * sa) * rr, c[2] + (U[2] * ca + Vv[2] * sa) * rr];
      if (pv) W.seg(pv, q, al);
      pv = q;
    }
  }
  // debris: bright streaks while they fly, smoke threads behind the burning ones, spray where they land
  function drawFrags(W, cam, list, p0, age, s, al, big) {
    for (const F of list) {
      if (age < F.tw) {
        const p = fragAt(F, p0, age), q = fragAt(F, p0, Math.max(0, age - (big ? .035 : .05)));
        W.seg(q, p, al * (.35 + .6 * Math.exp(-age / .5)));
        if (F.burn) {
          let pv = p;
          for (let k = 1; k <= 9; k++) {
            const aa = age - k * .09; if (aa < 0) break;
            const lay = fragAt(F, p0, aa), dr = k * .09, w = [lay[0] + WIND[0] * dr, lay[1] + .6 * dr, lay[2] + WIND[2] * dr];
            W.seg(pv, w, al * .32 * (1 - k / 10));
            pv = w;
          }
        }
      } else spout(W, F.pw, age - F.tw, F.H, F.sd, al * .8, s);
    }
  }
  // a smoke puff's edge: a gently wobbling contour facing the lens; huge ones close to the lens thin out
  function billow(W, cam, c, r, al, sd, tt) {
    const d = V.dist(c, cam.eye), rpx = r * cam.fl / Math.max(.5, d);
    al *= 1 - ss(200, 520, rpx);
    if (al < .006 || rpx < 1.2) return;
    wring(W, c, cam.r, cam.u, r, clamp(Math.round(rpx / 3), 10, 36), al, al, sd, tt, .16, null);
  }
  // a wobbling ring in the plane (U, V): smoke cross-sections, spreading rings on the deck or the water;
  // with an eye, the stretch facing away is fainter (ab)
  function wring(W, c, U, Vv, r, n, af, ab, sd, tt, wob, eye) {
    let pv = null, pa = af;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const rr = r * (1 + wob * M3.noise(ca * 1.2 + sd, sa * 1.2, tt) + wob * .35 * M3.noise(ca * 2.9 + sd, sa * 2.9, tt * 1.6));
      const nx = U[0] * ca + Vv[0] * sa, ny = U[1] * ca + Vv[1] * sa, nz = U[2] * ca + Vv[2] * sa;
      const q = [c[0] + nx * rr, c[1] + ny * rr, c[2] + nz * rr];
      const al = eye ? (nx * (eye[0] - q[0]) + ny * (eye[1] - q[1]) + nz * (eye[2] - q[2]) > 0 ? af : ab) : af;
      if (pv) W.seg(pv, q, (al + pa) * .5);
      pv = q; pa = al;
    }
  }
  Object.assign(DEF, { billow, wring, ball, spout, seaY });
  // lingering smoke puffs: a cluster of billows, drifting downwind, swelling, thinning
  function puffCloud(W, cam, c, age, n, r0, g, al, sd, life) {
    for (let k = 0; k < n; k++) {
      const o = [(hash(k, sd) - .5) * 2, (hash(k + 4, sd) - .5) * 1.2, (hash(k + 8, sd) - .5) * 2];
      const r = r0 * (.6 + .5 * hash(k + 2, sd)) + g * Math.sqrt(age);
      const p = [c[0] + o[0] * r * .8 + WIND[0] * age, c[1] + o[1] * r * .6 + .5 * age, c[2] + o[2] * r * .8 + WIND[2] * age];
      billow(W, cam, p, r, al * Math.exp(-age / life) * ss(0, .5, age), sd + k * 1.7, age * .35);
    }
  }

  const NOZ = HD.sm6.NOZZLES, BST0 = HD.sm6.BOOSTER[0], SUST = HD.sm6.SUSTAINER;
  // the Mk 72's four jets merging into one flame, a tongue a few missile-lengths long
  function smPlume(W, Xm, fw, t, al, fk, room) {
    const boost = t < T_SEP, back = V.mul(fw, -1), [U, Vv] = GEO.perp(fw);
    // the flame ends on the deck while the missile is low over it
    const Lr = room / Math.max(.3, -back[1]), L = Math.min(Lr, (boost ? 17 + 5 * hash(fk, 3) : 7 + 2 * hash(fk, 3)));
    const c0 = X.ap(Xm, boost ? [0, 0, BST0 - .2] : SUST);
    W.style(HOT, 1);
    if (boost) for (const q of NOZ) { const w = X.ap(Xm, q); W.seg(w, V.mad(w, back, 1.6 + 1.2 * hash(fk, 1)), .9 * al); }
    const R0 = boost ? .3 : .12, R1 = boost ? .75 : .3;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + fk * .41, dd = V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a)));
      const r1 = R1 * (.8 + .4 * hash(fk + i, 7));
      const q0 = V.mad(c0, dd, R0), q1 = V.mad(V.mad(c0, back, L * .28), dd, r1), q2 = V.mad(V.mad(c0, back, Math.min(Lr, L * (.85 + .3 * hash(i, fk)))), dd, .08);
      W.seg(q0, q1, .45 * al); W.seg(q1, q2, .22 * al);
    }
    for (let k = 0; k < 5; k++) W.ring(V.mad(c0, back, .9 + k * L * .12), U, Vv, R0 * (1.1 + k * .35), 14, .5 * al * (1 - k / 6));
    W.seg(c0, V.mad(c0, back, Math.min(Lr, L * 1.25)), .85 * al);
    W.style(WHC, 1);
  }
  // laid smoke: each point stays where it was laid, then drifts downwind, spreads and thins
  function smTrail(W, cam, M, s, alA) {
    alA *= 1 - ss(M.tL + M.Tf + 25, M.tL + M.Tf + 40, s);
    if (alA <= .004) return;
    const tt = Math.min(s - M.tL, M.Tf), e = cam.eye, fl = cam.fl;
    if (tt <= M.tClear) return;
    let tau = M.tClear, n = 0, last = false;
    let pl = null, pr = null, pc = null, pa = 0, nb = 0;
    while (true) {
      if (n >= 700) tau = tt;
      if (tau >= tt) { tau = tt; last = true; }
      const p0 = smAt(M, tau), age = s - M.tL - tau, hk = 1 + p0[1] / 1500;
      const p = [p0[0] + WIND[0] * age * hk, p0[1] + .7 * Math.sqrt(age), p0[2] + WIND[2] * age * hk];
      const fw = smFw(M, tau), toC = V.sub(e, p), dist = V.len(toC);
      let sd = V.cross(fw, toC); const sl = V.len(sd); sd = sl > 1e-6 ? V.mul(sd, 1 / sl) : M.lat;
      const thick = tau < 1.4 ? 1.2 * (1.4 - tau) : 0;
      const r = .45 + thick + 1.9 * Math.sqrt(age), wob = r * .4;
      const nA = M3.noise(tau * 2.3 + M.seed, age * .16, 1.3), nB = M3.noise(tau * 2.3 + M.seed, age * .16, 4.7), nC = M3.noise(tau * 3.1 + M.seed, age * .2, 8.1);
      const L = V.mad(p, sd, -r + wob * nA), Rr = V.mad(p, sd, r + wob * nB), Cc = V.mad(p, sd, r * .5 * nC);
      const a = alA * .62 * Math.exp(-age / 38) * (tau < T_SEP ? 1 : .55) * ss(0, .05, age) * (1 - ss(300, 900, r * fl / Math.max(1, dist)));
      if (pl) { const am = (a + pa) * .5; W.seg(pl, L, am * .55); W.seg(pr, Rr, am * .55); W.seg(pc, Cc, am * .3); }
      // cross-sections of the dense low column: wobbling rings about the trail
      if (tau < 2.6 && tau >= nb * .085 + M.tClear) {
        nb++;
        const rpx = r * fl / Math.max(1, dist);
        if (rpx > 3) { const [U, Vv] = GEO.perp(fw); wring(W, V.mad(p, sd, r * .25 * nC), U, Vv, r * (.8 + .25 * hash(nb, M.seed)), clamp(Math.round(rpx / 3), 10, 30), a * .34, a * .12, M.seed * 11 + nb * 2.3, age * .4, .2, e); }
      }
      pl = L; pr = Rr; pc = Cc; pa = a; n++;
      if (last) break;
      tau += Math.max(.008, Math.min(.25, (dist * 9 / fl + .03) / Math.max(15, smV(M, tau))));
    }
  }
  function drawSM6(W, cam, s, st) {
    const e = cam.eye, fk = Math.floor(s * 60);
    for (const M of SM6) {
      const t = s - M.tL;
      if (t < -.001 || t > M.Tf + 40) continue;
      smTrail(W, cam, M, s, 1);
      // the launch cloud rolling out of the cell (world-fixed: the ship steams out from under it)
      for (const P of M.puffs) {
        const a = t - P.t0; if (a <= 0 || a > 16) continue;
        const q = V.add(M.hatch, [P.v[0] * 1.3 * (1 - Math.exp(-a / 1.3)) + WIND[0] * a, P.v[1] * 1.3 * (1 - Math.exp(-a / 1.3)) + .9 * a, P.v[2] * 1.3 * (1 - Math.exp(-a / 1.3)) + WIND[2] * a]);
        billow(W, cam, q, P.r0 + 2.6 * Math.sqrt(a), .26 * Math.exp(-a / 4.5) * ss(0, .1, a), P.sd, a * .6);
      }
      for (let k = 0; k < 4; k++) {
        const a = t - k * .16; if (a <= 0 || a > 7) continue;
        const q = [M.hatch[0] + WIND[0] * a, M.hatch[1] + .4 + 1.3 * a, M.hatch[2] + WIND[2] * a];
        const r = 1.5 + 10 * (1 - Math.exp(-a / .9)) + 1.4 * a, rpx = r * cam.fl / Math.max(1, V.dist(q, e));
        if (rpx > 3) wring(W, q, [1, 0, 0], [0, 0, 1], r, clamp(Math.round(rpx / 3), 12, 40), .3 * Math.exp(-a / 2.2) * ss(0, .06, a), .12 * Math.exp(-a / 2.2), M.seed + k * 4.1, a * .8, .22, e);
      }
      // the uptake vents the cell's exhaust while the missile is still inside
      if (t < M.tClear + .45) {
        const Xs = OD.shipXf(A, s), u = X.ap(Xs, M.uptakeL), up = X.dir(Xs, [0, 1, 0]), fz = X.dir(Xs, [0, 0, 1]);
        const k = ss(0, .04, t) * (1 - ss(M.tClear, M.tClear + .45, t));
        W.style(HOT, 1);
        for (let i = 0; i < 7; i++) { const z = (i / 6 - .5) * 2.6, hgt = (2.5 + 5 * hash(fk + i, 3)) * k; const b0 = V.mad(u, fz, z); W.seg(b0, V.mad(V.mad(b0, up, hgt), fz, (hash(i, fk) - .5) * 1.2), .75 * k); }
        W.style(WHC, 1);
      }
      if (t < 0 || t >= M.Tf) continue;
      const Xm = DEF.smX(M, t), p = Xm.T, fw = smFw(M, t), d = V.dist(p, e), px = 6.55 * cam.fl / d;
      // still in the cell: only what has come out of the hatch shows (the deck hides the rest)
      const hN = t < 2 ? X.ap(OD.shipXf(A, s), M.hatchL) : null, out = hN ? ss(.5, .85, (p[1] + 3.28 - hN[1]) / 6.55) : 1;
      if (px > 1.4 && out > 0) {
        W.fog = [Math.max(30, d * .55), d * 2.4 + 700];
        FAST.draw(W, px > 90 ? DEF.C.sm : DEF.C.smF, Xm, { booster: t < T_SEP }, { fine: px > 90, a: ss(1.4, 8, px) * out });
        W.fog = [1e8, 2e8];
      }
      if (hN && t < 1.6) {
        // flame out of the cell mouth while the missile clears it, then the jet splashing on the deck
        const Xs = OD.shipXf(A, s), up = X.dir(Xs, [0, 1, 0]), ax = X.dir(Xs, [1, 0, 0]), az = X.dir(Xs, [0, 0, 1]);
        const hb = p[1] - 3.48 - hN[1], k = ss(0, .03, t) * (1 - ss(1.1, 1.6, t));
        W.style(HOT, 1);
        if (t < M.tClear + .1) for (let i = 0; i < 9; i++) {
          const th = i / 9 * TAU + fk, b0 = V.add(hN, V.add(V.mul(ax, Math.cos(th) * .32), V.mul(az, Math.sin(th) * .32)));
          W.seg(b0, V.mad(V.add(b0, V.add(V.mul(ax, Math.cos(th) * .5), V.mul(az, Math.sin(th) * .5))), up, 1.5 + 3.5 * hash(fk + i, 5)), .8 * k);
        }
        const kd = k * (1 - ss(2, 16, hb));
        if (kd > .01) for (let i = 0; i < 16; i++) {
          const th = (i + hash(i, fk)) / 16 * TAU, l = (1.2 + 2.6 * hash(fk + 1, i)) * (.5 + .5 * sat(t / .4)), h = .4 + 1.4 * hash(i, fk + 3);
          const dd = V.add(V.mul(ax, Math.cos(th)), V.mul(az, Math.sin(th))), m0 = V.mad(hN, up, .15), m1 = V.mad(V.mad(hN, dd, l * .6), up, .25), m2 = V.mad(V.mad(hN, dd, l), up, h);
          W.seg(m0, m1, .55 * kd); W.seg(m1, m2, .3 * kd);
        }
        W.style(WHC, 1);
      }
      if (d < 700 && t > M.tClear - .05) smPlume(W, Xm, fw, t, ss(700, 250, d), fk, hN ? Math.max(.2, p[1] - 3.48 - hN[1]) : 1e9);
      if (d > 150) {
        W.style(HOT, 1);
        const Ls = (t < T_SEP ? 26 : 12) * Math.max(1, d / 2500);
        W.seg(V.mad(p, fw, -Ls - 3), V.mad(p, fw, -3), .9 * ss(150, 400, d));
        W.style(WHC, 1);
      }
      // booster separation: a puff, the spent Mk 72 tumbling down
      const as = t - T_SEP;
      if (as > 0 && as < 14) {
        const ps = smAt(M, T_SEP), vs = V.mul(smFw(M, T_SEP), smV(M, T_SEP) * .9), q = V.add(ps, flung(vs, 2.5, as));
        puffCloud(W, cam, ps, as, 3, 5, 5, .25, M.seed + 50, 5);
        const ax = [Math.cos(as * 9), Math.sin(as * 9) * .6, Math.sin(as * 7)];
        W.seg(V.mad(q, ax, -1), V.mad(q, ax, 1), .5 * ss(0, .2, as) * (1 - as / 14));
      }
    }
  }
  function drawIntercepts(W, cam, s) {
    for (const I of INT) {
      const a = s - I.t;
      if (a < 0 || a > 45) continue;
      W.style(HOT, 1);
      if (a < .14) for (let k = 0; k < 7; k++) {
        const th = (k + .8 * hash(k, I.seed)) / 7 * TAU, l = (30 + 80 * hash(k + 3, I.seed)) * (1 - a / .14), l0 = 12 + 10 * hash(k, 9);
        const d = V.add(V.mul(cam.r, Math.cos(th)), V.mul(cam.u, Math.sin(th)));
        W.seg(V.mad(I.p, d, l0), V.mad(I.p, d, l0 + l), .7 * (1 - a / .14));
      }
      W.style(WHC, 1);
      if (a < 1.6) {
        W.disc(I.p, 30 + 290 * (1 - Math.exp(-a / .4)), 48, .6 * Math.pow(1 - a / 1.6, 1.6));
        if (a < .9) W.disc(I.p, 16 + 120 * (1 - Math.exp(-a / .22)), 32, .45 * Math.pow(1 - a / .9, 2));
      }
      if (a < 2.4) for (let k = 0; k < 4; k++) ball(W, cam, V.add(I.p, V.mul(I.f, 80 * (1 - Math.exp(-a / .3)))), (18 + 52 * (1 - Math.exp(-a / .35))) * (1 - k * .2), .5 * Math.pow(1 - a / 2.4, 1.4) * (k ? .75 : 1), I.seed + k * 3, a * 2);
      drawFrags(W, cam, I.frags, I.p, a, s, .7, false);
      const Wr = I.wreck;
      if (a < Wr.tw) W.seg(fragAt(Wr, I.p, Math.max(0, a - .05)), fragAt(Wr, I.p, a), .8);
      else spout(W, Wr.pw, a - Wr.tw, Wr.H, Wr.sd, .8, s);
      puffCloud(W, cam, V.add(I.p, V.mul(I.f, 80)), a, 8, 26, 17, .32 * (1 - ss(32, 45, a)), I.seed + 9, 16);
    }
  }
  function drawCIWS(W, cam, s, rate) {
    if (s < CW.bursts[0][0] - .1 || s > CW.bursts[CW.bursts.length - 1][1] + CW.life + 2) return;
    const e = cam.eye, fk = Math.floor(s * CW.ROF);
    // tracers; in the slow motion the dashes shorten (less smear per frame)
    const dash = .018 * clamp(.35 + .65 * rate, .35, 1);
    W.style(HOT, 1.4);
    for (const r of RNDS) {
      const a = s - r.tk;
      if (a <= 0 || a > r.aw || a > CW.life) continue;
      const p = bulletAt(r, a), q = bulletAt(r, Math.max(0, a - dash));
      W.seg(q, p, (1 - Math.pow(a / CW.life, 2)) * ss(0, .008, a));
    }
    W.style(WHC, 1);
    for (const r of RNDS) { const a = s - r.tk - r.aw; if (a < 0 || a > 2.2 || !r.pw) continue; spout(W, r.pw, a, 2.2 + 2 * hash(r.k, 3), r.k * 1.3, .55, s); }
    // muzzle: a flickering star while it fires, spin blur, the gun smoke streaming aft
    const Xs = OD.shipXf(A, s), st = ciwsSt(s), m = X.ap(Xs, DA.ciws(st, 0)), d = V.norm(X.dir(Xs, DA.ciwsDir(st, 0))), [U, Vv] = GEO.perp(d);
    if (DEF.firing(s)) {
      W.style(HOT, 1);
      for (let i = 0; i < 6; i++) {
        const th = (i + hash(fk, i)) / 6 * TAU, sp = .25 + .35 * hash(i, fk + 1), l = .5 + 1.3 * hash(fk + 2, i);
        const dd = V.norm(V.add(d, V.add(V.mul(U, Math.cos(th) * sp), V.mul(Vv, Math.sin(th) * sp))));
        W.seg(V.mad(m, d, .05), V.mad(m, dd, l), .8);
      }
      W.seg(m, V.mad(m, d, 1.6 + 1.4 * hash(fk, 9)), .9);
      W.style(WHC, 1);
    }
    const om = SPN.om(s);
    if (om > 30) {
      const k = ss(30, 300, om);
      for (const z of [.05, .45, .9, 1.3]) W.ring(V.mad(m, d, -z), U, Vv, .15, 14, .3 * k);
    }
    for (const P of CW.smoke) {
      const a = s - P.t0; if (a <= 0 || a > 4) continue;
      const q = [P.m[0] + WIND[0] * a + P.h1 * 2 * a, P.m[1] + .5 * a, P.m[2] + WIND[2] * a + P.h2 * 2 * a];
      billow(W, cam, q, .2 + .7 * Math.sqrt(a), .16 * Math.exp(-a / 1.1), P.t0 * 13.1, a);
    }
  }
  function drawB3(W, cam, s) {
    const a = s - B3.t;
    if (a < 0 || a > 40) return;
    const c = B3.cen(a), sy = swell(B3.p[0], B3.p[2], s);
    W.style(HOT, 1);
    if (a < .11) for (let k = 0; k < 7; k++) {
      const th = (k + .8 * hash(k, B3.seed)) / 7 * TAU, l = (5 + 16 * hash(k + 3, B3.seed)) * (1 - a / .11), l0 = 2.5 + 3 * hash(k, 7);
      const d = V.add(V.mul(cam.r, Math.cos(th)), V.mul(cam.u, Math.sin(th)));
      W.seg(V.mad(B3.p, d, l0), V.mad(B3.p, d, l0 + l), .6 * (1 - a / .11));
    }
    W.style(WHC, 1);
    if (a < .7) W.disc(B3.p, 10 + 340 * a, 48, .45 * Math.pow(1 - a / .7, 2));
    if (a < 1.4) W.ring([B3.p[0], sy + .2, B3.p[2]], [1, 0, 0], [0, 0, 1], 8 + 95 * (1 - Math.exp(-a / .35)), 48, .4 * Math.pow(1 - a / 1.4, 1.5));
    // the fireball, carried on along the round's line, then its smoke
    if (a < 2.6) for (let k = 0; k < 4; k++) ball(W, cam, c, (3 + 20 * (1 - Math.exp(-a / .3))) * (1 - k * .2), .6 * Math.pow(1 - a / 2.6, 1.3) * (k ? .7 : 1), B3.seed + k * 5, a * 2.4);
    drawFrags(W, cam, B3.frags, B3.p, a, s, .8, true);
    const Wr = B3.wreck;
    if (a < Wr.tw) {
      const p = fragAt(Wr, B3.p, a);
      W.seg(fragAt(Wr, B3.p, Math.max(0, a - .04)), p, .9);
      let pv = p; for (let k = 1; k <= 12; k++) { const aa = a - k * .05; if (aa < 0) break; const w = V.add(fragAt(Wr, B3.p, aa), [WIND[0] * k * .05, .8 * k * .05, WIND[2] * k * .05]); W.seg(pv, w, .5 * (1 - k / 13)); pv = w; }
    } else spout(W, Wr.pw, a - Wr.tw, Wr.H, Wr.sd, .9, s);
    puffCloud(W, cam, c, a, 8, 5, 5.5, .34 * (1 - ss(28, 40, a)), B3.seed + 9, 14);
  }
  DEF.draw = function (W, cam, T, s) {
    if (s < 55 || s > 140) return;
    W.fog = [1e8, 2e8];
    drawSM6(W, cam, s);
    drawIntercepts(W, cam, s);
    drawCIWS(W, cam, s, OD.SIM.rate(T));
    drawB3(W, cam, s);
    W.style(WHC, 1);
  };
  /* additive glows {p, a, m (radius m), px (min px), max} */
  DEF.glows = function (s) {
    const G = [];
    if (s < 55 || s > 140) return G;
    const Xs = OD.shipXf(A, s);
    for (const M of SM6) {
      const t = s - M.tL;
      if (t >= 0 && t < .9) G.push({ p: X.ap(Xs, M.hatchL), a: .55 * (1 - t / .9) * ss(0, .03, t), m: 5, px: 8, max: 120 });
      if (t >= 0 && t < M.tClear + .45) G.push({ p: X.ap(Xs, M.uptakeL), a: .3 * (1 - ss(M.tClear, M.tClear + .45, t)), m: 4, px: 6, max: 90 });
      if (t > 0 && t < M.Tf) {
        const q = smAt(M, t), hy = t < 2 ? X.ap(Xs, M.hatchL)[1] : -1e9, p = V.mad(q, smFw(M, t), -Math.max(0, Math.min(6, q[1] - hy - 3.3)) - 3.3);
        const boost = t < T_SEP, fl = .85 + .15 * M3.noise(s * 31, M.seed);
        if (q[1] - 3.3 > hy) G.push({ p, a: (boost ? .5 : .36) * fl * ss(0, .1, t), m: boost ? 9 : 5, px: boost ? 5 : 4.5, max: 110 });
      }
    }
    for (const I of INT) { const a = s - I.t; if (a >= 0 && a < 3) G.push({ p: I.p, a: .9 * Math.exp(-a / .18) + .14 * Math.exp(-a / 1.1), m: 190, px: 9, max: 170 }); }
    if (DEF.firing(s)) G.push({ p: X.ap(Xs, DA.ciws(ciwsSt(s), 0)), a: .22 * (.6 + .4 * M3.noise(s * 47, 2.2)), m: 1.2, px: 5, max: 70 });
    const a3 = s - B3.t;
    if (a3 >= 0 && a3 < 4) G.push({ p: B3.cen(a3), a: 1 * Math.exp(-a3 / .1) + .22 * Math.exp(-a3 / .7), m: 34, px: 12, max: 240 });
    return G;
  };
  DEF.puffCloud = puffCloud;
  DEF.C = { sm: FAST.compile(OD.MOD.sm6(), { fine: true }), smF: FAST.compile(OD.MOD.sm6(), { fine: false }) };
})();
