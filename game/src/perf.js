/* ONIKS perf suite: scripted stress scenarios measured frame by frame, so 60 fps at 1080p is checked, not hoped for.

   In play.html (the console):  await ONIKS.perf()                           every scenario on this map, a table
                                await ONIKS.perf({ only: ['battle', 'jumps'] }) some of them; { scale: .5 } fewer frames
   game/perf.html runs them on every map (the heights on each, the rest on the first) and the Debrief film, in a
   1920 x 1080 frame, and prints one table. Open it at 1920 x 1080 (device pixel ratio 1).

   How a frame is measured: frames are rendered back to back at a fixed dt (1/60 s of real time; the sim at the
   scenario's rate), each waited for on the GPU (readPixels, as ONIKS.benchSync), then the page's style and layout are
   forced (the HUD's DOM work), then the event loop runs the timers and messages the game queued (their callbacks are
   timed: `task`). Per frame:
     cpu    game.frame on the main thread (sim, systems, the renderer's CPU side)
     sync   cpu + the wait for the GPU + layout: the frame's cost with nothing overlapped (what 16.7 ms is measured on)
     gpu    the GPU's own time (EXT_disjoint_timer_query_webgl2), when the browser has it
     task   timer / idle callbacks run between this frame and the next (work that delays the next frame)
   and per system and phase (game.profile; R.frame added). Reported per scenario: avg / p95 / p99 / max of sync (and
   of cpu, gpu), the frames over 16.7 ms, the worst frame and where its time went.
   The auto-quality guard (game/perfguard.js) is held at full quality while the suite runs; stored settings are never
   written (the scenarios change the renderer and the game directly and put them back).
   Needs the rAF loop out of the way: the suite holds game.frame (the page's own loop renders nothing meanwhile).

   Scenarios (ids): heights (the map at 150 m, 3 km, 30 km) · zoom (20 m -> 150 km on the command post) · jumps (a
   minimap click, a minimap drag, an alert fly-to, a far -> near cut) · inspect (exploded carrier and destroyer) ·
   orbital (the full Orbital style at 1.2 / 15 / 60 km) · storm (a squall line with lightning, x4) · scan (a chain scan
   on six destroyers, the inset) · radar (radar view) · battle (200 units at x32, the fog on, normal AIs, 30+ rounds in
   flight, the salvo board) · replay (the hit replay of the battle's last decisive hit) · battlemax (the same forces
   with the fog off and both AIs hard: hundreds of rounds) · guard (the auto-quality guard, not held, under an
   artificial GPU load that comes and goes: its steps) · debrief (the Debrief film; only on a ?debrief= page). */

const DEG = Math.PI / 180;
const BUDGET = 1000 / 60;

/* ------------------------------------------------------------------ statistics */
function stats(a) {
  if (!a.length) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = Float64Array.from(a).sort(), n = s.length, q = k => s[Math.min(n - 1, Math.floor(n * k))];
  let sum = 0; for (let i = 0; i < n; i++) sum += s[i];
  return { avg: sum / n, p50: q(.5), p95: q(.95), p99: q(.99), max: s[n - 1] };
}
const r2 = v => Math.round(v * 100) / 100;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

