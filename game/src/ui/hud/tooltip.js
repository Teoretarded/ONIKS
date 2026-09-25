/* Tooltip: after a short hover, the unit under the cursor gets a full tag (id chip · designation · state and HP, or
   track · class · confidence) where the selection system writes its plain hover label, so the one replaces the other. */
import { unitTag } from '../../game/labels.js';

const FONT = "400 10.5px 'Geist Mono', Consolas, monospace";

export function createTooltip(game) {
  const { sim } = game, cam = game.camera;
  let id = null, since = 0;
  const q = [0, 0, 0];
  return {
    draw2d(ov) {
      const h = game.hover;
      if (h !== id) { id = h; since = game.realT; }
      if (!h || game.selection.has(h) || game.realT - since < .3 || !game.mouse.in) return;
      const u = sim.units.get(h);
      if (!u || !(u.alive || u.dying < 1)) return;
      if (u.side !== game.side && !game.vis(u)) return;
      if (!cam.project(game.unitPose(u).pos, q)) return;
      const tg = unitTag(game, u);
      const own = u.side === game.side;
      const ctx = ov.ctx, x = q[0] + 10, base = q[1] - 12;
      // cover the selection system's plain label first (same anchor), then the tag over it
      ctx.font = FONT;
      const w = ctx.measureText(String(tg.label).toUpperCase()).width + tg.label.length * .6 + 4;
      ctx.globalAlpha = 1; ctx.fillStyle = '#0B0C0A'; ctx.fillRect(Math.round(x) - 1, Math.round(base) - 10, Math.ceil(w), 14);
      const val = own ? tg.value : tg.value;
      ov.tag(x, base - 14.5, tg.id, tg.label, val, { kind: own ? 'lime' : game.vis(u) === 'track' ? 'coral' : 'ghost', size: 10.5 });
    },
  };
}
