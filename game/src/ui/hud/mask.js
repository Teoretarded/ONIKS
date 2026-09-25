/* Clean ground under the HUD: world tags and brackets drawn on the overlay canvas (tracks at the horizon, selection
   tags) fade out under the HUD's panels, with soft edges, so readouts never sit on top of other text. The panel
   rectangles are also published as game.hudRects ([x0, y0, x1, y1] in view px) for systems that place tags, and as
   the overlay's avoid list: ov.tag(x, y, id, label, value, { fit: true, anchor: [ox, oy] }) keeps a tag on screen and
   out of the panels, with a leader back to the object. Besides the panels: a top safe band across the whole width
   (the title and clock line; tags are placed off it, nothing fades under it), the right column's room for the log's six rows and the three alert chips (up or not:
   the scan inset placed now keeps clear of an alert arriving later), the minimap with its label line, and the
   campaign's mission lines over the command card (tags step off them). */

const PAD = 10, FEATHER = 14;
const TOP = 82;          // px at 1080p: the top safe band (under the ONIKS mark and the clock line)
const LOG_ROWS = 6;      // the engagement log's rows (log.js ROWS)
const ALERTS = 3 * 21 + 2 * 7;   // px at 1080p: the alerts' three chips and their gaps (alerts.js, hud.css .h-al)

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
      return b;
    };
    const R = hud.root, s = hud.scale || 1;
    if (R.classList.contains('veil')) return out;
    // the top safe band: the title, the clock and their line stay clear across the whole width (a world tag near the
    // top edge steps down under it instead of crowding the mark). For placing only: nothing under it fades (the radar
    // view's and other systems' own captions sit at the top centre)
    const band = [-FEATHER, -FEATHER, W + FEATHER, Math.round(TOP * s)];
    band.place = true;
    out.push(band);
    add(R.querySelector('.h-tl'), 'tl');
    const tr = add(R.querySelector('.h-tr'), 'tr');
    // the right column keeps the room its log (six rows) and its alerts (three chips) are about to take, up or not yet:
    // the scan inset and the world's tags are placed once, and an alert arriving after them would land on them
    if (tr) {
      const al = R.querySelector('.h-tr .h-al'), rows = R.querySelectorAll('.h-tr .h-log .rows .r');
      const ar = al && al.getBoundingClientRect(), r0 = rows.length && rows[0].getBoundingClientRect();
      if (ar) tr[3] = Math.max(tr[3], Math.ceil(ar.top + (r0 && r0.height > 0 ? Math.max(0, LOG_ROWS - rows.length) * r0.height : 0) + ALERTS * s + PAD));
    }
    add(R.querySelector('.h-sel'), 'lb');
    add(R.querySelector('.h-cmd'), 'b');
    add(R.querySelector('.h-buy'));
    const br = add(R.querySelector('.h-br'), 'rb');
    // (the minimap's label line sits above its frame, outside the box)
    const fl = br && R.querySelector('.h-br .fl'), flr = fl && fl.getBoundingClientRect();
    if (flr && flr.height > 1) br[1] = Math.min(br[1], Math.floor(flr.top - PAD));
    for (const el of document.querySelectorAll('.oniks-sbx')) add(el, 'l');
    // the mission's lines over the command card (campaign/lines.js): world tags step off them, never under them
    for (const el of document.querySelectorAll('#cmp .ln')) add(el);
    return out;
  }

  function build(W, H, pr) {
    dpr = pr || window.devicePixelRatio || 1;          // the overlay's own ratio (clamped by the renderer), not the window's
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (!mask || mw !== w || mh !== h) { mask = document.createElement('canvas'); mask.width = mw = w; mask.height = mh = h; }
    const c = mask.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.filter = `blur(${FEATHER / 2}px)`;
    c.fillStyle = 'rgba(0,0,0,.94)';
    for (const r of rects) if (!r.place) c.fillRect(r[0] + FEATHER / 2, r[1] + FEATHER / 2, r[2] - r[0] - FEATHER, r[3] - r[1] - FEATHER);
    c.filter = 'none';
  }

  return {
    /* call first thing in the HUD's draw2d (after every other system drew on the overlay) */
    apply(ov) {
      if (game.realT - last > .25) {
        last = game.realT;
        const m = measure();
        const k = m.map(r => r.join(',')).join('|') + '@' + ov.W + 'x' + ov.H + '@' + ov.dpr;
        if (k !== key) { key = k; rects.length = 0; for (const r of m) rects.push(r); build(ov.W, ov.H, ov.dpr); }
      }
      if (!rects.length || !mask) return;
      const c = ov.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 1;
      for (const r of rects) {
        if (r.place) continue;
        const x = Math.max(0, Math.round(r[0] * dpr)), y = Math.max(0, Math.round(r[1] * dpr));
        const w = Math.min(mw, Math.round(r[2] * dpr)) - x, h = Math.min(mh, Math.round(r[3] * dpr)) - y;
        if (w > 0 && h > 0) c.drawImage(mask, x, y, w, h, x, y, w, h);
      }
      c.restore();
    },
  };
}
