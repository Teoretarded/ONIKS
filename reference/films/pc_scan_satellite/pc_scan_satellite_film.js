/* SCAN · SATELLITE (Point Cloud): the carrier's scan. A Nimitz-class carrier 5 km off a coastal battery. Its island
   radar (AN/SPS-48E) wakes, spins up, sweeps, stops on the bearing of a dormant satellite 420 km up and sends three
   pulses; the camera rides the third one up to orbit.
   The satellite wakes (status lights, the restraints fire) and unfolds on its hinges (x8): the solar-wing packs swing
   out from the side faces and the panels open one by one, the radiators stand up, the dish mast telescopes and the
   ribs open, the boom telescopes aft, the barrel's two folded segments swing over and down on their pins and the lock
   collars slide over the joints. X-ray: power runs from the wings through the power conditioning unit into eight
   capacitor modules that fill one by one, the reaction wheels spin up, the six contactors close and the current runs
   down the busbar to the twelve coils while lightning crawls over the bus. The magazine indexes, the rammer telescopes
   a rod into the chamber, the breech block slides across and locks. The wheels slew the satellite onto the target;
   the coils energise breech to muzzle with lime arcs and charge rings. It fires (the rod's 25 ms in the barrel shown
   at x1/50, the recoil), the rod falls to the coast (the rate on screen), bursts 9 km above the battery into a
   lightning storm, and the strike and the scan cover five times the destroyer scan's area (r 246 m). Back over the sea
   to the carrier. One take, 80 s, loops. Render is a pure function of film time T. */
(() => {
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = SSK; K.setup();
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = [];
const t0load = performance.now();
const lap = s => LOG.push(`${s} ${(performance.now() - t0load).toFixed(0)} ms`);

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 80;
const T_RW = 1.4, T_LOCK = 8.6, TE = [9.2, 10.8, 12.4], RIDE0 = 12.4, RIDE1 = 19.4;
const TW = { pins: 20.3, root: [20.9, 22.1], pan: [[22.1, 23.0], [23.0, 23.9], [23.9, 24.8]], rad: [21.5, 22.7], mast: [22.3, 23.3], dish: [23.1, 24.3], boom: [23.5, 25.1], sada: [24.9, 26.7], segB: [24.9, 26.4], latchB: [26.4, 26.7], segC: [26.8, 28.0], latchC: [28.0, 28.3] };
const XR = [28.4, 29.1, 36.3, 37.0], T_WAVE = 28.9, T_HARN = 29.4, T_CAP0 = 30.0, CAP_DT = .45, CAP_D = 1.0, CAP_ORD = [0, 4, 1, 5, 2, 6, 3, 7], T_SW0 = 34.3, SW_DT = .15, T_FEED = 35.1;
const XRB = [37.2, 37.7, 40.7, 41.2], T_IDX = [37.5, 38.0], T_RAM = [38.1, 39.0], T_RAMB = [39.05, 39.7], T_BLK = [39.65, 40.15], T_LUG = [40.15, 40.45];
const SLEW = [41.3, 44.3], T_CHG = 44.4, COIL_T0 = 44.6, COIL_DT = .19, T_CD = 49.1;
const TF = 49.8, V_MZ = 1500, BL = 18.6, RATE_TR = 1 / 50, TR_D = 2 * BL / V_MZ / RATE_TR, TX = TF + TR_D;
const TBU = 58.4, LEAD = .8, TB = TBU + .08 + LEAD, T_CALM = 67.2;
const CHAPTERS = [
  { t: 0, title: 'Carrier' }, { t: T_RW, title: 'Radar' }, { t: 8.9, title: 'Uplink' }, { t: RIDE0, title: 'Climb' },
  { t: 19.2, title: 'Wake', wake: true }, { t: TW.root[0], title: 'Deploy' }, { t: XR[0], title: 'Power' }, { t: 37.3, title: 'Load' },
  { t: SLEW[0] - .1, title: 'Aim' }, { t: T_CHG, title: 'Charge' }, { t: TF, title: 'Fire' }, { t: TX + .1, title: 'Fall' },
  { t: TBU, title: 'Strike' }, { t: TB + 1.4, title: 'Scan' }, { t: T_CALM, title: 'Return' },
];
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const kb = (T, w) => kk(T, w[0], w[1]);
const ss = E.ss;
function integ(om, t0, t1, whole) {
  const N = Math.ceil((t1 - t0) * 120), A = new Float64Array(N + 1), dt = (t1 - t0) / N;
  for (let k = 1; k <= N; k++) A[k] = A[k - 1] + om(t0 + (k - .5) * dt) * dt;
  const sc = whole ? (Math.max(1, Math.round(A[N] / whole)) * whole) / (A[N] || 1) : 1;
  const f = T => { if (T <= t0) return 0; if (T >= t1) return A[N] * sc; const x = (T - t0) / dt, k = Math.min(N - 1, Math.floor(x)); return (A[k] + (A[k + 1] - A[k]) * (x - k)) * sc; };
  f.total = A[N] * sc; return f;
}

/* ---------- the world: Earth centre below the battery ---------- */
const RE = 6371000, CE = [0, -RE, 0], ALT = 420000;
const VEH = [
  ['tel1', 'tel', -22, 8, PI + .32, {}, 'TEL', 'K340P · BASTION-P'], ['tel2', 'tel', 19, -3, PI - .22, {}, 'TEL', 'K340P · BASTION-P'],
  ['rdr', 'radar', -5, 33, PI + .1, { mast: 1, ant: PI * .5 }, 'RDR', 'MONOLITH-B'], ['sam', 'pantsir', 32, 27, PI - .5, {}, 'SAM', 'PANTSIR-S1'],
  ['tel3', 'tel', -128, 96, PI + .9, {}, 'TEL', 'K340P · BASTION-P'], ['tel4', 'tel', 148, 118, PI - .7, {}, 'TEL', 'K340P · BASTION-P'],
  ['sam2', 'pantsir', -190, 22, PI + 1.3, {}, 'SAM', 'PANTSIR-S1'], ['rdr2', 'radar', 205, 30, PI - 1.1, { mast: 1, ant: PI * .2 }, 'RDR', 'MONOLITH-B'],
];
const CVP = [1500, 0, -5200], CV_YAW = -110 * DEG;
const SCAN_R = 246;                                             // sqrt(5) x the destroyer scan's 110 m: 5x the area
const SITE = K.makeSite({ seaR: 14000, landR: 14000, curve: RE, scanR: SCAN_R, scanTF: 3.2, idEnd: 7.5, veh: VEH, seaHole: { x: CVP[0], z: CVP[2], r: 2600 } });
const HIT = SITE.hitW, HITL = SITE.hitL, S_LOOK = [4, 12, 16];
lap('site');
const CVX = X.make(R.y(CV_YAW), [CVP[0], -(CVP[0] * CVP[0] + CVP[2] * CVP[2]) / (2 * RE), CVP[2]]);
const cv = p => X.ap(CVX, p);

/* ---------- models ---------- */
const MOD = SSAT(K), SM = MOD.sat, RAD = MOD.radar;
lap('sat+radar models');
const CVL = K.lodModel(HD.carrier(), {}, [.35, .7, 1.4, 2.8, 5.6], 501, 8, ['radars']);
lap('carrier');
const C48 = [31.6, 19.5 + 20.5 + 15.4 - .2, -28.5], C49 = [31.6, 36.9, -39.5];

/* ---------- the satellite's place, the radar's bearing ---------- */
const TH = 260000 / RE, HD_ = V.norm([-.32, 0, -.95]);
const UP_S = V.norm([HD_[0] * Math.sin(TH), Math.cos(TH), HD_[2] * Math.sin(TH)]);
const SAT = V.add(CE, V.mul(UP_S, RE + ALT));
const EY = UP_S, EZ = V.norm(V.sub(V.sub(HIT, SAT), V.mul(UP_S, V.dot(V.sub(HIT, SAT), UP_S)))), EX = V.cross(EY, EZ);
const faceW = phi => cv(V.add(C48, R.ap(R.y(phi), RAD.FACE_C)));
let PHI_LOCK = 0, A0 = faceW(0), D1 = [0, 1, 0];
for (let it = 0; it < 3; it++) { D1 = V.norm(V.sub(SAT, A0)); PHI_LOCK = Math.atan2(D1[0], D1[2]) - CV_YAW; A0 = faceW(PHI_LOCK); }
D1 = V.norm(V.sub(SAT, A0));
const S_UP = V.dist(A0, SAT), EL_D1 = Math.asin(V.dot(D1, V.norm(V.sub(A0, CE))));
const OM48 = TAU * 15 / 60;
const om48 = t => OM48 * ss(T_RW + .3, 3.3, t) * (1 - ss(7.0, T_LOCK, t));
const I48 = integ(om48, T_RW, T_LOCK);
const wrapPI = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const PHI_PARK = PHI_LOCK - I48.total, D_RET = wrapPI(PHI_PARK - PHI_LOCK);
const phi48 = T => T < T_LOCK ? PHI_PARK + I48(T) : PHI_LOCK + D_RET * kk(T, 70, 78);
const I49 = integ(t => TAU * 12 / 60 * ss(T_RW + .6, 3.8, t) * (1 - ss(7.2, 9.2, t)), T_RW, 9.2, TAU);
const phi49 = T => 1.1 + I49(T);

/* ---------- the globe: dots on the sphere, land brighter, the coastline brightest ---------- */
function coastBig(x) { return SITE.coastZ(x) + 42000 * noise(x / 230000, 3.3) * E.ss(15000, 80000, Math.abs(x)) + 90000 * fbm(x / 900000, 1.7, 2.2, 3) * E.ss(60000, 300000, Math.abs(x)); }
const GL = (() => {
  const A = [], r = rng(8080);
  const put = (x, z, sp) => {
    const d = Math.hypot(x, z); if (d < 13500) return;
    const cz = coastBig(x), m = z - cz, land = m > 0;
    const k = d / RE, nn = V.norm([Math.sin(k) * x / (d || 1), Math.cos(k), Math.sin(k) * z / (d || 1)]);
    const coast = Math.exp(-Math.abs(m) / (sp * .6));
    let b;
    if (land) { const t = fbm(x / 60000, z / 60000, 4.4, 3); b = .22 + .18 * t + .1 * r() + .55 * coast; }
    else { if (r() > .45 + .5 * coast) return; b = .08 + .06 * r() + .5 * coast; }
    A.push(CE[0] + nn[0] * RE, CE[1] + nn[1] * RE, CE[2] + nn[2] * RE, Math.min(1, b));
  };
  for (let x = -480000; x < 480000; x += 3600) for (let z = -480000; z < 480000; z += 3600) { const xx = x + (r() - .5) * 3000, zz = z + (r() - .5) * 3000; if (r() < 1 - E.ss(260000, 470000, Math.hypot(xx, zz))) put(xx, zz, 3600); }
  for (let x = -2600000; x < 2600000; x += 17000) for (let z = -2600000; z < 2600000; z += 17000) {
    const xx = x + (r() - .5) * 13000, zz = z + (r() - .5) * 13000;
    if (r() > E.ss(260000, 470000, Math.hypot(xx, zz))) continue;
    if (Math.hypot(xx, zz) > 2600000) continue;
    put(xx, zz, 17000);
  }
  for (let x = -2600000; x < 2600000; x += x > -480000 && x < 480000 ? 900 : 4000) { const z = coastBig(x) + (r() - .5) * 600; if (Math.hypot(x, z) < 13500 || Math.hypot(x, z) > 2600000) continue; const d = Math.hypot(x, z), k = d / RE; A.push(CE[0] + Math.sin(k) * x / d * RE, CE[1] + Math.cos(k) * RE, CE[2] + Math.sin(k) * z / d * RE, .8); }
  return new Float64Array(A);
})();
// a finer ring round the coast (13.5 to 80 km) for the low part of the fall
const GL2 = (() => {
  const A = [], r = rng(8181);
  for (let x = -80000; x < 80000; x += 650) for (let z = -80000; z < 80000; z += 650) {
    const xx = x + (r() - .5) * 560, zz = z + (r() - .5) * 560, d = Math.hypot(xx, zz); if (d < 13500 || d > 80000) continue;
    const m = zz - coastBig(xx), land = m > 0, coast = Math.exp(-Math.abs(m) / 400);
    let b; if (land) b = .2 + .2 * fbm(xx / 9000, zz / 9000, 2.4, 3) + .1 * r() + .5 * coast; else { if (r() > .35 + .6 * coast) continue; b = .07 + .06 * r() + .5 * coast; }
    const k = d / RE, nn = [Math.sin(k) * xx / d, Math.cos(k), Math.sin(k) * zz / d];
    A.push(CE[0] + nn[0] * RE, CE[1] + nn[1] * RE, CE[2] + nn[2] * RE, Math.min(1, b * (1 - E.ss(55000, 80000, d))));
  }
  return new Float64Array(A);
})();
lap(`globe ${GL.length / 4} + ${GL2.length / 4}`);
const GLT = K.tiled(new Float32Array(GL), 4, 90000), GLT2 = K.tiled(new Float32Array(GL2), 4, 12000);
function drawGlobe(vis, lit) {
  const alt = V.dist(C.eye, CE) - RE;
  globePass(GLT, vis, lit, alt);
  const a2 = 1 - E.ss(90000, 160000, alt);
  if (a2 > .01) globePass(GLT2, vis * a2, lit, alt);
}
function globePass(G, vis, lit, alt) {
  const GL = G.F, TL = G.TL;
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  if (alt < 3000) return;
  const fade = vis * E.ss(3000, 30000, alt);
  if (fade < .01) return;
  const ed = V.dist(e, CE), hz = Math.sqrt(Math.max(0, ed * ed - RE * RE));
  for (let tt = 0; tt < G.nt; tt++) {
  const q = tt * 6, tcx = TL[q + 2], tcy = TL[q + 3], tcz = TL[q + 4], trr = TL[q + 5];
  if (Math.hypot(tcx - e[0], tcy - e[1], tcz - e[2]) - trr > hz + 2000) continue;
  if (!K.wIn(tcx, tcy, tcz, trr)) continue;
  for (let k = TL[q], k1 = TL[q + 1]; k < k1; k++) {
    const j = k * 4, px = GL[j], py = GL[j + 1], pz = GL[j + 2];
    const dx = px - e[0], dy = py - e[1], dz = pz - e[2];
    if ((px - CE[0]) * dx + (py - CE[1]) * dy + (pz - CE[2]) * dz > 0) continue;
    const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 50) continue;
    const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= 1920) continue;
    const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= 1080) continue;
    if (K.occT(sx, sy, zc)) continue;
    let bb = GL[j + 3] * fade * 1.7;
    if (lit > 0) { const hx = px - HIT[0], hz = pz - HIT[2], d2 = hx * hx + hz * hz; if (d2 < 4e10) { const q = lit * Math.exp(-Math.sqrt(d2) / 60000); if (q > .02) { K.dot(sx, sy, 2, 198 + (236 - 198) * (1 - q), 244, 50 + 180 * (1 - q), Math.min(1, bb + q)); continue; } } }
    K.dot(sx, sy, zc > 150000 && bb > .3 ? 2 : 1, 236, 238, 230, bb > 1 ? 1 : bb);
  }
  }
}
const LIMB_H = [0, 12000, 25000, 45000, 70000], LIMB_B = [.55, .42, .28, .16, .07];
function drawLimb(vis) {
  const e = C.eye, d = V.dist(e, CE), alt = d - RE; if (alt < 60000) return;
  const w = V.norm(V.sub(e, CE)), [U, W] = GEO.perp(w), a = vis * E.ss(60000, 200000, alt);
  for (let s = 0; s < LIMB_H.length; s++) {
    const Rs = RE + LIMB_H[s], k = Rs * Rs / (d * d), cc = V.add(CE, V.mul(V.sub(e, CE), k)), rr = Rs * Math.sqrt(1 - k);
    K.ringW(cc, U, W, rr, 2600, 1, s ? [200, 214, 205] : WH, LIMB_B[s] * a, s * .37);
  }
}
const STARS = K.stars(2600, 19);

