/* ONIKS · DETAIL · close-up upgrades of the units, to the standard of the CVN-68 in data/models.js.

   The films' HD units (hd_land.js / hd_sea_air.js: fighter, helo, drone, catapult, destroyer, tel, radar, pantsir) and
   the game's own E-2D, K342P transloader and Bal, rebuilt for close-ups, Inspect, the X-ray and the exploded view.
   Registered by data/models.js (its DETAIL section) under the same keys, so the engine, the viewer and Inspect use
   them: EXTRA_MODELS / ALL_MODELS (unit models), CUT_MODELS (the cutaways). Every existing part name and state field
   is kept (the sim's damage parts, modelState and anatomy key off them); parts are added, never renamed.

   New state fields (all optional; the defaults draw what the game showed before):
     fighter  gear (0 up .. 1 down), fold (0 spread .. 1 folded, 9.3 m), hook (0 stowed .. 1 down), probe (0 in .. 1 out),
              slam, aam (rounds left on the pylons, default 2 / 2)
     helo     fold (0 flight .. 1 blades folded aft, stabilators up, tail pylon folded to port), hellfire (0..4), mk54 (0..2)
     aew      gear (0 up .. 1 down)
   Anchors: FIGHTER.GEAR_H (the fighter's origin stands 1.51 m over the deck on its gear), E2D.GEAR_H (2.1 m).

   Public-reference level: external shapes, designations, sizes. Interiors are closed volumes (engines, gearboxes,
   cockpits as seats and consoles), munitions are closed shells. Metres, +Z forward, +Y up, +X starboard.
   installDetail(K) is called once by data/models.js with its helpers (K); nothing here runs before that. */
const M3 = window.M3, GEO = window.GEO, HD = window.HD;
const { V, R, X } = M3;
const { hex, box, lathe, cyl, panel, line, blades } = GEO;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const FX = [1, 0, 0], FY = [0, 1, 0], FZ = [0, 0, 1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const tp = HD.tp, tps = (T, L) => L.map(pr => tp(T, pr));
const about = HD.about, ringW = HD.ring;
const SA = HD.seaAir;
const T3 = p => X.make(R.I(), p);
const memo = f => { let c = null; return () => c || (c = f()); };
const hidden = { inside: true, show: st => !!st.xray };
/* a count from a state field (rounds left): default d when absent */
const count = (v, d, hi) => (typeof v === 'number' && v === v) ? Math.max(0, Math.min(hi, Math.round(v))) : d;
let K = null;

/* ---------------------------------------------------------------- shared helpers */
/* closed volume (the Anatomy films' interiors): sparse dots on the faces, the twelve edges in dense dots */
const EDG = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const bx8 = (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
function hvol(p8, P, o) {
  o = o || {}; const f = o.fine ? { fine: true } : {};
  P.push(hex(p8, O({ bottom: true, ds: o.ds || 2.4 }, f)));
  for (const [i, j] of EDG) P.push(line([p8[i], p8[j]], O({ w: 0, ds: o.de || .5 }, f)));
  return P;
}
const vol = (a, b, P, o) => hvol(bx8(a, b), P, o);
/* dotted circle (dots only): the rims of drums, bezels */
function rim(c, d, r, o) {
  const [U, W] = GEO.perp(V.norm(d)), p = [];
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; p.push(V.add(c, V.add(V.mul(U, Math.cos(a) * r), V.mul(W, Math.sin(a) * r)))); }
  return line(p, O({ closed: true, w: 0, ds: .5 }, o));
}
/* closed drum a -> b, radius r, dotted rims */
function drum(a, b, r, P, o) {
  o = o || {}; const d = V.sub(b, a), f = o.fine ? { fine: true } : {};
  P.push(lathe(a, d, [[0, r], [V.len(d), r]], O({ n: 18, gen: 2, rings: [0, 1], caps: true, ds: o.ds || 2.2 }, f)));
  P.push(rim(a, d, r, f), rim(b, d, r, f));
  return P;
}
function sphere(c, r, o) {
  const st = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * PI; st.push([r * (1 - Math.cos(a)), r * Math.sin(a) + 1e-4]); }
  return lathe(V.add(c, [0, -r, 0]), FY, st, O({ n: 16, gen: 4, rings: [2, 4, 6] }, o));
}
/* an aircraft tyre: centre c, axle direction ax (unit), radius r, width w; the hub rims in wire */
function tyre(c, ax, r, w, P, o) {
  const a = V.mad(c, ax, -w / 2);
  P.push(lathe(a, ax, [[0, r * .5], [w * .1, r * .86], [w * .3, r], [w * .7, r], [w * .9, r * .86], [w, r * .5]], O({ n: 22, gen: 0, rings: [2, 3], caps: true, sil: false }, o)));
  P.push(ringW(V.mad(c, ax, w / 2 + .005), ax, r * .5, fn({ n: 14 })), ringW(V.mad(c, ax, -w / 2 - .005), ax, r * .5, fn({ n: 14 })));
  return P;
}
/* a strut (closed rod) */
const rod = (a, b, r, o) => cyl(a, b, r, O({ n: 8, gen: 0, caps: true }, o));
/* dotted polyline (both renderers) */
const dl = (p, o) => line(p, O({ w: .6, ds: .55 }, o));
/* a thin plate between four points, dots on both faces, edges in wire */
const plate2 = (q, th, o) => K.slab2(q, th || .02, o);
/* a model flattened at a state into prims placed by T (stores on pylons, a folded helicopter in a hangar) */
function flat(m, st, T) {
  const out = []; st = st || {}; T = T || X.make();
  for (const p of m.parts) {
    if (p.show && !p.show(st)) continue;
    const Xp = p.xf ? X.mul(T, p.xf(st)) : T;
    for (const pr of GEO.primsOf(p, st)) out.push(tp(Xp, pr));
  }
  return out;
}
const cached = f => { let m = null; return () => K.cloneModel(m || (m = f())); };
/* a part's prims regrouped: [name, label, test(pr, centre)] first match wins, the last group takes the rest */
function regroup(prims, groups) {
  const out = groups.map(() => []);
  for (const pr of prims) { const c = K.bboxOf(pr).c; let i = groups.findIndex(g => !g[2] || g[2](pr, c)); if (i < 0) i = groups.length - 1; out[i].push(pr); }
  return out;
}

/* ================================================================ F/A-18E Super Hornet
   18.31 m, 13.62 m span over the wingtip rails, 9.32 m folded; 4.88 m high on its gear (the origin, mid-body on the
   fuselage axis, stands 1.51 m over the deck). The HD airframe (fuselage, LEX, tails, stabilators, canopy, nozzles)
   plus: outer wings that fold up at 4.62 m from the centreline (fold), the canopy's frame and the NACES seat's
   headbox under it, the HUD; tricycle gear (gear): twin nose wheels with the launch bar, retracting forward, the
   mains folding aft and turning flat; the arresting hook between the nozzles (hook); the refuelling probe from the
   upper right nose (probe); nine pylons with a strike load as closed shells: AIM-9X on the tips, AIM-120 outboard,
   AGM-84H SLAM-ER, 480 gal tanks inboard, ATFLIR on the left nacelle (slam, aam: rounds left).
   Intakes: caret mouths, S-ducts back to the engine faces 7 m in, radar blockers, the fans behind them.
   Cutaway: cockpit (seat, consoles, displays), APG-79 array, M61A2 and its drum, two F414-GE-400 (volumes),
   fuselage cells and wing tanks (volumes). */
const FA = { GEAR_H: 1.51, XH: 4.62, FOLD: 98 * DEG, NG: [0, -.36, 4.62], HOOK: [0, -.6, -6.12], PROBE: [.44, .3, 5.85], FACE_Z: -5.05 };
const faLE = x => .9 - (x - 1.05) * Math.tan(20 * DEG), faTE = x => -4.5 + (x - 1.05) * (1.6 / 5.2), faY = x => .08 - (x - 1.05) * .03;
const faTH = x => mix(.2, .07, sat((x - 1.05) / 5.2));
const faHinge = s => [s * FA.XH, faY(FA.XH) + faTH(FA.XH) * .5, 0];
const faFoldXf = (s, f) => about(R.z(s * f * FA.FOLD), faHinge(s));
const faFace = s => [s * .62, -.16, FA.FACE_Z];
/* the HD fuselage and canopy sections (z, half widths, bottom, top, exponent) */
const FA_ST = [[9.15, .03, .03, -.03, .03, 2], [8.75, .2, .2, -.2, .2, 2], [8.1, .36, .36, -.34, .36, 2], [7.2, .47, .5, -.46, .48, 2.2], [6.1, .55, .62, -.58, .6, 2.5], [5.0, .6, .72, -.68, .66, 2.8], [3.8, .64, .8, -.76, .7, 3],
  [2.55, .68, .92, -.84, .7, 3.2], [2.0, .7, 1.58, -.86, .7, 3.6], [.6, .74, 1.68, -.86, .68, 3.8], [-1.5, .82, 1.66, -.82, .66, 3.8], [-3.6, .98, 1.5, -.74, .62, 3.6], [-5.8, 1.08, 1.3, -.66, .56, 3.4], [-7.8, 1.1, 1.2, -.58, .5, 3.2]];
const FA_CS = [[6.05, .3, .56, .66, 2], [5.45, .42, .56, .98, 2.2], [4.5, .47, .6, 1.14, 2.4], [3.5, .46, .62, 1.12, 2.4], [2.6, .36, .64, .94, 2.2], [2.0, .2, .66, .74, 2]];
const FA_MOUTH = [[.9, .04, 2.5], [1.66, .04, 2.12], [1.56, -.8, 1.7], [.9, -.8, 2.08]];
function faCs(z) {
  let i = 0; while (i < FA_CS.length - 2 && z < FA_CS[i + 1][0]) i++;
  const a = FA_CS[i], b = FA_CS[i + 1], t = sat((a[0] - z) / (a[0] - b[0]));
  return [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t), mix(a[4], b[4], t)];
}
/* a point on the canopy at z, t 0 (right sill) .. 1 (left sill), lifted off the glass by `off` */
function faArc(z, t, off) {
  const [w, yb, yt, e] = faCs(z), ph = t * PI, c = Math.cos(ph), s = Math.sin(ph), k = 2 / e;
  const p = [w * Math.sign(c) * Math.pow(Math.abs(c), k), yb + (yt - yb) * Math.pow(Math.max(0, s), k), z];
  return V.mad(p, V.norm([p[0], p[1] - yb + .15, 0]), off || 0);
}
/* underside of the wing at x, chord fraction f */
const faUnder = (x, f) => faY(x) - faTH(x) * (1 - .4 * f) * .5;
/* pylon stations: x out from the centreline, and the pylon's front */
const FA_PY = [2.15, 3.25, 4.3];
const faPyZ0 = x => faLE(x) - .9;
const faPyBot = x => faUnder(x, .3) - .48;

