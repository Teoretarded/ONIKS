/* One tag layer for every SENSORS label drawn this frame: collected, stacked so they never overlap (p1 / p2
   placement: higher priority first, the others pushed up), then drawn with a thin dotted leader back to the
   thing they name. Items are pooled (no per-frame allocation).
   Sizes are the overlay's own metrics at its UI scale (ov.ui: 1 at 1080p, the HUD's scale above), the class bars
   included: a tag and its bars stay inside the view (a tag that would run off the right edge goes to the other
   side of what it names) and out of the HUD panels (a tag with no room off them is left out, the thing keeps its mark).
   Nothing while the pause menu or the end block is up (ov.worldA). Callers give their offsets at 1080p times ov.ui. */
import { sat } from './core.js';

const LIME = '#C6F432', CORAL = '#FF6A3D';
const byPri = (a, b) => (b.pri - a.pri) || (a.y - b.y);

export class TagLayer {
  constructor() { this.pool = []; this.n = 0; this.sorted = []; }
  begin() { this.n = 0; }
  /* { x, y (tag top-left; with align 'right' x is its right edge), ax, ay (anchor, or undefined), id, label, value,
       kind, a, size (px at 1080p), valCol, pri, bars, lead, far (a placard column: its leader may run far), align } */
  add(o) {
    let t = this.pool[this.n];
    if (!t) { t = {}; this.pool[this.n] = t; }
    this.n++;
    t.x = o.x; t.y = o.y; t.ax = o.ax; t.ay = o.ay; t.id = o.id || ''; t.label = o.label || ''; t.value = o.value === undefined ? '' : String(o.value);
    t.kind = o.kind || 'white'; t.a = o.a === undefined ? 1 : o.a; t.size = o.size || 10.5; t.valCol = o.valCol; t.pri = o.pri || 0;
    t.bars = o.bars || null; t.lead = o.lead !== false; t.leadCol = o.leadCol || null; t.far = !!o.far; t.alignR = o.align === 'right';
    t.w = 0; t.h = 0; t.bw = 0; t.bh = 0; t.fw = 0; t.hh = 0;
    return t;
  }
  /* obst: [[x0, y0, x1, y1], ...] screen rects no tag may sit on (the HUD panels, the scan inset) */
  flush(ov, W, H, obst) {
    const L = this.sorted; L.length = 0;
    // the pause menu / end block has the stage: the overlay fades the world's tags out (ov.worldA), nothing to place
    const wa = ov.worldA === undefined ? 1 : ov.worldA;
    if (wa <= .01) return;
    const k = ov.ui || 1, m = 8 * k;
    for (let i = 0; i < this.n; i++) {
      const t = this.pool[i];
      if (t.a <= .01) continue;
      // what it names is off screen: no tag
      if (t.ax !== undefined && (t.ax < -20 || t.ay < -20 || t.ax > W + 20 || t.ay > H + 20)) continue;
      // its real size (the overlay's metrics at the UI scale) and the class bars under it
      const sz = ov.tagSize(t.id, t.label, t.value, { size: t.size });
      t.w = sz[0]; t.h = sz[1];
      t.bw = t.bars ? barsW(t.bars, k) : 0; t.bh = t.bars ? barsH(t.bars, k) + 4 * k : 0;
      t.fw = Math.max(t.w, t.bw); t.hh = t.h + t.bh;
      if (t.alignR) t.x -= t.fw;
      // keep on screen: a tag running off the right edge goes to the other side of what it names
      if (t.x + t.fw > W - m) {
        const fx = t.ax !== undefined && !t.far ? t.ax - (t.x - t.ax) - t.fw : -1;
        t.x = fx >= m ? fx : W - m - t.fw;
      }
      if (t.x < m) t.x = m;
      if (t.y + t.hh > H - 6 * k) t.y = H - 6 * k - t.hh;
      if (t.y < 6 * k) t.y = 6 * k;
      L.push(t);
    }
    L.sort(byPri);
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const t = L[i], x0 = t.x, y0 = t.y;
      t.skip = false;
      if (place(L, i, t, obst, W, H, k)) continue;
      // no room where it wanted to be: try the other side of what it names, then leave it out (the thing keeps its mark)
      if (t.ax !== undefined) {
        t.x = Math.max(m, Math.min(W - m - t.fw, t.ax - (x0 - t.ax) - t.fw)); t.y = y0;
        if (place(L, i, t, obst, W, H, k)) continue;
      }
      t.skip = true;
    }
    const ctx = ov.ctx;
    for (let i = n - 1; i >= 0; i--) {
      const t = L[i];
      if (t.skip || t.y < -40 || t.y > H + 40) continue;
      // the tag and its bars sit on the side of the block nearer what they name
      const right = t.ax !== undefined && t.ax > t.x + t.fw * .5;
      const tx = right ? t.x + t.fw - t.w : t.x;
      if (t.lead && t.ax !== undefined) {
        // from the tag's nearest corner to what it names
        const lx = right ? t.x + t.fw + 3 : t.x - 3, ly = t.ay < t.y ? t.y : t.y + t.h;
        if (Math.hypot(lx - t.ax, ly - t.ay) > 6) ov.leader(t.ax, t.ay, lx, ly, t.leadCol || (t.kind === 'coral' ? 'rgba(255,150,120,.9)' : t.kind === 'lime' ? LIME : 'rgba(238,238,228,.85)'), .75 * t.a);
      }
      ov.tag(tx, t.y, t.id, t.label, t.value, { kind: t.kind, a: t.a, size: t.size, valCol: t.valCol });
      if (t.bars) drawBars(ctx, right ? t.x + t.fw - t.bw : t.x, t.y + t.h + 4 * k, t.bars, t.a * wa, k);
    }
  }
}