/* ---------- the sea round the carrier ---------- */
const CSEA = (() => {
  const A = [], r = rng(6603), Ri = CVX.R;
  for (let rad = 8; rad < 2600; rad += .8 + rad * .012) {
    const ds = .8 + rad * .012, n = Math.floor(TAU * rad / ds), ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * TAU, rr = rad + (r() - .5) * ds * .8, x = CVP[0] + Math.sin(a) * rr, z = CVP[2] + Math.cos(a) * rr;
      const dx = x - CVP[0], dz = z - CVP[2], lx = Ri[0] * dx + Ri[6] * dz, lz = Ri[2] * dx + Ri[8] * dz;
      if (Math.abs(lz) < 168 && Math.abs(lx) < (lz > 120 ? 22 * (1 - (lz - 120) / 48) + 6 : 38)) { r(); continue; }
      if (rad > 1800 && r() < (rad - 1800) / 1400) continue;
      const tex = Math.exp(1.1 * fbm(x * .003, z * .0012, 3.7, 3) - .2), hull = Math.exp(-Math.max(0, Math.hypot(Math.max(0, Math.abs(lx) - 38), Math.max(0, Math.abs(lz) - 166))) / 14);
      A.push(x, z, Math.min(1, .2 + .14 * tex + .3 * hull * r() + .06 * r()), r() * TAU, Math.atan2(x - CVX.T[0], z - CVX.T[2]));
    }
  }
  return K.tiled(new Float32Array(A), 5, 200, true);
})();
lap('carrier sea');
const AZ48 = T => CV_YAW + phi48(T);
const sweepA = T => ss(3.0, 4.0, T) * (1 - ss(7.0, 8.2, T));
function drawCSea(T, seaT, vis) {
  const S = CSEA.F, TS = CSEA.TL, e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const ph = seaT * TAU / 5, sw = seaT * TAU / 8, sa = sweepA(T), az = AZ48(T), y0 = CVX.T[1];
  const pulseRing = seaRingOf(T);
  for (let tt = 0; tt < CSEA.nt; tt++) {
    const q = tt * 6, cxs = TS[q + 2], czs = TS[q + 4];
    if (!K.wIn(cxs, y0, czs, TS[q + 5] + 2)) continue;
    const zt = K.WZ[0], dsp = 200 / Math.sqrt(TS[q + 1] - TS[q]) * F / Math.max(1, zt);
    const step = dsp >= 3 ? 1 : Math.min(60, Math.round(9 / (dsp * dsp)));
    for (let k = TS[q] + ((tt * 5) % step), k1 = TS[q + 1]; k < k1; k += step) {
      const j = k * 5, px = S[j], pz = S[j + 1];
      const py = y0 + .25 * Math.sin(S[j + 3] + ph) + .35 * Math.sin(sw + pz * .02 + px * .006);
      const dx = px - e[0], dy = py - e[1], dz = pz - e[2];
      const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 2) continue;
      const iz = F / zc, sx = cx + (dx * r[0] + dy * r[1] + dz * r[2]) * iz; if (sx < 0 || sx >= 1920) continue;
      const sy = cy - (dx * u[0] + dy * u[1] + dz * u[2]) * iz; if (sy < 0 || sy >= 1080) continue;
      let b = S[j + 2] * vis * (zc < 3000 ? 1 - zc / 9000 : .67) * (step > 1 ? 1.2 : 1), kl = 0;
      if (sa > 0) { let dl = (az - S[j + 4]) % TAU; if (dl < 0) dl += TAU; if (dl < 4.5) kl = sa * Math.exp(-dl * 1.1) * .75; }
      if (pulseRing) { const d = Math.hypot(px - CVX.T[0], pz - CVX.T[2]), w = d - pulseRing[0]; if (w < 0 && w > -60) kl = Math.max(kl, pulseRing[1] * Math.exp(w / 14)); }
      let cr = WH[0], cg = WH[1], cb = WH[2];
      if (kl > .02) { if (b < kl) b = kl; cr += (LIME[0] - cr) * kl; cg += (LIME[1] - cg) * kl; cb += (LIME[2] - cb) * kl; }
      if (b < .02) continue;
      K.dot(sx, sy, zc < 40 ? 2 : 1, cr, cg, cb, b > 1 ? 1 : b);
    }
  }
}

/* ---------- the carrier and its radars ---------- */
const CO = { a: 1.45, fade: 2600, px: 3.8, px0: 10, lime: 0, rev: null };
const RO = { a: 1.3, fade: 900, px: 2.6, px0: 8, lime: 0, rev: null, keep: 1 };
const RREV = { x: 0, y: 0, z: 0, age: 0, v: 4, pre: .7, after: 0 };
const XF48 = T => X.mul(CVX, X.make(R.y(phi48(T)), C48));
const XF48B = X.mul(CVX, X.make(R.I(), C48));
const XF49 = T => X.mul(CVX, X.make(R.y(phi49(T)), C49));
const pulseLit = T => { let m = 0; for (const t of TE) { const a = T - t; if (a > -.5 && a < .8) m = Math.max(m, a < 0 ? .5 * (1 + a / .5) : Math.exp(-a * 4)); } return m; };
function drawCarrier(T) {
  for (const p of CVL) K.drawLod(p.ml, CVX, CO);
  const age = T - T_RW;
  const lock = T > T_LOCK - .3 && T < 15 ? .35 * ss(T_LOCK - .3, T_LOCK, T) : 0;
  RO.lime = Math.max(lock, pulseLit(T));
  RO.rev = null;
  if (age > -.1 && age < 3.5) { RREV.x = 0; RREV.y = -.5; RREV.z = 0; RREV.age = age; RREV.after = .15; RO.rev = RREV; }
  K.drawLod(RAD.s48, XF48(T), RO);
  RO.rev = null; K.drawLod(RAD.s48b, XF48B, RO);
  RO.lime = 0;
  if (age > -.1 && age < 3.5) { RREV.age = age - .3; RO.rev = RREV; }
  K.drawLod(RAD.s49, XF49(T), RO);
  RO.rev = null;
}
const NFAN = 1800, FAN = new Float32Array(NFAN * 4);
{ const r = rng(313); for (let i = 0; i < NFAN; i++) { FAN[i * 4] = Math.pow(r(), 1.3); FAN[i * 4 + 1] = Math.floor(r() * 9) / 9 + r() * .02; FAN[i * 4 + 2] = (r() - .5); FAN[i * 4 + 3] = r(); } }
function drawSweep(T) {
  const sa = sweepA(T), lk = ss(7.4, T_LOCK + .2, T) * (1 - ss(RIDE0 + .2, RIDE0 + .8, T));
  if (sa < .01 && lk < .01) return;
  const az0 = AZ48(T), o = faceW(phi48(T)), RNG = 2600;
  for (let i = 0; i < NFAN; i++) {
    const q = i * 4, u = FAN[q];
    const elF = FAN[q + 1] * 20 * DEG, elL = EL_D1 + FAN[q + 2] * .8 * DEG;
    const el = elF + (elL - elF) * lk, az = az0 + FAN[q + 2] * (5 - 4.2 * lk) * DEG;
    const s = u * RNG * (1 + 1.5 * lk), ce = Math.cos(el);
    const band = .5 + .5 * Math.cos(TAU * (s / 260 - T * 3.1)), b4 = band * band * band;
    const a = Math.max(sa, lk) * (1 - .6 * u) * (.25 + .9 * b4) * (.45 + .55 * FAN[q + 3]);
    if (a < .03) continue;
    K.dotW(o[0] + Math.sin(az) * ce * s, o[1] + Math.sin(el) * s, o[2] + Math.cos(az) * ce * s, 1, LIME, a > 1 ? 1 : a);
  }
}

/* ---------- the three pulses (the third one ridden up to the satellite) ---------- */
const TA = Math.tan(3.2 * DEG);
const [U1, W1] = GEO.perp(D1);
const SIDE = V.norm(V.cross(D1, V.norm(V.sub(A0, CE))));
const XA = Math.log(6 / S_UP), XB = Math.log((S_UP - 22) / 22);
const qRide = T => { const u = E.sat((T - RIDE0) / (RIDE1 - RIDE0)), w = u * u * (3 - 2 * u) * .5 + (1 - (1 - u) * (1 - u)) * .5, x = XA + (XB - XA) * w; return S_UP / (1 + Math.exp(-x)); };
const hOf = q => 1 / (1 / (q + 55) + 1 / (S_UP - q + 14));
const frontRaw = T => { const q = qRide(T); return q + .86 * hOf(q) + (T > RIDE1 ? (T - RIDE1) * 90 : 0); };
const F0 = frontRaw(RIDE0);
const frontRide = T => frontRaw(T) - F0 * (1 - E.sat((T - RIDE0) / (RIDE1 - RIDE0)));
const T_ARR = (() => { let t = RIDE0; while (t < RIDE1 + 2 && frontRide(t) < S_UP) t += .002; return t; })();
const ageOf = (k, a) => k === 2 ? a : a <= 0 ? a : a * (.3 + .7 * ss(0, 4, a));
const frontOf = (k, T) => frontRide(ageOf(k, T - TE[k]) + RIDE0);
const arrOf = k => { let t = TE[k]; while (t < DUR && frontOf(k, t) < S_UP) t += .005; return t; };
const ARR = [arrOf(0), arrOf(1)];
LOG.push(`pulses arrive ${ARR[0].toFixed(2)} ${ARR[1].toFixed(2)} ${T_ARR.toFixed(2)}`);
CHAPTERS.find(c => c.wake).t = Math.round(T_ARR * 10) / 10;
const NBOWL = 700, BOWL = new Float32Array(NBOWL * 3), NCONE = 1500, CONE = new Float32Array(NCONE * 4);
{ const r = rng(717); for (let i = 0; i < NBOWL; i++) { const a = r() * TAU, q = Math.sqrt(r()); BOWL[i * 3] = Math.cos(a) * q; BOWL[i * 3 + 1] = Math.sin(a) * q; BOWL[i * 3 + 2] = r(); }
  for (let i = 0; i < NCONE; i++) { CONE[i * 4] = Math.pow(r(), 1.6); CONE[i * 4 + 1] = r() * TAU; const s = r(); CONE[i * 4 + 2] = s < .6 ? .9 + .1 * r() : Math.sqrt(r()); CONE[i * 4 + 3] = .4 + .6 * r(); } }
