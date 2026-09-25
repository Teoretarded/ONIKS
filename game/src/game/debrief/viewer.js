/* Debrief: the replay viewer (play.html?...&debrief=view[&dbt=<tick>]). The recorded match from the start (or from a
   tick), the camera free, the time rate the viewer's, and a scrub bar in the films' style along the bottom: the match
   from T+00:00 to its end, a tick for every heavy launch (yours lime, the enemy's coral) and every kill (white), the
   lime head where the replay is.

   Going forward (the bar, L) runs the sim ahead (every event on the way, the sound off); going back (the bar, J) builds
   the match again up to that tick (the frame reloads: the sim only runs forward). The recorded commands are the only
   ones: anything given here is held back.

   Keys: Space pause · + / - rate (x0.25 to x64) · J / L 30 s back / on · C the cinematic camera · H the bar · F8 a
   still · V the film (the debrief) from here · Esc back to the end screen. The camera: the game's (WASD, wheel, drag). */
import * as DR from './draw.js';
import { fmtRate } from '../filmmaker/path.js';

const RATES = [.25, .5, 1, 2, 4, 8, 16, 32, 64];
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const MONO = "'Geist Mono', 'DM Mono', Consolas, monospace";

/* K: the player's shared pieces { game, sim, rec, DT, advance(tgt, ms), setAlpha(), F, mute(on), close(), noInset(),
   plan, T(tick), reloadAt(tick, role) } */
