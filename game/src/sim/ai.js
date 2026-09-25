/* AI commander per side (easy / normal / hard). It reads ONLY its own side: its own units, its contacts
   (sim.sides[side].contacts), its own missiles, the map, and its supply. It never looks at enemy units directly.

   Coast: radar up on high ground near the sea, TELs dispersed 3-15 km inland, Pantsirs over the battery, the
   radar and the command post, drones out over the sea, scans on unknown contacts, salvos at classified ships,
   transloaders keep the TELs loaded, TELs move to a fresh site after firing (normal/hard).
   Fleet: carrier holds back, destroyers screen ahead of it, helos and fighters search the coast, scans on
   emitters and launch points, strikes on classified land targets (saturating known SAMs), resupply at the
   replenishment point, push closer later in the battle. Both buy reinforcements. */
import { UNITS, CLASSIFY, TEL_ELEV } from '../data/units.js';
import { inbound as inboundSlow } from './weapons.js';
import { scanBlocked } from './sensors.js';
import { dxz } from './util.js';

const LEVELS = {
  easy: { every: 100, drones: 1, salvo: 2, cvn: 5, ddg: 3, buyK: 1.6, scanP: .4, relocate: 0, helos: 1, cap: 1, strikeK: 0, pushT: 2400, emcon: false },
  normal: { every: 40, drones: 2, salvo: 4, cvn: 8, ddg: 4, buyK: 1.0, scanP: .9, relocate: .7, helos: 2, cap: 1, strikeK: 1, pushT: 1500, emcon: true },
  hard: { every: 20, drones: 3, salvo: 6, cvn: 10, ddg: 5, buyK: 1.0, scanP: 1, relocate: 1, helos: 2, cap: 2, strikeK: 2, pushT: 1000, emcon: true },
};
const PRIO_LAND = { HQ: 10, TEL: 8, RADAR: 6, SAM: 5, TLV: 4, 'UAV-L': 3 };

export class AI {
  constructor(sim, side, level) {
    this.sim = sim; this.side = side; this.level = LEVELS[level] ? level : 'normal';
    this.L = LEVELS[this.level];
    this.every = this.L.every;
    this.r = sim.rng.ai[side];
    this.mem = new Map();
    this.ready = false;
    this.lastEnemyLaunch = -1e9;
    this.log = [];
  }
  inbound(id) { return this.inb ? (this.inb.get(id) || 0) : inboundSlow(this.sim, this.side, id); }
  addInbound(id, n) { if (this.inb) this.inb.set(id, (this.inb.get(id) || 0) + n); }
  m(u) { let m = this.mem.get(u.id); if (!m) { m = {}; this.mem.set(u.id, m); } return m; }
  cur(u) { return u.orders[0] ? u.orders[0].kind : null; }
  order(u, o) { this.sim.order([u.id], o); }
  own(type) { const a = this.sim.alive(this.side); return type ? a.filter(u => u.type === type) : a; }
  note(s) { this.log.push(`${Math.round(this.sim.t)} ${s}`); if (this.log.length > 60) this.log.shift(); }

  think() {
    const sim = this.sim;
    if (sim.result) return;
    if (!this.ready) { this.side === 'coast' ? this.setupCoast() : this.setupFleet(); this.ready = true; }
    for (const id of this.mem.keys()) { const u = sim.units.get(id); if (!u || !u.alive) this.mem.delete(id); }
    // enemy launches seen (own picture of their missiles)
    this.inb = new Map();
    for (const p of sim.projectiles.values()) {
      if (p.side !== this.side && p.P.threat && sim.t - p.seen[this.side] < 1.5) this.lastEnemyLaunch = sim.t;
      if (p.side === this.side && p.alive && p.tk === 'unit' && p.P.threat) this.inb.set(p.target, (this.inb.get(p.target) || 0) + 1);
    }
    this._targets = null;
    if (this.side === 'coast') this.coast(); else this.fleet();
  }

  /* ---------- geometry helpers (map knowledge only) ---------- */
  snap(dom, x, z, comp) {
    const nav = this.sim.nav, k = nav.nearestOpen(dom, nav.cellOf(x, z), comp, 80);
    return k < 0 ? null : [nav.cx(k), nav.cz(k)];
  }
  compOf(dom, x, z) {
    const nav = this.sim.nav, G = nav.grid(dom), k = nav.nearestOpen(dom, nav.cellOf(x, z), -1, 40);
    return k < 0 ? -1 : G.comp[k];
  }
  /* send u to site unless it is busy with something else; true when it is there */
  station(u, site, arrive) {
    if (!site) return true;
    const d = dxz(u.pos[0], u.pos[2], site[0], site[1]);
    if (d <= (arrive || 250)) return true;
    const k = this.cur(u);
    if (k && k !== 'move' && k !== 'patrol' && k !== 'deploy') return false;
    if (k !== 'move' || dxz(u.orders[0].x, u.orders[0].z, site[0], site[1]) > 100) this.order(u, { kind: 'move', x: site[0], z: site[1] });
    return false;
  }
  contacts() { return this.sim.sides[this.side].contacts; }

