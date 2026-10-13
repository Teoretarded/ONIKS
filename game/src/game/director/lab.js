/* Cinematic lab (dev): set up an engagement in the running match and record what the cinematic camera does with it.
   In the page console of play.html (sandbox):
     const L = await import('/game/src/game/director/lab.js');
     L.scene('sm6')            // 'sm6' (DDG, SM-6 + Phalanx vs one 3M55 at 30 km), 'leak' (no defence: the hit),
                               // 'stream' (three 3M55 in trail on an undefended DDG, then a fresh launch),
                               // 'ciws' (Phalanx only vs a Kh-35U from 7 km), 'salvo' (a round cruising, then a fresh launch),
                               // 'pantsir' (a Kh-35U at a Pantsir-defended TEL site: the Pantsir's own fight)
     L.rec(30, 60, { mode })   // step 30 real s at 60 fps (frames rendered), the camera on in that mode (director, chase,
                               // tripod, showcase, overview, story, duel): per-frame stats, jolts, shots, cuts
     L.shot('name')            // ONIKS.hudShot-like still of the next frame -> game/shots/<name>.png
   The threat is placed in cruise on its path (as dev/intercept_lab.js does); the defender is the fleet's first DDG. */
import { launch, killProj } from '../../sim/weapons.js';
import { setSetting } from '../../data/settings.js';

const O = () => window.ONIKS;

