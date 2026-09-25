/* ONIKS audio system (name 'audio'): synthesized, positional, and late by distance.

   const audio = createAudio(game); game.addSystem(audio);
   audio.ui('select')                      interface sounds (see README for the names)
   audio.play('explosion', [x, y, z], { size: .8 })   any sound; world sounds travel at 343 m/s to the camera
   audio.update(dtReal, dtSim) / audio.onEvent(simEvent)   driven by the game loop

   The listener is the camera: game.camera (or game.renderer.camera) with `eye` [x, y, z] and the basis `f`
   (forward), `r` (right) as the engine's RTSCamera has them; `forward` / `right` / `target` are accepted too.
   Sound travel: every world sound is a front expanding at 343 m/s in sim time from its source; it plays when the
   front reaches the camera (so x8 compresses delays 8x, pause holds them, flying toward a blast hears it sooner).
   Travel is exact while the wait is under 12 s real; longer waits speed up gently and never exceed 30 s, and at
   most 64 fronts are in flight, so nothing piles up. */
import { Core, Slot, SOUND_SPEED as C, clamp, smooth, rng } from './core.js';
import { SHOTS, SPEC, LOOPS } from './patches.js';

const DT_SIM = .05;                               // the sim tick (unit.prev -> unit.pos)
const WAIT_EXACT = 12, WAIT_MAX = 30;             // s real: sound travel is exact up to 12 s (4 km at x1, 33 km at x8)
const TAU = Math.PI * 2;

/* sound design per projectile kind: how it leaves (cold / vls / tube / rail), booster ignition delay, the
   sustainer level after the booster drops (0 = coasting dart), ramjet or turbofan */
const MK = {
  oniks: { how: 'cold', ign: .35, sus: 1, ram: true, size: 1 },
  tlam: { how: 'vls', ign: 0, sus: .7, size: .85 },
  sm6: { how: 'vls', ign: 0, sus: .45, size: .35 },
  pdms: { how: 'vls', ign: 0, sus: .3, size: .3 },
  sam: { how: 'tube', ign: 0, sus: 0, size: .3 },
  slam: { how: 'rail', ign: 0, sus: .6, size: .75 },
  aam: { how: 'rail', ign: 0, sus: .3, size: .35 },
  hellfire: { how: 'rail', ign: 0, sus: .2, size: .45 },
  shell: { how: 'gun', size: .45 },
};
const LAUNCH_SOUND = { cold: 'cold_launch', vls: 'vls_launch', tube: 'tube_launch', rail: 'rail_launch' };
const GUNS = { gun30: 'gun30', ciws: 'ciws' };
const SHIPS = { ddg: 1, carrier: 1 }, AIR = { fighter: 1, helo: 1, drone: 1 };

/* loop pools: size, distance law, and which bus */
const LSPEC = {
  missile: { n: 5, ref: 40, roll: .8, max: 20000, rev: .2 },
  jet: { n: 2, ref: 80, roll: .8, max: 12000, rev: .25 },
  rotor: { n: 2, ref: 40, roll: .85, max: 3500, rev: .2 },
  drone: { n: 2, ref: 15, roll: .9, max: 1200, rev: .1 },
  fire: { n: 3, ref: 15, roll: .9, max: 2000, rev: .15 },
  sink: { n: 1, ref: 60, roll: .8, max: 5000, rev: .25 },
  hyd: { n: 2, ref: 10, roll: 1, max: 600, rev: .1 },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const isPos = p => p && p.length >= 3 && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]);

