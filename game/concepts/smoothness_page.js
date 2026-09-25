/* Concept page: game/concepts/smoothness.html (see SMOOTHNESS.md). The engine as it is (NOW: the live Renderer,
   ModelLib and Terrain from game/src, untouched) against the fixes (NEW: smoothness_models.js, smoothness_terrain.js),
   one at a time, side by side (split through the subject) or as a frame-to-frame difference (what changed since the
   last frame, x6: a pop lights a whole part). An automatic dolly runs 20 km -> 30 m -> 20 km on a DDG (or the Nimitz);
   the readout measures the frame (CPU, GPU, synced), the subject's brightness against the distance (a pop is a step),
   and the pops (frames whose change is over 2.5 x the median of their neighbours). Bench: every configuration on the
   same fixed path at 1920 x 1080, frames synced (readPixels), with the pop count.

   Keys: Space dolly on/off · 1 NOW · 2 NEW · S split · D difference · M models mode · F fade-in · R prefetch ·
         A box filter · W sea fade · N subject · P still (game/shots/smooth_*.png) · H hide the panel · B bench.
   Console: SM (state, flags, renderer, still(name), dist(d), bench()). */
import { Renderer } from '../src/engine/renderer.js';
import { program } from '../src/engine/gl.js';
import { HEAD } from '../src/engine/shaders.js';
import { ModelLib } from '../src/engine/models.js';
import { SmoothModels } from './smoothness_models.js';
import { SmoothTerrain } from './smoothness_terrain.js';
import { loadMap } from '../src/world/maps.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const msg = s => { $('msg').textContent = s; };
msg('loading the map');
const map = await loadMap(Q.get('map') || 'strait');
const canvas = $('gl');
const R = new Renderer({ canvas, overlay: $('ov'), map });
const gl = R.gl, cam = R.camera;
cam.attach(canvas);
cam.edge = false;

let DM = null;
try { DM = await import('../src/data/models.js'); } catch (e) { console.warn('smoothness: data/models.js', e); }
const reg = M => { if (DM) { M.registerAll(DM.EXTRA_MODELS, DM.MODEL_INFO); } return M; };

/* the two worlds: NOW (the engine's own objects) and NEW (the concept's) */
const F = { mode: 'nested', fadeIn: 1, prefetch: 1, aa: 0, gamma: .6 };
const LIB = {
  now: { M: reg(R.models), T: R.terrain },
  new: { M: reg(new SmoothModels(R.G, F)), T: new SmoothTerrain(R.G, map) },
};
LIB.new.M.clock = () => t;         // the concept's fades run on the page's clock (the bench steps it 1/60 s a frame)
const TF = LIB.new.T.sm;            // terrain flags (seaFade, aa, gamma)
const use = k => { R.models = LIB[k].M; R.terrain = LIB[k].T; };

/* the scene: a DDG at the fleet's spawn, the Nimitz 1.1 km off her quarter */
const sp = map.spawns && map.spawns.fleet ? map.spawns.fleet : { x: 0, z: 0 };
const SUBJ = {
  ddg: { key: 'destroyer', T: [sp.x, 0, sp.z], hdg: .35, id: 1, near: 30, y: 9, yaw: 1.25 },
  cvn: { key: 'carrier', T: [sp.x + 820, 0, sp.z - 760], hdg: .35, id: 2, near: 70, y: 16, yaw: 1.3 },
};
function scene() {
  if (S.hideModels) return;
  for (const s of Object.values(SUBJ)) R.draw({ key: s.key, T: s.T, hdg: s.hdg, tint: 'own', id: s.id });
}

/* ---------- state ---------- */
const S = {
  view: 'new', split: Q.get('split') === '1', diff: false, lock: true, scale75: false,
  dolly: Q.get('dolly') !== '0', speed: 1, legS: 40, phase: 0, subj: Q.get('subj') || 'ddg', manual: null,
  measure: true,
};
if (Q.get('mode')) F.mode = Q.get('mode');
const FAR = 20000;
/* the dolly: log distance, eased at the ends; the lens comes down from ~55 degrees to ~8 as it closes */
function dollyPose(ph) {
  const s = SUBJ[S.subj], k = ph < 1 ? ph : 2 - ph, e = k * k * (3 - 2 * k);
  const d = Math.exp(Math.log(FAR) + (Math.log(s.near) - Math.log(FAR)) * e);
  return { d, pitch: .95 + (.14 - .95) * e, yaw: s.yaw + .3 * e, e };
}
function poseAt(d) {
  const s = SUBJ[S.subj], e = (Math.log(d) - Math.log(FAR)) / (Math.log(s.near) - Math.log(FAR));
  return { d, pitch: .95 + (.14 - .95) * e, yaw: s.yaw + .3 * e, e };
}
function setCam(p) {
  const s = SUBJ[S.subj];
  cam.minDist = 5;
  cam.set({ target: [s.T[0], s.y, s.T[2]], dist: p.d, yaw: p.yaw, pitch: p.pitch });
}

