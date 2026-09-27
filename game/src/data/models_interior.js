/* ONIKS · ship interiors as point-cloud geometry: watertight bulkheads with their doors, decks and flats with hatches
   and ladders, the inner bottom and the double-bottom floors, the web frames, passageways, cable trays and the
   firemain, and the main spaces' contents as recognisable generic shapes (gas turbines, reduction gears, gas turbine
   generators, switchboards, pumps and piping, magazines, VLS modules, berthing racks, messes and the galley, stores,
   tanks, the steering gear, the CIC). Public-reference level: layouts are generic, contents are closed volumes,
   munitions closed shells; nothing here describes how a system works.

   DDG-51 (destroyer, destroyer_cut): laid out on game/concepts/blast/burke_structure.js (the same frames, the 13
     watertight bulkheads, the deck levels, the VLS enclosures and the 14 watertight zones, the compartments by their
     ids), so a part named after a compartment is that compartment in the structure / flooding systems. The hull form
     is Burke's (= the game model's), copied here (importing burke_structure.js would build its 2,130 panels at load).
   CG-47, CVN-68, LHD-1, LCS-2: simpler generic interiors on each class's own subdivision (bulkheads, decks, the main
     spaces), fitted to the model's own hull (its sampled dots: hullOf()).

   Parts (all inside: true, hidden unless seen):
     ixS01 .. ixSnn   structure of watertight zone nn (forward to aft): the zone's forward bulkhead (plate, stiffeners,
                      its WT doors), the decks, flats and inner bottom in the zone, web frames, the passage partitions,
                      cable trays and the firemain overhead, hatches and ladders
     ix_<COMP>        contents of one compartment (burke ids on the DDG: ix_MER1, ix_AMR1, ix_BTH5, ix_MAG2 ...;
                      class ids elsewhere). part.comp = the compartment id, part.zones = the zones it spans,
                      part.sys = 'structure' | 'machinery' | 'electrical' | 'magazine' | 'living' | 'stores' | 'tank' |
                      'control' | 'aviation' | 'deck'
     the unit models also get the cut model's machinery / VLS modules / shaft lines where the cut has them
     (mach, trunks, shaftIn, vlsBF, vlsBA on the DDG), under the same names, gated the same way.
   Through a hole (for the blast / scars owners): the engine's pocket drop (blastGLSL / scarGLSL: dots behind a torn
   cell and the plug of pushed-back splats) removes these parts' dots like the hull's; to see them the pocket test has
   to spare inside parts (part.inside) and the plug has to sit past them, and whoever draws a holed ship sets
   d.st.interior = interiorZones(key, hole, 8) (INTERIOR.zonesNear).
   Visibility: show(st) = st.xray (Inspect, the hit replay, the museum) || st.interior, where st.interior is true (all
   zones) or { all } or { <zone number>: 1, ... } (only those zones: the systems that open a hole switch on the zones
   round it, interiorZones()). Zero cost while hidden (the engine skips a part whose show() is false before sampling).
   Sampling: plates sparse (ds 2.2-3), their edges and the door / hatch frames dense, small contents flagged fine
   (skipped at the coarse levels).

   Exports (installInterior(kit), called once by data/models.js):
     wrap        { key: model => model with its interior } for destroyer, destroyer_cut, cg, cg_cut, carrier,
                 carrier_cut, lhd, lhd_cut, lcs, lcs_cut
     ZONES       { key: [{ no, z0, z1, name }] } (model frame)
     COMPS       { key: [{ id, name, zone, box: [x0, y0, z0, x1, y1, z1] (bounds of what is drawn), sys }] }
                 (the spaces themselves: data/ship_layouts.js layoutOf; the DDG's ids are burke's, the others' GEN's)
     anatomy(key, cutParts) -> anatomy entries for the cut model's interior parts (data/anatomy.js appends them)
   interiorZones(key, p, r) -> { zone: 1 } for the zones within r m of model-frame point p (along the length)
   interiorOn(v, zones) -> the gate test used by show() */
const M3 = window.M3, GEO = window.GEO;
const { V } = M3;
const { hex, box, lathe, cyl, panel, line } = GEO;
const PI = Math.PI, TAU = 2 * PI;
const FX = [1, 0, 0], FY = [0, 1, 0], FZ = [0, 0, 1];
const O = (...a) => Object.assign({}, ...a);
const fn = o => O({ fine: true }, o);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const ssE = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
let K = null;

/* ================================================================ gating */
export function interiorOn(v, zones) {
  if (v === true || v === 1) return true;
  if (!v || typeof v !== 'object') return false;
  if (v.all) return true;
  for (let i = 0; i < zones.length; i++) if (v[zones[i]]) return true;
  return false;
}
const showFor = zones => st => !!(st.xray || (st.interior && interiorOn(st.interior, zones)));
const ixPart = (name, label, prims, meta) => O({ name, label, prims, inside: true, show: showFor(meta.zones) }, meta);