  /* =====================================================================  COAST  */
  setupCoast() {
    const sim = this.sim, map = sim.map, nav = sim.nav, sp = map.spawns.coast, fs = map.spawns.fleet, r = this.r;
    const G = nav.grid('land'), shore = nav.shoreDist();
    const comp = this.comp = this.compOf('land', sp.x, sp.z);
    const cands = [];
    for (let k = 0; k < nav.N; k++) {
      if (!G.cost[k] || G.comp[k] !== comp) continue;
      const x = nav.cx(k), z = nav.cz(k), dSp = dxz(x, z, sp.x, sp.z);
      if (dSp > 50000 || map.slope(x, z) > .3) continue;
      cands.push({ x, z, h: map.h(x, z), sd: shore[k], dSp, dF: dxz(x, z, fs.x, fs.z) });
    }
    // radar: high ground close to the sea
    let best = null, bs = -1e18;
    for (const c of cands) {
      if (c.sd < 800 || c.sd > 9000 || c.dSp > 18000) continue;
      const s = c.h * 1.2 - c.sd * .01 - c.dSp * .004 - c.dF * .0008;
      if (s > bs) { bs = s; best = c; }
    }
    this.radarSite = best ? [best.x, best.z] : [sp.x, sp.z];
    // a second, silent radar waits on another hill (EMCON) to take over when the first is lost
    let best2 = null; bs = -1e18;
    for (const c of cands) {
      if (c.sd < 800 || c.sd > 12000 || c.dSp > 25000 || dxz(c.x, c.z, this.radarSite[0], this.radarSite[1]) < 9000) continue;
      const s = c.h * 1.2 - c.sd * .01 - c.dSp * .004;
      if (s > bs) { bs = s; best2 = c; }
    }
    this.radarSite2 = best2 ? [best2.x, best2.z] : [sp.x, sp.z];
    // TEL sites: dispersed, 2.5-15 km inland, toward the sea lanes
    const pool = cands.filter(c => c.sd >= 2500 && c.sd <= 15000 && c.dSp < 42000)
      .map(c => ({ c, s: -c.dF * .001 - c.dSp * .0004 + r() * 10 })).sort((a, b) => b.s - a.s);
    this.telSites = [];
    for (const { c } of pool) {
      if (this.telSites.length >= 14) break;
      if (dxz(c.x, c.z, this.radarSite[0], this.radarSite[1]) < 2500) continue;
      if (this.telSites.some(s => dxz(s.x, s.z, c.x, c.z) < 3200)) continue;
      this.telSites.push({ x: c.x, z: c.z, owner: 0, burnt: -1e9 });
    }
    if (!this.telSites.length) this.telSites.push({ x: sp.x, z: sp.z, owner: 0, burnt: -1e9 });
    const n3 = this.telSites.slice(0, 3);
    const tc = [n3.reduce((a, s) => a + s.x, 0) / n3.length, n3.reduce((a, s) => a + s.z, 0) / n3.length];
    const toSea = (p, d) => { const dx = fs.x - p[0], dz = fs.z - p[1], L = Math.hypot(dx, dz) || 1; return [p[0] + dx / L * d, p[1] + dz / L * d]; };
    const hq = this.own('hq')[0];
    const hqp = hq ? [hq.pos[0], hq.pos[2]] : [sp.x, sp.z];
    // Pantsirs stand between what they guard and the sea: radar first, then the command post, then the battery
    this.samSites = [toSea(this.radarSite, 1500), toSea(hqp, 1500), toSea(tc, 2000), toSea(tc, -1500)].map(p => this.snap('land', p[0], p[1], comp) || hqp);
    this.samOwner = this.samSites.map(() => 0);
    this.catSite = this.snap('land', ...toSea(hqp, 2500), comp) || hqp;
    this.park = this.snap('land', ...toSea(tc, -3000), comp) || hqp;
    this.telCenter = tc;
    this.note(`coast: radar site ${this.radarSite.map(Math.round)}, ${this.telSites.length} TEL sites`);
  }

