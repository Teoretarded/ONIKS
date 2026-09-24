/* OC "Underway" world: formation, ship motion, helicopter + fighter kinematics, sea, wakes,
   SPY search pulses, stack shimmer, the far island. Everything is a pure function of film time T
   (trajectories integrated once at load into tables). World: metres, X east, Y up, Z north;
   the task group steams north at VK. Loads after geo.js + hd_sea_air.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, G = 9.81, RE = 6.371e6;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OC = window.OC = {};
  const D = OC.D = 170, VK = OC.VK = 8;          // loop length, task-group speed (8 m/s = 15.6 kn)
  const fr = x => x - Math.floor(x);
  const hash = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const modp = (a, m) => ((a % m) + m) % m;
  Object.assign(OC, { PI, TAU, D2R, G, RE, hash, modp });

  /* ---------------- models (HD with a GEO fallback) ---------------- */
  const hd = k => window.HD && typeof HD[k] === 'function';
  const stubBox = (name, a, b) => ({ parts: [{ name, label: name, prims: [GEO.box(a, b)] }] });
  OC.MOD = {
    ddg: () => hd('destroyer') ? HD.destroyer() : GEO.destroyer(),
    helo: () => hd('helo') ? HD.helo() : stubBox('fuselage', [-1.2, .4, -9], [1.2, 3.8, 5.5]),
    fighter: () => hd('fighter') ? HD.fighter() : stubBox('fuselage', [-1, -.8, -9], [1, 1, 9]),
    carrier: () => hd('carrier') ? HD.carrier() : stubBox('hull', [-20, 0, -166], [20, 19.5, 166]),
  };
  const DA = (window.HD && HD.destroyer && HD.destroyer.A) || {
    stacks: [[0, 22.5, 2], [0, 22.5, -22]], spy: [[5, 13, 30], [-5, 13, 30], [5, 13, 10], [-5, 13, 10]],
    spyN: [V.norm([1, 0, 1]), V.norm([-1, 0, 1]), V.norm([1, 0, -1]), V.norm([-1, 0, -1])],
    heloSpot: [0, 7.05, -63], stern: [0, 7, -77], bow: [0, 10.6, 77], sps: [0, 29.6, 21.6], mastTop: [0, 44, 16.5],
    bridge: [0, 18, 29], hangar: [0, 9, -53], deckY: () => 7,
  };
  OC.DA = DA;
  const HUB = (window.HD && HD.helo && HD.helo.HUB) || [0, 3.95, 0];
  const TAILHUB = (window.HD && HD.helo && HD.helo.TAIL_HUB) || [.3, 4.02, -9.85];
  const TAILAX = (window.HD && HD.helo && HD.helo.TAIL_AXIS) || V.norm([1, .36, 0]);
  const ROTR = (window.HD && HD.helo && HD.helo.R) || 8.18;
  Object.assign(OC, { HUB, TAILHUB, TAILAX, ROTR });
  const CV_DECK = (window.HD && HD.carrier && HD.carrier.DECK_Y) || 19.5;
  const CATS = (window.HD && HD.carrier && HD.carrier.CATS) || [[[6, CV_DECK, 70], [6, CV_DECK, 163]], [[-6, CV_DECK, 72], [-6, CV_DECK, 163]]];
  OC.CV_DECK = CV_DECK;

  /* ---------------- Ticonderoga-class cruiser (no HD model: built here from GEO prims) ---------------- */
  function cruiser() {
    const { hex, box, lathe, cyl, panel, line } = GEO;
    const L = 172.8, zb = L / 2, dY = z => 6.4 + 3.6 * Math.pow(Math.max(0, (z / zb - .25) / .75), 2);
    const F = o => Object.assign({ fine: true }, o || {});
    const H = [{ t: 'hull', L, B: 16.8, D: 6.4 }], S = [], SP = [], M = [], A = [], RL = [], DK = [];
    const tap = (x0, x1, y0, y1, z0, z1, ix, iz, o) => hex([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0 + ix, y1, z0 + iz], [x1 - ix, y1, z0 + iz], [x1 - ix, y1, z1 - iz], [x0 + ix, y1, z1 - iz]], o);
    S.push(tap(-7.4, 7.4, 6.4, 10.4, -48, 42, 0, 0, { ribs: { z: 6 } }));        // 01 level
    S.push(tap(-7.0, 7.0, 10.4, 16.2, 8, 41, .9, .6));                            // forward deckhouse
    S.push(tap(-5.6, 5.6, 16.2, 19.6, 30, 39.5, .3, .4));                         // pilot house
    S.push(tap(-6.8, 6.8, 10.4, 15.2, -42, -8, .9, .6));                          // aft deckhouse
    S.push(tap(-3.2, 3.2, 10.4, 21.5, -2.5, 6.5, .5, 1.2, { ribs: { y: 3 } }));   // forward stack
    S.push(tap(-3.0, 3.0, 10.4, 20.5, -16.5, -8.5, .5, 1.1, { ribs: { y: 3 } })); // aft stack
    S.push(line([[-5.5, 18.6, 39.6], [5.5, 18.6, 39.6]], F({ w: .6 })));         // bridge windows
    S.push(box([-6.4, 6.4, -56], [6.4, 11.6, -48], { ribs: { z: 2 } }));         // hangar
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
    // forward quadrupod mast + yard, aft tripod
    const ap = [0, 38, 23];
    for (const b of [[-2.6, 16.2, 21], [2.6, 16.2, 21], [-2.6, 16.2, 27], [2.6, 16.2, 27]]) M.push(cyl(b, ap, .22, { n: 6, gen: 0 }));
    M.push(cyl(ap, [0, 46, 23], .1, { n: 6, gen: 0 }), cyl([-6, 33, 23], [6, 33, 23], .12, { n: 6, gen: 0 }));
    M.push(box([-1.8, 38, 21.6], [1.8, 38.6, 24.4], F()));
    const ap2 = [0, 31, -25];
    for (const b of [[-2.3, 15.2, -28], [2.3, 15.2, -28], [0, 15.2, -20]]) M.push(cyl(b, ap2, .2, { n: 6, gen: 0 }));
    M.push(cyl(ap2, [0, 37, -25], .09, { n: 6, gen: 0 }), cyl([-4.5, 28, -25], [4.5, 28, -25], .1, { n: 6, gen: 0 }));
    // guns, VLS, CIWS
    for (const [z, fwd] of [[62, true], [-78.5, false]]) {
      const y = dY(z), s = fwd ? 1 : -1;
      A.push(lathe([0, y, z], [0, 1, 0], [[0, 2.1], [1.5, 1.8], [2.2, .9]], { n: 16, gen: 6 }));
      A.push(cyl([0, y + 1.2, z + s * 1.2], [0, y + 1.5, z + s * 8.2], .16, { n: 6, gen: 0 }));
    }
    for (const [z0, z1] of [[46, 55], [-72, -63]]) { const y = dY((z0 + z1) / 2); A.push(box([-3.3, y - .1, z0], [3.3, y + .3, z1], { ribs: { x: 4, z: 5 } })); }
    for (const [x, z] of [[4.8, -36], [-4.8, 33]]) A.push(lathe([x, 15.2, z], [0, 1, 0], [[0, .9], [1.8, .8], [2.6, .5], [2.9, 0]], F({ n: 10, gen: 4 })));
    // flight deck + lifelines
    const fz = [-64, -56];
    DK.push(line([[0, dY(-60) + .03, -84], [0, dY(-60) + .03, -57]], F({ w: .5, pts: false })));
    const circ = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; circ.push([Math.cos(a) * 2.8, dY(-62) + .03, -62 + Math.sin(a) * 2.8]); }
    DK.push(line(circ, { closed: true, w: .6, pts: false }));
    for (const s of [-1, 1]) {
      const rl = []; for (let z = -84; z <= 80; z += 4) { const b = z / zb > .3 ? 8.4 * Math.max(0, 1 - Math.pow((z / zb - .3) / .7, 1.75)) : z / zb < -.82 ? 8.4 * (.84 + .16 * (1 - (-.82 - z / zb) / .18)) : 8.4; rl.push([s * (b - .2), dY(z) + 1, z]); }
      RL.push(line(rl, F({ w: .4 })));
    }
    void fz;
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
  }
  OC.cruiser = cruiser;

  /* ---------------- the task group ---------------- */
  // A = our destroyer (hero); B = the next destroyer, exactly VK*D astern of A, so that B at T = D stands
  // where A stood at T = 0 (same water, same sky): the take loops by arriving on B.
  const SHIPS = OC.SHIPS = [
    { id: 'A', kind: 'ddg', off: [820, 0, 1000], tau: 0, ph: 0 },
    { id: 'B', kind: 'ddg', off: [820, 0, 1000 - VK * D], tau: D, ph: 0 },
    { id: 'CG', kind: 'cg', off: [530, 0, 420], tau: 0, ph: 2.3 },
    { id: 'CV', kind: 'cvn', off: [0, 0, 0], tau: 0, ph: 4.1 },
    { id: 'C', kind: 'ddg', off: [-620, 0, 260], tau: 0, ph: 1.2 },
  ];
  const SID = OC.SID = {}; SHIPS.forEach(s => SID[s.id] = s);
  const DIM = { ddg: { L: 155.2, B: 20 }, cg: { L: 172.8, B: 16.8 }, cvn: { L: 332.8, B: 40.8 } };
  SHIPS.forEach(s => Object.assign(s, DIM[s.kind]));
  OC.shipPos = (S, T) => [S.off[0], 0, S.off[2] + VK * T];
  function shipMot(S, T) {
    const t = T - S.tau, p = S.ph, k = S.kind === 'cvn' ? .22 : S.kind === 'cg' ? .9 : 1;
    return {
      roll: k * 1.1 * D2R * (.8 * Math.sin(.7 * t + p) + .2 * Math.sin(1.23 * t + 2.1 + p)),
      pitch: k * .35 * D2R * Math.sin(.9 * t + 1 + p),
      heave: k * .3 * Math.sin(.8 * t + .4 + p),
    };
  }
  OC.shipMot = shipMot;
  OC.shipXf = (S, T) => { const m = shipMot(S, T), p = OC.shipPos(S, T); return X.make(R.mul(R.z(m.roll), R.x(m.pitch)), [p[0], m.heave, p[2]]); };
  OC.shipFrame = (S, T) => X.make(R.I(), OC.shipPos(S, T));
  const halfB = (S, z) => { const u = z / (S.L / 2), B = S.B / 2; if (u > .3) return B * Math.max(0, 1 - Math.pow((u - .3) / .7, 1.75)); if (u < -.85) return B * .86; return B; };
  OC.halfB = halfB;

  /* ---------------- spline helper (time-parameterised Hermite, optional explicit velocities) ---------------- */
  function spline(keys) {
    const n = keys.length;
    const vel = (i, c) => {
      const k = keys[i];
      if (k.v) return k.v[c];
      if (i === 0 || i === n - 1) return 0;
      const a = keys[i - 1], b = keys[i + 1];
      return (b.p[c] - a.p[c]) / (b.t - a.t);
    };
    return function (t) {
      if (t <= keys[0].t) return keys[0].p.slice();
      if (t >= keys[n - 1].t) return keys[n - 1].p.slice();
      let i = 0; while (i < n - 2 && keys[i + 1].t <= t) i++;
      const a = keys[i], b = keys[i + 1], dt = b.t - a.t, u = (t - a.t) / dt, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      return [0, 1, 2].map(c => a.p[c] * h00 + vel(i, c) * dt * h10 + b.p[c] * h01 + vel(i + 1, c) * dt * h11);
    };
  }
  OC.spline = spline;
  const sspline = keys => { const f = spline(keys.map(k => ({ t: k[0], p: [k[1], 0, 0], v: k[2] !== undefined ? [k[2], 0, 0] : undefined }))); return t => f(t)[0]; };

  /* ---------------- MH-60R from destroyer A ----------------
     Path keys in A's heading frame (x starboard, z forward), m. Attitude comes from the rotor thrust
     vector the path demands: up = a + g + parasite drag; heading from its own spline. */
  const SPOT = DA.heloSpot, DKY = SPOT[1];
  const HT = OC.HT = { lift: 28.4, touch: 146, eng: 4, engage: 12, full: 24, cut: 150.5, stop: 172 };
  // lift, hover, slide to port, climb away to the SW; plane guard off the carrier's starboard bow; home
  // NE to A's port quarter, a constant-deceleration approach (~2.3 m/s^2), hover alongside, slide over
  // the deck, settle. Speeds and accelerations stay within MH-60R handling (<= ~3 m/s^2).
  const S0 = SPOT[2];
  const HK = [
    [0, [0, DKY, S0]], [HT.lift, [0, DKY, S0], [0, 0, 0]],
    [31.0, [-.3, DKY + 4.5, S0 + .2], [0, 0, 0]],
    [35.5, [-12, DKY + 8.5, S0 + .4]],
    [39.5, [-36, DKY + 18, S0 - 4]],
    [44.0, [-82, 36, -90]],
    [50.0, [-190, 58, -200]],
    [57.5, [-290, 64, -400]],
    [65.0, [-391, 60, -601], [-13.4, -.5, -26.8]],
    [71.0, [-451, 57, -722], [-6.7, -.3, -13.4]],
    [77.0, [-472, 55, -762], [0, 0, 0]],
    [92.0, [-470, 56, -760], [0, 0, 0]],
    [100.0, [-452, 60, -715]],
    [108.0, [-380, 64, -575]],
    [116.0, [-265, 60, -395]],
    [123.0, [-150, 50, -262]],
    [130.0, [-52, 30, -149], [8.4, -2, 18.1]],
    [138.5, [-9, DKY + 6.5, S0 - 1], [0, 0, 0]],
    [139.3, [-9, DKY + 6.5, S0 - 1], [0, 0, 0]],
    [143.5, [0, DKY + 5, S0], [0, 0, 0]],
    [HT.touch, [0, DKY, S0], [0, -.4, 0]],
    [D + 1, [0, DKY, S0]],
  ].map(k => ({ t: k[0], p: k[1], v: k[2] }));
  const heloP = spline(HK);
  // heading (rad, 0 = north / ship heading, + clockwise)
  const heloYaw = sspline([[0, 0], [HT.lift, 0, 0], [33.5, 0, 0], [37, -.5], [40, -1.35], [43, -1.95], [47, -2.35], [58, -2.65], [65, -2.68], [69, -2.3], [73, -1.2], [77, -.1], [80, 0, 0], [92, 0, 0],
    [95, .1], [100, .35], [108, .55], [116, .7], [123, .75], [130, .55], [135, .2], [138.5, 0, 0], [D + 1, 0, 0]]);
  // rotor speed (rad/s) and its integral
  const OMAX = 27.0;
  const heloOmega = T => OMAX * (ss(HT.engage, HT.full, T) - ss(HT.cut, HT.stop, T));
  const HN = Math.ceil(D * 120) + 1, H_ROT = new Float64Array(HN);
  const ROT0 = PI / 4 - .12;
  for (let i = 1; i < HN; i++) { const t0 = (i - 1) / 120, t1 = i / 120; H_ROT[i] = H_ROT[i - 1] + (heloOmega(t0) + heloOmega(t1)) * .5 / 120; }
  const lut = (arr, T) => { const x = clamp(T * 120, 0, arr.length - 1.001), i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
  // free-flight attitude table (heading frame of A is inertial: same accelerations as the world)
  const H_UP = [], H_FW = [];
  {
    const dt = 1 / 120, P = [];
    for (let i = 0; i < HN; i++) P.push(heloP(i * dt));
    const acc = [], vel = [];
    for (let i = 0; i < HN; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[Math.min(HN - 1, i + 1)];
      vel.push(V.mul(V.sub(c, a), 1 / (2 * dt)));
      acc.push(V.mul(V.add(V.sub(c, V.mul(b, 2)), a), 1 / (dt * dt)));
    }
    // smooth accelerations over +-0.75 s (the pilot tilts the disc ahead of the motion, never twitching)
    const K = 90, accS = [];
    for (let i = 0; i < HN; i++) {
      let s = [0, 0, 0], w = 0;
      for (let k = -K; k <= K; k += 3) { const j = clamp(i + k, 0, HN - 1), g = Math.exp(-(k * k) / (2 * 40 * 40)); s = V.mad(s, acc[j], g); w += g; }
      accS.push(V.mul(s, 1 / w));
    }
    for (let i = 0; i < HN; i++) {
      const T = i * dt, va = V.add(vel[i], [0, 0, VK]), sp = V.len(va);
      const th = V.add(V.add(accS[i], [0, G, 0]), V.mul(va, 2.9e-4 * sp));
      let up = V.norm(th);
      const yaw = heloYaw(T), fw0 = [Math.sin(yaw), 0, Math.cos(yaw)];
      // hover trim: tail-rotor thrust holds ~2 deg left-side-down, nose ~3 deg up at low speed
      const lo = 1 - sat(sp / 25), rt = [fw0[2], 0, -fw0[0]];
      up = V.norm(V.add(V.add(up, V.mul(rt, -.035 * lo)), V.mul(fw0, -.05 * lo)));
      H_UP.push(up);
      H_FW.push(V.norm(V.sub(fw0, V.mul(up, V.dot(fw0, up)))));
    }
  }
  /* helo pose at T for the helicopter of ship S (A flies; B's stays chained down, rotor at rest) */
  OC.helo = function (S, T) {
    const shipX = OC.shipXf(S, T);
    if (S.id !== 'A') {
      return { X: X.mul(shipX, X.make(R.I(), SPOT)), st: { rotor: ROT0, trotor: ROT0 * 4.62, droop: 1 }, omega: 0, onDeck: 1 };
    }
    const Tc = clamp(T, 0, D);
    const i = clamp(Math.round(Tc * 120), 0, HN - 1);
    const pF = heloP(Tc), frame = OC.shipFrame(S, T);
    const free = X.make(R.look(H_FW[i], H_UP[i]), X.ap(frame, pF));
    // on deck: carried by the ship (roll, pitch, heave); blend out/in around lift-off and touchdown
    const wDeck = 1 - ss(HT.lift - .2, HT.lift + 1.6, Tc) + ss(HT.touch - 1.1, HT.touch, Tc);
    const off = V.sub(pF, SPOT), deck = X.mul(shipX, X.make(R.I(), V.add(SPOT, off)));
    let Xh = free;
    if (wDeck > .999) Xh = deck;
    else if (wDeck > .001) {
      const w = wDeck, Rm = [];
      const c = k => V.norm(V.lerp([free.R[k], free.R[3 + k], free.R[6 + k]], [deck.R[k], deck.R[3 + k], deck.R[6 + k]], w));
      const z = c(2), y0 = c(1), x = V.norm(V.cross(y0, z)), y = V.cross(z, x);
      Rm.push(x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]);
      Xh = X.make(Rm, V.lerp(free.T, deck.T, w));
    }
    const om = heloOmega(Tc), rot = ROT0 + lut(H_ROT, Tc);
    return { X: Xh, st: { rotor: rot, trotor: rot * 4.62, droop: 1 - ss(.12, .6, om / OMAX) }, omega: om, onDeck: wDeck, vel: null };
  };
  OC.heloOmega = heloOmega; OC.OMAX = OMAX;
  OC.heloRel = T => heloP(clamp(T, 0, D));              // position in A's heading frame
  OC.heloYaw = heloYaw;

  /* ---------------- F/A-18E catapult launches from the carrier ---------------- */
  const JT = OC.JT = [
    { cat: 0, tL: 76.6, turn: 1, psiT: 222, bank: 66, sTurn: 8.5, split: 16, tSplit: 42 },
    { cat: 1, tL: 86.9, turn: -1, psiT: 222, bank: 70, sTurn: 7.5, split: -16, tSplit: 33 },
  ];
  const FT_ORG_Y = 2.05;            // origin above the deck with gear down
  const NOSE_GEAR = 5.35;           // nose gear ahead of the origin
  for (const J of JT) {
    const [a, b] = CATS[J.cat], d = V.norm(V.sub(b, a));
    J.dir = d; J.z0 = a[2] + 6 + 1.2 + 9.2;                     // tail clear of the blast deflector
    J.s0 = V.add(V.mad(a, d, (J.z0 - a[2]) / d[2]), [0, FT_ORG_Y, 0]);   // origin at the hold-back
    J.stroke = (b[2] - .8 - (J.z0 + NOSE_GEAR)) / d[2];
    J.vEnd = 72;                                               // end-speed relative to the deck (140 kn)
    J.acc = J.vEnd * J.vEnd / (2 * J.stroke); J.tS = J.vEnd / J.acc;
    // free flight: integrate once (world frame), commands as smooth schedules of time since launch
    const N = Math.round(60 * 120), P = [], Rm = [], SPD = [];
    const CV = SID.CV;
    let t = J.tL + J.tS;
    const cvp = OC.shipPos(CV, t), start = V.add(cvp, V.mad(J.s0, d, J.stroke));
    let pos = start.slice(), psi = Math.atan2(d[0], d[2]), gam = 0, spd = VK + J.vEnd, phi = 0, alpha = 4 * D2R;
    for (let i = 0; i < N; i++) {
      const s = i / 120;                                        // seconds since the end of the stroke
      // clearing turn off the bow (cat 1 right, cat 2 left), then a right turn onto the departure heading
      // (NE), and at the end the pair splits
      const psiT = (J.psiT + J.split * ss(J.tSplit, J.tSplit + 5, s)) * D2R;
      const phiH = clamp((psiT - psi) * 2.2, -J.bank * D2R, J.bank * D2R) * ss(J.sTurn, J.sTurn + 2, s);
      const phiC = J.turn * 22 * D2R * (ss(2.2, 3.6, s) - ss(6.5, 8.5, s)) + phiH;
      phi += (phiC - phi) * (1 - Math.exp(-3 / 120));
      const gC = (-.6 + 9.2 * ss(.25, 3.2, s) + 5 * ss(7, 12, s) - 9 * ss(22, 32, s)) * D2R;
      gam += (gC - gam) * (1 - Math.exp(-2.2 / 120));
      const thr = (s < 16 ? 9.5 : 4.5) - .00032 * spd * spd - G * Math.sin(gam);
      spd = Math.min(210, spd + thr / 120);
      alpha = mix(9, 3.5, sat((spd - 80) / 60)) * D2R;
      psi += G * Math.tan(phi) / Math.max(60, spd) / 120;
      pos = V.add(pos, V.mul([Math.sin(psi) * Math.cos(gam), Math.sin(gam), Math.cos(psi) * Math.cos(gam)], spd / 120));
      P.push(pos.slice()); SPD.push(spd);
      // off the bow the jet rotates to its climb attitude over ~1.2 s (hands-off launch)
      Rm.push(R.mul(R.mul(R.y(psi), R.x(-(gam + alpha * ss(0, 1.2, s)))), R.z(-phi)));
    }
    J.P = P; J.R = Rm; J.SPD = SPD;
  }
  // fighter pose + engine state
  OC.jet = function (J, T) {
    const CV = SID.CV, cvx = OC.shipXf(CV, T);
    const tl = T - J.tL, d = J.dir;
    const ab = ss(-3.2, -2.4, tl) * (1 - ss(15, 16.5, tl)), nozzle = mix(.25, 1, Math.max(ab, ss(-6, -5, tl) * .6));
    const st = { fan: T * 2.3 + J.cat, ab, nozzle };
    const gear = 1 - ss(3.8, 6.2, tl - J.tS);
    let Xj, spd;
    if (tl < J.tS) {                                             // on the catapult (carried by the ship)
      const u = Math.max(0, tl), s = .5 * J.acc * u * u;
      const kneel = tl < 0 ? -.4 * D2R * ss(-4, -3, tl) : 0;
      Xj = X.mul(cvx, X.make(R.mul(R.y(Math.atan2(d[0], d[2])), R.x(kneel)), V.mad(J.s0, d, s)));
      spd = VK + J.acc * u;
    } else {
      const x = (tl - J.tS) * 120, i = Math.min(J.P.length - 2, Math.floor(x)), f = x - i;
      const p = V.lerp(J.P[i], J.P[i + 1], f), Rm = J.R[i];
      // sink off the bow edge settles into the climb: blend the deck-level start in over 1 s
      Xj = X.make(Rm, p);
      spd = J.SPD[i];
    }
    return { X: Xj, st, gear, spd, tl };
  };

  /* ---------------- sea ---------------- */
  // deep-water swell as gravity waves; each frequency is rounded so the sea repeats exactly every D s
  const WAVES = [
    { A: 1.15, L: 150, d: .25, ph: 0 }, { A: .68, L: 84, d: -.7, ph: 1.7 }, { A: .38, L: 46, d: 1.1, ph: 4.1 },
    { A: .2, L: 29, d: -.3, ph: 2.2 }, { A: .1, L: 17, d: .62, ph: 5.3 },
  ].map(w => { const k = TAU / w.L, n = Math.max(1, Math.round(Math.sqrt(G * k) * D / TAU)); return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: n * TAU / D, ph: w.ph }; });
  function swell(x, z, T) { let h = 0; for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * x + w.kz * z - w.w * T + w.ph); } return h; }
  OC.swell = swell;

  /* sea rows: straight lines across the view on the water, spaced in power-of-two levels; their offset along the
     view follows the camera's own travel (phase integrals from the camera path), so rows stream past a moving
     lens as water does. Heights from the swell at their world positions; curvature drop to a true horizon. */
  const SEA = { C: 15, S0: 1, base: .2 };
  OC.drawSea = function (W, cam, T, ph, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(.6, e[1]);
    let fx = cam.f[0] + cam.u[0] * .8, fz = cam.f[2] + cam.u[2] * .8;
    const fl = Math.hypot(fx, fz); if (fl < 1e-6) { fx = 0; fz = 1; } else { fx /= fl; fz /= fl; }
    const rx = fz, rz = -fx;
    const dHor = Math.sqrt(2 * RE * h), rhoMax = Math.min(dHor, 16000 + 9 * h);
    // visible range along FW from the frustum corners
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
    let lvl = 0;
    for (; lvl < 18; lvl++) {
      // spacing tops out at 1024 m: the row phases are made loop-exact modulo 1024 m
      const s = SEA.S0 * Math.pow(2, lvl), rhoEnd = SEA.C * Math.sqrt(s * h), top = rhoEnd >= rhoMax || s >= 1024;
      if (rhoEnd < h * 1.02 && !top) continue;
      const dEnd = Math.sqrt(Math.max(0, rhoEnd * rhoEnd - h * h));
      const off = modp(phF, s), q = Math.floor(modp(phF, 2 * s) / s);
      const lo = Math.max(dMin, -dEnd), hi = Math.min(dMax, top ? rhoMax : dEnd);
      const m0 = Math.ceil((lo + off) / s), m1 = Math.floor((hi + off) / s);
      // rows that slide more than ~a third of their spacing per frame would strobe: fade them
      const strobe = 1 - ss(.22, .5, spd / 60 / s);
      if (strobe <= .01 && !top) continue;
      for (let m = m0; m <= m1; m++) {
        if (!top && modp(m - q, 2) === 0) continue;             // belongs to a coarser level
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
    // horizon: the true geometric horizon circle (dip below the horizontal grows with height)
    const hb = [];
    const psi0 = Math.atan2(fx, fz), span = Math.min(PI, Math.atan(tW) * 1.3 + .2);
    for (let k = 0; k <= 48; k++) { const b = psi0 - span + 2 * span * k / 48; hb.push([e[0] + Math.sin(b) * dHor, -h, e[2] + Math.cos(b) * dHor]); }
    for (let k = 0; k < hb.length - 1; k++) W.seg(hb[k], hb[k + 1], .3 * (o.horizon === undefined ? 1 : o.horizon));
    return { dHor, fx, fz };
  };

  /* whitecaps: seeded world cells; foam where the swell crest is high, streaks along the wind (from ahead) */
  OC.drawCaps = function (W, cam, T, o) {
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

  /* Kelvin wake + bow wave + churned centreline, in the ship's heading frame (stationary for a steady ship);
     foam drifts aft at the ship's speed. The cusp lines start at the bow (19.47 deg); transverse crests are
     lambda = 2 pi v^2 / g = 41 m apart at 15.6 kn. */
  const LAM = TAU * VK * VK / G, KEL = 19.47 * D2R, TK = Math.tan(KEL);
  OC.drawWake = function (W, S, T, o) {
    o = o || {};
    const Fr = OC.shipFrame(S, T), P = (x, z, y) => X.ap(Fr, [x, y === undefined ? .12 : y, z]);
    const L = S.L, zb = L / 2, zs = -L / 2, bw = S.B / 2, tau = T - S.tau, A = o.alpha === undefined ? 1 : o.alpha;
    const Lw = S.kind === 'cvn' ? 1300 : 900;
    // cusp lines + divergent crests (short feathers inclined ~35 deg to the track)
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
      // bow wave: the first sheet flares from the stem along the side
      const b0 = P(sg * .3, zb - 1.5, .25), b1 = P(sg * (bw * .72 + 1.2), zb - L * .2, .2), b2 = P(sg * (bw + 3.5), zb - L * .42, .12);
      W.seg(b0, b1, A * .55); W.seg(b1, b2, A * .3);
      for (let k = 0; k < 7; k++) {                     // spray lines at the stem, flickering
        const f = fr(tau * .9 + k * .37), zz = zb - 2 - k * 2.2;
        W.seg(P(sg * (.4 + k * .9), zz, .3 + .6 * (1 - f)), P(sg * (1.2 + k * 1.1), zz - 1.6, .15), A * .28 * (1 - f));
      }
      // side wash along the hull
      for (let k = 0; k < 10; k++) { const z = zb - 20 - k * 12; const x = sg * (halfB(S, z) + 1.6 + .8 * Math.sin(k * 2.3 + tau * 1.7)); W.seg(P(x, z), P(x + sg * .6, z - 8), A * .2); }
    }
    // transverse crests between the cusp lines behind the stern
    for (let k = 1; k <= 14; k++) {
      const z = zs - k * LAM + 8, l = zb - 4 - z, xm = bw * .35 + l * TK, a = A * .16 * Math.pow(1 - k / 15, 1.5);
      let pv = null;
      for (let i = 0; i <= 12; i++) {
        const u = -1 + 2 * i / 12, q = P(u * xm * .82, z + Math.pow(Math.abs(u), 2) * LAM * .38);
        if (pv) W.seg(pv, q, a * (1 - .6 * Math.abs(u)));
        pv = q;
      }
    }
    // churned centreline: foam streaks drifting aft inside a slowly widening band with ragged edges
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
    // stern boil
    for (let k = 0; k < 6; k++) { const f = fr(tau * .7 + k / 6); W.seg(P(-bw * .6 * (1 - f), zs - 1 - f * 10), P(bw * .6 * (1 - f), zs - 1 - f * 10), A * .2 * (1 - f)); }
  };

  /* ---------------- radar search pulses ---------------- */
  // Pulses are patches of expanding spherical shell from the array face that looks their way.
  // Around the loop point only the hero ship may pulse, so the neighbourhood of the lens at T = D matches T = 0.
  const PER = .7, LIFE = 2.4, GAP = LIFE + .1;
  const SHELL = [[0, .5], [9, .85], [18, 1], [29, .6], [42, .28]].map(q => [q[0] * D2R, q[1]]);
  const pulseR = age => 14 + 240 * age + 380 * age * age;        // slow off the face, then racing out
  function gate(S, Tk) {
    const t = modp(Tk, D);
    if (t >= D - GAP) return false;
    if (S.id === 'A') return !(t >= D - 2 * GAP);
    if (S.id === 'B') return !(t < 2 * GAP + .3);
    return !(t >= D - 2 * GAP || t < 2 * GAP + .3);
  }
  OC.pulseGate = gate;
  OC.drawPulses = function (W, S, T, facesW, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, t0 = S.tau + .31 + S.ph * .1;
    const kNow = Math.floor((T - t0) / PER);
    const fired = [];
    for (let k = kNow; k >= kNow - Math.ceil(LIFE / PER); k--) {
      const Tk = t0 + k * PER, age = T - Tk;
      if (age < 0 || age > LIFE || !gate(S, Tk)) continue;
      const cb = (modp(k * 137 + (k >> 2) * 61, 360) + 7 * Math.sin(k)) * D2R;
      let best = 0, bd = -2;
      for (let f = 0; f < facesW.length; f++) { const n = facesW[f].n, dd = n[0] * Math.sin(cb) + n[2] * Math.cos(cb); if (dd > bd) { bd = dd; best = f; } }
      const F = facesW[best], c = F.c, rad = pulseR(age);
      const al = A * .74 * Math.pow(1 - age / LIFE, 1.4) * ss(0, .06, age);
      const b0 = cb - 32 * D2R, b1 = cb + 32 * D2R, n = 36;
      // a patch of spherical shell: most weight in the lower sky so it reads above the swell rows
      for (const [el, w] of SHELL) {
        const ce = Math.cos(el), se = Math.sin(el);
        // the front plus a faint trailing echo: the pulse has a width
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
  OC.drawSweep = function (W, c, T, bearing0, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, per = .45, life = 1.6;
    const kNow = Math.floor(T / per);
    for (let k = kNow; k >= kNow - 4; k--) {
      const Tk = k * per, age = T - Tk;
      if (age < 0 || age > life || !gate({ id: 'CV' }, Tk)) continue;
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

  /* ---------------- heat shimmer over the uptakes ----------------
     The exhaust rises ~6 m/s into an 8 m/s relative wind from ahead, so the column leans aft ~50 deg. */
  OC.drawShimmer = function (W, mouth, up, aft, side, tau, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, n = o.n || 9, Lp = o.len || 15;
    const out = V.norm(V.cross(up, aft));
    for (let i = 0; i < n; i++) {
      const ph = i * 2.39, lat = ((i + .5) / n - .5) * (o.w || 2.6);
      let pv = null;
      for (let k = 0; k <= 22; k++) {
        const s = k / 22 * Lp, rise = s * .74, lean = s * .68 + .016 * s * s;
        // refraction ripples: short wavelengths travelling up the column, growing as it mixes
        const amp = .05 + s * .03;
        const wob = amp * (Math.sin(2.3 * s - 9.5 * tau + ph) + .6 * Math.sin(4.1 * s - 15.7 * tau + ph * 1.7));
        const q = V.add(V.add(V.mad(V.mad(mouth, up, rise), aft, lean), V.mul(side, lat * (1 + s * .05) + wob)), V.mul(out, amp * .8 * Math.sin(3.1 * s - 11.3 * tau + ph)));
        if (pv) W.seg(pv, q, A * .17 * Math.pow(1 - s / Lp, 1.2) * ss(0, 1.5, s));
        pv = q;
      }
    }
  };

  /* ---------------- the far island (seed-1337 theatre, real contours) ----------------
     The task group's origin sits at theatre (115, 237) km; the island's summit is 288 m, ~34 km to the SW. */
  const W0 = [158.5, 288.9];
  const ISL = {
    0: [[136.7, 275.53], [143.71, 275.53], [144.71, 274.56], [145.83, 274.53], [148.71, 272.58], [149.71, 272.53], [152.72, 269.52], [152.75, 268.52], [154.72, 265.52], [154.81, 263.51], [155.72, 262.51], [155.72, 257.5], [154.8, 256.5], [154.72, 254.5], [152.75, 251.49], [152.72, 250.49], [149.71, 247.49], [148.71, 247.41], [146.71, 245.48], [144.71, 245.46], [143.71, 244.48], [136.69, 244.48], [135.69, 245.4], [133.69, 245.48], [132.69, 246.47], [131.69, 246.49], [126.68, 251.49], [125.66, 254.5], [124.68, 255.5], [124.68, 264.52], [125.66, 265.52], [126.68, 268.52], [131.69, 273.53], [132.69, 273.54], [133.69, 274.53], [135.69, 274.6], [136.7, 275.53]],
    60: [[138.56, 269.52], [142.7, 269.48], [144.64, 268.52], [148.29, 264.52], [149.41, 261.51], [148.22, 255.5], [146.63, 252.5], [145.71, 251.51], [141.7, 250.21], [137.7, 250.52], [134.56, 252.5], [131.69, 254.54], [130.0, 258.51], [130.15, 260.51], [131.83, 265.52], [134.69, 268.22], [138.56, 269.52]],
    140: [[138.01, 266.52], [140.7, 266.65], [143.71, 265.69], [146.71, 260.89], [144.07, 254.5], [140.7, 252.81], [137.7, 253.43], [135.69, 254.5], [133.33, 256.5], [132.5, 258.51], [132.53, 260.51], [134.94, 264.52], [138.01, 266.52]],
    220: [[137.47, 263.51], [138.7, 264.29], [141.7, 263.2], [142.7, 262.7], [144.27, 260.51], [141.7, 257.4], [136.7, 257.25], [134.57, 258.51], [134.59, 260.51], [137.47, 263.51]],
  };
  const ISLW = Object.entries(ISL).map(([lv, pts]) => ({ lv: +lv, p: pts.map(q => [(q[0] - W0[0]) * 1000, +lv, (q[1] - W0[1]) * 1000]) }));
  OC.ISLAND = { summit: [(139 - W0[0]) * 1000, 288, (261 - W0[1]) * 1000] };
  OC.drawIsland = function (W, cam, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(.6, e[1]), dh = Math.sqrt(2 * RE * h), A = o.alpha === undefined ? 1 : o.alpha;
    for (const c of ISLW) {
      const lim = dh + Math.sqrt(2 * RE * Math.max(1, c.lv)), al = A * (c.lv === 0 ? .2 : .13);
      // subdivide so the curvature drop bends each edge
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

  /* ---------------- the raid: a far engagement, seen twice ----------------
     SSW from high: a screen cruiser on the horizon fires two missiles; one meets an incoming round in a high,
     distant flash. NE behind the returning helicopter: a picket destroyer's Phalanx fires, a round gets
     through, fire and a smoke column. Each half is drawn only inside a window whose ends fall where the lens
     looks away (the far ships leave no trace elsewhere in the loop, and the seam stays exact). Paths are
     fixed cinematic curves, not guidance; every element is a function of its own launch / firing time. */
  const RAID = OC.RAID = {};
  const FL = RAID.L = { id: 'L', kind: 'cg', off: [-4300, 0, -9100], tau: 0, ph: .7, L: 172.8, B: 16.8, win: [108, 127] };
  const FP = RAID.P = { id: 'P', kind: 'ddg', off: [6600, 0, 7400], tau: 0, ph: 3.3, L: 155.2, B: 20, win: [127, 151] };
  RAID.inWin = (S, T) => T >= S.win[0] && T <= S.win[1];
  const WIND = [-8, 0, -2.5];                      // ~8 m/s from the ENE: smoke drifts WSW
  const aged = (p, age, sink) => [p[0] + WIND[0] * age, p[1] - (sink || 0) * age, p[2] + WIND[2] * age];

  // two missiles out of the cruiser's forward cells: a short vertical boost, a quick pitch-over, a shallow climb
  const HZ = 60;
  const SAMS = RAID.sams = [
    { tL: 114.4, psi: 200, gam: 8, burn: 7.2, cell: [1.1, 7.5, 49.5], seed: 3.1 },
    { tL: 115.55, psi: 236, gam: 15, burn: 7.2, cell: [-1.1, 7.5, 51.5], seed: 8.7 },
  ];
  for (const M of SAMS) {
    const N = 12 * HZ, P = new Float64Array((N + 1) * 3), ps = M.psi * D2R;
    let p = X.ap(OC.shipXf(FL, M.tL), M.cell);
    for (let i = 0; i <= N; i++) {
      P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
      const s = i / HZ, v = 40 + 990 * (1 - Math.exp(-s / 1.5)), g = (M.gam - 5 * ss(4, 11, s)) * D2R;
      const d = V.norm(V.lerp([0, 1, 0], [Math.sin(ps) * Math.cos(g), Math.sin(g), Math.cos(ps) * Math.cos(g)], ss(.35, 2.1, s)));
      p = V.mad(p, d, v / HZ);
    }
    M.P = P; M.N = N; M.end = M.burn; M.lat = [Math.cos(ps), 0, -Math.sin(ps)];
  }
  const samAt = (M, s) => { const x = clamp(s * HZ, 0, M.N - .001), i = Math.floor(x), f = x - i, P = M.P, j = i * 3; return [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f]; };
  RAID.samAt = samAt;
  // missile 1 meets a round diving in from the WSW; the round's path is laid back from that point
  const TI = RAID.tI = SAMS[0].tL + 4.9;
  SAMS[0].end = 4.9;
  const XI = RAID.xI = samAt(SAMS[0], 4.9);
  const RD1 = (() => { const b = 62 * D2R, dv = 9 * D2R; return [Math.sin(b) * Math.cos(dv), -Math.sin(dv), Math.cos(b) * Math.cos(dv)]; })();
  const inc1 = T => V.mad(XI, RD1, 620 * (T - TI));

  // the picket: a round from the ESE, diving 20 deg into the starboard side abaft the stacks
  const TH = RAID.tH = 133.2, HIT_L = [4.6, 10.5, -20];
  const XH = X.ap(OC.shipXf(FP, TH), HIT_L);
  const RD2 = (() => { const b = 283 * D2R, dv = 20 * D2R; return [Math.sin(b) * Math.cos(dv), -Math.sin(dv), Math.cos(b) * Math.cos(dv)]; })();
  const inc2 = T => V.mad(XH, RD2, 700 * (T - TH));
  const hitNow = T => X.ap(OC.shipXf(FP, T), HIT_L);
  // Phalanx on the hangar: bursts of tracers, each a dash flown from its own firing time
  const CIWS = [0, 15.4, -47.5], BURSTS = [[130.65, 131.85], [132.15, 133.08]], ROF = 30, VM = 1100, TLIFE = 1.45;
  const ROUNDS = [];
  RAID.bursts = BURSTS;
  for (let b = 0; b < BURSTS.length; b++) {
    for (let k = 0; BURSTS[b][0] + k / ROF <= BURSTS[b][1]; k++) {
      const tk = BURSTS[b][0] + k / ROF, m = X.ap(OC.shipXf(FP, tk), CIWS);
      let tgt = inc2(tk);
      for (let it = 0; it < 2; it++) tgt = inc2(tk + V.dist(tgt, m) / (VM * .9));
      const d = V.norm(V.sub(tgt, m)), [U, Vv] = GEO.perp(d);
      const du = (hash(k, b + 1) - .5) * .008 + .006 * M3.noise(tk * 2.3, 1.1), dvv = (hash(k + 7, b + 5) - .5) * .008 + .006 * M3.noise(tk * 2.3, 4.4);
      ROUNDS.push({ tk, m, d: V.norm(V.add(d, V.add(V.mul(U, du), V.mul(Vv, dvv)))) });
    }
  }
  const roundAt = (r, a) => { const s = VM * a - 95 * a * a; return [r.m[0] + r.d[0] * s, r.m[1] + r.d[1] * s - 4.9 * a * a, r.m[2] + r.d[2] * s]; };

  // debris: fixed per event, flung out and falling
  const sparks = (n, seed, v0, v1) => { const o = []; for (let k = 0; k < n; k++) { const az = hash(k, seed) * TAU, el = mix(-.35, 1.2, hash(k + 3, seed)), v = mix(v0, v1, hash(k + 9, seed)); o.push([Math.cos(az) * Math.cos(el) * v, Math.sin(el) * v, Math.sin(az) * Math.cos(el) * v, .9 + 1.4 * hash(k + 5, seed)]); } return o; };
  const SPK1 = sparks(14, 21, 50, 150), SPK2 = sparks(16, 37, 30, 110);
  function drawSparks(W, c, S, age, al) {
    for (const s of S) {
      if (age > s[3]) continue;
      const at = a => [c[0] + s[0] * a, c[1] + s[1] * a - 4.9 * a * a, c[2] + s[2] * a];
      W.seg(at(Math.max(0, age - .09)), at(age), al * Math.pow(1 - age / s[3], 1.3));
    }
  }

  /* laid smoke: each point stays where it was laid, then drifts, sinks and twists as it ages */
  function samTrail(W, M, T, al) {
    const s1 = Math.min(T - M.tL, M.end);
    if (s1 <= 0) return;
    const n = Math.max(2, Math.ceil(s1 * 13)), L = M.lat;
    for (const rail of [-1, 1]) {
      let pv = null, pa = 0;
      for (let i = 0; i <= n; i++) {
        const s = s1 * i / n, age = Math.max(0, T - M.tL - s), p = aged(samAt(M, s), age, .5);
        const amp = 3 + 6 * age, w = rail * (1.2 + 3.5 * Math.sqrt(age));
        const n1 = M3.noise(s * 1.4 + M.seed, age * .08, 1.7 + rail), n2 = M3.noise(s * 1.4 + M.seed, age * .08, 6.3 + rail);
        const q = [p[0] + L[0] * (w + amp * n1), p[1] + amp * .7 * n2, p[2] + L[2] * (w + amp * n1)];
        const a = al * (.26 + .74 * Math.exp(-age / 1.2)) * Math.exp(-age / 26) * (s < 2.6 ? 1 : .72) * ss(0, .25, s);
        if (pv) W.seg(pv, q, (a + pa) * .5);
        pv = q; pa = a;
      }
    }
  }
  // a smoke column over a burning ship: parcels leave the fire, rise on its heat, then drift downwind
  // (the wind strengthens with height, so the top of the column shears over)
  const smZ = s => 150 * (1 - Math.exp(-s / 2.4)) + 21 * s;
  const smR = s => 15 + .14 * smZ(s) + 5 * Math.sqrt(s);
  function smokeP(ah, s) {
    const te = ah - s, b = hitNow(TH + te), z = smZ(s), r = smR(s), wob = r * .3, dr = s * (.3 + z / 95);
    const n1 = M3.noise(te * .45, s * .12, 2.2), n2 = M3.noise(te * .45, s * .12, 5.9);
    return { p: [b[0] + WIND[0] * dr + wob * n1, b[1] + z, b[2] + WIND[2] * dr + wob * n2], r, te };
  }
  const STRANDS = [-1, -.5, -.12, .3, .68, 1], CAP_TE = .9;
  const CAP = [[0, 0, .72], [-.62, -.18, .55], [.62, -.12, .58], [-.3, .42, .5], [.34, .4, .52]];
  function drawColumn(W, cam, ah, al) {
    const e = cam.eye, fl = cam.fl, NS = 24, Q = [];
    const em = te => ss(0, .5, te) * (1 - .45 * ss(9, 18, te));
    // the stem, sampled from the fire (s = 0) up to the cap, with the lens's side vector
    const sTop = ah - CAP_TE;
    if (sTop > 0) for (let i = 0; i <= NS; i++) {
      const s = sTop * Math.pow(i / NS, 1.3), q = smokeP(ah, s);
      q.s = s; q.sd = V.norm(V.cross([0, 1, 0], V.sub(q.p, e)));
      q.a = al * Math.pow(1 - sat(s / 42), 1.3) * em(q.te);
      Q.push(q);
    }
    // the cap: the hit's own fireball cloud, carried highest and spreading, a cluster of billows
    {
      const s = Math.max(0, ah - CAP_TE * .5), q = smokeP(ah, s), sd = V.norm(V.cross([0, 1, 0], V.sub(q.p, e)));
      const rc = (10 + 1.5 * smR(s)) * ss(0, 1.2, ah), a = al * .3 * Math.pow(1 - sat(s / 42), 1.3) * ss(.05, .6, ah);
      if (rc > 1 && a > .004) for (let k = 0; k < CAP.length; k++) {
        const [u, v, rk] = CAP[k], c = V.add(V.mad(q.p, sd, rc * u), [0, rc * v, 0]), r = rc * rk * (.9 + .2 * M3.noise(ah * .3 + k, 1.9));
        W.disc(c, r, clamp(Math.round(r * fl / V.dist(c, e) / 1.2), 10, 24), a * (k ? .8 : 1));
      }
    }
    // edges and inner strands; the strands' kinks ride up with the parcels (keyed to emission time)
    for (const f of STRANDS) {
      const edge = f === -1 || f === 1;
      let pv = null, pa = 0;
      for (const q of Q) {
        const w = q.r * (edge ? .16 : .28) * M3.noise(q.te * .7 + f * 5.3, q.s * .25, 3.3);
        const p = V.mad(q.p, q.sd, q.r * f + w), a = q.a * (edge ? .5 : .2) * ss(0, .3, q.s);
        if (pv) W.seg(pv, p, (a + pa) * .5);
        pv = p; pa = a;
      }
    }
    // billows along the stem, alternating sides, riding up with their parcels (one per 1.1 s of emission)
    for (let k = Math.ceil(CAP_TE / 1.1); k * 1.1 < ah; k++) {
      const te = k * 1.1, s = ah - te, q = smokeP(ah, s), sd = V.norm(V.cross([0, 1, 0], V.sub(q.p, e)));
      const r = q.r * (.5 + .25 * hash(k, 5)), rpx = r * fl / V.dist(q.p, e);
      const ra = al * .26 * Math.pow(1 - sat(s / 42), 1.3) * ss(0, .8, s) * em(te);
      if (ra <= .004) continue;
      W.disc(V.mad(q.p, sd, q.r * (k % 2 ? .38 : -.38) * (.6 + .4 * hash(k, 3))), r, clamp(Math.round(rpx / 1.2), 10, 24), ra);
    }
  }

  /* wire part of the raid (segments into W; the caller has set a far fog) */
  OC.drawRaid = function (W, cam, T) {
    if (RAID.inWin(FL, T)) {
      for (const M of SAMS) {
        const s = T - M.tL;
        if (s <= 0) continue;
        samTrail(W, M, T, .62);
        // the plume: a short bright stroke behind the round while the motor burns
        if (s < M.end) {
          const p = samAt(M, s), boost = s < 2.6, Lp = boost ? .075 : .045;
          W.seg(samAt(M, Math.max(0, s - Lp)), p, boost ? .95 : .7);
        }
        // exhaust billowing off the cell, lingering over the cruiser
        if (s < 14) {
          const c = X.ap(OC.shipXf(FL, M.tL), M.cell);
          for (let k = 0; k < 4; k++) {
            const t0 = k * .25, a = s - t0; if (a <= 0) continue;
            const q = aged([c[0] + (hash(k, 11) - .5) * 40, c[1] + 8 + 16 * Math.sqrt(a) + 8 * k, c[2] + (hash(k, 13) - .5) * 50], a);
            W.disc(q, 12 + 9 * Math.sqrt(a) + 5 * k, 10, .15 * Math.pow(1 - a / 14, 1.4) * ss(0, .4, a));
          }
        }
      }
      // the incoming round: a faint point with a short streak, then the flash where the paths meet
      const ai = T - TI;
      if (ai > -2.8 && ai < 0) {
        const k = ss(-2.8, -1.8, ai);
        W.seg(inc1(T - .5), inc1(T), .3 * k);
        W.seg(inc1(T - .06), inc1(T), .8 * k);
      }
      if (ai >= 0 && ai < 16) {
        if (ai < 1.3) W.disc(XI, 25 + 230 * (1 - Math.exp(-ai / .45)), 28, .55 * Math.pow(1 - ai / 1.3, 1.6));
        if (ai < 1) W.disc(XI, 12 + 90 * (1 - Math.exp(-ai / .3)), 20, .4 * Math.pow(1 - ai, 2));
        drawSparks(W, XI, SPK1, ai, .75);
        for (let k = 0; k < 5; k++) {
          const a = ai - k * .07; if (a <= 0) continue;
          const q = aged([XI[0] + (hash(k, 41) - .5) * 60, XI[1] + (hash(k, 43) - .5) * 40, XI[2] + (hash(k, 47) - .5) * 60], a, 1.2);
          W.disc(q, 18 + 22 * Math.sqrt(a), 12, .26 * Math.pow(1 - a / 16, 1.5) * ss(.1, .8, a));
        }
      }
    }
    if (RAID.inWin(FP, T)) {
      // tracers
      for (const r of ROUNDS) {
        const a = T - r.tk;
        if (a <= 0 || a > TLIFE) continue;
        W.seg(roundAt(r, Math.max(0, a - .024)), roundAt(r, a), .85 * Math.pow(1 - a / TLIFE, 1.1) * ss(0, .03, a));
      }
      const ah = T - TH;
      if (ah > -3 && ah < 0) {
        const k = ss(-3, -2.2, ah);
        W.seg(inc2(T - .45), inc2(T), .25 * k);
        W.seg(inc2(T - .05), inc2(T), .75 * k);
      }
      if (ah >= 0) {
        const c = hitNow(T);
        if (ah < 1.4) W.disc(XH, 20 + 240 * (1 - Math.exp(-ah / .5)), 28, .5 * Math.pow(1 - ah / 1.4, 1.5));
        drawSparks(W, XH, SPK2, ah, .7);
        // fire at the hull: flickering tongues
        const fire = ss(.2, 1.2, ah) * (1 - .6 * ss(12, 20, ah));
        for (let k = 0; k < 6; k++) {
          const h = (8 + 16 * (.5 + .5 * M3.noise(T * 6 + k * 3.1, k))) * fire, x = (k - 2.5) * 3.2;
          W.seg([c[0] + x * .3, c[1], c[2] + x], [c[0] + x * .3 + WIND[0] * .8, c[1] + h, c[2] + x + WIND[2] * .8], .5 * fire);
        }
        drawColumn(W, cam, ah, 1);
      }
    }
  };
  /* additive glows for the canvas: {p, a, m (radius, m), px (min radius, px)} */
  OC.raidGlows = function (T) {
    const G = [];
    if (RAID.inWin(FL, T)) {
      for (const M of SAMS) {
        const s = T - M.tL;
        if (s <= 0 || s >= M.end) continue;
        const boost = s < 2.6, p = samAt(M, s);
        G.push({ p, a: (boost ? .34 : .17) * (.85 + .15 * M3.noise(T * 30, M.seed)), m: boost ? 60 : 36, px: 5 });
        if (s < .9) G.push({ p: X.ap(OC.shipXf(FL, M.tL), M.cell), a: .4 * (1 - s / .9), m: 110, px: 6 });
      }
      const ai = T - TI;
      if (ai >= 0 && ai < 3) G.push({ p: XI, a: .85 * Math.exp(-ai / .2) + .12 * Math.exp(-ai / 1.1), m: 380, px: 10, max: 150 });
    }
    if (RAID.inWin(FP, T)) {
      for (const [b0, b1] of BURSTS) if (T >= b0 && T <= b1 + .04) G.push({ p: X.ap(OC.shipXf(FP, T), CIWS), a: .16 * (.6 + .4 * M3.noise(T * 45, 2.2)), m: 30, px: 3 });
      const ah = T - TH;
      if (ah >= 0 && ah < 30) {
        const fire = .13 * ss(.3, 1.4, ah) * (1 - .55 * ss(12, 22, ah)) * (.72 + .28 * M3.noise(T * 8, 4.2));
        G.push({ p: hitNow(T), a: .8 * Math.exp(-ah / .3) + .2 * Math.exp(-ah / 1.8) + fire, m: 120 + 500 * Math.exp(-ah / .5), px: 6, max: 160 });
      }
    }
    return G;
  };
  RAID.hitAt = hitNow;
})();
