/* Ground detail: the land's vegetation, roads, lines, fences and the denser towns, as the films' LiDAR returns.

   game.addSystem(await createGround(game, ctx))       // name 'ground'

   What it draws (all in the terrain's own pass, lit and dimmed by the terrain's rules):
   - vegetation and boulders (ground/veg.js): procedural on the GPU from the map's masks (ground/climate.js, per map:
     taiga on the fjord, tundra shrub on the Arctic coast, steppe scrub, balka woods and field belts on Krasnaya Kosa,
     willows and reed beds in the delta, pine and dwarf pine on the caldera, pine on the skerries, mixed forest on the
     strait's and the harbour's hills); every tree a small cloud of returns close up, a canopy texture farther, a faint
     density from high up
   - static returns (ground/static.js, built by ground/plan.js): roads (two dotted edges close up, one line far off,
     tracks fainter), beam bridges, the settlements' streets, lit windows at night, garden and street trees, 110 kV
     lines (lattice towers, catenaries), fences round the objective sites
   - more houses round the settlements (ribbons along the roads, dacha plots, farms, homesteads, a few flat-roofed
     blocks): models built like the landmarks' settlements (data/landmark_models.js), queued in draw3d
   - hairlines of the roads on the strategic map and in the Orbital style

   How it hooks in: the terrain's drawSurface is wrapped (the renderer calls it inside end() with the dots' state:
   depth-tested against the occluders, max blend, the frame's uniforms bound), so no engine file changes. It builds at
   the bus 'ready' (the landmarks' plan is there then: settlements, their streets, the bridges).

   Density: the terrain's live density (Settings dot density x the auto-quality guard's dots step) sets the area per
   tree and per return; the guard's fx step and the Effects setting thin the crowns. Units stay readable: the terrain's
   pools round the units dim these returns too. Cost: see stats (CPU ms; the vegetation walk and the chunk lists are
   kept while the view holds). */
import { PRI } from './game.js';
import { buildMasks, climateOf } from './ground/climate.js';
import { planGround } from './ground/plan.js';
import { VegLayer, SLOT } from './ground/veg.js';
import { StaticLayer } from './ground/static.js';
import { buildLandmark, spacingFor, mergeParts } from '../data/landmark_models.js';

const TIME_K = { night: 1, dusk: .72, day: .28 };
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const EFFECTS = { low: .55, medium: .8, high: 1 };

