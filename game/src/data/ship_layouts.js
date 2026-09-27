/* ONIKS ship subdivision: the compartments of every ship class, their watertight boundaries and openings, and a voxel
   lookup (which space holds a point), for sim/ship.js (blast, flooding, fire, damage control) and the displays
   (ui/inspect). Pure data and geometry: no DOM, no randomness; built once per class on first use (layoutOf).

   Model frame (sim/bodies.js): +X starboard, +Y up (0 = the design waterline), +Z bow; metres.

   The DDG is the blast bench's structural model of the Arleigh Burke (data/layout_ddg.js, generated from
   game/concepts/blast/burke_structure.js: 13 watertight bulkheads, 82 spaces). The others are generic layouts built
   here from a short spec (GEN): a hull form (waterline and deck beam, draught, sheer, bow and stern taper, section
   fullness; a pressure-hull cylinder for the boats), watertight bulkheads at sensible spacing, decks, the main spaces
   merged over the cells they span (machinery rooms, magazines, well deck, hangars, the VLS enclosures), side
   protection wings on the carrier, deckhouses as boxes on the main deck. Their volumes and boundaries come from a voxel
   count of that partition. Positions are placed to fit the game models' modules (data/modules.js), not the real ships'
   drawings; the subdivision numbers are estimates.

   layoutOf(type) -> L (null for a unit without one):
     n                         spaces; ids[i], names[i], nums[i] (US Navy style number or ''), kind[i] ('hull' | 'tank' |
                               'enclosure' | 'house' | 'void'), use[i] (compartment letter: E machinery, M magazine, F fuel,
                               J JP-5, W water, V void, L living, A stores, Q misc, C control, T trunk, H hangar, K well)
     box   Float64Array 6n     bounding boxes; vol[i] (m^3), perm[i] (floodable share), floorA[i] (vol / height, m^2)
     bn                        boundaries: bA[k] (space), bB[k] (space, or SEA -1 / AIR -2), bKind[k] ('shell' | 'deck' |
                               'bulkhead' | 'enclosure' | 'girder' | 'house'), bArea[k] (m^2), bT[k] (plating mm), bAx[k]
                               (0 x / 1 y / 2 z normal, -1 mixed), bBox Float64Array 6 bn, bWT[k] (watertight),
                               bDoor[k] (m^2 of doors / hatches in it: 0 none), bDoorP[k] (Pa: the closure lets go),
                               bOpen[k] (m^2 always open: the uptakes)
     cb[i]                     the boundary indices of space i; pair(a, b) -> boundary index or -1
     at(x, y, z)               the space holding a model point, SEA (-1) or AIR (-2); O(1) (voxel grid)
     hb(z, y), deck(z), keel(z) the hull: half-breadth (-1 outside), main deck edge, keel
     hydro                     { L, B, T, Awp, zF, GM, GML, KG, KM, disp (t), fbMid, reserve (m^3), sub }
     dc                        the damage-control deck height (doors in the bulkheads at and above it) */
import { DDG_COMPS, DDG_BNDS, DDG_HULL } from './layout_ddg.js';

export const SEA = -1, AIR = -2;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerpT = (T, z) => {                       // piecewise linear table [[z, v], ...]
  if (z <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (z <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); }
  return T[T.length - 1][1];
};

/* floodable share of a space by use (the rest is machinery, stores, tank contents: public damage-stability practice,
   coarse): full fuel tanks take little floodwater (their contents are displaced only through vents); the double bottom's
   water and ballast tanks are about half empty (the room damage control counter-floods into) */
export const PERM = { E: .85, M: .6, F: .1, J: .1, W: .5, V: .95, L: .95, A: .6, Q: .9, C: .9, T: .95, H: .95, K: .97, X: .95 };
/* openings (condition Zebra shut; they let go at these pressures: as game/src/blast/spec.js ventsOf) */
export const OPENINGS = {
  door: { area: 1.3, p: 100e3 },                // a watertight door in a transverse bulkhead (at and above the DC deck)
  hatch: { area: 1.0, p: 50e3 },                // a hatch / scuttle / ladder trunk between decks
  weather: { area: 1.5, p: 70e3 },              // a weather door from a deckhouse to the open deck
};

/* ------------------------------------------------------------------------------------------------ generic specs */
/* z: [stern, bow] of the hull; B / Bd waterline and deck beam; T hull draught (keel depth amidships); deck: the main
   deck edge [[z, y], ...]; fwd / aft: the share of the length the waterline tapers over at the bow / stern, tr: the
   transom's half-breadth share; e: section fullness below the waterline (2 round .. 6 boxy); rise: [bow, stern] keel
   rise as a share of T over the tapers. bhd: watertight transverse bulkheads (z); lv: decks inside the hull (y); dc:
   the damage-control deck; tb / td / ts / th: plating (mm) of bulkheads, decks, shell, deckhouses.
   merge: [id, name, use, z0, z1, y0, y1, halfWidth?] one space over the cells it covers (drawn first: it wins).
   wing: [y0, y1, width] side protection wings split off the cells between y0 and y1.
   houses: [id, name, use, x0, y0, z0, x1, y1, z1] deckhouses (above the main deck).
   names: [[z0, z1, y0, y1, id, name, use], ...] labels for the cells (the first that holds the cell's middle).
   sub: { R, yc } a pressure hull (circle of radius R about y = yc, the ends rounded over cap m). */
