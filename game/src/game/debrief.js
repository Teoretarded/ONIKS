/* Debrief: the match, recorded, played back as one film.

   In a match (play.html as the menus open it) this system records the match (record.js: the setup, every command at
   its tick, a timeline of launches, hits and kills, the tracks of every round) and, at the end, offers the Debrief on
   the end screen (match.js: the Debrief row, D). The Debrief opens the same page in a frame over the end block with
   ?debrief=film: a second game, built from the record's setup, whose sim is fed the recorded commands at their ticks
   (the determinism the sim is built on: it plays the same battle again). There the film maker of the debrief
   (debrief/player.js) picks the match's moments (debrief/plan.js) and films them as one continuous take: the first
   salvo from the side, the chase, the decisive hit with its X-ray moment (the hit replay's own), the sinking, and a
   climb into the Orbital map with the track of every round fired; between moments far apart in time the camera climbs
   into the Orbital map while the sim runs ahead (the rate on screen), and comes down on the next one. Esc ends it;
   the frame fades and the end screen is there as it was. F8 a still, Shift F8 the film as a PNG sequence.

   While the frame is up the match under it stops drawing (its game.frame is held) and its sound is muted.

   Console (the match page): ONIKS.debrief = { rec, check(o) -> report, open(), close(), json(), available() }
     check(): a headless second Sim from the setup, the commands at their ticks, every 30 s hash compared (and the
              state now): { ok, checked, first, ms, ticks }.
   The record is also kept in localStorage 'oniks.lastRecord' when the debrief opens (play.html?...&debrief=last plays
   it without a match behind it). */
import { createRecorder, verify, urlOf } from './record.js';

const PRI_DEBRIEF = 127;           // above the film maker (125): Shift F8 is the debrief's while it plays
const STORE = 'oniks.lastRecord';

export async function createDebrief(game, ctx) {
  const Q = new URLSearchParams(location.search);
  const role = Q.get('debrief');
  if (role) {
    const mod = await import('./debrief/player.js');
    return mod.createPlayer(game, ctx, role);
  }
  return createHost(game);
}

/* ------------------------------------------------------------------ the match page: recorder and host */
function createHost(game) {
  const R0 = createRecorder(game);
  const rec = R0.rec;
  let frame = null, held = false, closing = false, fadeT = 0;
  const f0 = game.frame;
  game.frame = function (dt) { if (held) return; return f0.call(this, dt); };

  function available() { return rec.supported && game.mode === 'combat' && !!game.result; }
  function json() { return JSON.stringify(rec); }
  function keep() {
    try { localStorage.setItem(STORE, json()); return true; } catch (e) { return false; }
  }
  function check(o) {
    R0.mark();
    const r = verify(rec, game.map, o || {});
    delete r.sim;
    const txt = `debrief check: ${r.ok ? 'OK' : 'MISMATCH'} · ${r.checked} hashes over ${r.ticks} ticks (${(r.ticks * game.DT / 60).toFixed(1)} min) in ${r.ms} ms` +
      (r.first ? ` · first at tick ${r.first.tick}: want ${r.first.want} got ${r.first.got}` : '') + ` · ${rec.ops.length} commands`;
    (r.ok ? console.log : console.warn)(txt);
    return r;
  }
  const audio = () => game.getSystem('audio');
  function mute(on) { const a = audio(); if (a && a.mute) try { a.mute(on); } catch (e) { /* */ } }

  function open(kind) {
    if (frame || !rec.supported) return false;
    R0.mark();
    keep();
    const url = 'play.html?' + urlOf(rec, { debrief: kind || 'film', ui: 0 });
    frame = document.createElement('iframe');
    frame.className = 'oniks-debrief';
    frame.setAttribute('allow', 'autoplay');
    frame.src = url;
    addStyle();
    document.body.appendChild(frame);
    void frame.offsetWidth;                  // laid out at opacity 0 first: the fade in runs
    frame.classList.add('on');
    held = true; closing = false;
    mute(true);
    frame.addEventListener('load', () => { try { frame.contentWindow.focus(); } catch (e) { /* */ } });
    game.bus.emit('debrief', { on: true });
    return true;
  }
  function close() {
    if (!frame || closing) return;
    closing = true;
    const f = frame;
    held = false;
    f.classList.remove('on');
    mute(false);
    clearTimeout(fadeT);
    fadeT = setTimeout(() => { f.remove(); if (frame === f) frame = null; closing = false; try { window.focus(); } catch (e) { /* */ } }, 700);
    game.bus.emit('debrief', { on: false });
  }

  const api = game.debrief = {
    get rec() { return rec; }, recorder: R0, available, check, open, close, json, keep,
    get open_() { return !!frame; },
  };
  const sys = {
    name: 'debrief', priority: PRI_DEBRIEF,
    init() {
      // window.ONIKS is made once the loop runs
      const iv = setInterval(() => { if (window.ONIKS) { window.ONIKS.debrief = api; clearInterval(iv); } }, 150);
    },
    /* the frame has the keys; any that reach the match meanwhile are its too (Esc closes it) */
    onKey(e) {
      if (!frame) return false;
      if (e.type === 'keydown' && e.code === 'Escape') close();
      return true;
    },
    onPointer() { return !!frame; },
    dispose() { game.frame = f0; R0.dispose(); if (frame) frame.remove(); },
  };
  return sys;
}

function addStyle() {
  if (document.getElementById('oniks-debrief-css')) return;
  const s = document.createElement('style'); s.id = 'oniks-debrief-css';
  s.textContent = `
  iframe.oniks-debrief { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; border: 0; z-index: 60; background: #0B0C0A; opacity: 0; transition: opacity .6s ease; }
  iframe.oniks-debrief.on { opacity: 1; }`;
  document.head.appendChild(s);
}
