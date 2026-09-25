/* Sandbox tools: the spawn palette (both sides' rosters as text rows with key chips: pick one, click the map to
   place it, valid ground or water only, a ghost shows where), delete the selection, fog on / off, wake / sleep the
   other side's AI, command either side, weather presets.
   Keys: P palette · 1-9 coast rows, Shift 1-9 fleet rows (palette open) · Del delete · G fog · K enemy AI ·
   M switch side (J is the hit replay's, O the boats' dive) · N weather. Click places, Shift-click keeps placing,
   right-click / Esc stops. F2 (or the Map builder row) opens the map builder (editor.js), which hides this palette.
   canPlace / whyNot / removeUnits are shared with the builder. */
import { PRI } from './game.js';
import { setAi, weatherOf } from './setup.js';
import { SHORT } from './labels.js';
import { typesOf, UNITS, ENEMY } from '../data/units.js';
import { Weather } from '../sim/weather.js';

const WEATHERS = ['calm', 'haze', 'rain', 'storm'];

/* can a unit of this type stand at (x, z)? Aircraft anywhere inside the map (they fly at their cruise height); land
   units on open, not too steep ground; boats in deep water; an LCAC on water or a beach; ships in open water deep
   enough for their draught. The sandbox palette and the map builder (editor.js) both place through it. */
export function canPlace(game, type, x, z) {
  const d = UNITS[type], sim = game.sim, h = game.map.h(x, z);
  if (Math.abs(x) > game.map.W / 2 - 300 || Math.abs(z) > game.map.H / 2 - 300) return false;
  if (d.domain === 'air') return true;
  if (d.domain === 'land') return h > .5 && game.map.slope(x, z) < (d.slopeMax || .4) && sim.nav.open('land', x, z);
  if (d.sub) return h < -d.sub.water && sim.nav.open('sub', x, z);          // boats: deep water only
  if (d.hover) return (h < -1 || h > .5) && sim.nav.open('hover', x, z);   // an LCAC: water, or a beach
  return h < -(d.draught || 5) - 3 && sim.nav.open('sea', x, z);
}
/* why a spot is refused (the toast and the builder's tag) */
export function whyNot(type) {
  const d = UNITS[type];
  return d.domain === 'air' ? 'INSIDE THE MAP' : d.sub ? 'NEEDS DEEP WATER' : d.hover ? 'WATER OR A BEACH' : d.domain === 'sea' ? 'NEEDS OPEN WATER' : 'NEEDS OPEN GROUND';
}
/* sim.spawn for a player's placement, kept true in the match record: a host that comes loaded (an LHD's craft,
   vehicles and helicopters, spawned inside its own spawn) is one command, so its passengers' inner spawns are not
   recorded as commands of their own (played back they would be spawned twice, before their host) */
export function spawnUnit(game, type, side, x, z, o) {
  const D = game.debrief, rec = D && D.recorder && D.recorder.on && D.rec ? D.rec : null, n0 = rec ? rec.ops.length : 0;
  const u = game.sim.spawn(type, side, x, z, o);
  if (rec && rec.ops.length - n0 > 1) { const last = rec.ops[rec.ops.length - 1]; rec.ops.length = n0; rec.ops.push(last); }
  return u;
}
/* take units off the map (recorded: the recorder watches units.delete); aircraft parked aboard go with their ship */
export function removeUnits(game, ids) {
  const sim = game.sim, all = new Set(ids);
  // whatever rides aboard (jets on a deck, craft in a well, vehicles in a craft) goes with its host
  for (let grew = true; grew;) { grew = false; for (const v of sim.units.values()) if (v.aboard && all.has(v.aboard) && !all.has(v.id)) { all.add(v.id); grew = true; } }
  for (const id of all) {
    const u = sim.units.get(id); if (!u) continue;
    sim.units.delete(id);
    for (const s in sim.sides) sim.sides[s].contacts.delete(id);
    sim.emit('removed', { unit: id, type: u.type, side: u.side });
  }
  sim._dirty = true;
  game.dispatchEvents();
}

export function createSandbox(game, ctx) {
  if (game.mode !== 'sandbox') return null;
  const { sim, R } = game, cam = R.camera;
  const rosters = { coast: typesOf('coast'), fleet: typesOf('fleet') };
  let open = true, place = null, el = null, aiLevel = 'normal', building = false;
  const ghost = { key: '', T: [0, 0, 0], hdg: 0, st: {}, tint: 'own', alpha: .5 };
  addStyle();

  const valid = (type, x, z) => canPlace(game, type, x, z);
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
    if (!valid(type, x, z)) { game.bus.emit('toast', { text: whyNot(type), bad: true }); return false; }
    const u = spawnUnit(game, type, side, x, z, { hdg: hdgFor(side, x, z) });
    if (u && side === game.side) game.select([u.id], { add: true });
    game.bus.emit('spawned', { unit: u.id, type, side });
    return true;
  }
  function remove(ids) { removeUnits(game, ids); game.clearSelection(); }
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
    else if (k === 'builder') { const ed = game.getSystem('editor'); if (ed) ed.toggle(); }
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
        <div class="t" data-k="builder"><b>F2</b><span>Map builder</span></div>
        <div class="t" data-k="palette"><b>P</b><span>Hide</span></div>
      </div>` : `<div class="t" data-k="palette"><b>P</b><span>Sandbox</span></div>`;
  }

  return {
    name: 'sandbox', priority: PRI.sandbox,
    init() {
      render(); game.bus.on('side', render);
      // the map builder (editor.js) has the stage: this palette steps aside and stops placing
      game.bus.on('editor', e => { building = !!(e && e.on); if (building) stop(); if (el) el.style.display = building ? 'none' : ''; });
    },
    onKey(e) {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return false;
      const k = e.code;
      if (building && (k === 'KeyP' || k === 'Delete' || /^Digit/.test(k))) return false;   // the builder's
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
      if (!place || building) return false;
      if (ev.type === 'click' && ev.button === 2) { stop(); return true; }
      if (ev.type === 'click' && ev.button === 0) {
        const w = cam.pickGround(ev.x, ev.y);
        if (w && doPlace(w[0], w[2]) && !ev.shift) stop();
        return true;
      }
      return ev.type === 'down' && ev.button === 0 || ev.type === 'up' && ev.button === 0;
    },
    draw3d() {
      if (!place || building || !game.mouse.in) return;
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
