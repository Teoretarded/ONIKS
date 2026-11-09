/* 05 · Ring (Ust-Solyonaya, night, rain): the fleet strikes back. The command post radiates and they know it. Three
   destroyers on station fire Tomahawk salvos at it on a clock, all ships together so they arrive as one, growing, the
   last everything they have left; each wave is so many rounds per destroyer still afloat, so a ship sunk early takes a
   third out of every wave after. SLAM-ER raids come off the carrier between them and go
   for whatever radiates. Three Pantsirs make the ring round the command post; they run dry (the depot refills them,
   R) and a sat-out ring is saturated before the fifteen minutes are up. Every TEL that fires is seen, scanned and
   answered with Tomahawks, so the TELs fire and move (more than the 1.5 km a Tomahawk can correct for).
   The way through: hit the destroyers (one under half strength fires no more salvos, so its Tomahawks come out of
   every salvo after), keep the Pantsirs fed, move the TELs. Grade: no ship sunk is C at best (data/campaign.js par). */
import { put, landSpot, highGround, snap, bearing, offset, dist, radarOn, xz, knows, emplace, seaward, salvo, strikeLeft, holdTracks, seaRing, angle, toward, addDepot } from './world.js';
import { radarWorks, horizon } from '../../sim/sensors.js';
import { PROJ } from '../../data/units.js';

const DEG = Math.PI / 180;
/* Tomahawk salvos on the command post: sim s, rounds per destroyer still afloat (all ships together, so they arrive
   as one), the last everything they have left: 3, 3, 6, then 12 from three ships that were never touched, which a ring
   worn down by the first three cannot stop; a ship sunk early takes its share out of every wave and most of the last.
   The rounds take 3-4 min to come in over the delta: the last lands about 12:30, so a ring that holds has earned the
   last minutes. */
const WAVES = [[90, 1], [230, 1], [380, 2], [520, 99]];
/* a SLAM-ER raid off the carrier: it goes for what radiates (the ring) */
const RAIDS = [{ at: 200, n: 2 }];
const SEEN_DELAY = 50;                  // s from a launch seen to their scan of it
const CP_HITS = 3;                      // Tomahawk hits the dug-in command post takes here
const DEPOT_R = 2500;                   // the battery depot's reach (a spawn counts out to 2.5 km)

export function setup(S) {
  const { sim, map } = S;
  const hq = S.own('hq')[0], tels = S.own('tel'), radar = S.own('radar')[0], sams = S.own('pantsir'), cat = S.own('catapult')[0], tlvs = S.own('transloader');
  // the geometry from the map: the destroyers on station 35 km out toward the fleet's side (inside the radio horizon
  // of the command post's mast: their radars are heard from the start, so there is always a bearing to scan), the
  // carrier beyond. Where the map's spawn is too far inland for that, the battery sets up nearer the sea, with its own
  // depot (Pantsirs and transloaders refill there)
  const fs = map.spawns.fleet;
  // the command post is dug in for this (revetments round the shelter trucks): it takes three Tomahawks, scaled to
  // the round so it stays three whatever the balance does to either
  const need = PROJ.tlam.dmg * (CP_HITS - .5);
  if (hq.hpMax < need) hq.hp = hq.hpMax = need;
  const fwd = forward(sim, hq, fs);
  if (fwd) {
    put(sim, hq, fwd[0], fwd[1], bearing(fwd, [fs.x, fs.z]));
    addDepot(sim, fwd[0], fwd[1], 'Depot · battery', 'coast').r = 2500;
  }
  const STATIONS = stations(sim, hq, fs);
  const CARRIER = seaward(sim, hq, fs, 75000);
  const sea = STATIONS[0], toSea = bearing(hq, sea);
  const taken = [xz(hq)];
  const at = (b, d, r, clear) => { const p = landSpot(sim, ...offset(hq, b, d), r || 800, taken, clear || 500); taken.push(p); return p; };
  // the ring: one Pantsir by the command post, two out toward the sea covering the TELs
  sams.forEach((u, i) => { const p = i === 0 ? at(toSea, 700, 300, 200) : at(toSea + (i === 1 ? -.9 : .9), 4200, 700); put(sim, u, p[0], p[1], toSea); radarOn(sim, u, true); });
  // TELs dispersed on the edge of the delta, 2.6-3.2 km out; the transloaders a short drive behind them, at the edge of
  // the battery depot (they refill there, 30 s a container)
  tels.forEach((u, i) => { const p = at(toSea + (i - 1) * .9, 2600 + i * 300, 600, 1100); put(sim, u, p[0], p[1], bearing(p, sea)); emplace(sim, u); });
  tlvs.forEach((u, i) => { const p = at(toSea + (i ? .45 : -.45), 1900, 300, 250); put(sim, u, p[0], p[1], toSea); });
  const cp = at(toSea + 1.6, 1500, 400); put(sim, cat, cp[0], cp[1], toSea);
  const rp = highGround(sim, ...offset(hq, toSea - 1.2, 2000), 2500, 200);
  put(sim, radar, rp[0], rp[1], toSea); emplace(sim, radar); radarOn(sim, radar, false);
  // the fleet on station out at sea, the carrier behind with its air wing
  const cv = S.foe('carrier')[0];
  const cvp = CARRIER; put(sim, cv, cvp[0], cvp[1], bearing(cvp, hq));
  for (const f of S.foe('fighter')) { f.pos = cv.pos.slice(); f.prev = cv.pos.slice(); }
  const beats = [];
  S.foe('ddg').forEach((u, i) => {
    const p = STATIONS[i % STATIONS.length]; put(sim, u, p[0], p[1], bearing(p, hq));
    radarOn(sim, u, true); u.hold = false;
    // its beat: 4 km across the line to the command post, the way that stays inside the radio horizon
    const hor = horizon(hq.pos[1] + hq.def.top, 20) * 1.1;
    const q = [1, -1].map(s => snap(sim, 'sea', ...offset(p, bearing(hq, p) + s * Math.PI / 2, 4000))).sort((a, b) => dist(a, hq) - dist(b, hq))[0];
    if (dist(q, hq) > hor) { q[0] = p[0]; q[1] = p[1]; }
    beats.push({ u, q });
    sim.order([u.id], { kind: 'patrol', x: q[0], z: q[1] }); u.spdCap = 6;
  });
  // they know the command post
  knows(sim, 'fleet', hq, 200);
  // the battery depot: Pantsirs refill inside it (50 s a missile, once they have not fired for a minute), transloaders
  // too; the two forward Pantsirs start outside it, covering the TELs
  const depot = fwd || [map.spawns.coast.x, map.spawns.coast.z];
  Object.assign(S.flags, { hq, tels, radar, sams, tlvs, cv, toSea, beats, depot });
}

