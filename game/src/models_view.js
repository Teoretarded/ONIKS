/* ONIKS · model viewer (game/models.html). Point Cloud dots with the films' CPU raster (PointBuf,
   max blend), a slowly orbiting camera, state sliders, and the Inspect effects driven by anatomy.js:
   E explode (parts float apart in w0 order and come home in reverse, lime placards), X X-ray (a lime
   scan front opens the shells, reveals interior parts and container contents), W wreck.
   URL: ?m=key &e=1 &x=1 &w=1 (start exploded / X-rayed / wrecked, settled) &yaw=deg &pitch=deg &dist=m
        &tgt=x,y,z &st=k:v,k:v &s=spacing multiplier &spd=rad/s (0 = still) &ui=0 &still=1 (save a PNG to
        game/shots/models_<key>[_e][_x][_w].png once settled) */
import { ALL_MODELS, MODEL_STATES, MODEL_INFO, wreckOf, makeModel } from './data/models.js';
import { ANATOMY, explodeK, xrayOf, anchorOf, validateAnatomy, entryOf, fitView } from './data/anatomy.js';

const { V, R, X, Cam } = window.M3;
const GEO = window.GEO;
const Q = new URLSearchParams(location.search);
const num = (k, d) => Q.has(k) ? parseFloat(Q.get(k)) : d;
const $ = id => document.getElementById(id);
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const T3 = p => X.make(R.I(), p);
const DEG = Math.PI / 180;
const LIME = [198, 244, 50], WH = [238, 238, 228], CORAL = [255, 106, 61];

/* ---------- stage ---------- */
const stage = $('stage');
let SK = 1, SX0 = 0, SY0 = 0;
function fit() { SK = Math.min(innerWidth / 1920, innerHeight / 1080); SX0 = (innerWidth - 1920 * SK) / 2; SY0 = (innerHeight - 1080 * SK) / 2; stage.style.transform = `translate(${SX0}px, ${SY0}px) scale(${SK})`; }
addEventListener('resize', fit); fit();
if (Q.get('ui') === '0') stage.classList.add('noui');

const GROUPS = [
  ['Coast', ['tel', 'transloader', 'radar', 'pantsir', 'drone', 'catapult', 'hq', 'bal', 'ssk', 'kornet']],
  ['Fleet', ['destroyer', 'carrier', 'helo', 'fighter', 'aew', 'ssn', 'lhd', 'lcac', 'acv']],
  ['Munitions', ['oniks', 'tlc', 'oniks_booster', 'pantsir_missile', 'sm6', 'mk72', 'mk41_can', 'strike_missile', 'essm', 'slam', 'hellfire', 'aam', 'shell', 'kh35', 'kalibr', 'torpedo533', 'vpt_can', 'kornet_msl']],
  ['Structures', ['depot', 'port', 'lighthouse', 'radar_hill', 'airfield']],
];
const KEYS = GROUPS.flatMap(g => g[1]);

/* ---------- models, samples ---------- */
const ENT = {};
function ent(mk) {
  if (!ENT[mk]) { const t0 = performance.now(); const m = makeModel(mk); ENT[mk] = { mk, m, wr: null, samp: new Map(), bounds: null, build: performance.now() - t0 }; }
  return ENT[mk];
}
const baseKey = mk => (MODEL_INFO[mk] && MODEL_INFO[mk].base) || mk;
/* dot spacing: the model's near spacing, opened up with distance so dots stay ~2.3 px apart like the
   films (quantised in steps of 1.25 so zooming does not resample every frame) */
