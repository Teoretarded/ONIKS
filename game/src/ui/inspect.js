/* ONIKS · Inspect / Anatomy: the in-game Anatomy films (reference/films/pc_anatomy*_film.js).

   Open:  I on the selected unit (or the round in flight under the cursor), Alt + double-click / Alt + click a
          unit or a round, double-click an enemy track or a round. Own units always; enemy units once a scan has
          identified them (a short coral "not identified" tag otherwise; sandbox with fog off: everything).
          Shift + I (sandbox): the Anatomy browser, every model in dark space, ← → / [ ] to walk.
   In it: E exploded view (assemblies leave in their w0 order and come home in reverse) · X X-ray on / off ·
          left or right drag orbit · wheel zoom · click a tag (or a part) to frame it, click empty space to
          frame the whole · H hide the tags · Esc or I leave (the camera flies back, time and the world return).
   Time:  combat / campaign pause while inspecting; sandbox keeps running (settings.inspectPause overrides);
          a round in flight drops the game to bullet time x0.05, shown on screen.

   The unit is drawn with its cutaway (data/anatomy.js `model`, same frame and state): a lime slice runs along
   its long axis (engine hook d.gate: shells go ghost behind it, interior parts and container contents appear
   behind it, the band lights this model only), tags condense in the order the slice reaches them and sit in
   clean columns beside the model with dotted leaders to their parts; brackets fit what is drawn.
   The 2D layer is laid out at 1080p and scaled with the HUD (the overlay's ui: 1 at 1080p, never below .8).
   What the x-ray finds in a container: on an enemy it is an identification (? 0.37 -> MK 41? -> the load, with the
   Empty / Inert / round bars); on your own units, rounds and the museum it is simply named (you know your load).
   game.inspect = { open(id), openProj(id), museum(key), close(), can(unit), get active() } for the HUD. */
import { attitude } from '../engine/models.js';
import { makeSubject, toWorld } from './inspect/subject.js';
import * as O from './inspect/overlay.js';
import { SHORT, TRACK, status } from '../game/labels.js';
import { MUSEUM_KEYS, groupOf, attachPaletteRow } from './inspect/museum.js';

const TAU = Math.PI * 2;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const LIME = O.LIME, CORAL = O.CORAL;
const FAINT = 'rgba(255,255,255,.36)', DIM = 'rgba(255,255,255,.62)', WHITE = '#FFFFFF';

const BULLET = .05;                    // bullet-time rate for a round in flight
const FLY_IN = 1.5, FLY_OUT = 1.25, SCAN_AT = .75;
const EX_OUT = 4.4, EX_BACK = 3.8, EX_HOLD = 9;      // the films' explode rhythm (pc_anatomy_film.js EXO_D, EXB_D)
const MUSEUM_Y = 9000;                 // the museum floats in dark space above the map

/* public-reference masses (approximate, where commonly published) */
const MASS = { destroyer: '≈9 200 t full load', carrier: '≈100 000 t full load', helo: '10.4 t max', fighter: '29.9 t max',
  oniks: '≈3 000 kg', sm6: '≈1 500 kg', pantsir_missile: '≈75 kg', sam57e6: '≈75 kg', drone: '18 kg max', aam: '≈152 kg', aim120: '≈152 kg',
  hellfire: '≈49 kg', essm: '≈280 kg', slam: '≈675 kg', shell: '≈31.8 kg' };
/* where each container's contents sit (x-ray group ids without an "in ..." in their label) */
const WHERE = { VF: 'VLS fwd', VA: 'VLS aft', MAG: 'magazines', B: 'chamber' };
/* model state fields that only spin (they never move the x-ray contents) */
const SPIN = new Set(['wheel', 'fan', 'rotor', 'trotor', 'prop', 'ant', 'sAnt', 'sps', 'ciwsSpin', 'radar', 'lamp', 'fire']);

