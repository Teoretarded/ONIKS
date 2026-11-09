/* Craters: a warhead going off on or just over the ground leaves a crater in it (engine/terrain.js addCrater: the
   land's dots and the ground the game stands units on carry it; the scorched ground round it). Render side only: the
   sim's terrain (movement, line of sight) is unchanged.

   On the sim's 'splash' on land (a round that came down there, not a burst in the air) and its 'hit' on a land unit
   or site close to the ground. Size from the charge (TNT kg: blast/phys.js tntOf, the warhead mass scars.js WH),
   coarse public figures for a surface burst in soil: radius ~ 1.0 W^1/3 m, depth ~ 0.42 R, a rim ~ 0.12 R high; a
   delayed fuze (a penetrating round going off under the surface) 1.15 x wider and 1.3 x deeper. Gun rounds under
   0.3 kg leave none.

   game.craters = { add(x, z, W, o), list (the terrain's), clear() } */
import { tntOf } from '../blast/phys.js';
import { WH, FUZE } from './scars.js';

export function createCraters(game) {
  const R = game.R, sim = game.sim, T = R && R.terrain;
  if (!T || !T.addCrater) return null;
  const land = (x, z) => game.map && game.map.h ? game.map.h(x, z) > .5 : T.heightAt(x, z) > .5;
  function add(x, z, W, o = {}) {
    if (!(W >= .3) || !land(x, z)) return null;
    const k = Math.cbrt(W), inn = o.fuze === 'in';
    const Rc = Math.min(18, k * (inn ? 1.15 : 1)), D = Rc * (inn ? .55 : .42), H = Rc * .12;
    return T.addCrater({ x, z, R: Rc, D, H, seed: (o.seed || Math.floor(x * 7 + z * 13)) >>> 0, scorch: Math.min(1, .5 + .1 * k) });
  }
  const chargeOf = kind => { const wh = WH[kind] !== undefined ? WH[kind] : ((game.PROJ && game.PROJ[kind] && game.PROJ[kind].dmg) || 10) * 2.5; return tntOf(kind, wh); };
  const sys = {
    name: 'craters', priority: 6,
    onEvent(e) {
      if (!e.pos) return;
      if (e.type === 'splash') {
        if (e.air || e.water) return;
        add(e.pos[0], e.pos[2], chargeOf(e.kind), { fuze: FUZE[e.kind], seed: e.proj });
      } else if (e.type === 'hit') {
        const u = e.target !== undefined ? sim.units.get(e.target) : null;
        if (!u || !u.def || u.def.domain !== 'land' || e.under) return;
        // (a charge on a vehicle or a site close to the ground opens the ground under it too)
        const W = chargeOf(e.kind), gy = T.heightAt(e.pos[0], e.pos[2]);
        if (W >= 2 && e.pos[1] - gy < 1.5 * Math.cbrt(W)) add(e.pos[0], e.pos[2], W * .6, { fuze: 'out', seed: e.proj });
      }
    },
  };
  game.craters = { add, list: T.craters, clear: () => T.clearCraters() };
  return sys;
}
