/* ONIKS balance runner (game/balance.html): headless AI-vs-AI matches on every map, several seeds each, as fast
   as the machine allows. Prints one row per match (map, seed, winner, reason, sim minutes) and per map the win
   rate and the median length; a summary goes into document.title and window.__bal.

   URL params
     n=4            seeds per map                   seed=1     first seed (seeds seed .. seed+n-1)
     maps=a,b       map ids (default: all of MAPS)   level=normal  AI difficulty for both sides
     workers=k      parallel module Workers (default: cores - 2, max 6); workers=0 runs on the page itself,
                    stepping in setTimeout chunks so the page stays responsive
     limit=7200     time limit, s (the combat default)
     set=a.b.c:v;…  experiment overrides applied before each match, e.g. set=tel.cost:400;PROJ.oniks.pk:.8
                    (paths start at UNITS, or at PROJ, or at LEVELS: LEVELS.normal.open:600)
     probe=1        run nothing; use window.__balProbe.emplacement(...) / story(...) from the console
     sp=map:side:x:z;…  experiment spawn override (km), e.g. sp=fjord:fleet:-66:4 (side 'replenish' moves the
                    replenishment point). The map is regenerated with those spawns (pad and roads follow);
                    quick=1 only moves the spawn points on the stock map (and objN:x:z moves objective N, 0-based,
                    quick only). Variants: maps=fjord~a,fjord~b with sp=fjord~a:coast:…;fjord~b:coast:… run the
                    same map with different spawns side by side
     sets=A|B|…     run every match under each override set (on top of set=); rows are keyed map/k

   The same file is the worker: it runs matches it is sent and posts the rows back.

   What we learned tuning (normal vs normal, 48 seeds a map): the outcome is decided far more by geometry than by
   stats. When the land between the battery and the fleet lets the coast AI push its TELs, a Pantsir and the
   transloaders 20-40 km forward, the fleet picks them off and wins; when the battery stays clustered round the
   command post, the coast wins. A coast radar on high ground that sees the carrier at the start gives a first
   salvo that can end a match in 3 minutes. So each map's spawns were chosen for a moderate spread and 90-115 km,
   and the global numbers only make matches decisive (lower HQ/carrier hp, weaker missile defence) and stop the
   minute-one carrier kills (radar surface range 90 km). Results move ±10 % between seed ranges; use n >= 32.
   Second pass (192 seeds): the coast AI no longer fires at the carrier in the first 5 min (LEVELS.normal.open), which
   ends the minute-two carrier kills on the fjord and the caldera; the fleet's spawn (its bearing sets how far the
   battery strings out toward it), the replenishment point (how far the destroyers sail to restock; at the carrier's
   station the air wing never runs dry) and a depot at the battery (+0.8 SUP/s, it nearly doubles the coast's income)
   are the per-map levers, and each moves a map by 20-60 points. The DDG's scan reach is the global lever that decides
   most matches (the fleet finds the battery by scanning where a launch came from); at 50 km the coast wins 8-9 in 10
   on Krasnaya Kosa and the strait whatever the fleet's spawn, so it stays at 60 km. The row's inc = mean income per
   side (SUP/s). Prefer the fleet's spawn and the replenishment point: the campaign builds its battery round the
   coast spawn. */
import { MAPS, loadMap } from './world/maps.js';
import { DEF } from './world/defs.js';
import { generate } from './world/gen.js';
import { Sim } from './sim/sim.js';
import { setupBattle } from './sim/setup.js';
import { spreadOut } from './sim/economy.js';
import { UNITS, PROJ } from './data/units.js';
import { LEVELS } from './sim/ai.js';

const IS_WORKER = typeof document === 'undefined';
const CHUNK = 2000;                      // ticks per chunk on the main thread (then yield)

