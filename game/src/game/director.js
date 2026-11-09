/* Cinematic camera (C): an auto-director with seven modes (director/modes.js; the Settings screen's Camera tab, or
   Shift C for the next one): Director, Chase, Tripod, Showcase, Overview, and two that combine them, Storyteller and
   Duel; or a Mix of any of them, changing at a quiet moment. With rounds selected (game/select.js: click or box them)
   C and B hand it those rounds: director.watch(ids, i) keeps the shots to them (the i-th first; B: bullet time on
   them). bus 'watch' { ids, id }.

   This file is the part every mode shares:
     the world      what is in the air and what is about to happen to it (the scored candidates, below), what
                    happened (recent events, how each round ended), the last kill (the end of the match holds on it)
     the shots      starters for every framing (director/shots.js: chase, launch, intercept, gun, impact, break,
                    after, site, death, idle orbit, tripod, flyby, dolly, crane, wide, two-shot)
     the moves      a new shot either blends from the old one (director/rig.js: the old shot kept live while its
                    subject lasts, else carried with the new anchor or coasting; a quintic ease) or, for a long move,
                    cuts (the Long moves setting: a cut, a dip to dark and back, or always a flight)
     time           the slow motion at each moment (director/pace.js; the Slow motion setting; the mode's own amount)
     the picture    the lens setting, the hand on the camera, the captions (the subject, its speed, its target), the
                    mode and the rate in a corner; the interface steps back while it flies

   Candidates (re-scored five times a second; a mode weighs and frames them its own way):
     launch     a heavy round or an interceptor just off the rail          68, fading with its age (one per launcher per 14 s)
     intercept  an interceptor on its way to a round, time to go < 8 s     60-90, rising as it closes
     gun        a gun about to fire or firing at a round, < 8 s            58-88
     impact     a round about to hit its target with nothing in its way    56-88
     chase      any round worth watching                                  20-35 (its weight, whose it is)
     site       something seen after the fact (a kill, a hit)              14+
   minus the cost of the move (the distance from the camera). Times are real seconds at the player's rate.

   Hand-over: any camera input (WASD / arrows / Q E / PageUp / PageDown, wheel, right or middle drag) hands the camera
   back; C again resumes. While the kill cam (replay.js) has the camera the director waits, then blends on from where
   it left it. createDirector returns [director, replay]. The rig helpers the replay uses are re-exported. */
import { PRI } from './game.js';
import { createPace } from './director/pace.js';
import { predict, newPrediction } from './director/predict.js';
import { createRig, DEG, clamp, ss, wrapPi, newPose, lookFrom, putCam, blockedBy } from './director/rig.js';
import { createShots } from './director/shots.js';
import { createModes } from './director/modes.js';
import { CINE_MODES, CINE_EXPERIMENTAL, setSetting, getSettings } from '../data/settings.js';
import { TRACK } from './labels.js';
export { DEG, clamp, sat, ss, ease, wrapPi, newPose, lookFrom, eyeOf, fitDist, camState, bumpOf, glideDur, blendPose, putCam, blockedBy, hullCorners, acrossView } from './director/rig.js';

const TAU = Math.PI * 2;
const FAR = 1e9;
const CAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'PageUp', 'PageDown']);
/* how much a round is worth watching */
const HERO = { oniks: 10, kalibr: 9, tlam: 8, uran: 7, slam: 7, sm6: 5, hellfire: 4, pdms: 3, sam: 3, aam: 3, shell: 0 };
/* how much a unit is worth watching */
const RANK = { carrier: 10, hq: 9, cg: 8, ddg: 8, lcs: 6, tel: 6, s400: 5, radar: 5, s400r: 5, pantsir: 4, bereg: 4, transloader: 3, helo: 2, fighter: 2, catapult: 1, drone: 1 };
/* the rate the cinematic eases to for each moment (the Slow motion setting's 'normal') */
const SLOW = { intercept: .2, gun: .25, impact: .3, flyby: .3 };
const SLOW_SET = { off: 0, light: .5, normal: 1, strong: .1 };
const EVENT_SHOTS = { intercept: 1, gun: 1, impact: 1, twoshot: 1, tripod: 1, flyby: 1, engage: 1 };
const LENS = { wide: 1.28, normal: 1, long: .7 };
const PACE = { quick: .7, normal: 1, long: 1.45 };
const QUIET_SHOTS = { chase: 1, idle: 1, site: 1, dolly: 1, crane: 1, wide: 1, flyby: 1, tripodq: 1 };

