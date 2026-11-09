/* Viewer for burke_structure.js: the DDG-51's plating as dots and hairlines (Point Cloud look), coloured by
   structure, thickness, steel grade or one compartment's boundary. URL: ?view=iso|profile|plan|section
   &mode=struct|thick|mat|comp &cut=<x> &sel=<compartment id> &clean=1 &still=<name> (saves game/shots/<name>.png) */
const B = (await import('./burke_structure.js?v=' + Date.now())).default;
const PN = B.PANELS, CM = B.COMPS;
const $ = id => document.getElementById(id);
const cv = $('c'), ov = $('ov'), o2 = ov.getContext('2d');
const gl = cv.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
const Q = new URLSearchParams(location.search);

/* ------------------------------------------------------------------ colours */
const INK = [233, 233, 226].map(v => v / 255), LIME = [198, 244, 50].map(v => v / 255), CORAL = [255, 106, 61].map(v => v / 255);
const KB = { shell: .62, deck: .34, bulkhead: .55, enclosure: .6, girder: .4, house: .5, appendage: .5, dome: .28 };
const GROUP = { shell: 'shell', appendage: 'shell', dome: 'shell', deck: 'deck', bulkhead: 'bhd', enclosure: 'bhd', girder: 'bhd', house: 'house' };
const st = { mode: Q.get('mode') || 'struct', cut: +(Q.get('cut') ?? 78), slab: 0, sel: -1, show: { shell: 1, deck: 1, bhd: 1, house: 1, wire: 1 } };
if (Q.get('sel')) st.sel = CM.findIndex(c => c.id === Q.get('sel'));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function panelColour(p) {
  if (!st.show[GROUP[p.kind]]) return null;
  let c, a = 1;
  if (st.mode === 'struct') {
    c = p.kind === 'bulkhead' ? mixc(INK, LIME, .85) : p.kind === 'enclosure' ? LIME : INK;
    a = p.kind === 'bulkhead' || p.kind === 'enclosure' ? .75 : KB[p.kind] * (p.wet ? .8 : 1);
    if (p.open) { c = CORAL; a = .5; }
  } else if (st.mode === 'thick') {
    if (p.open || p.mat === 'SDRW') { c = CORAL; a = .4; }
    else if (p.t >= 15) { c = LIME; a = .95; }
    else { c = INK; a = .12 + .8 * Math.max(0, Math.min(1, (p.t - 3) / 10)); }
  } else if (st.mode === 'mat') {
    const M = { HY80: [LIME, .95], HSLA80: [INK, .72], HTS: [INK, .38], OS: [INK, .18], SDRW: [CORAL, .45] }[p.mat] || [CORAL, .35];
    c = M[0]; a = M[1];
  } else {
    c = INK; a = KB[p.kind] * .35;
  }
  if (st.sel >= 0) {
    if (p.sides.includes(st.sel)) { c = LIME; a = Math.max(.8, a); }
    else a *= st.mode === 'comp' ? .5 : .3;
  }
  return c.map(v => v * a);
}

/* ------------------------------------------------------------------ geometry: dots and hairlines */
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const DENS = 5.5;                        // dots per m^2
const dotP = [], dotI = [], lnP = [], lnI = [];
function triDots(a, b, c, pi) {
  const A = Math.hypot(...cross(sub(b, a), sub(c, a))) / 2; let n = A * DENS; n = Math.floor(n) + (rnd() < n % 1 ? 1 : 0);
  for (let k = 0; k < n; k++) { let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } for (let d = 0; d < 3; d++) dotP.push(a[d] + (b[d] - a[d]) * u + (c[d] - a[d]) * v); dotI.push(pi); }
}
function polyDots(P, n, pi, area) {      // rejection sampling in the panel plane (any simple polygon)
  const e1 = nrm(Math.abs(n[1]) < .9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])), e2 = cross(n, e1);
  const q = P.map(p => [dot3(p, e1), dot3(p, e2)]);
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [u, v] of q) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const w = dot3(P[0], n); let want = area * DENS; want = Math.floor(want) + (rnd() < want % 1 ? 1 : 0);
  for (let k = 0, tries = 0; k < want && tries < want * 20; tries++) {
    const u = u0 + (u1 - u0) * rnd(), v = v0 + (v1 - v0) * rnd();
    let inside = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > v) !== (q[j][1] > v) && u < (q[j][0] - q[i][0]) * (v - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) inside = !inside;
    if (!inside) continue;
    for (let d = 0; d < 3; d++) dotP.push(e1[d] * u + e2[d] * v + n[d] * w); dotI.push(pi); k++;
  }
}
const seg = (a, b, pi) => { lnP.push(...a, ...b); lnI.push(pi, pi); };
for (const p of PN) {
  if (p.poly) { polyDots(p.poly, p.n, p.i, p.area); for (let i = 0; i < p.poly.length; i++) seg(p.poly[i], p.poly[(i + 1) % p.poly.length], p.i); }
  else {
    const [a, b] = p.strip;
    for (let k = 0; k < a.length - 1; k++) { triDots(a[k], a[k + 1], b[k + 1], p.i); triDots(a[k], b[k + 1], b[k], p.i); seg(a[k], a[k + 1], p.i); seg(b[k], b[k + 1], p.i); }
    seg(a[0], b[0], p.i); seg(a[a.length - 1], b[b.length - 1], p.i);
  }
}
// the waterline, both sides, as its own line (index -1)
const WL = B.WATERLINE.points;
for (const s of [1, -1]) for (let i = 0; i < WL.length - 1; i++) { lnP.push(WL[i][0], .02, s * (WL[i][2] + .03), WL[i + 1][0], .02, s * (WL[i + 1][2] + .03)); lnI.push(-1, -1); }
const ND = dotI.length, NL = lnI.length;