const FA_GEO = memo(() => {
  const N = 16, KF = SA.skin(FA_ST.map(q => SA.sec2(q[0], q[1], q[2], q[3], q[4], q[5], N)));
  const FUX = [], CNX = [], TLX = [], IN = [], PY = [], HK = [], PR = [], WIN = [], WOUT = { 1: [], '-1': [] };
  /* ---- fuselage: gun port, pitots, probe door, formation lights, blade antennas, fuselage stations */
  FUX.push(ringW([0, .45, 7.55], V.norm([0, 1, .35]), .065, fn({ n: 12 })), rim([0, .455, 7.55], V.norm([0, 1, .35]), .065, fn()));
  for (let k = 0; k < 3; k++) FUX.push(dl([[-.06, .47 - k * .012, 7.2 - k * .1], [.06, .47 - k * .012, 7.2 - k * .1]], fn({ w: .4 })));        // gun gas vents
  for (const s of [-1, 1]) {
    FUX.push(rod([s * .4, .05, 7.25], [s * .43, .06, 7.62], .012, fn()));                                                        // pitot
    FUX.push(box([s * .44, -.08, 6.95], [s * .47, -.02, 7.08], fn()));                                                          // AOA vane
    FUX.push(box([s * .72, .5, 1.4], [s * .74, .56, 2.2], fn({ ds: .5 })), box([s * .96, .22, -3.4], [s * .98, .28, -2.3], fn({ ds: .5 })));  // formation strips
    FUX.push(box([s * 1.38, -.95, -.55], [s * 1.52, -.84, 1.25], fn()));                                                        // nacelle station (LAU-116)
  }
  FUX.push(K.skQuad(KF, [[2.95, 1.35], [2.95, 2.7], [4.25, 2.7], [4.25, 1.35]], fn({ al: .5 })));                               // probe bay door
  FUX.push(box([-.012, .7, -.9], [.012, .92, -.55], fn()), box([-.012, -.86, 3.4], [.012, -1.0, 3.7], fn()));                      // blade antennas
  FUX.push(box([-.07, -1.2, -2.2], [.07, -.8, .3]));                                                                           // centreline pylon
  /* ---- canopy: windscreen arch, sills, aft frame, the seat's headbox, the HUD */
  const arc = (z, off, n) => { const p = []; for (let i = 0; i <= (n || 14); i++) p.push(faArc(z, i / (n || 14), off)); return p; };
  for (const z of [5.3, 5.22]) CNX.push(dl(arc(z, .012), { w: .9, ds: .45 }));
  for (const z of [2.3, 2.38]) CNX.push(dl(arc(z, .012), { w: .7, ds: .5 }));
  for (const t of [0, 1]) { const p = []; for (let z = 2.25; z <= 5.95; z += .37) p.push(faArc(z, t, .01)); CNX.push(dl(p, { w: .8, ds: .45 })); }
  CNX.push(box([-.17, .74, 3.36], [.17, 1.0, 3.6], fn()), box([-.22, .56, 3.42], [.22, .76, 3.58], fn()));                        // NACES headbox, seat back
  CNX.push(box([-.34, .6, 4.86], [.34, .7, 5.18], fn()), panel([[-.1, .7, 5.06], [.1, .7, 5.06], [.1, .9, 5.0], [-.1, .9, 5.0]], fn({ edge: .5 })));  // glareshield, HUD combiner
  /* ---- wings: inner panels (fixed), outer panels (fold up about the hinge), hinge lines, fold joint, tip rails */
  for (const s of [1, -1]) {
    const S = p => [s * p[0], p[1], p[2]], xh = FA.XH, WO = WOUT[s];
    const q = (x0, x1, d0) => [[x0, faY(x0), faLE(x0) + (d0 || 0)], [x1, faY(x1), faLE(x1)], [x1, faY(x1), faTE(x1)], [x0, faY(x0), faTE(x0)]].map(S);
    WIN.push(K.slab2(q(1.05, xh - .012), [faTH(1.05), faTH(xh), faTH(xh) * .6, faTH(1.05) * .6], { bottom: true }));
    WO.push(K.slab2(q(xh + .012, 6.25, .16), [faTH(xh), faTH(6.25), faTH(6.25) * .6, faTH(xh) * .6], { bottom: true }));
    const top = (x, f) => S([x, faY(x) + faTH(x) * (1 - .4 * f) * .5 + .006, mix(faLE(x), faTE(x), f)]);
    const seam = (x0, x1, f, P) => P.push(dl([top(x0, f), top(x1, f)], fn({ w: .35, ds: .7 })));
    seam(1.25, xh - .1, .72, WIN); seam(1.25, xh - .1, .12, WIN); seam(xh + .1, 6.1, .74, WO); seam(xh + .1, 6.1, .12, WO);
    WIN.push(dl([top(xh - .02, 0), top(xh - .02, 1)], fn({ w: .45, ds: .6 })));
    for (const f of [.15, .45, .75]) WIN.push(box(V.add(top(xh - .1, f), [-.03, -.02, -.07]), V.add(top(xh + .02, f), [.03, .05, .07]), fn()));   // fold hinge lugs
    WO.push(box([s * 6.25, faY(6.25) - .06, faTE(6.25) - .05], [s * 6.37, faY(6.25) + .05, faLE(6.25) + .25]));                       // LAU-127 tip rail
    WO.push(box([s * 5.2, faY(5.2) + faTH(5.2) * .45, faLE(5.2) - .6], [s * 5.9, faY(5.2) + faTH(5.2) * .45 + .012, faLE(5.2) - .56], fn({ ds: .5 })));   // formation light
  }
  /* ---- tails: rudders, tip lights */
  for (const s of [1, -1]) {
    const cd = [s * Math.sin(20 * DEG), Math.cos(20 * DEG), 0], r0 = [s * 1.0, .55, 0], at = (h, z) => V.add(V.mad(r0, cd, h), [0, 0, z]);
    TLX.push(dl([at(.2, -6.95), at(1.55, -6.72)], fn({ w: .35, ds: .7 })), dl([at(1.55, -6.72), at(1.6, -7.45)], fn({ w: .35, ds: .7 })));
    TLX.push(box(V.add(at(2.98, -7.3), [-.03, -.03, -.05]), V.add(at(2.98, -7.3), [.03, .06, .15]), fn()));
    TLX.push(box(V.add(at(1.2, -4.9), [-.01, 0, 0]), V.add(at(1.9, -4.9), [.01, 0, .05]), fn({ ds: .5 })));
  }
  /* ---- intakes: caret mouths, S-ducts to the engine faces, radar blockers */
  for (const s of [1, -1]) {
    const S = p => [s * p[0], p[1], p[2]], mouth = FA_MOUTH.map(S), face = faFace(s);
    IN.push(line(mouth, { closed: true, w: 1, ds: .45 }));
    IN.push(line(mouth.map(p => V.add(p, [-s * .03, .0, -.04])), fn({ closed: true, w: .45, ds: .6 })));
    const per = []; for (let e = 0; e < 4; e++) for (let k = 0; k < 3; k++) per.push(V.lerp(mouth[e], mouth[(e + 1) % 4], k / 3));
    const mc = V.mul(mouth.reduce((a, p) => V.add(a, p), [0, 0, 0]), .25);
    const path = [mc, S([1.08, -.36, .2]), S([.86, -.28, -2.2]), face];
    const cAt = t => { const u = t * 3, i = Math.min(2, Math.floor(u)); return V.lerp(path[i], path[i + 1], u - i); };
    const secs = [0, .08, .2, .36, .52, .68, .84, 1].map(t => {
      const e = ss(0, .55, t), c = cAt(t);
      return per.map((p, m) => { const th = (135 - m * 30) * DEG, ci = [s * Math.cos(th) * .42, Math.sin(th) * .42, 0]; return V.add(c, V.lerp(V.sub(p, mc), ci, e)); });
    });
    IN.push(...SA.loft(SA.skin(secs, false, true), { lines: [0, 3, 6, 9], al: .45, ds: 1.3 }));
    IN.push(blades(V.add(face, [0, 0, .55]), FZ, 16, .1, .42, fn({ chord: .32, taper: 1.2, pitch: .8, edge: .5, ds: 1.8 })));
    IN.push(ringW(V.add(face, [0, 0, .55]), FZ, .42, fn({ n: 24 })));
  }
  /* ---- pylons: three per wing, canted-in nothing, sway braces */
  for (const s of [1, -1]) for (const x of FA_PY) {
    const S = p => [s * p[0], p[1], p[2]], y0 = faUnder(x, .3) + .02, y1 = faPyBot(x), z0 = faPyZ0(x), z1 = z0 - 2.05;
    PY.push(hex([[x - .045, y1, z1 + .25], [x + .045, y1, z1 + .25], [x + .045, y1, z0 - .3], [x - .045, y1, z0 - .3], [x - .065, y0, z1], [x + .065, y0, z1], [x + .065, y0, z0], [x - .065, y0, z0]].map(S)));
    for (const z of [z0 - .55, z1 + .7]) PY.push(box(S([x - .09, y1 - .05, z - .04]), S([x + .09, y1, z + .04]), fn()));
  }
  /* ---- hook: arm, damper, shoe (stowed between the nozzles) */
  HK.push(rod(FA.HOOK, [0, -.58, -8.45], .05));
  HK.push(hex([[-.07, -.7, -8.62], [.07, -.7, -8.62], [.07, -.7, -8.36], [-.07, -.7, -8.36], [-.06, -.56, -8.6], [.06, -.56, -8.6], [.06, -.56, -8.32], [-.06, -.56, -8.32]], { bottom: true }));
  HK.push(rod([0, -.52, -5.55], [0, -.59, -6.5], .035, fn()), box([-.09, -.64, -6.22], [.09, -.54, -6.02], fn()));
  /* ---- probe (stowed along +Z in its bay; the part swings it out) */
  PR.push(lathe(FA.PROBE, FZ, [[0, .06], [.2, .055], [1.85, .05], [1.9, .075], [2.02, .075], [2.1, .03]], { n: 10, gen: 2, rings: [0, 3, 4], caps: true }));
  PR.push(box(V.add(FA.PROBE, [-.06, -.08, -.1]), V.add(FA.PROBE, [.06, .04, .12]), fn()));
  return { KF, FUX, CNX, TLX, IN, PY, HK, PR, WIN, WOUT };
});
function faWings(st) {
  const g = FA_GEO(), f = sat(st.fold || 0), P = g.WIN.slice();
  for (const s of [1, -1]) P.push(...(f > 0 ? tps(faFoldXf(s, f), g.WOUT[s]) : g.WOUT[s]));
  return P;
}
function faFans(st) {
  const P = [], rot = st.fan || 0;
  for (const s of [1, -1]) {
    const c = faFace(s);
    P.push(blades(c, FZ, 22, .15, .41, { rot: (s > 0 ? rot : -rot) + (s > 0 ? 0 : .07), chord: .23, taper: 1.4, pitch: .45, edge: .75 }));
    P.push(lathe(c, FZ, [[0, .15], [.12, .12], [.26, .04], [.29, 0]], { n: 14, gen: 4 }));
    P.push(ringW(c, FZ, .41, fn({ n: 24, al: .6 })));
  }
  return P;
}
/* stores (closed shells) */
const FA_STORE = memo(() => {
  const g = K.slimShell({ r: .064, z0: -1.51, z1: 1.51, nl: .14, joints: [-.4, .5], fins: [{ z: -1.51, root: .2, tip: .1, span: .1, sweep: .03 }], wings: [{ z: .5, root: .22, tip: .06, span: .045 }] });
  const A9X = g.NS.concat(g.BD, g.FN, g.WG);
  const TANK = [lathe([0, 0, -2.4], FZ, [[0, .03], [.6, .26], [1.5, .36], [3.2, .36], [4.1, .22], [4.55, .03]], { n: 22, gen: 6, rings: [1, 2, 3, 4] })];
  for (const z of [-.4, .8]) TANK.push(ringW([0, 0, z], FZ, .362, fn({ n: 20 })));
  TANK.push(box([-.05, .3, -.9], [.05, .4, .5], fn()));
  const ATF = [lathe([0, 0, -.95], FZ, [[0, .1], [.12, .165], [1.4, .165], [1.55, .15]], { n: 16, gen: 4, rings: [1, 2], caps: true }), sphere([0, 0, .74], .15, { n: 16, gen: 4 })];
  ATF.push(panel([[-.06, -.05, .88], [.06, -.05, .88], [.06, .05, .88], [-.06, .05, .88]], fn({ edge: .6 })), box([-.05, .15, -.6], [.05, .26, .4], fn()));
  return { A9X, TANK, ATF, AIM120: flat(K.aam(), {}), SLAM: flat({ parts: K.slam().parts.filter(p => p.name !== 'wings') }, {}) };   // the pop-out wings stowed flush: not drawn
});
function faStores(st) {
  const g = FA_STORE(), f = sat(st.fold || 0), ns = count(st.slam, 2, 2), na = count(st.aam, 2, 2), P = [];
  for (const s of [1, -1]) {
    const at = (x, dy, dz) => T3([s * x, faPyBot(x) - dy, faPyZ0(x) - 1.02 + (dz || 0)]);
    P.push(...tps(at(2.15, .37, 0), g.TANK));
    if (ns >= (s > 0 ? 1 : 2)) P.push(...tps(at(3.25, .19, -.05), g.SLAM));
    if (na >= (s > 0 ? 1 : 2)) P.push(...tps(at(4.3, .12, -.2), g.AIM120));
    P.push(...tps(X.mul(faFoldXf(s, f), T3([s * 6.43, faY(6.25) - .03, faLE(6.25) - 1.4])), g.A9X));
  }
  P.push(...tps(T3([-1.46, -1.07, 1.02]), g.ATF));
  return P;
}
/* landing gear, built extended (model frame), each leg swung up about its hinge by (1 - gear) */
const FA_GEAR = memo(() => {
  const NG = FA.NG, N = [], M = { 1: [], '-1': [] }, D = { 1: [], '-1': [] };
  // nose: strut raked forward, oleo, twin wheels, torque links, launch bar (raised), steering collar, lights, drag brace
  const ax = [0, -1.23, 4.75];
  N.push(rod(NG, [0, -.95, 4.7], .075), rod([0, -.92, 4.7], [0, -1.18, 4.74], .055));
  N.push(lathe([0, -.52, 4.64], FY, [[0, .1], [.12, .1]], { n: 12, gen: 0, caps: true }));
  N.push(rod([-.22, ax[1], ax[2]], [.22, ax[1], ax[2]], .035));
  for (const sx of [-1, 1]) tyre([sx * .15, ax[1], ax[2]], FX, .28, .15, N);
  N.push(dl([[0, -.9, 4.62], [0, -1.02, 4.52], [0, -1.15, 4.66]], fn({ w: .5 })));
  N.push(hex([[-.05, -1.02, 4.8], [.05, -1.02, 4.8], [.05, -.78, 5.55], [-.05, -.78, 5.55], [-.05, -.96, 4.8], [.05, -.96, 4.8], [.05, -.72, 5.55], [-.05, -.72, 5.55]]));   // launch bar
  N.push(box([-.07, -.8, 4.78], [.07, -.7, 4.88], fn()), box([-.04, -.62, 4.7], [.04, -.56, 4.76], fn()));                        // lights
  N.push(rod([0, -.5, 4.12], [0, -.78, 4.66], .035, fn()));
  // mains (starboard built, port mirrored): strut, trailing arm, axle, wheel, brake, drag brace, strut door
  const mg = s => [s * 1.24, -.5, -.28];
  for (const s of [1, -1]) {
    const S = p => [s * p[0], p[1], p[2]], H = mg(s), Kn = S([1.46, -1.0, -.62]), A = S([1.56, -1.13, -.98]);
    M[s].push(rod(H, V.lerp(H, Kn, .55), .085), rod(V.lerp(H, Kn, .5), Kn, .065));
    M[s].push(rod(Kn, S([1.44, -1.13, -.98]), .06), rod(S([1.38, -1.13, -.98]), S([1.74, -1.13, -.98]), .042));
    tyre(A, FX, .38, .29, M[s]);
    M[s].push(lathe(S([1.46, -1.13, -.98]), [s, 0, 0], [[0, .2], [.06, .2]], fn({ n: 12, gen: 0, caps: true })));
    M[s].push(rod(S([1.18, -.56, .45]), V.lerp(H, Kn, .55), .04));
    M[s].push(plate2([V.add(H, S([.12, .04, .22])), V.add(H, S([.12, .04, -.2])), V.add(Kn, S([.12, .02, -.12])), V.add(Kn, S([.12, .02, .3]))], .02));
  }
  // nose doors: along the bay, hinged at its edges
  for (const s of [1, -1]) D[s].push(plate2([[s * .22, -.69, 4.2], [s * .02, -.69, 4.2], [s * .02, -.69, 5.5], [s * .22, -.69, 5.5]], .02));
  return { N, M, D, mg };
});
function faGear(st) {
  const g = FA_GEAR(), u = 1 - sat(st.gear || 0), P = [];
  P.push(...(u > 0 ? tps(about(R.x(-u * PI / 2), FA.NG), g.N) : g.N));
  for (const s of [1, -1]) {
    const H = g.mg(s), dS = V.norm(V.sub([s * 1.46, -1.0, -.62], H));
    P.push(...(u > 0 ? tps(about(R.mul(R.x(u * PI / 2), SA.Rax(dS, s * u * PI / 2)), H), g.M[s]) : g.M[s]));
    P.push(...tps(about(R.z(s * (1 - u) * 84 * DEG), [s * .22, -.69, 4.85]), g.D[s]));
  }
  return P;
}
const faHookXf = st => about(R.x(-sat(st.hook || 0) * 62 * DEG), FA.HOOK);
const faProbeXf = st => { const p = sat(st.probe || 0); return about(R.mul(R.y(.42 * p), R.x(-.16 * p)), FA.PROBE); };
function fighterD() {
  const B = HD.fighter(), by = n => B.parts.find(p => p.name === n), g = FA_GEO(), noz = by('nozzles');
  return {
    name: 'fighter', L: 18.31, GEAR_H: FA.GEAR_H,
    parts: [
      { name: 'fuselage', label: 'F/A-18E Super Hornet', prims: by('fuselage').prims.concat(g.FUX) },
      { name: 'lex', label: 'Leading-edge extensions', prims: by('lex').prims },
      { name: 'wings', label: 'Wing · 13.62 m span · folds to 9.32 m', prims: faWings({}), dyn: faWings },
      { name: 'tails', label: 'Vertical tails ×2 · 20° cant · rudders', prims: by('tails').prims.concat(g.TLX) },
      { name: 'stabs', label: 'Stabilators', prims: by('stabs').prims },
      { name: 'canopy', label: 'Canopy · NACES seat · HUD', prims: by('canopy').prims.concat(g.CNX) },
      { name: 'intakes', label: 'Caret intakes · S-ducts · F414 fans', prims: g.IN, dyn: st => g.IN.concat(faFans(st)) },
      { name: 'nozzles', label: 'F414-GE-400 nozzles', prims: [], dyn: noz.dyn },
      { name: 'pylons', label: 'Pylons ×6 · nacelle stations ×2', prims: g.PY },
      { name: 'stores', label: 'AIM-9X ×2 · AIM-120 ×2 · SLAM-ER ×2 · 480 gal ×2 · ATFLIR', prims: faStores({}), dyn: faStores },
      { name: 'gear', label: 'Landing gear · twin nose wheels · mains', prims: faGear({ gear: 1 }), dyn: faGear, show: st => (st.gear || 0) > .01 },
      { name: 'hook', label: 'Arresting hook', prims: g.HK, xf: faHookXf },
      { name: 'probe', label: 'Refuelling probe · retractable', prims: g.PR, xf: faProbeXf, show: st => (st.probe || 0) > .01 },
    ],
  };
}
/* cutaway: sides split for the exploded view, the gear by leg; cockpit, radar, gun, engines, fuel as volumes */
function faInside() {
  const CP = [], RA = [], GU = [], EN = [], FU = [];
  // cockpit: tub, NACES seat, instrument panel with its displays, glareshield, consoles, stick, throttle, pedals
  vol([-.42, -.3, 2.7], [.42, -.24, 4.95], CP, { ds: 2.2 });
  vol([-.25, -.1, 3.42], [.25, .24, 3.95], CP); vol([-.25, .24, 3.3], [.25, .98, 3.46], CP); vol([-.18, .74, 3.34], [.18, 1.02, 3.58], CP, { fine: true });
  vol([-.42, .12, 4.72], [.42, .6, 4.9], CP);
  for (const [x, y, w, h] of [[-.25, .44, .08, .08], [.25, .44, .08, .08], [0, .3, .13, .12], [0, .52, .1, .05]]) CP.push(line([[x - w, y - h, 4.715], [x + w, y - h, 4.715], [x + w, y + h, 4.715], [x - w, y + h, 4.715]], { closed: true, w: .5, ds: .5 }));
  vol([-.36, .6, 4.84], [.36, .7, 5.2], CP, { fine: true });
  for (const s of [-1, 1]) vol([s * .28, -.1, 2.9], [s * .44, .28, 4.7], CP);
  CP.push(rod([0, -.2, 4.12], [0, .24, 4.04], .02, fn()), box([-.035, .24, 4.0], [.035, .34, 4.08], fn()));
  CP.push(box([-.42, .28, 3.72], [-.34, .42, 3.94], fn()));
  for (const s of [-1, 1]) CP.push(box([s * .08, -.22, 5.0], [s * .2, -.05, 5.12], fn()));
  // APG-79: a fixed array tilted up, its back end
  const rd = V.norm([0, .27, 1]);
  RA.push(lathe([0, .02, 6.72], rd, [[0, .34], [.05, .34]], { n: 28, gen: 0, rings: [0, 1], caps: true, ds: 1.2 }), rim(V.mad([0, .02, 6.72], rd, .052), rd, .34));
  vol([-.26, -.24, 6.12], [.26, .22, 6.6], RA);
  // M61A2: barrels as one closed cluster, the gun body, the drum under the windscreen
  drum([0, .28, 5.95], [0, .34, 7.45], .075, GU, { ds: 1.4 }); vol([-.13, .14, 5.45], [.13, .4, 5.95], GU); drum([-.35, .05, 5.45], [.35, .05, 5.45], .26, GU);
  // F414-GE-400 ×2 (fan case to the afterburner; the nozzle part carries on behind), accessory gearboxes
  for (const s of [1, -1]) {
    const f = faFace(s), d = V.norm(V.sub([s * .62, -.12, -7.4], f));
    EN.push(lathe(f, d, [[0, .4], [.08, .44], [.55, .44], [.75, .38], [1.2, .35], [1.45, .38], [1.7, .4], [1.95, .44], [2.35, .45]], { n: 26, gen: 4, rings: [1, 3, 5, 7], caps: true, ds: 1.1 }));
    for (const [t, r] of [[.08, .45], [.75, .39], [1.45, .39], [1.95, .45]]) EN.push(rim(V.mad(f, d, t), d, r));
    vol([s * .62 - .16, -.66, -5.95], [s * .62 + .16, -.5, -5.15], EN, { fine: true });
    EN.push(dl([[s * .62, -.58, -5.9], [s * .5, -.52, -6.6], [s * .45, -.3, -7.1]], fn({ w: .4 })));
  }
  // fuel: four fuselage cells over and between the ducts, the wet inner wings
  for (const [z0, z1, y0] of [[1.3, 2.4, -.3], [.1, 1.2, -.3], [-1.2, 0, -.25], [-2.5, -1.3, .02], [-3.8, -2.6, .05]]) vol([-.52, y0, z0], [.52, .52, z1], FU, { ds: 2.6 });
  for (const s of [1, -1]) {
    const c = (x, f, dy) => [s * x, faY(x) + dy * faTH(x), mix(faLE(x), faTE(x), f)];
    hvol([c(1.3, .15, -.3), c(4.3, .15, -.3), c(4.3, .72, -.2), c(1.3, .72, -.2), c(1.3, .15, .3), c(4.3, .15, .3), c(4.3, .72, .2), c(1.3, .72, .2)], FU, { ds: 2.6 });
  }
  return { CP, RA, GU, EN, FU };
}
function fighterCutD() {
  const M = fighterD(), I = faInside();
  const gearSplit = p => K.splitPart(p, [{ name: 'gearN', label: 'Nose gear · twin wheels · launch bar', test: (pr, c) => c[2] > 2.5 }, { name: 'gearL', label: 'Main gear · L', test: (pr, c) => c[0] < 0 }, { name: 'gearR', label: 'Main gear · R' }]);
  const C = K.cutBySides(M, 'fighter_cut', { wings: 'Wing', tails: 'Vertical tail', stabs: 'Stabilator', intakes: 'Caret intake · S-duct · F414 fan', nozzles: 'F414-GE-400 nozzle', pylons: 'Pylons', lex: 'Leading-edge extension', stores: 'Stores', gear: gearSplit });
  C.parts.push(O({ name: 'cockpit', label: 'Cockpit · SJU-17 NACES seat · displays', prims: I.CP }, hidden));
  C.parts.push(O({ name: 'radar', label: 'AN/APG-79 AESA radar', prims: I.RA }, hidden));
  C.parts.push(O({ name: 'gun', label: 'M61A2 · 20 mm · drum', prims: I.GU }, hidden));
  C.parts.push(O({ name: 'engines', label: 'F414-GE-400 ×2 · 22 000 lbf', prims: I.EN }, hidden));
  C.parts.push(O({ name: 'fuel', label: 'Fuel · fuselage cells ×5 · wing tanks', prims: I.FU }, hidden));
  return C;
}

