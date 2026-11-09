/* Environment tone stills in the real game (play.html). In the page console:
     const M = await import('/game/concepts/env_tone_shots.js'); await M.mapRun('fjord')
   A destroyer close, a coast unit on its ground, a wide view; each with the Classic and the Muted tone
   (Settings, Graphics, Environment tone) -> game/shots/game_<tone>_<map>_<view>.png. The setting is left as found. */
import { getSettings, setSetting } from '../src/data/settings.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
export async function ready() { while (!(window.ONIKS && ONIKS.sim && ONIKS.hudShot)) await wait(300); await wait(4000); }
export async function pair(name, u, dist, pitch, yawOff) {
  const cam = ONIKS.R.camera, p = u.pos, was = getSettings().envTone;
  if (cam.follow) cam.follow(null);
  cam.set({ target: [p[0], p[1], p[2]], dist, yaw: (u.hdg || 0) + (yawOff === undefined ? 2.2 : yawOff), pitch });
  await wait(600);
  const out = [];
  for (const t of ['classic', 'muted']) { setSetting('envTone', t); await wait(400); await ONIKS.hudShot(`game_${t}_${name}`); out.push(`game_${t}_${name}`); }
  setSetting('envTone', was);
  return out;
}
export async function mapRun(id) {
  await ready();
  const U = [...ONIKS.sim.units.values()];
  const ship = U.find(u => u.type === 'ddg') || U.find(u => u.side === 'fleet');
  const land = U.find(u => u.type === 'tel') || U.find(u => u.side === 'coast' && u.type !== 'hq');
  const out = [];
  out.push(...await pair(id + '_ddg', ship, 900, .2));
  out.push(...await pair(id + '_land', land, 1500, .3, .6));
  out.push(...await pair(id + '_wide', ship, 9000, .35, 2.8));
  return { out, time: ONIKS.R.terrain.time, kind: ONIKS.R.terrain.kind };
}