const GEN = {
  cg: {
    z: [-86.4, 86.4], B: 16.8, Bd: 16.8, T: 6.6, deck: [[-86.4, 6.0], [-20, 6.1], [30, 6.7], [86.4, 9.66]],
    fwd: .34, aft: .12, tr: .6, e: 4.2, rise: [.6, .7],
    bhd: [74, 66, 57.2, 46.6, 33, 18, 6, -15, -36.2, -46, -56.2, -66, -76], lv: [-5.1, -1.6, 1.2, 3.9], dc: 3.9,
    tb: 9.5, td: 7.9, ts: 10, th: 6.4,
    merge: [
      ['VLSF', 'Mk 41 VLS enclosure · forward (61 cells)', 'M', 47.2, 54.8, -1.9, 9.2, 4.6],
      ['VLSA', 'Mk 41 VLS enclosure · aft (61 cells)', 'M', -64.8, -57.2, -1.9, 6.1, 4.6],
      ['MAGF', 'Gun magazine · forward', 'M', 57.2, 66, -5.1, 3.9],
      ['MAGA', 'Gun magazine · aft', 'M', -76, -66, -5.1, 3.9],
      ['AMR1', 'Auxiliary machinery room 1', 'E', 6, 18, -5.1, 3.9],
      ['MER1', 'Main engine room 1', 'E', -15, 6, -5.1, 3.9],
      ['MER2', 'Main engine room 2', 'E', -36.2, -15, -5.1, 3.9],
      ['AMR2', 'Auxiliary machinery room 2', 'E', -46, -36.2, -5.1, 1.2],
    ],
    names: [[-56.2, -46, -5.1, 1.2, 'JP5', 'JP-5 tanks', 'J'], [18, 33, -5.1, -1.6, 'FO', 'Fuel', 'F'], [33, 46.6, -5.1, -1.6, 'FO', 'Fuel · forward', 'F'],
      [-66, -56.2, -5.1, -1.6, 'FO', 'Fuel · aft', 'F'], [66, 74, -9, 3.9, 'SON', 'Sonar equipment', 'Q'], [-99, -76, -9, 9, 'STR', 'Steering gear room', 'Q']],
    houses: [
      ['FH1', 'Deckhouse · forward · main deck level', 'C', -7.9, 0, 15, 7.9, 10.3, 42],
      ['FH2', 'Deckhouse · forward · 01 level · SPY', 'C', -7.4, 10.3, 20, 7.4, 13.5, 41],
      ['FH3', 'Deckhouse · forward · 02 level · pilot house', 'C', -7.4, 13.5, 30, 7.4, 18.3, 41],
      ['MH', 'Midships deckhouse · uptakes', 'Q', -5.6, 0, -4, 5.6, 9.3, 15],
      ['AH1', 'Aft deckhouse · main deck level', 'Q', -7.7, 0, -28, 7.7, 10.3, -4],
      ['AH2', 'Aft deckhouse · 01 level · SPY', 'C', -7.2, 10.3, -30, 7.2, 16.2, -18],
      ['HGR', 'Hangars · aft deckhouse', 'H', -6, 0, -36.1, 6, 11.1, -28],
    ],
  },
  carrier: {
    z: [-160, 165.6], B: 40.8, Bd: 45.2, T: 11.3, deck: [[-160, 8.3], [165.6, 8.3]],
    fwd: .3, aft: .1, tr: .75, e: 5.5, rise: [.5, .5],
    bhd: [150, 134, 118, 98, 80, 64, 50, 38, 20, 0, -24, -44, -60, -76, -92, -104, -118, -132, -146], lv: [-9.6, -4.8, -.5, 4], dc: 4,
    tb: 12.7, td: 12.7, ts: 25, th: 10,
    wing: [-9.6, 4, 5.5],
    merge: [
      ['MAGF', 'Magazines · forward · bombs and missiles', 'M', 38, 98, -9.6, 4, 14.5],
      ['MAGA', 'Magazines · aft · bombs and missiles', 'M', -104, -44, -9.6, 4, 14.5],
      ['RX1', 'Reactor compartment 1', 'E', 0, 38, -9.6, 4, 14.5],
      ['RX2', 'Reactor compartment 2', 'E', -24, 0, -9.6, 4, 14.5],
      ['MMR1', 'Main machinery room 1', 'E', -44, -24, -9.6, 4, 14.5],
      ['JP5F', 'JP-5 tanks · forward', 'J', 98, 134, -9.6, -.5, 16.5],
      ['JP5A', 'JP-5 tanks · aft', 'J', -132, -104, -9.6, -.5, 16.5],
    ],
    names: [[134, 170, -12, 9, 'BOW', 'Bow · anchor gear · stores', 'A'], [-170, -132, -12, 9, 'AFT', 'Shaft alleys · steering gear', 'Q'],
      [-99, 170, 4, 9, 'D2', '2nd deck · berthing · shops', 'L']],
    houses: [
      ['HB1', 'Hangar bay 1', 'H', -16.5, 8.3, 8.6, 16.5, 16.4, 78],
      ['HB2', 'Hangar bay 2', 'H', -16.5, 8.3, -60.7, 16.5, 16.4, 8.6],
      ['HB3', 'Hangar bay 3', 'H', -16.5, 8.3, -130, 16.5, 16.4, -60.7],
      ['GALF', 'Gallery deck · forward · ready rooms', 'C', -20, 16.4, 0, 20, 19.4, 150],
      ['GALA', 'Gallery deck · aft · CIC · CATCC', 'C', -20, 16.4, -150, 20, 19.4, 0],
      ['ISL', 'Island · bridge · Pri-Fly', 'C', 23.4, 19.5, -46, 32.2, 40, -8],
    ],
  },
  lhd: {
    z: [-126.6, 116.6], B: 31.8, Bd: 32, T: 8.1, deck: [[-126.6, 17.8], [116.6, 17.8]],
    fwd: .3, aft: .06, tr: .9, e: 5, rise: [.5, .2],
    bhd: [104, 90, 76, 64, 50, 36, 20, 4, -18, -40, -55, -70, -85, -100, -115], lv: [-6.6, 1, 10.7], dc: 1,
    tb: 9.5, td: 9.5, ts: 12, th: 8,
    merge: [
      ['WELL', 'Well deck · 81 × 15.2 m', 'K', -126.6, -46.9, 1, 10.7, 7.6],
      ['VEH', 'Vehicle decks', 'Q', -46.9, 8, 1, 10.7, 10.5],
      ['HGR', 'Hangar deck', 'H', -84, 14, 10.7, 17.8, 14.6],
      ['MAG', 'Magazines · missiles and ordnance', 'M', 20, 64, -6.6, 1, 10],
      ['JP5', 'JP-5 tanks', 'J', 64, 90, -6.6, 1, 10],
      ['MMR', 'Machinery rooms · boilers · turbines', 'E', -40, 4, -6.6, 1],
    ],
    names: [[-130, -85, -9, 1, 'BAL', 'Ballast tanks · aft', 'W'], [90, 130, -9, 17.8, 'BOW', 'Bow · stores · berthing', 'A'],
      [-130, 130, 10.7, 17.8, 'O2', 'Berthing · troops · 2nd deck', 'L']],
    houses: [['ISL', 'Island · bridges · Pri-Fly', 'C', 7.4, 18.3, -41, 18, 33.9, 14]],
  },
  lcs: {
    z: [-63.7, 63.7], B: 14.3, Bd: 14.3, T: 4.5, deck: [[-63.7, 9.2], [0, 9.6], [63.7, 10.41]],
    fwd: .3, aft: .06, tr: .7, e: 3, rise: [.5, .2],
    bhd: [52, 40, 28, 16, 0, -8, -22, -36, -44, -52], lv: [-2.8, 0, 3.6], dc: 3.6,
    tb: 7, td: 7, ts: 7, th: 5,
    merge: [
      ['MMR', 'Engine rooms · diesels · gas turbines', 'E', -36, -8, -2.8, 3.6],
      ['JP5', 'JP-5 tanks', 'J', -44, -36, -4.5, 0],
      ['MAG', 'Gun magazine · 57 mm', 'M', 28, 40, -2.8, 3.6],
    ],
    names: [[-70, -52, -9, 12, 'JETS', 'Waterjet room', 'E']],
    houses: [
      ['BAYP', 'Mission bay · port', 'Q', -15.8, 3.4, -60, -7.2, 9.2, 26],
      ['BAYS', 'Mission bay · starboard', 'Q', 7.2, 3.4, -60, 15.8, 9.2, 26],
      ['ORP', 'Outrigger · port', 'V', -14.5, 0, -63.7, -11, 3.4, -6],
      ['ORS', 'Outrigger · starboard', 'V', 11, 0, -63.7, 14.5, 3.4, -6],
      ['BRG', 'Bridge · integrated mast · CIC', 'C', -10.5, 9.2, 0, 10.5, 16, 24],
      ['HGR', 'Hangar · MH-60', 'H', -9, 9.2, -26, 9, 15.6, 0],
    ],
  },
  ssn: {
    z: [-48, 43], B: 10, Bd: 10, T: 9.1, deck: [[-48, .9], [43, .9]], sub: { R: 5, yc: -4.1, cap: 5 },
    bhd: [6, -6.5], lv: [-5.2, -2], dc: -2,
    tb: 40, td: 12, ts: 40, th: 10,
    merge: [['RX', 'Reactor compartment', 'E', -6.5, 6, -9.1, .9], ['ER', 'Engine room · turbines · shaft', 'E', -48, -6.5, -9.1, .9]],
    names: [[6, 43, -9.1, -5.2, 'TR', 'Torpedo room · auxiliary machinery', 'M'], [6, 43, -5.2, -2, 'OPS', 'Control room · sonar · command', 'C'],
      [6, 43, -2, .9, 'BTH', 'Berthing · wardroom · ship control', 'L']],
    houses: [],
  },
  ssk: {
    z: [-34.6, 36.9], B: 8.8, Bd: 8.8, T: 6.3, deck: [[-34.6, 2.5], [36.9, 2.5]], sub: { R: 4.4, yc: -1.9, cap: 4 },
    bhd: [26.5, 17.5, 8.5, -3.5, -15.5, -26], lv: [-3.8], dc: -3.8,
    tb: 25, td: 10, ts: 25, th: 8,
    merge: [],
    names: [[26.5, 40, -9, 3, 'C1', 'Torpedo room · bow', 'M'], [17.5, 26.5, -3.8, 3, 'C2', 'Accommodation · forward', 'L'], [8.5, 17.5, -3.8, 3, 'C3', 'Accommodation · wardroom', 'L'],
      [-3.5, 8.5, -3.8, 3, 'C4', 'Central post · control', 'C'], [-15.5, -3.5, -3.8, 3, 'C5', 'Diesel room', 'E'], [-26, -15.5, -9, 3, 'C6', 'Main motor room', 'E'],
      [-40, -26, -9, 3, 'C7', 'Aft · propulsion motor · steering', 'E'], [-3.5, 26.5, -9, -3.8, 'BAT', 'Battery well', 'Q']],
    houses: [],
  },
};