/* ================================================================ drawing kit (model frame: +Z bow, +Y up, +X stbd) */
const DS = { plate: 4.6, deck: 4.4, wall: 5, edge: .45, frame: 1.1, fine: .6 };
function quad(P, a, b, c, d, ds, o) {
  const ar = V.len(V.cross(V.sub(b, a), V.sub(d, a))) + V.len(V.cross(V.sub(c, b), V.sub(d, c)));
  if (ar < .02) return;
  P.push(panel([a, b, c, d], O({ ds }, o)));
}
const edge = (P, pts, o) => { if (pts.length > 1) P.push(line(pts, O({ w: .6, ds: DS.edge }, o))); };
const fedge = (P, pts, o) => { if (pts.length > 1) P.push(line(pts, fn(O({ w: .35, ds: DS.fine }, o)))); };
/* a closed volume: sparse faces, its twelve edges dense (a LiDAR box, never a slab) */
function vol(P, a, b, o) {
  o = o || {};
  const f = o.fine ? { fine: true } : {};
  P.push(box(a, b, O({ bottom: !o.open, ds: (o.ds || 2.4) * 1.3 }, f)));
  const c = (i, j, k) => [i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]];
  for (const [p, q] of [[c(0, 0, 0), c(1, 0, 0)], [c(0, 1, 0), c(1, 1, 0)], [c(0, 0, 1), c(1, 0, 1)], [c(0, 1, 1), c(1, 1, 1)],
    [c(0, 0, 0), c(0, 1, 0)], [c(1, 0, 0), c(1, 1, 0)], [c(0, 0, 1), c(0, 1, 1)], [c(1, 0, 1), c(1, 1, 1)],
    [c(0, 0, 0), c(0, 0, 1)], [c(1, 0, 0), c(1, 0, 1)], [c(0, 1, 0), c(0, 1, 1)], [c(1, 1, 0), c(1, 1, 1)]]) P.push(line([p, q], O({ w: .5, ds: o.de || DS.edge }, f)));
}
/* a drum a -> b (closed, dotted rims) */
function drum(P, a, b, r, o) {
  o = o || {};
  const d = V.sub(b, a), L = V.len(d);
  P.push(lathe(a, d, [[0, r], [L, r]], O({ n: Math.max(10, Math.min(28, Math.round(r * 18))), gen: 2, rings: [0, 1], caps: true, ds: o.ds || 1.6 }, o.fine ? { fine: true } : {})));
}
/* a pipe run through points */
function pipe(P, pts, r, o) {
  for (let i = 0; i < pts.length - 1; i++) P.push(lathe(pts[i], V.sub(pts[i + 1], pts[i]), [[0, r], [V.dist(pts[i], pts[i + 1]), r]], O({ n: 8, gen: 0, ds: 1.3 }, o)));
}
/* a cable tray a -> b (horizontal), w wide: its side rails dense, rungs, three bundles along it */
function tray(P, a, b, w) {
  const d = V.norm(V.sub(b, a)), s = V.norm(V.cross(FY, d)), hw = w / 2;
  const q = (p, u, y) => V.add(V.add(p, V.mul(s, u)), [0, y || 0, 0]);
  quad(P, q(a, -hw), q(a, hw), q(b, hw), q(b, -hw), 2.2);
  edge(P, [q(a, -hw, .08), q(b, -hw, .08)], { w: .5 }); edge(P, [q(a, hw, .08), q(b, hw, .08)], { w: .5 });
  for (const u of [-.25, 0, .25]) fedge(P, [q(a, u * w, .05), q(b, u * w, .05)]);
}
/* a vertical ladder x, z from yTop down to yBot: two rails, rungs every 0.3 m (fine) */
function ladder(P, x, z, yTop, yBot, along) {
  const ax = along ? [0, 0, 1] : [1, 0, 0];
  for (const s of [-.22, .22]) edge(P, [[x + ax[0] * s, yBot, z + ax[2] * s], [x + ax[0] * s, yTop + .9, z + ax[2] * s]], { w: .45 });
  for (let y = yBot + .3; y < yTop; y += .3) P.push(line([[x - ax[0] * .22, y, z - ax[2] * .22], [x + ax[0] * .22, y, z + ax[2] * .22]], fn({ w: .3, ds: .8 })));
}
/* a cabinet row x0..x1 (or along z), y0 up h, depth d: the row a volume, the cabinets' seams and meter faces fine */
function cabinets(P, a, b, h, d, o) {
  o = o || {};
  const along = Math.abs(b[2] - a[2]) > Math.abs(b[0] - a[0]);
  const lo = along ? [a[0] - d / 2, a[1], Math.min(a[2], b[2])] : [Math.min(a[0], b[0]), a[1], a[2] - d / 2];
  const hi = along ? [a[0] + d / 2, a[1] + h, Math.max(a[2], b[2])] : [Math.max(a[0], b[0]), a[1] + h, a[2] + d / 2];
  vol(P, lo, hi, { ds: o.ds || 2.4 });
  const L = along ? hi[2] - lo[2] : hi[0] - lo[0], n = Math.max(1, Math.round(L / (o.w || .8)));
  const face = o.face || 1;   // which long face the doors are on (+1 / -1 across)
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (along) { const z = mix(lo[2], hi[2], t), x = face > 0 ? hi[0] : lo[0]; P.push(line([[x, lo[1], z], [x, hi[1], z]], fn({ w: .35, ds: .6 }))); }
    else { const x = mix(lo[0], hi[0], t), z = face > 0 ? hi[2] : lo[2]; P.push(line([[x, lo[1], z], [x, hi[1], z]], fn({ w: .35, ds: .6 }))); }
  }
  // meter / panel strip at eye height on the door face
  const ym = a[1] + h * .72;
  if (along) { const x = face > 0 ? hi[0] + .01 : lo[0] - .01; P.push(line([[x, ym, lo[2] + .1], [x, ym, hi[2] - .1]], fn({ w: .35, ds: .5 }))); }
  else { const z = face > 0 ? hi[2] + .01 : lo[2] - .01; P.push(line([[lo[0] + .1, ym, z], [hi[0] - .1, ym, z]], fn({ w: .35, ds: .5 }))); }
}
/* a centrifugal pump with its motor, vertical, standing at c (floor) */
function pump(P, c, s) {
  s = s || 1;
  const [x, y, z] = c;
  P.push(box([x - .45 * s, y, z - .35 * s], [x + .45 * s, y + .12, z + .35 * s], fn({ ds: 1.2 })));
  P.push(lathe([x, y + .12, z], FY, [[0, .32 * s], [.34 * s, .32 * s]], { n: 14, gen: 2, rings: [0, 1], caps: true, ds: 1.3 }));
  P.push(lathe([x, y + .12 + .34 * s, z], FY, [[0, .12 * s], [.12 * s, .12 * s], [.14 * s, .26 * s], [.84 * s, .26 * s], [.9 * s, .16 * s]], { n: 14, gen: 2, rings: [2, 3], caps: true, ds: 1.3 }));
  pipe(P, [[x + .3 * s, y + .3 * s, z], [x + .75 * s, y + .3 * s, z]], .08 * s, { fine: true });
  pipe(P, [[x, y + .3 * s, z + .3 * s], [x, y + .3 * s, z + .7 * s]], .08 * s, { fine: true });
}
/* a horizontal drum on saddles (AC plant shell, a heat exchanger, an air receiver laid down) a -> b along z */
function hdrum(P, a, b, r) {
  drum(P, a, b, r, { ds: 1.4 });
  for (const t of [.2, .8]) { const p = V.lerp(a, b, t); P.push(box([p[0] - r * .7, p[1] - r - .3, p[2] - .08], [p[0] + r * .7, p[1] - r * .6, p[2] + .08], fn({ ds: 1.2 }))); }
}
/* a gas turbine generator along z from z0 (the turbine forward): enclosure, reduction gear, generator, ducts to yUp */
function gtg(P, x, y, z0, dir, yUp, k) {
  k = k || 1;
  const zA = z0, zB = z0 + dir * 5.2 * k, zC = zB + dir * .7 * k, zD = zC + dir * 2.6 * k;
  vol(P, [x - 1.1, y, Math.min(zA, zB)], [x + 1.1, y + 2.5, Math.max(zA, zB)], { ds: 2.2 });
  vol(P, [x - .8, y, Math.min(zB, zC)], [x + .8, y + 1.6, Math.max(zB, zC)], { ds: 1.8, fine: true });
  drum(P, [x, y + 1.0, zC], [x, y + 1.0, zD], .8, { ds: 1.4 });
  P.push(lathe([x, y + 1.0, zD], [0, 0, dir], [[0, .55], [.2, .35], [.25, 0]], fn({ n: 16, gen: 2 })));
  P.push(box([x - .9, y, Math.min(zC, zD) - .1], [x + .9, y + .2, Math.max(zC, zD) + .1], fn({ ds: 1.4 })));
  // intake (forward of centre) and exhaust (aft) ducts up out of the space
  const zi = zA + dir * 1.2 * k, ze = zA + dir * 3.8 * k;
  if (yUp > y + 2.6) {
    vol(P, [x - .7, y + 2.5, zi - .6], [x + .7, yUp, zi + .6], { ds: 2.6, open: true });
    P.push(lathe([x, y + 2.5, ze], FY, [[0, .5], [yUp - y - 2.5, .5]], { n: 16, gen: 2, rings: [0, 1], ds: 2.2 }));
  }
}
/* a three-high berthing rack (1.95 x 0.72), along z at x, floor y */
function rack(P, x, y, z, along) {
  const hl = .98, hw = .36, ax = along ? [hw, hl] : [hl, hw];
  for (const h of [.3, .95, 1.6]) P.push(box([x - ax[0], y + h, z - ax[1]], [x + ax[0], y + h + .16, z + ax[1]], { bottom: true, ds: 2.8 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(line([[x + sx * ax[0], y, z + sz * ax[1]], [x + sx * ax[0], y + 1.95, z + sz * ax[1]]], fn({ w: .4, ds: .7 })));
  P.push(box([x - ax[0], y, z - ax[1]], [x + ax[0], y + .28, z + ax[1]], fn({ ds: 2.2 })));
}
/* a mess table with its benches (along z), floor y */
function messTable(P, x, y, z, L) {
  P.push(box([x - .38, y + .7, z - L / 2], [x + .38, y + .76, z + L / 2], { ds: 1.4 }));
  for (const s of [-1, 1]) P.push(box([x + s * .7 - .16, y + .4, z - L / 2], [x + s * .7 + .16, y + .45, z + L / 2], fn({ ds: 1.4 })));
  for (const sz of [-1, 1]) P.push(line([[x, y, z + sz * (L / 2 - .2)], [x, y + .7, z + sz * (L / 2 - .2)]], fn({ w: .35, ds: .6 })));
}
/* a storage rack: frame and four shelves, along z */
function shelves(P, x, y, z0, z1, h, d, along) {
  const a = along === false ? [z0, y, x - d / 2] : [x - d / 2, y, z0], b = along === false ? [z1, y + h, x + d / 2] : [x + d / 2, y + h, z1];
  vol(P, a, b, { ds: 4.4, open: true, fine: false });
  for (let k = 1; k < 4; k++) { const yy = y + h * k / 4; P.push(panel([[a[0], yy, a[2]], [b[0], yy, a[2]], [b[0], yy, b[2]], [a[0], yy, b[2]]], fn({ ds: 4 }))); }
}
/* a tank's contents: the liquid surface at level f of the space, a swash plate, a sounding tube and the suction */
function tankFill(P, S, z0, z1, y0, y1, f, xs) {
  const yl = mix(y0, y1, f), zs = [];
  for (let z = z0 + .1; z < z1; z += 1.2) zs.push(z); zs.push(z1 - .1);
  for (let i = 0; i < zs.length - 1; i++) {
    const wa = S.hbc(zs[i], yl), wb = S.hbc(zs[i + 1], yl);
    const xa0 = xs ? Math.max(-wa, xs[0]) : -wa, xa1 = xs ? Math.min(wa, xs[1]) : wa, xb0 = xs ? Math.max(-wb, xs[0]) : -wb, xb1 = xs ? Math.min(wb, xs[1]) : wb;
    if (xa1 - xa0 > .2 && xb1 - xb0 > .2) quad(P, [xa0, yl, zs[i]], [xa1, yl, zs[i]], [xb1, yl, zs[i + 1]], [xb0, yl, zs[i + 1]], 2.6);
  }
  const zm = (z0 + z1) / 2;
  P.push(line([[1.2, y0 + .1, zm - .6], [1.2, y1 + .5, zm - .6]], { w: .5, ds: .5 }));             // sounding tube
  pipe(P, [[-1.5, y0 + .25, z0 + .6], [-1.5, y0 + .25, z1 - .6], [-1.5, y1 + .3, z1 - .6]], .09, { fine: true });
}

/* ================================================================ structure builders (S: the ship's spec) */
/* hull half-breadth clamped (m inside the plating), 0 where there is no hull */
function mkHbc(hb) { return (z, y) => { const w = hb(z, y); return w > .04 ? w - .03 : 0; }; }
/* a transverse bulkhead at z from its foot up to yTop, holes [{ x0, x1, y0, y1 }] (doors) */
function tBulkhead(S, P, z, yBot, yTop, holes, o) {
  o = o || {};
  const yk = Math.max(S.keel(z) + .03, yBot);
  const ys = new Set([yk, yTop]);
  for (let y = Math.ceil(yk / .9) * .9; y < yTop; y += .9) if (y > yk + .1) ys.add(y);
  for (const h of holes) { ys.add(h.y0); ys.add(h.y1); }
  const Y = [...ys].filter(y => y >= yk - 1e-6 && y <= yTop + 1e-6).sort((a, b) => a - b);
  const ds = o.ds || DS.plate;
  for (let i = 0; i < Y.length - 1; i++) {
    const ya = Y[i], yb = Y[i + 1];
    if (yb - ya < .02) continue;
    const w0 = S.hbc(z, ya + .005), w1 = S.hbc(z, yb - .005);
    if (w0 < .05 && w1 < .05) continue;
    const cuts = holes.filter(h => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).map(h => [h.x0, h.x1]).sort((a, b) => a[0] - b[0]);
    let a = null;      // null: the hull edge
    const segs = [];
    for (const c of cuts) { segs.push([a, c[0]]); a = c[1]; }
    segs.push([a, null]);
    for (const [s0, s1] of segs) {
      const xa0 = s0 === null ? -w0 : s0, xa1 = s0 === null ? -w1 : s0, xb0 = s1 === null ? w0 : s1, xb1 = s1 === null ? w1 : s1;
      if (xb0 - xa0 < .05 && xb1 - xa1 < .05) continue;
      quad(P, [xa0, ya, z], [xb0, ya, z], [xb1, yb, z], [xa1, yb, z], ds);
    }
  }
  // its edge along the shell (both sides) and the deck it meets
  const L = [], R_ = [];
  for (let k = 0; k < Y.length; k++) { const w = S.hbc(z, Y[k]); if (w > .05) { L.push([-w, Y[k], z]); R_.push([w, Y[k], z]); } }
  for (let y = yk + .45; y < yTop; y += .45) { const w = S.hbc(z, y); if (w > .05) { L.push([-w, y, z]); R_.push([w, y, z]); } }
  L.sort((p, q) => p[1] - q[1]); R_.sort((p, q) => p[1] - q[1]);
  edge(P, L.reverse().concat(R_), { w: .7 });
  if (L.length) edge(P, [[L[0][0], yTop, z], [-L[0][0], yTop, z]], { w: .6 });
  // vertical stiffeners every 1.22 m (fine), broken at the doors
  if (!o.noStiff) {
    const wm = S.hbc(z, yTop);
    for (let x = -Math.floor(wm / 1.22) * 1.22; x <= wm - .3; x += 1.22) {
      let yl = yk; while (yl < yTop && S.hbc(z, yl) < Math.abs(x) + .05) yl += .12;
      if (yTop - yl < .5) continue;
      const hs = holes.filter(h => x > h.x0 - .15 && x < h.x1 + .15).sort((p, q) => p.y0 - q.y0);
      let y0 = yl;
      for (const h of hs) { if (h.y0 - y0 > .3) P.push(line([[x, y0, z + .06], [x, h.y0 - .08, z + .06]], fn({ w: .35, ds: .8 }))); y0 = h.y1 + .08; }
      if (yTop - y0 > .3) P.push(line([[x, y0, z + .06], [x, yTop, z + .06]], fn({ w: .35, ds: .8 })));
    }
  }
}
/* a watertight door in a transverse bulkhead at z: opening 0.66 x 1.68 m on a 0.3 m sill; the leaf shut (Zebra), dogs */
const WTD = { w: .66, h: 1.68, sill: .3 };
function wtDoorHole(x, yDeck) { return { x0: x - WTD.w / 2, x1: x + WTD.w / 2, y0: yDeck + WTD.sill, y1: yDeck + WTD.sill + WTD.h }; }
function wtDoor(P, x, yDeck, z, sgn) {
  const h = wtDoorHole(x, yDeck), r = .16, pts = [];
  const cx = [h.x1 - r, h.x1 - r, h.x0 + r, h.x0 + r], cy = [h.y1 - r, h.y0 + r, h.y0 + r, h.y1 - r], a0 = [0, -PI / 2, PI, PI / 2];
  for (let k = 0; k < 4; k++) for (let i = 0; i <= 4; i++) { const a = a0[k] - i / 4 * PI / 2; pts.push([cx[k] + Math.cos(a) * r, cy[k] + Math.sin(a) * r, z]); }
  pts.push(pts[0]);
  edge(P, pts, { w: .9, ds: .35 });
  const zl = z + sgn * .09, out = pts.map(p => [x + (p[0] - x) * 1.12, yDeck + WTD.sill + WTD.h / 2 + (p[1] - yDeck - WTD.sill - WTD.h / 2) * 1.06, z + sgn * .03]);
  edge(P, out, { w: .5, ds: .5 });
  // the leaf, shut, with its dogs and hinges
  quad(P, [h.x0 + .02, h.y0 + .02, zl], [h.x1 - .02, h.y0 + .02, zl], [h.x1 - .02, h.y1 - .02, zl], [h.x0 + .02, h.y1 - .02, zl], 1.1);
  for (const [dx, dy] of [[h.x1 + .02, .25], [h.x1 + .02, .84], [h.x1 + .02, 1.43], [h.x0 - .02, .84], [x, 1.72], [x, -.04]]) {
    const yy = h.y0 + dy; P.push(box([dx - .04, yy - .04, zl - .03 * sgn], [dx + .04, yy + .04, zl + .06 * sgn], fn({ ds: .6 })));
  }
  for (const dy of [.3, 1.38]) P.push(box([h.x0 - .1, h.y0 + dy - .07, zl - .02], [h.x0 + .02, h.y0 + dy + .07, zl + .06 * sgn], fn({ ds: .6 })));
}
/* a deck plate at y between z0 and z1, trimmed to the hull, holes [{ x0, x1, z0, z1 }] */
function deckPlate(S, P, y, z0, z1, holes, o) {
  o = o || {};
  const zs = new Set([z0, z1]);
  for (let z = Math.ceil(z0 / 2.44) * 2.44; z < z1; z += 2.44) if (z > z0 + .1 && z < z1 - .1) zs.add(z);
  for (const h of holes) { if (h.z0 > z0 && h.z0 < z1) zs.add(h.z0); if (h.z1 > z0 && h.z1 < z1) zs.add(h.z1); }
  const Z = [...zs].sort((a, b) => a - b), ds = o.ds || DS.deck;
  const eL = [], eR = [];
  for (let i = 0; i < Z.length - 1; i++) {
    const za = Z[i], zb = Z[i + 1], zm = (za + zb) / 2;
    const w0 = S.hbc(za + .005, y), w1 = S.hbc(zb - .005, y);
    if (w0 < .05 && w1 < .05) continue;
    const cuts = holes.filter(h => h.z0 <= za + 1e-6 && h.z1 >= zb - 1e-6).map(h => [h.x0, h.x1]).sort((a, b) => a[0] - b[0]);
    let a = null; const segs = [];
    for (const c of cuts) { segs.push([a, c[0]]); a = c[1]; }
    segs.push([a, null]);
    for (const [s0, s1] of segs) {
      const xa0 = s0 === null ? -w0 : Math.max(-w0, s0), xa1 = s0 === null ? -w1 : Math.max(-w1, s0), xb0 = s1 === null ? w0 : Math.min(w0, s1), xb1 = s1 === null ? w1 : Math.min(w1, s1);
      if (xb0 - xa0 < .05 && xb1 - xa1 < .05) continue;
      quad(P, [xa0, y, za], [xb0, y, za], [xb1, y, zb], [xa1, y, zb], ds);
    }
    if (w0 > .05) { eL.push([-w0, y, za]); eR.push([w0, y, za]); }
    if (i === Z.length - 2 && w1 > .05) { eL.push([-w1, y, zb]); eR.push([w1, y, zb]); }
    // the deck beam under it at every frame (fine)
    if (!o.noBeams && Math.abs(za / 4.88 - Math.round(za / 4.88)) < .01 && w0 > .5) P.push(line([[-w0, y - .22, za], [w0, y - .22, za]], fn({ w: .3, ds: 1.0 })));
  }
  edge(P, eL, { w: .55 }); edge(P, eR, { w: .55 });
  for (const h of holes) if (h.coam) {
    // a hatch: its coaming, the scuttle's ring
    const c = [[h.x0, y, h.z0], [h.x1, y, h.z0], [h.x1, y, h.z1], [h.x0, y, h.z1]];
    edge(P, c.concat([c[0]]), { w: .9, ds: .35 });
    edge(P, c.concat([c[0]]).map(p => [p[0], y + .15, p[2]]), { w: .6, ds: .4 });
  }
}
/* web frames: the shell's frames seen from inside, both sides, at each frame station in (z0, z1) from yBot to the deck */
function webFrames(S, P, z0, z1, yBot, yTop, step) {
  step = step || 1;
  for (let k = Math.ceil(z0 / 2.44 / step) * step; k * 2.44 < z1; k += step) {
    const z = k * 2.44; if (z <= z0 + .05) continue;
    const yt = typeof yTop === 'function' ? yTop(z) : yTop;
    for (const s of [-1, 1]) {
      const pts = [];
      for (let y = Math.max(yBot, S.keel(z) + .1); y <= yt; y += .5) { const w = S.hbc(z, y); if (w > .1) pts.push([s * (w - .12), y, z]); }
      if (pts.length > 2) P.push(line(pts, fn({ w: .35, ds: DS.frame })));
    }
  }
}
/* the double bottom under an inner bottom at yIB: floors every other frame (the bottom shell to the tank top), the
   centre vertical keel */
function doubleBottom(S, P, z0, z1, yIB) {
  for (let k = Math.ceil(z0 / 4.88); k * 4.88 < z1; k++) {
    const z = k * 4.88, yk = S.keel(z);
    if (yk > yIB - .3) continue;
    const pts = [];
    for (const s of [-1, 1]) for (let y = yIB; y >= yk - .01; y -= .3) { const w = S.hbc(z, y); pts.push([s * w, y, z]); }
    const L = pts.slice(0, pts.length / 2), Rr = pts.slice(pts.length / 2).reverse();
    P.push(line(L.concat(Rr), fn({ w: .4, ds: .8 })));
  }
  const ZZ = []; for (let z = z0; z <= z1; z += 2.44) ZZ.push(z);
  for (let i = 0; i < ZZ.length - 1; i++) {
    const a = ZZ[i], b = ZZ[i + 1], ka = S.keel(a), kb = S.keel(b);
    if (ka < yIB - .2 && kb < yIB - .2) quad(P, [0, ka, a], [0, kb, b], [0, yIB, b], [0, yIB, a], 4.4);
  }
}
/* a longitudinal wall at x from y0 to y1(z) between z0 and z1, gaps [{ z0, z1, y1 }] (joiner doors) */
function lWall(P, x, y0, y1f, z0, z1, gaps, ds) {
  const y1 = typeof y1f === 'function' ? y1f : () => y1f;
  const G = (gaps || []).slice().sort((a, b) => a.z0 - b.z0);
  let za = z0;
  const run = (a, b) => { if (b - a < .1) return; const n = Math.max(1, Math.ceil((b - a) / 4)); for (let i = 0; i < n; i++) { const p = mix(a, b, i / n), q = mix(a, b, (i + 1) / n); quad(P, [x, y0, p], [x, y0, q], [x, y1(q), q], [x, y1(p), p], ds || DS.wall); } };
  for (const g of G) {
    run(za, g.z0);
    // over the door
    quad(P, [x, y0 + (g.h || 1.95), g.z0], [x, y0 + (g.h || 1.95), g.z1], [x, y1(g.z1), g.z1], [x, y1(g.z0), g.z0], ds || DS.wall);
    edge(P, [[x, y0, g.z0], [x, y0 + (g.h || 1.95), g.z0], [x, y0 + (g.h || 1.95), g.z1], [x, y0, g.z1]], { w: .5, ds: .45 });
    za = g.z1;
  }
  run(za, z1);
  edge(P, [[x, y0 + .01, z0], [x, y0 + .01, z1]], { w: .45 });
}

/* ================================================================ DDG-51 (burke_structure.js, model frame) */
const DD = (() => {
  // hull form (burke_structure.js, ship x = model z)
  const XB = 77.6, XS = -77.6, XST = 70.6;
  const deckY = x => { const u = x / XB; return 6.5 + 1.1 * u + 2.7 * Math.pow(Math.max(0, (u - .3) / .7), 2); };
  const deckHB = x => { const u = x / XB; if (u > .22) return 10 * Math.max(0, 1 - Math.pow((u - .22) / .78, 1.85)); if (u < -.55) return 10 * (1 - .14 * Math.pow((-.55 - u) / .45, 1.5)); return 10; };
  const wlHB = x => { if (x >= XST) return 0; const u = x / XB, ue = XST / XB; if (u > .15) return 9 * Math.max(0, 1 - Math.pow((u - .15) / (ue - .15), 1.7)); if (u < -.5) return 9 * (1 - .16 * Math.pow((-.5 - u) / .5, 1.3)); return 9; };
  const stemY = x => x <= XST ? 0 : deckY(XB) * Math.pow(Math.min(1, (x - XST) / (XB - XST)), 1 / 1.35);
  const keelY = x => x > 52 ? -6.3 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 52) / (XST - 52), 2))) : x < -28 ? -6.3 + 5.1 * ssE(-28, -60, x) : -6.3;
  const secE = x => x > 16 ? mix(4.2, 2.1, ssE(16, 64, x)) : x < -20 ? mix(4.2, 6.5, ssE(-20, -64, x)) : 4.2;
  function halfBreadth(x, y) {
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
  const keel = z => z >= XST ? stemY(z) : keelY(z);
  const fx = k => +(70.6 - 2.44 * k).toFixed(3);
  const LV = { IB: -5.1, P4: -1.6, VF: -.4, D3: 1.2, D2: 3.9, PF: 6.8 };
  const BK = [3, 7, 11, 14, 17, 21, 25, 32, 40, 43, 47, 51, 55];
  const ZX = [XB, ...BK.map(fx), XS];
  // zones forward to aft: levels (from the bottom) and the spaces between them (burke ZONES)
  const ZN = [
    [[LV.P4, LV.D2, LV.PF], ['FPK', 'CHAIN', 'BOSN', 'WNDL']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'SON1', 'SON2', 'ST2', 'BTH2']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'MAG1', 'MAG2', 'GLR', 'BTH3']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'FO4', 'PMP4', 'BTH4', 'PAS4']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'FO5', 'ST5', 'BTH5', 'MESS5']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'FO6', 'REF6', 'BTH6', 'OFF6']],
    [[LV.IB, LV.D2], ['DB', 'AMR1', 'WR7']],
    [[LV.IB, LV.D2], ['DB', 'MER1', 'GAL8']],
    [[LV.IB, LV.D2], ['DB', 'MER2', 'BTH9']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'AMR2', 'ST10', 'BTH10', 'PAS10']],
    [[LV.IB, LV.P4, LV.D3, LV.D2], ['DB', 'FO11', 'AVS11', 'BTH11', 'HSP11']],
    [[LV.P4, LV.D3], ['JP12', 'ST12', 'WS12']],
    [[LV.D3], ['VD13', 'FDS13']],
    [[LV.D3], ['APK', 'STR']],
  ].map(([lv, c], i) => ({ no: i + 1, z1: ZX[i], z0: ZX[i + 1], lv, c }));
  const VLS = [{ id: 'VLSF', z0: fx(14), z1: fx(12), hw: 4.6, floor: LV.VF }, { id: 'VLSA', z0: fx(43), z1: -25.6, hw: 4.6, floor: LV.P4 }];
  const NAMES = {
    FPK: 'Forepeak tank', CHAIN: 'Chain locker · stores', BOSN: "Bosun's store", WNDL: 'Windlass room', SON1: 'Sonar equipment · lower',
    SON2: 'Sonar equipment room', ST2: 'Stores · forward', BTH2: 'Berthing · forward', MAG1: 'Gun magazine · lower', MAG2: 'Gun magazine',
    GLR: 'Gun loading room', BTH3: 'Berthing · gun', FO4: 'Fuel · forward', PMP4: 'Pump room · forward', BTH4: 'Berthing · VLS wings',
    PAS4: 'Passage · VLS wings', FO5: 'Fuel', ST5: 'Stores', BTH5: 'Berthing', MESS5: 'Mess · CPO', FO6: 'Fuel', REF6: 'Refrigerated stores',
    BTH6: 'Berthing', OFF6: 'Offices', AMR1: 'Auxiliary machinery room 1', WR7: 'Wardroom · officers', MER1: 'Main engine room 1',
    GAL8: 'Galley · crew mess', MER2: 'Main engine room 2', BTH9: 'Berthing · midships', AMR2: 'Auxiliary machinery room 2',
    ST10: 'Stores · VLS wings', BTH10: 'Berthing · VLS wings', PAS10: 'Passage · VLS wings', FO11: 'Fuel · aft', AVS11: 'Aviation stores',
    BTH11: 'Berthing · aft', HSP11: 'Helicopter support', JP12: 'JP-5 tanks', ST12: 'Stores · aft', WS12: 'Workshop · aviation',
    VD13: 'Void', FDS13: 'Flight deck support · stores', APK: 'Aft peak tank', STR: 'Steering gear room',
    FHF: 'CIC · deckhouse forward', FHA: 'Equipment rooms · deckhouse', SPY01: 'SPY house · 01 level · array equipment',
    SPY02: 'SPY house · 02 level · array equipment', SPY03: 'Pilot house · 03 level', MH: 'Midships deckhouse · intakes',
  };
  return { XB, XS, deckY, halfBreadth, keel, fx, LV, BK, ZN, VLS, NAMES };
})();

