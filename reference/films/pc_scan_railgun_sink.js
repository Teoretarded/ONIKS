/* SCAN · RAILGUN heat sink: the heat exchangers under the hull (window.RGK, window.RGKD, window.RGKR).
   The railgun's waste heat (about 64 MJ a shot: 96 MJ from the bank, 32 MJ out of the muzzle) goes into the sea, not
   into the air: the forward hull under the power room carries a sink of seventeen tube bundles stowed in cells. On the
   lower sides fourteen hull doors (seven a side) swing up and out like gills and a bundle runs out of each cell on two
   three-stage telescoping frames; on the keel three bays open their split doors and a larger bundle is lowered on two
   telescoping columns (no deeper than the sonar dome, so the draught does not grow). 2 662 tubes (16 mm cupronickel),
   8.2 km of tube, 410 m² of surface, rated 12 MW. Inside the hull the coolant mains come down from the power room aft
   of the magazine to two manifold drums, four circulation pumps and the supply and return headers along the inner
   bottom; a branch with an isolation valve feeds each bundle through flexible hoses.
   RGK = { build(ctx), drawBase(T, ctx) } draws the sink in the base take (base time T): stowed, deployed from T_RAIL
   (RGKD shows it), the hot slug after the shot (the banks lime then white-hot, the water boiling off them in bubble
   plumes, steam where they break the surface), the residual bleed on the way home, stowed again from TRET1 (RGKR: the
   loop purged at full flow, the heat dumped, the bundles in, the doors shut).
   RGKD (48 s) is one slow X-ray dolly along the coolant's path: the gun's hot line down through its keel port and
   isolation valve to the supply drum, the supply pumps starting (impellers turning in their volutes, the check valves
   swinging open), the coolant running along the supply header and the branch valves opening one by one as it reaches
   them, into one bundle in its cell; that cell's door is pushed open by its rams and the bundle runs out on its
   screw-jacked telescoping frames (the camera following it), the rest ripple out, the keel bays open and lower their
   bundles, the return side fills back to the cold line up to the gun, the scan, and a slow rise past the hull.
   RGKR (34 s): down through the warm patch on the surface (an IR inset maps it), the purge's hot slug down the hot
   main, one bundle held as it goes white-hot, boils and cools back through lime to dark with the seawater convecting
   up through it, the plumes to the surface, the stow (screw jacks and rams in reverse), the cold coolant going back up
   to the gun, and a slow rise past the hull into the base camera.
   Ship frame: +Z forward, +X starboard, y up from the waterline, origin midships. The film's ship has no hull below
   the waterline: this module draws it (z 3 to the stem, with the bow sonar dome). Render is a pure function of time;
   no allocation in the per-dot loops. */
(function () {
'use strict';
const { V, R, X, E } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const G = GEO;
const F = o => Object.assign({ fine: true }, o || {});
let K = null, P_ = null, LIME = null, HOT = null, WH = null;
const kk = (u, a, b) => E.inOut(E.sat((u - a) / (b - a)));
const ss = (a, b, v) => E.ss(a, b, v);
const lock = (u, t0) => { const a = u - t0; return a > 0 && a < .6 ? Math.exp(-a * 6) : 0; };
const hh = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

/* ---------- time ---------- */
const LEN_D = 54.6, LEN_R = 35.0, AT_R = 3;          // RGKR is spliced at TRET1 (the film's TRET1 - 3, + at)
let T_RAIL = 29, TF = 33.8, T_RET = 74.4;
let STAMP = -1, MODE = 0, UU = 0;                    // the frame (film time) one of the inserts draws, which (1 D, 2 R), its u

/* ================= the lower hull =================
   DDG-51 forward body below the waterline: the waterline half breadth from the parts' section (hd_sea_air's form),
   the keel 6.3 m down to the forefoot, which rounds up to the stem; sections are superellipses, full aft (n 3) and
   finer forward (n 1.7 at the forefoot). Tabulated at 0.1 m in z, 240 steps of girth. */
const DR = 6.3, Z_ST = 70.6, HZ0 = 3, HDZ = .1, NG = 240, NF = 120;
let NZH = 0, HT = null, GLN = null, WLT = null;
const WL0 = -80, WLD = .25;
function wl(z) { return z >= Z_ST ? 0 : Math.max(0, P_.sec(z).w[0]); }
function dk(z) { if (z <= 58) return DR; if (z >= Z_ST) return 0; const u = (z - 58) / (Z_ST - 58); return DR * Math.sqrt(Math.max(0, 1 - u * u)); }
function pex(z) { return z < 18 ? 3.0 : z < 62 ? 3.0 - 1.3 * (z - 18) / 44 : 1.7; }
function buildHull() {
  NZH = Math.round((Z_ST - HZ0) / HDZ) + 1;
  HT = new Float32Array(NZH * (NG + 1) * 2); GLN = new Float32Array(NZH);
  const xs = new Float64Array(NF + 1), ys = new Float64Array(NF + 1), cs = new Float64Array(NF + 1);
  for (let iz = 0; iz < NZH; iz++) {
    const z = Math.min(Z_ST - .03, HZ0 + iz * HDZ), W = wl(z), D = dk(z), e = 2 / pex(z);
    for (let i = 0; i <= NF; i++) {
      const f = i / NF * PI / 2;
      xs[i] = W * Math.pow(Math.max(0, Math.cos(f)), e); ys[i] = -D * Math.pow(Math.sin(f), e);
      cs[i] = i ? cs[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) : 0;
    }
    GLN[iz] = cs[NF];
    let i = 1;
    for (let j = 0; j <= NG; j++) {
      const L = cs[NF] * j / NG; while (i < NF && cs[i] < L) i++;
      const k = (L - cs[i - 1]) / Math.max(1e-9, cs[i] - cs[i - 1]), q = (iz * (NG + 1) + j) * 2;
      HT[q] = xs[i - 1] + (xs[i] - xs[i - 1]) * k; HT[q + 1] = ys[i - 1] + (ys[i] - ys[i - 1]) * k;
    }
  }
  const n = Math.round((72 - WL0) / WLD) + 1; WLT = new Float32Array(n);
  for (let i = 0; i < n; i++) WLT[i] = wl(WL0 + i * WLD);
}
/* the waterline half breadth (table, per frame) */
function wlT(z) { const f = (z - WL0) / WLD, i = Math.floor(f); if (i < 0) return WLT[0]; if (i >= WLT.length - 1) return 0; return WLT[i] + (WLT[i + 1] - WLT[i]) * (f - i); }
/* the hull surface at z, girth fraction g (0 waterline .. 1 keel), side s */
function hp(z, g, s, out) {
  const fz = E.clamp((z - HZ0) / HDZ, 0, NZH - 1.001), iz = Math.floor(fz), tz = fz - iz;
  const fg = E.clamp(g, 0, 1) * NG, ig = Math.min(NG - 1, Math.floor(fg)), tg = fg - ig;
  const a = (iz * (NG + 1) + ig) * 2, b = a + (NG + 1) * 2;
  const x0 = HT[a] + (HT[a + 2] - HT[a]) * tg, y0 = HT[a + 1] + (HT[a + 3] - HT[a + 1]) * tg;
  const x1 = HT[b] + (HT[b + 2] - HT[b]) * tg, y1 = HT[b + 1] + (HT[b + 3] - HT[b + 1]) * tg;
  out = out || [0, 0, 0];
  out[0] = s * (x0 + (x1 - x0) * tz); out[1] = y0 + (y1 - y0) * tz; out[2] = z; return out;
}
const girth = z => { const fz = E.clamp((z - HZ0) / HDZ, 0, NZH - 1.001), iz = Math.floor(fz); return GLN[iz] + (GLN[iz + 1] - GLN[iz]) * (fz - iz); };
const HA = [0, 0, 0], HB = [0, 0, 0], HC = [0, 0, 0], HD_ = [0, 0, 0];
function hn(z, g, s, out) {
  hp(z + .05, g, s, HA); hp(z - .05, g, s, HB); hp(z, Math.min(1, g + .004), s, HC); hp(z, Math.max(0, g - .004), s, HD_);
  const tz = [HA[0] - HB[0], HA[1] - HB[1], HA[2] - HB[2]], tg = [HC[0] - HD_[0], HC[1] - HD_[1], HC[2] - HD_[2]];
  let n = V.mul(V.cross(tz, tg), s); const l = V.len(n);
  if (l < 1e-9) n = [0, -1, 0]; else n = V.mul(n, 1 / l);
  out = out || [0, 0, 0]; out[0] = n[0]; out[1] = n[1]; out[2] = n[2]; return out;
}
/* half breadth at depth y (y <= 0), from the table */
function hbAt(z, y) {
  const D = dk(z); if (D <= 0 || y < -D) return 0;
  let lo = 0, hi = 1; const P = [0, 0, 0];
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; hp(z, m, 1, P); if (P[1] > y) lo = m; else hi = m; }
  return hp(z, (lo + hi) / 2, 1, P)[0];
}
/* half breadth by (z, y) on a 0.5 x 0.1 m table (per frame: bubbles sliding up the side) */
let HBT = null; const HBZ0 = 3, HBNZ = 136, HBNY = 64;
function buildHBT() { HBT = new Float32Array(HBNZ * HBNY); for (let i = 0; i < HBNZ; i++) for (let j = 0; j < HBNY; j++) HBT[i * HBNY + j] = hbAt(HBZ0 + i * .5, -j * .1); }
function hbT(z, y) {
  if (y >= 0) return wlT(z); const fz = (z - HBZ0) / .5, fy = -y / .1; if (fz < 0 || fz >= HBNZ - 1 || fy >= HBNY - 1) return 0;
  const i = fz | 0, j = fy | 0, a = fz - i, b = fy - j, q = i * HBNY + j;
  return (HBT[q] * (1 - a) + HBT[q + HBNY] * a) * (1 - b) + (HBT[q + 1] * (1 - a) + HBT[q + HBNY + 1] * a) * b;
}
/* girth fraction where the starboard half breadth falls to x (near the keel) */
function gAtX(z, x) { let lo = 0, hi = 1; const P = [0, 0, 0]; for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; hp(z, m, 1, P); if (P[0] > x) lo = m; else hi = m; } return (lo + hi) / 2; }

/* ================= the sink's layout ================= */
const NSC = 7, SC_Z0 = 31.4, SC_DZ = 3.72, SC_L = 3.3, SC_H = 1.5, SC_G = .40, SC_DEP = .9;   // side cells (per side)
const SB = { nw: 20, nd: 7, p: .055, L: 2.8, hd: .16 };    // side bundle: tubes across, deep, pitch, tube length, header
const KB = { nw: 26, nd: 9, p: .05, L: 3.8, hd: .18 };     // keel bundle
const BY_Z = [35.0, 40.6, 46.2], BY_L = 4.5, BY_W = .78;   // keel bays: centres, length, half width
const EXT_S = 2.0, EXT_K = 2.5, LS_S = .82, LS_K = 1.0;    // telescoping runs and stage lengths
const Y_SB = -.52, Y_KB = 5.72;                            // stowed bundle centres (cell y'; keel frame y' = -ship y)
const Y_KH = 5.2;                                          // keel bay top (keel frame y'): housing 4.2 .. 5.2
const TUBE_D = .016, N_TUBES = 2 * NSC * SB.nw * SB.nd + BY_Z.length * KB.nw * KB.nd;
const TUBE_KM = (2 * NSC * SB.nw * SB.nd * SB.L + BY_Z.length * KB.nw * KB.nd * KB.L) / 1000;
const RATED = 12;                                          // MW
let Z_MN = 41.75; const X_MN = 1.15, Y_HD = -4.6, X_HD = .5;   // the drums (under the power room's hot and cold ports), headers along the inner bottom
let PORT_H = [0, -2.0, 40.95], PORT_C = [0, -2.0, 42.55];         // the room's hot line down and cold line back (RGP.SINK)
const VH = 6;                                              // the hot slug's run through the loop (m/s)
const CELLS = [];                                          // {s, i, zc, F (cell -> ship), n, hinge: {p, a, sg}, sPath}
const BAYS = [];                                           // {i, zb, F (keel frame -> ship), sPath}
const BUN = [];                                            // all bundles: {kind 0 side / 1 keel, cell|bay, s0 (path from the room), HZ, L, src}

/* a frame from basis columns */
const frame = (x, y, z, o) => X.make([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], o.slice());
function rotAxis(a, t) {
  const c = Math.cos(t), s = Math.sin(t), C_ = 1 - c, [x, y, z] = a;
  return [c + x * x * C_, x * y * C_ - z * s, x * z * C_ + y * s, y * x * C_ + z * s, c + y * y * C_, y * z * C_ - x * s, z * x * C_ - y * s, z * y * C_ + x * s, c + z * z * C_];
}
const pivot = (p, a, t) => { const Rm = rotAxis(a, t), rp = R.ap(Rm, p); return X.make(Rm, [p[0] - rp[0], p[1] - rp[1], p[2] - rp[2]]); };
function layout() {
  CELLS.length = 0; BAYS.length = 0; BUN.length = 0;
  for (const s of [1, -1]) for (let i = 0; i < NSC; i++) {
    const zc = SC_Z0 + SC_DZ * i, P = hp(zc, SC_G, s), n = hn(zc, SC_G, s);
    let zp = V.norm(V.sub([0, 0, 1], V.mul(n, n[2]))), xp = V.cross(n, zp); if (xp[1] < 0) xp = V.mul(xp, -1);
    const Fc = frame(xp, n, zp, P);
    // the hinge: the door's top edge (girth), a straight line between its ends
    const hg = SC_H / 2 / girth(zc), a0 = hp(zc - SC_L / 2, SC_G - hg, s), a1 = hp(zc + SC_L / 2, SC_G - hg, s);
    const ax = V.norm(V.sub(a1, a0)), mid = V.lerp(a0, a1, .5);
    const lowMid = hp(zc, SC_G + hg, s), tst = R.ap(rotAxis(ax, .2), V.sub(lowMid, mid));
    const sg = V.dot(V.sub(V.add(mid, tst), lowMid), n) > 0 ? 1 : -1;
    const c = { s, i, zc, F: Fc, n, P, hinge: { p: mid, a: ax, sg } };
    CELLS.push(c);
  }
  BY_Z.forEach((zb, i) => BAYS.push({ i, zb, F: X.make([1, 0, 0, 0, -1, 0, 0, 0, 1], [0, 0, zb]) }));
  // path lengths from the power room (the hot slug's delay): main 5.2 + drum and pumps 2.2 + header run + branch
  for (const c of CELLS) { const fit = X.ap(c.F, [0, -SC_DEP, -(SB.L / 2 + SB.hd / 2)]); c.s0 = 7.4 + Math.abs(c.zc - SB.L / 2 - Z_MN) + Math.abs(fit[0] - X_HD) + Math.abs(fit[1] - Y_HD) + 1.2; BUN.push({ kind: 0, c, s0: c.s0, L: SB.L, HZ: new Float64Array(6), th: 0 }); }
  for (const b of BAYS) { b.s0 = 7.4 + Math.abs(b.zb - KB.L / 2 - Z_MN) + 1.6 + 1.2; BUN.push({ kind: 1, c: b, s0: b.s0, L: KB.L, HZ: new Float64Array(6), th: 0 }); }
}

/* ================= sampling ================= */
const LT = [.008, .016, .032, .064, .128, .256];           // tubes, fittings
const LM = [.016, .032, .064, .128, .256, .512];           // machinery, doors
const LHA = [.06, .12, .24, .48, .96], LHB = [.1, .2, .4, .8, 1.6];   // hull round the sink, the rest
const LMF = [.01, .02, .04, .08, .16, .32];                // the machinery the lens holds on (pumps, drums, valves)
const LD = [.03, .06, .12, .24, .48], LW = [.045, .09, .18, .36, .72], LI = [.03, .06, .12, .24, .48], LIS = [.06, .12, .24, .48, .96];
const push6 = (o, p, n) => o.push(p[0], p[1], p[2], n ? n[0] : 0, n ? n[1] : 0, n ? n[2] : 0);
const mk = (levels, fn, cs) => K.lodCloud(levels.map((sp, li) => { const o = []; fn(o, sp, li); return { sp, pts: new Float32Array(o) }; }), cs || .6);
const prims = (P, levels, cs) => mk(levels, (o, sp, li) => { const q = P_.sampleLat(P, sp, li >= 3); for (let i = 0; i < q.length; i++) o.push(q[i]); }, cs);
/* a curve on the hull: sample a (z, g) polyline, lines (zero normal) */
function hullLine(o, pts, s, sp, off) {
  const P = pts.map(([z, g]) => { const p = hp(z, g, s), n = hn(z, g, s); return V.mad(p, n, off || 0); });
  for (let i = 0; i < P.length - 1; i++) P_.lineL(o, P[i], P[i + 1], sp);
}
/* the outer shell, with the door and bay openings cut out */
function inDoor(z, g, s) {
  for (const c of CELLS) { if (c.s !== s) continue; const hg = SC_H / 2 / girth(c.zc); if (Math.abs(z - c.zc) < SC_L / 2 && Math.abs(g - SC_G) < hg) return true; }
  return false;
}
function inBay(z, x) { if (Math.abs(x) >= BY_W) return false; for (const zb of BY_Z) if (Math.abs(z - zb) < BY_L / 2) return true; return false; }
function shell(o, z0, z1, sp, li, side) {
  const nz = Math.max(1, Math.round((z1 - z0) / sp)), P = [0, 0, 0], N = [0, 0, 0];
  for (let a = 0; a < nz; a++) {
    const z = z0 + (a + .5) * (z1 - z0) / nz, gl = girth(z), ng = Math.max(2, Math.round(gl / sp));
    for (const s of [-1, 1]) for (let b = 0; b < ng; b++) {
      if (side && s !== side) continue;
      const g = (b + .5) / ng; hp(z, g, s, P);
      if (inDoor(z, g, s) || inBay(z, P[0])) continue;
      hn(z, g, s, N); push6(o, P, N);
    }
  }
  // seams: the waterline, the keel, two strakes a side, butts every 4.8 m
  const es = sp * .5, zs = []; for (let z = z0; z <= z1 + 1e-6; z += .6) zs.push(z);
  for (const s of [-1, 1]) {
    if (side && s !== side) continue;
    for (const g of [0, .34, .67]) hullLine(o, zs.map(z => [z, g]), s, es, .01);
    for (let z = Math.ceil(z0 / 4.8) * 4.8; z < z1; z += 4.8) { const gs = []; for (let g = 0; g <= 1.001; g += .05) gs.push([z, g]); hullLine(o, gs, s, es, .01); }
  }
  if (side !== -1) hullLine(o, zs.map(z => [z, 1]), 1, es, .01);
  void li;
}
/* the bow sonar dome (SQS-53C): a body of revolution under the forefoot, its bottom 9.3 m down (the ship's
   navigational draught 9.4 m) */
const DOME = { y: -6.85, z0: 53.6, z1: 73.4, zm: 66, r: 2.45 };
const domeR = z => { const k = z < DOME.zm ? (z - DOME.zm) / (DOME.zm - DOME.z0) : (z - DOME.zm) / (DOME.z1 - DOME.zm); return DOME.r * Math.sqrt(Math.max(0, 1 - k * k)); };
function dome(o, sp) {
  const nz = Math.round((DOME.z1 - DOME.z0) / sp);
  for (let a = 0; a < nz; a++) {
    const z = DOME.z0 + (a + .5) * (DOME.z1 - DOME.z0) / nz, r = domeR(z), r2 = domeR(z + .05), dr = (r2 - r) / .05;
    const nt = Math.max(8, Math.round(TAU * r / sp));
    for (let t = 0; t < nt; t++) {
      const th = (t + .5 + (a & 1) * .5) / nt * TAU, x = Math.sin(th) * r, y = DOME.y - Math.cos(th) * r;
      if (z < Z_ST && y > -dk(z) + .02 && Math.abs(x) < hbAt(z, y) * .98) continue;     // inside the hull
      const n = V.norm([Math.sin(th), -Math.cos(th), -dr]);
      o.push(x, y, z, n[0], n[1], n[2]);
    }
  }
  for (let z = 56; z < 73; z += 2.4) { const r = domeR(z), P = []; for (let k = 0; k <= 24; k++) { const th = -PI / 2 + k / 24 * PI; P.push([Math.sin(th) * r, DOME.y - Math.cos(th) * r, z]); } for (let i = 0; i < P.length - 1; i++) P_.lineL(o, P[i], P[i + 1], sp * .5); }
}
/* a side door (ship frame): the hull patch it covers, its edges, two latches and the hinge knuckles */
function doorPts(c, o, sp) {
  const hg = SC_H / 2 / girth(c.zc), g0 = SC_G - hg, g1 = SC_G + hg, z0 = c.zc - SC_L / 2, z1 = c.zc + SC_L / 2;
  const nz = Math.max(1, Math.round(SC_L / sp)), ng = Math.max(1, Math.round(SC_H / sp)), P = [0, 0, 0], N = [0, 0, 0];
  for (let a = 0; a < nz; a++) for (let b = 0; b < ng; b++) {
    const z = z0 + (a + .5) / nz * SC_L, g = g0 + (b + .5) / ng * (g1 - g0); hp(z, g, c.s, P); hn(z, g, c.s, N); push6(o, P, N);
  }
  const es = sp * .5, line = pts => hullLine(o, pts, c.s, es, .012);
  line([[z0, g0], [z1, g0]]); line([[z0, g1], [z1, g1]]); line([[z0, g0], [z0, g1]]); line([[z1, g0], [z1, g1]]);
  line([[z0 + .06, g0 + .02], [z1 - .06, g0 + .02]]); line([[z0 + .06, g1 - .02], [z1 - .06, g1 - .02]]);
  for (const zz of [z0 + .8, c.zc, z1 - .8]) line([[zz, g0 + .02], [zz, g1 - .02]]);
  const pr = [];
  for (const zz of [z0 + .5, z1 - .5]) { const p = hp(zz, g1 - .012, c.s), n = hn(zz, g1, c.s); pr.push(G.box(V.add(p, [-.04, -.04, -.08]), V.add(V.mad(p, n, .05), [.04, .04, .08]), F())); }
  for (const zz of [z0 + .25, c.zc, z1 - .25]) { const p = hp(zz, g0, c.s); pr.push(G.cyl([p[0], p[1], zz - .14], [p[0], p[1], zz + .14], .035, F())); }
  const q = P_.sampleLat(pr, sp, sp > .1); for (let i = 0; i < q.length; i++) o.push(q[i]);
}
/* a keel bay leaf (ship frame): the bottom from the centreline to the hinge at x = s BY_W */
function leafPts(zb, s, o, sp) {
  const z0 = zb - BY_L / 2, nz = Math.max(1, Math.round(BY_L / sp)), P = [0, 0, 0], N = [0, 0, 0];
  for (let a = 0; a < nz; a++) {
    const z = z0 + (a + .5) / nz * BY_L, gw = gAtX(z, BY_W), ng = Math.max(1, Math.round(BY_W / sp));
    for (let b = 0; b < ng; b++) { const g = gw + (1 - gw) * (b + .5) / ng; hp(z, g, s, P); hn(z, g, s, N); push6(o, P, N); }
  }
  const es = sp * .5, gw0 = gAtX(z0, BY_W), gw1 = gAtX(z0 + BY_L, BY_W);
  hullLine(o, [[z0, gw0], [z0 + BY_L, gw1]], s, es, .012); hullLine(o, [[z0, 1], [z0 + BY_L, 1]], s, es, .012);
  hullLine(o, [[z0, gw0], [z0, 1]], s, es, .012); hullLine(o, [[z0 + BY_L, gw1], [z0 + BY_L, 1]], s, es, .012);
  for (let k = 1; k < 4; k++) { const z = z0 + k * BY_L / 4; hullLine(o, [[z, gAtX(z, BY_W) + .002], [z, 1]], s, es, .012); }
}
/* a cell's recess (cell frame: the opening at y' 0, inward normals) and a keel bay's well (keel frame: y' down, the
   opening at the bottom, y' 6.29) */
