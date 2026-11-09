/* Orbital A "Scale · Strike" (combat edition): powers of ten, with a fight in the middle. One take from a
   satellite in a 900 km orbit down the map to the battery; both TELs ripple four 3M55; the lens rides the
   first round through its launch, then drops back through the four over the sea until it flies with the
   last. The destroyer group ahead fights back: SM-6s off the decks stop two rounds, the Phalanx stops a
   third close in, the fourth hits, seen from under two kilometres. Then back up to the same satellite,
   every track on the map with its own ring.
   render(T) is a pure function of film time: flights, interceptors, tracers, debris and smoke are
   integrated or seeded once at load. */
(() => {
'use strict';
const { V, R, X, E, Cam } = M3;
STAGE.fit(); STAGE.SFX.kind = 'orb';
const D2R = Math.PI / 180, TAU = Math.PI * 2, DUR = 175;
const { RE, C, GH } = OA;
const HI = '#F4D23C', WH = '#F6F5F2';

/* ---------- menu ---------- */
const menuEl = document.getElementById('menu');
menuEl.innerHTML = STAGE.ITEMS.map((t, i) => `<div class="it" data-item><span class="n">0${i + 1}</span><span class="lab">${ORB.swipe('oa' + t, { a: 1 })}<span class="tx">${t}</span></span><span class="go">↵</span><i class="bar"></i></div>`).join('');
const veil = document.getElementById('veil');
STAGE.menu({
  el: menuEl, blurb: document.getElementById('blurb'),
  onEnter(i) { if (i === 4) { veil.classList.add('on'); setTimeout(() => veil.classList.remove('on'), 1900); return 2600; } return 1900; },
});

/* ---------- canvas + renderers ---------- */
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let K = 1;
function size() { K = Math.min(2, Math.max(1, (devicePixelRatio || 1) * STAGE.scale)); cv.width = 1920 * K; cv.height = 1080 * K; }
size(); addEventListener('resize', () => { STAGE.fit(); size(); });
const cam = new Cam(); cam.near = .05;
const WM = new Wire(cam, { fog: [1e13, 2e13] });      // map + globe (projected by OA.segW)
/* models, smoke, sea near the lens; with a near fade too, a shallow depth of field for the macro shots */
class WireDOF extends Wire {
  fogK(z) { const [a, b] = this.fog, n = this.near; let k = z <= a ? 1 : z >= b ? 0 : 1 - (z - a) / (b - a); if (n && z < n[1]) k *= z <= n[0] ? 0 : (z - n[0]) / (n[1] - n[0]); return k; }
}
const WL = new WireDOF(cam, { fog: [1e13, 2e13] }); WL.near = null;
OA.bind(cam, WM);

/* ---------- deterministic helpers ---------- */
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function orth(u, f) { const d = V.dot(u, f); let o = [u[0] - f[0] * d, u[1] - f[1] * d, u[2] - f[2] * d]; const l = V.len(o); if (l < 1e-9) o = Math.abs(f[1]) < .9 ? [0, 1, 0] : [0, 0, 1]; return V.norm(o); }
const tangentN = p => { const r = OA.upAt(p); return V.norm(V.sub([0, 0, 1], V.mul(r, r[2]))); };
const sm5 = t => (t = E.sat(t), t * t * t * (t * (t * 6 - 15) + 10));
function mono(K, t, c) {
  const n = K.length;
  if (t <= K[0][0]) return K[0][c];
  if (t >= K[n - 1][0]) return K[n - 1][c];
  let i = 0; while (i < n - 2 && K[i + 1][0] <= t) i++;
  const t1 = K[i][0], t2 = K[i + 1][0], h = t2 - t1, u = (t - t1) / h, y1 = K[i][c], y2 = K[i + 1][c], d1 = (y2 - y1) / h;
  let m1 = 0, m2 = 0;
  if (i > 0) { const d0 = (y1 - K[i - 1][c]) / (t1 - K[i - 1][0]); m1 = d0 * d1 <= 0 ? 0 : 2 / (1 / d0 + 1 / d1); }
  if (i < n - 2) { const d2 = (K[i + 2][c] - y2) / (K[i + 2][0] - t2); m2 = d1 * d2 <= 0 ? 0 : 2 / (1 / d1 + 1 / d2); }
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * y2 + (u3 - u2) * h * m2;
}
function rotAx(ax, a) {
  const [x, y, z] = ax, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const invAp = (Xf, p) => { const d = V.sub(p, Xf.T), M = Xf.R; return [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]]; };
const invDir = (Xf, d) => { const M = Xf.R; return [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]]; };
const seaAt = p => { const up = OA.upAt(p); return V.mad(p, up, -OA.altOf(p)); };

/* ---------- clock: real time, slowed at booster separation, over the two SM-6 kills, and for the close
   fight and the hit (film time -> A's clock tl: seconds since the first round left its tube) ---------- */
const TLH = 42;                                                   // the fourth round hits
const KILL = [TLH - 9.4, TLH - 6.8, TLH - .95, TLH];              // A, B stopped by SM-6; C by the Phalanx; D hits
const SIM = FILM.warp([
  { t: 0, rate: 1 }, { t: 63.9, rate: 1 }, { t: 64.5, rate: .2 }, { t: 70.3, rate: .2 }, { t: 71.5, rate: 1 },
  { t: 96.0, rate: 1 }, { t: 96.8, rate: .4 }, { t: 108.5, rate: .4 }, { t: 109.3, rate: 1 },
  { t: 111.6, rate: 1 }, { t: 112.4, rate: .3 }, { t: 125.5, rate: .3 }, { t: 127, rate: 1 }, { t: DUR, rate: 1 },
]);
const SIM_D = SIM(DUR), TL = 60, SL = SIM(TL);
const tlOf = T => SIM(T) - SL;
function Tof(tl) { let a = 0, b = DUR; for (let i = 0; i < 48; i++) { const m = (a + b) / 2; if (tlOf(m) < tl) a = m; else b = m; } return (a + b) / 2; }
const THIT = Tof(TLH);

/* ---------- models (wire copies: the dots-only skin is dropped) ---------- */
const HW = m => (HD.wire ? HD.wire(m) : m);
const M = { tel: HW(HD.tel()), radar: HW(HD.radar()), pz: HW(HD.pantsir()), mis: HW(HD.oniks()), bst: HW(HD.oniksBooster()), sat: HW(HD.satellite()), sm: HW(HD.sm6()) };
const DDW = HW(HD.destroyer()), DA = HD.destroyer.A;
const ddPick = names => ({ parts: DDW.parts.filter(p => names.includes(p.name)) });
// far: hull, superstructure, mast, stacks and arrays make the silhouette; near: the mounts too
const M_DD = ddPick(['hull', 'super', 'mast', 'stacks', 'spy', 'hangar', 'sps', 'gun']);
const M_DDN = ddPick(['hull', 'super', 'mast', 'stacks', 'spy', 'hangar', 'sps', 'gun', 'ciwsF', 'ciwsA', 'boats', 'decoys', 'arms']);
const tubeOf = (st, side) => HD.telTube(M.tel, st, side);
const NOSE = HD.oniks.TIP[2], NZ = HD.oniks.NOZZLE[2], BNZ = HD.oniks.BNOZZLE[2];
const partOf = (m, n) => m && m.parts.find(p => p.name === n);

/* ---------- the battery on the bluff (sea to the north): both TELs erect and fire ---------- */
const TELS = [X.make(R.y(Math.PI), [0, GH, 0]), X.make(R.y(Math.PI + .09), [-30, GH, -9])];   // cab south, launcher toward the sea
const TEL_DT = [0, .6];
const RADW = X.make(R.y(Math.PI * .8), [58, GH, -70]);
const PZW = X.make(R.y(Math.PI * 1.1), [30, GH, -36]);
const E88 = 88 * D2R;
const telDep = (T, j) => E.ss(43.8 + TEL_DT[j || 0], 46.6 + TEL_DT[j || 0], T);
const telElev = (T, j) => E88 * E.inOut(E.sat((T - 47 - TEL_DT[j || 0]) / 9.5));
function tubeW(j, st, side) { const f = tubeOf(st, side), Xw = TELS[j]; return { base: X.ap(Xw, f.base), mouth: X.ap(Xw, f.mouth), dir: X.dir(Xw, f.dir) }; }

/* the ripple: A from TEL 1's east tube (the round the lens rides up), then TEL 2, TEL 1's west tube, TEL 2.
   Over the sea the three behind close up on slots behind A, each on its own lane */
const RND = [
  { id: 'A', tel: 0, side: -1, L: 0, h: 14 },
  { id: 'B', tel: 1, side: -1, L: .7, lane: 42, h: 16, slot: -200 },
  { id: 'C', tel: 0, side: 1, L: 1.5, lane: -38, h: 12, slot: -420 },
  { id: 'D', tel: 1, side: 1, L: 2.2, lane: 16, h: 14, slot: -640 },
];
RND.forEach((r, i) => { r.i = i; r.TB = tubeW(r.tel, { elev: E88 }, r.side); r.P0 = V.mad(r.TB.mouth, r.TB.dir, -NOSE - .15); r.cap = r.side < 0 ? 'capL' : 'capR'; r.end = KILL[i]; });

/* ---------- the flights, integrated once ---------- */
const HDG = 8 * D2R, HF = [Math.sin(HDG), 0, Math.cos(HDG)], HR = [Math.cos(HDG), 0, -Math.sin(HDG)];
const LAT0 = V.dot(RND[0].P0, HR);
function integrate(r, ref) {
  const dt = 1 / 240, N = Math.ceil(64 / dt) + 2, TB = r.TB;
  const P = new Float64Array(N * 3), A = new Float64Array(N * 3), S = new Float64Array(N), H = new Float64Array(N);
  let p = r.P0.slice(), v = V.mul(TB.dir, 20), spd = 20, gam = 0, lit = false, psi = 0;
  const gam0 = Math.atan2(TB.dir[1], V.dot(TB.dir, HF)), h0 = r.h;
  for (let i = 0; i < N; i++) {
    const t = i * dt, h = OA.altOf(p), ax = t < .5 ? TB.dir : V.mul(v, 1 / spd);
    P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; A[3 * i] = ax[0]; A[3 * i + 1] = ax[1]; A[3 * i + 2] = ax[2]; S[i] = spd; H[i] = h;
    if (t < .5) { v[1] -= 9.81 * dt; spd = V.len(v); p = V.mad(p, v, dt); continue; }
    if (!lit) { lit = true; gam = gam0; }
    if (ref && t >= 5.25) {
      // ramjet throttle: close up on the slot behind A, then hold A's speed
      const err = ref(t + r.L) + r.slot - V.dot(p, HF), vc = 700 + E.clamp(.2 * err, -45, 78);
      spd += E.clamp(vc - spd, -18 * dt, 42 * dt);
    } else {
      // booster 4.1 s, a short coast while it is pushed out, then the ramjet accelerates to ~Mach 2
      const acc = t < 4.6 ? 88 : t < 5.25 ? -6 : 42;
      spd = t < 4.6 ? spd + acc * dt : Math.min(700, spd + acc * dt);
    }
    const up = OA.upAt(p);
    let gc;
    if (t < .62) gc = gam0;
    else if (t < 1.95) gc = E.mix(gam0, 15 * D2R, E.inOut((t - .62) / 1.33));
    else { const vz = E.clamp(-(h - h0) * 1.0, -70, 24); gc = Math.asin(E.clamp(vz / spd, -.7, .7)); }
    const rate = (t < 1.95 ? 120 : 22) * D2R;
    gam += E.clamp(gc - gam, -rate * dt, rate * dt);
    let hd = HF;
    if (r.lane !== undefined && t >= 1.95) {
      const lat = V.dot(p, HR) - LAT0, pc = Math.asin(E.clamp(.12 * (r.lane - lat), -18, 18) / spd);
      psi += E.clamp(pc - psi, -6 * D2R * dt, 6 * D2R * dt);
      hd = V.add(V.mul(HF, Math.cos(psi)), V.mul(HR, Math.sin(psi)));
    }
    const hf = V.norm(V.sub(hd, V.mul(up, V.dot(hd, up))));
    v = V.mul(V.add(V.mul(hf, Math.cos(gam)), V.mul(up, Math.sin(gam))), spd);
    p = V.mad(p, v, dt);
  }
  return { dt, N, P, A, S, H };
}
function fposOf(F, t) { const x = E.clamp(t, 0, (F.N - 2) * F.dt) / F.dt, i = Math.floor(x), f = x - i, j = 3 * i, P = F.P; return [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f]; }
function flightOf(F, t) {
  const x = E.clamp(t, 0, (F.N - 2) * F.dt) / F.dt, i = Math.floor(x), f = x - i, j = 3 * i, P = F.P, A = F.A;
  return {
    p: [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f],
    a: V.norm([A[j] + (A[j + 3] - A[j]) * f, A[j + 1] + (A[j + 4] - A[j + 1]) * f, A[j + 2] + (A[j + 5] - A[j + 2]) * f]),
    s: F.S[i] + (F.S[i + 1] - F.S[i]) * f, h: F.H[i] + (F.H[i + 1] - F.H[i]) * f,
  };
}
RND[0].F = integrate(RND[0]);
{ const FA = RND[0].F, alongA = t => V.dot(fposOf(FA, t), HF); for (let i = 1; i < 4; i++) RND[i].F = integrate(RND[i], alongA); }
// round r on A's clock tl
const fposR = (r, tl) => fposOf(r.F, tl - r.L);
const flightR = (r, tl) => flightOf(r.F, tl - r.L);
const alive = (r, tl) => tl >= r.L && tl < r.end;
function misAt(r, T) {
  const tl = tlOf(T), t = tl - r.L;
  if (t < 0) { const tb = tubeW(r.tel, { elev: telElev(T, r.tel) }, r.side); return { r, tl, t, p: V.mad(tb.mouth, tb.dir, -NOSE - .15), a: tb.dir, s: 0, h: 0, st: { wing: 0, fin: 0, booster: true, cover: true } }; }
  const f = flightOf(r.F, t);
  f.r = r; f.tl = tl; f.t = t; f.st = { wing: E.ss(4.8, 5.45, t), fin: E.ss(4.66, 5.06, t), booster: t < 4.6, cover: t < 4.95 };
  return f;
}
const misX = m => X.make(R.look(m.a, OA.upAt(m.p)), m.p);
const P0 = RND[0].P0;
const outKm = p => V.dist(p, P0) / 1000;
// the four end points: where each round was stopped, and the hit
RND.forEach(r => { r.K = fposR(r, r.end); r.Kv = V.mul(flightR(r, r.end).a, flightR(r, r.end).s); });
const HP = RND[3].K;

/* spent booster: slides out of the ramjet nozzle, then drag + gravity, tumbling */
RND.forEach(r => {
  const f = flightOf(r.F, 4.6), kd = .35, v0 = V.mad(V.mul(f.a, f.s), f.a, -18), vinf = [0, -9.81 / kd, 0];
  const c0 = V.mad(f.p, f.a, -3.35), up = OA.upAt(f.p), Rs = R.look(f.a, up), ax = V.norm(V.cross(f.a, up));
  r.SEP = { kd, v0, vinf, c0, Rs, ax };
  // intake cover: thrown off the nose at ramjet start
  const g = flightOf(r.F, 4.95), gu = OA.upAt(g.p);
  r.CVJ = { X0: misX({ p: g.p, a: g.a }), v0: V.add(V.mul(g.a, g.s), V.add(V.mul(gu, 7), V.mul(V.cross(g.a, gu), 3))), p0: V.mad(g.p, g.a, 4.1), ax: V.norm(V.cross(g.a, gu)) };
  // TLC front cap: blown off by the gas, tumbles onto the ground
  const part = partOf(M.tel, r.cap), Xa = part ? X.mul(TELS[r.tel], part.xf({ elev: E88, capL: 0, capR: 0 })) : null;
  const HRt = X.dir(TELS[r.tel], [-r.side, 0, 0]);
  const cc0 = r.TB.mouth.slice(), cv0 = V.add(V.mul(r.TB.dir, 13), V.add(V.mul(HRt, 3.2), [0, 0, 1.5])), ckd = .25, cvinf = [0, -9.81 / ckd, 0];
  const at = t => { const e = Math.exp(-ckd * t); return V.add(V.add(cc0, V.mul(cvinf, t)), V.mul(V.sub(cv0, cvinf), (1 - e) / ckd)); };
  let tL = 8; for (let t = .05; t < 8; t += .005) if (at(t)[1] < GH + .35) { tL = t; break; }
  r.CAP = { part, Xa, c0: cc0, at, tL, ax: V.norm([1, .3, .2 * r.side]) };
});
function boosterX(r, t) {
  const S = r.SEP, u = t - 4.6, e = Math.exp(-S.kd * u);
  const p = V.add(V.add(S.c0, V.mul(S.vinf, u)), V.mul(V.sub(S.v0, S.vinf), (1 - e) / S.kd));
  const ang = 5.5 * Math.max(0, u - .12) * Math.max(0, u - .12) / (u + .3);
  return X.make(R.mul(rotAx(S.ax, ang), S.Rs), p);
}
function coverX(r, t) {
  const Q = r.CVJ, u = t - 4.95, kd = .9, e = Math.exp(-kd * u), vinf = [0, -9.81 / kd, 0];
  const p = V.add(V.add(Q.p0, V.mul(vinf, u)), V.mul(V.sub(Q.v0, vinf), (1 - e) / kd));
  const Rm = rotAx(Q.ax, -9 * u);
  return X.mul(X.make(Rm, V.sub(p, R.ap(Rm, Q.p0))), Q.X0);
}
function capX(r, t) {
  const Q = r.CAP, u = Math.min(t, Q.tL), p = Q.at(u), Rm = rotAx(Q.ax, 7.5 * u);
  return X.mul(X.make(Rm, V.sub(p, R.ap(Rm, Q.c0))), Q.Xa);
}

/* ---------- launch smoke, spawned once with a seeded rng (t0 on A's clock) ---------- */
const SMOKE = (() => {
  const out = [];
  for (const rr of RND) {
    const r = M3.rng(1337 + rr.i * 71), mouth = rr.TB.mouth, L = rr.L, g0 = X.ap(TELS[rr.tel], [0, .3, -6]), dens = rr.i ? 1.7 : 1.1;
    for (let i = 0; i < 18; i++) { const a = r() * TAU, s = 3 + r() * 6; out.push({ t0: L, p: V.mad(mouth, rr.TB.dir, .4), v: [Math.cos(a) * s, 1.5 + r() * 3.5, Math.sin(a) * s], k: 1.4, life: 2.6 + r() * 1.6, r0: .6, gr: 2.4, a: .42 }); }
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; out.push({ t0: L + .55, p: [g0[0] + Math.cos(a) * 3, g0[1] + 1, g0[2] + Math.sin(a) * 3], v: [Math.cos(a) * 7, .8, Math.sin(a) * 7], k: .3, life: 7, r0: 1.6, gr: 3.6, a: .34 }); }
    // boost trail: a billow per metre or so flown, thinned with age (see drawSmoke) so it stays a trail
    // of rolling puffs rather than a stack of rings
    let acc = 0, n = 0;
    for (let t = .5; t < 4.6; t += 1 / 240) {
      const f = flightOf(rr.F, t); acc += f.s / 240;
      while (acc > dens) {
        acc -= dens;
        const at = V.add(V.mad(f.p, f.a, NZ - .3 - r() * 1.1), [(r() - .5) * .8, (r() - .5) * .8, (r() - .5) * .8]);
        out.push({ t0: t + L, p: at, v: [1.2 + (r() - .5) * 1.6, .4 + (r() - .5) * 1.2, .8 + (r() - .5) * 1.6], tr: 1, n: ++n, ds: dens, ax: f.a, k: .15, life: 13 + r() * 5, r0: .3 + r() * .3, gr: 1.1 + r() * 1.1, a: .34 });
        if (r() < .16) out.push({ t0: t + L, p: at, v: [1.2 + (r() - .5) * 2, .5, .8 + (r() - .5) * 2], k: 1, life: 9 + r() * 4, r0: .5, gr: 2.4 + r() * 1.5, a: .2 });
      }
    }
  }
  return out;
})();
const WIND = [1.1, .25, -.6];
/* the boost trail's two edges: the laid smoke's outline, drifting and widening with the billows inside it */
const _lat = [0, 0, 0];
function boostEdges(tl, eye) {
  for (const r of RND) {
    const t1 = Math.min(4.6, tl - r.L); if (t1 <= .55) continue;
    const dr = V.dist(fposOf(r.F, t1), eye); if (dr > 3000) continue;
    const fa = 1 - .65 * E.ss(400, 1500, dr);
    for (const side of [-1, 1]) {
      let pv = null, pa = 0;
      for (let i = 0; i <= 44; i++) {
        const tau = .5 + (t1 - .5) * i / 44, age = tl - r.L - tau; if (age > 18) { pv = null; continue; }
        const f = flightOf(r.F, tau), e = (1 - Math.exp(-.15 * age)) / .15, w = (.45 + 1.55 * Math.sqrt(age)) * (1 + .18 * M3.noise(tau * 3 + side * 5, age * .2, r.i + 1.5));
        const c = [f.p[0] + f.a[0] * (NZ - .8) + 1.2 * e + WIND[0] * age, f.p[1] + f.a[1] * (NZ - .8) + .4 * e + WIND[1] * age, f.p[2] + f.a[2] * (NZ - .8) + .8 * e + WIND[2] * age];
        const L = V.norm(V.cross(f.a, V.sub(c, eye)));
        const q = V.mad(c, L, side * w), al = .3 * fa * Math.pow(1 - age / 18, 1.3) * E.ss(0, .35, age);
        if (pv) WL.seg(pv, q, (al + pa) * .5);
        pv = q; pa = al;
      }
    }
  }
}
function drawSmoke(tl, eye) {
  const fl = cam.fl;
  for (let i = 0; i < SMOKE.length; i++) {
    const p = SMOKE[i], age = tl - p.t0; if (age <= 0 || age >= p.life) continue;
    const rr = p.r0 + p.gr * Math.sqrt(age);
    // a trail puff is kept while its spacing (its largest power-of-two stride) stays a fair fraction of its size
    let fk = 1;
    if (p.tr) { fk = E.ss(.5, 1, (p.n & -p.n) * p.ds / (1.3 * rr)); if (fk <= .01) continue; }
    const e = (1 - Math.exp(-p.k * age)) / p.k;
    const c = [p.p[0] + p.v[0] * e + WIND[0] * age, p.p[1] + p.v[1] * e + WIND[1] * age, p.p[2] + p.v[2] * e + WIND[2] * age];
    const d2 = (c[0] - eye[0]) ** 2 + (c[1] - eye[1]) ** 2 + (c[2] - eye[2]) ** 2; if (d2 > 9e6) continue;
    const d = Math.sqrt(d2), rpx = rr * fl / d;
    if (rpx < 1.5) continue;
    // far off, a trail puff also needs a few pixels of its own, or the column piles up into a grey mass
    if (p.tr) { fk *= E.ss(2, 5, (p.n & -p.n) * p.ds * fl / d); if (fk <= .01) continue; }
    const k = age / p.life, a = fk * p.a * Math.pow(1 - k, 1.3) * E.ss(0, .08, age) * E.ss(1.5, 3, rpx) * (1 - .65 * E.ss(400, 1500, d));
    if (p.U) WL.ring(c, p.U, p.Vv, rr, E.clamp(Math.round(rpx / 3), 6, 16), a);
    else billow(c, rr, p.tr ? scrAng(p.ax) + Math.PI * .5 * (hash(i, 3) < .5 ? 1 : -1) : scrAng([0, 1, 0]), a, i, age, rpx);
  }
}

