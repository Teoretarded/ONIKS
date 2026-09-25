/* ONIKS simulation: world state, fixed-step update, events, fog of war. Pure logic: no DOM, no GL.
   Deterministic from the seed (seeded M3.rng streams only; never Math.random). See README.md for the API. */
import { UNITS, PROJ, SIDES, ENEMY, CLASSIFY, TEL_ELEV } from '../data/units.js';
import { Nav } from './nav.js';
import { moveUnit } from './movement.js';
import { issue, processOrders } from './orders.js';
import { mechanics, carrierOps } from './mech.js';
import { senseTick, resolveScans, esmTick, sonarTick } from './sensors.js';
import { depthGoal } from './subs.js';
import { weaponsTick, stepProjectiles } from './weapons.js';
import { stepDying } from './damage.js';
import { economyTick, buy, checkResult } from './economy.js';
import { Weather } from './weather.js';
import { AI } from './ai.js';
import { rng as mkRng } from './rand.js';
import { DT, SENSE_EVERY } from './consts.js';

export { DT, SENSE_EVERY };

export class Sim {
  constructor(map, opts) {
    opts = opts || {};
    this.map = map;
    this.opts = opts;
    this.seed = (opts.seed >>> 0) || 1337;
    this.fog = opts.fog !== false;
    this.mode = opts.mode || 'sandbox';
    // combat ends on points after two hours unless an HQ falls first (opts.timeLimit: seconds, 0 = none)
    this.timeLimit = opts.timeLimit !== undefined ? opts.timeLimit : this.mode === 'combat' ? 7200 : 0;
    this.tick = 0; this.t = 0;
    this.nextId = 1;
    this.units = new Map();
    this.projectiles = new Map();
    this.events = [];
    this.counts = {};                  // event type -> total emitted (tests, stats)
    this.scans = [];
    this.result = null;
    const s = this.seed;
    const R = k => mkRng((Math.imul(s, 2654435761) ^ Math.imul(k, 40503)) >>> 0);
    this.rng = { fire: R(1), sense: R(2), dmg: R(3), wx: R(4), place: R(5), move: R(6), ai: { coast: R(7), fleet: R(8) } };
    this.nav = new Nav(map, opts.navCell);
    this.objectives = (map.objectives || []).map(o => ({ ...o, owner: null }));
    this.sides = {};
    for (const side of SIDES) {
      this.sides[side] = {
        side, supply: opts.supply !== undefined ? opts.supply : 600, income: 0,
        contacts: new Map(), scanCd: 0, trkNext: side === 'coast' ? 21 : 4001,
        queue: [], hadHq: false, holdT: 0, lost: 0, kills: 0, fired: 0, score: 0, value: 0,
      };
    }
    this.weather = new Weather(this, opts.weather || map.weather || { kind: 'calm', wind: [0, 0], sea: .2 });
    this.ai = {};
    for (const side of opts.aiSides || []) this.ai[side] = new AI(this, side, (opts.ai && opts.ai[side]) || opts.difficulty || 'normal');
    this._list = []; this._dirty = true; this._alive = { coast: [], fleet: [] };
    this._subBase = undefined;                                     // the coast boats' base (mech.replenishPoint)
  }

