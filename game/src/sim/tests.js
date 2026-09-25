/* In-browser tests for the sim (game/tests.html). Writes PASS / FAIL lines and sets document.title = 'TESTS n/m'.
   URL params: ?only=<substring> runs matching tests, ?map=<id> runs the battle tests on a maps.js map too,
   ?long=1 runs the full AI battle on every difficulty. */
import { Sim, DT } from './sim.js';
import { UNITS, TEL_ELEV, CLASSIFY } from '../data/units.js';
import { stubMap } from './stubmap.js';
import { setupBattle } from './setup.js';
import { horizon, los, getContact } from './sensors.js';
import { physicsTests } from './tests_physics.js';
import { carried } from './amphib.js';
import { PROJ } from '../data/units.js';
import { launch, fireGun, spinout } from './weapons.js';
import { segUnit, HIT, bodyOf } from './bodies.js';

const Q = new URLSearchParams(location.search);
const out = document.getElementById('out');
const results = [];
const line = (cls, html) => { const d = document.createElement('div'); d.className = 'l ' + cls; d.innerHTML = html; out.appendChild(d); return d; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const yieldUI = () => new Promise(r => setTimeout(r, 0));
const fmt = (x, n = 1) => Number(x).toFixed(n);

let MAP = null;
const map = () => MAP || (MAP = stubMap());

class Fail extends Error {}
function ok(cond, msg) { if (!cond) throw new Fail(msg); }

async function test(name, fn) {
  if (Q.get('only') && !name.includes(Q.get('only'))) return;
  const t0 = performance.now();
  try {
    const info = await fn();
    const ms = performance.now() - t0;
    results.push(true);
    line('pass', `<b>PASS</b> ${esc(name)} <span class="info">· ${esc(info || '')} · ${fmt(ms / 1000, 2)} s</span>`);
  } catch (e) {
    results.push(false);
    line('fail', `<b>FAIL</b> ${esc(name)} <span class="info">· ${esc(e instanceof Fail ? e.message : (e.stack || e))}</span>`);
    console.error(name, e);
  }
  document.title = `TESTS ${results.filter(Boolean).length}/${results.length}`;
  await yieldUI();
}

/* run ticks in chunks so the page stays alive; cb(sim) each tick may return true to stop */
async function run(sim, ticks, cb) {
  for (let i = 0; i < ticks; i++) {
    sim.step();
    if (cb && cb(sim)) return i + 1;
    if (i % 4000 === 3999) await yieldUI();
  }
  return ticks;
}

function battle(seed, level, m) {
  const sim = new Sim(m || map(), { seed, fog: true, mode: 'combat', aiSides: ['coast', 'fleet'], difficulty: level || 'normal' });
  setupBattle(sim);
  return sim;
}

/* a land point near the coast and a sea point offshore on the stub map */
function coastPoints(m) {
  const z = 0;
  let xc = null;
  for (let x = -m.W / 2; x < m.W / 2; x += 100) if (m.h(x, z) > 0) { xc = x; break; }
  return { shoreX: xc, z };
}

/* a gentle beach for the landing test (the stub coast is steep): sea to the west, a 0.6 % rise inland, a depot 4 km in */
function beachMap() {
  const W = 40000, H = 40000;
  const h = (x, z) => x < 0 ? -(1.5 + (-x) * .02) : x * .006 + Math.max(0, x - 6000) * .02;
  const slope = (x, z) => { const e = 50; return Math.min(1, Math.hypot((h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e))); };
  return { id: 'beach', name: 'Beach', W, H, cell: 100, cols: 401, rows: 401, heights: new Float32Array(1), h, water: (x, z) => h(x, z) < 0, slope,
    places: [], roads: [], objectives: [{ id: 'depot', name: 'Depot 4', x: 4000, z: 0, r: 1200, kind: 'depot' }],
    spawns: { coast: { x: 12000, z: 0, r: 2000, hdg: -Math.PI / 2 }, fleet: { x: -14000, z: 0, r: 3000, hdg: Math.PI / 2 } },
    replenish: { x: -17000, z: -17000, r: 3000 }, weather: { kind: 'calm', wind: [0, 0], sea: .2 }, time: 'day' };
}

/* ------------------------------------------------------------------ tests */
async function main() {
  // the cost test first: later tests leave the page's JIT and heap full of other sims' shapes, which slows every
  // sim after them by ~20 % (a match runs one sim, as this test does when it runs on its own)
  await test('perf: 200 units, ms per sim-second', async () => {
    const m = map(), sim = new Sim(m, { seed: 77, fog: true, aiSides: ['coast', 'fleet'] });
    setupBattle(sim);
    const r = sim.rng.place;
    const mix = { coast: ['tel', 'tel', 'pantsir', 'radar', 'transloader', 'catapult', 'drone'], fleet: ['ddg', 'ddg', 'helo', 'fighter'] };
    const { shoreX } = coastPoints(m);
    let n = sim.units.size;
    while (n < 200) {
      const side = n % 2 ? 'coast' : 'fleet', type = mix[side][Math.floor(r() * mix[side].length)];
      let x, z;
      if (side === 'coast') { x = shoreX + 3000 + r() * 25000; z = (r() - .5) * 60000; if (m.h(x, z) < 2) continue; }
      else { x = shoreX - 20000 - r() * 40000; z = (r() - .5) * 70000; if (m.h(x, z) > -40) continue; }
      sim.spawn(type, side, x, z, { hold: true, deployed: true, alt: type === 'fighter' ? 6000 : undefined });
      n++;
    }
    await run(sim, 200);
    // best of three one-minute windows (the machine is shared; the minimum is the honest cost)
    const T = 20 * 60;
    let perSec = 1e9;
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); await run(sim, T); perSec = Math.min(perSec, (performance.now() - t0) / (T * DT)); }
    const units = sim.units.size;
    ok(perSec < 10, `${fmt(perSec, 2)} ms per sim-second: too heavy for x32 (budget 10 ms per sim-second)`);
    return `${units} units, ${sim.projectiles.size} missiles in flight at the end: ${fmt(perSec, 2)} ms per sim-second → x32 costs ${fmt(perSec * 32 / 10, 2)}% of a core · ${fmt(perSec * 32 / 60, 2)} ms per 60 Hz frame`;
  });

  await test('radar horizon math', () => {
    ok(Math.abs(horizon(0, 0)) < 1e-9, 'horizon(0,0) != 0');
    ok(Math.abs(horizon(25, 0) - 20600) < 1, `horizon(25,0) = ${horizon(25, 0)}`);
    ok(Math.abs(horizon(100, 25) - 61800) < 1, `horizon(100,25) = ${horizon(100, 25)}`);
    ok(Math.abs(horizon(20, 45) / 1000 - 4.12 * (Math.sqrt(20) + Math.sqrt(45))) < 1e-6, 'formula');
    // a flat sea: LOS with earth bulge must agree with the horizon formula
    const flat = { h: () => -50 };
    const d = horizon(20, 10);
    ok(los(flat, 0, 20, 0, d * .97, 10, 0), 'LOS blocked inside the horizon');
    ok(!los(flat, 0, 20, 0, d * 1.08, 10, 0), 'LOS clear beyond the horizon');
    return `4.12(√h1+√h2): 25 m → ${fmt(horizon(25, 0) / 1000)} km · 20 m vs 10 m → ${fmt(d / 1000)} km`;
  });

  await test('radar horizon in the sim (sea-skimmer vs mast height)', async () => {
    const m = map();
    const sim = new Sim(m, { seed: 7, fog: true });
    const ddg = sim.spawn('ddg', 'fleet', -45000, -30000, { hdg: 0 });
    // helos at 60 m over the sea: horizon 4.12 (sqrt 20 + sqrt 60) = 50.3 km; one at 49 km, one at 55 km
    const near = sim.spawn('helo', 'coast', -45000, -30000 + 49000, { alt: 60 });
    const far = sim.spawn('helo', 'coast', -45000 + 22000, -30000 + 50400, { alt: 60 });
    for (const h of [near, far]) { sim.setRadar(h, false, true); h.altT = 60; }
    await run(sim, 20 * 30);
    const cN = sim.contact('fleet', near.id), cF = sim.contact('fleet', far.id);
    const hz = horizon(20, 60);
    ok(!cF, `helo beyond the horizon (${fmt(Math.hypot(far.pos[0] - ddg.pos[0], far.pos[2] - ddg.pos[2]) / 1000)} km > ${fmt(hz / 1000)} km) was detected`);
    ok(cN && cN.conf > .3, 'helo inside the horizon not detected');
    return `horizon ${fmt(hz / 1000)} km: 49 km seen (conf ${fmt(cN.conf, 2)}), 55 km unseen`;
  });

  await test('determinism: same seed -> same state hash after 5000 ticks', async () => {
    const a = battle(4242), b = battle(4242), c = battle(4243);
    await run(a, 5000); await run(b, 5000); await run(c, 5000);
    const ha = a.hash(), hb = b.hash(), hc = c.hash();
    ok(ha === hb, `hash differs: ${ha} vs ${hb}`);
    ok(ha !== hc, 'different seeds gave the same hash (state not seeded?)');
    return `hash ${ha} (seed 4242) · ${hc} (seed 4243) · ${a.units.size} units, ${Object.values(a.counts).reduce((x, y) => x + y, 0)} events`;
  });

  await test('land units never enter water, ships never cross land', async () => {
    const m = map(), sim = battle(99, 'hard');
    const { shoreX } = coastPoints(m);
    // provoke: a TEL told to drive into the sea, a DDG told to sail inland, both across the coastline
    const tel = sim.spawn('tel', 'coast', shoreX + 3000, 5000, { hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 6000, -3000, { hdg: Math.PI / 2 });
    sim.order([tel.id], { kind: 'move', x: shoreX - 8000, z: 5000 });
    sim.order([ddg.id], { kind: 'move', x: shoreX + 9000, z: -3000 });
    let bad = null, checks = 0, minDepth = 1e9;
    await run(sim, 24000, s => {
      for (const u of s.list()) {
        if (!u.alive || u.aboard) continue;
        const dom = u.def.domain, h = s.map.h(u.pos[0], u.pos[2]);
        if (dom === 'land' && h < 0) { bad = `${u.type} #${u.id} in water at ${u.pos.map(Math.round)} (h ${fmt(h)})`; return true; }
        if (dom === 'sea') { if (h >= 0) { bad = `${u.type} #${u.id} on land at ${u.pos.map(Math.round)}`; return true; } minDepth = Math.min(minDepth, -h - u.def.draught); }
        checks++;
      }
    });
    ok(!bad, bad);
    ok(s0(tel) >= 0, 'TEL ended in water');
    return `${checks} unit-ticks checked over ${fmt(sim.t / 60, 0)} min · TEL stopped ${fmt(Math.abs(tel.pos[0] - shoreX))} m from the shore line · least keel clearance ${fmt(minDepth)} m`;
    function s0(u) { return m.h(u.pos[0], u.pos[2]); }
  });

  await test('pathfinding: land around a bay, sea around a cape', () => {
    const m = map(), sim = new Sim(m, { seed: 1 });
    const t0 = performance.now();
    const pl = sim.nav.path('land', m.spawns.coast.x, m.spawns.coast.z, m.objectives[0].x, m.objectives[0].z);
    const ps = sim.nav.path('sea', m.spawns.fleet.x, m.spawns.fleet.z, -8000, -40000);
    const ms = performance.now() - t0;
    ok(pl && pl.length > 1, 'no land path to the port');
    ok(ps && ps.length >= 1, 'no sea path');
    for (const p of pl) ok(m.h(p[0], p[1]) > 0, `land waypoint in water ${p.map(Math.round)}`);
    for (const p of ps) ok(m.h(p[0], p[1]) < 0, `sea waypoint on land ${p.map(Math.round)}`);
    const t1 = performance.now(); sim.nav.path('land', m.spawns.coast.x, m.spawns.coast.z, m.objectives[0].x, m.objectives[0].z); const cached = performance.now() - t1;
    return `${pl.length} land / ${ps.length} sea waypoints · ${fmt(ms, 1)} ms first (grids built), ${fmt(cached, 2)} ms cached · cell ${sim.nav.cell} m`;
  });

  await test('detection -> classification -> engagement', async () => {
    const m = map(), sim = new Sim(m, { seed: 11, fog: true, weather: { kind: 'calm', wind: [0, 0], sea: .2 } });
    const { shoreX } = coastPoints(m);
    // coast: a radar on the bluff and an erect TEL on hold; fleet: one DDG 45 km out, one Pantsir-less shore
    const rs = sim.spawn('radar', 'coast', shoreX + 2500, 0, { deployed: true, hdg: -Math.PI / 2 });
    const tel = sim.spawn('tel', 'coast', shoreX + 6000, -2000, { deployed: true, hold: true, hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 45000, 0, { hdg: Math.PI / 2 });
    let tDet = null, tCls = null, tFire = null, tSm6 = null, fired = 0;
    await run(sim, 20 * 400, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'detect' && e.side === 'coast' && e.unit === ddg.id && tDet === null) tDet = s.t;
        if (e.type === 'classify' && e.side === 'coast' && e.unit === ddg.id) tCls = s.t;
        if (e.type === 'launch' && e.kind === 'oniks') { tFire = tFire || s.t; fired++; }
        if (e.type === 'launch' && e.kind === 'sm6' && tSm6 === null) tSm6 = s.t;
      }
      return tSm6 !== null && fired >= 2;
    });
    ok(tDet !== null, 'DDG never detected by the coast radar');
    ok(tCls !== null && tCls >= tDet, 'DDG never classified');
    const c = sim.contact('coast', ddg.id);
    ok(c && c.cls === 'DDG', 'contact class wrong');
    ok(tFire !== null && tFire >= tCls, `TEL did not fire after classification (fire ${tFire}, cls ${tCls})`);
    ok(fired === 2, `expected a 2-round salvo, got ${fired}`);
    ok(tSm6 !== null, 'DDG did not engage the incoming rounds');
    return `detect ${fmt(tDet)} s → classify ${fmt(tCls)} s (${c.track}) → salvo ${fmt(tFire)} s → SM-6 ${fmt(tSm6)} s`;
  });

  await test('fog of war: visible() follows the picture', async () => {
    const m = map(), sim = new Sim(m, { seed: 5, fog: true, weather: { kind: 'calm' } });
    const { shoreX } = coastPoints(m);
    const rs = sim.spawn('radar', 'coast', shoreX + 2500, 0, { deployed: true });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 30000, 0, {});
    const far = sim.spawn('ddg', 'fleet', -m.W / 2 + 2000, m.H / 2 - 2000, {});
    ok(sim.visible('coast', rs) === 'own', 'own');
    ok(sim.visible('coast', ddg) === null, 'unseen enemy visible at t=0');
    let saw = null;
    await run(sim, 20 * 120, s => { const v = s.visible('coast', ddg); if (v === 'contact' && !saw) saw = s.t; return v === 'track'; });
    ok(saw !== null, 'never a contact before becoming a track');
    ok(sim.visible('coast', ddg) === 'track', 'never a track');
    ok(sim.visible('coast', far) === null, 'far unit (beyond horizon) visible');
    const nf = new Sim(m, { seed: 5, fog: false }); const u2 = nf.spawn('ddg', 'fleet', 0, 0, {});
    ok(nf.visible('coast', u2) === 'track', 'fog off must show everything');
    return `contact at ${fmt(saw)} s → track at ${fmt(sim.t)} s; beyond-horizon ship stays hidden`;
  });

  await test('ammo use: a TEL fires its 2 rounds, then stops', async () => {
    const m = map(), sim = new Sim(m, { seed: 3, fog: false });
    const { shoreX } = coastPoints(m);
    const tel = sim.spawn('tel', 'coast', shoreX + 5000, 0, { deployed: true, hold: true, hdg: -Math.PI / 2 });
    const d1 = sim.spawn('ddg', 'fleet', shoreX - 50000, 8000, {}), d2 = sim.spawn('ddg', 'fleet', shoreX - 50000, -8000, {});
    // no fog: contacts still come from sensors, so give the coast a picture by scan-free means: a radar
    sim.spawn('radar', 'coast', shoreX + 2000, 0, { deployed: true });
    let launches = 0, gaps = [], last = null;
    await run(sim, 20 * 300, s => { for (const e of s.drainEvents()) if (e.type === 'launch' && e.kind === 'oniks') { launches++; if (last !== null) gaps.push(s.t - last); last = s.t; } });
    ok(launches === 2, `launched ${launches} rounds`);
    ok(tel.ammo.oniks === 0, `ammo left ${tel.ammo.oniks}`);
    ok(gaps.length === 1 && gaps[0] >= 2.4 && gaps[0] <= 3.1, `salvo interval ${gaps}`);
    ok(tel.st.capL === 1 && tel.st.capR === 1, 'TLC caps not gone after firing');
    return `2 rounds ${fmt(gaps[0], 2)} s apart, ammo 0, caps off, no further launches in ${fmt(sim.t, 0)} s`;
  });

  await test('terrain look-ahead: strike missiles climb over a sea cliff to a target behind it', async () => {
    // a 380 m wall of cliff straight out of the sea, the target 3.5 km behind its edge on the plateau
    const cliff = {
      W: 100000, H: 60000, cell: 200,
      h: (x, z) => x < 0 ? -60 : Math.min(320, -60 + x * 2.6), slope: (x, z) => x >= 0 && x < 146 ? 1 : 0, water: (x, z) => x < 0,
      objectives: [], roads: [], places: [], replenish: { x: -45000, z: 20000, r: 3000 },
      spawns: { coast: { x: 5000, z: 0, r: 2000, hdg: -Math.PI / 2 }, fleet: { x: -40000, z: 0, r: 3000, hdg: Math.PI / 2 } },
      weather: { kind: 'calm', wind: [0, 0], sea: .2 },
    };
    const sim = new Sim(cliff, { seed: 9, fog: false });
    const tgt = sim.spawn('tel', 'coast', 3500, 800, { hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', -42000, 0, { hdg: Math.PI / 2 });
    sim.run(10);                                                   // fog off: the picture fills on the first sensor tick
    sim.order([ddg.id], { kind: 'attack', target: tgt.id, n: 2 });
    let launched = 0, terrain = 0, hits = 0, minClr = 1e9;
    await run(sim, 20 * 400, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'launch' && e.kind === 'tlam') launched++;
        if (e.type === 'splash' && e.kind === 'tlam' && e.why === 'terrain') terrain++;
        if (e.type === 'hit' && e.kind === 'tlam') hits++;
      }
      for (const p of s.projectiles.values()) if (p.kind === 'tlam' && p.pos[0] > -200 && p.pos[0] < 2800) minClr = Math.min(minClr, p.pos[1] - cliff.h(p.pos[0], p.pos[2]));
      return launched >= 2 && !s.projectiles.size;
    });
    ok(launched === 2, `launched ${launched}`);
    ok(terrain === 0, `${terrain} round(s) flew into the cliff`);
    ok(hits >= 1, 'no hit on the target behind the cliff');
    return `2 TLAM over a 380 m cliff: ${hits} hit(s), none into the rock · least clearance over the cliff ${fmt(minClr)} m`;
  });

  await test('reload: transloader beside a deployed TEL, ~45 s per round', async () => {
    const m = map(), sim = new Sim(m, { seed: 3, fog: true });
    const { shoreX } = coastPoints(m);
    const tel = sim.spawn('tel', 'coast', shoreX + 6000, 1000, { deployed: true, hdg: -Math.PI / 2 });
    tel.ammo.oniks = 0; tel.caps = [1, 1];
    const tl = sim.spawn('transloader', 'coast', shoreX + 7500, 1600, { hdg: -Math.PI / 2 });
    sim.order([tl.id], { kind: 'reload', target: tel.id });
    let start = null, done = [], ends = 0, lowered = null;
    await run(sim, 20 * 400, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'reload_start' && start === null) start = s.t;
        if (e.type === 'reload_done') done.push(s.t);
        if (e.type === 'deploy' && e.what === 'lowered' && lowered === null) lowered = s.t;
        if (e.type === 'reload_end') ends++;
      }
      return tel.ammo.oniks === 2 && tel.elev >= TEL_ELEV;
    });
    ok(start !== null, 'reload never started');
    ok(done.length === 2, `reload_done x${done.length}`);
    ok(tel.ammo.oniks === 2 && tl.cargo === 0, `TEL ammo ${tel.ammo.oniks}, transloader cargo ${tl.cargo}`);
    ok(Math.abs(done[1] - done[0] - 45) < 1, `round time ${done[1] - done[0]}`);
    ok(tel.elev >= TEL_ELEV, 'TEL did not re-erect');
    ok(tel.st.capL === 0 && tel.st.capR === 0, 'caps not refitted');
    // the transloader refills at the depot
    sim.order([tl.id], { kind: 'reload' });
    let refilled = false;
    await run(sim, 20 * 1800, s => { for (const e of s.drainEvents()) if (e.type === 'resupply' && e.unit === tl.id && tl.cargo === 2) refilled = true; return refilled; });
    ok(refilled, `transloader did not refill at a depot (cargo ${tl.cargo})`);
    return `launcher lowered ${fmt(lowered)} s, rounds at ${done.map(x => fmt(x)).join(' / ')} s, re-erected; refilled at depot by ${fmt(sim.t / 60)} min`;
  });

  await test('attack order persists: volley, watch the round down, volley again (salvo 1), ends when empty', async () => {
    const m = map(), sim = new Sim(m, { seed: 3, fog: false });
    const { shoreX } = coastPoints(m);
    const tel = sim.spawn('tel', 'coast', shoreX + 5000, 0, { deployed: true, hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 50000, 0, {});
    sim.run(10);                                                   // fog off: the picture fills on the first sensor tick
    sim.order([tel.id], { kind: 'salvo', n: 1 });
    sim.order([tel.id], { kind: 'attack', target: ddg.id });       // no n: the player's standing attack
    const launches = [], volleys = [], downs = [];
    let held = 0, done = null;
    await run(sim, 20 * 900, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'launch' && e.kind === 'oniks') launches.push(s.t);
        if (e.type === 'engage' && e.unit === tel.id) { if (e.state === 'volley') volleys.push(s.t); if (e.state === 'done') done = e.why; }
        if ((e.type === 'hit' || e.type === 'intercept' || e.type === 'splash') && e.kind === 'oniks') downs.push(s.t);
      }
      const o = tel.orders[0];
      if (launches.length === 1 && o && o.kind === 'attack' && o.st === 'look') held++;
      return done !== null;
    });
    ok(launches.length === 2, `launched ${launches.length} rounds`);
    ok(volleys.length === 2, `volleys ${volleys.length}`);
    ok(held > 20, 'the order did not stay on between the volleys');
    ok(downs.length >= 1 && launches[1] >= downs[0] + 3.9, `second volley at ${fmt(launches[1])} s, first round down at ${fmt(downs[0])} s`);
    ok(done === 'empty' || done === 'destroyed', `ended: ${done}`);
    ok(!tel.orders.length, 'order still in hand');
    return `volley 1 at ${fmt(launches[0])} s, round down at ${fmt(downs[0])} s, volley 2 at ${fmt(launches[1])} s, order ended (${done})`;
  });

  await test('attack order holds a lost track (no fire) and resumes when the track is back', async () => {
    const m = map(), sim = new Sim(m, { seed: 4, fog: true, weather: { kind: 'calm' } });
    const { shoreX } = coastPoints(m);
    const tel = sim.spawn('tel', 'coast', shoreX + 5000, 0, { deployed: true, hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 50000, 0, {});
    const c = getContact(sim, 'coast', ddg);
    // a sensor the test controls: the track held at conf, or let down below classification
    const hold = conf => { c.conf = conf; c.lastSeen = sim.t; c.pos[0] = ddg.pos[0]; c.pos[1] = 0; c.pos[2] = ddg.pos[2]; c.err = 50; c.cls = 'DDG'; c.type = 'ddg'; c.name = ddg.def.name; };
    hold(.9);
    sim.order([tel.id], { kind: 'salvo', n: 1 });
    sim.order([tel.id], { kind: 'attack', target: ddg.id });
    const launches = [], states = [];
    let lostAt = null, firedLost = 0, stLost = 0;
    await run(sim, 20 * 600, s => {
      const since = launches.length ? s.t - launches[0] : 0;
      const lost = launches.length === 1 && since > 1 && since < 61;
      hold(lost ? .3 : .9);
      for (const e of s.drainEvents()) {
        if (e.type === 'launch' && e.kind === 'oniks') { launches.push(s.t); if (lost) firedLost++; }
        if (e.type === 'engage' && e.unit === tel.id) { states.push(e.state); if (e.state === 'lost' && lostAt === null) lostAt = s.t; }
      }
      if (lost && tel.orders[0] && tel.orders[0].st === 'lost') stLost++;
      return launches.length === 2;
    });
    ok(lostAt !== null, 'no lost event');
    ok(stLost > 100 && firedLost === 0, `held ${stLost} ticks, fired ${firedLost} while lost`);
    ok(states.includes('resume'), `states ${states.join(',')}`);
    ok(launches.length === 2 && launches[1] > launches[0] + 61, `launches ${launches.map(x => fmt(x)).join(' / ')}`);
    return `lost ${fmt(lostAt - launches[0])} s after volley 1, held, resumed; volley 2 at ${fmt(launches[1])} s (${states.join(' → ')})`;
  });

  await test('attack order: salvo ALL, the empty TEL calls a transloader, reloads and fires again', async () => {
    const m = map(), sim = new Sim(m, { seed: 5, fog: false });
    const { shoreX } = coastPoints(m);
    const tel = sim.spawn('tel', 'coast', shoreX + 5000, 0, { deployed: true, hdg: -Math.PI / 2 });
    const tl = sim.spawn('transloader', 'coast', shoreX + 6500, 600, { hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 55000, 0, {});
    ddg.hp = ddg.hpMax = 5000;                                     // it has to outlast two volleys
    sim.run(10);
    sim.order([tel.id], { kind: 'salvo', n: 0 });
    sim.order([tel.id], { kind: 'attack', target: ddg.id });
    const launches = [], volleys = [];
    let called = null, reloaded = null;
    await run(sim, 20 * 1200, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'launch' && e.kind === 'oniks') launches.push(s.t);
        if (e.type === 'engage' && e.unit === tel.id && e.state === 'volley') volleys.push(s.t);
        if (e.type === 'reload_done' && e.unit === tel.id && e.ammo === 2) reloaded = s.t;
      }
      if (called === null && tl.orders[0] && tl.orders[0].kind === 'reload' && tl.orders[0].target === tel.id) called = s.t;
      return launches.length >= 4;
    });
    ok(volleys.length >= 2 && launches.length === 4, `launches ${launches.length}, volleys ${volleys.length}`);
    ok(launches[1] - launches[0] < 4, 'volley 1 was not both rounds at once');
    ok(called !== null && called < launches[2], 'the transloader was not called');
    ok(reloaded !== null && launches[2] > reloaded, `fired again at ${fmt(launches[2])} s before the reload was done (${reloaded})`);
    return `volley 1 (2 rounds) at ${fmt(launches[0])} s, transloader called ${fmt(called)} s, reloaded ${fmt(reloaded)} s, volley 2 at ${fmt(launches[2])} s`;
  });

  await test('scan: identify everything in the radius, cooldown, scanner revealed', async () => {
    const m = map(), sim = new Sim(m, { seed: 21, fog: true, weather: { kind: 'calm' } });
    const { shoreX } = coastPoints(m);
    const rs = sim.spawn('radar', 'coast', shoreX + 2500, 0, { deployed: true });
    rs.radarOn = true;
    const a = sim.spawn('ddg', 'fleet', shoreX - 60000, 20000, {}), b = sim.spawn('ddg', 'fleet', shoreX - 58000, 21500, {});
    const out = sim.spawn('ddg', 'fleet', shoreX - 60000, 30000, {});
    sim.step();
    ok(!sim.contact('coast', a.id) || sim.contact('coast', a.id).conf < .5, 'pre-condition');
    sim.order([rs.id], { kind: 'scan', x: shoreX - 59000, z: 20500 });
    let start = null, hit = null;
    await run(sim, 20 * 5, s => { for (const e of s.drainEvents()) { if (e.type === 'scan' && e.phase === 'start') start = e; if (e.type === 'scan' && e.phase === 'hit') hit = e; } return hit; });
    ok(start && hit, 'no scan events');
    ok(hit.hits.includes(a.id) && hit.hits.includes(b.id) && !hit.hits.includes(out.id), `hits ${hit.hits}`);
    const ca = sim.contact('coast', a.id);
    ok(ca.conf >= .97 && ca.identified && ca.cls === 'DDG', `contact ${ca.conf} ${ca.identified} ${ca.cls}`);
    ok(/^TRK \d+$/.test(ca.track), 'track number');
    const rev = sim.contact('fleet', rs.id);
    ok(rev && rev.conf > 0, 'scanner not revealed to the enemy');
    // cooldown: a second scan waits
    sim.order([rs.id], { kind: 'scan', x: shoreX - 59000, z: 30000 });
    let second = null;
    await run(sim, 20 * 25, s => { for (const e of s.drainEvents()) if (e.type === 'scan' && e.phase === 'start') second = s.t; });
    ok(second === null, 'second scan fired during cooldown');
    return `delay ${fmt(hit.t - start.t, 2)} s, ${hit.hits.length} identified (${ca.track} conf ${fmt(ca.conf, 2)}), scanner seen by fleet (conf ${fmt(rev.conf, 2)}), cooldown holds`;
  });

  await test('EMCON: a radiating radar is heard, a silent one is not', async () => {
    const m = map();
    const mk = on => {
      const sim = new Sim(m, { seed: 8, fog: true, weather: { kind: 'calm' } });
      const { shoreX } = coastPoints(m);
      const rs = sim.spawn('radar', 'coast', shoreX + 2500, 0, { deployed: true });
      sim.order([rs.id], { kind: 'radar', on });
      const d = sim.spawn('ddg', 'fleet', shoreX - 62000, 0, {});
      sim.setRadar(d, false, true);
      return { sim, rs };
    };
    const A = mk(true), B = mk(false);
    await run(A.sim, 20 * 30); await run(B.sim, 20 * 30);
    const ca = A.sim.contact('fleet', A.rs.id), cb = B.sim.contact('fleet', B.rs.id);
    ok(ca && ca.emitting && ca.conf < CLASSIFY, `radiating radar: ${ca && ca.conf}`);
    ok(ca.err >= 600, `ESM error too small ${ca.err}`);
    ok(!cb, 'silent radar was found');
    return `heard at 62 km: ${ca.track} conf ${fmt(ca.conf, 2)} err ${fmt(ca.err / 1000)} km (unclassified); EMCON radar unseen`;
  });

  await test('ESM cross-fix: a radar heard from two bearings is classified; one bearing or a silent radar is not', async () => {
    const m = map(), calm = { kind: 'calm', wind: [0, 0], sea: .2 };
    const { shoreX } = coastPoints(m);
    // the listeners sail silent (radar off) so only their ESM counts
    const mk = (on, ships, aew) => {
      const sim = new Sim(m, { seed: 31, fog: true, weather: calm });
      const rs = sim.spawn('radar', 'coast', shoreX + 2500, 0, { deployed: true });
      sim.order([rs.id], { kind: 'radar', on });
      for (const [x, z] of ships) sim.setRadar(sim.spawn('ddg', 'fleet', x, z, {}), false, true);
      let a = null;
      if (aew) { a = sim.spawn('aew', 'fleet', aew[0], aew[1], { hdg: 0 }); sim.setRadar(a, false, true); sim.order([a.id], { kind: 'move', x: aew[0], z: aew[1] + 40000 }); }
      return { sim, rs, a };
    };
    const one = mk(true, [[shoreX - 55000, 0]]);                                     // one bearing
    const two = mk(true, [[shoreX - 45000, -12000], [shoreX - 45000, 12000]]);       // ~28 deg apart at 49 km
    const mute = mk(false, [[shoreX - 45000, -12000], [shoreX - 45000, 12000]]);     // EMCON
    const masked = mk(true, [[shoreX - 55000, -12000], [shoreX - 55000, 12000]]);    // an island hides it from the first
    const fly = mk(true, [], [shoreX - 60000, -20000]);                             // one E-2D flying across
    const tCls = s => { let t = null; return x => { if (t === null && x.visible('fleet', s.rs) === 'track') t = x.t; return t; }; };
    const w2 = tCls(two), wf = tCls(fly);
    await run(one.sim, 20 * 300);
    await run(two.sim, 20 * 300, s => { w2(s); });
    await run(mute.sim, 20 * 120);
    await run(masked.sim, 20 * 300);
    await run(fly.sim, 20 * 300, s => { wf(s); });
    const c1 = one.sim.contact('fleet', one.rs.id), c2 = two.sim.contact('fleet', two.rs.id), cf = fly.sim.contact('fleet', fly.rs.id);
    ok(c1 && c1.emitting && c1.conf < CLASSIFY && !c1.xfix, `one bearing classified it (conf ${c1 && fmt(c1.conf, 2)})`);
    const t2 = w2(two.sim), tf = wf(fly.sim);
    ok(t2 !== null && t2 < 200, `two bearings: not classified in 200 s (${t2})`);
    ok(c2.cls === 'RADAR' && !c2.identified && c2.conf <= .8 + 1e-9, `cross-fixed contact ${c2.cls} conf ${fmt(c2.conf, 2)} identified ${c2.identified}`);
    const e2 = Math.hypot(c2.pos[0] - two.rs.pos[0], c2.pos[2] - two.rs.pos[2]);
    ok(c2.err < 1500 && e2 < 2000, `cross-fix error ${fmt(c2.err)} m, off by ${fmt(e2)} m`);
    ok(!mute.sim.contact('fleet', mute.rs.id), 'a silent radar was found');
    const cm = masked.sim.contact('fleet', masked.rs.id);
    ok(cm && cm.conf < CLASSIFY && !cm.xfix, `a bearing through an island counted (conf ${cm && fmt(cm.conf, 2)})`);
    ok(tf !== null && cf.cls === 'RADAR', `one E-2D flying across never classified it (conf ${cf && fmt(cf.conf, 2)})`);
    // it goes quiet: the track fades below classification within a couple of minutes
    two.sim.order([two.rs.id], { kind: 'radar', on: false });
    await run(two.sim, 20 * 150);
    const q = two.sim.contact('fleet', two.rs.id);
    ok(!q || q.conf < CLASSIFY, `the fix held after EMCON (conf ${q && fmt(q.conf, 2)})`);
    return `one bearing: conf ${fmt(c1.conf, 2)} · two bearings: classified at ${fmt(t2)} s, err ${fmt(c2.err)} m (off ${fmt(e2)} m) · `
      + `one masked by an island: conf ${fmt(cm.conf, 2)} · one E-2D across: ${fmt(tf)} s · EMCON: unseen; `
      + `fades to ${q ? fmt(q.conf, 2) : 'lost'} 150 s after going quiet`;
  });

  await test('fleet sensors over land: E-2D looks down (slowly), DDG sees the shore, a Hornet pod reveals what it overflies', async () => {
    const m = map(), calm = { kind: 'calm', wind: [0, 0], sea: .2 };
    const { shoreX } = coastPoints(m);
    const shoreAt = z => { for (let x = m.W / 2 - 100; x > -m.W / 2; x -= 100) if (m.h(x, z) < 0) return x + 100; return shoreX; };   // the mainland's
    const sim = new Sim(m, { seed: 32, fog: true, weather: calm });
    const near = sim.spawn('tel', 'coast', shoreAt(-30000) + 1200, -30000, { hdg: 0 });   // on the shore, parked
    const far = sim.spawn('tel', 'coast', shoreAt(30000) + 9000, 30000, { hdg: 0 });      // inland, parked
    // an E-2D orbiting 25 km off the inland TEL: it sees it slowly; a DDG 15 km off the shore TEL (inland: 11 km)
    const a = sim.spawn('aew', 'fleet', far.pos[0] - 25000, far.pos[2], { hdg: 0 });
    sim.order([a.id], { kind: 'patrol', x: far.pos[0] - 25000, z: far.pos[2], r: 6000 });
    const d = sim.spawn('ddg', 'fleet', near.pos[0] - 15000, near.pos[2], { hdg: Math.PI / 2 });
    let tNear = null, tFar = null;
    await run(sim, 20 * 900, s => {
      if (tNear === null && s.visible('fleet', near) === 'track') tNear = s.t;
      if (tFar === null && s.visible('fleet', far) === 'track') tFar = s.t;
      return tNear !== null && tFar !== null;
    });
    ok(tNear !== null && tNear < 60, `DDG: shore TEL at 15 km not classified in 60 s (${tNear})`);
    ok(tFar !== null && tFar > 60 && tFar < 900, `E-2D: inland TEL at 25 km classified at ${tFar} s (want slow, under 15 min)`);
    // an F/A-18E flies over a third TEL no radar sees: the pod identifies it
    const s2 = new Sim(m, { seed: 33, fog: true, weather: calm });
    const t3 = s2.spawn('tel', 'coast', shoreX + 12000, 0, { hdg: 0 });
    const f = s2.spawn('fighter', 'fleet', t3.pos[0] - 30000, t3.pos[2] + 2500, { hdg: Math.PI / 2 });
    s2.setRadar(f, false, true);
    s2.order([f.id], { kind: 'move', x: t3.pos[0] + 20000, z: t3.pos[2] + 2500 });
    let tPod = null, minD = 1e9;
    await run(s2, 20 * 240, s => {
      minD = Math.min(minD, Math.hypot(f.pos[0] - t3.pos[0], f.pos[2] - t3.pos[2]));
      const c = s.contact('fleet', t3.id);
      if (tPod === null && c && c.identified) tPod = s.t;
      return tPod !== null;
    });
    ok(tPod !== null, `the pod never revealed the TEL (closest pass ${fmt(minD)} m)`);
    const c3 = s2.contact('fleet', t3.id);
    ok(c3.cls === 'TEL' && c3.err < 50, `pod contact ${c3.cls} err ${fmt(c3.err)}`);
    return `DDG, shore TEL at 15 km: ${fmt(tNear)} s · E-2D, parked TEL at 25 km: ${fmt(tFar)} s · Hornet pod pass at ${fmt(minD / 1000)} km: identified at ${fmt(tPod)} s`;
  });

  await test('submarines: radar never sees a deep boat, sonar hears it close, a launch shows it, torpedoes sink it', async () => {
    const m = map(), calm = { kind: 'calm', wind: [0, 0], sea: .2 };
    // 1. a destroyer's radar 20 km off: nothing while the Kilo is deep; a track once it has surfaced
    let sim = new Sim(m, { seed: 13, fog: true, weather: calm });
    const ssk = sim.spawn('ssk', 'coast', -15000, 10000, { hdg: 0 });
    sim.spawn('ddg', 'fleet', -35000, 10000, { hdg: Math.PI / 2 });
    ok(ssk.depth > ssk.def.sub.pd + 4, `spawned at ${fmt(ssk.depth)} m, not deep`);
    await run(sim, 20 * 90);
    ok(sim.visible('fleet', ssk) === null, 'a deep boat was seen at 20 km');
    sim.order([ssk.id], { kind: 'dive', depth: 0 });
    let tSurf = null;
    await run(sim, 20 * 300, s => { if (tSurf === null && ssk.depth <= ssk.def.draught + .5) tSurf = s.t; return tSurf !== null && s.visible('fleet', ssk) === 'track'; });
    ok(tSurf !== null, 'never surfaced');
    ok(sim.visible('fleet', ssk) === 'track', 'a surfaced boat 20 km off was not tracked by radar');
    const tTrack = sim.t - tSurf;
    // 2. deep and still, a destroyer 3.5 km off hears it: sonar contact -> classified -> Mk 54s from its tubes (weapons free)
    sim = new Sim(m, { seed: 14, fog: true, weather: calm });
    const k2 = sim.spawn('ssk', 'coast', -15000, 10000, { hdg: 0 });
    const d2 = sim.spawn('ddg', 'fleet', -18500, 10000, { hdg: 0, hold: true });
    let tHeard = null, tCls = null, tTorp = null, tHit = null, rings = 0;
    await run(sim, 20 * 1200, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'detect' && e.side === 'fleet' && e.unit === k2.id && tHeard === null) { ok(e.how === 'sonar', `first contact by ${e.how}`); tHeard = s.t; }
        if (e.type === 'classify' && e.side === 'fleet' && e.unit === k2.id) tCls = s.t;
        if (e.type === 'sonar' && e.side === 'fleet' && e.unit === k2.id) rings++;
        if (e.type === 'launch' && e.kind === 'mk54' && tTorp === null) tTorp = s.t;
        if (e.type === 'hit' && e.target === k2.id && tHit === null) tHit = s.t;
      }
      return !k2.alive;
    });
    ok(tHeard !== null, 'the destroyer never heard the boat at 3.5 km');
    ok(tCls !== null && sim.contact('fleet', k2.id) && sim.contact('fleet', k2.id).cls === 'SSK' || !k2.alive, 'sonar contact never classified as SSK');
    ok(rings > 0, 'no sonar events');
    ok(tTorp !== null && tTorp >= tCls, `no torpedo after classification (${tTorp})`);
    ok(tHit !== null && !k2.alive, `the boat survived (hp ${k2.hp})`);
    // 3. at periscope depth it fires Kalibr at a destroyer its side tracks: the launch gives the fleet a rough contact
    sim = new Sim(m, { seed: 15, fog: true, weather: calm });
    const { shoreX } = coastPoints(m);
    sim.spawn('radar', 'coast', shoreX + 2500, 0, { deployed: true });
    const k3 = sim.spawn('ssk', 'coast', -22000, 0, { hdg: -Math.PI / 2, dive: 1, hold: true });
    const d3 = sim.spawn('ddg', 'fleet', -40000, 0, {});                        // inside the coast radar's horizon, out of torpedo reach
    let tKal = null, before = 'x', prev = null;
    await run(sim, 20 * 600, s => {
      for (const e of s.drainEvents()) if (e.type === 'launch' && e.kind === 'kalibr' && tKal === null) { tKal = s.t; before = prev; }
      prev = s.visible('fleet', k3);                                 // the fleet's picture as the tick ends
      return tKal !== null && s.t > tKal + 1;
    });
    ok(tKal !== null, 'the Kilo never fired at the tracked destroyer');
    ok(before === null, `the boat was in the fleet picture before it fired (${before})`);
    const c3 = sim.contact('fleet', k3.id);
    ok(c3 && c3.conf < CLASSIFY, 'the launch did not give the fleet a rough contact');
    return `deep: unseen at 20 km; surfaced: tracked ${fmt(tTrack)} s later · sonar at 3.5 km: heard ${fmt(tHeard)} s, classified ${fmt(tCls)} s, Mk 54 ${fmt(tTorp)} s, sunk ${fmt(sim.t && tHit)} s (${rings} sonar pings) · Kalibr from PD at ${fmt(tKal)} s: fleet contact ${c3.track} conf ${fmt(c3.conf, 2)}`;
  });

  await test('reinforcements: buy -> arrive after build time', async () => {
    const m = map(), sim = new Sim(m, { seed: 2, supply: 3000 });
    const cv = sim.spawn('carrier', 'fleet', m.spawns.fleet.x, m.spawns.fleet.z, {});
    ok(sim.buy('fleet', 'fighter'), 'buy fighter failed');
    ok(sim.buy('coast', 'tel'), 'buy tel failed');
    ok(!sim.buy('coast', 'ddg'), 'coast bought a DDG');
    let arrived = [];
    await run(sim, 20 * 100, s => { for (const e of s.drainEvents()) if (e.type === 'reinforce') arrived.push([e.type, s.units.get(e.unit), s.t]); });
    ok(arrived.length === 2, `arrivals ${arrived.length}`);
    const f = arrived.find(a => a[1].type === 'fighter')[1], t = arrived.find(a => a[1].type === 'tel');
    ok(f.aboard === cv.id, 'fighter not aboard the carrier');
    ok(Math.abs(t[2] - UNITS.tel.buildTime) < 1.1, `TEL arrived at ${t[2]}`);
    ok(m.h(t[1].pos[0], t[1].pos[2]) > 0, 'TEL spawned in water');
    return `fighter on deck at ${fmt(arrived.find(a => a[1].type === 'fighter')[2])} s, TEL at spawn at ${fmt(t[2])} s`;
  });

  await test('amphibious: an LCAC carries ACVs from the LHD\'s well onto a beach, an ACV takes an objective, the LCAC docks again', async () => {
    const m = beachMap(), sim = new Sim(m, { seed: 5, fog: true });
    const lhd = sim.spawn('lhd', 'fleet', -9000, 0, { hdg: Math.PI / 2 });
    const crafts = carried(sim, lhd, 'craft');
    ok(crafts.length === 3, `crafts in the well: ${crafts.length}`);
    const c = crafts[0], load = carried(sim, c, 'veh');
    ok(load.length === 2 && load.every(v => v.type === 'acv'), 'the LCAC is not loaded with 2 ACVs');
    ok(sim.visible('coast', c) === null && sim.visible('coast', load[0]) === null, 'something carried is visible');
    const obj = sim.objectives[0];
    sim.order([c.id], { kind: 'land', x: 1500, z: 0, then: { kind: 'move', x: obj.x, z: obj.z }, cycle: false });
    let clear = -1, ashore = -1, taken = -1, docked = -1, at = null, wet = 0;
    await run(sim, 20 * 60 * 40, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'well' && e.dir === 'clear' && e.unit === c.id && clear < 0) clear = s.t;
        if (e.type === 'unload' && ashore < 0) { ashore = s.t; at = c.pos.slice(); }
        if (e.type === 'objective' && e.owner === 'fleet' && taken < 0) taken = s.t;
        if (e.type === 'well' && e.dir === 'docked' && e.unit === c.id) docked = s.t;
      }
      for (const v of load) if (v.alive && !v.aboard && m.h(v.pos[0], v.pos[2]) < 0) wet++;
      return taken > 0 && docked > 0;
    });
    ok(clear > UNITS.lhd.well.open - 1, `the LCAC left the well at ${fmt(clear)} s (the gate takes ${UNITS.lhd.well.open} s)`);
    ok(ashore > clear, 'no ACV rolled ashore');
    ok(m.h(at[0], at[2]) > 0, 'the LCAC unloaded afloat');
    ok(!wet, 'an ACV drove into the water');
    ok(taken > ashore, `${obj.name} was not taken`);
    ok(load.every(v => v.alive && !v.aboard), 'the ACVs are not both ashore');
    ok(docked > ashore && c.aboard === lhd.id, 'the LCAC did not dock again');
    return `out of the well ${fmt(clear, 0)} s · first ACV ashore ${fmt(ashore, 0)} s · ${obj.name} taken ${fmt(taken, 0)} s · LCAC docked ${fmt(docked, 0)} s`;
  });

  await test('amphibious: ACVs holding the ground round the command post take it (none while a defender stands there)', async () => {
    const m = beachMap(), sim = new Sim(m, { seed: 6, fog: true, mode: 'combat', timeLimit: 0 });
    const hq = sim.spawn('hq', 'coast', 9000, 0, {});
    sim.spawn('carrier', 'fleet', -15000, 0, {});
    const k = sim.spawn('kornet', 'coast', 9400, 500, {});
    sim.spawn('acv', 'fleet', 8500, 300, {}); sim.spawn('acv', 'fleet', 8600, -400, {});
    const ev = [];
    const watch = s => { for (const e of s.drainEvents()) if (e.type === 'overrun') ev.push(e.state + '@' + Math.round(e.t)); return !!s.result; };
    await run(sim, 20 * 200, watch);
    ok(hq.alive && !sim.result, 'the post fell with a coast vehicle beside it');
    // the defender drives away: the post falls after OVERRUN_T s
    k.pos[0] = k.prev[0] = 20000;
    const t0 = sim.t;
    await run(sim, 20 * 200, watch);
    ok(sim.result && sim.result.winner === 'fleet' && sim.result.reason === 'hq', `result ${JSON.stringify(sim.result)}`);
    const took = sim.result.t - t0;
    ok(took > 115 && took < 145, `taken after ${fmt(took)} s`);
    return `held ${fmt(took, 0)} s → ${ev.join(' · ')} → fleet wins (hq)`;
  });

  await test('amphibious: a Kornet-EM on the beach engages an incoming LCAC with its launcher raised', async () => {
    const m = beachMap(), sim = new Sim(m, { seed: 7, fog: true });
    const k = sim.spawn('kornet', 'coast', 1800, 0, { hold: true });
    const c = sim.spawn('lcac', 'fleet', -7000, 300, { hdg: Math.PI / 2 });
    sim.order([c.id], { kind: 'move', x: 600, z: 300 });
    let fired = 0, hits = 0, liftAtFire = 1, firstAt = -1;
    await run(sim, 20 * 600, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'launch' && e.kind === 'kornet') { fired++; liftAtFire = Math.min(liftAtFire, k.lift); if (firstAt < 0) firstAt = Math.hypot(c.pos[0] - k.pos[0], c.pos[2] - k.pos[2]); }
        if (e.type === 'hit' && e.kind === 'kornet') hits++;
      }
      return !c.alive;
    });
    ok(fired > 0, 'the Kornet never fired');
    ok(liftAtFire >= 1, 'fired with the launcher down');
    ok(firstAt <= UNITS.kornet.weapons.kornet.range + 50, `first round at ${fmt(firstAt / 1000)} km`);
    ok(!c.alive, `the LCAC survived (${hits} hits of ${fired})`);
    return `first round at ${fmt(firstAt / 1000)} km · ${fired} fired, ${hits} hits · LCAC destroyed ${fmt(Math.hypot(c.pos[0] - k.pos[0], c.pos[2] - k.pos[2]) / 1000)} km out`;
  });

  await test('storm: lightning strikes and reveals', async () => {
    const m = map(), sim = new Sim(m, { seed: 31, fog: true, weather: { kind: 'storm', wind: [8, 3], sea: .8 } });
    for (let i = 0; i < 60; i++) sim.spawn('ddg', 'fleet', (i % 10 - 5) * 9000 - 20000, (Math.floor(i / 10) - 3) * 12000, {});
    let bolts = 0, reveals = 0;
    await run(sim, 20 * 240, s => { for (const e of s.drainEvents()) { if (e.type === 'lightning') bolts++; if (e.type === 'detect' && e.how === 'lightning') reveals++; } });
    ok(bolts >= 10, `only ${bolts} strikes in 4 min`);
    ok(sim.weather.squalls.length === 6, 'squalls');
    return `${bolts} strikes in 4 min, ${reveals} ships revealed by flashes, ${sim.weather.squalls.length} squalls`;
  });

  /* ---------------- hit physics (sim/bodies.js, weapons.js): nothing is rolled, paths meet bodies ---------------- */
  const calm = { kind: 'calm', wind: [0, 0], sea: .2 };
  // a DDG heading north with its defences emptied (the tests fire by hand), a far DDG for the missile to fly at, a TEL
  const range = seed => {
    const m = map(), { shoreX } = coastPoints(m), sim = new Sim(m, { seed, fog: false, weather: calm });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 30000, 0, { hdg: 0 });
    const far = sim.spawn('ddg', 'fleet', shoreX - 30000, 70000, { hdg: 0 });
    const tel = sim.spawn('tel', 'coast', shoreX + 5000, 0, { deployed: true });
    for (const u of [ddg, far]) { u.ammo.sm6 = 0; u.ammo.ciws = 0; u.ammo.gun5 = 0; }
    return { sim, ddg, far, tel };
  };
  // an Oniks flying level and straight at h m from (x, z) on heading hdg, at the far DDG put 70 km ahead of it
  const flying = (R, x, z, hdg, h) => {
    R.tel.ammo.oniks = 2;
    const fx = x + Math.sin(hdg) * 70000, fz = z + Math.cos(hdg) * 70000;
    R.far.pos[0] = R.far.prev[0] = fx; R.far.pos[2] = R.far.prev[2] = fz;
    R.sim.run(6);                                                // the picture takes the far ship where it now is
    const p = launch(R.sim, R.tel, R.tel.def.weapons.oniks, R.far.id, 'unit', R.far.pos);
    p.pos[0] = p.prev[0] = x; p.pos[1] = p.prev[1] = h; p.pos[2] = p.prev[2] = z;
    p.hdg = hdg; p.pitch = 0; p.age = 20; p.spd = p.P.speed; p.phase = 'cruise'; p.sep = true; p.st.booster = false;
    p.fromPos = [x - Math.sin(hdg) * 20000, 0, z - Math.cos(hdg) * 20000];
    p.aim[0] = x + Math.sin(hdg) * 60000; p.aim[1] = h; p.aim[2] = z + Math.cos(hdg) * 60000;
    p.vel[0] = Math.sin(hdg) * p.spd; p.vel[1] = 0; p.vel[2] = Math.cos(hdg) * p.spd;
    return p;
  };
  // the struck point lies on the missile's skin at some instant of the tick (axis at the tick's end: level flight)
  const onSkin = (e, q) => {
    const f = [Math.sin(q.hdg) * Math.cos(q.pitch), Math.sin(q.pitch), Math.cos(q.hdg) * Math.cos(q.pitch)], h = q.P.body[0] / 2, r = q.P.body[1] / 2;
    let best = 1e9;
    for (let k = 0; k <= 400; k++) {
      const s = k / 400, d = [0, 1, 2].map(i => e.pos[i] - (q.prev[i] + (q.pos[i] - q.prev[i]) * s));
      const t = Math.max(-h, Math.min(h, d[0] * f[0] + d[1] * f[1] + d[2] * f[2]));
      best = Math.min(best, Math.hypot(d[0] - f[0] * t, d[1] - f[1] * t, d[2] - f[2] * t));
    }
    return best <= r + .06;
  };

  await test('hit physics: a strike lands on the part whose box it enters', () => {
    const sim = new Sim(map(), { seed: 1 });
    const d = sim.spawn('ddg', 'fleet', 0, 0, { hdg: 0 }), c = sim.spawn('carrier', 'fleet', 3000, 0, { hdg: 0 });
    const shot = (u, a, b, pen) => segUnit(u, a[0], a[1], a[2], b[0], b[1], b[2], .2, pen) >= 0 ? HIT.part : null;   // offsets from the unit
    const cases = [
      [d, [300, 14, 20], [-300, 14, 20], 'super', 'a beam shot at bridge height'],
      [d, [300, 3, 62], [-300, 3, 62], 'hull', 'a beam shot at the bow above the waterline'],
      [d, [0, 200, 51], [0, -5, 51], 'gun', 'a dive onto the 5" mount'],
      [d, [0, 12.5, 400], [0, 12.5, -400], 'ciwsF', 'a bow-on shot at Phalanx height'],
      [d, [300, 60, 20], [-300, 60, 20], null, 'a beam shot over the mast'],
      [c, [-400, 30, -30], [400, 30, -30], 'island', 'a beam shot at the carrier island'],
    ];
    for (const [u, a, b, want, what] of cases) { const got = shot(u, a, b, 1.5); ok(got === want, `${what}: ${got} (want ${want})`); }
    const B = bodyOf(d.def);
    return `DDG body: ${B.n} part boxes, aim point [${B.aim.map(v => fmt(v)).join(', ')}], radius ${fmt(B.R)} m · ` + cases.map(c => `${c[4]} → ${c[3] || 'clear'}`).join(' · ');
  });

  await test('hit physics: a Phalanx burst strikes a crossing missile only where its rounds cross the body', async () => {
    const W = UNITS.ddg.weapons.ciws, keep = [W.disp, W.burst];
    // 1. a one-tick burst with no dispersion: every round flies the one line to where the missile will be. Struck; the
    //    same missile 30 m further back on its path (it reaches the rounds' line 40 ms late) is not
    const once = (shift) => {
      const R = range(41), q = flying(R, R.ddg.pos[0] - 1200, R.ddg.pos[2] - 1700, 0, 15);
      R.sim.step();
      const B = fireGun(R.sim, R.ddg, 'ciws', q);
      R.sim.step();                                              // the rounds leave, aimed where the missile will be
      if (shift) for (const a of [q.pos, q.prev]) { a[0] -= Math.sin(q.hdg) * shift; a[2] -= Math.cos(q.hdg) * shift; }
      const ev = [];
      for (let i = 0; i < 120 && B.live + (B.n - B.fired) > 0; i++) { R.sim.step(); for (const e of R.sim.drainEvents()) if (['gunhit', 'spinout', 'intercept'].includes(e.type)) { ev.push(e); if (e.type === 'gunhit') e.onSkin = onSkin(e, q); } }
      return { B, ev };
    };
    let a, b;
    try { W.disp = 0; W.burst = DT; a = once(0); b = once(30); } finally { W.disp = keep[0]; W.burst = keep[1]; }
    const ha = a.ev.filter(e => e.type === 'gunhit');
    ok(a.B.hits >= 1 && ha.length >= 1, `no round struck the missile on the rounds' line (${a.B.hits})`);
    ok(ha.every(e => e.onSkin), 'a struck point is off the missile\'s skin');
    ok(a.ev.some(e => e.type === 'spinout' || e.type === 'intercept'), 'the struck missile neither tumbled nor broke up');
    ok(b.B.hits === 0 && !b.ev.length, `${b.B.hits} rounds struck a missile that crossed their line 40 ms late`);
    // 2. real bursts (dispersion on) at a crossing missile: every strike is on its skin
    const R = range(42), q = flying(R, R.ddg.pos[0] - 1000, R.ddg.pos[2] - 1900, 0, 15);
    R.sim.step();
    let hits = 0, off = 0, rounds = 0, out = null;
    for (let i = 0; i < 60 && q.alive; i++) {
      if (i % 20 === 0) { const B = fireGun(R.sim, R.ddg, 'ciws', q); rounds += B.n; }
      R.sim.step();
      for (const e of R.sim.drainEvents()) {
        if (e.type === 'gunhit') { hits++; if (!onSkin(e, q)) off++; }
        if ((e.type === 'spinout' || e.type === 'intercept') && !out) out = `${e.type} (${e.part})`;
      }
    }
    ok(off === 0, `${off} of ${hits} strikes off the missile's skin`);
    return `one line, no dispersion: ${a.B.hits} of ${a.B.n} rounds struck (${a.ev.filter(e => e.type !== 'gunhit').map(e => e.type + ':' + e.part).join(', ')}); 40 ms late: ${b.B.hits} · with dispersion: ${hits} strike ticks from ${rounds} rounds, all on the skin, ${out || 'untouched'}`;
  });

  await test('hit physics: an interceptor that cannot turn tightly enough misses; one that can, strikes', async () => {
    const P = PROJ.sm6, keep = [P.sig0, P.sigR, P.turn, P.pitchRate, P.gMax];
    const once = () => {
      const R = range(43), q = flying(R, R.ddg.pos[0] - 7000, R.ddg.pos[2] - 9000, 0, 15);
      R.sim.step();
      R.ddg.ammo.sm6 = 1;
      const s = launch(R.sim, R.ddg, R.ddg.def.weapons.sm6, q.id, 'proj', q.pos);
      R.ddg.ammo.sm6 = 0;
      let minD = 1e9, end = null;
      for (let i = 0; i < 20 * 150 && s.alive; i++) {
        R.sim.step();
        if (q.alive) minD = Math.min(minD, Math.hypot(s.pos[0] - q.pos[0], s.pos[1] - q.pos[1], s.pos[2] - q.pos[2]));
        for (const e of R.sim.drainEvents()) {
          if ((e.type === 'intercept' || e.type === 'spinout') && e.by === s.id) end = e.type;
          if (e.type === 'splash' && e.proj === s.id && !end) end = 'splash:' + e.why;
        }
      }
      return { end: end || (s.alive ? 'flying' : '?'), minD };
    };
    let a, b;
    try {
      P.sig0 = 0; P.sigR = 0;                                    // no track error: only the turn decides
      a = once();
      P.turn = .05; P.pitchRate = .05; P.gMax = 40;              // a sluggish interceptor
      b = once();
    } finally { [P.sig0, P.sigR, P.turn, P.pitchRate, P.gMax] = keep; }
    // threshold from what the model produces: on this crossing shot (a Mach 2.2 target 7 km abeam, 2 s vertical rise)
    // the agile SM-6 passes ~540 m from it (sampled per tick), the sluggish one ~8.8 km
    ok(a.end === 'intercept' || a.end === 'spinout' || a.minD <= 700, `the agile SM-6 neither struck nor closed on its crossing target (${a.end}, closest ${fmt(a.minD)} m)`);
    ok(!(b.end === 'intercept' || b.end === 'spinout') && b.minD > P.burst && b.minD > 5 * a.minD, `the sluggish SM-6 struck or came as close (${b.end}, closest ${fmt(b.minD)} m)`);
    return `agile: ${a.end} (closest centre-to-centre ${fmt(a.minD)} m) · turn .05 rad/s, 4 g: ${b.end}, closest ${fmt(b.minD)} m`;
  });

  await test('hit physics: a missile knocked out of control tumbles down into the sea', async () => {
    const R = range(44), q = flying(R, R.ddg.pos[0] - 25000, R.ddg.pos[2] - 20000, 0, 300);
    R.sim.step(); R.sim.drainEvents();
    // a blow upward at the tail
    spinout(R.sim, q, { pos: [q.pos[0], q.pos[1], q.pos[2] - 4], imp: [0, 1, 0], rel: [0, 300, 0], by: 0, byKind: 'test', unit: 0, part: 'fins', cause: 'test' });
    ok(!q.ctrl && q.w, 'not out of control');
    let spin = null, down = null, hit = 0, turned = 0;
    const z0 = q.pos[2], f0 = q.fw.slice();
    for (let i = 0; i < 20 * 60 && q.alive; i++) {
      for (const e of R.sim.drainEvents()) {
        if (e.type === 'spinout' && e.proj === q.id) spin = e;
        if (e.type === 'splash' && e.proj === q.id) down = e;
        if (e.type === 'hit') hit++;
      }
      R.sim.step();
      if (q.fw) turned = Math.max(turned, Math.acos(Math.max(-1, Math.min(1, q.fw[0] * f0[0] + q.fw[1] * f0[1] + q.fw[2] * f0[2]))));
    }
    for (const e of R.sim.drainEvents()) { if (e.type === 'splash' && e.proj === q.id) down = e; if (e.type === 'hit') hit++; }
    ok(spin && spin.w && spin.vel && spin.model === 'oniks' && spin.part === 'fins' && Number.isFinite(spin.seed), 'spinout event incomplete');
    ok(down && down.why === 'spinout' && down.water && !down.air, `it did not come down in the sea (${down && down.why})`);
    ok(!hit, 'it struck something');
    ok(turned > .8, `it did not tumble (its axis turned ${fmt(turned, 2)} rad at most)`);   // the model: ~0.93 rad (53°) before it hits the sea
    return `spinout w [${spin.w.map(v => fmt(v, 1)).join(', ')}] rad/s → in the sea ${fmt(down.t - spin.t, 2)} s later, ${fmt(down.pos[2] - z0, 0)} m on, at ${fmt(Math.hypot(...down.vel), 0)} m/s; its axis turned up to ${fmt(turned * 180 / Math.PI, 0)}°`;
  });

  await test('hit physics: an engagement replays exactly (determinism)', async () => {
    const play = async () => {
      const R = range(45), sim = R.sim;
      R.ddg.ammo.sm6 = 32; R.ddg.ammo.ciws = 40;
      sim.run(10);                                               // fog off: the picture fills on the first sensor tick
      sim.order([R.tel.id], { kind: 'attack', target: R.ddg.id, n: 2 });
      R.ddg.hp = R.ddg.hpMax = 1e5;
      let sig = 0, n = 0;
      await run(sim, 20 * 200, s => { for (const e of s.drainEvents()) if (['gunhit', 'spinout', 'intercept', 'hit', 'splash'].includes(e.type)) { n++; sig = (Math.imul(sig, 31) + Math.round(e.t * 20) + (e.pos ? Math.round(e.pos[0] * 10) : 0)) | 0; } });
      return { h: sim.hash(), sig, n };
    };
    const a = await play(), b = await play();
    ok(a.n > 0, 'nothing happened');
    ok(a.h === b.h && a.sig === b.sig, `replay differs: ${a.h}/${a.sig} vs ${b.h}/${b.sig}`);
    return `${a.n} outcome events, state hash ${a.h} both times`;
  });

  // motion physics: ships, vehicles, aircraft, separation, sinking, the swell (tests_physics.js)
  await physicsTests({ test, run, ok, fmt, map });

  const battleLevels = Q.get('long') ? ['easy', 'normal', 'hard'] : ['normal'];
  for (const lvl of battleLevels) await battleTest(lvl, map(), 'stub');
  if (Q.get('map')) {
    try {
      const { loadMap } = await import('../world/maps.js');
      const mm = await loadMap(Q.get('map'));
      await battleTest('normal', mm, mm.id);
    } catch (e) { await test(`battle on map ${Q.get('map')}`, () => { throw e; }); }
  }

  const pass = results.filter(Boolean).length;
  document.getElementById('sum').textContent = `${pass}/${results.length} passed`;
  document.title = `TESTS ${pass}/${results.length}`;
  window.__done = { pass, total: results.length };
}

