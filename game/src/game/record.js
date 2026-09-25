/* Match recorder: what a match needs to be played again exactly, and a cheap timeline of its moments.

   The sim is deterministic (seeded streams, fixed step), so a match is its setup plus every command that reached the
   sim from outside its own step, each with the tick it was given at. The recorder wraps the live sim instance:
     sim.step    marks the inside of a step (the AI's own orders and buys happen there and are not commands), takes a
                 state hash every CHK ticks (at the start of the step: the state after every command of the tick
                 before), samples the rounds in flight every TRK ticks (their tracks, for the debrief's Orbital map);
     sim.order / sim.buy       outside a step: a command (the player's orders and reinforcements, anything a system
                               issues for the player)                                              -> op 'order' / 'buy'
     sim.spawn / units.delete  outside a step: the sandbox's palette and delete tool               -> op 'spawn' / 'del'
     sim.fog, sim.weather, sim.ai   watched before every command and every step (the sandbox's G, N, K and M)
                                                                                                    -> op 'fog' / 'weather' / 'ai'
   Combat and Sandbox are recorded. A campaign mission's script changes units directly (speed caps, radars, spawns
   with their own logic): it is marked unsupported.

   The timeline (bus 'event'): launch, intercept, hit, splash (heavy rounds), destroyed, scan, result; positions in
   metres (rounded), the tick, and for hits whether the player could see the target (the hit replay's rule).

   rec = { v, supported, why, setup: { mode, map, seed, side, ai, fog, win, timer, weather, h0, n0 }, ops: [...],
           events: [...], tracks: { id: { kind, side, t0, pts: [x, y, z, ...], end } }, hashes: [[tick, hash]], end }
   createRecorder(game) -> { rec, stop(), toJSON() }
   applyOp(sim, op)                    one command, as it was given
   verify(rec, map, o) -> report       a second Sim from the setup, the commands at their ticks, every hash compared
   urlOf(rec, extra)                   play.html's query for the same match
   Every wrapper is on the instance (never the class): a second Sim built from the record is untouched. */
import { createMatch, parseParams, setAi } from './setup.js';
import { Weather } from '../sim/weather.js';
import { DT } from '../sim/consts.js';

export const CHK = 600;                 // ticks between state hashes (30 s of game time)
export const TRK = 10;                  // ticks between track samples (0.5 s)
const TRK_GAP = 320;                    // m a round flies before its track gets a new point
const TRK_MAX = 600;                    // points per track (then every other point goes, and the spacing doubles)
const HEAVY = { oniks: 1, tlam: 1, slam: 1, hellfire: 1, uran: 1, kalibr: 1 };
const r0 = v => Math.round(v);
const r1 = v => Math.round(v * 10) / 10;
const r3 = v => Math.round(v * 1000) / 1000;
const p3 = p => p ? [r0(p[0]), r1(p[1]), r0(p[2])] : null;
const clone = o => JSON.parse(JSON.stringify(o));