  /* ---------- units ---------- */
  spawn(type, side, x, z, o) {
    o = o || {};
    const def = UNITS[type];
    if (!def) throw new Error(`spawn: unknown type ${type}`);
    side = side || def.side;
    const id = this.nextId++, map = this.map;
    let y = 0;
    if (def.domain === 'land') y = Math.max(0, map.h(x, z));
    else if (def.domain === 'air') y = Math.max(0, map.h(x, z)) + (o.alt !== undefined ? o.alt : def.altDef);
    const hdg = o.hdg !== undefined ? o.hdg : 0;
    const u = {
      id, type, side, def,
      pos: [x, y, z], prev: [x, y, z], hdg, prevHdg: hdg, pitch: 0, roll: 0, speed: 0,
      hp: def.hp, hpMax: def.hp, alive: true, dying: 0,
      st: {}, orders: [], ammo: {}, cooldowns: { scan: 0 }, radarOn: !!(def.sensors.radar), deployed: !!def.static,
      parts: {}, off: {},
      hold: !!o.hold, path: null, wi: 0, goal: null, orbitR: 0, altT: def.altDef || 0, spdCap: 0, blocked: 0,
      dep: 0, depT: 0, elev: 0, elevT: 0, mast: 0, mastT: 0, caps: [0, 0],
      antA: 0, antW: 0, antT: 0, tYaw: 0, tPitch: 0, aimB: null, aimP: 0,
      cYaw: [0, Math.PI], cPitch: [.35, .35], cSpin: 0, vlsOpen: [], vlsT: [], vlsNext: 0,
      fireT: -99, odo: 0, gimYaw: 0, gimPitch: -.6, crane: 0, carriage: 0, spool: 0, ab: 0,
      aboard: 0, rearmT: 0, launchQ: null, nextLaunch: 0, landing: false,
      fuel: def.endurance || 0, cargo: def.cargo || 0, drones: def.drones || 0,
      reloader: 0, reloadP: 0, reloadU: 0, refillU: 0, wantElev: 0, refillP: {}, eng: 0, lastFire: -1e9, busy: false, depotLoad: false,
      task: null, born: this.t,
      depth: 0, dive: 0, mastUp: 0, propA: 0, sonarT: -1,                  // submarines (sim/subs.js); a listening sonar
      // fields other modules set later, declared (unset) here so every unit keeps one object layout: property reads
      // across the sim stay fast (a unit that grows its own fields later forks the layout, and the reads that see many
      // layouts slow down everywhere). undefined reads exactly as a missing field.
      mag: undefined, aboardOf: undefined, repaths: undefined, fuelOut: undefined, recovered: undefined, salvo: undefined,
      vy: undefined, _ax: undefined, _az: undefined, _ah: undefined,
      cargoN: undefined, cushion: undefined, cushionT: undefined, dockT: undefined, fanA: undefined, idleT: undefined,
      loadT: undefined, nextWell: undefined, rampB: undefined, rampT: undefined, rud: undefined, slot: undefined,
      transit: undefined, well: undefined, wellHost: undefined, wellReq: undefined, wellT: undefined, wellUse: undefined,
    };
    for (const w in def.weapons) { u.ammo[w] = def.weapons[w].ammo; u.cooldowns[w] = 0; u.refillP[w] = 0; }
    for (const p of def.partNames) u.parts[p] = 0;
    if (def.mast && o.deployed) { u.mast = u.mastT = 1; u.deployed = true; }
    if (def.deploy && o.deployed) { const el = def.deploy.elev || TEL_ELEV; u.dep = u.depT = 1; u.elev = u.elevT = u.wantElev = el; u.deployed = true; }
    // boats start deep (o.dive: 0 surfaced, 1 periscope depth, 2 deep); the model's origin is the surfaced waterline
    if (def.sub) {
      u.dive = o.dive !== undefined ? o.dive : 2; u.depth = depthGoal(this, u); u.mastUp = u.depth <= def.sub.pd + 1.5 ? 1 : 0; u.propA = 0;
      u.pos[1] = u.prev[1] = -(u.depth - def.draught);
    }
    if (def.air) u.launchQ = [];
    u.mag = def.magazine ? Object.assign({}, def.magazine) : null;
    if (u.radarOn) this.setRadar(u, true, true);
    if (def.domain === 'air' && o.aboard) {
      const cv = this.units.get(o.aboard);
      if (cv && cv.alive) { u.aboard = u.aboardOf = cv.id; u.pos = cv.pos.slice(); u.prev = cv.pos.slice(); u.speed = 0; u.hdg = cv.hdg; }
    }
    if (def.hq) this.sides[side].hadHq = true;
    this.units.set(id, u);
    this._dirty = true;
    def.modelState(u, this.t);
    return u;
  }

  setRadar(u, on, quiet) {
    const R = u.def.sensors.radar;
    if (!R) return;
    const t = this.t, a = u.antA + u.antW * (t - u.antT);
    u.antA = a - Math.PI * 2 * Math.floor(a / (Math.PI * 2)); u.antT = t;
    u.radarOn = !!on;
    u.antW = u.radarOn ? Math.PI * 2 / R.period : 0;
    if (!quiet) this.emit('radar', { unit: u.id, side: u.side, on: u.radarOn, pos: u.pos.slice() });
  }

  order(ids, order) { issue(this, Array.isArray(ids) ? ids : [ids], order); }
  buy(side, type) { return buy(this, side, type); }

  list() {
    if (this._dirty) {
      this._list = Array.from(this.units.values());
      this._alive.coast = []; this._alive.fleet = [];
      for (const u of this._list) if (u.alive) this._alive[u.side].push(u);
      this._dirty = false;
    }
    return this._list;
  }
  alive(side) { this.list(); return this._alive[side]; }
  hq(side) { for (const u of this.alive(side)) if (u.def.hq) return u; return null; }