function ddSpec() {
  const hb = DD.halfBreadth;
  const S = { key: 'destroyer', hb, hbc: mkHbc(hb), keel: DD.keel, deck: DD.deckY, zones: DD.ZN };
  return S;
}
/* the VLS enclosure's footprint as a deck hole (above its floor) */
const vlsHoles = y => DD.VLS.filter(v => y > v.floor + .05).map(v => ({ x0: -v.hw, x1: v.hw, z0: v.z0, z1: v.z1 }));
/* passage x (the DC deck's port and starboard passages; outboard of a VLS enclosure) */
const ddPassX = Z => (Z.no === 4 || Z.no === 10) ? 5.4 : 2.8;

/* the zone's structure part */
function ddZone(S, Z) {
  const P = [], LV = DD.LV, zc = (Z.z0 + Z.z1) / 2, px = ddPassX(Z);
  const deckAt = DD.deckY;
  // the forward bulkhead (not for zone 1: the stem), with its WT doors on the DC deck (or the 3rd deck aft)
  if (Z.no > 1) {
    const z = Z.z1, doors = [];
    const k = DD.BK[Z.no - 2];
    const prev = DD.ZN[Z.no - 2];
    if (k >= 7 && k <= 43) { const x = Math.max(ddPassX(prev), px) === 5.4 ? 5.4 : 2.8; doors.push([-x, LV.D2], [x, LV.D2]); }
    else if (k === 47 || k === 51) doors.push([-1.5, LV.D3], [1.5, LV.D3]);
    const holes = doors.map(([x, y]) => wtDoorHole(x, y));
    for (const v of DD.VLS) if (z > v.z0 + .05 && z < v.z1 - .05) holes.push({ x0: -v.hw, x1: v.hw, y0: v.floor, y1: deckAt(z) });
    tBulkhead(S, P, z, -99, deckAt(z) - .04, holes);
    for (const [x, y] of doors) wtDoor(P, x, y, z, -1);
  }
  // the zone's decks (burke levels), trimmed to the hull, round the VLS enclosure, with scuttles over the passage
  const hatchZ = zc + (Z.no % 2 ? 1.2 : -1.2);
  const lvls = Z.lv.slice();
  for (let i = 0; i < lvls.length; i++) {
    const y = lvls[i];
    const holes = vlsHoles(y).filter(h => h.z1 > Z.z0 && h.z0 < Z.z1).map(h => O(h, { z0: Math.max(h.z0, Z.z0), z1: Math.min(h.z1, Z.z1) }));
    const isIB = y === LV.IB;
    if (!isIB && y !== LV.PF) for (const s of [-1, 1]) if (S.hbc(hatchZ, y) > px + 1) holes.push({ x0: s * px - .4, x1: s * px + .4, z0: hatchZ - .4, z1: hatchZ + .4, coam: true });
    deckPlate(S, P, y, Z.z0, Z.z1, holes, { ds: isIB ? 5.2 : DS.deck });
    if (isIB) doubleBottom(S, P, Z.z0, Z.z1, y);
  }
  // ladders under the scuttles, down to the next level (machinery zones: to the floor plates over the inner bottom)
  const all = lvls.concat([deckAt(hatchZ)]).sort((a, b) => a - b);
  for (let i = all.length - 1; i > 0; i--) {
    const yTop = all[i], yBot = all[i - 1];
    if (yTop === LV.IB || yTop === LV.PF) continue;
    if (i === all.length - 1) continue;                 // the main deck: the ladder from the weather deck is not modelled
    for (const s of [-1, 1]) if (S.hbc(hatchZ, yTop) > px + 1 && S.hbc(hatchZ, yBot + .5) > px + .3) ladder(P, s * px, hatchZ + .25, yTop, yBot === LV.IB ? LV.IB + .5 : yBot, false);
  }
  // web frames (every other frame) from the lowest level to the main deck
  webFrames(S, P, Z.z0, Z.z1, Z.lv[0], z => deckAt(z) - .1, 2);
  // the DC deck: the passage partitions (joiner bulkheads), cable trays and the firemain overhead
  if (Z.no >= 2 && Z.no <= 11) {
    const y0 = LV.D2, gaps = [{ z0: zc - 2.2, z1: zc - 1.4 }, { z0: zc + 1.8, z1: zc + 2.6 }];
    for (const s of [-1, 1]) {
      const xin = s * (px - .7), xout = s * (px + .7);
      lWall(P, (Z.no === 4 || Z.no === 10) ? xout : xin, y0, z => deckAt(z) - .05, Z.z0 + .05, Z.z1 - .05, gaps, 7);
      const yt = Math.min(deckAt(Z.z0), deckAt(Z.z1)) - .45;
      tray(P, [s * (px + .45), yt, Z.z1 - .05], [s * (px + .45), yt, Z.z0 + .05], .45);
      pipe(P, [[s * (px - .45), yt - .05, Z.z1 - .05], [s * (px - .45), yt - .05, Z.z0 + .05]], .1);
    }
  }
  // the forecastle platform and the collision bulkhead's flat in zone 1
  return P;
}

/* the VLS enclosures: longitudinal walls, their end walls, the forward floor */
function ddVlsWalls(S, v) {
  const P = [], top = z => DD.deckY(z) - .05;
  for (const s of [-1, 1]) { lWall(P, s * v.hw, v.floor, top, v.z0, v.z1, [], 4.6); edge(P, [[s * v.hw, top(v.z1), v.z1], [s * v.hw, top(v.z0), v.z0]], { w: .5 }); }
  // the end wall that is not a watertight bulkhead
  const ze = v.id === 'VLSF' ? v.z1 : v.z1;
  quad(P, [-v.hw, v.floor, ze], [v.hw, v.floor, ze], [v.hw, top(ze), ze], [-v.hw, top(ze), ze], 4.6);
  edge(P, [[-v.hw, v.floor, ze], [v.hw, v.floor, ze], [v.hw, top(ze), ze], [-v.hw, top(ze), ze], [-v.hw, v.floor, ze]], { w: .6 });
  // the floor (forward: its own flat; aft: the 4th deck, and over the end of MER 2)
  const fz0 = v.id === 'VLSF' ? v.z0 : -27, fz1 = v.z1;
  quad(P, [-v.hw, v.floor, fz0], [v.hw, v.floor, fz0], [v.hw, v.floor, fz1], [-v.hw, v.floor, fz1], 4.4);
  edge(P, [[-v.hw, v.floor, fz0], [v.hw, v.floor, fz0], [v.hw, v.floor, fz1], [-v.hw, v.floor, fz1], [-v.hw, v.floor, fz0]], { w: .6 });
  return P;
}