/* ---------------------------------------------------------------- overrides (experiments only) */
function applySet(spec) {
  const undo = [];
  if (!spec) return undo;
  for (const item of spec.split(';').map(s => s.trim()).filter(Boolean)) {
    const [path, raw] = item.split(':');
    const v = Number(raw);
    const keys = path.split('.');
    let root = UNITS;
    if (keys[0] === 'PROJ') { root = PROJ; keys.shift(); }
    else if (keys[0] === 'LEVELS') { root = LEVELS; keys.shift(); }
    let o = root;
    for (let i = 0; i < keys.length - 1; i++) { o = o[keys[i]]; if (o == null) throw new Error(`set: bad path ${path}`); }
    const k = keys[keys.length - 1];
    undo.push([o, k, o[k]]);
    o[k] = v;
  }
  return undo;
}
function undoSet(undo) { for (let i = undo.length - 1; i >= 0; i--) { const [o, k, v] = undo[i]; if (v === undefined) delete o[k]; else o[k] = v; } }
function spawnFor(map, spec, key) {
  if (!spec) return map;
  let spawns = null, replenish = null, objectives = null;
  for (const item of spec.split(';').map(s => s.trim()).filter(Boolean)) {
    const [id, side, xk, zk] = item.split(':');
    if (id !== key) continue;
    if (side === 'replenish') { replenish = { ...map.replenish, x: Number(xk) * 1000, z: Number(zk) * 1000 }; continue; }
    if (/^obj\d+$/.test(side)) {           // objN: move objective N (0-based) on the stock map (quick=1)
      objectives = objectives || map.objectives.map(o => ({ ...o }));
      const o = objectives[+side.slice(3)]; o.x = Number(xk) * 1000; o.z = Number(zk) * 1000; continue;
    }
    spawns = spawns || { coast: { ...map.spawns.coast }, fleet: { ...map.spawns.fleet } };
    spawns[side].x = Number(xk) * 1000; spawns[side].z = Number(zk) * 1000;
  }
  if (!spawns && !replenish && !objectives) return map;
  if (spawns) for (const s of ['coast', 'fleet']) {
    const o = spawns[s === 'coast' ? 'fleet' : 'coast'];
    spawns[s].hdg = Math.atan2(o.x - spawns[s].x, o.z - spawns[s].z);
  }
  return Object.assign({}, map, spawns ? { spawns } : {}, replenish ? { replenish } : {}, objectives ? { objectives } : {});
}

/* A map regenerated with other spawns (so the pad under the coast spawn and the roads to it follow, as they
   would if the generator placed the spawn there). sp: 'map:side:xkm:zkm;…' as above; cached per key. */
const VARIANTS = new Map();
function variantMap(key, spec) {
  if (VARIANTS.has(key)) return VARIANTS.get(key);
  const p = (async () => {
    const id = key.split('~')[0], def = DEF[id];
    const gen = (await import(`./world/gens/${def.gen}.js`)).default;
    let want = {};
    if (typeof spec === 'object') want = Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, [v[0] * 1000, v[1] * 1000]]));
    else for (const item of spec.split(';').map(s => s.trim()).filter(Boolean)) {
      const [k, side, xk, zk] = item.split(':');
      if (k === key) want[side] = [Number(xk) * 1000, Number(zk) * 1000];
    }
    const wrapped = Object.assign({}, gen, {
      layout(ctx, A) {
        const L = gen.layout(ctx, A), old = L.spawns.coast;
        const spawns = { coast: { ...L.spawns.coast }, fleet: { ...L.spawns.fleet } };
        if (want.coast) {
          spawns.coast.x = want.coast[0]; spawns.coast.z = want.coast[1]; spawns.coast.hdg = A.seaward(want.coast[0], want.coast[1]);
          for (const pad of L.pads || []) if (pad.x === old.x && pad.z === old.z) { pad.x = want.coast[0]; pad.z = want.coast[1]; }
        }
        if (want.fleet) { spawns.fleet.x = want.fleet[0]; spawns.fleet.z = want.fleet[1]; }
        spawns.fleet.hdg = Math.atan2(spawns.coast.x - spawns.fleet.x, spawns.coast.z - spawns.fleet.z);
        L.spawns = spawns;
        if (want.replenish) L.replenish = { ...L.replenish, x: want.replenish[0], z: want.replenish[1] };
        return L;
      },
    });
    return mapObject(await generate(def, wrapped, {}));
  })();
  VARIANTS.set(key, p);
  return p;
}
/* the Map contract over a generated heightfield (same as world/maps.js) */
function mapObject(r) {
  const { W, H, cell, cols, rows, heights } = r, x0 = -W / 2, z0 = -H / 2, inv = 1 / cell, cm = cols - 1, rm = rows - 1;
  const at = (x, z) => {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    fx = fx < 0 ? 0 : fx > cm ? cm : fx; fz = fz < 0 ? 0 : fz > rm ? rm : fz;
    let i = fx | 0, j = fz | 0; if (i >= cm) i = cm - 1; if (j >= rm) j = rm - 1;
    const u = fx - i, v = fz - j, o = j * cols + i;
    return [heights[o], heights[o + 1], heights[o + cols], heights[o + cols + 1], u, v];
  };
  const h = (x, z) => { const [a, b, c, d, u, v] = at(x, z); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };
  const slope = (x, z) => {
    const [a, b, c, d, u, v] = at(x, z);
    const gx = ((b - a) * (1 - v) + (d - c) * v) * inv, gz = ((c - a) * (1 - u) + (d - b) * u) * inv, s = Math.sqrt(gx * gx + gz * gz);
    return s > 1 ? 1 : s;
  };
  return { id: r.id, name: r.name, W, H, cell, cols, rows, heights, h, water: (x, z) => h(x, z) < 0, slope,
    places: r.places, objectives: r.objectives, spawns: r.spawns, replenish: r.replenish, roads: r.roads, weather: r.weather, time: r.time };
}