/* where the battery sets up when the spawn is too far from the sea: the nearest water deep enough for a destroyer
   toward the fleet's side brought to 31 km, on open land; null when it is already within 33 km */
function forward(sim, hq, fs) {
  const toF = bearing(hq, [fs.x, fs.z]);
  const all = seaRing(sim, hq, 5000, 70000, { step: 1500, depth: 12 }).filter(c => angle(c.b, toF) < 1.2);
  if (!all.length) return null;
  let near = all[0];
  for (const c of all) if (c.d < near.d) near = c;
  if (near.d <= 33000) return null;
  const p = toward(hq, near.p, near.d - 31000);
  return landSpot(sim, p[0], p[1], 2000, null, 0);
}

/* three stations on open water toward the fleet's side, 26-38 km from the command post and inside the radio horizon
   of its 18 m mast for a ship's radar at 20 m (so their radars are heard all along, and the command post can scan
   them), 7-24 km apart; closer together, then a little further out, when the water is short */
function stations(sim, hq, fs) {
  const toF = bearing(hq, [fs.x, fs.z]), hor = horizon(hq.pos[1] + hq.def.top, 20);
  const score = c => Math.abs(c.d - 34000) + angle(c.b, toF) * 9000;
  const out = [];
  for (const [dMax, depth, gap] of [[Math.min(38500, hor * 1.05), 12, 7000], [Math.min(38500, hor * 1.05), 10, 4500], [hor * 1.1, 10, 4500]]) {
    const all = seaRing(sim, hq, 24000, dMax, { step: 1000, depth }).filter(c => angle(c.b, toF) < 1.5).sort((a, b) => score(a) - score(b));
    for (const c of all) {
      if (out.length >= 3) break;
      if (out.some(o => dist(o, c.p) < gap) || (out.length && dist(out[0], c.p) > 24000)) continue;
      out.push(c.p);
    }
    if (out.length >= 3) break;
  }
  // no water that near at all: the old stations 44 km out
  for (const lat of [0, -15000, 15000]) if (out.length < 3) out.push(seaward(sim, hq, fs, 44000, lat));
  return out;
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
    S.say('A destroyer with a 3M55 in it fires no more salvos', { tone: 'lime' });
    S.mark('cp', hq, { chip: 'CP', label: `K380R · dug in · ${CP_HITS} hits`, kind: 'coral', until: 8 });
    S.area('depot', F.depot, DEPOT_R, { kind: 'lime', label: 'Depot · refill' });
    S.say('Pantsirs refill only inside the depot ring · 50 s a missile, between salvos');
    // what to do first: a track on a destroyer, then fire; then the ring in close where it can refill
    S.every(1, () => {
      if (game.result) { S.prompt(null); return false; }
      if (!F.firstFire) {
        const trk = ddgs.some(u => u.alive && S.tracked(u));
        if (!trk) S.prompt('Scan a destroyer · the command post reaches 50 km', { key: 'X' });
        else S.prompt('Fire · 1, then right-click a destroyer', { key: ['1', 'Right-click'] });
        return;
      }
      if (F.firstFireT === undefined) F.firstFireT = sim.t;
      const out = sams.filter(u => u.alive && dist(u, F.depot) > DEPOT_R - 300);
      if (out.length && sim.t - F.firstFireT < 150) S.prompt('Pull the Pantsirs into the depot ring · 3, then right-click inside it', { key: ['3', 'Right-click'] });
      else { S.prompt(null); return false; }
    });
  }

  /* ---- their rounds keep their aim on what stands still ---- */
  S.every(5, () => holdTracks(sim, S.enemy));

  /* ---- the destroyers back on station after each salvo ---- */
  S.every(4, () => { for (const b of F.beats) if (b.u.alive && !b.u.orders.length) { sim.order([b.u.id], { kind: 'patrol', x: b.q[0], z: b.q[1] }); b.u.spdCap = 6; } });

  /* ---- Tomahawk salvos on the command post, bigger each time; a destroyer with a 3M55 in it (under half strength)
     fights its own fires, not the coast: it fires no more salvos ---- */
  const shooters = () => S.foe('ddg').filter(u => u.hp > u.hpMax * .5);
  WAVES.forEach(([t, n], i) => S.at(t, () => {
    if (game.result || !hq.alive) return;
    const ships = shooters(), left = strikeLeft(ships);
    if (!left) { if (!F.drySaid) { F.drySaid = true; S.say('No destroyer left that can fire', { tone: 'lime' }); } return; }
    const k = salvo(sim, ships, hq, Math.min(n * ships.length, left));
    if (!k) return;
    const from = ships.filter(u => u.alive && u.orders[0] && u.orders[0].kind === 'attack').length;
    S.say(`${k} Tomahawks away · ${from > 1 ? `${from} ships · ` : ''}on the command post`, { tone: 'coral' });
    if (i === WAVES.length - 1) S.say('Everything they have left', { tone: 'coral' });
    else if (i === 0) S.after(20, () => S.say('Every destroyer that can still fire joins every salvo'));
    const out = ddgs.length - ships.length;
    if (out && i > 0) S.say(`${out} ship${out > 1 ? 's' : ''} out of it · a smaller salvo`, { tone: 'lime' });
  }));
  S.on('hit', e => e.side === S.side && e.kind === 'oniks', e => {
    const u = sim.units.get(e.target);
    if (!u || u.type !== 'ddg' || !u.alive || u._outSaid || u.hp > u.hpMax * .5) return;
    u._outSaid = true;
    S.say(`Hit · DDG ${String(u.id).padStart(2, '0')} · ${Math.round(100 * u.hp / u.hpMax)} % · it fires no more salvos`, { tone: 'lime' });
  });
  // the ring runs dry: Pantsirs refill only at the depot by the command post
  S.on('launch', e => e.side === S.side && e.kind === 'sam', e => {
    const u = sim.units.get(e.from);
    if (u && u.ammo.sam === 3 && !u._lowSaid) { u._lowSaid = true; S.say(`Pantsir ${String(u.id).padStart(2, '0')} · 3 missiles left · R sends it to the depot`); }
    if (u && u.ammo.sam === 0 && !u._drySaid) { u._drySaid = true; S.say(`Pantsir ${String(u.id).padStart(2, '0')} · empty · a gap in the ring`, { tone: 'coral' }); }
  });

  /* ---- every launch is seen; they scan the spot, then answer ---- */
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', e => {
    S.flags.firstFire = true;
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
      S.after(8, () => {
        const c = sim.sides.fleet.contacts.get(tel.id);
        if (tel.alive && c && c.identified && sim.t - c.lastSeen < 12) { if (salvo(sim, shooters(), tel, 2)) S.say(`Tomahawks away · on TEL ${String(tel.id).padStart(2, '0')}`, { tone: 'coral' }); }
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
    if (game.result || !cv.alive) return;
    const jets = S.foe('fighter').filter(f => f.aboard && !f.rearmT && f.ammo.slam > 0).slice(0, r.n);
    if (!jets.length) return;
    S.say(`Raid · ${jets.length} F/A-18E off the carrier${r.cp ? ' · for the command post' : ''}`, { tone: 'coral' });
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
          const t = r.cp && hq.alive ? hq : lit.length ? lit[(Math.floor(sim.t) + jets.indexOf(j)) % lit.length] : seen.length ? seen[0] : hq;
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
  S.on('destroyed', e => e.side !== S.side && e.utype === 'ddg', () => {
    const left = strikeLeft(shooters());
    S.say(`A destroyer is going down · ${left} Tomahawks left out there`, { tone: 'lime' });
  });
  S.on('intercept', e => e.side !== S.side, e => { if (!F.icT || sim.t - F.icT > 20) { F.icT = sim.t; S.say(`Intercepted · ${S.by(e)}`); } });
  S.on('destroyed', e => e.side === S.side && e.utype === 'pantsir', () => S.say('A Pantsir is gone · a gap in the ring', { tone: 'coral' }));
  S.holdWin(true);
  S.when(() => { const o = S.objective('hold'); return o && o.state === 'done'; }, () => {
    // what is still in the air lands first
    const inbound = () => { for (const p of sim.projectiles.values()) if (p.alive && p.side !== S.side && p.P.threat) return true; return false; };
    S.when(() => !inbound() || !hq.alive, () => { if (hq.alive) { S.say('They turn away'); S.real(4, () => S.win()); } });
  });
}
