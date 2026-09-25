/* 03 · Battery (Dolgaya Guba, dusk, rain): the fleet knows where the battery is. Three raids of F/A-18E come off
   the carrier out to the north-west and fire SLAM-ER from 45 km. What they aim at is chosen when they fire: what
   radiates first (the Monolith-B, a Pantsir), then what the picket destroyer at the fjord mouth has reported (the
   TELs, the command post). Radar discipline is the game: the Monolith silent while a raid is inbound, the Pantsirs
   lit only once the missiles are away. Between raids the Pantsirs refill at the battery depot (50 s a missile), the
   TELs reload, and the picket can be hunted; with it gone the raids only find what radiates. */
import { put, landSpot, highGround, snap, bearing, offset, dist, radarOn, xz, knows, deg, emplace, nearestWater, seaPath, pathFrom, seaward, siteWithView } from './world.js';
import { radarWorks } from '../../sim/sensors.js';

const DEG = Math.PI / 180;
const RAIDS = [{ at: 45, n: 2 }, { at: 560, n: 4 }, { at: 1080, n: 6 }];
const FIRE_AT = 45000;            // they fire from here (m from the battery)

export function setup(S) {
  const { sim, map } = S;
  const sp = map.spawns.coast;
  const hq = S.own('hq')[0], tels = S.own('tel'), radar = S.own('radar')[0], sams = S.own('pantsir'), tlv = S.own('transloader')[0];
  // the geometry from the map: the carrier well out beyond the fleet's side, the picket where the water route from
  // the battery out to the sea is about 35 km away
  const fs = map.spawns.fleet;
  const CARRIER = seaward(sim, hq, fs, Math.min(115000, dist(hq, fs) + 25000));
  const water = nearestWater(map, hq, 15000, 20) || [fs.x, fs.z];
  const route = seaPath(sim, water, fs);
  const PICKET = pathFrom(route, hq, 34000) || seaward(sim, hq, fs, 35000);
  const threat = bearing(hq, CARRIER);
  // the battery inside the depot's reach (2.5 km of the spawn): Pantsirs toward the threat, TELs behind, radar high
  const taken = [xz(hq)];
  const at = (b, d, r) => { const p = landSpot(sim, ...offset(hq, b, d), r || 400, taken, 250); taken.push(p); return p; };
  sams.forEach((u, i) => { const p = at(threat + (i ? .7 : -.35), 1300); put(sim, u, p[0], p[1], threat); });
  tels.forEach((u, i) => { const p = at(threat + Math.PI + (i ? .6 : -.6), 1100); put(sim, u, p[0], p[1], bearing(p, PICKET)); emplace(sim, u); });
  const lp = at(threat + Math.PI, 700, 250); put(sim, tlv, lp[0], lp[1], threat);
  const rp = siteWithView(sim, offset(hq, bearing(hq, PICKET), 1500), [PICKET, offset(hq, threat, 30000), offset(hq, threat, 20000)], 2500, 45, 250);
  put(sim, radar, rp[0], rp[1], threat); emplace(sim, radar); radarOn(sim, radar, false);
  for (const u of sams) radarOn(sim, u, false);        // EMCON until the player lights them
  // the carrier out to the north-west with the air wing aboard; the picket at the fjord mouth, radiating
  const cv = S.foe('carrier')[0], ddg = S.foe('ddg')[0];
  const cp = snap(sim, 'sea', ...CARRIER); put(sim, cv, cp[0], cp[1], threat + Math.PI);
  for (const f of S.foe('fighter')) { f.pos = cv.pos.slice(); f.prev = cv.pos.slice(); }
  const pp = snap(sim, 'sea', ...PICKET); put(sim, ddg, pp[0], pp[1], bearing(pp, hq));
  radarOn(sim, ddg, true); ddg.hold = false;
  // they know the battery (the picket's report): the command post and the TELs
  for (const u of [hq].concat(tels)) knows(sim, 'fleet', u, 150);
  // the raids' way in: the bearing (within 80 degrees of the carrier's) whose last 8 km to the battery rises least
  // (the SLAM-ER come in low and follow the ground; a fjord wall climbing toward the battery is where they crash)
  const approach = clearApproach(sim, hq, threat);
  Object.assign(S.flags, { hq, tels, radar, sams, tlv, cv, ddg, threat, CARRIER, PICKET, approach });
}

/* the bearing from `p` (within 80 degrees of `b0`, 5 degree steps) whose ground, flown in toward `p` over the last
   8 km, climbs least steeply: the worst rise over any 600 m, and a little for straying from `b0` */