/* ------------------------------------------------------------------------------------------------ hull forms */
function genHull(S) {
  const [zs, zb] = S.z, L = zb - zs, zm = (zs + zb) / 2;
  const deck = z => lerpT(S.deck, z);
  if (S.sub) {
    const { R, yc, cap } = S.sub;
    const rAt = z => { const e = Math.min(z - zs, zb - z); return e <= 0 ? 0 : e >= cap ? R : R * Math.sqrt(1 - (1 - e / cap) ** 2); };
    return { deck: () => yc + R, keel: z => yc - rAt(z), hb: (z, y) => { const r = rAt(z), d = y - yc; return r <= 0 || Math.abs(d) > r ? -1 : Math.sqrt(r * r - d * d); } };
  }
  const plan = (z, half) => {                    // waterline half-breadth share along the length
    const u = (z - zm) / (L / 2);
    if (u > 1 - 2 * S.fwd) { const t = sat((u - (1 - 2 * S.fwd)) / (2 * S.fwd)); return half * Math.max(0, 1 - Math.pow(t, 1.8)); }
    if (u < -1 + 2 * S.aft) { const t = sat((-u - (1 - 2 * S.aft)) / (2 * S.aft)); return half * (1 - (1 - S.tr) * Math.pow(t, 1.5)); }
    return half;
  };
  const keel = z => {
    const u = (z - zm) / (L / 2);
    let k = S.T;
    if (u > 1 - 2 * S.fwd) k *= 1 - S.rise[0] * Math.pow(sat((u - (1 - 2 * S.fwd)) / (2 * S.fwd)), 2);
    if (u < -1 + 2 * S.aft * 2) k *= 1 - S.rise[1] * Math.pow(sat((-u - (1 - 4 * S.aft)) / (4 * S.aft)), 1.5);
    return -k;
  };
  const hb = (z, y) => {
    if (z < zs || z > zb) return -1;
    const d = deck(z); if (y > d) return -1;
    const w = plan(z, S.B / 2);
    if (y >= 0) { const wd = Math.max(w, plan(z, S.Bd / 2) * (z > zm ? 1.08 : 1)); return w + (Math.min(wd, S.Bd / 2) - w) * sat(y / Math.max(1, d)); }
    const k = keel(z); if (y < k) return -1;
    return w * Math.pow(Math.max(0, 1 - Math.pow(y / k, S.e)), 1 / S.e);
  };
  return { deck, keel, hb };
}
function ddgHull() {
  const H = DDG_HULL;
  const hb = (z, y) => {
    const fi = (z - H.z0) / H.dz, fj = (y - H.y0) / H.dy;
    if (fi < 0 || fi > H.nz - 1 || fj < 0) return -1;
    if (y > deck(z)) return -1;
    const i = Math.min(H.nz - 2, Math.floor(fi)), j = Math.min(H.ny - 2, Math.floor(fj)), a = fi - i, b = Math.min(1, fj - j);
    const v = (1 - a) * ((1 - b) * H.hb[i * H.ny + j] + b * H.hb[i * H.ny + j + 1]) + a * ((1 - b) * H.hb[(i + 1) * H.ny + j] + b * H.hb[(i + 1) * H.ny + j + 1]);
    return y < keel(z) || v <= 0 ? -1 : v;
  };
  const tab = (A, z) => { const f = (z - H.z0) / H.dz; if (f <= 0) return A[0]; if (f >= H.nz - 1) return A[H.nz - 1]; const i = Math.floor(f); return A[i] + (A[i + 1] - A[i]) * (f - i); };
  const deck = z => tab(H.deck, z), keel = z => tab(H.keel, z);
  return { deck, keel, hb };
}

