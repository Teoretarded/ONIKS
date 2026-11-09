#!/usr/bin/env node
/* Headless ONIKS sim in Node (no browser). See game/src/sim/README.md, "Headless (Node)".

     node tools/sim.mjs test [--only <substring>] [--map <id>] [--long]
         every test in game/src/sim/tests.js, PASS / FAIL lines
     node tools/sim.mjs balance [--maps all|a,b] [--seeds 24] [--seed 1] [--level normal] [--limit 7200]
                                [--workers k] [--set a.b:v;...] [--rows] [--json out.json]
         the AI-vs-AI batches and table of game/balance.html (same match code: src/balance.js)
     node tools/sim.mjs bench [--units 200] [--secs 60] [--warm 90] [--reps 3] [--map stub|<id>] [--seed 77] [--perftest]
                              [--noprof] [--fn 25]
         a 200-unit battle with 300+ projectiles in flight: ms per sim-second, per-stage and per-file breakdown
         (--perftest: the field of the tests.js perf test instead, units on hold)
     node tools/sim.mjs hash [--maps stub,fjord] [--seeds 1,2,3] [--ticks 6000] [--bench]
         state hashes after N ticks (sim.hash() and a deep hash of the whole state, full float bits and the
         event stream): run before and after a change that must not change behaviour
*/
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'game', 'src');
const mod = p => import(pathToFileURL(path.join(SRC, p)).href);

/* ---------------------------------------------------------------- browser shims */
function shim() {
  const g = globalThis;
  if (!g.window) g.window = g;
  if (!g.M3) {
    // the same M3.rng the pages load (sim/rand.js prefers it over its built-in copy)
    const code = fs.readFileSync(path.join(ROOT, 'reference', 'menus', 'common', 'm3.js'), 'utf8');
    vm.runInThisContext(code, { filename: 'm3.js' });
  }
  // world/theatre.js fetches the DEM next to the module (a file: URL here)
  const f0 = g.fetch;
  g.fetch = (u, o) => {
    const s = String(u && u.href || u);
    if (!s.startsWith('file:')) return f0(u, o);
    return Promise.resolve().then(() => { const b = fs.readFileSync(fileURLToPath(s)); return { ok: true, status: 200, text: async () => b.toString('utf8'), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), json: async () => JSON.parse(b.toString('utf8')) }; });
  };
}
shim();

