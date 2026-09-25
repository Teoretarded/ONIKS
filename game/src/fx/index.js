/* ONIKS effects system: the game-trailer spectacle driven by sim events and sim state, drawn into a sink.

   import { createFx } from './fx/index.js';
   game.addSystem(createFx(game));        // system { name: 'fx', onEvent, update, draw3d }

   Renderer-agnostic: draw3d(frame) draws into frame.sink (see README.md), or, when the frame has none, into the
   engine through engineSink(renderer). Every particle is an analytic function of its age plus a seeded index;
   the only records kept are emission data (where a puff, a wake row or a smoke parcel was laid, and when). */
import { View, TAU, dirOf, norm3, hsh, sat, clamp, LIME } from './lib/core.js';
import { Trail, STAGE } from './lib/smoke.js';
import { drawPlume, drawHead, PLUME } from './lib/plume.js';
import { ColdLaunch, VlsLaunch, HotLaunch, GunBlast } from './lib/launch.js';
import { Burst, BoosterSep } from './lib/burst.js';
import { Splash, Dirt, Blast, Fire, Sinking } from './lib/impact.js';
import { TracerStream, Muzzle } from './lib/guns.js';
import { Wake, Downwash } from './lib/water.js';
import { drawJet } from './lib/air.js';
import { Lightning, drawRain, drawShafts } from './lib/weather.js';

export { engineSink };

/* ---------------- flight profiles: which smoke and which flame, by kind and age ---------------- */
/* returns [trail stage | null, plume spec | null, head glow 0..1] */
function profile(kind, age, P) {
  switch (kind) {
    case 'oniks': {
      const ig = .38, sep = (P && P.sepAt) || 7;
      if (age < ig) return [null, null, 0];
      if (age < sep) return [STAGE.boost, PLUME.oniksBoost, 0];
      if (age < sep + .35) return [null, null, 0];
      return [STAGE.air, PLUME.ramjet, 0];
    }
    case 'sm6': {
      const sep = (P && P.sepAt) || 6;
      if (age < sep) return [STAGE.boost, PLUME.mk72, 1];
      if (age < sep + 5) return [STAGE.sustain, PLUME.sustain, .55];
      return [STAGE.glide, PLUME.glide, .15];
    }
    case 'tlam': {
      const b = (P && P.boost) || 12;
      if (age < b) return [STAGE.boost, PLUME.tlamBoost, 0];
      return [STAGE.heat, PLUME.turbojet, 0];
    }
    case 'slam': return [STAGE.heat, PLUME.turbojet, 0];
    case 'pdms': return age < 3 ? [STAGE.sustain, PLUME.small, 1] : age < 7 ? [STAGE.glide, PLUME.glide, .3] : [null, null, .15];
    case 'sam': return age < 2.4 ? [STAGE.small, PLUME.small, 1] : [STAGE.glide, null, .2];
    case 'aam': return age < 3 ? [STAGE.sustain, PLUME.small, .8] : [STAGE.glide, null, .15];
    case 'hellfire': return age < 2.5 ? [STAGE.small, PLUME.tiny, .6] : [null, null, .1];
    default: return [null, null, 0];
  }
}
const BOOSTER = { oniks: 'oniks', sm6: 'mk72', tlam: 'tlam', sam: 'small', pdms: 'small' };
const SPLASH_H = { shell: 26, oniks: 46, tlam: 36, slam: 34, hellfire: 12, sm6: 16, pdms: 14, sam: 12, aam: 12, crash: 30 };
const HIT_SC = { oniks: 1, tlam: .7, slam: .65, hellfire: .3, shell: .2, sm6: .35, pdms: .3, sam: .3, aam: .3, ciws: .05, gun30: .06 };
const GUNS = { ciws: 1, gun30: 1 };
const NOZ = { oniks: 4.5, sm6: 3.3, tlam: 3.1, slam: 2.2, pdms: 1.8, sam: 1.7, aam: 1.8, hellfire: .85 };