/* ---------- the satellite: 900 km circular orbit, crossing the theatre northbound ---------- */
const RS = RE + 900e3, VSAT = Math.sqrt(3.986e14 / RS), OM = VSAT / RS;
const SAT0 = (() => { const p = OA.mapP(OA.SX - 35, OA.SZ - 760, 0), r = OA.upAt(p), n = tangentN(p), e = V.cross(r, n), h = 10 * D2R; return { r, t: V.norm(V.add(V.mul(n, Math.cos(h)), V.mul(e, Math.sin(h)))) }; })();
const satT = T => T < DUR / 2 ? SIM(T) : SIM(T) - SIM_D;          // continuous across the loop
function satFrame(ts) {
  const a = OM * ts, ca = Math.cos(a), sa = Math.sin(a);
  const r = V.add(V.mul(SAT0.r, ca), V.mul(SAT0.t, sa)), t = V.add(V.mul(SAT0.r, -sa), V.mul(SAT0.t, ca));
  return { p: V.add(C, V.mul(r, RS)), r, t, c: V.cross(t, r) };
}
const SATC = { c0: 0, r0: 4.2, rk: .15, a0: -20, va: -2.5, dn: 22 * D2R, yw: 0, fov: 42 * D2R, cx: 1210, cy: 560 };

/* ---------- heading frame at a point: right, up, forward ---------- */
function hframe(p) { const up = OA.upAt(p), f = V.norm(V.sub(HF, V.mul(up, V.dot(HF, up)))); return { r: V.cross(up, f), u: up, f }; }
const hpt = (H, a, o) => V.add(a, V.add(V.mul(H.r, o[0]), V.add(V.mul(H.u, o[1]), V.mul(H.f, o[2]))));

/* ---------- the destroyer group: three Flight IIAs crossing ahead at 9 m/s (17.5 kn), westbound. The
   fourth round ends at DDG 1's port side aft of the stacks ---------- */
const VSH = 9;
const SHIPS = (() => {
  const up0 = OA.upAt(HP);
  const fw = orth(V.add(V.mul(HR, -Math.cos(15 * D2R)), V.mul(HF, Math.sin(15 * D2R))), up0);
  const c1 = seaAt(V.add(HP, V.add(V.mul(HF, 9), V.mul(HR, -32))));
  const mk = (c, ph, name) => ({ c, fw, ph, name });
  return [mk(c1, 0, 'DDG 1'), mk(seaAt(V.add(c1, V.add(V.mul(HF, 2300), V.mul(HR, -1300)))), 1.7, 'DDG 2'), mk(seaAt(V.add(c1, V.add(V.mul(HF, 4500), V.mul(HR, 2600)))), 3.9, 'DDG 3')];
})();
/* the ship's frame at a moment: steaming, with a slow roll and pitch in the swell */
function shipX(S, tl) {
  const c = seaAt(V.mad(S.c, S.fw, VSH * (tl - TLH))), up = OA.upAt(c);
  const roll = .014 * Math.sin(.68 * tl + S.ph), pitch = .004 * Math.sin(.93 * tl + 2 * S.ph);
  return X.make(R.mul(R.look(S.fw, up), R.mul(R.z(roll), R.x(pitch))), c);
}
const DD1 = SHIPS[0];
const HIT_L = invAp(shipX(DD1, TLH), HP);                         // the hit, in DDG 1's own frame
const hitNow = tl => X.ap(shipX(DD1, tl), HIT_L);

/* ---------- SM-6s: out of the cells on a vertical boost, pitching over onto a lofted arc that meets the
   round from ahead and above. Fixed cinematic curves, each a function of its own launch time ---------- */
const SMV = s => 30 * s + 1120 * (s - 1.3 * (1 - Math.exp(-s / 1.3)));      // metres flown s seconds after launch
function bez(a, b, c, d, u) { const v = 1 - u, A = v * v * v, B = 3 * v * v * u, Cc = 3 * v * u * u, D = u * u * u; return [A * a[0] + B * b[0] + Cc * c[0] + D * d[0], A * a[1] + B * b[1] + Cc * c[1] + D * d[1], A * a[2] + B * b[2] + Cc * c[2] + D * d[2]]; }
function smCurve(P, n) {
  const pts = [], acc = [0];
  for (let i = 0; i <= n; i++) pts.push(bez(P[0], P[1], P[2], P[3], i / n));
  for (let i = 1; i <= n; i++) acc.push(acc[i - 1] + V.dist(pts[i], pts[i - 1]));
  return { pts, acc, L: acc[n] };
}
function curveAt(Cv, d) {
  const acc = Cv.acc, n = acc.length - 1; if (d >= Cv.L) return Cv.pts[n];
  let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] < d) lo = m; else hi = m; }
  return V.lerp(Cv.pts[lo], Cv.pts[hi], (d - acc[lo]) / (acc[hi] - acc[lo] || 1));
}
function buildSM(o) {
  const S = SHIPS[o.ship], cellL = DA.vls(o.cell);
  let tL = o.tL !== undefined ? o.tL : o.tA - 7, Cv = null, P = null;
  for (let it = 0; it < (o.tL !== undefined ? 1 : 4); it++) {
    const sx = shipX(S, tL), c0 = X.ap(sx, cellL), up = OA.upAt(c0);
    if (o.K) {
      const din = V.norm(V.add(V.mul(HF, -Math.cos(o.dive * D2R)), V.mul(up, -Math.sin(o.dive * D2R)))), L0 = V.dist(o.K, c0);
      P = [c0, V.mad(c0, up, o.loft), V.mad(o.K, din, -L0 * .42), o.K];
    } else P = [c0, V.mad(c0, up, 420), V.add(V.mad(c0, up, 1500), V.mul(o.dir, 900)), V.add(V.mad(c0, up, 3300), V.mul(o.dir, 2700))];
    Cv = smCurve(P, 480);
    if (o.K) { let a = 0, b = 30; for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (SMV(m) < Cv.L) a = m; else b = m; } tL = o.tA - (a + b) / 2; }
  }
  const sEnd = o.K ? o.tA - tL : o.life, HZ = 60, N = Math.ceil(sEnd * HZ) + 2, Tab = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) { const q = curveAt(Cv, SMV(Math.min(sEnd, i / HZ))); Tab[3 * i] = q[0]; Tab[3 * i + 1] = q[1]; Tab[3 * i + 2] = q[2]; }
  return { ship: o.ship, cell: o.cell, tL, sEnd, Tab, N, HZ, cellW: P[0], seed: o.seed || 1, lat: V.norm(V.cross(OA.upAt(P[0]), V.norm(V.sub(P[3], P[0])))), K: o.K };
}
function smAt(I, s) {
  const x = E.clamp(s, 0, I.sEnd) * I.HZ, i = Math.min(I.N - 2, Math.floor(x)), f = x - i, P = I.Tab, j = 3 * i;
  return [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f];
}
const smDir = (I, s) => V.norm(V.sub(smAt(I, s + .02), smAt(I, Math.max(0, s - .02))));
const LATE = V.norm(V.add(V.mul(HF, -.55), V.mul(HR, .83)));
const SMS = [
  buildSM({ ship: 0, cell: 6, tA: KILL[0], K: RND[0].K, loft: 380, dive: 24, seed: 1 }),
  buildSM({ ship: 1, cell: 44, tA: KILL[0] + .35, K: V.mad(RND[0].K, V.norm(RND[0].Kv), 150), loft: 520, dive: 30, seed: 2 }),
  buildSM({ ship: 0, cell: 51, tA: KILL[1], K: RND[1].K, loft: 300, dive: 18, seed: 3 }),
  buildSM({ ship: 1, cell: 13, tA: KILL[1] + .3, K: V.mad(RND[1].K, V.norm(RND[1].Kv), 130), loft: 440, dive: 26, seed: 4 }),
  // a late pair off DDG 1 while the last two close: they climb out of the fight and self-destruct
  buildSM({ ship: 0, cell: 9, tL: TLH - 3.3, dir: LATE, life: 8.5, seed: 5 }),
  buildSM({ ship: 0, cell: 70, tL: TLH - 2.5, dir: V.norm(V.add(LATE, V.mul(HR, .4))), life: 8.2, seed: 6 }),
];
const smEnd = I => I.tL + I.sEnd;
const TSM0 = Tof(SMS[0].tL);

/* ---------- Phalanx (aft mount, on the hangar): two bursts, each tracer a dash flown from its own firing
   time; the first stops C a few hundred metres out, the second chases D ---------- */
const CI = 1, ROF = 45, VM = 1100, TLIFE = 1.6;
const BURSTS = [[KILL[2] - 1.8, KILL[2] + .05, 2], [KILL[2] + .3, TLH - .04, 3]];
const ciwsBase = (sx) => X.ap(sx, DA.ciws({ ciwsYaw: [0, Math.PI], ciwsPitch: [0, 0] }, CI));
function leadOf(r, tl, from) { let q = fposR(r, tl); for (let k = 0; k < 3; k++) q = fposR(r, tl + V.dist(q, from) / (VM * .92)); return q; }
function ciwsAim(tl) {
  // yaw / pitch of the aft mount toward what it tracks (C, then D); rests aft before the fight
  const sx = shipX(DD1, tl), b = ciwsBase(sx), trk = tl < KILL[2] + .15 ? RND[2] : RND[3];
  const k = E.ss(KILL[2] - 4.5, KILL[2] - 3.2, tl) * (1 - E.ss(TLH + 3, TLH + 8, tl));
  const tg = leadOf(trk, Math.min(tl, trk.end - .02), b), dl = invDir(sx, V.norm(V.sub(tg, b)));
  let yaw = Math.atan2(dl[0], dl[2]), pit = Math.atan2(dl[1], Math.hypot(dl[0], dl[2]));
  let dy = yaw - Math.PI; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return { yaw: Math.PI + dy * k, pitch: .35 + (pit - .35) * k };
}
const TRACERS = [];
for (const [b0, b1, ri] of BURSTS) for (let k = 0; b0 + k / ROF <= b1; k++) {
  const tk = b0 + k / ROF, sx = shipX(DD1, tk), am = ciwsAim(tk), st = { ciwsYaw: [0, am.yaw], ciwsPitch: [0, am.pitch], ciwsSpin: 0 };
  const m = X.ap(sx, DA.ciws(st, CI)), tg = leadOf(RND[ri], tk, m), d = V.norm(V.sub(tg, m)), [U, Vv] = GEO.perp(d);
  const du = (hash(k, ri + 1) - .5) * .007 + .004 * M3.noise(tk * 2.3, 1.1), dv = (hash(k + 7, ri + 5) - .5) * .007 + .004 * M3.noise(tk * 2.3, 4.4);
  TRACERS.push({ tk, m, d: V.norm(V.add(d, V.add(V.mul(U, du), V.mul(Vv, dv)))) });
}
const tracerAt = (r, a) => { const s = VM * a - 95 * a * a; return [r.m[0] + r.d[0] * s, r.m[1] + r.d[1] * s - 4.9 * a * a, r.m[2] + r.d[2] * s]; };
const ciwsFiring = tl => BURSTS.some(b => tl >= b[0] && tl <= b[1] + .03);
const TCI0 = Tof(BURSTS[0][0]), TCI1 = Tof(KILL[2]);

