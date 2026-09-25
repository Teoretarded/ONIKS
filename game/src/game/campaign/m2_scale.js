/* 02 · Scale (Belye Shkhery, haze): both sides silent. Three destroyers lie among the skerries with their radars
   off; the battery's radar is off too. The drones find them without a sound (camera, 5 km in the haze). Whoever
   radiates first is found: the Monolith-B switched on is heard at once, a scan is an emission, a hit wakes the
   group. Rounds that arrive while they are dark are not seen coming; after the first hit they light up, and then
   they hunt the launchers (every launch shows where the TEL is). */
import { put, stow, landSpot, snap, bearing, offset, dist, radarOn, xz, enemyAi } from './world.js';

const DEG = Math.PI / 180;
/* hidden water north of Ostrov Bolshoy (masked from the mainland hills), km */
const SPOTS = [[[-5, 30], [0, 25]], [[-10, 24], [-5, 19]], [[5, 30], [10, 29]]];
const CENTER = [-1000, 26000];

export function setup(S) {
  const { sim, map } = S;
  const sp = map.spawns.coast;
  const tels = S.own('tel'), radar = S.own('radar')[0], cat = S.own('catapult')[0], tlv = S.own('transloader')[0];
  // the transloader at the battery depot (it refills there); the radar stowed and silent
  const lp = landSpot(sim, sp.x - 900, sp.z - 1200, 600, tels.map(xz), 80);
  put(sim, tlv, lp[0], lp[1], bearing(lp, CENTER));
  stow(radar); radarOn(sim, radar, false); radar.def.modelState(radar, sim.t);
  for (const u of tels.concat([cat])) { u.hdg = u.prevHdg = bearing(u, CENTER); }
  // the group, dark, drifting between hidden anchorages at 8 kn
  const ddgs = S.foe('ddg');
  ddgs.forEach((u, i) => {
    const [a, b] = SPOTS[i % SPOTS.length].map(p => snap(sim, 'sea', p[0] * 1000, p[1] * 1000));
    put(sim, u, a[0], a[1], bearing(a, b));
    radarOn(sim, u, false); u.hold = false;
    sim.order([u.id], { kind: 'patrol', x: b[0], z: b[1] });
    u.spdCap = 4;
  });
  // the helicopter in the hangar of the first destroyer
  for (const h of S.foe('helo')) {
    const d = ddgs[0];
    h.aboard = h.aboardOf = d.id; h.pos = d.pos.slice(); h.prev = d.pos.slice(); h.speed = 0; h.orders.length = 0;
  }
  sim._dirty = true;
  Object.assign(S.flags, { tels, radar, cat, tlv, ddgs, dark: true });
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { tels, radar, cat, ddgs } = F;
  const bat = [(tels[0].pos[0] + tels[1].pos[0] + cat.pos[0]) / 3, 0, (tels[0].pos[2] + tels[1].pos[2] + cat.pos[2]) / 3];
  const toG = bearing(bat, CENTER);
  const between = [bat[0] + (CENTER[0] - bat[0]) * .72, 0, bat[2] + (CENTER[1] - bat[2]) * .72];

  /* ---- intro: close on the drone launcher, then up and out over the skerries until the whole sea shows ---- */
  S.intro([
    { t: 0, T: tels[0], lift: 3, dist: 70, yaw: toG + .8, pitch: 13 * DEG },
    { t: 4.5, T: bat, dist: 4200, yaw: toG + .35, pitch: 16 * DEG },
    { t: 11, T: between, dist: 70000, yaw: toG, pitch: 60 * DEG },
  ], { onEnd: start });
  S.real(.8, () => S.say('Two TELs · a drone launcher · the radar off'));
  S.real(5.5, () => S.say('Three destroyers in the skerries · radars off'));

  const inAir = () => { for (const p of sim.projectiles.values()) if (p.alive && p.side === S.side && p.kind === 'oniks') return true; return false; };
  const heard = () => { for (const c of sim.sides.fleet.contacts.values()) { const u = sim.units.get(c.unitId); if (u && u.side === S.side && c.emitting && u.type === 'radar') return true; } return false; };

  function start() {
    S.area('last', CENTER, 14000, { label: 'Last report · 3 h old' });
    S.mark('cat', cat, { chip: 'UAV-L', label: `Orlan-10 · ${cat.drones} UAV`, kind: 'lime', until: 12 });
    S.prompt('Drone · then click inside the ring', { key: 'L' });
  }

  /* ---- the drones ---- */
  let droneSaid = false;
  S.on('takeoff', e => e.side === S.side && e.utype === 'drone', () => {
    S.prompt(null);
    if (droneSaid) return;
    droneSaid = true;
    S.say('Orlan-10 · 30 m/s · camera 5 km in this haze');
    S.real(4.5, () => { if (game.timeRate < 16 && !S.flags.found1) S.prompt('Faster while it flies', { key: '+' }); });
    S.when(() => game.timeRate >= 16 || S.flags.found1, () => S.prompt(null));
  });
  S.on('detect', e => e.side === S.side && e.unit !== undefined && ddgs.some(u => u.id === e.unit), e => {
    if (S.flags.firstDetect) return;
    S.flags.firstDetect = true;
    S.say(`${e.track} · a ship under the drone`);
  });
  S.on('classify', e => e.side === S.side && ddgs.some(u => u.id === e.unit), e => {
    const n = ddgs.filter(u => S.classified(u)).length;
    if (n === 1) { S.flags.found1 = true; S.say(`${e.track} · DDG · Arleigh Burke · radar off`); S.say('The others will be near'); }
    if (n === 2 && !S.flags.found2) {
      S.flags.found2 = true; S.unarea('last');
      S.reveal('sink'); S.reveal('sink2', true);
      S.say('Two found · they still do not know');
      S.say('Fire while they are dark · every round at once', { tone: 'lime' });
    }
  });

  /* ---- whoever radiates first ---- */
  function wake(why) {
    if (!F.dark) return;
    F.dark = false;
    S.say(why, { tone: 'coral' });
    S.real(3, () => S.say('The group is lighting up · SPY-1 radiating', { tone: 'coral' }));
    for (const u of S.foe('ddg')) { radarOn(sim, u, true); u.spdCap = 0; }
    enemyAi(sim, S.enemy, true, S.m.ai);
    S.after(40, () => S.say('They will look for your launchers · move after you fire'));
  }
  S.when(heard, () => { S.say('Radiating · they can hear it', { tone: 'coral' }); S.after(12, () => wake('They heard the radar')); });
  S.on('scan', e => e.phase === 'start' && e.side === S.side, () => { if (F.dark && !F.scanSaid) { F.scanSaid = true; S.say('A scan is an emission · they will know', { tone: 'coral' }); } S.after(20, () => wake('They caught the scan')); });
  S.on('hit', e => e.side === S.side && ddgs.some(u => u.id === e.target), () => S.after(5, () => wake('Hit · they know now')));
  S.on('splash', e => e.side === S.side && e.kind === 'oniks' && ddgs.some(u => u.alive && dist(u, e.pos) < 4000), () => S.after(5, () => wake('A near miss · they know now')));

  /* ---- the salvo from silence ---- */
  let lastLaunch = -1e9, launched = 0;
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', () => {
    launched++; lastLaunch = sim.t;
    if (launched === 1) S.say(F.dark ? 'Rounds away · nobody on their side has seen them' : 'Rounds away · they are watching now');
  });
  S.on('hit', e => e.side === S.side && e.kind === 'oniks', e => {
    const u = sim.units.get(e.target);
    if (u) S.say(u.alive ? `Hit · ${Math.round(100 * u.hp / u.hpMax)} %` : 'Hit · sinking');
  });
  S.on('intercept', e => e.kind === 'oniks', e => S.say(`Intercepted · ${S.by(e)}`, { tone: 'coral' }));

  /* ---- launchers seen: move them ---- */
  const seenSaid = new Set();
  S.every(1, () => {
    for (const t of tels) {
      if (!t.alive || seenSaid.has(t.id)) continue;
      const c = sim.sides.fleet.contacts.get(t.id);
      if (c && sim.t - c.lastSeen < 5) {
        seenSaid.add(t.id);
        S.say(`TEL ${String(t.id).padStart(2, '0')} was seen firing · move it`, { tone: 'coral' });
        S.mark('seen' + t.id, t, { chip: 'TEL', label: 'seen · move', kind: 'coral', until: 25 });
      }
    }
  });
  S.on('launch', e => e.side !== S.side && e.kind === 'tlam', () => { if (!F.tlamSaid) { F.tlamSaid = true; S.say('Tomahawks away toward the coast', { tone: 'coral' }); } });
  S.on('splash', e => e.side !== S.side && e.kind === 'tlam' && e.why === 'moved', () => S.say('Tomahawk short · the TEL had moved'));
  S.when(() => !S.own('tel').length && !sim.sides.coast.queue.some(q => q.type === 'tel'), () => S.say('No launchers left · B to order a TEL', { tone: 'coral' }));

  /* ---- the end: one sunk; it waits for the rounds already flying ---- */
  S.holdWin(true);
  const rounds = () => S.own('tel').reduce((a, t) => a + t.ammo.oniks, 0) + S.own('transloader').reduce((a, t) => a + t.cargo, 0);
  const busy = () => S.own('tel').some(t => t.reloader) || S.own('transloader').some(t => t.orders[0] && t.orders[0].kind === 'reload');
  S.when(() => { const o = S.objective('sink'); return o && o.state === 'done'; }, () => {
    const two = S.objective('sink2').state === 'done';
    S.say(two ? 'Two down' : 'One down · a second is yours to take');
    const t0 = sim.t;
    S.when(() => S.objective('sink2').state === 'done' || (!inAir() && !busy() && sim.t - Math.max(lastLaunch, t0) > (rounds() ? 240 : 30)), () => S.win(4));
  });
}
