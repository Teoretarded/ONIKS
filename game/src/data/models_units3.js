/* ONIKS · the third wave of units (film quality), in the GEO / HD part format (see models.js):
     cg      CG-47 Ticonderoga class guided-missile cruiser (fleet)
     lcs     LCS-2 Independence class littoral combat ship, trimaran (fleet)
     s400    5P85SM2-01 launcher of the S-400: four 48N6 containers on a semi-trailer behind a BAZ-64022 tractor (coast)
     s400r   92N6E engagement radar of the S-400 on an MZKT-7930 8×8 (coast)
     bereg   A-222 Bereg 130 mm self-propelled coastal gun on a MAZ-543M 8×8 (coast)
   and their rounds as closed shells: s400_msl (48N6E3), shell130, shell57, rim116 (RAM).

   Metres, +Z forward, +Y up, +X starboard. Ships: origin midships on the waterline (the unit models stop at the
   waterline like HD.destroyer; the cutaways add the underwater body). Vehicles: origin on the ground at the vehicle
   centre. Munitions: origin mid-body, nose +Z. Public-reference level: external shapes, public designations, sizes.

   Exports
     cg lcs s400 s400r bereg · s400Msl shell130 shell57 rim116      model factories
     cgCut lcsCut s400Cut s400rCut beregCut                          Inspect cutaways (unit model + interior parts)
     CG, LCS, S400, S400R, BEREG                                     anchors (VLS cells, mounts, pivots, muzzles)
     UNITS3_INFO, UNITS3_STATES, UNITS3_ANATOMY                      MODEL_INFO / MODEL_STATES / ANATOMY entries

   States
     cg     radar (rad, AN/SPS-49 turning), gunYaw gunPitch (fwd Mk 45), gunYawA gunPitchA (aft Mk 45, yaw π = aft),
            ciwsYaw [2] ciwsPitch [2] ciwsSpin (Phalanx, as HD.destroyer), vlsOpen [[cell, 0..1]] (cells 0..60 fwd,
            61..121 aft), hangar (0..1 doors)
     lcs    radar (rad, Sea Giraffe), gunYaw gunPitch (Mk 110 57 mm), ramYaw (SeaRAM)
     s400   elev (0 stowed .. π/2 vertical), dep (0..1 jacks down), n (containers still loaded 0..4: a fired one has
            lost its top cover), wheel (rad)
     s400r  mast (0 folded flat on the cabin .. 1 raised), ant (rad, turntable), wheel (rad)
     bereg  yaw (turret), pitch (gun elevation), dep (0..1 jacks), fire (0..1 recoil), wheel (rad) */
const M3 = window.M3, GEO = window.GEO, HD = window.HD;
const { V, R, X } = M3;
const { hex, box, lathe, cyl, panel, line } = GEO;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const FX = [1, 0, 0], FY = [0, 1, 0], FZ = [0, 0, 1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const SA = HD.seaAir, tp = HD.tp, tps = (T, L) => L.map(pr => tp(T, pr));
const about = HD.about, ringW = HD.ring, circle = HD.circle, prism = HD.prism;
const { fl, fquad, plate } = SA;
const T3 = p => X.make(R.I(), p);
const memo = f => { let c = null; return () => c || (c = f()); };
const hidden = { inside: true, show: st => !!st.xray };

/* ---------------------------------------------------------------- shared helpers */
/* facing-aware polyline as single segments (normal n or (i, a, b) -> n) */
function fpoly(P, N, o, closed) {
  const out = [], Q = closed ? P.concat([P[0]]) : P;
  for (let i = 0; i < Q.length - 1; i++) out.push(fl(Q[i], Q[i + 1], typeof N === 'function' ? N(i, Q[i], Q[i + 1]) : N, typeof o === 'function' ? o(i) : o));
  return out;
}
/* outward horizontal normal of a side line a->b on side s, tilted up by `up` */
function sideN(a, b, s, up) {
  const t = V.sub(b, a); let n = [t[2], 0, -t[0]];
  if (n[0] * s < 0) n = V.mul(n, -1);
  n = V.norm(n); return V.norm([n[0], up || 0, n[2]]);
}
/* closed flat octagon (a radar face): centre c, in-plane unit axes h (across) and u (up), outward normal n,
   circumradius r. Dots: three plates; lines: the outline and a coarse element grid (fine) */
function octFace(c, h, u, n, r, o) {
  o = o || {};
  const P = []; for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU; P.push(V.add(c, V.add(V.mul(h, Math.cos(a) * r), V.mul(u, Math.sin(a) * r)))); }
  const out = [plate([P[0], P[3], P[4], P[7]], n, { al: 0 }), plate([P[0], P[1], P[2], P[3]], n, { al: 0 }), plate([P[4], P[5], P[6], P[7]], n, { al: 0 })];
  out.push(line(P, { closed: true, w: .95, pts: false }));
  if (o.grid !== false) for (const k of [-.5, 0, .5]) {
    out.push(line([V.mad(V.mad(c, h, k * r), u, -r * .88), V.mad(V.mad(c, h, k * r), u, r * .88)], fn({ w: .3, pts: false })));
    out.push(line([V.mad(V.mad(c, u, k * r), h, -r * .88), V.mad(V.mad(c, u, k * r), h, r * .88)], fn({ w: .3, pts: false })));
  }
  return out;
}
/* rectangle panel from centre and half axes (pts false unless o says otherwise) */
const rect = (c, u, v, a, b, o) => panel([V.add(c, V.add(V.mul(u, -a), V.mul(v, -b))), V.add(c, V.add(V.mul(u, a), V.mul(v, -b))),
  V.add(c, V.add(V.mul(u, a), V.mul(v, b))), V.add(c, V.add(V.mul(u, -a), V.mul(v, b)))], O({ pts: false }, o));
/* a row of window panes on a wall from a to b (bottom edge), height h above, n panes, pushed off along nrm */
function windowRow(a, b, y0, h, n, nrm, o) {
  const out = [], L = V.dist(a, b), g = .09 / Math.max(1, L);
  for (let k = 0; k < n; k++) {
    const t0 = k / n + g, t1 = (k + 1) / n - g, p0 = V.mad(V.lerp(a, b, t0), nrm, .03), p1 = V.mad(V.lerp(a, b, t1), nrm, .03);
    out.push(panel([[p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y0 + h, p1[2]], [p0[0], y0 + h, p0[2]]], fn(O({ pts: false, al: .6 }, o))));
  }
  return out;
}
/* lifeline: posts and two wires along a polyline at deck heights y(p) */
function lifeline(P, yOf, o) {
  const out = [], top = P.map(p => [p[0], yOf(p) + 1.0, p[2]]), mid = P.map(p => [p[0], yOf(p) + .5, p[2]]);
  out.push(line(top, fn(O({ w: .45 }, o))), line(mid, fn(O({ w: .3, pts: false }, o))));
  for (let i = 0; i < P.length; i += 2) out.push(line([[P[i][0], yOf(P[i]), P[i][2]], top[i]], fn({ w: .35, pts: false })));
  return out;
}
/* one road wheel set on one side (HD.wheel) */
const wheelSide = (axles, side, rot, o) => { const P = []; for (const z of axles) HD.wheel(P, z, side, O(o, { rot })); return P; };
const partOf = (m, n) => m.parts.find(p => p.name === n);
/* sampling-closed small crate (all six faces sampled) */
const crate = (a, b, o) => box(a, b, O({ bottom: true }, o));

/* ======================================================================================================
   CG-47 TICONDEROGA CLASS · 172.8 m overall, 16.8 m beam, 9.5 m navigational draught (at the sonar dome)
   The Spruance hull: long flush deck with a sheer rising to the bow, a flared forecastle, a transom stern.
   From the bow: Mk 45 5"/54 (fwd), Mk 41 VLS 61 cells, the forward deckhouse (bridge; AN/SPY-1B faces forward and
   to starboard; foremast; Phalanx fwd on the starboard side), the forward funnel, boats on the midships deckhouse,
   the aft funnel, the main mast with AN/SPS-49, the aft deckhouse (AN/SPY-1B faces aft and to port; Phalanx aft
   on the port side; twin hangar doors aft), the flight deck, Mk 41 VLS 61 cells (aft), Mk 45 (aft), and the two
   Mk 141 Harpoon quad launchers on the fantail. Mk 32 SVTT amidships. Four LM2500, two shafts (cutaway).
   ====================================================================================================== */
const CZB = 86.4, CZS = -86.4, CZST = 79.6;
const cgD = z => { const u = z / CZB; return 6.1 + .45 * u + 3.1 * Math.pow(Math.max(0, (u - .25) / .75), 2); };
const cgB = z => { const u = z / CZB; if (u > .12) return 8.4 * Math.max(0, 1 - Math.pow((u - .12) / .88, 1.9)); if (u < -.62) return 8.4 * (1 - .12 * Math.pow((-.62 - u) / .38, 1.4)); return 8.4; };
const cgW = z => { if (z >= CZST) return 0; const u = z / CZB, ue = CZST / CZB; if (u > .08) return 7.9 * Math.max(0, 1 - Math.pow((u - .08) / (ue - .08), 1.7)); if (u < -.6) return 7.9 * (1 - .14 * Math.pow((-.6 - u) / .4, 1.3)); return 7.9; };
const cgK0 = z => z <= CZST ? 0 : cgD(CZB) * Math.pow(Math.min(1, (z - CZST) / (CZB - CZST)), 1 / 1.3);
function cgSec(z) {
  const d = cgD(z), b = cgB(z), y0 = cgK0(z), w = cgW(z), yk = d - Math.min(1.9, (d - y0) * .36);
  return { w: [w, y0], k: [w + (b - w) * .82, yk], d: [b, d] };
}
/* deckhouses, VLS wells: the deck plate is left out under them (no doubled dots) [z0, z1, half width] */
const CG_FH = { z0: 15, z1: 42 }, CG_AH = { z0: -36, z1: -4 }, CG_MH = { z0: -4, z1: 15 };
const CG_VF = 51.0, CG_VA = -61.0, CG_VP = .85;
const CG_HOLES = [[CG_VF - 3.45, CG_VF + 3.45, 4.25], [CG_FH.z0, CG_FH.z1, 7.1], [CG_MH.z0, CG_MH.z1, 5.6], [CG_AH.z0, CG_AH.z1, 7.7], [CG_VA - 3.45, CG_VA + 3.45, 4.25]];
const CG_Z = (() => {
  const hb = []; CG_HOLES.forEach(h => hb.push(h[0], h[1]));
  const base = [CZS, -82, -76, -68, -56, -44, -30, -16, -2, 12, 26, 38, 46, 56, 62, 67, 71, 74.5, 77, CZST - 1.2, CZST, 81.2, 82.8, 84.2, 85.4, CZB];
  return base.filter(v => !hb.some(b => Math.abs(b - v) < .8)).concat(hb).sort((a, b) => a - b);
})();
const CG_GUN = [[0, cgD(62.5), 62.5], [0, cgD(-73), -73]];
const CG_GUN_TR = [0, 1.22, .9], CG_GUN_MZ = [0, 1.22, 7.5];
const CG_CIWS = [[3.9, 15.4, 22.2], [-4.7, 11.3, -32.6]];      // on the forward house's 02 roof, the aft house's 01 roof
const CG_P49 = [0, 32.6, -10.5];          // AN/SPS-49 turning axis (top of the main mast)
const CG_HELO_Z = -46;
/* Mk 41 cells: 8 modules (4 across, 2 along) per launcher, 61 cells (the strikedown crane takes 3 cells of the
   port-outboard forward module). Cell ids 0..60 forward, 61..121 aft. -> { x, y, z, blk } top centre, ship frame */
const CG_CELLS = (() => {
  const out = [];
  for (const [blk, zc] of [[0, CG_VF], [1, CG_VA]]) for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (c === 0 && r < 3) continue;
    const m = c >> 1, j = c & 1;
    out.push({ x: (-3 + 2 * m) * 1.05 + (j ? .72 : -.72), y: cgD(zc) + .06, z: zc + (3.5 - r) * CG_VP, blk, hs: j ? 1 : -1 });
  }
  return out;
})();
const CG_HANGAR = { z: CG_AH.z0, y0: cgD(CG_AH.z0), h: 5.2, doors: [-3.4, 3.4], w: 5.2 };