/* ================================================================ MH-60R Seahawk
   19.76 m rotors turning, 16.36 m disc, 12.47 m folded. The HD airframe rebuilt with: a rotor head of blade cuffs on
   elastomeric bearings, lead-lag dampers, pitch horns and links to the swashplate, the bifilar absorber; blades that
   fold aft (fold); stabilators that fold up and the tail pylon that folds forward along the port side (fold: the
   canted tail rotor ends outboard); main gear on drag beams, twin tail wheels 4.83 m aft of the mains, the RAST probe;
   the MTS turret with its windows, the APS-153 radome, the AQS-22 dome in its well, the 25-tube sonobuoy launcher on
   the port side, the rescue hoist; weapon pylons with an M299 of four Hellfire and two Mk 54 as closed shells
   (hellfire, mk54: rounds left). Cutaway: cockpit and cabin (seats, consoles, the ALFS reel, the launcher), two
   T700-GE-401C, the main gearbox and tail drive, the fuel cells (volumes). */
const HL = { HC: HD.helo.HUB, TR: HD.helo.TAIL_HUB, TRA: HD.helo.TAIL_AXIS, R: HD.helo.R, HF: [-.46, 2.3, -7.0], FAX: V.norm([-.06, 1, .04]), FANG: 168 * DEG, ZF: -7.02, STAB_Y: 2.32 };
const hlPylon = st => ss(.3, 1, sat(st.fold || 0));
const hlFoldXf = st => { const f = hlPylon(st); return f > 0 ? about(SA.Rax(HL.FAX, f * HL.FANG), HL.HF) : X.make(); };
const HL_GEO = memo(() => {
  const N = 16, FU = [], TC = [], TL = [], G = [], SN = [];
  // fuselage (the HD sections, a station added at the fold joint)
  const ST = [[5.5, .1, 1.18, 1.4, 2], [5.3, .5, .92, 1.8, 2.3], [4.7, .86, .7, 2.14, 2.7], [3.7, 1.1, .58, 2.46, 3.3], [2.35, 1.18, .55, 2.58, 3.8], [0, 1.2, .55, 2.62, 4], [-1.9, 1.16, .6, 2.6, 3.8], [-3.1, .98, .92, 2.58, 3.2], [-4.3, .68, 1.42, 2.55, 2.7], [-6.6, .48, 1.78, 2.56, 2.4], [-7.0, .452, 1.822, 2.567, 2.365], [-8.9, .32, 2.02, 2.6, 2.2]];
  const KH = SA.skin(ST.map(q => SA.sec(q[0], q[1], q[2], q[3], q[4], N)));
  const [fu, tc] = regroup(SA.loft(KH, { lines: [0, 2, 4, 6, 8, 10, 12, 14], fineJ: [2, 6, 10, 14], rings: [2, 4, 7, 10], al: .85, ral: .4 }), [['f', '', (pr, c) => c[2] > HL.ZF - .03], ['t']]);
  FU.push(...fu); TC.push(...tc);
  const SL = (uv, al) => FU.push(K.skQuad(KH, uv, fn({ al })));
  for (const m of [1, -1]) {
    const vv = v => m > 0 ? v : N - v;
    SL([[1.35, vv(.2)], [1.35, vv(2.7)], [2.75, vv(3.1)], [2.95, vv(.2)]], .75);
    SL([[3.0, vv(2.7)], [3.0, vv(4.3)], [3.85, vv(4.4)], [3.85, vv(2.7)]], .55);
    SL([[1.45, vv(5.2)], [1.6, vv(7.0)], [2.45, vv(7.0)], [2.35, vv(5.0)]], .45);
    SL([[2.92, vv(2.5)], [2.92, vv(6.9)], [4.02, vv(6.9)], [4.02, vv(2.5)]], .35);
  }
  SL([[4.35, 2.9], [4.35, 6.8], [5.55, 6.8], [5.55, 2.9]], .5);
  SL([[4.55, 3.2], [4.55, 4.5], [5.1, 4.5], [5.1, 3.2]], .4);
  SL([[4.4, N - 3.2], [4.4, N - 4.5], [5.0, N - 4.5], [5.0, N - 3.2]], .4);
  SL([[5.2, N - 3.3], [5.2, N - 4.4], [5.7, N - 4.4], [5.7, N - 3.3]], .35);
  // cabin door track; the windscreen's centre post in dots
  FU.push(dl([K.skAt(KH, 4.3, 2.8), K.skAt(KH, 6.2, 2.8)].map(p => V.add(p, [.02, 0, 0])), fn({ w: .45 })));
  FU.push(dl([K.skAt(KH, 1.4, 0), K.skAt(KH, 2.9, 0)].map(p => V.add(p, [0, .02, 0])), fn({ w: .6, ds: .45 })));
  // transmission and engine housing (open skin), the T700 nacelles, IR-suppressed exhausts
  const HS = [[2.55, .42, 2.52, 2.72, 3], [1.9, .6, 2.52, 3.3, 3.4], [-.9, .62, 2.52, 3.38, 3.4], [-2.6, .5, 2.5, 3.12, 3], [-3.9, .28, 2.48, 2.64, 2.5]];
  FU.push(...SA.loft(SA.skin(HS.map(q => SA.arc(q[0], q[1], q[2], q[3], q[4], 9)), true), { lines: [0, 2, 4, 6, 8], rings: [1, 3], al: .75, ral: .45 }));
  for (const s of [-1, 1]) {
    FU.push(lathe([s * .78, 2.98, -1.75], FZ, [[0, .2], [.35, .34], [2.7, .36], [3.25, .3], [3.35, .27]], { n: 16, gen: 4, rings: [1, 3] }));
    FU.push(ringW([s * .78, 2.98, 1.6], FZ, .2, fn({ n: 12 })), lathe([s * .78, 2.98, 1.2], FZ, [[0, .1], [.35, .16]], fn({ n: 10, gen: 4 })));
    FU.push(cyl([s * .95, 2.98, -1.6], [s * 1.34, 3.02, -2.35], .2, { n: 10, gen: 3 }), ringW([s * 1.34, 3.02, -2.35], V.norm([s * .39, .04, -.75]), .23, fn({ n: 12 })));
    FU.push(dl([[s * .78, 3.34, .9], [s * .78, 3.36, -1.2]], fn({ w: .4 })));
    FU.push(box([s * 1.14, 1.25, 4.1], [s * 1.2, 1.6, 4.5], fn()));                                                      // ESM
    FU.push(lathe([s * .9, 1.0, 4.9], V.norm([s, -.3, .5]), [[0, .07], [.05, .06], [.08, 0]], fn({ n: 10, gen: 0 })));      // missile warning sensors
    FU.push(lathe([s * .5, 2.3, -4.6], V.norm([s, .2, -.6]), [[0, .06], [.05, .05], [.07, 0]], fn({ n: 10, gen: 0 })));
    FU.push(box([s * .66, 1.6, -4.1], [s * .72, 1.95, -3.5], fn()));                                                     // dispensers
  }
  FU.push(cyl([0, 3.3, 0], [0, 3.82, 0], .16, { n: 10, gen: 0 }));
  FU.push(dl([[0, 2.6, -5.5], [0, 3.05, -5.9]], fn({ w: .6 })), dl([[0, 2.55, -3.8], [0, 2.95, -4.1]], fn({ w: .5 })));
  FU.push(lathe([0, 2.58, -2.9], FY, [[0, .08], [.1, .06], [.14, 0]], fn({ n: 10, gen: 0 })));                             // anti-collision light
  // rescue hoist over the cabin door (starboard), sonobuoy launcher (port, 5 x 5 tube ends)
  FU.push(box([1.02, 2.52, .55], [1.3, 2.72, 1.05], fn()), box([1.18, 2.58, .9], [1.62, 2.66, 1.0], fn()), dl([[1.6, 2.58, .95], [1.6, 2.2, .95]], fn({ w: .4 })));
  FU.push(box([-1.26, 1.02, -2.35], [-1.19, 2.05, -1.1]));
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) FU.push(ringW([-1.27, 1.14 + a * .2, -2.22 + b * .25], [-1, 0, 0], .075, fn({ n: 8 })));
  // tail pylon, rotor gearbox fairing, lights (fold with the pylon); the stabilators apart (they fold up first)
  TL.push(hex([[-.2, 2.1, -9.1], [.2, 2.1, -9.1], [.2, 2.1, -7.75], [-.2, 2.1, -7.75], [-.12, 4.5, -10.55], [.12, 4.5, -10.55], [.12, 4.5, -9.6], [-.12, 4.5, -9.6]]));
  TL.push(line([[-.13, 2.4, -8.1], [-.1, 4.4, -9.75]], fn({ w: .35, pts: false })), line([[.13, 2.4, -8.1], [.1, 4.4, -9.75]], fn({ w: .35, pts: false })));
  TL.push(lathe(V.mad(HL.TR, HL.TRA, -.34), HL.TRA, [[0, .2], [.22, .18], [.3, .1]], { n: 12, gen: 4 }));
  TL.push(line([[0, 4.5, -10.3], [0, 4.52, -11.0]], fn({ w: .5 })), sphere([0, 4.53, -10.1], .06, fn({ pts: false, n: 8 })));
  for (const s of [-1, 1]) TL.push(box([s * .1, 2.14, -7.2], [s * .2, 2.4, -6.95], fn()));                                 // fold hinge fittings
  TL.push(...TC);
  const SB = { 1: [], '-1': [] };
  for (const s of [-1, 1]) {
    SB[s].push(K.slab2([[s * .2, HL.STAB_Y, -9.72], [s * 2.2, HL.STAB_Y, -9.72], [s * 2.2, HL.STAB_Y, -8.86], [s * .2, HL.STAB_Y, -8.86]], [.1, .06, .06, .1]));
    SB[s].push(line([[s * 2.2, 2.3, -9.72], [s * 2.2, 2.62, -9.5]], fn({ w: .5 })));
    SB[s].push(dl([[s * .3, HL.STAB_Y + .05, -9.5], [s * 2.1, HL.STAB_Y + .03, -9.55]], fn({ w: .3, ds: .7 })));
  }
  // gear: mains on drag beams with shock struts, twin tail wheels (SH-60B layout, wheelbase 4.83 m), RAST probe
  for (const s of [-1, 1]) {
    const A = [s * 1.3, .33, 2.4];
    tyre(A, FX, .33, .24, G);
    G.push(rod([s * 1.02, .78, 3.15], [s * 1.18, .33, 2.42], .06), rod([s * 1.06, 1.35, 2.55], [s * 1.2, .52, 2.4], .07), rod([s * 1.12, .98, 2.5], [s * 1.2, .55, 2.4], .05, fn()));
    G.push(lathe([s * 1.18, .33, 2.4], [s, 0, 0], [[0, .12], [.04, .12]], fn({ n: 10, gen: 0, caps: true })));
    G.push(box([s * 1.0, .82, 2.3], [s * 1.2, 1.25, 3.15], fn()));
  }
  const tw = [0, .2, -2.43];
  G.push(rod([0, .8, -2.2], [0, .3, -2.4], .06), rod([-.2, tw[1], tw[2]], [.2, tw[1], tw[2]], .03), rod([0, .78, -1.9], [0, .32, -2.38], .035, fn()));
  for (const x of [-.13, .13]) tyre([x, tw[1], tw[2]], FX, .2, .11, G);
  G.push(rod([0, .58, -.85], [0, .38, -.85], .06, fn()), lathe([0, .38, -.85], [0, -1, 0], [[0, .07], [.04, .03]], fn({ n: 8, gen: 0 })));
  // sensors: MTS turret on its yoke, windows; APS-153 radome; AQS-22 dome in its well
  SN.push(cyl([0, .8, 4.95], [0, .72, 4.95], .09, fn({ n: 8, gen: 0 })), lathe([0, .74, 4.95], FY, [[0, .15], [.04, .15]], { n: 16, gen: 0, caps: true }));
  SN.push(sphere([0, .5, 4.95], .24, { n: 18, gen: 4 }));
  for (const x of [-.07, .07]) { const c = [x, .52, 5.18]; SN.push(panel([V.add(c, [-.045, -.045, 0]), V.add(c, [.045, -.045, 0]), V.add(c, [.045, .045, 0]), V.add(c, [-.045, .045, 0])], { edge: .7 }), rim(V.add(c, [0, 0, .01]), FZ, .045)); }
  SN.push(lathe([0, .55, .6], [0, -1, 0], [[0, .7], [.1, .68], [.2, .45], [.24, 0]], { n: 20, gen: 6 }));
  SN.push(lathe([0, .63, -1.0], [0, -1, 0], [[0, .26], [.07, .25], [.13, .15], [.15, 0]], { n: 16, gen: 4 }), rim([0, .62, -1.0], FY, .31));
  return { FU, TL, SB, G, SN, KH };
});
/* the rotor (dyn: droop, fold), in the model frame about the hub; the part's xf turns it (stopped for the fold) */
function hlRotor(st) {
  const P = [], dr = st.droop !== undefined ? sat(st.droop) : 0, bf = ss(0, .7, sat(st.fold || 0)), cone = .05 * (1 - dr), HC = HL.HC, Rr = HL.R;
  const rs = [1.12, 1.6, 3.2, 4.8, 6.4, 7.55, Rr], TGT = [-.11, -.04, .04, .11];
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2, u = [Math.sin(a), 0, Math.cos(a)], le = [-Math.cos(a), 0, Math.sin(a)];
    const yAt = r => HC[1] + .14 + cone * r - dr * .95 * Math.pow(r / Rr, 2.2);
    const edge = (r, side) => {
      const tip = Math.max(0, r - 7.55), ch = .53 - tip / (Rr - 7.55) * .15, sw = tip * Math.tan(20 * DEG);
      const off = side > 0 ? ch * .25 - sw : -ch * .75 - sw * .6;
      return [u[0] * r + le[0] * off, yAt(r) + (side > 0 ? .012 : -.012), u[2] * r + le[2] * off];
    };
    const L = rs.map(r => edge(r, 1)), T = rs.map(r => edge(r, -1)), B = [];
    B.push(line([...L, ...T.slice().reverse()], { closed: true, w: .85, pts: false }));
    for (let i = 0; i < rs.length - 1; i++) B.push(panel([L[i], L[i + 1], T[i + 1], T[i]], { al: 0, dot: true }));
    B.push(line([edge(7.55, 1), edge(7.55, -1)], fn({ w: .35, pts: false })));
    B.push(dl([edge(1.3, 1), edge(7.4, 1)], fn({ w: 0, ds: .5 })));                                                       // leading-edge abrasion strip
    let d = PI + TGT[k] - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU;
    const hinge = [u[0] * 1.12, yAt(1.12), u[2] * 1.12];
    P.push(...(bf > 0 ? tps(X.mul(T3([0, (.1 - .06 * k) * bf, 0]), about(R.y(d * bf), hinge)), B) : B));
    // cuff, elastomeric bearing, damper, pitch horn and link
    const at = (r, l, dy) => V.add(V.add(V.mul(u, r), V.mul(le, l)), [0, HC[1] + (dy || 0), 0]);
    P.push(hex([at(.32, -.07, .02), at(.32, .07, .02), at(1.12, .13, .1), at(1.12, -.4, .1), at(.32, -.07, .16), at(.32, .07, .16), at(1.12, .13, .16), at(1.12, -.4, .16)], { bottom: true }));
    P.push(lathe(at(.16, 0, .09), u, [[0, .1], [.2, .13], [.3, .1]], fn({ n: 10, gen: 0, caps: true })));
    P.push(rod(at(.3, .25, .06), at(.92, .19, .12), .045, fn()), rod(at(.62, .21, .1), at(.92, .19, .12), .028, fn()));
    P.push(box(at(.5, -.3, .04), at(.62, -.18, .12), fn()), rod(at(.56, -.26, .04), at(.5, -.26, -.47), .022, fn()));
    // bifilar absorber arm and its weight
    const ab = a + PI / 4, ub = [Math.sin(ab), 0, Math.cos(ab)];
    P.push(cyl([0, HC[1] + .36, 0], V.mad([0, HC[1] + .36, 0], ub, .5), .035, fn({ n: 6, gen: 0 })), cyl(V.mad([0, HC[1] + .3, 0], ub, .52), V.mad([0, HC[1] + .42, 0], ub, .52), .07, fn({ n: 8, gen: 0, caps: true })));
  }
  P.push(lathe([0, HC[1] - .12, 0], FY, [[0, .34], [.1, .42], [.22, .42], [.3, .3], [.34, .05]], { n: 16, gen: 4, rings: [1, 3], caps: true }));
  P.push(lathe([0, HC[1] + .34, 0], FY, [[0, .12], [.12, .1], [.18, 0]], fn({ n: 10, gen: 0 })));
  // swashplate (rotating over stationary), scissors
  P.push(lathe([0, HC[1] - .5, 0], FY, [[0, .5], [.06, .5]], { n: 20, gen: 0, rings: [0, 1], caps: true }), lathe([0, HC[1] - .58, 0], FY, [[0, .56], [.07, .56]], fn({ n: 20, gen: 0, caps: true })));
  P.push(dl([[.2, HC[1] - .45, 0], [.3, HC[1] - .3, .1], [.18, HC[1] - .14, 0]], fn({ w: .4 })));
  return P;
}
function hlTail(st) {
  const g = HL_GEO(), f = ss(0, .35, sat(st.fold || 0)), P = g.TL.slice();
  for (const s of [-1, 1]) P.push(...(f > 0 ? tps(about(R.z(s * f * 88 * DEG), [s * .2, HL.STAB_Y, 0]), g.SB[s]) : g.SB[s]));
  return P;
}
const HL_STORE = memo(() => {
  const HF = flat(K.hellfire(), {}), MK = [lathe([0, 0, -1.36], FZ, [[0, .09], [.08, .15], [.2, .162], [2.3, .162], [2.55, .14], [2.72, 0]], { n: 18, gen: 4, rings: [1, 3], caps: true })];
  MK.push(box([-.12, -.12, -1.62], [.12, .12, -1.36]), ringW([0, 0, .3], FZ, .165, fn({ n: 16 })), box([-.04, .15, -.6], [.04, .2, .5], fn()));
  const M299 = [box([-.03, -.28, -.95], [.03, .08, .75]), box([-.3, .05, -.95], [.3, .12, .75]), box([-.26, -.29, -.9], [.26, -.25, .7], fn())];
  return { HF, MK, M299 };
});
function hlPylons(st) {
  const g = HL_STORE(), nh = count(st.hellfire, 4, 4), nm = count(st.mk54, 2, 2), P = [];
  for (const s of [-1, 1]) {
    P.push(K.slab2([[s * 1.12, 1.95, -1.6], [s * 2.3, 1.95, -1.6], [s * 2.3, 1.95, -.5], [s * 1.12, 1.95, -.5]], .12));
    for (const x of [1.52, 2.08]) P.push(hex([[s * (x - .05), 1.66, -1.35], [s * (x + .05), 1.66, -1.35], [s * (x + .05), 1.66, -.75], [s * (x - .05), 1.66, -.75], [s * (x - .06), 1.9, -1.45], [s * (x + .06), 1.9, -1.45], [s * (x + .06), 1.9, -.62], [s * (x - .06), 1.9, -.62]]));
  }
  // port outboard: M299 with four Hellfire (two a side, two high); Mk 54 under both inboard stations
  P.push(...tps(T3([-2.08, 1.55, -.95]), g.M299));
  const HP = [[-.13, -.08], [.13, -.08], [-.13, -.3], [.13, -.3]];
  for (let k = 0; k < nh; k++) P.push(...tps(T3([-2.08 + HP[k][0], 1.55 + HP[k][1], -.85]), g.HF));
  if (nm >= 1) P.push(...tps(T3([1.52, 1.44, -.95]), g.MK));
  if (nm >= 2) P.push(...tps(T3([-1.52, 1.44, -.95]), g.MK));
  return P;
}
function heloD() {
  const B = HD.helo(), g = HL_GEO(), trp = B.parts.find(p => p.name === 'tailrotor').prims;
  const hb = V.mad(HL.TR, HL.TRA, .05);
  const TRH = [lathe(V.mad(HL.TR, HL.TRA, -.02), HL.TRA, [[0, .09], [.18, .09]], fn({ n: 10, gen: 0, caps: true })), rod(hb, V.add(hb, [0, .3, 0]), .02, fn()), rod(hb, V.add(hb, [0, -.3, 0]), .02, fn())];
  return {
    name: 'helo', L: 19.76, HUB: HL.HC.slice(),
    parts: [
      { name: 'fuselage', label: 'MH-60R Seahawk', prims: g.FU },
      { name: 'rotor', label: 'Main rotor · 4 blades · 16.36 m · folds aft', prims: hlRotor({}), dyn: hlRotor, xf: st => about(R.y(-(st.rotor || 0) * (1 - sat(st.fold || 0))), HL.HC) },
      { name: 'tailrotor', label: 'Tail rotor · canted 20°', prims: trp.concat(TRH), xf: st => X.mul(hlFoldXf(st), about(SA.Rax(HL.TRA, st.trotor || 0), HL.TR)) },
      { name: 'tail', label: 'Tail pylon · folds to port · stabilators', prims: hlTail({}), dyn: hlTail, xf: hlFoldXf },
      { name: 'gear', label: 'Landing gear · mains · twin tail wheels · RAST probe', prims: g.G },
      { name: 'sensors', label: 'MTS FLIR · AN/APS-153 radome · AQS-22 dome', prims: g.SN },
      { name: 'pylons', label: 'Weapon pylons · Mk 54 ×2 · M299 · AGM-114 ×4', prims: hlPylons({}), dyn: hlPylons },
    ],
  };
}
function hlInside() {
  const CB = [], EN = [], GB = [], TD = [], FC = [];
  // cockpit: floor, two armoured seats, instrument panel with four displays, centre and overhead consoles, cyclics
  vol([-.95, .7, 2.3], [.95, .76, 4.6], CB, { ds: 2.4 });
  for (const x of [-.5, .5]) {
    vol([x - .24, .76, 2.85], [x + .24, 1.15, 3.35], CB); vol([x - .24, 1.15, 2.68], [x + .24, 2.0, 2.85], CB); vol([x - .14, 2.0, 2.7], [x + .14, 2.22, 2.84], CB, { fine: true });
    CB.push(rod([x, .76, 3.55], [x, 1.35, 3.62], .025, fn()));
  }
  vol([-.85, 1.25, 3.95], [.85, 1.72, 4.12], CB);
  for (const x of [-.62, -.22, .22, .62]) CB.push(line([[x - .14, 1.34, 3.945], [x + .14, 1.34, 3.945], [x + .14, 1.62, 3.945], [x - .14, 1.62, 3.945]], { closed: true, w: .5, ds: .5 }));
  vol([-.15, .76, 3.0], [.15, 1.28, 3.95], CB); vol([-.3, 2.3, 2.55], [.3, 2.44, 3.6], CB, { fine: true });
  // cabin: floor, the sensor operator's console and seat, a second station, the ALFS reel and its well, the launcher, troop seats
  vol([-1.05, .64, -2.5], [1.05, .7, 2.3], CB, { ds: 2.6 });
  vol([-1.1, .7, .9], [-.55, 1.85, 1.9], CB);
  CB.push(line([[-.545, 1.2, 1.05], [-.545, 1.2, 1.75], [-.545, 1.7, 1.75], [-.545, 1.7, 1.05]], { closed: true, w: .5, ds: .5 }));
  for (const z of [1.4, .1]) { vol([-.35, .7, z - .25], [.05, 1.08, z + .25], CB); vol([.05, 1.08, z - .24], [.2, 1.8, z + .24], CB); }
  vol([-1.05, .7, -.5], [-.6, 1.6, .5], CB);
  drum([.2, 1.25, -.3], [.9, 1.25, -.3], .45, CB); vol([.12, .7, -.8], [.98, .82, .2], CB, { fine: true }); drum([.55, .7, -.3], [.55, .5, -.3], .2, CB, { fine: true });
  vol([-1.12, .95, -2.35], [-.72, 2.1, -1.1], CB);
  for (const z of [-2.1, -1.55]) vol([.3, .7, z - .22], [1.0, 1.1, z + .22], CB, { fine: true });
  // T700-GE-401C ×2 in the nacelles
  for (const s of [-1, 1]) {
    const a = [s * .78, 2.98, .95], d = [0, 0, -1];
    EN.push(lathe(a, d, [[0, .2], [.15, .27], [.6, .29], [.9, .25], [1.25, .28], [1.7, .2]], { n: 20, gen: 4, rings: [1, 3], caps: true, ds: 1.5 }));
    for (const [t, r] of [[.15, .28], [.9, .26], [1.25, .29]]) EN.push(rim(V.mad(a, d, t), d, r));
    EN.push(rod([s * .78, 2.98, .95], [s * .45, 2.95, .6], .06, fn()));
  }
  // main gearbox: the main module, two input modules, accessory modules; tail drive shaft to the fold joint
  GB.push(lathe([0, 2.52, 0], FY, [[0, .52], [.4, .56], [.62, .46], [.82, .2]], { n: 22, gen: 4, rings: [1, 2], caps: true, ds: 1.6 }), rim([0, 2.92, 0], FY, .57));
  for (const s of [-1, 1]) { vol([s * .28, 2.7, .3], [s * .62, 3.1, .85], GB); vol([s * .45, 2.62, -.55], [s * .78, 2.92, -.1], GB, { fine: true }); }
  GB.push(rod([0, 2.75, -.6], [0, 2.62, HL.ZF + .05], .055));
  for (let z = -2; z > HL.ZF; z -= 1.6) GB.push(rim([0, 2.7 + (z + .6) * .02, z], FZ, .09, fn()));
  // in the pylon: intermediate and tail gearboxes, the shaft up the pylon (folds with it)
  TD.push(rod([0, 2.6, HL.ZF - .05], [0, 2.5, -8.2], .055)); vol([-.16, 2.3, -8.5], [.16, 2.62, -8.0], TD);
  TD.push(rod([0, 2.55, -8.35], V.add(HL.TR, [-.2, -.2, .2]), .05)); vol([-.12, 3.42, -10.0], [.28, 3.8, -9.62], TD);
  // fuel cells behind the cabin
  for (const s of [-1, 1]) vol([s * .04, 1.3, -3.85], [s * .52, 2.08, -2.65], FC, { ds: 2.6 });
  return { CB, EN, GB, TD, FC };
}
function heloCutD() {
  const M = heloD(), I = hlInside();
  const C = K.cutBySides(M, 'helo_cut', { pylons: 'Weapon pylons', gear: p => K.splitPart(p, [{ name: 'gearL', label: 'Main gear · L', test: (pr, c) => c[0] < -.3 && c[2] > 0 }, { name: 'gearR', label: 'Main gear · R', test: (pr, c) => c[0] > .3 && c[2] > 0 }, { name: 'gearT', label: 'Tail wheels ×2 · RAST probe' }]) });
  C.parts.push(O({ name: 'cabin', label: 'Cockpit · cabin · SO station · ALFS reel · launcher', prims: I.CB }, hidden));
  C.parts.push(O({ name: 'engines', label: 'T700-GE-401C ×2 · 1 900 shp', prims: I.EN }, hidden));
  C.parts.push(O({ name: 'gearbox', label: 'Main gearbox · tail drive shaft', prims: I.GB }, hidden));
  C.parts.push(O({ name: 'tailDrive', label: 'Intermediate · tail gearboxes', prims: I.TD, xf: hlFoldXf }, hidden));
  C.parts.push(O({ name: 'fuel', label: 'Fuel cells ×2', prims: I.FC }, hidden));
  return C;
}

