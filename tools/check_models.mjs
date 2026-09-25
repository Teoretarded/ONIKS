/* Headless model checks (Node): builds every model of game/src/data/models.js, samples it with GEO.sample at its
   MODEL_INFO spacings, and checks
     - no exceptions (build, dyn parts at the default state, sampling), no NaN points
     - every part has a name (unique in the model) and a true label (a non-empty string)
     - point counts per level of detail within budget (the heaviest of carrier / destroyer at the same level)
     - the sampled bounding box (parts placed by their xf at the default state; X-ray interiors and hidden parts left
       out) matches MODEL_INFO.size, and for the units listed in REAL the real overall dimensions
     - ANATOMY: validateAnatomy passes for every entry (every model part in exactly one entry), the X-ray models exist
   The film kit (classic scripts setting window.M3 / GEO / HD) is evaluated with vm into this global scope, whose
   `window` is the global itself.
   Usage: node tools/check_models.mjs [key ...]      (no keys: every model)   --all-sizes  also fail on MODEL_INFO
   size mismatches and budget overruns of the older models (reported as warnings by default). Exit code 0 when nothing failed. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), ONLY = argv.filter(a => !a.startsWith('--')), ALL_SIZES = argv.includes('--all-sizes');

globalThis.window = globalThis;
for (const f of ['reference/menus/common/m3.js', 'reference/menus/common/geo.js', 'reference/films/common/hd_land.js', 'reference/films/common/hd_sea_air.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });

const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const MOD = await imp('game/src/data/models.js');
const ANA = await imp('game/src/data/anatomy.js');
const { ALL_MODELS, MODEL_INFO, MODEL_STATES, makeModel } = MOD;
const { ANATOMY, validateAnatomy } = ANA;
const { X } = window.M3, GEO = window.GEO;

/* real overall dimensions [L (z), W (x), H (y)] m of the new units (units3): the sampled box must match these
   within tol (fraction) */
const REAL = {
  cg: { size: [172.8, 16.8, null], tol: .02, note: 'CG-47: 172.8 m overall, 16.8 m beam' },
  lcs: { size: [127.4, 31.6, null], tol: .02, note: 'LCS-2: 127.4 m overall, 31.6 m beam' },
  s400: { size: [null, 3.2, null], tol: .06, note: '5P85SM2-01 semi-trailer: 3.2 m wide travelling' },
  s400r: { size: [13.8, null, null], tol: .03, note: '92N6E on the MZKT-7930: 13.8 m long like the K340P' },
  bereg: { size: [11.7, 3.1, null], tol: .04, note: 'A-222 on the MAZ-543M: 11.7 m long, 3.1 m wide' },
  s400_msl: { size: [7.5, 1.13, 1.13], tol: .04, note: '48N6E3: 7.5 m, Ø 0.519 m, fin span 1.13 m' },
  rim116: { size: [2.79, .43, .43], tol: .06, note: 'RIM-116: 2.79 m, Ø 127 mm, span 0.43 m' },
};
const SIZE_TOL = .06;          // MODEL_INFO.size vs the sampled box (fraction of the size, or 0.15 m on small sizes)
const BUDGET_SLACK = 1.0;      // a model may use up to this factor of the heaviest reference at the same level
const REFS = ['carrier', 'destroyer'];

const fails = [], warns = [];
const fail = (k, m) => fails.push(`${k}: ${m}`), warn = (k, m) => warns.push(`${k}: ${m}`);

function defaultState(key) {
  const S = MODEL_STATES[key] || {}, st = {};
  for (const [k, v] of Object.entries(S)) st[k] = Array.isArray(v) ? v[2] : v;
  return st;
}
/* sample a model at spacing s (fine: include fine prims); returns { n, box: [mn, mx] | null, nan } */
function sampleModel(model, s, st, fine, forBox) {
  // the box leaves out open polylines (whip antennas, lifelines, guy wires): they are not the object's size
  const m = forBox ? { parts: model.parts.map(p => Object.assign({}, p, { dyn: null, prims: GEO.primsOf(p, st).filter(pr => pr.t !== 'line') })) } : model;
  const res = GEO.sample(m, s, 7, st, fine ? undefined : { fine: false });
  let n = 0, nan = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  res.forEach((r, i) => {
    const part = model.parts[i], pts = r.pts, cnt = pts.length / 6;
    n += cnt;
    const inBox = forBox && !part.inside && !(part.show && !part.show(st));
    const T = part.xf ? part.xf(st) : null;
    for (let j = 0; j < pts.length; j += 6) {
      let p = [pts[j], pts[j + 1], pts[j + 2]];
      if (!Number.isFinite(p[0] + p[1] + p[2])) { nan++; continue; }
      if (!inBox) continue;
      if (T) p = X.ap(T, p);
      for (let q = 0; q < 3; q++) { if (p[q] < mn[q]) mn[q] = p[q]; if (p[q] > mx[q]) mx[q] = p[q]; }
    }
  });
  return { n, nan, box: mn[0] <= mx[0] ? [mn, mx] : null };
}
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2);