function cgHull() {
  const P = [], Z = CG_Z, S = Z.map(cgSec);
  const pt = (i, key, s) => [s * S[i][key][0], S[i][key][1], Z[i]];
  for (const s of [-1, 1]) {
    P.push(...fpoly(Z.map((z, i) => pt(i, 'd', s)), (i, a, b) => sideN(a, b, s, 1.1), { al: 1 }));
    const kn = []; Z.forEach((z, i) => { if (z >= 10 && z < CZB) kn.push(pt(i, 'k', s)); });
    P.push(...fpoly(kn, (i, a, b) => sideN(a, b, s, .2), i => ({ al: .6 * sat((kn[i][2] - 10) / 30) })));
    const wl = []; Z.forEach((z, i) => { if (z <= CZST) wl.push(pt(i, 'w', s)); });
    P.push(...fpoly(wl, (i, a, b) => sideN(a, b, s, 0), { al: .8 }));
    for (const zf of [-76, -56, -30, -2, 26, 46, 62, 74]) {
      const q = cgSec(zf), pts = [[s * q.w[0], q.w[1], zf], [s * q.k[0], q.k[1], zf], [s * q.d[0], q.d[1], zf]];
      P.push(...fpoly(pts, V.norm([s, 0, zf > 40 ? (zf - 40) / 40 : 0]), fn({ al: .22 })));
    }
    // hawse pipe and anchor
    const zh = 76.5, xh = cgB(zh) - .05, yh = cgD(zh) - 1.3;
    P.push(ringW([s * xh, yh, zh], [s, .15, .5], .42, fn({ n: 14 })));
    P.push(hex([[s * (xh + .02), yh - .55, zh - .5], [s * (xh + .02), yh - .55, zh + .5], [s * (xh - .1), yh - 1.7, zh + .3], [s * (xh - .1), yh - 1.7, zh - .3],
                [s * (xh + .2), yh - .55, zh - .5], [s * (xh + .2), yh - .55, zh + .5], [s * (xh + .08), yh - 1.7, zh + .3], [s * (xh + .08), yh - 1.7, zh - .3]], fn({ al: .6, pts: false })));
  }
  const stem = []; for (let k = 0; k <= 10; k++) { const z = CZST + (CZB - CZST) * k / 10; stem.push([0, cgK0(z), z]); }
  P.push(line(stem, { w: 1, pts: false }));
  const t0 = cgSec(CZS);
  P.push(fl([-t0.d[0], t0.d[1], CZS], [t0.d[0], t0.d[1], CZS], V.norm([0, 1, -1]), { al: 1 }));
  P.push(fl([-t0.w[0], 0, CZS], [t0.w[0], 0, CZS], [0, 0, -1], { al: .8 }));
  for (const s of [-1, 1]) P.push(...fpoly([[s * t0.w[0], 0, CZS], [s * t0.k[0], t0.k[1], CZS], [s * t0.d[0], t0.d[1], CZS]], V.norm([s * .4, 0, -1]), { al: 1 }));
  for (let i = 0; i < Z.length - 1; i++) {
    for (const s of [-1, 1]) {
      P.push(plate([pt(i, 'w', s), pt(i + 1, 'w', s), pt(i + 1, 'k', s), pt(i, 'k', s)], [s, 0, 0]));
      P.push(plate([pt(i, 'k', s), pt(i + 1, 'k', s), pt(i + 1, 'd', s), pt(i, 'd', s)], [s, 0, 0]));
    }
    const zm = (Z[i] + Z[i + 1]) / 2; let hw = 0;
    for (const h of CG_HOLES) if (zm > h[0] && zm < h[1]) hw = Math.max(hw, h[2]);
    const b0 = S[i].d[0], b1 = S[i + 1].d[0], y0 = S[i].d[1], y1 = S[i + 1].d[1];
    if (hw <= 0) P.push(plate([[-b0, y0, Z[i]], [b0, y0, Z[i]], [b1, y1, Z[i + 1]], [-b1, y1, Z[i + 1]]], [0, 1, 0]));
    else for (const s of [-1, 1]) if (Math.min(b0, b1) > hw + .05) P.push(plate([[s * hw, y0, Z[i]], [s * b0, y0, Z[i]], [s * b1, y1, Z[i + 1]], [s * hw, y1, Z[i + 1]]], [0, 1, 0]));
  }
  P.push(plate([[-t0.w[0], 0, CZS], [t0.w[0], 0, CZS], [t0.k[0], t0.k[1], CZS], [-t0.k[0], t0.k[1], CZS]], [0, 0, -1]));
  P.push(plate([[-t0.k[0], t0.k[1], CZS], [t0.k[0], t0.k[1], CZS], [t0.d[0], t0.d[1], CZS], [-t0.d[0], t0.d[1], CZS]], [0, 0, -1]));
  return P;
}
/* block with sloped walls between deck heights: half widths xb (base) / xt (top), z ranges base / top */
const sblock = (xb, zb0, zb1, ya, yf, xt, zt0, zt1, y1, o) => hex([[-xb, ya, zb0], [xb, ya, zb0], [xb, yf, zb1], [-xb, yf, zb1], [-xt, y1, zt0], [xt, y1, zt0], [xt, y1, zt1], [-xt, y1, zt1]], o);
/* the three deckhouses: forward (bridge, SPY fwd + stbd), midships (boats, funnels), aft (SPY aft + port, hangars) */
function cgHouses() {
  const F = [], A = [], M = [];
  // forward deckhouse: 01 level full width, 02-03 levels, the bridge level with its wings, the pilot house roof
  const f0 = cgD(CG_FH.z0), f1 = cgD(CG_FH.z1), y1 = 9.9, y2 = 15.4, y3 = 18.3;
  F.push(sblock(7.1, CG_FH.z0, CG_FH.z1, f0 - .05, f1 - .05, 7.0, CG_FH.z0 + .2, CG_FH.z1 - .3, y1, { skip: [1] }));
  F.push(plate([[-7, y1, CG_FH.z0 + .2], [7, y1, CG_FH.z0 + .2], [7, y1, CG_FH.z0 + 4.4], [-7, y1, CG_FH.z0 + 4.4]], FY));
  F.push(prism(-6.2, 6.2, y1, y2, CG_FH.z0 + 4.4, CG_FH.z1 - 1.2, -5.8, 5.8, CG_FH.z0 + 4.8, CG_FH.z1 - 2.0, { skip: [1] }));
  F.push(plate([[-5.8, y2, CG_FH.z0 + 4.8], [5.8, y2, CG_FH.z0 + 4.8], [5.8, y2, CG_FH.z1 - 7.5], [-5.8, y2, CG_FH.z1 - 7.5]], FY));
  F.push(prism(-5.8, 5.8, y2, y3, CG_FH.z1 - 7.5, CG_FH.z1 - 2.0, -5.2, 5.2, CG_FH.z1 - 7.2, CG_FH.z1 - 2.6));
  for (const s of [-1, 1]) F.push(box([s > 0 ? 5.8 : -7.9, y2 + .4, CG_FH.z1 - 6.4], [s > 0 ? 7.9 : -5.8, y2 + 1.4, CG_FH.z1 - 3.6]));   // bridge wings
  F.push(...windowRow([-5.1, 0, CG_FH.z1 - 2.55], [5.1, 0, CG_FH.z1 - 2.55], y2 + 1.25, .95, 9, FZ));
  for (const s of [-1, 1]) F.push(...windowRow([s * 5.25, 0, CG_FH.z1 - 7.1], [s * 5.25, 0, CG_FH.z1 - 2.8], y2 + 1.25, .95, 3, [s, 0, 0]));
  for (const v of [y1 + 2.7, y1 + 5.3]) F.push(line([[-6.1, v, CG_FH.z0 + 4.5], [6.1, v, CG_FH.z0 + 4.5], [6.0, v, CG_FH.z1 - 1.3], [-6.0, v, CG_FH.z1 - 1.3]], fn({ closed: true, w: .28, pts: false })));
  // doors and vents (fine)
  for (const s of [-1, 1]) for (const z of [CG_FH.z0 + 7, CG_FH.z0 + 16]) F.push(rect([s * 7.08, f0 + 1.1, z], [0, 0, 1], FY, .38, .95, fn({ al: .5 })));
  // midships deckhouse between the two big houses (01 level)
  const m0 = cgD(CG_MH.z0), m1 = cgD(CG_MH.z1);
  M.push(sblock(5.6, CG_MH.z0, CG_MH.z1, m0 - .05, m1 - .05, 5.5, CG_MH.z0 + .1, CG_MH.z1 - .1, 9.3));
  // aft deckhouse: 01 level (the hangars in its aft end), the upper block with the aft SPY faces
  const a0 = cgD(CG_AH.z0), a1 = cgD(CG_AH.z1), ya = 11.3, yb = 16.2;
  A.push(sblock(7.7, CG_AH.z0, CG_AH.z1, a0 - .05, a1 - .05, 7.6, CG_AH.z0, CG_AH.z1 - .2, ya, { skip: [1] }));
  A.push(plate([[-7.6, ya, CG_AH.z0], [7.6, ya, CG_AH.z0], [7.6, ya, CG_AH.z0 + 6.5], [-7.6, ya, CG_AH.z0 + 6.5]], FY));
  A.push(prism(-6.4, 6.4, ya, yb, CG_AH.z0 + 6.5, CG_AH.z1 - 2.5, -6.0, 6.0, CG_AH.z0 + 7.0, CG_AH.z1 - 3.0, { skip: [1] }));
  A.push(plate([[-6.0, yb, CG_AH.z0 + 7.0], [6.0, yb, CG_AH.z0 + 7.0], [6.0, yb, CG_AH.z1 - 3.0], [-6.0, yb, CG_AH.z1 - 3.0]], FY));
  A.push(plate([[-7.6, ya, CG_AH.z1 - 2.5], [7.6, ya, CG_AH.z1 - 2.5], [7.6, ya, CG_AH.z1 - .2], [-7.6, ya, CG_AH.z1 - .2]], FY));
  A.push(line([[-6.3, ya + 2.4, CG_AH.z0 + 6.6], [6.3, ya + 2.4, CG_AH.z0 + 6.6], [6.3, ya + 2.4, CG_AH.z1 - 2.6], [-6.3, ya + 2.4, CG_AH.z1 - 2.6]], fn({ closed: true, w: .28, pts: false })));
  for (const s of [-1, 1]) for (const z of [CG_AH.z0 + 12, CG_AH.z0 + 24]) A.push(rect([s * 7.68, a0 + 1.1, z], FZ, FY, .38, .95, fn({ al: .5 })));
  return { F, A, M };
}
/* AN/SPY-1B: forward house fwd + stbd faces, aft house aft + port faces; slightly tilted back */
const CG_SPY = (() => {
  const tilt = 9 * DEG, out = [];
  const face = (c, n) => { const nn = V.norm([n[0] * Math.cos(tilt), Math.sin(tilt), n[2] * Math.cos(tilt)]); const h = V.norm(V.cross(FY, nn)); const u = V.cross(nn, h); out.push({ c, n: nn, h, u }); };
  face([1.6, 13.0, CG_FH.z1 - 1.55], FZ);            // forward
  face([6.05, 13.0, CG_FH.z0 + 10.5], FX);           // starboard
  face([-1.6, 13.6, CG_AH.z0 + 6.65], [0, 0, -1]);   // aft
  face([-6.25, 13.6, CG_AH.z0 + 16.5], [-1, 0, 0]);  // port
  return out;
})();
function cgSpy() {
  const P = [];
  for (const f of CG_SPY) {
    P.push(...octFace(f.c, f.h, f.u, f.n, 1.95));
    P.push(ringW(V.mad(f.c, f.n, -.12), f.n, 2.12, fn({ n: 16 })));
  }
  return P;
}
/* funnels: tall boxes with sloped tops, exhaust pipes and caps */
function cgStacks() {
  const P = [];
  for (const [zc, y0, h] of [[11.0, 9.3, 12.2], [-1.0, 9.3, 11.2]]) {
    const y1 = y0 + h;
    P.push(prism(-2.3, 2.3, y0, y1, zc - 3.2, zc + 3.2, -2.0, 2.0, zc - 3.0, zc + 2.4));
    P.push(plate([[-2.0, y1, zc - 3.0], [2.0, y1, zc - 3.0], [2.0, y1, zc + 2.4], [-2.0, y1, zc + 2.4]], FY));
    for (const x of [-1.1, 0, 1.1]) for (const dz of [-1.4, .6]) P.push(cyl([x, y1, zc + dz], [x, y1 + 1.3, zc + dz - .2], .34, { n: 12, gen: 2, rings: [1] }));
    for (const v of [.3, .65]) P.push(line([[-2.25, y0 + h * v, zc - 3.16], [2.25, y0 + h * v, zc - 3.16], [2.2, y0 + h * v, zc + 3.1], [-2.2, y0 + h * v, zc + 3.1]], fn({ closed: true, w: .25, pts: false })));
    for (const s of [-1, 1]) P.push(panel([[s * 2.28, y0 + h * .72, zc - 2.4], [s * 2.28, y0 + h * .72, zc + 1.8], [s * 2.22, y0 + h * .92, zc + 1.6], [s * 2.22, y0 + h * .92, zc - 2.3]], fn({ hatch: 6, pts: false, al: .5 })));
  }
  return P;
}
/* foremast (lattice on the forward house) and main mast (tripod carrying AN/SPS-49) */
function cgMasts() {
  const F = [], M = [];
  const fb = 18.3, ft = 36.5, fz = CG_FH.z1 - 5.0;
  const legs = [[[-1.9, fb, fz + 1.4], [-.4, ft, fz]], [[1.9, fb, fz + 1.4], [.4, ft, fz]], [[1.9, fb, fz - 1.8], [.4, ft, fz - .3]], [[-1.9, fb, fz - 1.8], [-.4, ft, fz - .3]]];
  for (const [a, b] of legs) F.push(cyl(a, b, .16, { n: 6, gen: 0 }));
  for (let k = 1; k < 6; k++) { const t = k / 6, q = legs.map(([a, b]) => V.lerp(a, b, t)); F.push(line(q, fn({ closed: true, w: .5 }))); if (k % 2) F.push(line([q[0], q[2]], fn({ w: .35, pts: false }))); }
  F.push(box([-.6, ft, fz - .5], [.6, ft + .5, fz + .3]));
  F.push(cyl([-5.2, 30.5, fz - .1], [5.2, 30.5, fz - .1], .12, { n: 6, gen: 0 }));                 // yardarm
  F.push(lathe([0, ft + .5, fz - .1], FY, [[0, .5], [.9, .45], [1.1, .15]], fn({ n: 14, gen: 4 })));   // TACAN
  F.push(cyl([0, ft + 1.6, fz - .1], [0, ft + 4.2, fz - .1], .07, { n: 6, gen: 0 }));
  F.push(box([-1.3, 27.0, fz - .7], [1.3, 27.5, fz + .6], fn()));                                    // SPS-55 platform
  for (const s of [-1, 1]) F.push(line([[s * 5.2, 30.5, fz - .1], [s * 5.0, 26.5, fz + 1]], fn({ w: .3, pts: false })));
  // main mast: tripod from the aft house roof to the SPS-49 platform
  const mb = 16.2, mz = CG_P49[2];
  for (const b of [[-2.6, mb, mz + 2.2], [2.6, mb, mz + 2.2], [0, mb, mz - 2.8]]) M.push(cyl(b, [0, CG_P49[1] - 1.2, mz], .3, { n: 8, gen: 0 }));
  M.push(box([-1.4, CG_P49[1] - 1.4, mz - 1.4], [1.4, CG_P49[1] - .9, mz + 1.4]));
  M.push(cyl([-4.2, 27.0, mz + .6], [4.2, 27.0, mz + .6], .12, { n: 6, gen: 0 }));
  M.push(cyl([0, CG_P49[1] - .9, mz], [0, CG_P49[1] + .4, mz], .35, { n: 10, gen: 0 }));
  return { F, M };
}
/* AN/SPS-49: 7.3 × 4.3 m mesh reflector on its pedestal, feed horn on a boom; turns about CG_P49 */
function cgSps49() {
  const P = [], c = V.add(CG_P49, [0, 2.6, .35]), w = 3.65, h = 2.15, tilt = 12 * DEG;
  const u = [1, 0, 0], v = [0, Math.cos(tilt), -Math.sin(tilt)];
  const q = (x, y, bow) => V.add(V.add(c, V.add(V.mul(u, x), V.mul(v, y))), [0, 0, -bow]);
  // shallow curved reflector: 3 bands across
  for (let i = 0; i < 4; i++) {
    const x0 = -w + i * w / 2, x1 = x0 + w / 2, b0 = .5 * (1 - Math.pow(x0 / w, 2)), b1 = .5 * (1 - Math.pow(x1 / w, 2));
    P.push(panel([q(x0, -h, b0), q(x1, -h, b1), q(x1, h, b1), q(x0, h, b0)], { hatch: 5, hatch2: 3, edge: .9 }));
  }
  P.push(box(V.add(CG_P49, [-.5, .4, -.5]), V.add(CG_P49, [.5, 1.2, .5])));
  P.push(cyl(V.add(CG_P49, [0, 1.2, 0]), V.add(c, [0, 0, -.2]), .12, { n: 6, gen: 0 }));
  P.push(cyl(q(0, -h * .8, .4), V.add(c, [0, -.4, 2.6]), .08, { n: 6, gen: 0 }));
  P.push(box(V.add(c, [-.25, -.65, 2.55]), V.add(c, [.25, -.15, 2.95]), fn()));
  return P;
}
/* Mk 45 Mod 2 5"/54 in its own frame: origin on the deck at the mount centre, +Z along the gun at yaw 0 */
const CG_GUNHOUSE = [
  lathe([0, 0, 0], FY, [[0, 2.0], [.3, 1.9]], { n: 28, gen: 0 }),
  hex([[-1.55, .3, -2.4], [1.55, .3, -2.4], [1.45, .3, 1.1], [-1.45, .3, 1.1], [-1.3, 2.25, -2.15], [1.3, 2.25, -2.15], [.95, 2.25, .1], [-.95, 2.25, .1]]),
  hex([[-1.45, .3, 1.1], [1.45, .3, 1.1], [.62, .3, 2.05], [-.62, .3, 2.05], [-.95, 2.25, .1], [.95, 2.25, .1], [.35, 1.6, 1.8], [-.35, 1.6, 1.8]], { skip: [2] }),
  panel([[-.22, .65, 2.04], [.22, .65, 2.04], [.22, 1.6, 1.8], [-.22, 1.6, 1.8]], fn({ pts: false, al: .6 })),
  line([[-1.3, 2.25, -1.1], [1.3, 2.25, -1.1]], fn({ w: .4, pts: false })),
  box([-.45, 2.25, -1.9], [.45, 2.4, -1.2], fn()),
];
function mk45Barrel() {
  return [
    lathe([0, CG_GUN_TR[1], CG_GUN_TR[2] - .6], FZ, [[0, .21], [1.05, .21], [1.3, .13], [6.8, .095], [7.2, .09]], { n: 12, gen: 0, rings: [0, 1, 2, 4], caps: true }),
    lathe([0, CG_GUN_TR[1], CG_GUN_TR[2] + .45], FZ, [[0, .48], [.5, .23]], { n: 14, gen: 4 }),
    ringW(V.add(CG_GUN_MZ, [0, 0, -.02]), FZ, .07, fn({ n: 8 })),
  ];
}
const cgGunXf = (i, st) => X.make(R.y(i ? (st.gunYawA === undefined ? PI : st.gunYawA) : (st.gunYaw || 0)), CG_GUN[i]);
const cgGunElev = (i, st) => about(R.x(-((i ? st.gunPitchA : st.gunPitch) || 0)), CG_GUN_TR);
const cgGun = i => st => CG_GUNHOUSE.concat(tps(cgGunElev(i, st), mk45Barrel()));
/* Phalanx 1B: HD.destroyer's mount (its dyn builds the mount in the mount frame; state ciwsPitch [i], ciwsSpin) */
const DD_CIWS = memo(() => { const m = HD.destroyer(); return [partOf(m, 'ciwsF').dyn, partOf(m, 'ciwsA').dyn]; });
const CIWS_DEF = [0, PI];
const cgCiwsXf = (i, st) => X.make(R.y(st.ciwsYaw && st.ciwsYaw[i] !== undefined ? st.ciwsYaw[i] : CIWS_DEF[i]), CG_CIWS[i]);
const CIWS_MZ = [0, 1.36, 2.12], CIWS_TR = [0, 1.55, 0];
/* Mk 41 VLS: module frames, the crane module's stowed strikedown crane, and per-cell hatches (hinged outboard) */
function cgVlsStatic(blk) {
  const P = [], zc = blk ? CG_VA : CG_VF, y = cgD(zc) + .06;
  for (let m = 0; m < 4; m++) for (let r = 0; r < 2; r++) {
    const xm = (-3 + 2 * m) * 1.05, zm = zc + (r ? -1.7 : 1.7);
    P.push(box([xm - 1.02, y - .3, zm - 1.68], [xm + 1.02, y, zm + 1.68], { pts: false }));
    P.push(panel([[xm - .19, y + .01, zm - 1.55], [xm + .19, y + .01, zm - 1.55], [xm + .19, y + .01, zm + 1.55], [xm - .19, y + .01, zm + 1.55]], fn({ pts: false, al: .7, hatch: 6 })));
    P.push(plate([[xm - 1.02, y, zm - 1.68], [xm + 1.02, y, zm - 1.68], [xm + 1.02, y, zm + 1.68], [xm - 1.02, y, zm + 1.68]], FY, { ds: 2.6 }));
  }
  // strikedown crane, stowed flush in three cells of the port-outboard forward module
  const x0 = -3.15 - .72, z0 = zc + 3.5 * CG_VP;
  P.push(crate([x0 - .32, y, z0 - 2 * CG_VP - .32], [x0 + .32, y + .22, z0 + .32]));
  P.push(line([[x0, y + .23, z0 - 2 * CG_VP], [x0, y + .23, z0]], fn({ w: .5, pts: false })));
  return P;
}
const CG_VLS_ST = memo(() => [cgVlsStatic(0), cgVlsStatic(1)]);
function openMap(st) { const m = new Map(), v = st.vlsOpen; if (v) for (const e of v) { if (Array.isArray(e)) m.set(e[0], sat(e[1])); else m.set(e, 1); } return m; }
function cgVlsHatches(blk, st) {
  const P = [], om = openMap(st), h = .3;
  CG_CELLS.forEach((c, i) => {
    if (c.blk !== blk) return;
    const f = om.get(i) || 0, y = c.y + .02;
    const q = [[c.x - h, y, c.z - h], [c.x + h, y, c.z - h], [c.x + h, y, c.z + h], [c.x - h, y, c.z + h]];
    if (f <= 0) { P.push(panel(q, fn({ pts: false })), plate(q.map(p => [p[0], p[1] + .02, p[2]]), FY, fn())); return; }
    const T = about(R.z(-c.hs * f * 105 * DEG), [c.x + c.hs * h, y, c.z]);
    P.push(panel(q.map(p => X.ap(T, p)), fn()));
    P.push(panel([[c.x - .25, y - .4, c.z - .25], [c.x + .25, y - .4, c.z - .25], [c.x + .25, y - .4, c.z + .25], [c.x - .25, y - .4, c.z + .25]], fn({ al: .55 })));
  });
  return P;
}
/* Mk 141 Harpoon quad launchers on the fantail, inclined 35°, firing outboard */
function cgHarpoon() {
  const P = [], el = 35 * DEG;
  for (const s of [-1, 1]) {
    const zc = -79.5, base = [s * 3.2, cgD(zc), zc], d = [s * Math.cos(el), Math.sin(el), 0];
    P.push(crate(V.add(base, [-1.3, 0, -1.4]), V.add(base, [1.3, .45, 1.4])));
    P.push(hex([[s * 1.8, cgD(zc) + .45, zc - 1.2], [s * 4.3, cgD(zc) + .45, zc - 1.2], [s * 4.3, cgD(zc) + .45, zc + 1.2], [s * 1.8, cgD(zc) + .45, zc + 1.2],
                [s * 1.8, cgD(zc) + 1.7, zc - 1.2], [s * 2.2, cgD(zc) + 1.0, zc - 1.2], [s * 2.2, cgD(zc) + 1.0, zc + 1.2], [s * 1.8, cgD(zc) + 1.7, zc + 1.2]], { pts: false }));
    for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
      const a = [s * (1.7 + r * .15), cgD(zc) + 1.1 + r * .78, zc - .42 + k * .84], b = V.mad(a, d, 4.3);
      P.push(lathe(a, d, [[0, .34], [4.3, .34]], { n: 12, gen: 2, rings: [0, 1], caps: true }));
      for (const t of [.9, 2.2, 3.5]) P.push(ringW(V.mad(a, d, t), d, .36, fn({ n: 10 })));
      P.push(circle(b, d, .2, 8, fn({ w: .5, pts: false })));
    }
  }
  return P;
}
/* Mk 32 SVTT triple tubes, 7 m RHIBs on davits, liferaft racks */
function cgArms() {
  const P = [];
  for (const s of [-1, 1]) {
    const z = 1.0, y = cgD(z);
    P.push(cyl([s * 6.6, y, z], [s * 6.6, y + .8, z], .35, { n: 10, gen: 0 }));
    for (let k = 0; k < 3; k++) { const a = [s * 6.6, y + .95 + k * .36, z - 2.2], d = V.norm([s * .2, 0, 1]); P.push(lathe(a, d, [[0, .17], [3.1, .17]], { n: 10, gen: 0, rings: [0, 1], caps: true })); }
  }
  return P;
}
function cgBoats() {
  const P = [];
  for (const s of [-1, 1]) {
    const zc = 5.5, y = 9.6, x = s * 6.95;
    const K = SA.skin([-3.3, -2.4, -.8, .8, 2.2, 3.1, 3.5].map((z, i, a) => SA.arc(zc + z, i === a.length - 1 ? .25 : (i === 0 ? 1.05 : 1.2), y, y + .95, 2.4, 9, x)), true);
    P.push(...SA.loft(K, { lines: [0, 4, 8], rings: [1, 4], al: .75, ral: .4 }));
    P.push(crate([x - .5, y + .3, zc - 1.1], [x + .5, y + 1.25, zc + .3], fn()));
    for (const dz of [-2.6, 2.6]) P.push(line([[s * 5.6, 9.3, zc + dz], [s * 5.8, 12.1, zc + dz], [x, 12.1, zc + dz], [x, y + 1.0, zc + dz]], { w: .6 }));
    for (const dz of [-6.5, -5.5]) P.push(cyl([s * 7.4, 9.5, zc + dz], [s * 7.4, 10.3, zc + dz], .32, fn({ n: 10, gen: 2, caps: true })));
  }
  return P;
}
function cgHangarStatic() {
  const P = [], H = CG_HANGAR, z = H.z - .02;
  for (const x of H.doors) P.push(line([[x - H.w / 2, H.y0, z], [x - H.w / 2, H.y0 + H.h, z], [x + H.w / 2, H.y0 + H.h, z], [x + H.w / 2, H.y0, z]], { w: .9, pts: false }));
  return P;
}
function cgHangarDoors(st) {
  const P = [], H = CG_HANGAR, z = H.z - .06, op = sat(st.hangar || 0), yb = mix(H.y0, H.y0 + H.h - .3, op);
  for (const x of H.doors) {
    P.push(plate([[x - H.w / 2 + .05, yb, z], [x + H.w / 2 - .05, yb, z], [x + H.w / 2 - .05, H.y0 + H.h - .05, z], [x - H.w / 2 + .05, H.y0 + H.h - .05, z]], [0, 0, -1]));
    for (let k = 1; k < 5; k++) { const y = mix(yb, H.y0 + H.h, k / 5); P.push(line([[x - H.w / 2 + .1, y, z - .01], [x + H.w / 2 - .1, y, z - .01]], fn({ w: .3, pts: false }))); }
  }
  return P;
}
function cgDeck() {
  const P = [], yz = z => cgD(z) + .03, c = [0, 0, CG_HELO_Z], r = 3.0, circ = [];
  for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; circ.push([c[0] + Math.cos(a) * r, yz(c[2] + Math.sin(a) * r), c[2] + Math.sin(a) * r]); }
  P.push(line(circ, { w: .7, pts: false }));
  P.push(line([[0, yz(-37), -37], [0, yz(-57), -57]], { w: .5, pts: false }));
  P.push(line([[-6.5, yz(-40), -40], [6.5, yz(-40), -40]], fn({ w: .4, pts: false })));
  for (const s of [-1, 1]) P.push(line([[s * 7.6, yz(-36), -36], [s * 7.9, yz(-57), -57]], fn({ w: .35, pts: false })));
  // RAST track (the recovery traverser) down the centreline into the hangar
  P.push(line([[.3, yz(-36), -36], [.3, yz(-50), -50]], fn({ w: .3, pts: false })), line([[-.3, yz(-36), -36], [-.3, yz(-50), -50]], fn({ w: .3, pts: false })));
  return P;
}
function cgRails() {
  const pts = []; for (let z = -84; z <= 80; z += 4) pts.push(z);
  const P = [];
  for (const s of [-1, 1]) P.push(...lifeline(pts.map(z => [s * (cgB(z) - .15), 0, z]), p => cgD(p[2])));
  return P;
}
const CG_GEO = memo(() => {
  const H = cgHouses(), M = cgMasts();
  return { hull: cgHull(), H, spy: cgSpy(), stacks: cgStacks(), mastF: M.F, mastM: M.M, sps: cgSps49(), harpoon: cgHarpoon(), arms: cgArms(),
    boats: cgBoats(), hs: cgHangarStatic(), deck: cgDeck(), rails: cgRails() };
});
function cg() {
  const g = CG_GEO(), dc = DD_CIWS();
  return {
    name: 'cg', L: 172.8, B: 16.8, A: CG,
    parts: [
      { name: 'hull', label: 'Hull · CG-47 Ticonderoga class', prims: g.hull },
      { name: 'houseF', label: 'Forward deckhouse · bridge', prims: g.H.F },
      { name: 'houseM', label: 'Midships deckhouse', prims: g.H.M },
      { name: 'houseA', label: 'Aft deckhouse', prims: g.H.A },
      { name: 'spy', label: 'AN/SPY-1B arrays ×4', prims: g.spy },
      { name: 'stacks', label: 'Funnels ×2 · LM2500 uptakes', prims: g.stacks },
      { name: 'mastF', label: 'Foremast · URN-25 TACAN · AN/SPS-55', prims: g.mastF },
      { name: 'mastM', label: 'Main mast', prims: g.mastM },
      { name: 'sps', label: 'AN/SPS-49(V) air search', prims: g.sps, xf: st => about(R.y(st.radar || 0), CG_P49) },
      { name: 'gunF', label: 'Mk 45 5"/54 · forward', prims: [], dyn: cgGun(0), xf: st => cgGunXf(0, st) },
      { name: 'gunA', label: 'Mk 45 5"/54 · aft', prims: [], dyn: cgGun(1), xf: st => cgGunXf(1, st) },
      { name: 'vlsF', label: 'Mk 41 VLS · 61 cells · forward', prims: [], dyn: st => CG_VLS_ST()[0].concat(cgVlsHatches(0, st)) },
      { name: 'vlsA', label: 'Mk 41 VLS · 61 cells · aft', prims: [], dyn: st => CG_VLS_ST()[1].concat(cgVlsHatches(1, st)) },
      { name: 'ciwsF', label: 'Phalanx CIWS 1B · starboard', prims: [], dyn: dc[0], xf: st => cgCiwsXf(0, st) },
      { name: 'ciwsA', label: 'Phalanx CIWS 1B · port', prims: [], dyn: dc[1], xf: st => cgCiwsXf(1, st) },
      { name: 'harpoon', label: 'Mk 141 Harpoon launchers ×2 · 8 canisters', prims: g.harpoon },
      { name: 'arms', label: 'Mk 32 SVTT ×2', prims: g.arms },
      { name: 'boats', label: '7 m RHIB ×2 · davits · liferafts', prims: g.boats },
      { name: 'hangar', label: 'Twin hangar doors', prims: [], dyn: st => g.hs.concat(cgHangarDoors(st)) },
      { name: 'deck', label: 'Flight deck · RAST', prims: g.deck },
      { name: 'rails', label: 'Lifelines', prims: g.rails },
    ],
  };
}
/* anchors (ship frame) */
export const CG = {
  L: 172.8, B: 16.8, ZB: CZB, ZS: CZS, deckY: cgD, CELLS: CG_CELLS, VF: CG_VF, VA: CG_VA,
  cell: i => { const c = CG_CELLS[i]; return [c.x, c.y, c.z]; },
  gun: (st, i) => X.ap(cgGunXf(i || 0, st || {}), X.ap(cgGunElev(i || 0, st || {}), CG_GUN_MZ)),
  ciws: (st, i) => X.ap(cgCiwsXf(i, st || {}), X.ap(about(R.x(-((st && st.ciwsPitch && st.ciwsPitch[i]) || .35)), CIWS_TR), CIWS_MZ)),
  CIWS: CG_CIWS, GUNS: CG_GUN, P49: CG_P49, SPY: CG_SPY.map(f => f.c), heloSpot: [0, cgD(CG_HELO_Z) + .03, CG_HELO_Z],
  hangar: [0, CG_HANGAR.y0 + 2.6, CG_HANGAR.z], stacks: [[0, 21.5, 10.4], [0, 20.5, -1.6]],
};

