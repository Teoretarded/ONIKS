/* 06 · Strike (Chyortova Past, night, storm): the finale. The task group holds out at sea to the north-east, past the
   reach of every scan the battery has, under a heavy storm cell. Inside the cell radar is nearly blind, theirs and
   yours: a round that comes at them through the cell is not seen until it is about a kilometre out, and a ship inside
   it is not painted either. Under it the escorts keep their radars off (no SM-6, nothing for your ESM); the carrier
   radiates. Lightning lights up everything near the flash for both sides.
   The flow (sim time; the geometry comes from the map, so the times are about):
     hold    0 - 1:30    past reach, the scans' storm radius included (the radars are sited so), under the cell;
                         no track can be had on them, so no TEL can fire
     in      1:30 -      the cell drifts in toward the battery and they come in under it, riding its back half;
             ~6:15       a scan at the edge of reach, spread to 6 km by the cell, takes them: "The cell is over their
                         approach · scan into it"; lightning over the group every 35 s shows where; fire into the storm
     stand   ~13:30 -    at their standoff, 1 km inside the scans' reach, still under the cell
     out     ~24:00      the cell has moved on over them: they turn for the open sea; five minutes later they are out of
                         reach and the mission is lost
   Every launch is seen. A minute later they look at the launch point: a TEL still up there is answered on it (SLAM-ER
   from the four jets on station, all on one TEL so they arrive together; Tomahawks from the escorts for the rest), one
   packing up is looked at again, one that has driven off is gone and draws nothing. A spot they have answered is
   watched: rounds fired from it again are tracked from the launch (an escort lights up for them), and each answer on
   it is bigger and goes for the Pantsir covering it too. The Tomahawk waves (4, 4, 8) and the SLAM-ER raids (on what
   radiates when they reach the release line) keep the rim busy. The carrier takes nine 3M55 hits: one volley into the
   storm does not do it.
   Grade (grade.js, data/campaign.js): S = sunk by 22:00, no TEL caught on its launch point, at most one unit lost;
   each missed a step, over a third of the force lost another. A battery that never moves cannot get S. */
import { put, landSpot, snap, bearing, offset, dist, radarOn, xz, knows, emplace, siteWithView, setWeather, lightning, salvo, strikeLeft, holdTracks } from './world.js';
import { PROJ, CLASSIFY } from '../../data/units.js';

const DEG = Math.PI / 180;
const CELL_R = 17000, CELL_K = .012;     // the heavy cell: radius, radar range factor inside (a ship's radar sees a
                                          // round in it about a kilometre out)
const CELL_V = 13;                        // m/s the cells drift (a storm's squalls, wind ~8.7 m/s)
const T_GO = 90;                          // s: they start in under the cell
const TURN_BACK = 15500;                  // m: the cell's middle this far past their standoff, they turn for the open sea
const TRAIL = 7000;                       // m: they ride this far behind the cell's middle (the way in stays under it)
const OUT_AFTER = 300;                    // s from the turn until they are out of reach (the mission is lost)
const PAR = 1320;                         // s: the carrier down by 22:00 for the best grade (the 'par' objective)
const HITS = 9;                           // 3M55 hits the carrier takes here
const CP_HITS = 6;                        // Tomahawk hits the dug-in command post takes here
const SEEN_DELAY = 60;                    // s from a launch seen to their look at the launch point (and the answer)
const GONE = 200;                         // m: a TEL this far off its launch point when they look is gone (not answered)
const LOOK2 = [75, 400];                  // a TEL packing up at the first look: looked at again 75 s later, gone past 400 m
const ANSWER = 3;                         // rounds on a TEL still on its launch point; two more each time the same
                                          // spot fires again, and then the Pantsir covering it too
const STATION_D = 40000;                  // m from the battery: the strike jets' station (SLAM-ER reach 80 km, outside
                                          // the Pantsirs' radar)
