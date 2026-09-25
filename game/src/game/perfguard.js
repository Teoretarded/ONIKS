/* Auto quality: the frame-time watchdog that holds 60 fps.

   createPerfGuard(game) -> the system 'perfguard' (priority 0: its update runs after every other system's, so what it
   sets is what this frame draws with). On while Settings > Graphics > Auto quality is on (data/settings.js
   autoQuality, default on; the in-game settings panel too). Nothing on screen but the FPS readout ("AUTO · FX .60").

   What it measures, every frame: the main thread's time in game.frame (sim, systems, the renderer's CPU side) and the
   GPU's own time for the frame (EXT_disjoint_timer_query_webgl2, read back a few frames later without stalling;
   without the extension, what the frame interval shows beyond the main thread once frames are missed). The frame's cost is the larger of the two, with the sim counted only up to
   its floor (SIM_MIN): at a high time rate the sim takes whatever time the frame leaves it (game.stepBudgetMs, set
   here every frame to what the drawing leaves of the target), so it never needs the picture to get worse. The cost
   is smoothed (~0.3 s, one frame's spike clipped), so a single hitch never moves anything.

   What it does:
     down  the smoothed cost above TARGET (14 ms) for a second: one step down the ladder, then 1.5 s to settle
     up    the smoothed cost under UP_AT (9 ms) for UP_WAIT s: one step back up. If that step comes down again within
           BOUNCE s, the wait to try it again doubles (up to a minute and a half) and the bar to try it drops: it never
           oscillates
   The ladder (each step keeps the ones before it): the effects budget (smoke, debris, sparks, dynamic lights; the
   trails keep that share of their older puffs) at .6, .35; the dot density (the ground's lattice) at .8, .65; the
   render scale at .85, .75, .67, .5 (of the scale set in Settings; never under 50 % of the screen). The dot density
   and render scale steps are taken only while the GPU is a real share of the frame: a frame bound by the main thread
   gains nothing from fewer pixels, so there the guard stops after the effects. The settings the player chose are never written: the guard only scales
   the live values (fx budget, terrain density, R.renderScale) and puts them back when it steps up or is switched off.

   game.quality = { level, label ('AUTO · .85'), fx / dots / scale (the factors in force: 1 at full quality; an effects
   system of its own may scale its work by fx), hold, on, frameMs, renderMs, gpuMs, simMs, steps, log } for the FPS
   readout and the console. hold = true (the perf suite, game/src/perf.js): full quality, nothing measured. */
import { FX_LEVELS } from '../fx/index.js';
import { DOT_DENSITY, getSettings, onSettings } from '../data/settings.js';

const TARGET = 14;          // ms: the frame's cost the guard holds (16.7 ms at 60 Hz, less the browser's own work)
const UP_AT = 9;            // ms: headroom enough to take one step back up
const SIM_MIN = 2.5;        // ms: the sim's share of a frame that always counts (at x32 it may take more, if left)
const SIM_MAX = 9;          // ms: the sim's budget with nothing else to do (game.js's own default)
const DOWN_AFTER = 1;       // s over the target before a step down
const UP_WAIT = 4;          // s of headroom before a step up (doubles after a bounce)
const SETTLE = 1.5;         // s after a step before the guard judges again (a new render scale reallocates)
const SETTLE_DOWN = .6;     // s after a step down before judging whether it helped
const BOUNCE = 12;          // s: a step up that comes back down within this is a bounce
const WARMUP = 3;           // s after start (shaders, first samples) before anything is judged
const TAU = .3;             // s: smoothing of the cost