export function createRecorder(game) {
  const sim = game.sim, P = game.params || {};
  const mode = game.mode;
  const rec = {
    v: 1, supported: mode === 'combat' || mode === 'sandbox', why: '',
    setup: {
      mode, map: game.map.id, seed: sim.seed, side: game.side, ai: P.ai || 'normal', fog: !!sim.fog, win: P.win || 'hq',
      timer: P.timer, weather: P.weather || null, h0: sim.hash(), n0: sim.list().length, tick0: sim.tick,
    },
    ops: [], events: [], tracks: {}, hashes: [], end: null, dropped: 0,
  };
  if (!rec.supported) rec.why = mode === 'campaign' ? 'campaign scripts change units directly' : 'mode ' + mode;
  if (sim.tick !== 0) { rec.supported = false; rec.why = 'recorder started at tick ' + sim.tick; }
  let on = rec.supported, inStep = 0, wantHash = false;

  /* ------------------------------------------------------------------ the sandbox's switches, watched */
  const aiState = () => { const o = {}; for (const s in sim.ai) o[s] = sim.ai[s]; return o; };
  let fog0 = sim.fog, wx0 = sim.weather, ai0 = aiState();
  function sync() {
    if (sim.fog !== fog0) { fog0 = sim.fog; push({ k: 'fog', on: !!sim.fog }); }
    if (sim.weather !== wx0) {
      wx0 = sim.weather;
      const w = sim.weather;
      push({ k: 'weather', w: { kind: w.kind, wind: w.wind.slice(), sea: w.sea } });
    }
    const a = aiState();
    for (const s of new Set([...Object.keys(a), ...Object.keys(ai0)])) {
      if (a[s] === ai0[s]) continue;
      push({ k: 'ai', side: s, on: !!a[s], level: a[s] ? a[s].level : null });
    }
    ai0 = a;
  }
  function push(op) {
    if (!on) return;
    op.tick = sim.tick;
    rec.ops.push(op);
  }

  /* ------------------------------------------------------------------ the wrappers (on this instance only) */
  const W = {};
  const wrap = (obj, name, fn) => { W[name] = { obj, f: obj[name], own: Object.prototype.hasOwnProperty.call(obj, name) }; obj[name] = fn(obj[name]); };
  wrap(sim, 'step', f => function () {
    if (on) {
      sync();
      if (sim.tick % CHK === 0 || wantHash) { wantHash = false; const h = sim.hash(); const L = rec.hashes[rec.hashes.length - 1]; if (!L || L[0] !== sim.tick) rec.hashes.push([sim.tick, h]); }
    }
    inStep++;
    try { return f.apply(this, arguments); } finally {
      inStep--;
      if (on && sim.tick % TRK === 0) sample();
    }
  });
  wrap(sim, 'order', f => function (ids, order) {
    if (on && !inStep) {
      sync();
      try { push({ k: 'order', ids: (Array.isArray(ids) ? ids : [ids]).slice(), o: clone(order) }); }
      catch (e) { stop('an order could not be kept (' + (e && e.message) + ')'); }
    }
    return f.apply(this, arguments);
  });
  wrap(sim, 'buy', f => function (side, type) {
    const outside = on && !inStep;
    if (outside) sync();
    const ok = f.apply(this, arguments);
    if (outside) push({ k: 'buy', side, type, ok: !!ok });
    return ok;
  });
  wrap(sim, 'spawn', f => function (type, side, x, z, o) {
    const outside = on && !inStep;
    if (outside) sync();
    const u = f.apply(this, arguments);
    if (outside) {
      try { push({ k: 'spawn', type, side: side || null, x, z, o: o ? clone(o) : null, id: u ? u.id : 0 }); }
      catch (e) { stop('a spawn could not be kept'); }
    }
    return u;
  });
  const units = sim.units, del0 = units.delete;
  units.delete = function (id) {
    if (on && !inStep && units.has(id)) { sync(); push({ k: 'del', id }); }
    return del0.call(units, id);
  };

  /* ------------------------------------------------------------------ tracks of the rounds in flight */
  function sample() {
    for (const p of sim.projectiles.values()) {
      if (!p.alive || p.kind === 'shell') continue;
      let T = rec.tracks[p.id];
      if (!T) {
        const f = p.fromPos || p.pos;
        T = rec.tracks[p.id] = { kind: p.kind, side: p.side, t0: sim.tick, gap: TRK_GAP, pts: [r0(f[0]), r1(f[1]), r0(f[2])], end: null };
      }
      // what the player saw of a heavy round's target on its way in (the hit replay's rule: own, or a track)
      if (HEAVY[p.kind] && p.tk === 'unit') { const u = sim.units.get(p.target); if (u && u.alive) { T.tgt = p.target; T.tv = vis(u); } }
      const n = T.pts.length;
      const dx = p.pos[0] - T.pts[n - 3], dy = p.pos[1] - T.pts[n - 2], dz = p.pos[2] - T.pts[n - 1];
      if (dx * dx + dz * dz + dy * dy * 4 < T.gap * T.gap) continue;
      T.pts.push(r0(p.pos[0]), r1(p.pos[1]), r0(p.pos[2]));
      if (T.pts.length > TRK_MAX * 3) {
        const q = [];
        for (let i = 0; i < T.pts.length / 3; i++) if (i % 2 === 0 || i === T.pts.length / 3 - 1) q.push(T.pts[i * 3], T.pts[i * 3 + 1], T.pts[i * 3 + 2]);
        T.pts = q; T.gap *= 2;
      }
    }
  }

  /* ------------------------------------------------------------------ the timeline */
  const tickOf = e => Math.round((e.t !== undefined ? e.t : sim.t) / DT);
  const vis = u => { if (!u) return null; try { return sim.visible(game.side, u); } catch (e) { return null; } };
  function endTrack(e, k) {
    const T = e.proj !== undefined ? rec.tracks[e.proj] : null;
    if (!T || T.end) return;
    T.end = { k, tick: tickOf(e), pos: p3(e.pos) };
    if (e.pos) T.pts.push(r0(e.pos[0]), r1(e.pos[1]), r0(e.pos[2]));
  }
  function onEvent(e) {
    if (!on) return;
    const E = rec.events;
    switch (e.type) {
      case 'launch': {
        const u = sim.units.get(e.from);
        E.push({ k: 'launch', tick: tickOf(e), id: e.proj, kind: e.kind, side: e.side, from: e.from, ftype: u ? u.type : null, target: e.target, tk: e.tk,
          pos: p3(e.pos), hdg: r3(e.hdg || 0), pitch: r3(e.pitch || 0), weapon: e.weapon || null });
        break;
      }
      case 'intercept':
        E.push({ k: 'intercept', tick: tickOf(e), id: e.proj, kind: e.kind, side: e.side, by: e.by, bykind: e.byKind || null, pos: p3(e.pos) });
        endTrack(e, 'intercept');
        break;
      case 'hit': {
        const u = sim.units.get(e.target);
        E.push({ k: 'hit', tick: tickOf(e), id: e.proj, kind: e.kind, side: e.side, from: e.from, target: e.target, ttype: u ? u.type : null,
          pos: p3(e.pos), kill: !!(u && !u.alive), hp: u ? r1(u.hp) : 0, vis: (u && u.alive ? vis(u) : null) || (rec.tracks[e.proj] && rec.tracks[e.proj].tv) || null });
        endTrack(e, 'hit');
        break;
      }
      case 'splash':
        if (HEAVY[e.kind]) E.push({ k: 'splash', tick: tickOf(e), id: e.proj, kind: e.kind, side: e.side, pos: p3(e.pos), why: e.why || null });
        endTrack(e, 'splash');
        break;
      case 'torpedo_end': endTrack(e, 'splash'); break;
      case 'destroyed': {
        const u = sim.units.get(e.unit);
        E.push({ k: 'dest', tick: tickOf(e), unit: e.unit, type: e.utype || (u && u.type), side: e.side, pos: p3(e.pos), by: e.by, vis: vis(u) });
        break;
      }
      case 'scan':
        if (e.phase === 'start') E.push({ k: 'scan', tick: tickOf(e), side: e.side, by: e.by, pos: p3(e.pos), r: r0(e.r || 0) });
        break;
      case 'result':
        E.push({ k: 'result', tick: tickOf(e), winner: e.winner, reason: e.reason });
        wantHash = true;
        break;
    }
    if (E.length > 20000) E.splice(0, E.length - 20000);
  }
  const offEv = game.bus.on('event', onEvent);
  const offRes = game.bus.on('result', r => {
    if (!on || rec.end) return;
    rec.end = { tick: sim.tick, t: sim.t, win: !!r.win, reason: r.reason || '', grade: r.grade || '' };
    wantHash = true;
  });

  function stop(why) {
    if (!on) return;
    on = false; rec.supported = false; rec.why = why || rec.why || 'stopped';
    console.warn('record: ' + rec.why);
  }
  return {
    rec,
    get on() { return on; },
    stop,
    /* the state now, as the last checkpoint (the debrief's end check) */
    mark() { if (!on) return null; sync(); const m = [sim.tick, sim.hash()]; rec.now = m; return m; },
    dispose() {
      offEv(); offRes();
      for (const k in W) { const w = W[k]; if (w.own) w.obj[k] = w.f; else delete w.obj[k]; }
      units.delete = del0;
      on = false;
    },
  };
}

