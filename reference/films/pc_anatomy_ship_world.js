/* ANATOMY · SHIP (Point Cloud C): the naval harbour at night as point sets, and the ship's route.
   World frame: metres, X east, Y up (0 = sea level), Z north. The berth: the destroyer's
   centreline on x = 0, midships at z = 0, bow north, port side to the east face of pier 1.
   A basin 2.4 km wide behind two rubble breakwaters (entrance 540 m wide at z = 1150), the
   port apron and its sheds along the south quay, hills rising behind. */
(function () {
  const { V, E, rng, fbm, noise } = M3;
  const PI = Math.PI, TAU = 2 * PI;

  /* ---------- coast ---------- */
  const QUAY_Z = -160;
  const westX = z => -1150 - (z > 1250 ? (z - 1250) * 1.1 : 0) + 90 * noise(z / 380, 3.1);
  const eastX = z => 1300 + (z > 950 ? (z - 950) * 1.6 : 0) + 110 * noise(z / 420, 7.7);
  /* inland distance from the shore (<= 0 at sea) */
  function landDist(x, z) { return Math.max(QUAY_Z - z, westX(z) - x, x - eastX(z)); }
  /* ground height (<= 0 at sea); the apron behind the quay is a level 3 m platform */
  function landH(x, z) {
    const d = landDist(x, z); if (d <= 0) return -1;
    const apron = (QUAY_Z - z) > 0 && x > -1080 && x < 1230 ? E.ss(240, 420, QUAY_Z - z) : 1;
    const xk = x / 1000, zk = z / 1000;
    const hill = 175 * (1 - Math.exp(-Math.max(0, d - 60) / 1100)) * (.55 + .45 * fbm(xk * .7 + 3.3, zk * .7 - 1.2, 2.1, 4));
    const rough = 6 * fbm(xk * 4.1, zk * 4.1, 7.7, 3) + 1.4 * fbm(xk * 30, zk * 30, 5.5, 2);
    const shoreline = Math.min(1, d / 40);
    return 3 * (1 - apron) + apron * (Math.max(1, (hill + rough) * shoreline));
  }

  /* ---------- piers, breakwaters ---------- */
  const PIERS = [
    { x0: -36.5, x1: -11.5, z0: QUAY_Z, z1: 125, main: true },
    { x0: 237.5, x1: 262.5, z0: QUAY_Z, z1: 110 },
    { x0: -337.5, x1: -312.5, z0: QUAY_Z, z1: 115 },
  ];
  const DECK_Y = 3.0;
  const BREAK = [[[-1180, 1150], [-240, 1150]], [[300, 1150], [1330, 990]]];
  const onPier = (x, z) => PIERS.some(p => x > p.x0 - 1 && x < p.x1 + 1 && z > p.z0 && z < p.z1 + 1);
  function breakDist(x, z) {
    let d = 1e9;
    for (const [a, b] of BREAK) { const ab = [b[0] - a[0], b[1] - a[1]], t = E.sat(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1])); d = Math.min(d, Math.hypot(x - a[0] - ab[0] * t, z - a[1] - ab[1] * t)); }
    return d;
  }
  /* sister ships alongside the other piers: [x, z, heading] */
  const SISTERS = [[226, -12, 0], [-301, -6, PI]];

  /* ---------- land points: x, y, z, brightness ---------- */
  const L = V.norm([.62, .52, .28]);           // the moon low in the east-north-east
  const LDa = [];
  { const r = rng(1701);
    const addAt = (x, z, sp) => {
      const h = landH(x, z); if (h < .4) return;
      const e = sp * .5, gx = (landH(x + e, z) - landH(x - e, z)) / (2 * e), gz = (landH(x, z + e) - landH(x, z - e)) / (2 * e);
      const n = V.norm([-gx, 1, -gz]), sh = Math.max(0, V.dot(n, L)), band = (h / 10) % 1 < .12 && h > 6 ? .14 : 0;
      LDa.push(x, h, z, Math.min(1, .1 + .62 * Math.pow(sh, 1.3) + band + .04 * r()));
    };
    for (let x = -5200; x < 5200; x += 28) for (let z = -5200; z < 5600; z += 28) {
      const xx = x + (r() - .5) * 18, zz = z + (r() - .5) * 18;
      if (Math.abs(xx) < 1600 && zz > -1400 && zz < 1600) continue;
      addAt(xx, zz, 28);
    }
    for (let x = -1600; x < 1600; x += 13) for (let z = -1400; z < 1600; z += 13) addAt(x + (r() - .5) * 8, z + (r() - .5) * 8, 13);
  }
  const LD = new Float32Array(LDa), NLD = LD.length / 4;

  /* ---------- sea points: x, z, brightness, phase (denser toward the berth) ---------- */
  const SEa = [];
  { const r = rng(2402);
    for (let rad = 12; rad < 7200; rad += 2 + rad * .016) {
      const ds = 2 + rad * .016, n = Math.floor(TAU * rad / ds), ph = r() * TAU;
      for (let i = 0; i < n; i++) {
        const a = ph + i / n * TAU, rr = rad + (r() - .5) * ds * .8, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        if (landH(x, z) > -.5 || onPier(x, z) || breakDist(x, z) < 14) continue;
        const tex = Math.exp(1.2 * fbm(x * .0021, z * .0009, 3.7, 3) - .2);
        SEa.push(x, z, Math.min(1, .14 + .11 * tex + .05 * r()), r() * TAU);
      }
    }
  }
  const SE = new Float32Array(SEa), NSE = SE.length / 4;

  /* ---------- harbour structures: x, y, z, brightness ---------- */
  const STa = [], LAMPS = [];
  { const r = rng(3303), P = (x, y, z, b) => STa.push(x, y, z, b);
    const lineOf = (a, b, step, br) => { const n = Math.max(1, Math.ceil(V.dist(a, b) / step)); for (let k = 0; k <= n; k++) { const p = V.lerp(a, b, k / n); P(p[0], p[1], p[2], br * (.85 + .15 * r())); } };
    const cyl = (c, rr, h, step, br) => { const n = Math.max(6, Math.round(TAU * rr / step)); for (let y = 0; y <= h; y += step) for (let k = 0; k < n; k++) { const a = k / n * TAU; P(c[0] + Math.cos(a) * rr, c[1] + y, c[2] + Math.sin(a) * rr, br * (.5 + .5 * Math.max(0, Math.cos(a - 2.4)))); } };
    const box = (a, b, step, br) => {
      for (let x = a[0]; x <= b[0]; x += step) for (let z = a[2]; z <= b[2]; z += step) P(x + (r() - .5) * step * .5, b[1], z + (r() - .5) * step * .5, br * .8);
      for (let y = a[1]; y <= b[1]; y += step) { for (let x = a[0]; x <= b[0]; x += step) { P(x, y, a[2], br * .45); P(x, y, b[2], br * .6); } for (let z = a[2]; z <= b[2]; z += step) { P(a[0], y, z, br * .75); P(b[0], y, z, br * .35); } }
    };
    for (const pr of PIERS) {
      const sp = pr.main ? .9 : 2.2, fine = pr.main ? .3 : .9;
      for (let x = pr.x0 + sp * .5; x < pr.x1; x += sp) for (let z = pr.z0 + sp * .5; z < pr.z1; z += sp) P(x + (r() - .5) * sp * .6, DECK_Y, z + (r() - .5) * sp * .6, .22 + .1 * r());
      for (const x of [pr.x0, pr.x1]) { lineOf([x, DECK_Y, pr.z0], [x, DECK_Y, pr.z1], fine, .85); for (let z = pr.z0; z < pr.z1; z += fine * 2.2) for (let y = .2; y < DECK_Y; y += fine * 2.2) P(x, y, z + (r() - .5) * fine, .3); }
      lineOf([pr.x0, DECK_Y, pr.z1], [pr.x1, DECK_Y, pr.z1], fine, .85);
      for (let x = pr.x0; x < pr.x1; x += fine * 2) for (let y = .2; y < DECK_Y; y += fine * 2) P(x, y, pr.z1, .3);
      // bollards along both faces, lamp posts on the centreline
      for (let z = pr.z0 + 12; z < pr.z1 - 4; z += 15) for (const x of [pr.x0 + .8, pr.x1 - .8]) cyl([x, DECK_Y, z], .28, .6, pr.main ? .12 : .3, .8);
      for (let z = pr.z0 + 25; z < pr.z1; z += 38) { const x = (pr.x0 + pr.x1) / 2 - 3; lineOf([x, DECK_Y, z], [x, DECK_Y + 14, z], pr.main ? .25 : .6, .5); lineOf([x, DECK_Y + 14, z], [x + 1.6, DECK_Y + 14, z], .2, .6); LAMPS.push([x + 1.6, DECK_Y + 13.8, z]); }
    }
    // our berth: crane rails, pneumatic fenders at the waterline, a pier-root shed
    for (const x of [-14, -24.5]) lineOf([x, DECK_Y + .02, QUAY_Z + 5], [x, DECK_Y + .02, 118], .35, .55);
    for (const z of [-64, -34, -4, 26, 56]) { const n = 26; for (let k = 0; k < n; k++) { const a = k / n * TAU; for (let zz = -2; zz <= 2; zz += .3) P(-10.3 + Math.cos(a) * 1.1, .3 + Math.sin(a) * 1.1, z + zz, .35 + .3 * Math.max(0, Math.cos(a - .6))); } }
    box([-34, DECK_Y, -150], [-22, DECK_Y + 6, -128], .7, .55);
    // canister laydown: timber dunnage the pallets rest on
    for (let k = 0; k < 4; k++) for (const z of [-25.2, -28.6, -31.6]) box([-33.4 + k * .95 - .3, DECK_Y, z - .15], [-33.4 + k * .95 + .3, DECK_Y + .3, z + .15], .1, .5);
    // quay edge and face
    lineOf([-1150, DECK_Y, QUAY_Z], [1300, DECK_Y, QUAY_Z], 1.2, .7);
    for (let x = -1150; x < 1300; x += 3) for (let y = .4; y < DECK_Y; y += 1.3) P(x + (r() - .5) * 2, y, QUAY_Z, .22);
    for (let x = -1100; x < 1280; x += 22) cyl([x, DECK_Y, QUAY_Z - 1], .3, .6, .3, .7);
    // sheds on the apron
    for (const [x0, z0, w, d, h] of [[-640, -250, 70, 30, 12], [-520, -250, 70, 30, 12], [-160, -262, 90, 34, 14], [120, -250, 70, 30, 11], [420, -262, 110, 36, 15], [700, -250, 70, 30, 12]]) box([x0, DECK_Y, z0 - d], [x0 + w, DECK_Y + h, z0], 2.2, .5);
    // rubble breakwaters, light towers on the heads
    for (const [a, b] of BREAK) {
      const ab = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(ab[0], ab[1]), u = [ab[0] / len, ab[1] / len], nrm = [-u[1], u[0]];
      for (let s = 0; s < len; s += 2.4) for (let c = -12; c <= 12; c += 2.4) {
        const h = 5.2 * Math.min(1, (12 - Math.abs(c)) / 8) + .9 * noise(s * .3, c * .3, 1.3);
        P(a[0] + u[0] * s + nrm[0] * c + (r() - .5) * 1.4, Math.max(.2, h), a[1] + u[1] * s + nrm[1] * c + (r() - .5) * 1.4, .25 + .35 * Math.max(0, .5 + nrm[0] * c * .04));
      }
    }
    for (const q of [[-240, 1150], [300, 1150]]) { cyl([q[0], 5, q[1]], 1.4, 9, .5, .55); LAMPS.push([q[0], 15, q[1]]); }
  }
  const ST = new Float32Array(STa), NST_ = ST.length / 4;

  /* ---------- stars ---------- */
  const SKa = [];
  { const rs = rng(9);
    for (let i = 0; i < 2600; i++) {
      const u = rs(), az = rs() * TAU, el = Math.asin(Math.pow(u, 1.4)) * .98 + .01, m = Math.pow(rs(), 3.2);
      SKa.push(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az), .12 + .75 * m, rs() * 6.28);
    }
  }
  const SK = new Float32Array(SKa), NSK = SK.length / 5;

  /* ---------- the route: berth -> out through the entrance -> a loop at sea -> back in,
     twist round in the basin, back down into the berth. Waypoints with circular fillets,
     tabulated every metre: x, z, heading (0 = north, clockwise). ---------- */
  function filleted(W, radii) {
    const segs = [];
    let start = W[0];
    for (let i = 1; i < W.length - 1; i++) {
      const a = W[i - 1], p = W[i], b = W[i + 1];
      const di = V.norm([p[0] - a[0], 0, p[1] - a[1]]), dout = V.norm([b[0] - p[0], 0, b[1] - p[1]]);
      const cr = di[0] * dout[2] - di[2] * dout[0], ang = Math.acos(E.clamp(di[0] * dout[0] + di[2] * dout[2], -1, 1));
      const Rr = radii[i - 1], t = Rr * Math.tan(ang / 2);
      const T1 = [p[0] - di[0] * t, p[1] - di[2] * t], T2 = [p[0] + dout[0] * t, p[1] + dout[2] * t];
      segs.push({ t: 'L', a: start, b: T1 });
      const left = [-di[2], di[0]], sg = cr > 0 ? 1 : -1, c = [T1[0] + left[0] * Rr * sg, T1[1] + left[1] * Rr * sg];
      segs.push({ t: 'A', c, r: Rr, a0: Math.atan2(T1[1] - c[1], T1[0] - c[0]), sweep: sg * ang, end: T2 });
      start = T2;
    }
    segs.push({ t: 'L', a: start, b: W[W.length - 1] });
    const P = [];
    for (const s of segs) {
      if (s.t === 'L') { const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), n = Math.max(1, Math.ceil(len)); for (let k = 0; k < n; k++) P.push([s.a[0] + (s.b[0] - s.a[0]) * k / n, s.a[1] + (s.b[1] - s.a[1]) * k / n]); }
      else { const len = Math.abs(s.sweep) * s.r, n = Math.max(1, Math.ceil(len)); for (let k = 0; k < n; k++) { const a = s.a0 + s.sweep * k / n; P.push([s.c[0] + Math.cos(a) * s.r, s.c[1] + Math.sin(a) * s.r]); } }
    }
    P.push(W[W.length - 1]);
    // resample at 1 m arc length
    const out = [[P[0][0], P[0][1]]], acc = [0];
    for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = acc[acc.length - 1], N = Math.ceil(total), X_ = new Float64Array(N + 1), Z_ = new Float64Array(N + 1), H_ = new Float64Array(N + 1);
    let j = 0;
    for (let k = 0; k <= N; k++) {
      const s = k / N * total; while (j < P.length - 2 && acc[j + 1] < s) j++;
      const f = (s - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]); X_[k] = P[j][0] + (P[j + 1][0] - P[j][0]) * f; Z_[k] = P[j][1] + (P[j + 1][1] - P[j][1]) * f;
    }
    let prevH = 0;
    for (let k = 0; k <= N; k++) { const k0 = Math.max(0, k - 2), k1 = Math.min(N, k + 2); let h = Math.atan2(X_[k1] - X_[k0], Z_[k1] - Z_[k0]); while (h - prevH > PI) h -= TAU; while (h - prevH < -PI) h += TAU; H_[k] = h; prevH = h; }
    return { X: X_, Z: Z_, H: H_, N, len: total, step: total / N };
  }
  const WP = [[0, 0], [0, 150], [45, 420], [45, 2100], [-560, 2100], [-560, 1600], [70, 1100], [70, 400]];
  const PATH = filleted(WP, [450, 450, 300, 300, 300, 400]);
  const pathAt = s => { const x = E.clamp(s / PATH.step, 0, PATH.N - 1e-6), k = Math.floor(x), f = x - k; return [PATH.X[k] + (PATH.X[k + 1] - PATH.X[k]) * f, PATH.Z[k] + (PATH.Z[k + 1] - PATH.Z[k]) * f, PATH.H[k] + (PATH.H[k + 1] - PATH.H[k]) * f]; };
  /* speed along the path: harbour speed inside, faster outside, easing into the stop at the twist */
  const V_IN = 5.2, V_OUT = 8.7, ACC = .09, BRK = .06;
  const RUN = (() => {
    const dt = .25, tS = [0], sS = [0], vS = [0];
    let s = 0, v = 0, t = 0;
    while (s < PATH.len - .01 && t < 5000) {
      const p = pathAt(s), inside = p[1] < 1180, vz = inside ? V_IN : V_OUT;
      const vt = Math.min(vz, Math.sqrt(2 * BRK * Math.max(0, PATH.len - s)) + .03);
      v += E.clamp(vt - v, -BRK * dt, ACC * dt); v = Math.max(v, .04);
      s = Math.min(PATH.len, s + v * dt); t += dt;
      tS.push(t); sS.push(s); vS.push(v);
    }
    return { dt, T: new Float64Array(tS), S: new Float64Array(sS), Vv: new Float64Array(vS), dur: t };
  })();
  const runAt = t => { const x = E.clamp(t / RUN.dt, 0, RUN.T.length - 1.000001), k = Math.floor(x), f = x - k; return { s: RUN.S[k] + (RUN.S[k + 1] - RUN.S[k]) * f, v: RUN.Vv[k] + (RUN.Vv[k + 1] - RUN.Vv[k]) * f }; };
  /* sim time the run passes a path station (first crossing) */
  const runTimeAtS = s => { for (let k = 0; k < RUN.S.length; k++) if (RUN.S[k] >= s) return RUN.T[k]; return RUN.dur; };
  const sAtZ = (z, from) => { for (let k = from || 0; k <= PATH.N; k++) if (PATH.Z[k] >= z) return k * PATH.step; return PATH.len; };
  const TWIST = 300, ASTERN = 330;
  const P_TW = pathAt(PATH.len);
  /* pose relative to the departure: tau sim seconds since she lets go -> {x, z, h (heading), v (m/s ahead), yaw rate} */
  function routePose(tau) {
    if (tau <= 0) return { x: 0, z: 0, h: 0, v: 0, mode: 0 };
    if (tau < RUN.dur) { const q = runAt(tau), p = pathAt(q.s); return { x: p[0], z: p[1], h: p[2], v: q.v, s: q.s, mode: 1 }; }
    tau -= RUN.dur;
    if (tau < TWIST) { const u = E.ss(0, 1, tau / TWIST); return { x: P_TW[0], z: P_TW[1], h: P_TW[2] + PI * u, v: 0, mode: 2 }; }
    tau -= TWIST;
    if (tau < ASTERN) {
      const u = E.ss(0, 1, tau / ASTERN), du = 6 * (tau / ASTERN) * (1 - tau / ASTERN), ss = E.ss(0, 1, u), dss = 6 * u * (1 - u);
      const x = P_TW[0] * (1 - ss), z = P_TW[1] * (1 - u);
      return { x, z, h: P_TW[2] + PI + Math.atan2(P_TW[0] * dss, P_TW[1]), v: -Math.hypot(P_TW[0] * dss, P_TW[1]) * du / ASTERN, mode: 3 };
    }
    return { x: 0, z: 0, h: P_TW[2] + PI, v: 0, mode: 0 };
  }
  const ROUTE_DUR = RUN.dur + TWIST + ASTERN;

  window.HARB = {
    L, QUAY_Z, DECK_Y, PIERS, BREAK, SISTERS, landH, onPier,
    LD, NLD, SE, NSE, ST, NST: NST_, LAMPS, SK, NSK,
    PATH, pathAt, RUN, runAt, runTimeAtS, sAtZ, routePose, ROUTE_DUR, TWIST, ASTERN, P_TW,
  };
})();
