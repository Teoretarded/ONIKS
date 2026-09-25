/* Starting forces for a battle at the map's spawns.
   setupBattle(sim, { coast: 1, fleet: 1, emplaced: true, forces })
     coast / fleet: strength multipliers (0.5 .. 2) for the default roster
     forces: { coast: [[type, n], ...], fleet: [[type, n], ...] } replaces the roster (campaign missions); exact counts
     emplaced: the battery starts on its sites (radar on high ground, TELs dispersed and erect, Pantsirs over the
               radar and the command post), chosen by the coast AI planner; false = everything at the spawn */
import { findSpot, deckFor } from './economy.js';
import { AI } from './ai.js';
import { UNITS } from '../data/units.js';

/* the fleet's LHD comes with its landing force aboard (3 LCAC, 8 ACV, and the fleet's 2 MH-60R on its flight deck:
   sim/amphib.js loadStart); the coast answers with two Kornet-EM beach-defence teams */
export const ROSTER = {
  coast: [['hq', 1], ['radar', 1], ['tel', 4], ['pantsir', 3], ['catapult', 1], ['transloader', 2], ['kornet', 2]],
  fleet: [['carrier', 1], ['ddg', 3], ['fighter', 4], ['lhd', 1]],
};

export function setupBattle(sim, opts) {
  opts = opts || {};
  const out = { coast: [], fleet: [] }, r = sim.rng.place, map = sim.map;
  for (const side of ['coast', 'fleet']) {
    const k = opts[side] !== undefined ? opts[side] : 1, sp = map.spawns[side];
    if (!k) continue;
    const roster = opts.forces && opts.forces[side] ? opts.forces[side] : ROSTER[side];
    // ships first, so aircraft find their decks
    const order = roster.slice().sort((a, b) => (UNITS[a[0]].domain === 'air') - (UNITS[b[0]].domain === 'air'));
    for (const [type, n0] of order) {
      const n = opts.forces ? n0 : type === 'hq' || type === 'carrier' ? 1 : Math.max(type === 'radar' || type === 'catapult' ? 1 : 0, Math.round(n0 * k));
      for (let i = 0; i < n; i++) {
        let u;
        if (type === 'fighter' || type === 'helo' || type === 'aew') {
          const deck = deckFor(sim, side, type);
          if (deck) u = sim.spawn(type, side, deck.pos[0], deck.pos[2], { aboard: deck.id });
          else { const p = findSpot(sim, 'air', sp.x, sp.z, sp.r, r); u = sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg }); }
        } else if (type === 'drone') {
          const cat = out[side].find(v => v.type === 'catapult');
          if (cat) { cat.drones++; continue; }
          const p = findSpot(sim, 'air', sp.x, sp.z, sp.r, r); u = sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
        } else if (type === 'hq') {
          const p = findSpot(sim, 'land', sp.x, sp.z, sp.r * .3, r);
          u = sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
        } else if (type === 'carrier') {
          // the carrier starts 15 km behind the spawn (away from the coast) and sails in behind its screen
          const cs = map.spawns.coast, L = Math.hypot(cs.x - sp.x, cs.z - sp.z) || 1;
          const bx = Math.max(-map.W / 2 + 3000, Math.min(map.W / 2 - 3000, sp.x - (cs.x - sp.x) / L * 15000));
          const bz = Math.max(-map.H / 2 + 3000, Math.min(map.H / 2 - 3000, sp.z - (cs.z - sp.z) / L * 15000));
          const p = findSpot(sim, 'sea', bx, bz, 2000, r);
          u = sim.spawn(type, side, p[0], p[1], { hdg: Math.atan2(cs.x - sp.x, cs.z - sp.z) });
        } else if (type === 'lhd') {
          // the LHD keeps 18 km behind the spawn and 10 km to one side of the carrier's track, out of the screen's way
          const cs = map.spawns.coast, L = Math.hypot(cs.x - sp.x, cs.z - sp.z) || 1, fx = (cs.x - sp.x) / L, fz = (cs.z - sp.z) / L;
          const ax = Math.max(-map.W / 2 + 3000, Math.min(map.W / 2 - 3000, sp.x - fx * 18000 + fz * 10000 * (i % 2 ? -1 : 1)));
          const az = Math.max(-map.H / 2 + 3000, Math.min(map.H / 2 - 3000, sp.z - fz * 18000 - fx * 10000 * (i % 2 ? -1 : 1)));
          const p = findSpot(sim, 'sea', ax, az, 2500, r);
          u = sim.spawn(type, side, p[0], p[1], { hdg: Math.atan2(fx, fz) });
        } else if (type === 'ddg') {
          // destroyers screen 12 km ahead of the carrier toward the coast, 6 km apart
          const cs = map.spawns.coast, L = Math.hypot(cs.x - sp.x, cs.z - sp.z) || 1, fx = (cs.x - sp.x) / L, fz = (cs.z - sp.z) / L;
          const lat = (i - (n - 1) / 2) * 6000, ax = sp.x + fx * 12000 + fz * lat, az = sp.z + fz * 12000 - fx * lat;
          const p = findSpot(sim, 'sea', ax, az, 1500, r);
          u = sim.spawn(type, side, p[0], p[1], { hdg: Math.atan2(fx, fz) });
        } else {
          const D = UNITS[type], dom = D.sub ? 'sub' : D.domain === 'sea' ? 'sea' : side === 'coast' ? 'land' : 'sea';
          const p = findSpot(sim, dom, sp.x, sp.z, side === 'coast' && dom === 'land' ? sp.r : sp.r * 1.2, r);
          u = sim.spawn(type, side, p[0], p[1], { hdg: sp.hdg });
        }
        out[side].push(u);
      }
    }
  }
  if (opts.emplaced !== false && out.coast.length) {
    const ai = sim.ai.coast || new AI(sim, 'coast', 'normal');
    ai.emplace();
  }
  return out;
}
