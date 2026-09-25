/* ONIKS game layer: the running match. Ties the sim, the renderer and every UI / FX / audio system together.

   const game = createGame({ sim, map, renderer, side, settings, mode, params, mission })
   game.addSystem(sys)          // any number; see README.md for the system contract
   game.attachInput(canvas)     // keyboard + pointer routing by priority
   game.frame(dtReal)           // one frame: sim steps for the time rate, updates, 3D, overlay

   Rules: the sim is stepped only here (fixed DT, as many steps as the rate needs, capped per frame). Systems read
   `game.*` every frame (never cache game.side: sandbox can switch it). Render poses come from game.unitPose(). */
import { DT } from '../sim/consts.js';
import { ENEMY, CLASSIFY, UNITS, PROJ } from '../data/units.js';

export const RATES = [1, 2, 4, 8, 16, 32];
/* suggested priorities (input goes high -> low; draw goes low -> high, so high draws on top) */
export const PRI = { menu: 120, inspect: 100, targeting: 80, hud: 70, sandbox: 60, orders: 50, selection: 40, time: 30,
  director: 20, sensors: 15, render: 10, fx: 5, audio: 1 };

const TAU = Math.PI * 2;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ------------------------------------------------------------------ bus */
export function createBus() {
  const H = new Map();
  return {
    on(name, fn) { let s = H.get(name); if (!s) H.set(name, s = new Set()); s.add(fn); return () => s.delete(fn); },
    off(name, fn) { const s = H.get(name); if (s) s.delete(fn); },
    emit(name, data) {
      const s = H.get(name); if (!s) return;
      for (const fn of s) { try { fn(data); } catch (e) { console.error('bus ' + name, e); } }
    },
  };
}