function wellS(o, sp) {
  const h = SC_H / 2, l = SC_L / 2, d = -SC_DEP;
  const q = (a, b, c, e, n) => P_.quadL(o, a, b, c, e, n, sp), ln = (a, b) => P_.lineL(o, a, b, sp * .5);
  q([-h, d, -l], [h, d, -l], [h, d, l], [-h, d, l], [0, 1, 0]);
  q([h, d, -l], [h, 0, -l], [h, 0, l], [h, d, l], [-1, 0, 0]);
  q([-h, d, -l], [-h, 0, -l], [-h, 0, l], [-h, d, l], [1, 0, 0]);
  q([-h, d, -l], [h, d, -l], [h, 0, -l], [-h, 0, -l], [0, 0, 1]);
  q([-h, d, l], [h, d, l], [h, 0, l], [-h, 0, l], [0, 0, -1]);
  for (const x of [-h, h]) for (const z of [-l, l]) ln([x, d, z], [x, 0, z]);
  for (const z of [-l, l]) ln([-h, d, z], [h, d, z]);
  for (const x of [-h, h]) ln([x, d, -l], [x, d, l]);
  for (const x of [-h + .12, h - .12]) ln([x, d + .02, -l + .1], [x, d + .02, l - .1]);           // guide rails
  for (const z of [-(SB.L / 2 + SB.hd / 2), SB.L / 2 + SB.hd / 2]) P_.ringL(o, [0, d + .01, z], [1, 0, 0], [0, 0, 1], .06, sp * .5);   // hose fittings
}
const Y_KO = 6.29;
function wellK(o, sp) {
  const z0 = -BY_L / 2, z1 = BY_L / 2, yt = Y_KH, yb = Y_KO, w = BY_W;
  const q = (a, b, c, e, n) => P_.quadL(o, a, b, c, e, n, sp), ln = (a, b) => P_.lineL(o, a, b, sp * .5);
  q([-w, yt, z0], [w, yt, z0], [w, yt, z1], [-w, yt, z1], [0, 1, 0]);
  q([w, yb, z0], [w, yt, z0], [w, yt, z1], [w, yb, z1], [-1, 0, 0]);
  q([-w, yb, z0], [-w, yt, z0], [-w, yt, z1], [-w, yb, z1], [1, 0, 0]);
  q([-w, yb, z0], [w, yb, z0], [w, yt, z0], [-w, yt, z0], [0, 0, 1]);
  q([-w, yb, z1], [w, yb, z1], [w, yt, z1], [-w, yt, z1], [0, 0, -1]);
  for (const x of [-w, w]) for (const z of [z0, z1]) ln([x, yb, z], [x, yt, z]);
  for (const x of [-w, w]) ln([x, yt, z0], [x, yt, z1]);
}
/* a tube bundle (its frame: x' across, y' out from the hull, z' along the tubes; centred): tubes as dotted lines (at
   the finest levels a triple hairline round each), the inlet header aft (z' -), the outlet header fore, support
   plates every 0.7 m, corner longerons, the hose nozzles on the back of the headers, the frames' brackets */
function bundlePts(B, o, sp, li) {
  const W = (B.nw - 1) * B.p, D = (B.nd - 1) * B.p, L = B.L;
  const n = Math.max(2, Math.round(L / sp));
  for (let i = 0; i < B.nw; i++) for (let j = 0; j < B.nd; j++) {
    const x = -W / 2 + i * B.p, y = -D / 2 + j * B.p;
    const outer = i === 0 || i === B.nw - 1 || j === 0 || j === B.nd - 1, w = outer ? 1 : j === 1 || j === B.nd - 2 || i === 1 || i === B.nw - 2 ? .62 : .4;
    if (!outer && li >= 2 && ((i + j) & 1)) continue;                 // coarse: the inner rows thinned (they merge on screen)
    if (!outer && li >= 4 && (i % 3 || j % 2)) continue;
    for (let m = 0; m < n; m++) o.push(x, y, -L / 2 + (m + .5 + ((i + j) & 1) * .5) * L / n, 0, 0, 2 + w);
  }
  const mw = W / 2 + .06, md = D / 2 + .06, P = [];
  for (const sg of [-1, 1]) {
    const z0 = sg * L / 2, z1 = sg * (L / 2 + B.hd);
    P.push(G.box([-mw, -md, Math.min(z0, z1)], [mw, md, Math.max(z0, z1)]));
    P.push(G.cyl([0, -md, sg * (L / 2 + B.hd / 2)], [0, -md - .14, sg * (L / 2 + B.hd / 2)], .045, {}));     // the hose nozzle
    P.push(G.cyl([0, -md - .14, sg * (L / 2 + B.hd / 2)], [0, -md - .17, sg * (L / 2 + B.hd / 2)], .065, F()));
    for (const x of [-mw + .05, mw - .05]) P.push(G.box([x - .04, -md - .14, sg * (L / 2 - .32) - .05], [x + .04, -md, sg * (L / 2 - .32) + .05], F()));
  }
  for (let z = -L / 2 + .7; z < L / 2 - .1; z += .7) P.push(G.line([[-mw, -md, z], [mw, -md, z], [mw, md, z], [-mw, md, z]], { closed: true }));
  for (const x of [-mw, mw]) for (const y of [-md, md]) P.push(G.line([[x, y, -L / 2], [x, y, L / 2]]));
  const q = P_.sampleLat(P, Math.max(.02, sp * 2.5), li >= 3); for (let i = 0; i < q.length; i++) o.push(q[i]);
}
/* a telescoping stage: a square tube along +y' from 0 to l, half width w, collars at its ends */
const stagePrims = (l, w) => [G.box([-w, 0, -w], [w, l, w], { bottom: true }), G.box([-w - .012, l - .05, -w - .012], [w + .012, l, w + .012], F())];
/* the inside (ship frame): structure, mains, drums, pumps, headers, branches, valves, the frames' housings and their
   screw jacks. Each flow path is laid out in the direction the coolant runs (supply: the gun's hot line down to the
   starboard drum, the two starboard pumps, the supply header, the branches to the bundles' inlets; return: the
   bundles' outlets to the port header, the two port pumps, the port drum and the cold line back up to the gun), with
   its run s0 from the gun's hot port (the hot slug's delay, the filling front) and k, the share of the heat it keeps */
const PIPES = [];                                          // flow paths {pl (poly), s0, r, k}
const VALVES = [];                                         // branch valves (butterfly) {p, ax (pipe), sh (stem), r, b, end, s}
const MVALVES = [];                                        // the mains' isolation valves (gate) {p, ax, sh, hot}
const CHECKS = [];                                         // swing check valves after the pumps {p, ax, up, r, k (pump)}
const PUMPS = [[2.05, -4.05, 40.65], [2.05, -4.05, 42.85], [-2.05, -4.05, 40.65], [-2.05, -4.05, 42.85]];
const JACKS = [];                                          // screw jacks {bi, zl, kind}
const JZ_S = SB.L / 2 - .22, JZ_K = KB.L / 2 - .25;        // the frames' columns (bundle z')
let S_HOT = 0, S_END = 0, S_PIN = 0, S_RET = 0;            // the runs: the hot main, to the cold port, to the supply pumps, the return header
const plen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += V.dist(pts[i], pts[i - 1]); return L; };
function interior() {
  const P = [], PS = [], PM = [];
  const fl = (c, ax, r) => P.push(G.lathe(V.mad(c, ax, -.015), ax, [[0, r + .045], [.03, r + .045]], F({ caps: true })));
  const pipe = (pts, r, s0, k, o) => {
    P.push(...P_.pipes(pts, r)); if (k !== null) PIPES.push({ pl: P_.poly(pts), s0, r, k });
    if (o === false) return;
    const n = pts.length; fl(pts[0], V.norm(V.sub(pts[1], pts[0])), r); fl(pts[n - 1], V.norm(V.sub(pts[n - 1], pts[n - 2])), r);
    for (let i = 0; i < n - 1; i++) { const L = V.dist(pts[i], pts[i + 1]), ax = V.norm(V.sub(pts[i + 1], pts[i])); for (let d = 2.4; d < L - .5; d += 2.4) fl(V.mad(pts[i], ax, d), ax, r); }
  };
  const band = (c, ax, r) => P.push(G.lathe(V.mad(c, ax, -.02), ax, [[0, r + .015], [.04, r + .015]], F()));
  // transverse frames: webs following the shell 0.25 m inside, floors at the inner bottom
  const IB = -5.2;
  for (let z = 28.8; z < 57.7; z += 2.4) {
    for (const s of [-1, 1]) { const L = []; for (let g = .02; g <= 1.001; g += .04) { const p = hp(z, g, s), n = hn(z, g, s); if (p[1] < IB) break; L.push(V.mad(p, n, -.25)); } if (L.length > 1) PS.push(G.line(L)); }
    const hw = hbAt(z, IB) - .25; if (hw > .3) PS.push(G.line([[-hw, IB, z], [hw, IB, z]]));
  }
  // the inner bottom (tank top) and the magazine deck over the sink space, as plating lines
  for (let x = -3.6; x <= 3.61; x += .6) { const L = []; for (let z = 28.8; z <= 57.6; z += .6) { if (hbAt(z, IB) - .3 > Math.abs(x) && !inBay(z, x * .98)) L.push([x, IB, z]); else if (L.length) { if (L.length > 1) PS.push(G.line(L.slice())); L.length = 0; } } if (L.length > 1) PS.push(G.line(L)); }
  for (const s of [-1, 1]) for (const x of [1.4, 2.6]) { const L = []; for (let z = 29; z <= 57.4; z += .6) if (hbAt(z, -1.75) - .3 > x) L.push([s * x, -1.75, z]); if (L.length > 1) PS.push(G.line(L)); }
  // the mains: the gun's hot line comes down from its keel port through an isolation valve and an expansion bellows to
  // the supply drum (starboard); the return drum (port) sends the cooled coolant back up through the cold line
  const H = PORT_H, Cc = PORT_C, YM = -3.25;
  const HM = [H, [H[0], YM, H[2]], [X_MN, YM, H[2]], [X_MN, -3.7, H[2]]];
  pipe(HM, .125, 0, 1); S_HOT = plen(HM);
  const CM = [[-X_MN, -3.7, Cc[2]], [-X_MN, -3.05, Cc[2]], [Cc[0], -3.05, Cc[2]], Cc];
  pipe(CM, .125, 0, null);
  for (const [p, hot] of [[H, 1], [Cc, 0]]) {
    const c = [p[0], -2.55, p[2]];
    MVALVES.push({ p: c, ax: [0, 1, 0], sh: [1, 0, 0], hot });
    PM.push(G.cyl([c[0], c[1] - .15, c[2]], [c[0], c[1] + .15, c[2]], .17, { caps: true }));                           // body
    for (const dy of [-.17, .17]) PM.push(G.lathe([c[0], c[1] + dy - .015, c[2]], [0, 1, 0], [[0, .2], [.03, .2]], { caps: true }));
    PM.push(G.box([c[0] + .1, c[1] - .13, c[2] - .13], [c[0] + .42, c[1] + .13, c[2] + .13]));                       // bonnet
    for (const dz of [-.07, .07]) PM.push(G.line([[c[0] + .42, c[1], c[2] + dz], [c[0] + .62, c[1], c[2] + dz]], F()));   // yoke
    PM.push(G.cyl([c[0] + .62, c[1], c[2] - .1], [c[0] + .62, c[1], c[2] + .1], .085, { caps: true }));               // the motor operator
    PM.push(G.box([c[0] + .55, c[1] + .085, c[2] - .06], [c[0] + .69, c[1] + .15, c[2] + .06], F()));
    for (let k = 0; k < 5; k++) band([p[0], -2.85 - k * .055, p[2]], [0, 1, 0], .125);                             // bellows
    band([p[0], -2.12, p[2]], [0, 1, 0], .125);
  }
  for (const p of [H, Cc]) P.push(G.cyl([p[0], p[1] - .5, p[2]], [p[0], p[1] - .4, p[2]], .17, {}));          // flanges under the chest valves
  // hangers: the mains' cross runs hung from the deck over the sink space
  for (const [x, y, z] of [[X_MN * .5, YM, H[2]], [-X_MN * .5, -3.05, Cc[2]]]) { P.push(G.cyl([x, -1.75, z], [x, y + .14, z], .016, F())); band([x, y, z], [1, 0, 0], .125); }
  for (const s of [1, -1]) {
    PM.push(G.lathe([s * X_MN, -3.95, Z_MN - 1.9], [0, 0, 1], [[0, .2], [.12, .25], [3.68, .25], [3.8, .2]], { caps: true }));    // drum
    for (let k = 0; k < 8; k++) { const z = Z_MN - 1.7 + k * .48; PM.push(G.line([[s * X_MN - .25, -3.95, z], [s * X_MN + .25, -3.95, z]], F())); }
    for (const z of [Z_MN - 1.6, Z_MN + 1.6]) PS.push(G.box([s * X_MN - .2, -5.2, z - .06], [s * X_MN + .2, -4.18, z + .06], F()));   // saddles
  }
  // in the supply drum: from its inlet to the two suctions
  const sIn = S_HOT + .25, SJ = [];
  for (const z of [PUMPS[0][2], PUMPS[1][2]]) PIPES.push({ pl: P_.poly([[X_MN, -3.95, H[2]], [X_MN, -3.95, z]]), s0: sIn, r: 0, k: 1 });
  // pumps: vertical inline, motor over the volute (the impeller, the coupling and the motor's fan turn: drawn per frame)
  PUMPS.forEach(([x, y, z], k) => {
    const s = Math.sign(x);
    PM.push(G.lathe([x, y - .3, z], [0, 1, 0], [[0, .18], [.05, .3], [.32, .3], [.38, .18]], { caps: true, ds: 1.4 }));   // volute
    PM.push(G.lathe([x, y + .28, z], [0, 1, 0], [[0, .1], [.22, .1]], {}));                                            // lantern
    PM.push(G.lathe([x, y + .5, z], [0, 1, 0], [[0, .24], [.62, .24], [.66, .18]], { caps: true }));                   // motor
    for (let q = 0; q < 12; q++) { const a = q / 12 * TAU; PM.push(G.line([[x + Math.cos(a) * .255, y + .55, z + Math.sin(a) * .255], [x + Math.cos(a) * .255, y + 1.06, z + Math.sin(a) * .255]], F())); }
    PM.push(G.lathe([x, y + 1.16, z], [0, 1, 0], [[0, .2], [.1, .2]], F()));                                       // fan guard
    PS.push(G.box([x - .3, -5.2, z - .3], [x + .3, y - .3, z + .3]));                                              // plinth
    const SU = [[s * X_MN, -3.95, z], [x, -3.95, z]], DI = [[x, y - .14, z + .32], [x, y - .14, z + .6], [s * X_HD, y - .14, z + .6], [s * X_HD, Y_HD, z + .6]];
    if (s > 0) {                                                                                                     // supply: drum -> pump -> header
      const s0 = sIn + Math.abs(z - H[2]); pipe(SU, .1, s0, 1); S_PIN = Math.max(S_PIN, s0 + plen(SU));
      const s1 = s0 + plen(SU) + .5; pipe(DI, .09, s1, 1); SJ.push({ z: z + .6, s: s1 + plen(DI) });
      CHECKS.push({ p: [(x + X_HD) / 2 + .2, y - .14, z + .6], ax: [-1, 0, 0], up: [0, 1, 0], r: .09, k });
    } else {                                                                                                         // return: header -> pump -> drum
      pipe(DI.slice().reverse(), .09, -1, .6); pipe(SU.slice().reverse(), .1, -2, .6);
      CHECKS.push({ p: [(x - X_MN) / 2, -3.95, z], ax: [1, 0, 0], up: [0, 1, 0], r: .1, k });
    }
    const ck = CHECKS[CHECKS.length - 1], c = ck.p, ax = ck.ax;
    PM.push(G.cyl(V.mad(c, ax, -.09), V.mad(c, ax, .09), ck.r + .035, { caps: true }));
    PM.push(G.box([c[0] - .05, c[1] + ck.r + .03, c[2] - .05], [c[0] + .05, c[1] + ck.r + .1, c[2] + .05], F()));     // the hinge cap
  });
  // headers along the inner bottom (supply starboard of the centreline, from the pumps outward; return to port, from
  // the ends in to the return pumps), hung from the inner bottom
  const sHdr = z => z <= SJ[0].z ? SJ[0].s + (SJ[0].z - z) : z >= SJ[1].z ? SJ[1].s + (z - SJ[1].z) : Math.min(SJ[0].s + z - SJ[0].z, SJ[1].s + SJ[1].z - z);
  pipe([[X_HD, Y_HD, SJ[0].z], [X_HD, Y_HD, 29.2]], .1, SJ[0].s, 1);
  pipe([[X_HD, Y_HD, SJ[1].z], [X_HD, Y_HD, 56.4]], .1, SJ[1].s, 1);
  pipe([[X_HD, Y_HD, SJ[0].z], [X_HD, Y_HD, SJ[1].z]], .1, 0, null, false);
  for (const s of [1, -1]) {
    for (const z of [29.2, 56.4]) P.push(G.cyl([s * X_HD, Y_HD, z], [s * X_HD, Y_HD, z + Math.sign(z - 44) * .06], .13, { caps: true }));
    for (let z = 30; z < 56; z += 1.6) { PS.push(G.box([s * X_HD - .14, IB, z - .05], [s * X_HD + .14, Y_HD - .1, z + .05], F())); band([s * X_HD, Y_HD, z], [0, 0, 1], .1); }   // hangers, U-bands
  }
  // branches: supply to each bundle's inlet (aft), return from its outlet (fore); a butterfly valve on each by the header
  let sRet = 0;
  BUN.forEach((b, bi) => {
    const B = b.kind ? KB : SB;
    for (const end of [-1, 1]) {
      const sx = end < 0 ? 1 : -1, xh = sx * X_HD;
      let pts, vp;
      if (b.kind === 0) {
        const c = b.c, zl = end * (SB.L / 2 + SB.hd / 2), fit = X.ap(c.F, [0, -SC_DEP, zl]), inn = X.ap(c.F, [0, -SC_DEP - .35, zl]), zf = fit[2];
        const yr = Math.max(inn[1], Y_HD + (c.s === sx ? 0 : .3));
        pts = [[xh, Y_HD, zf], [xh, yr, zf], [inn[0], yr, zf], inn, fit].filter((p, i, A) => !i || V.dist(p, A[i - 1]) > .02);
        vp = [xh, Y_HD + Math.min(.3, (yr - Y_HD) * .5), zf];
      } else {
        const zf = b.c.zb + end * (KB.L / 2 + KB.hd / 2);
        pts = [[xh, Y_HD, zf], [xh, -Y_KH + .25, zf], [0, -Y_KH + .25, zf], [0, -Y_KH, zf]];
        vp = [xh, (Y_HD - Y_KH + .25) / 2, zf];
      }
      const L = plen(pts), ax = [0, vp[1] > Y_HD ? 1 : -1, 0];
      if (end < 0) { const s0 = sHdr(pts[0][2]); pipe(pts, .05, s0, 1); b.s0 = s0 + L + 1.2; VALVES.push({ p: vp, ax, sh: [sx, 0, 0], r: .05, b: bi, end, s: s0 + Math.abs(vp[1] - Y_HD) }); }
      else { const s0 = b.s0 + B.L + 1.2; pipe(pts.slice().reverse(), .05, s0, .6); sRet = Math.max(sRet, s0 + L); VALVES.push({ p: vp, ax: V.mul(ax, -1), sh: [sx, 0, 0], r: .05, b: bi, end, s: 0 }); }
    }
  });
  // the return header and the return side (their runs after the farthest bundle; the heat kept 0.6)
  S_RET = sRet;
  pipe([[-X_HD, Y_HD, 29.2], [-X_HD, Y_HD, SJ[0].z]], .1, sRet, .6);
  pipe([[-X_HD, Y_HD, 56.4], [-X_HD, Y_HD, SJ[1].z]], .1, sRet, .6);
  pipe([[-X_HD, Y_HD, SJ[0].z], [-X_HD, Y_HD, SJ[1].z]], .1, 0, null, false);
  for (const p of PIPES) if (p.s0 === -1) p.s0 = sRet + 13; else if (p.s0 === -2) p.s0 = sRet + 15;      // the return pumps' legs
  const sCold = sRet + 16.5;
  for (const z of [PUMPS[2][2], PUMPS[3][2]]) PIPES.push({ pl: P_.poly([[-X_MN, -3.95, z], [-X_MN, -3.95, Cc[2]]]), s0: sCold - 1.5, r: 0, k: .6 });
  PIPES.push({ pl: P_.poly(CM), s0: sCold, r: .125, k: .6 });
  S_END = sCold + plen(CM);
  // the branch valves: a wafer body between flanges, the stem neck and the actuator (its disc and pointer per frame)
  for (const v of VALVES) {
    const c = v.p, ax = v.ax, sh = v.sh;
    PM.push(G.cyl(V.mad(c, ax, -.05), V.mad(c, ax, .05), .08, { caps: true }));
    for (const d of [-.065, .065]) fl(V.mad(c, ax, d), ax, .05);
    PM.push(G.cyl(V.mad(c, sh, .08), V.mad(c, sh, .18), .018, F()));
    const a = V.mad(c, sh, .18), b = V.mad(c, sh, .3); PM.push(G.box([Math.min(a[0], b[0]), c[1] - .06, c[2] - .07], [Math.max(a[0], b[0]), c[1] + .06, c[2] + .07]));
  }
  // the frames' housings (fixed outer tubes) and their screw jacks: a gearbox under each column and its motor
  const PJ = [];
  for (const c of CELLS) for (const zl of [-JZ_S, JZ_S]) {
    const Lh = X.mul(c.F, X.make(R.I(), [0, -SC_DEP - LS_S, zl]));
    PJ.push(...stagePrims(LS_S, .1).map(p => xfPrim(p, Lh)));
    PJ.push(...[G.box([-.1, -.22, -.09], [.1, 0, .09]), G.cyl([.1, -.11, 0], [.34, -.11, 0], .065, { caps: true }), ...[0, 1, 2, 3, 4, 5].map(q => G.line([[.14, -.11 + Math.cos(q / 6 * TAU) * .072, Math.sin(q / 6 * TAU) * .072], [.3, -.11 + Math.cos(q / 6 * TAU) * .072, Math.sin(q / 6 * TAU) * .072]], F()))].map(p => xfPrim(p, Lh)));
  }
  for (const b of BAYS) for (const zl of [-JZ_K, JZ_K]) {
    const Lh = X.mul(b.F, X.make(R.I(), [0, 4.2, zl]));
    PJ.push(...stagePrims(LS_K, .12).map(p => xfPrim(p, Lh)));
    PJ.push(...[G.box([-.11, -.22, -.1], [.11, 0, .1]), G.cyl([.11, -.11, 0], [.36, -.11, 0], .07, { caps: true })].map(p => xfPrim(p, Lh)));
  }
  BUN.forEach((b, bi) => { for (const zl of b.kind ? [-JZ_K, JZ_K] : [-JZ_S, JZ_S]) JACKS.push({ bi, zl, kind: b.kind }); });
  return { P, PS, PJ, PM };
}
/* a GEO prim moved by a rigid transform (points and directions) */
function xfPrim(pr, Tw) {
  const q = Object.assign({}, pr);
  if (pr.p) q.p = pr.p.map(p => X.ap(Tw, p));
  if (pr.a) q.a = X.ap(Tw, pr.a);
  if (pr.d) q.d = X.dir(Tw, pr.d);
  if (pr.c) q.c = X.ap(Tw, pr.c);
  return q;
}

