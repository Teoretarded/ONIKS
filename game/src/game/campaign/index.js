/* Campaign mission scripts: a small beat runner registered as the 'campaign' system in campaign mode (objectives.js
   returns it next to the objectives system). Each mission has one script, campaign/m<n>_<id>.js, exporting
     setup(S)   before the first frame: place the forces, the enemy's plan, weather, which objectives show
     run(S)     at the first frame: the intro flight and the beats
   S, the script's handle:
     game sim map m obj (objectives system) lines flags t (sim s) rt (real s since run)
     at(t, fn) after(dt, fn) every(dt, fn) real(dt, fn)        sim-time / real-time timers
     on(type, pred, fn) once(type, pred, fn)                    sim events (pred may be null)
     bus(name, fn)                                              game bus
     when(pred, fn)                                             polled; fires once when pred() is true
     say(text, o) prompt(text, o) mark(id, target, o) unmark(id) area(id, [x, z], r, o) unarea(id)   lines, tags, rings
     reveal(id) objective(id) done(id, prog) failObj(id, prog) prog(id, text) addObjective(o, opt) holdWin(on)
     win(delay) lose(delay)
     fly(keys, o) -> flight (camera.js); intro(keys, { onEnd, show }) the same with the HUD out of the way, time at
       x1 and `show` (enemy units) drawn while it plays
     seq(steps) -> runner for guided steps: { say, prompt, key, mark, enter(S), done(S), min, after, timeout, skip(S) }
     own(type) foe(type) contact(u) tracked(u) classified(u) by(interceptEvent) inAir()
   Mission data (data/campaign.js) read here: supply (the player's starting supply), enemyAi (false: the script
   drives the enemy), fleetBuys (the enemy may buy reinforcements).
   Debug: play.html?...&intro=0 skips the opening flights. */
import { PRI } from '../game.js';
import { createLines } from './lines.js';
import { flight } from './camera.js';
import { regrade } from './grade.js';
import { enemyAi } from './world.js';
import { CLASSIFY } from '../../data/units.js';

/* who took a round down (intercept events' byKind) */
export const BY = { sm6: 'SM-6', pdms: 'ESSM', ciws: 'Phalanx', sam: '57E6', gun30: '30 mm', aam: 'AIM-120' };

const SCRIPTS = {
  inside: () => import('./m1_inside.js'),
  scale: () => import('./m2_scale.js'),
  battery: () => import('./m3_battery.js'),
  engagement: () => import('./m4_engagement.js'),
  ring: () => import('./m5_ring.js'),
  strike: () => import('./m6_strike.js'),
};

