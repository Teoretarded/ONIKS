/* OF "Task Force" world: the carrier group (CVN in the middle, a cruiser and two destroyers around it), ship motion,
   the carrier's turn into the wind, sea, path-following wakes, radar pulses from every ship, stack shimmer, the far
   island, and the raid as data: twelve rounds from three bearings, the interceptors from every ship, the Phalanx
   engagements, the hit on the destroyer on the threat axis, its fire's smoke parcels, and the two F/A-18E launched from
   the bow catapults (elevator, taxi, stroke, free flight). Everything is a pure function of film time T (paths
   integrated once at load into tables). World: metres, X east, Y up, Z north; the group steams north at VK.

   Loop: the group travels LZ = VK*D north per loop. Everything that depends on world position repeats under that
   translation (swell wave numbers along Z quantised to LZ, whitecap cells hashed modulo LZ, the island rides with the
   group), every rate is quantised to D, and every event of the raid is over (and faded) before the seam, so render(T)
   at T -> D matches T = 0 in the group frame. Loads after geo.js + hd_land.js + hd_sea_air.js. */
(function () {
  'use strict';
  const { V, R, X, E } = M3;
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, G = 9.81, RE = 6.371e6;
  const sat = E.sat, ss = E.ss, mix = E.mix, clamp = E.clamp;
  const OF = window.OF = {};
  const D = OF.D = 168, VK = OF.VK = 8, LZ = OF.LZ = VK * D;       // loop 168 s, 15.6 kn, 1344 m per loop
  const fr = x => x - Math.floor(x);
  const hash = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const modp = (a, m) => ((a % m) + m) % m;
  const angD = (a, b) => modp(b - a + PI, TAU) - PI;
  const qw = w => Math.max(1, Math.round(w * D / TAU)) * TAU / D;   // angular rate that repeats every D
  const qf = f => Math.max(1, Math.round(f * D)) / D;               // cycles/s that repeat every D
  Object.assign(OF, { PI, TAU, D2R, G, RE, hash, modp, angD, qw, qf, fr });

  const DA = OF.DA = HD.destroyer.A;
  const CV_DECK = OF.CV_DECK = HD.carrier.DECK_Y, CATS = OF.CATS = HD.carrier.CATS;

  /* ---------------- Ticonderoga-class cruiser (no HD model: GEO prims, as in Underway) ---------------- */
  const CG_DY = z => 6.4 + 3.6 * Math.pow(Math.max(0, (z / 86.4 - .25) / .75), 2);
  function cruiser() {
    const { hex, box, lathe, cyl, panel, line } = GEO;
    const L = 172.8, zb = L / 2, dY = CG_DY;
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
  }
  OF.cruiser = cruiser;
  // CG Mk 41 cells: 0..29 forward module, 30..59 aft (5 across x 6 along, on the module tops)
  OF.cgCell = i => { const aft = i >= 30, k = i % 30, col = k % 5, row = Math.floor(k / 5), z = (aft ? -71 : 47) + row * 1.4; return [-2.6 + col * 1.3, CG_DY(aft ? -67.5 : 50.5) + .3, z]; };
  OF.CG_STACKS = [[0, 21.5, 2], [0, 20.5, -12.5]];
  // CVN Mk 29 launchers on the corner sponsons (launcher mouth, pointing direction in the ship frame)
  const CV_SP = [[25, 128, .5], [-26, 122, -.6], [30, -150, 2.4], [-29, -146, -2.3]];
  OF.cvLauncher = i => {
    const [x, z, a] = CV_SP[i], s = Math.sign(x), Xl = X.make(R.y(a), [x + s * 3, CV_DECK - 3.6, z]);
    return { p: X.ap(Xl, [0, 1.1, 2.3]), d: X.dir(Xl, [0, 0, 1]) };
  };

  /* ---------------- the group ----------------
     Offsets in the group frame (carrier = origin, north up). D1 is the picket on the threat axis (035, 1 km out),
     D2 the outer destroyer the camera rides along (045, 1.7 km), the cruiser to the east (080): the whole screen faces the coast, 035..125. */
  const SHIPS = OF.SHIPS = [
    { id: 'CV', kind: 'cvn', off: [0, 0, 0], ph: 4.1, L: 332.8, B: 40.8 },
    { id: 'D1', kind: 'ddg', off: [574, 0, 819], ph: 1.2, L: 155.2, B: 20 },
    { id: 'D2', kind: 'ddg', off: [1202, 0, 1202], ph: 0, L: 155.2, B: 20 },
    { id: 'CG', kind: 'cg', off: [1083, 0, 191], ph: 2.3, L: 172.8, B: 16.8 },
  ];
  const SID = OF.SID = {}; SHIPS.forEach((s, i) => { s.n = i; SID[s.id] = s; });
  const [SCV, SD1, SD2, SCG] = SHIPS;

  /* the carrier's turn into the wind: 25° to starboard after the hit, launches, then back past the track to port
     so the lateral offset it built up is gone at the seam (psiB solved at load). It keeps station along the track,
     so its speed through the water is VK / cos(psi). */
  const TURN = OF.TURN = { a0: 85, a1: 96, b0: 123, b1: 133, c0: 146, c1: 161, psi: 25 * D2R, psiB: 0 };
  const cvHead = T => TURN.psi * (ss(TURN.a0, TURN.a1, T) - ss(TURN.b0, TURN.b1, T)) - TURN.psiB * (ss(TURN.b0, TURN.b1, T) - ss(TURN.c0, TURN.c1, T));
  const CVN_ = D * 60, CVX = new Float64Array(CVN_ + 1);
  const integ = () => { for (let i = 1; i <= CVN_; i++) { const a = (i - 1) / 60, b = i / 60; CVX[i] = CVX[i - 1] + VK * (Math.tan(cvHead(a)) + Math.tan(cvHead(b))) * .5 / 60; } return CVX[CVN_]; };
  { let lo = 0, hi = 70 * D2R; for (let k = 0; k < 60; k++) { TURN.psiB = (lo + hi) / 2; if (integ() > 0) lo = TURN.psiB; else hi = TURN.psiB; } integ(); }
  const cvDx = T => { const x = modp(T, D) * 60, i = Math.min(CVN_ - 1, Math.floor(x)); return CVX[i] + (CVX[i + 1] - CVX[i]) * (x - i); };
  OF.cvHead = T => cvHead(modp(T, D));
  OF.cvDx = cvDx;

  OF.head = (S, T) => S.kind === 'cvn' ? cvHead(modp(T, D)) : 0;
  OF.shipPos = (S, T) => [S.off[0] + (S.kind === 'cvn' ? cvDx(T) : 0), 0, S.off[2] + VK * T];
  OF.shipVel = (S, T) => [S.kind === 'cvn' ? VK * Math.tan(OF.head(S, T)) : 0, 0, VK];
  const W1 = qw(.7), W2 = qw(1.23), W3 = qw(.9), W4 = qw(.8);
  function shipMot(S, T) {
    const p = S.ph, k = S.kind === 'cvn' ? .22 : S.kind === 'cg' ? .9 : 1;
    // a turning carrier heels a little outboard
    const heel = S.kind === 'cvn' ? -.9 * D2R * (OF.head(S, T + .5) - OF.head(S, T - .5)) / (5 * D2R) : 0;
    return {
      roll: k * 1.1 * D2R * (.8 * Math.sin(W1 * T + p) + .2 * Math.sin(W2 * T + 2.1 + p)) + heel,
      pitch: k * .35 * D2R * Math.sin(W3 * T + 1 + p),
      heave: k * .3 * Math.sin(W4 * T + .4 + p),
    };
  }
  OF.shipMot = shipMot;
  OF.shipXf = (S, T) => { const m = shipMot(S, T), p = OF.shipPos(S, T), h = OF.head(S, T); return X.make(R.mul(R.y(h), R.mul(R.z(m.roll), R.x(m.pitch))), [p[0], m.heave, p[2]]); };
  OF.shipFrame = (S, T) => X.make(R.y(OF.head(S, T)), OF.shipPos(S, T));
  // group frame: the carrier's slot, north up (the camera's reference)
  OF.groupAt = T => [0, 0, VK * T];
  const halfB = (S, z) => {
    if (S.kind === 'cvn') { const u = z / (S.L / 2); if (u > .45) return 20.4 * Math.max(0, 1 - Math.pow((u - .45) / .52, 1.8)); if (u < -.8) return 20.4 * .8; return 20.4; }
    const u = z / (S.L / 2), B = S.B / 2; if (u > .3) return B * Math.max(0, 1 - Math.pow((u - .3) / .7, 1.75)); if (u < -.85) return B * .86; return B;
  };
  OF.halfB = halfB;
  const toShip = (Xs, w) => { const M = Xs.R; return [M[0] * w[0] + M[3] * w[1] + M[6] * w[2], M[1] * w[0] + M[4] * w[1] + M[7] * w[2], M[2] * w[0] + M[5] * w[1] + M[8] * w[2]]; };
  OF.toShip = toShip;

  /* ---------------- sea ----------------
     Gravity-wave swell; frequencies quantised to D and the along-track wave numbers to LZ, so the sea seen from the
     group frame repeats exactly every loop. */
  const WAVES = [
    { A: 1.15, L: 150, d: .25, ph: 0 }, { A: .68, L: 84, d: -.7, ph: 1.7 }, { A: .38, L: 46, d: 1.1, ph: 4.1 },
    { A: .2, L: 29, d: -.3, ph: 2.2 }, { A: .1, L: 17, d: .62, ph: 5.3 },
  ].map(w => {
    const k = TAU / w.L, n = Math.max(1, Math.round(Math.sqrt(G * k) * D / TAU));
    const kz = Math.round(k * Math.cos(w.d) * LZ / TAU) * TAU / LZ;
    return { A: w.A, kx: k * Math.sin(w.d), kz, w: n * TAU / D, ph: w.ph };
  });
  function swell(x, z, T) { let h = 0; for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * x + w.kz * z - w.w * T + w.ph); } return h; }
  OF.swell = swell;

  // is (x, z) inside a ship's waterplane? ships: [{S, x, z, h (heading), r2}]
  const inHull = (s, x, z, pad) => {
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz > s.r2) return false;
    const c = Math.cos(s.h), sn = Math.sin(s.h), lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    return Math.abs(lz) < s.S.L / 2 + pad && Math.abs(lx) < halfB(s.S, lz) + pad * .8;
  };
  OF.inHull = inHull;

  /* sea rows (as Underway/Ring): straight lines across the view on the water in power-of-two spacing levels, their
     offset following the camera's own travel, heights from the swell, curvature drop to a true horizon */
  const SEA = { C: 15, S0: 1, base: .2 };
  OF.drawSea = function (W, cam, T, ph, o) {
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
    const cutAt = (x, z) => { for (let k = 0; k < ships.length; k++) if (inHull(ships[k], x, z, 1.5)) return true; return false; };
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

  /* whitecaps: seeded world cells, hashed modulo the loop's travel along Z (cells 10.5 m * 2^k divide 1344 m) */
  const CAP_T = qf(3 / D) * TAU;
  OF.drawCaps = function (W, cam, T, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(1, e[1]);
    const lv = clamp(Math.round(Math.log2(h / 30)), 0, 6), c = 10.5 * Math.pow(2, lv), P = Math.round(LZ / c), N = 24;
    let fx = cam.f[0], fz = cam.f[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const cx = e[0] + fx * c * N * .8, cz = e[2] + fz * c * N * .8;
    const i0 = Math.floor(cx / c) - N, j0 = Math.floor(cz / c) - N, ships = o.ships || [];
    const A0 = .4 * (o.alpha === undefined ? 1 : o.alpha), Lk = c / 9;
    for (let i = i0; i < i0 + 2 * N; i++) for (let j = j0; j < j0 + 2 * N; j++) {
      const jm = modp(j, P), hh = hash(i, jm); if (hh > .22) continue;
      const x = (i + hash(jm, i + 7)) * c, z = (j + hash(i + 3, jm - 5)) * c;
      let cut = false;
      for (const s of ships) if (inHull(s, x, z, 6)) { cut = true; break; }
      if (cut) continue;
      const sw = swell(x, z, T), crest = sat((sw - .35) / 1.1);
      if (crest <= 0) continue;
      const dist = Math.hypot(x - e[0], z - e[2], h);
      const a = A0 * crest * Math.pow(1 - Math.min(1, dist / (c * N * 1.6)), 1.5) * (.55 + .45 * Math.sin(CAP_T * T + hh * 40));
      if (a < .01) continue;
      const len = Lk * (1.2 + 2.6 * hash(i + 11, jm)), y = sw * Math.min(1, 220 / dist + .12) + .05;
      W.seg([x, y, z - len * .5], [x + .3 * Lk, y, z + len * .5], a);
    }
  };

  /* Kelvin wake + bow wave + churned centreline. Points along the hull ride the ship's heading frame; points behind
     the stern stay in the water where the stern laid them, so a turning ship leaves a curved wake: the stern's own
     path at T - age, offset across it along the path's smoothed direction (a ±6 s chord, the way the wave pattern
     smooths the turn rather than kinking with each change of helm). Foam drifts aft at the ship's speed; every
     flicker rate repeats every D. */
  const LAM = TAU * VK * VK / G, KEL = 19.47 * D2R, TK = Math.tan(KEL);
  const WK = { a: qw(1.3), b: qw(1.7), c: qf(.9), d: qf(.7), e: qw(.56) / VK };
  const sternAt = (S, t) => { const p = OF.shipPos(S, t), h = OF.head(S, t); return [p[0] - Math.sin(h) * S.L / 2, 0, p[2] - Math.cos(h) * S.L / 2]; };
  OF.drawWake = function (W, S, T, o) {
    o = o || {};
    const L = S.L, zb = L / 2, zs = -L / 2, bw = (S.kind === 'cvn' ? 40.8 : S.B) / 2, A = o.alpha === undefined ? 1 : o.alpha;
    const turns = S.kind === 'cvn';
    const F0 = OF.shipFrame(S, T), FC = new Map();
    const pathAt = k => {
      let f = FC.get(k);
      if (!f) {
        const t = T - k / 4, s = sternAt(S, t), a = sternAt(S, t - 6), b = sternAt(S, t + 6), h = Math.atan2(b[0] - a[0], b[2] - a[2]);
        f = [s[0], s[2], Math.cos(h), -Math.sin(h)]; FC.set(k, f);
      }
      return f;
    };
    const P = (x, z, y) => {
      y = y === undefined ? .12 : y;
      if (!turns || z >= zs) return X.ap(F0, [x, y, z]);
      const age = (zs - z) / VK, k0 = Math.floor(age * 4), f = age * 4 - k0, a = pathAt(k0), b = pathAt(k0 + 1);
      return [mix(a[0] + a[2] * x, b[0] + b[2] * x, f), y, mix(a[1] + a[3] * x, b[1] + b[3] * x, f)];
    };
    const Lw = S.kind === 'cvn' ? 1100 : 900, NK = turns ? 64 : 26;
    for (const sg of [-1, 1]) {
      let pv = P(sg * bw * .35, zb - 4);
      for (let i = 1; i <= NK; i++) {
        const l = i / NK * Lw, z = zb - 4 - l, x = sg * (bw * .35 + l * TK) + 1.1 * Math.sin(i * 1.7 * 26 / NK + T * WK.a);
        const q = P(x, z);
        W.seg(pv, q, A * .32 * Math.pow(1 - i / (NK + 1), 1.2));
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
        const f = fr(T * WK.c + k * .37), zz = zb - 2 - k * 2.2;
        W.seg(P(sg * (.4 + k * .9), zz, .3 + .6 * (1 - f)), P(sg * (1.2 + k * 1.1), zz - 1.6, .15), A * .28 * (1 - f));
      }
      for (let k = 0; k < 10; k++) { const z = zb - 20 - k * 12; const x = sg * (halfB(S, z) + 1.6 + .8 * Math.sin(k * 2.3 + T * WK.b)); W.seg(P(x, z), P(x + sg * .6, z - 8), A * .2); }
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
    const sp = 12, cyc = Math.floor((T * VK) / sp), nC = S.kind === 'cvn' ? 64 : 52;
    for (let i = 0; i < nC; i++) {
      const z0 = zs - 2 - i * sp - modp(T * VK, sp), wide = bw * .42 + (zs - z0) * .028, fade = Math.pow(1 - i / (nC + 1), 1.2);
      for (let j = 0; j < 5; j++) {
        const cm = modp(cyc - i, LZ / sp), hh = hash(i * 5 + j, cm), x0 = wide * (hh * 2 - 1) * .92, len = 3 + 5 * hash(cm, j + 11);
        W.seg(P(x0, z0 - j * 2.1), P(x0 + .4 * (hh - .5), z0 - j * 2.1 - len), A * .3 * fade * (1 - .5 * Math.abs(hh * 2 - 1)));
      }
    }
    for (const sg of [-1, 1]) {
      let pv = null;
      const n = S.kind === 'cvn' ? 56 : 40;
      for (let i = 0; i <= n; i++) {
        const d = i * 16, z = zs - 1 - d, w = bw * .42 + d * .028 + .9 * Math.sin(i * 1.9 + sg + (T * VK - d) * WK.e);
        const q = P(sg * w, z);
        if (pv) W.seg(pv, q, A * .3 * Math.pow(1 - i / (n + 1), 1.3));
        pv = q;
      }
    }
    for (let k = 0; k < 6; k++) { const f = fr(T * WK.d + k / 6); W.seg(P(-bw * .6 * (1 - f), zs - 1 - f * 10), P(bw * .6 * (1 - f), zs - 1 - f * 10), A * .2 * (1 - f)); }
  };

  /* heat shimmer over the uptakes (column leans aft in the relative wind) */
  const SH = { a: qw(9.5), b: qw(15.7), c: qw(11.3) };
  OF.drawShimmer = function (W, mouth, up, aft, side, T, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, n = o.n || 9, Lp = o.len || 15;
    const out = V.norm(V.cross(up, aft));
    for (let i = 0; i < n; i++) {
      const ph = i * 2.39, lat = ((i + .5) / n - .5) * (o.w || 2.6);
      let pv = null;
      for (let k = 0; k <= 22; k++) {
        const s = k / 22 * Lp, rise = s * .74, lean = s * .68 + .016 * s * s;
        const amp = .05 + s * .03;
        const wob = amp * (Math.sin(2.3 * s - SH.a * T + ph) + .6 * Math.sin(4.1 * s - SH.b * T + ph * 1.7));
        const q = V.add(V.add(V.mad(V.mad(mouth, up, rise), aft, lean), V.mul(side, lat * (1 + s * .05) + wob)), V.mul(out, amp * .8 * Math.sin(3.1 * s - SH.c * T + ph)));
        if (pv) W.seg(pv, q, A * .17 * Math.pow(1 - s / Lp, 1.2) * ss(0, 1.5, s));
        pv = q;
      }
    }
  };

  /* the far island (seed-1337 theatre contours), ~34 km SW; it rides with the group (at that range the parallax of
     1.3 km of travel is invisible), so it stands in the same place at the seam */
  const W0 = [158.5, 288.9];
  const ISL = {
    0: [[136.7, 275.53], [143.71, 275.53], [144.71, 274.56], [145.83, 274.53], [148.71, 272.58], [149.71, 272.53], [152.72, 269.52], [152.75, 268.52], [154.72, 265.52], [154.81, 263.51], [155.72, 262.51], [155.72, 257.5], [154.8, 256.5], [154.72, 254.5], [152.75, 251.49], [152.72, 250.49], [149.71, 247.49], [148.71, 247.41], [146.71, 245.48], [144.71, 245.46], [143.71, 244.48], [136.69, 244.48], [135.69, 245.4], [133.69, 245.48], [132.69, 246.47], [131.69, 246.49], [126.68, 251.49], [125.66, 254.5], [124.68, 255.5], [124.68, 264.52], [125.66, 265.52], [126.68, 268.52], [131.69, 273.53], [132.69, 273.54], [133.69, 274.53], [135.69, 274.6], [136.7, 275.53]],
    60: [[138.56, 269.52], [142.7, 269.48], [144.64, 268.52], [148.29, 264.52], [149.41, 261.51], [148.22, 255.5], [146.63, 252.5], [145.71, 251.51], [141.7, 250.21], [137.7, 250.52], [134.56, 252.5], [131.69, 254.54], [130.0, 258.51], [130.15, 260.51], [131.83, 265.52], [134.69, 268.22], [138.56, 269.52]],
    140: [[138.01, 266.52], [140.7, 266.65], [143.71, 265.69], [146.71, 260.89], [144.07, 254.5], [140.7, 252.81], [137.7, 253.43], [135.69, 254.5], [133.33, 256.5], [132.5, 258.51], [132.53, 260.51], [134.94, 264.52], [138.01, 266.52]],
    220: [[137.47, 263.51], [138.7, 264.29], [141.7, 263.2], [142.7, 262.7], [144.27, 260.51], [141.7, 257.4], [136.7, 257.25], [134.57, 258.51], [134.59, 260.51], [137.47, 263.51]],
  };
  const ISLW = Object.entries(ISL).map(([lv, pts]) => ({ lv: +lv, p: pts.map(q => [(q[0] - W0[0]) * 1000, +lv, (q[1] - W0[1]) * 1000]) }));
  OF.drawIsland = function (W, cam, T, o) {
    o = o || {};
    const e = cam.eye, h = Math.max(.6, e[1]), dh = Math.sqrt(2 * RE * h), A = o.alpha === undefined ? 1 : o.alpha, gz = VK * T;
    for (const c of ISLW) {
      const lim = dh + Math.sqrt(2 * RE * Math.max(1, c.lv)), al = A * (c.lv === 0 ? .2 : .13);
      let pv = null;
      for (let i = 0; i < c.p.length; i++) {
        const a = c.p[i], b = c.p[(i + 1) % c.p.length];
        for (let k = 0; k < 3; k++) {
          const q = V.lerp(a, b, k / 3), d = Math.hypot(q[0] - e[0], q[2] + gz - e[2]);
          if (d > lim) { pv = null; continue; }
          const p = [q[0], q[1] - d * d / (2 * RE), q[2] + gz];
          if (pv) W.seg(pv, p, al);
          pv = p;
        }
      }
    }
  };

  /* =====================================================================================================
     THE RAID
     Twelve P-800 Oniks (3M55) rounds in three groups of four from 035, 080 and 125 (the coast). Each clears the horizon R0 out,
     flies ~Mach 2 at sea-skimming height at the carrier, weaving a little. Every outcome is fixed data: ten are
     stopped far out by interceptors from every ship, A3 by D2's forward Phalanx ~600 m off its bow, and A4 weaves through,
     streaks past D2 (its aft Phalanx firing) and strikes D1, which stands on the 035 axis between it and the carrier.
     Spectacle, not tactics.
     ===================================================================================================== */
  const VR = OF.VR = 680, R0 = OF.R0 = 28000;
  const HIT_P = OF.HIT_P = [9.7, 8.2, -6];            // D1: starboard side abreast the aft uptake (ship frame)
  const CV_AIM = [0, 12, 0];
  // brg: bearing it comes from (deg); t0: clears the horizon; lat: start offset across its line (m); y: cruise height;
  // wv: weave [amp m, period s, phase]; dK: killed this far from its aim (m) by an interceptor; ciws / hit: see below
  const RDEF = [
    { id: 'A1', g: 'A', brg: 35, t0: 16.0, lat: -300, y: 12, wv: [16, 5.4, .3], dK: 14000 },
    { id: 'A2', g: 'A', brg: 35, t0: 17.2, lat: 260, y: 10.5, wv: [14, 6.1, 2.2], dK: 12000 },
    { id: 'A3', g: 'A', brg: 35, t0: 0, lat: 110, y: 11, wv: [22, 4.8, 1.3], ciws: { s: 'D2', m: 0, d: 600 } },
    { id: 'A4', g: 'A', brg: 35, t0: 0, lat: -160, y: 10, wv: [48, 3.5, .6], hit: { s: 'D1', t: 81.0 } },
    { id: 'B1', g: 'B', brg: 80, t0: 19.0, lat: -350, y: 12, wv: [15, 5.2, 1.1], dK: 15000 },
    { id: 'B2', g: 'B', brg: 80, t0: 20.1, lat: 300, y: 11, wv: [18, 5.8, 4.0], dK: 13000 },
    { id: 'B3', g: 'B', brg: 80, t0: 28.6, lat: 150, y: 13, wv: [12, 6.3, 2.7], dK: 10000 },
    { id: 'B4', g: 'B', brg: 80, t0: 30.0, lat: -80, y: 10, wv: [20, 4.6, 2.4], dK: 5200 },
    { id: 'C1', g: 'C', brg: 125, t0: 17.8, lat: 280, y: 12, wv: [15, 5.5, .9], dK: 16000 },
    { id: 'C2', g: 'C', brg: 125, t0: 18.6, lat: -240, y: 11, wv: [17, 6.0, 3.3], dK: 15000 },
    { id: 'C3', g: 'C', brg: 125, t0: 27.0, lat: -120, y: 10, wv: [18, 4.4, 5.1], dK: 11000 },
    { id: 'C4', g: 'C', brg: 125, t0: 29.5, lat: 200, y: 12, wv: [15, 5.1, .2], dK: 7000 },
  ];
  const ROUNDS = OF.ROUNDS = RDEF.map((d, i) => {
    const r = Object.assign({ i, aimS: SCV, aim: CV_AIM }, d);
    const b = r.brg * D2R;
    r.u = [Math.sin(b), 0, Math.cos(b)];
    r.n = [Math.cos(b), 0, -Math.sin(b)];
    if (r.hit) { r.aimS = SID[r.hit.s]; r.aim = HIT_P; r.tArr = r.hit.t; r.t0 = r.tArr - R0 / VR; r.end = 'hit'; }
    else if (r.ciws) r.end = 'ciws';
    else { r.end = 'int'; r.tArr = r.t0 + R0 / VR; r.tK = r.t0 + (R0 - r.dK) / VR; }
    return r;
  });
  const RID = OF.RID = {}; ROUNDS.forEach(r => RID[r.id] = r);
  function setAim(r) { r.aimW = X.ap(OF.shipXf(r.aimS, r.tArr), r.aim); }
  function roundAt(r, T) {
    const s = VR * (r.tArr - T), taper = s / R0;
    const wv = r.wv[0] * Math.sin(TAU * (T - r.t0) / r.wv[1] + r.wv[2]) * ss(1100, 3800, s);
    const lat = r.lat * taper + wv;
    let y = r.y + .8 * Math.sin(.9 * T + r.i);
    if (r.end === 'hit') y = mix(r.aimW[1], y, ss(0, 900, s));
    const a = r.aimW;
    return [a[0] + r.u[0] * s + r.n[0] * lat, y, a[2] + r.u[2] * s + r.n[2] * lat];
  }
  OF.roundAt = roundAt;
  // A3: its line is the carrier's 035 axis; D2's forward Phalanx stops it `d` m out. Clears the horizon so that
  // happens at 70.6 s: solve the time along its own line (the carrier's aim point moves only 8 m/s).
  {
    const r = RID.A3, S = SID[r.ciws.s], want = 70.6;
    let t0 = 30; for (let it = 0; it < 6; it++) {
      r.t0 = t0; r.tArr = t0 + R0 / VR; setAim(r);
      let tk = r.t0; for (let T = r.t0; T < r.tArr; T += .005) { const p = roundAt(r, T), c = OF.shipPos(S, T); if (Math.hypot(p[0] - c[0], p[2] - c[2]) < r.ciws.d) { tk = T; break; } }
      t0 += want - tk;
    }
  }
  for (const r of ROUNDS) setAim(r);
  { const r = RID.A3, S = SID[r.ciws.s]; for (let T = r.t0; T < r.tArr; T += .002) { const p = roundAt(r, T), c = OF.shipPos(S, T); if (Math.hypot(p[0] - c[0], p[2] - c[2]) < r.ciws.d) { r.tK = T; break; } } }
  RID.A4.tK = RID.A4.tArr;
  for (const r of ROUNDS) r.tEnd = r.tK;
  OF.roundDir = (r, T) => V.norm(V.sub(roundAt(r, T + .02), roundAt(r, T - .02)));
  OF.roundDist = (r, T, S) => { const p = roundAt(r, T), c = OF.shipPos(S || SCV, T); return Math.hypot(p[0] - c[0], p[2] - c[2]); };
  /* 0..1 how much of round r is there at T (clears the horizon; stage B paints the stop) */
  OF.roundVis = (r, T) => ss(r.t0, r.t0 + 1.2, T) * (1 - ss(r.tEnd - .06, r.tEnd, T));
  OF.roundLive = (r, T) => T >= r.t0 && T < r.tEnd;
  // A4 closest to D2 (its aft Phalanx fires as it streaks past)
  { const r = RID.A4, S = SD2; let best = 1e9; for (let T = r.tArr - 4; T < r.tArr; T += .002) { const d = OF.roundDist(r, T, S); if (d < best) { best = d; r.tPass = T; r.dPass = d; } } }

  /* ---------------- interceptors ----------------
     s: ship; c: cell (DDG Mk 41 0..95 as HD.destroyer.A.vls, CG 0..59 as OF.cgCell, CV Mk 29 launcher 0..3);
     tL: launch; r: the round; role: 'kill' (meets it at its tK), 'second' (the salvo partner, into the debris
     just after), 'miss' (passes it by `miss` m at tI and flies on until it self-destructs).
     VLS rounds leave the cell straight up, clear the superstructure, then fly a lofted curve down onto the meeting
     point with a boost-then-coast speed law; Mk 29 rounds leave their trainable launcher already pointed. */
  const IDEF = [
    { s: 'CG', c: 3, tL: 23.0, r: 'C1', role: 'kill' },
    { s: 'CG', c: 8, tL: 23.6, r: 'C1', role: 'second' },
    { s: 'D1', c: 5, tL: 24.2, r: 'A1', role: 'kill' },
    { s: 'D2', c: 40, tL: 25.0, r: 'A1', role: 'second' },
    { s: 'CG', c: 36, tL: 25.4, r: 'C2', role: 'kill' },
    { s: 'CG', c: 41, tL: 26.1, r: 'C2', role: 'second' },
    { s: 'D2', c: 48, tL: 26.5, r: 'B1', role: 'kill' },
    { s: 'D2', c: 55, tL: 27.2, r: 'B1', role: 'second' },
    { s: 'D1', c: 22, tL: 27.8, r: 'A2', role: 'kill' },
    { s: 'CG', c: 14, tL: 28.6, r: 'A2', role: 'second' },
    { s: 'D1', c: 70, tL: 30.2, r: 'B2', role: 'kill' },
    { s: 'D2', c: 12, tL: 31.0, r: 'B2', role: 'second' },
    { s: 'CG', c: 20, tL: 40.5, r: 'C3', role: 'kill' },
    { s: 'CG', c: 47, tL: 41.2, r: 'C3', role: 'second' },
    { s: 'D2', c: 60, tL: 44.0, r: 'B3', role: 'kill' },
    { s: 'D1', c: 44, tL: 44.6, r: 'B3', role: 'second' },
    { s: 'D2', c: 26, tL: 50.5, r: 'A3', role: 'miss', tI: 61.2, miss: 38 },
    { s: 'CV', c: 2, tL: 53.4, r: 'C4', role: 'kill', mk29: true },
    { s: 'CV', c: 2, tL: 54.0, r: 'C4', role: 'second', mk29: true },
    { s: 'CG', c: 31, tL: 55.2, r: 'B4', role: 'kill' },
    { s: 'D1', c: 17, tL: 57.6, r: 'A4', role: 'miss', tI: 68.2, miss: 34 },
  ];
  const HZ = 60, KB = 5.5, CV0 = .03;
  function cellPoint(S, c) { return S.kind === 'ddg' ? DA.vls(c) : S.kind === 'cg' ? OF.cgCell(c) : OF.cvLauncher(c).p; }
  const INTS = OF.INTS = IDEF.map((d, i) => {
    const I = Object.assign({ i }, d), r = RID[I.r], S = SID[I.s];
    I.S = S; I.round = r;
    if (I.role === 'kill') I.tI = r.tK;
    else if (I.role === 'second') I.tI = r.tK + .35;
    const Xs = OF.shipXf(S, I.tL), P0 = X.ap(Xs, cellPoint(S, I.c));
    let PI_ = roundAt(r, I.role === 'second' ? r.tK : I.tI);
    if (I.role === 'second') PI_ = V.add(PI_, V.mul(r.u, -VR * .35 * .15));
    if (I.miss) PI_ = V.add(PI_, V.add(V.mul(r.n, I.miss), [0, 9, 0]));
    const hv = [PI_[0] - P0[0], 0, PI_[2] - P0[2]], dist = Math.hypot(hv[0], hv[2]), uh = V.mul(hv, 1 / dist);
    let PV, P1, P2, NV;
    if (I.mk29) {
      // Mk 29: trained toward the threat, elevated ~32°; a flatter, shorter loft
      const up = 32 * D2R, dir = V.norm(V.add(V.mul(uh, Math.cos(up)), [0, Math.sin(up), 0]));
      PV = V.mad(P0, dir, 40); NV = 18;
      P1 = V.mad(V.add(PV, [0, clamp(.018 * dist, 40, 140), 0]), uh, .25 * dist);
      P2 = V.add(V.mad(PI_, uh, -.3 * dist), [0, clamp(.014 * dist, 20, 90), 0]);
    } else {
      PV = V.add(P0, [0, 55, 0]); NV = 40;
      P1 = V.add(PV, [0, clamp(.022 * dist, 80, 280), 0]);
      P2 = V.add(V.mad(PI_, uh, -.34 * dist), [0, clamp(.021 * dist, 50, 250), 0]);
    }
    const bez = u => { const a = 1 - u; return [0, 1, 2].map(c => a * a * a * PV[c] + 3 * a * a * u * P1[c] + 3 * a * u * u * P2[c] + u * u * u * PI_[c]); };
    const NB = 840, cum = new Float64Array(NB + 1), pts = [];
    for (let k = 0; k <= NB; k++) { pts.push(k <= NV ? V.lerp(P0, PV, k / NV) : bez((k - NV) / (NB - NV))); if (k) cum[k] = cum[k - 1] + V.dist(pts[k], pts[k - 1]); }
    const L = cum[NB], Tf = I.tI - I.tL;
    const g = t => CV0 + (1 - CV0) * ss(0, KB, t), FN = Math.ceil(Tf * 240), FT = new Float64Array(FN + 1);
    for (let k = 1; k <= FN; k++) { const a = (k - 1) / 240, b = k / 240; FT[k] = FT[k - 1] + (g(a) + g(b)) * .5 / 240; }
    const F = t => { const x = clamp(t * 240, 0, FN - 1e-6), k = Math.floor(x); return FT[k] + (FT[k + 1] - FT[k]) * (x - k); };
    const vEnd = L * g(Tf) / F(Tf);
    const tail = I.role === 'miss' ? 1.8 : 0, N = Math.ceil((Tf + tail) * HZ) + 1, P = new Float64Array(N * 3);
    let k = 0;
    // a miss flies on past its round, levelled off (its end dive would take it into the sea before it self-destructs)
    const endDir0 = V.norm(V.sub(pts[NB], pts[NB - 4])), endDir = I.role === 'miss' ? V.norm([endDir0[0], Math.max(endDir0[1], .025), endDir0[2]]) : endDir0;
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
    Object.assign(I, { P0, PI: PI_, P, N, L, vEnd, tEnd: I.tI + tail, dist });
    return I;
  });
  function intAt(I, T) {
    const x = (T - I.tL) * HZ;
    if (x < 0 || T > I.tEnd) return null;
    const j = Math.min(I.N - 2, Math.floor(x)), f = Math.min(1, x - j), P = I.P, a = j * 3;
    return [P[a] + (P[a + 3] - P[a]) * f, P[a + 1] + (P[a + 4] - P[a + 1]) * f, P[a + 2] + (P[a + 5] - P[a + 2]) * f];
  }
  OF.intAt = intAt;
  OF.intDir = (I, T) => { const a = intAt(I, Math.max(I.tL, T - .03)), b = intAt(I, Math.min(I.tEnd, T + .03)); return a && b ? V.norm(V.sub(b, a)) : [0, 1, 0]; };
  OF.intTrace = (I, T, step) => {
    const out = [], jN = Math.min(I.N - 1, Math.floor((Math.min(T, I.tEnd) - I.tL) * HZ));
    for (let j = 0; j <= jN; j += step || 3) out.push([I.P[j * 3], I.P[j * 3 + 1], I.P[j * 3 + 2]]);
    const h = intAt(I, Math.min(T, I.tEnd)); if (h) out.push(h);
    return out;
  };
  // Mk 41 hatches (destroyers): open ~1.4 s before the launch, close ~3 s after
  OF.vlsOpen = function (S, T) {
    if (S.kind !== 'ddg') return null;
    const out = [];
    for (const I of INTS) { if (I.S !== S) continue; const f = ss(I.tL - 1.5, I.tL - .7, T) * (1 - ss(I.tL + 2.6, I.tL + 3.6, T)); if (f > .001) out.push([I.c, f]); }
    return out.length ? out : null;
  };

  /* ---------------- Phalanx 1B engagements (destroyers; m 0 forward, 1 aft) ----------------
     Each slews onto its round (leading it by the tracer's time of flight) from tS, fires t0..t1, and trains back to
     rest after its last one. A3's kill ends its burst; the two on A4 fire until it is past / has struck. */
  const CIWS_REST = [[0, .35], [PI, .35]];
  const CIWS_ENG = OF.CIWS_ENG = [
    { s: 'D2', m: 0, r: 'A3', b: 2.5, kill: true },
    { s: 'D2', m: 1, r: 'A4', b: 1.25, pass: true },
    { s: 'D1', m: 0, r: 'A4', b: 1.4, late: true },
  ];
  for (const e of CIWS_ENG) {
    e.S = SID[e.s]; e.round = RID[e.r];
    e.t1 = e.kill ? e.round.tK : e.pass ? e.round.tPass + .3 : e.round.tArr - .05;
    e.t0 = e.t1 - e.b;
    e.tS = e.t0 - (e.kill ? 3.2 : 2.4);
  }
  const CIWS_P = OF.CIWS_P = [DA.ciws({}, 0), DA.ciws({}, 1)];
  function aimAngles(from, w, Xs) {
    const d = toShip(Xs, V.sub(w, X.ap(Xs, from)));
    return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))];
  }
  function ciwsAim(e, T, Xs) {
    const r = e.round, tt = Math.min(T, r.tEnd - .02);
    let p = roundAt(r, tt);
    for (let k = 0; k < 2; k++) p = roundAt(r, Math.min(r.tEnd - .02, tt + V.dist(p, X.ap(Xs, CIWS_P[e.m])) / 1030));
    return aimAngles(CIWS_P[e.m], p, Xs);
  }
  OF.ciwsState = function (S, T) {
    const yaw = [CIWS_REST[0][0], CIWS_REST[1][0]], pit = [CIWS_REST[0][1], CIWS_REST[1][1]];
    if (S.kind !== 'ddg') return { yaw, pitch: pit };
    let Xs = null;
    for (let m = 0; m < 2; m++) {
      let y = CIWS_REST[m][0], p = CIWS_REST[m][1], last = null;
      for (const e of CIWS_ENG) {
        if (e.S !== S || e.m !== m || T < e.tS) continue;
        Xs = Xs || OF.shipXf(S, T);
        const [ay, ap] = ciwsAim(e, T, Xs), w = ss(e.tS, e.tS + 1.2, T);
        y = y + angD(y, ay) * w; p = mix(p, ap, w); last = e;
      }
      if (last) { const w = ss(last.t1 + 1.6, last.t1 + 4.4, T); y = y + angD(y, CIWS_REST[m][0]) * w; p = mix(p, CIWS_REST[m][1], w); }
      yaw[m] = y; pit[m] = p;
    }
    return { yaw, pitch: pit };
  };
  // gatling spin: 4 500 rds/min over six barrels = 12.5 rev/s; spun up just before a burst, run down after
  const SPIN_HZ = 240, SPIN_N = Math.ceil(D * SPIN_HZ) + 2;
  const spinRate = (S, m, T) => { let w = 0; for (const e of CIWS_ENG) if (e.S === S && e.m === m) w = Math.max(w, ss(e.t0 - .45, e.t0 - .05, T) * (1 - ss(e.t1 + .1, e.t1 + 1.3, T))); return w * 12.5 * TAU; };
  const SPIN = {};
  for (const S of [SD1, SD2]) {
    SPIN[S.id] = [new Float64Array(SPIN_N), new Float64Array(SPIN_N)];
    for (let m = 0; m < 2; m++) {
      const A = SPIN[S.id][m], iD = D * SPIN_HZ;
      for (let i = 1; i < SPIN_N; i++) A[i] = A[i - 1] + (spinRate(S, m, (i - 1) / SPIN_HZ) + spinRate(S, m, i / SPIN_HZ)) * .5 / SPIN_HZ;
      // take out the residual past a whole barrel pitch at D (an imperceptible creep), so the seam shows the same barrels
      const res = modp(A[iD], TAU / 6); for (let i = 0; i < SPIN_N; i++) A[i] -= res * Math.min(i, iD) / iD;
    }
  }
  OF.ciwsSpin = (S, m, T) => { const A = SPIN[S.id]; if (!A) return 0; const x = clamp(modp(T, D) * SPIN_HZ, 0, SPIN_N - 1.001), i = Math.floor(x); return A[m][i] + (A[m][i + 1] - A[m][i]) * (x - i); };
  OF.ciwsFiring = (S, m, T) => CIWS_ENG.some(e => e.S === S && e.m === m && T >= e.t0 && T <= e.t1);

  /* ---------------- the hit and the fire's smoke (data for stage B's hitFx / smokeFx) ----------------
     A4 strikes D1's starboard side at HIT.t. The fire aft of the uptake feeds a smoke stream: parcels leave the fire,
     rise on its heat and drift with the true wind (from 035 at 6 m/s, the wind the carrier turns into); against the
     group's 8 m/s they stream aft down the carrier's starboard side. Damage control has the fire out by ~136 s and
     the last parcel has faded before the seam. */
  const HIT = OF.HIT = { t: RID.A4.tArr, r: 'A4', S: SD1, at: HIT_P, fire: [8.4, 8.6, -8] };
  const WIND = OF.WIND = V.mul([-Math.sin(35 * D2R), 0, -Math.cos(35 * D2R)], 6);
  const SM_DT = OF.SMOKE_DT = .4, SM_LIFE = OF.smokeLife = 26;
  const fireK = te => ss(HIT.t, HIT.t + 1.2, te) * (1 - .4 * ss(HIT.t + 12, HIT.t + 30, te)) * (1 - ss(HIT.t + 40, HIT.t + 55, te));
  OF.fireK = fireK;
  const PARCELS = OF.PARCELS = [];
  for (let k = 0; ; k++) {
    const te = HIT.t + .25 + k * SM_DT; if (te > HIT.t + 56) break;
    PARCELS.push({ te, src: X.ap(OF.shipXf(SD1, te), HIT.fire), h1: hash(k, 7), h2: hash(k, 13), h3: hash(k, 29) });
  }
  const smRise = a => 60 * (1 - Math.exp(-a / 4)) + 4.5 * a;
  const smRad = a => 3 + 4 * Math.sqrt(a) + .8 * a;
  OF.smokeAt = function (p, T) {
    const a = T - p.te; if (a < 0 || a > SM_LIFE) return null;
    const s = p.src, g = 1 + .35 * (p.h1 - .5);
    return {
      c: [s[0] + WIND[0] * a + (p.h2 - .5) * (3 + a * 1.4), s[1] + smRise(a) * g, s[2] + WIND[2] * a + (p.h3 - .5) * (3 + a)],
      r: smRad(a) * (.8 + .4 * p.h2), a,
      k: fireK(p.te) * ss(0, .5, a) * (1 - ss(SM_LIFE * .55, SM_LIFE, a)),
    };
  };

  /* =====================================================================================================
     F/A-18E launches from the bow catapults
     Each jet came up a deck-edge elevator (1 and 2, starboard, forward of the island) at the end of the previous
     loop and sits there until it taxies to its catapult; after the launch, the next jet rides the same elevator up
     for the next loop, so the deck at the seam is the deck at frame 0. The carrier is turned 25° into the wind.
     ===================================================================================================== */
  const ELEV = OF.ELEV = [
    { x0: 22, x1: 36.6, z0: 45, z1: 66, down: [134, 139], up: [148, 157.5] },
    { x0: 22, x1: 36.6, z0: 8, z1: 29, down: [137, 142], up: [151, 160.5] },
  ];
  const ELEV_DROP = 8.4;
  OF.elevDrop = (k, T) => { const e = ELEV[k], t = modp(T, D); return ELEV_DROP * (ss(e.down[0], e.down[1], t) - ss(e.up[0], e.up[1], t)); };
  const FT_ORG_Y = 2.05, NOSE_GEAR = 5.35;
  const JT = OF.JT = [
    { cat: 0, el: 0, taxi: [95.5, 106.5], tL: 112.0, turn: 1, psiT: 62, bank: 55, sTurn: 5.5 },
    { cat: 1, el: 1, taxi: [99.5, 112.5], tL: 119.6, turn: -1, psiT: 52, bank: 55, sTurn: 7 },
  ];
  for (const J of JT) {
    const [a, b] = CATS[J.cat], d = V.norm(V.sub(b, a));
    J.dir = d; J.z0 = a[2] + 6 + 1.2 + 9.2;
    J.s0 = V.add(V.mad(a, d, (J.z0 - a[2]) / d[2]), [0, FT_ORG_Y, 0]);
    J.stroke = (b[2] - .8 - (J.z0 + NOSE_GEAR)) / d[2];
    J.vEnd = 72;
    J.acc = J.vEnd * J.vEnd / (2 * J.stroke); J.tS = J.vEnd / J.acc;
    const e = ELEV[J.el];
    J.park = [(e.x0 + e.x1) / 2, CV_DECK + FT_ORG_Y, (e.z0 + e.z1) / 2 + .6];
    // taxi: a Hermite S from the elevator (nose forward) to the hold-back, nose forward
    const p0 = J.park, p1 = J.s0, Lt = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * 1.1;
    J.taxiAt = u => {
      const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const dh00 = 6 * u2 - 6 * u, dh10 = 3 * u2 - 4 * u + 1, dh01 = -6 * u2 + 6 * u, dh11 = 3 * u2 - 2 * u;
      const x = p0[0] * h00 + p1[0] * h01, z = p0[2] * h00 + Lt * h10 + p1[2] * h01 + Lt * h11;
      const dx = p0[0] * dh00 + p1[0] * dh01, dz = p0[2] * dh00 + Lt * dh10 + p1[2] * dh01 + Lt * dh11;
      return { p: [x, p0[1], z], h: Math.atan2(dx, dz) };
    };
    // free flight: integrated once from the end of the stroke (world frame)
    const N = Math.round(60 * 120), P = [], Rm = [], SPD = [];
    const t = J.tL + J.tS, Fc = OF.shipFrame(SCV, t);
    const start = X.ap(Fc, V.mad(J.s0, d, J.stroke)), v0 = V.add(OF.shipVel(SCV, t), V.mul(X.dir(Fc, d), J.vEnd));
    let pos = start.slice(), psi = Math.atan2(v0[0], v0[2]), gam = 0, spd = V.len(v0), phi = 0, alpha = 4 * D2R;
    J.psi0 = psi;
    for (let i = 0; i < N; i++) {
      const s = i / 120;
      // a short clearing turn off the bow (cat 1 right, cat 2 left), then onto a departure heading over D1's smoke,
      // then out to the north-east, climbing
      const psiT = (J.psiT + 18 * ss(22, 30, s)) * D2R;
      const phiH = clamp(angD(psi, psiT) * 2.2, -J.bank * D2R, J.bank * D2R) * ss(J.sTurn, J.sTurn + 2, s);
      const phiC = J.turn * 22 * D2R * (ss(1.8, 3.2, s) - ss(4.5, 6.5, s)) + phiH;
      phi += (phiC - phi) * (1 - Math.exp(-3 / 120));
      const gC = (-.6 + 9 * ss(.25, 3.2, s) + 4 * ss(6, 11, s) - 6 * ss(24, 34, s)) * D2R;
      gam += (gC - gam) * (1 - Math.exp(-2.2 / 120));
      const thr = (s < 16 ? 9.5 : 4.5) - .00032 * spd * spd - G * Math.sin(gam);
      spd = Math.min(220, spd + thr / 120);
      alpha = mix(9, 3.5, sat((spd - 80) / 60)) * D2R;
      psi += G * Math.tan(phi) / Math.max(60, spd) / 120;
      pos = V.add(pos, V.mul([Math.sin(psi) * Math.cos(gam), Math.sin(gam), Math.cos(psi) * Math.cos(gam)], spd / 120));
      P.push(pos.slice()); SPD.push(spd);
      Rm.push(R.mul(R.mul(R.y(psi), R.x(-(gam + alpha * ss(0, 1.2, s)))), R.z(-phi)));
    }
    J.P = P; J.R = Rm; J.SPD = SPD;
  }
  const FAN_W = qw(2.3);
  /* fighter pose + engine state at T. `next`: the jet that rides the elevator up for the next loop (drawn only once
     it has started up, it is the same jet as frame 0's). */
  OF.jet = function (J, T, next) {
    const Xcv = OF.shipXf(SCV, T);
    const tl = T - J.tL, d = J.dir;
    const run = next ? 0 : ss(J.taxi[0] - 6, J.taxi[0] - 3, T);
    const ab = next ? 0 : ss(-3.2, -2.4, tl) * (1 - ss(15, 16.5, tl));
    const nozzle = mix(.25, 1, Math.max(ab, ss(-6, -5, tl) * .6)) * (next ? 1 : 1);
    const st = { fan: FAN_W * T * (.3 + .7 * run) + J.cat, ab: next ? 0 : ab, nozzle: next ? .25 : nozzle };
    const gear = next ? 1 : 1 - ss(3.8, 6.2, tl - J.tS);
    let Xj, spd = 0, phase;
    if (next || T < J.taxi[0]) {
      const drop = next || modp(T, D) > ELEV[J.el].down[0] ? OF.elevDrop(J.el, T) : 0;
      Xj = X.mul(Xcv, X.make(R.I(), V.add(J.park, [0, -drop, 0]))); phase = next ? 'elevator' : 'parked';
    } else if (T < J.taxi[1]) {
      const u = ss(J.taxi[0], J.taxi[1], T), q = J.taxiAt(u);
      Xj = X.mul(Xcv, X.make(R.y(q.h), q.p)); phase = 'taxi'; spd = VK;
    } else if (tl < J.tS) {
      const u = Math.max(0, tl), s = .5 * J.acc * u * u;
      const kneel = tl < 0 ? -.4 * D2R * ss(-4, -3, tl) : 0;
      Xj = X.mul(Xcv, X.make(R.mul(R.y(Math.atan2(d[0], d[2])), R.x(kneel)), V.mad(J.s0, d, s)));
      spd = VK + J.acc * u; phase = tl < 0 ? 'hold' : 'stroke';
    } else {
      const x = (tl - J.tS) * 120, i = Math.min(J.P.length - 2, Math.floor(x)), f = x - i;
      Xj = X.make(J.R[i], V.lerp(J.P[i], J.P[i + 1], f));
      spd = J.SPD[i]; phase = 'flight';
    }
    return { X: Xj, st, gear, spd, tl, phase };
  };

  /* ---------------- radar pulses (every ship; periodic, so the seam needs no gate) ----------------
     Patches of expanding spherical shell from the array face that looks their way; while raids are in the air every
     other pulse goes down a threat bearing. */
  const PER = D / 240, LIFE = 2.4, NP = 240;
  const SHELL = [[0, .5], [9, .85], [18, 1], [29, .6], [42, .28]].map(q => [q[0] * D2R, q[1]]);
  const pulseR = age => 14 + 240 * age + 380 * age * age;
  OF.threatBrgs = T => { const s = []; for (const r of ROUNDS) if (T >= r.t0 - 2 && T < r.tEnd && !s.includes(r.brg)) s.push(r.brg); return s; };
  OF.drawPulses = function (W, S, T, facesW, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, t0 = .31 + S.ph * .1;
    const kNow = Math.floor((T - t0) / PER), fired = [];
    for (let k = kNow; k >= kNow - Math.ceil(LIFE / PER); k--) {
      const Tk = t0 + k * PER, age = T - Tk;
      if (age < 0 || age > LIFE) continue;
      const km = modp(k, NP), th = OF.threatBrgs(modp(Tk, D));
      const cb = (th.length && km % 2 === 0 ? th[(km >> 1) % th.length] + 6 * Math.sin(km * 1.7) : modp(km * 137 + (km >> 2) * 61 + S.n * 71, 360) + 7 * Math.sin(km)) * D2R;
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
  const SW_PER = D / 373;
  OF.CV_RADAR_W = qw(1.26);
  OF.drawSweep = function (W, c, T, bearing0, o) {
    o = o || {};
    const A = o.alpha === undefined ? 1 : o.alpha, life = 1.6;
    const kNow = Math.floor(T / SW_PER);
    for (let k = kNow; k >= kNow - 4; k--) {
      const Tk = k * SW_PER, age = T - Tk;
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

  /* ---------------- events (time-sorted, for the log, sounds and stage B) ---------------- */
  const EV = OF.EVENTS = [];
  for (const I of INTS) {
    EV.push({ t: I.tL, kind: 'launch', I });
    EV.push({ t: I.tI, kind: I.role === 'miss' ? 'miss' : I.role === 'second' ? 'second' : 'intercept', I, r: I.round, p: I.PI });
  }
  for (const e of CIWS_ENG) { EV.push({ t: e.t0, kind: 'ciws', e }); if (e.kill) EV.push({ t: e.round.tK, kind: 'ciwsKill', e, r: e.round, p: roundAt(e.round, e.round.tK) }); }
  EV.push({ t: HIT.t, kind: 'hit', p: roundAt(RID.A4, HIT.t) });
  for (const J of JT) EV.push({ t: J.tL, kind: 'cat', J });
  EV.sort((a, b) => a.t - b.t);
})();
