/* Cinematic camera (C): an auto-director that frames the action the way the films do (Engagement, Aegis, Salvo,
   Scale · Strike). With rounds selected (game/select.js: click or box them) C and B hand it those rounds:
   director.watch(ids, i) keeps the shots to them (the i-th first; B: bullet time on them). bus 'watch' { ids, id }.

   One subject at a time, chosen from a scored list of candidates (re-scored five times a second):
     launch     a heavy round or an interceptor just off the rail          68, fading with its age (a fresh launch beats
                                                                               a round already cruising; one per launcher
                                                                               per 14 s)
     intercept  an interceptor on its way to a round, time to go < 8 s     60-90, rising as it closes
     gun        a gun about to fire or firing at a round, < 8 s            58-88
     impact     a round about to hit its target with nothing in its way    56-88
     chase      any round worth watching                                  20-35 (its weight, whose it is)
     site       something seen after the fact (a kill, a hit)              14+
   minus the cost of the move (the distance from the camera). The shot on screen holds its subject (+12), for at least
   3 s (1.2 s for something about to happen), and through its own moment: under 3.5 s to its event nothing takes it
   away; its consequence (the break-up, the hit) is locked in for 3-4 s. Times are real seconds at the player's rate,
   so the cut to an intercept or an impact comes before the event, with the glide done in time.
   Intercepts rotate their angle: riding with the incoming round (~75 m off; as the interceptor closes the camera comes
   round to the far side of the round from it, so it comes at the lens past the round), riding with the interceptor
   (the round ahead in the frame), or still beside the predicted meet point (a long lens on the round coming in,
   opening as it arrives; taken only for the last 5 s, riding with the round before); a gun engagement is seen from
   over the mount's shoulder (Phalanx / 30 mm, a longer lens) two times in three, else from beside the round. A long
   engagement changes its angle after 9 s. An interceptor that misses hands the shot back to the round; one that hits
   hands it to the break-up (the old camera carried on with the pieces, so the move never swings past them).
   The shots themselves: director/shots.js; the camera and its glides (anchor + springs, quintic cross-fades from
   wherever the camera is, no cuts, nothing followed once it is gone): director/rig.js.

   Time (director/pace.js): the cinematic eases the rate down ahead of each intercept (x0.2), gun burst (x0.25) and
   impact (x0.3), holds it through the moment and the break-up, and eases back; a launch it watches runs at x0.5 for a
   moment. The rate is always on screen (render.js with the interface off). B (bullet time on selected rounds) goes to
   x0.1 for each of their moments. Presentation only: the sim never changes.
   Hand-over: any camera input (WASD / arrows / Q E / PageUp / PageDown, wheel, right or middle drag) hands the camera
   back; C again resumes. While the hit replay (replay.js) has the camera the director waits, then glides on from
   where the replay left it. createDirector returns [director, replay] (the replay loads with it; see replay.js).
   The rig helpers the replay uses (lookFrom, putCam, acrossView, ...) are re-exported from director/rig.js. */
import { PRI } from './game.js';
import { createPace } from './director/pace.js';
import { predict, newPrediction } from './director/predict.js';
import { createRig, DEG, clamp, ss, wrapPi, newPose, lookFrom, putCam } from './director/rig.js';
import { createShots } from './director/shots.js';
export { DEG, clamp, sat, ss, ease, wrapPi, newPose, lookFrom, eyeOf, fitDist, camState, bumpOf, glideDur, blendPose, putCam, blockedBy, hullCorners, acrossView } from './director/rig.js';

const TAU = Math.PI * 2;
const FAR = 1e9;
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);
/* how much a round is worth watching */
const HERO = { oniks: 10, kalibr: 9, tlam: 8, uran: 7, slam: 7, sm6: 5, hellfire: 4, pdms: 3, sam: 3, aam: 3, shell: 0 };
/* how much a unit is worth watching */
const RANK = { carrier: 10, hq: 9, cg: 8, ddg: 8, lcs: 6, tel: 6, s400: 5, radar: 5, s400r: 5, pantsir: 4, bereg: 4, transloader: 3, helo: 2, fighter: 2, catapult: 1, drone: 1 };
/* the rate the cinematic eases to for each moment */
const SLOW = { intercept: .2, gun: .25, impact: .3 };
const EVENT_SHOTS = { intercept: 1, gun: 1, impact: 1 };