/* ================= the point pass =================
   The film's lattice look (1 px dots, edges at a fixed brightness, back faces dropped), plus: extinction in the water
   (per cell), the lower hull's own X-ray window (xr 1 shell: thinned where open, lime at the front; xr 3 inside: seen
   only where open), the banks' heat (white -> lime -> white-hot, from the inlet header along the tubes) */
const XK = { zo: 99, zs: 99, ko: 1, ks: 1, box: [-9, 9, -9.8, -.2, 28.4, 57.9] };   // the sink space below the waterline: the mains, drums, pumps, headers, the cells' frames
const KO0 = { scan: false, a: 1.45, amb: .2, edge: .78, back: 0, bk: 0, fog: 0, sub: 0, lime: 0, keep: 1, px: 4.8, xr: 0, S: null, heat: 0, HZ: null, hz0: 0, hL: 1, occ: true, col: null, px0: 99, portal: null, foc: false };
const KO = Object.assign({}, KO0);
const ko = o => { for (const k in KO0) KO[k] = o[k] !== undefined ? o[k] : KO0[k]; return KO; };
let XMK = null, NPK = 0;
function sphereInK(x, mx, my, mz, rad) {
  const C = K.C, zc = x[6] * mx + x[7] * my + x[8] * mz + x[11];
  if (zc < C.near - rad) return false;
  const xc = x[0] * mx + x[1] * my + x[2] * mz + x[9], yc = x[3] * mx + x[4] * my + x[5] * mz + x[10];
  const Fl = C.fl, xr = (K.BW - C.cx) / Fl, yt = C.cy / Fl, k = Math.sqrt(1 + xr * xr), ky = Math.sqrt(1 + yt * yt);
  if ((xc - xr * zc) / k > rad || (-xc - xr * zc) / k > rad) return false;
  if ((yc - yt * zc) / ky > rad || (-yc - yt * zc) / ky > rad) return false;
  return true;
}
/* per cell: 0 plain, 1 per-point window tests, 2 all thin, -1 skip */
function cellK(o, mx, my, mz, rad) {
  const md = o.xr; if (!md) return 0;
  const zo = XK.zo, zs = XK.zs, bx = XK.box;
  if (zo > 90) return md === 3 ? -1 : 0;
  const S = o.S; let qx = mx, qy = my, qz = mz;
  if (S) { qx = S.R[0] * mx + S.R[1] * my + S.R[2] * mz + S.T[0]; qy = S.R[3] * mx + S.R[4] * my + S.R[5] * mz + S.T[1]; qz = S.R[6] * mx + S.R[7] * my + S.R[8] * mz + S.T[2]; }
  if (qx + rad < bx[0] || qx - rad > bx[1] || qy + rad < bx[2] || qy - rad > bx[3] || qz + rad < bx[4] || qz - rad > bx[5]) return md === 3 ? -1 : 0;
  const inBox = qx - rad > bx[0] && qx + rad < bx[1] && qy - rad > bx[2] && qy + rad < bx[3] && qz - rad > bx[4] && qz + rad < bx[5];
  if (!inBox) return 1;
  const quiet = (qz - rad - zo > 6 || XK.ko < .01) && (zs - (qz + rad) > 1.6 || XK.ks < .01 || zs > 90);
  const openAll = qz - rad > zo && qz + rad < zs, shutAll = qz + rad < zo - .06 || qz - rad > zs + 1.6;
  if (md === 3) { if (shutAll) return -1; return openAll && quiet ? 0 : 1; }
  if (shutAll) return 0;
  return openAll && quiet ? 2 : 1;
}
function runK(P, i0, i1, sp, o, md, att, step) {
  const x = XMK, C = K.C, D = K.pb.d, F_ = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], near = C.near, BW = K.BW, BH = K.BH;
  const a00 = x[0], a01 = x[1], a02 = x[2], a10 = x[3], a11 = x[4], a12 = x[5], a20 = x[6], a21 = x[7], a22 = x[8], b0 = x[9], b1 = x[10], b2 = x[11];
  const ex = x[12], ey = x[13], ez = x[14], l0 = x[15], l1 = x[16], l2 = x[17];
  const A = o.a * att, keep = o.keep, eb = o.edge, amb = o.amb, back = o.back, bkeep = o.bk, useOcc = o.occ, occd = P_.occd;
  const base = o.col || WH, lm = o.lime;
  const cr0 = base[0] + (LIME[0] - base[0]) * lm, cg0 = base[1] + (LIME[1] - base[1]) * lm, cb0 = base[2] + (LIME[2] - base[2]) * lm;
  const heat = o.heat, HZ = o.HZ, hz0 = o.hz0, hk = 5 / o.hL, scz = o.scan ? SCZ : 99;
  const zo = XK.zo, zs = XK.zs, ko_ = XK.ko, ks_ = XK.ks, bx = XK.box, S = o.S, omd = o.xr;
  const pt = o.portal, py0 = pt ? pt[0] : 0, phx = pt ? pt[1] : 0, phz = pt ? pt[2] : 0, pdy = pt ? pt[3] : 0, pdx = pt ? pt[4] : 0, pdz = pt ? pt[5] : 0;
  for (let i = i0, j = i0 * 6; i < i1; i += step, j += 6 * step) {
    const hs = (i * .6180339887) % 1;
    if (keep < 1 && hs > keep) continue;
    const px = P[j], py = P[j + 1], pz = P[j + 2], nx = P[j + 3], ny = P[j + 4], nz = P[j + 5], two = nx === 0 && ny === 0 && (nz === 0 || nz > 1.5);
    if (pt) {
      const yy = py + pdy;
      if (yy < py0) { const ey2 = ey + pdy; if (ey2 <= py0) continue; const t = (ey2 - py0) / (ey2 - yy), ix = ex + t * (px - ex) + pdx, iz = ez + t * (pz - ez) + pdz; if (ix < -phx || ix > phx || iz < -phz || iz > phz) continue; }
    }
    let dn = 0;
    if (!two) { dn = nx * (px - ex) + ny * (py - ey) + nz * (pz - ez); if (dn > 0 && (bkeep === 0 || ((i * .7548776662) % 1) > bkeep)) continue; }
    let k = 0, thin = md === 2;
    if (scz < 90) {
      const qz = S ? S.R[6] * px + S.R[7] * py + S.R[8] * pz + S.T[2] : pz, d = qz - scz;
      if (d > -.06 && d < 1.6) k = .95 * (d < .08 ? 1 : Math.exp(-(d - .08) * 2.4));
    }
    if (md === 1) {
      let qx = px, qy = py, qz = pz;
      if (S) { qx = S.R[0] * px + S.R[1] * py + S.R[2] * pz + S.T[0]; qy = S.R[3] * px + S.R[4] * py + S.R[5] * pz + S.T[1]; qz = S.R[6] * px + S.R[7] * py + S.R[8] * pz + S.T[2]; }
      if (qx > bx[0] && qx < bx[1] && qy > bx[2] && qy < bx[3] && qz > bx[4] && qz < bx[5]) {
        const open = qz > zo && qz < zs;
        let d = qz - zo;
        if (d > -.05 && d < 6) k = ko_ * (d < 0 ? 1 + d / .05 : d < .15 ? 1 : Math.exp(-(d - .15) * .9) * .75);
        d = qz - zs;
        if (d > -.05 && d < 1.5) { const k2 = ks_ * (d < 0 ? 1 + d / .05 : d < .1 ? 1 : Math.exp(-(d - .1) * 3.5) * .7); if (k2 > k) k = k2; }
        if (omd === 3) { if (!open && k < .2) continue; }
        else if (open && k < .3) { if (hs > .34) continue; thin = true; }
      } else if (omd === 3) continue;
    }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const iz = F_ / zc;
    const sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz; if (sx < 0 || sx >= BW) continue;
    const sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz; if (sy < 0 || sy >= BH) continue;
    if (useOcc && occd(sx, sy, zc)) continue;
    let b;
    if (two) b = nz > 1.5 ? eb * (nz - 2) : eb;
    else if (dn > 0) b = back;
    else {
      let fac = -dn / zc; if (fac > 1) fac = 1;
      const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
      b = .06 + amb + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
    }
    b *= A;
    if (thin) b = .045 + .2 * b;
    let r = cr0, g = cg0, bl = cb0;
    if (heat > 0) {
      let f = (pz - hz0) * hk; if (f < 0) f = 0; else if (f > 4.999) f = 4.999;
      const fi = f | 0, h = (HZ[fi] + (HZ[fi + 1] - HZ[fi]) * (f - fi)) * heat;
      if (h > .01) {
        const h1 = h * 2.6 > 1 ? 1 : h * 2.6, h2 = h > .62 ? 1 : h > .3 ? (h - .3) / .32 : 0;
        r += (LIME[0] - r) * h1; g += (LIME[1] - g) * h1; bl += (LIME[2] - bl) * h1;
        r += (HOT[0] - r) * h2; g += (HOT[1] - g) * h2; bl += (HOT[2] - bl) * h2;
        b = b * (1 + 1.6 * h) + .8 * h * att;
      }
    }
    if (k > 0) { if (b < k * .95) b = k * .95; r += (LIME[0] - r) * k; g += (LIME[1] - g) * k; bl += (LIME[2] - bl) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = r * b, G_ = g * b, B_ = bl * b;
    if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
    if (sp * iz > 6.5 && sx < BW - 1 && sy < BH - 1) {
      const R2 = R_ * .7, G2 = G_ * .7, B2 = B_ * .7;
      let q2 = q + 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
      q2 = q + BW * 4; if (D[q2] < R2) D[q2] = R2; if (D[q2 + 1] < G2) D[q2 + 1] = G2; if (D[q2 + 2] < B2) D[q2 + 2] = B2;
    }
  }
}
/* draw a cloud: LOD per cell (dots at most px apart), extinction per cell (fog: m; sub: viewed from above the surface,
   m of water over it), Tw model -> world */
/* the focus: chunks away from the camera's subject dimmed (inserts only) */
const FOC = { on: false, p: [0, 0, 0], r: 2, f: 1.4, lo: .24 };
function drawK(ml, Tw, o) {
  const x = XMK = K.prep(Tw), C = K.C, CH = ml.ch, SD = ml.sd, nl = ml.nl, Fl = C.fl;
  const PX = o.px / K.DQ / Math.sqrt(Math.max(.05, o.keep)), ex = x[12], ey = x[13], ez = x[14], M = Tw.R, t = Tw.T;
  for (let c = 0; c < ml.nch; c++) {
    const q = c * SD, mx = CH[q], my = CH[q + 1], mz = CH[q + 2], rad = CH[q + 3];
    if (!sphereInK(x, mx, my, mz, rad)) continue;
    const dx = mx - ex, dy = my - ey, dz = mz - ez, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let att = 1;
    if (o.fog > 0) { att = Math.exp(-Math.max(0, dist - rad) / o.fog); if (att < .03) continue; }
    if (o.sub > 0) { const wy = M[3] * mx + M[4] * my + M[5] * mz + t[1]; if (wy < 0) { att *= Math.exp(wy / o.sub); if (att < .03) continue; } }
    let fk = 1;
    if (o.foc && FOC.on) {                                       // the subject in focus, the rest dimmed (and sampled sparser)
      const wx = M[0] * mx + M[1] * my + M[2] * mz + t[0] - FOC.p[0], wy = M[3] * mx + M[4] * my + M[5] * mz + t[1] - FOC.p[1], wz = M[6] * mx + M[7] * my + M[8] * mz + t[2] - FOC.p[2];
      fk = Math.exp(-Math.max(0, Math.sqrt(wx * wx + wy * wy + wz * wz) - rad * .6 - FOC.r) / FOC.f);
      att *= FOC.lo + (1 - FOC.lo) * fk;
    }
    const md = cellK(o, mx, my, mz, rad); if (md < 0) continue;
    const d = Math.max(.05, dist - rad * .7);
    // (the LOD crossfaded over K.LODB of each octave: K.lodPick, each level on its own share of the keep dither)
    const LP = K.lodPick(ml.sp, nl, Fl, d, PX * 1.3 * (1 + 1.4 * (1 - fk)), 0, K.LODB), la = LP.a, lb = LP.b, wa = LP.wa, wb = LP.wb, kp = o.keep, st = md === 2 ? 3 : 1;
    let i0 = CH[q + 4 + la * 2], i1 = CH[q + 5 + la * 2];
    if (i1 > i0) { o.keep = kp * wa; runK(ml.lv[la], i0, i1, ml.sp[la], o, md, att, st); NPK += (i1 - i0) / st; }
    if (lb >= 0) { i0 = CH[q + 4 + lb * 2]; i1 = CH[q + 5 + lb * 2]; if (i1 > i0) { o.keep = kp * wb; runK(ml.lv[lb], i0, i1, ml.sp[lb], o, md, att, st); NPK += (i1 - i0) / st; } }
    o.keep = kp;
  }
}

/* ================= the sink's state =================
   dep: the doors and the frames per cell (0 stowed .. 1 out), from the inserts' clocks; the heat: the coolant's
   temperature leaving the power room th (0 the sea's 17 °C .. 1 about 150 °C), each point of the loop seeing it
   s / VH later (s: its run from the room) */
function thB(T) {                                            // base time: the slug after the shot, then the store's bleed
  const t = T - (TF + .3); if (t <= 0) return 0;
  return (1 - Math.exp(-t / .25)) * (.86 * Math.exp(-t / 4.6) + .14 * Math.exp(-t / 50));
}
/* RGKR's beats (u): the purge (pumps to full flow, the stored heat sent down as one slug), the stow */
const UR = { xo0: 4.6, xo1: 6.6, pg: 7.4, hold: 1.8, tau: 3.4, shut: 21.6, vlv: 22.4, ext: 23.4, xc0: 10.8, xc1: 12.4 };
const PG0 = UR.pg;
function thR(u) {
  const bleed = thB(T_RET + u) * (1 - ss(PG0, PG0 + 2.5, u)), t = u - PG0;
  if (t <= 0) return bleed;
  return Math.max(bleed, ss(0, .7, t) * .95 * (t < UR.hold ? 1 : Math.exp(-(t - UR.hold) / UR.tau)));
}
const flowR = u => .25 + .75 * ss(PG0 - .5, PG0 + .3, u) * (1 - ss(UR.shut, UR.shut + 1.2, u));
/* the sink clock: base T, or the insert's u (RGKR u < 0 reads the base) */
let CLK = 0, CMODE = 0;                                      // CMODE 0 base, 1 RGKD, 2 RGKR
const thAt = t => CMODE === 2 ? thR(t) : CMODE === 1 ? 0 : thB(t);
/* RGKD's beats (u): the lower hull's X-ray opens, the mains' isolation valves open and the coolant starts down the hot
   main (the filling front), the lens goes under, the supply pumps start, the front runs out along the header opening
   the branch valves, the followed cell (FOL: starboard, the third from aft) opens and its bundle runs out, the rest
   follow, the keel bays, the scan, the window shuts, up */
const FOL = 2;
const UD = { xo0: 2.4, xo1: 5.0, mvH: 4.9, mvC: 5.5, front: 6.3, room0: 6.6, room1: 8.2, pump: 12.4, unl: 26.0, door: 26.4, ext: 29.4,
  bay: 33.4, kex: 35.2, sc0: 43.6, sc1: 46.8, xc0: 24.4, xc1: 26.6 };
const DDUR = 2.7, EDUR = 5.2, BDUR = 1.7, KDUR = 4.6;        // door swing, frame run, bay leaves, keel frames (s)
/* the scan: a lime plane runs the sink bow -> stern once it is out, each bundle boxed as it passes (ship z; 99 off) */
let SCZ = 99;
const scanAt = u => DM === 1 && u > UD.sc0 && u < UD.sc1 + .8 ? 57.8 - 29.6 * E.sat((u - UD.sc0) / (UD.sc1 - UD.sc0)) : 99;
const D_DOOR = (s, i) => s > 0 && i === FOL ? UD.door : UD.door + 1.3 + .34 * Math.abs(i - FOL) + (s < 0 ? .22 : 0);
const D_EXT = (s, i) => s > 0 && i === FOL ? UD.ext : UD.ext + .5 + .3 * Math.abs(i - FOL) + (s < 0 ? .16 : 0);
const D_BAY = b => UD.bay + .5 * b, D_KEX = b => UD.kex + .5 * b;
const R_EXT = (s, i) => UR.ext + .16 * (NSC - 1 - i) + (s < 0 ? .1 : 0), R_DOOR = (s, i) => R_EXT(s, i) + 3.1, R_KEX = b => UR.ext - .2 + .3 * b, R_BAY = b => R_KEX(b) + 3.4;
const RXDUR = 3.0, RDDUR = 2.1;
const DS = { door: new Float64Array(2 * NSC), ext: new Float64Array(2 * NSC), bay: new Float64Array(3), kex: new Float64Array(3), pump: 0, pumpR: 0, pump2: 0, pumpR2: 0,
  valve: new Float64Array(64), mv: new Float64Array(2), chk: new Float64Array(4), flow: 0, front: 1e9, phi: 0, xk: 0 };
/* the filling front (RGKD): the coolant's reach along the loop (m of run), tabulated; the branch valves open as it
   reaches them; the return pumps start as it reaches them */
