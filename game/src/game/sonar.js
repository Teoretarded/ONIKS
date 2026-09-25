/* Sonar in the game view, and the boats' depth order.
   - Every own unit whose sonar is listening (destroyer hull sonar, the MH-60R's dipping sonar while it hovers, the
     boats') sends a lime ring pulse out over the water every few seconds (the dipping sonar from the point under the
     helicopter, its cable a dotted line down into the sea).
   - Where the player's side hears something (the sim's 'sonar' events), a white ring opens on the water round the
     estimated position, as wide as the fix is rough.
   - Torpedoes in the water that the player's side can see (its own, or heard) leave a faint dotted track on the
     surface above their run (they are not drawn themselves: they are under the water).
   - O: the selected boats go deep, or come up to periscope depth when they are deep; Shift+O surfaces them.
   Everything drawn is a pure function of the sim time and the events, so pausing and scrubbing hold still. */
import { PRI } from './game.js';
import { sonarWorks } from '../sim/sensors.js';
import { isSub, deep, depthName } from '../sim/subs.js';

const LIME = [198, 244, 50], WH = [238, 238, 228], CORAL = [255, 106, 61];
const PERIOD = 6.5, PULSE = 4.2, HEARD = 3.4;

export function createSonar(game) {
  const { sim, R } = game, fx = R.fx;
  const heard = [];                 // { x, z, r, t0 }: rings where the player's side heard a contact
  const tracks = new Map();         // torpedo id -> { pts: [[x, y, z]...], side, last }
  const c3 = [0, 0, 0];

  const boats = () => game.selected().filter(u => isSub(u) && u.alive);
  /* O: deep <-> periscope depth (deep boats come up); surface with Shift */
  function dive(surface) {
    const us = boats();
    if (!us.length) return false;
    const anyDeep = us.some(u => u.dive === 2);
    const depth = surface ? 0 : anyDeep ? 1 : 2;
    game.order(us.map(u => u.id), { kind: 'dive', depth });
    game.bus.emit('toast', { text: ['SURFACE', 'PERISCOPE DEPTH', 'DIVE · DEEP'][depth] });
    return true;
  }

  return {
    name: 'sonar', priority: PRI.sensors - 1,
    dive, boats,
    onEvent(e) {
      if (e.type === 'sonar' && e.side === game.side) {
        heard.push({ x: e.pos[0], z: e.pos[2], r: e.r || 600, t0: e.t });
        if (heard.length > 64) heard.shift();
      }
    },
    update() {
      const t = sim.t;
      for (let i = heard.length - 1; i >= 0; i--) if (t - heard[i].t0 > HEARD || heard[i].t0 > t + 1) heard.splice(i, 1);
      // torpedo tracks: a point a second along each run
      for (const p of sim.projectiles.values()) {
        if (!p.P.torpedo || !p.alive) continue;
        let tr = tracks.get(p.id);
        if (!tr) { tr = { pts: [], side: p.side, last: -1e9 }; tracks.set(p.id, tr); }
        if (t - tr.last >= 1 && p.pos[1] < 0) { tr.pts.push([p.pos[0], 0, p.pos[2]]); tr.last = t; if (tr.pts.length > 90) tr.pts.shift(); }
        tr.gone = 0;
      }
      for (const [id, tr] of tracks) { const p = sim.projectiles.get(id); if (!p || !p.alive) { tr.gone = tr.gone || t; if (t - tr.gone > 20 || t < tr.gone) tracks.delete(id); } }
    },
    draw3d() {
      const t = game.t;
      // listening sonars: a pulse over the water
      for (const u of sim.alive(game.side)) {
        const So = u.def.sensors && u.def.sensors.sonar;
        if (!So || !sonarWorks(u)) continue;
        const ph = ((t + u.id * 1.37) % PERIOD + PERIOD) % PERIOD;
        const p = game.unitPose(u);
        if (So.dip) {
          // the cable from the hovering helicopter into the sea
          fx.line([p.pos[0], p.pos[1] - 2, p.pos[2]], [p.pos[0], .4, p.pos[2]], { rgb: LIME, a: .45, step: 6, size: 1, mode: 'over' });
        }
        if (ph > PULSE) continue;
        const k = ph / PULSE, reach = (So.sub || So.ship || 8000) * .42;
        c3[0] = p.pos[0]; c3[1] = 0; c3[2] = p.pos[2];
        fx.ring(c3, reach * (.04 + .96 * Math.sqrt(k)), { rgb: LIME, a: .8 * (1 - k) * (1 - k), step: 6, size: 1.7, drape: true, lift: .6, mode: 'over' });
        if (k < .25) fx.ring(c3, 60 + reach * .06 * k, { rgb: LIME, a: .7 * (1 - k / .25), step: 4, size: 1.5, drape: true, lift: .6, mode: 'over' });
      }
      // heard: a white ring opening round the fix
      for (const h of heard) {
        const age = t - h.t0;
        if (age < 0 || age > HEARD) continue;
        const k = age / HEARD;
        c3[0] = h.x; c3[1] = 0; c3[2] = h.z;
        fx.ring(c3, h.r * (.55 + .9 * k), { rgb: WH, a: .75 * (1 - k), step: 5, size: 1.5, drape: true, lift: .8, mode: 'over' });
        if (k < .5) fx.ring(c3, h.r * .18, { rgb: WH, a: .6 * (1 - 2 * k), step: 4, size: 1.2, drape: true, lift: .8, mode: 'over' });
      }
      // torpedoes: their run as a dotted wake on the surface, fading behind
      for (const [id, tr] of tracks) {
        const p = sim.projectiles.get(id);
        const vis = tr.side === game.side || (p && sim.projVisible(game.side, p));
        if (!vis || tr.pts.length < 1) continue;
        const rgb = tr.side === game.side ? LIME : CORAL, fade = tr.gone ? Math.max(0, 1 - (sim.t - tr.gone) / 20) : 1;
        const pts = p && p.alive ? tr.pts.concat([[p.pos[0], 0, p.pos[2]]]) : tr.pts;
        fx.path(pts, { rgb, a: .5 * fade, step: 6, size: 1.2, drape: true, lift: .5, mode: 'over' });
        if (p && p.alive) { c3[0] = p.pos[0]; c3[1] = .6; c3[2] = p.pos[2]; fx.dot(c3, 2.4, rgb, .9 * fade, 'over'); }
      }
    },
    onKey(e) {
      if (e.type !== 'keydown' || e.code !== 'KeyO' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
      return dive(e.shiftKey);
    },
  };
}

export { depthName, deep };
