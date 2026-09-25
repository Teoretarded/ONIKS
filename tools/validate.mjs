/* Data validator (Node, no dependencies): cross-checks the game's data tables against each other and against the
   generated maps.

     units      every unit's model key (and every round's model / booster model) exists and builds; MODEL_INFO has it;
                every damage part has a body box in sim/bodies.js (else it can never be struck); game/labels.js has a
                SHORT and a TRACK label for every unit type (and warns on labels for types UNITS lacks)
     anatomy    every entry's model exists; every entry part names a real part of that model; every model part sits in
                exactly one entry; X-ray contents name real models and parent parts
     campaign   every mission: numbering, map, side, time, weather, AI level, film, forces (unit types on the right
                side), objectives (known kind, the fields that kind needs, types that exist and belong to the right
                side, 'hold' naming an objective of the map); the mission script exists, finishes its 'script'
                objectives, reveals its hidden ones, names no objective the mission lacks and no unit type that does
                not exist (S.own / S.foe on the right side, sim.spawn, <unit>.type === '...')
     maps       every map in world/maps.js generated (worker: false, cache: false): the coast spawn on open land, the
                fleet spawn and the replenish point in open sea (the sim's nav grids), objectives on land (a port on
                the waterline) with open land or sea in their circle, all inside the map. Warnings: an objective
                neither side can reach (land from the coast spawn, sea from the fleet spawn; says when only a road
                bridge, which the sim's nav grid does not pass, would get there), places on the wrong side of the
                waterline
     keybinds   KEYBINDS (data/settings.js): every key unique per context. A row's context is its third element's
                `ctx` ('play' by default); two rows clash when they share a context and a key and can both show (their
                side / mode filters overlap). Also MENU_FILMS name real films.

   The film kit (classic scripts setting window.M3 / GEO / HD) is evaluated with vm into this global scope, whose
   `window` is the global itself.

   Usage: node tools/validate.mjs [--only units,anatomy,campaign,maps,keybinds] [--maps id,id] [--quiet]
   Exit code 0 when nothing failed (warnings do not fail). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf('--' + name); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true; };
const ONLY = opt('only') ? String(opt('only')).split(',') : null, QUIET = !!opt('quiet');
const want = s => !ONLY || ONLY.includes(s);

/* ---------------------------------------------------------------- browser shims */
globalThis.window = globalThis;
if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
if (!globalThis.localStorage) {
  const m = new Map();
  globalThis.localStorage = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
// world/theatre.js fetches the DEM next to the module (a file: URL here)
const fetch0 = globalThis.fetch;
globalThis.fetch = (u, o) => {
  const s = String(u && u.href || u);
  if (!s.startsWith('file:')) return fetch0(u, o);
  return Promise.resolve().then(() => {
    const b = fs.readFileSync(fileURLToPath(s));
    return { ok: true, status: 200, text: async () => b.toString('utf8'), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), json: async () => JSON.parse(b.toString('utf8')) };
  });
};
for (const f of ['reference/menus/common/m3.js', 'reference/menus/common/geo.js', 'reference/films/common/hd_land.js', 'reference/films/common/hd_sea_air.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });

const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

/* ---------------------------------------------------------------- report */
const fails = [], warns = [];
let section = '', nChecks = 0;
const fail = (where, msg) => fails.push(`${section} · ${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${section} · ${where}: ${msg}`);
const check = (ok, where, msg) => { nChecks++; if (!ok) fail(where, msg); return ok; };
const soft = (ok, where, msg) => { nChecks++; if (!ok) warn(where, msg); return ok; };
function begin(name) {
  section = name;
  const f0 = fails.length, w0 = warns.length, t0 = Date.now();
  return () => { if (!QUIET) console.log(`${name.padEnd(9)} ${fails.length - f0 ? `\x1b[31m${fails.length - f0} failed\x1b[0m` : '\x1b[32mok\x1b[0m'}${warns.length - w0 ? ` · ${warns.length - w0} warnings` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)} s`); };
}
const list = (a, n = 8) => a.length > n ? a.slice(0, n).join(', ') + ` … (+${a.length - n})` : a.join(', ');

/* ---------------------------------------------------------------- load */
const { UNITS, PROJ, SIDES } = await imp('game/src/data/units.js');
const MOD = await imp('game/src/data/models.js');
const { ALL_MODELS, MODEL_INFO, makeModel } = MOD;
const { ANATOMY, validateAnatomy } = await imp('game/src/data/anatomy.js');
const { MISSIONS } = await imp('game/src/data/campaign.js');
const { KEYBINDS, MENU_FILMS } = await imp('game/src/data/settings.js');
const { MAPS, loadMap } = await imp('game/src/world/maps.js');
const { bodyOf } = await imp('game/src/sim/bodies.js');
const { Nav } = await imp('game/src/sim/nav.js');
const LABELS = await imp('game/src/game/labels.js');

const models = new Map();
function model(key) {
  if (!models.has(key)) { let m = null, err = null; try { m = makeModel(key); } catch (e) { err = e; } models.set(key, { m, err }); }
  return models.get(key);
}
const filmExists = id => exists(`reference/films/${id}.html`);

/* ---------------------------------------------------------------- units */
if (want('units')) {
  const end = begin('units');
  const DOMAINS = ['land', 'sea', 'air'];
  for (const [k, d] of Object.entries(UNITS)) {
    check(d.type === k, k, `type '${d.type}' differs from its key`);
    check(SIDES.includes(d.side), k, `side '${d.side}' is not one of ${SIDES.join(', ')}`);
    check(DOMAINS.includes(d.domain), k, `domain '${d.domain}' is not one of ${DOMAINS.join(', ')}`);
    check(typeof d.modelState === 'function', k, 'no modelState(unit, t)');
    if (check(!!ALL_MODELS[d.model], k, `model '${d.model}' is not in ALL_MODELS (data/models.js)`)) {
      const { err } = model(d.model);
      check(!err, k, `model '${d.model}' does not build: ${err && err.message}`);
      check(!!MODEL_INFO[d.model], k, `model '${d.model}' has no MODEL_INFO entry`);
    }
    check(d.parts && Object.keys(d.parts).length > 0, k, 'no damage parts');
    let body = null;
    try { body = bodyOf(d); } catch (e) { fail(k, `bodyOf throws: ${e.message}`); }
    if (body) {
      const hit = new Set([...body.part, ...body.spart]);
      const none = Object.keys(d.parts).filter(p => !hit.has(p));
      soft(!none.length, k, `damage parts with no body box (never struck): ${list(none)}`);
    }
  }
  // the tag labels (game/labels.js): one per unit type, none for a type that does not exist
  for (const t of ['SHORT', 'TRACK']) {
    const L = LABELS[t] || {};
    for (const k of Object.keys(UNITS)) check(typeof L[k] === 'string', k, `no ${t} label in game/labels.js`);
    const extra = Object.keys(L).filter(k => !UNITS[k]);
    soft(!extra.length, `labels ${t}`, `labels for unit types not in UNITS (data/units.js): ${list(extra)}`);
  }
  for (const [k, p] of Object.entries(PROJ)) {
    for (const f of ['model', 'boosterModel']) {
      const m = p[f];
      if (m === null || m === undefined) continue;
      if (check(!!ALL_MODELS[m], `round ${k}`, `${f} '${m}' is not in ALL_MODELS`)) {
        const { err } = model(m);
        check(!err, `round ${k}`, `${f} '${m}' does not build: ${err && err.message}`);
      }
    }
  }
  end();
}
/* ---------------------------------------------------------------- anatomy */
if (want('anatomy')) {
  const end = begin('anatomy');
  for (const [k, a] of Object.entries(ANATOMY)) {
    soft(!!ALL_MODELS[k], k, `the key names no model in ALL_MODELS`);
    const mk = a.model || k;
    if (!check(!!ALL_MODELS[mk], k, `model '${mk}' is not in ALL_MODELS`)) continue;
    const { m, err } = model(mk);
    if (!check(!err && m, k, `model '${mk}' does not build: ${err && err.message}`)) continue;
    const names = new Set(m.parts.map(p => p.name));
    const r = validateAnatomy(k, m);
    check(!r.unknown.length, k, `entry parts not in model '${mk}': ${list(r.unknown)}`);
    check(!r.dup.length, k, `parts in more than one entry: ${list(r.dup)}`);
    check(!r.missing.length, k, `model '${mk}' parts in no entry: ${list(r.missing)}`);
    for (const en of a.parts) {
      const at = `${k} ${en.id || en.label}`;
      check(Array.isArray(en.parts) && en.parts.length > 0, at, 'entry names no parts');
      check(Array.isArray(en.explode) && en.explode.length === 3 && en.explode.every(Number.isFinite), at, 'explode is not [dx, dy, dz]');
      check(en.cls === 'shell' || en.cls === 'part', at, `cls '${en.cls}' is not 'shell' or 'part'`);
    }
    const ids = a.parts.map(en => en.id).filter(Boolean), dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    check(!dupIds.length, k, `placard ids used twice: ${list(dupIds)}`);
    for (const x of a.xray || []) {
      const at = `${k} x-ray ${x.id}`;
      if (check(!!ALL_MODELS[x.model], at, `model '${x.model}' is not in ALL_MODELS`)) { const b = model(x.model); check(!b.err, at, `model '${x.model}' does not build: ${b.err && b.err.message}`); }
      check(x.parent === null || x.parent === undefined || names.has(x.parent), at, `parent '${x.parent}' is not a part of '${mk}'`);
      check(typeof x.inst === 'function', at, 'no inst(st)');
    }
  }
  // every unit a player can inspect has an entry
  for (const [k, d] of Object.entries(UNITS)) soft(!!ANATOMY[d.model], k, `model '${d.model}' has no ANATOMY entry (Inspect)`);
  end();
}

/* ---------------------------------------------------------------- campaign */
const MAP_OBJ_KINDS = ['port', 'depot', 'radar_hill', 'airfield', 'lighthouse'];
if (want('campaign')) {
  const end = begin('campaign');
  const TIMES = ['night', 'dusk', 'day'], WEATHER = ['calm', 'haze', 'rain', 'storm'], AI = ['easy', 'normal', 'hard'];
  const DOMS = ['sea', 'land', 'air'];
  const isType = t => typeof t === 'string' && !!UNITS[t];
  const types = t => t === '*' ? [] : Array.isArray(t) ? t : [t];
  /* kind -> the fields it needs, and which side the unit types belong to ('own' | 'enemy') */
  const KIND = {
    deploy: { type: 'own' }, radar: { type: 'own' }, scan: { count: 1 }, classify: { count: 1 }, inspect: {},
    launch: { count: 1 }, reload: {}, destroy: { type: 'enemy', count: 1 }, survive: { seconds: 1 },
    hold: { objective: 1, seconds: 1 }, protect: { type: 'own' }, lose: { type: 'own', max: 0 }, time: { seconds: 1 },
    rounds: { max: 0 }, silent: {}, script: {},
  };
  // the validator's kinds are the ones game/objectives.js checks (plus 'script', which the mission script drives)
  const objSrc = read('game/src/game/objectives.js');
  for (const k of Object.keys(KIND)) if (k !== 'script') check(objSrc.includes(`case '${k}':`), `kind ${k}`, 'not handled by game/objectives.js');
  const idxSrc = read('game/src/game/campaign/index.js');
  const scripts = {};
  for (const [, id, file] of idxSrc.matchAll(/^\s*(\w+):\s*\(\)\s*=>\s*import\('\.\/([\w.]+)'\)/gm)) scripts[id] = file;
  const mapIds = MAPS.map(m => m.id), nums = new Set(), ids = new Set();

  MISSIONS.forEach((m, i) => {
    const M = `M${m.n} ${m.id}`;
    check(m.n === i + 1, M, `n ${m.n} at position ${i + 1} (play.html?mission=<n> looks it up by position)`);
    check(!nums.has(m.n) && !ids.has(m.id), M, 'number or id used twice'); nums.add(m.n); ids.add(m.id);
    check(mapIds.includes(m.map), M, `map '${m.map}' is not in world/maps.js (${mapIds.join(', ')})`);
    check(SIDES.includes(m.side), M, `side '${m.side}'`);
    check(TIMES.includes(m.time), M, `time '${m.time}' is not one of ${TIMES.join(', ')}`);
    check(WEATHER.includes(m.weather), M, `weather '${m.weather}' is not one of ${WEATHER.join(', ')}`);
    check(AI.includes(m.ai), M, `ai '${m.ai}' is not one of ${AI.join(', ')}`);
    if (check(m.film && typeof m.film.id === 'string', M, 'no film')) {
      check(filmExists(m.film.id), M, `film '${m.film.id}' is not in reference/films`);
      check(Number.isFinite(m.film.from) && Number.isFinite(m.film.to) && m.film.from < m.film.to, M, `film stretch ${m.film.from}..${m.film.to}`);
    }
    check(Array.isArray(m.brief) && m.brief.length > 0, M, 'no briefing');
    const own = m.side, enemy = SIDES.find(s => s !== own);
    // forces
    for (const s of SIDES) {
      const F = (m.forces || {})[s] || [];
      check(F.length > 0, M, `no ${s} forces`);
      for (const [t, n] of F) {
        if (!check(isType(t), M, `${s} force '${t}' is not a unit type`)) continue;
        check(UNITS[t].side === s, M, `${s} force '${t}' is a ${UNITS[t].side} unit`);
        check(Number.isInteger(n) && n > 0, M, `${s} force '${t}' count ${n}`);
      }
      const seen = F.map(f => f[0]), twice = seen.filter((t, j) => seen.indexOf(t) !== j);
      check(!twice.length, M, `${s} forces list ${list(twice)} twice`);
    }
    const has = (s, t) => ((m.forces || {})[s] || []).some(f => f[0] === t);
    // objectives
    const oids = new Set();
    for (const o of m.objectives || []) {
      const O = `${M} objective ${o.id}`;
      check(typeof o.id === 'string' && !oids.has(o.id), O, 'id missing or used twice'); oids.add(o.id);
      check(typeof o.text === 'string' && o.text.length > 0, O, 'no text');
      const K = KIND[o.kind];
      if (!check(!!K, O, `kind '${o.kind}' is not one of ${Object.keys(KIND).join(', ')}`)) continue;
      for (const f of ['count', 'seconds', 'max']) if (f in K) check(Number.isFinite(o[f]) && o[f] >= K[f], O, `${f} ${o[f]} (a number >= ${K[f]} is needed)`);
      if (K.type) {
        const T = types(o.type), side = K.type === 'own' ? own : enemy;
        check(o.type !== undefined || o.kind === 'lose', O, `needs a type`);
        for (const t of T) {
          if (!check(isType(t), O, `type '${t}' is not a unit type`)) continue;
          check(UNITS[t].side === side, O, `type '${t}' is a ${UNITS[t].side} unit (${o.kind} wants the ${K.type === 'own' ? 'player' : 'enemy'}'s, ${side})`);
          soft(has(side, t) || !!m.fleetBuys || side === own && m.supply > 0, O, `type '${t}' is not in the ${side} forces`);
        }
        if (o.kind === 'deploy') for (const t of T) if (isType(t)) check(!!(UNITS[t].deploy || UNITS[t].mast || t === 'tel'), O, `type '${t}' does not deploy`);
        if (o.kind === 'radar') for (const t of T) if (isType(t)) check(!!(UNITS[t].sensors && UNITS[t].sensors.radar), O, `type '${t}' has no radar`);
      }
      if (o.kind === 'silent' && o.type !== undefined) for (const t of types(o.type)) check(isType(t) && UNITS[t].side === own, O, `type '${t}' is not a ${own} unit type`);
      if (o.kind === 'classify' && o.dom !== undefined) check(DOMS.includes(o.dom), O, `dom '${o.dom}' is not one of ${DOMS.join(', ')}`);
      if (o.kind === 'hold') check(typeof o.objective === 'string', O, 'objective (map objective kind or id) missing');
    }
    // the mission script
    const file = scripts[m.id];
    if (check(!!file, M, `no script in campaign/index.js SCRIPTS`)) {
      const p = `game/src/game/campaign/${file}`;
      check(file === `m${m.n}_${m.id}.js`, M, `script ${file} (m${m.n}_${m.id}.js expected)`);
      if (check(exists(p), M, `script ${p} missing`)) {
        const src = read(p), refs = new Map();
        for (const [, fn, id] of src.matchAll(/\bS\.(reveal|objective|done|failObj|prog)\(\s*'([\w-]+)'/g)) { if (!refs.has(id)) refs.set(id, new Set()); refs.get(id).add(fn); }
        const added = new Set([...src.matchAll(/addObjective\(\s*\{[^}]*?\bid:\s*'([\w-]+)'/g)].map(x => x[1]));
        for (const [id, fns] of refs) check(oids.has(id) || added.has(id), M, `script names objective '${id}' (${[...fns].join(', ')}), which the mission does not have`);
        // unit types the script names: S.own / S.foe (the player's / the enemy's), sim.spawn, <unit>.type === '...'
        for (const [, fn, t] of src.matchAll(/\bS\.(own|foe)\(\s*'(\w+)'/g))
          if (check(isType(t), M, `script: S.${fn}('${t}') names no unit type`)) check(UNITS[t].side === (fn === 'own' ? own : enemy), M, `script: S.${fn}('${t}') but '${t}' is a ${UNITS[t].side} unit`);
        for (const [, t] of src.matchAll(/\bsim\.spawn\(\s*'(\w+)'/g)) check(isType(t), M, `script: sim.spawn('${t}') names no unit type`);
        for (const [, v, t] of src.matchAll(/\b(\w+)\.type\s*[!=]==?\s*'(\w+)'/g)) if (!['e', 'ev', 'event'].includes(v)) check(isType(t), M, `script: ${v}.type === '${t}' names no unit type`);
        for (const o of m.objectives || []) {
          const f = refs.get(o.id) || new Set();
          if (o.kind === 'script') check(f.has('done') || f.has('failObj'), `${M} objective ${o.id}`, `kind 'script' but the script never calls S.done / S.failObj on it`);
          if (o.hidden) soft(f.has('reveal'), `${M} objective ${o.id}`, 'hidden, and the script never reveals it (S.reveal)');
        }
      }
    }
    // 'hold' objectives are checked against the generated map below
  });
  end();
}

/* ---------------------------------------------------------------- maps */
if (want('maps')) {
  const end = begin('maps');
  const ids = opt('maps') && opt('maps') !== true ? String(opt('maps')).split(',') : MAPS.map(m => m.id);
  const WATER_PLACES = new Set(['bay', 'lagoon', 'channel', 'strait', 'fjord']);
  const LAND_PLACES = new Set(['town', 'village', 'peak', 'cape', 'island', 'ridge', 'spit', 'port']);
  for (const id of ids) {
    const t0 = Date.now();
    let map;
    try { map = await loadMap(id, { worker: false, cache: false }); } catch (e) { fail(id, `does not generate: ${e.stack || e.message}`); continue; }
    const nav = new Nav(map), inside = (x, z) => Math.abs(x) <= map.W / 2 && Math.abs(z) <= map.H / 2;
    const at = (x, z) => `(${(x / 1000).toFixed(1)}, ${(z / 1000).toFixed(1)}) km, h ${map.h(x, z).toFixed(1)} m`;
    const comp = (dom, x, z) => { const G = nav.grid(dom), k = nav.cellOf(x, z); return G.cost[k] > 0 ? G.comp[k] : -1; };
    /* open nav cells of dom within r of (x, z): [cells, open, components] */
    const disc = (dom, x, z, r) => {
      const G = nav.grid(dom), cs = new Set(); let n = 0, o = 0;
      const step = Math.min(nav.cell, Math.max(r / 4, 50));
      for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
        if (dx * dx + dz * dz > r * r || !inside(x + dx, z + dz)) continue;
        const k = nav.cellOf(x + dx, z + dz); n++;
        if (G.cost[k] > 0) { o++; cs.add(G.comp[k]); }
      }
      return [n, o, cs];
    };
    /* the land grid with the road cells over water opened (the generator's bridges): component per cell */
    const bridged = (() => {
      const G = nav.grid('land'), N = nav.N, open = new Uint8Array(N), comp = new Int32Array(N).fill(-1), st = new Int32Array(N), cols = nav.cols;
      for (let k = 0; k < N; k++) open[k] = G.cost[k] > 0 ? 1 : 0;
      for (const pl of map.roads || []) for (let s = 0; s + 1 < pl.length; s++) {
        const [ax, az] = pl[s], [bx, bz] = pl[s + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (nav.cell / 3)));
        for (let e = 0; e <= n; e++) open[nav.cellOf(ax + (bx - ax) * e / n, az + (bz - az) * e / n)] = 1;
      }
      let nc = 0;
      for (let k0 = 0; k0 < N; k0++) {
        if (!open[k0] || comp[k0] >= 0) continue;
        let sp = 0; st[sp++] = k0; comp[k0] = nc;
        while (sp) {
          const k = st[--sp], i = k % cols;
          for (const kk of [i > 0 ? k - 1 : -1, i < cols - 1 ? k + 1 : -1, k - cols, k + cols]) if (kk >= 0 && kk < N && open[kk] && comp[kk] < 0) { comp[kk] = nc; st[sp++] = kk; }
        }
        nc++;
      }
      return comp;
    })();
    const S = map.spawns || {};
    // coast spawn: on land, open for vehicles
    const c = S.coast;
    let landComp = -1;
    if (check(c && [c.x, c.z, c.r].every(Number.isFinite), `${id} spawn coast`, 'missing or not { x, z, r, hdg }')) {
      check(inside(c.x, c.z), `${id} spawn coast`, `outside the map ${at(c.x, c.z)}`);
      check(!map.water(c.x, c.z), `${id} spawn coast`, `in the water ${at(c.x, c.z)}`);
      const [n, o] = disc('land', c.x, c.z, c.r);
      check(o > 0, `${id} spawn coast`, `no open land in its ${c.r} m circle ${at(c.x, c.z)}`);
      soft(o >= n * .25, `${id} spawn coast`, `only ${Math.round(100 * o / Math.max(1, n))}% of its circle is open land`);
      landComp = comp('land', c.x, c.z);
      soft(landComp >= 0, `${id} spawn coast`, `centre is not an open land cell (slope ${map.slope(c.x, c.z).toFixed(2)}) ${at(c.x, c.z)}`);
    }
    // fleet spawn and replenish point: open sea, one sea
    const f = S.fleet;
    let seaComp = -1;
    if (check(f && [f.x, f.z, f.r].every(Number.isFinite), `${id} spawn fleet`, 'missing or not { x, z, r, hdg }')) {
      check(inside(f.x, f.z), `${id} spawn fleet`, `outside the map ${at(f.x, f.z)}`);
      check(map.water(f.x, f.z), `${id} spawn fleet`, `on land ${at(f.x, f.z)}`);
      const [, o] = disc('sea', f.x, f.z, f.r);
      check(o > 0, `${id} spawn fleet`, `no open sea (deeper than the nav grid's draught) in its ${f.r} m circle ${at(f.x, f.z)}`);
      seaComp = comp('sea', f.x, f.z);
      soft(seaComp >= 0, `${id} spawn fleet`, `centre is not an open sea cell ${at(f.x, f.z)}`);
    }
    const rp = map.replenish;
    if (check(rp && [rp.x, rp.z].every(Number.isFinite), `${id} replenish`, 'missing')) {
      check(inside(rp.x, rp.z), `${id} replenish`, `outside the map ${at(rp.x, rp.z)}`);
      check(map.water(rp.x, rp.z), `${id} replenish`, `on land ${at(rp.x, rp.z)}`);
      const rc = comp('sea', rp.x, rp.z);
      check(rc >= 0, `${id} replenish`, `not an open sea cell ${at(rp.x, rp.z)}`);
      if (rc >= 0 && seaComp >= 0) check(rc === seaComp, `${id} replenish`, 'not in the same sea as the fleet spawn (ships cannot reach it)');
    }
    // objectives
    const oids = new Set();
    for (const o of map.objectives || []) {
      const O = `${id} objective ${o.id || o.name}`;
      check(!!o.id && !oids.has(o.id), O, 'id missing or used twice'); oids.add(o.id);
      check(MAP_OBJ_KINDS.includes(o.kind), O, `kind '${o.kind}' is not one of ${MAP_OBJ_KINDS.join(', ')}`);
      if (!check([o.x, o.z, o.r].every(Number.isFinite), O, 'x, z, r not numbers')) continue;
      check(inside(o.x, o.z), O, `outside the map ${at(o.x, o.z)}`);
      if (o.kind === 'port') {
        // a harbour sits on the waterline: land at its point, water within its circle
        check(!map.water(o.x, o.z), O, `in the water ${at(o.x, o.z)}`);
        let wet = false;
        for (let a = 0; a < 16 && !wet; a++) for (const q of [.5, 1]) if (map.water(o.x + Math.sin(a * Math.PI / 8) * o.r * q, o.z + Math.cos(a * Math.PI / 8) * o.r * q)) wet = true;
        check(wet, O, `no water within its ${o.r} m circle ${at(o.x, o.z)}`);
      } else check(!map.water(o.x, o.z), O, `in the water ${at(o.x, o.z)}`);
      // held by ground units or surface ships inside its circle (sim/economy.js): it needs open land or open sea there,
      // and one side able to get in (by land from the coast spawn, by sea from the fleet spawn)
      const [, openL, csL] = disc('land', o.x, o.z, o.r), [, openS, csS] = disc('sea', o.x, o.z, o.r);
      if (check(openL + openS > 0, O, `no open land or sea in its ${o.r} m circle (nothing can hold it) ${at(o.x, o.z)}`) && !(csL.has(landComp) || csS.has(seaComp))) {
        let bridge = false;
        if (landComp >= 0) {
          const bc = bridged[nav.cellOf(c.x, c.z)];
          for (let dz = -o.r; dz <= o.r && !bridge; dz += 100) for (let dx = -o.r; dx <= o.r && !bridge; dx += 100)
            if (dx * dx + dz * dz <= o.r * o.r && inside(o.x + dx, o.z + dz) && nav.grid('land').cost[nav.cellOf(o.x + dx, o.z + dz)] > 0 && bridged[nav.cellOf(o.x + dx, o.z + dz)] === bc) bridge = true;
        }
        warn(O, `neither side can reach its circle (by land from the coast spawn: ${openL ? 'another land mass' : 'no open land'}${bridge ? ', joined only by a road bridge the nav grid does not pass' : ''}; by sea from the fleet spawn: ${openS ? 'another sea' : 'no open sea'})`);
      }
    }
    check((map.objectives || []).length > 0, id, 'no objectives');
    // places: warnings only (names on the map)
    for (const p of map.places || []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { warn(`${id} place ${p.name}`, 'no position'); continue; }
      soft(inside(p.x, p.z), `${id} place ${p.name}`, `outside the map ${at(p.x, p.z)}`);
      if (WATER_PLACES.has(p.kind)) soft(map.water(p.x, p.z), `${id} place ${p.name}`, `${p.kind} on land ${at(p.x, p.z)}`);
      if (LAND_PLACES.has(p.kind)) soft(!map.water(p.x, p.z), `${id} place ${p.name}`, `${p.kind} in the water ${at(p.x, p.z)}`);
    }
    // campaign 'hold' objectives on this map
    for (const m of MISSIONS.filter(m => m.map === id)) for (const o of (m.objectives || []).filter(o => o.kind === 'hold'))
      check((map.objectives || []).some(b => b.id === o.objective || b.kind === o.objective || b.name === o.objective), `M${m.n} ${m.id} objective ${o.id}`, `holds '${o.objective}', which map '${id}' does not have (objectives.js would mark it done at once)`);
    if (!QUIET) console.log(`  ${id.padEnd(14)} ${map.cols}×${map.rows} · ${(map.objectives || []).length} objectives · ${(map.places || []).length} places · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  end();
}

/* ---------------------------------------------------------------- keybinds */
if (want('keybinds')) {
  const end = begin('keybinds');
  const CTX = ['play', 'selection', 'inspect', 'film', 'palette'], MODES = ['sandbox', 'combat', 'campaign'];
  const MODS = { Shift: 'Shift', '⇧': 'Shift', Ctrl: 'Ctrl', Alt: 'Alt' };
  const MOUSE = { Right: 1, Middle: 1, Double: 1 };
  /* 'Q E' -> ['Q', 'E']; 'Ctrl 1-9' -> ['Ctrl+1', ...]; '1-9 ⇧1-9' -> ['1', ..., 'Shift+1', ...]; 'Shift click' ->
     ['Shift+Click']; 'Right drag' -> ['Right drag']; a lone modifier ('Shift') stands for itself */
  function chords(s) {
    const tok = s.split(/\s+/).filter(Boolean), out = [];
    let mods = [];
    for (let i = 0; i < tok.length; i++) {
      let t = tok[i];
      const pre = /^⇧(.+)$/.exec(t);
      if (pre) { mods.push('Shift'); t = pre[1]; }
      if (MODS[t] && i < tok.length - 1) { mods.push(MODS[t]); continue; }
      if (MOUSE[t] && /^(click|drag)$/i.test(tok[i + 1] || '')) t = `${t} ${tok[++i].toLowerCase()}`;
      if (/^(click|drag)$/i.test(t)) t = t[0].toUpperCase() + t.slice(1).toLowerCase();
      const r = /^(\d)-(\d)$/.exec(t), keys = r ? Array.from({ length: +r[2] - +r[1] + 1 }, (_, j) => String(+r[1] + j)) : [MODS[t] || t];
      for (const k of keys) out.push([...new Set(mods)].sort().concat(k).join('+'));
      mods = [];
    }
    return out;
  }
  const rows = [];
  for (const g of KEYBINDS) {
    check(typeof g.group === 'string' && Array.isArray(g.binds), `group ${g.group}`, 'not { group, binds: [...] }');
    for (const f of ['side', 'mode', 'ctx']) if (g[f] !== undefined) check((f === 'side' ? SIDES : f === 'mode' ? MODES : CTX).includes(g[f]), `group ${g.group}`, `${f} '${g[f]}'`);
    for (const b of g.binds || []) {
      const [key, what, o = {}] = b, at = `${g.group} '${key}'`;
      if (!check(typeof key === 'string' && key.trim() && typeof what === 'string' && what.trim(), at, 'row is not [key, what, opts?]')) continue;
      for (const f of Object.keys(o)) check(['side', 'mode', 'ctx'].includes(f), at, `unknown option '${f}'`);
      if (o.side !== undefined) check(SIDES.includes(o.side), at, `side '${o.side}'`);
      if (o.mode !== undefined) check(MODES.includes(o.mode), at, `mode '${o.mode}'`);
      if (o.ctx !== undefined) check(CTX.includes(o.ctx), at, `ctx '${o.ctx}' is not one of ${CTX.join(', ')}`);
      rows.push({ at, what, ctx: o.ctx || g.ctx || 'play', side: o.side || g.side || null, mode: o.mode || g.mode || null, keys: chords(key) });
    }
  }
  const overlap = (a, b) => a === null || b === null || a === b;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.ctx !== b.ctx || !overlap(a.side, b.side) || !overlap(a.mode, b.mode)) continue;
    const both = a.keys.filter(k => b.keys.includes(k));
    check(!both.length, `${a.ctx}`, `${list(both)} is bound twice: ${a.at} (${a.what}) and ${b.at} (${b.what})`);
  }
  for (const [id] of MENU_FILMS) if (id !== 'random') check(filmExists(id), `menu film ${id}`, 'not in reference/films');
  end();
}

/* ---------------------------------------------------------------- summary */
if (warns.length && !QUIET) { console.log(`\n\x1b[33m${warns.length} warnings\x1b[0m`); for (const w of warns) console.log('  ' + w); }
if (fails.length) { console.log(`\n\x1b[31m${fails.length} failed\x1b[0m`); for (const f of fails) console.log('  ' + f); }
console.log(`\n${nChecks - fails.length - warns.length}/${nChecks} checks clean · ${fails.length} failed · ${warns.length} warnings`);
process.exit(fails.length ? 1 : 0);
