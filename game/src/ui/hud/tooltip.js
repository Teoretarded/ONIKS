/* Tooltip: after a short hover, the unit under the cursor gets a full tag (id chip · designation · state and HP, or
   track · class · confidence) where the selection system writes its plain hover label, so the one replaces the other. */
import { unitTag } from '../../game/labels.js';

export function createTooltip(game) {
  const { sim } = game, cam = game.camera;
  let id = null, since = 0;
  const q = [0, 0, 0];
  return {
    draw2d(ov, orb) {
      const h = game.hover;
      if (h !== id) { id = h; since = game.realT; }
      if (!h || game.selection.has(h) || game.realT - since < .3 || !game.mouse.in) return;
      const u = sim.units.get(h);
      if (!u || !(u.alive || u.dying < 1)) return;
      if (u.side !== game.side && !game.vis(u)) return;
      if (!cam.project(game.unitPose(u).pos, q)) return;
      const tg = unitTag(game, u);
      const own = u.side === game.side;
      // (px at 1080p times the UI scale, as the selection system's label)
      const k = ov.ui || 1, ctx = ov.ctx, x = q[0] + 10 * k, base = q[1] - 12 * k;
      // cover the selection system's plain label first (same anchor), then the tag over it
      ctx.font = `400 ${10.5 * k}px 'Geist Mono', Consolas, monospace`;
      const w = ctx.measureText(String(tg.label).toUpperCase()).width + tg.label.length * .6 * k + 4 * k;
      ctx.globalAlpha = 1; ctx.fillStyle = orb ? '#000' : '#0B0C0A'; ctx.fillRect(Math.round(x) - 1, Math.round(base - 10 * k), Math.ceil(w), Math.ceil(14 * k));
      ov.tag(x, base - 14.5 * k, tg.id, tg.label, tg.value, { kind: own ? 'lime' : game.vis(u) === 'track' ? 'coral' : 'ghost', size: 10.5 });
    },
  };
}
