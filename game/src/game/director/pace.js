/* Pace: the smooth time-rate hook for bullet time (presentation only: the sim steps at its fixed DT whatever the rate).

   A session (B on selected rounds: slow x0.1; the cinematic's automatic moments: x0.25) is fed, every frame, the game
   seconds to the next predicted event (game/director/predict.js: an interceptor's closest approach, a gun burst, an
   impact). The rate law ahead of it: r = clamp(tEv / tau, slow, base), so the time left shrinks exponentially in real
   time and the rate with it; the ease starts base x tau game seconds ahead (x1: ~1.8 s; x4: 4 s) and the last tau
   real seconds before the moment run at the slow rate. At the event (mark()) the slow rate holds (the burst, the
   break-up), then eases back up (smoothstep in log rate over `up` real s). Every target goes through a critically
   damped spring on the log of the rate (exact solution: frame-rate independent), so the rate never steps.

   The player's own rate ([ / ], Space) ends a session where it is; the game's own drop to x1 lowers the base; the hit
   replay suspends it (it resumes from whatever rate the replay hands back).

   createPace(game) -> game.pace = { start(owner, o), stop(restore), feed(tEv), mark(), finish(), update(dtReal),
     active, owner, base, slow } */
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sm = u => { u = sat(u); return u * u * (3 - 2 * u); };
const W = 4.2;                       // 1/s: the log-rate spring

export function createPace(game) {
  const bus = game.bus;
  let S = null;
  const api = {
    get active() { return !!S; },
    get owner() { return S ? S.owner : ''; },
    get base() { return S ? S.base : game.timeRate; },
    get slow() { return S ? S.slow : 1; },
    get holding() { return !!S && game.realT < S.holdEnd; },
    /* o: { slow, hold (real s), up (real s), keep (the session stays after its last event until stop / finish) } */
    start(owner, o) {
      o = o || {};
      if (game.bulletTime && game.bulletTime.active) game.bulletTime.take();
      const r = game.paused ? 1 : game.timeRate;
      const base = S ? S.base : Math.max(1, r);
      if (game.paused) game.paused = false;
      S = { owner, base, slow: o.slow || .1, hold: o.hold || 2.2, up: o.up || 1.6, keep: !!o.keep, L: Math.log(Math.max(.01, game.timeRate)), V: 0,
        tEv: Infinity, holdEnd: -1e9, ending: false, susp: false, fed: false };
      bus.emit('rate', { rate: game.timeRate, paused: false, why: 'bullet' });
      bus.emit('bullet', { on: true, owner });
      return api;
    },
    stop(restore) {
      if (!S) return;
      const b = S.base; S = null;
      if (restore) game.timeRate = b;
      bus.emit('rate', { rate: game.timeRate, paused: game.paused, why: 'bullet' });
      bus.emit('bullet', { on: false });
    },
    /* the game seconds to the next event this frame (Infinity: none); floor: the lowest rate it is worth (a gun burst on
       its way: x0.3; the hit itself then holds the slow rate) */
    feed(t, floor) { if (S) { if (t < S.tEv) { S.tEv = t; S.floor = floor || 0; } S.fed = true; } },
    /* the event is now: hold the slow rate */
    mark(hold) { if (S) S.holdEnd = Math.max(S.holdEnd, game.realT + (hold || S.hold)); },
    /* nothing more to wait for: back up to the base rate, then the session ends */
    finish() { if (S) S.ending = true; },
    update(dt) {
      if (!S) return;
      const tEv = S.fed ? S.tEv : Infinity, floor = Math.max(S.slow, S.floor || 0);
      S.tEv = Infinity; S.fed = false; S.floor = 0;
      if (game.paused || dt <= 0) return;
      if (game.replay && game.replay.active) { S.susp = true; return; }
      if (S.susp) { S.susp = false; S.L = Math.log(Math.max(.01, game.timeRate)); S.V = 0; }
      const t = game.realT, lb = Math.log(S.base), ls = Math.log(S.slow);
      const tau = Math.min(1.8, Math.max(.6, 2 / Math.sqrt(S.base)));
      let tgt;
      if (t < S.holdEnd) tgt = ls;
      else {
        const lev = isFinite(tEv) ? Math.log(Math.min(S.base, Math.max(floor, tEv / tau))) : lb;
        const lrec = S.holdEnd > 0 ? ls + (lb - ls) * sm((t - S.holdEnd) / S.up) : lb;
        tgt = Math.min(lev, lrec);
      }
      // the spring (exact, critically damped)
      const e0 = S.L - tgt, a = S.V + W * e0, ex = Math.exp(-W * dt);
      S.L = tgt + (e0 + a * dt) * ex; S.V = (S.V - W * a * dt) * ex;
      if (S.L > lb) { S.L = lb; if (S.V > 0) S.V = 0; }
      if (S.L < ls - .05) { S.L = ls - .05; if (S.V < 0) S.V = 0; }
      game.timeRate = Math.exp(S.L);
      if (S.ending && t > S.holdEnd && lb - S.L < .01 && !isFinite(tEv)) {
        game.timeRate = S.base; S = null;
        bus.emit('rate', { rate: game.timeRate, paused: false, why: 'bullet' });
        bus.emit('bullet', { on: false });
      }
    },
  };
  bus.on('rate', d => {
    if (!S || !d || d.why === 'bullet' || d.why === 'replay') return;
    if (d.why === 'user') { S = null; bus.emit('bullet', { on: false }); return; }   // the player's own rate stands
    // the game's own drop (auto x1 on a launch, the end): the base comes down to it
    S.base = Math.min(S.base, Math.max(S.slow, d.rate || 1));
    S.L = Math.log(Math.max(.01, game.timeRate)); S.V = 0;
  });
  game.pace = api;
  return api;
}