/* ---------- blasts: flashes, fireball shells, fragments (drag + gravity, each to its own splash), puffs ---------- */
function frags(n, seed, o) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const az = hash(k, seed) * TAU, el = E.mix(o.el0, o.el1, hash(k + 3, seed)), sp = E.mix(o.v0, o.v1, Math.pow(hash(k + 9, seed), 1.5));
    const dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const v0 = V.add(V.mul(o.carry || [0, 0, 0], E.mix(.35, .75, hash(k + 11, seed))), V.mul(dir, sp)), kd = E.mix(o.kd0, o.kd1, hash(k + 5, seed));
    const f = { v0, kd, vinf: [0, -9.81 / kd, 0], big: hash(k + 13, seed) < (o.big || 0), tS: o.life, w: .9 + 1.4 * hash(k + 17, seed) };
    for (let t = .02; t < o.life; t += .02) { const q = fragAt(o.p, f, t); if (q[1] < OA.seaY(q[0], q[2]) + .3) { f.tS = t; break; } }
    f.sp = fragAt(o.p, f, f.tS);
    out.push(f);
  }
  return out;
}
function fragAt(c, f, t) { const e = Math.exp(-f.kd * t); return [c[0] + f.vinf[0] * t + (f.v0[0] - f.vinf[0]) * (1 - e) / f.kd, c[1] + f.vinf[1] * t + (f.v0[1] - f.vinf[1]) * (1 - e) / f.kd, c[2] + f.vinf[2] * t + (f.v0[2] - f.vinf[2]) * (1 - e) / f.kd]; }
const BL = [];
function blast(o) { o.F = o.nf ? frags(o.nf, o.seed, Object.assign({ p: o.p, life: 9 }, o.fr)) : []; BL.push(o); return o; }
// two SM-6 kills, each followed by the second missile of the pair bursting in the debris
blast({ kind: 'kill', t0: KILL[0], p: RND[0].K, R: 26, seed: 11, nf: 22, fr: { carry: RND[0].Kv, v0: 40, v1: 170, el0: -.6, el1: .9, kd0: .25, kd1: 1.2, big: .25 } });
blast({ kind: 'pair', t0: smEnd(SMS[1]), p: SMS[1].K, R: 15, seed: 12, nf: 8, fr: { carry: V.mul(smDir(SMS[1], SMS[1].sEnd), 600), v0: 30, v1: 120, el0: -.4, el1: .8, kd0: .4, kd1: 1.4 } });
blast({ kind: 'kill', t0: KILL[1], p: RND[1].K, R: 24, seed: 13, nf: 22, fr: { carry: RND[1].Kv, v0: 40, v1: 170, el0: -.6, el1: .9, kd0: .25, kd1: 1.2, big: .25 } });
blast({ kind: 'pair', t0: smEnd(SMS[3]), p: SMS[3].K, R: 14, seed: 14, nf: 8, fr: { carry: V.mul(smDir(SMS[3], SMS[3].sEnd), 600), v0: 30, v1: 120, el0: -.4, el1: .8, kd0: .4, kd1: 1.4 } });
// the Phalanx stops C: the wreck carries on into the sea short of the ship
blast({ kind: 'ciws', t0: KILL[2], p: RND[2].K, R: 18, seed: 15, nf: 20, fr: { carry: RND[2].Kv, v0: 30, v1: 140, el0: -.5, el1: .7, kd0: .3, kd1: 1.1, big: .3 } });
// the hit: through the side plating; the fireball vents out of the hole and up
// ship-local +x is starboard: the hole is on the side the round came from
const HIT_OUT = (() => { const sx = shipX(DD1, TLH); return V.norm(V.add(X.dir(sx, [Math.sign(HIT_L[0]) || -1, 0, 0]), V.mul(OA.upAt(HP), .25))); })();
blast({ kind: 'hit', t0: TLH, p: HP, R: 46, seed: 21, nf: 46, fr: { carry: V.mul(HIT_OUT, 40), v0: 25, v1: 150, el0: .05, el1: 1.35, kd0: .2, kd1: .9, big: .3 }, ship: true });
const TSEC = TLH + 1.25;
blast({ kind: 'sec', t0: TSEC, p: X.ap(shipX(DD1, TSEC), V.add(HIT_L, [0, 4, 6])), R: 30, seed: 22, nf: 24, fr: { v0: 20, v1: 110, el0: .3, el1: 1.45, kd0: .25, kd1: .9, big: .2 }, ship: true });
// the late pair's self-destructs, high over the group
blast({ kind: 'sd', t0: smEnd(SMS[4]), p: smAt(SMS[4], SMS[4].sEnd), R: 12, seed: 31, nf: 0 });
blast({ kind: 'sd', t0: smEnd(SMS[5]), p: smAt(SMS[5], SMS[5].sEnd), R: 12, seed: 32, nf: 0 });
const HITB = BL.find(b => b.kind === 'hit');

/* ---------- the column over DDG 1: parcels leave the fire continuously (the fire steams on with the ship);
   each rises on the fireball's heat, then as a steady plume, and picks up the wind as it climbs ---------- */
const SMK = (() => {
  const up = OA.upAt(HP), wh = [1, 0, -.25], w = V.norm(V.sub(wh, V.mul(up, V.dot(wh, up))));
  return { up, w, n: V.cross(up, w) };
})();
const smZ = s => 520 * (1 - Math.exp(-s / 5)) + 12 * s, smZd = s => 104 * Math.exp(-s / 5) + 12;
const smX = s => 28 * (s - 3 * (1 - Math.exp(-s / 3))), smXd = s => 28 * (1 - Math.exp(-s / 3));
const smR = s => 9 + .19 * smZ(s) + .14 * smX(s) + 4 * Math.sqrt(s);
const fireBase = tl => { const h = hitNow(tl); return V.mad(h, SMK.up, 12 - OA.altOf(h)); };
function smokeP(a, s) {
  const te = a - s, z = smZ(s), x0 = smX(s), r = smR(s) * (1 + .12 * (1 - E.ss(0, 2, te)));
  const wob = r * .42, n1 = M3.noise(te * .42, s * .11, 7.7), n2 = M3.noise(te * .42, s * .11, 3.1), n3 = M3.noise(te * .42, s * .11, 5.3);
  const B = fireBase(TLH + te), U = SMK.up, W = SMK.w, N = SMK.n, x = x0 + wob * n2, y = wob * n1, h = z + wob * .5 * n3;
  return { p: [B[0] + U[0] * h + W[0] * x + N[0] * y, B[1] + U[1] * h + W[1] * x + N[1] * y, B[2] + U[2] * h + W[2] * x + N[2] * y], r, te };
}

/* ---------- camera: shots {e, tg, u, fov, cx, cy}; a blend lerps eye and look point, so a subject that
   both shots look at stays put on screen ---------- */
const shot = (e, tg, u, fov, cx, cy) => ({ e, tg, u, fov, cx, cy });
function mixShot(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  return { e: V.lerp(a.e, b.e, w), tg: V.lerp(a.tg, b.tg, w), u: V.lerp(a.u, b.u, w), fov: E.mix(a.fov, b.fov, w), cx: E.mix(a.cx, b.cx, w), cy: E.mix(a.cy, b.cy, w) };
}
function camSat(T) {
  const ts = satT(T), F = satFrame(ts);
  const a = SATC.a0 + SATC.va * ts, rr = SATC.r0 + (ts < 0 ? SATC.rk * ts * ts : 0);
  const e = V.add(F.p, V.add(V.mul(F.c, SATC.c0), V.add(V.mul(F.r, rr), V.mul(F.t, a))));
  const f = V.norm(V.add(V.mul(F.t, Math.cos(SATC.dn) * Math.cos(SATC.yw)), V.add(V.mul(F.c, Math.cos(SATC.dn) * Math.sin(SATC.yw)), V.mul(F.r, -Math.sin(SATC.dn)))));
  return shot(e, V.mad(e, f, 2e6), F.r, SATC.fov, SATC.cx, SATC.cy);
}
/* E-form keys: eye over a map point at a log altitude, looking at a map point (km relative to the site)
   [t, sx, sz, log10 alt, lx, lz, look alt m, look-at-point weight, north-up weight, fov, cx, cy] */
function toE(t, s, L) {
  const d = V.sub(s.tg, s.e), f = V.norm(d);
  const si = OA.mapInv(s.e), lp = V.mad(s.e, f, L || V.len(d)), l = OA.mapInv(lp);
  return [t, si[0] - OA.SX, si[1] - OA.SZ, Math.log10(Math.max(1, OA.altOf(s.e))), l[0] - OA.SX, l[1] - OA.SZ, OA.altOf(lp), 0, 0, s.fov / D2R, s.cx, s.cy];
}
function camE(Kf, T, pt) {
  const g = c => mono(Kf, T, c);
  const e = OA.mapP(OA.SX + g(1), OA.SZ + g(2), Math.pow(10, g(3)));
  let lp = OA.mapP(OA.SX + g(4), OA.SZ + g(5), g(6));
  const wr = g(7); if (wr > .001 && pt) lp = V.lerp(lp, pt(T), wr);
  const up = OA.upAt(e), kn = g(8);
  const uh = kn > .001 ? V.add(V.mul(up, 1 - kn), V.mul(tangentN(e), kn * 1.5)) : up;
  return shot(e, lp, uh, g(9) * D2R, g(10), g(11));
}
/* the battery fly-in, metres */
const BATT = FILM.path([
  { t: 33, eye: [330, 260, -560], target: [16, 24, -6], fov: 40 },
  { t: 37, eye: [170, 90, -250], target: [52, 30, -64], fov: 40 },
  { t: 40.5, eye: [86, 40, -104], target: [58, 35, -72], fov: 40 },
  { t: 44, eye: [58, 33, -52], target: [30, 28, -38], fov: 40 },
  { t: 48, eye: [36, 30, -25], target: [-6, 27, -2], fov: 42 },
  { t: 52.5, eye: [20, 27.5, -15], target: [-3, 29, 3], fov: 44 },
  { t: 56.5, eye: [15, 25.6, -6], target: [0, 32.5, 6], fov: 44 },
  { t: 60, eye: [16, 25.4, -7], target: [.5, 34, 6], fov: 44 },
]);
const camBatt = T => { const s = BATT(T); return shot(s.eye, s.target, [0, 1, 0], s.fov, 1150, 560); };
/* the crane: a world-anchored eye beside TEL 1 whose look point climbs from the tube to the round */
const CRANE = FILM.path([
  { t: 56.5, eye: [15, 25.6, -6], target: [0, 32.5, 6], fov: 44 },
  { t: 60, eye: [16, 25.4, -7], target: [.5, 34, 6], fov: 44 },
  { t: 61.4, eye: [18, 33, 0], target: [1, 60, 20], fov: 46 },
  { t: 62.8, eye: [30, 58, 50], target: [0, 90, 120], fov: 44 },
  { t: 64.6, eye: [60, 76, 170], target: [0, 90, 300], fov: 40 },
]);
/* the lens rides a point: A through the launch and the macro shots, then it drops back through the
   four to D, and at last lets D go on alone (offsets right, up, forward of the point, metres) */
const REL = FILM.path([
  { t: 61.4, eye: [40, 10, -62], target: [0, 0, 1], fov: 40 },
  { t: 63.0, eye: [18, 5.5, -26], target: [0, 0, 0], fov: 40 },
  { t: 64.5, eye: [8, 2.4, -11], target: [0, 0, -1.2], fov: 40 },
  { t: 66.1, eye: [5.8, 1.6, -8.6], target: [0, .1, -3.2], fov: 42 },
  { t: 67.7, eye: [5.0, 1.4, -3.6], target: [0, .1, -2.2], fov: 44 },
  { t: 69.1, eye: [4.6, 1.3, 1.6], target: [0, 0, -1.2], fov: 44 },
  { t: 70.4, eye: [4.2, 1.2, 5.4], target: [0, 0, -.8], fov: 44 },
  { t: 72.1, eye: [1.8, .85, 6.5], target: [0, .02, 4.1], fov: 46 },
  { t: 73.9, eye: [1.4, .75, 6.1], target: [0, 0, 3.95], fov: 46 },
  { t: 75.3, eye: [2.3, 1.45, 2.1], target: [.5, .05, .1], fov: 46 },
  { t: 76.7, eye: [2.1, 1.3, 1.3], target: [.5, 0, -.15], fov: 46 },
  { t: 78.1, eye: [1.85, .72, -6.3], target: [0, 0, -5.7], fov: 46 },
  { t: 79.3, eye: [2.3, .9, -7.5], target: [0, 0, -6.3], fov: 46 },
  { t: 82.0, eye: [10, 7, -34], target: [2, -1, 40], fov: 42 },
  { t: 85.5, eye: [22, 11, -44], target: [16, 0, 80], fov: 42 },
  // look points stay within a factor of a few in range from key to key: the Hermite tangents of a
  // 160 m -> 9 km jump swing the look point behind the lens
  // as it reaches D the lens rises behind the four: the whole ripple in a line ahead, then down for the long lens
  { t: 88.6, eye: [-4, 18, -64], target: [-8, 3, 480], fov: 42 },
  { t: 90.8, eye: [-6, 28, -112], target: [-4, -14, 600], fov: 40 },
  { t: 92.6, eye: [-6, 20, -96], target: [0, -10, 1200], fov: 36 },
  { t: 94.6, eye: [-6, 11, -42], target: [0, 26, 2200], fov: 20 },
  { t: 97.0, eye: [-5, 12, -42], target: [0, 32, 2200], fov: 22 },
  { t: 99.5, eye: [-5, 7, -40], target: [0, 20, 1800], fov: 38 },
  { t: 103.0, eye: [-5, 6.5, -36], target: [0, 17, 1600], fov: 40 },
  { t: 106.5, eye: [-5.5, 6.5, -38], target: [0, 15, 1600], fov: 38 },
  // the run-in: close behind D, the group dead ahead
  { t: 109.5, eye: [-3, 3.4, -22], target: [-20, 14, 2400], fov: 34 },
  { t: 111.6, eye: [-4, 4.5, -25], target: [-24, 16, 2000], fov: 32 },
  // D pulls away from the decelerating lens: C's burst in the middle distance, then the hit ~750 m out
  { t: 113.5, eye: [-12, 10, -42], target: [-24, 18, 1500], fov: 28 },
  { t: 115.8, eye: [-22, 20, -44], target: [-30, 24, 1250], fov: 28 },
  { t: 118.0, eye: [-28, 36, -40], target: [-34, 30, 1050], fov: 28 },
  // the burning ship stays in the lower third; the column climbs out of the top of the frame
  { t: 121.5, eye: [-30, 40, -32], target: [-34, 44, 610], fov: 25 },
  { t: 124.5, eye: [-34, 52, -46], target: [-36, 50, 380], fov: 28 },
  { t: 127.0, eye: [-40, 72, -84], target: [-40, 64, 300], fov: 32 },
  { t: 130.0, eye: [-50, 110, -180], target: [-40, 100, 300], fov: 34 },
]);
/* the anchor: A until the drop-back, D after; D's point decelerates to a stop short of the ship, still
   easing in through the hit */
const DROP = [80.5, 92.5], TR1 = tlOf(111.2), LR = 6.5;
const anchorTl = tl => { if (tl <= TR1) return tl; const u = Math.min(1, (tl - TR1) / LR); return TR1 + LR * (u - u * u * u + u * u * u * u / 2); };
function anchorAt(T) {
  const tl = tlOf(T), w = sm5((T - DROP[0]) / (DROP[1] - DROP[0]));
  if (w <= 0) return fposR(RND[0], tl);
  const d = fposR(RND[3], anchorTl(tl));
  return w >= 1 ? d : V.lerp(fposR(RND[0], tl), d, w);
}
const AEND = fposR(RND[3], TR1 + LR / 2), HA = hframe(AEND);
const HZ = T => sm5((T - 93) / 2.5) * (1 - sm5((T - 98.5) / 2.5));   // long-lens framing: the group high in frame
function camRel(T) {
  const A = anchorAt(T), H = hframe(A), s = REL(T), e = hpt(H, A, s.eye), tg = hpt(H, A, s.target);
  return shot(e, tg, H.u, s.fov, 1150, E.mix(540, 470, HZ(T)));
}
function camLaunch(T) {
  if (T >= 64.5) return camRel(T);
  const tl = tlOf(T), s = CRANE(T);
  const w = E.ss(-.05, 1.3, tl), m = tl > 0 ? flightR(RND[0], tl) : null;
  const cw = shot(s.eye, m ? V.lerp(s.target, V.mad(m.p, m.a, 1.2), w) : s.target, [0, 1, 0], s.fov, 1150, 560);
  const k = sm5((T - 61.4) / 3.1);
  return k > 0 ? mixShot(cw, camRel(T), k) : cw;
}
/* the dive and the climb (E-form); first/last keys taken from the neighbouring shots */
const DIVE = [
  toE(8, camSat(8), 2e6),
  [13, -30, -560, 5.72, 0, 150, 0, 0, 0, 40, 1180, 560],
  [17, -16, -290, 5.28, 0, 70, 0, 0, 0, 40, 1170, 560],
  [21, -5, -105, 4.74, 0, 12, 0, 0, 0, 40, 1160, 560],
  [25, 1.2, -15, 4.02, .1, .3, 0, 0, 0, 40, 1160, 560],
  [29, .55, -2.6, 3.28, .03, 0, 0, 0, 0, 40, 1155, 560],
  toE(33, camBatt(33), 600), toE(37, camBatt(37), 200),
];
const camDive = T => camE(DIVE, T);
const AE = OA.mapInv(AEND), AX = AE[0] - OA.SX, AZ = AE[1] - OA.SZ;
const SH = OA.mapInv(SHIPS[0].c), SHX = SH[0] - OA.SX, SHZ = SH[1] - OA.SZ;
/* the climb pulls back toward the coast as it rises, looking out along the track, so each layer enters from
   the bottom of frame: the burning ship, the sea rows, the coast and the battery, the map, the theatre, the globe */
