/* A minimap click while a targeting mode is armed (the orders system's L / U): the point on the map is the aim, as a
   click on the ground would be. The Orlan-10 (L, coast) launches toward it from the nearest rail that has one; the
   strike package or the MH-60R (L / U, fleet) flies its patrol / search there. Shift keeps the mode armed, as in the
   world. The scan (X) stays a world click (its reticle and reach show there). Through the orders system's own API
   (mode, setMode, pkg, marks) and game.order; nothing of the minimap's drawing.

   mapAim(game, x, z, shift) -> true when a mode took the click (the camera stays where it is) */
import { SHORT } from '../../game/labels.js';

const CAP_R = { fighter: 8000, helo: 3000 };      // as orders.js: the patrol radius of a launch to a point (m)
const pad2 = n => String(n).padStart(2, '0');
const pkgName = us => { const n = {}; for (const u of us) n[u.type] = (n[u.type] || 0) + 1; return Object.keys(n).map(t => `${SHORT[t] || t} ×${n[t]}`).join(' · '); };

export function mapAim(game, x, z, shift) {
  const O = game.getSystem && game.getSystem('orders');
  const m = O && O.mode;
  if (!m || !O.setMode) return false;
  const y = Math.max(0, game.map.h ? game.map.h(x, z) : 0), at = [x, y, z];
  const bad = () => { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui('invalid'); } catch (e) { /* */ } };
  if (m.kind === 'drone') {
    const cs = (m.units || []).filter(u => u.alive && u.drones > 0 && !(u.off && u.off.launch));
    if (!cs.length) { game.bus.emit('toast', { text: 'NO DRONE', bad: true }); bad(); O.setMode(null); return true; }
    cs.sort((a, b) => Math.hypot(a.pos[0] - x, a.pos[2] - z) - Math.hypot(b.pos[0] - x, b.pos[2] - z));
    const c = cs[0];
    game.order([c.id], { kind: 'launch_drone', x, z });
    if (O.marks) O.marks.push({ kind: 'move', at, ids: [c.id], t0: game.realT, dur: 2.4 });
    game.bus.emit('toast', { text: `ORLAN-10 · ${c.def.cls} ${pad2(c.id)} · PATROL` });
    if (!shift) O.setMode(null);
    return true;
  }
  if (m.kind === 'launch' || m.kind === 'helo') {
    const onDeck = u => u.alive && u.aboard;
    const pk = m.kind === 'launch' && (m.units || []).length && m.units.every(onDeck) ? { units: m.units } : O.pkg ? O.pkg(m.kind) : { units: [] };
    if (!pk.units.length) { game.bus.emit('toast', { text: pk.why || 'NOTHING ON DECK', bad: true }); bad(); O.setMode(null); return true; }
    const byR = {};
    for (const u of pk.units) { const r = CAP_R[u.type] || 1500; (byR[r] = byR[r] || []).push(u.id); }
    for (const r in byR) game.order(byR[r], { kind: 'patrol', x, z, r: +r });
    if (O.marks) O.marks.push({ kind: 'move', at, ids: pk.units.map(u => u.id), t0: game.realT, dur: 2.6 });
    game.bus.emit('toast', { text: `LAUNCH · ${pkgName(pk.units)} · ${m.kind === 'helo' ? 'SEARCH' : 'PATROL'}` });
    if (!shift) O.setMode(null);
    else if (O.pkg) { const nx = O.pkg(m.kind); if (nx.units.length) m.units = nx.units; else O.setMode(null); }
    return true;
  }
  return false;
}
