/* SCAN · SATELLITE (Point Cloud): the carrier's scan. A Nimitz-class carrier 5 km off a coastal battery. Its island
   radar (AN/SPS-48E) wakes, spins up and sweeps the sea, then stops on the bearing of a dormant satellite 420 km up
   and sends three pulses. The camera rides the third one up to orbit. The satellite wakes: status lights, the nose
   petals peel back, wings unfold, radiators, booms and the uplink dish open, a self-test X-ray pulls the bus apart
   and back, the rails telescope out and seven charge rings stack in front of the emitter, the core charges, the iris
   opens and the satellite slews onto the target. The discharge: a lime column down to the battery (the camera rides
   its head down), the lightning strike, shock rings over five times the destroyer scan's area (r 246 m against
   110 m) and the scan identifying eight vehicles. Then back out over the sea to the carrier. One take, 78 s, loops.
   The pulses and the column travel at the speed of light, shown in slow motion (the rate is on screen); the
   satellite's deployment is shown at x8. Render is a pure function of film time T. */
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
const DUR = 78;
const T_RW = 2.0, T_LOCK = 10.2, TE = [11.2, 13.6, 16.0], RIDE0 = 16.0, RIDE1 = 24.6;
const T_XR = 29.6, T_CHG = 34.2, T_AIM = 38.8, TFIRE = 42.6, DOWN0 = 42.75, DOWN1 = 48.3, LEAD = .7, TB = DOWN1 + LEAD, T_CALM = 62;
const CHAPTERS = [
  { t: 0, title: 'Carrier' }, { t: T_RW, title: 'Radar' }, { t: 10.6, title: 'Uplink' }, { t: RIDE0, title: 'Climb' },
  { t: 24.0, title: 'Wake', wake: true }, { t: T_XR, title: 'X-ray' }, { t: T_CHG, title: 'Charge' }, { t: T_AIM, title: 'Aim' },
  { t: TFIRE, title: 'Discharge' }, { t: TB, title: 'Scan' }, { t: T_CALM, title: 'Calm' },
];
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const ss = E.ss;
/* integrate a rate once so the angle is exact at any T; sc rescales it to whole turns (loops) */
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
const SCAN_R = 246;                                             // sqrt(5) x the destroyer scan's 110 m
const SITE = K.makeSite({ seaR: 14000, landR: 14000, curve: RE, scanR: SCAN_R, scanTF: 3.2, idEnd: 7.5, veh: VEH, seaHole: { x: CVP[0], z: CVP[2], r: 2600 } });
const HIT = SITE.hitW, HITL = SITE.hitL, S_LOOK = [4, 12, 16];
lap('site');
const CVX = X.make(R.y(CV_YAW), [CVP[0], -(CVP[0] * CVP[0] + CVP[2] * CVP[2]) / (2 * RE), CVP[2]]);
const cv = p => X.ap(CVX, p);
const cvDir = d => X.dir(CVX, d);

/* ---------- models ---------- */
const MOD = SSAT(K), SAT_M = MOD.sat, RAD = MOD.radar;
lap('sat+radar models');
const CVL = K.lodModel(HD.carrier(), {}, [.35, .7, 1.4, 2.8, 5.6], 501, 8, ['radars']);
lap('carrier');
const C48 = [31.6, 19.5 + 20.5 + 15.4 - .2, -28.5], C49 = [31.6, 36.9, -39.5];

/* ---------- the radar's bearing: wake, spin up (15 rpm), sweep, stop on the satellite's bearing ---------- */
// the satellite: 420 km up, 260 km downrange to the south-south-west of the battery
const TH = 260000 / RE, HD_ = V.norm([-.32, 0, -.95]);
const UP_S = V.norm([HD_[0] * Math.sin(TH), Math.cos(TH), HD_[2] * Math.sin(TH)]);
const SAT = V.add(CE, V.mul(UP_S, RE + ALT));
const EY = UP_S, EZ = V.norm(V.sub(V.sub(HIT, SAT), V.mul(UP_S, V.dot(V.sub(HIT, SAT), UP_S)))), EX = V.cross(EY, EZ);
const LW = p => [SAT[0] + EX[0] * p[0] + EY[0] * p[1] + EZ[0] * p[2], SAT[1] + EX[1] * p[0] + EY[1] * p[1] + EZ[1] * p[2], SAT[2] + EX[2] * p[0] + EY[2] * p[1] + EZ[2] * p[2]];
const faceW = phi => cv(V.add(C48, R.ap(R.y(phi), RAD.FACE_C)));
let PHI_LOCK = 0, A0 = faceW(0), D1 = [0, 1, 0];
for (let it = 0; it < 3; it++) { D1 = V.norm(V.sub(SAT, A0)); PHI_LOCK = Math.atan2(D1[0], D1[2]) - CV_YAW; A0 = faceW(PHI_LOCK); }
D1 = V.norm(V.sub(SAT, A0));
const S_UP = V.dist(A0, SAT), EL_D1 = Math.asin(V.dot(D1, V.norm(V.sub(A0, CE))));
const OM48 = TAU * 15 / 60;
const om48 = t => OM48 * ss(T_RW + .3, 3.9, t) * (1 - ss(8.1, T_LOCK, t));
const I48 = integ(om48, T_RW, T_LOCK);
const wrapPI = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const PHI_PARK = PHI_LOCK - I48.total, D_RET = wrapPI(PHI_PARK - PHI_LOCK);
const phi48 = T => T < T_LOCK ? PHI_PARK + I48(T) : PHI_LOCK + D_RET * kk(T, 64.5, 74.5);
const I49 = integ(t => TAU * 12 / 60 * ss(T_RW + .6, 4.4, t) * (1 - ss(8.4, 10.8, t)), T_RW, 10.8, TAU);
const phi49 = T => 1.1 + I49(T);
LOG.push(`slant up ${(S_UP / 1000).toFixed(1)} km, el ${(EL_D1 / DEG).toFixed(1)}`);

/* ---------- the globe (as the draft): dots on the sphere, land brighter, the coastline brightest ---------- */
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
const NGL = GL.length / 4;
lap(`globe ${NGL}`);
function drawGlobe(vis, lit) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const alt = V.dist(e, CE) - RE; if (alt < 3000) return;
  const fade = vis * E.ss(3000, 30000, alt);
  if (fade < .01) return;
  for (let k = 0; k < NGL; k++) {
    const j = k * 4, px = GL[j], py = GL[j + 1], pz = GL[j + 2];
    const dx = px - e[0], dy = py - e[1], dz = pz - e[2];
    if ((px - CE[0]) * dx + (py - CE[1]) * dy + (pz - CE[2]) * dz > 0) continue;
    const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 50) continue;
    const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= 1920) continue;
    const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= 1080) continue;
    let bb = GL[j + 3] * fade * 1.7;
    if (lit > 0) { const hx = px - HIT[0], hz = pz - HIT[2], d2 = hx * hx + hz * hz; if (d2 < 4e10) { const q = lit * Math.exp(-Math.sqrt(d2) / 60000); if (q > .02) { K.dot(sx, sy, 2, 198 + (236 - 198) * (1 - q), 244, 50 + 180 * (1 - q), Math.min(1, bb + q)); continue; } } }
    K.dot(sx, sy, zc > 150000 && bb > .3 ? 2 : 1, 236, 238, 230, bb > 1 ? 1 : bb);
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