/* ---------------------------------------------------------------- one match */
async function match(job, yieldFn) {
  const regen = job.sp && job.sp.split(';').some(it => it.split(':')[0] === job.map);
  const map = regen && !job.quick ? await variantMap(job.map, job.sp)
    : spawnFor(await loadMap(job.map.split('~')[0], IS_WORKER ? { worker: false } : undefined), job.sp, job.map);
  const sim = new Sim(map, { seed: job.seed, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'], difficulty: job.level || 'normal',
    timeLimit: job.limit !== undefined ? job.limit : 7200 });
  // as the game's combat setup does (game/setup.js createMatch): no two units on one spot
  const spawned = setupBattle(sim);
  spreadOut(sim, [...spawned.coast, ...spawned.fleet]);
  const t0 = performance.now();
  const earn = { coast: 0, fleet: 0, n: 0 };       // mean income (SUP/s) over the match
  const kills = { coast: {}, fleet: {} };          // side -> type -> n (enemy units that side destroyed)
  let firstHit = null;
  const tally = { launch: {}, hit: {}, icpt: {}, aim: {}, on: {} }, seenHq = { coast: null, fleet: null };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const cap = ((job.limit || 7200) + 30) * 20;
  for (let i = 0; i < cap && !sim.result; i++) {
    sim.step();
    if ((i & 63) === 63 || sim.result) {
      earn.coast += sim.sides.coast.income; earn.fleet += sim.sides.fleet.income; earn.n++;
      for (const e of sim.drainEvents()) {
        if (e.type === 'destroyed') { const k = e.side === 'coast' ? 'fleet' : 'coast', ty = typeOf(sim, e.unit); kills[k][ty] = (kills[k][ty] || 0) + 1; }
        if (e.type === 'hit') { if (firstHit === null) firstHit = e.t; inc(tally.hit, e.kind); inc(tally.on, e.kind + '>' + typeOf(sim, e.target)); }
        else if (e.type === 'launch') { inc(tally.launch, e.kind); if (e.tk === 'unit' && e.kind !== 'shell') inc(tally.aim, e.kind + '>' + typeOf(sim, e.target)); }
        else if (e.type === 'intercept') inc(tally.icpt, e.kind);
        else if (e.type === 'classify' && (e.cls === 'HQ' || e.cls === 'CVN') && seenHq[e.side] === null) seenHq[e.side] = +(e.t / 60).toFixed(1);
      }
    }
    if (yieldFn && i % CHUNK === CHUNK - 1) await yieldFn();
  }
  const s = sim.summary(), sp = map.spawns;
  const r = sim.result || { winner: '-', reason: 'none', t: sim.t };
  return {
    map: job.key || job.map, seed: job.seed, winner: r.winner, reason: r.reason, min: +(r.t / 60).toFixed(1),
    dist: +(Math.hypot(sp.coast.x - sp.fleet.x, sp.coast.z - sp.fleet.z) / 1000).toFixed(1),
    firstHit: firstHit === null ? null : +(firstHit / 60).toFixed(1),
    coast: { left: s.sides.coast.units, lost: s.sides.coast.lost, fired: s.sides.coast.fired, sup: s.sides.coast.supply, score: sim.sides.coast.score, value: Math.round(sim.sides.coast.value), by: s.sides.coast.by },
    fleet: { left: s.sides.fleet.units, lost: s.sides.fleet.lost, fired: s.sides.fleet.fired, sup: s.sides.fleet.supply, score: sim.sides.fleet.score, value: Math.round(sim.sides.fleet.value), by: s.sides.fleet.by },
    kills, tally, seenHq, inc: { coast: +(earn.coast / (earn.n || 1)).toFixed(2), fleet: +(earn.fleet / (earn.n || 1)).toFixed(2) }, ms: Math.round(performance.now() - t0),
  };
}
function typeOf(sim, id) { const u = sim.units.get(id); return u ? u.type : '?'; }