export async function createGround(game, ctx) {
  const R = game.R, T = R.terrain, map = game.map;
  const clim = climateOf(map.id);
  const stats = { ms: 0, build: 0, veg: null, static: null, plan: null, masks: 0, on: true };
  let veg = null, stat = null, broken = false, built = false, roadWire = null;
  const info = {};                  // where things were put (debugging: towers, added houses)
  const houses = [];                // the added houses as models: { d, near, far, cx, cy, cz, r }
  let warmI = 0;

  function build() {
    if (built) return;
    built = true;
    const t0 = performance.now();
    try {
      const lm = game.getSystem('landmarks'), plan = (lm && lm.plan) || null;
      const masks = buildMasks({ map, T, plan });
      stats.masks = masks.ms;
      const P = planGround({ map, T, plan });
      stats.plan = P.stats; info.towers = P.towers; info.houses = P.houses;
      veg = new VegLayer(R, map, masks, clim, P.clear);
      stat = new StaticLayer(R, P.dots);
      stats.veg = veg.stats; stats.static = stat.stats;
      // the added houses: models built like the landmarks' settlements (a chunked model near, a merged one far)
      const M = R.models, gnd = (x, z) => T.heightAt(x, z);
      P.clusters.forEach((S, i) => {
        const key = 'gnd_' + map.id + '_' + i, lods = spacingFor(S);
        let m = null;
        const once = () => m || (m = buildLandmark(S, gnd));
        M.registerModel(key, once, { lods });
        M.registerModel(key + '_far', () => ({ parts: mergeParts(once().parts, 2) }), { lods: [lods[2], lods[3], lods[3] * 2.5, lods[3] * 6] });
        let cy = 0; for (const y of S.base) cy += y / S.base.length;
        // alpha under the renderer's subject cut (.3), made up by bright: the world never dims round a house cluster
        // (the units keep the pools); as bright as a settlement (alpha .62)
        houses.push({ d: { key: key + '_far', T: [S.x, 0, S.z], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], st: {}, tint: 'neutral', alpha: .29, bright: .62 / .29 }, near: key, far: key + '_far', cx: S.x, cy, cz: S.z, r: S.r });
      });
      // the roads as hairlines (the strategic map, the Orbital style)
      if (R.wire && map.roads && map.roads.length) {
        const seg = [];
        const yh = (x, z) => Math.max(0, map.h(x, z)) + 2.5;
        for (const rd of map.roads) for (let i = 0; i < rd.length - 1; i++) {
          const a = rd[i], b = rd[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 150));
          for (let k = 0; k < n; k++) {
            const x0 = a[0] + (b[0] - a[0]) * k / n, z0 = a[1] + (b[1] - a[1]) * k / n, x1 = a[0] + (b[0] - a[0]) * (k + 1) / n, z1 = a[1] + (b[1] - a[1]) * (k + 1) / n;
            seg.push(x0, yh(x0, z0), z0, x1, yh(x1, z1), z1);
          }
        }
        if (seg.length) roadWire = R.wire.batch(new Float32Array(seg));
      }
    } catch (e) { console.error('ground: build failed', e); broken = true; }
    stats.build = Math.round(performance.now() - t0);
    const p = stats.plan || {};
    console.log(`ONIKS: ground on ${map.id}: ${Math.round(p.roadKm || 0)} km of road (${p.bridges || 0} bridges), ${p.streets || 0} streets, ${(p.houses || 0) + (p.dachas || 0)} houses (+${p.farms || 0} farms), ${p.trees || 0} garden trees, ${p.towers || 0} towers / ${(p.lineKm || 0).toFixed(1)} km of line, ${p.fences || 0} fence sides; ${((p.returns || 0) / 1e6).toFixed(2)} M returns; masks ${stats.masks} ms, plan ${p.ms} ms, build ${stats.build} ms`);
  }
  game.bus.on('ready', build);

  /* the pass, inside the terrain's */
  const keep = new Float32Array(32 * 4);
  const o = { lit: [0, 1, 0], bright: 1, night: 0, need: [0, .1, 7, 1], canopy: .85, vegK: 1, pxScale: 1 };
  /* before the terrain's dots: the view's objects, the canopy's depth. true when occluders were drawn */
  function pre() {
    if (!built) build();
    if (broken || !veg || !stats.on) return false;
    const a = performance.now(), gl = R.gl, cam = R.camera;
    const fl = 540 / Math.tan(cam.fov / 2);
    // density: the terrain's live density (settings x auto quality), the effects step, the Effects setting
    const dens = Math.max(.3, (T.densNear || 140) / 140), Q = game.quality, fxK = Q && Q.fx !== undefined ? Q.fx : 1;
    const eff = EFFECTS[(game.settings && game.settings.effects) || 'high'] || 1;
    // (a canopy's returns about as dense on screen as the ground's: the pulse lands on the crowns instead of the ground)
    const A0 = 30 / dens, Adot = 26 / (dens * eff * (.55 + .45 * fxK));
    // the land's light and brightness (engine/terrain.js: the view's light blended with the moon; brighter from high up)
    const sun = R.sun, lc = T.litCam || sun, f = T.lightFollow === undefined ? 1 : T.lightFollow;
    let lx = sun[0] + (lc[0] - sun[0]) * f, ly = sun[1] + (lc[1] - sun[1]) * f, lz = sun[2] + (lc[2] - sun[2]) * f;
    const ll = Math.hypot(lx, ly, lz) || 1; o.lit[0] = lx / ll; o.lit[1] = ly / ll; o.lit[2] = lz / ll;
    o.bright = (T.landBright || .8) * (1 + (T.landHigh || 0) * (T.altK || 0));
    const tk = TIME_K[T.time] !== undefined ? TIME_K[T.time] : 1;
    o.night = Math.max(0, (tk - .35) / .65);
    o.need[0] = A0 / (fl * fl * SLOT * SLOT); o.need[1] = .1; o.need[2] = Adot; o.need[3] = fl;
    o.pxScale = 1 / Math.sqrt(dens);
    veg.walk(cam, { Kn: o.need[0], G0: o.need[1], Adot, fl, dens: .35 });
    veg.objects(o);
    let occ = 0;
    if (stats.canopyOcclusion !== false && R.worldBright > .5) {
      // the canopy hides the ground behind it (depth only)
      // (never over a model on screen: the renderer's list of the instances on screen, biggest first; so the occluders
      // can stay for the rest of the frame and no unit ever hides behind a crown)
      const L = R._subjList || [];
      let nk = 0;
      for (let i = 0; i < L.length && nk < 32; i++) { const q = L[i]; keep[nk * 4] = q.sx; keep[nk * 4 + 1] = q.sy; keep[nk * 4 + 2] = q.sr; nk++; }
      gl.colorMask(false, false, false, false); gl.depthMask(true);
      occ = veg.occlude(24, keep, nk);                // crowns up to ~24 px (1080p) of radius: denser than the ground behind
      gl.colorMask(true, true, true, true); gl.depthMask(false);
    }
    stats.msPre = performance.now() - a;
    return occ > 0;
  }
  /* after them: the occluders as they were (the units must never hide behind a crown), then the returns */
  function post(occ) {
    const a = performance.now(), gl = R.gl, cam = R.camera;
    if (occ && stats.restoreDepth) {
      gl.depthMask(true); gl.colorMask(false, false, false, false);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      T.drawDepth(0);
      if (R.seaOcclude !== false) T.drawDepth(1);
      gl.colorMask(true, true, true, true); gl.depthMask(false);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    }
    const fl = o.need[3];
    veg.draw(o);
    stat.collect(cam, fl, o.pxScale);
    stat.draw(o);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    stats.ms = stats.ms * .9 + (performance.now() - a + (stats.msPre || 0)) * .1;
  }
  /* the added houses: frustum and size culled, the chunked model near, the merged one far (as game/landmarks.js) */
  const HNEAR = 3500;
  function drawHouses() {
    const cam = R.camera, e = cam.eye, f = cam.f, r = cam.r, u = cam.u, fl = 540 / Math.tan(cam.fov / 2);
    const tx = (cam.W / 2) / cam.fl * 1.08, ty = (cam.H / 2) / cam.fl * 1.08;
    for (const h of houses) {
      const dx = h.cx - e[0], dy = h.cy - e[1], dz = h.cz - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2];
      if (zc < -h.r) continue;
      const xc = dx * r[0] + dy * r[1] + dz * r[2], yc = dx * u[0] + dy * u[1] + dz * u[2], zz = Math.max(zc, 1);
      if (Math.abs(xc) - h.r > zz * tx || Math.abs(yc) - h.r > zz * ty) continue;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (h.r * fl / Math.max(1, dist) < .6) continue;
      h.d.key = dist - h.r < HNEAR ? h.near : h.far;
      h.d.bright = .62 / .29 * (1 - .45 * ss(8000, 40000, dist));
      R.draw(h.d);
    }
  }
  const surf0 = T.drawSurface;
  T.drawSurface = function (opt) {
    let occ = false, ok = true;
    try { occ = pre(); } catch (e) { console.error('ground: pass', e); broken = true; ok = false; }
    if (!stats.solo) surf0.call(this, opt);           // stats.solo: the ground's returns alone (a debug view)
    if (ok && !broken && veg && stats.on) try { post(occ); } catch (e) { console.error('ground: pass', e); broken = true; }
  };

  return {
    name: 'ground', priority: (PRI.render || 10) + 1, stats, look: o, info,
    get veg() { return veg; }, get static() { return stat; }, houses,
    update() {
      // pre-sample one house model's coarse levels a frame (no stall on the first look)
      if (houses.length && warmI < houses.length * 2) { const h = houses[warmI >> 1], k = warmI & 1 ? h.near : h.far; warmI++; try { R.models.warm(k); } catch (e) { /* sampled on use */ } }
    },
    draw3d() {
      if (houses.length && !broken && stats.on && !R.pcOff) drawHouses();
      // the roads' hairlines from the strategic map's band up, and in the Orbital style
      const O = game.orbital, kMap = O ? O.kMap || 0 : 0, orb = R.style === 'orbital';
      if (roadWire && R.wire && (kMap > .001 || orb)) R.wire.add(roadWire, { a: .3 * (orb ? Math.max(kMap, .6) : kMap), rgb: [246 / 255, 245 / 255, 242 / 255], depth: orb && kMap < .5, fog: orb ? [20000, 90000] : undefined });
    },
    dispose() { T.drawSurface = surf0; },
  };
}
