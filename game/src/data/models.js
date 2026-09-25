/* ONIKS · game models, in the GEO / HD part format (reference/menus/common/geo.js,
   reference/films/_brief/models.txt). window.M3, window.GEO and window.HD (hd_land.js +
   hd_sea_air.js) are classic scripts loaded before this module.

   Metres, +Z forward, +Y up, +X right-hand side. Vehicles and structures: origin on the ground
   (structures at their centre, harbour on the quay face at sea level). Munitions: origin mid-body,
   nose +Z. Every part has a true label; small detail is flagged fine (skip with {fine:false}).
   Public-reference level only: external shapes, designations, sizes. Munitions are closed shells.

   Exports
     EXTRA_MODELS   key -> factory for the game's own models and the munitions:
                    transloader hq depot port lighthouse radar_hill airfield · tlc pantsir_missile
                    strike_missile essm slam hellfire aam shell mk41_can · oniks oniks_booster sm6 mk72 (HD) ·
                    aew (E-2D) ssn (Virginia) ssk (Kilo 636.3) bal (3K60) · kh35 kalibr torpedo533 vpt_can ·
                    aliases for data/units.js: tomahawk sam57e6 aim120 (MODEL_ALIASES)
     CUT_MODELS     key -> factory for the Inspect / Anatomy cutaways (tel_cut radar_cut pantsir_cut
                    destroyer_cut helo_cut fighter_cut drone_cut oniks_cut sm6_cut aew_cut ssn_cut ssk_cut
                    bal_cut): the unit model
                    re-partitioned into the assemblies the exploded view pulls apart (same frame, same
                    state) plus interior parts. Interior parts carry inside:true and show(st) = !!st.xray:
                    set st.xray while the X-ray or the exploded view is on. Heavier; build lazily.
     UNIT_MODELS    key -> HD factory for the unit models (tel radar pantsir drone catapult destroyer
                    carrier helo fighter); ALL_MODELS = all three tables; makeModel(key)
     MODEL_STATES   key -> { field: [min, max, default] | true/false (bool default) }
     MODEL_INFO     key -> { name, kind, size [L (z), W (x), H (y)] m, s: suggested dot spacings [near, mid, far] }
     wreckOf(model, {seed, k})   destroyed variant (st.wreck 0..1 animates it)
     TRANSLOADER    crane constants, craneSolve(hook, cable), reloadPose(u, {slot, telMid}), telMid(side), tip(st)
     LIGHTHOUSE     LAMP, beam(st) -> {origin, dirs[4]};  PORT (crane positions);  DEPOT_SLOTS() (TLCs in
                    the magazines);  DDG (VLS cells, helo spot);  PANTSIR (tubes, turret / pitch frames);
                    SUBS (SSN VPT cells, SSK tubes, hull axes);  BAL (pack pivot, container centres, raise frame);
                    E2D (rotodome centre, gear height) */
const M3 = window.M3, GEO = window.GEO, HD = window.HD;
if (!M3 || !GEO || !HD || !HD.READY_LAND || !HD.READY_SEA_AIR) throw new Error('models.js needs m3.js, geo.js, hd_land.js and hd_sea_air.js loaded first');
const { V, R, X } = M3;
const { hex, box, lathe, cyl, panel, line, blades } = GEO;
const PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
const FX = [1, 0, 0], FY = [0, 1, 0], FZ = [0, 0, 1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const tp = HD.tp, tps = (T, L) => L.map(pr => tp(T, pr));
const about = HD.about, ringW = HD.ring, circle = HD.circle;
const SA = HD.seaAir;
const T3 = p => X.make(R.I(), p);
const memo = f => { let c = null; return () => c || (c = f()); };
const avg = P => V.mul(P.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / P.length);
const hidden = { inside: true, show: st => !!st.xray };

/* ---------------------------------------------------------------- helpers */
/* prim bounding box (lathes by their axis stations, as the anatomy films partition) */
export function bboxOf(pr) {
  let P;
  if (pr.p) P = pr.p;
  else if (pr.t === 'lathe') P = pr.st.map(q => V.mad(pr.a, pr.d, q[0]));
  else if (pr.t === 'blades') P = [pr.c];
  else P = [[0, 0, 0]];
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const q of P) for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
  return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
}
/* thin sheet from a planar quad: dots on the face toward `out` only, edges in wire */
function sheet(q, out, o) {
  let n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0])));
  if (V.len(n) < .5) n = V.norm(V.cross(V.sub(q[2], q[0]), V.sub(q[3], q[1])));
  if (out && V.dot(n, out) < 0) n = V.mul(n, -1);
  const th = (o && o.th) || .05;
  return hex([...q.map(p => V.mad(p, n, -th)), ...q], O({ skip: [2, 3, 4, 5] }, o));
}
/* oriented box: centre c, unit axes u, w in the XY plane (third axis Z), half sizes */
function obox(c, u, w, hu, hw, hz, o) {
  const q = (a, b, d) => [c[0] + u[0] * a + w[0] * b, c[1] + u[1] * a + w[1] * b, c[2] + d];
  return hex([q(-hu, -hw, -hz), q(-hu, hw, -hz), q(-hu, hw, hz), q(-hu, -hw, hz), q(hu, -hw, -hz), q(hu, hw, -hz), q(hu, hw, hz), q(hu, -hw, hz)], O({ bottom: true }, o));
}
/* box between two points in the ground plane, thickness t, from y0 to y1 (walls, beams, girts) */
function wall(a, b, t, y0, y1, o) {
  const d = V.norm([b[0] - a[0], 0, b[2] - a[2]]), n = [-d[2] * t / 2, 0, d[0] * t / 2];
  const P = (p, s, y) => [p[0] + n[0] * s, y, p[2] + n[2] * s];
  return hex([P(a, -1, y0), P(a, 1, y0), P(b, 1, y0), P(b, -1, y0), P(a, -1, y1), P(a, 1, y1), P(b, 1, y1), P(b, -1, y1)], o);
}
/* gable roof over x0..x1 (ridge along z0..z1) at eave height ye, ridge yr, with overhang ov */
function gableRoof(x0, x1, z0, z1, ye, yr, ov, o) {
  const xm = (x0 + x1) / 2, P = [];
  P.push(sheet([[x0 - ov, ye - ov * .4, z0 - ov], [xm, yr, z0 - ov], [xm, yr, z1 + ov], [x0 - ov, ye - ov * .4, z1 + ov]], [-1, 1.5, 0], o));
  P.push(sheet([[x1 + ov, ye - ov * .4, z0 - ov], [xm, yr, z0 - ov], [xm, yr, z1 + ov], [x1 + ov, ye - ov * .4, z1 + ov]], [1, 1.5, 0], o));
  for (const z of [z0, z1]) P.push(panel([[x0, ye, z], [x1, ye, z], [xm, yr, z], [xm, yr, z]], O({ edge: .8 }, o)));
  return P;
}
const wheelRow = (axles, rot, o) => { const P = []; for (const z of axles) for (const sx of [-1, 1]) HD.wheel(P, z, sx, O(o, { rot })); return P; };
const wheelSide = (axles, side, rot, o) => { const P = []; for (const z of axles) HD.wheel(P, z, side, O(o, { rot })); return P; };
/* split a part's primitives into groups: groups [{name, label, test(pr, c, b) -> bool, ...extra}],
   first match wins (a group without test takes the rest). Keeps xf / show / dyn of the source part. */
function splitPart(part, groups) {
  const pick = pr => { const b = bboxOf(pr); for (const g of groups) if (!g.test || g.test(pr, b.c, b)) return g.name; return null; };
  return groups.map(g => {
    const q = O({ name: g.name, label: g.label }, g.extra || {});
    if (part.xf) q.xf = part.xf;
    if (part.show) q.show = part.show;
    if (part.alpha) q.alpha = part.alpha;
    if (part.dyn) { const d = part.dyn; q.dyn = st => d(st).filter(pr => pick(pr) === g.name); q.prims = q.dyn({}); }
    else q.prims = (part.prims || []).filter(pr => pick(pr) === g.name);
    return q;
  }).filter(q => q.prims.length || q.dyn);
}
const cloneModel = (m, extra) => O(m, extra || {}, { parts: m.parts.map(p => O(p)) });
const partOf = (m, n) => m.parts.find(p => p.name === n);

/* ================================================================ TLC (3M55 transport-launch container)
   Lifted out of HD.tel's launcher (right tube). TLC-local: origin on the axis at the tube base,
   +Z to the mouth (TLC_LEN). */
const TEL_TUBE = HD.tel.TUBE, TLC_LEN = HD.tel.TUBE_LEN, TLC_R = .5;
const TLC_GEO = memo(() => {
  const m = HD.tel(), base = TEL_TUBE.slice(), inv = T3([-base[0], -base[1], -base[2]]);
  const centre = pr => pr.t === 'lathe' ? pr.a : pr.t === 'blades' ? pr.c : pr.p ? avg(pr.p) : [99, 99, 99];
  const shell = [];
  for (const pr of partOf(m, 'launcher').prims) { const c = centre(pr); if (Math.hypot(c[0] - base[0], c[1] - base[1]) < .64) shell.push(tp(inv, pr)); }
  const cap = partOf(m, 'capR').prims.map(pr => tp(inv, pr));
  return { shell, cap };
});
/* TLC prims placed by T (TLC-local -> target frame) */
const tlcPrims = (T, cap) => { const g = TLC_GEO(); return tps(T, cap === false ? g.shell : g.shell.concat(g.cap)); };
function tlc() {
  const g = TLC_GEO(), T = T3([0, 0, -TLC_LEN / 2]);
  return { name: 'tlc', LEN: TLC_LEN, R: TLC_R, parts: [
    { name: 'shell', label: 'TLC · 3M55 Oniks · sealed', prims: tps(T, g.shell) },
    { name: 'cap', label: 'TLC front cap', prims: tps(T, g.cap), show: st => st.cap !== false },
  ] };
}

/* ================================================================ K342P transloader (TZM)
   MZKT-7930 8×8 with a loader crane behind the cab and cradles for two TLCs on the bed (after the
   Anatomy film). Vehicle-local: origin on the ground at the vehicle centre, +Z forward.
   state: slew, luff (rad), ext (0..4.6 m jib), cable (m, hook below the jib head) or hook [x,y,z];
   hookYaw; dep (0 stabilisers up .. 1 down, default 1); bedR, bedL, hookTlc (bool: a TLC on the
   right / left cradle, on the hook); wheel (rad). With no crane state the crane is stowed. */
const TZM = {
  PIVOT: [0, 3.55, 2.95], BOOM: 5.3, EXT: 4.6, HOOK_DROP: 3.0, AXLES: [4.45, 2.25, -2.75, -4.95],
  SLOTS: [[.74, 2.15, -7.2], [-.74, 2.15, -7.2]],           // TLC bases on the cradles (TLC axis +Z)
  HOME: { hook: [0, 3.25, 2.95 - 5.2], cable: .27 },           // stowed: boom back over the bed on its rest
  TEL_AT: [7.2, 0, 4.5],                                     // where a TEL parks for a reload (same heading)
  LUGS: [-3.125, 1.425],                                    // TLC lifting lugs from its middle (m)
};
const tzSlewXf = slew => about(R.y(slew), [0, 0, TZM.PIVOT[2]]);
const tzBoomXf = c => X.make(R.mul(R.y(c.slew), R.x(-c.luff)), TZM.PIVOT);
const tzTip = c => X.ap(tzBoomXf(c), [0, 0, TZM.BOOM - .1 + c.ext]);
/* crane IK: hook position (vehicle-local) + rope length -> slew, luff, ext */
export function craneSolve(hook, cable) {
  const tip = [hook[0], hook[1] + cable, hook[2]], d = V.sub(tip, TZM.PIVOT);
  const rho = Math.hypot(d[0], d[2]), L = Math.hypot(rho, d[1]);
  return { slew: Math.atan2(d[0], d[2]), luff: Math.atan2(d[1], rho), ext: Math.max(0, Math.min(TZM.EXT, L - (TZM.BOOM - .1))) };
}
const TZ_HOME = O(craneSolve(TZM.HOME.hook, TZM.HOME.cable), { hook: TZM.HOME.hook, hookYaw: 0 });
/* normalised crane state from a model state */
function tzCrane(st) {
  // read every key up front: the engine finds a dyn part's state dependencies by calling it once
  const { slew, luff, ext, hook, cable, hookYaw } = st; void slew; void luff; void ext; void hook; void cable; void hookYaw;
  if (st.slew === undefined && st.luff === undefined && st.ext === undefined) {
    if (!st.hook) return TZ_HOME;
    return O(craneSolve(st.hook, st.cable === undefined ? 2 : st.cable), { hook: st.hook, hookYaw: st.hookYaw || 0 });
  }
  const c = { slew: st.slew === undefined ? TZ_HOME.slew : st.slew, luff: st.luff === undefined ? TZ_HOME.luff : st.luff, ext: Math.max(0, Math.min(TZM.EXT, st.ext || 0)), hookYaw: st.hookYaw || 0 };
  c.hook = st.hook || V.sub(tzTip(c), [0, st.cable === undefined ? 1.2 : st.cable, 0]);
  return c;
}
const tzHookXf = c => X.make(R.y(c.hookYaw), c.hook);
const TZM_GEO = memo(() => {
  const C = [], K = [], B = [], J = [], TU = [], BM = [], JB = [], HK = [];
  HD.chassis8x8(C, 6.2, -6.9, { axles: TZM.AXLES, deckFront: 2.35, fenders: [[1.42, 2.95, false, true], [-5.78, -1.9, true, true]] });
  for (const sx of [-1, 1]) C.push(cyl([sx * 1.28, 1.02, 1.0], [sx * 1.28, 1.02, -1.0], .3, { n: 16, gen: 4, caps: true }));      // fuel tanks
  C.push(box([.95, .66, -1.55], [1.48, 1.28, -1.05], fn()));                                                                  // battery box
  // power pack cover behind the cab: grille louvres, exhaust stack, air cleaner
  C.push(box([-1.36, 1.45, 3.55], [1.36, 2.95, 4.1]));
  for (const sx of [-1, 1]) C.push(panel([[sx * 1.365, 1.62, 3.62], [sx * 1.365, 1.62, 4.03], [sx * 1.365, 2.78, 4.03], [sx * 1.365, 2.78, 3.62]], { hatch: 5, edge: .6, pts: false }));
  C.push(lathe([1.18, 2.95, 3.72], FY, [[0, .1], [.75, .1], [.8, .115]], { n: 12, gen: 2, rings: [0, 2] }));
  C.push(lathe([-1.1, 2.95, 3.82], FY, [[0, .2], [.42, .2], [.48, .1]], { n: 14, gen: 3, rings: [0, 1] }));
  // stabiliser beams
  for (const x of [-1.75, 1.75]) for (const z of [2.6, -6.3]) C.push(box([Math.sign(x) * .8, 1.2, z - .15], [x, 1.42, z + .15]));
  // the launcher's MZKT-7930 cab
  K.push(...partOf(HD.tel(), 'cab').prims);
  // bed: side rails, stanchions, two cradles of saddles, boom rest
  for (const sx of [-1, 1]) {
    B.push(box([sx * 1.3 - .04, 1.47, -6.8], [sx * 1.3 + .04, 1.62, 2.25], fn()));
    for (let z = -6.55; z < 2.2; z += 1.45) B.push(box([sx * 1.3 - .04, 1.47, z - .04], [sx * 1.3 + .04, 2.25, z + .04], fn()));
  }
  for (const [x] of TZM.SLOTS) for (const z of [-5.8, -2.0, 1.2]) {
    B.push(box([x - .56, 1.47, z - .18], [x - .32, 1.86, z + .18]));
    B.push(box([x + .32, 1.47, z - .18], [x + .56, 1.86, z + .18]));
  }
  B.push(box([-.09, 1.45, -1.75], [.09, 3.12, -1.5]));
  B.push(box([-.16, 3.12, -1.8], [.16, 3.22, -1.45]));
  for (const x of [-1.75, 1.75]) for (const z of [2.6, -6.3]) { J.push(cyl([x, .1, z], [x, 1.3, z], .11, { n: 10, gen: 2 })); J.push(box([x - .3, 0, z - .3], [x + .3, .09, z + .3])); }
  // slewing column, control station, luffing ram
  const P = TZM.PIVOT;
  TU.push(lathe([0, 1.47, P[2]], FY, [[0, .55], [.3, .55], [.36, .45], [1.55, .4], [1.72, .36]], { n: 24, gen: 8, caps: true }));
  TU.push(box([-.42, 3.08, P[2] - .45], [.42, 3.7, P[2] + .5]));
  TU.push(box([.42, 2.3, P[2] - .3], [.85, 3.0, P[2] + .3], fn()));
  TU.push(cyl([.25, 2.2, P[2] + .5], [.1, 3.2, P[2] + 1.35], .09, { n: 10, gen: 2 }));
  // main boom (boom-local: heel pin at the origin, along +Z), telescopic jib + head sheave
  BM.push(box([-.24, -.3, -.4], [.24, .3, TZM.BOOM], { ribs: { z: 5 } }));
  BM.push(cyl([-.3, 0, 0], [.3, 0, 0], .2, { n: 12, gen: 0, caps: true }));
  JB.push(box([-.18, -.22, 0], [.18, .22, TZM.BOOM - .2]));
  JB.push(cyl([-.15, 0, TZM.BOOM - .1], [.15, 0, TZM.BOOM - .1], .25, { n: 14, gen: 0, caps: true }));
  // hook block + spreader beam (hook-local: hook eye at the origin; the beam runs along the TLC)
  HK.push(box([-.17, -.36, -.17], [.17, 0, .17]));
  HK.push(box([-.1, -1.02, -3.18], [.1, -.8, 3.18], { ribs: { z: 6 } }));
  HK.push(box([-.04, -.8, -.05], [.04, -.36, .05], fn()));
  return { C, K, B, J, TU, BM, JB, HK };
});
function tzRope(st) {
  const carrying = !!st.hookTlc, c = tzCrane(st), H = tzHookXf(c), P = [line([tzTip(c), c.hook], { w: .7 })];
  for (const z of TZM.LUGS) {
    const a = X.ap(H, [0, -1.0, z]), b = carrying ? X.ap(H, [0, -TZM.HOOK_DROP + .6, z]) : X.ap(H, [0, -2.1, z * .92]);
    P.push(line([a, b], { w: .5 }));
  }
  return P;
}
function transloader() {
  const g = TZM_GEO(), TL = tlcPrims(T3([0, 0, 0]));
  const dep = st => st.dep === undefined ? 1 : st.dep;
  const whL = st => wheelSide(TZM.AXLES, -1, st.wheel || 0, {}), whR = st => wheelSide(TZM.AXLES, 1, st.wheel || 0, {});
  return {
    name: 'transloader', PIVOT: TZM.PIVOT, SLOTS: TZM.SLOTS,
    parts: [
      { name: 'chassis', label: 'MZKT-7930 · 8×8', prims: g.C },
      { name: 'wheelsL', label: 'Wheels ×4 · 1500×600-635 · L', prims: whL({}), dyn: whL },
      { name: 'wheelsR', label: 'Wheels ×4 · 1500×600-635 · R', prims: whR({}), dyn: whR },
      { name: 'cab', label: 'Cab · crew 3', prims: g.K },
      { name: 'bed', label: 'Bed · 2 TLC cradles', prims: g.B },
      { name: 'stabilisers', label: 'Stabilisers ×4', prims: g.J, xf: st => T3([0, 1.2 * (1 - dep(st)), 0]) },
      { name: 'column', label: 'Crane column · slewing', prims: g.TU, xf: st => tzSlewXf(tzCrane(st).slew) },
      { name: 'boom', label: 'Crane boom · 5.3 m', prims: g.BM, xf: st => tzBoomXf(tzCrane(st)) },
      { name: 'jib', label: 'Telescopic jib · 4.6 m', prims: g.JB, xf: st => { const c = tzCrane(st); return X.mul(tzBoomXf(c), T3([0, 0, c.ext])); } },
      { name: 'hook', label: 'Hook block · spreader beam', prims: g.HK, xf: st => tzHookXf(tzCrane(st)) },
      { name: 'rope', label: 'Hoist rope · slings', prims: tzRope({}), dyn: tzRope },
      { name: 'tlcR', label: 'TLC · 3M55 · cradle R', prims: TL, xf: () => T3(TZM.SLOTS[0]), show: st => !!st.bedR },
      { name: 'tlcL', label: 'TLC · 3M55 · cradle L', prims: TL, xf: () => T3(TZM.SLOTS[1]), show: st => !!st.bedL },
      { name: 'tlcHook', label: 'TLC · 3M55 · on the hook', prims: TL, xf: st => X.mul(tzHookXf(tzCrane(st)), T3([0, -TZM.HOOK_DROP, -TLC_LEN / 2])), show: st => !!st.hookTlc },
    ],
  };
}
/* TLC middle (transloader-local) of a TEL parked at TEL_AT, tube side (1 right, -1 left) */
const telMid = side => V.add(TZM.TEL_AT, [(side || 1) * TEL_TUBE[0], TEL_TUBE[1], TEL_TUBE[2] + TLC_LEN / 2]);
/* the reload: u 0..1 -> crane state (merge into the transloader's state). The crane takes the TLC from
   cradle `slot` (0 right, 1 left), swings it onto the TEL tube at `telMid` and stows. Returns also
   hookTlc (on the hook), taken (the cradle is empty from here), placed (the TEL tube is loaded). */
export function reloadPose(u, o) {
  o = o || {};
  const slot = o.slot || 0, tm = o.telMid || telMid(1), H = TZM.HOOK_DROP, P = TZM.PIVOT;
  const sm = V.add(TZM.SLOTS[slot], [0, 0, TLC_LEN / 2]), home = TZM.HOME.hook, homeTip = home[1] + TZM.HOME.cable;
  const up = (p, h) => [p[0], p[1] + h, p[2]];
  const K = [[0, home, homeTip], [.08, up(sm, H + 2.2), 9.3], [.14, up(sm, H), 9.3], [.22, up(sm, H + 2.4), 9.3],
    [.45, up(tm, H + 2.4), 9.35], [.6, up(tm, H + .45), 9.35], [.64, up(tm, H), 9.35], [.72, up(tm, H + 1.6), 9.35], [1, home, homeTip]];
  const cy = K.map(k => [Math.atan2(k[1][0] - P[0], k[1][2] - P[2]), Math.hypot(k[1][0] - P[0], k[1][2] - P[2]), k[1][1], k[2]]);
  for (let i = 1; i < cy.length; i++) { let d = cy[i][0] - cy[i - 1][0]; while (d > PI) d -= TAU; while (d < -PI) d += TAU; cy[i][0] = cy[i - 1][0] + d; }
  u = sat(u);
  let i = 0; while (i < K.length - 2 && K[i + 1][0] <= u) i++;
  const a = cy[i], b = cy[i + 1], t = inOut(sat((u - K[i][0]) / (K[i + 1][0] - K[i][0])));
  const th = mix(a[0], b[0], t), rho = mix(a[1], b[1], t), hy = mix(a[2], b[2], t), tip = mix(a[3], b[3], t);
  const hook = [P[0] + Math.sin(th) * rho, hy, P[2] + Math.cos(th) * rho];
  return O(craneSolve(hook, tip - hy), { hook, cable: tip - hy, hookYaw: 0, hookTlc: u >= .14 && u < .64, taken: u >= .14, placed: u >= .64 });
}
export const TRANSLOADER = O(TZM, { craneSolve, reloadPose, telMid, tip: st => tzTip(tzCrane(st)), crane: tzCrane });

/* ================================================================ coast command post (HQ)
   Two command shelter trucks (6×6, KamAZ cab) under a camouflage net, a 20 ft comms shelter,
   a trailer generator, an 18 m telescopic antenna mast with guys. Static. Origin at the site centre. */
const KZ_AX = [2.75, -1.1, -2.45];
const KZ_WH = { r: .62, w: .42, x: .85, lugs: 14, n: 22 };
const kamazCab = memo(() => tps(T3([0, 0, -1.45]), partOf(HD.pantsir(), 'cab').prims));
/* 6×6 truck, truck-local: chassis+cab+wheels, and the shelter body */
function shelterTruckGeo() {
  const C = [], S = [];
  HD.chassis8x8(C, 3.95, -4.45, { axles: KZ_AX, r: .62, x: .85, w: .42, halfW: 1.25, deckY: 1.3, railY: [.72, 1.12], deckFront: 1.62,
    fenders: [[2.1, 3.45, false, true], [-3.2, -.35, true, true]] });
  C.push(...kamazCab());
  C.push(...wheelRow(KZ_AX, 0, KZ_WH));
  C.push(lathe([1.02, .92, .2], FZ, [[0, .18], [.04, .25], [1.1, .25], [1.14, .18]], { n: 16, gen: 4, caps: true }));      // fuel tank
  C.push(box([-1.25, .6, .1], [-.85, 1.1, 1.0]));                                                                      // battery box
  // K1.4-type shelter box: doors, windows, ladder, A/C unit, antenna bases, cable entry
  const x0 = -1.25, x1 = 1.25, y0 = 1.34, y1 = 3.55, z0 = -4.4, z1 = 1.52;
  S.push(box([x0, y0, z0], [x1, y1, z1], { ribs: { z: 4 } }));
  S.push(panel([[-.45, 1.5, z0 - .012], [.45, 1.5, z0 - .012], [.45, 3.3, z0 - .012], [-.45, 3.3, z0 - .012]], { edge: .85, pts: false }));
  S.push(line([[.32, 2.35, z0 - .03], [.32, 2.55, z0 - .03]], fn({ w: .8 })));
  for (const z of [-1.2, .6]) S.push(panel([[x1 + .01, 2.45, z - .35], [x1 + .01, 2.45, z + .35], [x1 + .01, 3.05, z + .35], [x1 + .01, 3.05, z - .35]], { edge: .75, pts: false }));
  S.push(panel([[x0 - .01, 2.45, -2.8], [x0 - .01, 2.45, -2.1], [x0 - .01, 3.05, -2.1], [x0 - .01, 3.05, -2.8]], { edge: .75, pts: false }));
  for (const x of [-.35, .35]) S.push(line([[x, .45, z0 - .25], [x, y0, z0 - .08]], fn({ w: .6 })));
  for (let k = 0; k < 3; k++) S.push(line([[-.35, .6 + k * .26, z0 - .22], [.35, .6 + k * .26, z0 - .22]], fn({ w: .5 })));
  S.push(box([-.7, 1.85, z0 - .42], [.7, 2.75, z0], { bottom: true }));                                                   // A/C unit on the rear wall
  S.push(panel([[-.6, 1.95, z0 - .425], [.6, 1.95, z0 - .425], [.6, 2.65, z0 - .425], [-.6, 2.65, z0 - .425]], fn({ hatch: 5, pts: false })));
  for (const [x, z] of [[-.9, 1.1], [.9, -3.9]]) { S.push(lathe([x, y1, z], FY, [[0, .1], [.12, .07]], { n: 10, gen: 0, caps: true })); S.push(line([[x, y1 + .12, z], [x, y1 + 3.2, z - .05]], { w: .55 })); }
  S.push(box([x1, 1.6, -3.6], [x1 + .12, 2.0, -3.0], fn()));
  return { C, S };
}
function hqGeo() {
  const tk = shelterTruckGeo();
  const TA = X.make(R.I(), [-4.5, 0, 1.0]), TB = X.make(R.y(3 * DEG), [4.6, 0, -1.2]);
  // 20 ft ISO comms shelter on the ground, long axis east-west
  const CT = X.make(R.y(PI / 2), [-.5, 0, -11.5]), CO = [];
  CO.push(box([-1.22, 0, -3.03], [1.22, 2.59, 3.03], { ribs: { z: 14 } }));
  CO.push(panel([[-1.1, .15, 3.04], [1.1, .15, 3.04], [1.1, 2.45, 3.04], [-1.1, 2.45, 3.04]], { edge: .85, pts: false }));
  for (const x of [-.55, 0, .55]) CO.push(line([[x, .2, 3.06], [x, 2.4, 3.06]], fn({ w: .6 })));
  CO.push(box([-.6, .9, -3.45], [.6, 1.9, -3.03]));
  CO.push(panel([[-.5, 1.0, -3.455], [.5, 1.0, -3.455], [.5, 1.8, -3.455], [-.5, 1.8, -3.455]], fn({ hatch: 4, pts: false })));
  CO.push(box([-.5, 0, 3.05], [.5, .22, 3.7], fn()));
  for (const x of [-1.22, 1.22]) for (const z of [-3.03, 3.03]) CO.push(box([x - .08 * Math.sign(x) - .04, 0, z - .1], [x + .04, .18, z + .1], fn()));
  // trailer generator: frame, two axles, genset housing with louvres, exhaust, drawbar
  const GT = X.make(R.y(PI / 2 + .12), [11.5, 0, -8.5]), GN = [];
  GN.push(box([-.85, .55, -2.0], [.85, .7, 2.0]));
  for (const z of [-.8, .8]) for (const sx of [-1, 1]) HD.wheel(GN, z, sx, { r: .45, w: .3, x: .72, lugs: 11, n: 18 });
  GN.push(box([-.8, .7, -1.7], [.8, 2.2, 1.6]));
  for (const sx of [-1, 1]) GN.push(panel([[sx * .805, .9, -1.4], [sx * .805, .9, .4], [sx * .805, 2.0, .4], [sx * .805, 2.0, -1.4]], { hatch: 8, edge: .6, pts: false }));
  GN.push(lathe([.45, 2.2, -1.2], FY, [[0, .07], [.5, .07]], { n: 10, gen: 0 }));
  GN.push(cyl([0, .62, 2.0], [0, .5, 3.3], .05, { n: 8, gen: 0 }));
  GN.push(lathe([0, .5, 3.3], FY, [[-.05, .08], [.05, .08]], fn({ n: 8, caps: true })));
  // telescopic mast: foot plate, tripod, five sections, collars, log-periodic head, whips
  const MB = [0, 0, 9.5], MA = [];
  MA.push(box([MB[0] - .9, 0, MB[2] - .9], [MB[0] + .9, .12, MB[2] + .9]));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + .4; MA.push(cyl([MB[0] + Math.cos(a) * 1.5, .05, MB[2] + Math.sin(a) * 1.5], [MB[0], 2.2, MB[2]], .045, { n: 6, gen: 0 })); }
  const secs = [[0, 4.3, .16], [4.1, 8.3, .135], [8.1, 12.3, .11], [12.1, 16.3, .09], [16.1, 18.2, .07]];
  for (const [y0, y1, r] of secs) { MA.push(lathe([MB[0], y0, MB[2]], FY, [[0, r], [y1 - y0, r]], { n: 14, gen: 2, rings: [0, 1] })); MA.push(lathe([MB[0], y1 - .12, MB[2]], FY, [[0, r * 1.25], [.12, r * 1.25]], fn({ n: 12, caps: true }))); }
  MA.push(box([MB[0] - .15, 18.2, MB[2] - .15], [MB[0] + .15, 18.5, MB[2] + .15]));
  MA.push(cyl([MB[0] - 1.7, 18.6, MB[2]], [MB[0] + 1.7, 18.6, MB[2]], .04, { n: 6, gen: 0 }));
  for (let k = 0; k < 9; k++) { const x = MB[0] - 1.6 + k * .4, h = 1.25 - k * .1; MA.push(line([[x, 18.6, MB[2] - h], [x, 18.6, MB[2] + h]], { w: .6 })); }
  MA.push(line([[MB[0], 18.5, MB[2]], [MB[0], 21.6, MB[2]]], { w: .6 }));
  MA.push(line([[MB[0] + .25, 18.5, MB[2] + .2], [MB[0] + .3, 20.4, MB[2] + .2]], fn({ w: .5 })));
  // guys: three azimuths, two levels, to ground anchors
  const GY = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + PI / 6, an = [MB[0] + Math.cos(a) * 11, 0, MB[2] + Math.sin(a) * 11];
    for (const h of [9.2, 17.2]) GY.push(line([[MB[0] + Math.cos(a) * .12, h, MB[2] + Math.sin(a) * .12], an], { w: .4, ds: 1.4 }));
    GY.push(box([an[0] - .15, 0, an[2] - .15], [an[0] + .15, .3, an[2] + .15], fn()));
  }
  // camouflage net over the trucks: poles, a draped grid, skirts to the stakes
  const NT = [], nx = 11.5, nz0 = -7.5, nz1 = 9.0;
  const poles = [[-nx, nz0], [0, nz0], [nx, nz0], [-nx, nz1], [0, nz1], [nx, nz1], [0, .8]];
  const hN = (x, z) => { let h = 3.3; for (const [px, pz] of poles) { const d = Math.hypot(x - px, z - pz), top = px === 0 && pz === .8 ? 5.3 : 4.7; h = Math.max(h, top - .16 * d); } return h; };
  for (const [px, pz] of poles) NT.push(cyl([px, 0, pz], [px, hN(px, pz), pz], .05, { n: 6, gen: 0 }));
  // the net itself: a draped, sparse two-sided surface (reads as a veil of returns), edge ropes
  const gx = 12, gz = 9;
  for (let i = 0; i < gx; i++) for (let j = 0; j < gz; j++) {
    const x0 = mix(-nx, nx, i / gx), x1 = mix(-nx, nx, (i + 1) / gx), z0 = mix(nz0, nz1, j / gz), z1 = mix(nz0, nz1, (j + 1) / gz);
    NT.push(panel([[x0, hN(x0, z0), z0], [x1, hN(x1, z0), z0], [x1, hN(x1, z1), z1], [x0, hN(x0, z1), z1]], { ds: 3.2, edge: 0, pts: true, al: .35 }));
  }
  for (const z of [nz0, nz1]) { const p = []; for (let x = -nx; x <= nx + .01; x += 1.15) p.push([x, hN(x, z), z]); NT.push(line(p, { w: .6 })); }
  for (const x of [-nx, nx]) { const p = []; for (let z = nz0; z <= nz1 + .01; z += 1.15) p.push([x, hN(x, z), z]); NT.push(line(p, { w: .6 })); }
  for (let x = -nx; x <= nx + .01; x += 2.3) for (const z of [nz0, nz1]) NT.push(line([[x, hN(x, z), z], [x * 1.08, 0, z + Math.sign(z) * 1.6]], { w: .4 }));
  for (let z = nz0; z <= nz1 + .01; z += 2.3) for (const x of [-nx, nx]) NT.push(line([[x, hN(x, z), z], [x + Math.sign(x) * 1.6, 0, z]], { w: .4 }));
  // cables on the ground
  const CB = [line([[-4.5, .05, -3.5], [-3, .05, -8], [-1.2, .05, -10.2]], fn({ w: .5 })), line([[4.6, .05, -5.6], [2.2, .05, -9], [.3, .05, -10.3]], fn({ w: .5 })),
    line([[10.3, .05, -8.2], [6.5, .05, -7], [4.8, .05, -5.8]], fn({ w: .5 })), line([[0, .05, 9.4], [-2, .05, 7], [-4.2, .05, 5.6]], fn({ w: .5 }))];
  return { CA: tps(TA, tk.C), SA: tps(TA, tk.S), CB_: tps(TB, tk.C), SB: tps(TB, tk.S), CO: tps(CT, CO), GN: tps(GT, GN), MA, GY, NT, CB, MB };
}
const HQ_GEO = memo(hqGeo);
function hq() {
  const g = HQ_GEO();
  return {
    name: 'hq', MAST: [g.MB[0], 18.6, g.MB[2]],
    parts: [
      { name: 'truckA', label: 'Command vehicle 1 · 6×6', prims: g.CA },
      { name: 'shelterA', label: 'Command shelter 1 · K1.4-type', prims: g.SA },
      { name: 'truckB', label: 'Command vehicle 2 · 6×6', prims: g.CB_ },
      { name: 'shelterB', label: 'Command shelter 2 · K1.4-type', prims: g.SB },
      { name: 'container', label: 'Comms shelter · 20 ft ISO', prims: g.CO },
      { name: 'generator', label: 'Diesel generator · 30 kW trailer', prims: g.GN },
      { name: 'mast', label: 'Antenna mast · 18 m telescopic', prims: g.MA },
      { name: 'guys', label: 'Guy wires ×6', prims: g.GY },
      { name: 'net', label: 'Camouflage net · 23 × 16 m', prims: g.NT },
      { name: 'cables', label: 'Field cables', prims: g.CB },
    ],
  };
}

