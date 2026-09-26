/* From a hit on a ship to a structural patch (patch.js spec): the plating round the hit as a grid aligned to the model
   surface there, the decks and a bulkhead inside at the ship's deck heights and frame spacing, the spaces the gas
   fills, the charge. Model frame: +Z bow, +Y up (y = 0 the waterline), +X starboard. No DOM, no GL.

   hullOf(u) -> the class's plating and framing (HULL); hitSpec(o) / cookSpec(o) -> spec, or null (nothing to model).

   A side patch: a vertical plate (the side, normal horizontal and outward) as wide as the charge asks (2.5 W^(1/3),
   3 - 10 m each way, 14 m over ~300 kg), up to the main deck (a skin plate too: the model's deck dots follow it) and down as far; decks
   at the class's levels, the nearest transverse bulkhead, the space behind up to the far side. A deck patch: the deck
   (normal up) over the same width, bounded athwartships by the side shell, the decks below, a bulkhead.
   Local frame: z the outward normal of the struck plate, y up (side) or athwartships (deck), x = y cross z.

   o.big (the shell solver): the patch as the bench sizes its Burke patch (11cab80): a box of half-size
   clamp(3 + 1.5 W^(1/3), 3, 14) m round the hit, joined with the compartment the blast works in (between its two
   bulkheads and its two decks, the one holding the charge, else the one behind the struck plating), so the damage stays
   inside the patch; both bulkheads and every deck across it are modelled. spec.grade: the grid is fine (the solver's S)
   within 1.5 + 0.6 W^(1/3) m (2-6 m) of the hit and the charge on each axis, 2 S beyond (shell/model.js sceneOf). */
import { S_GRID, chargeR } from './phys.js';

/* plating (mm) and framing by class: public figures, coarse. mat: hsla (HSLA-80 class), mild, alu (5xxx) */
export const HULL = {
  warship: { mat: 'hsla', belt: 12, side: 10, deck: 9, super: 6, superMat: 'alu', inner: 6.5, innerMat: 'mild', frame: 2.4, long: .75, deckH: 2.7, bhd: 12, tie: 1 },
  alu:     { mat: 'alu', belt: 8, side: 7, deck: 7, super: 5, superMat: 'alu', inner: 5, innerMat: 'alu', frame: 1.2, long: .5, deckH: 2.6, bhd: 10, tie: .6 },
  amphib:  { mat: 'hsla', belt: 14, side: 12, deck: 20, super: 8, superMat: 'mild', inner: 8, innerMat: 'mild', frame: 2.4, long: .8, deckH: 2.8, bhd: 14, tie: 1.4,
    levels: [0, -1.3, -7.7] },
  carrier: { mat: 'hsla', belt: 25, side: 22, deck: 45, super: 10, superMat: 'hsla', inner: 12, innerMat: 'hsla', frame: 1.8, long: .9, deckH: 2.9, bhd: 16, tie: 2.5,
    levels: [0, -3.2, -11.6] },
  craft:   { mat: 'alu', belt: 5, side: 5, deck: 5, super: 4, superMat: 'alu', inner: 4, innerMat: 'alu', frame: 1, long: .5, deckH: 2.2, bhd: 6, tie: .4 },
  sub:     { mat: 'hsla', belt: 35, side: 35, deck: 35, super: 12, superMat: 'hsla', inner: 10, innerMat: 'hsla', frame: .75, long: .75, deckH: 2.6, bhd: 12, tie: 2 },
};
export function classOf(def, type) {
  if (def.domain !== 'sea') return null;
  if (def.sub) return 'sub';
  if (def.size[0] < 45 || def.hover) return 'craft';
  if (type === 'lcs') return 'alu';
  if (def.size[0] > 300) return 'carrier';
  if (def.size[0] > 200) return 'amphib';
  return 'warship';
}
export function hullOf(u) { const c = classOf(u.def, u.type); return c ? Object.assign({ cls: c }, HULL[c]) : null; }

