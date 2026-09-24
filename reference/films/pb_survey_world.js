/* SURVEY (Point Cloud B) · the world, precomputed once at load.
   Real seed-1337 terrain (the detailed DEM of p3_coastline), the drone's sortie integrated in
   sim time (catapult stroke, bank-limited turns, climb limits, parachute), the film -> sim time
   warp, LiDAR swaths with per-line reveal times, the ping-revealed coast, the chart, and every
   model sampled into dots. The film script (pb_survey_film.js) only looks things up. */
window.PBS = (function () {
  'use strict';
  const { V, R, X, E, rng, fbm, noise } = M3;
  const TH = THEATRE, DEG = Math.PI / 180, TAU = Math.PI * 2, DUR = 165, G = 9.81;
  const S = { DUR, DEG, TAU };
  const t0 = performance.now();

  /* ================= terrain ================= */
  const VE = 2.0;                       // relief exaggeration (shown in the survey readout)
  const shape = h => h <= 0 ? h : 56 * (1 - Math.exp(-h / 4.5)) + .62 * h;
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const BASE = [TH.base_km[0] * 1000, TH.base_km[1] * 1000];
  const PANTSIR = [TH.pantsirs_km[0][0] * 1000, TH.pantsirs_km[0][1] * 1000];
  const RADAR = [TH.player_radars_km[0][0] * 1000, TH.player_radars_km[0][1] * 1000];
  const PADS = [[BASE[0], BASE[1], .56], [PANTSIR[0], PANTSIR[1], .24], [RADAR[0], RADAR[1], .34]]
    .map(([x, z, r]) => ({ x, z, r0: r * 1000, r1: r * 2100 }));
  function hBase(x, z) {
    const xk = x / 1000, zk = z / 1000;
    let h = TH.h(xk, zk) + 14 * fbm(xk * .5 + 11.3, zk * .5 - 3.7, .5, 3) + 4 * noise(xk * 2.1 + 5, zk * 2.1, 2.2);
    // ravines draining north to the sea, with side gullies; their mouths notch the bluff
    const w = xk + 1.7 * fbm(zk * .3 + 2, xk * .05, 4.2, 2), per = 4.7, q = w / per, id = Math.floor(q);
    const dxv = Math.abs(q - id - .5) * per, wid = .55 + .35 * hash(id);
    const cut = Math.max(0, 1 - dxv / wid);
    const deep = (45 + 45 * hash(id + 9)) * E.ss(-12, -1.2, zk) * (hash(id + 3) < .85 ? 1 : 0);
    const gul = Math.max(0, 1 - Math.abs(fbm(xk * 1.9 + 7, zk * .7, 5.5, 2)) * 9) * E.ss(-9, -2, zk);
    h -= (deep * cut * Math.sqrt(cut) + 22 * gul * gul) * E.ss(4, 40, h + 20);
    if (h <= 0) return h;
    const land = E.ss(0, 26, h);
    const rg = Math.max(0, 1 - Math.abs(fbm(xk * .45 + 3.1, zk * .45 + 9.4, 1.7, 3) * 2.2));
    return shape(h) + land * (30 * rg * rg * rg + 5 * fbm(xk * 3.6, zk * 3.6, 3.3, 2));
  }
  for (const p of PADS) p.h = hBase(p.x, p.z);
  function hTrue(x, z) {
    let h = hBase(x, z);
    for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r1) h += (p.h - h) * E.ss(p.r1, p.r0, d); }
    return h;
  }
  function mkGrid(x0, x1, z0, z1, d) {
    const nx = Math.round((x1 - x0) / d) + 1, nz = Math.round((z1 - z0) / d) + 1, h = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = hTrue(x0 + i * d, z0 + j * d);
    return { x0, z0, d, nx, nz, h };
  }
  function gs(g, x, z) {
    const fi = (x - g.x0) / g.d, fj = (z - g.z0) / g.d;
    if (fi < 0 || fj < 0 || fi >= g.nx - 1 || fj >= g.nz - 1) return NaN;
    const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j, k = j * g.nx + i, H = g.h;
    return (H[k] * (1 - a) + H[k + 1] * a) * (1 - b) + (H[k + g.nx] * (1 - a) + H[k + g.nx + 1] * a) * b;
  }
  const HG = mkGrid(-2000, 14000, -2600, 2800, 20);
  const HG2 = mkGrid(-30000, 46000, -12000, 8000, 100);
  function hAt(x, z) {
    let h = gs(HG, x, z); if (h === h) return h;
    h = gs(HG2, x, z); if (h === h) return h;
    return TH.h(x / 1000, z / 1000);
  }
  const Yh = h => h > 0 ? h * VE : 0;
  const yAt = (x, z) => Yh(hAt(x, z));
  // key light: the sun is just below the horizon in the east-north-east; skylight from there
  const LIGHT = V.norm([.72, .42, .36]);
  function shadeAt(x, z, y) {
    const e = 14, gx = (yAt(x + e, z) - yAt(x - e, z)) / (2 * e), gz = (yAt(x, z + e) - yAt(x, z - e)) / (2 * e);
    const n = V.norm([-gx, 1, -gz]), sh = Math.max(0, V.dot(n, LIGHT));
    const hv = y / VE / 25, band = y > 0 && hv - Math.floor(hv) < .12 ? .2 : 0;
    const lap = (yAt(x + 30, z) + yAt(x - 30, z) + yAt(x, z + 30) + yAt(x, z - 30) - 4 * y) / 900;
    return .06 + .78 * Math.pow(sh, 1.6) + E.clamp(-lap * 30, 0, .3) + band;
  }
  Object.assign(S, { VE, hTrue, hAt, yAt, Yh, BASE, PANTSIR, RADAR, LIGHT, shadeAt });

  /* ================= the battery ================= */
  const padY = yAt(BASE[0], BASE[1]);
  const CAT = { x: -120, z: -590, hdg: 90 * DEG };
  CAT.y = yAt(CAT.x, CAT.z);
  CAT.W = X.make(R.y(CAT.hdg), [CAT.x, CAT.y, CAT.z]);
  const TELS = [{ x: 35, z: -568, hdg: 24 * DEG }, { x: 80, z: -548, hdg: 4 * DEG }];
  for (const t of TELS) { t.y = yAt(t.x, t.z); t.W = X.make(R.y(t.hdg), [t.x, t.y, t.z]); }
  const PZ = { x: PANTSIR[0], z: PANTSIR[1], hdg: -30 * DEG }; PZ.y = yAt(PZ.x, PZ.z); PZ.W = X.make(R.y(PZ.hdg), [PZ.x, PZ.y, PZ.z]);
  Object.assign(S, { padY, CAT, TELS, PZ });

  /* ================= the ship and the squall (true state) ================= */
  const SHIP = { hdg: 250 * DEG, v: 8.2, p0: [13600, 12200] };
  SHIP.d = [Math.sin(SHIP.hdg), Math.cos(SHIP.hdg)];
  SHIP.at = s => [SHIP.p0[0] + SHIP.d[0] * SHIP.v * s, SHIP.p0[1] + SHIP.d[1] * SHIP.v * s];
  const SQ = { p0: [4300, 9400], w: [-6, -5], r: 1900, top: 1350 };
  SQ.at = s => [SQ.p0[0] + SQ.w[0] * (s - 1150), SQ.p0[1] + SQ.w[1] * (s - 1150)];
  const WIND = [1.8, -2.6];             // m/s toward the south-east (the squall rides it)
  Object.assign(S, { SHIP, SQ, WIND });

  /* ================= the sortie, integrated in sim time ================= */
  const RAIL = HD.catapult.RAIL;
  const railW = c => X.ap(CAT.W, RAIL.at(c));
  const S_LAUNCH = 8.5, V_REL = 22;
  const railA = X.ap(CAT.W, RAIL.start), railB = X.ap(CAT.W, RAIL.end), railLen = V.dist(railA, railB), railDir = V.norm(V.sub(railB, railA));
  const A_RAIL = V_REL * V_REL / (2 * railLen), T_STROKE = V_REL / A_RAIL;
  const Y_SURVEY = padY + 300, Y_SEA = 520, Y_ORBIT = 560;
  const PATH1 = [[260, -590], [1200, -600], [3300, 330], [10300, 470], [10450, 60000]];
  const R_ORB = 4000, T_ORB_MIN = 120;
  const Z_CHUTE = -458;
  const route = (() => {
    const dt = .02, SAVE = 5, out = { x: [], y: [], z: [], psi: [], gam: [], phi: [], v: [], inf: [], bag: [], cx: [], cy: [], cz: [], eng: [] };
    const ev = {};
    let n = 0, s = 0, p = railA.slice(), psi = CAT.hdg, gam = RAIL.pitch, phi = 0, v = 0, mode = 'rail', seg = 0;
    let vel = null, path2 = null, seg2 = 0, touch = null, orbIn = null;
    let inf = 0, bag = 0, cax = [0, 1, 0], eng = 1;
    const wrap = a => a - TAU * Math.round(a / TAU);
    function follow(P, k) {
      const a = P[k], b = P[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), d = [dx / L, dz / L];
      const wx = p[0] - a[0], wz = p[2] - a[1], along = wx * d[0] + wz * d[1], e = wx * d[1] - wz * d[0];
      const chi = Math.atan2(d[0], d[1]);
      let next = k;
      if (k + 2 < P.length) {
        const c = P[k + 2], chi2 = Math.atan2(c[0] - b[0], c[1] - b[1]), dpsi = Math.abs(wrap(chi2 - chi));
        const Rt = v * v / (G * Math.tan(24 * DEG)), lead = Rt * Math.tan(Math.min(dpsi, 2.6) / 2);
        if (along > L - lead) next = k + 1;
      }
      return { psiC: chi - E.clamp(Math.atan(e / 170), -1.1, 1.1), next };
    }
    for (;;) {
      s = n * dt;
      let psiC = psi, yC = p[1], vC = v;
      if (mode === 'rail') { p = railA.slice(); if (s >= S_LAUNCH) mode = 'stroke'; }
      if (mode === 'stroke') {
        const u = s - S_LAUNCH, d = .5 * A_RAIL * u * u;
        if (d >= railLen) { mode = 'climb'; v = V_REL; p = railB.slice(); ev.release = s; }
        else { p = V.mad(railA, railDir, d); v = A_RAIL * u; }
      } else if (mode !== 'rail' && mode !== 'chute' && mode !== 'down') {
        if (mode === 'climb') { psiC = CAT.hdg; yC = Y_SURVEY; vC = 26; if (p[0] > 250) mode = 'path1'; }
        if (mode === 'path1') {
          const f = follow(PATH1, seg); psiC = f.psiC; if (f.next !== seg) { seg = f.next; if (seg === 3) ev.turnN0 = s; }
          yC = seg >= 3 ? Y_SEA : Y_SURVEY; vC = seg === 0 ? 27 : seg >= 3 ? 35 : 33;
          if (seg === 2 && ev.surveyEnd === undefined && p[0] > 9700) ev.surveyEnd = s;
          if (seg === 3 && ev.north === undefined && Math.abs(wrap(psi - PATH1[3][0] * 0 - Math.atan2(150, 59530))) < 6 * DEG) ev.north = s;
          if (seg === 3 && p[2] > 3800) { mode = 'orbit'; ev.orbit0 = s; }
        }
        if (mode === 'orbit') {
          const c = SHIP.at(s), dx = p[0] - c[0], dz = p[2] - c[1], r = Math.hypot(dx, dz), beta = Math.atan2(dx, dz);
          psiC = beta + Math.PI / 2 + E.clamp(Math.atan((r - R_ORB) / 420), -1.45, 1.45);        // clockwise: the ship on the right
          yC = Y_ORBIT; vC = 31;
          if (orbIn === null && r < R_ORB + 250) { orbIn = s; ev.orbitIn = s; }
          const bdeg = ((beta / DEG) % 360 + 360) % 360;
          if (orbIn !== null && s - orbIn > T_ORB_MIN && bdeg > 196 && bdeg < 250) { mode = 'home'; ev.orbitOut = s; path2 = [[p[0], p[2]], [2600, 5400], [-140, 1900], [-140, -3000]]; }
        }
        if (mode === 'home') {
          const f = follow(path2, seg2); psiC = f.psiC; seg2 = f.next;
          const z = p[2];
          yC = z > 4200 ? 480 : z > 1400 ? E.mix(250, 480, (z - 1400) / 2800) : E.mix(padY + 56, 250, E.sat((z - Z_CHUTE) / (1400 - Z_CHUTE)));
          vC = z > 2600 ? 35 : 27;
          if (z < Z_CHUTE) { mode = 'chute'; ev.chute = s; vel = [Math.sin(psi) * Math.cos(gam) * v, Math.sin(gam) * v, Math.cos(psi) * Math.cos(gam) * v]; }
        }
        if (mode !== 'chute') {
          // speed, flight path angle, bank-limited heading
          v += E.clamp((vC - v) * .3, -1.6, 2.2) * dt;
          const gC = E.clamp((yC - p[1]) * .018, -.1, v < 24 ? .2 : .15);
          gam += E.clamp((gC - gam) * .9, -.2, .2) * dt;
          const phiC = E.clamp(Math.atan(v * .22 * wrap(psiC - psi) / G), -30 * DEG, 30 * DEG);
          phi += E.clamp((phiC - phi) * 2.2, -40 * DEG, 40 * DEG) * dt;
          psi += G * Math.tan(phi) / Math.max(12, v) * dt;
          p = [p[0] + Math.sin(psi) * Math.cos(gam) * v * dt + WIND[0] * dt * .0, p[1] + Math.sin(gam) * v * dt, p[2] + Math.cos(psi) * Math.cos(gam) * v * dt];
        }
      }
      if (mode === 'chute' || mode === 'down') {
        const u = s - ev.chute;
        eng = Math.max(0, 1 - u / .6);
        inf = E.ss(.35, 1.5, u);
        bag = E.ss(2.6, 4.4, u);
        if (mode === 'chute') {
          const rel = [vel[0] - WIND[0], vel[1], vel[2] - WIND[1]], sp = V.len(rel);
          const k = .33 * inf + .012;
          let a = V.mul(rel, -k * sp); const am = V.len(a); if (am > 58) a = V.mul(a, 58 / am);
          vel = [vel[0] + a[0] * dt, vel[1] + (a[1] - G) * dt, vel[2] + a[2] * dt];
          p = V.mad(p, vel, dt);
          cax = V.norm(V.add([0, 1.2, 0], V.mul(V.norm(rel), -1)));
          const hs = Math.hypot(vel[0], vel[2]);
          gam = Math.atan2(vel[1], Math.max(1, hs)) * .15 - 6 * DEG;
          phi = 10 * DEG * Math.exp(-u / 2.2) * Math.sin(u * TAU / 2.3);
          const gy = yAt(p[0], p[2]);
          if (p[1] - gy <= .34 && u > 2) { mode = 'down'; ev.touch = s; touch = { p: p.slice(), gy, vy: vel[1] }; }
        } else {
          const w = s - ev.touch;
          p = [touch.p[0], touch.gy + .34 - .09 * Math.exp(-w * 3.2) * Math.cos(w * 9) * E.sat(w * 8), touch.p[2]];
          gam = -6 * DEG * Math.exp(-w * 2); phi = 3 * DEG * Math.exp(-w * 1.5) * Math.sin(w * 7);
          cax = V.norm(V.lerp(cax, [WIND[0], 0, WIND[1]], E.ss(0, 3.2, w)));
        }
      }
      if (n % SAVE === 0) {
        out.x.push(p[0]); out.y.push(p[1]); out.z.push(p[2]); out.psi.push(psi); out.gam.push(gam); out.phi.push(phi);
        out.v.push(mode === 'chute' ? V.len(vel) : mode === 'down' ? 0 : v); out.inf.push(inf); out.bag.push(bag);
        out.cx.push(cax[0]); out.cy.push(cax[1]); out.cz.push(cax[2]); out.eng.push(mode === 'rail' ? 0 : eng);
      }
      n++;
      if (mode === 'down' && s - ev.touch > 40) break;
      if (s > 4000) { console.warn('route did not finish', mode); break; }
    }
    const f = {}; for (const k in out) f[k] = Float64Array.from(out[k]);
    f.dt = dt * SAVE; f.n = f.x.length; f.end = (f.n - 1) * f.dt; f.ev = ev;
    return f;
  })();
  const EV = route.ev;
  /* sample the route at sim time s -> reused object */
  const RS = { p: [0, 0, 0], psi: 0, gam: 0, phi: 0, v: 0, inf: 0, bag: 0, ca: [0, 1, 0], eng: 0 };
  function routeAt(s, o) {
    o = o || RS;
    const fi = E.clamp(s / route.dt, 0, route.n - 1.001), i = fi | 0, a = fi - i, b = 1 - a;
    const L = k => route[k][i] * b + route[k][i + 1] * a;
    o.p[0] = L('x'); o.p[1] = L('y'); o.p[2] = L('z');
    o.psi = L('psi'); o.gam = L('gam'); o.phi = L('phi'); o.v = L('v'); o.inf = L('inf'); o.bag = L('bag'); o.eng = L('eng');
    o.ca[0] = L('cx'); o.ca[1] = L('cy'); o.ca[2] = L('cz');
    return o;
  }
  Object.assign(S, { route, EV, routeAt, railW, S_LAUNCH, T_STROKE, A_RAIL, railLen, R_ORB, Y_SURVEY });

  /* ================= film time -> sim time ================= */
  // anchors pin story beats to film seconds; between anchors the rate ramps to a plateau and back
  const sAtX = x => { for (let i = 0; i < route.n; i++) if (route.x[i] >= x && route.z[i] < 2000) return i * route.dt; return 0; };
  const ANCH = [
    { T: 0, s: 0, r: 1 },
    { T: 14, s: 14, r: 1 },
    { T: 19.5, s: sAtX(PANTSIR[0]), r: 9 },
    { T: 51, s: EV.surveyEnd, r: 3.5 },
    { T: 58, s: EV.north || EV.turnN0 + 40, r: 5 },
    { T: 88, s: EV.orbitIn, r: 8 },
    { T: 103, s: EV.orbitOut - 26, r: 2 },
    { T: 116.5, s: EV.orbitOut, r: 2.5 },
    { T: 144.5, s: EV.chute - .5, r: 1 },
    { T: DUR, s: EV.chute - .5 + (DUR - 144.5), r: 1 },
  ];
  const NW = Math.round(DUR * 240), WS = new Float64Array(NW + 1), WR = new Float64Array(NW + 1);
  {
    for (let k = 0; k < ANCH.length - 1; k++) {
      const a = ANCH[k], b = ANCH[k + 1], L = b.T - a.T, w = Math.min(4, L / 2.2), ds = b.s - a.s;
      const p = (ds - w * (a.r + b.r) / 2) / (L - w);
      a.p = p; a.w = w;
    }
    const rateAt = T => {
      let k = 0; while (k < ANCH.length - 2 && ANCH[k + 1].T <= T) k++;
      const a = ANCH[k], b = ANCH[k + 1], u = T - a.T, L = b.T - a.T;
      if (u < a.w) return E.mix(a.r, a.p, E.ss(0, a.w, u));
      if (u > L - a.w) return E.mix(a.p, b.r, E.ss(L - a.w, L, u));
      return a.p;
    };
    let acc = 0; WR[0] = rateAt(0);
    for (let i = 1; i <= NW; i++) { const T = i / 240, r = rateAt(T); acc += (WR[i - 1] + r) * .5 / 240; WS[i] = acc; WR[i] = r; }
    // pin each segment's end exactly on its anchor (numerical integration drift)
    for (let k = 0; k < ANCH.length - 1; k++) {
      const a = ANCH[k], b = ANCH[k + 1], i0 = Math.round(a.T * 240), i1 = Math.round(b.T * 240);
      const e0 = WS[i0] - a.s, e1 = WS[i1] - b.s;
      for (let i = i0; i <= i1; i++) WS[i] -= E.mix(e0, e1, (i - i0) / (i1 - i0));
    }
  }
  const simOf = T => { const x = E.clamp(T, 0, DUR) * 240, i = Math.min(NW - 1, x | 0); return WS[i] + (WS[i + 1] - WS[i]) * (x - i); };
  const rateOf = T => WR[Math.min(NW, Math.max(0, Math.round(T * 240)))];
  const filmOf = s => { let lo = 0, hi = NW; while (lo < hi) { const m = (lo + hi) >> 1; if (WS[m] < s) lo = m + 1; else hi = m; } return lo / 240; };
  Object.assign(S, { ANCH, simOf, rateOf, filmOf });
  // the squall rides the wind across the return track: centred on it at film 126.5
  {
    const sR = simOf(126.5), q = routeAt(sR, { p: [0, 0, 0], ca: [0, 0, 0] });
    SQ.sRef = sR; SQ.p0 = [q.p[0] + Math.cos(q.psi) * 250, q.p[2] - Math.sin(q.psi) * 250];
    SQ.at = s => [SQ.p0[0] + SQ.w[0] * (s - SQ.sRef), SQ.p0[1] + SQ.w[1] * (s - SQ.sRef)];
  }

  /* ================= LiDAR swaths: scan-line table + first-reveal map ================= */
  // The ground itself is drawn procedurally at camera-adaptive density (pb_survey_film.js); a swath
  // only records WHEN each patch of ground was first swept by the scan line.
  const FAN = 58 * DEG, LEAD = .22;          // half fan angle; the line leads the drone by LEAD x AGL
  function makeSwath(s0, s1, o) {
    o = o || {};
    const DL = o.dl || 6, CELL = o.cell || 6;
    const LT = [], LX = [], LZ = [], LDX = [], LDZ = [], LA = [], LH = [];
    const q = { p: [0, 0, 0], ca: [0, 0, 0] };
    let acc = 0, last = null;
    for (let s = s0; s <= s1; s += .02) {
      routeAt(s, q);
      const g = [q.p[0], q.p[2]];
      if (last) acc += Math.hypot(g[0] - last[0], g[1] - last[1]);
      last = g;
      if (acc < DL && LT.length) continue;
      acc = 0;
      const d = [Math.sin(q.psi), Math.cos(q.psi)];
      const agl = q.p[1] - yAt(g[0], g[1]), lead = LEAD * agl;
      LT.push(filmOf(s)); LX.push(g[0] + d[0] * lead); LZ.push(g[1] + d[1] * lead); LDX.push(d[0]); LDZ.push(d[1]); LA.push(q.p[1]); LH.push(Math.max(40, q.p[1] * Math.tan(FAN)));
    }
    const nl = LT.length;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < nl; i++) { x0 = Math.min(x0, LX[i] - LH[i]); x1 = Math.max(x1, LX[i] + LH[i]); z0 = Math.min(z0, LZ[i] - LH[i]); z1 = Math.max(z1, LZ[i] + LH[i]); }
    x0 -= CELL; z0 -= CELL;
    const nx = Math.ceil((x1 - x0) / CELL) + 2, nz = Math.ceil((z1 - z0) / CELL) + 2, t = new Float32Array(nx * nz).fill(1e9);
    const tf = Math.tan(FAN);
    for (let i = 0; i < nl; i++) {
      const dx = LDX[i], dz = LDZ[i], rx = dz, rz = -dx, H = LH[i];
      for (let u = -H; u <= H; u += CELL * .5) for (let a = -DL * .5; a <= DL * .6; a += CELL * .5) {
        const x = LX[i] + rx * u + dx * a, z = LZ[i] + rz * u + dz * a;
        const ci = ((x - x0) / CELL) | 0, cj = ((z - z0) / CELL) | 0, k = cj * nx + ci;
        if (t[k] < 1e8) continue;
        if (Math.abs(u) > (LA[i] - yAt(x, z)) * tf) continue;
        t[k] = LT[i];
      }
    }
    return { nl, lt: Float32Array.from(LT), lx: Float32Array.from(LX), lz: Float32Array.from(LZ), ldx: Float32Array.from(LDX), ldz: Float32Array.from(LDZ), la: Float32Array.from(LA), lh: Float32Array.from(LH), map: { x0, z0, c: CELL, nx, nz, t, x1: x0 + nx * CELL, z1: z0 + nz * CELL } };
  }
  const S_LIDAR_ON = simOf(15.2), S_LIDAR_OFF = EV.surveyEnd + 4;
  const SW1 = makeSwath(S_LIDAR_ON, S_LIDAR_OFF, {});
  function routeTimeAtZ(z) { for (let i = Math.round(EV.orbitOut / route.dt); i < route.n; i++) if (route.z[i] < z) return i * route.dt; return EV.chute; }
  const S_LIDAR2_ON = routeTimeAtZ(3300), S_LIDAR2_OFF = EV.chute - 2;
  const SW2 = makeSwath(S_LIDAR2_ON, S_LIDAR2_OFF, { dl: 5, cell: 5 });
  Object.assign(S, { SW1, SW2, FAN, LEAD, S_LIDAR_ON, S_LIDAR_OFF, S_LIDAR2_ON, S_LIDAR2_OFF });

  /* shade grids alongside the height grids: slope light, curvature, 25 m contour banding */
  function shadeGrid(g) {
    const n = g.nx * g.nz, out = new Float32Array(n), d = g.d, H = g.h, nx = g.nx;
    for (let j = 1; j < g.nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i, y = Yh(H[k]);
      if (H[k] <= 0) { out[k] = 0; continue; }
      const gx = (Yh(H[k + 1]) - Yh(H[k - 1])) / (2 * d), gz = (Yh(H[k + nx]) - Yh(H[k - nx])) / (2 * d);
      const nl = Math.hypot(gx, 1, gz), sh = Math.max(0, (-gx * LIGHT[0] + LIGHT[1] - gz * LIGHT[2]) / nl);
      const lap = (Yh(H[k + 1]) + Yh(H[k - 1]) + Yh(H[k + nx]) + Yh(H[k - nx]) - 4 * y) / (d * d);
      out[k] = .05 + .92 * Math.pow(sh, 2.4) + E.clamp(-lap * 34 * (d / 20), 0, .34);
    }
    return out;
  }
  HG.s = shadeGrid(HG); HG2.s = shadeGrid(HG2);
  // coarse min / max display height per 250 m cell (bounds for the terrain lattice's distance bands)
  const MM = (() => {
    const c = 250, x0 = HG2.x0, z0 = HG2.z0, nx = Math.ceil((HG2.nx - 1) * HG2.d / c), nz = Math.ceil((HG2.nz - 1) * HG2.d / c);
    const mn = new Float32Array(nx * nz).fill(1e9), mx = new Float32Array(nx * nz).fill(-1e9);
    const add = (x, z, y) => { const i = Math.floor((x - x0) / c), j = Math.floor((z - z0) / c); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const k = jj * nx + ii; if (y < mn[k]) mn[k] = y; if (y > mx[k]) mx[k] = y; } };
    for (let j = 0; j < HG2.nz; j++) for (let i = 0; i < HG2.nx; i++) add(HG2.x0 + i * HG2.d, HG2.z0 + j * HG2.d, Yh(HG2.h[j * HG2.nx + i]));
    for (let j = 0; j < HG.nz; j += 2) for (let i = 0; i < HG.nx; i += 2) add(HG.x0 + i * HG.d, HG.z0 + j * HG.d, Yh(HG.h[j * HG.nx + i]) + 3);
    for (let k = 0; k < mn.length; k++) { if (mn[k] > 1e8) { mn[k] = 0; mx[k] = 0; } mn[k] = Math.max(0, mn[k] - 2); }
    return { c, x0, z0, nx, nz, mn, mx };
  })();
  // 96 m blocks: first/last reveal time of each swath inside, so the lattice only walks ground a sensor has seen
  const BK = (() => {
    const c = 96, x0 = -30000, z0 = -12000, nx = Math.ceil(76000 / c), nz = Math.ceil(20000 / c);
    const mk = () => { const a = new Float32Array(nx * nz), b = new Float32Array(nx * nz); a.fill(1e9); b.fill(-1e9); return [a, b]; };
    const fill = (M, lo, hi) => { for (let j = 0; j < M.nz; j++) for (let i = 0; i < M.nx; i++) { const t = M.t[j * M.nx + i]; if (t > 1e8) continue; const x = M.x0 + (i + .5) * M.c, z = M.z0 + (j + .5) * M.c, bi = Math.floor((x - x0) / c), bj = Math.floor((z - z0) / c); if (bi < 0 || bj < 0 || bi >= nx || bj >= nz) continue; const k = bj * nx + bi; if (t < lo[k]) lo[k] = t; if (t > hi[k]) hi[k] = t; } };
    const [a1, b1] = mk(), [a2, b2] = mk();
    fill(SW1.map, a1, b1); fill(SW2.map, a2, b2);
    return { c, x0, z0, nx, nz, t1lo: a1, t1hi: b1, t2lo: a2, t2hi: b2 };
  })();
  Object.assign(S, { HG, HG2, MM, BK });

  /* ================= the whole coast, lit by the 360° ping (analytic reveal) ================= */
  const T_PING = 53.2, PSPD = 4500;
  const pingAt = routeAt(simOf(T_PING), { p: [0, 0, 0], ca: [0, 0, 0] }).p.slice();
  const COAST = { x0: -26000, x1: 45000, z0: -9800, z1: 2600 };
  Object.assign(S, { T_PING, PSPD, pingAt, COAST });

  /* ================= the chart we already had: contours + open-water speckle ================= */
  const CH = (() => {
    const a = [];
    for (const [lv, al, step] of [['0', .9, 45], ['60', .55, 60], ['140', .5, 70], ['220', .45, 80], ['-40', .3, 90], ['-100', .18, 120]]) {
      const polys = TH.contours[lv]; if (!polys) continue;
      const y = +lv > 0 ? Yh(shape(+lv)) : 0;
      for (const poly of polys) for (let k = 0; k < poly.length - 1; k++) {
        const p = poly[k], q = poly[k + 1];
        if (p[0] < -60 || p[0] > 80 || p[1] < -40 || p[1] > 70) continue;
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]) * 1000; if (len > 6000) continue;
        const m = Math.max(1, Math.round(len / step));
        for (let i = 0; i < m; i++) a.push((p[0] + (q[0] - p[0]) * i / m) * 1000, y, (p[1] + (q[1] - p[1]) * i / m) * 1000, al);
      }
    }
    return new Float32Array(a);
  })();
  const SF = (() => {
    const a = [], r = rng(4242);
    for (let k = 0; k < 16000; k++) {
      const x = -40000 + r() * 100000, z = 1200 + Math.pow(r(), .85) * 70000;
      if (TH.h(x / 1000, z / 1000) > -6) continue;
      a.push(x, z, .45 + .55 * r(), r() * TAU);
    }
    return new Float32Array(a);
  })();
  Object.assign(S, { CH, SF });

  /* ================= landmarks along the surveyed coast ================= */
  const MARKS = (() => {
    const out = [], zc = -120, xs = [], hs = [];
    for (let x = 900; x <= 12000; x += 20) { xs.push(x); hs.push(hTrue(x, zc)); }
    for (let i = 25; i < xs.length - 25; i++) {
      let lo = true; for (let k = -25; k <= 25; k++) if (hs[i + k] < hs[i]) { lo = false; break; }
      if (!lo) continue;
      let mx = -1e9; for (let k = -25; k <= 25; k++) mx = Math.max(mx, hs[i + k]);
      const depth = mx - hs[i];
      if (depth > 16) out.push({ x: xs[i], z: zc, depth: Math.round(depth) });
    }
    return out;
  })();
  Object.assign(S, { MARKS });

  /* ================= models, sampled into dots ================= */
  const MODELS = {
    drone: () => HD.drone(), catapult: () => HD.catapult(), destroyer: () => HD.destroyer(), helo: () => HD.helo(),
    tel: () => HD.tel ? HD.tel() : GEO.tel(), pantsir: () => HD.pantsir(), radar: () => HD.radar(),
  };
  const DR = MODELS.drone();
  /* drone parts in model space; control surfaces tagged for deflection about their hinges */
  const drone = (() => {
    const sp = GEO.sample(DR, .016, 31, { prop: 0, gimYaw: 0, gimPitch: 0 });
    const parts = {};
    for (const p of sp) parts[p.name] = p;
    const WG = parts.wing.pts, TL = parts.tail.pts;
    const surf = (pts, test) => { const m = new Uint8Array(pts.length / 6); for (let i = 0, k = 0; k < pts.length; i++, k += 6) m[i] = test(pts[k], pts[k + 1], pts[k + 2]); return m; };
    // ailerons: outer 45 % of each half span, aft 27 % of chord; elevator aft of z -.875; rudder aft of z -.955 above the stab
    const hingeW = x => E.mix(-.045, -.02, E.sat((Math.abs(x) - .08) / 1.47));
    const ail = surf(WG, (x, y, z) => Math.abs(x) > .82 && Math.abs(x) < 1.52 && z < hingeW(x) ? (x > 0 ? 1 : 2) : 0);
    const elev = surf(TL, (x, y, z) => z < -.875 && y < .09 && Math.abs(x) > .012 ? 1 : 0);
    const rud = surf(TL, (x, y, z) => z < -.94 && y > .1 && Math.abs(x) < .02 ? 1 : 0);
    return { parts, ail, elev, rud, hingeW, model: DR };
  })();
  const CATM = MODELS.catapult();
  const catParts = GEO.sample(CATM, .025, 41, { carriage: 0 });
  const TELM = MODELS.tel();
  const telParts = GEO.sample(TELM, .09, 5, { elev: 0, dep: 1, capL: 0, capR: 0 });
  const PZM = MODELS.pantsir();
  const pzParts = GEO.sample(PZM, .13, 7, { yaw: 0, pitch: 0, sAnt: 0 });
  const DDM = MODELS.destroyer();
  const ddMain = GEO.sample(DDM, .75, 21, { sps: 0 }, { fine: false });
  const ddFine = GEO.sample(DDM, .36, 22, { sps: 0 });
  const HLM = MODELS.helo();
  const heloParts = GEO.sample(HLM, .09, 23, { rotor: .3, droop: 1 });
  Object.assign(S, { MODELS, drone, CATM, catParts, TELM, telParts, PZM, pzParts, DDM, ddMain, ddFine, HLM, heloParts });

  S.loadMs = Math.round(performance.now() - t0);
  S.stats = { sw1: SW1.nl, sw2: SW2.nl, map1: SW1.map.nx * SW1.map.nz, ch: CH.length / 4, sf: SF.length / 4, ev: EV, end: route.end, anch: ANCH.map(a => [a.T, +a.s.toFixed(1), +(a.p || 0).toFixed(2)]) };
  return S;
})();