  coast() {
    const sim = this.sim, t = sim.t, S = sim.sides.coast;
    const by = { hq: [], tel: [], radar: [], pantsir: [], catapult: [], drone: [], transloader: [] };
    for (const u of sim.alive('coast')) (by[u.type] || (by[u.type] = [])).push(u);
    // radars: the first one radiates from the best hill; a spare waits silent on another hill
    by.radar.sort((a, b) => a.id - b.id);
    by.radar.forEach((u, i) => {
      const m = this.m(u);
      if (!m.site) m.site = by.radar.some(v => v !== u && this.m(v).site === this.radarSite) ? this.radarSite2 : this.radarSite;
      if (!this.station(u, m.site, 300)) return;
      if (u.mast < 1 && this.cur(u) !== 'deploy') this.order(u, { kind: 'deploy' });
      // the radiating radar blinks (EMCON) so it is harder to pin down: 90 s on, 60 s off
      const on = i === 0 && (!this.L.emcon || (t % 150) < 90);
      if (u.mast >= 1 && u.radarOn !== on) this.order(u, { kind: 'radar', on });
    });
    // Pantsirs over the command post, the battery, the radar
    for (const u of by.pantsir) {
      const m = this.m(u);
      if (m.sam === undefined || (m.sam >= 0 && this.samOwner[m.sam] !== u.id) || m.sam < 0) {
        const i = this.samOwner.findIndex(o => !o || !sim.units.get(o) || !sim.units.get(o).alive);
        if (i >= 0) { this.samOwner[i] = u.id; m.sam = i; } else m.sam = -1;
      }
      if (this.L.emcon) {
        // silent until the enemy has started shooting or its aircraft come near; then radiating
        const on = sim.t - this.lastEnemyLaunch < 600 || this.threatNear(u.pos, 50000);
        if (u.radarOn !== on) this.order(u, { kind: 'radar', on });
      } else if (!u.radarOn) this.order(u, { kind: 'radar', on: true });
      if (this.cur(u) === 'reload') continue;
      if (u.ammo.sam === 0 && !this.cur(u)) { this.order(u, { kind: 'reload' }); continue; }
      if (m.sam < 0 && !m.extra) { const s = this.telSites[Math.floor(this.r() * this.telSites.length)]; m.extra = this.snap('land', s.x + 900, s.z + 900, this.comp) || this.telCenter; }
      this.station(u, m.sam >= 0 ? this.samSites[m.sam] : m.extra, 300);
    }
    this.coastTels(by.tel);
    this.coastLoaders(by.transloader, by.tel);
    this.coastDrones(by.catapult, by.drone);
    this.coastScan();
    this.coastFire(by.tel);
    this.coastBuy(by);
  }

  /* an enemy aircraft or missile in our picture within r of p */
  threatNear(p, r) {
    const sim = this.sim, t = sim.t;
    for (const c of this.contacts().values()) if (!c.dead && c.dom === 'air' && t - c.lastSeen < 20 && dxz(c.pos[0], c.pos[2], p[0], p[2]) < r) return true;
    for (const q of sim.projectiles.values()) if (q.side !== this.side && q.P.threat && t - q.seen[this.side] < 3 && dxz(q.pos[0], q.pos[2], p[0], p[2]) < r * 1.5) return true;
    return false;
  }

  telReady(u) { return u.dep >= 1 && u.elev >= TEL_ELEV - 1e-6 && u.ammo.oniks > 0 && !u.reloader && !u.off.oniks; }

  freeSite(u, avoid) {
    const t = this.sim.t;
    let best = null, bd = 1e18;
    for (const s of this.telSites) {
      const o = s.owner && this.sim.units.get(s.owner);
      if (o && o.alive && s.owner !== u.id) continue;
      if (s === avoid || t - s.burnt < 900) continue;
      const d = dxz(u.pos[0], u.pos[2], s.x, s.z) + this.r() * 3000;
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) best = avoid || this.telSites[0];
    for (const s of this.telSites) if (s.owner === u.id) s.owner = 0;
    best.owner = u.id;
    return best;
  }

  coastTels(tels) {
    const t = this.sim.t;
    for (const u of tels) {
      const m = this.m(u), k = this.cur(u);
      if (!m.site || m.site.owner !== u.id) m.site = this.freeSite(u);
      if (k === 'attack' || u.reloader || k === 'reload') continue;
      if (m.fired && (u.ammo.oniks === 0 || u.ammo.oniks >= 2) && t - m.fired > 5) {
        if (this.r() < this.L.relocate) { m.site.burnt = m.fired; m.site = this.freeSite(u, m.site); }
        m.fired = 0;
      }
      if (u.ammo.oniks === 0 && !this.loaderFree && this.r() < .5) { this.order(u, { kind: 'reload' }); continue; }
      if (!this.station(u, [m.site.x, m.site.z], 200)) continue;
      if (!(u.dep >= 1 && u.elev >= TEL_ELEV) && k !== 'deploy') this.order(u, { kind: 'deploy' });
    }
  }