function drawPulse(k, T) {
  const age = T - TE[k]; if (age < -.05) return;
  const f = Math.max(2, frontOf(k, T));
  const a = ss(0, .06, age) * (1 - ss(S_UP + 60, S_UP + 1600, f));
  if (a < .01) return;
  const conv = ss(S_UP - 4000, S_UP - 40, f);
  const rho = (Math.max(2.6, f * TA) + 9 * ss(0, 60, f) + 22 * ss(0, 300, f)) * (1 - conv) + 7.5 * conv * (f > S_UP ? 1 + (f - S_UP) / 30 : 1);
  const fc = [A0[0] + D1[0] * f, A0[1] + D1[1] * f, A0[2] + D1[2] * f];
  const bright = k === 2 ? 1 : .85;
  const n = 260, ph = T * 1.7 + k;
  for (let j = 0; j < n; j++) {
    const t = ph + j / n * TAU, c = Math.cos(t) * rho, s = Math.sin(t) * rho;
    if (K.pj(fc[0] + U1[0] * c + W1[0] * s, fc[1] + U1[1] * c + W1[1] * s, fc[2] + U1[2] * c + W1[2] * s)) K.dot(K.PJ[0], K.PJ[1], j % 5 === 0 ? 3 : 2, j % 5 === 0 ? 248 : LIME[0], j % 5 === 0 ? 255 : LIME[1], j % 5 === 0 ? 232 : LIME[2], a * bright * (j % 5 === 0 ? 1 : .75));
  }
  for (let m = 1; m <= 3; m++) { const back = rho * (.5 + .4 * m) * (1 - conv * .6), r2 = rho * (1 - .1 * m); K.ringW(V.mad(fc, D1, -back), U1, W1, r2, 160, m === 1 ? 2 : 1, LIME, a * .55 / m, -ph * .6 + m); }
  for (let i = 0; i < NBOWL; i++) {
    const o = i * 3, lx = BOWL[o] * rho, ly = BOWL[o + 1] * rho, rr = BOWL[o] * BOWL[o] + BOWL[o + 1] * BOWL[o + 1];
    const dep = -rho * .35 * (1 - rr) * (1 - conv);
    K.dotW(fc[0] + U1[0] * lx + W1[0] * ly + D1[0] * dep, fc[1] + U1[1] * lx + W1[1] * ly + D1[1] * dep, fc[2] + U1[2] * lx + W1[2] * ly + D1[2] * dep, 1, BOWL[o + 2] < .3 ? HOT : LIME, a * .5 * (.4 + .6 * rr));
  }
  const cf = a * (1 - ss(S_UP * .3, S_UP * .9, f)) * .8;
  if (cf > .01) for (let i = 0; i < NCONE; i++) {
    const o = i * 4, u = CONE[o], s = u * f, ang = CONE[o + 1] + T * .4, rr = s / f * rho * CONE[o + 2], c = Math.cos(ang) * rr, sn = Math.sin(ang) * rr;
    const band = .5 + .5 * Math.cos(TAU * (u * 7 - age * 3.4)), b4 = band * band * band * band;
    const b = cf * CONE[o + 3] * (CONE[o + 2] > .88 ? 1 : .45) * (1 - .4 * u) * (.3 + 1.1 * b4);
    K.dotW(A0[0] + D1[0] * s + U1[0] * c + W1[0] * sn, A0[1] + D1[1] * s + U1[1] * c + W1[1] * sn, A0[2] + D1[2] * s + U1[2] * c + W1[2] * sn, 1, LIME, b > 1 ? 1 : b);
  }
  if (age < .6) { K.glowW(A0[0], A0[1], A0[2], Math.round(30 + 120 * Math.exp(-age * 6)), HOT, .8 * Math.exp(-age * 5)); K.glowW(A0[0], A0[1], A0[2], 70, LIME, .35 * Math.exp(-age * 3)); }
}
const SR = [0, 0];
function seaRingOf(T) {
  let best = null;
  for (let k = 0; k < 3; k++) { const a = T - TE[k]; if (a < 0 || a > 2.4) continue; SR[0] = 20 + 1400 * Math.pow(a / 2.4, .6); SR[1] = .9 * (1 - a / 2.4); best = SR; }
  return best;
}

/* ---------- the satellite's state ---------- */
const ST = { root: 0, pan: [0, 0, 0], sada: 0, rad: 0, mast: 0, dish: 0, boom: 0, segB: 0, segC: 0, latchB: 0, latchC: 0, wheel: 0, sw: [0, 0, 0, 0, 0, 0], drum: 0, ram: 0, rodOut: false, rodZ: 0, block: 0, lugs: 0, recoil: 0 };
const WHEEL = integ(t => 26 * ss(28.6, 31.6, t), 28.6, DUR, TAU);
const RAM_HEAD = T => -2.6 + 2.5 * (T < T_RAMB[0] ? kb(T, T_RAM) : 1 - kb(T, T_RAMB));
const T_CONTACT = (() => { let t = T_RAM[0]; while (t < T_RAM[1] && RAM_HEAD(t) < SM.DZ0 + .12) t += .001; return t; })();
const rodZof = T => T < TF ? (T < T_RAM[1] ? E.clamp(RAM_HEAD(T), SM.DZ0 + .12, -.1) : -.1) : -.1 + BL * Math.pow(E.sat((T - TF) / TR_D), 2);
const recoilOf = T => { const a = T - TF; if (a <= 0) return 0; if (a < TR_D) return .12 * Math.pow(a / TR_D, 2); return .12 + .5 * (1 - Math.exp(-(a - TR_D) * 1.6)); };
function stateAt(T) {
  const on = T > T_ARR - .05 && T < TBU + 4;
  ST.root = on ? kb(T, TW.root) : 0;
  for (let j = 0; j < 3; j++) ST.pan[j] = on ? kb(T, TW.pan[j]) : 0;
  ST.sada = on ? 28 * DEG * kb(T, TW.sada) : 0;
  ST.rad = on ? kb(T, TW.rad) : 0; ST.mast = on ? kb(T, TW.mast) : 0; ST.dish = on ? kb(T, TW.dish) : 0; ST.boom = on ? kb(T, TW.boom) : 0;
  ST.segB = on ? kb(T, TW.segB) : 0; ST.segC = on ? kb(T, TW.segC) : 0; ST.latchB = on ? kb(T, TW.latchB) : 0; ST.latchC = on ? kb(T, TW.latchC) : 0;
  ST.wheel = WHEEL(T);
  for (let i = 0; i < 6; i++) ST.sw[i] = on ? kk(T, T_SW0 + i * SW_DT, T_SW0 + i * SW_DT + .12) : 0;
  ST.drum = on ? -PI / 3 * (1 - kb(T, T_IDX)) : -PI / 3;
  ST.ram = on ? (T < T_RAMB[0] ? kb(T, T_RAM) : 1 - kb(T, T_RAMB)) : 0;
  ST.rodOut = on && T > T_CONTACT;
  ST.rodZ = rodZof(T);
  ST.block = on ? kb(T, T_BLK) : 0; ST.lugs = on ? kb(T, T_LUG) : 0;
  ST.recoil = on ? recoilOf(T) : 0;
  return ST;
}
// attitude: dormant (the barrel along the orbit, the top to space) -> the barrel on the burst point
const B_TOP = V.add(HIT, [260, 9000, -520]);
const AIM = V.norm(V.sub(B_TOP, SAT));
const Q0 = K.Q.fromR(R.look(EX, EY)), Q1 = K.Q.fromR(R.look(AIM, EY));
const WS0 = X.make(K.Q.toR(Q0), SAT), WS1 = X.make(K.Q.toR(Q1), SAT);
let SATW = WS0;
const satXf = T => { const u = kb(T, SLEW); SATW = u <= 0 ? WS0 : u >= 1 ? WS1 : X.make(K.Q.toR(K.Q.slerp(Q0, Q1, u)), SAT); return SATW; };
const SW = p => X.ap(WS0, p), S1W = p => X.ap(WS1, p);
const X1 = X.dir(WS1, [1, 0, 0]), Y1 = X.dir(WS1, [0, 1, 0]);
// the muzzle when it fires (no recoil) and the fall
const MZ0 = (() => { const s = Object.assign({}, stateAt(TF - .01)); s.recoil = 0; s.pan = ST.pan.slice(); s.sw = ST.sw.slice(); const P = SM.pose(WS1, s); return P.muzzle.slice(); })();
const DIRP = V.norm(V.sub(B_TOP, MZ0)), L0 = V.dist(MZ0, B_TOP);
const VP = 8200, TAU_V = 6;                                     // the rod's speed eases from the muzzle's 1.5 km/s to 8.2
const sOfTau = t => V_MZ * t + (VP - V_MZ) * (t - TAU_V * (1 - Math.exp(-t / TAU_V)));
const vOfTau = t => V_MZ + (VP - V_MZ) * (1 - Math.exp(-t / TAU_V));
const TAU_END = (() => { let a = 0, b = 400; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (sOfTau(m) < L0) a = m; else b = m; } return (a + b) / 2; })();
const FD = TBU - TX;
const FWARP = FILM.warp([{ t: 0, rate: 1 }, { t: .5, rate: 1 }, { t: 1.9, rate: 16 }, { t: 5.0, rate: 16 }, { t: FD, rate: 3 }]);
const FWS = TAU_END / FWARP.total;
const tauOf = T => T <= TX ? 0 : T >= TBU ? TAU_END : FWARP(T - TX) * FWS;
const fallRate = T => T <= TX || T >= TBU ? 1 : FWARP.rate(T - TX) * FWS;
const rodAt = T => V.mad(MZ0, DIRP, sOfTau(tauOf(T)));
const altOf = p => V.dist(p, CE) - RE;
const [PXP, PYP] = GEO.perp(DIRP);
LOG.push(`fall ${(L0 / 1000).toFixed(1)} km in ${TAU_END.toFixed(1)} s sim, arrival ${T_ARR.toFixed(2)}, transit ${TR_D.toFixed(2)} s`);
lap('timeline');

/* ---------- small helpers ---------- */
const TMP = [0, 0, 0];
const apT = (Tw, x, y, z, o) => { const M = Tw.R, t = Tw.T; o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o; };
const flash = (T, t0, k) => { const a = T - t0; return a > 0 && a < 3 ? Math.exp(-a * (k || 6)) : 0; };
/* a polyline in a model frame, walked by arc length */
function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.dist(pts[i], pts[i - 1])); return { p: pts, cum, L: cum[cum.length - 1] }; }
function pathAt(pa, s, Tw, o) {
  const c = pa.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
  const k = E.clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]), 0, 1), a = pa.p[i - 1], b = pa.p[i];
  return apT(Tw, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, o);
}
/* current as packets along a path: emitted from t0 to t1 at `speed` m/s (film), one every `gap` m */
const PK = [0, 0, 0];
function stream(pa, Tw, T, t0, t1, speed, gap, a) {
  if (T < t0 || a < .01) return;
  const head = (T - t0) * speed;
  for (let k = 0; ; k++) {
    const s = head - k * gap; if (s < 0) break;
    if (s > pa.L + .01) continue;
    if (T - s / speed > t1) continue;
    for (let q = 0; q < 6; q++) {
      const sq = s - q * gap * .05; if (sq < 0) break;
      pathAt(pa, sq, Tw, PK);
      K.dotW(PK[0], PK[1], PK[2], q ? 1 : 2, q ? LIME : HOT, a * (1 - q / 6));
    }
    pathAt(pa, s, Tw, PK); K.glowW(PK[0], PK[1], PK[2], 8, LIME, .25 * a);
  }
}

