/* Objectives: the campaign mission's objectives checked live (deploy, radar, scan, inspect, launch, reload,
   destroy, survive, hold, protect, lose), reinforcement waves, the mission's win (every required objective done)
   and loss (a required objective failed). Combat: the win condition and the map objectives held. Sandbox: none.
   game.objectives = [{ kind, text, hint, optional, state: 'active'|'done'|'failed', prog }]; bus 'objectives'.
   Drawn top-left unless a HUD system says it draws them (hud.drawsObjectives). */
import { PRI } from './game.js';
import { spawnWave } from './setup.js';
import { SHORT } from './labels.js';

const HINT = {
  deploy: 'Select it · T', radar: 'Select the radar · Y', scan: 'X · click the contact', inspect: 'Select a unit · I',
  launch: 'Select a TEL · right-click a track', reload: 'Select the transloader · right-click the TEL',
  destroy: 'Select a TEL · right-click the track', survive: '', hold: 'Move units onto it', protect: '', lose: '',
};

export function createObjectives(game) {
  const { sim } = game;
  const m = game.mission;
  const side = () => game.side;
  const identified = new Set();
  const kills = {}, losses = {};
  let launches = 0, reloads = 0, inspected = false, waveI = 0, holdT = {}, lastT = 0, over = false;
  const list = [];

  if (game.mode === 'campaign' && m) {
    for (const o of m.objectives || []) {
      let hint = HINT[o.kind] || o.hint || '';
      if (o.kind === 'deploy') hint = `Select the ${SHORT[o.type] || o.type} · T`;
      if (o.kind === 'radar') hint = `Select the ${SHORT[o.type] || o.type} · Y`;
      list.push(Object.assign({}, o, { hint, state: 'active', prog: '' }));
    }
  } else if (game.mode === 'combat') {
    if (game.params.win === 'obj') list.push({ kind: 'combat_obj', text: `Hold more objectives at ${fmt(game.params.timer)}`, state: 'active', prog: '' });
    else list.push({ kind: 'combat_hq', text: game.side === 'coast' ? 'Sink the carrier' : 'Destroy the command post', state: 'active', prog: '' });
    list.push({ kind: 'protect_hq', text: game.side === 'coast' ? 'Keep the command post' : 'Keep the carrier', state: 'active', prog: '' });
  }
  game.objectives = list;
  const waves = (m && m.waves ? m.waves.slice().sort((a, b) => a.t - b.t) : []);

  function fmt(t) { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  const ownOf = type => sim.alive(side()).filter(u => u.type === type);
  function mapObj(key) { return sim.objectives.find(o => o.id === key || o.kind === key || o.name === key) || null; }

  function check(dt) {
    let changed = false;
    const set = (o, st, prog) => { if (prog !== undefined && o.prog !== prog) { o.prog = prog; changed = true; } if (st && o.state !== st) { o.state = st; changed = true; game.bus.emit('toast', { text: (st === 'done' ? 'DONE · ' : 'FAILED · ') + o.text.toUpperCase(), bad: st === 'failed' }); } };
    for (const o of list) {
      if (o.state !== 'active') continue;
      switch (o.kind) {
        case 'deploy': if (ownOf(o.type).some(u => u.type === 'tel' ? u.elev >= 1.5 : u.deployed)) set(o, 'done'); break;
        case 'radar': if (ownOf(o.type).some(u => u.radarOn && (!u.def.mast || u.mast >= 1))) set(o, 'done'); break;
        case 'scan': { const n = identified.size; set(o, n >= o.count ? 'done' : null, `${Math.min(n, o.count)}/${o.count}`); break; }
        case 'inspect': if (inspected) set(o, 'done'); break;
        case 'launch': set(o, launches >= o.count ? 'done' : null, `${Math.min(launches, o.count)}/${o.count}`); break;
        case 'reload': if (reloads > 0) set(o, 'done'); break;
        case 'destroy': {
          const n = kills[o.type] || 0;
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
        case 'protect': if ((losses[o.type] || 0) > 0) set(o, 'failed'); break;
        case 'lose': if ((losses[o.type] || 0) > o.max) set(o, 'failed'); else set(o, null, `${losses[o.type] || 0}/${o.max}`); break;
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
    if (changed) game.bus.emit('objectives', list);
    if (game.mode !== 'campaign' || over || !list.length) return;
    const req = list.filter(o => !o.optional);
    if (req.some(o => o.state === 'failed')) { over = true; game.endMatch && game.endMatch({ win: false, reason: 'mission' }); return; }
    const pending = req.filter(o => o.state === 'active' && o.kind !== 'protect' && o.kind !== 'lose');
    if (!pending.length) {
      over = true;
      for (const o of list) if (o.state === 'active' && (o.kind === 'protect' || o.kind === 'lose')) o.state = 'done';
      game.bus.emit('objectives', list);
      game.endMatch && game.endMatch({ win: true, reason: 'mission' });
    }
  }

  return {
    name: 'objectives', priority: 3,
    list,
    init() {
      game.bus.on('inspect', d => { if (!d || d.on !== false) inspected = true; });
      // no Inspect system in this build: the inspect objective cannot be done, so it does not hold the mission up
      game.bus.on('ready', () => { if (!game.getSystem('inspect')) for (const o of list) if (o.kind === 'inspect' && o.state === 'active') { o.optional = true; o.hint = 'Inspect is not in this build'; } });
    },
    onEvent(e) {
      const me = side();
      switch (e.type) {
        case 'destroyed': {
          // (the event's own `type` field is the event name: the unit's type comes from the unit)
          const u = sim.units.get(e.unit), ut = u ? u.type : '';
          if (!ut) break;
          if (e.side === me) losses[ut] = (losses[ut] || 0) + 1; else kills[ut] = (kills[ut] || 0) + 1;
          break;
        }
        case 'launch': if (e.side === me && game.PROJ[e.kind] && game.PROJ[e.kind].threat) launches++; break;
        case 'reload_done': if (e.side === me) reloads++; break;
        case 'scan': if (e.phase === 'hit' && e.side === me && e.hits) for (const id of e.hits) { const u = sim.units.get(id); if (u && u.side !== me) identified.add(id); } break;
      }
    },
    update(dt, dtSim) {
      if (sim.t - lastT >= .25 || dtSim === 0 && game.frameN % 30 === 0) {
        // identified contacts (a scan or anything else that identified them)
        for (const c of sim.sides[side()].contacts.values()) if (c.identified) identified.add(c.unitId);
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
      let x = 24, y = 64;
      const title = m ? `${String(m.n).padStart(2, '0')} · ${m.title}` : game.mode === 'combat' ? 'Combat' : '';
      // the dark backing (the only allowed panel), sized to the list
      let h = 30, w = 0;
      for (const o of list) { h += 18 + (o.state === 'active' && o.hint ? 16 : 0); w = Math.max(w, measure(ov, o.text + (o.optional ? ' · optional' : ''), 11) + (o.prog ? measure(ov, o.prog, 11) + 8 : 0), o.state === 'active' && o.hint ? measure(ov, o.hint, 10) : 0); }
      ov.ctx.fillStyle = 'rgba(11,12,10,.72)'; ov.ctx.fillRect(x - 12, y - 20, w + 44, h + 8);
      ov.ctx.fillStyle = '#C6F432'; ov.ctx.fillRect(x, y - 8, 7, 7);
      ov.text(x + 16, y, title, { size: 11.5, col: 'rgba(255,255,255,.62)' });
      y += 24;
      for (const o of list) {
        const c = o.state === 'done' ? '#C6F432' : o.state === 'failed' ? '#FF6A3D' : 'rgba(255,255,255,.5)';
        ov.mark(x + 4, y - 4, 8, c, 1, o.state !== 'active');
        ov.text(x + 16, y, o.text + (o.optional ? ' · optional' : ''), { size: 11, col: o.state === 'active' ? '#fff' : o.state === 'failed' ? '#FF6A3D' : 'rgba(255,255,255,.5)' });
        if (o.prog) ov.text(x + 16 + 8 + measure(ov, o.text + (o.optional ? ' · optional' : ''), 11), y, o.prog, { size: 11, col: '#C6F432' });
        y += 18;
        if (o.state === 'active' && o.hint) { ov.text(x + 16, y - 3, o.hint, { size: 10, col: 'rgba(255,255,255,.36)' }); y += 16; }
      }
    },
  };
}

function measure(ov, s, px) { const c = ov.ctx; c.font = `400 ${px}px 'Geist Mono', Consolas, monospace`; return c.measureText(String(s).toUpperCase()).width + px * .05 * s.length; }
