/* Scar lab (dev): stage a hit on a unit at a point of its model frame and frame it for a still.
     const L = await import('/game/src/dev/scar_lab.js');
     L.hit(ONIKS, id, [x, y, z], 'oniks', { from: [dx, dy, dz] })   // model frame: +Z bow, +Y up, +X starboard
     L.look(ONIKS, id, [x, y, z], { yaw, pitch, dist })               // yaw relative to the unit's heading (0: from ahead)
     L.spawn(ONIKS, 'ddg', x, z, hdg)
   The hit goes through the sim's own paths (sim.emit('hit') + applyDamage), so every system sees it as a real one. */
import { attitudeM } from '../game/debris/math.js';
import { applyDamage } from '../sim/damage.js';
import { partNear } from '../sim/bodies.js';

export function spawn(O, type, x, z, hdg = 0, side) {
  const def = O.game.UNITS[type];
  const u = O.sim.spawn(type, side || def.side, x, z, { hdg, deployed: true });
  O.game.dispatchEvents();
  return u.id;
}

/* world point of a model-frame point (the sim's frame: heading only) */
export function toWorld(u, x, y, z) {
  const c = Math.cos(u.hdg), s = Math.sin(u.hdg);
  return [u.pos[0] + x * c + z * s, u.pos[1] + y, u.pos[2] - x * s + z * c];
}

export function hit(O, id, loc, kind = 'oniks', o = {}) {
  const sim = O.sim, u = sim.units.get(id);
  if (!u) return null;
  const P = O.game.PROJ[kind] || { dmg: 20 };
  // (in the frame of the ship as drawn, heaving and rolling in the swell: a model-frame aim lands where it is aimed)
  const pose = O.game.unitPose ? O.game.unitPose(u) : null, M = pose ? attitudeM(pose.hdg, pose.pitch || 0, pose.roll || 0, new Array(9)) : null;
  const pos = M ? [0, 1, 2].map(k => pose.pos[k] + M[3 * k] * loc[0] + M[3 * k + 1] * loc[1] + M[3 * k + 2] * loc[2]) : toWorld(u, loc[0], loc[1], loc[2]);
  // the round comes in from o.from (model frame direction toward where it came from), default: square to the nearer side
  const f = o.from || [loc[0] >= 0 ? 1 : -1, .05, 0];
  const c = Math.cos(u.hdg), s = Math.sin(u.hdg), l = Math.hypot(f[0], f[1], f[2]) || 1, sp = o.speed || P.speed || 300;
  const vel = M ? [0, 1, 2].map(k => -(M[3 * k] * f[0] + M[3 * k + 1] * f[1] + M[3 * k + 2] * f[2]) / l * sp) : [-(f[0] * c + f[2] * s) / l * sp, -f[1] / l * sp, -(-f[0] * s + f[2] * c) / l * sp];
  const part = o.part || partNear(u.def, loc[0], loc[1], loc[2]) || u.def.partNames[0];
  const part2 = partNear(u.def, loc[0], loc[1], loc[2], part);
  sim.emit('hit', { pos, target: id, kind, side: u.side === 'coast' ? 'fleet' : 'coast', from: 0, part, vel });
  applyDamage(sim, u, o.dmg !== undefined ? o.dmg : P.dmg, null, { part, part2, pos });
  O.game.dispatchEvents();
  return { pos, part, hp: u.hp, alive: u.alive };
}

/* the camera on a model-frame point of the unit: yaw relative to her heading (0: looking at her from ahead, PI/2: from
   starboard), pitch (rad, down), dist (m) */
export function look(O, id, loc = [0, 0, 0], o = {}) {
  const u = O.sim.units.get(id);
  if (!u) return;
  const p = toWorld(u, loc[0], loc[1], loc[2]);
  // the camera looks along yaw: from starboard (+X) means looking toward -X
  const yaw = u.hdg + Math.PI + (o.yaw || 0);
  O.cam.set({ target: p, yaw, pitch: o.pitch !== undefined ? o.pitch : .25, dist: o.dist || 300 });
}

/* wait for the page, hide the UI */
export async function ready(O) {
  for (let i = 0; i < 80 && !(window.ONIKS && window.ONIKS.game); i++) await new Promise(r => setTimeout(r, 250));
  return window.ONIKS;
}
/* a hit and stills at the given seconds after it: shots [[sec, name, view?]] (view: { loc, yaw, pitch, dist }) */
export async function stage(O, id, loc, kind, shots, o = {}) {
  const u = O.sim.units.get(id);
  if (o.view) look(O, id, o.view.loc || loc, o.view);
  O.advance(.2, 6);
  const r = hit(O, id, loc, kind, o);
  let t = 0;
  for (const [sec, name, view] of shots) {
    if (sec > t) { const dt = sec - t; O.advance(dt, Math.max(2, Math.min(240, Math.ceil(dt * 20)))); t = sec; }
    if (view) look(O, id, view.loc || loc, view);
    await O.still(name, 0, 1);
  }
  const S = O.game.scars && O.game.scars.last(id);
  return Object.assign(r, { scar: S && [S.x, S.y, S.z, S.nx, S.ny, S.nz, S.r, S.W].map(v => +v.toFixed(2)), u: u && u.alive });
}

/* the bench scene: three DDGs in open water, each hit (bow side, waterline, foredeck), 20 s on; then GPU-synced ms at
   two framings (wide 600 m on the group, close 80 m on one hole). Run it with and without ?nosys=scars */
export async function bench(O, n = 120) {
  const ids = [spawn(O, 'ddg', -24000, 44000, 0), spawn(O, 'ddg', -24300, 44150, 0), spawn(O, 'ddg', -23700, 44250, 0)];
  O.advance(.3, 6);
  hit(O, ids[0], [-11, 5, 30], 'uran', { from: [-1, .05, 0] });
  hit(O, ids[1], [-10, .8, 10], 'oniks', { from: [-1, .05, 0] });
  hit(O, ids[2], [1.5, 9, 51], 'oniks', { from: [.6, .5, .6] });
  O.advance(20, 200);
  const hitMs = O.game.scars ? O.game.scars.stats.snapMs : 0;
  look(O, ids[0], [0, 10, 0], { yaw: -Math.PI / 2 + .6, pitch: .15, dist: 600 });
  O.advance(.2, 5);
  const wide = O.benchSync(n);
  look(O, ids[0], [-9, 5, 30], { yaw: -Math.PI / 2 + .35, pitch: .25, dist: 80 });
  O.advance(.2, 5);
  const close = O.benchSync(n);
  const fx = O.game.getSystem('fx').stats;
  return { wide: [wide.avg, wide.p95], close: [close.avg, close.p95], res: wide.res, fxDots: fx.dots, fxMs: fx.ms, hitMs };
}