/* ------------------------------------------------------------------------------------------------ spaces */
/* the spaces of a generic spec as boxes in priority order: merges, the cells (zone x band, wings), deckhouses */
function genSpaces(S, H) {
  const out = [];
  const zs = S.z[0], zb = S.z[1], BW = Math.max(S.B, S.Bd) / 2 + 1;
  const bh = [zb + 5, ...S.bhd.slice().sort((a, b) => b - a), zs - 5];
  const ys = [-50, ...S.lv, 60];
  for (const m of S.merge) out.push({ id: m[0], name: m[1], use: m[2], kind: m[2] === 'M' && m[7] && m[7] < 6 ? 'enclosure' : 'hull', box: [-(m[7] || BW), m[5], m[3], m[7] || BW, m[6], m[4]], hull: true });
  let zn = 0;
  for (let i = 0; i < bh.length - 1; i++) {
    const z1 = bh[i], z0 = bh[i + 1], zc = (z0 + z1) / 2;
    zn++;
    for (let j = 0; j < ys.length - 1; j++) {
      const y0 = ys[j], y1 = ys[j + 1], yc = (Math.max(y0, H.keel(zc)) + Math.min(y1, H.deck(zc))) / 2;
      const nm = (S.names || []).find(n => zc >= n[0] && zc <= n[1] && yc >= n[2] && yc <= n[3]);
      const low = j === 0 && S.lv.length > 1 && !S.sub;
      const base = nm ? { id: nm[4], name: nm[5], use: nm[6] } : low ? { id: 'DB', name: 'Double bottom · tanks', use: 'W' } : { id: 'SP', name: ['Stores', 'Berthing', 'Offices · shops', 'Living spaces'][Math.min(3, j - 1 < 0 ? 0 : j - 1)], use: j <= 1 ? 'A' : 'L' };
      const id = `${base.id}${zn}${S.lv.length > 1 ? '-' + (j + 1) : ''}`;
      const wing = S.wing && y0 >= S.wing[0] - 1e-6 && y1 <= S.wing[1] + 1e-6 ? S.wing[2] : 0;
      if (wing) {
        const xi = S.B / 2 - wing;
        out.push({ id: id + 'P', name: 'Side protection · port', use: 'V', kind: 'void', box: [-BW, y0, z0, -xi, y1, z1], hull: true });
        out.push({ id: id + 'S', name: 'Side protection · starboard', use: 'V', kind: 'void', box: [xi, y0, z0, BW, y1, z1], hull: true });
        out.push({ id, name: base.name, use: base.use, kind: 'hull', box: [-xi, y0, z0, xi, y1, z1], hull: true });
      } else out.push({ id, name: base.name, use: base.use, kind: 'W F J'.includes(base.use) ? 'tank' : 'hull', box: [-BW, y0, z0, BW, y1, z1], hull: true });
    }
  }
  for (const h of S.houses || []) out.push({ id: h[0], name: h[1], use: h[2], kind: h[2] === 'V' ? 'void' : 'house', box: h.slice(3, 9), hull: false });
  return out;
}
function ddgSpaces() {
  const out = [];
  for (const c of DDG_COMPS) {
    const num = c[2], use = num ? num[num.length - 1] : 'Q';
    out.push({ id: c[0], name: c[1], num, use: c[3] === 'enclosure' ? 'M' : use, kind: c[3], box: c.slice(5, 11), hull: c[3] !== 'house', vol: c[4] });
  }
  // the VLS enclosures first (they sit inside the zone cells' boxes)
  out.sort((a, b) => (a.kind === 'enclosure' ? 0 : 1) - (b.kind === 'enclosure' ? 0 : 1));
  return out;
}