/* ---------------------------------------------------------------- DDG contents, by compartment */
/* the space's box: z from the zone, y between its levels, x the hull at its mid height */
function ddBox(S, Z, id) {
  const L = Z.c.indexOf(id), lv = Z.lv;
  const y0 = L === 0 ? S.keel((Z.z0 + Z.z1) / 2) : lv[L - 1], y1 = L < lv.length ? lv[L] : DD.deckY((Z.z0 + Z.z1) / 2);
  const zc = (Z.z0 + Z.z1) / 2, w = S.hbc(zc, (y0 + y1) / 2);
  return { x0: -w, x1: w, y0, y1, z0: Z.z0, z1: Z.z1, zc, w };
}
/* fill the floor with berthing racks, clear of the passages, the VLS enclosure and the hatches */
function berthing(S, P, B, px, clearX) {
  const y = B.y0, n0 = P.length;
  for (let z = B.z0 + 1.4; z < B.z1 - 1.2; z += 2.3) {
    for (let x = -B.w + 1.1; x < B.w - .6; x += 1.45) {
      const ww = Math.min(S.hbc(z - 1, y + 1.8), S.hbc(z + 1, y + 1.8), S.hbc(z, y + .2));
      if (Math.abs(x) + .5 > ww) continue;
      if (px && Math.abs(Math.abs(x) - px) < 1.25) continue;
      if (clearX && Math.abs(x) < clearX) continue;
      rack(P, x, y, z, true);
    }
  }
  // lockers along the forward bulkhead
  const zl = B.z1 - .45;
  for (const s of [-1, 1]) { const w = S.hbc(zl, y + 1); if (w > 2) cabinets(P, [s * (w - .3), y, zl], [s * Math.max(1, w - 3.5), y, zl], 1.7, .55, { w: .5, face: -1 }); }
  return P.length - n0;
}
function ddContents(S, Z, id, K_) {
  const P = [], B = ddBox(S, Z, id), px = ddPassX(Z), LV = DD.LV;
  const y = B.y0;
  switch (id) {
    case 'FPK': case 'APK': tankFill(P, S, B.z0 + .3, B.z1 - .3, B.y0, B.y1, .55); break;
    case 'FO4': case 'FO5': case 'FO6': case 'FO11': {
      tankFill(P, S, B.z0 + .2, B.z1 - .2, B.y0, B.y1, id === 'FO11' ? .6 : .75);
      // a swash bulkhead mid-tank: its lightening holes as rings
      const zc = B.zc, w = S.hbc(zc, (B.y0 + B.y1) / 2);
      quad(P, [-w, B.y0 + .2, zc], [w, B.y0 + .2, zc], [w, B.y1 - .2, zc], [-w, B.y1 - .2, zc], 3.4);
      for (let x = -w + 1.2; x < w - 1; x += 2.2) { const c = [x, (B.y0 + B.y1) / 2, zc], pts = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU; pts.push([c[0] + Math.cos(a) * .45, c[1] + Math.sin(a) * .45, zc]); } P.push(line(pts, fn({ w: .4, ds: .5 }))); }
      break;
    }
    case 'CHAIN': {
      for (const s of [-1, 1]) {
        const c = [s * 1.3, y + .1, B.zc];
        for (let k = 0; k < 7; k++) P.push(lathe([c[0], c[1] + k * .28, c[2]], FY, [[0, .95 - k * .05], [.24, .95 - k * .05]], { n: 18, gen: 0, ds: 1.1 }));
        pipe(P, [[s * 1.3, y + 2.2, B.zc], [s * 1.1, B.y1 + 2.8, B.zc + 2]], .22);
      }
      break;
    }
    case 'BOSN': case 'ST2': case 'ST5': case 'ST10': case 'ST12': case 'FDS13': case 'AVS11': {
      const h = Math.min(2.1, B.y1 - y - .2);
      for (let x = -B.w + .9; x < B.w - .8; x += 1.8) { const w = S.hbc(B.zc, y + h); if (Math.abs(x) + .4 > w || (px && Math.abs(Math.abs(x) - px) < .9 && y >= LV.D2 - .01)) continue; shelves(P, x, y, B.z0 + .8, B.z1 - .8, h, .6); }
      if (id === 'AVS11') for (let k = 0; k < 4; k++) vol(P, [-3 + k * 1.6, y, B.z0 + 1], [-2 + k * 1.6, y + .9, B.z0 + 2.2], { ds: 2, fine: true });
      break;
    }
    case 'WNDL': {
      for (const s of [-1, 1]) {
        const c = [s * 1.1, y + .9, B.zc + 1];
        P.push(lathe([c[0] - s * .35, c[1], c[2]], [s, 0, 0], [[0, .55], [.1, .75], [.6, .75], [.7, .55]], { n: 20, gen: 3, caps: true, ds: 1.2 }));
        pipe(P, [[c[0], c[1] - .6, c[2]], [s * 1.3, y - 2.5, B.zc]], .2);
      }
      vol(P, [-.6, y, B.zc - 1.4], [.6, y + 1.2, B.zc], { ds: 2 });
      break;
    }
    case 'SON1': case 'SON2': {
      for (const x of [-3.2, 3.2]) if (S.hbc(B.zc, y + 1.8) > Math.abs(x) + .6) cabinets(P, [x, y, B.z0 + 1], [x, y, B.z1 - 1], Math.min(1.9, B.y1 - y - .2), .7, { face: -Math.sign(x) });
      if (id === 'SON2') { cabinets(P, [-1.8, y, B.z1 - 1.2], [1.8, y, B.z1 - 1.2], 1.3, .8, { face: -1 }); }
      pipe(P, [[0, B.y1 - .3, B.z0 + .3], [0, B.y1 - .3, B.z1 - .3]], .12);
      break;
    }
    case 'MAG1': case 'MAG2': {
      // rack rows along z, each rack a volume, the stowed rounds (closed shells) as rows of short verticals
      const h = Math.min(1.9, B.y1 - y - .3);
      for (let x = -B.w + 1; x < B.w - .8; x += 1.35) {
        const w = S.hbc(B.zc, y + h); if (Math.abs(x) + .35 > w) continue;
        vol(P, [x - .3, y, B.z0 + .9], [x + .3, y + h, B.z1 - .9], { ds: 3, open: true });
        for (let z = B.z0 + 1.1; z < B.z1 - 1; z += .32) for (const yy of [y + .1, y + h / 2]) P.push(line([[x, yy, z], [x, yy + h / 2 - .15, z]], fn({ w: .35, ds: .45 })));
      }
      // the hoist trunk up through the magazines to the loading room
      vol(P, [-.7, y, 50.2], [.7, B.y1, 51.6], { ds: 2 });
      break;
    }
    case 'GLR': {
      // the Mk 45's loader drum and lower hoist under the mount (the gun at z ~51.5)
      const c = [0, y, 51.2];
      P.push(lathe(c, FY, [[0, 1.3], [1.6, 1.3]], { n: 32, gen: 6, rings: [0, 1], caps: true, ds: 1.2 }));
      P.push(lathe([0, y + 1.6, c[2]], FY, [[0, .5], [B.y1 - y - 1.6, .5]], { n: 14, gen: 2, ds: 1.4 }));
      vol(P, [-.7, y, 49.5], [.7, B.y1, 50.3], { ds: 2 });
      for (const s of [-1, 1]) cabinets(P, [s * 3.8, y, B.z0 + 1], [s * 3.8, y, B.z0 + 3.2], 1.8, .6, { face: -s });
      break;
    }
    case 'PMP4': {
      for (const [x, z] of [[-2.5, B.z0 + 1.5], [-2.5, B.z0 + 3.5], [2.5, B.z0 + 1.5], [2.5, B.z0 + 3.5]]) pump(P, [x, y, z]);
      for (const x of [-4.5, 4.5]) { drum(P, [x, y, B.z1 - 2], [x, y + 1.5, B.z1 - 2], .45); }         // purifiers
      pipe(P, [[-5, y + 1.3, B.z0 + .4], [5, y + 1.3, B.z0 + .4]], .12);
      pipe(P, [[-2.5, y + .5, B.z0 + 1.5], [-2.5, y + 1.3, B.z0 + .4]], .08, { fine: true });
      pipe(P, [[2.5, y + .5, B.z0 + 1.5], [2.5, y + 1.3, B.z0 + .4]], .08, { fine: true });
      break;
    }
    case 'BTH2': case 'BTH3': case 'BTH5': case 'BTH6': case 'BTH9': case 'BTH11':
      berthing(S, P, B, y >= LV.D2 - .01 ? px : 0); break;
    case 'BTH4': case 'BTH10': case 'PAS4': case 'PAS10': {
      if (id[0] === 'B') berthing(S, P, B, 0, 5.2);
      break;
    }
    case 'MESS5': case 'WR7': {
      for (let x = -B.w + 1.8; x < B.w - 1.5; x += 2.3) { if (Math.abs(Math.abs(x) - px) < 1.3) continue; for (let z = B.z0 + 2; z < B.z1 - 1.5; z += 3.2) messTable(P, x, y, z, id === 'WR7' ? 2.6 : 2.2); }
      if (id === 'WR7') cabinets(P, [-4, y, B.z1 - .5], [-1.2, y, B.z1 - .5], 1.0, .6, { face: -1 });
      break;
    }
    case 'GAL8': {
      // the galley forward (ranges, kettles, the serving line), the crew mess aft
      const zg = B.z1 - 1.2;
      for (const s of [-1, 1]) {
        cabinets(P, [s * 1.5, y, zg - 3.5], [s * 1.5, y, zg], .92, .8, { w: .9, face: s });
        for (let k = 0; k < 2; k++) P.push(lathe([s * 3.8, y, zg - 1 - k * 1.3], FY, [[0, .1], [.2, .45], [.95, .45], [1.0, .38]], { n: 16, gen: 2, rings: [2], ds: 1.2 }));
      }
      cabinets(P, [-2.2, y, zg - 4.5], [2.2, y, zg - 4.5], .9, .6, { face: -1 });
      for (let x = -B.w + 1.8; x < B.w - 1.5; x += 2.3) { if (Math.abs(Math.abs(x) - px) < 1.3) continue; for (let z = B.z0 + 2; z < zg - 6; z += 3) messTable(P, x, y, z, 2.2); }
      break;
    }
    case 'OFF6': {
      for (let x = -B.w + 1.5; x < B.w - 1; x += 2.6) { if (Math.abs(Math.abs(x) - px) < 1.3) continue; for (let z = B.z0 + 1.5; z < B.z1 - 1; z += 2.4) { P.push(box([x - .7, y + .72, z - .38], [x + .7, y + .76, z + .38], { ds: 1.4 })); cabinets(P, [x - .6, y + .76, z + .28], [x + .6, y + .76, z + .28], .45, .1, { w: .6 }); } }
      break;
    }
    case 'REF6': {
      // cold rooms: insulated partitions, shelving
      const w = S.hbc(B.zc, y + 1);
      for (const z of [B.z0 + 3.3, B.z0 + 6.6]) quad(P, [-w, y, z], [w, y, z], [w, B.y1 - .05, z], [-w, B.y1 - .05, z], 2.2);
      quad(P, [0, y, B.z0 + .1], [0, y, B.z1 - .1], [0, B.y1 - .05, B.z1 - .1], [0, B.y1 - .05, B.z0 + .1], 2.4);
      for (const x of [-w + .5, -.6, .6, w - .5]) shelves(P, x, y, B.z0 + .3, B.z1 - .3, 2.0, .5);
      break;
    }
    case 'AMR1': {
      const yf = LV.IB + .5;
      gtg(P, 3.4, yf, B.z1 - .6, -1, LV.D2);                                    // GTG 1
      cabinets(P, [6.7, yf, B.z0 + 1.0], [6.7, yf, B.z0 + 4.2], 2.1, .8, { face: -1 });   // its switchboard
      hdrum(P, [-3.6, yf + 1.1, B.z1 - 1.2], [-3.6, yf + 1.1, B.z1 - 4.4], .55);   // AC plants
      hdrum(P, [-3.6, yf + 1.1, B.z1 - 5.2], [-3.6, yf + 1.1, B.z1 - 8.4], .55);
      for (const z of [B.z1 - 2.7, B.z1 - 6.8]) vol(P, [-5.2, yf + 1.7, z - .6], [-4.2, yf + 2.5, z + .6], { ds: 1.8, fine: true });
      pump(P, [-.6, yf, B.z1 - 1.5]); pump(P, [.6, yf, B.z1 - 3]);                // fire pumps
      drum(P, [-6.4, yf, B.z0 + 1.3], [-6.4, yf + 2.2, B.z0 + 1.3], .5);          // air receivers, compressor
      vol(P, [-5.8, yf, B.z0 + 2.2], [-4.4, yf + 1.2, B.z0 + 3.6], { ds: 1.8 });
      ddMachFlats(S, P, B, yf);
      break;
    }
    case 'AMR2': {
      const yf = LV.IB + .5;
      // both shaft lines run through here (x ~ -2.2 and +2.2): GTG 3 outboard to starboard, compact
      gtg(P, 5.4, yf, B.z1 - .5, -1, LV.P4, .76);                              // GTG 3
      cabinets(P, [-6.9, yf, B.z1 - .8], [-6.9, yf, B.z1 - 3.8], Math.min(2.1, LV.P4 - yf - .15), .8, { face: 1 });
      for (const z of [B.z0 + 1.0, B.z0 + 2.2]) drum(P, [-4.8, yf, z], [-4.8, yf + 2.2, z], .45);   // distilling units
      pump(P, [0, yf, B.z0 + 1.0]); pump(P, [0, yf, B.z1 - 1.0]);
      pipe(P, [[-6, LV.P4 - .35, B.z0 + .3], [6, LV.P4 - .35, B.z0 + .3]], .1);
      break;
    }
    case 'MER1': case 'MER2': {
      const yf = LV.IB + .5, one = id === 'MER1';
      // lube oil modules, fuel service pumps, the controllable-pitch propeller's hydraulic unit
      const zA = one ? B.z1 - 1.2 : B.z1 - 1.2, zB = one ? B.z0 + 1.5 : B.z0 + 1.6;
      vol(P, [5.2, yf, zA - 2.6], [6.6, yf + 1.5, zA], { ds: 1.8 });
      for (const k of [0, 1]) drum(P, [5.5 + k * .8, yf + 1.5, zA - 3.2], [5.5 + k * .8, yf + 2.3, zA - 3.2], .28, { fine: true });
      pump(P, [-5.8, yf, zA - .8]); pump(P, [-5.8, yf, zA - 2.3]);
      vol(P, [-6.6, yf, zB], [-5.0, yf + 1.4, zB + 1.6], { ds: 1.8 });
      if (!one) {
        gtg(P, 5.6, yf, B.z1 - 2.4, -1, LV.D2);                                 // GTG 2
        cabinets(P, [-5.8, yf, B.z1 - 4.5], [-5.8, yf, B.z1 - 8.5], 2.1, .8, { face: 1 });
      } else cabinets(P, [-6.2, yf, B.z1 - 4.2], [-6.2, yf, B.z1 - 7.4], 2.1, .8, { face: 1 });
      ddMachFlats(S, P, B, yf);
      break;
    }
    case 'HSP11': case 'WS12': {
      for (let z = B.z0 + 1.5; z < B.z1 - 1; z += 2.6) for (const s of [-1, 1]) { const x = s * 4.5; if (S.hbc(z, y + 1) < 5.4) continue; P.push(box([x - .4, y + .85, z - .9], [x + .4, y + .9, z + .9], { ds: 1.3 })); vol(P, [x - .35, y, z - .8], [x + .35, y + .8, z + .8], { ds: 2.6, fine: true }); }
      cabinets(P, [-2, y, B.z1 - .5], [2, y, B.z1 - .5], 1.9, .5, { face: -1, w: .6 });
      break;
    }
    case 'JP12': {
      // two JP-5 tanks, their transfer pumps and the filter-separators
      for (const s of [-1, 1]) { const w = S.hbc(B.zc, (B.y0 + B.y1) / 2); if (w < 2) continue; vol(P, [s * .4, B.y0 + .2, B.z0 + .6], [s * Math.min(w - .4, 4.6), B.y1 - .15, B.z1 - 2.2], { ds: 2.4 }); }
      tankFill(P, S, B.z0 + .8, B.z1 - 2.4, B.y0 + .2, B.y1 - .2, .7, [-4, 4]);
      for (const x of [-.8, .8]) drum(P, [x, B.y1 - 1.2, B.z1 - 1.2], [x, B.y1 - .2, B.z1 - 1.2], .3);
      break;
    }
    case 'STR': {
      // two rudder stocks (the rudders at z -70.2, x +-4.0), their tillers and rams, the hydraulic power units
      for (const s of [-1, 1]) {
        const c = [s * 4.0, y, -70.2];
        P.push(lathe([c[0], y - .3, c[2]], FY, [[0, .42], [1.6, .42], [1.6, .6], [2.0, .6]], { n: 18, gen: 3, rings: [1, 3], caps: true, ds: 1.2 }));
        P.push(box([c[0] - .25, y + 1.3, c[2] - .2], [c[0] + .25, y + 1.6, c[2] + 1.8], { ds: 1.2 }));      // tiller
        for (const sx of [-1, 1]) P.push(lathe([c[0] + sx * 2.2, y + 1.45, c[2] + 1.5], [-sx, 0, 0], [[0, .22], [1.6, .22], [1.6, .1], [2.0, .1]], { n: 12, gen: 2, caps: true, ds: 1.3 }));
        vol(P, [s * 1.2 - .6, y, -67], [s * 1.2 + .6, y + 1.5, -65.6], { ds: 1.8 });
      }
      break;
    }
    default: break;
  }
  return P;
}
/* machinery-space flats: the floor plates over the inner bottom (grating), side platforms, the overhead piping and
   cable trays along the sides */
