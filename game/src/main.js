/* play.html boot: read the match from the URL, load the map, build the renderer, the sim and the game, register
   the systems (the game's own, then the other agents' modules when they exist), run the loop.

   URL (the menus hand these over; see game/setup.js):
     ?mode=sandbox&map=&side=&fog=&weather=
     ?mode=combat&map=&side=&ai=easy|normal|hard&win=hq|obj&timer=<s>&fog=1
     ?mode=campaign&mission=<n>[&map=&side=]
   Debug: ?seed=, ?rate=, ?scale=<render scale>, ?cam=x,z,dist,yawDeg,pitchDeg, ?ui=0, ?fps=1, ?bench=1 (BENCH after 6 s),
   ?nosys=fx,audio (skip optional systems). Console: ONIKS.game / sim / R, ONIKS.benchSync(n), ONIKS.still(name),
   ONIKS.advance(sec), ONIKS.shot(name). */
import { Renderer } from './engine/renderer.js';
import { stubMap } from './engine/stubmap.js';
import { createGame } from './game/game.js';
import { parseParams, createMatch } from './game/setup.js';
import { createRender } from './game/render.js';
import { getSettings, onSettings, DOT_DENSITY } from './data/settings.js';
import { getMission } from './data/campaign.js';
import { createLoading, warmLists } from './ui/loading/index.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;

/* the game's own systems (game/src/game/*), loaded as they exist; each exports create<Name>(game, ctx) */
const OWN = [
  ['./game/select.js', 'createSelect'],
  ['./game/orders.js', 'createOrders'],
  ['./game/time.js', 'createTime'],
  ['./game/director.js', 'createDirector'],
  ['./game/objectives.js', 'createObjectives'],
  ['./game/match.js', 'createMatchFlow'],
  ['./game/sandbox.js', 'createSandbox'],
  ['./game/sonar.js', 'createSonar'],
];
/* the other agents' systems: dropped in later without touching this file (missing modules are skipped) */
const OPTIONAL = [
  [['./fx/index.js'], 'createFx', 'fx'],
  [['./ui/sensors.js', './ui/sensors/index.js'], 'createSensors', 'sensors'],
  [['./ui/inspect.js', './ui/inspect/index.js'], 'createInspect', 'inspect'],
  [['./audio/index.js'], 'createAudio', 'audio'],
  [['./ui/hud/index.js', './ui/hud.js'], 'createHud', 'hud'],
  [['./game/landmarks.js'], 'createLandmarks', 'landmarks'],
  [['./game/orbital.js'], 'createOrbital', 'orbital'],
  [['./ui/help/index.js'], 'createHelp', 'help'],
  [['./game/filmmaker.js'], 'createFilmmaker', 'filmmaker'],
  [['./game/debrief.js'], 'createDebrief', 'debrief'],
];

async function getMap(id) {
  if (id !== 'stub') {
    try {
      const mod = await import('./world/maps.js');
      const m = await mod.loadMap(id);
      if (m && m.heights && m.cols && m.rows) return m;
      console.warn('main: loadMap returned no heightfield; using the stub map');
    } catch (e) { console.warn('main: world/maps.js unavailable (' + (e && e.message) + '); using the stub map'); }
  }
  return stubMap();
}