/* ---------- the sea round the carrier (fine near the hull, matching the site's sea at 2.6 km) ---------- */
const CSEA = (() => {
  const A = [], r = rng(6603);
  const Ri = CVX.R;
  for (let rad = 8; rad < 2600; rad += .8 + rad * .012) {
    const ds = .8 + rad * .012, n = Math.floor(TAU * rad / ds), ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * TAU, rr = rad + (r() - .5) * ds * .8, x = CVP[0] + Math.sin(a) * rr, z = CVP[2] + Math.cos(a) * rr;
      // under the hull: carrier-local
      const dx = x - CVP[0], dz = z - CVP[2], lx = Ri[0] * dx + Ri[6] * dz, lz = Ri[2] * dx + Ri[8] * dz;
      if (Math.abs(lz) < 168 && Math.abs(lx) < (lz > 120 ? 22 * (1 - (lz - 120) / 48) + 6 : 38)) { r(); continue; }
      if (rad > 1800 && r() < (rad - 1800) / 1400) continue;
      const tex = Math.exp(1.1 * fbm(x * .003, z * .0012, 3.7, 3) - .2), hull = Math.exp(-Math.max(0, Math.hypot(Math.max(0, Math.abs(lx) - 38), Math.max(0, Math.abs(lz) - 166))) / 14);
      const bear = Math.atan2(x - (CVX.T[0] + 0), z - CVX.T[2]);
      A.push(x, z, Math.min(1, .2 + .14 * tex + .3 * hull * r() + .06 * r()), r() * TAU, bear);
    }
  }
  return K.tiled(new Float32Array(A), 5, 200, true);
})();
lap('carrier sea');
const C48W = cv(C48);
const AZ48 = T => CV_YAW + phi48(T);
const sweepA = T => ss(3.6, 4.6, T) * (1 - ss(8.4, 9.8, T));
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
const CO = { a: 1.15, fade: 2600, px: 3.8, px0: 10, lime: 0, rev: null };
const RO = { a: 1.3, fade: 900, px: 2.6, px0: 8, lime: 0, rev: null, keep: 1 };
const RREV = { x: 0, y: 0, z: 0, age: 0, v: 4, pre: .7, after: 0 };
const XF48 = T => X.mul(CVX, X.make(R.y(phi48(T)), C48));
const XF48B = X.mul(CVX, X.make(R.I(), C48));
const XF49 = T => X.mul(CVX, X.make(R.y(phi49(T)), C49));
function drawCarrier(T) {
  for (const p of CVL) K.drawLod(p.ml, CVX, CO);
  const age = T - T_RW;
  const lock = T > T_LOCK - .3 && T < 17 ? .35 * ss(T_LOCK - .3, T_LOCK, T) : 0;
  const pl = pulseLit(T);
  RO.lime = Math.max(lock, pl);
  RO.rev = null;
  if (age > -.1 && age < 3.5) { RREV.x = 0; RREV.y = -.5; RREV.z = 0; RREV.age = age; RREV.after = .15; RO.rev = RREV; }
  K.drawLod(RAD.s48, XF48(T), RO);
  RO.rev = null; K.drawLod(RAD.s48b, XF48B, RO);
  RO.lime = 0;
  if (age > -.1 && age < 3.5) { RREV.age = age - .3; RO.rev = RREV; }
  K.drawLod(RAD.s49, XF49(T), RO);
  RO.rev = null;
}
/* the antenna's lime glow as each pulse leaves */
const pulseLit = T => { let m = 0; for (const t of TE) { const a = T - t; if (a > -.5 && a < .8) m = Math.max(m, a < 0 ? .5 * (1 + a / .5) : Math.exp(-a * 4)); } return m; };