/* ================================================================ munition depot
   Two earth-covered magazines (concrete arch under an earth mound, headwall, steel doors), an open
   revetment with a stack of six TLCs, fence with gate, guard hut, lights. Origin at the site centre;
   the gate is on +Z. Under the X-ray the arches open and the TLCs stored inside are revealed. */
const DEPOT = { FX: 48, FZ: 32, MAGS: [{ x: -32, z0: -27, z1: -5 }, { x: -6, z0: -27, z1: -5 }], REV: [24, -10] };
function magazineGeo(m) {
  const ME = [], AR = [], HW = [], z0 = m.z0, z1 = m.z1, xm = m.x;
  // earth mound: arcs along z, tapering at the back into the ground
  const S = [];
  for (const [z, w, h] of [[z0 - 6.5, 3.2, .5], [z0 - 5, 6.8, 2.6], [z0 - 3, 9.0, 4.8], [z0 - 1, 10.0, 6.0], [z0 + 1.5, 10.2, 6.4], [mix(z0, z1, .4), 10.2, 6.5], [mix(z0, z1, .75), 10.2, 6.5], [z1 - .6, 10.2, 6.4]])
    S.push(SA.arc(z, w, 0, h, 2.5, 15, xm));
  ME.push(...SA.loft(SA.skin(S, true), { lines: [3, 7, 11], rings: [2, 5], al: .6, ds: 1.25 }));
  ME.push(lathe([xm, 6.3, mix(z0, z1, .35)], FY, [[0, .35], [.6, .3], [.75, .45], [.85, 0]], fn({ n: 12, gen: 2 })));   // ventilator
  // concrete arch inside (hidden), floor slab
  const SA_ = [];
  for (let k = 0; k <= 5; k++) SA_.push(SA.arc(mix(z0, z1 - .5, k / 5), 5.2, .15, 5.0, 2.1, 15, xm));
  AR.push(...SA.loft(SA.skin(SA_, true), { lines: [2, 7, 12], rings: [0, 5], al: .5, ds: 1.1 }));
  AR.push(box([xm - 5.2, 0, z0], [xm + 5.2, .15, z1 - .5]));
  AR.push(box([xm - 5.2, 0, z0 - .4], [xm + 5.2, 5.1, z0]));
  // headwall with wing walls, twin steel doors, apron
  HW.push(box([xm - 6.5, 0, z1 - .6], [xm + 6.5, 6.6, z1]));
  for (const sx of [-1, 1]) HW.push(wall([xm + sx * 6.5, 0, z1 - .3], [xm + sx * 10.8, 0, z1 - 3.4], .45, 0, 4.6));
  for (const sx of [-1, 1]) HW.push(box([xm + sx * 2.4 - (sx > 0 ? 2.3 : 0), .1, z1], [xm + sx * 2.4 + (sx > 0 ? 0 : 2.3), 4.0, z1 + .12]));
  for (const sx of [-1, 1]) for (let k = 1; k < 4; k++) HW.push(line([[xm + sx * (.1 + k * .55), .15, z1 + .13], [xm + sx * (.1 + k * .55), 3.95, z1 + .13]], fn({ w: .5 })));
  HW.push(box([xm - 3.2, 0, z1], [xm + 3.2, .12, z1 + 5], fn()));
  HW.push(box([xm - 2.9, 4.1, z1], [xm + 2.9, 4.35, z1 + .5]));                                          // door rail
  HW.push(lathe([xm + 4.2, 5.2, z1 + .05], FZ, [[0, .12], [.25, .16]], fn({ n: 10 })));                 // lamp
  return { ME, AR, HW };
}
/* where TLCs sit inside a magazine: 3 across, 2 end to end, 2 high (TLC-local base origin, axis +Z) */
function magazineSlots(m) {
  const out = [];
  for (const dx of [-1.25, 0, 1.25]) for (const zb of [m.z0 + .4, m.z0 + .4 + TLC_LEN + .9]) for (const y of [.75, 1.9]) out.push(T3([m.x + dx, y, zb]));
  return out;
}
function depotGeo() {
  const mags = DEPOT.MAGS.map(magazineGeo);
  const RV = [], ST = [], FE = [], GA = [], HU = [], LI = [];
  // open revetment: U of earth berms (trapezoid prisms), TLC stack on dunnage
  const [rx, rz] = DEPOT.REV;
  const berm = (a, b) => { const d = V.norm(V.sub(b, a)), n = [-d[2], 0, d[0]]; const q = (p, s, y) => V.add(p, V.mul(n, s)).map((v, i) => i === 1 ? y : v);
    return hex([q(a, -3.2, 0), q(a, 3.2, 0), q(b, 3.2, 0), q(b, -3.2, 0), q(a, -.8, 3.6), q(a, .8, 3.6), q(b, .8, 3.6), q(b, -.8, 3.6)], { ds: 1.25 }); };
  RV.push(berm([rx - 9, 0, rz - 11], [rx + 9, 0, rz - 11]), berm([rx - 9, 0, rz - 10], [rx - 9, 0, rz + 6]), berm([rx + 9, 0, rz - 10], [rx + 9, 0, rz + 6]));
  for (const z of [rz - 3.4, rz + 3.0]) for (const y of [0, 1.12]) ST.push(box([rx - 2.2, y, z - .12], [rx + 2.2, y + .1, z + .12]));
  for (const dx of [-1.15, 0, 1.15]) for (const y of [.62, 1.74]) ST.push(...tlcPrims(T3([rx + dx, y, rz - TLC_LEN / 2])));
  // fence: posts every 4 m, three strands, barbed top (the gate gap on +Z)
  const FXh = DEPOT.FX, FZh = DEPOT.FZ, loop = [[-FXh, -FZh], [FXh, -FZh], [FXh, FZh], [5, FZh], [-5, FZh], [-FXh, FZh], [-FXh, -FZh]];
  for (let i = 0; i < loop.length - 1; i++) {
    if (i === 3) continue;                                                                             // gate gap
    const a = loop[i], b = loop[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(L / 4);
    for (let k = 0; k <= n; k++) { const x = mix(a[0], b[0], k / n), z = mix(a[1], b[1], k / n); FE.push(box([x - .04, 0, z - .04], [x + .04, 2.5, z + .04], k % 2 ? fn() : {})); }
    for (const y of [.5, 1.2, 1.9, 2.45]) FE.push(line([[a[0], y, a[1]], [b[0], y, b[1]]], y > 2.4 ? fn({ w: .4 }) : { w: .45 }));
  }
  // gate: two leaves (frames + mesh lines), posts
  for (const sx of [-1, 1]) {
    GA.push(box([sx * 5 - .1, 0, FZh - .1], [sx * 5 + .1, 2.8, FZh + .1]));
    const x0 = sx * 4.9, x1 = sx * .05, q = [[x0, .15, FZh], [x1, .15, FZh], [x1, 2.4, FZh], [x0, 2.4, FZh]];
    GA.push(line(q.concat([q[0]]), { w: .8 }));
    for (let k = 1; k < 8; k++) GA.push(line([[mix(x0, x1, k / 8), .15, FZh], [mix(x0, x1, k / 8), 2.4, FZh]], fn({ w: .45 })));
    GA.push(line([q[0], q[2]], { w: .5 }));
  }
  // guard hut with a flat roof, window; light masts
  HU.push(box([7.5, 0, FZh - 4.2], [10.5, 2.6, FZh - 1.2]));
  HU.push(box([7.3, 2.6, FZh - 4.4], [10.7, 2.75, FZh - 1.0]));
  HU.push(panel([[7.49, 1.2, FZh - 3.6], [7.49, 1.2, FZh - 1.8], [7.49, 2.1, FZh - 1.8], [7.49, 2.1, FZh - 3.6]], { edge: .8, pts: false }));
  HU.push(panel([[8.3, .1, FZh - 1.19], [9.1, .1, FZh - 1.19], [9.1, 2.1, FZh - 1.19], [8.3, 2.1, FZh - 1.19]], { edge: .8, pts: false }));
  for (const [x, z] of [[-FXh + 3, -FZh + 3], [FXh - 3, -FZh + 3], [FXh - 3, FZh - 3], [-FXh + 3, FZh - 3]]) {
    LI.push(lathe([x, 0, z], FY, [[0, .14], [8.5, .07]], { n: 8, gen: 2, caps: true }));
    LI.push(box([x - .35, 8.5, z - .15], [x + .35, 8.8, z + .15]));
    LI.push(line([[x, 8.5, z], [x - Math.sign(x) * 1.2, 8.3, z - Math.sign(z) * 1.2]], fn({ w: .6 })));
  }
  return { mags, RV, ST, FE, GA, HU, LI };
}
const DEPOT_GEO = memo(depotGeo);
function depot() {
  const g = DEPOT_GEO(), parts = [];
  g.mags.forEach((m, i) => {
    const s = 'AB'[i];
    parts.push({ name: 'mound' + s, label: `Magazine ${i + 1} · earth cover`, prims: m.ME });
    parts.push(O({ name: 'arch' + s, label: `Magazine ${i + 1} · concrete arch`, prims: m.AR }, hidden));
    parts.push({ name: 'front' + s, label: `Magazine ${i + 1} · headwall · steel doors`, prims: m.HW });
  });
  parts.push({ name: 'revetment', label: 'Revetment · earth berm', prims: g.RV });
  parts.push({ name: 'stack', label: 'TLC ×6 · on dunnage', prims: g.ST });
  parts.push({ name: 'fence', label: 'Perimeter fence · 96 × 64 m', prims: g.FE });
  parts.push({ name: 'gate', label: 'Gate', prims: g.GA });
  parts.push({ name: 'hut', label: 'Guard hut', prims: g.HU });
  parts.push({ name: 'lights', label: 'Light masts ×4 · 8.5 m', prims: g.LI });
  return { name: 'depot', MAGS: DEPOT.MAGS, parts };
}
export const DEPOT_SLOTS = () => DEPOT.MAGS.map(magazineSlots);

/* ================================================================ harbour
   Quay (220 m, deck +2.5 m), two portal jib cranes on rails, two transit sheds, containers, a
   rubble-mound breakwater with its head light. Origin on the quay face at sea level, +Z seaward; everything
   stops 2.5 m below the waterline (the sea hides the rest).
   state: slewA, luffA, dropA, slewB, luffB, dropB (crane slew/luff rad, hook drop below the tip m). */
const CR = { GAUGE: 10.5, RING_Y: 13.2, HEEL: [0, 2.3, 2.5], BOOM: 30, TIPY: .6 };
function cranePortal() {
  const P = [], g = CR.GAUGE / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    P.push(hex([[sx * g - .55, 0, sz * 4.8 - .55], [sx * g + .55, 0, sz * 4.8 - .55], [sx * g + .55, 0, sz * 4.8 + .55], [sx * g - .55, 0, sz * 4.8 + .55],
      [sx * (g - 1.4) - .4, 12.2, sz * 3.2 - .4], [sx * (g - 1.4) + .4, 12.2, sz * 3.2 - .4], [sx * (g - 1.4) + .4, 12.2, sz * 3.2 + .4], [sx * (g - 1.4) - .4, 12.2, sz * 3.2 + .4]], { skip: [0, 1] }));
  for (const sx of [-1, 1]) {
    P.push(box([sx * g - .6, .4, -6.6], [sx * g + .6, 1.3, 6.6]));
    for (const z of [-5.6, -4.4, 4.4, 5.6]) P.push(cyl([sx * g - .3, .38, z], [sx * g + .3, .38, z], .38, fn({ n: 14, caps: true })));
    P.push(box([sx * (g - 1.4) - .45, 11.4, -3.7], [sx * (g - 1.4) + .45, 12.6, 3.7]));
    for (const sz of [-1, 1]) P.push(cyl([sx * g, 1.4, sz * 4.6], [sx * (g - 1.3), 10.8, -sz * 2.6], .13, fn({ n: 6 })));
  }
  for (const sz of [-1, 1]) P.push(box([-g + 1.0, 11.4, sz * 3.2 - .45], [g - 1.0, 12.6, sz * 3.2 + .45]));
  P.push(lathe([0, 12.6, 0], FY, [[0, 2.7], [.6, 2.6]], { n: 40, caps: true }));
  P.push(line([[-g + 1.2, 12.7, -3.3], [-g + 1.2, 14.1, -3.3], [-g + 1.2, 14.1, 3.3], [-g + 1.2, 12.7, 3.3]], fn({ w: .6 })));
  return P;
}
function craneHouse() {
  const P = [];
  P.push(box([-3.2, 0, -6.2], [3.2, .6, 3.0], { bottom: true }));
  P.push(box([-2.8, .6, -5.9], [2.8, 4.9, .7]));
  for (let z = -5.2; z < 0; z += 1.1) P.push(panel([[2.81, 2.8, z], [2.81, 2.8, z + .7], [2.81, 4.2, z + .7], [2.81, 4.2, z]], fn({ pts: false })));
  P.push(box([-2.5, .2, -8.2], [2.5, 3.6, -6.2]));
  P.push(box([1.4, 1.2, 1.0], [2.9, 4.3, 3.3]));
  P.push(panel([[1.45, 2.6, 3.32], [2.85, 2.6, 3.32], [2.85, 4.1, 3.32], [1.45, 4.1, 3.32]], fn({ pts: false })));
  for (const sx of [-1, 1]) {
    P.push(cyl([sx * 2.0, 4.9, -4.6], [sx * .35, 15.2, -2.2], .22, { n: 10 }));
    P.push(cyl([sx * 2.0, 4.9, .4], [sx * .35, 15.2, -2.2], .16, { n: 8 }));
    P.push(box([sx * .8 - .25, 1.2, 1.9], [sx * .8 + .25, 2.9, 2.9]));
  }
  P.push(cyl([-.6, 15.2, -2.2], [.6, 15.2, -2.2], .35, { n: 14, caps: true }));
  return P;
}
function craneBoom() {
  const P = [], L = CR.BOOM, sec = z => mix(.75, .4, z / L);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.push(cyl([sx * sec(0), sy * sec(0), 0], [sx * sec(L), sy * sec(L), L], .1, { n: 8 }));
  for (let z = 0; z < L - .8; z += 1.6) {
    const a = sec(z), b = sec(z + 1.6);
    for (const sx of [-1, 1]) P.push(line([[sx * a, -a, z], [sx * b, b, z + 1.6]], { w: .7 }));
    for (const sy of [-1, 1]) P.push(line([[-a, sy * a, z], [b, sy * b, z + 1.6]], { w: .7 }));
  }
  P.push(cyl([-.55, 0, 0], [.55, 0, 0], .3, { n: 12, caps: true }));
  P.push(lathe([-.25, CR.TIPY, L], FX, [[0, .5], [.5, .5]], { n: 20, caps: true }));
  return P;
}
function craneHook() {
  const P = [];
  P.push(box([-.32, -.95, -.22], [.32, 0, .22]));
  for (const sx of [-1, 1]) P.push(lathe([sx * .12, -.35, 0], FX, [[0, .3], [.08, .3]], fn({ n: 14 })));
  P.push(lathe([0, -1.35, 0], FY, [[0, .18], [.4, .1]], { n: 10 }));
  return P;
}
const crHouseXf = slew => X.make(R.y(slew), [0, CR.RING_Y, 0]);
const crBoomXf = (slew, luff) => X.mul(crHouseXf(slew), X.make(R.x(-luff), CR.HEEL));
const crTip = (slew, luff) => X.ap(crBoomXf(slew, luff), [0, CR.TIPY, CR.BOOM]);
export const PORT = {
  QUAY: [-110, 110], APRON: -62, DECK: 2.5,
  CRANES: [{ id: 'A', at: [-42, 2.5, -7.5], slew: -1.3, luff: .78, drop: 13 }, { id: 'B', at: [18, 2.5, -7.5], slew: -1.85, luff: .6, drop: 19 }],
  BREAKWATER: [[112, 0], [128, 38], [132, 105], [114, 165], [74, 206]],
};
const portCraneXf = c => X.make(R.y(PI / 2), c.at);
function portGeo() {
  const Q = [], FD = [], BO = [], RL = [], SH = [[], []], CN = [], BW = [], LT = [];
  const [qx0, qx1] = PORT.QUAY, zA = PORT.APRON, yD = PORT.DECK;
  // quay: deck slab + face down to the seabed (back face buried), coping, fenders, bollards, rails
  Q.push(box([qx0, -2.5, zA], [qx1, yD, 0], { skip: [2], ds: 1.3 }));                          // down to just below the waterline (the sea hides the rest)
  Q.push(box([qx0, yD, -.6], [qx1, yD + .25, 0], fn()));
  for (let x = qx0 + 6; x < qx1 - 3; x += 12) FD.push(box([x - .5, -1.2, 0], [x + .5, yD - .1, .45]));
  for (let x = qx0 + 10; x < qx1 - 5; x += 15) BO.push(lathe([x, yD, -1.3], FY, [[0, .3], [.45, .22], [.55, .38], [.62, .38], [.66, 0]], { n: 14, gen: 3, caps: true }));
  for (const z of [-7.5 - CR.GAUGE / 2, -7.5 + CR.GAUGE / 2]) for (const dz of [-.04, .04]) RL.push(line([[qx0 + 2, yD + .03, z + dz], [qx1 - 2, yD + .03, z + dz]], { w: .6 }));
  // transit sheds: walls with doors, gable roofs, cladding ribs
  const sheds = [[-96, -36, -58, -34], [-24, 36, -58, -34]];
  sheds.forEach(([x0, x1, z0, z1], i) => {
    const P = SH[i];
    // the shed's long axis runs along x: walls around, ridge along x
    P.push(box([x0, yD, z0], [x1, yD + 9, z1], { skip: [1] }));
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    P.push(sheet([[x0 - .6, yD + 8.8, z1 + .6], [x1 + .6, yD + 8.8, z1 + .6], [x1 + .6, yD + 11.6, zm], [x0 - .6, yD + 11.6, zm]], [0, 1.5, 1]));
    P.push(sheet([[x0 - .6, yD + 8.8, z0 - .6], [x1 + .6, yD + 8.8, z0 - .6], [x1 + .6, yD + 11.6, zm], [x0 - .6, yD + 11.6, zm]], [0, 1.5, -1]));
    for (const x of [x0, x1]) P.push(panel([[x, yD + 9, z0], [x, yD + 9, z1], [x, yD + 11.6, zm], [x, yD + 11.6, zm]], { edge: .8 }));
    for (let x = x0 + 6; x < x1 - 4; x += 12) { P.push(panel([[x, yD + .05, z1 + .02], [x + 6, yD + .05, z1 + .02], [x + 6, yD + 6.2, z1 + .02], [x, yD + 6.2, z1 + .02]], { edge: .85, pts: false })); P.push(line([[x + 3, yD + .05, z1 + .03], [x + 3, yD + 6.2, z1 + .03]], fn({ w: .5 }))); }
    for (let x = x0 + 2; x < x1; x += 2) P.push(line([[x, yD + .1, z0 - .02], [x, yD + 8.9, z0 - .02]], fn({ w: .3, pts: false })));
    for (let x = x0 + 5; x < x1 - 2; x += 10) P.push(box([x - 1, yD + 11.3, zm - .5], [x + 1, yD + 12.1, zm + .5], fn()));
  });
  // containers on the apron: two stacks
  const ctr = (x, y, z, rot) => { const T = X.make(R.y(rot), [x, y, z]); CN.push(...tps(T, [box([-1.22, 0, -3.03], [1.22, 2.59, 3.03], { ribs: { z: 12 } }), panel([[-1.1, .1, 3.04], [1.1, .1, 3.04], [1.1, 2.5, 3.04], [-1.1, 2.5, 3.04]], fn({ edge: .7, pts: false }))])); };
  for (const [x, z, n] of [[52, -22, 2], [55, -22, 1], [58, -22, 2], [52, -28.5, 1], [66, -40, 3], [69, -40, 2]]) for (let k = 0; k < n; k++) ctr(x, yD + k * 2.6, z, PI / 2);
  // breakwater: rubble mound segments (base 24 m at -9, crown 7 m at +3.5), crown wall on the seaward side
  const B = PORT.BREAKWATER;
  for (let i = 0; i < B.length - 1; i++) {
    const a = [B[i][0], 0, B[i][1]], b = [B[i + 1][0], 0, B[i + 1][1]], d = V.norm(V.sub(b, a)), n = [-d[2], 0, d[0]];
    const ext = i < B.length - 2 ? 2 : 6, a2 = V.mad(a, d, -2), b2 = V.mad(b, d, ext);
    const q = (p, s, y) => [p[0] + n[0] * s, y, p[2] + n[2] * s];
    BW.push(hex([q(a2, -8.5, -2.5), q(a2, 8.5, -2.5), q(b2, 8.5, -2.5), q(b2, -8.5, -2.5), q(a2, -3.5, 3.5), q(a2, 3.5, 3.5), q(b2, 3.5, 3.5), q(b2, -3.5, 3.5)], { ds: 1.4 }));
    BW.push(wall(V.add(a, V.mul(n, 2.8)), V.add(b, V.mul(n, 2.8)), 1.2, 3.5, 5.6));
  }
  // rounded head of rubble at the end + the light
  const hd = [B[B.length - 1][0], 0, B[B.length - 1][1]];
  BW.push(lathe([hd[0], -2.5, hd[2]], FY, [[0, 12.5], [6, 5]], { n: 30, caps: true, ds: 1.4 }));
  LT.push(lathe([hd[0], 3.5, hd[2]], FY, [[0, 1.4], [.5, 1.4], [.5, .95], [8.6, .75], [8.6, 1.3], [8.9, 1.3]], { n: 18, gen: 4, rings: [0, 2, 3, 5], caps: true }));
  for (const y of [5.2, 7.0, 8.8, 10.6]) LT.push(lathe([hd[0], y, hd[2]], FY, [[0, .92], [.8, .88]], fn({ n: 16, gen: 0, pts: false })));
  LT.push(lathe([hd[0], 12.4, hd[2]], FY, [[0, .55], [1.1, .55], [1.1, .6], [1.5, .2]], { n: 16, gen: 4, ds: 1.6 }));
  LT.push(circle([hd[0], 13.1, hd[2]], FY, 1.2, 20, fn({ w: .5 })));
  return { Q, FD, BO, RL, SH, CN, BW, LT, head: V.add(hd, [0, 12.9, 0]) };
}
const PORT_GEO = memo(portGeo);
function portCraneParts(c) {
  const W = portCraneXf(c), k = c.id;
  const S = st => ({ slew: st['slew' + k] === undefined ? c.slew : st['slew' + k], luff: st['luff' + k] === undefined ? c.luff : st['luff' + k], drop: st['drop' + k] === undefined ? c.drop : st['drop' + k] });
  const hookAt = st => { const s = S(st), t = crTip(s.slew, s.luff); return X.ap(W, [t[0], t[1] - s.drop, t[2]]); };
  const rope = st => { const s = S(st), t = X.ap(W, crTip(s.slew, s.luff)); return [line([t, hookAt(st)], { w: .7 })]; };
  return [
    { name: 'portal' + k, label: `Portal crane ${k} · 10.5 m gauge`, prims: tps(W, cranePortal()) },
    { name: 'house' + k, label: `Crane ${k} · slewing house`, prims: craneHouse(), xf: st => X.mul(W, crHouseXf(S(st).slew)) },
    { name: 'boom' + k, label: `Crane ${k} · lattice jib 30 m`, prims: craneBoom(), xf: st => { const s = S(st); return X.mul(W, crBoomXf(s.slew, s.luff)); } },
    { name: 'hook' + k, label: `Crane ${k} · hook`, prims: craneHook(), xf: st => X.make(R.y(PI / 2 + S(st).slew), hookAt(st)) },
    { name: 'rope' + k, label: `Crane ${k} · hoist rope`, prims: rope({}), dyn: rope },
  ];
}
function port() {
  const g = PORT_GEO();
  return {
    name: 'port', LIGHT: g.head,
    parts: [
      { name: 'quay', label: 'Quay · 220 m · deck +2.5 m', prims: g.Q.concat(g.RL) },
      { name: 'fenders', label: 'Fenders · bollards', prims: g.FD.concat(g.BO) },
      ...portCraneParts(PORT.CRANES[0]), ...portCraneParts(PORT.CRANES[1]),
      { name: 'shedA', label: 'Transit shed 1 · 60 × 24 m', prims: g.SH[0] },
      { name: 'shedB', label: 'Transit shed 2 · 60 × 24 m', prims: g.SH[1] },
      { name: 'containers', label: 'Containers · 20 ft', prims: g.CN },
      { name: 'breakwater', label: 'Breakwater · rubble mound', prims: g.BW },
      { name: 'light', label: 'Breakwater head light · 9 m', prims: g.LT },
    ],
  };
}

/* ================================================================ lighthouse
   A 28 m masonry tower: plinth, tapered tower, gallery with railing, lantern (glazing, astragals,
   dome, ventilator), the rotating lens, keeper's house. state: lamp (rad, lens / beam azimuth). */
const LH = { H0: 22, LAMP: [0, 24.9, 0] };
const LH_GEO = memo(() => {
  const PL = [], TW = [], GL = [], LA = [], LE = [], HO = [], H0 = LH.H0;
  PL.push(lathe([0, 0, 0], FY, [[0, 4.4], [.9, 4.4], [1.2, 3.6]], { n: 32, gen: 8, caps: true }));
  PL.push(lathe([0, 0, 0], FY, [[0, 15.5], [.8, 15.5]], fn({ n: 48, gen: 0, ds: 2 })));                          // low boundary wall
  TW.push(lathe([0, 1.2, 0], FY, [[0, 3.2], [H0 - 2.4, 2.12], [H0 - 1.8, 2.1], [H0 - 1.2, 2.55], [H0 - .6, 2.95]], { n: 36, gen: 10, rings: [0, 1, 3] }));
  for (const y of [6, 11, 16]) TW.push(lathe([0, y, 0], FY, [[0, mix(3.2, 2.15, (y - 1.2) / (H0 - 3))], [.001, mix(3.2, 2.15, (y - 1.2) / (H0 - 3))]], fn({ n: 36, gen: 0, pts: false })));
  TW.push(panel([[-.55, 1.3, 3.17], [.55, 1.3, 3.17], [.55, 3.6, 3.12], [-.55, 3.6, 3.12]], { edge: .9, pts: false }));
  for (const [y, a] of [[7.5, .3], [12.5, 2.4], [17.5, .3]]) { const r = mix(3.2, 2.15, (y - 1.2) / (H0 - 3)) + .01, c = [Math.sin(a) * r, y, Math.cos(a) * r], u = [Math.cos(a), 0, -Math.sin(a)]; TW.push(panel([V.add(c, V.add(V.mul(u, -.3), [0, -.5, 0])), V.add(c, V.add(V.mul(u, .3), [0, -.5, 0])), V.add(c, V.add(V.mul(u, .3), [0, .5, 0])), V.add(c, V.add(V.mul(u, -.3), [0, .5, 0]))], { edge: .7, pts: false })); }
  // gallery: slab, railing (posts + two rails)
  GL.push(lathe([0, H0 + .6, 0], FY, [[0, 3.05], [.28, 3.05]], { n: 40, gen: 0, caps: true }));
  for (const y of [H0 + 1.35, H0 + 1.95]) GL.push(circle([0, y, 0], FY, 2.95, 40, { w: .6 }));
  for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; GL.push(line([[Math.cos(a) * 2.95, H0 + .88, Math.sin(a) * 2.95], [Math.cos(a) * 2.95, H0 + 1.95, Math.sin(a) * 2.95]], fn({ w: .5 }))); }
  // lantern: base wall, glazing (sparse dots), astragals, dome, ventilator, lightning rod, vane
  const yL = H0 + .88;
  LA.push(lathe([0, yL, 0], FY, [[0, 1.65], [1.0, 1.65]], { n: 32, gen: 6, caps: false }));
  LA.push(lathe([0, yL + 1.0, 0], FY, [[0, 1.6], [2.4, 1.6]], { n: 32, gen: 0, rings: [0, 1], ds: 2.6, al: .6 }));
  for (let k = 0; k < 12; k++) { const a = (k + .5) / 12 * TAU; LA.push(line([[Math.cos(a) * 1.61, yL + 1.0, Math.sin(a) * 1.61], [Math.cos(a) * 1.61, yL + 3.4, Math.sin(a) * 1.61]], { w: .6 })); }
  LA.push(lathe([0, yL + 3.4, 0], FY, [[0, 1.85], [.15, 1.8], [.6, 1.35], [1.1, .7], [1.35, .25], [1.4, 0]], { n: 32, gen: 8, rings: [0, 2, 4] }));
  LA.push(lathe([0, yL + 4.75, 0], FY, [[0, .15], [.1, .3], [.35, .3], [.5, .12], [.55, 0]], { n: 14, gen: 4 }));
  LA.push(line([[0, yL + 5.3, 0], [0, yL + 6.4, 0]], { w: .6 }));
  LA.push(line([[0, yL + 5.9, 0], [.55, yL + 5.9, .1], [.55, yL + 6.1, .1], [0, yL + 6.05, 0]], fn({ w: .5 })));
  // lens (lens-local: centre of the lamp at the origin, turns about Y): drum of panels + pedestal
  LE.push(lathe([0, -.85, 0], FY, [[0, .5], [.25, .72], [.45, .82], [1.25, .82], [1.45, .72], [1.7, .5]], { n: 24, gen: 8, rings: [1, 2, 3, 4] }));
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU, e = [Math.sin(a), 0, Math.cos(a)]; LE.push(ringW(V.mad([0, 0, 0], e, .83), e, .38, { n: 16, fine: true })); LE.push(ringW(V.mad([0, 0, 0], e, .835), e, .18, { n: 12, fine: true })); }
  LE.push(lathe([0, -1.75, 0], FY, [[0, .35], [.9, .25]], { n: 14, gen: 2, caps: true }));
  // keeper's house joined to the tower by a short passage
  const hx0 = 5.5, hx1 = 15.5, hz0 = -3.2, hz1 = 3.2;
  HO.push(box([hx0, 0, hz0], [hx1, 3.6, hz1], { skip: [1] }));
  HO.push(sheet([[hx0 - .4, 3.45, hz0 - .5], [hx1 + .4, 3.45, hz0 - .5], [hx1 + .4, 5.8, 0], [hx0 - .4, 5.8, 0]], [0, 1, -1]));
  HO.push(sheet([[hx0 - .4, 3.45, hz1 + .5], [hx1 + .4, 3.45, hz1 + .5], [hx1 + .4, 5.8, 0], [hx0 - .4, 5.8, 0]], [0, 1, 1]));
  for (const x of [hx0, hx1]) HO.push(panel([[x, 3.6, hz0], [x, 3.6, hz1], [x, 5.8, 0], [x, 5.8, 0]], { edge: .8 }));
  HO.push(box([12.8, 4.2, -1.8], [13.6, 7.0, -1.0]));
  HO.push(box([2.9, 0, -1.4], [hx0, 2.9, 1.4]));
  for (const x of [7.5, 10.5, 13.5]) for (const z of [hz0 - .01, hz1 + .01]) HO.push(panel([[x - .5, 1.1, z], [x + .5, 1.1, z], [x + .5, 2.5, z], [x - .5, 2.5, z]], { edge: .7, pts: false }));
  HO.push(panel([[hx1 + .01, .05, -.55], [hx1 + .01, .05, .55], [hx1 + .01, 2.2, .55], [hx1 + .01, 2.2, -.55]], { edge: .8, pts: false }));
  return { PL, TW, GL, LA, LE, HO };
});
function lighthouse() {
  const g = LH_GEO();
  return {
    name: 'lighthouse', LAMP: LH.LAMP,
    parts: [
      { name: 'plinth', label: 'Plinth · boundary wall', prims: g.PL },
      { name: 'tower', label: 'Tower · masonry · 22 m', prims: g.TW },
      { name: 'gallery', label: 'Gallery · railing', prims: g.GL },
      { name: 'lantern', label: 'Lantern room · glazing · dome', prims: g.LA },
      { name: 'lens', label: 'Rotating lens · 4 panels', prims: g.LE, xf: st => X.make(R.y(st.lamp || 0), LH.LAMP) },
      { name: 'house', label: "Keeper's house", prims: g.HO },
    ],
  };
}
export const LIGHTHOUSE = O(LH, { beam: st => ({ origin: LH.LAMP.slice(), dirs: [0, 1, 2, 3].map(k => { const a = (st && st.lamp || 0) + k * PI / 2; return [Math.sin(a), 0, Math.cos(a)]; }) }) });

