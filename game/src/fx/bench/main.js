/* FX bench: the real FX system (createFx) fed by a stand-in sim, drawn with the films' CPU renderer.
   Buttons script actions at the current time; the timeline scrubs (the sim and the effects are re-run from zero,
   so every age can be looked at); the camera orbits a focus at a chosen distance. */
import { createFx } from '../index.js';
import { CpuRenderer } from './cpu.js';
import { Scene, ground, landH } from './scene.js';
import { FakeSim, DT } from './sim.js';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const canvas = $('c');
const R = new CpuRenderer(canvas);
const scene = new Scene();
R.hasModel = k => scene.has(k);

/* ---------- state ---------- */
const S = { T: 0, playing: !Q.has('t'), rate: 1, script: [], sim: null, fx: null, yaw: -2.2, pitch: .12, dist: 900, focus: 'ship', fov: 40, auto: false, tr: 0, follow: null };
const TMAX = 150;

function rebuild() {
  S.sim = new FakeSim();
  S.fx = createFx({ sim: S.sim, map: S.sim.map, ground });
  if (S.budget) S.fx.budget = S.budget;
  for (const a of S.script) ACTIONS[a.name].run(S.sim, a.t);
}
function advanceTo(T) {
  if (!S.sim || T < S.sim.t - DT - 1e-6) rebuild();
  const sim = S.sim, fx = S.fx;
  while (sim.t < T - 1e-9) {
    sim.step();
    for (const ev of sim.drainEvents()) fx.onEvent(ev);
    fx.update(DT, DT);
  }
}

/* ---------- where things are ---------- */
function focusPt() {
  const sim = S.sim, f = S.focus;
  if (Array.isArray(f)) return f.slice();
  if (f === 'ship') { const u = sim.ship; return [u.pos[0], 8, u.pos[2]]; }
  if (f === 'tel') { const u = sim.telA; return [u.pos[0], u.pos[1] + 6, u.pos[2]]; }
  if (f === 'pantsir') { const u = sim.pantsir; return [u.pos[0], u.pos[1] + 4, u.pos[2]]; }
  if (f === 'helo') { const u = sim.helo; return [u.pos[0], Math.max(4, u.pos[1] * .5), u.pos[2]]; }
  if (f === 'fighter') { const u = sim.fighter; return u.pos.slice(); }
  if (f === 'mid') return [900, 60, -300];
  if (f === 'coast') return [-1600, 20, 200];
  if (f === 'round') {
    // the newest round in the air
    let best = null; for (const p of sim.projectiles.values()) if (!best || p.t0 >= best.t0) best = p;
    if (best) return [best.pos[0], best.pos[1], best.pos[2]];
    return S.lastRound || [0, 0, 0];
  }
  return [0, 0, 0];
}

