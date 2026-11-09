/* Dev helper: run a headless AI-vs-AI battle and summarise it (used from the browser console / tests).
   const { probe } = await import('/game/src/sim/probe.js'); await probe({ min: 60, level: 'normal', seed: 1337 }) */
import { Sim } from './sim.js';
import { stubMap } from './stubmap.js';
import { setupBattle } from './setup.js';

let STUB = null;
export async function probe(opts = {}) {
  let m = opts.map;
  if (!m && opts.mapId) { const { loadMap } = await import('../world/maps.js'); m = await loadMap(opts.mapId); }
  if (!m) m = STUB || (STUB = stubMap());
  const sim = new Sim(m, { seed: opts.seed || 1337, aiSides: ['coast', 'fleet'], difficulty: opts.level || 'normal', mode: 'combat' });
  setupBattle(sim, opts.strength);
  globalThis.__sim = sim;
  const t0 = performance.now();
  const tally = {}, snaps = [], kills = [];
  const T = (opts.min || 60) * 60 * 20;
  for (let i = 0; i < T; i++) {
    sim.step();
    for (const e of sim.drainEvents()) {
      const k = e.type + (e.kind ? ':' + e.kind : '') + (e.what ? ':' + e.what : '') + (e.why ? ':' + e.why : '') + (e.byKind ? ':by-' + e.byKind : '');
      tally[k] = (tally[k] || 0) + 1;
      if (e.type === 'destroyed') kills.push(`${Math.round(sim.t)} ${e.side} ${e.type === 'destroyed' ? sim.units.get(e.unit)?.type : ''}`);
    }
    if (i % (20 * (opts.snap || 600)) === 0) {
      const s = sim.summary().sides;
      snaps.push(`${Math.round(sim.t)} C:${JSON.stringify(s.coast.by)} F:${JSON.stringify(s.fleet.by)} sup ${s.coast.supply}/${s.fleet.supply}`);
    }
    if (sim.result) break;
  }
  return {
    ms: Math.round(performance.now() - t0), t: Math.round(sim.t), result: sim.result, tally, snaps, kills,
    clog: sim.ai.coast.log.slice(-(opts.log || 20)), flog: sim.ai.fleet.log.slice(-(opts.log || 20)),
  };
}

/* the picture of one side, compact */
export function picture(sim, side) {
  return [...sim.sides[side].contacts.values()].map(c => `${c.track} ${sim.units.get(c.unitId)?.type || '?'} cls=${c.cls} conf=${c.conf.toFixed(2)} ${c.dom} age=${(sim.t - c.lastSeen).toFixed(0)} err=${Math.round(c.err)}${c.emitting ? ' EM' : ''}${c.identified ? ' ID' : ''}`);
}
export function units(sim, side) {
  return sim.alive(side).map(u => `${u.id} ${u.type} ${u.pos.map(Math.round).join(',')} ord=${u.orders.map(o => o.kind).join('>')} ammo=${JSON.stringify(u.ammo)}${u.aboard ? ' aboard' : ''} hp=${Math.round(u.hp)}`);
}
