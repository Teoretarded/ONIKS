/* Hit replay: a decisive hit becomes a moment from the Anatomy films.

   When a heavy round (3M55 Oniks, Kh-35U, Kalibr, Tomahawk, SLAM-ER) is about to hit a ship or a major unit the player can see (own,
   or an enemy track), or on the final blow of the match:
     1. time eases down to x0.25 (the rate is on screen) and the camera glides in, no cut, across the target, low;
     2. the lime X-ray front sweeps the hull along its length and crosses the impact station at the moment of impact
        (the Inspect cutaway: the shell goes ghost behind the front, the interior shows);
     3. the parts that took damage flash coral, their true names (data/anatomy.js) condensing beside the model, the
        front's own passing tags flickering lime as it identifies the rest;
     4. a destroyed hull drifts slightly apart along its explode offsets as it breaks (the steel closed again);
     5. the camera pulls back and round to the sinking hull, and time eases back to the rate it was.
   6-10 s of real time. One at a time, with a cooldown (a kill waits less; the final blow never). Only what the player
   can see. Esc / Space skip; any camera input hands the camera back at once; C, I and other keys end it and go on.
   A hit seen too late to be caught on the way in (high rates) is picked up just after, the beats played on arrival.
   J replays the last decisive hit (the round comes in again on the hull, the flash, the same beats). The automatic
   replay is the Hit replay setting (data/settings.js hitReplay, on by default; the Settings screen, the pause menu's
   settings, or Shift + J here, which saves it).

   game.replay = { active, auto, last, play(), skip(), setAuto(on) }; bus 'replay' { on, id }.
   bus 'replay-peak' (the end screen's kill stills, match.js): once per impact of a live or late replay (not J), PEAK s
   after it, the X-ray open and the broken parts named: { n (the replay), id, type, side, own, dead, fin, kind, title,
   short, track, tags: [{ id, label, v }], t, worth, box: the hull and its placards on screen (0..1, set as that frame's
   overlay is drawn) }; the Esc chip is left off that frame (it is the still).
   Built from the Inspect pieces (ui/inspect/subject.js: the cutaway, its parts, anchors and boxes;
   ui/inspect/overlay.js: the films' tags), never the Inspect view itself. Outside a replay it costs one pass over the
   rounds in flight per frame. */
import { attitude } from '../engine/models.js';
import { makeSubject, toWorld, apX } from '../ui/inspect/subject.js';
import * as O from '../ui/inspect/overlay.js';
import { TRACK } from './labels.js';
import { DEG, clamp, sat, ss, ease, wrapPi, newPose, lookFrom, blendPose, bumpOf, glideDur, putCam, camState, acrossView, blockedBy } from './director.js';
import { setSetting, onSettings } from '../data/settings.js';

const RATE = .25;                          // the replay's time rate
const RAMP_IN = .35, RAMP_OUT = .55;       // real s
const LEAD = .3;                           // real s from the camera's arrival to the impact
const COOL = 40, COOL_KILL = 12;           // real s between automatic replays (a kill waits less)
const PEAK = 1.0;                          // real s from an impact to its still (the coral names have condensed)
const RATES = [1, 2, 4, 8, 16, 32];
const HEAVY = { oniks: 1, tlam: 1, slam: 1, uran: 1, kalibr: 1 };
const LIME = O.LIME, CORAL = O.CORAL, FAINT = 'rgba(255,255,255,.36)', WHITE = '#FFFFFF';
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);
const MODS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);

const major = u => !!u && !u.aboard && (u.def.domain === 'sea' || !!u.def.hq || u.type === 'tel' || u.type === 'radar' || u.type === 'pantsir' || u.type === 'transloader');
const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

