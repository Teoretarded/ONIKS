/* The engagement log (the Ring film's, top right): short timestamped lines from sim events, only what the player's
   side can know. Six rows, the newest bright, older ones fading. Repeated launches from one unit merge into one line. */
import { CLASSIFY, PROJ } from '../../data/units.js';
import { clock, esc, unitRef, trackRef, PNAME, WNAME, km, brg } from './fmt.js';

const ROWS = 6;
const HEAD = { coast: 'K300P Bastion-P', fleet: 'CSG · CVN-68' };
const DEF_KINDS = new Set(['sam', 'sm6', 'pdms', 'aam', 'sam48', 'ram']);

export function createLog(game, hud, parent) {
  const { sim } = game;
  const el = document.createElement('div');
  el.className = 'h-log';
  el.innerHTML = `<div class="h"><span>Engagement log</span><b></b></div><div class="rows"></div>`;
  parent.appendChild(el);
  const headB = el.querySelector('.h b'), rowsEl = el.querySelector('.rows');
  const rows = [];                  // { t, code, text, cls, key, n, real }
  let dirty = true, lastDraw = 0, headKey = '', newest = null, strike = null;   // strike: the last natural lightning { pos, t }

  function add(code, text, cls, key, t) {
    const r = { t: t === undefined ? sim.t : t, code, text, cls: cls || '', key: key || '', n: 1, real: game.realT };
    rows.push(r);
    if (rows.length > 40) rows.splice(0, rows.length - 40);
    dirty = true;
    return r;
  }
  /* merge with a recent row of the same key (a salvo is one line) */
  function merge(key, within) {
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - 6); i--) {
      const r = rows[i];
      if (r.key === key && sim.t - r.t < within) {
        // the merged line becomes the newest (the log stays in time order)
        if (i !== rows.length - 1) { rows.splice(i, 1); rows.push(r); }
        return r;
      }
    }
    return null;
  }
  const me = () => game.side;
  const ownPos = () => { const h = sim.hq(me()) || sim.alive(me()).find(u => !u.aboard); return h ? h.pos : null; };
  const where = p => { const o = ownPos(); if (!o || !p) return ''; return ' · ' + brg(p[0] - o[0], p[2] - o[2]) + '° · ' + km(Math.hypot(p[0] - o[0], p[2] - o[2])); };

  // a track that came within reach of the side's weapons (game/orders.js)
  game.bus.on('engageable', d => { add('Reach', d.text.replace(' · in reach of', ' ·'), 'l', 'R' + d.unit); });

  function onEvent(e) {
    const side = me();
    switch (e.type) {
      case 'launch': {
        const u = sim.units.get(e.from), P = PROJ[e.kind];
        if (!u || !P) break;
        const name = PNAME[e.kind] || e.kind;
        if (e.side === side) {
          const def = DEF_KINDS.has(e.kind);
          const key = 'L' + u.id + e.kind, r = merge(key, def ? 8 : 5);
          const txt = n => def ? `${unitRef(u)} · ${n} away` : `${unitRef(u)} · ${n} ${n === 1 ? 'round' : 'rounds'} away`;
          if (r) { r.n++; r.text = txt(r.n); r.t = sim.t; r.real = game.realT; dirty = true; }
          else add(name, txt(1), def ? '' : 'l', key);
        } else if (!sim.fog || game.vis(u) === 'track') {
          const key = 'E' + u.id + e.kind, r = merge(key, 6);
          const who = trackRef(game, u, true);
          if (r) { r.n++; r.text = `${who} · ${r.n} away`; r.t = sim.t; dirty = true; }
          else add(name, `${who} · 1 away`, P.threat ? 'c' : '', key);
        }
        break;
      }
      case 'detect': {
        if (e.side !== side) break;
        if (e.proj !== undefined) {
          const name = PNAME[e.kind] || e.kind, P = PROJ[e.kind];
          if (!P || !P.threat) break;
          const key = 'V' + e.kind, r = merge(key, 8);
          if (r) { r.n++; r.text = `${r.n} × ${name} inbound${where(e.pos)}`; r.t = sim.t; dirty = true; }
          else add('Vamp', `${name} inbound${where(e.pos)}`, 'c', key);
        } else if (e.how === 'lightning') {
          // a natural strike shows everything near it at once: one line for the flash, where it struck
          // (LIGHTNING · 6 CONTACTS · 218° · 93 KM), the count growing while the cell keeps striking
          const at = strike && sim.t - strike.t < 2 ? strike.pos : e.pos, r = merge('WL', 20);
          if (r) { r.n++; r.text = `Lightning · ${r.n} contacts${where(at)}`; r.t = sim.t; r.real = game.realT; dirty = true; }
          else add('New', `Lightning · ${e.track}${where(at)}`, '', 'WL');
        } else {
          add('New', `${e.track} · ${e.how === 'esm' ? 'emitter' : e.how}${where(e.pos)}`, '', 'N' + e.unit);
        }
        break;
      }
      case 'lightning': strike = { pos: e.pos, t: sim.t }; break;
      case 'classify': {
        if (e.side !== side) break;
        const c = sim.contact(side, e.unit);
        add('Eval', `${e.track} · ${e.cls || '?'} · ${(c ? c.conf : CLASSIFY).toFixed(2)}`, 'c');
        break;
      }
      case 'scan': {
        if (e.side !== side || e.phase !== 'hit') break;
        const n = (e.hits || []).length;
        add('Scan', n ? `${n} identified${where(e.pos)}` : `Nothing there${where(e.pos)}`, 'l');
        break;
      }
      case 'intercept': {
        const round = PNAME[e.kind] || e.kind, by = PNAME[e.byKind] || WNAME[e.byKind] || e.byKind || '';
        const iu = sim.units.get(e.unit);
        const d = iu ? ' · ' + km(Math.hypot(e.pos[0] - iu.pos[0], e.pos[2] - iu.pos[2])) : '';
        if (e.side !== side) add('Kill', `${round} · ${by}${d}`, 'l');
        else add('Down', `${round} · ${by}`, 'c');
        break;
      }
      case 'hit': {
        const t = sim.units.get(e.target);
        if (!t) break;
        const by = PNAME[e.kind] || WNAME[e.kind] || e.kind;
        if (t.side === side) {
          const key = 'H' + t.id, r = merge(key, 4);
          if (r) { r.n++; r.text = `${unitRef(t)} · ${r.n} hits · ${by}`; r.t = sim.t; dirty = true; }
          else add('Hit', `${unitRef(t)} · ${by}`, 'c', key);
        } else if (e.side === side || game.vis(t)) {
          const key = 'X' + t.id, r = merge(key, 4);
          if (r) { r.n++; r.text = `${trackRef(game, t, true)} · ${r.n} hits`; r.t = sim.t; dirty = true; }
          else add('Hit', `${trackRef(game, t, true)} · ${by}`, 'l', key);
        }
        break;
      }
      case 'part': {
        if (e.side !== side) break;
        const u = sim.units.get(e.unit);
        add('Dmg', `${u ? unitRef(u) : ''} · ${e.label || e.part} out`, 'c');
        break;
      }
      case 'destroyed': {
        const u = sim.units.get(e.unit);
        if (!u) break;
        if (e.side === side) add('Lost', `${unitRef(u)} · ${u.def.name}`, 'c');
        else if (!sim.fog || sim.contact(side, u.id)) add(u.def.domain === 'sea' ? 'Sunk' : 'Kill', trackRef(game, u, true), 'l');
        break;
      }
      case 'engage': {
        // standing attacks: a lost track holds the order, the track back, an order that ran dry or lost its track
        if (e.side !== side) break;
        const u = sim.units.get(e.unit), trk = e.track || '';
        if (e.state === 'lost') { const r = merge('G' + e.target, 10); if (r) { r.n++; r.text = `${trk} · lost · ${r.n} holding`; dirty = true; } else add('Hold', `${trk} · lost · holding`, 'c', 'G' + e.target); }
        else if (e.state === 'resume') { if (!merge('B' + e.target, 10)) add('Trk', `${trk} · back · engaging`, 'l', 'B' + e.target); }
        else if (e.state === 'done' && e.why === 'empty' && u) add('Dry', `${unitRef(u)} · magazine empty`, 'c');
        else if (e.state === 'done' && e.why === 'lost') { if (!merge('E' + e.target, 10)) add('End', `${trk} · attack ended · track lost`, 'c', 'E' + e.target); }
        break;
      }
      case 'reload_done': {
        if (e.side !== side) break;
        const u = sim.units.get(e.unit);
        if (u) add('Reld', `${unitRef(u)} · ${e.ammo}/${u.def.weapons.oniks ? u.def.weapons.oniks.ammo : e.ammo}`, 'l');
        break;
      }
      case 'resupply': {
        if (e.side !== side || e.what === 'cargo') break;
        const u = sim.units.get(e.unit);
        if (u && e.what !== 'rearm') add('Reld', `${unitRef(u)} · ${WNAME[e.what] || e.what} full`, '');
        break;
      }
      case 'deploy': {
        if (e.side !== side) break;
        const u = sim.units.get(e.unit);
        if (!u) break;
        if (e.what === 'erect') add('Btry', `${unitRef(u)} · erect · ready`, 'l');
        else if (e.what === 'mast_up') add('Btry', `${unitRef(u)} · mast up`, '');
        break;
      }
      case 'reinforce': {
        if (e.side !== side) break;
        const u = sim.units.get(e.unit);
        add('Arr', e.stock ? `Orlan-10 · to ${u ? unitRef(u) : 'rail'}` : `${u ? unitRef(u) : e.type} · ${u ? u.def.name : ''} arrived`, 'l');
        break;
      }
      case 'order_unit': {
        if (e.side !== side) break;
        // (the event's `type` field is the event name: the ordered type is in the side's queue)
        const q = sim.sides[side].queue.find(x => x.at === e.at && Math.abs(x.ordered - e.t) < 1e-6);
        const d = q && game.UNITS[q.type];
        add('Ord', `${d ? d.name + ' ' + d.cls : 'Reinforcement'} · ETA ${clock(e.at)}`, '');
        break;
      }
      case 'objective': {
        if (e.owner === side) add('Site', `${e.id} · held`, 'l');
        else if (e.prev === side) add('Site', `${e.id} · ${e.owner ? 'taken' : 'lost'}`, 'c');
        else if (e.owner && e.owner !== side) add('Site', `${e.id} · enemy`, 'c');
        break;
      }
      case 'takeoff': {
        if (e.side !== side) break;
        const u = sim.units.get(e.unit);
        if (u && u.type !== 'drone') { const key = 'T' + e.from, r = merge(key, 60); if (r) { r.n++; r.text = `${r.n} aircraft off the deck`; r.t = sim.t; dirty = true; } else add('Air', `${unitRef(u)} · off the deck`, '', key); }
        else if (u) add('Air', `${unitRef(u)} · launched`, '');
        break;
      }
    }
  }

  function draw() {
    const hk = game.side;
    if (hk !== headKey) { headKey = hk; headB.textContent = HEAD[hk] || hk; }
    const L = rows.slice(-ROWS);
    // a line that has just arrived types in, as the films' captions do
    const fresh = L.length && L[L.length - 1] !== newest ? L[L.length - 1] : null;
    if (L.length) newest = L[L.length - 1];
    let html = '';
    for (let i = 0; i < L.length; i++) {
      const r = L[i], top = i === L.length - 1, age = game.realT - r.real;
      const o = top ? 1 : Math.max(.5, (.92 - (L.length - 1 - i) * .08) * (age > 45 ? .8 : 1));
      html += `<div class="r${top ? ' new' : ''}${r === fresh ? ' in' : ''}${r.cls ? ' ' + r.cls : ''}" style="opacity:${o.toFixed(2)}"><span class="tm">${clock(r.t)}</span><span class="cd">${esc(r.code)}</span><span class="tx">${esc(r.text)}</span></div>`;
    }
    rowsEl.innerHTML = html || '<div class="r idle"><span class="tm">--:--</span><span class="cd"></span><span class="tx">Quiet</span></div>';
  }

  // sandbox: commanding the other side starts a fresh log (the old lines were the other side's picture)
  game.bus.on('side', side => { rows.length = 0; add('Cmd', `Command · ${side}`, 'l'); });

  return {
    el, onEvent, add,
    update() {
      if (dirty || game.realT - lastDraw > 2) { dirty = false; lastDraw = game.realT; draw(); }
    },
  };
}
