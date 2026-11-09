/* DAMAGE SCAN (Point Cloud, defence P5) · the world: clocks, the destroyer's frame and seaway motion, the dot sea,
   sky and wake, the raid's four paths, the interceptors' paths, and the shared dot raster (PH.DW).

   Frame: the destroyer's own. Metres; origin midships on the waterline, +Z bow, +X starboard, +Y up. She steams at
   PH.VS along +Z, so everything is drawn in her frame: the sea (and anything left in the air: trails, smoke) flows
   aft past her. PH.VS * S_TOT = PH.PER (the sea lattice's period), so the sea at the end is the sea at the start.

   Clocks (film time T in [0, D)):
     S = PH.S(T)   sim time: real time, slowed around the hit (FILM.warp). Every motion runs on it.
     Periodic motion uses PH.loopPh(S, period) or PH.qw(omega): whole cycles per loop, so the seam is exact.

   Rules for the effect stage (ph_damage_scan_fx.js):
     - pure functions of T: analytic in sim time since an event + a seeded index; no Math.random, no state.
     - something released at sim time s0 at ship-frame point p is carried by the air: p + PH.AIR * (S - s0)
       (PH.AIR = the wind minus the ship's own speed, so smoke streams aft).
     - everything the fight leaves (smoke, fire, debris) is gone by T = PH.T_CLEAN (the calm before the raid). */