/* does a file exist? Walks the server's directory listings from src/ down (no 404s in the console) */
const listings = new Map();
async function listing(dirUrl) {
  if (!listings.has(dirUrl)) listings.set(dirUrl, fetch(dirUrl, { cache: 'no-store' }).then(r => r.ok ? r.text() : null).catch(() => null));
  return listings.get(dirUrl);
}
async function exists(path) {
  const base = new URL('./', import.meta.url), parts = path.replace(/^\.\//, '').split('/');
  let dir = base.href;
  for (let i = 0; i < parts.length; i++) {
    const html = await listing(dir);
    if (html === null) {
      // no listings from this server: fall back to asking for the file
      try { const r = await fetch(new URL(path, import.meta.url), { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (e) { return false; }
    }
    const name = parts[i] + (i < parts.length - 1 ? '/' : '');
    if (!html.includes(`href="${name}"`)) return false;
    dir += name;
  }
  return true;
}

/* import a module if it is there: a missing file is skipped quietly, a broken one is reported */
async function optional(path, exp, game, ctx) {
  const url = new URL(path, import.meta.url);
  if (!await exists(path)) return null;
  try {
    const m = await import(url.href);
    const f = m[exp] || m.default;
    if (typeof f !== 'function') { console.warn(`main: ${path} has no ${exp}()`); return null; }
    return await f(game, ctx);
  } catch (e) { console.error(`main: ${path} failed to load`, e); return null; }
}

let LOAD = null;
async function boot() {
  const load = LOAD = createLoading($('boot'));     // the loading screen (ui/loading): the real step, a dotted bar
  const P = parseParams(location.search);
  const mission = P.mode === 'campaign' ? getMission(P.mission) : null;
  const mapId = (mission && mission.map) || P.map || 'krasnaya_kosa';
  const settings = getSettings();
  const perf = $('perf');
  const skip = new Set((Q.get('nosys') || '').split(',').filter(Boolean));
  // fetch the systems' code while the map loads (module by module the waves of imports add up); registered in order below
  const code = async paths => { for (const p of paths) if (await exists(p)) return import(new URL(p, import.meta.url).href).catch(() => null); };
  for (const [p] of OWN) code([p]);
  for (const [paths, , key] of OPTIONAL) if (!skip.has(key)) code(paths);
  code(['./data/models.js']);
  let mapName = mapId.replace(/_/g, ' ');
  try { const W = await import('./world/maps.js'); const d = W.MAPS && W.MAPS.find(m => m.id === mapId); if (d) mapName = d.name; } catch (e) { /* stub */ }
  load.step('Map', mapName);
  const t0 = performance.now();
  const map = await getMap(mapId);
  const tMap = performance.now() - t0;
  load.step('Terrain', `${Math.round(map.W / 1000)} × ${Math.round(map.H / 1000)} km`);
  await load.paint();
  const dens = DOT_DENSITY[settings.dotDensity] || 1;
  const R = new Renderer({ canvas: $('gl'), overlay: $('ov'), map, renderScale: (+Q.get('scale') || 1) * (settings.renderScale || 1),
    terrain: { densNear: 140 * dens, densFar: 380 * dens } });
  const cam = R.camera;
  cam.attach($('gl'));
  cam.edge = settings.edgePan !== false;
  cam.invert = !!settings.invertRotate;
  let DM = null;
  try {
    DM = await import('./data/models.js');
    R.models.registerAll(DM.EXTRA_MODELS, DM.MODEL_INFO);
    R.models.registerAll(DM.CUT_MODELS, DM.MODEL_INFO);
  } catch (e) { console.warn('main: data/models.js not registered (' + (e && e.message) + ')'); }

  load.step('Forces');
  await load.paint();
  const M = createMatch(map, P, mission);
  const sim = M.sim;
  load.note(`${sim.list().length} units`);
  if (P.rate) settings.timeRate = P.rate;
  const game = createGame({ sim, map, renderer: R, side: M.side, settings, mode: P.mode, params: P, mission });
  game.uiRoot = $('ui');
  game.match = M;
  game.models = DM;
  game.weather = M.weather;                       // { kind, wind, sea } (sandbox can change it: bus 'weather')
  if (M.weather) R.terrain.setWeather({ wind: M.weather.wind, sea: M.weather.sea });
  game.addSystem(createRender(game, DM));
  const ctx = { DM, params: P, mission, match: M };
  // own systems first (in order), then the optional ones
  let nSys = 0; const allSys = OWN.length + OPTIONAL.length;
  load.count('Systems', 0, allSys);
  for (const [path, exp] of OWN) { const s = await optional(path, exp, game, ctx); if (s) game.addSystem(s); load.count('Systems', ++nSys, allSys); }
  const firstOf = async (paths, exp) => { for (const p of paths) if (await exists(p)) return optional(p, exp, game, ctx); return null; };
  const opt = await Promise.all(OPTIONAL.map(([paths, exp, key]) => (skip.has(key) ? Promise.resolve(null) : firstOf(paths, exp)).then(s => { load.count('Systems', ++nSys, allSys); return s; })));
  opt.forEach((s, i) => { if (s) { game.addSystem(s); console.log(`ONIKS: system ${OPTIONAL[i][2]} on`); } });
  game.attachInput($('gl'));
  game.bus.emit('ready', game);
  onSettings(s => { game.settings = Object.assign(game.settings, s); cam.edge = s.edgePan !== false; cam.invert = !!s.invertRotate; perf.style.display = s.showFps || Q.get('fps') === '1' ? '' : 'none'; });

  // warm the model caches: every level of what is in play now (no stall on the first close look), the rest in idle time
  const warm = warmLists(game);
  await load.warm(game, warm.load);
  console.log(`ONIKS: ${P.mode} on ${map.id} as ${game.side}; map ${Math.round(tMap)} ms, setup ${Math.round(performance.now() - t0 - tMap)} ms; ${sim.list().length} units`);

  // camera: on the player's own force, looking toward the enemy
  openingShot(game);
  if (Q.get('cam')) {
    const [x, z, d, y, p] = Q.get('cam').split(',').map(Number);
    cam.set({ target: [x, R.terrain.heightAt(x, z), z], dist: d || 500, yaw: (y || 0) * DEG, pitch: (p || 30) * DEG });
  }
  if (Q.get('ui') === '0') game.setUiHidden(true);
  // two frames under the loading screen (terrain, shaders, the first samples), so the first one seen is smooth
  for (let i = 0; i < 2; i++) { game.frame(0); await load.paint(); }
  await load.fill();

  /* ---------- loop ---------- */
  perf.style.display = settings.showFps || Q.get('fps') === '1' ? '' : 'none';
  const bench = Q.get('bench') === '1';
  let last = performance.now(), fAcc = 0, fN = 0, cpuAcc = 0, pTxt = 0;
  const benchS = { t0: 0, frames: [], cpu: [] };
  const shots = [];
  function takeShot(s) {
    const g = $('gl'), o = $('ov'), [x, y, w, h] = s.crop || [0, 0, g.width, g.height];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.drawImage(g, x, y, w, h, 0, 0, w, h);
    if (s.overlay !== false) cx.drawImage(o, x * o.width / g.width, y * o.height / g.height, w * o.width / g.width, h * o.height / g.height, 0, 0, w, h);
    fetch('/save?path=game/shots/' + s.name + '.png', { method: 'POST', body: cv.toDataURL('image/png') }).then(r => s.done && s.done(r.status));
  }
  function step(now, dtOver) {
    const dt = dtOver !== undefined ? dtOver : Math.min(.1, (now - last) / 1000); last = now;
    const c0 = performance.now();
    game.frame(dt);
    const cpu = performance.now() - c0;
    if (shots.length) takeShot(shots.shift());
    return { dt, cpu };
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const { dt, cpu } = step(now);
    fAcc += dt; fN++; cpuAcc += cpu;
    if (now - pTxt > 250 && perf.style.display !== 'none') {
      const fps = fN / Math.max(1e-3, fAcc), st = R.terrain.stats;
      perf.innerHTML = `<b>${fps.toFixed(0)}</b> FPS · <b>${(1000 * fAcc / Math.max(1, fN)).toFixed(1)}</b> MS · CPU <b>${(cpuAcc / Math.max(1, fN)).toFixed(1)}</b>\n` +
        `${R.G.W}×${R.G.H} · ${(st.dots / 1e6).toFixed(2)} M GROUND · ${(R.stats.points / 1e6).toFixed(2)} M MODEL · SIM ${game.stepMs.toFixed(2)} MS × ${game.stepsLast}`;
      fAcc = 0; fN = 0; cpuAcc = 0; pTxt = now;
    }
    if (bench) {
      if (!benchS.t0) benchS.t0 = now;
      const el = now - benchS.t0;
      if (el > 1000 && el < 6000) { benchS.frames.push(dt * 1000); benchS.cpu.push(cpu); }
      else if (el >= 6000 && !benchS.done) {
        benchS.done = true;
        const avg = a => a.reduce((s, v) => s + v, 0) / a.length, p95 = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length * .95)];
        const r = { frames: benchS.frames.length, frameMs: +avg(benchS.frames).toFixed(2), frameP95: +p95(benchS.frames).toFixed(2), cpuMs: +avg(benchS.cpu).toFixed(2), cpuP95: +p95(benchS.cpu).toFixed(2), res: `${R.G.W}x${R.G.H}`, ground: R.terrain.stats.dots, model: R.stats.points };
        console.log('BENCH ' + JSON.stringify(r));
        window.BENCH = r;
      }
    }
  }
  requestAnimationFrame(loop);
  // the loading screen fades over the opening shot (a short push-in unless a flight, a still or a bench has the camera)
  load.reveal(game, { glide: !Q.get('cam') && !bench && P.mode !== 'campaign' && Q.get('ui') !== '0' })
    .then(() => { if (!bench) load.idle(game, warm.idle); });

  window.ONIKS = {
    R, map, sim, game, cam, params: P, mission,
    shot: (name, crop, overlay) => new Promise(done => shots.push({ name, crop, overlay, done })),
    /* render n frames back to back, each waited for on the GPU (works with the page hidden): ms per frame */
    benchSync(n, dt) {
      const gl = R.gl, px = new Uint8Array(4), ms = [];
      for (let i = 0; i < (n || 60); i++) {
        const a = performance.now();
        step(a, dt === undefined ? 1 / 60 : dt);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ms.push(performance.now() - a);
      }
      ms.sort((x, y) => x - y);
      return { avg: +(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(2), p50: +ms[ms.length >> 1].toFixed(2), p95: +ms[Math.floor(ms.length * .95)].toFixed(2), res: `${R.G.W}x${R.G.H}`, ground: R.terrain.stats.dots, model: R.stats.points, units: sim.list().length, proj: sim.projectiles.size };
    },
    /* advance real time by `sec` in n frames (the sim runs at the current rate) */
    advance(sec, n) { n = n || Math.max(1, Math.ceil(sec * 10)); for (let i = 0; i < n; i++) step(performance.now(), sec / n); return sim.t; },
    /* run the sim alone for `sec` sim seconds (fast-forward, no rendering) */
    ff(sec) { const n = Math.round(sec / game.DT); for (let i = 0; i < n; i++) { sim.step(); if (sim.events.length > 2000) game.dispatchEvents(); } game.dispatchEvents(); return sim.t; },
    /* render one frame now and save it */
    still: (name, dt, warm) => new Promise(done => {
      for (let i = 0; i < (warm === undefined ? 30 : warm); i++) step(performance.now(), 0);
      shots.push({ name, done }); step(performance.now(), dt === undefined ? 0 : dt);
    }),
  };
}

/* the opening shot: over the player's force, looking out toward the enemy spawn */
function openingShot(game) {
  const { sim, map, camera: cam, R } = game;
  const own = sim.alive(game.side).filter(u => !u.aboard);
  const sp = map.spawns[game.side], en = map.spawns[game.enemy];
  // the core of the force: the units within 4 km of the command unit (or of the first unit)
  const hq = own.find(u => u.def.hq) || own[0];
  const c0 = hq ? hq.pos : [sp.x, 0, sp.z];
  const core = own.filter(u => Math.hypot(u.pos[0] - c0[0], u.pos[2] - c0[2]) < (game.side === 'fleet' ? 20000 : 4000));
  const pts = core.length ? core : [{ pos: c0 }];
  const c = [0, 0, 0];
  for (const u of pts) { c[0] += u.pos[0] / pts.length; c[2] += u.pos[2] / pts.length; }
  let r = 0; for (const u of pts) r = Math.max(r, Math.hypot(u.pos[0] - c[0], u.pos[2] - c[2]));
  const yaw = Math.atan2(en.x - c[0], en.z - c[2]);
  if (game.side === 'fleet') cam.set({ target: [c0[0], 0, c0[2]], dist: hq ? Math.max(700, hq.def.size[0] * 4.5) : 2600, yaw: yaw - .5, pitch: 14 * DEG });
  else {
    // close on the command post, the sea beyond it (the minimap has the rest of the force)
    const t = hq ? hq.pos : c, y2 = Math.atan2(en.x - t[0], en.z - t[2]);
    cam.set({ target: [t[0], R.terrain.heightAt(t[0], t[2]), t[2]], dist: hq ? Math.max(320, hq.def.size[0] * 12) : Math.min(9000, Math.max(260, r * 2.2)), yaw: y2 - .45, pitch: 16 * DEG });
  }
}

boot().catch(e => { console.error(e); if (LOAD) LOAD.fail(e && e.message); });