export async function createReplay(game, ctx) {
  const AN = await import('../data/anatomy.js');
  const DM = (ctx && ctx.DM) || game.models;
  const { sim, R } = game, cam = R.camera, bus = game.bus;
  const subjects = new Map();
  const partsSeen = new Map();     // unit id -> its parts as of the last damage seen (what a hit changed)
  const flight = new Map();        // heavy round id -> { dir, spd, kind, side } its last flight
  let S = null;                    // the replay (running, or fading out)
  let last = null;                 // the last decisive hit, for J
  let nextOk = 0, nextKill = 0, lastHull = 0, serial = 0;   // the hull of the last replay: her sinking never waits
  let auto = readAuto();
  const q3 = [0, 0, 0], w3 = [0, 0, 0], s3 = [0, 0, 0], e3 = [0, 0, 0], l3 = [0, 0, 0];
  const HC = Array.from({ length: 8 }, () => [0, 0, 0]);
  const want = newPose(), cur = newPose();
  const follow = () => cur.T;
  const boxes = [];                // the placards drawn this frame (the slice's tag keeps clear of them)
  /* the 2D layer is laid out in 1080p px and drawn scaled by the HUD's scale K (the overlay's ui): projections go
     through pcam */
  let K = 1;
  const pcam = { project(p, o) { const r = cam.project(p, o); if (r) { r[0] /= K; r[1] /= K; } return r; } };

  function readAuto() {
    const s = game.settings || {};
    return s.hitReplay === undefined ? true : !!s.hitReplay;
  }
  /* the setting, saved (the Settings screen and the in-game panel show it); changes from there come back here */
  function setAuto(on) {
    auto = !!on;
    setSetting('hitReplay', auto);
    bus.emit('toast', { text: auto ? 'HIT REPLAY ON' : 'HIT REPLAY OFF' });
  }
  const offSettings = onSettings(s => { auto = s.hitReplay === undefined ? true : !!s.hitReplay; });
  function subjectOf(key) {
    if (!subjects.has(key)) {
      let s = null;
      try { s = makeSubject(R, AN, DM, key); } catch (e) { console.error('replay: subject ' + key, e); }
      if (s) prepSubject(s);
      subjects.set(key, s);
    }
    return subjects.get(key);
  }
  /* per subject: each part's resting centre (model space), its own partX, sim part -> cut parts */
  function prepSubject(s) {
    s.pose({ R0: [1, 0, 0, 0, 1, 0, 0, 0, 1], T0: [0, 0, 0], st: s.st0, e: 0 }, AN);
    for (const p of s.parts) {
      const b = s.partsBounds([p]);
      p.rc = b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : [0, 0, 0];
      p.rx = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: [0, 0, 0] };
      const ax = [hash(p.i, 1) - .5, hash(p.i, 2) - .5, hash(p.i, 3) - .5], l = Math.hypot(ax[0], ax[1], ax[2]) || 1;
      p.tiltAx = [ax[0] / l, ax[1] / l, ax[2] / l]; p.tiltS = hash(p.i, 4) > .5 ? 1 : -1;
    }
  }
  function inverseMap(s, u) {
    if (!s.simMap || s.simMapFor !== u.type) { s.mapDamage(u.def.model, u.parts); s.simMapFor = u.type; s.inv = null; }
    if (!s.inv) {
      s.inv = new Map();
      for (const [cut, list] of s.simMap) for (const sp of list) { if (!s.inv.has(sp)) s.inv.set(sp, []); s.inv.get(sp).push(cut); }
    }
    return s.inv;
  }
  const visible = u => { const v = u && game.vis(u); return v === 'own' || v === 'track'; };
  function finalOf(u) {
    const Sd = sim.sides[u.side];
    if (u.def.hq && Sd.hadHq) return true;
    if (Sd.hadHq) return false;
    for (const v of sim.units.values()) if (v !== u && v.side === u.side && v.alive && !v.aboard) return false;
    return !(Sd.queue && Sd.queue.length);
  }
  function busy() { return (game.inspect && game.inspect.active) || game.paused; }
  const copyParts = u => { const o = {}; for (const k in u.parts) o[k] = u.parts[k]; return o; };

  /* ------------------------------------------------------------------ when */
  function ttiSim(p, u) {
    const H = Math.min(u.def.size[2] * .4, 14);
    const d = Math.max(0, Math.hypot(u.pos[0] - p.pos[0], u.pos[1] + H - p.pos[1], u.pos[2] - p.pos[2]) - Math.max(6, u.def.size[1] * .5));
    return d / Math.max(80, p.spd || 200);
  }
  function flyFor(u) {
    const tr = Math.hypot(cam.target[0] - u.pos[0], cam.target[2] - u.pos[2]), d1 = Math.max(170, u.def.size[0] * 1.9);
    return clamp(1.05 + .42 * Math.log(1 + tr / 700) + .16 * Math.abs(Math.log(d1 / Math.max(1, cam.dist))), 1.3, 2.4);
  }
  /* sim seconds that will pass from now to the impact if the replay starts now */
  function ttiNeed(u) {
    const r0 = game.timeRate, fly = flyFor(u);
    return (r0 + RATE) / 2 * RAMP_IN + RATE * Math.max(0, fly + LEAD - RAMP_IN);
  }
  /* the heavy round nearest its impact on this hull */
  function nextRound(u) {
    let nx = null, nt = 1e9;
    for (const q of sim.projectiles.values()) {
      if (!q.alive || q.tk !== 'unit' || q.target !== u.id || !HEAVY[q.kind]) continue;
      const tt = ttiSim(q, u); if (tt < nt) { nt = tt; nx = q; }
    }
    return nx;
  }
  function watch(dt) {
    if (!auto || (S && S.phase !== 'out') || busy()) return;
    const now = game.realT;
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !HEAVY[p.kind] || p.tk !== 'unit') continue;
      const u = sim.units.get(p.target);
      if (!u || !u.alive || !major(u) || !visible(u)) continue;
      const P = p.P || game.PROJ[p.kind];
      const kill = u.hp <= P.dmg + .01, fin = kill && finalOf(u);
      if (!fin && now < (kill ? (u.id === lastHull ? 0 : nextKill) : nextOk)) continue;
      if (p.phase !== 'final' && !p.locked && ttiSim(p, u) > 30) continue;
      const tti = ttiSim(p, u);
      if (tti <= ttiNeed(u) + game.timeRate * dt) { start({ mode: 'live', u, p, fin }); return; }
    }
  }
  function track() {
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !HEAVY[p.kind] || p.tk !== 'unit') continue;
      let f = flight.get(p.id);
      if (!f) { f = { dir: [0, 0, 1], spd: 0, kind: p.kind, side: p.side }; flight.set(p.id, f); }
      const v = p.vel, s = Math.hypot(v[0], v[1], v[2]) || 1;
      f.dir[0] = v[0] / s; f.dir[1] = v[1] / s; f.dir[2] = v[2] / s; f.spd = s;
    }
    if (flight.size > 96) for (const id of flight.keys()) if (!sim.projectiles.has(id)) flight.delete(id);
  }

  /* ------------------------------------------------------------------ start / end */
  /* o: { mode: 'live' | 'after' | 'again', u, p (live), e (after: the hit), rec (again), fin } */
  function start(o) {
    const u = o.u || null, rec = o.rec || null;
    const def = u ? u.def : game.UNITS[rec.type];
    const subj = subjectOf(u ? u.def.model : rec.key);
    if (!subj || !def) return false;
    if (u) inverseMap(subj, u);
    // one still fading out hands over what it will restore (the world, the rate, the view the player had)
    const prev = S;
    if (prev) { R.worldBright = prev.wb0; S = null; }
    const V = {
      mode: o.mode, id: u ? u.id : rec.id, u, rec, def, subj, sea: def.domain === 'sea', fin: !!o.fin,
      side: u ? u.side : rec.side, kind: o.p ? o.p.kind : rec ? rec.kind : o.e ? o.e.kind : '',
      proj: o.p ? o.p.id : 0, t: 0, phase: 'in', uiA: 0,
      tI: 0, tHit: -1, tDead: -1, tGone: -1, tPull: 1e9, tEnd: 1e9,
      rate0: prev ? prev.rateTo : RATES.includes(game.timeRate) ? game.timeRate : game.timeRate > 1 ? 4 : 1, rateTouched: false,
      ui0: prev ? prev.ui0 : game.ui.hidden, wb0: prev ? prev.wb0 : R.worldBright,
      cam0: prev ? prev.cam0 : { target: cam.target.slice(), dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch, followFn: cam.followFn, followOff: cam.followOff ? cam.followOff.slice() : [0, 0, 0] },
      T0: [0, 0, 0], R0: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: {}, hdg: 0,
      imp: null, impLocal: null, appr: 0, csd: 1, fly: 1.6, blend: null, look: [0, 0, 0],
      front: null, flash: new Map(), dmgCut: {}, before: null, after: null,
      tags: [], passed: new Map(), rows: new Map(), inst: null, pull: 0, roundGone: false, handsOff: false,
      track: rec ? rec.track : null, pending: o.mode === 'live', tLast: -1,
      // the hull as it was when the replay began: its type and parts outlive the unit (a sunk hull is removed while
      // the replay still plays; strike() and the readout fall back to this)
      keep: u ? { id: u.id, type: u.type, def: u.def, parts: copyParts(u), hpMax: u.hpMax } : null,
    };
    if (!resolve(V)) { S = prev; return false; }
    V.n = ++serial;
    // what the hull looked like before (the hit's damage shows at the impact)
    V.before = rec ? rec.before : u && o.mode === 'live' ? (partsSeen.get(u.id) || copyParts(u)) : o.before || {};
    V.after = rec ? rec.after : null;
    V.dead = rec ? rec.destroyed : u ? !u.alive : false;
    // the line of approach
    if (o.p) V.appr = Math.atan2(o.p.vel[0], o.p.vel[2]);
    else if (rec) { const d = rec.dirLocal, x = V.R0[0] * d[0] + V.R0[1] * d[1] + V.R0[2] * d[2], z = V.R0[6] * d[0] + V.R0[7] * d[1] + V.R0[8] * d[2]; V.appr = Math.atan2(x, z); }
    else if (o.dir) V.appr = Math.atan2(o.dir[0], o.dir[2]);
    else { const f = o.e && sim.units.get(o.e.from); V.appr = f ? Math.atan2(V.T0[0] - f.pos[0], V.T0[2] - f.pos[2]) : cam.yaw; }
    // the side the camera stands on: the one it is nearer now (over water for a land target if it can)
    let bs = 1e9;
    for (const s of [1, -1]) {
      const yaw = V.appr + s * 1.2, d = Math.max(200, def.size[0] * 2);
      let c = Math.abs(wrapPi(yaw - cam.yaw));
      if (!V.sea) { const h = game.ground(V.T0[0] - Math.sin(yaw) * d, V.T0[2] - Math.cos(yaw) * d); c += h > .5 ? .8 : 0; }
      if (c < bs) { bs = c; V.csd = s; }
    }
    V.fly = u ? flyFor(u) : 1.8;
    V.ramp = RAMP_IN; V.rampFrom = Math.max(RATE, game.timeRate);
    if (o.mode === 'live') {
      // the ease down to x0.25 takes up the sim time a coarse frame at a high rate overshot, so the impact still
      // lands a moment after the camera arrives
      const T = V.fly + LEAD, r0 = V.rampFrom, tti = ttiSim(o.p, u);
      if (r0 > RATE + .05) V.ramp = clamp((tti - RATE * T) * 2 / (r0 - RATE), .2, Math.max(.2, T - .3));
      const s0 = S; S = V; V.tI = impactIn(o.p, u, 0); S = s0;
    }
    else if (o.mode === 'after') { V.tI = V.fly + .12; if (o.e) V.imp = o.e.pos.slice(); }
    else { V.tI = V.fly + 1.1; }
    if (rec) {
      V.impLocal = rec.impLocal.slice();
      V.dirW = [0, 0, 0]; V.spd = rec.spd || 700;
    }
    // the sweep: along the long axis, left to right on screen (worked out when it starts)
    const ax = subj.axis, band = Math.max(.06, ax.L * .011), glow = Math.max(.15, ax.L * .03);
    V.front = { s: 1, band, glow, z: 0, v: ax.L / clamp(1.7 + ax.L * .004, 1.7, 2.6), zImp: (ax.z0 + ax.z1) / 2, started: false, done: false, closing: false, closed: false, tDone: 0 };
    if (V.impLocal) V.front.zImp = clamp(V.impLocal[ax.i], ax.z0, ax.z1);
    V.inst = newInst(subj);
    V.blend = { t0: 0, from: camState(cam), bump: -1, dur: V.fly };
    // time, the world, the UI
    S = V;
    V.tRamp = 0;
    // a mouse resting at the screen edge would pan against the replay's camera
    const dr = game.getSystem('director');
    V.edge0 = prev ? prev.edge0 : dr && dr.on && dr.edgeWas !== undefined ? dr.edgeWas : cam.edge; cam.edge = false;
    if (!game.ui.hidden) game.setUiHidden(true);
    bus.emit('rate', { rate: RATE, paused: false, why: 'replay' });
    bus.emit('replay', { on: true, id: V.id });
    return true;
  }
  /* real seconds until the impact from the round's state now (live) */
  function impactIn(p, u, t) {
    const tti = ttiSim(p, u), r = game.timeRate, ramp = S && S.ramp || RAMP_IN;
    if (t < ramp) {
      // still easing down: the sim time the rest of the ramp covers, then x0.25
      const rem = ramp - t, simR = (r + RATE) / 2 * rem;
      return t + (tti <= simR ? tti / Math.max(RATE, (r + RATE) / 2) : rem + (tti - simR) / RATE);
    }
    return t + tti / RATE;
  }
  function newInst(subj) {
    const d = { key: subj.cutKey, T: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: null, tint: null, tintK: 0, tintFace: 0, alpha: 1, bright: 1,
      partXray: {}, partGate: {}, partAlpha: {}, partX: {}, damage: null, gate: { n: [0, 0, 1], d: 0, w: 1, g: 1, mode: 0 }, dissolve: 0 };
    for (const p of subj.parts) {
      d.partXray[p.name] = p.cls === 'shell' ? 1 : 0;
      d.partGate[p.name] = p.cls === 'shell' ? 1 : p.cls === 'hidden' ? 2 : 3;
    }
    return d;
  }
  /* the hull's pose and state this frame (the unit's; the kept one once it is gone) */
  function resolve(V) {
    const u = sim.units.get(V.id);
    if (u) {
      V.u = u;
      // the latest parts, kept for when the unit is gone
      if (V.keep) { const k = V.keep.parts; for (const n in u.parts) k[n] = u.parts[n]; }
      const p = game.unitPose(u);
      V.T0[0] = p.pos[0]; V.T0[1] = p.pos[1]; V.T0[2] = p.pos[2]; V.hdg = p.hdg;
      const Ra = attitude(p.hdg, p.pitch, p.roll); for (let i = 0; i < 9; i++) V.R0[i] = Ra[i];
      const st = V.st, s0 = V.subj.st0;
      for (const k in s0) st[k] = s0[k];
      if (u.st) for (const k in u.st) st[k] = u.st[k];
      st.xray = 1;
      return true;
    }
    V.u = null;
    if (V.rec && !V.posed) {
      const P = V.rec.pose; V.posed = true;
      for (let i = 0; i < 3; i++) V.T0[i] = P.T0[i]; for (let i = 0; i < 9; i++) V.R0[i] = P.R0[i];
      Object.assign(V.st, V.subj.st0, P.st, { xray: 1 });
      return true;
    }
    return V.t > 0 || V.posed;
  }
  /* the end: time eases back, the camera glides home (or to the director), the UI returns, the cutaway hands the hull
     back to the live model */
  function finish(skip, handsOff) {
    const V = S;
    if (!V || V.phase === 'out') return;
    V.phase = 'out'; V.tOut = V.t; V.skip = !!skip; V.fade = skip ? .35 : .8;
    V.rateFrom = game.timeRate;
    V.rateTo = game.result ? Math.min(V.rate0, 1) : V.rate0;
    if (skip && !V.rateTouched) setRate(V.rateTo);
    const dir = game.getSystem('director');
    if (dir && dir.on) { if (dir.resync) dir.resync(); }
    else if (!handsOff) {
      const c = V.cam0;
      cam.flyTo(c.target, { dist: c.dist, yaw: c.yaw, pitch: Math.max(cam.minPitch, c.pitch), time: skip ? 1.1 : 1.6 });
      if (c.followFn) { cam.followFn = c.followFn; cam.followOff = c.followOff; }
    } else { cam.fly = null; cam.followFn = null; }
    if (game.ui.hidden !== V.ui0) game.setUiHidden(V.ui0);
    const dirOn = dir && dir.on;
    if (!dirOn) cam.edge = V.edge0;
    else if (dir.edgeWas !== undefined) dir.edgeWas = V.edge0;
    // the cooldown: a replay that saw no hit (the salvo stopped short) hardly counts
    const hit = V.tHit >= 0;
    nextOk = game.realT + (hit ? COOL : 4); nextKill = game.realT + (hit ? COOL_KILL : 2); lastHull = V.dead ? 0 : V.id;
    bus.emit('replay', { on: false, id: V.id });
  }
  function setRate(r) {
    game.timeRate = r;
    bus.emit('rate', { rate: r, paused: game.paused, why: 'replay' });
  }
  function done() {
    const V = S; if (!V) return;
    R.worldBright = V.wb0;
    S = null;
  }

  /* ------------------------------------------------------------------ the hits */
  /* a hit on the replay's hull: the damage it did (sim parts) -> coral flashes on the cut parts near the impact and
     one tag per broken assembly (the entry nearest the impact among those the sim part covers) */
  function strike(V, changed, imp) {
    const subj = V.subj, u = V.u;
    V.hitAt = V.t;
    if (imp) {
      V.imp = imp.slice();
      const L = [imp[0] - V.T0[0], imp[1] - V.T0[1], imp[2] - V.T0[2]], M = V.R0;
      V.impLocal = [M[0] * L[0] + M[3] * L[1] + M[6] * L[2], M[1] * L[0] + M[4] * L[1] + M[7] * L[2], M[2] * L[0] + M[5] * L[1] + M[8] * L[2]];
    }
    const il = V.impLocal || [0, 0, 0], ax = subj.axis;
    if (V.front && V.impLocal) V.front.zImp = clamp(il[ax.i], ax.z0, ax.z1);
    // the unit, else the hull kept at the start (the unit was removed), else the record (J)
    const inv = u ? inverseMap(subj, u) : V.keep ? inverseMap(subj, V.keep) : V.rec ? invFromRec(subj, V.rec) : null;
    for (const sp in changed) {
      const cuts = (inv && inv.get(sp)) || [];
      let best = null, bd = 1e18;
      for (const n of cuts) {
        const p = subj.byName.get(n); if (!p) continue;
        const dd = Math.hypot(p.rc[0] - il[0], p.rc[1] - il[1], p.rc[2] - il[2]);
        const amp = 1 - ss(ax.L * .1, ax.L * .5, dd);
        V.flash.set(n, { t0: V.t, amp: Math.max(amp, .25) });
        const ent = p.ent && subj.entries.includes(p.ent) ? p.ent : null;
        // a placard under the waterline (shafts, sonar dome) only when nothing above it took the hit
        const wet = V.sea && p.rc[1] < -1.5 ? 1e4 : 0;
        if (ent && dd + wet < bd) { bd = dd + wet; best = ent; }
      }
      const val = changed[sp];
      const label = best ? best.label : ((def => def && def.parts[sp] && def.parts[sp].label)(V.def) || sp);
      let tg = V.tags.find(g => best ? g.ent === best : g.sp === sp);
      // a part without a placard of its own gets the next number after the placards (as the films number them)
      const extra = () => String(subj.entries.length + 1 + V.tags.filter(g => !g.ent).length).padStart(2, '0');
      if (!tg) { tg = { ent: best, sp, label, id: best ? best.id : extra(), t0: V.t, v: 0, local: il.slice(), o: {} }; V.tags.push(tg); }
      tg.v = Math.max(tg.v, val); tg.t1 = V.t;
    }
  }
  function invFromRec(subj, rec) {
    if (subj.invRec) return subj.invRec;
    const tab = {};
    for (const k in rec.after) tab[k] = 1;
    subj.mapDamage(rec.key, tab); subj.simMapFor = rec.type;
    const inv = new Map();
    for (const [cut, list] of subj.simMap) for (const sp of list) { if (!inv.has(sp)) inv.set(sp, []); inv.get(sp).push(cut); }
    subj.invRec = inv; subj.inv = null;
    return inv;
  }
  function diffParts(now, before) {
    const out = {}; let any = false;
    for (const k in now) { if ((now[k] || 0) - (before[k] || 0) > .001) { out[k] = now[k]; any = true; } }
    return any ? out : null;
  }
  /* the record J replays */
  function record(e, u, before) {
    const p = game.unitPose(u), Ra = attitude(p.hdg, p.pitch, p.roll);
    const L = [e.pos[0] - p.pos[0], e.pos[1] - p.pos[1], e.pos[2] - p.pos[2]];
    const loc = v => [Ra[0] * v[0] + Ra[3] * v[1] + Ra[6] * v[2], Ra[1] * v[0] + Ra[4] * v[1] + Ra[7] * v[2], Ra[2] * v[0] + Ra[5] * v[1] + Ra[8] * v[2]];
    const f = flight.get(e.proj), dir = f ? f.dir : [Math.sin(p.hdg + 1.3), 0, Math.cos(p.hdg + 1.3)];
    const c = sim.contact(game.side, u.id);
    last = { id: u.id, type: u.type, key: u.def.model, side: u.side, kind: e.kind, spd: f ? f.spd : 600, t: sim.t, track: c ? c.track : null,
      impLocal: loc(L), dirLocal: loc(dir), before: Object.assign({}, before), after: copyParts(u), destroyed: !u.alive,
      pose: { T0: p.pos.slice(), R0: Ra.slice(), st: Object.assign({}, u.st) } };
  }

  /* ------------------------------------------------------------------ per frame */
  function update(dt) {
    track();
    if (!S || S.phase === 'out') watch(dt);
    const V = S;
    if (!V) return;
    V.t += dt;
    const t = V.t;
    const live = resolve(V);
    const u = V.u;
    // time
    if (V.phase !== 'out') {
      if (!V.rateTouched && t < V.ramp) { const k = ease(sat(t / V.ramp)); game.timeRate = V.rampFrom + (RATE - V.rampFrom) * k; }
      else if (!V.rateTouched && !V.pending) game.timeRate += (RATE - game.timeRate) * (1 - Math.exp(-dt * 5));
    } else if (!V.rateTouched && !V.skip) {
      const k = ease(sat((t - V.tOut) / RAMP_OUT));
      game.timeRate = V.rateFrom + (V.rateTo - V.rateFrom) * k;
      if (k >= 1 && !V.rateSet) { V.rateSet = true; setRate(V.rateTo); }
    }
    // a round on its way in (live: the first, or the next of the salvo): keep the impact time current
    if (V.pending && V.phase !== 'out') {
      const p = sim.projectiles.get(V.proj);
      if (p && p.alive && u && u.alive) {
        if (V.tHit < 0) V.tI = impactIn(p, u, t);
        // a round still far off: time runs faster until it is close, then eases down again (the rate on screen follows)
        if (t >= V.ramp && !V.rateTouched) {
          const tti = ttiSim(p, u), want = tti / RATE > 2.4 ? clamp(tti / 2, RATE, Math.max(1, V.rate0)) : RATE;
          game.timeRate += (want - game.timeRate) * (1 - Math.exp(-dt * 4));
          if (want > RATE + .01 && V.tHit < 0) V.tI = t + 2.4;
        }
      } else if (!V.roundGone) {
        // stopped short: the next round of the salvo on this hull takes its place
        const nx = u && u.alive && V.tHit < 0 ? nextRound(u) : null;
        if (nx && ttiSim(nx, u) < 5) { V.proj = nx.id; V.kind = nx.kind; if (V.tHit < 0) V.tI = Math.min(t + ttiSim(nx, u) / RATE, t + 2.4); }
        else { V.roundGone = true; V.tGone = t; }
      }
      if (V.roundGone && t - V.tGone > .35) {
        if (V.tHit < 0) { V.tPull = Math.min(V.tPull, V.tGone + 1.2); V.tEnd = Math.min(V.tEnd, V.tGone + 2.8); }
        else { V.pending = false; V.tLast = Math.max(V.tLast, t - 2.2); }
      }
    }
    if (t > 17) V.tEnd = Math.min(V.tEnd, t);
    // after / again: the impact beats on arrival
    if ((V.mode === 'after' || V.mode === 'again') && V.tHit < 0 && t >= V.tI) {
      V.tHit = V.tLast = t;
      let before = V.before || {}, after = V.after || (u ? copyParts(u) : V.keep ? V.keep.parts : {});
      const ch = diffParts(after, before) || {};
      if (V.mode === 'again' && V.rec && V.rec.impLocal) { const w = toWorld(V.R0, V.T0, V.rec.impLocal, [0, 0, 0]); strike(V, ch, w); }
      else strike(V, ch, V.imp);
      if (V.dead && V.tDead < 0) V.tDead = t;
    }
    // the timeline after the impact; the rest of the salvo on this hull keeps the replay going: the round that sinks
    // her, or one close behind
    if (V.tHit >= 0 && V.phase !== 'out' && !V.pending) {
      V.tPull = Math.min(14.5, V.tLast + (V.dead ? 4.4 : 3.2));
      V.tEnd = V.tPull + 2.4;
      if (u && u.alive && V.mode !== 'again' && !V.chained && t > V.tLast + 2.2 && t < V.tPull && t < 10) {
        const nx = nextRound(u);
        if (nx) {
          const tti = ttiSim(nx, u), kill = u.hp <= (nx.P || game.PROJ[nx.kind]).dmg;
          if ((kill && tti < 8) || tti / RATE < V.tPull - t + 1) { V.pending = true; V.chained = true; V.proj = nx.id; V.kind = nx.kind; V.roundGone = false; V.tPull = V.tEnd = 1e9; }
        }
      }
    }
    if (V.phase !== 'out' && t >= V.tEnd) finish(false);
    // the peak of the moment, for the end screen's stills
    if (V.mode !== 'again' && V.phase !== 'out' && V.hitAt !== undefined && V.peakOf !== V.hitAt && t - V.hitAt >= PEAK && (V.tags.length || V.dead)) {
      V.peakOf = V.hitAt; V.shot = game.frameN;
      const ty = u ? u.type : V.keep ? V.keep.type : null, df = u ? u.def : V.def;
      bus.emit('replay-peak', V.peakInfo = { n: V.n, id: V.id, type: ty, side: V.side, own: V.side === game.side, dead: !!V.dead, fin: V.fin, kind: V.kind,
        title: V.subj.title, short: V.subj.shortTitle, track: V.track, tags: V.tags.map(g => ({ id: g.id, label: g.label, v: g.v })), t: sim.t,
        worth: df && df.hq ? 3000 : (df && df.cost) || 100 });
    }
    // the sweep, the drift, the camera
    if (live) {
      front(V, dt);
      V.tBreak = V.dead && V.tDead >= 0 ? Math.max(V.tDead, V.tHit >= 0 ? V.tHit : V.tI) + .55 : 1e9;
      poseDrift(V);
      if (V.phase !== 'out') camera(V, dt);
    }
    // the world steps back a little while the hull is the picture
    const k = V.phase === 'out' ? 1 - ss(0, V.fade, t - V.tOut) : ss(0, .8, t);
    R.worldBright = V.wb0 + (V.wb0 * .55 - V.wb0) * k;
    V.uiA = V.phase === 'out' ? Math.max(0, V.uiA - dt / .3) : Math.min(1, V.uiA + dt / .5);
    if (V.phase === 'out' && t - V.tOut > Math.max(V.fade, V.skip ? 0 : RAMP_OUT) + .05) {
      if (!V.rateTouched && !V.rateSet) setRate(V.rateTo);
      done();
    }
  }

  /* the X-ray front: along the hull, on time for the impact station; open, then closing again */
  function front(V, dt) {
    const F = V.front, ax = V.subj.axis, t = V.t;
    if (!F.started) {
      // left to right on screen
      const a = ax.i, nx = V.R0[a], nz = V.R0[6 + a], r0 = Math.cos(cam.yaw), r2 = -Math.sin(cam.yaw);
      F.s = nx * r0 + nz * r2 >= 0 ? 1 : -1;
      F.zS = F.s > 0 ? ax.z0 - F.band * 1.5 : ax.z1 + F.band * 1.5;
      F.zE = F.s > 0 ? ax.z1 + F.glow * 6 : ax.z0 - F.glow * 6;
      const tStart = V.mode === 'after' ? V.fly - .3 : V.tI - Math.abs(F.zImp - F.zS) / F.v;
      if (t >= Math.max(V.fly * .6, tStart)) { F.started = true; F.z = F.zS; }
      return;
    }
    if (!F.done) {
      let v = F.v;
      if (V.tHit < 0 && V.mode !== 'after') {
        const rem = Math.max(.05, V.tI - t), need = (F.zImp - F.z) * F.s;
        v = need > 0 ? clamp(need / rem, F.v * .35, F.v * 2.4) : F.v * .3;
      }
      F.z += F.s * v * dt;
      if ((F.z - F.zE) * F.s >= 0) { F.z = F.zE; F.done = true; F.tDone = t; }
    } else if (!F.closing) {
      if (t - F.tDone > .9) F.closing = true;
    } else if (!F.closed) {
      F.z -= F.s * F.v * 2.2 * dt;
      if ((F.z - F.zS) * F.s <= 0) { F.z = F.zS; F.closed = true; }
    }
    // the front's passing tags
    for (const ent of V.subj.entries) if (!V.passed.has(ent) && (F.z - ent.az) * F.s > 0 && !F.closing) V.passed.set(ent, t);
  }
  /* the frame's parts: at rest, or drifting apart as the hull breaks (explode offsets, a small tilt each) */
  function poseDrift(V) {
    const subj = V.subj, st = V.st, t = V.t;
    for (const p of subj.parts) {
      let X = null;
      try { X = p.P.part.xf ? p.P.part.xf(st) : null; } catch (e) { X = null; }
      p.X = X;
      const en = p.en;
      let k = 0;
      if (en && en.explode && t > V.tBreak) {
        const u = sat((t - V.tBreak - (en.w0 || 0) * 1.1) / 3.6), e = 1 - (1 - u) * (1 - u) * (1 - u);
        k = (V.sea ? .44 : .26) * e * (.55 + (V.dmgCut[p.name] > 0 ? .45 : 0));
      }
      p.k = k;
      const o = p.off;
      if (k > 0) {
        o[0] = en.explode[0] * k; o[1] = en.explode[1] * k; o[2] = en.explode[2] * k;
        const M = X ? X.R : null, Y = p.rx, T = Y.T;
        if (M) { T[0] = M[0] * o[0] + M[3] * o[1] + M[6] * o[2]; T[1] = M[1] * o[0] + M[4] * o[1] + M[7] * o[2]; T[2] = M[2] * o[0] + M[5] * o[1] + M[8] * o[2]; }
        else { T[0] = o[0]; T[1] = o[1]; T[2] = o[2]; }
        // the tilt: about the part's own centre (part space)
        const a = p.tiltAx, ang = p.tiltS * k * .12, c = Math.cos(ang), s = Math.sin(ang), C = 1 - c;
        const Rm = Y.R, x = a[0], y = a[1], z = a[2];
        Rm[0] = c + x * x * C; Rm[1] = x * y * C - z * s; Rm[2] = x * z * C + y * s;
        Rm[3] = y * x * C + z * s; Rm[4] = c + y * y * C; Rm[5] = y * z * C - x * s;
        Rm[6] = z * x * C - y * s; Rm[7] = z * y * C + x * s; Rm[8] = c + z * z * C;
        const pc = p.P.center || [0, 0, 0];
        T[0] += pc[0] - (Rm[0] * pc[0] + Rm[1] * pc[1] + Rm[2] * pc[2]);
        T[1] += pc[1] - (Rm[3] * pc[0] + Rm[4] * pc[1] + Rm[5] * pc[2]);
        T[2] += pc[2] - (Rm[6] * pc[0] + Rm[7] * pc[1] + Rm[8] * pc[2]);
      } else { o[0] = o[1] = o[2] = 0; }
    }
    for (const ent of subj.entries) {
      const p = subj.parts[ent.anchor.pi];
      apX(p.X, ent.anchor.local[0], ent.anchor.local[1], ent.anchor.local[2], q3);
      const eo = ent.parts[0].off;
      ent.model[0] = q3[0] + eo[0]; ent.model[1] = q3[1] + eo[1]; ent.model[2] = q3[2] + eo[2];
      ent.k = ent.parts[0].k;
      toWorld(V.R0, V.T0, ent.model, ent.world);
    }
  }
  /* the camera: glide in across the target, hold with a slow push, then up and round to the sinking hull */
  function camera(V, dt) {
    const t = V.t, subj = V.subj, def = V.def;
    // the hull's box as drawn (drift included) -> world corners; its centre
    const b = V.bounds && t - V.bT < .25 ? V.bounds : (V.bT = t, V.bounds = subj.partsBounds(subj.parts.filter(p => p.cls !== 'hidden')) || [[-1, -1, -1], [1, 1, 1]]);
    for (let i = 0; i < 8; i++) { q3[0] = b[i & 1][0]; q3[1] = b[(i >> 1) & 1][1]; q3[2] = b[(i >> 2) & 1][2]; toWorld(V.R0, V.T0, q3, HC[i]); }
    q3[0] = (b[0][0] + b[1][0]) / 2; q3[1] = b[0][1] + (b[1][1] - b[0][1]) * (V.sea ? .3 : .45); q3[2] = (b[0][2] + b[1][2]) / 2;
    const T = toWorld(V.R0, V.T0, q3, w3);
    const pull = ease(sat((t - V.tPull) / 2.6)), push = ss(V.fly * .8, V.fly + 3.2, t) * (1 - pull);
    const pitch = ((V.sea ? 6 : 12) + (V.raise || 0) + 6 * pull) * DEG;
    const shift = endShift();
    const appr = V.appr + V.csd * (.025 * Math.max(0, t - V.fly) + .38 * pull);
    const d = acrossView(cam, T, HC, 8, appr, V.csd, pitch, { min: V.sea ? 170 : Math.max(24, def.size[0] * 1.6), k: (1 - .12 * push) * (1 + 1.7 * pull), shift, lead: V.tHit >= 0 ? .1 : .2, bx: .47, by: .4 }, e3, l3);
    if (!V.sea && (!V.chk || t > V.chk)) { V.chk = t + .4; if (blockedBy(game.ground, e3, T) > -3) V.raise = Math.min(30, (V.raise || 0) + 4); }
    lookFrom(cam, e3, l3, want);
    // a hand on the camera
    const rt = game.realT;
    want.yaw += .0035 * Math.sin(rt * .71) + .002 * Math.sin(rt * 1.43 + 1.2);
    want.pitch += .002 * Math.sin(rt * .87 + 2.1);
    const B = V.blend;
    if (B) {
      if (B.bump < 0) {
        B.bump = bumpOf(B.from, want);
        B.dur = Math.max(V.fly, Math.min(2.4, glideDur(B.from, want, 1.3, 2.4)));
        // arrive a moment before the impact (a late trigger stretches the glide instead of waiting on the spot)
        if (V.mode === 'live') B.dur = clamp(V.tI - LEAD, B.dur, 2.8);
        V.fly = B.dur;
      }
      const u = sat(t / B.dur);
      blendPose(B.from, want, ease(u), B.bump, cur);
      if (u >= 1) V.blend = null;
    } else {
      cur.T[0] = want.T[0]; cur.T[1] = want.T[1]; cur.T[2] = want.T[2];
      cur.dist = want.dist; cur.pitch = want.pitch; cur.yaw = cur.yaw + wrapPi(want.yaw - cur.yaw);
    }
    V.dist = d;
    putCam(cam, cur, follow);
  }
  function endShift() {
    if (!game.result) return 0;
    const el = document.querySelector('.oniks-end');
    return el && !el.classList.contains('min') ? .3 : 0;
  }

  /* ------------------------------------------------------------------ 3D */
  function draw3d(frame) {
    const V = S; if (!V) return;
    const subj = V.subj, d = V.inst, t = V.t, F = V.front, ax = subj.axis;
    const out = V.phase === 'out', fo = out ? ss(0, V.fade, t - V.tOut) : 0;
    // the live model steps aside for the cutaway (and comes back as it dissolves out)
    const liveD = game.drawn.get(V.id);
    if (liveD) liveD.alpha = (liveD.alpha === undefined ? 1 : liveD.alpha) * fo;
    for (let i = 0; i < 9; i++) d.R[i] = V.R0[i];
    d.T[0] = V.T0[0]; d.T[1] = V.T0[1]; d.T[2] = V.T0[2];
    d.st = V.st;
    d.tint = V.side === game.side ? 'own' : 'hostile';
    d.tintK = .55 - .25 * ss(0, 1.2, t); d.tintFace = d.tint === 'own' ? .03 : .08;
    d.dissolve = fo;
    d.bright = 1 + .18 * ss(0, .8, t) * (1 - fo);
    // the front
    const G = d.gate, a = ax.i;
    let z;
    if (!F.started || F.closed) z = F.zS - F.s * 1e5;
    else if (F.done && !F.closing) z = F.zE + F.s * 1e5;
    else z = F.z;
    V.zDraw = z;
    G.n[0] = V.R0[a] * F.s; G.n[1] = V.R0[3 + a] * F.s; G.n[2] = V.R0[6 + a] * F.s;
    G.d = F.s * (V.R0[a] * V.T0[0] + V.R0[3 + a] * V.T0[1] + V.R0[6 + a] * V.T0[2] + z);
    G.w = F.band; G.g = F.glow; G.mode = 0;
    // damage: the sim's parts on the cut parts, the fresh ones flashing coral
    const dm = damageNow(V);
    d.damage = dm;
    const under = V.sea ? 1.8 : 1.3, xOpen = F.started && !F.closed;
    for (const p of subj.parts) {
      const nm = p.name;
      if (p.k > 0) d.partX[nm] = p.rx; else if (d.partX[nm]) delete d.partX[nm];
      let al = p.cls === 'hidden' ? (xOpen ? under : 0) : p.cls === 'part' ? 1.12 : 1;
      const fl = V.flash.get(nm);
      if (fl) al *= 1 + 1.5 * fl.amp * (1 - ss(0, 1.1, t - fl.t0));
      if (dm && dm[nm] >= .99) al *= .3;
      d.partAlpha[nm] = al;
    }
    R.draw(d);
    // J: the round coming in again, and its flash
    if (V.mode === 'again') again3d(V, frame);
    // the impact: a white light on the hull for a moment (the FX system draws the blast itself)
    if (V.hitAt !== undefined && V.imp) {
      const k = 1 - ss(0, .9, t - V.hitAt);
      if (k > 0) frame.sink.light(V.imp[0], V.imp[1], V.imp[2], 255, 236, 214, (V.mode === 'after' ? .55 : 1.1) * k, Math.max(120, ax.L * 1.4));
    }
  }
  /* cut part -> damage now (0..1), the flash on top */
  function damageNow(V) {
    const subj = V.subj, t = V.t, out = V.dmgCut;
    let src;
    if (V.mode === 'again') src = V.tHit >= 0 ? V.after : V.before;
    else if (V.u) src = V.tHit >= 0 || V.mode === 'live' ? V.u.parts : V.before;
    else src = V.after || (V.keep && (V.tHit >= 0 || V.mode === 'live') ? V.keep.parts : null) || V.before || {};
    if (V.mode === 'live' && V.tHit < 0) src = V.before || src;
    if (!subj.simMap) return null;
    let any = false;
    for (const [n, list] of subj.simMap) {
      let m = 0; for (const sp of list) m = Math.max(m, (src && src[sp]) || 0);
      const fl = V.flash.get(n);
      if (fl) m = Math.max(m, fl.amp * (1 - ss(.15, 1.3, t - fl.t0)));
      out[n] = m; if (m > 0) any = true;
    }
    return any ? out : null;
  }
  /* the round from the record, coming in along its line; the flash where it meets the hull */
  function again3d(V, frame) {
    const rec = V.rec, t = V.t, sink = frame.sink;
    if (!V.impLocal) return;
    const imp = toWorld(V.R0, V.T0, V.impLocal, w3);
    const dl = rec.dirLocal, M = V.R0;
    const dx = M[0] * dl[0] + M[1] * dl[1] + M[2] * dl[2], dy = M[3] * dl[0] + M[4] * dl[1] + M[5] * dl[2], dz = M[6] * dl[0] + M[7] * dl[1] + M[8] * dl[2];
    if (t < V.tI) {
      const back = (V.tI - t) * RATE * (rec.spd || 700);
      const px = imp[0] - dx * back, py = imp[1] - dy * back, pz = imp[2] - dz * back;
      const key = (game.PROJ[rec.kind] || {}).model;
      if (key && R.models.has(key)) {
        const inst = V.round || (V.round = { key, T: [0, 0, 0], R: null, st: { wing: 1, fin: 1, inlet: 1, booster: false, cover: false }, tint: rec.side === game.side ? 'own' : 'hostile', tintK: .45 });
        inst.T[0] = px; inst.T[1] = py; inst.T[2] = pz; inst.hdg = Math.atan2(dx, dz); inst.pitch = Math.atan2(dy, Math.hypot(dx, dz)); inst.roll = 0;
        R.draw(inst);
      }
      // the plume: white at the nozzle, lime for a moment, then pale
      for (let i = 0; i < 44; i++) {
        const s = 3 + i * 2.6 + hash(i, 7) * 1.5, j = (hash(i, 9) - .5) * (1 + i * .05);
        const x = px - dx * s + j, y = py - dy * s + (hash(i, 5) - .5) * (1 + i * .05), z = pz - dz * s - j;
        const f = 1 - i / 44;
        if (i < 6) sink.add(x, y, z, 2.4, 255, 255, 255, .85 * f);
        else if (i < 15) sink.dot(x, y, z, 2, 198, 244, 50, .7 * f);
        else sink.dot(x, y, z, 1.8, 215, 215, 210, .45 * f);
      }
      sink.glow(px - dx * 2, py - dy * 2, pz - dz * 2, 7, 255, 255, 255, .8);
      sink.light(px, py, pz, 255, 250, 235, .25, 60);
    } else {
      // the flash: white core, a swelling ball, sparks thrown off the hull
      const a = t - V.tI, k = 1 - ss(0, 1.1, a);
      if (k > 0) {
        sink.glow(imp[0], imp[1], imp[2], -(14 + 50 * ss(0, .6, a)), 255, 246, 232, .9 * k);
        sink.glow(imp[0], imp[1], imp[2], 26, 255, 255, 255, k);
        for (let i = 0; i < 90; i++) {
          const th = hash(i, 11) * Math.PI * 2, ph = (hash(i, 13) - .15) * 1.3, sp = 20 + hash(i, 17) * 55;
          const r = sp * a * RATE * 4, x = imp[0] + Math.cos(ph) * Math.sin(th) * r, y = imp[1] + Math.sin(ph) * r - 4.9 * (a * RATE * 4) ** 2, z = imp[2] + Math.cos(ph) * Math.cos(th) * r;
          sink.add(x, y, z, 1.8, 255, 238, 210, .9 * k);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ 2D */
  function draw2d(ov) {
    const V = S; if (!V) return;
    const A = V.uiA; if (A <= .01) return;
    K = ov.ui || 1;
    ov.ctx.save(); ov.ctx.scale(K, K);
    try { layer2d(ov, V, A); } finally { ov.ctx.restore(); }
  }
  function layer2d(ov, V, A) {
    const ctx = ov.ctx, W = ov.W / K, H = ov.H / K, subj = V.subj;
    const endUp = !!endShift();
    // the hull on screen: the tagged assemblies' boxes
    let mb = null;
    for (const ent of subj.entries) { let b = null; for (const p of ent.parts) b = subj.partBox(p, V.R0, V.T0, pcam, b); ent.box = b; if (b) mb = mb ? [Math.min(mb[0], b[0]), Math.min(mb[1], b[1]), Math.max(mb[2], b[2]), Math.max(mb[3], b[3])] : b.slice(); }
    const readBottom = endUp ? 0 : readout(ctx, V, A);
    boxes.length = 0;
    tags(ctx, V, W, H, A, mb, readBottom, endUp);
    slice(ctx, V, W, H, A);
    // the still's subject (match.js frames its thumbnail on it): the hull and its placards, as fractions of the screen
    if (V.shot === game.frameN && V.peakInfo) {
      let b = mb ? mb.slice() : null;
      for (const q of boxes) b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q.slice();
      if (b) V.peakInfo.box = [b[0] / W, b[1] / H, b[2] / W, b[3] / H];
    }
    const rate = game.timeRate, rs = Math.abs(rate - RATE) < .004 ? 'x0.25' : rate < 1 ? 'x' + rate.toFixed(2) : 'x' + (rate < 10 ? rate.toFixed(1) : Math.round(rate));
    // the rate, always on screen (top right while the end screen has the left of it)
    O.tag(ctx, endUp ? W - 30 : W / 2, 22, rs, V.mode === 'again' ? 'Replay' : 'Slow motion', 'T+' + (game.fmtTime ? game.fmtTime(sim.t) : Math.floor(sim.t)), { kind: 'lime', a: A, align: endUp ? 'right' : 'center', size: 11 });
    if (!endUp && V.shot !== game.frameN) O.keys(ctx, W / 2, H - 50, [['Esc', 'Skip']], A * .9);
  }
  function readout(ctx, V, A) {
    const x = 40; let y = 58;
    const P = game.PROJ[V.kind] || {};
    // the round's name when the blow was a round's (a gun or a lesser hit has none: not "Hit · Hit")
    const head = V.mode === 'again' ? 'Replay' : 'Hit';
    O.kick(ctx, x + 2, y, P.name ? `${head} · ${P.name}` : head, A);
    y += 34;
    O.sans(ctx, x, y, V.subj.title, { size: 22, weight: 600, ls: -.4, a: A });
    y += 30;
    const u = V.u, own = V.side === game.side;
    const type = u ? u.type : V.rec ? V.rec.type : V.keep ? V.keep.type : null;
    const L = [];
    if (!own) {
      const c = sim.contact(game.side, V.id);
      if (c && c.track) V.track = c.track;
      L.push([[V.track || 'TRK', CORAL], [' · ', FAINT], [(type && TRACK[type]) || V.def.name, WHITE]]);
    }
    if (u) {
      const hk = u.hp / u.hpMax;
      L.push([['HP ', FAINT], [`${Math.max(0, Math.ceil(u.hp))} / ${u.hpMax}`, hk < 1 ? CORAL : WHITE]].concat(!u.alive ? [[' · ', FAINT], [V.sea ? 'Sinking' : 'Destroyed', CORAL]] : []));
    } else if (V.rec) L.push([[V.rec.destroyed ? (V.sea ? 'Sunk' : 'Destroyed') : 'Hit', CORAL], [' · T+', FAINT], [game.fmtTime ? game.fmtTime(V.rec.t) : Math.floor(V.rec.t), WHITE]]);
    // the unit is gone (removed while the replay plays): it went down
    else if (V.keep) L.push([['HP ', FAINT], [`0 / ${V.keep.hpMax}`, CORAL], [' · ', FAINT], [V.sea ? 'Sunk' : 'Destroyed', CORAL]]);
    for (const segs of L) { O.runs(ctx, x, y, segs, { size: 11.5, a: A }); y += 21; }
    return y;
  }
  /* the tags: coral for what broke (they stay), lime as the front passes (a moment each); columns beside the hull,
     dotted leaders to their parts */
  function tags(ctx, V, W, H, A, mb, readBottom, endUp) {
    const subj = V.subj, t = V.t, rows = [];
    const coralEnts = new Set();
    for (const g of V.tags) {
      const age = t - g.t0;
      if (g.ent) { if (!pcam.project(g.ent.world, s3)) continue; coralEnts.add(g.ent); }
      else { toWorld(V.R0, V.T0, g.local, w3); if (!pcam.project(w3, s3)) continue; }
      if (s3[0] < -20 || s3[1] < -20 || s3[0] > W + 20 || s3[1] > H + 20) continue;
      const val = g.v >= .99 ? 'Out' : `Dmg ${Math.round(g.v * 100)} %`;
      const lab = O.condense(g.label.toUpperCase(), sat(age / .9), t, g.id.length + g.label.length);
      rows.push({ o: g.o, ent: g.ent, p: [s3[0], s3[1]], id: g.id, lab, val, kind: 'coral', a: ss(0, .3, age) * A, w: O.tagWidth(ctx, g.id, g.label, val) });
    }
    // the front's passing identifications (a handful at a time, the latest)
    const pass = [];
    for (const [ent, t0] of V.passed) { const age = t - t0; if (age < 1.7 && !coralEnts.has(ent)) pass.push([ent, t0]); }
    pass.sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < Math.min(5, pass.length); i++) {
      const [ent, t0] = pass[i], age = t - t0;
      if (!pcam.project(ent.world, s3) || s3[0] < -20 || s3[1] < -20 || s3[0] > W + 20 || s3[1] > H + 20) continue;
      let o = V.rows.get(ent); if (!o) V.rows.set(ent, o = {});
      const lab = O.condense(ent.label.toUpperCase(), sat(age / .7), t, ent.id.length + ent.label.length);
      rows.push({ o, ent, p: [s3[0], s3[1]], id: ent.id, lab, val: ent.size, kind: 'lime', a: ss(0, .2, age) * (1 - ss(1.2, 1.7, age)) * A * .9, w: O.tagWidth(ctx, ent.id, ent.label, ent.size) });
    }
    if (!rows.length) return;
    const box = mb || [W * .4, H * .4, W * .6, H * .6], midX = (box[0] + box[2]) / 2, half = Math.max(40, (box[2] - box[0]) / 2);
    for (const r of rows) {
      const o = r.o, s = (r.p[0] - midX) / half;
      if (endUp) o.side = 'R';
      else if (o.side === undefined) { o.side = s < 0 ? 'L' : 'R'; o.y = undefined; }
      else if (o.side === 'L' && s > .25) o.side = 'R';
      else if (o.side === 'R' && s < -.25) o.side = 'L';
      r.side = o.side;
    }
    const wL = Math.max(0, ...rows.filter(r => r.side === 'L').map(r => r.w)), wR = Math.max(0, ...rows.filter(r => r.side === 'R').map(r => r.w));
    const xL = Math.max(30 + wL, Math.min(box[0] - 36, W * .5 - 60)), xR = Math.min(W - 30 - wR, Math.max(box[2] + 36, W * .5 + 60));
    const top = { L: Math.max(96, readBottom + 20), R: 64 }, bottom = H - 96;
    const kk = 1 - Math.exp(-12 * Math.max(1e-3, game.dtReal || .016));
    for (const side of ['L', 'R']) {
      const rs = rows.filter(r => r.side === side).sort((a, b) => a.p[1] - b.p[1]);
      let y = top[side];
      for (const r of rs) { r.ty = Math.max(r.p[1] - 10, y); y = r.ty + 27; }
      const over = y - 7 - bottom;
      if (over > 0) for (const r of rs) r.ty -= over;
      for (const r of rs) { const o = r.o; o.y = o.y === undefined ? r.ty : o.y + (r.ty - o.y) * kk; r.y = o.y; }
    }
    // the broken assemblies get their brackets
    for (const r of rows) if (r.kind === 'coral' && r.ent && r.ent.box) O.bracket(ctx, r.ent.box, CORAL, .7 * r.a, 5, 9);
    for (const r of rows) {
      const L = r.side === 'L', x = L ? xL : xR, cy = r.y + 10, col = r.kind === 'coral' ? CORAL : LIME;
      O.leader(ctx, r.p[0], r.p[1], x, cy, col, .65 * r.a);
      O.adot(ctx, r.p[0], r.p[1], col, r.a);
      const bx = O.tag(ctx, L ? x - 6 : x + 6, r.y, r.id, r.lab, r.val, { kind: r.kind, a: r.a, align: L ? 'right' : 'left' });
      if (bx) boxes.push(bx);
    }
  }
  /* the slice's tag riding the front along the roof line (the Anatomy films) */
  function slice(ctx, V, W, H, A) {
    const F = V.front, subj = V.subj, ax = subj.axis;
    if (!F.started || F.closed || (F.done && !F.closing)) return;
    const z = F.z;
    if (z < ax.z0 || z > ax.z1) return;
    const a = A * ss(ax.z0, ax.z0 + ax.L * .06, z) * (1 - ss(ax.z1 - ax.L * .06, ax.z1, z)) * (F.closing ? .5 : 1);
    if (a < .02) return;
    q3[0] = 0; q3[1] = 0; q3[2] = 0; q3[ax.i] = z; q3[ax.u] = subj.topAt(z) + ax.L * .006;
    toWorld(V.R0, V.T0, q3, w3);
    if (!pcam.project(w3, s3)) return;
    const zs = `${ax.name} ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(ax.L > 60 ? 1 : 2)} m`, lab = `${subj.shortTitle} · ${subj.scanWord}`;
    const w = O.tagWidth(ctx, 'X-ray', lab, zs), x = Math.min(W - 24 - w, Math.max(24, s3[0] - 6));
    // above the roof line, and clear of the placards (it climbs over any it would sit on)
    let qy = Math.max(64, s3[1] - 54);
    for (let it = 0; it < 6; it++) {
      let hit = null;
      for (const b of boxes) if (x < b[2] + 6 && x + w > b[0] - 6 && qy - 22 < b[3] + 4 && qy > b[1] - 4) { hit = b; break; }
      if (!hit) break;
      qy = hit[1] - 8;
    }
    if (qy < 48) return;
    O.leader(ctx, s3[0], s3[1], s3[0], qy, LIME, .8 * a);
    O.tag(ctx, x, qy - 22, 'X-ray', lab, zs, { kind: 'lime', a });
  }

  /* ------------------------------------------------------------------ input */
  function onKey(e) {
    const down = e.type === 'keydown';
    const V = S && S.phase !== 'out' ? S : null;
    if (!V) {
      if (!down || e.repeat || e.code !== 'KeyJ' || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.shiftKey) { setAuto(!auto); return true; }
      if (!last) { bus.emit('toast', { text: 'NO HIT TO REPLAY', bad: true }); return true; }
      if (busy()) return false;
      playLast();
      return true;
    }
    if (MODS.has(e.code)) return false;
    if (e.code === 'Escape' || e.code === 'Space') { if (down && !e.repeat) finish(true); return true; }
    if (e.code === 'KeyJ') {
      if (down && !e.repeat && !e.shiftKey) {
        // again from the top (the new replay hands back to where the player was before this one)
        finish(true); playLast();
      }
      return true;
    }
    if (!down) return false;
    // any other key: the player wants the game back
    finish(true, CAM_KEYS.has(e.code));
    return false;
  }
  function onPointer(ev) {
    const V = S && S.phase !== 'out' ? S : null;
    if (!V) return false;
    if ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel') finish(true, true);
    else if (ev.type === 'dblclick' || (ev.type === 'click' && ev.alt)) finish(true);
    return false;
  }
  function playLast() {
    const L = last; if (!L) return false;
    const u = sim.units.get(L.id) || null;
    return start({ mode: 'again', rec: L, u: u && !u.aboard ? u : null });
  }

  /* ------------------------------------------------------------------ events */
  function onEvent(e) {
    if (e.type === 'hit') {
      const u = sim.units.get(e.target);
      if (!u) return;
      const before = partsSeen.get(u.id) || {};
      const heavy = !!HEAVY[e.kind];
      if (heavy && major(u) && visible(u)) {
        record(e, u, before);
        const V = S && S.phase !== 'out' ? S : null;
        if (V && V.id === u.id && (V.mode === 'live' || V.tHit >= 0)) {
          // the impact we were waiting for (or another round of the salvo on the same hull)
          const ch = diffParts(u.parts, before) || {};
          if (V.tHit < 0) V.tHit = V.t;
          V.tLast = V.t; V.pending = false;
          strike(V, ch, e.pos);
          if (!u.alive) { V.dead = true; if (V.tDead < 0) V.tDead = V.t; }
        } else if ((!S || S.phase === 'out') && auto && !busy()) {
          const fin = !u.alive && finalOf(u);
          const kill = !u.alive;
          if (fin || game.realT >= (kill ? (u.id === lastHull ? 0 : nextKill) : nextOk)) {
            const f = flight.get(e.proj);
            start({ mode: 'after', u, e, dir: f ? f.dir : null, before, fin });
          }
        }
      } else if (S && S.phase !== 'out' && S.id === u.id && S.tHit >= 0) {
        // a lesser hit on the hull we are watching: its damage flashes too
        const ch = diffParts(u.parts, before); if (ch) strike(S, ch, e.pos);
      }
      partsSeen.set(u.id, copyParts(u));
      if (e.proj) setTimeout(() => flight.delete(e.proj), 0);
    } else if (e.type === 'damage') {
      const u = sim.units.get(e.unit); if (u) partsSeen.set(u.id, copyParts(u));
    } else if (e.type === 'destroyed') {
      if (S && S.id === e.unit && S.phase !== 'out') { S.dead = true; if (S.tDead < 0) S.tDead = S.t; }
      if (last && last.id === e.unit && sim.t - last.t < 3) last.destroyed = true;
      // the final blow by anything else (a gun, a lesser round): the last kill of the match still gets its moment
      const u = sim.units.get(e.unit);
      if (u && (!S || S.phase === 'out') && auto && !busy() && visible(u) && finalOf(u) && (major(u) || u.def.domain === 'sea')) start({ mode: 'after', u, e: { pos: e.pos, from: e.by, kind: '' }, before: partsSeen.get(u.id) || {}, fin: true });
      partsSeen.delete(e.unit);
    } else if (e.type === 'removed') { partsSeen.delete(e.unit); }
    else if (e.type === 'launch' && HEAVY[e.kind] && e.tk === 'unit') {
      // warm the target's cutaway while the round flies
      const u = sim.units.get(e.target);
      if (u && major(u) && !subjects.has(u.def.model)) setTimeout(() => subjectOf(u.def.model), 30);
    } else if ((e.type === 'splash' || e.type === 'intercept') && e.proj) flight.delete(e.proj);
  }

  const sys = {
    name: 'replay', priority: 110, always2d: true,
    get active() { return !!S && S.phase !== 'out'; },
    init() {
      bus.on('rate', d => {
        if (!S || !d || d.why === 'replay') return;
        // the game's own drops (auto x1 on a launch, the end of the match): the replay keeps its slow motion and hands
        // back the lower rate afterwards
        if (d.why === 'auto' || d.why === 'end') { S.rate0 = Math.min(S.rate0, d.rate); if (S.rateTo !== undefined) S.rateTo = Math.min(S.rateTo, d.rate); return; }
        S.rateTouched = true;
        if (S.phase !== 'out' && d.why === 'user') finish(true);
      });
      bus.on('inspect', d => { if (d && d.on && S && S.phase !== 'out') finish(true, true); });
      game.replay = { get active() { return sys.active; }, get auto() { return auto; }, setAuto, get last() { return last; }, play: playLast, skip: () => finish(true), get state() { return S; } };
      // the cutaways of the hulls on the map, warmed while nothing happens
      setTimeout(() => { for (const u of sim.list()) if (major(u) && u.def.domain === 'sea') subjectOf(u.def.model); }, 2500);
    },
    update, draw3d, draw2d, onKey, onPointer, onEvent,
    dispose() { offSettings(); if (S) { finish(true); done(); } },
  };
  return sys;
}
