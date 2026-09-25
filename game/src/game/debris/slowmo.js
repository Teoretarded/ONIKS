/* Bullet time for a break-up: a spectacular one close to the camera (or a heavy round's, from farther off) eases the
   game down to x0.25 at once, holds while the modules come apart, and eases back to the rate it was (the films'
   freeze on the kill). The rate is on screen (the HUD reads it: 'x0.25 · bullet time').

   It keeps to the hit replay's rules (game/replay.js): only with the Hit replay setting on, never while a replay, the
   Inspect view, a film-maker take or the end of the match has the picture, not while paused, with a cooldown, and
   never against a rate the player has just chosen. A replay that starts meanwhile takes over: game.bulletTime.take()
   hands it the rate to return to.

   createBulletTime(game) -> { want(b) -> bool, update(dtReal), active, stop(restore) }; game.bulletTime. */
import { ss, sat } from './math.js';

const RATE = .25;
const IN = .22, HOLD = 1.9, OUT = .75;         // real s
const COOL = 22, AFTER_REPLAY = 6, USER = 3;   // real s

export function createBulletTime(game) {
  const bus = game.bus;
  let S = null, next = 0, lastUser = -1e9, replayEnd = -1e9;
  const busy = () => game.paused || game.result || (game.replay && game.replay.active) || (game.inspect && game.inspect.active) ||
    (game.film && game.film.playing) || game.timeRate <= RATE + .01;
  bus.on('rate', d => {
    if (!d || d.why === 'replay' || d.why === 'bullet') return;
    if (d.why === 'user') {
      lastUser = game.realT;
      if (S) S = null;              // the player's own rate stands
      return;
    }
    // the game's own drop (auto x1 on a launch): the bullet time goes back to that
    if (S && (d.why === 'auto' || d.why === 'end')) S.rate0 = Math.min(S.rate0, d.rate);
  });
  bus.on('replay', d => { if (d && d.on) S = null; else replayEnd = game.realT; });
  const set = r => { game.timeRate = r; };

  const api = {
    force: false,              // debugging: bullet time whatever the Hit replay setting says
    get active() { return !!S; },
    /* a break-up worth it? b: { heavy, px (its size on screen), onScreen, dist } */
    want(b) {
      const auto = api.force || (game.replay ? game.replay.auto : !(game.settings && game.settings.hitReplay === false));
      if (!auto || S || busy()) return false;
      const now = game.realT;
      if (now < next || now - replayEnd < AFTER_REPLAY || now - lastUser < USER) return false;
      if (!b.onScreen) return false;
      if (!(b.px >= 26 || (b.heavy && b.px >= 9 && b.dist < 7000))) return false;
      S = { t: 0, rate0: game.timeRate, from: game.timeRate };
      next = now + COOL;
      bus.emit('rate', { rate: RATE, paused: false, why: 'bullet' });
      bus.emit('bullet', { on: true, b });
      return true;
    },
    /* a replay starting now takes the rate to hand back */
    take() { const s = S; S = null; return s ? { rate0: s.rate0 } : null; },
    stop(restore) { if (!S) return; if (restore) set(S.rate0); S = null; bus.emit('bullet', { on: false }); },
    update(dt) {
      if (!S) return;
      if (game.paused) return;
      S.t += dt;
      const t = S.t;
      if (t < IN) set(S.from + (RATE - S.from) * ss(0, 1, t / IN));
      else if (t < IN + HOLD) set(RATE);
      else if (t < IN + HOLD + OUT) set(RATE + (S.rate0 - RATE) * ss(0, 1, sat((t - IN - HOLD) / OUT)));
      else {
        set(S.rate0); S = null;
        bus.emit('rate', { rate: game.timeRate, paused: false, why: 'bullet' });
        bus.emit('bullet', { on: false });
      }
    },
  };
  game.bulletTime = api;
  return api;
}