class FxSystem {
  constructor(game, o) {
    o = o || {};
    this.name = 'fx'; this.priority = 5;
    this.game = game;
    this.budget = o.budget || 150000;
    this.wakes = o.wakes !== false;
    this.fog = o.fog !== false;
    this.q = 1; this.lastN = 0; this.tr = 0; this.stats = { dots: 0, q: 1, effects: 0, trails: 0, ms: 0 };
    this.fx = [];                 // live effect instances: { e, t0, dur, layer }
    this.trk = new Map();         // projectile id -> tracker
    this.gone = new Map();        // trackers of rounds that just ended (their last velocity, for the bursts)
    this.ghost = [];              // trails whose round is gone, still hanging in the air
    this.wk = new Map();          // unit id -> Wake
    this.fires = new Map();       // unit id -> Fire
    this.sinks = new Map();       // unit id -> Sinking
    this.falls = new Map();       // unit id -> Trail (aircraft going down / trailing smoke)
    this.hitAt = new Map();       // unit id -> last hit, unit frame [along, up, across]
    this.abUntil = new Map();     // unit id -> sim time the afterburner stays lit to (takeoffs)
    this.bolts = [];
    this.groundFires = [];
    this.down = new Downwash({});
    this.V = new View();
    this.lastT = 0;
    const self = this;
    // the frame context every effect draws through (dot counting and the hard cap live here)
    this.C = {
      V: this.V, t: 0, tr: 0, q: 1, wind: [0, 0, 0], n: 0, cap: this.budget, sink: null,
      ground: (x, z) => self.groundAt(x, z),
      dot: null, glow: null, halo: null, light: null, lift: null,
    };
  }
  init(game) { if (game) this.game = game; }

  /* ---------- helpers onto the game ---------- */
  get sim() { return this.game && this.game.sim; }
  groundAt(x, z) {
    const g = this.game, m = g && (g.map || (g.sim && g.sim.map));
    if (g && g.ground) return g.ground(x, z);
    // the drawn ground when there is a renderer (land with its metre-scale relief; 0 over water)
    const T = g && g.renderer && g.renderer.terrain;
    if (T && T.heightAt) { const h = T.heightAt(x, z); return h > 0 ? h : 0; }
    if (m && m.h) { const h = m.h(x, z); return h > 0 ? h : 0; }
    return 0;
  }
  wet(x, z) { const g = this.game, m = g && (g.map || (g.sim && g.sim.map)); return m && m.h ? m.h(x, z) < 0 : true; }
  seeUnit(u) {
    const g = this.game, sim = this.sim;
    if (!this.fog || !g || !g.side || !sim || !sim.visible || !u) return true;
    return !!sim.visible(g.side, u);
  }
  seeProj(p) {
    const g = this.game, sim = this.sim;
    if (!this.fog || !g || !g.side || !sim || !sim.projVisible || !p) return true;
    return sim.projVisible(g.side, p);
  }
  add(e, layer) { e.layer = layer || 0; this.fx.push(e); return e; }
  tracker(id) { return this.trk.get(id) || this.gone.get(id); }

