/* Sandbox tools: the spawn palette (both sides' rosters as text rows with key chips: pick one, click the map to
   place it, valid ground or water only, a ghost shows where), delete the selection, fog on / off, wake / sleep the
   other side's AI, command either side, weather presets.
   Keys: P palette · 1-9 coast rows, Shift 1-9 fleet rows (palette open) · Del delete · G fog · K enemy AI ·
   M switch side (J is the hit replay's, O the boats' dive) · N weather. Click places, Shift-click keeps placing,
   right-click / Esc stops. */
import { PRI } from './game.js';
import { setAi, weatherOf } from './setup.js';
import { SHORT } from './labels.js';
import { typesOf, UNITS, ENEMY } from '../data/units.js';
import { Weather } from '../sim/weather.js';

const WEATHERS = ['calm', 'haze', 'rain', 'storm'];

export function createSandbox(game, ctx) {
  if (game.mode !== 'sandbox') return null;
  const { sim, R } = game, cam = R.camera;
  const rosters = { coast: typesOf('coast'), fleet: typesOf('fleet') };
  let open = true, place = null, el = null, aiLevel = 'normal';
  const ghost = { key: '', T: [0, 0, 0], hdg: 0, st: {}, tint: 'own', alpha: .5 };
  addStyle();

  function valid(type, x, z) {
    const d = UNITS[type], h = game.map.h(x, z);
    if (Math.abs(x) > game.map.W / 2 - 300 || Math.abs(z) > game.map.H / 2 - 300) return false;
    if (d.domain === 'air') return true;
    if (d.domain === 'land') return h > .5 && game.map.slope(x, z) < (d.slopeMax || .4) && sim.nav.open('land', x, z);
    if (d.sub) return h < -d.sub.water && sim.nav.open('sub', x, z);          // boats: deep water only
    if (d.hover) return (h < -1 || h > .5) && sim.nav.open('hover', x, z);   // an LCAC: water, or a beach
    return h < -(d.draught || 5) - 3 && sim.nav.open('sea', x, z);
  }
  function hdgFor(side, x, z) { const e = game.map.spawns[ENEMY[side]]; return Math.atan2(e.x - x, e.z - z); }
  function pick(side, type) {
    place = { side, type };
    ghost.key = UNITS[type].model;
    game.bus.emit('mode', { mode: 'place', type, side });
    render();
  }
  function stop() { if (!place) return; place = null; game.bus.emit('mode', { mode: null }); render(); }
  function doPlace(x, z) {
    const { side, type } = place, d = UNITS[type];
    if (!valid(type, x, z)) { game.bus.emit('toast', { text: d.sub ? 'NEEDS DEEP WATER' : d.domain === 'sea' ? 'NEEDS OPEN WATER' : 'NEEDS OPEN GROUND', bad: true }); return false; }
    const u = sim.spawn(type, side, x, z, { hdg: hdgFor(side, x, z) });
    if (u && side === game.side) game.select([u.id], { add: true });
    game.bus.emit('spawned', { unit: u.id, type, side });
    return true;
  }
  function remove(ids) {
    for (const id of ids) {
      const u = sim.units.get(id); if (!u) continue;
      sim.units.delete(id);
      for (const s in sim.sides) sim.sides[s].contacts.delete(id);
      // aircraft parked on a deleted carrier go with it
      for (const v of sim.units.values()) if (v.aboard === id) { sim.units.delete(v.id); sim.emit('removed', { unit: v.id, type: v.type, side: v.side }); }
      sim.emit('removed', { unit: id, type: u.type, side: u.side });
    }
    sim._dirty = true;
    game.dispatchEvents();
    game.clearSelection();
  }
  function setWeather(kind) {
    const w = weatherOf(game.map, kind);
    sim.weather = new Weather(sim, w);
    R.terrain.setWeather({ wind: w.wind, sea: w.sea });
    game.weather = w;
    game.bus.emit('weather', w);
    game.bus.emit('toast', { text: 'WEATHER · ' + kind.toUpperCase() });
  }

  function tool(k) {
    if (k === 'fog') { sim.fog = !sim.fog; game.bus.emit('toast', { text: sim.fog ? 'FOG ON' : 'FOG OFF' }); }
    else if (k === 'ai') { const on = !sim.ai[game.enemy]; setAi(sim, game.enemy, on, aiLevel); game.bus.emit('toast', { text: on ? 'ENEMY AI AWAKE' : 'ENEMY AI ASLEEP' }); }
    else if (k === 'side') {
      const awake = !!sim.ai[game.enemy];
      if (awake) setAi(sim, game.enemy, false);
      game.setSide(game.enemy);
      if (awake) setAi(sim, game.enemy, true, aiLevel);
      game.bus.emit('toast', { text: 'COMMAND · ' + game.side.toUpperCase() });
    } else if (k === 'weather') { const w = (game.weather && game.weather.kind) || 'calm'; setWeather(WEATHERS[(WEATHERS.indexOf(w) + 1) % WEATHERS.length]); }
    else if (k === 'delete') { const ids = [...game.selection]; if (ids.length) remove(ids); }
    else if (k === 'palette') { open = !open; if (!open) stop(); }
    render();
  }

  function render() {
    if (!el) {
      el = document.createElement('div'); el.className = 'oniks-sbx hit';
      el.addEventListener('mousedown', e => {
        const r = e.target.closest('[data-t]'), t = e.target.closest('[data-k]');
        if (r) { const [side, type] = r.dataset.t.split(':'); place && place.type === type && place.side === side ? stop() : pick(side, type); }
        else if (t) tool(t.dataset.k);
        e.stopPropagation(); e.preventDefault();
      });
      game.uiRoot.appendChild(el);
    }
    const row = (side, t, chip) => {
      const on = place && place.type === t && place.side === side;
      return `<div class="r${on ? ' on' : ''}${side === game.side ? '' : ' en'}" data-t="${side}:${t}"><b>${chip}</b><span>${SHORT[t] || UNITS[t].name}</span></div>`;
    };
    const w = (game.weather && game.weather.kind) || 'calm';
    el.innerHTML = open ? `
      <div class="hd"><span class="kick"><i></i>Sandbox</span></div>
      <div class="cols">
        <div class="col"><div class="lbl">Coast${game.side === 'coast' ? ' · you' : ''}</div>${rosters.coast.map((t, i) => row('coast', t, i + 1)).join('')}</div>
        <div class="col"><div class="lbl">Fleet${game.side === 'fleet' ? ' · you' : ''}</div>${rosters.fleet.map((t, i) => row('fleet', t, '⇧' + (i + 1))).join('')}</div>
      </div>
      <div class="tools">
        <div class="t" data-k="side"><b>M</b><span>Command</span><em>${game.side}</em></div>
        <div class="t" data-k="ai"><b>K</b><span>Enemy AI</span><em>${sim.ai[game.enemy] ? 'awake' : 'asleep'}</em></div>
        <div class="t" data-k="fog"><b>G</b><span>Fog</span><em>${sim.fog ? 'on' : 'off'}</em></div>
        <div class="t" data-k="weather"><b>N</b><span>Weather</span><em>${w}</em></div>
        <div class="t" data-k="delete"><b>Del</b><span>Delete selected</span></div>
        <div class="t" data-k="palette"><b>P</b><span>Hide</span></div>
      </div>` : `<div class="t" data-k="palette"><b>P</b><span>Sandbox</span></div>`;
  }

  return {
    name: 'sandbox', priority: PRI.sandbox,
    init() { render(); game.bus.on('side', render); },
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return false;
      const k = e.code;
      if (open && /^Digit[0-9]$/.test(k)) {
        const n = +k.slice(5), list = e.shiftKey ? rosters.fleet : rosters.coast, side = e.shiftKey ? 'fleet' : 'coast';
        if (n >= 1 && list[n - 1]) { pick(side, list[n - 1]); return true; }
        return false;
      }
      if (place && k === 'Escape') { stop(); return true; }
      const T = { KeyP: 'palette', Delete: 'delete', KeyG: 'fog', KeyK: 'ai', KeyM: 'side', KeyN: 'weather' }[k];
      if (T) { tool(T); return true; }
      return false;
    },
    onPointer(ev) {
      if (!place) return false;
      if (ev.type === 'click' && ev.button === 2) { stop(); return true; }
      if (ev.type === 'click' && ev.button === 0) {
        const w = cam.pickGround(ev.x, ev.y);
        if (w && doPlace(w[0], w[2]) && !ev.shift) stop();
        return true;
      }
      return ev.type === 'down' && ev.button === 0 || ev.type === 'up' && ev.button === 0;
    },
    draw3d() {
      if (!place || !game.mouse.in) return;
      const w = cam.pickGround(game.mouse.x, game.mouse.y);
      if (!w) return;
      const d = UNITS[place.type], ok = valid(place.type, w[0], w[2]);
      ghost.T[0] = w[0]; ghost.T[2] = w[2];
      ghost.T[1] = d.domain === 'air' ? Math.max(0, R.terrain.heightAt(w[0], w[2])) + Math.min(d.altDef, cam.dist * .3) : d.domain === 'sea' ? 0 : Math.max(0, R.terrain.heightAt(w[0], w[2]));
      ghost.hdg = hdgFor(place.side, w[0], w[2]);
      ghost.tint = ok ? (place.side === game.side ? 'own' : 'hostile') : 'hostile';
      ghost.alpha = ok ? .55 : .3;
      ghost.st = {};
      R.draw(ghost);
      const r = Math.max(d.size[0] * .8, cam.dist * .012);
      R.fx.ring(w, r, { rgb: ok ? [198, 244, 50] : [255, 106, 61], a: .8, step: 4, drape: d.domain !== 'air', lift: 1, mode: 'over' });
    },
    draw2d(ov) {
      if (!place || !game.mouse.in) return;
      ov.tag(game.mouse.x + 18 * ov.ui, game.mouse.y + 14 * ov.ui, place.side === 'coast' ? 'C' : 'F', 'Place ' + (SHORT[place.type] || place.type), '', { kind: place.side === game.side ? 'lime' : 'coral', size: 10 });
    },
  };
}