/* ---------- actions (each one replays exactly on a rebuild) ---------- */
const at = (sim, t, fn) => sim.at(t, fn);
const telMouth = (u, side) => { const c = Math.cos(u.hdg), s = Math.sin(u.hdg), o = [side * .66, 10.9, -7.2]; return [u.pos[0] + o[0] * c + o[2] * s, u.pos[1] + o[1], u.pos[2] - o[0] * s + o[2] * c]; };
const vlsCell = (u, k) => { const c = Math.cos(u.hdg), s = Math.sin(u.hdg), o = [((k % 4) - 1.5) * 1.6, 8.5, 38.9 - Math.floor(k / 4) * .85]; return [u.pos[0] + o[0] * c + o[2] * s, u.pos[1] + o[1], u.pos[2] - o[0] * s + o[2] * c]; };
const toward = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const inFlightOniks = (sim, from, o) => {
  const s = sim.ship, h = toward(from, s.pos);
  return sim.launch('oniks', 'coast', null, from, h, 0, Object.assign({ target: s.id, inFlight: 9 }, o));
};
const ACTIONS = {
  cold: { label: 'Cold launch', focus: 'tel', dist: 160, run: (sim, t) => at(sim, t, sim => { const u = sim.telA; sim.launch('oniks', 'coast', u, telMouth(u, 1), u.hdg, Math.PI / 2, { target: sim.ship.id, splashAt: 90, weapon: 'oniks' }); }) },
  vls: { label: 'VLS launch', focus: 'ship', dist: 320, run: (sim, t) => at(sim, t, sim => { const s = sim.ship; sim.launch('sm6', 'fleet', s, vlsCell(s, 3), s.hdg, Math.PI / 2, { aim: [s.pos[0] - 9000, 3000, s.pos[2] + 3000], maxT: 16, weapon: 'sm6' }); }) },
  intercept: { label: 'Intercept', focus: 'mid', dist: 1600, run: (sim, t) => {
    at(sim, t, sim => { const s = sim.ship, o = inFlightOniks(sim, [s.pos[0] - 2600, 15, s.pos[2] + 9200]); sim.launch('sm6', 'fleet', s, vlsCell(s, 5), s.hdg, Math.PI / 2, { target: o.id, weapon: 'sm6' }); });
  } },
  ciws: { label: 'Phalanx', focus: 'ship', dist: 700, run: (sim, t) => at(sim, t, sim => { const s = sim.ship; inFlightOniks(sim, [s.pos[0] - 3400, 15, s.pos[2] + 900], { ciws: 'ciws' }); }) },
  gun30: { label: '30 mm', focus: 'pantsir', dist: 600, run: (sim, t) => at(sim, t, sim => { const p = sim.pantsir; sim.launch('tlam', 'fleet', null, [p.pos[0] + 4200, 70, p.pos[2] - 2400], toward([p.pos[0] + 4200, 0, p.pos[2] - 2400], p.pos), 0, { target: p.id, inFlight: 20, ciws: 'gun30' }); }) },
  gun5: { label: '5" gun', focus: 'ship', dist: 260, run: (sim, t) => {
    for (let k = 0; k < 3; k++) at(sim, t + k * 1.2, sim => { const s = sim.ship, c = Math.cos(s.hdg), sn = Math.sin(s.hdg), mz = [s.pos[0] + 60 * sn, 9, s.pos[2] + 60 * c];
      const aim = k < 2 ? [-2300 + k * 90, 0, 700 - k * 180] : [-900, 0, 400]; aim[1] = ground(aim[0], aim[2]);
      sim.launch('shell', 'fleet', s, mz, 0, 0, { aim }); });
  } },
  shiphit: { label: 'Ship hit', focus: 'ship', dist: 520, run: (sim, t) => at(sim, t, sim => { const s = sim.ship; inFlightOniks(sim, [s.pos[0] - 1500, 15, s.pos[2] - 700]); }) },
  sink: { label: 'Sink', focus: 'ship', dist: 700, run: (sim, t) => at(sim, t, sim => { const s = sim.ship; if (s.alive) { sim.hitUnit(s, [s.pos[0] + 20 * Math.sin(s.hdg), 6, s.pos[2] + 20 * Math.cos(s.hdg)], 'oniks', null, 999); } }) },
  landhit: { label: 'Land hit', focus: 'tel', dist: 320, run: (sim, t) => at(sim, t, sim => { const u = sim.telB; if (u.alive) sim.hitUnit(u, [u.pos[0], u.pos[1] + 2, u.pos[2]], 'tlam', { side: 'fleet', from: 0, id: 0 }, 99); }) },
  splash: { label: 'Splashes', focus: 'ship', dist: 700, run: (sim, t) => {
    const P = [[260, 'shell'], [-340, 'oniks'], [120, 'hellfire']];
    P.forEach(([d, k], i) => at(sim, t + i * .7, sim => { const s = sim.ship; sim.emit('splash', { pos: [s.pos[0] + d, 0, s.pos[2] + 200 + i * 60], kind: k, side: 'coast', proj: 0, air: false, water: true, why: 'pk' }); }));
  } },
  lightning: { label: 'Lightning', focus: 'ship', dist: 2600, run: (sim, t) => at(sim, t, sim => { const s = sim.ship; const x = s.pos[0] + 900, z = s.pos[2] + 1400; sim.emit('lightning', { pos: [x, 0, z], top: [x, 2600, z], r: 3000 }); }) },
  storm: { label: 'Rain', focus: 'ship', dist: 180, run: (sim, t) => at(sim, t, sim => { const s = sim.ship; sim.weather.kind = sim.weather.kind === 'storm' ? 'calm' : 'storm'; sim.weather.squalls = sim.weather.kind === 'storm' ? [{ x: s.pos[0], z: s.pos[2], r: 5000 }, { x: s.pos[0] + 12000, z: s.pos[2] - 6000, r: 4000 }] : []; }) },
  hover: { label: 'Downwash', focus: 'helo', dist: 120, run: (sim, t) => at(sim, t, sim => { sim.heloAlt = sim.heloAlt > 30 ? 12 : 60; }) },
  ab: { label: 'Afterburner', focus: 'fighter', dist: 90, run: (sim, t) => at(sim, t, sim => { const f = sim.fighter; sim.emit('takeoff', { unit: f.id, side: f.side, type: 'fighter', from: 0, pos: null }); }) },
  salvo: { label: 'Salvo', focus: 'mid', dist: 5200, run: (sim, t) => {
    // four launches from the battery, four more rounds already in the air, six stopped (four SM-6, two by the
    // Phalanx), two hits
    const L = [[0, 'telA', 1, 'sm'], [.9, 'telB', 1, 'hit'], [2.5, 'telA', -1, 'ciws'], [3.4, 'telB', -1, 'hit']], ids = {};
    L.forEach(([dt, tel, side, fate], i) => at(sim, t + dt, sim => { const u = sim[tel]; const p = sim.launch('oniks', 'coast', u, telMouth(u, side), u.hdg, Math.PI / 2, { target: sim.ship.id, ciws: fate === 'ciws' ? 'ciws' : undefined, weapon: 'oniks' }); ids['r' + i] = p.id; }));
    const F = [[.2, -3000, 9000], [1.0, -2200, 9800], [1.8, -3800, 10400], [2.6, -3600, 1300]];
    F.forEach(([dt, dx, dz], i) => at(sim, t + dt, sim => { const s = sim.ship; const p = inFlightOniks(sim, [s.pos[0] + dx, 15, s.pos[2] + dz], i === 3 ? { ciws: 'ciws' } : {}); ids['f' + i] = p.id; }));
    const V = [[.25, 'f0'], [1.05, 'f1'], [1.85, 'f2'], [5.5, 'r0']];
    V.forEach(([dt, key], i) => at(sim, t + dt, sim => { const s = sim.ship; sim.launch('sm6', 'fleet', s, vlsCell(s, 8 + i), s.hdg, Math.PI / 2, { target: ids[key], weapon: 'sm6' }); }));
  } },
};