  coastLoaders(loaders, tels) {
    this.loaderFree = loaders.some(L => L.cargo > 0 && this.cur(L) !== 'reload');
    const claimed = new Set();
    for (const L of loaders) { const o = L.orders[0]; if (o && o.kind === 'reload' && o.target) claimed.add(o.target); }
    for (const L of loaders) {
      const k = this.cur(L);
      if (k === 'reload') continue;
      if (L.cargo === 0) { this.order(L, { kind: 'reload' }); continue; }
      let best = null, bd = 1e18;
      for (const T of tels) {
        if (T.ammo.oniks >= 2 || T.reloader || claimed.has(T.id) || this.cur(T) === 'attack' || this.cur(T) === 'move' || this.cur(T) === 'reload') continue;
        const d = dxz(L.pos[0], L.pos[2], T.pos[0], T.pos[2]);
        if (d < bd) { bd = d; best = T; }
      }
      if (best) { claimed.add(best.id); this.order(L, { kind: 'reload', target: best.id }); continue; }
      if (L.cargo < L.def.cargo) { this.order(L, { kind: 'reload' }); continue; }
      this.station(L, this.park, 1500);
    }
  }

  seaPoint(minD, maxD) {
    const sim = this.sim, map = sim.map, sp = map.spawns.coast, fs = map.spawns.fleet, r = this.r;
    const b0 = Math.atan2(fs.x - sp.x, fs.z - sp.z);
    for (let i = 0; i < 30; i++) {
      const b = b0 + (r() - .5) * 1.4, d = minD + r() * (maxD - minD);
      const x = sp.x + Math.sin(b) * d, z = sp.z + Math.cos(b) * d;
      if (Math.abs(x) > map.W / 2 - 3000 || Math.abs(z) > map.H / 2 - 3000) continue;
      if (map.h(x, z) < 0) return [x, z];
    }
    return [fs.x * .6 + sp.x * .4, fs.z * .6 + sp.z * .4];
  }

  coastDrones(cats, drones) {
    const t = this.sim.t;
    const atSite = cats.filter(c => this.cur(c) === 'launch_drone' || this.station(c, this.catSite, 400));
    const flying = drones.filter(d => !d.recovered);
    if (flying.length < this.L.drones && !cats.some(c => this.cur(c) === 'launch_drone')) {
      const c = atSite.find(c => c.drones > 0 && this.cur(c) !== 'launch_drone' && !c.off.launch);
      if (c) { const p = this.seaPoint(25000, 70000); this.order(c, { kind: 'launch_drone', x: p[0], z: p[1], r: 3000 }); }
    }
    // look at unknown sea contacts; otherwise search
    const unk = [], ships = [];
    for (const c of this.contacts().values()) if (!c.dead && c.dom === 'sea') { ships.push(c); if (c.conf < CLASSIFY || t - c.lastSeen > 90) unk.push(c); }
    const safe = (x, z, skip) => !ships.some(s => s !== skip && s.cls === 'DDG' && dxz(x, z, s.pos[0], s.pos[2]) < 38000);
    for (const d of flying) {
      const m = this.m(d), k = this.cur(d);
      if (k === 'return' || k === 'scan') continue;
      let tgt = null, bd = 1e18;
      for (const c of unk) { const dd = dxz(d.pos[0], d.pos[2], c.pos[0], c.pos[2]); if (dd < bd && safe(c.pos[0], c.pos[2], c)) { bd = dd; tgt = c; } }
      if (tgt && bd < 60000) {
        if (m.look !== tgt.unitId || t - m.lookT > 60) { m.look = tgt.unitId; m.lookT = t; this.order(d, { kind: 'patrol', x: tgt.pos[0], z: tgt.pos[2], r: 2500 }); }
        continue;
      }
      if (!m.searchT || t - m.searchT > 420 || !safe(d.goal ? d.goal[0] : d.pos[0], d.goal ? d.goal[1] : d.pos[2])) {
        m.searchT = t; m.look = 0;
        let p = this.seaPoint(18000, 55000);
        for (let k = 0; k < 8 && !safe(p[0], p[1]); k++) p = this.seaPoint(15000, 40000);
        this.order(d, { kind: 'patrol', x: p[0], z: p[1], r: 3000 });
      }
    }
  }