const CT = 127;                                                   // the climb begins
const SATK = (() => { const s = camSat(DUR - 10), F = satFrame(satT(DUR - 10)), e = V.mad(s.e, F.t, 60e3); return shot(e, V.mad(e, V.norm(V.sub(s.tg, s.e)), 1), s.u, s.fov, s.cx, s.cy); })();
const colTop = T => { const a = tlOf(T) - TLH; return a > 0 ? smokeP(a, Math.min(a, 6)).p : fireBase(TLH); };
const CLIMB = [
  toE(CT, camRel(CT)), toE(CT + 3, camRel(CT + 3)),
  [CT + 7, AX - .15, AZ - .9, 2.75, SHX, SHZ, 180, .6, 0, 36, 1150, 470],
  [CT + 10.5, AX - .3, AZ - 3.2, 3.3, SHX - .2, SHZ + 3, 0, .35, 0, 38, 1150, 470],
  [CT + 14, AX - .5, 5.5, 3.8, 2.8, SHZ - 2, 0, .1, 0, 40, 1150, 490],
  [CT + 17, 1.2, -4, 4.15, 2.2, 15, 0, 0, .15, 42, 1150, 510],
  [CT + 20, .4, -18, 4.5, 1.2, 13.3, 0, 0, .3, 46, 1150, 540],
  [CT + 23.5, -.8, -34, 4.82, 0, 15, 0, 0, .6, 46, 1150, 560],
  [CT + 28, -3, -50, 5.25, -1, 110, 0, 0, 1, 40, 1150, 560],
  [CT + 33, -18, -280, 5.62, -8, 190, 0, 0, .5, 42, 1170, 560],
  // at rest 60 km up-track of where the satellite will be: the blend into camSat closes monotonically
  toE(CT + 37.5, SATK, 2e6),
];
const camClimb = T => camE(CLIMB, T, colTop);

const SCHED = [['sat', -1, 13], ['dive', 8, 37], ['batt', 33, 60], ['launch', 57, CT + 3], ['climb', CT, CT + 43], ['sat', CT + 34, DUR + 1]];
const SEGF = { sat: camSat, dive: camDive, batt: camBatt, launch: camLaunch, climb: camClimb };
function camAt(T) {
  for (let i = 0; i < SCHED.length; i++) {
    const [n, a, b] = SCHED[i];
    if (T < a || T > b) continue;
    const nx = SCHED[i + 1];
    if (nx && T >= nx[1]) return mixShot(SEGF[n](T), SEGF[nx[0]](T), E.ss(nx[1], b, T));
    return SEGF[n](T);
  }
  return camSat(T);
}
function applyCam(c, T) {
  const f = V.norm(V.sub(c.tg, c.e));
  cam.eye = c.e; cam.target = V.add(c.e, f); cam.up = orth(c.u, f); cam.fov = c.fov; cam.cx = c.cx; cam.cy = c.cy; cam.roll = 0;
  // shake: the ignitions, booster separation, the two kills close ahead, the hit
  const tl = tlOf(T);
  let amp = 0;
  for (const r of RND) { const t = tl - r.L; if (t > .5 && t < 4) amp += (r.i ? 3 : 7) * Math.exp(-(t - .5) / .5); }
  if (tl > 4.6 && tl < 6) amp += 3 * Math.exp(-(tl - 4.6) / .25);
  for (const k of [0, 1]) { const a = tl - KILL[k]; if (a > 0 && a < 3) amp += 4.5 * Math.exp(-a / .35); }
  { const a = tl - TLH, a2 = tl - TSEC; if (a > 0 && a < 6) amp += 9 * Math.exp(-a / .5); if (a2 > 0 && a2 < 3) amp += 1.6 * Math.exp(-a2 / .3); }
  cam.shake = amp > .05 ? FILM.shake(T, amp, 22) : [0, 0];
  cam.update();
}

/* ---------- open sea (o2): swell rows across the track every 40 m; every 4th, 16th... row survives as
   the lens climbs, each faded by its own projected spacing, so the sea thins out self-similarly ---------- */
const WAVES = [{ A: 1.3, L: 150, d: .25, ph: 0 }, { A: .75, L: 84, d: -.7, ph: 1.7 }, { A: .42, L: 46, d: 1.1, ph: 4.1 }, { A: .22, L: 29, d: -.3, ph: 2.2 }]
  .map(w => { const k = TAU / w.L; return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: Math.sqrt(9.81 * k), ph: w.ph }; });
function swellH(c, a, t) { let h = 0; for (let i = 0; i < 4; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * c + w.kz * a - w.w * t + w.ph); } return h; }
const swellW = (x, z, t) => swellH(x * HR[0] + z * HR[2], x * HF[0] + z * HF[2], t);
// a smooth warp along the track at three scales, gentle enough (slope < .06) that rows never cross
const mea = (c, a) => 7 * Math.sin(c * .0061 + 1.4 * Math.sin(a * .0023)) + 26 * Math.sin(c * .00131 + a * .0006 + 2) + 95 * Math.sin(c * .00029 - a * .00017 + 4.1);
const SEA_L = [1, 4, 16, 64, 256, 1024];
// screen border samples, in order around the frame
const FP = [], FPN = 16, FPC = new Float64Array(FPN * 2);
for (let i = 0; i < 4; i++) FP.push([i * 480, 0]); for (let i = 0; i < 4; i++) FP.push([1920, i * 270]);
for (let i = 0; i < 4; i++) FP.push([1920 - i * 480, 1080]); for (let i = 0; i < 4; i++) FP.push([0, 1080 - i * 270]);
function openSea(al, t, vcam, ridge, fine, band) {
  const e = cam.eye, hE = Math.max(1, OA.altOf(e)), Rh = Math.sqrt(2 * RE * hE), Rs = Math.min(Rh, 80000);
  const f = cam.f, r = cam.r, u = cam.u, fl = cam.fl, ccx = cam.cx, ccy = cam.cy;
  const ec = e[0] * HR[0] + e[2] * HR[2], ea = e[0] * HF[0] + e[2] * HF[2];
  // ground footprint of the view (border rays onto the sea, clipped at the horizon). A border ray above the
  // horizon takes the bearing where its screen column meets the horizon: with the lens pitched, its own
  // bearing can be far off and the rows would stop short of the frame edge.
  let amin = 1e12, amax = -1e12;
  for (let k = 0; k < FPN; k++) {
    const sx = (FP[k][0] - ccx) / fl; let sy = (FP[k][1] - ccy) / fl;
    let dx = f[0] + r[0] * sx - u[0] * sy, dy = f[1] + r[1] * sx - u[1] * sy, dz = f[2] + r[2] * sx - u[2] * sy;
    if (band && dy >= -1e-6 && u[1] > 1e-6) { sy = (f[1] + r[1] * sx) / u[1]; dx = f[0] + r[0] * sx - u[0] * sy; dz = f[2] + r[2] * sx - u[2] * sy; }
    const hl = Math.hypot(dx, dz) || 1e-9;
    let d = dy < -1e-6 ? hE / -dy * hl : 1e12; if (d > Rs) d = Rs;
    const gx = e[0] + dx / hl * d, gz = e[2] + dz / hl * d;
    FPC[2 * k] = gx * HR[0] + gz * HR[2]; FPC[2 * k + 1] = gx * HF[0] + gz * HF[2];
    amin = Math.min(amin, FPC[2 * k + 1]); amax = Math.max(amax, FPC[2 * k + 1]);
  }
  amin = Math.max(amin, ea - Rs) - 140; amax = Math.min(amax, ea + Rs) + 140;
  // the c-extent of the footprint polygon on a row a = const; mea() moves a row up to ~130 m along track,
  // so the extent is taken over that band (else rows warped into the bottom of frame are culled)
  const crange = a => {
    let lo = 1e12, hi = -1e12;
    for (let j = band ? -1 : 0; j <= (band ? 1 : 0); j++) {
      const ar = a + j * 130;
      for (let k = 0; k < FPN; k++) {
        const k2 = (k + 1) % FPN, c0 = FPC[2 * k], a0 = FPC[2 * k + 1], c1 = FPC[2 * k2], a1 = FPC[2 * k2 + 1];
        if ((a0 - ar) * (a1 - ar) > 0 || a0 === a1) { if (a0 === ar && a1 === ar) { lo = Math.min(lo, c0, c1); hi = Math.max(hi, c0, c1); } continue; }
        const c = c0 + (c1 - c0) * (ar - a0) / (a1 - a0); if (c < lo) lo = c; if (c > hi) hi = c;
      }
    }
    const dA = a - ea, hw = Math.sqrt(Math.max(0, Rs * Rs - dA * dA));
    return [Math.max(lo - 60, ec - hw), Math.min(hi + 60, ec + hw)];
  };
  // screen spacing (px) between rows 1 m apart at a world point: the part of the along-track step
  // perpendicular to the row's own screen direction
  const Fx = HF[0] * r[0] + HF[2] * r[2], Fy = HF[0] * u[0] + HF[2] * u[2], Fz = HF[0] * f[0] + HF[2] * f[2];
  const Gx = HR[0] * r[0] + HR[2] * r[2], Gy = HR[0] * u[0] + HR[2] * u[2], Gz = HR[0] * f[0] + HR[2] * f[2];
  const spAt = (x, y, z) => {
    const dx = x - e[0], dy = y - e[1], dz = z - e[2];
    const cz = dx * f[0] + dy * f[1] + dz * f[2]; if (cz < 1) return 0;
    const iz = 1 / cz, px = (dx * r[0] + dy * r[1] + dz * r[2]) * iz, py = (dx * u[0] + dy * u[1] + dz * u[2]) * iz;
    const Dx = Fx - px * Fz, Dy = Fy - py * Fz, Lx = Gx - px * Gz, Ly = Gy - py * Gz;
    return fl * iz * Math.abs(Dx * Ly - Dy * Lx) / (Math.hypot(Lx, Ly) || 1e-9);
  };
  const vl = V.len(vcam);
  const blurAt = (dx, dy, dz) => { if (vl < 1) return 0; const L = Math.sqrt(dx * dx + dy * dy + dz * dz), vd = (vcam[0] * dx + vcam[1] * dy + vcam[2] * dz) / L; return fl * Math.sqrt(Math.max(0, vl * vl - vd * vd)) / (60 * L); };
  const nearShore = e[2] < 7000 || hE > 1500;
  // with fine > 0, rows every 10 m join in between (they fade by their own spacing like the rest; above
  // ~700 m they are sub-pixel everywhere, so they are not generated at all)
  fine = (fine || 0) * (1 - E.ss(250, 700, hE));
  const B = fine > .01 ? 10 : 40, k0 = Math.ceil(amin / B), k1 = Math.floor(amax / B);  const wx = [0, 0, 0];
  for (let kk = k0; kk <= k1; kk++) {
    let S = 10, fa = 1;
    if (B === 10 && kk % 4) fa = fine;
    else { const k4 = B === 10 ? kk / 4 : kk; let lv = 0; while (lv < 5 && k4 % (SEA_L[lv + 1]) === 0) lv++; S = 40 * SEA_L[lv]; }
    const a = kk * B;
    const [c0, c1] = crange(a); if (c0 >= c1) continue;
    // quick reject: the row is too dense to show anywhere in view
    let smax = 0;
    for (const cq of [c0, (c0 + c1) * .5, c1, E.clamp(ec, c0, c1)]) { const aq = a + mea(cq, a), x = HR[0] * cq + HF[0] * aq, z = HR[2] * cq + HF[2] * aq; smax = Math.max(smax, spAt(x, OA.seaY(x, z), z)); }
    if (smax * S < 2) continue;
    let pv = false, pa = 0, px = 0, py = 0, pz = 0;
    for (let c = c0; ;) {
      const aq = a + mea(c, a), x = HR[0] * c + HF[0] * aq, z = HR[2] * c + HF[2] * aq;
      const dxh = x - e[0], dzh = z - e[2], dh = Math.sqrt(dxh * dxh + dzh * dzh), dd = Math.sqrt(dh * dh + hE * hE);
      let ok = true, shore = 1;
      if (nearShore) { const zs = OA.shoreZ(x); if (z < zs + 4) ok = false; else shore = E.ss(1200, 2800, z - zs); }
      if (ok) {
        const sy = OA.seaY(x, z), b = blurAt(dxh, sy - e[1], dzh), keep = b > 0 ? E.clamp(26 / b, 0, 1) : 1;
        const y = sy + (swellH(c, aq, t) + (ridge ? ridge(x, z) : 0)) * (.3 + .7 * keep);
        const sp = spAt(x, y, z) * S;
        const alp = al * fa * .4 * E.ss(2, 7, sp) * shore * (1 - E.ss(Rs * .55, Rs, dh)) * (b > 0 ? E.clamp(45 / b, .1, 1) : 1);
        if (pv && (alp > .004 || pa > .004)) { wx[0] = x; wx[1] = y; wx[2] = z; WL.seg([px, py, pz], wx, (alp + pa) * .5); }
        pv = true; pa = alp; px = x; py = y; pz = z;
      } else pv = false;
      if (c >= c1) break;
      c = Math.min(c1, c + Math.max(4, dd * .035));
    }
  }
  // whitecaps on the crests, each smeared by one frame of the lens's motion
  if (hE < 400) {
    const Cc = 11, rad = 190, sv = V.mul(vcam, -.35 / 60), fade = 1 - E.ss(150, 400, hE);
    const i0 = Math.floor((ec - rad) / Cc), i1 = Math.floor((ec + rad) / Cc), j0 = Math.floor((ea - rad) / Cc), j1 = Math.floor((ea + rad) / Cc);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = hash(i, j); if (h > .3) continue;
      const c = (i + hash(i + 7, j)) * Cc, a = (j + hash(i, j + 5)) * Cc, dc = c - ec, da = a - ea, d2 = dc * dc + da * da;
      if (d2 > rad * rad || d2 < 64) continue;
      const aq = a + mea(c, a), x = HR[0] * c + HF[0] * aq, z = HR[2] * c + HF[2] * aq;
      if (nearShore && z < OA.shoreZ(x) + 30) continue;
      if ((x - e[0]) * f[0] + (z - e[2]) * f[2] + (-e[1]) * f[1] < 2) continue;
      const sw = swellH(c, aq, t), crest = E.sat((sw + .1) / 1.3); if (crest <= .02) continue;
      const w = [x, OA.seaY(x, z) + sw + .05, z], d = Math.sqrt(d2), Lk = .5 + hash(j, i);
      WL.seg(w, [w[0] + sv[0] * Lk + HF[0] * .4, w[1], w[2] + sv[2] * Lk + HF[2] * .4], al * fade * .42 * crest * (1 - E.ss(rad * .55, rad, d)) * E.ss(8, 30, d));
    }
  }
  return Rh;
}
/* horizon: the true sea horizon for the lens height */
function horizon(al) {
  const e = cam.eye, hE = Math.max(1, OA.altOf(e)), Rh = Math.sqrt(2 * RE * hE);
  if (al <= .004 || hE > 20000) return;
  const fx = cam.f[0], fz = cam.f[2], gl = Math.hypot(fx, fz) || 1, gx = fx / gl, gz = fz / gl;
  let prev = null;
  for (let i = -30; i <= 30; i++) {
    const q = i / 30 * 1.5, dx = gx * Math.cos(q) + gz * Math.sin(q), dz = -gx * Math.sin(q) + gz * Math.cos(q);
    const x = e[0] + dx * Rh, z = e[2] + dz * Rh, p = [x, OA.seaY(x, z), z];
    if (prev) WL.seg(prev, p, al);
    prev = p;
  }
}

