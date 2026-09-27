/* Structure: ships as hull girders and rigid bodies when they are badly damaged (render side; the sim stays as it is).

   While a ship is afloat, every hit that could hurt her girder is kept in her own frame (where, how big: the warhead,
   public figures, game/scars.js WH; under the keel or not). When she is lost (sim 'destroyed'), this system takes
   her over from the pose she is drawn in:
     sections   the hull cut into 4-8 slabs along its length (structure/layout.js; a joint moved onto the worst hit),
                each with its mass, its buoyancy columns and two compartments (port, starboard)
     strength   each joint's share of the girder left after the hits near it: a hole's width of the girder's girth,
                twice over for the plating buckled round it, worse at the keel (a charge under her breaks her back) and
                at the deck (the flanges), fading along the hull from the hit; burning erodes it slowly
     physics    structure/body.js: the pieces float, heel, trim and sink on their columns; the moment each joint
                carries is weighed against what is left of it; one that gives way splits the piece, the two halves
                held a few seconds at the keel (hogging) or the deck (sagging) as the plating tears through, then free:
                bow and stern jack-knife up, the break sags, the halves settle, list, capsize and go
     flooding   each compartment through its holes (the share of each hole under the water), an open torn end under
                the water (fast: tens of seconds), a flooded neighbour (bulkheads: minutes) and a slow leak
     drawing    each piece is the ship's model (and its underwater hull, layout.js) with its own transform, cut at its
                torn ends in the shader (engine/models.js d.slab: jagged, the plating peeled out, glowing, charred);
                the scars and the modules the debris took off ride with the model; the occlusion splats stay per piece;
                the torn faces' insides (decks, frames), sparks, foam, steam, the slick and a fire at the break
                (structure/fx.js); a break-up on the bus for the director, bullet time by its rules
   Timing: real sizes and rates in sim seconds (a destroyer's back breaks over seconds, the halves go in minutes; the HUD
   shows any time compression). The sim removes the unit when its own death animation ends; the pieces carry on here
   until they are under, then go.
   Hooks: game.structure = { draws(id), pose(id), of(id), drop(id), hit(id, o) (tests: a charge at a model point),
   refine(id, t, o) (game/src/blast: the solved hole replaces the estimate: its torn area and middle, the frames torn and
   the plastic work weaken the girder; a dent that did not tear floods nothing), poseAt(id, z) (the drawn pose of the piece
   holding model station z),
   stats }; game.unitPose answers for a ship taken over (its main piece), so fires, labels and the camera follow her.
   Events: 'hit' (kept), 'destroyed' (take over), 'cookoff' (sim/damage.js: a magazine or VLS going up: a charge deep
   inside, sized from the event's blast size; 'kill' is followed by 'destroyed'),
   'removed' (the sim is done with her; the pieces carry on).
   createStructure(game) -> system 'structure' (priority 11.5: its events after scars (12), before debris (11)). */
import { layoutOf, sectionsOf, faceOf, hsh } from './layout.js';
import { newPiece, stepShip, splitPiece, dampOf, qMat, matQ, slerpM, ss } from './body.js';
import { createBreakFx } from './fx.js';
import { attitudeM } from '../debris/math.js';
import { WH } from '../scars.js';
import { Splash, Fire } from '../../fx/lib/impact.js';
import { floodShare } from '../../sim/ship.js';

const G = 9.81, RHO = 1025;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const K_M = 1 / 12;                // the girder's ultimate moment as a share of displacement x g x length (intact: a destroyer ~1.2 GN m)
const LEAK = .0012;                // a lost ship's slow leak (fraction of a compartment per s)
const OPEN = .02;                  // an open torn end under the water (fraction per s: decks and bulkheads in the way)