/* the sweep: a fan of dots out of the face, frequency-scanned rows stacked in elevation, energy running out */
const NFAN = 1800, FAN = new Float32Array(NFAN * 4);
{ const r = rng(313); for (let i = 0; i < NFAN; i++) { FAN[i * 4] = Math.pow(r(), 1.3); FAN[i * 4 + 1] = Math.floor(r() * 9) / 9 + r() * .02; FAN[i * 4 + 2] = (r() - .5); FAN[i * 4 + 3] = r(); } }
function drawSweep(T) {
  const sa = sweepA(T), lk = ss(8.8, T_LOCK + .2, T) * (1 - ss(16.6, 17.2, T));
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

/* ---------- the three pulses ----------
   Each is a patch of expanding shell out of the face along the line to the satellite: the front ring (turning, every
   fifth dot brighter), two echo rings behind, the shell's bowl of dots, and a cone of dots back to the antenna with
   energy running out along it. Near the satellite the front ring closes round it like a lock ring. */
const TA = Math.tan(3.2 * DEG);
const [U1, W1] = GEO.perp(D1);
const SIDE = V.norm(V.cross(D1, V.norm(V.sub(A0, CE))));
// the front's distance along the line for the ridden pulse (3) and, shifted in time, for the others
const XA = Math.log(6 / S_UP), XB = Math.log((S_UP - 22) / 22);
const qRide = T => { const u = E.sat((T - RIDE0) / (RIDE1 - RIDE0)), w = u * u * (3 - 2 * u) * .5 + (1 - (1 - u) * (1 - u)) * .5, x = XA + (XB - XA) * w; return S_UP / (1 + Math.exp(-x)); };
const hOf = q => 1 / (1 / (q + 55) + 1 / (S_UP - q + 14));
const frontRaw = T => { const q = qRide(T); return q + .86 * hOf(q) + (T > RIDE1 ? (T - RIDE1) * 90 : 0); };
const F0 = frontRaw(RIDE0);
const frontRide = T => frontRaw(T) - F0 * (1 - E.sat((T - RIDE0) / (RIDE1 - RIDE0)));
const T_ARR = (() => { let t = RIDE0; while (t < RIDE1 + 2 && frontRide(t) < S_UP) t += .002; return t; })();
// pulses 1 and 2 start slower (the camera watches them leave), then catch up to arrive before the third
const ageOf = (k, a) => k === 2 ? a : a <= 0 ? a : a * (.3 + .7 * ss(0, 4, a));
const frontOf = (k, T) => frontRide(ageOf(k, T - TE[k]) + RIDE0);
const arrOf = k => { let t = TE[k]; while (t < DUR && frontOf(k, t) < S_UP) t += .005; return t; };
const ARR = [arrOf(0), arrOf(1)];
LOG.push(`pulses arrive ${ARR[0].toFixed(2)} ${ARR[1].toFixed(2)} ${T_ARR.toFixed(2)}`);
CHAPTERS.find(c => c.wake).t = Math.round(T_ARR * 10) / 10;
const NBOWL = 700, BOWL = new Float32Array(NBOWL * 3), NCONE = 1500, CONE = new Float32Array(NCONE * 4);
{ const r = rng(717); for (let i = 0; i < NBOWL; i++) { const a = r() * TAU, q = Math.sqrt(r()); BOWL[i * 3] = Math.cos(a) * q; BOWL[i * 3 + 1] = Math.sin(a) * q; BOWL[i * 3 + 2] = r(); }
  for (let i = 0; i < NCONE; i++) { CONE[i * 4] = Math.pow(r(), 1.6); CONE[i * 4 + 1] = r() * TAU; const s = r(); CONE[i * 4 + 2] = s < .6 ? .9 + .1 * r() : Math.sqrt(r()); CONE[i * 4 + 3] = .4 + .6 * r(); } }
const PC = [0, 0, 0];
function drawPulse(k, T) {
  const age = T - TE[k]; if (age < -.05) return;
  const f = Math.max(2, frontOf(k, T));
  const a = ss(0, .06, age) * (1 - ss(S_UP + 60, S_UP + 1600, f));
  if (a < .01) return;
  const conv = ss(S_UP - 4000, S_UP - 40, f);
  const rho = (Math.max(2.6, f * TA) + 9 * ss(0, 60, f) + 22 * ss(0, 300, f)) * (1 - conv) + 7.5 * conv * (f > S_UP ? 1 + (f - S_UP) / 30 : 1);
  const fc = [A0[0] + D1[0] * f, A0[1] + D1[1] * f, A0[2] + D1[2] * f];
  const bright = k === 2 ? 1 : .85;
  // front ring (turning) and its echoes
  const n = 260, ph = T * 1.7 + k;
  for (let j = 0; j < n; j++) {
    const t = ph + j / n * TAU, c = Math.cos(t) * rho, s = Math.sin(t) * rho;
    if (K.pj(fc[0] + U1[0] * c + W1[0] * s, fc[1] + U1[1] * c + W1[1] * s, fc[2] + U1[2] * c + W1[2] * s)) K.dot(K.PJ[0], K.PJ[1], j % 5 === 0 ? 3 : 2, j % 5 === 0 ? 248 : LIME[0], j % 5 === 0 ? 255 : LIME[1], j % 5 === 0 ? 232 : LIME[2], a * bright * (j % 5 === 0 ? 1 : .75));
  }
  for (let m = 1; m <= 3; m++) {
    const back = rho * (.5 + .4 * m) * (1 - conv * .6), r2 = rho * (1 - .1 * m);
    K.ringW(V.mad(fc, D1, -back), U1, W1, r2, 160, m === 1 ? 2 : 1, LIME, a * .55 / m, -ph * .6 + m);
  }
  // the shell's bowl
  for (let i = 0; i < NBOWL; i++) {
    const o = i * 3, lx = BOWL[o] * rho, ly = BOWL[o + 1] * rho, rr = BOWL[o] * BOWL[o] + BOWL[o + 1] * BOWL[o + 1];
    const dep = -rho * .35 * (1 - rr) * (1 - conv);
    K.dotW(fc[0] + U1[0] * lx + W1[0] * ly + D1[0] * dep, fc[1] + U1[1] * lx + W1[1] * ly + D1[1] * dep, fc[2] + U1[2] * lx + W1[2] * ly + D1[2] * dep, 1, BOWL[o + 2] < .3 ? HOT : LIME, a * .5 * (.4 + .6 * rr));
  }
  // the cone of energy back to the antenna
  const cf = a * (1 - ss(S_UP * .3, S_UP * .9, f)) * .8;
  if (cf > .01) for (let i = 0; i < NCONE; i++) {
    const o = i * 4, u = CONE[o], s = u * f, ang = CONE[o + 1] + T * .4, rr = s / f * rho * CONE[o + 2], c = Math.cos(ang) * rr, sn = Math.sin(ang) * rr;
    const band = .5 + .5 * Math.cos(TAU * (u * 7 - age * 3.4)), b4 = band * band * band * band;
    const b = cf * CONE[o + 3] * (CONE[o + 2] > .88 ? 1 : .45) * (1 - .4 * u) * (.3 + 1.1 * b4);
    K.dotW(A0[0] + D1[0] * s + U1[0] * c + W1[0] * sn, A0[1] + D1[1] * s + U1[1] * c + W1[1] * sn, A0[2] + D1[2] * s + U1[2] * c + W1[2] * sn, 1, LIME, b > 1 ? 1 : b);
  }
  // leaving the face: a flash
  if (age < .6) { K.glowW(A0[0], A0[1], A0[2], Math.round(30 + 120 * Math.exp(-age * 6)), HOT, .8 * Math.exp(-age * 5)); K.glowW(A0[0], A0[1], A0[2], 70, LIME, .35 * Math.exp(-age * 3)); }
}
/* the ring each pulse leaves on the sea round the carrier */
const SR = [0, 0];
function seaRingOf(T) {
  let best = null;
  for (let k = 0; k < 3; k++) { const a = T - TE[k]; if (a < 0 || a > 2.4) continue; SR[0] = 20 + 1400 * Math.pow(a / 2.4, .6); SR[1] = .9 * (1 - a / 2.4); best = SR; }
  return best;
}

/* ---------- the satellite's state ---------- */
const ST = { petal: [0, 0, 0, 0, 0, 0], ring: [0, 0, 0, 0, 0, 0, 0], iris: 0, yoke: 0, wing: 0, rad: 0, boom: 0, dish: 0, wheel: 0, ringSpin: 0, coreSpin: 0, ex: 0, rails: 0 };
const T_PET = i => 24.9 + .14 * i;
const T_RING = j => 35.2 + .34 * (6 - j);
const WHEEL = integ(t => 14 * ss(27.8, 30.6, t), 27.8, DUR, TAU);
const RSPIN = integ(t => 7 * ss(36.4, 38.8, t) * (1 - ss(TFIRE, TFIRE + 1.5, t)), 36.4, 46, TAU);
const CSPIN = integ(t => 1.2 * ss(35, 38, t) * (1 - ss(TFIRE, TFIRE + 2, t)), 35, 46, TAU);
function stateAt(T) {
  for (let i = 0; i < 6; i++) ST.petal[i] = kk(T, T_PET(i), T_PET(i) + 1.3);
  ST.yoke = kk(T, 25.4, 26.2); ST.wing = kk(T, 26.0, 28.8);
  ST.rad = kk(T, 26.5, 27.9); ST.boom = kk(T, 27.0, 29.0); ST.dish = kk(T, 27.4, 29.2);
  ST.wheel = WHEEL(T);
  ST.ex = kk(T, 30.3, 31.4) * (1 - kk(T, 32.7, 33.8));
  ST.rails = kk(T, 34.3, 35.4);
  for (let j = 0; j < 7; j++) ST.ring[j] = kk(T, T_RING(j), T_RING(j) + .75);
  ST.ringSpin = RSPIN(T); ST.coreSpin = CSPIN(T);
  ST.iris = kk(T, 38.9, 39.9);
  ST.slew = kk(T, 39.3, 42.1);
  // before the pulse wakes it, and after the take has left it, the satellite sleeps
  if (T < 24 || T > 60) { for (let i = 0; i < 6; i++) ST.petal[i] = 0; for (let j = 0; j < 7; j++) ST.ring[j] = 0; ST.yoke = ST.wing = ST.rad = ST.boom = ST.dish = ST.ex = ST.rails = ST.iris = ST.slew = 0; }
  return ST;
}
const xrOf = T => Math.max(kk(T, 29.8, 30.4) * (1 - kk(T, 33.4, 34.3)), .42 * kk(T, 34.3, 35.0) * (1 - kk(T, 38.8, 39.6)));
// attitude: dormant, the nose along the orbit, top to space -> the emitter on the battery
const AIM0 = V.norm(V.sub(HIT, SAT));
const Q0 = K.Q.fromR(R.look(EX, EY)), Q1 = K.Q.fromR(R.look(AIM0, EZ));
let SATW = X.make(K.Q.toR(Q0), SAT);
const W0 = SATW;
function satXf(T, st) { SATW = X.make(K.Q.toR(K.Q.slerp(Q0, Q1, st.slew)), SAT); return SATW; }
const APW = (() => { const s = Object.assign({}, stateAt(TFIRE)); satXf(TFIRE, s); const P = SAT_M.pose(SATW, s); return P.aperture.slice(); })();
const AIM = V.norm(V.sub(HIT, APW)), L2 = V.dist(APW, HIT);
const B_TOP = V.mad(HIT, AIM, -2600 / Math.max(.3, -AIM[1]));
const L2B = V.dist(APW, B_TOP);
LOG.push(`slant down ${(L2 / 1000).toFixed(1)} km`);

/* ---------- the discharge column ---------- */
const XA2 = Math.log(4 / L2B), XB2 = Math.log((L2B - 50) / 50);
const front2 = T => { if (T < DOWN0) return 0; const u = E.sat((T - DOWN0) / (DOWN1 - DOWN0)), w = u < .5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u), ww = .35 * u * u + .65 * w; return Math.min(L2B, L2B * (1 / (1 + Math.exp(-(XA2 + (XB2 - XA2) * ww))) - SG0 * (1 - u)) + ss(DOWN1 - .5, DOWN1, T) * 60); };
const SG0 = 1 / (1 + Math.exp(-XA2));
const BOLT = new K.Bolt({ top: B_TOP, hit: HIT, seed: 2207, depth: 8, nb: 10, rough: .6, spark: 40 });
const [U2, W2] = GEO.perp(AIM);
const COLP = [0, 0, 0];
const colR = s => 1.1 + s * 3.2e-5;
function drawColumn(T) {
  if (T < TFIRE - .05 || T > TB + 3.2) return;
  const f = T < DOWN0 ? 0 : front2(T), fade = 1 - ss(TB + .3, TB + 3, T), a0 = T - TFIRE;
  const ap = APW, e = C.eye;
  // the aperture flash
  if (a0 < 1.6) { K.glowW(ap[0], ap[1], ap[2], Math.round(60 + 400 * Math.exp(-a0 * 4)), HOT, Math.min(1, 1.1 * Math.exp(-a0 * 2.4))); K.glowW(ap[0], ap[1], ap[2], 240, LIME, .45 * Math.exp(-a0 * 1.3)); }
  if (f < 1) return;
  const end = V.mad(ap, AIM, f);
  // the core, started where it comes into view (not at the near plane, which would spread its dots thin)
  const cf = C.f, z0 = (ap[0] - e[0]) * cf[0] + (ap[1] - e[1]) * cf[1] + (ap[2] - e[2]) * cf[2], dz = V.dot(AIM, cf), zmin = Math.max(15, .2 * (z0 + dz * f));
  let s0 = 0, s1 = f;
  if (Math.abs(dz) < 1e-9) { if (z0 < zmin) s1 = -1; } else { const sz = (zmin - z0) / dz; if (dz > 0) s0 = Math.max(0, sz); else s1 = Math.min(f, sz); }
  if (s1 > s0) { const st = V.mad(ap, AIM, s0), en = V.mad(ap, AIM, s1); K.lineW(st[0], st[1], st[2], en[0], en[1], en[2], 1.1, 2, HOT, .95 * fade, LIME, .07, .025); }
  // the sheath: five strands twisting round the core, sampled densely where the camera is
  const sc = E.clamp(V.dot(V.sub(e, ap), AIM), 0, f), dc = Math.max(3, V.dist(e, V.mad(ap, AIM, sc)));
  for (const dir of [-1, 1]) for (let i = 0; i < 170; i++) {
    const s = sc + dir * dc * .25 * (Math.pow(1.045, i) - 1); if (s < 0 || s > f) continue;
    const rc = colR(s), tw = s / (9 * rc) - T * 6;
    for (let m = 0; m < 5; m++) {
      const t = tw + m * TAU / 5, c = Math.cos(t) * rc, sn = Math.sin(t) * rc;
      const b = fade * (.55 + .45 * Math.sin(s / (4 * rc) + m - T * 20));
      K.dotW(ap[0] + AIM[0] * s + U2[0] * c + W2[0] * sn, ap[1] + AIM[1] * s + U2[1] * c + W2[1] * sn, ap[2] + AIM[2] * s + U2[2] * c + W2[2] * sn, 1, m % 2 ? LIME : HOT, b);
    }
  }
  // two lightning filaments wound round the column, struck down with the head
  for (let q = 0; q < 2; q++) {
    const Pq = FIL[q], n = Pq.length / 3, nv = Math.min(n - 1, Math.floor(f / L2B * (n - 1))), fl = fade * (.55 + .45 * K.hh(q, Math.floor(T * 20)));
    for (let i = 0; i < nv; i++) { const o = i * 3; K.lineW(Pq[o], Pq[o + 1], Pq[o + 2], Pq[o + 3], Pq[o + 4], Pq[o + 5], 1.4, 1, LIME, fl, null); }
  }
  // the pillar where the column meets the ground: stacked rings, collapsing
  const tb2 = T - TB;
  if (tb2 > -.05 && tb2 < 2.6) {
    const pa = (tb2 < .05 ? 1 : 1 - (tb2 - .05) / 2.55), rb = colR(L2) * (1.3 + 1.2 * Math.exp(-tb2 * 3));
    for (let k = 0; k < 90; k++) {
      const hgt = k * 22 * (1 - .5 * ss(0, 2.6, tb2)), c = V.mad(HIT, AIM, -hgt / Math.max(.3, -AIM[1])), rr = rb * (1 + .002 * hgt);
      K.ringW(c, U2, W2, rr, 64, k % 3 ? 1 : 2, k % 3 ? LIME : HOT, Math.min(1, pa * (1 - k / 95) * 1.2), k * .7 + T * 5);
    }
  }
  // rings shed down the column behind the head
  const hh = Math.max(20, hDown(f));
  for (let j = 0; j < 8; j++) {
    const s = f - hh * (.15 + .35 * j) - ((T * 30) % 1) * hh * .35; if (s < 0) continue;
    const c = V.mad(ap, AIM, s), rc = colR(s) * (2.2 + .4 * Math.sin(j * 1.7));
    K.ringW(c, U2, W2, rc, 120, j < 2 ? 2 : 1, j % 2 ? LIME : HOT, fade * .8 * (1 - j / 9) * (T < TB ? 1 : .5), j + T * 3);
  }
  // the head: a bright point, a shock ring, arcs crawling on it
  if (T < TB) {
    const rh = colR(f) * 3;
    K.dotW(end[0], end[1], end[2], 4, [255, 255, 255], 1);
    K.glowW(end[0], end[1], end[2], 34, HOT, .8); K.glowW(end[0], end[1], end[2], 120, LIME, .35);
    K.ringW(V.mad(end, AIM, -rh * .8), U2, W2, rh * 1.8, 200, 2, LIME, .8, T * 4);
    K.ringW(V.mad(end, AIM, -rh * 2.2), U2, W2, rh * 2.6, 160, 1, LIME, .45, -T * 3);
    for (let i = 0; i < 6; i++) {
      const s0 = f - hh * (.02 + .3 * K.hh(i, Math.floor(T * 30))), s1 = s0 - hh * .07; if (s1 < 0) continue;
      const t0 = K.hh(i * 3 + 1, Math.floor(T * 30)) * TAU, t1 = t0 + 1.5, r0 = colR(s0) * 2 + .012 * hh, r1 = colR(s1) * 2 + .012 * hh;
      const A = V.add(V.mad(ap, AIM, s0), V.add(V.mul(U2, Math.cos(t0) * r0), V.mul(W2, Math.sin(t0) * r0)));
      const B = V.add(V.mad(ap, AIM, s1), V.add(V.mul(U2, Math.cos(t1) * r1), V.mul(W2, Math.sin(t1) * r1)));
      K.arcW(A, B, i * 7 + 2, T, .8, .22);
    }
  }
}
const FIL = [0, 1].map(q => { const r = rng(9100 + q), P = K.disp(APW, B_TOP, 11, .0035, r, 1), o = new Float64Array(P.length * 3); P.forEach((p, i) => { o[i * 3] = p[0]; o[i * 3 + 1] = p[1]; o[i * 3 + 2] = p[2]; }); return o; });
const hDown = f => 1 / (1 / (f * .45 + 20) + 1 / ((L2 - f) * .3 + 250));