/* a small seeded rng (placement never touches the sim's own streams) */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ the harness */
export function harness(win, o) {
  o = o || {};
  const O = win.ONIKS, game = O.game, R = O.R, cam = R.camera, sim = O.sim, gl = R.gl, doc = win.document;
  const perf = win.performance, now = () => perf.now();
  const px = new Uint8Array(4);
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const scale = o.scale || 1;
  const rows = [];

  // hold the page's own loop: game.frame renders only when the suite calls it
  const gf = game.frame;
  game.frame = function () { };
  // the guard at full quality, no GPU queries of its own
  const Q = game.quality;
  const qHold = Q ? Q.hold : undefined;
  if (Q) Q.hold = true;
  // R.frame (camera, terrain prepare) into the profile
  const rFrame = R.frame;
  R.frame = function (dt, t) { const a = now(); rFrame.call(this, dt, t); if (game.profile) game.prof['R.frame'] = now() - a; };
  // timer and idle callbacks, timed (they run between frames and delay the next one)
  let taskMs = 0, taskMax = 0;
  const oT = win.setTimeout, oI = win.requestIdleCallback;
  const timed = fn => function () { const a = now(); try { return fn.apply(this, arguments); } finally { const d = now() - a; taskMs += d; if (d > taskMax) taskMax = d; } };
  win.setTimeout = function (fn, ms, ...args) { return typeof fn === 'function' ? oT.call(win, timed(fn), ms, ...args) : oT.call(win, fn, ms, ...args); };
  if (oI) win.requestIdleCallback = function (fn, opt) { return oI.call(win, timed(fn), opt); };
  const ch = new win.MessageChannel();
  let wake = null;
  ch.port1.onmessage = () => { const w = wake; wake = null; if (w) w(); };
  const yieldMsg = () => new Promise(r => { wake = r; ch.port2.postMessage(0); });
  const yieldTimer = () => new Promise(r => oT.call(win, r, 0));

  /* one frame, unmeasured (warming, setting a scene up) */
  function frame(dt) { gf.call(game, dt === undefined ? 1 / 60 : dt); }
  // a hidden page holds its timers to one wake-up a second: yield through messages there, through timers (so the
  // game's own timeouts get their turn between frames, as in play) only while the page is shown
  // (hidden: every 90 frames the timers get their turn all the same, as the game's own warm-ups hang on them: a
  // cutaway built 30 ms after a launch; that wait is not part of any frame)
  const yieldTo = i => (!doc.hidden ? (i % 6 === 5 ? yieldTimer() : yieldMsg()) : (i % 90 === 89 ? yieldTimer() : yieldMsg()));
  async function warm(n, dt) { for (let i = 0; i < n; i++) { frame(dt); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i % 4 === 3) await yieldTo(i); } }

  /* measure n frames: before(i) runs ahead of each (camera moves, keys); one row of the table */
  async function measure(label, n, before, opt) {
    opt = opt || {};
    n = Math.max(10, Math.round(n * (opt.noScale ? 1 : scale)));
    const dt = opt.dt === undefined ? 1 / 60 : opt.dt;
    const F = { sync: [], cpu: [], gpu: [], task: [], lay: [] }, sys = new Map(), worst = [];
    const queries = [];
    let stop = false;
    for (let i = 0; i < n && !stop; i++) {
      if (before && before(i) === false) { stop = true; break; }
      game.prof = {}; game.profile = true;
      let q = null;
      if (tq && !opt.noGpu) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
      const a = now();
      gf.call(game, dt);
      const c = now() - a;
      if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); queries.push([i, q]); }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const b = now();
      void doc.body.getBoundingClientRect().width;         // style + layout of what the HUD changed
      const s = now() - a, lay = now() - b;
      game.profile = false;
      taskMs = 0;
      await yieldTo(i);
      F.sync.push(s); F.cpu.push(c); F.lay.push(lay); F.task.push(taskMs);
      const P = game.prof;
      if (o.raw) (F.prof || (F.prof = [])).push(P);
      let named = 0;
      for (const k in P) {
        const v = P[k]; named += k === 'R.frame' ? 0 : v;
        let e = sys.get(k); if (!e) sys.set(k, e = { sum: 0, max: 0 });
        e.sum += v; if (v > e.max) e.max = v;
      }
      if (s > BUDGET || worst.length < 3 || s > worst[worst.length - 1].sync) {
        const top = Object.entries(P).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${f1(v)}`);
        worst.push({ i, sync: s, cpu: c, lay, top: top.join(', ') });
        worst.sort((x, y) => y.sync - x.sync); if (worst.length > 6) worst.length = 6;
      }
    }
    // the GPU times (all resolved after the last readPixels; a disjoint run drops them)
    if (tq && queries.length) {
      await yieldMsg();
      const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
      for (const [i, q] of queries) {
        if (!disjoint && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) F.gpu[i] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
      }
      for (const w of worst) w.gpu = F.gpu[w.i] === undefined ? null : r2(F.gpu[w.i]);
    }
    for (const w of worst) { w.sync = r2(w.sync); w.cpu = r2(w.cpu); w.lay = r2(w.lay); w.task = r2(F.task[w.i] || 0); }
    const S = stats(F.sync), C = stats(F.cpu), G = stats(F.gpu.filter(v => v !== undefined)), T = stats(F.task), L = stats(F.lay);
    const top = [...sys.entries()].map(([k, e]) => [k, e.sum / F.sync.length, e.max]).sort((x, y) => y[1] - x[1]);
    const row = {
      label, frames: F.sync.length, res: `${R.G.W}x${R.G.H}`,
      avg: r2(S.avg), p95: r2(S.p95), p99: r2(S.p99), max: r2(S.max),
      cpu: { avg: r2(C.avg), p95: r2(C.p95), max: r2(C.max) }, gpu: { avg: r2(G.avg), p95: r2(G.p95), max: r2(G.max) },
      layout: { avg: r2(L.avg), max: r2(L.max) }, task: { max: r2(T.max), sum: r2(F.task.reduce((x, y) => x + y, 0)) },
      over: F.sync.filter(v => v > BUDGET).length,
      sys: top.slice(0, 8).map(([k, a, m]) => `${k} ${f1(a)}/${f1(m)}`).join(' · '),
      peaks: [...sys.entries()].filter(([, e]) => e.max > 4).sort((x, y) => y[1].max - x[1].max).slice(0, 6).map(([k, e]) => `${k} ${f1(e.max)}`).join(' · '),
      worst: worst.slice(0, 4),
      note: opt.note || '',
      raw: o.raw ? F : undefined,
    };
    rows.push(row);
    if (o.log !== false) win.console.log(`PERF ${label}: avg ${f1(row.avg)} · p95 ${f1(row.p95)} · p99 ${f1(row.p99)} · max ${f1(row.max)} ms (cpu ${f1(row.cpu.avg)}/${f1(row.cpu.max)}, gpu ${f1(row.gpu.avg)}/${f1(row.gpu.max)}, task max ${f1(row.task.max)}) · over ${row.over}/${row.frames}`);
    return row;
  }

  function key(code, o2) {
    o2 = o2 || {};
    const init = { code, key: o2.key || code.replace(/^Key/, '').toLowerCase(), shiftKey: !!o2.shift, bubbles: true, cancelable: true };
    win.dispatchEvent(new win.KeyboardEvent('keydown', init));
    win.dispatchEvent(new win.KeyboardEvent('keyup', init));
  }
  function view(x, z, dist, yawDeg, pitchDeg, y) {
    cam.follow(null); cam.fly = null;
    cam.set({ target: [x, y !== undefined ? y : Math.max(0, R.terrain.heightAt(x, z)), z], dist, yaw: yawDeg * DEG, pitch: pitchDeg * DEG });
  }
  /* diagnosis: time every method of obj (or the names given) into the profile as prefix.method (nested calls count
     in both); undone by done() */
  const probes = [];
  function probe(obj, prefix, names) {
    if (!obj) return;
    for (const k of names || Object.keys(obj)) {
      const fn = obj[k];
      if (typeof fn !== 'function' || fn.__probe) continue;
      const w = function () { const a = now(); try { return fn.apply(this, arguments); } finally { if (game.profile) { const P = game.prof, key = prefix + '.' + k; P[key] = (P[key] || 0) + now() - a; } } };
      w.__probe = true;
      obj[k] = w; probes.push([obj, k, fn]);
    }
  }
  function unprobe() { for (const [obj, k, fn] of probes.splice(0)) obj[k] = fn; }
  function done() {
    unprobe();
    game.frame = gf; R.frame = rFrame;
    win.setTimeout = oT; if (oI) win.requestIdleCallback = oI;
    ch.port1.onmessage = null;
    if (Q) Q.hold = qHold;
    game.profile = false;
  }
  return { win, O, game, R, cam, sim, gl, now, frame, warm, measure, key, view, rows, done, yieldTimer, yieldMsg, scale, probe, unprobe, o };
}

/* ------------------------------------------------------------------ helpers onto the game */
const sysOf = (game, name) => game.getSystem ? game.getSystem(name) : null;
function ownHq(sim, side) { return sim.hq(side) || sim.alive(side)[0] || null; }
/* a point at sea between the two spawns, `f` of the way from the coast's */
function seaPoint(map, f) {
  const c = map.spawns.coast, s = map.spawns.fleet;
  for (let k = 0; k < 40; k++) {
    const t = Math.min(.95, f + k * .015), x = c.x + (s.x - c.x) * t, z = c.z + (s.z - c.z) * t;
    if (map.h(x, z) < -40) return [x, z];
  }
  return [s.x, s.z];
}
function quietWorld(ctx) {
  // the sandbox's enemy asleep, nothing flying: scenes that must not change under the camera
  const { game } = ctx;
  if (game.replay && game.replay.active) game.replay.skip();
  if (game.inspect && game.inspect.active) game.inspect.close();
  const sens = sysOf(game, 'sensors'); if (sens && sens.scopeOn) sens.toggleScope();
  const dir = sysOf(game, 'director'); if (dir && dir.on && dir.set) dir.set(false);
  game.setRate(1); if (game.paused) game.pause(false);
}

/* the 200-unit battle: both sides to 100 units round their spawns (the coast battery and its boats, the fleet between
   the spawns), everyone weapons free, both AIs awake; the sim runs on until `rounds` are in the air */
async function battleSetup(ctx, o) {
  const { sim, map } = ctx.O, game = ctx.game;
  quietWorld(ctx);
  const [{ findSpot, deckFor }, { setAi }] = await Promise.all([import('./sim/economy.js'), import('./game/setup.js')]);
  const rnd = rng(4242), c = map.spawns.coast, f = map.spawns.fleet;
  const add = (side, type, n, x, z, r) => {
    const D = game.UNITS[type];
    if (!D) return;
    for (let i = 0; i < n; i++) {
      if (sim.alive(side).length >= 100) return;
      let u = null;
      if (D.domain === 'air') {
        const deck = deckFor(sim, side, type);
        if (deck) u = sim.spawn(type, side, deck.pos[0], deck.pos[2], { aboard: deck.id });
        else { const p = findSpot(sim, 'air', x, z, r, rnd); u = sim.spawn(type, side, p[0], p[1], { hdg: rnd() * 6.28 }); }
      } else {
        const dom = D.sub ? 'sub' : D.domain === 'sea' ? 'sea' : 'land';
        const p = findSpot(sim, dom, x, z, r, rnd);
        u = sim.spawn(type, side, p[0], p[1], { hdg: Math.atan2((side === 'coast' ? f.x : c.x) - p[0], (side === 'coast' ? f.z : c.z) - p[1]) });
      }
      if (u) u.hold = false;
    }
  };
  const P = seaPoint(map, .5);
  add('coast', 'radar', 6, c.x, c.z, 6000); add('coast', 'tel', 30, c.x, c.z, 7000); add('coast', 'pantsir', 18, c.x, c.z, 6000);
  add('coast', 'bal', 16, c.x, c.z, 7000); add('coast', 'transloader', 12, c.x, c.z, 6000); add('coast', 'catapult', 4, c.x, c.z, 5000);
  add('coast', 'ssk', 6, P[0], P[1], 9000); add('coast', 'tel', 20, c.x, c.z, 9000);
  add('fleet', 'carrier', 1, P[0], P[1], 12000); add('fleet', 'ddg', 34, P[0], P[1], 14000); add('fleet', 'ssn', 6, P[0], P[1], 16000);
  add('fleet', 'fighter', 30, P[0], P[1], 12000); add('fleet', 'helo', 14, P[0], P[1], 12000); add('fleet', 'aew', 6, P[0], P[1], 12000);
  add('fleet', 'ddg', 20, P[0], P[1], 18000);
  for (const u of sim.list()) if (u.alive) u.hold = false;
  ctx.battle = { fog: sim.fog, setAi, P };
  sim.fog = o.fog;
  setAi(sim, 'coast', true, o.ai); setAi(sim, 'fleet', true, o.ai);
  // run the sim until the air is full, at most 12 sim-minutes
  let t = 0;
  while (sim.projectiles.size < o.rounds && t < 720) { ctx.O.ff(10); t += 10; }
}
/* three views of the battle at x32: over the coast battery at 6 km, over the fleet at 9 km, the whole at 45 km */
async function battleMeasure(ctx, name) {
  const { sim } = ctx.O, game = ctx.game;
  const nU = sim.list().filter(u => u.alive).length;
  const hqC = ownHq(sim, 'coast'), fl = sim.alive('fleet').filter(u => u.def.domain === 'sea');
  const P = ctx.battle && ctx.battle.P || seaPoint(ctx.O.map, .5);
  const fc = fl.length ? [fl.reduce((s, u) => s + u.pos[0], 0) / fl.length, fl.reduce((s, u) => s + u.pos[2], 0) / fl.length] : P;
  game.setRate(32);
  ctx.view(hqC.pos[0], hqC.pos[2], 6000, Math.atan2(fc[0] - hqC.pos[0], fc[1] - hqC.pos[2]) / DEG, 22);
  await ctx.warm(30);
  const note = `${nU} units, ${sim.projectiles.size} rounds at start`;
  let maxP = 0, minP = 1e9;
  const count = () => { const n = sim.projectiles.size; if (n > maxP) maxP = n; if (n < minP) minP = n; };
  const row = await ctx.measure(`${name} · coast 6 km`, 420, count, { note });
  ctx.view(fc[0], fc[1], 9000, Math.atan2(hqC.pos[0] - fc[0], hqC.pos[2] - fc[1]) / DEG, 20);
  await ctx.warm(10);
  await ctx.measure(`${name} · fleet 9 km`, 420, count);
  ctx.view((hqC.pos[0] + fc[0]) / 2, (hqC.pos[2] + fc[1]) / 2, 45000, 40, 45);
  await ctx.warm(10);
  await ctx.measure(`${name} · 45 km`, 240, count);
  row.note += `, ${minP}-${maxP} in flight while measured`;
  game.setRate(1);
}

/* ------------------------------------------------------------------ scenarios */
export const SCENARIOS = {
  /* the map at three heights over the command post, looking out to sea */
  async heights(ctx) {
    const { sim, map } = ctx.O, hq = ownHq(sim, ctx.game.side);
    const p = hq ? [hq.pos[0], hq.pos[2]] : [map.spawns.coast.x, map.spawns.coast.z];
    const f = map.spawns.fleet, yaw = Math.atan2(f.x - p[0], f.z - p[1]) / DEG;
    quietWorld(ctx);
    for (const [label, d, pitch] of [['150 m', 150, 12], ['3 km', 3000, 28], ['30 km', 30000, 50]]) {
      ctx.view(p[0], p[1], d, yaw, pitch);
      await ctx.warm(40);
      await ctx.measure(`${map.id} · ${label}`, 180);
    }
  },

  /* one continuous zoom from 20 m to 150 km on the command post (through the Orbital dissolve) */
  async zoom(ctx) {
    const { sim, map } = ctx.O, hq = ownHq(sim, ctx.game.side), p = [hq.pos[0], hq.pos[2]];
    quietWorld(ctx);
    ctx.view(p[0], p[1], 20, 200, 18);
    await ctx.warm(30);
    const n = Math.round(420 * ctx.scale);
    await ctx.measure('zoom 20 m → 150 km', n, i => { const k = i / (n - 1); ctx.cam.set({ dist: 20 * Math.pow(150000 / 20, k), pitch: (18 + 42 * k) * DEG, yaw: (200 + 40 * k) * DEG }); }, { noScale: true });
  },

  /* camera jumps: a minimap click (the goal jumps, the camera sweeps), a minimap drag (instant), an alert's fly-to, a cut
     from far to near (review 3's stall) */
  async jumps(ctx) {
    const { sim, map } = ctx.O, cam = ctx.cam, game = ctx.game, T = ctx.R.terrain;
    const hq = ownHq(sim, game.side), c = map.spawns.coast, f = map.spawns.fleet;
    quietWorld(ctx);
    ctx.view(hq.pos[0], hq.pos[2], 1500, 30, 30);
    await ctx.warm(40);
    const W = map.W / 2, H = map.H / 2;
    const pts = [[-W * .6, H * .55], [W * .55, -H * .5], [W * .6, H * .6], [-W * .55, -H * .6], [f.x, f.z], [(c.x + f.x) / 2, (c.z + f.z) / 2]];
    const look = (x, z, instant) => {
      const d = sysOf(game, 'director'); if (d && d.on && d.set) d.set(false);
      if (game.follow) game.follow(null); else cam.follow(null);
      cam.fly = null;
      cam.goal.target = [x, Math.max(0, T.heightAt(x, z)), z];
      if (instant) { cam.target[0] = x; cam.target[2] = z; }
    };
    await ctx.measure('jump · minimap click', 90, i => { if (i === 0) look(pts[0][0], pts[0][1], false); });
    await ctx.measure('jump · minimap drag', 60, i => { if (i === 0) look(pts[1][0], pts[1][1], true); });
    await ctx.measure('jump · alert fly-to', 240, i => { if (i === 0) cam.flyTo([pts[2][0], undefined, pts[2][1]], { dist: 9000 }); });
    ctx.view(pts[3][0], pts[3][1], 40000, 10, 50);
    await ctx.warm(20);
    await ctx.measure('jump · far → near cut', 60, i => { if (i === 0) ctx.view(pts[4][0], pts[4][1], 300, 80, 14); });
    await ctx.measure('jump · near → near cut', 60, i => { if (i === 0) ctx.view(pts[5][0], pts[5][1], 250, 140, 10); });
  },

  /* Inspect: the exploded view of a carrier and a destroyer (fog off: the sandbox shows everything) */
  async inspect(ctx) {
    const { sim } = ctx.O, game = ctx.game;
    if (!game.inspect) return;
    quietWorld(ctx);
    const fog = sim.fog; sim.fog = false;
    for (const type of ['carrier', 'ddg']) {
      let u = sim.list().find(v => v.type === type && v.alive && !v.aboard);
      if (!u) { const p = seaPoint(ctx.O.map, .75); u = sim.spawn(type, 'fleet', p[0], p[1], { hdg: 1 }); }
      ctx.view(u.pos[0], u.pos[2], 2500, 40, 25);
      await ctx.warm(20);
      await ctx.measure(`inspect ${type} · open`, 120, i => { if (i === 0) game.inspect.open(u.id); });
      await ctx.measure(`inspect ${type} · exploded`, 600, i => { if (i === 0) ctx.key('KeyE'); if (i === 400) ctx.key('KeyE'); });
      await ctx.measure(`inspect ${type} · x-ray, close`, 150, i => { if (i === 0) ctx.key('KeyX'); if (i === 60) game.inspect.close(); });
    }
    sim.fog = fog;
  },

  /* the full Orbital render style */
  async orbital(ctx) {
    const { sim, map } = ctx.O, R = ctx.R, game = ctx.game;
    quietWorld(ctx);
    const was = R.style;
    R.style = 'orbital';
    const ship = sim.list().find(v => v.def.domain === 'sea' && v.alive) || null, p = ship ? [ship.pos[0], ship.pos[2]] : seaPoint(map, .7);
    const hq = ownHq(sim, game.side);
    for (const [label, x, z, d, pitch] of [['1.2 km', p[0], p[1], 1200, 20], ['15 km', hq.pos[0], hq.pos[2], 15000, 35], ['60 km', 0, 0, 60000, 55]]) {
      ctx.view(x, z, d, 30, pitch);
      await ctx.warm(30);
      await ctx.measure(`orbital style · ${label}`, 150);
    }
    R.style = was;
    await ctx.warm(5);
  },

  /* a storm: a squall line of thunderstorm cells over the water, lightning, x4 */
  async storm(ctx) {
    const { sim, map } = ctx.O, game = ctx.game, R = ctx.R;
    quietWorld(ctx);
    const [{ weatherOf }, { Weather }] = await Promise.all([import('./game/setup.js'), import('./sim/weather.js')]);
    const w0 = game.weather, wx0 = sim.weather;
    const w = weatherOf(map, 'storm');
    sim.weather = new Weather(sim, w);
    R.terrain.setWeather({ kind: w.kind, wind: w.wind, sea: w.sea });
    game.weather = w; game.bus.emit('weather', w);
    sim.weather.spawnFront();
    ctx.O.ff(260);                                       // the cells grown
    const F = sim.weather.fronts[sim.weather.fronts.length - 1];
    const c = F ? F.cells[Math.floor(F.cells.length / 2)] : { x: 0, z: 0 };
    const yaw = F ? Math.atan2(F.dx, F.dz) / DEG + 90 : 0;
    ctx.view(c.x - Math.sin(yaw * DEG) * 0, c.z, 32000, yaw, 10, 1500);
    await ctx.warm(30);
    game.setRate(4);
    await ctx.measure('storm · squall line x4', 600);
    ctx.view(c.x, c.z, 9000, yaw + 30, 22);
    await ctx.warm(10);
    await ctx.measure('storm · under the cell x4', 300);
    game.setRate(1);
    // back to the map's own weather
    sim.weather = wx0; const wb = w0 || weatherOf(map, null);
    R.terrain.setWeather({ kind: wb.kind, wind: wb.wind, sea: wb.sea }); game.weather = wb; game.bus.emit('weather', wb);
    await ctx.warm(5);
  },

  /* a chain scan on six destroyers, the inset (the hulls are small on screen) */
  async scan(ctx) {
    const { sim, map } = ctx.O, game = ctx.game;
    quietWorld(ctx);
    const side = game.side, hq = ownHq(sim, side);
    const scanner = sim.alive(side).find(u => u.def.scan && u.def.scan.reach >= 50000 && !u.aboard) || hq;
    const reach = scanner.def.scan.reach;
    // six hulls in a 3 km ring well inside the scanner's reach, at sea
    const dir = Math.atan2(map.spawns.fleet.x - scanner.pos[0], map.spawns.fleet.z - scanner.pos[2]);
    let P = null;
    for (let d = reach * .45; d > 6000 && !P; d -= 2000) {
      const x = scanner.pos[0] + Math.sin(dir) * d, z = scanner.pos[2] + Math.cos(dir) * d;
      if (map.h(x, z) < -60 && map.h(x + 3000, z) < -30 && map.h(x - 3000, z) < -30 && map.h(x, z + 3000) < -30 && map.h(x, z - 3000) < -30) P = [x, z];
    }
    if (!P) P = seaPoint(map, .35);
    const enemy = game.enemy, ids = [];
    const types = enemy === 'fleet' ? ['ddg', 'ddg', 'ddg', 'ddg', 'ddg', 'ddg'] : ['tel', 'tel', 'radar', 'pantsir', 'tel', 'transloader'];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, r = i ? 2200 : 0;
      const u = sim.spawn(types[i], enemy, P[0] + Math.sin(a) * r, P[1] + Math.cos(a) * r, { hdg: dir + Math.PI });
      if (u) { ids.push(u.id); u.hold = true; }
    }
    const fog = sim.fog; sim.fog = true;
    ctx.O.ff(3);
    ctx.view(P[0] - Math.sin(dir) * 0, P[1], 22000, dir / DEG + 200, 24);
    await ctx.warm(20);
    sim.sides[side].scanCd = 0; if (scanner.cooldowns) scanner.cooldowns.scan = 0;
    await ctx.measure('scan · chain on 6 hulls + inset', 420, i => { if (i === 0) sim.order([scanner.id], { kind: 'scan', x: P[0], z: P[1], stay: true }); });
    sim.fog = fog;
    for (const id of ids) { const u = sim.units.get(id); if (u) { sim.units.delete(id); sim.emit('removed', { unit: id, type: u.type, side: u.side }); } }
    sim._dirty = true; game.dispatchEvents();
    await ctx.warm(5);
  },

  /* radar view (V) */
  async radar(ctx) {
    const { sim } = ctx.O, game = ctx.game, sens = sysOf(game, 'sensors');
    if (!sens || !sens.toggleScope) return;
    quietWorld(ctx);
    const hq = ownHq(sim, game.side);
    ctx.view(hq.pos[0], hq.pos[2], 25000, 250, 50);
    await ctx.warm(20);
    await ctx.measure('radar view', 300, i => { if (i === 0 && !sens.scopeOn) sens.toggleScope(); });
    if (sens.scopeOn) sens.toggleScope();
    await ctx.warm(30);
  },

  /* 200 units, both sides' AI awake (normal) and weapons free, the fog on, x32, 30+ rounds in flight, the salvo board */
  async battle(ctx) {
    await battleSetup(ctx, { fog: true, ai: 'normal', rounds: 34 });
    await battleMeasure(ctx, 'battle x32');
  },
  /* the same forces at their worst: the fog off and both AIs hard, so every unit fires at everything it can reach
     (hundreds of rounds in flight: far past a real match; how the frame degrades, and what the guard does) */
  async battlemax(ctx) {
    const { sim } = ctx.O, game = ctx.game;
    if (sim.alive('fleet').length < 60) await battleSetup(ctx, { fog: false, ai: 'hard', rounds: 150 });
    else {
      const { setAi } = await import('./game/setup.js');
      ctx.battle = ctx.battle || { fog: sim.fog, setAi };
      sim.fog = false;
      setAi(sim, 'coast', false); setAi(sim, 'fleet', false);
      setAi(sim, 'coast', true, 'hard'); setAi(sim, 'fleet', true, 'hard');
      for (const u of sim.list()) if (u.alive) u.hold = false;
      let t = 0;
      while (sim.projectiles.size < 150 && t < 600) { ctx.O.ff(10); t += 10; }
    }
    await battleMeasure(ctx, 'battle max x32');
    const { setAi } = ctx.battle; setAi(sim, 'coast', false); setAi(sim, 'fleet', false); sim.fog = ctx.battle.fog;
    game.setRate(1);
  },

  /* the hit replay (J) of the last decisive hit (after the battle) */
  async replay(ctx) {
    const game = ctx.game, sim = ctx.O.sim;
    if (!game.replay) return;
    if (!game.replay.last) {
      // no decisive hit yet: let the battle (or the AI) run on until one lands
      for (let k = 0; k < 60 && !game.replay.last; k++) ctx.O.ff(10);
    }
    if (!game.replay.last) { console.warn('perf: no decisive hit to replay'); return; }
    game.setRate(1);
    await ctx.measure('hit replay (J)', 600, i => { if (i === 0) game.replay.play(); });
    if (game.replay.active) game.replay.skip();
  },

  /* the battle with the guard at work, pinned at each effects step and then left to itself (the sim's budget adapts
     too): what each step buys where the frame is bound by the main thread */
  async levels(ctx) {
    const { sim } = ctx.O, game = ctx.game, Q = game.quality;
    if (!Q) return;
    if (!ctx.battle || sim.projectiles.size < 30) await battleSetup(ctx, { fog: true, ai: 'normal', rounds: 150 });
    const hqC = ownHq(sim, 'coast');
    game.setRate(32);
    ctx.view(hqC.pos[0], hqC.pos[2], 6000, 250, 22);
    for (const lv of [0, 1, 2, null]) {
      Q.hold = false; Q.pin = lv;
      await ctx.warm(lv === null ? 150 : 30);
      await ctx.measure(`battle x32 · guard ${lv === null ? 'free (' : 'at '}${lv === null ? '' : lv}`, 180, null, { noGpu: true, note: '' });
      const r = ctx.rows[ctx.rows.length - 1];
      if (lv === null) r.label += `${Q.label || 'AUTO'})`;
      r.note = `${sim.projectiles.size} rounds, sim budget ${game.stepBudgetMs.toFixed(1)} ms`;
    }
    Q.pin = null; Q.hold = true; game.setRate(1);
  },

  /* the auto-quality guard at work (game/perfguard.js, not held): an artificial GPU load that scales with the
     pixels (a full-screen shader pass tuned to ~12 ms at 1080p: a GPU five times weaker than this one), then the
     load taken away, then back. A timeline of the guard's level each half second, and the frame cost it sees.
     o.guardLoad: ms of the pass at 1080p (default 12) */
  async guard(ctx) {
    const game = ctx.game, Q = game.quality, G = game.getSystem('perfguard'), R = ctx.R, gl = R.gl;
    if (!Q || !G) return;
    quietWorld(ctx);
    const { sim } = ctx.O, hq = ownHq(sim, game.side);
    ctx.view(hq.pos[0], hq.pos[2], 1500, 200, 22);
    await ctx.warm(20);
    const L = gpuLoad(gl), end0 = R.end;
    let n = 0;
    R.end = function () { end0.apply(this, arguments); if (n) L.draw(n); };
    const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), px = new Uint8Array(4);
    // tune the pass: GPU ms per 100 iterations at this size
    const probe = async k => {
      if (!tq) return 0;
      const qs = [];
      for (let i = 0; i < 8; i++) { const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); L.draw(k); gl.endQuery(tq.TIME_ELAPSED_EXT); qs.push(q); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      await ctx.yieldMsg();
      let sum = 0, c = 0;
      for (const q of qs) { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { sum += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; c++; } gl.deleteQuery(q); }
      return c ? sum / c : 0;
    };
    const want = ctx.o.guardLoad || 12;
    let k = 200, ms = await probe(k);
    for (let it = 0; it < 4 && ms > 0; it++) { k = Math.max(10, Math.round(k * want / ms)); ms = await probe(k); }
    const tl = [], res = [];
    const hold0 = Q.hold;
    Q.hold = false; G.reset();
    const t0 = ctx.now();
    const phase = async (name, secs, load) => {
      n = load ? k : 0;
      const N = Math.round(secs * 60);
      let acc = 0, worst = 0, c = 0;
      for (let i = 0; i < N; i++) {
        const a = ctx.now();
        ctx.frame(1 / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const d = ctx.now() - a; acc += d; c++; if (d > worst) worst = d;
        if (i % 30 === 29) {
          tl.push({ phase: name, t: +(tl.length * .5 + .5).toFixed(1), level: Q.level, label: Q.label, cost: +Q.frameMs.toFixed(1), gpu: +Q.gpuMs.toFixed(1), sync: +(acc / c).toFixed(1), scale: +R.renderScale.toFixed(2) });
          acc = 0; c = 0;
        }
        if (i % 4 === 3) await ctx.yieldMsg();
      }
      res.push({ phase: name, secs, load: load ? `${want} ms at 1080p (${k} it)` : 'none', endLevel: Q.level, label: Q.label, worst: +worst.toFixed(1) });
    };
    await phase('calm', 5, false);
    await phase('load', 16, true);
    await phase('calm again', 32, false);
    await phase('load again', 20, true);
    await phase('calm, last', 32, false);
    n = 0; R.end = end0; L.dispose();
    const log = Q.log.slice();
    Q.hold = hold0; G.reset();
    ctx.rows.push({ label: 'guard · artificial GPU load', guard: { timeline: tl, phases: res, steps: log, ms: Math.round(ctx.now() - t0) }, frames: tl.length * 30, avg: 0, p95: 0, p99: 0, max: 0, cpu: { avg: 0, max: 0 }, gpu: { avg: 0 }, over: 0, peaks: '', note: `${log.length} steps: ` + log.map(e => `${e.t}s ${e.from}->${e.to}`).join(', ') });
    if (ctx.o.log !== false) ctx.win.console.log('PERF guard', JSON.stringify({ phases: res, steps: log }));
  },

  /* the Debrief film (only on a ?debrief= page) */
  async debrief(ctx) {
    const game = ctx.game, D = game.debrief;
    if (!D || !D.F) return;
    // the take starts once the frame's loading screen has gone (a hidden page runs its timers once a second)
    for (let k = 0; k < 3000 && (D.state === 'boot' || D.state === 'wait'); k++) { ctx.frame(1 / 60); await ctx.yieldMsg(); if (k % 30 === 29) await ctx.yieldTimer(); }
    if (D.state !== 'play') { ctx.rows.push({ label: 'debrief film · ' + D.state, error: D.F.err || 'the film did not start' }); return; }
    await ctx.measure('debrief film', 4800, () => D.state === 'play', { noScale: true });
  },
};
export const ORDER = ['heights', 'zoom', 'jumps', 'inspect', 'orbital', 'storm', 'scan', 'radar', 'battle', 'replay', 'guard', 'debrief'];

/* an artificial GPU load: a full-screen pass of n iterations of trigonometry per pixel that leaves the picture as it
   is (blended with zero weight), so its cost follows the render scale like the game's own fill does */
function gpuLoad(gl) {
  const vs = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const fs = `#version 300 es