export async function createStructure(game) {
  const sim = game.sim, R = game.R, T = R.terrain, bus = game.bus;
  const ships = new Map();          // unit id -> ship S
  const hist = new Map();           // unit id -> hits in her frame [{ x, y, z, r, W, under, t }]
  const bfx = createBreakFx(game);
  const stats = { ships: 0, pieces: 0, steps: 0, ms: 0, drawMs: 0, dots: 0, breaks: 0 };
  const dbg = { noBelow: false, noFx: false, noFace: false, noDraw: false };
  const M9 = [1, 0, 0, 0, 1, 0, 0, 0, 1], Q4 = [1, 0, 0, 0], Q5 = [1, 0, 0, 0], P3 = [0, 0, 0], C5 = [0, 0, 0, 0, 0], WIND = [0, 0];
  const base = game.unitPose;
  const fxSys = () => game.getSystem('fx');
  const addFx = (e, layer) => { const f = fxSys(); if (f && f.add) f.add(e, layer); return e; };
  const sea = (x, z) => { const s = T.seaAt ? T.seaAt(x, z, game.seaT) : null; return s ? s.y * .85 : 0; };
  const bed = (x, z) => { const y = game.map.h(x, z); return y < 0 ? y : y + .5; };

  /* ------------------------------------------------------------ hits kept while she floats */
  function warheadOf(kind) { return WH[kind] !== undefined ? WH[kind] : ((game.PROJ[kind] && game.PROJ[kind].dmg) || 10) * 2.5; }
  function holeR(def, W, under) { return Math.min(.95 * Math.cbrt(W) * (under ? 1.25 : 1), .35 * Math.max(def.size[1], def.size[2])); }
  /* the hit in the model frame: the scar just carved (game/scars.js) if there is one, else from the event */
  function hitModel(u, e, W, pose, R0) {
    const def = u.def, sc = game.scars && game.scars.last(u.id);
    const fresh = sc && Math.abs((sc.t0h || sc.t0) - sim.t) < 1e-6;
    if (fresh) return { x: sc.x, y: sc.y, z: sc.z, r: holeR(def, W, !!e.under), W, under: !!e.under, t: sim.t };
    const dx = e.pos[0] - pose.pos[0], dy = e.pos[1] - pose.pos[1], dz = e.pos[2] - pose.pos[2];
    const x = R0[0] * dx + R0[3] * dy + R0[6] * dz, y = R0[1] * dx + R0[4] * dy + R0[7] * dz, z = R0[2] * dx + R0[5] * dy + R0[8] * dz;
    return { x: e.under ? (x >= 0 ? 1 : -1) * def.size[1] * .3 : x, y: e.under ? -(def.draught || 5) * 1.1 : y, z, r: holeR(def, W, !!e.under), W, under: !!e.under, t: sim.t };
  }
  function onHit(e) {
    const u = sim.units.get(e.target);
    if (!u || !e.pos || e.miss || u.def.domain !== 'sea' || u.def.sub || u.aboard) return;
    const W = warheadOf(e.kind);
    if (W < 2 && !e.under) return;
    const S = ships.get(u.id);
    if (S) { hitTaken(S, e, W); return; }
    const pose = base(u), R0 = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    let L = hist.get(u.id);
    if (!L) hist.set(u.id, L = []);
    L.push(hitModel(u, e, W, pose, R0));
    if (L.length > 24) L.shift();
  }

  /* ------------------------------------------------------------ the girder */
  /* the share of joint zj's strength a hit h takes */
  function lossAt(S, h, zj) {
    // the girder's girth amidships (the plating near the ends is thinner as the moments there are smaller: a hole
    // takes the same share of it anywhere)
    const H = S.H, zm = (H.z0 + H.z1) / 2, per = 2 * (2 * Math.max(1, H.beam(zm)) + H.deck(zm) + H.keel(zm));
    let k = Math.min(1.2, 2.2 * 2 * h.r / per) * S.armor * (h.kf || 1);
    k *= h.under ? 2.6 : h.inside ? 2.2 : h.y < -1.5 ? 1.8 : h.y > H.deck(zj) - 1.5 ? 1.25 : 1;
    const reach = h.r * 1.5 + S.L.sec[0].len * .35, dz = (h.z - zj) / reach;
    return k * Math.exp(-dz * dz);
  }
  function taper(S, z) { const s = Math.abs((z - (S.H.z0 + S.H.z1) / 2) / (S.H.L / 2)); return Math.max(.3, 1 - 1.4 * Math.max(0, s - .4)); }
  function setCaps(S) { for (let j = 1; j < S.n; j++) S.cap[j] = Math.max(.02, S.str[j]) * S.M0 * taper(S, S.L.zc[j]); }
  function damageGirder(S, h) {
    for (let j = 1; j < S.n; j++) S.str[j] = Math.max(0, S.str[j] - lossAt(S, h, S.L.zc[j]));
    setCaps(S);
  }
  /* a hole's inflow: the part of it under the water, through a ragged hole, into its compartment */
  function addHole(S, h) {
    if (h.dent) return;                                               // (solved: the plating held)
    const L = S.L, i = secAt(S, h.z), side = h.x < 0 ? 0 : 1;
    // the compartment's volume (the buoyancy it holds at the design draught, and what is above it to the deck); the
    // water gets in through the part of the ragged hole under the surface (flood(): a circle cut by the waterline, a
    // head of water over it), the decks and bulkheads inside slowing it (at most a twentieth of it a second)
    const low = h.under || h.inside;
    const put = (j, sd, k) => S.holes.push({ i: j, c: j * 2 + sd, x: sd === side ? h.x : -h.x, y: h.y, z: h.z, r: h.r * .8, Vc: Math.max(50, L.sec[j].V0 * .5 * 1.7), k, under: low, sub: 0, rate: 0, h });
    put(i, side, low ? 1.2 : 1);
    // a charge under her or deep inside, or a hole as wide as the hull there (the bow): both sides open
    const both = low || h.r * .8 > .7 * Math.max(.5, S.H.beam(h.z));
    if (both) put(i, 1 - side, .8);
    // the blast reaches over the bulkhead into the next compartment
    if (i > 0 && h.z - L.zc[i] < h.r) { put(i - 1, side, .6); if (both) put(i - 1, 1 - side, .5); }
    if (i < S.n - 1 && L.zc[i + 1] - h.z < h.r) { put(i + 1, side, .6); if (both) put(i + 1, 1 - side, .5); }
  }
  function secAt(S, z) { const zc = S.L.zc; for (let i = 0; i < S.n; i++) if (z < zc[i + 1]) return i; return S.n - 1; }

  /* ------------------------------------------------------------ taking a ship over */
  function takeover(u, e) {
    const def = u.def;
    if (def.domain !== 'sea' || def.sub || u.aboard || ships.has(u.id) || !R.models.has(def.model)) return null;
    if (def.size[0] < 40) return null;                     // small craft (an LCAC): the sim's own sinking
    if (def.hover && game.map.h(u.pos[0], u.pos[2]) > -1) return null;
    const vis = u.side === game.side || !sim.fog || game.vis(u) === 'own' || game.vis(u) === 'track';
    if (!vis) return null;
    const H = layoutOf(R, def.model, def);
    const hits = hist.get(u.id) || [];
    hist.delete(u.id);
    // the joint moves onto the worst hit
    let focus = null, wm = 0;
    for (const h of hits) { const w = h.W * (h.under ? 3 : 1); if (w > wm) { wm = w; focus = h.z; } }
    const L = sectionsOf(H, def, focus);
    dampOf(L, .24);
    const n = L.n;
    const S = {
      u, id: u.id, key: def.model, def, H, L, n, side: u.side, t: game.t, t0: game.t, h: 1 / 60,
      flood: new Float32Array(2 * n), str: new Float32Array(n + 1).fill(1), cap: new Float64Array(n + 1), FS: new Float64Array(3 * n), MS: new Float64Array(3 * n),
      holes: [], pieces: [], hinges: [], breaks: [], pieceN: 0, overT: new Float32Array(n + 1), pend: null,
      M0: K_M * L.M * G * H.L, st: Object.assign({}, def.modelState ? def.modelState(u, game.t) : u.st || {}),
      pose: { pos: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, speed: 0, f: -1 }, main: null, gone: false, done: false, vis: true,
      tint: u.side === game.side ? 'own' : 'hostile', seed: (u.id * 7919 + 17) % 100003, scars: null, lastBreak: -1e9,
      armor: H.L > 240 ? .45 : 1,          // a carrier's (an LHD's) girder: heavy plating, deep, many decks
      wave: Math.max(1.2, H.L / 48), band: Math.max(.8, H.L / 85), amp: Math.max(1, H.L / 45), yc: (H.top * .6 - H.T) / 2,
    };
    // a ship with a subdivision (sim/ship.js): her holes are the ones the sim tore (the openings in her plating, where
    // they are, how big), and the water already in her goes into the sections that hold those spaces; the others:
    // holes estimated from the hits, the sim's flood share spread over them
    const SH = u.ship;
    for (const h of hits) { damageGirder(S, h); if (!SH) addHole(S, h); }
    if (SH) for (const o of SH.holes) {
      if (o.A <= .005) continue;
      const r = Math.sqrt(o.A / Math.PI);
      addHole(S, { x: o.x, y: o.y, z: o.z, r: r / .8, W: 0, under: o.y + r < -1.5, inside: false, t: sim.t });
    }
    S.hitsSeen = hits.slice();
    setCaps(S);
    S.bubble = hits.some(h => h.under && sim.t - h.t < 2) ? hits.filter(h => h.under).reduce((a, h) => Math.max(a, h.W), 0) : 0;
    // the water already in her (the sim's flooding)
    if (SH) {
      for (let i = 0; i < n; i++) for (let sd = 0; sd < 2; sd++) S.flood[i * 2 + sd] = Math.min(.9, floodShare(u, L.zc[i], L.zc[i + 1], sd ? 1 : -1));
    } else {
      const f0 = Math.min(.5, (u.flood || 0) * .8);
      if (f0 > 0) for (const o of S.holes) S.flood[o.c] = Math.max(S.flood[o.c], Math.min(.9, f0 * o.k));
    }
    // one piece, where she is drawn now, with her way on
    const pose = base(u), P = newPiece(S, 0, n - 1);
    attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, M9);
    matQ(M9, P.q); qMat(P.q, P.R);
    const c = P.cm;
    P.p[0] = pose.pos[0] + M9[0] * c[0] + M9[1] * c[1] + M9[2] * c[2];
    P.p[1] = pose.pos[1] + M9[3] * c[0] + M9[4] * c[1] + M9[5] * c[2];
    P.p[2] = pose.pos[2] + M9[6] * c[0] + M9[7] * c[1] + M9[8] * c[2];
    const sp = u.speed || 0;
    P.v[0] = Math.sin(pose.hdg) * sp; P.v[2] = Math.cos(pose.hdg) * sp;
    P.pp[0] = P.p[0]; P.pp[1] = P.p[1]; P.pp[2] = P.p[2]; for (let i = 0; i < 4; i++) P.pq[i] = P.q[i];
    S.pieces.push(P); S.main = P;
    // a charge under her keel: the gas bubble lifts her amidships, then drops her into the hollow it leaves
    if (S.bubble) { const hu = hits.filter(h => h.under).pop(); kick(P, hu, S.bubble); }
    // a girder with next to nothing left goes at once (after the blast)
    let wj = 0, ws = 1;
    for (let j = 1; j < n; j++) if (S.str[j] < ws) { ws = S.str[j]; wj = j; }
    if (wj && ws < .02) S.pend = { j: wj, t: game.t + .35 + .5 * hsh(u.id, 3) };
    setPose(S, 1);
    ships.set(u.id, S);
    return S;
  }
  /* a hit on a hulk already taken over: the piece it struck, in that piece's frame */
  function hitTaken(S, e, W) {
    let best = null, bd = 1e9;
    const hm = [0, 0, 0];
    for (const P of S.pieces) {
      if (P.sunk) continue;
      const Rm = P.R, dx = e.pos[0] - P.p[0], dy = e.pos[1] - P.p[1], dz = e.pos[2] - P.p[2];
      const x = Rm[0] * dx + Rm[3] * dy + Rm[6] * dz + P.cm[0], y = Rm[1] * dx + Rm[4] * dy + Rm[7] * dz + P.cm[1], z = Rm[2] * dx + Rm[5] * dy + Rm[8] * dz + P.cm[2];
      const z0 = S.L.zc[P.i0], z1 = S.L.zc[P.i1 + 1], d = Math.max(0, z0 - z, z - z1) + Math.abs(x) * .2;
      if (d < bd) { bd = d; best = P; hm[0] = x; hm[1] = y; hm[2] = z; }
    }
    if (!best) return;
    const h = { x: e.under ? (hm[0] >= 0 ? 1 : -1) * S.def.size[1] * .3 : hm[0], y: e.under ? -S.H.T * 1.1 : hm[1], z: hm[2], r: holeR(S.def, W, !!e.under), W, under: !!e.under, t: sim.t };
    damageGirder(S, h); addHole(S, h); (S.hitsSeen || (S.hitsSeen = [])).push(h);
    // the blast's shove
    kick(best, h, W);
    for (let j = best.i0 + 1; j <= best.i1; j++) if (S.str[j] < .02 && !S.pend) S.pend = { j, t: game.t + .3 };
  }
  function kick(P, h, W) {
    const J = Math.min(P.m * 1.2, 900 * Math.pow(W, .9) * (h.under ? 40 : 1));   // N s (under the keel: the gas bubble)
    const up = h.under ? 1 : .35, Rm = P.R;
    const lx = h.x - P.cm[0], ly = h.y - P.cm[1], lz = h.z - P.cm[2];
    const rx = Rm[0] * lx + Rm[1] * ly + Rm[2] * lz, ry = Rm[3] * lx + Rm[4] * ly + Rm[5] * lz, rz = Rm[6] * lx + Rm[7] * ly + Rm[8] * lz;
    const jx = -Math.sign(h.x || 1) * Rm[0] * J * (1 - up), jy = J * up, jz = -Math.sign(h.x || 1) * Rm[6] * J * (1 - up);
    P.v[0] += jx / P.m; P.v[1] += jy / P.m; P.v[2] += jz / P.m;
    // the angular impulse, through the body's inertia (model axes)
    const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
    const bx = Rm[0] * tx + Rm[3] * ty + Rm[6] * tz, by = Rm[1] * tx + Rm[4] * ty + Rm[7] * tz, bz = Rm[2] * tx + Rm[5] * ty + Rm[8] * tz;
    const ax = bx / P.I[0], ay = by / P.I[1], az = bz / P.I[2];
    P.w[0] += Rm[0] * ax + Rm[1] * ay + Rm[2] * az; P.w[1] += Rm[3] * ax + Rm[4] * ay + Rm[5] * az; P.w[2] += Rm[6] * ax + Rm[7] * ay + Rm[8] * az;
  }
  /* a magazine or VLS going up inside her (sim 'cookoff': { unit, module, pos, at (model frame), size (m, the blast the
     visuals scale to), out 'kill' | 'heavy' }): a charge deep in the hull, the equivalent of a fireball that size
     (r ~ 3.5 cbrt(kg)), blowing out her bottom; 'kill' is followed by 'destroyed' */
  function cookoff(e) {
    const u = sim.units.get(e.unit);
    if (!u || u.def.domain !== 'sea' || u.def.sub) return;
    const W = e.kg || e.W || Math.min(8000, Math.max(150, Math.pow((e.size || 20) / 3.5, 3)));
    const S = ships.get(u.id);
    let x = 0, y = 0, z = 0;
    if (e.at) { x = e.at[0]; y = e.at[1]; z = e.at[2]; }
    else if (e.pos) {
      const pose = S ? S.pose : base(u), R0 = attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const dx = e.pos[0] - pose.pos[0], dy = e.pos[1] - pose.pos[1], dz = e.pos[2] - pose.pos[2];
      x = R0[0] * dx + R0[3] * dy + R0[6] * dz; y = R0[1] * dx + R0[4] * dy + R0[7] * dz; z = R0[2] * dx + R0[5] * dy + R0[8] * dz;
    }
    // (in the frame of the piece it is in, once she is broken: the model frame is the same for all of them)
    const h = { x, y: Math.min(y, -(u.def.draught || 5) * .35), z, r: holeR(u.def, W, false) * 1.15, W, under: false, inside: true, t: sim.t };
    if (S) {
      damageGirder(S, h); addHole(S, h); (S.hitsSeen || (S.hitsSeen = [])).push(h);
      const P = S.pieces.find(q => z >= S.L.zc[q.i0] && z <= S.L.zc[q.i1 + 1]);
      if (P) kick(P, h, W);
      for (let j = 1; j < S.n; j++) if (S.str[j] < .02 && !S.pend) { S.pend = { j, t: game.t + .12 }; break; }
    } else { let L = hist.get(u.id); if (!L) hist.set(u.id, L = []); L.push(h); }
  }

  /* ------------------------------------------------------------ physics */
  function flood(S, h) {
    const f = S.flood, L = S.L;
    for (const o of S.holes) {
      // the hole's lowest point under the water? (its piece's pose)
      const P = pieceOf(S, o.i);
      if (!P || P.sunk) { o.sub = 0; continue; }
      const Rm = P.R, dx = o.x - P.cm[0], dy = o.y - P.cm[1], dz = o.z - P.cm[2];
      const y = P.p[1] + Rm[3] * dx + Rm[4] * dy + Rm[5] * dz, r = o.r;
      // the circle's segment under the water, the head over its middle
      let A, head;
      if (o.under) { A = Math.PI * r * r; head = Math.max(1, -y); }
      else {
        const d = Math.max(-r, Math.min(r, -y));                         // how far the centre is under (+) / over (-)
        const hh = r + d;                                                // the segment's height under the water
        A = hh <= 0 ? 0 : hh >= 2 * r ? Math.PI * r * r : r * r * Math.acos((r - hh) / r) - (r - hh) * Math.sqrt(Math.max(0, 2 * r * hh - hh * hh));
        head = Math.max(.4, hh * .45 + Math.max(0, d));
      }
      o.rate = Math.min(1 / 30, (A * .6 * Math.sqrt(2 * G * head) + (A > 0 ? 0 : 4)) / o.Vc) * o.k;
      o.sub = 1;
    }
    for (const P of S.pieces) {
      if (P.sunk) continue;
      const openLo = P.cut0 ? openShare(S, P, P.cut0.z) : 0, openHi = P.cut1 ? openShare(S, P, P.cut1.z) : 0;
      P.open0 = openLo; P.open1 = openHi;
      for (let i = P.i0; i <= P.i1; i++) for (let sd = 0; sd < 2; sd++) {
        const c = i * 2 + sd;
        let r = LEAK;
        if (i === P.i0) r += OPEN * openLo;
        if (i === P.i1) r += OPEN * openHi;
        if (i > P.i0) r += .005 * Math.max(0, f[c - 2] - .55);
        if (i < P.i1) r += .005 * Math.max(0, f[c + 2] - .55);
        r += .006 * Math.max(0, f[c ^ 1] - f[c]);
        f[c] = Math.min(1, f[c] + r * (1 - f[c]) * h);
      }
    }
    for (const o of S.holes) { const c = o.c; f[c] = Math.min(1, f[c] + o.rate * o.sub * (1 - f[c]) * h); }
  }
  function pieceOf(S, i) { for (const P of S.pieces) if (i >= P.i0 && i <= P.i1) return P; return null; }
  /* the share of a torn face under the water (its keel and deck points at the cut) */
  function openShare(S, P, z) {
    const Rm = P.R, dz = z - P.cm[2], yk = -S.H.keel(z) - P.cm[1], yd = S.H.deck(z) - P.cm[1];
    const a = P.p[1] + Rm[4] * yk + Rm[5] * dz, b = P.p[1] + Rm[4] * yd + Rm[5] * dz;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return hi <= lo + 1e-3 ? (lo < 0 ? 1 : 0) : sat((0 - lo) / (hi - lo));
  }
  /* a joint giving way: piece P splits at joint j */
  function fail(S, P, j, t) {
    const [A, B] = splitPiece(S, P, j);
    const z = S.L.zc[j], seed = hsh(S.id * 31 + j, 7) * 97;
    const cut = { z, a: S.amp * (.7 + .6 * hsh(j, S.seed)), s: seed, t0: t, j, face: null };
    A.cut1 = cut; B.cut0 = cut;
    const k = S.pieces.indexOf(P);
    S.pieces.splice(k, 1, A, B);
    if (S.main === P) S.main = A.m >= B.m ? A : B;
    // the halves hang together a few seconds at the keel (hogging) or the deck (sagging) while the plating tears
    const sag = P.over[j] < 0 || S.u.fUnder > 0 || S.holes.some(o => o.under && Math.abs(o.z - z) < S.L.sec[0].len);
    const hm = [0, sag ? S.H.deck(z) : -S.H.keel(z) * .95, z];
    const mu = A.m * B.m / (A.m + B.m), om = 1 / (4 * S.h);
    const hold = (1.8 + 3.5 * hsh(S.id, j + 11)) * Math.sqrt(S.H.L / 150);
    const J = { A, B, hm, k: mu * om * om, c: 2 * .9 * mu * om, t0: t, hold, tear: 1.5 + hsh(S.id, 5), gone: false, gap: 0, load: 0, sag };
    S.hinges.push(J);
    // a small push apart
    const Rm = P.R, pz = .25;
    A.v[0] -= Rm[2] * pz; A.v[1] -= Rm[5] * pz; A.v[2] -= Rm[8] * pz;
    B.v[0] += Rm[2] * pz; B.v[1] += Rm[5] * pz; B.v[2] += Rm[8] * pz;
    A.lastFail = B.lastFail = t;
    // the torn compartments open to the sea at once
    for (const i of [j - 1, j]) for (let sd = 0; sd < 2; sd++) S.flood[i * 2 + sd] = Math.max(S.flood[i * 2 + sd], .35);
    S.lastBreak = t;
    // the moment: sparks round the girth, the water thrown up, a fire in the break, the slick, the director
    const Tm = [P.p[0] - (Rm[0] * P.cm[0] + Rm[1] * P.cm[1] + Rm[2] * P.cm[2]), P.p[1] - (Rm[3] * P.cm[0] + Rm[4] * P.cm[1] + Rm[5] * P.cm[2]), P.p[2] - (Rm[6] * P.cm[0] + Rm[7] * P.cm[1] + Rm[8] * P.cm[2])];
    const H = S.H, b = H.beam(z), d = H.deck(z), kl = H.keel(z);
    const wp = [Tm[0] + Rm[2] * z, 0, Tm[2] + Rm[8] * z];
    bfx.burst(t, Math.round(160 * quality()), (i, o) => {
      const u = hsh(i, S.seed + 1), side = u < .5 ? -1 : 1, v = (u < .5 ? u : u - .5) * 2;
      const x = side * b, y = d - v * (d + kl);
      o[0] = Tm[0] + Rm[0] * x + Rm[1] * y + Rm[2] * z; o[1] = Tm[1] + Rm[3] * x + Rm[4] * y + Rm[5] * z; o[2] = Tm[2] + Rm[6] * x + Rm[7] * y + Rm[8] * z;
    }, 24, S.seed + j);
    addFx(new Splash({ t0: sim.t, pos: [wp[0], 0, wp[2]], size: Math.min(45, 10 + b * 1.4), seed: S.seed + j * 3, ring: .15 }), 2);
    const F = new Fire({ t0: sim.t, seed: S.seed * 5 + j, size: Math.min(1.1, .35 + H.L / 400), local: [0, 0, 0], spread: [b * .8, 6 + d * .5, 3], ceiling: 700, life: 180, flame: .55, embers: 1.2, lightR: 30, lightI: 1.2, lightRgb: [255, 170, 90], dense: 11 });
    F.k = 1; addFx(F, 0);
    S.breaks.push({ cut, A, B, t0: t, F, wp: wp.slice(), slick: wp.slice(), seed: S.seed * 3 + j * 17, heat: 1, J, grind: 0 });
    stats.breaks++;
    announce(S, wp, t);
  }
  function announce(S, pos, t) {
    const cam = R.camera, d = Math.hypot(pos[0] - cam.eye[0], pos[1] - cam.eye[1], pos[2] - cam.eye[2]), px = S.H.L * (cam.fl || 1000) / Math.max(1, d);
    const q = cam.project(pos), on = !!q && q[0] > 0 && q[0] < cam.W && q[1] > 0 && q[1] < cam.H && q[2] > 0;
    const b = { t: sim.t, pos: pos.slice(), id: S.id, kind: S.u.type, key: S.key, L: S.H.L, heavy: true, spin: false, side: S.side, w: 14, px, dist: d, onScreen: on, unit: S.id, hull: true };
    bus.emit('breakup', b);
    if (game.bulletTime && game.bulletTime.want) game.bulletTime.want(b);
  }
  function quality() { const q = { low: .35, medium: .65, high: 1 }[(game.settings && game.settings.effects) || 'high'] || 1; return q * (game.quality && game.quality.fx > 0 ? game.quality.fx : 1); }

  function stepAll() {
    const t1 = game.t, t0p = performance.now();
    let steps = 0;
    for (const S of ships.values()) {
      if (S.done) continue;
      const h = S.h = game.timeRate >= 16 ? 1 / 30 : 1 / 60;
      let k = 0;
      // fires eat at the girder near them
      const burning = game.scars && game.scars.burning(S.id);
      while (S.t + h <= t1) {
        const t = S.t + h;
        stepShip(S, h, sea, t, bed);
        flood(S, h);
        if (burning) for (let j = 1; j < S.n; j++) if (S.str[j] < .9) S.str[j] = Math.max(0, S.str[j] - .0004 * h);
        // a joint that has carried more than it can for a moment gives way (not a piece that has just broken)
        let fj = 0, fp = null, fo = 1;
        for (const P of S.pieces) {
          if (P.sunk || P.i1 <= P.i0 || t - P.lastFail < 4 || t - S.t0 < 1.5) continue;
          for (let j = P.i0 + 1; j <= P.i1; j++) {
            const o = Math.abs(P.over[j]);
            S.overT[j] = o > 1 ? S.overT[j] + h : 0;
            if (S.overT[j] > .25 && o > fo) { fo = o; fj = j; fp = P; }
          }
        }
        if (S.pend && t >= S.pend.t) { const P = pieceOf(S, S.pend.j); if (P && P.i0 < S.pend.j) { fj = S.pend.j; fp = P; } S.pend = null; }
        if (fp) fail(S, fp, fj, t);
        S.t = t; steps++;
        if (++k > 400) { S.t = t1; break; }
      }
      if (burning) setCaps(S);
      // the main piece: the heaviest still up
      let mp = null; for (const P of S.pieces) if (!P.sunk && (!mp || P.m > mp.m)) mp = P;
      if (mp) S.main = mp;
      if (S.pieces.every(P => P.sunk) && t1 - Math.max(...S.pieces.map(P => P.sunkT)) > 5 && !S.done) finish(S);
    }
    stats.steps = steps; stats.ms = performance.now() - t0p;
  }
  function finish(S) {
    S.done = true; S.doneT = game.t;
    for (const B of S.breaks) if (B.F) B.F.stop(sim.t);
  }
  /* the main piece's pose for game.unitPose (a: the step interpolation) */
  function setPose(S, a) {
    const P = S.main; if (!P) return;
    poseOf(P, a, P3, M9);
    const p = S.pose;
    p.pos[0] = P3[0]; p.pos[1] = P3[1]; p.pos[2] = P3[2];
    p.pitch = Math.asin(Math.max(-1, Math.min(1, M9[5]))); p.hdg = Math.atan2(M9[2], M9[8]); p.roll = Math.atan2(-M9[3], M9[4]);
    p.speed = Math.hypot(P.v[0], P.v[2]);
  }
  /* a piece's model origin (T) and rotation at interpolation a between its last two steps */
  function poseOf(P, a, Tm, Rm) {
    slerpM(P.pq, P.q, a, Rm, Q5);
    const x = P.pp[0] + (P.p[0] - P.pp[0]) * a, y = P.pp[1] + (P.p[1] - P.pp[1]) * a, z = P.pp[2] + (P.p[2] - P.pp[2]) * a, c = P.cm;
    Tm[0] = x - (Rm[0] * c[0] + Rm[1] * c[1] + Rm[2] * c[2]); Tm[1] = y - (Rm[3] * c[0] + Rm[4] * c[1] + Rm[5] * c[2]); Tm[2] = z - (Rm[6] * c[0] + Rm[7] * c[1] + Rm[8] * c[2]);
  }

  /* ------------------------------------------------------------ drawing */
  function instOf(S, P, below) {
    const k = below ? 'instB' : 'inst';
    let d = P[k];
    if (!d) d = P[k] = { key: below ? S.H.below : S.key, T: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: below ? {} : S.st, tint: S.tint, tintK: .45, id: `st${S.id}.${P.id}${below ? 'b' : ''}`, stUnit: S.id, alpha: 1, dissolve: 0, slab: null, scars: null, partAlpha: null, damage: null };
    return d;
  }
  function slabOf(S, P, t) {
    if (!P.cut0 && !P.cut1) return null;
    const K = P.slab || (P.slab = { z0: -1e6, z1: 1e6, a0: 0, a1: 0, s0: 0, s1: 0, h0: 0, h1: 0, band: S.band, wave: S.wave, yc: S.yc });
    if (P.cut0) { K.z0 = P.cut0.z; K.a0 = P.cut0.a; K.s0 = P.cut0.s; K.h0 = heatOf(P.cut0, t); }
    if (P.cut1) { K.z1 = P.cut1.z; K.a1 = P.cut1.a; K.s1 = P.cut1.s; K.h1 = heatOf(P.cut1, t); }
    return K;
  }
  const heatOf = (c, t) => Math.exp(-Math.max(0, t - c.t0) / 9) * .9 + .1 * Math.exp(-Math.max(0, t - c.t0) / 60);
  function visible(S) {
    const u = S.u;
    if (sim.units.get(S.id) === u) S.vis = u.side === game.side || !sim.fog || game.vis(u) === 'own' || game.vis(u) === 'track';
    return S.vis;
  }
  const Tm = [0, 0, 0], Rm = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  /* (the Orbital style) the parts of the model whose middle lies in piece P, the hull on the main piece; with the debris
     system's mask (m) of what left */
  function orbMask(S, P, m) {
    const e = R.models.get(S.key), z0 = S.L.zc[P.i0], z1 = S.L.zc[P.i1 + 1];
    const k = P.orbM || (P.orbM = {});
    for (const Pt of e.parts) {
      const X = Pt.part.xf ? Pt.part.xf(S.st) : null, c = Pt.center, z = X ? X.R[6] * c[0] + X.R[7] * c[1] + X.R[8] * c[2] + X.T[2] : c[2];
      k[Pt.name] = (Pt.name === 'hull' ? P === S.main : z >= z0 && z < z1) && !(m && m[Pt.name] === 0) ? 1 : 0;
    }
    return k;
  }
  function drawShips(frame) {
    const t = game.t, cam = R.camera, e = cam.eye, fx = R.fx, orb = R.style === 'orbital';
    let dots = 0;
    const mask = game.debris && game.debris.mask ? game.debris.mask : null;
    for (const S of ships.values()) {
      if (S.done && t - S.doneT > 30) continue;
      if (!visible(S)) continue;
      const a = S.h > 0 ? sat((t - S.t) / S.h) : 1;
      const live = sim.units.get(S.id) === S.u;
      const sc = game.scars && game.scars.of(S.id);
      if (sc) S.scars = sc;
      const pm = mask ? mask(S.id) : null;
      for (const P of S.pieces) {
        if (P.sunk && t - P.sunkT > 3) continue;
        poseOf(P, a, Tm, Rm);
        const K = slabOf(S, P, t);
        // the underwater hull only when some of it is out of the water (a bow or stern lifted, rolled over)
        let bUp = false;
        if (S.H.below) {
          const z0 = S.L.zc[P.i0], z1 = S.L.zc[P.i1 + 1];
          for (let q = 0; q <= 4 && !bUp; q++) {
            const z = z0 + (z1 - z0) * q / 4, k = -S.H.keel(z) * .5;
            for (const x of [-S.H.beam(z) * .7, 0, S.H.beam(z) * .7]) if (Tm[1] + Rm[3] * x + Rm[4] * k + Rm[5] * z > -1.5) { bUp = true; break; }
          }
        }
        for (const below of [false, true]) {
          if (below && (!S.H.below || dbg.noBelow || !bUp)) continue;
          if (dbg.noDraw) continue;
          const d = instOf(S, P, below);
          for (let i = 0; i < 9; i++) d.R[i] = Rm[i];
          d.T[0] = Tm[0]; d.T[1] = Tm[1]; d.T[2] = Tm[2];
          d.hdg = d.pitch = d.roll = undefined;
          // the Orbital hairlines have no clip: each piece keeps the parts centred in it (the hull on the main one)
          if (orb) { d.slab = null; if (below) continue; } else d.slab = K;
          d.tint = S.tint;
          d.dissolve = P.sunk ? sat((t - P.sunkT) / 3) : 0;
          if (!below) { d.scars = S.scars && S.scars.n ? S.scars : null; d.partAlpha = orb && S.pieces.length > 1 ? orbMask(S, P, pm) : pm; d.damage = S.u.parts; }
          R.draw(d);
        }
        if (P === S.main && live) game.drawn.set(S.id, P.inst);
        if (!dbg.noFx) dots += drawWaterline(S, P, Rm, Tm, t);
        // the torn faces' insides
        const dist = Math.hypot(Tm[0] - e[0], Tm[1] - e[1], Tm[2] - e[2]) - S.H.L * .5;
        for (const c of [P.cut0, P.cut1]) {
          if (!c || dbg.noFace) continue;
          // (not while the whole face is under the water: the sea's occluder hides it)
          const yk = Tm[1] + Rm[4] * -S.H.keel(c.z) + Rm[5] * c.z, yd = Tm[1] + Rm[4] * S.H.deck(c.z) + Rm[5] * c.z;
          if (Math.max(yk, yd) < -1) continue;
          if (!c.face) { c.sp = Math.max(.3, S.H.L / 260); c.face = faceOf(S.H, c.z, c.a, c.s, S.wave, c.sp); }
          dots += bfx.drawFace(c.face, Rm, Tm, heatOf(c, t), Math.max(1, dist), S.seed, c.sp);
        }
      }
      // at each break: foam where the open ends meet the water, steam, the fire, the slick
      if (!dbg.noFx) for (const B of S.breaks) dots += drawBreak(S, B, t, a);
    }
    dots += bfx.drawSparks(t, sea);
    return dots;
  }
  /* where a piece cuts the water, as it is drawn now: a churned white line along its waterline (round the section at
     stations along it), stronger as it moves through the water (settling, rolling, going down: air bursting out) */
  const WL = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function drawWaterline(S, P, Rm, Tm, t) {
    if (P.sunk || P.top < 0) return 0;
    const H = S.H, cam = R.camera, e = cam.eye, fx = R.fx, z0 = S.L.zc[P.i0], z1 = S.L.zc[P.i1 + 1], zm = (z0 + z1) / 2;
    const cx = Tm[0] + Rm[2] * zm, cy = Tm[1] + Rm[5] * zm, cz = Tm[2] + Rm[8] * zm, d = Math.hypot(cx - e[0], cy - e[1], cz - e[2]);
    if (d > 9000) return 0;
    const pxm = (cam.fl || 1000) / Math.max(1, d), nz = Math.max(4, Math.min(44, Math.round((z1 - z0) * pxm / 5)));
    const mv = Math.min(1, .25 + Math.abs(P.v[1]) * .5 + Math.hypot(P.w[0], P.w[1], P.w[2]) * 6 + (t - S.lastBreak < 20 ? .3 : 0));
    const NA = 7, tq = Math.floor(t * 7);
    let n = 0;
    for (let i = 0; i < nz; i++) {
      const z = z0 + (i + .5) / nz * (z1 - z0), b = Math.max(.2, H.beam(z)), k = H.keel(z), dk = Math.max(2, H.deck(z));
      // round the section: deck edge, down the side, round the bilge to the keel, both sides (world y and x, z)
      let m = 0;
      for (let sd = -1; sd <= 1; sd += 2) for (let j = 0; j <= NA; j++) {
        const f = j / NA, y = dk - (dk + k) * f, x = sd * (y >= 0 ? b : H.breadth(z, y));
        const o = m * 3;
        WL[o] = Tm[0] + Rm[0] * x + Rm[1] * y + Rm[2] * z; WL[o + 1] = Tm[1] + Rm[3] * x + Rm[4] * y + Rm[5] * z; WL[o + 2] = Tm[2] + Rm[6] * x + Rm[7] * y + Rm[8] * z;
        m++;
      }
      const yw = sea(WL[0], WL[2]);
      for (let q = 0; q < m - 1; q++) {
        if (q === NA) continue;                                   // (the two sides are not joined across the deck)
        const a0 = WL[q * 3 + 1] - yw, a1 = WL[q * 3 + 4] - yw;
        if (a0 * a1 > 0) continue;
        const u = a0 / (a0 - a1 || 1e-6), x = WL[q * 3] + (WL[q * 3 + 3] - WL[q * 3]) * u, zz = WL[q * 3 + 2] + (WL[q * 3 + 5] - WL[q * 3 + 2]) * u;
        const nd = pxm > 1.5 ? 4 : 2;
        for (let r = 0; r < nd; r++) {
          const h1 = hsh(i * 31 + q * 7 + r, tq + S.seed), h2 = hsh(i * 17 + q * 3 + r, tq * 3 + S.seed), sp = (1 + 3 * mv) * (h1 - .5);
          fx.dotXYZ(x + sp * Rm[0] + (h2 - .5) * 2, yw + .2 + .8 * mv * h2 * h2, zz + sp * Rm[6] + (h1 - .5) * 2, pxm > 3 ? 2 : 1.2, 234, 238, 234, (.35 + .55 * mv) * (.5 + .5 * h2), 'max');
          n++;
        }
      }
    }
    return n;
  }
  const FE = [0, 0, 0];
  function drawBreak(S, B, t, a) {
    const age = t - B.t0, c = B.cut;
    let n = 0, heat = heatOf(c, t);
    // the break's point on the water: the midpoint of the two torn ends' waterline, as each piece is drawn now
    let wx = 0, wz = 0, nw = 0, hdg = 0, open = 0, top = -1e9;
    for (const P of [B.A, B.B]) {
      if (P.sunk) continue;
      poseOf(P, a, Tm, Rm);
      const x = Tm[0] + Rm[2] * c.z, y = Tm[1] + Rm[5] * c.z, z = Tm[2] + Rm[8] * c.z;
      wx += x; wz += z; nw++; hdg = Math.atan2(Rm[2], Rm[8]);
      open = Math.max(open, P === B.A ? P.open1 || 0 : P.open0 || 0);
      if (y + S.H.deck(c.z) > top) { FE[0] = x; FE[1] = y; FE[2] = z; }   // (the fire burns on the torn end standing highest)
      top = Math.max(top, y + S.H.deck(c.z));
      C5[3] = Rm[0]; C5[4] = Rm[6];
    }
    if (nw) { B.wp[0] = wx / nw; B.wp[2] = wz / nw; }
    const w = B.wp;
    // the water rushing in while the open ends still take it
    const fl = (() => { let m = 0; for (const P of [B.A, B.B]) { const i = P === B.A ? P.i1 : P.i0; m = Math.max(m, 1 - Math.min(S.flood[i * 2], S.flood[i * 2 + 1])); } return m; })();
    const k = nw ? Math.min(1, open * 1.5) * (.25 + .75 * fl) : 0;
    n += bfx.drawFoam(t, S.H.beam(c.z) * 2, w, hdg, k, age, B.seed, sea);
    // steam off the hot steel going under
    C5[0] = w[0]; C5[1] = sea(w[0], w[2]); C5[2] = w[2];
    n += bfx.drawSteam(t, C5, S.H.beam(c.z) * 2, heat * Math.min(1, open * 2 + .1), B.seed + 5, WIND);
    // the plating still holding them tearing through: sparks grinding out of the seam while the hinge carries its load
    if (B.J && !B.J.gone && !B.A.sunk) {
      const J = B.J, P = B.A, cam = R.camera;
      poseOf(P, a, Tm, Rm);
      const hy = Tm[1] + Rm[3] * 0 + Rm[4] * J.hm[1] + Rm[5] * c.z;
      const dd = Math.hypot(Tm[0] + Rm[2] * c.z - cam.eye[0], hy - cam.eye[1], Tm[2] + Rm[8] * c.z - cam.eye[2]);
      if (hy > sea(w[0], w[2]) - .5 && dd < 6000) {
        B.grind += Math.max(0, game.dtSim || 0) * (60 + 140 * Math.min(1, J.load / (P.m * 2)));
        const b = S.H.beam(c.z) * .95;
        let k = 0;
        while (B.grind >= 1 && k < 24) {
          B.grind -= 1; k++;
          const q = hsh(B.seed + k, Math.floor(t * 50)), x = (q * 2 - 1) * b, y = J.hm[1];
          const px = Tm[0] + Rm[0] * x + Rm[1] * y + Rm[2] * c.z, py = Tm[1] + Rm[3] * x + Rm[4] * y + Rm[5] * c.z, pz = Tm[2] + Rm[6] * x + Rm[7] * y + Rm[8] * c.z;
          const u1 = hsh(k * 7 + 1, Math.floor(t * 50) + B.seed), u2 = hsh(k * 11 + 3, Math.floor(t * 50) + B.seed), sp = 6 + 14 * u1;
          bfx.spark(t, px, py, pz, (u2 - .5) * sp, sp * (.3 + .7 * u1), (hsh(k * 13, Math.floor(t * 50)) - .5) * sp);
        }
        if (B.grind > 1) B.grind = 0;
      }
    }
    // the slick, drifting from where she broke
    n += bfx.drawSlick(t, B.slick, B.t0, S.H.L, B.seed + 9, WIND, sea, 1 - sat((t - B.t0 - 420) / 120));
    // the fire in the break: above the water while the torn ends are up
    if (B.F) {
      const up = top > 1.5 && !S.done;
      // (on a torn end, not the middle of the gap between the pieces: no flames over open water, QA D11)
      B.F.follow(sim.t, [FE[0], Math.max(.5, top - 2), FE[2]], hdg, up ? Math.max(.25, heat) : 0);
      if (!up && age > 30) { B.F.stop(sim.t); B.F = null; }
    }
    return n;
  }
  /* the fires scars.js seats at the holes follow the unit's main piece (game.unitPose); a hole on another piece:
     the fire there instead */
  function fixFires(S) {
    const sc = S.scars;
    if (!sc || !sc.list || S.pieces.length < 2) return;
    const a = S.h > 0 ? sat((game.t - S.t) / S.h) : 1;
    for (const H of sc.list) {
      const F = H.fire;
      if (!F) continue;
      const i = secAt(S, H.z), P = pieceOf(S, i);
      if (!P || P === S.main) continue;
      poseOf(P, a, Tm, Rm);
      const deck = H.ny > .7, off = H.r * (deck ? .15 : .5), up = deck ? 0 : H.r * .55;
      const lx = H.x + H.nx * off, ly = H.y + H.ny * off + up, lz = H.z + H.nz * off;
      const x = Tm[0] + Rm[0] * lx + Rm[1] * ly + Rm[2] * lz, y = Tm[1] + Rm[3] * lx + Rm[4] * ly + Rm[5] * lz, z = Tm[2] + Rm[6] * lx + Rm[7] * ly + Rm[8] * lz;
      // the puffs laid since the last frame at the main piece's place: moved here
      const Rr = F.R, cap = F.cap, nE = F.nE, t0 = sim.t - .8;
      for (let q = 1; q <= Math.min(4, nE); q++) { const o = ((nE - q) % cap) * 5; if (Rr[o] < t0) break; Rr[o + 1] = x; Rr[o + 2] = y; Rr[o + 3] = z; }
      F.pos[0] = x; F.pos[1] = y; F.pos[2] = z; F.hdg = Math.atan2(Rm[2], Rm[8]);
      if (y < -.4) F.k = 0;
    }
  }

  /* the fx system's fire and sinking effects for a lost ship (fx/index.js lays them on 'destroyed' and has them follow
     the sim's unit): taken over, so they burn and boil on the hull as this system has her */
  function fxOf(S) {
    const f = fxSys();
    if (f && game.t - S.t0 < 3) {
      if (!S.fxFire && f.fires && f.fires.get(S.id)) { S.fxFire = f.fires.get(S.id); f.fires.delete(S.id); }
      if (!S.fxSink && f.sinks && f.sinks.get(S.id)) { S.fxSink = f.sinks.get(S.id); f.sinks.delete(S.id); }
    }
    const P = S.main, p = S.pose;
    if (S.fxFire) {
      const up = P && !P.sunk && !S.done ? sat((P.top - 1) / 5) : 0;
      S.fxFire.k = up;
      S.fxFire.follow(sim.t, p.pos, p.hdg, S.vis ? up : 0);
      if (S.done) { S.fxFire.stop(sim.t); S.fxFire = null; }
    }
    if (S.fxSink) {
      let wet = 0, n = 0; for (const Q of S.pieces) { wet += Q.sunk ? 1 : Math.min(1, Q.wetK * 1.4); n++; }
      S.fxSink.follow(p.pos, p.hdg, .1 + .85 * (n ? wet / n : 1));
    }
  }

  /* ------------------------------------------------------------ the system */
  const sys = {
    name: 'structure', priority: 11.5, stats, ships, dbg,
    draws(id) { const S = ships.get(id); return !!S && !S.done; },
    pose(id) { const S = ships.get(id); return S ? S.pose : null; },
    of(id) { return ships.get(id) || null; },
    drop(id) { const S = ships.get(id); if (!S) return; for (const B of S.breaks) if (B.F) { B.F.stop(sim.t); const f = fxSys(); const i = f && f.fx ? f.fx.indexOf(B.F) : -1; if (i >= 0) f.fx.splice(i, 1); } ships.delete(id); hist.delete(id); },
    /* tests / console: a charge of kg at a model point of a unit ({ x, y, z, kg, under }) */
    /* the blast solver's result for the hit at sim time t (game/src/blast/system.js): { x, y, z (the hole's middle, model),
       A (torn skin, m^2), below (of it under the water), frames (frame lines torn), work (plastic work, J), W } */
    refine(id, t, o) {
      const S = ships.get(id), L = S ? null : hist.get(id);
      const match = h => Math.abs(h.t - t) < 1e-6 && Math.abs(h.z - o.z) < 12;
      const h = L ? L.find(match) : S ? (S.hitsSeen || []).find(match) : null;
      if (!h) return false;
      const was = { r: h.r, kf: h.kf || 1, dent: h.dent };
      h.r = Math.max(.15, Math.sqrt(Math.max(0, o.A) / Math.PI));
      h.kf = 1 + .12 * Math.min(8, o.frames || 0) + Math.min(.5, (o.work || 0) / 2e7);
      h.dent = !(o.A > .02);
      if (o.y !== undefined) h.y = Math.min(h.y, o.y);
      h.solved = true;
      if (S) {
        // taken over already: the girder gets the difference, the holes the solved size
        const old = Object.assign({}, h, was);
        for (let j = 1; j < S.n; j++) S.str[j] = Math.max(0, Math.min(1, S.str[j] + lossAt(S, old, S.L.zc[j]) - lossAt(S, h, S.L.zc[j])));
        setCaps(S);
        if (h.dent) S.holes = S.holes.filter(q => q.h !== h);
        else { for (const q of S.holes) if (q.h === h) q.r = h.r * .8; if (was.dent) addHole(S, h); }
        for (let j = 1; j < S.n; j++) if (S.str[j] < .02 && !S.pend) { S.pend = { j, t: game.t + .2 }; break; }
      }
      return true;
    },
    /* the drawn pose of the piece of a broken ship that holds model station z: { R (3x3 row-major), T } (null: not taken over) */
    poseAt(id, z) {
      const S = ships.get(id); if (!S || S.done || !S.pieces.length) return null;
      const P = pieceOf(S, secAt(S, z)); if (!P || P.sunk) return null;
      const a = S.h > 0 ? sat((game.t - S.t) / S.h) : 1, Tq = [0, 0, 0], Rq = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      poseOf(P, a, Tq, Rq);
      return { R: Rq, T: Tq };
    },
    hit(id, o) {
      const u = sim.units.get(id); if (!u) return;
      const h = { x: o.x || 0, y: o.y === undefined ? 0 : o.y, z: o.z || 0, r: holeR(u.def, o.kg || 250, !!o.under), W: o.kg || 250, under: !!o.under, t: sim.t };
      const S = ships.get(id);
      if (S) { damageGirder(S, h); addHole(S, h); for (let j = 1; j < S.n; j++) if (S.str[j] < .02 && !S.pend) { S.pend = { j, t: game.t + .2 }; break; } }
      else { let L = hist.get(id); if (!L) hist.set(id, L = []); L.push(h); }
    },
    init() {
      game.structure = sys;
      // a ship taken over answers for herself: her main piece
      game.unitPose = (u, alpha) => { const S = ships.get(u.id); return S && !S.done && S.u === u ? S.pose : base(u, alpha); };
      const w = (sim.weather && sim.weather.wind) || (game.weather && game.weather.wind);
      if (w) { WIND[0] = w[0] || 0; WIND[1] = w.length > 2 ? w[2] : w[1] || 0; }
      bus.on('weather', ww => { if (ww && ww.wind) { WIND[0] = ww.wind[0] || 0; WIND[1] = ww.wind[1] || 0; } });
    },
    onEvent(e) {
      switch (e.type) {
        case 'hit': try { onHit(e); } catch (err) { console.error('structure: hit', err); } return;
        case 'destroyed': { const u = sim.units.get(e.unit); if (u) try { takeover(u, e); } catch (err) { console.error('structure: takeover', err); } return; }
        case 'cookoff': try { cookoff(e); } catch (err) { console.error('structure: cookoff', err); } return;
        case 'removed': { const S = ships.get(e.unit); if (S) S.gone = true; else hist.delete(e.unit); return; }
        default: return;
      }
    },
    update() {
      if (!ships.size) return;
      stepAll();
      for (const S of ships.values()) {
        if (S.done && game.t - S.doneT > 40) { ships.delete(S.id); continue; }
        setPose(S, S.h > 0 ? sat((game.t - S.t) / S.h) : 1);
        fixFires(S);
        fxOf(S);
      }
      stats.ships = ships.size; stats.pieces = 0; for (const S of ships.values()) stats.pieces += S.pieces.length;
    },
    draw3d(frame) {
      if (!ships.size || R.pcOff) return;
      const t0 = performance.now();
      stats.dots = drawShips(frame);
      stats.drawMs = performance.now() - t0;
    },
    dispose() { for (const id of [...ships.keys()]) sys.drop(id); if (game.unitPose !== base) game.unitPose = base; if (game.structure === sys) game.structure = null; },
  };
  return sys;
}