/* ---------- the satellite's effects ---------- */
const HB = SM.HB, PW = SM.PW, PL = SM.PL;
// power paths (bus frame)
const P_HARN = [1, -1].map(s => mkPath([[s * 1.3, 1.1, -4.9], [s * 1.05, .95, -4.9], [s * 1.0, .45, -6.0], [s * .5, .3, -6.55]]));
const P_CAPS = SM.CAPM_C.map(c => mkPath([[c[0] * .3, .35, -6.4], [c[0], .56, -6.35], [c[0], .56, c[2]], [c[0], .5, c[2]]]));
const P_TOSW = [1, -1].map(s => mkPath([[s * .66, .56, -3.4], [s * .66, .56, -3.2], [s * .66, -.75, -3.0], [s * .2, -.8, -2.9], [0, -.8, -2.88]]));
const P_FEED0 = mkPath([[0, -.8, -2.88], [0, -.95, -2.75], [0, -.95, -2.6], [0, -.72, -.2], [0, -.72, 0]]);
const P_SEGF = mkPath([[0, -.72, 0], [0, -.72, 6]]);
const P_TERM = mkPath([[0, -.72, 0], [0, -.62, 0]]);
// status lights
function drawLights(T, P) {
  for (let k = 0; k < 12; k++) {
    const t0 = T_ARR + .15 + .07 * k; if (T < t0 || T > TBU + 3) continue;
    const a = T - t0, on = a < .06 ? 1 : a < .12 ? .3 : 1, blink = k % 4 === 3 ? (Math.floor(T * 2 + k) % 2 ? 1 : .3) : 1, lime = T > T_ARR + 1.4;
    const p = P.lights[k];
    K.dotW(p[0], p[1], p[2], 2, lime ? LIME : [255, 255, 255], on * blink);
    K.glowW(p[0], p[1], p[2], 7, lime ? LIME : HOT, .3 * on * blink);
  }
}
// the restraints firing (pin pullers): a flash and a spray of sparks at each tie-down
const TIES = [[1.36, -1.1, -6.6], [1.36, -1.1, -3.2], [-1.36, -1.1, -6.6], [-1.36, -1.1, -3.2], [.6, 1.34, -4.2], [-.6, 1.34, -4.2], [0, 2.1, 1.0], [0, 2.1, 5.0], [.3, .7, 3.0]];
const SPARK = (() => { const r = rng(2121), A = new Float32Array(24 * 4); for (let i = 0; i < 24; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u), s = .6 + 1.6 * r(); A[i * 4] = Math.cos(a) * h * s; A[i * 4 + 1] = u * s; A[i * 4 + 2] = Math.sin(a) * h * s; A[i * 4 + 3] = .25 + .4 * r(); } return A; })();
function burstAt(p, a, scale, col) {
  if (a < 0 || a > .8) return;
  K.glowW(p[0], p[1], p[2], Math.round(10 + 30 * Math.exp(-a * 10)), HOT, .8 * Math.exp(-a * 8));
  for (let i = 0; i < 24; i++) { const o = i * 4, life = SPARK[o + 3]; if (a > life) continue; K.dotW(p[0] + SPARK[o] * a * scale, p[1] + SPARK[o + 1] * a * scale, p[2] + SPARK[o + 2] * a * scale, 1, col || HOT, 1 - a / life); }
}
function drawTies(T, P) {
  for (let i = 0; i < TIES.length; i++) { const a = T - (TW.pins + .07 * i); if (a < 0 || a > .8) continue; const t = TIES[i]; apT(P.WB, t[0], t[1], t[2], TMP); burstAt(TMP, a, 1); }
}
// hinges: while a hinge turns, a lime ring runs round its pin; a lock flash when it seats
function pinRing(Tw, c, ax, r, a, T) {
  if (a < .02) return;
  const [U, W] = GEO.perp(ax), cw = X.ap(Tw, c), U2 = X.dir(Tw, U), W2 = X.dir(Tw, W);
  K.ringW(cw, U2, W2, r, 48, 1, LIME, a, T * 9);
}
function drawHingeFx(T, P) {
  const mv = w => ss(w[0], w[0] + .15, T) * (1 - ss(w[1] - .15, w[1], T));
  const rootA = mv(TW.root);
  for (const Tm of P.yokes) { pinRing(Tm, [0, 0, -.62], [0, 0, 1], .07, rootA, T); pinRing(Tm, [0, 0, .62], [0, 0, 1], .07, rootA, T); }
  for (let side = 0; side < 2; side++) for (let j = 0; j < 3; j++) { const a = mv(TW.pan[j]); if (a < .02) continue; const pn = P.pins[side * 3 + j]; for (const z of [-1.5, 0, 1.5]) pinRing(pn.T, [PW, pn.up ? .015 : -.015, z], [0, 0, 1], .06, a, T); }
  const bA = mv(TW.segB), cA = mv(TW.segC);
  for (const x of [-.34, 0, .34]) { pinRing(P.hinges[0], [x, SM.HH, -.02], [1, 0, 0], .1, bA, T); pinRing(P.hinges[2], [x, -SM.HH, -.02], [1, 0, 0], .1, cA, T); }
  // lock flashes: wing panels, barrel collars
  for (let side = 0; side < 2; side++) for (let j = 0; j < 3; j++) { const a = T - TW.pan[j][1]; if (a > 0 && a < .5) { const pn = P.pins[side * 3 + j]; apT(pn.T, PW, 0, 0, TMP); K.glowW(TMP[0], TMP[1], TMP[2], Math.round(8 + 20 * Math.exp(-a * 8)), HOT, .7 * Math.exp(-a * 7)); } }
  for (let q = 0; q < 2; q++) {
    const a = T - (q ? TW.latchC[1] : TW.latchB[1]); if (a < 0 || a > .7) continue;
    const Tm = P.collars[q], c = X.ap(Tm, [0, 0, .23]), U = X.dir(Tm, [1, 0, 0]), W = X.dir(Tm, [0, 1, 0]);
    K.ringW(c, U, W, .4 + a * 1.6, 120, 2, HOT, 1 - a / .7, 0); K.ringW(c, U, W, .4 + a * .9, 90, 1, LIME, .8 * (1 - a / .7), .3);
  }
}
// thrusters: short puffs of dots out of the pod nozzles
const PUFF = (() => { const r = rng(3131), A = new Float32Array(90 * 4); for (let i = 0; i < 90; i++) { A[i * 4] = r(); A[i * 4 + 1] = (r() - .5); A[i * 4 + 2] = (r() - .5); A[i * 4 + 3] = r(); } return A; })();
const PODS = []; for (const z of [SM.ZB0 + .12, SM.ZB1 - .12]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) PODS.push({ c: [sx * (HB + .08), sy * (HB + .08), z], sx, sy, aft: z < -5 });
const PUFFS = [[SLEW[0], [[0, 'x', 1], [3, 'x', 1], [4, 'x', -1], [7, 'x', -1]]], [SLEW[1] - .45, [[0, 'x', -1], [3, 'x', -1], [4, 'x', 1], [7, 'x', 1]]], [TX + .5, [[0, 'z', 1], [1, 'z', 1], [2, 'z', 1], [3, 'z', 1]]], [TX + 1.4, [[0, 'z', 1], [1, 'z', 1], [2, 'z', 1], [3, 'z', 1]]]];
const PD = [0, 0, 0], PC = [0, 0, 0];
function drawPuffs(T, P) {
  for (const [t0, list] of PUFFS) {
    const age = T - t0; if (age < 0 || age > 1.1) continue;
    const on = age < .45;
    for (const [pi, ax] of list) {
      const pd = PODS[pi], d = ax === 'x' ? [pd.sx, 0, 0] : [0, 0, pd.aft ? -1 : 1];
      apT(P.WB, pd.c[0] + d[0] * .2, pd.c[1] + d[1] * .2, pd.c[2] + d[2] * .2, PC);
      const dw = X.dir(P.WB, d), [U, W] = GEO.perp(dw);
      if (on) K.glowW(PC[0], PC[1], PC[2], 9, HOT, .6);
      for (let i = 0; i < 90; i++) {
        const o = i * 4, te = PUFF[o] * .45; if (te > age) continue;
        const a = age - te, s = a * 6, spread = .15 + a * 2.4;
        const b = (1 - a / .65) * (.5 + .5 * PUFF[o + 3]); if (b < .02) continue;
        K.dotW(PC[0] + dw[0] * s + (U[0] * PUFF[o + 1] + W[0] * PUFF[o + 2]) * spread, PC[1] + dw[1] * s + (U[1] * PUFF[o + 1] + W[1] * PUFF[o + 2]) * spread, PC[2] + dw[2] * s + (U[2] * PUFF[o + 1] + W[2] * PUFF[o + 2]) * spread, 1, a < .12 ? HOT : WH, b);
      }
    }
  }
}
// the power run: wings -> harness -> PCU -> busbars -> capacitor modules -> contactors -> the barrel feed -> coils
const capT0 = i => T_CAP0 + CAP_ORD.indexOf(i) * CAP_DT;
const capFill = (T, i) => kk(T, capT0(i), capT0(i) + CAP_D) * (1 - ss(TF, TX, T));
const A2 = [0, 0, 0], B2 = [0, 0, 0];
function crawlBus(T, P, q, seed) {
  if (q < .01) return;
  const fr = Math.floor(T * 30), n = Math.floor(2 + 12 * q);
  for (let i = 0; i < n; i++) {
    const h1 = K.hh(i * 3.7 + seed, fr), h2 = K.hh(i * 5.3 + 1 + seed, fr), h3 = K.hh(i * 1.9 + 7 + seed, fr), h4 = K.hh(i * 2.3 + 3 + seed, fr);
    const face = Math.floor(h1 * 4), z0 = SM.ZB0 + .2 + h2 * 4.2, u0 = (h3 - .5) * 2.4, dz = (h4 - .5) * 1.4, du = (K.hh(i * 7.1, fr) - .5) * 1.2;
    const pt = (u, z, o) => face === 0 ? apT(P.WB, u, HB + .02, z, o) : face === 1 ? apT(P.WB, HB + .02, u, z, o) : face === 2 ? apT(P.WB, -HB - .02, u, z, o) : apT(P.WB, u, -HB - .02, z, o);
    pt(E.clamp(u0, -1.25, 1.25), z0, A2); pt(E.clamp(u0 + du, -1.25, 1.25), E.clamp(z0 + dz, SM.ZB0 + .1, SM.ZB1 - .1), B2);
    K.arcW(A2, B2, i * 3 + seed, T, (.4 + .7 * q) * (.6 + .4 * h3), .4);
  }
}
function pathArcs(pa, Tw, T, I, n, seed) {
  if (I < .02) return;
  const fr = Math.floor(T * 30);
  for (let k = 0; k < n; k++) {
    const s = K.hh(k * 5.7 + seed, fr) * pa.L, l = .15 + .25 * K.hh(k * 2.9 + seed, fr);
    pathAt(pa, s, Tw, A2); pathAt(pa, Math.min(pa.L, s + l), Tw, B2);
    K.arcW(A2, B2, seed * 7 + k, T, I, .7);
  }
}
function drawPower(T, P, xr) {
  if (T < T_WAVE - .2 || T > TX + 1) return;
  const a = Math.min(1, xr * 1.4);
  // harness from each wing root to the PCU
  for (let s = 0; s < 2; s++) stream(P_HARN[s], P.WB, T, T_HARN, TF, 2.4, .5, a);
  // PCU to each module while it fills
  for (let i = 0; i < 8; i++) { const t0 = capT0(i); stream(P_CAPS[i], P.WB, T, t0 - .5, t0 + CAP_D - .2, 5, .55, a); }
  // modules to the contactors, the contactors to the barrel
  for (let s = 0; s < 2; s++) stream(P_TOSW[s], P.WB, T, T_SW0 - .3, TF, 3.5, .45, a);
  if (T > T_FEED) {
    stream(P_FEED0, P.WB, T, T_FEED, TF + TR_D, 6, .6, 1);
    for (let sg = 0; sg < 3; sg++) {
      const t0 = T_FEED + .4 + sg * .75;
      stream(P_SEGF, P.segs[sg], T, t0, TF + TR_D, 8, .5, 1);
      for (let j = 0; j < 4; j++) {
        const tj = t0 + SM.COIL_Z[j] / 8; if (T < tj) continue;
        apT(P.segs[sg], 0, -.62, SM.COIL_Z[j], TMP); const fl = flash(T, tj, 4); K.glowW(TMP[0], TMP[1], TMP[2], Math.round(8 + 22 * fl), LIME, .25 + .7 * fl);
        if (fl > .05) { const Tm = P.coils[sg * 4 + j]; K.ringW(apT(Tm, 0, 0, 0, CQ), X.dir(Tm, [1, 0, 0]), X.dir(Tm, [0, 1, 0]), SM.RC1 + .05 + (1 - fl) * .5, 110, 2, LIME, fl, j); }
      }
    }
  }
  // contactors closing: an arc across each blade as it makes
  for (let i = 0; i < 6; i++) {
    const tc = T_SW0 + i * SW_DT + .1, ag = T - tc; if (ag < -.06 || ag > .3) continue;
    apT(P.cont[i], 0, .2, .08, A2); apT(P.blades[i], 0, .03, .16, B2);
    K.arcW(A2, B2, i * 11, T, 1 - Math.max(0, ag) / .3, .5); K.glowW(A2[0], A2[1], A2[2], 14, HOT, .6 * (1 - Math.max(0, ag) / .3));
  }
  // electricity along the conductors while current runs: short jagged arcs hopping along each path
  for (let s = 0; s < 2; s++) if (T > T_HARN && T < TF) pathArcs(P_HARN[s], P.WB, T, .5 * a, 3, s * 5);
  for (let i = 0; i < 8; i++) { const t0 = capT0(i); if (T > t0 - .3 && T < t0 + CAP_D) pathArcs(P_CAPS[i], P.WB, T, .8 * a, 3, 20 + i * 3); }
  if (T > T_SW0 && T < TF) for (let s = 0; s < 2; s++) pathArcs(P_TOSW[s], P.WB, T, .7 * a, 3, 50 + s * 4);
  if (T > T_FEED && T < TX) pathArcs(P_FEED0, P.WB, T, .9, 4, 60);
  // each module as it tops off: arcs jumping across its cans, a flash
  for (let i = 0; i < 8; i++) {
    const ag = T - (capT0(i) + CAP_D); if (ag < -.25 || ag > .5) continue;
    const Tm = P.capm[i], fr = Math.floor(T * 30), I = ag < 0 ? .6 : 1 - ag / .5;
    for (let k = 0; k < 5; k++) {
      const c1 = Math.floor(K.hh(k * 3.3 + i, fr) * 6), c2 = (c1 + 1 + Math.floor(K.hh(k * 7.1 + i, fr) * 5)) % 6;
      apT(Tm, (c1 % 2 ? .2 : -.2), .8, (Math.floor(c1 / 2) - 1) * .2, A2); apT(Tm, (c2 % 2 ? .2 : -.2), .8, (Math.floor(c2 / 2) - 1) * .2, B2);
      K.arcW(A2, B2, i * 13 + k, T, I * a, .6);
    }
    if (ag > 0) { apT(Tm, 0, .8, 0, A2); K.glowW(A2[0], A2[1], A2[2], Math.round(12 + 30 * (1 - ag / .5)), HOT, .7 * (1 - ag / .5) * a); }
  }
  // lightning crawling over the bus, building up as the bank fills
  crawlBus(T, P, ss(31.5, 35.5, T) * (1 - ss(36.2, 37.2, T)) + .8 * ss(T_CHG + 1.5, TF, T) * (1 - ss(TF + .1, TX + .6, T)), 0);
}
// charge: coils energise breech to muzzle, arcs round and between them, charge rings, the countdown
const coilT = j => COIL_T0 + j * COIL_DT;
const coilZg = j => Math.floor(j / 4) * SM.SL + SM.COIL_Z[j % 4];
const T_PASS = j => TF + TR_D * Math.sqrt(E.sat((coilZg(j) - .6) / BL));
function coilLit(T, j) {
  let l = T > T_FEED ? .12 * ss(T_FEED, T_FEED + 2, T) : 0;
  l = Math.max(l, T > coilT(j) ? .45 + .55 * Math.exp(-(T - coilT(j)) * 5) : 0);
  const c = T - (T_CD + .035 * j); if (c > 0 && c < .5) l = Math.max(l, 1 - c * .8);
  const p = T - T_PASS(j); if (T > TF) l = Math.max(l * (1 - ss(TF, TX + .3, T)), p > -.02 && p < 1.5 ? Math.exp(-Math.max(0, p) * 3) : 0);
  if (T > TX + 2.5) l = 0;
  return Math.min(1, l);
}
const CQ = [0, 0, 0], CR = [0, 0, 0];
function coilPt(P, j, a, r, zo, out) { return apT(P.coils[j], Math.cos(a) * r, Math.sin(a) * r, zo || 0, out); }
function drawCharge(T, P) {
  if (T < COIL_T0 - .1 || T > TX + .4) return;
  const q = ss(COIL_T0, T_CD, T) * (1 - ss(TF + .05, TX + .3, T)), fr = Math.floor(T * 30);
  // rings of arcs on the energised coils and arcs jumping coil to coil
  const n = Math.floor(4 + 26 * q);
  for (let i = 0; i < n; i++) {
    const h1 = K.hh(i * 3.7, fr), h2 = K.hh(i * 5.3 + 1, fr), h3 = K.hh(i * 1.9 + 7, fr);
    const j = Math.floor(h1 * 12); if (T < coilT(j)) continue;
    const a = h2 * TAU;
    if (h3 < .45) { coilPt(P, j, a, SM.RC1 + .06, 0, CQ); coilPt(P, j, a + .5 + h3, SM.RC1 + .06, 0, CR); K.arcW(CQ, CR, i + fr * .1, T, (.5 + .6 * q) * (.6 + .4 * h3), .45); }
    else if (j < 11 && T > coilT(j + 1)) { coilPt(P, j, a, SM.RC1, .1, CQ); coilPt(P, j + 1, a + (h3 - .7), SM.RC1, -.1, CR); K.arcW(CQ, CR, i * 7 + 3, T, .35 + .65 * q, .22); }
  }
  // the moment each coil energises: a ring blown off it, a flash; then a turning ring of dots held on it
  for (let j = 0; j < 12; j++) {
    const a = T - coilT(j); if (a < 0) continue;
    const Tm = P.coils[j], c = apT(Tm, 0, 0, 0, CQ), U = X.dir(Tm, [1, 0, 0]), W = X.dir(Tm, [0, 1, 0]);
    if (a < .6) { K.ringW(c, U, W, SM.RC1 + .1 + a * 2.2, 140, 2, a < .15 ? HOT : LIME, 1 - a / .6, j); K.ringW(c, U, W, SM.RC1 + .05 + a * 1.2, 100, 1, LIME, .7 * (1 - a / .6), j + .5); }
    const hold = q * (T < TF ? 1 : 0);
    if (hold > .02) for (const zo of [-.16, .16]) { apT(Tm, 0, 0, zo, CR); K.ringW(CR, U, W, SM.RC1 + .05, 90, 1, j % 2 ? LIME : HOT, .55 * hold, T * (j % 2 ? 7 : -7) + j); }
  }
  // lightning crawling along the rails between the coils
  const cr = ss(46, T_CD, T) * (1 - ss(TF, TF + .3, T));
  if (cr > .01) for (let i = 0; i < Math.floor(2 + 6 * cr); i++) {
    const h = K.hh(i * 9.1, fr), j = Math.floor(h * 11), s = K.hh(i * 4.3, fr) < .5 ? -1 : 1;
    apT(P.coils[j], s * .24, .12, .2, CQ); apT(P.coils[j + 1], s * .24, .12, -.2, CR);
    K.arcW(CQ, CR, i * 13, T, .5 + .5 * cr, .3);
  }
  // the muzzle glowing before the shot
  const mg = ss(T_CD, TF, T) * (1 - ss(TF, TF + .2, T));
  if (mg > .01) { const m = P.muzzle; K.glowW(m[0], m[1], m[2], Math.round(20 + 50 * mg), LIME, .35 * mg); }
}
// the shot: the rod in the barrel, the coils firing behind it, the muzzle blast and a plasma ring, recoil
function drawShot(T, P) {
  const a0 = T - TF; if (a0 < 0 || a0 > TR_D + 3) return;
  if (a0 < TR_D && P.rod) { apT(P.rod, 0, 0, .7, CQ); K.glowW(CQ[0], CQ[1], CQ[2], 60, LIME, .5); K.glowW(CQ[0], CQ[1], CQ[2], 16, HOT, .9); for (let k = 1; k < 5; k++) { apT(P.rod, 0, 0, .7 - k * .9, CR); K.glowW(CR[0], CR[1], CR[2], 30 - 5 * k, LIME, .35 * (1 - k / 5)); } }
  const ax = T - TX; if (ax < -.05) return;
  const m = V.mad(P.muzzle, DIRP, 0), A = Math.max(0, 1 - ax / 2.5);
  if (ax < .8) { K.glowW(m[0], m[1], m[2], Math.round(40 + 340 * Math.exp(-ax * 7)), HOT, Math.min(1, 1.1 * Math.exp(-ax * 4))); K.glowW(m[0], m[1], m[2], 160, LIME, .45 * Math.exp(-ax * 3)); }
  const r = .6 + 26 * Math.pow(Math.max(0, ax), .6);
  for (let k = 0; k < 3; k++) { const c = V.mad(m, DIRP, 1 + (5 + 4 * k) * Math.max(0, ax)); K.ringW(c, PXP, PYP, r * (1 - .18 * k), 700, k ? 1 : 2, k === 1 ? LIME : HOT, (.9 - .25 * k) * A, k); }
  for (let i = 0; i < 160; i++) { const o = (i % 24) * 4, b = (1 - ax / .9); if (b <= 0) break; const s = ax * (4 + 30 * K.hh(i, 3)); K.dotW(m[0] + DIRP[0] * s + SPARK[o] * ax * 5, m[1] + DIRP[1] * s + SPARK[o + 1] * ax * 5, m[2] + DIRP[2] * s + SPARK[o + 2] * ax * 5, 1, i % 3 ? LIME : HOT, b); }
}