export async function createInspect(game, ctx) {
  const AN = await import('../data/anatomy.js');
  const DM = (ctx && ctx.DM) || game.models || await import('../data/models.js');
  const { sim, R } = game, cam = R.camera, bus = game.bus;
  const subjects = new Map();
  let S = null;                        // the open view
  let note = null;                     // { u, t0, text } a short tag on the map ('not identified')
  let hideTags = false;
  const touched = new Set();           // queued instances we dimmed (alpha restored on close)
  const mine = new Set();              // our own instances
  const hits = [];                     // tag boxes this frame: { box, ent } (1080p layout px, as everything in 2D)
  const tagBoxes = [];                 // every placard's box this frame (the slice tags keep clear of them)
  const q3 = [0, 0, 0], w3 = [0, 0, 0], s3 = [0, 0, 0];
  /* the 2D layer is laid out in 1080p px and drawn scaled by the UI scale K: projections go through pcam */
  let K = 1;
  const pcam = { project(p, o) { const r = cam.project(p, o); if (r) { r[0] /= K; r[1] /= K; } return r; } };
  let paletteStop = null;

  function subjectOf(key) {
    if (!subjects.has(key)) {
      let s = null;
      try { s = makeSubject(R, AN, DM, key); } catch (e) { console.error('inspect: subject ' + key, e); }
      subjects.set(key, s);
    }
    return subjects.get(key);
  }
  const modelKeyOfUnit = u => u.def.model;
  const projModel = p => { const P = p.P || game.PROJ[p.kind]; return P && P.model; };

  /* ------------------------------------------------------------ who may be inspected */
  function can(u) {
    if (!u || !u.alive || u.aboard) return false;
    if (u.side === game.side) return true;
    if (game.mode === 'sandbox' && !sim.fog) return true;
    const c = sim.contact(game.side, u.id);
    return !!(c && c.identified);
  }
  function projUnder(x, y, r) {
    let best = null, bd = (r || 26) ** 2;
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !sim.projVisible(game.side, p)) continue;
      const k = projModel(p); if (!k || !R.models.has(k)) continue;
      if (!cam.project(game.projPose(p).pos, q3)) continue;
      const d = (q3[0] - x) ** 2 + (q3[1] - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function refuse(u, text) { note = { u, t0: game.realT, text: text || 'Not identified' }; bus.emit('toast', { text: 'NOT IDENTIFIED · SCAN FIRST', bad: true }); }

  /* ------------------------------------------------------------ open / close */
  function openUnit(u) {
    if (!u) return false;
    if (!can(u)) { if (u.alive && u.side !== game.side) refuse(u); return false; }
    return begin({ kind: 'unit', id: u.id, key: modelKeyOfUnit(u) });
  }
  function openProj(p) {
    if (!p || !p.alive) return false;
    const k = projModel(p); if (!k) return false;
    return begin({ kind: 'proj', id: p.id, key: k });
  }
  function openMuseum(key) {
    return begin({ kind: 'museum', key: key || (S && S.kind === 'museum' ? S.key : MUSEUM_KEYS[0]) });
  }

  function begin(tg) {
    const subj = subjectOf(tg.key);
    if (!subj) return false;
    let saved = null, prev = null;
    if (S && S.phase !== 'out') { prev = S; saved = S.saved; bus.emit('inspect', { id: prev.id, kind: prev.kind, on: false }); }
    else if (S) finish(true);
    if (!saved) saved = saveState();
    hideTags = false;
    const V = {
      kind: tg.kind, id: tg.id, key: tg.key, subj, saved, phase: 'in', t: 0, tOut: 0,
      R0: [1, 0, 0, 0, 1, 0, 0, 0, 1], T0: [0, 0, 0], hdg: 0, st: {}, alive: true, lostT: 0, lostWhy: '',
      xr: { on: true, k: 0, D: clamp(2 + subj.axis.L * .03, 2.6, 5.5), t0: SCAN_AT },
      ex: { on: false, e: 0, idle: 0, settleT: {} },
      fitA: null, fitE: null, focus: null, focusT: -9, focusFrom: null, manual: false,
      focusLocal: [0, 0, 0], focusW: [0, 0, 0],
      fly: null, drag: null, hover: null, hoverT: 0,
      inst: newInst(subj), contents: [], cSig: '', cList: [], groups: [],
      dimK: 1, worldK: 0, museumIdx: tg.kind === 'museum' ? Math.max(0, MUSEUM_KEYS.indexOf(tg.key)) : -1,
      prevInst: null, prevT: 0, timeTouched: prev ? prev.timeTouched : false, T0m: null, tags: new Map(), uiA: 0,
    };
    if (V.kind === 'museum') {
      V.T0m = prev && prev.kind === 'museum' ? prev.T0m : [cam.target[0], MUSEUM_Y, cam.target[2]];
      if (prev && prev.kind === 'museum') { V.prevInst = prev.inst; V.prevT = 0; }
    }
    if (prev) { V.worldK = prev.worldK; V.dimK = prev.dimK; V.uiA = prev.kind === V.kind ? .3 : 0; }
    S = V;
    if (!resolve(0)) { S = prev; if (!prev) restoreState(saved, true); return false; }
    // the camera: fly from where it is to the fitted view (the museum walks glide from the last exhibit)
    subj.refreshDyn(V.st);
    V.fitA = fitOf(V, 0); V.fitE = fitOf(V, 1); V.fitT = 0;
    V.cA = V.fitA.c.slice(); V.cE = V.fitE.c.slice(); V.dA = V.fitA.dist; V.dE = V.fitE.dist;
    V.focusLocal = V.fitA.c.slice();
    toWorld(V.R0, V.T0, V.focusLocal, V.focusW);
    const base = V.kind === 'museum' ? 0 : V.hdg;
    V.fly = { t: 0, dur: V.kind === 'museum' && prev ? 1.1 : V.kind === 'museum' ? 2.2 : FLY_IN,
      from: { target: cam.target.slice(), dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch },
      to: { dist: V.fitA.dist, yaw: V.fitA.yaw + base, pitch: V.fitA.pitch } };
    const tv = Math.hypot(cam.target[0] - V.focusW[0], cam.target[1] - V.focusW[1], cam.target[2] - V.focusW[2]);
    V.fly.bump = Math.max(0, Math.log(1 + tv / (cam.dist + V.fitA.dist)) * .7);
    V.xr.t0 = Math.max(SCAN_AT, V.fly.dur - .7);           // the slice starts as the camera arrives
    cam.fly = null; cam.keys = false;
    if (!prev) { R.setScan(0, null); R.setScan(1, null); }
    R.seaOcclude = !(V.kind === 'unit' && V.u && V.u.def.domain === 'sea');
    cam.minDist = Math.max(.35, subj.radius * .1); cam.minPitch = -1.2;
    // time: pause in combat and campaign, bullet time for a round
    setTime(V);
    // the world steps back, the regular UI goes, cinematic off
    if (!game.ui.hidden) game.setUiHidden(true);
    const dir = game.getSystem('director');
    if (dir && dir.on) { saved.cinematic = true; dir.set(false); }
    bus.emit('inspect', { id: V.id, kind: V.kind, on: true });
    warmContents(V);
    return true;
  }
  function saveState() {
    return { target: cam.target.slice(), dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch, goal: { target: cam.goal.target.slice(), dist: cam.goal.dist, yaw: cam.goal.yaw, pitch: cam.goal.pitch },
      minDist: cam.minDist, minPitch: cam.minPitch, keys: cam.keys, followFn: cam.followFn, followOff: cam.followOff ? cam.followOff.slice() : [0, 0, 0],
      rate: game.timeRate, paused: game.paused, ui: game.ui.hidden, worldBright: R.worldBright, skyBright: R.skyBright, cinematic: false };
  }
  function setTime(V) {
    if (V.kind === 'museum') return;
    if (V.kind === 'proj') {
      if (game.timeRate !== BULLET || game.paused) { game.timeRate = BULLET; game.paused = false; bus.emit('rate', { rate: BULLET, paused: false, why: 'inspect' }); }
      return;
    }
    const pause = game.settings && game.settings.inspectPause !== undefined ? !!game.settings.inspectPause : game.mode !== 'sandbox';
    if (pause && !game.paused) { game.paused = true; bus.emit('rate', { rate: game.timeRate, paused: true, why: 'inspect' }); }
    else if (!pause && game.timeRate === BULLET) { game.timeRate = V.saved.rate === BULLET ? 1 : V.saved.rate; bus.emit('rate', { rate: game.timeRate, paused: game.paused, why: 'inspect' }); }
  }
  /* leave: the camera flies back, time and the world come back */
  function close() {
    if (!S || S.phase === 'out') return;
    const V = S;
    V.phase = 'out'; V.tOut = V.t; V.xr.on = false; V.ex.on = false;
    const sv = V.saved;
    cam.minDist = sv.minDist; cam.minPitch = sv.minPitch; cam.keys = sv.keys;
    cam.followFn = null;
    cam.flyTo(sv.target, { dist: sv.dist, yaw: sv.yaw, pitch: sv.pitch, time: FLY_OUT });
    if (!V.timeTouched && V.kind !== 'museum') {
      if (game.timeRate !== sv.rate || game.paused !== sv.paused) { game.timeRate = sv.rate; game.paused = sv.paused; bus.emit('rate', { rate: sv.rate, paused: sv.paused, why: 'inspect' }); }
    } else if (game.timeRate === BULLET) { game.timeRate = sv.rate === BULLET ? 1 : sv.rate; bus.emit('rate', { rate: game.timeRate, paused: game.paused, why: 'inspect' }); }
    bus.emit('inspect', { id: V.id, kind: V.kind, on: false });
  }
  /* the end of the way out (or an instant swap): everything as it was */
  function finish(instant) {
    if (!S) return;
    const V = S;
    if (V.phase !== 'out') close();
    restoreState(V.saved, instant);
    for (const d of touched) { if (d._inspA !== undefined) d.alpha = d._inspA; delete d._inspA; delete d._inspK; }
    touched.clear();
    S = null;
  }
  function restoreState(sv, instant) {
    R.worldBright = sv.worldBright; R.skyBright = sv.skyBright; R.seaOcclude = true;
    cam.minDist = sv.minDist; cam.minPitch = sv.minPitch; cam.keys = sv.keys;
    if (game.ui.hidden !== sv.ui) game.setUiHidden(sv.ui);
    if (sv.followFn && !instant) { cam.followFn = sv.followFn; cam.followOff = sv.followOff; }
    if (sv.cinematic) { const dir = game.getSystem('director'); if (dir && !dir.on) dir.set(true); }
  }

  /* ------------------------------------------------------------ the subject's pose, state and fit */
  function newInst(subj) {
    const d = { key: subj.cutKey, T: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: null, tint: null, tintK: 0, tintFace: 0, alpha: 1,
      partXray: {}, partGate: {}, partAlpha: {}, partX: {}, damage: null, gate: { n: [0, 0, 1], d: 0, w: 1, g: 1, mode: 0 }, dissolve: 0 };
    for (const p of subj.parts) {
      d.partXray[p.name] = p.cls === 'shell' ? 1 : 0;
      d.partGate[p.name] = p.cls === 'shell' ? 1 : p.cls === 'hidden' ? 2 : 3;
    }
    mine.add(d);
    return d;
  }
  /* pose + state of the subject for this frame; false when it is gone */
  function resolve(dt) {
    const V = S, subj = V.subj;
    let pos, hdg = 0, pitch = 0, roll = 0, src = null;
    if (V.kind === 'unit') {
      const u = sim.units.get(V.id);
      if (!u || !u.alive || u.aboard) { if (!V.lostT) { V.lostT = V.t || 1e-3; V.lostWhy = u && !u.alive ? (u.def.domain === 'sea' ? 'Sinking' : 'Destroyed') : 'Gone'; } return V.t > 0; }
      const p = game.unitPose(u); pos = p.pos; hdg = p.hdg; pitch = p.pitch; roll = p.roll; src = u.st;
      V.u = u;
    } else if (V.kind === 'proj') {
      const p = sim.projectiles.get(V.id);
      if (!p || !p.alive) { if (!V.lostT) { V.lostT = V.t || 1e-3; V.lostWhy = V.lastEvent || 'Round gone'; } return V.t > 0; }
      const pp = game.projPose(p); pos = pp.pos; hdg = pp.hdg; pitch = pp.pitch; src = p.st;
      V.p = p;
    } else {
      pos = V.T0m; hdg = 0;
    }
    V.T0[0] = pos[0]; V.T0[1] = pos[1]; V.T0[2] = pos[2]; V.hdg = hdg;
    const Ra = attitude(hdg, pitch, roll); for (let i = 0; i < 9; i++) V.R0[i] = Ra[i];
    // state: the cutaway's defaults, the anatomy's preferred state, the unit's own; interior parts on
    const st = V.st;
    for (const k in subj.st0) st[k] = subj.st0[k];
    if (src) for (const k in src) st[k] = src[k];
    if (V.kind === 'unit' && V.u.type === 'transloader' && st.reload > 0 && DM.TRANSLOADER) Object.assign(st, DM.TRANSLOADER.reloadPose(st.reload, { slot: st.slot }));
    st.xray = 1;
    return true;
  }
  /* the fitted view at explode e (anatomy.fitView's rule on the drawn points): { c (model), dist, yaw, pitch } */
  function fitOf(V, e) {
    const subj = V.subj;
    subj.pose({ R0: V.R0, T0: V.T0, st: V.st, e }, AN);
    const ps = subj.parts.filter(p => p.cls !== 'hidden' || e > 0);
    const b = subj.partsBounds(ps) || [[-1, -1, -1], [1, 1, 1]];
    const vw = (subj.A && subj.A.view) || {};
    const yaw = vw.yaw === undefined ? .75 : vw.yaw, pitch = vw.pitch === undefined ? .28 : vw.pitch;
    const c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
    const f = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const rl = Math.hypot(f[2], f[0]) || 1, r = [f[2] / rl, 0, -f[0] / rl];
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    const tv = Math.tan(cam.fov / 2) * .84, th = Math.tan(cam.fov / 2) * (cam.W / Math.max(1, cam.H)) * .64;
    let dist = 1e-3;
    for (let i = 0; i < 8; i++) {
      const d = [(i & 1 ? b[1][0] : b[0][0]) - c[0], (i & 2 ? b[1][1] : b[0][1]) - c[1], (i & 4 ? b[1][2] : b[0][2]) - c[2]];
      const x = Math.abs(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]), y = Math.abs(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]), z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      dist = Math.max(dist, x / th - z, y / tv - z);
    }
    // the tag columns need room beside the model and the readout above it: a little further out
    return { c, dist: Math.max(dist * 1.08, cam.minDist * 1.2), yaw, pitch, b };
  }
  const entCenter = ent => { const b = S.subj.partsBounds(ent.parts); return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : ent.model.slice(); };
  const entRadius = ent => { const b = S.subj.partsBounds(ent.parts); return b ? Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) / 2 : 1; };

  /* ------------------------------------------------------------ x-ray contents (rounds in tubes, canisters ...) */
  function warmContents(V) {
    const A = V.subj.A;
    if (!A || !A.xray) return;
    for (const g of A.xray) if (R.models.has(g.model)) { try { R.models.warm(g.model); } catch (e) { /* */ } }
  }
  function contentGroups(V) {
    const A = V.subj.A, st = V.st, out = V.groups;
    out.length = 0;
    if (!A || !A.xray || !A.xray.length) return out;
    // signature of the state (cheap): recompute the instances when it changes
    let sig = '';
    for (const k in st) { if (SPIN.has(k)) continue; const v = st[k]; if (typeof v === 'number') sig += v.toFixed(2); else if (typeof v === 'boolean') sig += v ? 1 : 0; sig += ','; }
    if (V.kind === 'unit' && V.u) sig += V.u.ammo ? JSON.stringify(V.u.ammo) : '';
    if (sig !== V.cSig) {
      V.cSig = sig;
      V.cList = A.xray.map((g, gi) => {
        let present = true;
        try { present = !g.when || !!g.when(st); } catch (e) { present = true; }
        let xs = [];
        if (present) { try { xs = g.inst(st) || []; } catch (e) { xs = []; } }
        xs = trimByAmmo(V, g, xs);
        if (!xs.length) present = false;
        // no container there at all (the transloader's hook without a TLC): nothing to find (a chamber stays)
        const par = g.parent ? V.subj.byName.get(g.parent) : null;
        if (!present && par && par.P.part.show && !WHERE[g.id]) { let on = true; try { on = !!par.P.part.show(st); } catch (e) { on = true; } if (!on) return null; }
        // the group's anchor (model space, before the parent's offset): the instances' centroid, or the container
        const anc = [0, 0, 0];
        if (xs.length) { for (const X of xs) { anc[0] += X.T[0]; anc[1] += X.T[1]; anc[2] += X.T[2]; } anc[0] /= xs.length; anc[1] /= xs.length; anc[2] /= xs.length; }
        else if (g.parent && V.subj.byName.get(g.parent)) { const b = V.subj.partsBounds([V.subj.byName.get(g.parent)]); if (b) for (let k = 0; k < 3; k++) anc[k] = (b[0][k] + b[1][k]) / 2; }
        const lab = g.label || '', m = lab.match(/^(.*) · in (.*)$/);
        const cls = m ? m[1] : lab.split(' · ')[0], where = m ? m[2] : WHERE[g.id] || 'hull';
        const prevG = V.cGroups && V.cGroups.find(q => q.gi === gi);
        return { g, gi, present, xs, anc, cls, where, id: g.id, t0: prevG ? prevG.t0 : 0, y: prevG ? prevG.y : undefined, side: prevG ? prevG.side : undefined,
          label: lab, parent: g.parent, model: g.model, st: g.st || {}, name: V.subj.contentName(g.model), world: [0, 0, 0], p: null };
      });
      V.cList = V.cList.filter(Boolean);
      // containers that read alike get their side in the chip (TLC R / TLC L)
      const seen = new Map();
      for (const c of V.cList) seen.set(c.where, (seen.get(c.where) || 0) + 1);
      for (const c of V.cList) { c.cid = c.where.toUpperCase(); if (seen.get(c.where) > 1) { const m2 = String(c.id).match(/([RL])$/); c.cid += ' ' + (m2 ? m2[1] : String(c.id).replace(/^tlc/i, '').toUpperCase()); } }
      V.cGroups = V.cList;
    }
    for (const c of V.cList) out.push(c);
    return out;
  }
  /* the rounds actually aboard: a Pantsir with 7 missiles left shows 7 */
  function trimByAmmo(V, g, xs) {
    if (V.kind !== 'unit' || !V.u || !xs.length) return xs;
    const u = V.u;
    if (u.type === 'pantsir' && u.ammo && u.ammo.sam !== undefined) {
      const n = u.ammo.sam, per = g.id === 'R' ? Math.ceil(n / 2) : Math.floor(n / 2);
      return xs.slice(0, Math.max(0, Math.min(xs.length, per)));
    }
    return xs;
  }

  /* ------------------------------------------------------------ per frame */
  function update(dt) {
    if (note && game.realT - note.t0 > 2.2) note = null;
    if (!S) return;
    const V = S;
    V.t += dt;
    const live = resolve(dt);
    if (!live && V.phase !== 'out') { close(); }
    if (V.lostT && V.phase !== 'out' && V.t - V.lostT > (V.kind === 'proj' ? 3.2 : 1.6)) close();
    // animations
    const out = V.phase === 'out';
    if (V.t > V.xr.t0 || out) {
      const D = V.xr.D;
      V.xr.k = V.xr.on ? Math.min(1, V.xr.k + dt / D) : Math.max(0, V.xr.k - dt / (out ? .45 : D * .5));
    }
    const ex = V.ex;
    ex.e = ex.on ? Math.min(1, ex.e + dt / EX_OUT) : Math.max(0, ex.e - dt / (out ? .8 : EX_BACK));
    if (ex.on && ex.e >= 1) { ex.idle += dt; if (ex.idle > EX_HOLD) toggleExplode(V); } else ex.idle = 0;
    // world and units dim while the subject is the picture
    const inK = V.kind === 'museum' ? ss(0, 1.3, V.t) : ss(0, .9, V.t);
    V.worldK = out ? Math.max(0, V.worldK - dt / .9) : Math.max(V.worldK, inK);
    const wDim = V.kind === 'museum' ? .025 : .3;
    R.worldBright = lerp(V.saved.worldBright, wDim, V.worldK);
    if (V.kind === 'museum') R.skyBright = lerp(V.saved.skyBright, 14, V.worldK);
    V.dimK = V.kind === 'museum' ? 1 - V.worldK : lerp(1, .22, V.worldK);
    V.uiA = out ? Math.max(0, V.uiA - dt / .3) : Math.min(1, V.uiA + dt / .4);
    if (V.prevInst) { V.prevT += dt; if (V.prevT > .5) V.prevInst = null; }
    // the fitted views follow the model's state (a TEL erecting, a crane swinging), smoothly
    if (V.kind !== 'museum' && !out) {
      V.fitT += dt;
      if (V.fitT > .5) { V.fitT = 0; V.subj.refreshDyn(V.st); V.fitA = fitOf(V, 0); V.fitE = fitOf(V, 1); }
      const kf = 1 - Math.exp(-2.5 * dt);
      for (let j = 0; j < 3; j++) { V.cA[j] += (V.fitA.c[j] - V.cA[j]) * kf; V.cE[j] += (V.fitE.c[j] - V.cE[j]) * kf; }
      V.dA = Math.exp(lerp(Math.log(V.dA), Math.log(V.fitA.dist), kf)); V.dE = Math.exp(lerp(Math.log(V.dE), Math.log(V.fitE.dist), kf));
    }
    // pose the parts at the explode, the camera on them
    V.subj.pose({ R0: V.R0, T0: V.T0, st: V.st, e: ex.e }, AN);
    if (!out) camera(dt);
    if (out) {
      const done = ex.e <= 0 && V.xr.k <= 0 && V.t - V.tOut > FLY_OUT && V.worldK <= 0;
      if (V.t - V.tOut > .4 && game.ui.hidden !== V.saved.ui) game.setUiHidden(V.saved.ui);
      if (done) finish(false);
    }
  }

  /* the camera: the fly-in, then free orbit (the user's yaw / pitch / zoom) about a focus that rides the model */
  function camera(dt) {
    const V = S, ex = V.ex;
    // where the focus should be: the whole model (easing to the exploded fit), or a focused part
    if (V.focus) {
      const u = ease(sat((V.t - V.focusT) / .9)), c = entCenter(V.focus);
      for (let k = 0; k < 3; k++) V.focusLocal[k] = lerp(V.focusFrom.local[k], c[k], u);
      if (u < 1) cam.goal.dist = Math.exp(lerp(Math.log(V.focusFrom.dist), Math.log(V.focusTo), u));
    } else {
      const k = ex.e * ex.e * (3 - 2 * ex.e), A = { c: V.cA, dist: V.dA }, E = { c: V.cE, dist: V.dE };
      if (V.unfocusT !== undefined) {
        const u = ease(sat((V.t - V.unfocusT) / .9));
        for (let j = 0; j < 3; j++) V.focusLocal[j] = lerp(V.focusFrom.local[j], lerp(A.c[j], E.c[j], k), u);
        if (!V.manual) cam.goal.dist = Math.exp(lerp(Math.log(V.focusFrom.dist), lerp(Math.log(A.dist), Math.log(E.dist), k), u));
        if (u >= 1) V.unfocusT = undefined;
      } else {
        for (let j = 0; j < 3; j++) V.focusLocal[j] = lerp(A.c[j], E.c[j], k);
        if (!V.manual && !V.fly) cam.goal.dist = Math.exp(lerp(Math.log(A.dist), Math.log(E.dist), k));
      }
    }
    toWorld(V.R0, V.T0, V.focusLocal, V.focusW);
    const F = V.fly;
    if (F) {
      F.t += dt;
      const u = sat(F.t / F.dur), s = ease(u), s2 = u * u * (3 - 2 * u);
      for (let k = 0; k < 3; k++) cam.target[k] = cam.goal.target[k] = lerp(F.from.target[k], V.focusW[k], s);
      const dist = Math.exp(lerp(Math.log(F.from.dist), Math.log(F.to.dist), s2) + F.bump * Math.sin(Math.PI * s2));
      const yaw = F.from.yaw + wrapPi(F.to.yaw - F.from.yaw) * s, pitch = lerp(F.from.pitch, F.to.pitch, s);
      cam.dist = cam.goal.dist = dist; cam.yaw = cam.goal.yaw = yaw; cam.pitch = cam.goal.pitch = pitch;
      if (u >= 1) V.fly = null;
    } else {
      for (let k = 0; k < 3; k++) cam.target[k] = cam.goal.target[k] = V.focusW[k];
    }
    cam.fly = null;
    cam.followFn = focusFn; cam.followOff = FOLLOW0;
  }
  const FOLLOW0 = [0, 0, 0];
  const focusFn = () => S ? S.focusW : null;

  function setFocus(ent) {
    const V = S; if (!V) return;
    V.focusFrom = { local: V.focusLocal.slice(), dist: cam.goal.dist };
    if (ent) {
      V.focus = ent; V.focusT = V.t; V.unfocusT = undefined;
      V.focusTo = Math.max(cam.minDist * 1.3, entRadius(ent) / Math.tan(cam.fov / 2) * 1.9);
    } else {
      V.focus = null; V.unfocusT = V.t; V.manual = false;
    }
  }

  /* ------------------------------------------------------------ 3D */
  function draw3d() {
    if (!S) return;
    const V = S, subj = V.subj, d = V.inst, out = V.phase === 'out';
    const cutOn = !out || V.ex.e > 0 || V.xr.k > 0;
    // the unit's own instance steps aside for the cutaway; the rest of the world steps back
    const hideId = V.kind === 'unit' && cutOn ? V.id : undefined;
    let hideProj = null;
    if (V.kind === 'proj' && V.p && cutOn) hideProj = game.projPose(V.p).pos;
    for (const q of R.queue) {
      if (mine.has(q)) continue;
      let k = V.dimK;
      if (hideId !== undefined && q.id === hideId) k = 0;
      else if (hideProj && q.T && Math.abs(q.T[0] - hideProj[0]) < 1e-3 && Math.abs(q.T[1] - hideProj[1]) < 1e-3 && Math.abs(q.T[2] - hideProj[2]) < 1e-3) k = 0;
      if (k >= .999 && q._inspA === undefined) continue;
      const a = q.alpha === undefined ? 1 : q.alpha;
      if (q._inspK === undefined || Math.abs(a - q._inspA * q._inspK) > 1e-4) q._inspA = a;
      q._inspK = k; q.alpha = q._inspA * k; touched.add(q);
    }
    dimFx(V.kind === 'museum' ? 1 - V.worldK : lerp(1, V.kind === 'proj' ? .22 : .2, V.worldK), V);
    if (!cutOn) return;
    // the instance
    for (let i = 0; i < 9; i++) d.R[i] = V.R0[i];
    d.T[0] = V.T0[0]; d.T[1] = V.T0[1]; d.T[2] = V.T0[2];
    d.st = V.st;
    // tint: the unit's lime / coral rim hands over to the films' white
    const own = V.kind !== 'unit' || (V.u && V.u.side === game.side);
    const tk = V.kind === 'museum' ? 0 : lerp(.6, own ? 0 : .3, ss(.2, 1.2, V.t)) * (out ? 1 : 1);
    d.tint = V.kind === 'museum' ? null : own ? 'own' : 'hostile'; d.tintK = tk; d.tintFace = own ? 0 : .06;
    d.dissolve = V.kind === 'museum' ? 1 - ss(0, .6, V.t) : 0;
    d.bright = lerp(1, 1.25, V.worldK);
    // the slice: the model's long axis in the world, the front a model coordinate along it
    const ax = subj.axis, xk = V.xr.k, band = Math.max(.06, ax.L * .011), glow = Math.max(.15, ax.L * .03);
    const zS = ax.z0 - band * 1.5, zE = ax.z1 + glow * 6;
    // fully open / shut: the plane goes far away, so parts that float out of the model's length stay open / shut
    V.front = xk >= 1 ? zE + 1e5 : xk <= 0 ? zS - 1e5 : lerp(zS, zE, xk);
    const G = d.gate;
    G.n[0] = V.R0[ax.i]; G.n[1] = V.R0[3 + ax.i]; G.n[2] = V.R0[6 + ax.i];
    G.d = G.n[0] * V.T0[0] + G.n[1] * V.T0[1] + G.n[2] * V.T0[2] + V.front; G.w = band; G.g = glow; G.mode = 0;
    // parts: explode offsets (partX), hidden parts shown by the slice or lifted out, damage coral / dropped out
    const dmg = damageOf(V);
    d.damage = dmg;
    const under = V.kind === 'unit' && V.u && V.u.def.domain === 'sea' ? 2.4 : 1.35;
    for (const p of subj.parts) {
      const nm = p.name;
      if (p.k > 0) d.partX[nm] = p.px; else delete d.partX[nm];
      let a = 1;
      if (p.cls === 'hidden') {
        // revealed by the slice, or lifted out by the exploded view; a little brighter than the steel round them
        if (xk > 0) { d.partGate[nm] = 2; a = 1; }
        else { d.partGate[nm] = 3; a = Math.min(1, p.k * 2.5); }
        a *= under;
      } else if (p.cls === 'part') a = 1.15;
      const dm = dmg ? dmg[nm] || 0 : 0;
      if (dm >= .99) a *= .16;
      d.partAlpha[nm] = a;
    }
    R.draw(d);
    // the exhibit before this one, dissolving (museum walk)
    if (V.prevInst) { V.prevInst.dissolve = ss(0, .45, V.prevT); R.draw(V.prevInst); }
    // what the x-ray finds inside
    drawContents(V, xk > 0);
  }
  function drawContents(V, on) {
    const groups = contentGroups(V);
    if (!on) return;
    const G = V.inst.gate, CG = V.cGate || (V.cGate = { n: G.n, d: 0, w: 1, g: 1, mode: 2 });
    CG.d = G.d; CG.w = G.w; CG.g = G.g;
    let n = 0;
    for (const c of groups) {
      if (!c.present || !R.models.has(c.model)) continue;
      const pp = c.parent ? V.subj.byName.get(c.parent) : null, off = pp ? pp.off : null;
      for (const X of c.xs) {
        let d = V.contents[n];
        if (!d) { d = V.contents[n] = { key: c.model, T: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: null, tint: null, alpha: 1, gate: CG }; mine.add(d); }
        n++;
        d.key = c.model; d.st = c.st; d.gate = CG;
        // X (model space), then the parent's explode offset, then the instance
        const M = X.R, R0 = V.R0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) d.R[i * 3 + j] = R0[i * 3] * M[j] + R0[i * 3 + 1] * M[3 + j] + R0[i * 3 + 2] * M[6 + j];
        q3[0] = X.T[0] + (off ? off[0] : 0); q3[1] = X.T[1] + (off ? off[1] : 0); q3[2] = X.T[2] + (off ? off[2] : 0);
        toWorld(R0, V.T0, q3, d.T);
        R.draw(d);
      }
    }
  }

  /* scale the alpha of every effect dot queued so far this frame (radar beams, rings, smoke: the world) */
  function dimFx(k, V) {
    if (k >= .999) return;
    // effects on the subject (its plume and trail, its fires) keep their light: only the rest of the world steps back
    const fx = R.fx, e = cam.eye, keep = V.kind === 'proj' ? Math.max(40, V.subj.axis.L * 4) : 0;
    const cx = V.T0[0] - e[0], cy = V.T0[1] - e[1], cz = V.T0[2] - e[2], k2 = keep * keep;
    // the trail of a round runs back along its path: keep a capsule behind it
    const tr = V.kind === 'proj' ? 900 : 0, bx = -V.R0[2], by = -V.R0[5], bz = -V.R0[8];
    for (const st of [fx.sMax, fx.sAdd, fx.sOver, fx.sGlow, fx.sTop]) {
      if (!st || !st.n) continue;
      const B = st.b, F = st.f;
      for (let i = 0; i < st.n; i++) {
        const o = i * 5, dx = F[o] - cx, dy = F[o + 1] - cy, dz = F[o + 2] - cz;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (tr && d2 > k2) { const along = dx * bx + dy * by + dz * bz; if (along > 0 && along < tr) d2 = d2 - along * along; }
        if (d2 < k2) continue;
        const q = o * 4 + 19; B[q] = B[q] * k;
      }
    }
    if (fx.liftV) fx.liftV[3] *= k;
  }

  /* damage of the cutaway's parts from the unit's sim parts (0..1) */
  function damageOf(V) {
    if (V.kind !== 'unit' || !V.u || !V.u.parts) return null;
    const u = V.u, subj = V.subj;
    if (!subj.simMap || subj.simMapFor !== u.type) { subj.mapDamage(u.def.model, u.parts); subj.simMapFor = u.type; }
    let any = false;
    const out = V.dmg || (V.dmg = {});
    for (const [n, list] of subj.simMap) {
      let m = 0; for (const sp of list) m = Math.max(m, u.parts[sp] || 0);
      if (m > 0) { out[n] = m; any = true; } else if (out[n]) out[n] = 0;
    }
    return any ? out : null;
  }

  /* ------------------------------------------------------------ 2D */
  function draw2d(ov) {
    hits.length = 0; tagBoxes.length = 0;
    K = ov.ui || 1;
    const ctx = ov.ctx, W = ov.W / K, H = ov.H / K;
    ctx.save(); ctx.scale(K, K);
    try { layer2d(ov, ctx, W, H); } finally { ctx.restore(); }
  }
  function layer2d(ov, ctx, W, H) {
    if (note) drawNote(ov, ctx);
    if (!S) return;
    const V = S, subj = V.subj, A = V.uiA;
    if (A <= .01) return;
    if (hideTags) { drawTimeChip(ctx, W, A); return; }
    O.calmCorner(ctx, A); O.calmBottom(ctx, W, H, A);
    // screen boxes of the entries (brackets, hover, the tag columns)
    let mb = null;
    for (const ent of subj.entries) {
      let b = null;
      for (const p of ent.parts) b = subj.partBox(p, V.R0, V.T0, pcam, b);
      ent.box = b;
      if (b) mb = mb ? [Math.min(mb[0], b[0]), Math.min(mb[1], b[1]), Math.max(mb[2], b[2]), Math.max(mb[3], b[3])] : b.slice();
    }
    if (!mb) for (const p of subj.parts) mb = subj.partBox(p, V.R0, V.T0, pcam, mb);
    V.mbox = mb;
    const readBottom = drawReadout(ctx, W, H, A);
    drawTags(ctx, W, H, A, readBottom);
    drawSlice(ctx, W, H, A);
    drawTimeChip(ctx, W, A);
    drawKeys(ctx, W, H, A);
    drawScale(ctx, W, H, A);
  }

  /* the placards: lime chip tags condensing as the slice reaches their part, in columns either side of the model,
     dotted leaders to 3 px anchor dots; brackets that fit a part as it settles in the exploded view, on hover and
     focus; coral damage */
  function drawTags(ctx, W, H, A, readBottom) {
    const V = S, subj = V.subj, rows = [], t = V.t, xk = V.xr.k, out = V.phase === 'out';
    const front = V.front, scanEnd = V.xr.t0 + V.xr.D + .6;
    const dmg = V.inst.damage;
    for (const ent of subj.entries) {
      if (!shown(ent, V.st)) continue;
      // appears when the slice reaches its anchor (or when the scan would have finished, or once exploded)
      let ts = V.tags.get(ent);
      if (!ts) { if ((xk > 0 && front > ent.az) || t > scanEnd || ent.k > .6) V.tags.set(ent, ts = { t0: t }); else continue; }
      const age = t - ts.t0;
      if (!pcam.project(ent.world, s3) || offScreen(s3, W, H)) continue;
      let dm = 0; if (dmg) for (const p of ent.parts) dm = Math.max(dm, dmg[p.name] || 0);
      const lab = O.condense(ent.label.toUpperCase(), sat(age / .9), t, ent.id.length + ent.label.length);
      const val = dm > 0 ? (dm >= .99 ? 'Destroyed' : `Dmg ${Math.round(dm * 100)} %`) : ent.size;
      const w = O.tagWidth(ctx, ent.id, ent.label, val);
      rows.push({ o: ts, ent, p: [s3[0], s3[1]], w, h: 20, pref: ent.side, a: ss(0, .35, age) * A, lab, val, kind: dm > 0 ? 'coral' : 'lime', dm, id: ent.id, age });
    }
    // what the x-ray found in the containers: on an enemy, identification ticking up to its confidence (bars on the
    // first); on what is yours (and the museum's exhibits) the load is simply named
    let barsOn = false;
    const known = V.kind !== 'unit' || !V.u || V.u.side === game.side;
    for (const c of contentGroups(V)) {
      q3[0] = c.anc[0]; q3[1] = c.anc[1]; q3[2] = c.anc[2];
      const pp = c.parent ? subj.byName.get(c.parent) : null;
      if (pp) { q3[0] += pp.off[0]; q3[1] += pp.off[1]; q3[2] += pp.off[2]; }
      if (!c.t0 && xk > 0 && front > c.anc[subj.axis.i]) c.t0 = t;
      if (!c.t0 || xk <= 0) continue;
      toWorld(V.R0, V.T0, q3, c.world);
      if (!pcam.project(c.world, s3) || offScreen(s3, W, H)) continue;
      const age = t - c.t0, cid = c.cid || c.where.toUpperCase(), loadLab = c.label.replace(/×\d+/, '×' + c.xs.length);
      if (known) {
        // your own load: named as the slice reaches it (no guessing, no bars)
        const lab = c.present ? O.condense(loadLab.toUpperCase(), sat(age / .9), t, c.gi + 3) : 'Empty';
        rows.push({ o: c, p: [s3[0], s3[1]], w: O.tagWidth(ctx, cid, c.present ? loadLab : 'Empty', ''), h: 20, pref: null, a: ss(0, .35, age) * A, lab, val: '', kind: c.present ? 'lime' : 'white', id: cid, content: c, age });
        continue;
      }
      const bl = belief(c, age), conf = c.present ? bl[2] : bl[0];
      let lab, kind;
      if (!c.present) { lab = conf < .9 ? '?' : 'Empty'; kind = conf < .9 ? 'white' : 'lime'; }
      else if (conf < .45) { lab = '?'; kind = 'white'; }
      else if (conf < .9) { lab = `${c.name}?`; kind = 'white'; }
      else { lab = loadLab; kind = 'lime'; }
      const showBars = age < 3.2 && !barsOn; if (showBars) barsOn = true;
      const w = O.tagWidth(ctx, cid, lab, conf.toFixed(2));
      rows.push({ o: c, p: [s3[0], s3[1]], w: Math.max(w, 190), h: showBars ? 20 + 6 + 56 : 20, pref: null, a: ss(0, .35, age) * A, lab, val: conf.toFixed(2), kind, id: cid, bars: showBars ? bl : null, content: c, age, barsA: 1 - ss(2.6, 3.2, age) });
    }
    if (!rows.length) return;
    // columns either side of the model as seen now; each tag reads from the nearer one (with hysteresis)
    const mb = V.mbox || [W * .4, H * .4, W * .6, H * .6], midX = (mb[0] + mb[2]) / 2, half = Math.max(40, (mb[2] - mb[0]) / 2);
    for (const r of rows) {
      const o = r.o, s = (r.p[0] - midX) / half;
      if (o.side === undefined) { o.side = Math.abs(s) < .15 && r.pref ? r.pref : s < 0 ? 'L' : 'R'; o.y = undefined; }
      else if (o.side === 'L' && s > .2) o.side = 'R';
      else if (o.side === 'R' && s < -.2) o.side = 'L';
      r.side = o.side;
    }
    const wL = Math.max(0, ...rows.filter(r => r.side === 'L').map(r => r.w)), wR = Math.max(0, ...rows.filter(r => r.side === 'R').map(r => r.w));
    const xL = Math.max(34 + wL, Math.min(mb[0] - 40, W * .5 - 60)), xR = Math.min(W - 34 - wR, Math.max(mb[2] + 40, W * .5 + 60));
    const top = { L: Math.max(96, readBottom + 22), R: 74 }, bottom = H - 104;
    const k = 1 - Math.exp(-12 * Math.max(1e-3, game.dtReal || .016));
    for (const side of ['L', 'R']) {
      const rs = rows.filter(r => r.side === side).sort((a, b) => a.p[1] - b.p[1]);
      let y = top[side];
      for (const r of rs) { r.ty = Math.max(r.p[1] - 10, y); y = r.ty + r.h + 7; }
      let over = y - 7 - bottom;
      if (over > 0) {
        for (const r of rs) r.ty -= over;
        // still too many for the height: squeeze them into it
        if (rs.length && rs[0].ty < top[side]) { const tot = rs.reduce((s, r) => s + r.h, 0), gap = Math.max(1, (bottom - top[side] - tot) / Math.max(1, rs.length - 1)); let yy = top[side]; for (const r of rs) { r.ty = yy; yy += r.h + gap; } }
      }
      for (const r of rs) {
        const o = r.o;
        if (o.y === undefined) o.y = r.ty;
        else o.y += (r.ty - o.y) * k;
        r.y = o.y;
      }
    }
    const focus = V.focus, hov = V.hover;
    // brackets first (under the tags)
    for (const r of rows) {
      if (r.content) continue;
      const ent = r.ent, b = ent.box; if (!b) continue;
      const setT = V.ex.settleT[ent.id], setB = setT !== undefined ? ss(0, .2, t - setT) * (1 - ss(.9, 1.9, t - setT)) : 0;
      let a = setB * .85;
      if (ent === focus || ent === hov) a = Math.max(a, .9);
      if (r.dm > 0) a = Math.max(a, .55);
      if (a > .02) O.bracket(ctx, b, r.dm > 0 ? CORAL : LIME, a * r.a, 5, 9);
    }
    // settle times: a part that has just arrived at its exploded place gets its box
    for (const ent of subj.entries) { if (V.ex.on && ent.k > .97 && V.ex.settleT[ent.id] === undefined) V.ex.settleT[ent.id] = t; if (!V.ex.on && ent.k < .5) delete V.ex.settleT[ent.id]; }
    // leaders, dots, tags
    for (const r of rows) {
      const L = r.side === 'L', x = L ? xL : xR, cy = r.y + 10;
      const dimmed = focus && r.ent !== focus ? .38 : 1, a = r.a * dimmed;
      const col = r.kind === 'coral' ? CORAL : r.kind === 'white' ? 'rgba(255,255,255,.85)' : LIME;
      O.leader(ctx, r.p[0], r.p[1], x, cy, col, .65 * a);
      O.adot(ctx, r.p[0], r.p[1], col, a);
      const box = O.tag(ctx, L ? x - 6 : x + 6, r.y, r.id, r.lab, r.val, { kind: r.kind, a, align: L ? 'right' : 'left', hi: !!r.ent && (r.ent === focus || r.ent === hov), valCol: r.kind === 'white' ? 'rgba(255,255,255,.8)' : undefined });
      if (box && r.ent) hits.push({ box, ent: r.ent });
      if (box) tagBoxes.push(box);
      if (r.bars && box) {
        const rowsB = [['Empty', r.bars[0]], ['Inert', r.bars[1]], [r.content.name, r.bars[2]]];
        const bw = 190, bx = L ? box[2] - bw : box[0];
        tagBoxes.push(O.bars(ctx, bx, box[3] + 6, rowsB, a * r.barsA));
      }
    }
  }
  /* an anchor off the screen (zoomed in on a part) gets no tag: its leader would point at nothing */
  const offScreen = (p, W, H) => p[0] < -20 || p[1] < -20 || p[0] > W + 20 || p[1] > H + 20;
  function shown(ent, st) {
    for (const p of ent.parts) { const sh = p.P.part.show; if (!sh) return true; try { if (sh(st)) return true; } catch (e) { return true; } }
    return false;
  }
  /* evidence -> belief over what is in the container (Empty, Inert, the round) as the slice has seen it */
  function belief(c, age) {
    const u = sat(age / 1.9), e = u * u * (3 - 2 * u), wob = .03 * (1 - u) * Math.sin(age * 23 + c.gi * 2.1);
    let p = c.present ? [lerp(.34, .006, e), lerp(.33, .45, Math.min(1, e * 1.6)) * (1 - ss(.55, .95, u)) + .018 * ss(.55, .95, u), 0]
      : [lerp(.34, .975, e), lerp(.33, .018, e), 0];
    p[0] = Math.max(.002, p[0] + wob); p[2] = Math.max(.002, 1 - p[0] - p[1]);
    if (!c.present) { p[2] = Math.max(.002, 1 - p[0] - p[1]); }
    return p;
  }

  /* the slice: its tag rides the front along the roof line; the station it is cutting, centred below */
  function drawSlice(ctx, W, H, A) {
    const V = S, subj = V.subj, ax = subj.axis, xk = V.xr.k, z = V.front;
    if (xk <= 0 || xk >= 1 || V.phase === 'out') return;
    const inside = z > ax.z0 && z < ax.z1;
    const a = A * ss(ax.z0, ax.z0 + ax.L * .06, z) * (1 - ss(ax.z1 - ax.L * .06, ax.z1, z));
    if (!inside || a < .02) return;
    const top = subj.topAt(z), zs = `${ax.name} ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(ax.L > 60 ? 1 : 2)} m`;
    q3[0] = 0; q3[1] = 0; q3[2] = 0; q3[ax.i] = z; q3[ax.u] = top + ax.L * .006; toWorld(V.R0, V.T0, q3, w3);
    const p = pcam.project(w3, [0, 0, 0]);
    if (p) {
      // above the roof line and clear of the placards: it climbs over any it would sit on (gone when there is no room)
      const lab = `${subj.shortTitle} · ${subj.scanWord}`, w = O.tagWidth(ctx, 'X-ray', lab, zs);
      const x = Math.min(W - 24 - w, Math.max(24, p[0] - 6));
      const L = Math.max(34, Math.min(90, (V.mbox ? (V.mbox[3] - V.mbox[1]) * .22 : 60)));
      let qy = Math.max(62, p[1] - L);
      for (let it = 0; it < 8; it++) {
        let hit = null;
        for (const b of tagBoxes) if (b && x < b[2] + 6 && x + w > b[0] - 6 && qy - 22 < b[3] + 4 && qy > b[1] - 4) { hit = b; break; }
        if (!hit) break;
        qy = hit[1] - 8;
      }
      if (qy >= 48) {
        O.leader(ctx, p[0], p[1], p[0], qy, LIME, .8 * a);
        O.tag(ctx, x, qy - 22, 'X-ray', lab, zs, { kind: 'lime', a });
      }
    }
    const en = subj.stationAt(z);
    if (en) {
      // the station it is cutting, centred low (below the columns when one reaches down there)
      const w = O.tagWidth(ctx, zs, en.label, en.size || ''), x0 = W / 2 - w / 2;
      let y = H - 138;
      for (const b of tagBoxes) if (b && x0 < b[2] + 6 && x0 + w > b[0] - 6 && y < b[3] + 4 && y + 20 > b[1] - 4) { y = H - 96; break; }
      O.tag(ctx, W / 2, y, zs, en.label, en.size || '', { kind: 'lime', a: a * .95, align: 'center' });
    }
  }

  /* the readout block, top left: kicker, name, the public line, then mono facts (faint labels, white values) */
  function drawReadout(ctx, W, H, A) {
    const V = S, subj = V.subj, x = 40;
    let y = 58;
    const phase = V.ex.e > .02 ? 'Exploded' : V.xr.k > 0 && V.xr.k < 1 ? 'X-ray' : V.xr.k >= 1 ? 'X-ray · open' : 'Assembled';
    const kickTxt = V.kind === 'museum' ? `Anatomy · ${String(V.museumIdx + 1).padStart(2, '0')} / ${MUSEUM_KEYS.length} · ${groupOf(V.key)}` : V.kind === 'proj' ? `Inspect · round in flight · ${phase}` : `Inspect · ${phase}`;
    O.kick(ctx, x + 2, y, kickTxt, A);
    y += 34;
    O.sans(ctx, x, y, subj.title, { size: 22, weight: 600, ls: -.4, a: A });
    y += 12;
    let lines = 0;
    if (subj.note) { lines = O.sans(ctx, x, y + 17, subj.note, { size: 13.5, col: DIM, wrap: 440, a: A, lh: 19 }); y += 17 + (lines - 1) * 19; }
    y += 30;
    const F = FAINT, Wt = WHITE;
    const L = [];
    const u = V.kind === 'unit' ? V.u : null, own = !u || u.side === game.side;
    if (u && !own) {
      const c = sim.contact(game.side, u.id);
      L.push([[c ? c.track : 'TRK', CORAL], [' · ', F], [TRACK[u.type] || u.def.name, Wt]]);
      L.push([['Conf ', F], [c ? c.conf.toFixed(2) : '—', Wt], [' · ', F], [c && c.identified ? 'identified · scan' : 'fog off', c && c.identified ? LIME : Wt]]);
    }
    if (subj.size) L.push([['Size ', F], [subj.size, Wt]].concat(u ? [[' · ', F], [u.def.cls, Wt]] : [[' · ', F], [(subj.kind || '').replace('cut', 'unit'), Wt]]));
    if (u && own) {
      const hpK = u.hp / u.hpMax;
      L.push([['HP ', F], [`${Math.ceil(u.hp)} / ${u.hpMax}`, hpK < 1 ? CORAL : Wt], [' · ', F], [status(u), Wt]]);
    }
    if (u) {
      const d = u.def;
      if (d.domain === 'sea') L.push([['Speed ', F], [`${(u.speed / .5144).toFixed(1)} kn`, Wt], [' · max ', F], [`${Math.round(d.speed / .5144)} kn`, Wt]]);
      else if (d.domain === 'air') L.push([['Speed ', F], [`${Math.round(u.speed * 3.6)} km/h`, Wt], [' · alt ', F], [`${Math.round(u.pos[1])} m`, Wt]]);
      else if (d.speed > 0) L.push([['Speed ', F], [`${Math.round(u.speed * 3.6)} km/h`, Wt], [' · road ', F], [`${Math.round((d.road || d.speed) * 3.6)} km/h`, Wt]]);
    }
    if (V.kind === 'proj' && V.p) {
      const p = V.p, P = p.P || game.PROJ[p.kind] || {}, v = p.vel ? Math.hypot(p.vel[0], p.vel[1], p.vel[2]) : p.spd || 0;
      L.push([[P.name || p.kind, p.side === game.side ? LIME : CORAL], [' · ', F], [P.cls || '', Wt]]);
      L.push([['Speed ', F], [`${Math.round(v)} m/s`, Wt], [' · M ', F], [(v / 340).toFixed(2), Wt], [' · alt ', F], [`${Math.round(p.pos[1])} m`, Wt]]);
      L.push([['Phase ', F], [p.phase || '—', Wt], [' · t+', F], [`${(p.age || 0).toFixed(1)} s`, Wt]]);
    }
    const mass = MASS[V.key] || MASS[subj.key];
    if (mass) L.push([['Mass ', F], [mass, Wt]]);
    L.push([['X-ray ', F], [`${Math.round(V.xr.k * 100)} %`, V.xr.k > 0 && V.xr.k < 1 ? LIME : Wt], [' · exploded ', F], [`${Math.round(V.ex.e * 100)} %`, V.ex.e > 0 && V.ex.e < 1 ? LIME : Wt]]);
    if (V.kind !== 'museum') {
      const rate = game.paused ? ['Paused', Wt] : game.timeRate === BULLET ? [`x${BULLET}`, LIME] : [`x${game.timeRate}`, Wt];
      L.push([rate, [game.timeRate === BULLET && !game.paused ? ' · bullet time · ' : ' · ', F], [`T+${game.fmtTime ? game.fmtTime(sim.t) : sim.t.toFixed(0)}`, F]]);
    }
    if (V.lostT) L.push([[V.lostWhy, CORAL]]);
    for (const segs of L) { O.runs(ctx, x, y, segs, { size: 11.5, a: A }); y += 21; }
    return y;
  }
  /* the rate, always on screen (the HUD is hidden while inspecting) */
  function drawTimeChip(ctx, W, A) {
    const V = S; if (!V || V.kind === 'museum') return;
    const bt = game.timeRate === BULLET && !game.paused;
    const id = game.paused ? 'Paused' : `x${game.timeRate}`;
    O.tag(ctx, W / 2, 22, id, bt ? 'Bullet time' : 'Inspect', `T+${game.fmtTime ? game.fmtTime(sim.t) : Math.floor(sim.t)}`, { kind: game.paused ? 'white' : 'lime', a: A, align: 'center', size: 11 });
  }
  function drawKeys(ctx, W, H, A) {
    const V = S;
    const list = [['E', V.ex.on ? 'Assemble' : 'Explode'], ['X', 'X-ray'], ['Drag', 'Orbit'], ['Wheel', 'Zoom'], ['Click', 'Frame part'], ['H', 'Tags']];
    if (V.kind === 'museum') list.unshift(['← →', 'Walk']);
    list.push(['Esc', 'Leave']);
    O.keys(ctx, W / 2, H - 50, list, A * .95);
  }
  /* a dotted scale bar, a round number of metres near 120 px at the focus distance */
  function drawScale(ctx, W, H, A) {
    const V = S, d = Math.max(1e-3, cam.dist), mpp = d / cam.fl * K;   // metres per px at the focus (cam.fl is in CSS px; this layer draws in 1080p px, x K)
    const target = 130 * mpp, steps = [.1, .2, .5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let m = steps[0]; for (const s of steps) if (s <= target) m = s;
    const len = m / mpp;
    O.scaleBar(ctx, W - 40 - len - 60, H - 38, len, m >= 1 ? `${m} m` : `${Math.round(m * 100)} cm`, A * .9);
  }
  function drawNote(ov, ctx) {
    const u = note.u; if (!u) return;
    const a = 1 - ss(1.6, 2.2, game.realT - note.t0);
    const c = sim.contact(game.side, u.id), v = game.vis(u);
    if (!c && v !== 'track') return;
    const pos = c && v !== 'track' ? c.pos : game.unitPose(u).pos;
    if (!pcam.project(pos, s3)) return;
    O.adot(ctx, s3[0], s3[1], CORAL, a);
    O.leader(ctx, s3[0], s3[1], s3[0] + 22, s3[1] + 30, CORAL, .8 * a);
    O.tag(ctx, s3[0] + 26, s3[1] + 30, c ? c.track : 'TRK', note.text, 'Scan · X', { kind: 'coral', a });
  }

  /* ------------------------------------------------------------ input */
  const PASS_KEYS = new Set(['Space', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract']);
  function onKey(e) {
    const down = e.type === 'keydown';
    if (!S || S.phase === 'out') {
      if (!down || e.ctrlKey || e.metaKey || e.altKey || e.code !== 'KeyI' || e.repeat) return false;
      if (e.shiftKey) { if (game.mode === 'sandbox') { openMuseum(); return true; } return false; }
      return openAtCursorOrSelection();
    }
    const V = S;
    if (PASS_KEYS.has(e.code)) return false;
    if (!down) return /^Key|^Digit|^Arrow|Tab|Bracket/.test(e.code);
    if (e.repeat && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return true;
    switch (e.code) {
      case 'Escape': case 'KeyI': close(); return true;
      case 'KeyE': toggleExplode(V); return true;
      case 'KeyX': V.xr.on = !V.xr.on; if (V.xr.on) V.xr.t0 = Math.min(V.xr.t0, V.t); return true;
      case 'KeyH': case 'F10': hideTags = !hideTags; return true;
      case 'ArrowRight': case 'BracketRight': case 'ArrowLeft': case 'BracketLeft':
        if (V.kind === 'museum') { const dir = e.code === 'ArrowRight' || e.code === 'BracketRight' ? 1 : -1; walk(dir); }
        return true;
      case 'Backspace': setFocus(null); return true;
    }
    return /^Key|^Digit|^Arrow|Tab|Bracket|Delete|Page/.test(e.code);
  }
  /* E: the assemblies float apart with the steel closed (the films' rhythm: X-ray, then the exploded view), and
     come home in reverse; the X-ray comes back as it was */
  function toggleExplode(V) {
    const ex = V.ex;
    ex.on = !ex.on; ex.idle = 0;
    if (ex.on) { ex.xrWas = V.xr.on; V.xr.on = false; }
    else if (ex.xrWas !== undefined) { V.xr.on = ex.xrWas; if (V.xr.on) V.xr.t0 = Math.min(V.xr.t0, V.t + EX_BACK * .6); ex.xrWas = undefined; }
  }
  function walk(dir) {
    const V = S, i = (V.museumIdx + dir + MUSEUM_KEYS.length) % MUSEUM_KEYS.length;
    openMuseum(MUSEUM_KEYS[i]);
  }
  function openAtCursorOrSelection() {
    const m = game.mouse;
    if (m && m.in) { const p = projUnder(m.x, m.y, 20); if (p) return openProj(p); }
    for (const id of game.selection) { const u = sim.units.get(id); if (u) { openUnit(u); return true; } }
    if (game.hover) { const u = sim.units.get(game.hover); if (u) { openUnit(u); return true; } }
    bus.emit('toast', { text: 'SELECT A UNIT TO INSPECT', bad: true });
    return true;
  }
  function onPointer(ev) {
    if (!S || S.phase === 'out') {
      // Alt + click or double-click: a round in flight, or a unit (double-click on own units stays "select all")
      if ((ev.type === 'dblclick' || (ev.type === 'click' && ev.alt)) && ev.button === 0) {
        const pr = projUnder(ev.x, ev.y, 22);
        const u = game.pickUnit ? game.pickUnit(ev.x, ev.y) : (R.pick(ev.x, ev.y) && sim.units.get(R.pick(ev.x, ev.y).id));
        if (ev.alt) { if (pr && !u) return openProj(pr) || true; if (u) { openUnit(u); return true; } if (pr) return openProj(pr) || true; return false; }
        if (pr && !u) return openProj(pr) || true;
        if (u && u.side !== game.side) { openUnit(u); return true; }
      }
      return false;
    }
    const V = S;
    if (ev.type === 'wheel') { V.manual = true; V.ex.idle = 0; return false; }
    if (ev.type === 'down') { if (ev.button === 0) V.drag = { x: ev.x, y: ev.y }; V.ex.idle = 0; return true; }
    if (ev.type === 'move') {
      if (V.drag && game.mouse.down === 0) {
        const dx = ev.x - V.drag.x, dy = ev.y - V.drag.y; V.drag.x = ev.x; V.drag.y = ev.y;
        cam.goal.yaw += dx * .0055 * (cam.invert ? -1 : 1); cam.goal.pitch = clamp(cam.goal.pitch + dy * .0045, cam.minPitch, cam.maxPitch);
        if (V.fly) V.fly = null;
      } else V.hover = hoverAt(ev.x / K, ev.y / K);
      return true;
    }
    if (ev.type === 'up') { V.drag = null; return true; }
    if (ev.type === 'click') {
      if (ev.button !== 0) return true;
      const ent = hoverAt(ev.x / K, ev.y / K);
      setFocus(ent && ent !== V.focus ? ent : null);
      return true;
    }
    if (ev.type === 'dblclick') return true;
    return true;
  }
  /* the tag under the cursor, else the smallest part box under it (x, y in the 2D layer's 1080p px) */
  function hoverAt(x, y) {
    for (const h of hits) { const b = h.box; if (x >= b[0] - 2 && x <= b[2] + 2 && y >= b[1] - 2 && y <= b[3] + 2) return h.ent; }
    let best = null, ba = 1e18;
    for (const ent of S.subj.entries) {
      const b = ent.box; if (!b || !S.tags.has(ent)) continue;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) { const a = (b[2] - b[0]) * (b[3] - b[1]); if (a < ba) { ba = a; best = ent; } }
    }
    return best;
  }

  /* ------------------------------------------------------------ the system */
  const sys = {
    name: 'inspect', priority: 100, always2d: true,
    get active() { return !!S && S.phase !== 'out'; },
    init() {
      bus.on('rate', d => { if (S && d && d.why !== 'inspect') S.timeTouched = true; });
      bus.on('event', e => {
        if (!S || S.kind !== 'proj') return;
        if ((e.proj === S.id || e.id === S.id) && (e.type === 'hit' || e.type === 'intercept' || e.type === 'splash' || e.type === 'miss')) S.lastEvent = e.type === 'hit' ? 'Hit' : e.type === 'intercept' ? 'Intercepted' : e.type === 'splash' ? 'Splash' : 'Miss';
      });
      // warm the cutaway of what is selected: the next thing inspected is usually that
      bus.on('select', sel => {
        const id = sel && sel.size ? sel.values().next().value : null, u = id ? sim.units.get(id) : null;
        if (!u) return;
        const key = modelKeyOfUnit(u);
        if (subjects.has(key)) return;
        setTimeout(() => { if (!S) subjectOf(key); }, 120);
      });
      if (game.mode === 'sandbox' && game.uiRoot) paletteStop = attachPaletteRow(game.uiRoot, () => openMuseum());
      game.inspect = { open: id => openUnit(sim.units.get(id)), openProj: id => openProj(sim.projectiles.get(id)), museum: key => openMuseum(key), close, can,
        get active() { return !!S && S.phase !== 'out'; }, get state() { return S; } };
    },
    update, draw3d, draw2d, onKey, onPointer,
    dispose() { if (paletteStop) paletteStop(); if (S) finish(true); },
  };
  return sys;
}
