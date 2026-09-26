/* DDG-51 Arleigh Burke Flight IIA: the ship's structure as data (hull, decks, bulkheads, plating, stiffening,
   compartments), for the blast bench to build its lattice from. Standalone, no DOM, no GL; importable from Node.

   Ship frame: x forward, y up, z starboard; origin midships (half the length overall) on the design waterline
   (y = 0). Metres. The game model (HD.destroyer in reference/films/common/hd_sea_air.js, underwater body in
   game/src/data/models.js) uses +Z bow, +X starboard: model = [z, y, x] (toModel / fromModel). The hull form here
   IS the game model's (same deck line, deck and waterline half-breadths, knuckle, keel line, section exponents,
   sonar dome, skeg, bilge keels), so the structure lines up with what the player sees.

   Frames: frame k at x = FP - k FRAME_SP, numbered aft from the forward perpendicular (the stem at the waterline).

   What a panel is:
     { i, kind, part, poly: [[x y z] ...] (planar polygon, wound so its normal is n)
                    | strip: [a, b] (two polylines with equal point counts at two frame stations; quads a[k] a[k+1]
                                     b[k+1] b[k], ruled between them; the curved shell),
       n (unit normal; for strips the mean outward normal), ax (0/1/2: the plate lies in an x/y/z plane; -1 not),
       area (m^2), c (centroid),
       t (plate thickness, mm), mat (MATS key), stiff { dir, s (m), sec } (the close stiffeners, in-plane),
       frame { dir, s, sec } | null (the heavy members crossing them), sides: [on +n, on -n] (compartment indices),
       wet (sea on one side), open (an opening, no plate: the uptake exhausts), door (hangar doors) }
   Compartments are closed volumes: every boundary is a panel, and each panel has one space on each side. The
   partition itself is compAt(x, y, z); panels were cut on it and their sides read from it, so the two agree.

   Numbers that are not public are estimates (see BURKE.md). Nothing here models weapons or sensors; spaces are
   only named. */

const PI = Math.PI;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const ssE = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = v => Math.round(v * 1000) / 1000;

/* ================================================================ frames */
export const FRAME_SP = 2.44;                       // m (8 ft), transverse frame spacing (assumed, see BURKE.md)
export const FP = 70.6;                             // forward perpendicular: the stem at the waterline
export const frameX = k => FP - k * FRAME_SP;
export const frameAt = x => (FP - x) / FRAME_SP;

/* ================================================================ hull form (the game model's) */
const XB = 77.6, XS = -77.6, XST = FP;                // deck at the bow, transom, stem at the waterline
export const deckY = x => { const u = x / XB; return 6.5 + 1.1 * u + 2.7 * Math.pow(Math.max(0, (u - .3) / .7), 2); };
export const deckHB = x => { const u = x / XB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); if (u < -.55) return 10 * (1 - .14 * Math.pow((-.55 - u) / .45, 1.5)); return 10; };
export const wlHB = x => { if (x >= XST) return 0; const u = x / XB, ue = XST / XB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
const stemY = x => x <= XST ? 0 : deckY(XB) * Math.pow(Math.min(1, (x - XST) / (XB - XST)), 1 / 1.35);
export const keelY = x => x > 52 ? -6.3 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 52) / (XST - 52), 2))) : x < -28 ? -6.3 + 5.1 * ssE(-28, -60, x) : -6.3;
const secE = x => x > 16 ? mix(4.2, 2.1, ssE(16, 64, x)) : x < -20 ? mix(4.2, 6.5, ssE(-20, -64, x)) : 4.2;
export const toModel = p => [p[2], p[1], p[0]];
export const fromModel = p => [p[2], p[1], p[0]];

/* a point on the starboard half-section at x, girth parameter t in [0, 1]: 0 the keel on the centre line, .5 the
   waterline, .75 the knuckle, 1 the deck edge. Returns [z, y]. Below the waterline a superellipse (the model's
   secPt), above it the flared side in two straight runs. y and z never decrease with t. */
export function secAt(x, t) {
  if (t <= .5) {
    const b = wlHB(x), k = keelY(x);
    if (b <= 0 || k >= 0) return [0, stemY(x)];
    const th = t * PI, e = secE(x);
    return [b * Math.pow(Math.sin(th), 2 / e), k * Math.pow(Math.max(0, Math.cos(th)), 2 / e)];
  }
  const w0 = wlHB(x), y0 = stemY(x), b = deckHB(x), d = deckY(x), yk = d - Math.min(1.6, (d - y0) * .3), zk = w0 + (b - w0) * .9;
  if (t <= .75) { const u = (t - .5) / .25; return [mix(w0, zk, u), mix(y0, yk, u)]; }
  const u = (t - .75) / .25; return [mix(zk, b, u), mix(yk, d, u)];
}
/* the hull's half-breadth at (x, y), -1 where the hull is not (above the deck, under the keel, past the ends) */
export function halfBreadth(x, y) {
  if (x < XS || x > XB) return -1;
  const d = deckY(x); if (y > d) return -1;
  if (y >= 0 || x >= XST) {
    const y0 = stemY(x); if (y < y0) return -1;
    const w0 = wlHB(x), b = deckHB(x), yk = d - Math.min(1.6, (d - y0) * .3), zk = w0 + (b - w0) * .9;
    if (y <= yk) return yk > y0 ? mix(w0, zk, (y - y0) / (yk - y0)) : zk;
    return mix(zk, b, (y - yk) / Math.max(1e-6, d - yk));
  }
  const k = keelY(x); if (y < k) return -1;
  const b = wlHB(x), e = secE(x);
  return b * Math.pow(Math.max(0, 1 - Math.pow(y / k, e)), 1 / e);
}
function tAt(x, f) {
  if (f(secAt(x, 0)) >= 0) return 0;
  if (f(secAt(x, 1)) < 0) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(secAt(x, m)) >= 0) hi = m; else lo = m; }
  return hi;
}
const tAtY = (x, y) => tAt(x, p => p[1] - y);
const tAtZ = (x, z) => tAt(x, p => p[0] - z);
/* the section's starboard line between two girth parameters, finely ([z, y] points) */
function secLine(x, t0, t1) {
  const ts = [t0], st = 1 / 96;
  for (let t = (Math.floor(t0 / st) + 1) * st; t < Math.min(t1, .5); t += st) if (t > t0 + 1e-9 && t < t1 - 1e-9) ts.push(t);
  for (const k of [.5, .75]) if (k > t0 + 1e-9 && k < t1 - 1e-9) ts.push(k);
  ts.push(t1); ts.sort((a, b) => a - b);
  return ts.map(t => secAt(x, t));
}
/* sonar dome (the model's: a spindle under the forefoot, rubber window, flooded) */
const DOME = { x0: 50.1, x1: 68.9, y: -6.75, r: 2.1 };
const domeR = x => (x <= DOME.x0 || x >= DOME.x1) ? 0 : DOME.r * Math.sin(PI * (x - DOME.x0) / (DOME.x1 - DOME.x0));
const inDome = (x, y, z) => { const r = domeR(x); return r > 0 && (y - DOME.y) ** 2 + z * z < r * r; };

