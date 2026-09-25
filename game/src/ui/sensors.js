/* SENSORS: the picture the player fights with, in the films' Point Cloud language.
     radar     every own radar that radiates paints its sweep (the main one through the engine's sweep, all of
               them with a dotted lime leading edge and a curtain above it), a faint ring at each radar's reach
     contacts  uncertainty clouds of the unit's own model round the estimate (p5), pulled tighter by every
               return, a ping where a return lands, class bars; the snap onto the hull at classification; tags
               for every contact and track (TRK 21 · ? 0.44 / TRK 21 · DDG · ARLEIGH BURKE 0.89); ESM bearing fans
     scan      the lime LIGHTNING SCAN, the game's signature verb: the strike, then chain lightning forking to every
               hull in the ring (each fork striking with its own flash; the whole area lit lime for a frame), and
               on each struck hull the payoff in the world view: tendrils, the X-ray flicker, 3D part boxes with
               placards decoding out of glyph noise, the track tag counting up to 0.97; the coral enemy strike with
               its forks and warning; the reticle while a scan is aimed (X)
     inset     the scan inset: a magnified picture-in-picture of each struck hull too small to read on screen (its
               cutaway X-rayed by a slice, part boxes, placards), in the right column between the HUD panels
     scope     radar view (V): the world dims, the sea becomes the clutter height field, rings, ticks, glyphs
     weather   the storm's cloud ceiling lit by lightning, rain squalls as clutter speckle; natural strikes fork in
               white to the units they reveal (both sides), which flash with a white bracket and tag
   Keys: V radar view. Everything else follows the sim's events and the orders system's targeting mode.
   Cost: its own dots go through R.fx (no per-frame allocation in the hot loops), the clutter field and the cloud
   ceiling are GPU point passes drawn right after the engine's frame (sensors/gpu.js).
   The Orbital render style (R.style 'orbital', read every frame: S.orb): the same layers in the Orbital films' language
   (sensors/orb.js): the rings, lines and arcs (S.ring / S.line / S.arc) are hairlines through R.wire, the beam a draped
   hairline edge with a fan of afterglow lines, a contact's cloud short hairline returns along the line of sight and a
   dashed 2-sigma ellipsoid, the scan's bolt, forks, sparks and uplink white hairlines (the enemy's coral), the tendrils a
   white network over the hull, the part boxes white hairline boxes, the storm's cells hairline billows and rain curtains;
   every tag, bracket and mark goes through the Orbital overlay (catalog labels: square, designation, barcode). No GPU
   point passes (the orbital system veils them). installOrbitalPaths(R) makes every system's R.fx.path dotted lines
   hairlines in that style (orders, sonar). The Point Cloud style is untouched. */
import { View, ringDots, lineDots, sat } from './sensors/core.js';
import { TagLayer } from './sensors/tags.js';
import { createContacts } from './sensors/contacts.js';
import { createRadar } from './sensors/radar.js';
import { createScan } from './sensors/scan.js';
import { createScope } from './sensors/scope.js';
import { createWeather } from './sensors/weather.js';
import { createGPU } from './sensors/gpu.js';
import { createInset } from './sensors/inset.js';
import { orbOn, orbOverlay, ringW, lineW, installOrbitalPaths } from './sensors/orb.js';