/* ---------- the strike: shock rings over the whole scan area, the blast ring and dust, the shock dome ---------- */
const DUST = (() => { const r = rng(4141), A = new Float32Array(1600 * 4); for (let i = 0; i < 1600; i++) { A[i * 4] = r() * TAU; A[i * 4 + 1] = r(); A[i * 4 + 2] = r(); A[i * 4 + 3] = r(); } return A; })();
const DOME = (() => { const r = rng(4242), A = new Float32Array(1100 * 3); for (let i = 0; i < 1100; i++) { const u = r(), a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(a) * h; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(a) * h; } return A; })();
const SHOCK = [[0, 330, 2.1, HOT, 2], [.1, 300, 1.7, LIME, 2], [.26, SCAN_R, 1.25, LIME, 2], [.5, 215, 1.05, HOT, 1], [.85, 175, .9, LIME, 1], [1.3, 130, .8, LIME, 1]];
function drawStrike(T) {
  const tb = T - TB; if (tb < 0 || tb > 14) return;
  // shock rings racing out over the ground
  for (const [t0, Rm, k, col, sz] of SHOCK) {
    const a = tb - t0; if (a < 0 || a > 3.2) continue;
    const rad = Rm * (1 - Math.exp(-a * 2.4 / k)), al = (1 - a / 3.2) * (a < .05 ? a / .05 : 1);
    SITE.ringG(HITL, rad, col, .95 * al, sz);
  }
  // the blast ring and the dust it lifts
  if (tb < 3.5) {
    const rb = 120 * (1 - Math.exp(-tb * 3.2)), al = 1 - tb / 3.5;
    for (let i = 0; i < 1600; i++) {
      const o = i * 4, ang = DUST[o], rr = rb * (.8 + .25 * DUST[o + 1]), x = HITL[0] + Math.cos(ang) * rr, z = HITL[2] + Math.sin(ang) * rr;
      const gy = SITE.groundP(rr, ang), h = (2 + 14 * DUST[o + 2]) * Math.sin(Math.min(PI, tb * 2.2 + DUST[o + 3])) * (1 - tb / 3.5);
      K.dotW(x, gy + Math.max(.3, h), z, i % 7 ? 1 : 2, DUST[o + 3] < .3 ? LIME : WH, al * (.35 + .5 * DUST[o + 2]));
    }
  }
  // the shock dome
  if (tb < 1.3) {
    const rd = 360 * (1 - Math.exp(-tb * 3.4)), al = .5 * (1 - tb / 1.3);
    for (let i = 0; i < 1100; i++) { const o = i * 3; K.dotW(HIT[0] + DOME[o] * rd, HIT[1] + DOME[o + 1] * rd * .7, HIT[2] + DOME[o + 2] * rd, 1, i % 4 ? LIME : HOT, al * (.4 + .6 * DOME[o + 1])); }
  }
  // the edge of the scanned area: a dashed lime circle, 5 x the destroyer's
  const ea = ss(2.6, 3.4, tb) * (1 - ss(12, 13.5, tb));
  if (ea > .01) for (let k = 0; k < 720; k++) {
    if (k % 12 > 7) continue;
    const t = k / 720 * TAU + tb * .02, x = HITL[0] + Math.cos(t) * SCAN_R, z = HITL[2] + Math.sin(t) * SCAN_R;
    K.dotW(x, SITE.groundP(SCAN_R, t) + .5, z, 2, LIME, .7 * ea);
  }
  // the column's foot: a glow on the strike point
  if (tb < 2) K.glowW(HIT[0], HIT[1] + 3, HIT[2], Math.round(80 + 300 * Math.exp(-tb * 3)), HOT, .9 * Math.exp(-tb * 1.8));
}