/* ---------- UI ---------- */
function press(name) {
  S.script.push({ name, t: +S.T.toFixed(2) });
  S.script.sort((a, b) => a.t - b.t);
  const A = ACTIONS[name];
  if ($('autofocus').checked) { S.focus = A.focus; S.dist = A.dist; syncCam(); }
  // the new action lies ahead of the sim: re-run so it is scheduled
  const T = S.T; S.sim = null; advanceTo(T);
}
function buildUI() {
  const box = $('fxb');
  for (const k in ACTIONS) {
    const b = document.createElement('button'); b.className = 'b'; b.innerHTML = `<i></i>${ACTIONS[k].label}`;
    b.onclick = () => press(k); box.appendChild(b);
  }
  const fb = $('focus');
  for (const f of ['ship', 'tel', 'pantsir', 'mid', 'coast', 'round', 'helo', 'fighter']) {
    const b = document.createElement('button'); b.className = 'c'; b.textContent = f; b.dataset.f = f; b.onclick = () => { S.focus = f; syncCam(); }; fb.appendChild(b);
  }
  const db = $('dists');
  for (const d of [20, 60, 200, 1000, 5000, 30000]) {
    const b = document.createElement('button'); b.className = 'c'; b.textContent = d >= 1000 ? d / 1000 + ' km' : d + ' m'; b.dataset.d = d; b.onclick = () => { S.dist = d; syncCam(); }; db.appendChild(b);
  }
  $('play').onclick = () => { S.playing = !S.playing; };
  $('reset').onclick = () => { S.script.length = 0; S.T = 0; S.sim = null; advanceTo(0); };
  $('rate').onclick = () => { S.rate = S.rate === 1 ? .25 : S.rate === .25 ? .05 : 1; };
  $('orbit').onclick = () => { S.auto = !S.auto; };
  const tl = $('tl');
  tl.max = TMAX; tl.step = .01;
  tl.oninput = () => { S.T = +tl.value; S.playing = false; };
  // orbit by dragging, zoom with the wheel
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, S.yaw, S.pitch]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; S.yaw = drag[2] + (e.clientX - drag[0]) * .006; S.pitch = Math.max(-.2, Math.min(1.45, drag[3] + (e.clientY - drag[1]) * .004)); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); S.dist = Math.max(8, Math.min(60000, S.dist * Math.exp(e.deltaY * .0012))); syncCam(); }, { passive: false });
  addEventListener('keydown', e => {
    if (e.key === ' ') { S.playing = !S.playing; e.preventDefault(); }
    else if (e.key === 'j') S.T = Math.max(0, S.T - 1);
    else if (e.key === 'l') S.T = Math.min(TMAX, S.T + 1);
    else if (e.key === ',') S.T = Math.max(0, S.T - DT);
    else if (e.key === '.') S.T = Math.min(TMAX, S.T + DT);
  });
}
function syncCam() {
  for (const b of $('focus').children) b.classList.toggle('on', b.dataset.f === S.focus);
  for (const b of $('dists').children) b.classList.toggle('on', +b.dataset.d === S.dist);
}