/* ------------------------------------------------------------------ playing the commands back */
export function applyOp(sim, op) {
  switch (op.k) {
    case 'order': sim.order(op.ids.slice(), clone(op.o)); break;
    case 'buy': sim.buy(op.side, op.type); break;
    case 'spawn': sim.spawn(op.type, op.side || undefined, op.x, op.z, op.o ? clone(op.o) : undefined); break;
    case 'del': {
      if (!sim.units.has(op.id)) break;
      const u = sim.units.get(op.id);
      sim.units.delete(op.id);
      for (const s in sim.sides) sim.sides[s].contacts.delete(op.id);
      sim.emit('removed', { unit: op.id, type: u.type, side: u.side });
      sim._dirty = true;
      break;
    }
    case 'fog': sim.fog = !!op.on; break;
    case 'ai': setAi(sim, op.side, op.on, op.level || 'normal'); break;
    case 'weather': sim.weather = new Weather(sim, op.w); break;
  }
}

/* the query string that builds the same match (play.html parses it with parseParams) */
export function urlOf(rec, extra) {
  const S = rec.setup, q = new URLSearchParams();
  q.set('mode', S.mode); q.set('map', S.map); q.set('side', S.side); q.set('seed', String(S.seed));
  if (S.mode === 'combat') { q.set('ai', S.ai); q.set('win', S.win); if (S.win === 'obj' && S.timer) q.set('timer', String(S.timer)); }
  q.set('fog', S.fog ? '1' : '0');
  if (S.weather) q.set('weather', S.weather);
  for (const k in extra || {}) q.set(k, String(extra[k]));
  return q.toString();
}
export function paramsOf(rec) { return parseParams('?' + urlOf(rec)); }

