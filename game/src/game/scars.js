/* Scars: a hit leaves its mark in the model's own dots, where it struck, for the rest of the match.

   On a sim 'hit' (a ship, a vehicle, a site; not an aircraft, not a boat under the water):
     where    the sim's hit point (the part box the round entered) is carried along the round's path onto the model's
              real surface (its sampled dots), in the model frame, with that surface's normal: the mark moves with the
              hull as she rolls, turns, lists and sinks
     what     the steel's answer to the charge (the rule below): a dent, a petalled hole, a rupture, or pockmarks
     look     (engine/models.js, scarGLSL, d.scars): the dots of the plating moved (dished, bulged, petals bent, a deck
              lifted), gone in a hole, charred round it; the model's own dots in the pocket behind a hole gone, and the
              occlusion splats of the hole pushed back to the pocket's far end (a plug: neither the far side of the hull
              nor the sea shows through)
     inside   what is behind a hole, drawn here as dots in the model frame (draw3d): the deck levels cut at the hole
              (ragged edges bent the blast's way), the frames and stiffeners of the shell torn and bent, a bulkhead, the
              pocket's back wall, rubble on the deck below; charred dark, the fire inside glowing on them (deepest and
              lowest most). A vehicle: its floor, back wall and ribs
     ejecta   the very dots that left the hole (sampled from the model's cloud there) blown out along the normal
     fire     one fx Fire per hole, seated on the burning surface itself (fx/lib/impact.js Fire seats, model frame,
              carried with the full pose every frame): on the torn upper rim of a hole in a side, round the rim of one in
              a deck, and inside on the deck below (flames rising out of the hole); a seat under the water burns no
              flame (steam and smoke only where the sea meets it). Its light stays local (never reaching the water)

   THE RULE (a game approximation of common engineering figures; kg = warhead mass, t = the local plating, mm steel
   equivalent). The punch x = cbrt(kg_eff) x 10 / t (1: a 1 kg charge on 10 mm plate):
     plating t (PLATE): DDG / CG hull side 10, waterline belt 12, weather deck 9, superstructure 6 (aluminium LCS 7 /
       5); LHD side 12, flight deck 20; carrier (Nimitz) side 22, belt 25, flight deck 45, island 10; small craft 5;
       a surfaced boat's pressure hull 35, sail 12; trucks, TELs, containers 4; Tigr 6; ACV 14; a site 8
     charge kg_eff: the warhead (WH); a blast-frag SAM counts half (the rest is its fragment case); a stand-off burst
       (the sim's blast / miss distance d) falls off as (1 - z)^2 with z = d / cbrt(kg) (120 kg at 5 m: a shallow dish)
     (checked against game/concepts/blast, a Kinney-Graham load on a plate lattice: small charges dent, ~120 kg in
     contact with 10 mm opens a few m^2, 5 m off only dishes it, a charge inside tears decks and bulkheads)
     outcome:
       gun rounds (Phalanx, 30 mm, 12.7 mm)   pockmarks: a hole per round (0.07-0.25 m) scattered over 1-4 m, each
                                              with a dished, scorched ring; on plating too thick (x < 0.25), dents only
       x < 0.7                                a dent: dished in (or bulged out), no hole; radius 0.7 cbrt(kg) + 0.2 m,
                                              depth up to a fifth of it; scorched
       0.7 <= x < 4.5                          a petalled hole: radius k cbrt(kg) sqrt((x - 0.7) / (x + 0.3)), at least
                                              0.25 k cbrt(kg); k 0.95 for a charge inside (it tears the plating out from
                                              within: Stark, Cole), 0.45 for a contact or stand-off burst (a Hellfire on
                                              a DDG side ~0.8 m, a 5" round ~0.5 m, 120 kg ~1.8 m); the petals bent the way
                                              the blast went; the plating round it buckled out to ~2.6 radii; frames torn
       x >= 4.5, or kg >= 200 and x >= 1.5    a rupture: the same hole, the plating displaced in and out over ~4 radii,
                                              a deck over it lifted and warped, frames torn and sticking out
     the blast's way: a penetrating round with a delayed fuze (Oniks, Kalibr, Kh-35, Tomahawk, SLAM-ER, a bomb) goes
     off inside: petals and plating blown out, a deck lifted; a contact or stand-off burst (shells, ATGMs, SAMs)
     pushes them in. A blast-frag SAM also peppers the plating round its burst with fragment holes. Capped by the
     target's size (0.35 x its larger cross dimension). A hit on an old mark adds its charge (a second dent may open
     a hole). Up to 8 marks a unit (the shader's arrays).

   Hooks: game.scars = { surface(ev), normal(ev), charge(ev) (the snapped world point, normal and kg of the hit just
   handled: the fx blast sits there), burning(id), heavy(id) (> 1: the warhead was far too big for the target),
   last(id), of(id), clear(id), ignite(id) (a ship lost with no fire of her own: one at her worst hole, else on her
   deck amidships), stats }. WH (warhead kg) is exported. A 'cookoff' (sim/damage.js) blows a rupture out through the
   deck over the module. The render instance gets d.scars (drawn this frame, game.drawn) for engine/models.js.
   Console: ONIKS.game.scars.

   THE BLAST SOLVER (game/src/blast): a ship hit by a blast charge (not gun rounds, not under the keel) and a cook-off with
   contents (data/modules.js) are solved on the GPU with the bench's structural model: the mark here keeps its
   bookkeeping (where, the charge, the fire, the hooks), its analytic carve and interior are left out (S.blast: the
   blast system draws the plating as the solver left it and what is inside), its ejecta fly when the plating tears, its
   fire re-seats on the torn rim and the deck inside when the patch settles. Where the solver cannot run (or a patch
   fails) the analytic mark comes back (rebuild).

   createScars(game) -> system 'scars' (priority 12: its events before debris (11) and fx (5); draws after render). */
import { Fire } from '../fx/lib/impact.js';
import { attitudeM } from './debris/math.js';
import { MODULES } from '../data/modules.js';

/* warhead (kg): public figures, rounded */
export const WH = { oniks: 250, kalibr: 200, tlam: 450, slam: 360, uran: 145, hellfire: 9, kornet: 7, shell: 3.6, shell130: 3.6,
  shell57: .4, sm6: 64, pdms: 39, sam: 20, sam48: 180, ram: 11, aam: 18, mk48: 290, mk54: 44, t53: 300, ciws: .05, gun30: .1, rws: .05,
  mk84: 430 };
/* how the charge meets the plating: 'in' a delayed fuze inside the hull, 'out' contact, 'frag' blast-frag, 'gun' rounds */
const FUZE = { oniks: 'in', kalibr: 'in', uran: 'in', tlam: 'in', slam: 'in', mk84: 'in', hellfire: 'out', kornet: 'out',
  shell: 'out', shell130: 'out', shell57: 'out', sm6: 'frag', pdms: 'frag', sam: 'frag', sam48: 'frag', ram: 'frag', aam: 'frag',
  ciws: 'gun', gun30: 'gun', rws: 'gun' };