/* ======================================================================================================
   LCS-2 INDEPENDENCE CLASS · 127.4 m overall, 31.6 m beam, 4.5 m draught, 44 kn. An aluminium trimaran: a
   slender, angular main hull with a fine wave-piercing bow; a wide cross-structure over the wet deck carries
   the 1 030 m² flight deck aft (two H-60 spots) and joins the two short outriggers (side hulls) aft. The faceted
   superstructure: the bridge block with the integrated mast (Sea Giraffe AMB turning on top), the hangar for two
   H-60s. Mk 110 57 mm on the foredeck, SeaRAM on the hangar roof, four waterjets in the main hull's transom.
   ====================================================================================================== */
const LZB = 63.7, LZS = -63.7, LZST = 57.6, LX1 = 26, LWD = 3.4, LFD = 9.2, LOX = 13.2;
const lsDeckY = z => LFD + .8 * sat((z - 24) / (LZB - 24));
const lsWl = z => z >= LZST ? 0 : z > 18 ? 4.3 * Math.max(0, 1 - Math.pow((z - 18) / (LZST - 18), 1.6)) : z < -54 ? 4.3 * (1 - .26 * (-54 - z) / 9.7) : 4.3;
const lsStem = z => z <= LZST ? 0 : lsDeckY(LZB) * Math.pow(Math.min(1, (z - LZST) / (LZB - LZST)), 1 / 1.25);
const lsTop = z => z >= LZB ? 0 : 7.2 * Math.max(0, 1 - Math.pow(Math.max(0, z - 24) / (LZB - 24), 1.8));
const lsXw = z => z <= 2 ? 15.8 : z >= LX1 ? lsTop(LX1) : mix(15.8, lsTop(LX1), (z - 2) / (LX1 - 2));
/* the houses on the cross-structure: half width at z (0 where none) */
const lsHouse = z => z < -26 || z > 24 ? 0 : z < 0 ? 9.0 : z < 14 ? 10.5 : mix(10.5, 7.4, (z - 14) / 10);
const lsOw = z => z > -6 ? 0 : z > -20 ? 1.05 * Math.max(0, 1 - Math.pow((z + 20) / 14, 1.5)) : 1.05;
const LS_Z = [LZS, -61, -56, -48, -38, -26, -20, -14, -6, 0, 2, 8, 14, 20, 24, LX1, 30, 36, 42, 48, 53, LZST - .8, LZST, 59.4, 61, 62.5, LZB];
const LS_GUN = [0, lsDeckY(40), 40], LS_GUN_TR = [0, 1.15, .7], LS_GUN_MZ = [0, 1.15, 4.8];
const LS_RAM = [0, 15.6, -22.8], LS_RAD = [0, 30.2, 9.75];
const LS_SPOTS = [[0, LFD, -36.5], [0, LFD, -53]];