const args = process.argv.slice(2);
const cmd = isMainThread ? args[0] : 'worker';
function opt(name, def) {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const fmt = (x, n = 1) => Number(x).toFixed(n);

/* ---------------------------------------------------------------- maps */
/* one map object per id for the whole process, as in a match (every map object carries its own h() closure: several
   of them make every terrain lookup in the sim a polymorphic call, which a single match never sees) */
const MAPS_LOADED = new Map();
async function getMap(id) {
  if (!id || id === 'stub') {
    if (!MAPS_LOADED.has('stub')) { const { stubMap } = await mod('sim/stubmap.js'); MAPS_LOADED.set('stub', stubMap()); }
    return MAPS_LOADED.get('stub');
  }
  const { loadMap } = await mod('world/maps.js');
  return loadMap(id, { worker: false, cache: false });
}
async function mapIds(spec) {
  const { MAPS } = await mod('world/maps.js');
  return !spec || spec === 'all' || spec === true ? MAPS.map(m => m.id) : String(spec).split(',');
}

/* ---------------------------------------------------------------- test: game/src/sim/tests.js */
async function cmdTest() {
  const q = new URLSearchParams();
  if (opt('only')) q.set('only', opt('only'));
  if (opt('map')) q.set('map', opt('map'));
  if (opt('long')) q.set('long', '1');
  globalThis.location = { search: '?' + q.toString() };
  const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const el = () => ({ className: '', set innerHTML(v) { this._h = v; process.stdout.write(strip(v) + '\n'); }, get innerHTML() { return this._h; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; }, appendChild(c) { return c; } });
  const sum = el();
  globalThis.document = { title: '', getElementById: id => (id === 'sum' ? sum : el()), createElement: el };
  const quiet = console.log, qe = console.error; console.log = console.error = () => {};   // AI dumps; FAIL lines carry the stack
  const t0 = performance.now();
  await mod('sim/tests.js');
  while (!globalThis.__done) await new Promise(r => setTimeout(r, 50));
  console.log = quiet; console.error = qe;
  const { pass, total } = globalThis.__done;
  console.log(`\n${pass}/${total} passed · ${fmt((performance.now() - t0) / 1000, 1)} s`);
  process.exitCode = pass === total ? 0 : 1;
}

/* ---------------------------------------------------------------- balance: game/src/balance.js */
/* balance.js is its own worker: without `document` it installs self.onmessage and posts rows back. We give it
   that `self` in a worker_thread, so every match runs the page's own code. */
async function workerMain() {
  globalThis.self = globalThis;
  globalThis.postMessage = m => parentPort.postMessage(m);
  await mod('balance.js');
  parentPort.on('message', data => globalThis.self.onmessage({ data }));
  parentPort.postMessage({ ready: true });
}

async function cmdBalance() {
  const ids = await mapIds(opt('maps', 'all'));
  const n = +opt('seeds', 24), seed0 = +opt('seed', 1), level = opt('level', 'normal');
  const limit = +opt('limit', 7200), set = opt('set', '') || '';
  const nw = +opt('workers', Math.max(1, os.cpus().length));
  const jobs = [];
  for (let k = 0; k < n; k++) for (const id of ids) jobs.push({ id: jobs.length, map: id, seed: seed0 + k, level, limit, set, sp: '', quick: false });
  process.stderr.write(`${ids.length} maps × ${n} seeds (${seed0}..${seed0 + n - 1}) · ${level} · limit ${limit / 60} min · ${nw} workers${set ? ' · set ' + set : ''}\n`);
  const rows = [], T0 = performance.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(nw, jobs.length) }, () => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
    const feed = () => { if (next >= jobs.length) { w.terminate(); res(); return; } w.postMessage(jobs[next++]); };
    w.on('message', m => {
      if (m.ready) { feed(); return; }
      if (m.ok) rows.push(m.row);
      else { const j = jobs[m.id]; console.error(`ERR ${j.map} ${j.seed}: ${m.err}`); rows.push({ map: j.map, seed: j.seed, winner: 'ERR', reason: 'err', min: 0 }); }
      process.stderr.write(`\r${rows.length}/${jobs.length} · ${fmt((performance.now() - T0) / 1000, 0)} s   `);
      feed();
    });
    w.on('error', rej);
  })));
  process.stderr.write('\n');
  rows.sort((a, b) => ids.indexOf(a.map) - ids.indexOf(b.map) || a.seed - b.seed);
  if (opt('rows')) for (const r of rows) console.log(`${r.map.padEnd(14)} ${String(r.seed).padStart(3)} ${String(r.winner).padEnd(5)} ${String(r.reason).padEnd(10)} ${fmt(r.min).padStart(6)} min · lost ${r.coast?.lost}/${r.fleet?.lost} · sc ${r.coast?.score}/${r.fleet?.score}`);
  console.log(summarise(rows, ids));
  console.log(`\nwall ${fmt((performance.now() - T0) / 1000, 0)} s · sim ${fmt(rows.reduce((a, r) => a + (r.ms || 0), 0) / 1000, 0)} core-s`);
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(rows.map(r => ({ map: r.map, seed: r.seed, winner: r.winner, reason: r.reason, min: r.min, coast: r.coast, fleet: r.fleet, tally: r.tally })), null, 1));
}
/* the table of balance.js summarise() */
function summarise(rows, ids) {
  const median = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const lines = ['map              games  coast%  fleet%  median min  reasons'];
  for (const id of ids) {
    const R = rows.filter(r => r.map === id && r.winner !== 'ERR');
    if (!R.length) continue;
    const c = R.filter(r => r.winner === 'coast').length, f = R.filter(r => r.winner === 'fleet').length;
    const reasons = {};
    for (const r of R) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const early = R.filter(r => r.min < 10).length;
    lines.push(`${id.padEnd(16)} ${String(R.length).padStart(5)}  ${(100 * c / R.length).toFixed(0).padStart(5)}%  ${(100 * f / R.length).toFixed(0).padStart(5)}%  ${median(R.map(r => r.min)).toFixed(1).padStart(10)}  ${Object.entries(reasons).map(([k, v]) => k + ' ' + v).join(', ')}${early ? ` · ${early} under 10 min` : ''}`);
  }
  const all = rows.filter(r => r.winner !== 'ERR'), ca = all.filter(r => r.winner === 'coast').length;
  lines.push(`${'all'.padEnd(16)} ${String(all.length).padStart(5)}  ${(100 * ca / (all.length || 1)).toFixed(0).padStart(5)}%  ${(100 * (all.length - ca) / (all.length || 1)).toFixed(0).padStart(5)}%  ${median(all.map(r => r.min)).toFixed(1).padStart(10)}`);
  return lines.join('\n');
}