  /* ---------- sim events ---------- */
  onEvent(ev) {
    const sim = this.sim, t = ev.t !== undefined ? ev.t : (sim ? sim.t : 0), seed = ((ev.proj || ev.unit || 0) * 131 + Math.floor(t * 20)) | 0;
    switch (ev.type) {
      case 'launch': {
        const u = sim && sim.units.get(ev.from);
        if (u && !this.seeUnit(u)) return;
        const axis = dirOf(ev.hdg, ev.pitch), pos = ev.pos, k = ev.kind;
        if (k === 'oniks') this.add(new ColdLaunch({ t0: t, pos, axis, ground: this.C.ground, seed }), 1);
        else if ((k === 'sm6' || k === 'tlam') && (!u || u.def.domain === 'sea')) this.add(new VlsLaunch({ t0: t, pos, seed, big: k === 'tlam' }), 1);
        else if (k === 'shell') this.add(new GunBlast({ t0: t, pos, axis, seed, sea: this.wet(pos[0], pos[2]) }), 1);
        else if (k === 'sam') this.add(new HotLaunch({ t0: t, pos, axis, seed, scale: 1, ground: this.C.ground }), 1);
        else if (k === 'pdms') this.add(new HotLaunch({ t0: t, pos, axis, seed, scale: .8 }), 1);
        else if (k === 'hellfire') this.add(new HotLaunch({ t0: t, pos, axis, seed, scale: .35 }), 1);
        else this.add(new HotLaunch({ t0: t, pos, axis, seed, scale: .45 }), 1);
        return;
      }
      case 'booster_sep': {
        const tr = this.tracker(ev.proj); if (tr && !tr.seen) return;
        const v = ev.vel || [0, 1, 0], axis = norm3(v), kind = BOOSTER[ev.kind] || 'small';
        const b = this.add(new BoosterSep({ t0: t, pos: ev.pos, vel: v, axis, kind, ground: this.C.ground, seed }), 2);
        if (b.fly.wet && b.fly.landed < 60) {
          const lp = b.fly.at(b.fly.landed, [0, 0, 0]);
          this.add(new Splash({ t0: t + b.fly.landed, pos: [lp[0], 0, lp[2]], size: kind === 'oniks' ? 14 : 9, seed: seed + 1, ring: .5 }), 2);
        }
        return;
      }
      case 'intercept': {
        const tr = this.tracker(ev.proj), vel = tr ? tr.vel : [0, 0, 0], pos = ev.pos, gy = this.groundAt(pos[0], pos[2]);
        if (tr) tr.killed = true;
        if (GUNS[ev.byKind]) {
          // stopped by a gun close in: the round's own momentum carries its debris on
          this.add(new Burst({ t0: t, pos, mom: [vel[0] * .9, vel[1] * .9, vel[2] * .9], sc: 1.1, nF: 300, ns: 130, heavy: true, big: true, fire: 1.25, smoke: 34, life: 10, gy, seed, kind: 'gun' }), 3);
        } else {
          const by = this.tracker(ev.by), bv = by ? by.vel : [0, 0, 0];
          const mom = [vel[0] * .5 + bv[0] * .3, vel[1] * .5 + bv[1] * .3, vel[2] * .5 + bv[2] * .3];
          this.add(new Burst({ t0: t, pos, mom, sc: 1.25, nF: 220, ns: 90, fire: 1.6, smoke: 55, life: 9, gy, seed, kind: 'kill' }), 3);
        }
        return;
      }
      case 'hit': return this.onHit(ev, t, seed);
      case 'splash': {
        const pos = ev.pos, k = ev.kind, gy = this.groundAt(pos[0], pos[2]);
        const tr = this.tracker(ev.proj); if (tr) tr.killed = true;
        if (ev.air) {
          const v = tr ? tr.vel : [0, 0, 0];
          this.add(new Burst({ t0: t, pos, mom: [v[0] * .35, v[1] * .35, v[2] * .35], sc: .8, nF: 150, ns: 70, fire: 1.1, smoke: 40, life: 7, gy, seed, kind: 'destruct' }), 3);
          return;
        }
        const wet = ev.water !== undefined ? ev.water : this.wet(pos[0], pos[2]);
        const H = SPLASH_H[k] || 14, threat = k === 'oniks' || k === 'tlam' || k === 'slam' || k === 'hellfire' || k === 'shell' || k === 'crash';
        if (wet) {
          this.add(new Splash({ t0: t, pos: [pos[0], 0, pos[2]], size: H, seed, ring: .35 }), 2);
          if (threat && k !== 'shell') this.add(new Blast({ t0: t, pos: [pos[0], 1, pos[2]], sc: k === 'crash' ? .35 : .45, sea: true, gy: 0, seed: seed + 3 }), 3);
          if (k === 'shell') this.add(new Blast({ t0: t, pos: [pos[0], .5, pos[2]], sc: .06, sea: false, gy: 0, seed: seed + 3 }), 3);
        } else {
          this.add(new Dirt({ t0: t, pos: [pos[0], gy, pos[2]], size: H * .7, seed }), 2);
          if (threat) this.add(new Blast({ t0: t, pos: [pos[0], gy + 1, pos[2]], sc: k === 'shell' ? .15 : .4, sea: false, gy, seed: seed + 3 }), 3);
          if (k === 'crash') this.startFire(null, t, [pos[0], gy, pos[2]], .22, seed);
        }
        return;
      }
      case 'destroyed': {
        const u = sim && sim.units.get(ev.unit), pos = ev.pos, dom = u ? u.def.domain : (this.wet(pos[0], pos[2]) ? 'none' : 'land');
        if (dom === 'none') return;
        if (dom === 'sea') {
          const L = u.def.size[0], B = u.def.size[1];
          this.add(new Blast({ t0: t + .3, pos: [pos[0], pos[1] + 6, pos[2]], sc: 1.4, sea: true, gy: 0, seed: seed + 5 }), 3);
          const f = this.fires.get(ev.unit) || this.startFire(u, t, null, L > 200 ? 1.5 : 1, seed);
          f.k = 1;
          this.sinks.set(ev.unit, this.add(new Sinking({ t0: t, pos, hdg: u.hdg, L, B, seed, dur: u.def.dieTime }), 0));
        } else if (dom === 'air') {
          const v = u ? [Math.sin(u.hdg) * u.speed, 0, Math.cos(u.hdg) * u.speed] : [0, 0, 0];
          this.add(new Burst({ t0: t, pos, mom: v, sc: .9, nF: 200, ns: 90, fire: 1.3, smoke: 40, life: 9, gy: this.groundAt(pos[0], pos[2]), seed, kind: 'air' }), 3);
          if (u) this.falls.set(ev.unit, new Trail(1600, seed, this.C.ground));
        } else {
          const gy = this.groundAt(pos[0], pos[2]);
          this.add(new Blast({ t0: t, pos: [pos[0], gy + 2, pos[2]], sc: .45, sea: false, gy, seed: seed + 5 }), 3);
          const f = u ? (this.fires.get(ev.unit) || this.startFire(u, t, null, .3, seed)) : this.startFire(null, t, [pos[0], gy, pos[2]], .3, seed);
          f.k = 1;
        }
        return;
      }
      case 'gunfire': {
        const u = sim && sim.units.get(ev.unit);
        if (u && !this.seeUnit(u)) return;
        const w = ev.weapon === 'gun30' ? 'gun30' : 'ciws';
        const s = new TracerStream({ t0: t, mz: ev.pos, to: ev.to, weapon: w, dur: ev.dur || 1, hit: ev.hit, seed, gy: 0 });
        this.add(s, 2);
        this.add(new Muzzle({ t0: t, mz: ev.pos, dir: s.D, dur: s.a1, seed, weapon: w }), 2);
        return;
      }
      case 'lightning': {
        const b = this.add(new Lightning({ t0: t, pos: ev.pos, top: ev.top, seed, s: 1 }), 4);
        this.bolts.push(b);
        return;
      }
      case 'takeoff': {
        if (ev.type === 'takeoff' && (ev.unit !== undefined)) {
          const u = sim && sim.units.get(ev.unit);
          if (u && u.type === 'fighter') this.abUntil.set(ev.unit, t + 7);
          // the catapult's breath of steam / the drone's launch puff
          if (ev.pos) this.add(new HotLaunch({ t0: t, pos: ev.pos, axis: u ? dirOf(u.hdg, 0) : [0, 0, 1], seed, scale: u && u.type === 'fighter' ? .9 : .3 }), 1);
        }
        return;
      }
      default: return;
    }
  }
  onHit(ev, t, seed) {
    const sim = this.sim, u = sim && sim.units.get(ev.target), pos = ev.pos, k = ev.kind, sc = HIT_SC[k] || .3;
    const dom = u ? u.def.domain : (this.wet(pos[0], pos[2]) ? 'sea' : 'land');
    if (u) {
      // where it struck, in the unit's frame (the fire burns there as the ship turns)
      const s = Math.sin(u.hdg), c = Math.cos(u.hdg), dx = pos[0] - u.pos[0], dz = pos[2] - u.pos[2];
      this.hitAt.set(u.id, [dx * s + dz * c, Math.max(2, pos[1] - u.pos[1]), dx * c - dz * s]);
    }
    if (dom === 'air') {
      const v = u ? [Math.sin(u.hdg) * u.speed, 0, Math.cos(u.hdg) * u.speed] : [0, 0, 0];
      this.add(new Burst({ t0: t, pos, mom: v, sc: GUNS[k] ? .25 : .6, nF: GUNS[k] ? 40 : 120, ns: GUNS[k] ? 40 : 70, fire: GUNS[k] ? .4 : 1, smoke: GUNS[k] ? 10 : 30, life: 7, gy: this.groundAt(pos[0], pos[2]), seed, kind: 'air' }), 3);
      if (u && !GUNS[k] && !this.falls.has(u.id)) this.falls.set(u.id, new Trail(1200, seed, this.C.ground));
      return;
    }
    const sea = dom === 'sea', gy = sea ? 0 : this.groundAt(pos[0], pos[2]);
    this.add(new Blast({ t0: t, pos, sc, sea, gy, seed }), 3);
    if (!sea && sc >= .15) this.add(new Dirt({ t0: t, pos: [pos[0], gy, pos[2]], size: 10 + 22 * sc, seed: seed + 1 }), 2);
    // a missile or a shell sets it burning
    if (u && sc >= .15) {
      const big = sea ? (u.def.size[0] > 200 ? 1.4 : 1) : .3;
      const f = this.fires.get(u.id) || this.startFire(u, t, null, big * Math.min(1, .45 + sc), seed);
      f.k = Math.min(1, (f.k || 0) + .35 + sc * .5);
    }
  }
  /* a fire on a unit (or on the ground where a wreck fell) */
  startFire(u, t, at, size, seed) {
    const loc = u ? (this.hitAt.get(u.id) || [0, 3, 0]) : [0, 1, 0];
    const deck = u ? u.def.size[2] * (u.def.domain === 'sea' ? .2 : .3) : 1;
    const f = new Fire({ t0: t, seed: seed + 11, size, local: [loc[0], Math.max(deck, loc[1] * .6), loc[2] * .5],
      spread: u && u.def.domain === 'sea' ? [Math.min(u.def.size[0] * .17, 30) * size, 14 * size, Math.min(u.def.size[1] * .3, 8)] : [3.5, 3, 1.6],
      ceiling: u && u.def.domain === 'sea' ? 900 * size : 220 });
    f.k = .6; f.unit = u ? u.id : 0; f.land = !u || u.def.domain === 'land';
    if (u) this.fires.set(u.id, f);
    else { f.at = at.slice(); f.stopAt = t + 90; f.follow(t, f.at, 0, f.k); this.groundFires.push(f); }
    this.add(f, 0);
    return f;
  }

