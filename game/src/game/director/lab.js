/* Cinematic lab (dev): set up an engagement in the running match and record what the cinematic camera does with it.
   In the page console of play.html (sandbox):
     const L = await import('/game/src/game/director/lab.js');
     L.scene('sm6')            // 'sm6' (DDG, SM-6 + Phalanx vs one 3M55 at 30 km), 'leak' (no defence: the hit),
                             // 'stream' (three 3M55 in trail on an undefended DDG, then a fresh launch),
                               // 'ciws' (Phalanx only vs a Kh-35U from 7 km), 'salvo' (a round cruising, then a fresh launch)
     L.rec(30)                 // step 30 real s at 60 fps (frames rendered), the camera on: per-frame stats, snaps, shots
     L.shot('name')            // ONIKS.hudShot-like still of the next frame -> game/shots/<name>.png
   The threat is placed in cruise on its path (as dev/intercept_lab.js does); the defender is the fleet's first DDG. */
import { launch, killProj } from '../../sim/weapons.js';

const O = () => window.ONIKS;

export function scene(kind = 'sm6', o = {}) {
  const { sim, game } = O();
  // clear what is in the air
  for (const p of sim.projectiles.values()) p.alive = false;
  const D = sim.list().find(u => u.type === 'ddg' && u.alive && u.side === 'fleet');
  const S = sim.list().find(u => u.type === 'tel' && u.alive && u.side === 'coast');
  const keep = { sm6: ['sm6', 'ciws'], leak: [], ciws: ['ciws'], salvo: ['sm6', 'ciws'], stream: [] }[kind] || [];
  D.hp = D.hpMax = o.hp || 1e6;
  for (const k in D.ammo) if (!keep.includes(k)) D.ammo[k] = 0; else D.ammo[k] = Math.max(D.ammo[k], 8);
  if (D.def.sensors.radar) sim.setRadar(D, true, true);
  const threat = kind === 'ciws' ? 'uran' : 'oniks';
  const from = o.from || { sm6: 30000, leak: 9000, ciws: 7000, salvo: 32000, stream: 9000 }[kind];
  const ang = o.ang !== undefined ? o.ang : 2.2;          // bearing the threat comes from (from the DDG)
  const mk = (dist, h, ang2) => {
    const ox = D.pos[0] + Math.sin(ang2) * dist, oz = D.pos[2] + Math.cos(ang2) * dist;
    const hdg = Math.atan2(D.pos[0] - ox, D.pos[2] - oz);
    S.ammo._lab = 99;
    const P = launch(sim, S, { proj: threat, name: '_lab', range: dist * 2, cd: 0 }, D.id, 'unit', D.pos);
    P.pos[0] = P.prev[0] = ox; P.pos[1] = P.prev[1] = h; P.pos[2] = P.prev[2] = oz;
    P.hdg = hdg; P.pitch = 0; P.age = 30; P.spd = P.P.speed; P.phase = 'cruise'; P.sep = true; if (P.st) P.st.booster = false;
    P.fromPos = [ox - Math.sin(hdg) * 20000, 0, oz - Math.cos(hdg) * 20000];
    P.aim[0] = D.pos[0]; P.aim[1] = h; P.aim[2] = D.pos[2];
    P.vel[0] = Math.sin(hdg) * P.spd; P.vel[1] = 0; P.vel[2] = Math.cos(hdg) * P.spd;
    P.spd0 = P.spd; P.t0 = sim.t - 30;
    P.P = Object.assign({}, P.P, { ign: 0, boost: 0, sus: null, vert: 0, drop: 0, v0: P.P.speed });
    return P;
  };
  const out = [mk(from, 15, ang)];
  // a stream: more rounds in trail behind the first, 2.5 km apart (they hit one after another)
  if (kind === 'stream') for (let i = 1; i < (o.n || 3); i++) out.push(mk(from + 2500 * i, 15, ang + .02 * i));
  if (kind === 'salvo' || kind === 'stream') {
    // a fresh launch from the TEL a few seconds in (the real boost and climb)
    const at = sim.t + (o.launchAt || 8);
    const off = game.bus.on('frame', () => {
      if (sim.t < at) return;
      off();
      S.ammo._lab2 = 9;
      out.push(launch(sim, S, { proj: 'oniks', name: '_lab2', range: 200000, cd: 0 }, D.id, 'unit', D.pos));
    });
  }
  // force: the first interceptor to come within ~100 m of the round breaks it up (a sure intercept, to film one)
  if (o.force) {
    const T = out[0];
    const off = game.bus.on('frame', () => {
      if (!T.alive) { off(); return; }
      for (const q of sim.projectiles.values()) {
        if (!q.alive || q.tk !== 'proj' || q.target !== T.id) continue;
        if (Math.hypot(q.pos[0] - T.pos[0], q.pos[1] - T.pos[1], q.pos[2] - T.pos[2]) > 120) continue;
        killProj(sim, T, 'intercept', { pos: T.pos.slice(), by: q.id, byKind: q.kind });
        killProj(sim, q, 'burst', {});
        off(); return;
      }
    });
  }
  sim.drainEvents();
  game.setRate(o.rate || 1);
  return { ddg: D.id, tel: S.id, rounds: out.map(p => p.id) };
}

