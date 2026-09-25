/* Save and Continue: one slot, localStorage 'oniks.save'.

   A match is its record (record.js: the setup and every command at its tick; the sim is deterministic), so a save is
   that record, the tick it was made at and the state hash there, with what the player's view needs to come back the
   same (the camera, the time rate, the side in command, the groups and the selection):
     slot = { v: 1, mode, map, mapName, side, ai, tick, hash, t, tl: 'T+34:12', rate, cam: { target, dist, yaw, pitch },
              groups, sel, startCount, saved (ms), url (play.html's query to continue), rec, lean?, stale? }
   Save: the pause menu's Save row (match.js) calls game.save.save(). Combat and Sandbox; a campaign mission is not
   saved (its scripts change units directly: the recorder marks it unsupported), nor a match that is over.
   Continue: the setup screen's Continue row (ui/shell/screens/setup.js) opens slot.url (the record's setup, restore=1,
   cam=). This system is registered first among the game's own (main.js), so before any other system exists it plays
   the record into the live sim up to the saved tick, headless, on the loading screen (RESTORING · T+12:40, the clock
   running up to the save), checks every recorded hash on the way and the saved one at the end, and hands the record
   to the recorder (game.restored: the match keeps recording into it, the Debrief and the next save cover all of it).
   Then the side, the groups, the selection and the rate are put back once every system is up, and the camera where it
   was on the first frame. A hash that differs (the code changed since the save) refuses cleanly: the loading screen
   says so and goes no further (Esc: the menu), and the slot is marked stale (the Continue row then says Outdated).

   game.save = { save() -> { ok, slot | why }, slot() -> the slot (without its record), available(), restored } */
import { playTo, urlOf } from './record.js';
import { createLoading, nextPaint } from '../ui/loading/index.js';

export const SLOT = 'oniks.save';
const RATES = [1, 2, 4, 8, 16, 32];
const R2D = 180 / Math.PI;

export const fmtT = t => {
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};
export function readSlot() {
  try { const s = JSON.parse(localStorage.getItem(SLOT) || 'null'); return s && s.v === 1 && s.rec && s.rec.setup ? s : null; } catch (e) { return null; }
}
/* the slot's summary (what the menus show), without parsing the record twice */
const brief = s => s ? { mode: s.mode, map: s.map, mapName: s.mapName, side: s.side, ai: s.ai, t: s.t, tl: s.tl, tick: s.tick, saved: s.saved, stale: s.stale || null, lean: !!s.lean } : null;

export async function createSave(game) {
  const Q = new URLSearchParams(location.search);
  if (Q.get('debrief')) return null;                 // the Debrief's own page: its sim is the record's
  const sim = game.sim;
  let slot0 = readSlot();                            // the slot as it was when the page opened
  let restored = null;
  if (Q.get('restore') === '1') {
    restored = await restore(game, slot0);
    if (!restored) await new Promise(() => {});      // refused: the loading screen says why; the match never starts
  }

  const available = () => {
    const D = game.debrief;
    return !!(D && D.recorder && D.rec && D.rec.supported && D.recorder.on) && (game.mode === 'combat' || game.mode === 'sandbox') && !game.result;
  };
  function save() {
    const D = game.debrief;
    if (!available()) return { ok: false, why: game.result ? 'The battle is over' : game.mode === 'campaign' ? 'Campaign missions are not saved' : 'Not recorded' };
    const m = D.recorder.mark();                     // the sandbox's switches synced, [tick, hash] now
    if (!m) return { ok: false, why: 'Not recorded' };
    const c = game.camera, rec = D.rec;
    const groups = {};
    for (const n in game.groups || {}) if (game.groups[n] && game.groups[n].length) groups[n] = game.groups[n].slice();
    const cam = { target: c.target.slice(), dist: c.dist, yaw: c.yaw, pitch: c.pitch };
    const slot = {
      v: 1, mode: game.mode, map: game.map.id, mapName: game.map.name || game.map.id.replace(/_/g, ' '), side: game.side,
      ai: rec.setup.ai, tick: m[0], hash: m[1], t: sim.t, tl: 'T+' + fmtT(sim.t),
      rate: RATES.includes(game.timeRate) ? game.timeRate : 1, cam, groups, sel: [...game.selection],
      startCount: game.startCount, saved: Date.now(),
      url: 'play.html?' + urlOf(rec, { restore: 1, cam: [cam.target[0], cam.target[2], cam.dist, cam.yaw * R2D, cam.pitch * R2D].map(v => Math.round(v * 100) / 100).join(',') }),
      rec,
    };
    let s = JSON.stringify(slot);
    try { localStorage.setItem(SLOT, s); }
    catch (e) {
      // over the storage quota: the commands alone (enough to continue; the Debrief then has the timeline from here on)
      slot.rec = Object.assign({}, rec, { events: [], tracks: {} }); slot.lean = true;
      try { s = JSON.stringify(slot); localStorage.setItem(SLOT, s); }
      catch (e2) { return { ok: false, why: 'Storage full' }; }
    }
    slot0 = slot;
    console.log(`save: ${slot.mapName} · ${slot.side} · ${slot.tl} (tick ${slot.tick}, hash ${slot.hash}) · ${rec.ops.length} commands · ${Math.round(s.length / 1024)} KB${slot.lean ? ' (lean)' : ''}`);
    return { ok: true, slot: brief(slot) };
  }

  /* after a restore: the player's view as it was (once every system is up), the camera on the first frame */
  let camDone = !restored, toastAt = restored ? 1.4 : -1;
  if (restored) {
    const S = restored.slot;
    game.bus.on('ready', () => {
      if (S.side && S.side !== game.side && game.setSide) game.setSide(S.side);
      if (S.startCount) game.startCount = S.startCount;
      const alive = id => { const u = sim.units.get(id); return !!(u && u.alive && u.side === game.side); };
      for (const n in S.groups || {}) {
        const ids = S.groups[n].filter(alive);
        if (ids.length) { game.groups[n] = ids; game.bus.emit('group', { n: +n, ids }); }
      }
      const sel = (S.sel || []).filter(id => sim.units.has(id));
      if (sel.length) game.select(sel);
      if (S.rate && S.rate !== game.timeRate) game.setRate(S.rate);
      if (restored.weather) game.bus.emit('weather', game.weather);
    });
  }

  const api = game.save = {
    save, available, get restored() { return restored ? brief(restored.slot) : null; },
    slot: () => brief(slot0 || readSlot()),
  };
  return {
    name: 'save', priority: 0,
    update() {
      if (!camDone) {
        camDone = true;
        const C = restored.slot.cam, cam = game.camera;
        if (C && C.target) { cam.followFn = null; cam.set({ target: C.target, dist: C.dist, yaw: C.yaw, pitch: C.pitch }); }
      }
      if (toastAt >= 0 && game.realT >= toastAt) {
        toastAt = -1;
        game.bus.emit('toast', { text: `RESTORED · ${restored.slot.tl} · STATE MATCHES` });
      }
    },
    dispose() { if (game.save === api) delete game.save; },
  };
}