/* ---------------------------------------------------------------- bench */
/* The perf test's 200-unit field (tests.js), but weapons free and closer, so the sides engage: a steady 300+
   rounds in flight. Built only from seeded streams, so it is the same battle every run (and a hash target). */
async function benchSim(o = {}) {
  const { Sim } = await mod('sim/sim.js');
  const { setupBattle } = await mod('sim/setup.js');
  const m = await getMap(o.map || 'stub');
  const sim = new Sim(m, { seed: o.perftest ? 77 : o.seed || 77, fog: true, aiSides: ['coast', 'fleet'] });
  setupBattle(sim);
  const r = sim.rng.place;
  if (o.perftest) {
    // tests.js 'perf: 200 units': the same field, weapons free on hold, spread wider (fewer rounds in flight)
    const mixT = { coast: ['tel', 'tel', 'pantsir', 'radar', 'transloader', 'catapult', 'drone'], fleet: ['ddg', 'ddg', 'helo', 'fighter'] };
    let sx = null; for (let x = -m.W / 2; x < m.W / 2; x += 100) if (m.h(x, 0) > 0) { sx = x; break; }
    let k = sim.units.size;
    while (k < 200) {
      const side = k % 2 ? 'coast' : 'fleet', type = mixT[side][Math.floor(r() * mixT[side].length)];
      let x, z;
      if (side === 'coast') { x = sx + 3000 + r() * 25000; z = (r() - .5) * 60000; if (m.h(x, z) < 2) continue; }
      else { x = sx - 20000 - r() * 40000; z = (r() - .5) * 70000; if (m.h(x, z) > -40) continue; }
      sim.spawn(type, side, x, z, { hold: true, deployed: true, alt: type === 'fighter' ? 6000 : undefined });
      k++;
    }
    return sim;
  }
  const mix = { coast: ['tel', 'tel', 'pantsir', 'pantsir', 'radar', 'transloader', 'catapult', 'drone'], fleet: ['ddg', 'ddg', 'ddg', 'helo', 'fighter'] };
  // the stub map: land east of shoreX; a real map: around the spawns
  let shoreX = null;
  if (!o.map || o.map === 'stub') for (let x = -m.W / 2; x < m.W / 2; x += 100) if (m.h(x, 0) > 0) { shoreX = x; break; }
  const C = m.spawns.coast, F = m.spawns.fleet;
  let n = sim.units.size, tries = 0;
  const N = o.units || 200;
  while (n < N && tries++ < 200000) {
    const side = n % 2 ? 'coast' : 'fleet', type = mix[side][Math.floor(r() * mix[side].length)];
    let x, z;
    if (shoreX !== null) {
      if (side === 'coast') { x = shoreX + 2000 + r() * 16000; z = (r() - .5) * 50000; if (m.h(x, z) < 2) continue; }
      else { x = shoreX - 14000 - r() * 26000; z = (r() - .5) * 50000; if (m.h(x, z) > -40) continue; }
    } else {
      const S = side === 'coast' ? C : F, k = side === 'coast' ? 20000 : 30000;
      const f = .35 + r() * .2;                                                   // the fleet closes on the coast
      x = side === 'coast' ? S.x + (r() - .5) * k : F.x + (C.x - F.x) * f + (r() - .5) * k;
      z = side === 'coast' ? S.z + (r() - .5) * k : F.z + (C.z - F.z) * f + (r() - .5) * k;
      if (side === 'coast' ? m.h(x, z) < 2 : m.h(x, z) > -40) continue;
    }
    sim.spawn(type, side, x, z, { hold: false, deployed: true, alt: type === 'fighter' ? 6000 : undefined });
    n++;
  }
  if (o.nofog) sim.fog = false;
  return sim;
}