function ddMachFlats(S, P, B, yf) {
  deckPlate(S, P, yf, B.z0 + .05, B.z1 - .05, [{ x0: -3.2, x1: 3.2, z0: B.z0 + .05, z1: B.z1 - .05 }], { ds: 3.2, noBeams: true });
  const yp = .2;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let z = B.z0 + .1; z <= B.z1 - .1; z += 2.44) pts.push(z);
    pts.push(B.z1 - .1);
    for (let i = 0; i < pts.length - 1; i++) {
      const wa = S.hbc(pts[i], yp), wb = S.hbc(pts[i + 1], yp);
      quad(P, [s * (wa - 2.0), yp, pts[i]], [s * wa, yp, pts[i]], [s * wb, yp, pts[i + 1]], [s * (wb - 2.0), yp, pts[i + 1]], 1.8);
    }
    edge(P, pts.map(z => [s * (S.hbc(z, yp) - 2.0), yp + 1.0, z]), { w: .5 });                  // the handrail
    edge(P, pts.map(z => [s * (S.hbc(z, yp) - 2.0), yp, z]), { w: .5 });
    const yt = DD.LV.D2 - .5;
    tray(P, [s * (S.hbc(B.zc, yt) - .6), yt, B.z1 - .1], [s * (S.hbc(B.zc, yt) - .6), yt, B.z0 + .1], .6);
    pipe(P, [[s * (S.hbc(B.zc, yt) - 1.4), yt - .1, B.z1 - .1], [s * (S.hbc(B.zc, yt) - 1.4), yt - .1, B.z0 + .1]], .14);
    pipe(P, [[s * (S.hbc(B.zc, yt) - 1.8), yt - .15, B.z1 - .1], [s * (S.hbc(B.zc, yt) - 1.8), yt - .15, B.z0 + .1]], .09);
  }
}
/* the forward deckhouse: the CIC (console rows, display boards), the equipment rooms aft of it; the SPY house decks
   (02, 03 levels: octagons), the array equipment behind the faces, the pilot house */