/* ---------- the satellite's effects: lights, charge arcs, particle rings ---------- */
function lightOn(k, T) {
  const t0 = k < 2 ? ARR[k] : T_ARR + .18 + .1 * (k - 2);
  if (T < t0 || T > 60) return 0;
  const a = T - t0; return a < .06 ? 1 : a < .12 ? .3 : 1;
}
const SQ = [0, 0, 0], SR2 = [0, 0, 0];
function drawSatFx(T, P, st) {
  // status lights
  for (let k = 0; k < 16; k++) {
    const on = lightOn(k, T); if (on <= 0) continue;
    const p = P.lights[k], blink = k % 4 === 3 ? (Math.floor(T * 2 + k) % 2 ? 1 : .35) : 1, lime = T > T_ARR + 1.9;
    K.dotW(p[0], p[1], p[2], 2, lime ? LIME : [255, 255, 255], on * blink);
    K.glowW(p[0], p[1], p[2], 8, lime ? LIME : HOT, .35 * on * blink);
  }
  // the pulse landing on the horn
  const ha = T - T_ARR;
  if (ha > 0 && ha < 1.2) { const h = P.hornTip; K.glowW(h[0], h[1], h[2], Math.round(20 + 90 * Math.exp(-ha * 5)), HOT, .9 * Math.exp(-ha * 3)); }
  // the core charging: arcs crawling over it (seen through the thinned skin)
  const chg = ss(35, 38.4, T) * (1 - ss(TFIRE, TFIRE + .4, T)), xr = xrOf(T);
  if (chg > .01 && xr > .05) {
    const fr = Math.floor(T * 30), n = Math.floor(3 + 8 * chg);
    for (let i = 0; i < n; i++) {
      const z0 = -1.2 + 2.4 * K.hh(i * 3.1, fr), a0 = K.hh(i * 5.7 + 2, fr) * TAU, a1 = a0 + (K.hh(i * 1.3 + 9, fr) - .5) * 2.4, z1 = z0 + (K.hh(i * 7.7 + 4, fr) - .5) * .8;
      const A = X.ap(P.core, [.58 * Math.cos(a0), .58 * Math.sin(a0), z0]), B = X.ap(P.core, [.58 * Math.cos(a1), .58 * Math.sin(a1), z1]);
      K.arcW(A, B, i + fr * .1, T, (.5 + .6 * chg) * Math.min(1, xr * 2.2), .45);
    }
  }
  // arcs between the stacked rings, and round each ring
  const rq = ss(36.2, 38.4, T) * (1 - ss(TFIRE + .2, TFIRE + 1.2, T));
  if (rq > .01) {
    const fr = Math.floor(T * 30), n = Math.floor(4 + 14 * rq);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(K.hh(i * 3.7, fr) * 7), a = K.hh(i * 5.3 + 1, fr) * TAU, h3 = K.hh(i * 1.9 + 7, fr);
      if (st.ring[j] < .98) continue;
      const Rr = SAT_M.RR + .1;
      if (h3 < .45) { const A = X.ap(P.rings[j], [Rr * Math.cos(a), Rr * Math.sin(a), 0]), B = X.ap(P.rings[j], [Rr * Math.cos(a + .5 + h3), Rr * Math.sin(a + .5 + h3), 0]); K.arcW(A, B, i + fr * .1, T, (.5 + .6 * rq) * (.6 + .4 * h3), .45); }
      else if (j < 6 && st.ring[j + 1] > .98) { const A = X.ap(P.rings[j], [SAT_M.RR * Math.cos(a), SAT_M.RR * Math.sin(a), 0]), B = X.ap(P.rings[j + 1], [SAT_M.RR * Math.cos(a + h3 - .7), SAT_M.RR * Math.sin(a + h3 - .7), 0]); K.arcW(A, B, i * 7 + 3, T, .35 + .65 * rq, .25); }
    }
  }
  // particle rings circling inside the stack
  const pq = ss(36.6, 38.9, T) * (1 - ss(TFIRE - .1, TFIRE + .25, T));
  if (pq > .01) {
    const ax = X.dir(P.W, [0, 0, 1]), ux = X.dir(P.W, [1, 0, 0]), uy = X.dir(P.W, [0, 1, 0]);
    for (let j = 0; j < 6; j++) {
      if (st.ring[j] < .98 || st.ring[j + 1] < .98) continue;
      const z = (P.ringZ(j) + P.ringZ(j + 1)) / 2, c = X.ap(P.W, [0, 0, z]), rr = 1.25 - .06 * j, n = 60, sp = (3 + j) * (j % 2 ? -1 : 1) * T * pq;
      for (let i = 0; i < n; i++) {
        const t = sp + i / n * TAU, cs = Math.cos(t) * rr, sn = Math.sin(t) * rr, wob = .08 * Math.sin(i * 1.7 + T * 5);
        K.dotW(c[0] + ux[0] * cs + uy[0] * sn + ax[0] * wob, c[1] + ux[1] * cs + uy[1] * sn + ax[1] * wob, c[2] + ux[2] * cs + uy[2] * sn + ax[2] * wob, i % 6 ? 1 : 2, i % 3 ? LIME : HOT, pq * (.55 + .45 * (i % 2)));
      }
    }
    // the aperture glowing up
    const ap = P.aperture; K.glowW(ap[0], ap[1], ap[2], Math.round(20 + 50 * pq), LIME, .3 * pq * st.iris);
  }
  // locked rings glow lime
  const rg = ss(35.4, 38.4, T) * (1 - ss(TFIRE + .3, TFIRE + 2.5, T));
  if (rg > .01) for (let j = 0; j < 7; j++) { if (st.ring[j] < .98) continue; const c = X.ap(P.rings[j], [0, 0, 0]), U = X.dir(P.rings[j], [1, 0, 0]), W = X.dir(P.rings[j], [0, 1, 0]); K.ringW(c, U, W, SAT_M.RR + .02, 220, 2, LIME, .25 + .45 * rg, T * 2 + j); K.ringW(c, U, W, SAT_M.RR - .14, 160, 1, HOT, .2 + .3 * rg, -T * 3 + j); }
  // ring lock flashes
  for (let j = 0; j < 7; j++) { const a = T - (T_RING(j) + .75); if (a > 0 && a < .5) { const c = X.ap(P.rings[j], [0, 0, 0]); K.ringW(c, X.dir(P.rings[j], [1, 0, 0]), X.dir(P.rings[j], [0, 1, 0]), SAT_M.RR + .25 + a * 1.5, 120, 2, HOT, 1 - a / .5, 0); } }
}
function ringLitOf(T) {
  const o = [];
  for (let j = 0; j < 7; j++) {
    const a = T - (T_RING(j) + .75);
    let l = a > 0 ? Math.max(.25 * ss(36.2, 38.4, T), Math.exp(-a * 5) * .9) : 0;
    // the countdown ripple back to front before the discharge, then the flare
    const c = T - (42.0 + .07 * j); if (c > 0 && c < .6) l = Math.max(l, 1 - c / .6 * .4);
    const fd = T - TFIRE; if (fd > 0) l = Math.max(l * (1 - ss(1.2, 3, fd)), fd < .4 ? 1 : 0);
    o.push(Math.min(1, l));
  }
  return o;
}

