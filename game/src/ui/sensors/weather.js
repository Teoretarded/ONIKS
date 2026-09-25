/* Weather as the sensors see it (oh_storm): the storm's sparse dark cloud ceiling of dots over the squalls,
   lit from inside where lightning runs through it; rain squalls as clutter speckle on the radar picture (the
   main radar's sweep paints the rain returns). The FX system draws the rain itself and the lightning bolts with
   their flash; if it is not running, the bolts are drawn here (cloud to sea / land, full-frame lift, a light that
   shows the landscape for a moment).
   A natural strike reveals what is near it to both sides (sim flashReveal): the same chain lightning as the scan,
   in white. Forks race from where the bolt struck to every unit inside the flash, and each flashes white for a
   moment (its returns lit, a white bracket and tag): the enemy's as the track or contact the player now has
   (TRK 23 · ? · LIGHTNING), the player's own as seen by the enemy (04 · K340P TEL · SEEN). */
import { WH, LIME, sat, clamp, ss, pad2 } from './core.js';
import { Bolt, stormBolt } from './bolt.js';
import { Fork, reachOf } from './chain.js';
import { sampleOf } from './samples.js';
import { TRACK, SHORT } from '../../game/labels.js';
import { CLASSIFY } from '../../data/units.js';

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

  const reveals = [];               // { u, own, tF, t0, fork, from, seed, s }
  const PAL_W = { core: [250, 252, 255], glow: [205, 222, 255], spark: [235, 240, 255], light: [225, 235, 255] };
  const E3 = [0, 0, 0], q = [0, 0, 0], BX = [0, 0, 0, 0], MR = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function onEvent(e) {
    if (e.type !== 'lightning') return;
    if (flashes.length > 6) flashes.shift();
    const seed = (Math.floor(e.t * 20) * 977 + 13) | 0;
    flashes.push({ x: e.pos[0], y: e.pos[1], z: e.pos[2], top: e.top, t0: S.clock, seed, bolt: null });
    // what the flash shows: every unit near it, both sides (nearest first, a few)
    const r = e.r || 3000, list = [];
    for (const u of sim.list()) {
      if (!u.alive || u.aboard) continue;
      const d = Math.hypot(u.pos[0] - e.pos[0], u.pos[2] - e.pos[2]);
      if (d < r) list.push({ u, d });
    }
    list.sort((a, b) => a.d - b.d);
    if (reveals.length > 24) reveals.splice(0, reveals.length - 24);
    for (let k = 0; k < list.length && k < 8; k++) {
      const { u, d } = list[k];
      reveals.push({ u, own: u.side === game.side, tF: .07 + .3 * d / r + .03 * k, t0: S.clock, fork: null, from: e.pos.slice(), seed: seed + u.id * 31, s: null });
    }
  }
  /* world point where a white fork lands on a unit: over the top of it */
  function topOf(rv, out) {
    const u = rv.u, d = game.drawn.get(u.id), p = game.unitPose(u).pos;
    out[0] = p[0]; out[2] = p[2];
    out[1] = p[1] + Math.max(2, (rv.s ? rv.s.mx[1] : (u.def.size[2] || 4)) * .9);
    if (d && d.T) { out[0] = d.T[0]; out[2] = d.T[2]; }
    return out;
  }
  const owns = new Set();           // unit ids whose tag the flash owns right now (the contacts system stands aside)
  function reveals3d() {
    const fx = R.fx, V = S.V;
    owns.clear();
    for (let i = reveals.length - 1; i >= 0; i--) {
      const rv = reveals[i], a = S.clock - rv.t0;
      if (a > 3.2 || !rv.u.alive) { reveals.splice(i, 1); continue; }
      if (a > rv.tF && a < rv.tF + 2.4) owns.add(rv.u.id);
      const u = rv.u, pose = game.unitPose(u), p = pose.pos;
      if (!rv.s) rv.s = sampleOf(R, u.def.model);
      topOf(rv, E3);
      const near = V.vis(p[0], p[1], p[2], 3500);
      // the fork, white
      if (a > .04 && a < rv.tF + .7 && near) {
        const land = u.def.domain === 'land';
        if (!rv.fork) rv.fork = new Fork({ from: rv.from, to: E3, seed: rv.seed, ground: land ? (x, z) => R.terrain.heightAt(x, z) : null, climb: E3[1] - (land ? Math.max(0, R.terrain.heightAt(E3[0], E3[2])) : 0) });
        if (a < rv.tF) rv.fork.draw(fx, V, E3, reachOf(a - .04, Math.max(.05, rv.tF - .04)), .55, PAL_W, true, a);
        else rv.fork.draw(fx, V, E3, 1, Fork.stroke(a - rv.tF), PAL_W, false, a);
      }
      // the unit flashes white: its returns lit for a moment
      const b = a - rv.tF;
      if (b < 0 || b > .9 || !rv.s || !V.vis(p[0], p[1], p[2], rv.s.L)) continue;
      if (b < .3) R.light([E3[0], E3[1] + 4, E3[2]], Math.max(60, rv.s.L * 2.5), PAL_W.light, 1.2 * (1 - b / .3));
      const d = game.drawn.get(u.id), s = rv.s;
      let M, T;
      if (d && d.R && d.T) { M = d.R; T = d.T; }
      else { const c = Math.cos(pose.hdg), sn = Math.sin(pose.hdg); M = MR; MR[0] = c; MR[2] = sn; MR[4] = 1; MR[6] = -sn; MR[8] = c; T = p; }
      const zc = Math.max(V.near, V.depth(p[0], p[1], p[2])), px = s.L * V.fl / zc;
      const al = (b < .06 ? 1 : Math.exp(-(b - .06) * 4)) * (Math.sin(b * 70) > -.6 ? 1 : .5);
      if (px < 4) { fx.dotXYZ(p[0], p[1] + 2, p[2], 3, 255, 255, 255, al, 'over'); continue; }
      const stride = Math.max(1, Math.floor(s.n / clamp(px * 6, 60, s.n))), rest = s.rest;
      for (let j = 0; j < s.n; j += stride) {
        const o = j * 3, x0 = rest[o], y0 = rest[o + 1], z0 = rest[o + 2];
        fx.dotXYZ(M[0] * x0 + M[1] * y0 + M[2] * z0 + T[0], M[3] * x0 + M[4] * y0 + M[5] * z0 + T[1], M[6] * x0 + M[7] * y0 + M[8] * z0 + T[2], px > 90 ? 2 : 1, 250, 252, 255, al * .95, 'over');
      }
    }
  }
  /* the white bracket and tag on each unit the flash showed */
  function draw2d(ov, TL) {
    const cam = R.camera;
    for (const rv of reveals) {
      const b = S.clock - rv.t0 - rv.tF; if (b < 0 || b > 2.4) continue;
      const u = rv.u, p = game.unitPose(u).pos;
      if (!cam.project(p, q) || q[0] < -20 || q[1] < -20 || q[0] > cam.W + 20 || q[1] > cam.H + 20) continue;
      const al = sat(b / .08) * (1 - sat((b - 1.8) / .6)) * (b < .5 && Math.sin(b * 50) < -.5 ? .4 : 1);
      const mpp = q[2] / cam.fl, e = R.models.has(u.def.model) ? R.models.get(u.def.model) : null, rpx = e ? e.radius / mpp : 4;
      const hw = Math.max(8, rpx * .9), hh = Math.max(7, rpx * .55);
      BX[0] = q[0] - hw; BX[1] = q[1] - hh; BX[2] = q[0] + hw; BX[3] = q[1] + hh;
      ov.bracket(BX, '#FFFFFF', al, 3, 8);
      let id, label, value, kind;
      if (rv.own) { id = pad2(u.id); label = SHORT[u.type] || u.def.name; value = 'SEEN'; kind = 'ghost'; }
      else {
        const c = sim.contact(game.side, u.id);
        id = c ? c.track : 'TRK'; kind = 'white';
        label = c && c.conf >= CLASSIFY ? (TRACK[u.type] || u.def.name) : '? · LIGHTNING';
        value = c ? c.conf.toFixed(2) : '';
      }
      TL.add({ x: BX[2] + 12, y: BX[1] - 24, ax: BX[2], ay: BX[1], id, label, value, kind, a: al, size: 10, pri: 4, valCol: 'rgba(255,255,255,.72)' });
    }
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
    reveals3d();
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
  return { flashes, reveals, owns, squalls, windBrg, onEvent, update, draw3d, draw2d, ceilingParams, level };
}