precision highp float; uniform int uN; out vec4 o;
void main() { vec2 q = gl_FragCoord.xy * .0013; float a = 0.0; for (int i = 0; i < uN; i++) a += sin(q.x * float(i) + a) * cos(q.y + a * 1.3); o = vec4(a * 1e-12, 0.0, 0.0, 0.0); }`;
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
  const uN = gl.getUniformLocation(p, 'uN');
  return {
    draw(n) {
      const prog = gl.getParameter(gl.CURRENT_PROGRAM), vao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      const blend = gl.isEnabled(gl.BLEND), depth = gl.isEnabled(gl.DEPTH_TEST), dm = gl.getParameter(gl.DEPTH_WRITEMASK);
      const bs = gl.getParameter(gl.BLEND_SRC_RGB), bd = gl.getParameter(gl.BLEND_DST_RGB), be = gl.getParameter(gl.BLEND_EQUATION_RGB);
      gl.useProgram(p); gl.uniform1i(uN, n);
      gl.bindVertexArray(null);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ZERO, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      if (!blend) gl.disable(gl.BLEND);
      if (depth) gl.enable(gl.DEPTH_TEST);
      gl.depthMask(dm); gl.blendEquation(be); gl.blendFunc(bs, bd);
    },
    dispose() { gl.deleteProgram(p); gl.deleteShader(a); gl.deleteShader(b); },
  };
}

/* ------------------------------------------------------------------ run */
export async function run(win, o) {
  o = o || {};
  win = win || window;
  const list = (o.only || ORDER).filter(k => SCENARIOS[k]);
  const ctx = harness(win, o);
  // { events: true }: every system's onEvent timed on its own (they otherwise count in 'sim': the events are
  // dispatched while the sim steps); { probe: ctx => ctx.probe(obj, 'name') }: finer diagnosis
  if (o.events) for (const s of ctx.game.systems) if (s.onEvent) ctx.probe(s, s.name, ['onEvent']);
  if (o.probe) o.probe(ctx);
  const env = envOf(win);
  const t0 = ctx.now();
  try {
    for (const k of list) {
      try { await SCENARIOS[k](ctx); } catch (e) { win.console.error('perf: ' + k, e); ctx.rows.push({ label: k + ' · FAILED', error: String(e && e.stack || e) }); }
    }
  } finally { ctx.done(); }
  const out = { env, secs: Math.round((ctx.now() - t0) / 1000), rows: ctx.rows };
  if (o.log !== false) win.console.log(table(out.rows));
  return out;
}

/* stills of the heaviest scenes at full quality, for comparing the look before and after a change (the render is a
   function of the state: the same page, seed and steps give the same pixels): the command post at 1.5 km, the storm's
   squall line, the chain scan at its peak, the 200-unit battle (its fire and smoke, x32 run ahead by the sim alone)
   close and far, an exploded carrier. Saved as game/shots/perf/<prefix>_<scene>.png; compare two sets with
   tools/imgdiff.py. */
export async function stills(win, prefix) {
  const ctx = harness(win, { log: false });
  const O = ctx.O, sim = O.sim, game = ctx.game, map = O.map;
  // (the page's own step takes the shot, in the same task as the frame the suite just drew: its game.frame is held)
  const shot = name => { const p = O.shot('perf/' + prefix + '_' + name); ctx.frame(0); O.advance(0, 1); return p; };
  const warm0 = async n => { for (let i = 0; i < n; i++) ctx.frame(0); await ctx.yieldMsg(); };
  try {
    quietWorld(ctx);
    const hq = ownHq(sim, game.side);
    ctx.view(hq.pos[0], hq.pos[2], 1500, 200, 22); await warm0(30); await shot('hq_1500');
    // the battle, run ahead by the sim alone (deterministic), then frozen
    await battleSetup(ctx, { fog: true, ai: 'normal', rounds: 60 });
    ctx.stillsState = { t: sim.t, hash: sim.hash(), proj: sim.projectiles.size, seaT: game.seaT, realT: game.realT };
    const hqC = ownHq(sim, 'coast');
    ctx.view(hqC.pos[0], hqC.pos[2], 6000, 250, 22); await warm0(30); await shot('battle_6km');
    ctx.view(hqC.pos[0], hqC.pos[2], 1500, 230, 16); await warm0(30); await shot('battle_1500');
    ctx.view(hqC.pos[0], hqC.pos[2], 45000, 40, 45); await warm0(30); await shot('battle_45km');
    // an exploded carrier
    const cv = sim.list().find(u => u.type === 'carrier' && u.alive && !u.aboard);
    if (cv && game.inspect) {
      sim.fog = false; game.inspect.open(cv.id);
      for (let i = 0; i < 200; i++) ctx.frame(1 / 60);
      ctx.key('KeyE'); for (let i = 0; i < 360; i++) ctx.frame(1 / 60);
      await warm0(2); await shot('carrier_exploded');
      game.inspect.close(); for (let i = 0; i < 120; i++) ctx.frame(1 / 60);
    }
  } finally { ctx.done(); }
  return Object.assign({ prefix }, ctx.stillsState);
}

export function envOf(win) {
  const O = win.ONIKS, R = O.R, gl = R.gl, e = gl.getExtension('WEBGL_debug_renderer_info');
  return { res: `${R.G.W}x${R.G.H}`, dpr: win.devicePixelRatio, map: O.map.id, mode: O.game.mode, gpu: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '', cores: win.navigator.hardwareConcurrency, when: new Date().toISOString() };
}

/* the rows as a text table (ms): avg / p95 / p99 / max of the synced frame, cpu avg / max, gpu avg, over 16.7 */
export function table(rows) {
  const L = Math.max(10, ...rows.map(r => r.label.length));
  const pad = (s, n) => String(s).padStart(n);
  const head = `${'scenario'.padEnd(L)} ${pad('avg', 6)} ${pad('p95', 6)} ${pad('p99', 6)} ${pad('max', 6)} ${pad('cpu', 6)} ${pad('cpuMx', 6)} ${pad('gpu', 6)} ${pad('>16.7', 6)}  peaks`;
  const lines = rows.map(r => r.error ? `${r.label.padEnd(L)} ${r.error.split('\n')[0]}` :
    `${r.label.padEnd(L)} ${pad(f1(r.avg), 6)} ${pad(f1(r.p95), 6)} ${pad(f1(r.p99), 6)} ${pad(f1(r.max), 6)} ${pad(f1(r.cpu.avg), 6)} ${pad(f1(r.cpu.max), 6)} ${pad(f1(r.gpu.avg), 6)} ${pad(r.over + '/' + r.frames, 6)}  ${r.peaks}${r.note ? '  [' + r.note + ']' : ''}`);
  return [head, ...lines].join('\n');
}