let FRT = null; const FDT = .02;
let T_RPUMP = 0;
function buildFront() {
  const n = Math.ceil(LEN_D / FDT) + 2; FRT = new Float64Array(n);
  let f = 0; const pin = S_PIN;
  for (let i = 0; i < n; i++) {
    const u = i * FDT, v = u < UD.front ? 0 : u < UD.pump + .4 ? .8 : .8 + .9 * ss(UD.pump + .4, UD.pump + 1.8, u);
    f += v * FDT; if (u < UD.pump + .4) f = Math.min(f, pin);
    FRT[i] = f;
  }
  const tOf = s => { for (let i = 0; i < n; i++) if (FRT[i] >= s) return i * FDT; return LEN_D; };
  for (const v of VALVES) if (v.end < 0) v.t = tOf(v.s - .25);
  for (const v of VALVES) if (v.end > 0) v.t = VALVES.find(w => w.b === v.b && w.end < 0).t + .2;
  T_RPUMP = tOf(S_RET + 11);
}
const frontAt = u => { const f = u / FDT, i = Math.min(FRT.length - 2, Math.max(0, Math.floor(f))); return FRT[i] + (FRT[i + 1] - FRT[i]) * (f - i); };
function sinkState(mode, u, T) {
  const s = DS;
  CMODE = mode;
  if (mode === 0) {
    const on = T >= T_RAIL && T < T_RET ? 1 : 0;
    s.door.fill(on); s.ext.fill(on); s.bay.fill(on); s.kex.fill(on);
    s.pumpR = on ? (T < TF + 12 && T > TF ? 1 : .25) : 0; s.pump = on ? T * 14 * s.pumpR : 0; s.pumpR2 = s.pumpR; s.pump2 = s.pump * .9;
    s.valve.fill(on); s.mv.fill(on); s.chk.fill(on * s.pumpR); s.flow = on ? s.pumpR : 0; s.front = 1e9; s.phi = T * (.8 + 2.4 * s.pumpR); CLK = T;
    return s;
  }
  CELLS.forEach((c, k) => {
    if (mode === 1) { s.door[k] = kk(u, D_DOOR(c.s, c.i), D_DOOR(c.s, c.i) + DDUR); s.ext[k] = kk(u, D_EXT(c.s, c.i), D_EXT(c.s, c.i) + EDUR); }
    else { s.door[k] = 1 - kk(u, R_DOOR(c.s, c.i), R_DOOR(c.s, c.i) + RDDUR); s.ext[k] = 1 - kk(u, R_EXT(c.s, c.i), R_EXT(c.s, c.i) + RXDUR); }
  });
  for (let b = 0; b < 3; b++) {
    if (mode === 1) { s.bay[b] = kk(u, D_BAY(b), D_BAY(b) + BDUR); s.kex[b] = kk(u, D_KEX(b), D_KEX(b) + KDUR); }
    else { s.bay[b] = 1 - kk(u, R_BAY(b), R_BAY(b) + BDUR); s.kex[b] = 1 - kk(u, R_KEX(b), R_KEX(b) + RXDUR); }
  }
  if (mode === 1) {
    // the impellers' angle: the integral of their (visual) rate, spun up over 1.6 s
    const sp = (t0, w) => { const t = u - t0, x = t / 1.6; return t <= 0 ? 0 : w * (t < 1.6 ? 1.6 * (x * x * x - x * x * x * x / 2) : .8 + t - 1.6); };
    s.pumpR = ss(UD.pump, UD.pump + 1.6, u); s.pump = sp(UD.pump, 15);
    s.pumpR2 = ss(T_RPUMP, T_RPUMP + 1.6, u); s.pump2 = sp(T_RPUMP, 15);
    s.flow = ss(UD.front - .3, UD.front + .3, u); s.front = frontAt(u); s.phi = s.front;
    for (let v = 0; v < VALVES.length; v++) s.valve[v] = kk(u, VALVES[v].t, VALVES[v].t + .55);
    s.mv[0] = kk(u, UD.mvH, UD.mvH + 1.4); s.mv[1] = kk(u, UD.mvC, UD.mvC + 1.4);
    for (let k = 0; k < 4; k++) s.chk[k] = k < 2 ? kk(u, UD.pump + .5, UD.pump + 1.3) : kk(u, T_RPUMP + .5, T_RPUMP + 1.3);
    CLK = u;
  } else {
    s.pumpR = s.pumpR2 = flowR(u); s.pump = 4 * u + 11 * Math.max(0, Math.min(u, UR.shut + .6) - PG0); s.pump2 = s.pump * .93;
    s.flow = flowR(u) * (1 - ss(UR.vlv, UR.vlv + .8, u)); s.front = 1e9; s.phi = tabAt(PHF, u);
    s.valve.fill(1 - kk(u, UR.vlv, UR.vlv + .6)); s.mv.fill(1 - kk(u, UR.vlv + .2, UR.vlv + 1.4));
    s.chk.fill(.35 + .65 * ss(PG0 - .5, PG0 + .3, u)); for (let k = 0; k < 4; k++) s.chk[k] *= 1 - ss(UR.shut, UR.shut + 1, u);
    CLK = u;
  }
  return s;
}
/* the transforms of the moving parts (world), per frame */
const XFK = { cell: [], bun: [], door: [], leaf: [] };
const Q1 = [0, 0, 0], Q2 = [0, 0, 0], Q3 = [0, 0, 0];
const trY = (F_, y, z) => X.mul(F_, X.make(R.I(), [0, y, z || 0]));
function bundleXf(b, s) {
  if (b.kind === 0) { const k = CELLS.indexOf(b.c); return trY(b.c.F, Y_SB + EXT_S * s.ext[k]); }
  return trY(b.c.F, Y_KB + EXT_K * s.kex[b.c.i]);
}
/* the heat along a bundle now: th at 6 stations inlet -> outlet, the coolant cooling 35 % along the tubes */
function bundleHeat(b) {
  for (let k = 0; k < 6; k++) { const f = k / 5; b.HZ[k] = thAt(CLK - (b.s0 + f * b.L) / VH) * (1 - .35 * f); }
  b.th = b.HZ[2] * .6 + b.HZ[3] * .4;
  return b.th;
}

/* ================= clouds ================= */
const CLK_ = {};
function buildClouds() {
  CLK_.hullA = [-1, 1].map(sd => mk(LHA, (o, sp, li) => shell(o, 28.0, 58.2, sp, li, sd), 1.1));
  CLK_.hullB = [-1, 1].map(sd => mk(LHB, (o, sp, li) => { shell(o, HZ0, 28.0, sp, li, sd); shell(o, 58.2, Z_ST - .05, sp, li, sd); }, 2.2));
  CLK_.dome = mk(LHB, (o, sp) => dome(o, sp), 1.6);
  CLK_.doors = CELLS.map(c => mk(LD, (o, sp) => doorPts(c, o, sp), .7));
  CLK_.leaves = []; for (const zb of BY_Z) for (const s of [1, -1]) CLK_.leaves.push(mk(LD, (o, sp) => leafPts(zb, s, o, sp), .7));
  CLK_.wellS = mk(LW, (o, sp) => wellS(o, sp), .7);
  CLK_.wellK = mk(LW, (o, sp) => wellK(o, sp), .7);
  CLK_.side = mk(LT, (o, sp, li) => bundlePts(SB, o, sp, li), .45);
  CLK_.keel = mk(LT, (o, sp, li) => bundlePts(KB, o, sp, li), .5);
  CLK_.stS = [.08, .065, .05].map(w => prims(stagePrims(LS_S, w), LM, .4));
  CLK_.stK = [.1, .082, .065].map(w => prims(stagePrims(LS_K, w), LM, .4));
  const IN = interior(); CLK_.inside = prims(IN.P, LI, .9); CLK_.inStruct = prims(IN.PS, LIS, 1.2); CLK_.inCells = prims(IN.PJ, LI, .7); CLK_.inMach = prims(IN.PM, LMF, .5);
  CLK_.coupling = prims([G.lathe([0, 0, 0], [0, 1, 0], [[0, .1], [.14, .1]], {}), ...[0, 1, 2, 3, 4, 5].map(k => { const a = k / 6 * TAU; return G.line([[0, .07, 0], [Math.cos(a) * .1, .07, Math.sin(a) * .1]]); })], LT, .3);
  // the impeller (in its volute: hub, back shroud, six backward-curved vanes) and the motor's fan (seven blades)
  const vane = (a0, y) => { const L = []; for (let k = 0; k <= 8; k++) { const r = .055 + .17 * k / 8, a = a0 + 1.05 * k / 8; L.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return L; };
  CLK_.impeller = prims([G.lathe([0, -.045, 0], [0, 1, 0], [[0, .055], [.09, .055]], { caps: true }), G.lathe([0, -.045, 0], [0, 1, 0], [[0, .225], [.008, .225]], {}),
    ...[0, 1, 2, 3, 4, 5].flatMap(k => { const a = k / 6 * TAU; return [G.line(vane(a, -.04)), G.line(vane(a, .035)), G.line([vane(a, -.04)[8], vane(a, .035)[8]])]; })], LT, .3);
  CLK_.fan = prims([G.lathe([0, 0, 0], [0, 1, 0], [[0, .045], [.05, .045]], { caps: true }), ...[0, 1, 2, 3, 4, 5, 6].map(k => { const a = k / 7 * TAU; return G.line([[Math.cos(a) * .05, .02, Math.sin(a) * .05], [Math.cos(a + .25) * .18, .045, Math.sin(a + .25) * .18], [Math.cos(a + .55) * .18, .01, Math.sin(a + .55) * .18], [Math.cos(a + .35) * .05, 0, Math.sin(a + .35) * .05]]); })], LT, .3);
}

/* ================= drawing ================= */
const opt = (k, o) => ko(o);                                 // (options filled from the defaults, one pass at a time)
let UW = false;                                              // the lens is under the water
/* the underwater look of what is beyond the surface: dim it (the window overhead lets ~half through, total internal
   reflection outside it almost nothing); the background kept */
let D32 = null, B32 = null;
function veil() {
  if (!D32 || D32.buffer !== K.pb.d.buffer) { D32 = new Uint32Array(K.pb.d.buffer); B32 = new Uint32Array(K.pb.bg.buffer); }
  const C = K.C, f = C.f, r = C.r, u = C.u, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], c2 = .661 * .661;
  const qa = r[1] * r[1] - c2;
  const BW = K.BW, BH = K.BH;
  for (let y = 0; y < BH; y++) {
    const b = (y + .5 - cy) / Fl, A0 = f[1] - b * u[1];
    // up-going: A0 + a r_y > 0
    let a0 = -1e9, a1 = 1e9;
    if (Math.abs(r[1]) < 1e-9) { if (A0 <= 0) continue; } else if (r[1] > 0) a0 = -A0 / r[1]; else a1 = -A0 / r[1];
    let x0 = Math.max(0, Math.ceil(cx + a0 * Fl - .5)), x1 = Math.min(BW - 1, Math.floor(cx + a1 * Fl - .5));
    if (x1 < x0) continue;
    // inside the window: (A0 + a ry)^2 > c2 (1 + a^2 + b^2)
    const qb = 2 * A0 * r[1], qc = A0 * A0 - c2 * (1 + b * b);
    let w0 = 1, w1 = 0;
    if (Math.abs(qa) > 1e-9) { const disc = qb * qb - 4 * qa * qc; if (disc > 0) { const sq = Math.sqrt(disc); let r0 = (-qb - sq) / (2 * qa), r1 = (-qb + sq) / (2 * qa); if (r0 > r1) { const t = r0; r0 = r1; r1 = t; } if (qa < 0) { w0 = Math.ceil(cx + r0 * Fl - .5); w1 = Math.floor(cx + r1 * Fl - .5); } else { /* outside the roots: rare (looking straight up) */ w0 = 0; w1 = BW - 1; } } else if (qa > 0) { w0 = 0; w1 = BW - 1; } }
    const row = y * BW;
    for (let xx = x0; xx <= x1; xx++) {
      const i = row + xx, p = D32[i];
      if ((p & 0x00C0C0C0) === 0) continue;                 // background and near-black dots: left as they are
      const bg = B32[i];
      if (xx >= w0 && xx <= w1) D32[i] = ((p >>> 2) & 0x003F3F3F) + (bg - ((bg >>> 2) & 0x003F3F3F));
      else D32[i] = ((p >>> 4) & 0x000F0F0F) + (bg - ((bg >>> 4) & 0x000F0F0F));
    }
  }
}
/* the hull's occluders (shrunk trapezoid slices), none where the X-ray window is open */
const OSL = [4, 14, 22, 30, 37, 44, 51, 57.5, 63];
let OCC_C = null;
function occBuild() {
  OCC_C = [];
  for (let i = 0; i < OSL.length - 1; i++) {
    const sec = z => { const W = wl(z) - 1.15, D = dk(z) - 1.15, xb = Math.max(.1, hbAt(z, -D) - 1.15 * .7); return [[-W, -.15, z], [W, -.15, z], [xb, -D, z], [-xb, -D, z]]; };
    const a = sec(OSL[i]), b = sec(OSL[i + 1]);
    if (a[1][0] < .3 || b[1][0] < .3) continue;
    OCC_C.push({ z0: OSL[i], z1: OSL[i + 1], P: a.concat(b) });
  }
}
function occHull(Ws) {
  const open = XK.zo < 90;
  for (const o of OCC_C) {
    // (smooth: a slice the window reaches fades out over 2 m of the window's sweep instead of switching off)
    let s = 1;
    if (open && o.z1 > XK.box[4] && o.z0 < XK.box[5]) s = K.SMOOTH ? 1 - E.sat((o.z1 - XK.zo) / 2) * (XK.zs > 90 ? 1 : E.sat((XK.zs - o.z0) / 2)) : !(o.z1 < XK.zo || o.z0 > XK.zs) ? 0 : 1;
    if (s > .001) P_.occHex(o.P.map(p => X.ap(Ws, p)), s);
  }
}
let PER6 = 6, PER12 = 12;
/* caustics: two drifting layers of a tiled web pattern (128 x 128 over 9 m) */
let CAU = null; const CN = 128, CS = CN / 9;
function buildCau() {
  CAU = new Float32Array(CN * CN);
  for (let i = 0; i < CN; i++) for (let j = 0; j < CN; j++) {
    const x = i / CN * TAU, z = j / CN * TAU;
    const v = Math.abs(Math.sin(2 * x + Math.sin(3 * z) * .9) + Math.sin(3 * z + Math.sin(2 * x + 1) * .8) + .6 * Math.sin(x + 4 * z));
    CAU[i * CN + j] = Math.pow(Math.max(0, 1 - v / 1.2), 2.2);
  }
}
const cauAt = (x, z) => CAU[(((x * CS) | 0) & (CN - 1)) * CN + (((z * CS) | 0) & (CN - 1))];
const caus = (x, z, t) => { const a = cauAt(x + .31 * t + 900, z + .17 * t + 900), b = cauAt(.83 * x - .23 * t + 1700, .91 * z + .29 * t + 1700); return Math.sqrt(a * b) * 1.4 + .25 * (a + b); };
/* the sea surface from below: a bright rippling ceiling, the window overhead (48.6°) lit, its rim brightest, ripple
   crests and caustics running. Screen-space sampling every 6 px, each sample snapped to a world-anchored node (the pitch
   doubling with distance, so the dots stay ~6 px apart and do not swim); none inside the hull's waterline. Tables
   for the sines and the patterns (no trig per dot) */
const SNT = new Float32Array(4096); for (let i = 0; i < 4096; i++) SNT[i] = Math.sin(i / 4096 * TAU);
const sinT = x => SNT[((x * 651.8986) | 0) & 4095];
const ih = (a, b) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(a ^ b, 83492791)) >>> 0;
let CRT = null;                                            // ripple crests: wavy bright lines, 128 x 128 over 12 m
function buildCrest() {
  CRT = new Float32Array(CN * CN);
  for (let i = 0; i < CN; i++) for (let j = 0; j < CN; j++) {
    const x = i / CN * TAU, z = j / CN * TAU, v = .5 + .5 * Math.sin(3 * x + .9 * Math.sin(2 * z) + .4 * Math.sin(5 * z + 1));
    CRT[i * CN + j] = Math.pow(v, 7);
  }
}
const CRS = CN / 12, crAt = (x, z) => CRT[(((x * CRS) | 0) & (CN - 1)) * CN + (((z * CRS) | 0) & (CN - 1))];
const CEIL = [0, 0, 0];
function ceiling(TR, a) {
  const C = K.C, e = C.eye, f = C.f, r = C.r, u = C.u, Fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], occd = P_.occd, D = K.pb.d;
  const sw = TR * TAU / PER12, t = TR, ST = 6, ey = e[1];
  if (ey > -.05) return;
  const o1x = .9 * t + 900, o1z = .5 * t + 900, o2x = -.6 * t + 1700, o2z = .8 * t + 1700;
  const BW = K.BW, BH = K.BH, SM = K.SMOOTH;
  for (let py = 3; py < BH; py += ST) {
    const bb = (py - cy) / Fl, A0 = f[1] - bb * u[1];
    if (A0 + (-cx / Fl) * r[1] <= .02 && A0 + ((BW - 1 - cx) / Fl) * r[1] <= .02) continue;
    const gx = f[0] - bb * u[0], gz = f[2] - bb * u[2];
    for (let px = 3 + ((py / ST) & 1) * 3; px < BW; px += ST) {
      const aa = (px - cx) / Fl, dy = A0 + aa * r[1]; if (dy <= .02) continue;
      const tt = -ey / dy, hx = e[0] + (gx + aa * r[0]) * tt, hz = e[2] + (gz + aa * r[2]) * tt;
      const pw = tt * ST * 1.1 / Fl; let pitch = .03; while (pitch < pw) pitch *= 2;
      let ix = Math.round(hx / pitch), iz = Math.round(hz / pitch);
      // (smooth: between two pitches a sample keeps the finer node unless its coarse node's hash says the coarse
      // grid has reached it, so the pattern dissolves from one pitch to the next instead of jumping)
      if (SM && pitch > .03 && (ih(ix + 7919, iz) & 1023) / 1023 >= Math.log2(pw / (pitch * .5))) { pitch *= .5; ix = Math.round(hx / pitch); iz = Math.round(hz / pitch); }
      const x = ix * pitch, z = iz * pitch;
      if (z > -80 && z < Z_ST + 1 && Math.abs(x) < wlT(z) + .05) continue;
      const y = .45 * sinT(sw + z * .011 + x * .004);
      const dx = x - e[0], dY = y - ey, dz = z - e[2], zc = dx * f[0] + dY * f[1] + dz * f[2]; if (zc < .2) continue;
      const iz_ = Fl / zc, sx = cx + (dx * r[0] + dY * r[1] + dz * r[2]) * iz_; if (sx < 0 || sx >= BW) continue;
      const sy = cy - (dx * u[0] + dY * u[1] + dz * u[2]) * iz_; if (sy < 0 || sy >= BH) continue;
      if (occd(sx, sy, zc)) { CEIL[2]++; continue; }
      const dl2 = dx * dx + dY * dY + dz * dz, c2 = dY * dY / dl2;
      const win = c2 > .49 ? 1.6 : c2 > .437 ? 1.6 + 1.2 * (.49 - c2) / .053 : .85 + .6 * c2 / .437;
      const cr = Math.max(crAt(x + o1x, z + o1z), crAt(z * .8 + o2x, x * .9 + o2z)), ca = caus(x, z, t);
      const j1 = (ih(ix + pitch * 977 | 0, iz) & 1023) / 1023;
      const b = (.2 + 1.3 * cr + .7 * ca + .1 * j1) * win * (1 - Math.sqrt(dl2) / 90) * a;
      if (b < .025) { CEIL[1]++; continue; }
      CEIL[0]++;
      const bv = b > 1 ? 1 : b, q = ((sy | 0) * BW + (sx | 0)) << 2, R_ = 236 * bv, G_ = 240 * bv, B_ = 232 * bv;
      if (D[q] < R_) D[q] = R_; if (D[q + 1] < G_) D[q + 1] = G_; if (D[q + 2] < B_) D[q + 2] = B_;
      if (zc < 7 && cr > .3 && sx < BW - 1 && sy < BH - 1) { const q2 = q + 4, q3 = q + BW * 4; if (D[q2] < R_) { D[q2] = R_; D[q2 + 1] = G_; D[q2 + 2] = B_; } if (D[q3] < R_) { D[q3] = R_; D[q3 + 1] = G_; D[q3 + 2] = B_; } }
    }
  }
}
/* marine snow: a periodic box of drifting motes round the lens */
let SNOW = null;
function snow(TR, a) {
  const C = K.C, e = C.eye, Lb = 26, n = SNOW.length / 5, occd = P_.occd;
  for (let i = 0; i < n; i++) {
    const o = i * 5;
    let x = SNOW[o] + .05 * TR, y = SNOW[o + 1] + .018 * TR * (SNOW[o + 3] - .5) + .08 * Math.sin(TR * .4 + SNOW[o + 4]), z = SNOW[o + 2] - .11 * TR;
    x = e[0] + ((((x - e[0]) % Lb) + 1.5 * Lb) % Lb) - Lb / 2; y = e[1] + ((((y - e[1]) % Lb) + 1.5 * Lb) % Lb) - Lb / 2; z = e[2] + ((((z - e[2]) % Lb) + 1.5 * Lb) % Lb) - Lb / 2;
    if (y > -.3) continue;
    if (!K.pj(x, y, z)) continue;
    const zc = K.PJ[2]; if (occd(K.PJ[0], K.PJ[1], zc)) continue;
    const b = (.18 + .5 * SNOW[o + 3] * SNOW[o + 3]) * Math.exp(-zc / 18) * a; if (b < .02) continue;
    K.dot(K.PJ[0], K.PJ[1], zc < 1.6 && SNOW[o + 3] > .7 ? 2 : 1, 220, 230, 222, b);
  }
}
/* bubble plumes off the hot banks: sources on each bundle, streams rising at ~0.8 m/s (they grow and wander), bursting
   at the surface; their brightness from the heat at the source when each left it */
let SRC = null;                                              // per bundle: Float32Array (x', y', z', phase, speed) * n
const NSRC_S = 16, NSRC_K = 22, NBB = 38;
const BW_ = [0, 0, 0];
/* rise time of a source's stream to the surface (s), and its path: free rise; under the keel up to the bottom, then
   creeping out along the hull and up the side; beside the hull, sliding up it */