/* ---------- the fall: the rod after it leaves the barrel ---------- */
const TRN = 900;
const PLASMA = (() => { const r = rng(919), A = new Float32Array(500 * 4); for (let i = 0; i < 500; i++) { const a = r() * TAU, q = Math.sqrt(r()); A[i * 4] = Math.cos(a) * q; A[i * 4 + 1] = Math.sin(a) * q; A[i * 4 + 2] = r(); A[i * 4 + 3] = r(); } return A; })();
const ROD_R = X.make(R.look(DIRP, EY), [0, 0, 0]);
function drawFall(T) {
  if (T < TX || T > TB + 3) return;
  const tau = tauOf(T), s = sOfTau(tau), vis = 1 - ss(TB, TB + 2.5, T);
  for (let i = 0; i < TRN; i++) {
    const f = (i + .5) / TRN, sp = f * L0; if (sp > s) break;
    const p = V.mad(MZ0, DIRP, sp), alt = altOf(p);
    const age = (s - sp) / 8000 + (T > TBU ? T - TBU : 0);
    const air = ss(100000, 40000, alt);
    const b = vis * (air * (.3 + .7 * Math.exp(-age / 4)) + (1 - air) * .3 * Math.exp(-age / 10));
    K.dotW(p[0], p[1], p[2], air > .3 ? 2 : 1, air > .5 && age < 3 ? HOT : LIME, b);
    if (air > .2 && (i & 1) === 0) K.glowW(p[0], p[1], p[2], 12, LIME, .12 * b * air);
  }
  if (T >= TBU) return;
  const p = V.mad(MZ0, DIRP, s), alt = altOf(p), air = ss(110000, 30000, alt), dc = V.dist(C.eye, p);
  // the rod itself (1.4 m), glowing as it enters
  if (dc < 900) { const Tw = X.make(ROD_R.R, V.mad(p, DIRP, -.7)); SM.drawRod(Tw, .15 + .8 * air, 1.5); }
  K.dotW(p[0], p[1], p[2], 2, [255, 255, 255], dc < 60 ? .6 : 1);
  K.glowW(p[0], p[1], p[2], Math.round(10 + 50 * air), air > .2 ? HOT : LIME, .35 + .45 * air);
  // the plasma sheath: a bow shock round the nose and dots streaming back
  if (air > .02) {
    const nose = V.mad(p, DIRP, .75);
    for (let i = 0; i < 500; i++) {
      const o = i * 4, back = PLASMA[o + 2] * 60 * air, rad = .15 + .5 * Math.sqrt(back) * air;
      const q = V.add(nose, V.add(V.mul(DIRP, -back), V.add(V.mul(PXP, PLASMA[o] * rad), V.mul(PYP, PLASMA[o + 1] * rad))));
      K.dotW(q[0], q[1], q[2], 1, PLASMA[o + 3] < .4 ? LIME : HOT, air * (1 - PLASMA[o + 2]) * .95);
    }
    for (let k = 0; k < 4; k++) { const bk = k * .25, c = V.mad(nose, DIRP, -bk); K.ringW(c, PXP, PYP, .2 + .55 * Math.sqrt(bk + .05) * air, 80, 1, k ? LIME : HOT, .9 * air * (1 - k / 5), T * 5 + k); }
  }
}
/* ---------- the burst 9 km above the battery, the lightning storm ---------- */
const BOLT = new K.Bolt({ top: B_TOP, hit: HIT, seed: 2207, depth: 8, nb: 14, rough: .6, spark: 40 });
const STORM = (() => {
  const r = rng(6161), out = [];
  const ts = [.28, .5, .74, 1.02, 1.36, 1.72, 2.2, 2.7];
  for (let k = 0; k < ts.length; k++) {
    const a = r() * TAU, d = 60 + 180 * Math.sqrt(r()), hx = HITL[0] + Math.cos(a) * d, hz = HITL[2] + Math.sin(a) * d, gy = Math.max(0, SITE.ground(hx, hz));
    const top = V.add(B_TOP, [(r() - .5) * 1600, (r() - .5) * 700, (r() - .5) * 1600]);
    out.push({ t: ts[k], bolt: new K.Bolt({ top, hit: [hx, gy, hz], seed: 3300 + k * 17, depth: 8, nb: 6, rough: .6, spark: 26 }), hitL: [hx, gy, hz] });
  }
  return out;
})();
const BURST = (() => { const r = rng(515), A = new Float32Array(1600 * 4); for (let i = 0; i < 1600; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h; A[i * 4 + 1] = u; A[i * 4 + 2] = Math.sin(a) * h; A[i * 4 + 3] = .45 + .55 * r(); } return A; })();
function drawBurst(T) {
  const a = T - TBU; if (a < 0 || a > 7) return;
  const p = B_TOP, R0 = 650 * (1 - Math.exp(-a * 2.2)), A = Math.max(0, 1 - a / 7);
  if (a < .6) K.glowW(p[0], p[1], p[2], Math.round(80 + 320 * Math.exp(-a * 5)), HOT, Math.min(1, 1.1 * Math.exp(-a * 3.5)));
  K.glowW(p[0], p[1], p[2], 160, LIME, .3 * A);
  for (let i = 0; i < 1600; i++) { const o = i * 4, rr = R0 * BURST[o + 3]; K.dotW(p[0] + BURST[o] * rr, p[1] + BURST[o + 1] * rr * .55 - 60 * a * a * BURST[o + 3], p[2] + BURST[o + 2] * rr, i % 6 ? 1 : 2, i % 3 ? LIME : HOT, A * (.35 + .65 * BURST[o + 3]) * (a < 2 ? 1 : .7)); }
  // lightning inside the cloud: arcs flashing between points of the shell
  const fr = Math.floor(T * 24), n = a < 4.5 ? 10 : 3;
  for (let i = 0; i < n; i++) {
    const i1 = Math.floor(K.hh(i * 3.1, fr) * 1600), i2 = Math.floor(K.hh(i * 7.9 + 2, fr) * 1600); if (K.hh(i * 5.5, fr) > .55) continue;
    const r1 = R0 * BURST[i1 * 4 + 3] * .8, r2 = R0 * BURST[i2 * 4 + 3] * .8;
    CQ[0] = p[0] + BURST[i1 * 4] * r1; CQ[1] = p[1] + BURST[i1 * 4 + 1] * r1 * .55; CQ[2] = p[2] + BURST[i1 * 4 + 2] * r1;
    CR[0] = p[0] + BURST[i2 * 4] * r2; CR[1] = p[1] + BURST[i2 * 4 + 1] * r2 * .55; CR[2] = p[2] + BURST[i2 * 4 + 2] * r2;
    K.arcW(CQ, CR, i * 17 + 5, T, .7 * A + .2, .25, LIME);
  }
}
function drawStorm(T) {
  const tb = T - TB; if (tb < -.5 || tb > 5) return;
  for (const sb of STORM) {
    const a = tb - sb.t, lead = .32;
    if (a < -lead || a > 1.4) continue;
    if (a < 0) { const c = a + lead, reach = Math.pow(E.sat(Math.floor(c / .05) * .05 / lead), 1.1); sb.bolt.draw(reach, .45, true, -1); continue; }
    const I = K.Bolt.stroke(a); sb.bolt.draw(1, I * .9, false, -1); sb.bolt.sparks(a);
    if (a < .5) SITE.ringG(sb.hitL, 50 * E.outCubic(a / .5), HOT, .8 * (1 - a / .5), 2);
  }
}
/* the strike on the ground: shock rings over the whole scan area, the blast ring and dust, the shock dome */
const DUST = (() => { const r = rng(4141), A = new Float32Array(1600 * 4); for (let i = 0; i < 1600; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r(); A[i * 4 + 2] = r(); A[i * 4 + 3] = r(); } return A; })();
const DOME = (() => { const r = rng(4242), A = new Float32Array(1100 * 3); for (let i = 0; i < 1100; i++) { const u = r(), a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(a) * h; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(a) * h; } return A; })();
const SHOCK = [[0, 330, 2.1, HOT, 2], [.1, 300, 1.7, LIME, 2], [.26, SCAN_R, 1.25, LIME, 2], [.5, 215, 1.05, HOT, 1], [.85, 175, .9, LIME, 1], [1.3, 130, .8, LIME, 1]];
function drawStrike(T) {
  const tb = T - TB; if (tb < 0 || tb > 14) return;
  for (const [t0, Rm, k, col, sz] of SHOCK) {
    const a = tb - t0; if (a < 0 || a > 3.2) continue;
    const rad = Rm * (1 - Math.exp(-a * 2.4 / k)), al = (1 - a / 3.2) * (a < .05 ? a / .05 : 1);
    SITE.ringG(HITL, rad, col, .95 * al, sz);
  }
  if (tb < 3.5) {
    const rb = 120 * (1 - Math.exp(-tb * 3.2)), al = 1 - tb / 3.5;
    for (let i = 0; i < 1600; i++) {
      const o = i * 4, ang = DUST[o], rr = rb * (.8 + .25 * DUST[o + 1]), x = HITL[0] + Math.cos(ang) * rr, z = HITL[2] + Math.sin(ang) * rr;
      const gy = SITE.groundP(rr, ang), h = (2 + 14 * DUST[o + 2]) * Math.sin(Math.min(PI, tb * 2.2 + DUST[o + 3])) * (1 - tb / 3.5);
      K.dotW(x, gy + Math.max(.3, h), z, i % 7 ? 1 : 2, DUST[o + 3] < .3 ? LIME : WH, al * (.35 + .5 * DUST[o + 2]));
    }
  }
  if (tb < 1.3) { const rd = 360 * (1 - Math.exp(-tb * 3.4)), al = .5 * (1 - tb / 1.3); for (let i = 0; i < 1100; i++) { const o = i * 3; K.dotW(HIT[0] + DOME[o] * rd, HIT[1] + DOME[o + 1] * rd * .7, HIT[2] + DOME[o + 2] * rd, 1, i % 4 ? LIME : HOT, al * (.4 + .6 * DOME[o + 1])); } }
  const ea = ss(2.6, 3.4, tb) * (1 - ss(12, 13.5, tb));
  if (ea > .01) for (let k = 0; k < 720; k++) { if (k % 12 > 7) continue; const t = k / 720 * TAU + tb * .02, x = HITL[0] + Math.cos(t) * SCAN_R, z = HITL[2] + Math.sin(t) * SCAN_R; K.dotW(x, SITE.groundP(SCAN_R, t) + .5, z, 2, LIME, .7 * ea); }
  if (tb < 2) K.glowW(HIT[0], HIT[1] + 3, HIT[2], Math.round(80 + 300 * Math.exp(-tb * 3)), HOT, .9 * Math.exp(-tb * 1.8));
}

