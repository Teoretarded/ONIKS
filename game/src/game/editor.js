/* The map builder (sandbox only): F2, or the palette's Map builder row. Entering pauses the sim (the picture and the
   camera keep running); leaving resumes the match from the edited setup at the rate it had.

   In it: a compact palette of both sides' whole rosters (click a row, then click the map: it keeps placing until
   right-click / Esc); click a unit to select it (Shift adds, a drag on empty ground boxes), drag the selection to move
   it, the wheel (while placing or dragging) or R / Shift R turns it, Del / Backspace removes it. A spot is checked as the
   sandbox's palette checks it (sandbox.js canPlace: ships in water deep enough for their draught, boats deeper, land
   units on open ground, aircraft anywhere at their cruise height); a refused spot is drawn coral with the reason and
   nothing moves. Every unit shows through the fog while building (a lime or coral mark, its model ghosted when the
   picture would hide it). Save / Load keep one layout per map in localStorage (`oniks.layout.<map>`); Clear empties
   the map (twice); the Map row reloads the sandbox on another map.

   Placing, removing and loading go through sim.spawn and units.delete (the match recorder keeps them, so a saved game
   continues exactly). A move is the unit's position and heading set while the sim stands still (its orders dropped):
   the sim stays deterministic from there. A unit placed in this sitting moves by rewriting its recorded spawn; moving
   anything older ends the recording (record.js has no op for it), and the pause menu's Save goes with it.

   game.getSystem('editor'): { on, toggle(), enter(), leave() }; bus 'editor' { on }. */
import { SHORT } from './labels.js';
import { canPlace, whyNot, removeUnits, spawnUnit } from './sandbox.js';
import { typesOf, UNITS, ENEMY } from '../data/units.js';

const PRI_EDITOR = 90;                    // over targeting (80), the HUD (70) and the palette (60); under inspect (100)
const TURN = Math.PI / 12, TURN_KEY = Math.PI / 4;
const LIME = [198, 244, 50], CORAL = [255, 106, 61];
const TAU = Math.PI * 2;
const wrapA = a => a - TAU * Math.floor((a + Math.PI) / TAU);