/* ---------- exhaust ---------- */
function plume(Mx, m, T) {
  const t = m.t, ax = m.a, [U, Vv] = GEO.perp(ax), fk = Math.floor(SIM(T) * 60) + m.r.i * 17;
  if (t > .5 && t < 4.6) {
    const glow = Math.exp(-(t - .5) / .6), nz = X.ap(Mx, [0, 0, BNZ]);
    const L = 5 + 2.6 * hash(fk, 3) + 5 * glow, tip = V.mad(nz, ax, -L);
    WL.style('#FFFFFF', 1.4);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; WL.seg(V.add(nz, V.add(V.mul(U, Math.cos(a) * .2), V.mul(Vv, Math.sin(a) * .2))), V.add(tip, V.mul(V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a))), .18 * hash(fk, i))), .85); }
    WL.seg(nz, V.mad(nz, ax, -L * 1.3), 1);
    for (let k = 0; k < 3; k++) WL.ring(V.mad(nz, ax, -(.9 + k * 1.3)), U, Vv, .19 - k * .03, 14, .55 - k * .13);
    WL.style(WH, 1);
  } else if (t >= 5.25) {
    // ramjet: faint cone and a train of standing shock cells (Mach diamonds)
    const lt = E.ss(5.25, 5.6, t), nz = X.ap(Mx, [0, 0, NZ]), r = .27, L = (6.5 + 1.4 * hash(fk, 5)) * lt, cell = .95, nC = 6;
    WL.style('#FFFFFF', 1);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a))); WL.seg(V.mad(nz, d, r * .9), V.mad(V.mad(nz, ax, -L), d, .04), .26 * lt); }
    WL.seg(nz, V.mad(nz, ax, -L * 1.4), .45 * lt);
    for (let k = 0; k < nC; k++) {
      const s0 = k * cell + .15, sm = s0 + cell * .5, s1 = s0 + cell, rr = r * (1 - k / (nC + 1.5)), fa = (1 - k / (nC + .5)) * lt;
      const cm = V.mad(nz, ax, -sm);
      WL.ring(cm, U, Vv, rr * .32, 12, .75 * fa);
      for (let i = 0; i < 6; i++) { const th = i / 6 * TAU + k * .5, d = V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th))); WL.seg(V.mad(V.mad(nz, ax, -s0), d, rr), V.mad(cm, d, rr * .32), .38 * fa); WL.seg(V.mad(cm, d, rr * .32), V.mad(V.mad(nz, ax, -s1), d, rr * .78), .26 * fa); }
    }
    WL.style(WH, 1);
  }
}
/* Mach cone, its V-shaped footprint on the sea, spray where the shock slaps the water */
function machOf(m) {
  if (m.s < 360 || m.h > 60) return null;
  const MU = Math.asin(340 / m.s), TMU = Math.tan(MU), apex = V.mad(m.p, m.a, NOSE), H = hframe(m.p), hm = m.h;
  const ac = V.dot(apex, H.r), aa = V.dot(apex, H.f);
  const ridge = (x, z) => { const c = x * H.r[0] + z * H.r[2], a = x * H.f[0] + z * H.f[2], s = aa - a, r = s * TMU; if (r <= hm) return 0; const w = Math.sqrt(r * r - hm * hm), d = Math.abs(Math.abs(c - ac) - w); return d < 7 ? .7 * Math.exp(-d * d / 5) * Math.exp(-s / 420) : 0; };
  return { MU, TMU, apex, H, hm, ac, aa, ridge };
}
function drawMach(mc, m, t, al, seed) {
  const { MU, TMU, apex, H, hm } = mc;
  const back = V.mul(m.a, -1), [U, Vv] = GEO.perp(m.a), cmu = Math.cos(MU), smu = Math.sin(MU);
  const rel = V.sub(cam.eye, apex), sc = -V.dot(rel, m.a), rad = V.len(V.sub(rel, V.mul(m.a, -sc)));
  const ca = al * E.ss(1.35, 1.8, m.s / 340) * (sc <= 0 ? 1 : E.ss(1.05, 1.5, rad / (sc * TMU)));
  if (ca > .01) for (let g = 0; g < 14; g++) {
    const th = (g + .5) / 14 * TAU, gd = V.add(V.mul(back, cmu), V.mul(V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th))), smu));
    let sEnd = 36; if (V.dot(gd, H.u) < 0) sEnd = Math.min(sEnd, (hm - .3) / -V.dot(gd, H.u));
    for (const [s0, s1, a] of [[0, 9, .13], [9, 20, .07], [20, 36, .03]]) { if (s0 >= sEnd) break; WL.seg(V.mad(apex, gd, s0), V.mad(apex, gd, Math.min(s1, sEnd)), a * ca); }
  }
  if (ca > .01) for (const s of [5, 12]) {
    const r = s * TMU, c = V.mad(apex, back, s); let prev = null;
    for (let i = 0; i <= 40; i++) { const th = i / 40 * TAU, p = V.add(c, V.add(V.mul(U, Math.cos(th) * r), V.mul(Vv, Math.sin(th) * r))); if (prev && OA.altOf(prev) > .2 && OA.altOf(p) > .2) WL.seg(prev, p, .08 * (1 - s / 30) * ca); prev = p; }
  }
  const s0 = hm / TMU, fk = Math.floor(t * 30) + (seed || 0) * 977;
  const gp = (c, a) => [H.r[0] * c + H.f[0] * a, 0, H.r[2] * c + H.f[2] * a];
  for (const side of [-1, 1]) {
    let prev = null, pa = 0;
    for (let s = s0; s < s0 + 900;) {
      const r = s * TMU, w = Math.sqrt(Math.max(0, r * r - hm * hm)), cc = mc.ac + side * w, aa = mc.aa - s, q = gp(cc, aa);
      q[1] = OA.seaY(q[0], q[2]) + swellW(q[0], q[2], t) + .75;
      // strongest at the apex where the shock slaps the water, gone well before it sweeps past the lens
      const a = .26 * Math.exp(-(s - s0) / 60) * al;
      if (prev) WL.seg(prev, q, (a + pa) * .5);
      prev = q; pa = a;
      s += Math.min(14, 1.2 + (s - s0) * .05);
    }
    let n = 0;
    for (let s = s0 + .5; s < s0 + 240; s += 2.2, n++) {
      const h1 = hash(fk * 131 + n, side + 5); if (h1 > .35 + .6 * Math.exp(-(s - s0) / 60)) continue;
      const r = s * TMU, w = Math.sqrt(Math.max(0, r * r - hm * hm)), kf = Math.exp(-(s - s0) / 70);
      const cc = mc.ac + side * (w + hash(fk, n) * 1.5), aa = mc.aa - s - hash(n, fk) * 2, b = gp(cc, aa);
      b[1] = OA.seaY(b[0], b[2]) + swellW(b[0], b[2], t) + .6;
      const hg = (.15 + hash(n + 3, fk) * .7) * (.5 + kf * 1.4), out = side * (.1 + hash(fk + 9, n) * .5), bk = 2 + hash(n, fk + 2) * 6;
      const tip = V.add(b, V.add(V.mul(H.r, out), V.add(V.mul(H.u, hg), V.mul(H.f, -bk))));
      WL.seg(b, tip, (.18 + .4 * kf) * (.4 + .6 * hash(fk + 1, n)) * al);
    }
  }
}

/* ---------- trails: each point stays where it was laid, then sinks, drifts and spreads with age ---------- */
const TWIND = [.9, 0, -.5];
function trailLines(at, t0, t1, n, side, w0, wk, sink, life, al, now) {
  const rails = side ? [-1, 1] : [0], tn = now === undefined ? t1 : now;
  for (const s of rails) {
    let px = 0, py = 0, pz = 0, pa = 0;
    for (let i = 0; i <= n; i++) {
      const tau = t0 + (t1 - t0) * i / n, age = Math.max(0, tn - tau), [p, lat] = at(tau), w = s * (w0 + wk * Math.sqrt(age));
      const x = p[0] + lat[0] * w + TWIND[0] * age * .35, y = p[1] - sink * age, z = p[2] + lat[2] * w + TWIND[2] * age * .35;
      const a = al * Math.exp(-age / life) * E.ss(.15, 1.1, age);
      if (i && (a > .004 || pa > .004)) WL.seg([px, py, pz], [x, y, z], (a + pa) * .5);
      px = x; py = y; pz = z; pa = a;
    }
  }
}
function roundTrails(tl, T) {
  const on = E.ss(83, 87, T) * (1 - E.ss(CT + 2, CT + 8, T));
  if (on < .01) return;
  for (const r of RND) {
    const te = Math.min(tl, r.end), t0 = Math.max(r.L + 5, te - 26);
    if (te <= t0) continue;
    const at = tau => { const f = flightR(r, tau); return [V.mad(f.p, f.a, NZ), HR]; };
    trailLines(at, t0, te, 44, 0, 0, 0, .1, 12, .45 * on, tl);
    trailLines(at, t0, te, 44, 1, .3, .8, .12, 10, .22 * on, tl);
  }
}
/* SM-6 trails: laid smoke, drifting downwind and spreading, lingering long after the motor is out */
const SWIND = [3.2, .4, -1.6];
function smTrail(I, tl, al) {
  const s1 = Math.min(tl - I.tL, I.sEnd);
  if (s1 <= 0) return;
  const n = Math.max(2, Math.ceil(s1 * 12)), L = I.lat;
  for (const rail of [-1, 1]) {
    let pv = null, pa = 0;
    for (let i = 0; i <= n; i++) {
      const s = s1 * i / n, age = Math.max(0, tl - I.tL - s), p = smAt(I, s);
      // both edges meander together (a shared centre-line drift) and spread apart: a widening trail, not a braid
      const amp = 1.2 + 1.8 * age, n1 = M3.noise(s * .9 + I.seed, age * .06, 1.7), n2 = M3.noise(s * .9 + I.seed, age * .06, 6.3);
      const w = rail * (.9 + 3.2 * Math.sqrt(age)) * (1 + .3 * M3.noise(s * 2.1 + I.seed, age * .1, 3.3 + rail));
      const q = [p[0] + SWIND[0] * age + L[0] * (w + amp * n1), p[1] + SWIND[1] * age + amp * .7 * n2, p[2] + SWIND[2] * age + L[2] * (w + amp * n1)];
      const a = al * (.3 + .7 * Math.exp(-age / 1.4)) * Math.exp(-age / 30) * (s < 6 ? 1 : .6) * E.ss(0, .2, s);
      if (pv) WL.seg(pv, q, (a + pa) * .5);
      pv = q; pa = a;
    }
  }
}
function drawSMs(tl, e) {
  for (const I of SMS) {
    const s = tl - I.tL;
    if (s <= 0 || s > I.sEnd + 60) continue;
    smTrail(I, tl, .55);
    // exhaust billowing off the cell, lingering over the deck
    if (s < 16) {
      const c = I.cellW, up = OA.upAt(c);
      for (let k = 0; k < 5; k++) {
        const a = s - k * .18; if (a <= 0) continue;
        const q = [c[0] + SWIND[0] * a + (hash(k, I.seed) - .5) * 14, c[1] + 4 + 9 * Math.sqrt(a) + 5 * k, c[2] + SWIND[2] * a + (hash(k, I.seed + 3) - .5) * 14];
        const rr = 5 + 7 * Math.sqrt(a) + 2.5 * k, d = V.dist(q, e);
        billow(q, rr, scrAng(up), .22 * Math.pow(1 - a / 16, 1.4) * E.ss(0, .3, a), I.seed * 11 + k, a, rr * cam.fl / d);
      }
    }
    if (s >= I.sEnd) continue;
    const p = smAt(I, s), d = smDir(I, s), dist = V.dist(p, e), px = 6.55 * cam.fl / dist, boost = s < 6;
    // the plume: a bright flickering stroke while the Mk 72 burns, a thinner one on the sustainer
    const fk = Math.floor(tl * 60) + I.seed * 31, Lp = boost ? 26 + 10 * hash(fk, 2) : 12 + 5 * hash(fk, 3);
    WL.style('#FFFFFF', boost ? 1.5 : 1.1);
    WL.seg(p, V.mad(p, d, -Lp), boost ? 1 : .7);
    if (dist < 2500) { const [U, Vv] = GEO.perp(d); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; WL.seg(V.mad(p, d, -3.3), V.add(V.mad(p, d, -3.3 - Lp * .6), V.mul(V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a))), .9 * hash(fk, i + 5))), .5); } }
    WL.style(WH, 1);
    if (px > 5) GEO.draw(WL, M.sm, X.make(R.look(d, OA.upAt(p)), p), { booster: boost }, { a: E.ss(5, 20, px), fine: false });
  }
}

/* ---------- blasts ---------- */
const BLIFE = { kill: 26, pair: 20, ciws: 20, hit: 40, sec: 30, sd: 16 };
function drawBlast(b, tl, e) {
  const a = tl - b.t0; if (a < 0 || a > BLIFE[b.kind]) return;
  const c = b.p, fl = cam.fl, R0 = b.R, big = b.kind === 'hit';
  // fireball shell: great circles opening fast, then thinning as it cools
  // the lens flies through the kills' debris seconds later: a shell that fills the frame fades out
  const SL = big ? 1.6 : 1.1;
  if (a < SL) {
    const r = R0 * (1 - Math.exp(-a / (big ? .22 : .15))) + 2, rpx = r * fl / V.dist(c, e), al = Math.pow(1 - a / SL, 1.4) * (1 - E.ss(260, 620, rpx));
    const n = E.clamp(Math.round(rpx / 1.4), 12, 40);
    for (let k = 0; k < (big ? 5 : 3); k++) {
      const ax = V.norm([hash(k, b.seed) - .5, hash(k + 1, b.seed) - .5 + .3, hash(k + 2, b.seed) - .5]), [U, Vv] = GEO.perp(ax);
      const ka = Math.exp(-a / (big ? .5 : .3));
      WL.ring(c, U, Vv, r * (.8 + .3 * hash(k + 5, b.seed)), n, .8 * al * ka, .35 * al * ka);
    }
    WL.disc(c, r * .55, n, .9 * al);
    if (big) WL.disc(c, r * 1.25, n, .35 * al);
  }
  // the blast wave on the water: a ring racing out from under the burst
  if (big || b.kind === 'ciws') {
    const s = OA.altOf(c), up = OA.upAt(c), g = V.mad(c, up, -s), rr = 340 * a;
    if (a < 1.2 && rr > s) { const [U, Vv] = GEO.perp(up), rw = Math.sqrt(rr * rr - s * s); WL.ring(V.mad(g, up, .6), U, Vv, rw, 48, .5 * (1 - a / 1.2)); }
  }
  // puffs: the fireball's smoke, rising and drifting, spreading, thinning
  const np = big ? 9 : b.kind === 'sd' || b.kind === 'pair' ? 4 : 6;
  for (let k = 0; k < np; k++) {
    const ak = a - .08 - k * .05; if (ak <= 0) continue;
    const rise = (big ? 30 : 8) * (1 - Math.exp(-ak / 3)) + (big ? 1.5 : .6) * ak;
    const q = [c[0] + (hash(k, b.seed + 40) - .5) * R0 * 1.3 + SWIND[0] * ak, c[1] + (hash(k, b.seed + 41) - .5) * R0 * .8 + rise, c[2] + (hash(k, b.seed + 42) - .5) * R0 * 1.3 + SWIND[2] * ak];
    const rr = R0 * (.35 + .25 * hash(k, b.seed + 43)) + (big ? 5 : 3) * Math.sqrt(ak), d = V.dist(q, e), rpx = rr * fl / d;
    if (rpx < 1) continue;
    billow(q, rr, scrAng(OA.upAt(q)), .34 * Math.pow(1 - ak / BLIFE[b.kind], 1.5) * E.ss(.05, .5, ak) * E.ss(1, 4, rpx) * (1 - E.ss(320, 760, rpx)), b.seed * 13 + k, ak, rpx);
  }
  // fragments: bright streaks while hot, smoking specks after; each ends in a splash
  for (let k = 0; k < b.F.length; k++) {
    const f = b.F[k];
    if (a < f.tS) {
      const p = fragAt(c, f, a), q = fragAt(c, f, Math.max(0, a - (f.big ? .12 : .06)));
      const hot = Math.exp(-a / (f.big ? 1.6 : .7));
      WL.seg(q, p, (.25 + .7 * hot) * (f.big ? 1 : .8));
      if (f.big && a > .15) { // a smoking chunk: its trail stays in the air
        let pv = p;
        for (let j = 1; j <= 8; j++) { const tq = Math.max(0, a - j * .18), qq = fragAt(c, f, tq), age = a - tq; const w = [qq[0] + SWIND[0] * age, qq[1] + .8 * age, qq[2] + SWIND[2] * age]; WL.seg(pv, w, .28 * (1 - j / 9)); pv = w; }
      }
    } else if (a < f.tS + 2.6) splash(f.sp, a - f.tS, f.big ? 1 : .45, k + b.seed * 7);
  }
}
/* a splash: a crown of spray lines thrown up and falling back, and a ring spreading on the water */
function splash(p, a, s, seed) {
  const up = OA.upAt(p), [U, Vv] = GEO.perp(up), H = 14 * s, al = Math.pow(1 - a / 2.6, 1.3);
  for (let i = 0; i < 7; i++) {
    const th = (i + hash(i, seed)) / 7 * TAU, d = V.add(V.mul(U, Math.cos(th)), V.mul(Vv, Math.sin(th))), vup = Math.sqrt(2 * 9.81 * H) * (.6 + .5 * hash(i + 3, seed)), vo = 2 + 3 * hash(i + 5, seed) * s;
    const at = t => V.add(V.mad(p, up, Math.max(0, vup * t - 4.9 * t * t)), V.mul(d, vo * t));
    WL.seg(at(Math.max(0, a - .25)), at(a), .5 * al);
  }
  WL.ring(V.mad(p, up, .3), U, Vv, 1.5 + 6 * s * Math.sqrt(a), 16, .35 * al);
}
/* the fire at the hole: flickering tongues leaning downwind */
function drawFire(tl, e) {
  const ah = tl - TLH; if (ah < .15) return;
  const c = hitNow(tl), up = OA.upAt(c), fire = E.ss(.15, 1.1, ah) * (1 - .5 * E.ss(20, 34, ah)), sx = shipX(DD1, tl), sd = X.dir(sx, [1, 0, 0]), fd = X.dir(sx, [0, 0, 1]);
  for (let k = 0; k < 9; k++) {
    const h = (6 + 14 * (.5 + .5 * M3.noise(tl * 5 + k * 3.1, k))) * fire, x = (k - 4) * 2.2;
    const b = V.add(V.mad(c, fd, x), V.mul(sd, (hash(k, 3) - .5) * 3)), tip = V.add(V.mad(b, up, h), V.mul(SMK.w, h * .35));
    WL.seg(b, V.lerp(b, tip, .55), .6 * fire); WL.seg(V.lerp(b, tip, .55), V.add(tip, V.mul(fd, .8 * M3.noise(tl * 7, k))), .35 * fire);
  }
}
/* a billow: camera-facing lobes around a parcel, each drawn as its outward arc only, so a cluster reads as
   one lumpy outline (the tops of the lobes stack up the column as the classic cumulus folds) instead of as
   overlapping circles. phi: the screen angle of "up" for this billow; te: its own age, for the slow roll */