/* ================================================================ materials, sections, plating */
// E Pa, sy yield Pa, su tensile Pa, ef elongation at fracture, bench: the blast bench's MATS key (hts: add it)
export const MATS = {
  HY80:   { name: 'HY-80',  E: 207e9, sy: 552e6, su: 690e6, ef: .20, rho: 7850, bench: 'hsla', note: 'quenched & tempered, 80 ksi yield; keel and sheer strakes, deck stringer' },
  HSLA80: { name: 'HSLA-80', E: 207e9, sy: 552e6, su: 620e6, ef: .20, rho: 7850, bench: 'hsla', note: 'precipitation-hardened (ASTM A710 class), 80 ksi; most of the shell, strength deck, superstructure' },
  HTS:    { name: 'HTS',    E: 204e9, sy: 324e6, su: 490e6, ef: .22, rho: 7850, bench: 'hts',  note: 'higher-tensile steel (MIL-S-22698), 47 ksi; 2nd deck, bulkheads, shell at the ends' },
  OS:     { name: 'OS',     E: 200e9, sy: 235e6, su: 400e6, ef: .22, rho: 7850, bench: 'mild', note: 'ordinary strength (mild) steel, 34 ksi; lower decks, platforms, partitions' },
  SDRW:   { name: 'Sonar dome window', E: 5e9, sy: 60e6, su: 90e6, ef: .10, rho: 1500, bench: null, note: 'steel-reinforced rubber window, flooded behind; not structural steel' },
};
// stiffener and frame sections (mm): T = web h x tw with flange bf x tf; FB flat bar. A m^2 (without plate)
const T = (h, tw, bf, tf) => ({ type: 'T', h, tw, bf, tf, A: ((h - tf) * tw + bf * tf) * 1e-6 });
export const SECS = {
  T8x4: T(203, 6.4, 102, 9.5),     // bottom longitudinals
  T6x4: T(152, 6.4, 102, 9.5),     // side, deck longitudinals, bulkhead stiffeners
  T5x3: T(127, 4.8, 76, 7.9),      // lower decks, SPY house
  T4x3: T(102, 4.8, 76, 6.4),      // deckhouse, platforms
  FB4:  { type: 'FB', h: 102, tw: 9.5, bf: 0, tf: 0, A: 102 * 9.5e-6 },   // stack casings
  W18:  T(457, 9.5, 178, 15.9),    // shell web frames
  B12:  T(305, 7.9, 127, 12.7),    // main deck beams
  B10:  T(254, 6.4, 102, 9.5),     // lower deck beams
  B8:   T(203, 6.4, 102, 7.9),     // deckhouse beams
};
const P = (mat, t) => ({ mat, t });
const MIDX = 35.5;                                   // the midbody (~0.5 L) where the heavy plating runs
const mid = x => x >= -MIDX && x <= MIDX;
/* the plating schedule (mm), approximate: [region, mid 0.5 L, ends] for BURKE.md and the viewer */
export const SCHEDULE = [
  ['Keel strake (1.8 m wide)', 'HY-80 19.1', 'HY-80 15.9'],
  ['Bottom', 'HSLA-80 12.7', 'HSLA-80 11.1 (12.7 under the bow, slamming)'],
  ['Bilge (inner bottom to 4th deck)', 'HSLA-80 11.1', 'HSLA-80 9.5'],
  ['Waterline belt (4th to 3rd deck)', 'HSLA-80 12.7', 'HSLA-80 9.5'],
  ['Side (3rd deck to sheer strake)', 'HSLA-80 9.5', 'HTS 7.9 (HSLA-80 11.1 in the bow flare)'],
  ['Sheer strake (1.8 m below the deck edge)', 'HY-80 19.1', 'HSLA-80 12.7'],
  ['Transom', 'HSLA-80 9.5', ''],
  ['Main deck stringer (1.5 m inboard of the edge)', 'HY-80 19.1', 'HSLA-80 12.7'],
  ['Main deck', 'HSLA-80 12.7', 'HSLA-80 9.5 (flight deck 9.5)'],
  ['2nd deck (damage control deck)', 'HTS 7.9', 'HTS 7.9'],
  ['3rd deck, 4th deck, platforms', 'OS 6.4', 'OS 6.4'],
  ['Inner bottom (tank top)', 'HTS 9.5', 'HTS 9.5'],
  ['Centre vertical keel', 'HSLA-80 12.7', ''],
  ['Watertight bulkheads', 'HTS 9.5 below the 3rd deck, 7.9 above', 'collision bulkhead HSLA-80 11.1 / 9.5'],
  ['Machinery space bulkheads', 'HTS 9.5 throughout', ''],
  ['VLS enclosures (walls, floor)', 'HSLA-80 9.5, floor 12.7', ''],
  ['Deckhouse walls (main deck level)', 'HSLA-80 7.9', ''],
  ['SPY house walls (array faces)', 'HSLA-80 9.5', ''],
  ['Deckhouse decks and roofs', 'HSLA-80 7.9 roofs, 6.4 inner decks', ''],
  ['Hangar walls, stack casings', 'HTS 6.4, casings 6.4', 'hangar doors 3.2'],
];
const dirX = [1, 0, 0], dirY = [0, 1, 0], dirZ = [0, 0, 1];
const ST = (dir, s, sec) => ({ dir, s, sec });
function shellProps(label, x) {
  const m = mid(x), F = ST(null, FRAME_SP, 'W18');
  const L = (s, sec) => ST(dirX, s, sec);
  switch (label) {
    case 'keel':   return { ...(m ? P('HY80', 19.1) : P('HY80', 15.9)), stiff: L(.61, 'T8x4'), frame: F };
    case 'bottom': return { ...(m || (x > MIDX && x < 63.3) ? P('HSLA80', 12.7) : P('HSLA80', 11.1)), stiff: L(.61, 'T8x4'), frame: F };
    case 'bilge':  return { ...(m ? P('HSLA80', 11.1) : P('HSLA80', 9.5)), stiff: L(.61, 'T8x4'), frame: F };
    case 'belt':   return { ...(m ? P('HSLA80', 12.7) : P('HSLA80', 9.5)), stiff: L(.61, 'T6x4'), frame: F };
    case 'side':   return { ...(x > 53.5 ? P('HSLA80', 11.1) : m ? P('HSLA80', 9.5) : P('HTS', 7.9)), stiff: L(.76, 'T6x4'), frame: F };
    case 'sheer':  return { ...(m ? P('HY80', 19.1) : P('HSLA80', 12.7)), stiff: L(.76, 'T6x4'), frame: F };
  }
  throw new Error('shell label ' + label);
}

/* ================================================================ subdivision */
export const LV = { IB: -5.1, P4: -1.6, VF: -.4, D3: 1.2, D2: 3.9, PF: 6.8 };   // deck heights (m above the waterline)
export const DECKS = [
  { id: 'IB', name: 'Inner bottom (tank top)', y: LV.IB },
  { id: 'P4', name: '4th deck / 1st platform', y: LV.P4 },
  { id: 'D3', name: '3rd deck', y: LV.D3 },
  { id: 'D2', name: '2nd deck (damage control deck)', y: LV.D2 },
  { id: 'PF', name: 'Forecastle platform (forward of the collision bulkhead)', y: LV.PF },
  { id: 'MAIN', name: 'Main (1st) deck: strength deck, sheered 5.4 m aft to 10.3 m at the bow; flight deck aft of fr 51', y: null },
  { id: 'D01', name: '01 level (deckhouse roof)', y: 10.3 },
  { id: 'D02', name: '02 level (SPY house)', y: 13.03 },
  { id: 'D03', name: '03 level (SPY house, pilot house)', y: 15.94 },
  { id: 'SPYR', name: 'SPY house roof', y: 19.4 },
  { id: 'HGR', name: 'Hangar overhead', y: 11.4 },
  { id: 'AHR', name: 'Aft deckhouse roof', y: 13.2 },
];
const DB = 'DB';
// watertight transverse bulkheads (13) and the zones between them, forward to aft. c: the spaces from the bottom up
// between the zone's levels lv; [id, name, use] (use: US Navy compartment letter), DB = double bottom split P/S
const BHD_K = [3, 7, 11, 14, 17, 21, 25, 32, 40, 43, 47, 51, 55];
export const BULKHEADS = BHD_K.map((k, i) => ({ k, x: r3(frameX(k)), name: ['Collision bulkhead', 'Sonar / gun magazine', 'Gun magazine / forward VLS', 'Forward VLS aft',
  'Berthing', 'AMR 1 forward', 'MER 1 forward', 'MER 1 / MER 2', 'MER 2 aft', 'Aft VLS aft', 'Hangar zone', 'Hangar aft', 'Shaft struts / steering'][i] }));