/* sim.step() with a clock round each stage (the same calls in the same order: bench checks the hashes agree) */
async function profiledStepper() {
  const { DT, SENSE_EVERY } = await mod('sim/consts.js');
  const { processOrders } = await mod('sim/orders.js');
  const { mechanics, carrierOps } = await mod('sim/mech.js');
  const { moveUnit } = await mod('sim/movement.js');
  const { senseTick, resolveScans, esmTick, sonarTick } = await mod('sim/sensors.js');
  const { weaponsTick, stepProjectiles } = await mod('sim/weapons.js');
  const { stepDying } = await mod('sim/damage.js');
  const { economyTick, checkResult } = await mod('sim/economy.js');
  const { SIDES } = await mod('data/units.js');
  const T = {}, N = {}, now = () => performance.now();
  const K = ['ai', 'orders', 'mech', 'move', 'scans', 'sense', 'esm', 'sonar', 'weapons', 'proj', 'guns', 'dying', 'weather', 'model', 'economy'];
  for (const k of K) { T[k] = 0; N[k] = 0; }
  function step(sim) {
    sim.tick++;
    const t = sim.t = sim.tick * DT, tick = sim.tick;
    const list = sim.list();
    for (let i = 0; i < list.length; i++) { const u = list[i]; u.prev[0] = u.pos[0]; u.prev[1] = u.pos[1]; u.prev[2] = u.pos[2]; u.prevHdg = u.hdg; }
    for (const p of sim.projectiles.values()) { p.prev[0] = p.pos[0]; p.prev[1] = p.pos[1]; p.prev[2] = p.pos[2]; }
    let a = now(), b;
    if (tick % 20 === 0) economyTick(sim);
    b = now(); T.economy += b - a; a = b;
    for (const side in sim.ai) { const ai = sim.ai[side]; if ((tick + (side === 'coast' ? 0 : 7)) % ai.every === 0) ai.think(); }
    b = now(); T.ai += b - a; a = b;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u.alive) continue;
      processOrders(sim, u); b = now(); T.orders += b - a; a = b;
      mechanics(sim, u);
      if (u.launchQ) carrierOps(sim, u);
      b = now(); T.mech += b - a; a = b;
      moveUnit(sim, u); b = now(); T.move += b - a; a = b;
      N.orders++; N.mech++; N.move++;
    }
    if (sim.scans.length) resolveScans(sim);
    b = now(); T.scans += b - a; a = b;
    if (tick % SENSE_EVERY === 0) senseTick(sim, SENSE_EVERY * DT);
    b = now(); T.sense += b - a; a = b;
    if (tick % 20 === 10) esmTick(sim);
    b = now(); T.esm += b - a; a = b;
    if (tick % 20 === 15) sonarTick(sim);
    b = now(); T.sonar += b - a; a = b;
    if (tick % SENSE_EVERY === 2) weaponsTick(sim);
    b = now(); T.weapons += b - a; a = b;
    stepProjectiles(sim);                                     // sim.prof splits it into proj / guns
    b = now(); a = b;
    stepDying(sim);
    b = now(); T.dying += b - a; a = b;
    sim.weather.step(DT);
    for (const side of SIDES) { const S = sim.sides[side]; if (S.scanCd > 0) S.scanCd = Math.max(0, S.scanCd - DT); }
    b = now(); T.weather += b - a; a = b;
    for (let i = 0; i < list.length; i++) { const u = list[i]; u.def.modelState(u, t); }
    b = now(); T.model += b - a; a = b;
    if (tick % 20 === 0) checkResult(sim);
    b = now(); T.economy += b - a;
  }
  return { step, T, K, N };
}

