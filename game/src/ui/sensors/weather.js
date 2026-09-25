/* Weather as the sensors see it (oh_storm): the storm's sparse dark cloud ceiling of dots over the squalls,
   lit from inside where lightning runs through it; rain squalls as clutter speckle on the radar picture (the
   main radar's sweep paints the rain returns). The FX system draws the rain itself and the lightning bolts with
   their flash; if it is not running, the bolts are drawn here (cloud to sea / land, full-frame lift, a light that
   shows the landscape for a moment). */
import { WH, LIME, sat, clamp, ss } from './core.js';
import { Bolt, stormBolt } from './bolt.js';

export function createWeather(S) {
  const { game } = S, sim = game.sim, R = game.R;
  const flashes = [];              // { x, z, top, t0, bolt, seed }
  const SQ = [];                   // pooled { x, z, r, q }
  const FLS = [];                  // pooled { x, z, r, i }
  const PAL = { core: [250, 253, 255], glow: LIME, spark: [230, 255, 190], light: [230, 240, 255], lift: [225, 236, 255] };

  const W = () => sim.weather || { kind: 'calm', squalls: [], wind: [0, 0] };
  function squalls() {
    const w = W(); SQ.length = 0;
    if (!w.squalls) return SQ;
    const q = w.kind === 'storm' ? .5 : w.kind === 'rain' ? .42 : 0;
    if (!q) return SQ;
    for (let i = 0; i < w.squalls.length && i < 8; i++) {
      const s = w.squalls[i];
      let o = SQ[i]; if (!o) o = SQ[i] = {};
      o.x = s.x; o.z = s.z; o.r = s.r; o.q = q;
    }
    SQ.length = Math.min(8, w.squalls.length);
    return SQ;
  }
  function windBrg() {
    const w = W().wind || [0, 0];
    // the direction the wind blows FROM (sea clutter is brighter looking into it)
    return Math.hypot(w[0], w[1]) > .01 ? Math.atan2(-w[0], -w[1]) : -.49;
  }

  function onEvent(e) {
    if (e.type !== 'lightning') return;
    if (flashes.length > 6) flashes.shift();
    const seed = (Math.floor(e.t * 20) * 977 + 13) | 0;
    flashes.push({ x: e.pos[0], y: e.pos[1], z: e.pos[2], top: e.top, t0: S.clock, seed, bolt: null });
  }
  /* the flicker of a flash in the cloud (return strokes with dips) */
  function level(a) {
    if (a < 0 || a > 1.6) return 0;
    return Math.exp(-a * 4.5) * (.6 + .4 * Math.cos(a * 40)) + .5 * Math.exp(-Math.pow((a - .12) * 24, 2)) + .4 * Math.exp(-Math.pow((a - .27) * 20, 2));
  }

  function update() {
    for (let i = flashes.length - 1; i >= 0; i--) if (S.clock - flashes[i].t0 > 2) flashes.splice(i, 1);
  }

  function draw3d() {
    // the bolts, when the FX system does not draw them
    if (game.getSystem('fx')) return;
    const fx = R.fx, V = S.V;
    for (const f of flashes) {
      const a = S.clock - f.t0;
      if (!f.bolt) f.bolt = stormBolt([f.x, Math.max(0, f.y), f.z], f.top || [f.x, 3500, f.z], f.seed);
      const lead = .05, I = Bolt.stroke(a - lead);
      if (a < lead) { f.bolt.draw(fx, V, a / lead, .5, PAL, -1, true); continue; }
      if (I < .005) continue;
      f.bolt.draw(fx, V, 1, I, PAL, -1, false);
      const d = V.dist(f.x, 1500, f.z);
      fx.lift(Math.min(.14, .12 * I * clamp(9000 / d, .25, 1)), PAL.lift);
      R.light([f.x, 1600, f.z], 5200, PAL.light, 1.1 * I);
      R.light([f.x, f.y + 60, f.z], 1400, PAL.light, .8 * I);
    }
  }

  /* the ceiling (GPU, after the engine's frame) */
  function ceilingParams() {
    const w = W();
    if (w.kind !== 'storm' && w.kind !== 'rain') return null;
    const storm = w.kind === 'storm';
    FLS.length = 0;
    for (const f of flashes) {
      const I = level(S.clock - f.t0);
      if (I < .01) continue;
      let o = FLS[FLS.length]; if (!o) o = {};
      o.x = f.x; o.z = f.z; o.r = 6500; o.i = I * 1.3;
      FLS.push(o);
    }
    const ey = R.camera.eye[1];
    const wv = w.wind || [0, 0], t = sim.t;
    return {
      map: game.map, overcast: storm ? .38 : 0, base: storm ? 2100 : 2400, thick: storm ? 1100 : 700,
      alpha: (storm ? 1 : .75) * (1 - .6 * S.scopeK), squalls: squalls(), flashes: FLS, t,
      eyeFade: 1 - .72 * ss(3500, 36000, ey), drift: [wv[0] * 1.5 * t, (wv[1] || 0) * 1.5 * t],
    };
  }
  return { flashes, squalls, windBrg, onEvent, update, draw3d, ceilingParams, level };
}
