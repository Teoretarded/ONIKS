/* Blast lab core (dev/lab): the range, the target, the shot, the clock, the telemetry and the report. The UI
   (dev/lab/index.js) and the console (window.LAB) both drive it.

   The range: lab.html (?mode=lab): an empty sim (no forces, no AI, no fog), calm sea. One target at a time, at a spot
   of open water ~2.5 km from any land (land units on open ground near the coast side's spawn). A re-run puts a fresh
   one of the type at the next of four spots 1.6 km apart, so the smoke and the wreck of the last shot are never in
   the picture; every view is in the target's model frame, so the picture does not move.

   The shot (direct): the game's own hit (the sim's 'hit' event, sim/damage.js applyDamage, scars.js / blast / fx /
   debris / structure as in a match) at a model-frame point, the round coming in along `from` at its real speed. It
   lands on a sim tick `preroll` seconds after FIRE, the round drawn on its line until then (index.js). Overrides are
   set on the game's own tables for the length of the hit (scars WH / FUZE, blast TNT, the sim's CHARGE, the blast's
   fuze delay) and put back. The sim's damage rolls are reseeded for each shot from its seed, the blast's steel
   scatter is seeded by the impact's geometry: a re-run of a shot is the same shot.

   The shot (mission): a shooter of the munition's own type at a range and bearing, the round launched by the sim
   (weapons.js launch: its own flight, guidance, the target's defences if they are left on), the sim run ahead to a
   few seconds out, then live in slow motion; the clock stops at the hit (or reports the miss / the intercept).

   The clock: tau = game.t - the hit's sim time (negative before it). Frame steps run the game at x1 for exactly the
   step, then hold the pause until every patch the GPU solver is running has reached the time shown (the solver never
   runs past it: a plate's state at tau is the solve's, whatever the machine). A step back is a re-run to that tau. */
import { applyDamage } from '../../sim/damage.js';
import { partNear } from '../../sim/bodies.js';
import { launch } from '../../sim/weapons.js';
import { rng as mkRng } from '../../sim/rand.js';
import { attitudeM } from '../../game/debris/math.js';
import { canPlace, removeUnits } from '../../game/sandbox.js';
import { WH, FUZE } from '../../game/scars.js';
import { TNT, tntOf, fireR, shockR } from '../../blast/phys.js';
import { CHARGE, chargeOf } from '../../data/ship_systems.js';
import { modelDots, dotsReady } from '../../blast/support.js';
import { CASES } from '../blast_qa.js';

const DT = .05;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
let chan = null; const yq = [];
/* yield without timers (a hidden page throttles them) */
export function yieldNow() {
  if (!chan) { chan = new MessageChannel(); chan.port1.onmessage = () => { const f = yq.shift(); f && f(); }; }
  return new Promise(r => { yq.push(r); chan.port2.postMessage(0); });
}

