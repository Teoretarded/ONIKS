/* STRIKE (proto) host. Standalone (strike.html): the orbital railgun film (../../pc_orbital_railgun/) is loaded whole so
   its ship, rings, shot and fall keep their exact look; its FILM.run call is caught here and kept as
   window.ORB = { render, duration, chapters }, so strike_film.js can call its render at any of its own times (a pure
   function of time) and run its own take. In the Duel (pc_duel.html) the orbital film is not loaded: its headless
   copy (proto/intercept_orbit.js, window.IORB, loaded before this) carries the same film, and IORB.renderFull is its
   render (IORB.FULL the hooks the closing act sets: the platform's pose, the damage, the rings).
   Also: FILM.apply is wrapped so this page can steer (or blend) the orbital film's camera (window.STRIKE_CAM(shot)
   -> shot), and the PointBuf's blit can be held so this page draws on top before the frame is shown. It also loads
   strike_fab.js (the rod line in the closing act's X-ray shot) right after itself, so no page needs another tag. */
(function () {
  // the rod line (strike_fab.js) loads next, before strike_orbit.js uses it (beside this file: proto/ in the Duel)
  try { const me = document.currentScript && document.currentScript.src; if (me && !window.STRIKE_FAB) document.write(`<script src="${new URL('strike_fab.js', me).href}"><\/script>`); } catch (e) { console.warn(e); }
  const run0 = FILM.run, apply0 = FILM.apply;
  window.ORB = null;
  if (window.IORB && IORB.renderFull) window.ORB = { render: IORB.renderFull, duration: 0, chapters: [] };
  else FILM.run = function (sc) { window.ORB = sc; FILM.run = run0; };
  FILM.apply = function (cam, s, extra) { return apply0(cam, window.STRIKE_CAM ? window.STRIKE_CAM(s) : s, extra); };
  FILM.apply0 = apply0;
})();