/* ------------------------------------------------------------------------------------------------ build */
const CACHE = new Map();
export function hasLayout(type) { return type === 'ddg' || !!GEN[type]; }
export function layoutOf(type) {
  if (CACHE.has(type)) return CACHE.get(type);
  const L = hasLayout(type) ? build(type) : null;
  CACHE.set(type, L);
  return L;
}

function build(type) {
  const ddg = type === 'ddg', S = GEN[type];
  const H = ddg ? ddgHull() : genHull(S);
  let sp = ddg ? ddgSpaces() : genSpaces(S, H);
  // the voxel grid's extent
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  const zr = ddg ? [-77.6, 77.6] : S.z;
  for (const s of sp) {
    const b = s.box;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]);
  }
  z0 = Math.max(z0, zr[0] - 1); z1 = Math.min(z1, zr[1] + 1);
  const len = zr[1] - zr[0];
  const DZ = len > 200 ? 2 : 1, DX = len > 200 ? 1 : .5, DY = .5;
  const hw = Math.min(x1 - x0, 90) / 2, xm = (x0 + x1) / 2;
  x0 = xm - hw; x1 = xm + hw;
  y0 = Math.max(y0, -16); y1 = Math.min(y1, 45);
  const grid = { x0, y0, z0, DX, DY, DZ, NX: Math.ceil((x1 - x0) / DX), NY: Math.ceil((y1 - y0) / DY), NZ: Math.ceil((z1 - z0) / DZ) };
  let vx = voxelize(sp, H, grid);
  if (!ddg) {                                    // cells a merge covers whole hold nothing: drop them
    const keep = sp.filter((s, i) => vx.V[i] > 0);
    if (keep.length < sp.length) { sp = keep; vx = voxelize(sp, H, grid); }
  }
  const n = sp.length, { G, V, BB } = vx, { NX, NY, NZ } = grid;
  const at = (x, y, z) => {
    const i = Math.floor((x - x0) / DX), j = Math.floor((y - y0) / DY), k = Math.floor((z - z0) / DZ);
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return y < 0 ? SEA : AIR;
    const c = G[(k * NY + j) * NX + i];
    return c ? c - 1 : y < 0 ? SEA : AIR;
  };
  grid.G = G;
  const L = {
    type, n, ids: sp.map(s => s.id), names: sp.map(s => s.name), nums: sp.map(s => s.num || ''), kind: sp.map(s => s.kind), use: sp.map(s => s.use),
    box: new Float64Array(6 * n), vol: new Float64Array(n), perm: new Float64Array(n), floorA: new Float64Array(n),
    hb: H.hb, deck: H.deck, keel: H.keel, at, grid,
    dc: ddg ? 3.9 : S.dc, sub: !!(S && S.sub),
  };
  for (let i = 0; i < n; i++) {
    const got = V[i] > 0;
    for (let q = 0; q < 6; q++) L.box[i * 6 + q] = got && !ddg ? BB[i * 6 + q] : sp[i].box[q];
    L.vol[i] = ddg ? sp[i].vol : Math.max(got ? V[i] : 0, 1);
    L.perm[i] = PERM[L.use[i]] !== undefined ? PERM[L.use[i]] : .9;
    const h = Math.max(.5, L.box[i * 6 + 4] - L.box[i * 6 + 1]);
    L.floorA[i] = L.vol[i] / h;
  }
  if (ddg) bndsFromDDG(L); else bndsFromGrid(L, S);
  finish(L, type);
  return L;
}