async function battleTest(level, m, mapName) {
  await test(`AI vs AI battle ends (${level}, ${mapName} map)`, async () => {
    const sim = battle(1337, level, m);
    const t0 = performance.now();
    const limit = 20 * 3600 * 2.5;
    const tally = {};
    let firstLaunch = null, firstCls = null;
    await run(sim, limit, s => {
      for (const e of s.drainEvents()) {
        const k = e.type === 'launch' ? 'launch:' + e.kind : e.type;
        tally[k] = (tally[k] || 0) + 1;
        if (e.type === 'launch' && firstLaunch === null && (e.kind === 'oniks' || e.kind === 'tlam')) firstLaunch = s.t;
        if (e.type === 'classify' && firstCls === null) firstCls = s.t;
      }
      return !!s.result;
    });
    const ms = performance.now() - t0;
    const speed = sim.t / (ms / 1000);
    ok(sim.result, `no result after ${fmt(sim.t / 60, 0)} min`);
    ok(sim.t <= 3600 * 2 + 1, `took ${fmt(sim.t / 60, 0)} min of sim time`);
    ok(speed >= 32, `sim ran at x${fmt(speed, 0)} only`);
    const s = sim.summary();
    const L = [];
    for (const side of ['coast', 'fleet']) L.push(`${side}: ${s.sides[side].units} left, lost ${s.sides[side].lost}, fired ${s.sides[side].fired}`);
    const shots = ['oniks', 'tlam', 'slam', 'sm6', 'sam', 'pdms', 'hellfire', 'aam', 'shell'].map(k => tally['launch:' + k] ? `${k} ${tally['launch:' + k]}` : '').filter(Boolean).join(', ');
    console.log('battle', level, mapName, sim.result, tally, sim.ai.coast.log, sim.ai.fleet.log);
    window.__battle = window.__battle || {}; window.__battle[level + ':' + mapName] = { result: sim.result, tally, summary: s, coastLog: sim.ai.coast.log, fleetLog: sim.ai.fleet.log };
    return `${sim.result.winner} wins (${sim.result.reason}) at ${fmt(sim.t / 60, 1)} min · first classify ${fmt(firstCls)} s, first strike ${fmt(firstLaunch)} s · ${shots} · intercepts ${tally.intercept || 0}, hits ${tally.hit || 0}, destroyed ${tally.destroyed || 0}, scans ${(tally.scan || 0) / 2} · ${L.join(' · ')} · ran at x${fmt(speed, 0)}`;
  });
}

main();