/* ================================================================ E-2D Advanced Hawkeye (data/models.js aew) + gear
   The game's E-2D with its tricycle gear (gear): twin nose wheels with the launch bar, retracting aft; single mains
   under the nacelles, retracting forward and turning flat into them; bay doors. It stands 5.58 m high on it (the
   fuselage axis 2.1 m over the deck: E2D.GEAR_H). Cutaway: + the rotodome's structure (ribs, ring frames, the rotary
   coupler and drive) turning with the dome, a flight deck and CIC with seats, consoles and displays as volumes. */
const E2G = { NH: [0, -.92, 6.55], MX: 3.72, MH_Y: -.72, MH_Z: .55, Y0: -2.1 };
const E2_GEAR = memo(() => {
  const N = [], M = { 1: [], '-1': [] }, D = { 1: [], '-1': [] }, ND = { 1: [], '-1': [] }, NH = E2G.NH, y0 = E2G.Y0;
  // nose: strut, oleo, twin wheels, torque links, launch bar (raised), holdback fitting, taxi light, drag brace
  const ax = [0, y0 + .28, 6.72];
  N.push(rod(NH, [0, -1.48, 6.66], .08), rod([0, -1.45, 6.66], [0, ax[1] + .05, 6.71], .06));
  N.push(rod([-.24, ax[1], ax[2]], [.24, ax[1], ax[2]], .035));
  for (const sx of [-1, 1]) tyre([sx * .16, ax[1], ax[2]], FX, .28, .15, N);
  N.push(dl([[0, -1.4, 6.6], [0, -1.55, 6.5], [0, -1.7, 6.66]], fn({ w: .5 })));
  N.push(hex([[-.05, -1.66, 6.8], [.05, -1.66, 6.8], [.05, -1.36, 7.5], [-.05, -1.36, 7.5], [-.05, -1.6, 6.8], [.05, -1.6, 6.8], [.05, -1.3, 7.5], [-.05, -1.3, 7.5]]));
  N.push(box([-.06, -1.25, 6.45], [.06, -1.15, 6.55], fn()), box([-.07, -1.2, 6.74], [.07, -1.1, 6.84], fn()));
  N.push(rod([0, -.98, 7.25], [0, -1.35, 6.68], .04, fn()));
  for (const s of [-1, 1]) ND[s].push(plate2([[s * .24, -1.1, 5.9], [s * .02, -1.1, 5.9], [s * .02, -1.1, 7.15], [s * .24, -1.1, 7.15]], .02));
  // mains: oleo strut raked aft, fork, single wheel, drag and side braces; the nacelle's bay doors
  for (const s of [-1, 1]) {
    const x = s * E2G.MX, H = [x, E2G.MH_Y, E2G.MH_Z], A = [x, y0 + .46, -.25];
    M[s].push(rod(H, V.lerp(H, A, .55), .1), rod(V.lerp(H, A, .5), V.add(A, [0, .38, .03]), .075));
    for (const dx of [-.19, .19]) M[s].push(rod(V.add(A, [dx, .5, .02]), V.add(A, [dx, 0, 0]), .035));
    M[s].push(rod(V.add(A, [-.22, 0, 0]), V.add(A, [.22, 0, 0]), .045));
    tyre(A, FX, .46, .28, M[s]);
    M[s].push(rod([x, -.8, -.95], V.lerp(H, A, .55), .045), rod([x - s * .45, -.62, .3], V.lerp(H, A, .45), .035, fn()));
    for (const e of [-1, 1]) D[s].push(plate2([[x + e * .3, -.86, -1.1], [x + e * .05, -.86, -1.1], [x + e * .05, -.86, 1.05], [x + e * .3, -.86, 1.05]], .02));
  }
  return { N, M, D, ND };
});
function e2Gear(st) {
  const g = E2_GEAR(), u = 1 - sat(st.gear || 0), P = [];
  P.push(...(u > 0 ? tps(about(R.x(u * PI / 2), E2G.NH), g.N) : g.N));
  for (const s of [-1, 1]) {
    const H = [s * E2G.MX, E2G.MH_Y, E2G.MH_Z], dS = V.norm(V.sub([s * E2G.MX, E2G.Y0 + .46, -.25], H));
    P.push(...(u > 0 ? tps(about(R.mul(R.x(-u * PI / 2), SA.Rax(dS, s * u * PI / 2)), H), g.M[s]) : g.M[s]));
    P.push(...tps(about(R.z(s * (1 - u) * 84 * DEG), [s * .24, -1.1, 6.5]), g.ND[s]));
    for (const e of [-1, 1]) P.push(...tps(about(R.z(e * (1 - u) * 80 * DEG), [s * E2G.MX + e * .3, -.86, 0]), g.D[s].slice(e < 0 ? 0 : 1, e < 0 ? 1 : 2)));
  }
  return P;
}
const E2_GEAR_PART = { name: 'gear', label: 'Landing gear · twin nose wheels · mains', prims: [], dyn: e2Gear, show: st => (st.gear || 0) > .01 };
function aewD() {
  const M = K.aew();
  return O(M, { GEAR_H: -E2G.Y0, parts: M.parts.map(p => O(p)).concat([O(E2_GEAR_PART, { prims: e2Gear({ gear: 1 }) })]) });
}
/* the rotodome's structure (dome frame): radial ribs, ring frames, the rotary coupler and its drive */
function e2DomeFrame() {
  const P = [], E2 = K.E2, h = r => K.e2Dome(r) * .82;
  for (let k = 0; k < 8; k++) {
    const a = (k + .5) / 8 * TAU, u = [Math.sin(a), 0, Math.cos(a)], w = [u[2] * .025, 0, -u[0] * .025], r0 = .62, r1 = 3.42;
    const q = (r, s, y) => [u[0] * r + w[0] * s, y, u[2] * r + w[2] * s];
    P.push(hex([q(r0, -1, -h(r0)), q(r0, 1, -h(r0)), q(r1, 1, -h(r1)), q(r1, -1, -h(r1)), q(r0, -1, h(r0)), q(r0, 1, h(r0)), q(r1, 1, h(r1)), q(r1, -1, h(r1))], { bottom: true, ds: 1.4 }));
  }
  for (const r of [1.85, 3.45]) { P.push(lathe([0, -h(r), 0], FY, [[0, r], [2 * h(r), r]], { n: 48, gen: 0, rings: [0, 1], ds: 1.8 })); P.push(rim([0, h(r), 0], FY, r), rim([0, -h(r), 0], FY, r)); }
  drum([0, -.42, 0], [0, -.2, 0], .34, P); vol([.42, -.46, -.18], [.72, -.22, .18], P); vol([-2.6, .14, -.14], [2.6, .22, .14], P, { fine: true });
  return P;
}
/* flight deck and CIC (volumes) */
function e2Cabin() {
  const P = [];
  vol([-1.0, -.62, 4.6], [1.0, -.56, 7.3], P, { ds: 2.6 });
  for (const x of [-.55, .55]) { vol([x - .25, -.56, 5.3], [x + .25, -.22, 5.85], P); vol([x - .25, -.22, 5.1], [x + .25, .55, 5.3], P); vol([x - .14, .55, 5.12], [x + .14, .8, 5.26], P, { fine: true }); P.push(rod([x, -.56, 6.22], [x, .05, 6.32], .03, fn())); }
  vol([-.95, -.1, 6.55], [.95, .45, 6.8], P); vol([-.95, .45, 6.5], [.95, .55, 6.95], P, { fine: true });
  for (const x of [-.55, 0, .55]) P.push(line([[x - .19, .02, 6.545], [x + .19, .02, 6.545], [x + .19, .32, 6.545], [x - .19, .32, 6.545]], { closed: true, w: .5, ds: .5 }));
  vol([-.18, -.56, 5.9], [.18, -.05, 6.55], P); vol([-.5, .95, 5.4], [.5, 1.05, 6.4], P, { fine: true });
  // CIC: three operator stations along the starboard wall (console, display tower, seat), racks fore and aft
  vol([-1.05, -.72, -3.2], [1.05, -.64, 4.3], P, { ds: 2.8 });
  for (const c of [-.6, .6, 1.8]) {
    vol([.35, -.64, c - .5], [1.0, .15, c + .45], P); vol([.72, .15, c - .45], [1.0, .82, c + .4], P);
    for (const y of [.25, .55]) P.push(line([[.715, y, c - .3], [.715, y, c + .28], [.715, y + .24, c + .28], [.715, y + .24, c - .3]], { closed: true, w: .5, ds: .5 }));
    vol([-.25, -.64, c - .25], [.15, -.25, c + .25], P); vol([-.35, -.25, c - .23], [-.25, .5, c + .23], P);
  }
  for (const x0 of [-1.0, .3]) vol([x0, -.64, -3.1], [x0 + .7, .9, -2.35], P);
  vol([-1.0, -.64, 3.0], [-.35, .95, 3.8], P); vol([.35, -.64, 3.0], [1.0, .95, 3.8], P);
  return P;
}
function aewCutD() {
  const M = K.aewCut(), E2 = K.E2;
  const parts = M.parts.map(p => p.name === 'cabin' ? O(p, { label: 'Flight deck · CIC · operator stations ×3', prims: e2Cabin() }) : O(p));
  parts.push(...K.splitPart(O(E2_GEAR_PART, { prims: e2Gear({ gear: 1 }) }), [{ name: 'gearN', label: 'Nose gear · twin wheels · launch bar', test: (pr, c) => c[2] > 3 }, { name: 'gearL', label: 'Main gear · L', test: (pr, c) => c[0] < 0 }, { name: 'gearR', label: 'Main gear · R' }]));
  parts.push(O({ name: 'domeFrame', label: 'Rotodome structure · ribs ×8 · rotary coupler', prims: e2DomeFrame(), xf: st => X.make(R.y(st.dome || 0), E2.DOME_C) }, hidden));
  return O(M, { parts, GEAR_H: -E2G.Y0 });
}

