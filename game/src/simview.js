/* simview: a fast top-down 2D debug view of an AI-vs-AI battle (game/simview.html).
   Canvas 2D, graphite, white terrain dots, lime / coral / white, mono labels. Time controls, and a toggle between
   ground truth and each side's picture (what that side's AI actually knows). Uses loadMap from world/maps.js when
   available, else the sim's stub map. URL: ?map=<id>&seed=<n>&ai=easy|normal|hard&rate=8&view=truth|coast|fleet */
import { Sim, DT } from './sim/sim.js';
import { UNITS, CLASSIFY } from './data/units.js';
import { stubMap } from './sim/stubmap.js';
import { setupBattle } from './sim/setup.js';

const Q = new URLSearchParams(location.search);
const LIME = '#C6F432', CORAL = '#FF6A3D', WHITE = '#FFFFFF', BG = '#0B0C0A';
const RATES = [0, 1, 2, 4, 8, 16, 32, 64];
const VIEWS = ['truth', 'coast', 'fleet'];
const cv = document.getElementById('cv'), g = cv.getContext('2d');
const $ = id => document.getElementById(id);

let MAPS = [], loadMap = null;
let sim = null, map = null, terrain = null, rate = +(Q.get('rate') || 8), view = Q.get('view') || 'truth';
let cam = { x: 0, z: 0, s: 1 };                 // world centre, pixels per metre
let fx = [];                                    // transient effects from events
let show = { labels: true, rings: false, paths: false };
let dpr = 1, W = 0, H = 0, acc = 0, lastT = 0, stepMs = 0, loading = false;

/* ------------------------------------------------------------------ setup */
async function init() {
  try { const M = await import('./world/maps.js'); MAPS = M.MAPS || []; loadMap = M.loadMap; } catch (e) { MAPS = []; }
  const sel = $('map');
  sel.innerHTML = '<option value="stub">stub · test coast</option>' + MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  sel.value = Q.get('map') || (MAPS[0] ? MAPS[0].id : 'stub');
  if (Q.get('seed')) $('seed').value = Q.get('seed');
  if (Q.get('ai')) $('lvl').value = Q.get('ai');
  for (const r of RATES) { const b = document.createElement('button'); b.textContent = r ? 'x' + r : 'pause'; b.dataset.r = r; b.onclick = () => setRate(r); $('rates').appendChild(b); }
  for (const v of VIEWS) { const b = document.createElement('button'); b.textContent = v; b.dataset.v = v; b.onclick = () => setView(v); $('views').appendChild(b); }
  $('restart').onclick = restart; sel.onchange = restart; $('lvl').onchange = restart;
  $('seed').onkeydown = e => { if (e.key === 'Enter') restart(); };
  for (const k of ['labels', 'rings', 'paths']) { const b = $('t' + k[0].toUpperCase() + k.slice(1)); b.onclick = () => { show[k] = !show[k]; b.classList.toggle('on', show[k]); }; b.classList.toggle('on', show[k]); }
  setRate(rate); setView(view);
  addEventListener('resize', resize); resize();
  input();
  await restart();
  requestAnimationFrame(frame);
}