/* ------------------------------------------------------------------ Continue: the record played to the saved tick */
async function restore(game, slot) {
  const L = createLoading(document.getElementById('boot'));   // main.js's loading screen (the same one)
  const sim = game.sim;
  if (!slot) return refuse(L, game, null, 'There is no saved battle');
  const S = slot.rec.setup;
  if (S.mode !== game.mode || S.map !== game.map.id || (S.seed >>> 0) !== (sim.seed >>> 0) || S.side !== (game.params && game.params.side))
    return refuse(L, game, slot, 'The save is for another battle');
  if (sim.tick !== 0) return refuse(L, game, slot, 'The match had already started');
  const t0 = performance.now();
  const P = playTo(slot.rec, sim, slot.tick, [[slot.tick, slot.hash]]);
  L.step('Restoring', 'T+' + fmtT(0));
  await L.paint();
  // slices of ~45 ms between paints (the whole thing at once in a hidden tab: its timers are throttled)
  let r;
  for (;;) {
    r = P.run(document.hidden ? 1e9 : 45);
    if (r.done) break;
    L.step('Restoring', 'T+' + fmtT(sim.t));
    await nextPaint(20);
  }
  const ms = Math.round(performance.now() - t0);
  if (r.bad || sim.tick !== slot.tick) {
    const b = r.bad || { tick: sim.tick, want: slot.hash, got: sim.hash() };
    console.warn(`save: refused · the state at tick ${b.tick} (T+${fmtT(b.tick * game.DT)}) is ${b.got}, the save says ${b.want} · the code has changed since it was saved`);
    return refuse(L, game, slot, 'The save no longer matches this version', `T+${fmtT(b.tick * game.DT)} · hash ${b.got} · saved ${b.want}`, true);
  }
  // the weather the sandbox had switched to (the sim's own is the record's; the picture follows it)
  const w = sim.weather;
  let wx = false;
  if (w && game.weather && (w.kind !== game.weather.kind || w.sea !== game.weather.sea)) {
    game.weather = { kind: w.kind, wind: w.wind.slice(), sea: w.sea };
    game.R.terrain.setWeather({ wind: game.weather.wind, sea: game.weather.sea });
    wx = true;
  }
  game.restored = { rec: slot.rec, tick: slot.tick, slot, weather: wx };
  L.step('Restored', slot.tl);
  if (!document.hidden) await new Promise(res => setTimeout(res, 280));   // the arrival at the saved time, readable
  console.log(`save: restored ${slot.mapName} · ${slot.side} · ${slot.tl} · ${slot.tick} ticks re-simulated in ${ms} ms · ${slot.rec.hashes.length + 1} hashes match · ${slot.rec.ops.length} commands`);
  return game.restored;
}

/* the loading screen stops with the reason (coral), a line of detail and the way back; a save that can never be
   restored again is marked stale */
function refuse(L, game, slot, why, detail, stale) {
  if (slot && stale) {
    try { slot.stale = { why, detail: detail || '', at: Date.now() }; localStorage.setItem(SLOT, JSON.stringify(slot)); } catch (e) { /* */ }
  }
  L.fail(why);
  const mode = game.mode === 'sandbox' ? 'sandbox' : 'combat';
  const mid = L.el.querySelector('.ld-mid');
  if (mid) {
    const d = document.createElement('div');
    d.className = 'ld-why';
    d.style.cssText = 'font: 400 calc(11px * var(--ls)) / 1.6 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--faint, rgba(255,255,255,.38)); text-align: center; white-space: nowrap;';
    d.innerHTML = (detail ? `<div>${detail}</div>` : '') + `<div style="margin-top: calc(14px * var(--ls)); color: var(--dim, rgba(255,255,255,.6)); cursor: pointer;"><b style="color: #fff; font-weight: 500; margin-right: .8em;">Esc</b>Menu</div>`;
    mid.appendChild(d);
    const back = () => { location.href = 'index.html#' + mode; };
    d.lastChild.addEventListener('click', back);
    addEventListener('keydown', e => { if (e.code === 'Escape' || e.code === 'Enter') back(); });
  }
  return null;
}