/* the ladder: fx (effects budget share), dots (terrain density), scale (render scale) */
export const LADDER = [
  { fx: 1, dots: 1, scale: 1 },
  { fx: .6, dots: 1, scale: 1 },
  { fx: .35, dots: 1, scale: 1 },
  { fx: .35, dots: .8, scale: 1 },
  { fx: .35, dots: .65, scale: 1 },
  { fx: .35, dots: .65, scale: .85 },
  { fx: .35, dots: .65, scale: .75 },
  { fx: .35, dots: .65, scale: .67 },
  { fx: .35, dots: .65, scale: .5 },
];
const f2 = v => (v >= 1 ? '1.0' : v.toFixed(2).replace(/^0/, ''));
function labelOf(L) {
  if (L.scale < 1) return 'AUTO · ' + f2(L.scale);
  if (L.dots < 1) return 'AUTO · DOTS ' + f2(L.dots);
  if (L.fx < 1) return 'AUTO · FX ' + f2(L.fx);
  return 'AUTO';
}

export function createPerfGuard(game) {
  const R = game.R, gl = R.gl, sim = game.sim;
  const now = () => performance.now();
  const Qp = new URLSearchParams(location.search);
  const qScale = +Qp.get('scale') || 1;
  const Q = game.quality = {
    level: 0, label: '', hold: false, on: true, pin: null, fx: 1, dots: 1, scale: 1,
    frameMs: 0, renderMs: 0, gpuMs: 0, simMs: 0,
    steps: 0, log: [],                 // [{ t (s of play), from, to, ms }]
  };
  let S = 0, Sr = 0, Sg = 0, over = 0, under = 0, since = -1e9, lastUp = -1e9, t = 0, simAcc = 0;
  let from0 = 0, sDown = 0;          // the level before the last step down, and the cost that made it
  let upFrom = -1;                   // the level the last step up left (coming straight back to it is a bounce)
  const wait = LADDER.map(() => UP_WAIT), bar = LADDER.map(() => UP_AT);
  let applied = null, fxSys = null;

  /* ---------- the GPU's time per frame (queries read back when ready, never waited for) ---------- */
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pend = [];                     // [query, frame]
  const pool = [];
  let gpuLast = 0, qActive = false;
  function gpuBegin() {
    if (!tq || pend.length > 6) return;
    const q = pool.pop() || gl.createQuery();
    gl.beginQuery(tq.TIME_ELAPSED_EXT, q); qActive = q;
  }
  function gpuEnd() {
    if (!qActive) return;
    gl.endQuery(tq.TIME_ELAPSED_EXT); pend.push(qActive); qActive = false;
  }
  function gpuRead() {
    if (!tq || !pend.length) return;
    const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
    while (pend.length && gl.getQueryParameter(pend[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pend.shift();
      if (!disjoint) gpuLast = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      pool.push(q);
    }
    if (disjoint) { for (const q of pend) pool.push(q); pend.length = 0; }
  }

  /* ---------- the sim's own time (its steps; the events it raises are the systems' work) ---------- */
  const step0 = sim.step;
  const stepT = sim.step = function () { const a = now(); const r = step0.apply(this, arguments); simAcc += now() - a; return r; };

  /* ---------- the knobs: the live values from the player's settings, scaled by the level ---------- */
  function apply(L) {
    const s = game.settings || getSettings();
    Q.fx = L.fx; Q.dots = L.dots; Q.scale = L.scale;      // (other effect systems may scale their own work by Q.fx)
    // effects: the fx system's dot budget, its thinning ceiling and the dynamic lights (FX_LEVELS of the setting)
    if (!fxSys) fxSys = game.getSystem('fx');
    if (fxSys && fxSys.baseBudget) {
      const P = FX_LEVELS[fxSys.level] || FX_LEVELS[s.effects] || FX_LEVELS.high;
      const b = Math.round(fxSys.baseBudget * P.budget * L.fx), qm = P.q * (L.fx < 1 ? .5 + .5 * L.fx : 1);
      if (fxSys.budget !== b) fxSys.budget = b;
      if (fxSys.qMax !== qm) { fxSys.qMax = qm; if (fxSys.q > qm) fxSys.q = qm; }
      if (fxSys.C) {
        const lmax = L.fx < 1 ? Math.max(3, Math.round(Math.min(P.lights, 16) * L.fx)) : P.lights, lmin = L.fx < 1 ? Math.max(P.lightMin, .08) : P.lightMin;
        fxSys.C.lmax = lmax; fxSys.C.lmin = lmin;
        // the smoke's own thinning (fx/lib/smoke.js): the share of the older puffs a trail keeps; 1 at full quality
        fxSys.C.qi = L.fx;
      }
    }
    // dot density: the ground's lattice (as the Dot density setting does)
    const d = (DOT_DENSITY[s.dotDensity] || 1) * L.dots, T = R.terrain;
    if (T && (Math.abs(T.densNear - 140 * d) > 1e-6 || Math.abs(T.densFar - 380 * d) > 1e-6)) { T.densNear = 140 * d; T.densFar = 380 * d; }
    // render scale: of the player's, never under half the screen
    const base = qScale * (s.renderScale || 1), rs = Math.max(Math.min(base, .5), base * L.scale);
    if (Math.abs(R.renderScale - rs) > 1e-6) R.renderScale = rs;
    applied = L;
  }
  function setLevel(n, why) {
    n = Math.max(0, Math.min(LADDER.length - 1, n));
    // a render-scale step that cannot scale (the player's scale already at the floor) is skipped
    const s = game.settings || getSettings(), base = qScale * (s.renderScale || 1);
    while (n > Q.level && n < LADDER.length - 1 && LADDER[n].scale < 1 && base * LADDER[n].scale < .5 - 1e-6) n++;
    if (n === Q.level) return;
    const from = Q.level;
    // a step down soon after a step up (a bounce): the level we came down to waits longer next time, and needs more
    // headroom
    if (n > from && n === upFrom && t - lastUp < BOUNCE) { wait[n] = Math.min(90, wait[n] * 2); bar[n] = Math.max(5, bar[n] - 1); }
    Q.level = n; Q.steps++;
    Q.log.push({ t: +t.toFixed(1), from, to: n, ms: +S.toFixed(1), why });
    if (Q.log.length > 40) Q.log.shift();
    Q.label = Q.on ? labelOf(LADDER[n]) : '';
    since = t; over = under = 0;
    apply(LADDER[n]);
  }

  /* ---------- the watch ---------- */
  function observe(cpu, dtReal) {
    gpuRead();
    const simMs = simAcc; simAcc = 0;
    // without the timer query (other browsers), what the frame interval shows beyond the main thread's work once
    // frames are missed (the GPU, or the compositor)
    let gpu = gpuLast;
    if (!tq) { const iv = (dtReal || 0) * 1000; gpu = iv > 18 && iv < 100 ? Math.max(0, iv - cpu) : 0; }
    // the frame's cost: the sim counted up to its floor (it takes what is left: stepBudgetMs below)
    const cost = Math.max(cpu - simMs + Math.min(simMs, SIM_MIN), gpu);
    const render = Math.max(cpu - simMs, gpu);
    Q.frameMs = Math.max(cpu, gpu); Q.renderMs = render; Q.gpuMs = gpu; Q.simMs = simMs;
    const dt = Math.min(.1, Math.max(0, dtReal || 0));
    // the sim's budget: what drawing leaves of the target (at least its floor, at most its own default)
    game.stepBudgetMs = Math.max(SIM_MIN, Math.min(SIM_MAX, TARGET - .5 - (Sr || render)));
    t += dt;
    if (!dt) return;
    const k = 1 - Math.exp(-dt / TAU);
    S += (Math.min(cost, TARGET * 3) - S) * k;
    Sr += (Math.min(render, TARGET * 3) - Sr) * k;
    Sg += (Math.min(gpu, TARGET * 3) - Sg) * k;
    if (t < WARMUP) return;
    // pinned (tests: game.quality.pin = n): that level, nothing judged
    if (Q.pin !== null && Q.pin !== undefined) { if (Q.level !== Q.pin) setLevel(Q.pin, 'pin'); return; }
    // down: over the target for a second; right after a step down that bought nothing (the load is not what that
    // knob scales: a GPU filling pixels does not care about the smoke), the next one without waiting the second
    if (t - since < (Q.level > from0 ? SETTLE_DOWN : SETTLE)) return;
    if (S > TARGET) {
      over += dt; under = 0;
      const useless = Q.level > from0 && t - since < SETTLE_DOWN + .3 && S > .93 * sDown;
      // (a dots / render-scale step only while the GPU carries at least half the frame: pixels are its load)
      const gpuStep = LADDER[Q.level + 1] && LADDER[Q.level + 1].fx === LADDER[Q.level].fx;
      if ((over >= DOWN_AFTER || useless) && Q.level < LADDER.length - 1 && (!gpuStep || Sg > .5 * S)) { from0 = Q.level; sDown = S; setLevel(Q.level + 1, 'over'); }
      return;
    }
    over = 0;
    // up: under this level's bar for its wait; a bounce (down again soon after an up) makes both stricter
    if (Q.level > 0 && S < bar[Q.level]) {
      under += dt;
      if (under >= wait[Q.level]) { lastUp = t; upFrom = from0 = Q.level; setLevel(Q.level - 1, 'headroom'); }
    } else under = Math.max(0, under - dt * .5);
  }

  /* ---------- the frame, wrapped (after the other systems that wrap it: the debrief's host) ---------- */
  let f0 = null;
  function wrapped(dtReal) {
    const on = Q.on && !Q.hold;
    if (!on) {
      if (Q.level || applied !== LADDER[0]) { Q.level = 0; Q.label = Q.on && !Q.hold ? 'AUTO' : ''; apply(LADDER[0]); }
      if (game.stepBudgetMs !== SIM_MAX) game.stepBudgetMs = SIM_MAX;
      simAcc = 0;
      return f0.call(this, dtReal);
    }
    const a = now();
    gpuBegin();
    let r;
    try { r = f0.call(this, dtReal); } finally { gpuEnd(); }
    observe(now() - a, dtReal);
    return r;
  }

  function setOn(on) {
    Q.on = !!on;
    if (!Q.on) { Q.level = 0; Q.label = ''; apply(LADDER[0]); game.stepBudgetMs = SIM_MAX; }
    else { Q.label = labelOf(LADDER[Q.level]); since = t; over = under = 0; }
  }
  const offSettings = onSettings((s, key) => {
    if (!key || key === 'autoQuality') setOn(s.autoQuality !== false);
    // the player changed a knob the guard scales: its new value, scaled by the level in force
    if (!key || key === 'renderScale' || key === 'dotDensity' || key === 'effects') apply(LADDER[Q.level]);
  });

  const sys = {
    name: 'perfguard', priority: 0,
    init() {
      f0 = game.frame;
      game.frame = wrapped;
      setOn(getSettings().autoQuality !== false);
      apply(LADDER[0]);
    },
    update() {
      // the knobs follow the level (a settings change, the fx system resetting its own level, a new renderer size)
      const L = LADDER[Q.level];
      if (!Q.hold && Q.on) apply(L);
    },
    /* for tests: force a level (the perf suite, the console); start over from full quality with a clean history */
    set: n => setLevel(n, 'manual'),
    reset() { S = Sr = Sg = 0; over = under = 0; from0 = 0; sDown = 0; upFrom = -1; lastUp = -1e9; since = t; wait.fill(UP_WAIT); bar.fill(UP_AT); Q.log.length = 0; Q.steps = 0; if (Q.level) setLevel(0, 'reset'); Q.log.length = 0; },
    dispose() {
      offSettings();
      if (game.frame === wrapped) game.frame = f0;
      if (sim.step === stepT) sim.step = step0;
      apply(LADDER[0]); game.stepBudgetMs = SIM_MAX;
      for (const q of pend.concat(pool)) gl.deleteQuery(q);
    },
  };
  return sys;
}
export default createPerfGuard;