async function restart() {
  if (loading) return;
  loading = true;
  const id = $('map').value;
  $('res').style.display = 'block'; $('res').textContent = 'LOADING ' + id.toUpperCase();
  try { map = id === 'stub' || !loadMap ? stubMap() : await loadMap(id); }
  catch (e) { console.warn('simview: map failed, using the stub', e); map = stubMap(); }
  sim = new Sim(map, { seed: +$('seed').value || 1337, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'], difficulty: $('lvl').value });
  setupBattle(sim);
  window.sim = sim;
  terrain = bakeTerrain(map);
  fx = []; acc = 0;
  fit();
  $('res').style.display = 'none';
  loading = false;
}

function setRate(r) { rate = r; for (const b of $('rates').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.r === r); }
function setView(v) { view = v; for (const b of $('views').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v); }
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function fit() { cam.x = 0; cam.z = 0; cam.s = Math.min(W / map.W, H / map.H) * .92; }

/* world (x east, z north) -> screen */
const sx = x => W / 2 + (x - cam.x) * cam.s;
const sy = z => H / 2 - (z - cam.z) * cam.s;

function input() {
  let drag = null;
  cv.addEventListener('mousedown', e => { drag = [e.clientX, e.clientY, cam.x, cam.z]; });
  addEventListener('mouseup', () => { drag = null; });
  addEventListener('mousemove', e => { if (!drag) return; cam.x = drag[2] - (e.clientX - drag[0]) / cam.s; cam.z = drag[3] + (e.clientY - drag[1]) / cam.s; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const wx = cam.x + (e.clientX - W / 2) / cam.s, wz = cam.z - (e.clientY - H / 2) / cam.s;
    cam.s *= Math.exp(-e.deltaY * .0015); cam.s = Math.max(.002, Math.min(3, cam.s));
    cam.x = wx - (e.clientX - W / 2) / cam.s; cam.z = wz + (e.clientY - H / 2) / cam.s;
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { setRate(rate ? 0 : 8); e.preventDefault(); }
    const n = +e.key; if (n >= 1 && n <= 8) setRate(RATES[n - 1] || 0);
    if (e.key === 'v') setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
    if (e.key === 'f') fit();
  });
}

/* terrain: dots on land (brighter with height), faint depth dots near the shore, coast outline */
function bakeTerrain(m) {
  const n = 420, c = document.createElement('canvas'), k = n / Math.max(m.W, m.H);
  c.width = Math.ceil(m.W * k); c.height = Math.ceil(m.H * k);
  const t = c.getContext('2d'), img = t.createImageData(c.width, c.height), d = img.data;
  let hmax = 1; for (let j = 0; j < c.height; j += 4) for (let i = 0; i < c.width; i += 4) hmax = Math.max(hmax, m.h(-m.W / 2 + (i + .5) / k, m.H / 2 - (j + .5) / k));
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    const x = -m.W / 2 + (i + .5) / k, z = m.H / 2 - (j + .5) / k, h = m.h(x, z), o = (j * c.width + i) * 4;
    let a = 0;
    if (h >= 0) {
      const edge = m.h(x + 1 / k, z) < 0 || m.h(x - 1 / k, z) < 0 || m.h(x, z + 1 / k) < 0 || m.h(x, z - 1 / k) < 0;
      a = edge ? .55 : ((i + j * 3) % 2 ? .07 + .3 * Math.sqrt(h / hmax) : 0);
    } else if (h > -60 && (i * 7 + j * 13) % 5 === 0) a = .05;
    d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a * 255;
  }
  t.putImageData(img, 0, 0);
  return { c, k };
}

/* ------------------------------------------------------------------ loop
   The sim steps on a timer with real-time accounting (so x32 stays x32 even when frames are slow or throttled);
   drawing happens on animation frames. */
function stepLoop() {
  const now = performance.now(), dt = Math.min(.25, (now - (lastT || now)) / 1000); lastT = now;
  if (!sim || loading || sim.result) return;
  acc += dt * rate;
  let n = 0;
  while (acc >= DT && performance.now() - now < 12) { sim.step(); acc -= DT; n++; }
  if (acc > DT * 8) acc = DT * 8;                 // could not keep up: drop time rather than spiral
  if (n) stepMs = stepMs * .9 + (performance.now() - now) / n * .1;
  for (const e of sim.drainEvents()) onEvent(e);
}
setInterval(stepLoop, 8);
function frame() { requestAnimationFrame(frame); draw(); }

function onEvent(e) {
  const t = performance.now() / 1000;
  const vis = e.side === undefined || view === 'truth' || e.side === view || ['lightning', 'destroyed', 'hit', 'intercept', 'splash'].includes(e.type);
  if (!vis) return;
  if (e.type === 'scan' && e.phase === 'start' && (view === 'truth' || e.side === view)) fx.push({ k: 'bolt', a: e.from, b: e.pos, t, d: e.delay + .4 });
  if (e.type === 'scan' && e.phase === 'hit' && (view === 'truth' || e.side === view)) fx.push({ k: 'ring', p: e.pos, r: e.r, c: LIME, t, d: 1.6 });
  if (e.type === 'hit') fx.push({ k: 'burst', p: e.pos, c: CORAL, t, d: 1.2, s: 9 });
  if (e.type === 'intercept') fx.push({ k: 'burst', p: e.pos, c: WHITE, t, d: .8, s: 6 });
  if (e.type === 'destroyed') fx.push({ k: 'x', p: e.pos, t, d: 4 });
  if (e.type === 'lightning') fx.push({ k: 'flash', p: e.pos, r: e.r, t, d: .5 });
  if (e.type === 'launch' && (e.kind === 'oniks' || e.kind === 'tlam' || e.kind === 'slam')) fx.push({ k: 'ring', p: e.pos, r: 1500, c: e.side === 'coast' ? LIME : CORAL, t, d: .9 });
  if (e.type === 'gunfire') fx.push({ k: 'line', a: e.pos, b: e.to, c: 'rgba(255,255,255,.7)', t, d: .25 });
}

/* ------------------------------------------------------------------ draw */
const sideCol = (side) => view === 'truth' ? (side === 'coast' ? LIME : CORAL) : (side === view ? LIME : CORAL);
const SHORT = { hq: 'HQ', tel: 'TEL', radar: 'RDR', pantsir: 'SAM', catapult: 'CAT', drone: 'UAV', transloader: 'TLV', carrier: 'CVN', ddg: 'DDG', helo: 'HELO', fighter: 'FTR' };

function draw() {
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  // vignette
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .75);
  vg.addColorStop(0, 'rgba(22,24,20,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  if (!sim) return;
  const m = sim.map;
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  g.drawImage(terrain.c, sx(-m.W / 2), sy(m.H / 2), m.W * cam.s, m.H * cam.s);
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.font = "10px 'Geist Mono', monospace";
  roads(m); objectives(m); weather();
  const t = performance.now() / 1000;
  // units
  const pic = view === 'truth' ? null : sim.sides[view].contacts;
  for (const u of sim.list()) {
    if (u.aboard) continue;
    if (view === 'truth' || u.side === view) drawUnit(u, u.pos, sideCol(u.side), SHORT[u.type], 1);
  }
  if (pic) for (const c of pic.values()) drawContact(c);
  // missiles
  for (const p of sim.projectiles.values()) {
    if (view !== 'truth' && !sim.projVisible(view, p)) continue;
    const c = p.P.threat ? sideCol(p.side) : 'rgba(255,255,255,.85)';
    const L = Math.max(4, Math.min(40, p.spd * 6 * cam.s));
    const vx = p.vel[0], vz = p.vel[2], vl = Math.hypot(vx, vz) || 1;
    g.strokeStyle = c; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(sx(p.pos[0]), sy(p.pos[2])); g.lineTo(sx(p.pos[0] - vx / vl * L / cam.s), sy(p.pos[2] - vz / vl * L / cam.s)); g.stroke();
    g.fillStyle = c; g.fillRect(sx(p.pos[0]) - 1.5, sy(p.pos[2]) - 1.5, 3, 3);
  }
  effects(t);
  hud();
}

function roads(m) {
  if (!m.roads) return;
  g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1; g.setLineDash([2, 4]);
  for (const pl of m.roads) { g.beginPath(); pl.forEach((p, i) => i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1]))); g.stroke(); }
  g.setLineDash([]);
}
function objectives(m) {
  for (const o of sim.objectives) {
    const c = o.owner ? sideCol(o.owner) : 'rgba(255,255,255,.5)';
    g.strokeStyle = c; g.globalAlpha = .6; g.setLineDash([1, 3]);
    g.beginPath(); g.arc(sx(o.x), sy(o.z), Math.max(4, o.r * cam.s), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.globalAlpha = .7; g.fillStyle = c; g.fillText(o.name.toUpperCase(), sx(o.x) + Math.max(6, o.r * cam.s) + 3, sy(o.z) + 3);
    g.globalAlpha = 1;
  }
  const R = m.replenish;
  if (R) { g.strokeStyle = 'rgba(255,255,255,.3)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(sx(R.x), sy(R.z), R.r * cam.s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText('REPLENISH', sx(R.x) - 24, sy(R.z) + 3); }
}
function weather() {
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.setLineDash([1, 5]);
  for (const s of sim.weather.squalls) { g.beginPath(); g.arc(sx(s.x), sy(s.z), s.r * cam.s, 0, Math.PI * 2); g.stroke(); }
  g.setLineDash([]);
}

function drawUnit(u, p, col, tag, alpha) {
  const d = u.def, x = sx(p[0]), y = sy(p[2]);
  const dying = !u.alive;
  g.globalAlpha = dying ? .35 : alpha;
  const r = d.domain === 'sea' ? (u.type === 'carrier' ? 4.5 : 3.5) : d.domain === 'air' ? 2 : 2.5;
  g.fillStyle = col;
  if (d.domain === 'air') { g.beginPath(); g.moveTo(x + Math.sin(u.hdg) * 5, y - Math.cos(u.hdg) * 5); g.lineTo(x + Math.sin(u.hdg + 2.5) * 4, y - Math.cos(u.hdg + 2.5) * 4); g.lineTo(x + Math.sin(u.hdg - 2.5) * 4, y - Math.cos(u.hdg - 2.5) * 4); g.closePath(); g.fill(); }
  else g.fillRect(x - r, y - r, r * 2, r * 2);
  if (d.domain !== 'air' && u.speed > .5) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(u.hdg) * 9, y - Math.cos(u.hdg) * 9); g.stroke(); }
  // radar beam
  if (u.alive && d.sensors.radar && u.antW && !u.aboard) {
    const b = u.hdg + u.antA + u.antW * (sim.t - u.antT), L = Math.min(60, (d.sensors.radar.surf || d.sensors.radar.air) * cam.s * .25);
    g.strokeStyle = col; g.globalAlpha = .35; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(b) * L, y - Math.cos(b) * L); g.stroke(); g.globalAlpha = dying ? .35 : alpha;
  }
  if (show.rings && u.alive) {
    g.strokeStyle = col; g.globalAlpha = .18; g.setLineDash([1, 4]);
    for (const w in d.weapons) { const R = d.weapons[w].range * cam.s; if (R > 6) { g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke(); } }
    g.setLineDash([]); g.globalAlpha = dying ? .35 : alpha;
  }
  if (show.paths && u.path) {
    g.strokeStyle = col; g.globalAlpha = .3; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, y);
    for (let i = u.wi; i < u.path.length; i++) g.lineTo(sx(u.path[i][0]), sy(u.path[i][1]));
    g.stroke(); g.setLineDash([]); g.globalAlpha = dying ? .35 : alpha;
  }
  if (show.labels && cam.s > .004) {
    let s = tag;
    if (u.type === 'tel') s += ' ' + '▮'.repeat(u.ammo.oniks) + (u.elev >= 1.5 ? ' ↑' : '');
    if (u.type === 'transloader') s += ' ' + '▮'.repeat(u.cargo);
    if (u.type === 'ddg') s += ` ${u.ammo.sm6}/${u.ammo.strike}`;
    if (u.hp < u.hpMax && u.alive) s += ` ${Math.round(u.hp / u.hpMax * 100)}%`;
    g.fillStyle = col; g.globalAlpha = dying ? .35 : .8;
    g.fillText(s, x + 7, y - 5);
  }
  g.globalAlpha = 1;
}