const STATION_N = 4;                      // F/A-18E kept on station
/* Tomahawk waves: when, how many (every escort at once) */
const WAVES = [[150, 4], [600, 4], [1140, 8]];
/* SLAM-ER raids off the deck, on what radiates */
const RAIDS = [{ at: 120, n: 2 }, { at: 780, n: 2 }, { at: 1260, n: 4 }];   // the first releases ~4:30, before they come in
const RAID_R = 62000;                     // m from the battery: the raid picks its targets there (SLAM-ER reach 80 km)
const id2 = u => String(u.id).padStart(2, '0');
const fmt = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function setup(S) {
  const { sim } = S;
  const hq = S.own('hq')[0], tels = S.own('tel'), radars = S.own('radar'), sams = S.own('pantsir'), cat = S.own('catapult')[0], tlvs = S.own('transloader');
  const reach = Math.max(...radars.map(r => r.def.scan.reach), hq.def.scan ? hq.def.scan.reach : 0);
  const scanR = radars.length ? radars[0].def.scan.r : 4000;
  // where they hold: the deep open sea farthest from the command post
  const H = holdPoint(sim, hq);
  const toT = bearing(hq, H);
  const taken = [xz(hq)];
  const at = (b, d, r, clear) => { const p = landSpot(sim, ...offset(hq, b, d), r || 600, taken, clear || 400); taken.push(p); return p; };
  // the battery: TELs dispersed behind the command post, transloaders between, Pantsirs forward covering both
  tels.forEach((u, i) => { const p = at(toT + Math.PI + (i - 1.5) * .55, 1600 + (i % 2) * 500, 500, 700); put(sim, u, p[0], p[1], toT); emplace(sim, u); });
  tlvs.forEach((u, i) => { const p = at(toT + Math.PI + (i ? .3 : -.3), 700, 250, 150); put(sim, u, p[0], p[1], toT); });
  sams.forEach((u, i) => { const p = at(toT + (i ? .8 : -.8), 1200, 400); put(sim, u, p[0], p[1], toT); radarOn(sim, u, true); });
  const cp = at(toT + 1.7, 1300, 400); put(sim, cat, cp[0], cp[1], toT);
  // the radars forward on high ground toward them, but never so far forward that a scan (its storm radius included)
  // reaches the hold: SAFE past the reach of each
  const SAFE = reach + 1.5 * scanR + 500;
  const fwd = Math.max(0, Math.min(9000, dist(hq, H) - SAFE - 900));
  const look = [H, offset(H, toT + Math.PI, 8000), offset(H, toT + Math.PI, 16000)];
  radars.forEach((u, i) => {
    let p = siteWithView(sim, offset(hq, toT + (i ? .4 : -.4), fwd), look, 1500, 45, 250);
    for (let k = 0; k < 12 && dist(p, H) < SAFE; k++) p = landSpot(sim, ...offset(p, toT + Math.PI, 800), 300, taken, 300);
    taken.push(p);
    put(sim, u, p[0], p[1], toT); emplace(sim, u); radarOn(sim, u, false);
  });
  // their standoff: in from the hold toward the battery until 1 km inside the nearest scan's reach
  const far = p => Math.min(...radars.map(r => dist(r, p) - r.def.scan.reach), dist(hq, p) - (hq.def.scan ? hq.def.scan.reach : 0));
  let sd = 0;
  while (sd < 30000 && far(offset(H, toT + Math.PI, sd)) > -1000) sd += 250;
  const Sp = snap(sim, 'sea', ...offset(H, toT + Math.PI, sd));
  const ax = [Math.sin(toT + Math.PI), Math.cos(toT + Math.PI)];        // the way in: from the hold toward the battery
  // the carrier takes nine 3M55 hits here (scaled to the round, so it stays nine whatever the balance does to either):
  // one volley of eight into the storm does not do it
  const cv = S.foe('carrier')[0], ddgs = S.foe('ddg');
  const need = PROJ.oniks.dmg * (HITS - .5);
  if (cv.hpMax < need) cv.hp = cv.hpMax = need;
  // the command post is dug in for the finale (revetments round the shelter trucks): six Tomahawks, scaled to the round
  const cpNeed = PROJ.tlam.dmg * (CP_HITS - .5);
  if (hq.hpMax < cpNeed) hq.hp = hq.hpMax = cpNeed;
  put(sim, cv, H[0], H[1], toT + Math.PI);
  radarOn(sim, cv, true);
  // the escorts are quiet under the cell (radars off: nothing for your ESM, and no SM-6); the carrier radiates
  ddgs.forEach((u, i) => { const p = snap(sim, 'sea', ...slot(H, ax, i)); put(sim, u, p[0], p[1], toT + Math.PI); radarOn(sim, u, false); u.hold = false; });
  for (const f of S.foe('fighter').concat(S.foe('helo'))) { f.pos = cv.pos.slice(); f.prev = cv.pos.slice(); }
  // the storm: the heavy cell on the group, drifting in toward the battery; two ambient cells well off the way in
  const wind = [ax[0] * CELL_V / 1.5, ax[1] * CELL_V / 1.5];
  const back = CELL_V * T_GO - TRAIL;              // at T_GO its middle is TRAIL past the hold: they go in under it
  const c0 = [H[0] - ax[0] * back, H[1] - ax[1] * back];
  const bat = [(hq.pos[0] + tels[0].pos[0] + tels[1].pos[0]) / 3, (hq.pos[2] + tels[0].pos[2] + tels[1].pos[2]) / 3];
  const lim = v => Math.max(-sim.map.W / 2 + 2000, Math.min(sim.map.W / 2 - 2000, v));
  const amb = s => { const m = offset(bat, toT, 52000), p = offset(m, toT + s * Math.PI / 2, 30000); return { x: lim(p[0]), z: lim(p[1]), r: 11000, k: .4 }; };
  setWeather(S.game, 'storm', { wind, sea: .8, flashIn: 6, squalls: [{ x: c0[0], z: c0[1], r: CELL_R, k: CELL_K }, amb(1), amb(-1)] });
  S.flags.cell = sim.weather.squalls[0];
  // the clock from the cell's drift: they turn for the open sea when its middle is TURN_BACK past their standoff
  const sS = dist(H, Sp);
  const tTurn = Math.round((T_GO + (sS + TURN_BACK - TRAIL) / CELL_V) / 10) * 10;
  const deadline = tTurn + OUT_AFTER;
  const so = S.objective('sink'); if (so) so.within = deadline;
  Object.assign(S.flags, { hq, tels, radars, sams, tlvs, cv, ddgs, toT, H, Sp, ax, bat, reach, scanR, tTurn, deadline });
}