export function createViewer(K) {
  const { game, sim, rec, DT, F } = K;
  const cam = game.camera;
  const V = { rate: 4, paused: false, seek: -1, bar: true, hover: -1, t0: 0, msg: '', msgT: 0 };
  const endTick = Math.max(K.plan.tEnd, ...(rec.hashes.length ? [rec.hashes[rec.hashes.length - 1][0]] : [0])) + Math.round(20 / DT);
  const marks = [];
  const PROJ = game.PROJ;
  for (const e of rec.events || []) {
    if (e.k === 'launch' && PROJ[e.kind] && PROJ[e.kind].threat) marks.push({ tick: e.tick, kind: 'launch', own: e.side === game.side });
    else if (e.k === 'dest') marks.push({ tick: e.tick, kind: 'kill', own: e.side === game.side });
  }
  const say = m => { V.msg = m; V.msgT = game.realT; };

  function setup(startTick) {
    game.autoSlow = false;
    cam.keys = true; cam.edge = true;
    V.rate = 4;
    K.mute(true);
    K.advance(startTick * DT);
    F.simT = sim.t; K.setAlpha();
    K.mute(false);
    say(startTick > 0 ? 'Replay · from ' + K.T(startTick) : 'Replay');
  }

  function frame(dt) {
    let rate = V.paused ? 0 : V.rate;
    if (V.seek >= 0) {
      // ahead to the tick: as fast as the frame allows
      if (sim.tick >= V.seek) { V.seek = -1; K.mute(false); }
      else { K.mute(true); K.advance(V.seek * DT, 12); F.simT = sim.t; K.setAlpha(); game.timeRate = 64; return; }
    }
    // the hit replay (the game's own, when it takes a hit) sets the rate while it plays
    if (game.replay && game.replay.active) rate = game.timeRate;
    F.simT = Math.max(F.simT, sim.t - DT) + rate * dt;
    K.advance(F.simT, 30);
    if (sim.t < F.simT - DT) F.simT = sim.t;
    K.setAlpha();
    if (!(game.replay && game.replay.active)) game.timeRate = Math.max(.05, rate || .05);
    if (sim.tick >= endTick && !V.paused) { V.paused = true; say('The end of the record'); }
  }
  function go(tick) {
    tick = Math.max(0, Math.min(endTick, Math.round(tick)));
    if (tick >= sim.tick) { V.seek = tick; say('→ ' + K.T(tick)); }
    else K.reloadAt(tick, 'view');
  }

  /* ------------------------------------------------------------------ the bar */
  function barRect(ov) {
    const s = DR.scaleOf(ov);
    return { x0: 56 * s, x1: ov.W - 56 * s, y: ov.H - 44 * s, h: 22 * s, s };
  }
  function draw2d(ov) {
    const ctx = ov.ctx, W = ov.W, H = ov.H, s = DR.scaleOf(ov);
    // the readout: the clock and the rate
    const r = V.seek >= 0 ? 'x64' : V.paused ? 'Paused' : fmtRate(game.replay && game.replay.active ? game.timeRate : V.rate);
    DR.readout(ov, [['Replay', '#fff'], [K.T(sim.tick), '#fff'], [r, r === 'x1' || r === 'Paused' ? '#fff' : '#C6F432']], 1, 1 - .8 * (game.orbital ? game.orbital.k : 0));
    if (V.msg && game.realT - V.msgT < 2.4) DR.note(ov, V.msg);
    if (!V.bar) return;
    const B = barRect(ov);
    ctx.save();
    const g = ctx.createLinearGradient(0, H, 0, H - 120 * s);
    g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 120 * s, W, 120 * s);
    const X = t => B.x0 + (B.x1 - B.x0) * sat(t / endTick);
    // the line, the part played in lime
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(B.x0, Math.round(B.y), B.x1 - B.x0, 1);
    ctx.fillStyle = '#C6F432'; ctx.fillRect(B.x0, Math.round(B.y), X(sim.tick) - B.x0, 1);
    for (const m of marks) {
      const x = Math.round(X(m.tick)) + .5;
      ctx.fillStyle = m.kind === 'kill' ? 'rgba(255,255,255,.75)' : m.own ? 'rgba(198,244,50,.8)' : 'rgba(255,106,61,.8)';
      const hh = m.kind === 'kill' ? 11 * s : 6 * s;
      ctx.fillRect(x - .5, Math.round(B.y - hh), 1, hh);
    }
    // the head, the hover time, the ends
    ctx.fillStyle = '#C6F432'; ctx.fillRect(Math.round(X(sim.tick)) - 1, Math.round(B.y - 7 * s), 3, Math.round(14 * s));
    ctx.font = `400 ${11.5 * s}px ${MONO}`; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (.6 * s) + 'px';
    ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.textAlign = 'left';
    ctx.fillText('T+00:00', B.x0, B.y + 20 * s);
    ctx.textAlign = 'right'; ctx.fillText(K.T(endTick), B.x1, B.y + 20 * s);
    if (V.hover >= 0) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(K.T(V.hover), X(V.hover), B.y - 16 * s);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(Math.round(X(V.hover)), Math.round(B.y - 5 * s), 1, Math.round(10 * s));
    }
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.fillText('SPACE PAUSE  ·  + − RATE  ·  J L 30 S  ·  C CINEMATIC  ·  V FILM  ·  ESC BACK', W / 2, B.y + 20 * s);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.restore();
  }
  function onPointer(ev) {
    const ov = game.overlay; if (!ov || !V.bar) return false;
    // pointer and overlay are both CSS px
    const B = barRect(ov), x = ev.x, y = ev.y;
    const on = y > B.y - 24 * B.s && y < B.y + 12 * B.s && x >= B.x0 - 6 && x <= B.x1 + 6;
    V.hover = on ? endTick * sat((x - B.x0) / (B.x1 - B.x0)) : -1;
    if (!on) return false;
    if (ev.type === 'down' && ev.button === 0) { go(V.hover); return true; }
    return ev.type !== 'move';
  }
  function onKey(e) {
    if (e.type !== 'keydown') return false;
    const k = e.code;
    if (k === 'Space') { if (!e.repeat) { V.paused = !V.paused; say(V.paused ? 'Paused' : fmtRate(V.rate)); } return true; }
    if (k === 'Equal' || k === 'NumpadAdd' || k === 'Minus' || k === 'NumpadSubtract') {
      const i = RATES.indexOf(V.rate), d = k === 'Equal' || k === 'NumpadAdd' ? 1 : -1;
      V.rate = RATES[Math.max(0, Math.min(RATES.length - 1, (i < 0 ? 4 : i) + d))]; V.paused = false; say(fmtRate(V.rate));
      return true;
    }
    if (k === 'KeyJ') { go(sim.tick - Math.round(30 / DT)); return true; }
    if (k === 'KeyL') { go(sim.tick + Math.round(30 / DT)); return true; }
    if (k === 'KeyH') { V.bar = !V.bar; return true; }
    if (k === 'KeyV') { K.reloadAt(Math.max(0, sim.tick), 'film'); return true; }
    if (k === 'Escape') { K.close(); return true; }
    // the camera and the cinematic director keep their keys; everything else would command the match: held
    if (/^(Key[WASDQEC]|Arrow|Page)/.test(k)) return false;
    if (k === 'F8' || k === 'F1') return false;
    return true;
  }
  return { setup, frame, draw2d, onPointer, onKey, V };
}
