/* One tag layer for every SENSORS label drawn this frame: collected, stacked so they never overlap (p1 / p2
   placement: higher priority first, the others pushed up), then drawn with a thin dotted leader back to the
   thing they name. Items are pooled (no per-frame allocation). */
import { tagW, sat } from './core.js';

const LIME = '#C6F432', CORAL = '#FF6A3D';
const byPri = (a, b) => (b.pri - a.pri) || (a.y - b.y);

export class TagLayer {
  constructor() { this.pool = []; this.n = 0; this.sorted = []; }
  begin() { this.n = 0; }
  /* { x, y (tag top-left), ax, ay (anchor, or undefined), id, label, value, kind, a, size, valCol, pri, bars, lead,
       far (a placard column: its leader may run far) } */
  add(o) {
    let t = this.pool[this.n];
    if (!t) { t = {}; this.pool[this.n] = t; }
    this.n++;
    t.x = o.x; t.y = o.y; t.ax = o.ax; t.ay = o.ay; t.id = o.id || ''; t.label = o.label || ''; t.value = o.value === undefined ? '' : String(o.value);
    t.kind = o.kind || 'white'; t.a = o.a === undefined ? 1 : o.a; t.size = o.size || 10.5; t.valCol = o.valCol; t.pri = o.pri || 0;
    t.bars = o.bars || null; t.lead = o.lead !== false; t.leadCol = o.leadCol || null; t.far = !!o.far;
    t.w = tagW(t.id, t.label, t.value, t.size); t.h = Math.round(t.size + 9);
    return t;
  }
  /* obst: [[x0, y0, x1, y1], ...] screen rects no tag may sit on (the HUD panels, the scan inset) */
  flush(ov, W, H, obst) {
    const L = this.sorted; L.length = 0;
    for (let i = 0; i < this.n; i++) {
      const t = this.pool[i];
      if (t.a <= .01) continue;
      // what it names is off screen: no tag
      if (t.ax !== undefined && (t.ax < -20 || t.ay < -20 || t.ax > W + 20 || t.ay > H + 20)) continue;
      // keep on screen
      if (t.x + t.w > W - 8) t.x = W - 8 - t.w;
      if (t.x < 8) t.x = 8;
      if (t.y < 6) t.y = 6;
      L.push(t);
    }
    L.sort(byPri);
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const t = L[i], x0 = t.x, y0 = t.y;
      t.skip = false;
      if (place(L, i, t, obst, W, H)) continue;
      // no room where it wanted to be: try the other side of what it names, then leave it out (the thing keeps its mark)
      if (t.ax !== undefined) {
        t.x = Math.max(8, Math.min(W - 8 - t.w, t.ax - (x0 - t.ax) - t.w)); t.y = y0;
        if (place(L, i, t, obst, W, H)) continue;
      }
      t.skip = true;
    }
    const ctx = ov.ctx;
    for (let i = n - 1; i >= 0; i--) {
      const t = L[i];
      if (t.skip || t.y < -40 || t.y > H + 40) continue;
      if (t.lead && t.ax !== undefined) {
        // from the tag's nearest bottom corner to what it names
        const lx = t.ax > t.x + t.w * .5 ? t.x + t.w + 3 : t.x - 3, ly = t.ay < t.y ? t.y : t.y + t.h;
        if (Math.hypot(lx - t.ax, ly - t.ay) > 6) ov.leader(t.ax, t.ay, lx, ly, t.leadCol || (t.kind === 'coral' ? 'rgba(255,150,120,.9)' : t.kind === 'lime' ? LIME : 'rgba(238,238,228,.85)'), .75 * t.a);
      }
      ov.tag(t.x, t.y, t.id, t.label, t.value, { kind: t.kind, a: t.a, size: t.size, valCol: t.valCol });
      if (t.bars) drawBars(ctx, t.x, t.y + t.h + 4, t.bars, t.a);
    }
  }
}