function drawContact(c) {
  const x = sx(c.pos[0]), y = sy(c.pos[2]);
  const cls = c.conf >= CLASSIFY;
  const col = cls ? CORAL : WHITE;
  g.globalAlpha = c.dead ? .3 : .5 + .5 * c.conf;
  const er = c.err * cam.s;
  if (er > 3) { g.strokeStyle = col; g.globalAlpha *= .5; g.setLineDash([1, 3]); g.beginPath(); g.arc(x, y, er, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.globalAlpha = c.dead ? .3 : .5 + .5 * c.conf; }
  g.strokeStyle = col; g.lineWidth = 1;
  const r = c.dom === 'sea' ? 5 : 4;
  if (c.identified) { g.strokeRect(x - r - 2, y - r - 2, (r + 2) * 2, (r + 2) * 2); }
  if (c.dom === 'air') { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); g.stroke(); }
  else g.strokeRect(x - r, y - r, r * 2, r * 2);
  if (c.emitting) { g.beginPath(); g.arc(x, y, r + 5, -.6, .6); g.stroke(); g.beginPath(); g.arc(x, y, r + 5, Math.PI - .6, Math.PI + .6); g.stroke(); }
  if (show.labels) {
    g.fillStyle = col;
    g.fillText(cls ? `${c.track} · ${c.cls} ${c.conf.toFixed(2)}` : `${c.track} ? ${c.conf.toFixed(2)}`, x + r + 4, y - r);
  }
  g.globalAlpha = 1;
}