/* ---------- frame timing: CPU, GPU (timer query), and the page's frame interval ---------- */
const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const qPend = [], qPool = [];
let gpuMs = 0;
function gpuRead() {
  if (!tq) return;
  const dis = gl.getParameter(tq.GPU_DISJOINT_EXT);
  while (qPend.length && gl.getQueryParameter(qPend[0], gl.QUERY_RESULT_AVAILABLE)) { const q = qPend.shift(); if (!dis) gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; qPool.push(q); }
  if (dis) { qPool.push(...qPend); qPend.length = 0; }
}
const hist = { cpu: [], gpu: [], dt: [] };
const pushH = (a, v) => { a.push(v); if (a.length > 180) a.shift(); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

/* ---------- the difference view ---------- */
const VS_Q = HEAD + `out vec2 vUv; void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS_D = HEAD + `in vec2 vUv; out vec4 o; uniform sampler2D uA; uniform sampler2D uB; uniform float uK;
void main() { vec3 a = texture(uA, vUv).rgb, b = texture(uB, vUv).rgb; float d = dot(abs(a - b), vec3(.333)) * uK;
  o = vec4(vec3(a.g * .12) + vec3(d, d, d * .9), 1.0); }`;
const pDiff = program(gl, VS_Q, FS_D, 'concept.diff');
const tex = [null, null]; let texW = 0, texH = 0, texI = 0;
function diffPass() {
  const W = R.G.W, H = R.G.H;
  if (W !== texW || H !== texH) {
    for (let i = 0; i < 2; i++) {
      if (tex[i]) gl.deleteTexture(tex[i]);
      tex[i] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    texW = W; texH = H;
  }
  const cur = tex[texI], prev = tex[1 - texI];
  gl.bindTexture(gl.TEXTURE_2D, cur);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.useProgram(pDiff.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur); gl.uniform1i(pDiff.u.uA, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev); gl.uniform1i(pDiff.u.uB, 1);
  gl.uniform1f(pDiff.u.uK, 6);
  gl.bindVertexArray(null);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);
  texI = 1 - texI;
}

/* ---------- the subject's brightness and the frame-to-frame change round it (a pop is a spike) ---------- */
let rbuf = new Uint8Array(0), rprev = new Uint8Array(0), rW = 0, rH = 0;
function subjRect() {
  const s = SUBJ[S.subj], e = LIB.now.M.has(s.key) ? LIB.now.M.get(s.key) : null, q = [0, 0, 0];
  const c = [s.T[0], s.T[1] + (e ? e.center[1] : 0), s.T[2]];
  if (!cam.project(c, q)) return null;
  const k = R.G.H / cam.H, rpx = Math.max(40, Math.min(R.G.H * .45, (e ? e.radius : 60) * cam.fl / Math.max(1, q[2]) * k * .9));
  const x0 = Math.max(0, Math.round(q[0] * k - rpx)), x1 = Math.min(R.G.W, Math.round(q[0] * k + rpx));
  const y1 = Math.min(R.G.H, Math.round(R.G.H - (q[1] * k - rpx))), y0 = Math.max(0, Math.round(R.G.H - (q[1] * k + rpx)));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  return [x0, y0, x1 - x0, y1 - y0];
}
/* -> { lum, diff } over the subject's box: lum its mean brightness, diff the mean change since the last frame on a
   fixed 160 x 160 grid over the box (the box grows with the zoom: the grid keeps the comparison) */
const GR = 160;
function measure(reset) {
  const r = subjRect();
  if (!r) return null;
  const [x, y, w, h] = r;
  if (rbuf.length < w * h * 4) rbuf = new Uint8Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rbuf);
  if (rprev.length !== GR * GR) { rprev = new Uint8Array(GR * GR); reset = true; }
  let s = 0, d = 0;
  for (let j = 0; j < GR; j++) {
    const yy = Math.min(h - 1, Math.floor((j + .5) * h / GR));
    for (let k = 0; k < GR; k++) {
      const xx = Math.min(w - 1, Math.floor((k + .5) * w / GR)), i = (yy * w + xx) * 4, v = (rbuf[i] + rbuf[i + 1] + rbuf[i + 2]) / 3, q = j * GR + k;
      s += v; d += Math.abs(v - rprev[q]); rprev[q] = v;
    }
  }
  return { lum: s / (GR * GR), diff: reset ? 0 : d / (GR * GR) };
}
/* pops along a series: brightness steps (a frame whose brightness change is over 4 x the median change of the 20
   round it and over 3 % of the brightness) and change spikes (a frame whose change is over 2.5 x the median of the 20
   round it); maxStep: the largest brightness step (% of the brightness) */
function pops(series) {
  let n = 0, nd = 0, maxStep = 0; const at = [];
  const dl = series.map((p, i) => i ? p.lum - series[i - 1].lum : 0);
  for (let i = 10; i < series.length - 10; i++) {
    const a = [], b = [];
    for (let j = i - 10; j <= i + 10; j++) if (j !== i) { a.push(Math.abs(dl[j])); b.push(series[j].diff); }
    a.sort((x, y) => x - y); b.sort((x, y) => x - y);
    const rel = Math.abs(dl[i]) / Math.max(1, series[i].lum);
    if (Math.abs(dl[i]) > 4 * a[10] && rel > .03) { n++; at.push(Math.round(series[i].d)); maxStep = Math.max(maxStep, rel); }
    if (series[i].diff > 2.5 * b[10] && series[i].diff > 1) nd++;
  }
  return { n, nd, at, maxStep: Math.round(maxStep * 100) };
}

/* ---------- the loop ---------- */
let t = 0, last = performance.now(), leg = [], legs = {}, legKey = '';
const cfgKey = () => S.view === 'now' && !S.split ? 'now' : `new:${F.mode}${F.fadeIn ? '+f' : ''}${F.prefetch ? '+p' : ''}${F.aa ? '+aa' : ''}${TF.seaFade ? '+w' : ''}`;
function applyScale() {
  const base = S.lock ? 1080 / Math.max(1, canvas.clientHeight * R.G.dpr) : 1;
  const want = base * (S.scale75 ? .75 : 1) * Math.min(window.devicePixelRatio || 1, 2) / (R.G.dpr || 1);
  if (Math.abs(R.renderScale - want) > 1e-4) R.renderScale = want;
}
function render(dt) {
  applyScale();
  R.resize();
  TF.aa = F.aa; TF.gamma = F.gamma;
  const views = S.split ? ['now', 'new'] : [S.view];
  const W = R.G.W, H = R.G.H;
  for (let i = 0; i < views.length; i++) {
    use(views[i]);
    if (S.split) { gl.enable(gl.SCISSOR_TEST); gl.scissor(i ? W >> 1 : 0, 0, i ? W - (W >> 1) : W >> 1, H); }
    R.begin(t);
    scene();
    R.end();
  }
  gl.disable(gl.SCISSOR_TEST);
  use(S.view === 'now' && !S.split ? 'now' : 'new');
}
function frame() {
  const now = performance.now(), dtR = Math.min(.1, (now - last) / 1000); last = now;
  pushH(hist.dt, dtR * 1000);
  t += dtR;
  gpuRead();
  if (S.dolly && !S.bench) {
    const ph0 = S.phase;
    S.phase = (S.phase + dtR * S.speed / S.legS) % 2;
    if (S.phase < ph0 || (ph0 < 1 && S.phase >= 1)) endLeg();
    const p = dollyPose(S.phase); setCam(p);
    $('dist').value = Math.round(p.e * 1000);
  } else if (!S.bench) cam.update(dtR);
  if (!S.bench) {
    const q = tq && !qPend.length ? (qPool.pop() || gl.createQuery()) : null;
    if (q) gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
    const c0 = performance.now();
    render(dtR);
    pushH(hist.cpu, performance.now() - c0);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); qPend.push(q); }
    pushH(hist.gpu, gpuMs);
    if (S.measure && S.dolly) { const m = measure(!leg.length); if (m) leg.push({ d: cam.dist, e: dollyPose(S.phase).e, lum: m.lum, diff: m.diff }); }
    if (S.diff) diffPass();
    if (S.still) { const n = S.still; S.still = null; saveStill(n); }
    hud();
  }
  requestAnimationFrame(frame);
}
function endLeg() {
  if (leg.length > 40) { legs[cfgKey() + (S.phase >= 1 ? ':in' : ':out')] = leg; S.lastLeg = { key: cfgKey(), pops: pops(leg) }; }
  leg = [];
}
function saveStill(name) {
  const url = canvas.toDataURL('image/png');
  return fetch('/save?path=game/shots/smooth_' + name + '.png', { method: 'POST', body: url }).then(r => r.status);
}

/* ---------- HUD ---------- */
let hudT = 0;
function hud() {
  const now = performance.now(); if (now - hudT < 150) return; hudT = now;
  const M = R.models, N = LIB.new.M;
  const lp = S.lastLeg;
  const rows = [
    ['distance', `${cam.dist >= 1000 ? (cam.dist / 1000).toFixed(2) + ' km' : Math.round(cam.dist) + ' m'}`],
    ['frame', `${R.G.W} × ${R.G.H}`],
    ['cpu (render)', `${avg(hist.cpu).toFixed(1)} · p95 ${pct(hist.cpu, .95).toFixed(1)} ms`],
    ['gpu', tq ? `${avg(hist.gpu).toFixed(1)} · p95 ${pct(hist.gpu, .95).toFixed(1)} ms` : 'n/a'],
    ['interval', `${avg(hist.dt).toFixed(1)} · p95 ${pct(hist.dt, .95).toFixed(1)} ms`],
    ['model dots', `${(R.stats.points / 1000).toFixed(0)} k`],
    ['nested', `${N.nstats.layers} layers · ${(N.nstats.pts / 1e6).toFixed(2)} M${N.nstats.building ? ' · building' : ''}`],
    ['last leg', lp ? `${lp.pops.n} pops · max ${lp.pops.maxStep} % · ${lp.key}` : '-'],
  ];
  $('rd').innerHTML = rows.map(([a, b], i) => `<span>${a}</span><b class="${i === 7 && lp && lp.pops.n > 3 ? 'c' : ''}">${b}</b>`).join('');
  chart();
}
const cctx = $('chart').getContext('2d');
function chart() {
  const c = $('chart'), W = c.width, H = c.height, g = cctx;
  g.clearRect(0, 0, W, H);
  const draw = (L, col, a) => {
    if (!L || L.length < 2) return;
    let mx = 1; for (const p of L) mx = Math.max(mx, p.lum);
    g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = 2; g.beginPath();
    L.forEach((p, i) => { const x = p.e * W, y = H - 6 - p.lum / mx * (H - 12); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    // the pops as ticks along the bottom
    g.fillStyle = col; const P = pops(L);
    for (const p of L) if (P.at.includes(Math.round(p.d))) g.fillRect(p.e * W - 1, H - 14, 2, 14);
    g.globalAlpha = 1;
  };
  draw(legs['now:in'], 'rgba(255,255,255,.55)', 1);
  const nk = Object.keys(legs).filter(k => k.startsWith('new') && k.endsWith(':in')).pop();
  draw(nk ? legs[nk] : null, '#C6F432', 1);
  draw(leg, S.view === 'now' && !S.split ? 'rgba(255,255,255,.9)' : '#C6F432', .5);
}

/* ---------- controls ---------- */
function chips(el, items) {
  el.innerHTML = '';
  for (const it of items) {
    const c = document.createElement('span'); c.className = 'chip';
    c.innerHTML = `<i></i>${it.label}${it.key ? ` <kbd>${it.key}</kbd>` : ''}`;
    c.onclick = () => { it.set(); sync(); };
    it.el = c; el.appendChild(c);
  }
  return items;
}
const UI = [];
UI.push(...chips($('rView'), [
  { label: 'Now', key: '1', on: () => S.view === 'now' && !S.split, set: () => { S.view = 'now'; S.split = false; } },
  { label: 'New', key: '2', on: () => S.view === 'new' && !S.split, set: () => { S.view = 'new'; S.split = false; } },
  { label: 'Split', key: 'S', on: () => S.split, set: () => { S.split = !S.split; } },
  { label: 'Difference', key: 'D', on: () => S.diff, set: () => { S.diff = !S.diff; } },
]));
UI.push(...chips($('rMode'), [
  { label: 'Levels as now', on: () => F.mode === 'stock', set: () => { F.mode = 'stock'; } },
  { label: 'Cross-fade', on: () => F.mode === 'xfade', set: () => { F.mode = 'xfade'; } },
  { label: 'Nested', on: () => F.mode === 'nested', set: () => { F.mode = 'nested'; } },
]));
UI.push(...chips($('rFix'), [
  { label: 'Fade-in .3 s', key: 'F', on: () => !!F.fadeIn, set: () => { F.fadeIn = F.fadeIn ? 0 : 1; } },
  { label: 'Prefetch', key: 'R', on: () => !!F.prefetch, set: () => { F.prefetch = F.prefetch ? 0 : 1; } },
  { label: 'Box filter', key: 'A', on: () => !!F.aa, set: () => { F.aa = F.aa ? 0 : 1; } },
  { label: 'Sea row fade', key: 'W', on: () => !!TF.seaFade, set: () => { TF.seaFade = TF.seaFade ? 0 : 1; } },
]));
UI.push(...chips($('rDolly'), [
  { label: 'Dolly', key: 'Space', on: () => S.dolly, set: () => { S.dolly = !S.dolly; leg = []; } },
  { label: '×½', on: () => S.speed === .5, set: () => { S.speed = .5; } },
  { label: '×1', on: () => S.speed === 1, set: () => { S.speed = 1; } },
  { label: '×3', on: () => S.speed === 3, set: () => { S.speed = 3; } },
  { label: 'DDG', on: () => S.subj === 'ddg', set: () => { S.subj = 'ddg'; leg = []; } },
  { label: 'Nimitz', key: 'N', on: () => S.subj === 'cvn', set: () => { S.subj = 'cvn'; leg = []; } },
]));
UI.push(...chips($('rFrame'), [
  { label: '1080 lines', on: () => S.lock, set: () => { S.lock = !S.lock; } },
  { label: 'Scale .75 (auto quality)', on: () => S.scale75, set: () => { S.scale75 = !S.scale75; } },
]));
UI.push(...chips($('rBench'), [
  { label: 'Run bench', key: 'B', on: () => !!S.bench, set: () => { if (!S.bench) bench(); } },
  { label: 'Still', key: 'P', on: () => false, set: () => { S.still = `${S.subj}_${cfgKey().replace(/[:+]/g, '_')}_${Math.round(cam.dist)}m`; } },
]));
function sync() {
  for (const it of UI) it.el.classList.toggle('on', !!it.on());
  document.body.classList.toggle('split', S.split);
  const W = canvas.clientWidth;
  $('seam').style.left = (W >> 1) + 'px';
  $('tagNow').style.left = ((W >> 1) - 60) + 'px'; $('tagNew').style.left = ((W >> 1) + 14) + 'px';
}
$('dist').oninput = () => { S.dolly = false; const s = SUBJ[S.subj], e = $('dist').value / 1000; setCam(poseAt(Math.exp(Math.log(FAR) + (Math.log(s.near) - Math.log(FAR)) * e))); sync(); };
addEventListener('resize', sync);
addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  const k = ev.code;
  const hit = { Space: 'Dolly', Digit1: 'Now', Digit2: 'New', KeyS: 'Split', KeyD: 'Difference', KeyF: 'Fade-in .3 s', KeyR: 'Prefetch', KeyA: 'Box filter', KeyW: 'Sea row fade', KeyN: null, KeyB: 'Run bench', KeyP: 'Still' }[k];
  if (k === 'KeyN') { S.subj = S.subj === 'ddg' ? 'cvn' : 'ddg'; leg = []; sync(); ev.preventDefault(); return; }
  if (k === 'KeyM') { F.mode = { stock: 'xfade', xfade: 'nested', nested: 'stock' }[F.mode]; sync(); return; }
  if (k === 'KeyH') { document.body.classList.toggle('noui'); return; }
  if (hit) { const it = UI.find(u => u.el.textContent.startsWith(hit)); if (it) { it.set(); sync(); ev.preventDefault(); } }
});

/* the tests yield through messages, not frames (a hidden page gets no frames) */
const ych = new MessageChannel(); let ywake = null;
ych.port1.onmessage = () => { const w = ywake; ywake = null; if (w) w(); };
const yieldMsg = () => new Promise(r => { ywake = r; ych.port2.postMessage(0); });
/* ---------- bench: each configuration on one fixed path, frames synced ---------- */
const CFGS = [
  { name: 'now', view: 'now' },
  { name: 'xfade', view: 'new', mode: 'xfade', fadeIn: 1, prefetch: 1, aa: 0 },
  { name: 'nested', view: 'new', mode: 'nested', fadeIn: 1, prefetch: 1, aa: 0 },
  { name: 'nested+aa', view: 'new', mode: 'nested', fadeIn: 1, prefetch: 1, aa: 1 },
];
async function bench(o) {
  o = o || {};
  const frames = o.frames || 300, cfgs = o.cfgs ? CFGS.filter(c => o.cfgs.includes(c.name)) : CFGS;
  const keep = { view: S.view, split: S.split, diff: S.diff, F: Object.assign({}, F), sea: TF.seaFade, dolly: S.dolly };
  S.bench = true; S.split = false; S.diff = false; sync();
  const px = new Uint8Array(4), out = [];
  const oneFrame = yieldMsg;
  for (const c of cfgs) {
    S.view = c.view; if (c.mode) { F.mode = c.mode; F.fadeIn = c.fadeIn; F.prefetch = c.prefetch; F.aa = c.aa; }
    msg(`bench: ${c.name}`);
    const rec = { name: c.name, sync: [], cpu: [], series: [] };
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < frames; i++) {
        const ph = i / (frames - 1);                   // 20 km -> near in `frames` frames
        const p = dollyPose(ph); setCam(p);
        t += 1 / 60;
        const a = performance.now();
        render(1 / 60);
        const b = performance.now();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const s = performance.now() - a;
        if (pass === 1) { rec.sync.push(s); rec.cpu.push(b - a); const m = measure(i === 0); if (m) rec.series.push({ d: p.d, e: p.e, lum: m.lum, diff: m.diff }); }
        if ((i & 7) === 7) await oneFrame();
      }
    }
    const P = pops(rec.series);
    out.push({ name: c.name, avg: avg(rec.sync), p95: pct(rec.sync, .95), max: Math.max(...rec.sync), cpu: avg(rec.cpu), pops: P.n, spikes: P.nd, maxStep: P.maxStep, popAt: P.at.slice(0, 12), dots: R.stats.points });
    legs[c.name === 'now' ? 'now:in' : 'new:' + c.name + ':in'] = rec.series;
  }
  S.view = keep.view; S.split = keep.split; S.diff = keep.diff; Object.assign(F, keep.F); TF.seaFade = keep.sea; S.bench = false;
  msg('');
  const f1 = v => v.toFixed(1).padStart(5);
  $('bench').textContent = `${R.G.W}×${R.G.H} · ${frames} frames 20 km → ${SUBJ[S.subj].near} m · synced ms\n` +
    'config        avg   p95   max  cpu  pops\n' +
    out.map(r => `${r.name.padEnd(11)} ${f1(r.avg)} ${f1(r.p95)} ${f1(r.max)} ${f1(r.cpu)} ${String(r.pops).padStart(4)} ${String(r.maxStep).padStart(5)} ${String(r.spikes).padStart(6)}`).join('\n');
  sync();
  window.SM.lastBench = out;
  return out;
}

/* a camera cut with cold caches (fresh libraries): 20 km for 20 frames, then 70 m for 120 frames. After the cut the
   picture should settle at once or fade into place, not arrive in visible steps: counted as the frames after the
   first whose brightness steps by over 3 %, and the last frame that still changes by over 1 grey level */
async function jump(o) {
  o = o || {};
  const out = [], near = o.near || 70;
  const keep = { view: S.view, F: Object.assign({}, F), dolly: S.dolly };
  S.bench = true; S.dolly = false;
  for (const c of (o.cfgs ? CFGS.filter(c => o.cfgs.includes(c.name)) : CFGS)) {
    // fresh caches: nothing sampled yet (what a first visit to a unit costs)
    const dispose = M => { for (const e of M.entries.values()) { M._free(e); for (const P of e.parts) if (P.nest && P.nest.vao) { gl.deleteVertexArray(P.nest.vao); gl.deleteBuffer(P.nest.vb); } } };
    if (c.view === 'now') { dispose(LIB.now.M); LIB.now.M = reg(new ModelLib(R.G)); }
    else { dispose(LIB.new.M); const M = new SmoothModels(R.G, F); M.clock = () => t; M.lodPxN = LIB.new.M.lodPxN; LIB.new.M = reg(M); F.mode = c.mode; F.fadeIn = c.fadeIn; F.prefetch = c.prefetch; F.aa = c.aa; }
    S.view = c.view;
    const ser = [];
    for (let i = 0; i < 140; i++) {
      setCam(i < 20 ? poseAt(FAR) : poseAt(near));
      t += 1 / 60;
      render(1 / 60);
      const m = measure(i === 20);
      if (i >= 20 && m) ser.push(m);
      if ((i & 7) === 7) await yieldMsg();
    }
    let steps = 0, lastChange = 0, maxStep = 0;
    for (let i = 2; i < ser.length; i++) {
      const rel = Math.abs(ser[i].lum - ser[i - 1].lum) / Math.max(1, ser[i].lum);
      if (rel > .03) steps++;
      maxStep = Math.max(maxStep, rel);
      if (ser[i].diff > 1) lastChange = i;
    }
    out.push({ name: c.name, steps, maxStep: Math.round(maxStep * 100), settleFrames: lastChange, lum0: +ser[1].lum.toFixed(1), lumEnd: +ser[ser.length - 1].lum.toFixed(1) });
  }
  S.view = keep.view; Object.assign(F, keep.F); S.dolly = keep.dolly; S.bench = false;
  return out;
}

/* the sea (and the ground) with the camera still: what changes is the swell, the flicker, the rows. A "blink" is a
   pixel that changes by over 48 grey levels from one frame to the next (a return switched on or off, or snapped a
   pixel over); a smooth sea changes by small steps instead. Configs: [name, TF.seaFade, F.aa] */
async function seaTest(o) {
  o = o || {};
  const d = o.dist || 600, frames = o.frames || 90, W = R.G.W, H = R.G.H, w = W >> 1, h = H >> 1, x0 = W >> 2, y0 = H >> 2;
  const buf = new Uint8Array(w * h * 4), prev = new Uint8Array(w * h);
  const keep = { view: S.view, sea: TF.seaFade, aa: F.aa, dolly: S.dolly, hide: S.hideModels };
  S.bench = true; S.dolly = false; S.hideModels = o.models ? false : true;
  const out = [];
  for (const [name, view, sea, aa] of o.cfgs || [['now', 'now', 0, 0], ['sea fade', 'new', 1, 0], ['box filter', 'new', 0, 1], ['both', 'new', 1, 1]]) {
    S.view = view; TF.seaFade = sea; F.aa = aa;
    setCam(Object.assign(poseAt(d), o.pitch ? { pitch: o.pitch } : {}));
    let blinks = 0, small = 0, tot = 0;
    for (let i = 0; i < frames; i++) {
      t += 1 / 60;
      render(1 / 60);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let j = 0, k = 0; j < buf.length; j += 4, k++) {
        const v = buf[j + 1];
        if (i > 0) { const dd = Math.abs(v - prev[k]); tot += dd; if (dd > 48) blinks++; else if (dd > 4) small++; }
        prev[k] = v;
      }
      if ((i & 7) === 7) await yieldMsg();
    }
    const n = (frames - 1) * w * h;
    out.push({ name, blinksPerMpx: Math.round(blinks / n * 1e6), smallPerMpx: Math.round(small / n * 1e6), meanChange: +(tot / n).toFixed(3) });
  }
  S.view = keep.view; TF.seaFade = keep.sea; F.aa = keep.aa; S.dolly = keep.dolly; S.hideModels = keep.hide; S.bench = false;
  return out;
}

window.SM = { S, F, TF, R, LIB, SUBJ, bench, jump, seaTest, still: n => { S.still = n; }, dist: d => { S.dolly = false; setCam(poseAt(d)); }, legs, pops, dollyPose, measure, render, setCam };
sync();
msg('');
requestAnimationFrame(frame);
