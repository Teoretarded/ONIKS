/* HUD naming and number formats: short, true labels in the films' style (designation · class · value). */
import { CLASSIFY } from '../../data/units.js';

export const LIME = '#C6F432', CORAL = '#FF6A3D';
export const TAU = Math.PI * 2;
export const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const pad2 = n => String(n).padStart(2, '0');

/* weapon (unit weapon key) and projectile (kind) short names, as the crews write them */
export const WNAME = { oniks: '3M55', sam: '57E6', gun30: '2A38M', pdms: 'ESSM', ciws: 'Phalanx', sm6: 'SM-6', strike: 'TLAM',
  gun5: 'Mk 45', hellfire: 'AGM-114', slam: 'SLAM-ER', aam: 'AIM-120D' };
export const PNAME = { oniks: '3M55', tlam: 'TLAM', slam: 'SLAM-ER', hellfire: 'AGM-114', sm6: 'SM-6', pdms: 'ESSM', sam: '57E6',
  aam: 'AIM-120D', shell: 'Mk 45', gun30: '2A38M', ciws: 'Phalanx', crash: 'crash' };

/* a unit as its own side calls it: class + number (TEL 03) */
export const unitRef = u => (u ? u.def.cls : '?') + ' ' + pad2(u ? u.id : 0);

/* an enemy as the player knows it: the track and, once classified, its class */
export function trackRef(game, u, withCls) {
  const c = game.sim.contact(game.side, u.id);
  if (c) return c.track + (withCls && c.conf >= CLASSIFY && c.cls ? ' · ' + c.cls : '');
  return game.sim.fog ? 'TRK' : u.def.cls + ' ' + pad2(u.id);
}

/* sim clock: mm:ss (minutes run past 59 so the log column stays narrow) */
export function clock(t) { t = Math.max(0, Math.floor(t)); return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); }
/* long clock for the readout: h:mm:ss after the first hour */
export function clockL(t) { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' : '') + pad2(m) + ':' + pad2(s); }
/* a duration: 1:30, 45 s */
export function dur(s) { s = Math.max(0, Math.ceil(s)); return s >= 60 ? Math.floor(s / 60) + ':' + pad2(s % 60) : s + ' s'; }

export const km = m => (m < 10000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)) + ' km';
export const brg = (dx, dz) => String(Math.round(((Math.atan2(dx, dz) * 180 / Math.PI) + 360) % 360) % 360).padStart(3, '0');

/* speed in the unit's own trade: ships and aircraft in knots, vehicles in km/h */
export function speedOf(u) {
  const v = u.speed || 0;
  if (u.def.domain === 'land') return Math.round(v * 3.6) + ' km/h';
  return Math.round(v * 1.944) + ' kn';
}

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* a dotted bar: n cells, filled to k (0..1); cls on the filled cells */
export function dots(k, n, cls) {
  n = n || 20; const f = Math.round(sat(k) * n);
  let s = n <= 8 ? '<span class="dbar big">' : '<span class="dbar">';
  for (let i = 0; i < n; i++) s += i < f ? `<i class="f${cls ? ' ' + cls : ''}"></i>` : '<i></i>';
  return s + '</span>';
}