/* ---------------------------------------------------------------- models */
const keys = Object.keys(ALL_MODELS).filter(k => typeof ALL_MODELS[k] === 'function' && (!ONLY.length || ONLY.includes(k) || REFS.includes(k)));
const rows = [], counts = {};
for (const key of keys) {
  const info = MODEL_INFO[key];
  let model;
  try { model = makeModel(key); } catch (e) { fail(key, 'build threw ' + (e.stack || e)); continue; }
  if (!model || !Array.isArray(model.parts) || !model.parts.length) { fail(key, 'no parts'); continue; }
  const names = new Set();
  for (const p of model.parts) {
    if (!p.name) fail(key, 'a part without a name');
    else if (names.has(p.name)) fail(key, `duplicate part name ${p.name}`);
    names.add(p.name);
    if (typeof p.label !== 'string' || !p.label.trim()) fail(key, `part ${p.name} has no label`);
    if (!p.prims && !p.dyn) fail(key, `part ${p.name} has neither prims nor dyn`);
  }
  if (!info) { warn(key, 'no MODEL_INFO entry'); continue; }
  const st = defaultState(key);
  if (/_cut$/.test(key)) st.xray = false;
  const s = info.s || [.1, .25, .6];
  let r0, r1, r2;
  try {
    r0 = sampleModel(model, s[0], st, true, true);
    r1 = sampleModel(model, s[1], st, true, false);
    r2 = sampleModel(model, s[2], st, false, false);
  } catch (e) { fail(key, 'sampling threw ' + (e.stack || e)); continue; }
  if (r0.nan || r1.nan || r2.nan) fail(key, `NaN points (${r0.nan + r1.nan + r2.nan})`);
  counts[key] = [r0.n, r1.n, r2.n];
  const row = { key, kind: info.kind, n: counts[key], box: r0.box, size: info.size };
  rows.push(row);
  if (!r0.box) { fail(key, 'no points'); continue; }
  const B = [r0.box[1][2] - r0.box[0][2], r0.box[1][0] - r0.box[0][0], r0.box[1][1] - r0.box[0][1]];
  row.B = B;
  // MODEL_INFO size vs the sampled box
  if (info.size && !/_cut$/.test(key)) {
    const bad = [0, 1, 2].filter(q => Math.abs(B[q] - info.size[q]) > Math.max(.15, SIZE_TOL * info.size[q]));
    if (bad.length) {
      const m = `MODEL_INFO.size [${info.size.join(', ')}] vs sampled [${B.map(f2).join(', ')}] (${bad.map(q => 'LWH'[q]).join('')})`;
      if (REAL[key] || ALL_SIZES) fail(key, m); else warn(key, m);
    }
  }
  const R = REAL[key];
  if (R) for (let q = 0; q < 3; q++) if (R.size[q] && Math.abs(B[q] - R.size[q]) > R.tol * R.size[q])
    fail(key, `${'LWH'[q]} ${f2(B[q])} m vs real ${R.size[q]} m (${R.note})`);
}
/* budgets: every unit model against the heaviest reference at each level */
const ref = [0, 1, 2].map(l => Math.max(...REFS.filter(k => counts[k]).map(k => counts[k][l])));
for (const r of rows) {
  if (REFS.includes(r.key) || r.kind === 'structure' || r.kind === 'cut') continue;
  for (let l = 0; l < 3; l++) if (r.n[l] > ref[l] * BUDGET_SLACK) (REAL[r.key] || ALL_SIZES ? fail : warn)(r.key, `${r.n[l]} points at LOD ${l} over the budget ${ref[l]} (carrier / destroyer)`);
}

/* ---------------------------------------------------------------- anatomy */
let anaN = 0;
for (const [key, a] of Object.entries(ANATOMY)) {
  if (!a || typeof a !== 'object' || !a.model) continue;
  if (ONLY.length && !ONLY.includes(key)) continue;
  if (!ALL_MODELS[a.model]) { fail('anatomy ' + key, `model ${a.model} unknown`); continue; }
  let m; try { m = makeModel(a.model); } catch (e) { fail('anatomy ' + key, 'build threw ' + e); continue; }
  const v = validateAnatomy(key, m);
  anaN++;
  if (!v.ok || v.unknown.length) fail('anatomy ' + key, `missing [${v.missing.join(' ')}] dup [${v.dup.join(' ')}] unknown [${v.unknown.join(' ')}]`);
  for (const x of a.xray || []) {
    if (!ALL_MODELS[x.model]) fail('anatomy ' + key, `x-ray model ${x.model} unknown`);
    try { const st = Object.assign(defaultState(key), a.st || {}, { xray: true }); const L = x.inst(st); if (!Array.isArray(L)) fail('anatomy ' + key, `x-ray ${x.id} inst() not a list`); }
    catch (e) { fail('anatomy ' + key, `x-ray ${x.id} inst threw ${e}`); }
  }
}

/* ---------------------------------------------------------------- report */
const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
console.log(pad('model', 18) + lp('LOD0', 9) + lp('LOD1', 9) + lp('LOD2', 9) + '   box L × W × H (m)            MODEL_INFO.size');
for (const r of rows) if (!/_cut$/.test(r.key) || ONLY.length) console.log(pad(r.key, 18) + lp(r.n[0], 9) + lp(r.n[1], 9) + lp(r.n[2], 9) + '   ' + pad(r.B ? r.B.map(f1).join(' × ') : '-', 29) + (r.size ? r.size.join(' × ') : ''));
console.log(`\nbudget (max of ${REFS.join(', ')}): ${ref.join(' / ')} points · ${rows.length} models sampled · ${anaN} anatomy entries validated`);
if (warns.length) console.log(`\n${warns.length} warning(s):\n  ` + warns.join('\n  '));
if (fails.length) { console.log(`\n${fails.length} FAILURE(S):\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('\nall checks passed');