/* ---------------------------------------------------------------- worker side */
if (IS_WORKER) {
  self.onmessage = async (e) => {
    const job = e.data;
    try {
      const undo = applySet(job.set);
      let row;
      try { row = await match(job, null); } finally { undoSet(undo); }
      self.postMessage({ ok: true, row, id: job.id });
    } catch (err) {
      self.postMessage({ ok: false, err: String(err && err.stack || err), id: job.id });
    }
  };
}

/* ---------------------------------------------------------------- page side */
if (!IS_WORKER) main();

async function main() {
  const Q = new URLSearchParams(location.search);
  if (Q.get('probe')) { document.getElementById('head').textContent = 'probe mode: window.__balProbe.emplacement / story'; document.title = 'BAL probe'; return; }
  const n = +(Q.get('n') || 4), seed0 = +(Q.get('seed') || 1), level = Q.get('level') || 'normal';
  const ids = Q.get('maps') ? Q.get('maps').split(',') : MAPS.map(m => m.id);
  const limit = Q.get('limit') !== null ? +Q.get('limit') : 7200;
  const set = Q.get('set') || '', sp = Q.get('sp') || '', quick = !!Q.get('quick');
  // sets=A|B|…: the same matches under several override sets (each on top of set); rows are keyed map/k
  const sets = Q.get('sets') ? Q.get('sets').split('|') : null;
  const hw = navigator.hardwareConcurrency || 4;
  const nw = Q.get('workers') !== null ? +Q.get('workers') : Math.max(1, Math.min(6, hw - 2));
  const out = document.getElementById('rows'), sumEl = document.getElementById('sum'), head = document.getElementById('head');
  head.textContent = `${ids.length} maps × ${n} seeds (${seed0}..${seed0 + n - 1}) · ${level} · limit ${limit / 60} min · ${nw ? nw + ' workers' : 'main thread'}${set ? ' · set ' + set : ''}${sp ? ' · sp ' + sp : ''}`;
  const jobs = [];
  // interleave maps so partial results cover every map early
  for (let k = 0; k < n; k++) for (const id of ids) {
    if (!sets) jobs.push({ id: jobs.length, map: id, seed: seed0 + k, level, limit, set, sp, quick });
    else sets.forEach((extra, si) => jobs.push({ id: jobs.length, map: id, key: `${id}/${si}`, seed: seed0 + k, level, limit, set: set + ';' + extra, sp, quick }));
  }
  const keys = sets ? ids.flatMap(id => sets.map((_, si) => `${id}/${si}`)) : ids;
  const rows = [];
  const T0 = performance.now();
  window.__bal = { rows, done: false, summary: null, dump };
  document.title = `BAL 0/${jobs.length}`;

  const onRow = (row) => {
    rows.push(row);
    const tr = document.createElement('tr');
    tr.className = row.winner;
    const k = (o) => Object.entries(o).map(([t, v]) => `${t}${v > 1 ? '×' + v : ''}`).join(' ');
    tr.innerHTML = `<td>${row.map}</td><td>${row.seed}</td><td class="w">${row.winner}</td><td>${row.reason}</td><td class="n">${row.min.toFixed(1)}</td>`
      + `<td class="n">${row.dist}</td><td class="n">${row.firstHit ?? '–'}</td><td class="n">${row.coast.lost}/${row.fleet.lost}</td>`
      + `<td class="n">${row.coast.score ?? ''}/${row.fleet.score ?? ''}</td><td class="k">${k(row.kills.coast)}</td><td class="k">${k(row.kills.fleet)}</td><td class="n">${(row.ms / 1000).toFixed(1)}</td>`;
    out.appendChild(tr);
    const S = summarise(rows, keys);
    sumEl.textContent = S.text;
    document.title = `BAL ${rows.length}/${jobs.length} · ${S.short}`;
    window.__bal.summary = S;
  };

  if (!nw) {
    if (sets) throw new Error('sets= needs workers');
    applySet(set);
    const yieldFn = () => new Promise(r => setTimeout(r, 0));
    for (const j of jobs) onRow(await match(j, yieldFn));
  } else {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(nw, jobs.length) }, () => new Promise(res => {
      const w = new Worker(import.meta.url, { type: 'module' });
      const feed = () => { if (next >= jobs.length) { w.terminate(); res(); return; } w.postMessage(jobs[next++]); };
      w.onmessage = (e) => { if (e.data.ok) onRow(e.data.row); else { console.error(e.data.err); onRow({ map: jobs[e.data.id].key || jobs[e.data.id].map, seed: jobs[e.data.id].seed, winner: 'ERR', reason: e.data.err.slice(0, 80), min: 0, dist: 0, coast: {}, fleet: {}, kills: { coast: {}, fleet: {} }, ms: 0 }); } feed(); };
      w.onerror = (e) => { console.error('worker', e.message); };
      feed();
    })));
  }
  const S = summarise(rows, keys);
  window.__bal.done = true;
  document.title = `BAL done · ${S.short}`;
  sumEl.textContent = S.text + `\n\nwall ${((performance.now() - T0) / 1000).toFixed(0)} s`;
}