function lsMainHull() {
  const P = [], Z = LS_Z;
  const sec = z => {
    const w = lsWl(z), y0 = lsStem(z), fwd = z >= LX1 - 1e-6;
    const c = [w + (fwd ? (lsTop(z) - w) * .3 : .5), Math.max(y0 + .4, LWD)];
    return { w: [w, y0], c, d: fwd ? [lsTop(z), lsDeckY(z)] : null };
  };
  const S = Z.map(sec), pt = (i, k, s) => [s * S[i][k][0], S[i][k][1], Z[i]];
  for (const s of [-1, 1]) {
    for (let i = 0; i < Z.length - 1; i++) {
      P.push(plate([pt(i, 'w', s), pt(i + 1, 'w', s), pt(i + 1, 'c', s), pt(i, 'c', s)], [s, 0, 0]));
      if (S[i].d && S[i + 1].d) P.push(plate([pt(i, 'c', s), pt(i + 1, 'c', s), pt(i + 1, 'd', s), pt(i, 'd', s)], [s, .3, 0]));
    }
    const wl = Z.filter(z => z <= LZST).map(z => [s * lsWl(z), 0, z]);
    P.push(...fpoly(wl, (i, a, b) => sideN(a, b, s, 0), { al: .8 }));
    P.push(...fpoly(Z.map((z, i) => pt(i, 'c', s)), (i, a, b) => sideN(a, b, s, 0), { al: .75 }));
    const dk = []; Z.forEach((z, i) => { if (S[i].d) dk.push(pt(i, 'd', s)); });
    P.push(...fpoly(dk, (i, a, b) => sideN(a, b, s, 1), { al: 1 }));
  }
  for (let i = 0; i < Z.length - 1; i++) if (S[i].d && S[i + 1].d) {
    const a = S[i].d, b = S[i + 1].d;
    P.push(plate([[-a[0], a[1], Z[i]], [a[0], a[1], Z[i]], [b[0], b[1], Z[i + 1]], [-b[0], b[1], Z[i + 1]]], FY));
  }
  const stem = []; for (let k = 0; k <= 8; k++) { const z = LZST + (LZB - LZST) * k / 8; stem.push([0, lsStem(z), z]); }
  P.push(line(stem, { w: 1, pts: false }));
  // transom of the main hull (below the wet deck)
  const t = S[0];
  P.push(plate([[-t.w[0], 0, LZS], [t.w[0], 0, LZS], [t.c[0], t.c[1], LZS], [-t.c[0], t.c[1], LZS]], [0, 0, -1]));
  return P;
}
function lsCross() {
  const P = [], Z = LS_Z.filter(z => z <= LX1);
  const q = z => ({ xi: lsWl(z) + .5, xo: lsXw(z) - 1.0, xw: lsXw(z), h: lsHouse(z) });
  const S = Z.map(q);
  for (let i = 0; i < Z.length - 1; i++) {
    const a = S[i], b = S[i + 1], z0 = Z[i], z1 = Z[i + 1];
    for (const s of [-1, 1]) {
      P.push(plate([[s * a.xi, LWD, z0], [s * a.xo, LWD, z0], [s * b.xo, LWD, z1], [s * b.xi, LWD, z1]], [0, -1, 0]));          // wet deck
      P.push(plate([[s * a.xo, LWD, z0], [s * b.xo, LWD, z1], [s * b.xw, LFD, z1], [s * a.xw, LFD, z0]], [s, .15, (a.xw - b.xw) * s > 0 ? .5 : 0]));  // side
      const hi0 = a.h, hi1 = b.h;
      if (Math.min(a.xw, b.xw) > Math.max(hi0, hi1) + .05) P.push(plate([[s * hi0, LFD, z0], [s * a.xw, LFD, z0], [s * b.xw, LFD, z1], [s * hi1, LFD, z1]], FY));
    }
    if (!a.h && !b.h) P.push(plate([[-Math.min(a.xw, 9.0), LFD, z0], [Math.min(a.xw, 9.0), LFD, z0], [Math.min(b.xw, 9.0), LFD, z1], [-Math.min(b.xw, 9.0), LFD, z1]], FY));
  }
  for (const s of [-1, 1]) {
    P.push(...fpoly(Z.map(z => [s * lsXw(z), LFD, z]), (i, a, b) => sideN(a, b, s, 1), { al: 1 }));
    P.push(...fpoly(Z.map(z => [s * (lsXw(z) - 1), LWD, z]), (i, a, b) => sideN(a, b, s, -.5), { al: .7 }));
    // transom of the cross-structure, either side of the main hull
    const t = S[0];
    P.push(plate([[s * t.xi, LWD, LZS], [s * t.xo, LWD, LZS], [s * t.xw, LFD, LZS], [s * t.xi, LFD, LZS]], [0, 0, -1]));
  }
  P.push(plate([[-S[0].xi, LWD, LZS], [S[0].xi, LWD, LZS], [S[0].xi, LFD, LZS], [-S[0].xi, LFD, LZS]], [0, 0, -1]));
  P.push(fl([-15.8, LFD, LZS], [15.8, LFD, LZS], V.norm([0, 1, -1]), { al: 1 }));
  // the stern: mission-bay stern door and the ramp outline (fine)
  P.push(rect([0, 5.6, LZS - .03], FX, FY, 3.6, 1.9, fn({ al: .6 })));
  return P;
}
function lsOutriggers() {
  const P = [], Z = [LZS, -60, -52, -40, -28, -20, -15, -11, -8, -6];
  for (const sx of [-1, 1]) {
    const xc = sx * LOX, w0 = z => lsOw(z), w1 = z => lsOw(z) + (z > -6.5 ? 0 : .25);
    for (const s of [-1, 1]) {
      for (let i = 0; i < Z.length - 1; i++) {
        const a = Z[i], b = Z[i + 1];
        P.push(plate([[xc + s * w0(a), 0, a], [xc + s * w0(b), 0, b], [xc + s * w1(b), LWD, b], [xc + s * w1(a), LWD, a]], [s, 0, 0]));
      }
      P.push(...fpoly(Z.map(z => [xc + s * w0(z), 0, z]), (i, a, b) => sideN(a, b, s, 0), { al: .75 }));
    }
    P.push(plate([[xc - w0(LZS), 0, LZS], [xc + w0(LZS), 0, LZS], [xc + w1(LZS), LWD, LZS], [xc - w1(LZS), LWD, LZS]], [0, 0, -1]));
    P.push(line([[xc, 0, -6], [xc, LWD, -5.2]], { w: .9, pts: false }));
  }
  return P;
}
function lsSuper() {
  const B = [], HG = [];
  // bridge block: rear part and the faceted front with its sloped face
  B.push(prism(-10.5, 10.5, LFD, 19.6, 0, 14, -7.2, 7.2, 2.5, 14, { skip: [4] }));
  B.push(hex([[-10.5, LFD, 14], [10.5, LFD, 14], [7.4, LFD, 24], [-7.4, LFD, 24], [-7.2, 19.6, 14], [7.2, 19.6, 14], [6.2, 19.6, 16.5], [-6.2, 19.6, 16.5]], { skip: [2] }));
  const fb = [[-7.4, LFD, 24], [7.4, LFD, 24]], ft = [[-6.2, 19.6, 16.5], [6.2, 19.6, 16.5]];
  const on = (u, v) => V.lerp(V.lerp(fb[0], fb[1], u), V.lerp(ft[0], ft[1], u), v), nF = V.norm([0, .6, .8]);
  for (let k = 0; k < 7; k++) {
    const u0 = .08 + k * .12, u1 = u0 + .1;
    B.push(panel([on(u0, .78), on(u1, .78), on(u1, .9), on(u0, .9)].map(p => V.mad(p, nF, .03)), fn({ pts: false, al: .6 })));
  }
  for (const v of [.33, .6]) B.push(line([on(0, v), on(1, v)].map(p => V.mad(p, nF, .02)), fn({ w: .3, pts: false })));
  B.push(lathe([4.2, 19.6, 13.2], FY, [[0, .3], [.5, .3], [.55, .35], [.95, .35]], fn({ n: 12, gen: 2 })));        // EO/IR director
  B.push(lathe([4.2, 20.55, 13.2], FY, [[0, .35], [.35, .2], [.4, 0]], fn({ n: 12, gen: 2 })));
  // the integrated mast: a faceted pyramid, the radar platform, the pole
  B.push(prism(-3.8, 3.8, 19.6, 29.5, 5, 14.5, -1.3, 1.3, 8.5, 11, { skip: [0] }));
  B.push(box([-1.8, 29.5, 8.0], [1.8, 29.8, 11.5]));
  B.push(line([[0, 32.4, 9.75], [0, 36.0, 9.75]], { w: .7 }));
  for (const y of [34.2, 35.4]) B.push(line([[-1.1, y, 9.75], [1.1, y, 9.75]], fn({ w: .45, pts: false })));
  // hangar: two H-60, the big aft door
  HG.push(prism(-9.0, 9.0, LFD, 15.6, -26, 0, -8.7, 8.7, -25.7, 0, { skip: [4] }));
  HG.push(rect([0, 12.0, -26.05], FX, FY, 6.2, 2.6, { edge: .9, hatch: 6 }));
  for (const s of [-1, 1]) HG.push(rect([s * 9.02, 11.2, -8], [0, 0, 1], FY, .4, 1.0, fn({ al: .5 })));
  return { B, HG };
}
/* Sea Giraffe AMB: a single-face array on a turntable (turns about LS_RAD) */
function lsRadar() {
  const P = [], c = V.add(LS_RAD, [0, 1.0, .25]), tilt = 15 * DEG;
  const u = FX, v = [0, Math.cos(tilt), -Math.sin(tilt)], n = V.norm(V.cross(u, v));
  P.push(crate(V.add(c, [-1.2, -.6, -.25]), V.add(c, [1.2, .6, .05])));
  P.push(rect(V.mad(c, n, .07), u, v, 1.1, .5, { hatch: 8, edge: .8 }));
  P.push(cyl(LS_RAD, V.add(LS_RAD, [0, .45, 0]), .35, { n: 12, gen: 0, caps: true }));
  return P;
}
/* Mk 110 57 mm in its own frame (origin on the deck, +Z along the barrel at yaw 0): a faceted low-signature
   shield, the barrel with its muzzle brake */