const ZX = [XB, ...BULKHEADS.map(b => b.x), XS];
const ZONES = [
  { lv: [LV.P4, LV.D2, LV.PF], c: [['FPK', 'Forepeak tank', 'W'], ['CHAIN', 'Chain locker · stores', 'A'], ['BOSN', "Bosun's store", 'A'], ['WNDL', 'Windlass room', 'Q']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['SON1', 'Sonar equipment · lower', 'Q'], ['SON2', 'Sonar equipment room', 'C'], ['ST2', 'Stores · forward', 'A'], ['BTH2', 'Berthing · forward', 'L']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['MAG1', 'Gun magazine · lower', 'M'], ['MAG2', 'Gun magazine', 'M'], ['GLR', 'Gun loading room', 'M'], ['BTH3', 'Berthing · gun', 'L']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['FO4', 'Fuel · forward', 'F'], ['PMP4', 'Pump room · forward', 'E'], ['BTH4', 'Berthing · VLS wings', 'L'], ['PAS4', 'Passage · VLS wings', 'L']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['FO5', 'Fuel', 'F'], ['ST5', 'Stores', 'A'], ['BTH5', 'Berthing', 'L'], ['MESS5', 'Mess · CPO', 'L']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['FO6', 'Fuel', 'F'], ['REF6', 'Refrigerated stores', 'A'], ['BTH6', 'Berthing', 'L'], ['OFF6', 'Offices', 'Q']] },
  { lv: [LV.IB, LV.D2], c: [DB, ['AMR1', 'Auxiliary machinery room 1', 'E'], ['WR7', 'Wardroom · officers', 'L']] },
  { lv: [LV.IB, LV.D2], c: [DB, ['MER1', 'Main engine room 1', 'E'], ['GAL8', 'Galley · crew mess', 'L']] },
  { lv: [LV.IB, LV.D2], c: [DB, ['MER2', 'Main engine room 2', 'E'], ['BTH9', 'Berthing · midships', 'L']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['AMR2', 'Auxiliary machinery room 2', 'E'], ['ST10', 'Stores · VLS wings', 'A'], ['BTH10', 'Berthing · VLS wings', 'L'], ['PAS10', 'Passage · VLS wings', 'L']] },
  { lv: [LV.IB, LV.P4, LV.D3, LV.D2], c: [DB, ['FO11', 'Fuel · aft', 'F'], ['AVS11', 'Aviation stores', 'A'], ['BTH11', 'Berthing · aft', 'L'], ['HSP11', 'Helicopter support', 'Q']] },
  { lv: [LV.P4, LV.D3], c: [['JP12', 'JP-5 tanks', 'J'], ['ST12', 'Stores · aft', 'A'], ['WS12', 'Workshop · aviation', 'Q']] },
  { lv: [LV.D3], c: [['VD13', 'Void · over the shaft struts', 'V'], ['FDS13', 'Flight deck support · stores', 'A']] },
  { lv: [LV.D3], c: [['APK', 'Aft peak tank', 'W'], ['STR', 'Steering gear room', 'Q']] },
];
ZONES.forEach((z, i) => { z.no = i + 1; z.x1 = ZX[i]; z.x0 = ZX[i + 1]; });
function zoneAt(x) { for (let i = 0; i < ZONES.length; i++) if (x >= ZONES[i].x0) return ZONES[i]; return ZONES[ZONES.length - 1]; }
// VLS enclosures: their own boxes from a floor up to the main deck, bounded by longitudinal bulkheads at +-hw
export const ENCL = [
  { id: 'VLSF', name: 'Mk 41 VLS enclosure · forward (32 cells)', use: 'M', x0: frameX(14), x1: frameX(12), hw: 4.6, floor: LV.VF },
  { id: 'VLSA', name: 'Mk 41 VLS enclosure · aft (64 cells)', use: 'M', x0: frameX(43), x1: -25.6, hw: 4.6, floor: LV.P4 },
];
// deckhouses (steel): main deck to the roof, inclined sides (half-width zb at the deck, zt at the roof)
const D01 = 10.3;
const HOUSE = {
  FH: { x0: 1.5, x1: 35.5, zb: 8.25, zt: 8.05, top: D01, yref: deckY(18.5) },
  MH: { x0: -23.5, x1: 1.5, zb: 6.25, zt: 6.0, top: D01, yref: deckY(-11) },
  AH: { x0: -53, x1: -34, zb: 8.6, zt: 8.25, top: 13.2, yref: deckY(-43.5) },
};
const hwOf = (H, y) => H.zb + (H.zt - H.zb) * (y - H.yref) / (H.top - H.yref);
const HG = { xf: -36.3, zi: .75, zo: 7.45, roof: 11.4 };                  // twin hangars in the aft house
const SPY = { y0: D01, y1: 19.4, inset: 1.3, lv: [13.03, 15.94] };         // the octagonal SPY house on the 01 level
const spyInset = y => SPY.inset * (y - SPY.y0) / (SPY.y1 - SPY.y0);
const OCT = [[1, 0, 31.0], [1, 1, 34.9], [0, 1, 8.0], [-1, 1, -4.2], [-1, 0, -8.1], [-1, -1, -4.2], [0, -1, 8.0], [1, -1, 34.9]];   // a x + b z <= c
const octHP = d => OCT.map(([a, b, c]) => [a, b, c - d * Math.hypot(a, b)]);
const inOct = (x, z, d) => octHP(d).every(([a, b, c]) => a * x + b * z <= c + 1e-9);
function octPoly(d) {                                // vertices (x, z), counter-clockwise seen from above (+y)... in (x,z)
  const L = octHP(d), out = [];
  for (let i = 0; i < 8; i++) {
    const [a1, b1, c1] = L[i], [a2, b2, c2] = L[(i + 1) % 8], det = a1 * b2 - a2 * b1;
    out.push([(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det]);
  }
  return out;
}
const STACKS = [{ id: 'UPT1', x: 2.2, name: 'Uptake casing · forward stack' }, { id: 'UPT2', x: -17.0, name: 'Uptake casing · aft stack' }];
const STK = { y0: D01, y1: 21.6 };
const stackAt = (s, y) => { const f = (y - STK.y0) / (STK.y1 - STK.y0); return { hw: mix(2.6, 2.05, f), xa: s.x - mix(4.2, 4.5, f), xf: s.x + mix(4.2, 2.2, f) }; };

/* ================================================================ compartments */
export const COMPS = [];
const CID = {};
function addComp(o) { o.idx = COMPS.length; COMPS.push(o); CID[o.id] = o.idx; return o.idx; }
const deckNo = y => y >= LV.D2 - 1e-6 ? '2' : y >= LV.D3 - 1e-6 ? '3' : y >= LV.P4 - 1e-6 ? '4' : y >= LV.IB - 1e-6 ? '5' : '6';
const navy = (deck, x1, pos, use) => `${deck}-${Math.max(0, Math.round(frameAt(x1)))}-${pos}-${use}`;
const AIR = addComp({ id: 'AIR', name: 'Outside · air', kind: 'outside' });
const SEA = addComp({ id: 'SEA', name: 'Outside · sea', kind: 'outside' });
const DOMEC = addComp({ id: 'DOME', name: 'Sonar dome (flooded)', kind: 'flooded', navy: navy('6', DOME.x1, 0, 'V') });
for (const Z of ZONES) {
  Z.ci = Z.c.map((c, L) => {
    const floor = L === 0 ? -99 : Z.lv[L - 1];
    if (c === DB) return ['P', 'S'].map((s, k) => addComp({ id: `DB${Z.no}${s}`, name: `Double bottom · ${s === 'P' ? 'port' : 'starboard'}`, kind: 'hull', zone: Z.no, tank: true, navy: navy('6', Z.x1, k ? 1 : 2, 'W') }));
    return addComp({ id: c[0], name: c[1], kind: 'hull', zone: Z.no, tank: 'WFJ'.includes(c[2]), navy: navy(deckNo(floor), Z.x1, 0, c[2]) });
  });
}
for (const e of ENCL) e.idx = addComp({ id: e.id, name: e.name, kind: 'enclosure', navy: navy(deckNo(e.floor), e.x1, 0, e.use) });
const HC = {
  FHA: addComp({ id: 'FHA', name: 'Deckhouse · main deck level · aft part', kind: 'house', navy: navy('1', frameX(21), 0, 'Q') }),
  FHF: addComp({ id: 'FHF', name: 'Deckhouse · main deck level · forward part', kind: 'house', navy: navy('1', HOUSE.FH.x1, 0, 'C') }),
  MH:  addComp({ id: 'MH', name: 'Midships deckhouse · uptakes · main deck level', kind: 'house', navy: navy('1', HOUSE.MH.x1, 0, 'Q') }),
  S1:  addComp({ id: 'SPY01', name: 'SPY house · 01 level', kind: 'house', navy: navy('01', 31, 0, 'C') }),
  S2:  addComp({ id: 'SPY02', name: 'SPY house · 02 level', kind: 'house', navy: navy('02', 31, 0, 'C') }),
  S3:  addComp({ id: 'SPY03', name: 'SPY house · 03 level · pilot house', kind: 'house', navy: navy('03', 31, 0, 'C') }),
  HGP: addComp({ id: 'HGP', name: 'Hangar · port', kind: 'house', navy: navy('1', HG.xf, 2, 'Q') }),
  HGS: addComp({ id: 'HGS', name: 'Hangar · starboard', kind: 'house', navy: navy('1', HG.xf, 1, 'Q') }),
  HGC: addComp({ id: 'HGC', name: 'Hangar · centre passage', kind: 'house', navy: navy('1', HG.xf, 0, 'L') }),
  HGF: addComp({ id: 'HGF', name: 'Hangar · forward space', kind: 'house', navy: navy('1', HOUSE.AH.x1, 0, 'Q') }),
  HWP: addComp({ id: 'HWP', name: 'Hangar wing passage · port', kind: 'house', navy: navy('1', HG.xf, 2, 'L') }),
  HWS: addComp({ id: 'HWS', name: 'Hangar wing passage · starboard', kind: 'house', navy: navy('1', HG.xf, 1, 'L') }),
  HGO: addComp({ id: 'HGO', name: 'Aft deckhouse · over the hangars', kind: 'house', navy: navy('01', HOUSE.AH.x1, 0, 'Q') }),
};
for (const s of STACKS) s.idx = addComp({ id: s.id, name: s.name, kind: 'house', navy: navy('01', s.x + 4.2, 0, 'T') });
const SPYC = [HC.S1, HC.S2, HC.S3];

/* which space holds the point (ship frame): a compartment index */
export function compAt(x, y, z) {
  if (x < XS || x > XB) return y < 0 ? SEA : AIR;
  const az = Math.abs(z), d = deckY(x);
  if (y > d) {
    if (y >= STK.y0 && y <= STK.y1) for (const s of STACKS) { const q = stackAt(s, y); if (az <= q.hw && x >= q.xa && x <= q.xf) return s.idx; }
    if (y >= SPY.y0 && y <= SPY.y1 && inOct(x, z, spyInset(y))) return SPYC[y < SPY.lv[0] ? 0 : y < SPY.lv[1] ? 1 : 2];
    let H = HOUSE.FH;
    if (y <= H.top && x >= H.x0 && x <= H.x1 && az <= hwOf(H, y)) return x < frameX(21) ? HC.FHA : HC.FHF;
    H = HOUSE.MH;
    if (y <= H.top && x >= H.x0 && x < H.x1 && az <= hwOf(H, y)) return HC.MH;
    H = HOUSE.AH;
    if (y <= H.top && x >= H.x0 && x <= H.x1 && az <= hwOf(H, y)) {
      if (y > HG.roof) return HC.HGO;
      if (x > HG.xf) return HC.HGF;
      if (az <= HG.zi) return HC.HGC;
      if (az <= HG.zo) return z < 0 ? HC.HGP : HC.HGS;
      return z < 0 ? HC.HWP : HC.HWS;
    }
    return AIR;
  }
  const hb = halfBreadth(x, y);
  if (hb < 0 || az > hb) return inDome(x, y, z) ? DOMEC : y < 0 ? SEA : AIR;
  for (const e of ENCL) if (x >= e.x0 && x <= e.x1 && az <= e.hw && y >= e.floor) return e.idx;
  const Z = zoneAt(x);
  let L = 0; while (L < Z.lv.length && y > Z.lv[L]) L++;
  const c = Z.ci[L];
  return Array.isArray(c) ? c[z < 0 ? 0 : 1] : c;
}

/* ================================================================ geometry helpers */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function newell(P) { let n = [0, 0, 0]; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n = add(n, cross(a, b)); } return mul(n, .5); }   // area vector
function polyCentroid(P) {         // area-weighted, by a fan
  let A = 0, c = [0, 0, 0]; const o = P[0];
  for (let i = 1; i < P.length - 1; i++) { const t = len(cross(sub(P[i], o), sub(P[i + 1], o))) / 2; A += t; c = add(c, mul(add(add(o, P[i]), P[i + 1]), t / 3)); }
  return A > 1e-12 ? mul(c, 1 / A) : mul(P.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / P.length);
}
// 2D polygon clipping (Sutherland-Hodgman) against a u + b v <= c
function clipHP(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
const clipRect = (poly, u0, u1, v0, v1) => { let p = poly; for (const h of [[-1, 0, -u0], [1, 0, u1], [0, -1, -v0], [0, 1, v1]]) { if (p.length < 3) return []; p = clipHP(p, ...h); } return p; };
const area2 = P => { let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return A / 2; };
function dedupe2(P) { const out = []; for (const p of P) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 1e-5) out.push(p); } while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) + Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-5) out.pop(); return out; }
// convex polygon minus convex polygon (half-planes), as convex pieces
function subtractConvex(poly, hps) {
  const out = []; let rest = poly;
  for (const [a, b, c] of hps) {
    if (rest.length < 3) break;
    const outside = clipHP(rest, -a, -b, -c);
    if (outside.length >= 3 && Math.abs(area2(outside)) > 1e-6) out.push(outside);
    rest = clipHP(rest, a, b, c);
  }
  return out;
}
function resample(pts, n) {       // polyline -> n + 1 points at equal arc length
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + len(sub(pts[i], pts[i - 1])));
  const tot = L[L.length - 1], out = [];
  if (tot < 1e-9) { for (let k = 0; k <= n; k++) out.push(pts[0].slice()); return out; }
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = tot * k / n; while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / Math.max(1e-12, L[j + 1] - L[j]); out.push(add(pts[j], mul(sub(pts[j + 1], pts[j]), sat(f))));
  }
  return out;
}
const polyLen = P => { let s = 0; for (let i = 1; i < P.length; i++) s += len(sub(P[i], P[i - 1])); return s; };
const inPlane = (d, n) => { if (!d) return null; const v = sub(d, mul(n, dot(d, n))); return len(v) < 1e-3 ? null : norm(v).map(r3); };