const LOBES = [[0, .42, .6, 1.75, .6], [1.2, .46, .56, 1.65, 1], [-1.2, .46, .56, 1.65, 1], [.62, .44, .5, 1.45, .75], [-.62, .44, .5, 1.45, .75], [2.3, .4, .5, 1.3, .55], [-2.3, .4, .5, 1.3, .55]];
const _q = [0, 0, 0], _p = [0, 0, 0];
function arcCam(c, r, a0, a1, n, al) {
  if (al <= .004) return;
  const U = cam.r, Vv = cam.u;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, ca = Math.cos(a), sa = Math.sin(a);
    _q[0] = c[0] + (U[0] * ca + Vv[0] * sa) * r; _q[1] = c[1] + (U[1] * ca + Vv[1] * sa) * r; _q[2] = c[2] + (U[2] * ca + Vv[2] * sa) * r;
    if (i) WL.seg(_p, _q, al);
    _p[0] = _q[0]; _p[1] = _q[1]; _p[2] = _q[2];
  }
}
function billow(c, r, phi, al, seed, te, rpx, nMax) {
  if (al <= .004) return;
  if (rpx < 7) { WL.disc(c, r * .9, 6, al * .8); return; }
  const U = cam.r, Vv = cam.u, nl = Math.min(nMax || 7, rpx < 22 ? 3 : rpx < 60 ? 5 : 7);
  for (let k = 0; k < nl; k++) {
    const L = LOBES[k], th = phi + L[0] + (hash(seed, k + 20) - .5) * .55 + .22 * Math.sin(te * .45 + seed * 1.3 + k * 1.7);
    const d = r * L[1] * (.8 + .4 * hash(seed, k + 30)), rl = r * L[2] * (.8 + .4 * hash(seed, k + 40)), ct = Math.cos(th), st = Math.sin(th);
    const lc = [c[0] + (U[0] * ct + Vv[0] * st) * d, c[1] + (U[1] * ct + Vv[1] * st) * d, c[2] + (U[2] * ct + Vv[2] * st) * d];
    arcCam(lc, rl, th - L[3], th + L[3], E.clamp(Math.round(rl / r * rpx / 5), 4, 14), al * L[4]);
  }
}
/* screen angle (in the lens's r/u plane) of a world direction */
const scrAng = d => Math.atan2(V.dot(d, cam.u), V.dot(d, cam.r));
/* the column over DDG 1 */
function drawColumn(a, al, e) {
  if (a <= 0 || al <= .004) return;
  const fl = cam.fl, U = SMK.up, W = SMK.w, DTE = .125;
  // one billow per parcel, carried up the column (the billows climb and roll). Parcels bunch up as they
  // slow and spread, so a parcel is kept only while its spacing along the column is a fair fraction of its
  // radius: parcel k survives up to a stride of its largest power-of-two factor
  for (let k = 0; k * DTE < a; k++) {
    const s = a - k * DTE, zd = smZd(s), xd = smXd(s);
    const need = .5 * smR(s) / (Math.hypot(zd, xd) * DTE), cc = k ? (k & -k) : 4096, fk = E.ss(.5, 1, cc / need);
    if (fk <= .01) continue;
    const q = smokeP(a, s);
    const rj = q.r * (.8 + .4 * hash(k, 11)), d = V.dist(q.p, e), rpx = rj * fl / d;
    const ra = al * .42 * fk * Math.pow(1 - E.sat(s / 60), 1.2) * E.ss(0, .4, s) * E.ss(1.2, 5, rpx);
    if (ra <= .004) continue;
    const tg = [U[0] * zd + W[0] * xd, U[1] * zd + W[1] * xd, U[2] * zd + W[2] * xd];
    const cp = V.add(q.p, [(hash(k, 1) - .5) * rj * .4, (hash(k, 2) - .5) * rj * .3, (hash(k, 4) - .5) * rj * .4]);
    billow(cp, rj, scrAng(tg), ra, k * 7 + 3, q.te, rpx, 5);
  }
  // the stem's edges: two soft lines up the sides from the fire, so the column has a body
  const sd = V.norm(V.cross(U, V.sub(fireBase(TLH + a), e)));
  for (const side of [-1, 1]) {
    let pv = null, pa = 0;
    for (let i = 0; i <= 18; i++) {
      const s = Math.min(a, 40) * Math.pow(i / 18, 1.4), q = smokeP(a, s), w = q.r * (.55 + .12 * M3.noise(q.te * .6 + side * 4, s * .2, 2.2));
      const p = V.mad(q.p, sd, side * w), al2 = al * .22 * Math.pow(1 - E.sat(s / 44), 1.2) * E.ss(0, .6, s);
      if (pv) WL.seg(pv, p, (al2 + pa) * .5);
      pv = p; pa = al2;
    }
  }
}

/* ---------- the ships: hull and fittings, the wake, SPY search pulses ---------- */
const GRP = SHIPS.map((S, i) => ({ S, i }));
function drawShips(T, tl, e) {
  if (T < 84 || T > CT + 26) return;
  const vis = E.ss(84, 88, T);
  for (const { S, i } of GRP) {
    const sx = shipX(S, tl), d = V.dist(sx.T, e), px = 155 * cam.fl / Math.max(1, d);
    if (px < 4 || !OA.clear(V.mad(sx.T, OA.upAt(sx.T), 20))) continue;
    const near = px > 150 && i === 0;
    const st = i === 0 ? (() => { const am = ciwsAim(tl); return { ciwsYaw: [0, am.yaw], ciwsPitch: [.35, am.pitch], ciwsSpin: ciwsFiring(tl) ? tl * 150 : 0, sps: tl * 2.1, gunYaw: -1.3, gunPitch: .12 }; })() : { sps: tl * 2.1 + i };
    GEO.draw(WL, near ? M_DDN : M_DD, sx, st, { a: vis * E.mix(.24, .9, E.ss(40, 260, px)), fine: false });
    if (px > 30) wake(sx, tl, e, vis * E.ss(30, 120, px));
  }
}
/* a Kelvin wake: two arms off the bow at 19.5 deg, the stern boil and the long flat centre track */
function wake(sx, tl, e, al) {
  if (al < .01) return;
  const P = (x, z) => { const q = X.ap(sx, [x, 0, z]); return V.mad(q, OA.upAt(q), -OA.altOf(q) + .4); };
  const ta = Math.tan(19.5 * D2R);
  for (const s of [-1, 1]) {
    let pv = null;
    for (let k = 0; k <= 16; k++) { const L = k / 16 * 520, q = P(s * (9 + L * ta), 70 - L); if (pv) WL.seg(pv, q, .35 * al * Math.pow(1 - k / 17, 1.2)); pv = q; }
    // transverse crests between the arms, marching with the ship
    for (let j = 0; j < 6; j++) { const L = 40 + j * 42 + (tl * VSH) % 42, w = 9 + L * ta; WL.seg(P(-w * .8, 70 - L), P(w * .8, 70 - L), .16 * al * (1 - j / 6)); }
  }
  for (const s of [-1, 1]) { let pv = null; for (let k = 0; k <= 10; k++) { const L = k * 60, q = P(s * (4 + L * .03), -78 - L); if (pv) WL.seg(pv, q, .3 * al * (1 - k / 11)); pv = q; } }
}
/* radar search pulses: patches of expanding spherical shell from the SPY face that looks their way */
const PPER = .7, PLIFE = 2.4, SHELL = [[0, .5], [9, .85], [18, 1], [29, .6], [42, .28]].map(q => [q[0] * D2R, q[1]]);
function drawPulses(S, tl, al) {
  if (al < .01) return;
  const sx = shipX(S, tl), kNow = Math.floor((tl + S.ph) / PPER);
  for (let k = kNow; k >= kNow - Math.ceil(PLIFE / PPER); k--) {
    const Tk = k * PPER - S.ph, age = tl - Tk; if (age < 0 || age > PLIFE) continue;
    const cb = ((k * 137 + (k >> 2) * 61) % 360 + 7 * Math.sin(k)) * D2R;
    let best = 0, bd = -2;
    for (let fi = 0; fi < 4; fi++) { const n = X.dir(sx, DA.spyN[fi]), dd = n[0] * Math.sin(cb) + n[2] * Math.cos(cb); if (dd > bd) { bd = dd; best = fi; } }
    const c = X.ap(sx, DA.spy[best]), rad = 14 + 240 * age + 380 * age * age, a0 = al * .6 * Math.pow(1 - age / PLIFE, 1.4) * E.ss(0, .06, age);
    for (const [el, w] of SHELL) {
      const ce = Math.cos(el), se = Math.sin(el);
      let pv = null;
      for (let i = 0; i <= 30; i++) {
        const b = cb + (-32 + 64 * i / 30) * D2R;
        const q = [c[0] + Math.sin(b) * ce * rad, c[1] + se * rad - rad * rad / (2 * RE), c[2] + Math.cos(b) * ce * rad];
        if (pv) WL.seg(pv, q, a0 * w * Math.pow(Math.sin(Math.PI * (i - .5) / 30), .8));
        pv = q;
      }
    }
  }
}

/* ---------- labels ---------- */
const ui = document.getElementById('ui');
function callout(html) { const d = document.createElement('div'); d.className = 'call'; d.innerHTML = html; ui.appendChild(d); return d; }
const L = {
  sat: callout(ORB.cat('Lotos-S1', { code: '14F145' }) + '<span class="s2">ELINT · 900 km orbit · <b>7.4 km/s</b></span>'),
  the: callout(ORB.cat('Theatre 1337 · 600 × 600 km', { code: 'TH1337' }) + '<span class="s2">45.2° N · 36.6° E</span>'),
  bat: callout(ORB.cat('Bastion-P · Krasnaya Kosa', { code: 'K300P', sq: 'y' }) + '<span class="s2">coastal battery · <b>2</b> TELs · <b>24 m</b> bluff</span>'),
  rad: callout(ORB.cat('Monolith-B', { code: 'MB-1' }) + '<span class="s2">surface search · <b>11 rpm</b></span>'),
  pz: callout(ORB.cat('Pantsir-S1', { code: '96K6' }) + '<span class="s2">point defence · search radar</span>'),
  tel: callout(ORB.cat('Bastion-P · TEL 1', { code: 'K340P' }) + '<span class="s2"></span>'),
  tel2: callout(ORB.cat('TEL 2', { code: 'K340P-2' }) + '<span class="s2"></span>'),
  mis: callout(ORB.cat('3M55 · P-800', { code: '3M55' }) + '<span class="s2"></span>'),
  four: callout(ORB.cat('3M55 ×4', { code: '3M55x4', sq: 'y' }) + '<span class="s2"></span>'),
  bst: callout(ORB.cat('Booster casing · spent', { code: 'BST' }) + '<span class="s2">out through the ramjet nozzle</span>'),
  part: callout('<span class="cat"><i class="sq o"></i><span class="t"></span></span>'),
  grp: callout(ORB.cat('DDG-51 Flight IIA ×3', { code: 'DDG51' }) + '<span class="s2"></span>'),
  sm: callout(ORB.cat('SM-6 · off the deck', { code: 'RIM174' }) + '<span class="s2">Mk 41 VLS · Mk 72 boost</span>'),
  ciws: callout(ORB.cat('Phalanx 1B', { code: 'MK15' }) + '<span class="s2">20 mm · <b>4 500</b> rds/min</span>'),
  hit: callout(ORB.cat('Hit · DDG 1', { code: 'DDG', sq: 'y' }) + '<span class="s2"></span>'),
  // one short label per ring on the map, where each of the other three was stopped
  rng: ['SM-6', 'SM-6', 'Phalanx'].map(s => callout(ORB.cat('Stopped · ' + s, { nobars: true, sq: 'o' }))),
};
const telS = L.tel.querySelector('.s2'), tel2S = L.tel2.querySelector('.s2'), misS = L.mis.querySelector('.s2'), fourS = L.four.querySelector('.s2'), partT = L.part.querySelector('.t'), hitS = L.hit.querySelector('.s2'), grpS = L.grp.querySelector('.s2');
const txtCache = new Map();
const setTxt = (el, s, html) => { if (txtCache.get(el) !== s) { txtCache.set(el, s); if (html) el.innerHTML = s; else el.textContent = s; } };
const KEEP = [[60, 40, 470, 132], [60, 300, 560, 740], [60, 990, 560, 1045], [1380, 36, 1900, 196], [1300, 994, 1900, 1045], [800, 1000, 1120, 1045]];
const leaders = [], dots = [], placed = [];
const widths = new Map();
/* signed clearance (px) of a box from a rect: > 0 when apart */
const sep = (x0, y0, x1, y1, r) => Math.max(r[0] - x1, x0 - r[2], r[1] - y1, y0 - r[3]);
/* a label with a leader from the anchor. It takes the first of four placements (the given side, then
   mirrored) that keeps clear of the frame edge, the menu and the labels already placed this frame, and it
   fades as that placement nears a conflict or a preferred one nears being free again: a label changing
   sides dips out and back in rather than jumping, and render(T) stays a pure function of T.
   rad: start the leader that far out (a ring's edge) */
