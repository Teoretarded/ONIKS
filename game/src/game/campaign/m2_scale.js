/* 02 · Scale (Belye Shkhery, haze): both sides silent. Three destroyers lie among the skerries with their radars
   off, in water the battery's radar cannot see from its mast; the battery's radar is off too. The drones find them
   without a sound (camera, 5 km in the haze). Whoever radiates first is found: the Monolith-B switched on is heard at
   once, a scan is an emission, a hit wakes the group. Rounds that arrive while they are dark are not seen coming;
   after the first hit they light up, and then they hunt the launchers (every launch shows where the TEL is).

   Pacing (review 1: 38 game-min to find them): the anchorages are picked from the map 34-44 km out (inside the 3M55's
   reach, a short drone leg), one Orlan-10 is already on station short of the reported area, and two clocks run: the
   group's MH-60R lifts off at 06:00 and searches toward the coast (it radiates, so it also shows where they are; when
   it finds the battery the group wakes), and the group sails at 30:00 (the mission fails). */
import { put, stow, landSpot, snap, bearing, offset, dist, radarOn, xz, enemyAi, sees, seaRing, angle, toward } from './world.js';

const DEG = Math.PI / 180;
const HELO_AT = 360;             // s: the MH-60R lifts off and searches toward the coast
const SAIL_AT = 1800;            // s: the group gets under way (objective 'sail' in data/campaign.js)

export function setup(S) {
  const { sim, map } = S;
  const sp = map.spawns.coast;
  const tels = S.own('tel'), radar = S.own('radar')[0], cat = S.own('catapult')[0], tlv = S.own('transloader')[0];
  // the transloader at the battery depot (it refills there); the radar stowed and silent
  const lp = landSpot(sim, sp.x - 900, sp.z - 1200, 600, tels.map(xz), 80);
  stow(radar); radarOn(sim, radar, false); radar.def.modelState(radar, sim.t);
  const bat = [(tels[0].pos[0] + tels[1].pos[0] + cat.pos[0]) / 3, (tels[0].pos[2] + tels[1].pos[2] + cat.pos[2]) / 3];
  // the group's anchorages: hidden water toward the fleet's side, 34-44 km from the launchers
  const spots = anchorages(S, bat, radar);
  const c = [spots.reduce((a, s) => a + s.p[0], 0) / spots.length, spots.reduce((a, s) => a + s.p[1], 0) / spots.length];
  put(sim, tlv, lp[0], lp[1], bearing(lp, c));
  for (const u of tels.concat([cat])) { u.hdg = u.prevHdg = bearing(u, c); }
  // the group, dark, drifting between hidden anchorages at 8 kn
  const ddgs = S.foe('ddg');
  ddgs.forEach((u, i) => {
    const s = spots[i % spots.length];
    put(sim, u, s.p[0], s.p[1], bearing(s.p, s.q));
    radarOn(sim, u, false); u.hold = false;
    sim.order([u.id], { kind: 'patrol', x: s.q[0], z: s.q[1] });
    u.spdCap = 4;
  });
  // the helicopter in the hangar of the destroyer nearest the coast
  const lead = ddgs.slice().sort((a, b) => dist(a, bat) - dist(b, bat))[0];
  for (const h of S.foe('helo')) {
    h.aboard = h.aboardOf = lead.id; h.pos = lead.pos.slice(); h.prev = lead.pos.slice(); h.speed = 0; h.orders.length = 0;
  }
  // the last report: a ring round where they were (not exactly where they are), 8-10 km
  const off = offset(c, bearing(bat, c) + 1.2, 2200);
  const ringR = Math.max(8000, Math.max(...spots.map(s => dist(s.p, off))) + 3500);
  // one Orlan-10 already up, on station 7 km short of the ring
  const dAt = Math.max(9000, dist(bat, off) - ringR - 7000), dp = toward(bat, off, dAt);
  const dr = sim.spawn('drone', 'coast', dp[0], dp[1], { hdg: bearing(bat, off) });
  dr.speed = dr.def.speed; dr.born = -3600;
  dr.orders.push({ kind: 'patrol', x: dp[0], z: dp[1], r: 1500 });
  cat.drones = Math.max(0, cat.drones - 1);
  sim._dirty = true;
  Object.assign(S.flags, { tels, radar, cat, tlv, ddgs, lead, dark: true, CENTER: off, ringR, drone: dr, bat });
}