let SP_VIEW = 0;
const spacing = mk => {
  const inf = MODEL_INFO[mk] || MODEL_INFO[baseKey(mk)], s0 = (inf ? inf.s[0] : .05) * num('s', 1);
  if (!SP_VIEW || SP_VIEW <= s0) return s0;
  return s0 * Math.pow(1.25, Math.round(Math.log(SP_VIEW / s0) / Math.log(1.25)));
};
const DYN_SKIP = new Set(['wreck', 'xray']);
const dynKey = st => Object.keys(st).filter(k => !DYN_SKIP.has(k)).sort().map(k => k + ':' + (typeof st[k] === 'number' ? st[k].toFixed(3) : Array.isArray(st[k]) ? st[k].map(v => +(+v).toFixed(2)).join('/') : st[k])).join(',');
function partPts(E, part, st, sp, seed) {
  const dk = part.dyn ? dynKey(st) : '';
  let c = E.samp.get(part.name);
  if (!c || c.dk !== dk || c.sp !== sp) {
    const smp = GEO.sample({ parts: [part] }, sp, seed, st)[0];
    c = { pts: smp.pts, dk, sp }; E.samp.set(part.name, c);
  }
  return c.pts;
}
/* a whole model at one state baked into one cloud (X-ray contents) */
const BAKED = new Map();
function baked(mk, st) {
  const sp = spacing(mk) * 1.2, k = mk + '|' + JSON.stringify(st) + '|' + sp.toFixed(4);
  if (BAKED.has(k)) return BAKED.get(k);
  const m = makeModel(mk), out = [];
  GEO.sample(m, sp, 77, st).forEach(s => {
    if (s.part.show && !s.part.show(st)) return;
    const T = GEO.partXf(X.make(), s.part, st), P = s.pts;
    for (let i = 0; i < P.length; i += 6) { const q = X.ap(T, [P[i], P[i + 1], P[i + 2]]), n = X.dir(T, [P[i + 3], P[i + 4], P[i + 5]]); out.push(q[0], q[1], q[2], n[0], n[1], n[2]); }
  });
  const r = { pts: new Float32Array(out), sp };
  BAKED.set(k, r); return r;
}

/* ---------- state ---------- */
let key = KEYS.includes(Q.get('m')) ? Q.get('m') : 'tel';
const USER = {};                                        // slider overrides, per model key
if (Q.has('st')) { const o = {}; for (const kv of Q.get('st').split(',')) { const [k, v] = kv.split(':'); o[k] = v === 'true' ? true : v === 'false' ? false : parseFloat(v); } USER[key] = o; }
const S = { e: 0, eT: 0, x: 0, xT: 0, w: 0, wT: 0, orbit: num('spd', .12) !== 0, spd: num('spd', .12) || .12, yaw: 0, pitch: 0, dist: 0, tgt: [0, 0, 0], settle: 0, t: 0 };
if (Q.get('e') === '1') S.e = S.eT = 1;
if (Q.get('x') === '1') S.x = S.xT = 1;
if (Q.get('w') === '1') S.w = S.wT = 1;
const cutOn = () => S.eT > 0 || S.e > 0 || S.xT > 0 || S.x > 0;
const modelKey = () => cutOn() ? ANATOMY[key].model : key;
function defaults(mk) {
  const d = {}, f = MODEL_STATES[mk] || MODEL_STATES[baseKey(mk)] || {};
  for (const k of Object.keys(f)) { const v = f[k]; d[k] = Array.isArray(v) ? v[2] : v; }
  return d;
}
function stateOf(mk) {
  const st = Object.assign(defaults(mk), cutOn() ? (ANATOMY[key].st || {}) : {}, USER[key] || {});
  st.xray = S.x > 0 || S.e > 0 ? 1 : 0; st.wreck = S.w;
  return st;
}
/* camera: fitted to the assembled and to the exploded model; the frame eases between the two with the
   explode, until the user drags or zooms (then it is theirs) */
function frameView() {
  const A = ANATOMY[key], E = ent(A.model), st = stateOf(A.model), own = key === Q.get('m');
  const asp = stage.classList.contains('noui') ? 16 / 9 : 16 / 9 * .7;          // the side panels take the frame's edges
  S.fitA = fitView(key, E.m, st, 0, cam.fov, asp); S.fitE = fitView(key, E.m, st, 1, cam.fov, asp);
  S.manual = own && (Q.has('tgt') || Q.has('dist'));
  S.tgt = own && Q.has('tgt') ? Q.get('tgt').split(',').map(Number) : S.fitA.tgt.slice();
  S.dist = own && Q.has('dist') ? num('dist', 10) : S.fitA.dist;
  S.yaw = own && Q.has('yaw') ? num('yaw', 40) * DEG : S.fitA.yaw;
  S.pitch = own && Q.has('pitch') ? num('pitch', 15) * DEG : S.fitA.pitch;
  S.ext = S.fitA.dist;
}
function followFit(dt) {
  if (S.manual || !S.fitA) return;
  const k = S.e * S.e * (3 - 2 * S.e), a = S.fitA, b = S.fitE, f = dt === null ? 1 : Math.min(1, dt * 5);
  for (let i = 0; i < 3; i++) S.tgt[i] += (a.tgt[i] + (b.tgt[i] - a.tgt[i]) * k - S.tgt[i]) * f;
  S.dist += (a.dist + (b.dist - a.dist) * k - S.dist) * f;
}
function boundsOf(E, st) {
  if (E.bounds) return E.bounds;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], sp = spacing(E.mk);
  for (const part of E.m.parts) {
    if (part.inside) continue;
    const P = partPts(E, part, st, sp, 11), T = GEO.partXf(X.make(), part, st);
    for (let i = 0; i < P.length; i += 60) { const q = X.ap(T, [P[i], P[i + 1], P[i + 2]]); for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; } }
  }
  E.bounds = mn[0] > mx[0] ? [[-1, -1, -1], [1, 1, 1]] : [mn, mx];
  return E.bounds;
}

