/* INTERCEPT · damage (window.IDMG): the orbital railgun ship broken by the destroyer's round, as a pure function of
   tH (sim s since the round touched the hull). IDMG.path(P) -> the round's line in the platform frame (the act turns
   the platform so the closing velocity runs along it); IDMG.build(o) -> the damage state D, used by the act and by any
   later act that shows the same ship broken (build it with the same o, call D.draw / D.hullClip / D.ringEdit / D.tilt /
   D.gimbal / D.portals with the same tH).

   Platform frame throughout (pc_orbital_railgun_platform.js: metres, +Z the bore toward the muzzle, +Y its top, +X
   starboard). o: { P (the platform model), L (the lattice renderer, ORL), K (its kit, ORK), VREL (closing speed m/s),
   KE (J), L_SUN, psi0 (ring A's spin angle at the hit), OMEGA (its spin rate), path (IDMG.path's, optional) }.

   What happens (spectacle, game-visual; shapes and numbers plausible, not an engineering model):
     streak   the round (2 m, 19 kg, 11.5 km/s) meets the starboard shoulder (the frustum's sloped face) at 2.5 deg from
              ahead and rips along it for 360 m in 31 ms: a furrow 5 m wide at the entry, 29 m at its end, 16 m deep
              there (the plating peeled back along both lips in torn plates, white-hot, cooling through amber to
              ember over seconds; cut decks and frames in its walls; a molten floor); cracks run out from its lips
              along the plating seams, incandescent; the round broken up at its end in a last burst.
     fan      the furrow's ejecta and the round's own remains on straight lines for ever: ~38 000 bits of dust and
              ~1 300 modelled pieces (plates, beams, cables, boxes, pipes) in a comet-shaped cone downstream of the
              furrow (2-14 deg off the hull), spinning, glowing pieces cooling over seconds, sunlit grit glinting as
              it tumbles; a spear of the round's remains at 3-9 km/s; shafts of light through the dust from the head.
     release  the furrow cut ring A's feed bus where it runs under the shoulder: the short dumps the bus (bursts along
              the hull 0.30-0.95 s: 150 GJ) and bursts four of ring A's 28 momentum wheels at the nodes nearest the
              pylon (21.4 GJ each); one chord between them breaks (its halves fly off on the rim's tangent; the ring,
              unbalanced, wobbles). 0.24 TJ of the ship's 1.2 TJ let go.
     break    the hull fails at frame 258 (between the furrow and ring A): a cut 10 m wide blown out of it, the aft
              section (the stabiliser rings, the tower, the engines, the reactor) turning about a hinge along the keel
              until it hangs ~27 deg off the line, a V open at the deck, its torn edges glowing, the spine's members
              bent across the gap, venting. The fore section (the chamber, the bay, the switchyard) stays whole.
   D exports: draw(PP, Wt, tH, rate, cam, Wf), hullClip(tH) ({ clipM, brk: { on, R, T, cutF, cutA } }: the renderer
   draws the platform twice when brk.on), portals(Wt, tH), ringEdit(PP, tH), tilt(tH), gimbal(tH), aftXf(tH), toSec(p,
   tH) (a platform point where its section has moved it), lensFX(Kv, I) (the screen flashes), tags(tH, put, aOf),
   info(tH), energy, and the state: frags [{ tpl, p0, v, ax, w, R0, t0, h0, tau, size, kind }], fragPose(i, tH, out)
   (free frame), holes [entry, the front section's deepest wound], ring { ri, chord, tC, Q, thC, halves }, brk { zb, hinge,
   axis, tB }, TX (the furrow's time), N (counts). */