/* ================================================================ radar hill
   A fixed air-surveillance post: a 12 m radome on a 18 m lattice tower, the antenna turning inside
   (seen through the X-ray), equipment building, satcom dish, fence. state: ant (rad). */
const RH = { TOP: 18, DOME_C: [0, 22.35, 0], DOME_R: 6, PF: 6.3 };
const RH_GEO = memo(() => {
  const TW = [], PF = [], RD = [], AN = [], BU = [], DI = [], FE = [], top = RH.TOP;
  const leg = (s, y) => { const w = mix(4.6, 2.5, y / top); return [s[0] * w, y, s[1] * w]; };
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const c of corners) { TW.push(cyl(leg(c, 0), leg(c, top), .16, { n: 8, gen: 2 })); TW.push(box(V.add(leg(c, 0), [-.5, 0, -.5]), V.add(leg(c, 0), [.5, .5, .5]))); }
  const lv = [0, 3.2, 6.6, 9.8, 12.8, 15.5, top];
  for (let i = 0; i < lv.length; i++) for (let k = 0; k < 4; k++) {
    const a = leg(corners[k], lv[i]), b = leg(corners[(k + 1) % 4], lv[i]);
    if (i > 0) TW.push(cyl(a, b, .08, { n: 6, gen: 0 }));
    if (i < lv.length - 1) { const a2 = leg(corners[k], lv[i + 1]), b2 = leg(corners[(k + 1) % 4], lv[i + 1]); TW.push(line([a, b2], { w: .55 }), line([b, a2], { w: .55 })); }
  }
  for (const x of [-.25, .25]) TW.push(line([[x, 0, 0], [x, top, 0]], fn({ w: .5 })));
  for (let y = .4; y < top; y += .4) TW.push(line([[-.25, y, 0], [.25, y, 0]], fn({ w: .35, pts: false })));
  TW.push(box([-.6, 0, -.6], [.6, 1.2, .6], fn()));
  // platform, railing
  const pf = RH.PF;
  PF.push(box([-pf, top, -pf], [pf, top + .35, pf], { bottom: true }));
  PF.push(line([[-pf, top + 1.4, -pf], [pf, top + 1.4, -pf], [pf, top + 1.4, pf], [-pf, top + 1.4, pf], [-pf, top + 1.4, -pf]], { w: .5 }));
  for (let k = 0; k < 4; k++) { const a = corners[k], b = corners[(k + 1) % 4]; for (let t = 0; t <= 6; t++) { const x = mix(a[0], b[0], t / 6) * pf, z = mix(a[1], b[1], t / 6) * pf; PF.push(line([[x, top + .35, z], [x, top + 1.4, z]], fn({ w: .45 }))); } }
  for (const c of corners) PF.push(cyl(leg(c, top - 3), [c[0] * (pf - .3), top, c[1] * (pf - .3)], .08, { n: 6, gen: 0 }));
  // radome: truncated sphere on a ring beam, panel seams (wire)
  const c = RH.DOME_C, r = RH.DOME_R, yb = top + .35, st = [];
  for (let k = 0; k <= 20; k++) { const y = mix(yb, c[1] + r, k / 20), rr = Math.sqrt(Math.max(0, r * r - (y - c[1]) * (y - c[1]))); st.push([y - yb, rr]); }
  RD.push(lathe([0, yb, 0], FY, st, { n: 40, gen: 10, rings: [0, 4, 8, 12, 16] }));
  RD.push(lathe([0, yb, 0], FY, [[0, st[0][1] + .15], [.4, st[0][1] + .15]], { n: 32, gen: 0 }));
  // antenna inside (antenna-local: turns about Y through the dome centre): pedestal, reflector, feed
  AN.push(cyl([0, yb - c[1], 0], [0, -1.4, 0], .5, { n: 14, gen: 2 }));
  AN.push(box([-.7, -1.6, -.6], [.7, -.9, .6]));
  const tilt = 12 * DEG, ax = [0, Math.sin(tilt), Math.cos(tilt)], dish = [];
  for (let k = 0; k <= 8; k++) { const rr = 4.2 * k / 8; dish.push([rr * rr / (4 * 2.6), rr]); }
  AN.push(lathe(V.mad([0, 0, 0], ax, -1.1), ax, dish, { n: 36, gen: 12, rings: [4, 8] }));
  for (const [x, y] of [[1.6, 1.2], [-1.6, 1.2], [0, -1.8]]) AN.push(line([V.add(V.mad([0, 0, 0], ax, -.6), [x, y, 0]), V.mad([0, 0, 0], ax, 1.4)], { w: .5 }));
  AN.push(box(V.add(V.mad([0, 0, 0], ax, 1.4), [-.2, -.2, -.15]), V.add(V.mad([0, 0, 0], ax, 1.4), [.2, .2, .25])));
  // equipment building with A/C units, door, cable tray to the tower
  BU.push(box([7, 0, -3.6], [21, 3.8, 3.6]));
  for (const x of [9.5, 13.5, 17.5]) BU.push(box([x - .7, 3.8, -1.2], [x + .7, 4.5, 1.2], fn()));
  BU.push(panel([[6.99, .05, -.6], [6.99, .05, .6], [6.99, 2.3, .6], [6.99, 2.3, -.6]], { edge: .8, pts: false }));
  BU.push(box([2.6, 2.9, -.25], [7, 3.1, .25], fn()));
  // satcom dish on a post
  const dp = [10, 0, 10], dAx = V.norm([-.4, .7, -.6]);
  DI.push(cyl(dp, V.add(dp, [0, 2.4, 0]), .12, { n: 8, gen: 0 }));
  const dd = []; for (let k = 0; k <= 5; k++) { const rr = 1.2 * k / 5; dd.push([rr * rr / 3.2, rr]); }
  DI.push(lathe(V.add(dp, [0, 2.8, 0]), dAx, dd, { n: 24, gen: 6, rings: [5] }));
  DI.push(line([V.add(dp, [0, 2.8, 0]), V.mad(V.add(dp, [0, 2.8, 0]), dAx, .9)], fn({ w: .6 })));
  // fence
  const fx = 30, fz = 20, loop = [[-fx, -fz], [fx, -fz], [fx, fz], [-fx, fz], [-fx, -fz]];
  for (let i = 0; i < 4; i++) {
    const a = loop[i], b = loop[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(L / 4);
    for (let k = 0; k <= n; k++) { const x = mix(a[0], b[0], k / n), z = mix(a[1], b[1], k / n); FE.push(box([x - .04, 0, z - .04], [x + .04, 2.2, z + .04], k % 2 ? fn() : {})); }
    for (const y of [.6, 1.4, 2.15]) FE.push(line([[a[0], y, a[1]], [b[0], y, b[1]]], { w: .45 }));
  }
  return { TW, PF, RD, AN, BU, DI, FE };
});
function radarHill() {
  const g = RH_GEO();
  return {
    name: 'radar_hill', DOME: RH.DOME_C,
    parts: [
      { name: 'tower', label: 'Lattice tower · 18 m', prims: g.TW },
      { name: 'platform', label: 'Platform · railing', prims: g.PF },
      { name: 'radome', label: 'Radome · Ø 12 m', prims: g.RD },
      O({ name: 'antenna', label: 'Search antenna · rotating', prims: g.AN, xf: st => X.make(R.y(st.ant || 0), RH.DOME_C) }, hidden),
      { name: 'building', label: 'Equipment building', prims: g.BU },
      { name: 'dish', label: 'Satcom dish · Ø 2.4 m', prims: g.DI },
      { name: 'fence', label: 'Fence · 60 × 40 m', prims: g.FE },
    ],
  };
}

/* ================================================================ airfield
   A 2500 × 45 m runway along Z (painted markings as dense line / panel prims, the surface sparse),
   a parallel taxiway with three links, an apron, two arched hangars, a control tower. Origin at the
   runway centre. Sample it coarse (see MODEL_INFO). */
const AF = { L: 2500, W: 45, TWY_X: 190, APRON: [201.5, 341.5, -150, 150] };
const AF_GEO = memo(() => {
  const RW = [], MK = [], TX = [], AP = [], HA = [], HB = [], TO = [], WS = [];
  const hl = AF.L / 2, hw = AF.W / 2;
  const flat = (x0, x1, z0, z1, o) => sheet([[x0, .02, z0], [x1, .02, z0], [x1, .02, z1], [x0, .02, z1]], FY, O({ th: .02 }, o));
  const paint = (x0, x1, z0, z1, o) => panel([[x0, .06, z0], [x1, .06, z0], [x1, .06, z1], [x0, .06, z1]], O({ edge: .8, ds: .8 }, o));
  RW.push(flat(-hw, hw, -hl, hl, { ds: 6 }));
  RW.push(flat(-hw - 7.5, -hw, -hl, hl, { ds: 9, fine: true }), flat(hw, hw + 7.5, -hl, hl, { ds: 9, fine: true }));   // shoulders
  // markings: edge stripes, centreline dashes, threshold bars, designators, touchdown zone, aiming points
  for (const sx of [-1, 1]) MK.push(paint(sx * (hw - 1.4), sx * (hw - .5), -hl + 6, hl - 6));
  for (let z = -hl + 150; z < hl - 150; z += 60) MK.push(paint(-.45, .45, z, z + 36));
  for (const sz of [-1, 1]) {
    const zt = sz * (hl - 6), dz = -sz;
    for (let k = 0; k < 8; k++) for (const sx of [-1, 1]) { const x = sx * (3 + k * 2.25); MK.push(paint(Math.min(x, x + sx * 1.8), Math.max(x, x + sx * 1.8), Math.min(zt, zt + dz * 30), Math.max(zt, zt + dz * 30))); }
    // designator: two digits, 7-segment style, 9 m tall, reading from the approach
    const num = sz > 0 ? '18' : '36', z0 = zt + dz * 42;
    num.split('').forEach((d, i) => {
      const SEG = { 0: 'abcdef', 1: 'bc', 3: 'abcdg', 6: 'acdefg', 8: 'abcdefg' }[d] || 'g';
      const w = 3, h = 9, xc = (i ? 1 : -1) * 3 * -sz;
      const P = (u, v) => [xc + u * w * -sz, .07, z0 + dz * v * h];
      const segs = { a: [[-.5, 1], [.5, 1]], b: [[.5, 1], [.5, .5]], c: [[.5, .5], [.5, 0]], d: [[-.5, 0], [.5, 0]], e: [[-.5, 0], [-.5, .5]], f: [[-.5, .5], [-.5, 1]], g: [[-.5, .5], [.5, .5]] };
      for (const s of SEG) { const [a, b] = segs[s]; for (const o of [-.3, 0, .3]) MK.push(line([V.add(P(...a), s === 'a' || s === 'd' || s === 'g' ? [0, 0, o] : [o, 0, 0]), V.add(P(...b), s === 'a' || s === 'd' || s === 'g' ? [0, 0, o] : [o, 0, 0])], { w: .8 })); }
    });
    for (const zz of [150, 300, 450]) for (const sx of [-1, 1]) { const z = zt + dz * (zz + 6); MK.push(paint(sx * 6, sx * 9, Math.min(z, z + dz * 22.5), Math.max(z, z + dz * 22.5))); }
    for (const sx of [-1, 1]) { const z = zt + dz * 400; MK.push(paint(sx * 6, sx * 16, Math.min(z, z + dz * 60), Math.max(z, z + dz * 60))); }
  }
  // parallel taxiway + three links, centreline, edges
  const tx = AF.TWY_X, th = 11.5, tl = 1100;
  TX.push(flat(tx - th, tx + th, -tl, tl, { ds: 6 }));
  TX.push(line([[tx, .06, -tl], [tx, .06, tl]], { w: .7 }));
  for (const sx of [-1, 1]) TX.push(line([[tx + sx * (th - .3), .06, -tl], [tx + sx * (th - .3), .06, tl]], fn({ w: .5 })));
  for (const z of [-tl + 12, 0, tl - 12]) { TX.push(flat(hw + 7.5, tx - th, z - 11.5, z + 11.5, { ds: 6 })); TX.push(line([[hw + 2, .06, z], [tx, .06, z]], { w: .7 })); }
  // apron with parking lines
  const [ax0, ax1, az0, az1] = AF.APRON;
  AP.push(flat(ax0, ax1, az0, az1, { ds: 5 }));
  for (let z = az0 + 30; z < az1; z += 45) AP.push(line([[ax0 + 8, .06, z], [ax0 + 70, .06, z]], fn({ w: .6 })));
  AP.push(line([[ax0 + 4, .06, az0 + 4], [ax0 + 4, .06, az1 - 4]], { w: .6 }));
  // hangars: arched, door toward the apron (-X), 50 m deep, 40 m span, 13.5 m high
  const hangar = (P, zc) => {
    const x0 = ax1 + 4, x1 = x0 + 50, S = [];
    for (let k = 0; k <= 6; k++) S.push(SA.arc(0, 20, 0, 13.5, 2.2, 17).map(p => [mix(x0, x1, k / 6), p[1], zc + p[0]]));
    P.push(...SA.loft(SA.skin(S, true), { lines: [2, 5, 8, 11, 14], rings: [0, 2, 4, 6], al: .7, ds: 1.2 }));
    const arcB = SA.arc(0, 20, 0, 13.5, 2.2, 17);
    for (let j = 0; j < arcB.length - 1; j++) { const a = arcB[j], b = arcB[j + 1]; P.push(sheet([[x1, 0, zc + a[0]], [x1, 0, zc + b[0]], [x1, b[1], zc + b[0]], [x1, a[1], zc + a[0]]], [1, 0, 0], { ds: 1.4 })); }
    for (let j = 0; j < arcB.length - 1; j++) { const a = arcB[j], b = arcB[j + 1]; P.push(panel([[x0, 0, zc + a[0]], [x0, 0, zc + b[0]], [x0, b[1], zc + b[0]], [x0, a[1], zc + a[0]]], { ds: 2.2, edge: .6 })); }
    for (let k = -3; k <= 3; k++) P.push(line([[x0 - .05, 0, zc + k * 5.6], [x0 - .05, Math.sqrt(Math.max(0, 1 - Math.pow(k * 5.6 / 20, 2))) * 13.2, zc + k * 5.6]], fn({ w: .5 })));
  };
  hangar(HA, -95); hangar(HB, 95);
  // control tower: base building, shaft, glazed cab (sparse dots), roof, antennas, beacon
  const tc = [ax0 + 20, 0, az1 + 45];
  TO.push(box(V.add(tc, [-9, 0, -5]), V.add(tc, [9, 4.2, 5])));
  TO.push(box(V.add(tc, [-3, 4.2, -3]), V.add(tc, [3, 18, 3])));
  TO.push(lathe(V.add(tc, [0, 18, 0]), FY, [[0, 4.4], [.6, 4.4]], { n: 8, gen: 8, caps: true }));
  TO.push(lathe(V.add(tc, [0, 18.6, 0]), FY, [[0, 3.8], [3.3, 4.5]], { n: 8, gen: 8, rings: [0, 1], ds: 2.4, al: .7 }));
  TO.push(lathe(V.add(tc, [0, 21.9, 0]), FY, [[0, 4.8], [.45, 4.8], [.45, 0]], { n: 8, gen: 8, caps: true }));
  for (const [x, z, h] of [[1.5, 1, 5], [-2, -1.5, 3.2]]) TO.push(line([V.add(tc, [x, 22.35, z]), V.add(tc, [x, 22.35 + h, z])], { w: .6 }));
  TO.push(lathe(V.add(tc, [-1.2, 22.35, 1.5]), FY, [[0, .25], [.5, .25], [.6, 0]], fn({ n: 10 })));
  // windsock by the runway
  const wp = [hw + 60, 0, -hl + 320];
  WS.push(line([wp, V.add(wp, [0, 6, 0])], { w: .8 }));
  WS.push(lathe(V.add(wp, [0, 5.6, 0]), V.norm([1, -.25, .4]), [[0, .45], [3.6, .22]], { n: 12, gen: 4, rings: [0, 1] }));
  return { RW, MK, TX, AP, HA, HB, TO, WS };
});
function airfield() {
  const g = AF_GEO();
  return {
    name: 'airfield', L: AF.L, W: AF.W,
    parts: [
      { name: 'runway', label: 'Runway 18/36 · 2500 × 45 m', prims: g.RW },
      { name: 'markings', label: 'Runway markings', prims: g.MK },
      { name: 'taxiway', label: 'Taxiway · 23 m · 3 links', prims: g.TX },
      { name: 'apron', label: 'Apron · 140 × 300 m', prims: g.AP },
      { name: 'hangarA', label: 'Hangar 1 · arched · 40 m span', prims: g.HA },
      { name: 'hangarB', label: 'Hangar 2 · arched · 40 m span', prims: g.HB },
      { name: 'tower', label: 'Control tower · 22 m', prims: g.TO },
      { name: 'windsock', label: 'Windsock', prims: g.WS },
    ],
  };
}

/* ================================================================ munitions (closed shells)
   57E6 (Pantsir-S1): two-stage, 3.2 m; booster Ø 170 mm, sustainer dart Ø 90 mm. Origin mid-stack.
   state: booster (bool, default true), fin (booster fins 0 folded .. 1 open, default 1). */
function pantsirMissile() {
  const zB0 = -1.6, zB1 = -.22, rB = .085, rD = .045, zN = 1.6;
  const NS = [], DA = [], FD = [], BO = [];
  NS.push(lathe([0, 0, zN - .36], FZ, [[0, rD], [.1, rD * .92], [.2, rD * .72], [.29, rD * .42], [.36, .004]], { n: 14, gen: 4, rings: [0] }));
  DA.push(lathe([0, 0, zB1 - .05], FZ, [[0, rD], [zN - .36 - zB1 + .05, rD]], { n: 14, gen: 4, rings: [0, 1] }));
  for (const z of [.2, .7]) DA.push(ringW([0, 0, z], FZ, rD + .002, fn({ n: 12 })));
  for (const deg of [45, 135, 225, 315]) {
    const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (r, z) => [e[0] * r, e[1] * r, z];
    FD.push(panel([at(rD, zB1 + .32), at(rD + .075, zB1 + .12), at(rD + .075, zB1 + .02), at(rD, zB1 + .02)], { edge: 1 }));
  }
  BO.push(lathe([0, 0, zB0], FZ, [[0, .055], [.03, rB * .9], [.06, rB], [zB1 - zB0 - .12, rB], [zB1 - zB0 - .02, rD + .01], [zB1 - zB0, rD + .004]], { n: 18, gen: 4, rings: [2, 3], caps: true }));
  BO.push(lathe([0, 0, zB0], [0, 0, -1], [[0, .045], [.05, .055]], { n: 12, gen: 0, rings: [1] }));
  for (const z of [zB0 + .5, zB0 + .95]) BO.push(ringW([0, 0, z], FZ, rB + .002, fn({ n: 16 })));
  const finsB = st => {
    const f = st.fin === undefined ? 1 : st.fin, out = [];
    for (const deg of [0, 90, 180, 270]) {
      const a = deg * DEG, c = Math.cos(a), s = Math.sin(a), at = (r, z) => [c * r, s * r, z];
      const T = about(R.z(-(1 - f) * PI / 2), at(rB, 0));
      out.push(tp(T, panel([at(rB, zB0 + .3), at(rB + .13, zB0 + .12), at(rB + .13, zB0 + .02), at(rB, zB0 + .02)], { edge: 1 })));
    }
    return out;
  };
  return {
    name: 'pantsir_missile', LEN: 3.2, NOZZLE: [0, 0, zB0 - .05], SEP: zB1,
    parts: [
      { name: 'nose', label: 'Nose cone', prims: NS },
      { name: 'dart', label: 'Sustainer dart · Ø 90 mm', prims: DA },
      { name: 'finsD', label: 'Control fins ×4', prims: FD },
      { name: 'booster', label: 'Booster stage · Ø 170 mm', prims: BO, show: st => st.booster !== false },
      { name: 'finsB', label: 'Booster fins ×4 · folding', prims: finsB({}), dyn: finsB, show: st => st.booster !== false },
    ],
  };
}
/* Tomahawk-class subsonic cruise missile: 5.56 m, Ø 0.52 m; booster behind. Origin mid-body.
   state: wing (0 stowed in the body .. 1 out, 2.67 m span), fin (0 folded .. 1), inlet (0 flush .. 1
   deployed), booster (bool, default false). */