/* the deck levels (model y) of a hull round a height range */
function levelsOf(H, deckY, draught, y0, y1) {
  const out = [];
  const base = (H.levels || [0]).map(d => deckY + d);
  for (const y of base) out.push(y);
  let low = Math.min(...base);
  for (let y = low - H.deckH; y > -draught + .8; y -= H.deckH) out.push(y);
  for (let y = deckY + H.deckH; y < deckY + 40; y += H.deckH) out.push(y);
  out.sort((a, b) => a - b);
  return out.filter(y => y > y0 - 12 && y < y1 + 12);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* o = { u (unit), H (hullOf), a: [x y z] (model: the hit on the surface), n (its outward normal), din (the round's way),
   zone ('belt'|'side'|'deck'|'super'), fz ('in'|'out'|'frag'), standoff (m), W (kg TNT that detonates), Wgas, vapour,
   deckY, halfB(z, y) (the hull's half-beam there), C (model: a charge point to use instead, cook-offs), Vspace (m^3) } */
export function hitSpec(o) {
  const S = S_GRID, H = o.H, def = o.u.def, a = o.a, draught = def.draught || 5;
  const deck = o.n[1] > .7;
  const Wm = Math.max(o.W || 0, (o.Wgas || 0) * .6, (o.vapour || 0) * .5, 1);
  // the patch: 2.5 W^(1/3) each way, 3 - 10 m (to 14 m for the largest loads: a clamped edge closer than that would
  // hold plating the blast should move; beyond the patch the hull stays as drawn)
  const Rp = clamp(2.5 * Math.cbrt(Wm), 3, Wm > 300 ? 14 : 10);
  const hb = Math.max(1, o.halfB ? o.halfB(a[2], deck ? a[1] - .5 : a[1]) : def.size[1] / 2);
  // the local frame
  let Z, Y, X;
  if (deck) { Z = [0, 1, 0]; X = [0, 0, 1]; Y = [1, 0, 0]; }
  else { Z = norm([o.n[0], 0, o.n[2]]); if (!(Math.abs(Z[0]) + Math.abs(Z[2]) > .1)) Z = [a[0] >= 0 ? 1 : -1, 0, 0]; Y = [0, 1, 0]; X = cross(Y, Z); }
  const toL = p => { const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; return [d[0] * X[0] + d[1] * X[1] + d[2] * X[2], d[0] * Y[0] + d[1] * Y[1] + d[2] * Y[2], d[0] * Z[0] + d[1] * Z[1] + d[2] * Z[2]]; };
  const sn = v => Math.round(v / S) * S;
  const zoneMat = o.zone === 'super' ? H.superMat : H.mat;
  const tSkin = (o.tmm || H[o.zone] || H.side) / 1000;
  const along = X[2];                                   // local x per model z (side patches; deck: 1)
  const pu = sn(-a[2] * (Math.abs(along) > .3 ? Math.sign(along) : 1));   // frames at model z = k frame
  const plates = [];
  let box, comps = [], depth, grade = null;
  const levels = levelsOf(H, o.deckY, draught, a[1] - 15, a[1] + 15);
  // (big) where the charge goes off, local, before the patch is known: the compartment it works in
  const W0 = o.W || 0, rc0 = chargeR(W0);
  let Cp;
  if (o.C) Cp = toL(o.C);
  else if (o.fz === 'in') { const d = o.din, l = Math.hypot(d[0], d[1], d[2]) || 1; Cp = toL([a[0] + d[0] / l * 1.6, a[1] + d[1] / l * 1.6, a[2] + d[2] / l * 1.6]); if (Cp[2] > -.6) Cp[2] = -.6; }
  else Cp = [0, 0, Math.max(rc0 + .05, o.standoff || 0)];
  const Lb = clamp(3 + 1.5 * Math.cbrt(Wm), 3, 14), Rf = clamp(1.5 + .6 * Math.cbrt(Wm), 2, 6);
  const Cq = [Cp[0], Cp[1], Math.min(Cp[2], -.3)];                 // (an outside burst: the space behind the plating)
  // the bulkheads near (model z)
  const bz = [];
  for (let k = Math.floor((a[2] - Rp) / H.bhd) - 1; k <= Math.ceil((a[2] + Rp) / H.bhd) + 1; k++) bz.push(k * H.bhd + H.bhd * .5);
  if (!deck) {
    const Dz = sn(clamp(2 * hb * .9, 1.5, 6)), Dv = clamp(2 * hb, 2, 14);
    depth = Dz;
    let yb = sn(-.75 * Rp), yt = sn(.75 * Rp);
    let bigX = null;
    if (o.big) {
      // the compartment round the charge: its decks (floor, ceiling) and bulkheads (model z -> local x)
      const lv = levels.map(y => y - a[1]), fl = Math.max(-1e3, ...lv.filter(y => y < Cq[1])), ce = Math.min(1e3, ...lv.filter(y => y > Cq[1]));
      yb = sn(Math.min(-.75 * Lb, fl - .75)); yt = sn(Math.max(.75 * Lb, ce + .75));
      if (Math.abs(along) > .3) {
        const xs = bz.map(z => (z - a[2]) / along), lo = Math.max(-1e3, ...xs.filter(x => x < Cq[0])), hi = Math.min(1e3, ...xs.filter(x => x > Cq[0]));
        bigX = [sn(Math.max(-16, Math.min(-Lb, lo - .75))), sn(Math.min(16, Math.max(Lb, hi + .75)))];
      } else bigX = [-sn(Lb), sn(Lb)];
    }
    yb = Math.max(yb, sn(-draught + .6 - a[1]));
    // the main deck over the hit: the top of the patch (a skin plate: the model's deck follows it)
    const main = o.deckY - a[1];
    let topSkin = false;
    // (a hit at the deck edge: the deck is the top of the patch, the side below it)
    if (main > -1 && main < yt + 1.2) { yt = sn(main); topSkin = true; }
    if (yt - yb < 2) { yb = yt - sn(2); }
    const x0 = bigX ? bigX[0] : -sn(Rp), x1 = bigX ? bigX[1] : sn(Rp);
    plates.push({ ax: 2, val: 0, u0: x0, u1: x1, v0: yb, v1: yt, h: tSkin, mat: zoneMat, fu: H.frame, pu, fv: H.long, pv: sn(-a[1]), heavy: 30e-4 * H.tie, light: 12e-4 * H.tie, tie: H.tie, skin: 1 });
    if (topSkin) plates.push({ ax: 1, val: yt, u0: x0, u1: x1, v0: -Dz, v1: 0, h: H.deck / 1000, mat: H.mat, fu: H.frame, pu, fv: 1, pv: 0, heavy: 30e-4 * H.tie, light: 10e-4 * H.tie, tie: H.tie, skin: 1 });
    // inner decks: the nearest to the hit first (up to 3)
    const inner = levels.map(y => sn(y - a[1])).filter(y => y > yb + S * 2 && y < yt - S * 2 && !(o.open && y + a[1] > o.open[0] - .2 && y + a[1] < o.open[1] + .2)).sort((p, q) => Math.abs(p) - Math.abs(q)).slice(0, o.big ? 4 : 3);
    for (const y of inner) plates.push({ ax: 1, val: y, u0: x0, u1: x1, v0: -Dz, v1: 0, h: H.inner / 1000, mat: H.innerMat, fu: H.frame, pu, fv: 1, pv: 0, heavy: 20e-4 * H.tie, light: 8e-4 * H.tie, tie: H.tie });
    // the transverse bulkheads inside the patch: the nearest (big: the two nearest, the compartment's)
    const xbs = [];
    if (Math.abs(along) > .3) for (const z of bz) { const x = sn((z - a[2]) / along); if (x > x0 + (o.big ? .4 : 1) && x < x1 - (o.big ? .4 : 1)) xbs.push(x); }
    xbs.sort((p, q) => Math.abs(p - (o.big ? Cq[0] : 0)) - Math.abs(q - (o.big ? Cq[0] : 0))); xbs.length = Math.min(xbs.length, o.big ? 2 : 1); xbs.sort((p, q) => p - q);
    for (const xb of xbs) plates.push({ ax: 0, val: xb, u0: -Dz, u1: 0, v0: yb, v1: yt, h: H.inner / 1000, mat: H.innerMat, fu: 0, fv: 1, pv: 0, heavy: 0, light: 8e-4 * H.tie, tie: H.tie });
    const xb = xbs.length ? xbs[0] : null;
    box = [x0, yb, -Dz, x1, yt, 0];
    // the spaces: between the decks (their real levels), either side of the bulkhead, to the far side
    const lv = levels.map(y => sn(y - a[1]));
    const bands = [];
    for (let i = 0; i < lv.length - 1; i++) if (lv[i + 1] > yb && lv[i] < yt) bands.push([lv[i], lv[i + 1]]);
    if (!bands.length) bands.push([yb - 1, yt + 1]);
    const xe = [-1e3, ...xbs, 1e3], xs = [];
    for (let i = 0; i + 1 < xe.length; i++) xs.push([xe[i], xe[i + 1], i > 0 && i + 2 < xe.length ? Math.abs(xe[i + 1] - xe[i]) : H.bhd]);
    for (const [y0, y1] of bands) for (const [xa, xz, len] of xs) comps.push({ b: [xa, y0, -1e3, xz, y1, 0], V: Math.max(8, len * (y1 - y0) * Dv * .85) });
    void xb;
  } else {
    // a deck: bounded athwartships by the side shell (the deck edge is held by it)
    const hbx = Math.max(1.2, hb);
    const Rw = o.big ? Math.max(Rp, Lb) : Rp;
    // (big: where the hull's side is within reach, the deck runs to it and the side shell is modelled, so the deck edge
    // is held by plating, not by the patch's anchors)
    const sideL = o.big && -hbx - a[0] > -Rw, sideR = o.big && hbx - a[0] < Rw;
    const y0 = sideL ? sn(-hbx - a[0]) : sn(Math.max(-Rw, -hbx - a[0] + .3)), y1 = sideR ? sn(hbx - a[0]) : sn(Math.min(Rw, hbx - a[0] - .3));
    let x0 = -sn(Rp), x1 = sn(Rp);
    if (o.big) {
      const xs = bz.map(z => z - a[2]), lo = Math.max(-1e3, ...xs.filter(x => x < Cq[0])), hi = Math.min(1e3, ...xs.filter(x => x > Cq[0]));
      x0 = sn(Math.max(-16, Math.min(-Lb, lo - .75))); x1 = sn(Math.min(16, Math.max(Lb, hi + .75)));
    }
    const below = levels.map(y => sn(y - a[1])).filter(y => y < -S * 4).sort((p, q) => q - p);
    const Dz = sn(clamp(below.length >= 2 ? -below[1] + .5 : (below[0] ? -below[0] + 2 : 5), 2.5, 6.5));
    depth = Dz;
    plates.push({ ax: 2, val: 0, u0: x0, u1: x1, v0: y0, v1: Math.max(y1, y0 + S * 8), h: tSkin, mat: o.zone === 'super' ? H.superMat : H.mat, fu: H.frame, pu: sn(-a[2]), fv: 1, pv: 0, heavy: 30e-4 * H.tie, light: 10e-4 * H.tie, tie: H.tie, skin: 1 });
    // (a module's own space, cook-offs: no decks inside its box, model y o.open[0] .. o.open[1])
    const decksBelow = below.filter(y => y > -Dz + S * 2 && !(o.open && y + a[1] > o.open[0] - .2 && y + a[1] < o.open[1] + .2)).slice(0, 2);
    for (const y of decksBelow) plates.push({ ax: 2, val: y, u0: x0, u1: x1, v0: y0, v1: Math.max(y1, y0 + S * 8), h: H.inner / 1000, mat: H.innerMat, fu: H.frame, pu: sn(-a[2]), fv: 1, pv: 0, heavy: 20e-4 * H.tie, light: 8e-4 * H.tie, tie: H.tie });
    const xbs = [];
    for (const z of bz) { const x = sn(z - a[2]); if (x > x0 + (o.big ? .4 : 1) && x < x1 - (o.big ? .4 : 1)) xbs.push(x); }
    xbs.sort((p, q) => Math.abs(p - (o.big ? Cq[0] : 0)) - Math.abs(q - (o.big ? Cq[0] : 0))); xbs.length = Math.min(xbs.length, o.big ? 2 : 1); xbs.sort((p, q) => p - q);
    for (const xb of xbs) plates.push({ ax: 0, val: xb, u0: -Dz, u1: 0, v0: y0, v1: Math.max(y1, y0 + S * 8), h: H.inner / 1000, mat: H.innerMat, fu: 0, fv: 1, pv: 0, heavy: 0, light: 8e-4 * H.tie, tie: H.tie });
    for (const [on, yS] of [[sideL, y0], [sideR, y1]]) if (on) plates.push({ ax: 1, val: yS, u0: x0, u1: x1, v0: -Dz, v1: 0, h: (H.side || 10) / 1000, mat: H.mat, fu: H.frame, pu: sn(-a[2]), fv: H.long, pv: 0, heavy: 30e-4 * H.tie, light: 12e-4 * H.tie, tie: H.tie });
    box = [x0, y0, -Dz, x1, Math.max(y1, y0 + S * 8), 0];
    const zl = [0, ...decksBelow, -Dz - 3], ya = sideL ? y0 : -1e3, yz = sideR ? y1 : 1e3;
    const xe = [-1e3, ...xbs, 1e3], xs = [];
    for (let i = 0; i + 1 < xe.length; i++) xs.push([xe[i], xe[i + 1], i > 0 && i + 2 < xe.length ? Math.abs(xe[i + 1] - xe[i]) : H.bhd]);
    for (let i = 0; i < zl.length - 1; i++) for (const [xa, xz, len] of xs) comps.push({ b: [xa, ya, zl[i + 1], xz, yz, zl[i]], V: Math.max(8, len * 2 * hbx * (zl[i] - zl[i + 1]) * .85) });
  }
  // the charge
  const W = o.W || 0, rc = chargeR(W);
  let C;
  if (o.C) C = toL(o.C);
  else if (o.fz === 'in') {
    const d = o.din, l = Math.hypot(d[0], d[1], d[2]) || 1;
    C = toL([a[0] + d[0] / l * 1.6, a[1] + d[1] / l * 1.6, a[2] + d[2] / l * 1.6]);
    if (C[2] > -.6) C[2] = -.6;
  } else C = [0, 0, Math.max(rc + .05, o.standoff || 0)];
  C[0] = clamp(C[0], box[0] + .5, box[3] - .5);
  if (C[2] < 0) { C[1] = clamp(C[1], box[1] + .3, box[4] - .3); C[2] = clamp(C[2], box[2] + .4, -.3); }
  if (o.big) {
    // fine within Rf of the hit and of the charge on each axis (the bench's graded grid), 2 S beyond
    const f = k => [Math.min(0, C[k]) - Rf, Math.max(0, C[k]) + Rf];
    grade = { fine: [f(0), f(1), f(2)] };
  }
  if (o.Vspace) { for (const c of comps) { const b = c.b; if (C[0] >= b[0] && C[0] <= b[3] && C[1] >= b[1] && C[1] <= b[4] && C[2] >= b[2] && C[2] <= b[5]) { c.V = o.Vspace; break; } } }
  // at most 7 spaces: the charge's own and its neighbours first
  const gap = b => { let d = 0; for (let k = 0; k < 3; k++) d += Math.max(0, b[k] - C[k], C[k] - b[k + 3]) ** 2; return d; };
  comps.sort((p, q) => gap(p.b) - gap(q.b));
  return { S, plates, box, comps: comps.slice(0, 7), depth, grade, frame: { O: a.slice(), X, Y, Z }, charge: { C, W, Wgas: o.Wgas || 0, vapour: o.vapour || 0, inside: C[2] < 0 },
    wl: 0, wlLocal: -a[1], kind: deck ? 'deck' : 'side', Rp };
}

/* a cook-off: the module's contents at the nearest outer surface (the deck over it, else the side) */
export function cookSpec(o) {
  const u = o.u, m = o.mod, b = m.box, H = o.H;
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const hb = Math.max(1, o.halfB ? o.halfB(c[2], c[1]) : u.def.size[1] / 2);
  const dd = (o.a && o.n && o.n[1] > .7 ? o.a[1] : o.deckY) - b[4], ds = hb - Math.max(Math.abs(b[0]), Math.abs(b[3]));
  const V = Math.max(10, (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) * .7);
  let a, n, zone;
  if (o.a && o.n && o.n[1] > .7) { a = o.a.slice(); n = [0, 1, 0]; zone = 'deck'; }        // the deck the load vents through (snapped)
  else if (dd <= ds * 1.2 + .5) { a = [c[0], o.deckY, c[2]]; n = [0, 1, 0]; zone = 'deck'; }
  else { const sx = c[0] >= 0 ? 1 : -1; a = [sx * hb, c[1], c[2]]; n = [sx, 0, 0]; zone = c[1] < 1.8 ? 'belt' : 'side'; }
  // the load goes up in the upper part of its space, which is open to the plating over it (a VLS module, a magazine's
  // trunk: no decks inside its box)
  const cc = [c[0], Math.max(c[1], b[4] - Math.min(2.5, (b[4] - b[1]) * .3)), c[2]];
  const spec = hitSpec({ u, H, a, n, din: [-n[0], -n[1], -n[2]], zone, fz: 'in', W: o.W, Wgas: o.Wgas, vapour: o.vapour, deckY: o.deckY, halfB: o.halfB, C: zone === 'deck' ? cc : c, Vspace: V, open: [b[1], b[4]], big: o.big });
  if (!spec) return null;
  // the charge in the module's space, pulled up into the patch
  const C = spec.charge.C;
  if (C[2] < 0) C[2] = Math.max(spec.box[2] + .5, Math.min(-.4, C[2]));
  else C[2] = Math.min(3, Math.max(.3, C[2]));                  // a load on deck (aircraft, a launcher): it goes off over the plating
  spec.zone = zone;
  return spec;
}
