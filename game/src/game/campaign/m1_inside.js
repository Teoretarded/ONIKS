/* 01 · Inside (Krasnaya Kosa, night): the battery on the bluff, one destroyer on patrol to the north. Guided with
   the real keys, one thing at a time: camera, select, deploy (T), radar (Y), a contact that firms up, scan (X) with
   the lime lightning, inspect (I, X-ray, exploded view), fire, watch (C), reload from the transloader, fire again.
   Nothing can be lost here: the destroyer has no orders to fire (the stock AI is off) and the transloader parks at
   the depot of the battery, so it refills itself. */
import { put, stow, highGround, landSpot, snap, bearing, offset, dist, radarOn, xz } from './world.js';
import { CLASSIFY, TEL_ELEV } from '../../data/units.js';

const DEG = Math.PI / 180;

export function setup(S) {
  const { sim, map } = S;
  const hq = S.own('hq')[0], tel = S.own('tel')[0], radar = S.own('radar')[0], tlv = S.own('transloader')[0];
  const ddg = S.foe('ddg')[0];
  // where the open sea is from the command post (the nearest deep water)
  let seaB = 0, best = 1e18;
  for (let k = 0; k < 32; k++) {
    const b = k / 32 * Math.PI * 2;
    for (let d = 500; d < 20000; d += 250) {
      const p = offset(hq, b, d);
      if (map.h(p[0], p[1]) < -15) { if (d < best) { best = d; seaB = b; } break; }
    }
  }
  S.flags.seaB = seaB;
  // the battery close together on the bluff: the TEL toward the sea, the transloader beside it, the radar on
  // the highest ground near
  const tp = landSpot(sim, ...offset(hq, seaB + .25, Math.min(600, best * .45)), 250, [xz(hq)], 120);
  put(sim, tel, tp[0], tp[1], seaB);
  const lp = landSpot(sim, ...offset(tel, seaB + Math.PI - .5, 70), 60, [tp, xz(hq)], 30);
  put(sim, tlv, lp[0], lp[1], seaB);
  const rp = highGround(sim, ...offset(hq, seaB - 1.3, 450), 350, 50);
  put(sim, radar, rp[0], rp[1], seaB);
  stow(tel); stow(radar); radarOn(sim, radar, false);
  for (const u of [tel, radar, tlv]) u.def.modelState(u, sim.t);
  // the destroyer on patrol 46 km out, radar off (it lights up after ours does), short of interceptors
  const c = offset(tel, seaB, 46000);
  const a = snap(sim, 'sea', ...offset(c, seaB + Math.PI / 2, 9000)), b = snap(sim, 'sea', ...offset(c, seaB - Math.PI / 2, 9000));
  put(sim, ddg, a[0], a[1], seaB - Math.PI / 2);
  radarOn(sim, ddg, false);
  ddg.ammo.sm6 = 2; ddg.hold = false;
  sim.order([ddg.id], { kind: 'patrol', x: b[0], z: b[1] });
  ddg.spdCap = 7;
  Object.assign(S.flags, { hq, tel, radar, tlv, ddg });
}