function strikeMissile() {
  const r = .26, z0 = -2.78, z1 = 2.78;
  const NS = [], BD = [], IN = [], BO = [];
  NS.push(lathe([0, 0, z1 - .7], FZ, [[0, r], [.3, r * .96], [.48, r * .8], [.6, r * .55], [.67, r * .25], [.7, 0]], { n: 24, gen: 6, rings: [0, 2] }));
  BD.push(lathe([0, 0, z0 + .55], FZ, [[0, r], [z1 - .7 - z0 - .55, r]], { n: 24, gen: 6, rings: [0, 1] }));
  BD.push(lathe([0, 0, z0], FZ, [[0, .16], [.12, .19], [.55, r]], { n: 24, gen: 4, rings: [0, 1] }));
  for (const z of [-1.4, .15, 1.2]) BD.push(ringW([0, 0, z], FZ, r + .003, { n: 24 }));
  BD.push(box([-.07, r - .02, -1.0], [.07, r + .04, 1.6], fn()));                                              // dorsal cable duct
  BD.push(box([-.19, -r + .03, -.34], [.19, -r + .09, .5], fn()));                                              // wing slot fairing
  const finsP = st => {
    const f = st.fin === undefined ? 1 : st.fin, out = [];
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG, c = Math.cos(a), s = Math.sin(a), at = (rr, z) => [c * rr, s * rr, z];
      const T = about(R.z(-(1 - f) * PI / 2), at(r * .72, 0));
      out.push(tp(T, panel([at(r * .72, z0 + .5), at(r + .36, z0 + .18), at(r + .36, z0 + .04), at(r * .66, z0 + .04)], { edge: 1 })));
    }
    return out;
  };
  const wingsP = st => {
    const w = st.wing === undefined ? 1 : st.wing, out = [];
    for (const sx of [-1, 1]) {
      const T = X.mul(T3([0, sx > 0 ? -r + .12 : -r + .06, .35]), X.make(R.y(sx * (1 - w) * PI / 2), [0, 0, 0]));
      const q = [[sx * .02, 0, .2], [sx * 1.33, 0, .12], [sx * 1.33, 0, -.16], [sx * .02, 0, -.2]];
      out.push(tp(T, sheet(q, [0, 1, 0], { th: .03 })));
    }
    return out;
  };
  const inletP = st => { const k = st.inlet === undefined ? 1 : st.inlet, y = -r - .02 - .16 * k; return [hex([[-.12, -r + .02, -1.15], [.12, -r + .02, -1.15], [.12, -r + .02, -.55], [-.12, -r + .02, -.55], [-.14, y, -1.1], [.14, y, -1.1], [.14, y, -.72], [-.14, y + .06, -.72]], { edge: 1 })]; };
  BO.push(lathe([0, 0, z0 - .72], FZ, [[0, .2], [.08, r], [.7, r], [.72, .18]], { n: 22, gen: 4, rings: [1, 2], caps: true }));
  BO.push(lathe([0, 0, z0 - .72], [0, 0, -1], [[0, .12], [.16, .17]], { n: 14, gen: 4, rings: [1] }));
  return {
    name: 'strike_missile', LEN: 5.56, R: r,
    parts: [
      { name: 'nose', label: 'Nose · Tomahawk-class', prims: NS },
      { name: 'body', label: 'Body · Ø 0.52 m · 5.56 m', prims: BD },
      { name: 'wings', label: 'Wings ×2 · pop-out · 2.67 m', prims: wingsP({}), dyn: wingsP, show: st => (st.wing === undefined ? 1 : st.wing) > .02 },
      { name: 'fins', label: 'Tail fins ×4 · folding', prims: finsP({}), dyn: finsP },
      { name: 'inlet', label: 'Air inlet · ventral', prims: inletP({}), dyn: inletP },
      { name: 'booster', label: 'Booster · solid', prims: BO, show: st => !!st.booster },
    ],
  };
}
/* AIM-120 AMRAAM: 3.66 m, Ø 178 mm, mid-body wings ×4, tail control fins ×4. Origin mid-body. */
function aam() {
  const r = .089, z0 = -1.83, z1 = 1.83, RD = [], BD = [], WG = [], FN = [];
  RD.push(lathe([0, 0, z1 - .5], FZ, [[0, r], [.2, r * .9], [.34, r * .65], [.44, r * .3], [.5, .003]], { n: 16, gen: 4, rings: [0] }));
  BD.push(lathe([0, 0, z0], FZ, [[0, r * .8], [.03, r], [z1 - .5 - z0, r]], { n: 16, gen: 4, rings: [1, 2], caps: true }));
  for (const z of [-.9, .2, 1.0]) BD.push(ringW([0, 0, z], FZ, r + .002, fn({ n: 14 })));
  BD.push(box([-.03, r - .01, -1.3], [.03, r + .025, .9], fn()));
  for (const deg of [45, 135, 225, 315]) {
    const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (rr, z) => [e[0] * rr, e[1] * rr, z];
    WG.push(panel([at(r, .42), at(r + .135, .06), at(r + .135, -.06), at(r, -.12)], { edge: 1 }));
    FN.push(panel([at(r, z0 + .34), at(r + .23, z0 + .12), at(r + .23, z0 + .01), at(r, z0 + .01)], { edge: 1 }));
  }
  return {
    name: 'aam', LEN: 3.66, NOZZLE: [0, 0, z0],
    parts: [
      { name: 'radome', label: 'Radome', prims: RD },
      { name: 'body', label: 'AIM-120 AMRAAM · Ø 178 mm', prims: BD },
      { name: 'wings', label: 'Mid-body wings ×4', prims: WG },
      { name: 'fins', label: 'Tail control fins ×4', prims: FN },
    ],
  };
}
/* 5"/62 projectile (Mk 45): 127 mm, 0.66 m. Origin mid-body. */
function shell() {
  const r = .0635, OG = [], BD = [], BA = [];
  OG.push(lathe([0, 0, .03], FZ, [[0, r], [.1, r * .92], [.19, r * .72], [.26, r * .46], [.3, r * .28], [.33, .004]], { n: 14, gen: 4, rings: [0, 4] }));
  BD.push(lathe([0, 0, -.33], FZ, [[0, r * .78], [.08, r * .95], [.36, r]], { n: 14, gen: 4, rings: [0, 1, 2], caps: true }));
  BA.push(lathe([0, 0, -.25], FZ, [[0, r + .004], [.035, r + .004]], { n: 14, gen: 0, rings: [0, 1] }));
  return { name: 'shell', LEN: .66, parts: [
    { name: 'ogive', label: 'Ogive nose', prims: OG },
    { name: 'body', label: '5"/62 projectile · 127 mm', prims: BD },
    { name: 'band', label: 'Rotating band', prims: BA },
  ] };
}
/* generic slim missile shell: body of radius r from z0 to z1 (origin mid-body, nose +Z), ogive nose of
   length nl, optional boat-tail; fin sets { z: trailing edge, root, tip (chords), span, deg[] }; strakes */
function slimShell(o) {
  const { r, z0, z1, nl } = o, NS = [], BD = [], FN = [], WG = [];
  const og = []; for (let k = 0; k <= 8; k++) { const t = k / 8; og.push([t * nl, Math.max(.003, r * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - .15 * t))]); }
  NS.push(lathe([0, 0, z1 - nl], FZ, og, { n: 18, gen: 4, rings: [0, 4] }));
  BD.push(lathe([0, 0, z0], FZ, [[0, r * (o.tail || .85)], [.05, r], [z1 - nl - z0, r]], { n: 18, gen: 4, rings: [1, 2], caps: true }));
  for (const z of o.joints || []) BD.push(ringW([0, 0, z], FZ, r + .003, fn({ n: 16 })));
  if (o.strakes) for (const deg of [45, 135, 225, 315]) {
    const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (rr, z) => [e[0] * rr, e[1] * rr, z], [s0, s1, h] = o.strakes;
    BD.push(panel([at(r, s0), at(r + h, s0 + .25), at(r + h, s1 - .2), at(r, s1)], { edge: .9 }));
  }
  const fins = (set, out) => { for (const deg of set.deg || [45, 135, 225, 315]) {
    const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (rr, z) => [e[0] * rr, e[1] * rr, z], z = set.z;
    out.push(panel([at(r, z + set.root), at(r + set.span, z + set.tip + (set.sweep || 0)), at(r + set.span, z + (set.sweep || 0)), at(r, z)], { edge: 1 }));
  } };
  for (const f of o.fins || []) fins(f, FN);
  for (const w of o.wings || []) fins(w, WG);
  return { NS, BD, FN, WG };
}
/* RIM-162 ESSM: 3.66 m, Ø 254 mm, long body strakes, tail control fins ×4 */
function essm() {
  const g = slimShell({ r: .127, z0: -1.83, z1: 1.83, nl: .55, joints: [-.8, .3], strakes: [-1.1, .9, .07], fins: [{ z: -1.83, root: .34, tip: .16, span: .2, sweep: .06 }] });
  return { name: 'essm', LEN: 3.66, parts: [
    { name: 'radome', label: 'Radome', prims: g.NS },
    { name: 'body', label: 'RIM-162 ESSM · Ø 254 mm', prims: g.BD },
    { name: 'fins', label: 'Tail control fins ×4', prims: g.FN },
  ] };
}
/* AGM-84H SLAM-ER: 4.37 m, Ø 0.34 m, pop-out wings (state wing 0..1), tail fins ×4 */
function slam() {
  const r = .17, z0 = -2.185, z1 = 2.185;
  const g = slimShell({ r, z0, z1, nl: .45, tail: .9, joints: [-1.0, .2, 1.2], fins: [{ z: z0, root: .42, tip: .22, span: .36, sweep: .08 }] });
  const wingsP = st => {
    const w = st.wing === undefined ? 1 : st.wing, out = [];
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG, e = [Math.cos(a), Math.sin(a), 0], at = (rr, z) => [e[0] * rr, e[1] * rr, z];
      const T = about(R.z(-(1 - w) * PI / 2), at(r, 0));
      out.push(tp(T, panel([at(r, .55), at(r + 1.03, .25), at(r + 1.03, .02), at(r, -.2)], { edge: 1 })));
    }
    return out;
  };
  return { name: 'slam', LEN: 4.37, parts: [
    { name: 'nose', label: 'Nose · seeker window', prims: g.NS },
    { name: 'body', label: 'AGM-84H SLAM-ER · Ø 0.34 m', prims: g.BD },
    { name: 'wings', label: 'Wings ×4 · pop-out', prims: wingsP({}), dyn: wingsP },
    { name: 'fins', label: 'Tail control fins ×4', prims: g.FN },
  ] };
}
/* AGM-114 Hellfire: 1.63 m, Ø 178 mm, mid-body wings ×4, canards ×4 */
function hellfire() {
  const g = slimShell({ r: .089, z0: -.815, z1: .815, nl: .2, tail: .9, joints: [-.2], fins: [{ z: -.72, root: .5, tip: .34, span: .077, sweep: .05 }], wings: [{ z: .38, root: .12, tip: .06, span: .055, deg: [0, 90, 180, 270] }] });
  return { name: 'hellfire', LEN: 1.63, parts: [
    { name: 'nose', label: 'Nose · seeker dome', prims: g.NS },
    { name: 'body', label: 'AGM-114 Hellfire · Ø 178 mm', prims: g.BD },
    { name: 'wings', label: 'Wings ×4', prims: g.FN },
    { name: 'canards', label: 'Canards ×4', prims: g.WG },
  ] };
}
/* Mk 41 launch-cell canister, closed: canister-local, top centre at the origin, axis down -Y */
const CAN = { L: 6.7, W: .58 };
function mk41Can() {
  const P = [], w = CAN.W / 2;
  P.push(box([-w, -CAN.L, -w], [w, 0, w], { bottom: true }));
  for (const y of [-.25, -1.9, -3.5, -5.1, -6.45]) P.push(box([-w - .025, y - .07, -w - .025], [w + .025, y + .07, w + .025], fn({ skip: [0, 1] })));
  P.push(box([-w + .06, -.02, -w + .06], [w - .06, .03, w - .06], fn({ skip: [0] })));
  return { name: 'mk41_can', LEN: CAN.L, parts: [{ name: 'canister', label: 'Mk 41 canister · closed', prims: P }] };
}

/* ================================================================ cutaways (Inspect / Anatomy)
   The unit model re-partitioned into the assemblies the exploded view pulls apart (same geometry,
   same frame, same state) plus what the X-ray opens (interior parts: inside:true, show = st.xray). */

/* ---------- K340P TEL: the MZKT-7930's machinery (after the Anatomy film) ---------- */
const AXZ = [4.45, 2.25, -2.75, -4.95];
function chassisGroup(pr) {
  const { mn, mx, c } = bboxOf(pr), ax = Math.max(Math.abs(mn[0]), Math.abs(mx[0]));
  if (pr.t === 'lathe' && mx[1] < .9 && ax < 1.1 && AXZ.some(z => Math.abs(c[2] - z) < .4)) return 'axles';
  if (pr.t !== 'lathe' && mn[0] > -1.39 && mx[0] < 1.39 && mn[1] > 1.44 && mx[1] < 2.97 && mn[2] > 2.94 && mx[2] < 4.11) return 'bay';
  if (c[2] > 2.9 && c[2] < 4.2 && mx[1] > 2.97) return 'engacc';
  if (c[0] < -.9 && c[2] > -1.9 && c[2] < .6) return 'tank';
  if (c[0] > .85 && mx[1] < 1.35 && c[2] > -4.5 && c[2] < .6) return 'boxes';
  if (pr.t !== 'panel' && ax > 1.5 && (Math.abs(c[2] - 1.15) < .2 || Math.abs(c[2] + 6.5) < .2)) return c[0] > 0 ? 'outrigR' : 'outrigL';
  return 'frame';
}
const FAN_C = [1.35, 2.2, 3.525];
function yamz846() {
  const E = [], zb = 2.84, zf = 4.08, zm = (zb + zf) / 2, hz = (zf - zb) / 2;
  E.push(box([-.38, 1.22, zb], [.38, 1.78, zf], { bottom: true }));
  for (const sx of [-1, 1]) {
    const u = [sx * Math.SQRT1_2, Math.SQRT1_2, 0], w = [Math.SQRT1_2, -sx * Math.SQRT1_2, 0], c = [sx * .36, 2.02, zm];
    const at = h => [c[0] + u[0] * h, c[1] + u[1] * h, zm];
    E.push(obox(c, u, w, .2, .17, hz - .02));
    for (let k = 0; k < 6; k++) { const q = at(.27); q[2] = zb + .12 + k * .2; E.push(obox(q, u, w, .07, .16, .088)); }
    E.push(obox(at(.38), u, w, .04, .12, hz - .08));
    E.push(cyl([sx * .7, 2.02, zb + .1], [sx * .7, 2.02, zf - .1], .05, { n: 10 }));
    for (let k = 0; k < 6; k++) E.push(cyl([sx * .6, 2.02, zb + .12 + k * .2], [sx * .7, 2.02, zb + .12 + k * .2], .035, fn({ n: 8 })));
    E.push(lathe([sx * .06, 2.32, 3.9], [sx, 0, 0], [[0, .05], [.04, .12], [.13, .13], [.17, .08], [.21, .11], [.3, .11], [.33, .05]], { n: 18, caps: true }));
  }
  E.push(box([-.1, 1.98, zb + .08], [.1, 2.22, zf - .1]));
  E.push(lathe([0, 1.55, zb], [0, 0, -1], [[0, .4], [.12, .38], [.18, .28]], { n: 28, caps: true }));
  E.push(lathe([0, 1.5, zf], FZ, [[0, .26], [.05, .24], [.07, .15], [.12, .15]], { n: 22, caps: true }));
  E.push(lathe([.3, 1.95, zf - .02], FZ, [[0, .09], [.16, .09]], { n: 14, caps: true }));
  return E;
}
function mzktRadiator(sx, rot) {
  const P = [], xa = Math.min(sx * 1.06, sx * 1.24), xb = Math.max(sx * 1.06, sx * 1.24), xm = sx * 1.15;
  P.push(box([xa, 2.66, 3.1], [xb, 2.76, 3.95]), box([xa, 1.64, 3.1], [xb, 1.74, 3.95], { bottom: true }));
  for (const z of [3.1, 3.95]) P.push(box([xa, 1.74, z - .025], [xb, 2.66, z + .025]));
  for (let z = 3.15; z < 3.93; z += .045) P.push(line([[xm, 1.75, z], [xm, 2.65, z]], fn()));
  P.push(lathe([sx * 1.25, FAN_C[1], FAN_C[2]], [sx, 0, 0], [[0, .44], [.14, .44], [.16, .47]], { n: 32 }));
  const c = [sx * FAN_C[0], FAN_C[1], FAN_C[2]];
  P.push(blades(c, [sx, 0, 0], 7, .11, .41, { chord: 1.1, taper: 1, pitch: .28, rot: (rot || 0) * sx }));
  P.push(lathe(V.add(c, [-sx * .06, 0, 0]), [sx, 0, 0], [[0, .12], [.1, .12], [.13, .06]], { n: 20, caps: true }));
  return P;
}
function mzktGearbox() {
  const B = [];
  B.push(lathe([0, 1.01, 2.88], FZ, [[0, .12], [.04, .19], [.26, .19], [.3, .17]], { n: 22, caps: true }));
  B.push(box([-.36, .82, 3.18], [.36, 1.2, 3.8], { bottom: true }));
  for (const z of [3.34, 3.52, 3.68]) B.push(box([-.375, .81, z], [.375, 1.21, z + .03]));
  B.push(box([-.18, .95, 2.64], [.18, 1.22, 2.88], { bottom: true }));
  B.push(lathe([.28, .87, 2.9], [0, 0, -1], [[0, .08], [.05, .08]], { n: 12, caps: true }));
  B.push(box([-.28, 1.2, 3.3], [-.08, 1.26, 3.65]));
  return B;
}
function mzktTransfer() {
  const B = [];
  B.push(box([-.34, .56, .14], [.34, 1.0, .96], { bottom: true }));
  for (const z of [.34, .56, .76]) B.push(box([-.355, .55, z], [.355, 1.01, z + .03]));
  for (const [x, y, z, d] of [[0, .74, .96, 1], [0, .74, .14, -1], [.28, .87, .96, 1]]) B.push(lathe([x, y, z], [0, 0, d], [[0, .085], [.06, .085]], { n: 12, caps: true }));
  B.push(lathe([-.2, .88, .96], FZ, [[0, .1], [.26, .1], [.3, .06]], { n: 16, caps: true }));
  B.push(line([[-.2, .98, 1.22], [-.2, 1.08, 1.55], [-.16, 1.22, 1.95], [-.1, 1.32, 2.22]], fn()));
  B.push(line([[-.25, .96, 1.2], [-.3, 1.1, 1.6], [-.3, 1.2, 1.95], [-.24, 1.3, 2.25]], fn()));
  return B;
}
const MZ_SHAFTS = [[[.28, .87, 2.9], [.28, .87, .96]], [[0, .74, .96], [0, .74, 1.97]], [[0, .74, 2.53], [0, .74, 4.17]], [[0, .74, .14], [0, .74, -2.47]], [[0, .74, -3.03], [0, .74, -4.67]]];
const mzktShafts = () => MZ_SHAFTS.map(([a, b]) => { const L = V.dist(a, b); return lathe(a, V.sub(b, a), [[0, .07], [.05, .07], [.08, .045], [L - .08, .045], [L - .05, .07], [L, .07]], { n: 12, caps: true }); });
const mzktHubs = sx => AXZ.map(z => lathe([sx * .84, .74, z], [sx, 0, 0], [[0, .1], [.1, .16], [.16, .3], [.2, .36], [.56, .36], [.6, .3], [.62, .2], [.72, .2], [.74, .12]], { n: 30, caps: true }));
function telCut() {
  const M = HD.tel(), by = n => partOf(M, n);
  const CH = { frame: [], bay: [], engacc: [], axles: [], tank: [], boxes: [], outrigL: [], outrigR: [] };
  for (const pr of by('chassis').prims) CH[chassisGroup(pr)].push(pr);
  const L = { frame: 'Frame · MZKT-7930 · 8×8', bay: 'Power pack cover · grilles', engacc: 'Exhaust · air cleaner', axles: 'Axles ×4 · 1–2 steer', tank: 'Fuel tank', boxes: 'Battery · tool boxes', outrigL: 'Outrigger beams · L', outrigR: 'Outrigger beams · R' };
  const parts = Object.keys(CH).map(k => ({ name: k, label: L[k], prims: CH[k] }));
  const wl = by('wheels');
  for (const [side, nm] of [[-1, 'tyresL'], [1, 'tyresR']]) parts.push({ name: nm, label: 'Tyres ×4 · 1500×600-635 · ' + (side > 0 ? 'R' : 'L'), prims: wheelSide(AXZ, side, 0, {}), dyn: st => wheelSide(AXZ, side, st.wheel || 0, {}) });
  parts.push(...splitPart(by('jacks'), [{ name: 'jacksL', label: 'Outrigger jacks · L', test: (pr, c) => c[0] < 0 }, { name: 'jacksR', label: 'Outrigger jacks · R' }]));
  for (const n of ['cab', 'launcher', 'capL', 'capR', 'ram', 'fans']) parts.push(O(by(n)));
  parts.push(O({ name: 'engine', label: 'YaMZ-846 · V12 diesel · 500 hp', prims: yamz846() }, hidden));
  for (const [sx, nm] of [[1, 'radR'], [-1, 'radL']]) parts.push(O({ name: nm, label: 'Radiator · fan Ø 0.8 m · ' + (sx > 0 ? 'R' : 'L'), prims: mzktRadiator(sx, 0), dyn: st => mzktRadiator(sx, st.fan || 0) }, hidden));
  parts.push(O({ name: 'gearbox', label: 'Transmission · hydromechanical', prims: mzktGearbox() }, hidden));
  parts.push(O({ name: 'transfer', label: 'Transfer case · PTO pump', prims: mzktTransfer() }, hidden));
  parts.push(O({ name: 'shafts', label: 'Cardan shafts ×5', prims: mzktShafts() }, hidden));
  parts.push(O({ name: 'hubL', label: 'Wheel hubs · reduction gear · L', prims: mzktHubs(-1) }, hidden));
  parts.push(O({ name: 'hubR', label: 'Wheel hubs · reduction gear · R', prims: mzktHubs(1) }, hidden));
  return O(M, { name: 'tel_cut', parts });
}

/* ---------- Monolith-B: engine bay, shelter interior (after Anatomy · Battery) ---------- */
function shelterInside() {
  const P = [];
  for (const z of [-3.9, -3.2, -2.5, -1.8]) { P.push(box([-1.36, 1.52, z], [-.86, 3.2, z + .62])); for (let k = 1; k < 7; k++) P.push(box([-.87, 1.52 + k * .22, z + .04], [-.85, 1.54 + k * .22, z + .58], fn())); }
  for (const z of [-.6, .7]) {
    P.push(box([.62, 1.52, z], [1.36, 2.28, z + 1.0]));
    P.push(box([1.1, 2.28, z + .05], [1.34, 2.98, z + .95]));
    P.push(panel([[1.09, 2.36, z + .12], [1.09, 2.36, z + .88], [1.09, 2.9, z + .88], [1.09, 2.9, z + .12]]));
    P.push(box([.2, 1.52, z + .3], [.55, 1.95, z + .7]));
    P.push(box([.2, 1.95, z + .62], [.55, 2.45, z + .7]));
  }
  P.push(box([-.3, 1.52, -4.62], [.3, 1.6, -4.2]));
  P.push(box([-.12, 1.6, -4.7], [.12, 3.35, -4.5]));
  return P;
}
function radarCut() {
  const M = HD.radar(), by = n => partOf(M, n), parts = [];
  parts.push(...splitPart(by('chassis'), [{ name: 'bay', label: 'Power pack cover · grilles', test: (pr, c, b) => c[2] > 2.9 && c[2] < 4.2 && b.mx[1] > 1.44 }, { name: 'frame', label: 'Frame · MZKT-7930 · 8×8' }]));
  for (const [side, nm] of [[-1, 'wheelsL'], [1, 'wheelsR']]) parts.push({ name: nm, label: 'Wheels ×4 · 1500×600-635 · ' + (side > 0 ? 'R' : 'L'), prims: wheelSide(AXZ, side, 0, {}), dyn: st => wheelSide(AXZ, side, st.wheel || 0, {}) });
  for (const n of ['cab', 'body', 'mast', 'array', 'fans']) parts.push(O(by(n)));
  const eng = yamz846(); for (const sx of [-1, 1]) eng.push(...mzktRadiator(sx, 0));
  parts.push(O({ name: 'engine', label: 'YaMZ-846 · V12 · radiators ×2', prims: eng }, hidden));
  parts.push(O({ name: 'inside', label: 'Operator consoles ×2 · racks ×4', prims: shelterInside() }, hidden));
  return O(M, { name: 'radar_cut', parts });
}

/* ---------- Pantsir-S1: engine, power unit, turret split (after Anatomy · Battery) ---------- */
const PZ = { RING: [0, 2.5, -2.0], PIV: [0, .85, -.1], SR: [0, 1.35, -.72], AX: [3.9, 2.1, -1.9, -3.3], PACK_C: [1.19, .86, .1], FAN: [0, 1.06, 4.86],
  TUBES: (() => { const T = []; for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) T.push([sx * (1.0 + j * .19), .76 + i * .2]); return T; })(), TUBE_Z: [-1.5, 1.7] };
const pzTurretXf = st => X.make(R.y(st.yaw || 0), PZ.RING);
const pzPitchXf = st => X.mul(pzTurretXf(st), about(R.x(-(st.pitch || 0)), PZ.PIV));
function kamaz740() {
  const E = [], zb = 3.4, zf = 4.45, zm = (zb + zf) / 2, hz = (zf - zb) / 2;
  E.push(box([-.33, .9, zb], [.33, 1.28, zf], { bottom: true }));
  for (const sx of [-1, 1]) {
    const u = [sx * Math.SQRT1_2, Math.SQRT1_2, 0], w = [Math.SQRT1_2, -sx * Math.SQRT1_2, 0], c = [sx * .27, 1.44, zm];
    const at = h => [c[0] + u[0] * h, c[1] + u[1] * h, zm];
    E.push(obox(c, u, w, .17, .14, hz - .03));
    for (let k = 0; k < 4; k++) { const q = at(.23); q[2] = zb + .16 + k * .245; E.push(obox(q, u, w, .06, .14, .1)); }
    E.push(cyl([sx * .58, 1.42, zb + .1], [sx * .58, 1.42, zf - .1], .045, { n: 10 }));
    E.push(lathe([sx * .1, 1.62, 3.55], [sx, 0, 0], [[0, .05], [.04, .11], [.12, .12], [.16, .07], [.2, .1], [.27, .1], [.3, .05]], { n: 16, caps: true }));
  }
  E.push(box([-.09, 1.5, zb + .08], [.09, 1.7, zf - .1]));
  E.push(lathe([0, 1.14, zb], [0, 0, -1], [[0, .36], [.1, .34], [.16, .25]], { n: 26, caps: true }));
  E.push(box([-.24, .92, 2.82], [.24, 1.2, 3.25], { bottom: true }));
  for (const z of [2.95, 3.1]) E.push(box([-.25, .91, z], [.25, 1.21, z + .03]));
  E.push(lathe([0, 1.1, zf], FZ, [[0, .22], [.05, .2], [.07, .12], [.12, .12]], { n: 20, caps: true }));
  E.push(lathe([.26, 1.36, zf - .02], FZ, [[0, .08], [.14, .08]], { n: 12, caps: true }));
  E.push(box([-.56, .66, 5.0], [.56, .74, 5.1]), box([-.56, 1.4, 5.0], [.56, 1.48, 5.1]));
  for (const x of [-.56, .56]) E.push(box([x - .03, .74, 5.0], [x + .03, 1.4, 5.1]));
  for (let x = -.52; x < .53; x += .045) E.push(line([[x, .75, 5.05], [x, 1.39, 5.05]], fn()));
  E.push(lathe([0, PZ.FAN[1], 4.98], [0, 0, -1], [[0, .38], [.12, .38], [.15, .34]], { n: 30 }));
  E.push(blades([0, PZ.FAN[1], 4.9], [0, 0, -1], 7, .09, .33, { chord: 1.2, taper: 1, pitch: .28 }));
  return E;
}
function pantsirPower() {
  const P = [];
  P.push(box([-.2, 1.3, -3.7], [.75, 1.42, -.95], { bottom: true }));
  P.push(lathe([.28, 1.78, -3.6], FZ, [[0, .16], [.08, .24], [.3, .26], [.5, .2], [.9, .22], [1.15, .18], [1.3, .24], [1.36, .12]], { n: 22, caps: true }));
  P.push(lathe([.28, 1.78, -2.2], FZ, [[0, .3], [.95, .3], [1.05, .22]], { n: 24, caps: true }));
  P.push(box([.02, 1.42, -3.55], [.54, 1.52, -1.1]));
  P.push(cyl([.28, 1.98, -3.5], [.28, 2.44, -3.9], .1, { n: 10, caps: true }));
  for (const sx of [-1, 1]) {
    P.push(box([sx * .93, 1.86, -2.82], [sx * 1.05, 2.38, -1.38]));
    for (const z of [-2.45, -1.75]) { P.push(lathe([sx * 1.08, 2.12, z], [sx, 0, 0], [[0, .23], [.1, .23]], { n: 20 })); P.push(blades([sx * 1.12, 2.12, z], [sx, 0, 0], 5, .06, .2, { chord: 1.3, taper: 1, pitch: .28 })); }
  }
  for (const sx of [-1, 1]) for (const z of [.35, 1.15, 1.95]) {
    P.push(box([sx * .62, 1.32, z], [sx * 1.16, 2.38, z + .7]));
    for (let k = 1; k < 6; k++) P.push(box([sx * .6, 1.32 + k * .18, z + .04], [sx * .62, 1.34 + k * .18, z + .66], fn()));
  }
  return P;
}
function pantsirCut() {
  const M = HD.pantsir(), by = n => partOf(M, n), parts = [];
  parts.push(...splitPart(by('chassis'), [{ name: 'body', label: 'Equipment module', test: (pr, c, b) => b.mn[1] >= 1.29 && b.mx[1] > 1.42 && b.mn[0] > -1.3 && b.mx[0] < 1.3 }, { name: 'frame', label: 'Frame · KamAZ-6560 · 8×8' }]));
  const WO = { r: .62, w: .42, x: .85, lugs: 14, n: 22 };
  for (const [side, nm] of [[-1, 'wheelsL'], [1, 'wheelsR']]) parts.push({ name: nm, label: 'Wheels ×4 · 425/85 R21 · ' + (side > 0 ? 'R' : 'L'), prims: wheelSide(PZ.AX, side, 0, WO), dyn: st => wheelSide(PZ.AX, side, st.wheel || 0, WO) });
  parts.push(O(by('cab')));
  const TT = by('turret').prims;
  parts.push({ name: 'ring', label: 'Turret ring · slewing bearing', prims: [TT[0]], xf: pzTurretXf });
  parts.push({ name: 'turret', label: 'Combat module · 72V6', prims: TT.slice(1), xf: pzTurretXf });
  // guns + the pack cradles; the packs as closed banks with end frames and lugs
  const mis = by('missiles').prims, cradle = { L: [], R: [] }, pack = { L: [], R: [] };
  for (const pr of mis) { const b = bboxOf(pr), sd = b.c[0] > 0 ? 'R' : 'L', w = b.mx[0] - b.mn[0]; ((pr.t === 'hex' && w < .06) || (pr.t === 'lathe' && Math.abs(pr.d[0]) > .9) ? cradle : pack)[sd].push(pr); }
  for (const sd of ['L', 'R']) {
    const sx = sd === 'R' ? 1 : -1, c = [sx * PZ.PACK_C[0], PZ.PACK_C[1], PZ.PACK_C[2]];
    for (const z of [-1.62, 1.62]) {
      pack[sd].push(box(V.add(c, [-.31, -.21, z - .02]), V.add(c, [.33, -.19, z + .02])), box(V.add(c, [-.31, .19, z - .02]), V.add(c, [.33, .21, z + .02])));
      for (const x of [-.31, .31]) pack[sd].push(box(V.add(c, [x - .01, -.21, z - .02]), V.add(c, [x + .01, .21, z + .02])));
    }
    for (const z of [-1.25, 1.2]) for (const x of [-.16, .16]) pack[sd].push(lathe(V.add(c, [x, .21, z]), FY, [[0, .04], [.07, .04], [.07, .02]], fn({ n: 8, caps: true })));
    const gd = by('guns').dyn, cr = cradle[sd];
    parts.push({ name: 'gun' + sd, label: '2A38M · 30 mm twin · ' + sd, prims: gd({}).filter(pr => (bboxOf(pr).c[0] > 0) === (sx > 0)).concat(cr), dyn: st => gd(st).filter(pr => (bboxOf(pr).c[0] > 0) === (sx > 0)).concat(cr), xf: pzPitchXf });
    parts.push({ name: 'pack' + sd, label: '57E6 pack ×6 · closed · ' + sd, prims: pack[sd], xf: pzPitchXf });
  }
  for (const n of ['searchRadar', 'trackRadar', 'eo']) parts.push(O(by(n)));
  parts.push(O({ name: 'engine', label: 'KamAZ-740 · V8 diesel · radiator fan', prims: kamaz740() }, hidden));
  parts.push(O({ name: 'power', label: 'Power unit · cooling fans ×4 · racks', prims: pantsirPower() }, hidden));
  return O(M, { name: 'pantsir_cut', parts });
}
export const PANTSIR = O(PZ, { turretXf: pzTurretXf, pitchXf: pzPitchXf });

