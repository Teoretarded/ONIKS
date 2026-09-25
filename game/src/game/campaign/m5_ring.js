/* 05 · Ring (Ust-Solyonaya, night, rain): the fleet strikes back. The command post radiates and they know it; every
   TEL that fires is seen, scanned and answered with Tomahawks a few minutes later, so the TELs fire and move (more
   than the 1.5 km a Tomahawk can correct for). SLAM-ER raids come off the carrier on a clock. Three Pantsirs make the
   ring round the command post. Fifteen minutes. */
import { put, landSpot, highGround, snap, bearing, offset, dist, radarOn, xz, knows, emplace, deg, seaward } from './world.js';
import { radarWorks, emitting } from '../../sim/sensors.js';

const DEG = Math.PI / 180;
const RAIDS = [{ at: 200, n: 2 }, { at: 480, n: 4 }, { at: 740, n: 4 }];
const HQ_STRIKES = [[150, 4], [360, 4], [570, 6], [780, 6]];  // Tomahawks on the command post: when, how many
const SEEN_DELAY = 50;                  // s from a launch seen to their scan of it

export function setup(S) {
  const { sim, map } = S;
  const hq = S.own('hq')[0], tels = S.own('tel'), radar = S.own('radar')[0], sams = S.own('pantsir'), cat = S.own('catapult')[0], tlvs = S.own('transloader');
  // the geometry from the map: the destroyers on station 44 km out toward the fleet's side, the carrier beyond
  const fs = map.spawns.fleet;
  const STATIONS = [0, -15000, 15000].map(lat => seaward(sim, hq, fs, 44000, lat));
  const CARRIER = seaward(sim, hq, fs, 80000);
  const sea = STATIONS[0], toSea = bearing(hq, sea);
  const taken = [xz(hq)];
  const at = (b, d, r, clear) => { const p = landSpot(sim, ...offset(hq, b, d), r || 800, taken, clear || 500); taken.push(p); return p; };
  // the ring: one Pantsir by the command post, two out toward the sea covering the TELs
  sams.forEach((u, i) => { const p = i === 0 ? at(toSea, 700, 300, 200) : at(toSea + (i === 1 ? -.9 : .9), 4200, 700); put(sim, u, p[0], p[1], toSea); radarOn(sim, u, true); });
  // TELs dispersed on the edge of the delta, 3-6 km out
  tels.forEach((u, i) => { const p = at(toSea + (i - 1) * .75, 4800 + i * 400, 900, 1500); put(sim, u, p[0], p[1], bearing(p, sea)); emplace(sim, u); });
  tlvs.forEach((u, i) => { const p = at(toSea + Math.PI + (i ? .4 : -.4), 900, 300, 150); put(sim, u, p[0], p[1], toSea); });
  const cp = at(toSea + 1.6, 1500, 400); put(sim, cat, cp[0], cp[1], toSea);
  const rp = highGround(sim, ...offset(hq, toSea - 1.2, 2000), 2500, 200);
  put(sim, radar, rp[0], rp[1], toSea); emplace(sim, radar); radarOn(sim, radar, false);
  // the fleet on station out at sea, the carrier behind with its air wing
  const cv = S.foe('carrier')[0];
  const cvp = CARRIER; put(sim, cv, cvp[0], cvp[1], bearing(cvp, hq));
  for (const f of S.foe('fighter')) { f.pos = cv.pos.slice(); f.prev = cv.pos.slice(); }
  S.foe('ddg').forEach((u, i) => {
    const p = STATIONS[i % STATIONS.length]; put(sim, u, p[0], p[1], bearing(p, hq));
    radarOn(sim, u, true); u.hold = false;
    const q = snap(sim, 'sea', ...offset(p, toSea + Math.PI / 2, 6000));
    sim.order([u.id], { kind: 'patrol', x: q[0], z: q[1] }); u.spdCap = 6;
  });
  // they know the command post
  knows(sim, 'fleet', hq, 200);
  Object.assign(S.flags, { hq, tels, radar, sams, tlvs, cv, toSea });
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { hq, tels, radar, sams, tlvs } = F;
  const ddgs = S.foe('ddg');
  const bat = [(tels[0].pos[0] + tels[1].pos[0] + tels[2].pos[0] + hq.pos[0]) / 4, 0, (tels[0].pos[2] + tels[1].pos[2] + tels[2].pos[2] + hq.pos[2]) / 4];

  /* ---- intro: the flat delta at night in the rain, the ring of Pantsirs, out to sea where they are ---- */
  S.intro([
    { t: 0, T: sams[0], lift: 3, dist: 70, yaw: F.toSea + 2.2, pitch: 6 * DEG },
    { t: 5, T: bat, dist: 7000, yaw: F.toSea + .6, pitch: 14 * DEG },
    { t: 11, T: bat, dist: 16000, yaw: F.toSea + .15, pitch: 38 * DEG },
  ], { onEnd: start });
  S.real(.8, () => S.say('Pantsir-S1 · three of them round the command post'));
  S.real(5.5, () => S.say('Out at sea · three destroyers and a carrier'));

  function start() {
    game.groups[1] = tels.map(u => u.id); game.groups[2] = [radar.id]; game.groups[3] = sams.map(u => u.id); game.groups[4] = tlvs.map(u => u.id);
    for (const n of [1, 2, 3, 4]) game.bus.emit('group', { n, ids: game.groups[n] });
    S.say('Groups · 1 TELs · 2 radar · 3 Pantsirs · 4 transloaders');
    S.say('The command post radiates · they know where it is');
    S.mark('cp', hq, { chip: 'CP', label: 'K380R · known to them', kind: 'coral', until: 8 });
  }

  /* ---- Tomahawks on the command post on a clock (the ship with the most left fires) ---- */
  function strike(target, n, why) {
    if (!target || !target.alive) return false;
    knows(sim, 'fleet', target, 150);
    const ships = ddgs.filter(u => u.alive && u.ammo.strike > 0 && dist(u, target) < u.def.weapons.strike.range * .95).sort((a, b) => b.ammo.strike - a.ammo.strike);
    if (!ships.length) return false;
    const s = ships[0];
    sim.order([s.id], { kind: 'attack', target: target.id, n: Math.min(n, s.ammo.strike) });
    sim.order([s.id], { kind: 'patrol', x: s.pos[0] + 5000, z: s.pos[2] + 1000, queue: true });
    return true;
  }
  HQ_STRIKES.forEach(([t, n]) => S.at(t, () => { if (strike(hq, n)) S.say(`${n} Tomahawks away · on the command post`, { tone: 'coral' }); }));
  // the ring runs dry: Pantsirs refill only at the depot by the command post
  S.on('launch', e => e.side === S.side && e.kind === 'sam', e => {
    const u = sim.units.get(e.from);
    if (u && u.ammo.sam === 3 && !u._lowSaid) { u._lowSaid = true; S.say(`Pantsir ${String(u.id).padStart(2, '0')} · 3 missiles left · R sends it to the depot`); }
  });

  /* ---- every launch is seen; they scan the spot, then answer ---- */
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', e => {
    const tel = sim.units.get(e.from);
    if (!tel || tel._seenAt > sim.t - 20) return;
    tel._seenAt = sim.t;
    const spot = xz(tel);
    S.say(`TEL ${String(tel.id).padStart(2, '0')} seen firing · move it before they answer`, { tone: 'coral' });
    S.mark('seen' + tel.id, tel, { chip: 'TEL', label: 'seen · move 2 km', kind: 'coral', until: 30 });
    S.after(SEEN_DELAY, () => {
      // the scan of the launch point: whatever is still within its 4 km radius is theirs
      const sc = ddgs.filter(u => u.alive && !u.off.scan && dist(u, spot) < u.def.scan.reach).sort((a, b) => dist(a, spot) - dist(b, spot))[0];
      if (!sc) return;
      sim.order([sc.id], { kind: 'scan', x: spot[0], z: spot[1], stay: true });
      sim.order([sc.id], { kind: 'patrol', x: sc.pos[0] + 5000, z: sc.pos[2] + 1000, queue: true });
      S.after(8, () => {
        const c = sim.sides.fleet.contacts.get(tel.id);
        if (tel.alive && c && c.identified && sim.t - c.lastSeen < 12) { if (strike(tel, 4)) S.say(`Tomahawks away · on TEL ${String(tel.id).padStart(2, '0')}`, { tone: 'coral' }); }
        else if (tel.alive) S.say(`They scanned where TEL ${String(tel.id).padStart(2, '0')} was · it was gone`);
      });
    });
  });
  S.on('scan', e => e.phase === 'hit' && e.side !== S.side, e => { if (!F.scanSaid) { F.scanSaid = true; S.say('Their scan · on the launch point', { tone: 'coral' }); } });
  S.on('splash', e => e.side !== S.side && e.kind === 'tlam' && e.why === 'moved', () => S.say('Tomahawk wide · nothing there'));
  S.on('hit', e => e.side !== S.side, e => { const u = sim.units.get(e.target); if (u && u.side === S.side) S.say(`Hit · ${u.def.name}${u.alive ? ` · ${Math.round(100 * u.hp / u.hpMax)} %` : ''}`, { tone: 'coral' }); });

  /* ---- SLAM-ER raids off the carrier ---- */
  const cv = F.cv;
  RAIDS.forEach((r, i) => S.at(r.at, () => {
    const jets = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0).slice(0, r.n);
    if (!jets.length) return;
    S.say(`Raid · ${jets.length} F/A-18E off the carrier`, { tone: 'coral' });
    const ip = offset(hq, bearing(hq, cv), 50000);
    for (const j of jets) { j._fired = false; sim.order([j.id], { kind: 'move', x: ip[0], z: ip[1] }); }
    const tick = () => {
      let left = 0;
      for (const j of jets) {
        if (!j.alive || j._fired) continue;
        left++;
        if (!j.aboard && dist(j, hq) < 52000) {
          j._fired = true;
          // what radiates first (the Monolith, a Pantsir), else a TEL they have seen, else the command post
          const lit = S.own().filter(u => (u.type === 'radar' || u.type === 'pantsir') && radarWorks(u));
          const seen = tels.filter(t => t.alive && sim.t - (t._seenAt || -1e9) < 240);
          const t = lit.length ? lit[Math.floor(sim.t) % lit.length] : seen.length ? seen[0] : hq;
          knows(sim, 'fleet', t, 150);
          sim.order([j.id], { kind: 'attack', target: t.id, n: 2 });
          sim.order([j.id], { kind: 'return', queue: true });
        }
      }
      if (left) S.after(.5, tick);
    };
    S.after(.5, tick);
  }));

  /* ---- the clock ---- */
  S.at(300, () => S.say('Ten minutes'));
  S.at(600, () => S.say('Five minutes'));
  S.at(840, () => S.say('One minute'));
  S.on('destroyed', e => e.side !== S.side && e.utype === 'ddg', () => S.say('A destroyer is going down'));
  S.on('intercept', e => e.side !== S.side, e => { if (!F.icT || sim.t - F.icT > 20) { F.icT = sim.t; S.say(`Intercepted · ${S.by(e)}`); } });
  S.on('destroyed', e => e.side === S.side && e.utype === 'pantsir', () => S.say('A gap in the ring', { tone: 'coral' }));
  S.holdWin(true);
  S.when(() => { const o = S.objective('hold'); return o && o.state === 'done'; }, () => { S.say('They turn away'); S.real(4, () => S.win()); });
}