  /* ---------- events ---------- */
  emit(type, e) {
    e = e || {};
    // payloads that carry a unit type keep it as `utype`; `type` is always the event name
    if (e.type !== undefined && e.utype === undefined) e.utype = e.type;
    e.type = type; e.t = this.t;
    this.counts[type] = (this.counts[type] || 0) + 1;
    if (this.events.length < 20000) this.events.push(e);
    return e;
  }
  drainEvents() { const e = this.events; this.events = []; return e; }

  /* ---------- fog of war ---------- */
  visible(side, u) {
    if (u.side === side) return 'own';
    if (u.aboard) return null;
    if (!this.fog) return 'track';
    const c = this.sides[side].contacts.get(u.id);
    if (!c) return null;
    return c.conf >= CLASSIFY ? 'track' : 'contact';
  }
  contact(side, unitId) { return this.sides[side].contacts.get(unitId) || null; }
  projVisible(side, p) { return p.side === side || !this.fog || this.t - p.seen[side] < 1.01; }

  /* ---------- the step ---------- */
  step() {
    this.tick++;
    const t = this.t = this.tick * DT, tick = this.tick;
    const list = this.list();
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      u.prev[0] = u.pos[0]; u.prev[1] = u.pos[1]; u.prev[2] = u.pos[2]; u.prevHdg = u.hdg;
    }
    for (const p of this.projectiles.values()) { p.prev[0] = p.pos[0]; p.prev[1] = p.pos[1]; p.prev[2] = p.pos[2]; }

    if (tick % 20 === 0) economyTick(this);
    for (const side in this.ai) {
      const ai = this.ai[side];
      if ((tick + (side === 'coast' ? 0 : 7)) % ai.every === 0) ai.think();
    }
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u.alive) continue;
      processOrders(this, u);
      mechanics(this, u);
      if (u.launchQ) carrierOps(this, u);
      moveUnit(this, u);
    }
    if (this.scans.length) resolveScans(this);
    if (tick % SENSE_EVERY === 0) senseTick(this, SENSE_EVERY * DT);
    if (tick % 20 === 10) esmTick(this);
    if (tick % 20 === 15) sonarTick(this);
    if (tick % SENSE_EVERY === 2) weaponsTick(this);
    stepProjectiles(this);
    stepDying(this);
    this.weather.step(DT);
    for (const side of SIDES) { const S = this.sides[side]; if (S.scanCd > 0) S.scanCd = Math.max(0, S.scanCd - DT); }
    for (let i = 0; i < list.length; i++) { const u = list[i]; u.def.modelState(u, t); }
    if (tick % 20 === 0) checkResult(this);
  }
  /* run n ticks (tests, fast-forward) */
  run(n) { for (let i = 0; i < n; i++) this.step(); }

  /* ---------- a hash of the whole state (determinism test) ---------- */
  hash() {
    let h = 2166136261 >>> 0;
    const mix = v => { v = Math.round(v * 1000) | 0; h ^= v & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619); h ^= (v >>> 16) & 0xffff; h = Math.imul(h, 16777619); };
    const ids = Array.from(this.units.keys()).sort((a, b) => a - b);
    for (const id of ids) {
      const u = this.units.get(id);
      mix(id); mix(u.pos[0]); mix(u.pos[1]); mix(u.pos[2]); mix(u.hdg); mix(u.hp); mix(u.alive ? 1 : 0); mix(u.dying);
      if (u.def.sub) mix(u.depth);
      for (const w in u.ammo) mix(u.ammo[w]);
    }
    for (const p of this.projectiles.values()) { mix(p.id); mix(p.pos[0]); mix(p.pos[1]); mix(p.pos[2]); }
    for (const side of SIDES) {
      const S = this.sides[side]; mix(S.supply);
      for (const c of S.contacts.values()) { mix(c.unitId); mix(c.conf); mix(c.pos[0]); mix(c.pos[2]); }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /* stats for UI / tests */
  summary() {
    const out = { t: this.t, result: this.result, sides: {} };
    for (const side of SIDES) {
      const S = this.sides[side], al = this.alive(side), by = {};
      for (const u of al) by[u.type] = (by[u.type] || 0) + 1;
      out.sides[side] = { supply: Math.round(S.supply), units: al.length, by, contacts: S.contacts.size, lost: S.lost, kills: S.kills, fired: S.fired };
    }
    return out;
  }
}

export { UNITS, PROJ, SIDES, ENEMY, CLASSIFY };