/* ---------- camera ---------- */
const LK = (t, e, g, fov) => ({ t, eye: e, target: g, fov });
const CK = (t, e, g, fov) => LK(t, cv(e), cv(g), fov);
const UPA = V.norm(V.sub(A0, CE)), BH = V.norm(V.sub(D1, V.mul(UPA, V.dot(D1, UPA)))), SH = V.cross(UPA, BH);
const AW = (fwd, side, up) => V.add(A0, V.add(V.mul(BH, fwd), V.add(V.mul(SH, side), V.mul(UPA, up))));
function camRide(T) {
  const q = qRide(T), h = hOf(q), c = V.mad(A0, D1, q), w = ss(RIDE0 + .3, RIDE0 + 2.2, T);
  const eye = V.add(c, V.add(V.mul(SIDE, (.75 + .2 * w) * h), V.add(V.mul(D1, (.2 + 1.15 * w) * h), V.mul(UPA, .15 * h))));
  const tg = V.add(V.mad(c, D1, .35 * h), V.mul(UPA, -.25 * h * w));
  return { eye, target: V.lerp(tg, SAT, ss(RIDE1 - 4.2, RIDE1 - .6, T)), fov: (50 + 4 * w) * DEG };
}
const RS = camRide(RIDE0 + .5), RE_ = camRide(RIDE1);
const PATH_A = FILM.path([
  CK(0, [300, 110, 260], [10, 25, -10], 40),
  CK(2.2, [150, 66, 70], [31, 52, -27], 24),
  CK(4.4, [104, 74, 8], [31.6, 55, -28.5], 24),
  CK(6.2, [300, 320, -110], [0, 10, -40], 50),
  CK(7.4, [-60, 360, -460], [10, 10, 0], 52),
  LK(9.3, AW(-120, -150, 30), AW(12, 0, 24), 60),
  LK(11.0, AW(-90, -140, 15), AW(15, 0, 28), 60),
  LK(12.0, AW(-60, -70, -12), AW(40, -5, 60), 52),
  { t: RIDE0 + .5, eye: RS.eye, target: RS.target, fov: RS.fov / DEG },
]);
// the satellite, dormant frame (wake, deploy, power, load)
const PATH_W = FILM.path([
  { t: RIDE1, eye: RE_.eye, target: RE_.target, fov: RE_.fov / DEG },
  LK(20.7, SW([9.5, -5.5, 8.5]), SW([0, -.6, -2.4]), 48),
  LK(22.2, SW([7.6, 4.4, 1.2]), SW([2.8, .2, -4.9]), 46),
  LK(24.7, SW([10.5, 9.8, 6.5]), SW([5.8, 0, -4.9]), 56),
  LK(26.3, SW([14.5, 3.8, 9.5]), SW([0, 1.4, 6.8]), 56),
  LK(27.4, SW([11, -3.6, 15]), SW([0, -.8, 11.2]), 52),
  LK(28.3, SW([3.1, -1.1, 10.4]), SW([0, -.3, 12]), 50),
  LK(29.9, SW([10.5, 6.8, 4.2]), SW([0, 0, -3.6]), 54),
  LK(31.1, SW([6.6, -3.1, -1.2]), SW([.3, -.4, -4.9]), 50),
  LK(33.7, SW([5.9, -2.9, -2.6]), SW([.2, -.35, -4.6]), 48),
  LK(34.8, SW([3.9, -2.3, -.9]), SW([0, -.8, -3.0]), 50),
  LK(35.4, SW([4.0, -2.2, .6]), SW([0, -.6, 3.0]), 52),
  LK(36.3, SW([6.2, -2.4, 5.0]), SW([0, -.4, 9.0]), 56),
  LK(37.0, SW([6.8, -2.0, 7.5]), SW([0, -.3, 11.5]), 56),
  LK(37.9, SW([3.3, -2.5, .9]), SW([0, -.7, -1.5]), 52),
  LK(38.5, SW([3.9, -1.2, .1]), SW([0, -.4, -1.2]), 52),
  LK(39.3, SW([4.2, .5, -.3]), SW([0, -.3, -.8]), 52),
  LK(40.8, SW([2.9, 1.0, .2]), SW([0, 0, -.5]), 48),
]);
// the slew, watched from a point fixed in space
const EYE_SLEW = SW([-26, 13, 28]);
const camSlew = T => { const Wt = SATW; return { eye: EYE_SLEW, target: X.ap(Wt, [0, 0, 5]), fov: 48 * DEG }; };
// charge, in the aimed frame
const PATH_C = FILM.path([
  LK(44.1, S1W([3.5, 2.1, -3.6]), S1W([0, 0, 7]), 52),
  LK(46.3, S1W([4.3, 2.4, 5.4]), S1W([0, 0, 10]), 50),
  LK(48.3, S1W([4.1, -1.9, 12.6]), S1W([0, 0, 9]), 50),
  LK(TF, S1W([2.7, 1.3, -2.6]), S1W([0, 0, 3]), 50),
]);
function camTransit(T) { const z = rodZof(T); return { eye: S1W([2.7, 1.3, z - 2.5]), target: S1W([0, 0, z + 3]), fov: 50 * DEG }; }
function camChase(T, d, sd, up, lookAhead) {
  const p = rodAt(T);
  return { eye: V.add(p, V.add(V.mul(DIRP, -d), V.add(V.mul(X1, sd), V.mul(Y1, up)))), target: V.mad(p, DIRP, lookAhead), fov: 50 * DEG };
}
// after the shot: back and up behind the satellite, looking down the line; the lens closes on the rod as it goes
const E_TR = camTransit(TX), E_L = S1W([7, 9.5, -27]);
function camLaunch(T) {
  const u = kk(T, TX - .05, TX + 1.5), eye = V.lerp(E_TR.eye, E_L, u);
  const tg = V.lerp(V.lerp(E_TR.target, S1W([0, 0, 40]), u), rodAt(T), ss(TX + .6, TX + 1.8, T));
  return { eye, target: tg, fov: E.mix(50, 9, ss(TX + 1.4, 53.4, T)) * DEG };
}
const MID = V.mad(MZ0, DIRP, L0 * .45), UPM = V.norm(V.sub(MID, CE)), WIDE_E = V.add(MID, V.add(V.mul(X1, 95000), V.mul(UPM, 75000)));
function camWide(T) { const p = rodAt(T); return { eye: WIDE_E, target: V.lerp(p, MID, .2), fov: 46 * DEG }; }
function camChaseB(T) { const Tc = T < 57.5 ? T : 57.5 + (1 - Math.exp(-(T - 57.5) * 1.6)) / 1.6; return camChase(Tc, 16, 5, 2.4, 60); }
// the strike and the scan (az, el, distance round the strike point)
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
const EFALL = camChaseB(TBU + .3).eye, DIR0 = V.norm(V.sub(EFALL, HIT)), AZ0 = Math.atan2(DIR0[0], DIR0[2]), D_0 = V.dist(EFALL, HIT);
function camScan(T) {
  const tb = T - TB;
  const az = AZ0 + 30 * DEG * ss(-1, 12, tb), el = E.mix(Math.asin(DIR0[1]), 24 * DEG, ss(-1.1, 1.4, tb));
  const push = ss(1.8, 5.0, tb) * (1 - ss(8.4, 12.6, tb));
  const dist = K.logMix(K.logMix(D_0, 900, ss(-1.1, 1.3, tb)), 160, push);
  const eye = V.add(HIT, V.mul(sph(az, E.mix(el, 26 * DEG, push)), dist));
  const target = V.lerp(V.lerp(V.lerp(B_TOP, HIT, ss(TBU + .2, TB + .6, T)), S_LOOK, ss(1.8, 4, tb)), [30, 0, 10], ss(9.4, 12, tb));
  return { eye, target, fov: E.mix(E.mix(40, 44, ss(-1, 1, tb)), 30, push) * DEG };
}
const SCK = t => { const c = camScan(t); return { t, eye: c.eye, target: c.target, fov: c.fov / DEG }; };
const PATH_E = FILM.path([
  SCK(T_CALM - .6), SCK(T_CALM + .4),
  LK(70.4, [-420, 950, 950], [500, 0, -2300], 46),
  LK(73.2, [500, 620, -1900], [1400, 20, -5000], 42),
  LK(75.6, cv([900, 380, 700]), cv([0, 20, 0]), 42),
  CK(77.6, [520, 170, 420], [10, 25, -10], 40),
  CK(DUR, [300, 110, 260], [10, 25, -10], 40),
]);
const DBGCAM = (() => { const q = STAGE.Q.get('cam'); return q ? q.split(',').map(Number) : null; })();
function camAt(T) {
  if (DBGCAM) return { eye: (T > SLEW[1] ? S1W : SW)(DBGCAM.slice(0, 3)), target: (T > SLEW[1] ? S1W : SW)(DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 40) * DEG };
  if (T < RIDE0 - .2) return PATH_A(T);
  if (T < RIDE0 + .5) return K.blendShot(PATH_A(T), camRide(T), ss(RIDE0 - .2, RIDE0 + .5, T));
  if (T < RIDE1) return camRide(T);
  if (T < 40.8) return PATH_W(T);
  if (T < 42.0) return K.blendShot(PATH_W(T), camSlew(T), ss(40.8, 42.0, T));
  if (T < 44.0) return camSlew(T);
  if (T < 44.6) return K.blendShot(camSlew(T), PATH_C(T), ss(44.0, 44.6, T));
  if (T < TF) return PATH_C(T);
  if (T < TX) return camTransit(T);
  if (T < 53.4) return camLaunch(T);
  if (T < 54.2) return K.blendShot(camLaunch(T), camWide(T), ss(53.4, 54.2, T));
  if (T < 55.2) return camWide(T);
  if (T < 56.0) return K.blendShot(camWide(T), camChaseB(T), ss(55.2, 56.0, T));
  if (T < TBU) return camChaseB(T);
  if (T < TBU + .6) return K.blendShot(camChaseB(T), camScan(T), ss(TBU, TBU + .6, T));
  if (T < T_CALM) return camScan(T);
  return PATH_E(T);
}