/* ------------------------------------------------------------------ GL */
const VS = `#version 300 es
in vec3 aP; in vec3 aC; uniform mat4 uM; uniform float uSize; out vec3 vC; out float vX;
void main() { vC = aC; vX = aP.x; gl_Position = uM * vec4(aP, 1.); gl_PointSize = uSize; }`;
const FS = `#version 300 es
precision highp float; in vec3 vC; in float vX; uniform float uCut, uSlab, uPts; out vec4 o;
void main() {
  if (uSlab > 0. ? abs(vX - uCut) > uSlab : vX > uCut) discard;
  if (uPts > .5) { vec2 d = gl_PointCoord - .5; if (dot(d, d) > .25) discard; }
  o = vec4(vC, 1.);
}`;
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }
  gl.bindAttribLocation(p, 0, 'aP'); gl.bindAttribLocation(p, 1, 'aC'); gl.linkProgram(p); return p;
}
const PR = prog(VS, FS), U = n => gl.getUniformLocation(PR, n);
function vao(pos) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  return { v, cb };
}
const VD = vao(dotP), VL = vao(lnP);
function recolour() {
  const pc = PN.map(panelColour);
  const cd = new Float32Array(ND * 3); for (let i = 0; i < ND; i++) { const c = pc[dotI[i]]; if (c) cd.set(c, i * 3); }
  const cl = new Float32Array(NL * 3), wl = INK.map(v => v * .5), lm = st.show.wire ? .2 : 0;
  for (let i = 0; i < NL; i++) { const pi = lnI[i]; const c = pi < 0 ? wl : pc[pi]; if (c) cl.set(pi < 0 ? c : c.map(v => v * lm), i * 3); }
  gl.bindBuffer(gl.ARRAY_BUFFER, VD.cb); gl.bufferData(gl.ARRAY_BUFFER, cd, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, VL.cb); gl.bufferData(gl.ARRAY_BUFFER, cl, gl.DYNAMIC_DRAW);
  dirty = true;
}

/* ------------------------------------------------------------------ camera */
const cam = { yaw: -2.25, pitch: .42, dist: 215, tgt: [0, 2, 0], fov: .5 };
const VIEWS = {
  iso: { yaw: .55, pitch: .36, dist: 190, tgt: [2, 2, 0], slab: 0 },
  profile: { yaw: 0, pitch: 0, dist: 300, tgt: [0, 6, 0], slab: 0 },
  plan: { yaw: 0, pitch: 1.5707, dist: 300, tgt: [0, 0, 0], slab: 0 },
  section: { yaw: Math.PI / 2, pitch: 0, dist: 78, tgt: [0, 6, 0], slab: 1.25 },
};
function setView(k) {
  const v = VIEWS[k]; Object.assign(cam, { yaw: v.yaw, pitch: v.pitch, dist: v.dist, tgt: v.tgt.slice() }); st.slab = v.slab; st.view = k;
  // a section at the bow tip (the slider's "show everything" end) is empty: start it amidships
  if (k === 'section') { if (Math.abs(st.cut) > 70) { st.cut = 0; $('cut').value = 0; } cam.tgt[0] = st.cut; }
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.v === k)); dirty = true;
}
function matrix(w, h) {
  const cp = Math.cos(cam.pitch), eye = [cam.tgt[0] + cam.dist * cp * Math.sin(cam.yaw), cam.tgt[1] + cam.dist * Math.sin(cam.pitch), cam.tgt[2] + cam.dist * cp * Math.cos(cam.yaw)];
  const f = nrm(sub(cam.tgt, eye)); let up = [0, 1, 0]; if (Math.abs(f[1]) > .999) up = [-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)];
  const s = nrm(cross(f, up)), u = cross(s, f);
  const V = [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot3(s, eye), -dot3(u, eye), dot3(f, eye), 1];
  const n = .5, fa = 2000, t = 1 / Math.tan(cam.fov / 2), a = w / h;
  const Pm = [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
  const M = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) M[c * 4 + r] += Pm[k * 4 + r] * V[c * 4 + k];
  return M;
}
const project = (M, p, w, h) => { const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], ww = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return ww <= 0 ? null : [(x / ww * .5 + .5) * w, (1 - (y / ww * .5 + .5)) * h]; };