function place(el, anchor, dx, dy, a, dot, rad) {
  if (!anchor || a <= .01) { el.style.opacity = 0; return; }
  let w = widths.get(el); if (!w || w.s !== el.textContent) { w = { s: el.textContent, w: el.offsetWidth, h: Math.max(16, el.offsetHeight) }; widths.set(el, w); }
  const h = w.h, [ax, ay] = anchor, F = 26;
  // the anchor nearing the frame edge or sliding under the menu: fade, never cut
  let ka = E.sat((Math.min(ax, 1920 - ax, ay, 1080 - ay) - 34) / 60);
  for (const r of KEEP) ka = Math.min(ka, E.sat(sep(ax, ay, ax, ay, r) / 40));
  a *= ka;
  if (a <= .01) { el.style.opacity = 0; return; }
  const box = (sx, sy) => {
    const d = dx * sx, ex2 = ax + d, hx = ex2 + (d >= 0 ? 18 : -18), x0 = d >= 0 ? hx + 8 : hx - 8 - w.w, y1 = ay + dy * sy, y0 = y1 - 6, x1 = x0 + w.w, yb = y0 + h;
    let m = Math.min(x0 - 20, 1900 - x1, y0 - 20, 1060 - yb);
    for (const r of KEEP) m = Math.min(m, sep(x0, y0, x1, yb, r));
    for (const r of placed) m = Math.min(m, sep(x0, y0, x1, yb, r) - 6);
    return { ex2, hx, x0, y0, y1, m };
  };
  let b = null, kp = 1;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const c = box(sx, sy);
    if (c.m > 0) { b = c; break; }
    kp *= E.sat(-c.m / F);
  }
  if (!b) { el.style.opacity = 0; return; }
  a *= kp * E.sat(b.m / F);
  if (a <= .01) { el.style.opacity = 0; return; }
  placed.push([b.x0, b.y0, b.x0 + w.w, b.y0 + h]);
  let sx0 = ax, sy0 = ay;
  if (rad) { const lx = b.ex2 - ax, ly = b.y1 - ay, ll = Math.hypot(lx, ly) || 1; sx0 += lx / ll * rad; sy0 += ly / ll * rad; }
  leaders.push([sx0, sy0, b.ex2, b.y1, b.hx, a]); if (dot) dots.push([ax, ay, a]);
  el.style.opacity = a.toFixed(3);
  el.style.transform = `translate(${b.x0.toFixed(1)}px, ${b.y0.toFixed(1)}px)`;
}
const onScreen = (p, m) => p && p[0] > m && p[0] < 1920 - m && p[1] > m && p[1] < 1080 - m;
const edgeK = p => p ? E.sat(Math.min(p[0] - 40, 1880 - p[0], p[1] - 40, 1040 - p[1]) / 70) : 0;   // fade out toward the frame edge
const win = (s, a, b, f) => E.ss(a, a + (f || .6), s) * (1 - E.ss(b - (f || .6), b, s));
/* screen bounds of a model from its sampled surface (part transforms applied): brackets that fit */
const SAMPLES = new Map();
function samplesOf(m) {
  if (!SAMPLES.has(m)) SAMPLES.set(m, GEO.sample(m, .35, 11, {}, { fine: false }).map(s => { const k = Math.max(1, Math.floor(s.pts.length / 6 / 60)); const q = []; for (let i = 0; i < s.pts.length; i += 6 * k) q.push([s.pts[i], s.pts[i + 1], s.pts[i + 2]]); return { part: s.part, q }; }));
  return SAMPLES.get(m);
}
function screenBox(m, Xw, st, only) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (const s of samplesOf(m)) {
    if (only && !only.includes(s.part.name)) continue;
    if (s.part.show && !s.part.show(st || {})) continue;
    const T = GEO.partXf(Xw, s.part, st || {});
    for (const q of s.q) { const p = cam.project(X.ap(T, q)); if (!p) continue; n++; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  }
  return n ? [x0, y0, x1, y1] : null;
}
const boxU = (a, b) => !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
function bracket(b, a, pad, col) {
  if (!b || a <= .01) return;
  const [x0, y0, x1, y1] = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], c = Math.max(6, Math.min(16, (x1 - x0) * .18, (y1 - y0) * .18));
  ctx.strokeStyle = col || WH; ctx.lineWidth = 1.2; ctx.globalAlpha = a;
  ctx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); }
  ctx.stroke(); ctx.globalAlpha = 1;
}
/* restrained bloom for ignitions, the kills and the hit */
function bloom(p, rad, a) {
  if (!p) return;
  a *= .2 + .8 * E.ss(480, 820, p[0]);                // the menu side stays calm
  if (a <= .004) return;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
  g.addColorStop(0, `rgba(255,255,255,${Math.min(1, a)})`); g.addColorStop(.22, `rgba(255,250,235,${Math.min(1, a) * .3})`); g.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = g; ctx.fillRect(p[0] - rad, p[1] - rad, rad * 2, rad * 2);
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- readout ---------- */
const roV = document.getElementById('rov'), roU = document.getElementById('rou'), roL = document.getElementById('rol'), roS = document.getElementById('ros'), figEl = document.getElementById('fig');
const grp = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const nice = n => { const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };
const clock = s => { const a = Math.abs(s); return `T${s < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${(a % 60).toFixed(1).padStart(4, '0')}`; };
function ruler(lg) {
  const x1 = 1824, w = 360, x0 = x1 - w, y = 170, L0 = 0, L1 = 7, Xr = v => x0 + (v - L0) / (L1 - L0) * w;
  ctx.strokeStyle = WH; ctx.lineWidth = 1;
  ctx.globalAlpha = .28; ctx.beginPath(); ctx.moveTo(x0, y + .5); ctx.lineTo(x1, y + .5);
  for (let d = 0; d < 7; d++) for (let m = 2; m <= 9; m++) { const v = d + Math.log10(m); ctx.moveTo(Math.round(Xr(v)) + .5, y); ctx.lineTo(Math.round(Xr(v)) + .5, y - 3); }
  ctx.stroke();
  ctx.globalAlpha = .6; ctx.beginPath(); for (let d = 0; d <= 7; d++) { ctx.moveTo(Math.round(Xr(d)) + .5, y); ctx.lineTo(Math.round(Xr(d)) + .5, y - 7); } ctx.stroke();
  ctx.font = '400 10.5px "DM Mono", monospace'; ctx.fillStyle = WH; ctx.globalAlpha = .38; ctx.textAlign = 'center';
  ['1 m', '10', '100', '1 km', '10', '100', '1 000', '10 000 km'].forEach((t, i) => ctx.fillText(t, Xr(i), y + 17));
  ctx.textAlign = 'left';
  const mx = Xr(E.clamp(lg, L0, L1));
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(mx, y - 3); ctx.lineTo(mx - 4, y - 10); ctx.lineTo(mx + 4, y - 10); ctx.closePath(); ctx.fill();
  ctx.fillRect(Math.round(mx) - .5, y - 3, 1, 7);
}

/* ---------- chapters ---------- */
const CHAPTERS = [
  { t: 0, title: 'Orbit', fig: 'Lotos-S1 over theatre 1337 · 900 km' },
  { t: 14, title: 'Theatre', fig: 'The dive — seed 1337, 600 × 600 km' },
  { t: 33, title: 'Battery', fig: 'Krasnaya Kosa — Bastion-P, two TELs on the bluff' },
  { t: 57, title: 'Ripple', fig: 'Cold launch — four 3M55 from two TELs' },
  { t: 79.5, title: 'The four', fig: 'Sea-skim · four rounds · Mach 2' },
  { t: 93, title: 'The group', fig: 'The destroyer group fights back' },
  { t: 110, title: 'Close in', fig: 'Phalanx, and the one that gets through' },
  { t: CT + 5, title: 'Climb', fig: 'Powers of ten — every track on the map' },
];
function onChapter(ch) { const i = CHAPTERS.indexOf(ch); setTxt(figEl, `<b>Fig. ${i + 1}</b>${ch.fig}`, true); }

/* ---------- sound ---------- */
const SFX = STAGE.SFX;
const CUES = [
  [DUR - 7.5, () => SFX.tone(2300, 1900, .05, 'sine', .03)],
  [1.2, () => SFX.tone(1760, 1760, .18, 'sine', .025)],
  [9, () => SFX.noise(5.5, 380, .7, .06, 1.8)],
  [30, () => SFX.noise(4, 900, .5, .05, 1.2)],
  [44, () => SFX.noise(.5, 160, 1, .12, .01)],
  [47, () => { SFX.tone(160, 240, 10, 'sawtooth', .012); SFX.noise(10, 300, 1.2, .025, .6); }],
  [56.6, () => SFX.noise(.35, 220, 1, .1, .005)],
  ...RND.map(r => [Tof(r.L), () => SFX.noise(.7, 700, .8, r.i ? .1 : .15, .005)]),
  ...RND.map(r => [Tof(r.L + .5), () => SFX.rumble(r.i ? 3.5 : 5.5, r.i ? .14 : .24)]),
  [Tof(4.6), () => { SFX.crack(); SFX.noise(3, 180, 1, .12, .02); }],
  [Tof(5.25), () => SFX.noise(6, 2400, .6, .06, .3)],
  [79.5, () => SFX.noise(8, 1800, .5, .05, .5)],
  ...[85.3, 88.2, 90.6].map(t => [t, () => SFX.noise(1.6, 1300, .7, .07, .08)]),
  ...SMS.map(I => [Tof(I.tL), () => SFX.noise(2.4, 260, .9, .05, .1)]),
  ...[0, 1].map(k => [Tof(KILL[k]), () => { SFX.crack(); SFX.noise(4, 140, 1, .16, .01); }]),
  ...BURSTS.map(b => [Tof(b[0]), () => SFX.noise((b[1] - b[0]) / .3, 2600, 2.5, .06, .02)]),
  [Tof(KILL[2]), () => SFX.noise(2.5, 300, 1, .1, .01)],
  [THIT, () => { SFX.crack(); SFX.rumble(7, .3); SFX.noise(6, 120, 1, .2, .01); }],
  [Tof(TSEC), () => SFX.noise(3, 200, 1, .12, .01)],
  [CT + 3, () => SFX.tone(220, 440, 30, 'sine', .018)],
];

/* ---------- render ---------- */
const PTS = { rad: [0, 11.6, -5.3], pz: [0, 3.6, -.6], tel: [0, 3.6, -1] };
let camV = [0, 0, 0];
function vehicle(m, Xw, st, base, e) {
  const d = V.dist(Xw.T, e), px = 13 * cam.fl / Math.max(1, d);
  if (px < 3) return;
  // small on screen: coarse and fainter, so a 12 m truck never turns into a white blob
  GEO.draw(WL, m, Xw, st, { a: base * E.mix(.35, 1, E.ss(40, 220, px)), fine: px > 420 });
}
const RIDGES = [];
const ridgeAll = (x, z) => { let h = 0; for (const mc of RIDGES) h += mc.ridge(x, z); return h; };
function render(T) {
  const c = camAt(T); applyCam(c, T);
  { const c1 = camAt(T + 1 / 120), c0 = camAt(Math.max(0, T - 1 / 120)); camV = V.mul(V.sub(c1.e, c0.e), 1 / (T + 1 / 120 - Math.max(0, T - 1 / 120))); }
  OA.sync();
  const e = cam.eye, alt = Math.max(.5, OA.altOf(e)), lg = Math.log10(alt), t = SIM(T), tl = tlOf(T);
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
  WM.reset(); WL.reset(); WM.style(WH, 1); WL.style(WH, 1);
  // macro shots: things far behind the part in focus fade, as do lines brushing the lens
  const dof = win(T, 71.2, 80, 1.2);
  WL.fog = dof > .01 ? [3.2 / (dof * dof), 16 / (dof * dof)] : [1e12, 2e12];
  WL.near = dof > .01 ? [.25 * dof, .9 * dof] : null;

  /* the globe and the map */
  const fw = OA.globe(lg);
  const sqA = (E.mix(.3, .85, win(T, 12, 22, 1.2) + win(T, CT + 24, CT + 36, 1.5))) * E.ss(3.9, 4.6, lg);
  OA.mapLayers(lg, fw, sqA, 1 + .9 * win(T, CT + 14, CT + 34, 3));        // the climb leans on the contours a little more
  const lowA = 1 - E.ss(3.15, 3.75, lg), lift = 1 - E.ss(2.95, 3.6, lg);
  OA.coast({ al: .82, lift, bluff: lowA, fw });
  OA.swell({ al: lowA * (1 - E.ss(1500, 4000, e[2])), t, radius: 5200 });

  /* every track on the map: the four rounds in yellow to where each ended, the SM-6s in white */
  const trkL = T > CT - 2 ? E.ss(2.2, 3.0, lg) : 0, trkOut = 1 - E.ss(CT + 24, CT + 30, T), trkA = trkL * trkOut;
  if (trkA > .01) {
    WM.style(HI, 1.4);
    for (const r of RND) {
      const te = Math.min(tl, r.end) - r.L, n = Math.min(Math.floor(te / .25), 480);
      let prev = fposOf(r.F, 0);
      for (let i = 1; i <= n; i++) { const q = fposOf(r.F, Math.min(te, i * .25)); OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], .85 * trkA); prev = q; }
      const q = fposOf(r.F, te); OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], .85 * trkA);
    }
    WM.style(WH, 1);
    for (const I of SMS) {
      const s1 = Math.min(tl - I.tL, I.sEnd); if (s1 <= 0) continue;
      let prev = smAt(I, 0);
      for (let i = 1; i <= 24; i++) { const q = smAt(I, s1 * i / 24); OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], .5 * trkA); prev = q; }
    }
  }

  /* near the lens: sea, horizon, the site */
  const nearA = 1 - E.ss(3.3, 3.9, lg);
  if (nearA > 0) horizon(.45 * nearA);
  // on the climb the lens crosses the coast kilometres up: the open sea stays out beyond it, and hands over
  // to the map only once the coast is in frame
  const climbing = T > CT - 2;
  const offA = Math.max(E.ss(150, 900, e[2] - 50), climbing ? E.ss(2.9, 3.4, lg) : 0) * (1 - (climbing ? E.ss(4.25, 4.8, lg) : E.ss(3.9, 4.5, lg)));
  const ms = RND.map(r => misAt(r, T));
  RIDGES.length = 0;
  const machs = ms.map(m => (T > 62 && T < CT && alive(m.r, tl) ? machOf(m) : null));
  for (const mc of machs) if (mc && V.dist(mc.apex, e) < 3000) RIDGES.push(mc);
  if (offA > .01) openSea(offA, t, camV, RIDGES.length ? ridgeAll : null, T > 88 && T < CT + 16 ? E.ss(88, 92, T) : 0, T > 88);

  // survey crosses on the plateau
  if (lowA > .01) {
    WL.style(WH, 1);
    for (const [x, z] of CROSS) { const d = Math.hypot(x - e[0], z - e[2]); if (d > 900) continue; const a = .2 * lowA * lift; WL.seg([x - .45, GH * lift, z], [x + .45, GH * lift, z], a); WL.seg([x, GH * lift, z - .45], [x, GH * lift, z + .45], a); }
    for (const rr of [14, 26]) WL.ring([0, GH * lift + .02, 0], [1, 0, 0], [0, 0, 1], rr, 96, .1 * lowA);
  }

  /* vehicles */
  const vA = 1 - E.ss(2.9, 3.5, lg);
  if (vA > .01) {
    const ant = t * 1.152;                   // 11 rpm
    vehicle(M.radar, RADW, { ant, fan: t * 14, mast: 1 }, .72 * vA, e);
    vehicle(M.pz, PZW, { yaw: .5 * Math.sin(t * .21) + .3, pitch: .18 + .08 * Math.sin(t * .13), sAnt: t * 6.283 * .75, fan: t * 12 }, .72 * vA, e);
    for (let j = 0; j < 2; j++) {
      const cap = r => (tl >= r.L ? 1 : 0), rs = RND.filter(r => r.tel === j), st = { elev: telElev(T, j), dep: telDep(T, j), capL: 0, capR: 0, fan: t * 11 };
      for (const r of rs) st[r.cap] = cap(r);
      vehicle(M.tel, TELS[j], st, (j ? .8 : .92) * vA, e);
      for (const r of rs) { const u = tl - r.L; if (u >= 0 && u < 14 && r.CAP.part) GEO.draw(WL, { parts: [r.CAP.part] }, capX(r, u), {}, { a: .9 * vA, fine: V.dist(r.CAP.c0, e) < 80 }); }
    }
  }

  /* the rounds, the spent boosters, the covers, smoke, exhaust, the Mach cones */
  const farP = [];
  for (const m of ms) {
    const r = m.r;
    if (m.t < 0) { if (vA > .01) GEO.draw(WL, M.mis, misX(m), m.st, { a: .32 * vA, sil: .6, fine: false }); continue; }
    if (tl >= r.end) continue;
    const md = V.dist(m.p, e), Mx = misX(m), mpx = 8.9 * cam.fl / md;
    if (mpx > 6) GEO.draw(WL, M.mis, Mx, m.st, { a: E.ss(6, 30, mpx), fine: mpx > 500 });
    if (mpx < 30 && OA.clear(m.p)) farP.push(cam.project(m.p));
    if (md < 4000) plume(Mx, m, T);
    if (m.t >= 4.6 && m.t < 14) { const bx = boosterX(r, m.t); if (V.dist(bx.T, e) < 1500) GEO.draw(WL, M.bst, bx, {}, { a: .95, fine: V.dist(bx.T, e) < 40 }); }
    if (m.t >= 4.95 && m.t < 12) { const cp = partOf(M.mis, 'cover'); if (cp && V.dist(m.p, e) < 600) GEO.draw(WL, { parts: [cp] }, coverX(r, m.t), { cover: true }, { a: .9 }); }
    const mc = machs[r.i];
    if (mc && md < 1500) drawMach(mc, m, t, E.ss(1500, 600, md), r.i);
  }
  if (tl < 30) { drawSmoke(tl, e); boostEdges(tl, e); }
  if (T > 83 && T < CT + 10) { WL.style(WH, 1); roundTrails(tl, T); }

  /* the destroyer group, its radars, the SM-6s, the Phalanx, the blasts, the fire and the column */
  WL.style(WH, 1);
  drawShips(T, tl, e);
  const pulseA = E.ss(88, 92, T) * (1 - E.ss(TLH + 2, TLH + 6, tl));
  if (pulseA > .01) for (const S of SHIPS) drawPulses(S, tl, pulseA * (S === DD1 ? 1 : .7));
  if (T > 88 && T < DUR - 12) drawSMs(tl, e);
  if (tl > BURSTS[0][0] - .1 && tl < TLH + 2) {
    WL.style('#FFFFFF', 1.2);
    for (const r of TRACERS) {
      const a = tl - r.tk; if (a <= 0 || a > TLIFE) continue;
      WL.seg(tracerAt(r, Math.max(0, a - .022)), tracerAt(r, a), .9 * Math.pow(1 - a / TLIFE, 1.1) * E.ss(0, .02, a) * (1 - .85 * E.ss(TLH, TLH + .45, tl)));
    }
    WL.style(WH, 1);
  }
  for (const b of BL) drawBlast(b, tl, e);
  drawFire(tl, e);
  const ah = tl - TLH, colA = E.ss(0, .35, ah) * (1 - E.ss(CT + 20, CT + 28, T));
  if (ah > 0 && T < CT + 28) drawColumn(ah, colA, e);

  /* the satellite and its orbit */
  const ts = satT(T), SF = satFrame(ts), sd = V.dist(SF.p, e);
  const satX = X.make(R.look(SF.t, SF.r), SF.p);
  // it rises into frame from below as the lens settles behind it: fade in with it, never a part at the edge
  const satIn = T > DUR / 2 ? E.ss(DUR - 5, DUR - 3.6, T) : 1;
  if (sd < 3000 && satIn > .01) { const nr = WL.near; WL.near = [1.5, 5]; GEO.draw(WL, M.sat, satX, { solar: .35 }, { a: satIn, fine: sd < 200 }); WL.near = nr; }
  const orbA = .2 * E.ss(4.9, 5.7, lg);
  if (orbA > .004) {
    let prev = null, pc = false;
    for (let i = 0; i <= 200; i++) { const q = satFrame(ts + (i - 60) * 12).p, qc = OA.clear(q); if (prev) OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], (pc && qc ? 1 : .15) * orbA); prev = q; pc = qc; }
    let pg = null;
    for (let i = 0; i <= 120; i++) { const q = satFrame(ts + (i - 20) * 12), g = V.add(C, V.mul(q.r, RE)); if (pg && OA.kvOf(...g) > 0 && OA.kvOf(...pg) > 0 && i % 2) OA.segW(pg[0], pg[1], pg[2], g[0], g[1], g[2], .5 * orbA); pg = g; }
  }

  WM.flush(ctx);
  WL.flush(ctx);

  // calm the menu side
  const lgr = ctx.createLinearGradient(0, 0, 760, 0); lgr.addColorStop(0, 'rgba(0,0,0,.9)'); lgr.addColorStop(.62, 'rgba(0,0,0,.55)'); lgr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lgr; ctx.fillRect(0, 0, 760, 1080);
  const tgr = ctx.createLinearGradient(0, 0, 0, 230); tgr.addColorStop(0, 'rgba(0,0,0,.6)'); tgr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tgr; ctx.fillRect(1300, 0, 620, 230);

  /* bloom: ignitions, the SM-6 motors and their deck flashes, the muzzle, the kills, the hit, the fire */
  for (const m of ms) {
    if (m.t > .45 && m.t < 5 && alive(m.r, tl)) {
      const p = cam.project(X.ap(misX(m), [0, 0, BNZ - 1]));
      if (p) { const glow = Math.exp(-(m.t - .5) / .6); bloom(p, Math.min(380, 30 + 5200 / p[2]) * (1 + glow * 1.3), (.12 + .45 * glow) * E.ss(.45, .55, m.t) * (m.r.i ? .8 : 1)); }
    }
  }
  if (T > 88) for (const I of SMS) {
    const s = tl - I.tL;
    if (s > 0 && s < I.sEnd) { const p = cam.project(smAt(I, s)); if (p) bloom(p, Math.min(160, 14 + 9000 / p[2]), (s < 6 ? .38 : .18) * (.85 + .15 * M3.noise(tl * 30, I.seed))); }
    if (s > 0 && s < 1.1) { const p = cam.project(I.cellW); if (p) bloom(p, Math.min(220, 20 + 30000 / p[2]), .5 * (1 - s / 1.1)); }
  }
  if (ciwsFiring(tl)) { const p = cam.project(X.ap(shipX(DD1, tl), DA.ciws({ ciwsYaw: [0, ciwsAim(tl).yaw], ciwsPitch: [0, ciwsAim(tl).pitch] }, CI))); if (p) bloom(p, Math.min(90, 8 + 12000 / p[2]), .3 * (.6 + .4 * M3.noise(tl * 45, 2.2))); }
  for (const b of BL) {
    const a = tl - b.t0; if (a < -.02 || a > 6) continue;
    const p = cam.project(b.p); if (!p) continue;
    const big = b.kind === 'hit' ? 1 : b.kind === 'sec' ? .6 : b.kind === 'kill' ? .75 : .4, hit = b.kind === 'hit';
    const g = a > 0 ? Math.exp(-a / (.18 + .15 * big)) : 0;
    // the hit gets the one big flash of the film, and a slower afterglow off the fire
    const rad = hit ? Math.min(760, (40 + 9000 * b.R / 30 / p[2]) * (1 + g * 3)) : Math.min(420, (18 + 5000 * b.R / 30 / p[2]) * (1 + g * 3));
    bloom(p, rad, (.95 * g + (hit ? .22 * Math.exp(-a / 2) : .12 * Math.exp(-a / 1.2))) * big * E.ss(-.02, .01, a));
  }
  if (ah > .2 && ah < 40) {
    const p = cam.project(fireBase(tl)); if (p) bloom(p, Math.min(260, 12 + 2800 / p[2]), .16 * E.ss(.2, 1.4, ah) * (1 - E.ss(22, 40, ah)) * (.72 + .28 * M3.noise(T * 8, 4.2)));
  }

  // yellow: the battery on the map
  const bp = cam.project([0, 0, 0]), bs = E.mix(3, 2, E.ss(4, 5.5, lg)), bA = E.ss(2.95, 3.4, lg);
  if (bp && bA > .01 && OA.kvOf(0, 0, 0) > 0) { ctx.globalAlpha = bA; ctx.fillStyle = HI; ctx.fillRect(bp[0] - bs, bp[1] - bs, bs * 2, bs * 2); ctx.globalAlpha = 1; }
  // a round once it is only a point: a hairline cross
  if (T < CT + 30) for (const fp of farP) {
    if (!fp) continue;
    const s = 3.5; let ka = .9;
    for (const r of KEEP) ka = Math.min(ka, .9 * E.sat(sep(fp[0], fp[1], fp[0], fp[1], r) / 30));
    if (ka <= .01) continue;
    ctx.globalAlpha = ka; ctx.strokeStyle = WH; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(fp[0] - s, fp[1]); ctx.lineTo(fp[0] + s, fp[1]); ctx.moveTo(fp[0], fp[1] - s); ctx.lineTo(fp[0], fp[1] + s); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // each track ends in a ring: yellow where it hit, white where it was stopped
  const ringP = [], RPX = [7, 7, 7, 9];
  if (trkA > .01) for (const r of RND) {
    if (tl < r.end) { ringP.push(null); continue; }
    const q = r.i === 3 ? hitNow(Math.min(tl, TLH + 30)) : r.K, p = OA.clear(V.mad(q, OA.upAt(q), 5)) ? cam.project(q) : null;
    ringP.push(p);
    if (!p) continue;
    ctx.globalAlpha = .95 * trkA; ctx.strokeStyle = r.i === 3 ? HI : WH; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(p[0], p[1], RPX[r.i], 0, TAU); ctx.stroke();
    if (r.i < 3) { const k = RPX[r.i] * .5; ctx.beginPath(); ctx.moveTo(p[0] - k, p[1] - k); ctx.lineTo(p[0] + k, p[1] + k); ctx.moveTo(p[0] + k, p[1] - k); ctx.lineTo(p[0] - k, p[1] + k); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  /* labels */
  leaders.length = 0; dots.length = 0; placed.length = 0;
  const satP = sd < 3000 ? cam.project(SF.p) : null;
  const satA = (T < 30 ? 1 - E.ss(9.5, 10.5, T) : E.ss(DUR - 3.6, DUR - 2.6, T)) * E.ss(1.5, 2.5, T < 30 ? T + 10 : T - (DUR - 15));
  place(L.sat, satP, 90, -150, onScreen(satP, 30) ? satA : 0, true);
  const thP = cam.project(OA.mapP(OA.SQ[1], OA.SQ[3]));
  place(L.the, thP, 60, -56, onScreen(thP, 30) && OA.kvOf(...OA.mapP(OA.SQ[1], OA.SQ[3])) > 0 ? win(T, 13, 21) + win(T, CT + 26, CT + 36) : 0);
  place(L.bat, bp, 120, E.mix(90, 70, E.ss(3, 4, lg)), onScreen(bp, 30) && bA > .5 ? win(T, 21.5, 31.5) + win(T, CT + 20, CT + 27) * edgeK(bp) : 0, false);
  const radP = cam.project(X.ap(RADW, PTS.rad));
  place(L.rad, radP, 70, -80, onScreen(radP, 30) ? win(T, 37.5, 43) : 0, true);
  const pzP = cam.project(X.ap(PZW, PTS.pz));
  place(L.pz, pzP, 80, -90, onScreen(pzP, 30) ? win(T, 41.5, 46.5) : 0, true);
  const telP = cam.project(X.ap(TELS[0], [0, 3.4, -2])), tel2P = cam.project(X.ap(TELS[1], [0, 3.4, -2]));
  const telSt = j => { const u = tl - RND.find(r => r.tel === j).L, el = telElev(T, j); return u >= 0 ? 'ripple · firing' : el > 1.5 ? 'vertical · 88°' : el > .01 ? `erecting · ${Math.round(el / D2R)}°` : telDep(T, j) > .95 ? 'jacks down' : telDep(T, j) > .02 ? 'lowering jacks' : 'stowed · ready'; };
  setTxt(telS, telSt(0)); setTxt(tel2S, telSt(1));
  place(L.tel, telP, -90, -110, onScreen(telP, 30) ? win(T, 47, 59.5) : 0, true);
  place(L.tel2, tel2P, -80, -70, onScreen(tel2P, 30) ? win(T, 48.5, 58.5) : 0, true);
  const A0 = ms[0], mP = A0.t > .2 && alive(RND[0], tl) ? cam.project(A0.p) : null;
  setTxt(misS, A0.t < 5 ? `alt <b>${Math.max(0, A0.h).toFixed(0)} m</b> · <b>${A0.s.toFixed(0)} m/s</b>` : `M <b>${(A0.s / 340).toFixed(2)}</b> · <b>${Math.max(0, A0.h).toFixed(0)} m</b>`, true);
  place(L.mis, mP, 90, -80, onScreen(mP, 30) ? win(T, 60.3, 63.8) + win(T, 81.3, 84) : 0, true);
  // the four, once they fly together: one bracket around all of them
  let fb = null;
  if (T > 90 && T < 97) for (const m of ms) if (alive(m.r, tl) && V.dist(m.p, e) < 2500) fb = boxU(fb, screenBox(M.mis, misX(m), m.st));
  const fbA = fb && fb[2] - fb[0] > 30 && fb[0] > 0 && fb[2] < 1920 && fb[1] > 0 && fb[3] < 1080 ? win(T, 90.4, 93.6) : 0;
  const mD = ms[3];
  setTxt(fourS, `ripple · M <b>${(mD.s / 340).toFixed(2)}</b> · ${Math.max(0, mD.h).toFixed(0)} m · <b>${(V.dist(mD.p, fireBase(tl)) / 1000).toFixed(1)} km</b> to go`, true);
  place(L.four, fb ? [fb[2] + 6, fb[1] - 6] : null, 60, -60, fbA);
  const bP = RND[0].L + 4.6 < tl ? cam.project(boosterX(RND[0], tl).T) : null;
  place(L.bst, bP, 80, 90, onScreen(bP, 30) ? win(T, 66.6, 69.4) : 0, true);
  // macro part callouts, anchored on the part itself
  // windows end before each anchor whips off frame as the lens swings round
  const PARTS = [[71.9, 74.15, 'Annular intake · lip · radome', [0, .3, 4.02], 110, -90], [75.0, 76.7, 'Wing hinge · deployed', [.4, .05, .2], 110, -90], [79.4, 81.2, 'Ramjet nozzle · shock diamonds', [0, -.3, -4.45], 110, 90]];
  let pa = 0;
  for (const [a, b, txt, q, pdx, pdy] of PARTS) if (T > a && T < b) { setTxt(partT, txt); pa = win(T, a, b, .4); const p = cam.project(X.ap(misX(A0), q)); place(L.part, p, pdx, pdy, onScreen(p, 30) ? pa : 0, true); }
  if (!pa) L.part.style.opacity = 0;
  // the group on the horizon, the first SM-6 off the deck, the Phalanx
  const gP = cam.project(V.mad(shipX(DD1, tl).T, OA.upAt(DD1.c), 30));
  setTxt(grpS, `surface group · <b>${(V.dist(e, DD1.c) / 1000).toFixed(1)} km</b> · 17 kn`, true);
  place(L.grp, gP, 70, -70, onScreen(gP, 30) ? win(T, 93.8, 97.4) : 0, true);
  const s0 = tl - SMS[0].tL, smP = s0 > .3 && s0 < 5 ? cam.project(smAt(SMS[0], s0)) : null;
  place(L.sm, smP, 70, -70, onScreen(smP, 30) ? win(T, TSM0 + .4, TSM0 + 3.8) : 0, true);
  const ciP = cam.project(X.ap(shipX(DD1, tl), DA.ciws({}, CI)));
  place(L.ciws, ciP, 60, -90, onScreen(ciP, 30) ? win(T, TCI0 - .2, TCI1 + .6) : 0, true);
  setTxt(hitS, `<b>${outKm(HP).toFixed(1)} km</b> out · ${clock(TLH)}`, true);
  // the hit: labelled at the hole a moment after the flash, then on its ring as the lens climbs; the other
  // three rings get theirs as they come into view. All are gone before the globe
  const hP = tl > TLH ? cam.project(hitNow(Math.min(tl, TLH + 30))) : null;
  place(L.hit, hP, 150, 130, onScreen(hP, 30) ? win(T, THIT + 1.8, CT + 22, 1.2) * edgeK(hP) : 0, false, ringP[3] ? RPX[3] + 3 : 8);
  for (let i = 0; i < 3; i++) { const p = ringP[i]; place(L.rng[i], p, 64, i === 2 ? -52 : 52, onScreen(p, 30) ? win(T, CT + 6 + i, CT + 22, 1.2) * trkA * edgeK(p) * E.sat((1010 - p[1]) / 180) : 0, false, RPX[i] + 3); }

  ctx.strokeStyle = WH; ctx.fillStyle = WH; ctx.lineWidth = 1;
  for (const [ax, ay, ex2, ey2, hx, a] of leaders) { ctx.globalAlpha = .7 * a; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex2, ey2); ctx.lineTo(hx, ey2); ctx.stroke(); }
  for (const [ax, ay, a] of dots) { ctx.globalAlpha = a; ctx.fillRect(ax - 2, ay - 2, 4, 4); }
  ctx.globalAlpha = 1;
  if (satP && satA > .01) bracket(screenBox(M.sat, satX, { solar: .35 }), satA * .8, 8);
  if (fbA > .01) bracket(fb, fbA * .8, 6, HI);

  /* readout: altitude of the lens, the scale, and what the clock means right now */
  if (alt >= 10000) { setTxt(roV, grp(Math.round(alt / 1000 / (alt > 1e5 ? 10 : 1)) * (alt > 1e5 ? 10 : 1))); setTxt(roU, 'km'); }
  else if (alt >= 1000) { setTxt(roV, (alt / 1000).toFixed(1)); setTxt(roU, 'km'); }
  else { setTxt(roV, String(Math.round(alt))); setTxt(roU, 'm'); }
  setTxt(roL, 'Alt');
  const rate = SIM.rate(T), rs = Math.abs(rate - 1) > .02 ? `<b>×${rate.toFixed(2)}</b> · ` : '';
  const left = RND.filter(r => tl < r.end).length;
  let s2;
  if (T > 34 && T < 60) s2 = `${clock(T - TL)} · ripple · TEL 1 + TEL 2`;
  else if (T >= 60 && T < 79.5) s2 = `${clock(tl)} · 3M55 ×${RND.filter(r => tl >= r.L).length} · <b>${A0.s.toFixed(0)} m/s</b>`;
  else if (T >= 79.5 && T < CT + 3) s2 = tl >= TLH ? `3M55 · <b>hit</b> · DDG 1 · ${outKm(HP).toFixed(1)} km out` : `3M55 <b>×${left}</b> · M <b>${(mD.s / 340).toFixed(2)}</b> · ${outKm(mD.p).toFixed(1)} km out`;
  else { const mpp = Math.max(1, alt) / cam.fl, sc = nice(mpp / .000265); const [la, dl] = OA.llOf(OA.upAt(e)); s2 = `1 : ${grp(sc)} · ${(la / D2R).toFixed(2)}° N ${(OA.LON0 + dl / D2R).toFixed(2)}° E`; }
  setTxt(roS, rs + s2, true);
  ruler(lg);
  STAGE.dbg = { T: +T.toFixed(2), alt: +alt.toFixed(1), tl: +tl.toFixed(2) };
}

/* survey crosses: a 10 m grid on the plateau behind the bluff */
const CROSS = [];
{ const r = M3.rng(11); for (let x = -140; x <= 150; x += 10) for (let z = -150; z <= 60; z += 10) { const jx = x + (r() - .5) * 1.5, jz = z + (r() - .5) * 1.5; if (jz < OA.shoreZ(jx) - 14 && Math.hypot(jx, jz) > 9 && Math.hypot(jx + 30, jz + 9) > 9) CROSS.push([jx, jz]); } }

window.OAF = { WL, WM, camAt, misAt, RND, SIM, tlOf, Tof, SCHED, M, satFrame, satT, DIVE, CLIMB, AEND, AX, AZ, anchorAt, anchorTl, TLH, KILL, HP, SHIPS, shipX, SMS, smAt, BL, TRACERS, THIT, hitNow, fposR, flightR, smokeP, CT };
FILM.run({ duration: DUR, chapters: CHAPTERS, render, onChapter, cues: CUES });
})();