export async function createDirector(game, ctx) {
  const dir = makeDirector(game);
  let rep = null;
  try { const m = await import('./replay.js'); rep = await m.createReplay(game, ctx); } catch (e) { console.error('director: kill cam unavailable', e); }
  return rep ? [dir, rep] : dir;
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function makeDirector(game) {
  const { sim, R } = game, cam = R.camera;
  const pace = createPace(game);
  const S = createShots(game);
  const rig = createRig(game, (sh, dt) => S.step(sh, dt));
  let on = false, shot = null, lastPick = -99, edgeWas = true, waiting = false;
  const recent = [];           // things that happened: { kind, pos, t, w, unit, proj, seen }
  const gone = new Map();      // round id -> { why: 'intercept' | 'hit' | 'gun' | 'burst' | 'splash' | 'spin', pos, t, target }
  const shown = new Map();     // launcher id -> real t of the last launch shown from it
  let lastKill = null, lastHq = null, final = null;
  let pin = null;              // the player's own rounds: { ids, i, lock (real t: a manual choice holds), bullet }
  let uiWas = false, uiOurs = false, launchNext = 0;
  const CANDS = Array.from({ length: 160 }, () => ({ type: '', key: '', id: 0, q: 0, unit: 0, t: 0, s: 0, urgent: false, h: 0 }));
  let nC = 0;
  const pose = newPose(), VIEW = { eye: [0, 0, 0], look: [0, 0, 0], near: undefined, fov: undefined };
  const lastP = [0, 0, 0], lastV = [0, 0, 0], drift = [0, 0, 0];
  const PX = newPrediction();
  let dip = null;              // a dip to dark for a cut: { t, sh, o, cut: done }
  let modeId = 'director', mode = null, mix = { list: [], i: 0, t0: 0 }, modeT0 = 0;
  const follow = () => pose.T;

  /* ---------- the settings this frame ---------- */
  const st = () => game.settings || {};
  const paceK = () => PACE[st().cinePace] || 1;
  const lensK = () => LENS[st().cineLens] || 1;

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v; game.cinematic = on;
    shot = null; lastPick = -99; dip = null;
    if (on) { rig.reset(); chooseMode(true); }
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

  /* ---------- the mode (or the mix's current one) ---------- */
  /* a mode the player may use now: the main ones always, the experimental ones once turned on */
  const usable = k => !!MODES[k] && (!CINE_EXPERIMENTAL.includes(k) || st().cineExperimental === true);
  function mixList() { return String(st().cineMix || '').split(',').filter(usable); }
  function chooseMode(fresh) {
    const m = st().cineMode || 'story';
    let id = m;
    if (m === 'mix') {
      const L = mixList();
      if (!L.length) id = 'director';
      else {
        if (fresh || mix.list.join() !== L.join()) { mix.list = L; mix.i = Math.min(mix.i, L.length - 1); mix.t0 = game.realT; }
        id = L[mix.i % L.length];
      }
    }
    if (!usable(id)) id = 'story';
    if (id !== modeId || !mode || fresh) {
      modeId = id; mode = MODES[id]; modeT0 = game.realT;
      if (mode.enter) mode.enter();
      return true;
    }
    return false;
  }
  function nextMode() {
    if ((st().cineMode || 'story') === 'mix' && mixList().length > 1) {
      mix.i = (mix.i + 1) % mixList().length; mix.t0 = game.realT;
    } else {
      const ids = CINE_MODES.map(m => m[0]).filter(usable), i = ids.indexOf(modeId);
      setSetting('cineMode', ids[(i + 1) % ids.length]);
    }
    chooseMode(false);
    if (shot) shot.lock = 0;
    lastPick = -99;
    game.bus.emit('toast', { text: 'CINEMATIC · ' + modeLabel().toUpperCase() });
  }
  const modeLabel = () => (CINE_MODES.find(m => m[0] === modeId) || ['', 'Director'])[1];

  /* ---------- what the player may watch ---------- */
  const seen = u => { const v = u && game.vis(u); return v === 'own' || v === 'track'; };
  const heroOf = p => HERO[p.kind] || 1;
  const launchAge = p => { const P = p.P || game.PROJ[p.kind] || {}; return clamp((P.sepAt || P.boost || 4) + 2, 4, 10); };
  const upFrom = p => { const f = p.fromPos || p.pos; return Math.hypot(p.pos[0] - f[0], p.pos[1] - f[1], p.pos[2] - f[2]); };
  /* the player's rate (not the slow motion's own): what "seconds away" means */
  const baseRate = () => Math.max(.1, pace.active ? pace.base : game.timeRate);
  const projAt = id => { const p = sim.projectiles.get(id); return p && p.alive ? p : null; };
  const sideOk = p => {
    const w = st().cineSides || 'both';
    if (w === 'both') return true;
    if (w === 'own') return p.side === game.side;
    return p.side !== game.side || p.tk === 'proj';      // enemy: the rounds fired at us, and our defence against them
  };

  /* ---------- the candidates ---------- */
  function add(type, id, q, unit, t, s, urgent, h) {
    if (nC >= CANDS.length) return;
    const c = CANDS[nC++];
    c.type = type; c.id = id; c.q = q; c.unit = unit; c.t = t; c.s = s; c.urgent = urgent; c.h = h || 0;
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
      if (!pin && !sideOk(p)) continue;
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
        // too far to get there while it is still a launch
        const d = dist3(E, p.fromPos), glide = Math.min(2.4, .75 + .5 * Math.log(1 + d / 150));
        if (d < 1500 && (age + glide * base) > la * .8) s -= 24;
        add('launch', p.id, 0, p.from || 0, FAR, s, age < la * .6, h);
      }
      if (r.kind === 'intercept') {
        const t = r.tEv / base;
        if (t < 8) add('intercept', p.id, r.qId, 0, t, 60 + 30 * ss(8, 2.5, t) + bonus + h * .5 - 5 * far, t < 5, h);
      }
      const tg = Math.min(r.kind === 'gun' ? r.tEv : FAR, r.gunSoon);
      if (tg < FAR) {
        const t = tg / base, gu = r.kind === 'gun' && r.tEv <= r.gunSoon ? r.gunUnit : r.gunSoonUnit;
        // (a gun still out of reach is a moment only once it is close: the burst itself, or under ~3.5 s to it)
        const firing = r.kind === 'gun' && r.tEv <= r.gunSoon;
        if ((firing ? t < 8 : t < 3.5) && gu) add('gun', p.id, 0, gu, t, 58 + 30 * ss(8, 2, t) + bonus + h * .5 - 5 * far, t < 5, h);
      }
      if (tu && tu.alive && !tu.aboard && seen(tu) && r.tImpact < FAR) {
        const t = r.tImpact / base, blocked = r.tEv < r.tImpact - .3 || r.gunSoon < r.tImpact - .3;
        if (t < 9 && !blocked) add('impact', p.id, 0, tu.id, t, 56 + 32 * ss(9, 2.5, t) + bonus + h * .5 - 5 * far, t < 5, h);
      }
      add('chase', p.id, 0, 0, FAR, 20 + h * 1.5 + bonus + (p.ctrl === false ? 6 : 0) - 5 * far, false, h);
    }
    if (!pin) for (let i = 0; i < recent.length; i++) {
      const e = recent[i]; if (e.seen) continue;
      const age = sim.t - e.t; if (age > 40) continue;
      add('site', 0, 0, i, FAR, 14 + e.w - age * .3 - 3 * Math.log(1 + dist3(E, e.pos) / 1500), false, 0);
    }
    return nC;
  }
  function best(filter) {
    let b = null;
    for (let i = 0; i < nC; i++) { const c = CANDS[i]; if ((!filter || filter(c)) && (!b || c.s > b.s)) b = c; }
    return b;
  }

  /* ---------- the moves ---------- */
  /* a new shot: a blend from the camera as it is, or a cut for a long move. o: { cut, carry (an anchor fn: the old
     view carried with it), dur, lead, max } */
  function begin(sh, o) {
    o = o || {};
    if (!S.step(sh, 0)) return false;
    const prev = shot;
    const mode_ = st().cineCuts || 'cut';
    const travel = dist3(rig.E, sh.En);
    // long: far for the new shot's own scale, or a glide that would have to fly faster than ~450 m/s
    const sd = dist3(sh.En, sh.subj || sh.Ln), estDur = clamp(.85 + .48 * Math.log(1 + travel / 120), 1, 2.6);
    const long = travel > Math.max(700, 4 * Math.min(sd, 2000)) || travel / estDur > 450;
    // a reverse angle (the lens turning more than ~120 deg) is a cut too: a whip pan reads as a mistake
    const f0 = [rig.L[0] - rig.E[0], rig.L[1] - rig.E[1], rig.L[2] - rig.E[2]], f1 = [sh.Ln[0] - sh.En[0], sh.Ln[1] - sh.En[1], sh.Ln[2] - sh.En[2]];
    const turn = Math.acos(clamp((f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2]) / ((Math.hypot(...f0) * Math.hypot(...f1)) || 1), -1, 1));
    const cut = !o.noCut && (o.cut || (mode_ !== 'glide' && (long || (turn > 2.1 && travel > 25))));
    if (cut && mode_ === 'dip' && rig.init && on) { dip = { t: 0, sh, o }; return true; }
    shot = sh;
    if (cut && rig.init) rig.cut();
    else rig.blend(prev && prev !== sh && !prev.ended ? prev : null, { carry: o.carry, dur: o.dur, lead: o.lead || (sh.kind === 'gun' ? .7 : .8), max: o.max || (mode_ === 'glide' ? 3.6 : 2.6), min: o.min || 1 });
    sh.cutIn = cut;
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
    let b = 1, bs = 1e9;
    const cy = Math.atan2(P[0] - rig.E[0], P[2] - rig.E[2]);
    for (const s of [1, -1]) {
      const yaw = s > 0 ? yawA : yawB;
      const ex = P[0] - Math.sin(yaw) * d, ez = P[2] - Math.cos(yaw) * d;
      let c = Math.abs(wrapPi(yaw - cy)) * .6;
      const h = game.ground(ex, ez); if (h > .5) c += 1 + h / 60;
      if (c < bs) { bs = c; b = s; }
    }
    return b;
  }
  const now_ = () => game.realT;

  /* ---------- the starters (each returns true when the shot began) ---------- */
  function startLaunch(c) {
    const p = projAt(c.id); if (!p) return false;
    const P = game.projPose(p).pos, v = p.vel || [0, 0, 1], f0 = p.fromPos || P;
    const aim = p.aim ? Math.atan2(p.aim[0] - f0[0], p.aim[2] - f0[2]) : Math.atan2(v[0], v[2]);
    const lu = sim.units.get(p.from), Lu = lu ? lu.def.size[0] : 12;
    const side = sideFor(aim - Math.PI / 2, aim + Math.PI / 2, f0, clamp(Lu * 1.5 + 110, 120, 360));
    shown.set(p.from, now_());
    const ok = begin(S.make('launch', { key: c.key, id: c.id, lock: now_() + 2.5 * paceK(), side }));
    if (ok) paceLaunch();
    return ok;
  }
  function startChase(id, o) {
    const p = projAt(id); if (!p) return false;
    const P = game.projPose(p).pos;
    return begin(S.make('chase', Object.assign({ key: 'chase:' + id, id, lock: now_() + 1.5 * paceK(), side: sideOf(P, p.vel || [0, 0, 1]), anchorFn: S.projAnchor(id) }, o || {})));
  }
  /* an interceptor on its way: V = 'threat' (riding with the round) | 'interceptor' | 'witness' (still by the meet point) */
  function startIntercept(c, V) {
    const p = projAt(c.id); if (!p) return false;
    const P = game.projPose(p).pos, v = p.vel || [0, 0, 1];
    const base = { key: c.key, id: c.id, lock: now_() + 2 * paceK(), side: sideOf(P, v), q: c.q, var: V };
    if (V === 'witness' && c.t > 5) { base.then = 'witness'; base.var = V = 'threat'; }
    if (V === 'interceptor') { const q = projAt(c.q); if (!q) return false; base.side = sideOf(game.projPose(q).pos, q.vel || v); }
    base.anchorFn = V === 'interceptor' ? S.projAnchor(c.q) : V === 'threat' ? S.projAnchor(c.id) : null;
    return begin(S.make('intercept', base));
  }
  function gunOf(u) {
    const W = u.def.weapons || {};
    for (const k in W) { const w = W[k]; if (w.gun && w.vs && w.vs.includes('missile')) return w; }
    for (const k in W) { const w = W[k]; if (w.vs && w.vs.includes('missile')) return w; }
    return {};
  }
  function sideMount(u, P) {
    const A = game.unitPose(u).pos, dx = P[0] - A[0], dz = P[2] - A[2], h = Math.hypot(dx, dz) || 1;
    const s = (rig.E[0] - A[0]) * (dz / h) - (rig.E[2] - A[2]) * (dx / h);
    return s >= 0 ? 1 : -1;
  }
  /* over the defender's shoulder (a gun mount, or a launcher), a longer lens up the line of fire to the round */
  function startGun(id, unitId, key) {
    const p = projAt(id), u = sim.units.get(unitId); if (!p || !u || !u.alive) return false;
    const P = game.projPose(p).pos;
    const sh = S.make('gun', { key: key || 'gun:' + id, id, unit: u.id, weap: gunOf(u), side: sideMount(u, P), lock: now_() + 2 * paceK() });
    const uA = S.unitAnchor(u.id);
    sh.anchorFn = sh.anchor = (out, vel) => { if (!uA(out, vel)) return false; if (sh.off) S.mountAt(sim.units.get(sh.unit), sh.off, out); return true; };
    return begin(sh);
  }
  function startImpact(id, unitId, o) {
    const p = projAt(id), u = sim.units.get(unitId); if (!p || !u) return false;
    const P = game.projPose(p).pos, T = S.centreOf(u, [0, 0, 0]), appr = Math.atan2(T[0] - P[0], T[2] - P[2]);
    const side = sideFor(appr + 1.2, appr - 1.2, T, u.def.size[0] * 2.5);
    return begin(S.make('impact', Object.assign({ key: 'impact:' + id, id, tgt: u.id, appr, hi: (id & 1) === 1, side, lock: now_() + 2 * paceK(), anchorFn: S.unitAnchor(u.id) }, o || {})));
  }
  /* the round came apart: an orbit of its pieces (or, hold: the eye kept where it was, the lens on them). The camera
     that rode the round rides on with its pieces (a carry); any other blends from the old shot as it was. */
  function startBreak(pos, vel, L, hold, o) {
    o = o || {};
    const r = game.paused ? 0 : game.timeRate;
    const off = [rig.E[0] - pos[0], rig.E[1] - pos[1], rig.E[2] - pos[2]], d = Math.hypot(off[0], off[1], off[2]) || 1;
    const g0 = gone.get(shot && shot.id), sh = S.make('break', { key: 'break', t0s: Math.min(game.t, g0 ? g0.t : game.t), pos: pos.slice(), vel: vel.slice(), c: pos.slice(), cv: [vel[0] * r, vel[1] * r, vel[2] * r], L, hold,
      eyeW: rig.E.slice(), fovK: rig.K, pk: shot && shot.pk, lock: now_() + (o.lock || 3.2) * paceK(), until: now_() + (o.until || 7) * paceK(), spin: shot && shot.side ? shot.side : 1,
      yaw0: Math.atan2(-off[0], -off[2]), pitch0: Math.asin(clamp(off[1] / d, -.3, .8)) });
    sh.anchorFn = sh.anchor = (out, v) => { out[0] = sh.A[0]; out[1] = sh.A[1]; out[2] = sh.A[2]; v[0] = sh.c && sh.cv ? sh.cv[0] : 0; v[1] = sh.cv[1]; v[2] = sh.cv[2]; return true; };
    for (let k = 0; k < 3; k++) sh.A[k] = pos[k];
    const rode = !hold && o.rode;
    return begin(sh, { carry: rode ? sh.anchor : null, noCut: true, dur: hold ? 1.4 : 1.8 });
  }
  /* on the round, pulled back to show what comes for it (o: { q: the interceptor, unit: the gun, evKind, move }) */
  function startEngage(id, o) {
    o = o || {};
    const p = projAt(id); if (!p) return false;
    const sh = S.make('engage', Object.assign({ key: 'engage:' + id, id, lock: now_() + 2 * paceK(), anchorFn: S.projAnchor(id) }, o));
    return begin(sh, o.move || { dur: 1.3, lead: .85 });
  }
  function startAfter(u, appr, side) {
    return begin(S.make('after', { key: 'after:' + u.id, tgt: u.id, appr, side, lock: now_() + 3.5 * paceK(), until: now_() + 10 * paceK(), anchorFn: S.unitAnchor(u.id) }), { min: 1.8 });
  }
  function startSite(pos, u, dur) {
    const sh = S.make('site', { key: 'site', unit: u ? u.id : 0, pos: pos.slice(), L: u ? u.def.size[0] : 60,
      sea: u ? u.def.domain === 'sea' : game.ground(pos[0], pos[2]) < .5, yaw0: Math.atan2(pos[0] - rig.E[0], pos[2] - rig.E[2]),
      side: 1, lock: now_() + 1.5, until: now_() + dur * paceK() });
    for (let k = 0; k < 3; k++) sh.A[k] = pos[k];
    return begin(sh, { min: 1.8 });
  }
  function startDeath(k, isFinal) {
    const sh = S.make('death', { key: 'death:' + k.unit, unit: k.unit, pos: k.pos.slice(), L: k.L, sea: k.sea, final: isFinal,
      yaw0: Math.atan2(k.pos[0] - rig.E[0], k.pos[2] - rig.E[2]) + .3, side: 1, lock: now_() + 4, until: now_() + (isFinal ? 1e9 : (k.sea ? 18 : 10) * paceK()) });
    for (let i = 0; i < 3; i++) sh.A[i] = k.pos[i];
    return begin(sh, { min: 2 });
  }
  /* the most important unit (own, or the enemy's tracked group in turn) */
  function leadUnit(enemyTurn) {
    const own = sim.alive(game.side).filter(u => !u.aboard);
    const tracks = sim.list().filter(u => u.alive && u.side !== game.side && !u.aboard && game.vis(u) === 'track');
    const pickOf = L => { let l = L[0]; for (const u of L) if ((RANK[u.type] || 1) > (RANK[l.type] || 1)) l = u; return l; };
    if (tracks.length && (enemyTurn || !own.length)) { const l = pickOf(tracks); return { u: l, grp: tracks.filter(u => Math.hypot(u.pos[0] - l.pos[0], u.pos[2] - l.pos[2]) < 8000) }; }
    if (own.length) { const l = pickOf(own); return { u: l, grp: [l] }; }
    return null;
  }
  function startIdle(o) {
    o = o || {};
    const lu = o.unit ? { u: o.unit, grp: [o.unit] } : leadUnit(Math.floor(game.realT / 26) % 2 === 1);
    if (!lu) { shot = null; return false; }
    const u = lu.u, grp = lu.grp, L = Math.max(...grp.map(g => g.def.size[0]), 12), sea = u.def.domain === 'sea';
    const c = S.centreOf(u, [0, 0, 0]);
    let bestYaw = Math.atan2(c[0] - rig.E[0], c[2] - rig.E[2]), bc = 1e9;
    const y0 = bestYaw;
    for (let i = 0; i < 12; i++) {
      const yaw = y0 + i / 12 * TAU, d = Math.max(400, L * 7);
      const h = game.ground(c[0] - Math.sin(yaw) * d, c[2] - Math.cos(yaw) * d);
      const cost = (h > .5 ? 2 + h / 50 : 0) + Math.abs(wrapPi(yaw - y0)) * .25;
      if (cost < bc) { bc = cost; bestYaw = yaw; }
    }
    const sh = S.make('idle', { key: 'idle:' + u.id, unit: u.id, group: grp.map(g => g.id), L, sea, yaw0: bestYaw, side: u.id % 2 ? 1 : -1, lock: now_() + 3, until: now_() + (o.dur || 26) * paceK() });
    sh.anchorFn = sh.anchor = S.unitAnchor(u.id);
    return begin(sh);
  }
  /* a tripod: P the eye (fixed; or riding a unit: o.ride, o.rideOff), subjFn the subject's point, size its size (m) */
  function startTripod(P, subjFn, size, o) {
    o = o || {};
    const sh = S.make('tripod', Object.assign({ key: o.key || 'tripod', P: P.slice(), subjFn, size, frac: o.frac || .11, lock: now_() + (o.lock || 2.5) * paceK(), until: now_() + (o.dur || 1e9) }, o));
    sh.anchorFn = sh.anchor = (out, v) => { out[0] = sh.A[0]; out[1] = sh.A[1]; out[2] = sh.A[2]; v[0] = v[1] = v[2] = 0; return true; };
    for (let k = 0; k < 3; k++) sh.A[k] = P[k];
    return begin(sh, o.move);
  }
  function startFlyby(o) {
    const sh = S.make('flyby', Object.assign({ key: 'flyby:' + (o.id || 'u' + o.unit), lock: now_() + 2, until: now_() + 14 }, o));
    sh.anchorFn = sh.anchor = (out, v) => { out[0] = sh.A[0]; out[1] = sh.A[1]; out[2] = sh.A[2]; v[0] = v[1] = v[2] = 0; return true; };
    return begin(sh, { cut: o.cut });
  }
  function startDolly(u, o) {
    o = o || {};
    const pose_ = game.unitPose(u), c = S.centreOf(u, [0, 0, 0]);
    // the side the camera is on now (or the one over water), the travel from bow to stern or back
    const rx = Math.cos(pose_.hdg), rz = -Math.sin(pose_.hdg);
    let side = (rig.E[0] - c[0]) * rx + (rig.E[2] - c[2]) * rz >= 0 ? 1 : -1;
    if (u.def.domain !== 'sea') { const D = u.def.size[0] * 1.4; if (game.ground(c[0] + rx * D * side, c[2] + rz * D * side) > c[1] + 3) side = -side; }
    const sh = S.make('dolly', Object.assign({ key: 'dolly:' + u.id, unit: u.id, side, dir: o.dir || (u.id % 2 ? 1 : -1), dur: (o.dur || 12) * paceK(), lock: now_() + 4, until: now_() + 1e9 }, o));
    sh.anchorFn = sh.anchor = S.unitAnchor(u.id);
    return begin(sh, { cut: o.cut !== undefined ? o.cut : true });
  }
  function startCrane(u, o) {
    o = o || {};
    const c = S.centreOf(u, [0, 0, 0]);
    const sh = S.make('crane', Object.assign({ key: 'crane:' + u.id, unit: u.id, yaw0: Math.atan2(c[0] - rig.E[0], c[2] - rig.E[2]) + .4, side: u.id % 2 ? 1 : -1, dur: (o.dur || 11) * paceK(), lock: now_() + 4, until: now_() + 1e9 }, o));
    sh.anchorFn = sh.anchor = S.unitAnchor(u.id);
    return begin(sh, { cut: o.cut !== undefined ? o.cut : true });
  }
  function startWide(ptsFn, o) {
    o = o || {};
    const sh = S.make('wide', Object.assign({ key: o.key || 'wide', ptsFn, yaw0: Math.atan2(rig.L[0] - rig.E[0], rig.L[2] - rig.E[2]), side: 1, pitch: 30, lock: now_() + 3, until: now_() + 1e9 }, o));
    return begin(sh, o.move);
  }
  function startTwo(aFn, bFn, o) {
    o = o || {};
    const sh = S.make('twoshot', Object.assign({ key: o.key || 'two', aFn, bFn, side: o.side || 1, lock: now_() + 2 * paceK(), until: now_() + 1e9 }, o));
    return begin(sh, o.move);
  }
  /* a point a round or unit is at, as an aFn/bFn for the two-shot and the tripod */
  const projPt = id => out => { const p = projAt(id); if (!p) return false; const P = game.projPose(p).pos; out[0] = P[0]; out[1] = P[1]; out[2] = P[2]; return true; };
  const unitPt = id => out => { const u = sim.units.get(id); if (!u || !u.alive || u.aboard) return false; S.centreOf(u, out); return true; };

  /* a tripod's place near point T: off the line `appr` (rad) on `side`, r metres out, h over the sea or ground, with
     the line of sight clear of the ground (the lowest-cost of a fan of bearings) */
  function tripodSpot(T, appr, side, r, h) {
    let bestP = null, bc = 1e9;
    for (let i = 0; i < 10; i++) {
      const yaw = appr + (i < 5 ? side : -side) * (.8 + (i % 5) * .28);
      const x = T[0] - Math.sin(yaw) * r, z = T[2] - Math.cos(yaw) * r, g = game.ground(x, z);
      const P = [x, Math.max(0, g) + h, z];
      let c = (i < 5 ? 0 : .6) + Math.abs(wrapPi(Math.atan2(T[0] - x, T[2] - z) - Math.atan2(T[0] - rig.E[0], T[2] - rig.E[2]))) * .15;
      if (g > .5 && game.ground(T[0], T[2]) < .5) c += .4;              // a sea target: a camera on the sea
      const b = blockedBy(game.ground, P, T); if (b > -2) c += 3 + b / 20;
      if (c < bc) { bc = c; bestP = P; }
    }
    return bestP;
  }

  /* ---------- the end of a subject: what it means (shared; a mode may handle it first) ---------- */
  function ended(sh) {
    sh.ended = true;
    if (mode && mode.ended && mode.ended(sh)) return;
    defaultEnded(sh);
  }
  function defaultEnded(sh) {
    const now = now_();
    if (sh.kind === 'after') { startSite(sh.A, null, 6); return; }
    if (sh.kind === 'impact' && !(sim.units.get(sh.tgt) || {}).alive) {
      const u = sim.units.get(sh.tgt);
      startDeath({ unit: sh.tgt, pos: sh.A.slice(), L: u ? u.def.size[0] : 60, sea: u ? u.def.domain === 'sea' : game.ground(sh.A[0], sh.A[2]) < .5 }, false);
      return;
    }
    if (sh.kind === 'intercept' && (sh.var === 'interceptor' || sh.var === 'witness') && projAt(sh.id)) {
      // the interceptor is gone (missed, burst wide), the round flies on: stay with the round
      const p = projAt(sh.id);
      begin(S.make('intercept', { key: sh.key, id: sh.id, q: 0, var: 'threat', lock: now + 1.5, side: sideOf(game.projPose(p).pos, p.vel), anchorFn: S.projAnchor(sh.id) }));
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
        startAfter(u, appr, side);
        return;
      }
    }
    if (g && g.why === 'burst' && projAt(g.target)) { startChase(g.target); return; }
    if (g && (g.why === 'intercept' || g.why === 'gun' || g.why === 'burst' || g.why === 'spin') || (sh.kind !== 'launch' && !g)) {
      // stopped in the air: its pieces. Seen from a mount, across a target, from a tripod or a two-shot: held there,
      // the lens on them; riding with the round: on with its pieces; riding with something else: an orbit of them
      const hold = sh.kind === 'gun' || sh.kind === 'impact' || sh.kind === 'tripod' || sh.kind === 'twoshot' || (sh.kind === 'intercept' && sh.var === 'witness') || sh.kind === 'flyby';
      const rode = (sh.kind === 'chase' || sh.kind === 'engage' || (sh.kind === 'intercept' && sh.var === 'threat'));
      startBreak(g && g.pos ? g.pos : lastP, lastV, S.lenOf({ kind: sh.pk || '' }) || 6, hold, { rode, lock: 3.6, until: 7.5 });
      return;
    }
    // into the sea, self-destructed, or a launch that ended: the place briefly, then on
    startSite(lastP, null, 3.5);
  }

  /* ---------- choosing ---------- */
  function pick() {
    lastPick = game.realT;
    const now = game.realT;
    if (final) { if (!shot || shot.kind !== 'death' || !shot.final) startDeath(final, true); return; }
    // the mix: on to its next mode at a quiet moment
    if ((st().cineMode || 'story') === 'mix') {
      const L = mixList();
      const every = (+st().cineMixEvery || 90);
      const quiet = !shot || QUIET_SHOTS[shot.kind] || shot.kind === 'break' && now > shot.lock;
      if (L.length > 1 && now - mix.t0 > every && quiet && !(shot && now < shot.lock)) { mix.i = (mix.i + 1) % L.length; mix.t0 = now; }
    }
    if (chooseMode(false)) { if (shot) shot.lock = Math.min(shot.lock, now + .5); }
    if (pin && !pin.ids.some(id => projAt(id)) && !(shot && (shot.kind === 'break' || shot.kind === 'after') && now < shot.until)) {
      const wasBullet = pin.bullet;
      pin = null; game.bus.emit('watch', { ids: [] });
      if (wasBullet && pace.active && pace.owner === 'bullet') pace.finish();
    }
    gather();
    mode.pick(now);
    if (!shot) quiet();
  }
  /* nothing to watch: what the Quiet setting says (a mode may have its own) */
  function quiet() {
    if (mode && mode.quiet && mode.quiet()) return true;
    const q = st().cineQuiet || 'rollby';
    if (q === 'overview') return MODES.overview.quiet();
    if (q === 'rollby') return MODES.showcase.quiet();
    return startIdle();
  }

  /* ---------- the camera ---------- */
  function apply(dt) {
    rig.frame(dt, shot);
    const K = rig.K * lensK();
    // a hand on the camera: a slow sub-degree drift of the look point (handheld: more, and a little faster)
    const t = game.realT, E = rig.E, Lk = rig.L, L = dist3(Lk, E);
    const sk = { off: 0, subtle: 1, handheld: 2.6 }[st().cineShake || 'subtle'] || 0, near = E[1] < 600 ? 1 : .3;
    const hf = sk > 2 ? 1.9 : 1, a = sk * near * Math.min(1, K * 1.2);
    const ly = (.0028 * Math.sin(t * .63 * hf) + .0018 * Math.sin(t * 1.37 * hf + 1.1) + (sk > 2 ? .0012 * Math.sin(t * 3.1 + .4) : 0)) * a * L;
    const lx = (.0021 * Math.sin(t * .81 * hf + 2.3) + .0013 * Math.sin(t * 1.9 * hf) + (sk > 2 ? .001 * Math.sin(t * 2.7 + 1.9) : 0)) * a * L;
    const fx = (Lk[0] - E[0]) / (L || 1), fz = (Lk[2] - E[2]) / (L || 1), rl = Math.hypot(fx, fz) || 1;
    drift[0] = Lk[0] + fz / rl * lx; drift[1] = Lk[1] + ly; drift[2] = Lk[2] - fx / rl * lx;
    lookFrom(cam, E, drift, pose);
    putCam(cam, pose, follow);
    const f0 = cam.fov0 !== undefined ? cam.fov0 : cam.fov;
    for (let k = 0; k < 3; k++) { VIEW.eye[k] = E[k]; VIEW.look[k] = drift[k]; }
    VIEW.near = shot.near || clamp(L * .02, .3, 10);
    VIEW.fov = Math.abs(K - 1) > .005 ? clamp(f0 * K, .2 * DEG, 100 * DEG) : undefined;
    cam.view = VIEW;
  }

  /* ---------- the time rate: the cinematic's slow motion, and bullet time (B) ---------- */
  function markEv() { pace.mark(mode && mode.hold ? mode.hold : undefined); if (shot) shot.evT = game.realT; }
  const autoOk = () => !(game.result || game.paused || (game.inspect && game.inspect.active) || (game.film && game.film.playing) || (game.replay && game.replay.active) ||
    (st().cineSlow === 'off'));
  /* the rate for a moment of this kind: the setting's, the mode's own share */
  function slowOf(kind) {
    const s = SLOW_SET[st().cineSlow || 'normal'];
    if (!s) return 0;
    const m = mode && mode.slow ? mode.slow(kind) : 1;
    if (!m) return 0;
    const r = s === 1 ? (SLOW[kind] || .25) : s;
    return Math.min(1, r / Math.max(.3, m));
  }
  function paceLaunch() {
    const now = game.realT;
    if (pin && pin.bullet) return;
    if (!autoOk() || pace.active || game.timeRate < .999 || now < launchNext || !slowOf('launch')) return;
    pace.start('auto', { slow: .5, hold: 1.3, up: 1.3 });
    pace.mark(1.3); pace.finish();
    launchNext = now + 10;
  }
  const gunFloor = () => (shot.kind === 'gun' || shot.gunEv) ? .5 : 0;
  function paceFrame() {
    const ev = shot && EVENT_SHOTS[shot.kind] && shot.ev < FAR ? shot.ev : FAR;
    if (pin && pin.bullet) {
      if (!pace.active) { pin.bullet = false; return; }
      if (ev < FAR) pace.feed(ev, shot.kind === 'gun' ? .3 : 0);
      return;
    }
    if (!autoOk()) return;
    const kind = shot ? (shot.evKind || shot.kind) : '';
    if (pace.active) { if (pace.owner === 'auto' && ev < FAR) pace.feed(ev, gunFloor()); return; }
    if (ev >= FAR || game.timeRate < .999) return;
    const slow = slowOf(SLOW[kind] ? kind : 'intercept');
    if (!slow || slow >= .99) return;
    const b = game.timeRate, lead = b * Math.min(1.8, Math.max(.6, 2 / Math.sqrt(b))) + .3;
    if (ev < lead) {
      pace.start('auto', { slow, hold: (mode && mode.hold) || 1.8, up: 1.4 });
      pace.feed(ev, gunFloor()); pace.finish();
    }
  }

  /* ---------- the context the modes work with ---------- */
  function api_() {
    return {
      game, sim, S, get rig() { return rig; }, get shot() { return shot; }, set shot(v) { shot = v; },
      get cands() { return CANDS.slice(0, nC); }, best, gather, recent, gone, get pin() { return pin; },
      HERO, RANK, FAR, baseRate, projAt, seen, heroOf, sideOf, sideFor, paceK, now: now_, lastP, lastV,
      begin, startLaunch, startChase, startEngage, startIntercept, startGun, startImpact, startBreak, startAfter, startSite, startDeath,
      startIdle, startTripod, startFlyby, startDolly, startCrane, startWide, startTwo, projPt, unitPt, tripodSpot,
      leadUnit, defaultEnded, quiet: () => quiet(), gunOf, markEv,
      get modes() { return MODES; },
    };
  }

  const MODES = createModes(api_());
  const api = {
    name: 'director', priority: PRI.director,
    set, get on() { return on; }, get shot() { return shot; }, get mode() { return modeId; }, nextMode,
    get lookDist() { return shot && shot.subj ? dist3(rig.E, shot.subj) : dist3(rig.E, rig.L); },
    watch(ids, i) {
      ids = (ids || []).filter(id => projAt(id));
      const bullet = !!(pin && pin.bullet);
      pin = ids.length ? { ids, i: (i || 0) % ids.length, lock: game.realT + 6, bullet } : null;
      if (pin && !on) set(true);
      if (pin) {
        const was = shot; if (shot) shot.lock = 0;
        gather();
        let b = null;
        for (let k = 0; k < nC; k++) { const c = CANDS[k]; if (c.id === ids[pin.i] && (!b || c.s > b.s)) b = c; }
        if (!b || !mode.take(b)) shot = was;
      }
      lastPick = game.realT;
      game.bus.emit('watch', { ids: pin ? pin.ids.slice() : [], id: pin ? pin.ids[pin.i] : 0 });
      return !!pin;
    },
    get watching() { return pin ? { ids: pin.ids.slice(), i: pin.i, id: pin.ids[pin.i] } : null; },
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
    pace, rig,
    get edgeWas() { return edgeWas; }, set edgeWas(v) { edgeWas = v; },
    resync() { shot = null; lastPick = -99; rig.reset(); dip = null; },
    onKey(e) {
      if (e.type !== 'keydown') return false;
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.shiftKey) { if (!on) set(true); nextMode(); return true; }
        set(!on); game.bus.emit('toast', { text: on ? 'CINEMATIC · ' + modeLabel().toUpperCase() : 'CINEMATIC OFF' }); return true;
      }
      if (on && e.code === 'Escape' && !(game.replay && game.replay.active)) { set(false); return true; }
      if (on && CAM_KEYS.has(e.code)) set(false);
      return false;
    },
    onPointer(ev) {
      if (!on) return false;
      if ((ev.type === 'down' && (ev.button === 1 || ev.button === 2)) || ev.type === 'wheel') set(false);
      return false;
    },
    init() {
      game.bus.on('breakup', b => {
        if (!b || !b.pos) return;
        if (on && shot && shot.id && b.id === shot.id) markEv();
        if (!b.unit && (HERO[b.kind] || 0) < 6) return;
        const r = recent.find(x => x.kind === 'intercept' && Math.abs(x.t - b.t) < .2);
        if (r) r.w = Math.max(r.w, b.w || 7);
        else {
          const rec = { kind: 'intercept', pos: b.pos.slice(), t: b.t, w: b.w || 7, unit: b.unit, seen: !!(shot && shot.id === b.id) || dist3(b.pos, rig.E) < 400 };
          recent.push(rec); if (recent.length > 24) recent.shift();
        }
      });
      game.bus.on('result', () => {
        if (lastKill && sim.t - lastKill.t < 90) final = { unit: lastKill.unit, pos: lastKill.pos.slice(), L: lastKill.L, sea: lastKill.sea, t: lastKill.t };
        else if (lastHq) final = { unit: lastHq.unit, pos: lastHq.pos.slice(), L: lastHq.L, sea: lastHq.sea, t: lastHq.t };
        const busy = (game.inspect && game.inspect.active) || (game.film && game.film.playing);
        if (!busy && !on) set(true);
        else if (on) { if (shot) shot.lock = 0; lastPick = -99; }
      });
    },
    onEvent(e) {
      const t = e.t;
      if (e.type === 'intercept' && e.proj) gone.set(e.proj, { why: 'intercept', pos: e.pos, t, target: 0 });
      else if (e.type === 'hit' && e.proj) gone.set(e.proj, { why: 'hit', pos: e.pos, t, target: e.target });
      else if (e.type === 'gunhit' && e.target) gone.set(e.target, { why: 'gun', pos: e.pos, t, target: 0 });
      else if (e.type === 'spinout' && e.proj) gone.set(e.proj, { why: 'spin', pos: e.pos || null, t, target: 0 });
      else if (e.type === 'splash' && e.proj) {
        if (e.air && e.target && (e.why === 'burst' || e.why === 'wide')) gone.set(e.proj, { why: 'burst', pos: e.pos, t, target: e.target });
        else if (!gone.has(e.proj) || gone.get(e.proj).why === 'spin') gone.set(e.proj, { why: 'splash', pos: e.pos, t, target: 0 });
      }
      if (gone.size > 64) for (const [k, g] of gone) if (sim.t - g.t > 15) gone.delete(k);
      if (on && shot && shot.id) {
        const id = shot.id, q = shot.q || 0;
        if ((e.type === 'intercept' && e.proj === id) || (e.type === 'gunhit' && e.target === id) || (e.type === 'hit' && e.proj === id) ||
          (e.type === 'splash' && e.air && (e.proj === id || e.target === id || (q && e.proj === q)))) markEv();
      }
      if (mode && mode.onEvent) mode.onEvent(e);
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
      if (rec.unit) { const u = sim.units.get(rec.unit); if (u && !game.vis(u)) return; }
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
      if (waiting) { waiting = false; shot = null; lastPick = -99; rig.reset(); dip = null; }
      // a dip to dark: the old shot runs on until the picture is dark, then the cut
      if (dip) {
        dip.t += dt;
        if (!dip.cut && dip.t >= .17) {
          dip.cut = true;
          const sh = dip.sh; shot = sh; rig.cut();
          if (pin && sh.id && pin.ids.includes(sh.id)) { pin.i = pin.ids.indexOf(sh.id); game.bus.emit('watch', { ids: pin.ids.slice(), id: sh.id }); }
        }
        if (dip.t > .17 + .3) dip = null;
      }
      rig.dt = dt;
      if (!dip && (game.realT - lastPick > .2 || !shot)) pick();
      if (shot) {
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
          if (shot === old || !shot) { shot = null; pick(); }
          ok = !!shot && (shot.hasOut || S.step(shot, dt));
          if (!ok && shot) { shot = null; startIdle(); ok = !!shot && (shot.hasOut || S.step(shot, dt)); }
        }
        if (ok && shot) apply(dt);
      }
      paceFrame();
      pace.update(dt);
    },
    always2d: true,
    draw2d(ov) {
      if (!on || (game.replay && game.replay.active)) return;
      const K = ov.ui || 1;
      // the dip
      if (dip) {
        const a = dip.t < .17 ? ss(0, .17, dip.t) : 1 - ss(.17, .47, dip.t);
        if (a > 0) { const c = ov.ctx; c.save(); c.globalAlpha = a; c.fillStyle = '#0B0C0A'; c.fillRect(0, 0, ov.W, ov.H); c.restore(); }
      }
      if (!game.ui.hidden && game.getSystem('hud')) return;
      const slow = pace.active && game.timeRate < .99 ? (pace.owner === 'bullet' ? 'BULLET TIME · ' : 'SLOW MOTION · ') : '';
      ov.text(ov.W - 22 * K, 42 * K, slow + 'CINEMATIC · ' + modeLabel().toUpperCase(), { size: 10, col: '#C6F432', a: .75, align: 'right' });
      if (st().cineTitles !== false && shot && !game.result) caption(ov, K);
    },
  };

  /* the caption: the subject (a round: its name, speed and target; a unit: its name), lower left, as the films do */
  const capA = { a: 0, key: '' };
  function caption(ov, K) {
    let id = '', label = '', value = '';
    const p = shot.id ? projAt(shot.id) : null;
    const nm = u => !u ? '' : u.side === game.side ? u.def.name : (TRACK[u.type] || u.def.name);
    if (p && shot.kind !== 'break') {
      const P = p.P || game.PROJ[p.kind] || {}, v = p.vel ? Math.hypot(p.vel[0], p.vel[1], p.vel[2]) : 0;
      id = p.side === game.side ? 'OWN' : 'TRK';
      label = (P.name || p.kind).toUpperCase();
      const tu = p.tk === 'unit' ? sim.units.get(p.target) : null, tq = p.tk === 'proj' ? sim.projectiles.get(p.target) : null;
      const to = tu ? nm(tu) : tq ? ((tq.P || game.PROJ[tq.kind] || {}).name || '') : '';
      const d = tu ? Math.hypot(tu.pos[0] - p.pos[0], tu.pos[2] - p.pos[2]) : tq ? Math.hypot(tq.pos[0] - p.pos[0], tq.pos[1] - p.pos[1], tq.pos[2] - p.pos[2]) : 0;
      value = `${Math.round(v)} M/S · M${(v / 340).toFixed(1)}` + (to ? ` · ${to.toUpperCase()} ${d > 1500 ? (d / 1000).toFixed(1) + ' KM' : Math.round(d) + ' M'}` : '');
    } else {
      const u = sim.units.get(shot.unit || shot.tgt);
      if (u && (shot.kind === 'dolly' || shot.kind === 'crane' || shot.kind === 'idle' || shot.kind === 'after' || shot.kind === 'death')) {
        id = u.side === game.side ? 'OWN' : 'TRK'; label = nm(u).toUpperCase();
        value = u.alive ? (u.speed > .5 ? `${Math.round(u.speed * 1.944)} KN` : (u.def.domain === 'sea' ? 'HOLDING' : 'STATIONARY')) : (u.def.domain === 'sea' ? 'SINKING' : 'DESTROYED');
      } else if (shot.kind === 'break') { id = 'KILL'; label = ((game.PROJ[shot.pk] || {}).name || 'ROUND').toUpperCase(); value = 'BROKEN UP'; }
    }
    const key = id + label;
    if (key !== capA.key) { capA.key = key; capA.t0 = game.realT; }
    const a = label ? Math.min(1, (game.realT - capA.t0) / .4) : 0;
    if (a <= 0) return;
    ov.tag(40 * K, ov.H - 64 * K, id, label, value, { kind: id === 'TRK' ? 'coral' : id === 'KILL' ? 'white' : 'lime', size: 11, a: a * .9 });
  }

  function endShift() {
    if (!game.result) return 0;
    const el = document.querySelector('.oniks-end');
    return el && !el.classList.contains('min') ? .3 : 0;
  }
  return api;
}
