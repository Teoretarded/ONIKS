/* Strike lab (dev): an aircraft ordered to attack a land target; how it flies the profile and where it releases.
     const S = await import('/game/src/dev/strike_lab.js'); S.run('fighter')     // or 'helo'; S.run('fighter', { sam: true })
   Returns the release conditions per round (heading error to the target, bank, pitch, height over the ground, speed,
   range, s since take-off), the round's heading change over its first seconds, the outcome, and a coarse track. */
import { Sim } from '../sim/sim.js';
import { stubMap } from '../sim/stubmap.js';

const calm = { kind: 'calm', wind: [0, 0], sea: .2 };
let MAP = null;
const shore = m => { for (let x = -m.W / 2; x < m.W / 2; x += 100) if (m.h(x, 0) > 0) return x; return 0; };
const deg = r => Math.round(r * 180 / Math.PI);

export function run(type = 'fighter', opt = {}) {
  const m = MAP || (MAP = stubMap()), sx = shore(m);
  const sim = new Sim(m, { seed: opt.seed || 5, fog: false, weather: calm });
  const air = type === 'fighter';
  // the carrier (or a DDG for the helo) heading away from the coast (north), the target inland
  const host = sim.spawn(air ? 'carrier' : 'ddg', 'fleet', sx - (air ? 60000 : 12000), opt.hz || 0, { hdg: opt.hostHdg !== undefined ? opt.hostHdg : 0 });
  const u = sim.spawn(type, 'fleet', host.pos[0], host.pos[2], { aboard: host.id });
  const tgt = sim.spawn('tel', 'coast', sx + 6000, opt.tz || 0, { deployed: true });
  tgt.hp = tgt.hpMax = 1e5;
  if (opt.sam) { const p = sim.spawn('pantsir', 'coast', sx + 3000, 9000, {}); for (const k in p.ammo) p.ammo[k] = 0; }
  for (const k in host.ammo) host.ammo[k] = 0;
  sim.run(10);
  sim.order([u.id], { kind: 'attack', target: tgt.id, n: 2 });
  const out = { rel: [], rounds: [], track: [], hits: 0, end: null };
  const watch = new Map();
  for (let i = 0; i < 20 * 900; i++) {
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.type === 'launch' && e.from === u.id) {
        const b = Math.atan2(tgt.pos[0] - u.pos[0], tgt.pos[2] - u.pos[2]), g = Math.max(0, m.h(u.pos[0], u.pos[2]));
        out.rel.push({ t: +(sim.t - u.born).toFixed(1), hdgErr: deg(b - u.hdg), bank: deg(u.roll), pitch: deg(u.pitch), agl: Math.round(u.pos[1] - g), v: Math.round(u.speed),
          km: +(Math.hypot(tgt.pos[0] - u.pos[0], tgt.pos[2] - u.pos[2]) / 1000).toFixed(1), rHdgErr: deg(e.hdg - u.hdg) });
        watch.set(e.proj, { h0: e.hdg, t0: sim.t });
      }
      if (e.type === 'hit' && e.target === tgt.id) out.hits++;
      if (e.type === 'splash' && watch.has(e.proj)) out.rounds.push({ why: e.why });
    }
    for (const [id, w] of watch) { const p = sim.projectiles.get(id); if (p && p.alive && sim.t - w.t0 < 4.01 && sim.t - w.t0 > 3.99) out.rounds.push({ turned4s: deg(p.hdg - w.h0), alt4s: Math.round(p.pos[1]) }); }
    if (i % 200 === 0 && !u.aboard) out.track.push([Math.round(sim.t), Math.round((u.pos[0] - tgt.pos[0]) / 100) / 10, Math.round((u.pos[2] - tgt.pos[2]) / 100) / 10, Math.round(u.pos[1]), Math.round(u.speed), u.orders[0] ? u.orders[0].kind + ':' + (u.orders[0]._air ? u.orders[0]._air.ph : '') : '-']);
    if (out.rel.length >= 2 && watch.size && [...watch.keys()].every(id => !sim.projectiles.get(id)) && i > 100) { out.end = 'rounds down'; break; }
  }
  out.after = { goal: u.goal && u.goal.map(v => Math.round(v)), strk: u.strk, alt: Math.round(u.pos[1]), order: u.orders[0] && u.orders[0].kind };
  return out;
}