export function createEditor(game) {
  if (game.mode !== 'sandbox') return null;
  const { sim, R } = game, cam = R.camera, map = game.map;
  const rosters = { coast: typesOf('coast'), fleet: typesOf('fleet') };
  const q = [0, 0, 0];
  let on = false, wasPaused = false, el = null, clearArm = 0, mapPick = null;
  let place = null;                       // { side, type, rot }
  let drag = null;                        // { ids, orig: [[x, z, hdg]], cx, cz, gx, gz, dx, dz, rot, live, ok }
  let box = null;                         // { x0, y0, x1, y1, add }
  let hover = 0, freshTick = -1;
  const sel = new Set(), fresh = new Set();
  const ghosts = new Map();               // unit id -> an instance for units the picture hides (fog)
  const phantom = [];                     // drag / place ghosts (reused)
  addStyle();

  /* ------------------------------------------------------------------ helpers */
  const units = () => sim.list().filter(u => u.alive && !u.aboard);
  const posOf = u => game.unitScreenPos ? game.unitScreenPos(u) : game.unitPose(u).pos;
  const hdgFor = (side, x, z) => { const e = map.spawns[ENEMY[side]]; return Math.atan2(e.x - x, e.z - z); };
  const tintOf = side => side === game.side ? 'own' : 'hostile';
  const colOf = side => side === game.side ? '#C6F432' : '#FF6A3D';
  const nameOf = t => SHORT[t] || UNITS[t].name || t;
  function yAt(type, x, z) {
    const d = UNITS[type], g = Math.max(0, R.terrain.heightAt(x, z));
    return d.domain === 'air' ? g + (d.altDef || 300) : d.domain === 'sea' ? 0 : g;
  }
  function instOf(u) { return game.drawn.get(u.id) || ghosts.get(u.id) || null; }
  function radiusPx(u, p) {
    const key = u.def.model, e = R.models.has && R.models.has(key) ? R.models.get(key) : null;
    return cam.project(p, q) ? Math.max(9 * (R.overlay ? R.overlay.ui : 1), e ? cam.fl * e.radius / q[2] : 0) : 0;
  }
  /* the unit under a screen point: nearest by its drawn centre, inside its model's radius (both sides, through fog) */
  function pickAt(x, y) {
    let best = null, bd = 1e9;
    for (const u of units()) {
      const p = posOf(u), r = radiusPx(u, p);
      if (!r) continue;
      const d = Math.hypot(q[0] - x, q[1] - y) / r;
      if (d < 1 && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  const ground = (x, y) => cam.pickGround(x, y);
  const toast = (text, bad) => game.bus.emit('toast', { text, bad });
  const recorder = () => { const D = game.debrief; return D && D.recorder && D.rec ? D : null; };

  /* ------------------------------------------------------------------ enter / leave */
  function enter() {
    if (on || game.result) return;
    on = true; wasPaused = game.paused;
    game.pause(true);
    sel.clear(); for (const id of game.selection) sel.add(id);
    game.clearSelection();
    fresh.clear(); freshTick = sim.tick;
    game.bus.emit('editor', { on: true });
    game.bus.emit('mode', { mode: null });
    render();
  }
  function leave() {
    if (!on) return;
    stopPlace(); drag = null; box = null;
    on = false;
    if (el) el.style.display = 'none';
    ghosts.clear();
    const own = [...sel].filter(id => { const u = sim.units.get(id); return u && u.alive && u.side === game.side; });
    sel.clear();
    game.bus.emit('editor', { on: false });
    if (own.length) game.select(own);
    if (!wasPaused) game.pause(false);
    toast(wasPaused ? 'BUILDER CLOSED · PAUSED' : 'BUILDER CLOSED · RUNNING');
  }
  const toggle = () => (on ? leave() : enter());

  /* ------------------------------------------------------------------ place */
  function pick(side, type) {
    if (place && place.side === side && place.type === type) { stopPlace(); return; }
    place = { side, type, rot: place ? place.rot : 0 };
    sel.clear();
    render();
  }
  function stopPlace() { if (!place) return; place = null; render(); }
  function placeAt(x, z) {
    const { side, type } = place;
    if (!canPlace(game, type, x, z)) { toast('REFUSED · ' + whyNot(type), true); return; }
    if (sim.tick !== freshTick) { fresh.clear(); freshTick = sim.tick; }
    const u = spawnUnit(game, type, side, x, z, { hdg: wrapA(hdgFor(side, x, z) + place.rot) });
    if (!u) return;
    fresh.add(u.id);
    sel.clear(); sel.add(u.id);                  // the last one placed: R turns it, Del takes it back
    game.dispatchEvents();
    game.bus.emit('spawned', { unit: u.id, type, side });
    render();
  }

  /* ------------------------------------------------------------------ move / turn / remove */
  function children(id) { const out = []; for (const v of sim.units.values()) if (v.aboard === id) out.push(v); return out; }
  /* a move: the unit stands at (x, z) facing hdg, its orders and path dropped (the sim is paused) */
  function setPose(u, x, z, hdg) {
    const d = u.def;
    u.pos[0] = x; u.pos[2] = z;
    if (d.domain === 'land') u.pos[1] = Math.max(0, map.h(x, z));
    else if (d.domain === 'air') u.pos[1] = Math.max(0, map.h(x, z)) + (u.altT || d.altDef || 300);
    u.prev[0] = u.pos[0]; u.prev[1] = u.pos[1]; u.prev[2] = u.pos[2];
    u.hdg = u.prevHdg = hdg;
    u.orders.length = 0; u.path = null; u.wi = 0; u.goal = null; u.blocked = 0;
    if (d.domain !== 'air') u.speed = 0;
    u.shoreX = u.shoreZ = u.shore = undefined;
    for (const v of children(u.id)) { v.pos[0] = v.prev[0] = x; v.pos[2] = v.prev[2] = z; v.hdg = v.prevHdg = hdg; }
    d.modelState(u, sim.t);
    record(u, x, z, hdg);
  }
  /* keep the record true: a unit placed in this sitting (the sim has not stepped since) is its spawn rewritten */
  function record(u, x, z, hdg) {
    const D = recorder(); if (!D || !D.recorder.on) return;
    if (fresh.has(u.id) && freshTick === sim.tick && !u.def.carry && !children(u.id).length) {
      const ops = D.rec.ops;
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.k === 'spawn' && op.id === u.id && op.tick === sim.tick) { op.x = x; op.z = z; op.o = Object.assign({}, op.o, { hdg }); return; }
      }
    }
    D.recorder.stop('the map builder moved a unit');
  }
  function turnSel(a) {
    for (const id of sel) {
      const u = sim.units.get(id); if (!u || !u.alive || u.aboard) continue;
      setPose(u, u.pos[0], u.pos[2], wrapA(u.hdg + a));
    }
  }
  function removeSel() {
    const ids = [...sel].filter(id => sim.units.has(id));
    if (!ids.length) return;
    removeUnits(game, ids);
    sel.clear();
    toast(ids.length === 1 ? 'REMOVED' : `REMOVED · ${ids.length}`);
    render();
  }
  function startDrag(gx, gz) {
    const list = [...sel].map(id => sim.units.get(id)).filter(u => u && u.alive && !u.aboard);
    if (!list.length) return;
    let cx = 0, cz = 0;
    for (const u of list) { cx += u.pos[0]; cz += u.pos[2]; }
    cx /= list.length; cz /= list.length;
    drag = { ids: list.map(u => u.id), orig: list.map(u => [u.pos[0], u.pos[2], u.hdg]), cx, cz, gx, gz, dx: 0, dz: 0, rot: 0, live: false, ok: true };
  }
  /* where each dragged unit would stand: the group turned about its centre, then moved */
  function dragTargets(fn) {
    const c = Math.cos(drag.rot), s = Math.sin(drag.rot);
    drag.ids.forEach((id, i) => {
      const [x0, z0, h0] = drag.orig[i], ox = x0 - drag.cx, oz = z0 - drag.cz;
      fn(sim.units.get(id), drag.cx + drag.dx + ox * c + oz * s, drag.cz + drag.dz + oz * c - ox * s, wrapA(h0 + drag.rot));
    });
  }
  function dragCheck() {
    let ok = true;
    dragTargets((u, x, z) => { if (u && !canPlace(game, u.type, x, z)) ok = false; });
    drag.ok = ok;
  }
  function dropDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.live) return;
    drag = d; dragCheck(); drag = null;
    if (!d.ok) { const u = sim.units.get(d.ids[0]); toast('REFUSED · ' + (u ? whyNot(u.type) : 'NO ROOM'), true); return; }
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    d.ids.forEach((id, i) => {
      const u = sim.units.get(id); if (!u) return;
      const [x0, z0, h0] = d.orig[i], ox = x0 - d.cx, oz = z0 - d.cz;
      setPose(u, d.cx + d.dx + ox * c + oz * s, d.cz + d.dz + oz * c - ox * s, wrapA(h0 + d.rot));
    });
  }

  /* ------------------------------------------------------------------ layouts (localStorage, one per map) */
  const LKEY = 'oniks.layout.' + map.id;
  function saved() { try { const s = JSON.parse(localStorage.getItem(LKEY) || 'null'); return s && s.v === 1 && Array.isArray(s.units) ? s : null; } catch (e) { return null; } }
  /* a unit that comes with its host (an LHD's craft, vehicles and helicopters) is not listed: the host brings them */
  function hostBrings(u) { for (let h = u.aboard && sim.units.get(u.aboard); h; h = h.aboard && sim.units.get(h.aboard)) if (h.def.carry && h.def.carry.start) return true; return false; }
  function saveLayout() {
    const list = sim.list().filter(u => u.alive && !hostBrings(u)), idx = new Map();
    const out = [];
    for (const u of list.filter(u => !u.aboard)) { idx.set(u.id, out.length); out.push({ type: u.type, side: u.side, x: Math.round(u.pos[0]), z: Math.round(u.pos[2]), hdg: Math.round(u.hdg * 1000) / 1000 }); }
    for (const u of list.filter(u => u.aboard)) if (idx.has(u.aboard)) out.push({ type: u.type, side: u.side, on: idx.get(u.aboard) });
    try { localStorage.setItem(LKEY, JSON.stringify({ v: 1, map: map.id, saved: Date.now(), units: out })); toast(`LAYOUT SAVED · ${out.length} UNITS`); }
    catch (e) { toast('LAYOUT NOT SAVED', true); }
    render();
  }
  function clearAll() { const ids = units().map(u => u.id); if (ids.length) removeUnits(game, ids); sel.clear(); }
  function loadLayout() {
    const s = saved(); if (!s) { toast('NO LAYOUT SAVED FOR THIS MAP', true); return; }
    stopPlace(); clearAll();
    if (sim.tick !== freshTick) { fresh.clear(); freshTick = sim.tick; }
    const made = [];
    let n = 0;
    for (const e of s.units) {
      if (!UNITS[e.type]) { made.push(null); continue; }
      let u = null;
      if (e.on !== undefined) { const h = made[e.on]; if (h) u = spawnUnit(game, e.type, e.side, h.pos[0], h.pos[2], { aboard: h.id }); }
      else if (canPlace(game, e.type, e.x, e.z)) u = spawnUnit(game, e.type, e.side, e.x, e.z, { hdg: e.hdg });
      made.push(u);
      if (u) { n++; if (!u.aboard) fresh.add(u.id); }
    }
    game.dispatchEvents();
    toast(`LAYOUT LOADED · ${n} UNITS`);
    render();
  }

  /* ------------------------------------------------------------------ the panel */
  function tool(k) {
    if (k === 'save') saveLayout();
    else if (k === 'load') loadLayout();
    else if (k === 'clear') {
      const now = performance.now();
      if (now - clearArm < 2500) { clearArm = 0; stopPlace(); clearAll(); toast('MAP CLEARED'); }
      else { clearArm = now; setTimeout(render, 2600); }
    }
    else if (k === 'resume') leave();
    else if (k === 'del') removeSel();
    else if (k === 'turn') turnSel(TURN_KEY);
    else if (k === 'map-') stepMap(-1);
    else if (k === 'map+') stepMap(1);
    else if (k === 'go') goMap();
    render();
  }
  let MAPS = null;
  import('../world/maps.js').then(m => { MAPS = m.MAPS; if (on) render(); }).catch(() => { MAPS = null; });
  function stepMap(d) {
    if (!MAPS || !MAPS.length) return;
    const ids = MAPS.map(m => m.id), cur = ids.indexOf(mapPick || map.id);
    mapPick = ids[(cur + d + ids.length) % ids.length];
    if (mapPick === map.id) mapPick = null;
  }
  function goMap() {
    if (!mapPick) return;
    const Q = new URLSearchParams(location.search);
    for (const k of ['restore', 'cam', 'debrief', 'weather', 'seed']) Q.delete(k);
    Q.set('mode', 'sandbox'); Q.set('map', mapPick); Q.set('side', game.side); Q.set('fog', sim.fog ? '1' : '0');
    try { const k = 'oniks.setup.sandbox', v = JSON.parse(localStorage.getItem(k) || '{}') || {}; v.map = mapPick; localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ }
    location.href = 'play.html?' + Q.toString();
  }

  function render() {
    if (!on) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div'); el.className = 'oniks-sbx oniks-bld hit';
      el.addEventListener('mousedown', e => {
        const r = e.target.closest('[data-t]'), t = e.target.closest('[data-k]');
        if (r) { const [side, type] = r.dataset.t.split(':'); pick(side, type); }
        else if (t) tool(t.dataset.k);
        e.stopPropagation(); e.preventDefault();
      });
      el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
      game.uiRoot.appendChild(el);
    }
    el.style.display = '';
    const count = {};
    for (const u of sim.list()) if (u.alive) count[u.side + u.type] = (count[u.side + u.type] || 0) + 1;
    const row = (side, t) => {
      const on_ = place && place.type === t && place.side === side, n = count[side + t] || 0;
      return `<div class="r${on_ ? ' on' : ''}${side === game.side ? '' : ' en'}" data-t="${side}:${t}"><i></i><span>${nameOf(t)}</span><em>${n || ''}</em></div>`;
    };
    const s = saved(), nSel = [...sel].filter(id => sim.units.has(id)).length;
    const MA = MAPS && MAPS.find(m => m.id === (mapPick || map.id));
    const mapName = MA ? MA.name : (map.name || map.id);
    const armed = performance.now() - clearArm < 2500;
    el.innerHTML = `
      <div class="hd"><span class="kick"><i></i>Map builder</span><span class="st">Paused</span></div>
      <div class="cols">
        <div class="col"><div class="lbl">Coast${game.side === 'coast' ? ' · you' : ''}</div>${rosters.coast.map(t => row('coast', t)).join('')}</div>
        <div class="col"><div class="lbl">Fleet${game.side === 'fleet' ? ' · you' : ''}</div>${rosters.fleet.map(t => row('fleet', t)).join('')}</div>
      </div>
      <div class="now">${place ? `Placing <b class="${place.side === game.side ? 'lime' : 'coral'}">${nameOf(place.type)}</b> · click the map · wheel turns · right-click ends`
        : nSel ? `<b>${nSel}</b> selected · drag moves · wheel or R turns · Del removes` : 'Pick a unit, or click one on the map'}</div>
      <div class="tools">
        <div class="t${nSel ? '' : ' off'}" data-k="turn"><b>R</b><span>Turn 45°</span></div>
        <div class="t${nSel ? '' : ' off'}" data-k="del"><b>Del</b><span>Remove</span></div>
        <div class="t" data-k="save"><b class="nk"></b><span>Save layout</span></div>
        <div class="t${s ? '' : ' off'}" data-k="load"><b class="nk"></b><span>Load layout</span><em>${s ? s.units.length : ''}</em></div>
        <div class="t${armed ? ' arm' : ''}" data-k="clear"><b class="nk"></b><span>${armed ? 'Clear · again' : 'Clear map'}</span></div>
        <div class="t" data-k="resume"><b>F2</b><span>Resume</span></div>
      </div>
      <div class="mp"><span class="lbl">Map</span><span class="ar" data-k="map-">‹</span><span class="nm${mapPick ? ' pend' : ''}">${mapName}</span><span class="ar" data-k="map+">›</span>${mapPick ? '<span class="go" data-k="go">Load</span>' : ''}</div>`;
  }

  /* ------------------------------------------------------------------ the system */
  const sys = {
    name: 'editor', priority: PRI_EDITOR,
    get on() { return on; }, toggle, enter, leave,
    init() {
      game.bus.on('side', () => { if (on) render(); });
      // a unit gone by other means (the sandbox's delete, a load) leaves the selection
      game.bus.on('event', e => { if (e.type === 'removed' && sel.delete(e.unit) && on) render(); });
    },
    update() {
      if (!on) return;
      if (!game.paused) game.pause(true);        // time stands still while building
      if (game.result) leave();
    },
    onKey(e) {
      const k = e.code;
      if (k === 'F2') { if (e.type === 'keydown' && !e.repeat) toggle(); return true; }
      if (!on) return false;
      if (e.type !== 'keydown') return /^(Space|Equal|Minus|NumpadAdd|NumpadSubtract|Delete|Backspace|KeyR)$/.test(k);
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (k === 'Escape') {
        if (drag) { drag = null; return true; }
        if (place) { stopPlace(); return true; }
        if (sel.size) { sel.clear(); render(); return true; }
        leave(); return true;
      }
      if (k === 'Delete' || k === 'Backspace') { removeSel(); return true; }
      if (k === 'KeyR') {
        const a = e.shiftKey ? -TURN_KEY : TURN_KEY;
        if (drag && drag.live) { drag.rot = wrapA(drag.rot + a); dragCheck(); }
        else if (place) place.rot = wrapA(place.rot + a);
        else if (sel.size) turnSel(a);
        return true;
      }
      if (/^(Space|Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(k)) { toast('TIME STANDS STILL · F2 RESUMES'); return true; }
      return false;
    },
    onPointer(ev) {
      if (!on) return false;
      const b = ev.button;
      if (ev.type === 'wheel') {
        if (!place && !(drag && drag.live)) return false;           // the camera zooms
        const a = (ev.deltaY > 0 ? 1 : -1) * TURN;
        if (drag && drag.live) { drag.rot = wrapA(drag.rot + a); dragCheck(); } else place.rot = wrapA(place.rot + a);
        return true;
      }
      if (ev.type === 'move') {
        if (drag) {
          const w = ground(ev.x, ev.y);
          if (w) { drag.dx = w[0] - drag.gx; drag.dz = w[2] - drag.gz; }
          if (ev.drag > 5) drag.live = true;
          if (drag.live) dragCheck();
          return true;
        }
        if (box) { box.x1 = ev.x; box.y1 = ev.y; return true; }
        return false;
      }
      if (b === 2) {
        if (ev.type === 'click') { if (drag) drag = null; else if (place) stopPlace(); else if (sel.size) { sel.clear(); render(); } }
        return ev.type === 'click';                                   // the camera keeps right-drag
      }
      if (b !== 0) return false;
      if (ev.type === 'down') {
        if (place) return true;
        const u = pickAt(ev.x, ev.y);
        if (u) {
          if (ev.shift) { if (sel.has(u.id)) sel.delete(u.id); else sel.add(u.id); }
          else if (!sel.has(u.id)) { sel.clear(); sel.add(u.id); }
          const w = ground(ev.x, ev.y) || [u.pos[0], 0, u.pos[2]];
          if (sel.has(u.id)) startDrag(w[0], w[2]);
          render();
        } else box = { x0: ev.x, y0: ev.y, x1: ev.x, y1: ev.y, add: ev.shift };
        return true;
      }
      if (ev.type === 'up') {
        if (drag) { dropDrag(); render(); return true; }
        if (box) {
          const bx = box; box = null;
          if (Math.abs(bx.x1 - bx.x0) + Math.abs(bx.y1 - bx.y0) > 6) {
            if (!bx.add) sel.clear();
            const x0 = Math.min(bx.x0, bx.x1), x1 = Math.max(bx.x0, bx.x1), y0 = Math.min(bx.y0, bx.y1), y1 = Math.max(bx.y0, bx.y1);
            for (const u of units()) if (cam.project(posOf(u), q) && q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) sel.add(u.id);
          } else if (!bx.add) sel.clear();
          render();
        }
        return true;
      }
      if (ev.type === 'click') {
        if (place) { const w = ground(ev.x, ev.y); if (w) placeAt(w[0], w[2]); }
        return true;
      }
      return ev.type === 'dblclick';
    },

    draw3d() {
      if (!on) return;
      // units the picture hides (fog, or the other side's unseen) are ghosted so the whole setup is in view
      for (const u of units()) {
        if (game.drawn.has(u.id)) { ghosts.delete(u.id); continue; }
        let g = ghosts.get(u.id);
        if (!g) { g = { key: u.def.model, T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: {}, tint: 'own', alpha: .5 }; ghosts.set(u.id, g); }
        const p = game.unitPose(u);
        g.T[0] = p.pos[0]; g.T[1] = p.pos[1]; g.T[2] = p.pos[2]; g.hdg = p.hdg;
        g.tint = tintOf(u.side); g.st = u.def.modelState(u, sim.t);
        R.draw(g);
      }
      for (const id of ghosts.keys()) { const u = sim.units.get(id); if (!u || !u.alive) ghosts.delete(id); }
      let n = 0;
      const ghostAt = (type, side, x, z, hdg, ok) => {
        let g = phantom[n++];
        if (!g) { g = { key: '', T: [0, 0, 0], hdg: 0, pitch: 0, roll: 0, st: {}, tint: 'own', alpha: .5 }; phantom.push(g); }
        const d = UNITS[type];
        g.key = d.model; g.T[0] = x; g.T[1] = yAt(type, x, z); g.T[2] = z; g.hdg = hdg; g.st = {};
        g.tint = ok ? tintOf(side) : 'hostile'; g.alpha = ok ? .55 : .3;
        R.draw(g);
        const r = Math.max(d.size[0] * .7, cam.dist * .01);
        R.fx.ring(g.T, r, { rgb: ok ? (side === game.side ? LIME : CORAL) : CORAL, a: ok ? .8 : .95, step: ok ? 4 : 2, drape: d.domain !== 'air', lift: 1, mode: 'over' });
      };
      if (place && game.mouse.in) {
        const w = ground(game.mouse.x, game.mouse.y);
        if (w) ghostAt(place.type, place.side, w[0], w[2], wrapA(hdgFor(place.side, w[0], w[2]) + place.rot), canPlace(game, place.type, w[0], w[2]));
      }
      if (drag && drag.live) dragTargets((u, x, z, h) => { if (u) ghostAt(u.type, u.side, x, z, h, canPlace(game, u.type, x, z)); });
    },

    draw2d(ov) {
      if (!on) return;
      const ui = ov.ui, c = ov.ctx;
      // every unit: its side's mark; the selection bracketed; the hovered one named
      hover = 0;
      if (!place && !drag && game.mouse.in) { const u = pickAt(game.mouse.x, game.mouse.y); if (u) hover = u.id; }
      for (const u of units()) {
        if (!cam.project(posOf(u), q)) continue;
        const col = colOf(u.side), s = sel.has(u.id);
        ov.mark(q[0], q[1], s ? 9 : 6, col, s ? 1 : .85, !s);
        if (s || u.id === hover) {
          const d = instOf(u), bx = d ? R.screenBox(d) : null;
          ov.bracket(bx || [q[0] - 8, q[1] - 8, q[0] + 8, q[1] + 8], col, s ? 1 : .5);
          if (u.id === hover || sel.size === 1) {
            const at = bx ? [bx[2] + 10 * ui, bx[1] - 4 * ui] : [q[0] + 14 * ui, q[1] - 14 * ui];
            ov.tag(at[0], at[1], u.side === 'coast' ? 'C' : 'F', nameOf(u.type), u.def.domain === 'air' ? `ALT ${Math.round(u.pos[1])} M` : '', { kind: u.side === game.side ? 'lime' : 'coral', size: 10 });
          }
        }
      }
      // the box being dragged
      if (box && Math.abs(box.x1 - box.x0) + Math.abs(box.y1 - box.y0) > 6) ov.box([Math.min(box.x0, box.x1), Math.min(box.y0, box.y1), Math.max(box.x0, box.x1), Math.max(box.y0, box.y1)], '#C6F432', .9);
      // what the pointer is doing
      const mx = game.mouse.x + 18 * ui, my = game.mouse.y + 14 * ui;
      if (place && game.mouse.in) {
        const w = ground(game.mouse.x, game.mouse.y), ok = w && canPlace(game, place.type, w[0], w[2]);
        const d = UNITS[place.type];
        const val = !ok ? whyNot(place.type) : d.domain === 'air' ? `ALT ${d.altDef} M` : d.domain === 'sea' && w ? `DEPTH ${Math.max(0, Math.round(-map.h(w[0], w[2])))} M` : '';
        ov.tag(mx, my, place.side === 'coast' ? 'C' : 'F', 'Place ' + nameOf(place.type), val, { kind: ok ? (place.side === game.side ? 'lime' : 'coral') : 'coral', size: 10, valCol: ok ? 'rgba(255,255,255,.8)' : '#FF6A3D' });
      } else if (drag && drag.live) {
        const u = sim.units.get(drag.ids[0]);
        ov.tag(mx, my, drag.ids.length > 1 ? String(drag.ids.length) : (u && u.side === 'coast' ? 'C' : 'F'), drag.ok ? 'Move' : 'Refused', drag.ok ? `${Math.round(Math.hypot(drag.dx, drag.dz))} M · ${Math.round(((drag.rot * 180 / Math.PI) + 540) % 360 - 180)}°` : (u ? whyNot(u.type) : ''),
          { kind: drag.ok ? 'lime' : 'coral', size: 10 });
        // dotted leaders from where they stand to where they go
        dragTargets((v, x, z) => {
          if (!v || !cam.project(posOf(v), q)) return;
          const ax = q[0], ay = q[1];
          if (cam.project([x, yAt(v.type, x, z), z], q)) ov.dline(ax, ay, q[0], q[1], 4 * ui, 1.5, drag.ok ? '#C6F432' : '#FF6A3D', .8);
        });
      }
      // the builder's banner, top centre
      const W = cam.W;
      ov.tag(W / 2, 22 * ui, 'F2', 'Map builder', 'Time stopped', { kind: 'lime', size: 11, align: 'center', fit: false });
      c.globalAlpha = 1;
    },
  };
  return sys;
}