/* ================================================================ panels */
export const PANELS = [];
export const CHECK = { mixed: [], dropped: 0 };
const EPS = .03;
function sideAt(p, n) { return [compAt(p[0] + n[0] * EPS, p[1] + n[1] * EPS, p[2] + n[2] * EPS), compAt(p[0] - n[0] * EPS, p[1] - n[1] * EPS, p[2] - n[2] * EPS)]; }
function finishProps(pn, n) {
  pn.stiff = pn.stiff ? { dir: inPlane(pn.stiff.dir || (pn.kind === 'shell' ? dirX : dirY), n), s: pn.stiff.s, sec: pn.stiff.sec } : null;
  if (pn.frame) {
    let fd = pn.frame.dir;
    if (!fd && pn.stiff && pn.stiff.dir) fd = cross(n, pn.stiff.dir);
    pn.frame = { dir: inPlane(fd, n), s: pn.frame.s, sec: pn.frame.sec };
  }
}
/* a planar polygon (3D points). o: { kind, part, n (the wanted normal side), props (fn(c, sides) -> {mat t stiff frame}), sides?, open?, door? } */
function emitPoly(P, o) {
  if (P.length < 3) return null;
  let A = newell(P); const a = len(A); if (a < .02) { CHECK.dropped++; return null; }
  if (o.n && dot(A, o.n) < 0) { P = P.slice().reverse(); A = mul(A, -1); }
  const n = norm(A), c = polyCentroid(P);
  const sides = o.sides || sideAt(c, n);
  if (!o.sides && sides[0] === sides[1]) return null;
  if (!o.sides) {            // the piece should hold one space on each side: check a few points toward the corners
    for (let k = 0; k < P.length; k += Math.max(1, Math.floor(P.length / 4))) {
      const q = add(c, mul(sub(P[k], c), .85)), s2 = sideAt(q, n);
      if (s2[0] !== sides[0] || s2[1] !== sides[1]) { CHECK.mixed.push({ part: o.part, at: q.map(r3), a: sides, b: s2 }); break; }
    }
  }
  const pr = o.props(c, sides, n);
  const ax = n.findIndex(v => Math.abs(v) > .9999);          // 0 / 1 / 2 when the plate lies in an axis plane, else -1
  const pn = { i: PANELS.length, kind: o.kind, part: o.part, poly: P.map(p => p.map(r3)), n: n.map(v => r3(v)), ax, area: r3(a), c: c.map(r3), ...pr, sides };
  if (o.open) pn.open = true; if (o.door) pn.door = true;
  if (sides.includes(SEA)) pn.wet = true;
  finishProps(pn, n);
  PANELS.push(pn); return pn;
}
/* a curved shell strip between two polylines a (at xa) and b (at xb), same count */
function emitStrip(a, b, o) {
  let A = [0, 0, 0], pc = [0, 0, 0], at = 0, big = -1, bq = 0;
  for (let k = 0; k < a.length - 1; k++) {
    const q = [a[k], a[k + 1], b[k + 1], b[k]], v = newell(q), l = len(v);
    A = add(A, v); const qc = mul(add(add(q[0], q[1]), add(q[2], q[3])), .25); pc = add(pc, mul(qc, l)); at += l;
    if (l > big) { big = l; bq = k; }
  }
  if (at < .02) { CHECK.dropped++; return null; }
  if (o.n && dot(A, o.n) < 0) { const t = a; a = b; b = t; A = mul(A, -1); }
  const n = norm(A), c = mul(pc, 1 / at);
  // sides from the biggest quad (its centre lies on the surface within mm)
  const q = [a[bq], a[bq + 1], b[bq + 1], b[bq]], qn = norm(newell(q)), qc = mul(add(add(q[0], q[1]), add(q[2], q[3])), .25);
  const sides = o.sides || sideAt(qc, qn);
  if (!o.sides && sides[0] === sides[1]) return null;
  const pr = o.props(c, sides, n);
  const pn = { i: PANELS.length, kind: o.kind, part: o.part, strip: [a.map(p => p.map(r3)), b.map(p => p.map(r3))], n: n.map(r3), ax: -1, area: r3(at), c: c.map(r3), ...pr, sides };
  if (sides.includes(SEA)) pn.wet = true;
  finishProps(pn, n);
  PANELS.push(pn); return pn;
}
/* an axis plane cut into pieces on a grid (uCuts x vCuts), clipped to a region polygon (u, v), lifted to 3D;
   neighbouring pieces with the same sides and plating are merged along u */