/* ---------- raster ---------- */
const cv = $('c'), ov = $('o'), octx = ov.getContext('2d');
const pb = new PointBuf(cv, [11, 12, 10], { vignette: .55 });
const BW = 1920, BH = 1080, D = pb.d;
const cam = new Cam(1920, 1080); cam.fov = 32 * DEG; cam.near = .05;
const LK = V.norm([-.5, .62, -.6]);
function dot(x, y, s, r, g, b, a) {
  const R_ = r * a, G_ = g * a, B_ = b * a;
  if (s === 1) { const xi = x | 0, yi = y | 0; if (xi < 0 || yi < 0 || xi >= BW || yi >= BH) return; const i = (yi * BW + xi) << 2; if (D[i] < R_) D[i] = R_; if (D[i + 1] < G_) D[i + 1] = G_; if (D[i + 2] < B_) D[i + 2] = B_; return; }
  const x0 = (x - s * .5 + .5) | 0, y0 = (y - s * .5 + .5) | 0;
  if (x0 < 0 || y0 < 0 || x0 + s > BW || y0 + s > BH) return;
  for (let j = 0; j < s; j++) { let i = ((y0 + j) * BW + x0) << 2; for (let k = 0; k < s; k++, i += 4) { if (D[i] < R_) D[i] = R_; if (D[i + 1] < G_) D[i + 1] = G_; if (D[i + 2] < B_) D[i + 2] = B_; } }
}
/* scan: model-space z of the front (sweeps +Z -> -Z as S.x goes 0 -> 1), band width */
const SCAN = { on: false, zf: 0, band: 1 };
let NPTS = 0;
/* draw a stride-6 cloud through T (with the explode offset); T0 = same without the offset (scan
   coordinate). cls: 'part' | 'shell' | 'hidden'. bx: optional [x0, y0, x1, y1] screen box to grow */
