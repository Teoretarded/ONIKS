/* A small stand-in for game/src/sim (the parts the FX system reads): units, projectiles flown with the same kind of
   steering (vertical rise, eased pitch-over, cruise altitude or pursuit), and the same events. Deterministic:
   the bench re-runs it from zero to scrub. Scripted actions (the bench's buttons) run at their sim times. */
import { landH, ground } from './scene.js';

export const DT = .05;
const G = 9.81;
const PROJ = {
  oniks: { speed: 750, vert: 1.4, v0: 30, boost: 6, sepAt: 7, alt: 40, seaAlt: 15, pitchMax: .55, pitchRate: .35, turn: .25, mode: 'cruise' },
  tlam: { speed: 245, vert: 2, v0: 25, boost: 12, sepAt: 12, alt: 60, seaAlt: 40, pitchMax: .5, pitchRate: .3, turn: .12, mode: 'cruise' },
  // (the bench's SM-6 turns harder than the game's so its intercepts happen in frame)
  sm6: { speed: 1100, vert: 1.2, v0: 20, boost: 6, sepAt: 6, turn: .8, pitchRate: .9, bendT: .7, mode: 'direct' },
  sam: { speed: 900, vert: 0, v0: 60, boost: 2.4, sepAt: 2.4, turn: .6, pitchRate: .6, mode: 'direct' },
  shell: { speed: 810, mode: 'ballistic' },
  // the Kh-35U (Bal) and the 3M-54 Kalibr (Kilo), as data/units.js flies them; the bench's Kalibr also flies the
  // supersonic dash the game's sim does not have yet (dashAt: m from the target), to judge its plume
  uran: { speed: 270, vert: 0, v0: 35, boost: 2, sepAt: 2, alt: 25, seaAlt: 10, pitchMax: .45, pitchRate: .35, turn: .3, mode: 'cruise' },
  kalibr: { speed: 280, vert: 1.6, v0: 25, boost: 5, sepAt: 5, alt: 30, seaAlt: 15, pitchMax: .5, pitchRate: .35, turn: .2, mode: 'cruise', dashAt: 5000, dash: 700 },
  // torpedoes: under the water, not drawn (a helicopter's falls into the sea first)
  mk48: { speed: 28, depth: 60, mode: 'run', torpedo: true },
  mk54: { speed: 20, depth: 40, mode: 'run', torpedo: true },
  t53: { speed: 25, depth: 50, mode: 'run', torpedo: true },
};
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class FakeSim {
  constructor() {
    this.t = 0; this.tick = 0; this.DT = DT; this.nextId = 1;
    this.units = new Map(); this.projectiles = new Map(); this.events = [];
    this.map = { h: landH, W: 60000, H: 60000 };
    this.weather = { kind: 'calm', wind: [1.4, -2.6], squalls: [] };
    this.actions = [];
    // the ship steaming north-north-west at 9 m/s, the battery on the bluff, a Pantsir, a Seahawk, a Hornet
    this.ship = this.addUnit('destroyer', 'fleet', 'sea', [155, 20, 45], [4200, 0, -600], -.25, 9, 110, 60);
    const bh = (x, z) => ground(x, z);
    this.telA = this.addUnit('tel', 'coast', 'land', [13.9, 3.1, 4], [-2500, bh(-2500, -300), -300], Math.PI / 2, 0, 30, 20);
    this.telB = this.addUnit('tel', 'coast', 'land', [13.9, 3.1, 4], [-2560, bh(-2560, 240), 240], Math.PI / 2 + .1, 0, 30, 20);
    this.pantsir = this.addUnit('pantsir', 'coast', 'land', [11.5, 3.1, 4.6], [-2380, bh(-2380, 900), 900], Math.PI / 2, 0, 30, 20);
    this.helo = this.addUnit('helo', 'fleet', 'air', [19.8, 16.4, 5.1], [3700, 60, 300], -.4, 0, 12, 8);
    this.fighter = this.addUnit('fighter', 'fleet', 'air', [18.3, 13.6, 4.9], [1200, 420, -1600], 0, 210, 15, 10);
    this.heloAlt = 60;
    // the Bal on the bluff, its pack raised, its back to the sea; a Kilo at periscope depth, a Virginia; an E-2D
    this.bal = this.addUnit('bal', 'coast', 'land', [14, 3.1, 3.6], [-2380, bh(-2380, -900), -900], -Math.PI / 2 - .15, 0, 30, 20);
    this.kilo = this.addUnit('ssk', 'coast', 'sea', [73.8, 9.9, 14], [2600, 0, 1900], .55, 3.6, 45, 45);
    Object.assign(this.kilo.def, { draught: 6.2, sub: { pd: 16, deep: 150, rate: 1.2, speeds: [5.1, 3.6, 8.7] } });
    this.ssn = this.addUnit('ssn', 'fleet', 'sea', [114.9, 10.4, 17.2], [6200, 0, 2600], -.4, 4.5, 70, 60);
    Object.assign(this.ssn.def, { draught: 9.3, sub: { pd: 18, deep: 180, rate: 1.5, speeds: [6.2, 5.1, 12.9] } });
    for (const b of [this.kilo, this.ssn]) { b.dive = 1; b.depth = b.def.sub.pd; b.mastUp = 1; b.pos[1] = b.prev[1] = -(b.depth - b.def.draught); }
    this.aew = this.addUnit('aew', 'fleet', 'air', [17.6, 24.56, 5.58], [3000, 450, -600], 0, 150, 12, 10);
  }
  addUnit(type, side, domain, size, pos, hdg, speed, hp, dieTime) {
    const u = { id: this.nextId++, type, side, def: { domain, size, dieTime }, pos: pos.slice(), prev: pos.slice(), p0: pos.slice(), hdg, prevHdg: hdg, pitch: 0, roll: 0, speed, hp, hpMax: hp, alive: true, dying: 0, st: {} };
    this.units.set(u.id, u);
    return u;
  }
  emit(type, e) { e.type = type; e.t = this.t; this.events.push(e); return e; }
  drainEvents() { const e = this.events; this.events = []; return e; }
  at(t, fn) { this.actions.push({ t, fn, done: false }); this.actions.sort((a, b) => a.t - b.t); }

  /* ---------- projectiles ---------- */
  launch(kind, side, from, pos, hdg, pitch, o) {
    o = o || {};
    const P = PROJ[kind], p = {
      id: this.nextId++, kind, side, P, pos: pos.slice(), prev: pos.slice(), vel: [0, 0, 0], from: from ? from.id : 0, t0: this.t, age: 0, alive: true,
      hdg, pitch, spd: o.spd !== undefined ? o.spd : (P.v0 || P.speed), target: o.target, aimPt: o.aim, sep: false, st: { booster: true },
      kill: o.kill !== undefined ? o.kill : true, maxT: o.maxT || 60, ciws: o.ciws, hitShip: o.hitShip, splashAt: o.splashAt, ball: null,
    };
    if (kind === 'shell') {
      const aim = o.aim, R = Math.hypot(aim[0] - pos[0], aim[2] - pos[2]), v = P.speed, th = .5 * Math.asin(Math.min(1, G * R / (v * v))), T = R / (v * Math.cos(th));
      const vx = (aim[0] - pos[0]) / T, vz = (aim[2] - pos[2]) / T, vy = (aim[1] - pos[1] + .5 * G * T * T) / T;
      p.ball = { p0: pos.slice(), v: [vx, vy, vz], T, imp: aim.slice() };
      p.hdg = Math.atan2(vx, vz); p.pitch = Math.atan2(vy, Math.hypot(vx, vz));
    }
    if (o.inFlight) { p.age = o.inFlight; p.t0 = this.t - o.inFlight; p.sep = true; p.st.booster = false; p.spd = P.speed; }
    this.setVel(p);
    this.projectiles.set(p.id, p);
    if (!o.inFlight) this.emit('launch', { proj: p.id, kind, side, from: p.from, target: o.target, tk: 'proj', pos: pos.slice(), hdg: p.hdg, pitch: p.pitch, weapon: o.weapon || kind });
    return p;
  }
  setVel(p) { const c = Math.cos(p.pitch); p.vel[0] = p.spd * Math.sin(p.hdg) * c; p.vel[1] = p.spd * Math.sin(p.pitch); p.vel[2] = p.spd * Math.cos(p.hdg) * c; }
  kill(p) { p.alive = false; }
  stepProj(p) {
    const P = p.P;
    p.age += DT;
    if (P.mode === 'run') return this.stepTorp(p);
    if (P.mode === 'ballistic') {
      const b = p.ball, a = Math.min(p.age, b.T);
      p.pos[0] = b.p0[0] + b.v[0] * a; p.pos[1] = b.p0[1] + b.v[1] * a - .5 * G * a * a; p.pos[2] = b.p0[2] + b.v[2] * a;
      p.vel[0] = b.v[0]; p.vel[1] = b.v[1] - G * a; p.vel[2] = b.v[2];
      if (p.age >= b.T) {
        const s = this.ship, dx = b.imp[0] - s.pos[0], dz = b.imp[2] - s.pos[2];
        if (p.target === s.id && Math.hypot(dx, dz) < 40) this.hitUnit(s, b.imp, 'shell', p, 6);
        else if (p.hitUnit) this.hitUnit(p.hitUnit, [b.imp[0], p.hitUnit.pos[1] + 2, b.imp[2]], 'shell', p, 12);
        else this.emit('splash', { pos: b.imp.slice(), kind: 'shell', side: p.side, proj: p.id, air: false, water: landH(b.imp[0], b.imp[2]) < 0 });
        this.kill(p);
      }
      return;
    }
    // target and aim point
    let tgt = null, aim = p.aimPt;
    if (typeof p.target === 'number') {
      tgt = this.projectiles.get(p.target) || this.units.get(p.target);
      if (tgt && !tgt.alive) tgt = null;
      if (tgt) {
        const vx = (tgt.pos[0] - tgt.prev[0]) / DT, vy = (tgt.pos[1] - tgt.prev[1]) / DT, vz = (tgt.pos[2] - tgt.prev[2]) / DT;
        const d = Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[1] - p.pos[1], tgt.pos[2] - p.pos[2]), tgo = clamp(d / Math.max(700, p.P.speed * .8 + Math.hypot(vx, vy, vz)), 0, 25);
        aim = [tgt.pos[0] + vx * tgo, tgt.pos[1] + vy * tgo + (tgt.def ? 6 : 0), tgt.pos[2] + vz * tgo];
      }
    }
    if (!aim) aim = [p.pos[0] + p.vel[0] * 10, p.pos[1], p.pos[2] + p.vel[2] * 10];
    p.spd = p.age < (P.boost || 0) ? (P.v0 || 0) + (P.speed - (P.v0 || 0)) * ease(p.age / P.boost) : P.speed;
    if (P.dashAt && tgt && !p.dash && p.age > (P.sepAt || 0) + 2 && Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[2] - p.pos[2]) < P.dashAt) { p.dash = true; p.dashT = p.age; }
    if (p.dash) p.spd = P.speed + (P.dash - P.speed) * ease((p.age - p.dashT) / 1.5);
    const dx = aim[0] - p.pos[0], dz = aim[2] - p.pos[2], dist = Math.hypot(dx, dz);
    if (p.age >= (P.vert || 0)) {
      const hT = Math.atan2(dx, dz), bend = ease((p.age - (P.vert || 0)) / (P.bendT || 2.5));
      const g = Math.max(ground(p.pos[0], p.pos[2]), ground(p.pos[0] + p.vel[0] * 3, p.pos[2] + p.vel[2] * 3));
      let pT;
      if (P.mode === 'direct') pT = Math.atan2(aim[1] - p.pos[1], Math.max(1, dist));
      else {
        const near = dist < Math.max(1200, p.spd * 2.5), sea = g <= 0 && dist < 60000;
        const yT = near ? aim[1] : g + (sea ? P.seaAlt : P.alt);
        pT = clamp(Math.atan2(yT - p.pos[1], near ? Math.max(1, dist) : p.spd * 4), -P.pitchMax - (near ? .3 : 0), P.pitchMax);
      }
      const tr = P.turn * DT * (P.vert ? Math.max(.15, bend) : 1), pr = P.pitchRate * DT * (P.vert ? Math.max(.1, bend) : 1);
      p.hdg += clamp(wrapPi(hT - p.hdg), -tr, tr);
      p.pitch += clamp(pT - p.pitch, -pr, pr);
    }
    this.setVel(p);
    for (let k = 0; k < 3; k++) p.pos[k] += p.vel[k] * DT;
    if (P.sepAt && !p.sep && p.age >= P.sepAt) { p.sep = true; p.st.booster = false; this.emit('booster_sep', { proj: p.id, kind: p.kind, side: p.side, pos: p.pos.slice(), vel: p.vel.slice() }); }
    // resolution
    if (tgt && !tgt.def) {
      // closest approach during the tick (both move ~50 m a tick)
      const r0x = tgt.prev[0] - p.prev[0], r0y = tgt.prev[1] - p.prev[1], r0z = tgt.prev[2] - p.prev[2];
      const ddx = (tgt.pos[0] - tgt.prev[0]) - (p.pos[0] - p.prev[0]), ddy = (tgt.pos[1] - tgt.prev[1]) - (p.pos[1] - p.prev[1]), ddz = (tgt.pos[2] - tgt.prev[2]) - (p.pos[2] - p.prev[2]);
      const dd = ddx * ddx + ddy * ddy + ddz * ddz, sc = dd > 1e-9 ? clamp(-(r0x * ddx + r0y * ddy + r0z * ddz) / dd, 0, 1) : 1;
      const d = Math.hypot(r0x + ddx * sc, r0y + ddy * sc, r0z + ddz * sc);
      if (d < 45) {
        const mid = [(p.pos[0] + tgt.pos[0]) / 2, (p.pos[1] + tgt.pos[1]) / 2, (p.pos[2] + tgt.pos[2]) / 2];
        if (p.kill) { this.emit('intercept', { pos: mid, proj: tgt.id, kind: tgt.kind, side: tgt.side, by: p.id, byKind: p.kind, unit: p.from, target: tgt.target }); this.kill(tgt); this.kill(p); }
        else { this.emit('splash', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, air: true, miss: true }); this.kill(p); }
        return;
      }
    }
    if (tgt && tgt.def && tgt.def.domain === 'sea') {
      const d = Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[2] - p.pos[2]);
      if (p.splashAt && d < p.splashAt) { const pos = [p.pos[0] + p.vel[0] * .1, 0, p.pos[2] + p.vel[2] * .1]; this.emit('splash', { pos, kind: p.kind, side: p.side, proj: p.id, air: false, water: true, why: 'pk' }); this.kill(p); return; }
      if (d < 14 && p.pos[1] < 30) { this.hitUnit(tgt, [p.pos[0], Math.max(p.pos[1], 4), p.pos[2]], p.kind, p, p.kind === 'oniks' ? 60 : 30); this.kill(p); return; }
    }
    if (tgt && tgt.def && tgt.def.domain === 'land') {
      const d = Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[1] - p.pos[1], tgt.pos[2] - p.pos[2]);
      if (d < 12) { this.hitUnit(tgt, p.pos.slice(), p.kind, p, 40); this.kill(p); return; }
    }
    if (p.pos[1] < ground(p.pos[0], p.pos[2]) + 1 && p.age > 3) { this.emit('splash', { pos: [p.pos[0], ground(p.pos[0], p.pos[2]), p.pos[2]], kind: p.kind, side: p.side, proj: p.id, air: false, water: landH(p.pos[0], p.pos[2]) < 0, why: 'terrain' }); this.kill(p); return; }
    if (p.age > p.maxT) { this.emit('splash', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, air: p.pos[1] > 30, miss: true, why: 'selfdestruct' }); this.kill(p); }
  }
  /* a torpedo: into the water (off a helicopter: falling first), then running at depth to its target */
  stepTorp(p) {
    const P = p.P;
    if (p.phase !== 'run' && p.pos[1] > -3) { p.pos[1] -= (p.pos[1] > 0 ? 18 : 4) * DT; p.vel[0] = 0; p.vel[1] = -10; p.vel[2] = 0; return; }
    p.phase = 'run';
    const tgt = this.units.get(p.target);
    p.spd = Math.min(P.speed, Math.max(p.spd || 0, 6) + 3 * DT);
    if (tgt && tgt.alive) { const h = Math.atan2(tgt.pos[0] - p.pos[0], tgt.pos[2] - p.pos[2]); p.hdg += clamp(wrapPi(h - p.hdg), -.3 * DT, .3 * DT); }
    const yT = tgt && tgt.def.sub ? tgt.pos[1] - 4 : -Math.min(P.depth, 12), vy = clamp(yT - p.pos[1], -4, 4);
    p.vel[0] = Math.sin(p.hdg) * p.spd; p.vel[1] = vy; p.vel[2] = Math.cos(p.hdg) * p.spd;
    p.pos[0] += p.vel[0] * DT; p.pos[1] = Math.min(-2, p.pos[1] + vy * DT); p.pos[2] += p.vel[2] * DT;
    if (tgt && tgt.alive && Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[2] - p.pos[2]) < Math.max(15, tgt.def.size[1] * .8)) {
      this.emit('hit', { pos: [tgt.pos[0], .5, tgt.pos[2]], target: tgt.id, kind: p.kind, side: p.side, from: p.from, proj: p.id, under: true });
      tgt.hp -= 60; if (tgt.hp <= 0 && tgt.alive) { tgt.alive = false; tgt.dying = 0; this.emit('destroyed', { unit: tgt.id, type: tgt.type, side: tgt.side, pos: [tgt.pos[0], Math.max(0, tgt.pos[1]), tgt.pos[2]] }); }
      this.kill(p); return;
    }
    if (p.age > p.maxT) { this.emit('torpedo_end', { pos: p.pos.slice(), kind: p.kind, side: p.side, proj: p.id, why: 'selfdestruct' }); this.kill(p); }
  }
  hitUnit(u, pos, kind, p, dmg) {
    this.emit('hit', { pos: pos.slice(), target: u.id, kind, side: p ? p.side : 'fleet', from: p ? p.from : 0, proj: p ? p.id : 0 });
    u.hp -= dmg;
    if (u.hp <= 0 && u.alive) { u.alive = false; u.dying = 0; this.emit('destroyed', { unit: u.id, type: u.type, side: u.side, pos: u.pos.slice() }); }
  }

  /* ---------- the step ---------- */
  step() {
    this.tick++; this.t = this.tick * DT;
    const t = this.t;
    for (const a of this.actions) if (!a.done && a.t <= t + 1e-9) { a.done = true; a.fn(this); }
    for (const u of this.units.values()) { u.prev[0] = u.pos[0]; u.prev[1] = u.pos[1]; u.prev[2] = u.pos[2]; u.prevHdg = u.hdg; }
    for (const p of this.projectiles.values()) { p.prev[0] = p.pos[0]; p.prev[1] = p.pos[1]; p.prev[2] = p.pos[2]; }
    // units
    const s = this.ship;
    if (s.alive || s.dying < 1) {
      if (!s.alive) { s.dying = Math.min(1, s.dying + DT / s.def.dieTime); s.speed *= .995; s.pos[1] = -45 * .7 * s.dying * s.dying; s.roll = .35 * Math.sin(s.dying * Math.PI * .5); s.pitch = -.08 * s.dying; }
      s.pos[0] += Math.sin(s.hdg) * s.speed * DT; s.pos[2] += Math.cos(s.hdg) * s.speed * DT;
      if (!s.alive && s.dying >= 1) { this.units.delete(s.id); this.emit('removed', { unit: s.id }); }
    }
    for (const u of [this.telA, this.telB]) if (!u.alive) { u.dying = Math.min(1, u.dying + DT / u.def.dieTime); if (u.dying >= 1 && this.units.has(u.id)) { this.units.delete(u.id); this.emit('removed', { unit: u.id }); } }
    // the boats: depth toward the ordered one (0 surface, 1 periscope depth, 2 deep), masts, headway
    for (const b of [this.kilo, this.ssn]) {
      if (!b.alive) { b.dying = Math.min(1, b.dying + DT / b.def.dieTime); continue; }
      const S = b.def.sub, goal = b.dive === 0 ? b.def.draught : b.dive === 1 ? S.pd : 80;
      b.depth += clamp(goal - b.depth, -S.rate * DT, S.rate * DT);
      const up = b.depth <= S.pd + 1.5 && b.dive < 2;
      b.mastUp = clamp(b.mastUp + (up ? DT / 6 : -DT / 3), 0, 1);
      const sub = b.depth > b.def.draught + 2.5, deep = b.depth > S.pd + 4;
      b.speed += clamp(S.speeds[!sub ? 0 : deep ? 2 : 1] * .8 - b.speed, -.1 * DT * 10, .1 * DT * 10);
      b.pos[0] += Math.sin(b.hdg) * b.speed * DT; b.pos[2] += Math.cos(b.hdg) * b.speed * DT; b.pos[1] = -(b.depth - b.def.draught);
    }
    const ae = this.aew, wa = ae.speed / 1800, aa = t * wa + 1;
    ae.pos[0] = 3000 + Math.sin(aa) * 1800; ae.pos[2] = -600 + Math.cos(aa) * 1800; ae.pos[1] = 450; ae.hdg = aa + Math.PI / 2; ae.roll = .22;
    const h = this.helo; h.pos[1] += (this.heloAlt - h.pos[1]) * Math.min(1, DT * .8); h.pos[0] = h.p0[0] + 10 * Math.sin(t * .1); h.pos[2] = h.p0[2] + 10 * Math.cos(t * .13);
    const f = this.fighter, w = f.speed / 1500, a = t * w;
    f.pos[0] = 1200 + Math.sin(a) * 1500; f.pos[2] = -1600 + Math.cos(a) * 1500 - 1500; f.pos[1] = 420; f.hdg = a + Math.PI / 2; f.roll = .45;
    // the Phalanx and the 30 mm guns: a round inside their reach is engaged once
    for (const p of this.projectiles.values()) {
      if (!p.alive) continue;
      if (p.ciws && !p.engaged) {
        const gun = p.ciws === 'gun30' ? this.pantsir : s;
        const d = Math.hypot(p.pos[0] - gun.pos[0], p.pos[1] - gun.pos[1], p.pos[2] - gun.pos[2]);
        if (d < (p.ciws === 'gun30' ? 2600 : 1900)) {
          p.engaged = true;
          const c = Math.cos(gun.hdg), sn = Math.sin(gun.hdg), off = p.ciws === 'gun30' ? [0, 3.4, 2.2] : [0, 16, 52];
          const mz = [gun.pos[0] + off[0] * c + off[2] * sn, gun.pos[1] + off[1], gun.pos[2] - off[0] * sn + off[2] * c];
          this.emit('gunfire', { unit: gun.id, side: gun.side, weapon: p.ciws === 'gun30' ? 'gun30' : 'ciws', pos: mz, to: p.pos.slice(), dur: p.ciws === 'gun30' ? 1 : .9, hit: true, target: p.id, tk: 'proj', mount: 0 });
          this.emit('intercept', { pos: p.pos.slice(), proj: p.id, kind: p.kind, side: p.side, by: gun.id, byKind: p.ciws === 'gun30' ? 'gun30' : 'ciws', unit: gun.id, target: p.target });
          this.kill(p);
        }
      }
    }
    for (const p of this.projectiles.values()) if (p.alive) this.stepProj(p);
    for (const [id, p] of this.projectiles) if (!p.alive) this.projectiles.delete(id);
  }
  visible() { return 'own'; }
  projVisible() { return true; }
}