export function run(S) {
  const { game, sim } = S;
  const F = S.flags, { tel, radar, tlv, ddg, hq } = F, cam = game.camera;
  const seaB = F.seaB;
  const mid = [(tel.pos[0] * 2 + hq.pos[0] + radar.pos[0]) / 4, 0, (tel.pos[2] * 2 + hq.pos[2] + radar.pos[2]) / 4];
  mid[1] = game.ground(mid[0], mid[2]);
  const spread = Math.max(dist(tel, radar), dist(tel, hq), dist(hq, radar));

  /* ---- intro: low beside the TEL looking out to sea, up and back over the battery ---- */
  S.intro([
    { t: 0, T: tel, lift: 3, dist: 34, yaw: seaB - .55, pitch: 5 * DEG },
    { t: 4.5, T: tel, lift: 3, dist: 95, yaw: seaB - 1.15, pitch: 11 * DEG },
    { t: 9.5, T: mid, dist: Math.max(650, spread * 1.5), yaw: seaB - .4, pitch: 30 * DEG },
  ], { onEnd: () => {
    // the battery, tagged once
    const tags = [[hq, 'CP', 'K380R · command post'], [tel, 'TEL', 'K340P · 2 × 3M55'], [radar, 'RADAR', 'Monolith-B'], [tlv, 'TLV', 'K342P · 2 TLC']];
    tags.forEach(([u, chip, label], i) => S.real(.25 * i, () => S.mark('bat' + i, u, { chip, label, kind: 'lime', until: 6.5 - .25 * i, dx: i % 2 ? -34 : 34 })));
    guide();
  } });
  S.real(.8, () => S.say('K340P · two 3M55 Oniks in their containers'));
  S.real(5, () => S.say('A destroyer is on patrol to the north'));

  const telUp = () => tel.elev >= TEL_ELEV - 1e-3 && tel.dep >= 1;
  const radiating = () => radar.radarOn && radar.mast >= 1;
  const conf = () => { const c = S.contact(ddg); return c ? c.conf : 0; };
  const trkName = () => { const c = S.contact(ddg); return c ? c.track : 'TRK'; };
  const inspectState = () => game.inspect && game.inspect.active ? game.inspect.state : null;
  let camRef = null;
  const camMark = () => { camRef = { T: cam.target.slice(), yaw: cam.yaw, dist: cam.dist }; };
  const telTag = () => ({ target: tel, chip: 'TEL', label: 'K340P · ' + (telUp() ? `${tel.ammo.oniks} rd` : 'stowed'), kind: 'lime' });

  /* ---- the guided part ---- */
  function guide() {
    S.seq([
      { enter: camMark, prompt: 'Pan the camera', key: ['W', 'A', 'S', 'D'], min: 1, timeout: 14, done: () => Math.hypot(cam.target[0] - camRef.T[0], cam.target[2] - camRef.T[2]) > cam.dist * .25 },
      { enter: camMark, prompt: 'Rotate · or right-drag', key: ['Q', 'E'], min: .6, timeout: 14, done: () => Math.abs(cam.yaw - camRef.yaw) > 25 * DEG },
      { enter: camMark, prompt: 'Zoom', key: 'Wheel', min: .6, timeout: 14, done: () => Math.abs(Math.log(cam.dist / camRef.dist)) > .45 },
      { prompt: 'Select the TEL', key: 'Click', skip: () => telUp(), mark: () => telTag(), done: () => game.selection.has(tel.id) },
      { prompt: 'Deploy it', key: 'T', skip: () => telUp() || tel.depT > 0, mark: () => telTag(), done: () => tel.depT > 0 || telUp(),
        then: 'Jacks down 10 s · launcher up 15 s' },
      { prompt: () => tel.dep < 1 ? 'Jacks down' : 'Launcher up', done: telUp, then: 'Erect · two rounds ready', after: 1.5 },
      { prompt: 'Select the radar', key: 'Click', skip: () => radiating() || radar.mastT > 0, mark: () => ({ target: radar, chip: 'RADAR', label: 'Monolith-B · mast down', kind: 'lime' }),
        done: () => game.selection.has(radar.id) },
      { prompt: 'Radar on', key: 'Y', skip: () => radiating() || radar.mastT > 0, mark: () => ({ target: radar, chip: 'RADAR', label: 'Monolith-B', kind: 'lime' }),
        done: () => radar.mastT > 0 || radar.radarOn, then: 'Mast up 15 s · then it radiates' },
      { prompt: 'Mast up', done: radiating, then: 'Radiating · one sweep every 5 s' },
      { done: () => !!S.contact(ddg), prompt: 'Watch the sea to the north', timeout: 60 },
      { enter: () => {
          const c = S.contact(ddg);
          if (c) S.say(`${c.track} · a contact · ${Math.round(dist(radar, c.pos) / 1000)} km`);
          S.say('Each sweep firms it up · it classifies at 0.60');
          const trk = S.contact(ddg);
          if (trk) cam.flyTo([trk.pos[0], 0, trk.pos[2]], { dist: 9000, pitch: 24 * DEG, yaw: seaB });
        },
        prompt: () => game.timeRate >= 8 ? 'Wait for it to classify' : 'Faster', key: () => game.timeRate >= 8 ? null : '+', done: () => S.classified(ddg) },
      { skip: () => false, then: () => ['Classified · DDG · Arleigh Burke'], after: 1.2 },
      { prompt: 'Scan · then click the track', key: 'X', done: () => { const c = S.contact(ddg); return !!(c && c.identified); },
        then: 'Identified · 0.97 · every part tagged', after: 2.2 },
      { prompt: () => ddg.alive ? 'Inspect · click the track, then' : 'Inspect · select the TEL, then', key: 'I', skip: () => !game.getSystem('inspect'),
        done: () => !!inspectState() },
      { prompt: 'X-ray', key: 'X', skip: () => !inspectState(), done: () => { const s = inspectState(); return !s || (s.xr && s.xr.on); }, min: 2.5, after: 3.5 },
      { prompt: 'Exploded view', key: 'E', skip: () => !inspectState(), done: () => { const s = inspectState(); return !s || (s.ex && s.ex.on); }, after: 5 },
      { prompt: 'Back', key: 'I', skip: () => !inspectState(), done: () => !inspectState() },
      { enter: () => {
          S.reveal('sink'); S.reveal('rounds', true);
          // groups: the TEL on 1, the radar on 2, the transloader on 3 (select from anywhere, the camera stays)
          game.groups[1] = [tel.id]; game.groups[2] = [radar.id]; game.groups[3] = [tlv.id];
          for (const n of [1, 2, 3]) game.bus.emit('group', { n, ids: game.groups[n] });
        },
        say: ['The TEL is group 1 · the radar 2 · the transloader 3'], after: .4 },
    ], { onEnd: coach });
  }

  /* ---- objectives in stages; the end waits for the reload to finish and the sinking to be seen ---- */
  S.holdWin(true);
  S.when(() => !ddg.alive && S.obj.counts.reloads > 0 && (!tel.reloader || tel.ammo.oniks >= 2), () => {
    S.say('The battery is ready again');
    S.real(3, () => S.win());
  });
  S.once('detect', e => e.side === S.side && e.unit === ddg.id, () => S.reveal('find'));
  S.once('scan', e => e.phase === 'hit' && e.side === S.side && e.hits && e.hits.includes(ddg.id), () => S.reveal('look'));
  // the destroyer's radar comes on a little after ours
  S.when(radiating, () => S.after(12, () => { radarOn(sim, ddg, true); }));

  /* ---- the salvo, told as it happens ---- */
  let salvoN = 0, firstHit = true;
  S.on('launch', e => e.side === S.side && e.kind === 'oniks', () => {
    salvoN++;
    if (salvoN % 2 === 1) {
      S.say(salvoN === 1 ? 'Cold launch · booster · pitch-over' : 'Two more away');
      if (salvoN === 1) S.after(12, () => S.say('Sea-skimming · 15 m · Mach 2.2'));
    }
  });
  S.on('booster_sep', e => e.side === S.side && e.kind === 'oniks' && salvoN <= 2, () => { if (!S.flags.sepSaid) { S.flags.sepSaid = 1; S.say('Booster away · the ramjet takes over'); } });
  S.on('launch', e => e.side !== S.side && e.kind === 'sm6', () => { if (!S.flags.sm6Said) { S.flags.sm6Said = 1; S.say('SM-6 away from the destroyer', { tone: 'coral' }); } });
  S.on('intercept', e => e.kind === 'oniks', e => S.say(`Intercepted · ${S.by(e)}`, { tone: 'coral' }));
  S.on('hit', e => e.side === S.side && e.target === ddg.id, () => {
    const p = Math.max(0, Math.round(100 * ddg.hp / ddg.hpMax));
    S.say(ddg.alive ? `Hit · ${p} %` : 'Hit');
    if (firstHit && ddg.alive) { firstHit = false; S.after(4, () => { if (ddg.alive) S.say('Still afloat · it takes two'); }); }
  });
  S.on('splash', e => e.side === S.side && e.kind === 'oniks' && e.miss, () => S.say('Missed'));
  S.once('destroyed', e => e.unit === ddg.id, () => { S.say('Sinking'); S.unmark(); });
  S.on('reload_start', e => e.side === S.side && e.unit === tel.id, () => { if (!S.flags.craneSaid) { S.flags.craneSaid = 1; S.say('Crane · one round every 45 s'); } });
  S.on('reload_done', e => e.side === S.side && e.unit === tel.id, e => S.say(`Loaded · ${e.ammo} of 2`));
  S.on('resupply', e => e.side === S.side && e.unit === tlv.id, () => { if (!S.flags.refSaid) { S.flags.refSaid = 1; S.say('The transloader refills at the battery depot'); } });

  /* ---- after the tour: fire, watch, reload, fire again, whatever order the player does it in ---- */
  const inAir = () => { for (const p of sim.projectiles.values()) if (p.alive && p.side === S.side && p.kind === 'oniks') return true; return false; };
  function coach() {
    S.flags.coaching = true;
    S.every(.25, () => {
      if (game.result) { S.prompt(null); S.unmark(); return false; }
      let pr = null, key = null;
      const marks = [];
      const reloading = !!tel.reloader || (tlv.orders[0] && tlv.orders[0].kind === 'reload'), reloaded = S.obj.counts.reloads > 0;
      const telSel = game.selection.has(tel.id);
      if (inAir()) {
        if (!game.cinematic && !S.flags.cineDone) { pr = 'Cinematic camera'; key = 'C'; }
      } else if (ddg.alive || !reloaded) {
        if (reloading) { pr = null; }
        else if (tel.ammo.oniks > 0 && ddg.alive && S.tracked(ddg)) {
          if (!telSel) { pr = 'Select the TEL'; key = '1'; }
          else if (!telUp() && tel.depT === 0) { pr = 'Deploy'; key = 'T'; marks.push(telTag()); }
          else if (telUp()) { pr = 'Fire · on the track'; key = 'Right-click'; }
        } else if (tel.ammo.oniks < 2 && !reloaded || tel.ammo.oniks === 0) {
          if (!telSel) { pr = 'Select the TEL'; key = '1'; }
          else { pr = 'Reload · the transloader comes to it'; key = 'R'; marks.push(telTag(), { target: tlv, chip: 'TLV', label: `K342P · ${tlv.cargo} TLC`, kind: 'lime', dx: -34 }); }
          if (tlv.cargo === 0) { pr = 'The transloader is refilling at the depot'; key = null; }
        }
        if (salvoN > 0 && !S.flags.reloadRevealed && !inAir()) { S.flags.reloadRevealed = true; S.reveal('reload'); }
      }
      S.prompt(pr, { key });
      const ids = [];
      marks.forEach((mk, i) => { const id = 'c' + i; ids.push(id); S.mark(id, mk.target, mk); });
      for (let i = marks.length; i < 3; i++) S.unmark('c' + i);
    });
  }
  S.bus('cinematic', d => { if (d.on) S.flags.cineDone = true; });
}
