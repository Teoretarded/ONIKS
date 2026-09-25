/* Loading: the screen between Start (the shell's launch veil) and the first frame of the match, in the films' Point
   Cloud language. The ONIKS mark where the HUD will put it, one mono line with the real step (MAP · DOLGAYA GUBA,
   TERRAIN · 140 × 140 KM, FORCES · 14 UNITS, SYSTEMS 6/13, MODELS 14/29) and a dotted progress line under it; then
   the screen fades out over the opening shot (a short eased push-in), never a hard pop.

   const L = createLoading(document.getElementById('boot'))
   L.step('Map', 'Dolgaya Guba')            a new step: the line reads MAP · DOLGAYA GUBA; the dots creep within the
                                            step's share of the bar while it runs (a worker, a fetch)
   L.count('Models', i, n)                  a counted step: MODELS 14/29, the bar at i / n of the step's share
   await L.paint()                          let the page draw the line (a frame, or 50 ms in a hidden tab)
   await L.warm(game, list)                 pre-sample model point clouds (R.models.cloud) with MODELS i/n, yielding
                                            to paint every ~100 ms
   L.idle(game, list)                       the same, later, in the browser's idle time, one part at a time, only
                                            when the part fits the idle slice (never a hitch)
   L.note('14 units')                       the step's detail once it is known
   await L.fill()                           the bar runs full
   await L.reveal(game, { glide })          (fill), fade out (and the camera's push-in to the opening shot)
   warmLists(game) -> { load, idle }        what to pre-sample for this match (unit, round and site models now; the
                                            Inspect cutaways and the sites' finest level in idle time)
   L.fail(message)                          a coral line: the load stopped
   The step weights (share of the bar) are in STEPS; unknown step names take a small share.
   Timings go to the console once: ONIKS: load map 2195 ms · terrain 180 ms · ... */

const MARK = '<svg viewBox="0 0 24 24"><path d="M12 2 20.5 22h-4.1L12 11.4 7.6 22H3.5z" fill="#fff"/><circle cx="12" cy="18.2" r="1.7" fill="#C6F432"/></svg>';
/* the bar's shares: where each step starts (the next one's start is where it ends) */
const STEPS = { code: 0, map: .06, terrain: .36, forces: .44, systems: .48, models: .66, ready: 1 };
const DOTS = 56;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* a frame (so the DOM change shows), or a short timeout when the tab is hidden and frames do not come */
export function nextPaint(ms) {
  return new Promise(res => {
    let done = false;
    const go = () => { if (!done) { done = true; setTimeout(res, 0); } };
    requestAnimationFrame(go);
    setTimeout(go, ms || 50);
  });
}