/* ---------- camera ---------- */
const LK = (t, e, g, fov) => ({ t, eye: e, target: g, fov });
const CK = (t, e, g, fov) => LK(t, cv(e), cv(g), fov);
const UPA = V.norm(V.sub(A0, CE)), BH = V.norm(V.sub(D1, V.mul(UPA, V.dot(D1, UPA)))), SH = V.cross(UPA, BH);
const AW = (fwd, side, up) => V.add(A0, V.add(V.mul(BH, fwd), V.add(V.mul(SH, side), V.mul(UPA, up))));
function camRide(T) {
  // ahead of the pulse and to the side, looking back down the line: the ring climbs toward the lens, the Earth behind it
  const q = qRide(T), h = hOf(q), c = V.mad(A0, D1, q), w = ss(RIDE0 + .3, RIDE0 + 2.2, T);
  const eye = V.add(c, V.add(V.mul(SIDE, (.75 + .2 * w) * h), V.add(V.mul(D1, (.2 + 1.15 * w) * h), V.mul(UPA, .15 * h))));
  const tg = V.add(V.mad(c, D1, .35 * h), V.mul(UPA, -.25 * h * w));
  return { eye, target: V.lerp(tg, SAT, ss(RIDE1 - 4.2, RIDE1 - .6, T)), fov: (50 + 4 * w) * DEG };
}
const RS = camRide(RIDE0 + .5), RE_ = camRide(RIDE1);
const PATH_A = FILM.path([
  CK(0, [300, 110, 260], [10, 25, -10], 40),
  CK(2.4, [175, 72, 96], [31, 50, -26], 30),
  CK(5.4, [300, 320, -110], [0, 10, -40], 50),
  CK(8.6, [-60, 360, -460], [10, 10, 0], 52),
  LK(10.9, AW(-120, -150, 30), AW(12, 0, 24), 60),
  LK(13.5, AW(-90, -140, 15), AW(15, 0, 28), 60),
  LK(15.5, AW(-60, -70, -12), AW(40, -5, 60), 52),
  { t: RIDE0 + .5, eye: RS.eye, target: RS.target, fov: RS.fov / DEG },
]);
const SW = p => X.ap(W0, p);
const PATH_W = FILM.path([
  { t: RIDE1, eye: RE_.eye, target: RE_.target, fov: RE_.fov / DEG },
  LK(26.4, SW([10, -5, 13]), SW([0, -.5, 2.5]), 46),
  LK(28.8, SW([17, 2.5, -5]), SW([2, 0, -.5]), 50),
  LK(31.6, SW([11, 4.6, 6.5]), SW([0, 0, -.6]), 46),
  LK(33.0, SW([3, 10, 12]), SW([0, 0, 1.5]), 46),
  LK(34.6, SW([-9.5, 3, 12]), SW([0, 0, 4.5]), 44),
  LK(37.2, SW([-15, -3.5, 20]), SW([0, 0, 7]), 46),
  LK(38.5, SW([-9, 13, 6]), SW([0, 0, 5]), 46),
  LK(39.9, SW([4, 10, -12]), SW([0, 0, 4]), 46),
  LK(TFIRE - .1, V.add(SAT, V.add(V.mul(AIM0, -30), V.add(V.mul(EZ, 9), V.mul(EX, 7)))), V.add(SAT, V.mul(AIM0, 34)), 44),
]);
const SIDE2 = V.norm(V.cross(AIM, UPA));
function camDown(T) {
  const f = front2(T), h = hDown(f);
  const c = V.mad(APW, AIM, f);
  // beside the column, a little behind its head: the column a line from the sky, the head falling toward the coast
  const w = ss(DOWN0, DOWN0 + 1.6, T);
  const eye = V.add(c, V.add(V.mul(AIM, -(1.05 - .6 * w) * h), V.mul(SIDE2, (.5 + .55 * w) * h)));
  return { eye, target: V.mad(c, AIM, (.9 - .5 * w) * h), fov: 46 * DEG };
}
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
const EDN = camDown(DOWN1), DIR0 = V.norm(V.sub(EDN.eye, HIT)), AZ0 = Math.atan2(DIR0[0], DIR0[2]);
function camScan(T) {
  const tb = T - TB;
  const az = AZ0 + 30 * DEG * ss(-1, 12, tb), el = E.mix(Math.asin(DIR0[1]), 24 * DEG, ss(-1.3, 1.2, tb));
  const push = ss(1.6, 5.0, tb) * (1 - ss(8.4, 12.6, tb));
  const dist = K.logMix(K.logMix(V.dist(EDN.eye, HIT), 820, ss(-1, 1, tb)), 150, push);
  const eye = V.add(HIT, V.mul(sph(az, E.mix(el, 26 * DEG, push)), dist));
  const target = V.lerp(V.lerp(HIT, S_LOOK, ss(1.6, 4, tb)), [30, 0, 10], ss(9.4, 12, tb));
  return { eye, target, fov: E.mix(E.mix(46, 40, ss(-1, 1, tb)), 30, push) * DEG };
}
const SCK = t => { const c = camScan(t); return { t, eye: c.eye, target: c.target, fov: c.fov / DEG }; };
const PATH_E = FILM.path([
  SCK(57.6), SCK(59.4), SCK(61.2),
  LK(65.5, [300, 760, -200], [1100, 0, -3400], 44),
  LK(69.5, cv([900, 380, 700]), cv([0, 20, 0]), 42),
  CK(74, [520, 170, 420], [10, 25, -10], 40),
  CK(DUR, [300, 110, 260], [10, 25, -10], 40),
]);
const DBGCAM = (() => { let spec = STAGE.Q.get('cam'); try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {} return spec ? spec.split(',').map(Number) : null; })();
const AWCAM = (() => { const q = STAGE.Q.get('camw'); return q ? q.split(',').map(Number) : null; })();
function camAt(T) {
  if (AWCAM) return { eye: AW(AWCAM[0], AWCAM[1], AWCAM[2]), target: AW(AWCAM[3], AWCAM[4], AWCAM[5]), fov: (AWCAM[6] || 50) * DEG };
  if (DBGCAM) return { eye: SW(DBGCAM.slice(0, 3)), target: SW(DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 40) * DEG };
  if (T < RIDE0 - .2) return PATH_A(T);
  if (T < RIDE0 + .5) return K.blendShot(PATH_A(T), camRide(T), ss(RIDE0 - .2, RIDE0 + .5, T));
  if (T < RIDE1) return camRide(T);
  if (T < TFIRE - .1) return PATH_W(T);
  if (T < DOWN0 + .3) return K.blendShot(PATH_W(TFIRE - .1), camDown(T), ss(TFIRE - .1, DOWN0 + .3, T));
  if (T < DOWN1 - .5) return camDown(T);
  if (T < TB + .6) return K.blendShot(camDown(T), camScan(T), ss(DOWN1 - .5, TB + .6, T));
  if (T < 58.2) return camScan(T);
  if (T < 59.6) return K.blendShot(camScan(T), PATH_E(T), ss(58.2, 59.6, T));
  return PATH_E(T);
}