function planeGrid(region, uCuts, vCuts, lift, o) {
  const U = [-1e3, ...uCuts.filter(v => isFinite(v)).sort((a, b) => a - b), 1e3], Vv = [-1e3, ...[...vCuts].sort((a, b) => a - b), 1e3];
  for (let j = 0; j < Vv.length - 1; j++) {
    const keys = [];
    for (let i = 0; i < U.length - 1; i++) {
      if (U[i + 1] - U[i] < 1e-6 || Vv[j + 1] - Vv[j] < 1e-6 || (o.allow && !o.allow(U[i], U[i + 1], Vv[j], Vv[j + 1]))) { keys.push(null); continue; }
      const p2 = dedupe2(clipRect(region, U[i], U[i + 1], Vv[j], Vv[j + 1]));
      if (p2.length < 3 || Math.abs(area2(p2)) < .01) { keys.push(null); continue; }
      const P = p2.map(q => lift(q[0], q[1])); let A = newell(P); if (o.n && dot(A, o.n) < 0) A = mul(A, -1);
      const n = norm(A), c = polyCentroid(P), s = sideAt(c, n);
      if (s[0] === s[1]) { keys.push(null); continue; }
      const pr = o.props(c, s, n);
      keys.push(s.join(',') + '|' + pr.mat + pr.t + (pr.door ? 'd' : ''));
    }
    for (let i = 0; i < keys.length;) {
      if (!keys[i]) { i++; continue; }
      let k = i; while (k + 1 < keys.length && keys[k + 1] === keys[i] && !(o.noMergeAt && o.noMergeAt(U[k + 1]))) k++;
      const p2 = dedupe2(clipRect(region, U[i], U[k + 1], Vv[j], Vv[j + 1]));
      if (p2.length >= 3) { const pn = emitPoly(p2.map(q => lift(q[0], q[1])), o); if (pn && o.after) o.after(pn); }
      i = k + 1;
    }
  }
}

/* ---------------------------------------------------------------- stations */
const STX = (() => {
  const xs = [XS, XB, XST, 23.28, -MIDX, MIDX, HOUSE.MH.x0, HOUSE.MH.x1, HOUSE.AH.x0, HOUSE.AH.x1, HG.xf, 76.6, 77.2, ...ENCL.flatMap(e => [e.x0, e.x1])];
  for (let k = -2; k <= 60; k++) xs.push(frameX(k));
  const root = (f, a, b) => { let fa = f(a); if (fa * f(b) > 0) return null; for (let i = 0; i < 50; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } } return (a + b) / 2; };
  for (const y of [LV.IB, LV.P4, 0, LV.D3, LV.D2, LV.PF]) {
    const bottom = x => secAt(x, 0)[1] - y;
    for (const [a, b] of [[XS, -28], [52, XST], [XST, XB]]) { const r = root(bottom, a, b); if (r !== null) xs.push(r); }
    const r = root(x => deckY(x) - y, 0, XB); if (r !== null) xs.push(r);
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (const x of xs) if (x >= XS - 1e-9 && x <= XB + 1e-9 && (!out.length || x - out[out.length - 1] > .05)) out.push(x);
  return out;
})();
export const STATIONS = STX.map(r3);

/* ---------------------------------------------------------------- shell */
const zoneOfBay = (xa, xb) => zoneAt((xa + xb) / 2);
function bayNodes(Z, x) {
  // girth nodes (t) at station x for a bay in zone Z, with the label of the strip above each
  const shY = Math.max(deckY(x) - 1.8, LV.D2, Z.no === 1 ? LV.PF : -99);
  // the keel strake edge (z 0.9) stays below the first deck that meets the shell at this station
  const first = [LV.IB, LV.P4, 0, LV.D3].map(y => tAtY(x, y)).find(t => t > 0) ?? .5;
  const N = [[0, 'keel'], [Math.min(.5, first, tAtZ(x, .9)), 'bottom'], [tAtY(x, LV.IB), 'bilge'], [tAtY(x, LV.P4), 'belt'], [tAtY(x, 0), 'belt'],
    [tAtY(x, LV.D3), 'side'], [tAtY(x, LV.D2), 'side']];
  if (Z.no === 1) N.push([tAtY(x, LV.PF), 'side']);
  N.push([tAtY(x, shY), 'sheer'], [1, null]);
  for (let i = 1; i < N.length; i++) N[i][0] = Math.max(N[i][0], N[i - 1][0]);
  return N;
}
function shellStrips() {
  for (let i = 0; i < STX.length - 1; i++) {
    const xa = STX[i], xb = STX[i + 1], Z = zoneOfBay(xa, xb);
    const Na = bayNodes(Z, xa), Nb = bayNodes(Z, xb), FR = [.5, .25, .75, .1, .9, .02, .98].map(f => { const x = mix(xa, xb, f); return [x, bayNodes(Z, x)]; });
    for (let k = 0; k < Na.length - 1; k++) {
      const la = secLine(xa, Na[k][0], Na[k + 1][0]).map(p => [xa, p[1], p[0]]);
      const lb = secLine(xb, Nb[k][0], Nb[k + 1][0]).map(p => [xb, p[1], p[0]]);
      const nseg = Math.max(1, Math.min(64, Math.ceil(Math.max(polyLen(la), polyLen(lb)) / .4)));
      const a = resample(la, nseg), b = resample(lb, nseg), label = Na[k][1];
      // the spaces either side, read 5 cm off the true surface, mid-girth, mid-bay (or nearer the end where the strip is)
      const fr = FR.find(([, N]) => N[k + 1][0] - N[k][0] > 1e-4); if (!fr) continue;
      const [xm, Nm] = fr, tm = (Nm[k][0] + Nm[k + 1][0]) / 2, p = secAt(xm, tm), p1 = secAt(xm, Math.max(0, tm - 1e-3)), p2 = secAt(xm, Math.min(1, tm + 1e-3));
      let gz = p2[0] - p1[0], gy = p2[1] - p1[1]; const gl = Math.hypot(gz, gy);
      if (gl < 1e-9) continue;
      gz /= gl; gy /= gl;
      for (const s of [1, -1]) {
        const at = e => compAt(xm, p[1] - gz * e, s * (p[0] + gy * e)), sides = [at(.05), at(-.05)];
        if (sides[0] === sides[1]) continue;
        const A = s > 0 ? a : a.map(p => [p[0], p[1], -p[2]]), B = s > 0 ? b : b.map(p => [p[0], p[1], -p[2]]);
        const E = polyLen(A) > polyLen(B) ? A : B, hy = E[E.length - 1][1] - E[0][1], hz = E[E.length - 1][2] - E[0][2];
        const hint = s > 0 ? [0, -hz, hy] : [0, hz, -hy];      // the girth direction turned outboard
        emitStrip(A, B, { kind: 'shell', part: 'Shell · ' + label, n: hint, sides, props: c => shellProps(label, c[0]) });
      }
    }
  }
  // transom (x = XS, facing aft): between the same nodes
  const Z = zoneAt(XS + .01), N = bayNodes(Z, XS);
  for (let k = 0; k < N.length - 1; k++) {
    const st = secLine(XS, N[k][0], N[k + 1][0]);
    const poly = [...st.map(p => [XS, p[1], p[0]]), ...st.slice().reverse().map(p => [XS, p[1], -p[0]])];
    const P2 = dedupe2(poly.map(p => [p[2], p[1]]));
    if (P2.length < 3) continue;
    emitPoly(P2.map(q => [XS, q[1], q[0]]), { kind: 'shell', part: 'Transom', n: [-1, 0, 0],
      props: () => ({ ...P('HSLA80', 9.5), stiff: ST(dirY, .61, 'T6x4'), frame: null }) });
  }
}