async function cmdBench() {
  const secs = +opt('secs', 60), warm = +opt('warm', 90), mapId = opt('map', 'stub'), reps = +opt('reps', 3);
  const BO = { map: mapId, units: +opt('units', 200), seed: +opt('seed', 77), nofog: !!opt('nofog'), perftest: !!opt('perftest') };
  const { DT } = await mod('sim/consts.js');
  // the plain step over the same stretch of the same battle, best of `reps` fresh runs (a shared machine: the
  // minimum is the honest cost). Warm-up: the first 90 s, while the salvoes build up to 250-450 rounds in flight.
  const W = Math.round(secs / DT);
  let best = 1e9, cold = 0, projN = 0, projMax = 0, projMin = 1e9, k = 0, sim;
  const stats = () => { const n = sim.projectiles.size; projN += n; k++; projMax = Math.max(projMax, n); projMin = Math.min(projMin, n); };
  for (let w = 0; w < reps; w++) {
    sim = await benchSim(BO);
    for (let i = 0; i < warm / DT; i++) { sim.step(); sim.drainEvents(); }
    const t0 = performance.now();
    for (let i = 0; i < W; i++) { sim.step(); if (w === 0 && (i & 7) === 0) stats(); sim.drainEvents(); }
    const ms = (performance.now() - t0) / (W * DT);
    if (w === 0) cold = ms;
    best = Math.min(best, ms);
  }
  const alive = sim.list().filter(u => u.alive).length;
  console.log(`bench${BO.perftest ? ' (the tests.js perf field)' : ''} · ${mapId} map · ${sim.units.size} units (${alive} alive at the end) · projectiles in flight mean ${fmt(projN / k, 0)} (min ${projMin}, max ${projMax})`);
  console.log(`step: ${fmt(best, 2)} ms per sim-second warm (t = ${warm}..${warm + secs} s, best of ${reps} fresh runs) → x32 costs ${fmt(best * 32 / 10, 1)} % of a core`);
  console.log(`      ${fmt(cold, 2)} ms per sim-second cold (the first run: the first match of a page, while the JIT still learns the battle)`);
  // the per-module breakdown, on a twin of the same battle, stepped by the profiled copy of step()
  const twin = await benchSim(BO);
  const { step, T, K, N } = await profiledStepper();
  // what one clock read costs (subtracted per read from the stages that take one per unit)
  let clk = 0;
  { const n = 2e6; let x = 0; const t0 = performance.now(); for (let i = 0; i < n; i++) x += performance.now(); clk = (performance.now() - t0) / n; if (x === 1) console.log(''); }
  for (let i = 0; i < warm / DT; i++) { twin.step(); twin.drainEvents(); }
  twin.prof = { proj: 0, guns: 0 };
  const P = Math.round(secs / DT);
  const t0 = performance.now();
  for (let i = 0; i < P; i++) { step(twin); twin.drainEvents(); }
  const tot = performance.now() - t0;
  T.proj = twin.prof.proj; T.guns = twin.prof.guns;
  for (const k of K) T[k] = Math.max(0, T[k] - N[k] * clk);
  const per = x => x / (P * DT);
  console.log(`\nper stage (a copy of step() with a clock round each stage, ${fmt(P * DT, 0)} s; a clock read ${fmt(clk * 1e6, 0)} ns, taken out of the per-unit stages; the rest: prev copies and clocks ${fmt(per(tot - K.reduce((a, k) => a + T[k], 0)), 2)} ms/s):`);
  for (const k of K.slice().sort((a, b) => T[b] - T[a])) console.log(`  ${k.padEnd(9)} ${fmt(per(T[k]), 3).padStart(8)} ms/s  ${fmt(100 * T[k] / tot, 1).padStart(5)} %`);
  console.log(`  ${'total'.padEnd(9)} ${fmt(per(tot), 3).padStart(8)} ms/s`);
  // the profiled stepper must be the same step: same state after the same ticks
  if (!opt('noprof')) await fileProfile(BO, warm, secs);
  console.log(`\nprofiled step == sim.step: ${sim.hash() === twin.hash() ? 'yes' : 'NO'} (${sim.hash()} / ${twin.hash()})`);
}

/* self time per source file over the same stretch (V8's sampling profiler, through node:inspector): the split by
   module, callees included where they live (map.h in the map's file, helpers in util.js) */
