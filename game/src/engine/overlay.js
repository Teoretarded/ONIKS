/* 2D overlay in the Point Cloud films' style (pc.css .tag, pc_anatomy_film.js bracket / leader):
   id chip (white, lime or coral block with dark text) + dark label + value in lime, dotted boxes, bracket
   corners, thin dotted leaders, small mono readouts. Geist / Geist Mono. Coordinates are CSS px of the view.
   The canvas is cleared by the renderer each frame; draw after Renderer.end(). */

export const COL = { lime: '#C6F432', coral: '#FF6A3D', white: '#FFFFFF', bg: '#0B0C0A', dim: 'rgba(255,255,255,.62)', faint: 'rgba(255,255,255,.36)', hair: 'rgba(255,255,255,.14)' };
const MONO = "'Geist Mono', Consolas, monospace", SANS = "'Geist', 'Segoe UI', sans-serif";

export class Overlay {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1; this.scale = 1;
    this._w = new Map();
  }
  resize(cssW, cssH, dpr) {
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.W = cssW; this.H = cssH; this.dpr = dpr;
  }
  clear() { const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
  _font(px, weight, fam) { const c = this.ctx; c.font = `${weight || 500} ${px}px ${fam || MONO}`; }
  _meas(txt, px, spacing) { const k = txt + '|' + px; let w = this._w.get(k); if (w === undefined) { w = this.ctx.measureText(txt).width + spacing * txt.length; if (this._w.size > 4000) this._w.clear(); this._w.set(k, w); } return w; }
  _txt(s, x, y, spacing) {
    const c = this.ctx;
    if ('letterSpacing' in c) { c.letterSpacing = spacing + 'px'; c.fillText(s, x, y); c.letterSpacing = '0px'; return; }
    c.fillText(s, x, y);
  }

  /* object tag: [ID][ label ][ value ] at (x, y) = its top-left (or anchored: o.align 'left' | 'right' | 'center').
     o: { kind: 'white' | 'lime' | 'coral' | 'ghost', a, size (px, default 11.5), align, valCol } -> [x0, y0, x1, y1] */
  tag(x, y, id, label, value, o) {
    o = o || {};
    const c = this.ctx, px = o.size || 11.5, sp = px * .05, a = o.a === undefined ? 1 : o.a;
    if (a <= 0.005) return null;
    this._font(px, 500);
    const U = s => (s || '').toString().toUpperCase();
    const sId = U(id), sL = U(label), sV = U(value);
    const pX = px * .61, pL = px * .7, hB = Math.round(px + 9);
    const wId = sId ? this._meas(sId, px, sp) + pX * 2 : 0, wL = sL ? this._meas(sL, px, sp) + pL * 2 : 0, wV = sV ? this._meas(sV, px, sp) + pL * 2 : 0;
    const W = wId + wL + wV;
    if (o.align === 'right') x -= W; else if (o.align === 'center') x -= W / 2;
    x = Math.round(x); y = Math.round(y);
    const kind = o.kind || 'white';
    const chip = kind === 'lime' ? COL.lime : kind === 'coral' ? COL.coral : '#FFFFFF';
    c.globalAlpha = a;
    c.textBaseline = 'alphabetic';
    const base = y + hB - Math.round(px * .42) - 1.5;
    let cx = x;
    if (sId) {
      if (kind === 'ghost') { c.strokeStyle = 'rgba(255,255,255,.42)'; c.lineWidth = 1; c.strokeRect(cx + .5, y + .5, wId - 1, hB - 1); c.fillStyle = 'rgba(255,255,255,.7)'; }
      else { c.fillStyle = chip; c.fillRect(cx, y, wId, hB); c.fillStyle = COL.bg; }
      this._txt(sId, cx + pX, base, sp); cx += wId;
    }
    if (sL || sV) { c.fillStyle = 'rgba(11,12,10,.86)'; c.fillRect(cx, y, wL + wV, hB); }
    if (sL) { c.fillStyle = kind === 'ghost' ? 'rgba(255,255,255,.72)' : '#FFFFFF'; this._txt(sL, cx + pL, base, sp); cx += wL; }
    if (sV) { c.fillStyle = o.valCol || (kind === 'coral' ? COL.coral : COL.lime); this._txt(sV, cx + pL, base, sp); cx += wV; }
    c.globalAlpha = 1;
    return [x, y, x + W, y + hB];
  }
  /* identification bracket round a screen box: corners + a faint dotted frame (films' bracket()) */
  bracket(b, col, a, pad, len) {
    if (!b) return null;
    const c = this.ctx; pad = pad === undefined ? 6 : pad; len = len || 14; a = a === undefined ? 1 : a;
    const x0 = Math.round(b[0] - pad) + .5, y0 = Math.round(b[1] - pad) + .5, x1 = Math.round(b[2] + pad) + .5, y1 = Math.round(b[3] + pad) + .5;
    const k = Math.min(len, (x1 - x0) * .35, (y1 - y0) * .35);
    c.strokeStyle = col || COL.lime; c.globalAlpha = a; c.lineWidth = 1.5; c.beginPath();
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) { c.moveTo(px + sx * k, py); c.lineTo(px, py); c.lineTo(px, py + sy * k); }
    c.stroke(); c.lineWidth = 1; c.setLineDash([2, 4]); c.globalAlpha = a * .45; c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.setLineDash([]); c.globalAlpha = 1;
    return [x0, y0, x1, y1];
  }
  /* dotted box (the films' part boxes) */
  box(b, col, a, dash) {
    if (!b) return;
    const c = this.ctx; c.strokeStyle = col || 'rgba(255,255,255,.8)'; c.globalAlpha = a === undefined ? .8 : a; c.lineWidth = 1;
    c.setLineDash(dash || [2, 3]); c.strokeRect(Math.round(b[0]) + .5, Math.round(b[1]) + .5, Math.round(b[2] - b[0]), Math.round(b[3] - b[1])); c.setLineDash([]); c.globalAlpha = 1;
  }
  /* thin dotted leader */
  leader(x0, y0, x1, y1, col, a) {
    const c = this.ctx; c.strokeStyle = col || 'rgba(255,255,255,.8)'; c.globalAlpha = a === undefined ? .8 : a; c.lineWidth = 1; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  }
  /* square marker (the films' contact square) */
  mark(x, y, s, col, a, fill) {
    const c = this.ctx; s = s || 7; c.globalAlpha = a === undefined ? 1 : a;
    if (fill) { c.fillStyle = col || COL.lime; c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); }
    else { c.strokeStyle = col || COL.lime; c.lineWidth = 1; c.strokeRect(Math.round(x - s / 2) + .5, Math.round(y - s / 2) + .5, s - 1, s - 1); }
    c.globalAlpha = 1;
  }
  /* small mono text (uppercase readouts); o: { size, col, a, align, weight, sans, upper } */
  text(x, y, s, o) {
    o = o || {};
    const c = this.ctx, px = o.size || 11.5;
    this._font(px, o.weight || 400, o.sans ? SANS : MONO);
    c.fillStyle = o.col || COL.dim; c.globalAlpha = o.a === undefined ? 1 : o.a;
    c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'alphabetic';
    this._txt(o.upper === false ? s : String(s).toUpperCase(), Math.round(x), Math.round(y), o.sans ? 0 : px * .05);
    c.textAlign = 'left'; c.globalAlpha = 1;
  }
  /* screen-space dotted line of square dots (the films' dline) */
  dline(x0, y0, x1, y1, step, s, col, a) {
    const c = this.ctx, L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / (step || 4)));
    c.fillStyle = col || '#fff'; c.globalAlpha = a === undefined ? 1 : a; s = s || 1;
    for (let i = 0; i <= n; i++) { const t = i / n; c.fillRect(Math.round(x0 + (x1 - x0) * t - s / 2), Math.round(y0 + (y1 - y0) * t - s / 2), s, s); }
    c.globalAlpha = 1;
  }
}
