/* THE PICTURE (Point Cloud A): shared world. One frame for the whole film:
   metres in the seed-1337 theatre frame (THEATRE km x 1000; X east, Y up, Z north).
   The Krasnaya Kosa site (Monolith-B, TEL, Pantsir) sits on the bluff at (0, -600).
   Everything here is a pure function of film time T or sim time tau. */
(function () {
  const { V, R, X, E, rng, fbm, noise } = M3;
  const PA = window.PA = {};
  const DEG = Math.PI / 180, TAU = Math.PI * 2;
  Object.assign(PA, { DEG, TAU, D: 164, ROT: 4, LIME: [198, 244, 50], WH: [238, 238, 228], CORAL: [255, 106, 61] });
  const TH = THEATRE;

  PA.hsh = function (a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  };
  const hsh = PA.hsh;

  /* ---------- time: film T -> sim tau. The picture (radar sweep, ships, tracker) runs in real
     time; tau jumps back by one film length at TJ, inside the tracker shot where none of it is
     on screen, so the scope at the end of the film is the scope at the start. D is a whole
     number of antenna turns, so the array angle is continuous across the jump. ---------- */
  PA.TJ = 128;
  PA.tau = T => T < PA.TJ ? T : T - PA.D;
  PA.OMEGA = TAU / PA.ROT;
  PA.PH0 = 3.35;
  PA.phase = tau => PA.OMEGA * tau + PA.PH0;          // beam bearing from north, clockwise (unwrapped)

  /* ---------- terrain: the real DEM, bluff and ravines as in the Coastline menu ---------- */
  const SITE = PA.SITE = { x: 0, z: -600 };
  const shape = h => h <= 0 ? h : 56 * (1 - Math.exp(-h / 4.5)) + .62 * h;
  const hash1 = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const PAD = { x: SITE.x, z: SITE.z, r0: 380, r1: 900 };
  function hBase(x, z) {
    const xk = x / 1000, zk = z / 1000;
    let h = TH.h(xk, zk) + 14 * fbm(xk * .5 + 11.3, zk * .5 - 3.7, .5, 3) + 4 * noise(xk * 2.1 + 5, zk * 2.1, 2.2);
    const w = xk + 1.7 * fbm(zk * .3 + 2, xk * .05, 4.2, 2), per = 4.7, q = w / per, id = Math.floor(q);
    const dxv = Math.abs(q - id - .5) * per, wid = .55 + .35 * hash1(id);
    const cut = Math.max(0, 1 - dxv / wid);
    const deep = (45 + 45 * hash1(id + 9)) * E.ss(-12, -1.2, zk) * (hash1(id + 3) < .85 ? 1 : 0);
    const gul = Math.max(0, 1 - Math.abs(fbm(xk * 1.9 + 7, zk * .7, 5.5, 2)) * 9) * E.ss(-9, -2, zk);
    h -= (deep * cut * Math.sqrt(cut) + 22 * gul * gul) * E.ss(4, 40, h + 20);
    if (h <= 0) return h;
    const land = E.ss(0, 26, h);
    const rg = Math.max(0, 1 - Math.abs(fbm(xk * .45 + 3.1, zk * .45 + 9.4, 1.7, 3) * 2.2));
    return shape(h) + land * (30 * rg * rg * rg + 5 * fbm(xk * 3.6, zk * 3.6, 3.3, 2));
  }
  PAD.h = hBase(PAD.x, PAD.z);
  function hTrue(x, z) {
    let h = hBase(x, z);
    const d = Math.hypot(x - PAD.x, z - PAD.z);
    if (d < PAD.r1) h += (PAD.h - h) * E.ss(PAD.r1, PAD.r0, d);
    return h;
  }
  PA.hTrue = hTrue;
  PA.VE = 2.4;                                   // display relief exaggeration for land
  /* master grid of true heights, 40 m, around the site */
  const GX0 = -15000, GZ0 = -7000, GS = 40, GNX = 751, GNZ = 241;
  const HG = new Float32Array(GNX * GNZ);
  for (let j = 0; j < GNZ; j++) for (let i = 0; i < GNX; i++) HG[j * GNX + i] = hTrue(GX0 + i * GS, GZ0 + j * GS);
  Object.assign(PA, { GX0, GZ0, GS, GNX, GNZ, HG });
  /* true height, bilinear on the grid (DEM outside it) */
  PA.hAt = function (x, z) {
    const fi = (x - GX0) / GS, fj = (z - GZ0) / GS;
    if (fi < 0 || fj < 0 || fi >= GNX - 1 || fj >= GNZ - 1) return shape(TH.h(x / 1000, z / 1000));
    const i = fi | 0, j = fj | 0, a = fi - i, b = fj - j, k = j * GNX + i;
    return (HG[k] * (1 - a) + HG[k + 1] * a) * (1 - b) + (HG[k + GNX] * (1 - a) + HG[k + GNX + 1] * a) * b;
  };
  /* display height of the ground (sea = 0) */
  PA.gy = (x, z) => { const h = PA.hAt(x, z); return h > 0 ? h * PA.VE : 0; };
  PA.PADY = PAD.h * PA.VE;

  /* ---------- the site: three vehicles on the graded pad ---------- */
  const place = (dx, dz, hdg) => X.make(R.y(hdg), [SITE.x + dx, PA.PADY, SITE.z + dz]);
  PA.VEH = {
    radar: { W: place(0, 0, -.55), hdg: -.55 },
    tel: { W: place(-21, -7, -1.35), hdg: -1.35 },
    pantsir: { W: place(22, 7, -.25), hdg: -.25 },
  };
  /* the array's rotation axis in world (the mast), and its height */
  PA.ARRAY = X.ap(PA.VEH.radar.W, [0, 11.9, -5.1]);

  /* ---------- the MH-60R: a coastal patrol orbit, one lap per film ---------- */
  {
    const C = [SITE.x + 900, SITE.z + 1650], A = 2000, B = 1350, N = 4096;
    const P = [], S = [0];
    for (let k = 0; k <= N; k++) { const th = k / N * TAU; P.push([C[0] - B * Math.sin(th), C[1] + A * Math.cos(th)]); if (k) S.push(S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1])); }
    const L = S[N], v = L / PA.D;
    PA.HELO_V = v;
    const atS = s => {
      s = ((s % L) + L) % L; let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
      const u = (s - S[lo]) / (S[hi] - S[lo]);
      return [P[lo][0] + (P[hi][0] - P[lo][0]) * u, P[lo][1] + (P[hi][1] - P[lo][1]) * u];
    };
    /* the lap is phased so the west leg crosses the coast inbound during the tracker shot */
    const sWest = L / 4, T_WEST = 123.5;
    const sOf = T => sWest + (T - T_WEST) * v;
    /* altitude: 150 m over water, 110 m over the ground, smoothed along the track */
    const NA = 1024, ALT = new Float32Array(NA);
    { const raw = new Float32Array(NA);
      for (let k = 0; k < NA; k++) { const q = atS(k / NA * L); raw[k] = Math.max(150, PA.gy(q[0], q[1]) + 110); }
      for (let k = 0; k < NA; k++) { let m = 0; for (let d = -24; d <= 24; d++) m = Math.max(m, raw[(k + d + NA) % NA] - Math.abs(d) * 1.6); ALT[k] = m; } }
    const altS = s => { const f = (((s % L) + L) % L) / L * NA, k = Math.floor(f), u = f - k; return ALT[k % NA] * (1 - u) + ALT[(k + 1) % NA] * u; };
    PA.helo = function (T) {
      const s = sOf(T), p = atS(s), p1 = atS(s + 25), p0 = atS(s - 25);
      const y = altS(s), fx = p1[0] - p0[0], fz = p1[1] - p0[1], fl = Math.hypot(fx, fz);
      const hdg = Math.atan2(fx, fz);
      // bank into the turn: tan(bank) = v^2 kappa / g
      const h0 = Math.atan2(p[0] - p0[0], p[1] - p0[1]), h1 = Math.atan2(p1[0] - p[0], p1[1] - p[1]);
      let dh = h1 - h0; dh -= TAU * Math.round(dh / TAU);
      const kap = dh / 25, bank = Math.atan(v * v * kap / 9.81);
      const climb = (altS(s + 40) - altS(s - 40)) / 80;
      const Rm = R.mul(R.y(hdg), R.mul(R.z(-bank), R.x(-(-4 * DEG) - Math.atan(climb))));
      return { p: [p[0], y, p[1]], hdg, bank, R: Rm, v: [fx / fl * v, climb * v, fz / fl * v] };
    };
    PA.HELO_RPM = 258; PA.HELO_TRPM = 1190;
  }

  /* ---------- surface truth, scope km coordinates (radar at the origin) ---------- */
  const pol = (b, r) => [Math.sin(b * DEG) * r, Math.cos(b * DEG) * r];
  const dirOf = h => [Math.sin(h * DEG), Math.cos(h * DEG)];
  PA.pol = pol;
  /* the squall: a heavy rain cell drifting SSE with the wind. It hides the destroyer until
     tau = 0 (frame 0) and the transport until mid-film. */
  const SQ = PA.SQ = { c0: [8.45, 18.235], v: V.mul([Math.sin(152 * DEG), 0, Math.cos(152 * DEG)], .007), a: 3.1, b: 2.5, rot: 20 * DEG };
  SQ.at = tau => [SQ.c0[0] + SQ.v[0] * tau, SQ.c0[1] + SQ.v[2] * tau];
  /* rain intensity 0..1 at scope km (x, z), sim time tau */
  PA.rain = function (x, z, tau) {
    const c = SQ.at(tau), dx = x - c[0], dz = z - c[1];
    const ca = Math.cos(SQ.rot), sa = Math.sin(SQ.rot), u = (dx * ca - dz * sa) / SQ.a, w = (dx * sa + dz * ca) / SQ.b;
    const r = Math.sqrt(u * u + w * w);
    if (r > 1.45) return 0;
    const n = fbm(dx * .7 + 3.3, dz * .7 - 1.1, tau * .004, 3);
    // a gust front: the rain edge is sharp (a few hundred metres), the core is lumpy
    const edge = 1 - E.ss(.9, 1.06, r + .12 * n);
    return edge * (.62 + .38 * E.sat(.5 + n)) * (.75 + .25 * E.ss(1, .4, r));
  };
  PA.SHIPS = [
    { id: 21, cls: 'DDG', rcs: 40, L: .155, p: pol(16, 20), d: dirOf(250), v: .0077 },
    { id: 22, cls: 'AK', rcs: 33, L: .178, p: [5.875, 17.873], d: dirOf(245), v: .006 },
    { id: 14, cls: 'CVN', rcs: 51, L: .333, p: pol(-4, 36), d: dirOf(255), v: .01 },
    { id: 17, cls: 'DDG', rcs: 40, L: .155, p: pol(-31, 27), d: dirOf(112), v: .008 },
    { id: 18, cls: 'HELO', rcs: 13, L: .02, helo: true },
  ];
  PA.shipKm = function (j, tau) {
    const s = PA.SHIPS[j];
    if (s.helo) { const T = ((tau % PA.D) + PA.D) % PA.D, h = PA.helo(T); return [(h.p[0] - SITE.x) / 1000, (h.p[2] - SITE.z) / 1000]; }
    return [s.p[0] + s.d[0] * s.v * tau, s.p[1] + s.d[1] * s.v * tau];
  };
  /* scope km -> world metres */
  PA.kmW = (x, z) => [SITE.x + x * 1000, SITE.z + z * 1000];

  /* ---------- tags: DOM chips placed per frame ---------- */
  const tagPool = new Map(); let req = [];
  PA.tag = o => req.push(o);
  PA.flushTags = function (octx, uiEl, menuBox) {
    req.sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.y - b.y);
    const placed = [];
    for (const q of req) {
      let t = tagPool.get(q.key);
      if (!t) {
        const el = document.createElement('div'); el.className = 'tag off'; el.innerHTML = '<b></b><i></i><span class="v"></span>'; uiEl.appendChild(el);
        t = { el, b: el.children[0], i: el.children[1], v: el.children[2], txt: '', cls: '' }; tagPool.set(q.key, t);
      }
      const txt = (q.id || '') + '|' + (q.txt || '') + '|' + (q.v || '');
      if (t.txt !== txt) { t.txt = txt; t.b.textContent = q.id || ''; t.i.textContent = q.txt || ''; t.v.textContent = q.v || ''; t.v.style.display = q.v ? '' : 'none'; t.i.style.display = q.txt ? '' : 'none'; }
      const w = t.el.offsetWidth || 150;
      const offAnchor = q.ax !== undefined && (q.ax < 4 || q.ax > 1916 || q.ay < 4 || q.ay > 1076);
      let x = Math.min(Math.max(8, q.x), 1912 - w), y = q.y;
      for (let g = 0; g < 10; g++) {
        const hit = placed.find(p => x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < 24);
        if (!hit) break; y = hit.y + (q.down ? 25 : -25);
      }
      const inMenu = menuBox && x < menuBox[2] && x + w > menuBox[0] && y + 20 > menuBox[1] && y < menuBox[3];
      if (offAnchor || inMenu || q.a <= .02 || y < 150 || y > 1040) { t.used = false; continue; }
      placed.push({ x, y, w });
      t.used = true;
      const cls = 'tag' + (q.cls ? ' ' + q.cls : '');
      if (t.cls !== cls) { t.cls = cls; t.el.className = cls; }
      t.el.style.opacity = Math.min(1, q.a).toFixed(2);
      t.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (q.ax !== undefined && q.lead !== false && !(window.FILM && FILM.uiHidden)) {
        octx.strokeStyle = q.leadCol || 'rgba(238,238,228,.7)'; octx.globalAlpha = Math.min(1, q.a) * .8; octx.lineWidth = 1; octx.setLineDash([1, 2.5]);
        octx.beginPath(); octx.moveTo(q.ax, q.ay); octx.lineTo(x - 2, y + (y < q.ay ? 20 : 0)); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1;
      }
    }
    for (const [k, t] of tagPool) if (!t.used) { if (t.cls !== 'tag off') { t.cls = 'tag off'; t.el.className = 'tag off'; } } else t.used = false;
    req = [];
  };

  /* overlay dot that replaces what is under it (max blend lets bright points swallow lime) */
  PA.dset = function (pb, x, y, s, r, g, b, a) {
    const d = pb.d, W = pb.W; let x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > W || y0 + s > pb.H) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * W + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a; } }
  };

  /* sample a model once, keep per-part local points (xyz, normal) for per-frame rigid transforms */
  PA.bake = function (model, s, seed, st, opt) {
    return GEO.sample(model, s, seed, st || {}, opt).filter(p => p.pts.length);
  };
  /* part-local box of sampled points (stride 6, or 3 with stride=3). Robust: a whip antenna or a
     lone lamp is a handful of returns and should not stretch the box the scan draws */
  PA.aabb = function (pts, stride, q) {
    stride = stride || 6; q = q === undefined ? .002 : q;
    const n = Math.floor(pts.length / stride), mn = [], mx = [];
    for (let c = 0; c < 3; c++) {
      const a = new Float32Array(n); for (let k = 0; k < n; k++) a[k] = pts[k * stride + c];
      a.sort(); mn.push(a[Math.floor((n - 1) * q)]); mx.push(a[Math.ceil((n - 1) * (1 - q))]);
    }
    return [mn, mx];
  };
})();