/* A player of the record on a sim built from its setup: opsTo(tick) applies every command given at or before `tick`
   that has not been applied yet (call it after the sim has stepped to that tick, before the next step). */
export function cursor(rec) {
  let i = 0;
  const ops = rec.ops;
  return {
    get i() { return i; },
    opsTo(sim, tick) { let n = 0; while (i < ops.length && ops[i].tick <= tick) { applyOp(sim, ops[i++]); n++; } return n; },
    next() { return i < ops.length ? ops[i].tick : Infinity; },
  };
}

/* The determinism check: a second Sim from the setup, headless, the commands at their ticks; every recorded hash
   compared at its tick (and `now`, the live state when the check was asked for).
   -> { ok, checked, first: null | { tick, want, got }, ticks, ms, h0 } */
export function verify(rec, map, o) {
  o = o || {};
  const t0 = performance.now();
  const M = createMatch(map, paramsOf(rec), null);
  const sim = M.sim;
  const out = { ok: true, checked: 0, first: null, h0: sim.hash() === rec.setup.h0, ms: 0, ticks: 0, mismatches: 0 };
  if (!out.h0) { out.ok = false; out.first = { tick: 0, want: rec.setup.h0, got: sim.hash() }; }
  const cur = cursor(rec);
  const marks = rec.hashes.slice();
  if (rec.now) marks.push(rec.now);
  marks.sort((a, b) => a[0] - b[0]);
  const last = o.to !== undefined ? o.to : marks.length ? marks[marks.length - 1][0] : 0;
  let k = 0;
  cur.opsTo(sim, 0);
  while (k < marks.length && marks[k][0] < 0) k++;
  for (let first = true; first || sim.tick < last; first = false) {
    if (!first) { sim.step(); sim.events.length = 0; cur.opsTo(sim, sim.tick); }
    while (k < marks.length && marks[k][0] === sim.tick) {
      const h = sim.hash();
      out.checked++;
      if (h !== marks[k][1]) { out.mismatches++; if (!out.first) out.first = { tick: sim.tick, want: marks[k][1], got: h }; out.ok = false; if (!o.all) { k = marks.length; break; } }
      k++;
    }
    if (!out.ok && !o.all) break;
  }
  out.ticks = sim.tick; out.ms = Math.round(performance.now() - t0);
  out.sim = o.keep ? sim : undefined;
  return out;
}