/* ---------- DDG-51: underwater body, machinery, shafts, VLS blocks, helo (after Anatomy · Ship) ---------- */
const DDA = HD.destroyer.A, hD = DDA.deckY;
const ZB = 77.6, ZS = -77.6, ZST = 70.6;
const hW = z => { if (z >= ZST) return 0; const u = z / ZB, ue = ZST / ZB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
const ssE = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const keelY = z => z > 52 ? -6.3 * Math.sqrt(Math.max(0, 1 - Math.pow((z - 52) / (ZST - 52), 2))) : z < -28 ? -6.3 + 5.1 * ssE(-28, -60, z) : -6.3;
const secE = z => z > 16 ? mix(4.2, 2.1, ssE(16, 64, z)) : z < -20 ? mix(4.2, 6.5, ssE(-20, -64, z)) : 4.2;
function secPt(z, th) { const b = hW(z), k = keelY(z), e = secE(z), s = Math.max(0, Math.sin(th)), c = Math.max(0, Math.cos(th)); return [b * Math.pow(s, 2 / e), k * Math.pow(c, 2 / e)]; }
/* the underwater body as outward sheets (dots only), split bow / mid / stern like the exploded view */
function underwater() {
  const out = { bow: [], hullMid: [], stern: [] }, NQ = 9;
  const Zs = [ZS]; for (let z = -76; z < 50; z += 3.2) Zs.push(z); for (let z = 50; z < ZST - .2; z += 1.6) Zs.push(z); Zs.push(ZST - .05);
  const grp = z => z > 42 ? 'bow' : z < -53 ? 'stern' : 'hullMid';
  for (let i = 0; i < Zs.length - 1; i++) {
    const za = Zs[i], zb = Zs[i + 1], g = out[grp((za + zb) / 2)];
    for (let j = 0; j < NQ; j++) {
      const t0 = j / NQ * PI / 2, t1 = (j + 1) / NQ * PI / 2;
      const a0 = secPt(za, t0), a1 = secPt(za, t1), b0 = secPt(zb, t0), b1 = secPt(zb, t1);
      if (Math.max(a1[0], b1[0]) < .08) continue;
      for (const sd of [-1, 1]) {
        const q = [[sd * a0[0], a0[1], za], [sd * a1[0], a1[1], za], [sd * b1[0], b1[1], zb], [sd * b0[0], b0[1], zb]];
        const c = avg(q); g.push(SA.plate(q, [c[0], c[1] + 2.5, 0], { ds: 1.25 }));
      }
    }
  }
  // transom below the waterline, sonar dome, skeg, bilge keels (hull lines for the wire)
  { const k = keelY(ZS), b = hW(ZS); out.stern.push(SA.plate([[-b, 0, ZS], [b, 0, ZS], [b * .25, k * .9, ZS], [-b * .25, k * .9, ZS]], [0, 0, -1], { ds: 1.25 })); }
  out.bow.push(lathe([0, -6.75, 59.5 - 9.4], FZ, [0, .1, .2, .35, .5, .65, .8, .9, 1].map(t => [t * 18.8, 2.1 * Math.sin(t * PI) + .001]), { n: 24, gen: 6, rings: [4] }));
  out.hullMid.push(hex([[-.2, -3.1, -58], [.2, -3.1, -58], [.2, -6.32, -30], [-.2, -6.32, -30], [-.2, keelY(-58) - .1, -58], [.2, keelY(-58) - .1, -58], [.2, keelY(-30) + .2, -30], [-.2, keelY(-30) + .2, -30]], { bottom: true }));
  for (const sd of [-1, 1]) { const P = []; for (let z = -24; z <= 26; z += 5) { const p = secPt(z, .62); P.push([sd * p[0], p[1], z]); } out.hullMid.push(line(P, { w: .7 })); const Q = P.map(p => [p[0] + sd * .45, p[1] - .4, p[2]]); out.hullMid.push(line(Q, { w: .5 })); }
  for (const th of [.35, .8, 1.2]) for (const sd of [-1, 1]) { const P = []; for (let z = ZS; z < ZST; z += 4) { const p = secPt(z, th); if (p[0] > .1) P.push([sd * p[0], p[1], z]); } out[grp(0)].push(line(P, fn({ w: .35, pts: false }))); }
  return out;
}
const GT = { AXIS_Y: -2.4, COUPLE: 8.6 };
function lm2500() {
  const S = [], ROT = [];
  for (const q of [[[-1.35, -1.2, -2.1], [1.35, -1.2, -2.1], [1.35, 1.45, -2.1], [-1.35, 1.45, -2.1]], [[-1.35, -1.2, -2.1], [-1.35, -1.2, -.78], [-1.35, 1.45, -.78], [-1.35, 1.45, -2.1]], [[1.35, -1.2, -2.1], [1.35, -1.2, -.78], [1.35, 1.45, -.78], [1.35, 1.45, -2.1]]]) S.push(panel(q, { ds: 1.7 }));
  S.push(lathe([0, 0, -.95], FZ, [[0, 1.02], [.08, .93], [.3, .76], [.62, .67], [.95, .64]], { n: 40 }));
  S.push(lathe([0, 0, -.5], FZ, [[0, 0], [.1, .12], [.28, .21], [.5, .25]], { n: 24 }));
  S.push(blades([0, 0, .13], FZ, 28, .26, .63, { chord: .07, taper: 1.2, pitch: .18, ds: 2.2 }));
  S.push(lathe([0, 0, 0], FZ, [[0, .67], [.25, .67], [.9, .61], [1.8, .53], [2.7, .48], [2.9, .6], [3.6, .63], [3.85, .56], [4.45, .57], [4.65, .63], [5.6, .76], [5.8, .77]], { n: 40 }));
  for (const [s, r] of [[.45, .67], [.7, .65], [.95, .62], [1.2, .6], [1.45, .57]]) S.push(lathe([0, 0, s], FZ, [[0, r + .045], [.05, r + .045]], fn({ n: 36 })));
  S.push(box([-1.15, -1.1, 5.8], [1.15, 1.25, 7.2], { bottom: true, ds: 1.2 }));
  S.push(lathe([0, 1.25, 6.5], FY, [[0, .78], [.25, .74]], { n: 28 }));
  S.push(box([-.95, -1.22, -1.0], [.95, -1.02, 7.3], { bottom: true }));
  for (const s of [1.0, 4.1, 6.4]) for (const sx of [-1, 1]) S.push(box([sx * .62 - .08, -1.02, s - .1], [sx * .62 + .08, -.45, s + .1], fn()));
  S.push(box([-.36, -.8, .6], [.36, -.46, 2.1], fn({ bottom: true })));
  ROT.push(lathe([0, 0, .2], FZ, [[0, .26], [.5, .27], [1.4, .33], [2.5, .39], [4.4, .39]], { n: 24, ds: 1.4 }));
  ROT.push(blades([0, 0, .33], FZ, 30, .27, .62, { chord: .12, taper: .75, pitch: .5 }));
  for (let i = 0; i < 6; i++) ROT.push(blades([0, 0, 4.72 + i * .17], FZ, 52, .44, .6 + i * .026, { chord: .08, taper: .9, pitch: -.45, rot: i * .2, ds: 1.4 }));
  ROT.push(lathe([0, 0, 5.8], FZ, [[0, .11], [2.4, .11], [2.45, .3], [2.55, .3], [2.6, .11], [GT.COUPLE - 5.8, .11]], { n: 14 }));
  return S.concat(ROT);
}
const GTS = [{ id: '1A', x: -.8, z: 6.2, mer: 1 }, { id: '1B', x: 3.0, z: 6.2, mer: 1 }, { id: '2A', x: -4.0, z: -13.0, mer: 2 }, { id: '2B', x: -.2, z: -13.0, mer: 2 }];
const gtXf = g => X.make(R.y(PI), [g.x, GT.AXIS_Y, g.z]);
const MRGS = [{ id: 1, x: 1.1, zf: -2.4 }, { id: 2, x: -2.1, zf: -21.6 }], MRG_L = 3.6, BULL_R = 1.78, SHAFT_Y0 = -3.6;
function mrg(m) {
  const P = [], x = m.x, z0 = m.zf - MRG_L, z1 = m.zf, zc = (z0 + z1) / 2, yb = SHAFT_Y0;
  P.push(box([x - 2.6, -5.7, z0], [x + 2.6, -3.6, z1], { bottom: true, skip: [1], ds: 1.5 }));
  P.push(box([x - 2.75, -3.7, z0 - .05], [x + 2.75, -3.5, z1 + .05]));
  for (const dz of [-.62, .12]) P.push(lathe([x, yb, zc + dz], FZ, [[0, BULL_R - .12], [0, BULL_R], [.5, BULL_R], [.5, BULL_R - .12]], { n: 64 }));
  P.push(lathe([x, yb, zc - .08], FZ, [[0, .5], [0, BULL_R - .12], [.16, BULL_R - .12], [.16, .5]], { n: 48, ds: 1.4 }));
  for (const sx of [-1, 1]) {
    const px = x + sx * (BULL_R + .38) * Math.sin(38 * DEG), py = yb + (BULL_R + .38) * Math.cos(38 * DEG);
    P.push(lathe([px, py, zc - .7], FZ, [[0, .38], [1.3, .38]], { n: 28 }));
    P.push(lathe([px, py, z1 - .7], FZ, [[0, .95], [.5, .95]], { n: 44 }));
  }
  P.push(lathe([x, yb, z0 - 1.6], FZ, [[0, .45], [.1, .72], [1.1, .72], [1.2, .45]], { n: 32, caps: true }));
  return P;
}
const PROP = { R: 2.59, hubR: .84, z: -62.5, y: -4.6, x: 4.0 };
const DD_SHAFTS = [
  { side: 1, a: [MRGS[0].x, SHAFT_Y0, MRGS[0].zf - MRG_L - 1.7], b: [PROP.x, PROP.y, PROP.z + .9] },
  { side: -1, a: [MRGS[1].x, SHAFT_Y0, MRGS[1].zf - MRG_L - 1.7], b: [-PROP.x, PROP.y, PROP.z + .9] }];
const shaftAt = (sh, z) => V.lerp(sh.a, sh.b, (z - sh.a[2]) / (sh.b[2] - sh.a[2]));
function strutLeg(a, b) {
  const d = V.norm(V.sub(b, a)), side = V.norm(V.cross(d, FZ)), t = .14, c = .55;
  const q = (p, u, v) => V.add(p, V.add(V.mul(side, u), [0, 0, v]));
  return hex([q(a, -t, -c), q(a, t, -c), q(a, t, c), q(a, -t, c), q(b, -t, -c), q(b, t, -c), q(b, t, c), q(b, -t, c)], { skip: [0, 1] });
}
function ddShafts() {
  const inP = [], outP = [];
  for (const sh of DD_SHAFTS) {
    const d = V.sub(sh.b, sh.a), L = V.len(d), zt = -41.5;
    const zCut = (L * (zt - sh.a[2]) / (sh.b[2] - sh.a[2]));
    inP.push(lathe(sh.a, d, [[0, .27], [zCut, .27]], { n: 20 }));
    outP.push(lathe(shaftAt(sh, zt), d, [[0, .27], [L - zCut, .27]], { n: 20 }));
    for (let s = 4; s < zCut - 1; s += 9.2) inP.push(lathe(V.mad(sh.a, V.norm(d), s), d, [[0, .5], [.22, .5]], { n: 24, caps: true }));
    const st = shaftAt(sh, zt);
    outP.push(lathe(V.add(st, [0, 0, 1.8]), [0, 0, -1], [[0, .58], [3.2, .52], [3.8, .36]], { n: 24 }));
    const s1 = shaftAt(sh, -50.5), s2 = shaftAt(sh, -59.6);
    outP.push(lathe(V.add(s1, [0, 0, .6]), [0, 0, -1], [[0, .44], [1.2, .44]], { n: 20 }), strutLeg(s1, [sh.side * 2.9, -.8, -50.5]));
    outP.push(lathe(V.add(s2, [0, 0, .7]), [0, 0, -1], [[0, .46], [1.4, .46]], { n: 20 }), strutLeg(s2, [sh.side * 1.8, -1.05, -59.4]), strutLeg(s2, [sh.side * 6.3, -.95, -59.8]));
    // 5-blade CRP propeller, hub + fairing cap; spade rudder behind it
    const pc = [sh.side * PROP.x, PROP.y, PROP.z];
    outP.push(blades(pc, FZ, 5, PROP.hubR * .95, PROP.R, { chord: .95, taper: 1.05, pitch: .42, rot: sh.side > 0 ? 0 : .6 }));
    outP.push(lathe(V.add(pc, [0, 0, .9]), [0, 0, -1], [[0, .55], [.2, .8], [.9, PROP.hubR], [1.8, .8], [2.3, .55], [2.65, .2], [2.7, 0]], { n: 24, gen: 6 }));
    const rz = -70.2, top = -1.15, span = 5.2;
    outP.push(hex([[sh.side * PROP.x - .25, top, rz + 1.15], [sh.side * PROP.x + .25, top, rz + 1.15], [sh.side * PROP.x + .1, top, rz - 2.3], [sh.side * PROP.x - .1, top, rz - 2.3],
      [sh.side * PROP.x - .2, top - span, rz + .95], [sh.side * PROP.x + .2, top - span, rz + .95], [sh.side * PROP.x + .08, top - span, rz - 1.9], [sh.side * PROP.x - .08, top - span, rz - 1.9]], { bottom: true }));
    outP.push(cyl([sh.side * PROP.x, top, rz], [sh.side * PROP.x, 0, rz], .2, { n: 10 }));
  }
  return { inP, outP };
}
const DD_STACK_Z = [2.2, -17.0];
function duct(a, b, w, d, o) {
  const q = (p, sx, sz) => [p[0] + sx * w / 2, p[1], p[2] + sz * d / 2], P = [];
  for (const [s0, s1] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) P.push(panel([q(a, ...s0), q(a, ...s1), q(b, ...s1), q(b, ...s0)], o));
  return P;
}
function ddTrunks() {
  const P = [];
  for (const g of GTS) {
    const zc = DD_STACK_Z[g.mer - 1], sx = g.x > (g.mer === 1 ? 1.1 : -1.3) ? 1 : -1;
    const top = [sx * 1.55, 18.6, zc + .9], bot = [g.x, GT.AXIS_Y + 1.45, g.z + 1.44];
    P.push(...duct(top, [bot[0], 10.4, bot[2] - .2], 1.7, 1.9, { ds: 2.2 }), ...duct([bot[0], 10.4, bot[2] - .2], bot, 1.7, 1.9, { ds: 2.2 }));
    const cz = g.z - 6.5, a = [g.x, GT.AXIS_Y + 1.5, cz], b = [sx * .95, 21.9, zc - 2.9];
    P.push(lathe(a, V.sub([a[0], 9.5, a[2]], a), [[0, .74], [9.5 - a[1], .74]], { n: 28, ds: 2.2 }));
    P.push(lathe([a[0], 9.5, a[2]], V.sub(b, [a[0], 9.5, a[2]]), [[0, .74], [V.dist(b, [a[0], 9.5, a[2]]), .62]], { n: 28, ds: 2.2 }));
  }
  return P;
}
const VF_Z = 38.9, VA_Z = -29.4, VDEPTH = 7.7;
const vlsModules = fwd => { const out = [], rows = fwd ? 4 : 8, zc = fwd ? VF_Z : VA_Z, mods = rows / 4; for (let m = 0; m < 4; m++) for (let r = 0; r < mods; r++) out.push([(-3 + 2 * m) * 1.05, zc + (mods === 1 ? 0 : (r ? -1.7 : 1.7))]); return out; };
function vlsBlock(fwd) {
  const P = [], y0 = hD(fwd ? VF_Z : VA_Z) + .06 - .3, y1 = y0 - VDEPTH + .3;
  for (const [xm, zm] of vlsModules(fwd)) {
    P.push(box([xm - 1.02, y1, zm - 1.68], [xm + 1.02, y0, zm + 1.68], { bottom: true, skip: [1] }));
    for (const sx of [-1, 1]) P.push(panel([[xm + sx * .19, y1, zm - 1.68], [xm + sx * .19, y1, zm + 1.68], [xm + sx * .19, y0, zm + 1.68], [xm + sx * .19, y0, zm - 1.68]], { ds: 1.6 }));
    for (const dz of [-.85, 0, .85]) for (const sx of [-1, 1]) P.push(panel([[xm + sx * .19, y1, zm + dz], [xm + sx * 1.02, y1, zm + dz], [xm + sx * 1.02, y0, zm + dz], [xm + sx * .19, y0, zm + dz]], { ds: 2.2 }));
    P.push(box([xm - 1.02, y1 - .55, zm - 1.68], [xm + 1.02, y1, zm + 1.68], fn({ bottom: true, skip: [1], ds: 1.4 })));
  }
  return P;
}
const piv = (Rm, o) => about(Rm, o);
function heloFolded() {
  const m = HD.helo(), parts = [];
  for (const p of m.parts) {
    if (p.name === 'tailrotor') { parts.push(...tps(p.xf({ trotor: .3 }), p.prims)); continue; }
    if (p.name !== 'rotor') { parts.push(...p.prims); continue; }
    const P = p.dyn({ droop: .3 }), HC = HD.helo.HUB;
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * PI / 2, u = [Math.sin(a), 0, Math.cos(a)], tgt = PI + [-.11, -.04, .04, .11][k];
      let d = tgt - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU;
      const hinge = [HC[0] + u[0] * .95, HC[1], HC[2] + u[2] * .95], Tf = piv(R.y(d), hinge), Tl = X.mul(T3([0, -.06 * k + .1, 0]), Tf);
      P.slice(k * 13, k * 13 + 13).forEach((pr, i) => parts.push(i < 8 ? tp(Tl, pr) : pr));
    }
    parts.push(...P.slice(52));
  }
  return parts;
}
const HELO_AT = [-3.7, hD(-40.4), -40.4];
function ddClassify(pn, x, y, z) {
  switch (pn) {
    case 'hull': case 'rails': return z > 42 ? 'bow' : z < -53 ? 'stern' : 'hullMid';
    case 'arms': return z > 42 ? 'bow' : z < -53 ? 'stern' : y > 9.6 ? 'stacks' : 'hullMid';
    case 'super': return z < -33.8 ? 'hangar' : z < 1.5 ? 'stacks' : 'superF';
    case 'spy': return 'superF';
    case 'stacks': case 'decoys': return 'stacks';
    case 'deck': return 'stern';
    case 'boats': return x > 0 ? 'boatsS' : 'boatsP';
    default: return pn;
  }
}
function destroyerCut() {
  const M = HD.destroyer(), groups = {}, keep = [];
  const G = n => (groups[n] || (groups[n] = []));
  for (const p of M.parts) {
    if (['sps', 'gun', 'vlsF', 'vlsA', 'ciwsF', 'ciwsA', 'mast', 'hangar'].includes(p.name)) { keep.push(p); continue; }
    for (const pr of p.prims) { const c = bboxOf(pr).c; G(ddClassify(p.name, c[0], c[1], c[2])).push(pr); }
  }
  const U = underwater();
  for (const k of Object.keys(U)) G(k).push(...U[k]);
  const L = { hullMid: 'Hull · midbody · 155 m', bow: 'Bow · AN/SQS-53C sonar dome', stern: 'Stern · flight deck', superF: 'Deckhouse · AN/SPY-1D(V) ×4', stacks: 'Uptakes ×2 · midships deckhouse', hangar: 'Hangar ×2 · aft deckhouse', boatsS: '7 m RHIB · davit · stbd', boatsP: '7 m RHIB · davit · port' };
  const parts = Object.keys(L).filter(k => groups[k]).map(k => ({ name: k, label: L[k], prims: groups[k] }));
  for (const p of keep) parts.push(O(p, p.name === 'hangar' ? { name: 'hdoor', label: 'Hangar doors ×2' } : {}));
  let mach = [];
  for (const m of MRGS) mach = mach.concat(mrg(m));
  const gt = lm2500(); for (const g of GTS) mach = mach.concat(tps(gtXf(g), gt));
  parts.push(O({ name: 'mach', label: 'LM2500 ×4 · reduction gears ×2', prims: mach }, hidden));
  parts.push(O({ name: 'trunks', label: 'Intake trunks · uptakes', prims: ddTrunks() }, hidden));
  const sh = ddShafts();
  parts.push(O({ name: 'shaftIn', label: 'Shaft lines · thrust bearings', prims: sh.inP }, hidden));
  parts.push({ name: 'props', label: 'Shafts ×2 · 5-blade CRP propellers · rudders', prims: sh.outP });
  parts.push(O({ name: 'vlsBF', label: 'Mk 41 modules · forward · 4', prims: vlsBlock(true) }, hidden));
  parts.push(O({ name: 'vlsBA', label: 'Mk 41 modules · aft · 8', prims: vlsBlock(false) }, hidden));
  parts.push(O({ name: 'helo', label: 'MH-60R Seahawk · blades folded', prims: tps(T3(HELO_AT), heloFolded()) }, hidden));
  return O(M, { name: 'destroyer_cut', parts });
}
/* VLS cell top centres (ship frame) for the X-ray: canisters, 0..31 fwd, 32..95 aft */
export const DDG = { VF_Z, VA_Z, VDEPTH, CAN, cell: i => DDA.vls(i), HELO_AT, GTS, MRGS, PROP };

/* ---------- generic cutaways: left / right (and quadrant) splits of the HD sea / air models ---------- */
const sideSplit = (part, base, label) => splitPart(part, [{ name: base + 'L', label: label + ' · L', test: (pr, c) => c[0] < -.02 }, { name: base + 'R', label: label + ' · R', test: (pr, c) => c[0] > .02 }, { name: base + 'C', label: label }]);
function cutBySides(M, name, spec) {
  const parts = [];
  for (const p of M.parts) {
    const s = spec[p.name];
    if (!s) { parts.push(O(p)); continue; }
    parts.push(...(typeof s === 'function' ? s(p) : sideSplit(p, p.name, s)));
  }
  return O(M, { name, parts });
}
/* split by primitive index: every `per` consecutive prims are one piece (HD fins / wings: panel + edge line) */
function indexSplit(p, names, labels, per) {
  const pick = (L, k) => L.filter((pr, i) => Math.floor(i / per) === k);
  return names.map((nm, k) => {
    const q = { name: nm, label: labels[k] };
    if (p.xf) q.xf = p.xf; if (p.show) q.show = p.show;
    if (p.dyn) { const d = p.dyn; q.dyn = st => pick(d(st), k); q.prims = q.dyn({}); } else q.prims = pick(p.prims, k);
    return q;
  });
}
const quadSplit = (p, base, label) => indexSplit(p, [1, 2, 3, 4].map(k => base + k), [1, 2, 3, 4].map(k => label + ' · ' + k), 2);
const heloCut = () => cutBySides(HD.helo(), 'helo_cut', { pylons: 'Weapon pylons', gear: p => splitPart(p, [{ name: 'gearL', label: 'Main gear · L', test: (pr, c) => c[0] < -.3 && c[2] > 0 }, { name: 'gearR', label: 'Main gear · R', test: (pr, c) => c[0] > .3 && c[2] > 0 }, { name: 'gearT', label: 'Tail wheel' }]) });
const fighterCut = () => cutBySides(HD.fighter(), 'fighter_cut', { wings: 'Wing', tails: 'Vertical tail', stabs: 'Stabilator', intakes: 'Caret intake · F414 fan', nozzles: 'F414-GE-400 nozzle', pylons: 'Pylons', lex: 'Leading-edge extension' });
const droneCut = () => cutBySides(HD.drone(), 'drone_cut', { wing: 'Wing panel' });
const oniksCut = () => cutBySides(HD.oniks(), 'oniks_cut', { wings: p => indexSplit(p, ['wingL', 'wingR'], ['Wing · folding · L', 'Wing · folding · R'], 2), fins: p => quadSplit(p, 'fin', 'Tail fin · folding') });
const sm6Cut = () => cutBySides(HD.sm6(), 'sm6_cut', { fins: p => quadSplit(p, 'fin', 'Control fin'), mk72: p => splitPart(p, [{ name: 'mk72fins', label: 'Mk 72 fins ×4', test: pr => pr.t === 'panel' || pr.t === 'line' }, { name: 'mk72', label: 'Mk 72 booster · 4 nozzles' }]) });

/* ================================================================ skins, foils (shared by the aircraft and the boats)
   hd_sea_air's skin lookups are private there; these are the same (u: section index, v: point index round it). */
function skAt(k, u, v) {
  const i = Math.max(0, Math.min(k.ns - 2, Math.floor(u))), fu = Math.max(0, Math.min(1, u - i));
  let j, j2, fv;
  if (k.open) { const vv = Math.max(0, Math.min(k.N - 1, v)); j = Math.min(k.N - 2, Math.floor(vv)); fv = vv - j; j2 = j + 1; }
  else { const vv = ((v % k.N) + k.N) % k.N; j = Math.floor(vv) % k.N; fv = vv - Math.floor(vv); j2 = (j + 1) % k.N; }
  return V.lerp(V.lerp(k.S[i][j], k.S[i][j2], fv), V.lerp(k.S[i + 1][j], k.S[i + 1][j2], fv), fu);
}
function skN(k, u, v) {
  const e = .08, du = V.sub(skAt(k, Math.min(k.ns - 1, u + e), v), skAt(k, Math.max(0, u - e), v));
  const dv = V.sub(skAt(k, u, v + e), skAt(k, u, v - e)), p = skAt(k, u, v);
  const i = Math.max(0, Math.min(k.ns - 2, Math.floor(u))), c = V.lerp(k.C[i], k.C[i + 1], Math.max(0, Math.min(1, u - i)));
  let n = V.norm(V.cross(dv, du));
  if (V.dot(n, V.sub(p, c)) < 0) n = V.mul(n, -1);
  return n;
}
/* facing-aware outline (windows, doors, panels) on a skin through 4 (u, v) corners */
function skQuad(k, uv, o) {
  const n = V.norm(uv.reduce((a, [u, v]) => V.add(a, skN(k, u, v)), [0, 0, 0]));
  return SA.fquad(uv.map(([u, v]) => V.mad(skAt(k, u, v), skN(k, u, v), .015)), n, o);
}
/* thin slab from a planar quad (wings, fins, planes): both faces sampled, edges in wire */
function slab2(q, th, o) {
  const n = V.norm(V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]))), t = Array.isArray(th) ? th : [th, th, th, th];
  return hex([...q.map((p, i) => V.mad(p, n, -t[i] / 2)), ...q.map((p, i) => V.mad(p, n, t[i] / 2))], O({ skip: [2, 3, 4, 5], bottom: true }, o));
}
/* NACA 00xx thickness form normalised to 1 at its thickest (u = 0 leading edge .. 1 trailing edge) */
const naca = u => { u = sat(u); return Math.max(0, 2.969 * Math.sqrt(u) - 1.26 * u - 3.516 * u * u + 2.843 * u * u * u - 1.036 * u * u * u * u); };
/* horizontal foil outline at height y (sails seen from above): N points, leading edge zl, trailing edge zt, half width w */
function foilSec(y, zl, zt, w, N) {
  const out = [];
  for (let j = 0; j < N; j++) {
    const th = j / N * TAU, u = (1 - Math.cos(th)) / 2, s = Math.sin(th) >= 0 ? 1 : -1;
    out.push([s * w * naca(u), y, zl + (zt - zl) * u]);
  }
  return out;
}
/* flat cap over a closed horizontal foil section (sail tops): dots only, facing up */
function foilCap(S, o) {
  const P = [], N = S.length;
  // point j (one side) pairs with N - j (the other); quads between neighbouring pairs, leading to trailing edge
  for (let j = 0; j < N / 2; j++) P.push(SA.plate([S[j], S[j + 1], S[(N - j - 1) % N], S[(N - j) % N]], [0, 1, 0], o));
  return P;
}
/* a surface of revolution along +Z sampled from a radius function r(z), z0..z1, n stations */
function revZ(ax, rf, z0, z1, n, o, zs) {
  const st = [], Z = zs || Array.from({ length: n + 1 }, (_, i) => z0 + (z1 - z0) * i / n);
  for (const z of Z) st.push([z - z0, Math.max(.001, rf(z))]);
  return lathe([0, ax, z0], FZ, st, o);
}

