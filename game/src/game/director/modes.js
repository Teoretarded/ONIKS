/* The cinematic camera's modes (game/director.js runs one at a time, or a Mix of them; the Settings screen's Camera
   tab, Shift C for the next). Each is a policy over the director's shared world, shots and moves:
     pick(now)      five times a second: keep the shot on screen, or begin another
     ended(sh)      its subject is gone: what that means for this mode (true: handled; else the director's default:
                    the pieces, the hit, the place)
     take(c)        begin the best shot of this mode for candidate c (the player's watched rounds start here)
     quiet()        nothing to watch: one shot of this mode's own quiet (true when it began one)
     slow(kind)     how much of the Slow motion setting it wants for a moment (1 as set, 0 none, > 1 stronger)
     hold           the real seconds the slow rate holds at the moment

   The five:
     Director   the scored candidates (launch, intercept, gun, impact, chase, site), each framed in turn from a few
                angles: riding with the threat, from the interceptor, still beside the meet point, the two of them in
                one frame, over a gun mount's shoulder, across the target. The consequence is held.
     Chase      one round from the rail to its end: the launch, behind it, beside it as it is engaged, on with its
                pieces; then the next (a fresh launch first). Quiet: flybys of aircraft, dollies of ships under way.
     Tripod     fixed cameras near the action (on the sea, on a hill, on a defender's deck), panning and zooming after
                the rounds with a long lens; the camera stays put while the action is in reach and lingers on a kill.
     Showcase   rollbys: a dolly along a ship, a crane over a launcher, an orbit of a radar, a flyby of a round or an
                aircraft; the subjects in turn. Only a hit on what it is showing breaks the rhythm.
     Overview   one high, wide frame of the whole engagement: every round, its target and the defence, the centre and
                the distance easing as they change; a slow wide of both forces when it is quiet.
   The two that combine them:
     Storyteller  Director, Showcase and Overview in beats: a launch, then the wide of the salvo and its target, a
                  flyby of the lead round, the approach (behind it, then a tripod by the target), the moment framed by
                  the Director, the aftermath as a dolly past the ship; rollbys and wides between salvos.
     Duel         Chase and Tripod: rides a round in until a defender takes it on, then over that defender's shoulder
                  (the gun, the launcher) with a long lens on the round as the burst or the interceptor goes out, held
                  through the kill in stronger slow motion; between duels, tripods on the defenders. */
import { predict, newPrediction } from './predict.js';
import { clamp, wrapPi } from './rig.js';

const EV = { intercept: 1, gun: 1, impact: 1 };