/* ================================================================ the trucks: MZKT-7930 (TEL, radar, Bal, K342P) and KamAZ-6560 (Pantsir)
   The cab's glass left open in the dots (the films' dark glass: windscreen, door windows, corner windows) with its
   interior seen through it (cabIn: three seats, the dashboard with its cluster, the steering wheel, the gear lever;
   the KamAZ's engine cover between the seats); lamps, lenses, grille bars, mirror arms and the windscreen's pillar in
   dots; tyre tread (a staggered lug pattern that turns with the wheel). Cutaways add the transmission, transfer case,
   cardan shafts and hub reductions (volumes) where they were missing, and the K342P gets a cutaway of its own. */
/* tyre tread: staggered rows of raised lugs across the tread (dots only), leaning like an off-road tread, turning with
   the wheel (o as HD.wheel) */
function tread(P, z, side, o) {
  o = o || {};
  const r = o.r || .74, w = o.w || .55, xi = o.x === undefined ? 1.0 : o.x, y = o.y === undefined ? r : o.y;
  const n = (o.lugs || 15) | 1, rot = o.rot || 0, pitch = TAU / n, hw = pitch * .2;
  const at = (s, a, rr) => [side * (xi + s), y + rr * Math.cos(a), z + rr * Math.sin(a)];
  for (const h of [0, 1]) {
    const sh = h ? w - .06 : .06, mid = w / 2 + (h ? -.03 : .03), off = h ? pitch / 2 : 0;
    for (let k = 0; k < n; k++) {
      const a0 = rot + k * pitch + off, a1 = a0 + pitch * .22, lo = r - .004, hi = r + .02;
      P.push(hex([at(sh, a0 - hw, lo), at(sh, a0 + hw, lo), at(mid, a1 + hw, lo), at(mid, a1 - hw, lo), at(sh, a0 - hw, hi), at(sh, a0 + hw, hi), at(mid, a1 + hw, hi), at(mid, a1 - hw, hi)], { al: 0, fine: true, skip: [0] }));
    }
  }
  return P;
}
const dtWheelSide = (axles, side, rot, o) => { const P = []; for (const z of axles) { HD.wheel(P, z, side, O(o, { rot })); tread(P, z, side, O(o, { rot })); } return P; };
const dtWheelSet = (axles, rot, o) => dtWheelSide(axles, -1, rot, o).concat(dtWheelSide(axles, 1, rot, o));
/* the cab's shell prims with the window faces left to plates that keep the glass open. which: 'mzkt' | 'kamaz' */
const isYs = (pr, a, b) => pr.t === 'hex' && pr.p.every(q => Math.abs(q[1] - a) < 1e-6 || Math.abs(q[1] - b) < 1e-6);
function glassMzkt(prims) {
  const hw = 1.5, yW = 2.3, yT = 3.2, xc = 1.08, ch = .4, zb = 4.1, zf = 6.3, P = [];
  const out = prims.map(pr => {
    if (!isYs(pr, yW, yT)) return pr;
    const xs = pr.p.map(q => q[0]);
    if (Math.min(...xs) < -.5 && Math.max(...xs) > .5) return O(pr, { skip: [3, 4, 5] });   // greenhouse: its windscreen face
    return O(pr, { skip: [3, 4, 5] });                                                        // side blocks: door window, corner window
  });
  // windscreen (split by the centre post), door windows, corner windows
  K.cvWall([-xc, yW, zf - .03], [xc, yW, zf - .03], [xc - .02, yT, zf - .45], [-xc + .02, yT, zf - .45], V.norm([0, .42, .9]), [[.1, .86, .046, .954, 2]], P);
  P.push(SA.plate([[-.05, yW + .09, zf - .07], [.05, yW + .09, zf - .07], [.05, yW + .77, zf - .39], [-.05, yW + .77, zf - .39]], V.norm([0, .42, .9])));
  for (const sx of [-1, 1]) {
    const a = sx * xc, b = sx * hw, a2 = sx * (xc - .02), b2 = sx * (hw - .08);
    K.cvWall([b, yW, zb], [b, yW, zf - ch - .03], [b2, yT, zf - ch - .5], [b2, yT, zb + .06], [sx, .09, 0], [[.12, .84, .3, .86, 1]], P);
    K.cvWall([a, yW, zf - .03], [b, yW, zf - ch - .03], [b2, yT, zf - ch - .5], [a2, yT, zf - .45], V.norm([sx * .4, .25, .42]), [[.12, .84, .15, .85, 1]], P);
  }
  return out.concat(P);
}
function glassKamaz(prims) {
  const hw = 1.25, yW = 2.2, yT = 3.2, zb = 3.15, zf = 5.35, P = [];
  const out = prims.map(pr => isYs(pr, yW, yT) ? O(pr, { skip: [3, 4, 5] }) : pr);
  K.cvWall([-hw, yW, zf], [hw, yW, zf], [hw - .05, yT, zf - .22], [-hw + .05, yT, zf - .22], V.norm([0, .22, 1]), [[.08, .9, .04, .96, 2]], P);
  P.push(SA.plate([[-.04, yW + .08, zf - .01], [.04, yW + .08, zf - .01], [.04, yW + .9, zf - .2], [-.04, yW + .9, zf - .2]], V.norm([0, .22, 1])));
  for (const sx of [-1, 1]) K.cvWall([sx * hw, yW, zb], [sx * hw, yW, zf], [sx * (hw - .05), yT, zf - .22], [sx * (hw - .05), yT, zb + .04], [sx, .05, 0], [[.1, .86, .45, .92, 1]], P);
  return out.concat(P);
}
/* lamps, lenses, grille bars, mirror arms, wipers, steps in dots (the HD cab draws most of them as hairlines) */
function cabDots(kind) {
  const P = [], mz = kind === 'mzkt';
  const zf = mz ? 6.3 : 5.35, hw = mz ? 1.5 : 1.25, lamp = mz ? [1.18, 1.18, zf + .15] : [.95, 1.02, zf + .17];
  for (const sx of [-1, 1]) {
    const c = [sx * lamp[0], lamp[1], lamp[2]];
    P.push(lathe(c, FZ, [[0, .115], [.04, .115], [.06, .09], [.065, 0]], fn({ n: 16, gen: 0, ds: .6 })), rim(V.add(c, [0, 0, .05]), FZ, .06, fn()));
    // mirror arm and head, wiper
    if (mz) {
      const m0 = [sx * (hw - .05), 2.95, zf - .85], m1 = [sx * 1.86, 3.0, zf - .3];
      P.push(rod(m0, m1, .018, fn()), rod(m1, [sx * 1.86, 2.5, zf - .3], .018, fn()), box([sx * 1.79, 2.48, zf - .38], [sx * 1.94, 3.0, zf - .28], fn()));
      P.push(rod([sx * .35, 2.44, zf - .1], [sx * .95, 2.95, zf - .33], .012, fn()));
    } else {
      const m0 = [sx * (hw - .02), 2.9, zf - .08], m1 = [sx * 1.6, 2.95, zf + .05];
      P.push(rod(m0, m1, .018, fn()), rod(m1, [sx * 1.6, 2.45, zf + .05], .018, fn()), box([sx * 1.54, 2.46, zf - .01], [sx * 1.67, 2.94, zf + .07], fn()));
      P.push(rod([sx * .3, 2.3, zf + .005], [sx * .85, 2.75, zf - .1], .012, fn()));
    }
  }
  // grille bars
  const g = mz ? [-.9, .9, 1.7, 2.2, zf + .02] : [-.85, .85, 1.52, 2.1, zf + .02];
  for (let k = 0; k < 6; k++) { const y = g[2] + (k + .5) * (g[3] - g[2]) / 6; P.push(box([g[0], y - .018, g[4] - .02], [g[1], y + .018, g[4] + .015], fn())); }
  return P;
}
/* the cab's interior, seen through the glass: floor, three seats, dashboard with its cluster, wheel, lever */
function cabIn(kind) {
  const P = [], mz = kind === 'mzkt';
  const yF = mz ? 1.6 : 1.35, zb = mz ? 4.1 : 3.15, zd = mz ? 5.75 : 4.85, hw = mz ? 1.42 : 1.18, xs = mz ? [-.74, 0, .74] : [-.64, 0, .64];
  vol([-hw, yF - .04, zb + .08], [hw, yF, zd + .3], P, { ds: 2.6 });
  xs.forEach((x, i) => {
    const y0 = yF + (!mz && i === 1 ? .45 : 0), z0 = zb + .35;
    vol([x - .23, y0 + .36, z0 + .15], [x + .23, y0 + .48, z0 + .62], P);
    vol([x - .23, y0 + .48, z0], [x + .23, y0 + 1.15, z0 + .15], P);
    vol([x - .14, y0 + 1.15, z0 + .01], [x + .14, y0 + 1.35, z0 + .13], P, { fine: true });
    P.push(rod([x, yF, z0 + .38], [x, y0 + .36, z0 + .38], .04, fn()));
  });
  if (!mz) vol([-.4, yF, zb + .7], [.4, yF + .45, zd - .05], P);                                   // engine cover
  vol([-hw, yF + .45, zd], [hw, yF + .8, zd + .3], P);
  const xd = xs[0];
  P.push(line([[xd - .2, yF + .66, zd - .005], [xd + .2, yF + .66, zd - .005], [xd + .2, yF + .78, zd - .005], [xd - .2, yF + .78, zd - .005]], { closed: true, w: .5, ds: .5 }));
  const wc = [xd, yF + .82, zd - .28], wd = V.norm([0, .55, .83]);
  P.push(rod([xd, yF + .6, zd], wc, .03, fn()), lathe(V.mad(wc, wd, -.02), wd, [[0, .21], [.04, .21]], { n: 20, gen: 0, rings: [0, 1] }), rim(wc, wd, .21));
  P.push(rod([xs[0] * .45, yF, zd - .45], [xs[0] * .45 + .02, yF + .45, zd - .52], .015, fn()), box([xs[0] * .45 - .03, yF + .44, zd - .56], [xs[0] * .45 + .05, yF + .5, zd - .48], fn()));
  return P;
}
/* side marker lamps and reflectors along the frame (MZKT) */
function frameDots(zs, hw, y) {
  const P = [];
  for (const sx of [-1, 1]) for (const z of zs) P.push(box([sx * hw - .03, y, z - .06], [sx * hw + .03, y + .07, z + .06], fn({ ds: .5 })));
  return P;
}
const MZ_WH = {}, KZ_WH = { r: .62, w: .42, x: .85, lugs: 14, n: 22 };
const MZ_AX = [4.45, 2.25, -2.75, -4.95];
/* patch a truck model: the cab's glass and dots, the interior, tread on the wheels, frame dots */
function truckPatch(m, o) {
  const parts = m.parts.map(p => O(p)), by = n => parts.find(p => p.name === n);
  const cab = by('cab'); cab.prims = (o.kind === 'mzkt' ? glassMzkt : glassKamaz)(cab.prims).concat(cabDots(o.kind));
  for (const nm of ['wheels', 'wheelsL', 'wheelsR', 'tyresL', 'tyresR']) {
    const p = by(nm); if (!p) continue;
    const side = /L$/.test(nm) ? -1 : /R$/.test(nm) ? 1 : 0, ax = o.axles, wo = o.wo;
    p.dyn = side ? st => dtWheelSide(ax, side, st.wheel || 0, wo) : st => dtWheelSet(ax, st.wheel || 0, wo);
    p.prims = p.dyn({});
  }
  const fr = by(o.frame || 'chassis'); if (fr && o.lamps) fr.prims = fr.prims.concat(frameDots(o.lamps, o.kind === 'mzkt' ? 1.3 : 1.25, o.kind === 'mzkt' ? 1.25 : 1.1));
  if (o.cut) parts.splice(parts.indexOf(cab) + 1, 0, O({ name: 'cabIn', label: 'Cab interior · seats ×3 · controls', prims: cabIn(o.kind) }, hidden));
  return O(m, { parts });
}
const MZ_O = { kind: 'mzkt', axles: MZ_AX, wo: MZ_WH, lamps: [.3, -3.9] };
const KZ_O = { kind: 'kamaz', axles: [3.9, 2.1, -1.9, -3.3], wo: KZ_WH, lamps: [.8, -2.6] };
const telD = () => truckPatch(HD.tel(), MZ_O);
const radarD = () => truckPatch(HD.radar(), MZ_O);
const pantsirD = () => truckPatch(HD.pantsir(), KZ_O);
const balD = () => truckPatch(K.bal(), MZ_O);
const transloaderD = () => truckPatch(K.transloader(), MZ_O);
/* the MZKT-7930's driveline (volumes): hydromechanical transmission, transfer case, cardan shafts, hub reductions */
const mzDrive = () => K.mzktGearbox().concat(K.mzktTransfer(), K.mzktShafts(), K.mzktHubs(-1), K.mzktHubs(1));
/* the KamAZ-6560's: transfer case between the second and third axles, shafts, hub reductions */
function kzDrive() {
  const P = [], ax = [3.9, 2.1, -1.9, -3.3], y = .62;
  P.push(box([-.3, .5, -.25], [.3, .92, .6], { bottom: true }));
  for (const z of [-.05, .2, .4]) P.push(box([-.315, .49, z], [.315, .93, z + .03]));
  const sh = (a, b) => { const L = V.dist(a, b); return lathe(a, V.sub(b, a), [[0, .065], [.05, .065], [.08, .042], [L - .08, .042], [L - .05, .065], [L, .065]], { n: 12, caps: true }); };
  P.push(sh([0, 1.0, 2.82], [0, .78, .6]), sh([0, .7, .6], [0, y, 1.85]), sh([0, y, 2.35], [0, y, 3.65]), sh([0, .7, -.25], [0, y, -1.65]), sh([0, y, -2.15], [0, y, -3.05]));
  for (const sx of [-1, 1]) for (const z of ax) P.push(lathe([sx * .7, y, z], [sx, 0, 0], [[0, .09], [.08, .14], [.12, .26], [.15, .3], [.44, .3], [.47, .25], [.5, .16], [.58, .16], [.6, .1]], { n: 26, caps: true }));
  return P;
}
/* cutaways: the unit cutaway with the patched cab, tyres and interior; driveline added where it was missing */
function truckCut(C, o, drive, driveLabel) {
  const M = truckPatch(C, O(o, { frame: 'frame', cut: true }));
  if (drive) M.parts.push(O({ name: 'drive', label: driveLabel, prims: drive }, hidden));
  return M;
}
const telCutD = () => truckCut(K.telCut(), MZ_O);
const radarCutD = () => truckCut(K.radarCut(), MZ_O, mzDrive(), 'Transmission · transfer case · cardan shafts · hub reductions');
const balCutD = () => truckCut(K.balCut(), MZ_O, mzDrive(), 'Transmission · transfer case · cardan shafts · hub reductions');
const pantsirCutD = () => truckCut(K.pantsirCut(), KZ_O, kzDrive(), 'Transfer case · cardan shafts · hub reductions');
function transloaderCutD() {
  const M = truckPatch(K.transloader(), O(MZ_O, { cut: true })), eng = K.yamz846();
  for (const sx of [-1, 1]) eng.push(...K.mzktRadiator(sx, 0));
  M.parts.push(O({ name: 'engine', label: 'YaMZ-846 · V12 · radiators ×2', prims: eng }, hidden));
  M.parts.push(O({ name: 'drive', label: 'Transmission · transfer case · cardan shafts · hub reductions', prims: mzDrive() }, hidden));
  return O(M, { name: 'transloader_cut' });
}