/* which space holds each voxel (1 + index; 0 outside), the spaces' voxel volumes and bounds */
function voxelize(sp, H, g) {
  const { x0, y0, z0, DX, DY, DZ, NX, NY, NZ } = g, n = sp.length;
  const G = new Uint8Array(NX * NY * NZ), V = new Float64Array(n), BB = new Float64Array(6 * n);
  for (let i = 0; i < n; i++) { BB[i * 6] = BB[i * 6 + 1] = BB[i * 6 + 2] = 1e9; BB[i * 6 + 3] = BB[i * 6 + 4] = BB[i * 6 + 5] = -1e9; }
  const inBox = (b, x, y, z) => x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5];
  const dv = DX * DY * DZ;
  const hullS = [], houseS = [];
  for (let k = 0; k < NZ; k++) {
    const z = z0 + (k + .5) * DZ, dk = H.deck(z);
    // the spaces this slice can hold, in priority order
    hullS.length = 0; houseS.length = 0;
    for (let s = 0; s < n; s++) { const b = sp[s].box; if (z >= b[2] && z <= b[5]) (sp[s].hull ? hullS : houseS).push(s); }
    for (let j = 0; j < NY; j++) {
      const y = y0 + (j + .5) * DY, hbv = H.hb(z, y), inHull = hbv >= 0, above = y > dk;
      for (let i = 0; i < NX; i++) {
        const x = x0 + (i + .5) * DX;
        let c = -1;
        if (inHull && Math.abs(x) <= hbv) { for (let q = 0; q < hullS.length; q++) { const s = hullS[q]; if (inBox(sp[s].box, x, y, z)) { c = s; break; } } }
        else if (above || y > 0) { for (let q = 0; q < houseS.length; q++) { const s = houseS[q]; if (inBox(sp[s].box, x, y, z)) { c = s; break; } } }
        if (c < 0) continue;
        G[(k * NY + j) * NX + i] = c + 1;
        V[c] += dv;
        const o = c * 6;
        if (x - DX / 2 < BB[o]) BB[o] = x - DX / 2; if (y - DY / 2 < BB[o + 1]) BB[o + 1] = y - DY / 2; if (z - DZ / 2 < BB[o + 2]) BB[o + 2] = z - DZ / 2;
        if (x + DX / 2 > BB[o + 3]) BB[o + 3] = x + DX / 2; if (y + DY / 2 > BB[o + 4]) BB[o + 4] = y + DY / 2; if (z + DZ / 2 > BB[o + 5]) BB[o + 5] = z + DZ / 2;
      }
    }
  }
  return { G, V, BB };
}

