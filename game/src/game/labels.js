/* Short, true labels for units: tag chips (id · label · value) in the films' style. */
import { CLASSIFY } from '../data/units.js';

export const SHORT = {
  hq: 'K380R CP', tel: 'K340P TEL', radar: 'MONOLITH-B', pantsir: 'PANTSIR-S1', catapult: 'ORLAN-10 RAIL', drone: 'ORLAN-10',
  transloader: 'K342P TLV', carrier: 'CVN NIMITZ', ddg: 'DDG ARLEIGH BURKE', helo: 'MH-60R', fighter: 'F/A-18E',
};
/* the class line a track shows once classified (the sensors' `cls` + the type's short name) */
export const TRACK = { hq: 'CP · K380R', tel: 'TEL · K340P', radar: 'RADAR · MONOLITH-B', pantsir: 'SAM · PANTSIR-S1', catapult: 'UAV-L · ORLAN-10',
  drone: 'UAV · ORLAN-10', transloader: 'TLV · K342P', carrier: 'CVN · NIMITZ', ddg: 'DDG · ARLEIGH BURKE', helo: 'HELO · MH-60R', fighter: 'FTR · F/A-18E' };

const pad2 = n => String(n).padStart(2, '0');

export function status(u) {
  if (!u.alive) return u.def.domain === 'sea' ? 'SINKING' : 'DESTROYED';
  const o = u.orders && u.orders[0], k = o && o.kind;
  switch (u.type) {
    case 'tel': {
      const s = u.elev >= 1.5 ? 'ERECT' : u.dep >= 1 && u.elevT > 0 ? 'ERECTING' : u.dep > 0 && u.depT > 0 ? 'JACKS' : u.dep > 0 ? 'STOWING' : 'STOWED';
      return `${u.reloadU > 0 ? 'RELOAD' : s} · ${u.ammo.oniks} RD`;
    }
    case 'radar': return u.mast < 1 ? (u.mastT > 0 ? 'MAST UP' : u.mast > 0 ? 'MAST DOWN' : 'STOWED') : u.radarOn ? 'RADIATING' : 'EMCON';
    case 'pantsir': return `${u.radarOn ? 'RDR' : 'EMCON'} · ${u.ammo.sam} SAM`;
    case 'transloader': return u.reloadU > 0 ? 'RELOADING' : `${u.cargo} TLC`;
    case 'catapult': return `${u.drones} UAV`;
    case 'drone': return `ALT ${Math.round(u.pos[1] / 10) * 10} M`;
    case 'ddg': return `SM-6 ${u.ammo.sm6} · TLAM ${u.ammo.strike}`;
    case 'carrier': return 'CVN';
    case 'helo': return u.aboard ? 'DECK' : `${u.ammo.hellfire} AGM`;
    case 'fighter': return u.aboard ? 'DECK' : `${u.ammo.slam} SLAM`;
    case 'hq': return k ? k.toUpperCase() : 'CP';
  }
  return k ? k.toUpperCase() : '';
}

/* { id, label, value } for a unit as the player may name it */
export function unitTag(game, u) {
  if (u.side === game.side) {
    const hp = u.alive && u.hp < u.hpMax ? ` · ${Math.round(100 * u.hp / u.hpMax)}%` : '';
    return { id: pad2(u.id), label: SHORT[u.type] || u.def.name, value: status(u) + (u.hold && u.alive ? ' · HOLD' : '') + hp };
  }
  const c = game.sim.contact(game.side, u.id);
  if (c) {
    const cls = c.conf >= CLASSIFY ? (TRACK[u.type] || c.cls || '?') : '?';
    return { id: c.track, label: cls, value: c.conf.toFixed(2) };
  }
  return { id: 'TRK', label: TRACK[u.type] || u.def.name, value: '' };
}