/* three anchorages: sea 34-44 km from the battery toward the fleet's side, deep and open, out of the Monolith-B's
   sight (the islands mask them: the radar is the trap here, not the answer), the group within ~16 km of its first
   ship; each with a second point 3-4 km off it to drift to. Falls back to seen water when the map has too little
   hidden water. */
function anchorages(S, bat, radar) {
  const { sim, map } = S;
  const fs = map.spawns.fleet, toF = bearing(bat, [fs.x, fs.z]);
  const top = S.foe('ddg')[0].def.top * .7;
  const all = seaRing(sim, bat, 34000, 44000, { step: 1500, depth: 15 }).filter(c => angle(c.b, toF) < 1.2);
  for (const c of all) c.hid = !sees(sim, radar, 14, c.p, top);
  const score = c => (c.hid ? 50000 : 0) - Math.abs(c.d - 39000) - angle(c.b, toF) * 8000;
  all.sort((a, b) => score(b) - score(a));
  const out = [];
  for (const c of all) {
    if (out.length >= 3) break;
    if (out.some(o => dist(o.p, c.p) < 5500)) continue;
    if (out.length && dist(out[0].p, c.p) > 16000) continue;
    // its drift point: hidden water 3-4 km away
    let q = null;
    for (let k = 0; k < 12 && !q; k++) {
      const p = offset(c.p, k / 12 * Math.PI * 2, 3500);
      if (map.h(p[0], p[1]) < -12 && sim.nav.open('sea', p[0], p[1]) && (!c.hid || !sees(sim, radar, 14, p, top))) q = p;
    }
    out.push({ p: c.p, q: q || c.p, hid: c.hid });
  }
  // a map with no water that far: the old spots north of Ostrov Bolshoy
  const OLD = [[-5, 30], [-10, 24], [5, 30]];
  while (out.length < 3) { const o = OLD[out.length]; const p = snap(sim, 'sea', o[0] * 1000, o[1] * 1000); out.push({ p, q: p, hid: false }); }
  return out;
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { tels, radar, cat, ddgs, CENTER, drone } = F;
  const bat = [F.bat[0], 0, F.bat[1]];
  const toG = bearing(bat, CENTER);
  const between = [bat[0] + (CENTER[0] - bat[0]) * .6, 0, bat[2] + (CENTER[1] - bat[2]) * .6];
  const km = (a, b) => Math.round(dist(a, b) / 1000);

  /* ---- intro: close on the launchers, then up and out over the skerries until the whole sea shows ---- */
  S.intro([
    { t: 0, T: tels[0], lift: 3, dist: 70, yaw: toG + .8, pitch: 13 * DEG },
    { t: 4.5, T: bat, dist: 4200, yaw: toG + .35, pitch: 16 * DEG },
    { t: 11, T: between, dist: Math.max(30000, dist(bat, CENTER) * 1.3), yaw: toG, pitch: 55 * DEG },
  ], { onEnd: start });
  S.real(.8, () => S.say('Two TELs · a drone launcher · the radar off'));
  S.real(5.5, () => S.say(`Three destroyers in the skerries · ${km(bat, CENTER)} km · radars off`));

  const inAir = () => { for (const p of sim.projectiles.values()) if (p.alive && p.side === S.side && p.kind === 'oniks') return true; return false; };
  const heard = () => { for (const c of sim.sides.fleet.contacts.values()) { const u = sim.units.get(c.unitId); if (u && u.side === S.side && c.emitting && u.type === 'radar') return true; } return false; };
  const found = () => ddgs.filter(u => S.classified(u)).length;

  function start() {
    S.area('last', CENTER, F.ringR, { label: 'Last report · 3 h old' });
    S.mark('uav', drone, { chip: 'UAV', label: 'Orlan-10 · on station', kind: 'lime', until: 14 });
    S.say(`An Orlan-10 is up · ${Math.max(1, km(drone, CENTER) - Math.round(F.ringR / 1000))} km short of the ring`);
    S.prompt(game.selection.has(drone.id) ? 'Right-click inside the ring' : 'Select the drone · 4 · then right-click inside the ring', { key: game.selection.has(drone.id) ? 'Right-click' : ['4', 'Right-click'] });
    const off = S.bus('select', () => { if (!F.sentAny && game.selection.has(drone.id)) S.prompt('Right-click inside the ring', { key: 'Right-click' }); });
    S.when(() => F.sentAny || found() > 0 || !drone.alive, () => { off(); if (!F.sentAny) S.prompt(null); });
  }
  // the player sent a drone (the one on station, or a new one off the catapult) into the ring
  S.bus('order', d => {
    if (!d || !d.order || d.order.x === undefined) return;
    const us = (d.ids || []).map(id => sim.units.get(id)).filter(Boolean);
    const k = d.order.kind;
    const drones = us.some(u => u.type === 'drone') || (k === 'launch_drone' && us.some(u => u.type === 'catapult'));
    if (drones && dist([d.order.x, d.order.z], CENTER) < F.ringR + 3000 && !F.sentAny) {
      F.sentAny = true;
      S.prompt(null);
      S.say('Orlan-10 · 30 m/s · camera 5 km in this haze');
      S.real(3.5, () => { if (game.timeRate < 16 && !found()) S.prompt('Faster while it flies', { key: '+' }); });
      S.when(() => game.timeRate >= 16 || found() > 0, () => S.prompt(null));
    }
  });

  /* ---- the drones ---- */
  S.on('takeoff', e => e.side === S.side && e.utype === 'drone', () => { if (!F.catSaid) { F.catSaid = true; S.say(`Off the catapult · ${cat.drones} left`); } });
  S.on('detect', e => e.side === S.side && e.unit !== undefined && ddgs.some(u => u.id === e.unit) && e.how === 'camera', e => {
    if (F.firstDetect) return;
    F.firstDetect = true;
    S.say(`${e.track} · a ship under the drone`);
  });
  S.on('classify', e => e.side === S.side && ddgs.some(u => u.id === e.unit), e => {
    const n = found();
    if (n === 1) { F.found1 = true; S.say(`${e.track} · DDG · Arleigh Burke · ${F.dark ? 'radar off' : 'radiating'}`); if (F.dark) S.say('The others will be near'); }
    if (n === 2 && !F.found2) {
      F.found2 = true; S.unarea('last');
      S.reveal('sink'); S.reveal('sink2', true);
      if (F.dark) { S.say('Two found · they still do not know'); S.say('Fire while they are dark · two hits sink one', { tone: 'lime' }); }
      else S.say('Two found · fire');
      if (!tels.some(t => game.selection.has(t.id))) S.prompt('Select the TELs · then right-click a track', { key: ['1', 'Right-click'] });
      S.when(() => inAir() || game.result, () => S.prompt(null));
    }
  });
  game.groups[1] = tels.map(u => u.id); game.groups[2] = [radar.id]; game.groups[3] = [cat.id]; game.groups[4] = [drone.id];
  for (const n of [1, 2, 3, 4]) game.bus.emit('group', { n, ids: game.groups[n] });

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

  /* ---- their helicopter: a search toward the coast (and a bearing to where they are) ---- */
  const helo = S.foe('helo')[0];
  if (helo) {
    S.at(HELO_AT, () => {
      if (!helo.alive || !F.dark) return;
      // it searches the water off the coast, 15 km short of the launchers
      const p = toward(bat, helo, 15000);
      sim.order([helo.id], { kind: 'patrol', x: p[0], z: p[1], r: 5000 });
    });
    S.once('detect', e => e.side === S.side && e.unit === helo.id, e => {
      S.say(`${e.track} · MH-60R · its radar · ${String(Math.round(bearing(bat, e.pos) / DEG + 360) % 360).padStart(3, '0')}°`, { tone: 'coral' });
      S.say('It came off one of them · they are that way');
      S.mark('helo', helo, { chip: 'HELO', label: 'MH-60R · searching', kind: 'coral', until: 12 });
    });
    // what it sees of the battery wakes the group
    S.when(() => !F.dark || tels.concat([cat, radar, F.tlv]).some(u => { const c = u.alive && sim.sides.fleet.contacts.get(u.id); return !!(c && c.cls && sim.t - c.lastSeen < 10 && !c.emitting); }), () => {
      if (F.dark) wake('Their helicopter has found the battery');
    });
  }

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
      if (c && sim.t - c.lastSeen < 5 && sim.t - t.lastFire < 30) {
        seenSaid.add(t.id);
        S.say(`TEL ${String(t.id).padStart(2, '0')} was seen firing · move it`, { tone: 'coral' });
        S.mark('seen' + t.id, t, { chip: 'TEL', label: 'seen · move', kind: 'coral', until: 25 });
      }
    }
  });
  S.on('launch', e => e.side !== S.side && e.kind === 'tlam', () => { if (!F.tlamSaid) { F.tlamSaid = true; S.say('Tomahawks away toward the coast', { tone: 'coral' }); } });
  S.on('splash', e => e.side !== S.side && e.kind === 'tlam' && e.why === 'moved', () => S.say('Tomahawk short · the TEL had moved'));
  S.when(() => !S.own('tel').length && !sim.sides.coast.queue.some(q => q.type === 'tel'), () => S.say('No launchers left · B to order a TEL', { tone: 'coral' }));

  /* ---- after the first salvo: reload, and a fresh track to fire on (a camera or a scan: tracks go stale) ---- */
  S.every(2, () => {
    if (game.result || !launched || inAir()) { if (F.coachP) { F.coachP = null; S.prompt(null); } return; }
    const ts = S.own('tel'), loaded = ts.some(t => t.ammo.oniks > 0), cargo = S.own('transloader').reduce((a, t) => a + t.cargo, 0);
    const reloading = ts.some(t => t.reloader) || S.own('transloader').some(t => t.orders[0] && t.orders[0].kind === 'reload');
    const trk = S.foe('ddg').some(u => S.tracked(u));
    let p = null, key = null;
    if (!loaded && cargo && !reloading) { p = 'Reload · 1, then'; key = 'R'; }
    else if (loaded && !trk) { p = F.dark ? 'No fresh track · the drone over them again' : 'No fresh track · radar up and scan, or a drone'; key = F.dark ? '4' : 'X'; }
    else if (loaded && trk && !F.dark) { p = 'Fire · 1, then right-click a destroyer'; key = 'Right-click'; }
    const k = p ? p + (key || '') : null;
    if (k !== F.coachP) { F.coachP = k; S.prompt(p, { key }); }
  }, 60);

  /* ---- the clock: they sail at 30:00 ---- */
  S.at(SAIL_AT - 600, () => { if (!game.result) S.say('Ten minutes · then they sail'); });
  S.at(SAIL_AT - 120, () => {
    if (game.result) return;
    S.say('They are getting under way', { tone: 'coral' });
    const fs = sim.map.spawns.fleet;
    for (const u of S.foe('ddg')) { u.spdCap = 0; sim.order([u.id], { kind: 'move', x: fs.x, z: fs.z }); }
  });

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