/* ---------------------------------------------------------------- hull: transverse planes (bulkheads, enclosure ends) */
function sectionPoly(x) {          // (u = z, v = y), closed across the deck
  const st = secLine(x, 0, 1);
  return dedupe2([...st.map(p => [p[0], p[1]]), ...st.slice().reverse().map(p => [-p[0], p[1]])]);
}
const HULL_Y = [LV.IB, LV.P4, LV.VF, LV.D3, LV.D2, LV.PF];
function bhdProps(x, y) {
  const k = Math.round(frameAt(x)), mach = [21, 25, 32, 40].includes(k);
  if (k === 3) return { ...(y < LV.D3 ? P('HSLA80', 11.1) : P('HSLA80', 9.5)), stiff: ST(dirY, .61, 'T6x4'), frame: null };
  if (mach) return { ...P('HTS', 9.5), stiff: ST(dirY, .61, 'T6x4'), frame: null };
  return { ...(y < LV.D3 ? P('HTS', 9.5) : P('HTS', 7.9)), stiff: ST(dirY, .61, 'T6x4'), frame: null };
}
function hullTransverse() {
  const xs = [...BULKHEADS.map(b => b.x), ...ENCL.flatMap(e => [e.x0, e.x1])].filter((x, i, a) => a.findIndex(v => Math.abs(v - x) < .01) === i);
  for (const x of xs) {
    const bh = BULKHEADS.find(b => Math.abs(b.x - x) < .01);
    planeGrid(sectionPoly(x), [-4.6, 0, 4.6], HULL_Y, (u, v) => [x, v, u], {
      kind: bh ? 'bulkhead' : 'enclosure', part: bh ? `WT bulkhead · fr ${bh.k} · ${bh.name}` : `VLS enclosure end · x ${r3(x)}`, n: [1, 0, 0],
      props: (c, s) => (s.some(v => COMPS[v].kind === 'enclosure') && !bh) ? { ...P('HSLA80', 9.5), stiff: ST(dirY, .61, 'T6x4'), frame: null } : bhdProps(x, c[1]) });
  }
}
/* ---------------------------------------------------------------- hull: decks (flat) */
function deckProps(y, s) {
  if (s.some(v => COMPS[v].kind === 'enclosure')) return { ...P('HSLA80', 12.7), stiff: ST(dirX, .61, 'T6x4'), frame: ST(dirZ, FRAME_SP, 'B10') };
  if (Math.abs(y - LV.IB) < .01) return { ...P('HTS', 9.5), stiff: ST(dirX, .61, 'T8x4'), frame: ST(dirZ, FRAME_SP, 'W18') };
  if (Math.abs(y - LV.D2) < .01) return { ...P('HTS', 7.9), stiff: ST(dirX, .61, 'T6x4'), frame: ST(dirZ, FRAME_SP, 'B10') };
  return { ...P('OS', 6.4), stiff: ST(dirX, .61, 'T5x3'), frame: ST(dirZ, FRAME_SP, 'B10') };
}
const DNAME = { [LV.IB]: 'Inner bottom', [LV.P4]: '4th deck', [LV.VF]: 'VLS floor · forward', [LV.D3]: '3rd deck', [LV.D2]: '2nd deck', [LV.PF]: 'Forecastle platform' };
function hullDecks() {
  for (const y of HULL_Y) {
    const stb = STX.map(x => [x, Math.max(0, halfBreadth(x, y))]);
    const region = dedupe2([...stb, ...stb.slice().reverse().map(p => [p[0], -p[1]])]);
    const allow = (u0, u1, v0, v1) => {
      const xm = (u0 + u1) / 2, zm = (v0 + v1) / 2;
      return zoneAt(xm).lv.some(l => Math.abs(l - y) < 1e-6) || ENCL.some(e => Math.abs(e.floor - y) < 1e-6 && xm > e.x0 && xm < e.x1 && Math.abs(zm) < e.hw);
    };
    planeGrid(region, STX, [-4.6, 0, 4.6], (u, v) => [u, y, v], { kind: 'deck', part: DNAME[y], n: [0, 1, 0], allow, props: (c, s) => deckProps(y, s) });
  }
}
/* ---------------------------------------------------------------- hull: longitudinal planes (VLS enclosure sides, centre vertical keel) */
function hullLongitudinal() {
  for (const zc of [-4.6, 0, 4.6]) {
    const low = STX.map(x => { const b = deckHB(x); if (Math.abs(zc) >= b) return [x, deckY(x)]; return [x, zc === 0 ? secAt(x, 0)[1] : secAt(x, tAtZ(x, Math.abs(zc)))[1]]; });
    const region = dedupe2([...low, ...STX.slice().reverse().map(x => [x, deckY(x)])]);
    planeGrid(region, STX, HULL_Y, (u, v) => [u, v, zc], { kind: zc === 0 ? 'girder' : 'enclosure', part: zc === 0 ? 'Centre vertical keel' : 'VLS enclosure side', n: [0, 0, zc < 0 ? -1 : 1],
      props: () => zc === 0 ? { ...P('HSLA80', 12.7), stiff: ST(dirY, FRAME_SP / 2, 'T6x4'), frame: null } : { ...P('HSLA80', 9.5), stiff: ST(dirY, .61, 'T6x4'), frame: null } });
  }
}
/* ---------------------------------------------------------------- main deck (per bay: planar; sheer) */
function mainDeck() {
  for (let i = 0; i < STX.length - 1; i++) {
    const xa = STX[i], xb = STX[i + 1], ya = deckY(xa), yb = deckY(xb), ba = deckHB(xa), bb = deckHB(xb);
    if (ba + bb < .02) continue;
    const region = dedupe2([[-ba, xa], [-bb, xb], [bb, xb], [ba, xa]]);
    const xm = (xa + xb) / 2, ym = deckY(xm), strg = Math.max(0, Math.min(ba, bb) - 1.5);
    const cuts = [4.6, HG.zi, HG.zo, hwOf(HOUSE.FH, ym), hwOf(HOUSE.MH, ym), hwOf(HOUSE.AH, ym), strg].filter(v => v > .05);
    const lift = (u, v) => [v, ya + (yb - ya) * (v - xa) / (xb - xa), u];
    planeGrid(region, [...cuts, ...cuts.map(v => -v)], [], lift, { kind: 'deck', part: xm < HOUSE.AH.x0 ? 'Main deck · flight deck' : 'Main deck', n: [0, 1, 0],
      props: c => {
        const m = mid(c[0]), edge = Math.abs(c[2]) > strg - 1e-3;
        if (c[0] < HOUSE.AH.x0) return { ...P('HSLA80', 9.5), stiff: ST(dirX, .61, 'T6x4'), frame: ST(dirZ, FRAME_SP, 'B12') };
        return { ...(edge ? (m ? P('HY80', 19.1) : P('HSLA80', 12.7)) : (m ? P('HSLA80', 12.7) : P('HSLA80', 9.5))), stiff: ST(dirX, .61, 'T6x4'), frame: ST(dirZ, FRAME_SP, 'B12') };
      } });
  }
}
/* ---------------------------------------------------------------- deckhouses */
const houseWall = () => ({ ...P('HSLA80', 7.9), stiff: ST(dirY, .61, 'T4x3'), frame: null });
const houseDeck = (t, mat = 'HSLA80') => ({ ...P(mat, t), stiff: ST(dirX, .61, 'T4x3'), frame: ST(dirZ, FRAME_SP / 2, 'B8') });
function houses() {
  // side walls (inclined planes z = s hw(y)), per run of stations
  const runs = { FH: [HOUSE.FH.x0, frameX(21), HOUSE.FH.x1], MH: [HOUSE.MH.x0, HOUSE.MH.x1], AH: [HOUSE.AH.x0, HG.xf, HOUSE.AH.x1] };
  for (const key of ['FH', 'MH', 'AH']) {
    const H = HOUSE[key], xs = [H.x0, ...STX.filter(x => x > H.x0 + .05 && x < H.x1 - .05), H.x1];
    const region = dedupe2([...xs.map(x => [x, deckY(x)]), [H.x1, H.top], [H.x0, H.top]]);
    for (const s of [-1, 1]) {
      const lift = (u, v) => [u, v, s * hwOf(H, v)];
      planeGrid(region, runs[key], key === 'AH' ? [HG.roof] : [], lift, { kind: 'house', part: `Deckhouse side · ${key} · ${s > 0 ? 'stbd' : 'port'}`, n: [0, 0, s], props: houseWall });
    }
    // end walls and inner transverse walls (x planes)
    const walls = key === 'FH' ? [H.x0, frameX(21), H.x1] : key === 'MH' ? [H.x0] : [H.x0, HG.xf, H.x1];
    for (const x of walls) {
      const yb = deckY(x), region2 = [[-hwOf(H, yb), yb], [hwOf(H, yb), yb], [hwOf(H, H.top), H.top], [-hwOf(H, H.top), H.top]];
      const mh = hwOf(HOUSE.MH, deckY(x) + 1.9);
      const uc = key === 'AH' ? [-HG.zo, -HG.zi, HG.zi, HG.zo] : (Math.abs(x - HOUSE.FH.x0) < .01 ? [-mh, mh] : []);
      planeGrid(region2, uc, key === 'AH' ? [HG.roof] : [], (u, v) => [x, v, u], { kind: 'house', part: `Deckhouse wall · ${key} · x ${r3(x)}`, n: [1, 0, 0],
        props: (c, sd) => {
          const door = key === 'AH' && Math.abs(x - H.x0) < .01 && c[1] < HG.roof && Math.abs(c[2]) > HG.zi && Math.abs(c[2]) < HG.zo;
          return door ? { ...P('HTS', 3.2), stiff: ST(dirZ, .55, 'FB4'), frame: null, door: true } : houseWall();
        }, after: pn => { if (pn.t === 3.2) pn.door = true; } });
    }
  }
  // hangar walls (z = +-0.75, +-7.45) and overhead (y = 11.4), aft house roof (13.2)
  {
    const H = HOUSE.AH, xs = [H.x0, ...STX.filter(x => x > H.x0 + .05 && x < HG.xf - .05), HG.xf];
    const region = dedupe2([...xs.map(x => [x, deckY(x)]), [HG.xf, HG.roof], [H.x0, HG.roof]]);
    for (const zc of [-HG.zo, -HG.zi, HG.zi, HG.zo])
      planeGrid(region, [], [], (u, v) => [u, v, zc], { kind: 'house', part: 'Hangar wall', n: [0, 0, Math.sign(zc)], props: () => ({ ...P('HTS', 6.4), stiff: ST(dirY, .61, 'T4x3'), frame: null }) });
    for (const [y, part] of [[HG.roof, 'Hangar overhead'], [H.top, 'Aft deckhouse roof']]) {
      const hw = hwOf(H, y);
      planeGrid([[H.x0, -hw], [H.x1, -hw], [H.x1, hw], [H.x0, hw]], [HG.xf], [-HG.zo, -HG.zi, HG.zi, HG.zo], (u, v) => [u, y, v], { kind: 'house', part, n: [0, 1, 0], props: () => houseDeck(7.9) });
    }
  }
  // the 01 level (y 10.3): roofs of the main-deck houses, split under the SPY house and the stacks
  {
    const y = D01, occ = [octHP(0), ...STACKS.map(s => { const q = stackAt(s, y); return [[1, 0, q.xf], [0, 1, q.hw], [-1, 0, -q.xa], [0, -1, q.hw]]; })];
    for (const key of ['FH', 'MH']) {
      const H = HOUSE[key], hw = hwOf(H, y);
      let rest = [[[H.x0, -hw], [H.x1, -hw], [H.x1, hw], [H.x0, hw]]];
      if (key === 'FH') rest = rest.flatMap(r => [clipHP(r, 1, 0, frameX(21)), clipHP(r, -1, 0, -frameX(21))]);
      const pieces = [];
      for (const hp of occ) {
        const next = [];
        for (const r of rest) {
          let inside = r; for (const h of hp) inside = inside.length >= 3 ? clipHP(inside, ...h) : [];
          if (inside.length >= 3 && Math.abs(area2(inside)) > .01) pieces.push(inside);
          next.push(...subtractConvex(r, hp));
        }
        rest = next;
      }
      for (const p2 of [...pieces, ...rest]) emitPoly(dedupe2(p2).map(q => [q[0], y, q[1]]), { kind: 'house', part: '01 level (house roof)', n: [0, 1, 0], props: () => houseDeck(7.9) });
    }
  }
  // SPY house: inclined walls per level band, its two inner decks, roof
  {
    const ys = [SPY.y0, ...SPY.lv, SPY.y1];
    for (let b = 0; b < 3; b++) {
      const A = octPoly(spyInset(ys[b])), B = octPoly(spyInset(ys[b + 1]));
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8, p = [[A[i][0], ys[b], A[i][1]], [A[j][0], ys[b], A[j][1]], [B[j][0], ys[b + 1], B[j][1]], [B[i][0], ys[b + 1], B[i][1]]];
        const out = [OCT[i][0], 0, OCT[i][1]];
        emitPoly(p, { kind: 'house', part: `SPY house wall · ${['fwd', 'stbd fwd', 'stbd', 'stbd aft', 'aft', 'port aft', 'port', 'port fwd'][i]}`, n: out,
          props: () => ({ ...P('HSLA80', 9.5), stiff: ST(dirY, .61, 'T5x3'), frame: null }) });
      }
    }
    for (const y of [...SPY.lv, SPY.y1]) emitPoly(octPoly(spyInset(y)).map(q => [q[0], y, q[1]]), { kind: 'house', part: y === SPY.y1 ? 'SPY house roof' : 'SPY house deck', n: [0, 1, 0], props: () => houseDeck(y === SPY.y1 ? 7.9 : 6.4) });
  }
  // stack casings: four inclined walls, the exhaust opening on top
  for (const s of STACKS) {
    const a = stackAt(s, STK.y0), b = stackAt(s, STK.y1), y0 = STK.y0, y1 = STK.y1;
    const cw = { ...P('HTS', 6.4), stiff: ST(dirY, .61, 'FB4'), frame: null };
    for (const sd of [-1, 1]) emitPoly([[a.xa, y0, sd * a.hw], [a.xf, y0, sd * a.hw], [b.xf, y1, sd * b.hw], [b.xa, y1, sd * b.hw]], { kind: 'house', part: 'Stack casing side', n: [0, 0, sd], props: () => cw });
    emitPoly([[a.xf, y0, -a.hw], [a.xf, y0, a.hw], [b.xf, y1, b.hw], [b.xf, y1, -b.hw]], { kind: 'house', part: 'Stack casing front', n: [1, 0, 0], props: () => cw });
    emitPoly([[a.xa, y0, -a.hw], [a.xa, y0, a.hw], [b.xa, y1, b.hw], [b.xa, y1, -b.hw]], { kind: 'house', part: 'Stack casing back', n: [-1, 0, 0], props: () => cw });
    emitPoly([[b.xa, y1, -b.hw], [b.xf, y1, -b.hw], [b.xf, y1, b.hw], [b.xa, y1, b.hw]], { kind: 'house', part: 'Stack exhaust (open)', n: [0, 1, 0], open: true,
      props: () => ({ mat: null, t: 0, stiff: null, frame: null }) });
  }
}
/* ---------------------------------------------------------------- appendages and the dome (sea both sides / flooded) */
function appendages() {
  // skeg: a centre-line fin under the rising aft keel
  {
    const xs = [-58, ...STX.filter(x => x > -58 && x < -30), -30], top = xs.map(x => [x, keelY(x), 0]);
    const low = x => mix(-3.1, -6.32, (x + 58) / 28);
    const P3 = [...top, ...xs.slice().reverse().map(x => [x, Math.min(low(x), keelY(x)), 0])];
    emitPoly(P3, { kind: 'appendage', part: 'Skeg', n: [0, 0, 1], sides: [SEA, SEA], props: () => ({ ...P('HSLA80', 12.7), stiff: ST(dirY, .61, 'T6x4'), frame: null }) });
  }
  // bilge keels (the model's: along t .62 rad, 0.45 m out, 0.4 m down)
  for (const s of [-1, 1]) {
    const xs = []; for (let x = -24; x <= 26 + 1e-9; x += 5) xs.push(x);
    const tb = .62 / PI, root = xs.map(x => { const p = secAt(x, tb); return [x, p[1], s * p[0]]; }), tip = root.map(p => [p[0], p[1] - .4, p[2] + s * .45]);
    emitStrip(root, tip, { kind: 'appendage', part: 'Bilge keel', n: [0, 1, 0], sides: [SEA, SEA], props: () => ({ ...P('HSLA80', 12.7), stiff: null, frame: null }) });
  }
  // sonar dome window: the spindle outside the hull
  const NA = 16, NX = 16;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NA; j++) {
    const x0 = mix(DOME.x0, DOME.x1, i / NX), x1 = mix(DOME.x0, DOME.x1, (i + 1) / NX), a0 = j / NA * 2 * PI, a1 = (j + 1) / NA * 2 * PI;
    const pt = (x, a) => [x, DOME.y + Math.cos(a) * domeR(x), Math.sin(a) * domeR(x)];
    const q = [pt(x0, a0), pt(x0, a1), pt(x1, a1), pt(x1, a0)], c = polyCentroid(q);
    const hb = halfBreadth(c[0], c[1]); if (hb >= 0 && Math.abs(c[2]) <= hb) continue;
    const out = sub(c, [c[0], DOME.y, 0]);
    emitPoly(q, { kind: 'dome', part: 'Sonar dome window', n: out, sides: [SEA, DOMEC], props: () => ({ ...P('SDRW', 19), stiff: null, frame: null }) });
  }
}

