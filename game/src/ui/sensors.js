/* SENSORS: the picture the player fights with, in the films' Point Cloud language.
     radar     every own radar that radiates paints its sweep (the main one through the engine's sweep, all of
               them with a dotted lime leading edge and a curtain above it), a faint ring at each radar's reach
     contacts  uncertainty clouds of the unit's own model round the estimate (p5), pulled tighter by every
               return, a ping where a return lands, class bars; the snap onto the hull at classification; tags
               for every contact and track (TRK 21 · ? 0.44 / TRK 21 · DDG · ARLEIGH BURKE 0.89); ESM bearing fans
     scan      the lime LIGHTNING SCAN (strike, sphere front, tendrils, X-ray, part brackets with anatomy tags),
               the coral enemy strike with its warning, and the reticle while a scan is aimed (X)
     scope     radar view (V): the world dims, the sea becomes the clutter height field, rings, ticks, glyphs
     weather   the storm's cloud ceiling lit by lightning, rain squalls as clutter speckle
   Keys: V radar view. Everything else follows the sim's events and the orders system's targeting mode.
   Cost: its own dots go through R.fx (no per-frame allocation in the hot loops), the clutter field and the cloud
   ceiling are GPU point passes drawn right after the engine's frame (sensors/gpu.js). */
import { View, ringDots, lineDots, sat } from './sensors/core.js';
import { TagLayer } from './sensors/tags.js';
import { createContacts } from './sensors/contacts.js';
import { createRadar } from './sensors/radar.js';
import { createScan } from './sensors/scan.js';
import { createScope } from './sensors/scope.js';
import { createWeather } from './sensors/weather.js';
import { createGPU } from './sensors/gpu.js';

export async function createSensors(game) {
  const R = game.R;
  let AN = null;
  try { AN = await import('../data/anatomy.js'); } catch (e) { console.warn('sensors: anatomy.js unavailable (' + (e && e.message) + ')'); }

  /* shared state and drawing helpers */
  const OPT = { rgb: null, a: 1, step: 5, size: 1, mode: 'max', drape: null, lift: 0, max: 4000 };
  const S = {
    game, R, V: new View(), clock: 0, scopeK: 0, scopeRadar: null, mainRadar: null, inspecting: false,
    enemyList: [], contacts: null,
    dotOpt(rgb, a, step, size, mode, drape, lift) {
      OPT.rgb = rgb; OPT.a = a; OPT.step = step || 5; OPT.size = size || 1; OPT.mode = mode || 'max'; OPT.drape = drape || null; OPT.lift = lift || 0; OPT.max = 4000;
      return OPT;
    },
    ring(x, y, z, r, o) { return ringDots(R.fx, S.V, x, y, z, r, o); },
    arc(x, y, z, r, a0, a1, o) { return ringDots(R.fx, S.V, x, y, z, r, o, a0, a1); },
    line(ax, ay, az, bx, by, bz, o) { return lineDots(R.fx, S.V, ax, ay, az, bx, by, bz, o); },
    scanOwns: id => scan.owns.has(id),
  };
  const contacts = S.contacts = createContacts(S);
  const radar = createRadar(S);
  const scan = createScan(S, AN);
  const scope = createScope(S);
  const weather = createWeather(S);
  const gpu = createGPU(R);
  const TL = new TagLayer();
  const stats = { ms: 0, cpu: 0 };
  let tA = 0;

  game.bus.on('inspect', d => { S.inspecting = !!(d && d.on); });
  game.bus.on('side', () => { contacts.vis.clear(); });

  const sys = {
    name: 'sensors', priority: 15, always2d: true, stats,
    S, contacts, radar, scan, scope, weather, gpu,
    get scopeOn() { return scope.st.on; },
    toggleScope: () => scope.toggle(),
    update(dtReal) {
      const t0 = performance.now();
      const dt = game.paused ? 0 : dtReal;
      S.clock += dt;
      contacts.update(dt);
      scan.update();
      scope.update(dtReal);
      weather.update();
      tA = performance.now() - t0;
    },
    draw3d() {
      const t0 = performance.now();
      S.V.set(R.camera);
      radar.draw3d();
      contacts.draw3d();
      scan.draw3d();
      scan.reticle3d();
      scope.draw3d();
      weather.draw3d();
      tA += performance.now() - t0;
    },
    draw2d(ov) {
      const t0 = performance.now();
      // GPU passes over the finished frame: the scope's clutter field / the squalls' rain speckle, the ceiling
      if (gpu.ok) {
        const cp = scope.clutterParams(gpu, weather);
        const ce = weather.ceilingParams();
        let sp = null;
        if (!cp && S.mainRadar && S.mainRadar.surf && !S.inspecting) {
          const m = S.mainRadar, L = gpu.lattice(m.u.id, m.x, m.z, m.range, game.map);
          if (L) sp = { L, radar: [m.x, m.z], phase: m.ph, alpha: .85 * (1 - S.scopeK), scope: false, heightK: 1, wind: weather.windBrg(), rhor: scope.rhorOf(m.u, m.range), squalls: weather.squalls() };
        }
        if (cp || ce || sp) {
          gpu.begin();
          if (ce) gpu.drawCeiling(ce);
          if (cp) gpu.drawClutter(cp);
          if (sp) gpu.drawClutter(sp);
          gpu.end();
        }
      }
      if (!game.ui.hidden) {
        TL.begin();
        contacts.draw2d(ov, TL);
        scan.draw2d(ov, TL);
        scan.reticle2d(ov, TL);
        scope.draw2d(ov, TL);
        TL.flush(ov, R.camera.W, R.camera.H);
      }
      const ms = tA + performance.now() - t0;
      stats.ms = stats.ms * .92 + ms * .08;
    },
    onEvent(e) {
      contacts.onEvent(e);
      scan.onEvent(e);
      weather.onEvent(e);
    },
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
      if (e.code === 'KeyV') { scope.toggle(); return true; }
      return false;
    },
    dispose() { scan.clearFronts(); R.setSweep(null); },
  };
  return sys;
}
export default createSensors;