function drawPts(P, T, T0, cls, sp, bx, tint, amul) {
  const M = T.R, t = T.T, e = cam.eye, f = cam.f, r = cam.r, u = cam.u, F = cam.fl, cx = cam.cx, cy = cam.cy, near = cam.near;
  const tx = t[0] - e[0], ty = t[1] - e[1], tz = t[2] - e[2];
  const a00 = r[0] * M[0] + r[1] * M[3] + r[2] * M[6], a01 = r[0] * M[1] + r[1] * M[4] + r[2] * M[7], a02 = r[0] * M[2] + r[1] * M[5] + r[2] * M[8];
  const a10 = u[0] * M[0] + u[1] * M[3] + u[2] * M[6], a11 = u[0] * M[1] + u[1] * M[4] + u[2] * M[7], a12 = u[0] * M[2] + u[1] * M[5] + u[2] * M[8];
  const a20 = f[0] * M[0] + f[1] * M[3] + f[2] * M[6], a21 = f[0] * M[1] + f[1] * M[4] + f[2] * M[7], a22 = f[0] * M[2] + f[1] * M[5] + f[2] * M[8];
  const b0 = r[0] * tx + r[1] * ty + r[2] * tz, b1 = u[0] * tx + u[1] * ty + u[2] * tz, b2 = f[0] * tx + f[1] * ty + f[2] * tz;
  const l0 = M[0] * LK[0] + M[3] * LK[1] + M[6] * LK[2], l1 = M[1] * LK[0] + M[4] * LK[1] + M[7] * LK[2], l2 = M[2] * LK[0] + M[5] * LK[1] + M[8] * LK[2];
  const el0 = -(M[0] * tx + M[3] * ty + M[6] * tz), el1 = -(M[1] * tx + M[4] * ty + M[7] * tz), el2 = -(M[2] * tx + M[5] * ty + M[8] * tz);
  const z0r = T0.R, zr0 = z0r[6], zr1 = z0r[7], zr2 = z0r[8], zt = T0.T[2];
  const scan = SCAN.on, zf = SCAN.zf, band = SCAN.band, invB = 1 / band, am = amul === undefined ? 1 : amul;
  const cr0 = tint ? tint[0] : WH[0], cg0 = tint ? tint[1] : WH[1], cb0 = tint ? tint[2] : WH[2];
  const n = P.length / 6;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (let i = 0, j = 0; i < n; i++, j += 6) {
    const px = P[j], py = P[j + 1], pz = P[j + 2];
    let k = 0, thin = false;
    if (scan) {
      const zm = zr0 * px + zr1 * py + zr2 * pz + zt, d = zm - zf;
      const open = d > 0;
      if (cls === 'hidden' && !open) continue;
      if (d > -band * .15 && d < band) k = d < 0 ? 1 + d / (band * .15) : Math.exp(-d * invB * 3);
      if (cls === 'shell' && open && k < .35) { if ((i * .6180339887) % 1 > .3) continue; thin = true; }
    }
    const zc = a20 * px + a21 * py + a22 * pz + b2;
    if (zc < near) continue;
    const nx = P[j + 3], ny = P[j + 4], nz = P[j + 5];
    let b;
    if (nx === 0 && ny === 0 && nz === 0) b = .5;
    else {
      const dn = nx * (px - el0) + ny * (py - el1) + nz * (pz - el2);
      if (dn > 0) { if (i % 3) continue; b = .09; }
      else {
        let fac = -dn / zc; if (fac > 1) fac = 1;
        const lam = nx * l0 + ny * l1 + nz * l2, w = 1 - fac;
        b = .06 + .74 * (lam > 0 ? lam : 0) + .14 * fac + .34 * w * w * w; b *= .55 + .45 * b;
      }
    }
    if (thin) b = .09 + .3 * b;
    b *= am;
    let cr = cr0, cg = cg0, cb = cb0;
    if (k > 0) { if (b < k * .95) b = k * .95; cr += (LIME[0] - cr) * k; cg += (LIME[1] - cg) * k; cb += (LIME[2] - cb) * k; }
    if (b < .02) continue;
    if (b > 1) b = 1;
    const iz = F / zc, sx = cx + (a00 * px + a01 * py + a02 * pz + b0) * iz, sy = cy - (a10 * px + a11 * py + a12 * pz + b1) * iz;
    if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) continue;
    const pxs = sp * iz;
    dot(sx, sy, pxs > 7.5 ? 3 : pxs > 3.6 ? 2 : 1, cr, cg, cb, b);
    NPTS++;
    if (bx && (i & 3) === 0) { if (sx < bx0) bx0 = sx; if (sx > bx1) bx1 = sx; if (sy < by0) by0 = sy; if (sy > by1) by1 = sy; }
  }
  if (bx && bx1 >= bx0) { if (bx0 < bx[0]) bx[0] = bx0; if (by0 < bx[1]) bx[1] = by0; if (bx1 > bx[2]) bx[2] = bx1; if (by1 > bx[3]) bx[3] = by1; }
}

/* ---------- overlay: tags, leaders, brackets (canvas, so stills carry them) ---------- */
const MONO = '"Geist Mono", Consolas, monospace';
function leader(x0, y0, x1, y1, a) { octx.strokeStyle = 'rgba(198,244,50,1)'; octx.globalAlpha = a; octx.lineWidth = 1; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1; }
function bracket(b, a, pad, len, col) {
  const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad, c = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
  octx.strokeStyle = col || '#C6F432'; octx.globalAlpha = a; octx.lineWidth = 1.5; octx.beginPath();
  for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { octx.moveTo(px + sx * c, py); octx.lineTo(px, py); octx.lineTo(px, py + sy * c); }
  octx.stroke(); octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.globalAlpha = a * .45; octx.strokeRect(x0, y0, x1 - x0, y1 - y0); octx.setLineDash([]); octx.globalAlpha = 1;
}
/* tag: lime id chip + dark label + lime value; returns its width. align 'L' = ends at x */
function tagW(id, lab, val) {
  octx.font = `500 10.5px ${MONO}`; octx.letterSpacing = '.6px';
  const w1 = octx.measureText(id).width + 12, w2 = octx.measureText(lab.toUpperCase()).width + 14, w3 = val ? octx.measureText(val.toUpperCase()).width + 14 : 0;
  return [w1, w2, w3];
}
function tag(x, y, id, lab, val, a, align, col) {
  const [w1, w2, w3] = tagW(id, lab, val), W = w1 + w2 + w3, h = 19, x0 = align === 'L' ? x - W : x;
  octx.globalAlpha = a;
  octx.fillStyle = col || '#C6F432'; octx.fillRect(x0, y, w1, h);
  octx.fillStyle = 'rgba(11,12,10,.86)'; octx.fillRect(x0 + w1, y, w2 + w3, h);
  octx.textBaseline = 'middle';
  octx.fillStyle = '#0B0C0A'; octx.fillText(id, x0 + 6, y + h / 2 + 1);
  octx.fillStyle = '#fff'; octx.fillText(lab.toUpperCase(), x0 + w1 + 7, y + h / 2 + 1);
  if (val) { octx.fillStyle = '#C6F432'; octx.fillText(val.toUpperCase(), x0 + w1 + w2 + 7, y + h / 2 + 1); }
  octx.globalAlpha = 1;
  return W;
}