/* ---------- clocks: the sim clock (rate on screen), the sea's own clock ---------- */
const SLOW = 1e-6;
const WARP = FILM.warp([{ t: 0, rate: 1 }, { t: 9.0, rate: 1 }, { t: 9.3, rate: SLOW }, { t: T_ARR, rate: SLOW }, { t: T_ARR + .5, rate: 8 }, { t: T_CHG - .2, rate: 8 }, { t: T_CHG + .2, rate: 1 }, { t: TF - .02, rate: 1 }, { t: TF + .02, rate: RATE_TR }, { t: TX, rate: RATE_TR }]);
const simClock = T => T <= TX ? WARP(T) - WARP(TF) : T <= TBU ? WARP(TX) - WARP(TF) + tauOf(T) : WARP(TX) - WARP(TF) + TAU_END + (T - TBU);
const rateOf = T => T < TX ? WARP.rate(T) : T < TBU ? fallRate(T) : 1;
const SEA = integ(t => 1 - .97 * ss(9.0, 9.3, t) * (1 - ss(RIDE1, RIDE1 + .6, t)), 0, DUR, 40);
const C_LIGHT = 299792458;

/* ---------- tags ---------- */
const T_CV = K.mkTag(), T_48 = K.mkTag(), T_SAT = K.mkTag(), T_P = K.mkTag(), T_ROD = K.mkTag();
const RDW = 1.15;
const PTAGS = [
  ['01', 'ROOT HINGE · PACK OF 4', '', P => P.yokes[0], [0, 0, .6], 21.0, 22.2],
  ['02', 'RADIATORS ×2', '', P => P.rads[0], [RDW * .8, 0, -3.5], 21.8, 22.9],
  ['03', 'SOLAR WING · 4 PANELS', '9.2 M', P => P.panels[2], [PW * .5, 0, PL / 2], 22.6, 24.8],
  ['04', 'UPLINK DISH · 12 RIBS', '', P => P.dish, [1.0, -.35, 0], 23.6, 24.8],
  ['05', 'BARREL · 3 SEGMENTS', '18 M', P => P.segs[1], [0, .4, 3], 25.2, 26.4],
  ['06', 'HINGE PIN', '', P => P.hinges[2], [.46, -SM.HH, 0], 26.9, 27.6],
  ['07', 'LOCK COLLAR', '', P => P.collars[1], [0, .38, .23], 27.9, 28.5],
  ['08', 'SOLAR ARRAYS · 34 KW', '', P => P.panels[3], [PW * .5, 0, 0], 29.0, 30.6],
  ['09', 'POWER CONDITIONING', '', P => P.WB, [.7, .25, -6.6], 30.2, 31.8],
  ['10', 'CAPACITOR BANK · 8 MODULES', '96 MJ', P => P.capm[5], [.25, .8, 0], 32.0, 34.2],
  ['11', 'REACTION WHEELS ×4', '', P => P.wheels[1], [.25, 0, 0], 31.0, 32.6],
  ['12', 'CONTACTORS ×6', '', P => P.cont[4], [0, .2, 0], 34.3, 35.5],
  ['13', 'MAGAZINE · 5 RODS', '', P => P.drum, [.84, 0, -1.4], 37.4, 38.3],
  ['14', 'RAMMER · 3 STAGES', '', P => P.ramh, [0, .09, .9], 38.3, 39.2],
  ['15', 'BREECH BLOCK', 'LOCKED', P => P.block, [.2, .2, -.3], 40.0, 40.8],
  ['16', 'COILS ×12', '', P => P.coils[5], [0, .55, 0], 44.9, 46.8],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
function partTags(T, P) {
  for (const t of PTAGS) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const p = X.ap(t.fr(P), t.at); if (!K.pj(p[0], p[1], p[2]) || !K.onS(-40)) continue;
    const x = K.PJ[0], y = K.PJ[1], dx = x > 1100 ? 54 : -54, lx = x + dx;
    K.leader(x, y, lx, y - 50, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    const w = K.tagW(t.tg);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .7), T, +t.id), t.val, 'lime sm', dx > 0 ? lx + 4 : lx - 4 - w, y - 62, a);
  }
}
function markTags(T) {
  const cb = K.boxOf([-40, 0, -166], [37, 60, 166], CVX, 4);
  if (cb && (T < 8.8 || T > 72)) {
    const a = T < 8.8 ? 1 - ss(8.0, 8.8, T) : ss(73, 74.5, T);
    if (cb[2] - cb[0] < 700) { K.bracket(cb, '#C6F432', .7 * a, 10, 1.2); K.setTag(T_CV, 'CVN', 'NIMITZ CLASS', '332.8 M', 'lime sm', cb[0], cb[1] - 24, a); }
  }
  if (T > T_RW + .3 && T < 8.2) {
    const p = X.ap(XF48(T), [0, 5.5, 0]);
    if (K.pj(p[0], p[1], p[2]) && K.onS(-60)) { const a = ss(T_RW + .3, T_RW + .6, T) * (1 - ss(7.7, 8.2, T)); K.leader(K.PJ[0], K.PJ[1], K.PJ[0] + 50, K.PJ[1] - 56, '#C6F432', .8 * a); K.setTag(T_48, 'RDR', K.decode('AN/SPS-48E · 3D AIR SEARCH', E.sat((T - T_RW - .3) / .8), T, 4), `${Math.round(om48(T) / TAU * 60)} RPM`, 'lime sm', K.PJ[0] + 54, K.PJ[1] - 70, a); }
  }
  if ((T > RIDE0 + 3 && T < RIDE1 + 1) || (T > 40.6 && T < 44.4)) {
    const b = K.boxOf([-11, -2, -7.5], [11, 3.6, T > 40 ? 18.6 : 6.5], SATW, 3);
    if (b) { const px = Math.max(b[2] - b[0], b[3] - b[1]); if (px < 260) { const a = (1 - ss(180, 260, px)) * (T < 40 ? ss(RIDE0 + 3, RIDE0 + 3.6, T) : ss(41.8, 42.4, T) * (1 - ss(43.9, 44.3, T))); K.bracket(b, '#C6F432', .85 * a, 6, 1.2); K.setTag(T_SAT, 'SAT', T < T_ARR ? 'DORMANT' : T < 40 ? 'WAKING' : 'SLEWING', `${Math.round(ALT / 1000)} KM`, 'lime sm', b[2] + 8, b[1] - 4, a); } }
  }
  if (T > RIDE0 + .4 && T < T_ARR - .3) {
    const f = frontOf(2, T), c = V.mad(A0, D1, f), rho = Math.max(2.6, f * TA);
    if (K.pj(c[0] + U1[0] * rho, c[1] + U1[1] * rho, c[2] + U1[2] * rho) && K.onS(-40)) { const a = ss(RIDE0 + .4, RIDE0 + .8, T) * (1 - ss(T_ARR - 1, T_ARR - .3, T)); K.setTag(T_P, 'P3', 'PULSE 3/3', `${(f / 1000).toFixed(1)} KM`, 'lime sm', K.PJ[0] + 12, K.PJ[1] - 12, a); }
  }
  if (T > TX + .2 && T < TBU - .1) {
    const p = rodAt(T);
    if (K.pj(p[0], p[1], p[2]) && K.onS(-40)) { const a = ss(TX + .2, TX + .6, T) * (1 - ss(TBU - .5, TBU - .1, T)); K.leader(K.PJ[0], K.PJ[1], K.PJ[0] + 40, K.PJ[1] - 44, '#C6F432', .8 * a); K.setTag(T_ROD, 'ROD', `ALT ${(altOf(p) / 1000).toFixed(1)} KM`, `${(vOfTau(tauOf(T)) / 1000).toFixed(1)} KM/S`, 'lime sm', K.PJ[0] + 44, K.PJ[1] - 58, a); }
  }
}

