/* 04 · Engagement (Proliv Uzky, dusk): three destroyers run the strait northbound in column. One round at a time
   their SM-6 and Phalanx take what comes; six at once, the close-in guns cannot keep up. The battery has three TELs:
   the idea is the one big salvo, timed so the six arrive together, watched from the cinematic camera. They must go
   down before the lead ship reaches the narrows at Ostrov Sredny; the column answers with Tomahawks at whatever it
   has found (the command post radiates; a launch shows the TEL). */
import { put, landSpot, siteWithView, snap, bearing, offset, dist, radarOn, xz, knows, emplace, fleetStrikeOnce, addDepot } from './world.js';
import { AI } from '../../sim/ai.js';

const DEG = Math.PI / 180;
const ROUTE = [[1500, -52000], [2500, -38000], [3000, -26000], [4500, -14000], [5000, 4000], [3000, 30000]];
const SHORE = [-7000, 6000];      // the battery on the western shore of the strait, facing the narrows
const NARROWS_Z = -19000;
const SPEED = 11;                 // m/s, 21 kn

export function setup(S) {
  const { sim, map } = S;
  const hq = S.own('hq')[0], tels = S.own('tel'), radar = S.own('radar')[0], sams = S.own('pantsir'), cat = S.own('catapult')[0], tlvs = S.own('transloader');
  const sea = [2000, -30000];
  // the whole battery on the shore of the strait, wherever the map's spawn is (the rounds are what it brought)
  const hp = landSpot(sim, SHORE[0], SHORE[1], 1500, null, 0);
  put(sim, hq, hp[0], hp[1], bearing(hp, sea));
  const toSea = bearing(hq, sea);
  // the TELs dispersed on the ridge behind the command post, the transloaders at the battery depot
  const taken = [xz(hq)];
  const at = (b, d, r) => { const p = landSpot(sim, ...offset(hq, b, d), r || 500, taken, 400); taken.push(p); return p; };
  tels.forEach((u, i) => { const p = at(toSea + Math.PI + (i - 1) * .7, 1800); put(sim, u, p[0], p[1], bearing(p, sea)); emplace(sim, u); });
  tlvs.forEach((u, i) => { const p = at(toSea + Math.PI + (i ? .25 : -.25), 900, 300); put(sim, u, p[0], p[1], toSea); });
  // the forward ammunition point the transloaders fill up at (30 s a container)
  const dp = offset(hq, toSea + Math.PI, 900);
  addDepot(sim, dp[0], dp[1], 'Depot · forward');
  // the Pantsirs between the battery and the strait, radiating (the column already knows the coast is there)
  sams.forEach((u, i) => { const p = at(toSea + (i ? -.5 : .5), 1000, 300); put(sim, u, p[0], p[1], toSea); radarOn(sim, u, true); });
  const cp = at(toSea - .6, 1200, 300); put(sim, cat, cp[0], cp[1], toSea);
  // the radar where it can see down the strait
  const rp = siteWithView(sim, hq, ROUTE.slice(0, 4), 9000, 45, 500);
  put(sim, radar, rp[0], rp[1], toSea); emplace(sim, radar); radarOn(sim, radar, false);
  // the column at the south entrance of the strait, 1.6 km apart, SPY-1 radiating
  const ddgs = S.foe('ddg');
  const route = ROUTE.map(p => snap(sim, 'sea', p[0], p[1]));
  ddgs.forEach((u, i) => {
    const p = snap(sim, 'sea', route[0][0], route[0][1] - i * 1600);
    put(sim, u, p[0], p[1], 0);
    radarOn(sim, u, true); u.hold = false;
  });
  for (const h of S.foe('helo')) { const d = ddgs[0]; h.aboard = h.aboardOf = d.id; h.pos = d.pos.slice(); h.prev = d.pos.slice(); h.speed = 0; h.orders.length = 0; }
  sim._dirty = true;
  Object.assign(S.flags, { hq, tels, radar, sams, cat, tlvs, ddgs, route });
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { hq, tels, radar, ddgs, route } = F;
  const lead = () => ddgs.filter(u => u.alive).sort((a, b) => b.pos[2] - a.pos[2])[0] || null;
  const bat = [(tels[0].pos[0] + tels[1].pos[0] + tels[2].pos[0]) / 3, 0, (tels[0].pos[2] + tels[1].pos[2] + tels[2].pos[2]) / 3];
  const toG = bearing(bat, ddgs[0]);

  /* ---- the column follows the channel; after an attack order it picks the route up again ---- */
  const wp = new Map();
  function steer(u) {
    let i = wp.get(u.id) || 0;
    while (i < route.length - 1 && route[i][1] < u.pos[2] + 1500) i++;
    wp.set(u.id, i);
    sim.order([u.id], { kind: 'move', x: route[i][0], z: route[i][1] });
    for (let k = i + 1; k < route.length; k++) sim.order([u.id], { kind: 'move', x: route[k][0], z: route[k][1], queue: true });
    u.spdCap = SPEED;
  }
  ddgs.forEach(steer);
  S.every(3, () => { for (const u of ddgs) if (u.alive && !u.orders.length) steer(u); });

  /* ---- intro: over the column at the south entrance, up the strait to the battery on the western shore ---- */
  const d0 = ddgs[0];
  S.intro([
    { t: 0, T: d0, dist: 520, yaw: .9, pitch: 6 * DEG },
    { t: 5.5, T: [2000, 0, -20000], dist: 16000, yaw: -.25, pitch: 14 * DEG },
    { t: 11, T: bat, dist: 5200, yaw: toG + .25, pitch: 22 * DEG },
  ], { onEnd: start, show: ddgs });
  S.real(.8, () => S.say('Three Arleigh Burkes · northbound · 21 kn'));
  S.real(5.8, () => S.say('Ostrov Sredny · the narrows'));

  function start() {
    game.groups[1] = tels.map(u => u.id); game.groups[2] = [radar.id]; game.groups[3] = F.tlvs.map(u => u.id);
    for (const n of [1, 2, 3]) game.bus.emit('group', { n, ids: game.groups[n] });
    S.say('Groups · 1 the three TELs · 2 radar · 3 transloaders');
    const n = tels.reduce((a, t) => a + t.ammo.oniks, 0) + F.tlvs.reduce((a, t) => a + t.cargo, 0);
    S.say(`${n} rounds · the transloaders refill at the forward depot`);
    S.area('narrows', [2000, NARROWS_Z], 5000, { kind: 'coral', label: 'The narrows' });
    S.prompt('Radar on · find them', { key: 'Y' });
    S.when(() => radar.radarOn || ddgs.some(u => S.classified(u)), () => S.prompt(null));
  }

  /* ---- the deadline: the lead ship at the narrows ---- */
  S.every(2, () => {
    const L = lead(), o = S.objective('sink');
    if (!L || !o || o.state !== 'active') return;
    const togo = Math.max(0, NARROWS_Z - L.pos[2]);
    o.within = sim.t + togo / SPEED;
    if (togo <= 0) { S.say('The lead ship is through the narrows', { tone: 'coral' }); S.failObj('sink'); }
  });

  /* ---- one salvo of six ---- */
  const recent = [];
  let cine = false;
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', e => {
    recent.push(sim.t);
    while (recent.length && sim.t - recent[0] > 30) recent.shift();
    if (recent.length === 1) S.say('Rounds away');
    if (recent.length === 4 && !cine) {
      cine = true;
      const dir = game.getSystem('director');
      if (dir && !dir.on) { dir.set(true); S.say('Cinematic · any camera key takes it back'); }
    }
    if (recent.length >= 6) {
      const o = S.objective('salvo');
      if (o && o.state === 'active') { S.done('salvo'); S.say('Six in the air · one salvo'); }
    }
  });
  S.on('intercept', e => e.kind === 'oniks', e => S.say(`${S.by(e)} · one down`, { tone: 'coral' }));
  S.on('hit', e => e.side === S.side && e.kind === 'oniks', e => {
    const u = sim.units.get(e.target);
    if (u) S.say(u.alive ? `Hit · ${Math.round(100 * u.hp / u.hpMax)} %` : 'Hit · she is going');
  });
  // the second salvo: all three loaded first
  S.on('reload_done', e => e.side === S.side, () => {
    const up = tels.filter(t => t.alive), full = up.filter(t => t.ammo.oniks >= 2).length;
    if (full === 1 && up.length > 1 && !F.waitSaid) { F.waitSaid = true; S.say('Fire when all three are loaded · one salvo'); }
    if (full === up.length && up.length > 1) S.say('All loaded');
  });
  S.on('destroyed', e => e.side !== S.side && e.utype === 'ddg', () => {
    const n = ddgs.filter(u => !u.alive).length;
    S.say(n === 1 ? 'One sunk · one to go' : n === 2 ? 'Two sunk' : 'All three');
  });

  /* ---- they answer: scans on what they hear, Tomahawks on what they find ---- */
  const ai = new AI(sim, S.enemy, S.m.ai);
  let nextAnswer = 1e18;
  S.once('launch', e => e.side === S.side && e.kind === 'oniks', () => {
    nextAnswer = sim.t + 60;
    S.after(20, () => S.say('Every launch shows them a TEL · they will answer'));
  });
  S.every(5, () => {
    if (game.result || sim.t < nextAnswer) return;
    const t = fleetStrikeOnce(sim, ai, 4);
    nextAnswer = sim.t + (t ? 180 : 20);
  });
  S.on('launch', e => e.side !== S.side && e.kind === 'tlam', () => { if (!F.tlamSaid) { F.tlamSaid = true; S.say('Tomahawks away · toward the battery', { tone: 'coral' }); } });
  S.on('scan', e => e.phase === 'hit' && e.side !== S.side && e.hits && e.hits.length, e => {
    const u = sim.units.get(e.hits[0]);
    if (u) S.say(`They scanned the ${u.type === 'hq' ? 'command post' : u.type === 'tel' ? 'TELs' : u.def.name}`, { tone: 'coral' });
  });
  S.on('splash', e => e.side !== S.side && e.kind === 'tlam' && e.why === 'moved', () => S.say('Tomahawk wide · the TEL had moved'));

  /* ---- the end ---- */
  const inAir = () => { for (const p of sim.projectiles.values()) if (p.alive && p.side === S.side && p.kind === 'oniks') return true; return false; };
  S.holdWin(true);
  S.when(() => { const o = S.objective('sink'); return o && o.state === 'done'; }, () => {
    S.area('narrows', [2000, NARROWS_Z], 5000, { kind: 'lime', label: 'The narrows', until: 6 });
    S.when(() => !inAir(), () => S.real(5, () => S.win()));
  });
}
