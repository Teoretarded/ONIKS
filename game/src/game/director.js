/* Cinematic camera (C): an auto-director that follows the most interesting thing happening and flies the camera
   like the films: a launch seen from the side as the round climbs, the round chased from just behind in flight,
   the target framed across the line of approach for the last seconds and the hit, a sinking ship orbited low,
   an intercept; between them a slow orbit over the force. Every change of subject is a blended move (the camera
   glides from where it is onto the moving subject, pulling back on long moves): no cuts. Any camera input
   (WASD / arrows / Q E / PageUp / PageDown, wheel, right or middle drag) hands the camera back. */
import { PRI } from './game.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const wrapPi = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);
const HERO = { oniks: 10, tlam: 8, slam: 7, sm6: 6, hellfire: 4, pdms: 4, sam: 4, aam: 3, shell: 0 };

export function createDirector(game) {
  const { sim, R } = game, cam = R.camera;
  let on = false;
  let shot = null;             // { kind, id | unit, t0, until, blend, ... }
  let lastPick = -99, edgeWas = true;
  const recent = [];           // interesting events: { kind, pos, t, w, unit, seen }
  const des = { T: [0, 0, 0], dist: 300, yaw: 0, pitch: .2 };
  const cur = [0, 0, 0];

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v; game.cinematic = on;
    shot = null; lastPick = -99;
    // the screen edges do not pan while the director flies (a resting mouse would fight it)
    if (on) { edgeWas = cam.edge; cam.edge = false; }
    else { cam.edge = edgeWas; cam.follow(null); cam.fly = null; }
    game.bus.emit('cinematic', { on });
  }

  /* ---------- choosing what to watch ---------- */
  function visibleProj(p) { return p.alive && sim.projVisible(game.side, p); }
  function projScore(p) {
    const P = p.P || game.PROJ[p.kind];
    let s = HERO[p.kind] || 1;
    if ((p.age || 0) < 9) s += 6;                  // the launch and the booster
    const tgt = p.tk === 'unit' ? sim.units.get(p.target) : null;
    if (tgt && Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[2] - p.pos[2]) < 8000) s += 8;   // the hit is coming
    if (P && P.threat && p.side !== game.side) s += 2;
    return s;
  }
  function pick() {
    lastPick = game.realT;
    // stay with the round we are on until it is gone (a long chase may give way to something new)
    if (shot && (shot.kind === 'launch' || shot.kind === 'chase')) {
      const p = sim.projectiles.get(shot.id);
      if (p && p.alive && (game.realT - shot.t0 < 30 || shot.kind === 'launch')) return;
    }
    if ((shot && (shot.kind === 'terminal' || shot.kind === 'site')) && game.realT < shot.until) return;
    let best = null, bs = 0;
    for (const p of sim.projectiles.values()) {
      if (!visibleProj(p)) continue;
      const s = projScore(p);
      if (s > bs) { bs = s; best = p; }
    }
    let ev = null, es = 0;
    for (const e of recent) {
      const age = sim.t - e.t;
      if (age > 30 || e.seen) continue;
      const s = e.w - age * .15;
      if (s > es) { es = s; ev = e; }
    }
    if (best && bs >= 6 && (!ev || bs > es)) { startProj(best); return; }
    if (ev) { ev.seen = true; startEvent(ev); return; }
    if (!shot || game.realT > shot.until) startIdle();
  }
  function blendFrom(dur) {
    return { t0: game.realT, dur, from: { T: cam.target.slice(), dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch }, bump: 0 };
  }
  function startProj(p) {
    shot = { kind: (p.age || 0) < 7 ? 'launch' : 'chase', id: p.id, t0: game.realT, until: game.realT + 90, side: p.id % 2 ? 1 : -1 };
    shot.blend = blendFrom(1.8);
  }
  function startEvent(e) {
    const u = e.unit ? sim.units.get(e.unit) : null;
    shot = { kind: 'site', unit: u ? u.id : 0, pos: e.pos.slice(), t0: game.realT, until: game.realT + (u && u.def.domain === 'sea' ? 18 : 9), L: u ? u.def.size[0] : 60, yaw0: cam.yaw + .5 };
    shot.blend = blendFrom(2.4);
  }
  function startIdle() {
    const own = sim.alive(game.side).filter(u => !u.aboard);
    const tracks = sim.list().filter(u => u.alive && u.side !== game.side && !u.aboard && game.vis(u) === 'track');
    const pool = !own.length ? tracks : tracks.length && Math.floor(game.realT / 25) % 2 ? tracks : own;
    if (!pool.length) return;
    const u = pool[Math.floor(game.realT * 7.31) % pool.length];
    shot = { kind: 'orbit', unit: u.id, t0: game.realT, until: game.realT + 24, L: Math.max(u.def.size[0], 12), yaw0: cam.yaw };
    shot.blend = blendFrom(3);
  }

  /* ---------- where the camera wants to be for the shot ---------- */
  function desired() {
    const t = game.realT;
    if (shot.kind === 'launch' || shot.kind === 'chase') {
      const p = sim.projectiles.get(shot.id);
      if (!p || !p.alive) return false;
      const pp = game.projPose(p), v = p.vel || [0, 0, 0], spd = Math.hypot(v[0], v[1], v[2]);
      des.T[0] = pp.pos[0]; des.T[1] = pp.pos[1]; des.T[2] = pp.pos[2];
      if (shot.kind === 'launch' && (p.age || 0) > 9) { shot.kind = 'chase'; shot.blend = blendFrom(2.2); }
      const tgt = p.tk === 'unit' ? sim.units.get(p.target) : null;
      const dT = tgt ? Math.hypot(tgt.pos[0] - pp.pos[0], tgt.pos[2] - pp.pos[2]) : 1e9;
      if (shot.kind === 'chase' && tgt && game.vis(tgt) && dT < Math.max(2500, spd * 3.6)) {
        // the last seconds: frame the target across the line of approach, the round coming in
        shot.kind = 'terminal'; shot.tgt = tgt.id; shot.appr = pp.hdg; shot.until = t + 30;
        shot.blend = blendFrom(clamp(dT / Math.max(spd, 1) * .55, .8, 2));
        return desired();
      }
      if (shot.kind === 'launch') { des.yaw = pp.hdg + Math.PI / 2 * shot.side; des.pitch = 4 * DEG; des.dist = Math.max(120, 50 + (p.age || 0) * 40); }
      else { des.yaw = pp.hdg + .38 * shot.side; des.pitch = (pp.pitch < -.2 ? 14 : 8) * DEG; des.dist = spd > 600 ? 30 : 22; }
      return true;
    }
    if (shot.kind === 'terminal') {
      const u = sim.units.get(shot.tgt);
      if (!u) return false;
      const up = game.unitPose(u).pos;
      des.T[0] = up[0]; des.T[1] = up[1] + u.def.size[2] * .2; des.T[2] = up[2];
      des.yaw = shot.appr + 1.25 * shot.side + (t - shot.t0) * .02; des.pitch = 6 * DEG; des.dist = Math.max(u.def.size[0] * 2.6, 240);
      const p = sim.projectiles.get(shot.id);
      if ((!p || !p.alive) && !shot.after) { shot.after = t; shot.until = t + 9; }
      return true;
    }
    if (shot.kind === 'site' || shot.kind === 'orbit') {
      const u = shot.unit ? sim.units.get(shot.unit) : null;
      const pos = u ? game.unitPose(u).pos : shot.pos;
      if (!u && shot.kind === 'orbit') return false;
      des.T[0] = pos[0]; des.T[1] = pos[1]; des.T[2] = pos[2];
      des.yaw = shot.yaw0 + (t - shot.t0) * (shot.kind === 'site' ? .06 : .035);
      des.pitch = (shot.kind === 'site' ? 10 : 14) * DEG;
      des.dist = shot.kind === 'site' ? Math.max(260, shot.L * 3.2) : Math.max(90, shot.L * 7);
      return true;
    }
    return false;
  }

  /* put the camera there: blended from where the shot began, then held (angles smoothed, position pinned) */
  function apply(dt) {
    const B = shot.blend;
    let T = des.T, dist = des.dist, yaw = des.yaw, pitch = des.pitch;
    if (B) {
      const u = clamp((game.realT - B.t0) / B.dur, 0, 1), s = ease(u);
      if (!B.bump) { const travel = Math.hypot(des.T[0] - B.from.T[0], des.T[2] - B.from.T[2]); B.bump = Math.max(1e-6, Math.log(1 + travel / (B.from.dist + des.dist)) * .9); }
      for (let k = 0; k < 3; k++) cur[k] = B.from.T[k] + (des.T[k] - B.from.T[k]) * s;
      T = cur;
      dist = Math.exp(Math.log(B.from.dist) + (Math.log(des.dist) - Math.log(B.from.dist)) * s + B.bump * Math.sin(Math.PI * s));
      yaw = B.from.yaw + wrapPi(des.yaw - B.from.yaw) * s;
      pitch = B.from.pitch + (des.pitch - B.from.pitch) * s;
      if (u >= 1) shot.blend = null;
      cam.yaw = cam.goal.yaw = yaw; cam.pitch = cam.goal.pitch = pitch; cam.dist = cam.goal.dist = dist;
    } else {
      const g = cam.goal, k = Math.min(1, dt * 2.5);
      g.yaw += wrapPi(yaw - g.yaw) * k; g.pitch += (pitch - g.pitch) * k;
      g.dist = Math.exp(Math.log(g.dist) + (Math.log(dist) - Math.log(g.dist)) * k);
    }
    cam.fly = null;
    cam.followFn = () => T; cam.followOff = [0, 0, 0];
    for (let k = 0; k < 3; k++) cam.goal.target[k] = cam.target[k] = T[k];
  }

  return {
    name: 'director', priority: PRI.director,
    set, get on() { return on; }, get shot() { return shot; },
    onKey(e) {
      if (e.type !== 'keydown') return false;
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) { set(!on); game.bus.emit('toast', { text: on ? 'CINEMATIC' : 'CINEMATIC OFF' }); return true; }
      if (on && e.code === 'Escape') { set(false); return true; }
      if (on && CAM_KEYS.has(e.code)) set(false);   // the camera takes it from here
      return false;
    },
    onPointer(ev) {
      if (!on) return false;
      if ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel') set(false);
      return false;
    },
    onEvent(e) {
      const t = e.t;
      let rec = null;
      if (e.type === 'hit') rec = { kind: 'hit', pos: e.pos, t, w: 9, unit: e.target };
      else if (e.type === 'destroyed') { const u = sim.units.get(e.unit); rec = { kind: 'destroyed', pos: e.pos, t, w: u && u.def.domain === 'sea' ? 12 : 8, unit: e.unit }; }
      else if (e.type === 'intercept') rec = { kind: 'intercept', pos: e.pos, t, w: 5 };
      if (!rec) return;
      if (rec.unit) { const u = sim.units.get(rec.unit); if (u && !game.vis(u)) return; }   // only what the player may see
      // the hit we are already framing is not a new subject
      if (shot && shot.kind === 'terminal' && rec.unit === shot.tgt) rec.seen = true;
      recent.push(rec);
      if (recent.length > 24) recent.splice(0, recent.length - 24);
    },
    update(dt) {
      if (!on) return;
      if (game.realT - lastPick > .6 || !shot || game.realT > shot.until) pick();
      if (!shot) return;
      if (!desired()) { shot = null; lastPick = -99; pick(); if (!shot || !desired()) return; }
      apply(dt);
    },
    draw2d(ov) {
      if (!on || game.getSystem('hud')) return;
      ov.text(ov.W - 24, 30, 'CINEMATIC · C', { size: 10.5, col: '#C6F432', align: 'right' });
    },
  };
}