export async function createDirector(game, ctx) {
  const dir = makeDirector(game);
  let rep = null;
  try { const m = await import('./replay.js'); rep = await m.createReplay(game, ctx); } catch (e) { console.error('director: hit replay unavailable', e); }
  return rep ? [dir, rep] : dir;
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function makeDirector(game) {
  const { sim, R } = game, cam = R.camera;
  const pace = createPace(game);
  const rig = createRig(game);
  const S = createShots(game);
  let on = false, shot = null, lastPick = -99, edgeWas = true, waiting = false;
  const recent = [];           // things that happened: { kind, pos, t, w, unit, proj, seen }
  const gone = new Map();      // round id -> { why: 'intercept' | 'hit' | 'gun' | 'burst' | 'splash', pos, t, target }
  const shown = new Map();     // launcher id -> real t of the last launch shown from it
  let lastKill = null, lastHq = null, final = null;
  let pin = null;              // the player's own rounds: { ids, i, lock (real t: a manual choice holds), bullet }
  let uiWas = false, uiOurs = false, nVar = 0, nGun = 0, nImp = 0, launchNext = 0;
  const PX = newPrediction();
  const CANDS = Array.from({ length: 160 }, () => ({ type: '', key: '', id: 0, q: 0, unit: 0, t: 0, s: 0, urgent: false, ev: null }));
  let nC = 0;
  const pose = newPose(), VIEW = { eye: [0, 0, 0], look: [0, 0, 0], near: undefined, fov: undefined };
  const lastP = [0, 0, 0], lastV = [0, 0, 0], drift = [0, 0, 0];
  let fk = 1;
  const follow = () => pose.T;

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v; game.cinematic = on;
    shot = null; lastPick = -99;
    if (on) rig.reset();
    if (!on && pin) { pin = null; game.bus.emit('watch', { ids: [] }); }
    if (!on && pace.active) pace.stop(pace.owner === 'bullet');
    // the screen edges do not pan while the director flies (a resting mouse would fight it)
    if (on) { edgeWas = game.replay && game.replay.state && game.replay.state.edge0 !== undefined ? game.replay.state.edge0 : cam.edge; cam.edge = false; }
    else { cam.edge = edgeWas; cam.view = null; if (!(game.replay && game.replay.active)) { cam.follow(null); cam.fly = null; } }
    // the interface steps back while the director has the picture (as H / F10 would): the shot reads; only the rate
    // and the mode stay on screen (draw2d). Not at the end of the match (the end screen is interface).
    if (on) { uiWas = game.ui.hidden; if (!uiWas && !game.result) { game.setUiHidden(true); uiOurs = true; } }
    else if (uiOurs) { uiOurs = false; if (game.ui.hidden && !uiWas) game.setUiHidden(false); }
    game.bus.emit('cinematic', { on });
  }

  /* ---------- what the player may watch ---------- */
  const seen = u => { const v = u && game.vis(u); return v === 'own' || v === 'track'; };
  const heroOf = p => HERO[p.kind] || 1;
  const launchAge = p => { const P = p.P || game.PROJ[p.kind] || {}; return clamp((P.sepAt || P.boost || 4) + 2, 4, 10); };
  const upFrom = p => { const f = p.fromPos || p.pos; return Math.hypot(p.pos[0] - f[0], p.pos[1] - f[1], p.pos[2] - f[2]); };
  /* the player's rate (not the slow motion's own): what "seconds away" means */
  const baseRate = () => Math.max(.1, pace.active ? pace.base : game.timeRate);
  const projAt = id => { const p = sim.projectiles.get(id); return p && p.alive ? p : null; };

  /* ---------- the candidates ---------- */
  function add(type, id, q, unit, t, s, urgent) {
    if (nC >= CANDS.length) return;
    const c = CANDS[nC++];
    c.type = type; c.id = id; c.q = q; c.unit = unit; c.t = t; c.s = s; c.urgent = urgent; c.ev = null;
    c.key = type === 'site' ? 'site:' + unit : type + ':' + id;
  }
  function gather() {
    nC = 0;
    const base = baseRate(), E = rig.E, now = game.realT;
    const only = pin && now < pin.lock ? pin.ids[pin.i] : 0;
    for (const p of sim.projectiles.values()) {
      if (!p.alive || !sim.projVisible(game.side, p)) continue;
      const h = heroOf(p); if (h < 3) continue;
      if (pin && !pin.ids.includes(p.id)) continue;
      if (only && p.id !== only) continue;
      const r = predict(game, p, PX), P = game.projPose(p).pos;
      const far = Math.log(1 + dist3(E, P) / 1500);
      const tu = p.tk === 'unit' ? sim.units.get(p.target) : null;
      const bonus = (tu && tu.side === game.side ? 3 : 0) + (p.side === game.side ? 1 : 0) + (tu && (tu.def.domain === 'sea' || tu.def.hq) ? 1 : 0);
      // a fresh launch (one per launcher per 14 s: the rest of a salvo is not a new moment)
      const age = p.age || 0, la = launchAge(p);
      if (h >= 5 && age < la && upFrom(p) < 700 && p.fromPos) {
        let s = 68 - 12 * age / la + bonus - 2 * far;
        const last = shown.get(p.from);
        if (last !== undefined && now - last < 14) s -= 26;
        // too far to get there while it is still a launch (the glide takes its time)
        const d = dist3(E, p.fromPos), glide = Math.min(2.4, .75 + .5 * Math.log(1 + d / 150));
        if ((age + glide * base) > la * .8) s -= 24;
        add('launch', p.id, 0, p.from || 0, FAR, s, age < la * .6);
      }
      // an interceptor on its way
      if (r.kind === 'intercept') {
        const t = r.tEv / base;
        if (t < 8) add('intercept', p.id, r.qId, 0, t, 60 + 30 * ss(8, 2.5, t) + bonus + h * .5 - 5 * far, t < 5);
      }
      // a gun about to fire at it, or firing
      const tg = Math.min(r.kind === 'gun' ? r.tEv : FAR, r.gunSoon);
      if (tg < FAR) {
        const t = tg / base, gu = r.kind === 'gun' && r.tEv <= r.gunSoon ? r.gunUnit : r.gunSoonUnit;
        if (t < 8 && gu) add('gun', p.id, 0, gu, t, 58 + 30 * ss(8, 2, t) + bonus + h * .5 - 5 * far, t < 5);
      }
      // about to hit its target, nothing in its way
      if (tu && tu.alive && !tu.aboard && seen(tu) && r.tImpact < FAR) {
        const t = r.tImpact / base, blocked = r.tEv < r.tImpact - .3 || r.gunSoon < r.tImpact - .3;
        if (t < 9 && !blocked) add('impact', p.id, 0, tu.id, t, 56 + 32 * ss(9, 2.5, t) + bonus + h * .5 - 5 * far, t < 5);
      }
      add('chase', p.id, 0, 0, FAR, 20 + h * 1.5 + bonus + (p.ctrl === false ? 6 : 0) - 5 * far, false);
    }
    // what happened recently, not seen
    if (!pin) for (let i = 0; i < recent.length; i++) {
      const e = recent[i]; if (e.seen) continue;
      const age = sim.t - e.t; if (age > 40) continue;
      add('site', 0, 0, i, FAR, 14 + e.w - age * .3 - 3 * Math.log(1 + dist3(E, e.pos) / 1500), false);
    }
  }

  /* ---------- choosing ---------- */
  function pick() {
    lastPick = game.realT;
    const now = game.realT;
    if (final) { if (!shot || shot.kind !== 'death' || !shot.final) startDeath(final, true); return; }
    if (shot && now < shot.lock) return;
    // the watched rounds: when none is left (and nothing of theirs is still playing out) let go
    if (pin && !pin.ids.some(id => projAt(id)) && !(shot && (shot.kind === 'break' || shot.kind === 'after') && now < shot.until)) {
      const wasBullet = pin.bullet;
      pin = null; game.bus.emit('watch', { ids: [] });
      if (wasBullet && pace.active && pace.owner === 'bullet') pace.finish();
    }
    gather();
    let cur = null, best = null;
    for (let i = 0; i < nC; i++) {
      const c = CANDS[i];
      if (shot && c.key === shot.key) cur = c;
      else if (!best || c.s > best.s) best = c;
    }
    if (!shot) { if (!best || !startCand(best)) startIdle(); return; }
    // an intercept saved for the meet point: the move there, with the time for it
    if (cur && shot.kind === 'intercept' && shot.then && shot.ev < FAR && shot.ev / baseRate() < 5) { startCand(cur, shot.then); return; }
    // the shot's own moment: stay through it
    if (cur && EVENT_SHOTS[shot.kind] && shot.hot && shot.ev < FAR && shot.ev / baseRate() < 3.5) return;
    const age = now - shot.t0;
    // a long engagement (a gun firing burst after burst, an interceptor still far out) changes its angle now and then
    if (cur && (cur.type === 'gun' || cur.type === 'intercept') && age > 9 && !(best && best.s > cur.s + 20)) { startCand(cur); return; }
    let keep;
    if (cur) keep = cur.s + 12;
    else if (shot.kind === 'launch' && !shot.done && projAt(shot.id)) keep = 60;
    else if ((shot.kind === 'after' || shot.kind === 'site' || shot.kind === 'death' || shot.kind === 'break') && now < shot.until) keep = 24;
    else if (shot.kind === 'idle' && now < shot.until) keep = 6;
    else keep = -FAR;                      // nothing left in this shot
    // a fresh launch takes the picture from a round in cruise (or a quiet moment) at once
    const quiet = shot.kind === 'chase' || shot.kind === 'idle' || shot.kind === 'site';
    const soon = best && best.urgent && (age > 1.2 || (best.type === 'launch' && quiet && age > .4));
    if (best && best.s > keep + 8 && (keep === -FAR || age > 3 || soon)) { if (startCand(best)) return; }
    if (keep === -FAR) { if (!best || !startCand(best)) startIdle(); }
  }

  /* a new shot: glide into it from wherever the camera is (the old camera carried on with its subject while it lasts) */
  function begin(sh, from) {
    rig.glide(from !== undefined ? from : shot ? shot.anchor : null, { lead: sh.kind === 'gun' ? .7 : .8, max: sh.kind === 'launch' ? 2.4 : 3.2 });
    shot = sh;
    // the watched rounds: say which one the camera is on now (select.js marks it)
    if (pin && sh.id && pin.ids[pin.i] !== sh.id && pin.ids.includes(sh.id)) {
      pin.i = pin.ids.indexOf(sh.id);
      game.bus.emit('watch', { ids: pin.ids.slice(), id: sh.id });
    }
    return true;
  }
  /* the side of a round's line the camera is on now (the move stays on its side) */
  function sideOf(P, v) {
    const h = Math.hypot(v[0], v[2]) || 1, rx = v[2] / h, rz = -v[0] / h;
    return (rig.E[0] - P[0]) * rx + (rig.E[2] - P[2]) * rz >= 0 ? 1 : -1;
  }
  /* which side of a line the camera goes: the one it is on now, over water if it can */
  function sideFor(yawA, yawB, P, d) {
    let best = 1, bs = 1e9;
    const cy = Math.atan2(P[0] - rig.E[0], P[2] - rig.E[2]);
    for (const s of [1, -1]) {
      const yaw = s > 0 ? yawA : yawB;
      const ex = P[0] - Math.sin(yaw) * d, ez = P[2] - Math.cos(yaw) * d;
      let c = Math.abs(wrapPi(yaw - cy)) * .6;
      const h = game.ground(ex, ez); if (h > .5) c += 1 + h / 60;
      if (c < bs) { bs = c; best = s; }
    }
    return best;
  }
  function startCand(c, vOver) {
    const now = game.realT;
    if (c.type === 'site') {
      const e = recent[c.unit]; if (!e) return false;
      e.seen = true;
      const u = e.unit ? sim.units.get(e.unit) : null;
      if (e.kind === 'destroyed' && u) startDeath({ unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea' }, false);
      else startSite(e.pos, u, e.kind === 'intercept' ? 6 : 9);
      return true;
    }
    const p = projAt(c.id); if (!p) return false;
    const P = game.projPose(p).pos, v = p.vel || [0, 0, 1];
    const base = { key: c.key, id: c.id, lock: now + 2, side: sideOf(P, v) };
    if (c.type === 'launch') {
      const f0 = p.fromPos || P, aim = p.aim ? Math.atan2(p.aim[0] - f0[0], p.aim[2] - f0[2]) : Math.atan2(v[0], v[2]);
      const lu = sim.units.get(p.from), Lu = lu ? lu.def.size[0] : 12;
      base.side = sideFor(aim - Math.PI / 2, aim + Math.PI / 2, f0, clamp(Lu * 1.5 + 110, 120, 360));   // side +1: the eye on the right of the line of fire, looking left
      base.lock = now + 2.5;
      shown.set(p.from, now);
      begin(S.make('launch', base));
      paceLaunch();
      return true;
    }
    if (c.type === 'chase') { base.lock = now + 1.5; base.anchorFn = S.projAnchor(c.id); return begin(S.make('chase', base)); }
    if (c.type === 'intercept') {
      // the angle, in turn: from the incoming round's side, still beside the meet point, from the interceptor
      let V = vOver || api.forceVar || ['threat', 'witness', 'interceptor'][nVar++ % 3];     // forceVar: the lab's
      // still by the meet point only for the last seconds (before that, riding with the round; then the move there)
      if (V === 'witness' && c.t > 5) { base.then = 'witness'; V = 'threat'; }
      base.q = c.q; base.var = V;
      if (V === 'interceptor') { const q = projAt(c.q); if (q) base.side = sideOf(game.projPose(q).pos, q.vel || v); }
      base.anchorFn = V === 'interceptor' ? S.projAnchor(c.q) : V === 'threat' ? S.projAnchor(c.id) : null;
      return begin(S.make('intercept', base));
    }
    if (c.type === 'gun') {
      const u = sim.units.get(c.unit); if (!u) return false;
      // from the mount two times in three, else riding with the round
      if (api.forceGun ? api.forceGun === 'mount' : nGun++ % 3 !== 2) {
        base.unit = u.id; base.weap = gunOf(u);
        base.side = sideMount(u, P);
        base.anchorFn = null;
        const sh = S.make('gun', base);
        sh.anchorFn = sh.anchor = mountAnchor(sh);
        return begin(sh);
      }
      base.q = 0; base.var = 'threat'; base.anchorFn = S.projAnchor(c.id);
      return begin(S.make('intercept', base));
    }
    if (c.type === 'impact') {
      const u = sim.units.get(c.unit); if (!u) return false;
      const T = S.centreOf(u, [0, 0, 0]), appr = Math.atan2(T[0] - P[0], T[2] - P[2]);
      base.tgt = u.id; base.appr = appr; base.hi = (nImp++ & 1) === 1;     // low across the hull, then a little higher: in turn
      base.side = sideFor(appr + 1.2, appr - 1.2, T, u.def.size[0] * 2.5);
      base.anchorFn = S.unitAnchor(u.id);
      return begin(S.make('impact', base));
    }
    return false;
  }
  function gunOf(u) {
    const W = u.def.weapons || {};
    for (const k in W) { const w = W[k]; if (w.gun && w.vs && w.vs.includes('missile')) return w; }
    return {};
  }
  /* the camera on the side of the line of fire it is on now */
  function sideMount(u, P) {
    const A = game.unitPose(u).pos, dx = P[0] - A[0], dz = P[2] - A[2], h = Math.hypot(dx, dz) || 1;
    const s = (rig.E[0] - A[0]) * (dz / h) - (rig.E[2] - A[2]) * (dx / h);
    return s >= 0 ? 1 : -1;
  }
  function mountAnchor(sh) {
    const uA = S.unitAnchor(sh.unit);
    return (out, vel) => {
      if (!uA(out, vel)) return false;
      if (sh.off) { const u = sim.units.get(sh.unit); S.mountAt(u, sh.off, out); }
      return true;
    };
  }

  /* ---------- the consequences: the subject is gone ---------- */
  function ended(sh) {
    const now = game.realT;
    if (sh.kind === 'after') { startSite(sh.A, null, 6); return; }
    if (sh.kind === 'impact' && !(sim.units.get(sh.tgt) || {}).alive) {
      // the target went down before the round arrived (or with it): the place
      const u = sim.units.get(sh.tgt);
      startDeath({ unit: sh.tgt, pos: sh.A.slice(), L: u ? u.def.size[0] : 60, sea: u ? u.def.domain === 'sea' : game.ground(sh.A[0], sh.A[2]) < .5 }, false);
      return;
    }
    if (sh.kind === 'intercept' && (sh.var === 'interceptor' || sh.var === 'witness') && projAt(sh.id)) {
      // the interceptor is gone (missed, burst wide), the round flies on: stay with the round
      const p = projAt(sh.id);
      begin(S.make('intercept', { key: sh.key, id: sh.id, q: 0, var: 'threat', lock: now + 1.5, side: sideOf(game.projPose(p).pos, p.vel), anchorFn: S.projAnchor(sh.id) }), sh.anchor);
      return;
    }
    if (!sh.id) { shot = null; return; }
    const g = gone.get(sh.id);
    if (g && g.why === 'hit') {
      const u = sim.units.get(g.target);
      if (u && !u.aboard) {
        const T = S.centreOf(u, [0, 0, 0]);
        const appr = sh.appr !== undefined ? sh.appr : Math.atan2(T[0] - lastP[0], T[2] - lastP[2]);
        const side = sh.kind === 'impact' ? sh.side : sideFor(appr + 1.2, appr - 1.2, T, u.def.size[0] * 2.5);
        begin(S.make('after', { key: 'after:' + u.id, tgt: u.id, appr, side, lock: now + 3.5, until: now + 10, anchorFn: S.unitAnchor(u.id) }));
        return;
      }
    }
    if (g && g.why === 'burst' && projAt(g.target)) {
      // an interceptor's burst that left its round flying: back to the round
      const q = projAt(g.target);
      begin(S.make('chase', { key: 'chase:' + q.id, id: q.id, lock: now + 1.5, side: sideOf(game.projPose(q).pos, q.vel), anchorFn: S.projAnchor(q.id) }));
      return;
    }
    if (g && (g.why === 'intercept' || g.why === 'gun' || g.why === 'burst' || g.why === 'spin') || (sh.kind !== 'launch' && !g)) {
      const hold = sh.kind === 'gun' || sh.kind === 'impact';
      startBreak(g && g.pos ? g.pos : lastP, lastV, S.lenOf({ kind: sh.pk || '' }) || 6, hold);
      return;
    }
    // into the sea, self-destructed, or a launch that ended: the place briefly, then on
    startSite(lastP, null, 3.5);
  }
  function startBreak(pos, vel, L, hold) {
    const now = game.realT, r = game.paused ? 0 : game.timeRate;
    const off = [rig.E[0] - pos[0], rig.E[1] - pos[1], rig.E[2] - pos[2]], d = Math.hypot(off[0], off[1], off[2]) || 1;
    const sh = S.make('break', { key: 'break', t0s: sim.t, pos: pos.slice(), vel: vel.slice(), c: pos.slice(), L, hold,
      eyeW: rig.E.slice(), fovK: fk, lock: now + 3.2, until: now + 7, spin: shot && shot.side ? shot.side : 1,
      yaw0: Math.atan2(-off[0], -off[2]), pitch0: Math.asin(clamp(off[1] / d, -.3, .8)) });
    sh.Av = [vel[0] * r, vel[1] * r, vel[2] * r];
    sh.anchorFn = sh.anchor = (out, v) => { out[0] = sh.A[0]; out[1] = sh.A[1]; out[2] = sh.A[2]; v[0] = sh.Av[0]; v[1] = sh.Av[1]; v[2] = sh.Av[2]; return true; };
    // the old camera carries on with the pieces (they leave at the round's speed), so the move has no swing past them
    for (let k = 0; k < 3; k++) sh.A[k] = pos[k];
    begin(sh, sh.anchor);
  }
  function startSite(pos, u, dur) {
    const now = game.realT;
    const sh = S.make('site', { key: 'site', unit: u ? u.id : 0, pos: pos.slice(), L: u ? u.def.size[0] : 60,
      sea: u ? u.def.domain === 'sea' : game.ground(pos[0], pos[2]) < .5, yaw0: Math.atan2(pos[0] - rig.E[0], pos[2] - rig.E[2]),
      side: 1, lock: now + 1.5, until: now + dur });
    for (let k = 0; k < 3; k++) sh.A[k] = pos[k];
    begin(sh);
  }
  function startDeath(k, isFinal) {
    const now = game.realT;
    const sh = S.make('death', { key: 'death:' + k.unit, unit: k.unit, pos: k.pos.slice(), L: k.L, sea: k.sea, final: isFinal,
      yaw0: Math.atan2(k.pos[0] - rig.E[0], k.pos[2] - rig.E[2]) + .3, side: 1, lock: now + 4, until: now + (isFinal ? 1e9 : k.sea ? 18 : 10) });
    for (let i = 0; i < 3; i++) sh.A[i] = k.pos[i];
    begin(sh);
  }
  function startIdle() {
    const own = sim.alive(game.side).filter(u => !u.aboard);
    const tracks = sim.list().filter(u => u.alive && u.side !== game.side && !u.aboard && game.vis(u) === 'track');
    const turn = Math.floor(game.realT / 26) % 2;
    let grp = null, L = 12, sea = false, id = 0;
    if (tracks.length && (turn || !own.length)) {
      let lead = tracks[0]; for (const u of tracks) if ((RANK[u.type] || 1) > (RANK[lead.type] || 1)) lead = u;
      grp = tracks.filter(u => Math.hypot(u.pos[0] - lead.pos[0], u.pos[2] - lead.pos[2]) < 8000);
      L = Math.max(...grp.map(u => u.def.size[0])); id = lead.id; sea = lead.def.domain === 'sea';
    } else if (own.length) {
      let lead = own[0]; for (const u of own) if ((RANK[u.type] || 1) > (RANK[lead.type] || 1)) lead = u;
      grp = [lead]; L = Math.max(lead.def.size[0], 12); id = lead.id; sea = lead.def.domain === 'sea';
    }
    if (!grp) { shot = null; return; }
    const c = S.centreOf(sim.units.get(id), [0, 0, 0]);
    let bestYaw = Math.atan2(c[0] - rig.E[0], c[2] - rig.E[2]), bc = 1e9;
    const y0 = bestYaw;
    for (let i = 0; i < 12; i++) {
      const yaw = y0 + i / 12 * TAU, d = Math.max(400, L * 7);
      const h = game.ground(c[0] - Math.sin(yaw) * d, c[2] - Math.cos(yaw) * d);
      const cost = (h > .5 ? 2 + h / 50 : 0) + Math.abs(wrapPi(yaw - y0)) * .25;
      if (cost < bc) { bc = cost; bestYaw = yaw; }
    }
    const now = game.realT;
    const sh = S.make('idle', { key: 'idle:' + id, unit: id, group: grp.map(u => u.id), L, sea, yaw0: bestYaw, side: id % 2 ? 1 : -1, lock: now + 3, until: now + 26 });
    sh.anchorFn = sh.anchor = S.unitAnchor(id);
    begin(sh);
  }
  /* the end screen covers the left of the view: the subject goes right of centre (the menu over a live film) */
  function endShift() {
    if (!game.result) return 0;
    const el = document.querySelector('.oniks-end');
    return el && !el.classList.contains('min') ? .3 : 0;
  }

  /* ---------- the camera ---------- */
  function apply(dt) {
    rig.frame(dt, shot.En, shot.Ln, shot.subj, shot.aOut);
    // the lens: a longer one by a mount, eased
    fk += (shot.fov - fk) * (1 - Math.exp(-dt * 2.5));
    // a hand on the camera: a slow sub-degree drift of the look point
    const t = game.realT, E = rig.E, Lk = rig.L, L = dist3(Lk, E), hk = E[1] < 600 ? 1 : .3;
    const ly = (.0028 * Math.sin(t * .63) + .0018 * Math.sin(t * 1.37 + 1.1)) * hk * L, lx = (.0021 * Math.sin(t * .81 + 2.3) + .0013 * Math.sin(t * 1.9)) * hk * L;
    const fx = (Lk[0] - E[0]) / (L || 1), fz = (Lk[2] - E[2]) / (L || 1), rl = Math.hypot(fx, fz) || 1;
    drift[0] = Lk[0] + fz / rl * lx; drift[1] = Lk[1] + ly; drift[2] = Lk[2] - fx / rl * lx;
    lookFrom(cam, E, drift, pose);
    putCam(cam, pose, follow);
    const f0 = cam.fov0 !== undefined ? cam.fov0 : cam.fov;
    for (let k = 0; k < 3; k++) { VIEW.eye[k] = E[k]; VIEW.look[k] = drift[k]; }
    VIEW.near = shot.near || clamp(L * .02, .3, 10);
    VIEW.fov = fk < .995 ? f0 * fk : undefined;
    cam.view = VIEW;
  }

  /* ---------- the time rate: the cinematic's slow motion, and bullet time (B) ---------- */
  function markEv() { pace.mark(); if (shot) shot.evT = game.realT; }
  const autoOk = () => !(game.result || game.paused || (game.inspect && game.inspect.active) || (game.film && game.film.playing) || (game.replay && game.replay.active) ||
    (game.settings && game.settings.cineSlow === false));
  function paceLaunch() {
    const now = game.realT;
    if (pin && pin.bullet) return;
    if (!autoOk() || pace.active || game.timeRate < .999 || now < launchNext) return;
    pace.start('auto', { slow: .5, hold: 1.3, up: 1.3 });
    pace.mark(1.3); pace.finish();
    launchNext = now + 10;
  }
  /* a gun's burst takes a second or two to reach the round: x0.5 on its way, the slow rate for the hit itself */
  const gunFloor = () => (shot.kind === 'gun' || shot.gunEv) ? .5 : 0;
  function paceFrame() {
    const ev = shot && EVENT_SHOTS[shot.kind] && shot.ev < FAR ? shot.ev : FAR;
    if (pin && pin.bullet) {
      if (!pace.active) { pin.bullet = false; return; }
      if (ev < FAR) pace.feed(ev, shot.kind === 'gun' ? .3 : 0);
      return;
    }
    if (!autoOk()) return;
    if (pace.active) { if (pace.owner === 'auto' && ev < FAR) pace.feed(ev, gunFloor()); return; }
    if (ev >= FAR || game.timeRate < .999) return;
    const b = game.timeRate, lead = b * Math.min(1.8, Math.max(.6, 2 / Math.sqrt(b))) + .3;
    if (ev < lead) {
      pace.start('auto', { slow: SLOW[shot.kind] || .25, hold: 1.8, up: 1.4 });
      pace.feed(ev, gunFloor()); pace.finish();
    }
  }

  const api = {
    name: 'director', priority: PRI.director,
    set, get on() { return on; }, get shot() { return shot; },
    /* the distance to what is framed (the lab's measure of how the motion reads) */
    get lookDist() { return shot && shot.subj ? dist3(rig.E, shot.subj) : dist3(rig.E, rig.L); },
    /* the player's rounds: the cinematic takes them (the i-th first, then whichever's moment comes next); [] lets go */
    watch(ids, i) {
      ids = (ids || []).filter(id => projAt(id));
      const bullet = !!(pin && pin.bullet);
      pin = ids.length ? { ids, i: (i || 0) % ids.length, lock: game.realT + 6, bullet } : null;
      if (pin && !on) set(true);
      if (pin) {
        // straight to the chosen round (its best shot)
        const was = shot; if (shot) shot.lock = 0;
        gather();
        let best = null;
        for (let k = 0; k < nC; k++) { const c = CANDS[k]; if (c.id === ids[pin.i] && (!best || c.s > best.s)) best = c; }
        if (!best || !startCand(best)) shot = was;
      }
      lastPick = game.realT;
      game.bus.emit('watch', { ids: pin ? pin.ids.slice() : [], id: pin ? pin.ids[pin.i] : 0 });
      return !!pin;
    },
    get watching() { return pin ? { ids: pin.ids.slice(), i: pin.i, id: pin.ids[pin.i] } : null; },
    /* bullet time on the watched rounds (select.js, B): the rate eases down before each moment, holds, eases back */
    bullet(v, restore) {
      if (v) {
        if (!pin) return false;
        pin.bullet = true;
        if (!pace.active || pace.owner !== 'bullet') { if (pace.active) pace.stop(false); pace.start('bullet', { slow: .1, hold: 2.4, up: 1.6, keep: true }); }
        return true;
      }
      if (pin) pin.bullet = false;
      if (pace.active && pace.owner === 'bullet') pace.stop(restore);
      return true;
    },
    get bulletOn() { return pace.active && pace.owner === 'bullet'; },
    pace,
    get edgeWas() { return edgeWas; }, set edgeWas(v) { edgeWas = v; },
    /* for the replay: glide on from where the camera is now */
    resync() { shot = null; lastPick = -99; rig.reset(); },
    onKey(e) {
      if (e.type !== 'keydown') return false;
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { set(!on); game.bus.emit('toast', { text: on ? 'CINEMATIC' : 'CINEMATIC OFF' }); return true; }
      if (on && e.code === 'Escape' && !(game.replay && game.replay.active)) { set(false); return true; }
      if (on && CAM_KEYS.has(e.code)) set(false);   // the camera takes it from here
      return false;
    },
    onPointer(ev) {
      if (!on) return false;
      if ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel') set(false);
      return false;
    },
    init() {
      // a break-up (game/debris.js): the moment the intercept already put on the list weighs more; a spin-out or an
      // aircraft coming apart is a moment of its own
      game.bus.on('breakup', b => {
        if (!b || !b.pos) return;
        if (on && shot && shot.id && b.id === shot.id) markEv();
        if (!b.unit && (HERO[b.kind] || 0) < 6) return;      // an interceptor's own end is not a place to go and see
        const r = recent.find(x => x.kind === 'intercept' && Math.abs(x.t - b.t) < .2);
        if (r) r.w = Math.max(r.w, b.w || 7);
        else {
          const rec = { kind: 'intercept', pos: b.pos.slice(), t: b.t, w: b.w || 7, unit: b.unit, seen: !!(shot && shot.id === b.id) || dist3(b.pos, rig.E) < 400 };
          recent.push(rec); if (recent.length > 24) recent.shift();
        }
      });
      game.bus.on('result', () => {
        // the end: the last kill, held (the most important of the last few, the command post first); else the command
        // post or carrier the match was lost with, where it went down
        if (lastKill && sim.t - lastKill.t < 90) final = { unit: lastKill.unit, pos: lastKill.pos.slice(), L: lastKill.L, sea: lastKill.sea, t: lastKill.t };
        else if (lastHq) final = { unit: lastHq.unit, pos: lastHq.pos.slice(), L: lastHq.L, sea: lastHq.sea, t: lastHq.t };
        const busy = (game.inspect && game.inspect.active) || (game.film && game.film.playing);
        if (!busy && !on) set(true);
        else if (on) { if (shot) shot.lock = 0; lastPick = -99; }
      });
    },
    onEvent(e) {
      const t = e.t;
      // how a round ended (the consequence the camera goes to)
      if (e.type === 'intercept' && e.proj) gone.set(e.proj, { why: 'intercept', pos: e.pos, t, target: 0 });
      else if (e.type === 'hit' && e.proj) gone.set(e.proj, { why: 'hit', pos: e.pos, t, target: e.target });
      else if (e.type === 'gunhit' && e.target) gone.set(e.target, { why: 'gun', pos: e.pos, t, target: 0 });
      else if (e.type === 'spinout' && e.proj) gone.set(e.proj, { why: 'spin', pos: e.pos || null, t, target: 0 });
      else if (e.type === 'splash' && e.proj) {
        if (e.air && e.target && (e.why === 'burst' || e.why === 'wide')) {
          // an interceptor's burst: its own end, and what it did to its target
          gone.set(e.proj, { why: 'burst', pos: e.pos, t, target: e.target });
        } else if (!gone.has(e.proj) || gone.get(e.proj).why === 'spin') gone.set(e.proj, { why: 'splash', pos: e.pos, t, target: 0 });
      }
      if (gone.size > 64) for (const [k, g] of gone) if (sim.t - g.t > 15) gone.delete(k);
      // the watched round's moment is now (a burst on it, a hit, an intercept)
      if (on && shot && shot.id) {
        const id = shot.id, q = shot.q || 0;
        if ((e.type === 'intercept' && e.proj === id) || (e.type === 'gunhit' && e.target === id) || (e.type === 'hit' && e.proj === id) ||
          (e.type === 'splash' && e.air && (e.proj === id || e.target === id || (q && e.proj === q)))) markEv();
      }
      let rec = null;
      if (e.type === 'hit') rec = { kind: 'hit', pos: e.pos, t, w: 9, unit: e.target, proj: e.proj };
      else if (e.type === 'destroyed') {
        const u = sim.units.get(e.unit);
        rec = { kind: 'destroyed', pos: e.pos, t, w: u && u.def.domain === 'sea' ? 12 : 8, unit: e.unit };
        if (u && seen(u) || (u && u.side === game.side)) {
          const r = (RANK[u.type] || 1) + (u.def.hq ? 20 : 0);
          if (!lastKill || sim.t - lastKill.t > 30 || r >= lastKill.r) lastKill = { unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea', t: sim.t, r };
          if (u.def.hq) lastHq = { unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea', t: sim.t };
        }
      }
      else if (e.type === 'intercept') rec = { kind: 'intercept', pos: e.pos, t, w: 5 };
      if (!rec) return;
      if (rec.unit) { const u = sim.units.get(rec.unit); if (u && !game.vis(u)) return; }   // only what the player may see
      // the moment the camera is already on is not a new subject
      if (shot && shot.id && (rec.proj === shot.id || (rec.kind === 'intercept' && dist3(rec.pos, lastP) < 600))) rec.seen = true;
      if (shot && rec.unit && (rec.unit === shot.tgt || rec.unit === shot.unit)) rec.seen = true;
      recent.push(rec);
      if (recent.length > 24) recent.splice(0, recent.length - 24);
    },
    update(dt) {
      // the break-up bullet time (debris/slowmo.js) stands aside while this one has the rate
      const bt = game.bulletTime;
      if (bt && bt.want && !bt._dirWrap) { const w0 = bt.want; bt.want = b => pace.active ? false : w0.call(bt, b); bt._dirWrap = true; }
      if (!on) { if (pace.active) pace.update(dt); return; }
      if (game.replay && game.replay.active) { waiting = true; pace.update(dt); return; }
      if (waiting) { waiting = false; shot = null; lastPick = -99; rig.reset(); }
      rig.dt = dt;
      if (game.realT - lastPick > .2 || !shot) pick();
      if (shot) {
        // the subject as it was last seen (for what comes after it)
        const p = shot.id ? projAt(shot.id) : null;
        if (p) {
          const P = game.projPose(p).pos; lastP[0] = P[0]; lastP[1] = P[1]; lastP[2] = P[2];
          if (p.vel) { lastV[0] = p.vel[0]; lastV[1] = p.vel[1]; lastV[2] = p.vel[2]; }
          shot.pk = p.kind;
        }
        if (shot.kind === 'after' || shot.kind === 'site' || shot.kind === 'death') shot.shift = endShift();
        let ok = S.step(shot, dt);
        if (!ok) {
          const old = shot;
          ended(old);
          if (shot === old) { shot = null; pick(); }
          ok = !!shot && S.step(shot, dt);
          if (!ok && shot) { shot = null; startIdle(); ok = !!shot && S.step(shot, dt); }
        }
        if (ok && shot) apply(dt);
      }
      paceFrame();
      pace.update(dt);
    },
    always2d: true,
    draw2d(ov) {
      if (!on || (game.replay && game.replay.active)) return;
      if (!game.ui.hidden && game.getSystem('hud')) return;
      // the interface is off: the rate itself is render.js's (always on screen); under it, the mode
      const K = ov.ui || 1, slow = pace.active && game.timeRate < .99 ? (pace.owner === 'bullet' ? 'BULLET TIME · ' : 'SLOW MOTION · ') : '';
      ov.text(ov.W - 22 * K, 42 * K, slow + 'CINEMATIC · C', { size: 10, col: '#C6F432', a: .75, align: 'right' });
    },
  };
  return api;
}
