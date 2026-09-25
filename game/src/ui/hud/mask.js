/* Clean ground under the HUD: world tags and brackets drawn on the overlay canvas (tracks at the horizon, selection
   tags) fade out under the HUD's panels, with soft edges, so readouts never sit on top of other text. The panel
   rectangles are also published as game.hudRects ([x0, y0, x1, y1] in view px) for systems that place tags, and as
   the overlay's avoid list: ov.tag(x, y, id, label, value, { fit: true, anchor: [ox, oy] }) keeps a tag on screen and
   out of the panels, with a leader back to the object. */

const PAD = 10, FEATHER = 14;

export function createMask(game, hud) {
  let rects = [], key = '', last = -1, mask = null, mw = 0, mh = 0, dpr = 1;
  game.hudRects = rects;
  if (game.overlay) game.overlay.avoid = rects;     // fitted tags (ov.tag(..., { fit: true })) keep out of the panels

  function measure() {
    const out = [];
    const W = innerWidth, H = innerHeight;
    /* a corner panel's clean ground runs out to the screen edges it is anchored to */
    const add = (el, edge) => {
      if (!el || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const b = [Math.floor(r.left - PAD), Math.floor(r.top - PAD), Math.ceil(r.right + PAD), Math.ceil(r.bottom + PAD)];
      if (edge) {
        if (edge.includes('l')) b[0] = -FEATHER;
        if (edge.includes('r')) b[2] = W + FEATHER;
        if (edge.includes('t')) b[1] = -FEATHER;
        if (edge.includes('b')) b[3] = H + FEATHER;
      }
      out.push(b);
    };
    const R = hud.root;
    if (R.classList.contains('veil')) return out;
    add(R.querySelector('.h-tl'), 'tl');
    add(R.querySelector('.h-tr'), 'tr');
    add(R.querySelector('.h-sel'), 'lb');
    add(R.querySelector('.h-cmd'), 'b');
    add(R.querySelector('.h-buy'));
    add(R.querySelector('.h-br'), 'rb');
    for (const el of document.querySelectorAll('.oniks-sbx')) add(el, 'l');
    return out;
  }

  function build(W, H) {
    dpr = window.devicePixelRatio || 1;
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (!mask || mw !== w || mh !== h) { mask = document.createElement('canvas'); mask.width = mw = w; mask.height = mh = h; }
    const c = mask.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.filter = `blur(${FEATHER / 2}px)`;
    c.fillStyle = 'rgba(0,0,0,.94)';
    for (const r of rects) c.fillRect(r[0] + FEATHER / 2, r[1] + FEATHER / 2, r[2] - r[0] - FEATHER, r[3] - r[1] - FEATHER);
    c.filter = 'none';
  }

  return {
    /* call first thing in the HUD's draw2d (after every other system drew on the overlay) */
    apply(ov) {
      if (game.realT - last > .25) {
        last = game.realT;
        const m = measure();
        const k = m.map(r => r.join(',')).join('|') + '@' + ov.W + 'x' + ov.H;
        if (k !== key) { key = k; rects.length = 0; for (const r of m) rects.push(r); build(ov.W, ov.H); }
      }
      if (!rects.length || !mask) return;
      const c = ov.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 1;
      for (const r of rects) {
        const x = Math.max(0, Math.round(r[0] * dpr)), y = Math.max(0, Math.round(r[1] * dpr));
        const w = Math.min(mw, Math.round(r[2] * dpr)) - x, h = Math.min(mh, Math.round(r[3] * dpr)) - y;
        if (w > 0 && h > 0) c.drawImage(mask, x, y, w, h, x, y, w, h);
      }
      c.restore();
    },
  };
}