(function () {
  'use strict';
  const { V, R, X, E, rng } = M3;
  const PH = window.PH = {};
  const DEG = Math.PI / 180, TAU = Math.PI * 2, D = 165;
  const LIME = [198, 244, 50], WH = [238, 238, 228], CORAL = [255, 106, 61];
  Object.assign(PH, { D, DEG, TAU, LIME, WH, CORAL });
  const ss = E.ss, sat = E.sat, mix = E.mix;

  PH.hsh = function (a, b) {
    let h = Math.imul(a ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(b + 0x7f4a7c15, 0x85EBCA77);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return ((h >>> 0) + .5) / 4294967296;
  };
  const hsh = PH.hsh;
  PH.gH = (i, k) => Math.sqrt(-2 * Math.log(hsh(i, k))) * Math.cos(TAU * hsh(i, k + 1));

  /* ---------- clocks ---------- */
  PH.T_HIT = 70;                                    // TRK 44 reaches the hangar block (film time)
  const SIM = FILM.warp([{ t: 0, rate: 1 }, { t: 68.4, rate: 1 }, { t: 69.4, rate: .14 }, { t: 70.5, rate: .14 }, { t: 72.3, rate: 1 }, { t: D, rate: 1 }]);
  const S_TOT = SIM.total;
  PH.S = SIM; PH.rate = t => SIM.rate(t); PH.S_TOT = S_TOT;
  PH.S_HIT = SIM(PH.T_HIT);
  PH.loopPh = (S, period) => TAU * S / (S_TOT / Math.max(1, Math.round(S_TOT / period)));
  /* an angular frequency nudged to a whole number of cycles per loop */
  PH.qw = w => TAU * Math.max(1, Math.round(w * S_TOT / TAU)) / S_TOT;
  /* film time at which sim time reaches s */
  PH.filmOf = s => { let a = 0, b = D; for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (SIM(m) < s) a = m; else b = m; } return (a + b) / 2; };
  PH.T_CLEAN = 146;                                 // nothing of the fight left on screen after this
  const loopPh = PH.loopPh;

  /* ---------- the ship: speed, air, seaway motion ---------- */
  PH.PER = 1728;
  PH.VS = PH.PER / S_TOT;                           // ~10.6 m/s, 20.5 kn
  PH.WIND = [1.6, 0, -.7];                          // true wind (m/s), from the port bow
  PH.AIR = [PH.WIND[0], 0, PH.WIND[2] - PH.VS];     // the air past her, in her frame
  const HD_ = window.HD && HD.destroyer ? HD.destroyer.A : null;
  PH.hD = HD_ ? HD_.deckY : (z => 6.5);
  const ZB = 77.6, ZST = 70.6;
  /* waterline half-breadth of the HD hull (its own formula), tabled */
  const hW0 = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
  const HWT = new Float32Array(321); for (let i = 0; i <= 320; i++) HWT[i] = hW0(-80 + i * .5);
  PH.hW = z => { const x = (z + 80) * 2; if (x < 0 || x >= 320) return 0; return HWT[x | 0]; };
  /* her seaway motion: roll, pitch, heave (small: she is a big ship at 20 kn in a slight sea) */
  const SX = { S: -1, X: null };
  PH.shipX = function (S) {
    if (S === SX.S) return SX.X;
    const roll = .75 * DEG * Math.sin(loopPh(S, 10.6)), pitch = .22 * DEG * Math.sin(loopPh(S, 6.9) + .6), heave = .14 * Math.sin(loopPh(S, 8.3) + 1.3);
    SX.S = S; SX.X = X.make(R.mul(R.x(pitch), R.z(roll)), [0, heave, 0]);
    return SX.X;
  };

  /* ---------- the raid: four rounds in low from the port bow, relative to her ----------
     Round k at sim time s is d = VR (S_arr_k - s) short of its aim point, on a line of heading PSI in her frame,
     offset in the loose line (lat, easing into single file), at cruise height easing to the aim's. TRK 44 weaves
     (terminal S-turns) between 7 and 1.5 km: it goes round the ESSM aimed at its line. */
  PH.VR = 680;
  const PSI = 112 * DEG;
  const U = [Math.sin(PSI), 0, Math.cos(PSI)], RG = [Math.cos(PSI), 0, -Math.sin(PSI)];
  Object.assign(PH, { PSI, U, RG, THREAT_BRG: 292 });
  PH.HIT_L = [-8.45, 9.8, -41.2];                   // port face of the hangar block, below the Mk 99 platform
  PH.HIT_W = X.ap(PH.shipX(PH.S_HIT), PH.HIT_L);    // where that point is at the instant of the hit
  PH.RND = [
    { id: 'TRK 41', dt: -.8, lat: -130, aim: [-3, 9, 14], stopD: 16000, fate: 'sm6', by: 0 },
    { id: 'TRK 42', dt: -.45, lat: 105, aim: [-3, 9, -6], stopD: 10500, fate: 'sm6', by: 1 },
    { id: 'TRK 43', dt: -1.35, lat: -45, aim: [-6, 8.5, -24], stopD: 520, fate: 'ciws' },
    { id: 'TRK 44', dt: 0, lat: 50, aim: PH.HIT_W, stopD: 0, fate: 'hit' },
  ];
  PH.RND.forEach(r => { r.sArr = PH.S_HIT + r.dt; r.sStop = r.sArr - r.stopD / PH.VR; });
  PH.tauStop = k => PH.RND[k].sStop;
  const altOf = d => 11.5 + 7 * ss(2500, 16000, d);
  const weave = d => 34 * Math.sin(d / 430 + .88) * ss(1500, 2800, d) * ss(7200, 5000, d);
  /* ship-frame position of round k at sim time s (no stop applied); w: include the weave */
  function relPos(k, s, out, w) {
    const r = PH.RND[k], d = PH.VR * (r.sArr - s), A = r.aim;
    let lat = r.lat * ss(900, 7000, d);
    if (k === 3 && w !== false) lat += weave(d);
    out[0] = A[0] - U[0] * d + RG[0] * lat; out[1] = mix(A[1], altOf(d), ss(0, 450, d)) + (k === 3 && w !== false ? 3 * Math.sin(d / 610) * ss(1500, 2800, d) * ss(7200, 5000, d) : 0); out[2] = A[2] - U[2] * d + RG[2] * lat;
    return d;
  }
  PH.relPos = relPos;
  PH.fate = (k, s) => { const r = PH.RND[k]; return k === 3 ? (s < r.sArr ? 1 : 0) : 1 - sat((s - r.sStop) / .25); };
  PH.visA = d => ss(34000, 30500, d);               // over the horizon as seen from her decks
  const RA = [0, 0, 0], RB = [0, 0, 0];
  /* round k at sim time s: {p, dir, d, a, stopped} (held where it is stopped) */
  PH.round = function (k, s, o) {
    o = o || {};
    const r = PH.RND[k], tt = Math.min(s, k === 3 ? r.sArr : r.sStop);
    const d = relPos(k, tt, RA); relPos(k, tt - .01, RB);
    o.p = RA.slice(); o.dir = V.norm(V.sub(RA, RB)); o.d = d; o.stopped = s >= (k === 3 ? r.sArr : r.sStop);
    o.a = PH.fate(k, s) * PH.visA(d);
    return o;
  };
  PH.filmStop = PH.RND.map(r => PH.filmOf(r.fate === 'hit' ? r.sArr : r.sStop));

  /* ---------- interceptors: vertical launch, pitch-over, a loft, a dive onto the round (keyed curves) ----------
     SM-6 1 and 2 from the forward launcher on TRK 41 and 42; the ESSM from the aft launcher on TRK 44's line,
     which the weave takes it round. Paths are in her frame at launch; what they leave in the air drifts with it. */
  const DDA = HD_;
  PH.ICP = [
    { id: 'SM-6', n: 1, cell: 13, sL: 27.4, k: 0, h1: 620, u1: 110, apex: 3000, bend: -280, dive: 13, tb: 3.2 },
    { id: 'SM-6', n: 2, cell: 21, sL: 41.2, k: 1, h1: 620, u1: 110, apex: 1900, bend: 230, dive: 11, tb: 3.2 },
    { id: 'ESSM', n: 3, cell: 61, sL: 0, k: 3, miss: 3000, fly: 6.8, over: 1.3, h1: 240, u1: 45, apex: 430, bend: -110, dive: 4, tb: 2.2 },
  ];
  function buildIC(m) {
    let Ip, tI;
    if (m.miss) {
      const r = PH.RND[m.k]; tI = r.sArr - m.miss / PH.VR; m.sL = tI - m.fly;
      Ip = [0, 0, 0]; relPos(m.k, tI, Ip, false); Ip[1] += 2;
    } else { tI = PH.RND[m.k].sStop; Ip = PH.round(m.k, tI).p; }
    const P0 = DDA ? X.ap(PH.shipX(m.sL), DDA.vls(m.cell)) : [0, 8, m.cell < 32 ? 39 : -29];
    const hx = Ip[0] - P0[0], hz = Ip[2] - P0[2], Lh = Math.hypot(hx, hz), hd = [hx / Lh, 0, hz / Lh], sd = [hd[2], 0, -hd[0]];
    const at = (u, s, y) => [P0[0] + hd[0] * u + sd[0] * s, y, P0[2] + hd[2] * u + sd[2] * s];
    const dir = (c, y) => V.norm([hd[0] * c, y, hd[2] * c]);
    const ga = m.dive * DEG, Dd = Math.min(1700, Lh * .28);
    const K = [
      [P0, [0, 1, 0]],
      [at(m.u1, 0, P0[1] + m.h1), dir(.36, 1)],
      [at(Math.min(2400, Lh * .2), m.bend * .3, m.apex * .72), dir(1, .45)],
      [at(Lh * .45, m.bend, m.apex), dir(1, 0)],
      [at(Lh - Dd, m.bend * .25, Ip[1] + Dd * Math.tan(ga)), dir(Math.cos(ga), -Math.sin(ga))],
      [Ip, dir(Math.cos(ga), -Math.sin(ga))],
    ];
    if (m.over) {
      // it runs on past the miss for a moment, still diving a little, before it gives up
      const dE = dir(Math.cos(ga), -Math.sin(ga)), L0 = Lh * 1.02;
      K.push([V.mad(Ip, dE, L0 / m.fly * m.over), dE]);
    }
    const pts = [P0.slice()];
    let iMiss = 0;
    for (let s = 0; s < K.length - 1; s++) {
      const a = K[s][0], b = K[s + 1][0], ch = V.dist(a, b), m0 = V.mul(K[s][1], ch), m1 = V.mul(K[s + 1][1], ch), n = Math.max(24, Math.ceil(ch / 8));
      for (let i = 1; i <= n; i++) {
        const u = i / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        pts.push([0, 1, 2].map(c => a[c] * h00 + m0[c] * h10 + b[c] * h01 + m1[c] * h11));
      }
      if (s === 4) iMiss = pts.length - 1;
    }
    const N = pts.length, P = new Float64Array(N * 3), A = new Float64Array(N);
    for (let i = 0; i < N; i++) { P[i * 3] = pts[i][0]; P[i * 3 + 1] = pts[i][1]; P[i * 3 + 2] = pts[i][2]; if (i) A[i] = A[i - 1] + V.dist(pts[i], pts[i - 1]); }
    // speed: a linear ramp through the boost (tb), then flat; scaled so the head is at Ip on time
    const Lm = m.over ? A[iMiss] : A[N - 1], Tf = tI - m.sL, vmax = Lm / (Tf - m.tb / 2);
    Object.assign(m, { tI, Ip, P0, P, A, N, L: A[N - 1], Lm, Tf, vmax, a0: vmax * m.tb / 2, tEnd: m.over ? Tf + (A[N - 1] - Lm) / vmax : Tf });
    m.tIf = PH.filmOf(m.sL + m.Tf); m.tLf = PH.filmOf(m.sL); m.tEf = PH.filmOf(m.sL + m.tEnd);
  }
  PH.ICP.forEach(buildIC);
  /* arc length flown t s after launch */
  PH.icArc = (m, t) => { t = E.clamp(t, 0, m.tEnd); return t < m.tb ? m.vmax * t * t / (2 * m.tb) : m.vmax * (t - m.tb / 2); };
  /* launch-relative time at which the head passed arc a */
  PH.icBorn = (m, a) => a < m.a0 ? Math.sqrt(2 * m.tb * a / m.vmax) : a / m.vmax + m.tb / 2;
  PH.icPos = function (m, a, out) {
    const A = m.A, P = m.P; a = E.clamp(a, 0, m.L); out = out || [0, 0, 0];
    let lo = 0, hi = m.N - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (A[md] <= a) lo = md; else hi = md; }
    const u = (a - A[lo]) / (A[hi] - A[lo] || 1), l3 = lo * 3, h3 = hi * 3;
    out[0] = P[l3] + (P[h3] - P[l3]) * u; out[1] = P[l3 + 1] + (P[h3 + 1] - P[l3 + 1]) * u; out[2] = P[l3 + 2] + (P[h3 + 2] - P[l3 + 2]) * u;
    return out;
  };
  /* the head at sim time S: {p, dir, t (s since launch), live} or null before launch */
  const HP = [0, 0, 0], HQ = [0, 0, 0];
  PH.icHead = function (m, S) {
    const t = S - m.sL; if (t < 0) return null;
    const a = PH.icArc(m, t); PH.icPos(m, a, HP); PH.icPos(m, Math.max(0, a - 4), HQ);
    return { p: HP.slice(), dir: V.norm(V.sub(HP, HQ)), t, live: t <= m.tEnd, arc: a };
  };

  /* ---------- the dot raster (max blend into the current PointBuf) + occlusion ---------- */
  const DW = PH.DW = {};
  let E0 = 0, E1 = 0, E2 = 0, F0 = 0, F1 = 0, F2 = 1, R0 = 1, R1 = 0, R2 = 0, U0 = 0, U1 = 1, U2 = 0, FL = 1000, CX = 960, CY = 540, NEAR = .3;
  let PU = null, PW = 1920, PHh = 1080, BUF = null;
  const q = DW.q = { x: 0, y: 0, z: 0 };
  const U32 = new Map();
  const u32of = b => { let u = U32.get(b); if (!u) { u = new Uint32Array(b.img.data.buffer); U32.set(b, u); } return u; };
  DW.sync = function (c, buf) {
    PU = u32of(buf); PW = buf.W; PHh = buf.H; BUF = buf; DW.cam = c; DW.buf = buf;
    E0 = c.eye[0]; E1 = c.eye[1]; E2 = c.eye[2]; F0 = c.f[0]; F1 = c.f[1]; F2 = c.f[2];
    R0 = c.r[0]; R1 = c.r[1]; R2 = c.r[2]; U0 = c.u[0]; U1 = c.u[1]; U2 = c.u[2];
    FL = c.fl; CX = c.cx + c.shake[0]; CY = c.cy + c.shake[1]; NEAR = c.near;
  };
  function put(x, y, s, r, g, b, a) {
    const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PHh) return;
    const Rr = (r * a) | 0, G = (g * a) | 0, B = (b * a) | 0;
    for (let j = 0; j < s; j++) {
      let i = (y0 + j) * PW + x0;
      for (let k = 0; k < s; k++, i++) {
        const p = PU[i], pr = p & 255, pg = (p >>> 8) & 255, pb_ = (p >>> 16) & 255;
        if (Rr > pr || G > pg || B > pb_) PU[i] = 0xff000000 | ((B > pb_ ? B : pb_) << 16) | ((G > pg ? G : pg) << 8) | (Rr > pr ? Rr : pr);
      }
    }
  }
  function P3(x, y, z) {
    const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
    if (zc < NEAR) return false;
    q.x = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc; q.y = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc; q.z = zc;
    return q.x > -40 && q.y > -40 && q.x < PW + 40 && q.y < PHh + 40;
  }
  function dset(x, y, s, c, a) {
    const d = BUF.d; const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
    if (x0 < 0 || y0 < 0 || x0 + s > PW || y0 + s > PHh) return;
    for (let j = 0; j < s; j++) { let i = ((y0 + j) * PW + x0) * 4; for (let k = 0; k < s; k++, i += 4) { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; } }
  }
  /* soft additive disc, (1 - d²/R²)² falloff */
  function glow(x, y, Rr, r, g, b, a) {
    if (a <= .002) return;
    const d = BUF.d, W = PW, x0 = Math.max(0, Math.floor(x - Rr)), x1 = Math.min(W - 1, Math.ceil(x + Rr)), y0 = Math.max(0, Math.floor(y - Rr)), y1 = Math.min(PHh - 1, Math.ceil(y + Rr)), iR2 = 1 / (Rr * Rr);
    for (let j = y0; j <= y1; j++) { const dy = j - y; for (let i = x0; i <= x1; i++) { const dx = i - x, u = 1 - (dx * dx + dy * dy) * iR2; if (u <= 0) continue; const w = u * u * a, k = (j * W + i) * 4; d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w; } }
  }
  function dline3(a, b, step, s, c, al) {
    const n = Math.max(1, Math.ceil(V.dist(a, b) / step));
    for (let k = 0; k <= n; k++) { const t = k / n; if (P3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) put(q.x, q.y, s, c[0], c[1], c[2], al); }
  }
  /* occlusion: the ship writes the depth of her dots into an 8 px grid (closed over its gaps); the sea, sky and
     wake behind her are dimmed where she stands in front of them */
  const OW = 240, OH = 135, OCC = new Float32Array(OW * OH), OCC1 = new Float32Array(OW * OH), OCCF = new Float32Array(OW * OH);
  const OCM = new Uint8Array(OW * OH), OCM2 = new Uint8Array(OW * OH);
  DW.OCC = OCC; DW.OCCF = OCCF; DW.OW = OW; DW.OCC_DIM = .16;
  DW.occClear = () => OCC.fill(1e9);
  DW.occClose = function () {
    for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) { let m = OCC[r + x]; if (x > 0 && OCC[r + x - 1] < m) m = OCC[r + x - 1]; if (x < OW - 1 && OCC[r + x + 1] < m) m = OCC[r + x + 1]; OCCF[r + x] = m; } }
    for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) { let m = OCCF[r + x]; if (y > 0 && OCCF[r - OW + x] < m) m = OCCF[r - OW + x]; if (y < OH - 1 && OCCF[r + OW + x] < m) m = OCCF[r + OW + x]; OCC1[r + x] = m; OCM[r + x] = m < 1e8 ? 1 : 0; } }
    for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) OCM2[r + x] = OCM[r + x] & (x > 0 ? OCM[r + x - 1] : 1) & (x < OW - 1 ? OCM[r + x + 1] : 1); }
    for (let y = 0; y < OH; y++) { const r = y * OW; for (let x = 0; x < OW; x++) OCCF[r + x] = OCM2[r + x] & (y > 0 ? OCM2[r - OW + x] : 1) & (y < OH - 1 ? OCM2[r + OW + x] : 1) ? OCC1[r + x] : 1e9; }
  };
  const occAt = (sx, sy) => OCCF[((sy | 0) >> 3) * OW + ((sx | 0) >> 3)];
  DW.occAt = occAt;
  Object.assign(DW, { put, P3, dset, glow, dline3, add: (x, y, s, r, g, b, a) => BUF.add(x, y, s, r, g, b, a) });

  /* ---------- sky: dots at infinity, a dusk band low over the port bow (the raid's quarter) ---------- */
  const SKYV = (() => {
    const r = rng(303), a = [];
    for (let i = 0; i < 24000; i++) {
      const az = r() * TAU, above = r() < .84, el = above ? Math.pow(r(), 2.4) * 22 * DEG : -Math.pow(r(), 1.6) * 1.2 * DEG;
      const dusk = Math.pow(Math.max(0, Math.cos(az - 296 * DEG)), 3);
      const b = (above ? .15 + .6 * Math.exp(-el / (3.4 * DEG)) : .7 * Math.exp(el / (.45 * DEG))) * (.32 + .68 * dusk) * (.75 + .25 * r());
      a.push(Math.sin(az), Math.cos(az), Math.sin(el), Math.cos(el), b);
    }
    // a few stars high up
    for (let i = 0; i < 1400; i++) { const az = r() * TAU, el = (12 + 70 * Math.pow(r(), .8)) * DEG; a.push(Math.sin(az), Math.cos(az), Math.sin(el), Math.cos(el), .1 + .5 * Math.pow(r(), 3)); }
    return new Float32Array(a);
  })();
  const SKYC = [206, 216, 196];
  DW.drawSky = function (k) {
    const dip = Math.sqrt(2 * Math.max(1, E1) / 6.371e6), odim = DW.OCC_DIM;
    for (let i = 0, n = SKYV.length; i < n; i += 5) {
      const se = SKYV[i + 2] - dip * SKYV[i + 3], ce = SKYV[i + 3] + dip * SKYV[i + 2];
      const dx = SKYV[i] * ce, dy = se, dz = SKYV[i + 1] * ce, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < .05) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PHh) continue;
      let b = SKYV[i + 4] * 1.1 * k; if (occAt(sx, sy) < 1e8) b *= odim;
      put(sx, sy, 1, SKYC[0], SKYC[1], SKYC[2], b > 1 ? 1 : b);
    }
  };

  /* ---------- sea: jittered lattices flowing aft past her ----------
     Node (i, j) of a band sits at x = i st + jit, z = j st + jit - flow, flow = (VS S) mod PER; the jitter repeats
     every PER / st rows and the swell's wavelengths divide PER, so wrapping the flow changes nothing on screen. */
  const PER = PH.PER;
  const BANDS = [
    { st: 2.4, r0: 0, r1: 230, big: 400 },
    { st: 8, r0: 180, r1: 700, big: 400 },
    { st: 24, r0: 560, r1: 2600, big: 0 },
    { st: 72, r0: 2200, r1: 8200, big: 0 },
    { st: 216, r0: 7200, r1: 24000, big: 0 },
  ];
  BANDS.forEach((b, i) => {
    b.P = Math.round(PER / b.st); b.fin = i ? BANDS[i - 1].r1 : 0; b.fout = i < BANDS.length - 1 ? BANDS[i + 1].r0 : b.r1 - 4000;
    const n = 64 * b.P; b.JL = new Float32Array(n); b.JW = new Float32Array(n); b.CP = new Float32Array(n);
    for (let jm = 0; jm < b.P; jm++) for (let im = 0; im < 64; im++) { const k = jm * 64 + im, h1 = hsh(im * 7 + 3 + i * 101, jm * 13 + 5), h2 = hsh(im * 11 + 1, jm * 3 + 9 + i * 57); b.JL[k] = (h1 - .5) * .7 * b.st; b.JW[k] = (h2 - .5) * .7 * b.st; b.CP[k] = hsh(im + 900 * i, jm + 77); }
  });
  const W1 = PH.qw(1.1), W2 = PH.qw(1.7), W3 = PH.qw(2.9), FLK = Math.round(.37 * S_TOT) / S_TOT;
  PH.swell = (l, w, s) => .85 * Math.sin(TAU * (w / 144 + l / 432) + W1 * s) + .45 * Math.sin(TAU * (w / 96 - l / 216) - W2 * s) + .25 * Math.sin(TAU * (w / 48 + l / 72) + W3 * s);
  PH.flow = S => (PH.VS * S) % PER;
  DW.seaN = new Int32Array(BANDS.length);
  DW.drawSea = function (T, k) {
    const Sn = SIM(T), odim = DW.OCC_DIM;
    const le = E0, we = E2, hgt = Math.max(2, E1);
    const kmin = -60 - CX, kmax = PW + 60 - CX, kb = PHh + 40 - CY, kt = CY + 40;
    let lo = 0, hi = 0;
    const lin = (c0, c1) => { if (c1 > -1e-12 && c1 < 1e-12) { if (c0 < 0) { lo = 1; hi = 0; } return; } const r = -c0 / c1; if (c1 > 0) { if (r > lo) lo = r; } else if (r < hi) hi = r; };
    let flk = Sn * FLK; flk -= Math.floor(flk);
    const flow = PH.flow(Sn);
    DW.seaN.fill(0);
    for (let bi = 0; bi < BANDS.length; bi++) {
      const B = BANDS[bi], st = B.st, P = B.P, JL = B.JL, JW = B.JW, CPh = B.CP, wav = bi < 3, near = bi < 2;
      if (B.r1 < hgt * .6) continue;
      const r1 = B.r1, rr0 = B.r0, fadeIn = B.fin, rr1 = B.fout, r1q = r1 * r1, r0q = rr0 * rr0, fiq = fadeIn * fadeIn, foq = rr1 * rr1;
      const j0 = Math.floor((we + flow - r1) / st), j1 = Math.ceil((we + flow + r1) / st);
      const xb = R0, yb = U0, zb = F0;
      const d1 = TAU * st / 432, d2 = -TAU * st / 216, d3 = TAU * st / 72;
      const c1 = Math.cos(d1), n1 = Math.sin(d1), c2 = Math.cos(d2), n2 = Math.sin(d2), c3 = Math.cos(d3), n3 = Math.sin(d3);
      for (let j = j0; j <= j1; j++) {
        const jm = ((j % P) + P) % P, wz0 = j * st - flow, row = jm * 64;
        const bx = -E0, by = -E1, bz = wz0 - E2;
        const xa = bx * R0 + by * R1 + bz * R2, ya = bx * U0 + by * U1 + bz * U2, za = bx * F0 + by * F1 + bz * F2;
        lo = le - r1; hi = le + r1;
        lin(za - 1, zb); lin(FL * xa - kmin * za, FL * xb - kmin * zb); lin(kmax * za - FL * xa, kmax * zb - FL * xb);
        lin(FL * ya + kb * za, FL * yb + kb * zb); lin(kt * za - FL * ya, kt * zb - FL * yb);
        if (lo > hi) continue;
        const i0 = Math.floor(lo / st) - 1, i1 = Math.ceil(hi / st) + 1;
        DW.seaN[bi] += i1 - i0 + 1;
        // her footprint: the water inside the waterline is not sea
        const inHull = near && wz0 > -80 && wz0 < 79, hwr = inHull ? PH.hW(wz0) + 1.2 : 0;
        let s1 = 0, k1 = 0, s2 = 0, k2 = 0, s3 = 0, k3 = 0;
        if (wav) {
          const qz = j * st, ql = i0 * st;
          let a = TAU * (qz / 144 + ql / 432) + W1 * Sn; s1 = Math.sin(a); k1 = Math.cos(a);
          a = TAU * (qz / 96 - ql / 216) - W2 * Sn; s2 = Math.sin(a); k2 = Math.cos(a);
          a = TAU * (qz / 48 + ql / 72) + W3 * Sn; s3 = Math.sin(a); k3 = Math.cos(a);
        }
        for (let i = i0; i <= i1; i++) {
          let y = 0;
          if (wav) {
            y = .85 * s1 + .45 * s2 + .25 * s3;
            let t = s1 * c1 + k1 * n1; k1 = k1 * c1 - s1 * n1; s1 = t;
            t = s2 * c2 + k2 * n2; k2 = k2 * c2 - s2 * n2; s2 = t;
            t = s3 * c3 + k3 * n3; k3 = k3 * c3 - s3 * n3; s3 = t;
          }
          const nq = row + (i & 63);
          const x = i * st + JL[nq], z = wz0 + JW[nq];
          if (inHull && x < hwr && x > -hwr) continue;
          const dl = x - le, dw = z - we, dq = dl * dl + dw * dw;
          if (dq < r0q || dq > r1q) continue;
          const dx = x - E0, dz = z - E2;
          const dy = y - E1, zc = dx * F0 + dy * F1 + dz * F2;
          if (zc < 1) continue;
          const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
          if (sx < 0 || sy < 0 || sx >= PW || sy >= PHh) continue;
          let fa = 1;
          if (dq < fiq && rr0 > 0) fa = (Math.sqrt(dq) - rr0) / (fadeIn - rr0);
          if (dq > foq) fa *= (r1 - Math.sqrt(dq)) / (r1 - rr1);
          let crest = CPh[nq] + flk; crest -= Math.floor(crest); crest = crest < .5 ? crest * 2 : 2 - crest * 2;
          const sw = (y + 1.55) / 3.1;
          let b = k * fa * (.3 + .44 * sw * sw + .16 * crest) * (zc < 20000 ? 1 - zc / 30000 : .33) * .96;
          if (b < .01) continue;
          if (near && zc > occAt(sx, sy) + 3) b *= odim;
          put(sx, sy, zc < B.big ? 2 : 1, WH[0], WH[1], WH[2], b > 1 ? 1 : b);
        }
      }
    }
  };

  /* ---------- wake: white water off her stern and the Kelvin arms off her bow, in the water's own frame ---------- */
  const KEL = Math.tan(19.47 * DEG), ZS = -77.6, WROWS = PER / 2;
  DW.drawWake = function (T, a) {
    if (a <= .01) return;
    const Sn = SIM(T), flow = PH.flow(Sn), odim = DW.OCC_DIM;
    // turbulent wake: rows 2 m apart in the water, widening and thinning aft of the transom
    const jA = Math.floor((ZS + flow) / 2), jB = Math.floor((ZS - 1100 + flow) / 2);
    for (let j = jA; j > jB; j--) {
      const z = j * 2 - flow; if (z > ZS) continue;
      const dA = ZS - z, jm = ((j % WROWS) + WROWS) % WROWS, hw = 7.5 + .045 * dA + 3 * Math.sqrt(dA / 40);
      const fo = a * Math.exp(-dA / 380) * (dA < 8 ? dA / 8 : 1), n = Math.round(4 + hw * .9 * Math.exp(-dA / 900));
      if (fo < .015) continue;
      for (let m = 0; m < n; m++) {
        const h1 = hsh(jm * 17 + m, 311), h2 = hsh(jm + 5, m * 29 + 7), lat = (h1 * 2 - 1) * hw * (.35 + .65 * Math.sqrt(h2));
        if (!P3(lat, .25, z + (h2 - .5) * 1.8)) continue;
        let b = fo * (.45 + .55 * hsh(jm * 3 + m, 97)) * (1 - .45 * Math.abs(lat) / hw);
        if (q.z > occAt(q.x, q.y) + 3) b *= odim;
        put(q.x, q.y, q.z < 160 ? 2 : 1, 242, 244, 238, b > 1 ? 1 : b);
      }
    }
    // Kelvin arms: a V off the bow at 19.5° either side of her track, crests walking with the water
    for (let j = 0; j < 460; j++) {
      const dz = j * 2.4, z = 72 - dz, lat = 4.6 + dz * KEL; if (lat > 700) break;
      const wz = Math.floor((z + flow) / 2.4 + 1e-6), fo = a * .55 * Math.exp(-dz / 520) * (dz < 20 ? .5 + dz / 40 : 1);
      for (const sd of [-1, 1]) for (let m = 0; m < 3; m++) {
        const h = hsh(((wz % 720) + 720) * 7 + m + (sd > 0 ? 3 : 0), 41), l2 = lat - m * 1.6 - h * 2;
        if (l2 < PH.hW(z) + .5 && z > ZS) continue;
        if (!P3(sd * l2, .3 + .25 * (1 - m * .4), z - m * 1.1)) continue;
        let b = fo * (1 - m * .28) * (.55 + .45 * h);
        if (q.z > occAt(q.x, q.y) + 3) b *= odim;
        put(q.x, q.y, q.z < 160 ? 2 : 1, 240, 242, 236, b);
      }
    }
    // the bow wave along her sides
    const bw = PH.qw(3);
    for (let k = 0; k < 140; k++) {
      const sd = k & 1 ? 1 : -1, zz = 74 - (k >> 1) * 1.9, b0 = PH.hW(zz) + .3 + (74 - zz) * .012;
      if (!P3(sd * b0, .4 + .35 * Math.sin(k * 1.7 + bw * Sn), zz)) continue;
      put(q.x, q.y, q.z < 160 ? 2 : 1, WH[0], WH[1], WH[2], a * .6 * (1 - (74 - zz) / 150));
    }
  };

  /* ---------- rounds: dot-sampled HD.oniks, coral at the silhouette, ramjet plume ---------- */
  const has = k => !!(window.HD && typeof HD[k] === 'function');
  const OM = has('oniks') ? HD.oniks() : GEO.oniks();
  const RSKIP = { booster: 1, cover: 1 };
  const RND_LV = [.035, .1, .26].map((sp, k) => ({ sp, parts: GEO.sample(OM, sp, 60 + k, { wing: 1, fin: 1, booster: false, cover: false }).filter(s => s.pts.length && !RSKIP[s.name]) }));
  DW.RND_LV = RND_LV;
  const NOZ = (window.HD && HD.oniks && HD.oniks.NOZZLE) || [0, 0, -4.5];
  const LM = V.norm([.5, .72, -.48]);
  DW.LM = LM;
  DW.roundX = RO => X.make(R.look(RO.dir, [0, 1, 0]), RO.p);
  const CR0 = CORAL[0] - WH[0], CG0 = CORAL[1] - WH[1], CB0 = CORAL[2] - WH[2];
  function drawRoundPts(pts, Tm, a, big) {
    const M = Tm.R, t = Tm.T, L0 = LM[0], L1 = LM[1], L2 = LM[2];
    for (let j = 0, n = pts.length; j < n; j += 6) {
      const px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const x = M[0] * px + M[1] * py + M[2] * pz + t[0], y = M[3] * px + M[4] * py + M[5] * pz + t[1], z = M[6] * px + M[7] * py + M[8] * pz + t[2];
      const dx = x - E0, dy = y - E1, dz = z - E2, zc = dx * F0 + dy * F1 + dz * F2;
      if (zc < NEAR) continue;
      const sx = CX + FL * (dx * R0 + dy * R1 + dz * R2) / zc, sy = CY - FL * (dx * U0 + dy * U1 + dz * U2) / zc;
      if (sx < 0 || sy < 0 || sx >= PW || sy >= PHh) continue;
      const nx = pts[j + 3], ny = pts[j + 4], nz = pts[j + 5];
      let b = .5, rim = .6;
      if (nx || ny || nz) {
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz), fac = -(wx * dx + wy * dy + wz * dz) * il;
        if (fac < -.15) continue;
        const lit = Math.max(0, wx * L0 + wy * L1 + wz * L2);
        b = .22 + .72 * lit;
        rim = fac < .3 ? 1 - Math.max(0, fac) / .3 : 0;
      }
      rim *= .8;
      b = Math.max(b, rim * .95) * a;
      put(sx, sy, zc < big ? 2 : 1, WH[0] + CR0 * rim, WH[1] + CG0 * rim, WH[2] + CB0 * rim, b > 1 ? 1 : b);
    }
  }
  DW.drawRound = function (k, T, RO, a) {
    if (a <= .01) return null;
    const Xf = DW.roundX(RO), c = RO.p;
    const dist = Math.max(.5, Math.hypot(c[0] - E0, c[1] - E1, c[2] - E2) - 4.5);
    let L = RND_LV[RND_LV.length - 1];
    for (let j = RND_LV.length - 1; j >= 0; j--) { L = RND_LV[j]; if (RND_LV[j].sp * FL / dist < 2.2) break; }
    if (8.9 * FL / dist < 3) {
      if (P3(c[0], c[1], c[2])) { put(q.x, q.y, 2, CORAL[0], CORAL[1], CORAL[2], a); put(q.x, q.y, 1, 255, 244, 232, a); }
    } else for (const s of L.parts) drawRoundPts(s.pts, s.part.xf ? X.mul(Xf, s.part.xf({ wing: 1, fin: 1 })) : Xf, a, L.sp * FL / 2.6);
    drawPlume(k, T, Xf, a, dist);
    return Xf;
  };
  function drawPlume(k, T, Xf, a, dist) {
    const Sn = SIM(T), fr = Math.floor(Sn * 90), M = Xf.R, n0 = X.ap(Xf, NOZ), ax = [-M[2], -M[5], -M[8]];
    const ux = [M[0], M[3], M[6]], uy = [M[1], M[4], M[7]];
    const px = FL / Math.max(1, dist);
    if (px * 8 < 2) { if (P3(n0[0], n0[1], n0[2])) put(q.x, q.y, 2, 255, 250, 225, a); return; }
    const N = Math.min(700, Math.round(90 + px * 90));
    for (let i = 0; i < N; i++) {
      const u = hsh(i + k * 977, fr), v = hsh(i + 131, fr + k * 3), w = hsh(i + 71, 5 + k);
      const s = 16 * Math.pow(u, 1.8), rad = (.1 + .03 * s) * Math.sqrt(v) * (s < .3 ? 1.6 : 1), th = TAU * w + fr * .7;
      const cx = Math.cos(th) * rad, cy = Math.sin(th) * rad;
      if (!P3(n0[0] + ax[0] * s + ux[0] * cx + uy[0] * cy, n0[1] + ax[1] * s + ux[1] * cx + uy[1] * cy, n0[2] + ax[2] * s + ux[2] * cx + uy[2] * cy)) continue;
      const dia = s < 5 ? Math.pow(.5 + .5 * Math.cos(TAU * s / .75), 6) * (1 - s / 5) : 0;
      const hot = Math.exp(-s / 1.6), b = a * Math.min(1, .3 + 1.1 * hot + 1.1 * dia) * (1 - s / 16.5);
      put(q.x, q.y, q.z < 80 ? 2 : 1, 255, 236 + 19 * hot, 200 + 50 * hot, b);
    }
    if (P3(n0[0], n0[1], n0[2])) { glow(q.x, q.y, Math.min(46, 4 + px * 1.3), 255, 238, 210, .4 * a); glow(q.x, q.y, Math.min(14, 2 + px * .35), 255, 255, 245, .7 * a); }
  }
  /* the air the round has flown through: a faint coral dotted trail, fading over a few hundred metres */
  const RT0 = {};
  DW.drawTrail = function (k, T, a) {
    if (a <= .01) return;
    const S = SIM(T), r = PH.RND[k], t1 = Math.min(S, k === 3 ? r.sArr : r.sStop);
    for (let j = 1; j <= 90; j++) {
      const tp = t1 - j * .012; PH.round(k, tp, RT0);
      if (!P3(RT0.p[0], RT0.p[1], RT0.p[2])) continue;
      const age = S - tp, al = a * .55 * Math.exp(-age / .5) * (1 - j / 91);
      if (al < .02) break;
      put(q.x, q.y, q.z < 250 ? 2 : 1, CORAL[0], CORAL[1] + 30, CORAL[2] + 30, al);
    }
  };

  /* ---------- interceptors, stage A: the path flown so far as a plain lime line, the head a point ----------
     Each point of the line is laid where the head passed and then carried by the air (PH.AIR), so the line bends aft
     the way the smoke will; it fades after the intercept. */
  const IH = [0, 0, 0];
  DW.drawIcLine = function (m, T, k) {
    const S = SIM(T), t = S - m.sL; if (t < 0 || k <= .01) return;
    const aH = PH.icArc(m, t), after = Math.max(0, t - m.tEnd), fadeA = 1 - ss(0, 7, after);
    if (fadeA <= .01) return;
    const AIR = PH.AIR;
    // spacing grows with range from the lens so a 16 km line stays a line, not a smear
    let a = 0;
    while (a < aH) {
      const born = PH.icBorn(m, a), age = t - born;
      PH.icPos(m, a, IH);
      const x = IH[0] + AIR[0] * age, y = IH[1] + .25 * age, z = IH[2] + AIR[2] * age;
      const dx = x - E0, dy = y - E1, dz = z - E2, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      a += Math.max(1.2, dist * .0045);
      if (!P3(x, y, z)) continue;
      const al = k * fadeA * (.35 + .5 * Math.exp(-age / 3)) * (1 - ss(18, 40, age));
      if (al < .02) continue;
      put(q.x, q.y, q.z < 600 ? 2 : 1, LIME[0], LIME[1], LIME[2], al);
    }
    if (t <= m.tEnd) {
      PH.icPos(m, aH, IH);
      if (P3(IH[0], IH[1], IH[2])) { put(q.x, q.y, q.z < 2500 ? 3 : 2, 236, 255, 200, k); glow(q.x, q.y, Math.min(24, 3 + 3000 / q.z), LIME[0], LIME[1], LIME[2], .35 * k); }
    }
  };
})();