/* compact text of the rows (console / automation) */
function dump(detail) {
  const o = x => Object.entries(x || {}).map(([k, v]) => k + v).join(',');
  return window.__bal.rows.slice().sort((a, b) => a.map.localeCompare(b.map) || a.seed - b.seed).map(r =>
    `${short(r.map)} ${r.seed} ${r.winner[0]} ${r.reason} ${r.min} | lost ${r.coast.lost}/${r.fleet.lost} sc ${r.coast.score}/${r.fleet.score} seen ${r.seenHq?.coast}/${r.seenHq?.fleet} inc ${r.inc?.coast}/${r.inc?.fleet}`
    + (detail ? ` | C> ${o(r.kills.coast)} F> ${o(r.kills.fleet)} | L ${o(r.tally?.launch)} H ${o(r.tally?.hit)} I ${o(r.tally?.icpt)}` + (detail > 1 ? ` A ${o(r.tally?.aim)} ON ${o(r.tally?.on)}` : '') : '')).join('\n');
}

function shortId(id) { const m = id.match(/^([^~/]+)(.*)$/); return m[1].slice(0, 4) + m[2]; }
const short = shortId;

function median(a) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function summarise(rows, ids) {
  const per = {};
  const lines = ['map              games  coast%  fleet%  median min  reasons'];
  const short = [];
  for (const id of ids) {
    const R = rows.filter(r => r.map === id && r.winner !== 'ERR');
    if (!R.length) continue;
    const c = R.filter(r => r.winner === 'coast').length, f = R.filter(r => r.winner === 'fleet').length;
    const med = median(R.map(r => r.min));
    const reasons = {};
    for (const r of R) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    per[id] = { games: R.length, coast: c / R.length, fleet: f / R.length, median: med, reasons };
    const early = R.filter(r => r.min < 10).length;
    lines.push(`${id.padEnd(16)} ${String(R.length).padStart(5)}  ${(100 * c / R.length).toFixed(0).padStart(5)}%  ${(100 * f / R.length).toFixed(0).padStart(5)}%  ${med.toFixed(1).padStart(10)}  ${Object.entries(reasons).map(([k, v]) => k + ' ' + v).join(', ')}${early ? ` · ${early} under 10 min` : ''}`);
    short.push(`${shortId(id)} C${(100 * c / R.length).toFixed(0)} ${med.toFixed(0)}m`);
  }
  const all = rows.filter(r => r.winner !== 'ERR');
  const ca = all.filter(r => r.winner === 'coast').length;
  lines.push(`${'all'.padEnd(16)} ${String(all.length).padStart(5)}  ${(100 * ca / (all.length || 1)).toFixed(0).padStart(5)}%  ${(100 * (all.length - ca) / (all.length || 1)).toFixed(0).padStart(5)}%  ${median(all.map(r => r.min)).toFixed(1).padStart(10)}`);
  return { per, text: lines.join('\n'), short: short.join(' | ') };
}