function clearApproach(sim, p, b0) {
  const map = sim.map, P = xz(p);
  let best = b0, bs = 1e18;
  for (let k = -16; k <= 16; k++) {
    const b = b0 + k * 5 * DEG, H = [];
    for (let d = 8000; d >= 200; d -= 200) H.push(Math.max(0, map.h(P[0] + Math.sin(b) * d, P[1] + Math.cos(b) * d)));
    let rise = 0;
    for (let i = 3; i < H.length; i++) rise = Math.max(rise, H[i] - H[i - 3]);
    const s = rise + Math.abs(k) * 2;
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { hq, tels, radar, sams, tlv, cv, ddg } = F;
  const threat = F.threat;
  const bat = [hq.pos[0], hq.pos[1], hq.pos[2]];
  const fjord = nearestWater(sim.map, hq, 12000, 5) || offset(hq, threat - .5, 5000);
  const mid = [(fjord[0] + hq.pos[0]) / 2, 0, (fjord[1] + hq.pos[2]) / 2];

  /* ---- intro: low on the water of the fjord, up the cliff to the battery in the rain ---- */
  S.intro([
    { t: 0, T: [fjord[0], 0, fjord[1]], dist: 900, yaw: bearing(fjord, hq) - .3, pitch: 3 * DEG },
    { t: 5, T: mid, dist: 2600, yaw: bearing(fjord, hq) + .2, pitch: 9 * DEG },
    { t: 10.5, T: bat, dist: 4200, yaw: threat + Math.PI - .35, pitch: 26 * DEG },
  ], { onEnd: start });
  S.real(.8, () => S.say('Rain over the fjord · the battery on the cliffs'));
  S.real(5.5, () => S.say('They know where it is'));

  // groups: 1 TELs, 2 radar, 3 Pantsirs, 4 transloader
  game.groups[1] = tels.map(u => u.id); game.groups[2] = [radar.id]; game.groups[3] = sams.map(u => u.id); game.groups[4] = [tlv.id];
  for (const n of [1, 2, 3, 4]) game.bus.emit('group', { n, ids: game.groups[n] });

  function start() {
    S.say('Groups · 1 TELs · 2 radar · 3 Pantsirs · 4 transloader');
    S.say('Their missiles go for what radiates');
    S.say('Pantsirs silent until the missiles are away · then on');
    S.mark('sam0', sams[0], { chip: 'SAM', label: 'Pantsir-S1 · silent', kind: 'lime', until: 8 });
    S.mark('rdr', radar, { chip: 'RADAR', label: 'Monolith-B · silent', kind: 'lime', until: 8, dx: -34 });
    S.prog('raids', `0/${RAIDS.length}`);
  }

  /* ---- the raids ---- */
  const raids = RAIDS.map((r, i) => ({ i, n: r.n, at: r.at, jets: [], fired: 0, rounds: [], state: 'wait' }));
  const own = () => sim.alive(S.side);
  const emitting = u => u.alive && u.def.sensors.radar && radarWorks(u);
  function targetsFor(raid) {
    // what radiates, then what they were told, then the command post
    const lit = own().filter(u => emitting(u) && (u.type === 'radar' || u.type === 'pantsir')).sort((a, b) => (b.type === 'radar') - (a.type === 'radar'));
    const told = ddg.alive ? own().filter(u => u.type === 'tel' || u.type === 'hq') : [];
    const list = lit.concat(told.filter(u => !lit.includes(u)));
    if (!list.length) list.push(hq);
    return list;
  }
  function launch(raid) {
    raid.state = 'out';
    const jets = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0).slice(0, raid.n);
    if (jets.length < raid.n) {
      // the deck is out of use or short: the rest come from further out, already airborne
      const miss = raid.n - jets.length;
      for (let k = 0; k < miss; k++) { const u = sim.spawn('fighter', 'fleet', F.CARRIER[0] + k * 700, F.CARRIER[1], { hdg: F.threat + Math.PI }); jets.push(u); }
    }
    raid.jets = jets;
    for (const j of jets) j._fired = false;
    const ip = offset(hq, F.approach, FIRE_AT - 2000);
    raid.ip = ip;
    for (const j of jets) sim.order([j.id], { kind: 'move', x: ip[0], z: ip[1] });
    S.say(`Raid ${raid.i + 1} · ${raid.n} F/A-18E off the carrier · in from ${String(deg(F.approach)).padStart(3, '0')}°`, { tone: 'coral' });
    S.after(60, () => { if (radar.alive && emitting(radar)) S.say('Monolith-B is radiating · it will be the target', { tone: 'coral' }); });
    S.prog('raids', `${raid.i + 1}/${RAIDS.length} · inbound`);
  }
  function fire(raid, j) {
    const ts = targetsFor(raid);
    const t = ts[raid.fired % ts.length];
    raid.fired++;
    knows(sim, 'fleet', t, 100);
    sim.order([j.id], { kind: 'attack', target: t.id, n: 2 });
    sim.order([j.id], { kind: 'return', queue: true });
    if (raid.fired === 1) S.flags.aimed = t;
  }
  RAIDS.forEach((r, i) => S.at(r.at, () => launch(raids[i])));
  // each jet fires when it reaches its release point
  S.every(.5, () => {
    for (const raid of raids) {
      if (raid.state !== 'out') continue;
      for (const j of raid.jets) {
        if (!j.alive || j.aboard || j._fired) continue;
        // they release at their point on the way in (or anywhere closer, if they got past it)
        if (dist(j, raid.ip) < 4000 || dist(j, hq) < FIRE_AT - 8000) { j._fired = true; fire(raid, j); }
      }
      // fired = every jet has put its missiles in the air (its attack order is through) or is gone
      if (raid.jets.every(j => !j.alive || (j._fired && !(j.orders[0] && j.orders[0].kind === 'attack')))) raid.state = 'fired';
    }
  });
  // what the missiles went for, as they go
  let slams = 0;
  S.on('launch', e => e.side !== S.side && e.kind === 'slam', e => {
    slams++;
    const raid = raids.find(r => r.state === 'out' || r.state === 'fired');
    const t = sim.units.get(e.target);
    if (raid && !raid.said) {
      raid.said = true;
      S.say(`SLAM-ER away · ${t ? (t.type === 'radar' ? 'on the Monolith-B' : t.type === 'pantsir' ? 'on a Pantsir' : t.type === 'hq' ? 'on the command post' : 'on the TELs') : ''}`, { tone: 'coral' });
      if (sams.some(u => u.alive && !u.radarOn)) S.prompt('Pantsirs on · group 3, then', { key: 'Y' });
    }
  });
  S.every(1, () => { if (sams.every(u => !u.alive || u.radarOn) || !slamsInAir()) S.prompt(null); });
  const slamsInAir = () => { for (const p of sim.projectiles.values()) if (p.alive && p.kind === 'slam') return true; return false; };
  S.on('intercept', e => e.kind === 'slam', e => {
    const raid = raids.find(r => r.state === 'out' || r.state === 'fired');
    if (raid && !raid.icSaid) { raid.icSaid = true; S.say(`Intercepted · ${S.by(e)}`); }
  });
  S.on('hit', e => e.side !== S.side && e.kind === 'slam', e => {
    const u = sim.units.get(e.target);
    if (u) S.say(`Hit · ${u.def.name}${u.alive ? ` · ${Math.round(100 * u.hp / u.hpMax)} %` : ''}`, { tone: 'coral' });
  });
  // a raid is over when its jets have fired and nothing of it is still flying
  S.every(1, () => {
    for (const raid of raids) {
      if (raid.state !== 'fired' || slamsInAir()) continue;
      raid.state = 'over';
      const n = raids.filter(r => r.state === 'over').length;
      if (n < RAIDS.length) {
        S.prog('raids', `${n}/${RAIDS.length}`);
        const next = RAIDS[n].at - sim.t;
        S.say(next > 0 ? `Raid ${raid.i + 1} over · the next in ${Math.max(1, Math.round(next / 60))} min` : `Raid ${raid.i + 1} over · raid ${n + 1} is already out`);
        if (next > 90 && sams.some(u => u.alive && u.radarOn)) S.say('Pantsirs off until the next raid');
        S.say('Pantsirs refill at the depot · 50 s a missile');
        if (tels.some(t => t.alive && t.ammo.oniks < 2)) S.say('Reload the TELs · R');
      } else {
        S.done('raids', `${n}/${RAIDS.length}`);
        S.say('Three raids · the battery holds');
      }
    }
  });
  // radar discipline, said once each way
  S.on('radar', e => e.side === S.side && e.unit === radar.id, e => {
    const inbound = raids.some(r => r.state === 'out');
    if (e.on && inbound) S.say('Radiating with a raid inbound', { tone: 'coral' });
  });

  /* ---- the picket ---- */
  S.once('classify', e => e.side === S.side && e.unit === ddg.id, () => { S.say('The picket · DDG at the fjord mouth · it reports the battery'); S.mark('pk', ddg, { chip: 'DDG', label: 'picket · reports you', kind: 'coral', until: 10 }); });
  S.once('destroyed', e => e.unit === ddg.id, () => {
    S.say('The picket is gone · the raids will only find what radiates');
    // what they knew fades
    for (const u of tels.concat([hq])) { const c = sim.sides.fleet.contacts.get(u.id); if (c) { c.conf = .3; c.err = 8000; } }
  });
  S.on('hit', e => e.side === S.side && e.target === ddg.id, () => { if (ddg.alive) S.say(`Hit · picket · ${Math.round(100 * ddg.hp / ddg.hpMax)} %`); });
  S.on('intercept', e => e.kind === 'oniks', e => S.say(`Intercepted · ${S.by(e)}`, { tone: 'coral' }));

  /* ---- the end: three raids through, the command post standing ---- */
  S.holdWin(true);
  S.when(() => { const o = S.objective('raids'); return o && o.state === 'done'; }, () => S.real(4, () => S.win()));
}
