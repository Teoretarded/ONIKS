/* Verification suite for the blast bench (blast.js + gpu.js, shell model v30+). Independent of the bench's checks.
   (The suite for the old lattice model, v22 / 1596bde, is verify.js at commit 99ad039.)

   How it drives the bench: it loads index.html's controls off screen, fetches blast.js, rewrites only its relative
   import of gpu.js to an absolute URL and appends a read-only accessor (window.__BI: live views of the module's
   arrays and functions, plus a dt setter for the time-step study). Nothing in the physics is changed. The render
   loop is not started (requestAnimationFrame is stubbed) and every case runs to its end in slices between UI ticks.

   Scene-agnostic: struck plate, panels (from the scene's stiffener spacing), "behind the hole", "in reach" and the
   boundaries come from the model's own arrays (PAN, CPAN, CN, CER, R0, AK) and the charge position, so the checks run
   on the box section and on the Burke (cases from burke_structure.js when the bench has window.BURKE_SCENE).

   The CPU reference is ~30 ms a step at 0.25 m, so CPU checks use short windows (the loading phase) and full runs
   are GPU. ?only=a,b runs a subset (check or group names), ?quick=1 skips the slow checks. Results: window.VERIFY. */

const BASE = new URL('./', import.meta.url).href;
const Q = new URLSearchParams(location.search);
const ONLY = Q.get('only') ? Q.get('only').split(',') : null, QUICK = Q.get('quick') === '1';
const OUT = { results: [], started: new Date().toISOString(), done: false };
window.VERIFY = OUT;

