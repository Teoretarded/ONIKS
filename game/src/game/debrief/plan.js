/* Debrief: the moments of a match, picked from its record (record.js timeline), in the order the film shows them.

   makePlan(rec, side) -> { beats, salvos, decisive, rounds, counts, tEnd }
   beats (the film's order; every tick is the recorded one):
     { k: 'launch', fig, launch, salvo }       the first salvo (the player's; else the first of the match): side-on at the rail
     { k: 'chase', fig, launch, out }          behind one of its rounds: the one that hits (an X-ray hull first), else the one
                                               shot down, else any
     { k: 'hit', fig, launch, hit, xray, kill } the impact (xray: the hit replay's rule - a 3M55, Tomahawk or SLAM-ER on a
                                               ship or a major unit the player could see)
     { k: 'wreck', fig, unit, type, sea, tick } the hull going down / the wreck burning
     { k: 'skip', from, to }                   the Orbital device: up into the map, the sim runs ahead, down again
     { k: 'approach', fig, launch, hit }        onto the decisive round in flight, to its impact
     { k: 'orbital', fig }                     the whole match: every round's track
   The decisive hit: the final blow of the match if a heavy round dealt it, else the best heavy hit (an X-ray kill of
   the biggest hull, the player's own first). A salvo: one side's heavy launches with no gap over 30 s. */
import { PROJ, UNITS } from '../../data/units.js';
import { DT } from '../../sim/consts.js';

const XRAY = { oniks: 1, tlam: 1, slam: 1, uran: 1, kalibr: 1 };
const W8 = { carrier: 30, hq: 30, cg: 24, ddg: 22, ssn: 18, ssk: 18, lcs: 14, tel: 12, radar: 10, s400r: 10, s400: 9, pantsir: 8, bereg: 7, transloader: 6, bal: 10, catapult: 3 };
const heavy = k => !!(PROJ[k] && PROJ[k].threat);
export const major = t => { const d = UNITS[t]; return !!d && (d.domain === 'sea' || !!d.hq || t === 'tel' || t === 'radar' || t === 'pantsir' || t === 'transloader' || t === 's400' || t === 's400r' || t === 'bereg'); };
const sec = s => Math.round(s / DT);