const KE = { ciws: 1, rws: 1 };           // kinetic rounds: a clean small hole, no charge
/* the plating (mm, steel equivalent) by zone: belt (waterline), side, deck, super (superstructure / island / sail) */
const PLATE = {
  warship: { belt: 12, side: 10, deck: 9, super: 6 },
  alu: { belt: 8, side: 7, deck: 7, super: 5 },
  amphib: { belt: 14, side: 12, deck: 20, super: 8 },
  carrier: { belt: 25, side: 22, deck: 45, super: 10 },
  craft: { belt: 5, side: 5, deck: 5, super: 4 },
  sub: { belt: 35, side: 35, deck: 35, super: 12 },
};
const LAND = { acv: 14, kornet: 6 };      // else 4 (trucks, TELs, containers, cabs); a site 8
const KIND = { hole: 0, dent: 1, pock: 2, rupture: 3 };
const MAXS = 8, MAXE = 700, GROUPS = 16, EJ_LIFE = 7, DECK_H = 2.7;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hsh(i, s) { let h = Math.imul((i | 0) ^ Math.imul(s | 0, 0x9E3779B1), 0x85EBCA77); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

/* the plating class of a unit */
function classOf(u) {
  const d = u.def;
  if (d.domain === 'sea') {
    if (d.sub) return 'sub';
    if (d.size[0] < 45 || d.hover) return 'craft';
    if (u.type === 'lcs') return 'alu';
    if (d.size[0] > 300) return 'carrier';
    if (d.size[0] > 200) return 'amphib';
    return 'warship';
  }
  return 'land';
}
/* where it struck: 'belt' (at the waterline), 'deck', 'super', 'side' (model frame point y, normal y, the main deck's height) */
function zoneOf(sea, y, ny, deckY) {
  if (!sea) return ny > .7 ? 'deck' : 'side';
  if (y < 1.8 && ny < .7) return 'belt';
  if (ny > .7 && y < deckY + 1.4) return 'deck';
  if (y > deckY + .8) return 'super';
  return 'side';
}
function plateOf(u, zone) {
  const c = classOf(u);
  if (c === 'land') return u.def.static ? 8 : LAND[u.type] || 4;
  return PLATE[c][zone] || PLATE[c].side;
}
/* the steel's answer: { kind, r (m), reach (x r), pet (petal depth x r | dent depth x r | pock hole radius m), sg (+1 blown
   out, -1 pushed in), n (pockmarks), Weff, x } */
export function outcome(kg, t, fz, standoff, nRounds) {
  if (fz === 'gun') {
    const ce = Math.cbrt(kg), x = ce * 10 / t, n = Math.max(1, Math.min(16, Math.round(nRounds || 4)));
    const rp = KE_RP(kg, x);
    return { kind: 'pock', r: Math.min(4, 1 + .35 * Math.sqrt(n)), reach: 1.3, pet: rp, sg: -1, n: x < .25 ? -n : n, Weff: kg, x };
  }
  let W = fz === 'frag' ? kg * .5 : kg;
  if (standoff > 0) W *= sat(1 - standoff / Math.max(.3, Math.cbrt(kg))) ** 2;
  const ce = Math.cbrt(Math.max(W, 1e-4)), x = ce * 10 / t, sg = fz === 'in' ? 1 : -1;
  if (x < .7 || W < .15) return { kind: 'dent', r: .7 * ce + .2, reach: 2.2, pet: .05 + .15 * Math.min(1, x / .7), sg, n: 0, Weff: W, x };
  const r = (fz === 'in' ? .95 : .45) * ce * Math.max(.26, Math.sqrt((x - .7) / (x + .3)));
  const rup = x >= 4.5 || (W >= 200 && x >= 1.5);
  return { kind: rup ? 'rupture' : 'hole', r, reach: rup ? Math.min(5, 3.6 + .15 * x) : Math.min(3.2, 2.4 + .1 * x), pet: rup ? .5 : .42, sg, n: 0, Weff: W, x };
}
function KE_RP(kg, x) { return x < .25 ? .12 + .25 * Math.cbrt(kg) : .06 + .3 * Math.cbrt(kg); }

export function createScars(game) {
  const sim = game.sim, R = game.R;
  const recs = new Map();                 // unit id -> { id, n, L (8 x [x y z r nx ny nz seed]), C (8 x [0 reach pet heat]), D (8 x [kind depth sg n]), list, M, now, dead }
  const groups = [];                      // ejecta: { t0, n, P, V, K, gy, sea, near }
  const W3 = [0, 0, 0];
  let lastEv = null, lastPos = [0, 0, 0], lastN = [0, 1, 0], lastW = 0;
  const stats = { scars: 0, fires: 0, ejecta: 0, inside: 0, snapMs: 0, drawMs: 0 };
  let TMP = new Float32Array(6 * 20000);

  const fxSys = () => game.getSystem('fx');
  const ground = (x, z) => (game.ground ? game.ground(x, z) : 0);
  const stOf = u => (u.def.modelState ? u.def.modelState(u, game.t) : u.st) || {};

  /* ------------------------------------------------------------ the model's dots near a point */
  /* Per model, once: its static parts' dots (model frame, rest state; the level of about L / 300 spacing, else the
     finest sampled so far) with their normals, bucketed in a grid of CELL-m cells, and its main deck's height (the
     most up-facing dots). Rebuilt once a finer level is there. A hit then looks only at the cells round it. */
  const CELL = 4, GRIDS = new Map();
  const ck = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  function gridOf(ent, st) {
    const want = Math.max(.15, ent.L / 300);
    let G = GRIDS.get(ent.key);
    if (G && (G.sp <= want * 1.01 || G.tries > 3)) return G;
    let sp = 0, n = 0;
    const use = [];
    for (const P of ent.parts) {
      if (P.dyn) continue;
      let shown = true; try { shown = !P.part.show || !!P.part.show(st); } catch (e) { shown = true; }
      if (!shown) continue;
      let cl = null;
      for (let k = P.clouds.length - 1; k >= 0; k--) { const c = P.clouds[k]; if (c && c.pts && c.n) { cl = c; if (c.sp <= want) break; } }
      if (!cl) continue;
      let X = null; try { X = P.part.xf ? P.part.xf(st) : null; } catch (e) { X = null; }
      use.push([cl, X]); n += cl.n; sp = Math.max(sp, cl.sp);
    }
    if (!n) return G || null;
    if (G && sp >= G.sp) { G.tries++; return G; }
    const D = new Float32Array(n * 6), cells = new Map(), hist = new Map(), env = new Map();
    let m = 0;
    for (const [cl, X] of use) {
      const f = cl.pts, by = new Int8Array(f.buffer, f.byteOffset, cl.n * 16);
      for (let i = 0; i < cl.n; i++, m++) {
        let x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2], nx = by[i * 16 + 12] / 127, ny = by[i * 16 + 13] / 127, nz = by[i * 16 + 14] / 127;
        if (X) {
          const RR = X.R, T = X.T;
          const x2 = RR[0] * x + RR[1] * y + RR[2] * z + T[0], y2 = RR[3] * x + RR[4] * y + RR[5] * z + T[1], z2 = RR[6] * x + RR[7] * y + RR[8] * z + T[2];
          const n0 = RR[0] * nx + RR[1] * ny + RR[2] * nz, n1 = RR[3] * nx + RR[4] * ny + RR[5] * nz, n2 = RR[6] * nx + RR[7] * ny + RR[8] * nz;
          x = x2; y = y2; z = z2; nx = n0; ny = n1; nz = n2;
        }
        D[m * 6] = x; D[m * 6 + 1] = y; D[m * 6 + 2] = z; D[m * 6 + 3] = nx; D[m * 6 + 4] = ny; D[m * 6 + 5] = nz;
        const key = ck(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));
        let a = cells.get(key); if (!a) { a = []; cells.set(key, a); } a.push(m);
        if (ny > .85) { const b = Math.round(y * 2); hist.set(b, (hist.get(b) || 0) + 1); }
        const ek = Math.floor(z / 2) * 4096 + Math.floor(y) + 2048, ax = Math.abs(x);
        if (!(env.get(ek) >= ax)) env.set(ek, ax);
      }
    }
    const idx = new Map();
    for (const [k, a] of cells) idx.set(k, Int32Array.from(a));
    let deckY = 0, best = 0;
    for (const [b, c] of hist) if (c > best) { best = c; deckY = b / 2; }
    G = { sp, D, idx, deckY, env, tries: G ? G.tries + 1 : 0 };
    GRIDS.set(ent.key, G);
    return G;
  }
  /* the dots within rad of (cx, cy, cz), model frame -> cb(x, y, z, nx, ny, nz) */
  function eachDot(ent, st, cb, cx, cy, cz, rad) {
    const G = gridOf(ent, st);
    if (!G) return;
    const D = G.D, r2 = rad * rad;
    const i0 = Math.floor((cx - rad) / CELL), i1 = Math.floor((cx + rad) / CELL), j0 = Math.floor((cy - rad) / CELL), j1 = Math.floor((cy + rad) / CELL);
    const k0 = Math.floor((cz - rad) / CELL), k1 = Math.floor((cz + rad) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const a = G.idx.get(ck(i, j, k));
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const o = a[q] * 6, x = D[o], y = D[o + 1], z = D[o + 2], dx = x - cx, dy = y - cy, dz = z - cz;
        if (dx * dx + dy * dy + dz * dz <= r2) cb(x, y, z, D[o + 3], D[o + 4], D[o + 5]);
      }
    }
  }

  /* the hit carried along the round's path onto the model's surface: the first dot along the path within rs of it,
     facing the round (else the nearest dot). h, din: model frame (din: the round's direction of travel) */
  function snap(ent, st, h, din, rs, out) {
    let bs = 1e9, fb = 1e9, found = false;
    const o = out;
    const along = (x, y, z, nx, ny, nz) => {
      const vx = x - h[0], vy = y - h[1], vz = z - h[2];
      const s = vx * din[0] + vy * din[1] + vz * din[2], d2 = vx * vx + vy * vy + vz * vz;
      const two = nx * nx + ny * ny + nz * nz < .01;
      if (s > -12 && s < 36 && d2 - s * s < rs * rs && (two || nx * din[0] + ny * din[1] + nz * din[2] < .25)) {
        if (s < bs) { bs = s; found = true; o[0] = x; o[1] = y; o[2] = z; o[3] = two ? -din[0] : nx; o[4] = two ? -din[1] : ny; o[5] = two ? -din[2] : nz; }
      }
    };
    for (let s0 = -12; s0 <= 36 && !found; s0 += 3) eachDot(ent, st, along, h[0] + din[0] * s0, h[1] + din[1] * s0, h[2] + din[2] * s0, rs + 1.6);
    if (found) return true;
    eachDot(ent, st, (x, y, z, nx, ny, nz) => {
      const d2 = (x - h[0]) ** 2 + (y - h[1]) ** 2 + (z - h[2]) ** 2, two = nx * nx + ny * ny + nz * nz < .01;
      if (d2 < fb) { fb = d2; o[0] = x; o[1] = y; o[2] = z; o[3] = two ? -din[0] : nx; o[4] = two ? -din[1] : ny; o[5] = two ? -din[2] : nz; }
    }, h[0], h[1], h[2], 10);
    if (fb < 1e9) return true;
    // further along the path (a hit point well off the hull)
    for (let s0 = 39; s0 <= 150 && !found; s0 += 3) eachDot(ent, st, along2, h[0] + din[0] * s0, h[1] + din[1] * s0, h[2] + din[2] * s0, rs + 1.6);
    return found;
    function along2(x, y, z, nx, ny, nz) {
      const vx = x - h[0], vy = y - h[1], vz = z - h[2];
      const s = vx * din[0] + vy * din[1] + vz * din[2], d2 = vx * vx + vy * vy + vz * vz;
      const two = nx * nx + ny * ny + nz * nz < .01;
      if (s > 0 && d2 - s * s < rs * rs && (two || nx * din[0] + ny * din[1] + nz * din[2] < .25) && s < bs) {
        bs = s; found = true; o[0] = x; o[1] = y; o[2] = z; o[3] = two ? -din[0] : nx; o[4] = two ? -din[1] : ny; o[5] = two ? -din[2] : nz;
      }
    }
  }

  /* ------------------------------------------------------------ a hit */
  function onHit(e) {
    const u = sim.units.get(e.target);
    if (!u || !e.pos || u.aboard) return;
    const def = u.def;
    if (def.domain === 'air' || (def.sub && (u.depth || 0) > def.draught + 1)) return;
    if (!R.models.has(def.model)) return;
    const kind = e.kind;
    const Wk = WH[kind] !== undefined ? WH[kind] : ((game.PROJ[kind] && game.PROJ[kind].dmg) || 10) * 2.5;
    const fz = FUZE[kind] || (Wk < .3 && e.n !== undefined ? 'gun' : 'out');
    const t0 = performance.now();
    const ent = R.models.get(def.model), st = stOf(u);
    const pose = game.unitPose(u), M = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const dx = e.pos[0] - pose.pos[0], dy = e.pos[1] - pose.pos[1], dz = e.pos[2] - pose.pos[2];
    const h = [M[0] * dx + M[3] * dy + M[6] * dz, M[1] * dx + M[4] * dy + M[7] * dz, M[2] * dx + M[5] * dy + M[8] * dz];
    let din;
    const v = e.vel;
    if (e.under) {
      const sx = h[0] >= 0 ? 1 : -1;
      h[0] = sx * (def.size[1] * .5 + 12); h[1] = Math.min(1.2, def.size[2] * .03); din = [-sx, 0, 0];
    } else if (v && Math.hypot(v[0], v[1], v[2]) > 1) {
      const l = Math.hypot(v[0], v[1], v[2]);
      din = [(M[0] * v[0] + M[3] * v[1] + M[6] * v[2]) / l, (M[1] * v[0] + M[4] * v[1] + M[7] * v[2]) / l, (M[2] * v[0] + M[5] * v[1] + M[8] * v[2]) / l];
    } else {
      const l = Math.hypot(h[0], h[2] * .3) || 1;
      din = [-h[0] / l, 0, -h[2] * .3 / l];
    }
    const G = gridOf(ent, st), deckY = G ? G.deckY : def.size[2] * .3, sea = def.domain === 'sea';
    const guess = Math.cbrt(Wk) * .6;
    const o = new Array(6), ts = performance.now();
    if (!snap(ent, st, h, din, e.under ? .8 : Math.max(1.2, guess * .55), o)) return;          // nothing of the model there: no mark
    const nl = Math.hypot(o[3], o[4], o[5]) || 1;
    const nx = o[3] / nl, ny = o[4] / nl, nz = o[5] / nl;
    // the plating there and what the charge does to it
    // (a deck hit above the main deck's mean height: the hull's own deck where it rises with the sheer (the forecastle) is
    // still the deck, not a deckhouse roof: the weather deck at this station, found from the side)
    let deckZ = deckY;
    if (sea && ny > .7 && o[1] >= deckY + 1.4) { const hb = halfBFn(u, G)(o[2], 2), sx = o[0] >= 0 ? 1 : -1; deckZ = deckAbove(ent, st, sx * hb, 2, o[2], sx, 0, deckY); if (!(deckZ > deckY)) deckZ = deckY; }
    const zone = e.under ? 'belt' : zoneOf(sea, o[1], ny, deckZ), t = plateOf(u, zone);
    const standoff = fz === 'frag' ? Math.max(0, e.miss || 0, e.blast || 0) : Math.max(0, e.blast || 0);
    const Oc = outcome(Wk * (e.under ? 1.6 : 1), t, e.under ? 'in' : fz, standoff, e.n);
    const cap = .35 * Math.max(def.size[1], def.size[2]);
    const S = { x: o[0], y: o[1], z: o[2], nx, ny, nz, kind: Oc.kind, r: Math.min(Oc.r, cap), r0: Oc.r, reach: Oc.reach, pet: Oc.pet, sg: Oc.sg,
      np: Oc.n, W: Oc.Weff, px: Oc.x, fz: e.under ? 'in' : fz, t: t, zone, t0: sim.t, seed: (u.id * 131 + Math.floor(sim.t * 20) + (S_N++)) % 997,
      sea, wl: sea && (o[1] < 1.8 || !!e.under) && !def.hover, fire: null, merged: 0, deckY, D: 0, inn: null, nIn: 0, seats: null };
    lastEv = e;
    lastPos[0] = pose.pos[0] + M[0] * S.x + M[1] * S.y + M[2] * S.z;
    lastPos[1] = pose.pos[1] + M[3] * S.x + M[4] * S.y + M[5] * S.z;
    lastPos[2] = pose.pos[2] + M[6] * S.x + M[7] * S.y + M[8] * S.z;
    lastN[0] = M[0] * S.nx + M[1] * S.ny + M[2] * S.nz; lastN[1] = M[3] * S.nx + M[4] * S.ny + M[5] * S.nz; lastN[2] = M[6] * S.nx + M[7] * S.ny + M[8] * S.nz;
    lastW = fz === 'gun' ? Wk : Oc.Weff;
    stats.surfMs = performance.now() - ts;
    // a blast charge on a ship: solved on the GPU (game/src/blast); this mark keeps the bookkeeping and the fire
    const bl = !!(game.blast && game.blast.accepts(u, e.under ? 'under' : fz, e));
    if (bl) S.bl = true;
    const P = addScar(u, S, ent, st);
    if (bl && P === S) {
      let B = null;
      // the deck over a hit in the side at that station (the forecastle stands higher than the main deck amidships)
      const dk = ny > .7 ? S.y : deckAbove(ent, st, S.x, S.y, S.z, nx, nz, deckY);
      const band = skinBand(ent, st, S.x, S.y, S.z, nx, ny, nz, Math.max(3, Math.min(10, 2.5 * Math.cbrt(Math.max(1, Wk * .5)))));
      try { B = game.blast.hit(u, { a: [S.x, S.y, S.z], n: [nx, ny, nz], din, zone, tmm: t, fz, standoff, kind, whKg: Wk, deckY: dk, band, halfB: halfBFn(u, G), S }); }
      catch (err) { console.error('scars: blast', err); }
      if (!B) { S.bl = false; S.blast = null; build(u, S, ent, st); if (holeLike(S.kind)) ejecta(u, ent, st, S, M, pose); }
    }
    // a blast-frag warhead also peppers the plating round its burst
    if (fz === 'frag' && P) {
      const F = { x: S.x - S.nx * .2, y: S.y, z: S.z, nx: S.nx, ny: S.ny, nz: S.nz, kind: 'pock', r: Math.min(6, 1.5 + .8 * Math.cbrt(Wk)), r0: 0, reach: 1.25,
        pet: .1 + .02 * Math.cbrt(Wk), sg: -1, np: 14, W: .1, px: 1, fz: 'gun', t, zone, t0: sim.t, seed: (S.seed * 7 + 5) % 997, sea, wl: false, fire: null, merged: 0,
        deckY, D: 0, inn: null, nIn: 0, seats: null, frag: true, t0h: sim.t - .001 };
      addScar(u, F, ent, st);
    }
    if (P && (P.kind === 'hole' || P.kind === 'rupture') && !P.merged && !P.bl) {
      const te = performance.now();
      ejecta(u, ent, st, P, M, pose);
      stats.ejMs = performance.now() - te;
    }
    stats.snapMs = performance.now() - t0;
  }
  let S_N = 0;

  function recOf(u) {
    let rec = recs.get(u.id);
    if (!rec) { rec = { id: u.id, n: 0, L: new Float32Array(MAXS * 8), C: new Float32Array(MAXS * 4), D: new Float32Array(MAXS * 4), list: [], M: [1, 0, 0, 0, 1, 0, 0, 0, 1], now: 0, dead: false, heavy: 0 }; recs.set(u.id, rec); }
    return rec;
  }
  const holeLike = k => k === 'hole' || k === 'rupture';
  function addScar(u, S, ent, st) {
    const rec = recOf(u), L = rec.list;
    if (holeLike(S.kind)) rec.heavy = Math.max(rec.heavy, S.r0 / Math.max(.5, .35 * Math.max(u.def.size[1], u.def.size[2])));
    for (const P of L) {
      const d = Math.hypot(P.x - S.x, P.y - S.y, P.z - S.z);
      if (S.kind === 'pock') {
        // rounds into an old hole: nothing more to see; onto old pockmarks: more of them
        if (holeLike(P.kind) && d < P.r * 1.2) return null;
        if (P.kind === 'pock' && d < P.r + S.r * .7) {
          const n = Math.min(16, Math.abs(P.np) + Math.abs(S.np));
          P.np = P.np < 0 && S.np < 0 ? -n : n; P.r = Math.min(5, Math.max(P.r, d + S.r * .6)); P.t0h = S.t0; P.merged++;
          return P;
        }
        continue;
      }
      if (P.kind === 'pock') continue;
      if (S.bl || P.blast) continue;                                   // a solved patch stands on its own
      if (d < (P.r + S.r) * .6 || (L.length >= MAXS && d < (P.r + S.r) * 2.5)) {
        // on an old mark: the charges add (a dent may open, a hole grows), its fire flares
        const w = S.r ** 3 / (P.r ** 3 + S.r ** 3);
        P.x += (S.x - P.x) * w; P.y += (S.y - P.y) * w; P.z += (S.z - P.z) * w;
        P.W += S.W;
        const Oc = outcome(P.W * (P.fz === 'frag' ? 2 : 1), P.t, P.fz === 'frag' ? 'frag' : S.fz === 'in' ? 'in' : P.fz, 0, 0);
        const was = P.kind;
        if (holeLike(Oc.kind) || holeLike(was)) {
          P.kind = Oc.kind === 'rupture' || was === 'rupture' ? 'rupture' : 'hole';
          P.r = Math.max(Oc.r, holeLike(was) ? Math.cbrt(P.r ** 3 + S.r ** 3) : 0);
          P.pet = P.kind === 'rupture' ? .5 : .42; P.reach = Math.max(P.reach, Oc.reach);
        } else { P.r = Math.max(P.r, Oc.r); P.pet = Math.max(P.pet, Oc.pet); }
        P.r = Math.min(P.r, .35 * Math.max(u.def.size[1], u.def.size[2]));
        if (S.fz === 'in') P.sg = 1;
        P.merged++; P.t0h = S.t0;
        build(u, P, ent, st);
        if (P.fire) P.kick = Math.min(1, (P.kick || 0) + .5);
        else startFire(u, P);
        return P;
      }
    }
    if (L.length >= MAXS) {
      // full: the smallest old one makes room
      let mi = 0; for (let i = 1; i < L.length; i++) if (L[i].r < L[mi].r) mi = i;
      const Q = L[mi]; if (Q.fire) Q.fire.stop(sim.t); L.splice(mi, 1);
      if (Q.blast && game.blast) game.blast.drop(Q.blast.id);
    }
    L.push(S);
    build(u, S, ent, st);
    startFire(u, S);
    return S;
  }

  /* the hull's half-beam at station z, height y (model frame), from its own dots (the envelope gridOf keeps) */
  /* how far the hull strays from a flat patch at a hit (m): the model's own dots facing the patch's way within R of it,
     off its plane (side: vertical, normal horizontal; deck: horizontal), the 90th percentile; a flared or curved hull
     needs a wider skin band for its dots to follow the solved plating */
  function skinBand(ent, st, x, y, z, nx, ny, nz, R) {
    const deck = ny > .7, l = Math.hypot(nx, nz) || 1, Z = deck ? [0, 1, 0] : [nx / l, 0, nz / l], off = [];
    eachDot(ent, st, (px, py, pz, qx, qy, qz) => {
      if (qx * Z[0] + qy * Z[1] + qz * Z[2] < .5) return;
      const dx = px - x, dy = py - y, dz = pz - z, al = dx * Z[0] + dy * Z[1] + dz * Z[2];
      if (Math.abs(al) < 4) off.push(Math.abs(al));
    }, x, y, z, R);
    if (off.length < 20) return 0;
    off.sort((p, q) => p - q);
    return off[Math.floor(off.length * .9)];
  }
  /* the lowest deck (dots facing up) over a point of the side, a little inboard, within 12 m; else the main deck */
  function deckAbove(ent, st, x, y, z, nx, nz, main) {
    const l = Math.hypot(nx, nz) || 1, ix = x - nx / l * 1.2, iz = z - nz / l * 1.2;
    let best = 1e9;
    eachDot(ent, st, (px, py, pz, qx, qy) => { if (qy > .85 && py > y + .3 && py < best) best = py; }, ix, y + 6, iz, 6.5);
    return best < 1e8 ? best : main;
  }
  /* the deck over a module's box: the up-facing plating over its footprint, from 1 m under its top to 3 m over it */
  function deckOver(ent, st, b) {
    const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2, hx = (b[3] - b[0]) / 2 + .3, hz = (b[5] - b[2]) / 2 + .3, ys = [];
    eachDot(ent, st, (x, y, z, nx, ny) => { if (ny > .85 && Math.abs(x - cx) < hx && Math.abs(z - cz) < hz && y > b[4] - 1 && y < b[4] + 3) ys.push(y); }, cx, b[4] + 1, cz, Math.hypot(hx, hz, 2.5));
    if (ys.length < 6) return null;
    ys.sort((p, q) => p - q);
    return ys[Math.floor(ys.length * .5)];
  }
  function halfBFn(u, G) {
    const env = G && G.env, B = u.def.size[1] / 2;
    return (z, y) => {
      if (!env) return B;
      let m = -1;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) { const v = env.get((Math.floor(z / 2) + dz) * 4096 + Math.floor(y) + dy + 2048); if (v > m) m = v; }
      return m > .5 ? m : B;
    };
  }

  /* ------------------------------------------------------------ what is behind a hole */
  /* the pocket's depth, its interior dots and the fire's seats (model frame) */
  function build(u, S, ent, st) {
    S.inn = null; S.nIn = 0; S.seats = null;
    if (!holeLike(S.kind) || S.r < .3) { S.D = 0; return; }
    if (S.bl) {
      // solved by the blast system: its fire's first seats from the estimate (re-seated on the torn rim when it settles)
      S.D = Math.min(1.4 * S.r + 1, u.def.size[1] * .42); S.yFloor = S.y - S.r; seatsOf(u, S, ent, st);
      return;
    }
    const def = u.def, B = def.size[1], sea = S.sea, deck = S.ny > .7;
    S.D = sea ? (deck ? Math.min(1.3 * S.r + DECK_H, Math.max(2.5, S.y + (def.draught || 5) * .4)) : Math.min(1.4 * S.r + 1, B * (S.zone === 'super' ? .38 : .42)))
      : Math.min(1.2 * S.r + .3, B * .8);
    interior(u, S);
    seatsOf(u, S, ent, st);
  }

  /* The interior (model frame): x y z, kind (0 deck / floor, 1 cut edge, 2 frame / stiffener, 3 bulkhead, 4 back wall,
     5 rubble), glow weight (how much of the fire's light it takes: deep and low most). Local frame: -n into the hull
     (a: depth), t1 along the surface (horizontal), t2 up the surface. Shuffled, so a stride of it is an even sample */
  function interior(u, S) {
    const r = S.r, D = S.D, deck = S.ny > .7, land = !S.sea;
    const sp = Math.max(.12, Math.min(.42, r / 12)), rs = S.seed;
    const n = [S.nx, S.ny, S.nz];
    let t1, t2;
    if (deck) { t1 = [1, 0, 0]; t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]]; }
    else { const l = Math.hypot(n[2], n[0]) || 1; t1 = [n[2] / l, 0, -n[0] / l]; t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]]; }
    if (t2[1] < 0) { t2 = [-t2[0], -t2[1], -t2[2]]; }
    const out = [];
    const Rp = (a, ang) => r * (1.05 - .22 * a / D) * (1 + .12 * Math.sin(3 * ang + rs) + .07 * Math.sin(5 * ang + rs * 1.7));
    const inPocket = (a, s, v) => { const ang = Math.atan2(v, s); return s * s + v * v < Rp(a, ang) ** 2; };
    const P = (a, s, v) => [S.x - n[0] * a + t1[0] * s + t2[0] * v, S.y - n[1] * a + t1[1] * s + t2[1] * v, S.z - n[2] * a + t1[2] * s + t2[2] * v];
    const glowW = (a, yFloor, y) => sat(.25 + .55 * a / D + .45 * (1 - sat((y - yFloor) / 3)));
    const push = (p, k, g) => { out.push(p[0], p[1], p[2], k, g); };
    const cap = 5200;
    let yFloor;
    if (!deck) {
      // a side / superstructure / vehicle: deck levels (horizontal planes) cut at the hole, the shell's frames torn at
      // it, a bulkhead, the back wall, rubble on the floor
      const lev = [];
      const base = land ? Math.max(.6, S.deckY * .4) : S.deckY;
      const step = land ? 99 : DECK_H;
      for (let k = -8; k <= 8; k++) { const y = base + k * step; if (y > S.y - r * 1.15 && y < S.y + r * 1.15 && (!S.sea || y > -1)) lev.push(y); }
      if (!lev.length) lev.push(S.y - r * .8);
      yFloor = lev.filter(y => y <= S.y).pop(); if (yFloor === undefined) yFloor = S.y - r;
      for (const y of lev) {
        const v = y - S.y;
        for (let a = sp * .5; a < D; a += sp) for (let s = -r * 1.1; s <= r * 1.1; s += sp) {
          const j1 = (hsh(out.length, rs) - .5) * sp * .7, j2 = (hsh(out.length, rs + 1) - .5) * sp * .7;
          const aa = a + j1, s2 = s + j2;
          if (!inPocket(aa, s2, v)) continue;
          const p = P(aa, s2, v);
          const e = aa < .7 + .4 * hsh(out.length, rs + 2);
          // the cut edge bent the blast's way, ragged; a charge inside lifted the deck over it
          if (e) p[1] += (S.sg > 0 && y > S.y ? .6 : -.5) * (.7 - Math.min(.7, aa)) * (.5 + hsh(out.length, rs + 3));
          push(p, e ? 1 : 0, glowW(aa, yFloor, y));
          if (out.length > cap * 5) break;
        }
      }
      // frames (transverse webs, every 1.8 m of the length) and stiffeners (every 0.75 m of the height), torn in the middle
      const fs = land ? 1.1 : 1.8;
      const z0 = Math.ceil((S.z - r * 1.1) / fs) * fs;
      for (let z = z0; z < S.z + r * 1.1; z += fs) {
        const s = (z - S.z) / (Math.abs(t1[2]) > .3 ? t1[2] : 1);
        if (Math.abs(t1[2]) < .3) break;
        for (let v = -r * 1.1; v <= r * 1.1; v += sp * .6) {
          const rho = Math.hypot(s, v) / r;
          if (rho > 1.05) continue;
          const torn = rho < .45 + .2 * hsh(Math.round(v * 10), rs + Math.round(z));
          if (torn) continue;
          const bend = (1.05 - rho) * (1.05 - rho) * r * .5 * (S.sg > 0 ? -1 : 1);
          for (let a = .05; a < .5; a += sp * .7) push(P(a + bend * .6, s + bend * .15, v), 2, glowW(a, yFloor, S.y + v));
          if (out.length > cap * 5) break;
        }
      }
      for (let v = -Math.floor(r / .75) * .75; v <= r; v += .75) {
        for (let s = -r * 1.1; s <= r * 1.1; s += sp * .6) {
          const rho = Math.hypot(s, v) / r;
          if (rho > 1.05 || rho < .55 + .15 * hsh(Math.round(s * 10), rs + 7)) continue;
          push(P(.12 + (1.05 - rho) * r * .2 * (S.sg > 0 ? -1 : 1), s, v), 2, glowW(.12, yFloor, S.y + v));
        }
      }
      // a bulkhead across the pocket (every 12 m of the length)
      if (!land && Math.abs(t1[2]) > .3) {
        const zb = Math.round((S.z - 6) / 12) * 12 + 6;
        const s = (zb - S.z) / t1[2];
        if (Math.abs(s) < r * .9) for (let a = .6; a < D; a += sp) for (let v = -r; v <= r; v += sp) {
          if (!inPocket(a, s, v) || hsh(out.length, rs + 6) < .45) continue;
          push(P(a, s + (hsh(out.length, rs + 5) - .5) * .1, v), 3, glowW(a, yFloor, S.y + v) * .7);
        }
      }
    } else {
      // a deck: the levels below (the first holed under a big charge), the deck's beams torn and bent, a girder
      yFloor = S.y - D;
      for (let k = 1; k * DECK_H < D + .2; k++) {
        const a0 = k * DECK_H, holed = k === 1 && S.W > 60 ? r * .5 : 0;
        for (let s = -r * 1.1; s <= r * 1.1; s += sp) for (let v = -r * 1.1; v <= r * 1.1; v += sp) {
          const s2 = s + (hsh(out.length, rs) - .5) * sp * .7, v2 = v + (hsh(out.length, rs + 1) - .5) * sp * .7;
          if (!inPocket(a0, s2, v2)) continue;
          const rho = Math.hypot(s2, v2);
          if (rho < holed * (1 + .2 * Math.sin(5 * Math.atan2(v2, s2) + rs))) continue;
          const e = holed > 0 && rho < holed + .6;
          const p = P(a0 + (e ? .5 * (holed + .6 - rho) : 0), s2, v2);
          push(p, e ? 1 : 0, glowW(a0, yFloor, p[1]));
          if (out.length > cap * 5) break;
        }
        if (k === Math.floor((D + .2) / DECK_H)) yFloor = S.y - a0;
      }
      const fs = 1.8, z0 = Math.ceil((S.z - r * 1.1) / fs) * fs;
      for (let z = z0; z < S.z + r * 1.1; z += fs) {
        const v = (z - S.z) * (t2[2] >= 0 ? 1 : -1);
        for (let s = -r * 1.1; s <= r * 1.1; s += sp * .6) {
          const rho = Math.hypot(s, v) / r;
          if (rho > 1.05 || rho < .5 + .2 * hsh(Math.round(s * 10), rs + 3)) continue;
          const bend = (1.05 - rho) ** 2 * r * .45 * (S.sg > 0 ? -1 : 1);
          for (let a = .05; a < .45; a += sp * .7) push(P(a + bend, s, v), 2, glowW(a, yFloor, S.y - a));
        }
      }
      // the back wall of the pocket (the level it opens onto), rubble on it
    }
    // the back wall: the far end of the pocket (a longitudinal bulkhead, the next deck down)
    for (let s = -r; s <= r; s += sp) for (let v = -r; v <= r; v += sp) {
      const s2 = s + (hsh(out.length, rs + 8) - .5) * sp * .7, v2 = v + (hsh(out.length, rs + 9) - .5) * sp * .7;
      if (!inPocket(D, s2, v2)) continue;
      const p = P(D, s2, v2);
      if (!deck && S.sea && p[1] < -1) continue;
      push(p, 4, glowW(D, yFloor, p[1]));
    }
    // rubble on the floor
    const nR = Math.round(Math.min(600, 60 + r * r * 14));
    for (let i = 0; i < nR; i++) {
      const a = D * (.15 + .8 * hsh(i, rs + 11)), s = (hsh(i, rs + 12) - .5) * 1.6 * r;
      const p = P(a, s, deck ? (hsh(i, rs + 14) - .5) * 1.6 * r : 0);
      p[1] = yFloor + .05 + Math.pow(hsh(i, rs + 13), 3) * .9;
      if (!deck && Math.hypot(s, yFloor - S.y) > Rp(a, 0) * 1.1) continue;
      push(p, 5, glowW(a, yFloor, p[1]) + .15);
    }
    // only what lies inside the hull (its half-beam at that height and station, from the model's own dots): a pocket
    // near the bow or a keel never pokes out through the plating
    const G = GRIDS.get(u.def.model), env = G && G.env;
    if (env) {
      const halfB = (z, y) => {
        let m = -1;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) { const v = env.get((Math.floor(z / 2) + dz) * 4096 + Math.floor(y) + dy + 2048); if (v > m) m = v; }
        return m;
      };
      let w = 0;
      for (let i = 0; i < out.length; i += 5) {
        const hb = halfB(out[i + 2], out[i + 1]);
        if (hb < 0 || Math.abs(out[i]) > hb - .15) continue;
        if (w !== i) for (let k = 0; k < 5; k++) out[w + k] = out[i + k];
        w += 5;
      }
      out.length = w;
    }
    // shuffled (a stride is an even sample of it), capped
    let N = out.length / 5;
    const F = new Float32Array(Math.min(N, cap) * 5);
    const idx = new Uint32Array(N); for (let i = 0; i < N; i++) idx[i] = i;
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(hsh(i, rs + 17) * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    N = Math.min(N, cap);
    for (let i = 0; i < N; i++) { const q = idx[i] * 5; for (let k = 0; k < 5; k++) F[i * 5 + k] = out[q + k]; }
    S.inn = F; S.nIn = N; S.yFloor = yFloor; S.sp = sp;
  }

  /* the fire's seats (model frame: x y z, spread (m), tangent x y z): on the plating's own dots at the torn rim (the
     upper part of a hole in a side, all round one in a deck) and inside on the floor of the pocket */
  function seatsOf(u, S, ent, st) {
    const r = S.r, deck = S.ny > .7, cand = [];
    eachDot(ent, st, (x, y, z) => {
      const dx = x - S.x, dy = y - S.y, dz = z - S.z, al = dx * S.nx + dy * S.ny + dz * S.nz;
      const lx = dx - S.nx * al, ly = dy - S.ny * al, lz = dz - S.nz * al, ll = Math.hypot(lx, ly, lz);
      if (ll < r * 1.02 || ll > r * 1.45 || Math.abs(al) > r * .6) return;
      if (!deck && ly < -r * .35) return;
      cand.push(x, y, z, deck ? Math.atan2(lz, lx) : Math.atan2(ly, lx * S.nz - lz * S.nx));
    }, S.x, S.y, S.z, r * 1.6);
    const nRim = deck ? 4 : 4, seats = [];
    const tx = deck ? 1 : S.nz, tz = deck ? 0 : -S.nx, tl = Math.hypot(tx, tz) || 1;
    for (let k = 0; k < nRim && cand.length; k++) {
      // one per sector of the rim (sides: its upper part), the dot nearest the sector's middle
      const a0 = deck ? -Math.PI + (k + .2 + .6 * hsh(k, S.seed + 19)) / nRim * 2 * Math.PI : -.35 + (k + .5) / nRim * (Math.PI + .7);
      let bi = -1, bd = 1e9;
      for (let i = 0; i < cand.length; i += 4) { let da = Math.abs(cand[i + 3] - a0); if (da > Math.PI) da = 2 * Math.PI - da; if (da < bd) { bd = da; bi = i; } }
      if (bi >= 0 && bd < 1) seats.push(cand[bi], cand[bi + 1], cand[bi + 2], Math.max(.3, r * .32), tx / tl, 0, tz / tl);
    }
    // inside: on the floor of the pocket, where the fire burns (seen through the hole)
    const nIn = r > 1.2 ? (deck ? 4 : 3) : 1;
    for (let k = 0; k < nIn; k++) {
      const a = S.D * (.3 + .4 * hsh(k, S.seed + 21)), s = (hsh(k, S.seed + 22) - .5) * r, s2 = (hsh(k, S.seed + 23) - .5) * r;
      const x = S.x - S.nx * a + (deck ? s : tx / tl * s), z = S.z - S.nz * a + (deck ? s2 : tz / tl * s);
      seats.push(x, deck ? S.y - Math.min(S.D, DECK_H) + .1 : S.yFloor + .1, z, Math.max(.3, r * .3), tx / tl, 0, tz / tl);
    }
    if (!seats.length) seats.push(S.x + S.nx * .2, S.y, S.z + S.nz * .2, Math.max(.3, r * .4), tx / tl, 0, tz / tl);
    S.seats = Float32Array.from(seats);
  }

  /* a fire seated on the hole's burning surfaces (none for a dent, pockmarks, a small hit that only scorches) */
  function startFire(u, S) {
    const f = fxSys();
    if (!f || !f.add || !S.seats || S.fire) return;
    if (S.W < 2 && !S.wl) return;
    const sea = S.sea, sz = Math.max(.12, Math.min(1.1, .18 + Math.sqrt(S.W) / 18)), r = S.r;
    const F = new Fire({ t0: sim.t, seed: S.seed * 7 + 3, size: sz, local: [0, 0, 0],
      spread: [r * .6 + .3, Math.min(10, 1.2 + r * 1.15), r * .3 + .2], ceiling: (sea ? 900 : 240) * sz + 60,
      life: sea ? (sz > .5 ? 220 : 130) : 90, flame: S.wl ? .35 : 1, embers: S.wl ? .3 : 1.4, lightR: 4 + r * 2.2, lightI: .9, lightRgb: [255, 196, 138], dense: S.wl ? 13 : 12 });
    F.k = 0; F.sea = sea;
    F.seat(S.seats.length / 7);
    f.add(F, 0);
    S.fire = F;
    stats.fires++;
  }

  /* how hard a scar burns now: grows over the first seconds, then the damage control gains (a smoulder left), faster
     for a small hit; flares on a new hit there; full while the ship is lost; out under the water */
  function kOf(u, S, rec, t) {
    const a = t - S.t0, big = sat(Math.sqrt(S.W) / 16);
    let k = (.35 + .65 * big) * (.45 + .55 * ss(0, 6 + 6 * big, a));
    const hold = 40 + 160 * big, tau = 60 + 240 * big;
    k *= a < hold ? 1 : .18 + .82 * Math.exp(-(a - hold) / tau);
    if (!S.sea && a > 30 + 60 * big) k *= Math.exp(-(a - 30 - 60 * big) / 40);
    if (S.kick) { k = Math.min(1, k + S.kick); S.kick = Math.max(0, S.kick - .002); }
    if (S.force && t < (S.forceUntil || 1e18)) k = Math.max(k, S.force);
    if (u.alive) k = Math.max(k, sat((.4 - u.hp / u.hpMax) * 1.6) * (.4 + .6 * big));
    else if (rec.dead) k = u.def.domain === 'sea' ? (u.dying < .85 ? Math.max(k, .7 + .3 * big) : k * (1 - ss(.85, .97, u.dying))) : 0;
    return k;
  }

  /* ------------------------------------------------------------ ejecta: the dots that left the hole */
  function ejecta(u, ent, st, S, M, pose, cpos) {
    const cp = cpos || lastPos;
    const cap = Math.round(Math.min(MAXE, 60 + 700 * (S.r / 3) ** 2));
    let m = 0;
    const r = S.r;
    eachDot(ent, st, (x, y, z, nx, ny, nz) => {
      if (m >= TMP.length / 6) return;
      TMP[m * 6] = x; TMP[m * 6 + 1] = y; TMP[m * 6 + 2] = z; TMP[m * 6 + 3] = nx; TMP[m * 6 + 4] = ny; TMP[m * 6 + 5] = nz; m++;
    }, S.x, S.y, S.z, r * 1.05);
    const n = Math.min(cap, Math.max(m, Math.round(cap * .5)));
    if (!n) return;
    const g = groups.length >= GROUPS ? groups.shift() : null;
    const G = g && g.P.length >= n * 3 ? g : { P: new Float32Array(Math.max(n, 64) * 3), V: new Float32Array(Math.max(n, 64) * 3), K: new Float32Array(Math.max(n, 64) * 2) };
    G.t0 = sim.t; G.n = n; G.seed = S.seed; G.unit = u.id;
    const sp = u.def.domain === 'sea' ? (u.speed || 0) : 0, vbx = Math.sin(pose.hdg) * sp, vbz = Math.cos(pose.hdg) * sp;
    const Nw = [M[0] * S.nx + M[1] * S.ny + M[2] * S.nz, M[3] * S.nx + M[4] * S.ny + M[5] * S.nz, M[6] * S.nx + M[7] * S.ny + M[8] * S.nz];
    const kick = Math.sqrt(S.W / 100);
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (m) { const j = m <= n ? i % m : Math.floor(i * m / n); x = TMP[j * 6]; y = TMP[j * 6 + 1]; z = TMP[j * 6 + 2]; }
      else { x = S.x + (hsh(i, S.seed) - .5) * r; y = S.y + (hsh(i, S.seed + 1) - .5) * r; z = S.z + (hsh(i, S.seed + 2) - .5) * r; }
      if (m && i >= m) { x += (hsh(i, S.seed + 3) - .5) * .3; y += (hsh(i, S.seed + 4) - .5) * .3; z += (hsh(i, S.seed + 5) - .5) * .3; }
      const wx = pose.pos[0] + M[0] * x + M[1] * y + M[2] * z, wy = pose.pos[1] + M[3] * x + M[4] * y + M[5] * z, wz = pose.pos[2] + M[6] * x + M[7] * y + M[8] * z;
      const ox = wx - cp[0], oy = wy - cp[1], oz = wz - cp[2], ol = Math.hypot(ox, oy, oz) || 1;
      const c = hsh(i, S.seed + 6);
      const spd = c < .25 ? .5 + 3 * hsh(i, S.seed + 7) : c < .8 ? (6 + 22 * hsh(i, S.seed + 7)) * Math.min(2.2, .6 + kick) : (30 + 70 * hsh(i, S.seed + 7)) * Math.min(2, .5 + kick);
      const sc = c < .25 ? .35 : 1;
      const vx = Nw[0] + ox / ol * .8 * sc + (hsh(i, S.seed + 8) - .5) * .9, vy = Nw[1] + oy / ol * .8 * sc + (hsh(i, S.seed + 9) - .5) * .9 + (c < .25 ? -.6 : .35), vz = Nw[2] + oz / ol * .8 * sc + (hsh(i, S.seed + 10) - .5) * .9;
      const vl = Math.hypot(vx, vy, vz) || 1;
      G.P[i * 3] = wx; G.P[i * 3 + 1] = wy; G.P[i * 3 + 2] = wz;
      G.V[i * 3] = vbx + vx / vl * spd; G.V[i * 3 + 1] = vy / vl * spd; G.V[i * 3 + 2] = vbz + vz / vl * spd;
      G.K[i * 2] = c < .25 ? .3 + .5 * hsh(i, S.seed + 11) : .5 + 1.6 * hsh(i, S.seed + 11);
      G.K[i * 2 + 1] = hsh(i, S.seed + 12) < .35 ? 1 : 0;
    }
    G.sea = u.def.domain === 'sea';
    G.gy = G.sea ? 0 : ground(cp[0], cp[2]);
    G.cx = cp[0]; G.cy = cp[1]; G.cz = cp[2];
    groups.push(G);
  }

  function drawEjecta(frame) {
    const sink = frame.sink, t = frame.t;
    if (!sink || !sink.cam) return 0;
    const eye = sink.cam.eye;
    let drawn = 0;
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const G = groups[gi], a = t - G.t0;
      if (a > EJ_LIFE) { groups.splice(gi, 1); continue; }
      if (a < 0) continue;
      const dist = Math.hypot(G.cx - eye[0], G.cy - eye[1], G.cz - eye[2]);
      if (dist > 9000) continue;
      const sz = dist < 350 ? 2 : 1, fade = 1 - ss(EJ_LIFE - 2.5, EJ_LIFE, a), P = G.P, V = G.V, K = G.K;
      for (let i = 0; i < G.n; i++) {
        const k = K[i * 2], e = Math.exp(-k * a), f1 = (1 - e) / k, f2 = (a - f1) / k;
        const x = P[i * 3] + V[i * 3] * f1, z = P[i * 3 + 2] + V[i * 3 + 2] * f1;
        let y = P[i * 3 + 1] + V[i * 3 + 1] * f1 - 9.81 * f2;
        if (y < G.gy) {
          if (G.sea) continue;
          y = G.gy + .05;
        }
        const hot = K[i * 2 + 1] > 0 ? 1 - ss(.05, .7, a) : 0;
        if (hot > .02) sink.add(x, y, z, sz, 255, 214 + 30 * hot, 170 + 60 * hot, hot);
        const w = (.7 + .3 * hsh(i, G.seed)) * fade * (y <= G.gy + .06 ? .5 : 1);
        sink.dot(x, y, z, sz, 226 * w, 228 * w, 220 * w, 1);
        drawn++;
      }
    }
    return drawn;
  }

  /* the interiors of the holes near the lens: charred structure, the fire inside glowing on it */
  function drawInside(frame) {
    const sink = frame.sink;
    if (!sink || !sink.cam) return 0;
    const cam = sink.cam, eye = cam.eye, f = cam.f, fl = cam.fl || 1300, tr = frame.realT || game.realT || 0;
    let drawn = 0;
    for (const [id, rec] of recs) {
      if (!rec.n || !game.drawn.has(id) || !rec.vis) continue;
      const u = sim.units.get(id); if (!u) continue;
      const pose = game.unitPose(u), M = rec.M, p0 = pose.pos;
      for (const S of rec.list) {
        if (!S.nIn || game.t < S.t0 || S.blast) continue;
        const cx = p0[0] + M[0] * S.x + M[1] * S.y + M[2] * S.z, cy = p0[1] + M[3] * S.x + M[4] * S.y + M[5] * S.z, cz = p0[2] + M[6] * S.x + M[7] * S.y + M[8] * S.z;
        const zc = (cx - eye[0]) * f[0] + (cy - eye[1]) * f[1] + (cz - eye[2]) * f[2];
        if (zc < -S.r * 2) continue;
        const pxm = fl / Math.max(1, zc);
        if (S.r * pxm < 2.5) continue;
        // facing: the hole seen from its own side only
        const nwx = M[0] * S.nx + M[1] * S.ny + M[2] * S.nz, nwy = M[3] * S.nx + M[4] * S.ny + M[5] * S.nz, nwz = M[6] * S.nx + M[7] * S.ny + M[8] * S.nz;
        if ((eye[0] - cx) * nwx + (eye[1] - cy) * nwy + (eye[2] - cz) * nwz < -S.r) continue;
        const px = S.sp * pxm, stride = px >= 2 ? 1 : Math.min(40, Math.ceil((2 / px) ** 2));
        const size = px > 9 ? 3 : px > 4 ? 2 : 1;
        const fk = S.fire ? S.fire.k : 0, heat = rec.C[rec.list.indexOf(S) * 4 + 3] || 0, I = S.inn;
        const grow = sat((game.t - S.t0) / .15);
        for (let i = 0; i < S.nIn; i += stride) {
          const o = i * 5, x = I[o], y = I[o + 1], z = I[o + 2], k = I[o + 3], gw = I[o + 4];
          const wx = p0[0] + M[0] * x + M[1] * y + M[2] * z, wy = p0[1] + M[3] * x + M[4] * y + M[5] * z, wz = p0[2] + M[6] * x + M[7] * y + M[8] * z;
          if (S.sea && wy < .05) continue;                                 // flooded: under the sea
          const hs = hsh(i, S.seed + 31);
          // charred steel: dark, the cut edges and frames catching more light; the fire's glow on it, flickering
          let c = k === 4 ? .075 + .05 * hs : k === 1 ? .2 + .14 * hs : k === 2 ? .15 + .1 * hs : k === 5 ? .09 + .09 * hs : .11 + .07 * hs;
          c *= grow;
          const fl2 = .72 + .28 * Math.sin(tr * (5.3 + 3 * hs) + i * .7);
          const g2 = gw * gw, g = Math.max(fk * (.08 + .72 * g2) * fl2, heat * .6 * g2) * (k === 1 ? 1.15 : 1);
          const rr = 255 * Math.min(1, c * .95 + .6 * g), gg = 255 * Math.min(1, c * .9 + .36 * g), bb = 255 * Math.min(1, c * .84 + .13 * g);
          sink.dot(wx, wy, wz, size, rr, gg, bb, 1);
          drawn++;
        }
      }
    }
    return drawn;
  }

  /* ------------------------------------------------------------ per frame */
  let prepN = 0;
  function prep() {
    if (++prepN % 45) return;
    for (const u of sim.units.values()) {
      const m = u.def.model;
      if (!u.alive || u.def.domain === 'air' || !m || !R.models.has(m)) continue;
      const G = GRIDS.get(m), ent = R.models.entries.get(m);
      if (!ent || (G && (G.sp <= Math.max(.15, ent.L / 300) * 1.01 || G.tries > 3))) continue;
      if (!game.drawn.has(u.id)) continue;
      gridOf(ent, stOf(u));
      return;
    }
  }

  const KC = { hole: 0, dent: 1, pock: 2, rupture: 3 };
  function update() {
    const t = sim.t;
    let ns = 0;
    try { prep(); } catch (e) { /* the next frame */ }
    for (const [id, rec] of recs) {
      const u = sim.units.get(id);
      if (!u) { for (const S of rec.list) if (S.fire) S.fire.stop(t); recs.delete(id); continue; }
      const pose = game.unitPose(u), M = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, rec.M), p0 = pose.pos;
      const vis = !sim.fog || u.side === game.side || !!(game.vis && (game.vis(u) === 'own' || game.vis(u) === 'track'));
      rec.vis = vis;
      const L = rec.L, C = rec.C, Dd = rec.D, list = rec.list;
      rec.n = list.length; ns += rec.n;
      for (let i = 0; i < list.length; i++) {
        const S = list[i], a = game.t - S.t0, ah = game.t - (S.t0h || S.t0);
        // the hole opens in a few hundredths of a second; the rim glows, cooling over half a minute
        const grow = Math.min(1, .3 + Math.max(0, ah) / .12);
        L[i * 8] = S.x; L[i * 8 + 1] = S.y; L[i * 8 + 2] = S.z; L[i * 8 + 3] = a < 0 || S.blast ? 0 : S.r * (S.kind === 'pock' ? 1 : grow);
        L[i * 8 + 4] = S.nx; L[i * 8 + 5] = S.ny; L[i * 8 + 6] = S.nz; L[i * 8 + 7] = S.seed;
        C[i * 4] = 0; C[i * 4 + 1] = S.reach; C[i * 4 + 2] = S.pet;
        C[i * 4 + 3] = ah < 0 ? 0 : .04 + .96 * Math.exp(-ah / (S.kind === 'pock' ? 3 : 9)) * (S.W > 2 || S.kind === 'pock' ? 1 : .5);
        Dd[i * 4] = KC[S.kind]; Dd[i * 4 + 1] = S.D; Dd[i * 4 + 2] = S.sg; Dd[i * 4 + 3] = S.np;
        const F = S.fire;
        if (F) {
          // the seats carried with the full pose (roll, pitch, list, sinking); the smoke leaves from the highest one
          const Z = S.seats, n = Z.length / 7, SW = F.SW;
          let hi = -1e9, hx = 0, hz = 0, above = 0;
          for (let j = 0; j < n; j++) {
            const x = Z[j * 7], y = Z[j * 7 + 1], z = Z[j * 7 + 2], tx = Z[j * 7 + 4], ty = Z[j * 7 + 5], tz = Z[j * 7 + 6];
            const wx = p0[0] + M[0] * x + M[1] * y + M[2] * z, wy = p0[1] + M[3] * x + M[4] * y + M[5] * z, wz = p0[2] + M[6] * x + M[7] * y + M[8] * z;
            SW[j * 7] = wx; SW[j * 7 + 1] = wy; SW[j * 7 + 2] = wz; SW[j * 7 + 3] = Z[j * 7 + 3];
            SW[j * 7 + 4] = M[0] * tx + M[1] * ty + M[2] * tz; SW[j * 7 + 5] = M[3] * tx + M[4] * ty + M[5] * tz; SW[j * 7 + 6] = M[6] * tx + M[7] * ty + M[8] * tz;
            if (!S.sea || wy > .25) above++;
            if (wy > hi) { hi = wy; hx = wx; hz = wz; }
          }
          W3[0] = hx; W3[1] = hi; W3[2] = hz;
          let k = kOf(u, S, rec, t);
          if (S.sea && !above) k = 0;                                          // all under the water: out
          F.k = k;
          F.follow(t, W3, pose.hdg, vis ? k : 0);
        }
      }
      rec.now = game.t;
    }
    stats.scars = ns;
  }

  /* a cook-off (sim/damage.js 'cookoff'): the module's load going up blows out through the deck over it */
  function onCookoff(e) {
    const u = sim.units.get(e.unit);
    if (!u || !e.at || u.def.domain === 'air' || !R.models.has(u.def.model)) return;
    const ent = R.models.get(u.def.model), st = stOf(u), G = gridOf(ent, st);
    const at = e.at, o = new Array(6), top = (G ? G.deckY : u.def.size[2] * .4) + 14;
    if (!snap(ent, st, [at[0], top, at[2]], [0, -1, 0], 1.6, o)) return;
    const kg = Math.min(3000, Math.pow(Math.max(2, e.size || 8) / 1.25, 3));
    const nl = Math.hypot(o[3], o[4], o[5]) || 1;
    const zone = zoneOf(u.def.domain === 'sea', o[1], o[4] / nl, G ? G.deckY : 0), t = plateOf(u, zone);
    const Oc = outcome(kg, t, 'in', 0, 0), cap = .35 * Math.max(u.def.size[1], u.def.size[2]);
    const S = { x: o[0], y: o[1], z: o[2], nx: o[3] / nl, ny: o[4] / nl, nz: o[5] / nl, kind: Oc.kind === 'dent' ? 'hole' : Oc.kind, r: Math.min(Math.max(Oc.r, .6), cap), r0: Oc.r,
      reach: Oc.reach, pet: .5, sg: 1, np: 0, W: Oc.Weff, px: Oc.x, fz: 'in', t, zone, t0: sim.t, seed: (u.id * 71 + (S_N++)) % 997, sea: u.def.domain === 'sea', wl: false,
      fire: null, merged: 0, deckY: G ? G.deckY : 0, D: 0, inn: null, nIn: 0, seats: null, force: .95, forceUntil: sim.t + Math.max(20, e.fire || 0) };
    // the world point where it vents (fx lays its blast there)
    const pose = game.unitPose(u), M = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    lastEv = e; lastW = Oc.Weff;
    lastPos[0] = pose.pos[0] + M[0] * S.x + M[1] * S.y + M[2] * S.z; lastPos[1] = pose.pos[1] + M[3] * S.x + M[4] * S.y + M[5] * S.z; lastPos[2] = pose.pos[2] + M[6] * S.x + M[7] * S.y + M[8] * S.z;
    lastN[0] = M[0] * S.nx + M[1] * S.ny + M[2] * S.nz; lastN[1] = M[3] * S.nx + M[4] * S.ny + M[5] * S.nz; lastN[2] = M[6] * S.nx + M[7] * S.ny + M[8] * S.nz;
    // the module's contents on the GPU solver (game/src/blast): explosive, propellant, fuel vapour
    const mod = (MODULES[u.type] || []).find(m => m.id === e.module);
    const bl = !!(mod && mod.contents && game.blast && game.blast.accepts(u, 'in', e));
    if (bl) S.bl = true;
    const P = addScar(u, S, ent, st);
    if (bl && P === S) {
      let B = null;
      // at the deck over the module the load vents through (the up-facing plating right over its box), else its side
      const dk = deckOver(ent, st, mod.box);
      try { B = game.blast.cook(u, mod, { S, a: dk ? [(mod.box[0] + mod.box[3]) / 2, dk, (mod.box[2] + mod.box[5]) / 2] : null, n: dk ? [0, 1, 0] : null, deckY: dk || (G ? G.deckY : u.def.size[2] * .4), halfB: halfBFn(u, G) }); } catch (err) { console.error('scars: blast cookoff', err); }
      if (!B) { S.bl = false; S.blast = null; build(u, S, ent, st); }
    }
    if (P) { P.force = Math.max(P.force || 0, S.force); P.forceUntil = Math.max(P.forceUntil || 0, S.forceUntil); P.kick = 1; }
  }

  const sys = {
    name: 'scars', priority: 12,
    stats, groups, outcome, PLATE,
    surface(ev) { return ev && ev === lastEv ? lastPos : null; },
    normal(ev) { return ev && ev === lastEv ? lastN : null; },
    charge(ev) { return ev && ev === lastEv ? lastW : 0; },
    burning(id) { const r = recs.get(id); return !!(r && r.list.some(S => S.fire)); },
    heavy(id) { const r = recs.get(id); return r ? r.heavy : 0; },
    last(id) { const r = recs.get(id); return r && r.list.length ? r.list.reduce((a, b) => ((b.t0h || b.t0) >= (a.t0h || a.t0) ? b : a)) : null; },
    of(id) { return recs.get(id) || null; },
    /* the blast system (game/src/blast): a fire for a solved mark, the dots that left its hole (r: the torn skin's
       equivalent radius), the analytic mark back when its patch failed */
    startFire(u, S) { startFire(u, S); },
    ejectaAt(u, S, r) {
      if (!R.models.has(u.def.model) || !(r > .1)) return;
      const ent = R.models.get(u.def.model), st = stOf(u), pose = game.unitPose(u), M = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const x = S.hx !== undefined ? S.hx : S.x, y = S.hy !== undefined ? S.hy : S.y, z = S.hz !== undefined ? S.hz : S.z;
      const c = [pose.pos[0] + M[0] * x + M[1] * y + M[2] * z, pose.pos[1] + M[3] * x + M[4] * y + M[5] * z, pose.pos[2] + M[6] * x + M[7] * y + M[8] * z];
      ejecta(u, ent, st, Object.assign({}, S, { x, y, z, r }), M, pose, c);
    },
    rebuild(id, S) {
      const u = sim.units.get(id); if (!u || !R.models.has(u.def.model)) return;
      S.bl = false; S.blast = null;
      const ent = R.models.get(u.def.model), st = stOf(u);
      build(u, S, ent, st);
      if (!S.fire) startFire(u, S);
    },
    /* a ship lost with no fire of her own: her worst hole burns, else a fire on her deck amidships. -> true if lit */
    ignite(id) {
      const u = sim.units.get(id);
      if (!u || !R.models.has(u.def.model)) return false;
      const rec = recOf(u);
      let best = null;
      for (const S of rec.list) if (holeLike(S.kind) && (!best || S.r > best.r)) best = S;
      if (best) { if (!best.fire) { best.W = Math.max(best.W, 20); startFire(u, best); } if (best.fire) { best.force = .8; return true; } }
      const ent = R.models.get(u.def.model), st = stOf(u), G = gridOf(ent, st), o = new Array(6);
      if (!snap(ent, st, [0, (G ? G.deckY : 5) + 14, 0], [0, -1, 0], 2, o)) return false;
      const S = { x: o[0], y: o[1], z: o[2], nx: 0, ny: 1, nz: 0, kind: 'dent', r: 0, r0: 0, reach: 2, pet: 0, sg: 1, np: 0, W: 40, px: 0, fz: 'in', t: 10, zone: 'deck', t0: sim.t,
        seed: (id * 37) % 997, sea: u.def.domain === 'sea', wl: false, fire: null, merged: 0, deckY: G ? G.deckY : 0, D: 0, inn: null, nIn: 0, force: .8,
        seats: Float32Array.from([o[0] - 3, o[1], o[2] - 4, 2, 0, 0, 1, o[0] + 2, o[1], o[2], 2, 0, 0, 1, o[0], o[1], o[2] + 5, 2, 0, 0, 1]) };
      if (rec.list.length >= MAXS) return false;
      rec.list.push(S);
      startFire(u, S);
      return !!S.fire;
    },
    /* take a unit's marks off now (the Inspect impact test's reset): its scars, their fires and smoke (out of the fx
       list at once), its ejecta */
    clear(id) {
      const rec = recs.get(id), f = fxSys();
      if (rec) for (const S of rec.list) if (S.fire) { S.fire.stop(sim.t); const i = f && f.fx ? f.fx.indexOf(S.fire) : -1; if (i >= 0) f.fx.splice(i, 1); }
      recs.delete(id);
      if (game.blast) game.blast.dropUnit(id);
      for (let i = groups.length - 1; i >= 0; i--) if (groups[i].unit === id) groups.splice(i, 1);
      const d = game.drawn && game.drawn.get(id); if (d) d.scars = null;
      if (lastEv && lastEv.target === id) lastEv = null;
    },
    init() { game.scars = sys; },
    onEvent(e) {
      switch (e.type) {
        case 'hit': if (e.target !== undefined) { try { onHit(e); } catch (err) { console.error('scars: hit', err); } } return;
        case 'cookoff': try { onCookoff(e); } catch (err) { console.error('scars: cookoff', err); } return;
        case 'destroyed': {
          const rec = recs.get(e.unit);
          if (!rec) return;
          rec.dead = true;
          // a vehicle's wreck fire is the fx system's (it burns on the ground after the wreck is gone)
          const u = sim.units.get(e.unit);
          if (u && u.def.domain !== 'sea') for (const S of rec.list) if (S.fire) { S.fire.stop(sim.t); S.fire = null; }
          return;
        }
        case 'removed': {
          const rec = recs.get(e.unit);
          if (rec) { for (const S of rec.list) if (S.fire) S.fire.stop(sim.t); recs.delete(e.unit); }
          return;
        }
        default: return;
      }
    },
    update,
    draw3d(frame) {
      const t0 = performance.now();
      for (const [id, rec] of recs) { const d = game.drawn.get(id); if (d) d.scars = rec.n ? rec : null; }
      if (!R.pcOff && groups.length) stats.ejecta = drawEjecta(frame);
      else stats.ejecta = 0;
      stats.inside = !R.pcOff && R.style !== 'orbital' ? drawInside(frame) : 0;
      stats.drawMs = performance.now() - t0;
    },
    dispose() { for (const rec of recs.values()) for (const S of rec.list) if (S.fire) S.fire.stop(sim.t); recs.clear(); if (game.scars === sys) game.scars = null; },
  };
  return sys;
}