/* the deep open water farthest from the command post, 4 km in from the map's edge */
function holdPoint(sim, hq) {
  const map = sim.map, W = map.W / 2 - 4000, Hh = map.H / 2 - 4000;
  let best = null, bd = -1;
  for (let z = -Hh; z <= Hh; z += 1000) for (let x = -W; x <= W; x += 1000) {
    if (map.h(x, z) > -200 || !sim.nav.open('sea', x, z)) continue;
    const d = dist(hq, [x, z]);
    if (d > bd) { bd = d; best = [x, z]; }
  }
  return best ? snap(sim, 'sea', best[0], best[1]) : [map.spawns.fleet.x, map.spawns.fleet.z];
}
/* an escort's place round the carrier: astern of it, deeper in the cell (on either quarter and dead astern) */
function slot(c, ax, i) {
  const P = xz(c), px = ax[1], pz = -ax[0];
  const f = [-2200, -2200, -3600][i % 3], s = [2200, -2200, 0][i % 3];
  return [P[0] + ax[0] * f + px * s, P[1] + ax[1] * f + pz * s];
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { hq, tels, radars, sams, tlvs, cv, ddgs, H, Sp, ax, bat } = F;
  const cell = F.cell;
  const bat3 = [bat[0], 0, bat[1]];

  /* ---- intro: with the carrier under the heavy cell, back over the way in looking out at the storm, down to the
     battery on the rim ---- */
  const way = [cv.pos[0] + ax[0] * 18000, 0, cv.pos[2] + ax[1] * 18000];
  S.intro([
    { t: 0, T: cv, dist: 620, yaw: F.toT + 2.4, pitch: 7 * DEG },
    { t: 3, T: cv, dist: 1100, yaw: F.toT + 2.0, pitch: 9 * DEG },
    { t: 7.5, T: way, dist: 32000, yaw: F.toT + .35, pitch: 14 * DEG },
    { t: 13, T: bat3, dist: 5200, yaw: F.toT + .1, pitch: 20 * DEG },
  ], { onEnd: start, show: [cv].concat(ddgs) });
  F.flashSaid = 1e9;                 // no flash line while the opening plays
  S.real(1.6, () => lightning(sim, cv.pos[0] + 1400, cv.pos[2] - 500));
  S.real(1, () => S.say('The carrier · three escorts · under the heavy cell'));
  S.real(8, () => S.say(`The battery · four TELs · ${Math.round(dist(cv, bat) / 1000)} km from them`));

  function start() {
    F.flashSaid = -1e9;
    game.groups[1] = tels.map(u => u.id); game.groups[2] = radars.map(u => u.id); game.groups[3] = sams.map(u => u.id); game.groups[4] = tlvs.map(u => u.id);
    for (const n of [1, 2, 3, 4]) game.bus.emit('group', { n, ids: game.groups[n] });
    S.say('Groups · 1 TELs · 2 radars · 3 Pantsirs · 4 transloaders');
    S.say(`They are out past the reach of your scans · ${Math.round(nearScan(cv) / 1000)} km`);
    S.say('They will come in under the heavy cell · radar is blind inside it');
    S.say('Under it the escorts are quiet · only the carrier radiates');
    S.say('Keep the radars dark till they come in · the raids go for what radiates');
    F.started = true;
  }

  /* ---- reach: how far past the nearest scanner's reach a point is (m; < 0 inside) ---- */
  const scanners = () => S.own().filter(u => u.def.scan && !u.off.scan && !u.aboard);
  function past(p) { let b = 1e18; for (const u of scanners()) b = Math.min(b, dist(u, p) - u.def.scan.reach); return b; }
  function nearScan(p) { let b = 1e18; for (const u of scanners()) if (u.type === 'radar') b = Math.min(b, dist(u, p)); return b < 1e17 ? b : dist(hq, p); }
  const EDGE = F.scanR * 1.5 - 1500;         // a scan at the edge of reach, spread by the core, still takes it

  /* ---- the heavy cell: drawn as it drifts; cover = the carrier in it and the way in from the battery too ---- */
  const inCell = (p, m) => { const q = p.pos ? [p.pos[0], p.pos[2]] : p; return Math.hypot(q[0] - cell.x, q[1] - cell.z) < cell.r - (m || 0); };
  const approach = () => offset(cv, bearing(cv, hq), 10000);
  const cover = () => cv.alive && inCell(cv, 800) && inCell(approach(), 800);
  S.every(1, () => { S.area('cell', [cell.x, cell.z], cell.r, { kind: 'white', label: F.said || !cv.alive ? 'Heavy cell' : 'Heavy cell · they are under it, out of reach' }); });

  /* ---- the group: hold, in under the cell, stand, out ---- */
  F.phase = 'hold';
  // a ship's order at a speed (a surface patrol shuttles between here and there)
  const go = (u, kind, p, spd) => { sim.order([u.id], { kind, x: p[0], z: p[1], spd }); u.spdCap = spd; };
  const circle = p => snap(sim, 'sea', ...offset(p, F.toT + Math.PI / 2, 3000));
  go(cv, 'patrol', circle(H), 3);
  // the escorts keep their places round the carrier (an escort with a salvo to fire fires it first)
  function screen() {
    const v = cv.alive ? Math.max(5, Math.min(16, (cv.spdCap || 4) + 2)) : 8;
    ddgs.forEach((u, i) => {
      if (!u.alive || u.orders.some(o => o.kind === 'attack')) return;
      const p = snap(sim, 'sea', ...slot(cv, ax, i));
      if (dist(u, p) < 600) { if (u.orders.length) { sim.order([u.id], { kind: 'stop' }); } return; }
      go(u, 'move', p, v);
    });
  }
  S.every(5, () => {
    if (!cv.alive) return false;
    if (F.phase === 'hold' && sim.t >= T_GO) {
      F.phase = 'in';
      go(cv, 'move', Sp, 14);
      if (F.started) S.say('They are coming in under the cell', { tone: 'coral' });
    } else if (F.phase === 'in' && (dist(cv, Sp) < 700 || !cv.orders.length)) {
      F.phase = 'stand';
      go(cv, 'patrol', circle(Sp), 4);
    } else if ((F.phase === 'stand' || F.phase === 'hold') && !cv.orders.length) {
      go(cv, 'patrol', circle(F.phase === 'hold' ? H : Sp), F.phase === 'hold' ? 3 : 4);
    }
    screen();
  });

  /* ---- the storm over their approach: said once it can be acted on (a scan into the cell reaches them) ---- */
  S.every(1, () => {
    if (!F.started || game.result || !cv.alive) return;
    const p = past(cv);
    if (!F.said && cover() && p < EDGE) {
      F.said = true; F.saidT = sim.t;
      S.say('The cell is over their approach · scan into it');
      if (p > -300) S.say(`Past ${Math.round(F.reach / 1000)} km · scan at the edge of the ring · the cell spreads it to ${Math.round(F.scanR * 1.5 / 1000)} km`);
      S.after(2, () => lightning(sim, cv.pos[0] + 900, cv.pos[2] + 700));
    }
    if (F.said && !F.directSaid && p < -300) { F.directSaid = true; if (!F.found) S.say(`Inside ${Math.round(F.reach / 1000)} km · scan right on the flash`); }
    const now = cover();
    if (F.said && !now && F.covered && cv.alive) S.say('The cell is off the carrier · their radar sees again', { tone: 'coral' });
    F.covered = now;
  });
  // lightning over the group while the cell sits on it and a scan reaches (on top of the storm's own strikes)
  S.every(35, () => { if (F.said && F.covered && cv.alive && !F.sailing) { const a = sim.t * 1.7; lightning(sim, cv.pos[0] + Math.sin(a) * 1500, cv.pos[2] + Math.cos(a) * 1500); } });
  S.on('lightning', null, e => {
    if (!cv.alive || !F.said || F.flashSaid > sim.t - (F.flashN > 1 ? 150 : 60) || F.flashSaid > 1e8) return;
    if (Math.hypot(e.pos[0] - cv.pos[0], e.pos[2] - cv.pos[2]) < 3000) { F.flashSaid = sim.t; F.flashN = (F.flashN || 0) + 1; S.say(S.tracked(cv) ? 'Lightning · the carrier in the flash' : 'Lightning · the carrier in the flash · scan there'); }
  });

  /* ---- finding it ---- */
  S.when(() => S.classified(cv), () => {
    F.found = true;
    S.done('find'); S.reveal('sink');
    const c = S.contact(cv);
    S.say(`${c ? c.track : 'TRK'} · CVN · Nimitz`);
    S.mark('cv', cv, { chip: 'CVN', label: `Nimitz · 333 m · ${HITS} hits`, kind: 'coral', until: 10 });
  });

  /* ---- what to do now: one standing instruction ---- */
  S.every(1, () => {
    if (!F.started) return;
    if (game.result || !cv.alive) { S.prompt(null); return false; }
    const tl = tels.filter(t => t.alive);
    // a TEL still on the spot it fired from
    const stay = tl.find(t => t._spot && sim.t - t._firedT < 200 && dist(t, t._spot) < 1500 && t.speed < .5);
    if (stay) { S.prompt(`Move TEL ${id2(stay)} 2 km off its launch point · 1, then`, { key: 'Right-click' }); return; }
    if (!F.said) { S.prompt(null); return; }
    if (!S.tracked(cv) && !radars.some(r => r.alive && r.radarOn)) { S.prompt('Radars on · 2, then', { key: 'Y' }); return; }
    const loaded = tl.some(t => t.ammo.oniks > 0 && !t.reloader);
    // an empty TEL standing idle with no reload coming (a transloader on its way counts)
    const coming = t => tlvs.some(v => v.alive && v.orders[0] && v.orders[0].kind === 'reload' && v.orders[0].target === t.id);
    const idle = tl.find(t => t.ammo.oniks === 0 && !t.reloader && !t.depotLoad && t.speed < .5 && !t.orders.length && !coming(t));
    if (!S.tracked(cv)) S.prompt(past(cv) > -300 ? 'Scan the edge of the ring toward them' : 'Scan the carrier · click the flash', { key: 'X' });
    else if (loaded && !S.inAir()) S.prompt('Fire into the storm · 1, then right-click the carrier', { key: 'Right-click' });
    else if (idle) S.prompt(`Reload TEL ${id2(idle)} · select it, then`, { key: 'R' });
    else S.prompt(null);
  });

  /* ---- the rounds ---- */
  let fired = 0;
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', () => {
    fired++;
    const c = cover();
    if (fired === 1 || c !== F.lastCover) { F.lastCover = c; S.say(c ? 'Into the cell · they will not see them until the end' : 'In the open · their radar has them', { tone: c ? 'lime' : 'coral' }); }
  });
  S.on('intercept', e => e.side === S.side && e.kind === 'oniks', e => { if (!F.icT || sim.t - F.icT > 15) { F.icT = sim.t; S.say(`Intercepted · ${S.by(e)}`, { tone: 'coral' }); } });
  // hits on the carrier: one line per volley
  let hitN = 0;
  S.on('hit', e => e.side === S.side && e.target === cv.id, () => {
    if (!cv.alive) return;
    if (!hitN) S.after(4, () => { if (cv.alive) S.say(`${hitN > 1 ? `${hitN} hits` : 'Hit'} · the carrier · ${Math.round(100 * cv.hp / cv.hpMax)} %`); hitN = 0; });
    hitN++;
  });
  S.on('hit', e => e.side === S.side && ddgs.some(u => u.id === e.target), e => { const u = sim.units.get(e.target); if (u) S.say(u.alive ? `Hit · escort · ${Math.round(100 * u.hp / u.hpMax)} %` : 'Escort going down'); });

  /* ---- every launch is seen: a minute later they look at the launch point, and a TEL still up there is answered on
     it (three to four minutes in the air); one packing up is looked at again; one that has driven off is not ---- */
  let batch = null;
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', e => {
    const tel = sim.units.get(e.from);
    if (!tel || tel.type !== 'tel' || tel._seenAt > sim.t - 20) return;
    tel._seenAt = sim.t; tel._firedT = sim.t; tel._spot = xz(tel);
    const spot = tel._spot;
    S.mark('seen' + tel.id, [spot[0], Math.max(0, sim.map.h(spot[0], spot[1])), spot[1]], { chip: 'TEL', label: 'seen · move 2 km', kind: 'coral', until: 40 });
    if (batch) { batch.push([tel, spot.slice()]); return; }
    // the TELs that fire together are seen and answered together
    const B = batch = [[tel, spot.slice()]];
    S.after(3, () => {
      batch = null;
      S.say(B.length > 1 ? `${B.length} TELs seen firing · move them now · 2 km` : `TEL ${id2(B[0][0])} seen firing · move it now · 2 km`, { tone: 'coral' });
      if (!F.answerSaid) { F.answerSaid = true; S.say('Every launch is seen · they answer on the launch point'); }
      S.after(SEEN_DELAY - 3, () => answer(B));
    });
  });
  const heat = [];              // launch points they have answered: { p, n, t }
  /* a launch point they have answered is watched: rounds fired from it again are tracked from the launch, storm or
     not (the escorts' SM-6s have them all the way in), so staying put after firing throws the next rounds away too */
  const cued = new Set();
  const hotAt = p => heat.find(q => dist(q.p, p) < 500 && sim.t - q.t < 900);
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', e => {
    const tel = sim.units.get(e.from);
    if (!tel || !hotAt(xz(tel))) return;
    cued.add(e.proj);
    if (!tel._cuedSaid || sim.t - tel._cuedSaid > 120) { tel._cuedSaid = sim.t; S.say(`TEL ${id2(tel)} fired from a spot they know · they track its rounds from the launch`, { tone: 'coral' }); }
  });
  S.every(.25, () => {
    for (const id of cued) { const p = sim.projectiles.get(id); if (!p || !p.alive) { cued.delete(id); continue; } p.seen[S.enemy] = sim.t + 4; }
  });
  /* the escorts' radars: quiet while the cell covers the group, lit when it does not; an escort lights up for rounds
     they are tracking from a launch point they know */
  S.every(.5, () => {
    const lit = !cover() || F.sailing || !cv.alive;
    const wake = cued.size ? ddgs.filter(u => u.alive).sort((a, b) => dist(a, bat) - dist(b, bat))[0] : null;
    for (const u of ddgs) if (u.alive) radarOn(sim, u, lit || u === wake);
    if (wake && !F.wakeSaid) { F.wakeSaid = true; S.say('An escort lights up for them · SM-6', { tone: 'coral' }); }
  });
  const onStation = () => S.foe('fighter').filter(f => f._station && !f.aboard && f.ammo.slam > 0 && (!f.orders[0] || f.orders[0].kind === 'patrol'));
  // a TEL still up on its launch point (erect, no move ordered); one packing up is looked at again a little later
  const up = t => t.elev > 1 && !t.orders.some(o => o.kind === 'move');
  function answer(B, again) {
    if (game.result || !cv.alive || F.sailing) return;
    const live = B.filter(([t]) => t.alive);
    const gone = live.filter(([t, p]) => dist(t, p) > (again ? LOOK2[1] : GONE));
    const later = again ? [] : live.filter(([t, p]) => dist(t, p) <= GONE && !up(t));
    const stay = live.filter(x => !gone.includes(x) && !later.includes(x));
    if (gone.length) S.say(gone.length > 1 ? `They looked for ${gone.length} TELs · gone` : `They looked for TEL ${id2(gone[0][0])} · it was gone`, { tone: 'lime' });
    if (later.length) S.after(LOOK2[0], () => answer(later, true));
    // a TEL caught on its launch point: the 'move' objective is missed
    if (stay.length) { const o = S.objective('move'); if (o && o.state === 'active') S.failObj('move'); }
    let sent = 0, slam = 0, tlam = 0, hot = 0, sead = 0;
    for (const [tel, spot] of stay) {
      // a launch point they have answered before: they have it now, and they answer harder
      // (an earlier answer on the same point, not a neighbour in this volley)
      let h = heat.find(q => dist(q.p, spot) < 500 && q.t < sim.t - 30 && sim.t - q.t < 900);
      if (h) { h.n++; h.t = sim.t; } else heat.push(h = { p: spot.slice(), n: 1, t: sim.t });
      const n = Math.min(7, ANSWER + 2 * (h.n - 1));
      if (h.n > 1) hot++;
      // they have the launch point: a track on the TEL there, standing still
      const fix = () => { const c = sim.sides[S.enemy].contacts.get(tel.id); if (c) { c.pos[0] = spot[0]; c.pos[2] = spot[1]; c.vel[0] = c.vel[1] = c.vel[2] = 0; c.err = 60; } };
      knows(sim, S.enemy, tel, 60); fix();
      let k = 0;
      // the jets on station put everything they have on the first TEL still on its spot (together, so the Pantsirs
      // cannot take them all); the escorts answer the rest (free ones, then after a salvo in hand)
      const nj = slam ? 0 : 8;
      for (const j of onStation().sort((a, b) => dist(a, spot) - dist(b, spot))) {
        if (k >= nj) break;
        const m = Math.min(j.ammo.slam, nj - k);
        j._station = false;
        sim.order([j.id], { kind: 'attack', target: tel.id, n: m });
        sim.order([j.id], { kind: 'return', queue: true });
        k += m; slam += m;
      }
      if (k < n) {
        k = Math.min(k, n);
        let m = salvo(sim, S.foe('ddg'), tel, n - k);
        if (m < n - k) m += salvo(sim, S.foe('ddg').filter(u => u.orders[0] && u.orders[0].kind === 'attack'), tel, n - k - m, { queue: true });
        fix();
        k += m; tlam += m;
      }
      sent += k;
      // and the Pantsir that covers that spot, so the next ones get through
      if (h.n > 1) {
        const pz = sams.filter(u => u.alive && dist(u, spot) < 6000).sort((a, b) => dist(a, spot) - dist(b, spot))[0];
        if (pz) { knows(sim, S.enemy, pz, 150); const m = salvo(sim, S.foe('ddg'), pz, 2) || salvo(sim, S.foe('ddg').filter(u => u.orders[0] && u.orders[0].kind === 'attack'), pz, 2, { queue: true }); sent += m; tlam += m; sead += m; }
      }
    }
    if (sent) S.say(`${sent} ${slam && tlam ? 'SLAM-ER and Tomahawks' : slam ? 'SLAM-ER' : 'Tomahawks'} away · on ${stay.length > 1 ? `${stay.length} launch points` : `TEL ${id2(stay[0][0])}`}${sead ? ' and a Pantsir' : ''}`, { tone: 'coral' });
    if (hot && !F.againSaid) { F.againSaid = true; S.say('They know that spot · every launch from it draws more', { tone: 'coral' }); }
  }
  S.on('splash', e => e.side !== S.side && (e.kind === 'slam' || e.kind === 'tlam') && e.why === 'moved', e => { if (!F.wideT || sim.t - F.wideT > 20) { F.wideT = sim.t; S.say(`${e.kind === 'slam' ? 'SLAM-ER' : 'Tomahawk'} wide · nothing there`, { tone: 'lime' }); } });

  /* ---- the strike jets on station (SLAM-ER), toward the battery out of the Pantsirs' reach ---- */
  const st = offset(bat, F.toT, STATION_D);
  S.every(10, () => {
    if (game.result || F.sailing || !cv.alive) return;
    const want = STATION_N - S.foe('fighter').filter(f => f._station && f.ammo.slam > 0).length;
    if (want <= 0) return;
    const deck = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0 && !f.orders.length);
    for (const f of deck.slice(0, want)) { f._station = true; sim.order([f.id], { kind: 'patrol', x: st[0], z: st[1], r: 2500 }); }
  }, 40);

  /* ---- what they send at the rim: Tomahawk waves on what they know (a Pantsir covering the command post, the
     command post, a TEL still where they saw it), bigger each time; raids off the deck on what radiates ---- */
  S.every(5, () => holdTracks(sim, S.enemy));
  const known = u => { const c = sim.sides[S.enemy].contacts.get(u.id); return !!(c && !c.dead && c.conf >= CLASSIFY && Math.hypot(c.pos[0] - u.pos[0], c.pos[2] - u.pos[2]) < 1200); };
  const RANK = { pantsir: 2, hq: 4, tel: 3, radar: 2, transloader: 1, catapult: 1 };
  function waveTarget() {
    const list = S.own().filter(u => u.def.domain === 'land' && known(u));
    const r = u => (RANK[u.type] || 1) + (u.type === 'pantsir' && hq.alive && dist(u, hq) < 16000 ? 3 : 0);
    list.sort((a, b) => r(b) - r(a));
    return list[0] || null;
  }
  const NAME = { hq: 'the command post', tel: 'a TEL', pantsir: 'a Pantsir', radar: 'a Monolith-B', transloader: 'a transloader', catapult: 'the drone launcher' };
  function wave(n, tries) {
    if (game.result || !cv.alive || F.sailing) return;
    const ships = S.foe('ddg'), left = strikeLeft(ships);
    if (!left) { if (!F.drySaid) { F.drySaid = true; S.say('The escorts are out of Tomahawks', { tone: 'lime' }); } return; }
    let t = waveTarget();
    if (!t) {
      // nothing found yet: look again, then they go on the command post's emissions
      if ((tries || 0) < 2) { S.after(30, () => wave(n, (tries || 0) + 1)); return; }
      t = hq.alive ? hq : null;
      if (!t) return;
    }
    const all = Math.min(n, left);
    // the top of their list takes its share (a Pantsir covering the command post half, anything else four at most),
    // the rest goes for the command post, together
    const share = t === hq ? all : t.type === 'pantsir' ? Math.ceil(all / 2) : Math.min(4, all);
    const k = salvo(sim, ships, t, share);
    const k2 = t !== hq && hq.alive && k && all > k ? salvo(sim, ships, hq, all - k, { queue: true }) : 0;
    if (!k) { if ((tries || 0) < 4) S.after(20, () => wave(n, (tries || 0) + 1)); return; }
    S.say(`${k + k2} Tomahawks away · on ${NAME[t.type] || t.def.name}${k2 ? ' and the command post' : ''}`, { tone: 'coral' });
  }
  WAVES.forEach(([t, n]) => S.at(t, () => wave(n)));
  RAIDS.forEach(r => S.at(r.at, () => {
    if (!cv.alive || game.result || F.sailing) return;
    const jets = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0 && !f._station).slice(0, r.n);
    if (!jets.length) return;
    S.say(`${jets.length} F/A-18E off the deck · they go for what radiates`, { tone: 'coral' });
    // out to the release line toward the battery; there they pick what radiates (the radars, the Pantsirs), then the
    // TELs and the command post they know of: a radar switched off before they get there is not their target
    const ip = offset(bat, F.toT, RAID_R - 3000);
    for (const j of jets) { j._raid = true; j._fired = false; sim.order([j.id], { kind: 'move', x: ip[0], z: ip[1] }); }
    const tick = () => {
      let left = 0;
      for (const j of jets) {
        if (!j.alive || j._fired) continue;
        left++;
        if (j.aboard || dist(j, bat) > RAID_R) continue;
        j._fired = true;
        const lit = S.own().filter(u => u.def.sensors.radar && u.radarOn && u.def.domain === 'land');
        const kn = S.own().filter(u => (u.type === 'hq' || u.type === 'tel') && known(u));
        const ts = lit.length ? lit : kn.length ? kn : [hq];
        const t = ts[jets.indexOf(j) % ts.length];
        if (!t || !t.alive) continue;
        knows(sim, S.enemy, t, 200);
        sim.order([j.id], { kind: 'attack', target: t.id, n: 2 });
        sim.order([j.id], { kind: 'return', queue: true });
      }
      if (left && !game.result) S.after(1, tick);
    };
    S.after(1, tick);
  }));
  S.at(WAVES[1][0] - 60, () => { if (!game.result && cv.alive) S.say('The waves will grow · sink the carrier and they go', { tone: 'lime' }); });
  S.on('launch', e => e.side !== S.side && e.kind === 'slam', e => { const j = sim.units.get(e.from); if (j && j._raid && (!F.slamSaid || sim.t - F.slamSaid > 60)) { F.slamSaid = sim.t; S.say('SLAM-ER away · on the rim', { tone: 'coral' }); } });
  S.on('land', e => e.side !== S.side, e => { const j = sim.units.get(e.unit); if (j) j._raid = false; });
  S.on('hit', e => e.side !== S.side, e => { const u = sim.units.get(e.target); if (u && u.side === S.side) S.say(`Hit · ${u.def.name}${u.alive ? ` · ${Math.round(100 * u.hp / u.hpMax)} %` : ''}`, { tone: 'coral' }); });
  S.on('destroyed', e => e.side === S.side && e.utype === 'pantsir', () => S.say('A Pantsir is gone · the command post is open', { tone: 'coral' }));
  S.on('destroyed', e => e.side === S.side && e.utype === 'tel', () => S.say('TEL lost', { tone: 'coral' }));

  /* ---- the par: the carrier down by 22:00 ---- */
  S.every(5, () => { const o = S.objective('par'); if (!o || o.state !== 'active') return false; if (sim.t > PAR) { S.failObj('par', ''); return false; } S.prog('par', fmt(PAR - sim.t)); });

  /* ---- the clock: when the cell has moved on over them they turn for the open sea ---- */
  const TT = F.tTurn, DL = F.deadline;
  S.at(TT - 300, () => { if (!game.result && cv.alive) S.say('Five minutes · then the cell is off them and they turn for the open sea'); });
  S.at(TT, () => {
    if (game.result || !cv.alive) return;
    F.sailing = true; F.phase = 'out';
    S.say('The cell is passing · they are turning for the open sea', { tone: 'coral' });
    go(cv, 'move', H, 16);
  });
  S.at(DL - 60, () => { if (!game.result && cv.alive) S.say('One minute · then they are out of reach', { tone: 'coral' }); });
  S.at(DL, () => {
    if (game.result || !cv.alive) return;
    S.say('The carrier is out of reach', { tone: 'coral' });
    if (S.objective('sink').hidden) S.failObj('find'); else S.failObj('sink');
  });

  /* ---- the end: the carrier going down, watched ---- */
  S.holdWin(true);
  S.once('destroyed', e => e.unit === cv.id, () => {
    const o = S.objective('par');
    if (o && o.state === 'active') S.done('par', fmt(sim.t));
    // the battle is decided here: what lands while it goes down is not held against the battery (and it is watched
    // at x1)
    for (const id of ['loss', 'cp', 'move']) { const q = S.objective(id); if (q && q.state === 'active') S.done(id); }
    if (game.timeRate > 1) game.setRate(1, 'auto');
    S.say('The carrier is going down');
    const dir = game.getSystem('director');
    if (dir && !dir.on) dir.set(true);
    S.real(9, () => S.win());
  });
}
