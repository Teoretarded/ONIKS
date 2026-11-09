/* Environment tone: the visibility scene (scene.js: DDG, Nimitz, a low F/A-18, two sea-skimmers, an SM-6, a shore
   TEL) in the game's own renderer and terrain, with the terrain's tones (engine/terrain.js ENV_TONES) side by side.
   URL: ?map=<id> (default krasnaya_kosa) &time=night|dusk|day &weather=calm|haze|rain|storm &sea=0..1
   Keys: 0 / 1 / 2 classic, muted, split (V toggles the split) · N M F near mid far · J the jet · B the beach TEL ·
   P pause · S still (game/shots/env_<tone>_<view>.png) · H hide the text.
   Console: ENV.series() takes near / mid / far / jet / beach, each tone plus a side-by-side (env_pair_<view>.png). */
import { Renderer } from '../src/engine/renderer.js';
import { Wake } from '../src/engine/fx.js';
import { stubMap } from '../src/engine/stubmap.js';
import { ENV_TONES } from '../src/engine/terrain.js';
import { buildScene, CYCLE } from './scene.js';

const DEG = Math.PI / 180;
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TONES = ['classic', 'muted'];
const NAMES = { classic: 'Classic', muted: 'Muted', split: 'Classic | Muted' };
const T_SHOW = CYCLE * 3 + 6.4;

async function getMap() {
  const id = Q.get('map') || 'krasnaya_kosa';
  try { const W = await import('../src/world/maps.js'); const m = await W.loadMap(id); if (m && m.heights) return m; }
  catch (e) { console.warn('env: map unavailable, stub coast', e); }
  return stubMap();
}

