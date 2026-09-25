/* 06 · Strike (Chyortova Past, night, storm): the whole task group has run into the caldera lagoon out of the storm;
   the battery is on the southern rim. The storm is the idea. Inside a storm cell radar is nearly blind, theirs and
   yours: a round that comes at them through the cell is not seen until it is too close to stop, and a ship inside it
   is not painted either. Lightning lights up everything near the flash for both sides. One heavy cell drifts in over
   the lagoon and sits on the group for a while: find the carrier (radar before the cell, lightning and scans inside
   it), fire into the storm while they are blind, and hold the rim against what they send back.
   What they send back grows: Tomahawk waves every four minutes, each bigger and from every escort at once, on what
   they have found (the Pantsirs that cover the command post first, then the command post, the TELs), and SLAM-ER
   raids off the deck. When the heavy cell has passed the carrier they sail out of the caldera: the mission fails
   (the deadline is on 'sink', from the storm's own drift). A sat-out rim is overrun or the carrier sails. */
import { put, landSpot, snap, bearing, offset, dist, radarOn, xz, knows, emplace, siteWithView, setWeather, lightning, salvo, strikeLeft, holdTracks } from './world.js';
import { AI } from '../../sim/ai.js';
import { PROJ } from '../../data/units.js';

const DEG = Math.PI / 180;
const WIND = [-6, -4];                   // m/s: cells drift south-west at ~11 m/s
const CELL_R = 14000, CELL_K = .025;      // the heavy cell: radius, radar range factor inside
const RAIDS = [{ at: 150, n: 2 }, { at: 660, n: 4 }, { at: 1200, n: 4 }];
const WAVES = [[240, 4], [480, 6], [720, 8], [960, 8], [1200, 24]];   // Tomahawks: when, how many (every escort at once)
const HITS = 6;                          // 3M55 hits the carrier takes here

export function setup(S) {
  const { sim, map } = S;
  const hq = S.own('hq')[0], tels = S.own('tel'), radars = S.own('radar'), sams = S.own('pantsir'), cat = S.own('catapult')[0], tlvs = S.own('transloader');
  // the lagoon: deep water inside the ring nearest the middle
  const L = lagoon(sim);
  S.flags.lagoon = L;
  const toL = bearing(hq, L.c);
  const taken = [xz(hq)];
  const at = (b, d, r, clear) => { const p = landSpot(sim, ...offset(hq, b, d), r || 600, taken, clear || 400); taken.push(p); return p; };
  tels.forEach((u, i) => { const p = at(toL + Math.PI + (i - 1.5) * .55, 1600 + (i % 2) * 500, 500, 700); put(sim, u, p[0], p[1], toL); emplace(sim, u); });
  tlvs.forEach((u, i) => { const p = at(toL + Math.PI + (i ? .3 : -.3), 700, 250, 150); put(sim, u, p[0], p[1], toL); });
  sams.forEach((u, i) => { const p = at(toL + (i ? .8 : -.8), 1200, 400); put(sim, u, p[0], p[1], toL); radarOn(sim, u, true); });
  const cp = at(toL + 1.7, 1300, 400); put(sim, cat, cp[0], cp[1], toL);
  // the radars forward on the crest of the rim, where they look down into the lagoon
  const look = [L.c, offset(L.c, 0, 5000), offset(L.c, Math.PI / 2, 5000), offset(L.c, -Math.PI / 2, 5000)];
  radars.forEach((u, i) => {
    const p = siteWithView(sim, offset(hq, toL + (i ? .35 : -.35), 9500), look, 3000, 45, 500);
    put(sim, u, p[0], p[1], toL); emplace(sim, u); radarOn(sim, u, false);
  });
  // the group in the lagoon, radiating, circling slowly: the carrier in the middle, the escorts round it
  const cv = S.foe('carrier')[0], ddgs = S.foe('ddg');
  // the finale's carrier takes six 3M55 hits (scaled to the round, so it stays six whatever the balance does to
  // either): a salvo in the open lands about three and wounds it, the storm is where it is sunk
  const need = PROJ.oniks.dmg * (HITS - .5);
  if (cv.hpMax < need) cv.hp = cv.hpMax = need;
  const cvp = snap(sim, 'sea', L.c[0], L.c[1]); put(sim, cv, cvp[0], cvp[1], toL + Math.PI / 2);
  radarOn(sim, cv, true);
  ddgs.forEach((u, i) => {
    const a = toL + Math.PI + (i - 1) * 2.1, p = snap(sim, 'sea', ...offset(cvp, a, 3500));
    put(sim, u, p[0], p[1], a + Math.PI / 2); radarOn(sim, u, true); u.hold = false;
  });
  for (const f of S.foe('fighter').concat(S.foe('helo'))) { f.pos = cv.pos.slice(); f.prev = cv.pos.slice(); }
  // the storm: two ambient cells well away from the rim, the heavy one upwind of the lagoon
  const up = [-WIND[0], -WIND[1]], ul = Math.hypot(up[0], up[1]);
  // it starts 7.5 km upwind of the carrier: in about 7 min it covers the carrier and the approach from the rim
  const cell0 = [cvp[0] + up[0] / ul * 7500, cvp[1] + up[1] / ul * 7500];
  setWeather(S.game, 'storm', { wind: WIND, sea: .8, flashIn: 6, squalls: [
    { x: cell0[0], z: cell0[1], r: CELL_R, k: CELL_K },
    { x: L.c[0] - 30000, z: L.c[1] + 26000, r: 11000, k: .4 },
    { x: L.c[0] + 34000, z: L.c[1] - 8000, r: 12000, k: .4 },
  ] });
  S.flags.cell = sim.weather.squalls[0];
  // the deadline: four minutes after the heavy cell has drifted off the carrier they sail (the cell's own drift:
  // the later time its edge, 800 m in, crosses the carrier), whole minutes, 25-40 min
  const W = sim.weather, R = CELL_R - 800, d0 = [cell0[0] - cvp[0], cell0[1] - cvp[1]];
  const a = W.vx * W.vx + W.vz * W.vz, b = 2 * (d0[0] * W.vx + d0[1] * W.vz), c = d0[0] * d0[0] + d0[1] * d0[1] - R * R;
  const tOut = a > 1e-6 && b * b - 4 * a * c > 0 ? (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a) : 1800;
  const deadline = Math.max(1500, Math.min(2400, Math.round((tOut + 240) / 60) * 60));
  const so = S.objective('sink'); if (so) so.within = deadline;
  // they know nothing yet: the command post radiates, they will hear it
  Object.assign(S.flags, { hq, tels, radars, sams, tlvs, cv, ddgs, toL, deadline });
}