export async function createSensors(game) {
  const R = game.R;
  let AN = null;
  try { AN = await import('../data/anatomy.js'); } catch (e) { console.warn('sensors: anatomy.js unavailable (' + (e && e.message) + ')'); }

  /* shared state and drawing helpers */
  const OPT = { rgb: null, a: 1, step: 5, size: 1, mode: 'max', drape: null, lift: 0, max: 4000 };
  const S = {
    game, R, V: new View(), clock: 0, scopeK: 0, scopeRadar: null, mainRadar: null, inspecting: false,
    enemyList: [], contacts: null, keepOut: [],
    dotOpt(rgb, a, step, size, mode, drape, lift) {
      OPT.rgb = rgb; OPT.a = a; OPT.step = step || 5; OPT.size = size || 1; OPT.mode = mode || 'max'; OPT.drape = drape || null; OPT.lift = lift || 0; OPT.max = 4000;
      return OPT;
    },
    // S.orb (the Orbital render style, set every frame): the same calls draw hairlines through R.wire (sensors/orb.js)
    orb: false,
    ring(x, y, z, r, o) { return S.orb ? ringW(S.W, S.V, x, y, z, r, o) : ringDots(R.fx, S.V, x, y, z, r, o); },
    arc(x, y, z, r, a0, a1, o) { return S.orb ? ringW(S.W, S.V, x, y, z, r, o, a0, a1) : ringDots(R.fx, S.V, x, y, z, r, o, a0, a1); },
    line(ax, ay, az, bx, by, bz, o) { return S.orb ? lineW(S.W, S.V, ax, ay, az, bx, by, bz, o) : lineDots(R.fx, S.V, ax, ay, az, bx, by, bz, o); },
    // the hairlines go through S.W: R.wire, fading as the strategic layer comes up (its glyphs stand for them, as the
    // orbital system fades the wire models: 1 - ss(.3, .9, k))
    orbFade: 1,
    W: { seg(ax, ay, az, bx, by, bz, r, g, b, a) { if (R.wire) R.wire.seg(ax, ay, az, bx, by, bz, r, g, b, a * S.orbFade); } },
    scanOwns: id => scan.owns.has(id) || weather.owns.has(id),
  };
  // every system's dotted world lines (R.fx.path: orders, sonar...) become hairlines in the Orbital style
  installOrbitalPaths(R, () => S.orbFade);
  const contacts = S.contacts = createContacts(S);
  const radar = createRadar(S);
  const inset = createInset(S, AN);
  const scan = createScan(S, AN, inset);
  const scope = createScope(S);
  const weather = createWeather(S);
  const gpu = createGPU(R);
  const TL = new TagLayer();
  const stats = { ms: 0, cpu: 0, last: 0 };
  const OBST = [];
  let tA = 0;

  game.bus.on('inspect', d => { S.inspecting = !!(d && d.on); });
  // in idle time, build the tendril graphs of every hull on the map (so a scan's hit never waits for them)
  {
    const idle = window.requestIdleCallback ? (f => window.requestIdleCallback(f, { timeout: 4000 })) : (f => setTimeout(() => f({ timeRemaining: () => 10, didTimeout: false }), 300));
    const keys = [...new Set(game.sim.list().map(u => u.def.model))];
    let i = 0;
    const step = dl => {
      while (i < keys.length && (dl.timeRemaining() > 4 || dl.didTimeout)) { try { scan.prewarm(keys[i]); } catch (e) { /* */ } i++; if (dl.didTimeout) break; }
      if (i < keys.length) idle(step);
    };
    idle(step);
  }
  game.bus.on('side', () => { contacts.vis.clear(); });

  const sys = {
    name: 'sensors', priority: 15, always2d: true, stats,
    S, contacts, radar, scan, scope, weather, gpu, inset,
    get scopeOn() { return scope.st.on; },
    toggleScope: () => scope.toggle(),
    update(dtReal) {
      const t0 = performance.now();
      const dt = game.paused ? 0 : dtReal;
      S.clock += dt;
      contacts.update(dt);
      scan.update();
      inset.update();
      scope.update(dtReal);
      weather.update();
      tA = performance.now() - t0;
    },
    draw3d() {
      const t0 = performance.now();
      S.V.set(R.camera);
      S.orb = orbOn(R);
      { const k = game.orbital ? game.orbital.k || 0 : 0, u = Math.min(1, Math.max(0, (k - .3) / .6)); S.orbFade = 1 - u * u * (3 - 2 * u); }
      radar.draw3d();
      contacts.draw3d();
      scan.draw3d();
      scan.reticle3d();
      inset.warmStep();
      scope.draw3d();
      weather.draw3d();
      tA += performance.now() - t0;
    },
    draw2d(ov) {
      const t0 = performance.now();
      S.orb = orbOn(R);
      // GPU passes over the finished frame: the scope's clutter field / the squalls' rain speckle, the ceiling
      // (the Orbital style has none: the orbital system veils the point passes away; its hairlines stand for them)
      if (gpu.ok && !S.orb) {
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
      // the scan inset: its own picture over the finished frame
      if (inset.prepare()) inset.drawGPU();
      if (!game.ui.hidden) {
        // the Orbital style: the same calls through the Orbital overlay (catalog labels, hairline brackets)
        const O = S.orb ? orbOverlay(ov) : ov;
        TL.begin();
        S.keepOut.length = 0;
        contacts.draw2d(O, TL);
        scan.draw2d(O, TL);
        scan.reticle2d(O, TL);
        weather.draw2d(O, TL);
        scope.draw2d(O, TL);
        // world tags keep out of the HUD's panels and the inset
        OBST.length = 0;
        const hr = game.hudRects; if (hr) for (let i = 0; i < hr.length; i++) OBST.push(hr[i]);
        const ir = inset.rect; if (ir) OBST.push(ir);
        for (let i = 0; i < S.keepOut.length; i++) OBST.push(S.keepOut[i]);
        TL.flush(O, R.camera.W, R.camera.H, OBST);
        inset.draw2d(O, TL);
      }
      const ms = tA + performance.now() - t0;
      stats.ms = stats.ms * .92 + ms * .08; stats.last = ms;
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