export function makePlan(rec, side) {
  const E = rec.events || [];
  const launches = E.filter(e => e.k === 'launch' && heavy(e.kind));
  const byId = new Map(launches.map(l => [l.id, l]));
  const outcome = new Map();
  for (const e of E) if ((e.k === 'hit' || e.k === 'intercept' || e.k === 'splash') && !outcome.has(e.id)) outcome.set(e.id, e);
  const dests = E.filter(e => e.k === 'dest');
  const result = E.find(e => e.k === 'result') || null;
  const killOf = h => dests.find(d => d.unit === h.target && d.tick >= h.tick - 1 && d.tick - h.tick <= 2) || null;
  const xrayOf = h => !!(h && XRAY[h.kind] && major(h.ttype) && (h.vis === 'own' || h.vis === 'track'));

  /* salvos */
  const salvos = [], last = {};
  for (const l of launches) {
    let s = last[l.side];
    if (!s || l.tick - s.t1 > sec(30)) { s = { side: l.side, t0: l.tick, t1: l.tick, rounds: [] }; salvos.push(s); last[l.side] = s; }
    s.t1 = l.tick; s.rounds.push(l);
  }
  const salvoOf = id => salvos.find(s => s.rounds.some(r => r.id === id)) || null;

  /* the decisive hit */
  const hits = E.filter(e => e.k === 'hit' && heavy(e.kind) && byId.has(e.id));
  // the kill that decided it: among the losses just before the result, the heaviest (a carrier or HQ, never an aircraft
  // parked on its deck that dies on the same tick)
  let finalDest = null;
  if (result) for (const d of dests) {
    if (d.tick > result.tick + 2 || result.tick - d.tick > sec(12)) continue;
    if (!finalDest || (W8[d.type] || 0) > (W8[finalDest.type] || 0) || ((W8[d.type] || 0) === (W8[finalDest.type] || 0) && d.tick > finalDest.tick)) finalDest = d;
  }
  let decisive = null, best = -1;
  for (const h of hits) {
    const k = killOf(h);
    let s = (W8[h.ttype] || 4) + (h.side === side ? 8 : 0);
    if (xrayOf(h)) s += 60;
    if (k) s += 30;
    if (k && finalDest && k === finalDest) s += 100;
    if (s > best || (s === best && decisive && h.tick < decisive.tick)) { best = s; decisive = h; }
  }
  // the salvo's first round on that hull (the replay's live mode starts on the first of them and follows the rest)
  let decRound = decisive ? byId.get(decisive.id) : null;
  if (decisive) {
    const first = hits.filter(h => h.target === decisive.target && h.side === decisive.side && h.tick <= decisive.tick && decisive.tick - h.tick <= sec(20))
      .sort((a, b) => a.tick - b.tick)[0];
    if (first && byId.has(first.id)) decRound = byId.get(first.id);
  }
  const decHit = decRound ? outcome.get(decRound.id) : null;

  /* the first salvo and the round to chase */
  const mine = salvos.filter(s => s.side === side);
  let S1 = mine[0] || salvos[0] || null;
  const Sd = decRound ? salvoOf(decRound.id) : null;
  let r1 = null;
  if (S1 && Sd === S1) r1 = decRound;
  else if (S1) {
    const rank = l => { const o = outcome.get(l.id); if (!o) return 0; if (o.k === 'hit') return xrayOf(o) ? 4 : 3; if (o.k === 'intercept') return 2; return 1; };
    r1 = S1.rounds.slice().sort((a, b) => rank(b) - rank(a) || a.tick - b.tick)[0];
  }
  // the decisive salvo overlaps the first one's story (its round lands before the first one's has played out): one story
  const o1 = r1 ? outcome.get(r1.id) : null;
  const end1 = o1 ? o1.tick + sec(o1.k === 'hit' && killOf(o1) ? 40 : 15) : (r1 ? r1.tick + sec(60) : 0);
  if (decHit && r1 && r1 !== decRound && decHit.tick - sec(70) < end1) {
    if (Sd) { S1 = Sd; r1 = decRound; }
  }

  /* the beats */
  const beats = [];
  let fig = 0;
  const T = t => t * DT;
  if (S1 && r1) {
    const own = S1.side === side;
    beats.push({ k: 'launch', fig: ++fig, cap: (own ? (mine[0] === S1 ? 'First salvo' : 'Salvo') : 'Enemy salvo'), launch: S1.rounds[0], salvo: S1, round: r1, tick: S1.rounds[0].tick });
    const out = outcome.get(r1.id) || null;
    beats.push({ k: 'chase', fig: ++fig, cap: 'Chase', launch: r1, out, tick: r1.tick });
    if (out && out.k === 'hit') {
      const k = killOf(out), last = !decRound || decRound === r1;
      beats.push({ k: 'hit', fig: ++fig, cap: 'Hit', launch: r1, hit: out, xray: xrayOf(out), kill: !!k, tick: out.tick, last });
      // the hull going down: here when this is the match's decisive hit (else the film moves on to that one)
      if (k && last) beats.push({ k: 'wreck', fig: ++fig, cap: UNITS[k.type] && UNITS[k.type].domain === 'sea' ? 'Sinking' : 'Destroyed', unit: k.unit, type: k.type, sea: UNITS[k.type] && UNITS[k.type].domain === 'sea', tick: k.tick, pos: k.pos });
    } else if (out && out.k === 'intercept') beats.push({ k: 'down', fig: ++fig, cap: 'Intercept', launch: r1, e: out, tick: out.tick });
  }
  if (decRound && decHit && decRound !== r1 && decHit.k === 'hit') {
    const from = beats.length ? beats[beats.length - 1].tick : 0;
    beats.push({ k: 'skip', from, to: decHit.tick });
    const k = killOf(decHit) || (decisive && decisive.target === decHit.target ? killOf(decisive) : null);
    beats.push({ k: 'approach', fig: ++fig, cap: decRound.side === side ? 'Strike' : 'Inbound', launch: decRound, hit: decHit, xray: xrayOf(decHit), kill: !!k, tick: decHit.tick });
    beats.push({ k: 'hit', fig: ++fig, cap: 'Hit', launch: decRound, hit: decHit, xray: xrayOf(decHit), kill: !!k, tick: decHit.tick, last: true });
    if (k) beats.push({ k: 'wreck', fig: ++fig, cap: UNITS[k.type] && UNITS[k.type].domain === 'sea' ? 'Sinking' : 'Destroyed', unit: k.unit, type: k.type, sea: UNITS[k.type] && UNITS[k.type].domain === 'sea', tick: k.tick, pos: k.pos });
  }
  beats.push({ k: 'orbital', fig: ++fig, cap: 'Every round' });

  /* the tally for the Orbital map (true counts from the record) */
  const counts = {};
  for (const e of E) {
    if (e.k !== 'launch') continue;
    const c = counts[e.side + ':' + e.kind] || (counts[e.side + ':' + e.kind] = { side: e.side, kind: e.kind, fired: 0, hit: 0, down: 0 });
    c.fired++;
    const o = outcome.get(e.id);
    if (o && o.k === 'hit') c.hit++; else if (o && o.k === 'intercept') c.down++;
  }
  // what the interceptors (and guns) brought down
  const shooter = new Map(E.filter(e => e.k === 'launch').map(e => [e.id, e.side]));
  for (const e of E) {
    if (e.k !== 'intercept' || !e.bykind) continue;
    const s = shooter.get(e.by) || (e.side === 'coast' ? 'fleet' : 'coast');
    const c = counts[s + ':' + e.bykind];
    if (c) c.kills = (c.kills || 0) + 1;
  }
  const tEnd = rec.end ? rec.end.tick : result ? result.tick : (E.length ? E[E.length - 1].tick : 0);
  return { beats, salvos, decisive: decHit, decRound, counts, tEnd, T, killOf, outcome };
}
