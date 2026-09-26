/* Verification suite for the blast bench (blast.js + gpu.js). Independent of the bench's own checks.

   How it drives the bench: it loads index.html's controls off screen, fetches blast.js, rewrites only its relative
   import of gpu.js to an absolute URL and appends a read-only accessor (window.__BI: live views of the module's
   arrays and functions, plus a dt setter for the time-step study). Nothing in the physics is changed. The render
   loop is not started (requestAnimationFrame is stubbed), so every case runs synchronously from detonation to T1.

   Scene-agnostic: the checks find the struck plate, panels (frames/stiffeners from FRM), "behind the hole" and "in
   reach" from the model's own arrays (PL, SURF, R0, NRM, FRM, FIX) and the charge position, so they run on the 24 m
   box and on any other scene the bench builds (Burke cases are picked up when the bench exposes a scene switch).

   Checks print PASS / FAIL / INFO with numbers. ?only=energy,mesh runs a subset, ?quick=1 skips the slow CPU runs. */

const BASE = new URL('./', import.meta.url).href;
const Q = new URLSearchParams(location.search);
const ONLY = Q.get('only') ? Q.get('only').split(',') : null, QUICK = Q.get('quick') === '1';
const OUT = { results: [], started: new Date().toISOString(), done: false };
window.VERIFY = OUT;

/* ------------------------------------------------------------------ output */
const logEl = document.getElementById('log'), sumEl = document.getElementById('sum');
const fmt = (x, d = 2) => x === undefined || x === null || Number.isNaN(x) ? '-' : Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(2) : (+x).toFixed(d);
function line(kind, name, msg) {
  const d = document.createElement('div'); d.className = kind;
  d.innerHTML = `<b>${kind.padEnd(4)}</b>  ${name.padEnd(28)} ${msg}`; logEl.appendChild(d);
  console.log(`${kind} ${name}: ${msg}`);
}
function section(t) { const d = document.createElement('div'); d.className = 'sec'; d.textContent = t; logEl.appendChild(d); console.log('--- ' + t); }
function record(group, name, pass, msg, data) {
  const kind = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO';
  OUT.results.push({ group, name, kind, msg, data });
  line(kind, name, msg);
  const p = OUT.results.filter(r => r.kind === 'PASS').length, f = OUT.results.filter(r => r.kind === 'FAIL').length;
  sumEl.innerHTML = `<b style="color:var(--lime)">${p} pass</b> · <b style="color:var(--coral)">${f} fail</b> · ${OUT.results.length - p - f} info`;
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* ------------------------------------------------------------------ load the bench */
// track the WebGL objects each run creates (gpu.js makes a fresh set per build and never frees them), so the
// suite can free a finished run's objects before the next one instead of running the GPU out of memory
const GLTRACK = { on: false, objs: [] };
{
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const gl = orig.call(this, type, opts);
    if (gl && type === 'webgl2' && !gl.__tracked) {
      gl.__tracked = true;
      for (const [mk, del] of [['createTexture', 'deleteTexture'], ['createFramebuffer', 'deleteFramebuffer'], ['createProgram', 'deleteProgram'],
        ['createBuffer', 'deleteBuffer'], ['createVertexArray', 'deleteVertexArray'], ['createShader', 'deleteShader']]) {
        const f = gl[mk].bind(gl);
        gl[mk] = (...a) => { const o = f(...a); if (GLTRACK.on) GLTRACK.objs.push([del, o]); return o; };
      }
      GLTRACK.gl = gl;
    }
    return gl;
  };
}
function glFree() { const gl = GLTRACK.gl; if (!gl) return; for (const [del, o] of GLTRACK.objs) try { gl[del](o); } catch (e) {} GLTRACK.objs.length = 0; }

const VARS = ['N', 'NS', 'NC', 'S', 'dt', 'X', 'V', 'F', 'M', 'R0', 'SA', 'SB', 'SL0', 'SLP', 'SK', 'SFY', 'SEF', 'SC', 'SBRK', 'TK', 'TFY', 'TAN',
  'KB', 'KBY', 'KBC', 'UB', 'UNB', 'UN', 'FREE', 'FIX', 'DISC', 'IMP', 'RH', 'VC', 'AREA', 'NRM', 'NSP', 'NSN', 'GP', 'OPEN', 'LOSF', 'CTORN',
  'CSURF', 'CN', 'SURF', 'ANODES', 'ASPR', 'PL', 'EPS', 'FRM', 'sim', 'st', 'gpu', 'TEAR_K', 'EF_MESH', 'MATS', 'G', 'P0', 'GV', 'CBOND', 'SCELL',
  'NADJ', 'ADJ', 'LINKS', 'SCENES', 'SCENE', 'scene'];
const FNS = ['step', 'stepExplicit', 'stepGPU', 'stepXPBD', 'settle', 'build', 'detonate', 'shockImp', 'gpuFinish', 'gpuSync', 'visible', 'firstHit',
  'kinneyPs', 'kinneyIs', 'reflect', 'arrival', 'qsp', 'runCracks', 'collide', 'prepareActive', 'runCase', 'compare'];
const guard = n => `${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`;
const ACCESSOR = `
;window.__BI = { v: () => ({ ${VARS.map(guard).join(', ')} }), fn: () => ({ ${FNS.map(guard).join(', ')} }),
  setDt(x) { dt = x; } };
`;