/* ================================================================ Orlan-10 and its launch rail
   Orlan-10 (1.8 m, 3.1 m span, tractor propeller in the nose: the brief's "pusher" is not the Orlan-10's layout):
   a propeller with twisted blades, spinner and backplate; the gimbal on a yoke with its windows; the launch shoe the
   carriage holds (the cradle points), the parachute hatch, cooling inlets. Cutaway: the engine, fuel tank, avionics
   bay with the autopilot, datalink and battery, the camera bay and parachute (volumes). The rail: tread on the
   trailer's tyres, lamps, the air line; the carriage's V-cradle pads and release hook. */
const DR = { PROP: HD.drone.PROP, GIM: HD.drone.GIMBAL };
function drProp() {
  const P = [], c = DR.PROP;
  P.push(lathe([c[0], c[1], c[2] - .07], FZ, [[0, .052], [.05, .05], [.1, .03], [.135, 0]], { n: 14, gen: 4 }));
  P.push(lathe([c[0], c[1], c[2] - .075], FZ, [[0, .058], [.012, .058]], fn({ n: 14, gen: 0, caps: true })));
  for (const s of [1, -1]) {
    const rs = [.03, .06, .1, .14, .18, .21, .225], F = [], B = [];
    for (const r of rs) {
      const tw = (40 - 24 * r / .225) * DEG, ch = r < .05 ? .024 : .038 - .022 * (r - .05) / .175, cx = c[0] + s * r, dz = Math.sin(tw) * ch / 2, dy = Math.cos(tw) * ch / 2;
      F.push([cx, c[1] + s * dy, c[2] + dz]); B.push([cx, c[1] - s * dy, c[2] - dz]);
    }
    P.push(line([...F, ...B.slice().reverse()], { closed: true, w: .9, ds: .5 }));
    for (let i = 0; i < rs.length - 1; i++) P.push(panel([F[i], F[i + 1], B[i + 1], B[i]], { al: 0, dot: true, ds: .6 }));
  }
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4; P.push(rim([c[0] + Math.cos(a) * .03, c[1] + Math.sin(a) * .03, c[2] - .07], FZ, .005, fn())); }
  return P;
}
function drGimbal(st) {
  const P = [], T = about(R.x(st.gimPitch || 0), [0, 0, 0]);
  P.push(cyl([0, .085, 0], [0, .045, 0], .034, { n: 10, gen: 0, caps: true }));
  for (const sx of [-1, 1]) P.push(box([sx * .072, -.01, -.02], [sx * .082, .05, .02], fn()));
  const B = [sphere([0, 0, 0], .065, { n: 16, gen: 3 }), panel([[-.035, -.02, .062], [.005, -.02, .062], [.005, .02, .062], [-.035, .02, .062]], fn({ edge: .6 })), rim([.028, 0, .061], FZ, .014, fn()), ringW([0, 0, 0], FX, .066, fn({ n: 16, al: .5 }))];
  P.push(...tps(T, B));
  return P;
}
function droneD() {
  const m = HD.drone(), parts = m.parts.map(p => O(p)), by = n => parts.find(p => p.name === n);
  const FU = by('fuselage').prims.slice();
  FU.push(box([-.03, -.135, .08], [.03, -.112, .16], fn()), box([-.03, -.13, -.18], [.03, -.106, -.1], fn()));           // launch shoe: the cradle points
  FU.push(line([[-.05, .122, -.1], [.05, .122, -.1], [.05, .105, -.42], [-.05, .105, -.42]], fn({ closed: true, w: .5, ds: .5 })));   // parachute hatch
  for (const s of [-1, 1]) FU.push(line([[s * .085, .02, .8], [s * .1, .04, .74], [s * .1, -.03, .74], [s * .085, -.02, .8]], fn({ closed: true, w: .4, ds: .5 })));   // cooling inlets
  FU.push(rod([.06, -.01, .5], [.07, -.02, .62], .004, fn()));
  by('fuselage').prims = FU;
  by('prop').prims = drProp();
  const gim = by('gimbal'); gim.dyn = drGimbal; gim.prims = drGimbal({});
  return O(m, { parts });
}
function droneCutD() {
  const C = K.cutBySides(droneD(), 'drone_cut', { wing: 'Wing panel' }), EN = [], FT = [], AV = [];
  // engine: crankcase, the inverted cylinder with fins, carburettor, muffler
  vol([-.04, -.045, .62], [.04, .04, .79], EN); drum([0, -.03, .7], [0, -.1, .7], .028, EN);
  for (let k = 0; k < 4; k++) EN.push(rim([0, -.045 - k * .014, .7], FY, .036, fn()));
  vol([.035, -.02, .58], [.06, .02, .63], EN, { fine: true }); drum([0, -.085, .45], [0, -.085, .6], .018, EN, { fine: true });
  // fuel tank under the wing, at the centre of gravity
  vol([-.075, -.06, -.06], [.075, .085, .2], FT);
  // bays: autopilot, datalink, battery; camera bay; parachute
  vol([-.07, -.07, -.38], [.07, .0, -.1], AV); vol([-.06, .005, -.4], [.06, .085, -.12], AV); vol([-.06, .0, .28], [.06, .075, .45], AV); vol([-.07, -.1, .22], [.07, -.03, .5], AV, { fine: true });
  C.parts.push(O({ name: 'engine', label: 'Engine · single-cylinder · 4-stroke', prims: EN }, hidden));
  C.parts.push(O({ name: 'fuel', label: 'Fuel tank', prims: FT }, hidden));
  C.parts.push(O({ name: 'bays', label: 'Avionics · datalink · battery · camera bay · parachute', prims: AV }, hidden));
  return C;
}
function catapultD() {
  const m = HD.catapult(), parts = m.parts.map(p => O(p)), by = n => parts.find(p => p.name === n), RL = HD.catapult.RAIL;
  const TR = by('trailer').prims.slice();
  for (const s of [-1, 1]) {
    tread(TR, -.15, s, { r: .31, w: .18, x: .72, y: .31, lugs: 13 });
    TR.push(box([s * .42, .44, -1.66], [s * .56, .52, -1.6], fn({ ds: .5 })));
  }
  TR.push(dl([[.2, .95, .6], [.1, .95, .2], [0, .8, -.2]], fn({ w: .45 })), rim([.36, .82, .65], FX, .05, fn()));
  by('trailer').prims = TR;
  // carriage (built at the rail's start: the part's xf slides it): V-cradle pads and the release hook
  const D = RL.dir, UP = V.norm(V.cross(D, FX)), cp = V.sub(V.sub(RL.start, V.mul(D, .35)), V.mul(UP, .27)), CA = by('carriage').prims.slice();
  const at = (a, s, u) => V.add(V.add(V.mad(cp, D, a), [s, 0, 0]), V.mul(UP, u));
  for (const s of [-1, 1]) CA.push(K.slab2([at(-.14, s * .035, .135), at(.26, s * .035, .135), at(.26, s * .1, .2), at(-.14, s * .1, .2)], .012));
  CA.push(box(V.sub(at(.3, 0, .1), [.025, .0, .02]), V.add(at(.3, 0, .1), [.025, .06, .02])));
  by('carriage').prims = CA;
  return O(m, { parts });
}