export function createLoading(el) {
  if (el.__load) return el.__load;           // play.html starts it before main.js has loaded; main.js picks it up
  el.classList.add('oniks-load');
  // play.html carries the same markup from the first paint; build it when it is not there
  if (!el.querySelector('.ld-bar')) el.innerHTML = `<div class="ld-mark">${MARK}<span>ONIKS</span></div><div class="ld-mid"><div class="ld-line"><i></i><span class="ld-t"></span></div><div class="ld-bar"></div></div>`;
  const bar = el.querySelector('.ld-bar');
  if (bar.children.length !== DOTS) bar.innerHTML = '<i></i>'.repeat(DOTS);
  const tEl = el.querySelector('.ld-t'), dots = [...bar.children];
  fit(el);
  const onResize = () => fit(el);
  addEventListener('resize', onResize);

  const t00 = 0;                      // from the navigation: the page and its code are part of the wait
  const times = [];                   // [name, ms]
  let cur = 'code', a = 0, b = STEPS.map, t0 = 0, frac = null, shown = 0, lit = -1, raf = 0, dead = false, text = tEl.textContent;

  function setText(s) { if (s !== text) { text = s; tEl.textContent = s; } }
  function range(name) {
    const k = name.toLowerCase(), keys = Object.keys(STEPS);
    const i = keys.indexOf(k);
    if (i < 0) return [shown, Math.min(1, shown + .04)];
    return [STEPS[k], STEPS[keys[Math.min(keys.length - 1, i + 1)]]];
  }
  function close() { if (cur) times.push([cur, Math.round(performance.now() - t0)]); }
  /* the bar: known fraction, or an asymptotic creep inside the step's share while it waits (never backwards) */
  function target() {
    if (frac !== null) return a + (b - a) * sat(frac);
    const t = (performance.now() - t0) / 1000;
    return a + (b - a) * .92 * (1 - Math.exp(-t / 1.6));
  }
  function draw() {
    const g = Math.max(shown, target());
    shown += (g - shown) * .35;
    if (g - shown < .002) shown = g;
    const n = Math.round(shown * DOTS);
    if (n !== lit) {
      lit = n;
      for (let i = 0; i < DOTS; i++) dots[i].className = i < n - 1 ? 'f' : i === n - 1 ? 'h' : '';
    }
  }
  function tick() { if (dead) return; draw(); raf = requestAnimationFrame(tick); }
  raf = requestAnimationFrame(tick);

  const L = {
    el,
    step(name, detail) {
      const s = name.toUpperCase() + (detail ? ' · ' + String(detail).toUpperCase() : '');
      if (name.toLowerCase() === cur) { setText(s); return; }
      close();
      cur = name.toLowerCase(); t0 = performance.now(); frac = null;
      [a, b] = range(name);
      if (a < shown) a = shown;
      setText(s);
      draw();
    },
    count(name, i, n) {
      const k = name.toLowerCase();
      if (k !== cur) { close(); cur = k; t0 = performance.now(); [a, b] = range(name); if (a < shown) a = shown; }
      frac = n ? i / n : 1;
      setText(`${name.toUpperCase()} ${i}/${n}`);
      draw();
    },
    /* the step's detail, once known (FORCES · 14 UNITS) */
    note(detail) {
      const base = text.split(' · ')[0];
      setText(base + (detail ? ' · ' + String(detail).toUpperCase() : ''));
    },
    paint: nextPaint,
    fail(msg) {
      el.classList.add('ld-fail');
      let m = String(msg || 'error').split(/\r?\n/)[0].replace(/\s+/g, ' ').trim();
      if (m.length > 64) m = m.slice(0, 63) + '…';
      setText('STOPPED · ' + m.toUpperCase());
      console.warn('ONIKS: load stopped at ' + cur + ' (the console has the error)');
    },

    /* pre-sample model clouds. list: [{ key, lods: [3, 2, 1, 0], st?: model state for the dyn parts }]
       (lods coarse to fine; dyn parts get one state per level so the renderer never has to sample one over its
       budget). The line counts models. */
    async warm(game, list, label) {
      const M = game.R.models, name = label || 'Models';
      const jobs = list.filter(j => M.has(j.key));
      let last = performance.now();
      L.count(name, 0, jobs.length);
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        let e = null;
        try { e = M.get(j.key); } catch (err) { console.warn('loading: model ' + j.key, err); }
        // (the model library's per-part cache is engine/models.js internals: without it, its public warm())
        if (e && (typeof M.cloud !== 'function' || !e.parts)) { try { M.warm(j.key, (j.lods || [3, 2, 1, 0]).filter(l => l < e.lods.length)); } catch (err) { /* */ } e = null; }
        if (e) {
          for (const l of j.lods || [3, 2, 1, 0]) {
            if (l >= e.lods.length) continue;
            for (const P of e.parts) {
              if (P.dyn ? (!j.st || P.lru[l].size) : P.clouds[l]) continue;
              try { M.cloud(e, P, l, P.dyn ? j.st : {}, true); } catch (err) { /* a moving part that wants more state: the renderer samples it later */ }
              if (performance.now() - last > 100) { L.count(name, i, jobs.length); await nextPaint(30); last = performance.now(); }
            }
          }
        }
        L.count(name, i + 1, jobs.length);
      }
      await nextPaint();
    },

    /* the same in idle time: a part only when the idle slice has room for it (estimated from its coarser level),
       so play never hitches; stops at the end of the list. Returns { stop(), done: Promise } */
    idle(game, list) {
      const M = game.R.models;
      if (typeof M.cloud !== 'function') return { stop() {}, done: Promise.resolve(), left: 0 };
      const items = [];
      for (const j of list) if (M.has(j.key)) for (const l of j.lods || [1, 0]) items.push({ key: j.key, l, st: j.st || null });
      let stopped = false, resolve;
      const done = new Promise(r => { resolve = r; });
      const ric = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: false }), 200));
      const t0 = performance.now();
      let n = 0, ms = 0, k = .00025;          // ms per unit of (part surface / spacing^2), learnt as parts are sampled
      const size = P => { const b = P.bounds, x = b[1][0] - b[0][0], y = b[1][1] - b[0][1], z = b[1][2] - b[0][2]; return 2 * (x * y + y * z + z * x); };
      const est = (e, P, l) => size(P) / (e.lods[l] * e.lods[l]) * k;
      const bad = new Set();                 // parts that would not sample (a moving part that wants more state)
      const pending = (e, P, it) => !bad.has(P) && (P.dyn ? !!it.st && !P.lru[it.l].size : !P.clouds[it.l]);
      function work(dl) {
        if (stopped) return;
        // a part only when it fits what is left of the idle slice (anything while the game is paused or hidden)
        const free = () => Math.max(dl.timeRemaining() - 1.5, game.paused || document.hidden ? 45 : 0);
        for (let qi = 0; qi < items.length && free() > .5;) {
          const it = items[qi];
          let e = null; try { e = M.get(it.key); } catch (err) { /* */ }
          if (!e || it.l >= e.lods.length) { items.splice(qi, 1); continue; }
          let left = 0;
          for (const P of e.parts) {
            if (!pending(e, P, it)) continue;
            const x = est(e, P, it.l);
            if (x > free()) { left++; continue; }
            const a = performance.now();
            try { M.cloud(e, P, it.l, P.dyn ? it.st : {}, true); } catch (err) { bad.add(P); }
            const dt = performance.now() - a;
            if (dt > 1 && !P.dyn) k = k * .7 + dt / (x / k) * .3;
            n++; ms += dt;
          }
          if (!left) items.splice(qi, 1); else qi++;
        }
        if (!items.length) { stopped = true; console.log(`ONIKS: idle warm ${n} parts, ${Math.round(ms)} ms over ${Math.round((performance.now() - t0) / 1000)} s`); resolve(); return; }
        ric(work, { timeout: 1500 });
      }
      ric(work, { timeout: 1500 });
      return { stop() { stopped = true; resolve(); }, done, get left() { return items.length; } };
    },

    /* the bar fills, the screen fades over the opening shot; o.glide: push the camera in from a little further out */
    async fill() {
      if (cur === 'ready') return;
      close(); cur = 'ready';
      a = b = 1; frac = 1;
      el.classList.add('ld-done');
      for (let i = 0; i < 12 && shown < .995; i++) await nextPaint(40);
      shown = 1; draw();
    },
    async reveal(game, o) {
      o = o || {};
      await L.fill();
      const total = Math.round(performance.now() - t00);
      console.log('ONIKS: load ' + times.map(([k, ms]) => `${k} ${ms} ms`).join(' · ') + ` · total ${total} ms`);
      L.times = times; L.total = total;
      if (o.glide && game) glide(game);
      el.classList.add('off');
      // the transition cannot finish in a hidden tab: take the screen down by the clock as well
      await new Promise(r => setTimeout(r, 950));
      dead = true; cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      el.style.display = 'none';
    },
  };
  el.__load = L;
  return L;
}

