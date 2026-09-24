/* THE PICTURE: the battery (from the Strike and Track menus).
   A lightning-strike LiDAR scan: a bolt hits the TEL, the returns race through the steel along
   random-weight shortest paths (a branching front), down to the ground, across the pad and up
   the radar and the Pantsir; each part is boxed once most of its returns are in.
   Then the Pantsir's EO director tracks the MH-60R crossing the coast: brackets on the true
   projected bounds of fuselage, rotor head and tail rotor, a lagging reticle, a x-zoom inset. */
(function () {
  const { V, R, X, E, rng, fbm } = M3;
  const PA = window.PA, DEG = PA.DEG, TAU = PA.TAU, hsh = PA.hsh;
  const LIME = PA.LIME, WH = PA.WH;
  const L = V.norm([-.45, .8, -.35]);
  const r0 = rng(1337);

  /* ---------- helicopter truth-driven poses ---------- */
  const HELO = PA_MOD.helo();
  const heloRot = T => T * PA.HELO_RPM / 60 * TAU, heloTRot = T => T * PA.HELO_TRPM / 60 * TAU;

  /* ---------- Pantsir turret: slaved to the helicopter through a servo lag (integrated once) ---------- */
  const PZ = PA.VEH.pantsir, PZinv = { R: [PZ.W.R[0], PZ.W.R[3], PZ.W.R[6], PZ.W.R[1], PZ.W.R[4], PZ.W.R[7], PZ.W.R[2], PZ.W.R[5], PZ.W.R[8]] };
  const YT = new Float32Array(165 * 60 + 2), PT = new Float32Array(165 * 60 + 2);
  {
    let y = 0, p = 0;
    const want = T => { const h = PA.helo(T).p, d = R.ap(PZinv.R, V.sub(h, V.add(PZ.W.T, [0, 3.2, -2]))); return [Math.atan2(d[0], d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; };
    const w0 = want(-.5 * 60 / 60 + PA.D - 6); y = w0[0]; p = w0[1];
    for (let k = -360; k < YT.length; k++) {
      const T = k / 60, w = want(((T % PA.D) + PA.D) % PA.D);
      let dy = w[0] - y; dy -= TAU * Math.round(dy / TAU);
      y += dy * (1 - Math.exp(-2.4 / 60)); p += (w[1] - p) * (1 - Math.exp(-2.4 / 60));
      if (k >= 0) { YT[k] = y; PT[k] = p; }
    }
  }
  const tabAt = (A, T) => { const f = E.clamp(T, 0, 164.9) * 60, k = Math.floor(f), u = f - k; return A[k] + (A[k + 1] - A[k]) * u; };
  PA.pzState = T => ({ yaw: tabAt(YT, T), pitch: Math.max(0, tabAt(PT, T)), sAnt: T * TAU * .5 });

  /* ---------- vehicles: sampled once per part, moved per frame by the part's own transform ---------- */
  const VEHS = [
    { key: 'tel', model: PA_MOD.tel(), W: PA.VEH.tel.W, s: .085, seed: 11, st: () => ({ elev: 0, dep: 1 }), tag: ['OBJ 01', 'TEL · Bastion-P'],
      parts: { launcher: ['01.1', 'TLC ×2 · 3M55'], ram: ['01.2', 'Erector ram'], capL: ['01.3', 'TLC caps'], wheels: ['01.4', 'Wheels 8×8'], cab: ['01.5', 'Cab · crew 3'] } },
    { key: 'radar', model: PA_MOD.radar(), W: PA.VEH.radar.W, s: .09, seed: 12, st: T => ({ ant: PA.phase(PA.tau(T)) - PA.VEH.radar.hdg }), tag: ['OBJ 02', 'Radar · Monolith-B'],
      parts: { array: ['02.1', 'Array · 15 rpm'], mast: ['02.2', 'Mast · 5 sections'] } },
    { key: 'pantsir', model: PA_MOD.pantsir(), W: PA.VEH.pantsir.W, s: .085, seed: 13, st: T => PA.pzState(T), tag: ['OBJ 03', 'Pantsir-S1'],
      parts: { guns: ['03.1', '2A38M ×2 · 30 mm'], missiles: ['03.2', '57E6 ×12'], searchRadar: ['03.3', 'Search radar'], trackRadar: ['03.4', 'Tracking radar'], eo: ['03.5', 'EO director'] } },
  ];
  let NV = 0;
  for (const v of VEHS) {
    v.samp = PA.bake(v.model, v.s, v.seed, v.st(0));
    v.samp.forEach(sp => { sp.n = sp.pts.length / 6; sp.i0 = NV; NV += sp.n; sp.bb = PA.aabb(sp.pts); });
  }
  /* ground returns around the pad: rings plus sparse speckle, none under the vehicles */
  const GXa = [], GZa = [], GRa = [];
  const C0 = [PA.SITE.x, PA.SITE.z];
  for (let r = 2.5, k = 0; r < 140; r *= 1.085, k++) {
    const step = Math.min(1.6, .2 + r * .011), n = Math.floor(TAU * r / step), ph = r0() * 6.28;
    for (let i = 0; i < n; i++) { const a = ph + i / n * TAU, rr = r + (r0() - .5) * .08 * r * .1; GXa.push(C0[0] + Math.sin(a) * rr); GZa.push(C0[1] + Math.cos(a) * rr); GRa.push(rr); }
  }
  for (let i = 0; i < 14000; i++) { const rr = 4 + Math.pow(r0(), 1.5) * 140, a = r0() * TAU; GXa.push(C0[0] + Math.sin(a) * rr); GZa.push(C0[1] + Math.cos(a) * rr); GRa.push(rr); }
  const under = (x, z) => VEHS.some(v => { const d = [x - v.W.T[0], 0, z - v.W.T[2]], R2 = v.W.R, lx = R2[0] * d[0] + R2[6] * d[2], lz = R2[2] * d[0] + R2[8] * d[2]; return Math.abs(lx) < 1.5 && Math.abs(lz + .3) < 6.6; });
  const GP = [];
  for (let i = 0; i < GXa.length; i++) { const x = GXa[i], z = GZa[i]; if (under(x, z)) continue; GP.push(x, PA.gy(x, z) + .1 * M3.noise(x * .08, z * .08), z, .1 + .5 * Math.exp(-GRa[i] / 30) + .08 * r0()); }
  const NGP = GP.length / 4, GPf = new Float64Array(GP);

  /* ---------- the strike: reveal time of every return, computed once ---------- */
  const T_BOLT = 100.1, HIT = T_BOLT + .75 + .3;
  PA.T_HIT = HIT;
  const RTV = new Float32Array(NV), RTG = new Float32Array(NGP), JT = new Float32Array(NV);
  for (let i = 0; i < NV; i++) JT[i] = r0();
  /* rest-pose world points (for the graph; parts that move later move their revealed points with them) */
  const WP = new Float32Array(NV * 3);
  for (const v of VEHS) { const st = v.st(HIT); for (const sp of v.samp) { const Tp = GEO.partXf(v.W, sp.part, st), p = sp.pts; for (let k = 0, i = sp.i0; k < p.length; k += 6, i++) { const w = X.ap(Tp, [p[k], p[k + 1], p[k + 2]]); WP[i * 3] = w[0]; WP[i * 3 + 1] = w[1]; WP[i * 3 + 2] = w[2]; } } }
  function graph(v) {
    const H = .3, map = new Map(), nodes = [];
    for (const sp of v.samp) for (let i = sp.i0; i < sp.i0 + sp.n; i++) {
      const ix = Math.floor(WP[i * 3] / H), iy = Math.floor(WP[i * 3 + 1] / H), iz = Math.floor(WP[i * 3 + 2] / H), key = ix + ',' + iy + ',' + iz;
      let nd = map.get(key); if (!nd) { nd = { id: nodes.length, ix, iy, iz, p: [0, 0, 0], m: [] }; map.set(key, nd); nodes.push(nd); }
      nd.m.push(i); nd.p[0] += WP[i * 3]; nd.p[1] += WP[i * 3 + 1]; nd.p[2] += WP[i * 3 + 2];
    }
    for (const nd of nodes) { nd.p = nd.p.map(q => q / nd.m.length); nd.nb = []; }
    for (const nd of nodes) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      if (!dx && !dy && !dz) continue; const q = map.get((nd.ix + dx) + ',' + (nd.iy + dy) + ',' + (nd.iz + dz)); if (q) nd.nb.push(q.id);
    }
    return nodes;
  }
  function dijkstra(nodes, seeds, seed) {
    const rr = rng(seed), t = new Float64Array(nodes.length).fill(1e9), par = new Int32Array(nodes.length).fill(-1), heap = [];
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    for (const [i, d] of seeds) if (d < t[i]) { t[i] = d; push(d, i); }
    const cost = new Float32Array(nodes.length); for (let i = 0; i < nodes.length; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
    while (heap.length) {
      const [d, i] = pop(); if (d > t[i]) continue;
      const a = nodes[i];
      for (const j of a.nb) { const b = nodes[j], nd = d + V.dist(a.p, b.p) * cost[j] / 17; if (nd < t[j]) { t[j] = nd; par[j] = i; push(nd, j); } }
    }
    return { t, par };
  }
  const tel = VEHS[0];
  const telLauncher = tel.samp.find(s => s.name === 'launcher');
  const HITP = (() => { let best = null; for (let i = telLauncher.i0; i < telLauncher.i0 + telLauncher.n; i++) { const p = [WP[i * 3], WP[i * 3 + 1], WP[i * 3 + 2]]; if (!best || p[1] > best[1] + .02 || (Math.abs(p[1] - best[1]) < .02 && Math.abs(p[2] - tel.W.T[2] - 1) < Math.abs(best[2] - tel.W.T[2] - 1))) best = p; } return best; })();
  const groundY = PA.PADY;
  let tContact = 1e9;
  const G2 = VEHS.map(v => graph(v));
  {
    const g = G2[0]; let best = 0, bd = 1e9;
    g.forEach((nd, i) => { const d = V.dist(nd.p, HITP); if (d < bd) { bd = d; best = i; } });
    const res = dijkstra(g, [[best, HIT]], 7);
    tel.nodeT = res.t; tel.par = res.par;
    g.forEach((nd, i) => { if (nd.p[1] < groundY + .5) tContact = Math.min(tContact, res.t[i]); });
  }
  const gph = r0() * 10;
  const groundT = (x, z) => { const dx = x - tel.W.T[0], dz = z - tel.W.T[2], d = Math.hypot(dx, dz), a = Math.atan2(dx, dz); const w = .5 + 1.9 * Math.pow(.5 + .5 * fbm(Math.cos(a) * 1.8 + gph, Math.sin(a) * 1.8, d * .025, 4), 2.2); return tContact + d / 46 * w; };
  for (let vi = 1; vi < VEHS.length; vi++) {
    const v = VEHS[vi], seeds = []; G2[vi].forEach((nd, i) => { if (nd.p[1] < groundY + .6) seeds.push([i, groundT(nd.p[0], nd.p[2])]); });
    const rs = dijkstra(G2[vi], seeds, 31 + vi); v.nodeT = rs.t; v.par = rs.par;
  }
  VEHS.forEach((v, vi) => G2[vi].forEach((nd, i) => { for (const m of nd.m) RTV[m] = v.nodeT[i] + JT[m] * .05; }));
  for (let i = 0; i < NGP; i++) RTG[i] = groundT(GPf[i * 4], GPf[i * 4 + 2]) + hsh(i, 9) * .04;
  /* identification: a part is boxed once 85% of its returns are in */
  const BOXES = [];
  VEHS.forEach((v, vi) => {
    const allP = [], allT = [];
    for (const sp of v.samp) {
      const ts = []; for (let i = sp.i0; i < sp.i0 + sp.n; i++) { ts.push(RTV[i]); allT.push(RTV[i]); }
      ts.sort((a, b) => a - b);
      // whole-vehicle box in vehicle space, from every part's rest pose
      const Tm = sp.part.xf ? sp.part.xf(v.st(HIT)) : X.make();
      for (let k = 0; k < sp.pts.length; k += 6) { const q = X.ap(Tm, [sp.pts[k], sp.pts[k + 1], sp.pts[k + 2]]); allP.push(q[0], q[1], q[2]); }
      const lab = v.parts[sp.name]; if (!lab) continue;
      BOXES.push({ v, sp, kind: 'part', mn: sp.bb[0], mx: sp.bb[1], lab, tIn: ts[Math.floor(ts.length * .85)] + .2, key: v.key + sp.name });
    }
    allT.sort((a, b) => a - b);
    const bb = PA.aabb(allP, 3, .001);
    BOXES.push({ v, kind: 'obj', mn: bb[0].map(q => q - .2), mx: bb[1].map(q => q + .2), lab: v.tag, tIn: allT[Math.floor(allT.length * .9)] + .5, key: v.key });
  });
  { let k = 0; BOXES.filter(b => b.kind === 'part').sort((a, c) => a.tIn - c.tIn).forEach(b => { b.tIn = Math.max(b.tIn, HIT + 1.1 + k * .3); k++; }); }
  VEHS.forEach(v => { const ob = BOXES.find(b => b.v === v && b.kind === 'obj'); ob.tIn = Math.max(ob.tIn, ...BOXES.filter(b => b.v === v && b.kind === 'part').map(b => b.tIn)) + .35; });

  /* the bolt: a displaced polyline from 70 m above the TLCs, forking */
  const BOLT = (() => {
    const rr = rng(101);
    const disp = (a, b, depth, rough) => { let pts = [a, b]; for (let d = 0; d < depth; d++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = V.dist(p, q), m = V.lerp(p, q, .5); out.push([m[0] + (rr() - .5) * l * rough, m[1] + (rr() - .5) * l * rough * .4, m[2] + (rr() - .5) * l * rough], q); } pts = out; } return pts; };
    const top = [HITP[0] + (rr() - .5) * 16, HITP[1] + 70, HITP[2] + (rr() - .5) * 16];
    const main = disp(top, HITP, 7, .72);
    const cum = [0]; for (let i = 1; i < main.length; i++) cum.push(cum[i - 1] + V.dist(main[i - 1], main[i]));
    const at = s => { const Lm = s * cum[cum.length - 1]; let i = 1; while (i < cum.length - 1 && cum[i] < Lm) i++; const k = (Lm - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return V.lerp(main[i - 1], main[i], k); };
    const rain = []; for (let k = 0; k < 420; k++) rain.push({ s0: -rr() * .9, sp: 2.6 + rr() * 2.2, off: [(rr() - .5) * 3, (rr() - .5) * 1, (rr() - .5) * 3] });
    const br = []; for (let k = 0; k < 7; k++) { const i = 8 + Math.floor(rr() * main.length * .7), s = main[i]; const dir = V.norm(V.add(V.sub(main[Math.min(main.length - 1, i + 3)], s), [(rr() - .5) * 9, -rr() * 2, (rr() - .5) * 9])); br.push({ at: i / main.length, pts: disp(s, V.mad(s, dir, 5 + rr() * 13), 5, .55) }); }
    // sparks: ballistic from the hit, one bounce, all analytic in their age
    const sparks = []; for (let i = 0; i < 520; i++) { const a = rr() * TAU, uu = rr() * 2 - 1, s = 4 + rr() * 16, h = Math.sqrt(1 - uu * uu); sparks.push({ v: [Math.cos(a) * h * s, Math.abs(uu) * s * .8 + 2, Math.sin(a) * h * s], life: .5 + rr() * .9 }); }
    return { main, br, at, rain, sparks };
  })();
  function sparkPos(sp, age) {
    const g = 22, y0 = HITP[1] - groundY, vy = sp.v[1];
    const tg = (vy + Math.sqrt(vy * vy + 2 * g * y0)) / g;         // hits the pad
    if (age < tg) return [HITP[0] + sp.v[0] * age, HITP[1] + vy * age - .5 * g * age * age, HITP[2] + sp.v[2] * age];
    const vy2 = (g * tg - vy) * .35, a2 = age - tg, px = HITP[0] + sp.v[0] * tg + sp.v[0] * .7 * a2, pz = HITP[2] + sp.v[2] * tg + sp.v[2] * .7 * a2;
    return [px, groundY + Math.max(0, vy2 * a2 - .5 * g * a2 * a2), pz];
  }

  /* ---------- helicopter points ---------- */
  const HS = PA.bake(HELO, .075, 44, { rotor: 0, trotor: 0 });
  /* rotor axes from the sampled discs (smallest principal axis of the blade points) */
  function discAxis(pts) {
    let cx = 0, cy = 0, cz = 0; const n = pts.length / 6;
    for (let k = 0; k < pts.length; k += 6) { cx += pts[k]; cy += pts[k + 1]; cz += pts[k + 2]; }
    cx /= n; cy /= n; cz /= n;
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < pts.length; k += 6) { const d = [pts[k] - cx, pts[k + 1] - cy, pts[k + 2] - cz]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a * 3 + b] += d[a] * d[b]; }
    // inverse power iteration via the adjugate is overkill: smallest axis = cross of the two largest
    let v1 = [1, .3, .2]; for (let it = 0; it < 40; it++) v1 = V.norm(R.ap(C, v1));
    const C2 = C.slice(); const l1 = V.dot(v1, R.ap(C, v1)); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C2[a * 3 + b] -= l1 * v1[a] * v1[b];
    let v2 = V.norm(V.cross(v1, [.2, 1, .1])); for (let it = 0; it < 40; it++) v2 = V.norm(R.ap(C2, v2));
    return { c: [cx, cy, cz], ax: V.norm(V.cross(v1, v2)) };
  }
  const HP = {};
  for (const sp of HS) { sp.bb = PA.aabb(sp.pts); HP[sp.name] = sp; }
  const hdHelo = !!(window.HD && HD.helo && HD.helo.HUB);
  const ROTAX = hdHelo ? { c: HD.helo.HUB, ax: [0, 1, 0] } : HP.rotor ? discAxis(HP.rotor.pts) : null, TROTAX = hdHelo ? { c: HD.helo.TAIL_HUB, ax: HD.helo.TAIL_AXIS } : HP.tailrotor ? discAxis(HP.tailrotor.pts) : null;
  if (ROTAX && ROTAX.ax[1] < 0) ROTAX.ax = V.mul(ROTAX.ax, -1);
  // rotor head: the blade roots and hub, within 1.3 m of the mast
  const HEAD = (() => { if (!HP.rotor) return null; const p = HP.rotor.pts, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let k = 0; k < p.length; k += 6) { const d = [p[k] - ROTAX.c[0], p[k + 1] - ROTAX.c[1], p[k + 2] - ROTAX.c[2]], along = V.dot(d, ROTAX.ax), rad = V.len(V.sub(d, V.mul(ROTAX.ax, along))); if (rad > 1.3) continue; for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[k + c]); mx[c] = Math.max(mx[c], p[k + c]); } } return [mn, mx]; })();
  /* rotation about an axis through c */
  function axisRot(ax, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, [x, y, z] = ax;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  function heloPartX(W, name, T) {
    const sp = HP[name];
    if (sp && sp.part.xf) return GEO.partXf(W, sp.part, { rotor: heloRot(T), trotor: heloTRot(T) });
    if (name === 'rotor' && ROTAX) { const Rm = axisRot(ROTAX.ax, heloRot(T)), c = ROTAX.c, rc = R.ap(Rm, c); return X.mul(W, X.make(Rm, [c[0] - rc[0], c[1] - rc[1], c[2] - rc[2]])); }
    if (name === 'tailrotor' && TROTAX) { const Rm = axisRot(TROTAX.ax, heloTRot(T)), c = TROTAX.c, rc = R.ap(Rm, c); return X.mul(W, X.make(Rm, [c[0] - rc[0], c[1] - rc[1], c[2] - rc[2]])); }
    return W;
  }
  const heloW = T => { const h = PA.helo(T); return X.make(h.R, h.p); };
  PA.heloW = heloW;

  /* ---------- drawing ---------- */
  function drawPts(pb, cam, pts, Tm, b0, a, sz, shadeOn, i0, reveal, T, lime, far) {
    far = far || 900;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1], W = cam.W, H = cam.H, near = cam.near;
    const M = Tm.R, t = Tm.T;
    // distance LOD: a vehicle a few pixels tall does not need every return
    const ppm = F / Math.max(1, Math.hypot(t[0] - e[0], t[1] - e[1], t[2] - e[2])), sd = ppm < 1.2 ? 6 : ppm < 2.5 ? 3 : ppm < 5 ? 2 : 1;
    let n = 0;
    for (let k = 0, i = i0; k < pts.length; k += 6 * sd, i += sd) {
      let age = 99;
      if (reveal) { const rt = reveal[i]; if (T < rt) continue; age = T - rt; }
      const px = pts[k], py = pts[k + 1], pz = pts[k + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
      if (zc < near) continue;
      const sx = cx + F * (dx * ru[0] + dy * ru[1] + dz * ru[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      let b = b0;
      if (shadeOn) {
        const nx = pts[k + 3], ny = pts[k + 4], nz = pts[k + 5];
        if (nx || ny || nz) {
          const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
          b = (.34 + .6 * Math.max(0, wx * L[0] + wy * L[1] + wz * L[2])) * (wx * dx + wy * dy + wz * dz > 0 ? .26 : 1) * b0;
        } else b = .6 * b0;
      }
      b *= Math.max(.3, 1 - zc / far) * a;
      let cr = WH[0], cg = WH[1], cb = WH[2];
      if (age < 1) { const kk = Math.exp(-age * 7); if (kk > .02) { b = Math.max(b, kk * 1.15 * a); cr += (LIME[0] - cr) * kk; cg += (LIME[1] - cg) * kk; cb += (LIME[2] - cb) * kk; } }
      if (lime) { cr = LIME[0]; cg = LIME[1]; cb = LIME[2]; }
      pb.dot(sx, sy, sz || (zc < 24 ? 2 : 1), cr, cg, cb, Math.min(1, b));
      n++;
    }
    return n;
  }
  const BEDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  function boxCorners(Tm, mn, mx, grow) {
    const c = V.mul(V.add(mn, mx), .5), h = V.mul(V.sub(mx, mn), .5 * grow), cs = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) cs.push(X.ap(Tm, [c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]));
    return cs;
  }
  function dottedBox(pb, cam, cs, col, a, step) {
    for (const [i, j] of BEDGES) {
      const n = Math.max(2, Math.ceil(V.dist(cs[i], cs[j]) / step));
      for (let k = 0; k <= n; k++) { const p = cam.project(V.lerp(cs[i], cs[j], k / n)); if (p) pb.dot(p[0], p[1], 2, col[0], col[1], col[2], a * (k === 0 || k === n ? 1 : .8)); }
    }
  }

  /* the battery: o = { a, radarOnly (own-site display in the scope), reveal (use the strike), boxes } */
  PA.site = function (pb, cam, T, o) {
    const out = { tags: [], returns: 0, objects: 0 };
    if (o.a <= .003) return out;
    const tau = PA.tau(T);
    let shown = 0;
    for (const v of VEHS) {
      if (o.radarOnly && v.key !== 'radar') continue;
      const st = v.st(T);
      for (const sp of v.samp) {
        const Tp = GEO.partXf(v.W, sp.part, st);
        shown += drawPts(pb, cam, sp.pts, Tp, 1, o.a * (o.radarOnly ? o.ownA : 1), 0, true, sp.i0, o.reveal ? RTV : null, T);
      }
    }
    if (o.radarOnly) {
      // the radar's own view of the pad: ground returns that flare as the beam sweeps past
      const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
      const ph = PA.phase(tau), A = PA.ARRAY, al = o.a * o.ownA;
      for (let i = 0; i < NGP; i++) {
        const x = GPf[i * 4], y = GPf[i * 4 + 1], z = GPf[i * 4 + 2], dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
        if (zc < cam.near) continue;
        const sx = cx + F * (dx * ru[0] + dy * ru[1] + dz * ru[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
        if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
        let d = ph - Math.atan2(x - A[0], z - A[2]); d -= Math.floor(d / TAU) * TAU;
        const kk = d < .7 ? Math.exp(-d * 6) : 0;
        const b = (GPf[i * 4 + 3] * (.55 + .7 * Math.exp(-d * 1.1)) + kk * .5) * Math.max(.3, 1 - zc / 700) * al;
        pb.dot(sx, sy, zc < 50 ? 2 : 1, WH[0] + (LIME[0] - WH[0]) * kk, WH[1] + (LIME[1] - WH[1]) * kk, WH[2] + (LIME[2] - WH[2]) * kk, Math.min(1, b));
      }
    }
    if (o.reveal) {
      // ground returns
      const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx + cam.shake[0], cy = cam.cy + cam.shake[1];
      for (let i = 0; i < NGP; i++) {
        const rt = RTG[i]; if (T < rt) continue;
        const x = GPf[i * 4], y = GPf[i * 4 + 1], z = GPf[i * 4 + 2], dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
        if (zc < cam.near) continue;
        const sx = cx + F * (dx * ru[0] + dy * ru[1] + dz * ru[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
        if (sx < 0 || sy < 0 || sx >= 1920 || sy >= 1080) continue;
        const age = T - rt, kk = Math.exp(-age * 7);
        let b = GPf[i * 4 + 3] * Math.max(.25, 1 - zc / 600) * o.a, cr = WH[0], cg = WH[1], cb = WH[2];
        if (kk > .02) { b = Math.max(b, kk * 1.1 * o.a); cr += (LIME[0] - cr) * kk; cg += (LIME[1] - cg) * kk; cb += (LIME[2] - cb) * kk; }
        pb.dot(sx, sy, zc < 50 ? 2 : 1, cr, cg, cb, Math.min(1, b)); shown++;
      }
      // the bolt, its pour, the flash and the sparks
      const c = T - T_BOLT;
      for (const sp of BOLT.sparks) { const age = T - HIT; if (age < 0 || age > sp.life) continue; const p = cam.project(sparkPos(sp, age)); if (!p) continue; const al = (1 - age / sp.life) * o.a; pb.dot(p[0], p[1], 2, 230, 255, 170, al); pb.add(p[0], p[1], 4, LIME[0], LIME[1], LIME[2], al * .08); }
      if (c > .7 && c < 1.05 + .7) {
        const tHit = .75, lead = .3, tr = c - tHit - lead, leading = tr < 0;
        const reach = leading ? E.sat((c - tHit) / lead) : 1;
        const I = leading ? .55 : Math.max(0, Math.exp(-tr * 5.5) + .7 * Math.exp(-Math.pow((tr - .11) * 30, 2)) + .5 * Math.exp(-Math.pow((tr - .24) * 26, 2)));
        const drawPath = (pts, from, to, inten, core) => {
          for (let i = Math.floor(from); i < Math.min(pts.length - 1, to); i++) {
            const a = pts[i], bq = pts[i + 1], n = Math.max(1, Math.ceil(V.dist(a, bq) / .07));
            for (let k = 0; k < n; k++) { const p = cam.project(V.lerp(a, bq, k / n)); if (!p) continue; pb.dot(p[0], p[1], core || 2, 248, 255, 232, Math.min(1, inten)); if (k % 3 === 0) { pb.add(p[0], p[1], 9, LIME[0], LIME[1], LIME[2], .035 * inten); pb.add(p[0], p[1], 21, LIME[0] * .6, LIME[1] * .6, LIME[2] * .6, .012 * inten); } }
          }
        };
        if (tr < .12) for (const d of BOLT.rain) { const s = d.s0 + (c - tHit + .35) * d.sp; if (s < 0 || s > 1) continue; const q = V.mad(BOLT.at(s), d.off, (1 - s) * .8), p = cam.project(q); if (!p) continue; pb.dot(p[0], p[1], 2, 230, 255, 190, .9); const q2 = cam.project(V.mad(BOLT.at(Math.max(0, s - .03)), d.off, (1 - s) * .8)); if (q2) pb.dline(q2[0], q2[1], p[0], p[1], 3, 1, 198, 244, 50, .5); }
        const m = BOLT.main, vis = reach * m.length;
        drawPath(m, 0, vis, I * 1.1, leading ? 2 : 3);
        for (const b of BOLT.br) { const s = b.at * m.length; if (vis > s) drawPath(b.pts, 0, (vis - s) / (m.length * .25) * b.pts.length, I * .6); }
        if (leading) { const tip = cam.project(m[Math.min(m.length - 1, Math.floor(vis))]); if (tip) pb.add(tip[0], tip[1], 10, 255, 255, 255, .25); }
        if (!leading) out.flash = 26 * Math.min(1, I);
      }
      // footprints and boxes
      const boxA = o.boxes;
      // each vehicle's screen extent: part tags stand in a column beside it, with leaders
      const ext = new Map();
      if (boxA > .01) for (const b of BOXES) if (b.kind === 'obj') {
        let x1 = -1e9, y0 = 1e9; for (const q of boxCorners(b.v.W, b.mn, b.mx, 1)) { const p = cam.project(q); if (p) { x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); } }
        ext.set(b.v, { x1, y0, k: 0 });
      }
      if (boxA > .01) for (const b of BOXES) {
        const partOut = b.kind === 'part' ? HIT + 9.5 : 1e9;
        const al = E.sat((T - b.tIn) / .25) * (1 - E.sat((T - partOut) / .6)) * boxA;
        if (al <= .01) continue;
        const g = 1 + .35 * (1 - E.outExpo(E.sat((T - b.tIn) / .45)));
        const Tm = b.kind === 'part' ? GEO.partXf(b.v.W, b.sp.part, b.v.st(T)) : b.v.W;
        const cs = boxCorners(Tm, b.mn, b.mx, g), col = b.kind === 'part' ? LIME : WH;
        dottedBox(pb, cam, cs, col, al, b.kind === 'part' ? .12 : .2);
        let best = null, rgt = null; for (const q of cs) { const p = cam.project(q); if (!p) continue; if (!best || p[1] < best[1]) best = p; if (!rgt || p[0] - p[1] * .2 > rgt[0] - rgt[1] * .2) rgt = p; }
        if (best && b.kind === 'obj') out.tags.push({ key: 'box' + b.key, id: b.lab[0], txt: b.lab[1], cls: '', x: best[0] + 8, y: best[1] - 30, a: al, pri: 6, down: true });
        else if (rgt) { const ex = ext.get(b.v); const k = ex.k++; out.tags.push({ key: 'box' + b.key, id: b.lab[0], txt: b.lab[1], cls: 'lime sm', ax: rgt[0], ay: rgt[1], x: ex.x1 + 26, y: ex.y0 + 6 + k * 23, a: al, pri: 5, down: true, leadCol: 'rgba(198,244,50,.75)' }); }
        if (b.kind === 'obj') out.objects++; else if (T < partOut) out.objects++;
        if (b.kind === 'obj') {
          const W = b.v.W, ra = (b.mx[0] - b.mn[0]) / 2 + .9, rb = (b.mx[2] - b.mn[2]) / 2 + .9, zc = (b.mx[2] + b.mn[2]) / 2;
          for (let k = 0; k < 150; k++) { const th = k / 150 * TAU, p = cam.project(X.ap(W, [Math.sin(th) * ra, .05, Math.cos(th) * rb + zc])); if (p) pb.dot(p[0], p[1], 2, LIME[0], LIME[1], LIME[2], al * .9); }
        }
      }
    }
    out.returns = shown;
    return out;
  };
  /* live lightning branches through the steel: parent->child links whose child just lit */
  PA.siteBranches = function (octx, cam, T, a) {
    if (a <= .01 || T < HIT - .1 || T > HIT + 6) return;
    octx.globalCompositeOperation = 'lighter'; octx.lineWidth = 1.2;
    VEHS.forEach((v, vi) => {
      const g = G2[vi], Tn = v.nodeT, Pa = v.par; if (!Tn) return;
      octx.beginPath();
      for (let i = 0; i < g.length; i++) { const tn = Tn[i]; if (T < tn || T > tn + .16 || Pa[i] < 0) continue; const p = cam.project(g[i].p), q = cam.project(g[Pa[i]].p); if (!p || !q) continue; octx.moveTo(q[0], q[1]); octx.lineTo(p[0], p[1]); }
      octx.strokeStyle = `rgba(210,255,120,${(.85 * a).toFixed(2)})`; octx.stroke();
    });
    octx.globalCompositeOperation = 'source-over';
  };

  /* the helicopter as returns (EO / LiDAR look). o: {a, size} */
  PA.heloDraw = function (pb, cam, T, a, o) {
    if (a <= .003) return 0;
    const W = heloW(T); let n = 0;
    for (const sp of HS) n += drawPts(pb, cam, sp.pts, heloPartX(W, sp.name, T), (sp.name === 'rotor' || sp.name === 'tailrotor' ? .95 : 1.15) * (o && o.gain || 1), a, o && o.size, true, 0, null, T, false, 1e9);
    return n;
  };
  /* rotor-head returns: blade roots and hub, within 1.3 m of the mast */
  const HEADIDX = (() => { const out = []; if (!HP.rotor || !ROTAX) return out; const p = HP.rotor.pts; for (let k = 0, i = 0; k < p.length; k += 6, i++) { const d = [p[k] - ROTAX.c[0], p[k + 1] - ROTAX.c[1], p[k + 2] - ROTAX.c[2]], al = V.dot(d, ROTAX.ax); if (V.len(V.sub(d, V.mul(ROTAX.ax, al))) <= 1.3) out.push(k); } return out; })();
  /* screen bounds of a helicopter part: the true extent of its projected returns */
  PA.heloBox = function (cam, T, which) {
    const W = heloW(T), names = which === 'all' ? HS.map(s => s.name).filter(nm => nm !== 'rotor' && nm !== 'tailrotor') : [which === 'head' ? 'rotor' : which];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, cx = cam.cx, cy = cam.cy;
    if (which === 'all' && ROTAX) {
      // the rotor disc, not wherever the four blades happen to be this frame
      const c = X.ap(W, V.mad(ROTAX.c, ROTAX.ax, .15)), ax = X.dir(W, ROTAX.ax), [U, Vv] = GEO.perp(ax), rr = 8.18;
      for (let k = 0; k < 32; k++) { const th = k / 32 * TAU, p = cam.project(V.add(c, V.add(V.mul(U, Math.cos(th) * rr), V.mul(Vv, Math.sin(th) * rr)))); if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); n++; }
    }
    for (const nm of names) {
      const sp = HP[nm]; if (!sp) continue;
      const Tm = heloPartX(W, nm, T), M = Tm.R, t = Tm.T, p = sp.pts;
      const idx = which === 'head' ? HEADIDX : null, cnt = idx ? idx.length : p.length / 6, st = which === 'all' ? 3 : 1;
      for (let q = 0; q < cnt; q += st) {
        const k = idx ? idx[q] : q * 6, px = p[k], py = p[k + 1], pz = p[k + 2];
        const dx = M[0] * px + M[1] * py + M[2] * pz + t[0] - e[0], dy = M[3] * px + M[4] * py + M[5] * pz + t[1] - e[1], dz = M[6] * px + M[7] * py + M[8] * pz + t[2] - e[2];
        const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < cam.near) continue;
        const sx = cx + F * (dx * ru[0] + dy * ru[1] + dz * ru[2]) / zc, sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc;
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy; n++;
      }
    }
    return n ? [x0, y0, x1, y1] : null;
  };
  /* rotor tip-path circle, for the disc the eye integrates */
  PA.heloDisc = function (pb, cam, T, a) {
    if (!ROTAX || a <= .01) return;
    const W = heloW(T), c = X.ap(W, ROTAX.c), ax = X.dir(W, ROTAX.ax), [U, Vv] = GEO.perp(ax), r = 8.18;
    for (let k = 0; k < 180; k++) { const th = k / 180 * TAU, p = cam.project(V.add(c, V.add(V.mul(U, Math.cos(th) * r), V.mul(Vv, Math.sin(th) * r)))); if (p && k % 2 === 0) pb.dot(p[0], p[1], 1, WH[0], WH[1], WH[2], a * .45); }
  };

  /* ---------- EO background: the ground and sea behind the target, seen through a narrow field.
     A screen lattice of rays is marched against the terrain; each hit is snapped to a hashed world
     cell sized to the local pixel footprint, so the returns stay fixed in the world as the view pans ---------- */
  PA.eoGround = function (pb, cam, T, a, step) {
    if (a <= .01) return;
    step = step || 17;
    const e = cam.eye, f = cam.f, ru = cam.r, u = cam.u, F = cam.fl, W = cam.W, H = cam.H;
    const pix = 1 / F;
    for (let sy = step * .5; sy < H; sy += step) for (let sx = step * .5; sx < W; sx += step) {
      const jx = (hsh(sx | 0, sy | 0) - .5) * step, jy = (hsh(sy | 0, (sx | 0) + 7) - .5) * step;
      const X0 = (sx + jx - cam.cx) / F, Y0 = -(sy + jy - cam.cy) / F;
      const dx = f[0] + ru[0] * X0 + u[0] * Y0, dy = f[1] + ru[1] * X0 + u[1] * Y0, dz = f[2] + ru[2] * X0 + u[2] * Y0;
      // rays that cannot come down to the sea inside 13 km would only march; the EO looks seaward
      if (dy * Math.hypot(dx, dz) > -e[1] / 13000) continue;
      let t0 = 150, t = t0, hit = false;
      for (let k = 0; k < 38; k++) {
        t = t0 * Math.pow(1.125, k);
        const x = e[0] + dx * t, y = e[1] + dy * t, z = e[2] + dz * t;
        if (y < PA.gy(x, z)) { hit = true; break; }
        if (t > 14000) break;
      }
      if (!hit) continue;
      let lo = t / 1.125, hi = t;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) * .5; if (e[1] + dy * m < PA.gy(e[0] + dx * m, e[2] + dz * m)) hi = m; else lo = m; }
      const hx = e[0] + dx * hi, hz = e[2] + dz * hi;
      const lv = Math.round(Math.log2(Math.max(.5, hi * pix * step * .8))), c = Math.pow(2, lv);
      const ix = Math.floor(hx / c), iz = Math.floor(hz / c);
      const px = (ix + hsh(ix, iz * 3 + lv)) * c, pz = (iz + hsh(iz, ix * 5 + lv + 11)) * c, g = PA.gy(px, pz), sea = g <= 0;
      const py = sea ? 1.2 * Math.sin(px * .021 + T * .9) + .7 * Math.sin(pz * .034 - T * 1.3) : g;
      const ddx = px - e[0], ddy = py - e[1], ddz = pz - e[2], zc = ddx * f[0] + ddy * f[1] + ddz * f[2]; if (zc < 50) continue;
      const qx = cam.cx + F * (ddx * ru[0] + ddy * ru[1] + ddz * ru[2]) / zc, qy = cam.cy - F * (ddx * u[0] + ddy * u[1] + ddz * u[2]) / zc;
      const hv = hsh(ix * 7 + lv, iz);
      const b = (sea ? .2 + .38 * hv * (.55 + .45 * Math.sin(px * .01 + pz * .013 - T * 1.7)) : .3 + .45 * hv) * a;
      pb.dot(qx, qy, hv > .72 ? 2 : 1, 238, 238, 228, b);
    }
  };

  /* ---------- the EO director: eye position and a lagged aim, integrated once ---------- */
  const eoPart = VEHS[2].model.parts.find(p => p.name === 'eo');
  PA.eoEye = T => { const st = PA.pzState(T), Tp = eoPart ? GEO.partXf(PZ.W, eoPart, st) : PZ.W; return X.ap(Tp, [.46, 1.5, .7]); };
  const AIM = [], FOV = new Float32Array(46 * 120 + 2), TA0 = 106;
  {
    let aim = null, fv = 4;
    for (let k = 0; k < FOV.length; k++) {
      const T = TA0 + k / 120, h = PA.helo(T), tgt = V.add(V.mad(h.p, h.v, .15), R.ap(h.R, [0, 2.2, -1.5])), rngm = V.dist(PA.eoEye(T), h.p);
      if (!aim) aim = tgt.slice();
      aim = V.add(aim, V.mul(V.sub(tgt, aim), 1 - Math.exp(-6.5 / 120)));
      const want = E.clamp(2 * Math.atan(21 / rngm) / DEG, .45, 6);
      fv += (want - fv) * (1 - Math.exp(-1.6 / 120));
      AIM.push(aim); FOV[k] = fv;
    }
  }
  PA.eoAim = T => { const f = E.clamp(T - TA0, 0, 45.9) * 120, k = Math.floor(f), u = f - k; return V.lerp(AIM[k], AIM[k + 1], u); };
  PA.eoFov = T => { const f = E.clamp(T - TA0, 0, 45.9) * 120, k = Math.floor(f), u = f - k; return (FOV[k] + (FOV[k + 1] - FOV[k]) * u) * DEG; };
  PA.siteInfo = { NV, NGP, heloPts: HS.reduce((s, p) => s + p.pts.length / 6, 0), boxes: BOXES.length };
})();