export async function boot() {
  const map = await getMap();
  if (Q.get('time')) map.time = Q.get('time');
  const R = new Renderer({ canvas: $('gl'), overlay: $('ov'), map, renderScale: 1, terrain: { densNear: 140, densFar: 380 } });
  const T = R.terrain, cam = R.camera;
  if (Q.get('weather') || Q.get('sea')) T.setWeather({ kind: Q.get('weather') || undefined, sea: Q.get('sea') ? +Q.get('sea') : undefined });
  cam.attach($('gl'));
  cam.edge = false;
  try { const DM = await import('../src/data/models.js'); R.models.registerAll(DM.EXTRA_MODELS, DM.MODEL_INFO); }
  catch (e) { console.warn('env: data/models.js not registered', e); }
  const S = buildScene(R, map), U = S.U;
  for (const d of S.LIST) R.models.warm(d.key);

  // the jet passes ~700 m shoreward of the destroyer at the showcase moment (as vis.js)
  { const d = S.ddgPath(T_SHOW), goal = [d.x - S.ax * 700, d.z - S.az * 700]; let best = 0, bd = 1e18;
    for (let q = 0; q < 170; q += .1) { const j = S.jet(q); const dd = (j.x - goal[0]) ** 2 + (j.z - goal[1]) ** 2; if (dd < bd) { bd = dd; best = q; } }
    const jet0 = S.jet; S.jet = t => jet0(t - T_SHOW + best);
    const upd = S.update; S.update = t => { const L = upd(t), j = S.jet(t); Object.assign(U.jet, { hdg: j.hdg, roll: j.roll }); U.jet.T[0] = j.x; U.jet.T[1] = j.y; U.jet.T[2] = j.z; return L; }; }
  let T_NEAR = T_SHOW;
  { let bd = 1e18; for (let q = T_SHOW - 4; q < T_SHOW + 8; q += .02) { const a = S.skimmer(q, 0), d = S.ddgPath(q); if (!a) continue; const dd = (a.x - d.x) ** 2 + (a.z - d.z) ** 2; if (dd < bd) { bd = dd; T_NEAR = q; } } T_NEAR -= .35; }
  // the skimmers just off the beach, the TEL behind them
  let T_BEACH = T_SHOW;
  { let bd = 1e18; for (let q = T_SHOW - 12; q < T_SHOW; q += .02) { const a = S.skimmer(q, 0); if (!a) continue; const dd = Math.abs(Math.hypot(a.x - S.tel[0], a.z - S.tel[2]) - 600); if (dd < bd) { bd = dd; T_BEACH = q; } } }

  const st = { tone: 'split', t: T_SHOW - 5, rate: 1, paused: false, view: 'mid', ui: true };
  const seaYaw = Math.atan2(-S.ax, -S.az);
  const mid = () => { const p = U.ddg.T, c = U.cvn.T, s = U.s1.live ? U.s1.T : S.tel; return [(p[0] * 2 + c[0] + s[0]) / 4, 0, (p[2] * 2 + c[2] + s[2]) / 4]; };
  const VIEWS = {
    near: () => { const p = S.ddgPath(st.t); return { target: [p.x - S.ax * 120 + S.px * 170, 0, p.z - S.az * 120 + S.pz * 170], dist: 700, yaw: Math.atan2(S.px, S.pz) + Math.PI - 20 * DEG, pitch: 9 * DEG }; },
    mid: () => ({ target: mid(), dist: 6500, yaw: seaYaw + 58 * DEG, pitch: 16 * DEG }),
    far: () => ({ target: mid(), dist: 20000, yaw: seaYaw + 52 * DEG, pitch: 24 * DEG }),
    jet: () => { const j = U.jet.T; return { target: [j[0], 0, j[2]], dist: 400, yaw: U.jet.hdg + 125 * DEG, pitch: 12 * DEG }; },
    beach: () => ({ target: [S.tel[0] + S.ax * 150, 0, S.tel[2] + S.az * 150], dist: 750, yaw: seaYaw + 25 * DEG, pitch: 11 * DEG }),
  };
  function view(name, jump) {
    const v = VIEWS[name](); st.view = name; cam.follow(null);
    if (jump) cam.set(v); else cam.flyTo(v.target, { dist: v.dist, yaw: v.yaw, pitch: v.pitch, time: 1.2 });
    st.chase = name === 'jet';
  }
  function chase() {
    const j = U.jet.T, h = U.jet.hdg, f = [Math.sin(h), Math.cos(h)], r = [Math.cos(h), -Math.sin(h)];
    cam.view = { eye: [j[0] - f[0] * 95 + r[0] * 70, j[1] + 16, j[2] - f[1] * 95 + r[1] * 70], look: [j[0] + f[0] * 6, j[1], j[2] + f[1] * 6] };
    cam.goal.target = [j[0], 0, j[2]]; cam.target = cam.goal.target.slice();
  }
  S.update(st.t); view('mid', true);

  // ---------- UI ----------
  const lookEl = $('look'), look2 = $('look2'), readEl = $('read'), rowEl = $('row');
  const ORDER = ['classic', 'muted', 'split'];
  function setTone(k) {
    st.tone = k;
    document.body.classList.toggle('splitv', k === 'split');
    lookEl.textContent = k === 'split' ? 'Classic' : NAMES[k]; look2.textContent = 'Muted';
    for (const el of rowEl.children) el.classList.toggle('on', el.dataset.k === k);
  }
  rowEl.innerHTML = ORDER.map((l, i) => `<span data-k="${l}"><b>${i}</b>${NAMES[l]}</span>`).join('');
  for (const el of rowEl.children) el.addEventListener('click', () => setTone(el.dataset.k));
  setTone(st.tone);
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const c = e.code;
    if (c === 'Digit0') setTone('classic'); else if (c === 'Digit1') setTone('muted'); else if (c === 'Digit2') setTone('split');
    else if (c === 'KeyV') setTone(st.tone === 'split' ? 'muted' : 'split');
    else if (c === 'KeyN') view('near'); else if (c === 'KeyM') view('mid'); else if (c === 'KeyF') view('far');
    else if (c === 'KeyJ') view('jet'); else if (c === 'KeyB') view('beach');
    else if (c === 'KeyP') st.paused = !st.paused;
    else if (c === 'KeyS') still(`env_${st.tone}_${st.view}`);
    else if (c === 'KeyH') { st.ui = !st.ui; document.body.classList.toggle('noui', !st.ui); }
  });

  // ---------- frame ----------
  function pass(dt, tone, list) {
    T.setTone(tone);
    if (dt === null) R.begin(st.t); else R.frame(dt, st.t);
    for (const d of list) if (d.live && !(d.alpha !== undefined && d.alpha <= .02)) R.draw(d);
    S.drawFx(st.t, Wake);
    R.end();
  }
  let msAvg = 0;
  function render(dt) {
    const t0 = performance.now(), gl = R.gl;
    const list = S.update(st.t);
    if (st.chase) chase();
    if (st.tone !== 'split') pass(dt, st.tone, list);
    else {
      pass(dt, 'classic', list);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.round(R.G.W / 2), 0, R.G.W, R.G.H);
      try { pass(null, 'muted', list); } finally { gl.disable(gl.SCISSOR_TEST); }
    }
    const ms = performance.now() - t0; msAvg += (ms - msAvg) * .05;
    if (st.ui) {
      const dist = cam.dist, ds = dist >= 1000 ? (dist / 1000).toFixed(dist < 10000 ? 1 : 0) + ' km' : Math.round(dist) + ' m';
      readEl.innerHTML = `<span>${map.id || 'stub'}</span><span>range <b>${ds}</b></span><span>cpu <b>${msAvg.toFixed(1)}</b> ms</span>`;
    }
  }
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!st.paused) st.t += dt * st.rate;
    render(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- stills ----------
  const grab = () => { const g = $('gl'), cv = document.createElement('canvas'); cv.width = g.width; cv.height = g.height; cv.getContext('2d').drawImage(g, 0, 0); return cv; };
  async function save(cv, name) { await fetch('/save?path=game/shots/' + name + '.png', { method: 'POST', body: cv.toDataURL('image/png') }); console.log('env: still', name); return name; }
  function label(cv, text, x) { const c = cv.getContext('2d'), k = cv.height / 1080; c.font = `500 ${Math.round(15 * k)}px 'Geist Mono', monospace`; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(text.toUpperCase(), x + Math.round(40 * k), Math.round(56 * k)); }
  async function still(name) { render(0); const cv = grab(); label(cv, NAMES[st.tone], 0); return save(cv, name); }
  /* each view frozen at its moment: both tones full frame, and a pair (left classic, right muted) at half size */
  async function series(views, tag) {
    const was = { paused: st.paused, t: st.t, tone: st.tone };
    st.paused = true; const out = [], sfx = tag ? '_' + tag : '';
    for (const v of views || ['near', 'mid', 'far', 'jet', 'beach']) {
      st.t = v === 'near' ? T_NEAR : v === 'beach' ? T_BEACH : T_SHOW;
      S.update(st.t);
      st.view = v; cam.follow(null); cam.set(VIEWS[v]()); st.chase = v === 'jet';
      setTone('classic');
      for (let i = 0; i < 40; i++) { render(1 / 60); await new Promise(r => setTimeout(r, 16)); }
      const shots = {};
      for (const k of TONES) { setTone(k); render(0); await new Promise(r => setTimeout(r, 30)); render(0); shots[k] = grab(); label(shots[k], NAMES[k], 0); out.push(await save(shots[k], `env_${k}_${v}${sfx}`)); }
      const g = $('gl'), pw = Math.round(g.width / 2), ph = Math.round(g.height / 2), pc = document.createElement('canvas');
      pc.width = pw * 2 + 4; pc.height = ph; const c = pc.getContext('2d'); c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, pc.width, pc.height);
      c.drawImage(shots.classic, 0, 0, pw, ph); c.drawImage(shots.muted, pw + 4, 0, pw, ph);
      out.push(await save(pc, `env_pair_${v}${sfx}`));
    }
    st.paused = was.paused; st.t = was.t; setTone(was.tone); st.chase = false;
    return out;
  }
  window.ENV = { R, S, st, cam, view, setTone, still, series, render, TONES: ENV_TONES, T_SHOW };
  document.body.classList.add('ready');
}