/* the middle of the lagoon: the deepest water within 20 km of the map's middle that is enclosed (land in most
   directions within 22 km) */
function lagoon(sim) {
  const map = sim.map;
  let best = null, bs = -1e18;
  for (let z = -16000; z <= 16000; z += 1000) for (let x = -16000; x <= 16000; x += 1000) {
    const h = map.h(x, z);
    if (h > -60 || !sim.nav.open('sea', x, z)) continue;
    let ring = 0;
    for (let k = 0; k < 16; k++) { const b = k / 16 * Math.PI * 2; for (let d = 2000; d <= 22000; d += 1000) if (map.h(x + Math.sin(b) * d, z + Math.cos(b) * d) > 30) { ring++; break; } }
    // clear of the central islet
    let clear = 1e9;
    for (let k = 0; k < 16; k++) { const b = k / 16 * Math.PI * 2; for (let d = 500; d <= 6000; d += 500) if (map.h(x + Math.sin(b) * d, z + Math.cos(b) * d) > 0) { clear = Math.min(clear, d); break; } }
    const s = ring * 1000 + Math.min(clear, 5000) - Math.hypot(x, z) * .05;
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return { c: best || [0, 8000] };
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { hq, tels, radars, sams, tlvs, cv, ddgs, lagoon: L } = F;
  const cell = F.cell;
  const bat = [(tels[0].pos[0] + tels[1].pos[0] + hq.pos[0]) / 3, 0, (tels[0].pos[2] + tels[1].pos[2] + hq.pos[2]) / 3];

  /* ---- intro: inside the storm over the lagoon, the carrier lit by a flash, back over the rim to the battery ---- */
  S.intro([
    { t: 0, T: cv, dist: 620, yaw: F.toL + 2.4, pitch: 7 * DEG },
    { t: 5.5, T: [L.c[0], 0, L.c[1]], dist: 14000, yaw: F.toL + .5, pitch: 16 * DEG },
    { t: 11.5, T: bat, dist: 5200, yaw: F.toL + .1, pitch: 20 * DEG },
  ], { onEnd: start, show: [cv].concat(ddgs) });
  F.flashSaid = 1e9;                 // no flash line while the opening plays
  S.real(1.6, () => lightning(sim, cv.pos[0] + 1400, cv.pos[2] - 500));
  S.real(1, () => S.say('The carrier · three escorts · in the lagoon'));
  S.real(6, () => S.say('The battery on the rim · four TELs'));

  function start() {
    F.flashSaid = -1e9;
    game.groups[1] = tels.map(u => u.id); game.groups[2] = radars.map(u => u.id); game.groups[3] = sams.map(u => u.id); game.groups[4] = tlvs.map(u => u.id);
    for (const n of [1, 2, 3, 4]) game.bus.emit('group', { n, ids: game.groups[n] });
    S.say('Groups · 1 TELs · 2 radars · 3 Pantsirs · 4 transloaders');
    S.say(`In the open their escorts stop half of what you fire · the carrier takes ${HITS} hits`);
    S.say('Inside the heavy cell they are nearly blind');
    S.prompt('Radars on · find the carrier', { key: 'Y' });
    S.when(() => radars.some(r => r.radarOn) || S.classified(cv), () => S.prompt(null));
  }

  /* ---- the heavy cell: shown as it drifts, told as it comes ---- */
  const inCell = (p, m) => { const q = p.pos ? [p.pos[0], p.pos[2]] : p; return Math.hypot(q[0] - cell.x, q[1] - cell.z) < cell.r - (m || 0); };
  // cover: the carrier inside the cell and so is the way in from the rim (10 km of the approach)
  const approach = () => offset(cv, bearing(cv, hq), 10000);
  const cover = () => cv.alive && inCell(cv, 800) && inCell(approach(), 800);
  let covered = false;
  S.every(1, () => {
    S.area('cell', [cell.x, cell.z], cell.r, { kind: 'white', label: 'Heavy cell' });
    const a = approach(), d = Math.hypot(a[0] - cell.x, a[1] - cell.z) - (cell.r - 800);
    const v = Math.hypot(sim.weather.vx, sim.weather.vz) || 1;
    if (!F.etaSaid && d > 0 && d / v < 240 && sim.t > 20) { F.etaSaid = true; S.say(`The heavy cell covers the lagoon in ${Math.max(1, Math.round(d / v / 60))} min`); }
    const now = cover();
    if (now && !covered) {
      covered = true;
      S.say('The cell is on the carrier · their radar is blind in it');
      S.say('Fire into the storm');
      S.after(2, () => lightning(sim, cv.pos[0] + 900, cv.pos[2] + 700));
    }
    if (!now && covered && cv.alive) { covered = false; S.say('The cell has passed · they can see again', { tone: 'coral' }); }
  });
  // what to do while the cell is on them: keep a track (scan: the radars are blind in there too), fire, reload
  S.every(1, () => {
    if (game.result || !cv.alive || !F.found) return;
    if (!covered) { if (F.coach) { F.coach = false; S.prompt(null); } return; }
    F.coach = true;
    const tels_ = tels.filter(t => t.alive), loaded = tels_.some(t => t.ammo.oniks > 0 && !t.reloader);
    if (!S.tracked(cv)) S.prompt('Scan the carrier · the radars lost it in the cell', { key: 'X' });
    else if (loaded && !S.inAir()) S.prompt('Fire into the storm · 1, then right-click the carrier', { key: 'Right-click' });
    else if (!loaded && !tels_.some(t => t.reloader)) S.prompt('Reload · 1, then', { key: 'R' });
    else S.prompt(null);
  });
  // lightning over the group while the cell sits on it (on top of the storm's own strikes)
  S.every(40, () => { if (covered && cv.alive) { const a = sim.t * 1.7; lightning(sim, cv.pos[0] + Math.sin(a) * 1500, cv.pos[2] + Math.cos(a) * 1500); } });
  S.on('lightning', null, e => {
    if (!cv.alive || F.flashSaid > sim.t - 60 || F.flashSaid > 1e8) return;
    if (Math.hypot(e.pos[0] - cv.pos[0], e.pos[2] - cv.pos[2]) < 3000) { F.flashSaid = sim.t; S.say('Lightning · the carrier in the flash'); }
  });

  /* ---- finding it ---- */
  S.when(() => S.classified(cv), () => {
    F.found = true;
    S.done('find'); S.reveal('sink');
    const c = S.contact(cv);
    S.say(`${c ? c.track : 'TRK'} · CVN · Nimitz`);
    S.mark('cv', cv, { chip: 'CVN', label: `Nimitz · 333 m · ${HITS} hits`, kind: 'coral', until: 10 });
  });

  /* ---- the rounds ---- */
  let fired = 0;
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', e => {
    fired++;
    if (fired === 1 || (fired > 1 && cover() !== F.lastCover)) { F.lastCover = cover(); S.say(cover() ? 'Into the cell · they will not see them until the end' : 'In the open · their radar has them', { tone: cover() ? 'lime' : 'coral' }); }
  });
  S.on('intercept', e => e.side === S.side && e.kind === 'oniks', e => { if (!F.icT || sim.t - F.icT > 15) { F.icT = sim.t; S.say(`Intercepted · ${S.by(e)}`, { tone: 'coral' }); } });
  S.on('hit', e => e.side === S.side && e.target === cv.id, () => { if (cv.alive) S.say(`Hit · the carrier · ${Math.round(100 * cv.hp / cv.hpMax)} %`); });
  S.on('hit', e => e.side === S.side && ddgs.some(u => u.id === e.target), e => { const u = sim.units.get(e.target); if (u) S.say(u.alive ? `Hit · escort · ${Math.round(100 * u.hp / u.hpMax)} %` : 'Escort going down'); });

  /* ---- what they send back: scans, then Tomahawk waves on what they found, bigger each time, every escort at once;
     SLAM-ER raids off the deck ---- */
  const ai = new AI(sim, S.enemy, S.m.ai);
  const circle = u => { const a = Math.atan2(u.pos[0] - cv.pos[0], u.pos[2] - cv.pos[2]) + .6, p = snap(sim, 'sea', ...offset(cv, a, 3500)); sim.order([u.id], { kind: 'patrol', x: p[0], z: p[1] }); u.spdCap = 5; };
  ddgs.forEach(circle);
  { const p = snap(sim, 'sea', ...offset(cv, F.toL + Math.PI / 2, 4000)); sim.order([cv.id], { kind: 'patrol', x: p[0], z: p[1] }); cv.spdCap = 4; }
  // their scans on what they hear (the command post radiates, a launch shows a TEL), as the commander would
  S.every(30, () => { if (game.result || F.sailing) return; ai.inb = new Map(); ai._targets = null; ai.fleetScan(); }, 150);
  // the ships go back to circling after a salvo or a scan; their rounds keep their aim on what stands still
  S.every(4, () => { if (F.sailing) return; for (const u of ddgs) if (u.alive && !u.orders.length) circle(u); });
  S.every(5, () => holdTracks(sim, S.enemy));
  // what a wave goes for: the top of their list (a Pantsir covering the command post, the command post, the TELs)
  function target() {
    ai.inb = new Map(); ai._targets = null;
    const sams_ = [];
    for (const c of sim.sides.fleet.contacts.values()) if (!c.dead && c.cls === 'SAM') sams_.push(c);
    for (const { c } of ai.strikeTargets(sams_)) { const u = sim.units.get(c.unitId); if (u && u.alive && u.side === S.side) return u; }
    return null;
  }
  const NAME = { hq: 'the command post', tel: 'a TEL', pantsir: 'a Pantsir', radar: 'a Monolith-B', transloader: 'a transloader', catapult: 'the drone launcher' };
  function wave(n, last, tries) {
    if (game.result || !cv.alive || F.sailing) return;
    const ships = S.foe('ddg'), left = strikeLeft(ships);
    if (!left) { if (!F.drySaid) { F.drySaid = true; S.say('The escorts are out of Tomahawks', { tone: 'lime' }); } return; }
    let t = target();
    if (!t) {
      // nothing found yet: look again, and after a few tries they go on the command post's emissions
      if ((tries || 0) < 4) { S.after(30, () => wave(n, last, (tries || 0) + 1)); return; }
      t = hq.alive ? hq : null;
      if (!t) return;
    }
    const all = last ? left : Math.min(n, left);
    // a Pantsir that covers the command post takes half; the other half goes for the command post itself, together
    const both = t.type === 'pantsir' && hq.alive && dist(t, hq) < 16000 && all >= 4 && sim.sides.fleet.contacts.get(hq.id);
    const k = salvo(sim, ships, t, both ? Math.ceil(all / 2) : all);
    const k2 = both && k ? salvo(sim, ships, hq, all - k, { queue: true }) : 0;
    if (!k) { if ((tries || 0) < 4) S.after(20, () => wave(n, last, (tries || 0) + 1)); return; }
    S.say(`${k + k2} Tomahawks away · on ${NAME[t.type] || t.def.name}${k2 ? ' and the command post' : ''}`, { tone: 'coral' });
    if (last) S.say('Everything the escorts have left', { tone: 'coral' });
  }
  WAVES.forEach(([t, n], i) => S.at(t, () => wave(n, i === WAVES.length - 1)));
  S.at(WAVES[1][0] - 60, () => { if (!game.result && cv.alive) S.say('The waves will grow · sink the carrier and they go', { tone: 'lime' }); });
  RAIDS.forEach(r => S.at(r.at, () => {
    if (!cv.alive || game.result || F.sailing) return;
    const jets = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0).slice(0, r.n);
    if (!jets.length) return;
    S.say(`${jets.length} F/A-18E off the deck`, { tone: 'coral' });
    // what radiates first (the radars, the Pantsirs), then the TELs and the command post they know of
    const lit = S.own().filter(u => u.def.sensors.radar && u.radarOn && u.def.domain === 'land');
    const known = S.own().filter(u => (u.type === 'hq' || u.type === 'tel') && (() => { const c = sim.sides.fleet.contacts.get(u.id); return c && c.cls; })());
    const ts = lit.concat(known.length ? known : [hq]);
    jets.forEach((j, i) => {
      const t = ts[i % ts.length] || hq;
      knows(sim, 'fleet', t, 200);
      sim.order([j.id], { kind: 'attack', target: t.id, n: 2 });
      sim.order([j.id], { kind: 'return', queue: true });
    });
  }));
  S.on('launch', e => e.side !== S.side && e.kind === 'slam', () => { if (!F.slamSaid || sim.t - F.slamSaid > 60) { F.slamSaid = sim.t; S.say('SLAM-ER away · on the rim', { tone: 'coral' }); } });
  S.on('hit', e => e.side !== S.side, e => { const u = sim.units.get(e.target); if (u && u.side === S.side) S.say(`Hit · ${u.def.name}${u.alive ? ` · ${Math.round(100 * u.hp / u.hpMax)} %` : ''}`, { tone: 'coral' }); });
  S.on('destroyed', e => e.side === S.side && e.utype === 'pantsir', () => S.say('A Pantsir is gone · the command post is open', { tone: 'coral' }));

  /* ---- the clock: when the cell has passed they sail out of the caldera ---- */
  const DL = F.deadline;
  S.at(DL - 600, () => { if (!game.result && cv.alive) S.say('Ten minutes · then the storm is off them and they sail'); });
  S.at(DL - 240, () => {
    if (game.result || !cv.alive) return;
    F.sailing = true;
    S.say('They are getting under way · out through the gap', { tone: 'coral' });
    const fs = sim.map.spawns.fleet, out = [fs.x, fs.z];
    for (const u of [cv].concat(ddgs)) if (u.alive) { u.spdCap = 0; sim.order([u.id], { kind: 'move', x: out[0], z: out[1] }); }
  });
  S.at(DL, () => {
    if (game.result || !cv.alive) return;
    S.say('The carrier is out of the caldera', { tone: 'coral' });
    if (S.objective('sink').hidden) S.failObj('find'); else S.failObj('sink');
  });

  /* ---- the end: the carrier going down, watched ---- */
  S.holdWin(true);
  S.once('destroyed', e => e.unit === cv.id, () => {
    S.say('The carrier is going down');
    const dir = game.getSystem('director');
    if (dir && !dir.on) dir.set(true);
    S.real(9, () => S.win());
  });
  S.on('destroyed', e => e.side === S.side && e.utype === 'tel', () => S.say('TEL lost', { tone: 'coral' }));
}