function addStyle() {
  if (document.getElementById('oniks-bld-css')) return;
  const s = document.createElement('style'); s.id = 'oniks-bld-css';
  s.textContent = `
  .oniks-bld { width: 400px; }
  .oniks-bld .hd { display: flex; align-items: center; justify-content: space-between; }
  .oniks-bld .hd .st { color: var(--lime); }
  .oniks-bld .r { gap: 8px; padding: 3px 0; }
  .oniks-bld .r i { width: 6px; height: 6px; background: var(--lime); flex: none; opacity: .75; }
  .oniks-bld .r.en i { background: var(--coral); }
  .oniks-bld .r em { margin-left: auto; font-style: normal; color: var(--faint); }
  .oniks-bld .r.on { color: var(--lime); }
  .oniks-bld .r.on.en { color: var(--coral); }
  .oniks-bld .r.on i { opacity: 1; box-shadow: 0 0 0 2px rgba(198,244,50,.25); }
  .oniks-bld .r.on.en i { box-shadow: 0 0 0 2px rgba(255,106,61,.25); }
  .oniks-bld .now { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hair); line-height: 1.5; text-transform: none; letter-spacing: .02em; color: var(--dim); white-space: normal; }
  .oniks-bld .now b { font-weight: 500; color: #fff; background: none; padding: 0; min-width: 0; }
  .oniks-bld .now b.lime { color: var(--lime); } .oniks-bld .now b.coral { color: var(--coral); }
  .oniks-bld b.nk { min-width: 0; width: 6px; height: 6px; padding: 0; margin: 0 6px; background: rgba(255,255,255,.5); }
  .oniks-bld .t.off { opacity: .35; pointer-events: none; }
  .oniks-bld .t.arm span { color: var(--coral); }
  .oniks-bld .t em { font-style: normal; color: var(--faint); margin-left: auto; }
  .oniks-bld .mp { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--hair); white-space: nowrap; }
  .oniks-bld .mp .lbl { margin: 0 6px 0 0; }
  .oniks-bld .mp .ar { cursor: pointer; color: rgba(255,255,255,.78); padding: 0 3px; }
  .oniks-bld .mp .ar:hover { color: #fff; }
  .oniks-bld .mp .nm { color: #fff; border-bottom: 1px dotted rgba(255,255,255,.5); padding-bottom: 2px; }
  .oniks-bld .mp .nm.pend { color: var(--lime); border-color: var(--lime); }
  .oniks-bld .mp .go { margin-left: auto; cursor: pointer; background: var(--lime); color: #0B0C0A; padding: 3px 6px 2px; font-weight: 500; }`;
  document.head.appendChild(s);
}
