/* Objectives: the campaign mission's objectives checked live, revealed in stages by the mission script, the
   mission's win (every required objective done, none still hidden) and loss (a required objective failed).
   Combat: the win condition and the map objectives held. Sandbox: none.

   game.objectives = the objectives on screen (revealed): [{ id, kind, text, hint, optional, state, prog }]; bus
   'objectives' after a change. Hidden ones (`hidden: true` in data/campaign.js, or added later by the script) are
   not checked until revealed. Drawn top-left unless a HUD system says it draws them (hud.drawsObjectives).

   Kinds (data/campaign.js has the fields):
     deploy radar scan inspect launch reload destroy survive hold protect lose          (as before)
     classify { count, dom? }   hold `count` classified tracks (of domain `dom`) at once or over time
     script   {}                done / failed by the mission script only
     time     { seconds }       end-state: finish before this sim time (fails when it passes)
     rounds   { max }           end-state: fire at most `max` rounds of 3M55
     silent   { type }          end-state: no own unit of `type` radiates
   End-state kinds (protect, lose, time, rounds, silent) never hold the win up; they are marked done at a win.

   For the mission script (campaign/): the returned objectives system carries
     reveal(id), add(obj, { hidden }), get(id), set(id, state, prog), holdWin(on), counts { kills, losses, launches,
     reloads, identified, classified }
   In campaign mode createObjectives also returns the mission-script system (campaign/index.js).
   At the result match.js calls settle(win): what was achieved is ticked (a Combat Victory by sinking the carrier shows
   SINK THE CARRIER and KEEP THE COMMAND POST done). */
import { spawnWave } from './setup.js';
import { SHORT } from './labels.js';
import { createCampaign } from './campaign/index.js';

const HINT = {
  deploy: 'Select it · T', radar: 'Select the radar · Y', scan: 'X · click the contact', inspect: 'Select a unit · I',
  launch: 'Select a TEL · right-click a track', reload: 'Select the transloader · right-click the TEL',
  destroy: 'Select a TEL · right-click the track', survive: '', hold: 'Move units onto it', protect: '', lose: '',
  classify: '', script: '', time: '', rounds: '', silent: '',
};
const END = new Set(['protect', 'lose', 'time', 'rounds', 'silent']);

export async function createObjectives(game, ctx) {
  const obj = objectivesSystem(game);
  if (game.mode !== 'campaign' || !game.mission) return obj;
  let script = null;
  try { script = await createCampaign(game, ctx, obj); } catch (e) { console.error('campaign script failed to load', e); }
  return script ? [obj, script] : obj;
}