export function scene(kind = 'sm6', o = {}) {
  const { sim, game } = O();
  for (const p of sim.projectiles.values()) p.alive = false;
  const D = sim.list().find(u => u.type === 'ddg' && u.alive && u.side === 'fleet');
  const S = sim.list().find(u => u.type === 'tel' && u.alive && u.side === 'coast');
  const PZ = sim.list().find(u => u.type === 'pantsir' && u.alive && u.side === 'coast');
  const keep = { sm6: ['sm6', 'ciws'], leak: [], ciws: ['ciws'], salvo: ['sm6', 'ciws'], stream: [] }[kind] || [];
  D.hp = D.hpMax = o.hp || 1e6;
  for (const k in D.ammo) if (!keep.includes(k)) D.ammo[k] = 0; else D.ammo[k] = Math.max(D.ammo[k], 8);
  if (D.def.sensors.radar) sim.setRadar(D, true, true);
  const out = [];
  if (kind === 'pantsir' && PZ) {
    // a round from the sea at the Pantsir's own position
    PZ.hp = PZ.hpMax = 1e6;
    for (const k in PZ.ammo) PZ.ammo[k] = Math.max(PZ.ammo[k], 8);
    if (PZ.def.sensors && PZ.def.sensors.radar) sim.setRadar(PZ, true, true);
    const ang = o.ang !== undefined ? o.ang : Math.atan2(D.pos[0] - PZ.pos[0], D.pos[2] - PZ.pos[2]);
    const dist = o.from || 9000;
    const ox = PZ.pos[0] + Math.sin(ang) * dist, oz = PZ.pos[2] + Math.cos(ang) * dist, hdg = Math.atan2(PZ.pos[0] - ox, PZ.pos[2] - oz);
    D.ammo._lab = 99;
    const P = launch(sim, D, { proj: o.round || 'uran', name: '_lab', range: dist * 2, cd: 0 }, PZ.id, 'unit', PZ.pos);
    if (P) {
      const h0 = o.h || Math.max(40, game.ground(PZ.pos[0], PZ.pos[2]) + 60, game.ground(ox, oz) + 40);
      P.pos[0] = P.prev[0] = ox; P.pos[1] = P.prev[1] = h0; P.pos[2] = P.prev[2] = oz;
      P.hdg = hdg; P.pitch = 0; P.age = 30; P.spd = P.P.speed; P.phase = 'cruise'; P.sep = true; if (P.st) P.st.booster = false;
      P.fromPos = [ox - Math.sin(hdg) * 20000, 0, oz - Math.cos(hdg) * 20000];
      P.aim[0] = PZ.pos[0]; P.aim[1] = h0; P.aim[2] = PZ.pos[2];
      P.vel[0] = Math.sin(hdg) * P.spd; P.vel[1] = 0; P.vel[2] = Math.cos(hdg) * P.spd;
      P.spd0 = P.spd; P.t0 = sim.t - 30;
      P.P = Object.assign({}, P.P, { ign: 0, boost: 0, sus: null, vert: 0, drop: 0, v0: P.P.speed });
      out.push(P);
    }
    sim.drainEvents();
    game.setRate(o.rate || 1);
    return { pantsir: PZ.id, rounds: out.map(p => p.id) };
  }
  const threat = kind === 'ciws' ? 'uran' : 'oniks';
  const from = o.from || { sm6: 30000, leak: 9000, ciws: 7000, salvo: 32000, stream: 9000 }[kind];
  const ang = o.ang !== undefined ? o.ang : 2.2;
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
  out.push(mk(from, 15, ang));
  if (kind === 'stream') for (let i = 1; i < (o.n || 3); i++) out.push(mk(from + 2500 * i, 15, ang + .02 * i));
  if (kind === 'salvo' || kind === 'stream') {
    const at = sim.t + (o.launchAt || 8);
    const off = game.bus.on('frame', () => {
      if (sim.t < at) return;
      off();
      S.ammo._lab2 = 9;
      out.push(launch(sim, S, { proj: 'oniks', name: '_lab2', range: 200000, cd: 0 }, D.id, 'unit', D.pos));
    });
  }
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

/* step `sec` real seconds at `fps` with the camera on (o.mode: the mode); per frame: the eye, the lens direction, the
   shot, the rate. A jolt: the lens's turn rate changing by more than o.jw (25) deg/s in one frame, or the eye's speed by
   more than 30 m/s (and 15 %), on a frame that is not a cut. Cuts are counted apart. */
export function rec(sec = 20, fps = 60, o = {}) {
  const { game, cam, sim } = O();
  const dir = game.getSystem('director');
  if (o.mode) setSetting('cineMode', o.mode);
  if (!dir.on) dir.set(true);
  const dt = 1 / fps, n = Math.round(sec * fps);
  const rows = [], snaps = [], evs = [];
  const onEv = e => { if (['launch', 'intercept', 'hit', 'spinout', 'gunfire', 'breakup', 'destroyed'].includes(e.type) || (e.type === 'splash' && e.air)) evs.push(`${e.type}${e.proj ? ' p' + e.proj : ''}${e.kind ? ' ' + e.kind : ''}`); };
  const offEv = game.bus.on('event', onEv);
  let pe = null, pf = null, pv = null, pw = 0, last = '', maxO = 0, sumJ = 0, cuts = 0, lastShot = null, seenSubj = 0, subjFrames = 0;
  const t0 = performance.now(), q = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    evs.length = 0;
    if (o.stills && o.stills.length && i * dt >= o.stills[0]) { const ts = o.stills.shift(); O().shot(`${o.name || 'cine'}_${ts.toFixed(1)}s`); }
    O().advance(dt, 1);
    const e = cam.eye.slice(), f = cam.f.slice();
    const sh = dir.shot;
    const cut = sh && sh !== lastShot && sh.cutIn;
    if (sh !== lastShot) { if (cut) cuts++; lastShot = sh; }
    const key = (game.replay && game.replay.active ? 'REPLAY ' : '') + (sh ? sh.kind + ':' + (sh.id || sh.unit || sh.tgt || '') + (sh.var ? ':' + sh.var : '') : '-');
    const T = (i * dt).toFixed(2);
    for (const x of evs) rows.push(`${T}s   * ${x}`);
    if (key !== last) { rows.push(`${T}s ${key}${cut ? ' CUT' : ''} x${game.timeRate.toFixed(2)}`); last = key; }
    // the subject on screen
    if (sh && sh.subj) { subjFrames++; const r = cam.project(sh.subj, q); if (r && r[0] > 0 && r[1] > 0 && r[0] < cam.W && r[1] < cam.H) seenSubj++; }
    if (pe && !cut) {
      const v = [(e[0] - pe[0]) / dt, (e[1] - pe[1]) / dt, (e[2] - pe[2]) / dt];
      const c = Math.max(-1, Math.min(1, f[0] * pf[0] + f[1] * pf[1] + f[2] * pf[2]));
      const w = Math.acos(c) / dt * 180 / Math.PI;
      if (pv && i > 3) {
        const dw = Math.abs(w - pw), dv = Math.hypot(v[0] - pv[0], v[1] - pv[1], v[2] - pv[2]), sp = Math.hypot(v[0], v[1], v[2]);
        if (dw > (o.jw || 25) || (dv > 30 && dv > .15 * sp)) snaps.push(`${T}s dw ${dw.toFixed(0)} (w ${w.toFixed(0)}) dv ${dv.toFixed(0)} (v ${sp.toFixed(0)}) ${key}`);
        sumJ += dw; maxO = Math.max(maxO, w);
      }
      pv = v; pw = w;
    } else if (cut) { pv = null; }
    pe = e; pf = f;
    if (o.log && i % Math.round(fps * (o.log || 1)) === 0) rows.push(`${T}s   x${game.timeRate.toFixed(2)} eye h${Math.round(e[1])} w ${pw.toFixed(1)} d ${Math.round(dir.lookDist)}`);
  }
  if (offEv) offEv();
  return { ms: +((performance.now() - t0) / n).toFixed(1), meanDw: +(sumJ / n).toFixed(2), maxW: Math.round(maxO), cuts, subjOnScreen: subjFrames ? +(seenSubj / subjFrames).toFixed(2) : null,
    nSnaps: snaps.length, snaps: snaps.slice(0, 30), shots: rows };
}

/* save the next frame (with the overlay) as game/shots/<name>.png */
export function shot(name) { return O().shot(name); }