/* ================================================================ E-2D Advanced Hawkeye (carrier AEW)
   17.60 m long, 24.56 m span (8.94 m folded), 5.58 m high on its gear. AN/APY-9 radar in a Ø 7.32 m rotodome on
   a pylon over the wing (turns ~6 rpm), two T56-A-427A turboprops with 8-blade NP2000 propellers (Ø 4.11 m), four
   vertical tails on a dihedral tailplane, outer wings that fold back along the fuselage (Sto-Wing).
   Origin on the fuselage axis at mid-length, nose +Z, gear up (the axis stands 2.1 m over the deck on the gear).
   state: dome (rad), prop (rad), fold (0 spread .. 1 folded). */
const E2 = { DOME_C: [0, 3.1, -2.1], DOME_R: 3.66, DOME_T: .38, NAC_X: 3.72, NAC_Y: .45, PROP_Z: 4.34, PROP_R: 2.055, FOLD_X: 4.45, FOLD_Z: -.55, TIP_X: 12.28, GEAR_H: 2.1 };
const e2LE = x => 1.7 - (Math.abs(x) - 1.1) * .115, e2TE = x => -1.9 + (Math.abs(x) - 1.1) * .05;
const e2Y = x => 1.12 + (Math.abs(x) - 1.1) * .04, e2TH = x => .5 - (Math.abs(x) - 1.1) * .025;
/* the outer panel's fold: about its span first (leading edge down), then swung aft about the hinge */
const e2FoldXf = (sx, f) => about(R.mul(R.y(sx * f * 1.62), R.x(f * PI / 2)), [sx * E2.FOLD_X, e2Y(E2.FOLD_X), E2.FOLD_Z]);
const e2Dome = rho => Math.max(.035, E2.DOME_T * Math.pow(Math.max(0, 1 - (rho / E2.DOME_R) ** 2), .72));
function e2WingPanel(sx, x0, x1, P) {
  const S = p => [sx * p[0], p[1], p[2]];
  let q = [[x0, e2Y(x0), e2LE(x0)], [x1, e2Y(x1), e2LE(x1)], [x1, e2Y(x1), e2TE(x1)], [x0, e2Y(x0), e2TE(x0)]].map(S);
  let th = [e2TH(x0), e2TH(x1), e2TH(x1) * .45, e2TH(x0) * .45];
  if (V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]))[1] < 0) { q = [q[0], q[3], q[2], q[1]]; th = [th[0], th[3], th[2], th[1]]; }
  P.push(slab2(q, th, { bottom: false }));
  // hinge lines on the upper skin: flaps / ailerons at 74 % chord, the front spar at 18 %
  const top = (x, f) => S([x, e2Y(x) + mix(e2TH(x), e2TH(x) * .45, f) / 2 + .012, mix(e2LE(x), e2TE(x), f)]);
  P.push(line([top(x0 + .08, .74), top(x1 - .08, .74)], fn({ w: .45, pts: false })));
  P.push(line([top(x0 + .08, .18), top(x1 - .08, .18)], fn({ w: .3, pts: false })));
  // leading edge (the slab's edge reads as a hairline; this keeps it bright)
  P.push(line([S([x0, e2Y(x0), e2LE(x0) + .02]), S([x1, e2Y(x1), e2LE(x1) + .02])], { w: .7, pts: false }));
}
const E2_GEO = memo(() => {
  const N = 16, FU = [], WG = [], OL = [], OR = [], NL = [], NR = [], PY = [], DM = [], TL = [], HK = [];
  // fuselage: z, half width, bottom, top, exponent
  const ST = [[8.8, .28, -.5, -.08, 2], [8.62, .6, -.76, .28, 2.1], [8.22, .86, -.95, .6, 2.3], [7.5, 1.03, -1.07, .9, 2.5], [6.45, 1.13, -1.14, 1.12, 2.6],
    [5.3, 1.17, -1.18, 1.22, 2.8], [3.2, 1.18, -1.2, 1.22, 2.9], [.4, 1.17, -1.2, 1.22, 2.9], [-1.9, 1.14, -1.12, 1.2, 2.8], [-3.6, 1.02, -.86, 1.17, 2.6],
    [-5.2, .84, -.46, 1.12, 2.4], [-6.6, .62, -.02, 1.07, 2.2], [-7.8, .42, .34, 1.02, 2], [-8.8, .2, .62, .94, 2]];
  const K = SA.skin(ST.map(q => SA.sec(q[0], q[1], q[2], q[3], q[4], N)));
  FU.push(...SA.loft(K, { lines: [0, 2, 4, 6, 8, 10, 12, 14], fineJ: [2, 6, 10, 14], rings: [3, 5, 8, 11], al: .85, ral: .4 }));
  // flight deck glazing: split windscreen, quarter panes, side windows; the mission crew's small windows
  FU.push(skQuad(K, [[3.25, -.55], [3.25, .55], [4.05, .6], [4.05, -.6]], { al: .8 }));
  for (const m of [1, -1]) {
    const vv = v => m > 0 ? v : N - v;
    FU.push(skQuad(K, [[3.3, vv(.75)], [3.3, vv(2.3)], [4.1, vv(2.5)], [4.1, vv(.8)]], { al: .8 }));
    FU.push(skQuad(K, [[4.25, vv(2.2)], [4.25, vv(3.5)], [5.05, vv(3.5)], [5.05, vv(2.3)]], { al: .6 }));
    for (const u of [6.1, 6.9]) FU.push(skQuad(K, [[u, vv(3.3)], [u, vv(3.8)], [u + .35, vv(3.8)], [u + .35, vv(3.3)]], fn({ al: .45 })));
    FU.push(skQuad(K, [[4.6, vv(4.4)], [4.6, vv(6.4)], [5.4, vv(6.4)], [5.4, vv(4.4)]], fn({ al: .3 })));            // crew door / hatch
    FU.push(box([m * .06, 1.2, 4.6 - (m > 0 ? 0 : 3.4)], [m * .12, 1.52, 4.1 - (m > 0 ? 0 : 3.4)], fn()));           // blade antennas
  }
  FU.push(skQuad(K, [[3.0, 7.4], [3.0, 8.6], [4.6, 8.6], [4.6, 7.4]], fn({ al: .4 })));                              // nose gear doors
  FU.push(skQuad(K, [[7.2, 7.2], [7.2, 8.8], [8.4, 8.8], [8.4, 7.2]], fn({ al: .3 })));
  for (const z of [1.6, -3.4]) FU.push(box([-.05, -1.46, z - .35], [.05, -1.18, z]));                             // ventral blades
  // wing centre section across the fuselage top, inner panels to the fold, nacelle junctions
  WG.push(slab2([[-1.1, e2Y(1.1), e2LE(1.1)], [1.1, e2Y(1.1), e2LE(1.1)], [1.1, e2Y(1.1), e2TE(1.1)], [-1.1, e2Y(1.1), e2TE(1.1)]], [e2TH(1.1), e2TH(1.1), e2TH(1.1) * .45, e2TH(1.1) * .45], { bottom: false }));
  for (const sx of [-1, 1]) {
    e2WingPanel(sx, 1.1, E2.FOLD_X, WG);
    // fold joint: hinge fairing on the upper skin
    WG.push(box([sx * E2.FOLD_X - .06, e2Y(E2.FOLD_X) + .1, e2TE(E2.FOLD_X) + .2], [sx * E2.FOLD_X + .06, e2Y(E2.FOLD_X) + .24, e2LE(E2.FOLD_X) - .3], fn()));
    e2WingPanel(sx, E2.FOLD_X, E2.TIP_X, sx > 0 ? OR : OL);
    // tip: rounded cap, navigation light
    const O2 = sx > 0 ? OR : OL, xt = E2.TIP_X;
    O2.push(lathe([sx * xt, e2Y(xt), e2TE(xt)], FZ, [[0, .04], [.2, e2TH(xt) * .45], [e2LE(xt) - e2TE(xt) - .1, e2TH(xt) * .5], [e2LE(xt) - e2TE(xt), .04]], { n: 8, gen: 2, rings: [1] }));
    O2.push(line([[sx * (xt - .2), e2Y(xt), e2LE(xt) - .2], [sx * (xt + .05), e2Y(xt), e2LE(xt) - .4]], fn({ w: .5 })));
  }
  // nacelles: skins under the wing at ±3.72 m, chin intakes, exhaust stubs, main gear doors
  const NS = [[4.1, .36, .08, .82, 2], [3.75, .48, -.1, .98, 2.2], [3.05, .6, -.5, 1.16, 2.4], [1.6, .64, -.8, 1.22, 2.7], [-.4, .62, -.86, 1.2, 2.7],
    [-2.4, .54, -.68, 1.14, 2.5], [-3.9, .34, -.2, 1.04, 2.2], [-4.9, .12, .36, .92, 2]];
  for (const sx of [-1, 1]) {
    const P = sx > 0 ? NR : NL, xc = sx * E2.NAC_X;
    const KN = SA.skin(NS.map(q => SA.sec(q[0], q[1], q[2], q[3], q[4], 12, xc)));
    P.push(...SA.loft(KN, { lines: [0, 3, 6, 9], rings: [1, 3, 5], al: .8, ral: .4 }));
    P.push(hex([[xc - .26, -.5, 3.3], [xc + .26, -.5, 3.3], [xc + .26, -.5, 3.95], [xc - .26, -.5, 3.95], [xc - .2, -.2, 3.3], [xc + .2, -.2, 3.3], [xc + .2, -.2, 3.95], [xc - .2, -.2, 3.95]], { bottom: true }));
    P.push(ringW([xc, -.35, 3.96], FZ, .19, fn({ n: 12 })));
    P.push(cyl([xc + sx * .5, .55, -1.2], [xc + sx * .74, .5, -2.1], .13, { n: 10, gen: 3 }));                           // exhaust
    P.push(ringW([xc + sx * .74, .5, -2.1], V.norm([sx * .24, -.05, -.9]), .15, fn({ n: 10 })));
    for (const dx of [-.22, .22]) P.push(line([[xc + dx, -.86, 1.9], [xc + dx, -.88, -1.9]], fn({ w: .45, pts: false })));
    P.push(line([[xc - .22, -.86, 1.9], [xc + .22, -.86, 1.9]], fn({ w: .45, pts: false })));
  }
  // rotodome (dome-local: centre at the origin): an airfoil section turned about Y, rim band, the strongback
  // across the middle between the two radar windows (it shows the dome turning), IFF edge fairing
  const rh = [0, .5, 1.0, 1.5, 2.0, 2.45, 2.85, 3.18, 3.42, 3.58, 3.66];
  const dst = [];
  for (const r of rh) dst.push([E2.DOME_T - e2Dome(r), r]);
  for (let i = rh.length - 1; i >= 0; i--) dst.push([E2.DOME_T + e2Dome(rh[i]), rh[i]]);
  DM.push(lathe([0, -E2.DOME_T, 0], FY, dst, { n: 56, gen: 14, rings: [6, 9, 10, 11, 12, 15] }));
  for (const zs of [-.46, .46]) for (const up of [1, -1]) {
    const pts = [];
    for (let x = -3.5; x <= 3.501; x += .25) { const rho = Math.hypot(x, zs); if (rho < E2.DOME_R - .05) pts.push([x, up * (e2Dome(rho) + .012), zs]); }
    DM.push(line(pts, { w: .75 }));
  }
  DM.push(hex([[3.3, -.06, -.5], [3.66, -.03, -.5], [3.66, -.03, .5], [3.3, -.06, .5], [3.3, .06, -.5], [3.66, .03, -.5], [3.66, .03, .5], [3.3, .06, .5]], fn()));
  DM.push(lathe([0, -E2.DOME_T - .08, 0], FY, [[0, .55], [.1, .5]], fn({ n: 16, gen: 0, rings: [0, 1] })));        // turntable
  // pylon: a faired strut from the fuselage top to the dome
  const dc = E2.DOME_C, yb = dc[1] - E2.DOME_T + .02;
  PY.push(hex([[-.24, 1.1, -3.6], [.24, 1.1, -3.6], [.24, 1.1, -.7], [-.24, 1.1, -.7], [-.18, yb, dc[2] - .8], [.18, yb, dc[2] - .8], [.18, yb, dc[2] + .8], [-.18, yb, dc[2] + .8]]));
  PY.push(line([[0, 1.14, -.62], [0, yb, dc[2] + .88]], { w: .8, pts: false }));
  PY.push(line([[0, 1.14, -3.68], [0, yb, dc[2] - .88]], { w: .6, pts: false }));
  // tailplane with dihedral, four fins (two at the tips), rudder hinges
  const tY = x => .98 + Math.abs(x) * .19, tLE = x => -6.35 - Math.abs(x) * .12, tTE = -8.45;
  for (const sx of [-1, 1]) {
    const S = p => [sx * p[0], p[1], p[2]];
    let q = [[.3, tY(.3), tLE(.3)], [4.0, tY(4.0), tLE(4.0)], [4.0, tY(4.0), tTE], [.3, tY(.3), tTE]].map(S);
    if (V.cross(V.sub(q[1], q[0]), V.sub(q[3], q[0]))[1] < 0) q = [q[0], q[3], q[2], q[1]];
    TL.push(slab2(q, [.18, .1, .06, .1], { bottom: false }));
    TL.push(line([S([.4, tY(.4) + .06, -7.8]), S([3.9, tY(3.9) + .05, -7.9])], fn({ w: .4, pts: false })));
    for (const xf of [1.55, 3.95]) {
      const x = sx * xf, y0 = tY(xf) - .5, y1 = 3.42;
      TL.push(slab2([[x, y0, -6.55], [x, y1, -7.6], [x, y1, -8.62], [x, y0, -8.6]], [.16, .07, .05, .1]));
      TL.push(line([[x + sx * .05, y0 + .5, -7.95], [x + sx * .04, y1 - .1, -8.05]], fn({ w: .4, pts: false })));
      TL.push(lathe([x, y1, -8.1], FY, [[0, .04], [.12, .01]], fn({ n: 6, gen: 0, rings: [0] })));
    }
  }
  // arresting hook under the tail, its fairing; catapult launch bar on the nose gear door
  HK.push(line([[0, .52, -6.8], [0, .3, -8.2], [0, .2, -8.95]], { w: .9 }));
  HK.push(box([-.07, .14, -9.05], [.07, .26, -8.85]));
  HK.push(box([-.18, .5, -7.0], [.18, .62, -6.5], fn()));
  HK.push(line([[0, -1.24, 4.5], [0, -1.28, 3.3]], fn({ w: .6 })));
  return { FU, WG, OL, OR, NL, NR, PY, DM, TL, HK, K };
});
/* the propellers (dyn: turn with st.prop): 8 blades, spinner, de-ice boot line */
function e2Prop(sx, st) {
  const c = [sx * E2.NAC_X, E2.NAC_Y, E2.PROP_Z], P = [];
  P.push(blades(c, FZ, 8, .36, E2.PROP_R, { rot: (st.prop || 0) + sx * .2, chord: .62, taper: .55, pitch: .32, edge: .85 }));
  P.push(lathe([c[0], c[1], 4.1], FZ, [[0, .37], [.3, .33], [.56, .22], [.72, .08], [.78, 0]], { n: 18, gen: 4, rings: [0, 1] }));
  P.push(ringW(c, FZ, .38, fn({ n: 16, al: .6 })));
  return P;
}
function aew() {
  const g = E2_GEO(), fold = st => sat(st.fold || 0);
  const pl = st => e2Prop(-1, st), pr = st => e2Prop(1, st);
  return {
    name: 'aew', L: 17.6, DOME_C: E2.DOME_C.slice(), NAC: [[-E2.NAC_X, E2.NAC_Y, E2.PROP_Z], [E2.NAC_X, E2.NAC_Y, E2.PROP_Z]], GEAR_H: E2.GEAR_H,
    parts: [
      { name: 'fuselage', label: 'E-2D Advanced Hawkeye · crew 5', prims: g.FU },
      { name: 'wing', label: 'Wing centre section', prims: g.WG },
      { name: 'outerL', label: 'Outer wing · folds · L', prims: g.OL, xf: st => e2FoldXf(-1, fold(st)) },
      { name: 'outerR', label: 'Outer wing · folds · R', prims: g.OR, xf: st => e2FoldXf(1, fold(st)) },
      { name: 'nacelleL', label: 'T56-A-427A nacelle · L', prims: g.NL },
      { name: 'nacelleR', label: 'T56-A-427A nacelle · R', prims: g.NR },
      { name: 'propL', label: 'NP2000 propeller · 8 blades · L', prims: pl({}), dyn: pl },
      { name: 'propR', label: 'NP2000 propeller · 8 blades · R', prims: pr({}), dyn: pr },
      { name: 'pylon', label: 'Rotodome pylon', prims: g.PY },
      { name: 'dome', label: 'Rotodome · AN/APY-9 · Ø 7.32 m', prims: g.DM, xf: st => X.make(R.y(st.dome || 0), E2.DOME_C) },
      { name: 'tail', label: 'Tailplane · four fins', prims: g.TL },
      { name: 'hook', label: 'Arresting hook', prims: g.HK },
    ],
  };
}
/* cutaway: + the APY-9 array in the dome (turns with it), the T56 cores, the crew stations */
function aewCut() {
  const M = aew(), dc = E2.DOME_C;
  const AN = [];
  // UHF electronically scanned array standing on edge across the dome, IFF array on its back face
  AN.push(box([-3.2, -.24, -.05], [3.2, .24, .05]));
  for (let k = 0; k <= 18; k++) { const x = -3.1 + k * 6.2 / 18; AN.push(line([[x, -.22, .06], [x, .22, .06]], fn({ w: .45 }))); }
  AN.push(box([-2.6, -.12, -.12], [2.6, .12, -.05], fn()));
  AN.push(cyl([0, -.34, 0], [0, -.24, 0], .3, { n: 14, gen: 0, caps: true }));
  const EN = [];
  for (const sx of [-1, 1]) {
    const xc = sx * E2.NAC_X, y = E2.NAC_Y + .05;
    EN.push(lathe([xc, y, -2.0], FZ, [[0, .18], [.3, .3], [1.7, .34], [2.5, .3], [3.4, .34], [4.3, .3], [5.3, .2]], { n: 16, gen: 6, rings: [1, 3, 5] }));        // T56 core
    EN.push(box([xc - .32, y - .35, 3.3], [xc + .32, y + .35, 3.9]));                                           // reduction gearbox
    EN.push(cyl([xc, y, 3.9], [xc, E2.NAC_Y, 4.12], .12, { n: 10, gen: 0 }));
  }
  const CB = [];
  CB.push(box([-1.0, -.62, 5.2], [1.0, -.54, 7.2]));                                                           // flight deck floor
  for (const sx of [-1, 1]) { CB.push(box([sx * .7 - .25, -.54, 5.6], [sx * .7 + .25, .35, 6.1])); CB.push(box([sx * .7 - .3, .1, 6.6], [sx * .7 + .3, .55, 7.1], fn())); }
  CB.push(box([-1.05, -.72, -2.8], [1.05, -.64, 4.6]));                                                       // cabin floor
  for (const z of [-.6, .6, 1.8]) { CB.push(box([.25, -.64, z - .5], [1.0, .75, z + .45])); CB.push(box([-.35, -.64, z - .25], [.1, .1, z + .2], fn())); }
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'antenna', label: 'AN/APY-9 · UHF electronically scanned array', prims: AN, xf: st => X.make(R.y(st.dome || 0), dc) }, hidden));
  parts.push(O({ name: 'engines', label: 'T56-A-427A turboprops ×2 · 5 100 shp', prims: EN }, hidden));
  parts.push(O({ name: 'cabin', label: 'Flight deck · mission crew stations ×3', prims: CB }, hidden));
  return O(M, { name: 'aew_cut', parts });
}

/* ================================================================ SSN Virginia class · Block III
   114.9 m, Ø 10.4 m, 7 800 t submerged. Sail with a leading-edge fillet and non-hull-penetrating masts (two
   photonics masts instead of periscopes), Large Aperture Bow, retractable bow planes, two Virginia Payload Tubes
   (Ø 2.2 m, six cells each) forward of the sail, three wide-aperture flank arrays a side, cruciform stern with
   end-plated stern planes, pump-jet propulsor. Origin midships on the surfaced waterline (hull axis 4.1 m under it),
   bow +Z. state: mast (0 housed .. 1 raised), vptA / vptB (hatch open 0..1), prop (rad). */
const VA = { R: 5.2, AX: -4.1, ZB: 57.45, ZBOW: 44, ZAFT: -18, ZDUCT: [-55.2, -50.9], SAIL: [32.6, 22.6, 1.3], SAIL_TOP: 7.9, VPT_Z: [46.2, 42.6], VPT_R: 1.2, CELL_R: .62, MAST_UP: 4.6 };
function vaR(z) {
  if (z >= VA.ZBOW) { const u = Math.min(1, (z - VA.ZBOW) / (VA.ZB - VA.ZBOW)); return VA.R * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2))); }
  if (z >= VA.ZAFT) return VA.R;
  const u = Math.min(1, (VA.ZAFT - z) / 34); return VA.R - (VA.R - 1.3) * Math.pow(u, 1.6);
}
const vaTop = z => VA.AX + vaR(z);
/* VPT cell tops (ship frame), 0..5 the forward tube, 6..11 the after one */
const vaCell = i => { const t = i < 6 ? 0 : 1, a = (i % 6) / 6 * TAU + PI / 6, z = VA.VPT_Z[t]; return [Math.sin(a) * VA.CELL_R, vaTop(z) - .35, z + Math.cos(a) * VA.CELL_R]; };
/* masts on the sail top: x, z, radius, height raised, head */
const VA_MASTS = [[.42, 30.3, .26, 4.6, 'eo'], [-.42, 30.3, .26, 4.6, 'eo'], [0, 28.4, .3, 4.2, 'rdr'], [.45, 26.4, .15, 4.4, 'whip'], [-.45, 26.4, .15, 4.4, 'whip'], [0, 24.3, .28, 3.4, 'snort']];
const VA_GEO = memo(() => {
  const BW = [], HL = [], SN = [], SL = [], BP = [], SP = [], AR = [], PU = [];
  const lat = { n: 56, gen: 16 };
  // hull: bow (Large Aperture Bow), parallel midbody, tapering stern to the propulsor hub
  BW.push(revZ(VA.AX, vaR, VA.ZBOW, VA.ZB, 0, O(lat, { rings: [0, 3, 6, 8, 10] }), [44, 46, 48, 50, 51.5, 53, 54.3, 55.4, 56.2, 56.8, 57.2, 57.45]));
  for (const z of [48.5, 53.5]) BW.push(ringW([0, VA.AX, z], FZ, vaR(z) + .02, fn({ n: 40, al: .5 })));      // LAB window seams
  HL.push(revZ(VA.AX, vaR, VA.ZAFT, VA.ZBOW, 0, O(lat, { rings: [0, 2, 4, 6] }), [-18, -8, 2, 12, 22, 33, 44]));
  SN.push(revZ(VA.AX, vaR, -52, VA.ZAFT, 0, O(lat, { rings: [0, 3, 6, 9] }), [-52, -50, -48, -45.5, -43, -40, -36.5, -32.5, -28, -23, -18]));
  // deck: escape trunks, the lock-out trunk, the weapons shipping hatch (outlines on the hull top)
  for (const [z, r] of [[12.5, .55], [-26.5, .55], [36.8, .5]]) HL.push(circle([0, vaTop(z) + .03, z], FY, r, 18, fn({ w: .6, pts: false })));
  HL.push(line([[0, vaTop(0) + .02, 20.5], [0, vaTop(0) + .02, -14]], fn({ w: .3, pts: false })));
  // sail: foil sections from inside the hull to the top; the fillet swells the base forward
  const [zl, zt, w] = VA.SAIL, SS = [[.9, zl + 3.6, zt - .8, w + .32], [1.9, zl + 1.6, zt - .5, w + .12], [3.0, zl + .5, zt - .2, w + .03], [5.5, zl + .1, zt - .05, w], [VA.SAIL_TOP, zl, zt, w]];
  const KS = SA.skin(SS.map(q => foilSec(q[0], q[1], q[2], q[3], 20)));
  SL.push(...SA.loft(KS, { lines: [0, 3, 5, 7, 10, 13, 15, 17], fineJ: [3, 7, 13, 17], rings: [1, 4], al: .9, ral: .55 }));
  const top = foilSec(VA.SAIL_TOP, zl, zt, w, 20);
  SL.push(...foilCap(top));
  for (const [x, z, r] of VA_MASTS) SL.push(circle([x, VA.SAIL_TOP + .02, z], FY, r + .06, 12, fn({ w: .55, pts: false })));
  SL.push(SA.fquad([[-.5, VA.SAIL_TOP + .01, zl - .3], [.5, VA.SAIL_TOP + .01, zl - .3], [.5, VA.SAIL_TOP + .01, zl - 1.6], [-.5, VA.SAIL_TOP + .01, zl - 1.6]], FY, fn({ al: .6 })));   // bridge cockpit
  for (const s of [-1, 1]) SL.push(line([[s * w * .98, 5.6, zl - 1.8], [s * w * .98, 5.6, zl - 4.0]], fn({ w: .35, pts: false })));              // bridge access door rails
  // bow planes (retractable, high on the bow)
  for (const s of [-1, 1]) {
    const z = 45.6, y = VA.AX + 1.9, x0 = Math.sqrt(Math.max(0, vaR(z) ** 2 - 1.9 ** 2)) - .15;
    BP.push(slab2([[s * x0, y, z + 1.0], [s * (x0 + 2.3), y, z + .7], [s * (x0 + 2.3), y, z - .6], [s * x0, y, z - 1.0]], [.32, .18, .12, .22]));
    BP.push(line([[s * (x0 + .1), y + .12, z - .45], [s * (x0 + 2.2), y + .08, z - .3]], fn({ w: .4, pts: false })));
  }
  // stern: upper and lower rudders, stern planes with end plates
  const rT = z => vaR(z) - .12;
  for (const s of [1, -1]) {
    SP.push(slab2([[0, VA.AX + s * rT(-40.5), -40.5], [0, VA.AX + s * 6.9, -43.4], [0, VA.AX + s * 6.9, -48.3], [0, VA.AX + s * rT(-47.9), -47.9]], [.5, .22, .12, .3]));
    SP.push(line([[.14, VA.AX + s * (rT(-46.6) + .1), -46.6], [.14, VA.AX + s * 6.7, -46.9]], fn({ w: .4, pts: false })));
    SP.push(slab2([[s * rT(-40.5), VA.AX, -40.5], [s * 6.6, VA.AX, -43.5], [s * 6.6, VA.AX, -48.3], [s * rT(-47.9), VA.AX, -47.9]], [.5, .22, .12, .3]));
    SP.push(line([[s * (rT(-46.6) + .1), VA.AX + .14, -46.6], [s * 6.5, VA.AX + .12, -46.9]], fn({ w: .4, pts: false })));
    SP.push(slab2([[s * 6.62, VA.AX - 1.35, -43.4], [s * 6.62, VA.AX + 1.35, -43.4], [s * 6.62, VA.AX + 1.35, -48.4], [s * 6.62, VA.AX - 1.35, -48.4]], [.16, .16, .1, .1]));
  }
  // wide-aperture flank arrays, three a side
  for (const s of [-1, 1]) for (const [z0, z1] of [[-15, -7.5], [-2, 5.5], [9, 16.5]]) {
    AR.push(box([s > 0 ? VA.R - .15 : -VA.R - .12, VA.AX - 1.65, z0], [s > 0 ? VA.R + .12 : -VA.R + .15, VA.AX + 1.65, z1], { bottom: true }));
    for (let k = 1; k < 5; k++) AR.push(line([[s * (VA.R + .13), VA.AX - 1.6, z0 + k * (z1 - z0) / 5], [s * (VA.R + .13), VA.AX + 1.6, z0 + k * (z1 - z0) / 5]], fn({ w: .3, pts: false })));
  }
  // propulsor: duct on its struts round the hub (the rotor turns: e2-style dyn below)
  const [d0, d1] = VA.ZDUCT, dl = d1 - d0;
  PU.push(lathe([0, VA.AX, d0], FZ, [[0, 2.02], [.5, 2.25], [dl * .7, 2.31], [dl - .25, 2.18], [dl, 2.0]], { n: 44, gen: 12, rings: [0, 2, 4] }));
  PU.push(lathe([0, VA.AX, d0], FZ, [[0, 1.93], [dl, 1.93]], { n: 44, gen: 0, rings: [], sil: false }));
  PU.push(ringW([0, VA.AX, d1], FZ, 1.96, { n: 44 }));
  PU.push(lathe([0, VA.AX, -52], [0, 0, -1], [[0, 1.3], [1.4, 1.14], [3.0, .88], [4.4, .48], [5.2, .14], [5.45, 0]], { n: 32, gen: 8, rings: [0, 2, 4] }));
  PU.push(blades([0, VA.AX, -51.6], FZ, 9, 1.22, 1.96, { chord: .16, taper: 1.6, pitch: 1.1, edge: .6 }));   // stator vanes / duct struts
  return { BW, HL, SN, SL, BP, SP, AR, PU, KS };
});
/* masts (dyn, st.mast 0 housed .. 1 raised): only what stands above the sail top is drawn */
function vaMasts(st) {
  const m = st.mast === undefined ? 1 : sat(st.mast), P = [], y0 = VA.SAIL_TOP;
  if (m < .02) return P;
  for (const [x, z, r, h, kind] of VA_MASTS) {
    const H = h * m, y1 = y0 + H;
    P.push(lathe([x, y0, z], FY, [[0, r], [Math.max(.05, H - .5), r * .9], [H, r * .75]], { n: 12, gen: 3, rings: [1] }));
    if (kind === 'eo') { P.push(lathe([x, y1, z], FY, [[0, r * 1.3], [.5, r * 1.3], [.62, r * .5], [.66, 0]], { n: 14, gen: 4, rings: [0, 1] })); P.push(ringW([x, y1 + .3, z + r * 1.3], FZ, .1, fn({ n: 10 }))); }
    else if (kind === 'rdr') { P.push(box([x - .55, y1 - .2, z - .12], [x + .55, y1 + .3, z + .12])); P.push(lathe([x, y1 + .3, z], FY, [[0, .18], [.4, .1]], fn({ n: 10, gen: 2 }))); }
    else if (kind === 'snort') P.push(box([x - .4, y1 - .1, z - .35], [x + .4, y1 + .5, z + .35]));
    else P.push(line([[x, y1, z], [x, y1 + 1.4, z]], { w: .6 }));
  }
  return P;
}
/* the VPT hatches (dyn, st.vptA / st.vptB 0..1): hinged on the starboard edge; the six cell tops show when open */
function vaVpt(st) {
  const P = [];
  VA.VPT_Z.forEach((z, t) => {
    const f = sat(t ? st.vptB || 0 : st.vptA || 0), y = vaTop(z) + .02, hinge = [VA.VPT_R, y, z];
    const Tm = f > 0 ? about(R.z(-f * 1.9), hinge) : null;
    const hatch = [lathe([0, y - .06, z], FY, [[0, VA.VPT_R], [.12, VA.VPT_R], [.14, .9], [.16, 0]], { n: 32, gen: 0, rings: [0, 1], caps: true }),
      line([[-.6, y + .1, z], [.6, y + .1, z]], fn({ w: .4, pts: false })), box([VA.VPT_R - .12, y, z - .5], [VA.VPT_R + .08, y + .15, z + .5], fn())];
    P.push(...(Tm ? tps(Tm, hatch) : hatch));
    P.push(ringW([0, y - .05, z], FY, VA.VPT_R + .08, { n: 32 }));
    if (f > .05) for (let i = t * 6; i < t * 6 + 6; i++) { const c = vaCell(i); P.push(ringW([c[0], c[1] + .2, c[2]], FY, .31, { n: 14 })); P.push(lathe([c[0], c[1] - .2, c[2]], FY, [[0, .28], [.25, .28]], fn({ n: 12, gen: 0, caps: true }))); }
  });
  return P;
}
function vaRotor(st) { return [blades([0, VA.AX, -53.4], [0, 0, -1], 7, 1.1, 1.9, { rot: st.prop || 0, chord: .42, taper: .8, pitch: .7, edge: .8 })]; }
function ssn() {
  const g = VA_GEO();
  return {
    name: 'ssn', L: 114.9, AX: VA.AX, SAIL_TOP: VA.SAIL_TOP, cell: vaCell,
    parts: [
      { name: 'bow', label: 'Large Aperture Bow · sonar', prims: g.BW },
      { name: 'hull', label: 'Hull · Ø 10.4 m · 114.9 m', prims: g.HL },
      { name: 'stern', label: 'Stern', prims: g.SN },
      { name: 'sail', label: 'Sail · leading-edge fillet', prims: g.SL },
      { name: 'masts', label: 'Photonics masts ×2 · mast array', prims: vaMasts({}), dyn: vaMasts, show: st => (st.mast === undefined ? 1 : st.mast) > .02 },
      { name: 'vpt', label: 'Virginia Payload Tubes ×2 · hatches', prims: vaVpt({}), dyn: vaVpt },
      { name: 'bowPlanes', label: 'Bow planes · retractable', prims: g.BP },
      { name: 'sternPlanes', label: 'Stern planes · end plates · rudders', prims: g.SP },
      { name: 'arrays', label: 'Wide-aperture flank arrays ×6', prims: g.AR },
      { name: 'propulsor', label: 'Pump-jet propulsor', prims: g.PU.concat(vaRotor({})), dyn: st => g.PU.concat(vaRotor(st)) },
    ],
  };
}
/* cutaway: + torpedo room (4 tubes, racks), the two VPTs, control room, reactor compartment, engine room, bow array */
function ssnCut() {
  const M = ssn(), AX = VA.AX;
  const TR = [];
  // four 533 mm tubes: breeches aft at the lower level, angled outboard to muzzles on the bow flanks
  for (const s of [-1, 1]) for (const y of [AX - 1.5, AX - 2.6]) {
    const a = [s * .85, y, 30.5], b = [s * (Math.sqrt(Math.max(0, vaR(40.5) ** 2 - (y - AX) ** 2)) - .35), y, 40.5];
    TR.push(cyl(a, b, .36, { n: 14, gen: 4, caps: true }));
    TR.push(lathe(a, V.norm(V.sub(a, b)), [[0, .42], [.5, .42]], { n: 14, gen: 0, caps: true, rings: [0, 1] }));    // breech door
  }
  TR.push(box([-3.7, AX - 3.25, 20.5], [3.7, AX - 3.15, 39.5], { ds: 2.6 }));                                      // torpedo room deck
  for (const s of [-1, 1]) for (const x of [.8, 1.75, 2.7]) TR.push(box([s * x - .32, AX - 3.15, 21.8], [s * x + .32, AX - 3.0, 29.2], fn()));   // skids
  const VT = [];
  VA.VPT_Z.forEach(z => { VT.push(lathe([0, AX - 4.6, z], FY, [[0, VA.VPT_R - .08], [vaTop(z) - (AX - 4.6) - .2, VA.VPT_R - .08]], { n: 32, gen: 8, caps: true, rings: [0, 1] })); VT.push(cyl([0, AX - 4.6, z], [0, vaTop(z) - .4, z], .22, { n: 10, gen: 0 })); });
  const CR = [];
  CR.push(box([-3.8, AX + .9, 14], [3.8, AX + 1.0, 34], { ds: 2.6 }));                                          // command deck
  CR.push(box([-4.2, AX - 2.1, 5], [4.2, AX - 2.0, 34], fn({ ds: 3 })));                                        // middle deck
  for (const s of [-1, 1]) for (const z of [18, 20.5, 23, 25.5]) CR.push(box([s * 2.6, AX + 1.0, z], [s * 3.4, AX + 2.6, z + 1.8]));   // consoles
  CR.push(box([-1.2, AX + 1.0, 27.5], [1.2, AX + 2.0, 29.5]));                                                   // pilot / co-pilot stations
  CR.push(cyl([0, AX + 1.0, 30.3], [0, VA.SAIL_TOP - .2, 30.3], .3, fn({ n: 10, gen: 2 })));                     // mast wells (non-penetrating)
  const RC = [];
  RC.push(box([-4.4, AX - 4.2, -6], [4.4, AX + 3.9, 6], { ds: 2 }));                                            // shielded compartment
  RC.push(lathe([0, AX - 3.6, 0], FY, [[0, 1.3], [.4, 1.7], [4.8, 1.7], [5.4, 1.2], [5.6, 0]], { n: 24, gen: 6, rings: [1, 2, 3] }));   // pressure vessel
  RC.push(cyl([-3.6, AX - 1.5, -3.5], [-3.6, AX + 2.6, -3.5], .75, { n: 16, gen: 4, caps: true }));             // steam generator
  const ER = [];
  for (const s of [-1, 1]) ER.push(lathe([s * 1.9, AX - .6, -26], FZ, [[0, .6], [.4, 1.1], [6.5, 1.2], [7.2, .7]], { n: 20, gen: 6, rings: [1, 2] }));   // main turbines
  ER.push(box([-2.0, AX - 2.6, -30.5], [2.0, AX + 1.2, -27]));                                                   // reduction gear
  for (const s of [-1, 1]) ER.push(lathe([s * 3.0, AX + 1.8, -18], FZ, [[0, .5], [5, .5]], { n: 14, gen: 4, caps: true }));   // turbine generators
  ER.push(cyl([0, AX, -30.5], [0, AX, -51.8], .28, { n: 12, gen: 3 }));                                           // shaft
  ER.push(box([-4.0, AX - 3.2, -34], [4.0, AX - 3.1, -8], fn({ ds: 3 })));
  const LB = [];
  // the LAB: a horseshoe of vertical staves in the free-flood bow
  for (let k = 0; k <= 24; k++) { const a = -2.2 + k * 4.4 / 24, x = Math.sin(a) * 3.7, z = 51.5 + Math.cos(a) * 3.0; LB.push(line([[x, AX - 3.0, z], [x, AX + 3.0, z]], { w: .55 })); }
  LB.push(lathe([0, AX - 3.2, 51.5], FY, [[0, 3.8], [6.4, 3.8]], { n: 40, gen: 0, rings: [0, 1], pts: false }));
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'torpRoom', label: 'Torpedo room · 4 tubes · 533 mm', prims: TR }, hidden));
  parts.push(O({ name: 'vptTubes', label: 'Virginia Payload Tubes · 6 cells each', prims: VT }, hidden));
  parts.push(O({ name: 'control', label: 'Control room · command deck', prims: CR }, hidden));
  parts.push(O({ name: 'reactor', label: 'Reactor compartment · S9G', prims: RC }, hidden));
  parts.push(O({ name: 'engine', label: 'Engine room · main turbines · shaft', prims: ER }, hidden));
  parts.push(O({ name: 'lab', label: 'Large Aperture Bow array', prims: LB }, hidden));
  return O(M, { name: 'ssn_cut', parts });
}