export async function createCampaign(game, ctx, obj) {
  const m = game.mission;
  if (!m || !SCRIPTS[m.id]) return null;
  const mod = await SCRIPTS[m.id]();
  const { sim } = game;
  const Q = new URLSearchParams(location.search);
  const lines = createLines(game);
  const timers = [];           // { at, fn, real }
  const trig = [];             // { type, pred, fn, once }
  const conds = [];            // { pred, fn }
  const offs = [];             // bus unsubscribes
  const seqs = [];
  let flights = [];
  let rt0 = -1, started = false, introOn = false, uiWas = false, rateWas = 0, ended = false, quiet = false;

  const S = {
    game, sim, map: game.map, m, obj, lines, flags: {}, mod,
    side: game.side, enemy: game.enemy,
    params: Q,
    get t() { return sim.t; },
    get rt() { return rt0 < 0 ? 0 : game.realT - rt0; },
    get intro_() { return introOn; },

    /* ---- time ---- */
    at(t, fn) { timers.push({ at: t, fn }); return S; },
    after(dt, fn) { timers.push({ at: sim.t + dt, fn }); return S; },
    real(dt, fn) { timers.push({ at: game.realT + dt, fn, real: true }); return S; },
    every(dt, fn, from) { const tick = () => { if (fn() === false) return; S.after(dt, tick); }; S.at(from !== undefined ? from : sim.t + dt, tick); return S; },
    /* ---- triggers ---- */
    on(type, pred, fn, once) { const h = { type, pred, fn, once: !!once, dead: false }; trig.push(h); return () => { h.dead = true; }; },
    once(type, pred, fn) { return S.on(type, pred, fn, true); },
    bus(name, fn) { const off = game.bus.on(name, fn); offs.push(off); return off; },
    when(pred, fn) { const c = { pred, fn, dead: false }; conds.push(c); return () => { c.dead = true; }; },
    /* ---- the voice ---- */
    say(text, o) { if (!quiet) lines.say(text, o); },
    prompt(text, o) { if (!quiet || !text) lines.prompt(text, o); },
    mark(id, target, o) { if (!quiet) lines.mark(id, target, o); },
    unmark(id) { lines.unmark(id); },
    area(id, c, r, o) { if (!quiet) lines.area(id, c, r, o); },
    unarea(id) { lines.unarea(id); },
    /* ---- objectives ---- */
    reveal(id, quiet) { return obj.reveal(id, quiet); },
    objective(id) { return obj.get(id); },
    done(id, prog) { return obj.set(id, 'done', prog); },
    failObj(id, prog) { return obj.set(id, 'failed', prog); },
    prog(id, text) { return obj.set(id, null, text); },
    addObjective(o, opt) { return obj.add(o, opt); },
    holdWin(on) { obj.holdWin(on); },
    win(delay) { if (ended) return; ended = true; const f = () => { obj.holdWin(false); obj.win(); }; if (delay) S.after(delay, f); else f(); },
    lose(delay) { if (ended) return; ended = true; const f = () => obj.lose('mission'); if (delay) S.after(delay, f); else f(); },
    /* ---- camera ---- */
    fly(keys, o) { const f = flight(game, keys, o); flights.push(f); return f; },
    intro(keys, o) {
      o = o || {};
      // skipped (?intro=0, ?cam=): the rest of the opening still happens, on the next frame (after run() is through)
      if (Q.get('cam') || Q.get('intro') === '0') { if (o.onEnd) S.real(0, () => o.onEnd(false)); return null; }
      introOn = true; uiWas = game.ui.hidden; rateWas = game.timeRate;
      if (!uiWas) game.setUiHidden(true);
      if (game.timeRate !== 1) game.setRate(1, 'intro');
      // the opening shows what the film would (o.show: enemy units drawn as tracks while it plays; the picture itself
      // is not touched, only what is drawn)
      let vis0 = null;
      if (o.show && o.show.length) {
        const ids = new Set(o.show.map(u => u.id));
        vis0 = sim.visible;
        sim.visible = function (side, u) { return side === game.side && ids.has(u.id) && u.alive ? 'track' : vis0.call(this, side, u); };
      }
      const f = S.fly(keys, { onEnd(ok) {
        if (vis0) { sim.visible = vis0; vis0 = null; }
        introOn = false;
        if (!uiWas) game.setUiHidden(false);
        if (game.timeRate === 1 && rateWas !== 1) game.setRate(rateWas, 'intro');
        if (o.onEnd) o.onEnd(ok);
      } });
      return f;
    },
    /* ---- guided steps ---- */
    seq(steps, o) { const r = runSeq(S, steps, o || {}); seqs.push(r); return r; },
    /* ---- units and the picture ---- */
    own(type) { return sim.alive(game.side).filter(u => !type || u.type === type); },
    foe(type) { return sim.alive(game.enemy).filter(u => !type || u.type === type); },
    contact(u) { return u ? sim.contact(game.side, u.id) : null; },
    tracked(u) { const c = S.contact(u); return !!(c && !c.dead && c.conf >= CLASSIFY); },
    classified(u) { const c = S.contact(u); return !!(c && c.cls); },
    selected(type) { return game.selected().some(u => !type || u.type === type); },
    by(e) { return BY[e.byKind] || 'Intercepted'; },
    /* own 3M55 in the air */
    inAir() { for (const p of sim.projectiles.values()) if (p.alive && p.side === game.side && p.kind === 'oniks') return true; return false; },
  };

  /* ---------- the mission's own setup ---------- */
  if (m.supply !== undefined) sim.sides[game.side].supply = m.supply;
  if (m.enemyAi === false) enemyAi(sim, game.enemy, false);
  if (mod.setup) mod.setup(S);

  function start() {
    started = true; rt0 = game.realT;
    if (mod.run) mod.run(S);
  }

  function runTimers() {
    for (let i = timers.length - 1; i >= 0; i--) {
      const x = timers[i];
      if ((x.real ? game.realT : sim.t) < x.at) continue;
      timers.splice(i, 1);
      try { x.fn(S); } catch (e) { console.error('campaign timer', e); }
    }
  }
  let condT = 0;
  function runConds() {
    if (game.realT - condT < .1) return;
    condT = game.realT;
    for (let i = conds.length - 1; i >= 0; i--) {
      const c = conds[i];
      if (c.dead) { conds.splice(i, 1); continue; }
      let ok = false;
      try { ok = c.pred(S); } catch (e) { console.error('campaign when', e); c.dead = true; }
      if (ok) { c.dead = true; conds.splice(i, 1); try { c.fn(S); } catch (e) { console.error('campaign when fn', e); } }
    }
  }

  const sys = {
    name: 'campaign', priority: 90, S,
    init() {
      offs.push(game.bus.on('result', r => {
        regrade(game, r);
        // the end screen takes over: the voice and the tags stop, an opening still flying hands the camera over
        for (const q of seqs) q.stop();
        for (const f of flights) f.cancel();
        S.real(2.5, () => { quiet = true; lines.clear(); lines.unmark(); lines.unarea(); });
      }));
    },
    update(dt, dtSim) {
      if (!started) start();
      for (const f of flights) f.update();
      flights = flights.filter(f => !f.done);
      runTimers();
      runConds();
      for (const q of seqs) q.poll();
      // the enemy does not buy unless the mission says so
      if (!m.fleetBuys && game.frameN % 30 === 0) sim.sides[game.enemy].supply = 0;
      lines.update();
    },
    onEvent(e) {
      for (let i = 0; i < trig.length; i++) {
        const h = trig[i];
        if (h.dead || h.type !== e.type) continue;
        let ok = true;
        if (h.pred) { try { ok = h.pred(e, S); } catch (err) { console.error('campaign pred', err); ok = false; } }
        if (!ok) continue;
        if (h.once) h.dead = true;
        try { h.fn(e, S); } catch (err) { console.error('campaign on ' + e.type, err); }
      }
      if (trig.length > 64) for (let i = trig.length - 1; i >= 0; i--) if (trig[i].dead) trig.splice(i, 1);
    },
    onKey(e) { for (const f of flights) f.onKey(e); return false; },
    onPointer(ev) { for (const f of flights) f.onPointer(ev); return false; },
    draw3d() { if (!introOn) lines.draw3d(); },
    draw2d(ov) { if (!introOn) lines.draw2d(ov); },
    dispose() { lines.dispose(); offs.forEach(f => f()); },
  };
  // the lines stay up during the intro and in the Inspect view (the rest of the UI is out of the way)
  const root = document.getElementById('cmp');
  let shown = true;
  if (root) root.classList.add('always');
  const upd = sys.update;
  sys.update = (dt, dtSim) => {
    upd(dt, dtSim);
    const v = !game.ui.hidden || introOn || !!(game.inspect && game.inspect.active);
    if (root && v !== shown) { shown = v; root.style.display = v ? '' : 'none'; }
  };
  game.campaign = S;
  return sys;
}