function addStyle() {
  if (document.getElementById('oniks-sbx-css')) return;
  const s = document.createElement('style'); s.id = 'oniks-sbx-css';
  s.textContent = `
  .oniks-sbx { position: absolute; right: 24px; top: 64px; width: 360px; padding: 14px 16px 12px; background: var(--panel); font: 400 11px/1 var(--mono); letter-spacing: .05em; text-transform: uppercase; color: var(--dim); }
  .oniks-sbx .hd { margin-bottom: 14px; }
  .oniks-sbx .cols { display: flex; gap: 18px; }
  .oniks-sbx .col { flex: 1; }
  .oniks-sbx .lbl { margin-bottom: 8px; }
  .oniks-sbx .r, .oniks-sbx .t { display: flex; align-items: center; gap: 9px; padding: 4px 0; cursor: pointer; color: rgba(255,255,255,.78); white-space: nowrap; }
  .oniks-sbx .r:hover, .oniks-sbx .t:hover { color: #fff; }
  .oniks-sbx b { background: rgba(255,255,255,.78); color: #0B0C0A; padding: 3px 5px 2px; font-weight: 500; min-width: 18px; text-align: center; }
  .oniks-sbx .r.on { color: var(--lime); }
  .oniks-sbx .r.on b { background: var(--lime); }
  .oniks-sbx .r.en b { background: rgba(255,106,61,.85); }
  .oniks-sbx .tools { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hair); display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
  .oniks-sbx .t em { font-style: normal; color: var(--lime); margin-left: auto; }`;
  document.head.appendChild(s);
}