const OCT = [[1, 0, 31.0], [1, 1, 34.9], [0, 1, 8.0], [-1, 1, -4.2], [-1, 0, -8.1], [-1, -1, -4.2], [0, -1, 8.0], [1, -1, 34.9]];
function octPoly(d) {
  const L = OCT.map(([a, b, c]) => [a, b, c - d * Math.hypot(a, b)]), out = [];
  for (let i = 0; i < 8; i++) { const [a1, b1, c1] = L[i], [a2, b2, c2] = L[(i + 1) % 8], det = a1 * b2 - a2 * b1; out.push([(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det]); }
  return out;   // ship (x, z) -> model (z, x)
}
function ddHouse() {
  const out = {};
  const y0 = z => DD.deckY(z) + .02;
  { // CIC: forward part of the deckhouse (x 19.4 .. 35.5 ship)
    const P = [];
    const zs = 19.36, ze = 34.6, yb = y0(27);
    quad(P, [-7.9, yb + .01, zs], [7.9, yb + .01, zs], [7.9, 10.28, zs], [-7.9, 10.28, zs], 2.8);         // the split at fr 21
    for (const x of [-5.4, -2.6, 2.6, 5.4]) for (let z = zs + 2.5; z < ze - 1.5; z += 3.4) {
      const ax = x > 0 ? 1 : -1;
      cabinets(P, [x, yb, z], [x, yb, z + 2.4], 1.25, .8, { w: .8, face: -ax });
      P.push(panel([[x - ax * .4, yb + 1.25, z], [x - ax * .4, yb + 1.25, z + 2.4], [x - ax * .55, yb + 1.7, z + 2.4], [x - ax * .55, yb + 1.7, z]], fn({ ds: 1.2 })));
    }
    for (const x of [-4, 0, 4]) { const z = ze - .4; quad(P, [x - 1.3, yb + .9, z], [x + 1.3, yb + .9, z], [x + 1.3, yb + 2.3, z], [x - 1.3, yb + 2.3, z], 1.0); edge(P, [[x - 1.3, yb + .9, z], [x + 1.3, yb + .9, z], [x + 1.3, yb + 2.3, z], [x - 1.3, yb + 2.3, z], [x - 1.3, yb + .9, z]], { w: .6, ds: .4 }); }
    out.FHF = P;
  }
  { // equipment rooms (aft part: x 1.5 .. 19.4 ship)
    const P = [], yb = y0(10);
    for (const x of [-5.8, -2.2, 2.2, 5.8]) cabinets(P, [x, yb, 3.5], [x, yb, 17.8], 1.9, .7, { w: .6, face: x > 0 ? -1 : 1 });
    out.FHA = P;
  }
  { // SPY house: the 02 and 03 decks; array equipment behind the four faces (01, 02); the pilot house (03)
    const PS = { SPY01: [], SPY02: [], SPY03: [] };
    for (const [lv, key] of [[13.03, 'SPY02'], [15.94, 'SPY03']]) {
      const d = 1.3 * (lv - 10.3) / (19.4 - 10.3), oct = octPoly(d + .05).map(([x, z]) => [z, lv, x]);
      const P = PS[key];
      quad(P, oct[0], oct[1], oct[2], oct[3], 2.4); quad(P, oct[0], oct[3], oct[4], oct[7], 2.4); quad(P, oct[4], oct[5], oct[6], oct[7], 2.4);
      edge(P, oct.concat([oct[0]]), { w: .6 });
    }
    for (const [key, yb] of [['SPY01', 10.32], ['SPY02', 13.05]]) {
      const P = PS[key];
      // cabinets in a ring behind the faces (the four array faces: fwd stbd / fwd port / aft stbd / aft port)
      for (const [zc, xc, ang] of [[26.0, 4.5, -.9], [26.0, -4.5, .9], [12.5, 4.5, .9], [12.5, -4.5, -.9]]) {
        const d = [Math.cos(ang), 0, Math.sin(ang)], a = [xc - d[0] * 1.8, yb, zc - d[2] * 1.8], b = [xc + d[0] * 1.8, yb, zc + d[2] * 1.8];
        P.push(...(() => { const Q = []; cabinets(Q, a, b, 2.0, .7, { w: .6 }); return Q; })().map(pr => pr));
      }
      for (const x of [-1.6, 1.6]) cabinets(P, [x, yb, 15], [x, yb, 26], 1.9, .7, { w: .6, face: x > 0 ? 1 : -1 });
    }
    { // pilot house: the helm and consoles along the forward windows, the chart table
      const P = PS.SPY03, yb = 15.96;
      cabinets(P, [-3.8, yb, 29.4], [3.8, yb, 29.4], 1.05, .7, { w: 1.0, face: 1 });
      vol(P, [-.5, yb, 27.4], [.5, yb + 1.1, 28.2], { ds: 1.6 });
      P.push(box([-3.8, yb + .9, 23.5], [-2.2, yb + .95, 24.6], { ds: 1.4 }));
      for (const x of [-2.4, 2.4]) vol(P, [x - .3, yb, 26.4], [x + .3, yb + 1.2, 27.0], { ds: 1.8, fine: true });
    }
    Object.assign(out, PS);
  }
  { // midships deckhouse: the gas turbines' intake plenums and demisters under the stacks
    const P = [];
    for (const zc of [2.2, -17.0]) for (const s of [-1, 1]) vol(P, [s * 1.2, y0(zc - 2.6), zc - 3.9], [s * 4.6, 9.6, zc - 1.3], { ds: 2.6 });
    out.MH = P;
  }
  return out;
}

/* the DDG's interior parts. cut: the cutaway already carries mach / trunks / shaftIn / vlsBF / vlsBA */
function ddInterior(cut) {
  const S = ddSpec(), parts = [];
  for (const Z of DD.ZN) {
    const zones = [Z.no, Math.max(1, Z.no - 1)];
    const P = ddZone(S, Z);
    for (const v of DD.VLS) if (v.z0 < Z.z1 - .1 && v.z1 > Z.z0 + .1 && ((v.id === 'VLSF' && Z.no === 4) || (v.id === 'VLSA' && Z.no === 10))) P.push(...ddVlsWalls(S, v));
    parts.push(ixPart('ixS' + String(Z.no).padStart(2, '0'), 'Zone ' + Z.no + ' · WT bulkhead fr ' + (Z.no > 1 ? DD.BK[Z.no - 2] : '—') + ' · decks · frames', P, { zones, zone: Z.no, sys: 'structure', comp: null }));
    for (const id of Z.c) {
      if (id === 'DB' || id === 'VD13') continue;
      const C = ddContents(S, Z, id);
      if (!C.length) continue;
      parts.push(ixPart('ix_' + id, DD.NAMES[id] || id, C, { zones: [Z.no], zone: Z.no, comp: id, sys: sysOf(id) }));
    }
  }
  const H = ddHouse();
  for (const [id, zs] of [['FHF', [5, 6]], ['FHA', [6, 7]], ['SPY01', [5, 6, 7]], ['SPY02', [5, 6, 7]], ['SPY03', [5, 6]], ['MH', [7, 8, 9]]]) parts.push(ixPart('ix_' + id, DD.NAMES[id], H[id], { zones: zs, zone: zs[0], comp: id, sys: id === 'MH' ? 'machinery' : 'control' }));
  if (!cut && K) {
    // the unit model: the cutaway's machinery, VLS modules and shaft lines, under the cutaway's names
    let mach = [];
    for (const m of K.MRGS) mach = mach.concat(K.mrg(m));
    const gt = K.lm2500(); for (const g of K.GTS) { const T = K.gtXf(g); mach = mach.concat(gt.map(pr => window.HD.tp(T, pr))); }
    parts.push(ixPart('mach', 'LM2500 ×4 · reduction gears ×2', mach, { zones: [8, 9], zone: 8, comp: 'MER1', sys: 'machinery' }));
    parts.push(ixPart('trunks', 'Intake trunks · uptakes', K.ddTrunks(), { zones: [8, 9], zone: 8, comp: 'MER1', sys: 'machinery' }));
    parts.push(ixPart('shaftIn', 'Shaft lines · thrust bearings', K.ddShafts().inP, { zones: [9, 10, 11], zone: 9, comp: 'MER2', sys: 'machinery' }));
    parts.push(ixPart('vlsBF', 'Mk 41 modules · forward · 4', K.vlsBlock(true), { zones: [4], zone: 4, comp: 'VLSF', sys: 'magazine' }));
    parts.push(ixPart('vlsBA', 'Mk 41 modules · aft · 8', K.vlsBlock(false), { zones: [9, 10], zone: 10, comp: 'VLSA', sys: 'magazine' }));
  }
  return parts;
}
function sysOf(id) {
  if (/^(MER|AMR|PMP|MH)/.test(id)) return 'machinery';
  if (/^(MAG|GLR|VLS)/.test(id)) return 'magazine';
  if (/^(BTH|MESS|GAL|WR|OFF|PAS|BRT|MESS)/.test(id)) return 'living';
  if (/^(FO|FPK|APK|JP|DB)/.test(id)) return 'tank';
  if (/^(SON|FH|SPY|CIC|STR)/.test(id)) return 'control';
  if (/^(HSP|WS|AVS|HGR)/.test(id)) return 'aviation';
  return 'stores';
}

/* ================================================================ generic classes (CG, CVN, LHD, LCS)
   The hull from the model's own dots: half-breadth per (z, y) cell, the keel per station. */
function hullOf(prims, o) {
  const s = o.s || .6, dz = o.dz || 2, dy = o.dy || .5;
  const pts = GEO.sample({ parts: [{ name: 'h', prims }] }, s, 11)[0].pts;
  let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 6) { const y = pts[i + 1], z = pts[i + 2]; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const NZ = Math.ceil((z1 - z0) / dz) + 1, NY = Math.ceil((y1 - y0) / dy) + 1, G = new Float32Array(NZ * NY).fill(-1);
  for (let i = 0; i < pts.length; i += 6) {
    const x = Math.abs(pts[i]), y = pts[i + 1], z = pts[i + 2];
    const zi = Math.round((z - z0) / dz), yi = Math.round((y - y0) / dy), k = zi * NY + yi;
    if (x > G[k]) G[k] = x;
  }
  // a station's column: fill the gaps between its lowest and highest cells (the hull's sides are continuous)
  const lo = new Int16Array(NZ).fill(-1), hi = new Int16Array(NZ).fill(-1);
  for (let zi = 0; zi < NZ; zi++) {
    let a = -1, b = -1;
    for (let yi = 0; yi < NY; yi++) if (G[zi * NY + yi] >= 0) { if (a < 0) a = yi; b = yi; }
    lo[zi] = a; hi[zi] = b;
    if (a < 0) continue;
    let last = a;
    for (let yi = a + 1; yi <= b; yi++) {
      if (G[zi * NY + yi] >= 0) { for (let q = last + 1; q < yi; q++) G[zi * NY + q] = mix(G[zi * NY + last], G[zi * NY + yi], (q - last) / (yi - last)); last = yi; }
    }
    // the hull never narrows going up to the widest point below the deck (dots on the flare's inside can read narrow)
    for (let yi = a + 1; yi <= b; yi++) if (G[zi * NY + yi] < G[zi * NY + yi - 1] && (y0 + yi * dy) < (o.flareTop || 0)) G[zi * NY + yi] = G[zi * NY + yi - 1];
  }
  const cell = (zi, yi) => (zi < 0 || zi >= NZ || yi < 0 || yi >= NY) ? -1 : G[zi * NY + yi];
  const hb = (z, y) => {
    const fz = (z - z0) / dz, fy = (y - y0) / dy, zi = Math.floor(fz), yi = Math.floor(fy), tz = fz - zi, ty = fy - yi;
    const a = cell(zi, yi), b = cell(zi + 1, yi), c = cell(zi, yi + 1), d = cell(zi + 1, yi + 1);
    if (a < 0 || b < 0 || c < 0 || d < 0) {
      const n = Math.round(fz), m = Math.round(fy); return cell(n, m);
    }
    return mix(mix(a, b, tz), mix(c, d, tz), ty);
  };
  const zix = z => Math.max(0, Math.min(NZ - 1, Math.round((z - z0) / dz)));
  const keel = z => { const zi = zix(z); return lo[zi] < 0 ? 0 : y0 + lo[zi] * dy; };
  const top = z => { const zi = zix(z); return hi[zi] < 0 ? 0 : y0 + hi[zi] * dy; };
  return { hb, keel, top, z0, z1, y0, y1 };
}

/* a generic ship: bulkheads at bz (fwd to aft), decks [{ y, z0, z1, holes }], an inner bottom, the spaces with a kind */
function genericInterior(H, spec) {
  const S = { hb: H.hb, hbc: mkHbc(H.hb), keel: z => H.keel(z), deck: spec.deckTop };
  const parts = [], BZ = spec.bz.slice().sort((a, b) => b - a), zEnd = [spec.zFwd, ...BZ, spec.zAft];
  const zoneOf = z => { for (let i = 0; i < zEnd.length - 1; i++) if (z <= zEnd[i] && z >= zEnd[i + 1]) return i + 1; return 1; };
  const zones = [];
  for (let i = 0; i < zEnd.length - 1; i++) zones.push({ no: i + 1, z1: zEnd[i], z0: zEnd[i + 1] });
  for (const Z of zones) {
    const P = [], zc = (Z.z0 + Z.z1) / 2;
    if (Z.no > 1) {
      const z = Z.z1, top = spec.bhdTop(z), doors = (spec.doors || []).filter(([x, y]) => S.hbc(z, y + 1) > Math.abs(x) + .5 && y + 2.2 < top);
      tBulkhead(S, P, z, -99, top, doors.map(([x, y]) => wtDoorHole(x, y)), { ds: spec.ds || DS.plate });
      for (const [x, y] of doors) wtDoor(P, x, y, z, -1);
    }
    for (const d of spec.decks) {
      const za = Math.max(Z.z0, d.z0 === undefined ? -1e9 : d.z0), zb = Math.min(Z.z1, d.z1 === undefined ? 1e9 : d.z1);
      if (zb - za < .5) continue;
      const holes = (d.holes || []).filter(h => h.z1 > za && h.z0 < zb).map(h => O(h, { z0: Math.max(h.z0, za), z1: Math.min(h.z1, zb) }));
      const hz = zc + (Z.no % 2 ? 1.1 : -1.1);
      if (d.hatch !== false && hz > za + 1 && hz < zb - 1) for (const s of [-1, 1]) { const x = s * (spec.passX || 3); if (S.hbc(hz, d.y) > Math.abs(x) + 1) holes.push({ x0: x - .4, x1: x + .4, z0: hz - .4, z1: hz + .4, coam: true }); }
      deckPlate(S, P, d.y, za, zb, holes, { ds: d.ds || DS.deck });
      if (d.ib) doubleBottom(S, P, za, zb, d.y);
      if (d.hatch !== false && d.below !== undefined) for (const s of [-1, 1]) { const x = s * (spec.passX || 3); if (hz > za + 1 && hz < zb - 1 && S.hbc(hz, d.y) > Math.abs(x) + 1) ladder(P, x, hz + .25, d.y, d.below, false); }
    }
    webFrames(S, P, Z.z0, Z.z1, spec.frameBot, z => spec.bhdTop(z) - .1, spec.frameStep || 2);
    for (const w of spec.walls || []) {
      const za = Math.max(Z.z0, w.z0), zb = Math.min(Z.z1, w.z1);
      if (zb - za > .5) for (const s of [-1, 1]) lWall(P, s * w.x, w.y0, w.y1, za + .05, zb - .05, [], 5.5);
    }
    if (spec.passY !== undefined && spec.passZ && zc < spec.passZ[1] && zc > spec.passZ[0]) {
      const y0 = spec.passY, x = spec.passX || 3, yt = spec.passTop;
      for (const s of [-1, 1]) {
        lWall(P, s * (x - .7), y0, yt, Z.z0 + .05, Z.z1 - .05, [{ z0: zc - 2.2, z1: zc - 1.4 }], 7);
        tray(P, [s * (x + .45), yt - .4, Z.z1 - .05], [s * (x + .45), yt - .4, Z.z0 + .05], .45);
        pipe(P, [[s * (x - .45), yt - .45, Z.z1 - .05], [s * (x - .45), yt - .45, Z.z0 + .05]], .1);
      }
    }
    parts.push(ixPart('ixS' + String(Z.no).padStart(2, '0'), 'Zone ' + Z.no + ' · WT bulkhead · decks · frames', P, { zones: [Z.no, Math.max(1, Z.no - 1)], zone: Z.no, sys: 'structure', comp: null }));
  }
  for (const sp of spec.spaces) {
    const P = [], b = sp.box, B = { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5], zc: (b[2] + b[5]) / 2 };
    B.w = Math.min(b[3], S.hbc(B.zc, (b[1] + b[4]) / 2));
    genericContents(S, P, B, sp);
    if (!P.length) continue;
    const zs = []; for (let n = zoneOf(B.z1); n <= zoneOf(B.z0); n++) zs.push(n);
    parts.push(ixPart(sp.part || 'ix_' + sp.id, sp.name, P, { zones: zs, zone: zs[0], comp: sp.id, sys: sp.sys || (sp.kind === 'engine' ? 'machinery' : sp.kind === 'magazine' || sp.kind === 'vls' ? 'magazine' : sp.kind === 'berthing' || sp.kind === 'mess' ? 'living' : sp.kind === 'tank' ? 'tank' : sp.kind === 'control' || sp.kind === 'steering' ? 'control' : sysOf(sp.id)) }));
  }
  return { parts, zones: zones.map(z => ({ no: z.no, z0: z.z0, z1: z.z1 })) };
}
function genericContents(S, P, B, sp) {
  const y = B.y0, px = sp.passX || 0;
  switch (sp.kind) {
    case 'berthing': {
      // rack rows 1.45 m apart across, 2.3 m along; a big space in berthing blocks of 4 x 4 with cross passages, and at
      // most ~140 racks a level (the rest of a carrier's berthing is the same again)
      const b2 = O(B, { w: Math.min(B.w, B.x1) }), W2 = Math.min(B.x1, b2.w) - Math.max(B.x0, -b2.w), L2 = B.z1 - B.z0;
      const k = Math.max(1, Math.sqrt((W2 / 1.45) * (L2 / 2.3) / 140));
      const gz = k > 1.2 ? 4 * 2.3 * (k - 1) : 0, gx = k > 1.2 ? 4 * 1.45 * (k - 1) : 0;
      const zAt = i => B.z0 + 1.4 + i * 2.3 + Math.floor(i / 4) * gz, xAt = j => Math.max(B.x0, -b2.w) + 1.1 + j * 1.45 + Math.floor(j / 4) * gx;
      for (let i = 0, z = zAt(0); z < B.z1 - 1.2; z = zAt(++i)) for (let j = 0, x = xAt(0); x < Math.min(B.x1, b2.w) - .6; x = xAt(++j)) {
        const ww = Math.min(S.hbc(z - 1, y + 1.8), S.hbc(z + 1, y + 1.8));
        if (Math.abs(x) + .5 > ww || (px && Math.abs(Math.abs(x) - px) < 1.25) || (sp.clearX && Math.abs(x) < sp.clearX)) continue;
        if ((z * 7 + x * 3) % 1 < 0 && sp.sparse) continue;
        rack(P, x, y, z, true);
        if (sp.levels) for (const dy of sp.levels) rack(P, x, y + dy, z, true);
      }
      break;
    }
    case 'mess': {
      const W2 = Math.min(B.x1, B.w) - Math.max(B.x0, -B.w), k = Math.max(1, Math.sqrt((W2 / 2.3) * ((B.z1 - B.z0) / 3.2) / 90));
      for (let x = Math.max(B.x0, -B.w) + 1.8; x < Math.min(B.x1, B.w) - 1.5; x += 2.3 * k) { if (px && Math.abs(Math.abs(x) - px) < 1.3) continue; for (let z = B.z0 + 2; z < B.z1 - 1.5; z += 3.2 * k) messTable(P, x, y, z, 2.2); }
      break;
    }
    case 'store':
      for (let x = Math.max(B.x0, -B.w) + .9; x < Math.min(B.x1, B.w) - .8; x += 1.8) shelves(P, x, y, B.z0 + .8, B.z1 - .8, Math.min(2.1, B.y1 - y - .2), .6);
      break;
    case 'tank':
      tankFill(P, S, B.z0 + .3, B.z1 - .3, B.y0, B.y1, sp.fill || .7, [B.x0, B.x1]);
      break;
    case 'magazine': {
      // rack rows; the stowed rounds (closed shells) as short verticals. A big magazine gets wider aisles, fewer marks
      const h = Math.min(2.2, B.y1 - y - .3), big = (B.x1 - B.x0) * (B.z1 - B.z0) > 250, dx = big ? 2.6 : 1.4, dz = big ? 1.1 : .45;
      for (let x = B.x0 + .8; x < B.x1 - .6; x += dx) { vol(P, [x - .3, y, B.z0 + .8], [x + .3, y + h, B.z1 - .8], { ds: big ? 4.5 : 3, open: true }); for (let z = B.z0 + 1; z < B.z1 - .9; z += dz) P.push(line([[x, y + .15, z], [x, y + h - .15, z]], fn({ w: .35, ds: .6 }))); }
      break;
    }
    case 'vls':
      for (const [xc, zc] of sp.modules) {
        vol(P, [xc - 1.02, sp.y1, zc - 1.68], [xc + 1.02, sp.y0, zc + 1.68], { ds: 2.2 });
        for (const sx of [-.51, .51]) for (let r = -3; r <= 3; r += 2) P.push(lathe([xc + sx, sp.y1 + .2, zc + r * .42], FY, [[0, .3], [sp.y0 - sp.y1 - .4, .3]], fn({ n: 8, gen: 1, ds: 2 })));
      }
      break;
    case 'engine': {
      // gas turbines (or a boiler and steam turbine) in modules, a reduction gear aft, switchboard, pumps, flats
      for (const e of sp.engines || []) {
        if (e.t === 'gt') { vol(P, [e.x - 1.35, e.y - 1.2, e.z - 4], [e.x + 1.35, e.y + 1.45, e.z + 3], { ds: 2 }); P.push(lathe([e.x, e.y, e.z - 3.8], FZ, [[0, .7], [.6, .95], [6.2, .95], [6.8, .6]], fn({ n: 18, gen: 3, rings: [1, 2] }))); }
        else if (e.t === 'diesel') { vol(P, [e.x - 1.0, e.y - 1.1, e.z - 4], [e.x + 1.0, e.y + 1.3, e.z + 4], { ds: 1.8 }); for (let k = 0; k < 10; k++) P.push(box([e.x - .9, e.y + 1.3, e.z - 3.6 + k * .78], [e.x + .9, e.y + 1.55, e.z - 3.1 + k * .78], fn({ ds: 1.2 }))); }
        else if (e.t === 'boiler') { vol(P, [e.x - 2.6, e.y, e.z - 3], [e.x + 2.6, e.y + 7, e.z + 3], { ds: 2 }); drum(P, [e.x - 2.2, e.y + 7.4, e.z - 2.6], [e.x - 2.2, e.y + 7.4, e.z + 2.6], .8); }
        else if (e.t === 'turbine') { drum(P, [e.x, e.y, e.z - 3], [e.x, e.y, e.z + 3], 1.3); drum(P, [e.x, e.y, e.z + 3.2], [e.x, e.y, e.z + 6.2], .9); vol(P, [e.x - 1.8, e.y - 2.4, e.z - 3.5], [e.x + 1.8, e.y - 1.3, e.z + 6.5], { ds: 2.4 }); }
        else if (e.t === 'gear') { vol(P, [e.x - 2.6, e.y - 2, e.z - 1.8], [e.x + 2.6, e.y + 1.8, e.z + 1.8], { ds: 1.8 }); P.push(lathe([e.x, e.y, e.z - 1], FZ, [[0, 1.7], [.5, 1.7]], fn({ n: 40, gen: 0 }))); }
        else if (e.t === 'reactor') { P.push(lathe([e.x, e.y, e.z], FY, [[0, 0], [.3, 2.2], [1, 2.6], [6.5, 2.6], [7.3, 2.1], [7.6, 0]], { n: 32, gen: 6, rings: [2, 3], ds: 1.4 })); for (const s of [-1, 1]) drum(P, [e.x + s * 5, e.y, e.z], [e.x + s * 5, e.y + 8, e.z], 1.1); }
        else if (e.t === 'gen') gtg(P, e.x, e.y, e.z, e.dir || -1, e.up, e.k);
      }
      if (sp.swbd) cabinets(P, sp.swbd[0], sp.swbd[1], 2.1, .8, { face: sp.swbd[2] || 1 });
      for (const p of sp.pumps || []) pump(P, p);
      if (sp.flat !== undefined) {
        const yp = sp.flat;
        for (const s of [-1, 1]) {
          const zz = []; for (let z = B.z0 + .1; z < B.z1 - .1; z += 2.4) zz.push(z); zz.push(B.z1 - .1);
          for (let i = 0; i < zz.length - 1; i++) { const wa = Math.min(S.hbc(zz[i], yp), Math.abs(s > 0 ? B.x1 : B.x0)), wb = Math.min(S.hbc(zz[i + 1], yp), Math.abs(s > 0 ? B.x1 : B.x0)); quad(P, [s * (wa - 2.2), yp, zz[i]], [s * wa, yp, zz[i]], [s * wb, yp, zz[i + 1]], [s * (wb - 2.2), yp, zz[i + 1]], 1.8); }
          edge(P, zz.map(z => [s * (Math.min(S.hbc(z, yp), Math.abs(s > 0 ? B.x1 : B.x0)) - 2.2), yp + 1, z]), { w: .5 });
          const yt = B.y1 - .5, xt = s * (Math.min(S.hbc(B.zc, yt), Math.abs(s > 0 ? B.x1 : B.x0)) - .7);
          tray(P, [xt, yt, B.z1 - .1], [xt, yt, B.z0 + .1], .6);
          pipe(P, [[xt - s * .9, yt - .1, B.z1 - .1], [xt - s * .9, yt - .1, B.z0 + .1]], .15);
        }
      }
      break;
    }
    case 'hangar': {
      // bays: tie-down grid dots, fire curtains, workbenches along the sides
      for (let z = B.z0 + 3; z < B.z1 - 2; z += 6) for (let x = B.x0 + 3; x < B.x1 - 2; x += 6) P.push(line([[x - .2, y + .02, z], [x + .2, y + .02, z]], fn({ w: .4, ds: .3 })));
      for (const s of [-1, 1]) for (let z = B.z0 + 4; z < B.z1 - 3; z += 12) cabinets(P, [s * (B.x1 - .4), y, z], [s * (B.x1 - .4), y, z + 3.5], 1.8, .6, { face: -s, w: .7 });
      break;
    }
    case 'vehicle':
      for (const dy of [0].concat(sp.levels || [])) for (let z = B.z0 + 4; z < B.z1 - 3; z += 7.5) for (let x = B.x0 + 2; x < B.x1 - 1.5; x += 3.6) {
        // parked vehicles: a body and a cab block, lashed down
        vol(P, [x - 1.25, y + dy, z - 3], [x + 1.25, y + dy + 2.1, z + 1.6], { ds: 3 });
        vol(P, [x - 1.2, y + dy, z + 1.8], [x + 1.2, y + dy + 1.7, z + 3], { ds: 3, fine: true });
      }
      break;
    case 'control':
      for (let x = B.x0 + 1.5; x < B.x1 - 1.2; x += 3) for (let z = B.z0 + 1.5; z < B.z1 - 2.5; z += 3.4) cabinets(P, [x, y, z], [x, y, z + 2.4], 1.25, .8, { face: 1 });
      break;
    case 'steering':
      for (const [x, z] of sp.stocks) { P.push(lathe([x, y - .3, z], FY, [[0, .5], [1.8, .5], [1.8, .7], [2.2, .7]], { n: 18, gen: 3, rings: [1, 3], caps: true, ds: 1.2 })); for (const sx of [-1, 1]) P.push(lathe([x + sx * 2.4, y + 1.6, z + 1.6], [-sx, 0, 0], [[0, .26], [1.8, .26], [1.8, .12], [2.2, .12]], { n: 12, gen: 2, caps: true, ds: 1.3 })); P.push(box([x - .3, y + 1.4, z - .25], [x + .3, y + 1.8, z + 2], { ds: 1.2 })); }
      break;
    case 'aircraft':
      break;
    default: break;
  }
}