export function createCore(game, O) {
  const sim = game.sim, R = game.R, UNITS = game.UNITS, PROJ = game.PROJ;
  const L = {
    type: 'ddg', id: null, hdg: 0, spotK: 0, side: 'stbd',
    model: 'dots',            // the picture: 'dots' (the game's model + the GPU blast patch) | 'vox' (the voxel prototype, src/vox)
    kind: 'oniks',
    // overrides (null: the game's own value)
    ov: { tnt: null, wh: null, fuze: null, delay: null, standoff: null, speed: null, dmg: null, simDmg: true },
    aim: { loc: [10, 4, 0], from: [1, .05, 0], preset: 'side' },
    preroll: .12,
    mission: { shooter: null, range: 0, bearing: 90, defend: false, lead: 2.5 },
    shot: null,
    tl: [], ev: [], qa: null, status: '', busy: 0, frameMs: 0,   // frameMs: the real time between the last two frames (index.js)
  };
  let base = null;

  /* ------------------------------------------------------------ spots */
  function seaClear(x, z, r) {
    const m = game.map;
    if (Math.abs(x) > m.W / 2 - r - 500 || Math.abs(z) > m.H / 2 - r - 500) return false;
    for (const rr of [0, r * .4, r * .75, r]) for (let k = 0; k < (rr ? 16 : 1); k++) { const a = k / 16 * 2 * Math.PI; if (m.h(x + rr * Math.sin(a), z + rr * Math.cos(a)) > -12) return false; }
    return true;
  }
  function seaBase() {
    if (base) return base;
    const m = game.map, s = (m.spawns && m.spawns.fleet) || { x: 0, z: 0 };
    for (let r = 0; r < 60000 && !base; r += 1500) for (let k = 0; k < (r ? 24 : 1); k++) {
      const a = k / 24 * 2 * Math.PI, x = s.x + r * Math.sin(a), z = s.z + r * Math.cos(a);
      if (seaClear(x, z, 9000) && canPlace(game, 'carrier', x, z)) { base = [x, z]; break; }
    }
    if (!base) for (let r = 0; r < 60000 && !base; r += 1500) for (let k = 0; k < (r ? 24 : 1); k++) {
      const a = k / 24 * 2 * Math.PI, x = s.x + r * Math.sin(a), z = s.z + r * Math.cos(a);
      if (seaClear(x, z, 2500)) { base = [x, z]; break; }
    }
    return base || (base = [s.x, s.z]);
  }
  function spotFor(type, k) {
    const d = UNITS[type], [bx, bz] = seaBase();
    if (d.domain === 'land') {
      const s = (game.map.spawns && game.map.spawns.coast) || { x: 0, z: 0 };
      for (let r = 0; r < 30000; r += 250) for (let q = 0; q < (r ? 20 : 1); q++) {
        const a = (q + k * .37) / 20 * 2 * Math.PI, x = s.x + r * Math.sin(a), z = s.z + r * Math.cos(a);
        if (canPlace(game, type, x, z)) return [x, z];
      }
      return [s.x, s.z];
    }
    const off = [[0, 0], [1600, 0], [0, 1600], [1600, 1600]][k % 4];
    const x = bx + off[0], z = bz + off[1];
    return canPlace(game, type, x, z) || d.domain === 'air' ? [x, z] : [bx, bz];
  }

  /* ------------------------------------------------------------ the target */
  const unit = () => L.id !== null ? sim.units.get(L.id) || null : null;
  function clearAll() {
    const ids = [];
    for (const u of sim.units.values()) ids.push(u.id);
    for (const id of ids) { try { game.blast && game.blast.dropUnit(id); } catch (e) { /* */ } try { game.structure && game.structure.drop(id); } catch (e) { /* */ } }
    if (ids.length) removeUnits(game, ids);
    for (const p of [...sim.projectiles.keys()]) sim.projectiles.delete(p);
    L.id = null;
  }
  function spawn(type, o = {}) {
    type = type || L.type;
    if (!UNITS[type]) throw new Error('lab: unknown unit type ' + type);
    clearAll();
    L.type = type;
    if (o.hdg !== undefined) L.hdg = o.hdg;
    const [x, z] = spotFor(type, L.spotK++);
    const d = UNITS[type];
    const u = sim.spawn(type, d.side || 'coast', x, z, { hdg: L.hdg, deployed: true });
    // the target picks no targets of its own (sim: hold = free to pick; its defences fire on their own, mission only)
    u.hold = false;
    game.dispatchEvents();
    L.id = u.id;
    L.shot = null; L.tl.length = 0; L.ev.length = 0; L.qa = null;
    return u;
  }

  /* ------------------------------------------------------------ frames */
  const pose = u => game.unitPose ? game.unitPose(u) : { pos: u.pos, hdg: u.hdg, pitch: 0, roll: 0 };
  const Mo = new Array(9);
  function frameOf(u) { const p = pose(u); attitudeM(p.hdg, p.pitch || 0, p.roll || 0, Mo); return { p: p.pos, M: Mo.slice() }; }
  /* model frame -> world (the unit's drawn pose) */
  function toWorld(u, q, F) {
    F = F || frameOf(u); const M = F.M, p = F.p;
    return [p[0] + M[0] * q[0] + M[1] * q[1] + M[2] * q[2], p[1] + M[3] * q[0] + M[4] * q[1] + M[5] * q[2], p[2] + M[6] * q[0] + M[7] * q[1] + M[8] * q[2]];
  }
  function dirToWorld(u, d, F) { F = F || frameOf(u); const M = F.M; return [M[0] * d[0] + M[1] * d[1] + M[2] * d[2], M[3] * d[0] + M[4] * d[1] + M[5] * d[2], M[6] * d[0] + M[7] * d[1] + M[8] * d[2]]; }
  function toModel(u, w, F) {
    F = F || frameOf(u); const M = F.M, p = F.p, dx = w[0] - p[0], dy = w[1] - p[1], dz = w[2] - p[2];
    return [M[0] * dx + M[3] * dy + M[6] * dz, M[1] * dx + M[4] * dy + M[7] * dz, M[2] * dx + M[5] * dy + M[8] * dz];
  }
  function dirToModel(u, d, F) { F = F || frameOf(u); const M = F.M; return [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]]; }

  /* ------------------------------------------------------------ picking (the model's own dots, model frame) */
  function dotsOf(u) {
    let ent = null; try { ent = R.models.get(u.def.model); } catch (e) { ent = null; }
    // (not before every outside part is sampled: the cloud is built once and kept, for the blast system too)
    if (!ent || !dotsReady(ent)) return null;
    try { const Md = modelDots(ent); return Md && Md.n ? Md : null; } catch (e) { return null; }
  }
  /* the target's model sampled (every outside part): picking and the presets work from here on */
  function ready() { const u = unit(); if (!u) return false; let ent = null; try { ent = R.models.get(u.def.model); } catch (e) { ent = null; } return !!(ent && dotsReady(ent)); }
  /* the first outside dot of the model along a ray (model frame): { p, n, part, t } or null */
  function cast(u, o, d) {
    const Md = dotsOf(u); if (!Md) return null;
    const D = Md.D; let best = null, bt = 1e9;
    for (let i = 0; i < Md.n; i++) {
      const q = 7 * i; if (Md.ins[D[q + 6]]) continue;
      const vx = D[q] - o[0], vy = D[q + 1] - o[1], vz = D[q + 2] - o[2], t = vx * d[0] + vy * d[1] + vz * d[2];
      if (t < 0 || t > bt) continue;
      const px = vx - d[0] * t, py = vy - d[1] * t, pz = vz - d[2] * t, r = Math.max(.22, t * .0025);
      if (px * px + py * py + pz * pz > r * r) continue;
      // (the side of a dot facing the ray: a back face is not where a round strikes)
      if (D[q + 3] * d[0] + D[q + 4] * d[1] + D[q + 5] * d[2] > .35) continue;
      bt = t; best = q;
    }
    if (best === null) return null;
    return { p: [D[best], D[best + 1], D[best + 2]], n: [D[best + 3], D[best + 4], D[best + 5]], part: Md.parts[D[best + 6]], t: bt };
  }
  /* a screen point (CSS px) -> the model point there and the round's way in (from the camera) */
  function pickScreen(sx, sy) {
    const u = unit(); if (!u) return null;
    const cam = R.camera, ray = cam.ray(sx, sy), F = frameOf(u);
    const o = toModel(u, ray.o, F), d = norm(dirToModel(u, ray.d, F));
    const h = cast(u, o, d); if (!h) return null;
    return Object.assign(h, { from: [-d[0], -d[1], -d[2]] });
  }
  /* aim presets: a battery case of this type (dev/blast_qa.js), or a generic aim cast on the model */
  function presets(type = L.type) {
    const d = UNITS[type], out = [];
    const sz = d.size || [100, 12, 20], Lh = sz[0], B = sz[1], H = sz[2] || 20;
    const sea = d.domain === 'sea';
    const G = sea ? [
      ['side', 'Side amidships', [0, 4, 0], [1, .05, 0]],
      ['bow', 'Bow side', [0, 5, Lh * .36], [1, .05, .12]],
      ['stern', 'Stern quarter', [0, 3, -Lh * .4], [1, .05, -.1]],
      ['wl', 'Waterline', [0, .8, -Lh * .06], [1, .02, 0]],
      ['below', 'Below the waterline', [0, -1.2, -Lh * .08], [1, -.05, 0], -1.2],
      ['house', 'Superstructure', [0, H * .45, Lh * .05], [1, .08, 0]],
      ['deckF', 'Deck forward', [0, 60, Lh * .3], [.25, 1, .35]],
      ['deckA', 'Deck aft', [0, 60, -Lh * .3], [.2, 1, -.3]],
      ['top', 'Plunging, amidships', [0, 60, 0], [.15, 1, .1]],
    ] : [
      ['side', 'Side', [0, H * .4, 0], [1, .1, 0]],
      ['front', 'Front', [0, H * .4, Lh * .5], [.1, .1, 1]],
      ['rear', 'Rear', [0, H * .4, -Lh * .5], [.1, .1, -1]],
      ['top', 'Top attack', [0, 30, 0], [.2, 1, .1]],
    ];
    for (const [id, label, at, from, yForce] of G) out.push({ id, label, at, from, yForce, B });
    for (const c of CASES) if (c.type === type && c.loc && c.from) out.push({ id: 'qa:' + c.id, label: 'QA ' + c.id, loc: c.loc, from: c.from, kind: c.kind, qa: true });
    return out;
  }
  /* aim at a preset: cast from outside along its way in (mirrored for the port side) */
  function aimPreset(id) {
    const u = unit(); if (!u) return null;
    const P = presets(u.type).find(p => p.id === id); if (!P) return null;
    if (P.qa) { L.aim = { loc: P.loc.slice(), from: norm(P.from), preset: id }; if (P.kind && PROJ[P.kind] || P.kind === 'shell') L.kind = P.kind; return L.aim; }
    const sx = L.side === 'port' ? -1 : 1, from = norm([P.from[0] * sx, P.from[1], P.from[2]]);
    // (under the water the model has no dots: the side is found at the waterline, the aim then taken down to the depth)
    const at = [P.at[0] * sx, P.yForce !== undefined ? .6 : P.at[1], P.at[2]];
    // (a deck aim: cast down over the point; a side aim: from well outside the hull, at the aimed height)
    const o = [at[0] + from[0] * 200, (Math.abs(from[1]) > .6 ? 200 * from[1] : at[1] + from[1] * 200), at[2] + from[2] * 200];
    if (Math.abs(from[1]) <= .6) o[1] = Math.max(o[1], .3);
    const d = norm([at[0] - o[0], (Math.abs(from[1]) > .6 ? 0 : at[1]) - o[1], at[2] - o[2]]);
    const h = cast(u, o, d);
    const loc = h ? h.p.slice() : at.slice();
    if (P.yForce !== undefined) loc[1] = P.yForce;
    L.aim = { loc, from, preset: id, part: h && h.part };
    return L.aim;
  }

  /* ------------------------------------------------------------ the shot */
  /* the overrides on the game's own tables, for the length of the hit; returns the undo */
  function override(kind, ov) {
    const saved = [];
    const set = (obj, k, v) => { saved.push([obj, k, obj[k], Object.prototype.hasOwnProperty.call(obj, k)]); obj[k] = v; };
    const C0 = Object.assign({}, CHARGE[kind] || chargeOf(kind, (PROJ[kind] && PROJ[kind].dmg) || 10));
    let cOv = false;
    if (ov.tnt !== null && ov.tnt !== undefined) { set(TNT, kind, +ov.tnt); C0.W = +ov.tnt; cOv = true; }
    if (ov.wh !== null && ov.wh !== undefined) set(WH, kind, +ov.wh);
    if (ov.fuze) { set(FUZE, kind, ov.fuze); C0.fz = ov.fuze === 'gun' ? 'gun' : ov.fuze; cOv = true; }
    if (cOv) set(CHARGE, kind, C0);
    if (ov.delay !== null && ov.delay !== undefined && game.blast) set(game.blast.cfg, 'delay', +ov.delay);
    return () => { for (let i = saved.length - 1; i >= 0; i--) { const [o, k, v, had] = saved[i]; if (had) o[k] = v; else delete o[k]; } };
  }
  /* what the charge is, as the game will take it (overrides in) */
  function chargeInfo(kind = L.kind, ov = L.ov) {
    const P = PROJ[kind] || {}, wh = ov.wh !== null && ov.wh !== undefined ? +ov.wh : WH[kind] !== undefined ? WH[kind] : (P.dmg || 10) * 2.5;
    const fz = ov.fuze || FUZE[kind] || (wh < .3 ? 'gun' : 'out');
    const W = ov.tnt !== null && ov.tnt !== undefined ? +ov.tnt : tntOf(kind, wh);
    return { kind, name: P.name || kind, cls: P.cls || 'GUN', wh, W, fz, delay: ov.delay !== null && ov.delay !== undefined ? +ov.delay : 1.6,
      standoff: +(ov.standoff || 0), speed: +(ov.speed || P.speed || 300), dmg: ov.dmg !== null && ov.dmg !== undefined ? +ov.dmg : (P.dmg || 10), fireR: fireR(Math.max(W, .01)) };
  }
  function seedOf(s) { let h = 2166136261; for (const v of [...String(s.type + s.kind)].map(c => c.charCodeAt(0)).concat(s.loc.map(x => Math.round(x * 10)), s.from.map(x => Math.round(x * 100)))) h = Math.imul(h ^ (v & 0xffff), 16777619); return h >>> 0; }
  /* fire the shot at the aim (direct): lands `preroll` s from now, on a sim tick */
  function fire(o = {}) {
    const u = unit(); if (!u) throw new Error('lab: no target (LAB.target(type) first)');
    const pre = o.preroll !== undefined ? o.preroll : L.preroll;
    const n = Math.max(0, Math.round(pre / DT));
    const C = chargeInfo();
    const s = { mode: 'direct', type: u.type, id: u.id, kind: L.kind, loc: L.aim.loc.slice(), from: norm(L.aim.from), ov: Object.assign({}, L.ov), C,
      speed: C.speed, preroll: n * DT, tick: sim.tick + n, tHit: sim.t + n * DT, t0: null, pending: true, landed: null, patch: null, res: null, err: null };
    s.seed = o.seed !== undefined ? o.seed >>> 0 : seedOf(s);
    L.shot = s; L.tl.length = 0; L.ev.length = 0; L.qa = null;
    if (voxOn()) voxHit(u, s);
    if (!n) applyHit();
    return s;
  }
  /* ------------------------------------------------------------ the voxel prototype (src/vox) */
  const voxOn = (u = unit()) => !!(u && game.vox && game.vox.on(u.id));
  /* the hit as the voxel solver takes it, posted at FIRE: the solve starts `preroll` s before the round lands (the
     game knows where and when it will strike), so it is ahead of the picture (no frame waits on it) */
  function voxCharge(s) {
    const C = s.C, d = [-s.from[0], -s.from[1], -s.from[2]];
    const fz = C.fz === 'gun' ? 'out' : C.fz, so = +(s.ov.standoff || 0);
    const back = fz === 'in' ? -(C.delay || 1.6) : so > 0 ? so : fz === 'frag' ? 3 : .35;
    const at = [s.loc[0] - d[0] * back, s.loc[1] - d[1] * back, s.loc[2] - d[2] * back];
    return { C: at, entry: s.loc.slice(), dir: d, W: Math.max(.05, C.W), fuze: fz === 'in' ? 'in' : 'out', kind: s.kind, speed: C.speed, seed: s.seed, tHit: s.tHit };
  }
  function voxHit(u, s) {
    s.vox = voxCharge(s);
    try { game.vox.hit(u.id, s.vox); s.voxPost = performance.now(); } catch (e) { s.err = 'vox: ' + (e && e.message || e); }
  }
  // the hit lands on its sim tick, inside the sim's step (never a frame late at any rate)
  const step0 = sim.step.bind(sim);
  sim.step = function () { const r = step0(); const s = L.shot; if (s && s.pending && s.mode === 'direct' && sim.tick >= s.tick) applyHit(); return r; };
  function applyHit() {
    const s = L.shot; s.pending = false;
    const u = sim.units.get(s.id); if (!u) { s.err = 'target gone'; return; }
    sim.rng.dmg = mkRng(s.seed);
    const undo = override(s.kind, s.ov);
    const nb = game.blast ? game.blast.list(u.id).length : 0;
    try { s.res = strike(u, s); } catch (e) { s.err = String(e && e.message || e); console.error('lab: hit', e); }
    finally { undo(); }
    s.t0 = sim.t;
    afterHit(u, s, nb);
  }
  function afterHit(u, s, nb) {
    const L2 = game.blast ? game.blast.list(u.id) : [];
    s.patches = L2.slice(nb).map(B => B.id);
    s.patch = s.patches.length ? s.patches[0] : null;
    const S = game.scars && game.scars.last && game.scars.last(u.id);
    if (S && Number.isFinite(S.x)) s.landed = { at: [r2(S.x), r2(S.y), r2(S.z)], n: [r2(S.nx), r2(S.ny), r2(S.nz)], zone: S.zone, tmm: S.t, mark: S.kind, Weff: r2(S.W || 0), fz: S.fz, r: r2(S.r || 0), solved: !!S.bl };
  }
  /* the hit through the sim's own path (dev/scar_lab.js hit, with the standoff and the speed) */
  function strike(u, s) {
    const P = PROJ[s.kind] || { dmg: 20 };
    const F = frameOf(u), pos = toWorld(u, s.loc, F), f = s.from;
    const vw = dirToWorld(u, f, F), sp = s.speed;
    const vel = [-vw[0] * sp, -vw[1] * sp, -vw[2] * sp];
    const part = partNear(u.def, s.loc[0], s.loc[1], s.loc[2]) || u.def.partNames[0];
    const part2 = partNear(u.def, s.loc[0], s.loc[1], s.loc[2], part);
    const ev = { pos, target: u.id, kind: s.kind, side: u.side === 'coast' ? 'fleet' : 'coast', from: 0, part, vel };
    if (s.ov.standoff > 0) ev.blast = +s.ov.standoff;
    // (a torpedo goes off under the keel: scars / the sim take it there)
    if (P.torpedo) { ev.under = true; ev.depth = Math.max(2, -s.loc[1]); delete ev.vel; }
    // (the voxel picture: the model's scars, blast patch and fx are not asked; the sim's damage only if ticked)
    if (!voxOn(u)) sim.emit('hit', ev);
    if (s.ov.simDmg !== false) applyDamage(sim, u, s.C.dmg !== undefined ? s.C.dmg : P.dmg, null, { part, part2, pos });
    game.dispatchEvents();
    return { pos: pos.map(r2), part, hp: Math.round(u.hp), alive: u.alive };
  }

  /* ------------------------------------------------------------ the mission */
  function shootersOf(kind) {
    const out = [];
    for (const t in UNITS) { const d = UNITS[t]; for (const w in d.weapons || {}) { const W = d.weapons[w]; if (!W.gun && W.proj === kind) out.push({ type: t, w, domain: d.domain, name: d.name || t }); } }
    // (ships and batteries before aircraft: they need no flight plan)
    const rank = { sea: 0, land: 1, air: 2 };
    return out.sort((a, b) => rank[a.domain] - rank[b.domain]);
  }
  function rangeFor(kind) { const c = (PROJ[kind] || {}).cls; return { ASCM: 24000, LACM: 24000, ASM: 18000, ATGM: 2500, SHELL: 9000, SAM: 9000, AAM: 9000, TORP: 2500 }[c] || 8000; }
  async function mission(o = {}) {
    const u = unit(); if (!u) throw new Error('lab: no target');
    const kind = o.kind || L.kind, M = Object.assign(L.mission, o);
    const list = shootersOf(kind); if (!list.length) throw new Error('lab: nothing in the game fires ' + kind);
    const pick = list.find(c => c.type === M.shooter) || list[0];
    const R0 = M.range || rangeFor(kind), side = u.side === 'coast' ? 'fleet' : 'coast';
    // a spot for the shooter at the range on the bearing (model-free: world bearing from the target), the nearest
    // bearing and range that it can stand on
    // (a land shooter far out at sea: the nearest ground it can stand on beyond the range asked, out to 160 km)
    let at = null;
    const ranges = [1, .85, 1.2, .7, 1.5, .5].map(k => R0 * k);
    for (let r = R0 * 1.6; r <= 160000; r += 2000) ranges.push(r);
    for (const Rr of ranges) { for (let db = 0; db <= 180 && !at; db += 5) for (const sg of db ? [1, -1] : [1]) {
      const b = (M.bearing + sg * db) * Math.PI / 180, x = u.pos[0] + Math.sin(b) * Rr, z = u.pos[2] + Math.cos(b) * Rr;
      if (canPlace(game, pick.type, x, z)) { at = [x, z]; break; } } if (at) break; }
    if (!at) throw new Error('lab: no spot for a ' + pick.type + ' at ' + Math.round(R0 / 1000) + ' km');
    const sh = sim.spawn(pick.type, side, at[0], at[1], { hdg: Math.atan2(u.pos[0] - at[0], u.pos[2] - at[1]), deployed: true });
    game.dispatchEvents();
    sh.hold = false;
    for (const k in sh.ammo) if (k !== pick.w) sh.ammo[k] = 0;
    if (!M.defend) for (const k in u.ammo) u.ammo[k] = 0;
    const W = sh.def.weapons[pick.w];
    sh.ammo[pick.w] = Math.max(1, sh.ammo[pick.w] || 0);
    const n0 = sim.nextId;
    let p = null;
    try { p = launch(sim, sh, W, u.id, 'unit', u.pos.slice()); } catch (e) { throw new Error('lab: launch failed: ' + (e && e.message)); }
    game.dispatchEvents();
    sh.ammo[pick.w] = 0;   // (one round: the shooter fires nothing more)
    if (!p) for (const q of sim.projectiles.values()) if (q.from === sh.id && q.id >= n0) p = q;
    const C = chargeInfo(kind);
    const s = { mode: 'mission', type: u.type, id: u.id, kind, shooter: { type: pick.type, id: sh.id, w: pick.w, km: r2(Math.hypot(at[0] - u.pos[0], at[1] - u.pos[2]) / 1000) },
      proj: p ? p.id : null, ov: Object.assign({}, L.ov), C, t0: null, tLaunch: sim.t, pending: true, landed: null, patch: null, err: p ? null : 'no round', outcome: null, seed: 0, loc: null, from: null };
    L.shot = s; L.tl.length = 0; L.ev.length = 0; L.qa = null;
    if (!p) return s;
    // the sim alone until the round is `lead` s out (or gone)
    const lead = M.lead;
    const t0 = performance.now();
    for (let i = 0; i < 20 * 1800; i++) {
      const q = sim.projectiles.get(s.proj);
      if (!q || !q.alive) break;
      const dx = q.pos[0] - u.pos[0], dy = q.pos[1] - u.pos[1], dz = q.pos[2] - u.pos[2], v = Math.max(50, Math.hypot(q.vel[0], q.vel[1], q.vel[2]));
      if (Math.hypot(dx, dy, dz) / v < lead || s.t0 !== null || s.outcome) break;
      sim.step(); game.dispatchEvents();
      if ((i & 255) === 255) { if (performance.now() - t0 > 40) { await yieldNow(); } }
    }
    s.ffTo = r2(sim.t - s.tLaunch);
    return s;
  }

  /* ------------------------------------------------------------ the clock */
  const shotT0 = () => { const s = L.shot; return !s ? null : s.t0 !== null ? s.t0 : s.mode === 'direct' ? s.tHit : null; };
  function tau() { const t0 = shotT0(); return t0 === null ? null : game.t - t0; }
  const patches = () => { const u = L.id; const B = game.blast; if (!B || !L.shot || !L.shot.patches) return []; return L.shot.patches.map(id => B.of(id)).filter(Boolean).concat(B.list(u).filter(b => !L.shot.patches.includes(b.id) && b.t0 >= (L.shot.t0 || 0) - 1e-6)); };
  function solverState() {
    if (voxOn() && L.shot && L.shot.vox) {
      const V = game.vox.state(L.id), t = tau();
      if (V.state === 'error') return { state: 'failed', behind: 0, err: V.err };
      const behind = t === null ? 0 : Math.max(0, t - V.tSolved);
      return { state: V.state === 'done' ? 'done' : behind > 2e-4 ? 'solving' : 'synced', behind, run: V.state === 'solving' ? 1 : 0, wait: 0, done: V.state === 'done' ? 1 : 0, fail: 0, vox: true };
    }
    const P = patches();
    if (!P.length) return { state: L.shot && L.shot.pending ? 'pending' : 'none', behind: 0 };
    let behind = 0, run = 0, wait = 0, done = 0, fail = 0;
    for (const B of P) {
      if (B.state === 'run' || B.state === 'wait') { run++; if (B.state === 'wait') wait++; behind = Math.max(behind, (B.tShow || 0) - (B.tSolve || 0)); }
      else if (B.state === 'done') done++; else if (B.state === 'fail') fail++;
    }
    return { state: run ? (behind > 2e-4 ? 'solving' : 'synced') : fail && !done ? 'failed' : 'done', behind, run, wait, done, fail };
  }
  // (a hidden page gets no animation frames and its timers run once a second: a frame drawn here, then ~16 ms of
  // real time given to the solver's worker through message yields, as the QA battery does)
  // (a page that is shown but not painted, e.g. a browser pane folded away, gets no frames either: after 120 ms
  // without one it is driven the same way)
  // (once a frame has been missed, the page is taken as not painting for the next 2 s: no 120 ms wait every frame)
  let unpainted = 0;
  async function nextFrame() {
    if (!document.hidden && performance.now() > unpainted) {
      let got = false; requestAnimationFrame(() => { got = true; });
      const a = performance.now();
      while (!got && performance.now() - a < 120) await yieldNow();
      if (got) return;
      unpainted = performance.now() + 2000;
    }
    const a = performance.now(); O.advance(0, 1);
    while (performance.now() - a < 16) await yieldNow();
  }
  /* hold until every running patch has reached the time shown (or ms passes; a stalled solve reports it) */
  async function sync(ms = 45000) {
    const t0 = performance.now(); let ok = 0, lastS = -1, still = 0;
    for (;;) {
      const st = solverState();
      if (st.state !== 'solving' && !(st.wait > 0)) { if (++ok >= 3) return true; } else ok = 0;
      const sNow = voxOn() ? game.vox.state(L.id).tSolved : patches().reduce((a, B) => a + (B.tSolve || 0), 0);
      if (sNow === lastS) still++; else { still = 0; lastS = sNow; }
      if (performance.now() - t0 > ms || still > (voxOn() ? 3000 : 600)) { L.status = 'solver did not reach the time shown'; return false; }
      await nextFrame();
    }
  }
  function setRate(r) {
    game.timeRate = r;
    if (game.paused) game.pause(false); else game.bus.emit('rate', { rate: r, paused: false, why: 'lab' });
  }
  /* the game at x1 for exactly dt of game time, then paused; synced to the solver */
  async function step(dt) {
    if (!(dt > 0)) { await sync(); return tau(); }
    L.busy++;
    try {
      const r = game.timeRate;
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(.1, left);
        game.paused = false; game.timeRate = 1;
        O.advance(h, 1);
        game.timeRate = r; game.paused = true;
        left -= h;
        if (left > 1e-9) await sync();
      }
      game.bus.emit('rate', { rate: game.timeRate, paused: true, why: 'lab' });
      await sync();
    } finally { L.busy--; }
    return tau();
  }
  /* go to tau (s): forward by steps; back by a re-run of the same shot */
  async function to(T, o = {}) {
    const s = L.shot; if (!s) throw new Error('lab: no shot');
    let t = tau();
    // (a mission's round still in flight: stepped in until it hits, misses or is shot down)
    if (t === null && s.mode === 'mission') {
      const t1 = sim.t + 120;
      while (s.t0 === null && !s.outcome && sim.t < t1) await step(.05);
      if (s.t0 === null) throw new Error('lab: no hit (' + (s.outcome || 'the round is still flying') + ')');
      t = tau();
    }
    if (t === null) t = -1e9;
    if (T < t - 1e-6) { await rerun(T); t = tau(); }
    const chunk = o.chunk || (T - t > .5 ? .05 : T - t);
    while (tau() < T - 1e-6) { await step(Math.min(chunk, T - tau())); if (o.onStep) o.onStep(tau()); }
    return tau();
  }
  /* the same shot again on a fresh target (a re-run back to tau T, when given) */
  async function rerun(T) {
    const s = L.shot; if (!s) throw new Error('lab: no shot');
    if (s.mode === 'mission') throw new Error('lab: a mission is not re-run (fire it again)');
    L.busy++;
    try {
      const keep = { kind: s.kind, loc: s.loc, from: s.from, ov: s.ov, seed: s.seed };
      const vox = L.model === 'vox';
      spawn(s.type);
      // (the model's dots and samples at the new spot: a few frames)
      for (let i = 0; i < 4; i++) await nextFrame();
      if (vox && game.vox) await game.vox.enable(L.id);
      L.kind = keep.kind; L.aim = Object.assign({}, L.aim, { loc: keep.loc.slice(), from: keep.from.slice() }); L.ov = Object.assign({}, keep.ov);
      const pre = Math.max(L.preroll, T !== undefined ? -T + DT : 0);
      game.pause(true);
      fire({ preroll: pre, seed: keep.seed });
    } finally { L.busy--; }
  }

  /* ------------------------------------------------------------ telemetry */
  function simState(u) {
    if (!u) return null;
    const out = { hp: Math.round(u.hp), hpMax: u.hpMax, alive: u.alive, flood: r3(u.flood || 0), fire: r2(u.fire || 0) };
    const S = u.ship;
    if (S && S.L) {
      const Ls = S.L, wet = [], fire = [];
      for (let c = 0; c < Ls.n; c++) { const cap = Ls.vol[c] * Ls.perm[c]; if (S.water[c] > .5) wet.push([Ls.ids[c], Math.round(100 * S.water[c] / Math.max(1, cap))]); if (S.fire[c] > 0) fire.push(Ls.ids[c]); }
      const out2 = S.sp ? S.sp.nodes.filter(n => !S.ok[n.i]).map(n => n.id) : [];
      Object.assign(out, { holes: (S.holes || []).map(h => ({ space: Ls.ids[h.c], at: [r2(h.x), r2(h.y), r2(h.z)], A: r2(h.A), sea: !!h.sea })), wet, fires: fire, out: out2,
        water: Math.round(S.w || 0), sink: r2(S.sink || 0), list: r2((S.list || 0) * 57.3), trim: r2((S.trim || 0) * 57.3) });
      out.holeA = r2(out.holes.reduce((a, h) => a + h.A, 0));
    }
    return out;
  }
  function sample() {
    const t = tau(); if (t === null) return null;
    const P = patches(), B = P[0], u = unit();
    const sum = k => P.reduce((a, b) => a + (b[k] || 0), 0);
    const bodies = game.blast && game.blast.bodies ? game.blast.bodies.list.filter(b => !b.gone && b.uid === L.id) : [];
    const fx = game.getSystem && game.getSystem('fx'), st = solverState();
    if (voxOn()) {
      const V = game.vox.state(L.id), m = V.metrics || {};
      return { tau: t, tSolve: Math.min(V.tSolved, 99), steps: m.steps || 0, state: st.state, torn: r3((m.tornShell || 0) * .0625), open: r3(m.openedOutsideM2 || 0), below: 0, set: 0, wallMs: Math.round(V.wall || 0),
        bodies: m.bodies || 0, bodyDots: m.fragments || 0, fxDots: 0, frameMs: r2(L.frameMs || 0), budget: 0, hp: u ? Math.round(u.hp) : 0, flood: u ? r3(u.flood || 0) : 0, alive: !!(u && u.alive), vox: true };
    }
    return { tau: t, tSolve: B ? B.tSolve || 0 : 0, steps: B ? B.steps || 0 : 0, state: st.state, torn: r3(sum('torn')), open: r3(sum('openM2')), below: r3(sum('below')),
      set: B ? Math.max(...P.map(b => b.setMax || 0)) : 0, wallMs: Math.round(sum('wallMs')), bodies: bodies.length, bodyDots: bodies.reduce((a, b) => a + (b.n || 0), 0),
      fxDots: fx && fx.stats ? fx.stats.dots : 0, frameMs: r2(L.frameMs || 0), budget: game.blast ? r2(game.blast.stats.budgetShell || game.blast.stats.budget || 0) : 0,
      hp: u ? Math.round(u.hp) : 0, flood: u ? r3(u.flood || 0) : 0, alive: !!(u && u.alive) };
  }
  let lastTau = null;
  function tick() {
    const t = tau();
    if (t === null || t === lastTau) return;
    if (lastTau !== null && t < lastTau - 1e-6) L.tl.length = 0;
    lastTau = t;
    const sm = sample(); if (!sm) return;
    L.tl.push(sm); if (L.tl.length > 20000) L.tl.splice(0, 5000);
  }
  /* the sim's events about the target and the round */
  function onEvent(e) {
    const s = L.shot; if (!s) return;
    const mine = e.unit === L.id || e.target === L.id || (s.proj !== undefined && s.proj !== null && e.proj === s.proj) || (s.shooter && (e.from === s.shooter.id || e.unit === s.shooter.id));
    if (!mine) return;
    if (s.mode === 'mission' && s.t0 === null && e.type === 'hit' && e.target === L.id) {
      const u = unit(); s.t0 = sim.t; s.pending = false; s.outcome = 'hit';
      if (u) { s.loc = toModel(u, e.pos).map(r2); s.from = e.vel ? norm(dirToModel(u, [-e.vel[0], -e.vel[1], -e.vel[2]])).map(r3) : null; }
      // (the lab sees the hit before scars / blast make its patch: read them once this dispatch is over)
      const nb = game.blast && u ? game.blast.list(u.id).length : 0;
      s.patches = []; setTimeout(() => { if (u) afterHit(u, s, nb); }, 0);
      if (L.onImpact) L.onImpact(e);
    }
    if (s.mode === 'mission' && s.t0 === null && e.type === 'splash' && e.proj === s.proj) { s.outcome = 'missed (' + (e.why || 'splash') + ')'; s.pending = false; if (L.onImpact) L.onImpact(e); }
    if (s.mode === 'mission' && e.type === 'intercept' && (e.proj === s.proj || e.target === s.proj)) s.outcome = 'intercepted';
    const t0 = shotT0();
    const brief = {};
    for (const k in e) { const v = e[k]; if (k === 'type' || v === undefined || v === null) continue; if (typeof v === 'number') brief[k] = r2(v); else if (typeof v === 'string' || typeof v === 'boolean') brief[k] = v; else if (Array.isArray(v) && v.length <= 4 && v.every(x => typeof x === 'number')) brief[k] = v.map(r2); }
    L.ev.push({ tau: t0 === null ? null : r3(sim.t - t0), t: r2(sim.t), type: e.type, e: brief });
    if (L.ev.length > 2000) L.ev.splice(0, 500);
  }

  /* ------------------------------------------------------------ the QA check and the report */
  async function qa() {
    try { const QM = await import('../../blast/qa.js'); L.qa = QM.check(O, { unit: L.id, settledOnly: false }); }
    catch (e) { L.qa = { ok: false, err: String(e && e.message || e) }; }
    return L.qa;
  }
  function patchInfo(B) {
    const sp = B.spec || {}, res = B.res || {};
    return { id: B.id, solver: sp.solver, state: B.state, err: B.err || null, kind: sp.kind, steps: B.steps || 0, tSolveMs: r2((B.tSolve || 0) * 1000), wallMs: Math.round(B.wallMs || 0),
      torn: r2(B.torn || 0), flap: r2(B.openM2 || 0), below: r2(B.below || 0), setMm: Math.round((B.setMax || 0) * 1000), byPlate: (B.byPlate || []).map(r2),
      framesTorn: res.framesTorn, plasticKJ: res.plastic !== undefined ? Math.round(res.plastic / 1000) : undefined,
      W: sp.charge && r2(sp.charge.W), chargeLocal: sp.charge && sp.charge.C.map(r2), inside: sp.charge && sp.charge.inside, grid: sp.gridS, box: sp.box && sp.box.map(r2),
      plates: (sp.plates || []).map((p, i) => ({ i, ax: p.ax, val: r2(p.val), mm: Math.round(p.h * 1000), mat: p.mat, skin: !!p.skin, u: [r2(p.u0), r2(p.u1)], v: [r2(p.v0), r2(p.v1)] })),
      hole: res.hole ? { c: res.hole.c && res.hole.c.map(r2) } : null, nodes: B.info && B.info.N };
  }
  function report(o = {}) {
    const s = L.shot, u = unit();
    const P = patches().map(patchInfo);
    const simS = simState(u);
    const torn = P.reduce((a, b) => a + b.torn, 0);
    const tl = L.tl, dec = Math.max(1, Math.ceil(tl.length / (o.samples || 240)));
    const solving = tl.filter(x => x.state === 'solving' || x.state === 'synced').map(x => x.frameMs).filter(v => v > 0).sort((a, b) => a - b);
    const pct = q => solving.length ? solving[Math.min(solving.length - 1, Math.floor(solving.length * q))] : null;
    return {
      at: new Date().toISOString(), tau: tau() !== null ? r3(tau()) : null, page: location.href,
      target: u ? { type: u.type, name: u.def.name, size: u.def.size, side: u.side, hp: Math.round(u.hp), hpMax: u.hpMax, alive: u.alive } : { type: L.type, gone: true },
      shot: s ? { mode: s.mode, kind: s.kind, charge: s.C, overrides: s.ov, aim: s.loc, from: s.from, seed: s.seed, preroll: s.preroll, shooter: s.shooter, outcome: s.outcome, err: s.err, hit: s.res } : null,
      landed: s && s.landed, patches: P, sim: simS, model: L.model, vox: voxOn() ? Object.assign({ charge: s && s.vox }, game.vox.state(L.id)) : null,
      compare: simS && simS.holes ? { pictureTornM2: r2(torn), simHoleM2: simS.holeA, ratio: simS.holeA > 0 ? r2(torn / simS.holeA) : null } : null,
      solver: solverState(), qa: L.qa ? { ok: L.qa.ok, flags: (L.qa.flags || []).slice(0, 30), stats: L.qa.stats, err: L.qa.err } : null,
      perf: { frameMsP50: pct(.5), frameMsP95: pct(.95), frames: solving.length },
      timeline: tl.filter((x, i) => i % dec === 0 || i === tl.length - 1),
      events: L.ev.slice(-400),
    };
  }

  return {
    L, unit, ready, spawn, clearAll, voxOn, voxCharge, presets, aimPreset, pickScreen, cast, fire, mission, shootersOf, rangeFor, chargeInfo,
    tau, shotT0, patches, solverState, sync, step, to, rerun, setRate, tick, onEvent, sample, simState, qa, report,
    toWorld, toModel, dirToWorld, dirToModel, frameOf, nextFrame, shockR, fireR,
  };
}