/* step `sec` real seconds at `fps` with the camera on; per frame: the eye, the lens direction, the shot, the rate.
   A snap: the eye's speed changing by more than 250 m/s in one frame, or the lens turning faster than 100 deg/s with a
   change of more than 40 deg/s in one frame. */
export function rec(sec = 20, fps = 60, o = {}) {
  const { game, cam, sim } = O();
  const dir = game.getSystem('director');
  if (!dir.on) dir.set(true);
  const dt = 1 / fps, n = Math.round(sec * fps);
  const rows = [], snaps = [], evs = [];
  const onEv = e => { if (['launch', 'intercept', 'hit', 'spinout', 'gunfire', 'breakup'].includes(e.type) || (e.type === 'splash' && e.air)) evs.push(`${e.type}${e.proj ? ' p' + e.proj : ''}${e.kind ? ' ' + e.kind : ''}`); };
  game.bus.on('event', onEv);
  let pe = null, pf = null, pv = null, pw = 0, pOm = 0, last = '', maxO = 0, sumJ = 0;
  const t0 = performance.now(), q = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    evs.length = 0;
    if (o.stills && o.stills.length && i * dt >= o.stills[0]) { const ts = o.stills.shift(); O().shot(`${o.name || 'cine'}_${ts.toFixed(1)}s`); }
    O().advance(dt, 1);
    const e = cam.eye.slice(), f = cam.f.slice();
    const sh = dir.shot;
    const key = (game.replay && game.replay.active ? 'REPLAY ' : '') + (sh ? sh.kind + ':' + (sh.id || sh.unit || sh.tgt || '') + (sh.var ? ':' + sh.var : '') : '-');
    const p = sh && sh.id && sh.kind === 'round' ? sim.projectiles.get(sh.id) : null;
    const alive = sh && sh.kind === 'round' && !(p && p.alive) ? ' DEAD' : '';
    const T = (i * dt).toFixed(2);
    for (const x of evs) rows.push(`${T}s   * ${x}`);
    if (key !== last) { rows.push(`${T}s ${key}${alive} x${game.timeRate.toFixed(2)}`); last = key; }
    if (pe) {
      const v = [(e[0] - pe[0]) / dt, (e[1] - pe[1]) / dt, (e[2] - pe[2]) / dt];
      const c = Math.max(-1, Math.min(1, f[0] * pf[0] + f[1] * pf[1] + f[2] * pf[2]));
      const w = Math.acos(c) / dt * 180 / Math.PI;
      if (pv && i > 3) {
        // a jolt: the lens's turn rate changing by > 25 deg/s in a frame, or the eye's speed by > 30 m/s (and 15 %)
        const dw = Math.abs(w - pw), dv = Math.hypot(v[0] - pv[0], v[1] - pv[1], v[2] - pv[2]), sp = Math.hypot(v[0], v[1], v[2]);
        if (dw > (o.jw || 25) || (dv > 30 && dv > .15 * sp)) snaps.push(`${T}s dw ${dw.toFixed(0)} (w ${w.toFixed(0)}) dv ${dv.toFixed(0)} (v ${sp.toFixed(0)}) ${key}`);
        sumJ += dw; maxO = Math.max(maxO, w);
      }
      pv = v; pw = w; pOm = w;
    }
    pe = e; pf = f;
    if (o.log && i % Math.round(fps * (o.log || 1)) === 0) {
      let sp = '';
      if (p) { const pp = game.projPose(p).pos, r = cam.project(pp, q); sp = r ? ` subj ${(r[0] / cam.W).toFixed(2)},${(r[1] / cam.H).toFixed(2)} @${Math.round(r[2])}m` : ' subj OFF'; }
      rows.push(`${T}s   x${game.timeRate.toFixed(2)} eye h${Math.round(e[1])} w ${pw.toFixed(1)} d ${Math.round(dir.lookDist)}${sp}`);
    }
  }
  game.bus.off && game.bus.off('event', onEv);
  return { ms: +((performance.now() - t0) / n).toFixed(1), meanDw: +(sumJ / n).toFixed(2), maxW: Math.round(maxO), nSnaps: snaps.length, snaps: snaps.slice(0, 30), shots: rows };
}

/* save the next frame (with the overlay) as game/shots/<name>.png */
export function shot(name) { return O().shot(name); }