/* boundaries: the bench's (DDG) */
function bndsFromDDG(L) {
  const B = DDG_BNDS.filter(b => b[0] >= 0);
  // the spaces were re-ordered (enclosures first): map the generated indices
  const order = DDG_COMPS.map(c => L.ids.indexOf(c[0]));
  L.bn = B.length;
  alloc(L, B.length);
  B.forEach((b, k) => {
    L.bA[k] = order[b[0]]; L.bB[k] = b[1] >= 0 ? order[b[1]] : b[1]; L.bKind[k] = b[2]; L.bArea[k] = b[3]; L.bT[k] = b[4] || 8; L.bAx[k] = b[5];
    for (let q = 0; q < 6; q++) L.bBox[k * 6 + q] = b[6 + q];
    L.bOpen[k] = b[12] || 0; L.bHangar[k] = b[13] || 0;
  });
}
function alloc(L, m) {
  L.bA = new Int16Array(m); L.bB = new Int16Array(m); L.bKind = new Array(m); L.bArea = new Float64Array(m); L.bT = new Float64Array(m);
  L.bAx = new Int8Array(m); L.bBox = new Float64Array(6 * m); L.bOpen = new Float64Array(m); L.bHangar = new Float64Array(m);
}
/* boundaries: counted from the voxel faces between different spaces (generic layouts) */
function bndsFromGrid(L, S) {
  const { G, x0, y0, z0, DX, DY, DZ, NX, NY, NZ } = L.grid, n = L.n;
  const map = new Map(), list = [];
  const face = (a, b, ax, x, y, z, A) => {
    // a: the space; b: the other (or SEA / AIR)
    const lo = Math.max(a, b), hi = Math.min(a, b);
    const key = lo * 1024 + (hi + 2) * 4 + ax;
    let e = map.get(key);
    if (!e) { e = { a: lo, b: hi, ax, A: 0, bb: [1e9, 1e9, 1e9, -1e9, -1e9, -1e9] }; map.set(key, e); list.push(e); }
    e.A += A;
    if (x < e.bb[0]) e.bb[0] = x; if (y < e.bb[1]) e.bb[1] = y; if (z < e.bb[2]) e.bb[2] = z;
    if (x > e.bb[3]) e.bb[3] = x; if (y > e.bb[4]) e.bb[4] = y; if (z > e.bb[5]) e.bb[5] = z;
  };
  const cell = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) ? 0 : G[(k * NY + j) * NX + i];
  const out = (j) => (y0 + (j + .5) * DY) < 0 ? -1 : -2;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = G[(k * NY + j) * NX + i];
    const x = x0 + (i + .5) * DX, y = y0 + (j + .5) * DY, z = z0 + (k + .5) * DZ;
    // +x, +y, +z neighbours (each face once); a face to the outside from either side
    const nx = cell(i + 1, j, k), ny = cell(i, j + 1, k), nz = cell(i, j, k + 1);
    if (c !== nx) { if (c && nx) face(c - 1, nx - 1, 0, x + DX / 2, y, z, DY * DZ); else if (c) face(c - 1, out(j), 0, x + DX / 2, y, z, DY * DZ); else face(nx - 1, out(j), 0, x + DX / 2, y, z, DY * DZ); }
    if (c !== ny) { if (c && ny) face(c - 1, ny - 1, 1, x, y + DY / 2, z, DX * DZ); else if (c) face(c - 1, -2, 1, x, y + DY / 2, z, DX * DZ); else face(ny - 1, out(j), 1, x, y + DY / 2, z, DX * DZ); }
    if (c !== nz) { if (c && nz) face(c - 1, nz - 1, 2, x, y, z + DZ / 2, DX * DY); else if (c) face(c - 1, out(j), 2, x, y, z + DZ / 2, DX * DY); else face(nz - 1, out(j), 2, x, y, z + DZ / 2, DX * DY); }
    if (i === 0 && c) face(c - 1, out(j), 0, x - DX / 2, y, z, DY * DZ);
    if (j === 0 && c) face(c - 1, -1, 1, x, y - DY / 2, z, DX * DZ);
    if (k === 0 && c) face(c - 1, out(j), 2, x, y, z - DZ / 2, DX * DY);
  }
  // voxel faces over-count a curved shell's area a little (staircase): scale the shell by ~0.8
  const keep = list.filter(e => e.A > .2);
  L.bn = keep.length;
  alloc(L, keep.length);
  const isH = i => i >= 0 && L.kind[i] === 'house';
  keep.forEach((e, k) => {
    const enc = L.kind[e.a] === 'enclosure' || (e.b >= 0 && L.kind[e.b] === 'enclosure');
    let kind, t;
    if (e.b < 0) { kind = isH(e.a) ? 'house' : 'shell'; t = kind === 'house' ? S.th : S.ts; }
    else if (isH(e.a) && isH(e.b)) { kind = 'house'; t = S.th; }
    else if (e.ax === 1) { kind = 'deck'; t = S.td; }
    else if (isH(e.a) || isH(e.b)) { kind = 'house'; t = S.th; }
    else if (e.ax === 2) { kind = enc ? 'enclosure' : 'bulkhead'; t = S.tb; }
    else { kind = enc ? 'enclosure' : 'girder'; t = S.tb; }
    L.bA[k] = e.a; L.bB[k] = e.b; L.bKind[k] = kind; L.bArea[k] = kind === 'shell' ? e.A * .82 : e.A; L.bT[k] = t; L.bAx[k] = e.ax;
    for (let q = 0; q < 6; q++) L.bBox[k * 6 + q] = e.bb[q];
  });
}