/* ================================================================ SSK Kilo class · Project 636.3
   73.8 m, beam 9.9 m, surfaced draught 6.2 m, 3 950 t submerged. Blunt bow with the big sonar and six 533 mm
   tubes, a flat upper casing with rows of free-flooding (limber) holes, long sail with a bridge, bow planes that
   retract into the casing, cruciform stern, a seven-blade skewed propeller. Origin midships on the surfaced
   waterline (hull axis 1.9 m under it), bow +Z. state: mast (0 housed .. 1 raised), prop (rad). */
const KL = { R: 4.4, AX: -1.9, ZB: 36.9, ZBOW: 26.5, ZAFT: -12, DECK: 2.9, SAIL: [8.3, -5.0, 1.2], SAIL_TOP: 7.75 };
function klR(z) {
  if (z >= KL.ZBOW) { const u = Math.min(1, (z - KL.ZBOW) / (KL.ZB - KL.ZBOW)); return KL.R * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.6))); }
  if (z >= KL.ZAFT) return KL.R;
  const u = Math.min(1, (KL.ZAFT - z) / 22.6); return KL.R - (KL.R - .8) * Math.pow(u, 1.45);
}
const klTop = z => KL.AX + klR(z);
const KL_MASTS = [[0, 5.7, .12, 5.2, 'scope'], [0, 4.6, .19, 5.0, 'scope'], [0, 3.1, .22, 4.1, 'rdr'], [0, 1.6, .2, 4.3, 'esm'], [0, -.6, .34, 3.3, 'snort'], [0, -1.9, .22, 2.5, 'exh'], [0, -3.1, .12, 4.4, 'whip']];
/* torpedo tube muzzles on the bow: 2 rows of 3 */
const KL_TUBES = (() => { const T = []; for (const y of [.95, -.35]) for (const x of [-1.0, 0, 1.0]) T.push([x, KL.AX + y]); return T; })();
const klBowZ = rho => KL.ZBOW + (KL.ZB - KL.ZBOW) * Math.pow(Math.max(0, 1 - (rho / KL.R) ** 2), 1 / 2.6);
const KL_GEO = memo(() => {
  const BW = [], HL = [], SN = [], CS = [], SL = [], BP = [], SP = [], PH = [];
  const lat = { n: 48, gen: 14 };
  BW.push(revZ(KL.AX, klR, KL.ZBOW, KL.ZB, 0, O(lat, { rings: [0, 3, 6, 8] }), [26.5, 28.5, 30.5, 32.3, 33.8, 35, 35.9, 36.4, 36.75, 36.9]));
  for (const [x, y] of KL_TUBES) {
    const rho = Math.hypot(x, y - KL.AX), z = klBowZ(rho) + .02, n = V.norm([x * .12, (y - KL.AX) * .12, 1]);
    BW.push(circle([x, y, z], n, .33, 16, { w: .75 }));
    BW.push(circle([x, y, z + .01], n, .42, 16, fn({ w: .45, pts: false })));
  }
  BW.push(ringW([0, KL.AX, 31.8], FZ, klR(31.8) + .02, fn({ n: 40, al: .5 })));                                  // sonar window seam
  HL.push(revZ(KL.AX, klR, KL.ZAFT, KL.ZBOW, 0, O(lat, { rings: [0, 2, 4] }), [-12, -2, 8, 18, 26.5]));
  SN.push(revZ(KL.AX, klR, -34.6, KL.ZAFT, 0, O(lat, { rings: [0, 3, 6] }), [-34.6, -33, -31, -28.5, -25.5, -22, -18, -12]));
  // upper casing: flat deck on a faired box over the hull, ramps down at bow and stern, limber holes along it
  const deckY = z => z > 30 ? mix(KL.DECK, klTop(35.2) + .15, sat((z - 30) / 5.2)) : z < -22 ? mix(KL.DECK, klTop(-28.5) + .12, sat((-22 - z) / 6.5)) : KL.DECK;
  const hw = z => 1.3 * (z > 30 ? mix(1, .45, sat((z - 30) / 5.2)) : z < -22 ? mix(1, .5, sat((-22 - z) / 6.5)) : 1);
  const secAt = z => {
    const yt = deckY(z), yb = Math.min(yt - .15, klTop(z) - .45), w = hw(z), r = klR(z);
    const xb = Math.sqrt(Math.max(0, r * r - (yb - KL.AX) ** 2));
    return [[-xb, yb, z], [-w - .12, yt - .25, z], [-w, yt, z], [w, yt, z], [w + .12, yt - .25, z], [xb, yb, z]];
  };
  const CZ = [-28.5, -26, -22, -12, 0, 12, 24, 30, 32.5, 35.2];
  const KC = SA.skin(CZ.map(secAt), true);
  CS.push(...SA.loft(KC, { lines: [1, 2, 3, 4], fineJ: [], rings: [2, 7], al: .85, ral: .4 }));
  for (let z = -20.5; z < 29; z += .95) for (const s of [-1, 1]) for (const f of [.3, .7]) {
    const q = secAt(z), a = q[s > 0 ? 5 : 0], b = q[s > 0 ? 4 : 1], p = V.lerp(a, b, f), hy = .13;
    CS.push(line([[p[0] + s * .01, p[1] - hy, z - .22], [p[0] + s * .01, p[1] + hy, z - .22], [p[0] + s * .01, p[1] + hy, z + .22], [p[0] + s * .01, p[1] - hy, z + .22]], fn({ closed: true, w: .5 })));
  }
  for (let z = -18; z < 28; z += 6) CS.push(line([[-1.1, KL.DECK + .01, z], [1.1, KL.DECK + .01, z]], fn({ w: .3, pts: false })));
  for (const z of [22.5, -15.5]) CS.push(circle([0, KL.DECK + .02, z], FY, .42, 14, fn({ w: .6, pts: false })));   // hatches
  // sail: long, rounded front, bridge at the top forward
  const [zl, zt, w] = KL.SAIL, SS = [[2.5, zl + .3, zt - .2, w + .05], [KL.DECK, zl, zt, w], [5.0, zl - .6, zt + .3, w - .08], [7.3, zl - 1.2, zt + .6, w - .15], [KL.SAIL_TOP, zl - 1.9, zt + .75, w - .22]];
  const KS = SA.skin(SS.map(q => foilSec(q[0], q[1], q[2], q[3], 20)));
  SL.push(...SA.loft(KS, { lines: [0, 3, 5, 7, 10, 13, 15, 17], fineJ: [3, 7, 13, 17], rings: [2, 4], al: .9, ral: .55 }));
  SL.push(...foilCap(foilSec(KL.SAIL_TOP, zl - 1.9, zt + .75, w - .22, 20)));
  SL.push(SA.fquad([[-.6, KL.SAIL_TOP + .01, zl - 2.2], [.6, KL.SAIL_TOP + .01, zl - 2.2], [.6, KL.SAIL_TOP + .01, zl - 3.8], [-.6, KL.SAIL_TOP + .01, zl - 3.8]], FY, { al: .7 }));   // bridge
  for (const s of [-1, 1]) {
    SL.push(line([[s * (w - .2), 6.9, zl - 2.2], [s * (w - .2), 6.9, zl - 3.9]], fn({ w: .4, pts: false })));
    for (const z of [zl - 2.5, zl - 3.1]) SL.push(circle([s * (w - .18), 6.5, z], [s, 0, 0], .12, 10, fn({ w: .5, pts: false })));   // bridge scuttles
  }
  for (const [x, z, r] of KL_MASTS) SL.push(circle([x, KL.SAIL_TOP + .02, z], FY, r + .06, 12, fn({ w: .5, pts: false })));
  // bow planes: out of the casing sides high on the bow
  for (const s of [-1, 1]) {
    const z = 28.8, y = 1.25, x0 = Math.sqrt(Math.max(0, klR(z) ** 2 - (y - KL.AX) ** 2)) - .1;
    BP.push(slab2([[s * x0, y, z + .85], [s * (x0 + 2.2), y, z + .6], [s * (x0 + 2.2), y, z - .55], [s * x0, y, z - .8]], [.28, .16, .1, .18]));
  }
  // stern: rudders above and below, stern planes
  const rT = z => klR(z) - .1;
  for (const s of [1, -1]) {
    SP.push(slab2([[0, KL.AX + s * rT(-26.5), -26.5], [0, KL.AX + s * (s > 0 ? 4.9 : 5.0), -29.2], [0, KL.AX + s * (s > 0 ? 4.9 : 5.0), -32.2], [0, KL.AX + s * rT(-31.8), -31.8]], [.42, .2, .1, .26]));
    SP.push(slab2([[s * rT(-26.5), KL.AX, -26.5], [s * 5.3, KL.AX, -29.0], [s * 5.3, KL.AX, -32.1], [s * rT(-31.8), KL.AX, -31.8]], [.42, .2, .1, .26]));
    SP.push(line([[s * (rT(-30.5) + .1), KL.AX + .12, -30.6], [s * 5.2, KL.AX + .1, -31.0]], fn({ w: .4, pts: false })));
    SP.push(line([[.12, KL.AX + s * (rT(-30.5) + .1), -30.6], [.12, KL.AX + s * 4.8, -31.0]], fn({ w: .4, pts: false })));
  }
  PH.push(lathe([0, KL.AX, -34.6], [0, 0, -1], [[0, .8], [.5, .72], [1.3, .5], [1.95, .18], [2.3, 0]], { n: 24, gen: 6, rings: [0, 2] }));
  return { BW, HL, SN, CS, SL, BP, SP, PH };
});
function klMasts(st) {
  const m = st.mast === undefined ? 1 : sat(st.mast), P = [], y0 = KL.SAIL_TOP;
  if (m < .02) return P;
  for (const [x, z, r, h, kind] of KL_MASTS) {
    const H = h * m, y1 = y0 + H;
    P.push(lathe([x, y0, z], FY, [[0, r], [Math.max(.05, H - .4), r * .85], [H, r * .7]], { n: 10, gen: 3, rings: [1] }));
    if (kind === 'scope') { P.push(lathe([x, y1, z], FY, [[0, r * .9], [.45, r * .9], [.5, 0]], { n: 10, gen: 2 })); P.push(ringW([x, y1 + .25, z + r * .9], FZ, r * .45, fn({ n: 8 }))); }
    else if (kind === 'rdr') P.push(box([x - .7, y1 - .1, z - .1], [x + .7, y1 + .32, z + .1]));
    else if (kind === 'esm') P.push(lathe([x, y1, z], FY, [[0, .3], [.5, .3], [.6, 0]], { n: 12, gen: 3, rings: [0, 1] }));
    else if (kind === 'snort') P.push(box([x - .45, y1 - .1, z - .5], [x + .45, y1 + .55, z + .5]));
    else if (kind === 'exh') P.push(box([x - .3, y1 - .1, z - .3], [x + .3, y1 + .2, z + .3]));
    else P.push(line([[x, y1, z], [x, y1 + 1.3, z]], { w: .6 }));
  }
  return P;
}
function klProp(st) { return [blades([0, KL.AX, -35.0], [0, 0, -1], 7, .62, 1.55, { rot: st.prop || 0, chord: .78, taper: .8, pitch: .45, edge: .85 })]; }
function ssk() {
  const g = KL_GEO();
  return {
    name: 'ssk', L: 73.8, AX: KL.AX, SAIL_TOP: KL.SAIL_TOP, TUBES: KL_TUBES.map(([x, y]) => [x, y, klBowZ(Math.hypot(x, y - KL.AX))]),
    parts: [
      { name: 'bow', label: 'Bow · MGK-400EM sonar · 6 tubes', prims: g.BW },
      { name: 'hull', label: 'Hull · double hull · 73.8 m', prims: g.HL },
      { name: 'stern', label: 'Stern', prims: g.SN },
      { name: 'casing', label: 'Upper casing · limber holes', prims: g.CS },
      { name: 'sail', label: 'Sail · bridge', prims: g.SL },
      { name: 'masts', label: 'Periscopes ×2 · radar · ESM · snorkel', prims: klMasts({}), dyn: klMasts, show: st => (st.mast === undefined ? 1 : st.mast) > .02 },
      { name: 'bowPlanes', label: 'Bow planes · retractable', prims: g.BP },
      { name: 'sternPlanes', label: 'Stern planes · rudders', prims: g.SP },
      { name: 'prop', label: 'Propeller · 7 blades · skewed', prims: g.PH.concat(klProp({})), dyn: st => g.PH.concat(klProp(st)) },
    ],
  };
}
/* cutaway: + torpedo room (6 tubes, racks), batteries, diesel generators, main motor, central post, bow array */
function sskCut() {
  const M = ssk(), AX = KL.AX;
  const TR = [];
  for (const [x, y] of KL_TUBES) { const z1 = klBowZ(Math.hypot(x, y - AX)) - .2; TR.push(cyl([x, y, 27.2], [x, y, z1], .33, { n: 14, gen: 4, caps: true })); TR.push(lathe([x, y, 27.2], [0, 0, -1], [[0, .4], [.4, .4]], { n: 14, gen: 0, caps: true, rings: [0, 1] })); }
  TR.push(box([-3.4, AX - 2.1, 17.5], [3.4, AX - 2.0, 27.2], { ds: 2.6 }));
  for (const s of [-1, 1]) for (const x of [.85, 1.9]) for (const y of [AX - 2.0, AX - .75]) TR.push(box([s * x - .3, y, 18.6], [s * x + .3, y + .12, 25.6], fn()));
  const BT = [];
  for (const [z0, z1] of [[10, 16.5], [-4, 2.5]]) {
    BT.push(box([-3.3, AX - 3.6, z0], [3.3, AX - 1.9, z1]));
    for (let z = z0 + .5; z < z1; z += .55) BT.push(line([[-3.25, AX - 1.88, z], [3.25, AX - 1.88, z]], fn({ w: .35 })));
  }
  const DG = [];
  for (const s of [-1, 1]) { DG.push(box([s * 1.9 - .8, AX - 1.4, -15.5], [s * 1.9 + .8, AX + .9, -9.5])); DG.push(lathe([s * 1.9, AX - .25, -9.5], FZ, [[0, .75], [1.6, .75]], { n: 16, gen: 4, caps: true })); }
  const MM = [];
  MM.push(lathe([0, AX, -22.5], FZ, [[0, 1.1], [.3, 1.5], [3.6, 1.5], [3.9, 1.1]], { n: 24, gen: 6, caps: true, rings: [1, 2] }));
  MM.push(cyl([0, AX, -22.5], [0, AX, -34.4], .22, { n: 12, gen: 3 }));
  const CP = [];
  CP.push(box([-3.5, AX + .3, -3.5], [3.5, AX + .4, 8.5], { ds: 2.6 }));
  for (const s of [-1, 1]) for (const z of [-1.5, 1, 3.5]) CP.push(box([s * 2.3, AX + .4, z], [s * 3.1, AX + 2.0, z + 1.8]));
  CP.push(cyl([0, AX + .4, 5.7], [0, KL.SAIL_TOP - .2, 5.7], .22, fn({ n: 10, gen: 2 })));
  CP.push(cyl([0, AX + .4, 4.6], [0, KL.SAIL_TOP - .2, 4.6], .28, fn({ n: 10, gen: 2 })));
  const SA2 = [];
  for (let k = 0; k <= 20; k++) { const a = -1.9 + k * 3.8 / 20, x = Math.sin(a) * 3.1, z = 32.4 + Math.cos(a) * 2.2; SA2.push(line([[x, AX - 2.6, z], [x, AX + 2.6, z]], { w: .55 })); }
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'torpRoom', label: 'Torpedo room · 6 tubes · 533 mm', prims: TR }, hidden));
  parts.push(O({ name: 'battery', label: 'Batteries · 2 groups', prims: BT }, hidden));
  parts.push(O({ name: 'diesels', label: 'Diesel generators ×2', prims: DG }, hidden));
  parts.push(O({ name: 'motor', label: 'Main propulsion motor · shaft', prims: MM }, hidden));
  parts.push(O({ name: 'control', label: 'Central post', prims: CP }, hidden));
  parts.push(O({ name: 'sonarArr', label: 'Bow sonar array', prims: SA2 }, hidden));
  return O(M, { name: 'ssk_cut', parts });
}

/* anchors for anatomy.js and the game: the SSN's VPT cells (top centres, ship frame) and the boats' hull axes */
export const SUBS = { ssn: { AX: VA.AX, R: VA.R, SAIL_TOP: VA.SAIL_TOP, VPT_Z: VA.VPT_Z, cell: vaCell, top: vaTop }, ssk: { AX: KL.AX, R: KL.R, SAIL_TOP: KL.SAIL_TOP, TUBES: KL_TUBES, top: klTop } };
export const E2D = { DOME_C: E2.DOME_C, GEAR_H: E2.GEAR_H, NAC: [[-E2.NAC_X, E2.NAC_Y, E2.PROP_Z], [E2.NAC_X, E2.NAC_Y, E2.PROP_Z]] };

/* ================================================================ Bal coastal missile system · 3K60 launcher
   MZKT-7930 8×8 (the TEL's chassis, cab and power pack) with a crew cabin for the launch control and a pack of
   eight Kh-35U transport-launch containers (two tiers of four) hinged at its front: raised, the rear of the pack
   lifts and the rounds leave over the back of the vehicle. Vehicle-local: origin on the ground at the centre, +Z
   forward. state: elev (rad, 0 stowed .. 0.52 raised), dep (0..1 jacks), n (rounds left 0..8: a fired container
   has lost its rear cover), wheel (rad). */
