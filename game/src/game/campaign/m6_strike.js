/* 06 · Strike (Chyortova Past, night, storm): the whole task group has run into the caldera lagoon out of the storm;
   the battery is on the southern rim. The storm is the idea. Inside a storm cell radar is nearly blind, theirs and
   yours: a round that comes at them through the cell is not seen until it is too close to stop, and a ship inside it
   is not painted either. Lightning lights up everything near the flash for both sides. One heavy cell drifts in over
   the lagoon and sits on the group for a while: find the carrier (radar before the cell, lightning and scans inside
   it), fire into the storm while they are blind, and hold the rim against what they send back. */
import { put, landSpot, snap, bearing, offset, dist, radarOn, xz, knows, emplace, siteWithView, setWeather, lightning, fleetStrikeOnce } from './world.js';
import { AI } from '../../sim/ai.js';

const DEG = Math.PI / 180;
const WIND = [-6, -4];                   // m/s: cells drift south-west at ~11 m/s
const CELL_R = 14000, CELL_K = .025;      // the heavy cell: radius, radar range factor inside
const RAIDS = [{ at: 150, n: 2 }, { at: 1500, n: 4 }];

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
  // they know nothing yet: the command post radiates, they will hear it
  Object.assign(S.flags, { hq, tels, radars, sams, tlvs, cv, ddgs, toL });
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
    S.say('Out in the open they stop most of what you fire');
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
    S.mark('cv', cv, { chip: 'CVN', label: 'Nimitz · 333 m', kind: 'coral', until: 10 });
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

  /* ---- what they send back: scans and Tomahawks on what they find, SLAM-ER when the weather lets them fly ---- */
  const ai = new AI(sim, S.enemy, S.m.ai);
  let nextAnswer = 240;
  S.every(5, () => {
    if (game.result || sim.t < nextAnswer) return;
    const t = fleetStrikeOnce(sim, ai, 4);
    if (t) S.say(`Tomahawks away · on the ${t.type === 'hq' ? 'command post' : t.type === 'tel' ? 'TELs' : t.def.name}`, { tone: 'coral' });
    nextAnswer = sim.t + (t ? 200 : 25);
    // the ships go back to circling
    for (const u of ddgs) if (u.alive && !u.orders.length) circle(u);
  });
  const circle = u => { const a = Math.atan2(u.pos[0] - cv.pos[0], u.pos[2] - cv.pos[2]) + .6, p = snap(sim, 'sea', ...offset(cv, a, 3500)); sim.order([u.id], { kind: 'patrol', x: p[0], z: p[1] }); u.spdCap = 5; };
  ddgs.forEach(circle);
  { const p = snap(sim, 'sea', ...offset(cv, F.toL + Math.PI / 2, 4000)); sim.order([cv.id], { kind: 'patrol', x: p[0], z: p[1] }); cv.spdCap = 4; }
  RAIDS.forEach(r => S.at(r.at, () => {
    if (!cv.alive) return;
    const jets = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0).slice(0, r.n);
    if (!jets.length) return;
    S.say(`${jets.length} F/A-18E off the deck`, { tone: 'coral' });
    const ts = S.own().filter(u => u.type === 'hq' || u.type === 'tel' || (u.def.sensors.radar && u.radarOn));
    jets.forEach((j, i) => {
      const t = ts[i % ts.length] || hq;
      knows(sim, 'fleet', t, 200);
      sim.order([j.id], { kind: 'attack', target: t.id, n: 2 });
      sim.order([j.id], { kind: 'return', queue: true });
    });
  }));

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