const LS_GUNHOUSE = [
  lathe([0, 0, 0], FY, [[0, 1.45], [.15, 1.4]], { n: 22, gen: 0 }),
  hex([[-1.35, .15, -1.8], [1.35, .15, -1.8], [1.1, .15, 1.6], [-1.1, .15, 1.6], [-.95, 1.9, -1.5], [.95, 1.9, -1.5], [.7, 1.9, .5], [-.7, 1.9, .5]]),
  line([[-.9, 1.9, -.4], [.9, 1.9, -.4]], fn({ w: .4, pts: false })),
];
function mk110Barrel() {
  return [
    lathe([0, LS_GUN_TR[1], LS_GUN_TR[2] - .4], FZ, [[0, .15], [.7, .15], [.9, .085], [4.8, .065], [4.9, .085], [5.1, .085]], { n: 10, gen: 0, rings: [0, 2, 4, 5], caps: true }),
    lathe([0, LS_GUN_TR[1], LS_GUN_TR[2] + .1], FZ, [[0, .3], [.4, .16]], fn({ n: 12, gen: 2 })),
  ];
}
const lsGunXf = st => X.make(R.y(st.gunYaw || 0), LS_GUN);
const lsGunElev = st => about(R.x(-(st.gunPitch || 0)), LS_GUN_TR);
/* SeaRAM: the Phalanx mount carrying an 11-round RAM launcher under its sensor dome; own frame, +Z = launcher */
function seaRam() {
  const P = [];
  P.push(lathe([0, 0, 0], FY, [[0, .82], [.12, .82], [.18, .74], [.52, .72]], { n: 22, gen: 6 }));
  for (const s of [-1, 1]) P.push(box([s * .6, .52, -.38], [s * .8, 1.8, .38]));
  P.push(crate([-.56, .95, -.95], [.56, 2.05, 1.05]));
  const rows = [[1.8, 4], [1.52, 4], [1.24, 3]];
  for (const [y, n] of rows) for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * .26; P.push(circle([x, y, 1.06], FZ, .09, 8, { w: .8, pts: false })); }
  P.push(lathe([0, 2.05, -.28], FY, [[0, .52], [.5, .5], [.95, .3], [1.12, .08], [1.15, 0]], { n: 20, gen: 6, rings: [0, 2, 3] }));
  P.push(crate([-.95, 1.2, -.3], [-.62, 1.6, .25], fn()));
  return P;
}
/* four waterjets in the main hull's transom (the outer pair steer: buckets), at the waterline */
function lsJets() {
  const P = [];
  for (const x of [-3.0, -1.1, 1.1, 3.0]) {
    P.push(lathe([x, .55, LZS + .02], [0, 0, -1], [[0, .55], [.35, .5], [.6, .42]], { n: 16, gen: 4, rings: [0, 2], caps: true }));
    P.push(ringW([x, .55, LZS - .6], [0, 0, -1], .36, fn({ n: 12 })));
    if (Math.abs(x) > 2) P.push(hex([[x - .6, -.05, LZS - .55], [x + .6, -.05, LZS - .55], [x + .5, -.05, LZS - .95], [x - .5, -.05, LZS - .95],
      [x - .6, 1.2, LZS - .55], [x + .6, 1.2, LZS - .55], [x + .5, 1.2, LZS - .95], [x - .5, 1.2, LZS - .95]], { skip: [2] }));
  }
  return P;
}
function lsDeck() {
  const P = [], y = LFD + .03;
  for (const [x, , z] of LS_SPOTS) {
    const circ = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; circ.push([x + Math.cos(a) * 3.2, y, z + Math.sin(a) * 3.2]); }
    P.push(line(circ, { w: .7, pts: false }));
  }
  P.push(line([[0, y, -27], [0, y, -62]], { w: .5, pts: false }));
  for (const s of [-1, 1]) P.push(line([[s * 14.6, y, -27], [s * 14.6, y, -62.5]], fn({ w: .35, pts: false })));
  P.push(line([[-14.6, y, -44.7], [14.6, y, -44.7]], fn({ w: .3, pts: false })));
  return P;
}
function lsRails() {
  const P = [], pts = [];
  for (let z = 26; z <= 60; z += 3) pts.push(z);
  for (const s of [-1, 1]) {
    P.push(...lifeline(pts.map(z => [s * (lsTop(z) - .15), 0, z]), p => lsDeckY(p[2])));
    const zs = []; for (let z = -63; z <= 20; z += 4) zs.push(z);
    P.push(...lifeline(zs.map(z => [s * (lsXw(z) - .15), 0, z]), () => LFD));
  }
  return P;
}
const LS_GEO = memo(() => { const S = lsSuper(); return { hull: lsMainHull(), cross: lsCross(), out: lsOutriggers(), B: S.B, HG: S.HG, rad: lsRadar(), jets: lsJets(), deck: lsDeck(), rails: lsRails(), ram: seaRam() }; });
function lcs() {
  const g = LS_GEO();
  return {
    name: 'lcs', L: 127.4, B: 31.6, A: LCS,
    parts: [
      { name: 'hull', label: 'Main hull · LCS-2 Independence class', prims: g.hull },
      { name: 'cross', label: 'Cross-structure · flight deck 1 030 m²', prims: g.cross },
      { name: 'outriggers', label: 'Outriggers ×2 · side hulls', prims: g.out },
      { name: 'bridge', label: 'Superstructure · bridge · integrated mast', prims: g.B },
      { name: 'hangar', label: 'Hangar · 2 × H-60', prims: g.HG },
      { name: 'radar', label: 'Sea Giraffe AMB · 3-D search', prims: g.rad, xf: st => about(R.y(st.radar || 0), LS_RAD) },
      { name: 'gun', label: 'Mk 110 57 mm', prims: [], dyn: st => LS_GUNHOUSE.concat(tps(lsGunElev(st), mk110Barrel())), xf: lsGunXf },
      { name: 'searam', label: 'SeaRAM · 11 × RIM-116', prims: g.ram, xf: st => X.make(R.y(st.ramYaw === undefined ? PI : st.ramYaw), LS_RAM) },
      { name: 'jets', label: 'Waterjets ×4 · Wärtsilä', prims: g.jets },
      { name: 'deck', label: 'Flight deck · 2 spots', prims: g.deck },
      { name: 'rails', label: 'Lifelines', prims: g.rails },
    ],
  };
}
export const LCS = {
  L: 127.4, B: 31.6, ZB: LZB, ZS: LZS, deckY: LFD, SPOTS: LS_SPOTS, RAM: LS_RAM, RAD: LS_RAD,
  gun: st => X.ap(lsGunXf(st || {}), X.ap(lsGunElev(st || {}), LS_GUN_MZ)),
  heloSpot: LS_SPOTS[0], hangar: [0, LFD + 3, -24], stern: [0, LFD, LZS], bow: [0, lsDeckY(LZB), LZB],
};

/* ======================================================================================================
   S-400 · 5P85SM2-01 LAUNCHER. A BAZ-64022 6×6 tractor and the launcher semi-trailer: the equipment cabin on the
   gooseneck, four 48N6 transport-launch containers on an erector hinged at the trailer's rear, raised to the
   vertical to fire (cold launch), four outrigger jacks. Vehicle-local: origin on the ground at the combination's
   centre, +Z forward (the tractor). The combination drives straight (the articulation is not modelled).
   ====================================================================================================== */
const SL = {
  TR_AX: [6.9, 3.0, 1.55], TL_AX: [-5.5, -6.9], WR: .66,
  PIV: [0, 1.95, -8.05], LEN: 7.55, CR: .36, AXY: .6,           // containers: length, radius, axis above the pivot
  COLS: [-1.14, -.38, .38, 1.14], ORDER: [0, 3, 1, 2],           // firing order: outboard first
  ELEV: PI / 2, JACKS: [[1.55, -7.75], [1.55, -.9]], JT: .62,
  ZF: 8.15, ZR: -8.3,
};
const slPackXf = st => X.pivotX(SL.PIV, -(st.elev || 0));
/* container k (0..3 in the firing order) mouth centre, model frame, at elev */
const slMouth = (k, elev) => X.ap(slPackXf({ elev }), [SL.COLS[SL.ORDER[k]], SL.PIV[1] + SL.AXY, SL.PIV[2] + SL.LEN + .05]);
function bazCab() {
  // BAZ-64022 forward-control cab: flat front, split windscreen, side doors; engine cover behind
  const P = [], zb = 5.55, zf = 8.0, hw = 1.27, y0 = 1.3, yw = 2.35, yt = 3.3;
  P.push(prism(-hw, hw, y0, yw, zb, zf, -hw, hw, zb, zf - .05));
  P.push(prism(-hw, hw, yw, yt, zb, zf - .05, -hw + .08, hw - .08, zb + .05, zf - .45));
  P.push(panel([[-1.1, yw + .1, zf - .07], [-.05, yw + .1, zf - .07], [-.05, yt - .12, zf - .41], [-1.1, yt - .12, zf - .41]], { edge: .9, pts: false }));
  P.push(panel([[.05, yw + .1, zf - .07], [1.1, yw + .1, zf - .07], [1.1, yt - .12, zf - .41], [.05, yt - .12, zf - .41]], { edge: .9, pts: false }));
  for (const s of [-1, 1]) {
    P.push(panel([[s * (hw + .01), yw + .1, zf - .6], [s * (hw + .01), yw + .1, zf - 1.5], [s * (hw + .01), yt - .15, zf - 1.5], [s * (hw + .01), yt - .15, zf - .75]], fn({ edge: .7, pts: false })));
    P.push(panel([[s * (hw + .01), y0 + .15, zf - .5], [s * (hw + .01), y0 + .15, zf - 1.6], [s * (hw + .01), yt - .1, zf - 1.6], [s * (hw + .01), yt - .1, zf - .5]], fn({ edge: .5, pts: false })));
    P.push(line([[s * (hw - .05), yt - .2, zf - .5], [s * 1.55, yt - .1, zf - .3], [s * 1.55, yw + .1, zf - .3]], fn({ w: .6, pts: false })));   // mirror arm
    P.push(box([s * 1.5, yw + .15, zf - .36], [s * 1.62, yw + .6, zf - .3], fn()));
    P.push(circle([s * .95, 1.05, zf + .16], FZ, .1, 12, { w: .8, pts: false }));
  }
  P.push(panel([[-.85, 1.4, zf + .01], [.85, 1.4, zf + .01], [.85, 2.1, zf + .01], [-.85, 2.1, zf + .01]], { hatch: 6, edge: .9, pts: false }));
  P.push(box([-1.3, .8, zf - .1], [1.3, 1.2, zf + .15]));
  P.push(crate([-1.1, 1.25, 4.35], [1.1, 2.55, zb]));                       // engine cover behind the cab
  P.push(cyl([.9, 2.55, 4.6], [.9, 3.5, 4.6], .09, fn({ n: 8, gen: 0 })));   // exhaust
  return P;
}
function slChassis() {
  const P = [];
  // tractor frame, fifth wheel; semi-trailer: gooseneck, frame, walkways, fenders, bumper
  for (const s of [-1, 1]) P.push(box([s * .42, .88, 1.0], [s * .72, 1.22, SL.ZF - .2]));
  P.push(lathe([0, 1.22, 1.95], FY, [[0, .75], [.2, .75]], { n: 18, gen: 0, caps: true }));
  P.push(crate([-1.25, 1.45, .1], [1.25, 1.9, 3.7]));
  for (const s of [-1, 1]) P.push(box([s * .5, 1.35, SL.ZR], [s * .85, 1.75, .2]));
  P.push(box([-1.25, 1.6, SL.ZR], [1.25, 1.75, -1.0], { ribs: { z: 6 } }));
  for (let z = SL.ZR + .6; z < -1.2; z += 1.4) P.push(box([-.5, 1.4, z], [.5, 1.6, z + .14], fn()));
  for (const s of [-1, 1]) {
    for (const z of SL.TL_AX) P.push(box([s * 1.0, 1.4, z - .8], [s * 1.55, 1.46, z + .8]));
    P.push(box([s * .4, .8, SL.ZR], [s * 1.3, 1.05, SL.ZR + .18]));
    P.push(box([s * 1.25, 1.1, -3.2], [s * 1.5, 1.6, -1.6], fn()));                       // tool boxes
    P.push(lathe([s * .95, .9, 4.1], FZ, [[0, .28], [1.1, .28]], fn({ n: 14, gen: 2, caps: true })));   // tractor fuel tanks
  }
  for (const z of [...SL.TR_AX, ...SL.TL_AX]) {
    P.push(cyl([-.8, SL.WR, z], [.8, SL.WR, z], .075, fn({ n: 8, gen: 0 })));
    P.push(lathe([0, SL.WR, z - .26], FZ, [[0, .1], [.1, .22], [.42, .22], [.52, .1]], fn({ n: 12, gen: 0, rings: [1, 2] })));
  }
  // erector cradle hinge brackets and pin at the rear
  for (const s of [-1, 1]) P.push(prism(s * 1.15, s * 1.35, 1.6, 2.0, SL.PIV[2] - .3, SL.PIV[2] + .5, s * 1.15, s * 1.35, SL.PIV[2] - .12, SL.PIV[2] + .18));
  P.push(cyl([-1.4, SL.PIV[1], SL.PIV[2]], [1.4, SL.PIV[1], SL.PIV[2]], .07, { n: 10, gen: 0, caps: true }));
  P.push(crate([-.35, 1.6, -1.7], [.35, 1.85, -1.1]));                                       // ram trunnion
  return P;
}
function slCabin() {
  // equipment cabin on the gooseneck: launch equipment, the power unit
  const P = [crate([-1.25, 1.9, .3], [1.25, 3.55, 3.55])];
  for (const s of [-1, 1]) {
    P.push(rect([s * 1.26, 2.7, 1.9], FZ, FY, .45, .7, { edge: .7 }));
    P.push(rect([s * 1.26, 2.8, .9], FZ, FY, .35, .35, fn({ hatch: 4, edge: .5 })));
  }
  P.push(crate([-.7, 3.55, 1.1], [.7, 3.85, 2.3], fn()));                                    // air conditioner
  P.push(line([[.95, 3.55, 3.2], [.93, 5.2, 3.1]], fn({ w: .5 })));
  return P;
}
/* the erector: cradle beams, cross members, side trusses and the four containers (pack frame, before the raise) */
function slPack() {
  const P = [], y0 = SL.PIV[1], z0 = SL.PIV[2] + .05, z1 = z0 + SL.LEN, yA = y0 + SL.AXY;
  P.push(box([-1.55, y0 - .12, z0], [1.55, y0 + .1, z1 - .2]));
  for (const s of [-1, 1]) P.push(box([s * 1.52 - .07, y0 + .1, z0 + .2], [s * 1.52 + .07, yA + .45, z1 - .4]));
  for (const z of [z0 + .6, z0 + 3.2, z1 - .9]) P.push(box([-1.58, y0 + .1, z - .09], [1.58, yA + .5, z + .09], fn({ skip: [0, 1] })));
  for (const x of SL.COLS) {
    P.push(lathe([x, yA, z0], FZ, [[0, SL.CR - .03], [.04, SL.CR], [SL.LEN - .04, SL.CR], [SL.LEN, SL.CR - .02]], { n: 22, gen: 4, rings: [1, 2], caps: true }));
    for (let k = 1; k < 7; k++) P.push(ringW([x, yA, z0 + k * SL.LEN / 7], FZ, SL.CR + .025, fn({ n: 16 })));
    P.push(circle([x, yA, z0 - .01], [0, 0, -1], SL.CR * .7, 12, fn({ w: .5, pts: false })));
  }
  P.push(crate([-.45, yA + .38, z0 + 1.2], [.45, yA + .55, z0 + 2.2], fn()));                // cable box
  return P;
}
/* front covers of the containers still loaded (dyn on n): they fly off at the launch */
function slCaps(st) {
  const n = st.n === undefined ? 4 : Math.max(0, Math.min(4, Math.round(st.n))), P = [], yA = SL.PIV[1] + SL.AXY, z = SL.PIV[2] + .05 + SL.LEN;
  for (let k = 4 - n; k < 4; k++) {
    const x = SL.COLS[SL.ORDER[k]];
    P.push(lathe([x, yA, z], FZ, [[0, SL.CR + .02], [.06, SL.CR + .02], [.1, SL.CR * .6], [.12, 0]], { n: 18, gen: 2, rings: [0, 1] }));
  }
  return P;
}
function slRam(st) {
  const A = X.ap(slPackXf(st), [0, SL.PIV[1] - .15, SL.PIV[2] + 3.6]);
  const out = HD.ram([0, 1.72, -1.4], A, [.17, .13, .1], 2.8, { n: 14 });
  out.push(lathe([0, 1.72, -1.4], FX, [[-.15, .15], [.15, .15]], { n: 10, gen: 0, rings: [0, 1] }));
  return out;
}
function slJacks(st) {
  const dep = st.dep === undefined ? 0 : st.dep, out = [], lift = SL.JT * (1 - dep);
  for (const [x, z] of SL.JACKS) for (const s of [-1, 1]) {
    const X0 = s * (1.25 + (x + .1 - 1.25) * dep);
    out.push(box([s * .85, 1.38, z - .14], [X0 + s * .12, 1.62, z + .14]));
    out.push(box([X0 - .3, lift, z - .3], [X0 + .3, lift + .07, z + .3]));
    out.push(cyl([X0, lift + .07, z], [X0, 1.45, z], .08, { n: 10, gen: 2, rings: [0] }));
  }
  return out;
}
const SL_GEO = memo(() => ({ C: slChassis(), K: bazCab(), CB: slCabin(), PK: slPack() }));
function s400() {
  const g = SL_GEO();
  const whT = st => { const P = []; for (const s of [-1, 1]) HD.wheel(P, 6.9, s, { r: SL.WR, w: .5, x: .78, rot: st.wheel || 0 }); for (const z of SL.TR_AX.slice(1)) for (const s of [-1, 1]) HD.wheel(P, z, s, { r: SL.WR, w: .5, x: .78, rot: st.wheel || 0 }); return P; };
  const whS = st => { const P = []; for (const z of SL.TL_AX) for (const s of [-1, 1]) HD.wheel(P, z, s, { r: SL.WR, w: .5, x: .85, rot: st.wheel || 0 }); return P; };
  return {
    name: 's400', PIV: SL.PIV, A: S400,
    parts: [
      { name: 'tractor', label: 'BAZ-64022 · 6×6 tractor', prims: g.K },
      { name: 'chassis', label: 'Semi-trailer · 5P85SM2-01', prims: g.C },
      { name: 'wheelsT', label: 'Tractor wheels ×6 · 1300×530-533', prims: whT({}), dyn: whT },
      { name: 'wheelsS', label: 'Trailer wheels ×4', prims: whS({}), dyn: whS },
      { name: 'cabin', label: 'Equipment cabin · power unit', prims: g.CB },
      { name: 'pack', label: '48N6 containers ×4 · erector', prims: g.PK, xf: slPackXf },
      { name: 'caps', label: 'Container covers', prims: slCaps({}), dyn: slCaps, xf: slPackXf },
      { name: 'ram', label: 'Erector ram · hydraulic', prims: slRam({}), dyn: slRam },
      { name: 'jacks', label: 'Outrigger jacks ×4', prims: slJacks({}), dyn: slJacks },
    ],
  };
}
export const S400 = { PIV: SL.PIV, LEN: SL.LEN, ELEV: SL.ELEV, COLS: SL.COLS, ORDER: SL.ORDER, packXf: slPackXf, mouth: slMouth };