/* ================================================================ build */
shellStrips(); mainDeck(); hullDecks(); hullTransverse(); hullLongitudinal(); houses(); appendages();

/* ---------------------------------------------------------------- volumes: a grid, and from the panels (divergence) */
function gridVolumes(dx = FRAME_SP / 8, dy = .25, dz = .25) {
  const V = new Float64Array(COMPS.length), bb = COMPS.map(() => [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]), dv = dx * dy * dz;
  for (let x = XS + dx / 2; x < XB; x += dx) {
    const d = deckY(x);
    for (let y = -9 + dy / 2; y < 21.7; y += dy) {
      const hb = halfBreadth(x, y), zl = y > d ? 8.8 : Math.max(hb, y < -4 && x > DOME.x0 && x < DOME.x1 ? 2.2 : -1);
      if (zl < 0) continue;
      for (let z = -zl + dz / 2; z < zl; z += dz) {
        const c = compAt(x, y, z); if (c <= SEA) continue;
        V[c] += dv; const b = bb[c];
        if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x; if (y < b[2]) b[2] = y; if (y > b[3]) b[3] = y; if (z < b[4]) b[4] = z; if (z > b[5]) b[5] = z;
      }
    }
  }
  return { V, bb };
}
function panelTris(pn) {
  const T3 = [];
  if (pn.poly) { const o = pn.poly[0]; for (let i = 1; i < pn.poly.length - 1; i++) T3.push([o, pn.poly[i], pn.poly[i + 1]]); }
  else { const [a, b] = pn.strip; for (let k = 0; k < a.length - 1; k++) T3.push([a[k], a[k + 1], b[k + 1]], [a[k], b[k + 1], b[k]]); }
  return T3;
}
const G = gridVolumes(), DIV = new Float64Array(COMPS.length), CLO = COMPS.map(() => [0, 0, 0]), SA = new Float64Array(COMPS.length);
for (const pn of PANELS) {
  if (pn.kind === 'appendage') continue;
  let Av = [0, 0, 0], pnA = 0;
  for (const t of panelTris(pn)) { const v = mul(cross(sub(t[1], t[0]), sub(t[2], t[0])), .5), c = mul(add(add(t[0], t[1]), t[2]), 1 / 3); Av = add(Av, v); pnA += dot(c, v); }
  const [pos, neg] = pn.sides;          // outward from the + side space is -n, from the - side space +n
  DIV[pos] -= pnA / 3; DIV[neg] += pnA / 3; CLO[pos] = sub(CLO[pos], Av); CLO[neg] = add(CLO[neg], Av); SA[pos] += pn.area; SA[neg] += pn.area;
}
for (const c of COMPS) {
  if (c.kind === 'outside') continue;
  c.area = r3(SA[c.idx]); c.closure = SA[c.idx] > 0 ? r3(len(CLO[c.idx]) / SA[c.idx]) : null;
  c.volGrid = r3(G.V[c.idx]); c.volPanels = r3(DIV[c.idx]);
  c.vol = c.closure !== null && c.closure < .01 ? c.volPanels : c.volGrid;     // m^3
  const b = G.bb[c.idx]; c.box = b[0] < 1e8 ? { x: [r3(b[0]), r3(b[1])], y: [r3(b[2]), r3(b[3])], z: [r3(b[4]), r3(b[5])] } : null;
}

