/* ONIKS HUD: the in-game interface in the films' Point Cloud language (tags, dotted bars, hairline frames, mono
   readouts, the menu's index-and-underline rows). DOM for the fixed panels (crisp text, updated only when it
   changes), the overlay canvas for the in-world tooltip, one canvas for the minimap.

   createHud(game) -> the 'hud' system (priority 70; the time, objectives and director systems stop drawing their
   own fallbacks when it is there). Pieces: top.js (mark, mode · map, objectives | rate, clock, supply, side),
   log.js (engagement log), alerts.js (incoming, contacts, losses, under the log; toasts), selection.js,
   commands.js (command card), minimap.js, reinforce.js (B), tooltip.js, mask.js. Scales with the window
   (1080p = 1, never below .8). F10 hides it (the game's ui-off); the pause menu and the end screen veil it.

   For other systems:
     game.hudRects            [[x0, y0, x1, y1], ...] view px of the HUD panels (4 Hz): keep world tags out of them.
                              Whatever is drawn on the overlay under them fades out anyway (mask.js).
     hud system: .toggleBuy(on?), .log.add(code, text, 'l'|'c'|''), .minimap.ping(x, z, colour, sec)
   Keys it takes: B (reinforcements; 1-n buy and Esc close while open). The orders' own B list stays closed.
   CSS (styles/hud.css) moves the sandbox palette (.oniks-sbx) under the kick line: the top right is the log's.
   Debug: ONIKS.hudShot(name) saves a full-resolution still with the DOM HUD painted in (capture.js). */
import { PRI } from '../../game/game.js';
import { createTop } from './top.js';
import { createLog } from './log.js';
import { createAlerts } from './alerts.js';
import { createSelection } from './selection.js';
import { createCommands } from './commands.js';
import { createReinforce } from './reinforce.js';
import { createMinimap } from './minimap.js';
import { createTooltip } from './tooltip.js';
import { createMask } from './mask.js';
import { createSalvo } from './salvo.js';   // the salvo board (its own system; top of the command card)

export function createHud(game) {
  // styles
  if (!document.getElementById('oniks-hud-css')) {
    const l = document.createElement('link'); l.id = 'oniks-hud-css'; l.rel = 'stylesheet';
    l.href = new URL('../../../styles/hud.css', import.meta.url).href;
    document.head.appendChild(l);
  }
  const root = document.createElement('div');
  root.id = 'hud';
  (game.uiRoot || document.body).appendChild(root);
  document.body.classList.add('hud-on');
  root.addEventListener('contextmenu', e => e.preventDefault());   // right-click on a panel is not the browser's

  const hud = {
    root, scale: 1, stats: { ms: 0, mapMs: 0, previewMs: 0 },
    div(cls) { const d = document.createElement('div'); d.className = cls; root.appendChild(d); return d; },
    click(bad) { const a = game.getSystem('audio'); if (a && a.ui) try { a.ui(bad ? 'invalid' : 'tick'); } catch (e) { /* */ } },
    get buyOpen() { return buy ? buy.open : false; },
    toggleBuy(on) { const o = buy.toggle(on); sel.refresh(); return o; },
  };

  const top = createTop(game, hud);
  const tr = root.querySelector('.h-tr');
  const log = createLog(game, hud, tr);
  const bc = hud.div('h-bc');
  const buy = createReinforce(game, hud, bc);
  const alerts = createAlerts(game, hud, tr, bc);
  const cmd = createCommands(game, hud, bc);
  createSalvo(game, hud, bc);
  const sel = createSelection(game, hud);
  const map = createMinimap(game, hud);
  const tip = createTooltip(game);
  const mask = createMask(game, hud);

  /* scale: 1 at 1080p, never below .8 (720p stays legible), up to 1.6 for 4K */
  function fit() {
    const s = Math.max(.8, Math.min(1.6, Math.min(innerWidth / 1920, innerHeight / 1080)));
    hud.scale = s;
    root.style.zoom = s;
    root.style.width = (innerWidth / s) + 'px'; root.style.height = (innerHeight / s) + 'px';
    document.body.style.setProperty('--hs', s);
    map.resize();
  }
  let fitW = innerWidth, fitH = innerHeight;
  fit();

  // the pause menu and the end screen take the stage: the HUD steps back
  const menus = document.getElementsByClassName('oniks-menu'), ends = document.getElementsByClassName('oniks-end');
  let veiled = false;

  const sys = {
    name: 'hud', priority: PRI.hud, drawsObjectives: true,
    hud, log, alerts, minimap: map,
    toggleBuy: hud.toggleBuy,
    onKey(e) {
      if (buy.onKey(e)) return true;
      if (e.type === 'keydown' && e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) { hud.toggleBuy(); hud.click(); return true; }
      return false;
    },
    onEvent(e) {
      log.onEvent(e); alerts.onEvent(e);
      if (e.type === 'detect' && e.side === game.side && e.unit !== undefined) map.ping(e.pos[0], e.pos[2], '#FFFFFF', 2.5);
      else if (e.type === 'destroyed' && e.side === game.side) map.ping(e.pos[0], e.pos[2], '#FF6A3D', 3);
    },
    update() {
      const t0 = performance.now();
      if (innerWidth !== fitW || innerHeight !== fitH) { fitW = innerWidth; fitH = innerHeight; fit(); }
      const v = (menus.length && menus[0].style.display !== 'none') || (ends.length && !ends[0].classList.contains('min'));
      if (v !== veiled) { veiled = v; root.classList.toggle('veil', v); }
      top.update(); log.update(); alerts.update(); sel.update(); cmd.update(); buy.update(); map.update();
      hud.stats.ms = hud.stats.ms * .95 + (performance.now() - t0) * .05;
    },
    draw2d(ov) { const t0 = performance.now(); mask.apply(ov); tip.draw2d(ov); hud.stats.d2 = (hud.stats.d2 || 0) * .95 + (performance.now() - t0) * .05; },
    dispose() { root.remove(); document.body.classList.remove('hud-on'); },
  };

  // debug hook: a still with the DOM HUD in it
  import('./capture.js').then(m => {
    const attach = () => { if (window.ONIKS && window.ONIKS.game === game) window.ONIKS.hudShot = m.hudShot; else setTimeout(attach, 500); };
    attach();
  }).catch(() => {});
  return sys;
}
