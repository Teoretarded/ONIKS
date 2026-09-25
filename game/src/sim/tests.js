/* In-browser tests for the sim (game/tests.html). Writes PASS / FAIL lines and sets document.title = 'TESTS n/m'.
   URL params: ?only=<substring> runs matching tests, ?map=<id> runs the battle tests on a maps.js map too,
   ?long=1 runs the full AI battle on every difficulty. */
import { Sim, DT } from './sim.js';
import { UNITS, TEL_ELEV, CLASSIFY } from '../data/units.js';
import { stubMap } from './stubmap.js';
import { setupBattle } from './setup.js';
import { horizon, los, getContact } from './sensors.js';

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

  await test('storm: lightning strikes and reveals', async () => {
    const m = map(), sim = new Sim(m, { seed: 31, fog: true, weather: { kind: 'storm', wind: [8, 3], sea: .8 } });
    for (let i = 0; i < 60; i++) sim.spawn('ddg', 'fleet', (i % 10 - 5) * 9000 - 20000, (Math.floor(i / 10) - 3) * 12000, {});
    let bolts = 0, reveals = 0;
    await run(sim, 20 * 240, s => { for (const e of s.drainEvents()) { if (e.type === 'lightning') bolts++; if (e.type === 'detect' && e.how === 'lightning') reveals++; } });
    ok(bolts >= 10, `only ${bolts} strikes in 4 min`);
    ok(sim.weather.squalls.length === 6, 'squalls');
    return `${bolts} strikes in 4 min, ${reveals} ships revealed by flashes, ${sim.weather.squalls.length} squalls`;
  });


  /* ---------------- the third wave (cg, lcs, s400, s400r, bereg) ---------------- */
  await test('S-400: the launcher fires only erected and cued by a radiating 92N6E', async () => {
    const m = map(), { shoreX } = coastPoints(m);
    const setup = (radarOn, erect) => {
      const sim = new Sim(m, { seed: 21, fog: true, weather: { kind: 'calm', wind: [0, 0], sea: .2 } });
      const r = sim.spawn('s400r', 'coast', shoreX + 6000, 0, { deployed: true, hdg: -Math.PI / 2 });
      if (!radarOn) sim.setRadar(r, false, true);
      const l = sim.spawn('s400', 'coast', shoreX + 7000, 1500, { deployed: erect, hdg: -Math.PI / 2 });
      const f = sim.spawn('fighter', 'fleet', shoreX - 30000, 0, { alt: 6000, hdg: Math.PI / 2 });
      return { sim, r, l, f };
    };
    const go = async (S, secs) => { let first = null, pos = null; await run(S.sim, 20 * secs, s => { for (const e of s.drainEvents()) if (e.type === 'launch' && e.kind === 'sam48' && first === null) { first = s.t; pos = e.pos; } return first !== null; }); return { first, pos }; };
    const A = setup(true, true), a = await go(A, 120);
    ok(a.first !== null, 'erected, cued launcher never fired at the fighter');
    const k = A.l.def.tubes[0], dx = a.pos[1] - (A.l.pos[1] + k[1]);
    ok(Math.abs(dx) < .6, `the round did not leave a container mouth (y off by ${fmt(dx, 2)} m)`);
    const B = setup(false, true), b = await go(B, 120);
    ok(b.first === null, 'fired with its 92N6E silent');
    const C = setup(true, false), c = await go(C, 120);
    ok(c.first === null, 'fired with its containers down');
    return `48N6 away at ${fmt(a.first)} s (the fighter 30+ km out, radar on, containers up); silent radar: no launch; stowed: no launch`;
  });

  await test('CG: SM-6 and ESSM leave its Mk 41 cells, the hatch opens', async () => {
    const m = map(), { shoreX } = coastPoints(m);
    const sim = new Sim(m, { seed: 23, fog: true, weather: { kind: 'calm', wind: [0, 0], sea: .2 } });
    const cg = sim.spawn('cg', 'fleet', shoreX - 30000, 0, { hdg: Math.PI / 2 });
    sim.spawn('drone', 'coast', shoreX - 20000, 0, { alt: 600, hdg: -Math.PI / 2 });
    let L = null, opened = 0;
    await run(sim, 20 * 90, s => {
      for (const e of s.drainEvents()) if (e.type === 'launch' && e.from === cg.id && (e.kind === 'sm6' || e.kind === 'pdms') && !L) L = e;
      opened = Math.max(opened, cg.vlsOpen.length);
      return !!L && opened > 0;
    });
    ok(L, 'the cruiser never engaged the drone');
    let best = 1e9;
    const c = Math.cos(cg.hdg), sn = Math.sin(cg.hdg);
    for (const q of cg.def.vlsAt) { const wx = cg.pos[0] + c * q[0] + sn * q[2], wz = cg.pos[2] - sn * q[0] + c * q[2]; best = Math.min(best, Math.hypot(wx - L.pos[0], wz - L.pos[2])); }
    ok(best < 1.5, `launch point ${fmt(best, 2)} m from the nearest cell`);
    ok(opened > 0, 'no VLS hatch opened');
    return `${L.kind} at ${fmt(L.t !== undefined ? L.t : sim.t)} s from a cell (${fmt(best, 2)} m), ${cg.def.vlsAt.length} cells`;
  });

  await test('Bereg: weapons free, 130 mm rounds at a ship in reach', async () => {
    const m = map(), { shoreX } = coastPoints(m);
    const sim = new Sim(m, { seed: 25, fog: true, weather: { kind: 'calm', wind: [0, 0], sea: .2 } });
    const g = sim.spawn('bereg', 'coast', shoreX + 700, 0, { hold: true, hdg: -Math.PI / 2 });
    const ddg = sim.spawn('ddg', 'fleet', shoreX - 12000, 0, { hdg: 0 });
    let first = null, n = 0, hits = 0;
    await run(sim, 20 * 180, s => {
      for (const e of s.drainEvents()) {
        if (e.type === 'launch' && e.kind === 'shell130') { first = first === null ? s.t : first; n++; }
        if (e.type === 'hit' && e.kind === 'shell130' && e.target === ddg.id) hits++;
      }
      return n >= 8;
    });
    ok(first !== null, 'the Bereg never fired');
    ok(g.aimB !== null, 'the turret never took an aim bearing');
    return `first round ${fmt(first)} s, ${n} rounds, ${hits} hits on the DDG 12 km out`;
  });

  await test('LCS: 44 kn scout', async () => {
    const m = map(), { shoreX } = coastPoints(m);
    const sim = new Sim(m, { seed: 27, fog: false });
    const u = sim.spawn('lcs', 'fleet', shoreX - 40000, -20000, { hdg: 0 });
    sim.order([u.id], { kind: 'move', x: shoreX - 40000, z: 30000 });
    let vmax = 0;
    await run(sim, 20 * 150, () => { vmax = Math.max(vmax, u.speed); });
    ok(vmax > 40 * 0.5144, `top speed ${fmt(vmax / 0.5144)} kn`);
    ok(u.def.air && u.def.air.types.includes('helo'), 'no helicopter deck');
    return `${fmt(vmax / 0.5144)} kn after 150 s`;
  });

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