export function createModes(D) {
  const { game, sim, S } = D;
  const FAR = D.FAR;
  const PX = newPrediction();
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const now = () => game.realT;
  /* a round's next moment (game s), for framings with no moment of their own */
  const evOf = id => () => { const p = D.projAt(id); if (!p) return FAR; const r = predict(game, p, PX); return Math.min(r.tEv, r.tImpact); };
  /* the unit a round's defence comes from (a gun; an interceptor's launcher) */
  function defenderOf(c) {
    if (c.type === 'gun') return sim.units.get(c.unit) || null;
    if (c.type === 'intercept') { const q = D.projAt(c.q); return q ? sim.units.get(q.from) || null : null; }
    return null;
  }
  const quietKind = sh => !sh || sh.kind === 'chase' || sh.kind === 'idle' || sh.kind === 'site' || sh.kind === 'dolly' || sh.kind === 'crane' || sh.kind === 'wide' || sh.kind === 'flyby' || (sh.kind === 'tripod' && !sh.hotT);

  /* ================================================================ Director */
  let nVar = 0, nGun = 0;
  const director = {
    id: 'director', hold: 1.8,
    take(c) {
      if (c.type === 'site') {
        const e = D.recent[c.unit]; if (!e) return false;
        e.seen = true;
        const u = e.unit ? sim.units.get(e.unit) : null;
        if (e.kind === 'destroyed' && u) return D.startDeath({ unit: u.id, pos: e.pos.slice(), L: u.def.size[0], sea: u.def.domain === 'sea' }, false);
        return D.startSite(e.pos, u, e.kind === 'intercept' ? 6 : 9);
      }
      if (c.type === 'launch') return D.startLaunch(c);
      if (c.type === 'chase') return D.startChase(c.id);
      if (c.type === 'intercept') {
        // the angle, in turn: riding with the threat, still by the meet point, the two in one frame, from the interceptor
        const V = D.forceVar || ['threat', 'witness', 'two', 'interceptor'][nVar++ % 4];
        if (V === 'two') {
          // the two in one frame only once they are close (far apart they are two specks): riding with the threat first
          const q = D.projAt(c.q); if (!q || c.t > 3.2) { const ok = D.startIntercept(c, 'threat'); if (ok && q && D.shot) D.shot.then = 'two'; return ok; }
          const p = D.projAt(c.id), P = game.projPose(p).pos;
          return D.startTwo(D.projPt(c.id), D.projPt(c.q), { key: c.key, id: c.id, q: c.q, side: D.sideOf(P, p.vel || [0, 0, 1]), evFn: evOf(c.id), evKind: 'intercept', dMin: 70 });
        }
        return D.startIntercept(c, V);
      }
      if (c.type === 'gun') {
        // over the mount's shoulder two times in three, else the round and the gun in one frame
        if (D.forceGun ? D.forceGun === 'mount' : nGun++ % 3 !== 2) return D.startGun(c.id, c.unit, c.key);
        const p = D.projAt(c.id), u = sim.units.get(c.unit); if (!p || !u) return false;
        return D.startTwo(D.projPt(c.id), D.unitPt(c.unit), { key: c.key, id: c.id, unit: c.unit, side: D.sideOf(game.projPose(p).pos, p.vel || [0, 0, 1]), evFn: evOf(c.id), evKind: 'gun', dMin: Math.max(60, u.def.size[0] * 1.2) });
      }
      if (c.type === 'impact') return D.startImpact(c.id, c.unit);
      return false;
    },
    pick(t) {
      const sh = D.shot;
      if (sh && t < sh.lock) return;
      let cur = null, best = null;
      for (const c of D.cands) { if (sh && c.key === sh.key) cur = c; else if (!best || c.s > best.s) best = c; }
      if (!sh) { if (!best || !director.take(best)) D.quiet(); return; }
      const base = D.baseRate();
      // an intercept saved for the meet point: the move there, with the time for it
      if (cur && sh.kind === 'intercept' && sh.then && sh.ev < FAR && sh.ev / base < (sh.then === 'two' ? 3 : 5)) {
        if (sh.then === 'two') { D.forceVar = 'two'; director.take(cur); D.forceVar = null; } else D.startIntercept(cur, 'witness');
        return;
      }
      // the shot's own moment: stay through it
      if (cur && sh.hot !== false && sh.ev < FAR && sh.ev / base < 3.5 && (EV[sh.kind] || sh.kind === 'twoshot')) return;
      const age = t - sh.t0;
      if (cur && (cur.type === 'gun' || cur.type === 'intercept') && age > 9 * D.paceK() && !(best && best.s > cur.s + 20)) { director.take(cur); return; }
      let keep;
      if (cur) keep = cur.s + 12;
      else if (sh.kind === 'launch' && !sh.done && D.projAt(sh.id)) keep = 60;
      else if ((sh.kind === 'after' || sh.kind === 'site' || sh.kind === 'death' || sh.kind === 'break') && t < sh.until) keep = 24;
      else if ((sh.kind === 'idle' || sh.kind === 'wide') && t < sh.until) keep = 6;
      else if ((sh.kind === 'dolly' || sh.kind === 'crane' || sh.kind === 'flyby') && !sh.done) keep = 6;
      else keep = -FAR;
      const quiet = quietKind(sh);
      const soon = best && best.urgent && (age > 1.2 || (best.type === 'launch' && quiet && age > .4));
      if (best && best.s > keep + 8 && (keep === -FAR || age > 3 * D.paceK() || soon)) { if (director.take(best)) return; }
      if (keep === -FAR) { if (!best || !director.take(best)) D.quiet(); }
    },
    slow: () => 1,
  };

  /* ================================================================ Chase */
  let chaseId = 0;
  const chase = {
    id: 'chase', hold: 2,
    enter() { chaseId = 0; },
    take(c) {
      chaseId = c.id;
      if (c.type === 'launch') return D.startLaunch(c);
      if (c.type === 'intercept' || c.type === 'gun') return D.startIntercept(Object.assign({}, c, { q: c.type === 'intercept' ? c.q : 0 }), 'threat');
      return D.startChase(c.id);
    },
    pick(t) {
      const sh = D.shot;
      if (sh && t < sh.lock) return;
      const p = chaseId ? D.projAt(chaseId) : null;
      if (p && sh && sh.id === chaseId) {
        // the launch gone small: behind it
        if (sh.kind === 'launch') { if (sh.done) D.startChase(chaseId, { lock: t + 2 }); return; }
        // engaged: out to its side, the interceptor or the burst coming at the lens past it
        const eng = D.best(c => c.id === chaseId && (c.type === 'intercept' || c.type === 'gun') && c.t < 5);
        if (eng && sh.kind === 'chase') { D.startIntercept(Object.assign({}, eng, { q: eng.type === 'intercept' ? eng.q : 0 }), 'threat'); return; }
        // a long cruise: a fresh heavy launch elsewhere takes over now and then
        const la = D.best(c => c.type === 'launch' && c.h >= 7 && c.s > 55);
        if (la && sh.kind === 'chase' && t - sh.t0 > 30 * D.paceK()) chase.take(la);
        return;
      }
      if (sh && (sh.kind === 'break' || sh.kind === 'after' || sh.kind === 'death') && t < sh.until) {
        // a fresh launch cuts the aftermath short once it has been seen
        const la = D.best(c => c.type === 'launch' && c.s > 50);
        if (!(la && t - sh.t0 > 3.5)) return;
      }
      if (sh && (sh.kind === 'flyby' || sh.kind === 'dolly') && !sh.done) {
        const la = D.best(c => c.type === 'launch' || c.type === 'chase' && c.s > 26);
        if (!la) return;
      }
      // the next round: a fresh launch first, else the one most worth riding (its weight, how soon its moment is)
      const la = D.best(c => c.type === 'launch');
      if (la && chase.take(la)) return;
      let b = null, bs = -1e9;
      for (const c of D.cands) {
        if (c.type !== 'chase') continue;
        const ev = D.best(x => x.id === c.id && x.t < FAR);
        const s = c.s + c.h * 2 + (ev ? 20 * Math.exp(-ev.t / 12) : 0);
        if (s > bs) { bs = s; b = c; }
      }
      if (b && chase.take(b)) return;
      if (!sh || sh.done || (sh.until && t > sh.until) || sh.ended) D.quiet();
    },
    quiet() {
      const air = sim.list().filter(u => u.alive && !u.aboard && u.def.domain === 'air' && (u.speed || 0) > 30 && D.seen(u));
      if (air.length) { const u = air[Math.floor(now() / 9) % air.length]; return D.startFlyby({ unit: u.id, ahead: 3, off: u.def.size[0] * 3 + 20, side: u.id % 2 ? 1 : -1 }); }
      return false;
    },
    slow: () => 1,
  };

  /* ================================================================ Tripod */
  const tripod = {
    id: 'tripod', hold: 2.2,
    take(c) { return tripodFor(c, true); },
    pick(t) {
      const sh = D.shot;
      if (sh && t < sh.lock) return;
      let b = null;
      for (const c of D.cands) { if (c.type === 'site') continue; const s = c.s + (EV[c.type] ? 10 : 0); if (!b || s > b.s2) { b = c; b.s2 = s; } }
      if (sh && sh.kind === 'tripod') {
        const subjAlive = sh.subjId ? !!D.projAt(sh.subjId) : true;
        // the camera stays put while the action is within reach: a new subject in reach is a pan, not a move
        if (b && subjAlive && b.id === sh.subjId) return;
        if (b && (!subjAlive || b.s2 > (sh.score || 0) + 12 || t > sh.until)) {
          const P = game.projPose(D.projAt(b.id)).pos;
          if (dist3(P, sh.P) < 7000 && b.type !== 'launch') { tripodAt(sh.P, b, sh); return; }
          tripodFor(b); return;
        }
        if (!b && t > sh.until) D.quiet();
        return;
      }
      if (sh && sh.kind === 'break' && t < sh.until) return;
      if (b) { tripodFor(b); return; }
      if (!sh || sh.ended || (sh.until && t > sh.until) || sh.done) D.quiet();
    },
    ended(sh) {
      // a tripod whose subject is gone: the lens rested on the place already; on to the next (the camera stays if it can)
      if (sh.kind === 'tripod') { D.shot = null; return true; }
      return false;
    },
    quiet() {
      // a long lens on the most important unit from a tripod some way off, a new one now and then
      const lu = D.leadUnit(Math.floor(now() / 18) % 2 === 1); if (!lu) return false;
      const u = lu.u, c = S.centreOf(u, [0, 0, 0]), L = Math.max(u.def.size[0], 10), sea = u.def.domain === 'sea';
      const P = D.tripodSpot(c, Math.atan2(c[0] - D.rig.E[0], c[2] - D.rig.E[2]) + 1.4, u.id % 2 ? 1 : -1, sea ? clamp(L * 6, 500, 1400) : clamp(L * 18, 200, 700), sea ? 3.5 : 2);
      if (!P) return false;
      return D.startTripod(P, D.unitPt(u.id), L, { key: 'tripodq:' + u.id, frac: .42, dur: 16 * D.paceK(), lock: 4, linger: 1, move: { cut: true } });
    },
    slow: () => 1,
  };
  /* a tripod for candidate c: placed for what is about to happen */
  function tripodFor(c, force, o) {
    o = o || {};
    const p = D.projAt(c.id); if (!p) return false;
    const P = game.projPose(p).pos, v = p.vel || [0, 0, 1], appr = Math.atan2(v[0], v[2]), side = D.sideOf(P, v);
    let T = P, r = 900, h = 3.5, ride = 0, rideOff = null;
    if (c.type === 'impact') {
      const u = sim.units.get(c.unit); if (u) { T = S.centreOf(u, [0, 0, 0]); r = clamp(u.def.size[0] * 7, 420, 1600); }
    } else if (c.type === 'gun' || c.type === 'intercept') {
      const r0 = predict(game, p, PX);
      T = r0.tEv < FAR ? r0.meet.slice() : P;
      const u = defenderOf(c);
      // a defending ship: the camera on her own deck, aft and to the side the round comes from
      if (u && u.def.domain === 'sea' && u.alive && (o.ride || (c.id + c.unit) % 2 === 0)) {
        const pose = game.unitPose(u), rx = Math.cos(pose.hdg), rz = -Math.sin(pose.hdg);
        const sd = (T[0] - pose.pos[0]) * rx + (T[2] - pose.pos[2]) * rz >= 0 ? 1 : -1;
        ride = u.id; rideOff = [sd * u.def.size[1] * .42, Math.min(u.def.size[2] * .45, 14), -u.def.size[0] * .32];
      } else if (u && o.ride && u.alive) {
        // a land defender: beside it, low, looking out the way the round comes
        T = S.centreOf(u, [0, 0, 0]); r = clamp(u.def.size[0] * 3, 25, 60); h = 2.2;
      } else r = clamp(dist3(P, T) * .25, 600, 1800);
    } else if (c.type === 'launch') {
      T = p.fromPos || P; const lu = sim.units.get(p.from); r = clamp((lu ? lu.def.size[0] : 12) * 20, 260, 900); h = 2;
    } else {
      // a round in cruise: ahead along its path, beside it
      const s = Math.hypot(v[0], v[1], v[2]) || 1, ahead = clamp(s * 9, 1500, 7000);
      T = [P[0] + v[0] / s * ahead, P[1] + v[1] / s * ahead, P[2] + v[2] / s * ahead]; r = 700;
    }
    let E;
    if (ride) { E = [0, 0, 0]; S.mountAt(sim.units.get(ride), rideOff, E); }
    else E = D.tripodSpot(T, appr, side, r, h);
    if (!E) return false;
    return D.startTripod(E, D.projPt(c.id), Math.max(S.lenOf(p), 4) * 1.6, { key: 'tripod:' + c.id, id: c.id, subjId: c.id, score: c.s2 || c.s, ride, rideOff,
      frac: .1, kMin: .035, evFn: evOf(c.id), evKind: c.type === 'gun' ? 'gun' : c.type === 'impact' ? 'impact' : 'intercept', hotT: EV[c.type] ? 1 : 0,
      dur: 40, linger: 3.5, lock: 3, move: { cut: true } });
  }
  /* the same tripod, the lens on another subject (a pan) */
  function tripodAt(P, c, sh) {
    return D.startTripod(P, D.projPt(c.id), Math.max(S.lenOf(D.projAt(c.id)), 4) * 1.6, { key: 'tripod:' + c.id, id: c.id, subjId: c.id, score: c.s2 || c.s, ride: sh.ride, rideOff: sh.rideOff,
      frac: .1, kMin: .035, evFn: evOf(c.id), evKind: c.type === 'gun' ? 'gun' : c.type === 'impact' ? 'impact' : 'intercept', hotT: EV[c.type] ? 1 : 0,
      dur: 40, linger: 3.5, lock: 2.5, move: { noCut: true, dur: 1.6, lead: 1 } });
  }

  /* ================================================================ Showcase */
  let rot = 0;
  const flown = new Set();
  const showcase = {
    id: 'showcase', hold: 1.6,
    take(c) {
      if (c.type === 'impact') return D.startImpact(c.id, c.unit);
      return D.startFlyby({ id: c.id, ahead: 2.6, side: c.id % 2 ? 1 : -1 }) || D.startChase(c.id);
    },
    pick(t) {
      const sh = D.shot;
      if (sh && t < sh.lock) return;
      // a hit about to land on what is shown (or on any own ship): the across shot, then its aftermath
      const imp = D.best(c => c.type === 'impact' && c.t < 3.5 && (sh && (sh.unit === c.unit || sh.tgt === c.unit) || (sim.units.get(c.unit) || {}).side === game.side));
      if (imp && !(sh && sh.kind === 'impact')) { D.startImpact(imp.id, imp.unit); return; }
      if (sh && (sh.kind === 'impact' || sh.kind === 'after' || sh.kind === 'death') && t < (sh.until || 0)) return;
      // a heavy round fresh in the air: a flyby, once each
      // (in cruise: a flyby just off the rail would be through its own launch smoke)
      const fr = D.best(c => c.type === 'chase' && c.h >= 7 && !flown.has(c.id) && (D.projAt(c.id).age || 0) > 14);
      if (fr && (!sh || sh.done || t - sh.t0 > 5)) { flown.add(fr.id); if (flown.size > 64) flown.clear(); if (D.startFlyby({ id: fr.id, ahead: 2.8, side: fr.id % 2 ? 1 : -1 })) return; }
      if (sh && !sh.done && !sh.ended && t < (sh.until || 1e9)) return;
      showcase.quiet();
    },
    /* the next rollby, in turn: ships (dolly, every third a crane), launchers and radars (crane or orbit), aircraft
       (flyby) */
    quiet() {
      const L = sim.list().filter(u => u.alive && !u.aboard && D.seen(u) && u.def.size[0] > 5)
        .sort((a, b) => (D.RANK[b.type] || 1) - (D.RANK[a.type] || 1) || a.id - b.id);
      if (!L.length) return false;
      const n = rot++, u = L[n % Math.min(L.length, 8)];
      if (u.def.domain === 'air') return (u.speed || 0) > 20 ? D.startFlyby({ unit: u.id, ahead: 3, off: u.def.size[0] * 3 + 25, side: n % 2 ? 1 : -1, cut: true }) : D.startCrane(u);
      if (u.def.domain === 'sea') return n % 3 === 2 ? D.startCrane(u, { dur: 12 }) : D.startDolly(u, { dir: n % 2 ? 1 : -1, dur: 13 });
      return n % 2 ? D.startCrane(u, { dur: 10 }) : D.startDolly(u, { dur: 10, dir: n % 4 < 2 ? 1 : -1 });
    },
    slow: k => k === 'impact' || k === 'flyby' ? 1 : 0,
  };

  /* ================================================================ Overview */
  const KPx = [];
  function engagementPts(out) {
    // the most pressing moment's place, and everything within 30 km of it: rounds, their targets, the defence
    let seed = null, st = FAR;
    for (const c of D.cands) if (c.t < st && c.type !== 'site') { st = c.t; seed = c; }
    if (!seed) seed = D.best(c => c.type === 'chase');
    if (!seed) return 0;
    const sp = D.projAt(seed.id); if (!sp) return 0;
    const C = game.projPose(sp).pos;
    let n = 0;
    const push = P => { if (n < out.length && Math.hypot(P[0] - C[0], P[2] - C[2]) < 30000) { const o = out[n++]; o[0] = P[0]; o[1] = P[1]; o[2] = P[2]; } };
    for (const c of D.cands) {
      if (c.type !== 'chase' && c.type !== 'gun' && c.type !== 'impact' && c.type !== 'intercept') continue;
      const p = D.projAt(c.id); if (!p) continue;
      if (c.type === 'chase') push(game.projPose(p).pos);
      if (c.type === 'impact' || c.type === 'gun') { const u = sim.units.get(c.unit); if (u && u.alive) push(u.pos); }
      if (c.type === 'intercept') { const q = D.projAt(c.q); if (q) push(game.projPose(q).pos); }
    }
    return n;
  }
  function forcePts(out) {
    const lu = D.leadUnit(false); if (!lu) return 0;
    const C = lu.u.pos;
    let n = 0;
    for (const u of sim.list()) {
      if (!u.alive || u.aboard || !D.seen(u) || n >= out.length) continue;
      if (Math.hypot(u.pos[0] - C[0], u.pos[2] - C[2]) > 25000) continue;
      const o = out[n++]; o[0] = u.pos[0]; o[1] = u.pos[1] + 10; o[2] = u.pos[2];
    }
    return n;
  }
  const overview = {
    id: 'overview', hold: 1.4,
    take(c) { return overview.pick(now()) || true; },
    pick(t) {
      const sh = D.shot;
      const busy = D.cands.some(c => c.type !== 'site');
      if (sh && sh.kind === 'wide' && sh.busy === busy && t < sh.until) return;
      if (sh && sh.kind === 'wide' && t < sh.lock) return;
      if (busy) D.startWide(engagementPts, { key: 'wide:e', busy: true, pitch: 33, dMin: 700, dMax: 45000, move: {} });
      else overview.quiet();
    },
    quiet() { return D.startWide(forcePts, { key: 'wide:f', busy: false, pitch: 24, dMin: 1500, dMax: 40000, until: now() + 30 * D.paceK(), move: {} }); },
    ended(sh) { return false; },
    slow: () => .5,
  };
  void KPx;

  /* ================================================================ Storyteller (Director + Showcase + Overview) */
  const story = {
    id: 'story', hold: 2,
    beat: null,      // { name, id (the lead round), t0, n }
    enter() { story.beat = null; },
    take(c) { return director.take(c); },
    pick(t) {
      const sh = D.shot, B = story.beat;
      if (sh && t < sh.lock) return;
      // the climax: the Director's framing of the moment, whatever the beat; one at a time (a raid has a moment every
      // second: the shot stays with its round through its own)
      const onIt = sh && sh.id && D.projAt(sh.id) && (EV[sh.evKind || sh.kind] || sh.kind === 'intercept' || sh.kind === 'twoshot') && sh.ev < FAR && sh.ev / D.baseRate() < 6;
      if (onIt) return;
      const cl = D.best(c => EV[c.type] && c.t < 4.2);
      if (cl && !(sh && (sh.key === cl.key || (sh.id === cl.id && EV[sh.evKind || sh.kind])))) { story.beat = { name: 'climax', id: cl.id, t0: t }; director.take(cl); return; }
      if (sh && EV[sh.evKind || sh.kind] && sh.ev < FAR && sh.ev / D.baseRate() < 4) return;
      // a fresh salvo: its launch
      const la = D.best(c => c.type === 'launch' && c.s > 50);
      if (la && !(B && B.name === 'launch' && B.id === la.id) && (!B || B.name === 'quiet' || t - B.t0 > 6)) {
        story.beat = { name: 'launch', id: la.id, t0: t }; D.startLaunch(la); return;
      }
      const lead = B && B.id ? D.projAt(B.id) : null;
      if (B && lead) {
        const age = t - B.t0;
        if (B.name === 'launch' && (sh && sh.kind === 'launch' ? sh.done : age > 4)) {
          // the wide: the salvo and where it is going
          const tgt = lead.tk === 'unit' ? lead.target : 0;
          story.beat = { name: 'wide', id: B.id, t0: t };
          D.startWide(out => { let n = 0; const p = D.projAt(B.id); if (p) { const P = game.projPose(p).pos; out[n][0] = P[0]; out[n][1] = P[1]; out[n][2] = P[2]; n++; }
            const u = tgt && sim.units.get(tgt); if (u && u.alive) { out[n][0] = u.pos[0]; out[n][1] = u.pos[1] + 10; out[n][2] = u.pos[2]; n++; }
            for (const c of D.cands) if (c.type === 'chase' && c.id !== B.id && n < 12) { const q = D.projAt(c.id); if (q && q.from === lead.from) { const Q = game.projPose(q).pos; out[n][0] = Q[0]; out[n][1] = Q[1]; out[n][2] = Q[2]; n++; } }
            return n; }, { key: 'wide:s', pitch: 28, dMin: 900, dMax: 70000, move: { cut: true } });
          return;
        }
        if (B.name === 'wide' && age > 6 * D.paceK()) { story.beat = { name: 'flyby', id: B.id, t0: t }; if (D.startFlyby({ id: B.id, ahead: 2.8, side: B.id % 2 ? 1 : -1, cut: true })) return; }
        if (B.name === 'flyby' && (sh && sh.kind === 'flyby' ? sh.done : age > 6)) { story.beat = { name: 'approach', id: B.id, t0: t, n: 0 }; D.startChase(B.id); return; }
        if (B.name === 'approach' && age > 8 * D.paceK()) {
          // the approach in turn: behind it, then a tripod by where it is going
          B.n = (B.n || 0) + 1; B.t0 = t;
          if (B.n % 2) { const c = D.best(x => x.id === B.id && x.type === 'chase'); if (c && tripodFor(Object.assign({}, c, { type: lead.tk === 'unit' ? 'impact' : 'chase', unit: lead.target }))) return; }
          D.startChase(B.id); return;
        }
        if (sh && !sh.ended && !(sh.until && t > sh.until)) return;
      }
      // after the moment: the aftermath (a dolly past the hit ship), then the wide of the forces
      if (sh && (sh.kind === 'break' || sh.kind === 'after' || sh.kind === 'death' || sh.kind === 'site') && t < sh.until) return;
      if (B && B.name === 'aftermath' && sh && !sh.done && !sh.ended) return;
      if (B && B.name === 'climax' && B.unit) {
        const u = sim.units.get(B.unit);
        story.beat = { name: 'aftermath', t0: t };
        if (u && u.alive) { D.startDolly(u, { dur: 11 }); return; }
      }
      // more in the air: ride the most pressing
      const nx = D.best(c => c.type === 'chase');
      if (nx && (!sh || sh.ended || sh.done || quietKind(sh) && t - sh.t0 > 9)) { story.beat = { name: 'approach', id: nx.id, t0: t, n: 0 }; D.startChase(nx.id); return; }
      if (!sh || sh.ended || sh.done || (sh.until && t > sh.until)) story.quiet();
    },
    ended(sh) {
      if (sh.kind === 'after' && sh.tgt) { const B = story.beat; if (B) B.unit = sh.tgt; }
      if (sh.kind === 'impact') { const B = story.beat || (story.beat = { name: 'climax', t0: now() }); B.unit = sh.tgt; }
      return false;
    },
    quiet() {
      const B = story.beat;
      const n = B && B.name === 'quiet' ? (B.n || 0) + 1 : 0;
      story.beat = { name: 'quiet', t0: now(), n };
      return n % 3 === 2 ? overview.quiet() : showcase.quiet();
    },
    slow: () => 1,
  };

  /* ================================================================ Duel (Chase + Tripod) */
  const duel = {
    id: 'duel', hold: 2.6,
    cur: null,       // { id (the threat), def (the defender unit), phase }
    enter() { duel.cur = null; },
    take(c) {
      const u = defenderOf(c);
      if (u) return D.startGun(c.id, u.id, 'duel:' + c.id);
      return D.startChase(c.id);
    },
    pick(t) {
      const sh = D.shot;
      if (sh && t < sh.lock) return;
      // the duel on screen: over the defender's shoulder until its moment is past
      // (while its moment is close: a long engagement far out does not hold the camera for a minute)
      if (sh && (sh.kind === 'gun' || (sh.kind === 'tripod' && sh.hotT)) && D.projAt(sh.id) && sh.ev < FAR && sh.ev / D.baseRate() < 8) return;
      if (sh && sh.kind === 'tripod' && sh.hotT && t - sh.t0 < 6) return;
      if (sh && sh.kind === 'break' && t < sh.until) return;
      // a defender about to take a round on: over its shoulder (in time: the rate is already easing down)
      let eng = null;
      for (const c of D.cands) if ((c.type === 'gun' || c.type === 'intercept') && c.t < 4.5 && defenderOf(c) && (!eng || c.s > eng.s)) eng = c;
      if (eng) {
        const u = defenderOf(eng), p = D.projAt(eng.id);
        duel.cur = { id: eng.id, def: u.id };
        // a gun with the round close: over the mount's shoulder; an interceptor going out a long way: a long lens from
        // the defender's own deck (or beside it), after the round, the interceptor coming into the frame
        const near = p && Math.hypot(p.pos[0] - u.pos[0], p.pos[2] - u.pos[2]) < 3500;
        if (eng.type === 'gun' && near) {
          D.startGun(eng.id, u.id, 'duel:' + eng.id);
          if (D.shot && D.shot.kind === 'gun') { D.shot.evKind = eng.type; D.shot.lock = t + 3; }
        } else if (!(sh && sh.kind === 'tripod' && sh.subjId === eng.id && t - sh.t0 < 25)) {
          tripodFor(eng, true, { ride: true });
          if (D.shot && D.shot.kind === 'tripod') D.shot.lock = t + 3;
        }
        return;
      }
      // a round coming in (taken on soon, or about to hit): ride it in
      const inc = D.best(c => (c.type === 'gun' || c.type === 'intercept' || c.type === 'impact') && c.t < 12);
      if (inc) {
        if (sh && sh.id === inc.id && (sh.kind === 'chase' || sh.kind === 'intercept' || sh.kind === 'impact')) return;
        if (inc.type === 'impact' && inc.t < 3.5) { D.startImpact(inc.id, inc.unit); return; }
        D.startChase(inc.id); return;
      }
      const lead = D.best(c => c.type === 'chase' && c.h >= 6);
      if (lead && !(sh && sh.id === lead.id)) { if (!sh || quietKind(sh) && t - sh.t0 > 8) { D.startChase(lead.id); return; } }
      if (!sh || sh.ended || sh.done || (sh.until && t > sh.until)) duel.quiet();
    },
    ended(sh) {
      if (sh.kind === 'tripod') return false;      // the director's default: held where the tripod stands, the lens on the pieces
      if (sh.kind === 'gun') {
        // the kill, held over the defender's shoulder: the pieces in the long lens, longer than the Director holds it
        const g = D.gone.get(sh.id);
        if (g && g.why !== 'hit') { D.startBreak(g.pos || D.lastP, D.lastV, S.lenOf({ kind: sh.pk || '' }) || 6, true, { lock: 4.5, until: 8.5 }); return true; }
      }
      return false;
    },
    /* between duels: a tripod on a defender, the long lens on it as it waits (a radar turning, a mount trained out) */
    quiet() {
      const own = sim.alive(game.side).filter(u => !u.aboard && (u.def.weapons && Object.values(u.def.weapons).some(w => w.vs && w.vs.includes('missile'))));
      const L = own.length ? own : sim.alive(game.side).filter(u => !u.aboard);
      if (!L.length) return false;
      const u = L[Math.floor(now() / 15) % L.length], c = S.centreOf(u, [0, 0, 0]), sz = Math.max(u.def.size[0], 8), sea = u.def.domain === 'sea';
      const P = D.tripodSpot(c, Math.atan2(c[0] - D.rig.E[0], c[2] - D.rig.E[2]) + 1.2, u.id % 2 ? 1 : -1, sea ? clamp(sz * 5, 400, 1200) : clamp(sz * 14, 150, 500), sea ? 3 : 1.8);
      if (!P) return false;
      return D.startTripod(P, D.unitPt(u.id), sz, { key: 'tripodq:' + u.id, frac: .38, dur: 15 * D.paceK(), lock: 4, linger: 1, move: { cut: true } });
    },
    slow: () => 1.5,
  };

  return { director, chase, tripod, showcase, overview, story, duel };
}