  /* ---------- per frame: feed the persistent effects from the sim ---------- */
  update(dtReal, dtSim) {
    this.tr += dtReal || 0;
    const sim = this.sim; if (!sim) return;
    const t = sim.t;
    // projectiles: puffs laid along the flight since the last frame
    for (const p of sim.projectiles.values()) {
      let tr = this.trk.get(p.id);
      if (!tr) {
        tr = { id: p.id, kind: p.kind, t0: p.t0 !== undefined ? p.t0 : t, trail: new Trail(p.kind === 'sm6' ? 14000 : p.kind === 'oniks' ? 8000 : 6000, p.id, this.C.ground), vel: [0, 0, 0], pos: p.pos.slice(), seen: false, killed: false, P: p.P };
        this.trk.set(p.id, tr);
      }
      tr.vel[0] = p.vel[0]; tr.vel[1] = p.vel[1]; tr.vel[2] = p.vel[2];
      tr.pos[0] = p.pos[0]; tr.pos[1] = p.pos[1]; tr.pos[2] = p.pos[2];
      tr.alive = p.alive; tr.p = p;
      const age = t - tr.t0, vis = this.seeProj(p);
      tr.seen = tr.seen || vis;
      const pr = profile(p.kind, age, p.P);
      if (pr[0] && vis) {
        // puffs leave the nozzle, not the round's middle
        const v = p.vel, l = Math.hypot(v[0], v[1], v[2]) || 1, ax = v[0] / l, ay = v[1] / l, az = v[2] / l, nz = pr[1] ? pr[1].off : (NOZ[p.kind] || 2);
        tr.trail.feed(t, p.pos[0] - ax * nz, p.pos[1] - ay * nz, p.pos[2] - az * nz, pr[0], ax, ay, az);
      } else tr.trail.lx = NaN;
    }
    // rounds gone this frame: their smoke hangs on; the tracker is kept a moment for the events that follow
    for (const [id, tr] of this.trk) {
      if (!sim.projectiles.has(id) || !tr.alive) { this.trk.delete(id); tr.goneT = t; this.gone.set(id, tr); if (tr.trail.n) this.ghost.push(tr.trail); }
    }
    for (const [id, tr] of this.gone) if (t - tr.goneT > 2) this.gone.delete(id);
    for (let i = this.ghost.length - 1; i >= 0; i--) if (this.ghost[i].done(t)) this.ghost.splice(i, 1);
    // units: wakes, fires, sinking, falling aircraft
    for (const u of sim.units.values()) {
      const dom = u.def.domain;
      if (dom === 'sea' && this.wakes) {
        let w = this.wk.get(u.id);
        if (!w) { w = new Wake({ L: u.def.size[0], B: u.def.size[1], seed: u.id, len: u.def.size[0] > 200 ? 1800 : 1400 }); this.wk.set(u.id, w); }
        w.update(u.pos, u.hdg, u.speed || 0, t); w.vis = this.seeUnit(u);
      }
      const f = this.fires.get(u.id);
      if (f) {
        let k = f.k;
        if (u.alive) { const hp = u.hp / u.hpMax; k = Math.max(k * .9995, sat((.85 - hp) * 1.4)); }
        else if (dom === 'sea') k = u.dying < .8 ? 1 : Math.max(0, 1 - (u.dying - .8) / .17);
        f.k = k; f.follow(t, u.pos, u.hdg, this.seeUnit(u) ? k : 0);
        if (dom === 'sea' && !u.alive && u.dying > .97) f.stop(t);
      } else if (u.alive && u.hp < u.hpMax * .55 && dom !== 'air' && this.hitAt.has(u.id)) {
        this.startFire(u, t, null, dom === 'sea' ? (u.def.size[0] > 200 ? 1.2 : .8) : .25, u.id * 17);
      }
      const s = this.sinks.get(u.id); if (s) s.follow(u.pos, u.hdg, u.dying || 0);
      const fl = this.falls.get(u.id);
      if (fl) {
        if (u.alive && u.hp > u.hpMax * .6) { this.falls.delete(u.id); this.ghost.push(fl); }
        else { const v = [Math.sin(u.hdg) * u.speed, u.vy || 0, Math.cos(u.hdg) * u.speed], l = Math.hypot(v[0], v[1], v[2]) || 1; fl.feed(t, u.pos[0], u.pos[1], u.pos[2], u.alive ? STAGE.damaged : STAGE.wreck, v[0] / l, v[1] / l, v[2] / l); }
      }
    }
    // units gone: their wakes fade out in the water, fires burn out, the slick stays a while
    for (const [id, w] of this.wk) if (!sim.units.has(id)) { w.alive = false; w.speed = 0; if (w.done(t)) this.wk.delete(id); }
    for (const [id, f] of this.fires) if (!sim.units.has(id)) {
      this.fires.delete(id);
      // a wreck on land burns on where it stood (the model is gone, the fire and its smoke are not)
      if (f.land) { f.at = f.pos.slice(); f.stopAt = t + 75; this.groundFires.push(f); } else f.stop(t);
    }
    for (const [id, fl] of this.falls) if (!sim.units.has(id)) { this.falls.delete(id); this.ghost.push(fl); }
    for (const [id] of this.sinks) if (!sim.units.has(id)) this.sinks.delete(id);
    // wrecks burning on the ground: they lay their smoke until they burn out
    for (let i = this.groundFires.length - 1; i >= 0; i--) {
      const f = this.groundFires[i];
      if (t >= f.stopAt) { f.stop(f.stopAt); this.groundFires.splice(i, 1); continue; }
      f.follow(t, f.at, f.hdg, f.k * (1 - sat((t - f.stopAt + 30) / 30)));
    }
    // effects past their time
    const fx = this.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      const over = e instanceof Fire ? e.done(t) : t - e.t0 > (e.durAll || e.dur) + .5;
      if (over) fx.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) if (t - this.bolts[i].t0 > this.bolts[i].dur) this.bolts.splice(i, 1);
    this.lastT = t;
  }

  /* the frame context's draw calls over a sink (built once per sink: no allocation per frame) */
  bind(sink, RR) {
    const C = this.C, V = this.V;
    this._sink = sink; this._RR = RR;
    // the sink: dot (max), add (additive square dot), glow (soft additive disc) as the game's frame.sink has them;
    // a minimal sink with only dot / glow (glow = additive dot) works too (the discs become additive dots)
    const sdot = sink.dot, sadd = sink.add || sink.glow || sink.dot, sdisc = sink.add ? sink.glow : sink.halo;
    C.dot = (x, y, z, s, r, gg, b, a) => { if (C.n < C.cap) { C.n++; sdot(x, y, z, s, r, gg, b, a); } };
    C.glow = (x, y, z, s, r, gg, b, a) => { if (C.n < C.cap) { C.n++; sadd(x, y, z, s, r, gg, b, a); } };
    C.halo = sdisc ? (x, y, z, s, r, gg, b, a) => { C.n++; sdisc(x, y, z, s, r, gg, b, a); } : (x, y, z, s, r, gg, b, a) => { C.n++; sadd(x, y, z, Math.max(2, Math.round((s > 0 ? s : -s * V.pxm(x, y, z)) * .9)), r, gg, b, a * .35); };
    C.light = sink.light ? (x, y, z, r, gg, b, i, rad) => { if (i > .01) sink.light(x, y, z, r, gg, b, i, rad); } : () => {};
    C.lift = sink.lift ? (v, r, gg, b) => { if (v > .002) sink.lift(v, r, gg, b); } : () => {};
    C.model = sink.model ? sink.model : RR && RR.draw && RR.models ? (key, pos, R9, a) => {
      if (!RR.models.has || !RR.models.has(key)) return false;
      RR.draw({ key, T: [pos[0], pos[1], pos[2]], R: R9, tint: 'neutral', alpha: a === undefined ? 1 : a });
      return true;
    } : null;
  }

  /* ---------- draw ---------- */
  draw3d(frame) {
    const t0 = performance.now();
    const g = this.game, sim = this.sim;
    let sink = frame && frame.sink;
    if (!sink) {
      const R = (frame && (frame.renderer || frame.R)) || (g && g.renderer);
      if (!R) return;
      if (!this._es || this._es.R !== R) this._es = engineSink(R);
      sink = this._es.refresh();
    }
    const C = this.C, V = this.V;
    V.set(sink.cam);
    // render time: between the last two ticks, like the models
    const DT = (sim && sim.DT) || .05;
    const alpha = frame && frame.alpha !== undefined ? frame.alpha : g && g.alpha !== undefined ? g.alpha : 1;
    const t = frame && frame.t !== undefined ? frame.t : sim ? sim.t - (1 - alpha) * DT : 0;
    C.t = t; C.tr = frame && frame.tr !== undefined ? frame.tr : frame && frame.realT !== undefined ? frame.realT : this.tr; C.q = this.q;
    const wnd = sim && sim.weather ? sim.weather.wind : (g && g.wind) || [0, 0];
    C.wind[0] = wnd[0] || 0; C.wind[1] = 0; C.wind[2] = wnd.length > 2 ? wnd[2] : (wnd[1] || 0);
    C.n = 0; C.cap = this.budget; C.sink = sink;
    // the sink: dot (max), add (additive square dot), glow (soft additive disc) as the game's frame.sink has them;
    // a minimal sink with only dot / glow (glow = additive dot) works too (the discs become additive dots)
    // models (a tumbling booster casing): the sink's own, or the engine's R.draw when it knows the key
    const RR = (frame && frame.R) || (g && g.renderer);
    if (sink !== this._sink || RR !== this._RR) this.bind(sink, RR);
    // lightning in the air freezes the rain
    let flash = 0;
    for (const b of this.bolts) flash = Math.max(flash, b.level(t - b.t0));
    C.flash = flash;
    const P = this.prof ? (this.profD = this.profD || {}) : null;
    let tp = P ? performance.now() : 0;
    const mark = k => { if (!P) return; const n = performance.now(); P[k] = (P[k] || 0) * .9 + (n - tp) * .1; tp = n; };
    // 1. flashes, heads and flames first: the budget never cuts them
    for (const e of this.fx) if (e.layer >= 3 || e.layer === 1) { const a = t - e.t0; if (a >= -.001) e.draw(C, a); }
    mark('flash');
    if (sim) {
      const fr = Math.floor(C.tr * 60);
      for (const tr of this.trk.values()) {
        const p = tr.p; if (!p || !p.alive || !this.seeProj(p)) continue;
        const age = t - tr.t0, pr = profile(p.kind, age, p.P); if (!pr[1] && !pr[2]) continue;
        const x = p.prev[0] + (p.pos[0] - p.prev[0]) * alpha, y = p.prev[1] + (p.pos[1] - p.prev[1]) * alpha, z = p.prev[2] + (p.pos[2] - p.prev[2]) * alpha;
        const v = p.vel, l = Math.hypot(v[0], v[1], v[2]) || 1;
        if (pr[1]) drawPlume(C, x, y, z, v[0] / l, v[1] / l, v[2] / l, pr[1], ignOf(p.kind, age), p.id, fr);
        if (pr[2] && V.pxm(x, y, z) < 3) drawHead(C, x, y, z, pr[2], 1);
      }
      // jets and rotors
      for (const u of sim.units.values()) {
        if (u.def.domain !== 'air' || u.aboard || !this.seeUnit(u)) continue;
        const pos = g && g.unitPose ? g.unitPose(u, alpha).pos : u.pos;
        if (u.type === 'fighter') {
          const ab = Math.max(u.ab || 0, (this.abUntil.get(u.id) || 0) > t ? 1 : 0);
          drawJet(C, pos, u.hdg, u.pitch, u.roll, ab, .6, u.id);
        } else if (u.type === 'helo') {
          const gy = this.groundAt(pos[0], pos[2]);
          this.down.seed = u.id; this.down.draw(C, pos, gy, this.wet(pos[0], pos[2]), 1);
        }
      }
    }
    mark('heads');
    // 2. bursts' debris, splashes, casings, tracers
    for (const e of this.fx) if (e.layer === 2) { const a = t - e.t0; if (a >= -.001) e.draw(C, a); }
    mark('debris');
    // 3. smoke: trails, columns, wakes, weather
    for (const tr of this.trk.values()) tr.trail.draw(C, 1);
    for (const tr of this.ghost) tr.draw(C, 1);
    for (const fl of this.falls.values()) fl.draw(C, 1);
    mark('trails');
    for (const e of this.fx) if (e.layer === 0) { const a = t - e.t0; if (a >= -.001) e.draw(C, a); }
    mark('fires');
    if (this.wakes) for (const w of this.wk.values()) if (w.vis !== false) w.draw(C, 1);
    mark('wakes');
    if (sim && sim.weather) {
      const W = sim.weather, k = W.kind === 'storm' ? 1 : W.kind === 'rain' ? .6 : 0;
      if (k) {
        const ex = V.eye; let inRain = 0;
        for (const s of W.squalls || []) { const d = Math.hypot(ex[0] - s.x, ex[2] - s.z); inRain = Math.max(inRain, sat((s.r - d) / 800 + 1) * (d < s.r + 800 ? 1 : 0)); }
        drawRain(C, k * Math.max(.15, inRain), flash);
        drawShafts(C, W.squalls, k);
      }
    }
    // the budget: thin everything next frame if this one ran over, recover slowly
    // (the budget is also the hard cap: a spike frame loses its last-drawn smoke, never a flash or a head)
    const n = C.n, aim = this.budget * .85;
    if (n > aim) this.q = Math.max(.12, this.q * Math.max(.6, aim / n));
    else if (n < aim * .8) this.q = Math.min(1, this.q * 1.04 + .005);
    this.lastN = n;
    this.stats.dots = n; this.stats.q = this.q; this.stats.effects = this.fx.length; this.stats.trails = this.trk.size + this.ghost.length; this.stats.ms = performance.now() - t0;
  }
}
/* ignition envelope of the flame (the booster lighting, the ramjet catching) */
function ignOf(kind, age) {
  if (kind === 'oniks') return age < 7 ? sat((age - .38) / .12) : sat((age - 7.35) / .4);
  return sat(age / .12);
}