async function loadBench() {
  const html = await (await fetch(BASE + 'index.html?v=' + Date.now())).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const host = document.getElementById('bench');
  for (const el of [...doc.body.children]) if (el.tagName !== 'SCRIPT') host.appendChild(document.importNode(el, true));
  window.requestAnimationFrame = () => 0;                       // no render loop: runs are synchronous and alone
  let src = await (await fetch(BASE + 'blast.js?v=' + Date.now())).text();
  src = src.replace(/import\((['"`])\.\//g, (m, q) => 'import(' + q + BASE);
  const url = URL.createObjectURL(new Blob([src + ACCESSOR], { type: 'text/javascript' }));
  await import(url);
  GLTRACK.on = true;
  return window.__BI;
}

/* ------------------------------------------------------------------ running cases */
let BI, F, DEF;
const V = () => BI.v();
function setup(cfg) {
  glFree();
  const st = V().st;
  for (const k of Object.keys(DEF)) st[k] = JSON.parse(JSON.stringify(DEF[k]));
  Object.assign(st, JSON.parse(JSON.stringify(cfg)));
  F.build(); F.detonate();
  const s = V().sim; s.sync = true;
  return s;
}
// run one case to the end; opt: dtScale, hook {pre, post}, track [nodes] (peak |disp| over time), trackEvery
function run(cfg, opt = {}) {
  const s = setup(cfg);
  if (opt.dtScale) BI.setDt(V().dt * opt.dtScale);
  if (opt.mutate) opt.mutate(V());                               // experiments only (CPU solvers read the arrays live)
  const v = V(), gpu = s.solver === 'gpu';
  const peak = opt.track ? new Float64Array(opt.track.length) : null, hist = [];
  const trk = () => {
    if (gpu) v.gpu.readNodes(false);
    const X = V().X, R0 = v.R0;
    opt.track.forEach((i, k) => { const d = Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]); if (d > peak[k]) peak[k] = d; });
    hist.push([s.t, peak[0]]);
  };
  const t0 = performance.now(); let steps = 0; const every = opt.trackEvery || (gpu ? 40 : 10);
  while (s.t < (opt.tEnd ? Math.min(opt.tEnd, s.T1) : s.T1)) {        // T1 is live: the bench ends early once settled
    if (opt.hook) opt.hook.pre(); F.step(); if (opt.hook) opt.hook.post(); steps++;
    if (peak && steps % every === 0) trk();
    if (steps > (opt.maxSteps || 4e6)) break;
  }
  if (gpu) F.gpuFinish();
  if (peak) trk();
  const ms = performance.now() - t0; s.phase = 2; F.settle();
  return collect(cfg, { steps, ms, peak, hist });
}
function collect(cfg, extra) {
  const v = V(), s = v.sim, N = v.N, S = v.S;
  const disp = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) disp[i] = v.X[i] - v.R0[i];
  const areas = new Array(v.PL.length).fill(0); for (let c = 0; c < v.NC; c++) if (v.CTORN[c]) areas[v.CSURF[c]] += S * S;
  let plast = 0; for (let q = 0; q < v.NS; q++) if (!v.SBRK[q]) plast += v.SFY[q] * Math.abs(v.SLP[q] - v.SL0[q]);
  let broken = 0; for (let q = 0; q < v.NS; q++) broken += v.SBRK[q];
  const nodeTorn = new Uint8Array(N);
  for (let c = 0; c < v.NC; c++) if (v.CTORN[c]) for (let k = 0; k < 4; k++) nodeTorn[v.CN[4 * c + k]] = 1;
  for (let i = 0; i < N; i++) if (v.FREE[i]) nodeTorn[i] = 1;
  return { cfg, ...extra, S, N, NC: v.NC, dt: v.dt, simT: s.t, T1: s.T1, tLoad: s.tLoad, W: s.W, C: [...s.C], solver: s.solver,
    areas, hullM2: areas[0], maxDef: s.maxDef, plast, broken, disp, nodeTorn, free: v.FREE.slice(), ctorn: v.CTORN.slice(),
    surf: v.SURF, r0: v.R0, nrm: v.NRM, fix: v.FIX, frm: v.FRM, PL: v.PL, imp: s.solver !== 'gpu' && v.IMP ? v.IMP.slice() : null,
    rh: v.RH, sa: v.SA, sb: v.SB, gp: [...v.GP] };
}
const dmag = (R, i) => Math.hypot(R.disp[3 * i], R.disp[3 * i + 1], R.disp[3 * i + 2]);
const dnorm = (R, i, n) => -(R.disp[3 * i] * n[0] + R.disp[3 * i + 1] * n[1] + R.disp[3 * i + 2] * n[2]);   // along -n (away from a charge on +n)
// field difference between two runs on the same grid (mean |du| over nodes both keep, relative to the larger max)
function fieldDiff(a, b, filt) {
  let s = 0, n = 0, mx = 0;
  for (let i = 0; i < a.N; i++) { if (a.free[i] || b.free[i] || (filt && !filt(i))) continue;
    const da = dmag(a, i), db = dmag(b, i); s += Math.abs(da - db); n++; mx = Math.max(mx, da, db); }
  let torn = 0, both = 0; for (let c = 0; c < a.NC; c++) { if (a.ctorn[c] !== b.ctorn[c]) torn++; else if (a.ctorn[c]) both++; }
  return { meanMm: n ? s / n * 1000 : 0, maxMm: mx * 1000, rel: mx > 0 ? s / n / mx : 0, tornDiff: torn, tornBoth: both };
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

/* ------------------------------------------------------------------ geometry helpers (scene-agnostic) */
function nearestNode(v, p, filt) {
  let best = -1, bd = 1e18; const R0 = v.R0 || v.r0;
  for (let i = 0; i < (v.N); i++) { if (filt && !filt(i)) continue; const d = (R0[3 * i] - p[0]) ** 2 + (R0[3 * i + 1] - p[1]) ** 2 + (R0[3 * i + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
// the plate panel (between frames / stiffeners, from FRM) around a point on a plate
function panelAt(p) {
  const v = V(), SURF = v.SURF, FRM = v.FRM, S = v.S;
  const i0 = nearestNode(v, p), pl = SURF[i0], P = v.PL[pl];
  if (!P || !P.at || !FRM) return null;
  const I = Math.round((v.R0[3 * i0 + P.ua] - P.u0) / S), J = Math.round((v.R0[3 * i0 + P.va] - P.v0) / S);
  const at = (i, j) => P.at[j * (P.nu + 1) + i];
  const walk = (i, j, di, dj, want) => { while (i > 0 && j > 0 && i < P.nu && j < P.nv) { i += di; j += dj; if (want(at(i, j))) return di ? i : j; } return di ? i : j; };
  // a column that is not a frame line and a row that is not a stiffener line, to walk along
  let jr = J; while (jr < P.nv && FRM[at(I, jr)] >= 1 && FRM[at(I, jr)] !== 2) jr++;
  let ic = I; while (ic < P.nu && FRM[at(ic, J)] === 2) ic++;
  const iL = walk(I, jr, -1, 0, n => FRM[n] === 2), iR = walk(I, jr, 1, 0, n => FRM[n] === 2);
  const jB = walk(ic, J, 0, -1, n => FRM[n] >= 1), jT = walk(ic, J, 0, 1, n => FRM[n] >= 1);
  const uc = P.u0 + (iL + iR) / 2 * S, vc = P.v0 + (jB + jT) / 2 * S;
  const pt = [0, 0, 0]; pt[P.ax] = P.val; pt[P.ua] = uc; pt[P.va] = vc;
  return { pl, P, iL, iR, jB, jT, B: (iR - iL) * S, L: (jT - jB) * S, uc, vc, pt, at,
    edges: [at(iL, Math.round((jB + jT) / 2)), at(iR, Math.round((jB + jT) / 2)), at(Math.round((iL + iR) / 2), jB), at(Math.round((iL + iR) / 2), jT)] };
}
// graph distance (in bonds) from the fixed boundary, to leave artificial supports out of "in reach"
function hopsFromFix(v, maxHops) {
  const N = v.N, H = new Int32Array(N).fill(1e9), q = [];
  for (let i = 0; i < N; i++) if (v.FIX[i]) { H[i] = 0; q.push(i); }
  const nb = Array.from({ length: N }, () => []);
  for (let s = 0; s < v.NS; s++) { nb[v.SA[s]].push(v.SB[s]); nb[v.SB[s]].push(v.SA[s]); }
  for (let k = 0; k < q.length; k++) { const i = q[k]; if (H[i] >= maxHops) continue; for (const j of nb[i]) if (H[j] > H[i] + 1) { H[j] = H[i] + 1; q.push(j); } }
  return H;
}
// Nurick-Martin (quadrangular plates, uniform load): delta/h = 0.480 phi + 0.277, phi = I / (2 h^2 sqrt(B L rho sy))
const nurick = (I, B, L, h, rho, sy) => { const phi = I / (2 * h * h * Math.sqrt(B * L * rho * sy)); return { phi, d: h * (.48 * phi + .277) }; };

/* ------------------------------------------------------------------ energy ledger + momentum (CPU explicit only) */
// Wraps each step: snapshots the state before, re-derives the loads, element energies, plastic/fracture/damping
// dissipation after. Uses the bench's own F (total force per node) for the momentum check.
function makeLedger() {
  const v0 = V(), N = v0.N, NS = v0.NS, G = v0.G ?? 9.81;
  const { SA, SB, SK, SC, M, TK, KB, KBC, KBY, UNB, UN, AREA, NRM, NSP, NSN } = v0;
  const Xp = new Float64Array(3 * N), Vp = new Float64Array(3 * N), SLPp = new Float64Array(NS), TANp = new Float64Array(3 * N), UBp = new Float64Array(3 * N);
  const SBRKp = new Uint8Array(NS), FREEp = new Uint8Array(N), FU = new Float64Array(3 * N), FUC = new Float64Array(3 * N), EuN = new Float64Array(N), EuNp = new Float64Array(N);
  const L = { DvelFree: 0, DvelAtt: 0, Wext: 0, Wmass: 0, Dbpl: 0, Dtpl: 0, Dupl: 0, Dfrac: 0, Dbdamp: 0, Dvel: 0, Duvan: 0, Wumb: 0, Wudamp: 0, KE: 0, Eb: 0, Et: 0, Eu: 0, Eint0: 0, steps: 0,
    netF: 0, netM: 0, netFu: 0, loadSum: 0, hist: [] };
  let t0 = 0, msc0 = 1, bdRate = 0, first = true;
  const ke = (vel, msc) => { let e = 0; for (const i of V().ANODES) e += .5 * M[i] * msc * (vel[3 * i] ** 2 + vel[3 * i + 1] ** 2 + vel[3 * i + 2] ** 2); return e; };
  function energies() {
    const v = V(), X = v.X, SLP = v.SLP, SBRK = v.SBRK, FREE = v.FREE, TAN = v.TAN, UB = v.UB;
    let Eb = 0, Et = 0, Eu = 0;
    for (let q = 0; q < NS; q++) { if (SBRK[q]) continue; const a = SA[q], b = SB[q];
      const e = Math.hypot(X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]) - SLP[q]; Eb += .5 * SK[q] * e * e; }
    for (const i of v.ANODES) {
      EuN[i] = 0; if (FREE[i]) continue;
      if (TK[i]) { const d2 = (X[3 * i] - TAN[3 * i]) ** 2 + (X[3 * i + 1] - TAN[3 * i + 1]) ** 2 + (X[3 * i + 2] - TAN[3 * i + 2]) ** 2; Et += .5 * TK[i] * d2; }
      if (KB[i]) { let mx = 0, my = 0, mz = 0, n = 0, all = UNB[i + 1] - UNB[i];
        for (let k = UNB[i]; k < UNB[i + 1]; k++) { const q = UN[k]; if (SBRK[q]) continue; const j = SA[q] === i ? SB[q] : SA[q]; mx += X[3 * j]; my += X[3 * j + 1]; mz += X[3 * j + 2]; n++; }
        if (n === all) { const ex = mx / n - X[3 * i] - UB[3 * i], ey = my / n - X[3 * i + 1] - UB[3 * i + 1], ez = mz / n - X[3 * i + 2] - UB[3 * i + 2];
          EuN[i] = .5 * KB[i] * (ex * ex + ey * ey + ez * ez); Eu += EuN[i]; } }
    }
    return { Eb, Et, Eu };
  }
  function pre() {
    const v = V(), s = v.sim;
    if (first) { const e = energies(); L.Eint0 = e.Eb + e.Et + e.Eu; L.KE0 = ke(v.V, s.msc); first = false; }
    Xp.set(v.X); Vp.set(v.V); SLPp.set(v.SLP); TANp.set(v.TAN); UBp.set(v.UB); SBRKp.set(v.SBRK); FREEp.set(v.FREE); EuNp.set(EuN);
    t0 = s.t; msc0 = s.msc; v.F.fill(0);
    // bond dashpot power and the umbrella force at the start of the step (the state the bench's forces use)
    bdRate = 0;
    for (let q = 0; q < NS; q++) { if (SBRKp[q]) continue; const a = SA[q], b = SB[q];
      const dx = Xp[3 * b] - Xp[3 * a], dy = Xp[3 * b + 1] - Xp[3 * a + 1], dz = Xp[3 * b + 2] - Xp[3 * a + 2], Ln = Math.hypot(dx, dy, dz);
      const vr = ((Vp[3 * b] - Vp[3 * a]) * dx + (Vp[3 * b + 1] - Vp[3 * a + 1]) * dy + (Vp[3 * b + 2] - Vp[3 * a + 2]) * dz) / Ln; bdRate += SC[q] * vr * vr; }
    FU.fill(0); FUC.fill(0);
    for (const i of v.ANODES) { if (!KB[i] || FREEp[i]) continue;
      let mx = 0, my = 0, mz = 0, vx = 0, vy = 0, vz = 0, n = 0; const all = UNB[i + 1] - UNB[i];
      for (let k = UNB[i]; k < UNB[i + 1]; k++) { const q = UN[k]; if (SBRKp[q]) continue; const j = SA[q] === i ? SB[q] : SA[q];
        mx += Xp[3 * j]; my += Xp[3 * j + 1]; mz += Xp[3 * j + 2]; vx += Vp[3 * j]; vy += Vp[3 * j + 1]; vz += Vp[3 * j + 2]; n++; }
      if (n !== all) continue;
      const ex = mx / n - Xp[3 * i] - UBp[3 * i], ey = my / n - Xp[3 * i + 1] - UBp[3 * i + 1], ez = mz / n - Xp[3 * i + 2] - UBp[3 * i + 2];
      const e = Math.hypot(ex, ey, ez); let f = KB[i] * e; if (f > KBY[i]) f = KBY[i]; const g = e > 1e-12 ? f / e : 0, c = KBC[i];
      FU[3 * i] = ex * g; FU[3 * i + 1] = ey * g; FU[3 * i + 2] = ez * g;
      FUC[3 * i] = c * (vx / n - Vp[3 * i]); FUC[3 * i + 1] = c * (vy / n - Vp[3 * i + 1]); FUC[3 * i + 2] = c * (vz / n - Vp[3 * i + 2]);
    }
  }
  function post() {
    const v = V(), s = v.sim, X = v.X, Vn = v.V, Ft = v.F, FREE = v.FREE, h = s.t - t0, msc = s.msc;
    if (msc !== msc0) L.Wmass += ke(Vp, msc) - ke(Vp, msc0);            // mass scaling switched on: kinetic energy of the extra mass
    let fnx = 0, fny = 0, fnz = 0, mnx = 0, mny = 0, mnz = 0, fux = 0, fuy = 0, fuz = 0, load = 0; const C = s.C;
    // loads, re-derived exactly as the bench applies them (gas on both faces, shock through line of sight, gravity on loose plate)
    const vund = new Float64Array(3);
    let keU = 0;
    for (const i of v.ANODES) {
      let ex = 0, ey = 0, ez = 0;
      const dp = v.GP[NSN[i]] - v.GP[NSP[i]];
      if (dp !== 0 && !FREE[i]) { const f = dp * AREA[i]; ex += NRM[3 * i] * f; ey += NRM[3 * i + 1] * f; ez += NRM[3 * i + 2] * f; }
      if (v.LOSF[i]) { const I = F.shockImp(i, t0, t0 + h); if (I > 0) { const f = I / h * AREA[i]; ex += s.DIR[3 * i] * f; ey += s.DIR[3 * i + 1] * f; ez += s.DIR[3 * i + 2] * f; } }
      const dx = X[3 * i] - Xp[3 * i], dy = X[3 * i + 1] - Xp[3 * i + 1], dz = X[3 * i + 2] - Xp[3 * i + 2];
      // velocity before the global damping and the contacts (the kinetic energy they removed), and the step-mean
      // velocity: symplectic Euler gains exactly F . (v0 + v1)/2 h of kinetic energy, so the loads' work is taken the same way
      const im = h / (M[i] * msc);
      vund[0] = Vp[3 * i] + Ft[3 * i] * im; vund[1] = Vp[3 * i + 1] + Ft[3 * i + 1] * im - (FREE[i] ? G * h : 0); vund[2] = Vp[3 * i + 2] + Ft[3 * i + 2] * im;
      const ku = .5 * M[i] * msc * (vund[0] ** 2 + vund[1] ** 2 + vund[2] ** 2), kp = .5 * M[i] * msc * (Vn[3 * i] ** 2 + Vn[3 * i + 1] ** 2 + Vn[3 * i + 2] ** 2);
      if (FREE[i]) L.DvelFree += ku - kp; else L.DvelAtt += ku - kp;
      keU += ku;
      const mx = (Vp[3 * i] + vund[0]) * .5 * h, my = (Vp[3 * i + 1] + vund[1]) * .5 * h, mz = (Vp[3 * i + 2] + vund[2]) * .5 * h;
      L.Wext += ex * mx + ey * my + ez * mz;
      if (FREE[i]) L.Wext += -G * M[i] * msc * my;
      load += Math.hypot(ex, ey, ez);
      L.Wumb += FU[3 * i] * dx + FU[3 * i + 1] * dy + FU[3 * i + 2] * dz; L.Wudamp += FUC[3 * i] * dx + FUC[3 * i + 1] * dy + FUC[3 * i + 2] * dz;
      // internal force = total - loads - ties (ties anchor to the ground: external)
      let tx = 0, ty = 0, tz = 0;
      if (TK[i] && !FREE[i]) { const ddx = Xp[3 * i] - TANp[3 * i], ddy = Xp[3 * i + 1] - TANp[3 * i + 1], ddz = Xp[3 * i + 2] - TANp[3 * i + 2], dl = Math.hypot(ddx, ddy, ddz);
        if (dl > 1e-9) { const f = Math.min(TK[i] * dl, v.TFY[i]) / dl; tx = -ddx * f; ty = -ddy * f; tz = -ddz * f; } }
      const ix = Ft[3 * i] - ex - tx, iy = Ft[3 * i + 1] - ey - ty, iz = Ft[3 * i + 2] - ez - tz;
      fnx += ix; fny += iy; fnz += iz;
      const rx = Xp[3 * i] - C[0], ry = Xp[3 * i + 1] - C[1], rz = Xp[3 * i + 2] - C[2];
      mnx += ry * iz - rz * iy; mny += rz * ix - rx * iz; mnz += rx * iy - ry * ix;
      fux += FU[3 * i] + FUC[3 * i]; fuy += FU[3 * i + 1] + FUC[3 * i + 1]; fuz += FU[3 * i + 2] + FUC[3 * i + 2];
    }
    // fixed nodes: F holds the bond forces they received this step
    for (let i = 0; i < v.N; i++) if (v.FIX[i]) { fnx += Ft[3 * i]; fny += Ft[3 * i + 1]; fnz += Ft[3 * i + 2];
      const rx = Xp[3 * i] - C[0], ry = Xp[3 * i + 1] - C[1], rz = Xp[3 * i + 2] - C[2];
      mnx += ry * Ft[3 * i + 2] - rz * Ft[3 * i + 1]; mny += rz * Ft[3 * i] - rx * Ft[3 * i + 2]; mnz += rx * Ft[3 * i + 1] - ry * Ft[3 * i]; }
    L.Dvel = L.DvelFree + L.DvelAtt;
    L.Dbdamp += bdRate * h;
    // plastic flow: force at yield times the plastic increment (bonds, ties, umbrella); fracture: elastic energy a bond held
    const SLP = v.SLP, SBRK = v.SBRK;
    for (let q = 0; q < NS; q++) {
      const a = SA[q], b = SB[q];
      if (SBRK[q] && !SBRKp[q]) { const e = Math.hypot(Xp[3 * b] - Xp[3 * a], Xp[3 * b + 1] - Xp[3 * a + 1], Xp[3 * b + 2] - Xp[3 * a + 2]) - SLPp[q]; L.Dfrac += .5 * SK[q] * e * e; continue; }
      const dl = SLP[q] - SLPp[q]; if (dl === 0) continue;
      const Lp = Math.hypot(Xp[3 * b] - Xp[3 * a], Xp[3 * b + 1] - Xp[3 * a + 1], Xp[3 * b + 2] - Xp[3 * a + 2]);
      L.Dbpl += Math.abs(SK[q] * (Lp - SLP[q]) * dl);
    }
    for (const i of v.ANODES) {
      const dTx = v.TAN[3 * i] - TANp[3 * i], dTy = v.TAN[3 * i + 1] - TANp[3 * i + 1], dTz = v.TAN[3 * i + 2] - TANp[3 * i + 2];
      if (dTx || dTy || dTz) L.Dtpl += v.TFY[i] * Math.hypot(dTx, dTy, dTz);
      const dUx = v.UB[3 * i] - UBp[3 * i], dUy = v.UB[3 * i + 1] - UBp[3 * i + 1], dUz = v.UB[3 * i + 2] - UBp[3 * i + 2];
      if (dUx || dUy || dUz) L.Dupl += KBY[i] * Math.hypot(dUx, dUy, dUz);
    }
    const e = energies();
    for (const i of v.ANODES) if (EuNp[i] > 0 && EuN[i] === 0) L.Duvan += EuNp[i];     // umbrella switched off (a neighbour bond broke)
    L.Eb = e.Eb; L.Et = e.Et; L.Eu = e.Eu; L.KE = ke(Vn, msc); L.steps++;
    const fm = Math.hypot(fnx, fny, fnz), mm = Math.hypot(mnx, mny, mnz), fu = Math.hypot(fux, fuy, fuz);
    let mux = 0, muy = 0, muz = 0;
    for (const i of v.ANODES) { const fx = FU[3 * i] + FUC[3 * i], fy = FU[3 * i + 1] + FUC[3 * i + 1], fz = FU[3 * i + 2] + FUC[3 * i + 2]; if (!fx && !fy && !fz) continue;
      const rx = Xp[3 * i] - C[0], ry = Xp[3 * i + 1] - C[1], rz = Xp[3 * i + 2] - C[2]; mux += ry * fz - rz * fy; muy += rz * fx - rx * fz; muz += rx * fy - ry * fx; }
    L.maxNetFabs = Math.max(L.maxNetFabs || 0, fm); L.maxFuAbs = Math.max(L.maxFuAbs || 0, fu); L.maxLoad = Math.max(L.maxLoad || 0, load);
    L.maxNetM = Math.max(L.maxNetM || 0, mm); L.maxMu = Math.max(L.maxMu || 0, Math.hypot(mux, muy, muz));
  }
  function summary() {
    const Eint = L.Eb + L.Et + L.Eu, dE = Eint - L.Eint0;
    L.Dvel = L.DvelFree + L.DvelAtt;
    const D = L.Dbpl + L.Dtpl + L.Dupl + L.Dfrac + L.Dbdamp + L.Dvel + L.Duvan - L.Wudamp;
    const res = L.Wext + L.Wmass - (L.KE - (L.KE0 || 0)) - dE - D;
    // umbrella: work its forces did vs the energy it stored and dissipated; a physical element has -W - dE - D_pl - D_vanish >= 0
    const uImplied = -L.Wumb - L.Eu - L.Dupl - L.Duvan;           // elastic part (should be ~0: a conservative spring)
    const uDamp = -L.Wudamp;                                        // its dashpot (should be >= 0)
    return { ...L, Eint, dE, D, res, relRes: res / Math.max(L.Wext + L.Wmass, 1e-12), uImplied, uDamp };
  }
  return { pre, post, summary };
}

/* ------------------------------------------------------------------ the checks */
const CHECKS = [];
const check = (name, group, slow, fn) => CHECKS.push({ name, group, slow, fn });
const H = () => V().st.h / 1000;

// a charge case by name, aimed at an explicit point (defaults to the bench's aim)
const C_ = (kg, fuze, extra = {}) => ({ src: 'charge', kg, fuze, ...extra });

check('load', 'setup', false, async () => {
  const v = V(), f = F;
  const miss = ['build', 'detonate', 'step', 'settle', 'shockImp'].filter(n => !f[n]);
  record('setup', 'bench loads', miss.length === 0, `N ${v.N} nodes · ${v.NS} bonds · ${v.PL.length} plates · S ${v.S} m · dt ${fmt(v.dt * 1e6, 2)} µs · solver ${v.st.solver} · diff ${v.st.diff} · msc ${v.st.msc}${miss.length ? ' · missing ' + miss.join(',') : ''} · BLAST.ver ${window.BLAST && window.BLAST.ver}`);
  // parameters that set the tear-out threshold (the "brittle" question): the node tears out when its shock impulse
  // per unit mass passes VC; compare with the Nurick-Martin panel that the bench's own readout says tears at phi > 28
  const mt = v.MATS[v.st.mat], h = H(), k = v.TEAR_K, ef = v.EF_MESH;
  const vc = Math.sqrt(2 * k * mt.sy * mt.ef / mt.rho), B = 2.5, L = .75;
  const phiDisc = vc * mt.rho * h * B * L / (2 * h * h * Math.sqrt(B * L * mt.rho * mt.sy));
  record('calibration', 'tear-out threshold', phiDisc >= 20, `v_c = ${fmt(vc, 1)} m/s (TEAR_K ${k}, ef ${mt.ef}): a uniformly loaded ${B}x${L} m, ${st_h()} mm panel tears out at phi = ${fmt(phiDisc, 1)} (δ/h ≈ ${fmt(.48 * phiDisc + .277, 1)}); bench readout marks tearing at phi > 28 · bond fracture strain ${fmt(mt.ef * ef, 3)} at every grid`);
});
const st_h = () => V().st.h;

check('repeat', 'determinism', false, async () => {
  const cfg = C_(120, 'contact', { grid: .25 });
  const a = run(cfg), b = run(C_(30, 'standoff', { standoff: 2, grid: .25 })), c = run(cfg);
  const d = fieldDiff(a, c);
  record('determinism', 'GPU rerun identical', d.meanMm < .01 && d.tornDiff === 0, `A, B, A: mean |du| ${fmt(d.meanMm, 3)} mm, torn cells differing ${d.tornDiff}, hull ${a.hullM2} vs ${c.hullM2} m²`);
  if (!QUICK) {
    const e = run({ ...cfg, solver: 'explicit' }), g = run({ ...cfg, solver: 'explicit' });
    const d2 = fieldDiff(e, g);
    record('determinism', 'CPU rerun identical', d2.meanMm < 1e-6 && d2.tornDiff === 0, `mean |du| ${fmt(d2.meanMm, 4)} mm, torn cells differing ${d2.tornDiff}`);
  }
});

// energy: work done by the loads = kinetic + stored elastic + plastic + fracture + damping (+ what's left)
check('energy', 'conservation', false, async () => {
  const cases = [['30 kg @ 2 m (no tearing)', C_(30, 'standoff', { standoff: 2 })], ['Hellfire 5 kg contact (tearing)', C_(5, 'contact')]];
  if (!QUICK) cases.push(['120 kg @ 3 m', C_(120, 'standoff', { standoff: 3 })]);
  for (const [nm, c] of cases) {
    for (const dts of QUICK ? [1] : [1, .5]) {
      const cfg = { ...c, solver: 'explicit', grid: .25 };
      setup(cfg); let led; const hook = { pre: () => { if (!led) led = makeLedger(); led.pre(); }, post: () => led.post() };
      const R = run(cfg, { hook, dtScale: dts === 1 ? 0 : dts }); const L = led.summary();
      const Wt = L.Wext + L.Wmass, pct = x => fmt(100 * x / Wt, 1) + '%';
      record('conservation', `energy ${nm}${dts !== 1 ? ' dt/2' : ''}`, Math.abs(L.relRes) < .03,
        `W_loads ${fmt(L.Wext / 1e3, 2)} kJ${L.Wmass ? ' + mass-scaling ' + fmt(L.Wmass / 1e3, 2) + ' kJ' : ''} = KE ${pct(L.KE)} + elastic Δ ${pct(L.dE)} + plastic ${pct(L.Dbpl + L.Dtpl + L.Dupl)} (plate bonds ${pct(L.Dbpl)}, frame/stiffener ties ${pct(L.Dtpl)}, bending ${pct(L.Dupl)}) + fracture ${pct(L.Dfrac + L.Duvan)} + bond dashpots ${pct(L.Dbdamp)} + bending dashpot ${pct(L.uDamp)} + global velocity damping ${pct(L.DvelAtt)} on attached plate, ${pct(L.DvelFree)} on loose pieces · unexplained ${pct(L.res)}, of which the bending operator's non-conservative work ${pct(L.uImplied)} · ${R.steps} steps`,
        { L, dts });
      await tick();
    }
  }
});

check('momentum', 'conservation', false, async () => {
  const cfg = { ...C_(30, 'standoff', { standoff: 2 }), solver: 'explicit', grid: .25 };
  setup(cfg); let led; const hook = { pre: () => { if (!led) led = makeLedger(); led.pre(); }, post: () => led.post() };
  run(cfg, { hook }); const L = led.summary();
  record('conservation', 'linear momentum (internal)', L.maxNetFabs < 1e-6 * L.maxLoad,
    `peak |Σ internal forces| ${fmt(L.maxNetFabs / 1e3, 1)} kN against a peak applied load of ${fmt(L.maxLoad / 1e3, 0)} kN (${fmt(100 * L.maxNetFabs / L.maxLoad, 2)}%); the bending operator alone: ${fmt(L.maxFuAbs / 1e3, 1)} kN — bonds are pairwise, the bending force has no reaction on the neighbours`);
  record('conservation', 'angular momentum (internal)', L.maxNetM < 1e-6 * L.maxLoad, `peak |Σ r × F_internal| about the charge ${fmt(L.maxNetM / 1e3, 1)} kN·m; bending operator alone ${fmt(L.maxMu / 1e3, 1)} kN·m`);
});

check('symmetry', 'symmetry', false, async () => {
  const pan = (() => { setup(C_(30, 'standoff', { standoff: 2 })); return panelAt(V().st.aim); })();
  if (!pan) { record('symmetry', 'panel', null, 'no plate grid / FRM: skipped'); return; }
  const aim = pan.pt.slice(), n = V().st.aimN.slice();
  // early (the wave has not reached anything asymmetric: tests the solver) and at the end (the section itself is not
  // mirror-symmetric: bulkhead, edges; information only)
  const TA = F.arrival ? F.arrival(2, 30) : 1e-3;
  for (const [nm, c, solver, grid, tEnd] of [['30 kg @ 2 m, GPU 0.125, early', C_(30, 'standoff', { standoff: 2 }), 'gpu', .125, TA + .6e-3],
    ['30 kg @ 2 m, CPU 0.25, early', C_(30, 'standoff', { standoff: 2 }), 'explicit', .25, TA + .6e-3],
    ['30 kg @ 2 m, GPU 0.125, final', C_(30, 'standoff', { standoff: 2 }), 'gpu', .125, 0], ['120 kg contact (tears), GPU 0.125, final', C_(120, 'contact'), 'gpu', .125, 0]]) {
    const R = run({ ...c, aim, aimN: n, solver, grid }, { tEnd });
    const P = R.PL[pan.pl], S = R.S, key = new Map();
    for (let i = 0; i < R.N; i++) if (R.surf[i] === pan.pl) key.set(Math.round(R.r0[3 * i + P.ua] / S * 2) + ',' + Math.round(R.r0[3 * i + P.va] / S * 2), i);
    let s = 0, t = 0, n2 = 0, torn = 0;
    for (let i = 0; i < R.N; i++) {
      if (R.surf[i] !== pan.pl) continue; const u = R.r0[3 * i + P.ua], vv = R.r0[3 * i + P.va];
      if (Math.abs(u - pan.uc) > 2 || Math.abs(vv - pan.vc) > 1.2 || u >= pan.uc) continue;
      const j = key.get(Math.round((2 * pan.uc - u) / S * 2) + ',' + Math.round(vv / S * 2)); if (j === undefined) continue;
      if (R.nodeTorn[i] !== R.nodeTorn[j]) torn++;
      if (R.free[i] || R.free[j]) continue;
      const a = dmag(R, i), b = dmag(R, j); s += Math.abs(a - b); t += (a + b) / 2; n2++;
    }
    const asym = t > 0 ? s / t : 0;
    record('symmetry', `mirror ${nm}`, tEnd ? asym < .01 && torn === 0 : null,
      `${tEnd ? 't = ' + fmt(tEnd * 1000, 2) + ' ms · ' : ''}panel centre (${fmt(pan.uc, 2)}, ${fmt(pan.vc, 3)}) ± 2 m · mirrored node pairs ${n2} · asymmetry Σ|u−u'|/Σū = ${fmt(100 * asym, 2)}% · torn/intact mismatched pairs ${torn} · max side displacement ${fmt(R.maxDef * 1000, 0)} mm`);
    await tick();
  }
});

check('dt', 'convergence', false, async () => {
  const cases = [['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 }), 'explicit', .25], ['Hellfire contact', C_(5, 'contact'), 'explicit', .25],
    ['120 kg @ 5 m', C_(120, 'standoff', { standoff: 5 }), 'gpu', .125], ['120 kg contact', C_(120, 'contact'), 'gpu', .125], ['120 kg inside', C_(120, 'inside'), 'gpu', .125]];
  for (const [nm, c, solver, grid] of cases) {
    if (QUICK && solver === 'explicit') continue;
    const a = run({ ...c, solver, grid }), b = run({ ...c, solver, grid }, { dtScale: .5 }), d = fieldDiff(a, b);
    const ok = rel(a.maxDef, b.maxDef) < .1 && d.rel < .1 && Math.abs(a.hullM2 - b.hullM2) <= Math.max(.15 * b.hullM2, 2 * a.S * a.S);
    record('convergence', `dt vs dt/2: ${nm} (${solver} ${grid})`, ok,
      `max set ${fmt(a.maxDef * 1000, 0)} / ${fmt(b.maxDef * 1000, 0)} mm · field diff ${fmt(d.meanMm, 1)} mm mean (${fmt(100 * d.rel, 1)}% of max) · side torn ${a.hullM2} / ${b.hullM2} m² · all torn ${fmt(a.areas.reduce((x, y) => x + y), 2)} / ${fmt(b.areas.reduce((x, y) => x + y), 2)} m² · dt ${fmt(a.dt * 1e6, 2)} µs`);
    await tick();
  }
});

check('mesh', 'convergence', true, async () => {
  const pan = (() => { setup(C_(120, 'standoff', { standoff: 5 })); return panelAt(V().st.aim); })();
  const aim = pan ? pan.pt : V().st.aim;
  for (const [nm, c] of [['120 kg @ 5 m (dish)', C_(120, 'standoff', { standoff: 5, aim })], ['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2, aim })],
    ['120 kg contact (hole)', C_(120, 'contact')], ['120 kg inside', C_(120, 'inside')]]) {
    const out = [];
    for (const grid of [.25, .125, .0625]) {
      const R = run({ ...c, solver: 'gpu', grid });
      let cen = 0; if (c.fuze !== 'contact' && c.fuze !== 'inside' && pan) { const i = nearestNode(R, pan.pt); cen = dnorm(R, i, V().st.aimN); }
      out.push({ grid, set: R.maxDef, cen, hull: R.hullM2, all: R.areas.reduce((x, y) => x + y), ms: R.ms, areas: R.areas });
      await tick();
    }
    const [a, b, f] = out;
    const metric = c.fuze === 'contact' || c.fuze === 'inside' ? o => o.all : o => o.cen;
    const ok = rel(metric(b), metric(f)) < .15;
    record('convergence', `mesh ${nm}`, ok, out.map(o => `${o.grid} m: ${c.fuze === 'contact' || c.fuze === 'inside' ? `torn ${o.areas.map(x => fmt(x, 2)).join('/')} m²` : `centre set ${fmt(o.cen * 1000, 1)} mm`}, max set ${fmt(o.set * 1000, 0)} mm, ${fmt(o.ms, 0)} ms`).join(' · ') + ` · 0.125 vs 0.0625 differ ${fmt(100 * rel(metric(b), metric(f)), 0)}% (0.25 vs 0.125 ${fmt(100 * rel(metric(a), metric(b)), 0)}%)`);
  }
});

check('parity', 'gpu-cpu', true, async () => {
  const cases = [['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 })], ['Hellfire contact', C_(5, 'contact')], ['120 kg contact · diff 0.5', C_(120, 'contact')],
    ['120 kg contact · diff 1', C_(120, 'contact', { diff: 1 })]];
  if (!QUICK) cases.push(['120 kg inside', C_(120, 'inside')]);
  for (const [nm, c] of cases) {
    const g = run({ ...c, solver: 'gpu', grid: .25 }); await tick();
    const e = run({ ...c, solver: 'explicit', grid: .25 }); await tick();
    const d = fieldDiff(g, e);
    const ok = rel(g.maxDef, e.maxDef) < .1 && d.rel < .1 && Math.abs(g.areas.reduce((x, y) => x + y) - e.areas.reduce((x, y) => x + y)) <= Math.max(.2 * e.areas.reduce((x, y) => x + y), .25);
    record('gpu-cpu', `GPU vs CPU: ${nm} (0.25)`, ok, `max set ${fmt(g.maxDef * 1000, 0)} / ${fmt(e.maxDef * 1000, 0)} mm · field ${fmt(d.meanMm, 1)} mm mean (${fmt(100 * d.rel, 1)}%) · torn per plate GPU ${g.areas.map(x => fmt(x, 2)).join('/')} vs CPU ${e.areas.map(x => fmt(x, 2)).join('/')} m² · cells differing ${d.tornDiff} · GPU ${fmt(g.ms, 0)} ms, CPU ${fmt(e.ms, 0)} ms`);
  }
});

check('nurick', 'validation', false, async () => {
  const pan = (() => { setup(C_(120, 'standoff', { standoff: 5 })); return panelAt(V().st.aim); })();
  if (!pan) { record('validation', 'Nurick-Martin', null, 'no panel found'); return; }
  const v = V(), mt = v.MATS[v.st.mat], h = H(), n = v.st.aimN;
  for (const [kg, d] of [[120, 8], [120, 5], [120, 3], [30, 3], [30, 2], [10, 1.5]]) {
    const R = run({ ...C_(kg, 'standoff', { standoff: d, aim: pan.pt }), solver: 'gpu', grid: .125 });
    const v2 = V(), s = v2.sim, i0 = nearestNode(R, pan.pt);
    // impulse over the panel as applied (reflected, obliquity) and at its centre
    let Ipan = 0; for (let i = 0; i < R.N; i++) { if (R.surf[i] !== pan.pl) continue;
      const u = R.r0[3 * i + pan.P.ua] - pan.P.u0, w = R.r0[3 * i + pan.P.va] - pan.P.v0;
      if (u < pan.iL * R.S - 1e-6 || u > pan.iR * R.S + 1e-6 || w < pan.jB * R.S - 1e-6 || w > pan.jT * R.S + 1e-6) continue;
      const fu = (u < pan.iL * R.S + 1e-6 || u > pan.iR * R.S - 1e-6) ? .5 : 1, fw = (w < pan.jB * R.S + 1e-6 || w > pan.jT * R.S - 1e-6) ? .5 : 1;
      Ipan += s.PR[i] * s.TD[i] / 2 * R.S * R.S * fu * fw; }
    const Icen = s.PR[i0] * s.TD[i0] / 2 * pan.B * pan.L;
    const nmC = nurick(Icen, pan.B, pan.L, h, mt.rho, mt.sy), nmA = nurick(Ipan, pan.B, pan.L, h, mt.rho, mt.sy);
    const cen = dnorm(R, i0, n), edge = pan.edges.reduce((a, j) => a + (R.free[j] ? 0 : dnorm(R, j, n)), 0) / 4, relD = cen - edge;
    const torn = R.nodeTorn[i0];
    const ok = !torn && Math.abs(relD - nmA.d) <= Math.max(.3 * nmA.d, h);
    record('validation', `Nurick ${kg} kg @ ${d} m`, nmA.phi > 28 ? null : ok,
      `panel ${fmt(pan.B, 2)}×${fmt(pan.L, 2)} m · φ(centre impulse) ${fmt(nmC.phi, 1)} → ${fmt(nmC.d * 1000, 0)} mm · φ(panel-mean impulse) ${fmt(nmA.phi, 1)} → ${fmt(nmA.d * 1000, 0)} mm · simulated centre set ${torn ? 'TORN' : fmt(cen * 1000, 0) + ' mm'}, relative to panel edges ${fmt(relD * 1000, 0)} mm (edges moved ${fmt(edge * 1000, 0)} mm)`);
    await tick();
  }
});

// the model's tear-out onset for a near-uniform load (big charge, 8 m off): phi at first tearing in the panel
check('tearonset', 'validation', false, async () => {
  const pan = (() => { setup(C_(120, 'standoff', { standoff: 8 })); return panelAt(V().st.aim); })();
  if (!pan) return;
  const v = V(), mt = v.MATS[v.st.mat], h = H(); let onset = null; const rows = [];
  for (const kg of [200, 300, 400, 500, 650, 800, 1000, 1400, 2000]) {
    const R = run({ ...C_(kg, 'standoff', { standoff: 8, aim: pan.pt }), solver: 'gpu', grid: .125 });
    const s = V().sim, i0 = nearestNode(R, pan.pt), I = s.PR[i0] * s.TD[i0] / 2 * pan.B * pan.L, nm = nurick(I, pan.B, pan.L, h, mt.rho, mt.sy);
    let tornPan = 0; for (let i = 0; i < R.N; i++) { if (R.surf[i] !== pan.pl) continue; const u = R.r0[3 * i + pan.P.ua] - pan.P.u0, w = R.r0[3 * i + pan.P.va] - pan.P.v0;
      if (u > pan.iL * R.S && u < pan.iR * R.S && w > pan.jB * R.S && w < pan.jT * R.S && R.nodeTorn[i]) tornPan++; }
    rows.push(`${kg} kg φ ${fmt(nm.phi, 1)}: ${tornPan ? 'torn' : fmt(dnorm(R, i0, v.st.aimN) * 1000, 0) + ' mm'}`);
    if (tornPan && onset === null) onset = nm.phi;
    await tick();
    if (onset !== null && rows.length > 2) break;
  }
  record('validation', 'tearing onset (uniform load)', onset === null || onset >= 20, `first tearing in the panel at φ ≈ ${onset === null ? '> range' : fmt(onset, 1)} (bench readout: tearing at φ > 28; δ/h at onset ≈ ${onset ? fmt(.48 * onset + .277, 1) : '-'}) · ${rows.join(' · ')}`);
});

check('springback', 'validation', false, async () => {
  const pan = (() => { setup(C_(120, 'standoff', { standoff: 3 })); return panelAt(V().st.aim); })();
  if (!pan) return;
  for (const [solver, grid] of [['gpu', .125], ...(QUICK ? [] : [['explicit', .25]])]) {
    const c = { ...C_(120, 'standoff', { standoff: 3, aim: pan.pt }), solver, grid };
    setup(c); const i0 = nearestNode(V(), pan.pt);
    const R = run(c, { track: [i0] });
    const fin = dmag(R, i0), pk = R.peak[0];
    record('validation', `springback ${solver} ${grid}`, fin >= .6 * pk, `panel centre: peak ${fmt(pk * 1000, 0)} mm during the response, permanent ${fmt(fin * 1000, 0)} mm (${fmt(100 * fin / pk, 0)}% kept) · max side set ${fmt(R.maxDef * 1000, 0)} mm`);
    await tick();
  }
});

check('mono', 'monotonic', false, async () => {
  const pan = (() => { setup(C_(120, 'standoff', { standoff: 3 })); return panelAt(V().st.aim); })(), aim = pan ? pan.pt : V().st.aim;
  const series = [
    ['charge @ 3 m', [10, 30, 60, 120, 250, 500].map(kg => C_(kg, 'standoff', { standoff: 3, aim })), 'up'],
    ['contact charge', [5, 30, 120, 300, 1200].map(kg => C_(kg, 'contact')), 'up'],
    ['standoff, 120 kg', [8, 5, 3, 2, 1.2].map(d => C_(120, 'standoff', { standoff: d, aim })), 'up'],
    ['side thickness, 120 kg @ 2 m', [6, 10, 16, 25].map(h => C_(120, 'standoff', { standoff: 2, aim, h })), 'down'],
    ['side thickness, 120 kg contact', [6, 10, 16, 25].map(h => C_(120, 'contact', { h })), 'down'],
  ];
  for (const [nm, cfgs, dir] of series) {
    const rs = []; for (const c of cfgs) { rs.push(run({ ...c, solver: 'gpu', grid: .125 })); await tick(); }
    // damage: torn area first; with equal tearing, the largest permanent displacement (local damage). The plastic
    // work over the whole section is shown for information (a farther charge loads a wider area)
    const dmg = rs.map(r => ({ torn: r.areas.reduce((a, b) => a + b), side: r.hullM2, pl: r.plast, set: r.maxDef }));
    let ok = true, why = '';
    for (let k = 1; k < dmg.length; k++) {
      const a = dmg[k - 1], b = dmg[k], sgn = dir === 'up' ? 1 : -1, cell = rs[0].S * rs[0].S;
      const dT = sgn * (b.torn - a.torn);
      if (dT < -cell / 2 || (Math.abs(b.torn - a.torn) < cell / 2 && sgn * (b.set - a.set) < -.02 * Math.max(a.set, b.set))) { ok = false; why += ` step ${k}`; }
    }
    record('monotonic', nm, ok, dmg.map((d, k) => `${JSON.stringify(cfgs[k].kg)}kg${cfgs[k].standoff && cfgs[k].fuze === 'standoff' ? '@' + cfgs[k].standoff : ''}${cfgs[k].h ? ' ' + cfgs[k].h + 'mm' : ''}: torn ${fmt(d.torn, 2)} m², plastic ${fmt(d.pl / 1e3, 0)} kJ, set ${fmt(d.set * 1000, 0)} mm`).join(' · ') + (ok ? '' : ' · reversed at' + why));
  }
});

// the user's two cases, stated generically: A = aim point on the struck plate, n = its outward normal
function regionReport(R, filt, thrSet) {
  let n = 0, torn = 0, pristine = 0, loose = 0, set = []; const byPl = {};
  for (let i = 0; i < R.N; i++) {
    if (R.fix[i] || !filt(i)) continue; n++;
    const b = byPl[R.surf[i]] || (byPl[R.surf[i]] = { n: 0, torn: 0, pristine: 0, max: 0 }); b.n++;
    if (R.nodeTorn[i]) { torn++; b.torn++; if (R.free[i]) loose++; continue; }
    const d = dmag(R, i); set.push(d); b.max = Math.max(b.max, d);
    if (d < thrSet) { pristine++; b.pristine++; }
  }
  set.sort((a, b) => a - b);
  return { n, torn, pristine, loose, med: set.length ? set[set.length >> 1] : 0, byPl };
}
check('user1200', 'user', false, async () => {
  const cfg = C_(1200, 'contact');
  const R = run({ ...cfg, solver: 'gpu', grid: .125 }), A = V().st.aim, n = V().st.aimN;
  const hitPl = R.surf[nearestNode(R, A)];
  const behind = i => { const dx = R.r0[3 * i] - A[0], dy = R.r0[3 * i + 1] - A[1], dz = R.r0[3 * i + 2] - A[2];
    return R.surf[i] !== hitPl && dx * n[0] + dy * n[1] + dz * n[2] < -.05 && Math.hypot(dx, dy, dz) < 2.5; };
  const rep = regionReport(R, behind, .05);
  const hit = (rep.torn + (rep.n - rep.torn - rep.pristine)) / Math.max(rep.n, 1);
  record('user', '1200 kg contact: structure behind', rep.n > 0 && hit >= .5,
    `side torn ${R.hullM2} m² · plating within 2.5 m behind the hole (other plates): ${rep.n} nodes, torn ${rep.torn} (${rep.loose} thrown loose), set > 50 mm ${rep.n - rep.torn - rep.pristine}, under 50 mm ${rep.pristine} (median set ${fmt(rep.med * 1000, 0)} mm) · by plate ${Object.entries(rep.byPl).map(([p, b]) => `#${p}: ${b.n} nodes, torn ${b.torn}, max set ${fmt(b.max * 1000, 0)} mm`).join('; ')} · torn per plate ${R.areas.map(x => fmt(x, 2)).join('/')} m²`);
  // does the load get there? the CPU reference records the shock impulse each node received
  if (!QUICK) {
    const E = run({ ...cfg, solver: 'explicit', grid: .25 });
    let nb = 0, loaded = 0, imax = 0; for (let i = 0; i < E.N; i++) { const dx = E.r0[3 * i] - A[0], dy = E.r0[3 * i + 1] - A[1], dz = E.r0[3 * i + 2] - A[2];
      if (E.fix[i] || E.surf[i] === hitPl || dx * n[0] + dy * n[1] + dz * n[2] >= -.05 || Math.hypot(dx, dy, dz) >= 2.5) continue; nb++; if (E.imp[i] > 0) loaded++; imax = Math.max(imax, E.imp[i]); }
    const rep2 = regionReport(E, i => { const dx = E.r0[3 * i] - A[0], dy = E.r0[3 * i + 1] - A[1], dz = E.r0[3 * i + 2] - A[2];
      return E.surf[i] !== hitPl && dx * n[0] + dy * n[1] + dz * n[2] < -.05 && Math.hypot(dx, dy, dz) < 2.5; }, .05);
    record('user', '1200 kg contact: load reaches it (CPU 0.25)', nb > 0 && loaded / nb > .5,
      `${loaded}/${nb} nodes behind received shock impulse (max ${fmt(imax / 1e3, 1)} kPa·s) · gas in the compartment ${E.gp.slice(0, -1).map(p => fmt(p / 1e3, 0)).join('/')} kPa · behind: torn ${rep2.torn}, dented > 50 mm ${rep2.n - rep2.torn - rep2.pristine}, under 50 mm ${rep2.pristine} · side torn ${E.hullM2} m²`);
  }
});
check('user5000', 'user', false, async () => {
  const W = 5000, R = run({ ...C_(W, 'contact'), solver: 'gpu', grid: .125 });
  const v = V(), C = R.C, reach = .5 * Math.cbrt(W), hops = hopsFromFix(v, Math.ceil(1 / R.S));
  const within = i => hops[i] >= Math.ceil(1 / R.S) && Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2]) < reach;
  const rep = regionReport(R, within, 2 * H());
  // radial profile on the struck plate: torn share and median set by distance
  const hitPl = R.surf[nearestNode(R, v.st.aim)], bins = [];
  for (let r = 0; r < reach; r += 1) { const rr = regionReport(R, i => R.surf[i] === hitPl && hops[i] >= Math.ceil(1 / R.S) && (d => d >= r && d < r + 1)(Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2])), 2 * H());
    if (rr.n) bins.push(`${r}-${r + 1} m: ${fmt(100 * rr.torn / rr.n, 0)}% torn, median set ${fmt(rr.med * 1000, 0)} mm, ${fmt(100 * rr.pristine / rr.n, 0)}% < ${2 * st_h()} mm`); }
  record('user', '5000 kg contact: nothing pristine in reach', rep.n > 0 && rep.pristine / rep.n < .05,
    `within ${fmt(reach, 1)} m of the charge (Z < 0.5, ≥ 1 m from the fixed edges): ${rep.n} nodes, torn ${rep.torn}, set < ${2 * st_h()} mm (pristine) ${rep.pristine} = ${fmt(100 * rep.pristine / Math.max(rep.n, 1), 1)}% · by plate ${Object.entries(rep.byPl).map(([p, b]) => `#${p}: ${b.n}, torn ${b.torn}, pristine ${b.pristine}`).join('; ')} · struck plate by distance: ${bins.join(' · ')}`);
  // the band of deformed but intact plating around the hole: steel should dish and petal, not cut out cleanly
  const R2 = run({ ...C_(1200, 'contact'), solver: 'gpu', grid: .125 });
  for (const [nm, RR] of [['5000 kg', R], ['1200 kg', R2]]) {
    const Cc = RR.C; let rh = 0; for (let i = 0; i < RR.N; i++) if (RR.surf[i] === hitPl && RR.nodeTorn[i]) rh = Math.max(rh, Math.hypot(RR.r0[3 * i] - Cc[0], RR.r0[3 * i + 1] - Cc[1]));
    let band = 0, nb = 0; for (let i = 0; i < RR.N; i++) { if (RR.surf[i] !== hitPl || RR.nodeTorn[i] || RR.fix[i]) continue; const r = Math.hypot(RR.r0[3 * i] - Cc[0], RR.r0[3 * i + 1] - Cc[1]);
      if (r > rh && r < rh + 1) { nb++; if (dmag(RR, i) > 5 * H()) band++; } }
    record('user', `${nm} contact: dished band round the hole`, nb > 0 && band / nb > .5, `hole reaches ${fmt(rh, 2)} m from the charge axis; intact side plating in the 1 m ring outside it: ${nb} nodes, ${fmt(100 * band / Math.max(nb, 1), 0)}% set > 5h (${5 * st_h()} mm)`);
    // petalling: ductile plate opens by tearing radially and folding the petals back, so most of the torn plating
    // stays attached and its rim moves by a good fraction of the hole radius; a brittle cut-out throws it away
    // (heuristic thresholds: under half loose, rim moved > 1/4 of the hole radius)
    const rows = []; let okAll = true;
    for (let p = 0; p < RR.PL.length; p++) {
      let tot = 0, loose = 0, att = 0, rim = 0, rp = 0;
      for (let i = 0; i < RR.N; i++) { if (RR.surf[i] !== p || RR.fix[i] || !RR.nodeTorn[i]) continue; tot++;
        if (RR.free[i]) loose++; else { att++; rim = Math.max(rim, dmag(RR, i)); }
        rp = Math.max(rp, Math.hypot(RR.r0[3 * i] - Cc[0], RR.r0[3 * i + 1] - Cc[1], RR.r0[3 * i + 2] - Cc[2])); }
      if (tot < 20) continue;
      if (p === hitPl && (loose / tot > .5 || rim < .25 * rh)) okAll = false;
      rows.push(`plate #${p}: ${tot} torn nodes, ${fmt(100 * loose / tot, 0)}% thrown loose, attached rim moved ≤ ${fmt(rim, 2)} m`);
    }
    record('user', `${nm} contact: petals, not cut-outs`, okAll, `struck-plate hole radius ${fmt(rh, 2)} m · ` + rows.join(' · '));
  }
});

check('massscale', 'convergence', true, async () => {
  const out = []; for (const msc of [1, 16, 64]) { out.push(run({ ...C_(120, 'inside'), solver: 'gpu', grid: .125, msc })); await tick(); }
  const [a, b, c] = out, tot = r => r.areas.reduce((x, y) => x + y);
  record('convergence', 'mass scaling (120 kg inside)', rel(tot(a), tot(c)) < .15 && rel(a.maxDef, c.maxDef) < .15,
    `torn total x1 ${fmt(tot(a), 2)} · x16 ${fmt(tot(b), 2)} · x64 ${fmt(tot(c), 2)} m² · per plate x1 ${a.areas.map(x => fmt(x, 2)).join('/')} vs x64 ${c.areas.map(x => fmt(x, 2)).join('/')} · max set ${fmt(a.maxDef * 1000, 0)} / ${fmt(b.maxDef * 1000, 0)} / ${fmt(c.maxDef * 1000, 0)} mm · GPU ${fmt(a.ms, 0)} / ${fmt(c.ms, 0)} ms`);
});

// Burke scene (when the bench exposes one). Aim points come from the ship's own data (burke_structure.js); the pass
// criteria are the same generic ones as above.
function burkeSwitch() {
  const v = V(), st = v.st;
  // a scene selector in the page, a scene key in st, or a SCENES table in the module
  const sel = document.querySelector('#bench select#scene');
  const opt = sel && [...sel.options].find(o => /burke|ddg/i.test(o.value + ' ' + o.textContent));
  if (opt) return { scene: isNaN(+opt.value) ? opt.value : +opt.value };
  if (DEF && 'scene' in DEF) return { scene: 'burke' };
  if (v.SCENES) { const k = Object.keys(v.SCENES).find(k => /burke|ddg/i.test(k)); if (k) return { scene: k }; }
  return null;
}
check('burke', 'burke', false, async () => {
  const sw = burkeSwitch();
  if (!sw) { record('burke', 'Burke scene', null, 'the bench has no scene switch yet (no #scene select, st.scene or SCENES): skipped'); return; }
  let mod; try { mod = await import(BASE + 'burke_structure.js?v=' + Date.now()); } catch (e) { record('burke', 'Burke data', false, 'burke_structure.js did not load: ' + e); return; }
  const B = mod.default;
  const zWL = mod.halfBreadth(0, 0), fh = { x: 18, y: (mod.deckY(18) + 10.3) / 2 };
  // the deckhouse side at fh: the outermost 'house' panel point there
  let zH = 8.1; for (const pn of B.PANELS) if (pn.kind === 'house' && pn.n && Math.abs(pn.n[2]) > .9 && pn.poly && Math.abs(pn.c[0] - fh.x) < 12) zH = Math.max(zH, Math.abs(pn.c[2]));
  const cases = [
    { nm: 'contact 1200 kg amidships, waterline', cfg: { kg: 1200, fuze: 'contact', aim: [0, 0, zWL], aimN: [0, 0, 1] }, test: 'behind' },
    { nm: 'contact 120 kg on the deckhouse', cfg: { kg: 120, fuze: 'contact', aim: [fh.x, fh.y, zH], aimN: [0, 0, 1] }, test: 'behind' },
    { nm: 'inside 120 kg, main engine room', cfg: { kg: 120, fuze: 'inside', aim: [0, -.6, zWL], aimN: [0, 0, 1] }, test: 'bounds' },
    { nm: 'contact 5000 kg amidships, waterline', cfg: { kg: 5000, fuze: 'contact', aim: [0, 0, zWL], aimN: [0, 0, 1] }, test: 'reach' },
  ];
  for (const c of cases) {
    let R; try { R = run({ ...sw, src: 'charge', ...c.cfg }); } catch (e) { record('burke', c.nm, false, 'threw: ' + (e && e.stack || e)); continue; }
    const A = c.cfg.aim, n = c.cfg.aimN;
    if (c.test === 'behind') {
      const behind = i => { const dx = R.r0[3 * i] - A[0], dy = R.r0[3 * i + 1] - A[1], dz = R.r0[3 * i + 2] - A[2]; return dx * n[0] + dy * n[1] + dz * n[2] < -.3 && Math.hypot(dx, dy, dz) < 3; };
      const rep = regionReport(R, behind, .05), hit = (rep.n - rep.pristine) / Math.max(rep.n, 1);
      record('burke', c.nm, rep.n > 0 && hit >= .5, `plating 0.3-3 m behind the hit: ${rep.n} nodes, torn ${rep.torn} (${rep.loose} loose), set > 50 mm ${rep.n - rep.torn - rep.pristine}, under 50 mm ${rep.pristine} · torn total ${fmt(R.areas.reduce((a, b) => a + b, 0), 2)} m² · ${fmt(R.ms, 0)} ms`);
    } else if (c.test === 'bounds') {
      const cc = V().sim && V().sim.cc, v = V(); const by = {};
      for (let i = 0; i < R.N; i++) { if (R.fix[i] || !(v.NSP[i] === cc || v.NSN[i] === cc)) continue; const p = R.surf[i], b = by[p] || (by[p] = { n: 0, torn: 0, max: 0, h: R.rh ? R.rh[i] / 7850 : .01 }); b.n++;
        if (R.nodeTorn[i]) b.torn++; else b.max = Math.max(b.max, dmag(R, i)); }
      const plates = Object.entries(by).filter(([, b]) => b.n >= 20), quiet = plates.filter(([, b]) => !b.torn && b.max < 2 * b.h);
      record('burke', c.nm, plates.length > 0 && quiet.length === 0, `compartment ${cc}: ${plates.length} bounding plates; ${quiet.length} of them neither torn nor set > 2h · ${plates.map(([p, b]) => `#${p}: ${b.n} nodes, torn ${b.torn}, max set ${fmt(b.max * 1000, 0)} mm`).join('; ')}`);
    } else {
      const W = c.cfg.kg, reach = .5 * Math.cbrt(W), hops = hopsFromFix(V(), Math.ceil(1 / R.S)), C = R.C;
      const rep = regionReport(R, i => hops[i] >= Math.ceil(1 / R.S) && Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2]) < reach, .02);
      record('burke', c.nm, rep.n > 0 && rep.pristine / rep.n < .05, `within ${fmt(reach, 1)} m: ${rep.n} nodes, torn ${rep.torn} (${rep.loose} loose), set < 20 mm ${rep.pristine} (${fmt(100 * rep.pristine / Math.max(rep.n, 1), 1)}%)`);
    }
    await tick();
  }
});

/* ------------------------------------------------------------------ main */
(async () => {
  try {
    section('loading the bench');
    BI = await loadBench(); F = BI.fn(); DEF = JSON.parse(JSON.stringify(V().st));
    OUT.defaults = DEF;
    OUT.api = { run, setup, V, F, makeLedger, panelAt, nearestNode, dmag, dnorm, fieldDiff, regionReport, hopsFromFix, nurick, glFree };
    for (const c of CHECKS) {
      if (ONLY && !ONLY.includes(c.name) && !ONLY.includes(c.group)) continue;
      if (QUICK && c.slow) continue;
      section(c.name);
      const t0 = performance.now();
      try { await c.fn(); } catch (e) { record(c.group, c.name, false, 'threw: ' + (e && e.stack || e)); }
      OUT[c.name + '_ms'] = Math.round(performance.now() - t0);
      await tick();
    }
  } catch (e) { record('setup', 'load', false, 'threw: ' + (e && e.stack || e)); }
  OUT.done = true; OUT.finished = new Date().toISOString();
  section('done');
})();
