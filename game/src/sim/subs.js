/* Submarines: depth, masts, speed by depth, noise, and the domain a boat counts as (a surfaced boat is a ship,
   'sea'; a submerged one is 'sub': radar and cameras cannot see it, only sonar hears it, and only weapons that
   list 'sub' can reach it).

   u.depth  keel depth (m): surfaced = the draught, periscope depth (PD) = def.sub.pd, deep = def.sub.deep limited
            by the water under the keel (15 m clear of the bottom)
   u.dive   the ordered depth: 0 surface, 1 periscope depth, 2 deep
   u.mastUp 0..1 masts raised (they come up at PD and on the surface, go down when the boat goes deeper)
   The model's origin is the surfaced waterline, so the boat is drawn u.depth - draught metres lower (u.pos[1]). */
import { DT } from './consts.js';
import { clamp } from './util.js';

export const DIVE = ['surface', 'periscope', 'deep'];
export const isSub = u => !!(u && u.def && u.def.sub);
/* hull under water: invisible to radar and cameras (except masts at PD), heard by sonar */
export const submerged = u => isSub(u) && u.depth > u.def.draught + 2.5;
/* below periscope depth: nothing shows above the water */
export const deep = u => isSub(u) && u.depth > u.def.sub.pd + 4;
/* at periscope depth or shallower: masts up, missiles can leave */
export const atPD = u => isSub(u) && u.depth <= u.def.sub.pd + 1.5;
export const domOf = u => submerged(u) ? 'sub' : u.def.domain;
/* the depth state as the UI names it */
export const depthName = u => !isSub(u) ? '' : !submerged(u) ? 'SURFACED' : deep(u) ? 'DEEP' : 'PERISCOPE';
/* height of the mast tops over the waterline (sensor height of a boat; negative when deep) */
export const mastTop = u => u.pos[1] + u.def.top + (u.mastUp || 0) * 4.5;

export function depthGoal(sim, u) {
  const S = u.def.sub;
  if (u.dive === 0) return u.def.draught;
  if (u.dive === 1) return S.pd;
  const water = -sim.map.h(u.pos[0], u.pos[2]);
  return Math.max(S.pd + 8, Math.min(S.deep, water - 15));
}

/* per tick: depth toward the ordered one, masts, propeller */
export function subStep(sim, u) {
  const S = u.def.sub, goal = depthGoal(sim, u);
  if (u.depth === undefined) u.depth = goal;
  u.depth += clamp(goal - u.depth, -S.rate * DT, S.rate * DT);
  const up = u.depth <= S.pd + 1.5 && u.dive < 2;
  u.mastUp = clamp((u.mastUp || 0) + (up ? DT / 6 : -DT / 3), 0, 1);
  u.propA = ((u.propA || 0) + u.speed * DT * .9) % (Math.PI * 2);
}

/* top speed by depth: surfaced / periscope depth (snorkel, masts up) / deep */
export function subSpeed(u) {
  const S = u.def.sub;
  return S.speeds[!submerged(u) ? 0 : deep(u) ? 2 : 1];
}

/* how far a sonar hears a unit, as a factor on its range (1 = a surface warship): boats by their quietness, louder
   when fast; a diesel boat at periscope depth runs its diesels (snorting) */
export function noiseOf(u) {
  if (!isSub(u)) return 1 + Math.min(1, u.speed / 15) * .4;
  const S = u.def.sub, v = u.speed / Math.max(1, u.def.speed);
  let k = S.quiet * (.7 + 1.0 * v * v);
  if (!submerged(u)) k *= 2.4;
  else if (!deep(u) && S.snort) k *= S.snort;
  return k;
}
