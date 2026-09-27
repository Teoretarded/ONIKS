/* Ship damage probe (console / tests): one charge on a ship of a class at a model-frame point, then the minutes after it.

     const P = await import('/game/src/sim/ship_probe.js');
     const r = P.strike({ type: 'ddg', kind: 'oniks', at: [9.5, 1.5, 0], from: 'stbd', secs: 300 });
     r.text                     // what happened, line by line: systems out and why, spaces breached / flooding / burning, the
                                // attitude and speed after
   from: 'stbd' | 'port' (a round coming in level from that side), 'above' (diving onto the deck), 'bow', 'stern', or a
   model-frame direction [x, y, z] the round travels along. kind: a PROJ key (its CHARGE, data/ship_systems.js). */
import { Sim } from './sim.js';
import { stubMap } from './stubmap.js';
import { applyDamage } from './damage.js';
import { toWorld } from './bodies.js';
import { shipSummary } from './ship.js';
import { PROJ } from '../data/units.js';

let MAP = null;
const DIRS = { stbd: [-1, -.02, 0], port: [1, -.02, 0], above: [0, -1, .1], bow: [0, -.05, -1], stern: [0, -.05, 1] };

export function strike(o) {
  const sim = new Sim(MAP || (MAP = stubMap()), { seed: o.seed || 3, fog: false });
  const u = sim.spawn(o.type || 'ddg', 'fleet', -50000, 0, { hdg: o.hdg || .7 });
  if (o.gq !== false) { u.lastFire = 0; sim.run(20 * 130); }           // general quarters: the doors shut
  sim.drainEvents();
  const hits = o.hits || [{ kind: o.kind, at: o.at, from: o.from }];
  let ms = 0;
  const log = [];
  for (const h of hits) {
    const d = Array.isArray(h.from) ? h.from : DIRS[h.from || 'stbd'], c = Math.cos(u.hdg), s = Math.sin(u.hdg), sp = 600;
    const v = [(d[0] * c + d[2] * s) * sp, d[1] * sp, (-d[0] * s + d[2] * c) * sp];
    const p = toWorld(u, h.at[0], h.at[1], h.at[2], [0, 0, 0]);
    const P = PROJ[h.kind] || { dmg: 10 };
    sim.emit('hit', { pos: p, target: u.id, kind: h.kind, side: 'coast', from: 0, part: 'hull', vel: v, under: !!h.under });
    const t0 = performance.now();
    applyDamage(sim, u, h.dmg !== undefined ? h.dmg : P.dmg, null, { part: 'hull', pos: p });
    ms += performance.now() - t0;
    take(sim, log, 0);
  }
  const at = [];
  const marks = o.marks || [10, 60, 300];
  let t = 0;
  for (const m of marks) {
    if (!u.alive && u.dying >= 1) break;
    sim.run(Math.round((m - t) * 20)); t = m;
    take(sim, log, t);
    at.push({ t, alive: u.alive, sum: u.ship ? shipSummary(u) : null, hp: u.hp, speed: u.def.speed * u.slowK / .5144 });
  }
  const text = [`${u.def.name} · ${hits.map(h => `${h.kind} at [${h.at}] from ${Array.isArray(h.from) ? h.from : h.from || 'stbd'}`).join(' + ')} · ${ms.toFixed(2)} ms`];
  for (const l of log) text.push(l);
  for (const a of at) {
    const S = a.sum;
    text.push(`t+${a.t}s ${a.alive ? '' : 'LOST '}hp ${a.hp.toFixed(0)} · ${S ? `water ${S.w.toFixed(0)} m3 · sink ${S.sink.toFixed(2)} m · list ${(S.list * 57.3).toFixed(1)}° · trim ${(S.trim * 57.3).toFixed(2)}° · GM ${S.gm.toFixed(2)} m · fires ${S.fires} · flooded ${S.flooded} · max ${a.speed.toFixed(1)} kn · steer ${S.steer} · out: ${S.out.join(' ')}` : ''}`);
  }
  return { sim, u, ms, log, at, text: text.join('\n') };
}

function take(sim, log, t) {
  for (const e of sim.drainEvents()) {
    if (e.type === 'system' && e.node) log.push(`t+${t} ${e.state === 'out' ? 'OUT' : 'back'} ${e.label}${e.why ? ' (' + e.why + ')' : ''}${e.caps && e.caps.length ? ' -> ' + e.caps.join(',') + (e.state === 'out' ? ' off' : ' on') : ''}`);
    else if (e.type === 'system') log.push(`t+${t} ${e.caps.join(',')} ${e.state === 'out' ? 'off' : 'on'}`);
    else if (e.type === 'compartment') log.push(`t+${t} ${e.state} · ${e.label}${e.A ? ' ' + e.A + ' m2' + (e.below ? ' below the waterline' : '') : ''}`);
    else if (e.type === 'foundered' || e.type === 'destroyed' || e.type === 'cookoff') log.push(`t+${t} ${e.type.toUpperCase()} ${e.why || e.label || ''}`);
  }
}