/* ---------------- the engine's streaming API as a sink ---------------- */
/* R: engine Renderer (R.fx.dotXYZ(x, y, z, size, r, g, b, a, mode), R.fx.glow, R.fx.lift, R.light, R.camera) */
function engineSink(R) {
  const fx = R.fx, cam0 = R.camera;
  const P = [0, 0, 0], RGB = [0, 0, 0];
  const s = {
    R,
    cam: { eye: [0, 0, 0], f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], fl: 1000, tanX: 1, tanY: .6, near: .5 },
    dot: (x, y, z, sz, r, g, b, a) => fx.dotXYZ(x, y, z, sz, r, g, b, a, 'max'),
    add: (x, y, z, sz, r, g, b, a) => fx.dotXYZ(x, y, z, sz, r, g, b, a, 'add'),
    glow: (x, y, z, rad, r, g, b, a) => { P[0] = x; P[1] = y; P[2] = z; RGB[0] = r; RGB[1] = g; RGB[2] = b; fx.glow(P, rad, RGB, a); },
    light: (x, y, z, r, g, b, i, rad) => R.light([x, y, z], rad, [r, g, b], Math.min(2, i)),
    lift: (v, r, g, b) => fx.lift(v, [r, g, b]),
    refresh() {
      const c = R.camera || cam0, k = s.cam;
      k.eye = c.eye; k.f = c.f; k.r = c.r; k.u = c.u;
      k.fl = 540 / Math.tan(c.fov / 2);
      k.tanX = (c.W / 2) / c.fl; k.tanY = (c.H / 2) / c.fl; k.near = c.near || .5;
      return s;
    },
  };
  return s;
}

export function createFx(game, opts) { return new FxSystem(game, opts); }
export { FxSystem };
