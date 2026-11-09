/* Orbital A "Scale": powers of ten. One take from a satellite in a 900 km orbit down the map to the
   battery, along a 3M55 from its container out over the sea, and back up to the same satellite.
   render(T) is a pure function of film time: flights and smoke are integrated once at load. */
(() => {
'use strict';
const { V, R, X, E, Cam } = M3;
STAGE.fit(); STAGE.SFX.kind = 'orb';
const D2R = Math.PI / 180, TAU = Math.PI * 2, DUR = 165;
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

/* ---------- clock: real time, slowed twice (booster separation, the fighters' pass) ---------- */
const SIM = FILM.warp([
  { t: 0, rate: 1 }, { t: 63.9, rate: 1 }, { t: 64.5, rate: .2 }, { t: 70.3, rate: .2 }, { t: 71.5, rate: 1 },
  { t: 102.2, rate: 1 }, { t: 103.4, rate: .3 }, { t: 105.6, rate: .3 }, { t: 107, rate: 1 }, { t: DUR, rate: 1 },
]);
const SIM_D = SIM(DUR), TL = 60, SL = SIM(TL);
const tlOf = T => SIM(T) - SL;
function Tof(tl) { let a = 0, b = DUR; for (let i = 0; i < 48; i++) { const m = (a + b) / 2; if (tlOf(m) < tl) a = m; else b = m; } return (a + b) / 2; }

/* ---------- models (wire copies: the dots-only skin is dropped) ---------- */
const HW = m => (HD.wire ? HD.wire(m) : m);
const M = { tel: HW(HD.tel()), radar: HW(HD.radar()), pz: HW(HD.pantsir()), mis: HW(HD.oniks()), bst: HW(HD.oniksBooster()), ftr: HW(HD.fighter()), sat: HW(HD.satellite()) };
const tubeOf = (st, side) => HD.telTube(M.tel, st, side);
const NOSE = HD.oniks.TIP[2], NZ = HD.oniks.NOZZLE[2], BNZ = HD.oniks.BNOZZLE[2];
const partOf = (m, n) => m && m.parts.find(p => p.name === n);

/* ---------- the battery on the bluff (sea to the north) ---------- */
const TELW = X.make(R.y(Math.PI), [0, GH, 0]);                 // cab south, launcher hinge toward the sea
const TEL2W = X.make(R.y(Math.PI + .09), [-30, GH, -9]);
const RADW = X.make(R.y(Math.PI * .8), [58, GH, -70]);
const PZW = X.make(R.y(Math.PI * 1.1), [30, GH, -36]);
const E88 = 88 * D2R;
const telDep = T => E.ss(43.8, 46.6, T);
const telElev = T => E88 * E.inOut(E.sat((T - 47) / 9.5));
// the round leaves from the east tube (model left: the TEL faces south), so it flies screen-right past the lens
function tubeW(st) { const f = tubeOf(st, -1); return { base: X.ap(TELW, f.base), mouth: X.ap(TELW, f.mouth), dir: X.dir(TELW, f.dir) }; }
const TB = tubeW({ elev: E88 });
const P0 = V.mad(TB.mouth, TB.dir, -NOSE - .15);

/* ---------- the flight, integrated once ---------- */
const HDG = 8 * D2R, HF = [Math.sin(HDG), 0, Math.cos(HDG)], HR = [Math.cos(HDG), 0, -Math.sin(HDG)];
const FT = (() => {
  const dt = 1 / 240, N = Math.ceil(120 / dt) + 2;
  const P = new Float64Array(N * 3), A = new Float64Array(N * 3), S = new Float64Array(N), H = new Float64Array(N);
  let p = P0.slice(), v = V.mul(TB.dir, 20), spd = 20, gam = 0, lit = false;
  const gam0 = Math.atan2(TB.dir[1], V.dot(TB.dir, HF));
  for (let i = 0; i < N; i++) {
    const t = i * dt, h = OA.altOf(p), ax = t < .5 ? TB.dir : V.mul(v, 1 / spd);
    P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; A[3 * i] = ax[0]; A[3 * i + 1] = ax[1]; A[3 * i + 2] = ax[2]; S[i] = spd; H[i] = h;
    if (t < .5) { v[1] -= 9.81 * dt; spd = V.len(v); p = V.mad(p, v, dt); continue; }
    if (!lit) { lit = true; gam = gam0; }
    // booster 4.1 s, a short coast while it is pushed out, then the ramjet accelerates to ~Mach 2
    const acc = t < 4.6 ? 88 : t < 5.25 ? -6 : 42;
    spd = t < 4.6 ? spd + acc * dt : Math.min(700, spd + acc * dt);
    const up = OA.upAt(p);
    let gc;
    if (t < .62) gc = gam0;
    else if (t < 1.95) gc = E.mix(gam0, 15 * D2R, E.inOut((t - .62) / 1.33));
    else { const vz = E.clamp(-(h - 14) * 1.0, -70, 24); gc = Math.asin(E.clamp(vz / spd, -.7, .7)); }
    const rate = (t < 1.95 ? 120 : 22) * D2R;
    gam += E.clamp(gc - gam, -rate * dt, rate * dt);
    const hf = V.norm(V.sub(HF, V.mul(up, V.dot(HF, up))));
    v = V.mul(V.add(V.mul(hf, Math.cos(gam)), V.mul(up, Math.sin(gam))), spd);
    p = V.mad(p, v, dt);
  }
  return { dt, N, P, A, S, H };
})();
function flight(tl) {
  const x = E.clamp(tl, 0, (FT.N - 2) * FT.dt) / FT.dt, i = Math.floor(x), f = x - i, j = 3 * i;
  const P = FT.P, A = FT.A;
  return {
    p: [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f],
    a: V.norm([A[j] + (A[j + 3] - A[j]) * f, A[j + 1] + (A[j + 4] - A[j + 1]) * f, A[j + 2] + (A[j + 5] - A[j + 2]) * f]),
    s: FT.S[i] + (FT.S[i + 1] - FT.S[i]) * f, h: FT.H[i] + (FT.H[i + 1] - FT.H[i]) * f,
  };
}
const fpos = tl => { const x = E.clamp(tl, 0, (FT.N - 2) * FT.dt) / FT.dt, i = Math.floor(x), f = x - i, j = 3 * i, P = FT.P; return [P[j] + (P[j + 3] - P[j]) * f, P[j + 1] + (P[j + 4] - P[j + 1]) * f, P[j + 2] + (P[j + 5] - P[j + 2]) * f]; };
function misAt(T) {
  const tl = tlOf(T);
  if (tl < 0) { const tb = tubeW({ elev: telElev(T) }); return { tl, p: V.mad(tb.mouth, tb.dir, -NOSE - .15), a: tb.dir, s: 0, h: 0, st: { wing: 0, fin: 0, booster: true, cover: true } }; }
  const f = flight(tl);
  f.tl = tl; f.st = { wing: E.ss(4.8, 5.45, tl), fin: E.ss(4.66, 5.06, tl), booster: tl < 4.6, cover: tl < 4.95 };
  return f;
}
const misX = m => X.make(R.look(m.a, OA.upAt(m.p)), m.p);
const outKm = p => V.dist(p, P0) / 1000;

/* spent booster: slides out of the ramjet nozzle, then drag + gravity, tumbling */
const SEP = (() => {
  const f = flight(4.6), kd = .35, v0 = V.mad(V.mul(f.a, f.s), f.a, -18), vinf = [0, -9.81 / kd, 0];
  const c0 = V.mad(f.p, f.a, -3.35), up = OA.upAt(f.p), Rs = R.look(f.a, up), ax = V.norm(V.cross(f.a, up));
  return { kd, v0, vinf, c0, Rs, ax };
})();
function boosterX(tl) {
  const t = tl - 4.6, e = Math.exp(-SEP.kd * t);
  const p = V.add(V.add(SEP.c0, V.mul(SEP.vinf, t)), V.mul(V.sub(SEP.v0, SEP.vinf), (1 - e) / SEP.kd));
  const ang = 5.5 * Math.max(0, t - .12) * Math.max(0, t - .12) / (t + .3);
  return X.make(R.mul(rotAx(SEP.ax, ang), SEP.Rs), p);
}
/* intake cover: thrown off the nose at ramjet start */
const CVJ = (() => { const f = flight(4.95), up = OA.upAt(f.p); return { X0: misX({ p: f.p, a: f.a }), v0: V.add(V.mul(f.a, f.s), V.add(V.mul(up, 7), V.mul(V.cross(f.a, up), 3))), p0: V.mad(f.p, f.a, 4.1), ax: V.norm(V.cross(f.a, up)) }; })();
function coverX(tl) {
  const t = tl - 4.95, kd = .9, e = Math.exp(-kd * t), vinf = [0, -9.81 / kd, 0];
  const p = V.add(V.add(CVJ.p0, V.mul(vinf, t)), V.mul(V.sub(CVJ.v0, vinf), (1 - e) / kd));
  const Rm = rotAx(CVJ.ax, -9 * t);
  return X.mul(X.make(Rm, V.sub(p, R.ap(Rm, CVJ.p0))), CVJ.X0);
}
/* TLC front cap: blown off by the gas, tumbles onto the ground */
const CAP = (() => {
  const part = partOf(M.tel, 'capL'), Xa = part ? X.mul(TELW, part.xf({ elev: E88, capL: 0 })) : null;
  const c0 = TB.mouth.slice(), v0 = V.add(V.mul(TB.dir, 13), V.add(V.mul(HR, 3.2), [0, 0, 1.5])), kd = .25, vinf = [0, -9.81 / kd, 0];
  const at = t => { const e = Math.exp(-kd * t); return V.add(V.add(c0, V.mul(vinf, t)), V.mul(V.sub(v0, vinf), (1 - e) / kd)); };
  let tL = 8; for (let t = .05; t < 8; t += .005) if (at(t)[1] < GH + .35) { tL = t; break; }
  return { part, Xa, c0, at, tL, ax: V.norm([1, .3, .2]) };
})();
function capX(tl) {
  const t = Math.min(tl, CAP.tL), p = CAP.at(t), Rm = rotAx(CAP.ax, 7.5 * t);
  return X.mul(X.make(Rm, V.sub(p, R.ap(Rm, CAP.c0))), CAP.Xa);
}

/* ---------- smoke, spawned once with a seeded rng ---------- */
const SMOKE = (() => {
  const r = M3.rng(1337), out = [];
  const mouth = TB.mouth;
  for (let i = 0; i < 18; i++) { const a = r() * TAU, s = 3 + r() * 6; out.push({ t0: 0, p: V.mad(mouth, TB.dir, .4), v: [Math.cos(a) * s, 1.5 + r() * 3.5, Math.sin(a) * s], k: 1.4, life: 2.6 + r() * 1.6, r0: .6, gr: 2.4, a: .42 }); }
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; out.push({ t0: .55, p: [Math.cos(a) * 3, GH + .3, 6 + Math.sin(a) * 3], v: [Math.cos(a) * 7, .5, Math.sin(a) * 7], U: [1, 0, 0], Vv: [0, 0, 1], k: .3, life: 7, r0: 2, gr: 5, a: .38 }); }
  // boost trail: one tilted, squashed ring per ~1.1 m flown so the column reads as billowing smoke
  let acc = 0;
  for (let tl = .5; tl < 4.6; tl += 1 / 240) {
    const f = flight(tl); acc += f.s / 240;
    while (acc > 1.1) {
      acc -= 1.1;
      const ax = V.norm(V.add(f.a, [(r() - .5) * .5, (r() - .5) * .5, (r() - .5) * .5]));
      const [U, Vv] = GEO.perp(ax), sq = .7 + r() * .5, rot = r() * TAU;
      const U2 = V.add(V.mul(U, Math.cos(rot)), V.mul(Vv, Math.sin(rot))), V2 = V.mul(V.add(V.mul(Vv, Math.cos(rot)), V.mul(U, -Math.sin(rot))), sq);
      const at = V.add(V.mad(f.p, f.a, NZ - .3 - r() * 1.1), [(r() - .5) * .8, (r() - .5) * .8, (r() - .5) * .8]);
      out.push({ t0: tl, p: at, v: [1.2 + (r() - .5) * 1.6, .4 + (r() - .5) * 1.2, .8 + (r() - .5) * 1.6], U: U2, Vv: V2, k: .15, life: 13 + r() * 5, r0: .3 + r() * .3, gr: 1.1 + r() * 1.1, a: .38 });
      if (r() < .16) out.push({ t0: tl, p: at, v: [1.2 + (r() - .5) * 2, .5, .8 + (r() - .5) * 2], k: 1, life: 9 + r() * 4, r0: .5, gr: 2.4 + r() * 1.5, a: .22 });
    }
  }
  return out;
})();
const WIND = [1.1, .25, -.6];
function drawSmoke(tl, eye) {
  const fl = cam.fl;
  for (const p of SMOKE) {
    const age = tl - p.t0; if (age <= 0 || age >= p.life) continue;
    const e = (1 - Math.exp(-p.k * age)) / p.k;
    const c = [p.p[0] + p.v[0] * e + WIND[0] * age, p.p[1] + p.v[1] * e + WIND[1] * age, p.p[2] + p.v[2] * e + WIND[2] * age];
    const d2 = (c[0] - eye[0]) ** 2 + (c[1] - eye[1]) ** 2 + (c[2] - eye[2]) ** 2; if (d2 > 9e6) continue;
    const k = age / p.life, rr = p.r0 + p.gr * Math.sqrt(age), a = p.a * Math.pow(1 - k, 1.3) * E.ss(0, .08, age);
    const n = E.clamp(Math.round(rr * fl / Math.sqrt(d2) / 3), 6, 16);        // rings as coarse as they can be
    if (p.U) WL.ring(c, p.U, p.Vv, rr, n, a); else WL.disc(c, rr, n, a);
  }
}

/* ---------- the satellite: 900 km circular orbit, crossing the theatre northbound ---------- */
const RS = RE + 900e3, VS = Math.sqrt(3.986e14 / RS), OM = VS / RS;
const SAT0 = (() => { const p = OA.mapP(OA.SX - 35, OA.SZ - 760, 0), r = OA.upAt(p), n = tangentN(p), e = V.cross(r, n), h = 10 * D2R; return { r, t: V.norm(V.add(V.mul(n, Math.cos(h)), V.mul(e, Math.sin(h)))) }; })();
const satT = T => T < DUR / 2 ? SIM(T) : SIM(T) - SIM_D;          // continuous across the loop
function satFrame(ts) {
  const a = OM * ts, ca = Math.cos(a), sa = Math.sin(a);
  const r = V.add(V.mul(SAT0.r, ca), V.mul(SAT0.t, sa)), t = V.add(V.mul(SAT0.r, -sa), V.mul(SAT0.t, ca));
  return { p: V.add(C, V.mul(r, RS)), r, t, c: V.cross(t, r) };
}
/* the lens drifts back along the orbit; before the loop point it also sits higher (rk), so the bus passes
   well below it and rises into frame instead of brushing the glass */
const SATC = { c0: 0, r0: 4.2, rk: .15, a0: -20, va: -2.5, dn: 22 * D2R, yw: 0, fov: 42 * D2R, cx: 1210, cy: 560 };

/* ---------- heading frame at a point: right, up, forward ---------- */
function hframe(p) { const up = OA.upAt(p), f = V.norm(V.sub(HF, V.mul(up, V.dot(HF, up)))); return { r: V.cross(up, f), u: up, f }; }
const hpt = (H, a, o) => V.add(a, V.add(V.mul(H.r, o[0]), V.add(V.mul(H.u, o[1]), V.mul(H.f, o[2]))));

/* ---------- the lens lets the round go: the point it rides decelerates to a stop on the track ---------- */
const TR1 = tlOf(89), LR = 9;
const anchorTl = tl => { if (tl <= TR1) return tl; const u = Math.min(1, (tl - TR1) / LR); return TR1 + LR * (u - u * u * u + u * u * u * u / 2); };
const AEND = fpos(TR1 + LR / 2), HA = hframe(AEND);

/* ---------- fighters: a pair of F/A-18E, high, the other way ---------- */
const FV = 236, FTP = tlOf(104.4);
const FDIR = (() => { const a = 7 * D2R; return V.norm(V.add(V.mul(HA.f, -Math.cos(a)), V.mul(HA.r, Math.sin(a)))); })();
const FQ = hpt(HA, AEND, [72, 210, -40]);
const FTR = [FQ, V.add(FQ, V.add(V.mul(HA.r, 30), V.add(V.mul(HA.u, 8), V.mul(FDIR, -36))))];
const ftrP = (i, tl) => V.mad(FTR[i], FDIR, (tl - FTP) * FV);
function ftrX(i, tl) { const p = ftrP(i, tl); return X.make(R.look(FDIR, OA.upAt(p)), p); }
const ftrMid = tl => V.lerp(ftrP(0, tl), ftrP(1, tl), .5);

/* ---------- the target: a destroyer on the horizon, dead ahead. The round ends at its port side, aft of
   the stacks; the lens keeps riding the point the round would have reached, so the camera is untouched ---------- */
const THIT = 113, TLH = tlOf(THIT), HP = fpos(TLH);
// at ~20 px the fittings are sub-pixel clutter: hull, superstructure, mast, stacks, arrays make the silhouette
const M_DD = (m => ({ parts: m.parts.filter(p => ['hull', 'super', 'mast', 'stacks', 'spy', 'hangar', 'sps', 'gun'].includes(p.name)) }))(HW(HD.destroyer()));
const SHIP = (() => {
  const c0 = V.add(HP, V.add(V.mul(HF, 9), V.mul(HR, -32))), up = OA.upAt(c0), c = V.mad(c0, up, -OA.altOf(c0));
  const fw = orth(V.add(V.mul(HR, -Math.cos(15 * D2R)), V.mul(HF, Math.sin(15 * D2R))), up);
  return { c, up, X: X.make(R.look(fw, up), c) };
})();
/* smoke column: parcels leave the fire continuously; each rises on the fireball's heat, then as a steady
   plume, and picks up the wind as it climbs out of the fire, so the column leans more the higher it goes */
const SMK = (() => {
  // out here, 28 km offshore, the wind has backed a little from the one at the battery: nearly due east
  const up = OA.upAt(HP), wh = [1, 0, -.25], w = V.norm(V.sub(wh, V.mul(up, V.dot(wh, up))));
  return { B: V.mad(HP, up, 12 - OA.altOf(HP)), up, w, n: V.cross(up, w) };
})();
const smZ = s => 500 * (1 - Math.exp(-s / 5)) + 11 * s, smZd = s => 100 * Math.exp(-s / 5) + 11;
const smX = s => 28 * (s - 3 * (1 - Math.exp(-s / 3))), smXd = s => 28 * (1 - Math.exp(-s / 3));
const smR = s => 10 + .19 * smZ(s) + .14 * smX(s) + 4 * Math.sqrt(s);
function smokeP(a, s) {
  const te = a - s, z = smZ(s), x0 = smX(s), r = smR(s) * (1 + .12 * (1 - E.ss(0, 2, te)));
  const wob = r * .42, n1 = M3.noise(te * .42, s * .11, 7.7), n2 = M3.noise(te * .42, s * .11, 3.1), n3 = M3.noise(te * .42, s * .11, 5.3);
  const B = SMK.B, U = SMK.up, W = SMK.w, N = SMK.n, x = x0 + wob * n2, y = wob * n1, h = z + wob * .5 * n3;
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
   [t, sx, sz, log10 alt, lx, lz, look alt m, look-at-round weight, north-up weight, fov, cx, cy] */
function toE(t, s, L) {
  const d = V.sub(s.tg, s.e), f = V.norm(d);
  const si = OA.mapInv(s.e), lp = V.mad(s.e, f, L || V.len(d)), l = OA.mapInv(lp);
  return [t, si[0] - OA.SX, si[1] - OA.SZ, Math.log10(Math.max(1, OA.altOf(s.e))), l[0] - OA.SX, l[1] - OA.SZ, OA.altOf(lp), 0, 0, s.fov / D2R, s.cx, s.cy];
}
function camE(Kf, T) {
  const g = c => mono(Kf, T, c);
  const e = OA.mapP(OA.SX + g(1), OA.SZ + g(2), Math.pow(10, g(3)));
  let lp = OA.mapP(OA.SX + g(4), OA.SZ + g(5), g(6));
  const wr = g(7); if (wr > .001) lp = V.lerp(lp, fpos(Math.max(0, tlOf(T))), wr);
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
  { t: 48, eye: [36, 30, -25], target: [3, 27, 0], fov: 40 },
  { t: 52.5, eye: [20, 27.5, -15], target: [0, 28.5, 3], fov: 42 },
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
/* the lens rides with the round (offsets right, up, forward of the point it rides, metres) */
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
  { t: 75.3, eye: [1.65, 1.05, 1.6], target: [.55, 0, .15], fov: 46 },
  { t: 76.7, eye: [1.5, .95, .95], target: [.55, 0, -.05], fov: 46 },
  { t: 78.1, eye: [1.85, .72, -6.3], target: [0, 0, -5.7], fov: 46 },
  { t: 79.3, eye: [2.3, .9, -7.5], target: [0, 0, -6.3], fov: 46 },
  { t: 82.0, eye: [12, 9, -30], target: [0, -3, 20], fov: 40 },
  { t: 84.8, eye: [3, 11, -6], target: [0, -2, 12], fov: 42 },
  { t: 87.0, eye: [-26, 1, 20], target: [0, 0, 0], fov: 40 },
  { t: 88.8, eye: [-32, -6.5, 27], target: [0, 0, 0], fov: 40 },
  { t: 92.0, eye: [-30, -6, 27], target: [0, 0, 0], fov: 38 },
  { t: 95.5, eye: [-24, 14, 24], target: [0, 0, 0], fov: 32 },
  { t: 98.5, eye: [-17, 27, 2], target: [0, 14, 2000], fov: 32 },
  { t: 100.8, eye: [-14, 32, -6], target: [0, 40, 1500], fov: 18 },
  { t: 103.0, eye: [-13, 35.5, -10], target: [20, 120, 200], fov: 30 },
  { t: 104.6, eye: [-13, 37.5, -12], target: [40, 160, -20], fov: 52 },
  { t: 107.2, eye: [-15, 45, -30], target: [0, 20, 4000], fov: 36 },
  { t: 110, eye: [-18, 62, -80], target: [0, 20, 8000], fov: 38 },
  { t: 113.5, eye: [-22, 98, -160], target: [0, 15, 10000], fov: 38 },
  { t: 116, eye: [-26, 165, -250], target: [0, 10, 11000], fov: 36 },
  { t: 119, eye: [-30, 330, -380], target: [0, 0, 12000], fov: 34 },
]);
const RW = T => E.ss(85.4, 87.2, T);                                 // look point -> the round
const FW = T => E.ss(99.3, 101.3, T) * (1 - E.ss(104.6, 108.2, T)); // look direction -> the fighter pair
const HZ = T => sm5((T - 95.5) / 3);                                 // horizon framing: the round high in frame, sea below
function slerp(a, b, w) {
  const d = E.clamp(V.dot(a, b), -1, 1), th = Math.acos(d);
  if (th < 1e-4) return a;
  const s = Math.sin(th), ka = Math.sin((1 - w) * th) / s, kb = Math.sin(w * th) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}
function camRel(T) {
  const tl = tlOf(T), A = fpos(anchorTl(tl)), H = hframe(A), s = REL(T), e = hpt(H, A, s.eye);
  let tg = hpt(H, A, s.target);
  const wr = RW(T); if (wr > .001) tg = V.lerp(tg, fpos(tl), wr);
  // turn between directions at an even rate: the pair is 200 m overhead while the round is kilometres out
  const wf = FW(T); if (wf > .001) tg = V.add(e, V.mul(slerp(V.norm(V.sub(tg, e)), V.norm(V.sub(ftrMid(tl), e)), wf), 100));
  return shot(e, tg, H.u, s.fov, 1150, E.mix(E.mix(540, 400, HZ(T)), 540, wf));
}
function camLaunch(T) {
  if (T >= 64.5) return camRel(T);
  const tl = tlOf(T), s = CRANE(T);
  const w = E.ss(-.05, 1.3, tl), m = tl > 0 ? flight(tl) : null;
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
/* the climb pulls back toward the coast as it rises, looking out along the track, so each layer enters from
   the bottom of frame: sea rows, the coast and the battery, the map, the theatre square, the globe */
const SATK = (() => { const s = camSat(155), F = satFrame(satT(155)), e = V.mad(s.e, F.t, 60e3); return shot(e, V.mad(e, V.norm(V.sub(s.tg, s.e)), 1), s.u, s.fov, s.cx, s.cy); })();
const CLIMB = [
  toE(113.5, camRel(113.5)), toE(116, camRel(116)),
  [121, AX - .02, AZ - .5, 2.58, AX + .2, AZ + 9, 14, .85, 0, 36, 1150, 420],
  [124.5, AX - .1, AZ - 1.9, 3.2, AX + .9, AZ + 13, 0, .55, 0, 38, 1150, 440],
  [128, AX - .3, 7.5, 3.72, 2.8, 26, 0, .2, 0, 40, 1150, 470],
  [131, 1.2, -4, 4.1, 2.2, 17, 0, 0, .15, 42, 1150, 500],
  [134, .4, -18, 4.48, 1.2, 14.3, 0, 0, .3, 46, 1150, 540],
  [137.5, -.8, -34, 4.8, 0, 16, 0, 0, .6, 46, 1150, 560],
  [142, -3, -50, 5.25, -1, 110, 0, 0, 1, 40, 1150, 560],
  [147, -18, -280, 5.62, -8, 190, 0, 0, .5, 42, 1170, 560],
  // at rest 60 km up-track of where the satellite will be at 155: the blend into camSat closes monotonically
  toE(151.5, SATK, 2e6),
];
const camClimb = T => camE(CLIMB, T);

const SCHED = [['sat', -1, 13], ['dive', 8, 37], ['batt', 33, 60], ['launch', 57, 119], ['climb', 113.5, 156], ['sat', 148, 166]];
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
  // shake: ignition, booster separation, the fighters' pass
  const tl = tlOf(T);
  let amp = 0;
  if (tl > .5 && tl < 4) amp += 7 * Math.exp(-(tl - .5) / .5);
  if (tl > 4.6 && tl < 6) amp += 3 * Math.exp(-(tl - 4.6) / .25);
  amp += 2.2 * Math.exp(-(((T - 104.5) / 1.1) ** 2));
  cam.shake = amp > .05 ? FILM.shake(T, amp, 22) : [0, 0];
  cam.update();
}

/* ---------- open sea (o2): swell rows across the track every 40 m; every 4th, 16th... row survives as
   the lens climbs, each faded by its own projected spacing, so the sea thins out self-similarly ---------- */
const WAVES = [{ A: 1.3, L: 150, d: .25, ph: 0 }, { A: .75, L: 84, d: -.7, ph: 1.7 }, { A: .42, L: 46, d: 1.1, ph: 4.1 }, { A: .22, L: 29, d: -.3, ph: 2.2 }]
  .map(w => { const k = TAU / w.L; return { A: w.A, kx: k * Math.sin(w.d), kz: k * Math.cos(w.d), w: Math.sqrt(9.81 * k), ph: w.ph }; });
function swellH(c, a, t) { let h = 0; for (let i = 0; i < 4; i++) { const w = WAVES[i]; h += w.A * Math.sin(w.kx * c + w.kz * a - w.w * t + w.ph); } return h; }
// a smooth warp along the track at three scales, gentle enough (slope < .06) that rows never cross
const mea = (c, a) => 7 * Math.sin(c * .0061 + 1.4 * Math.sin(a * .0023)) + 26 * Math.sin(c * .00131 + a * .0006 + 2) + 95 * Math.sin(c * .00029 - a * .00017 + 4.1);
const SEA_L = [1, 4, 16, 64, 256, 1024];
// screen border samples, in order around the frame
const FP = [], FPN = 16, FPC = new Float64Array(FPN * 2);
for (let i = 0; i < 4; i++) FP.push([i * 480, 0]); for (let i = 0; i < 4; i++) FP.push([1920, i * 270]);
for (let i = 0; i < 4; i++) FP.push([1920 - i * 480, 1080]); for (let i = 0; i < 4; i++) FP.push([0, 1080 - i * 270]);
function openSea(al, t, vcam, mach, fine, band) {
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
  const ridge = mach ? mach.ridge : null;
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
function plume(Mx, m, tl, T) {
  const ax = m.a, [U, Vv] = GEO.perp(ax), fk = Math.floor(SIM(T) * 60);
  if (tl > .5 && tl < 4.6) {
    const glow = Math.exp(-(tl - .5) / .6), nz = X.ap(Mx, [0, 0, BNZ]);
    const L = 5 + 2.6 * hash(fk, 3) + 5 * glow, tip = V.mad(nz, ax, -L);
    WL.style('#FFFFFF', 1.4);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; WL.seg(V.add(nz, V.add(V.mul(U, Math.cos(a) * .2), V.mul(Vv, Math.sin(a) * .2))), V.add(tip, V.mul(V.add(V.mul(U, Math.cos(a)), V.mul(Vv, Math.sin(a))), .18 * hash(fk, i))), .85); }
    WL.seg(nz, V.mad(nz, ax, -L * 1.3), 1);
    for (let k = 0; k < 3; k++) WL.ring(V.mad(nz, ax, -(.9 + k * 1.3)), U, Vv, .19 - k * .03, 14, .55 - k * .13);
    WL.style(WH, 1);
  } else if (tl >= 5.25) {
    // ramjet: faint cone and a train of standing shock cells (Mach diamonds)
    const lt = E.ss(5.25, 5.6, tl), nz = X.ap(Mx, [0, 0, NZ]), r = .27, L = (6.5 + 1.4 * hash(fk, 5)) * lt, cell = .95, nC = 6;
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
function drawMach(mc, m, t, al) {
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
  const s0 = hm / TMU, fk = Math.floor(t * 30);
  const gp = (c, a) => [H.r[0] * c + H.f[0] * a, 0, H.r[2] * c + H.f[2] * a];
  for (const side of [-1, 1]) {
    let prev = null, pa = 0;
    for (let s = s0; s < s0 + 900;) {
      const r = s * TMU, w = Math.sqrt(Math.max(0, r * r - hm * hm)), cc = mc.ac + side * w, aa = mc.aa - s, q = gp(cc, aa);
      q[1] = OA.seaY(q[0], q[2]) + swellH(cc, aa, t) + .75;
      const a = .8 * Math.exp(-(s - s0) / 380) * al;
      if (prev) WL.seg(prev, q, (a + pa) * .5);
      prev = q; pa = a;
      s += Math.min(14, 1.2 + (s - s0) * .05);
    }
    let n = 0;
    for (let s = s0 + .5; s < s0 + 240; s += 2.2, n++) {
      const h1 = hash(fk * 131 + n, side + 5); if (h1 > .35 + .6 * Math.exp(-(s - s0) / 60)) continue;
      const r = s * TMU, w = Math.sqrt(Math.max(0, r * r - hm * hm)), kf = Math.exp(-(s - s0) / 70);
      const cc = mc.ac + side * (w + hash(fk, n) * 1.5), aa = mc.aa - s - hash(n, fk) * 2, b = gp(cc, aa);
      b[1] = OA.seaY(b[0], b[2]) + swellH(cc, aa, t) + .6;
      const hg = (.15 + hash(n + 3, fk) * .7) * (.5 + kf * 1.4), out = side * (.1 + hash(fk + 9, n) * .5), bk = 2 + hash(n, fk + 2) * 6;
      const tip = V.add(b, V.add(V.mul(H.r, out), V.add(V.mul(H.u, hg), V.mul(H.f, -bk))));
      WL.seg(b, tip, (.18 + .4 * kf) * (.4 + .6 * hash(fk + 1, n)) * al);
    }
  }
}

/* ---------- trails: each point stays where it was laid, then sinks, drifts and spreads with age ---------- */
const TWIND = [.9, 0, -.5];
function trailLines(at, t0, t1, n, side, w0, wk, sink, life, al, now) {
  // at(tau) -> [point, lateral unit]; rails at +-w(age) either side, plus a centre line when side is 0.
  // The trail is laid over [t0, t1] and aged to `now` (a trail that stopped being laid keeps ageing)
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
const misTrailAt = tau => { const f = flight(tau); return [V.mad(f.p, f.a, NZ), HR]; };
const FRT = V.norm(V.cross([0, 1, 0], FDIR));
const ftrTrailAt = i => tau => [V.mad(ftrP(i, tau), FDIR, -7.5), FRT];
function trails(tl, T, trkA) {
  const on = E.ss(95.5, 98.5, T);
  const ma = on * (1 - trkA) * (1 - E.ss(119, 123, T));
  if (ma > .01 && tl > 6) {
    const te = Math.min(tl, TLH), t0 = Math.max(4.8, te - 34);
    trailLines(misTrailAt, t0, te, 60, 0, 0, 0, .1, 12, .7 * ma, tl);
    trailLines(misTrailAt, t0, te, 60, 1, .3, .8, .12, 10, .34 * ma, tl);
  }
  const fa = on * (1 - E.ss(115, 118.5, T)), ftl = tl - FTP;
  if (fa > .01 && ftl > -40) for (let i = 0; i < 2; i++) trailLines(ftrTrailAt(i), FTP - 40, tl, 48, 1, .55, 1.1, .3, 24, .42 * fa);
}

/* ---------- the destroyer and the column over it ---------- */
function drawShip(T, e) {
  if (T < 95 || T > 141) return;
  const px = 155 * cam.fl / Math.max(1, V.dist(SHIP.c, e));
  if (px < 4) return;
  // ~20 px on the horizon: faint, so it reads as a silhouette and not a smudge
  GEO.draw(WL, M_DD, SHIP.X, {}, { a: E.ss(95, 97.5, T) * E.mix(.24, .9, E.ss(40, 260, px)), fine: false });
}
function drawColumn(a, al, e) {
  if (a <= 0 || al <= .004) return;
  const fl = cam.fl, U = SMK.up, W = SMK.w, DTE = .125;
  // tilted rings, one per parcel, carried up the column (the billows climb), in the language of the launch
  // smoke. Parcels bunch up as they slow and spread, so a parcel is kept only while its spacing along the
  // column is a fair fraction of its radius: parcel k survives up to a stride of its largest power-of-two factor
  for (let k = 0; k * DTE < a; k++) {
    const s = a - k * DTE, zd = smZd(s), xd = smXd(s);
    const need = .36 * smR(s) / (Math.hypot(zd, xd) * DTE), c = k ? (k & -k) : 4096, fk = E.ss(.5, 1, c / need);
    if (fk <= .01) continue;
    const q = smokeP(a, s);
    const rj = q.r * (.8 + .4 * hash(k, 11)), d = V.dist(q.p, e), rpx = rj * fl / d;
    const ra = al * .3 * fk * Math.pow(1 - E.sat(s / 52), 1.2) * E.ss(0, .4, s) * E.ss(1.2, 5, rpx);
    if (ra <= .004) continue;
    const tg = V.norm([U[0] * zd + W[0] * xd, U[1] * zd + W[1] * xd, U[2] * zd + W[2] * xd]);
    const cp = V.add(V.mad(q.p, tg, (hash(k, 8) - .5) * rj * .6), [(hash(k, 1) - .5) * rj * .4, (hash(k, 2) - .5) * rj * .3, (hash(k, 4) - .5) * rj * .4]);
    const n = E.clamp(Math.round(rpx / 1.3), 10, 28);
    if (hash(k, 13) < .3) { WL.disc(cp, rj * .8, n, ra * .8); continue; }
    // ring planes lean toward the lens, so billows read round rather than as edge-on slashes
    const tc = V.norm(V.sub(e, cp)), ax = V.norm(V.add(V.add(V.mul(tg, .5), V.mul(tc, .6)), [(hash(k, 3) - .5) * .7, (hash(k, 6) - .5) * .4, (hash(k, 9) - .5) * .7]));
    const [U0, V0] = GEO.perp(ax), rot = hash(k, 5) * TAU, sq = .7 + .45 * hash(k, 7);
    const U2 = V.add(V.mul(U0, Math.cos(rot)), V.mul(V0, Math.sin(rot))), V2 = V.mul(V.add(V.mul(V0, Math.cos(rot)), V.mul(U0, -Math.sin(rot))), sq);
    WL.ring(cp, U2, V2, rj, n, ra);
  }
}

/* ---------- labels ---------- */
const ui = document.getElementById('ui');
function callout(html) { const d = document.createElement('div'); d.className = 'call'; d.innerHTML = html; ui.appendChild(d); return d; }
const L = {
  sat: callout(ORB.cat('Lotos-S1', { code: '14F145' }) + '<span class="s2">ELINT · 900 km orbit · <b>7.4 km/s</b></span>'),
  the: callout(ORB.cat('Theatre 1337 · 600 × 600 km', { code: 'TH1337' }) + '<span class="s2">45.2° N · 36.6° E</span>'),
  bat: callout(ORB.cat('Bastion-P · Krasnaya Kosa', { code: 'K300P', sq: 'y' }) + '<span class="s2">coastal battery · <b>24 m</b> bluff</span>'),
  rad: callout(ORB.cat('Monolith-B', { code: 'MB-1' }) + '<span class="s2">surface search · <b>11 rpm</b></span>'),
  pz: callout(ORB.cat('Pantsir-S1', { code: '96K6' }) + '<span class="s2">point defence · search radar</span>'),
  tel: callout(ORB.cat('Bastion-P · TEL 1', { code: 'K340P' }) + '<span class="s2"></span>'),
  mis: callout(ORB.cat('3M55 · P-800', { code: '3M55' }) + '<span class="s2"></span>'),
  bst: callout(ORB.cat('Booster casing · spent', { code: 'BST' }) + '<span class="s2">out through the ramjet nozzle</span>'),
  part: callout('<span class="cat"><i class="sq o"></i><span class="t"></span></span>'),
  ftr: callout(ORB.cat('F/A-18E ×2', { code: 'FA18E' }) + '<span class="s2"></span>'),
  hit: callout(ORB.cat('Hit · DDG', { code: 'DDG', sq: 'y' }) + '<span class="s2"></span>'),
};
const telS = L.tel.querySelector('.s2'), misS = L.mis.querySelector('.s2'), partT = L.part.querySelector('.t'), hitS = L.hit.querySelector('.s2'), ftrS = L.ftr.querySelector('.s2');
const txtCache = new Map();
const setTxt = (el, s, html) => { if (txtCache.get(el) !== s) { txtCache.set(el, s); if (html) el.innerHTML = s; else el.textContent = s; } };
const KEEP = [[60, 40, 470, 132], [60, 300, 560, 740], [60, 990, 560, 1045], [1380, 36, 1900, 196], [1300, 994, 1900, 1045], [800, 1000, 1120, 1045]];
const leaders = [], dots = [];
const widths = new Map();
function place(el, anchor, dx, dy, a, dot) {
  if (!anchor || a <= .01) { el.style.opacity = 0; return; }
  let w = widths.get(el); if (!w || w.s !== el.textContent) { w = { s: el.textContent, w: el.offsetWidth }; widths.set(el, w); }
  const h = 34, [ax, ay] = anchor;
  const box = sx => { const d = dx * sx, ex2 = ax + d, hx = ex2 + (d >= 0 ? 18 : -18), x0 = d >= 0 ? hx + 8 : hx - 8 - w.w, y0 = ay + dy - 6; return { ex2, hx, x0, y0, bad: x0 < 20 || x0 + w.w > 1900 || y0 < 20 || y0 + h > 1060 || KEEP.some(r => x0 < r[2] && x0 + w.w > r[0] && y0 < r[3] && y0 + h > r[1]) }; };
  let b = box(1); if (b.bad) { const b2 = box(-1); if (!b2.bad) b = b2; }
  if (b.bad || KEEP.some(r => ax > r[0] && ax < r[2] && ay > r[1] && ay < r[3])) { el.style.opacity = 0; return; }
  leaders.push([ax, ay, b.ex2, ay + dy, b.hx, a]); if (dot) dots.push([ax, ay, a]);
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
function bracket(b, a, pad, col) {
  if (!b || a <= .01) return;
  const [x0, y0, x1, y1] = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], c = Math.max(6, Math.min(16, (x1 - x0) * .18, (y1 - y0) * .18));
  ctx.strokeStyle = col || WH; ctx.lineWidth = 1.2; ctx.globalAlpha = a;
  ctx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); }
  ctx.stroke(); ctx.globalAlpha = 1;
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
  { t: 33, title: 'Battery', fig: 'Krasnaya Kosa — Bastion-P on the bluff' },
  { t: 57, title: 'Launch', fig: 'Cold launch — 3M55 Oniks' },
  { t: 79.5, title: 'Over the sea', fig: 'Sea-skim · 14 m · Mach 2' },
  { t: 97, title: 'Horizon', fig: 'The round goes on alone' },
  { t: 117, title: 'Climb', fig: 'Powers of ten — back to orbit' },
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
  [47, () => { SFX.tone(160, 240, 9.4, 'sawtooth', .012); SFX.noise(9.4, 300, 1.2, .025, .6); }],
  [56.6, () => SFX.noise(.35, 220, 1, .1, .005)],
  [TL, () => SFX.noise(.7, 700, .8, .15, .005)],
  [TL + .5, () => SFX.rumble(5.5, .24)],
  [Tof(4.6), () => { SFX.crack(); SFX.noise(3, 180, 1, .12, .02); }],
  [Tof(5.25), () => SFX.noise(6, 2400, .6, .06, .3)],
  [79.5, () => SFX.noise(8, 1800, .5, .05, .5)],
  [101.5, () => { SFX.noise(7, 420, .9, .16, 2.6); SFX.tone(95, 70, 6, 'sawtooth', .01); }],
  [104.3, () => SFX.noise(3.5, 900, .7, .1, .05)],
  [THIT, () => SFX.noise(3, 150, 1, .07, .04)],
  [117, () => SFX.tone(220, 440, 30, 'sine', .018)],
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
  const sqA = (E.mix(.3, .85, win(T, 12, 22, 1.2) + win(T, 138, 150, 1.5))) * E.ss(3.9, 4.6, lg);
  OA.mapLayers(lg, fw, sqA, 1 + .9 * win(T, 128, 148, 3));        // the climb leans on the contours a little more
  const lowA = 1 - E.ss(3.15, 3.75, lg), lift = 1 - E.ss(2.95, 3.6, lg);
  OA.coast({ al: .82, lift, bluff: lowA, fw });
  OA.swell({ al: lowA * (1 - E.ss(1500, 4000, e[2])), t, radius: 5200 });

  /* the round's track: one yellow line on the map, from the bluff to the point it has reached */
  const trkL = T > 112 ? E.ss(2.2, 3.0, lg) : 0, trkOut = 1 - E.ss(149, 155, T), trkA = trkL * trkOut;
  const gone = tl >= TLH, tk = Math.min(tl, TLH);
  if (trkA > .01 && tl > 0) {
    WM.style(HI, 1.4);
    const n = Math.min(Math.floor(tk / .25), 480);
    let prev = fpos(0);
    for (let i = 1; i <= n; i++) { const q = fpos(Math.min(tk, i * .25)); OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], .9 * trkA); prev = q; }
    const q = fpos(tk); OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], .9 * trkA);
    WM.style(WH, 1);
  }

  /* near the lens: sea, horizon, the site */
  const nearA = 1 - E.ss(3.3, 3.9, lg);
  if (nearA > 0) horizon(.45 * nearA);
  // on the climb the lens crosses the coast kilometres up: the open sea stays out beyond it, and hands over
  // to the map only once the coast is in frame
  const climbing = T > 110;
  const offA = Math.max(E.ss(150, 900, e[2] - 50), climbing ? E.ss(2.9, 3.4, lg) : 0) * (1 - (climbing ? E.ss(4.25, 4.8, lg) : E.ss(3.9, 4.5, lg)));
  const m = misAt(T);
  const mach = T > 62 && T < 118 && !gone ? machOf(m) : null;
  if (offA > .01) openSea(offA, t, camV, mach, T > 95 && T < 140 ? E.ss(96, 99, T) : 0, T > 95);

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
    vehicle(M.tel, TEL2W, { elev: 0, dep: 0, fan: t * 11 }, .55 * vA, e);
    vehicle(M.tel, TELW, { elev: telElev(T), dep: telDep(T), capL: tl >= 0 ? 1 : 0, capR: 0, fan: t * 11 }, .92 * vA, e);
    if (tl >= 0 && tl < 14 && CAP.part) GEO.draw(WL, { parts: [CAP.part] }, capX(tl), {}, { a: .9 * vA, fine: V.dist(CAP.c0, e) < 80 });
  }

  /* the round, the spent booster, the cover, smoke, exhaust, the Mach cone */
  const md = V.dist(m.p, e);
  let farP = null;
  if (tl < 0) { if (vA > .01) GEO.draw(WL, M.mis, misX(m), m.st, { a: .32 * vA, sil: .6, fine: false }); }
  else if (!gone) {
    const Mx = misX(m), mpx = 8.9 * cam.fl / md;
    if (mpx > 6) GEO.draw(WL, M.mis, Mx, m.st, { a: E.ss(6, 30, mpx), fine: mpx > 500 });
    if (mpx < 30 && OA.clear(m.p)) farP = cam.project(m.p);
    if (md < 4000) plume(Mx, m, tl, T);
    if (tl >= 4.6 && tl < 14) GEO.draw(WL, M.bst, boosterX(tl), {}, { a: .95, fine: V.dist(boosterX(tl).T, e) < 40 });
    if (tl >= 4.95 && tl < 12) { const cp = partOf(M.mis, 'cover'); if (cp) GEO.draw(WL, { parts: [cp] }, coverX(tl), { cover: true }, { a: .9 }); }
    if (tl < 26) drawSmoke(tl, e);
    if (mach && md < 1500) drawMach(mach, m, t, E.ss(1500, 600, md));
  }

  /* fighters */
  const ftl = tl - FTP;
  if (ftl > -40 && ftl < 20) for (let i = 0; i < 2; i++) {
    const Fx = ftrX(i, tl), d = V.dist(Fx.T, e), px = 18.3 * cam.fl / d;
    if (px > 2) GEO.draw(WL, M.ftr, Fx, { fan: t * 9 + i * .7, nozzle: .35 }, { a: .95 * E.ss(2, 14, px), fine: px > 260 });
  }
  if (T > 95 && T < 124) { WL.style(WH, 1); trails(tl, T, trkL); }

  /* the destroyer, and the column over it after the hit */
  WL.style(WH, 1);
  drawShip(T, e);
  const ah = tl - TLH, colA = E.ss(0, .35, ah) * (1 - E.ss(132, 138.5, T));
  if (ah > 0 && T < 139) drawColumn(ah, colA, e);

  /* the satellite and its orbit */
  const ts = satT(T), SF = satFrame(ts), sd = V.dist(SF.p, e);
  const satX = X.make(R.look(SF.t, SF.r), SF.p);
  // it rises into frame from below as the lens settles behind it: fade in with it, never a part at the edge
  const satIn = T > 150 ? E.ss(160, 161.4, T) : 1;
  if (sd < 3000 && satIn > .01) { const nr = WL.near; WL.near = [1.5, 5]; GEO.draw(WL, M.sat, satX, { solar: .35 }, { a: satIn, fine: sd < 200 }); WL.near = nr; }
  const orbA = .2 * E.ss(4.9, 5.7, lg);
  if (orbA > .004) {
    let prev = null, pc = false;
    for (let i = 0; i <= 200; i++) { const q = satFrame(ts + (i - 60) * 12).p, qc = OA.clear(q); if (prev) OA.segW(prev[0], prev[1], prev[2], q[0], q[1], q[2], (pc && qc ? 1 : .15) * orbA); prev = q; pc = qc; }
    // ground track
    let pg = null;
    for (let i = 0; i <= 120; i++) { const q = satFrame(ts + (i - 20) * 12), g = V.add(C, V.mul(q.r, RE)); if (pg && OA.kvOf(...g) > 0 && OA.kvOf(...pg) > 0 && i % 2) OA.segW(pg[0], pg[1], pg[2], g[0], g[1], g[2], .5 * orbA); pg = g; }
  }

  WM.flush(ctx);
  WL.flush(ctx);

  // calm the menu side
  const lgr = ctx.createLinearGradient(0, 0, 760, 0); lgr.addColorStop(0, 'rgba(0,0,0,.9)'); lgr.addColorStop(.62, 'rgba(0,0,0,.55)'); lgr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lgr; ctx.fillRect(0, 0, 760, 1080);
  const tg = ctx.createLinearGradient(0, 0, 0, 230); tg.addColorStop(0, 'rgba(0,0,0,.6)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg; ctx.fillRect(1300, 0, 620, 230);

  // ignition bloom (restrained)
  if (tl > .45 && tl < 5) {
    const p = cam.project(X.ap(misX(m), [0, 0, BNZ - 1]));
    if (p) {
      const glow = Math.exp(-(tl - .5) / .6), rad = Math.min(380, 30 + 5200 / p[2]) * (1 + glow * 1.3), a = (.12 + .45 * glow) * E.ss(.45, .55, tl);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.25, `rgba(255,250,235,${a * .33})`); g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g; ctx.fillRect(p[0] - rad, p[1] - rad, rad * 2, rad * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // the hit: one restrained flash, then a low fire at the foot of the column
  if (ah > -.05 && ah < 24) {
    const p = cam.project(SMK.B);
    if (p) {
      const glow = ah > 0 ? Math.exp(-ah / .3) : 0, fire = .1 * E.ss(.3, 1.5, ah) * (1 - E.ss(10, 24, ah)) * (.75 + .25 * M3.noise(T * 9, 4.2));
      const a = (.62 * glow + fire) * E.ss(-.05, .02, ah), rad = Math.min(300, 14 + 2600 / p[2]) * (1 + glow * 3.2);
      if (a > .004) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.22, `rgba(255,250,235,${a * .3})`); g.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.fillStyle = g; ctx.fillRect(p[0] - rad, p[1] - rad, rad * 2, rad * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // yellow: the battery on the map
  const bp = cam.project([0, 0, 0]), bs = E.mix(3, 2, E.ss(4, 5.5, lg)), bA = E.ss(2.95, 3.4, lg);
  if (bp && bA > .01 && OA.kvOf(0, 0, 0) > 0) { ctx.globalAlpha = bA; ctx.fillStyle = HI; ctx.fillRect(bp[0] - bs, bp[1] - bs, bs * 2, bs * 2); ctx.globalAlpha = 1; }
  // the round once it is only a point: a hairline cross, yellow once it is on the map
  if (farP && tl > 6 && T < 155) {
    const s = 3.5;
    ctx.globalAlpha = .9 * trkOut; ctx.strokeStyle = trkL > .5 ? HI : WH; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(farP[0] - s, farP[1]); ctx.lineTo(farP[0] + s, farP[1]); ctx.moveTo(farP[0], farP[1] - s); ctx.lineTo(farP[0], farP[1] + s); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // the track ends in a ring at the ship
  const hP = gone && trkA > .01 ? cam.project(SHIP.c) : null, HR_PX = 9;
  if (hP) { ctx.globalAlpha = .95 * trkA; ctx.strokeStyle = HI; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(hP[0], hP[1], HR_PX, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }

  /* labels */
  leaders.length = 0; dots.length = 0;
  const satP = sd < 3000 ? cam.project(SF.p) : null;
  const satA = (T < 30 ? 1 - E.ss(9.5, 10.5, T) : E.ss(161.4, 162.4, T)) * E.ss(1.5, 2.5, T < 30 ? T + 10 : T - 150);
  place(L.sat, satP, 90, -150, onScreen(satP, 40) ? satA : 0, true);
  const thP = cam.project(OA.mapP(OA.SQ[1], OA.SQ[3]));
  place(L.the, thP, 60, -56, onScreen(thP, 40) && OA.kvOf(...OA.mapP(OA.SQ[1], OA.SQ[3])) > 0 ? win(T, 13, 21) + win(T, 140, 150) : 0);
  place(L.bat, bp, 120, E.mix(90, 70, E.ss(3, 4, lg)), onScreen(bp, 40) && bA > .5 ? win(T, 21.5, 31.5) + win(T, 134.2, 141.2) * edgeK(bp) : 0, false);
  const radP = cam.project(X.ap(RADW, PTS.rad));
  place(L.rad, radP, 70, -80, onScreen(radP, 50) ? win(T, 37.5, 44) : 0, true);
  const pzP = cam.project(X.ap(PZW, PTS.pz));
  place(L.pz, pzP, 80, -90, onScreen(pzP, 50) ? win(T, 42.5, 48.5) : 0, true);
  const telP = cam.project(X.ap(TELW, [0, 3.4, -2]));
  const el = telElev(T);
  setTxt(telS, tl >= 0 ? 'launched' : el > 1.5 ? 'vertical · 88°' : el > .01 ? `erecting · ${Math.round(el / D2R)}°` : telDep(T) > .95 ? 'jacks down' : telDep(T) > .02 ? 'lowering jacks' : 'stowed · ready');
  place(L.tel, telP, -90, 110, onScreen(telP, 50) ? win(T, 47, 59.5) : 0, true);
  const mP = tl > .2 ? cam.project(m.p) : null;
  const far = T > 96;
  setTxt(misS, far ? `<b>${outKm(gone ? HP : m.p).toFixed(1)} km</b> out · M ${(m.s / 340).toFixed(2)} · ${Math.max(0, m.h).toFixed(0)} m` : tl < 5 ? `alt <b>${Math.max(0, m.h).toFixed(0)} m</b> · <b>${m.s.toFixed(0)} m/s</b>` : `M <b>${(m.s / 340).toFixed(2)}</b> · <b>${Math.max(0, m.h).toFixed(0)} m</b>`, true);
  place(L.mis, mP, far ? 70 : 90, far ? -70 : -80, onScreen(mP, 40) ? (win(T, 60.3, 63.8) + win(T, 80.5, 91.5) + win(T, 96.6, 99.7) + win(T, 106.4, 120.6)) * (1 - E.ss(THIT, THIT + .35, T)) : 0, true);
  const bP = tl > 4.6 ? cam.project(boosterX(tl).T) : null;
  place(L.bst, bP, 80, 90, onScreen(bP, 40) ? win(T, 66.6, 69.4) : 0, true);
  // macro part callouts, anchored on the part itself
  const PARTS = [[71.9, 74.5, 'Annular intake · lip · radome', [0, .3, 4.02]], [75.0, 77.3, 'Wing hinge · deployed', [-.4, .03, .2]], [77.8, 79.8, 'Ramjet nozzle · shock diamonds', [0, .28, -4.45]]];
  let pa = 0;
  for (const [a, b, txt, q] of PARTS) if (T > a && T < b) { setTxt(partT, txt); pa = win(T, a, b, .4); const p = cam.project(X.ap(misX(m), q)); place(L.part, p, 110, -90, onScreen(p, 30) ? pa : 0, true); }
  if (!pa) L.part.style.opacity = 0;
  let fb = null;
  if (ftl > -40 && ftl < 20) { const b0 = screenBox(M.ftr, ftrX(0, tl)), b1 = screenBox(M.ftr, ftrX(1, tl)); if (b0 && b1) fb = [Math.min(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.max(b0[2], b1[2]), Math.max(b0[3], b1[3])]; }
  const fbA = fb && fb[2] - fb[0] > 14 && fb[0] > 0 && fb[2] < 1920 && fb[1] > 0 && fb[3] < 1080 ? win(T, 99.6, 104.2) : 0;
  setTxt(ftrS, `Super Hornet · <b>${FV} m/s</b> · ${Math.round(OA.altOf(ftrP(0, tl)))} m`, true);
  place(L.ftr, fb ? [fb[2] + 6, fb[1] - 6] : null, 60, -60, fbA);
  setTxt(hitS, `destroyer · <b>${outKm(HP).toFixed(1)} km</b> out · ${clock(TLH)}`, true);
  const hA = hP ? HR_PX * .7071 : 0;
  // left of the ring: the column drifts off to the right with the wind
  place(L.hit, hP && OA.clear(SMK.B) ?[hP[0] - hA, hP[1] - hA] : null, -72, -64,onScreen(hP, 40) ? win(T, 119.6, 147) * trkA * edgeK(hP) : 0, false);

  ctx.strokeStyle = WH; ctx.fillStyle = WH; ctx.lineWidth = 1;
  for (const [ax, ay, ex2, ey2, hx, a] of leaders) { ctx.globalAlpha = .7 * a; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex2, ey2); ctx.lineTo(hx, ey2); ctx.stroke(); }
  for (const [ax, ay, a] of dots) { ctx.globalAlpha = a; ctx.fillRect(ax - 2, ay - 2, 4, 4); }
  ctx.globalAlpha = 1;
  // brackets that fit: the satellite, the fighter pair
  if (satP && satA > .01) bracket(screenBox(M.sat, satX, { solar: .35 }), satA * .8, 8);
  if (fbA > .01) bracket(fb, fbA * .8, 6);

  /* readout: altitude of the lens, the scale, and what the clock means right now */
  if (alt >= 10000) { setTxt(roV, grp(Math.round(alt / 1000 / (alt > 1e5 ? 10 : 1)) * (alt > 1e5 ? 10 : 1))); setTxt(roU, 'km'); }
  else if (alt >= 1000) { setTxt(roV, (alt / 1000).toFixed(1)); setTxt(roU, 'km'); }
  else { setTxt(roV, String(Math.round(alt))); setTxt(roU, 'm'); }
  setTxt(roL, 'Alt');
  const rate = SIM.rate(T), rs = Math.abs(rate - 1) > .02 ? `<b>×${rate.toFixed(2)}</b> · ` : '';
  let s2;
  if (T > 34 && T < 60) s2 = `${clock(T - TL)} · launch sequence · TEL 1`;
  else if (T >= 60 && T < 79.5) s2 = `${clock(tl)} · 3M55 · <b>${m.s.toFixed(0)} m/s</b>`;
  else if (T >= 79.5 && T < 117) s2 = gone ? `3M55 · <b>hit</b> · DDG · ${outKm(HP).toFixed(1)} km out` : `3M55 · M <b>${(m.s / 340).toFixed(2)}</b> · <b>${Math.max(0, m.h).toFixed(0)} m</b> · ${outKm(m.p).toFixed(1)} km out`;
  else { const mpp = Math.max(1, alt) / cam.fl, sc = nice(mpp / .000265); const [la, dl] = OA.llOf(OA.upAt(e)); s2 = `1 : ${grp(sc)} · ${(la / D2R).toFixed(2)}° N ${(OA.LON0 + dl / D2R).toFixed(2)}° E`; }
  setTxt(roS, rs + s2, true);
  ruler(lg);
  STAGE.dbg = { T: +T.toFixed(2), alt: +alt.toFixed(1), tl: +tl.toFixed(2), h: +m.h.toFixed(1), s: +m.s.toFixed(0) };
}

/* survey crosses: a 10 m grid on the plateau behind the bluff */
const CROSS = [];
{ const r = M3.rng(11); for (let x = -140; x <= 150; x += 10) for (let z = -150; z <= 60; z += 10) { const jx = x + (r() - .5) * 1.5, jz = z + (r() - .5) * 1.5; if (jz < OA.shoreZ(jx) - 14 && Math.hypot(jx, jz) > 9) CROSS.push([jx, jz]); } }

window.OAF = { camAt, misAt, flight, fpos, FT, SIM, tlOf, Tof, SCHED, M, satFrame, satT, DIVE, CLIMB, AEND, AX, AZ, FTP, ftrP, anchorTl, THIT, TLH, HP, SHIP, smokeP };
FILM.run({ duration: DUR, chapters: CHAPTERS, render, onChapter, cues: CUES });
})();