function objectivesSystem(game) {
  const { sim } = game;
  const m = game.mission;
  const side = () => game.side;
  const identified = new Set(), classified = new Set();
  const kills = {}, losses = {};
  let launches = 0, reloads = 0, inspected = false, waveI = 0, lastT = 0, over = false, hold = false, lostAll = 0;
  const holdT = {};
  const all = [];            // every objective of the mission (hidden ones too), in order
  const list = [];           // what is shown (game.objectives)
  let seq = 0;

  function mk(o) {
    let hint = o.hint !== undefined ? o.hint : HINT[o.kind] || '';
    if (o.hint === undefined && o.kind === 'deploy') hint = `Select the ${SHORT[o.type] || o.type} · T`;
    if (o.hint === undefined && o.kind === 'radar') hint = `Select the ${SHORT[o.type] || o.type} · Y`;
    return Object.assign({}, o, { id: o.id || `${o.kind}${++seq}`, hint, state: 'active', prog: '', hidden: !!o.hidden });
  }
  function rebuild() { list.length = 0; for (const o of all) if (!o.hidden) list.push(o); }

  if (game.mode === 'campaign' && m) {
    for (const o of m.objectives || []) all.push(mk(o));
  } else if (game.mode === 'combat') {
    if (game.params.win === 'obj') all.push(mk({ kind: 'combat_obj', text: `Hold more objectives at ${fmt(game.params.timer)}` }));
    else all.push(mk({ kind: 'combat_hq', text: game.side === 'coast' ? 'Sink the carrier' : 'Destroy the command post' }));
    all.push(mk({ kind: 'protect_hq', text: game.side === 'coast' ? 'Keep the command post' : 'Keep the carrier' }));
  }
  rebuild();
  game.objectives = list;
  const waves = (m && m.waves ? m.waves.slice().sort((a, b) => a.t - b.t) : []);

  function fmt(t) { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  const ownOf = type => sim.alive(side()).filter(u => u.type === type);
  const typeIn = (t, want) => !want || want === '*' || (Array.isArray(want) ? want.includes(t) : want === t);
  const lostOf = want => { if (!want || want === '*') return lostAll; let n = 0; for (const k in losses) if (typeIn(k, want)) n += losses[k]; return n; };
  const killsOf = want => { if (!want || want === '*') { let n = 0; for (const k in kills) n += kills[k]; return n; } let n = 0; for (const k in kills) if (typeIn(k, want)) n += kills[k]; return n; };
  function mapObj(key) { return sim.objectives.find(o => o.id === key || o.kind === key || o.name === key) || null; }

  let changed = false;
  function set(o, st, prog) {
    if (prog !== undefined && prog !== null && o.prog !== prog) { o.prog = prog; if (!o.hidden) changed = true; }
    if (st && o.state !== st) {
      o.state = st;
      if (!o.hidden) { changed = true; if (!o.quiet) game.bus.emit('toast', { text: (st === 'done' ? 'DONE · ' : 'FAILED · ') + o.text.toUpperCase(), bad: st === 'failed' }); }
    }
  }

  function check(dt) {
    for (const o of all) {
      if (o.state !== 'active' || o.hidden) continue;
      switch (o.kind) {
        case 'deploy': if (ownOf(o.type).some(u => u.type === 'tel' ? u.elev >= 1.5 : u.deployed)) set(o, 'done'); break;
        case 'radar': if (ownOf(o.type).some(u => u.radarOn && (!u.def.mast || u.mast >= 1))) set(o, 'done'); break;
        case 'scan': { const n = identified.size; set(o, n >= o.count ? 'done' : null, `${Math.min(n, o.count)}/${o.count}`); break; }
        case 'classify': {
          let n = 0;
          for (const id of classified) { const u = sim.units.get(id); if (!o.dom || (u && u.def.domain === o.dom) || (!u && o.dom === 'sea')) n++; }
          set(o, n >= o.count ? 'done' : null, `${Math.min(n, o.count)}/${o.count}`);
          break;
        }
        case 'inspect': if (inspected) set(o, 'done'); break;
        case 'launch': set(o, launches >= o.count ? 'done' : null, `${Math.min(launches, o.count)}/${o.count}`); break;
        case 'reload': if (reloads > 0) set(o, 'done'); break;
        case 'destroy': {
          const n = killsOf(o.type);
          if (n >= o.count) set(o, 'done', `${o.count}/${o.count}`);
          else if (o.within && sim.t > o.within) set(o, 'failed', `${n}/${o.count}`);
          else set(o, null, `${n}/${o.count}` + (o.within ? ` · ${fmt(o.within - sim.t)}` : ''));
          break;
        }
        case 'survive': set(o, sim.t >= o.seconds ? 'done' : null, fmt(o.seconds - sim.t)); break;
        case 'hold': {
          const b = mapObj(o.objective);
          if (!b) { set(o, 'done'); break; }
          if (b.owner === side()) holdT[o.objective] = (holdT[o.objective] || 0) + dt;
          const h = holdT[o.objective] || 0;
          set(o, h >= o.seconds ? 'done' : null, (b.owner === side() ? 'HELD ' : 'NOT HELD ') + fmt(o.seconds - h));
          break;
        }
        case 'protect': if (lostOf(o.type) > 0) set(o, 'failed'); break;
        case 'lose': if (lostOf(o.type) > o.max) set(o, 'failed'); else set(o, null, o.max ? `${lostOf(o.type)}/${o.max}` : ''); break;
        case 'time': if (sim.t > o.seconds) set(o, 'failed', ''); else set(o, null, fmt(o.seconds - sim.t)); break;
        case 'rounds': if (launches > o.max) set(o, 'failed', `${launches}/${o.max}`); else set(o, null, `${launches}/${o.max}`); break;
        case 'silent': if (ownOf(o.type || 'radar').some(u => u.radarOn && (!u.def.mast || u.mast >= 1))) set(o, 'failed'); break;
        case 'combat_hq': {
          const e = sim.hq(game.enemy);
          set(o, null, e ? `${Math.round(100 * e.hp / e.hpMax)}%` : '');
          break;
        }
        case 'combat_obj': {
          const mine = sim.objectives.filter(b => b.owner === side()).length, theirs = sim.objectives.filter(b => b.owner === game.enemy).length;
          set(o, null, `${mine}–${theirs} · ${fmt(game.params.timer - sim.t)}`);
          break;
        }
        case 'protect_hq': { const h = sim.hq(side()); set(o, h ? null : 'failed', h ? `${Math.round(100 * h.hp / h.hpMax)}%` : ''); break; }
      }
    }
    if (changed) { changed = false; game.bus.emit('objectives', list); }
    if (game.mode !== 'campaign' || over || !all.length) return;
    const req = all.filter(o => !o.optional);
    if (req.some(o => o.state === 'failed' && !o.hidden)) { over = true; game.endMatch && game.endMatch({ win: false, reason: 'mission' }); return; }
    if (hold) return;
    const pending = req.filter(o => (o.state === 'active' || o.hidden) && !END.has(o.kind));
    if (!pending.length) win();
  }

  function win() {
    if (over) return;
    over = true;
    for (const o of all) if (!o.hidden && o.state === 'active' && END.has(o.kind)) o.state = 'done';
    game.bus.emit('objectives', list);
    game.endMatch && game.endMatch({ win: true, reason: 'mission' });
  }
  function lose(reason) {
    if (over) return;
    over = true;
    game.endMatch && game.endMatch({ win: false, reason: reason || 'mission' });
  }

  const sys = {
    name: 'objectives', priority: 3,
    list, all,
    counts: { kills, losses, get launches() { return launches; }, get reloads() { return reloads; }, identified, classified, get lost() { return lostAll; } },
    get over() { return over; },
    get(id) { return all.find(o => o.id === id) || null; },
    reveal(id, quiet) {
      const o = sys.get(id);
      if (!o || !o.hidden) return o;
      o.hidden = false; rebuild();
      if (!quiet) game.bus.emit('toast', { text: (o.optional ? 'OPTIONAL · ' : 'NEW · ') + o.text.toUpperCase() });
      game.bus.emit('objectives', list);
      return o;
    },
    add(o, opt) {
      const x = mk(Object.assign({}, o, { hidden: true }));
      const at = opt && opt.after ? all.findIndex(q => q.id === opt.after) : -1;
      if (at >= 0) all.splice(at + 1, 0, x); else all.push(x);
      if (!(opt && opt.hidden)) sys.reveal(x.id, opt && opt.quiet);
      return x;
    },
    /* the script's hand on an objective: state 'done' | 'failed' | 'active' (null keeps it), prog text */
    set(id, st, prog) { const o = sys.get(id); if (!o) return null; set(o, st, prog); if (changed) { changed = false; game.bus.emit('objectives', list); } return o; },
    remove(id) { const i = all.findIndex(q => q.id === id); if (i >= 0) { all.splice(i, 1); rebuild(); game.bus.emit('objectives', list); } },
    holdWin(on) { hold = !!on; },
    win, lose,
    /* the match is over (match.js, before the result is read): tick what was achieved, in silence. Combat: the
       enemy's command gone (sunk carrier / destroyed CP), your own still there, the sites held on a win by
       objectives; what was not achieved stays open, except your own command lost (failed). The campaign's own
       win() already ticks its end-state objectives. */
    settle(won) {
      let ch = false;
      const mark = (o, st) => { if (o.state !== st) { o.state = st; ch = true; } };
      for (const o of all) {
        if (o.hidden || o.state !== 'active') continue;
        if (o.kind === 'combat_hq') { const e = sim.hq(game.enemy); if (!e || !e.alive) { mark(o, 'done'); o.prog = ''; } }
        else if (o.kind === 'protect_hq') { const h = sim.hq(side()); mark(o, h && h.alive ? 'done' : 'failed'); }
        else if (o.kind === 'combat_obj') { if (won) mark(o, 'done'); }
        else if (won && END.has(o.kind)) mark(o, 'done');
      }
      if (ch) game.bus.emit('objectives', list);
    },
    check() { check(0); },
    init() {
      game.bus.on('inspect', d => { if (!d || d.on !== false) inspected = true; });
      // no Inspect system in this build: the inspect objective cannot be done, so it does not hold the mission up
      game.bus.on('ready', () => { if (!game.getSystem('inspect')) for (const o of all) if (o.kind === 'inspect' && o.state === 'active') { o.optional = true; o.hint = 'Inspect is not in this build'; } });
    },
    onEvent(e) {
      const me = side();
      switch (e.type) {
        case 'destroyed': {
          // (the event's own `type` field is the event name: the unit's type is `utype`, or comes from the unit)
          const u = sim.units.get(e.unit), ut = e.utype || (u ? u.type : '');
          if (!ut) break;
          if (e.side === me) { losses[ut] = (losses[ut] || 0) + 1; lostAll++; } else kills[ut] = (kills[ut] || 0) + 1;
          break;
        }
        case 'launch': if (e.side === me && game.PROJ[e.kind] && game.PROJ[e.kind].threat) launches++; break;
        case 'reload_done': if (e.side === me) reloads++; break;
        case 'classify': if (e.side === me && e.unit !== undefined) classified.add(e.unit); break;
        case 'scan': if (e.phase === 'hit' && e.side === me && e.hits) for (const id of e.hits) { const u = sim.units.get(id); if (u && u.side !== me) { identified.add(id); classified.add(id); } } break;
      }
    },
    update(dt, dtSim) {
      if (sim.t - lastT >= .25 || dtSim === 0 && game.frameN % 30 === 0) {
        // identified contacts (a scan or anything else that identified them)
        for (const c of sim.sides[side()].contacts.values()) { if (c.identified) identified.add(c.unitId); if (c.cls) classified.add(c.unitId); }
        check(sim.t - lastT); lastT = sim.t;
      }
      while (waveI < waves.length && sim.t >= waves[waveI].t) {
        const w = waves[waveI++];
        spawnWave(sim, w.side, w.units);
        if (w.side === game.side) game.bus.emit('toast', { text: 'REINFORCEMENTS' });
      }
    },
    draw2d(ov) {
      if (!list.length) return;
      const hud = game.getSystem('hud');
      if (hud && hud.drawsObjectives) return;
      // (the fallback for a game without the HUD: px at 1080p times the UI scale)
      const K = ov.ui || 1;
      let x = 24 * K, y = 64 * K;
      const title = m ? `${String(m.n).padStart(2, '0')} · ${m.title}` : game.mode === 'combat' ? 'Combat' : '';
      // the dark backing (the only allowed panel), sized to the list
      let h = 30 * K, w = 0;
      for (const o of list) { h += (18 + (o.state === 'active' && o.hint ? 16 : 0)) * K; w = Math.max(w, measure(ov, o.text + (o.optional ? ' · optional' : ''), 11 * K) + (o.prog ? measure(ov, o.prog, 11 * K) + 8 * K : 0), o.state === 'active' && o.hint ? measure(ov, o.hint, 10 * K) : 0); }
      ov.ctx.fillStyle = 'rgba(11,12,10,.72)'; ov.ctx.fillRect(x - 12 * K, y - 20 * K, w + 44 * K, h + 8 * K);
      ov.ctx.fillStyle = '#C6F432'; ov.ctx.fillRect(x, y - 8 * K, 7 * K, 7 * K);
      ov.text(x + 16 * K, y, title, { size: 11.5, col: 'rgba(255,255,255,.62)' });
      y += 24 * K;
      for (const o of list) {
        const c = o.state === 'done' ? '#C6F432' : o.state === 'failed' ? '#FF6A3D' : 'rgba(255,255,255,.5)';
        ov.mark(x + 4 * K, y - 4 * K, 8, c, 1, o.state !== 'active');
        ov.text(x + 16 * K, y, o.text + (o.optional ? ' · optional' : ''), { size: 11, col: o.state === 'active' ? '#fff' : o.state === 'failed' ? '#FF6A3D' : 'rgba(255,255,255,.5)' });
        if (o.prog) ov.text(x + 24 * K + measure(ov, o.text + (o.optional ? ' · optional' : ''), 11 * K), y, o.prog, { size: 11, col: '#C6F432' });
        y += 18 * K;
        if (o.state === 'active' && o.hint) { ov.text(x + 16 * K, y - 3 * K, o.hint, { size: 10, col: 'rgba(255,255,255,.36)' }); y += 16 * K; }
      }
    },
  };
  return sys;
}

function measure(ov, s, px) { const c = ov.ctx; c.font = `400 ${px}px 'Geist Mono', Consolas, monospace`; return c.measureText(String(s).toUpperCase()).width + px * .05 * s.length; }