/* stack tag i (t) clear of the panels and of the tags placed before it -> placed? */
function place(L, i, t, obst, W, H) {
  const hh = t.h + (t.bars ? t.bars.h + 4 : 0);
  let hit = null, moved = 0;
  for (let guard = 0; guard < 12; guard++) {
    hit = null;
    // out of the panels first: the nearest side of the panel that keeps it on screen
    if (obst) for (let k = 0; k < obst.length; k++) {
      const r = obst[k];
      if (t.x < r[2] && r[0] < t.x + t.w && t.y < r[3] && r[1] < t.y + hh) { escape(t, hh, r, W, H); moved++; hit = r; break; }
    }
    if (hit) { if (moved > 4) break; continue; }
    for (let j = 0; j < i; j++) {
      const p = L[j]; if (p.skip) continue;
      const ph = p.h + (p.bars ? p.bars.h + 4 : 0);
      if (t.x < p.x + p.w + 6 && p.x < t.x + t.w + 6 && t.y < p.y + ph + 3 && p.y < t.y + hh + 3) { hit = p; break; }
    }
    if (!hit) break;
    t.y = hit.y - hh - 4;
    if (t.y < 4) break;
  }
  if (hit || t.y < 2) return false;
  if (t.ay === undefined || t.far) return true;
  const nx = Math.max(t.x, Math.min(t.x + t.w, t.ax)), ny = Math.max(t.y, Math.min(t.y + hh, t.ay));
  return Math.hypot(t.ax - nx, t.ay - ny) < 200;
}

/* move a tag (w x hh at t.x, t.y) out of rect r by the shortest way that stays on screen */
function escape(t, hh, r, W, H) {
  const c = [[t.x, r[1] - hh - 4], [t.x, r[3] + 4], [r[0] - t.w - 6, t.y], [r[2] + 6, t.y]];
  let best = -1, bd = 1e18;
  for (let i = 0; i < 4; i++) {
    const x = c[i][0], y = c[i][1];
    if (x < 4 || y < 4 || x + t.w > W - 4 || y + hh > H - 4) continue;
    const d = (x - t.x) * (x - t.x) + (y - t.y) * (y - t.y);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) { t.y = -999; return; }
  t.x = c[best][0]; t.y = c[best][1];
}

/* the p5 class bars: rows of [label, bar, value]; bars = { rows: [[label, p], ...], top, h } */
const MONO = "'Geist Mono', Consolas, monospace";
export function drawBars(ctx, x, y, bars, a) {
  const rows = bars.rows, n = rows.length, rh = 12, px = 9;
  const wL = bars.wL || 62, wB = 58, wV = 30, W = 9 + wL + 8 + wB + 8 + wV + 8;
  x = Math.round(x); y = Math.round(y);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(11,12,10,.74)';
  ctx.fillRect(x, y, W, n * rh + 12);
  ctx.font = `400 ${px}px ${MONO}`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const [lab, p] = rows[i], top = i === bars.top, yy = y + 6 + i * rh + rh / 2;
    ctx.fillStyle = top ? '#FFFFFF' : 'rgba(255,255,255,.55)';
    txt(ctx, lab, x + 9, yy);
    const bx = x + 9 + wL + 8;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(bx, yy - 2, wB, 4);
    ctx.fillStyle = top ? LIME : 'rgba(255,255,255,.75)'; ctx.fillRect(bx, yy - 2, Math.round(wB * sat(p)), 4);
    ctx.fillStyle = top ? LIME : 'rgba(255,255,255,.75)';
    ctx.textAlign = 'right'; txt(ctx, p.toFixed(2), bx + wB + 8 + wV, yy); ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}
function txt(ctx, s, x, y) {
  if ('letterSpacing' in ctx) { ctx.letterSpacing = '.45px'; ctx.fillText(s, x, y); ctx.letterSpacing = '0px'; }
  else ctx.fillText(s, x, y);
}
export { LIME, CORAL };
