/* SCAN · SATELLITE (Point Cloud): a draft of the game's SCAN from orbit. A strike satellite 420 km up over the curve
   of the Earth, folded: a long rail spine, six coil rings, two solar wings, radiator fins. It unfolds in stages, slews
   to aim at the coast, spins its coils up (lime arcs), and fires a probe down the line. The probe falls through the
   atmosphere with a glowing entry trail (the flight shown at up to x14), bursts 9 km above a coastal battery and forks
   into the lime lightning scan, which identifies it part by part. The camera climbs back up the line to the
   satellite as it folds. One take, 40 s, loops. The satellite is held over the same ground for the whole take so the
   loop closes. Render is a pure function of film time T. */
(() => {
const { V, R, X, E, rng, noise, fbm } = M3;
const PI = Math.PI, DEG = PI / 180, TAU = PI * 2;
const K = SK; K.setup();
const C = K.C, octx = K.octx, LIME = K.LIME, HOT = K.HOT, WH = K.WH;
STAGE.fit(); STAGE.SFX.kind = 'pc';
const $ = id => document.getElementById(id);
const LOG = [];
const t0load = performance.now();

/* ---------- menu ---------- */
const menuEl = $('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><i class="sq"></i><span class="lab">${t}</span></div>`).join('');
const veil = $('veil');
STAGE.menu({ el: menuEl, blurb: $('blurb'), axis: 'h', onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; } });

/* ---------- time ---------- */
const DUR = 40;
const CHAPTERS = [
  { t: 0, title: 'Orbit' }, { t: 3, title: 'Deploy' }, { t: 10.6, title: 'Aim' }, { t: 14.4, title: 'Charge' },
  { t: 18, title: 'Fire' }, { t: 19.6, title: 'Entry' }, { t: 23, title: 'Strike' }, { t: 24.6, title: 'Scan' }, { t: 31.4, title: 'Stow' },
];
const TF = 18, TBU = 23, LEAD = .8, TB = TBU + .08 + LEAD;

/* ---------- the world: Earth centre below the battery ---------- */
const RE = 6371000, CE = [0, -RE, 0], ALT = 420000;
const SITE = K.makeSite({ seaR: 14000, landR: 14000, curve: RE });
const HIT = SITE.hitW, S_LOOK = [5, 21, 15];
LOG.push(`site ${(performance.now() - t0load).toFixed(0)} ms`);
// the satellite: 420 km up, 260 km downrange to the south-south-west of the battery
const TH = 260000 / RE, HD_ = V.norm([-.32, 0, -.95]);
const UP_S = V.norm([HD_[0] * Math.sin(TH), Math.cos(TH), HD_[2] * Math.sin(TH)]);
const SAT = V.add(CE, V.mul(UP_S, RE + ALT));
const B_TOP = V.add(HIT, [260, 9000, -520]);
const AIM = V.norm(V.sub(B_TOP, SAT));
// local frame at the satellite: ey up (radial), ez level toward the battery, ex across
const EY = UP_S, EZ = V.norm(V.sub(V.sub(HIT, SAT), V.mul(UP_S, V.dot(V.sub(HIT, SAT), UP_S)))), EX = V.cross(EY, EZ);
const LW = p => [SAT[0] + EX[0] * p[0] + EY[0] * p[1] + EZ[0] * p[2], SAT[1] + EX[1] * p[0] + EY[1] * p[1] + EZ[1] * p[2], SAT[2] + EX[2] * p[0] + EY[2] * p[1] + EZ[2] * p[2]];
const LINE = V.dist(SAT, B_TOP);

/* ---------- the globe: dots on the sphere round the battery, land brighter, the coastline brightest ---------- */
function coastBig(x) { return SITE.coastZ(x) + 42000 * noise(x / 230000, 3.3) * E.ss(15000, 80000, Math.abs(x)) + 90000 * fbm(x / 900000, 1.7, 2.2, 3) * E.ss(60000, 300000, Math.abs(x)); }
const GL = (() => {
  const A = [], r = rng(8080);
  const put = (x, z, sp) => {
    const d = Math.hypot(x, z); if (d < 13500) return;
    const cz = coastBig(x), m = z - cz, land = m > 0;
    const n = V.norm([x / RE, 1 - d * d / (2 * RE * RE), z / RE]);           // approx normal at arc offset (x, z)
    const k = d / RE, nn = V.norm([Math.sin(k) * x / (d || 1), Math.cos(k), Math.sin(k) * z / (d || 1)]);
    const coast = Math.exp(-Math.abs(m) / (sp * .6));
    let b;
    if (land) { const t = fbm(x / 60000, z / 60000, 4.4, 3); b = .22 + .18 * t + .1 * r() + .55 * coast; }
    else { if (r() > .45 + .5 * coast) return; b = .08 + .06 * r() + .5 * coast; }
    A.push(CE[0] + nn[0] * RE, CE[1] + nn[1] * RE, CE[2] + nn[2] * RE, Math.min(1, b));
  };
  for (let x = -480000; x < 480000; x += 3600) for (let z = -480000; z < 480000; z += 3600) { const xx = x + (r() - .5) * 3000, zz = z + (r() - .5) * 3000; if (r() < 1 - E.ss(260000, 470000, Math.hypot(xx, zz))) put(xx, zz, 3600); }
  // far: out to the horizon seen from orbit (~2300 km), coarser
  for (let x = -2600000; x < 2600000; x += 17000) for (let z = -2600000; z < 2600000; z += 17000) {
    const xx = x + (r() - .5) * 13000, zz = z + (r() - .5) * 13000;
    if (r() > E.ss(260000, 470000, Math.hypot(xx, zz))) continue;
    if (Math.hypot(xx, zz) > 2600000) continue;
    put(xx, zz, 17000);
  }
  // coastline trace: a denser run of dots along the shore
  for (let x = -2600000; x < 2600000; x += x > -480000 && x < 480000 ? 900 : 4000) { const z = coastBig(x) + (r() - .5) * 600; if (Math.hypot(x, z) < 13500 || Math.hypot(x, z) > 2600000) continue; const d = Math.hypot(x, z), k = d / RE; A.push(CE[0] + Math.sin(k) * x / d * RE, CE[1] + Math.cos(k) * RE, CE[2] + Math.sin(k) * z / d * RE, .8); }
  return new Float64Array(A);
})();
const NGL = GL.length / 4;
LOG.push(`globe ${NGL} ${(performance.now() - t0load).toFixed(0)} ms`);
function drawGlobe(vis) {
  const e = C.eye, f = C.f, r = C.r, u = C.u, F = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
  const alt = V.dist(e, CE) - RE; if (alt < 3000) return;
  const fade = vis * E.ss(3000, 30000, alt);
  if (fade < .01) return;
  for (let k = 0; k < NGL; k++) {
    const j = k * 4, px = GL[j], py = GL[j + 1], pz = GL[j + 2];
    const dx = px - e[0], dy = py - e[1], dz = pz - e[2];
    // far side of the globe
    if ((px - CE[0]) * dx + (py - CE[1]) * dy + (pz - CE[2]) * dz > 0) continue;
    const zc = dx * f[0] + dy * f[1] + dz * f[2]; if (zc < 50) continue;
    const sx = cx + F * (dx * r[0] + dy * r[1] + dz * r[2]) / zc; if (sx < 0 || sx >= 1920) continue;
    const sy = cy - F * (dx * u[0] + dy * u[1] + dz * u[2]) / zc; if (sy < 0 || sy >= 1080) continue;
    const bb = GL[j + 3] * fade * 1.7;
    K.dot(sx, sy, zc > 150000 && bb > .3 ? 2 : 1, 236, 238, 230, bb > 1 ? 1 : bb);
  }
}
/* the limb: the tangent circles of a few shells of atmosphere, a thin band of dots */
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

/* ---------- the satellite (model frame: +Z the spine / muzzle, +Y away from the Earth) ---------- */
const G = GEO, LVS = [.03, .06, .12, .24, .48];
const RC = 1.0;                                            // coil radius
const P_BUS = (() => {
  const P = [G.box([-1.1, -1.1, -5.2], [1.1, 1.1, -2], { bottom: true })];
  for (const [x, y] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) P.push(G.cyl([x, y, -6.3], [x, y, -5.2], .32, { n: 16, gen: 3, caps: true }));   // capacitor banks
  for (const [x, y] of [[-.5, 0], [.5, 0], [0, .5], [0, -.5]]) P.push(G.lathe([x, y, -6.35], [0, 0, -1], [[0, .08], [.35, .2]], { n: 12, gen: 2 }));     // thrusters
  P.push(G.lathe([0, 1.1, -3.4], [0, 1, 0], [[0, .06], [.35, .06], [.4, .5], [.55, .75]], { n: 26, gen: 6, rings: [3] }));                          // dish
  P.push(G.box([-1.1, .3, -2.6], [-1.45, .75, -2.1]), G.box([1.1, .3, -2.6], [1.45, .75, -2.1]));                                                    // star trackers
  for (let z = -4.9; z < -2.2; z += .45) for (const s of [-1, 1]) P.push(G.line([[s * 1.12, -1, z], [s * 1.12, 1, z]], { w: .5 }));
  return P;
})();
const railsP = (z0, z1, hw, hh, n) => {
  const P = [];
  for (const s of [-1, 1]) P.push(G.box([s * .38 - hw, -hh, z0], [s * .38 + hw, hh, z1]));
  for (let k = 0; k <= n; k++) { const z = z0 + (z1 - z0) * k / n; P.push(G.line([[-.38, hh, z], [.38, hh, z]], { w: .6 }), G.line([[-.38, -hh, z], [.38, -hh, z]], { w: .6 })); if (k < n) { const z2 = z0 + (z1 - z0) * (k + 1) / n; P.push(G.line([[-.38, hh, z], [.38, hh, z2]], { w: .4 }), G.line([[.38, -hh, z], [-.38, -hh, z2]], { w: .4 })); } }
  return P;
};
const P_SPINE = railsP(-2, 6.2, .08, .22, 8);
const P_FRONT = (() => { const P = railsP(-1, 7.6, .065, .18, 8); P.push(G.lathe([0, 0, 7.4], [0, 0, 1], [[0, .55], [.2, .62], [.5, .62], [.6, .5]], { n: 36, gen: 8, rings: [1, 2] })); return P; })();
const P_COIL = (() => {
  const P = [G.lathe([0, 0, -.16], [0, 0, 1], [[0, RC], [.32, RC]], { n: 70, gen: 0, rings: [0, 1] })];
  P.push(G.lathe([0, 0, -.12], [0, 0, 1], [[0, RC - .16], [.24, RC - .16]], { n: 60, gen: 0 }));
  for (let k = 0; k < 20; k++) { const a = k / 20 * TAU, c = Math.cos(a), s = Math.sin(a), r0 = RC - .01, r1 = RC + .1, w = .06; P.push(G.hex([[r0 * c - w * s, r0 * s + w * c, -.17], [r0 * c + w * s, r0 * s - w * c, -.17], [r0 * c + w * s, r0 * s - w * c, .17], [r0 * c - w * s, r0 * s + w * c, .17], [r1 * c - w * s, r1 * s + w * c, -.17], [r1 * c + w * s, r1 * s - w * c, -.17], [r1 * c + w * s, r1 * s - w * c, .17], [r1 * c - w * s, r1 * s + w * c, .17]])); }
  for (const a of [PI * .25, PI * .75, PI * 1.25, PI * 1.75]) P.push(G.line([[(RC - .16) * Math.cos(a), (RC - .16) * Math.sin(a), 0], [.45 * Math.cos(a), .45 * Math.sin(a), 0]], { w: .8 }));
  return P;
})();
const PW = 2.3, PZ0 = -5.0, PZ1 = -2.2;                   // solar panel width (x) and z span
const P_PANEL = (() => {
  const P = [G.panel([[0, 0, PZ0], [PW, 0, PZ0], [PW, 0, PZ1], [0, 0, PZ1]])];
  for (let x = .23; x < PW; x += .46) P.push(G.line([[x, .01, PZ0], [x, .01, PZ1]], { w: .5 }));
  P.push(G.line([[0, .01, PZ0], [PW, .01, PZ0], [PW, .01, PZ1], [0, .01, PZ1]], { w: .9, closed: true }));
  return P;
})();
const P_FIN = (() => {
  const P = [G.panel([[-.9, 0, 0], [.9, 0, 0], [.9, 0, 3.0], [-.9, 0, 3.0]])];
  for (let z = .3; z < 3; z += .3) P.push(G.line([[-.88, .01, z], [.88, .01, z]], { w: .6 }));
  P.push(G.cyl([-.9, 0, 0], [.9, 0, 0], .05, { n: 8, gen: 0 }));
  return P;
})();
const CL = {
  bus: K.lodPrims(P_BUS, LVS, 31, .8), spine: K.lodPrims(P_SPINE, LVS, 32, .8), front: K.lodPrims(P_FRONT, LVS, 33, .8),
  coil: K.lodPrims(P_COIL, LVS, 34, .7), panel: K.lodPrims(P_PANEL, LVS, 35, .8), fin: K.lodPrims(P_FIN, LVS, 36, .8),
};
LOG.push(`sat ${(performance.now() - t0load).toFixed(0)} ms`);
// coils: [on the front section?, z]
const COILS = [[0, .4], [0, 2.3], [0, 4.2], [1, 1.2], [1, 3.1], [1, 5.0]];

/* ---------- state ---------- */
const kk = (T, a, b) => E.inOut(E.sat((T - a) / (b - a)));
const ST = { wing: 0, fin: 0, ext: 0, coil: [0, 0, 0, 0, 0, 0], slew: 0, rec: 0 };
function stateAt(T) {
  ST.wing = kk(T, 3.0, 6.2) * (1 - kk(T, 36.4, 39.2));
  ST.fin = kk(T, 5.4, 7.2) * (1 - kk(T, 35.6, 37.0));
  ST.ext = 7.2 * kk(T, 6.8, 8.6) * (1 - kk(T, 33.8, 35.4));
  for (let k = 0; k < 6; k++) ST.coil[k] = kk(T, 8.4 + .3 * k, 8.95 + .3 * k) * (1 - kk(T, 32.2 + .26 * (5 - k), 32.75 + .26 * (5 - k)));
  ST.slew = kk(T, 10.6, 14.2) * (1 - kk(T, 35.0, 38.6));
  const a = T - TF;
  ST.rec = a > 0 && a < 2 ? .5 * (a < .03 ? a / .03 : Math.exp(-(a - .03) * 2.2)) : 0;
  return ST;
}
// attitude: level along the orbit (spine across the line of sight to the coast) -> aimed down the line
const Q0 = K.Q.fromR(R.look(EX, EY)), Q1 = K.Q.fromR(R.look(AIM, EY));
const pivZ = (a, h) => { const Rm = R.z(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const pivX = (a, h) => { const Rm = R.x(a), rh = R.ap(Rm, h); return X.make(Rm, [h[0] - rh[0], h[1] - rh[1], h[2] - rh[2]]); };
const tr = (x, y, z) => X.make(R.I(), [x, y, z]);
// coil spin: integrated so it is exact at every T and whole turns per loop
const SPIN = (() => {
  const N = DUR * 60, A = new Float64Array(N + 1), om = t => 16 * E.ss(14.6, 17.8, t) * (1 - E.ss(18.1, 22.5, t));
  for (let k = 1; k <= N; k++) A[k] = A[k - 1] + om((k - .5) / 60) / 60;
  const sc = (Math.round(A[N] / TAU) * TAU || TAU) / A[N];
  return T => { const x = E.clamp(T, 0, DUR) * 60, k = Math.min(N - 1, Math.floor(x)); return (A[k] + (A[k + 1] - A[k]) * (x - k)) * sc; };
})();
const XF = {};
function satXf(T, st) {
  const Rm = K.Q.toR(K.Q.slerp(Q0, Q1, st.slew));
  const W = X.make(Rm, V.add(SAT, V.mul(X.dir({ R: Rm, T: [0, 0, 0] }, [0, 0, 1]), -st.rec)));
  XF.sat = W;
  XF.front = X.mul(W, tr(0, 0, st.ext - .6));
  const sp = SPIN(T);
  XF.coil = COILS.map(([fr, z], k) => X.mul(X.mul(X.mul(fr ? XF.front : W, tr(0, 0, z)), pivX(PI / 2 * (1 - st.coil[k]), [0, -RC, 0])), X.make(R.z(sp * (k % 2 ? -1 : 1) * st.coil[k]), [0, 0, 0])));
  // solar wings: accordion of three panels each side
  XF.panels = [];
  for (const s of [-1, 1]) {
    const f = 1 - st.wing;
    let T0 = X.mul(W, X.make(s > 0 ? R.I() : R.z(PI), [s * 1.1, 0, 0]));       // mirrored for the port wing
    T0 = X.mul(T0, X.make(R.z(PI / 2 * f), [0, 0, 0]));
    XF.panels.push(T0);
    let Tk = T0;
    for (let j = 1; j < 3; j++) { Tk = X.mul(Tk, X.mul(tr(PW, 0, 0), X.make(R.z((j % 2 ? -1 : 1) * PI * f * .985), [0, 0, 0]))); XF.panels.push(Tk); }
  }
  XF.fins = [];
  for (const [s, x] of [[1, -.6], [1, .6], [-1, -.6], [-1, .6]]) XF.fins.push(X.mul(W, X.mul(tr(x * 0, s * 1.1, -5.2), X.mul(X.make(R.x(-s * 125 * DEG * st.fin), [0, 0, 0]), X.make(s > 0 ? R.I() : R.z(PI), [x, 0, 0])))));
  XF.muzzle = X.ap(XF.front, [0, 0, 7.9]);
  return XF;
}

/* ---------- the probe down the line ---------- */
const MZ0 = (() => { const st = Object.assign({}, stateAt(TF - .01), { rec: 0 }); satXf(TF, st); return XF.muzzle.slice(); })();
const L0 = V.dist(MZ0, B_TOP), VP = 8200, S1 = L0 / VP;
const WARP = FILM.warp([{ t: 0, rate: 1 }, { t: .25, rate: 1 }, { t: 1.3, rate: 14 }, { t: 3.6, rate: 14 }, { t: TBU - TF, rate: 3 }]);
const WS = S1 / WARP.total;
const flyS = T => T <= TF ? 0 : T >= TBU ? S1 : WARP(T - TF) * WS;
const flyRate = T => T <= TF || T >= TBU ? 1 : WARP.rate(T - TF) * WS;
const DIRP = V.norm(V.sub(B_TOP, MZ0));
const probeAt = s => V.add(MZ0, V.mul(DIRP, VP * s));
const altOf = p => V.dist(p, CE) - RE;
const TRN = 700;
const BOLT = new K.Bolt({ top: B_TOP, hit: HIT, seed: 2207, depth: 8, nb: 12, rough: .6, spark: 24 });
const BURST = (() => { const r = rng(515), A = new Float32Array(420 * 4); for (let i = 0; i < 420; i++) { const u = r() * 2 - 1, a = r() * TAU, h = Math.sqrt(1 - u * u); A[i * 4] = Math.cos(a) * h; A[i * 4 + 1] = u; A[i * 4 + 2] = Math.sin(a) * h; A[i * 4 + 3] = .5 + .5 * r(); } return A; })();
const PLASMA = (() => { const r = rng(919), A = new Float32Array(300 * 4); for (let i = 0; i < 300; i++) { const a = r() * TAU, q = Math.sqrt(r()); A[i * 4] = Math.cos(a) * q; A[i * 4 + 1] = Math.sin(a) * q; A[i * 4 + 2] = r(); A[i * 4 + 3] = r(); } return A; })();

/* ---------- camera ---------- */
const [PX_, PY_] = GEO.perp(AIM);
const upA = V.norm(V.sub(EY, V.mul(AIM, V.dot(EY, AIM))));
const EYE_F = V.add(V.add(SAT, V.mul(AIM, -46)), V.add(V.mul(upA, 11), V.mul(EX, 5)));    // behind the satellite, down the line
const TGT_F = V.add(SAT, V.mul(AIM, 120));
const LK = (t, e, g, fov) => ({ t, eye: LW(e), target: LW(g), fov });
const PATH_A = FILM.path([
  LK(0, [23, 5, -15], [0, -1.5, 2], 42),
  LK(3.6, [19, 8, -21], [0, -1, 1.5], 42),
  LK(7.4, [-17, 7, -19], [0, -1, 3.5], 44),
  LK(10.8, [-27, 4, 5], [0, -1.5, 6], 44),
  { t: 14.6, eye: V.add(SAT, V.add(V.mul(AIM, 2), V.add(V.mul(PX_, 30), V.mul(upA, 7)))), target: V.add(SAT, V.mul(AIM, 4.5)), fov: 46 },
  { t: 16.6, eye: V.add(SAT, V.add(V.mul(AIM, 14), V.add(V.mul(PX_, 22), V.mul(upA, 5)))), target: V.add(SAT, V.mul(AIM, 5)), fov: 48 },
  { t: TF - .2, eye: EYE_F, target: TGT_F, fov: 42 },
]);
function camB(T) {
  const u = E.ss(TF + .2, TBU, T);
  const eye = V.lerp(EYE_F, V.add(SAT, V.add(V.mul(AIM, -38), V.mul(upA, 7))), u);
  const target = V.lerp(TGT_F, B_TOP, E.ss(TF, TF + 2, T));
  return { eye, target, fov: (42 - 32 * E.ss(TF + .6, TBU - .2, T)) * DEG };
}
const EB = camB(TBU).eye, DIR0 = V.norm(V.sub(EB, HIT)), D0 = V.dist(EB, HIT);
const AZ0 = Math.atan2(DIR0[0], DIR0[2]), EL0 = Math.asin(DIR0[1]);
const sph = (az, el) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
const azC = T => AZ0 + 26 * DEG * E.ss(24.5, 30, T);
const elC = T => E.mix(EL0, 38 * DEG, E.ss(23.6, 25.8, T));
const DCLOSE = 118;
function camC(T) {
  const dist = K.logMix(D0, DCLOSE, .25 * E.ss(TBU, TB, T) + .75 * E.ss(TB - .1, 25.9, T));
  const eye = V.add(HIT, V.mul(sph(azC(T), elC(T)), dist));
  const target = V.lerp(B_TOP, S_LOOK, E.ss(TBU + .2, TB + .5, T));
  return { eye, target, fov: (10 + 20 * E.ss(TB - .3, 25.4, T)) * DEG };
}
const PATH_E = FILM.path([
  LK(33.6, [-6, 9, -32], [0, -1, 2], 42),
  LK(36.6, [-22, 6, -12], [0, -1, 1.5], 42),
  LK(DUR, [23, 5, -15], [0, -1.5, 2], 42),
]);
const E_E = PATH_E(33.6);
function camD(T) {
  const u = E.ss(30.0, 32.6, T);
  const dist = K.logMix(DCLOSE, V.dist(E_E.eye, HIT), u);
  const dir = V.norm(V.lerp(sph(azC(T), elC(T)), V.norm(V.sub(E_E.eye, HIT)), E.ss(30.4, 33.2, T)));
  const eye = V.add(HIT, V.mul(dir, dist));
  const target = V.lerp(S_LOOK, E_E.target, E.ss(31.2, 33.4, T));
  const fov = E.mix(30, 42, E.ss(30, 33.6, T));
  return { eye, target, fov: fov * DEG };
}
const DBGCAM = (() => { let spec = STAGE.Q.get('cam'); try { if (!spec && window.parent !== window) spec = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {} return spec ? spec.split(',').map(Number) : null; })();
function camAt(T) {
  if (DBGCAM) return { eye: LW(DBGCAM.slice(0, 3)), target: LW(DBGCAM.slice(3, 6)), fov: (DBGCAM[6] || 40) * DEG };
  if (T < TF - .2) return PATH_A(T);
  if (T < TBU - .2) return camB(T);
  if (T < TBU + .3) return K.blendShot(camB(T), camC(T), E.ss(TBU - .2, TBU + .3, T));
  if (T < 30) return camC(T);
  if (T < 33.6) return camD(T);
  return PATH_E(T);
}

/* ---------- drawing ---------- */
const SO = { a: 1.35, fade: 260, lime: 0, px: 2.4, px0: 6 };
function drawSat(T, st, chg) {
  const lock = t0 => { const a = T - t0; return a > 0 && a < .5 ? Math.exp(-a * 7) : 0; };
  SO.lime = 0; K.drawLod(CL.bus, XF.sat, SO);
  SO.lime = Math.max(.35 * chg, .6 * lock(8.6)); K.drawLod(CL.spine, XF.sat, SO); K.drawLod(CL.front, XF.front, SO);
  for (let k = 0; k < 6; k++) { SO.lime = Math.max(.6 * chg, .8 * lock(8.95 + .3 * k)); K.drawLod(CL.coil, XF.coil[k], SO); }
  SO.lime = .6 * lock(6.2); for (const P of XF.panels) K.drawLod(CL.panel, P, SO);
  SO.lime = .6 * lock(7.2); for (const P of XF.fins) K.drawLod(CL.fin, P, SO);
  SO.lime = 0;
}
const CQ = [0, 0, 0], CR = [0, 0, 0];
function coilPt(k, a, r, out) { const p = X.ap(XF.coil[k], [Math.cos(a) * r, Math.sin(a) * r, 0]); out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; }
function drawCharge(T, q) {
  if (q < .01) return;
  const fr = Math.floor(T * 30), n = Math.floor(3 + 20 * q);
  for (let i = 0; i < n; i++) {
    const h1 = K.hh(i * 3.7, fr), h2 = K.hh(i * 5.3 + 1, fr), h3 = K.hh(i * 1.9 + 7, fr);
    const k = Math.floor(h1 * 6), a = h2 * TAU;
    if (h3 < .5) { coilPt(k, a, RC + .12, CQ); coilPt(k, a + .4 + h3, RC + .12, CR); K.arcW(CQ, CR, i + fr * .1, T, (.5 + .6 * q) * (.6 + .4 * h3), .45); }
    else if (k < 5) { coilPt(k, a, RC, CQ); coilPt(k + 1, a + (h3 - .75), RC, CR); K.arcW(CQ, CR, i * 7 + 3, T, .35 + .65 * q, .25); }
  }
  for (let k = 0; k < 6; k++) for (let j = 0; j < 4; j++) { coilPt(k, j * TAU / 4, RC + .12, CQ); K.dotW(CQ[0], CQ[1], CQ[2], 2, HOT, .8); K.glowW(CQ[0], CQ[1], CQ[2], 10, LIME, .1 + .25 * q); }
}
function drawFire(T) {
  const a = T - TF; if (a < 0 || a > 2.5) return;
  const m = MZ0;
  if (a < .7) { K.glowW(m[0], m[1], m[2], Math.round(40 + 300 * Math.exp(-a * 8)), HOT, .9 * Math.exp(-a * 5)); K.glowW(m[0], m[1], m[2], 120, LIME, .4 * Math.exp(-a * 4)); }
  // a plasma ring blown off the muzzle, expanding in vacuum
  const r = 1 + 60 * Math.pow(a, .7), A = Math.max(0, 1 - a / 2.5);
  const c = V.add(m, V.mul(AIM, 2 + 6 * a));
  K.ringW(c, PX_, PY_, r, 600, 2, HOT, .8 * A, 0);
  K.ringW(c, PX_, PY_, r * .9, 400, 1, LIME, .5 * A, .4);
}
function drawProbe(T) {
  if (T < TF || T > TB + 3) return;
  const s = flyS(T), vis = 1 - E.ss(TB, TB + 2.5, T);
  // the line: a faint ion trail in vacuum, a glowing plasma trail below 100 km
  for (let i = 0; i < TRN; i++) {
    const f = (i + .5) / TRN, sp = f * S1; if (sp > s) break;
    const p = V.add(MZ0, V.mul(DIRP, VP * sp)), alt = altOf(p);
    const age = s - sp + (T > TBU ? T - TBU : 0);
    const air = E.ss(100000, 40000, alt);
    const b = vis * (air * (.3 + .7 * Math.exp(-age / 4)) + (1 - air) * .35 * Math.exp(-age / 8));
    K.dotW(p[0], p[1], p[2], air > .3 ? 2 : 1, air > .5 && age < 3 ? HOT : LIME, b);
    if (air > .2 && (i & 1) === 0) K.glowW(p[0], p[1], p[2], 12, LIME, .12 * b * air);
  }
  if (T < TBU) {
    const p = probeAt(s), alt = altOf(p), air = E.ss(110000, 30000, alt);
    K.dotW(p[0], p[1], p[2], 3, [255, 255, 255], 1);
    K.glowW(p[0], p[1], p[2], Math.round(18 + 60 * air), air > .2 ? HOT : LIME, .45 + .4 * air);
    // the plasma sheath: dots streaming back off the nose
    if (air > .02) for (let i = 0; i < 300; i++) {
      const o = i * 4, back = PLASMA[o + 2] * 900 * air, rad = 60 * air * PLASMA[o + 2];
      const q = V.add(p, V.add(V.mul(DIRP, -back), V.add(V.mul(PX_, PLASMA[o] * rad), V.mul(PY_, PLASMA[o + 1] * rad))));
      K.dotW(q[0], q[1], q[2], 1, PLASMA[o + 3] < .4 ? LIME : HOT, air * (1 - PLASMA[o + 2]) * .9);
    }
  }
}
function drawBurst(T) {
  const a = T - TBU; if (a < 0 || a > 2.2) return;
  const p = B_TOP, r = 380 * (1 - Math.exp(-a * 2.6)), A = Math.max(0, 1 - a / 2.2);
  if (a < .5) K.glowW(p[0], p[1], p[2], Math.round(60 + 240 * Math.exp(-a * 6)), HOT, .9 * Math.exp(-a * 4));
  K.glowW(p[0], p[1], p[2], 110, LIME, .25 * A);
  for (let i = 0; i < 420; i++) { const o = i * 4, rr = r * BURST[o + 3]; K.dotW(p[0] + BURST[o] * rr, p[1] + BURST[o + 1] * rr - 40 * a * a, p[2] + BURST[o + 2] * rr, i % 5 ? 1 : 2, i % 3 ? LIME : HOT, A * (.5 + .5 * BURST[o + 3])); }
}
/* the satellite marked when too small to read */
const T_SAT = K.mkTag();
function satMark() {
  const b = K.boxOf([-6, -2, -6.5], [6, 2, 15], XF.sat, 3); if (!b) return;
  const px = Math.max(b[2] - b[0], b[3] - b[1]); if (px > 160 || b[2] < 0 || b[0] > 1920 || b[3] < 0 || b[1] > 1080) return;
  const a = 1 - E.ss(90, 160, px);
  K.bracket(b, '#C6F432', .85 * a, 6, 1.2);
  K.setTag(T_SAT, 'SAT', 'SCAN RAIL', `${Math.round(ALT / 1000)} KM`, 'lime sm', b[2] + 8, b[1] - 4, a);
}
const UT = [
  ['WING', 'Solar wings ×2', '6 panels', () => XF.panels[2], [PW, 0, (PZ0 + PZ1) / 2], 6.2, 8.3],
  ['RAD', 'Radiators ×4', '', () => XF.fins[1], [0, 0, 2.8], 7.3, 9.3],
  ['COIL', 'Coils ×6', 'locked', () => XF.coil[4], [RC + .1, 0, 0], 10.9, 13.2],
  ['RAIL', 'Rail spine', '16.4 m', () => XF.front, [.4, 0, 7.6], 8.7, 10.8],
].map(([id, lab, val, fr, at, t0, t1]) => ({ id, lab, val, fr, at, t0, t1, tg: K.mkTag() }));
function unitTags(T) {
  for (const t of UT) {
    if (T < t.t0 || T > t.t1) continue;
    const a = E.sat((T - t.t0) / .2) * (1 - E.sat((T - t.t1 + .4) / .4));
    const p = X.ap(t.fr(), t.at); if (!K.pj(p[0], p[1], p[2])) continue;
    const x = K.PJ[0], y = K.PJ[1];
    K.leader(x, y, x + 46, y - 46, '#C6F432', .8 * a);
    K.dot(x, y, 3, LIME[0], LIME[1], LIME[2], a);
    K.setTag(t.tg, t.id, K.decode(t.lab, E.sat((T - t.t0) / .6), T, t.id.length), t.val, 'lime sm', x + 50, y - 60, a);
  }
}
const ro = $('ro'), kick = $('kick');
let roTxt = '', kickTxt = '';
const km = m => (m / 1000).toFixed(1);
function readout(T) {
  const ci = CHAPTERS.reduce((a, c, i) => c.t <= T ? i : a, 0);
  const kt = `0${ci + 1} · ${CHAPTERS[ci].title}`;
  if (kt !== kickTxt) { kickTxt = kt; kick.textContent = kt; }
  let l1, l2, rate = 1;
  const st = ST;
  if (T < 3 || T > 39.2) { l1 = `Orbit · <b>${km(ALT)} km</b>`; l2 = 'Scan rail <b>stowed</b>'; }
  else if (T < 10.6) { l1 = 'Scan rail · <b>deploying</b>'; l2 = T < 6.8 ? `Wings <b>${Math.round(st.wing * 100)} %</b>` : T < 8.6 ? `Spine <b>${(9.2 + st.ext).toFixed(1)} m</b>` : `Coils <b>${st.coil.filter(c => c > .98).length}/6</b>`; }
  else if (T < 14.4) { l1 = `Slew · <b>${Math.round((1 - st.slew) * Math.acos(E.clamp(V.dot(EX, AIM), -1, 1)) / DEG)}°</b> to go`; l2 = `Target <b>coast · ${km(LINE)} km</b>`; }
  else if (T < TF) { l1 = `Coils · <b>${Math.round(16 * E.ss(14.6, 17.8, T) * 60 / TAU * 10) * 10} rpm</b>`; l2 = `Charge <b>${Math.round(100 * E.ss(14.6, 17.8, T))} %</b>`; }
  else if (T < TBU) { const s = flyS(T), p = probeAt(s); rate = flyRate(T); l1 = `Probe · <b>alt ${km(altOf(p))} km</b>`; l2 = `<b>${VP} m/s</b> · ${altOf(p) < 100000 ? 'entry' : 'coast'}`; }
  else if (T < TB) { l1 = `Probe · <b>burst · ${km(B_TOP[1])} km</b>`; l2 = `Leader <b>${Math.round(100 * E.sat((T - TBU - .08) / LEAD))} %</b>`; }
  else if (T < 31.4) { const n = SITE.V.filter(v => T - TB > v.tF + 2.4).length; l1 = `Scan · <b>${SITE.V.length} contacts</b>`; l2 = `Identified <b>${n}/${SITE.V.length}</b> · slant <b>${km(LINE)} km</b>`; }
  else { l1 = 'Scan rail · <b>stowing</b>'; l2 = T < 33.6 ? 'Coils <b>folding</b>' : T < 35.4 ? `Spine <b>${(9.2 + st.ext).toFixed(1)} m</b>` : `Wings <b>${Math.round(st.wing * 100)} %</b>`; }
  const sim = T < TF ? T - TF : T < TBU ? flyS(T) : S1 + (T - TBU);
  const rateTxt = rate > 1.08 ? `<span class="l">×${rate.toFixed(1)}</span>` : '×1';
  const html = `${l1}<br>${l2}<br>${K.fmtClock(T > 36 ? T - DUR - TF : sim)} · ${rateTxt}`;
  if (html !== roTxt) { roTxt = html; ro.innerHTML = html; }
}

/* ---------- render ---------- */
const L_SAT = V.norm(V.add(V.mul(EY, .5), V.add(V.mul(EX, .6), V.mul(EZ, -.4)))), L_SITE = [-.4, .6, -.7];
let NP = 0;
function render(T) {
  K.beginTags();
  const st = stateAt(T);
  satXf(T, st);
  FILM.apply(C, camAt(T));
  const af = T - TF, tb = T - TB;
  C.shake = af > 0 && af < .8 ? FILM.shake(T, 5 * (1 - af / .8), 24) : tb > 0 && tb < .8 ? FILM.shake(T, 3 * (1 - tb / .8), 22) : [0, 0];
  const alt = V.dist(C.eye, CE) - RE;
  C.near = alt > 100000 ? 1 : .1; C.update();
  K.pb.clear();
  K.drawStars(STARS, .9, T);
  drawGlobe(1); drawLimb(1);
  SITE.drawGround(T, T > TB - LEAD - .2 ? tb : null, 1);
  K.setLight(L_SAT);
  const chg = E.ss(14.6, 17.8, T) * (1 - E.ss(TF, TF + .3, T));
  drawSat(T, st, chg);
  K.setLight(L_SITE);
  SITE.drawVehicles(T > TB - 1 ? tb : null);
  drawCharge(T, chg);
  drawFire(T); drawProbe(T); drawBurst(T);
  if (T > TBU) SITE.drawBolt(BOLT, tb, LEAD);
  octx.clearRect(0, 0, 1920, 1080);
  let fl = 0;
  if (af > 0 && af < .4) fl = .08 * Math.exp(-af * 10);
  if (tb > 0 && tb < .7) fl = Math.max(fl, .1 * Math.min(1, K.Bolt.stroke(tb)));
  if (fl > .004) { octx.fillStyle = `rgba(232,246,214,${fl.toFixed(3)})`; octx.fillRect(0, 0, 1920, 1080); }
  if (T > TB - 1.2 && T < 31) SITE.overlay(T, tb, 1 - E.ss(29.6, 30.6, T));
  unitTags(T);
  satMark();
  readout(T);
  K.pb.blit();
  K.endTags();
  NP = K.npts();
}

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const clunk = () => { SFX.tone(120, 70, .22, 'square', .03); SFX.noise(.2, 500, 1, .04, .005); };
const cues = [
  [3.0, () => SFX.tone(90, 130, 3, 'sawtooth', .01)], [6.2, clunk], [7.2, clunk], [8.6, clunk],
  ...[0, 1, 2, 3, 4, 5].map(k => [8.95 + .3 * k, () => SFX.tone(1650, 1650, .05, 'square', .012)]),
  [10.6, () => SFX.noise(3.4, 300, 1, .02, 1)], [14.6, () => SFX.tone(120, 1400, 3.4, 'sawtooth', .014)],
  [TF, () => { SFX.crack(); SFX.tone(900, 90, 1.2, 'sine', .05); }],
  [20.5, () => SFX.noise(2.5, 1600, .5, .03, 1.5)],
  [TBU, () => SFX.crack()], [TB, () => { SFX.crack(); SFX.rumble(4, .16); }],
  [TB + .5, () => SFX.tone(1650, 1650, .05, 'square', .012)], [TB + 1.2, () => SFX.tone(1650, 1650, .05, 'square', .012)],
  [32.2, () => SFX.tone(1400, 900, .3, 'square', .01)], [35.4, clunk], [37.0, clunk], [39.2, clunk],
];
LOG.push(`load ${(performance.now() - t0load).toFixed(0)} ms`);
FILM.run({ duration: DUR, chapters: CHAPTERS, render, cues });
STAGE.dbg = () => ({ log: LOG, np: NP, line: LINE, S1, sat: SAT, aim: AIM });
})();