/* ---------------------------------------------------------------- the waterline, offsets, totals */
const WLX = STX.filter(x => wlHB(x) > 0 || x === XS);
export const WATERLINE = { y: 0, xAft: XS, xFwd: XST, lwl: r3(XST - XS), bwl: 18, points: WLX.map(x => [r3(x), 0, r3(wlHB(x))]) };
export const OFFSETS = [];
for (let k = -2; k <= 60; k++) {
  const x = frameX(k); if (x < XS) continue;
  OFFSETS.push({ frame: k, x: r3(x), keel: r3(secAt(x, 0)[1]), deck: r3(deckY(x)), halfDeck: r3(deckHB(x)), halfWL: r3(wlHB(x)),
    pts: resample(secLine(x, 0, 1).map(p => [p[0], p[1], 0]), 24).map(p => [r3(p[0]), r3(p[1])]) });   // [z, y] keel -> deck edge
}
const STATS = (() => {
  let plate = 0, openA = 0, steel = 0, stiffM = 0; const byKind = {}, byMat = {};
  for (const pn of PANELS) {
    if (pn.open) { openA += pn.area; continue; }
    plate += pn.area; byKind[pn.kind] = (byKind[pn.kind] || 0) + pn.area; byMat[pn.mat] = (byMat[pn.mat] || 0) + pn.area;
    const M = MATS[pn.mat]; if (!M || M.rho < 7000) continue;
    steel += pn.area * pn.t / 1000 * M.rho;
    if (pn.stiff) stiffM += pn.area / pn.stiff.s * SECS[pn.stiff.sec].A * 7850;
    if (pn.frame) stiffM += pn.area / pn.frame.s * SECS[pn.frame.sec].A * 7850;
  }
  // displaced volume (hull below the waterline + dome)
  let disp = 0; const dx = .25, dy = .05;
  for (let x = XS + dx / 2; x < XST; x += dx) for (let y = keelY(x) + dy / 2; y < 0; y += dy) { const h = halfBreadth(x, y); if (h > 0) disp += 2 * h * dy * dx; }
  disp += G.V[DOMEC];
  const inner = COMPS.filter(c => c.kind !== 'outside');
  return {
    panels: PANELS.length, strips: PANELS.filter(p => p.strip).length, compartments: inner.length,
    plateArea: r3(plate), openArea: r3(openA), areaByKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, r3(v)])),
    areaByMat: Object.fromEntries(Object.entries(byMat).map(([k, v]) => [k, r3(v)])),
    plateSteel_t: r3(steel / 1000), stiffenerSteel_t: r3(stiffM / 1000),
    displacedVolume: r3(disp), displacement_t: r3(disp * 1.025),
    enclosedVolume: r3(inner.reduce((s, c) => s + c.vol, 0)),
    worstClosure: inner.filter(c => c.kind !== 'flooded').reduce((w, c) => c.closure > w.v ? { v: c.closure, id: c.id } : w, { v: 0, id: null }),
    mixedPieces: CHECK.mixed.length, droppedSlivers: CHECK.dropped,
  };
})();

export const META = {
  name: 'DDG-51 Arleigh Burke Flight IIA', frame: 'x forward, y up, z starboard; origin midships (half LOA) on the design waterline; metres',
  loa: 155.2, lwl: WATERLINE.lwl, beamDeck: 20, beamWL: 18, depth: r3(deckY(0) - keelY(0)), draughtHull: r3(-keelY(0)), draughtDome: r3(-(DOME.y - DOME.r)),
  frameSpacing: FRAME_SP, fp: FP, frames: 'frame k at x = FP - k * frameSpacing (numbered aft from the forward perpendicular)',
  stations: STATIONS.length, model: 'HD.destroyer (reference/films/common/hd_sea_air.js) + underwater() (game/src/data/models.js); model = [z, y, x]',
};
export const BURKE = { META, MATS, SECS, SCHEDULE, FRAMES: { spacing: FRAME_SP, fp: FP }, BULKHEADS, DECKS, ENCL, ZONES: ZONES.map(z => ({ no: z.no, x0: r3(z.x0), x1: r3(z.x1), levels: z.lv, comps: z.ci })),
  WATERLINE, OFFSETS, STATIONS, COMPS, PANELS, STATS, CHECK };
export default BURKE;