/* ---------- clocks: sim time (the rate on screen), the sea's own clock (whole wave periods per loop) ---------- */
const SLOW = 1e-6;
const WARP = FILM.warp([{ t: 0, rate: 1 }, { t: 10.8, rate: 1 }, { t: 11.1, rate: SLOW }, { t: 24.6, rate: SLOW }, { t: 25.2, rate: 8 }, { t: TFIRE - .3, rate: 8 }, { t: TFIRE, rate: SLOW }, { t: TB - .1, rate: SLOW }, { t: TB + .2, rate: 1 }, { t: DUR, rate: 1 }]);
const SEA = integ(t => 1 - .97 * ss(10.8, 11.1, t) * (1 - ss(24.6, 25.2, t)) - .97 * ss(TFIRE - .3, TFIRE, t) * (1 - ss(TB - .1, TB + .2, t)), 0, DUR, 40);
const C_LIGHT = 299792458;

/* ---------- tags ---------- */
const T_CV = K.mkTag(), T_48 = K.mkTag(), T_SAT = K.mkTag(), T_P = K.mkTag();
const PTAGS = [
  // [id, label, value, piece -> transform, model point, t0, t1]
  ['01', 'NOSE COVER · 6 PETALS', '', P => P.petals[0], [1.4, 0, 4.4], 25.2, 27.4],
  ['02', 'SOLAR WINGS · 8 PANELS', '24 M', P => P.wings[3], [SAT_M.PW, 0, 0], 27.6, 29.6],
  ['03', 'UPLINK DISH · 12 RIBS', '', P => P.dish, [1.2, -.4, 0], 28.4, 29.8],
  ['04', 'POWER CORE', '', P => P.core, [.5, .3, .8], 30.6, 33.4],
  ['05', 'REACTION WHEELS ×4', '', P => P.wheels[0], [.3, 0, 0], 30.9, 33.4],
  ['06', 'CAPACITOR BANKS ×6', '', P => P.caps[1], [.1, .1, .9], 31.2, 33.4],
  ['07', 'CHARGE RINGS ×7', '', P => P.rings[6], [0, SAT_M.RR, 0], 36.2, 38.6],
  ['08', 'IRIS · 8 BLADES', '', P => P.blades[1], [.4, .4, 3.6], 39.1, 40.6],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
function partTags(T, P) {
  for (const t of PTAGS) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const p = X.ap(t.fr(P), t.at); if (!K.pj(p[0], p[1], p[2]) || !K.onS(-40)) continue;
    const x = K.PJ[0], y = K.PJ[1];
    const dx = x > 1100 ? 54 : -54, lx = x + dx;
    K.leader(x, y, lx, y - 50, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    const w = K.tagW(t.tg);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .7), T, +t.id), t.val, 'lime sm', dx > 0 ? lx + 4 : lx - 4 - w, y - 62, a);
  }
}
function markTags(T, P) {
  // the carrier, while it is small or at the start
  const cb = K.boxOf([-40, 0, -166], [37, 60, 166], CVX, 4);
  if (cb && (T < 10.4 || T > 66)) {
    const a = T < 10.4 ? 1 - ss(9.6, 10.4, T) : ss(67, 68.5, T);
    if (cb[2] - cb[0] < 700) { K.bracket(cb, '#C6F432', .7 * a, 10, 1.2); K.setTag(T_CV, 'CVN', 'NIMITZ CLASS', '332.8 M', 'lime sm', cb[0], cb[1] - 24, a); }
  }
  // the radar, when it wakes
  if (T > T_RW + .3 && T < 9.8) {
    const p = X.ap(XF48(T), [0, 5.5, 0]);
    if (K.pj(p[0], p[1], p[2]) && K.onS(-60)) { const a = ss(T_RW + .3, T_RW + .6, T) * (1 - ss(9.3, 9.8, T)); K.leader(K.PJ[0], K.PJ[1], K.PJ[0] + 50, K.PJ[1] - 56, '#C6F432', .8 * a); K.setTag(T_48, 'RDR', K.decode('AN/SPS-48E · 3D AIR SEARCH', E.sat((T - T_RW - .3) / .8), T, 4), `${Math.round(om48(T) / TAU * 60)} RPM`, 'lime sm', K.PJ[0] + 54, K.PJ[1] - 70, a); }
  }
  // the satellite as a small mark on the climb
  if (T > RIDE0 + 3 && T < RIDE1 + 1) {
    const b = K.boxOf([-3, -3, -4], [3, 3, 6], SATW, 3);
    if (b) { const px = Math.max(b[2] - b[0], b[3] - b[1]); if (px < 200) { const a = (1 - ss(120, 200, px)) * ss(RIDE0 + 3, RIDE0 + 3.6, T); K.bracket(b, '#C6F432', .85 * a, 6, 1.2); K.setTag(T_SAT, 'SAT', T < T_ARR ? 'DORMANT' : 'WAKING', `${Math.round(ALT / 1000)} KM`, 'lime sm', b[2] + 8, b[1] - 4, a); } }
  }
  // the ridden pulse
  if (T > RIDE0 + .4 && T < T_ARR - .3) {
    const f = frontOf(2, T), c = V.mad(A0, D1, f), rho = Math.max(2.6, f * TA);
    if (K.pj(c[0] + U1[0] * rho, c[1] + U1[1] * rho, c[2] + U1[2] * rho) && K.onS(-40)) { const a = ss(RIDE0 + .4, RIDE0 + .8, T) * (1 - ss(T_ARR - 1, T_ARR - .3, T)); K.setTag(T_P, 'P3', 'PULSE 3/3', `${(f / 1000).toFixed(1)} KM`, 'lime sm', K.PJ[0] + 12, K.PJ[1] - 12, a); }
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
  if (T < T_RW || T > 74.5) { l1 = 'CVN · <b>Nimitz class</b>'; l2 = 'AN/SPS-48E <b>standby</b>'; }
  else if (T < 10.6) { l1 = `AN/SPS-48E · <b>${Math.round(om48(T) / TAU * 60)} rpm</b>`; l2 = T < 8.6 ? 'Sweep <b>360°</b> · range <b>220 km</b>' : `Lock · brg <b>${Math.round(brg)}°</b> el <b>${(EL_D1 / DEG).toFixed(0)}°</b>`; }
  else if (T < RIDE0 + .3) { const n = TE.filter(t => T >= t).length; l1 = `Uplink · pulse <b>${n}/3</b>`; l2 = `Satellite · brg <b>${Math.round(brg)}°</b> · <b>${km(S_UP)} km</b>`; }
  else if (T < T_ARR) {
    const f = frontOf(2, T), alt = V.dist(V.mad(A0, D1, f), CE) - RE, v = (frontOf(2, T + .01) - frontOf(2, T - .01)) / .02;
    l1 = `Pulse 3 · alt <b>${km(Math.max(0, alt))} km</b>`; l2 = `+<b>${(f / C_LIGHT * 1000).toFixed(3)} ms</b> · c`;
    l3 = `<span class="l">slow ${slowTxt(Math.max(1e-9, v / C_LIGHT))}</span>`;
  }
  else if (T < T_XR) { const on = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].filter(k => lightOn(k, T) > 0).length; l1 = `Satellite · <b>${km(ALT)} km</b> · waking`; l2 = T < 26 ? `Status <b>${on}/16</b>` : `Wings <b>${Math.round(ST.wing * 100)} %</b> · booms <b>${Math.round(ST.boom * 100)} %</b>`; }
  else if (T < T_CHG) { l1 = 'Self-test · <b>X-ray</b>'; l2 = `Wheels <b>${Math.round(14 * ss(27.8, 30.6, T) * 60 / TAU * 8)} rpm</b>`; }
  else if (T < T_AIM) { l1 = `Core · <b>${Math.round(100 * ss(35, 38.4, T))} %</b>`; l2 = `Charge rings <b>${ST.ring.filter(r => r > .98).length}/7</b>`; }
  else if (T < TFIRE) { const togo = Math.acos(E.clamp(V.dot(X.dir(SATW, [0, 0, 1]), AIM0), -1, 1)) / DEG; l1 = `Slew · <b>${togo.toFixed(0)}°</b> to go`; l2 = `Target · <b>${km(L2)} km</b> slant`; }
  else if (T < TB) {
    const f = front2(T), alt = V.dist(V.mad(APW, AIM, f), CE) - RE, v = (front2(T + .01) - front2(T - .01)) / .02;
    l1 = T < DOWN0 ? 'Discharge' : `Column · alt <b>${km(Math.max(0, alt))} km</b>`; l2 = `+<b>${(f / C_LIGHT * 1000).toFixed(3)} ms</b>`;
    if (v > 1) l3 = `<span class="l">slow ${slowTxt(Math.max(1e-9, v / C_LIGHT))}</span>`;
  }
  else if (T < T_CALM) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · r <b>${SCAN_R} m</b> · <b>5×</b> area`; l2 = `Identified <b>${n}/${SITE.V.length}</b>`; }
  else { l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = 'Satellite <b>stowing</b> · cooldown'; }
  if (!l3) { const rate = WARP.rate(T); l3 = `${K.fmtClock(WARP(T) - WARP(TFIRE))} · ${rate > 1.5 ? `<span class="l">×${Math.round(rate)}</span>` : '×1'}`; }
  const html = `${l1}<br>${l2}<br>${l3}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const L_SUN = V.norm(V.add(V.mul(EY, .45), V.add(V.mul(EX, .7), V.mul(EZ, -.35)))), L_SITE = [-.4, .6, -.7];
let NP = 0, POSE = null;
const PROF = STAGE.Q.has('prof') ? {} : null; let PT = 0;
function prof(n) { const t = performance.now(); if (n) PROF[n] = (PROF[n] || 0) + t - PT; PT = t; }
function render(T) {
  if (PROF) prof(null);
  K.beginTags();
  const st = stateAt(T);
  satXf(T, st);
  const P = POSE = SAT_M.pose(SATW, st);
  FILM.apply(C, camAt(T));
  const af = T - TFIRE, tb = T - TB;
  C.shake = af > 0 && af < .9 ? FILM.shake(T, 6 * (1 - af / .9), 24) : tb > 0 && tb < 1.2 ? FILM.shake(T, 7 * (1 - tb / 1.2), 22) : [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? 1 : .1; C.update();
  K.pb.clear();
  K.drawStars(STARS, .9, T);
  if (PROF) prof('stars');
  const seaT = SEA(T);
  drawGlobe(1, tb > -.4 && tb < 6 ? (tb < 0 ? 1 + tb / .4 : 1 - tb / 6) * .9 : 0); drawLimb(1);
  if (PROF) prof('globe');
  K.setLight(L_SITE);
  SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null, 1, seaT);
  if (PROF) prof('ground');
  const cAlt = V.dist(C.eye, CE) - RE;
  if (cAlt < 6000) drawCSea(T, seaT, 1 - ss(1500, 6000, cAlt));
  if (PROF) prof('csea');
  if (V.dist(C.eye, CVX.T) < 60000) drawCarrier(T);
  if (PROF) prof('carrier');
  drawSweep(T);
  for (let k = 0; k < 3; k++) drawPulse(k, T);
  if (PROF) prof('pulses');
  SITE.drawVehicles(T > TB - 1 ? tb : null);
  if (PROF) prof('vehicles');
  // the satellite, when the camera is near enough to matter
  if (V.dist(C.eye, SAT) < 150000) {
    K.setLight(L_SUN);
    const xr = xrOf(T), ra = T - T_ARR, sa = T - T_XR - .1;
    const rip = ra > -.1 && ra < 3.5 ? { p: P.hornTip, age: ra, v: 4.5, after: .2 * Math.exp(-ra) } : sa > 0 && sa < 3.5 ? { p: X.ap(P.W, [0, 0, 0]), age: sa, v: 3.2, after: .1 } : T - T_AIM > 0 && T - T_AIM < 3 ? { p: P.aperture, age: T - T_AIM, v: 6, after: 0 } : null;
    SAT_M.draw(P, st, { xr, rip, core: ss(35, 38.4, T), ringLit: ringLitOf(T), hornLit: ra > 0 && ra < 1 ? 1 - ra : 0, wingLit: 0 });
  if (PROF) prof('sat');
    drawSatFx(T, P, st);
  if (PROF) prof('satfx');
    K.setLight(L_SITE);
  }
  drawColumn(T);
  if (PROF) prof('column');
  drawStrike(T);
  if (PROF) prof('strike');
  if (T > TB - LEAD - .1) SITE.drawBolt(BOLT, tb, LEAD);
  if (PROF) prof('bolt');
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (af > 0 && af < .5) fl = .14 * Math.exp(-af * 8);
  if (tb > 0 && tb < .8) fl = Math.max(fl, .16 * Math.min(1, K.Bolt.stroke(tb)));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < T_CALM + 4) SITE.overlay(T, tb, 1 - ss(T_CALM + 1, T_CALM + 3.5, T));
  if (V.dist(C.eye, SAT) < 2000) partTags(T, P);
  markTags(T, P);
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
const cues = [
  [T_RW, () => SFX.tone(60, 140, 2.2, 'sawtooth', .012)], [4.2, () => SFX.noise(4, 300, .6, .012, 1)],
  [T_LOCK, () => SFX.tone(1400, 1400, .12, 'square', .014)],
  ...TE.map(t => [t, () => { SFX.tone(2400, 900, .35, 'sine', .04); SFX.tone(160, 60, .5, 'sine', .04); }]),
  [RIDE0 + .4, () => SFX.noise(7, 900, .4, .02, 3)],
  [T_ARR, () => { SFX.crack(); SFX.tone(1900, 1900, .08, 'square', .02); }],
  ...[0, 1, 2, 3, 4, 5].map(k => [T_ARR + .2 + .2 * k, tick]),
  [24.9, clunk], [25.4, clunk], [26.0, () => SFX.tone(90, 130, 2.6, 'sawtooth', .01)], [27.9, clunk], [29.0, clunk], [29.2, clunk],
  [29.8, () => SFX.tone(800, 2400, .5, 'sine', .012)], [30.3, clunk], [33.8, clunk],
  [34.3, () => SFX.tone(200, 260, 1.1, 'sawtooth', .01)],
  ...[0, 1, 2, 3, 4, 5, 6].map(j => [T_RING(j) + .75, () => { clunk(); tick(); }]),
  [35.2, () => SFX.tone(120, 1600, 3.4, 'sawtooth', .014)], [39.3, () => SFX.noise(2.8, 300, 1, .02, 1)],
  [42.0, () => SFX.tone(600, 2400, .6, 'square', .01)],
  [TFIRE, () => { SFX.crack(); SFX.rumble(3, .2); SFX.tone(900, 60, 1.6, 'sine', .06); }],
  [DOWN0 + .4, () => SFX.noise(5, 1600, .5, .03, 2.5)],
  [DOWN1, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(5, .22); }],
  ...[.4, .8, 1.3, 1.9, 2.6, 3.2, 3.9, 4.5].map(d => [TB + d, tick]),
  [66, () => SFX.tone(1400, 900, .3, 'square', .01)],
];
lap('load');
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ log: LOG, np: NP, S_UP, L2, T_ARR, PHI_LOCK, cam: T => camAt(T), prof: PROF, sweepA, AZ48, A0, D1, CSEA });
})();