  coastScan() {
    const sim = this.sim, t = sim.t, S = sim.sides.coast;
    if (S.scanCd > 0 || this.r() > this.L.scanP) return;
    const cands = [];
    for (const c of this.contacts().values()) {
      if (c.dead || c.dom === 'air' || c.identified && c.conf >= CLASSIFY && t - c.lastSeen < 60) continue;
      if (c.conf >= CLASSIFY && t - c.lastSeen < 30) continue;
      cands.push({ c, s: (c.dom === 'sea' ? 3 : 2) + (c.emitting ? 1 : 0) + (c.cls === 'CVN' ? 2 : 0) - c.conf });
    }
    cands.sort((a, b) => b.s - a.s);
    const scanners = this.own().filter(u => u.def.scan && !scanBlocked(sim, u));
    for (const { c } of cands) {
      let best = null, bd = 1e18;
      for (const u of scanners) {
        const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]);
        if (d > u.def.scan.reach * .95) continue;
        if (d < bd) { bd = d; best = u; }
      }
      if (best) { this.order(best, { kind: 'scan', x: c.pos[0], z: c.pos[2], stay: true }); this.note(`scan ${c.track} by ${best.type}`); return; }
    }
  }

  coastFire(tels) {
    const sim = this.sim, t = sim.t;
    const ready = tels.filter(u => this.telReady(u) && this.cur(u) !== 'attack');
    if (!ready.length) return;
    const targets = [];
    let cvn = false;
    for (const c of this.contacts().values()) if (!c.dead && c.cls === 'CVN' && t - c.lastSeen < 600) cvn = true;
    for (const c of this.contacts().values()) {
      if (c.dead || c.dom !== 'sea' || c.conf < CLASSIFY || t - c.lastSeen > 45) continue;
      // the load is kept for the carrier while it is known; destroyers are fair game when it is not, or when close
      if (c.cls !== 'CVN' && (t < 240 || cvn) && !ready.some(u => dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]) < 45000)) continue;
      targets.push(c);
    }
    targets.sort((a, b) => (b.cls === 'CVN') - (a.cls === 'CVN') || b.conf - a.conf);
    for (const c of targets) {
      let need = (c.cls === 'CVN' ? this.L.cvn : this.L.ddg) - this.inbound(c.unitId);
      if (need <= 0) continue;
      const shooters = ready.filter(u => { const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]); return d < u.def.weapons.oniks.range * .97 && d > u.def.weapons.oniks.min; })
        .sort((a, b) => b.ammo.oniks - a.ammo.oniks);
      const avail = shooters.reduce((a, u) => a + u.ammo.oniks, 0);
      // wait for a proper salvo, but not for ever
      this.waitT = this.waitT || new Map();
      if (!this.waitT.has(c.unitId)) this.waitT.set(c.unitId, t);
      if (!avail || (avail < Math.min(this.L.salvo, need) && t - this.waitT.get(c.unitId) < 150)) continue;
      this.waitT.delete(c.unitId);
      for (const u of shooters) {
        if (need <= 0) break;
        const n = Math.min(u.ammo.oniks, need);
        this.order(u, { kind: 'attack', target: c.unitId, n });
        this.m(u).fired = t;
        this.addInbound(c.unitId, n);
        need -= n;
        ready.splice(ready.indexOf(u), 1);
      }
      this.note(`salvo at ${c.track} ${c.cls}`);
    }
  }

  coastBuy(by) {
    const sim = this.sim, S = sim.sides.coast;
    const count = type => (by[type] ? by[type].length : 0) + S.queue.filter(q => q.type === type).length;
    const stock = (by.catapult || []).reduce((a, c) => a + c.drones, 0) + (by.drone || []).length + S.queue.filter(q => q.type === 'drone').length;
    const want = (type, n) => count(type) < n ? type : null;
    const tl = Math.max(1, Math.ceil(count('tel') / 2));
    const next = want('radar', 1) || want('tel', 3) || want('pantsir', 2) || want('transloader', 1) || want('catapult', 1) || want('transloader', Math.min(tl, 2))
      || (stock < 2 && (by.catapult || []).length && sim.t - (this.lastDrone || -1e9) > 240 ? 'drone' : null)
      || want('pantsir', 3) || want('tel', 5) || want('radar', 2) || want('transloader', tl) || want('tel', 6) || want('pantsir', 4) || want('transloader', tl) || want('tel', 8) || want('pantsir', 5) || want('tel', 10);
    if (!next) return;
    if (S.supply >= UNITS[next].cost * this.L.buyK) { if (sim.buy('coast', next)) { this.note(`buy ${next}`); if (next === 'drone') this.lastDrone = sim.t; } }
  }

  /* start of a battle: put the battery straight onto its sites, emplaced (TELs erect, radar mast up) */
  emplace() {
    const sim = this.sim;
    if (!this.ready) { this.setupCoast(); this.ready = true; }
    const put = (u, p) => {
      const k = sim.nav.nearestOpen('land', sim.nav.cellOf(p[0], p[1]), this.comp, 20);
      const q = k >= 0 && sim.map.h(p[0], p[1]) < 1 ? [sim.nav.cx(k), sim.nav.cz(k)] : p;
      u.pos[0] = u.prev[0] = q[0]; u.pos[2] = u.prev[2] = q[1]; u.pos[1] = u.prev[1] = Math.max(0, sim.map.h(q[0], q[1]));
      const fs = sim.map.spawns.fleet; u.hdg = u.prevHdg = Math.atan2(fs.x - q[0], fs.z - q[1]);
    };
    let si = 0;
    for (const u of sim.alive('coast')) {
      if (u.type === 'radar') { const m = this.m(u); m.site = m.site || (sim.alive('coast').some(v => v !== u && v.type === 'radar' && this.m(v).site === this.radarSite) ? this.radarSite2 : this.radarSite); put(u, m.site); u.mast = u.mastT = 1; u.deployed = true; }
      else if (u.type === 'tel') { const s = this.freeSite(u); this.m(u).site = s; put(u, [s.x, s.z]); u.dep = u.depT = 1; u.elev = u.elevT = u.wantElev = TEL_ELEV; u.deployed = true; }
      else if (u.type === 'pantsir' && si < this.samSites.length) { this.samOwner[si] = u.id; this.m(u).sam = si; put(u, this.samSites[si++]); }
      else if (u.type === 'catapult') put(u, this.catSite);
      else if (u.type === 'transloader') put(u, [this.park[0] + (u.id % 3) * 60, this.park[1]]);
    }
  }

  /* =====================================================================  FLEET  */
  setupFleet() {
    const sim = this.sim, map = sim.map, sp = map.spawns.fleet, cs = map.spawns.coast;
    this.comp = this.compOf('sea', sp.x, sp.z);
    const D = dxz(sp.x, sp.z, cs.x, cs.z) || 1;
    this.dir = [(cs.x - sp.x) / D, (cs.z - sp.z) / D];
    this.perp = [this.dir[1], -this.dir[0]];
    this.base = [cs.x, cs.z];
    this.D = D;
    this.push = false;
    this.cvSite = this.at(Math.min(D, 75000), 0);
    this.note(`fleet: carrier station ${this.cvSite.map(Math.round)}`);
  }
  /* a sea point `back` metres from the coast spawn toward the fleet side, `lat` metres sideways */
  at(back, lat) {
    const x = this.base[0] - this.dir[0] * back + this.perp[0] * lat, z = this.base[1] - this.dir[1] * back + this.perp[1] * lat;
    const W = this.sim.map.W / 2 - 2000, H = this.sim.map.H / 2 - 2000;
    return this.snap('sea', Math.max(-W, Math.min(W, x)), Math.max(-H, Math.min(H, z)), this.comp) || [this.sim.map.spawns.fleet.x, this.sim.map.spawns.fleet.z];
  }

  fleet() {
    const sim = this.sim, t = sim.t;
    const by = { carrier: [], ddg: [], helo: [], fighter: [] };
    for (const u of sim.alive('fleet')) (by[u.type] || (by[u.type] = [])).push(u);
    if (!this.push && t > this.L.pushT) { this.push = true; this.note('push'); }
    if (!this.push2 && t > this.L.pushT * 2.2) { this.push2 = true; this.note('push closer'); }
    // carrier: hold back; fall back further when badly hurt (it stays on station: a restock run would take an hour)
    for (const u of by.carrier) {
      const back = u.hp < u.hpMax * .45 ? Math.min(this.D + 10000, 85000) : Math.min(this.D, 75000);
      this.station(u, this.at(back, 0), 2500);
    }
    this.fleetDdgs(by.ddg);
    const sams = [];
    for (const c of this.contacts().values()) if (!c.dead && c.cls === 'SAM') sams.push(c);
    this.fleetHelos(by.helo, sams);
    this.fleetScan();
    this.fleetStrike(by, sams);
    this.fleetFighters(by.fighter, by.ddg);
    this.fleetBuy(by);
  }

  fleetDdgs(ddgs) {
    const n = ddgs.length, t = this.sim.t;
    let resupplying = ddgs.filter(u => this.m(u).resupply).length;
    ddgs.sort((a, b) => a.id - b.id);
    ddgs.forEach((u, i) => {
      const m = this.m(u), k = this.cur(u);
      u.hold = true;
      if (m.resupply) {
        if (k !== 'reload') {
          if (u.ammo.sm6 >= u.def.weapons.sm6.ammo * .9 && u.ammo.strike >= u.def.weapons.strike.ammo * .75) m.resupply = false;
          else this.order(u, { kind: 'reload' });
        }
        return;
      }
      const low = u.ammo.sm6 <= 6 || u.ammo.strike === 0;
      if (low && (resupplying === 0 || u.ammo.sm6 === 0)) { m.resupply = true; resupplying++; this.order(u, { kind: 'reload' }); this.note(`DDG ${u.id} resupply`); return; }
      if (k === 'attack' || k === 'scan') return;
      const back = this.push2 ? 30000 : this.push ? 40000 : 60000;
      const site = this.at(back, (i - (n - 1) / 2) * 7000);
      this.station(u, site, 2000);
    });
  }

  fleetHelos(helos, sams) {
    const sim = this.sim, t = sim.t;
    const want = this.L.helos;
    let flying = helos.filter(h => !h.aboard).length;
    helos.forEach((h, i) => {
      const m = this.m(h), k = this.cur(h);
      if (k === 'return' || k === 'attack' || k === 'scan') return;
      if (h.aboard) {
        if (flying >= want || h.rearmT || h.hp < h.hpMax * .5) return;
        flying++;
      }
      // hellfire at light land targets near the helo that no SAM covers
      if (h.ammo.hellfire > 0) {
        for (const c of this.contacts().values()) {
          if (c.dead || c.dom !== 'land' || c.conf < CLASSIFY || c.cls === 'SAM') continue;
          if (dxz(h.pos[0], h.pos[2], c.pos[0], c.pos[2]) > 14000) continue;
          if (sams.some(s => dxz(s.pos[0], s.pos[2], c.pos[0], c.pos[2]) < 21000)) continue;
          this.order(h, { kind: 'attack', target: c.unitId, n: 2 }); return;
        }
      }
      // an emitter no scanner can reach: close to scan range of it (clear of known SAMs)
      if (i === 0 && !h.aboard) {
        const em = [...this.contacts().values()].find(c => !c.dead && c.dom === 'land' && c.conf < CLASSIFY && c.emitting);
        if (em && h.cooldowns.scan <= 0) {
          const dx = h.pos[0] - em.pos[0], dz = h.pos[2] - em.pos[2], L = Math.hypot(dx, dz) || 1;
          const p = [em.pos[0] + dx / L * 17000, em.pos[2] + dz / L * 17000];
          if (!sams.some(s => dxz(p[0], p[1], s.pos[0], s.pos[2]) < 19000) && (m.hunt !== em.unitId || t - m.huntT > 120)) {
            m.hunt = em.unitId; m.huntT = t; m.st = p; m.stT = t;
            this.order(h, { kind: 'move', x: p[0], z: p[1] });
            return;
          }
        }
        if (k === 'move' && m.hunt) return;
      }
      if (!m.st || t - m.stT > 600 || (k !== 'patrol' && !h.aboard)) {
        m.stT = t; m.hunt = 0;
        const lat = ((i % 2) ? 1 : -1) * (8000 + this.r() * 14000);
        let p = this.at(this.push ? 30000 : 40000, lat);
        // keep clear of known SAMs
        for (const s of sams) {
          const d = dxz(p[0], p[1], s.pos[0], s.pos[2]);
          if (d < 24000) { const k2 = (24000 - d) / Math.max(d, 1); p = [p[0] + (p[0] - s.pos[0]) * k2, p[1] + (p[1] - s.pos[2]) * k2]; }
        }
        m.st = p;
        this.order(h, { kind: 'patrol', x: p[0], z: p[1], r: 4000 });
      }
    });
  }

  fleetScan() {
    const sim = this.sim, t = sim.t, S = sim.sides.fleet;
    if (S.scanCd > 0 || this.r() > this.L.scanP) return;
    const cands = [];
    for (const c of this.contacts().values()) {
      if (c.dead) continue;
      if (c.identified && c.conf >= CLASSIFY && t - c.lastSeen < 90) continue;
      if (c.conf >= CLASSIFY && t - c.lastSeen < 20) continue;
      if (c.dom === 'air') continue;
      cands.push({ c, s: (c.dom === 'land' ? 3 : 1) + (c.emitting ? 1.5 : 0) + Math.min(2, c.err / 3000) - c.conf });
    }
    cands.sort((a, b) => b.s - a.s);
    const scanners = this.own().filter(u => u.def.scan && !scanBlocked(sim, u) && !u.aboard);
    for (const { c } of cands) {
      let best = null, bd = 1e18;
      for (const u of scanners) {
        const d = dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]);
        if (d > u.def.scan.reach * .95) continue;
        if (d < bd) { bd = d; best = u; }
      }
      if (best) {
        this.order(best, { kind: 'scan', x: c.pos[0], z: c.pos[2], stay: true });
        this.note(`scan ${c.track} by ${best.type}`); return;
      }
    }
  }

  strikeTargets(sams) {
    if (this._targets) return this._targets;
    const t = this.sim.t, out = [];
    for (const c of this.contacts().values()) {
      if (c.dead || c.dom !== 'land' || c.conf < CLASSIFY) continue;
      if (t - c.lastSeen > 240) continue;
      let p = PRIO_LAND[c.cls] || 1;
      const cover = sams.filter(s => s !== c && dxz(s.pos[0], s.pos[2], c.pos[0], c.pos[2]) < 20000).length;
      // a SAM that covers the valuable targets goes first
      if (c.cls === 'SAM') for (const o of this.contacts().values()) if (o !== c && !o.dead && o.dom === 'land' && o.cls && o.cls !== 'SAM' && dxz(o.pos[0], o.pos[2], c.pos[0], c.pos[2]) < 16000) p += o.cls === 'HQ' ? 4 : 1;
      const want = (c.cls === 'HQ' ? 4 : c.cls === 'SAM' ? 3 : 2) + cover * 2 + this.L.strikeK - 1;
      out.push({ c, p, want });
    }
    out.sort((a, b) => b.p - a.p || b.c.conf - a.c.conf);
    return (this._targets = out);
  }

  fleetStrike(by, sams) {
    const sim = this.sim;
    const ddgs = by.ddg.filter(u => u.ammo.strike > 0 && !this.m(u).resupply && this.cur(u) !== 'attack' && !u.off.strike);
    for (const { c, want } of this.strikeTargets(sams)) {
      let need = want - this.inbound(c.unitId);
      if (need <= 0) continue;
      const shooters = ddgs.filter(u => dxz(u.pos[0], u.pos[2], c.pos[0], c.pos[2]) < u.def.weapons.strike.range * .95).sort((a, b) => b.ammo.strike - a.ammo.strike);
      const avail = shooters.reduce((a, u) => a + u.ammo.strike, 0);
      if (avail < Math.min(need, 2) && !by.fighter.some(f => f.ammo.slam > 0)) continue;
      let sent = 0;
      for (const u of shooters) {
        if (need <= 0) break;
        const n = Math.min(u.ammo.strike, need, 4);
        this.order(u, { kind: 'attack', target: c.unitId, n });
        ddgs.splice(ddgs.indexOf(u), 1);
        this.addInbound(c.unitId, n);
        need -= n; sent += n;
      }
      if (sent) this.note(`strike ${c.track} ${c.cls} x${sent}`);
    }
  }

  fleetFighters(fighters, ddgs) {
    const sim = this.sim, t = sim.t;
    const sams = [];
    for (const c of this.contacts().values()) if (!c.dead && c.cls === 'SAM') sams.push(c);
    const targets = this.strikeTargets(sams);
    let cap = fighters.filter(f => this.m(f).role === 'cap' && !f.aboard).length;
    const center = ddgs.length ? [ddgs.reduce((a, u) => a + u.pos[0], 0) / ddgs.length, ddgs.reduce((a, u) => a + u.pos[2], 0) / ddgs.length] : this.cvSite;
    for (const f of fighters) {
      const m = this.m(f), k = this.cur(f);
      if (k === 'return' || k === 'attack') continue;
      if (f.aboard && f.rearmT) continue;
      // strike with SLAM-ER when there is a target (fighters add to the DDG salvos)
      if (f.ammo.slam > 0 && targets.length) {
        const tg = targets.find(x => this.inbound(x.c.unitId) < x.want + 1);
        if (tg) { m.role = 'strike'; this.order(f, { kind: 'attack', target: tg.c.unitId, n: 2 }); this.addInbound(tg.c.unitId, 2); this.note(`fighter strike ${tg.c.track}`); continue; }
      }
      if (m.role === 'cap' && !f.aboard && k === 'patrol') continue;
      if (cap < this.L.cap && f.ammo.aam > 0) {
        m.role = 'cap'; cap++;
        this.order(f, { kind: 'patrol', x: center[0], z: center[1], r: 15000 });
        continue;
      }
      // recon sweep toward the coast (radar picks up land units), then home
      if (!f.aboard && k === 'patrol' && t - (m.sweepT || 0) < 500) continue;
      if (f.aboard && t - (m.sweepT || -1e9) < 400) continue;
      m.role = 'recon'; m.sweepT = t;
      const p = this.at(this.push ? 30000 : 36000, (this.r() - .5) * 40000);
      this.order(f, { kind: 'patrol', x: p[0], z: p[1], r: 10000 });
    }
  }

  fleetBuy(by) {
    const sim = this.sim, S = sim.sides.fleet;
    const count = type => (by[type] ? by[type].length : 0) + S.queue.filter(q => q.type === type).length;
    const want = (type, n) => count(type) < n ? type : null;
    const next = want('ddg', 2) || want('fighter', 4) || want('helo', 2) || want('ddg', 3) || want('fighter', 6) || want('helo', 3) || want('ddg', 4) || want('fighter', 8) || want('ddg', 5) || want('ddg', 6);
    if (!next) return;
    if (next !== 'ddg' && !by.carrier.length) return;
    if (S.supply >= UNITS[next].cost * this.L.buyK) { if (sim.buy('fleet', next)) this.note(`buy ${next}`); }
  }
}