/* the opening push-in: from a little further out and higher to the opening shot the camera holds now */
function glide(game) {
  const cam = game.camera, g = cam.goal;
  const to = { target: g.target.slice(), dist: g.dist, yaw: g.yaw, pitch: g.pitch };
  cam.set({ dist: to.dist * 1.45, pitch: Math.min(cam.maxPitch, to.pitch + .07), yaw: to.yaw - .1 });
  cam.flyTo(to.target, { dist: to.dist, yaw: to.yaw, pitch: to.pitch, time: 2.6 });
}

/* the mark sits where the HUD puts its own (56, 48 at 1080p, the HUD's scale) */
function fit(el) {
  const s = Math.max(.8, Math.min(1.6, Math.min(innerWidth / 1920, innerHeight / 1080)));
  el.style.setProperty('--ls', s);
  el.style.setProperty('--ld', Math.max(2, Math.round(3 * s)) + 'px');     // the bar's dots on whole pixels
}
/* what to pre-sample for this match. Load: every unit model at every level (their moving parts at the state of a
   unit of that type in the match, when there is one), the rounds (and boosters) the units can fire, the objective
   sites' structures down to their second-finest level. Idle: the Inspect cutaways of the units and rounds in play,
   the sites' finest level. */
export function warmLists(game) {
  const { sim, UNITS, PROJ } = game, M = game.R.models;
  const load = [], idle = [], seen = new Set();
  const add = (arr, key, lods, st) => { if (!key || !M.has(key) || seen.has(arr === load ? 'L' + key : 'I' + key)) return; seen.add(arr === load ? 'L' + key : 'I' + key); arr.push({ key, lods, st: st || null }); };
  const live = new Map();
  for (const u of sim.list()) if (u.alive && !live.has(u.type)) live.set(u.type, u);
  // unit models: the ones in play first
  const types = Object.keys(UNITS).sort((x, y) => (live.has(y) ? 1 : 0) - (live.has(x) ? 1 : 0));
  for (const t of types) {
    const d = UNITS[t], u = live.get(t);
    let st = null;
    if (u && d.modelState) { try { st = Object.assign({}, d.modelState(u, sim.t)); } catch (e) { st = null; } }
    add(load, d.model, [3, 2, 1, 0], st);
  }
  // rounds: the ones these units carry first
  const kinds = new Set();
  for (const t of types) { const W = UNITS[t].weapons || {}; for (const k in W) { const w = W[k]; const pk = w.proj || w.kind || k; if (PROJ[pk]) kinds.add(pk); } }
  for (const k of Object.keys(PROJ)) kinds.add(k);
  for (const k of kinds) { const P = PROJ[k]; add(load, P.model, [3, 2, 1, 0]); if (P.boosterModel) add(load, P.boosterModel, [3, 2, 1, 0]); }
  // the sites on this map
  const SITES = { port: 'port', depot: 'depot', radar_hill: 'radar_hill', airfield: 'airfield', lighthouse: 'lighthouse' };
  for (const o of game.map.objectives || []) if (SITES[o.kind]) { add(load, SITES[o.kind], [3, 2, 1]); add(idle, SITES[o.kind], [0]); }
  // Inspect: the cutaways of what is in play
  for (const t of types) if (live.has(t)) add(idle, UNITS[t].model + '_cut', [2, 1, 0]);
  for (const k of ['oniks', 'sm6']) add(idle, k + '_cut', [2, 1, 0]);
  return { load, idle };
}