/* ------------------------------------------------------------------ game */
export function createGame(o) {
  const sim = o.sim, R = o.renderer, T = R.terrain, cam = R.camera;
  const settings = o.settings || {};
  const bus = createBus();
  const systems = [];          // sorted by priority, high first
  const drawOrder = [];        // sorted by priority, low first
  const poses = new Map();     // unit id -> pose (reused)
  const pposes = new Map();    // projectile id -> pose (reused)

  const game = {
    sim, map: o.map, renderer: R, R, camera: cam, overlay: R.overlay,
    side: o.side || 'coast',
    get enemy() { return ENEMY[game.side]; },
    settings, mode: o.mode || 'sandbox', params: o.params || {}, mission: o.mission || null,
    selection: new Set(), hover: null, groups: {},
    timeRate: RATES.includes(+settings.timeRate) ? +settings.timeRate : 4, paused: false,
    maxStepsPerFrame: 48, stepBudgetMs: 9,
    autoSlow: readAutoSlow(),
    alpha: 0,                  // render interpolation between the last two sim ticks
    t: sim.t,                  // interpolated sim time (what is drawn)
    seaT: 0,                   // clock of the swell (runs at min(rate, 2) so x32 does not boil the sea)
    realT: 0, frameN: 0, dtReal: 0, dtSim: 0, stepsLast: 0, stepMs: 0,
    ui: { hidden: false },
    cinematic: false,
    mouse: { x: 0, y: 0, in: false, down: -1, world: null },
    drawn: new Map(),          // unit id -> the instance the render system queued this frame (screenBox)
    systems, bus,
    DT, ENEMY, CLASSIFY, UNITS, PROJ,
    sink: null,
    frameInfo: null,
    result: null,
    /* the drawn ground (land relief; 0 over water) */
    ground: (x, z) => Math.max(0, T.heightAt(x, z)),
  };

  /* ---------- systems ---------- */
  game.addSystem = sys => {
    if (!sys) return null;
    if (Array.isArray(sys)) { sys.forEach(game.addSystem); return sys; }
    if (sys.priority === undefined) sys.priority = 0;
    systems.push(sys); systems.sort((a, b) => b.priority - a.priority);
    drawOrder.push(sys); drawOrder.sort((a, b) => a.priority - b.priority);
    if (sys.init) { try { sys.init(game); } catch (e) { console.error(`system ${sys.name} init`, e); } }
    bus.emit('system', sys);
    return sys;
  };
  game.removeSystem = sys => {
    const i = systems.indexOf(sys); if (i >= 0) systems.splice(i, 1);
    const j = drawOrder.indexOf(sys); if (j >= 0) drawOrder.splice(j, 1);
    if (sys && sys.dispose) try { sys.dispose(); } catch (e) { console.error(e); }
  };
  game.getSystem = name => systems.find(s => s.name === name) || null;

  /* ---------- units ---------- */
  game.unit = id => sim.units.get(id) || null;
  game.isOwn = u => !!u && u.side === game.side;
  /* what the player may see of a unit: 'own' | 'track' | 'contact' | null */
  game.vis = u => sim.visible(game.side, u);
  game.commandable = u => !!u && u.alive && u.side === game.side;
  /* selected units that are alive and commandable (own side) */
  game.selected = () => { const out = []; for (const id of game.selection) { const u = sim.units.get(id); if (game.commandable(u)) out.push(u); } return out; };
  game.select = (ids, opt) => {
    opt = opt || {};
    if (!opt.add && !opt.toggle) game.selection.clear();
    for (const id of ids) {
      if (opt.toggle && game.selection.has(id)) game.selection.delete(id); else game.selection.add(id);
    }
    // never mix own units and one enemy: an enemy is selectable alone (for its readout)
    const own = [...game.selection].filter(id => { const u = sim.units.get(id); return u && u.side === game.side; });
    if (own.length && own.length !== game.selection.size) { game.selection.clear(); own.forEach(id => game.selection.add(id)); }
    bus.emit('select', game.selection);
  };
  game.clearSelection = () => { if (!game.selection.size) return; game.selection.clear(); bus.emit('select', game.selection); };

  /* issue an order through the sim and tell everyone (orders feedback, audio, objectives) */
  game.order = (ids, order) => {
    ids = (Array.isArray(ids) ? ids : [ids]).filter(id => game.commandable(sim.units.get(id)));
    if (!ids.length) return false;
    sim.order(ids, order);
    bus.emit('order', { ids, order });
    return true;
  };

  /* interpolated render pose of a unit (cached per frame; the same pose every system draws against).
     -> { pos: [x, y, z], hdg, pitch, roll, speed, vis } ; land units on the drawn ground, ships on the swell */
  game.unitPose = (u, alpha) => {
    const cache = alpha === undefined;
    let p = poses.get(u.id);
    if (!p) { p = { pos: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, f: -1, speed: 0 }; poses.set(u.id, p); }
    if (cache && p.f === game.frameN) return p;
    const a = cache ? game.alpha : alpha;
    const d = u.def, P = u.pos, Q = u.prev;
    const x = Q[0] + (P[0] - Q[0]) * a, z = Q[2] + (P[2] - Q[2]) * a;
    let y = Q[1] + (P[1] - Q[1]) * a;
    const hdg = u.prevHdg + wrapPi(u.hdg - u.prevHdg) * a;
    let pitch = u.pitch, roll = u.roll;
    if (d.domain === 'land') {
      // the drawn ground carries metre-scale relief the sim's map.h does not: settle on it, four feet
      const s = Math.sin(hdg), c = Math.cos(hdg), L = Math.max(2, d.size[0] * .4), W = Math.max(1, d.size[1] * .5);
      const hf = T.heightAt(x + s * L, z + c * L), hb = T.heightAt(x - s * L, z - c * L);
      const hr = T.heightAt(x + c * W, z - s * W), hl = T.heightAt(x - c * W, z + s * W);
      y = Math.max(0, (hf + hb + hr + hl) * .25);
      pitch = Math.atan2(hf - hb, 2 * L); roll = Math.atan2(hl - hr, 2 * W);
    } else if (d.domain === 'sea') {
      // heave, pitch and roll on the drawn swell (big hulls ride it less); the sim adds the heel and the sinking
      const s = Math.sin(hdg), c = Math.cos(hdg), L = d.size[0], B = d.size[1], t = game.seaT;
      const sb = T.seaAt(x + s * L * .35, z + c * L * .35, t).y, ss = T.seaAt(x - s * L * .35, z - c * L * .35, t).y;
      const sp = T.seaAt(x - c * B * .5, z + s * B * .5, t).y, sst = T.seaAt(x + c * B * .5, z - s * B * .5, t).y;
      const k = Math.min(1, 60 / L);
      const heave = (sb + ss + sp + sst) * .25 * k;
      if (u.alive) { y = heave; pitch = Math.atan2(sb - ss, L * .7) * k; roll = Math.atan2(sp - sst, B) * k * 1.5 + (u.roll || 0) * .6; }
      else { y = heave * (1 - u.dying) + y; pitch = Math.atan2(sb - ss, L * .7) * k * (1 - u.dying) + u.pitch; roll = u.roll; }
    }
    p.pos[0] = x; p.pos[1] = y; p.pos[2] = z; p.hdg = hdg; p.pitch = pitch; p.roll = roll; p.speed = u.speed;
    if (cache) p.f = game.frameN;
    return p;
  };
  /* interpolated pose of a projectile, oriented along its motion: { pos, hdg, pitch } */
  game.projPose = (pr, alpha) => {
    let p = pposes.get(pr.id);
    if (!p) { p = { pos: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, f: -1 }; pposes.set(pr.id, p); }
    if (alpha === undefined && p.f === game.frameN) return p;
    const a = alpha === undefined ? game.alpha : alpha, P = pr.pos, Q = pr.prev;
    p.pos[0] = Q[0] + (P[0] - Q[0]) * a; p.pos[1] = Q[1] + (P[1] - Q[1]) * a; p.pos[2] = Q[2] + (P[2] - Q[2]) * a;
    const v = pr.vel;
    let vx = v ? v[0] : P[0] - Q[0], vy = v ? v[1] : P[1] - Q[1], vz = v ? v[2] : P[2] - Q[2];
    const h = Math.hypot(vx, vz);
    if (h + Math.abs(vy) > 1e-6) { p.hdg = Math.atan2(vx, vz); p.pitch = Math.atan2(vy, h); }
    else { p.hdg = pr.hdg || 0; p.pitch = pr.pitch || 0; }
    if (alpha === undefined) p.f = game.frameN;
    return p;
  };

  /* ---------- time ---------- */
  let acc = 0, lastManual = -1e9;
  game.setRate = (r, why) => {
    r = RATES.includes(r) ? r : game.timeRate;
    if (!why) lastManual = game.realT;
    if (r === game.timeRate && !game.paused) return;
    game.timeRate = r; game.paused = false;
    bus.emit('rate', { rate: r, paused: false, why: why || 'user' });
  };
  game.stepRate = dir => {
    const i = RATES.indexOf(game.timeRate);
    game.setRate(RATES[clamp((i < 0 ? 2 : i) + dir, 0, RATES.length - 1)]);
  };
  game.pause = on => {
    on = on === undefined ? !game.paused : !!on;
    if (on === game.paused) return;
    game.paused = on;
    bus.emit('rate', { rate: game.timeRate, paused: on, why: 'user' });
  };
  game.setAutoSlow = on => { game.autoSlow = !!on; try { localStorage.setItem('oniks.autoSlow', on ? '1' : '0'); } catch (e) { /* */ } bus.emit('autoslow_setting', game.autoSlow); };
  /* drop to x1 for something worth watching (a launch, a new hostile contact; the orders system: a track that has
     come within reach of the player's weapons, why 'engage') */
  game.slowFor = (why, e) => autoSlow(why, e);
  function autoSlow(why, e) {
    if (!game.autoSlow || game.paused || game.timeRate <= 1 || sim.result) return;
    if (game.realT - lastManual < 8) return;          // the player just chose this rate
    game.timeRate = 1;
    bus.emit('rate', { rate: 1, paused: false, why: 'auto' });
    bus.emit('autoslow', { why, event: e });
  }

  /* fixed sim steps for the time rate; returns sim seconds advanced */
  function stepSim(dtReal) {
    game.stepsLast = 0;
    if (game.paused) { game.dtSim = 0; return 0; }
    acc += dtReal * game.timeRate;
    const t0 = performance.now();
    let n = 0;
    while (acc >= DT && n < game.maxStepsPerFrame) {
      sim.step(); acc -= DT; n++;
      if (sim.events.length > 256) dispatchEvents();
      if (performance.now() - t0 > game.stepBudgetMs) break;
    }
    if (acc > DT * 4) acc = DT * 4;                     // behind: drop time rather than spiral (the rate readout stays honest)
    game.stepsLast = n;
    if (n) game.stepMs = game.stepMs * .9 + (performance.now() - t0) / n * .1;
    dispatchEvents();
    game.dtSim = n * DT;
    return game.dtSim;
  }
  function dispatchEvents() {
    const ev = sim.drainEvents();
    if (!ev.length) return;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      // time: auto x1
      if (e.type === 'launch') {
        const P = PROJ[e.kind];
        if (P && P.threat && (e.side === game.side || !sim.fog || sim.visible(game.side, sim.units.get(e.from) || { side: e.side }) === 'track')) autoSlow('launch', e);
      } else if (e.type === 'detect' && e.side === game.side && sim.fog && sim.t > 10 && e.unit !== undefined && sim.units.has(e.unit)) autoSlow('contact', e);
      for (let k = 0; k < systems.length; k++) {
        const s = systems[k];
        if (s.onEvent) { try { s.onEvent(e); } catch (err) { console.error(`system ${s.name} onEvent`, err); } }
      }
      bus.emit('event', e);
    }
  }
  game.dispatchEvents = dispatchEvents;

  /* ---------- the FX sink (the FX agent's interface over R.fx / R.light) ---------- */
  const view = { eye: cam.eye, f: cam.f, r: cam.r, u: cam.u, fl: 1000, tanX: 1, tanY: .36, near: .3, W: 1920, H: 1080, dist: 1000 };
  const P3 = [0, 0, 0], C3 = [0, 0, 0];
  const sink = game.sink = {
    cam: view, R, fx: R.fx,
    /* film dot: max blend, depth tested. size > 0 px at 1080p, < 0 metres; colours 0..255, a 0..1 */
    dot(x, y, z, s, r, g, b, a) { R.fx.dotXYZ(x, y, z, s, r, g, b, a, 'max'); },
    /* additive dot (fire, sparks) */
    add(x, y, z, s, r, g, b, a) { R.fx.dotXYZ(x, y, z, s, r, g, b, a, 'add'); },
    /* alpha-over dot (lime that must read over bright dots); top: never hidden */
    over(x, y, z, s, r, g, b, a) { R.fx.dotXYZ(x, y, z, s, r, g, b, a, 'over'); },
    top(x, y, z, s, r, g, b, a) { R.fx.dotXYZ(x, y, z, s, r, g, b, a, 'top'); },
    /* soft additive disc; size > 0 px radius at 1080p, < 0 metres */
    glow(x, y, z, s, r, g, b, a) { P3[0] = x; P3[1] = y; P3[2] = z; C3[0] = r; C3[1] = g; C3[2] = b; R.fx.glow(P3, s, C3, a); },
    /* dynamic light: nearby dots brighten (max 16 per frame, weakest dropped). intensity 1 = a strong flash */
    light(x, y, z, r, g, b, intensity, radiusM) { R.light([x, y, z], radiusM, [r, g, b], intensity); },
    /* full-frame additive lift (lightning), v 0..1 */
    lift(v, r, g, b) { R.fx.lift(v, r === undefined ? undefined : [r, g, b]); },
  };
  function syncView() {
    view.eye = cam.eye; view.f = cam.f; view.r = cam.r; view.u = cam.u;
    view.tanY = Math.tan(cam.fov / 2); view.tanX = view.tanY * cam.W / Math.max(1, cam.H);
    view.fl = 540 / view.tanY; view.near = cam.near; view.W = cam.W; view.H = cam.H; view.dist = cam.dist;
  }

  /* ---------- the frame ---------- */
  const frame = game.frameInfo = { game, R, cam, fx: R.fx, sink, t: 0, alpha: 0, dt: 0, dtSim: 0, realT: 0, seaT: 0 };
  /* game.profile = true: CPU ms per system and phase, smoothed, in game.prof (console: ONIKS.game.prof) */
  game.profile = false; game.prof = {};
  const now = () => performance.now();
  function prof(k, ms) { const p = game.prof; p[k] = p[k] === undefined ? ms : p[k] * .9 + ms * .1; }
  function call(s, fn, where, a, b) {
    if (!game.profile) { try { fn.call(s, a, b); } catch (e) { report(s, where, e); } return; }
    const t0 = now();
    try { fn.call(s, a, b); } catch (e) { report(s, where, e); }
    prof(s.name + '.' + where, now() - t0);
  }
  game.frame = dtReal => {
    dtReal = Math.min(.1, Math.max(0, dtReal));
    game.frameN++; game.realT += dtReal; game.dtReal = dtReal;
    let t0 = game.profile ? now() : 0;
    const dtSim = stepSim(dtReal);
    if (game.profile) prof('sim', now() - t0);
    game.alpha = game.paused ? game.alpha : clamp(acc / DT, 0, 1);
    game.t = sim.t - DT * (1 - game.alpha);
    if (!game.paused) game.seaT += dtReal * Math.min(game.timeRate, 2);
    for (let k = 0; k < systems.length; k++) { const s = systems[k]; if (s.update) call(s, s.update, 'update', dtReal, dtSim); }
    R.frame(dtReal, game.seaT);
    syncView();
    game.drawn.clear();
    frame.t = game.t; frame.alpha = game.alpha; frame.dt = dtReal; frame.dtSim = dtSim; frame.realT = game.realT; frame.seaT = game.seaT;
    for (let k = 0; k < drawOrder.length; k++) { const s = drawOrder[k]; if (s.draw3d) call(s, s.draw3d, 'draw3d', frame); }
    if (game.profile) t0 = now();
    R.end();
    if (game.profile) prof('R.end', now() - t0);
    const ov = R.overlay;
    if (ov) {
      for (let k = 0; k < drawOrder.length; k++) {
        const s = drawOrder[k];
        if (s.draw2d && (!game.ui.hidden || s.always2d)) call(s, s.draw2d, 'draw2d', ov, frame);
      }
    }
    bus.emit('frame', frame);
  };
  const reported = new Set();
  function report(s, where, e) {
    const k = s.name + where;
    if (reported.has(k)) return;
    reported.add(k);
    console.error(`system ${s.name} ${where}`, e);
  }

  game.setUiHidden = on => { game.ui.hidden = on === undefined ? !game.ui.hidden : !!on; document.body.classList.toggle('ui-off', game.ui.hidden); bus.emit('ui', game.ui); };
  game.setSide = side => { if (side === game.side) return; game.side = side; game.selection.clear(); bus.emit('select', game.selection); bus.emit('side', side); };

  /* ---------- input: keys and pointer, routed by priority until handled ---------- */
  game.attachInput = el => {
    const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    const key = e => {
      if (typing(e)) return;
      for (let k = 0; k < systems.length; k++) {
        const s = systems[k];
        if (!s.onKey) continue;
        let h = false;
        try { h = s.onKey(e); } catch (err) { console.error(`system ${s.name} onKey`, err); }
        if (h) { if (e.cancelable) e.preventDefault(); return; }
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    const pos = e => { const b = el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const M = game.mouse;
    let down = null;
    const route = ev => {
      for (let k = 0; k < systems.length; k++) {
        const s = systems[k];
        if (!s.onPointer) continue;
        let h = false;
        try { h = s.onPointer(ev); } catch (err) { console.error(`system ${s.name} onPointer`, err); }
        if (h) return true;
      }
      return false;
    };
    const mk = (type, e, x, y) => ({ type, x, y, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey,
      dx: down ? x - down.x : 0, dy: down ? y - down.y : 0, drag: down ? down.drag : 0, sx: down ? down.x : x, sy: down ? down.y : y, raw: e,
      get world() { return cam.pickGround(x, y); } });
    el.addEventListener('mousedown', e => {
      const [x, y] = pos(e);
      down = { x, y, button: e.button, drag: 0, t: performance.now() };
      M.down = e.button;
      route(mk('down', e, x, y));
    });
    window.addEventListener('mousemove', e => {
      const [x, y] = pos(e);
      M.x = x; M.y = y; M.in = x >= 0 && y >= 0 && x < cam.W && y < cam.H && e.target === el;
      if (down) down.drag = Math.max(down.drag, Math.abs(x - down.x) + Math.abs(y - down.y));
      route(mk('move', e, x, y));
    });
    window.addEventListener('mouseup', e => {
      if (!down) return;
      const [x, y] = pos(e);
      const ev = mk('up', e, x, y);
      const click = down.drag < 5 && e.button === down.button;
      route(ev);
      if (click) route(mk('click', e, x, y));
      down = null; M.down = -1;
    });
    el.addEventListener('dblclick', e => { const [x, y] = pos(e); route(mk('dblclick', e, x, y)); });
    el.addEventListener('wheel', e => { const [x, y] = pos(e); const ev = mk('wheel', e, x, y); ev.deltaY = e.deltaY; if (route(ev)) { e.stopImmediatePropagation(); e.preventDefault(); } }, { capture: true, passive: false });
  };

  return game;
}

function readAutoSlow() { try { return localStorage.getItem('oniks.autoSlow') !== '0'; } catch (e) { return true; } }