/* ---------------------------------------------------------------- class specs
   Bulkheads, deck levels and the main spaces follow data/ship_layouts.js (GEN: the compartments sim/ship.js floods and
   burns), so a part ix_<id> is that space; contents sit where the cutaways' closed volumes put the machinery. */
const vlsMods = zc => { const out = []; for (let m = 0; m < 4; m++) for (const r of [-1, 1]) out.push([(-3 + 2 * m) * 1.05, zc + r * 1.7]); return out; };
function cgInterior(model) {
  const H = hullOf(hullPrims(model, ['hull', 'below']), { s: .6, dz: 2, dy: .5, flareTop: 0 });
  const IB = -5.1, P4 = -1.6, D3 = 1.2, D2 = 3.9, deck = z => K.CG.deckY(z) - .05, VF = K.CG.VF, VA = K.CG.VA;
  const hv = (z0, z1, hw) => ({ x0: -hw, x1: hw, z0, z1 });
  const vls = [hv(47.2, 54.8, 4.6), hv(-64.8, -57.2, 4.6)], mags = [hv(57.2, 66, 6.2), hv(-76, -66, 6.2)];
  const yf = IB + .5;
  const spec = {
    zFwd: 86, zAft: -86.4, bz: [74, 66, 57.2, 46.6, 33, 18, 6, -15, -36.2, -46, -56.2, -66, -76], deckTop: deck, bhdTop: z => deck(z) - .04,
    frameBot: IB, passY: D2, passTop: 6.0, passX: 2.8, passZ: [-56.2, 66], doors: [[-2.8, D2], [2.8, D2]],
    decks: [
      { y: IB, z0: -66, z1: 66, ib: true, hatch: false },
      { y: P4, z0: -76, z1: 74, holes: [hv(-46, 18, 9)].concat(vls, mags), below: IB + .5 },
      { y: D3, z0: -76, z1: 74, holes: [hv(-36.2, 18, 9)].concat(vls, mags), below: P4 },
      { y: D2, z0: -86, z1: 80, holes: vls, below: D3 },
    ],
    spaces: [
      { id: 'SON', name: 'Sonar equipment', kind: 'control', box: [-4, P4, 66.5, 4, D2, 73.5] },
      { id: 'MAGF', name: 'Gun magazine · forward', kind: 'magazine', box: [-4.4, IB + .3, 57.8, 4.4, D2, 65.4] },
      { id: 'VLSF', name: 'Mk 41 VLS enclosure · forward (61 cells)', kind: 'vls', box: [-4.3, -1.9, VF - 3.5, 4.3, 7, VF + 3.5], y0: deck(VF) - .3, y1: deck(VF) - 7.7, modules: vlsMods(VF) },
      { id: 'FO', name: 'Fuel · forward', kind: 'tank', box: [-7, IB, 18.2, 7, P4, 46.4], fill: .72 },
      { id: 'BTH1', name: 'Berthing · forward', kind: 'berthing', box: [-7, D3, 18.5, 7, D2, 46.4], sys: 'living' },
      { id: 'BTH2', name: 'Berthing · 2nd deck forward', kind: 'berthing', box: [-7.5, D2, 18.5, 7.5, 6.4, 46.4], passX: 2.8, sys: 'living' },
      { id: 'AMR1', name: 'Auxiliary machinery room 1', kind: 'engine', box: [-7.5, IB, 6, 7.5, D2, 18], engines: [{ t: 'gen', x: 3.2, y: yf, z: 17.4, dir: -1, up: D2 }], swbd: [[-5.8, yf, 8], [-5.8, yf, 12], 1], pumps: [[-1, yf, 9], [0, yf, 15.8]] },
      { id: 'MER1', name: 'Main engine room 1', kind: 'engine', box: [-7.8, IB, -15, 7.8, D2, 6], pumps: [[-5.6, yf, 4], [5.6, yf, 4], [-5.6, yf, -12]], flat: .4, swbd: [[-6, yf, -1], [-6, yf, -4.5], 1] },
      { id: 'MESS', name: 'Mess · galley', kind: 'mess', box: [-7.8, D2, -15, 7.8, 6.2, 18], passX: 2.8, sys: 'living' },
      { id: 'MER2', name: 'Main engine room 2', kind: 'engine', box: [-7.8, IB, -36.2, 7.8, D2, -15], pumps: [[-5.6, yf, -17], [5.6, yf, -17]], flat: .4, swbd: [[6, yf, -24], [6, yf, -28], -1] },
      { id: 'AMR2', name: 'Auxiliary machinery room 2', kind: 'engine', box: [-7.8, IB, -46, 7.8, D3, -36.2], engines: [{ t: 'gen', x: -3.2, y: yf, z: -36.8, dir: -1, up: D3, k: .78 }], pumps: [[3.5, yf, -38], [4.5, yf, -43]] },
      { id: 'BTH3', name: 'Berthing · aft', kind: 'berthing', box: [-7.8, D2, -56, 7.8, 6.1, -15], passX: 2.8, sys: 'living' },
      { id: 'JP5', name: 'JP-5 tanks', kind: 'tank', box: [-6.5, IB, -56.2, 6.5, D3, -46], fill: .65, sys: 'tank' },
      { id: 'ST', name: 'Stores · aft', kind: 'store', box: [-7, D3, -65.6, 7, D2, -56.6] },
      { id: 'VLSA', name: 'Mk 41 VLS enclosure · aft (61 cells)', kind: 'vls', box: [-4.3, -1.9, VA - 3.5, 4.3, 7, VA + 3.5], y0: deck(VA) - .3, y1: deck(VA) - 7.7, modules: vlsMods(VA) },
      { id: 'MAGA', name: 'Gun magazine · aft', kind: 'magazine', box: [-4.4, IB + .3, -75.4, 4.4, D2, -66.6] },
      { id: 'STR', name: 'Steering gear room', kind: 'steering', box: [-6, D2, -76, 6, 6, -66.4], stocks: [[-4.1, -71.5], [4.1, -71.5]] },
      { id: 'FH1', name: 'CIC · forward deckhouse', kind: 'control', box: [-6.5, deck(28) + .05, 16, 6.5, 10.3, 41], sys: 'control' },
    ],
  };
  return genericInterior(H, spec);
}
function lcsInterior(model) {
  const H = hullOf(hullPrims(model, ['hull', 'below']), { s: .5, dz: 2, dy: .4, flareTop: 2 });
  const IB = -2.8, D0 = 0, D3 = 3.6, top = z => Math.min(H.top(z) - .1, 9.0), yf = IB + .4;
  const spec = {
    zFwd: 60, zAft: -62, bz: [52, 40, 28, 16, 0, -8, -22, -36, -44, -52], deckTop: top, bhdTop: top,
    frameBot: IB, passX: 1.4, doors: [[0, D3]],
    decks: [
      { y: IB, z0: -52, z1: 52, ib: true, hatch: false },
      { y: D0, z0: -60, z1: 58, holes: [{ x0: -6, x1: 6, z0: -36, z1: -8 }], below: IB + .4 },
      { y: D3, z0: -62, z1: 58, below: D0 },
    ],
    spaces: [
      { id: 'MMR', name: 'Engine rooms · diesels · gas turbines', kind: 'engine', box: [-3.5, IB, -36, 3.5, D3, -8], pumps: [[0, yf, -21], [0, yf, -23.5], [0, yf, -9.5]], flat: 1.4, swbd: [[-2.6, yf, -18.5], [-2.6, yf, -21.5], 1] },
      { id: 'JP5', name: 'JP-5 tanks', kind: 'tank', box: [-3, -3.6, -44, 3, D0, -36], fill: .7, sys: 'tank' },
      { id: 'MAG', name: 'Gun magazine · 57 mm', kind: 'magazine', box: [-2.6, IB + .3, 28.5, 2.6, D3, 39.5] },
      { id: 'AUX', name: 'Auxiliary machinery · generators', kind: 'engine', box: [-3.4, IB, -8, 3.4, D0, 0], engines: [{ t: 'gen', x: 0, y: yf, z: -.6, dir: -1, up: D0, k: .75 }] },
      { id: 'BTH', name: 'Berthing', kind: 'berthing', box: [-3.4, D3, 0, 3.4, 8.8, 28], sys: 'living' },
      { id: 'MESS', name: 'Mess · galley', kind: 'mess', box: [-3.4, D0, 0, 3.4, D3, 16], sys: 'living' },
      { id: 'FO', name: 'Fuel', kind: 'tank', box: [-3.2, IB, 0, 3.2, D0, 28], fill: .7 },
      { id: 'ST', name: 'Stores', kind: 'store', box: [-3, D0, 16, 3, D3, 28] },
    ],
  };
  return genericInterior(H, spec);
}
function lhdInterior(model) {
  const H = hullOf(hullPrims(model, ['hull', 'below', 'hullBow', 'hullMid', 'hullStern']), { s: 1.0, dz: 3, dy: .6, flareTop: 11 });
  const IB = -6.6, D1 = 1.0, D2 = 10.7, yf = IB + .5, W = K.LHD.WELL;
  const spec = {
    zFwd: 116, zAft: -126, bz: [104, 90, 76, 64, 50, 36, 20, 4, -18, -40, -55, -70, -85, -100, -115], deckTop: () => D2,
    // over the vehicle decks and the well the space runs open fore and aft: the bulkheads stop at the 1.0 m deck there
    bhdTop: z => z < 8 ? D1 - .03 : D2 - .05,
    frameBot: IB, frameStep: 3, passY: D1, passTop: D2 - .1, passX: 11.8, passZ: [14, 90], doors: [[-11.8, D1], [11.8, D1]],
    decks: [
      { y: IB, z0: -85, z1: 104, ib: true, hatch: false },
      { y: D1, z0: -115, z1: 112, holes: [{ x0: -13, x1: 13, z0: -40, z1: 4 }], below: IB + .5 },
      { y: 5.9, z0: 14, z1: 90, hatch: false, ds: 4.8 },
      { y: D2, z0: 14, z1: 114, below: D1 },
    ],
    spaces: [
      { id: 'MMR', name: 'Machinery rooms · boilers · turbines', kind: 'engine', box: [-12.5, IB, -40, 12.5, D1, 4], engines: [{ t: 'boiler', x: -5, y: yf, z: -4 }, { t: 'turbine', x: 4.5, y: -4.2, z: -12 }, { t: 'boiler', x: 5, y: yf, z: -27 }, { t: 'turbine', x: -4.5, y: -4.2, z: -35 }], swbd: [[-9, yf, -16], [-9, yf, -12], 1], flat: -1.8, pumps: [[9, yf, -36], [9, yf, -33]] },
      { id: 'MAG', name: 'Magazines · missiles and ordnance', kind: 'magazine', box: [-10, IB + .3, 20.5, 10, D1, 63.5] },
      { id: 'JP5', name: 'JP-5 tanks', kind: 'tank', box: [-10, IB, 64, 10, D1, 90], fill: .7 },
      { id: 'O2', name: 'Berthing · troops', kind: 'berthing', box: [-13, D1, 14, 13, D2, 90], passX: 11.8, levels: [4.9], sys: 'living' },
      { id: 'VEH', name: 'Vehicle decks', kind: 'vehicle', box: [-10.5, D1, W.z1, 10.5, 5.6, 8], levels: [4.9] },
      { id: 'BAL', name: 'Ballast tanks · aft', kind: 'tank', box: [-12, IB, -85, 12, D1 - .3, -55], fill: .5 },
      { id: 'BOW', name: 'Bow · stores', kind: 'store', box: [-8, D1, 90.5, 8, D2, 103.5] },
      { id: 'STR', name: 'Steering gear room', kind: 'steering', box: [-12, H.keel(-104) + 3.1, -115, 12, D1 - .1, -100], stocks: [[-7.4, -103.9], [7.4, -103.9]] },
    ],
  };
  return genericInterior(H, spec);
}
function cvInterior(model) {
  const H = hullOf(hullPrims(model, ['hullBow', 'hullMid', 'hullStern', 'hull']), { s: 1.2, dz: 3, dy: .7, flareTop: 6 });
  const HGR = 8.3, D2 = 4, D3 = -.5, D4 = -4.8, IB = -9.6, yf = IB + .4, mach = { x0: -14.5, x1: 14.5, z0: -44, z1: 38 };
  const spec = {
    zFwd: 160, zAft: -160, bz: [150, 134, 118, 98, 80, 64, 50, 38, 20, 0, -24, -44, -60, -76, -92, -104, -118, -132, -146], deckTop: () => HGR, bhdTop: () => HGR - .05,
    frameBot: IB, frameStep: 3, passY: D2, passTop: HGR - .35, passX: 14, passZ: [-104, 134], doors: [[-14, D2], [14, D2]],
    // the side protection: longitudinal bulkheads 5.5 m inboard of the shell over the machinery and magazines
    walls: [{ x: 14.9, y0: IB, y1: D2, z0: -104, z1: 98 }],
    decks: [
      { y: IB, z0: -132, z1: 134, ib: true, hatch: false, ds: 5.4 },
      { y: D4, z0: -146, z1: 150, holes: [mach], below: IB + .6, ds: 5 },
      { y: D3, z0: -146, z1: 150, holes: [mach], below: D4, ds: 5 },
      { y: D2, z0: -160, z1: 160, below: D3, ds: 5 },
    ],
    spaces: [
      { id: 'RX1', name: 'Reactor compartment 1 · A4W · main machinery · steam turbines ×2', kind: 'engine', box: [-14.5, IB, 0, 14.5, D2, 38], engines: [{ t: 'reactor', x: 0, y: yf, z: 30 }, { t: 'turbine', x: -7, y: -7.2, z: 6 }, { t: 'turbine', x: 7, y: -7.2, z: 6 }, { t: 'gear', x: -7, y: -7.2, z: 16 }, { t: 'gear', x: 7, y: -7.2, z: 16 }], flat: -2.5, swbd: [[-12.5, yf, 2.5], [-12.5, yf, 7], 1] },
      { id: 'RX2', name: 'Reactor compartment 2 · A4W', kind: 'engine', box: [-14.5, IB, -24, 14.5, D2, 0], engines: [{ t: 'reactor', x: 0, y: yf, z: -16 }], pumps: [[9, yf, -5], [-9, yf, -5]] },
      { id: 'MMR1', name: 'Main machinery room · steam turbines ×2', kind: 'engine', box: [-14.5, IB, -44, 14.5, D2, -24], engines: [{ t: 'turbine', x: -9, y: -7.2, z: -40 }, { t: 'turbine', x: 9, y: -7.2, z: -40 }, { t: 'gear', x: -9, y: -7.2, z: -30 }, { t: 'gear', x: 9, y: -7.2, z: -30 }], flat: -2.5 },
      { id: 'MAGF', name: 'Magazines · forward · bombs and missiles', kind: 'magazine', box: [-14.5, IB + .3, 56, 14.5, D4, 98] },
      { id: 'MAGF', part: 'ix_MAGF_2', name: 'Magazines · forward · upper', kind: 'magazine', box: [-14.5, D4, 56, 14.5, D3, 98] },
      { id: 'MAGA', name: 'Magazines · aft · bombs and missiles', kind: 'magazine', box: [-14.5, IB + .3, -104, 14.5, D4, -62] },
      { id: 'MAGA', part: 'ix_MAGA_2', name: 'Magazines · aft · upper', kind: 'magazine', box: [-14.5, D4, -104, 14.5, D3, -62] },
      { id: 'JP5F', name: 'JP-5 tanks · forward', kind: 'tank', box: [-16.5, IB, 98, 16.5, D3, 134], fill: .7 },
      { id: 'JP5A', name: 'JP-5 tanks · aft', kind: 'tank', box: [-16.5, IB, -132, 16.5, D3, -104], fill: .7 },
      { id: 'D2', name: '2nd deck · berthing · forward', kind: 'berthing', box: [-18, D2, 38, 18, HGR, 134], passX: 14, sys: 'living' },
      { id: 'D2', part: 'ix_D2_aft', name: '2nd deck · berthing · aft', kind: 'berthing', box: [-18, D2, -104, 18, HGR, -44], passX: 14, sys: 'living' },
      { id: 'D2', part: 'ix_D2_mess', name: '2nd deck · mess decks · galleys', kind: 'mess', box: [-18, D2, -44, 18, HGR, 38], passX: 14, sys: 'living' },
      { id: 'AFT', name: 'Steering gear rooms', kind: 'steering', box: [-14, D3, -160, 14, D2, -146], stocks: [[-7, -154.2], [7, -154.2]] },
    ],
  };
  return genericInterior(H, spec);
}
/* the hull's prims for the profile: the named parts of the unit model and the cut model's underwater parts */
function hullPrims(model, names) {
  const out = [];
  for (const p of model.parts) if (names.includes(p.name) && p.prims) out.push(...p.prims);
  return out;
}