async function fileProfile(BO, warm, secs) {
  const { Session } = await import('node:inspector/promises');
  const { DT } = await mod('sim/consts.js');
  const sim = await benchSim(BO);
  for (let i = 0; i < warm / DT; i++) { sim.step(); sim.drainEvents(); }
  const ss = new Session(); ss.connect();
  await ss.post('Profiler.enable'); await ss.post('Profiler.setSamplingInterval', { interval: 100 });
  await ss.post('Profiler.start');
  const t0 = performance.now();
  for (let i = 0; i < secs / DT; i++) { sim.step(); sim.drainEvents(); }
  const ms = performance.now() - t0;
  const { profile: P } = await ss.post('Profiler.stop');
  ss.disconnect();
  const dt = new Map();
  for (let i = 0; i < P.samples.length; i++) dt.set(P.samples[i], (dt.get(P.samples[i]) || 0) + (P.timeDeltas[i] || 0));
  const F = new Map(), FN = new Map(), LN = new Map(); let tot = 0;
  for (const n of P.nodes) {
    const t = dt.get(n.id) || 0; if (!t) continue;
    const u = n.callFrame.url, i = u.indexOf('/game/src/');
    const k = i >= 0 ? u.slice(i + 10) : n.callFrame.functionName === '(garbage collector)' ? '(gc)' : '(other)';
    if (n.callFrame.functionName === '(idle)' || n.callFrame.functionName === '(program)') continue;
    if (i < 0 && /inspector|sim\.mjs/.test(u)) continue;                  // the profiler session and this harness
    F.set(k, (F.get(k) || 0) + t); tot += t;
    if (opt('lines') && n.callFrame.functionName === opt('lines')) for (const pt of n.positionTicks || []) LN.set(pt.line, (LN.get(pt.line) || 0) + pt.ticks);
    const f = `${n.callFrame.functionName || '(anon)'} ${k}${i >= 0 ? ':' + (n.callFrame.lineNumber + 1) : ''}`;
    FN.set(f, (FN.get(f) || 0) + t);
  }
  console.log(`\nper file (CPU profile self time, ${fmt(secs, 0)} s, ${fmt(ms / secs, 2)} ms/s while sampled):`);
  for (const [k, t] of [...F].sort((a, b) => b[1] - a[1])) if (t / tot >= .003) console.log(`  ${k.padEnd(20)} ${fmt(ms / secs * t / tot, 3).padStart(8)} ms/s  ${fmt(100 * t / tot, 1).padStart(5)} %`);
  if (opt('lines')) { const T = [...LN.values()].reduce((a, b) => a + b, 0); console.log(`\nticks by line in ${opt('lines')}():`); for (const [l, c] of [...LN].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  line ${l}: ${fmt(100 * c / T, 1)} %`); }
  if (opt('fn')) {
    console.log(`\nper function (self time; callees the optimiser inlined count in their caller):`);
    for (const [k, t] of [...FN].sort((a, b) => b[1] - a[1]).slice(0, +opt('fn') || 25)) console.log(`  ${k.padEnd(40)} ${fmt(ms / secs * t / tot, 3).padStart(8)} ms/s  ${fmt(100 * t / tot, 1).padStart(5)} %`);
  }
}

/* ---------------------------------------------------------------- hash (determinism proof) */
/* A deep hash of everything that holds game state: every own field of units, projectiles, bursts, contacts, sides,
   the AI, objectives, weather and scans, at full float precision (the raw bits), plus every event emitted. Keys
   starting with '_' are caches (skipped), a field holding undefined counts as absent (reads the same), and keys are
   sorted, so the proof does not depend on how an object's fields are declared. */
function deepHasher() {
  let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const word = w => { h1 = Math.imul(h1 ^ w, 16777619); h2 = Math.imul(h2 + w | 0, 2246822519) ^ (h2 >>> 13); };
  const str = s => { word(s.length); for (let i = 0; i < s.length; i++) word(s.charCodeAt(i)); };
  const seen = new Map();
  let nid = 0;
  const skip = new Set(['def', 'P', 'map', 'nav', 'sim', 'rng']);
  function val(v, depth) {
    switch (typeof v) {
      case 'number': f64[0] = v; word(1); word(u32[0]); word(u32[1]); return;
      case 'string': word(2); str(v); return;
      case 'boolean': word(v ? 3 : 4); return;
      case 'undefined': word(5); return;
      case 'function': word(6); return;
      case 'bigint': word(7); str(String(v)); return;
    }
    if (v === null) { word(8); return; }
    if (seen.has(v)) { word(9); word(seen.get(v)); return; }       // shared / cyclic: its first visit's number
    seen.set(v, ++nid);
    if (depth > 12) { word(10); return; }
    if (ArrayBuffer.isView(v)) { word(11); word(v.length); for (let i = 0; i < v.length; i++) val(v[i], depth + 1); return; }
    if (Array.isArray(v)) { word(12); word(v.length); for (let i = 0; i < v.length; i++) val(v[i], depth + 1); return; }
    if (v instanceof Map) { word(13); word(v.size); for (const [k, x] of v) { val(k, depth + 1); val(x, depth + 1); } return; }
    if (v instanceof Set) { word(14); word(v.size); for (const x of v) val(x, depth + 1); return; }
    word(15);
    const keys = Object.keys(v).filter(k => k[0] !== '_' && !skip.has(k) && v[k] !== undefined).sort();   // undefined = absent
    word(keys.length);
    for (const k of keys) { str(k); val(v[k], depth + 1); }
  }
  return { val, out: () => (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') };
}
function deepHash(sim, events) {
  const H = deepHasher();
  H.val(sim.t, 0); H.val(sim.tick, 0); H.val(sim.nextId, 0);
  H.val(sim.units, 0); H.val(sim.projectiles, 0); H.val(sim.bursts || null, 0);
  H.val(sim.sides, 0); H.val(sim.objectives, 0); H.val(sim.scans, 0); H.val(sim.result, 0); H.val(sim.counts, 0);
  for (const side in sim.ai) { const ai = sim.ai[side]; const o = {}; for (const k of Object.keys(ai)) if (k !== 'sim') o[k] = ai[k]; H.val(o, 0); }
  const wx = {}; for (const k of Object.keys(sim.weather)) if (k !== 'sim') wx[k] = sim.weather[k]; H.val(wx, 0);
  H.val(events, 0);
  // the seeded streams' next draw (consumes one: call last)
  for (const k of ['fire', 'sense', 'dmg', 'wx', 'place', 'move']) H.val(sim.rng[k](), 0);
  H.val(sim.rng.ai.coast(), 0); H.val(sim.rng.ai.fleet(), 0);
  return H.out();
}
async function battleSim(mapId, seed) {
  const { Sim } = await mod('sim/sim.js');
  const { setupBattle } = await mod('sim/setup.js');
  const { spreadOut } = await mod('sim/economy.js');
  const sim = new Sim(await getMap(mapId), { seed, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'], difficulty: 'normal' });
  const sp = setupBattle(sim);
  if (mapId !== 'stub') spreadOut(sim, [...sp.coast, ...sp.fleet]);     // as balance.js / game setup
  return sim;
}
async function cmdHash() {
  const maps = opt('maps', 'stub,krasnaya_kosa,fjord').split(','), seeds = String(opt('seeds', '1,2,3')).split(',').map(Number);
  const ticks = +opt('ticks', 6000);
  const rows = [];
  const run = async (label, sim) => {
    const ev = [];
    const t0 = performance.now();
    for (let i = 0; i < ticks && !sim.result; i++) { sim.step(); for (const e of sim.drainEvents()) ev.push(e); }
    const ms = performance.now() - t0;
    const r = { label, ticks: sim.tick, hash: sim.hash(), deep: deepHash(sim, ev), events: ev.length, ms };
    rows.push(r);
    console.log(`${label.padEnd(26)} tick ${String(r.ticks).padStart(6)}  hash ${r.hash}  deep ${r.deep}  events ${String(r.events).padStart(6)}  ${fmt(ms / 1000, 1)} s`);
  };
  for (const m of maps) for (const s of seeds) await run(`${m} seed ${s}`, await battleSim(m, s));
  if (opt('bench')) await run('bench stub seed 77', await benchSim({}));
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(rows, null, 1));
}

/* ---------------------------------------------------------------- main */
const CMDS = { test: cmdTest, balance: cmdBalance, bench: cmdBench, hash: cmdHash, worker: workerMain };
if (!CMDS[cmd]) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].split('\n').slice(1).join('\n'));
  process.exitCode = cmd ? 1 : 0;
} else await CMDS[cmd]();