/* ------------------------------------------------------------------ output */
const logEl = document.getElementById('log'), sumEl = document.getElementById('sum');
const fmt = (x, d = 2) => x === undefined || x === null || Number.isNaN(x) ? '-' : Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? (+x).toExponential(2) : (+x).toFixed(d);
function line(kind, name, msg) {
  const d = document.createElement('div'); d.className = kind;
  d.innerHTML = `<b>${kind.padEnd(4)}</b>  ${name.padEnd(30)} ${msg}`; logEl.appendChild(d);
  console.log(`${kind} ${name}: ${msg}`);
}
function section(t) { const d = document.createElement('div'); d.className = 'sec'; d.textContent = t; logEl.appendChild(d); }
function record(group, name, pass, msg, data) {
  const kind = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO';
  OUT.results.push({ group, name, kind, msg, data });
  line(kind, name, msg);
  const p = OUT.results.filter(r => r.kind === 'PASS').length, f = OUT.results.filter(r => r.kind === 'FAIL').length;
  sumEl.innerHTML = `<b style="color:var(--lime)">${p} pass</b> · <b style="color:var(--coral)">${f} fail</b> · ${OUT.results.length - p - f} info`;
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* ------------------------------------------------------------------ load the bench */
// WebGL objects created per run are tracked and freed before the next run (older gpu.js versions never freed them)
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

const VARS = ['N', 'NC', 'NH', 'NT', 'S', 'dt', 'BETA', 'X', 'V', 'R0', 'M', 'WINV', 'FREE', 'ANC', 'AK', 'AF', 'AC', 'NKIND', 'CN', 'CPAN', 'CH',
  'CMAT', 'CEF', 'CSP', 'CSN', 'CWET', 'CAR', 'CER', 'CEP', 'CDM', 'CTE', 'HN', 'HTP', 'TA', 'TB', 'TFL', 'PAN', 'GP', 'GV', 'OPEN', 'scene', 'sim',
  'st', 'gpu', 'EN', 'F', 'FL', 'MATS', 'MATI', 'G', 'P0', 'U_MEAN', 'RHO_TNT'];
const FNS = ['rectPiece', 'scenePlate', 'loadBurke', 'shipGeometry', 'build', 'detonate', 'startRun', 'step', 'settle', 'energy', 'pulse', 'kinneyPs', 'kinneyIs1', 'reflect', 'arrival1', 'qsp', 'runCase', 'checkEnd'];
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
  // other modules index.html loads besides blast.js (e.g. a scene module), in order
  for (const sc of [...doc.querySelectorAll('script')]) {
    const src = sc.getAttribute('src'), txt = sc.textContent || '';
    const urls = src ? [src] : (txt.match(/import\(\s*["'`][^"'`]+["'`]/g) || []).map(s => s.match(/["'`]([^"'`?]+)/)[1]).concat((txt.match(/from\s+["'`][^"'`]+["'`]/g) || []).map(s => s.match(/["'`]([^"'`?]+)/)[1]));
    for (const u of urls) if (!/blast\.js/.test(u)) await import(new URL(u, BASE).href);
  }
  window.requestAnimationFrame = () => 0;
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
  F.build(); F.detonate(); if (F.startRun) F.startRun();
  // as the bench's own runCase: headless (blocking reads on a fixed schedule, so the run doesn't depend on when GPU
  // fences complete), torn cells read every 4th sync; older benches only know sync
  const s = V().sim; if (window.BLAST && window.BLAST.ver >= 32) { s.headless = true; s.sync = false; } else s.sync = true;
  return s;
}
// one case: to its end (or opt.tEnd), in slices so the page stays alive; opt: dtScale, hook {pre, post}, track [nodes],
// mutate(v) (experiments), maxSteps
async function run(cfg, opt = {}) {
  const s = setup(cfg);
  if (opt.dtScale) BI.setDt(V().dt * opt.dtScale);
  if (opt.mutate) opt.mutate(V());
  const v = V(), gpu = s.solver === 'gpu';
  const peak = opt.track ? new Float64Array(opt.track.length) : null;
  const trk = () => {
    if (gpu) v.gpu.readNodes(true, v.X, v.V, v.FREE);
    const X = v.X, R0 = v.R0;
    opt.track.forEach((i, k) => { const d = Math.hypot(X[3 * i] - R0[3 * i], X[3 * i + 1] - R0[3 * i + 1], X[3 * i + 2] - R0[3 * i + 2]); if (d > peak[k]) peak[k] = d; });
  };
  const t0 = performance.now(); let steps = 0, last = performance.now(); const every = opt.trackEvery || (gpu ? 50 : 5);
  const end = () => opt.tEnd ? Math.min(opt.tEnd, s.T1) : s.T1;          // T1 is live: the bench ends early once settled
  while (s.t < end()) {
    if (opt.hook) opt.hook.pre(); F.step(); if (opt.hook) opt.hook.post(); steps++;
    if (peak && steps % every === 0) trk();
    if (steps > (opt.maxSteps || 1e7)) break;
    if (performance.now() - last > 250) { await tick(); last = performance.now(); }
  }
  if (peak) trk();
  const ms = performance.now() - t0; s.phase = 2; F.settle();
  return collect(cfg, { steps, ms, peak, ended: s.t >= s.T1 - 1e-12 });
}
function collect(cfg, extra) {
  const v = V(), s = v.sim, N = v.N, NC = v.NC;
  const disp = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) disp[i] = v.X[i] - v.R0[i];
  const np = v.PAN.length, areas = new Array(np).fill(0), byKind = {};
  for (let c = 0; c < NC; c++) if (v.CER[c]) { areas[v.CPAN[c]] += v.CAR[c]; const k = v.PAN[v.CPAN[c]].kind; byKind[k] = (byKind[k] || 0) + v.CAR[c]; }
  const nodePl = new Int32Array(N).fill(-1), nodeH = new Float32Array(N), nodeTorn = new Uint8Array(N);
  for (let c = 0; c < NC; c++) for (let k = 0; k < 4; k++) { const i = v.CN[4 * c + k]; if (nodePl[i] < 0) { nodePl[i] = v.CPAN[c]; nodeH[i] = v.CH[c]; } if (v.CER[c]) nodeTorn[i] = 1; }
  for (let i = 0; i < N; i++) if (v.FREE[i]) nodeTorn[i] = 1;
  let epMax = 0; if (v.CEP) for (let k = 3; k < v.CEP.length; k += 4) if (v.CEP[k] > epMax) epMax = v.CEP[k];
  const tot = areas.reduce((a, b) => a + b, 0);
  return { cfg, ...extra, S: v.S, N, NC, dt: v.dt, simT: s.t, T1: s.T1, W: s.W, C: [...s.C], cc: s.cc, solver: s.solver, relax: s.relax,
    areas, byKind, tot, hullM2: byKind[0] || 0, maxDef: s.maxDef, disp, nodeTorn, nodePl, nodeH, free: v.FREE.slice(), cer: v.CER.slice(),
    r0: v.R0, fix: Uint8Array.from(v.AK, a => a > 0 ? 1 : 0), PAN: v.PAN, epMax, gp: [...v.GP], gv: [...v.GV],
    energy: s.solver !== 'gpu' && v.EN && F.energy ? F.energy() : null };
}
const dmag = (R, i) => Math.hypot(R.disp[3 * i], R.disp[3 * i + 1], R.disp[3 * i + 2]);
const dnorm = (R, i, n) => -(R.disp[3 * i] * n[0] + R.disp[3 * i + 1] * n[1] + R.disp[3 * i + 2] * n[2]);   // along -n (away from a charge on +n)
function fieldDiff(a, b, filt) {
  let s = 0, n = 0, mx = 0;
  for (let i = 0; i < a.N; i++) { if (a.free[i] || b.free[i] || (filt && !filt(i))) continue;
    const da = dmag(a, i), db = dmag(b, i); s += Math.abs(da - db); n++; mx = Math.max(mx, da, db); }
  let torn = 0; for (let c = 0; c < a.NC; c++) if (a.cer[c] !== b.cer[c]) torn++;
  return { meanMm: n ? s / n * 1000 : 0, maxMm: mx * 1000, rel: mx > 0 && n ? s / n / mx : 0, tornDiff: torn };
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

/* ------------------------------------------------------------------ geometry helpers (scene-agnostic) */
function nearestNode(R, p, filt) {
  let best = -1, bd = 1e18; const R0 = R.r0 || R.R0;
  for (let i = 0; i < R.N; i++) { if (filt && !filt(i)) continue; const d = (R0[3 * i] - p[0]) ** 2 + (R0[3 * i + 1] - p[1]) ** 2 + (R0[3 * i + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
function nodePlates() { const v = V(), np = new Int32Array(v.N).fill(-1); for (let c = 0; c < v.NC; c++) for (let k = 0; k < 4; k++) { const i = v.CN[4 * c + k]; if (np[i] < 0) np[i] = v.CPAN[c]; } return np; }
// the plate panel between stiffeners around a point (spacings from the scene's panel spec)
function panelAt(pt) {
  const v = V(), np = nodePlates(), i0 = nearestNode({ N: v.N, r0: v.R0 }, pt, i => np[i] >= 0), p = np[i0], P = v.PAN[p], SP = v.scene && v.scene.panels && v.scene.panels[p];
  if (!P || !P.U) return null;
  const d = [pt[0] - P.o[0], pt[1] - P.o[1], pt[2] - P.o[2]], u = d[0] * P.U[0] + d[1] * P.U[1] + d[2] * P.U[2], w = d[0] * P.V[0] + d[1] * P.V[1] + d[2] * P.V[2];
  let eu = P.Lu, ev = P.Lv;
  for (const s of (SP && SP.stiff) || []) { if (s.along === 'v') eu = Math.min(eu, s.every); else ev = Math.min(ev, s.every); }
  const u0 = Math.floor(u / eu) * eu, u1 = Math.min(P.Lu, u0 + eu), v0 = Math.floor(w / ev) * ev, v1 = Math.min(P.Lv, v0 + ev);
  const at = (a, b) => [0, 1, 2].map(q => P.o[q] + P.U[q] * a + P.V[q] * b);
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, onP = i => np[i] === p;
  const R = { N: v.N, r0: v.R0 };
  const uv = i => { const e = [v.R0[3 * i] - P.o[0], v.R0[3 * i + 1] - P.o[1], v.R0[3 * i + 2] - P.o[2]]; return [e[0] * P.U[0] + e[1] * P.U[1] + e[2] * P.U[2], e[0] * P.V[0] + e[1] * P.V[1] + e[2] * P.V[2]]; };
  return { p, P, u0, u1, v0, v1, B: u1 - u0, L: v1 - v0, uc, vc, pt: at(uc, vc), n: P.n, uv,
    centre: nearestNode(R, at(uc, vc), onP), edges: [at(u0, vc), at(u1, vc), at(uc, v0), at(uc, v1)].map(q => nearestNode(R, q, onP)),
    inside: i => { if (!onP(i)) return false; const [a, b] = uv(i); return a >= u0 - 1e-6 && a <= u1 + 1e-6 && b >= v0 - 1e-6 && b <= v1 + 1e-6; } };
}
// graph distance (cell edges) from the boundary anchors, to leave artificial supports out of "in reach"
function hopsFromFix(R, maxHops) {
  const v = V(), N = R.N, H = new Int32Array(N).fill(1e9), q = [];
  for (let i = 0; i < N; i++) if (R.fix[i]) { H[i] = 0; q.push(i); }
  const nb = Array.from({ length: N }, () => []);
  for (let c = 0; c < v.NC; c++) for (let k = 0; k < 4; k++) { const a = v.CN[4 * c + k], b = v.CN[4 * c + ((k + 1) & 3)]; nb[a].push(b); nb[b].push(a); }
  for (let k = 0; k < q.length; k++) { const i = q[k]; if (H[i] >= maxHops) continue; for (const j of nb[i]) if (H[j] > H[i] + 1) { H[j] = H[i] + 1; q.push(j); } }
  return H;
}
// Nurick-Martin (quadrangular plates, uniform load): delta/h = 0.480 phi + 0.277, phi = I / (2 h^2 sqrt(B L rho sy))
const nurick = (I, B, L, h, rho, sy) => { const phi = I / (2 * h * h * Math.sqrt(B * L * rho * sy)); return { phi, d: h * (.48 * phi + .277) }; };
function regionReport(R, filt, thrSet) {
  let n = 0, torn = 0, pristine = 0, loose = 0; const set = [], byPl = {};
  for (let i = 0; i < R.N; i++) {
    if (R.fix[i] || R.nodePl[i] < 0 || !filt(i)) continue; n++;
    const b = byPl[R.nodePl[i]] || (byPl[R.nodePl[i]] = { n: 0, torn: 0, pristine: 0, max: 0 }); b.n++;
    if (R.nodeTorn[i]) { torn++; b.torn++; if (R.free[i]) loose++; continue; }
    const d = dmag(R, i); set.push(d); b.max = Math.max(b.max, d);
    if (d < (typeof thrSet === 'function' ? thrSet(i) : thrSet)) { pristine++; b.pristine++; }
  }
  set.sort((a, b) => a - b);
  return { n, torn, pristine, loose, med: set.length ? set[set.length >> 1] : 0, byPl };
}
const plName = (R, p) => (R.PAN[p] && R.PAN[p].name) || '#' + p;

/* ------------------------------------------------------------------ CPU probe: loads, impulse, momentum, KE */
// after each CPU step F holds the element + load forces of that step and FL the loads alone (anchors, damping and
// gravity are applied separately), so sum(F - FL) is the internal force sum and FL h the impulse the loads gave a node
function cpuProbe(opts = {}) {
  let Vp = null, Xp = null, t0 = 0, keMax = 0; const nodes = opts.nodes || null;
  const P = { Wext: 0, netF: 0, netM: 0, maxLoad: 0, imp: new Float64Array(3), impN: null, keErr: 0, steps: 0 };
  return {
    pre() { const v = V(); if (!Vp) { Vp = new Float64Array(3 * v.N); Xp = new Float64Array(3 * v.N); P.impN = new Float64Array(v.N); } Vp.set(v.V); Xp.set(v.X); t0 = v.sim.t; },
    post() {
      const v = V(), h = v.sim.t - t0, Fa = v.F, FL = v.FL, C = v.sim.C, X = Xp;          // forces were computed at the positions before the step
      let fx = 0, fy = 0, fz = 0, mx = 0, my = 0, mz = 0, load = 0;
      for (let i = 0; i < v.N; i++) {
        const lx = FL[3 * i], ly = FL[3 * i + 1], lz = FL[3 * i + 2];
        if (lx || ly || lz) { const lm = Math.hypot(lx, ly, lz); load += lm; P.impN[i] += lm * h;
          P.Wext += (lx * (Vp[3 * i] + v.V[3 * i]) + ly * (Vp[3 * i + 1] + v.V[3 * i + 1]) + lz * (Vp[3 * i + 2] + v.V[3 * i + 2])) * .5 * h;
          const wt = nodes ? +nodes(i) : 1; if (wt) { P.imp[0] += wt * lx * h; P.imp[1] += wt * ly * h; P.imp[2] += wt * lz * h; } }
        const ix = Fa[3 * i] - lx, iy = Fa[3 * i + 1] - ly, iz = Fa[3 * i + 2] - lz;
        fx += ix; fy += iy; fz += iz;
        const rx = X[3 * i] - C[0], ry = X[3 * i + 1] - C[1], rz = X[3 * i + 2] - C[2];
        mx += ry * iz - rz * iy; my += rz * ix - rx * iz; mz += rx * iy - ry * ix;
      }
      P.netF = Math.max(P.netF, Math.hypot(fx, fy, fz)); P.netM = Math.max(P.netM, Math.hypot(mx, my, mz)); P.maxLoad = Math.max(P.maxLoad, load); P.steps++;
      // the ledger's kinetic energy: plain 1/2 m v^2, or the leapfrog form 1/2 m v(n-1/2).v(n+1/2); either may be used
      if (v.EN) { let ke = 0, kl = 0; for (let i = 0; i < v.N; i++) { ke += .5 * v.M[i] * (v.V[3 * i] ** 2 + v.V[3 * i + 1] ** 2 + v.V[3 * i + 2] ** 2); kl += .5 * v.M[i] * (v.V[3 * i] * Vp[3 * i] + v.V[3 * i + 1] * Vp[3 * i + 1] + v.V[3 * i + 2] * Vp[3 * i + 2]); }
        keMax = Math.max(keMax, ke); P.keErr = Math.max(P.keErr, Math.min(Math.abs(ke - v.EN.kin), Math.abs(kl - v.EN.kin)) / Math.max(keMax, 1e-6)); }
    },
    P };
}

/* ------------------------------------------------------------------ the checks */
const CHECKS = [];
const check = (name, group, slow, fn) => CHECKS.push({ name, group, slow, fn });
const C_ = (kg, fuze, extra = {}) => ({ src: 'charge', kg, fuze, frags: false, casing: 0, ...extra });   // bare charges unless a check says so
const H = () => V().st.h / 1000;
const matOf = () => { const v = V(); return (v.MATI && v.MATS[v.MATI[v.st.mat]]) || v.MATS[0]; };
let PANEL = null;                                    // the side panel around the default aim
const panelCase = () => { if (!PANEL) { setup(C_(30, 'standoff', { standoff: 2, grid: .25 })); PANEL = panelAt(V().st.aim); } return PANEL; };

check('load', 'setup', false, async () => {
  setup(C_(30, 'standoff', { standoff: 2 }));
  const v = V(), miss = ['build', 'detonate', 'step', 'settle'].filter(n => !F[n]);
  record('setup', 'bench loads', miss.length === 0, `BLAST.ver ${window.BLAST && window.BLAST.ver} · scene ${v.scene && v.scene.name} · ${v.N} nodes · ${v.NC} cells · ${v.NH} hinges · ${v.NT} stiffener elements · ${v.PAN.length} panels · S ${v.S} m · dt ${fmt(v.dt * 1e6, 2)} µs${v.scene && v.scene.massAdded !== undefined ? ' · mass added for the step ' + fmt(100 * v.scene.massAdded, 3) + '%' : ''} · solver ${v.st.solver}${miss.length ? ' · missing ' + miss.join(',') : ''}`);
});

check('repeat', 'determinism', false, async () => {
  const cfg = C_(120, 'contact', { grid: .25 });
  const a = await run(cfg), b = await run(C_(30, 'standoff', { standoff: 2, grid: .25 })), c = await run(cfg);
  const d = fieldDiff(a, c);
  record('determinism', 'GPU rerun identical', d.meanMm < .01 && d.tornDiff === 0, `A, B, A: mean |du| ${fmt(d.meanMm, 4)} mm, torn cells differing ${d.tornDiff}, torn ${fmt(a.tot, 2)} vs ${fmt(c.tot, 2)} m² · ${fmt(a.ms / 1000, 1)} s a run, ended at ${fmt(a.simT * 1e3, 0)} ms (T1 ${fmt(a.T1 * 1e3, 0)} ms)`);
  const e = await run({ ...cfg, solver: 'cpu' }, { tEnd: 2e-3 }), g = await run({ ...cfg, solver: 'cpu' }, { tEnd: 2e-3 });
  const d2 = fieldDiff(e, g);
  record('determinism', 'CPU rerun identical (2 ms)', d2.meanMm < 1e-6 && d2.tornDiff === 0, `mean |du| ${fmt(d2.meanMm, 6)} mm, torn cells differing ${d2.tornDiff}`);
});

// energy: the bench's own ledger (CPU) must close, and agree with an independent count of the kinetic energy and of
// the loads' work (FL at the step-mean velocity, the way explicit integration gains kinetic energy)
check('energy', 'conservation', false, async () => {
  const cases = [['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 }), 6e-3], ['Hellfire 5 kg contact', C_(5, 'contact'), 4e-3], ['120 kg contact', C_(120, 'contact'), 4e-3]];
  for (const [nm, c, tEnd] of cases) for (const dts of QUICK ? [1] : [1, .5]) {
    const pr = cpuProbe();
    const R = await run({ ...c, solver: 'cpu', grid: .25 }, { tEnd, hook: pr, dtScale: dts === 1 ? 0 : dts });
    const e = R.energy; if (!e) { record('conservation', `energy ${nm}`, false, 'no energy ledger (EN) on the CPU'); continue; }
    const W = e.input, pct = x => fmt(100 * x / W, 1) + '%', P = e.parts;
    const extErr = rel(pr.P.Wext, P.ext);
    record('conservation', `energy ${nm}, first ${tEnd * 1e3} ms${dts !== 1 ? ', dt/2' : ''}`, Math.abs(e.err) / W < .03 && extErr < .02 && pr.P.keErr < .01,
      `loads' work ${fmt(W / 1e3, 2)} kJ (independent count ${fmt(pr.P.Wext / 1e3, 2)} kJ) = kinetic ${pct(e.kin)} + elastic ${pct(e.el)} + plastic ${pct(e.pl)} (membrane ${pct(P.plM)}, hinges ${pct(P.plH)}, stiffeners ${pct(P.plT)}, boundary ${pct(P.plA)}) + damping ${pct(e.damp)} + contact ${pct(e.contact)} + fracture ${pct(P.frac)}${P.water ? ' + water ' + pct(P.water) : ''} · unexplained ${pct(e.err)} · KE ledger vs Σ½mv² ${fmt(100 * pr.P.keErr, 3)}% · ${R.steps} steps`);
    await tick();
  }
  if (!QUICK) {
    const R = await run({ ...C_(30, 'standoff', { standoff: 2 }), solver: 'cpu', grid: .25 }, { maxSteps: 12000 });
    const e = R.energy, W = e.input, pct = x => fmt(100 * x / W, 1) + '%';
    record('conservation', 'energy 30 kg @ 2 m, whole run', Math.abs(e.err) / W < .03 && e.damp / W < .15,
      `t ${fmt(R.simT * 1e3, 1)} ms${R.ended ? '' : ' (cut at 12000 steps)'} · kinetic ${pct(e.kin)} · elastic ${pct(e.el)} · plastic ${pct(e.pl)} · damping ${pct(e.damp)} (pass needs < 15 %) · contact ${pct(e.contact)} · unexplained ${pct(e.err)} · ${fmt(R.ms / 1000, 0)} s`);
  }
});

check('momentum', 'conservation', false, async () => {
  for (const [nm, c] of [['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 })], ['120 kg contact (tearing)', C_(120, 'contact')]]) {
    const pr = cpuProbe();
    await run({ ...c, solver: 'cpu', grid: .25 }, { tEnd: 3e-3, hook: pr });
    record('conservation', `momentum: ${nm}`, pr.P.netF < 1e-6 * pr.P.maxLoad && pr.P.netM < 1e-5 * pr.P.maxLoad,
      `first 3 ms, CPU: peak |Σ internal forces| ${fmt(pr.P.netF, 3)} N, |Σ r × F| ${fmt(pr.P.netM, 3)} N·m, against a peak load of ${fmt(pr.P.maxLoad / 1e3, 0)} kN (internal = element forces incl. contact push-back; anchors, damping, gravity excluded)`);
    await tick();
  }
});

check('symmetry', 'symmetry', false, async () => {
  const pan = panelCase(); if (!pan) { record('symmetry', 'panel', null, 'no panel found'); return; }
  const aim = pan.pt, n = pan.n;
  for (const [nm, c, solver, grid, tEnd] of [['30 kg @ 2 m, GPU 0.125, early', C_(30, 'standoff', { standoff: 2 }), 'gpu', .125, 3e-3],
    ['30 kg @ 2 m, CPU 0.25, early', C_(30, 'standoff', { standoff: 2 }), 'cpu', .25, 3e-3],
    // (tearing: at 1 ms, before the section's bulkheads, 5 and 10 m off the charge and not mirrors of each other, send
    // their waves back: at 2 ms the CPU in double and the GPU give the same 5.3 % asymmetry, with every torn cell paired)
    ['120 kg contact, GPU 0.125, early (tearing)', C_(120, 'contact'), 'gpu', .125, 1e-3],
    ['120 kg contact, CPU 0.25, early (tearing)', C_(120, 'contact'), 'cpu', .25, 1e-3],
    ['30 kg @ 2 m, GPU 0.125, final', C_(30, 'standoff', { standoff: 2 }), 'gpu', .125, 0]]) {
    const R = await run({ ...c, aim, aimN: n, solver, grid }, { tEnd });
    const pn = panelAt(aim), key = new Map(), S = R.S;
    for (let i = 0; i < R.N; i++) if (R.nodePl[i] === pn.p) { const [u, w] = pn.uv(i); key.set(Math.round(u / S * 2) + ',' + Math.round(w / S * 2), i); }
    let s = 0, t = 0, n2 = 0, torn = 0;
    for (let i = 0; i < R.N; i++) {
      if (R.nodePl[i] !== pn.p) continue; const [u, w] = pn.uv(i);
      if (Math.abs(u - pn.uc) > 2 || Math.abs(w - pn.vc) > 1 || u >= pn.uc) continue;
      const j = key.get(Math.round((2 * pn.uc - u) / S * 2) + ',' + Math.round(w / S * 2)); if (j === undefined) continue;
      if (R.nodeTorn[i] !== R.nodeTorn[j]) torn++;
      if (R.free[i] || R.free[j]) continue;
      const a = dmag(R, i), b = dmag(R, j); s += Math.abs(a - b); t += (a + b) / 2; n2++;
    }
    const asym = t > 0 ? s / t : 0;
    record('symmetry', `mirror ${nm}`, tEnd ? asym < .01 && torn <= 2 : null,
      `${tEnd ? 't = ' + fmt(tEnd * 1000, 1) + ' ms · ' : ''}panel centre u ${fmt(pn.uc, 2)} ± 2 m · pairs ${n2} · asymmetry Σ|u−u'|/Σū ${fmt(100 * asym, 3)}% · torn/intact mismatched pairs ${torn} · max side displacement ${fmt(R.maxDef * 1000, 0)} mm`);
    await tick();
  }
});

check('dt', 'convergence', false, async () => {
  const cases = [['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 }), 'cpu', .25, 4e-3], ['120 kg contact', C_(120, 'contact'), 'cpu', .25, 3e-3],
    ['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 }), 'gpu', .125, 0], ['120 kg contact', C_(120, 'contact'), 'gpu', .125, 0]];
  for (const [nm, c, solver, grid, tEnd] of cases) {
    if (QUICK && solver === 'gpu') continue;
    const a = await run({ ...c, solver, grid }, { tEnd }), b = await run({ ...c, solver, grid }, { tEnd, dtScale: .5 }), d = fieldDiff(a, b);
    const ok = rel(a.maxDef, b.maxDef) < .1 && d.rel < .1 && Math.abs(a.tot - b.tot) <= Math.max(.15 * b.tot, 4 * a.S * a.S);
    record('convergence', `dt vs dt/2: ${nm} (${solver} ${grid}${tEnd ? ', ' + tEnd * 1e3 + ' ms' : ''})`, ok,
      `max side displacement ${fmt(a.maxDef * 1000, 1)} / ${fmt(b.maxDef * 1000, 1)} mm · field diff ${fmt(d.meanMm, 2)} mm mean (${fmt(100 * d.rel, 1)}% of max) · torn ${fmt(a.tot, 2)} / ${fmt(b.tot, 2)} m² · dt ${fmt(a.dt * 1e6, 2)} µs`);
    await tick();
  }
});

check('mesh', 'convergence', true, async () => {
  const pan = panelCase();
  for (const [nm, c, grids] of [['120 kg @ 5 m (dish)', C_(120, 'standoff', { standoff: 5, aim: pan.pt }), [.25, .125, .0625]],
    ['120 kg contact (hole)', C_(120, 'contact'), [.25, .125, .0625]]]) {
    const out = [];
    for (const grid of grids) {
      const R = await run({ ...c, solver: 'gpu', grid });
      const pn = panelAt(pan.pt), cen = dnorm(R, pn.centre, pn.n), ed = pn.edges.reduce((a, j) => a + dnorm(R, j, pn.n), 0) / 4;
      out.push({ grid, set: R.maxDef, cen, rel: cen - ed, tot: R.tot, ms: R.ms });
      await tick();
    }
    const hole = c.fuze === 'contact', m = o => hole ? o.tot : o.cen, [a, b, f] = out;
    record('convergence', `mesh ${nm}`, rel(m(b), m(f)) < .15,
      out.map(o => `${o.grid} m: ${hole ? 'torn ' + fmt(o.tot, 2) + ' m²' : 'centre ' + fmt(o.cen * 1000, 1) + ' mm (dish ' + fmt(o.rel * 1000, 1) + ')'}, max ${fmt(o.set * 1000, 0)} mm, ${fmt(o.ms / 1000, 1)} s`).join(' · ') + ` · 0.125 vs 0.0625 ${fmt(100 * rel(m(b), m(f)), 0)}% (0.25 vs 0.125 ${fmt(100 * rel(m(a), m(b)), 0)}%)`);
  }
});

// GPU vs the CPU reference: the same model? (short windows: the CPU is slow)
check('parity', 'gpu-cpu', false, async () => {
  for (const [nm, c, tEnd] of [['30 kg @ 2 m', C_(30, 'standoff', { standoff: 2 }), 5e-3], ['Hellfire contact', C_(5, 'contact'), 3e-3],
    ['120 kg contact', C_(120, 'contact'), 3e-3], ['120 kg inside', C_(120, 'inside'), 3e-3], ['Oniks with casing + fragments', C_(120, 'contact', { casing: 130, frags: true }), 3e-3]]) {
    const g = await run({ ...c, solver: 'gpu', grid: .25 }, { tEnd }); const e = await run({ ...c, solver: 'cpu', grid: .25 }, { tEnd });
    const d = fieldDiff(g, e);
    record('gpu-cpu', `GPU vs CPU: ${nm} (0.25, ${tEnd * 1e3} ms)`, d.rel < .05 && rel(g.maxDef, e.maxDef) < .05 && Math.abs(g.tot - e.tot) <= Math.max(.1 * e.tot, 2 * g.S * g.S),
      `max side displacement ${fmt(g.maxDef * 1000, 1)} / ${fmt(e.maxDef * 1000, 1)} mm · field ${fmt(d.meanMm, 2)} mm mean (${fmt(100 * d.rel, 2)}%) · torn ${fmt(g.tot, 2)} / ${fmt(e.tot, 2)} m², cells differing ${d.tornDiff}`);
    await tick();
  }
});

// A test rig built in the bench's own scene format: one plate (default 2.5 x 0.75 m, 10 mm HSLA: the side panel
// between frames and longitudinals) welded into a 50 mm, 0.3 m deep frame whose far edges are held. The junction
// hinges carry the plate's plastic moment, so the plate is clamped as in the Nurick-Martin tests. It goes in through
// the scene hook the bench already has (window.BURKE_SCENE with st.scene 'burke'), restored afterwards.
function rigScene(o = {}) {
  const v = V(), { B = 2.5, L = .75, h = .006, D = .3, hw = .05, mat = 'mild' } = o, mi = v.MATI ? v.MATI[mat] : 0;
  const ad = (a, b) => a.map((x, i) => x + b[i]);
  const P = (name, kind, org, U, W, hh, open) => ({ name, kind, p00: org, p10: ad(org, U), p01: ad(org, W), p11: ad(ad(org, U), W), h: hh, mat: mi, stiff: [], open, imperfect: false });
  const panels = [P('plate', 0, [0, 0, 0], [B, 0, 0], [0, L, 0], h, [0, 0, 0, 0]),
    P('frame x0', 3, [0, 0, 0], [0, 0, -D], [0, L, 0], hw, [0, 1, 0, 0]), P('frame xB', 3, [B, 0, 0], [0, 0, -D], [0, L, 0], hw, [0, 1, 0, 0]),
    P('frame y0', 3, [0, 0, 0], [B, 0, 0], [0, 0, -D], hw, [0, 0, 0, 1]), P('frame yL', 3, [0, L, 0], [B, 0, 0], [0, 0, -D], hw, [0, 0, 0, 1])];
  const inBox = p => p[0] > 0 && p[0] < B && p[1] > 0 && p[1] < L && p[2] < 0 && p[2] > -D;
  // newer benches take "pieces" (rectPiece(panel)); older ones take the panels themselves
  const geo = F.rectPiece ? { pieces: panels.map(F.rectPiece) } : { panels };
  return { name: 'rig', ...geo, spaces: [{ name: 'behind', box: null, V: 1e6 }, { name: 'outside', box: null, V: Infinity }], OUT: 1, aimNDefault: [0, 0, 1],
    spaceAt: p => inBox(p) ? 0 : 1, waterline: -1000, aimDefault: [B / 2, L / 2, 0], cam: { tgt: [B / 2, L / 2, 0], dist: 6 }, aimOK: () => true, B, L, h, mat };
}
// the bench's own clamped-plate scene ('plate', 2.5 x 0.75 m centred on the origin) when it has one, else the rig above
// through the old scene hook (window.BURKE_SCENE)
async function onRig(rig, fn) {
  if (F.scenePlate) return fn({ scene: 'plate', aim: [0, 0, 0], aimN: [0, 0, 1], h: rig.h * 1000, mat: rig.mat }, { cx: 0, cy: 0 });
  const orig = window.BURKE_SCENE; window.BURKE_SCENE = () => rig;
  try { return await fn({ scene: 'burke', aim: [rig.B / 2, rig.L / 2, 0], aimN: [0, 0, 1], h: rig.h * 1000, mat: rig.mat }, { cx: rig.B / 2, cy: rig.L / 2 }); } finally { window.BURKE_SCENE = orig; }
}
async function rigCase(rig, kg, d, opt = {}) {
  return onRig(rig, async (base, at) => {
    const c = { ...base, ...C_(kg, 'standoff', { standoff: d }) }, grid = opt.grid || .125, { cx, cy } = at, B = rig.B, L = rig.L;
    setup({ ...c, grid });
    const v = V();
    // the free plate: z = 0 plane inside the clamped outline; edge nodes count half, corners a quarter
    const inP = (R0, i) => Math.abs(R0[3 * i + 2]) < .02 && Math.abs(R0[3 * i] - cx) <= B / 2 + 1e-6 && Math.abs(R0[3 * i + 1] - cy) <= L / 2 + 1e-6;
    const wgt = i => { if (!inP(v.R0, i)) return 0; const eu = Math.abs(Math.abs(v.R0[3 * i] - cx) - B / 2) < 1e-6, ew = Math.abs(Math.abs(v.R0[3 * i + 1] - cy) - L / 2) < 1e-6; return (eu ? .5 : 1) * (ew ? .5 : 1); };
    let I = opt.I;
    if (I === undefined) {
      const pr = cpuProbe({ nodes: wgt }), W3 = Math.cbrt(kg);
      await run({ ...c, solver: 'cpu', grid }, { tEnd: W3 * F.arrival1(d / W3) + 3e-3, hook: pr });
      I = Math.abs(pr.P.imp[2]);
    }
    const cen0 = nearestNode({ N: v.N, r0: v.R0 }, [cx, cy, 0]);
    const R = await run({ ...c, solver: opt.solver || 'gpu', grid }, { track: opt.track ? [cen0] : null });
    const R0 = { N: R.N, r0: R.r0 };
    const cen = nearestNode(R0, [cx, cy, 0]), edges = [[cx - B / 2, cy, 0], [cx + B / 2, cy, 0], [cx, cy - L / 2, 0], [cx, cy + L / 2, 0]].map(q => nearestNode(R0, q));
    const n = [0, 0, 1], dc = dnorm(R, cen, n), de = edges.reduce((a, j) => a + dnorm(R, j, n), 0) / 4;
    let torn = 0; const vv = V();
    for (let c2 = 0; c2 < R.NC; c2++) if (R.cer[c2]) { let k = 0; for (let q = 0; q < 4; q++) k += inP(R.r0, vv.CN[4 * c2 + q]); if (k === 4) torn++; }
    return { R, I, dish: dc - de, edge: de, torn, cen, peak: R.peak ? R.peak[0] : 0, scene: base.scene };
  });
}
// Nurick-Martin's fit is for plates loaded well into the plastic range (mild steel, energy ratio Er = kinetic energy
// given / elastic strain energy capacity >> 1); the rig uses 6 mm mild steel and judges only cases with Er >= 10
check('nurick', 'validation', false, async () => {
  const rig = rigScene(), mt = V().MATS[V().MATI[rig.mat]] || V().MATS[0];
  const cases = QUICK ? [[10, 2], [30, 2]] : [[5, 2], [10, 2], [20, 2], [30, 2], [45, 2], [20, 1.2]];
  for (const [kg, d] of cases) {
    const r = await rigCase(rig, kg, d);
    const nm = nurick(r.I, rig.B, rig.L, rig.h, mt.rho, mt.sy), mass = mt.rho * rig.h * rig.B * rig.L;
    const Er = (r.I * r.I / (2 * mass)) / (mt.sy * mt.sy / (2 * mt.E) * rig.h * rig.B * rig.L);
    record('validation', `Nurick rig ${kg} kg @ ${d} m`, nm.phi > 28 || Er < 10 ? null : r.torn === 0 && Math.abs(r.dish - nm.d) <= Math.max(.3 * nm.d, rig.h),
      `clamped ${rig.B}×${rig.L} m, ${rig.h * 1000} mm ${rig.mat} plate (scene ${r.scene}) · impulse on it ${fmt(r.I, 0)} N·s (CPU) → φ ${fmt(nm.phi, 1)}, Er ${fmt(Er, 1)} → Nurick-Martin δ ${fmt(nm.d * 1000, 0)} mm · simulated (GPU 0.125): ${r.torn ? r.torn + ' cells torn, ' : ''}dish ${fmt(r.dish * 1000, 0)} mm = ${fmt(r.dish / rig.h, 1)}h (edges ${fmt(r.edge * 1000, 1)} mm) · ${fmt(r.R.ms / 1000, 1)} s${Er < 10 ? ' · not judged: Er < 10, largely elastic' : ''}`);
    await tick();
  }
});

// tearing onset under a near-uniform load on the rig: phi at the first torn plate cell
check('tearonset', 'validation', false, async () => {
  const rig = rigScene(), mt = V().MATS[V().MATI[rig.mat]] || V().MATS[0]; let onset = null, last = null; const rows = [];
  for (const kg of [30, 60, 90, 130, 180, 250, 350, 500]) {
    const r = await rigCase(rig, kg, 2);
    const nm = nurick(r.I, rig.B, rig.L, rig.h, mt.rho, mt.sy);
    rows.push(`${kg} kg φ ${fmt(nm.phi, 1)}: ${r.torn ? r.torn + ' cells torn' : 'dish ' + fmt(r.dish / rig.h, 1) + 'h'}`);
    await tick();
    if (r.torn) { onset = nm.phi; break; } last = nm.phi;
  }
  record('validation', 'tearing onset (clamped rig)', onset === null || onset >= 20, `first torn cell between φ ${fmt(last, 1)} and ${onset === null ? '> range' : fmt(onset, 1)} (clamped steel plates in tests tear at the edges from φ ≈ 25-30, δ/h ≈ 12-15) · ${rows.join(' · ')}`);
});

check('springback', 'validation', false, async () => {
  const rig = rigScene();
  const r = await rigCase(rig, 30, 2, { track: true, I: 0 });
  const fin = dmag(r.R, r.cen);
  record('validation', 'springback (clamped rig, 30 kg @ 2 m)', fin >= .8 * r.peak, `plate centre: peak ${fmt(r.peak * 1000, 0)} mm during the response, permanent ${fmt(fin * 1000, 0)} mm (${fmt(100 * fin / Math.max(r.peak, 1e-9), 0)}% kept; a thin plate dished several h keeps ~90 %)`);
  const pan = panelCase(), c = { ...C_(120, 'standoff', { standoff: 3, aim: pan.pt }), solver: 'gpu', grid: .125 };
  setup(c); const pn = panelAt(pan.pt);
  const R = await run(c, { track: [pn.centre] }), f2 = dmag(R, pn.centre);
  record('validation', 'springback (box side, 120 kg @ 3 m)', null, `side panel centre: peak ${fmt(R.peak[0] * 1000, 0)} mm, permanent ${fmt(f2 * 1000, 0)} mm (${fmt(100 * f2 / R.peak[0], 0)}% kept; includes the elastic swing of the whole stiffened side)`);
});

check('mono', 'monotonic', true, async () => {
  const pan = panelCase(), aim = pan.pt;
  const series = [
    ['charge @ 3 m', [30, 120, 500, 2000].map(kg => C_(kg, 'standoff', { standoff: 3, aim })), 'up'],
    ['contact charge', [5, 30, 120, 500, 1200].map(kg => C_(kg, 'contact')), 'up'],
    ['standoff, 120 kg', [8, 4, 2, 1].map(d => C_(120, 'standoff', { standoff: d, aim })), 'up'],
    ['side thickness, 120 kg contact', [6, 10, 16, 25].map(h => C_(120, 'contact', { h })), 'down'],
  ];
  for (const [nm, cfgs, dir] of series) {
    const rs = []; for (const c of cfgs) { rs.push(await run({ ...c, solver: 'gpu', grid: .125 })); await tick(); }
    let ok = true, why = '';
    for (let k = 1; k < rs.length; k++) {
      const a = rs[k - 1], b = rs[k], sgn = dir === 'up' ? 1 : -1, cell = a.S * a.S;
      if (sgn * (b.tot - a.tot) < -2 * cell || (Math.abs(b.tot - a.tot) < 2 * cell && sgn * (b.maxDef - a.maxDef) < -.02 * Math.max(a.maxDef, b.maxDef))) { ok = false; why += ` step ${k}`; }
    }
    record('monotonic', nm, ok, rs.map((r, k) => `${cfgs[k].kg} kg${cfgs[k].fuze === 'standoff' ? ' @' + cfgs[k].standoff + ' m' : ''}${cfgs[k].h ? ' ' + cfgs[k].h + ' mm' : ''}: torn ${fmt(r.tot, 2)} m², max ${fmt(r.maxDef * 1000, 0)} mm`).join(' · ') + (ok ? '' : ' · reversed at' + why));
  }
});

// the user's cases, stated generically: A = aim point on the struck plate, n = its outward normal
function behindOf(R, A, n, hitPl, rMax) {
  return i => { const dx = R.r0[3 * i] - A[0], dy = R.r0[3 * i + 1] - A[1], dz = R.r0[3 * i + 2] - A[2];
    return R.nodePl[i] !== hitPl && dx * n[0] + dy * n[1] + dz * n[2] < -.1 && Math.hypot(dx, dy, dz) < rMax; };
}
function petals(R, hitPl, C) {
  let tot = 0, loose = 0, rim = 0; const ds = [];
  for (let i = 0; i < R.N; i++) if (R.nodePl[i] === hitPl && R.nodeTorn[i] && !R.fix[i]) { tot++; ds.push(Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2])); if (R.free[i]) loose++; else rim = Math.max(rim, dmag(R, i)); }
  ds.sort((a, b) => a - b); const rh = ds.length ? ds[Math.floor(.9 * (ds.length - 1))] : 0;      // hole radius: 90 % of the torn plating is inside it
  let band = 0, nb = 0;
  for (let i = 0; i < R.N; i++) { if (R.nodePl[i] !== hitPl || R.nodeTorn[i] || R.fix[i]) continue; const r = Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2]);
    if (r > rh && r < rh + 1) { nb++; if (dmag(R, i) > 5 * R.nodeH[i]) band++; } }
  return { rh, tot, loose, rim, band, nb };
}
// petals (the bench's option, WebGPU): of the plating the hole opened on the struck plate, how much is bent back and
// still attached against how much was cut out or eroded (BLAST.petalReport: area, not torn nodes). It rebuilds the
// model, so it runs after everything else has used the plain run
async function petalCheck(tag, W, grid) {
  const cfg = C_(W, 'contact'), B = window.BLAST;
  if (!B || !B.petalReport || !B.webgpu || !B.webgpu()) { record('user', `${tag}: petals, not cut-outs`, null, 'needs the bench\'s petals option on WebGPU: skipped'); return; }
  const t0 = performance.now();
  await B.runCaseAsync({ ...cfg, solver: 'gpu', backend: 'webgpu', grid, petals: true });
  const p = B.petalReport();
  record('user', `${tag}: petals, not cut-outs`, !!p.petals,
    `petals on (WebGPU, ${grid} m), struck plate ${p.plate}: eroded ${fmt(p.erodedM2, 1)} m², cut out ${fmt(p.looseM2, 1)} m², bent back and attached ${fmt(p.flapM2, 1)} m² · petal share ${fmt(p.petalShare, 2)} (pass ≥ 0.35), cut-out share ${fmt(p.cutoutShare, 2)} (pass ≤ 0.3) · ${p.splits} nodes split (${p.secondSplits} twice) · ${fmt((performance.now() - t0) / 1000, 1)} s`);
}
async function userContact(tag, W, grid, extra = {}) {
  const cfg = C_(W, 'contact', { ...extra });
  const R = await run({ ...cfg, solver: 'gpu', grid }), v = V(), A = v.st.aim, n = v.st.aimN;
  const hitPl = R.nodePl[nearestNode(R, A, i => R.nodePl[i] >= 0)];
  const rep = regionReport(R, behindOf(R, A, n, hitPl, 2.5), .05), hit = (rep.n - rep.pristine) / Math.max(rep.n, 1);
  record('user', `${tag}: structure behind`, rep.n > 0 && hit >= .5,                     // torn, blown loose or set > 50 mm all count as a response
    `hull torn ${fmt(R.hullM2, 2)} m² · plating of other plates within 2.5 m behind the hit: ${rep.n} nodes, torn ${rep.torn} (${rep.loose} thrown loose), set > 50 mm ${rep.n - rep.torn - rep.pristine}, under 50 mm ${rep.pristine} · ${Object.entries(rep.byPl).map(([p, b]) => `${plName(R, p)}: ${b.n} nodes, torn ${b.torn}, max set ${fmt(b.max * 1000, 0)} mm`).join('; ')} · gas ${R.gp.filter((p, k) => R.gv[k] < Infinity).map(p => fmt(p / 1e3, 0)).join('/')} kPa · ${fmt(R.ms / 1000, 1)} s`);
  return R;
}
check('user1200', 'user', false, async () => {
  await userContact('1200 kg contact', 1200, .125);
  // does the load get there? the CPU reference records the impulse each node received (first 4 ms)
  const pr = cpuProbe();
  const E = await run({ ...C_(1200, 'contact'), solver: 'cpu', grid: .25 }, { tEnd: 4e-3, hook: pr });
  const v = V(), A = v.st.aim, n = v.st.aimN, hitPl = E.nodePl[nearestNode(E, A, i => E.nodePl[i] >= 0)], beh = behindOf(E, A, n, hitPl, 2.5);
  let nb = 0, loaded = 0, imax = 0; for (let i = 0; i < E.N; i++) { if (E.fix[i] || E.nodePl[i] < 0 || !beh(i)) continue; nb++; if (pr.P.impN[i] > 0) loaded++; imax = Math.max(imax, pr.P.impN[i]); }
  record('user', '1200 kg contact: load reaches it (CPU 0.25, 4 ms)', nb > 0 && loaded / nb > .5, `${loaded}/${nb} nodes behind the hit received load (max ${fmt(imax, 0)} N·s on one node) · gas ${E.gp.filter((p, k) => E.gv[k] < Infinity).map(p => fmt(p / 1e3, 0)).join('/')} kPa at 4 ms`);
  await petalCheck('1200 kg contact', 1200, .125);
});
check('user5000', 'user', false, async () => {
  const W = 5000, R = await userContact('5000 kg contact', W, .125);
  const C = R.C, reach = .5 * Math.cbrt(W), hops = hopsFromFix(R, Math.ceil(1 / R.S));
  const within = i => hops[i] >= Math.ceil(1 / R.S) && Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2]) < reach;
  const rep = regionReport(R, within, i => 2 * R.nodeH[i]);
  record('user', '5000 kg contact: nothing pristine in reach', rep.n > 0 && rep.pristine / rep.n < .05,
    `within ${fmt(reach, 1)} m of the charge (Z < 0.5, ≥ 1 m from the boundary anchors): ${rep.n} nodes, torn ${rep.torn} (${rep.loose} loose), set < 2h ${rep.pristine} = ${fmt(100 * rep.pristine / Math.max(rep.n, 1), 1)}% · ${Object.entries(rep.byPl).map(([p, b]) => `${plName(R, p)}: ${b.n}, torn ${b.torn}, pristine ${b.pristine}`).join('; ')}`);
  await petalCheck('5000 kg contact', 5000, .125);
});

// Burke (when the bench can build it): aim points from the ship's data, same criteria
check('burke', 'burke', false, async () => {
  if (F.loadBurke) { await F.loadBurke(); if (F.shipGeometry) F.shipGeometry(); }
  else if (!window.BURKE_SCENE) { record('burke', 'Burke scene', null, 'the bench cannot build the Burke yet (no loadBurke / BURKE_SCENE): skipped'); return; }
  let mod; try { mod = await import(BASE + 'burke_structure.js'); } catch (e) { record('burke', 'Burke data', false, 'burke_structure.js did not load: ' + e); return; }
  const B = mod.default, zWL = mod.halfBreadth(0, .3), fh = { x: 18, y: (mod.deckY(18) + 10.3) / 2 };
  let zH = 0; for (const pn of B.PANELS) if (pn.kind === 'house' && pn.poly && Math.abs(pn.n[2]) > .9 && Math.abs(pn.c[0] - fh.x) < 12 && Math.abs(pn.c[1] - fh.y) < 3) zH = Math.max(zH, Math.abs(pn.c[2]));
  const cases = [
    ['Burke 1200 kg contact amidships, waterline', { kg: 1200, aim: [0, .3, zWL], aimN: [0, 0, 1] }, 'contact'],
    ['Burke 120 kg contact on the deckhouse', { kg: 120, aim: [fh.x, fh.y, zH || 8.1], aimN: [0, 0, 1] }, 'contact'],
    ['Burke 120 kg inside the main engine room', { kg: 120, aim: [0, -.6, mod.halfBreadth(0, -.6)], aimN: [0, 0, 1] }, 'inside'],
    ['Burke 5000 kg contact amidships', { kg: 5000, aim: [0, .3, zWL], aimN: [0, 0, 1] }, 'contact'],
  ];
  for (const [nm, c, fz] of cases) {
    let R; try { R = await run({ scene: 'burke', ...C_(c.kg, fz, c), solver: 'gpu', grid: .125 }); } catch (e) { record('burke', nm, false, 'threw: ' + (e && e.stack || e)); continue; }
    const A = c.aim, n = c.aimN, hitPl = R.nodePl[nearestNode(R, A, i => R.nodePl[i] >= 0)];
    if (fz === 'inside') {
      const v = V(), cc = R.cc, by = {};
      for (let c2 = 0; c2 < v.NC; c2++) { if (v.CSP[c2] !== cc && v.CSN[c2] !== cc) continue; const p = v.CPAN[c2], b = by[p] || (by[p] = { n: 0, torn: 0, max: 0, h: v.CH[c2] }); b.n++;
        if (R.cer[c2]) { b.torn++; continue; } for (let k = 0; k < 4; k++) { const i = v.CN[4 * c2 + k]; if (!R.free[i]) b.max = Math.max(b.max, dmag(R, i)); } }
      const pls = Object.entries(by).filter(([, b]) => b.n >= 20), quiet = pls.filter(([, b]) => !b.torn && b.max < 2 * b.h);
      record('burke', nm, pls.length > 0 && quiet.length === 0, `space ${(v.scene.spaces[cc] || {}).name}: ${pls.length} bounding panels, ${quiet.length} neither torn nor set > 2h · by kind: ${[...new Set(pls.map(([p]) => plName(R, p).split(' ·')[0]))].map(k => { const g = pls.filter(([p]) => plName(R, p).split(' ·')[0] === k).map(([, b]) => b);
        return `${k}: ${g.length} panels, torn ${g.reduce((a, b) => a + b.torn, 0)} cells, max ${fmt(Math.max(...g.map(b => b.max)) * 1000, 0)} mm, least ${fmt(Math.min(...g.map(b => b.max)) * 1000, 0)} mm`; }).join('; ')}${quiet.length ? ' · quiet: ' + quiet.map(([p]) => plName(R, p)).join(', ') : ''} · ${fmt(R.ms / 1000, 1)} s`);
    } else if (c.kg >= 5000) {
      const reach = .5 * Math.cbrt(c.kg), hops = hopsFromFix(R, Math.ceil(1 / R.S)), C = R.C;
      const rep = regionReport(R, i => hops[i] >= Math.ceil(1 / R.S) && Math.hypot(R.r0[3 * i] - C[0], R.r0[3 * i + 1] - C[1], R.r0[3 * i + 2] - C[2]) < reach, i => 2 * R.nodeH[i]);
      record('burke', nm, rep.n > 0 && rep.pristine / rep.n < .05, `within ${fmt(reach, 1)} m: ${rep.n} nodes, torn ${rep.torn} (${rep.loose} loose), set < 2h ${rep.pristine} (${fmt(100 * rep.pristine / Math.max(rep.n, 1), 1)}%) · ${fmt(R.ms / 1000, 1)} s`);
    } else {
      const rep = regionReport(R, behindOf(R, A, n, hitPl, 3), .05), hit = (rep.n - rep.pristine) / Math.max(rep.n, 1), pe = petals(R, hitPl, R.C);
      record('burke', nm, rep.n > 0 && hit >= .5, `struck ${plName(R, hitPl)} · within 3 m behind: ${rep.n} nodes, torn ${rep.torn} (${rep.loose} loose), set > 50 mm ${rep.n - rep.torn - rep.pristine}, under ${rep.pristine} · hole ${fmt(pe.rh, 2)} m, ${fmt(100 * pe.loose / Math.max(pe.tot, 1), 0)}% of it loose, rim up to ${fmt(pe.rim, 2)} m · ${fmt(R.ms / 1000, 1)} s`);
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
    OUT.api = { run, setup, V, F, panelAt, nearestNode, dmag, dnorm, fieldDiff, regionReport, hopsFromFix, nurick, cpuProbe, petals, glFree, panelCase };
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