export function createAudio(game) {
  const core = new Core();
  const L = { eye: [0, 0, 0], f: [0, 0, 1], r: [1, 0, 0], vel: [0, 0, 0], prev: null, h: 0, ok: false };
  const pend = [];                                // sound fronts in flight
  const lastFire = new Map();                     // name -> real time (gap merge)
  const mstate = new Map();                       // proj id -> { t0, ign, sep, kind, cone, boomed }
  const motion = new Map();                       // unit id -> machinery motion tracker
  const sweepRev = new Map();                     // radar unit id -> last revolution count
  let simT = 0, realT = 0, loopAcc = 0, ambAcc = 0, pruneT = 0, seaFrac = 1, surf = 0, lastSim = null;
  let lastRate = null, lastPaused = null, lastAlert = -1e9, warned = new Set();
  let pools = null, amb = null;
  const rnd = rng(0xC0A57);

  const G = () => game || {};
  const now = () => { const s = G().sim; return s && isFinite(s.t) ? s.t : simT; };
  const rate = () => Math.max(1, +G().timeRate || 1);
  const side = () => G().side || 'coast';
  const paused = () => !!G().paused;
  const unitOf = id => { const s = G().sim; return s && s.units && s.units.get ? s.units.get(id) : null; };

  /* ---------------- listener ---------------- */
  function readCamera(dtSim) {
    const g = G(), c = g.camera || (g.renderer && g.renderer.camera);
    if (!c) return;
    const e = c.eye || c.pos || c.position;
    if (!isPos(e)) return;
    let f = c.f || c.forward, r = c.r || c.right;
    if (!isPos(f)) f = c.target ? norm(sub(c.target, e)) : [0, 0, 1];
    if (!isPos(r)) { r = cross([0, 1, 0], f); if (len(r) < 1e-4) r = [1, 0, 0]; r = norm(r); }
    if (L.prev && dtSim > 0) {
      // listener velocity in sim metres per sim second (Doppler); panning the view is not a physical move
      const lim = c.followFn ? 1500 : 60;
      for (let k = 0; k < 3; k++) {
        const v = clamp((e[k] - L.prev[k]) / dtSim, -lim, lim);
        L.vel[k] += (v - L.vel[k]) * .3;
      }
    }
    L.prev = [e[0], e[1], e[2]];
    L.eye[0] = e[0]; L.eye[1] = e[1]; L.eye[2] = e[2];
    L.f = f; L.r = r; L.ok = true;
    const m = g.map;
    let ground = 0;
    try { if (m && m.h) ground = Math.max(0, m.h(e[0], e[2])); } catch (err) { /* ok */ }
    L.h = Math.max(1, e[1] - ground);
  }

  function dist(p) { return Math.hypot(p[0] - L.eye[0], p[1] - L.eye[1], p[2] - L.eye[2]); }
  function distSeg(a, b) {                         // nearest point of a segment (a lightning channel)
    const ab = sub(b, a), ap = sub(L.eye, a), t = clamp(dot(ap, ab) / (dot(ab, ab) || 1), 0, 1);
    return dist([a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
  }

  /* distance law, air absorption, pan, reverb send */
  function spatial(sp, d, pos) {
    const g0 = d <= sp.ref ? 1 : Math.pow(sp.ref / d, sp.roll);
    const fl = sp.floor ? sp.floor * Math.pow(clamp(1 - d / sp.max, 0, 1), 1.5) : 0;
    let cut = 18000 / Math.pow(1 + d / 450, .9), pan = 0;
    if (pos && d > .5) {
      const v = [(pos[0] - L.eye[0]) / d, (pos[1] - L.eye[1]) / d, (pos[2] - L.eye[2]) / d];
      pan = clamp(dot(v, L.r) * .85, -.85, .85) * smooth(1.5, 10, d);
      cut *= .72 + .28 * (dot(v, L.f) * .5 + .5);          // behind the camera: a little duller
    }
    cut = clamp(Math.max(cut, sp.minCut || 0), 90, 18000);
    const send = (sp.rev || 0) * (.25 + .75 * clamp(Math.log10(Math.max(1, d) / 40) / 3, 0, 1));
    return { gain: Math.max(g0, fl), cut, pan, send };
  }

  /* ---------------- one-shots ---------------- */
  function fire(name, pos, d, opts) {
    const sp = SPEC[name], fn = SHOTS[name];
    if (!sp || !fn || !core.ready) return null;
    if (d > sp.max) return null;
    const t = core.ac.currentTime, lf = lastFire.get(name);
    if (lf !== undefined && t - lf < (sp.gap || 0)) return null;
    const s = pos ? spatial(sp, d, pos) : { gain: 1, cut: 18000, pan: 0, send: (sp.rev || 0) * .25 };
    s.gain *= sp.lvl || 1;
    const v = core.voice('world', sp.prio, s, name);
    if (!v) return null;
    lastFire.set(name, t);
    const near = 1 - smooth(60, 1500, d), far = smooth(800, 9000, d);
    try { fn(v, { d, near, far, o: opts || {}, r: rnd }); } catch (e) { console.error('audio:', name, e); v.kill(); }
    return v;
  }

  function sig(name, pos, opts) {
    const sp = SPEC[name], fn = SHOTS[name];
    if (!sp || !fn || !core.ready) return null;
    const t = core.ac.currentTime, lf = lastFire.get(name);
    if (lf !== undefined && t - lf < (sp.gap || 0)) return null;
    let s = null;
    if (pos && isPos(pos) && L.ok) {
      const d = dist(pos);
      if (d > 1) s = { flat: true, pan: clamp(dot([(pos[0] - L.eye[0]) / d, (pos[1] - L.eye[1]) / d, (pos[2] - L.eye[2]) / d], L.r) * .45, -.45, .45) };
    }
    const v = core.voice(sp.cls, sp.prio, s, name);
    if (!v) return null;
    lastFire.set(name, t);
    try { fn(v, { d: 0, near: 1, far: 0, o: opts || {}, r: rnd }); } catch (e) { console.error('audio:', name, e); v.kill(); }
    return v;
  }

  /* queue a world sound: its front leaves `pos` at sim time t0 (may be in the future) */
  function queue(name, pos, opts, t0, extra) {
    if (!isPos(pos) || !core.ready) return;           // nothing is queued while locked (it would all land at once)
    const sp = SPEC[name];
    if (!sp) return;
    if (L.ok && !(extra && extra.seg) && dist(pos) > sp.max * 1.5) return;   // far out of earshot: not worth a slot
    if (pend.length >= 64) {                        // full: drop the least important (lowest prio, then farthest)
      let wi = -1, wr = 1e9;
      for (let i = 0; i < pend.length; i++) { const r = pend[i].prio - pend[i].d0 / 1e4; if (r < wr) { wr = r; wi = i; } }
      if (wi < 0 || wr >= sp.prio - (L.ok ? dist(pos) : 0) / 1e4) return;
      pend.splice(wi, 1);
    }
    const e = { name, pos: pos.slice(), opts: opts || {}, el: now() - (t0 === undefined ? now() : t0), wait: 0, prio: sp.prio, max: sp.max, d0: L.ok ? dist(pos) : 0 };
    if (extra) Object.assign(e, extra);
    pend.push(e);
  }

  function flushFronts(dtReal, dtSim) {
    if (paused()) return;
    for (let i = pend.length - 1; i >= 0; i--) {
      const e = pend[i];
      if (e.el >= 0) e.wait += dtReal;
      const k = e.wait < WAIT_EXACT ? 1 : 1 + (e.wait - WAIT_EXACT) * .25;   // exact to 12 s real, then sped up gently
      e.el += dtSim * k;
      if (e.el < 0) continue;
      const d = e.seg ? distSeg(e.seg[0], e.seg[1]) : dist(e.pos);
      if (C * e.el >= d || e.wait > WAIT_MAX) {
        pend.splice(i, 1);
        if (e.prep) e.prep(e, d);
        fire(e.name, e.pos, d, e.opts);
      } else if (C * e.el > e.max * 1.2 && d > e.max) pend.splice(i, 1);   // gone past the edge of hearing
    }
  }

  /* world sound from an event: queued by distance unless the spec says immediate */
  function world(name, pos, opts, t0) {
    const sp = SPEC[name];
    if (!sp || !isPos(pos)) return;
    if (sp.delay === false) { if (core.ready && L.ok) fire(name, pos, dist(pos), opts); return; }
    queue(name, pos, opts, t0);
  }

  /* ---------------- events ---------------- */
  function thunderPrep(e, d) {
    // the roll: arrivals from along the channel (ground to cloud, with a horizontal run in the cloud)
    const r = rng(((e.pos[0] * 73856093) ^ (e.pos[2] * 19349663)) >>> 0), a = e.seg[0], b = e.seg[1];
    const ds = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8, spread = t * t * 1600;
      const p = [a[0] + (b[0] - a[0]) * t + (r() - .5) * spread, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + (r() - .5) * spread];
      ds.push(dist(p));
    }
    const dmin = Math.min(...ds), squeeze = 1 / Math.sqrt(rate());
    e.opts.roll = ds.map(di => [Math.min(9, (di - dmin) / C * squeeze), Math.pow(dmin / di, 1.2) * (.6 + .4 * r()), 1.5 + 2 * r()])
      .sort((x, y) => x[0] - y[0]);
  }

  function onEvent(ev) {
    if (!ev || !ev.type) return;
    const g = G(), me = side(), t0 = isFinite(ev.t) ? ev.t : now(), p = ev.pos;
    switch (ev.type) {
      case 'launch': {
        const K = MK[ev.kind] || MK.sm6;
        if (K.how === 'gun') { world('gun5', p, {}, t0); break; }
        world(LAUNCH_SOUND[K.how] || 'vls_launch', p, { kind: ev.kind }, t0);
        if (K.ign > 0 && isPos(p)) world('ignition', [p[0], p[1] + 8, p[2]], { kind: ev.kind }, t0 + K.ign);
        const P = (g.sim && g.sim.projectiles && g.sim.projectiles.get && g.sim.projectiles.get(ev.proj)) || null;
        const PP = P && P.P;
        mstate.set(ev.proj, { t0, ign: K.ign || 0, sep: PP ? (PP.sepAt || PP.boost || 3) : (ev.boost || 4), kind: ev.kind, cone: null, boomed: false });
        break;
      }
      case 'booster_sep': {
        world('sep', p, {}, t0);
        const m = mstate.get(ev.proj); if (m) m.sep = t0 - m.t0;
        break;
      }
      case 'intercept': {
        if (GUNS[ev.byKind]) world('intercept_small', p, {}, t0 + .5);   // the rounds reach it about half a second in
        else world('intercept', p, {}, t0);
        mstate.delete(ev.proj);
        break;
      }
      case 'hit': {
        const tgt = unitOf(ev.target), dom = tgt && tgt.def ? tgt.def.domain : (tgt && AIR[tgt.type] ? 'air' : null);
        if (GUNS[ev.kind]) { world('hit_small', p, {}, t0); break; }
        const K = MK[ev.kind], size = K ? K.size : .5;
        if (dom === 'air') world('airburst', p, { size: Math.max(.35, size) }, t0);
        else world('explosion', p, { size, metal: dom === 'sea' || (tgt && SHIPS[tgt.type]) }, t0);
        if (ev.proj !== undefined) mstate.delete(ev.proj);
        break;
      }
      case 'splash': {
        const K = MK[ev.kind];
        if (ev.air) world('airburst', p, { size: .25 }, t0);
        else if (ev.kind === 'crash') world(ev.water ? 'splash' : 'crash', p, { size: 1 }, t0);
        else if (ev.water) world('splash', p, { size: K ? Math.max(.4, K.size) : .6 }, t0);
        else world('explosion', p, { size: (K ? K.size : .5) * .8 }, t0);
        if (ev.proj !== undefined) mstate.delete(ev.proj);
        break;
      }
      case 'destroyed': {
        const u = unitOf(ev.unit), kind = kindOf(ev), dom = u && u.def ? u.def.domain : '';
        if (SHIPS[kind] || dom === 'sea' || kind === 'hq') world('secondary', p, {}, t0 + 1);
        else if (kind === 'drone') world('airburst', p, { size: .3 }, t0);
        else if (AIR[kind] || dom === 'air') world('airburst', p, { size: .85 }, t0);
        else world('cookoff', p, {}, t0 + .5);
        if (ev.side === me) sig('damage', p);
        break;
      }
      case 'part': if (ev.side === me) sig('damage', p); break;
      case 'detect': {
        if (ev.side !== me) break;
        if (ev.proj !== undefined || ev.dom === 'missile') { sig('alarm', p); break; }
        if (realT - lastAlert > 6) { lastAlert = realT; sig('alert', p); }
        else sig(ev.how === 'esm' ? 'contact_esm' : 'contact', p);
        break;
      }
      case 'classify': if (ev.side === me) sig('classify', p); break;
      case 'lost': if (ev.side === me && ev.by !== 'scan') sig('lost', p); break;
      case 'scan': {
        const own = ev.side === me;
        if (ev.phase === 'start') {
          if (own) world('scan_charge', p, { dur: (ev.delay || 1.6) / rate() });
        } else if (ev.phase === 'hit') {
          if (own) { world('scan_strike', p, {}); if (ev.hits && ev.hits.length) setTimeout(() => sig('classify', p), 420); }
          else world('scan_far', p, {}, t0);
        }
        break;
      }
      case 'reload_start': world('crane_start', p, {}, t0); break;
      case 'reload_done': world('seat', p, {}, t0); if (ev.side === me) sig('confirm', p); break;
      case 'deploy': {
        const w = { jacks: 'jacks_down', stowed: 'jacks_up', erect: 'erect_stop', lowered: 'lower_stop', mast_up: 'mast_stop', mast_down: 'mast_stop' }[ev.what] || 'clunk';
        world(w, p, {}, t0);
        break;
      }
      case 'gunfire': {
        const name = GUNS[ev.weapon] || 'gun30';
        world(name, p, { dur: clamp((ev.dur || 1) / rate(), .12, 3) }, t0);
        break;
      }
      case 'lightning': {
        if (!isPos(p)) break;
        const top = isPos(ev.top) ? ev.top : [p[0], 3500, p[2]];
        queue('thunder', p, {}, t0, { seg: [p.slice(), top.slice()], prep: thunderPrep });
        break;
      }
      case 'reinforce': if (ev.side === me) sig('reinforce', p); break;
      case 'objective':
        if (ev.owner === me) sig('objective', p);
        else if (ev.prev === me) sig('objective_lost', p);
        break;
      case 'radar':
        if (ev.side === me) sig(ev.on ? 'radar_on' : 'radar_off', p);
        world('radar_motor', p, { on: !!ev.on }, t0);
        break;
      case 'takeoff': {
        const k = kindOf(ev);
        if (k === 'fighter') world('catapult_steam', p, {}, t0);
        else if (k === 'drone') world('catapult_drone', p, {}, t0);
        break;
      }
      case 'land': if (kindOf(ev) === 'fighter') world('trap', p, {}, t0); break;
      default: break;
    }
  }
  /* 'destroyed' / 'takeoff' / 'land' carry the unit type in a data field named `type`, which Sim.emit overwrites
     with the event name; recover it from the unit (still in sim.units while it dies), or ev.unitType */
  function kindOf(ev) { const u = unitOf(ev.unit); return (u && u.type) || ev.unitType || ''; }

  /* ---------------- loops ---------------- */
  function makePools() {
    const P = {};
    for (const k in LSPEC) P[k] = { k, sp: LSPEC[k], slots: Array.from({ length: LSPEC[k].n }, () => new Slot(core, core.bus.world, LOOPS[k])) };
    return P;
  }
  function makeAmb() {
    const A = {};
    for (const k of ['sea', 'wind', 'rain']) { A[k] = new Slot(core, core.bus.amb, LOOPS[k], false); A[k].build(); }
    return A;
  }

  /* assign the best candidates to a pool's slots (sticky: a holder keeps its slot while it ranks within n + 1) */
  function runPool(pool, cands, tA, dt, hold) {
    const n = pool.slots.length;
    cands.sort((a, b) => b.score - a.score);
    const byKey = new Map();
    for (let i = 0; i < cands.length && i <= n; i++) byKey.set(cands[i].key, cands[i]);
    for (const s of pool.slots) if (s.key !== null && !byKey.has(s.key)) s.key = null;
    for (let i = 0; i < Math.min(n, cands.length); i++) {
      const c = cands[i];
      if (pool.slots.some(s => s.key === c.key)) continue;
      let best = null;
      for (const s of pool.slots) if (s.key === null && (!best || (s.built && !best.built))) best = s;
      if (best) { best.key = c.key; best.st = {}; }
    }
    for (const s of pool.slots) {
      const c = s.key !== null ? byKey.get(s.key) : null;
      if (c && !hold) s.set(c.sp, c.params, tA);
      else { s.quiet(tA); if (!c) s.key = null; s.idle += dt; if (s.built && s.idle > 5) s.dispose(); }
    }
  }

  function doppler(pos, vel) {
    const d = dist(pos) || 1, u = [(pos[0] - L.eye[0]) / d, (pos[1] - L.eye[1]) / d, (pos[2] - L.eye[2]) / d];
    const rel = sub(vel, L.vel), vr = dot(rel, u);                 // + receding
    return { k: clamp(C / Math.max(40, C + vr), .3, 2.5), rel, u, d };
  }
  const law = (sp, d) => d <= sp.ref ? 1 : Math.pow(sp.ref / d, sp.roll);

  function updateLoops(dt, tA) {
    const g = G(), sim = g.sim, hold = paused();
    const cand = { missile: [], jet: [], rotor: [], drone: [], fire: [], sink: [], hyd: [] };
    const tn = now();
    if (sim && L.ok) {
      // missiles in flight
      if (sim.projectiles && sim.projectiles.values) {
        for (const p of sim.projectiles.values()) {
          if (!p || !p.alive || !isPos(p.pos) || p.kind === 'shell') continue;
          const d = dist(p.pos);
          if (d > LSPEC.missile.max) continue;
          let m = mstate.get(p.id);
          if (!m) { const K = MK[p.kind] || MK.sm6, PP = p.P; m = { t0: isFinite(p.t0) ? p.t0 : tn, ign: K.ign || 0, sep: PP ? (PP.sepAt || PP.boost || 3) : 4, kind: p.kind, cone: null, boomed: false }; mstate.set(p.id, m); }
          m.seen = tn;
          const K = MK[p.kind] || MK.sm6, age = tn - m.t0 - d / C;           // what the camera hears now left it d/C ago
          const boost = age < m.ign ? 0 : age < m.sep ? clamp((age - m.ign) / .08, 0, 1) * (1 - .2 * (age - m.ign) / Math.max(.1, m.sep - m.ign)) : clamp(1 - (age - m.sep) / .3, 0, 1);
          const sus = age >= m.sep ? K.sus * clamp((age - m.sep) / .4, 0, 1) : 0;
          if (boost <= 0 && sus <= 0) continue;
          const dp = doppler(p.pos, p.vel || [0, 0, 0]), spd = len(dp.rel);
          let gate = 1;
          if (spd > C * 1.02) {                                   // supersonic: silent until the Mach cone sweeps the camera
            const mu = Math.asin(C / spd), back = norm([-dp.rel[0], -dp.rel[1], -dp.rel[2]]), th = Math.acos(clamp(dot(back, [-dp.u[0], -dp.u[1], -dp.u[2]]), -1, 1));
            const inside = th < mu;
            if (m.cone === false && inside && !m.boomed && d < 3500) { m.boomed = true; fire('sonic_boom', p.pos, d, {}); }
            m.cone = inside;
            gate = inside ? 1 : 0;
          } else m.cone = true;
          if (gate <= 0) continue;
          const sp = { ref: boost > 0 ? 60 : 22, roll: .82, rev: LSPEC.missile.rev }, lvl = boost > 0 ? 1 : .45 * sus;
          const sc = spatial(sp, d, p.pos);
          if (sc.gain * lvl < 2e-3) continue;
          cand.missile.push({ key: p.id, score: lvl * sc.gain, sp: sc, params: { boost, sus, k: dp.k, ram: !!K.ram } });
        }
        for (const [id, m] of mstate) if (tn - (m.seen || m.t0) > 30) mstate.delete(id);
      }
      // aircraft, fires, sinking hulls, machinery
      if (sim.units && sim.units.values) {
        for (const u of sim.units.values()) {
          if (!u || !isPos(u.pos)) continue;
          const ty = u.type, dom = u.def ? u.def.domain : (AIR[ty] ? 'air' : SHIPS[ty] ? 'sea' : 'land');
          const d = dist(u.pos);
          if (u.alive) {
            if (ty === 'fighter' && !u.aboard && d < LSPEC.jet.max) {
              const dp = doppler(u.pos, uvel(u)), sp = LSPEC.jet;
              cand.jet.push({ key: u.id, score: law(sp, d), sp: spatial(sp, d, u.pos), params: { k: dp.k, ab: u.ab || 0 } });
            } else if (ty === 'helo' && d < LSPEC.rotor.max && (!u.aboard || u.spool > 0)) {
              const dp = doppler(u.pos, uvel(u)), sp = LSPEC.rotor, on = u.aboard ? clamp(u.spool || 0, 0, 1) : 1;
              cand.rotor.push({ key: u.id, score: law(sp, d) * (.3 + .7 * on), sp: spatial(sp, d, u.pos), params: { k: dp.k, on } });
            } else if (ty === 'drone' && !u.aboard && d < LSPEC.drone.max) {
              const dp = doppler(u.pos, uvel(u)), sp = LSPEC.drone;
              cand.drone.push({ key: u.id, score: law(sp, d), sp: spatial(sp, d, u.pos), params: { k: dp.k } });
            }
            if (d < LSPEC.hyd.max) machinery(u, d, cand.hyd);
          } else if ((u.dying || 0) < 1 && !u.aboard) {
            const dy = u.dying || 0;
            if (dom !== 'air' && d < LSPEC.fire.max) {
              const i = (dy < .03 ? dy / .03 : 1) * (1 - smooth(.55, 1, dy));
              if (i > .01) cand.fire.push({ key: u.id, score: i * law(LSPEC.fire, d), sp: spatial(LSPEC.fire, d, u.pos), params: { i } });
            }
            if (dom === 'sea' && d < LSPEC.sink.max) cand.sink.push({ key: u.id, score: law(LSPEC.sink, d), sp: spatial(LSPEC.sink, d, u.pos), params: { p: dy } });
          }
        }
      }
    }
    for (const k in pools) runPool(pools[k], cand[k], tA, dt, hold);
  }
  function uvel(u) {
    if (isPos(u.vel)) return u.vel;
    if (isPos(u.prev)) return [(u.pos[0] - u.prev[0]) / DT_SIM, (u.pos[1] - u.prev[1]) / DT_SIM, (u.pos[2] - u.prev[2]) / DT_SIM];
    const s = u.speed || 0, h = u.hdg || 0, pt = u.pitch || 0;
    return [s * Math.sin(h) * Math.cos(pt), s * Math.sin(pt), s * Math.cos(h) * Math.cos(pt)];
  }

  /* machinery near the camera: erector / jacks / mast hydraulics, crane and turret drives; crane clanks */
  function machinery(u, d, out) {
    let m = motion.get(u.id);
    const vals = [u.elev, u.dep, u.mast, u.crane, u.tYaw, u.tPitch];
    if (!m) { m = { v: vals, last: -1e9, what: 0, clank: realT + 1 }; motion.set(u.id, m); return; }
    let what = -1;
    for (let i = 0; i < vals.length; i++) if (typeof vals[i] === 'number' && Math.abs(vals[i] - (m.v[i] || 0)) > 1e-6) { what = i; break; }
    m.v = vals;
    if (what >= 0) { m.last = realT; m.what = what; }
    if (realT - m.last > .25) return;
    const w = m.what, elec = w >= 3;
    const f = w === 0 ? 150 + 90 * clamp((u.elev || 0) / 1.53, 0, 1) : w === 1 ? 130 : w === 2 ? 170 : w === 3 ? 300 : 420;
    out.push({ key: u.id, score: law(LSPEC.hyd, d), sp: spatial(LSPEC.hyd, d, u.pos), params: { v: 1, f, elec } });
    if (w === 3 && realT > m.clank && d < 400) { m.clank = realT + 1.2 + rnd() * 2.2; world('clank', u.pos, { g: .5 + rnd() * .5 }); }
  }

  /* ---------------- ambience ---------------- */
  function updateAmb(tA) {
    const g = G(), map = g.map, sim = g.sim;
    const wx = (sim && sim.weather) || (map && map.weather) || { kind: 'calm', wind: [0, 0], sea: .2 };
    const kind = wx.kind || 'calm', h = L.h;
    // what lies under and around the camera: open sea, coast, or land
    if (map && map.water && L.ok) {
      const R = clamp(h * 1.2 + 150, 150, 6000);
      let w = 0, n = 0;
      const test = (x, z) => { n++; try { if (map.water(x, z)) w++; } catch (e) { w++; } };
      test(L.eye[0], L.eye[2]);
      for (let i = 0; i < 8; i++) test(L.eye[0] + Math.sin(i * TAU / 8) * R, L.eye[2] + Math.cos(i * TAU / 8) * R);
      seaFrac = w / n;
    } else seaFrac = 1;
    surf = clamp(1 - Math.abs(seaFrac - .5) * 2.2, 0, 1);
    const low = 1 - smooth(20, 1500, h);
    amb.sea.set({ gain: 1 }, { sea: wx.sea === undefined ? .3 : wx.sea, k: seaFrac * low * .9, low, surf }, tA);
    const wv = wx.wind || [0, 0], ws = Math.hypot(wv[0] || 0, wv[1] || 0);
    const base = { calm: .35, haze: .4, rain: .7, storm: 1.1 }[kind] || .4;
    const alt = clamp(Math.log10(h / 30) / Math.log10(30000 / 30), 0, 1);
    const wdir = ws > .1 ? dot([wv[0] / ws, 0, wv[1] / ws], L.r) : 0;
    amb.wind.set({ gain: 1 }, { w: base * (.6 + .4 * clamp(ws / 15, 0, 1)), alt, pan: -wdir * .35 }, tA);
    let rain = 0;
    if (kind === 'rain' || kind === 'storm') {
      const sq = wx.squalls;
      if (sq && sq.length) {
        for (const s of sq) { const e = Math.hypot(L.eye[0] - s.x, L.eye[2] - s.z) - s.r; rain = Math.max(rain, e <= 0 ? 1 : .35 * (1 - smooth(0, 4000, e))); }
      } else rain = kind === 'storm' ? .9 : .7;
      rain *= 1 - smooth(1500, 6000, h);
    }
    amb.rain.set({ gain: 1 }, { r: rain }, tA);
  }

  /* ---------------- selected radars: a soft tick per revolution ---------------- */
  function radarTicks() {
    const g = G(), sel = g.selection;
    if (!sel || !sel.size || !g.sim) return;
    const tn = now();
    let n = 0;
    for (const id of sel) {
      if (n >= 3) break;
      const u = unitOf(id);
      if (!u || !u.alive || !(u.antW > 0) || u.side !== side()) continue;
      n++;
      const a = (u.antA || 0) + u.antW * (tn - (u.antT || 0)), rev = Math.floor(a / TAU);
      const last = sweepRev.get(id);
      sweepRev.set(id, rev);
      if (last !== undefined && rev > last && u.antW * rate() < TAU * 5) sig('sweep', u.pos);
    }
  }

  /* ---------------- the system ---------------- */
  core.onUnlock.push(() => { pools = makePools(); amb = makeAmb(); });

  const sys = {
    name: 'audio', priority: 0, core,
    init(g) {
      if (g) game = g;
      const gg = G();
      if (!gg.audio) gg.audio = sys;
      if (gg.bus && gg.bus.on) { try { gg.bus.on('sound', d => d && sys.play(d.name, d.pos, d.opts)); } catch (e) { /* optional */ } }
    },

    update(dtReal, dtSim) {
      dtReal = isFinite(dtReal) ? Math.min(.25, Math.max(0, dtReal)) : 0;
      if (!isFinite(dtSim)) dtSim = paused() ? 0 : dtReal * rate();
      realT += dtReal; simT += dtSim;
      const g = G();
      if (g.sim !== lastSim) { if (lastSim) sys.reset(); lastSim = g.sim; }
      readCamera(dtSim);
      // time rate and pause: heard whoever changed them
      const r = +g.timeRate || 1, ps = paused();
      if (lastRate !== null && r !== lastRate && core.ready) sig('rate', null, { rate: r, up: r > lastRate });
      if (lastPaused !== null && ps !== lastPaused && core.ready) sig(ps ? 'pause' : 'resume');
      lastRate = r; lastPaused = ps;
      if (!core.ready || !pools) return;
      flushFronts(dtReal, dtSim);
      loopAcc += dtReal; ambAcc += dtReal;
      const tA = core.ac.currentTime;
      if (loopAcc >= 1 / 30) { updateLoops(loopAcc, tA); loopAcc = 0; }
      if (ambAcc >= .2) { updateAmb(tA); ambAcc = 0; }
      if (!ps) radarTicks();
      if (realT - pruneT > 5) {                       // forget trackers of units that are gone
        pruneT = realT;
        for (const id of motion.keys()) if (!unitOf(id)) motion.delete(id);
        for (const id of sweepRev.keys()) if (!g.selection || !g.selection.has(id)) sweepRev.delete(id);
      }
      core.sweep();
    },

    onEvent,

    /* interface sound: 'select' 'order' 'invalid' 'rate' 'pause' 'resume' 'alert' 'alarm' ... (README) */
    ui(name, opts) {
      const sp = SPEC[name];
      if (!sp) { if (!warned.has(name)) { warned.add(name); console.warn('audio: no sound', name); } return null; }
      if (sp.cls === 'world') return fire(name, null, 0, opts);
      return sig(name, opts && opts.pos, opts);
    },

    /* any sound at a world position; world sounds travel to the camera at 343 m/s (opts.delay === false: now).
       opts.t: sim time the sound left its source (default now). Other opts go to the recipe (size, dur, metal...). */
    play(name, pos, opts) {
      opts = opts || {};
      const sp = SPEC[name];
      if (!sp) { if (!warned.has(name)) { warned.add(name); console.warn('audio: no sound', name); } return; }
      if (sp.cls !== 'world') { sig(name, pos, opts); return; }
      if (!isPos(pos)) { fire(name, null, 0, opts); return; }
      if (opts.delay === false || sp.delay === false) { if (L.ok) fire(name, pos, dist(pos), opts); return; }
      if (name === 'thunder') { queue('thunder', pos, opts, opts.t, { seg: [pos.slice(), opts.top || [pos[0], 3500, pos[2]]], prep: thunderPrep }); return; }
      queue(name, pos, opts, opts.t);
    },

    unlock() { core.unlock(); },
    mute(on) { return core.mute(on); },
    get ready() { return core.ready; },

    /* drop everything in flight (new match, leaving the game) */
    reset() {
      pend.length = 0; mstate.clear(); motion.clear(); sweepRev.clear();
      for (const v of core.voices) v.kill();
      if (pools) for (const k in pools) for (const s of pools[k].slots) s.dispose();
    },

    /* sound fronts still travelling: [{ name, pos, r (m, front radius), d (m, to the camera) }] */
    fronts() { return pend.filter(e => e.el >= 0).map(e => ({ name: e.name, pos: e.pos, r: C * e.el, d: e.seg ? distSeg(e.seg[0], e.seg[1]) : dist(e.pos) })); },

    stats() {
      const c = core.counts();
      let loops = 0, built = 0;
      if (pools) for (const k in pools) for (const s of pools[k].slots) { if (s.key !== null) loops++; if (s.built) built++; }
      return {
        state: core.ac ? core.ac.state : 'locked', voices: c.world + c.sig + c.ui, world: c.world, sig: c.sig, ui: c.ui,
        loops, slotsBuilt: built, pending: pend.length, nodes: core.live,
        peakDb: db(core.meter.out), preDb: db(core.meter.pre), limDb: -core.meter.gr, sea: seaFrac, h: L.h,
      };
    },
  };
  return sys;
}

export const db = x => x > 1e-6 ? 20 * Math.log10(x) : -120;
export { SPEC, SHOTS } from './patches.js';