/* ---------- readout ---------- */
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
const slowTxt = r => { const inv = 1 / r; return inv >= 1e6 ? `×1/${(inv / 1e6).toFixed(1)}M` : inv >= 1e3 ? `×1/${Math.round(inv / 1e3)}k` : `×1/${Math.round(inv)}`; };
function readout(T) {
  const ci = CHAPTERS.reduce((a, c, i) => c.t <= T ? i : a, 0);
  const kt = `${String(ci + 1).padStart(2, '0')} · ${CHAPTERS[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2, l3 = null;
  const brg = ((Math.atan2(D1[0], D1[2]) / DEG) + 360) % 360;
  if (T < T_RW || T > 78) { l1 = 'CVN · <b>Nimitz class</b>'; l2 = 'AN/SPS-48E <b>standby</b>'; }
  else if (T < 8.9) { l1 = `AN/SPS-48E · <b>${Math.round(om48(T) / TAU * 60)} rpm</b>`; l2 = T < 7.2 ? 'Sweep <b>360°</b> · range <b>220 km</b>' : `Lock · brg <b>${Math.round(brg)}°</b> el <b>${(EL_D1 / DEG).toFixed(0)}°</b>`; }
  else if (T < RIDE0 + .3) { const n = TE.filter(t => T >= t).length; l1 = `Uplink · pulse <b>${n}/3</b>`; l2 = `Satellite · brg <b>${Math.round(brg)}°</b> · <b>${km(S_UP)} km</b>`; }
  else if (T < T_ARR) {
    const f = frontOf(2, T), alt = V.dist(V.mad(A0, D1, f), CE) - RE, v = (frontOf(2, T + .01) - frontOf(2, T - .01)) / .02;
    l1 = `Pulse 3 · alt <b>${km(Math.max(0, alt))} km</b>`; l2 = `+<b>${(f / C_LIGHT * 1000).toFixed(3)} ms</b> · c`;
    l3 = `<span class="l">slow ${slowTxt(Math.max(1e-9, v / C_LIGHT))}</span>`;
  }
  else if (T < TW.root[0]) { l1 = `Satellite · <b>${km(ALT)} km</b> · waking`; l2 = `Status <b>${Math.min(12, Math.max(0, Math.floor((T - T_ARR - .15) / .07) + 1))}/12</b> · restraints <b>${T > TW.pins ? 'fired' : 'set'}</b>`; }
  else if (T < XR[0]) {
    const np = 1 + ST.pan.filter(f => f > .98).length;
    l1 = T < TW.segB[0] ? `Wings · <b>${ST.root > .98 ? np : 0}/4</b> panels` : `Barrel · <b>${ST.segC > .98 ? 3 : ST.segB > .98 ? 2 : 1}/3</b> segments`;
    l2 = T < TW.segB[0] ? `Radiators <b>${Math.round(ST.rad * 100)} %</b> · dish <b>${Math.round(ST.dish * 100)} %</b>` : `Lock collars <b>${(ST.latchB > .98) + (ST.latchC > .98)}/2</b> · length <b>${(6 + 6 * ST.segB + 6 * ST.segC).toFixed(1)} m</b>`;
  }
  else if (T < XRB[0]) { let e = 0; for (let i = 0; i < 8; i++) e += capFill(T, i) * 12; const nm = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => capFill(T, i) > .99).length; l1 = `Bank · <b>${nm}/8</b> modules · <b>${e.toFixed(1)} MJ</b>`; l2 = T < T_SW0 ? `Wheels <b>${Math.round(6000 * ss(28.6, 31.6, T))} rpm</b>` : `Contactors <b>${ST.sw.filter(s => s > .98).length}/6</b> closed`; }
  else if (T < SLEW[0] - .1) { l1 = T < T_RAM[0] ? `Magazine · <b>5 rods</b> · index` : T < T_BLK[0] ? `Rammer · <b>${Math.round(ST.ram * 100)} %</b>` : `Breech · <b>${ST.lugs > .98 ? 'locked' : 'closing'}</b>`; l2 = `Rod · <b>1.4 m</b> · ${ST.rodOut ? 'chambered' : 'in magazine'}`; }
  else if (T < T_CHG) { const togo = Math.acos(E.clamp(V.dot(X.dir(SATW, [0, 0, 1]), AIM), -1, 1)) / DEG; l1 = `Slew · <b>${togo.toFixed(0)}°</b> to go`; l2 = `Target · <b>${km(V.dist(SAT, HIT))} km</b> slant`; }
  else if (T < TF) { const n = [...Array(12).keys()].filter(j => T > coilT(j)).length; l1 = `Coils · <b>${n}/12</b> energised`; l2 = `Bank <b>96 MJ</b> · fire in <b>${Math.max(0, TF - T).toFixed(1)} s</b>`; }
  else if (T < TX) { const z = rodZof(T), a = E.sat((T - TF) / TR_D); l1 = `Rod · <b>${Math.max(0, z + .1).toFixed(1)} m</b> of 18.6`; l2 = `<b>${(V_MZ * a / 1000).toFixed(2)} km/s</b> · +<b>${((T - TF) * RATE_TR * 1000).toFixed(1)} ms</b>`; }
  else if (T < TBU) { const p = rodAt(T); l1 = `Rod · alt <b>${km(altOf(p))} km</b>`; l2 = `<b>${(vOfTau(tauOf(T)) / 1000).toFixed(1)} km/s</b> · ${altOf(p) < 100000 ? 'entry' : 'coast'}`; }
  else if (T < TB) { l1 = `Burst · <b>${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - TBU - .08) / LEAD))} %</b>`; }
  else if (T < T_CALM) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · r <b>${SCAN_R} m</b> · <b>5×</b> area`; l2 = `Identified <b>${n}/${SITE.V.length}</b>`; }
  else { l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = 'Satellite <b>cooldown</b>'; }
  if (!l3) { const rate = rateOf(T); l3 = `${K.fmtClock(simClock(T))} · ${rate > 1.5 ? `<span class="l">×${Math.round(rate)}</span>` : rate < .5 ? `<span class="l">${slowTxt(rate)}</span>` : '×1'}`; }
  const html = `${l1}<br>${l2}<br>${l3}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const L_SUN = V.norm(V.add(V.mul(EY, .45), V.add(V.mul(EX, .7), V.mul(EZ, -.35)))), L_SITE = [-.4, .6, -.7];
let NP = 0, STATS = null;
const PROF = STAGE.Q.has('prof') ? {} : null; let PT = 0;
function prof(n) { const t = performance.now(); if (n) PROF[n] = (PROF[n] || 0) + t - PT; PT = t; }
const DRAWO = {};
function render(T) {
  if (PROF) prof(null);
  K.beginTags();
  const st = stateAt(T);
  satXf(T);
  FILM.apply(C, camAt(T));
  const tb = T - TB, ax = T - TX;
  C.shake = ax > 0 && ax < .9 ? FILM.shake(T, 5 * (1 - ax / .9), 24) : tb > 0 && tb < 1.2 ? FILM.shake(T, 7 * (1 - tb / 1.2), 22) : T > TF && T < TX ? FILM.shake(T, 1.2, 30) : [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? .05 : .1; C.update();
  K.pb.clear();
  K.occReset();
  const nearSat = V.dist(C.eye, SAT) < 150000;
  const xr = kk(T, XR[0], XR[1]) * (1 - kk(T, XR[2], XR[3])), xrB = kk(T, XRB[0], XRB[1]) * (1 - kk(T, XRB[2], XRB[3]));
  const P = nearSat ? SM.pose(SATW, st) : null;
  if (P) SM.occlude(P, st, xr);
  K.drawStars(STARS, .9, T);
  if (PROF) prof('stars');
  const seaT = SEA(T);
  drawGlobe(1, tb > -.4 && tb < 6 ? (tb < 0 ? 1 + tb / .4 : 1 - tb / 6) * .9 : 0); drawLimb(1);
  if (PROF) prof('globe');
  K.setLight(L_SITE);
  if (alt < 900000) SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null, 1, seaT);
  if (PROF) prof('ground');
  if (alt < 300000) drawCSea(T, seaT, 1 - .3 * ss(1500, 6000, alt));
  if (V.dist(C.eye, CVX.T) < 60000) drawCarrier(T);
  if (PROF) prof('carrier');
  drawSweep(T);
  for (let k = 0; k < 3; k++) drawPulse(k, T);
  if (PROF) prof('pulses');
  if (alt < 60000) SITE.drawVehicles(T > TB - 1 ? tb : null);
  if (PROF) prof('vehicles');
  if (P) {
    K.setLight(L_SUN);
    const ra = T - T_ARR, sa = T - XR[0] - .2, la = T - T_LUG[1];
    const rip = ra > -.1 && ra < 3.5 ? { p: P.hornTip, age: ra, v: 5, after: .2 * Math.exp(-ra) } : sa > 0 && sa < 3.5 ? { p: X.ap(P.WB, [0, 0, -4.9]), age: sa, v: 3.2, after: .06 } : la > 0 && la < 2.5 ? { p: X.ap(P.WB, [0, 0, -.3]), age: la, v: 4, after: 0 } : null;
    const panLit = DRAWO.panLit || (DRAWO.panLit = new Array(8).fill(0)), capF = DRAWO.capF || (DRAWO.capF = new Array(8).fill(0)), coilL = DRAWO.coilL || (DRAWO.coilL = new Array(12).fill(0)), swL = DRAWO.swL || (DRAWO.swL = new Array(6).fill(0)), hingeL = DRAWO.hingeL || (DRAWO.hingeL = [0, 0]);
    const pw = ss(T_WAVE, T_WAVE + 1, T) * (1 - ss(TX, TX + 2, T));
    for (let k = 0; k < 8; k++) { const j = k % 4, tw = T_WAVE + (3 - j) * .22; panLit[k] = Math.max(.22 * pw, T > tw ? .9 * Math.exp(-(T - tw) * 3) : 0); }
    for (let i = 0; i < 8; i++) capF[i] = capFill(T, i);
    for (let j = 0; j < 12; j++) coilL[j] = coilLit(T, j);
    for (let i = 0; i < 6; i++) { const tc = T_SW0 + i * SW_DT + .1; swL[i] = T > tc ? Math.min(1, .4 + .6 * Math.exp(-(T - tc) * 5)) * (1 - ss(TX, TX + 1, T)) : 0; }
    const mvB = ss(TW.segB[0], TW.segB[0] + .2, T) * (1 - ss(TW.latchB[1], TW.latchB[1] + .6, T)), mvC = ss(TW.segC[0], TW.segC[0] + .2, T) * (1 - ss(TW.latchC[1], TW.latchC[1] + .6, T));
    hingeL[0] = .5 * mvB + .6 * flash(T, TW.latchB[1], 4); hingeL[1] = .5 * mvC + .6 * flash(T, TW.latchC[1], 4);
    const chg = ss(T_CHG, TF, T) * (1 - ss(TF, TX + 1, T));
    Object.assign(DRAWO, {
      xr, xrB, rip, panLit, capFill: capF, coilLit: coilL, swLit: swL, hingeLit: hingeL,
      pcuLit: ss(T_HARN + .5, T_HARN + 1, T) * (1 - ss(TX, TX + 1, T)) * (.8 + .2 * K.hh(3, Math.floor(T * 20))), busLit: ss(T_CAP0 - .3, T_CAP0, T) * (1 - ss(TX, TX + 1, T)),
      wheelLit: ss(28.6, 31.6, T), railLit: .45 * chg + (T > TF && T < TX + .5 ? .5 : 0), crownLit: .8 * ss(T_CD, TF, T) * (1 - ss(TX, TX + 1.5, T)),
      rodLit: T > T_LUG[1] ? .45 + .4 * chg : 0, blockLit: T > T_LUG[0] ? Math.max(.3, flash(T, T_LUG[1], 4)) : 0,
      hornLit: ra > 0 && ra < 1.2 ? 1 - ra / 1.2 : 0, radLit: .15 * ss(30, 33, T) * (1 - ss(TX, TX + 3, T)),
    });
    DRAWO.stats = STATS; SM.draw(P, st, DRAWO);
    if (PROF) prof('sat');
    drawLights(T, P); drawTies(T, P); drawHingeFx(T, P); drawPuffs(T, P);
    drawPower(T, P, xr); drawCharge(T, P); drawShot(T, P);
    if (T > T_ARR && T < T_ARR + 1.2) { const h = P.hornTip, ha = T - T_ARR; K.glowW(h[0], h[1], h[2], Math.round(20 + 90 * Math.exp(-ha * 5)), HOT, .9 * Math.exp(-ha * 3)); }
    if (PROF) prof('satfx');
    K.setLight(L_SITE);
  }
  drawFall(T);
  drawBurst(T);
  drawStrike(T);
  if (T > TB - LEAD - .1) SITE.drawBolt(BOLT, tb, LEAD);
  drawStorm(T);
  if (PROF) prof('strike');
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (ax > 0 && ax < .5) fl = .12 * Math.exp(-ax * 8);
  const bu = T - TBU; if (bu > 0 && bu < .5) fl = Math.max(fl, .12 * Math.exp(-bu * 7));
  if (tb > 0 && tb < .8) fl = Math.max(fl, .16 * Math.min(1, K.Bolt.stroke(tb)));
  for (const sb of STORM) { const a = tb - sb.t; if (a > 0 && a < .5) fl = Math.max(fl, .07 * Math.min(1, K.Bolt.stroke(a))); }
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < T_CALM + 4) SITE.overlay(T, tb, 1 - ss(T_CALM + 1, T_CALM + 3.5, T));
  if (P && V.dist(C.eye, SAT) < 120) partTags(T, P);
  markTags(T);
  if (PROF) prof('overlay');
  readout(T);
  K.pb.blit();
  if (PROF) prof('blit');
  K.endTags();
  NP = K.npts();
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
const tick = () => SFX.tone(1650, 1650, .05, 'square', .012);
const whir = d => SFX.tone(90, 150, d, 'sawtooth', .008);
const cues = [
  [T_RW, () => SFX.tone(60, 140, 2.2, 'sawtooth', .012)], [3.6, () => SFX.noise(4, 300, .6, .012, 1)],
  [T_LOCK, () => SFX.tone(1400, 1400, .12, 'square', .014)],
  ...TE.map(t => [t, () => { SFX.tone(2400, 900, .35, 'sine', .04); SFX.tone(160, 60, .5, 'sine', .04); }]),
  [RIDE0 + .4, () => SFX.noise(6, 900, .4, .02, 3)],
  [T_ARR, () => { SFX.crack(); SFX.tone(1900, 1900, .08, 'square', .02); }],
  ...[0, 1, 2, 3, 4, 5].map(k => [T_ARR + .2 + .14 * k, tick]),
  ...[0, 1, 2, 3, 4].map(k => [TW.pins + .14 * k, () => SFX.noise(.08, 3000, 1, .03, .002)]),
  [TW.root[0], () => whir(1.2)], [TW.root[1], clunk], ...TW.pan.map(w => [w[1], clunk]), [TW.pan[0][0], () => whir(2.7)],
  [TW.rad[1], clunk], [TW.dish[1], clunk], [TW.segB[0], () => SFX.tone(70, 110, 1.5, 'sawtooth', .012)], [TW.latchB[1], () => { clunk(); tick(); }],
  [TW.segC[0], () => SFX.tone(70, 110, 1.2, 'sawtooth', .012)], [TW.latchC[1], () => { clunk(); tick(); }],
  [XR[0], () => SFX.tone(800, 2400, .5, 'sine', .012)], [T_HARN, () => SFX.tone(120, 400, 2, 'sawtooth', .008)],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [T_CAP0 + k * CAP_DT + CAP_D, tick]),
  [T_CAP0, () => SFX.tone(100, 900, 4.5, 'sawtooth', .01)],
  ...[0, 1, 2, 3, 4, 5].map(i => [T_SW0 + i * SW_DT + .1, () => { SFX.crack(); }]),
  [T_IDX[0], () => whir(.8)], [T_IDX[1], clunk], [T_RAM[0], () => SFX.tone(140, 220, 1.1, 'sawtooth', .01)], [T_RAM[1], clunk], [T_BLK[1], clunk], [T_LUG[1], () => { clunk(); tick(); }],
  [SLEW[0], () => SFX.noise(.5, 2000, .6, .02, .1)], [SLEW[0] + .3, () => SFX.noise(3, 300, 1, .015, 1)], [SLEW[1] - .45, () => SFX.noise(.5, 2000, .6, .02, .1)],
  ...[...Array(12).keys()].map(j => [coilT(j), () => SFX.tone(900 + 90 * j, 900 + 90 * j, .06, 'square', .012)]),
  [COIL_T0, () => SFX.tone(120, 1600, TF - COIL_T0, 'sawtooth', .014)],
  [TF, () => { SFX.crack(); SFX.rumble(3, .22); SFX.tone(900, 60, 1.6, 'sine', .06); }],
  [TX, () => { SFX.crack(); SFX.rumble(2, .18); }],
  [TX + 2.4, () => SFX.noise(5, 1600, .5, .03, 2.5)],
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(5, .24); }],
  ...STORM.map(sb => [TB + sb.t, () => SFX.crack()]),
  ...[.4, .8, 1.3, 1.9, 2.6, 3.2, 3.9, 4.5].map(d => [TB + d + 1, tick]),
  [72, () => SFX.tone(1400, 900, .3, 'square', .01)],
];
lap('load');
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ log: LOG, np: NP, S_UP, T_ARR, TX, TAU_END, cam: T => camAt(T), stats: T => { STATS = {}; FILM.seek(T); const s = STATS; STATS = null; return s; }, prof: PROF, pose: T => { const s = stateAt(T); satXf(T); return SM.pose(SATW, s); } });
})();