function effects(t) {
  fx = fx.filter(f => t - f.t < f.d);
  for (const f of fx) {
    const a = 1 - (t - f.t) / f.d;
    g.globalAlpha = a;
    if (f.k === 'burst') { g.fillStyle = f.c; const s = f.s * (1.5 - a * .5); g.fillRect(sx(f.p[0]) - s / 2, sy(f.p[2]) - s / 2, s, s); }
    else if (f.k === 'ring') { g.strokeStyle = f.c; g.beginPath(); g.arc(sx(f.p[0]), sy(f.p[2]), Math.max(3, f.r * cam.s * (1.2 - a * .6)), 0, Math.PI * 2); g.stroke(); }
    else if (f.k === 'x') { g.strokeStyle = CORAL; const x = sx(f.p[0]), y = sy(f.p[2]); g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke(); }
    else if (f.k === 'flash') { g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(sx(f.p[0]), sy(f.p[2]), f.r * cam.s, 0, Math.PI * 2); g.fill(); }
    else if (f.k === 'line') { g.strokeStyle = f.c; g.beginPath(); g.moveTo(sx(f.a[0]), sy(f.a[2])); g.lineTo(sx(f.b[0]), sy(f.b[2])); g.stroke(); }
    else if (f.k === 'bolt') {
      // the scan's lime lightning: a jagged path from the scanner to the point
      g.strokeStyle = LIME; g.lineWidth = 1.2; g.beginPath();
      const ax = sx(f.a[0]), ay = sy(f.a[2]), bx = sx(f.b[0]), by = sy(f.b[2]), n = 14, L = Math.hypot(bx - ax, by - ay);
      let seed = Math.floor(f.t * 1000);
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
      g.moveTo(ax, ay);
      for (let i = 1; i < n; i++) { const q = i / n; g.lineTo(ax + (bx - ax) * q + rnd() * L * .06, ay + (by - ay) * q + rnd() * L * .06); }
      g.lineTo(bx, by); g.stroke(); g.lineWidth = 1;
    }
  }
  g.globalAlpha = 1;
}

function hud() {
  const s = sim.summary(), t = sim.t, mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  const side = k => { const S = s.sides[k], by = Object.entries(S.by).map(([a, b]) => `${SHORT[a]} ${b}`).join('  '); return `${k.toUpperCase()}  SUP ${S.supply}  lost ${S.lost}\n${by}`; };
  $('hud').innerHTML = `<b>T+${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}  ${rate ? 'x' + rate : 'PAUSED'}</b>  ${view.toUpperCase()}\n` +
    `${side('coast')}\n${side('fleet')}\n` +
    `missiles ${sim.projectiles.size}  step ${stepMs.toFixed(2)} ms\n${map.name}`;
  const L = (sim.ai.coast ? sim.ai.coast.log.slice(-6).map(x => 'C ' + x) : []).concat(sim.ai.fleet ? sim.ai.fleet.log.slice(-6).map(x => 'F ' + x) : []);
  $('log').textContent = L.join('\n');
  if (sim.result) { $('res').style.display = 'block'; $('res').textContent = `${sim.result.winner.toUpperCase()} · ${sim.result.reason.toUpperCase()} · T+${mm}:${String(ss).padStart(2, '0')}`; }
  else if (!loading) $('res').style.display = 'none';
}

init();
