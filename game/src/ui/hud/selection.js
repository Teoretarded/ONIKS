/* Selection panel (bottom left). One own unit: id chip + designation, HP as a dotted bar, ammunition per weapon,
   what it is doing (deployed, radar on, reloading 40 %...), damaged parts in coral. An enemy track: only what the
   picture holds (confidence, error, speed, bearing). Several units: grouped by type with counts; click a group to
   narrow the selection to it, Shift-click to drop it. */
import { TEL_ELEV, CLASSIFY } from '../../data/units.js';
import { WNAME, pad2, esc, dots, speedOf, km, brg, sat, dur } from './fmt.js';
import { TRACK } from '../../game/labels.js';

const TYPE_ORDER = ['hq', 'carrier', 'ddg', 'tel', 'radar', 'pantsir', 'transloader', 'catapult', 'drone', 'fighter', 'helo'];
const SHORTN = { hq: 'K380R CP', tel: 'K340P TEL', radar: 'Monolith-B', pantsir: 'Pantsir-S1', catapult: 'Orlan-10 rail', drone: 'Orlan-10',
  transloader: 'K342P TLV', carrier: 'CVN-68 Nimitz', ddg: 'DDG-51 Burke', helo: 'MH-60R', fighter: 'F/A-18E' };

export function createSelection(game, hud) {
  const { sim } = game;
  const el = hud.div('h-bl');
  const box = document.createElement('div'); box.className = 'h-sel'; el.appendChild(box);
  let key = '', last = -1;

  box.addEventListener('mousedown', e => {
    const g = e.target.closest('[data-type]');
    if (!g) return;
    e.stopPropagation(); e.preventDefault();
    const ids = game.selected().filter(u => u.type === g.dataset.type).map(u => u.id);
    if (!ids.length) return;
    if (e.shiftKey) game.select(ids, { toggle: true }); else game.select(ids);
    hud.click();
    last = -1;
  });

  const row = (l, v, cls) => `<div class="rw${cls ? ' ' + cls : ''}"><span class="k">${l}</span><span class="v">${v}</span></div>`;
  const pct = v => Math.round(100 * sat(v)) + '%';

  function state(u) {
    const o = u.orders && u.orders[0], k = o && o.kind, out = [];
    const tgt = o && o.target ? sim.units.get(o.target) : null;
    if (u.type === 'tel') {
      if (u.reloader && u.reloadP > 0) out.push(`<span class="l">Reloading ${pct(u.reloadP / u.def.reload.perRound)}</span>`);
      else if (u.depotLoad && u.reloadP > 0) out.push(`<span class="l">Depot reload ${pct(u.reloadP / u.def.reload.depot)}</span>`);
      else if (u.reloader) out.push('Reload · launcher down');
      const s = u.elev >= TEL_ELEV - .01 ? '<b>Erect</b> · ready' : u.elev > 0 && u.elevT > u.elev ? `Erecting ${pct(u.elev / TEL_ELEV)}` : u.elev > 0 ? `Lowering ${pct(u.elev / TEL_ELEV)}`
        : u.dep >= 1 ? '<b>Deployed</b> · jacks down' : u.dep > 0 ? (u.depT > u.dep ? `Jacks ${pct(u.dep)}` : `Stowing ${pct(1 - u.dep)}`) : 'Stowed';
      out.push(s);
    } else if (u.type === 'radar') {
      out.push(u.mast >= 1 ? '<b>Mast up</b>' : u.mastT > u.mast ? `Raising mast ${pct(u.mast)}` : u.mast > 0 ? `Lowering mast ${pct(1 - u.mast)}` : 'Stowed');
    } else if (u.type === 'transloader') {
      if (u.reloadU > 0) out.push(`<span class="l">Reloading ${pct(u.reloadU)}</span>`);
      else if (u.busy) out.push('Alongside TEL');
      if (u.refillU > 0) out.push(`<span class="l">Loading TLC ${pct(u.refillU)}</span>`);
    } else if (u.type === 'catapult' && k === 'launch_drone') out.push('<span class="l">Launch prep</span>');
    if (u.def.sensors.radar && !u.aboard) out.push(u.off.radar ? '<span class="c">Radar out</span>' : u.radarOn ? (u.def.sensors.radar.needsMast && u.mast < 1 ? 'Radar waits for mast' : '<span class="l">Radar on</span>') : 'EMCON');
    if (u.aboard) {
      const cv = sim.units.get(u.aboard);
      out.push(`On deck${cv ? ' · ' + (cv.def.cls) + ' ' + pad2(cv.id) : ''}`);
      if (u.rearmT > sim.t) out.push(`Rearming ${dur(u.rearmT - sim.t)}`);
    }
    if (u.hold) out.push('<b>Hold</b>');
    if (k === 'move' || k === 'patrol' || k === 'return' || k === 'attack' || k === 'scan' || k === 'reload') {
      const w = { move: 'Moving', patrol: 'Patrol', return: 'Returning', attack: 'Attacking', scan: 'Scan', reload: 'Reload' }[k];
      out.push(w + (tgt && k === 'attack' ? ' ' + esc(trk(tgt)) : tgt && k === 'reload' ? ' ' + tgt.def.cls + ' ' + pad2(tgt.id) : ''));
    }
    if (!out.length) out.push(u.speed > .5 ? 'Moving' : 'Ready');
    return out.join(' · ');
  }
  const trk = t => { const c = sim.contact(game.side, t.id); return c ? c.track : t.def.cls; };

  function single(u) {
    const d = u.def;
    let h = `<div class="hd"><span class="tag lime"><b>${pad2(u.id)}</b><i>${esc(d.label)}</i></span></div><div class="grid">`;
    const hk = u.hp / u.hpMax;
    h += row('HP', dots(hk, 24, hk < .4 ? 'c' : '') + `<em>${Math.ceil(u.hp)}/${u.hpMax}</em>`);
    for (const w in d.weapons) {
      const W = d.weapons[w], a = u.ammo[w];
      if (W.ammo === undefined) continue;
      const off = u.off[w];
      h += row(esc(WNAME[w] || w), off ? '<span class="c">Out of action</span>' : dots(a / W.ammo, Math.min(W.ammo, 24), a === 0 ? 'c' : '') + `<em>${a}/${W.ammo}</em>`);
    }
    if (u.type === 'transloader') h += row('TLC', dots(u.cargo / d.cargo, d.cargo) + `<em>${u.cargo}/${d.cargo}</em>`);
    if (u.type === 'catapult') h += row('Orlan-10', dots(u.drones / 6, 6) + `<em>${u.drones}</em>`);
    if (d.air) {
      let deck = 0, up = 0;
      for (const v of sim.alive(u.side)) if (v.aboardOf === u.id || v.aboard === u.id) { if (v.aboard === u.id) deck++; else up++; }
      h += row('Air', `<b>${deck}</b> on deck · <b>${up}</b> up`);
    }
    if (u.mag) h += row('Mag', Object.keys(u.mag).map(k => `${WNAME[k] || k} <b>${u.mag[k]}</b>`).join(' · '));
    if (d.domain === 'air' && !u.aboard) h += row('Flt', `Alt <b>${Math.round(u.pos[1] / 10) * 10} m</b> · <b>${speedOf(u)}</b>${d.endurance ? ` · fuel <b>${pct(u.fuel / d.endurance)}</b>` : ''}`);
    else if (d.speed > 0 && !u.aboard) h += row('Nav', `<b>${speedOf(u)}</b> · hdg <b>${brg(Math.sin(u.hdg), Math.cos(u.hdg))}°</b>`);
    h += row('State', state(u));
    const dmg = [];
    for (const p of d.partNames) { const v = u.parts[p]; if (v > .005) dmg.push(`${esc(d.parts[p].label)} ${v >= 1 ? 'out' : pct(v)}`); }
    if (dmg.length) h += row('Dmg', dmg.slice(0, 4).join(' · ') + (dmg.length > 4 ? ` · +${dmg.length - 4}` : ''), 'c');
    return h + '</div>';
  }

  function enemy(u) {
    const c = sim.contact(game.side, u.id), fog = sim.fog;
    const cls = (c && c.conf >= CLASSIFY) || (!c && !fog) ? (TRACK[u.type] || `${u.def.cls} · ${u.def.name}`) : 'Unknown';
    const idc = c ? c.track : u.def.cls + ' ' + pad2(u.id);
    let h = `<div class="hd"><span class="tag coral"><b>${esc(idc)}</b><i>${esc(cls)}</i>${c ? `<span class="v">${c.conf.toFixed(2)}</span>` : ''}</span></div><div class="grid">`;
    const pos = c ? c.pos : u.pos;
    if (c) {
      h += row('Conf', dots(c.conf, 24) + `<em>${c.conf.toFixed(2)}</em>`);
      h += row('Err', `± <b>${c.err < 1000 ? Math.round(c.err) + ' m' : km(c.err)}</b>${c.identified ? ' · <span class="l">identified</span>' : ''}${c.emitting ? ' · emitting' : ''}`);
      const v = Math.hypot(c.vel[0], c.vel[2]);
      if (v > .5) h += row('Nav', `<b>${c.dom === 'land' ? Math.round(v * 3.6) + ' km/h' : Math.round(v * 1.944) + ' kn'}</b> · hdg <b>${brg(c.vel[0], c.vel[2])}°</b>`);
      const age = sim.t - c.lastSeen;
      h += row('Seen', age < 2 ? '<b>now</b>' : `<b>${dur(age)}</b> ago`);
    } else h += row('Nav', `<b>${speedOf(u)}</b>`);
    if (!c || c.identified || !fog) { const hk = u.hp / u.hpMax; h += row('HP', dots(hk, 24, 'c') + `<em>${pct(hk)}</em>`); }
    const o = sim.hq(game.side) || sim.alive(game.side).find(v => !v.aboard);
    if (o) h += row('Pos', `<b>${brg(pos[0] - o.pos[0], pos[2] - o.pos[2])}°</b> · <b>${km(Math.hypot(pos[0] - o.pos[0], pos[2] - o.pos[2]))}</b> from ${o.def.cls} ${pad2(o.id)}`);
    return h + '</div>';
  }

  function group(us) {
    const by = new Map();
    for (const u of us) { let g = by.get(u.type); if (!g) by.set(u.type, g = []); g.push(u); }
    const types = [...by.keys()].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
    let h = `<div class="hd"><span class="tag lime"><b>${us.length}</b><i>Selected · ${types.length} ${types.length === 1 ? 'type' : 'types'}</i></span></div><div class="grps">`;
    for (const t of types) {
      const g = by.get(t), d = g[0].def;
      let hp = 0; for (const u of g) hp += u.hp / u.hpMax; hp /= g.length;
      let v = '';
      const w0 = Object.keys(d.weapons).find(w => !d.weapons[w].gun);
      if (w0) { let a = 0, m = 0; for (const u of g) { a += u.ammo[w0]; m += d.weapons[w0].ammo; } v = `${WNAME[w0] || w0} <b>${a}/${m}</b>`; }
      else if (t === 'transloader') { let a = 0; for (const u of g) a += u.cargo; v = `TLC <b>${a}/${g.length * d.cargo}</b>`; }
      else if (t === 'catapult') { let a = 0; for (const u of g) a += u.drones; v = `UAV <b>${a}</b>`; }
      else if (d.sensors.radar) { let a = 0; for (const u of g) if (u.radarOn) a++; v = a ? `<span class="l">Radar on ${a}</span>` : 'EMCON'; }
      h += `<div class="grp hit" data-type="${t}"><b>${g.length}</b><span class="n">${esc(SHORTN[t] || d.name)}</span>${dots(hp, 10, hp < .4 ? 'c' : '')}<span class="v">${v}</span></div>`;
    }
    return h + '</div>';
  }

  return {
    update() {
      if (game.realT - last < .12) return;
      last = game.realT;
      let html = '';
      const own = game.selected();
      if (own.length === 1) html = single(own[0]);
      else if (own.length > 1) html = group(own);
      else if (game.selection.size === 1) {
        const u = sim.units.get([...game.selection][0]);
        if (u && u.alive && u.side !== game.side) html = enemy(u);
      }
      if (html !== key) { key = html; box.innerHTML = html; box.style.display = html ? '' : 'none'; }
    },
    refresh() { last = -1; },
  };
}