/* ---------- guided steps ---------- */
function runSeq(S, steps, o) {
  const game = S.game;
  let i = -1, t0 = 0, doneAt = -1, stopped = false, marks = [];
  const arr = v => v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
  function clearMarks() { for (const id of marks) S.unmark(id); marks = []; }
  function enter(k) {
    clearMarks();
    i = k;
    const st = steps[i];
    if (!st) { S.prompt(null); if (o.onEnd) o.onEnd(S); return; }
    t0 = game.realT; doneAt = -1;
    if (st.skip && st.skip(S)) { enter(i + 1); return; }
    if (st.enter) st.enter(S);
    for (const l of arr(typeof st.say === 'function' ? st.say(S) : st.say)) typeof l === 'string' ? S.say(l) : S.say(l.text, l);
    if (st.prompt) S.prompt(typeof st.prompt === 'function' ? st.prompt(S) : st.prompt, { key: typeof st.key === 'function' ? st.key(S) : st.key }); else S.prompt(null);
    if (st.mark) for (const mk of arr(st.mark(S))) { if (!mk) continue; const id = 'seq' + i + '_' + marks.length; S.mark(id, mk.target, mk); marks.push(id); }
  }
  const R = {
    get i() { return i; }, get step() { return steps[i] || null; },
    stop() { stopped = true; clearMarks(); },
    goto(id) { const k = steps.findIndex(s => s.id === id); if (k >= 0) enter(k); },
    poll() {
      if (stopped) return;
      if (i < 0) { enter(0); return; }
      const st = steps[i];
      if (!st) return;
      if (doneAt < 0) {
        const age = game.realT - t0;
        // a prompt given as a function follows the state
        if (typeof st.prompt === 'function' || typeof st.key === 'function') S.prompt(typeof st.prompt === 'function' ? st.prompt(S) : st.prompt, { key: typeof st.key === 'function' ? st.key(S) : st.key });
        let ok = age >= (st.min || 0) && (!st.done || st.done(S));
        if (!ok && st.timeout && age > st.timeout) ok = true;
        if (ok) {
          doneAt = game.realT;
          S.prompt(null); clearMarks();
          if (st.exit) st.exit(S);
          for (const l of arr(typeof st.then === 'function' ? st.then(S) : st.then)) typeof l === 'string' ? S.say(l) : S.say(l.text, l);
        }
        return;
      }
      if (game.realT - doneAt >= (st.after !== undefined ? st.after : .8)) enter(i + 1);
    },
  };
  return R;
}