/* ======================================================================================================
   S-400 · 92N6E ENGAGEMENT RADAR on an MZKT-7930 8×8: the equipment shelter behind the cab, the antenna post at
   the rear on a turntable. Travelling, the phased-array antenna lies flat, face down, on the shelter roof; raised
   (st.mast 1) it stands upright and turns with st.ant. Vehicle-local frame as the TEL.
   ====================================================================================================== */
const SR = { AXLES: [4.45, 2.25, -2.75, -4.95], H: [0, 3.75, -5.0], TURN: [0, 0, -5.0] };
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const srRaiseXf = st => about(R.x((1 - (st.mast === undefined ? 1 : sat(st.mast))) * PI / 2), SR.H);
const srAntXf = st => X.mul(about(R.y((st.ant || 0) * ss(.85, 1, st.mast === undefined ? 1 : st.mast)), SR.TURN), srRaiseXf(st));
function srAntenna() {
  // in the raised frame: a short column, the planar array (octagonal face, element grid), its back frame
  const P = [], c = [0, 6.3, -4.82], n = V.norm([0, .08, 1]), h = FX, u = V.norm(V.cross(n, h));
  P.push(cyl([0, 3.75, -5.0], [0, 4.55, -5.0], .32, { n: 14, gen: 2, caps: true }));
  P.push(crate([-.6, 4.4, -5.35], [.6, 4.75, -4.9]));
  const P8 = []; for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU; P8.push(V.add(V.mad(c, h, Math.cos(a) * 1.84), V.mul(u, Math.sin(a) * 1.8))); }
  P.push(hex([P8[3], P8[0], P8[7], P8[4], ...[P8[3], P8[0], P8[7], P8[4]].map(p => V.mad(p, n, -.34))], { bottom: true }));
  P.push(...octFace(V.mad(c, n, .01), h, u, n, 1.84));
  P.push(hex([P8[2], P8[1], P8[0], P8[3], ...[P8[2], P8[1], P8[0], P8[3]].map(p => V.mad(p, n, -.34))], { skip: [0] }));
  P.push(hex([P8[4], P8[7], P8[6], P8[5], ...[P8[4], P8[7], P8[6], P8[5]].map(p => V.mad(p, n, -.34))], { skip: [0] }));
  P.push(crate(V.add(c, [-.35, 1.75, -.35]), V.add(c, [.35, 2.05, -.05]), fn()));                     // IFF / aux antenna
  for (const s of [-1, 1]) P.push(cyl([s * .45, 4.6, -5.25], V.add(c, [s * 1.1, -.6, -.35]), .06, fn({ n: 6, gen: 0 })));
  return P;
}
const SR_GEO = memo(() => {
  const C = [], K = [], B = [], S = [], PD = [];
  HD.chassis8x8(C, 6.2, -6.9, { axles: SR.AXLES, deckFront: 2.35, fenders: [[1.42, 2.95, false, true], [-5.78, -1.9, true, true]] });
  K.push(...partOf(HD.tel(), 'cab').prims);
  B.push(box([-1.36, 1.45, 2.95], [1.36, 2.95, 4.1]));
  for (const s of [-1, 1]) B.push(panel([[s * 1.365, 1.62, 3.05], [s * 1.365, 1.62, 4.0], [s * 1.365, 2.78, 4.0], [s * 1.365, 2.78, 3.05]], { hatch: 5, edge: .6, pts: false }));
  // equipment shelter
  S.push(crate([-1.35, 1.45, -4.2], [1.35, 3.45, 2.85]));
  for (const s of [-1, 1]) {
    S.push(rect([s * 1.36, 2.45, -.4], FZ, FY, .45, .8, { edge: .7 }));
    for (const z of [-3.2, 1.6]) S.push(rect([s * 1.36, 2.9, z], FZ, FY, .35, .3, fn({ hatch: 4, edge: .5 })));
  }
  S.push(crate([-.7, 3.45, 1.0], [.7, 3.7, 2.2], fn()));
  S.push(line([[-1.1, 3.45, 2.5], [-1.08, 5.0, 2.45]], fn({ w: .5 })));
  // antenna pedestal and turntable ring
  PD.push(crate([-.75, 1.45, -5.65], [.75, 3.55, -4.35]));
  PD.push(lathe([0, 3.55, -5.0], FY, [[0, .7], [.2, .7]], { n: 20, gen: 0, caps: true }));
  for (const s of [-1, 1]) for (const z of [-6.6, -3.0]) PD.push(lathe([s * 1.3, .76, z], FY, [[0, .15], [.08, .15], [.08, .12], [.72, .12]], fn({ n: 10, gen: 2, rings: [0, 1], caps: true })));
  return { C, K, B, S, PD, A: srAntenna() };
});
function s400r() {
  const g = SR_GEO();
  const whL = st => wheelSide(SR.AXLES, -1, st.wheel || 0, {}), whR = st => wheelSide(SR.AXLES, 1, st.wheel || 0, {});
  return {
    name: 's400r', A: S400R,
    parts: [
      { name: 'chassis', label: 'MZKT-7930 · 8×8', prims: g.C },
      { name: 'wheelsL', label: 'Wheels ×4 · 1500×600-635 · L', prims: whL({}), dyn: whL },
      { name: 'wheelsR', label: 'Wheels ×4 · 1500×600-635 · R', prims: whR({}), dyn: whR },
      { name: 'cab', label: 'Cab · MZKT-7930', prims: g.K },
      { name: 'bay', label: 'Power pack cover', prims: g.B },
      { name: 'shelter', label: 'Equipment shelter', prims: g.S },
      { name: 'pedestal', label: 'Antenna pedestal · turntable', prims: g.PD },
      { name: 'array', label: '92N6E · phased array', prims: g.A, xf: srAntXf },
    ],
  };
}
export const S400R = { H: SR.H, TURN: SR.TURN, antXf: srAntXf, ARRAY: [0, 6.3, -4.82] };

/* ======================================================================================================
   A-222 BEREG · 130 mm self-propelled coastal gun on the MAZ-543M 8×8: the two separate cabs either side of the
   engine, the fire-control and crew compartment behind them, the turret on the rear half with the 130 mm L/54
   gun, four hydraulic jacks. Travelling, the barrel lies forward over the engine between the cabs. Vehicle-local
   frame as the TEL.
   ====================================================================================================== */
const BG = { AXLES: [3.95, 1.75, -1.05, -3.25], RING: [0, 1.55, -2.6], TR: [0, 1.55, 1.6], MZ: [0, 1.55, 8.6], ZF: 5.85, ZR: -5.85, JACKS: [[1.5, 4.85], [1.5, -5.25]], JT: .62 };
const bgTurretXf = st => X.make(R.y(st.yaw || 0), BG.RING);
const bgGunXf = st => X.mul(bgTurretXf(st), about(R.x(-(st.pitch || 0)), BG.TR));
function bgChassis() {
  const P = [];
  for (const s of [-1, 1]) P.push(box([s * .42, .9, BG.ZR + .1], [s * .75, 1.3, BG.ZF - .3]));
  P.push(box([-1.5, 1.3, BG.ZR], [1.5, 1.55, .6], { ribs: { z: 5 } }));
  for (const z of BG.AXLES) {
    P.push(cyl([-.98, .75, z], [.98, .75, z], .08, fn({ n: 8, gen: 0 })));
    P.push(lathe([0, .75, z - .28], FZ, [[0, .1], [.1, .24], [.46, .24], [.56, .1]], fn({ n: 12, gen: 0, rings: [1, 2] })));
  }
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[.95, 4.75], [-4.05, -.25]]) P.push(box([s * .95, 1.55, z0], [s * 1.55, 1.6, z1]));    // fenders
    P.push(box([s * 1.05, .95, -.25], [s * 1.5, 1.28, .85], fn()));                                              // tool boxes
    P.push(lathe([s * 1.15, 1.02, -4.0], FZ, [[0, .26], [.7, .26]], fn({ n: 12, gen: 2, caps: true })));
  }
  P.push(box([-1.4, .72, BG.ZR], [1.4, 1.0, BG.ZR + .2]));
  return P;
}
function bgCabs() {
  // MAZ-543M: two cabs (left: driver; right: crew) with the engine between them under a low cover
  const P = [], zb = 3.95, zf = BG.ZF;
  for (const s of [-1, 1]) {
    const xi = s * .5, xo = s * 1.52;
    P.push(prism(Math.min(xi, xo), Math.max(xi, xo), 1.3, 2.25, zb, zf, Math.min(xi, xo), Math.max(xi, xo), zb, zf - .05));
    P.push(prism(Math.min(xi, xo), Math.max(xi, xo), 2.25, 2.95, zb, zf - .05, Math.min(xi, xo) + (s > 0 ? 0 : .06), Math.max(xi, xo) - (s > 0 ? .06 : 0), zb + .05, zf - .55));
    P.push(panel([[s * .6, 2.32, zf - .08], [s * 1.42, 2.32, zf - .08], [s * 1.38, 2.86, zf - .5], [s * .62, 2.86, zf - .5]], { edge: .9, pts: false }));
    P.push(panel([[xo + s * .01, 2.32, zf - .7], [xo + s * .01, 2.32, zb + .3], [xo + s * .01, 2.85, zb + .35], [xo + s * .01, 2.85, zf - .75]], fn({ edge: .7, pts: false })));
    P.push(circle([s * 1.2, 1.55, zf + .02], FZ, .11, 12, { w: .8, pts: false }));
    P.push(line([[xo, 2.8, zf - .6], [s * 1.75, 2.85, zf - .4], [s * 1.75, 2.35, zf - .4]], fn({ w: .6, pts: false })));
  }
  P.push(crate([-.5, 1.3, 3.95], [.5, 2.25, BG.ZF - .1]));
  P.push(panel([[-.45, 1.45, BG.ZF - .08], [.45, 1.45, BG.ZF - .08], [.45, 2.15, BG.ZF - .08], [-.45, 2.15, BG.ZF - .08]], { hatch: 6, edge: .9, pts: false }));
  P.push(box([-1.55, .85, BG.ZF - .1], [1.55, 1.2, BG.ZF + .12]));
  // barrel travel lock between the cabs
  P.push(box([-.2, 2.25, 4.8], [.2, 2.42, 5.0]), line([[-.25, 2.42, 4.9], [-.25, 2.97, 4.9], [.25, 2.97, 4.9], [.25, 2.42, 4.9]], { w: .8 }));
  return P;
}
function bgBody() {
  // fire-control and crew compartment behind the cabs
  const P = [crate([-1.5, 1.3, .6], [1.5, 2.85, 3.95])];
  for (const s of [-1, 1]) {
    P.push(rect([s * 1.51, 2.2, 2.0], FZ, FY, .45, .7, { edge: .7 }));
    P.push(rect([s * 1.51, 2.6, 3.3], FZ, FY, .3, .22, fn({ edge: .5 })));
  }
  P.push(crate([.55, 2.85, 2.6], [1.3, 3.05, 3.6], fn()));
  P.push(lathe([1.0, 2.85, 1.2], FY, [[0, .25], [.3, .25], [.35, .1]], fn({ n: 12, gen: 2 })));                        // sight / radar dome
  P.push(line([[-1.2, 2.85, 1.0], [-1.18, 4.75, .95]], fn({ w: .5 })));
  return P;
}
function bgTurret() {
  // turret frame: origin on the ring, +Z along the gun at yaw 0
  const P = [];
  P.push(lathe([0, 0, 0], FY, [[0, 1.3], [.12, 1.3]], { n: 24, gen: 0 }));
  P.push(hex([[-1.45, .12, -2.1], [1.45, .12, -2.1], [1.4, .12, 1.9], [-1.4, .12, 1.9], [-1.25, 2.0, -1.9], [1.25, 2.0, -1.9], [1.05, 2.0, 1.15], [-1.05, 2.0, 1.15]]));
  P.push(crate([-1.3, .2, -3.0], [1.3, 1.85, -2.1]));                                                   // bustle: ready rounds
  P.push(lathe([-.7, 2.0, -.7], FY, [[0, .38], [.2, .36], [.3, .2]], fn({ n: 14, gen: 2 })));          // commander's cupola
  P.push(crate([.5, 2.0, .1], [.9, 2.3, .6], fn()));                                                 // sight head
  for (const s of [-1, 1]) P.push(rect([s * 1.43, .9, -.8], FZ, FY, .5, .4, fn({ edge: .6 })));
  return P;
}
function bgGun(st) {
  // in the turret frame, about the trunnion: mantlet, cradle, the 130 mm L/54 barrel (7.0 m), fume extractor
  const P = [], f = st.fire || 0, back = -.55 * f, t = BG.TR;
  P.push(crate([-.62, t[1] - .5, t[2] - .5], [.62, t[1] + .5, t[2] + .25]));
  P.push(lathe([0, t[1], t[2] - .8 + back], FZ, [[0, .23], [1.2, .23], [1.4, .16], [6.9, .105], [7.0, .1]], { n: 12, gen: 0, rings: [0, 1, 2, 4], caps: true }));
  P.push(lathe([0, t[1], t[2] + 3.1 + back], FZ, [[0, .105], [.15, .17], [.95, .17], [1.1, .105]], fn({ n: 12, gen: 2, rings: [1, 2] })));
  P.push(ringW([0, t[1], t[2] + 7.0 + back], FZ, .07, fn({ n: 8 })));
  return P;
}
function bgJacks(st) {
  const dep = st.dep === undefined ? 0 : st.dep, out = [], lift = BG.JT * (1 - dep);
  for (const [x, z] of BG.JACKS) for (const s of [-1, 1]) {
    const X0 = s * (1.25 + (x - 1.25) * dep);
    out.push(box([X0 - .28, lift, z - .28], [X0 + .28, lift + .07, z + .28]));
    out.push(cyl([X0, lift + .07, z], [X0, 1.35, z], .085, { n: 10, gen: 2, rings: [0] }));
  }
  return out;
}
const BG_GEO = memo(() => ({ C: bgChassis(), K: bgCabs(), B: bgBody(), T: bgTurret() }));
function bereg() {
  const g = BG_GEO();
  const W = { r: .75, w: .56, x: .98 };
  const whL = st => wheelSide(BG.AXLES, -1, st.wheel || 0, W), whR = st => wheelSide(BG.AXLES, 1, st.wheel || 0, W);
  return {
    name: 'bereg', A: BEREG,
    parts: [
      { name: 'chassis', label: 'MAZ-543M · 8×8', prims: g.C },
      { name: 'wheelsL', label: 'Wheels ×4 · 1500×600-635 · L', prims: whL({}), dyn: whL },
      { name: 'wheelsR', label: 'Wheels ×4 · 1500×600-635 · R', prims: whR({}), dyn: whR },
      { name: 'cabs', label: 'Cabs ×2 · engine D12A-525A', prims: g.K },
      { name: 'body', label: 'Fire-control compartment · crew', prims: g.B },
      { name: 'turret', label: 'Turret', prims: g.T, xf: bgTurretXf },
      { name: 'gun', label: '130 mm gun · L/54', prims: bgGun({}), dyn: bgGun, xf: bgGunXf },
      { name: 'jacks', label: 'Hydraulic jacks ×4', prims: bgJacks({}), dyn: bgJacks },
    ],
  };
}
export const BEREG = { RING: BG.RING, TR: BG.TR, turretXf: bgTurretXf, gunXf: bgGunXf, muzzle: st => X.ap(bgGunXf(st || {}), BG.MZ) };