/* openings, the pair index, the hydrostatics */
function finish(L, type) {
  const n = L.n, m = L.bn;
  L.bWT = new Uint8Array(m); L.bDoor = new Float64Array(m); L.bDoorP = new Float64Array(m);
  L.pairIx = new Int16Array((n + 2) * (n + 2)).fill(-1);
  L.cb = Array.from({ length: n }, () => []);
  const tankish = i => L.kind[i] === 'tank' || L.use[i] === 'W' || L.use[i] === 'F' || L.use[i] === 'J';
  for (let k = 0; k < m; k++) {
    const a = L.bA[k], b = L.bB[k], kd = L.bKind[k];
    L.cb[a].push(k); if (b >= 0) L.cb[b].push(k);
    L.pairIx[(a + 2) * (n + 2) + (b + 2)] = k; L.pairIx[(b + 2) * (n + 2) + (a + 2)] = k;
    L.bWT[k] = kd === 'house' || kd === 'shell' && L.bBox[k * 6 + 1] > 0 && L.kind[a] === 'house' ? 0 : 1;
    // doors and hatches (none into tanks or voids)
    if (b >= 0 && !tankish(a) && !tankish(b) && L.kind[a] !== 'void' && L.kind[b] !== 'void') {
      if (kd === 'deck' || (kd === 'house' && L.bAx[k] === 1)) { L.bDoor[k] = OPENINGS.hatch.area; L.bDoorP[k] = OPENINGS.hatch.p; }
      else if ((kd === 'bulkhead' || kd === 'enclosure' || kd === 'house') && L.bBox[k * 6 + 4] >= L.dc - .3) { L.bDoor[k] = OPENINGS.door.area; L.bDoorP[k] = OPENINGS.door.p; }
    } else if (b === AIR && L.kind[a] === 'house' && L.bAx[k] !== 1) { L.bDoor[k] = OPENINGS.weather.area; L.bDoorP[k] = OPENINGS.weather.p; }
    if (L.bHangar[k] > 0) { L.bDoor[k] = L.bHangar[k]; L.bDoorP[k] = 30e3; }
  }
  L.pair = (a, b) => L.pairIx[(a + 2) * (L.n + 2) + (b + 2)];
  L.hydro = hydro(L, type);
}

/* waterplane and stability, from the hull form (displacement from the unit's mass; GM per class: estimates) */
const GM0 = { ddg: 1.6, cg: 1.5, carrier: 3.2, lhd: 2.6, lcs: 6, ssn: .5, ssk: .4 };
const MASS = { ddg: 9200, cg: 9800, carrier: 101600, lhd: 40500, lcs: 3100, ssn: 7800, ssk: 3950 };
function hydro(L, type) {
  let Awp = 0, Mz = 0, It = 0, zmin = 1e9, zmax = -1e9, Bmax = 0;
  const dz = .5;
  for (let z = -200; z <= 200; z += dz) {
    const b = L.hb(z, -.01); if (b <= 0) continue;
    Awp += 2 * b * dz; Mz += 2 * b * z * dz; It += (2 / 3) * b * b * b * dz;
    zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); Bmax = Math.max(Bmax, 2 * b);
  }
  const zF = Awp > 0 ? Mz / Awp : 0;
  let Il = 0;
  for (let z = -200; z <= 200; z += dz) { const b = L.hb(z, -.01); if (b > 0) Il += 2 * b * (z - zF) * (z - zF) * dz; }
  const disp = MASS[type] || 5000, vol = disp / 1.025;
  const T = -L.keel(zF), BM = It / vol, KB = .55 * T, KM = KB + BM, GM = GM0[type] || 1.5, KG = KM - GM, GML = Il / vol;
  // reserve buoyancy: the watertight hull between the waterline and the main deck (a boat: its whole volume)
  let reserve = 0;
  for (let i = 0; i < L.n; i++) if (L.kind[i] !== 'house' && L.kind[i] !== 'void') {
    const y0 = L.box[i * 6 + 1], y1 = L.box[i * 6 + 4];
    if (L.sub) reserve += L.vol[i];
    else if (y1 > 0) reserve += L.vol[i] * sat((y1 - Math.max(0, y0)) / Math.max(.5, y1 - y0));
  }
  const fbMid = L.deck(zF);
  return { L: zmax - zmin, B: Bmax, T, Awp, zF, zmin, zmax, GM, GML, KG, KM, disp, reserve: L.sub ? reserve * .12 : reserve, fbMid, sub: L.sub };
}

/* checked in the tests: every class builds, its spaces hold most of the hull, boundaries close */
export function layoutStats(type) {
  const L = layoutOf(type); if (!L) return null;
  let hullVol = 0, houseVol = 0, zero = 0;
  for (let i = 0; i < L.n; i++) { if (L.kind[i] === 'house') houseVol += L.vol[i]; else hullVol += L.vol[i]; if (L.vol[i] <= 1) zero++; }
  let doors = 0, wt = 0, shellSea = 0;
  for (let k = 0; k < L.bn; k++) { if (L.bDoor[k] > 0) doors++; if (L.bKind[k] === 'bulkhead') wt++; if (L.bB[k] === SEA) shellSea += L.bArea[k]; }
  return { n: L.n, bn: L.bn, hullVol: Math.round(hullVol), houseVol: Math.round(houseVol), zero, doors, bulkheads: wt, shellSea: Math.round(shellSea), hydro: L.hydro };
}