/* ---------- the frame ---------- */
const perf = { fx: 0, scene: 0, frame: 0, n: 0 };
let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - lastNow) / 1000); lastNow = now;
  S.tr += dt;
  if (S.playing) S.T = Math.min(TMAX, S.T + dt * S.rate);
  if (S.auto) S.yaw += dt * .08;
  render();
  requestAnimationFrame(frame);
}
function render() {
  const t0 = performance.now();
  advanceTo(S.T);
  const sim = S.sim, fx = S.fx;
  const alpha = 1 - (sim.t - S.T) / DT;
  const F = focusPt();
  R.orbit(F, S.yaw, S.pitch, S.dist, S.fov);
  R.begin();
  const t1 = performance.now();
  fx.draw3d({ sink: R.sink, t: S.T, alpha: Math.max(0, Math.min(1, alpha)), tr: S.tr });
  const t2 = performance.now();
  R.pb.clear();
  scene.drawGround(R, S.T, F, S.dist);
  const lerp = (u, k) => u.prev[k] + (u.pos[k] - u.prev[k]) * alpha;
  for (const u of sim.units.values()) {
    const p = [lerp(u, 0), lerp(u, 1), lerp(u, 2)];
    if (u.type === 'destroyer') scene.drawModel(R, 'destroyer', p, u.hdg, u.pitch, u.roll, .8);
    else if (u.type === 'tel' || u.type === 'pantsir') scene.drawModel(R, 'tel', p, u.hdg, 0, 0, u.alive ? 1 : .55);
    else if (u.type === 'helo') scene.drawModel(R, 'helo', p, u.hdg, 0, 0, 1);
    else if (u.type === 'fighter') scene.drawModel(R, 'fighter', p, u.hdg, 0, u.roll, 1);
  }
  for (const p of sim.projectiles.values()) {
    const x = [lerp(p, 0), lerp(p, 1), lerp(p, 2)], v = p.vel, l = Math.hypot(v[0], v[1], v[2]) || 1;
    const hdg = Math.atan2(v[0], v[2]), pitch = Math.asin(Math.max(-1, Math.min(1, v[1] / l)));
    if (p.kind === 'oniks') scene.drawModel(R, p.st.booster ? 'oniks' : 'oniksR', x, hdg, pitch, 0, 1);
    else if (p.kind === 'sm6') scene.drawModel(R, p.st.booster ? 'sm6' : 'sm6R', x, hdg, pitch, 0, 1);
    else if (p.kind !== 'shell') R.scenePt(x[0], x[1], x[2], .9, 238, 238, 228, 2, scene.LT);
    S.lastRound = x;
  }
  for (const m of R.models) scene.drawModel(R, m.key, m.T, 0, 0, 0, m.a, m.R);
  const t3 = performance.now();
  R.flush();
  R.pb.blit();
  const t4 = performance.now();
  perf.fx = perf.fx * .9 + (t2 - t1) * .1; perf.scene = perf.scene * .9 + (t3 - t2) * .1; perf.frame = perf.frame * .9 + (t4 - t0) * .1;
  if ((perf.n++ & 7) === 0) {
    const st = fx.stats;
    $('perf').innerHTML = `fx <b>${perf.fx.toFixed(1)}</b> ms · <b>${st.dots.toLocaleString('en').replace(/,/g, ' ')}</b> dots · q <b>${st.q.toFixed(2)}</b> · ${st.effects} fx · ${st.trails} trails<br>scene ${perf.scene.toFixed(1)} ms · frame <b>${perf.frame.toFixed(1)}</b> ms`;
    $('tt').textContent = `t ${S.T.toFixed(2)} s${S.rate !== 1 ? ' · x' + S.rate : ''}${S.playing ? '' : ' · paused'}`;
    $('tl').value = S.T;
    $('scr').textContent = S.script.map(a => `${a.t.toFixed(1)} ${ACTIONS[a.name].label}`).join('  ·  ');
    $('play').textContent = S.playing ? 'Pause' : 'Play';
    $('rate').textContent = 'x' + S.rate;
  }
}