/* ================================================================ install */
const ZONES = {}, COMPS = {}, CACHE = new Map();
const zoneList = (Z, z0, z1) => Z.filter(q => z1 >= q.z0 - .05 && z0 <= q.z1 + .05).map(q => q.no);
/* the class's interior parts (shared by the unit model and the cutaway); unit: plus the cutaway's own hidden parts */
function build(key, cut) {
  const ck = key + (cut ? '_cut' : '');
  if (CACHE.has(ck)) return CACHE.get(ck);
  let base = CACHE.get(key);
  if (!base) {
    if (key === 'destroyer') {
      base = ddInterior(true);
      ZONES.destroyer = DD.ZN.map(z => ({ no: z.no, z0: z.z0, z1: z.z1, name: 'Zone ' + z.no }));
    } else {
      const f = { cg: cgInterior, lcs: lcsInterior, lhd: lhdInterior, carrier: cvInterior }[key];
      const cutF = K.CUT0[key + '_cut'];
      if (!f || !cutF) return [];
      const cm = cutF();
      const r = f(cm);
      base = r.parts; ZONES[key] = r.zones;
    }
    COMPS[key] = base.filter(p => p.comp).map(p => ({ id: p.comp, name: p.label, zone: p.zone, sys: p.sys, box: boxOf(p) }));
    CACHE.set(key, base);
  }
  let parts = base;
  if (!cut) {
    if (key === 'destroyer') parts = base.concat(ddInterior(false).filter(p => !/^ix/.test(p.name)));
    else {
      // the cutaway's interior volumes (machinery, magazines, hangar ...) gated like the rest
      const cm = K.CUT0[key + '_cut'](), Z = ZONES[key] || [];
      const extra = cm.parts.filter(p => p.inside && !p.dyn && !p.xf).map(p => {
        const b = boxOf(p), zs = b ? zoneList(Z, b[2], b[5]) : [];
        return ixPart(p.name, p.label, p.prims, { zones: zs.length ? zs : [1], zone: zs[0] || 1, comp: null, sys: /mag|vls/i.test(p.name) ? 'magazine' : /berth/.test(p.name) ? 'living' : /hangar|bay|vehicle/.test(p.name) ? 'aviation' : 'machinery' });
      });
      parts = base.concat(extra);
    }
  }
  CACHE.set(ck, parts);
  return parts;
}
function boxOf(p) {
  const [a, b] = GEO.bounds(p);
  return a[0] <= b[0] ? [a[0], a[1], a[2], b[0], b[1], b[2]].map(v => Math.round(v * 100) / 100) : null;
}
/* the model with its interior parts appended (the exterior untouched; a part the model already has is kept as it is) */
function withInterior(key, cut) {
  return model => {
    const have = new Set(model.parts.map(p => p.name));
    const add = build(key, cut).filter(p => !have.has(p.name));
    return O(model, { parts: model.parts.concat(add), interior: true });
  };
}
export function installInterior(kit) {
  K = kit;
  const wrap = {};
  for (const k of ['destroyer', 'cg', 'lcs', 'lhd', 'carrier']) { wrap[k] = withInterior(k, false); wrap[k + '_cut'] = withInterior(k, true); }
  return { wrap, ZONES, COMPS, anatomy: anatomyOf, zonesNear: interiorZones, build };
}
/* the zones within r m (along the length) of a model-frame point */
export function interiorZones(key, p, r) {
  const Z = ZONES[key], out = {};
  if (!Z) return out;
  const z = p[2], rr = r || 0;
  for (const q of Z) if (z + rr >= q.z0 && z - rr <= q.z1) out[q.no] = 1;
  return out;
}

/* ================================================================ anatomy (Inspect): entries for a cutaway's interior parts */
const GROUP = {
  structure: { id: '17', label: 'Watertight bulkheads · WT doors · decks · frames', note: 'The watertight subdivision: transverse bulkheads to the main deck with their doors on the damage control deck, decks and flats with scuttles, the inner bottom over the double bottom.', ex: [0, 0, 0], w0: .62 },
  machinery: { id: '18', label: 'Auxiliary machinery · generators · switchboards · pumps', ex: [0, 9, 0], w0: .5 },
  electrical: { id: null, label: 'Switchboards · cable trays', ex: [0, 9, 0], w0: .5 },
  magazine: { id: '19', label: 'Magazines · loaders · hoists', ex: [0, 11, 0], w0: .46 },
  living: { id: '20', label: 'Berthing · messes · galley · passages', ex: [0, 13, 0], w0: .42 },
  tank: { id: '21', label: 'Fuel · JP-5 · peak tanks', ex: [0, 5, 0], w0: .54 },
  stores: { id: '22', label: 'Stores · workshops', ex: [0, 12, 0], w0: .44 },
  control: { id: '23', label: 'CIC · equipment rooms · pilot house · sonar · steering', ex: [0, 15, 0], w0: .4 },
  aviation: { id: null, label: 'Aviation stores · helicopter support', ex: [0, 12, 0], w0: .44 },
};
function anatomyOf(key, cutParts) {
  const parts = (cutParts || []).filter(p => p.inside && (p.sys || /^ix/.test(p.name)));
  const by = new Map();
  for (const p of parts) { const s = p.sys || 'stores'; if (!by.has(s)) by.set(s, []); by.get(s).push(p.name); }
  const out = [];
  for (const [s, names] of by) {
    const G = GROUP[s] || GROUP.stores;
    out.push(Object.assign({ id: G.id, parts: names, label: G.label, size: s === 'structure' ? (key === 'destroyer' ? '13 bulkheads · 14 zones' : '') : '', explode: G.ex, w0: G.w0, cls: 'part' }, G.note ? { note: G.note } : {}, { side: s === 'structure' || s === 'living' || s === 'tank' ? 'L' : 'R' }));
  }
  return out;
}