(function () {
'use strict';
const { V, R, X, E, rng } = M3;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const ss = E.ss;
const HOT = [248, 255, 232], WHT = [255, 250, 238], WH = [238, 238, 228], AMB = [255, 212, 150], FIRE = [255, 182, 112], EMB = [255, 108, 48],
  ICE = [226, 230, 232], GRIT = [216, 212, 200];
const CH = 41;
/* the hull's section (half-widths at height, the frustum's cross-section at the prow, scaled by kz(z)) and the outline
   at the break with deck 2's terrace on top */
const SECT = [[27, 27], [42, 6], [38, 4], [38, -4], [42, -6], [30, -27], [-30, -27], [-42, -6], [-38, -4], [-38, 4], [-42, 6], [-27, 27]];
const OUTL = [[27, 27], [20, 27], [16, 37], [-16, 37], [-20, 27], [-27, 27], [-42, 6], [-38, 4], [-38, -4], [-42, -6], [-30, -27], [30, -27], [42, -6], [38, -4], [38, 4], [42, 6]];
const ZB = -258;

/* the round's line: the starboard shoulder is a plane (the frustum's face from (27, 27) to (42, 6) x kz(z)); the round
   meets it at z -140 a little below its top edge, 2.5 deg into it, drifting 1.4 deg down it, running aft */
function path(P) {
  const z1 = -100, z2 = -520, k1 = P.kz(z1), k2 = P.kz(z2);
  const A1 = [27 * k1, 27 * k1, z1], B1 = [42 * k1, 6 * k1, z1], A2 = [27 * k2, 27 * k2, z2];
  let N = V.norm(V.cross(V.sub(B1, A1), V.sub(A2, A1))); if (N[0] < 0) N = V.mul(N, -1);
  const Th = V.norm(V.sub(B1, A1));
  let Lh = V.norm(V.cross(N, Th)); if (Lh[2] > 0) Lh = V.mul(Lh, -1);
  const zE = -140, uE = .42, kE = P.kz(zE), H = [(27 + 15 * uE) * kE, (27 - 21 * uE) * kE, zE];
  const INC = 2.5 * DEG, DRIFT = 1.4 * DEG;
  const Din = V.norm(V.add(V.mul(Lh, Math.cos(DRIFT)), V.mul(Th, Math.sin(DRIFT))));
  const DP = V.norm(V.sub(V.mul(Din, Math.cos(INC)), V.mul(N, Math.sin(INC))));
  return { H, DP, N, Th, Lh, Din, INC, L: 360, c0: V.dot(N, H) };
}

/* ---------------- small math (no allocation in the draw) ---------------- */
function rotAx(ax, a, o) { const c = Math.cos(a), s = Math.sin(a), k = 1 - c, x = ax[0], y = ax[1], z = ax[2]; o[0] = c + x * x * k; o[1] = x * y * k - z * s; o[2] = x * z * k + y * s; o[3] = y * x * k + z * s; o[4] = c + y * y * k; o[5] = y * z * k - x * s; o[6] = z * x * k - y * s; o[7] = z * y * k + x * s; o[8] = c + z * z * k; return o; }
function mul3(A, B, o) { for (let i = 0; i < 3; i++) { const a0 = A[i * 3], a1 = A[i * 3 + 1], a2 = A[i * 3 + 2]; o[i * 3] = a0 * B[0] + a1 * B[3] + a2 * B[6]; o[i * 3 + 1] = a0 * B[1] + a1 * B[4] + a2 * B[7]; o[i * 3 + 2] = a0 * B[2] + a1 * B[5] + a2 * B[8]; } return o; }
const ap = (Xf, p, o) => { const M = Xf.R, t = Xf.T; const x = p[0], y = p[1], z = p[2]; o[0] = M[0] * x + M[1] * y + M[2] * z + t[0]; o[1] = M[3] * x + M[4] * y + M[5] * z + t[1]; o[2] = M[6] * x + M[7] * y + M[8] * z + t[2]; return o; };
const apD = (Xf, d, o) => { const M = Xf.R, x = d[0], y = d[1], z = d[2]; o[0] = M[0] * x + M[1] * y + M[2] * z; o[1] = M[3] * x + M[4] * y + M[5] * z; o[2] = M[6] * x + M[7] * y + M[8] * z; return o; };
/* o = A * B (rigid) */
function comp(A, B, o) { mul3(A.R, B.R, o.R); const M = A.R, t = B.T; o.T[0] = M[0] * t[0] + M[1] * t[1] + M[2] * t[2] + A.T[0]; o.T[1] = M[3] * t[0] + M[4] * t[1] + M[5] * t[2] + A.T[1]; o.T[2] = M[6] * t[0] + M[7] * t[1] + M[8] * t[2] + A.T[2]; return o; }
const fr = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
/* heat 0..2 -> a colour (ember, amber, white-hot) */
const HCOL = [0, 0, 0];
function heatCol(h) {
  const o = HCOL;
  if (h >= 1.3) { o[0] = HOT[0]; o[1] = HOT[1]; o[2] = HOT[2]; return o; }
  let a, b, w;
  if (h > .62) { a = FIRE; b = HOT; w = (h - .62) / .68; } else if (h > .22) { a = EMB; b = FIRE; w = (h - .22) / .4; } else { a = EMB; b = EMB; w = 0; }
  o[0] = a[0] + (b[0] - a[0]) * w; o[1] = a[1] + (b[1] - a[1]) * w; o[2] = a[2] + (b[2] - a[2]) * w; return o;
}

function build(o) {
  const P = o.P, L = o.L, K = o.K, Body = L.Body;
  const D = { N: {}, poseBack: null, wobK: 1, ringAlpha: 1 };
  const r = rng(73311);
  const rr = (a, b) => a + (b - a) * r();
  const perp = d => { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 1, 0]; const u = V.norm(V.cross(d, a)); return [u, V.cross(d, u)]; };
  const PT = o.path || path(P);
  const H = PT.H, DP = PT.DP, N = PT.N, VREL = o.VREL, PATH_L = PT.L, TX = PATH_L / VREL, INC = PT.INC, SI = Math.sin(INC);
  const Pr = V.norm(V.sub(DP, V.mul(N, V.dot(N, DP)))), Eh = V.norm(V.cross(N, Pr)), CI = V.dot(DP, Pr);
  D.TX = TX; D.path = PT; D.PATH_L = PATH_L;
  const hw = s => 2.4 + .034 * Math.max(0, s);
  const qAt = (s, out) => { out = out || [0, 0, 0]; const d = s * SI; for (let k = 0; k < 3; k++) out[k] = H[k] + DP[k] * s + N[k] * d; return out; };
  const pAt = (s, out) => { out = out || [0, 0, 0]; for (let k = 0; k < 3; k++) out[k] = H[k] + DP[k] * s; return out; };
  const sNowOf = tH => Math.max(0, Math.min(PATH_L, tH * VREL));
  // the fan's axis: downstream along the round's line, lifted 14 deg off the shoulder
  const AXF = V.norm(V.add(V.mul(DP, Math.cos(14 * DEG)), V.mul(N, Math.sin(14 * DEG))));
  const XEND = qAt(PATH_L);

  /* ---------- the break ---------- */
  const KB = P.kz(ZB);
  const nF = V.norm([.05, .09, 1]), dF = V.dot(nF, [0, 0, ZB + 5]);       // the fore section keeps nF.p >= dF
  const nA = V.norm([-.07, -.05, 1]), dA = V.dot(nA, [0, 0, ZB - 5]);     // the aft keeps nA.p <= dA
  const secOf = p => (nF[0] * p[0] + nF[1] * p[1] + nF[2] * p[2] >= dF) ? 0 : (nA[0] * p[0] + nA[1] * p[1] + nA[2] * p[2] <= dA) ? 1 : -1;
  const HG = [0, -27 * KB, ZB], AXB = V.norm([1, -.3, 0]);
  const SGB = (() => { const d = V.sub([0, 37 * KB, ZB], HG), m = V.cross(AXB, d); return m[2] < 0 ? 1 : -1; })();
  const TB = 1.0, THM = 33 * DEG, TAUB = 1.4;
  const thB = tH => { const t = tH - TB; if (t <= 0) return 0; return SGB * (THM * (1 - Math.exp(-t / TAUB)) + 1.5 * DEG * Math.exp(-t / 3.2) * Math.sin(TAU * .31 * t) * (1 - Math.exp(-t / .5)) + .08 * DEG * t); };
  function aftAt(tH, o_) { const th = thB(tH); o_.th = th; o_.on = tH > TB; rotAx(AXB, th, o_.R); const M = o_.R; o_.T[0] = HG[0] - (M[0] * HG[0] + M[1] * HG[1] + M[2] * HG[2]); o_.T[1] = HG[1] - (M[3] * HG[0] + M[4] * HG[1] + M[5] * HG[2]); o_.T[2] = HG[2] - (M[6] * HG[0] + M[7] * HG[1] + M[8] * HG[2]); return o_; }
  const AFT = { R: new Float64Array(9), T: [0, 0, 0], on: false, th: 0 };
  D.aftXf = tH => aftAt(tH, { R: new Float64Array(9), T: [0, 0, 0], on: false, th: 0 });
  D.brk = { zb: ZB, hinge: HG, axis: AXB, tB: TB, sign: SGB, thMax: THM, secOf, nF, dF, nA, dA };
  D.theta = tH => Math.abs(thB(tH));
  /* a platform point where its section has carried it (aft: turned with the aft section) */
  const TSP = [0, 0, 0];
  D.toSec = (p, tH, out) => { out = out || [0, 0, 0]; if (tH <= TB || secOf(p) !== 1) { out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; } aftAt(tH, AFT); ap(AFT, p, TSP); out[0] = TSP[0]; out[1] = TSP[1]; out[2] = TSP[2]; return out; };

  /* ---------- shapes ---------- */
  function tear(a, b, nz, rough, depth, out) {
    out = out || [a];
    const rec = (p, q, d, amp) => {
      if (d === 0) { out.push(q); return; }
      const m = V.lerp(p, q, .5 + (r() - .5) * .2), side = V.norm(V.cross(nz, V.sub(q, p))), off = (r() - .5) * 2 * amp;
      const mm = V.mad(m, side, off);
      rec(p, mm, d - 1, amp * .55); rec(mm, q, d - 1, amp * .55);
    };
    rec(a, b, depth, V.dist(a, b) * rough);
    return out;
  }
  function plate(B, poly, c, cell, opt) {
    opt = opt || {};
    const n = [0, 0, 1];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (V.dist(a, b) < 1e-3) continue;
      B.trap(a, V.sub(b, a), [0, 0, 0], V.sub(c, a), cell, { n, two: true, br: opt.br || .9, edge: false, ch: CH, q: 0 });
    }
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const q = opt.qOf ? opt.qOf(i) : 1; B.line(a, b, q === 2 ? .8 : 1.0, CH, q); }
    if (opt.seams) for (const sy of opt.seams) {
      let x0 = 1e9, x1 = -1e9;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[1] - sy) * (b[1] - sy) <= 0 && a[1] !== b[1]) { const x = a[0] + (b[0] - a[0]) * (sy - a[1]) / (b[1] - a[1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
      if (x1 > x0) B.line([x0, sy, .01], [x1, sy, .01], .45, CH, 0);
    }
    return B;
  }
  function plateTpl(s, seed) {
    const B = new Body('frag' + seed), m = 5 + Math.floor(r() * 4), pts = [];
    for (let k = 0; k < m; k++) { const a = k / m * TAU + rr(-.25, .25), rad = s * .5 * rr(.55, 1.1); pts.push([Math.cos(a) * rad, Math.sin(a) * rad * rr(.5, 1), 0]); }
    let poly = [];
    for (let k = 0; k < m; k++) { const seg = tear(pts[k], pts[(k + 1) % m], [0, 0, 1], .16, s > 2 ? 4 : s > .8 ? 3 : 2); seg.pop(); poly = poly.concat(seg); }
    plate(B, poly, [0, 0, 0], Math.max(.12, Math.min(.45, s / 7)), { seams: s > 1.4 ? [rr(-.2, .2) * s] : null });
    if (s > 1.2 && r() < .7) { const L_ = s * .4; B.tube([-L_, rr(-.1, .1) * s, -.08], [L_, rr(-.1, .1) * s, -.08], .05, .6, CH, 2); }
    B.done(); B.size = s; B.kind = 'plate'; return B;
  }
  function beamTpl(s, seed) {
    const B = new Body('beam' + seed), bend = rr(-.7, .7), h = .25 + .05 * s, w = h * .7;
    const a = [-s / 2, 0, 0], m = [0, 0, 0], b = [s / 2 * Math.cos(bend), s / 2 * Math.sin(bend), 0];
    for (const [p, q] of [[a, m], [m, b]]) {
      const d = V.norm(V.sub(q, p)), up = [0, 0, 1], sd = V.cross(up, d);
      for (const sg of [-1, 1]) B.tube(V.mad(p, up, sg * h / 2), V.mad(q, up, sg * h / 2), .03, .8, CH, 0);
      B.panel(V.mad(p, up, -h / 2), V.sub(q, p), [0, 0, h], [.12, .12], { n: sd, two: true, br: .8, edge: false, ch: CH, q: 0 });
      for (const sg of [-1, 1]) B.panel(V.add(V.mad(p, up, sg * h / 2), V.mul(sd, -w / 2)), V.sub(q, p), V.mul(sd, w), [.12, .12], { n: up, two: true, br: .7, edge: false, ch: CH, q: 0 });
    }
    B.line(V.mad(b, [0, 0, 1], -h / 2), V.mad(b, [0, 0, 1], h / 2), 1, CH, 1); B.line(V.mad(a, [0, 0, 1], -h / 2), V.mad(a, [0, 0, 1], h / 2), 1, CH, 1);
    B.done(); B.size = s; B.kind = 'beam'; return B;
  }
  function cableTpl(s, seed) {
    const B = new Body('cab' + seed), n = 3 + Math.floor(r() * 4), ph = rr(0, TAU);
    for (let c = 0; c < n; c++) {
      const P_ = []; const oy = (c - n / 2) * .06, oz = rr(-.04, .04);
      for (let i = 0; i <= 16; i++) { const t = i / 16 - .5, x = t * s; P_.push([x, oy + .25 * s * Math.sin(t * 2.4 + ph) * .3, oz + .2 * s * Math.cos(t * 3.1 + ph) * .2]); }
      for (let i = 0; i < 16; i++) B.line(P_[i], P_[i + 1], .8, CH, i === 0 || i === 15 ? 1 : 0);
    }
    B.done(); B.size = s; B.kind = 'cable'; return B;
  }
  function boxTpl(s, seed) {
    const B = new Body('box' + seed), h = [s * .5, s * rr(.25, .45), s * rr(.3, .5)];
    B.obox([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], h, Math.max(.1, s / 8), { br: .85, edge: .8, ch: CH, q: 0 });
    const c = [h[0], h[1], h[2]];
    B.line(c, V.add(c, [rr(.1, .4) * s, rr(-.2, .2) * s, rr(.1, .3) * s]), 1, CH, 1);
    for (let k = 0; k < 3; k++) B.line([-h[0], -h[1] + k * h[1] * .6, h[2] + .01], [h[0] * .2, -h[1] + k * h[1] * .6, h[2] + .01], .5, CH, 0);
    B.done(); B.size = s; B.kind = 'box'; return B;
  }
  function pipeTpl(s, seed) {
    const B = new Body('pipe' + seed), rad = .08 + .04 * s;
    B.cyl([0, 0, -s / 2], [0, 0, s / 2], rad, { cell: Math.max(.06, rad * .6), br: .85, ch: CH, q: 0, two: true });
    B.ring([0, 0, s / 2], [1, 0, 0], [0, 1, 0], rad, 14, 1, CH, 1); B.ring([0, 0, -s / 2], [1, 0, 0], [0, 1, 0], rad, 14, 1, CH, 1);
    B.done(); B.size = s; B.kind = 'pipe'; return B;
  }
  const TPL = { plate: [], beam: [], cable: [], box: [], pipe: [] };
  let sd = 0;
  for (const s of [.3, .4, .55, .7, .9, 1.15, 1.45, 1.8, 2.3, 2.9, 3.6, 4.6, 5.8, 7.0, 8.5, 10.5, 12.5]) for (let k = 0; k < 4; k++) TPL.plate.push(plateTpl(s * rr(.9, 1.1), sd++));
  for (const s of [.8, 1.4, 2.2, 3.4, 5.0, 7.5]) for (let k = 0; k < 2; k++) TPL.beam.push(beamTpl(s, sd++));
  for (const s of [1, 2, 3.5, 6]) for (let k = 0; k < 2; k++) TPL.cable.push(cableTpl(s, sd++));
  for (const s of [.4, .7, 1.1, 1.8, 2.8]) for (let k = 0; k < 2; k++) TPL.box.push(boxTpl(s, sd++));
  for (const s of [.8, 1.6, 2.8]) TPL.pipe.push(pipeTpl(s, sd++));
  const pickTpl = (kind, s) => { const A = TPL[kind]; let best = A[0], bd = 1e9; for (const B of A) { const d = Math.abs(Math.log(B.size / s)) + r() * .25; if (d < bd) { bd = d; best = B; } } return best; };

  /* ---------- the furrow: its centre on the shoulder, its jagged lips, walls and floor, sampled every 2 m ---------- */
  const NS = Math.round(PATH_L / 2) + 1, DS = PATH_L / (NS - 1);
  const FU = new Float64Array(NS * 3), FL_ = new Float64Array(NS * 3), FWU = new Float64Array(NS * 3), FWL = new Float64Array(NS * 3), FC = new Float64Array(NS * 3), FT0 = new Float64Array(NS), FSEC = new Int8Array(NS), FK = new Float32Array(NS);
  { const ph = [rr(0, TAU), rr(0, TAU), rr(0, TAU), rr(0, TAU)], q = [0, 0, 0], pp = [0, 0, 0];
    for (let i = 0; i < NS; i++) {
      const s = i * DS, w = hw(s);
      qAt(s, q); pAt(s, pp);
      const jU = .17 * Math.sin(s * .19 + ph[0]) + .1 * Math.sin(s * .57 + ph[1]) + (r() - .5) * .16, jL = .17 * Math.sin(s * .23 + ph[2]) + .1 * Math.sin(s * .61 + ph[3]) + (r() - .5) * .16;
      const wu = w * (1 + jU), wl = w * (1 + jL), dep = s * SI;
      for (let k = 0; k < 3; k++) {
        FU[i * 3 + k] = q[k] + Eh[k] * wu + N[k] * .3; FL_[i * 3 + k] = q[k] - Eh[k] * wl + N[k] * .3;
        // the walls: down to a rounded floor (the channel narrower than the lips), the cut decks' edges half way
        FWU[i * 3 + k] = q[k] + Eh[k] * wu * .62 - N[k] * dep * .55; FWL[i * 3 + k] = q[k] - Eh[k] * wl * .62 - N[k] * dep * .55;
        FC[i * 3 + k] = pp[k] + N[k] * Math.min(dep * .2, 1.5);
      }
      FT0[i] = s / VREL; FSEC[i] = secOf(q); FK[i] = rr(.75, 1.15);
    }
  }
  const sF = (() => { let i = 0; while (i < NS - 1 && FSEC[i + 1] === 0) i++; return i * DS; })();       // the furrow's last metre on the fore section
  D.furrow = { H, X: XEND, DP, N, Eh, L: PATH_L, sF, hw };
  // the holes the later acts frame: the entry, and the fore section's deepest wound (the furrow 20 m short of the cut)
  const W1s = Math.max(10, sF - 20), Wq = qAt(W1s);
  D.holes = [{ key: 'in', C: H.slice(), n: N.slice(), rad: hw(0) * 1.16, t0: 0 }, { key: 'out', C: Wq, n: N.slice(), rad: hw(W1s) * 1.16, t0: W1s / VREL }];

  /* ---------- the peeled plating along both lips (hinged on the lip, peeled back as the round passes) ---------- */
  const petals = [];
  for (const side of [1, -1]) {
    let s = rr(2, 5);
    while (s < PATH_L - 5) {
      const len = rr(6.5, 10.5), sm = s + len / 2, w = hw(sm), q = qAt(sm), lip = V.add(q, V.mul(Eh, side * w * rr(.95, 1.08)));
      const sec = secOf(lip); if (sec < 0) { s += len; continue; }
      const z_ = N, y_ = V.mul(Eh, -side), x_ = V.norm(V.cross(y_, z_));
      const wid = w * rr(.72, 1.02);
      const a = [-len / 2, 0, 0], b = [len / 2, 0, 0], tip1 = [len * rr(.15, .45), wid * rr(.8, 1), 0], tip2 = [-len * rr(.1, .4), wid * rr(.7, 1), 0];
      let poly = tear(b, tip1, [0, 0, 1], .2, 3); poly.pop(); poly = poly.concat(tear(tip1, tip2, [0, 0, 1], .28, 3)); poly.pop(); poly = poly.concat(tear(tip2, a, [0, 0, 1], .2, 3)); poly.pop();
      const root = tear(a, b, [0, 0, 1], .04, 2); root.pop();
      const B = new Body('petal' + petals.length);
      plate(B, root.concat(poly), [0, wid * .35, 0], .34, { seams: [wid * .4], qOf: i => i < root.length - 1 ? 2 : 1 });
      if (r() < .7) B.tube([-len * .3, wid * .15, -.3], [len * .2, wid * .85, -.3], .09, .6, CH, 2);
      B.done(); B.size = wid; B.kind = 'petal';
      const Rm = [x_[0], y_[0], z_[0], x_[1], y_[1], z_[1], x_[2], y_[2], z_[2]];
      const off = r() < .2 && sm > 30;
      petals.push({ B, Rm, hinge: lip, fin: rr(105, 168) * DEG, tau: rr(.003, .008), t0: sm / VREL + rr(0, .0012), sec, off, side, s: sm, h0: rr(1.6, 2.0),
        v: off ? V.add(V.add(V.mul(N, rr(30, 140)), V.mul(DP, rr(40, 240))), V.mul(Eh, side * rr(5, 40))) : null, ax: V.norm([r() - .5, r() - .5, r() - .5]), w: off ? rr(.5, 2.4) : 0 });
      s += len * rr(.82, .98);
    }
  }
  D.petals = petals;

  /* ---------- incandescent seams: cracks run out from the lips along the plating's grid ---------- */
  const CRK = [];
  for (let c = 0; c < 92; c++) {
    const s0 = PATH_L * Math.pow(r(), .8), side = r() < .5 ? 1 : -1, w = hw(s0);
    let a = s0 * CI, b = side * w * rr(.95, 1.1), dir = r() < .55 ? 1 : 0;                 // 1: across (away from the furrow), 0: along
    const pts = [[a, b]]; let len = 0;
    const nseg = 3 + Math.floor(r() * 6);
    for (let k = 0; k < nseg; k++) {
      const l = rr(3, 13) * (k === 0 ? 1.4 : 1);
      if (dir) b += side * l; else a += (r() < .7 ? -1 : 1) * l;
      pts.push([a, b]); len += l;
      if (r() < .6) dir = 1 - dir;
    }
    const P3 = pts.map(([x, y]) => [H[0] + Pr[0] * x + Eh[0] * y + N[0] * .35, H[1] + Pr[1] * x + Eh[1] * y + N[1] * .35, H[2] + Pr[2] * x + Eh[2] * y + N[2] * .35]);
    const sec = secOf(P3[0]); let n = 1; while (n < P3.length && secOf(P3[n]) === sec) n++;
    if (sec < 0 || n < 2) continue;
    const pts3 = P3.slice(0, n), cum = [0]; for (let k = 1; k < n; k++) cum.push(cum[k - 1] + V.dist(pts3[k - 1], pts3[k]));
    CRK.push({ p: pts3, cum, sec, t0: s0 / VREL + rr(.001, .03), v: rr(250, 1400), h0: rr(1.2, 2.0), tau: rr(3, 9) });
  }
  // the crack ring round the hull at the break, lit by the bursts inside before it opens: the outline on both cuts
  const RING_F = [], RING_A = [];
  function outlineAt(n_, d_) {
    const pts = [];
    for (const [x0, y0] of OUTL) { let z = ZB; for (let it = 0; it < 4; it++) { const k = P.kz(z); z = (d_ - n_[0] * x0 * k - n_[1] * y0 * k) / n_[2]; } const k = P.kz(z); pts.push([x0 * k, y0 * k, z]); }
    const out = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], seg = tear(a, b, n_, .16, V.dist(a, b) > 20 ? 4 : 3); seg.pop(); for (const p of seg) out.push(p); }
    return out;
  }
  { const ph = [rr(0, TAU), rr(0, TAU)];
    outlineAt(nF, dF).forEach((p, i) => RING_F.push({ p, h: (.18 + .95 * Math.pow(.5 + .5 * Math.sin(i * .45 + ph[0]) * Math.sin(i * .17 + 1), 1.5)) * rr(.7, 1.15) }));
    outlineAt(nA, dA).forEach((p, i) => RING_A.push({ p, h: (.18 + .95 * Math.pow(.5 + .5 * Math.sin(i * .41 + ph[1]) * Math.sin(i * .19 + 2), 1.5)) * rr(.7, 1.15) })); }
  // (the crack front runs round from the shoulder, where the furrow crosses the cut, both ways toward the keel)
  const angOf = p => Math.atan2(p[1], p[0]), A0 = angOf(qAt(sF + 5));
  for (const L_ of [RING_F, RING_A]) for (const e of L_) { let d = Math.abs(angOf(e.p) - A0); if (d > PI) d = TAU - d; e.t = .5 + .42 * d / PI + rr(0, .03); }

  // the plating torn at the cut: plates hinged on both edges, bent out into the gap and away from the hull
  const CUTP = [];
  for (const [RG, sec, gd] of [[RING_F, 0, V.mul(nF, -1)], [RING_A, 1, nA.slice()]]) {
    const n = RG.length;
    for (let i = 0; i < n; i += 2 + Math.floor(r() * 3)) {
      const a = RG[i].p, b = RG[(i + 2) % n].p, mid = V.lerp(a, b, .5), len = V.dist(a, b); if (len < 1.5) continue;
      let x_ = V.norm(V.sub(b, a)); const y_ = V.norm(V.sub(gd, V.mul(x_, V.dot(gd, x_)))); let z_ = V.cross(x_, y_);
      if (V.dot(z_, [mid[0], mid[1], 0]) < 0) { x_ = V.mul(x_, -1); z_ = V.cross(x_, y_); }
      const wid = rr(2.5, 7.5), tA = [len * rr(.1, .45), wid * rr(.75, 1), 0], tB = [-len * rr(.05, .4), wid * rr(.6, 1), 0], A_ = [-len / 2, 0, 0], B_ = [len / 2, 0, 0];
      let poly = tear(B_, tA, [0, 0, 1], .2, 2); poly.pop(); poly = poly.concat(tear(tA, tB, [0, 0, 1], .3, 3)); poly.pop(); poly = poly.concat(tear(tB, A_, [0, 0, 1], .2, 2)); poly.pop();
      const Bd = new Body('cutp' + CUTP.length); plate(Bd, [A_].concat(poly), [0, wid * .35, 0], .3, { qOf: i => i === 0 ? 2 : 1 }); Bd.done();
      CUTP.push({ B: Bd, Rm: [x_[0], y_[0], z_[0], x_[1], y_[1], z_[1], x_[2], y_[2], z_[2]], hinge: mid, sec, fin: rr(20, 85) * DEG, tau: rr(.08, .3), h0: rr(1.5, 2.1) });
    }
  }
  /* ---------- the cut faces: deck edges across them, the spine's members across the gap, cables ---------- */
  const CUTF = [], CUTA = [];               // [a, b] segments in each cut plane (platform frame, its own section's)
  function cutDecks(n_, d_, out) {
    for (let y = -24; y <= 64; y += 7) {
      let z = ZB; for (let it = 0; it < 4; it++) { const k = P.kz(z); z = (d_ - n_[1] * y) / n_[2]; }
      const k = P.kz(z), yy = y / k; let w = 0;
      for (let i = 0, j = OUTL.length - 1; i < OUTL.length; j = i++) { const a = OUTL[i], b = OUTL[j]; if ((a[1] - yy) * (b[1] - yy) <= 0 && a[1] !== b[1]) w = Math.max(w, Math.abs(a[0] + (b[0] - a[0]) * (yy - a[1]) / (b[1] - a[1]))); }
      if (w <= 0) continue;
      const x0 = -w * k + 1.5, x1 = w * k - 1.5, zA = (d_ - n_[0] * x0 - n_[1] * y) / n_[2], zB = (d_ - n_[0] * x1 - n_[1] * y) / n_[2];
      out.push({ a: [x0, y, zA], b: [x1, y, zB], h: rr(.5, 1) });
    }
  }
  cutDecks(nF, dF, CUTF); cutDecks(nA, dA, CUTA);
  const SPINE = [];
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * TAU + .2, x = Math.cos(a) * 24, y = Math.sin(a) * 24;
    const zf = (dF - nF[0] * x - nF[1] * y) / nF[2], za = (dA - nA[0] * x - nA[1] * y) / nA[2];
    SPINE.push({ f: [x, y, zf + rr(-.5, 1)], a: [x, y, za - rr(-.5, 1)], bend: [rr(-3, 3), rr(-3, 3), rr(-1, 1)], snap: rr(10, 22), h: rr(.6, 1) });
  }
  const CABLES = [];
  for (let k = 0; k < 18; k++) {
    const x = rr(-30, 30) * KB / 1.6, y = -27 * KB + rr(2, 26);
    const zf = (dF - nF[0] * x - nF[1] * y) / nF[2], za = (dA - nA[0] * x - nA[1] * y) / nA[2];
    CABLES.push({ f: [x, y, zf], a: [x + rr(-1, 1), y + rr(-1, 1), za], snap: rr(6, 30), sag: [rr(-4, 4), rr(-4, 4), 0] });
  }

  /* ---------- the bursts: the shorted bus along the hull, ring A's wheels, the hull letting go ---------- */
  const RI = 0, RZ = P.RING_Z[RI], NRN = P.NRN, DA = TAU / NRN, RR_ = P.RING_R, CA = Math.cos(PI / NRN) * RR_, OMG = o.OMEGA || (TAU * 2 / 60);
  const psiAt = tH => o.psi0 + OMG * tH;
  const TW = [.66, .72, .79, .86];
  // the node nearest the starboard upper pylon (45 deg) when the short reaches the ring; the chord between it and the
  // next breaks
  const i0 = (() => { const a = PI / 4 - psiAt(TW[0]); let i = Math.round(a / DA); return ((i % NRN) + NRN) % NRN; })();
  const WN = [i0, (i0 + 1) % NRN, (i0 + NRN - 1) % NRN, (i0 + 2) % NRN];
  const nodeP = (i, tH) => { const a = psiAt(tH) + i * DA; return [Math.cos(a) * RR_, Math.sin(a) * RR_, RZ]; };
  const BURST = [];
  const busAt = (s, dd) => V.sub(pAt(s), V.mul(N, dd));
  BURST.push({ p: busAt(66, 6), t: .30, E: 10, kind: 'bus' }, { p: busAt(88, 7), t: .40, E: 15, kind: 'bus' }, { p: busAt(108, 9), t: .50, E: 25, kind: 'bus' },
    { p: [52 * P.kz(-300) / 1.93 * .985, 52 * P.kz(-300) / 1.93 * .985, -300], t: .60, E: 20, kind: 'bus' });
  for (let k = 0; k < 4; k++) BURST.push({ p: nodeP(WN[k], TW[k]), t: TW[k], E: 21.4, kind: 'wheel', node: WN[k] });
  BURST.push({ p: [44 * KB / 1.78, -34 * KB / 1.78, -262], t: .87, E: 30, kind: 'hull' }, { p: [58 * KB / 1.78, 34 * KB / 1.78, -256], t: .95, E: 50, kind: 'hull' });
  for (const b of BURST) { b.sec = 0; b.R = 1 + Math.sqrt(b.E) * .55; b.vs = 260 + 60 * Math.sqrt(b.E); }
  D.bursts = BURST;
  const E_BUS = 150, E_WHEEL = 21.4, E_STORE = 1200;
  D.energy = { storeGJ: E_STORE, busGJ: E_BUS, wheelGJ: E_WHEEL * 4, releasedGJ: E_BUS + E_WHEEL * 4, leftGJ: E_STORE - E_BUS - E_WHEEL * 4, wheels: 4 };
  const relAt = tH => { let e = 0; for (const b of BURST) if (tH > b.t) e += b.E; return e; };
  D.releasedAt = relAt;

  /* ---------- ring A: the chord between the first two burst wheels breaks ---------- */
  const TC = .75, ci = WN[0];
  const thC = (ci + .5) * DA + psiAt(TC), Q = [Math.cos(thC) * CA, Math.sin(thC) * CA, RZ];
  const ER = [Math.cos(thC), Math.sin(thC), 0], ET = [-Math.sin(thC), Math.cos(thC), 0], HL = P.RCH / 2;
  const RC0 = [ER[0], ET[0], 0, ER[1], ET[1], 0, 0, 0, 1];
  const HALF = [-1, 1].map(sg => {
    const c = V.add(Q, V.mul(ET, sg * HL / 2)), vt = [-OMG * c[1], OMG * c[0], 0];
    const kick = V.add(V.mul(ER, rr(10, 18)), V.mul(ET, sg * rr(4, 9)));
    return { sg, c, v: V.add(vt, kick), ax2: V.norm([r() - .5, r() - .5, r() - .5]), w2: rr(.08, .2) * sg };
  });
  D.ring = { ri: RI, chord: ci, tC: TC, Q, thC, vt: OMG * CA, halves: HALF, wheels: WN.slice() };

  /* ---------- the debris ---------- */
  const frags = [];
  const kinds = ['plate', 'plate', 'plate', 'plate', 'beam', 'cable', 'box', 'pipe'];
  const sizeOf = () => { const u = r(); return Math.min(9, .3 / Math.pow(1 - .985 * u, 1 / 1.5)); };
  function axisR(ax, a) { const c = Math.cos(a), s = Math.sin(a), k = 1 - c, [x, y, z] = ax; return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]; }
  const rot0 = () => axisR(V.norm([r() - .5, r() - .5, r() - .5]), rr(0, TAU));
  const dirCone = (ax, ca) => { const [u, w] = perp(ax), ph = r() * TAU; return V.norm(V.add(V.mul(ax, Math.cos(ca)), V.add(V.mul(u, Math.sin(ca) * Math.cos(ph)), V.mul(w, Math.sin(ca) * Math.sin(ph))))); };
  function addFrag(n, src) {
    for (let i = 0; i < n; i++) {
      const s = src.size ? rr(src.size[0], src.size[1]) : Math.max(src.smin || 0, Math.min(src.smax || 9, sizeOf())), kind = (src.kinds || kinds)[Math.floor(r() * (src.kinds || kinds).length)], tpl = pickTpl(kind, s);
      const big = E.sat((tpl.size - .8) / 5);
      const at = src.at(), ax = src.ax(at), ca = (src.cone[0] + (src.cone[1] - src.cone[0]) * big) * Math.pow(r(), .75);
      const dir = dirCone(ax, ca);
      const sp = Math.exp(Math.log(src.v[0]) + (Math.log(src.v[1]) - Math.log(src.v[0])) * Math.pow(r(), src.vk || 1)) * (1 - .9 * big) + big * rr(src.vb[0], src.vb[1]);
      frags.push({ tpl, kind, size: tpl.size, p0: at.p, v: V.add(V.mul(dir, sp), src.vbase || [0, 0, 0]), ax: V.norm([r() - .5, r() - .5, r() - .5]), w: rr(.3, 2.2) * (1 + 8 * (1 - big)) * (src.wk || 1) * (r() < .5 ? -1 : 1),
        R0: rot0(), t0: at.t, h0: rr(1.3, 2.1) * (src.hot || 1), tau: (1.0 + 1.0 * tpl.size + rr(0, 1.5)) * (src.cool || 1), src: src.key, trk: tpl.size > 3 ? 1 : 0 });
    }
  }
  // from along the furrow (more from its deep end), downstream in a cone off the shoulder
  const furAt = () => { const s = PATH_L * Math.pow(r(), .72), q = qAt(s); const w = hw(s) * rr(-.8, .8); return { p: [q[0] + Eh[0] * w, q[1] + Eh[1] * w, q[2] + Eh[2] * w], t: s / VREL + rr(0, .002), s }; };
  const furAx = at => V.norm(V.add(V.mul(AXF, 1), V.mul(N, .18 * (1 - at.s / PATH_L))));
  addFrag(640, { key: 'fur', at: furAt, ax: furAx, cone: [9 * DEG, 30 * DEG], v: [60, 1400], vb: [15, 140], vk: 1.3 });
  addFrag(120, { key: 'fur', at: furAt, ax: furAx, cone: [18 * DEG, 40 * DEG], v: [8, 70], vb: [5, 40], size: [3, 12], wk: .4, kinds: ['plate', 'plate', 'plate', 'beam'] });
  // the bursts' wreckage: the hull's plating and frames thrown out round each one (wider, slower)
  for (const b of BURST) {
    const out = b.kind === 'wheel' ? V.norm([b.p[0], b.p[1], 0]) : V.norm([b.p[0] * .6 + N[0] * 30, b.p[1] * .6 + N[1] * 30 + 10, 0]);
    addFrag(b.kind === 'hull' ? 70 : 34, { key: 'brst', at: () => ({ p: V.add(b.p, [rr(-1, 1) * b.R, rr(-1, 1) * b.R, rr(-1, 1) * b.R]), t: b.t + rr(0, .01) }), ax: () => out, cone: [50 * DEG, 85 * DEG], v: [30, b.vs * 1.4], vb: [8, 60], hot: 1.1, kinds: b.kind === 'wheel' ? ['plate', 'beam', 'box', 'pipe', 'cable'] : kinds,
      vbase: b.kind === 'wheel' ? [-OMG * b.p[1], OMG * b.p[0], 0] : null });
  }
  // what drifts off the wounds afterwards at walking pace (cut cables, insulation, panels): what stays round the ship
  addFrag(150, { key: 'drift', at: () => { const s = rr(5, PATH_L - 5), q = qAt(s); return { p: V.add(q, V.mul(Eh, hw(s) * rr(-.7, .7))), t: s / VREL + rr(.2, 6) }; }, ax: () => N, cone: [40 * DEG, 80 * DEG], v: [.4, 5], vb: [.3, 3], size: [.3, 3.2], wk: .15, kinds: ['plate', 'plate', 'cable', 'cable', 'box', 'beam', 'pipe'] });
  // the torn-off petals fly as debris (their own bodies)
  for (const p of petals) if (p.off) frags.push({ tpl: p.B, kind: 'petal', size: p.B.size, p0: p.hinge, v: p.v, ax: p.ax, w: p.w, R0: p.Rm, t0: p.t0 + p.tau * .8, h0: p.h0, tau: 5, src: 'fur', petal: p, trk: 1 });
  // the chord's shards, thrown with the rim's speed
  { const gapAt = () => { const RG = r() < .5 ? RING_F : RING_A, e = RG[Math.floor(r() * RG.length)].p; return { p: [e[0] * rr(.6, 1), e[1] * rr(.6, 1), e[2]], t: TB + rr(-.04, .25) }; };
    addFrag(110, { key: 'gap', at: gapAt, ax: () => V.norm([rr(-.3, 1), rr(.2, 1), rr(-.3, .3)]), cone: [55 * DEG, 85 * DEG], v: [6, 140], vb: [4, 40], hot: 1.1, kinds }); }
  addFrag(60, { key: 'ring', at: () => ({ p: V.add(Q, [rr(-3, 3), rr(-3, 3), rr(-3, 3)]), t: TC + rr(0, .01) }), ax: () => ER, cone: [40 * DEG, 80 * DEG], v: [10, 90], vb: [4, 30], smax: 2.5, vbase: [-OMG * Q[1], OMG * Q[0], 0], kinds: ['plate', 'beam', 'beam', 'cable', 'pipe'] });
  D.frags = frags;
  D.N = { frags: frags.length, petals: petals.length };

  /* the dust: bits too small to model (2 cm - 0.5 m), on straight lines for ever. Each glows white-hot, cools through
     amber in 0.1-1.5 s, then is a sunlit speck that glints as it tumbles. [x, y, z, vx, vy, vz, t0, size, coolTau,
     heat0, glint rate, glint phase] */
  const PCN = 12, NFUR = 30000, NJET = 3500, NBR = 900, NGAP = 4500, NPC = NFUR + NJET + NBR * BURST.length + 1200 + NGAP, PCD = new Float32Array(NPC * PCN);
  { let i = 0;
    const put = (p, v, t0, sz, ct, h0) => { PCD.set([p[0], p[1], p[2], v[0], v[1], v[2], t0, sz, ct, h0, rr(4, 40), rr(0, TAU)], i * PCN); i++; };
    for (let k = 0; k < NFUR; k++) {
      const s = PATH_L * Math.pow(r(), .38), q = qAt(s), w = hw(s) * rr(-.8, .8), at = { p: [q[0] + Eh[0] * w, q[1] + Eh[1] * w, q[2] + Eh[2] * w], t: s / VREL + rr(0, .002), s };
      const core = r() < .68, ca = core ? 11 * DEG * Math.pow(r(), 1.4) : 30 * DEG * Math.pow(r(), .8), d = dirCone(furAx(at), ca);
      const sp = core ? 70 * Math.pow(30, Math.pow(r(), 1.5)) : 22 * Math.pow(32, Math.pow(r(), 1.2));
      put(at.p, V.mul(d, sp), at.t, .02 + .42 * Math.pow(r(), 3), rr(.15, 1.6), rr(1.1, 2.2));
    }
    // the round's remains: a narrow spear from the furrow's end, fast and white-hot, cooling fast
    for (let k = 0; k < NJET; k++) { const d = dirCone(V.norm(V.add(DP, V.mul(N, .06))), 7 * DEG * Math.pow(r(), .7)), sp = rr(2500, 9000); put(V.add(XEND, V.mul(Eh, rr(-6, 6))), V.mul(d, sp), TX + rr(-.003, .002), .02 + .1 * r(), rr(.05, .35), rr(1.6, 2.4)); }
    for (const b of BURST) {
      const out = b.kind === 'wheel' ? V.norm([b.p[0], b.p[1], 0]) : V.norm([b.p[0] + N[0] * 40, b.p[1] + N[1] * 40, 0]);
      for (let k = 0; k < NBR; k++) { const d = r() < .55 ? dirCone(out, 70 * DEG * Math.sqrt(r())) : dirCone([r() - .5, r() - .5, r() - .5].map(x => x || .1), 0), sp = b.vs * rr(.3, 1.6), vb = b.kind === 'wheel' ? [-OMG * b.p[1], OMG * b.p[0], 0] : [0, 0, 0]; put(b.p, V.add(V.mul(V.norm(d), sp), vb), b.t + rr(0, .006), .02 + .3 * Math.pow(r(), 3), rr(.1, .9), rr(1.2, 2.2)); }
    }
    for (let k = 0; k < NGAP; k++) { const RG = r() < .5 ? RING_F : RING_A, e = RG[Math.floor(r() * RG.length)].p, d = V.norm([e[0] + rr(-20, 20), e[1] + rr(-10, 30), rr(-12, 12)]); put([e[0], e[1], e[2]], V.mul(d, 20 + 260 * Math.pow(r(), 2)), TB + rr(-.03, .35), .02 + .25 * Math.pow(r(), 3), rr(.2, 1.6), rr(1.3, 2.2)); }
    for (let k = 0; k < 1200; k++) { const d = dirCone(ER, 75 * DEG * Math.pow(r(), .7)); put(Q, V.add(V.mul(d, rr(8, 110)), [-OMG * Q[1], OMG * Q[0], 0]), TC + rr(0, .012), .02 + .3 * Math.pow(r(), 3), rr(.15, 1.4), rr(1.2, 2)); }
  }
  /* sparks (molten droplets): fountains off the cutting head along the furrow and off each burst, streaked by their motion */
  const NSP = 7000, SPN = 8, SPK = new Float32Array(NSP * SPN);
  { let i = 0;
    for (; i < 5200; i++) { const s = PATH_L * r(), q = qAt(s), d = dirCone(V.norm(V.add(V.mul(N, .8), V.mul(DP, .9))), 50 * DEG * Math.sqrt(r())), sp = Math.exp(rr(Math.log(80), Math.log(3200))); SPK.set([q[0], q[1], q[2], d[0] * sp, d[1] * sp, d[2] * sp, s / VREL + rr(0, .004), rr(.15, 1.6)], i * SPN); }
    for (; i < NSP; i++) { const b = BURST[i % BURST.length], d = dirCone([r() - .5, r() - .5, r() - .5], 0), sp = rr(60, b.vs * 2); SPK.set([b.p[0], b.p[1], b.p[2], d[0] * sp, d[1] * sp, d[2] * sp, b.t + rr(0, .02), rr(.2, 1.2)], i * SPN); }
  }
  /* each burst's shell: an expanding front of glowing gas and grit (Fibonacci directions, jittered) */
  const NSH = 1100, SHD = new Float32Array(NSH * 4);
  for (let i = 0; i < NSH; i++) { const y = 1 - 2 * (i + .5) / NSH, rad = Math.sqrt(1 - y * y), th = i * 2.39996; SHD[i * 4] = Math.cos(th) * rad; SHD[i * 4 + 1] = y; SHD[i * 4 + 2] = Math.sin(th) * rad; SHD[i * 4 + 3] = rr(.75, 1.15); }
  /* the shafts of light through the dust: fixed rays in the fan's cone from its head, each with its own strength */
  const NRAY = 64, RAYS = [];
  for (let k = 0; k < NRAY; k++) RAYS.push({ d: dirCone(AXF, 27 * DEG * Math.pow(r(), .8)), b: Math.pow(r(), 1.6), ph: rr(0, TAU), f: rr(.6, 1.4) });
  /* venting: from the furrow (the shoulder's tanks) and, once it opens, from both faces of the gap */
  const NV = 5000, VN = 10, VNT = new Float32Array(NV * VN), VSEC = new Int8Array(NV);
  for (let i = 0; i < NV; i++) {
    const kind = i < 1600 ? 0 : i < 3300 ? 1 : 2;           // 0 the furrow, 1 the fore face, 2 the aft face
    let p, d;
    if (kind === 0) { const s = rr(20, PATH_L - 10); p = qAt(s); d = dirCone(V.norm(V.add(N, V.mul(DP, .3))), 22 * DEG * Math.sqrt(r())); }
    else { const x = rr(-30, 30) * KB / 1.6, y = rr(-20, 50) * KB / 1.6, nn = kind === 1 ? nF : nA, dd = kind === 1 ? dF : dA; p = [x, y, (dd - nn[0] * x - nn[1] * y) / nn[2]]; d = dirCone(V.norm(V.add(V.mul(nn, kind === 1 ? -1 : 1), [.35, .9, 0])), 30 * DEG * Math.sqrt(r())); }
    VNT.set([p[0], p[1], p[2], d[0], d[1], d[2], rr(60, 260), rr(2.5, 7), r(), kind], i * VN); VSEC[i] = kind === 0 ? secOf(p) : kind === 1 ? 0 : 1;
  }
  const ventRate = (te, kind) => kind === 0 ? (te < .05 ? 0 : (.35 + .65 * Math.exp(-te / 8)) * (.5 + .5 * Math.exp(-te / 80))) : (te < TB + .05 ? 0 : (.4 + .6 * Math.exp(-(te - TB) / 6)) * (.45 + .55 * Math.exp(-(te - TB) / 60)));

  /* ---------- poses ---------- */
  const RT = new Float64Array(9), RA = new Float64Array(9);
  const FP = { R: new Float64Array(9), T: [0, 0, 0] };
  function fragPose(i, tH, out) {
    const f = frags[i], t = tH - f.t0; if (t < 0) return false;
    out = out || FP;
    rotAx(f.ax, f.w * t, RA); mul3(RA, f.R0, out.R);
    out.T[0] = f.p0[0] + f.v[0] * t; out.T[1] = f.p0[1] + f.v[1] * t; out.T[2] = f.p0[2] + f.v[2] * t;
    return out;
  }
  D.fragPose = fragPose;
  const bendOf = (p, tH) => { const t = tH - p.t0; if (t <= 0) return 0; return p.fin * (1 - Math.exp(-t / p.tau)) * (1 + .05 * Math.exp(-t / (p.tau * 4)) * Math.sin(t / p.tau * 3)); };

  /* ---------- heat (the lattice's fx channel) ---------- */
  let HC = 0, HF = 0;
  const heatV = h => h > 1 ? 11 + Math.min(1, h - 1) : h > .02 ? 10 + h : 0;
  const fxD = (ch, q) => ch !== CH ? 0 : q === 1 ? (HC > .02 ? heatV(HC) : -.3) : q === 2 ? (HC > .02 ? heatV(HC * .7) : -.15) : HF > .02 ? heatV(HF) : 0;
  const OF = { L: o.L_SUN || [0, 1, 0], fx: fxD, occ: true, keep: 1, a: 1, lc: [255, 255, 255], back: .22 };
  const cool = (h0, tau, t) => h0 * Math.exp(-Math.max(0, t) / tau);

  /* ---------- the renderer's hooks ---------- */
  const HCL = { clipM: null, brk: { on: false, R: AFT.R, T: AFT.T, cutF: [-nF[0], -nF[1], -nF[2], -dF], cutA: [nA[0], nA[1], nA[2], dA] } };
  D.hullClip = tH => { if (tH <= 0) return null; aftAt(tH, AFT); HCL.brk.on = AFT.on; return HCL; };
  const WA = { R: new Float64Array(9), T: [0, 0, 0] };
  const secW = (Wt, tH) => { aftAt(tH, AFT); return comp(Wt, AFT, WA); };

  /* the furrow's screen strip: per tile (portals) or per pixel (the mask), the ray onto the shoulder's plane under a
     section's transform; s along the furrow, its offset across */
  const PJ = K.PJ, SW = [0, 0, 0], SN = [0, 0, 0], SPR = [0, 0, 0], SEH = [0, 0, 0], CW = [0, 0, 0];
  const BOX = [0, 0, 0, 0];
  function stripBox(Ws, s0, s1) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
    for (const s of [s0, (s0 + s1) / 2, s1]) for (const sg of [-1, 1]) {
      qAt(s, CW); const w = hw(s) * 1.3; CW[0] += Eh[0] * w * sg; CW[1] += Eh[1] * w * sg; CW[2] += Eh[2] * w * sg; ap(Ws, CW, CW);
      if (!K.pj(CW[0], CW[1], CW[2])) { BOX[0] = 0; BOX[1] = K.BW - 1; BOX[2] = 0; BOX[3] = K.BH - 1; return BOX; }
      x0 = Math.min(x0, PJ[0]); x1 = Math.max(x1, PJ[0]); y0 = Math.min(y0, PJ[1]); y1 = Math.max(y1, PJ[1]); n++;
    }
    BOX[0] = Math.max(0, Math.floor(x0) - 4); BOX[1] = Math.min(K.BW - 2, Math.ceil(x1) + 4); BOX[2] = Math.max(0, Math.floor(y0) - 4); BOX[3] = Math.min(K.BH - 2, Math.ceil(y1) + 4);
    return BOX;
  }
  /* (sets SW (the entry, world), SN, SPR, SEH under Ws; returns the camera's distance to the plane, negative when it
     sees the shoulder from behind) */
  function stripSetup(Ws) {
    const C = K.C, e = C.eye;
    ap(Ws, H, SW); apD(Ws, N, SN); apD(Ws, Pr, SPR); apD(Ws, Eh, SEH);
    return SN[0] * (e[0] - SW[0]) + SN[1] * (e[1] - SW[1]) + SN[2] * (e[2] - SW[2]);
  }
  const STRIP = { s: 0, b: 0, z: 0 };
  function stripAt(dx, dy) {
    const C = K.C, e = C.eye, r_ = C.r, u_ = C.u, f_ = C.f;
    const wx = r_[0] * dx + u_[0] * dy + f_[0], wy = r_[1] * dx + u_[1] * dy + f_[1], wz = r_[2] * dx + u_[2] * dy + f_[2];
    const den = SN[0] * wx + SN[1] * wy + SN[2] * wz; if (den > -1e-6) return false;
    const t = (SN[0] * (SW[0] - e[0]) + SN[1] * (SW[1] - e[1]) + SN[2] * (SW[2] - e[2])) / den;
    const px = e[0] + wx * t - SW[0], py = e[1] + wy * t - SW[1], pz = e[2] + wz * t - SW[2];
    STRIP.s = (px * SPR[0] + py * SPR[1] + pz * SPR[2]) / CI; STRIP.b = px * SEH[0] + py * SEH[1] + pz * SEH[2]; STRIP.z = t;   // (t: the depth along f, f being unit and dx, dy per focal length)
    return true;
  }
  function portalSec(Ws, s0, s1) {
    if (s1 <= s0 || stripSetup(Ws) <= 0) return;
    const OZ = K.OZ, OC = K.OC, OW = K.OW, OH = K.OH, C = K.C, fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1];
    const bx = stripBox(Ws, s0, s1), tx0 = bx[0] >> 2, tx1 = Math.min(OW - 1, bx[1] >> 2), ty0 = bx[2] >> 2, ty1 = Math.min(OH - 1, bx[3] >> 2);
    for (let ty = ty0; ty <= ty1; ty++) {
      const dy = -(ty * 4 + 2 - cy) / fl;
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!stripAt((tx * 4 + 2 - cx) / fl, dy)) continue;
        const s = STRIP.s; if (s < s0 - 2 || s > s1 + 2 || Math.abs(STRIP.b) > hw(s) * 1.05 + 1) continue;
        const k = ty * OW + tx; if (OZ[k] > STRIP.z * .9 - 8) OC[k] = 0;
      }
    }
  }
  D.portals = (Wt, tH) => {
    if (tH <= 0 || !K.occOn()) return;
    const sn = sNowOf(tH);
    if (tH <= TB) { portalSec(Wt, 0, sn); return; }
    portalSec(Wt, 0, Math.min(sn, sF)); const Wa = secW(Wt, tH); portalSec(Wa, sF + 6, sn);
  };
  /* the mask: the hull's plating dimmed toward the backdrop inside the furrow (it is gone there; what is under it is
     drawn after), in 2 x 2 blocks, only where the shoulder is the nearest surface */
  function maskSec(Ws, s0, s1, k) {
    if (s1 <= s0 || stripSetup(Ws) <= 0) return;
    const C = K.C, fl = C.fl, cx = C.cx + C.shake[0], cy = C.cy + C.shake[1], d = K.pb.d, bg = K.pb.bg, BW = K.BW, OZ = K.OZ, OW = K.OW, occ = K.occOn();
    const bx = stripBox(Ws, s0, s1);
    for (let y = bx[2]; y <= bx[3]; y += 2) {
      const dy = -(y + 1 - cy) / fl;
      for (let x = bx[0]; x <= bx[1]; x += 2) {
        if (!stripAt((x + 1 - cx) / fl, dy)) continue;
        const s = STRIP.s; if (s < s0 || s > s1) continue;
        const w0 = hw(s), b = Math.abs(STRIP.b); if (b > w0 * 1.05) continue;
        if (occ) { const t = (y >> 2) * OW + (x >> 2); if (OZ[t] < STRIP.z * .985 - 4) continue; }
        const w = k * (1 - ss(w0 * .78, w0 * 1.05, b)) * Math.min(1, (s - s0) / 3 + .2) * Math.min(1, (s1 - s) / 2 + .3), m = 1 - w;
        for (let q4 = 0; q4 < 4; q4++) {
          const q = (((y + (q4 >> 1)) * BW) + x + (q4 & 1)) << 2;
          d[q] = bg[q] + (d[q] - bg[q]) * m; d[q + 1] = bg[q + 1] + (d[q + 1] - bg[q + 1]) * m; d[q + 2] = bg[q + 2] + (d[q + 2] - bg[q + 2]) * m;
        }
      }
    }
  }

  /* ---------- drawing ---------- */
  const W1 = [0, 0, 0], W2 = [0, 0, 0], W3 = [0, 0, 0], W4 = [0, 0, 0];
  const XP = { R: new Float64Array(9), T: [0, 0, 0] }, XW = { R: new Float64Array(9), T: [0, 0, 0] };
  const WS = [null, null];
  const TRK_C = [226, 224, 214];
  function track(f, t, XPw, hot, Mf) {
    const sp = Math.hypot(f.v[0], f.v[1], f.v[2]); if (sp < .8 || t < .02) return;
    const L_ = Math.min(sp * t, 18 + sp * .25), M = Mf;
    const bx = f.v[0] / sp * L_, by = f.v[1] / sp * L_, bz = f.v[2] / sp * L_;
    const wx = M[0] * bx + M[1] * by + M[2] * bz, wy = M[3] * bx + M[4] * by + M[5] * bz, wz = M[6] * bx + M[7] * by + M[8] * bz;
    const a = .16 * Math.min(1, t * 3), col = hot > .5 ? FIRE : TRK_C;
    K.lineW(XPw[0] - wx * .3, XPw[1] - wy * .3, XPw[2] - wz * .3, XPw[0], XPw[1], XPw[2], 2.2, 1, col, a, null, 0, 0);
  }
  /* a jagged arc between two world points, re-struck at 30 Hz (no lime: white-hot, amber halo) */
  const ARC = new Float64Array(17 * 3);
  function arc(a, b, seed, tH, I) {
    if (I < .01) return;
    const f0 = Math.floor(tH * 300), n = 16;
    for (let k = 0; k <= n; k++) { const u = k / n; for (let c = 0; c < 3; c++) ARC[k * 3 + c] = a[c] + (b[c] - a[c]) * u; }
    const L_ = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * .35;
    for (let step = n; step > 1; step >>= 1) { const h = step >> 1, s = L_ * step / n; for (let i = 0; i + step <= n; i += step) { const m = i + h; for (let c = 0; c < 3; c++) ARC[m * 3 + c] = (ARC[i * 3 + c] + ARC[(i + step) * 3 + c]) / 2 + (fr(seed * 3.1 + m * 1.7 + c * 9.3, f0) - .5) * s; } }
    for (let k = 0; k < n; k++) K.lineW(ARC[k * 3], ARC[k * 3 + 1], ARC[k * 3 + 2], ARC[k * 3 + 3], ARC[k * 3 + 4], ARC[k * 3 + 5], 1.2, 1, WHT, Math.min(1, I), AMB, .05, 0);
  }
  const HXP = { R: new Float64Array(9), T: [0, 0, 0] }, HR1 = new Float64Array(9), HR2 = new Float64Array(9);
  const OHF = [{ L: o.L_SUN || [0, 1, 0], fx: fxD, occ: true, keep: 1, a: 1, lc: [255, 255, 255], clipM: [0, 1, 0, 0] }, { L: o.L_SUN || [0, 1, 0], fx: fxD, occ: true, keep: 1, a: 1, lc: [255, 255, 255], clipM: [0, -1, 0, 0] }];
  const rChord = P.bodies.find(b => b.name === 'rChord');
  const SAVE = { R: new Float64Array(9), T: [0, 0, 0] };
  let BROKEN = false, SAVED_W = null;
  const LENS = [];                              // (screen flashes for lensFX: x, y, I, size)
  D.head = { x: 0, y: 0, on: false };
  /* Wt: the ship's (fore section's) pose; Wf: the frame the free pieces fly in (default Wt) */
  function draw(PP, Wt, tH, rate, camO, Wf) {
    LENS.length = 0; D.head.on = false;
    if (tH < 0 || !Wt) return;
    Wf = Wf || Wt;
    const C = K.C, fl = C.fl, sn = sNowOf(tH), broken = tH > TB;
    const Wa = secW(Wt, tH);
    WS[0] = Wt; WS[1] = broken ? Wa : Wt;
    const secOK = sec => sec >= 0 && (broken || true);
    const WofS = sec => sec === 1 && broken ? Wa : Wt;
    // the furrow: the plating gone (mask), then its walls, floor and lips, by heat
    if (!broken) maskSec(Wt, 0, sn, .9);
    else { maskSec(Wt, 0, Math.min(sn, sF), .9); maskSec(Wa, sF + 6, sn, .9); }
    for (let i = 0; i + 1 < NS; i++) {
      const s = i * DS; if (s > sn) break;
      const sec = FSEC[i]; if (sec < 0 || FSEC[i + 1] !== sec) continue;
      const Ws = WofS(sec), t = tH - FT0[i];
      const h = cool(2.4, .9 + s * .002, t) + cool(.6, 30, t), part = Math.min(1, (sn - s) / DS);
      const col = heatCol(h), j = i * 3, j2 = j + 3;
      // lips
      for (const A of [FU, FL_]) {
        W1[0] = A[j]; W1[1] = A[j + 1]; W1[2] = A[j + 2]; W2[0] = A[j2]; W2[1] = A[j2 + 1]; W2[2] = A[j2 + 2];
        if (part < 1) { W2[0] = W1[0] + (W2[0] - W1[0]) * part; W2[1] = W1[1] + (W2[1] - W1[1]) * part; W2[2] = W1[2] + (W2[2] - W1[2]) * part; }
        ap(Ws, W1, W3); ap(Ws, W2, W4);
        K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.2, h > 1.4 ? 2 : 1, col, Math.min(1, .35 + h * .5), AMB, .03 * Math.min(1, h), 0);
      }
      // walls (the cut decks' edges) and the floor
      const hw_ = h * .8;
      if (hw_ > .04) {
        const cw = heatCol(hw_);
        for (const A of [FWU, FWL]) { W1[0] = A[j]; W1[1] = A[j + 1]; W1[2] = A[j + 2]; W2[0] = A[j2]; W2[1] = A[j2 + 1]; W2[2] = A[j2 + 2]; ap(Ws, W1, W3); ap(Ws, W2, W4); K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.6, 1, cw, Math.min(1, .25 + hw_ * .45), null, 0, 0); }
        W1[0] = FC[j]; W1[1] = FC[j + 1]; W1[2] = FC[j + 2]; W2[0] = FC[j2]; W2[1] = FC[j2 + 1]; W2[2] = FC[j2 + 2]; ap(Ws, W1, W3); ap(Ws, W2, W4);
        K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.1, h > 1.2 ? 2 : 1, heatCol(h * 1.1), Math.min(1, .3 + h * .6), null, 0, 0);
        // the frames cut through (every 6 m): stubs from the lips down to the floor
        if (i % 3 === 0) for (const [A, B_] of [[FU, FWU], [FL_, FWL]]) { W1[0] = A[j]; W1[1] = A[j + 1]; W1[2] = A[j + 2]; W2[0] = B_[j]; W2[1] = B_[j + 1]; W2[2] = B_[j + 2]; ap(Ws, W1, W3); ap(Ws, W2, W4); K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.4, 1, cw, Math.min(1, .3 + hw_ * .5), null, 0, 0); }
      }
      // the molten floor's glow (every 8 m)
      if (i % 4 === 0) { const g = cool(1, .35, t) + cool(.25, 6, t); if (g > .02) { W1[0] = FC[j]; W1[1] = FC[j + 1]; W1[2] = FC[j + 2]; ap(Ws, W1, W3); if (K.pj(W3[0], W3[1], W3[2])) { const px = Math.min(160, hw(s) * 2.2 * fl / K.PJ[2] + 4); K.glowW(W3[0], W3[1], W3[2], px / K.S, g > .5 ? AMB : FIRE, .32 * Math.min(1, g)); } } }
    }
    // the cracks, incandescent at their running fronts, cooling behind
    for (const c of CRK) {
      const t = tH - c.t0; if (t <= 0) continue;
      const front = c.v * t, Ws = WofS(c.sec), n = c.p.length;
      for (let k = 0; k + 1 < n; k++) {
        const c0 = c.cum[k]; if (c0 > front) break;
        const c1 = c.cum[k + 1], f = Math.min(1, (front - c0) / (c1 - c0)), a = c.p[k], b = c.p[k + 1];
        W1[0] = b[0]; W1[1] = b[1]; W1[2] = b[2]; if (f < 1) { W1[0] = a[0] + (b[0] - a[0]) * f; W1[1] = a[1] + (b[1] - a[1]) * f; W1[2] = a[2] + (b[2] - a[2]) * f; }
        const age = (front - (c0 + c1) / 2) / c.v, h = cool(c.h0, .25, age) + cool(.55, c.tau, t);
        if (h < .03) continue;
        ap(Ws, a, W3); ap(Ws, W1, W4);
        K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.3, 1, heatCol(h), Math.min(1, .25 + h * .6), null, 0, 0);
      }
    }
    // the plating peeled back along the lips
    for (const p of petals) {
      const t = tH - p.t0; if (t < 0) continue;
      if (p.off && t > p.tau * .8) continue;
      HC = cool(p.h0, 2.6, t) + cool(.35, 30, t); HF = cool(.3, .5, t);
      rotAx([1, 0, 0], bendOf(p, tH), RA); mul3(p.Rm, RA, XP.R); XP.T[0] = p.hinge[0]; XP.T[1] = p.hinge[1]; XP.T[2] = p.hinge[2];
      comp(WofS(p.sec), XP, XW);
      L.draw(p.B, XW, OF);
    }
    // the crack ring round the cut (lit by the bursts inside), then the gap: its torn edges, the cut decks, the spine's
    // members across it, cables, venting
    if (tH > .45) {
      for (const [RG, sec] of [[RING_F, 0], [RING_A, 1]]) {
        const Ws = WofS(sec), n = RG.length;
        for (let i = 0; i < n; i++) {
          const e = RG[i], e2 = RG[(i + 1) % n], t = tH - e.t; if (t < 0 || tH - e2.t < 0) continue;
          const h = (broken ? cool(1.9, 1.8, tH - TB) + cool(.8, 45, tH - TB) : Math.min(1.4, t * 4) * .8 + .5 * Math.max(0, Math.sin(tH * 40 + i))) * e.h;
          ap(Ws, e.p, W3); ap(Ws, e2.p, W4);
          K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.1, h > .9 ? 2 : 1, heatCol(h), Math.min(1, .4 + h * .6), AMB, .08 * Math.min(1, h), .02 * Math.min(1, h));
          if (broken && (i & 3) === 0 && h > .25 && K.pj(W3[0], W3[1], W3[2]) && K.onS(60)) K.softR(K.PJ[0], K.PJ[1], Math.min(60, 9 * fl / K.PJ[2] + 4), 255, 200, 140, .22 * Math.min(1, h));
        }
      }
    }
    if (broken) {
      const tb = tH - TB, hb = cool(1.8, 3.5, tb) + cool(.7, 40, tb);
      for (const c of CUTP) {
        const t = tb; HC = cool(c.h0, 3, t) + cool(.5, 30, t); HF = cool(.4, 1.2, t);
        rotAx([1, 0, 0], c.fin * (1 - Math.exp(-t / c.tau)), RA); mul3(c.Rm, RA, XP.R); XP.T[0] = c.hinge[0]; XP.T[1] = c.hinge[1]; XP.T[2] = c.hinge[2];
        comp(WofS(c.sec), XP, XW); L.draw(c.B, XW, OF);
      }
      for (const [CUT, sec] of [[CUTF, 0], [CUTA, 1]]) {
        const Ws = WofS(sec);
        for (const c of CUT) { ap(Ws, c.a, W3); ap(Ws, c.b, W4); K.lineW(W3[0], W3[1], W3[2], W4[0], W4[1], W4[2], 1.6, 1, heatCol(hb * c.h * .8), Math.min(1, .2 + hb * c.h * .45), null, 0, 0); }
      }
      for (const m of SPINE) {
        ap(Wt, m.f, W3); ap(Wa, m.a, W4);
        const gap = Math.hypot(W4[0] - W3[0], W4[1] - W3[1], W4[2] - W3[2]), col = heatCol(hb * m.h);
        if (gap < m.snap) {
          // bent across: a kink at the middle
          W1[0] = (W3[0] + W4[0]) / 2 + m.bend[0]; W1[1] = (W3[1] + W4[1]) / 2 + m.bend[1]; W1[2] = (W3[2] + W4[2]) / 2 + m.bend[2];
          K.lineW(W3[0], W3[1], W3[2], W1[0], W1[1], W1[2], 1.3, 2, col, .85, null, 0, 0); K.lineW(W1[0], W1[1], W1[2], W4[0], W4[1], W4[2], 1.3, 2, col, .85, null, 0, 0);
        } else {
          // snapped: two stubs into the gap
          for (const [A, B_] of [[W3, W4], [W4, W3]]) { W1[0] = A[0] + (B_[0] - A[0]) * .22 + m.bend[0] * .4; W1[1] = A[1] + (B_[1] - A[1]) * .22 + m.bend[1] * .4; W1[2] = A[2] + (B_[2] - A[2]) * .22 + m.bend[2] * .4; K.lineW(A[0], A[1], A[2], W1[0], W1[1], W1[2], 1.3, 2, col, .85, null, 0, 0); }
        }
      }
      for (const c of CABLES) {
        ap(Wt, c.f, W3); ap(Wa, c.a, W4);
        const gap = Math.hypot(W4[0] - W3[0], W4[1] - W3[1], W4[2] - W3[2]);
        if (gap < c.snap) { const sg = 1 - gap / c.snap; W1[0] = (W3[0] + W4[0]) / 2 + c.sag[0] * sg; W1[1] = (W3[1] + W4[1]) / 2 + c.sag[1] * sg; W1[2] = (W3[2] + W4[2]) / 2 + c.sag[2] * sg; K.lineW(W3[0], W3[1], W3[2], W1[0], W1[1], W1[2], 1.4, 1, WH, .5, null, 0, 0); K.lineW(W1[0], W1[1], W1[2], W4[0], W4[1], W4[2], 1.4, 1, WH, .5, null, 0, 0); }
      }
      // arcs across the gap from the bus's cut ends, dying away
      const I = Math.exp(-tb / 1.6);
      for (let k = 0; k < 5; k++) { if (fr(k, Math.floor(tH * 24)) > .35 + .6 * I) continue; const m = SPINE[(k * 3) % SPINE.length], m2 = SPINE[(k * 3 + 5) % SPINE.length]; ap(Wt, m.f, W3); ap(Wa, m2.a, W4); arc(W3, W4, k + 1, tH, I * .9); }
    }
    // ring A's broken chord: its halves flying off on the rim's tangent
    if (rChord && tH > TC && D.ringAlpha > .01) for (const hf of HALF) {
      const dt = tH - TC;
      rotAx([0, 0, 1], OMG * dt, HR1); rotAx(hf.ax2, hf.w2 * dt, HR2); mul3(HR2, HR1, RT); mul3(RT, RC0, HXP.R);
      const cx = hf.c[0] + hf.v[0] * dt, cy = hf.c[1] + hf.v[1] * dt, cz = hf.c[2] + hf.v[2] * dt, M = HXP.R, oy = hf.sg * HL / 2;
      HXP.T[0] = cx - M[1] * oy; HXP.T[1] = cy - M[4] * oy; HXP.T[2] = cz - M[7] * oy;
      HC = cool(1.9, 2.6, dt); HF = cool(.4, 1.2, dt);
      comp(Wf, HXP, XW);
      const am = L.G.am; L.G.am = am * D.ringAlpha; L.draw(rChord, XW, OHF[hf.sg < 0 ? 0 : 1]); L.G.am = am;
    }
    ringFX(PP, Wt, Wa, tH);
    // the pieces (in the free frame): modelled while a few pixels or more, a dot below that; tracks behind the big ones
    for (let i = 0; i < frags.length; i++) {
      const f = frags[i]; if (!fragPose(i, tH, XP)) continue;
      const t = tH - f.t0; HC = cool(f.h0, f.tau, t); HF = cool(f.h0 * .18, f.tau * .3, t);
      comp(Wf, XP, XW);
      if (!K.pj(XW.T[0], XW.T[1], XW.T[2])) continue;
      const z = K.PJ[2], px = f.size * fl / z, on = K.onS(px + 40);
      if (f.trk && on && px > 1.5) track(f, t, XW.T, HC, Wf.R);
      if (!on) continue;
      if (px < 2.2) { const a = Math.min(1, .3 + px * .4) * (HC > .3 ? 1 : .85); K.dotW(XW.T[0], XW.T[1], XW.T[2], px > 1.2 ? 2 : 1, HC > .12 ? heatCol(HC * 1.1) : GRIT, a); continue; }
      L.draw(f.tpl, XW, OF);
    }
    // the dust: white-hot specks cooling to sunlit grit that glints as it tumbles, streaked at the rate on screen
    const sh = rate / 60 * .9;
    { const M = Wf.R, T = Wf.T;
      for (let i = 0; i < NPC; i++) {
        const j = i * PCN, t = tH - PCD[j + 6]; if (t < 0) continue;
        const lx = PCD[j] + PCD[j + 3] * t, ly = PCD[j + 1] + PCD[j + 4] * t, lz = PCD[j + 2] + PCD[j + 5] * t;
        const x = M[0] * lx + M[1] * ly + M[2] * lz + T[0], y = M[3] * lx + M[4] * ly + M[5] * lz + T[1], z = M[6] * lx + M[7] * ly + M[8] * lz + T[2];
        if (!K.pj(x, y, z) || !K.onS(60)) continue;
        const zc = K.PJ[2], pxs = PCD[j + 7] * fl / zc, ht = PCD[j + 9] * Math.exp(-t / PCD[j + 8]);
        const gl = Math.sin(PCD[j + 10] * t + PCD[j + 11]), glint = gl > .86 ? (gl - .86) / .14 : 0;
        const lit = Math.min(1, pxs * 1.4) * .45 + .3 + .6 * glint;
        const a = Math.max(lit * Math.min(1, .45 + 1400 / zc), Math.min(1, ht * .95) * Math.min(1, .45 + pxs * 3 + 150 / zc));
        if (a < .03) continue;
        const col = ht > .12 ? heatCol(ht) : glint > .3 ? WHT : GRIT;
        const vx = PCD[j + 3], vy = PCD[j + 4], vz = PCD[j + 5], sl = Math.hypot(vx, vy, vz) * sh * fl / zc;
        if (sl > 2.5 && (ht > .08 || pxs > .4 || glint > .3)) {
          const k = Math.min(1, 40 / sl) * sh, bx = M[0] * vx + M[1] * vy + M[2] * vz, by = M[3] * vx + M[4] * vy + M[5] * vz, bz = M[6] * vx + M[7] * vy + M[8] * vz;
          K.lineW(x - bx * k, y - by * k, z - bz * k, x, y, z, 1.6, 1, col, a * .8, null, 0, 0);
        } else K.dotW(x, y, z, pxs > 1.4 || glint > .7 ? 2 : 1, col, a);
      }
    }
    // the fan's glow: soft light down its axis, densest at the head (the dust lit by the head and the sun)
    { const tf = tH - TX * .5;
      if (tf > 0) {
        const I = Math.min(1, tf * 30) * (.55 * Math.exp(-tH / 2.2) + .25 * Math.exp(-tH / 12));
        apD(Wf, AXF, W1);
        for (let k = 0; k < 9; k++) {
          const u = (k + .5) / 9, d = Math.min(3500, 700 * tf) * Math.pow(u, 1.25) + 6;
          ap(Wf, XEND, W3); W3[0] += W1[0] * d; W3[1] += W1[1] * d; W3[2] += W1[2] * d;
          if (!K.pj(W3[0], W3[1], W3[2]) || !K.onS(400)) continue;
          const px = Math.min(520, (14 + d * .32) * fl / K.PJ[2]) / K.S;
          K.softR(K.PJ[0], K.PJ[1], px * K.S, 255, 236, 205, I * .2 * Math.pow(1 - u, .8));
        }
      }
    }
    // the shafts: dotted rays from the fan's head out through the dust, strongest while the head burns
    { const hx = tH < TX ? qAt(sn, W2) : XEND, I = tH < TX ? .6 + .3 * (sn / PATH_L) : 1.0 * Math.exp(-(tH - TX) / 1.1) + .28 * Math.exp(-(tH - TX) / 5);
      const front = Math.min(3000, 1500 * (tH - TX * .2) + 30);
      if (I > .02 && front > 20) {
        ap(Wf, hx, W3);
        for (let k = 0; k < NRAY; k++) {
          const ry = RAYS[k], b = ry.b * I * (.75 + .25 * Math.sin(tH * 7 * ry.f + ry.ph)); if (b < .02) continue;
          apD(Wf, ry.d, W1); W4[0] = W3[0] + W1[0] * front; W4[1] = W3[1] + W1[1] * front; W4[2] = W3[2] + W1[2] * front;
          if (!K.pj(W3[0], W3[1], W3[2])) continue; const x0 = K.PJ[0], y0 = K.PJ[1], z0 = K.PJ[2];
          if (!K.pj(W4[0], W4[1], W4[2])) continue; const x1 = K.PJ[0], y1 = K.PJ[1], z1 = K.PJ[2];
          const Ls = Math.hypot(x1 - x0, y1 - y0), n = Math.min(800, Math.ceil(Ls / 2.6)), nx = -(y1 - y0) / (Ls || 1), ny = (x1 - x0) / (Ls || 1), wd = Ls * .045 * ry.f;
          for (let m = 1; m <= n; m++) {
            const u = m / n, den = fr(k * 7.3 + m, 3.7), a = b * .8 * Math.pow(1 - u, 1.05) * (.4 + .6 * den) * (den > .85 ? 1.6 : 1);
            if (a < .02) continue;
            const nw = 1 + Math.min(3, Math.floor(wd * u / 7));
            for (let q = 0; q < nw; q++) {
              const o_ = (fr(k * 3.1 + m * 1.3, q + 1.7) - .5) * (2 + wd * u), x = x0 + (x1 - x0) * u + nx * o_, y = y0 + (y1 - y0) * u + ny * o_;
              if (x < 0 || y < 0 || x >= K.BW || y >= K.BH) continue;
              K.dot(x, y, a > .5 && u < .25 && q === 0 ? 2 : 1, 255, 244, 224, Math.min(1, a * (q ? .7 : 1)));
            }
          }
        }
      }
    }
    // the sparks: droplets cooling white -> amber -> gone, streaked by their motion at the rate shown
    for (let i = 0; i < NSP; i++) {
      const j = i * SPN, t = tH - SPK[j + 6]; if (t < 0 || t > SPK[j + 7] * 1.4) continue;
      const lf = t / SPK[j + 7], a = lf < 1 ? 1 - lf * .55 : .45 * (1.4 - lf) / .4;
      W1[0] = SPK[j] + SPK[j + 3] * t; W1[1] = SPK[j + 1] + SPK[j + 4] * t; W1[2] = SPK[j + 2] + SPK[j + 5] * t;
      const sl = Math.hypot(SPK[j + 3], SPK[j + 4], SPK[j + 5]) * sh, k = sl > 6 ? 6 / sl : 1;
      W2[0] = W1[0] - SPK[j + 3] * sh * k; W2[1] = W1[1] - SPK[j + 4] * sh * k; W2[2] = W1[2] - SPK[j + 5] * sh * k;
      ap(Wf, W1, W3); ap(Wf, W2, W4);
      K.lineW(W4[0], W4[1], W4[2], W3[0], W3[1], W3[2], 2, 1, lf < .25 ? HOT : lf < .7 ? FIRE : EMB, Math.min(1, a) * .95, null, 0, 0);
    }
    // the bursts: a white flash, an expanding shell of glowing gas and grit, arcs off the shorted metal
    for (let bi = 0; bi < BURST.length; bi++) {
      const b = BURST[bi], t = tH - b.t; if (t < -.002 || t > 2.5) continue;
      const Ws = b.kind === 'wheel' ? Wt : Wt;                       // (all before the break: the ship whole)
      ap(Ws, b.p, W3);
      const k = Math.sqrt(b.E / 20), fl0 = Math.exp(-Math.max(0, t) / .06), fl1 = Math.exp(-Math.max(0, t) / .3);
      if (K.pj(W3[0], W3[1], W3[2]) && K.onS(500)) {
        // (the light comes through the hull's seams and the furrow: drawn over it, not hidden by it)
        const ppm = fl / K.PJ[2], sx = K.PJ[0], sy = K.PJ[1];
        K.softR(sx, sy, Math.min(420, (28 + 34 * k) * ppm * (.35 + .65 * fl0) + 16), 255, 250, 236, Math.min(1, 1.1 * fl0 + .4 * fl1));
        K.softR(sx, sy, Math.min(520, (60 + 70 * k) * ppm * (.6 + .4 * fl1) + 30), 255, 196, 128, .32 * fl1);
        if (fl0 > .05) LENS.push(sx, sy, .7 * fl0 * Math.min(1.4, k), .3 + .3 * k);
      }
      const Rs = b.vs * Math.max(0, t), aS = Math.exp(-t / .4) * Math.min(1, t * 40);
      if (aS > .02 && Rs > 1) {
        for (let i = 0; i < NSH; i++) {
          const q = (i * 7 + bi * 131) % NSH, rad = Rs * SHD[q * 4 + 3];
          const x = W3[0] + SHD[q * 4] * rad, y = W3[1] + SHD[q * 4 + 1] * rad, z = W3[2] + SHD[q * 4 + 2] * rad;
          const ht = 2 * Math.exp(-t / .12);
          K.dotW(x, y, z, 1, ht > .15 ? heatCol(ht) : GRIT, aS * (.5 + .5 * fr(i, bi)));
        }
      }
      if (t < .35) for (let a = 0; a < 4; a++) {
        const d = SHD[((a * 277 + bi * 61) % NSH) * 4], d1 = SHD[((a * 277 + bi * 61) % NSH) * 4 + 1], d2 = SHD[((a * 277 + bi * 61) % NSH) * 4 + 2], l = b.R * rr0(a, bi);
        W4[0] = W3[0] + d * l; W4[1] = W3[1] + d1 * l; W4[2] = W3[2] + d2 * l; arc(W3, W4, a + bi * 5, tH, (1 - t / .35) * .9);
      }
      // a wheel's node keeps glowing, torn open
      if (b.kind === 'wheel' && t > 0) { const g = cool(1, 1.5, t) + cool(.35, 25, t); K.glowW(W3[0], W3[1], W3[2], 26, g > .5 ? AMB : EMB, .5 * g); }
    }
    // the head: the round cutting (blinding), then the last burst where it breaks up
    { let hp = null, I = 0;
      if (tH < TX) { hp = qAt(sn, W2); I = 1; } else if (tH < TX + .4) { hp = XEND; I = Math.exp(-(tH - TX) / .05); }
      if (hp) {
        ap(Wf, hp, W3);
        K.glowW(W3[0], W3[1], W3[2], 120 + 220 * I, HOT, Math.min(1, I));
        K.glowW(W3[0], W3[1], W3[2], 420 * I + 40, AMB, .45 * I);
        if (K.pj(W3[0], W3[1], W3[2])) { D.head.x = K.PJ[0]; D.head.y = K.PJ[1]; D.head.on = true; }
      }
    }
    // the vents: gas freezing to ice as it leaves, cones of straight lines thinning outward
    for (let i = 0; i < NV; i++) {
      const j = i * VN, kind = VNT[j + 9], sp = VNT[j + 6], Pd = VNT[j + 7];
      const age = (tH + VNT[j + 8] * Pd) % Pd, te = tH - age; if (te < 0) continue;
      const lf = age / Pd, a = ventRate(te, kind) * (1 - lf) * (1 - lf) * Math.min(1, age * 5) * (kind ? .95 : .6); if (a < .02) continue;
      W1[0] = VNT[j] + VNT[j + 3] * sp * age; W1[1] = VNT[j + 1] + VNT[j + 4] * sp * age; W1[2] = VNT[j + 2] + VNT[j + 5] * sp * age;
      if (kind === 2) { aftAt(te, AFTV); comp(Wt, AFTV, WV); ap(WV, [VNT[j], VNT[j + 1], VNT[j + 2]], W2); apD(WV, [VNT[j + 3], VNT[j + 4], VNT[j + 5]], W4); W3[0] = W2[0] + W4[0] * sp * age; W3[1] = W2[1] + W4[1] * sp * age; W3[2] = W2[2] + W4[2] * sp * age; }
      else if (kind === 0 && VSEC[i] === 1 && te > TB) { aftAt(te, AFTV); comp(Wt, AFTV, WV); ap(WV, W1, W3); }
      else if (kind === 0 && VSEC[i] < 0) continue;
      else ap(Wt, W1, W3);
      K.dotW(W3[0], W3[1], W3[2], kind && lf < .25 ? 2 : 1, lf < .12 ? WH : ICE, a);
    }
    aftAt(tH, AFT);
  }
  const AFTV = { R: new Float64Array(9), T: [0, 0, 0], on: false, th: 0 }, WV = { R: new Float64Array(9), T: [0, 0, 0] };
  const rr0 = (a, b) => .6 + .8 * fr(a + 3, b + 9);
  D.draw = draw;

  /* ---------- ring A broken ---------- */
  D.ringEdit = (PP, tH) => {
    BROKEN = tH > TC;
    if (!BROKEN) return;
    const ch = PP.rings[RI].chords[ci];
    for (let i = 0; i < 9; i++) SAVE.R[i] = ch.R[i]; SAVE.T[0] = ch.T[0]; SAVE.T[1] = ch.T[1]; SAVE.T[2] = ch.T[2]; SAVED_W = PP.W;
    ch.T[0] = 1e9; ch.T[1] = 1e9; ch.T[2] = 1e9;
  };
  const SVW = { R: new Float64Array(9), T: [0, 0, 0] }, IWT = { R: new Float64Array(9), T: [0, 0, 0] };
  /* a world point posed with the fore section's transform moved to where the aft section has it */
  function foreToAft(Wt, Wa, p, out) {
    const M = Wt.R, dx = p[0] - Wt.T[0], dy = p[1] - Wt.T[1], dz = p[2] - Wt.T[2];
    W1[0] = M[0] * dx + M[3] * dy + M[6] * dz; W1[1] = M[1] * dx + M[4] * dy + M[7] * dz; W1[2] = M[2] * dx + M[5] * dy + M[8] * dz;
    return ap(Wa, W1, out);
  }
  const sameXf = (A, B) => A && B && Math.abs(A.T[0] - B.T[0]) + Math.abs(A.T[1] - B.T[1]) + Math.abs(A.T[2] - B.T[2]) < 1e-3 && Math.abs(A.R[0] - B.R[0]) + Math.abs(A.R[4] - B.R[4]) + Math.abs(A.R[8] - B.R[8]) < 1e-6;
  function ringFX(PP, Wt, Wa, tH) {
    const tc = tH - TC, broken = tH > TB;
    // (the saved chord pose was taken from a fore-posed ring: carry it onto the aft section)
    const fix = broken && SAVED_W && sameXf(SAVED_W, Wt);
    if (BROKEN && D.ringAlpha > .01) {
      const fr0 = Math.floor(tH * 30), I = Math.exp(-tc / 2.2) * D.ringAlpha, hl = P.RCH / 2;
      for (const sg of [-1, 1]) {
        const pe = ap(SAVE, [-1.5, sg * (hl - .5), 0], W1).slice(); if (fix) foreToAft(Wt, Wa, pe, pe);
        const hot = cool(1, 4, tc) * D.ringAlpha;
        if (hot > .02) { K.glowW(pe[0], pe[1], pe[2], 26, FIRE, .5 * hot); K.glowW(pe[0], pe[1], pe[2], 9, HOT, .7 * hot); }
        for (let k = 0; k < 3; k++) {
          if (fr(k + sg, fr0) > .3 + .65 * (1 - I)) continue;
          ap(SAVE, [-5.5 + (fr(k + 3, fr0) - .5) * 4, sg * (hl - 2 - fr(k + 7, fr0) * 6), (fr(k + 5, fr0) - .5) * 8], W2); if (fix) foreToAft(Wt, Wa, W2, W2);
          K.lineW(pe[0], pe[1], pe[2], W2[0], W2[1], W2[2], 1.4, 1, WHT, I * .9, AMB, .05, 0);
        }
      }
    }
    // the shoes rubbing on the pylons as the ring wobbles: sparks off them
    if (tc > .5 && PP) {
      const R_ = PP.rings[RI], wob = tiltOf(tH)[0] * D.wobK, onFore = broken && sameXf(PP.W, Wt);
      for (let p = 0; p < 4; p++) {
        const k = Math.abs(Math.sin(psiAt(tH) + p * PI / 2)) * Math.min(1, Math.abs(wob) / (1.5 * DEG)); if (k < .2) continue;
        const sp = onFore ? foreToAft(Wt, Wa, R_.shoeP[p], W4) : R_.shoeP[p];
        for (let i = 0; i < 40; i++) {
          const h1 = fr(i + p * 50, Math.floor(tH * 24)), h2 = fr(i * 3 + p, Math.floor(tH * 24) + 7), t = h1 * .6;
          K.dotW(sp[0] + (h2 - .5) * 40 * t, sp[1] + (fr(i, p + 1) - .5) * 40 * t, sp[2] + (fr(i, p + 2) - .5) * 40 * t, 1, t < .2 ? HOT : FIRE, k * (1 - t / .6));
        }
      }
    }
  }
  const TL_ = [0, 0];
  function tiltOf(tH) { const tc = tH - TC; TL_[0] = tc > 0 ? 3.2 * DEG * (1 - Math.exp(-tc / 3)) * (1 + .15 * Math.sin(tc * 1.7)) : 0; TL_[1] = 0; return TL_; }
  D.tilt = tH => tiltOf(tH);
  D.tilt0 = tH => tiltOf(tH)[0];
  const GB = [1, 0];
  D.gimbal = tH => { const a = psiAt(tH) + thC - psiAt(TC) + PI / 2; GB[0] = Math.cos(a); GB[1] = Math.sin(a); return GB; };

  /* ---------- the screen flashes: a white core and a long horizontal lens streak (no grey wash) ---------- */
  function streak(Kv, x, y, I, len) {
    const pb = Kv.pb, d = pb.d, W = pb.W, Hh = pb.H, S = (Kv.S || 1);
    const th = 2.0 * S, yr = Math.ceil(th * 30), xl = Math.max(0, Math.floor(x - len)), xr = Math.min(W - 1, Math.ceil(x + len));
    for (let yy = Math.max(0, Math.floor(y - yr)); yy <= Math.min(Hh - 1, Math.ceil(y + yr)); yy++) {
      const dy = (yy + .5 - y) / th, gv = Math.exp(-dy * dy) + .32 * Math.exp(-dy * dy / 22) + .09 * Math.exp(-dy * dy / 190);
      if (gv < .004) continue;
      let q = (yy * W + xl) << 2;
      for (let xx = xl; xx <= xr; xx++, q += 4) {
        const dx = Math.abs(xx + .5 - x) / len, gh = Math.exp(-dx * 4.2) * .75 + .25 * Math.max(0, 1 - dx), w = I * gv * gh * 255;
        if (w < .5) continue;
        d[q] += w; d[q + 1] += w * .95; d[q + 2] += w * .86;
      }
    }
  }
  function core(Kv, x, y, I, rad) {
    const pb = Kv.pb, d = pb.d, W = pb.W, Hh = pb.H;
    const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(W - 1, Math.ceil(x + rad)), y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(Hh - 1, Math.ceil(y + rad)), ir = 1 / rad;
    for (let yy = y0; yy <= y1; yy++) { let q = (yy * W + x0) << 2; for (let xx = x0; xx <= x1; xx++, q += 4) { const dx = (xx + .5 - x) * ir, dy = (yy + .5 - y) * ir, r2 = dx * dx + dy * dy; if (r2 >= 1) continue; const w = I * 255 * (Math.exp(-r2 * 9) + .3 * (1 - r2) * (1 - r2)); d[q] += w; d[q + 1] += w * .97; d[q + 2] += w * .9; } }
  }
  /* I: the main flash's strength (the act times it on the screen's clock), at the head's last screen position */
  D.lensFX = (Kv, I) => {
    const S = Kv.S || 1, BWv = Kv.pb.W;
    if (I > .01 && D.head.on) { streak(Kv, D.head.x, D.head.y, Math.min(1.4, I), BWv * (.45 + .55 * Math.min(1, I))); core(Kv, D.head.x, D.head.y, Math.min(1, I), (40 + 260 * Math.min(1, I)) * S); }
    for (let i = 0; i < LENS.length; i += 4) streak(Kv, LENS[i], LENS[i + 1], LENS[i + 2], BWv * LENS[i + 3]);
  };
  D.flash = () => {};

  /* ---------- tags and readout ---------- */
  const stats = (() => { let vmax = 0, nBig = 0; for (const f of frags) if (f.size >= 3) nBig++; for (let i = 0; i < NFUR; i++) vmax = Math.max(vmax, Math.hypot(PCD[i * PCN + 3], PCD[i * PCN + 4], PCD[i * PCN + 5])); return { nFr: frags.length, nBig, nPc: NPC, vmaxFur: vmax, path: PATH_L, widthEnd: 2 * hw(PATH_L), depthEnd: PATH_L * SI, ringVt: OMG * CA, chord: ci + 1 }; })();
  D.stats = stats;
  /* put(p (platform, already where its section has it), key, id, label, value, cls, alpha, dx, dy); aOf(key) -> alpha */
  const TP = [0, 0, 0];
  D.tags = (tH, put, aOf) => {
    const a = (t0, t1) => ss(t0, t0 + .05, tH) * (1 - ss(t1 - .05, t1, tH));
    const sn = sNowOf(tH);
    put(qAt(Math.max(8, sn * .5), TP), 'dfur', 'FUR', 'Furrow · starboard shoulder', `${Math.round(sn)} m · ${(2 * hw(sn)).toFixed(0)} m wide`, 'coral sm', aOf ? aOf('dfur') : a(.002, .3), -70, -64);
    put(D.toSec(BURST[2].p, tH, TP), 'dbus', 'BUS', 'Ring A feed · shorted', `${Math.round(Math.min(E_BUS, relAt(tH) - (tH > TW[0] ? E_WHEEL * Math.min(4, TW.filter(t => tH > t).length) : 0)))} GJ`, 'coral sm', aOf ? aOf('dbus') : a(.32, .9), 64, -62);
    const th = (ci + .5) * DA + psiAt(tH), qn = D.toSec([Math.cos(th) * CA, Math.sin(th) * CA, RZ], tH, [0, 0, 0]);
    put(qn, 'dring', 'RNG A', `Ring A · ${TW.filter(t => tH > t).length} wheels burst · chord ${ci + 1} gone`, `${(E_WHEEL * TW.filter(t => tH > t).length).toFixed(0)} GJ`, 'coral sm', aOf ? aOf('dring') : a(.7, 2.5), 56, -50);
    put(D.toSec([30, 40, ZB - 2], tH, TP), 'dbrk', 'BRK', 'Hull broken · frame 258', `${(Math.abs(thB(tH)) / DEG).toFixed(0)}°`, 'coral sm', aOf ? aOf('dbrk') : a(TB + .1, 30), 70, -70);
  };
  D.info = tH => {
    const sn = sNowOf(tH), rel = relAt(tH), nw = TW.filter(t => tH > t).length;
    if (tH < TX) return { l1: `Impact · <b>${(VREL / 1000).toFixed(1)} km/s</b> · <b>${(o.KE / 1e9).toFixed(1)} GJ</b> · <b>2.5°</b> to the hull`, l2: `Furrow <b>${Math.round(sn)} m</b> along the starboard shoulder · <b>${(2 * hw(sn)).toFixed(0)} m</b> wide` };
    if (tH < BURST[0].t) return { l1: `Debris · <b>${stats.nFr}</b> pieces, <b>${Math.round(stats.nPc / 1000)} 000</b> fragments · up to <b>${(stats.vmaxFur / 1000).toFixed(1)} km/s</b>`, l2: `Furrow <b>${PATH_L} m</b> · <b>${stats.depthEnd.toFixed(0)} m</b> deep at its end · round <b>broken up</b>` };
    if (tH < TB) return { l1: `Stored energy <b>letting go</b> · <b>${(rel / 1000).toFixed(2)} TJ</b> of 1.2 TJ`, l2: nw ? `Ring A feed <b>shorted</b> · <b>${nw}</b> of 28 wheels burst (<b>21 GJ</b> each)` : `Ring A feed <b>cut</b> by the furrow · bus <b>shorting</b>` };
    return { l1: `Hull <b>broken</b> at frame 258 · aft section <b>${(Math.abs(thB(tH)) / DEG).toFixed(0)}°</b> off the line`, l2: `Released <b>${(rel / 1000).toFixed(2)} TJ</b> (bus <b>${(E_BUS / 1000).toFixed(2)}</b>, 4 wheels <b>${(4 * E_WHEEL / 1000).toFixed(2)}</b>) · <b>${((E_STORE - rel) / 1000).toFixed(2)} TJ</b> left` };
  };
  return D;
}
window.IDMG = { build, path };
})();
