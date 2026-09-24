/* HD land models for the extended menu cutscenes: K340P Bastion-P TEL, P-800 Oniks,
   Monolith-B radar, Pantsir-S1, RIM-174 SM-6 + Mk 72. Built only from GEO primitives,
   so the Orbital renderer (GEO.draw hairlines) and the Point Cloud renderer
   (GEO.sample dots) both understand them. Contract: _brief/models.txt (LAND).
   Metres, +Z forward, +Y up, +X right-hand side. Vehicles: origin on the ground at
   the vehicle centre. Missiles: origin mid-body, nose +Z.
   Prims flagged fine: true are close-up detail (skip with {fine:false} when distant). */
window.HD = window.HD || {};
(function () {
  'use strict';
  const { V, R, X } = M3;
  const { hex, box, lathe, cyl, panel, line, blades } = GEO;
  const PI = Math.PI, DEG = PI / 180;
  const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const wrapPi = a => a - 2 * PI * Math.round(a / (2 * PI));
  const fn = o => Object.assign({ fine: true }, o || {});
  const FZ = [0, 0, 1], FY = [0, 1, 0], FX = [1, 0, 0];

  /* ================= helpers ================= */
  /* transformed copy of a primitive (sub-assemblies built in their own frame) */
  function tp(T, pr) {
    const q = Object.assign({}, pr);
    if (pr.p) q.p = pr.p.map(p => X.ap(T, p));
    if (pr.t === 'lathe') { q.a = X.ap(T, pr.a); q.d = X.dir(T, pr.d); }
    if (pr.t === 'blades') { q.c = X.ap(T, pr.c); q.d = X.dir(T, pr.d); }
    return q;
  }
  const tpAll = (T, list) => list.map(pr => tp(T, pr));
  /* rigid rotation Rm about the point o */
  const about = (Rm, o) => { const ro = R.ap(Rm, o); return X.make(Rm, [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]]); };
  /* facing-aware ring around axis d (a zero-length lathe band) */
  const ring = (c, d, r, o) => lathe(c, d, [[0, r], [.001, r]], Object.assign({ gen: 0, sil: false, rings: [0], n: 22, pts: false }, o || {}));
  /* plain polyline circle: stays bright when seen head-on (lamps, lenses, bolt circles) */
  function circle(c, d, r, n, o) {
    const [U, W] = GEO.perp(V.norm(d)), p = [];
    for (let i = 0; i < n; i++) { const a = i / n * 2 * PI; p.push(V.add(c, V.add(V.mul(U, Math.cos(a) * r), V.mul(W, Math.sin(a) * r)))); }
    return line(p, Object.assign({ closed: true }, o || {}));
  }
  /* prism: bottom rectangle x0..x1 / z0..z1 at y0, top rectangle tx0..tx1 / tz0..tz1 at y1 */
  const prism = (x0, x1, y0, y1, z0, z1, tx0, tx1, tz0, tz1, o) =>
    hex([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [tx0, y1, tz0], [tx1, y1, tz0], [tx1, y1, tz1], [tx0, y1, tz1]], o);
  /* rectangle panel: centre c, half sizes a along u, b along v (hatch runs along u) */
  const rect = (c, u, v, a, b, o) => panel([V.add(c, V.add(V.mul(u, -a), V.mul(v, -b))), V.add(c, V.add(V.mul(u, a), V.mul(v, -b))),
    V.add(c, V.add(V.mul(u, a), V.mul(v, b))), V.add(c, V.add(V.mul(u, -a), V.mul(v, b)))], o);
  /* square-wave polyline along u (dipole rows, grille teeth) */
  function comb(c, u, v, len, n, h, o) {
    const p = [], s = len / n;
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + i * s, x1 = x0 + s * .5;
      const q = (x, y) => V.add(c, V.add(V.mul(u, x), V.mul(v, y)));
      p.push(q(x0, 0), q(x0, h), q(x1, h), q(x1, 0));
    }
    p.push(V.add(c, V.mul(u, len / 2)));
    return line(p, o);
  }

  /* telescoping hydraulic ram from B (barrel end) to A (rod end): nested stages of
     length lmin slide apart; stage glands are slightly fatter collars */
  function ram(B, A, rs, lmin, o) {
    o = o || {};
    const d = V.sub(A, B), L = V.len(d), u = L > 1e-9 ? V.mul(d, 1 / L) : [0, 1, 0], n = rs.length, ell = Math.min(L, lmin), out = [];
    for (let i = 0; i < n; i++) {
      const s0 = n > 1 ? i * (L - ell) / (n - 1) : 0, r = rs[i], last = i === n - 1;
      const g = Math.min(.08, ell * .1);
      const st = last ? [[0, r], [ell, r]] : [[0, r], [ell - g, r], [ell - g, r * 1.12], [ell, r * 1.12]];
      out.push(lathe(V.mad(B, u, s0), u, st, Object.assign({ n: o.n || 14, gen: last ? 0 : (o.gen === undefined ? 3 : o.gen), rings: last ? [] : [0, 3], caps: true }, o.prim || {})));
    }
    return out;
  }

  /* one road wheel. o: r tyre radius, w width, x |x| of the inner face, y axle height,
     rot rolling angle (rad, + = rolling forward), lugs tread grooves, n ring segments */
  function wheel(P, z, side, o) {
    o = o || {};
    const r = o.r || .74, w = o.w || .55, xi = o.x === undefined ? 1.0 : o.x, y = o.y === undefined ? r : o.y;
    const d = [side, 0, 0], a = [side * xi, y, z], rot = (o.rot || 0) * side, n = o.n || 26;
    const at = s => [side * (xi + s), y, z];
    // tyre: bead, bulged sidewall, square shoulders; the lugs are two tread halves built from
    // opposite sides with an odd groove count, so their grooves stagger like an off-road tread
    P.push(lathe(a, d, [[0, r * .6], [.035, r * .8], [.075, r * .95], [.12, r], [w - .12, r], [w - .075, r * .95], [w - .035, r * .8], [w, r * .6]],
      { n, gen: 0, rings: [3, 4, 7], caps: true, sil: false }));
    P.push(lathe(at(.075), d, [[0, r * .95], [.045, r], [w - .195, r], [w - .15, r * .95]], { n, gen: 0, rings: [], pts: false }));
    const lg = (o.lugs || 15) | 1;
    for (const [s0, dd] of [[.07, d], [w - .07, [-side, 0, 0]]])
      P.push(lathe(at(s0), dd, [[0, r * .94], [.05, r + .004], [w / 2 - .07, r + .004]], { n, gen: lg, rings: [], sil: false, pts: false, fine: true }));
    // disc wheel: dished centre, hub boss (static, round) + hand holes and nuts (turn)
    P.push(lathe(at(w - .01), d, [[0, r * .6], [-.09, r * .5], [-.1, r * .31], [-.03, r * .25], [.04, r * .2], [.07, r * .12]],
      { n: 20, gen: 0, rings: [1, 4, 5], sil: false, pts: false }));
    P.push(blades(at(w - .095), d, 6, r * .33, r * .47, { rot, chord: .5, taper: .75, edge: .5, pts: false, fine: true }));
    P.push(blades(at(w - .025), d, 10, r * .255, r * .285, { rot: rot + .31, chord: .24, taper: .625, edge: .55, pts: false, fine: true }));
    if (o.valve !== false) P.push(line([at(w + .05), V.add(at(w - .02), [0, Math.cos(rot) * r * .5, Math.sin(rot) * r * .5 * side])], { w: .4, pts: false, fine: true }));
  }
  function wheelSet(axles, rot, o) { const P = []; for (const z of axles) for (const sx of [-1, 1]) wheel(P, z, sx, Object.assign({}, o, { rot })); return P; }

  /* 8x8 running gear + frame. o: axles, r, x, w (tyre), halfW, deckY, deckFront,
     open (side walkways only: room for an erector), railY [y0, y1],
     fenders [[z0, z1, apronFwd, apronAft]...] */
  function chassis8x8(P, zFront, zRear, o) {
    o = o || {};
    const ax = o.axles || [4.45, 2.25, -2.75, -4.95], r = o.r || .74, tx = o.x === undefined ? 1.0 : o.x, tw = o.w || .55;
    const hw = o.halfW || 1.3, yd = o.deckY || 1.45, df = o.deckFront === undefined ? zFront : o.deckFront, yr = o.railY || [.84, 1.24];
    for (const sx of [-1, 1]) P.push(box([sx * .46, yr[0], zRear + .12], [sx * .8, yr[1], zFront - .3]));
    for (let z = zRear + .5; z < zFront - .6; z += 2.05) P.push(box([-.46, yr[0] + .08, z], [.46, yr[1] - .08, z + .16], fn()));
    if (o.open) for (const sx of [-1, 1]) P.push(box([sx * .84, yd - .1, zRear], [sx * hw, yd, df]));
    else P.push(box([-hw, yd - .1, zRear], [hw, yd, df]));
    for (const z of ax) {
      P.push(cyl([-tx - .02, r, z], [tx + .02, r, z], .075, { n: 8, gen: 0, fine: true }));
      P.push(lathe([0, r, z - .28], FZ, [[0, .1], [.1, .24], [.46, .24], [.56, .1]], { n: 12, gen: 0, rings: [1, 2], fine: true }));
      for (const sx of [-1, 1]) P.push(cyl([sx * .52, r + .02, z], [sx * .8, yr[0] + .02, z + .45], .05, { n: 6, gen: 0, fine: true }));
    }
    const ft = 2 * r + .06;
    for (const [z0, z1, af, aa] of (o.fenders || [])) for (const sx of [-1, 1]) {
      const xa = sx * (tx - .05), xb = sx * (tx + tw + .07);
      P.push(box([xa, ft, z0], [xb, ft + .05, z1]));
      if (af) P.push(panel([[xa, ft, z1], [xb, ft, z1], [xb, r + .4, z1 + .4], [xa, r + .4, z1 + .4]], { edge: .8 }));
      if (aa) {
        P.push(panel([[xa, ft, z0], [xb, ft, z0], [xb, r + .4, z0 - .4], [xa, r + .4, z0 - .4]], { edge: .8 }));
        P.push(panel([[xa, r + .38, z0 - .42], [xb, r + .38, z0 - .42], [xb, .32, z0 - .42], [xa, .32, z0 - .42]], { edge: .45, fine: true }));
      }
    }
    // rear bumper, lamp clusters, tow pintle
    P.push(box([-1.3, .72, zRear], [1.3, .98, zRear + .2]));
    for (const sx of [-1, 1]) {
      P.push(box([sx * .95, .78, zRear - .05], [sx * 1.25, .95, zRear], fn()));
      for (let k = 0; k < 3; k++) P.push(circle([sx * (1.0 + k * .09), .865, zRear - .055], FZ, .035, 8, fn({ w: .6, pts: false })));
    }
    P.push(lathe([0, .85, zRear], [0, 0, -1], [[0, .07], [.2, .07], [.24, .1], [.28, 0]], fn({ n: 10, gen: 0, rings: [2] })));
  }

  /* MZKT-7930 forward-control cab, rear wall zb, front face zf */
  function mzktCab(P, zb, zf) {
    const hw = 1.5, yF = 1.55, yW = 2.3, yT = 3.2, xc = 1.08, ch = .4;
    // shell: centre block + two side blocks with chamfered front corners (corner windows)
    P.push(prism(-xc, xc, yF, yW, zb, zf, -xc, xc, zb, zf - .03, { skip: [1, 3, 5] }));
    P.push(prism(-xc, xc, yW, yT, zb, zf - .03, -xc + .02, xc - .02, zb + .06, zf - .45, { skip: [3, 5] }));
    for (const sx of [-1, 1]) {
      const a = sx * xc, b = sx * hw, a2 = sx * (xc - .02), b2 = sx * (hw - .08);
      P.push(hex([[a, yF, zb], [b, yF, zb], [b, yF, zf - ch], [a, yF, zf], [a, yW, zb], [b, yW, zb], [b, yW, zf - ch - .03], [a, yW, zf - .03]], { skip: [1, 5] }));
      P.push(hex([[a, yW, zb], [b, yW, zb], [b, yW, zf - ch - .03], [a, yW, zf - .03], [a2, yT, zb + .06], [b2, yT, zb + .06], [b2, yT, zf - ch - .5], [a2, yT, zf - .45]], { skip: [5] }));
      // corner window on the chamfer
      const cq = (u, f) => { const x = mix(a, b, u), z0 = mix(zf - .03, zf - ch - .03, u), z1 = mix(zf - .45, zf - ch - .5, u); return [mix(x, mix(a2, b2, u), f) + sx * .01, yW + (yT - yW) * f, mix(z0, z1, f) + .012]; };
      P.push(panel([cq(.15, .12), cq(.85, .12), cq(.85, .84), cq(.15, .84)], { edge: .85, pts: false }));
    }
    P.push(box([-.93, 1.02, zb + .25], [.93, yF, zf - .06]));
    // raked split windscreen on the greenhouse front
    const fp = (x, f) => [x, yW + (yT - yW) * f, zf - .03 - .42 * f + .012];
    for (const sx of [-1, 1]) {
      const fo = f => sx * (xc - .02 * f - .1);
      P.push(panel([fp(sx * .05, .1), fp(fo(.1), .1), fp(fo(.86), .86), fp(sx * .05, .86)], { edge: .95, pts: false }));
      P.push(line([fp(sx * .35, .14), fp(sx * .95, .7)], fn({ w: .45, pts: false })));             // wiper
      // side window + door (door runs from the sill to the window)
      const sp = (z, f) => [sx * (hw - .08 * f + .012), yW + (yT - yW) * f, z];
      P.push(panel([sp(zb + .45, .12), sp(zf - .75, .12), sp(zf - 1.0, .84), sp(zb + .5, .84)], { edge: .85, pts: false }));
      P.push(panel([[sx * (hw + .006), yF + .05, zb + .38], [sx * (hw + .006), yF + .05, zf - .55], [sx * (hw + .006), yW + .7, zf - .7], [sx * (hw + .006), yW + .7, zb + .38]], { edge: .5, pts: false }));
      P.push(line([[sx * (hw + .02), yW - .12, zf - .95], [sx * (hw + .02), yW - .12, zf - .72]], fn({ w: .7 })));   // handle
      // steps under the door, grab rail
      for (const yy of [.72, 1.12]) P.push(box([sx * 1.05, yy, zb + .55], [sx * 1.47, yy + .06, zb + 1.2], fn()));
      P.push(line([[sx * 1.47, .76, zb + .6], [sx * 1.47, 1.5, zb + .6]], fn({ w: .5 })));
      P.push(line([[sx * (hw + .05), 1.75, zb + .3], [sx * (hw + .05), 2.9, zb + .3]], fn({ w: .6 })));
      // mirror on an arm
      const m0 = [sx * (hw - .05), 2.95, zf - ch - .45], m1 = [sx * 1.86, 3.0, zf - .3];
      P.push(line([m0, m1, [sx * 1.86, 2.45, zf - .3]], { w: .7, pts: false }));
      P.push(box([sx * 1.8, 2.5, zf - .36], [sx * 1.93, 2.98, zf - .3], fn()));
      // headlamp + indicator in the bumper
      P.push(circle([sx * 1.18, 1.18, zf + .185], FZ, .11, 14, { w: .85, pts: false }));
      P.push(circle([sx * 1.18, 1.18, zf + .19], FZ, .06, 10, fn({ w: .5, pts: false })));
      P.push(box([sx * .78, 1.12, zf + .17], [sx * .95, 1.24, zf + .2], fn()));
      P.push(box([sx * .25, .98, zf + .14], [sx * .42, 1.08, zf + .34], fn()));                  // tow hook
      // roof marker lamps
      P.push(box([sx * .55, yT, zf - .62], [sx * .7, yT + .08, zf - .5], fn()));
    }
    P.push(line([fp(0, .1), fp(0, .86)], { w: .9, pts: false }));
    // grille (slats) + badge plate, bumper
    P.push(panel([[-.9, 1.68, zf + .012], [.9, 1.68, zf + .012], [.9, 2.2, zf + .012], [-.9, 2.2, zf + .012]], { hatch: 6, edge: .9, pts: false }));
    P.push(box([-1.55, 1.02, zf - .1], [1.55, 1.36, zf + .18]));
    // roof: hatch, beacon, whip antenna
    P.push(panel([[-.35, yT + .005, zb + .5], [.35, yT + .005, zb + .5], [.35, yT + .005, zb + 1.1], [-.35, yT + .005, zb + 1.1]], fn({ pts: false, edge: .6 })));
    P.push(lathe([-.95, yT, zb + .35], FY, [[0, .09], [.05, .09], [.05, .075], [.18, .075], [.24, 0]], { n: 12, gen: 4, rings: [1, 3] }));
    P.push(lathe([1.2, yT, zb + .2], FY, [[0, .05], [.12, .03]], fn({ n: 8, gen: 0, rings: [0] })));
    P.push(line([[1.2, yT + .12, zb + .2], [1.19, yT + 1.2, zb + .15], [1.16, yT + 2.3, zb + .04], [1.12, yT + 3.1, zb - .12]], { w: .6 }));
  }

  /* power pack behind the MZKT cab: grilles, radiator fans (turn with fan), exhaust, air cleaner */
  function engineBay(P, zb, zf) {
    P.push(box([-1.36, 1.45, zb], [1.36, 2.95, zf]));
    for (const sx of [-1, 1]) {
      P.push(panel([[sx * 1.365, 1.62, zb + .12], [sx * 1.365, 1.62, zf - .12], [sx * 1.365, 2.78, zf - .12], [sx * 1.365, 2.78, zb + .12]], { hatch: 0, edge: .6, pts: false }));
      P.push(circle([sx * 1.37, 2.2, (zb + zf) / 2], [sx, 0, 0], .43, 28, { w: .8, pts: false }));
      P.push(circle([sx * 1.37, 2.2, (zb + zf) / 2], [sx, 0, 0], .1, 12, fn({ w: .6, pts: false })));
      for (const a of [0, PI / 2]) {
        const u = [0, Math.cos(a), Math.sin(a)], c = [sx * 1.372, 2.2, (zb + zf) / 2];
        P.push(line([V.mad(c, u, -.43), V.mad(c, u, -.1)], fn({ w: .5, pts: false })), line([V.mad(c, u, .1), V.mad(c, u, .43)], fn({ w: .5, pts: false })));
      }
    }
    P.push(panel([[-1.1, 2.955, zb + .15], [1.1, 2.955, zb + .15], [1.1, 2.955, zf - .15], [-1.1, 2.955, zf - .15]], { hatch2: 9, edge: .6, pts: false }));
    // exhaust stack with a slash-cut tip, heat shield
    P.push(lathe([1.18, 2.4, zb + .2], FY, [[0, .1], [1.25, .1], [1.3, .115]], { n: 12, gen: 2, rings: [0, 2] }));
    P.push(line([[1.063, 3.72, zb + .2], [1.295, 3.56, zb + .2]], fn({ w: .6 })));
    P.push(box([1.05, 2.6, zb + .02], [1.31, 3.3, zb + .07], fn()));
    // air cleaner drum on the left
    P.push(lathe([-1.1, 2.95, zb + .45], FY, [[0, .22], [.55, .22], [.6, .12], [.66, .12]], { n: 16, gen: 4, rings: [0, 1, 3] }));
  }
  function engineFans(zb, zf, rot) {
    const out = [];
    for (const sx of [-1, 1]) out.push(blades([sx * 1.35, 2.2, (zb + zf) / 2], [sx, 0, 0], 7, .1, .4, { rot: rot * sx, chord: .5, taper: .8, pitch: .35, hub: true, edge: .8, pts: false, fine: true }));
    return out;
  }

  /* ================= K340P Bastion-P TEL on MZKT-7930 =================
     state: elev (rad, 0 stowed .. ~1.53 vertical), dep (0..1 jacks, default 1), capL, capR
     (0 fitted .. 1 gone), wheel (rad), fan (rad). Launcher rotates about PIV (local X). */
  const TEL_PIV = [0, 1.55, -6.7], TEL_TUBE = [.66, 2.5, -6.6], TEL_TUBE_LEN = 9.25;
  const TEL_AX = [4.45, 2.25, -2.75, -4.95];
  const RAM_B = [0, 1.36, 2.45], RAM_A = [0, 1.5, -2.5];         // RAM_A in launcher space
  const JACKS = [[1.66, 1.15], [1.7, -6.5]];                        // |x|, z
  const JACK_TRAVEL = .55, JACK_H0 = .76;                          // housing bottom
  function telChassis() {
    const C = [];
    chassis8x8(C, 6.2, -6.9, { axles: TEL_AX, open: true, deckFront: 2.95, fenders: [[1.42, 2.95, false, true], [-5.78, -1.9, true, true]] });
    engineBay(C, 2.95, 4.1);
    // fuel tank (left), battery + tool boxes (right), air tanks
    C.push(lathe([-1.2, .98, -1.78], FZ, [[0, .2], [.05, .3], [2.2, .3], [2.25, .2]], { n: 18, gen: 4, rings: [1, 2], caps: true }));
    for (const z of [-1.3, -.1]) C.push(ring([-1.2, .98, z], FZ, .31, fn({ n: 18 })));
    C.push(lathe([-1.2, 1.28, -.55], FY, [[0, .06], [.1, .04]], fn({ n: 8, gen: 0, rings: [0, 1] })));
    C.push(box([.9, .62, -.95], [1.48, 1.3, .55]));
    C.push(panel([[1.485, .72, -.85], [1.485, .72, .45], [1.485, 1.2, .45], [1.485, 1.2, -.85]], { hatch2: 4, edge: .5, pts: false }));
    C.push(box([.9, .7, -1.85], [1.46, 1.25, -1.1]));
    C.push(line([[1.465, 1.1, -1.7], [1.465, 1.1, -1.25]], fn({ w: .7 })));
    for (const z of [-3.65, -4.3]) C.push(lathe([.95, .9, z], [1, 0, 0], [[0, .15], [.5, .15]], fn({ n: 10, gen: 0, rings: [0, 1], caps: true })));
    // outrigger beams + jack housings
    for (const [x, z] of JACKS) for (const sx of [-1, 1]) {
      C.push(box([sx * .8, 1.14, z - .16], [sx * (x - .08), 1.4, z + .16]));
      C.push(lathe([sx * x, JACK_H0, z], FY, [[0, .15], [.08, .15], [.08, .13], [.76, .13], [.8, .15], [.84, .15]], { n: 12, gen: 2, rings: [0, 1, 4, 5], caps: true }));
      C.push(line([[sx * (x - .13), 1.0, z], [sx * .82, 1.2, z]], fn({ w: .5 })));               // hydraulic line
    }
    // launcher hinge brackets + pin, ram base trunnion bracket
    for (const sx of [-1, 1]) for (const x0 of [.28, .88]) C.push(prism(sx * x0, sx * (x0 + .16), 1.0, 1.72, -7.0, -6.35, sx * x0, sx * (x0 + .16), -6.86, -6.54));
    C.push(cyl([-1.12, TEL_PIV[1], TEL_PIV[2]], [1.12, TEL_PIV[1], TEL_PIV[2]], .085, { n: 10, gen: 0, caps: true }));
    for (const sx of [-1, 1]) C.push(box([sx * .22, 1.12, RAM_B[2] - .28], [sx * .38, 1.56, RAM_B[2] + .28]));
    C.push(cyl([-.4, RAM_B[1], RAM_B[2]], [.4, RAM_B[1], RAM_B[2]], .08, { n: 10, gen: 0 }));
    // cable trays + hydraulic lines along the deck, rear ladder
    C.push(box([1.08, 1.45, -6.2], [1.2, 1.52, 2.8], fn()));
    C.push(line([[-1.02, 1.47, 2.8], [-1.02, 1.47, -6.3], [-.9, 1.3, -6.6]], fn({ w: .5 })));
    for (const x of [-1.2, -.85]) C.push(line([[x, .38, -6.95], [x, 1.42, -6.95]], fn({ w: .6 })));
    for (let k = 0; k < 4; k++) C.push(line([[-1.2, .5 + k * .27, -6.95], [-.85, .5 + k * .27, -6.95]], fn({ w: .5 })));
    return C;
  }
  function telLauncher() {
    const L = [];
    const ty = TEL_TUBE[1], z0 = -6.7, z1 = TEL_TUBE[2] + TEL_TUBE_LEN;          // rear closure face .. mouth (2.65)
    const len = z1 - z0;
    for (const sx of [-1, 1]) {
      const x = sx * TEL_TUBE[0];
      // container shell with end flanges
      L.push(lathe([x, ty, z0], FZ, [[0, .545], [.12, .545], [.12, .5], [len - .11, .5], [len - .11, .545], [len, .545]], { n: 26, gen: 4, rings: [0, 1, 4, 5], caps: true, al: .95 }));
      // stiffening bands
      for (let k = 1; k <= 7; k++) L.push(lathe([x, ty, z0 + k * len / 8 - .05], FZ, [[0, .5], [.02, .522], [.08, .522], [.1, .5]], { n: 26, gen: 0, rings: [1], ds: 1.5 }));
      // rear closure: gas-generator boss + ribs
      L.push(lathe([x, ty, z0], [0, 0, -1], [[0, .3], [.07, .3], [.1, .18], [.1, 0]], { n: 16, gen: 0, rings: [0, 1, 2], caps: true }));
      L.push(blades([x, ty, z0 - .005], [0, 0, -1], 6, .3, .5, { chord: .1, taper: .6, edge: .45, pts: false, fine: true }));
      // cable tray on the outer upper quarter, lifting lugs, umbilical box
      L.push(box([sx * .98, ty + .33, z0 + .5], [sx * 1.1, ty + .43, z1 - .5]));
      for (const z of [z0 + 1.6, z1 - 3.2]) {
        L.push(prism(x - .07, x + .07, ty + .49, ty + .64, z - .12, z + .12, x - .07, x + .07, z - .06, z + .06, fn()));
        L.push(ring([x, ty + .6, z], FX, .045, fn({ n: 8 })));
      }
      L.push(box([x - .16, ty + .45, z0 + .35], [x + .16, ty + .62, z0 + .8], fn()));
      // clamp straps with tensioners over saddles on the cross members
      for (const z of [-4.6, -.4, 1.75]) {
        L.push(lathe([x, ty, z - .045], FZ, [[0, .535], [.09, .535]], { n: 26, gen: 0, rings: [0, 1], pts: false }));
        L.push(box([x + sx * .5, ty - .12, z - .02], [x + sx * .6, ty + .08, z + .08], fn()));
        const arc = [[x - .53, 1.95, z]];
        for (let k = 0; k <= 8; k++) { const a = (200 + k * 17.5) * DEG; arc.push([x + Math.cos(a) * .56, ty + Math.sin(a) * .56, z]); }
        arc.push([x + .53, 1.95, z]);
        L.push(line(arc, { w: .8 }));
      }
      // main side beam of the erector frame
      L.push(box([sx * .9, 1.6, z0 - .2], [sx * 1.08, 1.95, z1 - .5]));
    }
    for (const z of [-6.55, -4.6, -2.5, -.4, 1.75]) L.push(box([-1.08, 1.6, z - .09], [1.08, 1.95, z + .09]));
    // rear hinge lugs around the pin, ram eye lug on the -2.5 cross member
    for (const sx of [-1, 1]) for (const x0 of [.46, .7]) L.push(prism(sx * x0, sx * (x0 + .14), 1.35, 1.95, -6.9, -6.5, sx * x0, sx * (x0 + .14), -6.9, -6.5));
    for (const sx of [-1, 1]) L.push(box([sx * .1, RAM_A[1] - .14, RAM_A[2] - .2], [sx * .2, 1.62, RAM_A[2] + .2]));
    // connector boxes between the containers at the rear, top walkway rail
    L.push(box([-.18, 2.4, -6.5], [.18, 2.9, -5.6], fn()));
    return L;
  }
  function telCap(side) {
    const x = side * TEL_TUBE[0], y = TEL_TUBE[1], z = TEL_TUBE[2] + TEL_TUBE_LEN;
    return [
      lathe([x, y, z], FZ, [[0, .548], [.055, .548], [.085, .51], [.12, .3], [.13, 0]], { n: 28, gen: 0, rings: [0, 1, 2], caps: true, sil: false }),
      lathe([x, y, z + .122], FZ, [[0, .055], [.05, .055], [.07, .03]], fn({ n: 10, gen: 0, rings: [1, 2] })),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = (k + .5) / 8 * 2 * PI, c = Math.cos(a), s = Math.sin(a); return line([[x + c * .19, y + s * .19, z + .124], [x + c * .47, y + s * .47, z + .093]], fn({ w: .45, pts: false })); }),
      blades([x, y, z + .045], FZ, 24, .515, .54, { chord: .12, taper: .625, edge: .6, pts: false, fine: true }),
      circle([x, y, z + .088], FZ, .49, 36, { w: .55, pts: false }),
      circle([x, y, z + .124], FZ, .16, 16, fn({ w: .5, pts: false })),
      line([[x - .12, y + .3, z + .105], [x - .12, y + .38, z + .09], [x + .12, y + .38, z + .09], [x + .12, y + .3, z + .105]], fn({ w: .6 })),
    ];
  }
  function telJacks(st) {
    const dep = st.dep === undefined ? 1 : st.dep, lift = JACK_TRAVEL * (1 - dep), out = [];
    for (const [x, z] of JACKS) for (const sx of [-1, 1]) {
      const X0 = sx * x;
      out.push(box([X0 - .3, 0, z - .3], [X0 + .3, .07, z + .3]));
      out.push(lathe([X0, .07, z], FY, [[0, .15], [.08, .06]], { n: 10, gen: 0, rings: [0], fine: true }));
      out.push(cyl([X0, .1, z], [X0, JACK_H0 + .1 - lift, z], .075, { n: 10, gen: 2, rings: [0] }));
    }
    return out;
  }
  function telRam(st) {
    const A = X.ap(X.pivotX(TEL_PIV, -(st.elev || 0)), RAM_A);
    const out = ram(RAM_B, A, [.2, .16, .12], 4.9, { n: 16 });
    out.push(lathe(RAM_B, FX, [[-.2, .17], [.2, .17]], { n: 12, gen: 0, rings: [0, 1] }));
    out.push(lathe(A, FX, [[-.12, .12], [.12, .12]], { n: 10, gen: 0, rings: [0, 1] }));
    const u = V.norm(V.sub(A, RAM_B));
    out.push(line([V.add(RAM_B, [.22, .1, 0]), V.mad(V.add(RAM_B, [.22, .14, 0]), u, 1.2)], fn({ w: .45 })));     // pressure hose
    return out;
  }
  function tel() {
    const C = telChassis(), K = [], L = telLauncher();
    mzktCab(K, 4.1, 6.3);
    const PIV = TEL_PIV;
    const launchX = st => X.pivotX(PIV, -(st.elev || 0));
    const capX = (side, key) => st => {
      const c = st[key] || 0, T = launchX(st);
      if (c <= 0) return T;
      const x = side * TEL_TUBE[0], m = [x, TEL_TUBE[1], TEL_TUBE[2] + TEL_TUBE_LEN];
      const fly = X.make(R.I(), [side * .6 * c * c, .8 * c * c, 3.2 * c]);
      return X.mul(T, X.mul(fly, about(R.mul(R.x(-c * 2.4), R.y(side * c * .9)), m)));
    };
    const fans = st => engineFans(2.95, 4.1, st.fan || 0);
    return {
      PIV, TUBE: TEL_TUBE, TUBE_LEN: TEL_TUBE_LEN, AXLES: TEL_AX,
      parts: [
        { name: 'chassis', label: 'MZKT-7930 Astrolog · 8×8', prims: C },
        { name: 'wheels', label: 'Wheels ×8 · 1500×600-635', prims: wheelSet(TEL_AX, 0), dyn: st => wheelSet(TEL_AX, st.wheel || 0) },
        { name: 'cab', label: 'Cab · crew 3', prims: K },
        { name: 'launcher', label: 'TLC ×2 · 3M55 Oniks', prims: L, xf: launchX },
        { name: 'capL', label: 'TLC front cap · L', prims: telCap(-1), xf: capX(-1, 'capL'), show: st => (st.capL || 0) < 1 },
        { name: 'capR', label: 'TLC front cap · R', prims: telCap(1), xf: capX(1, 'capR'), show: st => (st.capR || 0) < 1 },
        { name: 'ram', label: 'Erector ram · 3-stage hydraulic', prims: telRam({}), dyn: telRam },
        { name: 'jacks', label: 'Outrigger jacks ×4', prims: telJacks({}), dyn: telJacks, xf: st => X.make(R.I(), [0, JACK_TRAVEL * (1 - (st.dep === undefined ? 1 : st.dep)), 0]) },
        { name: 'fans', label: 'Radiator fans ×2', prims: fans({}), dyn: fans },
      ],
    };
  }
  tel.PIV = TEL_PIV; tel.TUBE = TEL_TUBE; tel.TUBE_LEN = TEL_TUBE_LEN;
  /* launch tube base, mouth and axis in model space (side 1 = right tube, -1 = left) */
  function telTube(m, st, side) {
    const piv = (m && m.PIV) || TEL_PIV, tube = (m && m.TUBE) || TEL_TUBE, tl = (m && m.TUBE_LEN) || TEL_TUBE_LEN;
    const T = X.pivotX(piv, -((st && st.elev) || 0)), x = (side || 1) * tube[0];
    const base = X.ap(T, [x, tube[1], tube[2]]), mouth = X.ap(T, [x, tube[1], tube[2] + tl]);
    return { base, mouth, dir: V.norm(V.sub(mouth, base)) };
  }

  /* ================= P-800 Oniks / 3M55 =================
     origin mid-body, nose +Z; 8.9 m from the ramjet nozzle exit (z -4.5) to the tip of the
     intake centre body (z 4.4). state: wing, fin (0 folded .. 1 deployed; default 1),
     booster (bool, default true), cover (bool, default false) */
  const ON = { zT: -4.5, zL: 4.02, zTip: 4.4, rB: .35 };
  function oniks(o) {
    o = o || {};
    const n = o.n || 32, g = o.gen === undefined ? 8 : o.gen, { zT, zL, rB } = ON;
    const B = [], I = [], NZ = [], BO = [], CV = [];
    B.push(lathe([0, 0, zT], FZ, [[0, .305], [.14, .33], [.5, rB], [7.95, rB], [8.34, .34], [zL - zT, .332]], { n, gen: g, rings: [0, 5] }));
    // section joints
    for (const z of [-3.98, -2.3, -.15, 1.85, 3.42]) B.push(ring([0, 0, z], FZ, rB + .004, { n: 28 }));
    // dorsal antenna fairing, side blade antennas, ventral cable duct
    B.push(prism(-.07, .07, rB - .02, rB + .06, 2.05, 3.05, -.05, .05, 2.2, 2.85));
    for (const sx of [-1, 1]) B.push(panel([[sx * rB, .06, .55], [sx * (rB + .1), .09, .42], [sx * (rB + .1), .09, .3], [sx * rB, .06, .3]], fn({ edge: .6 })));
    B.push(prism(-.075, .075, -rB - .055, -rB + .02, -3.2, 3.1, -.075, .075, -3.4, 3.25));
    // access hatches (flat plates on the skin), radio-altimeter antennas, TLC launch shoes
    const hatch = (phi, z, hz, hw) => {
      const e = [Math.cos(phi), Math.sin(phi), 0], t = [-Math.sin(phi), Math.cos(phi), 0], c = V.mul(e, rB + .004);
      const q = (u, v) => V.add(V.add(c, V.mul(t, u)), [0, 0, z + v]);
      return panel([q(-hw, -hz), q(hw, -hz), q(hw, hz), q(-hw, hz)], fn({ edge: .55, pts: false }));
    };
    for (const [phi, z, hz, hw] of [[.55, 2.7, .16, .1], [PI - .55, 2.7, .16, .1], [.4, .95, .12, .08], [PI - .4, -1.25, .2, .09], [.5, -2.9, .14, .09], [PI - .5, -2.9, .14, .09], [-.6, 1.4, .1, .07], [PI + .6, -.6, .1, .07]]) B.push(hatch(phi, z, hz, hw));
    for (const z of [1.1, 1.55]) B.push(hatch(-PI / 2, z, .07, .09));
    for (const z of [-2.6, 1.3]) B.push(prism(-.05, .05, rB - .01, rB + .045, z - .1, z + .1, -.04, .04, z - .07, z + .07, fn()));
    // wing hinge fairings, fin root fairings
    for (const sx of [-1, 1]) B.push(prism(sx * (rB - .03), sx * (rB + .045), -.05, .05, -.72, 1.02, sx * (rB - .03), sx * (rB + .045), -.66, .92));
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0];
      B.push(lathe(V.mad([0, 0, -3.5], e, rB), [0, 0, -1], [[0, .03], [.95, .03]], fn({ n: 6, gen: 0, rings: [], sil: true })));
    }
    // intake: sharp lip, inner duct, conical centre body (seeker radome) protruding .38 m
    I.push(lathe([0, 0, zL], [0, 0, -1], [[0, .334], [.006, .3], [.55, .284]], { n, gen: 0, rings: [0, 1], sil: false, pts: false }));
    I.push(ring([0, 0, zL], FZ, .3, { n }));
    I.push(lathe([0, 0, 3.62], FZ, [[0, .215], [.3, .2], [.48, .165], [.62, .112], [.72, .058], [.78, 0]], { n: 24, gen: 6, rings: [0, 2] }));
    I.push(ring([0, 0, 3.98], FZ, .184, fn({ n: 18 })));
    for (let k = 0; k < 3; k++) { const a = k / 3 * 2 * PI + PI / 2, e = [Math.cos(a), Math.sin(a), 0]; I.push(panel([V.mad([0, 0, 3.7], e, .205), V.mad([0, 0, 3.7], e, .29), V.mad([0, 0, 3.95], e, .29), V.mad([0, 0, 3.95], e, .19)], fn({ edge: .45 }))); }
    // ramjet exit: short divergent bell, flame-holder gutters visible inside
    NZ.push(lathe([0, 0, zT], FZ, [[0, .305], [.02, .29], [.3, .238], [.55, .216]], { n: 26, gen: 6, rings: [0, 1, 3], sil: false }));
    NZ.push(ring([0, 0, -3.6], FZ, .205, fn({ n: 20, al: .6 })));
    NZ.push(blades([0, 0, -3.62], FZ, 8, .07, .2, { chord: .2, taper: 1.3, edge: .45, pts: false, fine: true, al: .7 }));
    // booster nozzle protruding from the ramjet exit
    BO.push(lathe([0, 0, -3.9], [0, 0, -1], [[0, .16], [.45, .13], [.6, .12], [.95, .215]], { n: 22, gen: 6, rings: [2, 3] }));
    BO.push(ring([0, 0, -4.85], FZ, .225, { n: 22 }));
    // intake cover (jettisoned at launch)
    CV.push(lathe([0, 0, 3.82], FZ, [[0, .362], [.25, .362], [.45, .332], [.62, .25], [.74, .13], [.8, 0]], { n: 26, gen: 6, rings: [0, 1, 3], caps: true }));
    CV.push(ring([0, 0, 3.88], FZ, .366, fn({ n: 26 })));
    const wingP = sx => [[sx * rB, 0, .95], [sx * .88, 0, -.15], [sx * .88, 0, -.62], [sx * rB, 0, -.62]];
    const wings = st => {
      const w = st.wing === undefined ? 1 : st.wing, out = [];
      for (const sx of [-1, 1]) {
        const T = about(R.z(sx * (1 - w) * 1.75), [sx * rB, 0, 0]);
        out.push(tp(T, panel(wingP(sx), { hatch2: 3, edge: 1 })));
        out.push(tp(T, line([[sx * (rB + .04), 0, .86], [sx * .86, 0, -.13]], fn({ w: .35, pts: false }))));
      }
      return out;
    };
    const fins = st => {
      const f = st.fin === undefined ? 1 : st.fin, out = [];
      for (const deg of [45, 135, 225, 315]) {
        const a = deg * DEG, c = Math.cos(a), s = Math.sin(a), at = (r, z) => [c * r, s * r, z];
        const T = about(R.z(-(1 - f) * PI / 2), at(rB, 0));
        out.push(tp(T, panel([at(rB, -3.52), at(.82, -4.05), at(.82, -4.42), at(rB, -4.42)], { hatch2: 2, edge: 1 })));
        out.push(tp(T, line([at(rB + .03, -4.3), at(.8, -4.3)], fn({ w: .3, pts: false }))));
      }
      return out;
    };
    return {
      NOZZLE: ONIKS_NOZZLE, NOZZLE_R: .3, INTAKE: [0, 0, zL], LEN: 8.9,
      parts: [
        { name: 'body', label: 'P-800 Oniks · 3M55', prims: B },
        { name: 'intake', label: 'Annular intake · seeker radome', prims: I },
        { name: 'wings', label: 'Wings ×2 · folding', prims: wings({}), dyn: wings },
        { name: 'fins', label: 'Tail fins ×4 · folding', prims: fins({}), dyn: fins },
        { name: 'nozzle', label: 'Ramjet nozzle', prims: NZ },
        { name: 'booster', label: 'Solid booster · in chamber', prims: BO, show: st => st.booster !== false },
        { name: 'cover', label: 'Intake cover', prims: CV, show: st => !!st.cover },
      ],
    };
  }
  const ONIKS_NOZZLE = [0, 0, -4.5];
  Object.assign(oniks, { NOZZLE: ONIKS_NOZZLE, NOZZLE_R: .3, INTAKE: [0, 0, ON.zL], LEN: 8.9, TIP: [0, 0, ON.zTip], BNOZZLE: [0, 0, -4.85], BNOZZLE_R: .215, R: ON.rB });

  /* ejected booster casing: origin its middle, +Z its front, nozzle exit at NOZZLE */
  function oniksBooster() {
    const C = [], N = [];
    C.push(lathe([0, 0, -1.02], FZ, [[0, .19], [.06, .245], [2.12, .245], [2.28, .16], [2.36, 0]], { n: 24, gen: 6, rings: [1, 2, 3], caps: true }));
    for (const z of [-.2, .6]) C.push(ring([0, 0, z], FZ, .249, fn({ n: 22 })));
    N.push(lathe([0, 0, -1.02], [0, 0, -1], [[0, .16], [.12, .12], [.2, .12], [.48, .215]], { n: 20, gen: 6, rings: [1, 3] }));
    N.push(ring([0, 0, -1.5], FZ, .22, { n: 20 }));
    return { NOZZLE: [0, 0, -1.5], parts: [{ name: 'casing', label: 'Booster casing · spent', prims: C }, { name: 'nozzle', label: 'Booster nozzle', prims: N }] };
  }
  oniksBooster.NOZZLE = [0, 0, -1.5];

  /* ================= Monolith-B coastal radar on MZKT-7930 =================
     state: ant (rad, array azimuth), mast (0 stowed .. 1 raised, default 1), fan (rad) */
  const RAD_MZ = -5.1, RAD_ARRAY = [0, 11.2, -5.3];
  const mastTop = u => mix(3.45, 10.5, ss(0, .6, u));
  function radarPose(st) {
    const u = st.mast === undefined ? 1 : st.mast, k = ss(.55, 1, u);
    const tilt = mix(90, 14, k) * DEG, yaw = PI / 2 + wrapPi((st.ant || 0) - PI / 2) * k;
    return { u, top: mastTop(u), tilt, yaw };
  }
  function radarArrayX(st) {
    const p = radarPose(st);
    return X.mul(X.make(R.y(p.yaw), [0, p.top + .7, RAD_MZ]), X.make(R.x(-p.tilt), [0, 0, -.2]));
  }
  function radarArray() {
    const A = [];
    A.push(box([-2.5, -.85, -.12], [2.5, .85, .06]));
    A.push(panel([[-2.38, -.72, .066], [2.38, -.72, .066], [2.38, .72, .066], [-2.38, .72, .066]], { hatch: 8, edge: .55, pts: false }));
    A.push(panel([[-2.38, -.72, .066], [2.38, -.72, .066], [2.38, .72, .066], [-2.38, .72, .066]], fn({ hatch2: 8, edge: 0, pts: false, al: .6 })));
    for (let k = 0; k < 8; k++) { const y = -.72 + (k + .5) * 1.44 / 8; A.push(comb([0, y - .03, .07], FX, FY, 4.6, 14, .06, fn({ w: .28, pts: false }))); }
    // IFF strip along the top edge, feed manifold under the bottom edge
    A.push(box([-2.1, .87, -.07], [2.1, 1.08, .04]));
    A.push(panel([[-2.05, .9, .042], [2.05, .9, .042], [2.05, 1.05, .042], [-2.05, 1.05, .042]], fn({ hatch2: 12, edge: 0, pts: false })));
    A.push(cyl([-2.3, -.97, -.04], [2.3, -.97, -.04], .055, { n: 8, gen: 0, caps: true }));
    for (let k = 0; k < 6; k++) { const x = -2 + k * .8; A.push(line([[x, -.92, -.04], [x, -.86, -.04]], fn({ w: .5 }))); }
    // back truss: two chords, diagonal web, central gearbox + trunnion
    for (const y of [-.5, .5]) A.push(box([-2.3, y - .06, -.34], [2.3, y + .06, -.12]));
    { const p = []; for (let k = 0; k <= 12; k++) p.push([-2.3 + k * 4.6 / 12, k % 2 ? .5 : -.5, -.23]); A.push(line(p, { w: .55 })); }
    for (const x of [-2.3, -1.15, 0, 1.15, 2.3]) A.push(line([[x, -.72, -.12], [x, .72, -.12]], fn({ w: .4 })));
    A.push(box([-.36, -.36, -.62], [.36, .36, -.12]));
    A.push(cyl([-.5, 0, -.4], [.5, 0, -.4], .09, { n: 10, gen: 0, caps: true }));
    return A;
  }
  function radarMast(st) {
    const p = radarPose(st), top = p.top, out = ram([0, 1.6, RAD_MZ], [0, top, RAD_MZ], [.24, .2, .165, .135, .11], 1.9, { n: 14, gen: 2 });
    out.push(lathe([0, top, RAD_MZ], FY, [[0, .2], [.1, .2], [.1, .27], [.24, .27], [.26, .2]], { n: 16, gen: 0, rings: [0, 2, 3] }));
    out.push(cyl([0, top + .26, RAD_MZ], [0, top + .5, RAD_MZ], .15, { n: 12, gen: 0, rings: [1] }));
    return out;
  }
  function radar() {
    const C = [], K = [], B = [];
    chassis8x8(C, 6.2, -6.9, { axles: TEL_AX, deckFront: 2.95, fenders: [[1.42, 2.95, false, true], [-5.78, -1.9, true, true]] });
    engineBay(C, 2.95, 4.1);
    mzktCab(K, 4.1, 6.3);
    // fuel tank right, cable reels left
    C.push(lathe([1.2, .98, -1.78], FZ, [[0, .2], [.05, .3], [2.2, .3], [2.25, .2]], { n: 18, gen: 4, rings: [1, 2], caps: true }));
    for (const z of [-1.2, .2]) {
      C.push(lathe([-1.08, 1.0, z], [-1, 0, 0], [[0, .36], [.04, .36], [.04, .22], [.36, .22], [.36, .36], [.4, .36]], { n: 18, gen: 0, rings: [0, 1, 4, 5], caps: true }));
      for (let k = 1; k < 5; k++) C.push(ring([-1.08 - k * .064, 1.0, z], FX, .3, fn({ n: 16, al: .6 })));
    }
    // equipment shelter
    const S0 = -6.45, S1 = 2.8, SY = 1.5, ST = 3.4, SX = 1.42;
    B.push(box([-SX, SY, S0], [SX, ST, S1]));
    for (const x of [-SX, SX]) for (const y of [SY + .04, ST - .04]) B.push(line([[x * 1.004, y, S0 + .05], [x * 1.004, y, S1 - .05]], fn({ w: .35 })));
    B.push(panel([[-.55, 1.62, S0 - .01], [.55, 1.62, S0 - .01], [.55, 3.22, S0 - .01], [-.55, 3.22, S0 - .01]], { edge: .8, pts: false }));
    B.push(line([[.42, 2.4, S0 - .03], [.42, 2.6, S0 - .03]], fn({ w: .8 })));
    B.push(panel([[SX + .01, 1.62, -.95], [SX + .01, 1.62, -.05], [SX + .01, 3.22, -.05], [SX + .01, 3.22, -.95]], { edge: .8, pts: false }));
    B.push(line([[SX + .03, 2.4, -.18], [SX + .03, 2.6, -.18]], fn({ w: .8 })));
    for (const z of [1.7, -2.8, -4.6]) B.push(panel([[-SX - .01, 2.72, z - .3], [-SX - .01, 2.72, z + .3], [-SX - .01, 3.12, z + .3], [-SX - .01, 3.12, z - .3]], { hatch: 5, edge: .7, pts: false }));
    for (const z of [1.2, -3.3]) B.push(panel([[SX + .01, 2.72, z - .3], [SX + .01, 2.72, z + .3], [SX + .01, 3.12, z + .3], [SX + .01, 3.12, z - .3]], { hatch: 5, edge: .7, pts: false }));
    // rear ladder
    for (const x of [-.4, .4]) B.push(line([[x, .45, S0 - .12], [x, SY, S0 - .05]], fn({ w: .6 })));
    for (let k = 0; k < 3; k++) B.push(line([[-.4, .6 + k * .3, S0 - .1], [.4, .6 + k * .3, S0 - .1]], fn({ w: .5 })));
    // two roof A/C units with fans, mast base collar, comms whips + GPS dome
    for (const sx of [-1, 1]) {
      B.push(box([sx * .18, ST, 1.25], [sx * 1.25, ST + .45, 2.6]));
      B.push(circle([sx * .715, ST + .455, 1.92], FY, .4, 24, { w: .8, pts: false }));
      B.push(panel([[sx * .19, ST + .06, 2.605], [sx * 1.24, ST + .06, 2.605], [sx * 1.24, ST + .4, 2.605], [sx * .19, ST + .4, 2.605]], fn({ hatch: 4, edge: 0, pts: false })));
    }
    B.push(lathe([0, ST, RAD_MZ], FY, [[0, .42], [.12, .42], [.16, .3]], { n: 18, gen: 0, rings: [0, 1] }));
    for (const [x, z] of [[1.1, -6.1], [-1.1, -6.1]]) B.push(line([[x, ST, z], [x, ST + 2.6, z - .06]], { w: .55 }));
    B.push(lathe([-1.0, ST, -3.6], FY, [[0, .12], [.06, .12], [.12, 0]], fn({ n: 10, gen: 0, rings: [0] })));
    const fans = st => { const out = []; for (const sx of [-1, 1]) out.push(blades([sx * .715, ST + .44, 1.92], FY, 5, .08, .37, { rot: (st.fan || 0) * sx, chord: .7, taper: .7, pitch: .3, hub: true, edge: .75, pts: false, fine: true })); return out; };
    const efans = st => engineFans(2.95, 4.1, st.fan || 0);
    const AR = radarArray();
    return {
      ARRAY: RAD_ARRAY, MAST: [0, 0, RAD_MZ],
      parts: [
        { name: 'chassis', label: 'MZKT-7930 · 8×8', prims: C },
        { name: 'wheels', label: 'Wheels ×8 · 1500×600-635', prims: wheelSet(TEL_AX, 0), dyn: st => wheelSet(TEL_AX, st.wheel || 0) },
        { name: 'cab', label: 'Cab · crew 3', prims: K },
        { name: 'body', label: 'Equipment shelter', prims: B },
        { name: 'mast', label: 'Telescopic mast · 5 sections', prims: radarMast({}), dyn: radarMast },
        { name: 'array', label: 'Monolith-B · active array', prims: AR, xf: radarArrayX },
        { name: 'fans', label: 'Radiator + A/C fans', prims: fans({}).concat(efans({})), dyn: st => fans(st).concat(efans(st)) },
      ],
    };
  }
  radar.ARRAY = RAD_ARRAY;
  radar.arrayX = radarArrayX;

  /* ================= Pantsir-S1 on KamAZ-6560 =================
     state: yaw (turret, rad, + = to the right), pitch (guns + packs, rad up), sAnt (search
     radar, rad, relative to the turret), fire (0..1 recoil pulse), wheel (rad) */
  const PZ_AX = [3.9, 2.1, -1.9, -3.3], PZ_RING = [0, 2.5, -2.0], PZ_PIV = [0, .85, -.1], PZ_SR = [0, 1.35, -.72];
  const PZ_TUBES = [], PZ_BARRELS = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) PZ_TUBES.push([sx * (1.0 + j * .19), .76 + i * .2, sx]);
    for (const bx of [1.0, 1.16]) PZ_BARRELS.push([sx * bx, .44]);
  }
  const PZ_TUBE_Z = [-1.5, 1.7], PZ_MUZZLE_Z = 2.92;
  const pzTurretX = st => X.make(R.y(st.yaw || 0), PZ_RING);
  const pzPitchX = st => X.mul(pzTurretX(st), about(R.x(-(st.pitch || 0)), PZ_PIV));
  function kamazCab(P, zb, zf) {
    const hw = 1.25, yF = 1.3, yW = 2.2, yT = 3.2;
    P.push(prism(-hw, hw, yF, yW, zb, zf, -hw, hw, zb, zf));
    P.push(box([-.78, .98, zb + .2], [.78, yF, zf - .05]));
    P.push(prism(-hw, hw, yW, yT, zb, zf, -hw + .05, hw - .05, zb + .04, zf - .22));
    const fp = (x, f) => [x, yW + (yT - yW) * f, zf - .22 * f + .012];
    for (const sx of [-1, 1]) {
      const fo = f => sx * (hw - .05 * f - .1);
      P.push(panel([fp(sx * .04, .08), fp(fo(.08), .08), fp(fo(.9), .9), fp(sx * .04, .9)], { edge: .95, pts: false }));
      P.push(line([fp(sx * .3, .12), fp(sx * .85, .62)], fn({ w: .45, pts: false })));
      const sp = (z, f) => [sx * (hw - .05 * f + .012), yW + (yT - yW) * f, z];
      P.push(panel([sp(zb + .95, .1), sp(zf - .2, .1), sp(zf - .28, .86), sp(zb + 1.0, .86)], { edge: .85, pts: false }));
      P.push(panel([[sx * (hw + .006), yF + .05, zb + .9], [sx * (hw + .006), yF + .05, zf - .12], [sx * (hw + .006), yT - .1, zf - .2], [sx * (hw + .006), yT - .1, zb + .9]], { edge: .5, pts: false }));
      P.push(line([[sx * (hw + .02), yW - .1, zb + 1.05], [sx * (hw + .02), yW - .1, zb + 1.28]], fn({ w: .7 })));
      for (const yy of [.62, .98]) P.push(box([sx * .8, yy, zf - 1.05], [sx * 1.22, yy + .06, zf - .45], fn()));
      const m0 = [sx * (hw - .02), 2.9, zf - .08], m1 = [sx * 1.6, 2.95, zf + .05];
      P.push(line([m0, m1, [sx * 1.6, 2.45, zf + .05]], { w: .7, pts: false }));
      P.push(box([sx * 1.55, 2.48, zf], [sx * 1.66, 2.92, zf + .06], fn()));
      P.push(circle([sx * .95, 1.02, zf + .205], FZ, .1, 14, { w: .85, pts: false }));
      P.push(circle([sx * .95, 1.02, zf + .21], FZ, .055, 10, fn({ w: .5, pts: false })));
      P.push(box([sx * .6, .97, zf + .19], [sx * .75, 1.07, zf + .21], fn()));
    }
    P.push(line([fp(0, .08), fp(0, .9)], { w: .9, pts: false }));
    P.push(panel([[-.85, 1.5, zf + .012], [.85, 1.5, zf + .012], [.85, 2.1, zf + .012], [-.85, 2.1, zf + .012]], { hatch: 7, edge: .9, pts: false }));
    P.push(box([-1.28, .85, zf - .05], [1.28, 1.2, zf + .2]));
    // sun visor / air deflector, roof marker lamps, whip
    P.push(panel([[-hw + .05, yT, zf - .22], [hw - .05, yT, zf - .22], [hw - .05, yT + .12, zf - .02], [-hw + .05, yT + .12, zf - .02]], { edge: .7, pts: false }));
    for (const x of [-.6, -.2, .2, .6]) P.push(box([x - .06, yT, zf - .35], [x + .06, yT + .07, zf - .27], fn()));
    P.push(line([[1.05, yT, zb + .2], [1.04, yT + 1.4, zb + .12], [1.0, yT + 2.6, zb - .05]], { w: .6 }));
  }
  function pantsirTurret() {
    const T = [];
    T.push(lathe([0, 0, 0], FY, [[0, 1.02], [.18, 1.02], [.18, .95]], { n: 30, gen: 0, rings: [0, 1] }));
    T.push(prism(-.82, .82, .18, 1.35, -1.3, .86, -.72, .72, -1.12, .6));
    T.push(box([-.7, .3, -1.62], [.7, 1.12, -1.3]));
    for (const sx of [-1, 1]) {
      T.push(panel([[sx * .83, .3, -1.1], [sx * .83, .3, .3], [sx * .79, 1.1, .2], [sx * .79, 1.1, -1.0]], { edge: .5, pts: false }));
      T.push(lathe([sx * .78, PZ_PIV[1], PZ_PIV[2]], [sx, 0, 0], [[0, .24], [.08, .24], [.1, .2]], { n: 18, gen: 0, rings: [0, 1, 2], caps: true }));
    }
    T.push(panel([[-.4, 1.355, -.2], [.4, 1.355, -.2], [.4, 1.355, .35], [-.4, 1.355, .35]], fn({ edge: .6, pts: false })));
    T.push(line([[-.6, 1.36, -1.05], [-.6, 1.36, .5]], fn({ w: .5 })), line([[.6, 1.36, -1.05], [.6, 1.36, .5]], fn({ w: .5 })));
    // rear bustle louvres
    T.push(panel([[-.6, .45, -1.625], [.6, .45, -1.625], [.6, 1.0, -1.625], [-.6, 1.0, -1.625]], { hatch: 5, edge: .6, pts: false }));
    return T;
  }
  function pantsirGuns(st) {
    const G = [], rec = -.14 * Math.sin(PI * sat(st.fire || 0));
    for (const sx of [-1, 1]) {
      G.push(box([sx * .9, .3, -1.0], [sx * 1.28, .58, .45]));
      G.push(line([[sx * 1.1, .58, -.6], [sx * 1.1, .72, -.9], [sx * .95, .74, -1.2]], fn({ w: .5 })));            // feed chute
    }
    for (const [bx, by] of PZ_BARRELS) {
      G.push(lathe([bx, by, .45], FZ, [[0, .065], [.7, .06]], { n: 10, gen: 2, rings: [0, 1] }));
      G.push(lathe([bx, by, 1.15 + rec], FZ, [[0, .032], [PZ_MUZZLE_Z - 1.15 - .17, .028], [PZ_MUZZLE_Z - 1.15 - .17, .044], [PZ_MUZZLE_Z - 1.15, .044]], { n: 8, gen: 0, rings: [2, 3] }));
    }
    return G;
  }
  function pantsirMissiles() {
    const M = [];
    for (const [x, y] of PZ_TUBES) {
      M.push(lathe([x, y, PZ_TUBE_Z[0]], FZ, [[0, .09], [PZ_TUBE_Z[1] - PZ_TUBE_Z[0], .09]], { n: 12, gen: 0, rings: [0, 1], caps: true }));
      M.push(line([[x - .06, y - .06, PZ_TUBE_Z[1] + .005], [x + .06, y + .06, PZ_TUBE_Z[1] + .005]], fn({ w: .45, pts: false })));
      M.push(line([[x - .06, y + .06, PZ_TUBE_Z[1] + .005], [x + .06, y - .06, PZ_TUBE_Z[1] + .005]], fn({ w: .45, pts: false })));
    }
    for (const sx of [-1, 1]) {
      for (const z of [-1.2, .05, 1.3]) M.push(box([sx * .88, .64, z], [sx * 1.52, 1.08, z + .1]));
      M.push(box([sx * .86, .26, -1.05], [sx * .9, 1.1, .55]));
      M.push(lathe([sx * .86, PZ_PIV[1], PZ_PIV[2]], [-sx, 0, 0], [[0, .16], [.06, .16]], { n: 14, gen: 0, rings: [0, 1], fine: true }));
    }
    return M;
  }
  function pantsirSearch() {
    const S = [], tilt = 14 * DEG, c = Math.cos(tilt), s = Math.sin(tilt);
    const P = (x, y, z) => [x, .62 + y * c - z * s, .05 - y * s - z * c];
    S.push(lathe([0, 0, 0], FY, [[0, .2], [.22, .16], [.32, .16]], { n: 14, gen: 0, rings: [0, 1, 2] }));
    S.push(hex([P(-.98, -.4, 0), P(.98, -.4, 0), P(.98, -.4, .14), P(-.98, -.4, .14), P(-.98, .4, 0), P(.98, .4, 0), P(.98, .4, .14), P(-.98, .4, .14)]));
    S.push(panel([P(-.9, -.33, -.005), P(.9, -.33, -.005), P(.9, .33, -.005), P(-.9, .33, -.005)], { hatch: 5, edge: .55, pts: false }));
    S.push(panel([P(-.9, -.33, -.005), P(.9, -.33, -.005), P(.9, .33, -.005), P(-.9, .33, -.005)], fn({ hatch2: 6, edge: 0, pts: false, al: .6 })));
    S.push(hex([P(-.8, .42, .02), P(.8, .42, .02), P(.8, .42, .1), P(-.8, .42, .1), P(-.8, .54, .02), P(.8, .54, .02), P(.8, .54, .1), P(-.8, .54, .1)]));
    S.push(line([[0, .32, 0], P(0, -.2, .14), P(0, .3, .14)], { w: .6 }));
    return S;
  }
  function pantsirTrack() {
    const K = [], t = 8 * DEG, d = [0, Math.sin(t), Math.cos(t)], c = [0, .8, .74];
    K.push(lathe(c, d, [[0, .5], [.12, .5], [.16, .46]], { n: 28, gen: 0, rings: [0, 1, 2], caps: true }));
    const f = V.mad(c, d, .165);
    K.push(circle(f, d, .455, 32, { w: .9, pts: false }));
    K.push(circle(f, d, .3, 24, fn({ w: .45, pts: false })));
    K.push(circle(f, d, .12, 12, fn({ w: .5, pts: false })));
    const [U, W] = GEO.perp(d);
    for (const q of [-.3, 0, .3]) {
      const h = Math.sqrt(.455 * .455 - q * q);
      K.push(line([V.add(f, V.add(V.mul(U, q), V.mul(W, -h))), V.add(f, V.add(V.mul(U, q), V.mul(W, h)))], fn({ w: .35, pts: false })));
      K.push(line([V.add(f, V.add(V.mul(W, q), V.mul(U, -h))), V.add(f, V.add(V.mul(W, q), V.mul(U, h)))], fn({ w: .35, pts: false })));
    }
    return K;
  }
  function pantsirEO() {
    const E = [];
    E.push(box([.3, 1.35, .1], [.62, 1.64, .58]));
    E.push(box([.34, 1.62, .45], [.58, 1.66, .66], fn()));
    E.push(circle([.46, 1.5, .585], FZ, .1, 16, { w: .9, pts: false }));
    E.push(circle([.46, 1.5, .587], FZ, .05, 10, fn({ w: .6, pts: false })));
    E.push(circle([.38, 1.42, .585], FZ, .03, 8, fn({ w: .6, pts: false })));
    return E;
  }
  function pantsir() {
    const C = [], K = [];
    chassis8x8(C, 5.35, -5.1, { axles: PZ_AX, r: .62, x: .85, w: .42, halfW: 1.25, deckY: 1.3, railY: [.72, 1.12], deckFront: 3.1,
      fenders: [[1.26, 3.1, false, true], [-4.08, -1.14, true, true]] });
    kamazCab(K, 3.15, 5.35);
    // equipment body: hatches, louvres, turbine exhaust, handrails
    C.push(box([-1.25, 1.3, -5.1], [1.25, 2.5, 3.05]));
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of [[.6, 2.7], [-1.1, .4], [-4.8, -3.0]]) C.push(panel([[sx * 1.255, 1.42, z0], [sx * 1.255, 1.42, z1], [sx * 1.255, 2.38, z1], [sx * 1.255, 2.38, z0]], { edge: .6, pts: false }));
      C.push(panel([[sx * 1.255, 1.9, -2.8], [sx * 1.255, 1.9, -1.4], [sx * 1.255, 2.35, -1.4], [sx * 1.255, 2.35, -2.8]], { hatch: 5, edge: .6, pts: false }));
      C.push(line([[sx * 1.2, 2.5, 2.9], [sx * 1.2, 2.72, 2.9], [sx * 1.2, 2.72, .3], [sx * 1.2, 2.5, .3]], fn({ w: .55 })));
    }
    C.push(panel([[-.9, 1.5, -5.105], [.9, 1.5, -5.105], [.9, 2.35, -5.105], [-.9, 2.35, -5.105]], { hatch: 6, edge: .7, pts: false }));
    C.push(box([-.5, 2.5, 2.0], [.5, 2.62, 2.9], fn()));
    for (const x of [-.35, .35]) C.push(line([[x, .45, -5.2], [x, 1.3, -5.15]], fn({ w: .6 })));
    for (let k = 0; k < 3; k++) C.push(line([[-.35, .58 + k * .24, -5.19], [.35, .58 + k * .24, -5.19]], fn({ w: .5 })));
    const TT = pantsirTurret(), MM = pantsirMissiles(), SR = pantsirSearch(), TR = pantsirTrack(), EO = pantsirEO();
    return {
      RING: PZ_RING,
      parts: [
        { name: 'chassis', label: 'KamAZ-6560 · 8×8', prims: C },
        { name: 'wheels', label: 'Wheels ×8 · 425/85 R21', prims: wheelSet(PZ_AX, 0, { r: .62, w: .42, x: .85, lugs: 14, n: 22 }), dyn: st => wheelSet(PZ_AX, st.wheel || 0, { r: .62, w: .42, x: .85, lugs: 14, n: 22 }) },
        { name: 'cab', label: 'KamAZ cab · crew 3', prims: K },
        { name: 'turret', label: 'Combat module · 72V6', prims: TT, xf: pzTurretX },
        { name: 'guns', label: '2A38M ×2 · 30 mm', prims: pantsirGuns({}), dyn: pantsirGuns, xf: pzPitchX },
        { name: 'missiles', label: '57E6 ×12', prims: MM, xf: pzPitchX },
        { name: 'searchRadar', label: 'Search radar · 1RS1-E', prims: SR, xf: st => X.mul(pzTurretX(st), X.make(R.y(st.sAnt || 0), PZ_SR)) },
        { name: 'trackRadar', label: 'Tracking radar · 1RS2-E', prims: TR, xf: pzTurretX },
        { name: 'eo', label: 'EO director', prims: EO, xf: pzTurretX },
      ],
    };
  }
  pantsir.muzzles = st => {
    st = st || {}; const T = pzPitchX(st), rec = -.14 * Math.sin(PI * sat(st.fire || 0));
    return PZ_BARRELS.map(([x, y]) => X.ap(T, [x, y, PZ_MUZZLE_Z + rec]));
  };
  pantsir.tubes = st => {
    st = st || {}; const T = pzPitchX(st), dir = X.dir(T, FZ);
    return PZ_TUBES.map(([x, y, side]) => ({ mouth: X.ap(T, [x, y, PZ_TUBE_Z[1]]), base: X.ap(T, [x, y, PZ_TUBE_Z[0]]), dir, side }));
  };

  /* ================= RIM-174 SM-6 + Mk 72 booster =================
     origin mid-stack, nose +Z, 6.55 m. state: booster (bool attached, default true) */
  const SM = { rm: .1715, rb: .2665, zB0: -3.275, zB1: -1.55, zR: 2.1, zN: 3.275 };
  function mk72Prims(dz) {
    const { rb, rm, zB0, zB1 } = SM, P = [], L = zB1 - zB0, T = X.make(R.I(), [0, 0, dz || 0]);
    P.push(lathe([0, 0, zB0], FZ, [[0, .215], [.035, rb], [L - .2, rb], [L - .1, .215], [L, rm]], { n: 26, gen: 6, rings: [1, 2, 3], caps: true }));
    P.push(ring([0, 0, zB0 + .6], FZ, rb + .003, fn({ n: 24 })));
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (r, z) => [e[0] * r, e[1] * r, z];
      P.push(panel([at(rb, -2.42), at(.785, -2.94), at(.785, -3.2), at(rb, -3.2)], { hatch2: 2, edge: 1 }));
      P.push(line([at(rb + .01, -3.13), at(.78, -3.13)], fn({ w: .35, pts: false })));
    }
    for (let k = 0; k < 4; k++) {
      const a = k * PI / 2, e = [Math.cos(a), Math.sin(a), 0], d = V.norm([e[0] * .16, e[1] * .16, -1]);
      P.push(lathe([e[0] * .12, e[1] * .12, zB0 + .02], d, [[0, .06], [.05, .048], [.19, .078]], { n: 14, gen: 4, rings: [0, 2] }));
    }
    P.push(circle([0, 0, zB0 - .002], FZ, .19, 20, fn({ w: .5, pts: false })));
    return dz ? tpAll(T, P) : P;
  }
  const SM6_NOZZLES = [0, 1, 2, 3].map(k => { const a = k * PI / 2, e = [Math.cos(a), Math.sin(a), 0], d = V.norm([e[0] * .16, e[1] * .16, -1]); return V.mad([e[0] * .12, e[1] * .12, SM.zB0 + .02], d, .19); });
  function sm6(o) {
    o = o || {};
    const { rm, zB1, zR, zN } = SM, n = o.n || 22;
    const RD = [], B = [], F = [], NZ = [];
    const Lr = zN - zR, rho = (rm * rm + Lr * Lr) / (2 * rm), og = [];
    for (const x of [0, .2, .4, .58, .74, .88, .99, 1.08, 1.14, Lr]) og.push([x, Math.max(0, Math.sqrt(Math.max(0, rho * rho - x * x)) + rm - rho)]);
    RD.push(lathe([0, 0, zR], FZ, og, { n, gen: 6, rings: [0, 4] }));
    B.push(lathe([0, 0, zB1], FZ, [[0, rm * .92], [.04, rm], [zR - zB1, rm]], { n, gen: 6, rings: [1, 2] }));
    for (const z of [-1.08, -.2, .9, 1.55]) B.push(ring([0, 0, z], FZ, rm + .003, { n: 20 }));
    // long low dorsal strakes (X), wire harness tunnel
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (r, z) => [e[0] * r, e[1] * r, z];
      B.push(panel([at(rm, -.98), at(rm + .085, -.72), at(rm + .085, 1.2), at(rm, 1.42)], { edge: .9 }));
    }
    B.push(prism(-.03, .03, rm - .01, rm + .025, -1.0, 2.0, -.025, .025, -.95, 1.95, fn()));
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (r, z) => [e[0] * r, e[1] * r, z];
      F.push(panel([at(rm, -1.02), at(.54, -1.33), at(.54, -1.5), at(rm, -1.5)], { hatch2: 2, edge: 1 }));
      F.push(line([at(rm + .01, -1.26), at(.53, -1.4)], fn({ w: .3, pts: false })));
    }
    NZ.push(lathe([0, 0, zB1], [0, 0, -1], [[0, .1], [.04, .085], [.14, .115]], { n: 16, gen: 4, rings: [0, 2] }));
    return {
      NOZZLES: SM6_NOZZLES, SUSTAINER: SM6_SUST, LEN: 6.55,
      parts: [
        { name: 'radome', label: 'Radome · active seeker', prims: RD },
        { name: 'body', label: 'RIM-174 SM-6', prims: B },
        { name: 'fins', label: 'Control fins ×4', prims: F },
        { name: 'mk72', label: 'Mk 72 booster', prims: mk72Prims(0), show: st => st.booster !== false },
        { name: 'nozzle', label: 'Mk 104 sustainer nozzle', prims: NZ, show: st => st.booster === false },
      ],
    };
  }
  const SM6_SUST = [0, 0, SM.zB1 - .14];
  Object.assign(sm6, { NOZZLES: SM6_NOZZLES, SUSTAINER: SM6_SUST, LEN: 6.55, BOOSTER: [SM.zB0, SM.zB1] });
  /* ejected Mk 72: origin its middle, +Z its front (the old interstage) */
  const MK72_DZ = -(SM.zB0 + SM.zB1) / 2;
  function mk72() {
    return { NOZZLES: SM6_NOZZLES.map(p => [p[0], p[1], p[2] + MK72_DZ]), parts: [{ name: 'mk72', label: 'Mk 72 booster · spent', prims: mk72Prims(MK72_DZ) }] };
  }
  mk72.NOZZLES = SM6_NOZZLES.map(p => [p[0], p[1], p[2] + MK72_DZ]);

  Object.assign(HD, {
    tel, telTube, oniks, oniksBooster, radar, pantsir, sm6, mk72,
    wheel, chassis8x8, ram, tp, tpAll, about, ring, circle, prism, comb,
    READY_LAND: true,
  });
})();