/* stack tag i (t) clear of the panels and of the tags placed before it -> placed? */
function place(L, i, t, obst, W, H, k) {
  const hh = t.hh, g = 6 * k;
  let hit = null, moved = 0;
  for (let guard = 0; guard < 12; guard++) {
    hit = null;
    // out of the panels first: the nearest side of the panel that keeps it on screen
    if (obst) for (let j = 0; j < obst.length; j++) {
      const r = obst[j];
      if (t.x < r[2] && r[0] < t.x + t.fw && t.y < r[3] && r[1] < t.y + hh) { escape(t, hh, r, W, H, k); moved++; hit = r; break; }
    }
    if (hit) { if (moved > 4) break; continue; }
    for (let j = 0; j < i; j++) {
      const p = L[j]; if (p.skip) continue;
      if (t.x < p.x + p.fw + g && p.x < t.x + t.fw + g && t.y < p.y + p.hh + 3 * k && p.y < t.y + hh + 3 * k) { hit = p; break; }
    }
    if (!hit) break;
    t.y = hit.y - hh - 4 * k;
    if (t.y < 4) break;
  }
  if (hit || t.y < 2) return false;
  if (t.ay === undefined || t.far) return true;
  const nx = Math.max(t.x, Math.min(t.x + t.fw, t.ax)), ny = Math.max(t.y, Math.min(t.y + hh, t.ay));
  return Math.hypot(t.ax - nx, t.ay - ny) < 200 * k;
}

/* move a tag (fw x hh at t.x, t.y) out of rect r by the shortest way that stays on screen */
function escape(t, hh, r, W, H, k) {
  const g = 4 * k, c = [[t.x, r[1] - hh - g], [t.x, r[3] + g], [r[0] - t.fw - 6 * k, t.y], [r[2] + 6 * k, t.y]];
  let best = -1, bd = 1e18;
  for (let i = 0; i < 4; i++) {
    const x = c[i][0], y = c[i][1];
    if (x < g || y < g || x + t.fw > W - g || y + hh > H - g) continue;
    const d = (x - t.x) * (x - t.x) + (y - t.y) * (y - t.y);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) { t.y = -999; return; }
  t.x = c[best][0]; t.y = c[best][1];
}

/* the p5 class bars: rows of [label, bar, value]; bars = { rows: [[label, p], ...], top, wL }; k: the UI scale */
const MONO = "'Geist Mono', Consolas, monospace";
export const barsW = (bars, k) => (9 + (bars.wL || 62) + 8 + 58 + 8 + 30 + 8) * (k || 1);
export const barsH = (bars, k) => (bars.rows.length * 12 + 12) * (k || 1);
export function drawBars(ctx, x, y, bars, a, k) {
  k = k || 1;
  const rows = bars.rows, n = rows.length, rh = 12 * k, px = 9 * k;
  const wL = (bars.wL || 62) * k, wB = 58 * k, wV = 30 * k, p9 = 9 * k, p8 = 8 * k;
  x = Math.round(x); y = Math.round(y);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(11,12,10,.74)';
  ctx.fillRect(x, y, Math.round(barsW(bars, k)), Math.round(barsH(bars, k)));
  ctx.font = `400 ${px}px ${MONO}`;
  ctx.textBaseline = 'middle';
  const bh = Math.max(3, Math.round(4 * k));
  for (let i = 0; i < n; i++) {
    const [lab, p] = rows[i], top = i === bars.top, yy = Math.round(y + 6 * k + i * rh + rh / 2);
    ctx.fillStyle = top ? '#FFFFFF' : 'rgba(255,255,255,.55)';
    txt(ctx, lab, x + p9, yy, .45 * k);
    const bx = Math.round(x + p9 + wL + p8);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(bx, yy - (bh >> 1), Math.round(wB), bh);
    ctx.fillStyle = top ? LIME : 'rgba(255,255,255,.75)'; ctx.fillRect(bx, yy - (bh >> 1), Math.round(wB * sat(p)), bh);
    ctx.fillStyle = top ? LIME : 'rgba(255,255,255,.75)';
    ctx.textAlign = 'right'; txt(ctx, p.toFixed(2), bx + wB + p8 + wV, yy, .45 * k); ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}
function txt(ctx, s, x, y, sp) {
  if ('letterSpacing' in ctx) { ctx.letterSpacing = sp + 'px'; ctx.fillText(s, x, y); ctx.letterSpacing = '0px'; }
  else ctx.fillText(s, x, y);
}
export { LIME, CORAL };
