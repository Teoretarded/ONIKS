/* Short, true labels for units: tag chips (id · label · value) in the films' style. */
import { CLASSIFY } from '../data/units.js';

export const SHORT = {
  hq: 'K380R CP', tel: 'K340P TEL', radar: 'MONOLITH-B', pantsir: 'PANTSIR-S1', catapult: 'ORLAN-10 RAIL', drone: 'ORLAN-10',
  transloader: 'K342P TLV', carrier: 'CVN NIMITZ', ddg: 'DDG ARLEIGH BURKE', helo: 'MH-60R', fighter: 'F/A-18E',
  bal: 'BAL 3K60', ssk: 'KILO 636.3', aew: 'E-2D', ssn: 'VIRGINIA SSN',
  lhd: 'LHD WASP', lcac: 'LCAC', acv: 'ACV-1.1', kornet: 'KORNET-EM',
  s400: 'S-400 5P85SM2-01', s400r: 'S-400 92N6E', bereg: 'A-222 BEREG', cg: 'CG TICONDEROGA', lcs: 'LCS INDEPENDENCE',
};
/* the class line a track shows once classified (the sensors' `cls` + the type's short name) */
export const TRACK = { hq: 'CP · K380R', tel: 'TEL · K340P', radar: 'RADAR · MONOLITH-B', pantsir: 'SAM · PANTSIR-S1', catapult: 'UAV-L · ORLAN-10',
  drone: 'UAV · ORLAN-10', transloader: 'TLV · K342P', carrier: 'CVN · NIMITZ', ddg: 'DDG · ARLEIGH BURKE', helo: 'HELO · MH-60R', fighter: 'FTR · F/A-18E',
  bal: 'TEL · BAL', ssk: 'SSK · KILO', aew: 'AEW · E-2D', ssn: 'SSN · VIRGINIA',
  lhd: 'LHD · WASP', lcac: 'LCAC', acv: 'ACV · ACV-1.1', kornet: 'ATGM · KORNET-EM',
  s400: 'SAM · S-400 5P85SM2-01', s400r: 'RADAR · 92N6E', bereg: 'GUN · A-222 BEREG', cg: 'CG · TICONDEROGA', lcs: 'LCS · INDEPENDENCE' };

const pad2 = n => String(n).padStart(2, '0');

/* a unit with weapons the player releases (strike missiles, Oniks, guns vs ships / land); defensive weapons (SAM,
   SM-6, ESSM, Phalanx, 30 mm, AIM-120) fire by themselves. The sim's `u.hold` flag is this unit's weapons free. */
export function offensive(u) {
  const W = u && u.def && u.def.weapons;
  if (W) for (const k in W) { const w = W[k]; if (!w.auto && (w.vs.includes('land') || w.vs.includes('sea'))) return true; }
  return false;
}

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
    case 'helo': return u.aboard ? 'DECK' : u.speed < 6 && u.def.sensors.sonar && !u.off.sonar ? `DIPPING · ${u.ammo.mk54} TORP` : `${u.ammo.hellfire} AGM`;
    case 'fighter': return u.aboard ? 'DECK' : `${u.ammo.slam} SLAM`;
    case 'aew': return u.aboard ? 'DECK' : u.radarOn && !u.off.radar ? 'RADIATING' : 'EMCON';
    case 'bal': {
      const s = u.elev >= .5 ? 'UP' : u.dep >= 1 && u.elevT > 0 ? 'RAISING' : u.dep > 0 && u.depT > 0 ? 'JACKS' : u.dep > 0 ? 'STOWING' : 'STOWED';
      return `${s} · ${u.ammo.uran} RD`;
    }
    case 'ssk': case 'ssn': {
      const d = !(u.depth > u.def.draught + 2.5) ? 'SURFACED' : u.depth > u.def.sub.pd + 4 ? `DEEP ${Math.round(u.depth / 10) * 10} M` : 'PERISCOPE';
      return u.type === 'ssn' ? `${d} · TLAM ${u.ammo.strike}` : `${d} · ${u.ammo.klub} KALIBR`;
    }
    case 'hq': return k ? k.toUpperCase() : 'CP';
    case 'lhd': return u.well > 0 ? (u.well >= 1 ? 'WELL OPEN' : u.wellT > 0 ? 'GATE LOWERING' : 'GATE RAISING') : 'WELL SHUT';
    case 'lcac': {
      const ph = o && o.kind === 'land' ? o.ph : null;
      const s = u.aboard ? 'IN THE WELL' : u.dockT ? (u.dockT.mode === 'out' ? 'LEAVING THE WELL' : 'ENTERING THE WELL') : ph === 'unload' ? 'UNLOADING' : k === 'dock' ? 'RETURNING' : ph === 'go' ? 'TO THE BEACH' : u.cushion > .5 ? 'ON CUSHION' : 'OFF CUSHION';
      return u.cargoN ? `${s} · ${u.cargoN} ACV` : s;
    }
    case 'kornet': return `${u.lift >= 1 ? 'UP' : u.lift > 0 ? 'RAISING' : 'STOWED'} · ${u.ammo.kornet} RD`;
    case 's400': {
      const s = u.elev >= 1.5 ? 'VERTICAL' : u.dep >= 1 && u.elevT > 0 ? 'RAISING' : u.dep > 0 && u.depT > 0 ? 'JACKS' : u.dep > 0 ? 'STOWING' : 'STOWED';
      return `${s} · ${u.ammo.sam48} 48N6`;
    }
    case 's400r': return u.mast < 1 ? (u.mastT > 0 ? 'RAISING' : u.mast > 0 ? 'FOLDING' : 'STOWED') : u.radarOn ? 'RADIATING' : 'EMCON';
    case 'bereg': return `${u.radarOn ? 'RDR' : 'EMCON'} · ${u.ammo.gun130} RD`;
    case 'cg': return `SM-6 ${u.ammo.sm6} · ESSM ${u.ammo.pdms} · TLAM ${u.ammo.strike}`;
    case 'lcs': return `57 MM ${u.ammo.gun57} · RAM ${u.ammo.searam}`;
    case 'acv': return k === 'embark' ? 'BOARDING' : k ? k.toUpperCase() : 'ASHORE';
  }
  return k ? k.toUpperCase() : '';
}

/* { id, label, value } for a unit as the player may name it */
export function unitTag(game, u) {
  if (u.side === game.side) {
    const hp = u.alive && u.hp < u.hpMax ? ` · ${Math.round(100 * u.hp / u.hpMax)}%` : '';
    return { id: pad2(u.id), label: SHORT[u.type] || u.def.name, value: status(u) + (u.hold && u.alive && offensive(u) ? ' · FREE' : '') + hp };
  }
  const c = game.sim.contact(game.side, u.id);
  if (c) {
    const cls = c.conf >= CLASSIFY ? (TRACK[u.type] || c.cls || '?') : '?';
    return { id: c.track, label: cls, value: c.conf.toFixed(2) };
  }
  return { id: 'TRK', label: TRACK[u.type] || u.def.name, value: '' };
}