/* ------------------------------------------------------------------ draw */
let dirty = true, W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  for (const c of [cv, ov]) { c.width = W * DPR; c.height = H * DPR; }
  dirty = true;
}
addEventListener('resize', resize); resize();
const deckY = x => { const u = x / 77.6; return 6.5 + 1.1 * u + 2.7 * Math.pow(Math.max(0, (u - .3) / .7), 2); };
function draw() {
  gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(11 / 255, 12 / 255, 10 / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.useProgram(PR);
  const M = matrix(cv.width, cv.height);
  gl.uniformMatrix4fv(U('uM'), false, M); gl.uniform1f(U('uCut'), st.cut); gl.uniform1f(U('uSlab'), st.slab);
  // hairlines additive, dots with max (the Point Cloud look: dots never bloom into each other)
  gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1f(U('uPts'), 0); gl.uniform1f(U('uSize'), 1);
  gl.bindVertexArray(VL.v); gl.drawArrays(gl.LINES, 0, NL);
  gl.blendEquation(gl.MAX); gl.uniform1f(U('uPts'), 1); gl.uniform1f(U('uSize'), Math.max(1.6, Math.min(3.2, 330 / cam.dist)) * DPR);
  gl.bindVertexArray(VD.v); gl.drawArrays(gl.POINTS, 0, ND);
  // labels: watertight bulkheads (frame numbers), the waterline, the cut
  o2.setTransform(DPR, 0, 0, DPR, 0, 0); o2.clearRect(0, 0, W, H);
  o2.font = '10px "Geist Mono", monospace'; o2.textAlign = 'center';
  const M2 = matrix(W, H);
  for (const b of B.BULKHEADS) {
    if (st.slab > 0 ? Math.abs(b.x - st.cut) > st.slab : b.x > st.cut) continue;
    const p = project(M2, [b.x, deckY(b.x) + (st.view === 'plan' ? 0 : 1.2), st.view === 'plan' ? -11.5 : 0], W, H); if (!p) continue;
    o2.fillStyle = 'rgba(198,244,50,.8)'; o2.fillText('fr ' + b.k, p[0], p[1] - 4);
  }
  const wx = st.view === 'section' ? st.cut : -77.6, pw = project(M2, [wx, 0, st.view === 'section' ? -9.6 : st.view === 'plan' ? 0 : 9], W, H);
  if (pw && st.view !== 'plan') { o2.fillStyle = 'rgba(233,233,226,.55)'; o2.textAlign = 'right'; o2.fillText('WL', pw[0] - 6, pw[1] + 3); }
}
function frame() { if (dirty) { dirty = false; draw(); } requestAnimationFrame(frame); }

/* ------------------------------------------------------------------ UI */
const r0 = v => Math.round(v).toLocaleString('en-US');
function readout() {
  const S = B.STATS, s = st.sel >= 0 ? CM[st.sel] : null;
  let h = `<div>panels <b>${r0(S.panels)}</b> · strips <b>${r0(S.strips)}</b></div>
    <div>compartments <b>${S.compartments}</b> · closed volume <b>${r0(S.enclosedVolume)} m³</b></div>
    <div>plating <b>${r0(S.plateArea)} m²</b> · open <b>${r0(S.openArea)} m²</b></div>
    <div>steel · plate <b>${r0(S.plateSteel_t)} t</b> · stiffeners <b>${r0(S.stiffenerSteel_t)} t</b></div>
    <div>displacement (model hull) <b>${r0(S.displacement_t)} t</b></div>
    <div>LOA <b>${B.META.loa} m</b> · LWL <b>${B.META.lwl} m</b> · B <b>${B.META.beamDeck}/${B.META.beamWL} m</b></div>
    <div>depth <b>${B.META.depth} m</b> · T <b>${B.META.draughtHull} / ${B.META.draughtDome} m</b> · frames <b>${B.META.frameSpacing} m</b></div>`;
  if (s) h += `<hr><div class="lime"><b>${s.name}</b></div><div>${s.id} · <b>${s.navy}</b></div>
    <div>volume <b>${r0(s.vol)} m³</b> · boundary <b>${r0(s.area)} m²</b></div>
    <div>x <b>${s.box ? s.box.x.map(v => v.toFixed(1)).join(' … ') : '-'}</b> · y <b>${s.box ? s.box.y.map(v => v.toFixed(1)).join(' … ') : '-'}</b></div>`;
  $('rd').innerHTML = h;
}
function list() {
  const rows = CM.filter(c => c.kind !== 'outside').sort((a, b) => (b.box ? b.box.x[1] : 99) - (a.box ? a.box.x[1] : 99) || (a.box && b.box ? a.box.y[0] - b.box.y[0] : 0));
  $('list').innerHTML = rows.map(c => `<div data-i="${c.idx}" class="${c.idx === st.sel ? 'sel' : ''}"><span>${c.navy.padEnd(10, ' ')} ${c.name}</span><span>${r0(c.vol)}</span></div>`).join('');
}
$('list').addEventListener('click', e => { const d = e.target.closest('[data-i]'); if (!d) return; const i = +d.dataset.i; st.sel = st.sel === i ? -1 : i; list(); readout(); recolour(); });
function legend() {
  const L = {
    struct: [['Shell', 'rgba(233,233,226,.62)'], ['Decks', 'rgba(233,233,226,.34)'], ['WT bulkheads', '#C6F432'], ['Deckhouse', 'rgba(233,233,226,.5)'], ['Exhaust openings', '#FF6A3D']],
    thick: [['≥ 15 mm (keel, sheer strake, stringer)', '#C6F432'], ['12.7 mm', 'rgba(233,233,226,.9)'], ['9.5 mm', 'rgba(233,233,226,.64)'], ['6.4 mm', 'rgba(233,233,226,.4)'], ['3.2 mm (hangar doors)', 'rgba(233,233,226,.15)']],
    mat: [['HY-80', '#C6F432'], ['HSLA-80', 'rgba(233,233,226,.72)'], ['HTS', 'rgba(233,233,226,.38)'], ['OS (mild)', 'rgba(233,233,226,.18)'], ['Dome window', '#FF6A3D']],
    comp: [['Selected compartment boundary', '#C6F432'], ['Pick one from the list', 'rgba(233,233,226,.3)']],
  }[st.mode];
  $('legend').innerHTML = L.map(([t, c]) => `<div><i style="background:${c}"></i>${t}</div>`).join('');
}
$('mode').value = st.mode;
$('mode').onchange = e => { st.mode = e.target.value; legend(); recolour(); };
$('cut').value = st.cut;
$('cut').oninput = e => { st.cut = +e.target.value; if (st.view === 'section') cam.tgt[0] = st.cut; dirty = true; };
document.querySelectorAll('#views button').forEach(b => b.onclick = () => setView(b.dataset.v));
document.querySelectorAll('#groups button').forEach(b => b.onclick = () => { const g = b.dataset.g; st.show[g] = st.show[g] ? 0 : 1; b.classList.toggle('on', !!st.show[g]); recolour(); });
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', () => drag = null);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) { const k = cam.dist * .0016; cam.tgt[0] -= Math.cos(cam.yaw) * dx * k; cam.tgt[2] += Math.sin(cam.yaw) * dx * k; cam.tgt[1] += dy * k; }
  else { cam.yaw -= dx * .005; cam.pitch = Math.max(-1.55, Math.min(1.5707, cam.pitch + dy * .005)); }
  dirty = true;
});
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(8, Math.min(900, cam.dist * Math.exp(e.deltaY * .001))); dirty = true; }, { passive: false });
addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  const v = { 1: 'iso', 2: 'profile', 3: 'plan', 4: 'section' }[e.key]; if (v) setView(v);
  if (e.key === '[' || e.key === ']') { st.cut = Math.max(-78, Math.min(78, st.cut + (e.key === ']' ? 2.44 : -2.44))); $('cut').value = st.cut; if (st.view === 'section') cam.tgt[0] = st.cut; dirty = true; }
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
});
async function still(name) {
  draw();
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const x = c.getContext('2d'); x.drawImage(cv, 0, 0); x.drawImage(ov, 0, 0);
  const r = await fetch('/save?path=' + encodeURIComponent('game/shots/' + name + '.png'), { method: 'POST', body: c.toDataURL('image/png') });
  return r.status;
}
$('still').onclick = () => still('burke_' + (st.view || 'iso') + '_' + st.mode);
window.BURKE_VIEW = { B, st, cam, setView, still, recolour };
if (Q.get('clean')) document.body.classList.add('clean');
setView(Q.get('view') || 'iso'); legend(); list(); readout(); recolour(); requestAnimationFrame(frame);
if (Q.get('still')) { await document.fonts.ready; setTimeout(() => still(Q.get('still')).then(s => { document.title = 'saved ' + s; }), 300); }
