/* The radar picture: every own radar that radiates paints its sweep. The main one (the selected radar, else
   the surface-search radar nearest the view) drives the engine's sweep (the sea and the land light up behind a
   lime edge and hold an afterglow); every radar also gets its dotted lime leading edge with a sparse curtain of
   light above it (p2), the others a short dotted afterglow, and a faint ring at its reach. */
import { LIME, WH, TAU, sat, clamp, ss, hsh, wrap2 } from './core.js';
import { radarWorks } from '../../sim/sensors.js';

export function createRadar(S) {
  const { game } = S, sim = game.sim, R = game.R, map = game.map;
  const list = [];                  // pooled { u, x, y, z, brg, w, range, surf, air, main }
  const pool = [];
  let lastSweep = false;
  const sweep = { origin: [0, 0], bearing: 0, amp: .85, afterglow: 1.3, range: 60000, edge: .03 };

  /* the world bearing of a radar's beam at time t (the sim's antenna: hull heading + antenna angle) */
  function beamAt(u, t, hdg) { return hdg + u.antA + u.antW * (t - u.antT); }

  function collect() {
    list.length = 0;
    const side = game.side, t = game.t;
    for (const u of sim.alive(side)) {
      const Rd = u.def.sensors && u.def.sensors.radar;
      if (!Rd || !radarWorks(u)) continue;
      let o = pool[list.length];
      if (!o) { o = { u: null, x: 0, y: 0, z: 0, brg: 0, w: 0, range: 0, surf: 0, air: 0, main: false, ph: 0, d: 0 }; pool[list.length] = o; }
      const p = game.unitPose(u);
      o.u = u; o.x = p.pos[0]; o.y = p.pos[1]; o.z = p.pos[2];
      o.ph = beamAt(u, t, p.hdg); o.brg = wrap2(o.ph); o.w = u.antW;
      o.surf = Rd.surf || 0; o.air = Rd.air || 0; o.range = o.surf || o.air; o.main = false;
      list.push(o);
    }
    return list;
  }
  /* the radar the engine sweep follows */
  function pickMain() {
    if (!list.length) return null;
    let best = null;
    for (const o of list) if (game.selection.has(o.u.id)) { best = o; break; }
    if (!best && S.scopeRadar) for (const o of list) if (o.u === S.scopeRadar) { best = o; break; }
    if (!best) {
      const tg = game.camera.target; let bd = 1e18;
      for (const o of list) {
        const d = (o.x - tg[0]) ** 2 + (o.z - tg[2]) ** 2 + (o.surf ? 0 : 1e12) + (o.u.def.domain === 'air' ? 4e12 : 0);
        if (d < bd) { bd = d; best = o; }
      }
    }
    best.main = true;
    return best;
  }

  function draw3d() {
    collect();
    const main = pickMain();
    S.mainRadar = main;
    if (main && !S.inspecting) {
      const fast = Math.abs(main.w) * (game.paused ? 0 : game.timeRate) > 9;
      sweep.origin[0] = main.x; sweep.origin[1] = main.z; sweep.bearing = main.brg;
      sweep.amp = .85 + .15 * S.scopeK; sweep.afterglow = fast ? 5 : 1.3 + .5 * S.scopeK; sweep.range = main.range; sweep.edge = .03;
      R.setSweep(sweep); lastSweep = true;
    } else if (lastSweep) { R.setSweep(null); lastSweep = false; }
    const fx = R.fx, V = S.V, T = R.terrain, scope = S.scopeK;
    // the nearest radars to the view get the full beam (edge, curtain, afterglow), the next few a plain edge
    const tg = game.camera.target;
    for (const o of list) o.d = o.main ? -1 : (o.x - tg[0]) ** 2 + (o.z - tg[2]) ** 2;
    if (list.length > 1) list.sort(byD);
    let nb = 0;
    for (const o of list) {
      const air = o.u.def.domain === 'air';
      if (air && o.u.type !== 'helo') continue;                 // fighters: an array, no turning beam
      if (nb >= 6) break;
      const full = nb < 2; nb++;
      const dAng = Math.abs(o.w) * (game.paused ? 0 : game.timeRate) * Math.max(1 / 60, game.dtReal);
      const blur = clamp(.35 / Math.max(1e-3, dAng), .22, 1);
      const a = (o.main ? .7 : o.surf ? .85 : .5) * blur * (1 - .2 * scope);
      beam(fx, V, T, o, o.brg, a, full);
      if (!o.main && full) for (let k = 1; k <= 3; k++) beam(fx, V, T, o, o.brg - k * .045, a * .32 * Math.exp(-k * .6), false);
      // reach ring (only once the view is wide enough to show it as a ring, or for the selected radar)
      const sel = game.selection.has(o.u.id);
      const ra = (sel ? 1 : o.surf ? ss(o.range * .06, o.range * .25, game.camera.dist) : 0) * ss(.1, .35, game.camera.pitch) * (1 - scope);
      if (ra > .02) S.ring(o.x, 0, o.z, o.range, S.dotOpt(LIME, (o.main ? .34 : .2) * ra, 6, 1, 'over', T, 3));
    }
  }
  const byD = (a, b) => a.d - b.d;
  const P = [0, 0, 0];
  /* the leading edge (and its curtain) along bearing b */
  function beam(fx, V, T, o, b, a, curtain) {
    const sb = Math.sin(b), cb = Math.cos(b), range = o.range;
    const e = V.e, f = V.f;
    // cull: the beam's midpoint sphere
    if (!V.vis(o.x + sb * range / 2, 0, o.z + cb * range / 2, range / 2)) return;
    let r = 30, n = 0, it = 0;
    const tx = V.W * .6 / V.fl, ty = V.H * .6 / V.fl;
    while (r < range && n < 1200 && it++ < 6000) {
      const x = o.x + sb * r, z = o.z + cb * r;
      const dx = x - e[0], dz = z - e[2], dy0 = -e[1];
      const zc0 = dx * f[0] + dy0 * f[1] + dz * f[2];
      if (zc0 <= V.near * 6) { r += Math.max(8, (V.near * 6 - zc0) * .5); continue; }
      const xc = dx * V.r[0] + dy0 * V.r[1] + dz * V.r[2], yc = dx * V.u[0] + dy0 * V.u[1] + dz * V.u[2];
      const off = Math.max(Math.abs(xc) - zc0 * tx, Math.abs(yc) - zc0 * ty - 600);
      if (off > 0) { r += Math.max(8, off * .5); continue; }
      const y = Math.max(0, zc0 < 3000 ? T.heightAt(x, z) : map.h(x, z)) + 1.5;
      const zc = zc0 + (y) * f[1];
      const ds = Math.max(4, 3.2 * zc / V.fl);
      const fa = a * (1 - .45 * r / range);
      fx.dotXYZ(x, y, z, curtain ? 2 : 1, LIME[0], LIME[1], LIME[2], fa, 'over');
      if (curtain && (n & 1) === 0) { P[0] = x; P[1] = y; P[2] = z; fx.glow(P, 7, LIME, .03 * fa); }
      n++;
      r += ds;
    }
    if (!curtain) return;
    // the beam's vertical coverage as a thin sheet that thins out upward (fixed radial grid: no shimmer)
    const h0 = range * .0022, cA = a * .8;
    let k = 0;
    for (let rr = range * .01; rr < range; rr += range * .002 + rr * .005, k++) {
      const x = o.x + sb * rr, z = o.z + cb * rr, g = Math.max(0, map.h(x, z));
      const hk = h0 * Math.pow(rr / (range * .156), .6);
      for (let j = 1; j <= 5; j++) {
        if (hsh(k, j + (o.u.id << 4)) > .55 - j * .06) continue;
        const y = g + j * hk;
        const zc = (x - e[0]) * f[0] + (y - e[1]) * f[1] + (z - e[2]) * f[2];
        if (zc < V.near) continue;
        fx.dotXYZ(x, y, z, 1, LIME[0], LIME[1], LIME[2], cA * (1 - j / 6.5) * (1 - .5 * rr / range), 'over');
      }
    }
  }
  return { list, draw3d, beamAt, collect, pickMain };
}