/* ---------- UI ---------- */
const listEl = $('list'), sideEl = $('side'), statusEl = $('status');
listEl.innerHTML = GROUPS.map(([g, ks]) => `<h4>${g}</h4>` + ks.map(k => `<div class="it" data-k="${k}"><i class="sq"></i><span class="nm">${k}</span><span class="ds">${(ANATOMY[k] && ANATOMY[k].title) || ''}</span><i class="ok" id="ok_${k}"></i></div>`).join('')).join('');
listEl.addEventListener('click', ev => { const it = ev.target.closest('.it'); if (it) select(it.dataset.k); });
function select(k) {
  key = k; for (const el of listEl.querySelectorAll('.it')) el.classList.toggle('on', el.dataset.k === k);
  frameView(); buildSide(); S.settle = 0;
}
function fmt(v) { return typeof v === 'boolean' ? (v ? 'on' : 'off') : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2); }
function buildSide() {
  const A = ANATOMY[key], inf = MODEL_INFO[key] || {}, mk = modelKey(), fields = MODEL_STATES[mk] || MODEL_STATES[key] || {};
  const st = stateOf(mk);
  let h = `<div class="tt">${A.title}</div><div class="sz">${A.size}</div>`;
  if (A.note) h += `<div class="nt">${A.note}</div>`;
  h += `<div class="ro" id="ro"></div><h4>State</h4>`;
  for (const [f, spec] of Object.entries(fields)) {
    if (f === 'xray') continue;
    if (Array.isArray(spec)) h += `<div class="row"><span>${f}</span><input type="range" data-f="${f}" min="${spec[0]}" max="${spec[1]}" step="${(spec[1] - spec[0]) / 400}" value="${st[f]}"><span class="v" id="v_${f}">${fmt(st[f])}</span></div>`;
    else h += `<span class="chip ${st[f] ? 'on' : ''}" data-b="${f}"><b>${st[f] ? '1' : '0'}</b>${f}</span>`;
  }
  h += `<h4>Inspect</h4><span class="chip" data-t="e"><b>E</b>Explode</span><span class="chip" data-t="x"><b>X</b>X-ray</span><span class="chip" data-t="w"><b>W</b>Wreck</span><span class="chip" data-t="o"><b>␣</b>Orbit</span>`;
  sideEl.innerHTML = h;
  for (const inp of sideEl.querySelectorAll('input[type=range]')) inp.addEventListener('input', () => { const f = inp.dataset.f, v = parseFloat(inp.value); (USER[key] = USER[key] || {})[f] = v; $('v_' + f).textContent = fmt(v); });
  for (const c of sideEl.querySelectorAll('.chip[data-b]')) c.addEventListener('click', () => { const f = c.dataset.b, s2 = stateOf(modelKey()); (USER[key] = USER[key] || {})[f] = !s2[f]; buildSide(); });
  for (const c of sideEl.querySelectorAll('.chip[data-t]')) c.addEventListener('click', () => toggle(c.dataset.t));
  syncChips();
}
function syncChips() {
  for (const c of sideEl.querySelectorAll('.chip[data-t]')) { const t = c.dataset.t; c.classList.toggle('on', t === 'e' ? S.eT > 0 : t === 'x' ? S.xT > 0 : t === 'w' ? S.wT > 0 : S.orbit); }
}
function toggle(t) {
  const wasCut = cutOn();
  if (t === 'e') { S.eT = S.eT > 0 ? 0 : 1; S.settle = 0; }
  if (t === 'x') S.xT = S.xT > 0 ? 0 : 1;
  if (t === 'w') S.wT = S.wT > 0 ? 0 : 1;
  if (t === 'o') S.orbit = !S.orbit;
  if (wasCut !== cutOn()) buildSide();
  syncChips();
}
addEventListener('keydown', ev => {
  if (ev.target && ev.target.tagName === 'INPUT') return;
  const k = ev.key.toLowerCase();
  if (k === 'e' || k === 'x' || k === 'w') toggle(k);
  else if (k === ' ') { toggle('o'); ev.preventDefault(); }
  else if (k === 'arrowdown' || k === 'arrowup') { const i = KEYS.indexOf(key); select(KEYS[(i + (k === 'arrowdown' ? 1 : KEYS.length - 1)) % KEYS.length]); ev.preventDefault(); }
  else if (k === 's') still();
  else if (k === 'h') { stage.classList.toggle('noui'); frameView(); }
});
/* orbit by drag, zoom by wheel, pan with shift-drag */
let drag = null;
cv.parentElement.addEventListener('mousedown', ev => { if (ev.target.closest('.list, .side')) return; drag = { x: ev.clientX, y: ev.clientY, pan: ev.shiftKey || ev.button === 1 }; stage.classList.add('drag'); });
addEventListener('mouseup', () => { drag = null; stage.classList.remove('drag'); });
addEventListener('mousemove', ev => {
  if (!drag) return;
  const dx = (ev.clientX - drag.x) / SK, dy = (ev.clientY - drag.y) / SK; drag.x = ev.clientX; drag.y = ev.clientY;
  if (drag.pan) { S.manual = true; const k = S.dist / cam.fl; S.tgt = V.add(S.tgt, V.add(V.mul(cam.r, -dx * k), V.mul(cam.u, dy * k))); }
  else { S.yaw += dx * .006; S.pitch = Math.max(-1.2, Math.min(1.45, S.pitch + dy * .005)); }
});
cv.parentElement.addEventListener('wheel', ev => { if (ev.target.closest('.list, .side')) return; S.manual = true; S.dist *= Math.exp(ev.deltaY * .0012); ev.preventDefault(); }, { passive: false });