const BL = { AXLES: [4.45, 2.25, -2.75, -4.95], PIV: [0, 1.66, -.35], LEN: 6.3, COLS: [-.96, -.32, .32, .96], ROWS: [.36, .98], BOX: .6, ELEV: .52, JACKS: [[1.66, 1.15], [1.7, -6.5]], JT: .55 };
/* container k (0..7, the firing order: top tier outboard first) -> [x, y, z mid] in the pack frame (before the raise) */
const BL_ORDER = [[1, 0], [1, 3], [1, 1], [1, 2], [0, 0], [0, 3], [0, 1], [0, 2]];
const blCont = k => { const [r, c] = BL_ORDER[k]; return [BL.COLS[c], BL.PIV[1] + BL.ROWS[r], BL.PIV[2] - BL.LEN / 2]; };
const blPackXf = st => X.pivotX(BL.PIV, st.elev || 0);
const BL_GEO = memo(() => {
  const C = [], K = [], CB = [], B = [], PK = [];
  HD.chassis8x8(C, 6.2, -6.9, { axles: BL.AXLES, deckFront: 2.35, fenders: [[1.42, 2.95, false, true], [-5.78, -1.9, true, true]] });
  for (const sx of [-1, 1]) C.push(cyl([sx * 1.28, 1.02, -.6], [sx * 1.28, 1.02, -2.4], .3, { n: 16, gen: 4, caps: true }));
  for (const [x, z] of BL.JACKS) for (const sx of [-1, 1]) {
    C.push(box([sx * .8, 1.14, z - .16], [sx * (x - .08), 1.4, z + .16]));
    C.push(lathe([sx * x, .76, z], FY, [[0, .15], [.08, .15], [.08, .13], [.76, .13], [.8, .15], [.84, .15]], { n: 12, gen: 2, rings: [0, 1, 4, 5], caps: true }));
  }
  // pack hinge brackets and pin; ram trunnion on the frame
  for (const sx of [-1, 1]) C.push(HD.prism(sx * 1.1, sx * 1.26, 1.45, 1.78, -.7, -.05, sx * 1.1, sx * 1.26, -.5, -.2));
  C.push(cyl([-1.3, BL.PIV[1], BL.PIV[2]], [1.3, BL.PIV[1], BL.PIV[2]], .07, { n: 10, gen: 0, caps: true }));
  C.push(box([-.3, 1.45, -3.3], [.3, 1.62, -2.7]));
  K.push(...partOf(HD.tel(), 'cab').prims);
  // power pack cover behind the cab, as on the TEL
  B.push(box([-1.36, 1.45, 2.95], [1.36, 2.95, 4.1]));
  for (const sx of [-1, 1]) B.push(panel([[sx * 1.365, 1.62, 3.05], [sx * 1.365, 1.62, 4.0], [sx * 1.365, 2.78, 4.0], [sx * 1.365, 2.78, 3.05]], { hatch: 5, edge: .6, pts: false }));
  B.push(lathe([1.18, 2.95, 3.2], FY, [[0, .1], [.75, .1], [.8, .115]], { n: 12, gen: 2, rings: [0, 2] }));
  // crew cabin: the launch control station between the power pack and the pack
  CB.push(box([-1.3, 1.45, .05], [1.3, 3.25, 2.9]));
  for (const sx of [-1, 1]) {
    CB.push(panel([[sx * 1.305, 2.35, 1.65], [sx * 1.305, 2.35, 2.55], [sx * 1.305, 2.95, 2.55], [sx * 1.305, 2.95, 1.65]], { edge: .8, pts: false }));
    CB.push(panel([[sx * 1.305, 1.6, .35], [sx * 1.305, 1.6, 1.3], [sx * 1.305, 3.0, 1.3], [sx * 1.305, 3.0, .35]], { edge: .5, pts: false }));
    CB.push(line([[sx * 1.33, 2.1, 1.2], [sx * 1.33, 2.1, .95]], fn({ w: .7 })));
    for (const yy of [.72, 1.12]) CB.push(box([sx * 1.05, yy, .4], [sx * 1.45, yy + .06, 1.2], fn()));
  }
  CB.push(box([-.6, 3.25, .5], [.6, 3.6, 1.5]));                                                               // air conditioner
  CB.push(lathe([.9, 3.25, 2.4], FY, [[0, .05], [.1, .04]], fn({ n: 8, gen: 0, rings: [0] })));
  CB.push(line([[.9, 3.35, 2.4], [.88, 4.6, 2.3], [.85, 5.8, 2.15]], { w: .55 }));                              // whip antenna
  // the pack: eight square containers with stiffening frames, the cradle under them, rear cover rims
  const P0 = BL.PIV, z0 = P0[2], z1 = P0[2] - BL.LEN, h = BL.BOX / 2;
  PK.push(box([-1.32, P0[1] - .1, z1 - .05], [1.32, P0[1] + .06, z0]));                                         // cradle
  for (const sx of [-1, 1]) PK.push(box([sx * 1.28 - .06, P0[1] + .06, z1], [sx * 1.28 + .06, P0[1] + 1.32, z0 - .1]));
  for (const z of [z0 - .5, z0 - 3.15, z1 + .5]) PK.push(box([-1.34, P0[1] + .06, z - .08], [1.34, P0[1] + 1.36, z + .08], fn()));
  for (let k = 0; k < 8; k++) {
    const [x, y] = blCont(k);
    PK.push(box([x - h, y - h, z1], [x + h, y + h, z0], { bottom: true }));
    for (let q = 1; q < 6; q++) { const z = z0 - q * BL.LEN / 6; PK.push(box([x - h - .02, y - h - .02, z - .05], [x + h + .02, y + h + .02, z + .05], fn({ skip: [0, 1] }))); }
    PK.push(SA.fquad([[x - h + .05, y - h + .05, z0 + .01], [x + h - .05, y - h + .05, z0 + .01], [x + h - .05, y + h - .05, z0 + .01], [x - h + .05, y + h - .05, z0 + .01]], FZ, fn({ al: .5 })));
  }
  PK.push(box([-.5, P0[1] + 1.32, z0 - 1.2], [.5, P0[1] + 1.46, z0 - .3], fn()));                               // cable box
  return { C, K, CB, B, PK };
});
export const BAL = { PIV: BL.PIV, LEN: BL.LEN, ELEV: BL.ELEV, cont: blCont, packXf: blPackXf, ORDER: BL_ORDER };
/* rear covers (dyn): containers still loaded keep theirs */
function blCaps(st) {
  const n = st.n === undefined ? 8 : st.n, P = [], z = BL.PIV[2] - BL.LEN - .03, h = BL.BOX / 2;
  for (let k = 8 - Math.max(0, Math.min(8, Math.round(n))); k < 8; k++) {
    const [x, y] = blCont(k);
    P.push(box([x - h - .03, y - h - .03, z - .07], [x + h + .03, y + h + .03, z + .03], { bottom: true }));
    P.push(line([[x - .15, y, z - .09], [x + .15, y, z - .09]], fn({ w: .5 })));
  }
  return P;
}
function blRam(st) {
  const A = X.ap(blPackXf(st), [0, BL.PIV[1] - .1, BL.PIV[2] - 3.4]);
  const out = HD.ram([0, 1.6, -3.0], A, [.16, .12, .09], 1.6, { n: 14 });
  out.push(lathe([0, 1.6, -3.0], FX, [[-.14, .14], [.14, .14]], { n: 10, gen: 0, rings: [0, 1] }));
  return out;
}
function blJacks(st) {
  const dep = st.dep === undefined ? 1 : st.dep, lift = BL.JT * (1 - dep), out = [];
  for (const [x, z] of BL.JACKS) for (const sx of [-1, 1]) {
    const X0 = sx * x;
    out.push(box([X0 - .3, lift, z - .3], [X0 + .3, lift + .07, z + .3]));
    out.push(cyl([X0, lift + .07, z], [X0, .86, z], .075, { n: 10, gen: 2, rings: [0] }));
  }
  return out;
}
function bal() {
  const g = BL_GEO();
  const whL = st => wheelSide(BL.AXLES, -1, st.wheel || 0, {}), whR = st => wheelSide(BL.AXLES, 1, st.wheel || 0, {});
  return {
    name: 'bal', PIV: BL.PIV, LEN: BL.LEN, ELEV: BL.ELEV, cont: blCont,
    parts: [
      { name: 'chassis', label: 'MZKT-7930 · 8×8', prims: g.C },
      { name: 'wheelsL', label: 'Wheels ×4 · 1500×600-635 · L', prims: whL({}), dyn: whL },
      { name: 'wheelsR', label: 'Wheels ×4 · 1500×600-635 · R', prims: whR({}), dyn: whR },
      { name: 'cab', label: 'Cab · MZKT-7930', prims: g.K },
      { name: 'bay', label: 'Power pack cover', prims: g.B },
      { name: 'cabin', label: 'Crew cabin · launch control', prims: g.CB },
      { name: 'pack', label: 'Containers ×8 · Kh-35U', prims: g.PK, xf: blPackXf },
      { name: 'caps', label: 'Container rear covers', prims: blCaps({}), dyn: blCaps, xf: blPackXf },
      { name: 'ram', label: 'Pack ram · hydraulic', prims: blRam({}), dyn: blRam },
      { name: 'jacks', label: 'Outrigger jacks ×4', prims: blJacks({}), dyn: blJacks },
    ],
  };
}
/* cutaway: + the diesel and radiators, the launch control consoles */
function balCut() {
  const M = bal(), eng = yamz846();
  for (const sx of [-1, 1]) eng.push(...mzktRadiator(sx, 0));
  const CO = [];
  for (const sx of [-1, 1]) { CO.push(box([sx * .55 - .45, 1.45, 1.5], [sx * .55 + .45, 2.35, 2.6])); CO.push(box([sx * .55 - .42, 2.35, 2.3], [sx * .55 + .42, 2.95, 2.55])); CO.push(box([sx * .55 - .25, 1.45, .8], [sx * .55 + .25, 1.95, 1.25], fn())); }
  CO.push(box([-1.2, 1.45, .15], [-.6, 3.1, .7]));
  const parts = M.parts.map(p => O(p));
  parts.push(O({ name: 'engine', label: 'YaMZ-846 · V12 · radiators ×2', prims: eng }, hidden));
  parts.push(O({ name: 'consoles', label: 'Launch control consoles ×2 · racks', prims: CO }, hidden));
  return O(M, { name: 'bal_cut', parts });
}

/* ================================================================ munitions for the new launchers
   Kh-35U (Bal): 4.4 m with the booster, Ø 0.42 m, 1.33 m span; cruciform folding wings and fins, a flush ventral
   intake. 3M-54 Kalibr (Kilo): 8.22 m with the booster, Ø 0.533 m, 3.1 m span. Closed shells; origin mid-body, nose +Z. */
function kh35() {
  const r = .21, zT = -2.2, zB = -1.62, zN = 2.2;
  const g = slimShell({ r, z0: zB, z1: zN, nl: .5, tail: .96, joints: [-.8, .45, 1.25] });
  const fold = (e, deg, rr, set, w) => { const a = deg * DEG, c = Math.cos(a), s = Math.sin(a), at = (q, z) => [c * q, s * q, z]; return tp(about(R.z(-(1 - w) * PI / 2), at(rr, 0)), panel(set.map(([q, z]) => at(q, z)), { edge: 1 })); };
  const wingsP = st => { const w = st.wing === undefined ? 1 : st.wing; return [45, 135, 225, 315].map(d => fold(0, d, r, [[r, .6], [r + .455, .22], [r + .455, -.08], [r, -.2]], w)); };
  const finsP = st => { const f = st.fin === undefined ? 1 : st.fin; return [45, 135, 225, 315].map(d => fold(0, d, r, [[r, -1.1], [r + .3, -1.42], [r + .3, -1.6], [r, -1.62]], f)); };
  const IN = [hex([[-.12, -r + .02, -.95], [.12, -r + .02, -.95], [.12, -r + .02, -.2], [-.12, -r + .02, -.2], [-.1, -r - .06, -.9], [.1, -r - .06, -.9], [.1, -r - .01, -.3], [-.1, -r - .01, -.3]], { edge: 1 })];
  const BO = [lathe([0, 0, zT], FZ, [[0, .15], [.06, .2], [zB - zT, .2]], { n: 16, gen: 4, rings: [1, 2], caps: true })];
  for (const d of [0, 90, 180, 270]) { const a = d * DEG, c = Math.cos(a), s = Math.sin(a); BO.push(panel([[c * .2, s * .2, zT + .45], [c * .36, s * .36, zT + .12], [c * .36, s * .36, zT + .02], [c * .2, s * .2, zT + .02]], { edge: 1 })); }
  return { name: 'kh35', LEN: 4.4, R: r, parts: [
    { name: 'nose', label: 'Nose · radar seeker radome', prims: g.NS },
    { name: 'body', label: 'Kh-35U · Ø 0.42 m', prims: g.BD },
    { name: 'wings', label: 'Wings ×4 · folding · 1.33 m', prims: wingsP({}), dyn: wingsP },
    { name: 'fins', label: 'Tail fins ×4 · folding', prims: finsP({}), dyn: finsP },
    { name: 'inlet', label: 'Air intake · ventral', prims: IN },
    { name: 'booster', label: 'Booster · solid · 4 fins', prims: BO, show: st => st.booster !== false },
  ] };
}
function kalibr() {
  const r = .2665, zT = -4.11, zB = -2.45, zS = 1.55, zN = 4.11;
  const NS = [lathe([0, 0, zN - .95], FZ, [[0, r], [.35, r * .93], [.6, r * .74], [.8, r * .45], [.92, r * .15], [.95, 0]], { n: 22, gen: 6, rings: [0, 2] })];
  const TS = [lathe([0, 0, zS], FZ, [[0, r], [zN - .95 - zS, r]], { n: 22, gen: 6, rings: [0, 1] })];
  for (const d of [45, 135, 225, 315]) { const a = d * DEG, c = Math.cos(a), s = Math.sin(a); TS.push(panel([[c * r, s * r, zS + .55], [c * (r + .16), s * (r + .16), zS + .2], [c * (r + .16), s * (r + .16), zS + .04], [c * r, s * r, zS + .04]], { edge: 1 })); }
  const BD = [lathe([0, 0, zB], FZ, [[0, r], [zS - zB, r]], { n: 22, gen: 6, rings: [0, 1] })];
  for (const z of [-1.1, .3]) BD.push(ringW([0, 0, z], FZ, r + .003, fn({ n: 20 })));
  BD.push(box([-.06, r - .02, -1.9], [.06, r + .04, 1.3], fn()));
  const wingsP = st => {
    const w = st.wing === undefined ? 1 : st.wing, out = [];
    for (const sx of [-1, 1]) {
      const T = X.mul(T3([0, -r + .1, -.25]), X.make(R.y(sx * (1 - w) * PI / 2), [0, 0, 0]));
      out.push(tp(T, sheet([[sx * .02, 0, .42], [sx * 1.55, 0, .12], [sx * 1.55, 0, -.2], [sx * .02, 0, -.36]], [0, 1, 0], { th: .03 })));
    }
    return out;
  };
  const finsP = st => {
    const f = st.fin === undefined ? 1 : st.fin, out = [];
    for (const d of [45, 135, 225, 315]) {
      const a = d * DEG, c = Math.cos(a), s = Math.sin(a), at = (q, z) => [c * q, s * q, z];
      out.push(tp(about(R.z(-(1 - f) * PI / 2), at(r * .8, 0)), panel([at(r * .8, zB + .55), at(r + .42, zB + .2), at(r + .42, zB + .03), at(r * .8, zB + .03)], { edge: 1 })));
    }
    return out;
  };
  const IN = [hex([[-.14, -r + .02, -1.55], [.14, -r + .02, -1.55], [.14, -r + .02, -.85], [-.14, -r + .02, -.85], [-.15, -r - .16, -1.5], [.15, -r - .16, -1.5], [.15, -r - .16, -1.08], [-.15, -r - .1, -1.08]], { edge: 1 })];
  const BO = [lathe([0, 0, zT], FZ, [[0, .19], [.1, r], [zB - zT, r]], { n: 20, gen: 4, rings: [1, 2], caps: true })];
  for (const d of [45, 135, 225, 315]) { const a = d * DEG, c = Math.cos(a), s = Math.sin(a); BO.push(panel([[c * r, s * r, zT + .6], [c * (r + .22), s * (r + .22), zT + .2], [c * (r + .22), s * (r + .22), zT + .03], [c * r, s * r, zT + .03]], { edge: 1 })); }
  return { name: 'kalibr', LEN: 8.22, R: r, parts: [
    { name: 'nose', label: 'Nose · seeker radome', prims: NS },
    { name: 'terminal', label: 'Terminal stage · supersonic · fins ×4', prims: TS },
    { name: 'body', label: '3M-54 Kalibr · Ø 0.533 m', prims: BD },
    { name: 'wings', label: 'Wings ×2 · pop-out · 3.1 m', prims: wingsP({}), dyn: wingsP, show: st => (st.wing === undefined ? 1 : st.wing) > .02 },
    { name: 'fins', label: 'Tail fins ×4 · folding', prims: finsP({}), dyn: finsP },
    { name: 'inlet', label: 'Air intake · ventral', prims: IN },
    { name: 'booster', label: 'Booster · solid', prims: BO, show: st => st.booster !== false },
  ] };
}
/* 533 mm torpedo, stowed on a rack (the boats' X-ray): 6.2 m closed shell. Origin mid-body, nose +Z. */
function torpedo533() {
  const r = .2665, z0 = -3.1, z1 = 3.1, NS = [], BD = [], TL = [];
  NS.push(lathe([0, 0, z1 - .42], FZ, [[0, r], [.18, r * .94], [.3, r * .78], [.38, r * .5], [.42, 0]], { n: 20, gen: 4, rings: [0, 2] }));
  BD.push(lathe([0, 0, z0 + .95], FZ, [[0, r], [z1 - .42 - z0 - .95, r]], { n: 20, gen: 5, rings: [0, 1] }));
  for (const z of [-1.3, .4, 1.8]) BD.push(ringW([0, 0, z], FZ, r + .003, fn({ n: 18 })));
  TL.push(lathe([0, 0, z0 + .12], FZ, [[0, .14], [.4, .19], [.83, r]], { n: 18, gen: 4, rings: [0, 2] }));
  TL.push(lathe([0, 0, z0], FZ, [[0, .2], [.28, .2]], { n: 16, gen: 0, rings: [0, 1], sil: false }));
  for (const d of [45, 135, 225, 315]) { const a = d * DEG, c = Math.cos(a), s = Math.sin(a); TL.push(panel([[c * .15, s * .15, z0 + .5], [c * .21, s * .21, z0 + .26], [c * .21, s * .21, z0 + .02], [c * .13, s * .13, z0 + .02]], { edge: .9 })); }
  return { name: 'torpedo533', LEN: 6.2, parts: [
    { name: 'nose', label: 'Nose · homing head', prims: NS },
    { name: 'body', label: 'Torpedo · 533 mm', prims: BD },
    { name: 'tail', label: 'Afterbody · shrouded propulsor', prims: TL },
  ] };
}
/* VPT cell canister, closed: canister-local, top centre at the origin, axis down -Y (as mk41_can) */
function vptCan() {
  const L = 6.35, r = .3, P = [];
  P.push(lathe([0, -L, 0], FY, [[0, r], [L, r]], { n: 18, gen: 6, caps: true, rings: [0, 1] }));
  for (const y of [-.3, -2.1, -4.2, -6.05]) P.push(lathe([0, y - .06, 0], FY, [[0, r + .025], [.12, r + .025]], fn({ n: 18, gen: 0, rings: [0, 1] })));
  P.push(lathe([0, 0, 0], FY, [[0, r - .06], [.04, r - .06], [.05, 0]], fn({ n: 16, gen: 0, rings: [0] })));
  return { name: 'vpt_can', LEN: L, parts: [{ name: 'canister', label: 'Cell canister · Tomahawk · closed', prims: P }] };
}

/* ================================================================ wrecks
   wreckOf(model, {seed, k}) -> the same model with every part displaced and tilted about its centre
   (heavy tall parts fall further), the whole settled and listed. st.wreck (0..1, default k or 1)
   animates from intact to wrecked. */
const HEAVY = /launcher|array|mast|turret|boom|jib|column|search|rotor|island|super|stacks|radome|tower|lantern|gun|house/;
export function wreckOf(model, o) {
  o = o || {};
  const rnd = M3.rng(((o.seed || 7) * 7919 + 13) >>> 0), k0 = o.k === undefined ? 1 : o.k;
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const info = model.parts.map(p => {
    const [a, b] = GEO.bounds(p), T0 = p.xf ? p.xf({}) : X.make(), ok = a[0] <= b[0];
    const c = ok ? X.ap(T0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]) : [0, 0, 0];
    if (!ok) return { c, ext: 1 };
    for (let q = 0; q < 3; q++) { mn[q] = Math.min(mn[q], c[q]); mx[q] = Math.max(mx[q], c[q]); }
    return { c, ext: Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2]) };
  });
  const L = Math.max(mx[0] - mn[0], mx[2] - mn[2], 1), H = Math.max(mx[1] - mn[1], .5);
  const gp = (rnd() - .5) * .09, gr = (rnd() < .5 ? -1 : 1) * (.04 + .06 * rnd()), settle = -Math.min(.5, .06 * H + .12);
  const parts = model.parts.map((p, i) => {
    const { c, ext } = info[i], heavy = HEAVY.test(p.name), tyre = /wheel|tyre/.test(p.name);
    const ang = (heavy ? 14 + 18 * rnd() : 2 + 8 * rnd()) * DEG * Math.min(1, 6 / Math.max(1, ext) + .45);
    const axis = V.norm([rnd() - .5, (rnd() - .5) * .3, rnd() - .5]);
    const drop = -Math.min(Math.max(0, c[1]) * (heavy ? .16 : .05), heavy ? 2.5 : .6) - (tyre ? .28 : 0);
    const d = [(rnd() - .5) * L * (heavy ? .06 : .025), drop, (rnd() - .5) * L * (heavy ? .06 : .025)];
    const base = p.xf;
    const W = k => {
      const G = X.make(R.mul(R.x(gp * k), R.z(gr * k)), [0, settle * k, 0]);
      const Rm = SA.Rax(axis, ang * k), rc = R.ap(Rm, c);
      return X.mul(G, X.make(Rm, [c[0] + d[0] * k - rc[0], c[1] + d[1] * k - rc[1], c[2] + d[2] * k - rc[2]]));
    };
    return O(p, { xf: st => { const k = st.wreck === undefined ? k0 : st.wreck; const w = W(k); return base ? X.mul(w, base(st)) : w; } });
  });
  return O(model, { name: (model.name || 'model') + '_wreck', wreck: true, parts });
}

/* ================================================================ registry */
export const UNIT_MODELS = { tel: HD.tel, radar: HD.radar, pantsir: HD.pantsir, drone: HD.drone, catapult: HD.catapult, destroyer: HD.destroyer, carrier: HD.carrier, helo: HD.helo, fighter: HD.fighter };
export const EXTRA_MODELS = {
  transloader, hq, depot, port, lighthouse, radar_hill: radarHill, airfield,
  tlc, pantsir_missile: pantsirMissile, strike_missile: strikeMissile, aam, shell, mk41_can: mk41Can,
  essm, slam, hellfire,
  oniks: HD.oniks, oniks_booster: HD.oniksBooster, sm6: HD.sm6, mk72: HD.mk72,
  // the second wave of units and their munitions
  aew, ssn, ssk, bal, kh35, kalibr, torpedo533, vpt_can: vptCan,
  // the projectile names data/units.js uses
  tomahawk: strikeMissile, sam57e6: pantsirMissile, aim120: aam,
};
export const MODEL_ALIASES = { tomahawk: 'strike_missile', sam57e6: 'pantsir_missile', aim120: 'aam' };
const cache = f => { let m = null; return () => cloneModel(m || (m = f())); };
export const CUT_MODELS = {
  tel_cut: cache(telCut), radar_cut: cache(radarCut), pantsir_cut: cache(pantsirCut), destroyer_cut: cache(destroyerCut),
  helo_cut: cache(heloCut), fighter_cut: cache(fighterCut), drone_cut: cache(droneCut), oniks_cut: cache(oniksCut), sm6_cut: cache(sm6Cut),
  aew_cut: cache(aewCut), ssn_cut: cache(ssnCut), ssk_cut: cache(sskCut), bal_cut: cache(balCut),
};
export const ALL_MODELS = O(UNIT_MODELS, EXTRA_MODELS, CUT_MODELS);
export function makeModel(key) { const f = ALL_MODELS[key]; if (!f) throw new Error('unknown model ' + key); return f(); }

/* state fields: [min, max, default] numbers, true/false booleans (the default) */
const ANG = [-PI, PI, 0];
export const MODEL_STATES = {
  tel: { elev: [0, 1.535, 0], dep: [0, 1, 1], capL: [0, 1, 0], capR: [0, 1, 0], wheel: [0, TAU, 0], fan: [0, TAU, 0] },
  radar: { ant: ANG, mast: [0, 1, 1], wheel: [0, TAU, 0], fan: [0, TAU, 0] },
  pantsir: { yaw: ANG, pitch: [-.1, 1.4, .2], sAnt: ANG, fire: [0, 1, 0], wheel: [0, TAU, 0] },
  drone: { prop: [0, TAU, 0], gimYaw: ANG, gimPitch: [-1.5, .3, -.4] },
  catapult: { carriage: [0, 1, 0] },
  destroyer: { sps: ANG, gunYaw: [-2.6, 2.6, 0], gunPitch: [-.1, 1.12, 0], ciwsSpin: [0, TAU, 0], hangar: [0, 1, 0] },
  carrier: { radar: ANG },
  helo: { rotor: [0, TAU, 0], trotor: [0, TAU, 0], droop: [0, 1, 0] },
  fighter: { fan: [0, TAU, 0], nozzle: [0, 1, 0], ab: [0, 1, 0] },
  oniks: { wing: [0, 1, 1], fin: [0, 1, 1], booster: true, cover: false },
  sm6: { booster: true },
  transloader: { slew: [-PI, PI, TZ_HOME.slew], luff: [-.2, 1.3, TZ_HOME.luff], ext: [0, 4.6, 0], cable: [.2, 8, TZM.HOME.cable], dep: [0, 1, 1], bedR: true, bedL: true, hookTlc: false, wheel: [0, TAU, 0] },
  lighthouse: { lamp: [0, TAU, 0] },
  radar_hill: { ant: [0, TAU, 0] },
  port: { slewA: ANG.slice(0, 2).concat([PORT.CRANES[0].slew]), luffA: [.15, 1.3, PORT.CRANES[0].luff], dropA: [2, 30, PORT.CRANES[0].drop], slewB: ANG.slice(0, 2).concat([PORT.CRANES[1].slew]), luffB: [.15, 1.3, PORT.CRANES[1].luff], dropB: [2, 30, PORT.CRANES[1].drop] },
  tlc: { cap: true },
  pantsir_missile: { booster: true, fin: [0, 1, 1] },
  strike_missile: { wing: [0, 1, 1], fin: [0, 1, 1], inlet: [0, 1, 1], booster: false },
  slam: { wing: [0, 1, 1] },
  aew: { dome: [0, TAU, 0], prop: [0, TAU, 0], fold: [0, 1, 0] },
  ssn: { mast: [0, 1, 1], vptA: [0, 1, 0], vptB: [0, 1, 0], prop: [0, TAU, 0] },
  ssk: { mast: [0, 1, 1], prop: [0, TAU, 0] },
  bal: { elev: [0, BL.ELEV, 0], dep: [0, 1, 1], n: [0, 8, 8], wheel: [0, TAU, 0] },
  kh35: { wing: [0, 1, 1], fin: [0, 1, 1], booster: true },
  kalibr: { wing: [0, 1, 1], fin: [0, 1, 1], booster: true },
};
for (const k of ['tel', 'radar', 'pantsir', 'destroyer', 'helo', 'fighter', 'drone', 'oniks', 'sm6', 'aew', 'ssn', 'ssk', 'bal']) MODEL_STATES[k + '_cut'] = O(MODEL_STATES[k], { xray: false });
MODEL_STATES.tomahawk = MODEL_STATES.strike_missile; MODEL_STATES.sam57e6 = MODEL_STATES.pantsir_missile;
MODEL_STATES.depot = { xray: false }; MODEL_STATES.radar_hill.xray = false;

export const MODEL_INFO = {
  tel: { name: 'K340P TEL · Bastion-P', kind: 'unit', size: [13.8, 3.1, 3.4], s: [.035, .08, .25] },
  radar: { name: 'Monolith-B radar', kind: 'unit', size: [13.8, 3.1, 12.3], s: [.035, .08, .25] },
  pantsir: { name: 'Pantsir-S1', kind: 'unit', size: [10.9, 2.5, 4.7], s: [.03, .07, .2] },
  drone: { name: 'Orlan-10', kind: 'unit', size: [2.0, 3.1, .6], s: [.008, .02, .06] },
  catapult: { name: 'Orlan-10 launch rail', kind: 'unit', size: [4.9, 1.9, 2.3], s: [.015, .04, .1] },
  destroyer: { name: 'DDG-51 Arleigh Burke Flight IIA', kind: 'unit', size: [155.1, 20, 47.1], s: [.3, .7, 2] },
  carrier: { name: 'CVN Nimitz class', kind: 'unit', size: [332.8, 76.8, 61.5], s: [.8, 2, 5] },
  helo: { name: 'MH-60R Seahawk', kind: 'unit', size: [19.8, 16.4, 5.2], s: [.04, .1, .3] },
  fighter: { name: 'F/A-18E Super Hornet', kind: 'unit', size: [18.3, 13.6, 4.9], s: [.04, .1, .3] },
  transloader: { name: 'K342P transloader', kind: 'unit', size: [14.0, 3.1, 3.6], s: [.035, .08, .25] },
  hq: { name: 'Coast command post', kind: 'structure', size: [28, 28, 21.6], s: [.035, .12, .5] },
  depot: { name: 'Munition depot', kind: 'structure', size: [66, 96, 8.8], s: [.18, .45, 1.2] },
  port: { name: 'Harbour', kind: 'structure', size: [283, 254, 40], s: [.5, 1.2, 3] },
  lighthouse: { name: 'Lighthouse', kind: 'structure', size: [31, 31, 29.2], s: [.06, .15, .45] },
  radar_hill: { name: 'Radar station', kind: 'structure', size: [40, 60, 28.3], s: [.1, .25, .7] },
  airfield: { name: 'Airfield', kind: 'structure', size: [2500, 424, 26.4], s: [.6, 1.6, 5] },
  tlc: { name: 'TLC · 3M55', kind: 'munition', size: [9.6, 1.1, 1.1], s: [.025, .06, .18] },
  oniks: { name: 'P-800 Oniks · 3M55', kind: 'munition', size: [8.9, 1.76, .7], s: [.02, .05, .15] },
  oniks_booster: { name: 'Oniks booster · spent', kind: 'munition', size: [2.84, .5, .5], s: [.01, .025, .07] },
  sm6: { name: 'RIM-174 SM-6', kind: 'munition', size: [6.55, 1.57, .53], s: [.015, .04, .12] },
  mk72: { name: 'Mk 72 booster · spent', kind: 'munition', size: [1.73, 1.57, .53], s: [.01, .03, .08] },
  pantsir_missile: { name: '57E6', kind: 'munition', size: [3.2, .43, .43], s: [.007, .018, .05] },
  strike_missile: { name: 'Strike missile · Tomahawk-class', kind: 'munition', size: [5.56, 2.67, .7], s: [.015, .04, .12] },
  aam: { name: 'AIM-120 AMRAAM', kind: 'munition', size: [3.66, .64, .64], s: [.008, .02, .06] },
  shell: { name: '5"/62 projectile', kind: 'munition', size: [.66, .13, .13], s: [.003, .008, .02] },
  mk41_can: { name: 'Mk 41 canister', kind: 'munition', size: [.63, .63, 6.7], s: [.03, .07, .2] },
  essm: { name: 'RIM-162 ESSM', kind: 'munition', size: [3.66, .65, .65], s: [.008, .02, .06] },
  slam: { name: 'AGM-84H SLAM-ER', kind: 'munition', size: [4.37, 2.4, 2.4], s: [.01, .025, .08] },
  hellfire: { name: 'AGM-114 Hellfire', kind: 'munition', size: [1.63, .33, .33], s: [.004, .01, .03] },
  aew: { name: 'E-2D Advanced Hawkeye', kind: 'unit', size: [17.6, 24.56, 5.58], s: [.04, .1, .3] },
  ssn: { name: 'SSN Virginia class · Block III', kind: 'unit', size: [114.9, 10.4, 17.2], s: [.2, .5, 1.4] },
  ssk: { name: 'Kilo class · Project 636.3', kind: 'unit', size: [73.8, 9.9, 14.0], s: [.14, .35, 1] },
  bal: { name: 'Bal · 3K60 launcher', kind: 'unit', size: [14.0, 3.1, 3.6], s: [.035, .08, .25] },
  kh35: { name: 'Kh-35U', kind: 'munition', size: [4.4, 1.33, .42], s: [.01, .025, .07] },
  kalibr: { name: '3M-54 Kalibr', kind: 'munition', size: [8.22, 3.1, .53], s: [.016, .04, .12] },
  torpedo533: { name: 'Torpedo · 533 mm', kind: 'munition', size: [6.2, .53, .53], s: [.012, .03, .09] },
  vpt_can: { name: 'VPT cell canister', kind: 'munition', size: [.6, .6, 6.35], s: [.012, .03, .09] },
};
for (const [a, k] of Object.entries(MODEL_ALIASES)) { MODEL_INFO[a] = MODEL_INFO[k]; }
for (const k of Object.keys(CUT_MODELS)) { const b = k.replace(/_cut$/, ''); MODEL_INFO[k] = O(MODEL_INFO[b], { name: MODEL_INFO[b].name + ' · cutaway', kind: 'cut', base: b }); }

export default EXTRA_MODELS;