/* ---------- boot ---------- */
buildUI();
if (Q.has('budget')) S.budget = +Q.get('budget');
if (Q.has('do')) for (const part of Q.get('do').split(',')) { const [name, tt] = part.split('@'); if (ACTIONS[name]) S.script.push({ name, t: +(tt || 0) }); }
if (Q.has('t')) S.T = +Q.get('t');
if (Q.has('focus')) S.focus = Q.get('focus');
if (Q.has('dist')) S.dist = +Q.get('dist');
if (Q.has('yaw')) S.yaw = +Q.get('yaw') * Math.PI / 180;
if (Q.has('pitch')) S.pitch = +Q.get('pitch') * Math.PI / 180;
if (Q.has('fov')) S.fov = +Q.get('fov');
syncCam();
advanceTo(S.T);
requestAnimationFrame(frame);

/* console / automation: FXB.shot(name, crop?, k?) saves game/shots/fx/<name>.png; FXB.go(t) */
window.FXB = {
  S, R, get fx() { return S.fx; }, get sim() { return S.sim; }, ACTIONS, press,
  go(t) { S.T = t; S.playing = false; render(); },
  set(o) { Object.assign(S, o); syncCam(); render(); },
  async shot(name, crop, k) {
    render();
    let src = canvas;
    if (crop) { k = k || 1; const [x, y, w, h] = crop, tc = document.createElement('canvas'); tc.width = w * k; tc.height = h * k; const g = tc.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(canvas, x, y, w, h, 0, 0, w * k, h * k); src = tc; }
    const r = await fetch('/save?path=game/shots/fx/' + name + '.png', { method: 'POST', body: src.toDataURL('image/png') });
    return r.status;
  },
  bench(n) { const t0 = performance.now(); for (let i = 0; i < (n || 30); i++) render(); return +((performance.now() - t0) / (n || 30)).toFixed(2); },
};
