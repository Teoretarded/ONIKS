/* DAMAGE SCAN · the ship. HD.destroyer sampled into the assemblies the damage scan pulls apart (the aft section:
   mast, aft SPY arrays, uptake 2, midships deckhouse, boats, SVTT, the aft Mk 41 with its block of cells below
   deck, the Mk 99 director platform, the aft Phalanx, the hangar block, the hangar doors, the MH-60R inside),
   the lightning strike's fronts through her steel, and the per-point renderer: lit dots, X-ray modes, the fronts'
   lime flash, the closing slice, occlusion writes for the sea behind her. All in her frame (PH world file). */
(function () {
  'use strict';
  const { V, R, X, E, rng } = M3;
  const { DEG, TAU, LIME, WH } = PH;
  const DW = PH.DW, G = GEO, DA = HD.destroyer.A, hD = DA.deckY;
  const SHIP = PH.SHIP = {};
  const PROF = STAGE.Q.has('prof') ? {} : null;
  SHIP.PROF = PROF;
  const t0load = performance.now();

  /* ---------- helpers ---------- */
  function tp(T, pr) {
    const q = Object.assign({}, pr);
    if (pr.p) q.p = pr.p.map(p => X.ap(T, p));
    if (pr.t === 'lathe') { q.a = X.ap(T, pr.a); q.d = X.dir(T, pr.d); }
    if (pr.t === 'blades') { q.c = X.ap(T, pr.c); q.d = X.dir(T, pr.d); }
    return q;
  }
  const tps = (T, L) => L.map(p => tp(T, p));
  const piv = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  function bboxOf(pr) {
    let P;
    if (pr.p) P = pr.p;
    else if (pr.t === 'lathe') { const rm = Math.max(...pr.st.map(q => q[1])); P = []; for (const q of pr.st) { const c = V.mad(pr.a, pr.d, q[0]); P.push(V.add(c, [rm, rm, rm]), V.sub(c, [rm, rm, rm])); } }
    else if (pr.t === 'blades') P = [pr.c];
    else P = [[0, 0, 0]];
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const q of P) for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
    return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
  }
  const sampleP = (prims, s, seed, opt) => G.sample({ parts: [{ name: 'g', prims }] }, s, seed, {}, opt)[0].pts;
  const xfPts = (P, T) => { const o = new Float32Array(P.length); for (let i = 0; i < P.length; i += 6) { const q = X.ap(T, [P[i], P[i + 1], P[i + 2]]), n = X.dir(T, [P[i + 3], P[i + 4], P[i + 5]]); o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2]; o[i + 3] = n[0]; o[i + 4] = n[1]; o[i + 5] = n[2]; } return o; };

  /* multi-level cloud: every level bucketed on one grid of cells with a bounding sphere, so each cell picks its
     own level of detail from its distance to the eye */
  function lodCloud(levels, cs) {
    cs = cs || 1.1;
    const nl = levels.length, cells = new Map();
    levels.forEach((L, li) => {
      const P = L.pts, n = P.length / 6;
      for (let i = 0; i < n; i++) {
        const k = (Math.floor(P[i * 6] / cs) + 512) * 1048576 + (Math.floor(P[i * 6 + 1] / cs) + 512) * 1024 + (Math.floor(P[i * 6 + 2] / cs) + 512);
        let c = cells.get(k); if (!c) { c = levels.map(() => []); cells.set(k, c); } c[li].push(i);
      }
    });
    const lv = levels.map(L => new Float32Array(L.pts.length)), SD = 4 + 2 * nl, CH = new Float32Array(cells.size * SD), o = new Array(nl).fill(0);
    let c = 0;
    for (const cell of cells.values()) {
      let mx = 0, my = 0, mz = 0, m = 0;
      cell.forEach((idx, li) => { const P = levels[li].pts; for (const i of idx) { mx += P[i * 6]; my += P[i * 6 + 1]; mz += P[i * 6 + 2]; m++; } });
      mx /= m; my /= m; mz /= m;
      let rr = 0;
      cell.forEach((idx, li) => {
        const P = levels[li].pts, Dd = lv[li], i0 = o[li];
        for (const i of idx) { for (let q = 0; q < 6; q++) Dd[o[li] * 6 + q] = P[i * 6 + q]; rr = Math.max(rr, Math.hypot(P[i * 6] - mx, P[i * 6 + 1] - my, P[i * 6 + 2] - mz)); o[li]++; }
        CH[c * SD + 4 + li * 2] = i0; CH[c * SD + 5 + li * 2] = o[li];
      });
      CH[c * SD] = mx; CH[c * SD + 1] = my; CH[c * SD + 2] = mz; CH[c * SD + 3] = rr + .01;
      c++;
    }
    let np = 0; for (const L of lv) np += L.length / 6;
    return { lv, sp: levels.map(L => L.sp), ch: CH, nch: c, sd: SD, nl, np };
  }
  const LV = {
    shell: [.16, .32, .64, 1.28, 2.56], part: [.05, .1, .2, .4, .8], block: [.18, .36, .72, 1.44, 2.88], small: [.03, .06, .12, .24, .48],
  };
  const lodPrims = (prims, levels, seed, cs) => lodCloud(levels.map((sp, li) => ({ sp, pts: sampleP(prims, sp, seed + li * 7, li >= 2 ? { fine: false } : undefined) })), cs);

  /* ---------- the destroyer, partitioned ---------- */
  const DDM = HD.destroyer();
  const DST = { sps: 0, gunYaw: 0, gunPitch: 0, ciwsSpin: 0, vlsOpen: [], hangar: 0 };
  const partOf = n => DDM.parts.find(p => p.name === n);
  /* the launch cells' hatches are drawn on their own (they open) */
  const LAUNCH = PH.ICP.map(m => { const c = DA.vls(m.cell), hs = m.cell % 2 ? 1 : -1; return { m, c, hs, hinge: [c[0] + hs * .3, c[1] + .02, c[2]] }; });
  const inLaunchHatch = cc => LAUNCH.some(L => Math.abs(cc[0] - L.c[0]) < .12 && Math.abs(cc[2] - L.c[2]) < .12 && cc[1] > L.c[1] - .1);
  function asmOf(pn, pr) {
    const c = bboxOf(pr).c, x = c[0], y = c[1], z = c[2];
    switch (pn) {
      case 'hull': case 'rails': case 'deck': return 'hull';
      case 'arms':
        if (z < -26 && z > -31.5 && Math.abs(x) > 5.5) return x > 0 ? 'svttS' : 'svttP';
        if (z < -20 && z > -25 && y > 9.6) return 'deckhouse';
        return 'hull';
      case 'super':
        if (z > 1.5) return 'superF';
        if (z > -23.6) return 'deckhouse';
        if (z < -34.4 && z > -40.4 && y > 13.1 && Math.abs(x) < 3.6) return 'spg';
        return 'hangarBlk';
      case 'spy': return z > 19 ? 'superF' : x > 0 ? 'spyAS' : 'spyAP';
      case 'stacks': return z > -7 ? 'superF' : 'stack2';
      case 'decoys': return z > -3 ? 'superF' : z > -11 ? 'deckhouse' : 'stack2';
      case 'boats': return x > 0 ? 'boatS' : 'boatP';
      case 'mast': return 'mast';
      case 'hangar': return 'hdoor';
      case 'vlsF': return 'vlsF';
      case 'vlsA': return 'vlsA';
      default: return null;
    }
  }
  const PRIMS = {};
  for (const part of DDM.parts) {
    if (['sps', 'gun', 'ciwsF', 'ciwsA'].includes(part.name)) continue;
    const prims = part.dyn ? part.dyn(DST) : part.prims;
    for (const pr of prims) {
      if ((part.name === 'vlsF' || part.name === 'vlsA') && inLaunchHatch(bboxOf(pr).c)) continue;
      const a = asmOf(part.name, pr); if (!a) continue;
      (PRIMS[a] || (PRIMS[a] = [])).push(pr);
    }
  }

  /* ---------- below deck and inside: the Mk 41 blocks of cells, the MH-60R with its blades folded ---------- */
  const VF_Z = 38.9, VA_Z = -29.4, VDEPTH = 7.7;
  const O_ = (...a) => Object.assign({}, ...a), F_ = o => O_({ fine: true }, o);
  const vlsModules = fwd => { const out = [], rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z, mods = rows / 4; for (let m = 0; m < 4; m++) for (let r = 0; r < mods; r++) out.push([(-3 + 2 * m) * 1.05, zc + (mods === 1 ? 0 : (r ? -1.7 : 1.7))]); return out; };
  /* each 8-cell module a closed block: walls, the central uptake, cell dividers, the plenum below */
  function vlsBlock(fwd) {
    const P = [], y0 = hD(fwd ? VF_Z : VA_Z) + .06 - .3, y1 = y0 - VDEPTH + .3;
    for (const [xm, zm] of vlsModules(fwd)) {
      P.push(G.box([xm - 1.02, y1, zm - 1.68], [xm + 1.02, y0, zm + 1.68], { bottom: true, skip: [1] }));
      for (const sx of [-1, 1]) P.push(G.panel([[xm + sx * .19, y1, zm - 1.68], [xm + sx * .19, y1, zm + 1.68], [xm + sx * .19, y0, zm + 1.68], [xm + sx * .19, y0, zm - 1.68]], { ds: 1.6 }));
      for (const dz of [-.85, 0, .85]) for (const sx of [-1, 1]) P.push(G.panel([[xm + sx * .19, y1, zm + dz], [xm + sx * 1.02, y1, zm + dz], [xm + sx * 1.02, y0, zm + dz], [xm + sx * .19, y0, zm + dz]], { ds: 2.2 }));
      P.push(G.box([xm - 1.02, y1 - .55, zm - 1.68], [xm + 1.02, y1, zm + 1.68], F_({ bottom: true, skip: [1], ds: 1.4 })));
    }
    return P;
  }
  /* the blocks seen from outside once they stand clear of the deck: a lid of cells on top (the deck plate stays
     with the launcher's hatches), so the risen module reads as a closed block of 64 cells */
  function vlsLid(fwd) {
    const P = [], y0 = hD(fwd ? VF_Z : VA_Z) + .06 - .3;
    for (const [xm, zm] of vlsModules(fwd)) {
      for (const dz of [-1.275, -.425, .425, 1.275]) for (const sx of [-1, 1]) {
        const xc = xm + sx * .6;
        P.push(G.box([xc - .3, y0 - .05, zm + dz - .3], [xc + .3, y0 + .02, zm + dz + .3], { skip: [0] }));
      }
    }
    return P;
  }
  function heloFolded() {
    const m = HD.helo(), parts = [];
    for (const p of m.parts) {
      if (p.name === 'tailrotor') { parts.push({ name: p.name, prims: tps(p.xf({ trotor: .3 }), p.prims) }); continue; }
      if (p.name !== 'rotor') { parts.push({ name: p.name, prims: p.prims }); continue; }
      const P = p.dyn({ droop: .3 }), out = [], HC = HD.helo.HUB;
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2, u = [Math.sin(a), 0, Math.cos(a)];
        const tgt = Math.PI + [-.11, -.04, .04, .11][k];
        let d = tgt - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const hinge = [HC[0] + u[0] * .95, HC[1], HC[2] + u[2] * .95], Tf = piv(R.y(d), hinge), Tl = X.mul(X.make(R.I(), [0, -.06 * k + .1, 0]), Tf);
        const blade = P.slice(k * 13, k * 13 + 13);
        blade.forEach((pr, i) => out.push(i < 8 ? tp(Tl, pr) : pr));
      }
      for (const pr of P.slice(52)) out.push(pr);
      parts.push({ name: 'rotor', prims: out });
    }
    return parts.flatMap(p => p.prims);
  }
  const HELO_AT = [-3.7, hD(-40.4), -40.4];
  PRIMS.vlsBF = vlsBlock(true); PRIMS.vlsBA = vlsBlock(false).concat(vlsLid(false));
  PRIMS.helo = tps(X.make(R.I(), HELO_AT), heloFolded());
  /* the engine rooms: MER 1 under the forward uptake, MER 2 under the aft one (the damaged section) */
  const IN = PH.INT, GTP = IN.lm2500(), GTALL = [...GTP.stat, ...GTP.rot, ...GTP.pt];
  for (const g of IN.GTS) { const k = g.mer === 1 ? 'mach1' : 'mach2'; (PRIMS[k] || (PRIMS[k] = [])).push(...tps(IN.gtXf(g), GTALL)); }
  PRIMS.mach1.push(...IN.mrg(IN.MRGS[0])); PRIMS.mach2.push(...IN.mrg(IN.MRGS[1]));
  PRIMS.shafts = IN.shafts();

  /* assemblies: [name, class, exploded offset (her frame, m), when it leaves (0..1), level set]
     shell: steel the X-ray sees through · part: always seen · hidden: seen only where the scan has opened her */
  const SPYN = DA.spyN || [[1, 0, 0], [-1, 0, 0], [.7, 0, -.7], [-.7, 0, -.7]];
  const spyOff = n => [n[0] * 9, 3.5, n[2] * 9 - 2];
  const ASM_DEF = [
    ['hull', 'shell', null, 0, 'shell'], ['superF', 'shell', null, 0, 'shell'], ['vlsF', 'part', null, 0, 'part'], ['vlsBF', 'hidden', null, 0, 'block'],
    ['mast', 'part', [0, 14, 9], 0, 'part'],
    ['spyAS', 'part', spyOff(SPYN[2]), .08, 'part'], ['spyAP', 'part', spyOff(SPYN[3]), .08, 'part'],
    ['stack2', 'shell', [0, 21, 1], .14, 'shell'],
    ['ciwsA', 'part', [0, 24, -9], .04, 'small'],
    ['spg', 'part', [0, 18, -2], .12, 'part'],
    ['boatS', 'part', [14, 6, 2], .2, 'part'], ['boatP', 'part', [-14, 6, 2], .2, 'part'],
    ['hangarBlk', 'shell', [0, 10, -8], .26, 'shell'],
    ['deckhouse', 'shell', [0, 10, 1], .3, 'shell'],
    ['hdoor', 'shell', [0, 10, -17], .34, 'shell'],
    ['svttS', 'part', [10, 4, 0], .38, 'part'], ['svttP', 'part', [-10, 4, 0], .38, 'part'],
    ['helo', 'hidden', [0, 3.4, -30], .44, 'part'],
    ['vlsA', 'part', [0, 16, 0], .5, 'part'], ['vlsBA', 'hidden', [0, 16, 0], .5, 'block'],
    ['mach1', 'hidden', null, 0, 'part'], ['mach2', 'hidden', [0, -11, 0], .46, 'part'], ['shafts', 'hidden', null, 0, 'part'],
    ['uw', 'uw', null, 0, 'shell'], ['props', 'hidden', null, 0, 'small'],
  ];
  /* point-generator assemblies: the underwater body, both propellers and rudders */
  const lodFn = (fn, levels, seed, cs) => lodCloud(levels.map((sp, li) => ({ sp, pts: fn(sp, seed + li * 7, li) })), cs);
  const GEN = {
    uw: (sp, sd) => IN.underwater(sp * 1.5, sd),
    props: (sp, sd) => {
      const parts = [];
      for (const sx of [1, -1]) {
        parts.push(xfPts(IN.propeller(sp, sd, sx < 0), X.make(R.I(), [sx * IN.PROP.x, IN.PROP.y, IN.PROP.z])));
        parts.push(xfPts(IN.rudder(sp * 1.6, sd + 3), X.make(R.I(), [sx * IN.RUDDER.x, IN.RUDDER.top, IN.RUDDER.z])));
      }
      let n = 0; for (const p of parts) n += p.length; const o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o;
    },
  };
  const ASM = {};
  for (const [name, cls, off, w0, lv] of ASM_DEF) {
    const seed = 100 + name.length * 13 + name.charCodeAt(0), cs = cls === 'shell' || cls === 'uw' ? 2.6 : 1.3;
    ASM[name] = { name, cls, off, w0, cl: GEN[name] ? lodFn(GEN[name], LV[lv], seed, cs) : lodPrims(PRIMS[name] || [], LV[lv], seed, cs) };
  }
  SHIP.ASM = ASM; SHIP.ASM_LIST = ASM_DEF.map(d => ASM[d[0]]);
  /* the mast's radar turns on its own pivot; the gun and both Phalanx mounts yaw on theirs */
  const PS = [0, 28.2, 21.6];
  const SPS_CL = lodCloud(LV.small.map((sp, li) => ({ sp, pts: G.sample({ parts: [partOf('sps')] }, sp, 320 + li, DST, li >= 2 ? { fine: false } : undefined)[0].pts })), .8);
  const gunP = partOf('gun'), GUN_CL = lodCloud(LV.small.map((sp, li) => ({ sp, pts: sampleP(gunP.dyn(DST), sp, 330 + li, li >= 2 ? { fine: false } : undefined) })), .9);
  /* Phalanx: the fixed base and the elevating group sampled at a table of pitches (the effect stage slews them) */
  const CIWS_PITCH = [-.3, -.1, .1, .35, .6, .85, 1.1, 1.35];
  const CIWS = [0, 1].map(i => {
    const part = partOf(i ? 'ciwsA' : 'ciwsF');
    const all = pitch => part.dyn(Object.assign({}, DST, { ciwsPitch: i ? [0, pitch] : [pitch, 0] }));
    const base = all(.35).slice(0, 5);
    return {
      part, i,
      base: lodCloud(LV.small.map((sp, li) => ({ sp, pts: sampleP(base, sp, 340 + i * 17 + li, li >= 2 ? { fine: false } : undefined) })), .9),
      elev: CIWS_PITCH.map((pt, k) => lodCloud(LV.small.map((sp, li) => ({ sp, pts: sampleP(all(pt).slice(5), sp, 360 + i * 31 + k * 5 + li, li >= 2 ? { fine: false } : undefined) })), .9)),
    };
  });
  SHIP.CIWS_PITCH = CIWS_PITCH;
  const ciwsPick = p => { let b = 0; for (let k = 1; k < CIWS_PITCH.length; k++) if (Math.abs(CIWS_PITCH[k] - p) < Math.abs(CIWS_PITCH[b] - p)) b = k; return b; };
  /* launch-cell hatches: a plate in hinge-local coordinates (the hinge on the outboard edge) */
  const HATCH = [-1, 1].map(hs => lodCloud([.02, .04, .08, .16].map(sp => { const o = []; for (let x = sp * .5; x < .6; x += sp) for (let z = -.3 + sp * .5; z < .3; z += sp) o.push(-hs * x, .02, z, 0, 1, 0); return { sp, pts: new Float32Array(o) }; }), .5));
  let NPTS = 0; for (const a of Object.values(ASM)) NPTS += a.cl.np;
  SHIP.LOG = [`sample ${(performance.now() - t0load).toFixed(0)} ms, ship pts ${NPTS}`];

  /* ---------- the strike's fronts: branching through her steel from the mast top ----------
     A voxel graph over her (1 m), heavy-tailed step costs so the front forks into tendrils; each point gets the
     film seconds after the stroke at which the front reaches it. */
  const MAST_TOP = V.add(DA.mastTop, [0, .3, 0]);
  SHIP.MAST_TOP = MAST_TOP;
  const XR = (() => {
    const Hv = 1.0, key = (ix, iy, iz) => ((ix + 400) * 1024 + (iy + 400)) * 1024 + (iz + 400);
    const map = new Map(), nodes = [];
    const add = (P, T) => { for (let i = 0; i < P.length; i += 6) { const p = T ? X.ap(T, [P[i], P[i + 1], P[i + 2]]) : [P[i], P[i + 1], P[i + 2]]; const ix = Math.floor(p[0] / Hv), iy = Math.floor(p[1] / Hv), iz = Math.floor(p[2] / Hv), k = key(ix, iy, iz); if (!map.has(k)) { map.set(k, nodes.length); nodes.push({ ix, iy, iz, p }); } } };
    for (const a of Object.values(ASM)) if (a.cls !== 'hidden') add(a.cl.lv[Math.min(2, a.cl.nl - 1)]);
    add(SPS_CL.lv[2]); add(GUN_CL.lv[2], partOf('gun').xf(DST));
    for (const c of CIWS) { const W = c.part.xf(DST); add(c.base.lv[2], W); add(c.elev[3].lv[2], W); }
    const NN = nodes.length, rr = rng(4711), cost = new Float32Array(NN); for (let i = 0; i < NN; i++) cost[i] = .35 + 5 * Math.pow(rr(), 4);
    const t = new Float64Array(NN).fill(1e9), par = new Int32Array(NN).fill(-1), heap = [];
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r2 = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    let best = 0, bd = 1e9; nodes.forEach((nd, i) => { const d = V.dist(nd.p, MAST_TOP); if (d < bd) { bd = d; best = i; } });
    t[best] = 0; push(0, best);
    while (heap.length) {
      const [d, i] = pop(); if (d > t[i]) continue; const a = nodes[i];
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
        if (!dx && !dy && !dz) continue; const j = map.get(key(a.ix + dx, a.iy + dy, a.iz + dz)); if (j === undefined) continue;
        const d2 = d + V.dist(a.p, nodes[j].p) * cost[j]; if (d2 < t[j]) { t[j] = d2; par[j] = i; push(d2, j); }
      }
    }
    let tMax = 0; for (let i = 0; i < NN; i++) if (t[i] < 1e8) tMax = Math.max(tMax, t[i]);
    // film seconds after the stroke: quick down the mast, slower out along the hull
    const SPAN = 8.4, ts = new Float32Array(NN); for (let i = 0; i < NN; i++) ts[i] = t[i] > 1e8 ? SPAN : SPAN * Math.pow(t[i] / tMax, .8);
    const jr = rng(99);
    function rtAt(x, y, z) {
      const ix = Math.floor(x / Hv), iy = Math.floor(y / Hv), iz = Math.floor(z / Hv);
      let v = map.get(key(ix, iy, iz));
      for (let rad = 1; v === undefined && rad <= 3; rad++) for (let dx = -rad; dx <= rad && v === undefined; dx++) for (let dy = -rad; dy <= rad && v === undefined; dy++) for (let dz = -rad; dz <= rad && v === undefined; dz++) v = map.get(key(ix + dx, iy + dy, iz + dz));
      return v === undefined ? SPAN : ts[v];
    }
    /* inside her (below deck, in the hangar): the moment the front crosses the deck above, a little later with depth */
    const rtIn = (x, y, z) => { const yd = Math.max(y, hD(z) + .3); return rtAt(x, yd, z) + .05 * (yd - y); };
    function rtFor(P, T, inside) { const out = new Float32Array(P.length / 6); for (let i = 0, j = 0; j < P.length; i++, j += 6) { const p = T ? X.ap(T, [P[j], P[j + 1], P[j + 2]]) : [P[j], P[j + 1], P[j + 2]]; out[i] = (inside ? rtIn : rtAt)(p[0], p[1], p[2]) + jr() * .06; } return out; }
    return { nodes, ts, par, SPAN, rtFor, rtAt };
  })();
  SHIP.XR = XR;
  for (const a of Object.values(ASM)) a.cl.rt = a.cl.lv.map(P => XR.rtFor(P, null, a.cls === 'hidden'));
  SPS_CL.rt = SPS_CL.lv.map(P => XR.rtFor(P));
  { const W = partOf('gun').xf(DST); GUN_CL.rt = GUN_CL.lv.map(P => XR.rtFor(P, W)); }
  for (const c of CIWS) { const W = c.part.xf(DST); c.base.rt = c.base.lv.map(P => XR.rtFor(P, W)); for (const e of c.elev) e.rt = e.lv.map(P => XR.rtFor(P, W)); }
  for (const L of LAUNCH) { L.rtc = XR.rtAt(L.c[0], L.c[1] + .5, L.c[2]); }
  SHIP.LOG.push(`xr nodes ${XR.nodes.length}, load ${(performance.now() - t0load).toFixed(0)} ms`);

  /* the bolt: a stepped leader pours down out of the dark onto the mast's whip, then the return stroke */
  SHIP.BOLT = (() => {
    const rr = rng(1402), hit = MAST_TOP;
    const disp = (a, b, depth, rough) => { let pts = [a, b]; for (let d = 0; d < depth; d++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], l = V.dist(p, q), m = V.lerp(p, q, .5); out.push([m[0] + (rr() - .5) * l * rough, m[1] + (rr() - .5) * l * rough * .35, m[2] + (rr() - .5) * l * rough], q); } pts = out; } return pts; };
    const main = disp(V.add(hit, [60, 330, -40]), hit, 8, .6);
    const br = [];
    for (let k = 0; k < 18; k++) {
      const i = 6 + Math.floor(rr() * main.length * .82), s = main[i];
      const dir = V.norm(V.add(V.sub(main[Math.min(main.length - 1, i + 4)], s), [(rr() - .5) * 70, -rr() * 12, (rr() - .5) * 70]));
      br.push({ at: i / main.length, pts: disp(s, V.mad(s, dir, 22 + rr() * 60), 5, .5), w: .35 + .5 * rr() });
    }
    const sp = []; for (let i = 0; i < 380; i++) { const a = rr() * TAU, u = rr() * 2 - 1, s = 4 + rr() * 16, h = Math.sqrt(1 - u * u); sp.push([Math.cos(a) * h * s, Math.abs(u) * s * .7 + 3, Math.sin(a) * h * s, .45 + rr() * .9]); }
    return { hit, main, br, sp, lead: 1.3 };
  })();

  /* ---------- per-frame X-ray state (set by the film) ----------
     on: the scan has her · tb: film s since the stroke (points open once the front has reached them)
     zs: the closing slice (her z; points aft of it are steel again) · solid: shell opacity where open */
  const XS = SHIP.XS = { on: false, tb: -1e9, zs: -99, solid: 0 };

  /* ---------- the per-point pass ---------- */
  let C = null, BD = null, BW = 1920, BH = 1080;
  SHIP.use = (cam, buf) => { C = cam; BD = buf.d; BW = buf.W; BH = buf.H; };
  function dot(x, y, s, r, g, b, a) {
    const R_ = r * a, G_ = g * a, B_ = b * a, d = BD;
    const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > BW || y0 + s > BH) return;
    let i = (y0 * BW + x0) << 2; const step = (BW - s) << 2;
    for (let j = 0; j < s; j++, i += step) for (let k = 0; k < s; k++, i += 4) { if (d[i] < R_) d[i] = R_; if (d[i + 1] < G_) d[i + 1] = G_; if (d[i + 2] < B_) d[i + 2] = B_; }
  }
  SHIP.dot = dot;
  const LK = V.norm([.42, .78, -.46]);
  SHIP.LK = LK;
  const XF = new Float64Array(26);
  function prep(Tm) {
    const M = Tm.R, t = Tm.T, e = C.eye, f = C.f, r = C.r, u = C.u, x = XF;
    const tx = t[0] - e[0], ty = t[1] - e[1], tz = t[2] - e[2];
    for (let c = 0; c < 3; c++) { x[c] = r[0] * M[c] + r[1] * M[3 + c] + r[2] * M[6 + c]; x[3 + c] = u[0] * M[c] + u[1] * M[3 + c] + u[2] * M[6 + c]; x[6 + c] = f[0] * M[c] + f[1] * M[3 + c] + f[2] * M[6 + c]; }
    x[9] = r[0] * tx + r[1] * ty + r[2] * tz; x[10] = u[0] * tx + u[1] * ty + u[2] * tz; x[11] = f[0] * tx + f[1] * ty + f[2] * tz;
    for (let c = 0; c < 3; c++) { x[12 + c] = M[c] * LK[0] + M[3 + c] * LK[1] + M[6 + c] * LK[2]; x[15 + c] = -(M[c] * tx + M[3 + c] * ty + M[6 + c] * tz); }
    const F = C.fl, xr = (BW - C.cx - C.shake[0]) / F, xl = (C.cx + C.shake[0]) / F, yt = (C.cy + C.shake[1]) / F, yb = (BH - C.cy - C.shake[1]) / F;
    x[18] = xr; x[19] = 1 / Math.sqrt(1 + xr * xr); x[20] = xl; x[21] = 1 / Math.sqrt(1 + xl * xl); x[22] = yt; x[23] = 1 / Math.sqrt(1 + yt * yt); x[24] = yb; x[25] = 1 / Math.sqrt(1 + yb * yb);
    return x;
  }
  SHIP.prep = prep;
  function sphereIn(x, cx_, cy_, cz_, rad, near) {
    const zc = x[6] * cx_ + x[7] * cy_ + x[8] * cz_ + x[11];
    if (zc < near - rad) return false;
    const xc = x[0] * cx_ + x[1] * cy_ + x[2] * cz_ + x[9], yc = x[3] * cx_ + x[4] * cy_ + x[5] * cz_ + x[10];
    if ((xc - x[18] * zc) * x[19] > rad) return false;
    if ((-xc - x[20] * zc) * x[21] > rad) return false;
    if ((yc - x[22] * zc) * x[23] > rad) return false;
    if ((-yc - x[24] * zc) * x[25] > rad) return false;
    return true;
  }
  const OPT0 = { a: 1, fade: 2600, back: .09, md: 0, zfix: undefined, lodpx: 0, px0: 0, nb: false, rtc: undefined, ow: true, hole: null };
  const OO = Object.assign({}, OPT0);
  const opt = o => { for (const k in OPT0) OO[k] = OPT0[k]; if (o) for (const k in o) OO[k] = o[k]; return OO; };
  /* md: 0 plain · 1 shell (thinned where open) · 2 part (lit by the fronts and the slice) · 3 hidden (only where
     open). RT: per-point reach times of this level (or o.rtc for the whole cloud). o.hole: [x, y, z, r] in the
     cloud's own coordinates, points inside skipped (the effect stage's breach). */
  function runPts(pts, i0, i1, spm, x, o, RT) {
    const F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, W = BW, Hh = BH, Dd = BD, invF = 1 / F;
    const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
    const l0 = x[12], l1 = x[13], l2 = x[14], el0 = x[15], el1 = x[16], el2 = x[17];
    const a = o.a, fadeD = o.fade, back = o.back, md = XS.on ? o.md : 0, kf = .55 * a / fadeD, kfar = .45 * a;
    const cr = WH[0], cg = WH[1], cb = WH[2];
    const zs = XS.zs, sl = XS.solid, keepS = .5 + .45 * sl, zfix = o.zfix, bm = o.nb ? 1 : 3, tb = XS.tb, rtc = o.rtc, ow = o.ow;
    const hole = o.hole, hx = hole ? hole[0] : 0, hy = hole ? hole[1] : 0, hz = hole ? hole[2] : 0, hr2 = hole ? hole[3] * hole[3] : -1;
    const OCC = DW.OCC, OWd = DW.OW;
    for (let i = i0, j = i * 6; i < i1; i++, j += 6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      if (hr2 > 0) { const ex = px - hx, ey = py - hy, ez = pz - hz; if (ex * ex + ey * ey + ez * ez < hr2) continue; }
      let k = 0, fl = 0, thin = false;
      if (md) {
        const rt = rtc !== undefined ? rtc : RT[i], age = tb - rt, z = zfix === undefined ? pz : zfix;
        const open = age >= 0 && z > zs;
        if (md >= 3 && !open) continue;
        if (age >= 0 && age < 1.2) fl = Math.exp(-age * 3.6);
        const d = zs - z;
        if (d > -.05 && d < 1.4) k = d < 0 ? 1 + d / .05 : d < .12 ? 1 : Math.exp(-(d - .12) * 3.6) * .75;
        if ((md === 1 || md === 4) && open && k < .3 && fl < .3) { if ((i * .6180339887) % 1 > (md === 4 ? .5 : keepS)) continue; thin = true; }
      }
      const zc = a20 * px + a21 * py + a22 * pz + b2;
      if (zc < near) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b, bk = false, iz;
      if (nx === 0 && ny === 0 && nz === 0) { b = .45; iz = F / zc; }
      else {
        const dn = nx * (px - el0) + ny * (py - el1) + nz * (pz - el2);
        if (dn > 0) { if (bm === 1 || i % 3) continue; b = back; bk = true; iz = F / zc; }
        else {
          iz = F / zc;
          let fac = -dn * iz * invF; if (fac > 1) fac = 1;
          // key light from high on her starboard quarter, a soft fill from the other side, a rim at grazing angles
          const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
          b = .08 + .66 * (lam > 0 ? lam : -.3 * lam) + .16 * fac + .34 * w * w * w; b *= .55 + .45 * b;
        }
      }
      const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz, sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz;
      if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) continue;
      b *= zc < fadeD ? a - kf * zc : kfar;
      let r = cr, g = cg, bl = cb;
      if (thin) { const bt = bk ? .07 : .12 + .36 * b; b = bt + (b * .88 - bt) * sl; }
      if (fl > 0) { if (b < fl * 1.05 * a) b = fl * 1.05 * a; r += (LIME[0] - r) * fl; g += (LIME[1] - g) * fl; bl += (LIME[2] - bl) * fl; }
      if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
      if (b < .02) continue;
      if (b > 1) b = 1;
      if (ow && !thin && !bk) { const ci = ((sy | 0) >> 3) * OWd + ((sx | 0) >> 3); if (zc < OCC[ci]) OCC[ci] = zc; }
      const pxs = spm * iz;
      if (pxs <= 3.6) {
        const qd = ((sy | 0) * W + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
        if (Dd[qd] < R_) Dd[qd] = R_; if (Dd[qd + 1] < G_) Dd[qd + 1] = G_; if (Dd[qd + 2] < B_) Dd[qd + 2] = B_;
      } else dot(sx, sy, pxs > 7.5 ? 3 : 2, r, g, bl, b);
    }
  }
  const LODPX = 4.4, LODPX0 = 18;
  function drawLod(ml, Tw, o, RTL) {
    const oo = opt(o), x = prep(Tw), CH = ml.ch, SD = ml.sd, nl = ml.nl, F = C.fl, near = C.near, ex = x[15], ey = x[16], ez = x[17], PX = oo.lodpx || LODPX, PX0 = oo.px0 || LODPX0;
    const RTs = RTL === undefined ? ml.rt : RTL;
    for (let c = 0; c < ml.nch; c++) {
      const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
      if (!sphereIn(x, mx, my, mz, rad, near)) continue;
      const dx = mx - ex, dy = my - ey, dz = mz - ez, d = Math.max(.1, Math.sqrt(dx * dx + dy * dy + dz * dz) - rad * .7);
      let li = nl - 1; while (li > 1 && ml.sp[li] * F / d > PX) li--;
      if (li === 1 && ml.sp[1] * F / d > PX0) li = 0;
      const i0 = CH[q + 4 + li * 2], i1 = CH[q + 5 + li * 2];
      if (i1 > i0) { runPts(ml.lv[li], i0, i1, ml.sp[li], x, oo, RTs ? RTs[li] : null); if (PROF) { PROF['n' + li] = (PROF['n' + li] || 0) + i1 - i0; if (o && o.tag) PROF['g_' + o.tag] = (PROF['g_' + o.tag] || 0) + i1 - i0; } }
    }
  }
  SHIP.drawLod = drawLod;

  /* ---------- exploded view: each assembly leaves at its w0 and comes home in the reverse order ---------- */
  const EX = SHIP.EX = { O: 94.6, OD: 5.6, B: 113.4, BD: 5.2 };
  function explodeK(w0, T) {
    if (T < EX.O || T > EX.B + EX.BD * 1.6) return 0;
    const o = E.inOut(E.sat(((T - EX.O) / EX.OD - w0 * .8) / .55)), b = E.inOut(E.sat(((T - EX.B) / EX.BD - (.6 - w0) * .8) / .55));
    return o * (1 - b);
  }
  SHIP.explodeK = explodeK;
  SHIP.asmXf = (a, T, SW) => { const k = a.off ? explodeK(a.w0, T) : 0; return k > 0 ? X.mul(SW, X.make(R.I(), V.mul(a.off, k))) : SW; };
  const mdOf = (cls, T, a) => cls === 'shell' ? 1 : cls === 'part' ? 2 : cls === 'uw' ? 4 : (a && a.off && explodeK(a.w0, T) > .3 ? 2 : 3);

  /* ---------- ship state: the radar turning, mounts at rest; the effect stage edits it (PH.fx.shipStateFx) ---------- */
  SHIP.state = (T, S) => ({ sps: PH.loopPh(S, 4.2), gunYaw: 0, gunPitch: 0, ciwsYaw: [0, Math.PI], ciwsPitch: [.35, .35], hatch: LAUNCH.map(L => hatchK(L.m, S)) });
  /* a launch cell's hatch opens a second before the round leaves and closes behind it */
  function hatchK(m, S) { const t = S - m.sL; return E.ss(-1.1, -.5, t) * (1 - E.ss(4.5, 5.6, t)); }

  /* ---------- the ship, drawn ---------- */
  SHIP.draw = function (T, S, SW, st, hole) {
    const xr = XS.on;
    for (const a of SHIP.ASM_LIST) {
      if ((a.cls === 'hidden' || a.cls === 'uw') && !xr) continue;
      const Tw = SHIP.asmXf(a, T, SW), xp = a.off ? explodeK(a.w0, T) : 0;
      const shell = a.cls === 'shell' || a.cls === 'uw', md = mdOf(a.cls, T, a);
      let al = 1;
      if (a.cls === 'hidden') al = 1.2 + .15 * xp;
      if (a.name === 'vlsBF') al = .8;
      if (a.cls === 'uw') al = .9;
      drawLod(a.cl, Tw, { a: al, md, nb: shell && !xr, lodpx: xp > .05 ? 3.3 : shell ? (xr ? 4.4 : 5.4) : 0, px0: xr && shell ? 26 : 0, hole: a.name === 'hangarBlk' || a.name === 'hull' ? hole : null, tag: PROF && a.name });
    }
    const mast = SHIP.asmXf(ASM.mast, T, SW), aft = SHIP.asmXf(ASM.ciwsA, T, SW);
    // the surface-search radar on the mast, turning
    drawLod(SPS_CL, X.mul(mast, piv(R.y(st.sps || 0), PS)), { md: 2, zfix: PS[2], tag: PROF && 'sps' });
    // the gun
    drawLod(GUN_CL, X.mul(SW, partOf('gun').xf(st)), { md: 2, zfix: 48.6, tag: PROF && 'gun' });
    // both Phalanx mounts (the aft one leaves with its assembly)
    for (const c of CIWS) {
      const W = X.mul(c.i ? aft : SW, c.part.xf(st)), k = ciwsPick(st.ciwsPitch ? st.ciwsPitch[c.i] : .35), zf = c.i ? -47.5 : 32.9;
      drawLod(c.base, W, { md: 2, zfix: zf, tag: PROF && 'ciws' });
      drawLod(c.elev[k], W, { md: 2, zfix: zf, tag: PROF && 'ciws' });
    }
    // the launch cells' hatches (the aft one leaves with the launcher)
    for (let n = 0; n < LAUNCH.length; n++) {
      const L = LAUNCH[n], f = st.hatch ? st.hatch[n] : 0, Wv = L.c[2] < 0 ? SHIP.asmXf(ASM.vlsA, T, SW) : SW;
      drawLod(HATCH[L.hs > 0 ? 1 : 0], X.mul(Wv, X.make(R.z(-L.hs * f * 105 * DEG), L.hinge)), { md: 2, rtc: L.rtc, zfix: L.c[2] });
    }
  };

  /* ---------- bounds: thinned xyz copies of what an assembly draws (placards, boxes) ---------- */
  function thin(P, maxN) { const n = P.length / 6, stp = Math.max(1, Math.ceil(n / maxN)), o = []; for (let i = 0; i < n; i += stp) o.push(P[i * 6], P[i * 6 + 1], P[i * 6 + 2]); return new Float32Array(o); }
  SHIP.thin = thin;
  SHIP.boundSet = (ml, maxN) => thin(ml.lv[Math.min(ml.nl - 1, 2)], maxN || 500);
  SHIP.BS = {}; for (const a of Object.values(ASM)) SHIP.BS[a.name] = SHIP.boundSet(a.cl, a.cls === 'shell' ? 900 : 400);
  SHIP.BS.sps = SHIP.boundSet(SPS_CL, 200); SHIP.BS.ciwsA = SHIP.boundSet(CIWS[1].base, 150);
  { const e = CIWS[1].elev[3].lv[2], W = CIWS[1].part.xf(DST), P = thin(e, 250), Q = SHIP.boundSet(CIWS[1].base, 150), o = [];
    for (let j = 0; j < Q.length; j += 3) { const p = X.ap(W, [Q[j], Q[j + 1], Q[j + 2]]); o.push(p[0], p[1], p[2]); }
    for (let j = 0; j < P.length; j += 3) { const p = X.ap(W, [P[j], P[j + 1], P[j + 2]]); o.push(p[0], p[1], p[2]); }
    SHIP.BS.ciwsMount = new Float32Array(o); }
  { const W = piv(R.y(0), PS), P = SHIP.BS.sps, o = []; for (let j = 0; j < P.length; j += 3) o.push(P[j], P[j + 1], P[j + 2]); SHIP.BS.spsRest = new Float32Array(o); }
  /* her whole outline (coarse) for the ship's own box */
  { const arr = []; for (const a of Object.values(ASM)) if (a.cls !== 'hidden') { const P = thin(a.cl.lv[Math.min(a.cl.nl - 1, 3)], 400); for (let j = 0; j < P.length; j++) arr.push(P[j]); } SHIP.BS.whole = new Float32Array(arr); }
  SHIP.pbounds = function (P, Tf, b) {
    const x = prep(Tf), F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let j = 0; j < P.length; j += 3) {
      const px = P[j], py = P[j + 1], pz = P[j + 2], zc = x[6] * px + x[7] * py + x[8] * pz + x[11]; if (zc < near) continue;
      const sx = cx + F * (x[0] * px + x[1] * py + x[2] * pz + x[9]) / zc, sy = cy - F * (x[3] * px + x[4] * py + x[5] * pz + x[10]) / zc;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    if (x0 > x1) return b || null;
    return b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1];
  };
  SHIP.NPTS = NPTS; SHIP.LAUNCH = LAUNCH; SHIP.PS = PS;
  SHIP.LOG.push(`ship ready ${(performance.now() - t0load).toFixed(0)} ms`);
})();