/* ================================================================ DDG-51 Arleigh Burke Flight IIA
   The HD ship plus: the bridge's window rows left open in the dots (dark glass, mullions and sills in dots);
   mooring bitts, Panama chocks and hose reels on the fo'c'sle and the side decks, the anchor cables to the windlass;
   liferaft canister racks, the RHIB davits' sheaves, falls and hook blocks, winches; the yards' dipoles and the
   whips in dots; the flight deck's landing circle, centre line and RSD track as painted strips; the twin hangars'
   interiors (deck, walls, overhead, RSD tracks, lockers), seen with the doors up (hangarIn, st.hangar). Small fittings
   carry fine and a denser ds so they read from a few tens of metres and drop out beyond. Cutaway: as before, the
   hangar interiors in the X-ray, the MH-60R in the port hangar with its blades and pylon folded. */
const DDZ = { ZB: 77.6, D01: 10.3, SPY_Y: [10.3, 19.4], SPY_IN: 1.3 };
const ddB = z => { const u = z / DDZ.ZB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); if (u < -.55) return 10 * (1 - .14 * Math.pow((-.55 - u) / .45, 1.5)); return 10; };
const SPY_HOUSE = [[-3.9, 31.0], [3.9, 31.0], [8.0, 26.9], [8.0, 12.2], [3.9, 8.1], [-3.9, 8.1], [-8.0, 12.2], [-8.0, 26.9]];
function insetPoly(P, d) {
  const n = P.length; let A = 0;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? 1 : -1, L = [];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); L.push([a[0] - dz / l * sg * d, a[1] + dx / l * sg * d, dx, dz]); }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = L[(i + n - 1) % n], l2 = L[i], den = l1[2] * l2[3] - l1[3] * l2[2];
    if (Math.abs(den) < 1e-9) { out.push([l2[0], l2[1]]); continue; }
    const t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / den;
    out.push([l1[0] + l1[2] * t, l1[1] + l1[3] * t]);
  }
  return out;
}
/* the SPY house in dots with the bridge's window rows open (its hexes stay for the hairlines) */
function ddBridge() {
  const P = [], [y0, y1] = DDZ.SPY_Y, top = insetPoly(SPY_HOUSE, DDZ.SPY_IN);
  const B = SPY_HOUSE.map(p => [p[0], y0, p[1]]), T = top.map(p => [p[0], y1, p[1]]), cen = [0, 15, 19.5];
  const BAND = { 0: [.04, .96, 6], 1: [.06, .94, 3], 7: [.06, .94, 3], 2: [.02, .2, 3], 6: [.8, .98, 3] }, v0 = .82, v1 = .95;
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, b0 = B[i], b1 = B[j], t0 = T[i], t1 = T[j];
    let n = V.norm(V.cross(V.sub(b1, b0), V.sub(t0, b0))); const mid = V.lerp(b0, t1, .5); if (V.dot(n, V.sub(mid, cen)) < 0) n = V.mul(n, -1);
    const bd = BAND[i];
    K.cvWall(b0, b1, t1, t0, n, bd ? [[v0, v1, bd[0], bd[1], bd[2]]] : [], P);
    if (!bd) continue;
    const at = (u, v) => V.mad(V.lerp(V.lerp(b0, b1, u), V.lerp(t0, t1, u), v), n, .02), L = V.dist(b0, b1), du = (bd[1] - bd[0]) / bd[2], hw = .07 / L;
    for (let k = 1; k < bd[2]; k++) { const u = bd[0] + k * du; P.push(SA.plate([at(u - hw, v0), at(u + hw, v0), at(u + hw, v1), at(u - hw, v1)], n)); }
    for (const v of [v0, v1]) P.push(dl([at(bd[0], v), at(bd[1], v)], { w: 0, ds: .35 }));
  }
  P.push(SA.plate([T[7], T[0], T[1], T[2]], FY), SA.plate([T[7], T[2], T[3], T[6]], FY), SA.plate([T[6], T[3], T[4], T[5]], FY));
  return P;
}
/* deck fittings (fine, denser than the hull's spacing) */
function ddFittings() {
  const P = [], hD = K.hD, f = o => fn(O({ ds: .45 }, o));
  const bitts = (x, z) => { const y = hD(z); P.push(box([x - .22, y, z - .5], [x + .22, y + .05, z + .5], f())); for (const dz of [-.28, .28]) P.push(lathe([x, y + .05, z + dz], FY, [[0, .16], [.42, .16], [.46, .21]], f({ n: 10, gen: 0, caps: true }))); };
  const chock = (s, z) => { const y = hD(z), e = ddB(z); P.push(box([s * (e - .38), y, z - .32], [s * (e - .08), y + .34, z + .32], f())); };
  for (const s of [-1, 1]) {
    for (const z of [57, 63, 69]) { bitts(s * (ddB(z) - 1.3), z); chock(s, z + .9); }
    for (const z of [22, 6, -12, -28, -41]) { bitts(s * (ddB(z) - .78), z); chock(s, z + .9); }
    for (const z of [14, -6]) { const y = hD(z) + .5, x = s * 9.2; P.push(lathe([x, y, z - .25], FZ, [[0, .38], [.5, .38]], f({ n: 16, gen: 0, caps: true })), rim([x, y, z - .25], FZ, .38, fn()), rim([x, y, z + .25], FZ, .38, fn()), box([x - .3, hD(z), z - .3], [x + .3, y - .3, z + .3], f())); }
    // anchor cable: hawse to windlass to the chain pipe
    P.push(dl([[s * (ddB(66.8) - 1.2), hD(66.8) + .05, 66.8], [s * 1.4, hD(68.5) + .3, 68.5], [s * .5, hD(66) + .08, 66], [s * .4, hD(62) + .05, 62]], fn({ w: .45, ds: .35 })));
  }
  return P;
}
/* liferaft racks, the RHIB davits' sheaves, falls, hook blocks and winches (boats) */
function ddBoatsX() {
  const P = [], hD = K.hD, f = o => fn(O({ ds: .5 }, o));
  for (const s of [-1, 1]) {
    for (const z0 of [26, -45]) {
      const x = s * (ddB(z0) - .75), y = hD(z0);
      P.push(box([x - .35, y, z0 - .1], [x + .35, y + 1.35, z0 + 2.9], f({ ds: 2 })));
      for (const yy of [.42, 1.02]) for (const dz of [.2, 1.5]) P.push(lathe([x, y + yy, z0 + dz], FZ, [[0, .27], [1.2, .27]], f({ n: 12, gen: 0, caps: true, rings: [0, 1] })));
    }
    const zc = -10.2, tip = [s * 8.0, 13.55, zc];
    P.push(lathe(V.add(tip, [-.1 * s, -.05, 0]), [s, 0, 0], [[0, .16], [.12, .16]], f({ n: 12, gen: 0, caps: true })));
    P.push(box([s * 7.9, 11.1, zc - .2], [s * 8.1, 11.35, zc + .2], f()), dl([V.add(tip, [0, -.15, 0]), [s * 8.0, 11.35, zc]], fn({ w: .4, ds: .4 })));
    P.push(lathe([s * 5.95, DDZ.D01 + .35, zc - .45], FZ, [[0, .2], [.5, .2]], f({ n: 12, gen: 0, caps: true })));
  }
  return P;
}
/* the yards' dipoles and the whips in dots (mast) */
function ddMastX() {
  const P = [];
  for (const s of [-1, 1]) for (const x of [2.4, 3.9, 5.3, 6.4]) P.push(rod([s * x, 32.0, 17.76], [s * x, 30.5, 17.76], .03, fn({ ds: .5 })));
  for (const x of [-3.2, -1.9, 1.9, 3.2]) P.push(rod([x, 35.2, 17.09], [x, 34.2, 17.09], .03, fn({ ds: .5 })));
  return P;
}
function ddWhips() {
  const P = [];
  for (const s of [-1, 1]) for (const [x, z, h] of [[5.95, -4.5, 7], [5.95, -15.5, 6], [7.9, 3.0, 5.5]]) P.push(dl([[s * x, DDZ.D01, z], [s * (x + .6), DDZ.D01 + h, z]], fn({ w: 0, ds: .45 })));
  return P;
}
/* the flight deck's paint as strips of dense dots (the hull's spacing is too coarse for a line) */
function ddDeckX() {
  const P = [], hD = K.hD, yz = z => hD(z) + .04, HZ = -65.5, r = 3.1, st = o => K.cvStripe(o[0], o[1], o[2], { ds: .45, w: 0 });
  for (let k = 0; k < 24; k++) { const a0 = k / 24 * TAU, a1 = (k + 1) / 24 * TAU, p = a => [Math.cos(a) * r, yz(HZ + Math.sin(a) * r), HZ + Math.sin(a) * r]; P.push(...st([p(a0), p(a1), .22])); }
  P.push(...st([[0, yz(-77), -77], [0, yz(-53.6), -53.6], .2]), ...st([[-7, yz(HZ), HZ], [7, yz(HZ), HZ], .18]));
  for (const x of [-.35, .35]) P.push(...st([[x, yz(-60), -60], [x, yz(-53.4), -53.4], .12]));
  return P;
}
/* the twin hangars' interiors: deck, walls, overhead, RSD track, lockers, overhead rail */
function ddHangarIn() {
  const P = [], hD = K.hD, z0 = -53.0, z1 = -36.3, y = z => hD(z) + .03, H = 5.5;
  for (const s of [-1, 1]) {
    const xi = s * .75, xo = s * 7.45, xm = s * 3.85;
    P.push(SA.plate([[xi, y(z0), z0], [xo, y(z0), z0], [xo, y(z1), z1], [xi, y(z1), z1]], FY, { ds: .9 }));
    P.push(SA.plate([[xo, y(z0), z0], [xo, y(z1), z1], [xo, y(z1) + H, z1], [xo, y(z0) + H, z0]], [-s, 0, 0], { ds: 1.6 }));
    P.push(SA.plate([[xi, y(z0), z0], [xi, y(z1), z1], [xi, y(z1) + H, z1], [xi, y(z0) + H, z0]], [s, 0, 0], { ds: 1.6 }));
    P.push(SA.plate([[xi, y(z0) + H, z0], [xo, y(z0) + H, z0], [xo, y(z1) + H, z1], [xi, y(z1) + H, z1]], [0, -1, 0], { ds: 2 }));
    P.push(SA.plate([[xi, y(z1), z1], [xo, y(z1), z1], [xo, y(z1) + H, z1], [xi, y(z1) + H, z1]], [0, 0, -1], { ds: 1.6 }));
    P.push(...K.cvStripe([xm, y(z0), z0], [xm, y(-44), -44], .3, { ds: .5, w: 0 }));
    P.push(dl([[xm, y(z0) + H - .25, z0], [xm, y(z1) + H - .25, z1]], { w: 0, ds: .5 }));
    vol([s * 6.75, y(-47), -47], [s * 7.4, y(-39) + 1.9, -39], P, { ds: 2 });
    vol([s * 1.0, y(-38), -38.2], [s * 2.6, y(-38) + 1.0, -36.6], P, { ds: 2, fine: true });
  }
  return P;
}
const DD_HELO_AT = [-3.85, 0, -44.6];
function destroyerD() {
  const m = HD.destroyer(), parts = m.parts.map(p => O(p)), by = n => parts.find(p => p.name === n);
  const sp = by('super');
  sp.prims = sp.prims.map(pr => isYs(pr, DDZ.SPY_Y[0], DDZ.SPY_Y[1]) && pr.skip ? O(pr, { pts: false }) : pr).concat(ddBridge(), ddWhips());
  by('hull').prims = by('hull').prims.concat(ddFittings());
  by('boats').prims = by('boats').prims.concat(ddBoatsX());
  by('mast').prims = by('mast').prims.concat(ddMastX());
  by('deck').prims = by('deck').prims.concat(ddDeckX());
  parts.splice(parts.indexOf(by('hangar')) + 1, 0, { name: 'hangarIn', label: 'Hangars ×2 · interior · RSD tracks', prims: ddHangarIn(), show: st => (st.hangar || 0) > .02 });
  return O(m, { parts });
}
function destroyerCutD() {
  const M = destroyerD(), groups = {}, keep = [], G = n => (groups[n] || (groups[n] = []));
  for (const p of M.parts) {
    if (p.name === 'hangarIn') continue;
    if (['sps', 'gun', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA', 'mast', 'hangar'].includes(p.name)) { keep.push(p); continue; }
    for (const pr of p.prims) { const c = K.bboxOf(pr).c; G(K.ddClassify(p.name, c[0], c[1], c[2])).push(pr); }
  }
  const U = K.underwater(); for (const k of Object.keys(U)) G(k).push(...U[k]);
  const L = { hullMid: 'Hull · midbody · 155 m', bow: 'Bow · AN/SQS-53C sonar dome', stern: 'Stern · flight deck', superF: 'Deckhouse · bridge · AN/SPY-1D(V) ×4', stacks: 'Uptakes ×2 · midships deckhouse', hangar: 'Hangar ×2 · aft deckhouse', boatsS: '7 m RHIB · davit · liferafts · stbd', boatsP: '7 m RHIB · davit · liferafts · port' };
  const parts = Object.keys(L).filter(k => groups[k]).map(k => ({ name: k, label: L[k], prims: groups[k] }));
  for (const p of keep) parts.push(O(p, p.name === 'hangar' ? { name: 'hdoor', label: 'Hangar doors ×2' } : {}));
  let mach = [];
  for (const mm of K.MRGS) mach = mach.concat(K.mrg(mm));
  const gt = K.lm2500(); for (const g of K.GTS) mach = mach.concat(tps(K.gtXf(g), gt));
  parts.push(O({ name: 'mach', label: 'LM2500 ×4 · reduction gears ×2', prims: mach }, hidden));
  parts.push(O({ name: 'trunks', label: 'Intake trunks · uptakes', prims: K.ddTrunks() }, hidden));
  const sh = K.ddShafts();
  parts.push(O({ name: 'shaftIn', label: 'Shaft lines · thrust bearings', prims: sh.inP }, hidden));
  parts.push({ name: 'props', label: 'Shafts ×2 · 5-blade CRP propellers · rudders', prims: sh.outP });
  parts.push(O({ name: 'vlsBF', label: 'Mk 41 modules · forward · 4', prims: K.vlsBlock(true) }, hidden));
  parts.push(O({ name: 'vlsBA', label: 'Mk 41 modules · aft · 8', prims: K.vlsBlock(false) }, hidden));
  parts.push(O({ name: 'hangarIn', label: 'Hangars ×2 · interior · RSD tracks', prims: ddHangarIn() }, hidden));
  const at = [DD_HELO_AT[0], K.hD(DD_HELO_AT[2]) + .03, DD_HELO_AT[2]];
  parts.push(O({ name: 'helo', label: 'MH-60R Seahawk · blades and pylon folded', prims: flat(heloD(), { fold: 1, droop: 1 }, T3(at)) }, hidden));
  return O(M, { name: 'destroyer_cut', parts });
}

/* ================================================================ install (called once by data/models.js) */
export function installDetail(kit) {
  K = kit;
  const models = {
    fighter: fighterD, helo: heloD, aew: aewD, drone: droneD, catapult: catapultD, destroyer: destroyerD,
    tel: telD, radar: radarD, pantsir: pantsirD, bal: balD, transloader: transloaderD,
  };
  const cuts = {
    fighter_cut: cached(fighterCutD), helo_cut: cached(heloCutD), aew_cut: cached(aewCutD), drone_cut: cached(droneCutD),
    destroyer_cut: cached(destroyerCutD), tel_cut: cached(telCutD), radar_cut: cached(radarCutD), pantsir_cut: cached(pantsirCutD),
    bal_cut: cached(balCutD), transloader_cut: cached(transloaderCutD),
  };
  const states = {
    fighter: { gear: [0, 1, 0], fold: [0, 1, 0], hook: [0, 1, 0], probe: [0, 1, 0], slam: [0, 2, 2], aam: [0, 2, 2] },
    helo: { fold: [0, 1, 0], hellfire: [0, 4, 4], mk54: [0, 2, 2] },
    aew: { gear: [0, 1, 0] },
  };
  return {
    models, cuts, states,
    FIGHTER: { GEAR_H: FA.GEAR_H, FOLD_X: FA.XH, SPAN: 13.62, SPAN_FOLDED: 9.32 },
    HELO: { FOLD_HINGE: HL.HF.slice(), LEN_FOLDED: 12.47 },
    E2D: { GEAR_H: -E2G.Y0 },
  };
}