/* ---------- validation ---------- */
const VALID = {};
function validate(k) {
  const A = ANATOMY[k]; if (!A) return;
  try { const r = validateAnatomy(k, ent(A.model).m); VALID[k] = r; const el = $('ok_' + k); if (el) el.classList.toggle('bad', !r.ok); if (!r.ok || r.unknown.length) console.warn('anatomy', k, r); }
  catch (err) { console.error('anatomy', k, err); const el = $('ok_' + k); if (el) el.classList.add('bad'); }
}

/* ---------- frame ---------- */
let last = performance.now(), msAvg = 0, stillDone = false;
function tick(now) { const dt = Math.min(.1, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(tick); }
function frame(dt) {
  const t0 = performance.now();
  // animations
  const step = (v, tg, rate) => v < tg ? Math.min(tg, v + dt * rate) : Math.max(tg, v - dt * rate);
  S.e = step(S.e, S.eT, 1 / 3.2); S.x = step(S.x, S.xT, 1 / 1.8); S.w = step(S.w, S.wT, 1 / 1.4);
  S.settle = S.e >= 1 ? S.settle + dt : 0;
  if (S.orbit) S.yaw += dt * S.spd;
  const A = ANATOMY[key], mk = modelKey(), E = ent(mk);
  const model = S.w > 0 ? (E.wr || (E.wr = wreckOf(E.m, { seed: 5 }))) : E.m;
  const st = stateOf(mk), sp = spacing(mk);
  followFit(dt);
  cam.orbit(S.tgt, S.yaw, S.pitch, S.dist);
  SP_VIEW = S.dist * 2.3 / cam.fl * num('s', 1);
  pb.clear(); octx.clearRect(0, 0, 1920, 1080);
  // the X-ray scan along the model's Z
  const b = boundsOf(E, st), L = Math.max(1e-3, b[1][2] - b[0][2]);
  SCAN.on = S.x > 0; SCAN.band = Math.max(.12, L * .07); SCAN.zf = b[1][2] + SCAN.band - (L + 2 * SCAN.band) * S.x;
  NPTS = 0;
  const boxes = new Map();
  model.parts.forEach((part, pi) => {
    if (part.show && !part.show(st)) return;
    const en = entryOf(key, part.name), P = partPts(E, part, st, sp, 31 + pi * 7);
    const T0 = GEO.partXf(X.make(), part, st);
    let T = T0;
    if (en && S.e > 0) { const k = explodeK(en.w0, S.e); if (k > 0) T = X.mul(T3(V.mul(en.explode, k)), T0); }
    const cls = part.inside ? 'hidden' : en ? en.cls : 'part';
    // interior parts: revealed by the X-ray scan, or lifted out in the exploded view
    let am = 1;
    if (cls === 'hidden' && S.x <= 0) { am = en ? Math.min(1, explodeK(en.w0, S.e) * 2.5) : 0; if (am < .02) return; }
    let bx = null;
    if (en && S.e > .5) { bx = boxes.get(en) || [1e9, 1e9, -1e9, -1e9]; boxes.set(en, bx); }
    drawPts(P, T, T0, cls === 'hidden' && S.x <= 0 ? 'part' : cls, sp, bx, S.w > .3 ? [238, 225, 215] : null, am);
  });
  // what the X-ray finds inside containers
  if (S.x > 0 && cutOn()) for (const c of xrayOf(key, st)) {
    const cl = baked(c.model, c.st);
    let T = c.xf;
    if (c.parent && S.e > 0) { const en = entryOf(key, c.parent); if (en) { const k = explodeK(en.w0, S.e); T = X.mul(T3(V.mul(en.explode, k)), c.xf); } }
    drawPts(cl.pts, T, c.xf, 'hidden', cl.sp, null);
  }
  pb.blit();
  overlays(model, st, boxes);
  const ms = performance.now() - t0; msAvg = msAvg ? msAvg * .9 + ms * .1 : ms;
  status(mk, model);
  if (Q.get('still') === '1' && !stillDone && S.t > 1.2) { stillDone = true; still(); }
  S.t += dt;
}
function overlays(model, st, boxes) {
  if (S.e < .5) return;
  const rows = [];
  let bx0 = 1e9, bx1 = -1e9;
  for (const [en, b] of boxes) { if (b[0] < bx0) bx0 = b[0]; if (b[2] > bx1) bx1 = b[2]; }
  for (const en of ANATOMY[key].parts) {
    if (!en.id) continue;
    const k = explodeK(en.w0, S.e); if (k < .8) continue;
    const parts = en.parts.map(n => model.parts.find(p => p.name === n)).filter(p => p && (!p.show || p.show(st)));
    if (!parts.length) continue;
    const a = ss(.8, .97, k), anc = V.add(anchorOf(model, en, st), V.mul(en.explode, k)), p = cam.project(anc);
    if (!p) continue;
    rows.push({ en, a, p, b: boxes.get(en) });
  }
  // placard columns either side of the model as seen now: each tag reads from the nearer column
  const midX = bx1 > bx0 ? (bx0 + bx1) / 2 : 960;
  for (const r of rows) r.side = r.p[0] < midX ? 'L' : 'R';
  // placard columns beside the model, kept clear of the side panels
  const hideUI = stage.classList.contains('noui'), wMax = { L: 0, R: 0 };
  for (const r of rows) { const w = tagW(r.en.id, r.en.label, r.en.size); wMax[r.side] = Math.max(wMax[r.side], w[0] + w[1] + w[2]); }
  const colX = { L: Math.max((hideUI ? 40 : 356) + wMax.L + 10, bx0 - 36), R: Math.min((hideUI ? 1880 : 1560) - wMax.R - 10, bx1 + 36) };
  for (const side of ['L', 'R']) {
    const rs = rows.filter(r => r.side === side).sort((u, v) => u.p[1] - v.p[1]);
    let y = 120;
    for (const r of rs) { r.y = Math.max(r.p[1], y); y = r.y + 27; }
    const over = y - 27 - 980; if (over > 0) for (const r of rs) r.y -= over;
    for (const r of rs) {
      const x = colX[side];
      leader(r.p[0], r.p[1], x, r.y, .65 * r.a);
      octx.globalAlpha = r.a; octx.fillStyle = '#C6F432'; octx.fillRect(r.p[0] - 1.5, r.p[1] - 1.5, 3, 3); octx.globalAlpha = 1;
      tag(side === 'L' ? x - 6 : x + 6, r.y - 10, r.en.id, r.en.label, r.en.size, r.a, side);
      const bk = ss(0, .5, S.settle) * (1 - ss(2.2, 3.2, S.settle));
      if (bk > .02 && r.b && r.b[2] > r.b[0]) bracket(r.b, .8 * bk * r.a, 5, 9);
    }
  }
}
function status(mk, model) {
  const E = ENT[mk], inf = MODEL_INFO[mk] || {};
  const ro = $('ro');
  const v = VALID[key];
  const txt = `Model <b>${mk}</b><br>Parts <b>${model.parts.length}</b> · anatomy ${v ? (v.ok ? '<b>ok</b>' : '<b style="color:#FF6A3D">' + (v.missing.length ? 'missing ' + v.missing.join(' ') : 'dup ' + v.dup.join(' ')) + '</b>') : '—'}<br>Dots <b>${NPTS.toLocaleString('en')}</b> @ <b>${spacing(mk).toFixed(3)} m</b><br>Frame <b>${msAvg.toFixed(1)} ms</b> · build <b>${E.build.toFixed(0)} ms</b>`;
  if (ro && ro._t !== txt) { ro.innerHTML = txt; ro._t = txt; }
  const s2 = `${key} · ${S.e > 0 ? `Exploded <i>${Math.round(S.e * 100)} %</i>` : 'Assembled'} · ${S.x > 0 ? `X-ray <i>${S.x < 1 ? Math.round(S.x * 100) + ' %' : 'open'}</i>` : 'X-ray off'}${S.w > 0 ? ' · Wreck' : ''}`;
  if (statusEl._t !== s2) { statusEl.innerHTML = s2; statusEl._t = s2; }
}
function still(tag) {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
  const g = c.getContext('2d'); g.drawImage(cv, 0, 0); g.drawImage(ov, 0, 0);
  tag = tag || Q.get('tag');
  const name = `models_${key}${S.eT ? '_e' : ''}${S.xT ? '_x' : ''}${S.wT ? '_w' : ''}${tag ? '_' + tag : ''}`;
  return fetch(`/save?path=game/shots/${name}.png`, { method: 'POST', body: c.toDataURL('image/png') }).then(r => name);
}
/* automation: MV.shoot('tel', { e: 1, x: 0, w: 0, yaw, pitch, dist (deg / m), st: {...}, brackets: false }, 'tag') -> saved name */
function pose(k, o) {
  o = o || {};
  USER[k] = o.st || {};
  S.e = S.eT = o.e ? 1 : 0; S.x = S.xT = o.x ? 1 : 0; S.w = S.wT = o.w ? 1 : 0;
  select(k);
  followFit(null);
  if (o.yaw !== undefined) S.yaw = o.yaw * DEG; if (o.pitch !== undefined) S.pitch = o.pitch * DEG;
  if (o.dist !== undefined || o.tgt) { S.manual = true; if (o.dist !== undefined) S.dist = o.dist; if (o.tgt) S.tgt = o.tgt.slice(); }
  if (o.zoom) { S.manual = true; S.dist *= o.zoom; }
  const orb = S.orbit; S.orbit = false;
  for (let i = 0; i < 3; i++) frame(1 / 30);
  S.settle = o.brackets ? 1 : 9; frame(1 / 30);
  S.orbit = orb;
}
function shoot(k, o, tag) { pose(k, o); return still(tag); }
/* contact sheet: [[key, opts], ...] in a 4 × 4 grid of 480 × 270 tiles -> game/shots/<name>.png */
function sheet(list, name, cols) {
  cols = cols || 4; const rows = Math.ceil(list.length / cols), tw = 1920 / cols, th = 1080 / cols;
  const c = document.createElement('canvas'); c.width = 1920; c.height = th * rows;
  const g = c.getContext('2d'); g.fillStyle = '#0B0C0A'; g.fillRect(0, 0, c.width, c.height);
  list.forEach(([k, o], i) => {
    pose(k, o); const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
    g.drawImage(cv, x, y, tw, th); g.drawImage(ov, x, y, tw, th);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `500 ${cols > 3 ? 11 : 13}px ${MONO}`; g.fillText((k + (o && o.e ? ' · E' : '') + (o && o.x ? ' · X' : '') + (o && o.w ? ' · W' : '')).toUpperCase(), x + 8, y + 16);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.strokeRect(x + .5, y + .5, tw - 1, th - 1);
  });
  return fetch(`/save?path=game/shots/${name}.png`, { method: 'POST', body: c.toDataURL('image/png') }).then(() => name);
}

/* ---------- go ---------- */
for (const k of KEYS) if (!ANATOMY[k]) console.warn('no anatomy for', k);
select(key);
document.fonts && document.fonts.load(`500 10.5px ${MONO}`);
{ let i = 0; const next = () => { if (i < KEYS.length) { validate(KEYS[i++]); setTimeout(next, 30); } }; setTimeout(next, 300); }
/* for automation from a hidden tab (no rAF there): MV.step(frames, dt) then MV.still() */
window.MV = { S, ENT, select, toggle, still, shoot, sheet, pose, USER, step: (n, dt) => { for (let i = 0; i < (n || 1); i++) frame(dt || 1 / 30); return msAvg; }, get key() { return key; } };
requestAnimationFrame(tick);