const BV = s4 => .9 + .6 * s4;
function riseT(b, y0, z0, v) { if (b.kind === 0) return -y0 / v + .4; const aHit = Math.max(0, (-dk(z0) + .05 - y0) / v); return aHit + girth(z0) / (v * .9) + .4; }
const BP = [0, 0, 0];
function bubbleAt(b, S, o, age, v, out) {
  const y0 = BW_[1], x0 = BW_[0], z0 = BW_[2], sp = .025 + .035 * age, w = S[o + 3] * TAU + o * 1.7;
  const z = z0 + sp * Math.cos(age * 3.3 + w) - .06 * age;
  if (b.kind === 1) {
    const aHit = Math.max(0, (-dk(z0) + .05 - y0) / v);
    if (age > aHit) {
      const side = S[o] > 0 ? 1 : -1, L = v * .9 * (age - aHit), gl = girth(z), g = 1 - L / gl;
      if (g < .005) return false;
      hp(z, g, side, out); const wob = .06 + .05 * Math.sin(age * 3.1 + w);
      out[0] += side * wob * (g < .85 ? 1 : .6); out[1] -= (g > .85 ? .08 : 0); out[2] = z;
      return true;
    }
  }
  let x = x0 + sp * Math.sin(age * 4.1 + w) + .02 * age * Math.sign(x0 || 1);
  const y = y0 + v * age + .04 * age * age;
  if (y > -.05) return false;
  const hb = hbT(z, y) + .12;
  if (Math.abs(x) < hb && y > -dk(z) + .05) x = (x < 0 ? -1 : 1) * hb;
  out[0] = x; out[1] = y; out[2] = z; return true;
}
function bubbles(TR, fade, uw) {
  const occd = P_.occd;
  for (let bi = 0; bi < BUN.length; bi++) {
    const b = BUN[bi], Tw = XFK.bun[bi], S = SRC[bi], n = S.length / 5;
    for (let k = 0; k < n; k++) {
      const o = k * 5, f = (S[o + 2] + b.L / 2) / b.L;
      apI(Tw, S[o], S[o + 1], S[o + 2], BW_);
      if (BW_[1] > -.3) continue;
      const v = BV(S[o + 4]), Tr = riseT(b, BW_[1], BW_[2], v);
      for (let j = 0; j < NBB; j++) {
        const ph = ((TR / Tr + j / NBB + S[o + 3]) % 1 + 1) % 1, age = ph * Tr;
        const em = ss(.28, .72, thAt(CLK - age - (b.s0 + f * b.L) / VH));
        if (em < .02) continue;
        if (!bubbleAt(b, S, o, age + j * .013, v, BP)) continue;
        if (!K.pj(BP[0], BP[1], BP[2])) continue;
        const sx = K.PJ[0], sy = K.PJ[1], zc = K.PJ[2];
        if (occd(sx, sy, zc)) continue;
        const a = em * fade * (age < .12 ? age / .12 : 1) * (uw ? Math.exp(-zc / 34) : Math.exp(BP[1] / 1.4) * .7) * 1.8;
        if (a < .02) continue;
        const near = age < .5 ? b.th : 0, big = zc < 5 ? 3 : zc < 16 && (j % 3) !== 1 ? 2 : 1, c = near > .45 ? HOT : near > .2 ? LIME : WH;
        K.dot(sx, sy, big, c[0], c[1], c[2], Math.min(1, a * (.6 + .4 * S[o + 4])));
        if (big > 1 && a > .35) K.add(sx, sy, big + 3, 18, 26, 10, a * .6);
      }
    }
  }
}
/* where the plumes break the surface: a churn of dots, and steam rising off it (drifting aft and to port) */
function surface(TR, fade) {
  for (let bi = 0; bi < BUN.length; bi++) {
    const b = BUN[bi], Tw = XFK.bun[bi], S = SRC[bi], n = S.length / 5;
    for (let k = 0; k < n; k += 2) {
      const o = k * 5, f = (S[o + 2] + b.L / 2) / b.L;
      apI(Tw, S[o], S[o + 1], S[o + 2], BW_);
      const y0 = BW_[1], v = BV(S[o + 4]), Tr = riseT(b, y0, BW_[2], v) - .4; void y0;
      const t0 = CLK - Tr - (b.s0 + f * b.L) / VH, em = ss(.28, .72, thAt(t0)) * fade;
      let emS = em; for (let q = 1; q < 6; q++) { const v = ss(.28, .72, thAt(t0 - q * .7)) * Math.exp(-q * .7 / 2.6) * fade; if (v > emS) emS = v; }
      if (emS < .02) continue;
      const zs = BW_[2] - .09 * Tr * Tr * .5, s0 = Math.sign(BW_[0] || (k & 1 ? 1 : -1)), xs = s0 * Math.max(Math.abs(BW_[0]) + .1 * Tr, wlT(zs) + .25);
      const fr = Math.floor(TR * 14);
      for (let m = 0; m < 7; m++) {
        const h1 = hh(k * 3.1 + m, fr + bi * 7), h2 = hh(k * 1.7 + m * 2.3, fr + bi * 3), rr = .5 * Math.sqrt(h1), a = h2 * TAU;
        if (em > .02) K.dotW(xs + Math.cos(a) * rr, .05, zs + Math.sin(a) * rr, 1, WH, em * (.35 + .5 * h2));
      }
      for (let m = 0; m < 14; m++) {
        const ph = ((TR / 3.6 + m / 14 + S[o + 3] * 1.7) % 1 + 1) % 1, age = ph * 3.6, sp = .25 + .5 * age;
        const x = xs + sp * Math.sin(m * 2.1 + S[o + 3] * 9) - .35 * age, y = .15 + .8 * age, z = zs + sp * Math.cos(m * 1.7) - .5 * age;
        K.dotW(x, y, z, age < 1.2 ? 2 : 1, WH, emS * .7 * (1 - ph) * Math.min(1, ph * 8));
      }
    }
  }
}
function apI(Tw, x, y, z, out) {
  const M = Tw.R, t = Tw.T;
  out[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; out[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; out[2] = M[6] * x + M[7] * y + M[8] * z + t[2];
  return out;
}
/* coolant flow: dots streaming along the loop the way it runs (white; the hot slug HOT / lime as it passes, the return
   side cooled), only as far as the filling front has reached (its head lit); their phase is the coolant's own run */
function flowDots(Ws, s, TR, a) {
  if (s.flow < .02) return;
  const sp = .26, ph = ((s.phi % sp) + sp) % sp, fr = s.front;
  for (const p of PIPES) {
    const pl = p.pl;
    if (p.s0 > fr) continue;
    for (let d = ph; d < pl.L; d += sp) {
      if (p.s0 + d > fr) break;
      P_.polyAt(pl, d, Q2);
      if (!openAt(Q2[0], Q2[1], Q2[2])) continue;
      // a short dash along the pipe: lime on the supply side (the gun's heat going out), white coming back cold; the
      // hot slug white-hot
      const th = thAt(CLK - (p.s0 + d) / VH) * p.k, hs = p.k === 1;
      const c = th > .45 ? HOT : hs || th > .12 ? LIME : WH, A = a * depthA(Q2[1]) * s.flow * (hs ? 1 : .7);
      for (let q = 0; q < 3; q++) {
        if (q) P_.polyAt(pl, Math.max(0, d - q * .045), Q2);
        apI(Ws, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], q ? 1 : 2, c, A * (1 - .3 * q));
      }
      if (hs || th > .3) { P_.polyAt(pl, d, Q2); apI(Ws, Q2[0], Q2[1], Q2[2], Q1); P_.oglow(Q1[0], Q1[1], Q1[2], 7 + 10 * th, LIME, (.22 + .3 * th) * A); }
    }
    const hd = fr - p.s0;                                      // the front's head in this pipe
    if (hd > 0 && hd < pl.L && fr < 1e8) {
      P_.polyAt(pl, hd, Q2);
      if (openAt(Q2[0], Q2[1], Q2[2])) { apI(Ws, Q2[0], Q2[1], Q2[2], Q1); P_.odot(Q1[0], Q1[1], Q1[2], 3, LIME, a * depthA(Q2[1])); P_.oglow(Q1[0], Q1[1], Q1[2], 12, LIME, .45 * a * depthA(Q2[1])); }
    }
  }
}
const openAt = (x, y, z) => XK.zo < 90 && z > XK.zo && z < XK.zs && x > XK.box[0] && x < XK.box[1] && y > XK.box[2] && y < XK.box[3] && z > XK.box[4] && z < XK.box[5];
/* the view from above the water sees the X-ray's insides dimmed with their depth */
const depthA = y => UW ? 1 : Math.exp(y / 2.6);
/* tubes' flow (every fifth tube): dots along them, inlet -> outlet, as far as the front has reached */
function tubeFlow(s, TR, a, uw) {
  if (s.flow < .02) return;
  const sp = .3, ph0 = s.phi * .55;
  for (let bi = 0; bi < BUN.length; bi++) {
    const b = BUN[bi], B = b.kind ? KB : SB, Tw = XFK.bun[bi], W = (B.nw - 1) * B.p, D = (B.nd - 1) * B.p, ph = ((ph0 + bi * .07) % sp + sp) % sp;
    const reach = (s.front - b.s0) / B.L; if (reach <= 0) continue;
    const side = b.kind === 0, k = side ? CELLS.indexOf(b.c) : b.c.i, open = side ? s.door[k] : s.bay[k], zc0 = side ? b.c.zc : b.c.zb;
    if (open < .02 && !(XK.zo < 90 && zc0 > XK.zo && zc0 < XK.zs)) continue;
    if (!K.pj(Tw.T[0], Tw.T[1], Tw.T[2]) || K.PJ[2] > 40) continue;
    const ad = uw ? 1 : depthA(toShipY(Tw.T));
    for (let i = 2; i < B.nw; i += 5) for (let j = 1; j < B.nd; j += 3) {
      const x = -W / 2 + i * B.p, y = -D / 2 + j * B.p;
      for (let z = -B.L / 2 + ph; z < B.L / 2; z += sp) {
        const f = (z + B.L / 2) / B.L; if (f > reach) break;
        const h = (b.HZ[Math.min(4, Math.floor(f * 5))]);
        apI(Tw, x, y, z, Q1);
        P_.odot(Q1[0], Q1[1], Q1[2], 1, h > .5 ? HOT : h > .12 || f < .45 ? LIME : WH, ad * a * s.flow * (.6 + .4 * Math.min(1, h * 2)) * Math.exp(-K.PJ[2] / 30));
      }
    }
  }
}
let WS_ = null;
const toShipY = p => { const M = WS_.R, t = WS_.T; return M[1] * (p[0] - t[0]) + M[4] * (p[1] - t[1]) + M[7] * (p[2] - t[2]); };
/* hoses: from the cell's back wall (or the bay's top) to the header nozzles, slack folded in while stowed; tested
   against the opening like the rest of the cell; their flow as far as the front has reached */
const HL = [0, 0, 0], HE = [0, 0, 0];
function hoses(s, TR, a, flowA) {
  const C = K.C, Ws = XFK.ws, es = toShip(Ws, C.eye);
  for (let bi = 0; bi < BUN.length; bi++) {
    const b = BUN[bi], side = b.kind === 0, B = side ? SB : KB, F_ = b.c.F, k = side ? CELLS.indexOf(b.c) : b.c.i;
    const e = side ? s.ext[k] : s.kex[k], open = side ? s.door[k] : s.bay[k], zc0 = side ? b.c.zc : b.c.zb;
    const xin = XK.zo < 90 && zc0 > XK.zo - .5 && zc0 < XK.zs + .5;
    if (open < .01 && !xin) continue;
    // the eye in the cell frame (F orthonormal)
    const M = F_.R, dx = es[0] - F_.T[0], dy = es[1] - F_.T[1], dz = es[2] - F_.T[2];
    HE[0] = M[0] * dx + M[3] * dy + M[6] * dz; HE[1] = M[1] * dx + M[4] * dy + M[7] * dz; HE[2] = M[2] * dx + M[5] * dy + M[8] * dz;
    const y0p = side ? 0 : Y_KO, hx = side ? SC_H / 2 : BY_W, hz = side ? SC_L / 2 : BY_L / 2;
    const vis = (x, y, z) => { if (xin || y >= y0p) return true; if (HE[1] <= y0p) return false; const t = (HE[1] - y0p) / (HE[1] - y), ix = HE[0] + t * (x - HE[0]), iz = HE[2] + t * (z - HE[2]); return ix > -hx && ix < hx && iz > -hz && iz < hz; };
    const Fw = X.mul(Ws, F_);
    const yb = side ? Y_SB + EXT_S * e : Y_KB + EXT_K * e, md = (B.nd - 1) * B.p / 2 + .06;
    for (const end of [-1, 1]) {
      const zl = end * (B.L / 2 + B.hd / 2), y0 = side ? -SC_DEP : Y_KH, y1 = yb - md - .17;
      const slack = .18 + .45 * (1 - e), sx = side ? -1 : 1;
      const lp = (u, kq) => {
        const w = 1 - u, a3 = w * w * w, b3 = 3 * u * w * w, c3 = 3 * u * u * w, d3 = u * u * u;
        HL[0] = (b3 + c3) * slack * sx + kq * .035; HL[1] = a3 * y0 + b3 * (y0 + .25) + c3 * (y1 - .25) + d3 * y1; HL[2] = zl - (b3 + c3) * .12 * end;
        return HL;
      };
      for (const kq of [-1, 1]) for (let m = 0; m <= 30; m++) {
        const p = lp(m / 30, kq); if (!vis(p[0], p[1], p[2])) continue;
        apI(Fw, p[0], p[1], p[2], Q1);
        if (!K.pj(Q1[0], Q1[1], Q1[2])) continue;
        const zc = K.PJ[2]; if (P_.occd(K.PJ[0], K.PJ[1], zc)) continue;
        K.dot(K.PJ[0], K.PJ[1], zc < 6 ? 2 : 1, WH[0], WH[1], WH[2], a * (UW ? Math.exp(-zc / 40) : Math.exp(toShipY(Q1) / 2.6)) * .75);
      }
      // the coolant in it (inlet: from the wall to the bundle; outlet: back), as far as the front has reached
      const s0 = end < 0 ? b.s0 - 1.2 : b.s0 + B.L, reach = (s.front - s0) / 1.2;
      if (flowA > .02 && reach > 0) {
        const ph = ((s.phi * .9) % .1 + .1) % .1, th = b.HZ[end < 0 ? 0 : 5], col = th > .5 ? HOT : th > .12 || end < 0 ? LIME : WH;
        for (let uu = ph; uu < 1 && uu < reach; uu += .1) {
          const p = lp(end < 0 ? uu : 1 - uu, 0); if (!vis(p[0], p[1], p[2])) continue;
          apI(Fw, p[0], p[1], p[2], Q1);
          if (K.pj(Q1[0], Q1[1], Q1[2]) && !P_.occd(K.PJ[0], K.PJ[1], K.PJ[2])) K.dot(K.PJ[0], K.PJ[1], 2, col[0], col[1], col[2], flowA * a * Math.exp(-K.PJ[2] / 35));
        }
      }
    }
  }
  void C;
}

/* ================= the machinery, per frame =================
   Dots in the ship frame (projected, occluded, sized by depth, dimmed with distance under the water), cylinders as
   lines and end rings at a pitch of ~1.5 px */
const PW = [0, 0, 0], VA_ = [0, 0, 0], VB_ = [0, 0, 0];
let SWS = null;                                               // the ship -> world transform this frame
function sdot(x, y, z, c, a) {
  apI(SWS, x, y, z, PW);
  if (!K.pj(PW[0], PW[1], PW[2])) return;
  const zc = K.PJ[2]; if (P_.occd(K.PJ[0], K.PJ[1], zc)) return;
  const v = UW ? a * Math.exp(-zc / 45) : a * Math.exp(y / 2.6); if (v < .02) return;
  K.dot(K.PJ[0], K.PJ[1], zc < 2.6 ? 2 : 1, c[0], c[1], c[2], v);
}
function sline(A, B, sp, c, a) { const L = V.dist(A, B), n = Math.max(1, Math.round(L / sp)); for (let k = 0; k <= n; k++) { const t = k / n; sdot(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, c, a); } }
function sring(c, U, W, r, sp, col, a, n0) { const n = n0 || Math.max(8, Math.min(90, Math.round(TAU * r / sp))); for (let k = 0; k < n; k++) { const t = k / n * TAU, cs = Math.cos(t) * r, sn = Math.sin(t) * r; sdot(c[0] + U[0] * cs + W[0] * sn, c[1] + U[1] * cs + W[1] * sn, c[2] + U[2] * cs + W[2] * sn, col, a); } }
const perp2 = d => { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const u = V.norm(V.cross(d, a)); return [u, V.cross(d, u)]; };
function pitchAt(p) { apI(SWS, p[0], p[1], p[2], PW); const C = K.C; return Math.max(.004, V.dist(PW, C.eye) * 1.5 / C.fl); }
const near = (p, r) => { apI(SWS, p[0], p[1], p[2], PW); return V.dist(PW, K.C.eye) < r; };
/* a cylinder between ship points: nl lines along it and a ring at each end (one line when it is thin on screen) */
function scyl(A, B, r, nl, c, a) {
  const d = V.sub(B, A), L = V.len(d); if (L < 1e-4) return;
  const ax = V.mul(d, 1 / L), sp = pitchAt(V.lerp(A, B, .5));
  if (sp > r * 1.4) { sline(A, B, sp, c, a); return; }
  const [U, W] = perp2(ax);
  if (sp > r * .45) nl = Math.min(nl, 4);
  for (let k = 0; k < nl; k++) { const t = (k + .5) / nl * TAU, cu = Math.cos(t) * r, cw = Math.sin(t) * r; for (let q = 0; q < 3; q++) { VA_[q] = A[q] + U[q] * cu + W[q] * cw; VB_[q] = B[q] + U[q] * cu + W[q] * cw; } sline(VA_, VB_, sp, c, a); }
  sring(A, U, W, r, sp, c, a); sring(B, U, W, r, sp, c, a);
}
/* a hydraulic ram between its pins: the barrel from A, the rod to B (lime while it strokes) */
function ramW(A, B, lb, lr, rb, moving, a) {
  const d = V.sub(B, A), L = V.len(d); if (L < 1e-4) return; const ax = V.mul(d, 1 / L);
  scyl(A, V.mad(A, ax, lb), rb, 8, WH, a);
  scyl(V.mad(B, ax, -Math.min(lr, L - .02)), B, rb * .45, 4, moving ? LIME : WH, a);
  const [U, W] = perp2(ax), sp = pitchAt(A);
  sring(A, U, W, rb * 1.25, sp, WH, a * .8); sring(B, U, W, rb * .8, sp, moving ? LIME : WH, a * .8);
  if (moving) { apI(SWS, A[0], A[1], A[2], PW); P_.oglow(PW[0], PW[1], PW[2], 10, LIME, .35 * a); }
}
/* the doors' rams (two a door, from the well's top corner to the door's inner face) and the bay leaves' (two a leaf,
   from the well's side to the leaf); the pin points closed are fixed in RAMS, the rod eye follows the door */
const RAMS = [];
function buildRams() {
  CELLS.forEach((c, k) => {
    for (const zr of [-(SC_L / 2 - .45), SC_L / 2 - .45]) {
      const A = X.ap(c.F, [.6, -.62, zr]), B0 = X.ap(c.F, [.16, -.05, zr]);
      RAMS.push({ k, leaf: -1, A, B0, h: c.hinge });
    }
  });
  let li = 0;
  for (let bi = 0; bi < 3; bi++) for (const sg of [1, -1]) {
    const zb = BY_Z[bi], yh = hp(zb, gAtX(zb, BY_W), 1)[1];
    for (const zr of [-(BY_L / 2 - .6), BY_L / 2 - .6]) {
      const A = [sg * (BY_W - .07), -Y_KH - .3, zb + zr], B0 = [sg * (BY_W - .38), yh + .05, zb + zr];
      RAMS.push({ k: bi, leaf: li, sg, A, B0, h: { p: [sg * BY_W, yh, zb], a: [0, 0, 1], sg } });
    }
    li++;
  }
  for (const r of RAMS) {
    let lo = 1e9, hi = 0;
    for (let q = 0; q <= 20; q++) { const B = r.leaf < 0 ? X.ap(pivot(r.h.p, r.h.a, r.h.sg * 108 * DEG * q / 20), r.B0) : X.ap(pivot(r.h.p, r.h.a, r.sg * 96 * DEG * q / 20), r.B0); const L = V.dist(r.A, B); lo = Math.min(lo, L); hi = Math.max(hi, L); }
    r.lb = lo - .04; r.lr = Math.min(lo - .06, hi - r.lb + .12);
  }
}
function rams(s, a) {
  for (const r of RAMS) {
    const side = r.leaf < 0, d = side ? s.door[r.k] : s.bay[r.k], zc = r.A[2];
    if (!(d > .02 || openAt(r.A[0], r.A[1], zc))) continue;
    if (!near(r.A, 26)) continue;
    const B = d > 0 ? X.ap(pivot(r.h.p, r.h.a, (side ? r.h.sg * 108 : r.sg * 96) * DEG * d), r.B0) : r.B0;
    ramW(r.A, B, r.lb, r.lr, side ? .048 : .055, d > .005 && d < .995, a);
  }
}
/* the screw jacks: each column's screw turning inside its telescoping stages (its thread climbing with them, one pitch a
   turn), from the gearbox to the top stage, the motor's end disc turning with a lime mark while it drives */
const JP = .05;
function jacks(s, a) {
  for (const J of JACKS) {
    const b = BUN[J.bi], side = J.kind === 0, c = b.c, k = side ? CELLS.indexOf(c) : c.i;
    const e = side ? s.ext[k] : s.kex[k], open = side ? s.door[k] : s.bay[k], zc = side ? c.zc : c.zb;
    const pc = side ? c.F.T : [0, -5, zc];
    if (!(open > .02 || openAt(pc[0], pc[1], zc))) continue;
    if (!near(pc, 22)) continue;
    const y0 = side ? -SC_DEP - LS_S : 4.2, y1 = side ? -SC_DEP + EXT_S * e : 4.2 + LS_K + EXT_K * e, run = (side ? EXT_S : EXT_K) * e;
    const moving = e > .003 && e < .997, ph = -run / JP * TAU, F_ = c.F, R_ = F_.R, T_ = F_.T;
    const n = Math.round((y1 - y0) / JP * (near(c.F.T, 9) ? 7 : 4)), r = .026;
    for (let q = 0; q <= n; q++) {
      const y = y0 + (y1 - y0) * q / n, t = (y - y0) / JP * TAU + ph, lx = Math.cos(t) * r, lz = J.zl + Math.sin(t) * r;
      sdot(R_[0] * lx + R_[1] * y + R_[2] * lz + T_[0], R_[3] * lx + R_[4] * y + R_[5] * lz + T_[1], R_[6] * lx + R_[7] * y + R_[8] * lz + T_[2], moving ? LIME : WH, a * (moving ? .9 : .55));
    }
    // the motor's end disc (x' .34 / .36 out from the gearbox), its mark turning
    const mx = side ? .34 : .36, my = y0 - .11, ma = ph * .12;
    for (let q = 0; q < 12; q++) { const t = q / 12 * TAU, ly = my + Math.cos(t) * .06, lz = J.zl + Math.sin(t) * .06; sdot(R_[0] * mx + R_[1] * ly + R_[2] * lz + T_[0], R_[3] * mx + R_[4] * ly + R_[5] * lz + T_[1], R_[6] * mx + R_[7] * ly + R_[8] * lz + T_[2], WH, a * .7); }
    if (moving) { const ly = my + Math.cos(ma) * .045, lz = J.zl + Math.sin(ma) * .045; sdot(R_[0] * mx + R_[1] * ly + R_[2] * lz + T_[0], R_[3] * mx + R_[4] * ly + R_[5] * lz + T_[1], R_[6] * mx + R_[7] * ly + R_[8] * lz + T_[2], LIME, a); }
  }
}
/* the valves: the branch valves' discs turning a quarter turn (their pointers lime while they turn), the mains' gates
   drawn up into their bonnets by the motor operators (the stem rising, the handwheel turning), the pumps' check valves
   swinging open with the flow */
function valvesW(s, a) {
  for (let v = 0; v < VALVES.length; v++) {
    const val = VALVES[v], c = val.p; if (!openAt(c[0], c[1], c[2]) || !near(c, 15)) continue;
    const o = s.valve[v], th = o * PI / 2, ax = val.ax, sh = val.sh, U = V.norm(V.cross(ax, sh)), sp = pitchAt(c);
    const w = [U[0] * Math.cos(th) + ax[0] * Math.sin(th), U[1] * Math.cos(th) + ax[1] * Math.sin(th), U[2] * Math.cos(th) + ax[2] * Math.sin(th)];
    const moving = o > .01 && o < .99;
    sring(c, sh, w, val.r * .9, sp, moving ? LIME : WH, a * .9);
    sline(V.mad(c, sh, -val.r * .9), V.mad(c, sh, .18), sp, WH, a * .6);
    const tp = V.mad(c, sh, .31); sline(V.mad(tp, w, -.055), V.mad(tp, w, .055), sp, moving || o > .99 ? LIME : WH, a);
  }
  for (let i = 0; i < MVALVES.length; i++) {
    const m = MVALVES[i], c = m.p, o = s.mv[i]; if (!openAt(c[0], c[1], c[2]) || !near(c, 24)) continue;
    const sh = m.sh, sp = pitchAt(c), moving = o > .01 && o < .99, g = V.mad(c, sh, o * .26);
    sring(g, sh, [0, 0, 1], .118, sp, moving ? LIME : WH, a);                                 // the gate
    sline(V.mad(g, sh, .12), V.mad(c, sh, .86 + o * .26), sp, moving ? LIME : WH, a * .8);   // its rising stem
    const hw = V.mad(c, sh, .62); sring(hw, [0, 1, 0], [0, 0, 1], .13, sp, WH, a * .8);
    const t = o * TAU * 5; sdot(hw[0], hw[1] + Math.cos(t) * .13, hw[2] + Math.sin(t) * .13, LIME, a);
  }
  for (let i = 0; i < CHECKS.length; i++) {
    const ck = CHECKS[i], c = ck.p; if (!openAt(c[0], c[1], c[2]) || !near(c, 15)) continue;
    const o = s.chk[i], f = o * 70 * DEG, ax = ck.ax, up = ck.up, hz = V.cross(ax, up), H = V.mad(c, up, ck.r * .9), sp = pitchAt(c);
    const w = [-up[0] * Math.cos(f) + ax[0] * Math.sin(f), -up[1] * Math.cos(f) + ax[1] * Math.sin(f), -up[2] * Math.cos(f) + ax[2] * Math.sin(f)];
    sring(V.mad(H, w, ck.r * .88), hz, w, ck.r * .85, sp, o > .02 && o < .98 ? LIME : WH, a * .9);
  }
}
/* seawater convecting through the hot banks (RGKR): streamlines from below each bundle up through it and on to the
   surface (under the keel: up to the bottom, out along it and up the side), dashes running up them at the plume's
   speed; the water below cold and faint, through the bundle and above it carrying the bundle's heat */
let FLINES = null, PHR = null, PHF = null;
function buildFlow() {
  FLINES = [];
  const r = M3.rng(9183);
  BUN.forEach((b, bi) => {
    const B = b.kind ? KB : SB, W = (B.nw - 1) * B.p, Lb = b.kind ? trY(b.c.F, Y_KB + EXT_K) : trY(b.c.F, Y_SB + EXT_S);
    for (const fx of [-.38, 0, .38]) for (const fz of [-.38, -.13, .13, .38]) {
      const c0 = X.ap(Lb, [fx * W + (r() - .5) * .08, 0, fz * B.L + (r() - .5) * .15]), P = [], wob = r() * TAU, side = c0[0] > .05 ? 1 : c0[0] < -.05 ? -1 : (r() < .5 ? 1 : -1);
      let x = c0[0], y = c0[1] - 1.4, z = c0[2], sB = 0, L = 0;
      for (let q = 0; q < 140 && y < -.25; q++) {
        P.push([x, y, z]);
        const dy = .16, hb = hbT(z, y + dy);
        if (b.kind === 1 && y + dy > -dk(z) - .06 && Math.abs(x) < hb + .05) break;
        x += side * .014 * (1 + .6 * Math.max(0, y - c0[1])) + .016 * Math.sin(q * .45 + wob); y += dy; z -= .012;
        if (b.kind === 0 && Math.abs(x) < hb + .12 && y > -dk(z)) x = side * (hb + .12);
      }
      if (b.kind === 1) {                                     // out along the bottom and up the side
        const gl = girth(z);
        for (let g = gAtX(z, Math.max(.02, Math.abs(x))); g > .005; g -= .16 / gl) { const p = hp(z, g, side), n = hn(z, g, side); P.push([p[0] + n[0] * .1, p[1] + n[1] * .1, p[2] + n[2] * .1]); z -= .005; if (p[1] > -.25) break; }
      }
      for (let i = 1; i < P.length; i++) { L += V.dist(P[i], P[i - 1]); if (!sB && P[i][1] >= c0[1]) sB = L; }
      if (P.length > 2) FLINES.push({ pl: P_.poly(P), bi, sB, spd: .85 + .3 * r(), ph: r() * 4 });
    }
  });
  // the plumes' run (the integral of their speed over RGKR's clock, from the banks' mean heat)
  const n = Math.ceil(LEN_R / .05) + 2; PHR = new Float64Array(n); let f = 0;
  const md = BUN.reduce((a, b) => a + (b.s0 + b.L / 2) / VH, 0) / BUN.length;
  for (let i = 0; i < n; i++) { const u = i * .05; f += (.14 + 1.15 * thR(u - md) * .8) * .05; PHR[i] = f; }
  // the coolant's own run in RGKR (the flow dots' phase)
  PHF = new Float64Array(n); f = 0;
  for (let i = 0; i < n; i++) { f += (.8 + 2.4 * flowR(i * .05)) * .05; PHF[i] = f; }
}
const tabAt = (A, u) => { const f = E.clamp(u / .05, 0, A.length - 1.001), i = Math.floor(f); return A[i] + (A[i + 1] - A[i]) * (f - i); };
const phrAt = u => tabAt(PHR, u);
function seaFlow(s, u, a) {
  const Ph = phrAt(u), per = .7, dash = .3, st = .045;
  for (const fl of FLINES) {
    const b = BUN[fl.bi], side = b.kind === 0, k = side ? CELLS.indexOf(b.c) : b.c.i, e = side ? s.ext[k] : s.kex[k];
    const A = a * ss(.9, 1, e) * (.2 + .8 * Math.min(1, b.th * 1.6)); if (A < .02) continue;
    if (!near(fl.pl.P[0], 34)) continue;
    const pl = fl.pl, ph = ((Ph * fl.spd + fl.ph) % per + per) % per;
    for (let d0 = ph - per; d0 < pl.L; d0 += per) for (let d = Math.max(0, d0); d < d0 + dash && d < pl.L; d += st) {
      const rel = d - fl.sB, hv = rel < -.35 ? 0 : rel < .35 ? b.th : b.th * Math.exp(-(rel - .35) / 2.2);
      P_.polyAt(pl, d, Q2);
      const c = hv > .5 ? HOT : hv > .1 ? LIME : WH, al = A * (rel < -.35 ? .35 : .4 + .6 * Math.min(1, hv * 2)) * (1 - E.sat((d - pl.L + 1) / 1));
      sdot(Q2[0], Q2[1], Q2[2], c, al);
    }
  }
}
let PRF = null, PT = 0;
const pk = k => { if (!PRF) return; const t = performance.now(); PRF[k] = (PRF[k] || 0) + t - PT; PT = t; };
/* the whole sink. mode 0 base, 1 RGKD, 2 RGKR; u the insert's clock */
function drawSink(mode, u, T, ctx) {
  const Ws = ctx.Ws, C = K.C, TR = ctx.T, s = sinkState(mode, u, T);
  DM = mode; DU = u; PRF = RGK.prof || null; if (PRF) PT = performance.now(); SCZ = scanAt(u);
  if (FILM.duration) { const D = FILM.duration, per = p => D / Math.max(1, Math.round(D / p)); PER6 = per(6); PER12 = per(12); }
  UW = C.eye[1] < -.12;
  // (across the surface nothing switches: from .6 m above it down to it what is under the water clears (its
  // extinction thins out and the mechanisms fade in); under it the motes and the surface overhead fade in)
  const gA = ss(.6, -.12, C.eye[1]), gU = ss(-.12, -.8, C.eye[1]);
  XFK.ws = Ws; SWS = Ws; WS_ = Ws;
  // the focus on the camera's subject (inserts); a lens inside the hull is in the dry X-ray space: no veil, no sea
  // surface overhead, no motes
  FOC.on = mode !== 0 && !!C.target; if (FOC.on) { FOC.p = C.target; FOC.r = .26 * V.dist(C.eye, C.target) + .7; }
  const es = toShip(Ws, C.eye), inHull = es[1] < -.12 && es[1] > -dk(es[2]) && es[2] > HZ0 && Math.abs(es[0]) < hbT(es[2], es[1]) - .05;
  const shipD = V.dist(C.eye, X.ap(Ws, [0, -3, 44]));
  // per frame transforms
  BUN.forEach((b, bi) => { const L = bundleXf(b, s); XFK.bun[bi] = X.mul(Ws, L); bundleHeat(b); });
  const hot = BUN.reduce((m, b) => Math.max(m, b.th), 0);
  const fadeEnd = mode === 2 ? 1 - ss(LEN_R - 2.8, LEN_R - .3, u) : 1;
  if (!UW) {
    // from above the water: only what reaches the surface (and the glow of hot banks under it, the hull just under
    // the surface while the lens comes down to it)
    if (shipD > 2600) return;
    if (mode && shipD < 40 && C.eye[1] < (mode === 1 ? 16 : 6)) {
      drawBody(s, Ws, TR, { sub: (mode === 1 ? 4.2 : 3.4) / Math.max(.04, 1 - gA), fog: 0, ma: gA }, false);
    }
    if (mode === 2 || hot > .05 || thB(T - 6) > .1) surface(TR, fadeEnd);
    if (mode === 2 && shipD < 400) irSurface(fadeEnd * ss(.5, 2.5, u));
    if (hot > .05) {
      BUN.forEach((b, bi) => { if (b.th < .05) return; const Tw = XFK.bun[bi]; const d = Math.max(1, V.dist(C.eye, Tw.T)); P_.oglow(Tw.T[0], Tw.T[1], Tw.T[2], Math.min(140, 2.2 * C.fl / d), b.th > .55 ? HOT : LIME, .14 * b.th * Math.exp(Tw.T[1] / 3) * fadeEnd); });
      bubbles(TR, fadeEnd, false);
    }
    return;
  }
  pk('state'); if (!inHull) veil(); pk('veil');
  occHull(Ws); pk('occ');
  if (!inHull) ceiling(TR, gU); pk('ceil');
  drawBody(s, Ws, TR, { fog: 60, sub: 0 }, true);
  if (!inHull) snow(TR, gU); pk('snow');
  if (hot > .05 || mode === 2) bubbles(TR, fadeEnd, true); pk('bub');
  if (mode === 2) surface(TR, fadeEnd);
  // the banks light the water round them
  BUN.forEach((b, bi) => {
    if (b.th < .04) return;
    const Tw = XFK.bun[bi], d = Math.max(1, V.dist(C.eye, Tw.T));
    P_.oglow(Tw.T[0], Tw.T[1], Tw.T[2], Math.min(170, 2.6 * C.fl / d), b.th > .55 ? HOT : LIME, Math.min(.6, .42 * b.th) * Math.exp(-d / 40));
  });
}
/* the hull, doors, wells, the inside (X-ray), bundles, frames, hoses, flow. Inside a cell (behind its opening) a dot
   shows only through the opening (a portal test in the cell's frame), or where the X-ray window is open */
const PRT = new Float64Array(6);
const portal = (side, dx, dy, dz) => { PRT[0] = side ? 0 : Y_KO; PRT[1] = side ? SC_H / 2 : BY_W; PRT[2] = side ? SC_L / 2 : BY_L / 2; PRT[3] = dy; PRT[4] = dx; PRT[5] = dz; return PRT; };
function drawBody(s, Ws, TR, ex, uw) {
  const fog = ex.fog, sub = ex.sub, D_ = (ml, Tw, o) => { o.fog = fog; o.sub = sub; drawK(ml, Tw, ko(o)); };
  // the far side's shell faces away from a lens outboard of the other side (above the keel): not drawn
  const es = toShip(Ws, K.C.eye);
  for (let k = 0; k < 2; k++) {
    const sd = k ? 1 : -1; if (es[0] * sd < -3 && es[1] > -5.6) continue;
    D_(CLK_.hullA[k], Ws, { xr: 1, edge: .6, a: 1.35, amb: .36, px: 8.5 });
    D_(CLK_.hullB[k], Ws, { xr: 1, edge: .5, a: 1.2, amb: .36, px: 9 });
  }
  D_(CLK_.dome, Ws, { edge: .5, a: 1.2, amb: .36, px: 9 }); pk('hull');
  const xo = XK.zo < 90, openZ = z => xo && z > XK.zo - .5 && z < XK.zs + .5;
  CELLS.forEach((c, k) => {
    const d = s.door[k], h = c.hinge, Td = d > 0 ? X.mul(Ws, pivot(h.p, h.a, h.sg * 108 * DEG * d)) : Ws;
    D_(CLK_.doors[k], Td, { xr: 0, edge: .85, a: 1.2, amb: .3, lime: .9 * lockAt(k), px: 6 });
  });
  let li = 0;
  for (let bi = 0; bi < 3; bi++) for (const sg of [1, -1]) {
    const d = s.bay[bi], zb = BY_Z[bi], yh = hp(zb, gAtX(zb, BY_W), 1)[1];
    const Td = d > 0 ? X.mul(Ws, pivot([sg * BY_W, yh, zb], [0, 0, 1], sg * 96 * DEG * d)) : Ws;
    D_(CLK_.leaves[li++], Td, { xr: 0, edge: .85, a: 1.2, amb: .3, lime: .9 * bayLock(bi), px: 6 });
  }
  pk('doors');
  // the inside, where the window is open
  if (xo) {
    D_(CLK_.inStruct, Ws, { xr: 3, a: .45, edge: .2, amb: .1, occ: false, px: 8, foc: true });
    D_(CLK_.inside, Ws, { xr: 3, a: 1.7, edge: 1, occ: false, px: 6.5, foc: true });
    D_(CLK_.inMach, Ws, { xr: 3, a: 1.7, edge: 1, occ: false, px: 4.2, foc: true });
    D_(CLK_.inCells, Ws, { xr: 3, a: .55, edge: .5, amb: .2, occ: false, px: 7, foc: true });
    // the pumps' turning parts: the coupling, the impeller in its volute, the motor's fan
    PUMPS.forEach(([x, y, z], k) => {
      const ang = (k < 2 ? s.pump : s.pump2) * (k & 1 ? -1 : 1) + k, rt = k < 2 ? s.pumpR : s.pumpR2;
      D_(CLK_.coupling, X.mul(Ws, X.make(R.y(ang), [x, y + .28, z])), { xr: 3, S: X.make(R.I(), [x, y + .28, z]), a: 1.6, lime: .3 * rt, occ: false });
      D_(CLK_.impeller, X.mul(Ws, X.make(R.y(-ang), [x, y - .12, z])), { xr: 3, S: X.make(R.I(), [x, y - .12, z]), a: 1.9, edge: 1, lime: .5 * rt, occ: false, px: 4 });
      D_(CLK_.fan, X.mul(Ws, X.make(R.y(-ang), [x, y + 1.19, z])), { xr: 3, S: X.make(R.I(), [x, y + 1.19, z]), a: 1.6, edge: 1, lime: .25 * rt, occ: false, px: 4 });
    });
  }
  pk('inside');
  // per cell: the well, the frames (telescoping stages) and the bundle
  BUN.forEach((b, bi) => {
    const side = b.kind === 0, B = side ? SB : KB, c = b.c, k = side ? CELLS.indexOf(c) : c.i;
    const open = side ? s.door[k] : s.bay[k], e = side ? s.ext[k] : s.kex[k], xin = !side && openZ(c.zb);   // (the window is a strip along the keel)
    if (open < .01 && e < .001 && !xin) return;
    const Fw = X.mul(Ws, c.F), seen = open > .01;
    const pr = (dx, dy, dz) => xin ? null : portal(side, dx, dy, dz);
    D_(side ? CLK_.wellS : CLK_.wellK, Fw, { edge: .55, a: .9, amb: .2, portal: pr(0, 0, 0), xr: seen ? 0 : 3, S: c.F, px: 10, foc: true }); pk('wells');
    const st = side ? CLK_.stS : CLK_.stK, ext = side ? EXT_S : EXT_K, ls = side ? LS_S : LS_K, zl0 = B.L / 2 - (side ? .22 : .25);
    if (e > .001) for (const zl of [-zl0, zl0]) for (let m = 0; m < 3; m++) {
      const y = side ? -SC_DEP - ls + ext * e * (m + 1) / 3 : 4.2 + ext * e * (m + 1) / 3;
      D_(st[m], X.mul(Fw, X.make(R.I(), [0, y, zl])), { edge: 1, a: 1.7, amb: .3, lime: .55 * (e > .02 && e < .98 ? 1 : 0), portal: pr(0, y, zl), xr: seen ? 0 : 3, S: X.mul(c.F, X.make(R.I(), [0, y, zl])), px: 7, scan: true, foc: true });
    }
    pk('stages');
    const yb = side ? Y_SB + EXT_S * e : Y_KB + EXT_K * e;
    D_(side ? CLK_.side : CLK_.keel, XFK.bun[bi], { a: seen ? (DM === 2 ? 1.15 : 1.8) : .55, edge: 1, amb: .3, heat: 1, foc: true, HZ: b.HZ, hz0: -B.L / 2, hL: B.L, portal: pr(0, yb, 0), xr: seen ? 0 : 3, S: X.mul(c.F, X.make(R.I(), [0, yb, 0])), px: 6.2, scan: true }); pk(side ? 'bunS' : 'bunK');
  });
  pk('cells');
  const ma = uw || DM === 1 ? 1 : ex.ma || 0;               // (above the surface they fade in as the lens nears it)
  if (ma > .01) {
    hoses(s, TR, ma, s.flow); pk('hoses'); flowDots(Ws, s, TR, ma); tubeFlow(s, TR, ma, uw || ma > .5); pk('flow');
    if (ma > .5) valveFX(s, Ws); valvesW(s, ma); rams(s, ma); jacks(s, ma); pk('mech');
    if (DM === 2) { seaFlow(s, CLK, ma); pk('seaflow'); }
    scanPlane(Ws);
  }
}
/* the scan plane: a sparse lime lattice across the sink at SCZ, its rim lit */
function scanPlane(Ws) {
  if (SCZ > 90) return;
  const z = SCZ, A = Math.min(1, (57.8 - z) / 1.2, (z - 28.2) / 1.2);
  if (A < .02) return;
  for (let i = -18; i <= 18; i++) for (let j = 0; j <= 20; j++) {
    if ((i + j) & 1) continue;
    const x = i * .5, y = -.3 - j * .5; if (Math.abs(x) < hbT(z, y) - .05 && y > -dk(z)) continue;
    apI(Ws, x, y, z, Q1); P_.odot(Q1[0], Q1[1], Q1[2], 1, LIME, .32 * A);
  }
  const hw = 9, y0 = -.3, y1 = -10.3;
  apI(Ws, -hw, y0, z, Q1); apI(Ws, hw, y0, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.5, 1, LIME, .7 * A);
  apI(Ws, -hw, y1, z, Q1); apI(Ws, hw, y1, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.5, 1, LIME, .7 * A);
  apI(Ws, -hw, y0, z, Q1); apI(Ws, -hw, y1, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.5, 1, LIME, .7 * A);
  apI(Ws, hw, y0, z, Q1); apI(Ws, hw, y1, z, Q2); K.lineW(Q1[0], Q1[1], Q1[2], Q2[0], Q2[1], Q2[2], 1.5, 1, LIME, .7 * A);
}
/* each bundle boxed as the scan passes it */
function scanBoxes(u) {
  if (SCZ > 90) return;
  for (let bi = 0; bi < BUN.length; bi++) {
    const b = BUN[bi], B = b.kind ? KB : SB, zc = b.kind ? b.c.zb : b.c.zc, d = zc + B.L / 2 - SCZ;
    if (d < 0 || d > 3.2 + B.L) continue;
    const a = Math.min(1, d / .3) * (1 - E.sat((d - B.L - 1.6) / 1.6)), W = (B.nw - 1) * B.p / 2 + .08, Dd = (B.nd - 1) * B.p / 2 + .08;
    const bx = K.boxOf([-W, -Dd, -B.L / 2 - B.hd], [W, Dd, B.L / 2 + B.hd], XFK.bun[bi], 4);
    if (bx) K.bracket(bx, '#C6F432', .85 * a, 8, 1.2);
  }
  void u;
}
function bayLock(b) {
  if (DM === 1) return Math.max(lock(DU, D_BAY(b) - .05), .7 * lock(DU, D_BAY(b) + BDUR));
  if (DM === 2) return Math.max(lock(DU, R_BAY(b) + BDUR), .5 * lock(DU, R_BAY(b)));
  return 0;
}
/* the door seams flash lime as they unlatch and as they seat */
function lockAt(k) {
  const c = CELLS[k];
  if (DM === 1) return Math.max(lock(DU, D_DOOR(c.s, c.i) - (c.s > 0 && c.i === FOL ? D_DOOR(c.s, c.i) - UD.unl : .05)), .7 * lock(DU, D_DOOR(c.s, c.i) + DDUR));
  if (DM === 2) return Math.max(lock(DU, R_DOOR(c.s, c.i) + RDDUR), .5 * lock(DU, R_DOOR(c.s, c.i)));
  return 0;
}
let DM = 0, DU = 0;
/* the valves: a lime flash as each opens */
function valveFX(s, Ws) {
  if (XK.zo > 90) return;
  for (let v = 0; v < VALVES.length; v++) {
    const val = VALVES[v], o = s.valve[v]; if (o < .01) continue;
    if (!openAt(val.p[0], val.p[1], val.p[2])) continue;
    const fl = o > .02 && o < .98 ? 1 : 0;
    apI(Ws, val.p[0] + val.sh[0] * .24, val.p[1] + .07, val.p[2], Q1);
    P_.odot(Q1[0], Q1[1], Q1[2], 2, LIME, .45 + .55 * fl);
    if (fl) P_.oglow(Q1[0], Q1[1], Q1[2], 14, LIME, .5);
  }
}

/* ================= camera =================
   Ship-frame keys (FILM.path) between the first and last key; into and out of the base camera by a blend that swings
   the eye about the subject (its direction slerped, its distance in log, so the picture grows or shrinks evenly), the
   look and the lens eased with it, the base camera's own motion carried through both splices (C1). Keys every 3-5 s,
   the look turning under 30°/s. */
const toShip = (Ws, p) => { const M = Ws.R, x = p[0] - Ws.T[0], y = p[1] - Ws.T[1], z = p[2] - Ws.T[2]; return [M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z]; };
const dirShip = (Ws, v) => { const M = Ws.R; return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; };
const sm5 = w => { w = E.sat(w); return w * w * w * (w * (w * 6 - 15) + 10); };
const sm3 = w => { w = E.sat(w); return w * w * (3 - 2 * w); };
const DBG = (() => {
  let s = STAGE.Q.get('cam');
  try { if (!s && window.parent !== window) s = new URLSearchParams(parent.location.search).get('cam'); } catch (e) {}
  if (!s) return null; const a = s.split(',').map(Number); return { eye: a.slice(0, 3), target: a.slice(3, 6), fov: (a[6] || 40) * DEG };
})();
function camRig(keys, at, len, ctx) {
  const UA = keys[0][0], UB = keys[keys.length - 1][0], h = 1 / 60;
  const o = ctx.camAt(at), a = ctx.camAt(at - h), b = ctx.camAt(at + h);
  const vel = (p, q) => ({ eye: V.mul(V.sub(q.eye, p.eye), 1 / h), target: V.mul(V.sub(q.target, p.target), 1 / h), fov: (q.fov - p.fov) / h });
  const rig = { UA, UB, len, VA: vel(a, o), VB: vel(o, b) };
  rig.P = FILM.path(keys.map(([t, eye, target, fov]) => ({ t, eye, target, fov })));
  rig.PA = rig.P(UA); rig.PB = rig.P(UB);
  return rig;
}
/* mix two poses (ship frame): g the share of B; the eye about the pivot */
const MX = { eye: [0, 0, 0], target: [0, 0, 0], fov: 0 };
const slerp = (a, b, g) => { const om = Math.acos(E.clamp(V.dot(a, b), -1, 1)); if (om < 1e-4) return V.norm(V.lerp(a, b, g)); const s = Math.sin(om); return V.add(V.mul(a, Math.sin((1 - g) * om) / s), V.mul(b, Math.sin(g * om) / s)); };
function mixCam(eA, tA, fA, eB, tB, fB, g, piv) {
  const oA = V.sub(eA, piv), oB = V.sub(eB, piv), rA = Math.max(.05, V.len(oA)), rB = Math.max(.05, V.len(oB));
  const n = slerp(V.mul(oA, 1 / rA), V.mul(oB, 1 / rB), g), r = Math.exp(Math.log(rA) + (Math.log(rB) - Math.log(rA)) * g);
  // the look: its direction slerped (an even turn), its reach in log
  const lA = V.sub(tA, eA), lB = V.sub(tB, eB), LA = Math.max(.05, V.len(lA)), LB = Math.max(.05, V.len(lB));
  const d = slerp(V.mul(lA, 1 / LA), V.mul(lB, 1 / LB), g), L = Math.exp(Math.log(LA) + (Math.log(LB) - Math.log(LA)) * g);
  MX.eye = V.mad(piv, n, r); MX.target = V.mad(MX.eye, d, L); MX.fov = fA + (fB - fA) * g;
  return MX;
}
function camAtRig(rig, u, ctx) {
  if (DBG) return DBG;
  const Ws = ctx.Ws, UA = rig.UA, UB = rig.UB;
  if (u >= UA && u <= UB) { const s = rig.P(u); return { eye: X.ap(Ws, s.eye), target: X.ap(Ws, s.target), fov: s.fov }; }
  const o = ctx.camOld, st = u < UA;
  // (a cubic ease, its peak rate 1.5x the mean: the splices' swings stay under 35°/s)
  const g = st ? 1 - sm3(u / UA) : sm3((u - UB) / (rig.len - UB));          // the base camera's share
  const du = st ? u : u - rig.len, VO = st ? rig.VA : rig.VB;               // the base camera carried on its own motion
  const ve = dirShip(Ws, VO.eye), vt = dirShip(Ws, VO.target);
  const eB = V.mad(toShip(Ws, o.eye), ve, du * g), tB = V.mad(toShip(Ws, o.target), vt, du * g), fB = o.fov + VO.fov * du * g;
  const s = st ? rig.PA : rig.PB;
  const m = mixCam(s.eye, s.target, s.fov, eB, tB, fB, g, s.target);
  return { eye: X.ap(Ws, m.eye), target: X.ap(Ws, m.target), fov: m.fov };
}
/* RGKD: from the gun down the starboard side (the hot line from its keel port through the X-ray), under the surface
   and in through the hull along the main to the supply drum; the pumps held; aft along the supply header as the valves
   open; backing out over the followed cell and down in front of its door: the door pushed open, the bundle run out
   toward the lens (the lens backing off with it); under the keel to the bays; the scan from forward; up past the hull
   to the base camera */
const CAM_D = [
  [6.0, [10.9, 2.5, 46.4], [0.8, -1.7, 41.8], 46],
  [8.8, [7.4, -1.3, 45.6], [0.6, -3.0, 41.3], 48],
  [12.0, [4.0, -2.4, 45.2], [1.6, -3.9, 41.7], 48],
  [16.0, [3.5, -2.9, 44.2], [2.05, -3.8, 41.75], 46],
  [20.0, [3.4, -2.2, 43.0], [0.8, -4.6, 35.0], 46],
  [23.6, [5.0, -2.9, 40.6], [1.6, -4.4, 37.8], 50],
  [27.6, [8.8, -7.2, 41.8], [6.2, -4.7, 39.0], 48],
  [34.6, [9.6, -8.0, 41.2], [6.9, -5.2, 39.0], 48],
  [38.6, [8.4, -9.4, 44.2], [1.2, -6.8, 40.6], 52],
  [42.4, [6.6, -10.4, 45.2], [0.2, -7.6, 41.0], 52],
  [45.9, [12.8, -6.6, 54.2], [2.4, -4.4, 41.8], 54],
  [48.6, [12.4, -.9, 48.4], [2.6, 1.4, 45.4], 50],
];
/* RGKR: from the way home down off the starboard bow through the warm patch, under the surface: the purge's slug down
   the mains; one bundle held close as it goes white-hot and cools; down and back for the plumes and the keel banks;
   the stow; up past the hull into the base camera */
const CAM_R = [
  [4.6, [15.5, 4.2, 58.0], [5.0, -1.0, 44.0], 48],
  [8.6, [11.4, -1.8, 50.4], [3.0, -3.4, 42.4], 52],
  [11.2, [9.8, -5.0, 48.6], [5.8, -4.5, 42.6], 50],
  [15.0, [9.2, -6.6, 47.2], [6.2, -4.6, 42.4], 48],
  [18.8, [9.6, -6.8, 45.0], [6.3, -4.4, 42.2], 48],
  [22.4, [10.6, -9.4, 48.8], [2.6, -4.2, 40.2], 54],
  [26.4, [11.0, -7.2, 46.6], [4.0, -4.0, 41.0], 52],
  [29.0, [9.2, -2.6, 46.8], [4.6, -1.6, 43.0], 50],
  [31.0, [10.0, 2.4, 47.8], [2.4, 3.6, 44.8], 48],
];
let RIG_D = null, RIG_R = null;
function camD(u, ctx) { STAMP = ctx.T; MODE = 1; UU = u; return camAtRig(RIG_D, u, ctx); }
function camR(u, ctx) { STAMP = ctx.T; MODE = 2; UU = u; return camAtRig(RIG_R, u, ctx); }

/* the room's X-ray (the film's XS): closed while the lens is down, reopened as it comes back (RGKD only); the lower
   hull's own window (XK) */
/* while the lens is under the water the ship above it is seen through the surface (veiled): its dots spaced wider
   (the film resets these each frame from K.DQ) */
function thinAbove(rig, u, ctx) {
  if (!rig || DBG) return;
  const c = camAtRig(rig, u, ctx), y = toShip(ctx.Ws, c.eye)[1];
  const f = 1 + 1.6 * ss(-.2, -1.2, y);
  if (f > 1.001) for (const o of [ctx.SO, ctx.MO, ctx.RO]) if (o) o.px *= f;
}
function xrayD(u, XS, ctx) {
  thinAbove(RIG_D, u, ctx);
  STAMP_X = u;
  // the room stays open while the lens follows the hot line down from it, shuts as the lens goes under, reopens as
  // it comes back up to the gun
  if (u > UD.room0 && u < LEN_D - .4) {
    if (u < UD.room1) { XS.zs = 57.6 - 17.2 * kk(u, UD.room0, UD.room1); XS.ks = 1 - ss(UD.room1 - .2, UD.room1, u); }
    else if (u < LEN_D - 2.8) { XS.zo = 99; XS.zs = 99; }
    else { XS.zo = 57.6 - 17.2 * kk(u, LEN_D - 2.8, LEN_D - .9); XS.zs = 99; XS.ko = 1 - ss(LEN_D - 1.3, LEN_D - .6, u); }
  }
  setXK(u, UD.xo0, UD.xo1, UD.xc0, UD.xc1);
  return XK.zo < 90;
}
function xrayR(u, XS, ctx) { thinAbove(RIG_R, u, ctx); setXK(u, UR.xo0, UR.xo1, UR.xc0, UR.xc1); return XK.zo < 90; }
let STAMP_X = 0;
function setXK(u, o0, o1, c0, c1) {
  const b = XK.box;
  if (u < o0 || u > c1) { XK.zo = 99; XK.zs = 99; return; }
  XK.zo = u < o1 ? b[5] - (b[5] - b[4]) * kk(u, o0, o1) : b[4];
  XK.ko = u < o1 + .3 ? 1 : 0;
  XK.zs = u < c0 ? 99 : b[5] - (b[5] - b[4]) * kk(u, c0, c1); XK.ks = u > c0 ? 1 : 0;
}
/* the base take: the sink stowed, deployed from T_RAIL, the heat after the shot, stowed from TRET1 */
function drawBase(T, ctx) {
  if (!K) return;
  if (STAMP === ctx.T) return;                             // one of the inserts draws it this frame
  XK.zo = 99; XK.zs = 99;
  const on = T >= T_RAIL && T < T_RET; if (!on) return;
  if (thB(T) < .02 && K.C.eye[1] > 0) return;              // nothing under the water shows from above
  drawSink(0, 0, T, ctx);
}
function drawD(u, ctx) { drawSink(1, u, 0, ctx); restoreLight(); }
function drawR(u, ctx) { drawSink(2, u, 0, ctx); restoreLight(); }
function restoreLight() { const C = K.C; K.setLight(V.add(V.add(V.mul(C.r, .45), V.mul(C.u, .7)), V.mul(C.f, -.55))); }

/* ================= tags and readouts ================= */
const TG = {};
const winA = (u, t0, t1) => E.sat((u - t0) / .2) * (1 - E.sat((u - t1 + .4) / .4));
function tagW(ctx, k, id, lab, val, pW, u, t0, t1) { const a = winA(u, t0, t1); if (a > .01) ctx.tagAt(TG[k], id, lab, val, pW, a, u - t0); }
const pct = v => v > .98 ? 'open' : v < .02 ? 'shut' : `${Math.round(100 * v)} %`;
const nOpen = s => { let n = 0; for (let v = 0; v < VALVES.length; v++) if (VALVES[v].end < 0 && s.valve[v] > .98) n++; return n; };
function tagsD(u, ctx) {
  const Ws = ctx.Ws, s = DS, W = p => X.ap(Ws, p), cf = CELLS[FOL], bf = BUN.findIndex(b => b.c === cf), Fw = X.mul(Ws, cf.F);
  scanBoxes(u);
  const mv = MVALVES[0].p, vf = VALVES.find(v => v.b === bf && v.end < 0);
  tagW(ctx, 'HOT', 'HOT', 'Hot line · from the gun', 'Ø 250 mm', W([PORT_H[0] + .13, PORT_H[1] - .25, PORT_H[2]]), u, 4.2, 8.8);
  tagW(ctx, 'IVH', 'IVH', 'Isolation valve · gate', pct(s.mv[0]), W([mv[0] + .62, mv[1] + .15, mv[2]]), u, UD.mvH - .2, UD.mvH + 3.4);
  tagW(ctx, 'DRM', 'DRM', 'Supply drum', `${Math.min(100, Math.round(100 * E.sat((s.front - S_HOT) / (S_PIN - S_HOT))))} % full`, W([X_MN + .1, -3.72, Z_MN + .9]), u, 8.8, 12.0);
  tagW(ctx, 'PMP', 'PMP', 'Supply pumps ×2', `${Math.round(1780 * s.pumpR / 10) * 10} rpm`, W([PUMPS[1][0] + .22, PUMPS[1][1] + 1.0, PUMPS[1][2]]), u, UD.pump - .2, UD.pump + 4.0);
  tagW(ctx, 'IMP', 'IMP', 'Impeller · 6 vanes', '', W([PUMPS[0][0] + .24, PUMPS[0][1] - .14, PUMPS[0][2]]), u, UD.pump + .8, UD.pump + 4.0);
  tagW(ctx, 'CHK', 'CHK', 'Check valve', pct(s.chk[0]), W(CHECKS[0].p), u, UD.pump + .6, UD.pump + 3.6);
  tagW(ctx, 'SUP', 'SUP', 'Supply header', `${Math.max(0, s.front - S_PIN - 3.6).toFixed(1)} m`, W([X_HD, Y_HD + .1, 37.4]), u, 15.4, 19.0);
  tagW(ctx, 'VLV', 'VLV', 'Branch valves · butterfly', `${nOpen(s)}/${BUN.length} open`, W(V.mad(vf.p, vf.sh, .3)), u, 16.0, 21.4);
  const df = s.door[FOL];
  tagW(ctx, 'DOR', 'DOR', 'Hull door · rams ×2', df < .01 ? 'unlatched' : `${Math.round(108 * df)}°`, X.ap(Fw, [.75, .02, -.6]), u, UD.unl, UD.door + DDUR + .4);
  const ef = s.ext[FOL];
  tagW(ctx, 'JCK', 'JCK', 'Screw jacks ×2 · 3 stages', `${(EXT_S * ef).toFixed(2)} m`, X.ap(Fw, [0, -SC_DEP + EXT_S * ef * .75, -JZ_S]), u, UD.ext - .2, UD.ext + 3.6);
  tagW(ctx, 'BDL', 'BDL', `Tube bundle · ${SB.nw * SB.nd} tubes`, `${(SB.nw * SB.nd * SB.L).toFixed(0)} m`, X.ap(XFK.bun[bf], [.3, .25, .9]), u, UD.ext + 2.6, UD.ext + 6.2);
  tagW(ctx, 'HOS', 'HOS', 'Flexible hoses', 'Ø 80 mm', X.ap(Fw, [-.3, -SC_DEP + EXT_S * ef * .5, SB.L / 2 + .08]), u, UD.ext + 3.8, UD.bay);
  tagW(ctx, 'BAY', 'BAY', 'Keel bays ×3 · rams', '6 doors', W([BY_W + .1, -6.4, BY_Z[1] + 1.2]), u, UD.bay + .1, UD.bay + 3.2);
  tagW(ctx, 'KBD', 'KBD', `Keel bundle · ${KB.nw * KB.nd} tubes`, `${(EXT_K * s.kex[1]).toFixed(1)} m down`, X.ap(XFK.bun[NSC * 2 + 1], [.6, .3, .8]), u, UD.kex + 1.0, UD.kex + 5.8);
  tagW(ctx, 'CLD', 'CLD', 'Cold line · back to the gun', 'Ø 250 mm', W([PORT_C[0] + .13, -2.9, PORT_C[2]]), u, UD.sc0 + .4, UD.sc1 + .8);
}
function tagsR(u, ctx) {
  const Ws = ctx.Ws, W = p => X.ap(Ws, p), b3 = BUN[3];
  irInset(u, ctx);
  tagW(ctx, 'SEA', 'SEA', 'Sea surface · warm patch', `+${irPeak().toFixed(1)} °C`, W([wl(40) + 2.8, .05, 39]), u, 30.6, LEN_R - .6);
  tagW(ctx, 'SLG', 'SLG', 'Hot slug · down the hot line', `${Math.round(17 + 135 * thR(u))} °C`, W([PORT_H[0] + .13, PORT_H[1] - .5, PORT_H[2]]), u, PG0 - .2, PG0 + 2.6);
  tagW(ctx, 'BNK', 'BNK', 'Tube bank', `${Math.round(17 + 135 * b3.th)} °C`, X.ap(XFK.bun[3], [.3, .3, .5]), u, 10.4, 19.2);
  tagW(ctx, 'BOI', 'BOI', 'Boiling · bubble plumes', '', X.ap(XFK.bun[3], [-.2, .2, -.9]), u, 11.6, 15.6);
  tagW(ctx, 'CNV', 'CNV', 'Seawater · convecting', '', W([7.2, -2.6, 41.8]), u, 15.4, 19.4);
  tagW(ctx, 'KBK', 'KBK', 'Keel banks', `${Math.round(17 + 135 * BUN[NSC * 2 + 1].th)} °C`, X.ap(XFK.bun[NSC * 2 + 1], [.6, .3, .8]), u, 19.8, 23.6);
  tagW(ctx, 'STW', 'STW', 'Screw jacks · bundles in', `${(EXT_S * DS.ext[3]).toFixed(1)} m`, X.ap(XFK.bun[3], [0, .3, 0]), u, UR.ext - .2, UR.ext + 3.4);
  tagW(ctx, 'DRS', 'DRS', 'Hull doors · rams', DS.door[3] < .02 ? 'shut' : `${Math.round(108 * DS.door[3])}°`, W(hp(CELLS[3].zc, SC_G - .1, 1)), u, R_DOOR(1, 3) - .2, R_DOOR(1, 3) + RDDUR + .6);
}
/* the warm patch (RGKR): the sea surface over the sink in the thermal band, on a grid along the ship (z) and across it
   (x), worked out once a frame: puffs of warm water released where each bundle's plume reaches the surface (their
   strength from the heat at the source when the plume left it), each growing and drifting aft since; under them the
   older patch from the shot, far astern and fading. Shown in an inset (graphite -> lime -> near white, the waterline
   traced) and, from above the water, as a lime tint on the surface */
const IRZ0 = 14, IRZ1 = 66, IRX = 13, IRNZ = 64, IRNX = 32, NQ = 9, QDT = 2.2;
const IRG = new Float64Array(24 * NQ * 4 + 8), IRF = new Float32Array(IRNZ * IRNX);
let IRPK = 0, IRSTAMP = -1;
const irPeak = () => 4 * IRPK;
const irX = j => IRX - (j + .5) * 2 * IRX / IRNX, irZ = i => IRZ0 + (i + .5) * (IRZ1 - IRZ0) / IRNZ;
function irField() {
  let n = 0;
  for (let bi = 0; bi < BUN.length; bi++) {
    const b = BUN[bi], side = b.kind === 0, zc = side ? b.c.zc : b.c.zb, sx = side ? b.c.s : (bi & 1 ? 1 : -1), xs = sx * (wl(zc) + .5);
    const Tr = side ? 4.5 / BV(.5) + .4 : 7 / BV(.5) + .4;
    for (let q = 0; q < NQ; q++) {
      const age = q * QDT + (CLK % QDT), t0 = CLK - age - Tr - (b.s0 + b.L / 2) / VH;
      const o = n * 4; n++;
      IRG[o] = xs + sx * (.3 + .22 * age); IRG[o + 1] = zc - .4 * age; IRG[o + 2] = 1.1 + .32 * age; IRG[o + 3] = ss(.2, .7, thAt(t0)) * Math.exp(-age / 16);
    }
  }
  // the shot's patch: astern of the sink, both sides, spreading and fading as the ship comes home
  for (const sx of [1, -1]) { const o = n * 4; n++; IRG[o] = sx * 7.5; IRG[o + 1] = 24 - .25 * CLK; IRG[o + 2] = 4.2 + .06 * CLK; IRG[o + 3] = .5 * (1 - .45 * E.sat(CLK / LEN_R)); }
  return n;
}
function irGrid() {
  if (IRSTAMP === CLK) return; IRSTAMP = CLK;
  const n = irField(); let pk = 0;
  for (let j = 0; j < IRNX; j++) {
    const x = irX(j);
    for (let i = 0; i < IRNZ; i++) {
      const z = irZ(i); let H = 0;
      if (Math.abs(x) >= wlT(z)) for (let k = 0; k < n; k++) {
        const o = k * 4, em = IRG[o + 3]; if (em < .01) continue;
        const dz = z - IRG[o + 1], dx = x - IRG[o], s = IRG[o + 2], d2 = dx * dx + dz * dz; if (d2 > 9 * s * s) continue;
        H += em * Math.exp(-d2 / (2 * s * s)) * 1.4 / Math.sqrt(s);
      }
      IRF[j * IRNZ + i] = H; if (H > pk) pk = H;
    }
  }
  IRPK = Math.min(1, pk * .3);
}
/* the inset, top right under the corner text */
function irInset(u, ctx) {
  const A = ss(1.6, 2.8, u) * (1 - ss(LEN_R - 3.2, LEN_R - 1.6, u)); if (A < .01) return;
  irGrid();
  const g = K.octx, S = K.S, w = 340 * S, h = w * (2 * IRX) / (IRZ1 - IRZ0), x0 = K.BW - 74 * S - w, y0 = 104 * S, cw = w / IRNZ, ch = h / IRNX;
  g.save(); g.globalAlpha = A;
  g.fillStyle = 'rgba(11,12,10,.84)'; g.fillRect(x0, y0, w, h);
  for (let j = 0; j < IRNX; j++) for (let i = 0; i < IRNZ; i++) {
    const v = Math.min(1, IRF[j * IRNZ + i] * .3), px = x0 + i * cw, py = y0 + j * ch;
    if (v < .04) { if ((i + j) & 1) continue; g.fillStyle = 'rgba(238,238,228,.06)'; g.fillRect(px + cw * .38, py + ch * .38, cw * .24, ch * .24); continue; }
    const r = v < .6 ? 60 + 138 * v / .6 : 198 + 50 * (v - .6) / .4, gg = v < .6 ? 64 + 180 * v / .6 : 244 + 11 * (v - .6) / .4, bb = v < .6 ? 56 - 6 * v / .6 : 50 + 182 * (v - .6) / .4;
    g.fillStyle = `rgb(${r | 0},${gg | 0},${bb | 0})`; g.globalAlpha = A * (.3 + .7 * v);
    g.fillRect(px + .5, py + .5, cw - 1, ch - 1); g.globalAlpha = A;
  }
  // the waterline, the sink's span on it
  g.strokeStyle = 'rgba(238,238,228,.8)'; g.lineWidth = S;
  for (const sd of [1, -1]) { g.beginPath(); for (let i = 0; i <= 64; i++) { const z = IRZ0 + i / 64 * (IRZ1 - IRZ0), y = y0 + (IRX - sd * wlT(z)) / (2 * IRX) * h, x = x0 + (z - IRZ0) / (IRZ1 - IRZ0) * w; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  const zx = z => x0 + (z - IRZ0) / (IRZ1 - IRZ0) * w;
  g.strokeStyle = 'rgba(198,244,50,.7)'; g.beginPath(); g.moveTo(zx(29.6), y0 + h / 2); g.lineTo(zx(55.4), y0 + h / 2); g.stroke();
  g.strokeStyle = 'rgba(198,244,50,.5)'; g.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1);
  g.font = `400 ${10.5 * S}px "Geist Mono", monospace`; g.textBaseline = 'top';
  g.fillStyle = '#C6F432'; g.fillText('IR · SEA SURFACE', x0, y0 + h + 7 * S);
  g.fillStyle = 'rgba(238,238,228,.7)'; g.textAlign = 'right'; g.fillText(`+${irPeak().toFixed(1)} °C · BOW →`, x0 + w, y0 + h + 7 * S); g.textAlign = 'left';
  // the heat dumped against the pulse bank it came from: the bar is the 160 MJ bank, the tick the shot's waste heat
  { const yb = y0 + h + 26 * S, hb = 7 * S, dumped = qAt(QR.cum, u), kx = v => x0 + w * Math.min(1, v / BANK_MJ);
    g.fillStyle = 'rgba(11,12,10,.84)'; g.fillRect(x0, yb - 2 * S, w, hb + 4 * S);
    g.strokeStyle = 'rgba(238,238,228,.55)'; g.strokeRect(x0 + .5, yb + .5, w - 1, hb - 1);
    g.fillStyle = 'rgba(198,244,50,.85)'; g.fillRect(x0 + 1, yb + 1, Math.max(0, kx(dumped) - x0 - 2), hb - 2);
    g.strokeStyle = 'rgba(255,106,61,.9)'; g.beginPath(); g.moveTo(kx(WASTE_MJ) + .5, yb - 3 * S); g.lineTo(kx(WASTE_MJ) + .5, yb + hb + 3 * S); g.stroke();
    g.fillStyle = '#C6F432'; g.fillText(`TO SEA ${dumped.toFixed(1)} MJ`, x0, yb + hb + 6 * S);
    g.fillStyle = 'rgba(238,238,228,.7)'; g.textAlign = 'right'; g.fillText(`SHOT ${WASTE_MJ} MJ · BANK ${BANK_MJ} MJ`, x0 + w, yb + hb + 6 * S); g.textAlign = 'left'; }
  g.restore();
}
/* from above the water: the patch as a lime tint on the surface (the grid's cells as dots, a little jitter) */
function irSurface(fade) {
  irGrid(); if (IRPK < .02) return;
  const Ws = SWS;
  for (let j = 0; j < IRNX; j++) for (let i = 0; i < IRNZ; i++) {
    const v = Math.min(1, IRF[j * IRNZ + i] * .3); if (v < .05) continue;
    const x = irX(j), z = irZ(i), c = v > .7 ? HOT : LIME;
    for (let k = 0; k < 3; k++) {
      const jx = (hh(i * 3 + k, j) - .5) * .8, jz = (hh(j * 5 + k, i) - .5) * .8;
      apI(Ws, x + jx, .04, z + jz, PW);
      if (K.pj(PW[0], PW[1], PW[2]) && !P_.occd(K.PJ[0], K.PJ[1], K.PJ[2])) K.dot(K.PJ[0], K.PJ[1], K.PJ[2] < 25 ? 2 : 1, c[0], c[1], c[2], fade * (.18 + .55 * v));
    }
  }
}
/* the heat dumped in RGKR: P (MW) = rated x flow x the banks' mean heat; the store's content the rest to come */
const BANK_MJ = 160, WASTE_MJ = 64;                         // the pulse bank's store, a shot's waste heat (96 MJ out of the bank, 32 MJ out of the muzzle)
let QR = null;
function buildQR() {
  const n = Math.ceil(LEN_R / .05) + 1, P = new Float64Array(n), cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const u = i * .05; CMODE = 2; CLK = u; let m = 0;
    for (const b of BUN) m += thR(u - (b.s0 + b.L / 2) / VH) * (1 - .35 * .5);
    P[i] = RATED * flowR(u) * m / BUN.length;
    cum[i] = i ? cum[i - 1] + (P[i] + P[i - 1]) * .5 * .05 : 0;
  }
  QR = { P, cum, n, tot: cum[n - 1] };
}
const qAt = (A, u) => { const f = E.clamp(u / .05, 0, QR.n - 1.001), i = Math.floor(f); return A[i] + (A[i + 1] - A[i]) * (f - i); };
const NT = () => N_TUBES.toLocaleString('en').replace(',', ' ');
function roD(u) {
  const s = DS;
  let l1, l2;
  if (u < UD.mvH) { l1 = 'Heat sink · <b>X-ray</b>'; l2 = 'Hot line <b>from the gun</b> · keel port'; }
  else if (u < UD.front + .4) { l1 = 'Isolation valves · <b>opening</b>'; l2 = `Hot <b>${pct(s.mv[0])}</b> · cold <b>${pct(s.mv[1])}</b>`; }
  else if (u < UD.pump) { l1 = 'Coolant · <b>down the hot line</b>'; l2 = `Supply drum <b>${Math.min(100, Math.round(100 * E.sat((s.front - S_HOT) / (S_PIN - S_HOT))))} %</b> full`; }
  else if (u < UD.pump + 3.8) { l1 = `Supply pumps · <b>${Math.round(1780 * s.pumpR / 10) * 10} rpm</b>`; l2 = `Check valves <b>${pct(s.chk[0])}</b> · <b>${(.08 * s.pumpR).toFixed(2)} m³/s</b>`; }
  else if (u < UD.unl) { l1 = `Supply header · <b>valves ${nOpen(s)}/${BUN.length}</b>`; l2 = `Coolant <b>${s.front.toFixed(0)} m</b> along the loop`; }
  else if (u < UD.ext) { l1 = `Hull door · <b>${s.door[FOL] < .01 ? 'unlatched' : Math.round(108 * s.door[FOL]) + '°'}</b>`; l2 = 'Rams <b>×2</b> · <b>21 MPa</b>'; }
  else if (u < UD.bay) { l1 = `Tube bundle · <b>${(EXT_S * s.ext[FOL]).toFixed(2)} m</b> out`; l2 = `Screw jacks <b>×2</b> · <b>${s.ext.reduce((a, v) => a + (v > .98 ? 1 : 0), 0)}/${2 * NSC}</b> out`; }
  else if (u < UD.sc0) { const n = s.ext.reduce((a, v) => a + (v > .98 ? 1 : 0), 0) + s.kex.reduce((a, v) => a + (v > .98 ? 1 : 0), 0); l1 = `Keel bays · <b>${s.bay[2] > .98 ? 'open' : 'opening'}</b>`; l2 = `Bundles <b>${n}/${BUN.length}</b> · ${NT()} tubes`; }
  else if (u < UD.sc1 + .6) { const n = BUN.reduce((a, b) => a + ((b.kind ? b.c.zb : b.c.zc) + (b.kind ? KB : SB).L / 2 > SCZ ? 1 : 0), 0); l1 = `Scan · <b>bundle ${n}/${BUN.length}</b>`; l2 = `<b>${NT()}</b> tubes · <b>${TUBE_KM.toFixed(1)} km</b> · rated <b>${RATED} MW</b>`; }
  else { l1 = 'Heat sink · <b>deployed</b>'; l2 = `<b>${TUBE_KM.toFixed(1)} km</b> of tube · rated <b>${RATED} MW</b>`; }
  return { l1, l2, rate: 1 };
}
function roR(u) {
  const P = qAt(QR.P, u), H = QR.tot - qAt(QR.cum, u), th = BUN.reduce((a, b) => a + b.th, 0) / BUN.length;
  let l1, l2;
  if (u < PG0) { l1 = 'Heat sink · <b>stand-down</b>'; l2 = `Loop <b>${H.toFixed(1)} MJ</b> to go · ${P.toFixed(1)} MW`; }
  else if (u < UR.ext) { l1 = `Heat to sea · <b>${P.toFixed(1)} MW</b>`; l2 = `Banks <b>${Math.round(17 + 135 * th)} °C</b> · <b>${H.toFixed(1)} MJ</b> to go`; }
  else if (u < R_DOOR(-1, 0) + RDDUR) { l1 = 'Heat sink · <b>stowing</b>'; l2 = `Bundles <b>${DS.ext.reduce((a, v) => a + (v < .02 ? 1 : 0), 0)}/${2 * NSC}</b> in · doors <b>${DS.door.reduce((a, v) => a + (v < .02 ? 1 : 0), 0)}/${2 * NSC}</b> shut`; }
  else { l1 = 'Heat sink · <b>stowed</b>'; l2 = `Hull doors <b>shut</b> · ×${2 * NSC + 6}`; }
  return { l1, l2, rate: 1 };
}

/* ================= build ================= */
function build(ctx) {
  const t0 = performance.now();
  K = ctx.K; P_ = ctx.P_; LIME = ctx.LIME; HOT = ctx.HOT; WH = ctx.WH;
  T_RAIL = ctx.T_RAIL; TF = ctx.TF; T_RET = ctx.TRET1 - 3 + AT_R;
  if (P_.SINK) { PORT_H = P_.SINK.hot.slice(); PORT_C = P_.SINK.cold.slice(); Z_MN = (PORT_H[2] + PORT_C[2]) / 2; }
  buildHull(); layout(); buildClouds(); occBuild(); buildHBT(); buildRams(); buildFront(); buildFlow();
  // bubble sources on each bundle (upper half), and the motes
  const r = M3.rng(5150);
  SRC = BUN.map(b => { const B = b.kind ? KB : SB, n = b.kind ? NSRC_K : NSRC_S, W = (B.nw - 1) * B.p, D = (B.nd - 1) * B.p, A = new Float32Array(n * 5); for (let k = 0; k < n; k++) { A[k * 5] = (r() - .5) * W; A[k * 5 + 1] = (r() - .5) * D; A[k * 5 + 2] = (r() - .5) * B.L * .95; A[k * 5 + 3] = r(); A[k * 5 + 4] = r(); } return A; });
  SNOW = new Float32Array(1600 * 5); for (let i = 0; i < 1600; i++) { SNOW[i * 5] = r() * 26; SNOW[i * 5 + 1] = -r() * 26; SNOW[i * 5 + 2] = r() * 26; SNOW[i * 5 + 3] = r(); SNOW[i * 5 + 4] = r() * TAU; }
  buildQR(); buildCau(); buildCrest();
  RGK.ms = performance.now() - t0;
  let n = 0; for (const k in CLK_) { const v = CLK_[k]; for (const m of Array.isArray(v) ? v : [v]) n += m.lv[0].length / 6; } RGK.n0 = n;
}
/* when the lens crosses the surface going down (dir -1) or up (+1), from a rig (ship frame, the ship taken level) */
function crossing(rig, len, ctx, dir) {
  const W0 = X.make(R.I(), [0, 0, 0]), c = { Ws: W0, camOld: ctx.camAt(rig === RIG_D ? ctx.T_RAIL : T_RET) };
  let p = null;
  for (let u = 0; u <= len; u += .05) { const y = camAtRig(rig, u, c).eye[1]; if (p !== null && (dir < 0 ? p >= -.12 && y < -.12 : p < -.12 && y >= -.12)) return u; p = y; }
  return -1;
}
function sfxKit(SFX) {
  return {
    clunk: (g) => () => { SFX.tone(110, 60, .25, 'square', .028 * (g || 1)); SFX.noise(.25, 400, 1, .035 * (g || 1), .005); },
    tick: () => SFX.tone(1650, 1650, .04, 'square', .007),
    clack: () => { SFX.tone(420, 300, .08, 'square', .012); SFX.noise(.08, 2400, .6, .012, .002); },
    whirr: (f0, f1, d, g) => () => { SFX.tone(f0, f1, d, 'sawtooth', g || .009); SFX.noise(d, 700, .7, .01, .2); },
    hyd: d => () => { SFX.tone(220, 260, d, 'triangle', .008); SFX.noise(d, 1400, .5, .008, .3); },
    splash: () => { SFX.noise(.9, 1800, .5, .05, .01); SFX.noise(2.4, 300, .8, .03, .2); },
    sweep: () => SFX.tone(900, 2500, .9, 'sine', .01),
  };
}
function buildD(ctx) {
  RIG_D = camRig(CAM_D, ctx.T_RAIL, LEN_D, ctx);
  for (const k of ['HOT', 'IVH', 'DRM', 'PMP', 'IMP', 'CHK', 'SUP', 'VLV', 'DOR', 'JCK', 'BDL', 'HOS', 'BAY', 'KBD', 'CLD']) TG[k] = K.mkTag();
  const SFX = ctx.STAGE.SFX, S = sfxKit(SFX), dn = crossing(RIG_D, LEN_D, ctx, -1), up = crossing(RIG_D, LEN_D, ctx, 1);
  RGKD.cues = [
    [UD.xo0, S.sweep], [UD.mvH, S.whirr(150, 190, 1.4, .008)], [UD.mvH + 1.4, S.clunk(.7)], [UD.mvC, S.whirr(140, 180, 1.4, .007)], [UD.mvC + 1.4, S.clunk(.6)],
    [UD.front, () => SFX.noise(3.5, 500, .7, .012, .8)],
    ...(dn > 0 ? [[dn, S.splash], [dn + .3, () => SFX.noise(14, 220, 1, .012, 2)]] : []),
    [UD.pump, () => { SFX.tone(40, 160, 2.2, 'sawtooth', .014); SFX.tone(80, 320, 2.2, 'triangle', .01); }], [UD.pump + .9, S.clack], [UD.pump + 1.0, S.clack],
    [UD.pump + 2.4, () => SFX.noise(6, 900, .6, .012, 1)],
    ...VALVES.filter(v => v.end < 0).map(v => [v.t, S.tick]),
    [UD.unl, S.clunk(1)], [UD.door, S.hyd(DDUR)], [UD.door + DDUR, S.clunk(.8)],
    ...CELLS.filter(c => !(c.s > 0 && c.i === FOL)).map(c => [D_DOOR(c.s, c.i) + DDUR, S.clunk(.35)]),
    [UD.ext, S.whirr(90, 160, EDUR, .011)], [UD.ext + EDUR, S.tick],
    [D_BAY(0), S.clunk(1)], [D_BAY(1), S.clunk(.8)], [D_BAY(2), S.clunk(.8)], [UD.bay + .1, S.hyd(BDUR + 1)], [UD.kex, S.whirr(70, 130, KDUR, .012)],
    [UD.sc0, S.sweep],
    ...(up > 0 ? [[up, S.splash]] : []),
  ];
}
function buildR(ctx) {
  RIG_R = camRig(CAM_R, T_RET, LEN_R, ctx);
  for (const k of ['SEA', 'SLG', 'BNK', 'BOI', 'CNV', 'KBK', 'STW', 'DRS']) TG[k] = K.mkTag();
  const SFX = ctx.STAGE.SFX, S = sfxKit(SFX), dn = crossing(RIG_R, LEN_R, ctx, -1), up = crossing(RIG_R, LEN_R, ctx, 1);
  RGKR.cues = [
    ...(dn > 0 ? [[dn, S.splash], [dn + .3, () => SFX.noise(20, 220, 1, .012, 2)]] : []),
    [PG0, () => { SFX.tone(60, 200, 1.6, 'sawtooth', .012); SFX.noise(3, 500, .7, .012, .6); }],
    [PG0 + 2.4, () => { SFX.noise(6, 2600, .4, .016, .8); SFX.noise(6, 160, 1, .02, 1); }], [PG0 + 3.4, () => SFX.noise(5, 5200, .3, .01, .6)],
    [UR.shut, S.whirr(150, 80, 1.8, .011)], [UR.vlv, S.tick], [UR.vlv + .2, S.tick],
    [UR.ext, S.whirr(160, 90, RXDUR, .011)], [R_KEX(0), S.whirr(120, 70, RXDUR, .01)],
    ...CELLS.filter(c => c.s > 0).map(c => [R_DOOR(c.s, c.i) + RDDUR, S.clunk(.6)]), ...[0, 1, 2].map(b => [R_BAY(b) + BDUR, S.clunk(.8)]),
    ...(up > 0 ? [[up, S.splash]] : []),
  ];
}

/* guarded entry points: a failure here is logged and the sink stays out of the frame; it never stops the film */
let OK = false, OKD = false, OKR = false;
const guard = (name, fn, fb) => function () { try { return fn.apply(null, arguments); } catch (e) { console.error('heat sink ' + name, e); OK = false; return typeof fb === 'function' ? fb.apply(null, arguments) : fb; } };
const camOld = (u, ctx) => ctx.camOld;
const roNone = () => ({ l1: 'Heat sink', l2: '', rate: 1 });
window.RGK = { build: guard('build', ctx => { build(ctx); OK = true; }), drawBase: guard('drawBase', (T, ctx) => { if (OK) drawBase(T, ctx); }), dbg: () => ({ CEIL, CELLS, BAYS, BUN, XK, DS, QR, CLK_, PIPES, VALVES, MVALVES, CHECKS, RAMS, JACKS, FLINES, UD, UR, FRT, S: { S_HOT, S_PIN, S_RET, S_END, T_RPUMP }, np: () => { const n = NPK; NPK = 0; return n; }, hp, girth, wl, dk, thB, thR }) };
window.RGKD = { len: LEN_D, room: true, chapters: [{ t: 0, title: 'Heat sink' }, { t: UD.unl - .6, title: 'Heat sink · out' }], cues: [],
  build: guard('RGKD build', ctx => { if (OK) { buildD(ctx); OKD = true; } }),
  cam: guard('RGKD cam', (u, ctx) => OK && OKD ? camD(u, ctx) : ctx.camOld, camOld),
  draw: guard('RGKD draw', (u, ctx) => { if (OK && OKD) drawD(u, ctx); }),
  xray: guard('RGKD xray', (u, XS, ctx) => OK && OKD ? xrayD(u, XS, ctx) : false, false),
  readout: guard('RGKD readout', u => OK && OKD ? roD(u) : roNone(), roNone),
  tags: guard('RGKD tags', (u, ctx) => { if (OK && OKD) tagsD(u, ctx); }) };
window.RGKR = { len: LEN_R, at: AT_R, room: false, chapters: [{ t: 0, title: 'Heat to sea' }, { t: UR.ext - .6, title: 'Heat sink · stow' }], cues: [],
  build: guard('RGKR build', ctx => { if (OK) { buildR(ctx); OKR = true; } }),
  cam: guard('RGKR cam', (u, ctx) => OK && OKR ? camR(u, ctx) : ctx.camOld, camOld),
  draw: guard('RGKR draw', (u, ctx) => { if (OK && OKR) drawR(u, ctx); }),
  xray: guard('RGKR xray', (u, XS, ctx) => OK && OKR ? xrayR(u, XS, ctx) : false, false),
  readout: guard('RGKR readout', u => OK && OKR ? roR(u) : roNone(), roNone),
  tags: guard('RGKR tags', (u, ctx) => { if (OK && OKR) tagsR(u, ctx); }) };
})();