/* ---------------------------------------------------------------- probes (console) */
/* Where the coast battery sets up for a pair of spawns (km), without running the match (regen: regenerate the map):
   await __balProbe.emplacement('fjord', { coast: [-31, 33], fleet: [-63, -50] }, 1, true) */
async function emplacement(mapId, sp, seed = 1, regen = false) {
  const spec = Object.entries(sp || {}).map(([s, p]) => `${mapId}~e:${s}:${p[0]}:${p[1]}`).join(';');
  const map = regen && spec ? await variantMap(`${mapId}~${JSON.stringify(sp)}`, sp)
    : spawnFor(await loadMap(mapId), spec, `${mapId}~e`);
  const sim = new Sim(map, { seed, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'] });
  setupBattle(sim);
  const hq = sim.hq('coast'), F = map.spawns.fleet;
  const dh = u => Math.hypot(u.pos[0] - hq.pos[0], u.pos[2] - hq.pos[2]) / 1000, df = u => Math.hypot(u.pos[0] - F.x, u.pos[2] - F.z) / 1000;
  const units = sim.alive('coast').filter(u => u.type !== 'hq');
  return { d: +df(hq).toFixed(1), spread: +Math.max(...units.map(dh)).toFixed(1), units: units.map(u => `${u.type}@${dh(u).toFixed(0)}/${df(u).toFixed(0)}`).join(' ') };
}
/* One match with a readable log: kills, first strikes per 2 min, classifications.
   await __balProbe.story('fjord', { coast: [-31, 33], fleet: [-63, -50] }, 1, 'tel.hp:60', 3000) */
async function story(mapId, sp, seed = 1, set = '', tmax = 7200) {
  const undo = applySet(set);
  try {
    const m0 = await loadMap(mapId);
    const map = spawnFor(m0, Object.entries(sp || {}).map(([s, p]) => `${mapId}:${s}:${p[0]}:${p[1]}`).join(';'), mapId);
    const sim = new Sim(map, { seed, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'], difficulty: 'normal' });
    setupBattle(sim);
    const log = [], seen = {}, pos = u => u ? `(${(u.pos[0] / 1000).toFixed(0)},${(u.pos[2] / 1000).toFixed(0)})` : '';
    const ty = id => typeOf(sim, id);
    for (const side of ['coast', 'fleet']) log.push(`start ${side} ` + sim.alive(side).filter(u => !u.aboard).map(u => u.type + pos(u)).join(' '));
    while (!sim.result && sim.t < tmax) {
      sim.step();
      if (sim.tick % 20) continue;
      for (const e of sim.drainEvents()) {
        const T = (e.t / 60).toFixed(1);
        if (e.type === 'destroyed') log.push(`${T} X ${e.side} ${ty(e.unit)}${pos(sim.units.get(e.unit))}`);
        else if (e.type === 'launch' && ['oniks', 'tlam', 'slam', 'hellfire'].includes(e.kind)) {
          const k = `${Math.floor(e.t / 120)}${e.kind}>${ty(e.target)}`;
          seen[k] = (seen[k] || 0) + 1;
          if (seen[k] === 1) log.push(`${T} L ${e.kind}>${ty(e.target)} from ${ty(e.from)}${pos(sim.units.get(e.from))}`);
        } else if (e.type === 'classify' && ['HQ', 'CVN', 'TEL', 'SAM', 'DDG', 'RADAR'].includes(e.cls)) log.push(`${T} C ${e.side} sees ${e.cls}`);
      }
    }
    log.push('end ' + JSON.stringify(sim.result));
    return log.join('\n');
  } finally { undoSet(undo); }
}
/* Candidate spawn pairs on a map: coast sites (land, 0.7-4 km from the water, flat) on a grid x fleet points (km),
   spaced dmin..dmax; for each, the battery's spread (farthest unit from the command post) and the longest road
   trip from the spawn to a TEL site (reinforcements drive it).
   await __balProbe.search('fjord', [[-63, 52], [-63, -50]], { step: 3000 }) */
async function search(mapId, fleets, opts = {}) {
  const m = await loadMap(mapId);
  const step = opts.step || 3000, dmin = opts.dmin || 88000, dmax = opts.dmax || 140000, maxCoast = opts.maxCoast || 4000;
  const ring = (x, z, r, f) => { for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; if (!f(x + Math.sin(t) * r, z + Math.cos(t) * r)) return false; } return true; };
  const coastDist = (x, z) => { for (let r = 250; r <= maxCoast + 250; r += 250) if (!ring(x, z, r, (a, b) => m.h(a, b) >= 0)) return r; return 1e9; };
  const rough = (x, z, r) => { let s = m.slope(x, z); for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; s += m.slope(x + Math.sin(t) * r, z + Math.cos(t) * r) + m.slope(x + Math.sin(t) * r * .5, z + Math.cos(t) * r * .5); } return s / 17; };
  const plen = p => { if (!p || !p.length) return Infinity; let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
  const box = opts.box || [-m.W / 2 + 3000, -m.H / 2 + 3000, m.W / 2 - 3000, m.H / 2 - 3000];
  const res = [];
  for (let x = box[0]; x <= box[2]; x += step) for (let z = box[1]; z <= box[3]; z += step) {
    if (m.h(x, z) <= 1 || !ring(x, z, 900, (a, b) => m.h(a, b) > 0)) continue;
    const cd = coastDist(x, z); if (cd < 700 || cd > maxCoast) continue;
    if (rough(x, z, 700) > (opts.rough || .08)) continue;
    for (const f of fleets) {
      const d = Math.hypot(x - f[0] * 1000, z - f[1] * 1000); if (d < dmin || d > dmax) continue;
      const map = spawnFor(m, `${mapId}:coast:${x / 1000}:${z / 1000};${mapId}:fleet:${f[0]}:${f[1]}`, mapId);
      const sim = new Sim(map, { seed: 1, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'] });
      setupBattle(sim);
      const hq = sim.hq('coast'), dh = u => Math.hypot(u.pos[0] - hq.pos[0], u.pos[2] - hq.pos[2]) / 1000;
      const tels = sim.alive('coast').filter(u => u.type === 'tel'), all = sim.alive('coast').filter(u => u.type !== 'hq');
      let trip = 0; for (const u of tels) trip = Math.max(trip, plen(sim.nav.path('land', x, z, u.pos[0], u.pos[2])) / 1000);
      res.push({ c: [x / 1000, z / 1000], f, d: Math.round(d / 1000), tel: Math.round(Math.max(...tels.map(dh))), spread: Math.round(Math.max(...all.map(dh))), trip: Math.round(trip), h: Math.round(m.h(x, z)) });
    }
  }
  return res;
}
if (!IS_WORKER) window.__balProbe = { emplacement, story, search, applySet, undoSet };