/* ======================================================================================================
   ROUNDS (closed shells; origin mid-body, nose +Z)
     48N6E3 (S-400): 7.5 m, Ø 0.519 m, four tail control fins. RIM-116 RAM: 2.79 m, Ø 127 mm, four tail fins,
     two forward canards. 130 mm and 57 mm projectiles.
   ====================================================================================================== */
function ogive(z, r, len, n) { const st = []; for (let k = 0; k <= 8; k++) { const t = k / 8; st.push([t * len, Math.max(.003, r * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - .12 * t))]); } return lathe([0, 0, z], FZ, st, { n: n || 18, gen: 4, rings: [0, 4] }); }
function finSet(r, z, root, tip, span, sweep, degs) {
  const out = [];
  for (const deg of degs || [45, 135, 225, 315]) {
    const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (rr, zz) => [e[0] * rr, e[1] * rr, zz];
    out.push(panel([at(r, z + root), at(r + span, z + tip + sweep), at(r + span, z + sweep), at(r, z)], { edge: 1 }));
  }
  return out;
}
function s400Msl() {
  const r = .2595, z0 = -3.75, z1 = 3.75, nl = 1.25;
  const NS = [ogive(z1 - nl, r, nl, 20)];
  const BD = [lathe([0, 0, z0], FZ, [[0, r * .88], [.06, r], [z1 - nl - z0, r]], { n: 20, gen: 4, rings: [1, 2], caps: true })];
  for (const z of [-2.1, -.4, 1.2]) BD.push(ringW([0, 0, z], FZ, r + .004, fn({ n: 16 })));
  BD.push(lathe([0, 0, z0 + .005], FZ, [[0, .16], [.1, .19]], fn({ n: 14, gen: 2, pts: false })));             // nozzle exit, flush
  const FN = finSet(r, z0 + .05, .55, .3, .3, .12, [0, 90, 180, 270]);
  return { name: 's400_msl', LEN: 7.5, parts: [
    { name: 'radome', label: 'Radome', prims: NS },
    { name: 'body', label: '48N6E3 · Ø 519 mm', prims: BD },
    { name: 'fins', label: 'Tail control fins ×4', prims: FN },
  ] };
}
function rim116() {
  const r = .0635, z0 = -1.395, z1 = 1.395;
  const NS = [lathe([0, 0, z1 - .2], FZ, [[0, r], [.12, r * .8], [.2, r * .45]], { n: 14, gen: 4, rings: [0, 2], caps: true })];
  const BD = [lathe([0, 0, z0], FZ, [[0, r * .85], [.04, r], [z1 - .2 - z0, r]], { n: 14, gen: 4, rings: [1], caps: true })];
  const FN = finSet(r, z0 + .02, .22, .12, .15, .03, [0, 90, 180, 270]).concat(finSet(r, z1 - .55, .12, .06, .06, .02, [45, 225]));
  return { name: 'rim116', LEN: 2.79, parts: [
    { name: 'nose', label: 'Nose · IR / RF', prims: NS },
    { name: 'body', label: 'RIM-116 RAM · Ø 127 mm', prims: BD },
    { name: 'fins', label: 'Tail fins ×4 · canards ×2', prims: FN },
  ] };
}
function projectile(name, label, r, L, nl) {
  const zb = -L / 2, zo = L / 2 - nl;
  return { name, LEN: L, parts: [
    { name: 'ogive', label: 'Ogive nose', prims: [lathe([0, 0, zo], FZ, [[0, r], [nl * .3, r * .92], [nl * .58, r * .72], [nl * .8, r * .46], [nl * .92, r * .28], [nl, .004]], { n: 14, gen: 4, rings: [0, 4] })] },
    { name: 'body', label, prims: [lathe([0, 0, zb], FZ, [[0, r * .78], [L * .12, r * .95], [zo - zb, r]], { n: 14, gen: 4, rings: [0, 1, 2], caps: true })] },
    { name: 'band', label: 'Rotating band', prims: [lathe([0, 0, zb + L * .13], FZ, [[0, r + .004], [L * .05, r + .004]], { n: 14, gen: 0, rings: [0, 1] })] },
  ] };
}
const shell130 = () => projectile('shell130', '130 mm projectile', .065, .67, .3);
const shell57 = () => projectile('shell57', '57 mm projectile', .0285, .25, .1);

/* ======================================================================================================
   CUTAWAYS (Inspect): the unit model plus the underwater body (ships) and interior volumes. Interior parts carry
   inside:true and show only while st.xray is set.
   ====================================================================================================== */
const cutOf = (M, name, extra) => O(M, { name, parts: M.parts.map(p => O(p)).concat(extra) });
/* a ship's underwater body from the waterline to a flat keel with round bilges, stations Z, half width w(z),
   keel depth k(z) (<0) */
function underBody(Z, w, k) {
  const P = [];
  const sec = z => { const b = w(z), d = k(z); return [[b, 0], [b * .96, d * .55], [b * .78, d * .88], [b * .4, d], [0, d]]; };
  for (let i = 0; i < Z.length - 1; i++) {
    const a = sec(Z[i]), b = sec(Z[i + 1]);
    for (const s of [-1, 1]) for (let j = 0; j < 4; j++)
      P.push(plate([[s * a[j][0], a[j][1], Z[i]], [s * b[j][0], b[j][1], Z[i + 1]], [s * b[j + 1][0], b[j + 1][1], Z[i + 1]], [s * a[j + 1][0], a[j + 1][1], Z[i]]], [s, -.5, 0]));
  }
  for (const s of [-1, 1]) P.push(...fpoly(Z.map(z => [s * w(z) * .78, k(z) * .88, z]), (i, a, b) => sideN(a, b, s, -1), fn({ al: .5 })));
  P.push(line(Z.map(z => [0, k(z), z]), { w: .8, pts: false }));
  return P;
}
function screw(c, R_, n, rot, o) {
  return [GEO.blades(c, [0, 0, -1], n, R_ * .28, R_, O({ chord: .9, taper: .9, pitch: .35, edge: .9, hub: true, rot: rot || 0 }, o)),
    lathe(V.add(c, [0, 0, .6]), [0, 0, -1], [[0, R_ * .28], [.9, R_ * .26], [1.3, R_ * .1]], { n: 14, gen: 4, caps: true })];
}
function cgCut() {
  const M = cg(), X_ = [], BL = [], PR = [], MC = [], VB = [];
  const kz = z => z > 60 ? -6.3 * Math.sqrt(Math.max(0, 1 - Math.pow((z - 60) / (CZST - 60), 2))) : z < -40 ? -6.3 + 4.9 * ss(-40, -80, z) : -6.3;
  const Z = [CZS + .5, -82, -76, -68, -56, -40, -20, 0, 20, 40, 52, 60, 66, 71, 75, 78, CZST - .3];
  BL.push(...underBody(Z, z => cgW(z), kz));
  BL.push(lathe([0, -7.1, 57], FZ, [[0, .2], [2.5, 1.9], [7, 2.25], [13, 2.2], [17, 1.4], [19.2, .1]], { n: 22, gen: 6, rings: [1, 3, 4], caps: true }));   // AN/SQS-53 dome
  for (const s of [-1, 1]) {
    const c = [s * 4.1, -4.9, -64.5];
    PR.push(...screw(c, 2.6, 5, s * .4));
    PR.push(cyl([s * 2.2, -3.8, -30], c, .28, { n: 10, gen: 0 }));
    PR.push(cyl([s * 1.2, -1.5, -58], [s * 3.9, -4.6, -58], .16, fn({ n: 8, gen: 0 })), cyl([s * 1.0, -2.0, -63], [s * 3.9, -4.7, -63], .16, fn({ n: 8, gen: 0 })));
    PR.push(hex([[s * 4.1 - .25, -6.2, -73], [s * 4.1 + .25, -6.2, -73], [s * 4.1 + .25, -6.2, -70], [s * 4.1 - .25, -6.2, -70], [s * 4.1 - .25, -1.6, -73.6], [s * 4.1 + .25, -1.6, -73.6], [s * 4.1 + .25, -1.6, -69.8], [s * 4.1 - .25, -1.6, -69.8]], { bottom: true }));
  }
  // machinery: four LM2500 in two engine rooms, two reduction gears
  for (const [x, z] of [[-2.2, 2], [2.2, 2], [-2.2, -24], [2.2, -24]]) MC.push(lathe([x, -2.2, z - 4], FZ, [[0, .7], [.5, 1.0], [6.5, 1.0], [8.0, .7]], { n: 16, gen: 4, rings: [1, 2], caps: true }));
  for (const z of [-8, -34]) MC.push(crate([-3.2, -4.5, z - 2.2], [3.2, -.4, z + 2.2]));
  for (const [zc] of [[CG_VF], [CG_VA]]) VB.push(crate([-4.2, cgD(zc) - 7.7, zc - 3.4], [4.2, cgD(zc) - .3, zc + 3.4]));
  X_.push({ name: 'below', label: 'Underwater hull · AN/SQS-53C sonar dome', prims: BL });
  X_.push({ name: 'props', label: 'Shafts ×2 · 5-blade CRP propellers · rudders', prims: PR });
  X_.push(O({ name: 'mach', label: 'LM2500 ×4 · reduction gears ×2', prims: MC }, hidden));
  X_.push(O({ name: 'vlsB', label: 'Mk 41 modules ×16 · magazines', prims: VB }, hidden));
  return cutOf(M, 'cg_cut', X_);
}
function lcsCut() {
  const M = lcs(), BL = [], MC = [], BY = [];
  const Z = [LZS + .3, -60, -50, -30, -10, 10, 30, 42, 50, LZST - .3];
  BL.push(...underBody(Z, z => lsWl(z), z => z > 40 ? -3.9 * Math.sqrt(Math.max(0, 1 - Math.pow((z - 40) / (LZST - 40), 2))) : -3.9));
  for (const s of [-1, 1]) BL.push(...tps(T3([s * LOX, 0, 0]), underBody([LZS + .3, -50, -30, -15, -8], z => lsOw(z), () => -1.6)));
  for (const x of [-3.0, -1.1, 1.1, 3.0]) BL.push(cyl([x, -3.2, -46], [x, .4, LZS + .3], .5, { n: 12, gen: 2 }));
  for (const [x, z] of [[-2.2, -32], [2.2, -32]]) MC.push(lathe([x, -1.8, z - 4], FZ, [[0, .7], [.5, 1.0], [6.5, 1.0], [8.0, .7]], { n: 16, gen: 4, rings: [1, 2], caps: true }));
  for (const x of [-2.4, 2.4]) MC.push(crate([x - 1.0, -2.8, -16], [x + 1.0, -.2, -8]));
  BY.push(crate([-12.5, LWD + .2, -60], [12.5, LFD - .3, -28]));
  return cutOf(M, 'lcs_cut', [
    { name: 'below', label: 'Underwater hulls · waterjet ducts ×4', prims: BL },
    O({ name: 'mach', label: 'LM2500 ×2 · MTU 20V 8000 ×2', prims: MC }, hidden),
    O({ name: 'bay', label: 'Mission bay · stern ramp', prims: BY }, hidden),
  ]);
}
function s400Cut() {
  const M = s400();
  return cutOf(M, 's400_cut', [
    O({ name: 'engine', label: 'Tractor diesel', prims: [crate([-.6, .95, 4.4], [.6, 2.1, 6.9])] }, hidden),
    O({ name: 'racks', label: 'Launch equipment · power unit', prims: [crate([-1.0, 1.95, .5], [-.1, 3.3, 3.3]), crate([.2, 1.95, 1.8], [1.1, 3.0, 3.3]), crate([.2, 1.95, .5], [1.1, 2.6, 1.5])] }, hidden),
  ]);
}
function s400rCut() {
  const M = s400r();
  return cutOf(M, 's400r_cut', [
    O({ name: 'engine', label: 'YaMZ-846 · V12 diesel', prims: [crate([-.62, 1.0, 2.95], [.62, 2.4, 4.05])] }, hidden),
    O({ name: 'consoles', label: 'Operator consoles · processing racks', prims: [crate([-1.2, 1.5, -3.9], [-.5, 3.3, -.6]), crate([.5, 1.5, -3.9], [1.2, 3.3, -.6]), crate([-.9, 1.5, .4], [.9, 2.4, 2.6])] }, hidden),
  ]);
}
function beregCut() {
  const M = bereg(), AM = [];
  for (const x of [-1.0, 1.0]) AM.push(crate([x - .35, 1.6, -5.6], [x + .35, 2.6, -3.9]));
  return cutOf(M, 'bereg_cut', [
    O({ name: 'engine', label: 'D12A-525A · V12 diesel', prims: [crate([-.45, .95, 4.0], [.45, 2.2, 5.7])] }, hidden),
    O({ name: 'ammo', label: 'Ammunition racks', prims: AM }, hidden),
  ]);
}
export { cg, lcs, s400, s400r, bereg, s400Msl, shell130, shell57, rim116, cgCut, lcsCut, s400Cut, s400rCut, beregCut };

