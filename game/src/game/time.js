/* Time controls: Space pause, + / - rate (x1 .. x32; the camera's = / - zoom keys are taken for this, the wheel
   zooms), F10 hide the UI. The sim is stepped by game.frame(); this system only changes game.timeRate / paused.
   Until a HUD system is registered it also draws the rate readout and the toasts itself (the rate is always on
   screen), with a lime blip when the game drops to x1 on its own. */
import { PRI } from './game.js';

const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;

export function createTime(game) {
  const cam = game.camera;
  const toasts = [];
  let blip = -99, blipWhy = '';
  game.bus.on('toast', d => { toasts.push({ text: d.text, bad: !!d.bad, t0: game.realT }); if (toasts.length > 4) toasts.shift(); });
  game.bus.on('autoslow', d => { blip = game.realT; blipWhy = d.why === 'launch' ? 'LAUNCH' : 'NEW CONTACT'; });

  const fmt = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  game.fmtTime = fmt;

  return {
    name: 'time', priority: PRI.time, always2d: true,
    onKey(e) {
      const k = e.code;
      if (k === 'Equal' || k === 'NumpadAdd' || k === 'Minus' || k === 'NumpadSubtract') {
        cam.down.delete(k);                      // not the camera's zoom
        if (e.type === 'keydown' && !e.repeat) game.stepRate(k === 'Equal' || k === 'NumpadAdd' ? 1 : -1);
        return true;
      }
      if (e.type !== 'keydown') return false;
      if (k === 'Space') { if (!e.repeat) game.pause(); return true; }
      if (k === 'F10') { game.setUiHidden(); return true; }
      return false;
    },
    draw2d(ov) {
      if (game.ui.hidden || game.getSystem('hud')) return;
      const W = ov.W, K = ov.ui || 1, x = W / 2, y = 22 * K;
      const rate = game.paused ? 'PAUSED' : 'x' + game.timeRate;
      const b = ov.tag(x, y, rate, 'T+' + fmt(game.sim.t), '', { kind: game.paused ? 'white' : 'lime', size: 11, align: 'center' });
      const k = game.realT - blip;
      if (k < 3 && b) {
        const a = sat(1 - k / 3);
        ov.mark(b[0] - 14 * K, (b[1] + b[3]) / 2, 7, '#C6F432', a, Math.floor(k * 6) % 2 === 0);
        ov.text(x, b[3] + 16 * K, blipWhy + ' · x1', { size: 10, col: '#C6F432', a, align: 'center' });
      }
      let yy = ov.H - 120 * K;
      for (let i = toasts.length - 1; i >= 0; i--) {
        const t = toasts[i], age = game.realT - t.t0;
        if (age > 2.2) { toasts.splice(i, 1); continue; }
        ov.text(x, yy, t.text, { size: 11, col: t.bad ? '#FF6A3D' : '#C6F432', a: sat((2.2 - age) / .5), align: 'center' });
        yy -= 18 * K;
      }
    },
  };
}