/* ================================================================ tables */
export const UNITS3_STATES = {
  cg: { radar: [-PI, PI, 0], gunYaw: [-2.6, 2.6, 0], gunPitch: [-.1, 1.12, 0], gunYawA: [.55, 5.75, PI], gunPitchA: [-.1, 1.12, 0], ciwsSpin: [0, TAU, 0], hangar: [0, 1, 0] },
  lcs: { radar: [-PI, PI, 0], gunYaw: [-2.4, 2.4, 0], gunPitch: [-.1, 1.35, 0], ramYaw: [0, TAU, PI] },
  s400: { elev: [0, SL.ELEV, 0], dep: [0, 1, 0], n: [0, 4, 4], wheel: [0, TAU, 0] },
  s400r: { mast: [0, 1, 1], ant: [-PI, PI, 0], wheel: [0, TAU, 0] },
  bereg: { yaw: [-PI, PI, 0], pitch: [-.08, .87, 0], dep: [0, 1, 0], fire: [0, 1, 0], wheel: [0, TAU, 0] },
};
for (const k of ['cg', 'lcs', 's400', 's400r', 'bereg']) UNITS3_STATES[k + '_cut'] = O(UNITS3_STATES[k], { xray: false });
export const UNITS3_INFO = {
  cg: { name: 'CG-47 Ticonderoga class', kind: 'unit', size: [172.7, 16.8, 40.5], s: [.3, .7, 2] },
  lcs: { name: 'LCS-2 Independence class', kind: 'unit', size: [128.3, 31.6, 31.8], s: [.3, .7, 2] },
  s400: { name: 'S-400 · 5P85SM2-01 launcher', kind: 'unit', size: [16.5, 3.2, 3.85], s: [.045, .1, .28] },
  s400r: { name: 'S-400 · 92N6E radar', kind: 'unit', size: [13.8, 3.9, 8.3], s: [.04, .09, .26] },
  bereg: { name: 'A-222 Bereg', kind: 'unit', size: [11.8, 3.1, 3.8], s: [.035, .08, .25] },
  s400_msl: { name: '48N6E3', kind: 'munition', size: [7.5, 1.12, 1.12], s: [.016, .04, .12] },
  rim116: { name: 'RIM-116 RAM', kind: 'munition', size: [2.79, .43, .43], s: [.006, .015, .045] },
  shell130: { name: '130 mm projectile', kind: 'munition', size: [.67, .13, .13], s: [.003, .008, .02] },
  shell57: { name: '57 mm projectile', kind: 'munition', size: [.25, .06, .06], s: [.0015, .004, .01] },
};

/* ================================================================ Inspect (merged into data/anatomy.js ANATOMY) */
const E = (id, parts, label, size, explode, w0, cls, more) => Object.assign({ id, parts, label, size: size || '', explode, w0, cls }, more || {});
export const UNITS3_ANATOMY = {
  cg: {
    model: 'cg_cut', frame: 'hull', title: 'CG-47 · Ticonderoga class', size: '172.8 × 16.8 m · draught 9.5 m',
    note: 'Guided-missile cruiser: Aegis with four SPY-1B faces on two deckhouses, two 61-cell Mk 41 launchers, two 5-inch guns, two Phalanx, Harpoon, twin hangars; four LM2500 on two shafts.',
    st: { radar: .5 }, view: { yaw: -1.1, pitch: .3 },
    parts: [
      E('01', ['sps', 'mastM'], 'AN/SPS-49(V) · main mast', '7.3 × 4.3 m', [0, 30, -4], 0, 'part', { side: 'L' }),
      E('02', ['mastF'], 'Foremast · URN-25 TACAN · AN/SPS-55', '', [0, 28, 6], .03, 'part', { side: 'R' }),
      E('03', ['spy'], 'AN/SPY-1B ×4 · Aegis', '3.7 m faces', [0, 20, 0], .06, 'part', { side: 'R' }),
      E('04', ['houseF'], 'Forward deckhouse · bridge', '', [0, 20, 6], .1, 'shell', { side: 'R' }),
      E('05', ['houseA', 'hangar'], 'Aft deckhouse · twin hangar', '', [0, 20, -6], .12, 'shell', { side: 'L' }),
      E('06', ['stacks'], 'Funnels ×2 · LM2500 uptakes', '', [0, 24, 0], .08, 'shell', { side: 'L' }),
      E(null, ['houseM'], 'Midships deckhouse', '', [0, 14, 0], .14, 'shell'),
      E('07', ['gunF'], 'Mk 45 5"/54 · forward', '127 mm', [0, 12, 18], .18, 'part', { side: 'R' }),
      E('08', ['gunA'], 'Mk 45 5"/54 · aft', '127 mm', [0, 12, -18], .19, 'part', { side: 'L' }),
      E('09', ['vlsF'], 'Mk 41 VLS · forward', '61 cells', [0, 14, 10], .22, 'part', { side: 'R' }),
      E('10', ['vlsA'], 'Mk 41 VLS · aft', '61 cells', [0, 14, -10], .23, 'part', { side: 'L' }),
      E('11', ['ciwsF'], 'Phalanx CIWS 1B · starboard', '20 mm', [8, 16, 4], .16, 'part', { side: 'R' }),
      E(null, ['ciwsA'], 'Phalanx CIWS 1B · port', '', [-8, 16, -4], .16, 'part'),
      E('12', ['harpoon'], 'Mk 141 Harpoon ×2 · 8 canisters', '', [0, 10, -24], .25, 'part', { side: 'L' }),
      E('13', ['arms', 'boats'], 'Mk 32 SVTT ×2 · RHIB ×2', '', [0, 10, 0], .27, 'part', { side: 'R' }),
      E(null, ['deck', 'rails'], 'Flight deck · lifelines', '', [0, 6, -12], .3, 'part'),
      E('14', ['vlsB'], 'Mk 41 modules · magazines', '122 cells', [0, 8, 0], .34, 'part', { side: 'L' }),
      E('15', ['mach'], 'LM2500 ×4 · reduction gears ×2', '80 000 shp', [0, 6, 0], .4, 'part', { side: 'R' }),
      E('16', ['props'], 'Shafts ×2 · 5-blade CRP propellers', 'Ø 5.2 m', [0, -10, -8], .5, 'part', { side: 'L' }),
      E('17', ['below'], 'Underwater hull · SQS-53C dome', '', [0, -8, 0], .46, 'shell', { side: 'R' }),
      E('18', ['hull'], 'Hull · Spruance form', '172.8 m', [0, 0, 0], .55, 'shell', { side: 'R' }),
    ],
    xray: [
      ...[0, 1].map(blk => ({
        id: blk ? 'VA' : 'VF', label: 'Mk 41 canisters · 61', model: 'mk41_can', st: {}, parent: 'vlsB',
        inst: () => CG_CELLS.filter(c => c.blk === blk).map(c => T3([c.x, c.y - .35, c.z])),
      })),
      { id: 'HH', label: 'MH-60R ×2 · in the hangars', model: 'helo', st: { droop: 1 }, parent: 'houseA', inst: () => CG_HANGAR.doors.map(x => X.make(R.y(PI), [x, CG_HANGAR.y0, CG_HANGAR.z + 8])) },
    ],
  },
  lcs: {
    model: 'lcs_cut', frame: 'hull', title: 'LCS-2 · Independence class', size: '127.4 × 31.6 m · draught 4.5 m',
    note: 'Littoral combat ship: an aluminium trimaran with a 1 030 m² flight deck and a hangar for two H-60s; 57 mm gun, SeaRAM; two gas turbines and two diesels driving four waterjets, 40+ knots.',
    st: { radar: .5 }, view: { yaw: -1.0, pitch: .32 },
    parts: [
      E('01', ['radar'], 'Sea Giraffe AMB · 3-D search', '', [0, 16, 4], 0, 'part', { side: 'R' }),
      E('02', ['bridge'], 'Superstructure · integrated mast', '', [0, 14, 6], .06, 'shell', { side: 'R' }),
      E('03', ['hangar'], 'Hangar · 2 × H-60', '', [0, 12, -4], .1, 'shell', { side: 'L' }),
      E('04', ['searam'], 'SeaRAM · 11 × RIM-116', '', [0, 18, -10], .04, 'part', { side: 'L' }),
      E('05', ['gun'], 'Mk 110 57 mm', '57 mm', [0, 8, 14], .12, 'part', { side: 'R' }),
      E('06', ['cross', 'deck'], 'Cross-structure · flight deck', '1 030 m²', [0, 6, -6], .2, 'shell', { side: 'L' }),
      E('07', ['outriggers'], 'Outriggers ×2 · side hulls', '', [0, -2, 0], .3, 'shell', { side: 'L' }),
      E(null, ['rails'], 'Lifelines', '', [0, 6, 6], .2, 'part'),
      E('08', ['bay'], 'Mission bay · stern ramp', '', [0, 4, -12], .26, 'part', { side: 'L' }),
      E('09', ['mach'], 'LM2500 ×2 · MTU 20V 8000 ×2', '', [0, 2, 0], .34, 'part', { side: 'R' }),
      E('10', ['jets', 'below'], 'Waterjets ×4 · underwater hulls', '', [0, -6, -4], .42, 'part', { side: 'R' }),
      E('11', ['hull'], 'Main hull', '127.4 m', [0, 0, 0], .5, 'shell', { side: 'R' }),
    ],
    xray: [{ id: 'HH', label: 'MH-60R · in the hangar', model: 'helo', st: { droop: 1 }, parent: 'hangar', inst: () => [X.make(R.y(PI), [0, LFD, -14])] }],
  },
  s400: {
    model: 's400_cut', frame: 'chassis', title: 'S-400 · 5P85SM2-01', size: '16.5 × 3.2 m',
    note: 'Launcher of the S-400 on a semi-trailer behind a BAZ-64022 tractor: four 48N6 rounds in sealed containers, raised to the vertical to fire.',
    st: { elev: 0, dep: 0 }, view: { yaw: -1.2, pitch: .2 },
    parts: [
      E('01', ['pack', 'caps'], '48N6 containers ×4', '7.5 m', [0, 3.2, 0], 0, 'shell', { side: 'L', note: 'Sealed containers: the round is loaded at the factory and fired from it.' }),
      E('02', ['ram'], 'Erector ram · hydraulic', '', [0, 2.0, 0], .2, 'part', { side: 'L' }),
      E('03', ['cabin'], 'Equipment cabin · power unit', '', [0, 2.4, 0], .1, 'shell', { side: 'R' }),
      E('04', ['racks'], 'Launch equipment', '', [0, 1.6, 0], .3, 'part', { side: 'R' }),
      E('05', ['tractor'], 'BAZ-64022 · 6×6 tractor', '', [0, 1.6, 2.2], .14, 'shell', { side: 'R' }),
      E(null, ['engine'], 'Tractor diesel', '', [0, 1.2, 2.2], .34, 'part'),
      E('06', ['jacks'], 'Outrigger jacks ×4', '', [0, -.2, 0], .36, 'part', { side: 'L' }),
      E('07', ['wheelsT'], 'Tractor wheels ×6', '', [1.4, 0, 1.4], .42, 'shell', { side: 'R' }),
      E(null, ['wheelsS'], 'Trailer wheels ×4', '', [1.4, 0, -1.4], .42, 'shell'),
      E('08', ['chassis'], 'Semi-trailer · 5P85SM2-01', '', [0, .6, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [0, 1, 2, 3].map(k => ({
      id: 'M' + (k + 1), label: '48N6E3 · container ' + (k + 1), model: 's400_msl', st: {}, parent: 'pack',
      inst: st => [X.mul(slPackXf(st), T3([SL.COLS[SL.ORDER[k]], SL.PIV[1] + SL.AXY, SL.PIV[2] + .05 + SL.LEN / 2]))],
      when: st => (st.n === undefined ? 4 : st.n) > k,
    })),
  },
  s400r: {
    model: 's400r_cut', frame: 'chassis', title: 'S-400 · 92N6E', size: '13.8 × 3.1 m',
    note: 'Engagement radar of the S-400 on an MZKT-7930: a planar phased array on a turntable, folded flat on the shelter to travel, raised to radiate.',
    st: { mast: 1 }, view: { yaw: -1.15, pitch: .18 },
    parts: [
      E('01', ['array'], '92N6E · phased array', '', [0, 3.0, 0], 0, 'part', { side: 'R' }),
      E('02', ['pedestal'], 'Antenna pedestal · turntable', '', [0, 2.0, -.6], .1, 'part', { side: 'L' }),
      E('03', ['shelter'], 'Equipment shelter', '7 m', [0, 3.2, 0], .18, 'shell', { side: 'L' }),
      E('04', ['consoles'], 'Operator consoles · racks', '', [0, 1.6, 0], .28, 'part', { side: 'L' }),
      E('05', ['cab'], 'Cab · crew 3', '', [0, 2.0, 1.5], .1, 'shell', { side: 'R' }),
      E(null, ['bay'], 'Power pack cover', '', [0, 3.6, .4], .05, 'shell'),
      E('06', ['engine'], 'YaMZ-846 · V12 diesel', '500 hp', [0, 2.3, 0], .32, 'part', { side: 'R' }),
      E('07', ['wheelsR'], 'Wheels ×8 · 1500×600-635', '', [1.35, 0, 0], .45, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.35, 0, 0], .45, 'shell'),
      E('08', ['chassis'], 'MZKT-7930 · 8×8', '', [0, 1.0, 0], .24, 'shell', { side: 'L' }),
    ],
  },
  bereg: {
    model: 'bereg_cut', frame: 'chassis', title: 'A-222 Bereg', size: '11.8 × 3.1 m',
    note: 'Self-propelled 130 mm coastal gun on the MAZ-543M: a turret on the rear half, fire control behind the two cabs; it fires from its jacks at ships and landing craft.',
    st: { dep: 0 }, view: { yaw: -1.2, pitch: .2 },
    parts: [
      E('01', ['gun'], '130 mm gun · L/54', '7.0 m', [0, 2.6, .8], 0, 'part', { side: 'R' }),
      E('02', ['turret'], 'Turret · ready rounds', '', [0, 2.2, 0], .1, 'shell', { side: 'L' }),
      E('03', ['ammo'], 'Ammunition racks', '', [0, 1.6, -.6], .3, 'part', { side: 'L' }),
      E('04', ['body'], 'Fire-control compartment', '', [0, 2.2, .4], .16, 'shell', { side: 'R' }),
      E('05', ['cabs'], 'Cabs ×2 · MAZ-543M', '', [0, 1.8, 1.4], .2, 'shell', { side: 'R' }),
      E('06', ['engine'], 'D12A-525A · V12 diesel', '525 hp', [0, 1.4, 1.4], .34, 'part', { side: 'R' }),
      E('07', ['jacks'], 'Hydraulic jacks ×4', '', [0, -.2, 0], .36, 'part', { side: 'L' }),
      E('08', ['wheelsR'], 'Wheels ×8 · 1500×600-635', '', [1.35, 0, 0], .45, 'shell', { side: 'R' }),
      E(null, ['wheelsL'], 'Wheels · L', '', [-1.35, 0, 0], .45, 'shell'),
      E('09', ['chassis'], 'MAZ-543M · 8×8', '11.7 m', [0, .8, 0], .5, 'shell', { side: 'L' }),
    ],
    xray: [{ id: 'SH', label: '130 mm rounds · ready rack', model: 'shell130', st: {}, parent: 'turret',
      inst: st => { const out = [], T = bgTurretXf(st); for (let k = 0; k < 8; k++) out.push(X.mul(T, T3([-1.0 + k * .28, .6, -2.55]))); return out; } }],
  },
};
